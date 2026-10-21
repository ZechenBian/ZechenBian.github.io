// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 时间序列（预测）
 * 每个数据集的 gen(p, rng) 返回 { y, T, freq, season?, label, times?, truthMean?, meta }。
 * truthMean[t]：上帝视角的一步预测 E[y_t | 到 t−1 为止的信息]。能用可观测的过去精确算出时就用它
 * （meta.truthMeanInfo = "observed"）；只有知道隐藏状态才算得出时（混沌系统加了观测噪声），用隐藏状态
 * 算（meta.truthMeanInfo = "hidden"），这比任何只看观测的方法都多知道一些。
 * oracle(p) = { forecast(past, h), note, exact }：past 是从第 0 个开始、截至当前时刻（含）的全部观测。
 * 这个函数会被 toString() 拼进后台线程，所以必须自包含：真实行情也写在函数体里。 */
function QL_MLDATA_TS(QL) {
"use strict";
var add = QL.mlreg.add, R = String.raw, TAU = 2 * Math.PI;

function I(key, label, def, min, max, step, desc) { return { key: key, label: label, def: def, min: min, max: max, step: step || 1, type: "int", desc: desc || "" }; }
function N(key, label, def, min, max, step, desc) { return { key: key, label: label, def: def, min: min, max: max, step: step, type: "num", desc: desc || "" }; }
function S(key, label, def, options, desc) { return { key: key, label: label, def: def, options: options, type: "select", desc: desc || "" }; }
function LEN(def, min, max, step) { return I("T", "序列长度 T", def, min, max, step || 100, "一共多少个时间点；按时间顺序 60/20/20 分成训练、验证、测试"); }
function series(y, freq, label, o) { var D = { y: y, T: y.length, freq: freq, label: label }; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) D[k] = o[k]; return D; }
function lastOf(past, dflt) { return past.length ? past[past.length - 1] : dflt; }
/** 沿着 past 做前向递推的小工具。运行器在每个预测原点调用一次 forecast，每次的 past 是同一条序列更长的前缀；
 *  记住上一次算到哪里，下次接着算，避免 O(T²)。前缀对不上（开头、中间、上次的末尾任一处不同）就从头算。
 *  接着算和从头算做的是完全相同的浮点运算，结果逐位相同。 */
function prefixRunner(init, step) {
  var c = null;
  return function (past) {
    var L = past.length, st, i0 = 0;
    if (c && c.n > 0 && L >= c.n && past[0] === c.first && past[c.n - 1] === c.last && past[c.n >> 1] === c.mid) { st = c.st.slice(); i0 = c.n; }
    else st = init();
    for (var i = i0; i < L; i++) step(st, past[i]);
    c = { n: L, st: st.slice(), first: past[0], last: past[L - 1], mid: past[L >> 1] };
    return st;
  };
}
/** 标准化到方差 1 的噪声 */
function noiseFn(dist, rng) {
  if (dist === "t3") return function () { return rng.t(3) / Math.sqrt(3); };
  if (dist === "t6") return function () { return rng.t(6) * Math.sqrt(4 / 6); };
  return function () { return rng.normal(); };
}
var COND_MEAN = R`**定理（条件期望最优，时间序列版）**：记 $\mathcal F_t$ 为 $y_0,\dots,y_t$ 生成的 $\sigma$-代数。对任何只用到 $y_0,\dots,y_t$ 的平方可积的预测 $g$，$\mathbb E\big[(y_{t+h}-g)^2\big]=\mathbb E\big[(y_{t+h}-\mathbb E[y_{t+h}\mid\mathcal F_t])^2\big]+\mathbb E\big[(\mathbb E[y_{t+h}\mid\mathcal F_t]-g)^2\big]$。证明：把 $y_{t+h}-g$ 拆成两段展开；$g$ 和 $\mathbb E[y_{t+h}\mid\mathcal F_t]$ 都是 $\mathcal F_t$ 可测的，交叉项在 $\mathcal F_t$ 上取条件期望后为零。`;

/* ================================================================== *
 *  随机游走
 * ================================================================== */
add({
  id: "random_walk", family: "timeseries", kind: "forecast", name: "随机游走", summary: "鞅：明天的最好预测就是今天",
  params: [
    LEN(1000, 100, 20000),
    N("drift", "漂移 μ", 0, -0.5, 0.5, 0.01, "每步的平均增量"),
    N("sigma", "每步的标准差 σ", 1, 0.1, 5, 0.1),
    S("dist", "增量的分布", "normal", [["normal", "正态"], ["t3", "Student-t，3 个自由度（厚尾，标准化到方差 1）"]])
  ],
  gen: function (p, rng) {
    var T = p.T, y = new Float64Array(T), m = new Float64Array(T), e = noiseFn(p.dist, rng);
    y[0] = p.sigma * e(); m[0] = 0;
    for (var t = 1; t < T; t++) { m[t] = y[t - 1] + p.drift; y[t] = m[t] + p.sigma * e(); }
    return series(y, "step", "随机游走", { truthMean: m, meta: { truthMeanInfo: "observed" } });
  },
  oracle: function (p) {
    return { exact: true, note: "E[y_{t+h} | 过去] = y_t + hμ（μ = 0 时就是朴素预测）", forecast: function (past, h) {
      var out = new Float64Array(h), y = lastOf(past, 0);
      for (var j = 0; j < h; j++) out[j] = y + (j + 1) * p.drift;
      return out;
    } };
  },
  bayes: function (p) { return { metric: "mse", value: p.sigma * p.sigma, note: "一步预测的最小均方误差 σ²（h 步是 hσ²）" }; },
  plot: "series",
  docs: R`**是什么**：随机游走：每一步在上一步的基础上加一个独立的随机增量。有效市场假说下的对数价格、布朗运动的离散版本都是它。

**生成方式**：$y_0=\sigma\varepsilon_0$，$y_t=y_{t-1}+\mu+\sigma\varepsilon_t$；$\varepsilon_t$ 独立同分布，均值 0、方差 1（正态，或者标准化到方差 1 的 3 个自由度的 Student-t：方差有限，四阶矩无穷）。

${COND_MEAN}

这里增量与过去独立，所以 $\mathbb E[y_{t+h}\mid\mathcal F_t]=y_t+h\mu$。$\mu=0$ 时 $y$ 是鞅（$\mathbb E[y_{t+1}\mid\mathcal F_t]=y_t$）：**"明天 = 今天"这个最朴素的预测，就是所有方法里均方误差最小的**，一步误差 $\sigma^2$，$h$ 步误差 $h\sigma^2$。对绝对误差，最优的是条件中位数；增量的分布对称时它也等于 $y_t+h\mu$。

**该看什么**：任何模型在测试段上"赢了"朴素预测，都只能是运气或者偷看了未来；用 Diebold–Mariano 检验看差别是否显著。$\mu=0$ 时 MASE（以训练段上朴素预测的平均绝对误差为分母，Hyndman & Koehler 2006）的理论最好值约为 1。复杂模型（树、神经网络）的典型表现是：在训练段上拟合出"规律"，到验证段就不如朴素预测。Meese 和 Rogoff（1983）在汇率上发现的正是这件事：结构模型样本外打不过随机游走。

**参考**：R. J. Hyndman, A. B. Koehler, *Int. J. Forecasting* 22(4), 679–688 (2006)；R. Meese, K. Rogoff, *J. Int. Econ.* 14, 3–24 (1983)；F. X. Diebold, R. S. Mariano, *J. Bus. Econ. Stat.* 13(3), 253–263 (1995)。`
});

/* ================================================================== *
 *  AR(2)
 * ================================================================== */
/** 实际使用的系数：逆根的模超过 0.995 时把两个逆根同比缩到 0.995（φ₁ → rφ₁，φ₂ → r²φ₂） */
function arEff(p) {
  var f1 = p.phi1, f2 = p.phi2, disc = f1 * f1 + 4 * f2, mod;
  if (disc >= 0) { var sq = Math.sqrt(disc); mod = Math.max(Math.abs((f1 + sq) / 2), Math.abs((f1 - sq) / 2)); }
  else mod = Math.sqrt(-f2);
  var r = mod > 0.995 ? 0.995 / mod : 1;
  return { f1: f1 * r, f2: f2 * r * r, r: r, mod: mod * r, complex: disc < 0, c: p.mu * (1 - f1 * r - f2 * r * r) };
}
add({
  id: "ar2", family: "timeseries", kind: "forecast", name: "AR(2) 自回归", summary: "两个滞后的线性递推：平稳三角形、准周期",
  params: [
    LEN(1000, 100, 20000),
    N("phi1", "φ₁", 0.5, -2, 2, 0.01),
    N("phi2", "φ₂", -0.3, -1, 1, 0.01, "平稳要求 φ₁ + φ₂ < 1、φ₂ − φ₁ < 1、|φ₂| < 1；落在外面时自动把特征根缩回单位圆内"),
    N("mu", "均值 μ", 0, -10, 10, 0.1),
    N("sigma", "噪声标准差 σ", 1, 0.1, 5, 0.1)
  ],
  gen: function (p, rng) {
    var A = arEff(p), T = p.T, y = new Float64Array(T), m = new Float64Array(T), s = p.sigma, mu = p.mu;
    // 开头两个值从平稳分布里抽：方差 γ₀，相邻相关 ρ₁
    var g0 = s * s * (1 - A.f2) / ((1 + A.f2) * ((1 - A.f2) * (1 - A.f2) - A.f1 * A.f1)), r1 = A.f1 / (1 - A.f2);
    m[0] = mu; y[0] = mu + Math.sqrt(g0) * rng.normal();
    if (T > 1) { m[1] = mu + r1 * (y[0] - mu); y[1] = m[1] + Math.sqrt(g0 * Math.max(0, 1 - r1 * r1)) * rng.normal(); }
    for (var t = 2; t < T; t++) { m[t] = A.c + A.f1 * y[t - 1] + A.f2 * y[t - 2]; y[t] = m[t] + s * rng.normal(); }
    return series(y, "step", "AR(2)", { truthMean: m, meta: { truthMeanInfo: "observed", phi1: A.f1, phi2: A.f2, shrunk: A.r < 1 ? A.r : null, rootModulus: A.mod, gamma0: g0 } });
  },
  oracle: function (p) {
    var A = arEff(p), r1 = A.f1 / (1 - A.f2);
    return { exact: true, note: "E[y_{t+1} | 过去] = c + φ₁y_t + φ₂y_{t−1}，多步按同一个递推代回预测值", forecast: function (past, h) {
      var out = new Float64Array(h), L = past.length, a, b, j;
      if (!L) { for (j = 0; j < h; j++) out[j] = p.mu; return out; }
      a = past[L - 1];
      // 只有一个观测时，第一步用 E[y₁ | y₀] = μ + ρ₁(y₀ − μ)；之后的递推照常（塔性质）
      if (L === 1) { out[0] = p.mu + r1 * (a - p.mu); b = a; a = out[0]; j = 1; }
      else { b = past[L - 2]; j = 0; }
      for (; j < h; j++) { var v = A.c + A.f1 * a + A.f2 * b; out[j] = v; b = a; a = v; }
      return out;
    } };
  },
  bayes: function (p) { return { metric: "mse", value: p.sigma * p.sigma, note: "一步预测的最小均方误差 σ²" }; },
  plot: "series",
  docs: R`**是什么**：二阶自回归 AR(2)：今天的值是前两天的线性组合加噪声。最简单的能产生"准周期"的线性模型（策略实验室里的"带噪谐振子"世界就是它）。

**生成方式**：$y_t=c+\varphi_1y_{t-1}+\varphi_2y_{t-2}+\sigma\varepsilon_t$，$c=\mu(1-\varphi_1-\varphi_2)$，$\varepsilon_t\sim N(0,1)$ 独立；开头两个值从平稳分布里抽，所以整条序列从第一个点起就是平稳的。

**定理（平稳三角形）**：AR(2) 有因果的平稳解，当且仅当特征多项式 $1-\varphi_1z-\varphi_2z^2$ 的两个根都在单位圆外，当且仅当

$$\varphi_1+\varphi_2<1,\qquad\varphi_2-\varphi_1<1,\qquad|\varphi_2|<1.$$

证明：两个根在单位圆外，等价于"逆根" $\lambda_{1,2}$（$P(\lambda)=\lambda^2-\varphi_1\lambda-\varphi_2$ 的根）的模都小于 1。注意 $\lambda_1\lambda_2=-\varphi_2$，$P(1)=1-\varphi_1-\varphi_2$，$P(-1)=1+\varphi_1-\varphi_2$。必要性：$|\varphi_2|=|\lambda_1\lambda_2|<1$；$P(\pm1)=(\pm1-\lambda_1)(\pm1-\lambda_2)>0$（实根时两个因子同号，共轭复根时它等于 $|\pm1-\lambda_1|^2$）。充分性：共轭复根时 $|\lambda|^2=\lambda_1\lambda_2=-\varphi_2<1$；实根时，$P(1)>0$、$P(-1)>0$ 说明 $\pm1$ 都不在 $[\lambda_1,\lambda_2]$ 里，于是两根要么都在 $(-1,1)$ 内，要么都大于 1，要么都小于 $-1$，后两种情形 $|\lambda_1\lambda_2|>1$，与 $|\varphi_2|<1$ 矛盾。逆根在圆内时 $y_t-\mu=\sum_{j\ge0}\psi_j\sigma\varepsilon_{t-j}$，$\psi_j$ 按 $\max_i|\lambda_i|^j$ 衰减，级数收敛。参数落在三角形外时，这里把两个逆根同比缩到模 0.995（$\varphi_1\to r\varphi_1$，$\varphi_2\to r^2\varphi_2$），元数据里记下缩放比例 $r$。

**性质**：自相关满足 Yule–Walker 方程 $\rho_1=\frac{\varphi_1}{1-\varphi_2}$，$\rho_k=\varphi_1\rho_{k-1}+\varphi_2\rho_{k-2}$；方差 $\gamma_0=\frac{(1-\varphi_2)\,\sigma^2}{(1+\varphi_2)\big((1-\varphi_2)^2-\varphi_1^2\big)}$。复根（$\varphi_1^2+4\varphi_2<0$）时自相关是衰减的余弦，准周期 $2\pi/\theta$，$\cos\theta=\frac{\varphi_1}{2\sqrt{-\varphi_2}}$。

**最优预测**：$\mathbb E[y_{t+1}\mid\mathcal F_t]=c+\varphi_1y_t+\varphi_2y_{t-1}$，一步均方误差 $\sigma^2$；多步按同一个递推把预测值代回去，$h$ 步误差 $\sigma^2\sum_{j<h}\psi_j^2$。

**该看什么**：对两个滞后做最小二乘的 AR(2) 就是正确设定，样本多了会逼近 oracle；更复杂的模型只增加估计噪声。逆根的模接近 1 时序列很"粘"，朴素预测在一步上也不差，但多步预测里均值回复的部分只有 AR 模型抓得住。

**参考**：P. J. Brockwell, R. A. Davis,《Time Series: Theory and Methods》第 2 版，第 3 章（Springer, 1991）；G. E. P. Box, G. M. Jenkins,《Time Series Analysis: Forecasting and Control》（1970）。`
});

/* ================================================================== *
 *  趋势 + 季节 + AR(1) 噪声
 * ================================================================== */
function seasonPattern(p) {
  var m = p.m, s = new Float64Array(m);
  for (var j = 0; j < m; j++) s[j] = p.shape === "spike" ? p.A * ((j === m - 1 ? 1 : 0) - 1 / m) : p.A * Math.sin(TAU * j / m);
  return s;
}
var SEASON_LEVEL = 10;
add({
  id: "seasonal", family: "timeseries", kind: "forecast", name: "趋势与季节", summary: "线性趋势 + 周期为 m 的季节项 + AR(1) 噪声",
  params: [
    LEN(480, 48, 20000, 12),
    I("m", "季节周期 m", 12, 2, 52, 1, "12 = 月度数据的一年，7 = 日数据的一周"),
    N("b", "趋势（每步）b", 0.02, -0.2, 0.2, 0.005),
    N("A", "季节幅度 A", 2, 0, 10, 0.1),
    S("shape", "季节形状", "sin", [["sin", "正弦"], ["spike", "尖峰（每周期最后一步冲高）"]]),
    N("phi", "噪声的自相关 φ", 0.5, -0.95, 0.95, 0.05),
    N("sigma", "噪声标准差 σ", 1, 0.1, 5, 0.1)
  ],
  gen: function (p, rng) {
    var T = p.T, m = p.m, s = seasonPattern(p), y = new Float64Array(T), mt = new Float64Array(T), u = p.sigma / Math.sqrt(1 - p.phi * p.phi) * rng.normal();
    for (var t = 0; t < T; t++) {
      var det = SEASON_LEVEL + p.b * t + s[t % m];
      if (t > 0) { var uPrev = y[t - 1] - (SEASON_LEVEL + p.b * (t - 1) + s[(t - 1) % m]); mt[t] = det + p.phi * uPrev; u = p.phi * uPrev + p.sigma * rng.normal(); }
      else mt[0] = det;
      y[t] = det + u;
    }
    return series(y, m === 12 ? "month" : m === 7 ? "day" : "step", "趋势 + 季节", { season: m, truthMean: mt, meta: { truthMeanInfo: "observed", level: SEASON_LEVEL, pattern: s } });
  },
  oracle: function (p) {
    var s = seasonPattern(p), m = p.m;
    function det(t) { return SEASON_LEVEL + p.b * t + s[((t % m) + m) % m]; }
    return { exact: true, note: "确定性部分已知：E[y_{t+h} | 过去] = a + b(t+h) + s_{(t+h) mod m} + φʰ·u_t", forecast: function (past, h) {
      var out = new Float64Array(h), t = past.length - 1, u = t >= 0 ? past[t] - det(t) : 0, f = 1;
      for (var j = 0; j < h; j++) { f *= p.phi; out[j] = det(t + 1 + j) + (t >= 0 ? f * u : 0); }
      return out;
    } };
  },
  bayes: function (p) { return { metric: "mse", value: p.sigma * p.sigma, note: "一步预测的最小均方误差 σ²" }; },
  plot: "series",
  docs: R`**是什么**：趋势 + 季节 + 有自相关的噪声，是销量、用电、客流这类业务序列最常见的样子。

**生成方式**：$y_t=a+bt+s_{t\bmod m}+u_t$，$a=10$；$u_t=\varphi u_{t-1}+\sigma\varepsilon_t$（AR(1)，从平稳分布开始）。季节项二选一，都满足 $\sum_{j=0}^{m-1}s_j=0$：正弦 $s_j=A\sin(2\pi j/m)$；尖峰 $s_j=A\big(\mathbf 1[j=m-1]-\tfrac1m\big)$（每个周期的最后一步冲高，像年底的促销）。

**最优预测**：确定性部分全知道，未知的只有 $u$：$\mathbb E[y_{t+h}\mid\mathcal F_t]=a+b(t+h)+s_{(t+h)\bmod m}+\varphi^hu_t$，其中 $u_t=y_t-a-bt-s_{t\bmod m}$；一步均方误差 $\sigma^2$，$h\to\infty$ 时趋于 $\frac{\sigma^2}{1-\varphi^2}$。

**事实（树不会外推）**：回归树、随机森林和 k 近邻的预测值都是训练目标的加权平均（权重非负、和为 1），所以永远落在训练目标的最小值和最大值之间。有趋势时，测试段的值在训练段的范围之外，这些模型系统性地偏低（$b>0$ 时）。先去掉趋势（差分，或者对时间做线性回归），再让它们学残差就好了。

**该看什么**：季节朴素预测 $\hat y_{t+h}=y_{t+h-m\lceil h/m\rceil}$ 是这里该打败的基线；Holt–Winters 指数平滑、季节差分 $(1-B)(1-B^m)$ 再加 ARMA、STL 分解都合适。

**参考**：R. J. Hyndman, G. Athanasopoulos,《Forecasting: Principles and Practice》第 3 版（OTexts, 2021）；P. R. Winters, Forecasting sales by exponentially weighted moving averages, *Management Science* 6(3), 324–342 (1960)。`
});

/* ================================================================== *
 *  两状态马尔可夫机制切换
 * ================================================================== */
function regimeModel(p) {
  var q0 = Math.min(1, 1 / p.dur0), q1 = Math.min(1, 1 / p.dur1);
  return { q0: q0, q1: q1, pi1: q0 / (q0 + q1), lam: 1 - q0 - q1, mu0: p.mu0, mu1: p.mu1, s0: p.sd0, s1: p.sd1 };
}
/** 一步前向滤波：pred = P(s_t = 1 | y_{<t}) → 看到 y_t 之后的 filt = P(s_t = 1 | y_{≤t}) */
function regimeUpdate(M, pred, y) {
  var a = (y - M.mu0) / M.s0, b = (y - M.mu1) / M.s1, l0 = -0.5 * a * a - Math.log(M.s0), l1 = -0.5 * b * b - Math.log(M.s1), mx = Math.max(l0, l1);
  var w0 = (1 - pred) * Math.exp(l0 - mx), w1 = pred * Math.exp(l1 - mx);
  return w1 / (w0 + w1);
}
function regimePredict(M, filt) { return filt * (1 - M.q1) + (1 - filt) * M.q0; }
add({
  id: "regime", family: "timeseries", kind: "forecast", name: "机制切换（隐马尔可夫）", summary: "看不见的两个状态来回切换，各有自己的均值和波动",
  params: [
    LEN(2000, 200, 20000),
    N("mu0", "状态 0 的均值", 0.5, -3, 3, 0.05), N("sd0", "状态 0 的标准差", 0.8, 0.05, 5, 0.05),
    N("mu1", "状态 1 的均值", -0.5, -3, 3, 0.05), N("sd1", "状态 1 的标准差", 1.6, 0.05, 5, 0.05),
    N("dur0", "状态 0 的平均持续步数", 60, 2, 1000, 1), N("dur1", "状态 1 的平均持续步数", 30, 2, 1000, 1)
  ],
  gen: function (p, rng) {
    var M = regimeModel(p), T = p.T, y = new Float64Array(T), m = new Float64Array(T), st = new Uint8Array(T), fp = new Float64Array(T);
    var s = rng.u() < M.pi1 ? 1 : 0, pred = M.pi1;
    for (var t = 0; t < T; t++) {
      st[t] = s;
      y[t] = s ? M.mu1 + M.s1 * rng.normal() : M.mu0 + M.s0 * rng.normal();
      m[t] = M.mu0 + (M.mu1 - M.mu0) * pred;           // E[y_t | y_{<t}]：滤波的一步预测
      fp[t] = regimeUpdate(M, pred, y[t]); pred = regimePredict(M, fp[t]);
      if (rng.u() < (s ? M.q1 : M.q0)) s = 1 - s;
    }
    return series(y, "step", "机制切换", { truthMean: m, meta: { truthMeanInfo: "observed", state: st, filtProb: fp, stationary1: M.pi1 } });
  },
  oracle: function (p) {
    var M = regimeModel(p), run = prefixRunner(function () { return [M.pi1, M.pi1]; }, function (st, y) { st[1] = regimeUpdate(M, st[0], y); st[0] = regimePredict(M, st[1]); });
    return { exact: true, note: "用真实参数做隐马尔可夫前向滤波：E[y_{t+h} | 过去] = μ̄ + λʰ(Σᵢ αₜ(i)μᵢ − μ̄)", forecast: function (past, h) {
      var out = new Float64Array(h), f = past.length ? run(past)[1] : M.pi1, lj = 1;
      for (var j = 0; j < h; j++) { lj *= M.lam; var p1 = past.length ? M.pi1 + lj * (f - M.pi1) : M.pi1; out[j] = M.mu0 + (M.mu1 - M.mu0) * p1; }
      return out;
    } };
  },
  plot: "series",
  docs: R`**是什么**：两状态的马尔可夫机制切换（Hamilton 1989）：一个看不见的状态在两种"市况"之间切换，每个状态下观测的均值和波动不同。策略实验室的"牛熊机制切换"世界就是它的收益版本。

**生成方式**：$s_t\in\{0,1\}$ 是马尔可夫链，离开状态 $i$ 的概率是 $q_i=1/D_i$（$D_i$ 是平均持续步数），$s_0$ 取平稳分布，$\pi_1=\frac{q_0}{q_0+q_1}$；$y_t\mid s_t\sim N(\mu_{s_t},\sigma_{s_t}^2)$。

**最优预测（隐马尔可夫的前向滤波）**：记 $\alpha_t(i)=P(s_t=i\mid y_0,\dots,y_t)$，递推 $\alpha_t(i)\propto\varphi(y_t;\mu_i,\sigma_i)\sum_j\alpha_{t-1}(j)P_{ji}$，$\varphi(\cdot;\mu,\sigma)$ 是正态密度。两状态转移矩阵的第二个特征值是 $\lambda=1-q_0-q_1$，并且 $P^h=\mathbf 1\pi^\top+\lambda^h(I-\mathbf 1\pi^\top)$，所以

$$\mathbb E[y_{t+h}\mid\mathcal F_t]=\bar\mu+\lambda^h\Big(\sum_i\alpha_t(i)\mu_i-\bar\mu\Big),\qquad\bar\mu=\pi_0\mu_0+\pi_1\mu_1.$$

oracle 就是用真实参数做的这个滤波；truthMean 是同一个滤波的一步预测 $\mathbb E[y_t\mid y_0,\dots,y_{t-1}]$。元数据里还有真实的状态和滤波概率，可以画在一起对比。

**该看什么**：可预测的部分只来自"现在大概处在哪个状态"。线性 AR 模型能抓住一部分：对 $k\ge1$，$\operatorname{Cov}(y_t,y_{t+k})=\pi_0\pi_1(\mu_1-\mu_0)^2\lambda^k$，按 $\lambda^k$ 衰减，与 ARMA(1,1) 的自协方差同形，所以最好的线性预测是一个 ARMA(1,1)。两个状态的波动不同时，最近几步波动的大小本身也泄露状态，只用均值的线性模型用不上这条信息，非线性模型可以。状态持续得越久、两个均值相差越远，可预测的部分越多。

**参考**：J. D. Hamilton, A new approach to the economic analysis of nonstationary time series and the business cycle, *Econometrica* 57(2), 357–384 (1989)；L. R. Rabiner, A tutorial on hidden Markov models, *Proc. IEEE* 77(2), 257–286 (1989)。`
});

/* ================================================================== *
 *  Logistic 映射
 * ================================================================== */
add({
  id: "logistic_map", family: "timeseries", kind: "forecast", name: "Logistic 映射（混沌）", summary: "x ← r·x(1 − x)：一步可以预测，几步之后不行",
  params: [
    LEN(1000, 100, 20000),
    N("r", "参数 r", 4, 3.5, 4, 0.001, "3.5699… 之后以混沌为主，中间夹着周期窗口（如 r ≈ 3.83 的周期 3）"),
    N("noise", "观测噪声 τ", 0.01, 0, 0.2, 0.001)
  ],
  gen: function (p, rng) {
    var T = p.T, r = p.r, y = new Float64Array(T), m = new Float64Array(T), hid = new Float64Array(T), x = 0.1 + 0.8 * rng.u(), i;
    function step(v) { v = r * v * (1 - v); return v > 1e-12 && v < 1 ? v : 0.1 + 0.8 * rng.u(); }   // 浮点轨道偶尔塌到 0：重新撒一个初值
    for (i = 0; i < 100; i++) x = step(x);
    for (var t = 0; t < T; t++) {
      hid[t] = x; y[t] = x + (p.noise > 0 ? p.noise * rng.normal() : 0);
      m[t] = t ? r * hid[t - 1] * (1 - hid[t - 1]) : 0.5;
      x = step(x);
    }
    return series(y, "step", "x（加观测噪声）", { truthMean: m, meta: { truthMeanInfo: p.noise > 0 ? "hidden" : "observed", hidden: hid, lyapunov: r === 4 ? Math.LN2 : null } });
  },
  oracle: function (p) {
    return { exact: !(p.noise > 0), note: p.noise > 0 ? "近似：知道方程，把最后一个观测当真值往前迭代（有观测噪声时精确的条件期望要做非线性滤波）" : "精确：知道方程，从最后一个观测往前迭代", forecast: function (past, h) {
      var out = new Float64Array(h), x = Math.min(1, Math.max(0, lastOf(past, 0.5)));
      for (var j = 0; j < h; j++) { x = p.r * x * (1 - x); out[j] = x; }
      return out;
    } };
  },
  bayes: function (p) { return p.noise > 0 ? { metric: "mse", value: p.noise * p.noise, note: "知道隐藏状态时一步预测的均方误差 τ²（只看观测的方法达不到）" } : { metric: "mse", value: 0, note: "无噪声：一步预测可以完全准确" }; },
  plot: "series",
  docs: R`**是什么**：Logistic 映射 $x_{t+1}=rx_t(1-x_t)$：一行公式产生的确定性混沌。一步之内完全可以预测，几步之后就无从预测。

**生成方式**：$x_0\sim U(0.1,0.9)$，先空转 100 步；观测 $y_t=x_t+\tau\eta_t$，$\eta_t\sim N(0,1)$ 独立。（浮点误差偶尔会让轨道塌到 0，那时重新撒一个初值。）

**$r=4$ 时的精确结论**：令 $x=\sin^2(\pi\theta)$，则 $4x(1-x)=4\sin^2(\pi\theta)\cos^2(\pi\theta)=\sin^2(2\pi\theta)$，即 $\theta\mapsto2\theta\bmod1$（倍增映射）。Lebesgue 测度在倍增映射下不变，推到 $x$ 上就是不变密度 $\rho(x)=\frac1{\pi\sqrt{x(1-x)}}$（反正弦分布，方差 $\tfrac18$）。

- **线性上是白噪声**：$x_t-\tfrac12=-\tfrac12\cos(2\pi\theta_t)$，所以 $\operatorname{Cov}(x_t,x_{t+k})=\tfrac14\int_0^1\cos(2\pi\theta)\cos(2^{k+1}\pi\theta)\,d\theta=0$（$k\ge1$，傅里叶模相互正交）：所有滞后的自相关都是 0，线性 AR 模型的最优预测就是均值。
- **Lyapunov 指数是 $\ln2$**：$\lambda=\int\ln|f'(x)|\,\rho(x)\,dx$，$f'(x)=4(1-2x)=4\cos(2\pi\theta)$，再用 $\int_0^1\ln|\cos2\pi\theta|\,d\theta=-\ln2$，得 $\lambda=\ln4-\ln2=\ln2$：初值的误差平均每步翻倍。

**可预测的时间**：一步的条件期望 $\mathbb E[x_{t+1}\mid x_t]=f(x_t)$ 是确定的；但观测误差 $\tau$ 经过 $h$ 步放大到约 $\tau\cdot2^h$，到 $x$ 的标准差 $\sqrt{1/8}\approx0.35$ 时就什么都不知道了，所以有效的预测步数约为 $\log_2(0.35/\tau)$（$\tau=0.01$ 时约 5 步）。$r<4$ 时有周期窗口（例如 $r\approx3.83$ 的周期 3），那里 Lyapunov 指数为负，长期也能预测；$r\approx3.5699$ 是倍周期分岔的极限（Feigenbaum 点）。

**oracle 和 truthMean**：oracle 知道方程，把最后一个观测当真值往前迭代；无噪声时它就是精确的条件期望，有噪声时只是近似（精确的条件期望要做非线性滤波），结果里会标出来。truthMean 是 $f(x_{t-1})$，即知道真实隐状态时的一步预测：上帝视角，比只看观测的人多知道一些。

**该看什么**：线性 AR 的一步 $R^2$ 约为 0；k 近邻、树、小网络、对滞后值做二次回归，一步就能接近 oracle。再看多步预测的误差随步数怎么涨：所有方法都在 $\log_2(0.35/\tau)$ 步上下塌掉。

**参考**：R. M. May, Simple mathematical models with very complicated dynamics, *Nature* 261, 459–467 (1976)；S. M. Ulam, J. von Neumann, On combination of stochastic and deterministic processes, *Bull. AMS* 53, 1120 (1947)。`
});

/* ================================================================== *
 *  洛伦兹系统
 * ================================================================== */
add({
  id: "lorenz", family: "timeseries", kind: "forecast", name: "洛伦兹系统（x 分量）", summary: "三维混沌只看一个坐标：延迟嵌入与可预测的时间",
  params: [
    LEN(2000, 200, 20000),
    N("dt", "采样间隔 Δt", 0.05, 0.01, 0.5, 0.01, "越大，相邻两个样本之间的关系越非线性"),
    N("noise", "观测噪声（标准差）", 0, 0, 2, 0.05, "x 本身的标准差约 7.9")
  ],
  gen: function (p, rng) {
    var T = p.T, h = 0.01, k = Math.max(1, Math.round(p.dt / h)), y = new Float64Array(T), hx = new Float64Array(T), hy = new Float64Array(T), hz = new Float64Array(T), m = new Float64Array(T), i;
    var x = 1 + rng.normal(), v = 1 + rng.normal(), z = 20 + 5 * rng.normal();
    function step() {
      var k1x = 10 * (v - x), k1y = x * (28 - z) - v, k1z = x * v - 8 / 3 * z;
      var x2 = x + 0.5 * h * k1x, y2 = v + 0.5 * h * k1y, z2 = z + 0.5 * h * k1z;
      var k2x = 10 * (y2 - x2), k2y = x2 * (28 - z2) - y2, k2z = x2 * y2 - 8 / 3 * z2;
      var x3 = x + 0.5 * h * k2x, y3 = v + 0.5 * h * k2y, z3 = z + 0.5 * h * k2z;
      var k3x = 10 * (y3 - x3), k3y = x3 * (28 - z3) - y3, k3z = x3 * y3 - 8 / 3 * z3;
      var x4 = x + h * k3x, y4 = v + h * k3y, z4 = z + h * k3z;
      var k4x = 10 * (y4 - x4), k4y = x4 * (28 - z4) - y4, k4z = x4 * y4 - 8 / 3 * z4;
      x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y); z += h / 6 * (k1z + 2 * k2z + 2 * k3z + k4z);
    }
    for (i = 0; i < 1000; i++) step();          // 空转 10 个时间单位，落到吸引子上
    for (var t = 0; t < T; t++) {
      hx[t] = x; hy[t] = v; hz[t] = z; m[t] = x;
      y[t] = x + (p.noise > 0 ? p.noise * rng.normal() : 0);
      for (i = 0; i < k; i++) step();
    }
    return series(y, "step", "x", { truthMean: m, meta: { truthMeanInfo: p.noise > 0 ? "hidden" : "observed", hidden: { x: hx, y: hy, z: hz }, dt: k * h, lyapunov: 0.906 } });
  },
  plot: "series",
  docs: R`**是什么**：Lorenz（1963）的对流模型：三维常微分方程里最著名的奇怪吸引子。这里只能观测 $x$ 一个分量。

**生成方式**：$\dot x=10(y-x)$，$\dot y=x(28-z)-y$，$\dot z=xy-\tfrac83z$。定步长 $h=0.01$ 的四阶龙格–库塔（局部误差 $O(h^5)$，整体 $O(h^4)$）；随机初值先空转 10 个时间单位落到吸引子上，然后每隔 $\Delta t$ 记一次 $x$，再加观测噪声。

**已知的性质**：最大 Lyapunov 指数约 0.906（每单位时间），即误差每过约 $1/0.906\approx1.1$ 个时间单位放大 $e$ 倍；吸引子的 Kaplan–Yorke 维数约 2.06。

**Takens 嵌入定理**（1981）：设 $M$ 是 $m$ 维紧流形。对一般的（generic）一对 $C^2$ 微分同胚 $\phi:M\to M$ 与 $C^2$ 观测函数 $h:M\to\mathbb R$，延迟映射 $p\mapsto\big(h(p),h(\phi(p)),\dots,h(\phi^{2m}(p))\big)$ 是一个嵌入。Sauer–Yorke–Casdagli（1991）把它推广到盒维数为 $d$ 的紧不变集：在关于周期轨道的技术条件下，对"几乎所有"（prevalent）的观测函数，$k>2d$ 个延迟坐标就足以与吸引子上的点一一对应。洛伦兹吸引子 $2d\approx4.1$，所以 5 个滞后一定够，实践中 3 个常常就行。所以"几个滞后值 + 非线性回归"在原则上能重构状态并做预测。

**为什么没有 oracle**：只看 $x$ 的历史时，精确的条件期望要先从历史里重构出 $(x,y,z)$，没有闭式。truthMean 是无噪声的 $x_t$：知道全部状态时一步预测没有误差，剩下的只有观测噪声（上帝视角）。

**该看什么**：滞后特征加 k 近邻（Farmer–Sidorowich 1987 的"类比法"）、小 MLP、储备池计算（Pathak 等 2018）都比线性 AR 好得多；采样间隔 $\Delta t$ 越大，相邻样本之间的关系越非线性。看多步误差：大约在 $1/0.906$ 的几倍时间之后，所有方法都只能猜均值。

**参考**：E. N. Lorenz, Deterministic nonperiodic flow, *J. Atmos. Sci.* 20, 130–141 (1963)；F. Takens, Detecting strange attractors in turbulence, *Lecture Notes in Math.* 898, 366–381 (1981)；T. Sauer, J. A. Yorke, M. Casdagli, Embedology, *J. Stat. Phys.* 65, 579–616 (1991)；J. D. Farmer, J. J. Sidorowich, Predicting chaotic time series, *Phys. Rev. Lett.* 59, 845–848 (1987)；J. Pathak et al., *Phys. Rev. Lett.* 120, 024102 (2018)。`
});

/* ================================================================== *
 *  Mackey–Glass 延迟方程
 * ================================================================== */
add({
  id: "mackey_glass", family: "timeseries", kind: "forecast", name: "Mackey–Glass 延迟方程", summary: "带延迟的生理调控方程：无穷维相空间里的有限维混沌",
  params: [
    LEN(1500, 200, 20000),
    I("tau", "延迟 τ", 17, 5, 30, 1, "17 是经典的混沌设定；越大越复杂"),
    N("dt", "采样间隔 Δ", 1, 0.5, 10, 0.5),
    N("noise", "观测噪声（标准差）", 0, 0, 0.1, 0.005, "x 本身的标准差约 0.23（τ = 17）")
  ],
  gen: function (p, rng) {
    var T = p.T, h = 0.1, D = Math.round(p.tau / h), k = Math.max(1, Math.round(p.dt / h)), L = D + 1, buf = new Float64Array(L), head = 0, i;
    var y = new Float64Array(T), m = new Float64Array(T), x0 = 0.5 + rng.u();
    for (i = 0; i < L; i++) buf[i] = x0;     // 常数初始历史
    // buf 是长度 D+1 的环：buf[head] 是当前值 x(t)，buf[(head+1) % L] 是 x(t − τ)
    function f(x, xd) { var q = xd * xd; q = q * q; q = q * q * xd * xd; return 0.2 * xd / (1 + q) - 0.1 * x; }   // xd^10
    function step() {
      var x = buf[head], d0 = buf[(head + 1) % L], d1 = buf[(head + 2) % L], dm = 0.5 * (d0 + d1);
      var k1 = f(x, d0), k2 = f(x + 0.5 * h * k1, dm), k3 = f(x + 0.5 * h * k2, dm), k4 = f(x + h * k3, d1);
      var nx = x + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      head = (head + 1) % L; buf[head] = nx;   // 覆盖掉最老的 x(t − τ)，它已经用不到了
    }
    for (i = 0; i < 5000; i++) step();        // 空转 500 个时间单位
    for (var t = 0; t < T; t++) {
      var x = buf[head]; m[t] = x;
      y[t] = x + (p.noise > 0 ? p.noise * rng.normal() : 0);
      for (i = 0; i < k; i++) step();
    }
    return series(y, "step", "x", { truthMean: m, meta: { truthMeanInfo: p.noise > 0 ? "hidden" : "observed", hidden: m, dt: k * h } });
  },
  plot: "series",
  docs: R`**是什么**：Mackey–Glass 延迟微分方程（1977），原本描述血细胞生成的反馈调控。延迟让它的相空间变成无穷维，但吸引子是有限维的混沌；它是时间序列预测（尤其是回声状态网络）最常用的基准之一。

**生成方式**：

$$\frac{dx}{dt}=\beta\,\frac{x(t-\tau)}{1+x(t-\tau)^{n}}-\gamma\,x(t),\qquad\beta=0.2,\ \gamma=0.1,\ n=10.$$

初始历史是常数 $x(t)=x_0$（$t\le0$，$x_0\sim U(0.5,1.5)$）；定步长 $h=0.1$ 的四阶龙格–库塔，延迟项在半步处取相邻两个格点的线性插值（所以整体是二阶精度，作为基准足够）；先空转 500 个时间单位，再每隔 $\Delta$ 记一次，加观测噪声。

**已知的性质**：系统的状态是整段历史 $x|_{[t-\tau,t]}$，即函数空间 $C([-\tau,0])$ 里的一个点。$\tau$ 小时解收敛到不动点或周期振荡；$\tau=17$ 时是低维混沌（Farmer 1982 估计吸引子维数约 2.1）；$\tau$ 越大维数越高（$\tau=30$ 时约 3.6），越难预测。Takens–Sauer–Yorke–Casdagli 的嵌入定理作用在这个有限维吸引子上，所以有限个滞后坐标仍然够用（见"洛伦兹系统"）。

**为什么没有 oracle**：与洛伦兹系统相同，精确的条件期望要从观测重构整段历史，没有闭式。truthMean 是无噪声的 $x_t$（上帝视角）。

**该看什么**：经典的设定是采样间隔 1、预测 6 步以后的值，特征用滞后 $(x_t,x_{t-6},x_{t-12},x_{t-18})$（Lapedes–Farber 1987）。回声状态网络在这个问题上把误差降低了几个数量级（Jaeger & Haas 2004）。

**参考**：M. C. Mackey, L. Glass, Oscillation and chaos in physiological control systems, *Science* 197, 287–289 (1977)；J. D. Farmer, Chaotic attractors of an infinite-dimensional dynamical system, *Physica D* 4, 366–393 (1982)；A. Lapedes, R. Farber, Nonlinear signal processing using neural networks, Los Alamos 技术报告 LA-UR-87-2662 (1987)；H. Jaeger, H. Haas, Harnessing nonlinearity, *Science* 304, 78–80 (2004)。`
});

/* ================================================================== *
 *  GARCH(1,1)：收益不可预测，波动可以
 * ================================================================== */
function garchModel(p) {
  var a = p.alpha, b = p.beta;
  if (a + b > 0.995) b = 0.995 - a;
  var kap = p.dist === "t6" ? 6 : 3, den = 1 - b * b - 2 * a * b - kap * a * a;
  return { a: a, b: b, v: p.vbar, w: p.vbar * (1 - a - b), kappa: kap, Es4: den > 0 ? p.vbar * p.vbar * (1 - (a + b) * (a + b)) / den : Infinity };
}
add({
  id: "garch_vol", family: "timeseries", kind: "forecast", name: "GARCH 波动", summary: "收益本身不可预测，平方收益（波动）可以",
  params: [
    LEN(2000, 200, 20000),
    S("target", "预测什么", "sq", [["sq", "平方收益 r²（波动）"], ["ret", "收益 r"]]),
    N("vbar", "长期方差 v̄（%²）", 1, 0.1, 10, 0.1),
    N("alpha", "α（对冲击的反应）", 0.1, 0, 0.3, 0.01),
    N("beta", "β（波动的惯性）", 0.85, 0, 0.98, 0.01, "α + β 超过 0.995 时 β 按 0.995 − α 算"),
    S("dist", "冲击的分布", "normal", [["normal", "正态"], ["t6", "Student-t，6 个自由度（标准化）"]])
  ],
  gen: function (p, rng) {
    var G = garchModel(p), T = p.T, y = new Float64Array(T), m = new Float64Array(T), sig2 = new Float64Array(T), e = noiseFn(p.dist, rng), s2 = G.v, sq = p.target === "sq";
    for (var t = 0; t < T; t++) {
      var r = Math.sqrt(s2) * e();
      sig2[t] = s2; y[t] = sq ? r * r : r; m[t] = sq ? s2 : 0;
      s2 = G.w + G.a * r * r + G.b * s2;
    }
    return series(y, "step", sq ? "平方收益（%²）" : "收益（%）", { truthMean: m, meta: { truthMeanInfo: "observed", sigma2: sig2, alpha: G.a, beta: G.b } });
  },
  oracle: function (p) {
    var G = garchModel(p), sq = p.target === "sq";
    // 状态 = σ²_{t+1}：从 σ₀² = v̄ 起，按观测到的 r²（目标是收益时先平方）递推；与生成时完全相同，所以是精确的
    var run = prefixRunner(function () { return [G.v]; }, function (st, y) { st[0] = G.w + G.a * (sq ? y : y * y) + G.b * st[0]; });
    return { exact: true, note: sq ? "E[r²_{t+h} | 过去] = v̄ + (α+β)^{h−1}(σ²_{t+1} − v̄)" : "收益的条件期望恒为 0", forecast: function (past, h) {
      var out = new Float64Array(h);
      if (!sq) return out;
      var s = past.length ? run(past)[0] : G.v, g = 1;
      for (var j = 0; j < h; j++) { out[j] = G.v + g * (s - G.v); g *= G.a + G.b; }
      return out;
    } };
  },
  bayes: function (p) {
    var G = garchModel(p);
    if (p.target !== "sq") return { metric: "mse", value: G.v, note: "收益不可预测：最小均方误差就是方差 v̄" };
    if (!isFinite(G.Es4)) return null;
    return { metric: "mse", value: (G.kappa - 1) * G.Es4, note: "一步预测平方收益的最小均方误差 (κ − 1)·E[σ⁴]（平稳分布下）" };
  },
  plot: "series",
  docs: R`**是什么**：GARCH(1,1)（Bollerslev 1986）：收益本身不可预测，但波动会聚集、可以预测。用来看"预测什么"有多重要：同一条序列，预测收益是徒劳的，预测平方收益（波动）却有实打实的信息。

**生成方式**：$r_t=\sigma_t\varepsilon_t$，$\sigma_{t+1}^2=\omega+\alpha r_t^2+\beta\sigma_t^2$，$\omega=\bar v(1-\alpha-\beta)$，$\sigma_0^2=\bar v$（长期方差）；$\varepsilon_t$ 独立，均值 0、方差 1（正态，或标准化的 6 个自由度的 Student-t）。$\alpha+\beta>0.995$ 时 $\beta$ 按 $0.995-\alpha$ 算。观测 $y_t=r_t^2$（"平方收益"）或 $y_t=r_t$（"收益"）。单位是百分比：$\bar v=1$ 即每步波动约 1%。

**最优预测**：$\sigma_{t+1}^2$ 由过去的收益递推得到，是可观测的。收益：$\mathbb E[r_{t+h}\mid\mathcal F_t]=0$，什么都预测不了。平方收益：$\mathbb E[r_{t+h}^2\mid\mathcal F_t]=\bar v+(\alpha+\beta)^{h-1}(\sigma_{t+1}^2-\bar v)$（$h\ge1$）。证明：$\mathbb E[r_{t+j}^2\mid\mathcal F_{t+j-1}]=\sigma_{t+j}^2$，$\mathbb E[\sigma_{t+j+1}^2\mid\mathcal F_{t+j-1}]=\omega+(\alpha+\beta)\sigma_{t+j}^2$，两边减去 $\bar v$ 就是公比为 $\alpha+\beta$ 的几何递推，再用塔性质。truthMean 就是 $\sigma_t^2$（或 0）。

**最小均方误差**（一步、平方收益）：$\mathbb E\big[(r_t^2-\sigma_t^2)^2\big]=(\kappa-1)\,\mathbb E[\sigma^4]$，$\kappa=\mathbb E\varepsilon^4$（正态为 3，这里的 t 分布为 6）；平稳时 $\mathbb E[\sigma^4]=\bar v^2\,\frac{1-(\alpha+\beta)^2}{1-\beta^2-2\alpha\beta-\kappa\alpha^2}$，只在分母为正时有限（四阶矩存在的条件，Bollerslev 1986）。分母不为正时平方收益的均方误差没有意义，应当改用 QLIKE 之类对极端值稳健的损失（Patton 2011）。

**该看什么**：对平方收益，用过去几期平方收益做特征的线性模型（ARCH 的思路）已经能拿到大部分信息；朴素预测（上一期的平方收益）噪声极大，长期均值反而是更好的基线。对收益，任何模型都应当输给"预测 0"。

**参考**：T. Bollerslev, Generalized autoregressive conditional heteroskedasticity, *J. Econometrics* 31, 307–327 (1986)；R. F. Engle, Autoregressive conditional heteroscedasticity, *Econometrica* 50(4), 987–1007 (1982)；A. J. Patton, Volatility forecast comparison using imperfect volatility proxies, *J. Econometrics* 160(1), 246–256 (2011)。`
});

/* ================================================================== *
 *  真实行情（来自策略实验室自带的 data/samples.json）
 * ================================================================== */
var REAL = {
  goog: { name: "GOOG 日线 2004–2008", ticker: "GOOG", daily: true, range: "2004-08-19 至 2008-10-14", d0: 12649, dd: "13111131111411131111311113111131111311113111131111311113111131111311231111311113111131114111131111311114111311113111131111311114111311113111131111311141111311113111131111311113111131111311113111141113111131111311113111141113111131111311113111131111311113111131111411131111311113111131111311113111131111311113111131111311231111311113111131111411141113111141113111131111311113111141113111131111311113111131111311113111411113111131111311113111131111411131111311113111131111321131111311113111131111311113111131111311114111311113111131111311113111131111311113111131111311113112311113111131111311114111511311114111311113111131111311114111311113111131111311113111131114111131111311113111131111311113111141113111131111311113111131213111131111311113111131111311113111131111411131111311113111131111311113111131111311113111131111311231111311113111131111321132113111131111411131111311113111141113111131111311113111411113111131111311113111131111311113111131111411131111311113111131111311141111311113111131111311113111131111311114111311113111131111311113111131",
    v: "100.34,108.31,109.4,104.87,106,107.91,106.15,102.01,102.37,100.25,101.51,100.01,101.58,102.3,102.31,105.33,107.5,111.49,112,113.97,117.49,119.36,117.84,118.38,120.82,119.83,118.26,126.86,131.08,129.6,132.58,135.06,138.37,137.08,138.85,137.73,135.26,137.4,140.9,142,144.11,149.16,147.94,140.49,149.38,172.43,187.4,181.8,185.97,193.3,190.64,196.03,194.87,191.67,184.7,169.35,172.55,168.7,167.86,183.02,182,184.87,172.54,172.5,167.54,169.4,165.1,167.52,174.76,179.39,181.05,181.98,179.96,179.4,180.4,176.29,171.43,169.98,173.43,171.65,170.45,178.69,179.78,176.47,180.08,185.02,183.75,186.3,187.9,191.91,192.76,192.9,197.6,192.79,202.71,194.5,193.51,188.55,193.85,195.06,193.54,195.38,195.33,199.97,203.9,197.3,193.92,188.28,180.72,177.12,189.24,188.08,190.34,195.62,191.9,205.96,210.86,204.36,196.03,198.64,191.58,187.98,187.4,192.99,195.23,198.41,197.9,197.95,191.37,193.95,188.89,185.87,187.99,186.06,185.18,187.01,185.9,188.81,185.2,181.35,179.98,177.8,174.99,178.61,175.6,179.29,180.04,180.88,178.6,178.98,179.25,181.42,179.57,180.45,180.51,180.04,185.29,188.57,189.22,193.76,192.05,193.23,193.96,192.93,191.45,185,186.97,191.4,198.1,204.22,215.81,223.53,218.75,219.78,219.45,220,222.29,226.19,228.5,226.98,228.02,226.02,227.8,231.29,228.72,229.24,231.05,233.13,239.16,239.18,241.61,255.45,256,260.81,259.2,266,277.27,288,287.9,280.26,290.94,293.12,279.56,286.31,282.5,282.75,278.35,274.8,277.44,280.3,286.7,287.84,289.3,289.71,297.25,304.1,302,292.72,294.15,291.25,295.71,291.52,295.54,296.23,293.35,291.78,298.86,300.89,301.19,299.54,309.9,312,313.94,302.4,295.85,296.09,296.93,293.5,287.76,291.61,299.19,297.3,297.73,292.35,291.25,291.57,285.68,284.05,289.72,284,285.65,285.1,279.99,280,274.01,279.58,282.57,282.59,283.58,288.45,287.27,286,286.25,288.45,287.11,294.87,295.39,299.09,309.74,311.68,303,302.62,300.2,303.79,307.91,311.9,311.37,315.36,314.28,313.94,306,309.62,316.46,318.68,311,310.71,312.75,312.99,310.65,306.1,300.97,297.44,296.14,305,303.28,308.7,303.2,339.9,348.65,346.91,355.44,353.06,358.17,372.14,379.38,379.68,385.95,390.43,395.03,389.9,379.15,391.1,390.4,396.97,392.8,398.15,403.45,400.21,409.36,416.47,422.86,428.62,423.48,403.54,404.91,414.09,417.7,405.85,404.54,404.22,410.65,409.2,412.61,417.49,418.96,422.55,430.15,424.6,429.74,426.33,432.04,430.93,424.64,426.69,420.15,414.86,435.23,445.24,451.24,465.66,466.9,469.76,471.63,463.63,466.25,467.11,444.91,436.45,399.46,427.5,443.03,433,434.27,433.49,426.82,432.66,401.78,396.04,381.55,385.1,367.92,369.08,358.77,362.61,345.7,343.32,342.38,366.46,368.75,366.59,365.49,378.07,377.4,390.38,362.62,364.8,376.45,378.18,368.1,364.45,353.88,343,337.5,337.06,351.16,344.5,338.77,339.79,348.19,339.92,340.22,341.89,365.8,369.69,377.2,394.98,388.44,390,389.7,404.34,407.99,411.18,406.16,416.38,409.66,408.95,402.16,406.82,404.24,410.5,415,437.1,440.5,427.16,425.97,420.03,417.94,398.9,394.8,394.17,394.75,394.3,394.78,408.8,402.98,387,374.13,376.2,371.3,374.5,370.99,370.02,370.95,375.58,381.25,382.99,381.35,371.94,371.82,382.62,379.44,374.44,389.99,386.51,393.3,386.57,381.54,386.52,384.39,391,390.7,388.14,387.17,402.13,399.95,404.86,404.22,402.32,406.11,417.81,419.33,423.2,421.46,423.19,420.45,418.2,424.56,417.25,408.83,403.5,407.89,403.05,399,387.12,390.11,390.9,389.36,385.5,382.4,388.12,386.6,375.51,367.23,375.39,373.85,377.95,381,376.94,374.2,368.5,369.43,380.97,387.72,385.8,383.36,377.3,378.29,373.43,373.73,373.26,380.95,378.95,380.75,378.53,378.6,384.36,380.14,378.49,377.85,384.09,391.9,406.57,403.98,409.88,414.69,403.81,397,406.85,403.78,403.98,406.87,402.92,403.58,401.9,401.44,404.04,415.7,411.81,420.5,429,426.65,426.5,427.44,427.3,421.75,420.64,419.31,426.06,459.67,480.78,473.31,486.6,485.1,475.2,476.57,476.39,467.5,469.91,471.8,476.95,472.57,475,472.63,473.55,481.03,489.3,491.93,495.9,498.79,495.05,509.65,508.01,505,484.75,489.5,484.65,484.81,480.8,484.85,487,488.71,482.64,484.11,483.93,481.78,478.99,482.12,480.3,462.8,468.63,462.9,456.2,455.58,457.53,468.03,462.56,460.48,467.59,483.26,487.19,483.58,485.5,489.46,499.72,505,504.28,497.28,487.83,489.75,480.84,479.05,499.07,488.09,495.84,492.47,494.32,501.5,481.75,481.5,467.16,471.48,470.01,471.03,461.89,458.29,459.1,465.93,461.47,469.94,472.1,475.86,475.85,470.62,464.93,448.77,449.45,448.23,438.68,440.95,457.55,455.64,454.72,452.96,454.75,443.03,448,446.19,440.85,447.23,445.28,456.55,462.04,461.83,465,463.62,461.88,460.92,458.16,458.53,472.6,471.02,471.51,468.21,466.5,464.53,467.39,466.29,474.27,472.8,476.01,471.65,482.48,479.08,477.53,477.99,481.18,479.01,471.38,469,465.78,473.23,471.12,467.27,466.81,469.25,461.47,466.74,461.78,458,472.61,470.96,470.32,470.6,475.86,473.97,474.33,483.52,487.11,498.6,497.91,500.4,507.07,518.84,518.25,515.06,515.49,511.34,504.77,505.24,502.84,505.89,515.2,514.31,509.97,514.11,524.98,527.42,530.26,526.29,525.01,522.7,530.38,534.34,541.63,539.4,542.56,543.34,544.47,545.33,552.16,552.99,555,549.5,548.59,520.12,512.51,514,509.76,508,511.89,516.11,510,512.94,511.01,503,510,516.02,525.78,514.73,515.75,515.5,508.6,497.55,491.52,500.04,497.92,506.61,512.75,512.19,515,513.26,506.4,512.88,511.4,515.25,525.15,527.8,523.52,519.35,514.48,521.33,522.65,524.78,528.75,525.3,535.27,546.85,552.83,560.1,568.02,569,568.16,567.5,567.27,582.55,584.39,584.02,579.03,594.05,609.62,615.18,625.39,622,637.39,620.11,616,633.48,639.62,644.71,650.75,675.77,675.82,668.51,674.6,679.23,694.77,707,703.21,711.25,725.65,741.79,732.94,693.84,663.97,632.07,660.55,641.68,629.65,633.63,625.85,648.54,660.52,676.7,666,673.57,692.26,697,693,681.53,684.16,698.51,715.26,714.87,718.42,699.2,699.35,694.05,689.96,669.23,673.35,677.37,689.69,696.69,700.73,710.84,700.74,702.53,691.48,685.19,685.33,657,649.25,631.68,653.2,646.73,638.25,653.82,637.65,615.95,600.79,600.25,584.35,548.62,574.49,566.4,555.98,550.52,548.27,564.3,515.9,495.43,506.8,501.71,504.95,516.69,521.16,518.09,534.62,532.25,529.64,508.95,509,502.86,507.8,486.44,464.19,472.86,475.39,471.18,457.02,444.6,447.7,432.7,433.35,413.62,439.84,440.18,443.01,437.92,419.87,439.16,432,433.55,460.56,450.78,458.19,444.08,438.08,440.47,465.71,465.7,455.12,471.09,476.82,467.81,464.19,469.08,457.45,451.66,446.84,455.03,449.54,539.41,537.79,555,546.49,543.04,544.06,552.12,558.47,574.29,593.08,581.29,594.9,586.36,579,583.01,573.2,584.94,583,576.3,581,580.07,577.52,578.6,549.99,549.46,544.62,560.9,568.24,583,585.8,575,567.3,572.22,586.3,567,557.87,554.17,545.2,552.95,571.51,572.81,569.46,562.38,560.2,546.43,545.21,542.3,551,528.82,528.07,526.42,534.73,527.04,537,543.91,554.53,541.55,540.57,533.8,521.62,516.09,535.6,533.44,481.32,468.8,477.11,489.22,475.62,491.98,477.12,483.11,482.7,473.75,467.86,463,479.85,486.34,479.12,495.01,500.84,502.61,500.03,505.49,510.15,498.3,490.5,485,486.53,490.59,483.01,474.16,468.58,473.78,463.29,465.25,464.41,450.26,444.25,419.95,418.66,414.16,433.75,437.66,433.86,442.93,414.49,439.08,449.15,430.14,429.27,435.11,439.6,431.04,381,400.52,411.72,390.49,386.91,371.21,346.01,338.11,328.98,332,381.02,362.71" },
  spx: { name: "标普 500 月线 1990–2022", ticker: "标普 500", daily: false, range: "1990-01 至 2022-06", y0: 1990, m0: 1,
    v: "329.08,331.89,339.94,330.8,361.23,358.02,356.15,322.56,306.05,304,322.22,330.22,343.93,367.07,375.22,375.34,389.83,371.16,387.81,395.43,387.86,392.45,375.22,417.09,408.78,412.7,403.69,414.95,415.35,408.14,424.21,414.03,417.8,418.68,431.35,435.71,438.78,443.38,451.67,440.19,450.19,450.53,448.13,463.56,458.93,467.83,461.79,466.45,481.61,467.14,445.77,450.91,456.5,444.27,458.26,475.49,462.71,472.35,453.69,459.27,470.42,487.39,500.71,514.71,533.4,544.75,562.06,561.88,584.41,581.5,605.37,615.93,636.02,640.43,645.5,654.17,669.12,670.63,639.95,651.99,687.33,705.27,757.02,740.74,786.16,790.82,757.12,801.34,848.28,885.14,954.31,899.47,947.28,914.62,955.4,970.43,980.28,1049.34,1101.75,1111.75,1090.82,1133.84,1120.67,957.28,1017.01,1098.67,1163.63,1229.23,1279.64,1238.33,1286.37,1335.18,1301.84,1372.71,1328.72,1320.41,1282.71,1362.93,1388.91,1469.25,1394.46,1366.42,1498.58,1452.43,1420.6,1454.6,1430.83,1517.68,1436.51,1429.4,1314.95,1320.28,1366.01,1239.94,1160.33,1249.46,1255.82,1224.38,1211.23,1133.58,1040.94,1059.78,1139.45,1148.08,1130.2,1106.73,1147.39,1076.92,1067.14,989.82,911.62,916.07,815.28,885.76,936.31,879.82,855.7,841.15,848.18,916.92,963.59,974.5,990.31,1008.01,995.97,1050.71,1058.2,1111.92,1131.13,1144.94,1126.21,1107.3,1120.68,1140.84,1101.72,1104.24,1114.58,1130.2,1173.82,1211.92,1181.27,1203.6,1180.59,1156.85,1191.5,1191.33,1234.18,1220.33,1228.81,1207.01,1249.48,1248.29,1280.08,1280.66,1294.87,1310.61,1270.09,1270.2,1276.66,1303.82,1335.85,1377.94,1400.63,1418.3,1438.24,1406.82,1420.86,1482.37,1530.62,1503.35,1455.27,1473.99,1526.75,1549.38,1481.14,1468.36,1378.55,1330.63,1322.7,1385.59,1400.38,1280,1267.38,1282.83,1166.36,968.75,896.24,903.25,825.88,735.09,797.87,872.81,919.14,919.32,987.48,1020.62,1057.08,1036.19,1095.63,1115.1,1073.87,1104.49,1169.43,1186.69,1089.41,1030.71,1101.6,1049.33,1141.2,1183.26,1180.55,1257.64,1286.12,1327.22,1325.83,1363.61,1345.2,1320.64,1292.28,1218.89,1131.42,1253.3,1246.96,1257.6,1312.41,1365.68,1408.47,1397.91,1310.33,1362.16,1379.32,1406.58,1440.67,1412.16,1416.18,1426.19,1498.11,1514.68,1569.19,1597.57,1630.74,1606.28,1685.73,1632.97,1681.55,1756.54,1805.81,1848.36,1782.59,1859.45,1872.34,1883.95,1923.57,1960.23,1930.67,2003.37,1972.29,2018.05,2067.56,2058.9,1994.99,2104.5,2067.89,2085.51,2107.39,2063.11,2103.84,1972.18,1920.03,2079.36,2080.41,2043.94,1940.24,1932.23,2059.74,2065.3,2096.95,2098.86,2173.6,2170.95,2168.27,2126.15,2198.81,2238.83,2278.87,2363.64,2362.72,2384.2,2411.8,2423.41,2470.3,2471.65,2519.36,2575.26,2647.58,2673.61,2823.81,2713.83,2640.87,2648.05,2705.27,2718.37,2816.29,2901.52,2913.98,2711.74,2760.17,2506.85,2704.1,2784.49,2834.4,2945.83,2752.06,2941.76,2980.38,2926.46,2976.74,3037.56,3140.98,3230.78,3225.52,2954.22,2584.59,2912.43,3044.31,3100.29,3271.12,3500.31,3363,3269.96,3621.63,3756.07,3714.24,3811.15,3972.89,4181.17,4204.11,4297.5,4395.26,4522.68,4307.54,4605.38,4567,4766.18,4515.55,4373.94,4530.41,4131.93,4132.15,3821.55" },
  ixic: { name: "纳斯达克综指 月线 1990–2022", ticker: "纳斯达克综指", daily: false, range: "1990-01 至 2022-06", y0: 1990, m0: 1,
    v: "415.8,425.8,435.5,420.1,459,462.3,438.2,381.2,344.5,329.8,359.1,373.8,414.2,453.1,482.3,484.72,506.11,475.92,502.04,525.68,526.88,542.98,523.9,586.34,620.21,633.47,603.77,578.68,585.31,563.6,580.83,563.12,583.27,605.17,652.73,676.95,696.34,670.77,690.13,661.42,700.53,703.95,704.7,742.84,762.78,779.26,754.39,776.8,800.47,792.5,743.46,733.84,735.19,705.96,722.16,765.62,764.29,777.49,750.32,751.96,755.2,793.73,817.21,843.98,864.58,933.45,1001.21,1020.11,1043.54,1036.06,1059.2,1052.13,1059.79,1100.05,1101.4,1190.52,1243.43,1185.02,1080.59,1141.5,1226.92,1221.51,1292.61,1291.03,1379.85,1309,1221.7,1260.76,1400.32,1442.07,1593.81,1587.32,1685.69,1593.61,1600.55,1570.35,1619.36,1770.51,1835.68,1868.41,1778.87,1894.74,1872.39,1499.25,1693.84,1771.39,1949.54,2192.69,2505.89,2288.03,2461.4,2542.86,2470.52,2686.12,2638.49,2739.35,2746.16,2966.43,3336.16,4069.31,3940.35,4696.69,4572.83,3860.66,3400.91,3966.11,3766.99,4206.35,3672.82,3369.63,2597.93,2470.52,2772.73,2151.83,1840.26,2116.24,2110.49,2160.54,2027.13,1805.43,1498.8,1690.2,1930.58,1950.4,1934.03,1731.49,1845.35,1688.23,1615.73,1463.21,1328.26,1314.85,1172.06,1329.75,1478.78,1335.51,1320.91,1337.52,1341.17,1464.31,1595.91,1622.8,1735.02,1810.45,1786.94,1932.21,1960.26,2003.37,2066.15,2029.82,1994.22,1920.15,1986.74,2047.79,1887.36,1838.1,1896.84,1974.99,2096.81,2175.44,2062.41,2051.72,1999.23,1921.65,2068.22,2056.96,2184.83,2152.09,2151.69,2120.3,2232.82,2205.32,2305.82,2281.39,2339.79,2322.57,2178.88,2172.09,2091.47,2183.75,2258.43,2366.71,2431.77,2415.29,2463.93,2416.15,2421.64,2525.09,2604.52,2603.23,2546.27,2596.36,2701.5,2859.12,2660.96,2652.28,2389.86,2271.48,2279.1,2412.8,2522.66,2292.98,2325.55,2367.52,2091.88,1720.95,1535.57,1577.03,1476.42,1377.84,1528.59,1717.3,1774.33,1835.04,1978.5,2009.06,2122.42,2045.11,2144.6,2269.15,2147.35,2238.26,2397.96,2461.19,2257.04,2109.24,2254.7,2114.03,2368.62,2507.41,2498.23,2652.87,2700.08,2782.27,2781.07,2873.54,2835.3,2773.52,2756.38,2579.46,2415.4,2684.41,2620.34,2605.15,2813.84,2966.89,3091.57,3046.36,2827.34,2935.05,2939.52,3066.96,3116.23,2977.23,3010.24,3019.51,3142.13,3160.19,3267.52,3328.79,3455.91,3403.25,3626.37,3589.87,3771.48,3919.71,4059.89,4176.59,4103.88,4308.12,4198.99,4114.56,4242.62,4408.18,4369.77,4580.27,4493.39,4630.74,4791.63,4736.05,4635.24,4963.53,4900.88,4941.42,5070.03,4986.87,5128.28,4776.51,4620.16,5053.75,5108.67,5007.41,4613.95,4557.95,4869.85,4775.36,4948.05,4842.67,5162.13,5213.22,5312,5189.14,5323.68,5383.12,5614.79,5825.44,5911.74,6047.61,6198.52,6140.42,6348.12,6428.66,6495.96,6727.67,6873.97,6903.39,7411.48,7273.01,7063.45,7066.27,7442.12,7510.3,7671.79,8109.54,8046.35,7305.9,7330.54,6635.28,7281.74,7532.53,7729.32,8095.39,7453.15,8006.24,8175.42,7962.88,7999.34,8292.36,8665.47,8972.6,9150.94,8567.37,7700.1,8889.55,9489.87,10058.8,10745.3,11775.5,11167.5,10911.6,12198.7,12888.3,13070.7,13192.3,13246.9,13962.7,13748.7,14504,14672.7,15259.2,14448.6,15498.4,15537.7,15645,14239.9,13751.4,14220.5,12334.6,12081.4,11181.5" },
  aapl: { name: "AAPL 月线 1990–2022", ticker: "AAPL", daily: false, range: "1990-01 至 2022-06", y0: 1990, m0: 1,
    v: "0.242512,0.242512,0.288017,0.281756,0.295173,0.321107,0.301373,0.265496,0.208721,0.221316,0.264499,0.310516,0.400783,0.41342,0.492082,0.398008,0.340116,0.301084,0.335544,0.384516,0.359934,0.374477,0.369024,0.410911,0.471955,0.492,0.425371,0.439064,0.436325,0.350521,0.34208,0.336591,0.331077,0.385186,0.421871,0.439311,0.437473,0.389682,0.379478,0.377636,0.417242,0.291665,0.204904,0.195674,0.173358,0.228055,0.233617,0.21771,0.243761,0.271672,0.248371,0.224094,0.218492,0.198732,0.252633,0.271382,0.253508,0.324999,0.280317,0.294369,0.304747,0.298143,0.266796,0.289502,0.314573,0.352445,0.341535,0.326356,0.283486,0.276352,0.290146,0.243336,0.210892,0.209938,0.187512,0.186081,0.199441,0.160316,0.16795,0.185127,0.169382,0.175584,0.184173,0.159362,0.126917,0.124054,0.139322,0.12978,0.126917,0.108786,0.133597,0.166041,0.165564,0.130018,0.135505,0.100198,0.139799,0.180356,0.209938,0.208984,0.203257,0.219003,0.264331,0.238088,0.29105,0.283415,0.243813,0.31252,0.314429,0.265762,0.27435,0.351168,0.336377,0.353553,0.425123,0.498124,0.483333,0.611682,0.747187,0.78488,0.792037,0.875058,1.0368,0.947104,0.641263,0.799671,0.775814,0.930405,0.393155,0.298683,0.251925,0.227114,0.330175,0.278644,0.336969,0.389186,0.3046,0.354985,0.286889,0.283225,0.236809,0.268109,0.325212,0.334373,0.37743,0.331319,0.361398,0.370559,0.355748,0.270552,0.232992,0.225206,0.221389,0.245359,0.236657,0.218793,0.219251,0.229176,0.215892,0.217114,0.274064,0.291011,0.321854,0.345213,0.316357,0.349489,0.319258,0.326281,0.34445,0.365215,0.412851,0.393613,0.428425,0.496826,0.493773,0.5266,0.591642,0.800052,1.02373,0.983271,1.17412,1.36986,1.27245,1.10114,1.21413,1.12404,1.30238,1.43185,1.63705,1.75859,2.07098,2.19526,2.3058,2.09143,1.91524,2.14945,1.82516,1.74882,2.07525,2.07189,2.35069,2.47589,2.79896,2.5907,2.61788,2.58368,2.83713,3.04753,3.7007,3.72666,4.02347,4.22868,4.68641,5.80038,5.56433,6.04864,4.1334,3.81765,4.38197,5.3118,5.76374,5.11301,4.85375,5.17683,3.47076,3.28541,2.8298,2.60628,2.75224,2.7272,3.20998,3.84239,4.14714,4.34929,4.98934,5.13652,5.65991,5.7561,6.10452,6.43493,5.86481,6.24835,7.17604,7.97274,7.84418,7.68081,7.85548,7.42339,8.66469,9.19083,9.50139,9.84981,10.3616,10.7857,10.6422,10.6917,10.6215,10.2501,11.9238,11.7513,11.6441,12.3605,11.671,12.3672,13.9392,16.5641,18.3081,17.8326,17.6418,17.8332,18.6504,20.314,20.4583,18.2569,17.949,16.3948,14.0325,13.5984,13.7167,13.7205,13.9358,12.3686,14.1154,15.1975,14.9691,16.4118,17.4596,17.7178,15.8097,16.6194,17.0525,18.7475,20.1107,20.7825,21.3796,22.9227,22.6434,24.2728,26.7293,24.9153,26.4457,28.9963,28.1975,28.3607,29.5232,28.5429,27.603,25.6597,25.2135,27.3165,27.0422,24.1644,22.3462,22.197,25.1564,21.6365,23.0491,22.2002,24.1996,24.6385,26.3946,26.509,25.8039,27.1802,28.478,32.1483,33.8598,33.8574,36.0046,34.0847,35.1994,38.8133,36.6183,40.1632,40.8309,40.3529,39.9237,42.4727,40.1703,39.5669,44.7408,44.4903,45.7353,54.7098,54.4459,52.7865,43.0714,38.1778,40.2835,41.9075,46.1708,48.7764,42.5539,48.2933,51.9826,50.9334,54.8572,60.9291,65.4578,72.1399,76.0362,67.1554,62.6188,72.3481,78.2926,90.075,104.949,127.448,114.588,107.711,117.793,131.516,130.792,120.187,121.25,130.492,123.692,136.182,145.031,150.967,140.907,149.172,164.607,177.084,174.301,164.668,174.354,157.419,148.622,137.44" },
  msft: { name: "MSFT 月线 1990–2022", ticker: "MSFT", daily: false, range: "1990-01 至 2022-06", y0: 1990, m0: 1,
    v: "0.403759,0.43104,0.48342,0.506336,0.637285,0.663475,0.58054,0.536891,0.549985,0.556533,0.630737,0.656927,0.856624,0.90573,0.926463,0.864263,0.95811,0.89209,0.962475,1.11634,1.16545,1.22928,1.27348,1.45681,1.57466,1.61722,1.55175,1.44371,1.58448,1.37496,1.42898,1.46335,1.58121,1.74326,1.82919,1.67696,1.69906,1.63768,1.81692,1.67942,1.81937,1.72853,1.45353,1.47563,1.62049,1.57384,1.57139,1.58366,1.67205,1.62049,1.66469,1.81692,2.11155,2.02807,2.02316,2.28342,2.20485,2.47494,2.47002,2.40128,2.33253,2.47494,2.79412,3.21152,3.32692,3.55035,3.55526,3.63383,3.55526,3.92847,3.42268,3.44723,3.63383,3.87691,4.05123,4.44899,4.66506,4.71907,4.63068,4.81237,5.18067,5.39182,6.16279,6.49179,8.01408,7.66052,7.20383,9.54618,9.74261,9.9292,11.1077,10.3859,10.3957,10.214,11.1176,10.1551,11.7216,13.3175,14.0639,14.1621,13.3273,17.0299,17.2754,15.0755,17.2951,16.6371,19.1709,21.7932,27.4993,23.5905,28.1671,25.5547,25.3583,28.3439,26.9689,29.0903,28.4618,29.0903,28.614,36.6919,30.7599,28.0886,33.392,21.9209,19.662,25.1422,21.9405,21.9405,18.9549,21.6459,18.0317,13.6318,19.1906,18.5424,17.187,21.2923,21.7417,22.9423,20.802,17.9295,16.0816,18.2752,20.1798,20.8209,20.0226,18.3349,18.9541,16.4241,15.9999,17.191,15.079,15.4247,13.7465,16.8044,18.1275,16.2481,14.9156,14.8968,15.2663,16.1238,15.5185,16.168,16.6535,16.7229,17.53,16.4833,16.3031,17.3557,17.5332,16.823,15.8084,16.5694,16.6328,18.1103,18.0659,17.3113,17.585,17.7885,17.0507,18.9399,18.6281,17.8342,17.1853,17.9887,18.3442,17.7177,18.2669,19.5294,18.4069,18.3855,19.8019,18.7622,20.1972,19.2788,19.5889,17.386,16.3061,16.8395,17.3887,18.574,19.8393,20.8258,21.2973,21.7341,22.4619,20.504,20.356,21.8678,22.4156,21.5943,21.2426,21.0521,21.6626,27.0673,24.7069,26.2641,24.0508,20.0669,21.0188,21.1225,20.9744,20.4495,19.1189,20.286,19.9191,16.6652,15.0904,14.6066,12.8484,12.1346,13.8973,15.3271,15.8037,18.0967,17.9064,18.7666,19.6914,21.2302,22.5165,23.4388,21.6701,22.0469,22.629,23.5948,19.9327,17.8574,20.0304,18.2144,19.1074,20.8082,19.7081,21.9095,21.7682,20.8655,20.0491,20.4676,19.749,20.6653,21.7781,21.1422,19.908,21.2997,20.4598,20.9201,23.7971,25.578,26.1682,25.9735,23.6779,24.9764,24.0619,25.1642,24.4597,23.457,21.8789,22.1333,22.7465,23.0365,23.904,27.6554,29.1594,29.0609,26.7892,28.1018,28.1981,30.0029,32.3075,31.9379,32.305,32.7062,35.2566,34.7491,35.2136,36.1203,37.385,39.3512,40.4076,40.9219,41.6714,40.7414,35.4349,38.4609,35.9168,42.9659,41.3935,39.2531,41.5203,38.693,39.6104,47.1101,48.6404,49.9864,49.635,45.8419,50.1184,45.2545,48.0948,46.759,51.794,52.5068,52.9627,55.0959,55.4086,57.5232,59.8467,59.2265,61.3364,63.7579,65.0431,64.5635,68.0947,70.0336,70.1431,78.326,79.2582,80.9528,89.9149,88.7414,86.7812,88.9206,93.9789,94.1666,101.3,107.268,109.637,102.39,106.301,97.7871,100.541,107.858,114.032,126.273,119.582,130.001,132.243,133.786,135.371,139.596,147.395,154.072,166.313,158.282,154.502,175.565,179.523,199.926,201.399,221.558,207.125,199.385,210.808,219.604,229.024,229.438,233.322,249.561,247.087,268.706,282.602,299.435,280.172,329.564,328.54,334.846,309.617,297.481,307.594,276.875,271.238,256.48" },
  ibm: { name: "IBM 月线 1990–2022", ticker: "IBM", daily: false, range: "1990-01 至 2022-06", y0: 1990, m0: 1,
    v: "10.9704,11.5544,11.9517,12.2755,13.5143,13.3809,12.6977,11.6016,12.2511,12.1503,13.0861,13.1611,14.7625,14.9955,13.3907,12.1119,12.4793,11.556,12.0468,11.5262,12.4788,11.8316,11.1391,10.8511,10.973,10.592,10.3174,11.2132,11.2132,12.2523,11.8611,10.844,10.2438,8.48366,8.6581,6.50584,6.65113,7.02244,6.64055,6.34687,6.8853,6.51603,5.87267,6.03764,5.57415,6.10502,7.15018,7.53569,7.53569,7.0522,7.31842,7.70361,8.44047,7.90529,8.32579,9.21724,9.40594,10.0645,9.55792,9.96332,9.77693,10.2005,11.1699,12.87,12.649,13.0918,14.8476,14.0975,12.9169,13.2928,13.2073,12.5214,14.8681,16.8037,15.2783,14.7976,14.6603,13.641,14.8122,15.7595,17.2096,17.8316,22.0303,20.9982,21.7432,19.924,19.068,22.2981,24.0347,25.1374,29.4547,28.2361,29.5791,27.4863,30.5558,29.2524,27.6098,29.1999,29.1011,32.463,32.9183,32.2255,37.19,31.6115,36.1291,41.7522,46.4265,51.9155,51.5987,47.7975,49.9755,58.9803,65.4122,72.9664,70.9552,70.3202,68.3756,55.5199,58.2393,61.04,63.5156,58.1401,67.0518,63.1576,60.7856,62.135,63.6591,74.8686,63.9433,55.9238,53.085,48.3205,63.6693,56.7908,54.7384,65.5289,63.628,64.6737,59.9499,56.9528,52.3321,61.6609,65.9515,69.1006,61.6341,56.0528,59.4902,47.9125,46.0191,41.2664,40.3494,43.2037,33.4941,45.3442,49.9281,44.599,45.0018,44.858,45.222,48.9525,50.763,47.6558,46.9338,47.3728,51.126,51.7916,52.4051,53.7409,57.539,55.956,53.3402,51.2087,51.4526,51.3008,50.6723,49.2872,50.004,52.3426,54.9612,57.6034,54.5883,54.0975,53.4982,44.7164,44.2305,43.5555,48.9912,47.3241,47.2026,48.1793,52.31,48.4836,47.9527,47.3275,48.765,48.6881,47.2453,45.5883,45.9385,48.0511,48.8207,55.0112,54.7669,58.0708,59.2663,55.5543,56.5131,61.2795,63.9115,63.3477,66.5979,70.2332,71.152,70.1373,63.5295,65.5247,64.9247,69.0161,70.0589,73.4419,78.7539,72.4164,78.1899,74.3714,71.7355,57.0216,50.048,51.9067,56.5263,56.7607,60.0832,64.0023,65.9061,65.0909,73.5125,73.5872,74.9074,75.5337,79.1285,82.3459,76.9925,79.9932,81.0397,81.5136,79.1504,78.4255,81.5503,78.2032,85.6181,91.6562,90.2903,94.0894,103.86,103.783,104.96,109.794,108.732,110.912,117.571,111.145,113.551,119.888,122.076,119.881,125.566,128.259,136.56,135.532,126.252,128.542,128.805,128.062,136.925,128.398,125.454,126.984,134.621,133.136,141.998,134.835,138.483,127.822,130.45,121.909,124.475,120.462,120.778,126.758,119.399,125.137,130.796,133.501,125.272,123.89,130.998,131.428,130.507,113.024,111.491,111.057,106.121,112.095,111.878,119.399,118.256,114.241,113.771,103.868,102.662,99.1994,98.732,98.3714,89.2005,93.6609,109.363,105.384,111.017,110.659,117.104,115.835,116.814,113.019,119.292,123.172,129.501,133.434,130.241,119.883,114.154,116.175,109.257,108.019,110.724,117.578,117.509,118.26,126.184,120.118,119.432,112.839,109.998,109.952,114.068,115.288,120.296,91.8312,98.864,91.5828,108.301,111.29,115.007,114.331,103.507,113.734,122.262,111.78,121.35,111.595,112.195,113.174,121.356,109.89,94.6399,107.122,106.558,104.417,106.293,106.613,106.572,97.8044,108.193,111.859,105.843,105.683,119.999,127.761,129.436,133.477,128.351,127.786,127.959,115.221,112.814,130.486,130.398,119.601,128.462,130.625,137.176,141.86" },
  amzn: { name: "AMZN 月线 1997–2022", ticker: "AMZN", daily: false, range: "1997-06 至 2022-06", y0: 1997, m0: 6,
    v: "0.077083,0.119792,0.116927,0.216927,0.254167,0.20625,0.251042,0.245833,0.320833,0.35638,0.382292,0.367188,0.83125,0.923958,0.697917,0.930208,1.05365,1.6,2.67708,2.92344,3.20312,4.30469,4.30156,2.96875,3.12812,2.50156,3.10938,3.99688,3.53125,4.25313,3.80625,3.22813,3.44375,3.35,2.75938,2.41563,1.81562,1.50625,2.075,1.92188,1.83125,1.23438,0.778125,0.865625,0.509375,0.5115,0.789,0.8345,0.7075,0.6245,0.447,0.2985,0.349,0.566,0.541,0.7095,0.705,0.715,0.8345,0.9115,0.8125,0.7225,0.747,0.7965,0.968,1.1675,0.9445,1.0925,1.1005,1.3015,1.4345,1.7945,1.816,2.082,2.316,2.4215,2.7215,2.6985,2.631,2.52,2.1505,2.164,2.18,2.425,2.72,1.946,1.907,2.043,1.7065,1.984,2.2145,2.161,1.759,1.7135,1.618,1.7755,1.6545,2.2575,2.135,2.265,1.993,2.423,2.3575,2.241,1.872,1.8265,1.7605,1.7305,1.934,1.3445,1.5415,1.606,1.9045,2.017,1.973,1.8835,1.957,1.9895,3.0665,3.457,3.4205,3.927,3.9955,4.6575,4.4575,4.528,4.632,3.885,3.2235,3.565,3.9315,4.081,3.6665,3.817,4.0405,3.638,2.862,2.135,2.564,2.941,3.2395,3.672,4.026,3.8995,4.183,4.288,4.0595,4.668,5.9405,6.7955,6.726,6.2705,5.92,6.7885,6.855,6.273,5.463,5.8945,6.2415,7.853,8.2615,8.77,9,8.482,8.6645,9.0065,9.7905,9.8345,10.2245,11.126,10.7615,10.8115,10.6755,9.6145,8.655,9.722,8.9845,10.1255,11.595,10.6455,11.4175,11.665,12.4135,12.716,11.6445,12.6025,12.5435,13.275,13.2135,13.3245,12.6905,13.46,13.8845,15.061,14.049,15.632,18.2015,19.681,19.9395,17.9345,18.105,16.8185,15.2065,15.6275,16.239,15.6495,16.952,16.122,15.273,16.932,15.5175,17.7265,19.008,18.605,21.089,21.4615,21.7045,26.8075,25.6445,25.5945,31.295,33.24,33.7945,29.35,27.626,29.682,32.9795,36.1395,35.781,37.9405,38.458,41.8655,39.491,37.5285,37.4935,41.174,42.252,44.327,46.2495,49.731,48.4,49.389,49.03,48.0675,55.264,58.8375,58.4735,72.5445,75.6225,72.367,78.3065,81.481,84.99,88.872,100.635,100.15,79.9005,84.5085,75.0985,85.9365,81.9915,89.0375,96.326,88.7535,94.6815,93.339,88.8145,86.7955,88.833,90.04,92.392,100.436,94.1875,97.486,123.7,122.118,137.941,158.234,172.548,157.436,151.807,158.402,162.846,160.31,154.646,154.704,173.371,161.154,172.008,166.38,173.54,164.252,168.622,175.354,166.717,149.574,153.563,162.997,124.282,120.21,107.4" }
};
function realDates(o, n) {
  var out = new Array(n), i;
  if (o.daily) { var d = o.d0; for (i = 0; i < n; i++) { if (i) d += o.dd.charCodeAt(i - 1) - 48; out[i] = new Date(d * 86400000).toISOString().slice(0, 10); } }
  else { var y = o.y0, m = o.m0; for (i = 0; i < n; i++) { out[i] = y + "-" + (m < 10 ? "0" : "") + m; if (++m > 12) { m = 1; y++; } } }
  return out;
}
var REAL_DOCS = R`**预测什么**：默认预测**对数价格** $\ln P_t$：这样运行器自带的基线"预测 = 上一个值"正好就是随机游走预测，也就是该打败的对象。也可以换成**对数收益** $100\ln(P_t/P_{t-1})$（单位是百分比）：这时"上一个值"是个很差的基线（收益近似独立时，它的均方误差约是收益方差的两倍），该比的是"预测 0"或训练段的均值。这两种口径对所有真实序列都一样。

**已知的结论**：真实数据没有 oracle。大量研究表明，股票价格的随机游走预测极难被稳定地打败：Welch 和 Goyal（2008）检验了文献里几十个预测股票溢价的变量，样本外几乎都不如历史均值；Meese 和 Rogoff（1983）在汇率上得到同样的结论（见"随机游走"）。这里的序列很短，测试段只有其中的 20%，所以一定要看 Diebold–Mariano 检验的 p 值，而不是只看谁的均方误差小一点。

**参考**：I. Welch, A. Goyal, A comprehensive look at the empirical performance of equity premium prediction, *Rev. Financ. Stud.* 21(4), 1455–1508 (2008)；R. Meese, K. Rogoff, Empirical exchange rate models of the seventies, *J. Int. Econ.* 14, 3–24 (1983)。`;
function realSeries(key, id, what) {
  var o = REAL[key], cache = null;
  function base() {
    if (!cache) { var v = o.v.split(","), P = new Float64Array(v.length); for (var i = 0; i < v.length; i++) P[i] = parseFloat(v[i]); cache = { P: P, times: realDates(o, P.length) }; }
    return cache;
  }
  add({
    id: id, family: "timeseries", kind: "forecast", name: o.name, summary: what + "（演示数据，不保证准确）",
    params: [S("target", "预测什么", "logprice", [["logprice", "对数价格 ln P"], ["logret", "对数收益 100·ln(Pₜ/Pₜ₋₁)（%）"]])],
    // 真实数据与种子无关
    gen: function (p) {
      var B0 = base(), P = B0.P, n = P.length, ret = p.target === "logret", T = ret ? n - 1 : n, y = new Float64Array(T);
      for (var t = 0; t < T; t++) y[t] = ret ? 100 * Math.log(P[t + 1] / P[t]) : Math.log(P[t]);
      return series(y, o.daily ? "day" : "month", o.ticker + (ret ? " 对数收益（%）" : " 对数收盘价"), { times: B0.times.slice(ret ? 1 : 0), meta: { fixed: true, real: id, target: p.target, price: new Float64Array(P) } });
    },
    plot: "series",
    docs: "**是什么**：" + o.name + "，策略实验室自带的一段旧行情（" + o.range + "，共 " + o.v.split(",").length + " 个点）。和实验室里其他地方一样，**这段数据只为演示\"真实数据\"的流程，不保证准确**（看起来是复权后的收盘价，口径未经核实）。\n\n" + REAL_DOCS,
    source: { name: "策略实验室自带的示例行情（data/samples.json）", license: "仅供演示，不保证准确", cite: "策略实验室 data/samples.json：" + o.name }
  });
}
realSeries("goog", "real_goog_daily", "谷歌日线收盘价");
realSeries("spx", "real_sp500_monthly", "标普 500 指数月线");
realSeries("ixic", "real_nasdaq_monthly", "纳斯达克综合指数月线");
realSeries("aapl", "real_aapl_monthly", "苹果公司月线");
realSeries("msft", "real_msft_monthly", "微软月线");
realSeries("ibm", "real_ibm_monthly", "IBM 月线");
realSeries("amzn", "real_amzn_monthly", "亚马逊月线");

return QL.mlreg;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLDATA_TS;
