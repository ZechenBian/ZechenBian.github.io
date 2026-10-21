// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 表格数据（回归与分类）
 * 每个数据集：参数、生成函数 gen(p, rng)、理论最优 oracle / bayes（能算出来的时候）、说明 docs。
 * 这个函数会被 toString() 拼进后台线程，所以必须自包含：真实数据也以紧凑字符串的形式写在函数体里。
 * 真实数据的编码：每列先乘 10^dec 变成整数、减去该列最小值，再按固定宽度写成 90 进制的字符
 * （字符表见 ALPH，不含引号、反斜杠和 <）。解码时 (整数 + 最小值) / 10^dec：整数除以 10 的幂是正确舍入的，
 * 所以得到的浮点数与直接解析原来的十进制文本逐位相同。 */
function QL_MLDATA_TABULAR(QL) {
"use strict";
var add = QL.mlreg.add, RNG = QL.RNG, R = String.raw, TAU = 2 * Math.PI;

/* ================================================================== *
 *  小工具
 * ================================================================== */
function I(key, label, def, min, max, step, desc) { return { key: key, label: label, def: def, min: min, max: max, step: step || 1, type: "int", desc: desc || "" }; }
function N(key, label, def, min, max, step, desc) { return { key: key, label: label, def: def, min: min, max: max, step: step, type: "num", desc: desc || "" }; }
function S(key, label, def, options, desc) { return { key: key, label: label, def: def, options: options, type: "select", desc: desc || "" }; }
function B(key, label, def, desc) { return { key: key, label: label, def: def, type: "bool", desc: desc || "" }; }
/** 只在某些取值下才显示的参数（界面按 show(p) 决定） */
function shown(o, f) { o.show = f; return o; }
function SAMPLES(def, min, max, step) { return I("n", "样本数", def, min, max, step || 10, "一共生成多少个样本；运行时再分成训练、验证、测试三份"); }
function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = rng.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
/** 各类别个数恰好相等（差不超过 1），顺序随机 */
function balanced(n, k, rng) { var y = new Int32Array(n); for (var i = 0; i < n; i++) y[i] = i % k; return shuffle(y, rng); }
function seqNames(d) { var a = []; for (var j = 0; j < d; j++) a.push("x" + (j + 1)); return a; }
function range(a, b) { var r = new Int32Array(b - a); for (var i = 0; i < r.length; i++) r[i] = a + i; return r; }
function sup(X, y, n, d, o) { var D = { X: X, y: y, n: n, d: d }; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) D[k] = o[k]; return D; }
function clampI(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
/** 标准正态分布函数（Numerical Recipes 的 erfc 近似，相对误差小于 1.2e-7） */
function normCdf(x) {
  var z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.5 * z);
  var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - 0.5 * r : 0.5 * r;
}
function softplus(x) { return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)); }
/** 把每行的对数后验（写在 out[o..o+k−1]）就地换成概率 */
function softmaxRow(out, o, k) {
  var mx = -Infinity, c, z = 0;
  for (c = 0; c < k; c++) if (out[o + c] > mx) mx = out[o + c];
  for (c = 0; c < k; c++) { out[o + c] = Math.exp(out[o + c] - mx); z += out[o + c]; }
  for (c = 0; c < k; c++) out[o + c] /= z;
}
/** 同样的参数只算一次（贝叶斯准确率的蒙特卡罗估计要几十毫秒） */
var memo = {};
function once(id, p, f) { var key = id + "|" + JSON.stringify(p); if (!Object.prototype.hasOwnProperty.call(memo, key)) memo[key] = f(); return memo[key]; }
/** 贝叶斯准确率 = E[max_c P(c | X)]：对每个样本取后验的最大值再平均，比数"判对了几个"方差小。
 *  sample(g, x) 按生成模型抽一个点写进 x；post(x, out) 写出后验。固定种子，结果可复现。 */
function mcBayes(sample, post, k, dim, N, seed) {
  var g = new RNG(seed, 101, 7), x = new Float64Array(dim), pr = new Float64Array(k), s = 0, s2 = 0;
  for (var i = 0; i < N; i++) {
    sample(g, x); post(x, pr);
    var m = 0; for (var c = 0; c < k; c++) if (pr[c] > m) m = pr[c];
    s += m; s2 += m * m;
  }
  var mean = s / N, sd = Math.sqrt(Math.max(0, s2 / N - mean * mean));
  return { value: mean, se: sd / Math.sqrt(N), N: N };
}
function mcNote(r) { return "蒙特卡罗估计（固定种子，" + r.N + " 个样本）：" + r.value.toFixed(4) + " ± " + r.se.toFixed(4) + "（一个标准误）"; }
/** Simpson 积分 */
function simpson(f, a, b, m) { var h = (b - a) / m, s = f(a) + f(b); for (var i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return s * h / 3; }
/** 回归的 oracle：逐行套用真函数 */
function rowFn(d, f) { return function (X, n) { var out = new Float64Array(n); for (var i = 0; i < n; i++) out[i] = f(X, i * d); return out; }; }
/** 固定的支撑集和符号：只由 (d, s) 决定，与数据的种子无关，所以 oracle 知道真系数 */
function support(d, s, salt) {
  s = Math.min(s, d);
  var g = new RNG(salt, d, s), idx = [], i;
  for (i = 0; i < d; i++) idx.push(i);
  for (i = 0; i < s; i++) { var j = i + g.int(d - i), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  var S0 = idx.slice(0, s).sort(function (a, b) { return a - b; });
  return { idx: S0, sign: S0.map(function () { return g.u() < 0.5 ? -1 : 1; }) };
}
/** 一行 AR(1) 相关的标准正态：Σ_jl = ρ^|j−l| */
function arRow(X, o, d, rho, rng) {
  var c = Math.sqrt(1 - rho * rho), x = rng.normal();
  X[o] = x;
  for (var j = 1; j < d; j++) { x = rho * x + c * rng.normal(); X[o + j] = x; }
}

/* 沿曲线均匀分布、再加各向同性高斯噪声的类条件密度：p(x | c) = (1/|T|) ∫_T φ_σ(x − m_c(t)) dt。
 * 用中点公式离散成 M 个节点，节点间的空间距离不超过 σ/4（这时离散误差远小于蒙特卡罗误差）。
 * 各类的 t 区间长度相同、先验相等，所以后验就是似然的归一化。σ = 0 时按 σ = 0.01 算（就是"最近的那条曲线"）。 */
function curvePost(curves, sigma) {
  var s = Math.max(sigma, 0.01), k = curves.length, nodes = [], Ms = [], maxM = 0, c, q;
  for (c = 0; c < k; c++) {
    var cv = curves[c], L = (cv.t1 - cv.t0) * cv.speed, m = clampI(Math.ceil(L / (s / 4)), 64, 6000), a = new Float64Array(2 * m), pt = [0, 0];
    for (q = 0; q < m; q++) { cv.f(cv.t0 + (q + 0.5) * (cv.t1 - cv.t0) / m, pt); a[2 * q] = pt[0]; a[2 * q + 1] = pt[1]; }
    nodes.push(a); Ms.push(m); if (m > maxM) maxM = m;
  }
  var inv = 1 / (2 * s * s), buf = new Float64Array(maxM), work = 0;
  for (c = 0; c < k; c++) work += Ms[c];
  function post(x0, x1, out, o) {
    for (var c2 = 0; c2 < k; c2++) {
      var a2 = nodes[c2], m2 = Ms[c2], dmin = Infinity, q2;
      for (q2 = 0; q2 < m2; q2++) { var dx = x0 - a2[2 * q2], dy = x1 - a2[2 * q2 + 1], d2 = dx * dx + dy * dy; buf[q2] = d2; if (d2 < dmin) dmin = d2; }
      var sum = 0;
      for (q2 = 0; q2 < m2; q2++) { var e = (buf[q2] - dmin) * inv; if (e < 40) sum += Math.exp(-e); }
      out[o + c2] = -dmin * inv + Math.log(sum / m2);
    }
    softmaxRow(out, o, k);
  }
  post.work = work;
  return post;
}
function curveOracle(curves, sigma, note) {
  var post = curvePost(curves, sigma), k = curves.length;
  return { predict: function (X, n) { var out = new Float64Array(n * k); for (var i = 0; i < n; i++) post(X[2 * i], X[2 * i + 1], out, i * k); return out; }, note: note };
}
function curveBayes(curves, sigma, seed) {
  if (!(sigma > 0)) return { value: 1, se: 0, N: 0, exact: true };
  var post = curvePost(curves, sigma), k = curves.length, pt = [0, 0];
  var N = clampI(Math.floor(3e7 / post.work), 2000, 20000);
  return mcBayes(function (g, x) {
    var cv = curves[g.int(k)]; cv.f(cv.t0 + (cv.t1 - cv.t0) * g.u(), pt);
    x[0] = pt[0] + sigma * g.normal(); x[1] = pt[1] + sigma * g.normal();
  }, function (x, out) { post(x[0], x[1], out, 0); }, k, 2, N, seed);
}

/* ================================================================== *
 *  回归
 * ================================================================== */
add({
  id: "sine1d", family: "tabular", kind: "regression", name: "一维正弦", summary: "y = sin(2πkx) + 噪声：偏差与方差、过拟合、外推",
  params: [
    SAMPLES(200, 20, 5000),
    N("noise", "噪声标准差 σ", 0.3, 0, 1.5, 0.01),
    N("freq", "周期数 k", 1, 0.5, 5, 0.5, "[0, 1] 上有几个完整的周期；越多越难学"),
    B("hetero", "异方差", false, "噪声的标准差随 x 增大：s(x) = √3·σ·x（在 [0, 1] 上平均方差仍是 σ²）"),
    B("extrap", "外推测试", false, "测试集改从 x ∈ (1, 1.3) 里抽，训练集和验证集不变：看模型在训练范围之外的表现")
  ],
  gen: function (p, rng) {
    var n = p.n, X = new Float64Array(n), y = new Float64Array(n), f = new Float64Array(n), k = p.freq;
    var nTr = Math.round(0.6 * n), nVa = Math.round(0.2 * n);
    for (var i = 0; i < n; i++) {
      var x = p.extrap && i >= nTr + nVa ? 1 + 0.3 * rng.u() : rng.u();
      var s = p.noise * (p.hetero ? Math.sqrt(3) * x : 1);
      X[i] = x; f[i] = Math.sin(TAU * k * x); y[i] = f[i] + s * rng.normal();
    }
    var D = sup(X, y, n, 1, { featureNames: ["x"], truth: f, meta: { f: "sin(2πkx)", noise: p.noise, hetero: p.hetero, extrap: p.extrap } });
    // 外推时由数据规定划分：前 60% 训练、接着 20% 验证（都在 [0, 1] 上，本来就是独立同分布的），最后 20% 是 (1, 1.3) 上的测试集
    if (p.extrap) D.splitIdx = { train: range(0, nTr), valid: range(nTr, nTr + nVa), test: range(nTr + nVa, n) };
    return D;
  },
  oracle: function (p) { return { predict: rowFn(1, function (X, o) { return Math.sin(TAU * p.freq * X[o]); }), note: "真函数 f(x) = sin(2πkx)：平方损失下的贝叶斯最优预测（条件期望）" }; },
  bayes: function (p) {
    var v = p.noise * p.noise * (p.extrap && p.hetero ? (Math.pow(1.3, 3) - 1) / 0.3 : 1);
    return { metric: "mse", value: v, note: p.extrap && p.hetero ? "测试集在 (1, 1.3) 上、噪声方差 3σ²x²：贝叶斯 MSE = 3.99σ²" : "贝叶斯 MSE = 噪声方差 σ²" };
  },
  plot: "scatter2d",
  docs: R`**是什么**：最简单的非线性回归：一维输入，真函数是正弦，加上高斯噪声。用来看偏差与方差的取舍、过拟合和外推。

**生成方式**：$x\sim U(0,1)$，$y=f(x)+\varepsilon$，$f(x)=\sin(2\pi kx)$，$\varepsilon\mid x\sim N(0,s(x)^2)$。同方差时 $s(x)=\sigma$；打开"异方差"后 $s(x)=\sqrt3\,\sigma x$，于是 $\mathbb E[s(X)^2]=\sigma^2$，平均噪声不变。打开"外推测试"后，训练集和验证集照旧，测试集改从 $x\sim U(1,1.3)$ 里抽（数据自带这个划分）。

**定理（平方损失下条件期望最优）**：设 $\mathbb E[Y^2]<\infty$，$f(x)=\mathbb E[Y\mid X=x]$。对任何满足 $\mathbb E[g(X)^2]<\infty$ 的可测函数 $g$，

$$\mathbb E\big[(Y-g(X))^2\big]=\mathbb E\big[(Y-f(X))^2\big]+\mathbb E\big[(f(X)-g(X))^2\big].$$

证明：把 $Y-g(X)$ 写成 $(Y-f(X))+(f(X)-g(X))$ 再展开；由塔性质，交叉项等于 $2\,\mathbb E\big[(f-g)(X)\,\mathbb E[Y-f(X)\mid X]\big]=0$。所以理论上最好的均方误差（贝叶斯风险）是 $\mathbb E[s(X)^2]$：不外推时是 $\sigma^2$；外推并且异方差时，测试集上是 $3\sigma^2\,\mathbb E[X^2]=3\sigma^2\cdot\frac{1.3^3-1}{0.9}=3.99\,\sigma^2$（$X\sim U(1,1.3)$）。

**该看什么**：多项式的阶数、k 近邻的 $k$、树的深度、核的带宽，都是在偏差与方差之间取舍：训练误差一路下降，验证误差先降后升。周期数 $k$ 越大，同样的样本数下越难学。外推时，k 近邻、树和森林在 $x>1$ 处只能给出训练范围边上的常数（它们的预测是训练目标的加权平均，不会超出训练目标的范围），多项式会发散；只有猜对了函数形式的模型才能外推。

**参考**：T. Hastie, R. Tibshirani, J. Friedman,《The Elements of Statistical Learning》第 2 版，第 2、7 章（Springer, 2009）。`
});

function friedman(X, o) { return 10 * Math.sin(Math.PI * X[o] * X[o + 1]) + 20 * (X[o + 2] - 0.5) * (X[o + 2] - 0.5) + 10 * X[o + 3] + 5 * X[o + 4]; }
add({
  id: "friedman1", family: "tabular", kind: "regression", name: "Friedman 函数 #1", summary: "加性项 + 二次项 + 交互项 + 一批无关特征的经典测试函数",
  params: [
    SAMPLES(1000, 100, 20000, 100),
    I("d", "特征数 d", 10, 5, 100, 1, "前 5 个有用，其余与 y 无关"),
    N("noise", "噪声标准差 σ", 1, 0, 5, 0.1)
  ],
  gen: function (p, rng) {
    var n = p.n, d = p.d, X = new Float64Array(n * d), y = new Float64Array(n), f = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var o = i * d; for (var j = 0; j < d; j++) X[o + j] = rng.u();
      f[i] = friedman(X, o); y[i] = f[i] + p.noise * rng.normal();
    }
    return sup(X, y, n, d, { featureNames: seqNames(d), truth: f, meta: { relevant: [0, 1, 2, 3, 4] } });
  },
  oracle: function (p) { return { predict: rowFn(p.d, friedman), note: "真函数 f(x) = 10 sin(πx₁x₂) + 20(x₃ − ½)² + 10x₄ + 5x₅" }; },
  bayes: function (p) { return { metric: "mse", value: p.noise * p.noise, note: "贝叶斯 MSE = 噪声方差 σ²" }; },
  plot: "table",
  docs: R`**是什么**：Friedman（1991）为检验 MARS（多元自适应回归样条）设计的标准测试函数：有加性项、二次项、一个交互项，还有一批无关特征。

**生成方式**：$x\sim U(0,1)^d$（$d\ge5$），

$$f(x)=10\sin(\pi x_1x_2)+20\,(x_3-\tfrac12)^2+10x_4+5x_5,\qquad y=f(x)+\varepsilon,\quad \varepsilon\sim N(0,\sigma^2).$$

$x_6,\dots,x_d$ 与 $y$ 独立。理论上最好的均方误差是 $\sigma^2$（条件期望最优，证明见"一维正弦"）。

**已知的性质**：各项相互独立，方差可以分开算：$\operatorname{Var}(10x_4)=\tfrac{100}{12}$，$\operatorname{Var}(5x_5)=\tfrac{25}{12}$，$\operatorname{Var}\big(20(x_3-\tfrac12)^2\big)=\tfrac{400}{180}$，$\operatorname{Var}\big(10\sin(\pi x_1x_2)\big)\approx11.19$，合计 $\operatorname{Var}f(X)\approx23.83$（均值约 14.41）。最好的线性函数只能解释其中的 75.2%：二次项关于 $x_3=\tfrac12$ 对称，它在线性函数上的投影是零；交互项也只有一部分是线性的。所以线性回归的均方误差不会低于约 $\sigma^2+5.90$。

**该看什么**：梯度提升、随机森林、MARS、高斯过程都表现好。k 近邻怕无关特征：$d=10$ 时一半的坐标是噪声，距离被稀释；把 $d$ 调到 50、100 看它变差。置换重要性应当把 $x_1,\dots,x_5$ 排在前面（$x_3$ 的作用全是非线性的，线性模型的系数看不出它），其余接近零。

**参考**：J. H. Friedman, Multivariate adaptive regression splines, *Ann. Statist.* 19(1), 1–67 (1991)；L. Breiman, Bagging predictors, *Machine Learning* 24, 123–140 (1996)。`
});

add({
  id: "sparse_linear", family: "tabular", kind: "regression", name: "高维稀疏线性", summary: "d 个特征里只有 s 个起作用：Lasso、岭回归、最小二乘",
  params: [
    SAMPLES(200, 20, 5000, 10),
    I("d", "特征数 d", 100, 5, 500, 5, "可以比样本数还多"),
    I("s", "非零系数个数 s", 5, 1, 50, 1, "超过 d 时按 d 算"),
    N("b", "非零系数的大小 b", 1, 0.1, 5, 0.1),
    N("rho", "相邻特征的相关 ρ", 0, 0, 0.95, 0.05, "Σ_jl = ρ^|j−l|"),
    N("noise", "噪声标准差 σ", 1, 0, 5, 0.1)
  ],
  gen: function (p, rng) {
    var n = p.n, d = p.d, sp = support(d, p.s, 77001), X = new Float64Array(n * d), y = new Float64Array(n), f = new Float64Array(n), beta = new Float64Array(d), j;
    for (j = 0; j < sp.idx.length; j++) beta[sp.idx[j]] = p.b * sp.sign[j];
    for (var i = 0; i < n; i++) {
      var o = i * d; arRow(X, o, d, p.rho, rng);
      var s = 0; for (j = 0; j < sp.idx.length; j++) s += beta[sp.idx[j]] * X[o + sp.idx[j]];
      f[i] = s; y[i] = s + p.noise * rng.normal();
    }
    return sup(X, y, n, d, { featureNames: seqNames(d), truth: f, meta: { beta: beta, support: Int32Array.from(sp.idx) } });
  },
  oracle: function (p) {
    var sp = support(p.d, p.s, 77001);
    return { predict: rowFn(p.d, function (X, o) { var s = 0; for (var j = 0; j < sp.idx.length; j++) s += p.b * sp.sign[j] * X[o + sp.idx[j]]; return s; }), note: "真系数 β*（支撑集只由 d、s 决定）：x ↦ xᵀβ*" };
  },
  bayes: function (p) { return { metric: "mse", value: p.noise * p.noise, note: "贝叶斯 MSE = 噪声方差 σ²" }; },
  plot: "table",
  docs: R`**是什么**：高维稀疏线性回归：特征很多（$d$ 可以大于 $n$），真正起作用的只有 $s$ 个。用来比较最小二乘、岭回归和 Lasso。

**生成方式**：每一行 $x\sim N(0,\Sigma)$，$\Sigma_{jl}=\rho^{|j-l|}$（AR(1) 相关：$x_1=z_1$，$x_j=\rho x_{j-1}+\sqrt{1-\rho^2}\,z_j$）。$y=x^\top\beta^*+\varepsilon$，$\varepsilon\sim N(0,\sigma^2)$。$\beta^*$ 的支撑集 $S$ 有 $s$ 个位置，非零系数都是 $\pm b$。$S$ 和符号只由 $(d,s)$ 决定（用固定的种子抽），与数据的种子无关，所以理论最优的预测器 $x\mapsto x^\top\beta^*$ 是已知的，它的均方误差是 $\sigma^2$。

**Lasso**：$\hat\beta\in\arg\min_\beta\ \frac1{2n}\|y-X\beta\|_2^2+\lambda\|\beta\|_1$。

**限制特征值（RE）条件**：记锥 $\mathcal C(S)=\{\Delta:\|\Delta_{S^c}\|_1\le3\|\Delta_S\|_1\}$。若存在 $\gamma>0$，使得对所有 $\Delta\in\mathcal C(S)$ 都有 $\frac1n\|X\Delta\|_2^2\ge\gamma\|\Delta\|_2^2$，就说 $X$ 在 $S$ 上满足参数为 $\gamma$ 的 RE 条件。$d>n$ 时 $X^\top X$ 一定奇异，但它仍可能在这个锥上不退化。

**定理**（Bickel–Ritov–Tsybakov 2009；这里的形式见 Hastie–Tibshirani–Wainwright 2015 定理 11.1）：若 RE 条件成立且 $\lambda\ge\frac2n\|X^\top\varepsilon\|_\infty$，则任何 Lasso 解都满足 $\|\hat\beta-\beta^*\|_2\le\frac3\gamma\sqrt s\,\lambda$。

证明梗概：记 $\Delta=\hat\beta-\beta^*$。$\hat\beta$ 的目标值不超过 $\beta^*$ 的，整理得 $\frac1{2n}\|X\Delta\|_2^2\le\frac1n\varepsilon^\top X\Delta+\lambda\big(\|\beta^*\|_1-\|\beta^*+\Delta\|_1\big)$。由 Hölder 不等式，第一项不超过 $\frac\lambda2\|\Delta\|_1$；因为 $\beta^*$ 支撑在 $S$ 上，第二项不超过 $\lambda(\|\Delta_S\|_1-\|\Delta_{S^c}\|_1)$。合起来 $0\le\frac1{2n}\|X\Delta\|_2^2\le\frac\lambda2\big(3\|\Delta_S\|_1-\|\Delta_{S^c}\|_1\big)$，所以 $\Delta\in\mathcal C(S)$；再用 RE 和 $\|\Delta_S\|_1\le\sqrt s\,\|\Delta\|_2$，得 $\frac\gamma2\|\Delta\|_2^2\le\frac{3\lambda}2\sqrt s\,\|\Delta\|_2$。

**推论**：列已标准化（$\|X_j\|_2^2=n$）时 $\frac1nX_j^\top\varepsilon\sim N(0,\sigma^2/n)$。取 $\lambda=2\sigma\sqrt{2\log(2d/\delta)/n}$，由正态尾界和联合界，定理的条件以至少 $1-\delta$ 的概率成立，于是 $\|\hat\beta-\beta^*\|_2\le\frac{6\sigma}\gamma\sqrt{2s\log(2d/\delta)/n}$：误差只随 $\log d$ 增长。对随机设计 $x\sim N(0,\Sigma)$，Raskutti–Wainwright–Yu（2010）证明：存在普适常数 $c,c',c'',C$，当 $n\ge C\,\frac{\max_j\Sigma_{jj}}{\lambda_{\min}(\Sigma)}\,s\log d$ 时，RE 条件以至少 $1-c'e^{-cn}$ 的概率在 $\gamma=c''\lambda_{\min}(\Sigma)$ 下成立。这里的 $\Sigma$ 是 AR(1) 的 Toeplitz 矩阵，谱密度 $\frac{1-\rho^2}{1-2\rho\cos\omega+\rho^2}\ge\frac{1-\rho}{1+\rho}$，所以 $\lambda_{\min}(\Sigma)>\frac{1-\rho}{1+\rho}$：$\rho\to1$ 时条件变坏。

**该看什么**：$s\log d\ll n$ 而 $d$ 很大时，Lasso 明显赢岭回归和最小二乘（$d>n$ 时最小二乘的解不唯一）。$s$ 接近 $d$（系数稠密）时，岭回归不输甚至更好。$\rho$ 接近 1 时，Lasso 在几列高度相关的特征里随便挑一列，选出来的支撑集不稳定（恢复支撑集需要更强的"不可表示条件"，Zhao & Yu 2006），弹性网更稳。

**参考**：P. Bickel, Y. Ritov, A. Tsybakov, *Ann. Statist.* 37(4), 1705–1732 (2009)；T. Hastie, R. Tibshirani, M. Wainwright,《Statistical Learning with Sparsity》第 11 章（CRC, 2015）；G. Raskutti, M. Wainwright, B. Yu, *JMLR* 11, 2241–2259 (2010)；P. Zhao, B. Yu, *JMLR* 7, 2541–2563 (2006)。`
});

function stepFn(shape, m) {
  if (shape === "tree") return function (a, b) { return a < 0.5 ? (b < 0.3 ? 0 : 2) : (b < 0.7 ? (a < 0.8 ? -1 : 1) : 3); };
  if (shape === "grid") {
    var V = new Float64Array(m * m);
    for (var i = 0; i < m; i++) for (var j = 0; j < m; j++) V[i * m + j] = (QL.hash32(1000 * m + 31 * i + j + 7) % 5) - 2;
    return function (a, b) { var i2 = Math.min(m - 1, Math.floor(a * m)), j2 = Math.min(m - 1, Math.floor(b * m)); return V[i2 * m + j2]; };
  }
  return function (a, b) { return (a + b > 1 ? 2 : 0) - (a - b > 0.3 ? 1.5 : 0); };
}
add({
  id: "step_fn", family: "tabular", kind: "regression", name: "二维阶梯函数", summary: "分片常数的函数：树、线性模型、近邻、神经网络怎么处理跳变",
  params: [
    SAMPLES(1000, 100, 20000, 100),
    S("shape", "形状", "tree", [["tree", "树形分块（一棵深度 3 的树）"], ["grid", "m×m 格子"], ["oblique", "斜边界"]]),
    shown(I("m", "格子数 m", 4, 2, 10, 1, "每边分成 m 格"), function (p) { return p.shape === "grid"; }),
    N("noise", "噪声标准差 σ", 0.3, 0, 2, 0.05)
  ],
  gen: function (p, rng) {
    var n = p.n, f = stepFn(p.shape, p.m), X = new Float64Array(2 * n), y = new Float64Array(n), t = new Float64Array(n);
    for (var i = 0; i < n; i++) { var a = rng.u(), b = rng.u(); X[2 * i] = a; X[2 * i + 1] = b; t[i] = f(a, b); y[i] = t[i] + p.noise * rng.normal(); }
    return sup(X, y, n, 2, { featureNames: ["x1", "x2"], truth: t, meta: { shape: p.shape } });
  },
  oracle: function (p) { var f = stepFn(p.shape, p.m); return { predict: rowFn(2, function (X, o) { return f(X[o], X[o + 1]); }), note: "真函数（分片常数）" }; },
  bayes: function (p) { return { metric: "mse", value: p.noise * p.noise, note: "贝叶斯 MSE = 噪声方差 σ²" }; },
  plot: "scatter2d",
  docs: R`**是什么**：二维的分片常数函数，用来比较树、线性模型、k 近邻和神经网络对"跳变"的处理。

**生成方式**：$x\sim U(0,1)^2$，$y=f(x)+\varepsilon$，$\varepsilon\sim N(0,\sigma^2)$。三种形状：

- **树形分块**：$x_1<\tfrac12$ 时，$f=0$（$x_2<0.3$）或 $2$（$x_2\ge0.3$）；$x_1\ge\tfrac12$ 时，$x_2\ge0.7$ 处 $f=3$，否则 $f=-1$（$x_1<0.8$）或 $1$（$x_1\ge0.8$）。它恰好是一棵深度为 3 的回归树。
- **m×m 格子**：把正方形分成 $m\times m$ 格，每格一个取自 $\{-2,-1,0,1,2\}$ 的值（只由 $m$ 决定，与种子无关）。
- **斜边界**：$f=2\cdot\mathbf 1[x_1+x_2>1]-1.5\cdot\mathbf 1[x_1-x_2>0.3]$，边界不平行于坐标轴。

理论上最好的均方误差是 $\sigma^2$。

**事实**：一棵轴对齐的回归树给出的函数，恰好是某个"逐次一刀切开"的矩形划分上的分片常数函数；反过来，任何在有限个轴对齐矩形上分片常数的函数都能用一棵树精确表示（把所有矩形的边延长成网格，再沿网格线逐次切）。所以前两种形状对树来说没有近似误差，只有估计误差。（实验室的树按分位数把每个特征分成几十个箱，切点只能落在箱的边界上，所以还会留下一点边界误差。）斜边界只能用阶梯去逼近：$L$ 级台阶沿一条斜线排开，与斜线之间夹着的面积是 $O(1/L)$，误差随叶子数下降得很慢。

**该看什么**：线性回归在三种形状上都有很大的偏差。k 近邻的误差集中在跳变附近（宽度约为到第 $k$ 个邻居的距离的一条带子）。斜边界上，带 ReLU 的小网络（几个隐藏单元就能表示一道斜着的台阶）更合适；随机森林把许多阶梯平均起来，边界更光滑。`
});

/* ================================================================== *
 *  分类：二维的几何形状
 * ================================================================== */
var BAYES_CLS = R`**贝叶斯分类器**：对任何分类器 $h$，$P(h(X)=Y)=\mathbb E\big[P(Y=h(X)\mid X)\big]\le\mathbb E\big[\max_cP(c\mid X)\big]$，等号在 $h(x)=\arg\max_cP(c\mid x)$ 时成立。所以贝叶斯准确率是 $\mathbb E[\max_cP(c\mid X)]$。`;

function moonCurves() {
  return [
    { t0: 0, t1: Math.PI, speed: 1, f: function (t, o) { o[0] = Math.cos(t); o[1] = Math.sin(t); } },
    { t0: 0, t1: Math.PI, speed: 1, f: function (t, o) { o[0] = 1 - Math.cos(t); o[1] = 0.5 - Math.sin(t); } }
  ];
}
add({
  id: "moons", family: "tabular", kind: "classification", name: "两个半月", summary: "两条交错的弧：线性分不开、边界却很简单",
  params: [SAMPLES(600, 50, 10000, 50), N("noise", "噪声标准差 σ", 0.2, 0, 0.8, 0.01)],
  gen: function (p, rng) {
    var n = p.n, y = balanced(n, 2, rng), X = new Float64Array(2 * n);
    for (var i = 0; i < n; i++) {
      var t = Math.PI * rng.u(), c = y[i];
      X[2 * i] = (c ? 1 - Math.cos(t) : Math.cos(t)) + p.noise * rng.normal();
      X[2 * i + 1] = (c ? 0.5 - Math.sin(t) : Math.sin(t)) + p.noise * rng.normal();
    }
    return sup(X, y, n, 2, { classes: ["上弧", "下弧"], featureNames: ["x1", "x2"] });
  },
  oracle: function (p) { return curveOracle(moonCurves(), p.noise, "精确的后验：沿弧的高斯卷积，数值积分"); },
  bayes: function (p) {
    return once("moons", p, function () { var r = curveBayes(moonCurves(), p.noise, 20261021); return { metric: "acc", value: r.value, se: r.se, note: r.exact ? "无噪声时两条弧不相交，可以完全分开" : mcNote(r) }; });
  },
  plot: "scatter2d",
  docs: R`**是什么**：两个交错的半月形（scikit-learn 的 make_moons），最常见的"线性分不开、但边界很简单"的玩具数据。

**生成方式**：两类各占一半。$t\sim U(0,\pi)$；类别 0 在上弧 $m_0(t)=(\cos t,\sin t)$，类别 1 在下弧 $m_1(t)=(1-\cos t,\tfrac12-\sin t)$；再加各向同性的高斯噪声 $N(0,\sigma^2I)$。两条弧不相交，所以 $\sigma\to0$ 时两类可以完全分开。

**后验**：类条件密度是弧上的均匀分布与高斯的卷积，$p(x\mid c)=\frac1\pi\int_0^\pi\varphi_\sigma\big(x-m_c(t)\big)\,dt$，后验 $P(c\mid x)=p(x\mid c)/\sum_{c'}p(x\mid c')$。oracle 用中点公式数值积分（节点间距不超过 $\sigma/4$）。

${BAYES_CLS} 这里用固定种子的蒙特卡罗估计它，并给出标准误。

**该看什么**：逻辑回归这类线性模型只能切一刀，噪声 0.2 时准确率约 87%；k 近邻、RBF 核、浅层神经网络、树都能贴住弯曲的边界。噪声超过 0.3 以后两类明显重叠，好的方法都挤在贝叶斯上限附近，更复杂的模型只会过拟合。

**参考**：scikit-learn 的 sklearn.datasets.make_moons。`
});

add({
  id: "circles", family: "tabular", kind: "classification", name: "同心圆", summary: "一个圆环套着另一个：加一列 x₁² + x₂² 就线性可分",
  params: [SAMPLES(600, 50, 10000, 50), N("noise", "噪声标准差 σ", 0.1, 0, 0.5, 0.01), N("factor", "内外半径比 r", 0.5, 0.1, 0.95, 0.01)],
  gen: function (p, rng) {
    var n = p.n, y = balanced(n, 2, rng), X = new Float64Array(2 * n);
    for (var i = 0; i < n; i++) {
      var th = TAU * rng.u(), r = y[i] ? p.factor : 1;
      X[2 * i] = r * Math.cos(th) + p.noise * rng.normal(); X[2 * i + 1] = r * Math.sin(th) + p.noise * rng.normal();
    }
    return sup(X, y, n, 2, { classes: ["外圈", "内圈"], featureNames: ["x1", "x2"] });
  },
  oracle: function (p) {
    var s = Math.max(p.noise, 0.005), inv = 1 / (2 * s * s), r1 = p.factor;
    return { predict: function (X, n) {
      var out = new Float64Array(2 * n);
      for (var i = 0; i < n; i++) {
        var rho = Math.sqrt(X[2 * i] * X[2 * i] + X[2 * i + 1] * X[2 * i + 1]);
        out[2 * i] = -inv + logI0(rho / (s * s)); out[2 * i + 1] = -r1 * r1 * inv + logI0(r1 * rho / (s * s));
        softmaxRow(out, 2 * i, 2);
      }
      return out;
    }, note: "精确的后验（用到零阶修正贝塞尔函数 I₀）" };
  },
  bayes: function (p) {
    return once("circles", p, function () {
      var s = p.noise, r1 = p.factor;
      if (!(s > 0)) return { metric: "acc", value: 1, note: "无噪声时两个圆不相交，可以完全分开" };
      var lr = function (rho, r) { return Math.log(rho) - 2 * Math.log(s) - (rho * rho + r * r) / (2 * s * s) + logI0(r * rho / (s * s)); };
      var f = function (rho) { return rho > 0 ? 0.5 * Math.exp(Math.max(lr(rho, 1), lr(rho, r1))) : 0; };
      var v = simpson(f, 0, 1 + 12 * s, 6000);
      return { metric: "acc", value: Math.min(1, v), note: "精确值（Rice 分布的一维数值积分）" };
    });
  },
  plot: "scatter2d",
  docs: R`**是什么**：两个同心圆环（scikit-learn 的 make_circles）。在原始坐标上线性模型完全无能为力，加一个特征 $x_1^2+x_2^2$ 就线性可分：这是核方法最小的例子。

**生成方式**：两类各占一半。$\theta\sim U(0,2\pi)$；类别 0 在半径 1 的圆上，类别 1 在半径 $r$ 的圆上；再加 $N(0,\sigma^2I)$ 噪声。

**后验**：对角度积分，用 $\int_0^{2\pi}e^{a\cos\theta}\,d\theta=2\pi I_0(a)$（$I_0$ 是零阶修正贝塞尔函数），得

$$p(x\mid c)=\frac1{2\pi\sigma^2}\exp\Big(-\frac{\rho^2+r_c^2}{2\sigma^2}\Big)\,I_0\Big(\frac{r_c\,\rho}{\sigma^2}\Big),\qquad \rho=\|x\|,\ r_0=1,\ r_1=r.$$

后验只依赖 $\rho$，所以贝叶斯边界是一个圆。$\rho$ 在类别 $c$ 下服从 Rice 分布，密度 $f_c(\rho)=2\pi\rho\,p(x\mid c)$，贝叶斯准确率等于 $\frac12\int_0^\infty\max\big(f_0(\rho),f_1(\rho)\big)\,d\rho$，这里用一维数值积分直接算出（不是蒙特卡罗）。

**该看什么**：逻辑回归在原始坐标上学不到东西（准确率在 50% 上下摆动，概率处处接近 $\tfrac12$）：映射 $x\mapsto-x$ 不改变标签，凸损失下最优的线性系数是 0（证明见"异或"）。加上 $x_1^2+x_2^2$ 这一列，或者用二次多项式核、RBF 核，就接近贝叶斯上限。k 近邻和树也行，树要用很多次轴对齐的切分去拼一个圆。

**参考**：scikit-learn 的 sklearn.datasets.make_circles；Rice 分布见 S. O. Rice, *Bell Syst. Tech. J.* 23, 282–332 (1944)。`
});
/** log I₀(z)：小 z 用级数，大 z 用渐近展开（z ≥ 20 时截断误差小于 1e-7） */
function logI0(z) {
  if (z < 20) { var s = 1, t = 1, q = z * z / 4; for (var k = 1; k < 300; k++) { t *= q / (k * k); s += t; if (t < 1e-17 * s) break; } return Math.log(s); }
  var iz = 1 / z;
  return z - 0.5 * Math.log(TAU * z) + Math.log(1 + iz * (1 / 8 + iz * (9 / 128 + iz * (225 / 3072 + iz * 11025 / 98304))));
}

function spiralCurves(k, turns) {
  var a = TAU * turns, out = [];
  for (var c = 0; c < k; c++) out.push((function (c0) {
    return { t0: 0.08, t1: 1, speed: Math.sqrt(1 + a * a), f: function (t, o) { var th = a * t + TAU * c0 / k; o[0] = t * Math.cos(th); o[1] = t * Math.sin(th); } };
  })(c));
  return out;
}
add({
  id: "spirals", family: "tabular", kind: "classification", name: "螺旋", summary: "k 条交错的螺旋臂：边界绕很多圈",
  params: [SAMPLES(900, 90, 10000, 30), S("k", "臂数", 2, [[2, "两条"], [3, "三条"]]), N("turns", "圈数", 1.5, 0.5, 3, 0.25), N("noise", "噪声标准差 σ", 0.05, 0, 0.3, 0.005)],
  gen: function (p, rng) {
    var n = p.n, k = p.k, y = balanced(n, k, rng), X = new Float64Array(2 * n), a = TAU * p.turns;
    for (var i = 0; i < n; i++) {
      var t = 0.08 + 0.92 * rng.u(), th = a * t + TAU * y[i] / k;
      X[2 * i] = t * Math.cos(th) + p.noise * rng.normal(); X[2 * i + 1] = t * Math.sin(th) + p.noise * rng.normal();
    }
    var cls = []; for (var c = 0; c < k; c++) cls.push("臂 " + (c + 1));
    return sup(X, y, n, 2, { classes: cls, featureNames: ["x1", "x2"] });
  },
  oracle: function (p) { return curveOracle(spiralCurves(p.k, p.turns), p.noise, "精确的后验：沿螺线的高斯卷积，数值积分"); },
  bayes: function (p) {
    return once("spirals", p, function () { var r = curveBayes(spiralCurves(p.k, p.turns), p.noise, 20261022); return { metric: "acc", value: r.value, se: r.se, note: r.exact ? "无噪声时各条臂不相交，可以完全分开" : mcNote(r) }; });
  },
  plot: "scatter2d",
  docs: R`**是什么**：$k$ 条交错的螺旋臂，即 Lang 和 Witbrock（1988）的"两条螺旋"问题：边界绕很多圈，曾是神经网络的著名难题。

**生成方式**：各类各占 $1/k$。$t\sim U(0.08,1)$，第 $c$ 条臂上的点是 $m_c(t)=t\,(\cos\theta,\sin\theta)$，$\theta=2\pi Nt+2\pi c/k$（$N$ 是圈数）；再加 $N(0,\sigma^2I)$ 噪声。沿任何一条射线，相邻两条臂之间的径向距离是 $\frac1{kN}$；$\sigma$ 接近它的一半时两类开始明显重叠。

**后验**：与"两个半月"同样的办法：$p(x\mid c)=\frac1{0.92}\int_{0.08}^1\varphi_\sigma\big(x-m_c(t)\big)\,dt$，数值积分。

${BAYES_CLS} 这里用固定种子的蒙特卡罗估计它，并给出标准误。

**该看什么**：线性模型只比瞎猜（$1/k$）好一点（两条臂时约 55%–65%）。浅而窄的 sigmoid 网络很难训练（原论文用了跨层连接）；ReLU 网络加宽加深、带宽小于臂间距的 RBF 核、样本足够密时的 k 近邻都能做好。树要沿螺线切出大量小矩形，容易过拟合。把圈数加到 3，看哪些方法先垮。

**参考**：K. J. Lang, M. J. Witbrock, Learning to tell two spirals apart, *Proceedings of the 1988 Connectionist Models Summer School*, 52–59 (1988)。`
});

add({
  id: "xor", family: "tabular", kind: "classification", name: "异或", summary: "y = [x₁x₂ > 0]：单个特征毫无信息，合起来完全决定类别",
  params: [SAMPLES(800, 50, 10000, 50), N("flip", "标签翻转概率 ε", 0.05, 0, 0.45, 0.01), I("q", "无关特征个数 q", 0, 0, 20, 1, "再加 q 个与类别无关的均匀特征")],
  gen: function (p, rng) {
    var n = p.n, d = 2 + p.q, X = new Float64Array(n * d), y = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      var o = i * d; for (var j = 0; j < d; j++) X[o + j] = 2 * rng.u() - 1;
      var c = X[o] * X[o + 1] > 0 ? 1 : 0;
      y[i] = rng.u() < p.flip ? 1 - c : c;
    }
    return sup(X, y, n, d, { classes: ["异号（x₁x₂ < 0）", "同号（x₁x₂ > 0）"], featureNames: seqNames(d) });
  },
  oracle: function (p) {
    var d = 2 + p.q, e = p.flip;
    return { predict: function (X, n) { var out = new Float64Array(2 * n); for (var i = 0; i < n; i++) { var s = X[i * d] * X[i * d + 1], q1 = s > 0 ? 1 - e : s < 0 ? e : 0.5; out[2 * i] = 1 - q1; out[2 * i + 1] = q1; } return out; }, note: "精确的后验：x₁x₂ > 0 时 P(同号) = 1 − ε，否则 ε" };
  },
  bayes: function (p) { return { metric: "acc", value: 1 - p.flip, note: "精确值 1 − ε" }; },
  plot: "scatter2d",
  docs: R`**是什么**：异或：$y=\mathbf 1[x_1x_2>0]$。单看任何一个特征都毫无信息，两个合起来却完全决定类别。

**生成方式**：$x\sim U(-1,1)^{2+q}$（后 $q$ 个特征与类别无关）；$y=\mathbf 1[x_1x_2>0]$，再以概率 $\epsilon$ 把标签翻转。后验是 $P(y=1\mid x)=1-\epsilon$（$x_1x_2>0$）或 $\epsilon$（$x_1x_2<0$），所以贝叶斯准确率恰好是 $1-\epsilon$。

**两个精确的事实**：

1. **每个单独的特征都与 $y$ 独立**：给定 $x_1$，$x_2$ 的符号仍然正负各半，所以 $P(y=1\mid x_1)=\tfrac12$。贪心的树在根节点上找不到有用的切分（总体上任何一刀的不纯度下降都是 0），只能被样本噪声带着走；无关特征 $q$ 越多，越容易切错。
2. **凸损失的线性分类器学不到东西**：记 $\tilde y=2y-1$，风险 $R(w,b)=\mathbb E\,\ell\big(\tilde y\,(w^\top x+b)\big)$，$\ell$ 是凸的（逻辑损失、合页损失）。映射 $x\mapsto-x$ 不改变 $x$ 的分布，也不改变 $x_1x_2$，所以 $R(w,b)=R(-w,b)$；由凸性 $R(0,b)\le\tfrac12R(w,b)+\tfrac12R(-w,b)=R(w,b)$。最优的 $w$ 可以取 0，严格凸时（逻辑回归）就只能是 0：总体上预测的概率处处是 $\tfrac12$，对数损失是 $\ln2$，什么都没学到。有限样本里拟合出来的 $w$ 只是噪声，决策边界落在哪里全凭运气，准确率在 50% 上下随机摆动（最坏可以低到 $1/3$）。（直接优化 0-1 损失的最好半平面能到 $2/3$，但那是个 NP 难的组合问题，常用的线性方法都不这么做。）

**该看什么**：Minsky 和 Papert（1969）用它说明单层感知机的局限；有一层隐藏单元（两个就够）的网络就能解决。二次多项式核含有 $x_1x_2$ 这一项，立刻解决。k 近邻不怕异或，但怕无关特征。

**参考**：M. Minsky, S. Papert,《Perceptrons》（MIT Press, 1969）。`
});

add({
  id: "checker", family: "tabular", kind: "classification", name: "棋盘格", summary: "m×m 的棋盘：异或的推广，越细越难",
  params: [SAMPLES(2000, 100, 20000, 100), I("m", "每边格数 m", 4, 2, 12, 1), N("flip", "标签翻转概率 ε", 0, 0, 0.45, 0.01)],
  gen: function (p, rng) {
    var n = p.n, m = p.m, X = new Float64Array(2 * n), y = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      var a = rng.u(), b = rng.u(), c = (Math.min(m - 1, Math.floor(a * m)) + Math.min(m - 1, Math.floor(b * m))) % 2;
      X[2 * i] = a; X[2 * i + 1] = b; y[i] = rng.u() < p.flip ? 1 - c : c;
    }
    return sup(X, y, n, 2, { classes: ["偶格（i + j 为偶数）", "奇格（i + j 为奇数）"], featureNames: ["x1", "x2"] });
  },
  oracle: function (p) {
    var m = p.m, e = p.flip;
    return { predict: function (X, n) { var out = new Float64Array(2 * n); for (var i = 0; i < n; i++) { var c = (Math.min(m - 1, Math.floor(X[2 * i] * m)) + Math.min(m - 1, Math.floor(X[2 * i + 1] * m))) % 2, q1 = c ? 1 - e : e; out[2 * i] = 1 - q1; out[2 * i + 1] = q1; } return out; }, note: "精确的后验" };
  },
  bayes: function (p) { return { metric: "acc", value: 1 - p.flip, note: "精确值 1 − ε" }; },
  plot: "scatter2d",
  docs: R`**是什么**：$m\times m$ 的棋盘格，相邻格子的类别相反。是异或的推广（$m=2$ 就是平移过、类别编号对调的异或）。

**生成方式**：$x\sim U(0,1)^2$，$y=\big(\lfloor mx_1\rfloor+\lfloor mx_2\rfloor\big)\bmod 2$，再以概率 $\epsilon$ 翻转。贝叶斯准确率恰好是 $1-\epsilon$。

**事实**：$m$ 是偶数时，每一列格子里两种类别各占一半，所以 $P(y=1\mid x_1)=P(y=1\mid x_2)=\tfrac12$：和异或一样，单个特征毫无信息，贪心的树最初几刀是盲目的。$m$ 是奇数时有一点边际信息（条件概率是 $\frac{m\pm1}{2m}$）。要精确表示这个函数，树至少要 $m^2$ 片叶子；k 近邻需要每一格里都有足够多的点，即 $n\gg m^2$；RBF 核的带宽要小于格宽 $1/m$。

**该看什么**：固定样本数，把 $m$ 从 2 调到 10，看各算法的测试准确率怎么往下掉：这是"函数越复杂，需要的样本越多"的直观版本。线性模型一直学不到东西（准确率在 50% 上下）：映射 $x\mapsto(1,1)-x$ 保持 $x$ 的分布，也保持类别（格子 $(i,j)$ 变成 $(m-1-i,m-1-j)$，$i+j$ 的奇偶不变），于是 $R(w,b)=R(-w,b+w_1+w_2)$，由凸性最优的 $w$ 是 0，论证同"异或"。`
});

/* ---------- 高斯混合：唯一能把贝叶斯分类器写成闭式的经典模型 ---------- */
function gmModel(p) {
  var k = p.k, d = p.d, del = p.sep, mu = new Float64Array(k * d), pri = new Float64Array(k), sc = new Float64Array(k), c, j, z = 0;
  if (d >= k - 1) {
    // 正则单纯形：e_c 投影到与 (1,…,1) 正交的子空间，用 Helmert 基表示；任意两个顶点相距 δ
    for (c = 0; c < k; c++) for (j = 0; j < k - 1; j++) {
      var J = j + 1, h = c < J ? 1 / Math.sqrt(J * (J + 1)) : c === J ? -J / Math.sqrt(J * (J + 1)) : 0;
      mu[c * d + j] = del / Math.SQRT2 * h;
    }
  } else {
    var Rr = del / (2 * Math.sin(Math.PI / k));
    for (c = 0; c < k; c++) { mu[c * d] = Rr * Math.cos(TAU * c / k); mu[c * d + 1] = Rr * Math.sin(TAU * c / k); }
  }
  for (c = 0; c < k; c++) { pri[c] = p.imb ? 1 / (c + 1) : 1; z += pri[c]; }
  for (c = 0; c < k; c++) { pri[c] /= z; sc[c] = p.cov === "hetero" ? 0.6 + 0.8 * c / (k - 1) : 1; }
  return { k: k, d: d, mu: mu, pri: pri, sc: sc, rho: p.cov === "corr" ? 0.8 : 0 };
}
function gmDraw(M, g, c, x, xo) {
  var d = M.d, o = c * d, j;
  if (M.rho) { var a = Math.sqrt(1 - M.rho * M.rho), e = g.normal(); x[xo] = M.mu[o] + e; for (j = 1; j < d; j++) { e = M.rho * e + a * g.normal(); x[xo + j] = M.mu[o + j] + e; } }
  else for (j = 0; j < d; j++) x[xo + j] = M.mu[o + j] + M.sc[c] * g.normal();
}
function gmPost(M, x, xo, out, oo) {
  var d = M.d, k = M.k;
  for (var c = 0; c < k; c++) {
    var o = c * d, q = 0, j, v;
    if (M.rho) {
      // 白化：e₁ = v₁，e_j = (v_j − ρ v_{j−1}) / √(1 − ρ²)；行列式各类相同，略去
      var a = Math.sqrt(1 - M.rho * M.rho), prev = x[xo] - M.mu[o]; q = prev * prev;
      for (j = 1; j < d; j++) { v = x[xo + j] - M.mu[o + j]; var e = (v - M.rho * prev) / a; q += e * e; prev = v; }
      out[oo + c] = Math.log(M.pri[c]) - 0.5 * q;
    } else {
      for (j = 0; j < d; j++) { v = x[xo + j] - M.mu[o + j]; q += v * v; }
      out[oo + c] = Math.log(M.pri[c]) - d * Math.log(M.sc[c]) - 0.5 * q / (M.sc[c] * M.sc[c]);
    }
  }
  softmaxRow(out, oo, k);
}
add({
  id: "gauss_mix", family: "tabular", kind: "classification", name: "高斯混合", summary: "每类一个高斯：贝叶斯分类器有闭式，LDA / QDA 的主场",
  params: [
    SAMPLES(1000, 50, 20000, 50),
    I("k", "类别数 k", 3, 2, 10, 1),
    I("d", "维数 d", 2, 2, 50, 1, "d ≥ k − 1 时，k − 1 维以外的方向全是噪声"),
    N("sep", "类中心的距离 δ", 2.5, 0, 8, 0.1, "d ≥ k − 1 时任意两个中心都相距 δ；否则相邻的中心相距 δ"),
    S("cov", "协方差", "iso", [["iso", "各向同性（Σ = I）"], ["corr", "相关（Σ_jl = 0.8^|j−l|，各类相同）"], ["hetero", "各类不同（Σ_c = s_c² I）"]]),
    B("imb", "类别不平衡", false, "先验 π_c ∝ 1/(c+1)")
  ],
  gen: function (p, rng) {
    var M = gmModel(p), n = p.n, k = p.k, d = p.d, X = new Float64Array(n * d), y, i, c;
    if (p.imb) { y = new Int32Array(n); for (i = 0; i < n; i++) { var u = rng.u(), cum = 0; for (c = 0; c < k - 1; c++) { cum += M.pri[c]; if (u < cum) break; } y[i] = c; } }
    else y = balanced(n, k, rng);
    for (i = 0; i < n; i++) gmDraw(M, rng, y[i], X, i * d);
    var cls = []; for (c = 0; c < k; c++) cls.push("类 " + (c + 1));
    return sup(X, y, n, d, { classes: cls, featureNames: seqNames(d), meta: { means: M.mu, priors: M.pri } });
  },
  oracle: function (p) {
    var M = gmModel(p);
    return { predict: function (X, n) { var out = new Float64Array(n * M.k); for (var i = 0; i < n; i++) gmPost(M, X, i * M.d, out, i * M.k); return out; }, note: "精确的后验（真实的均值、协方差和先验）" };
  },
  bayes: function (p) {
    return once("gauss_mix", p, function () {
      var M = gmModel(p), d = p.d;
      if (p.k === 2 && p.cov !== "hetero") {
        // 两类、共享协方差：Δ² = vᵀΣ⁻¹v，v = μ₁ − μ₀
        var D2 = 0, prev = 0, a = Math.sqrt(1 - M.rho * M.rho);
        for (var j = 0; j < d; j++) { var v = M.mu[d + j] - M.mu[j], e = j === 0 || !M.rho ? v : (v - M.rho * prev) / a; D2 += e * e; prev = v; }
        var Dl = Math.sqrt(D2), p0 = M.pri[0], p1 = M.pri[1], tau = Math.log(p0 / p1);
        var acc = Dl > 0 ? p1 * normCdf(Dl / 2 - tau / Dl) + p0 * normCdf(Dl / 2 + tau / Dl) : Math.max(p0, p1);
        return { metric: "acc", value: acc, note: "精确值：马氏距离 Δ = " + Dl.toFixed(3) + "，准确率 π₁Φ(Δ/2 − τ/Δ) + π₀Φ(Δ/2 + τ/Δ)" };
      }
      var r = mcBayes(function (g, x) {
        var u = g.u(), cum = 0, c; for (c = 0; c < M.k - 1; c++) { cum += M.pri[c]; if (u < cum) break; }
        gmDraw(M, g, c, x, 0);
      }, function (x, out) { gmPost(M, x, 0, out, 0); }, M.k, d, 20000, 20261023);
      return { metric: "acc", value: r.value, se: r.se, note: mcNote(r) };
    });
  },
  plot: "scatter2d",
  docs: R`**是什么**：每一类是一个高斯分布。这是能把贝叶斯分类器写成闭式的经典模型：共享协方差时边界是超平面（线性判别分析 LDA 最优），各类协方差不同时边界是二次曲面（QDA 最优）。

**生成方式**：先验 $\pi_c$ 相等，或者不平衡（$\pi_c\propto\frac1{c+1}$）；$x\mid c\sim N(\mu_c,\Sigma_c)$。类中心：$d\ge k-1$ 时放在正则单纯形的顶点上（任意两个中心相距 $\delta$；用 Helmert 基构造，只占前 $k-1$ 维，其余维度只有噪声）；$d<k-1$ 时放在前两维、半径为 $\frac{\delta}{2\sin(\pi/k)}$ 的圆上（相邻中心相距 $\delta$）。协方差三选一：各向同性 $\Sigma_c=I$；相关 $\Sigma_c=\Sigma$，$\Sigma_{jl}=0.8^{|j-l|}$；各类不同 $\Sigma_c=s_c^2I$，$s_c=0.6+0.8\,\frac{c}{k-1}$（类别从 0 编号）。

**贝叶斯分类器**：$\arg\max_c\ \log\pi_c-\tfrac12\log\det\Sigma_c-\tfrac12(x-\mu_c)^\top\Sigma_c^{-1}(x-\mu_c)$；oracle 就是它（用真实参数算出的精确后验）。

**定理**（两类、共享协方差）：记马氏距离 $\Delta^2=(\mu_1-\mu_0)^\top\Sigma^{-1}(\mu_1-\mu_0)$，$\tau=\log(\pi_0/\pi_1)$，则贝叶斯准确率是 $\pi_1\Phi\big(\tfrac\Delta2-\tfrac\tau\Delta\big)+\pi_0\Phi\big(\tfrac\Delta2+\tfrac\tau\Delta\big)$；先验相等时就是 $\Phi(\Delta/2)$。证明：后验的对数几率是 $w^\top\big(x-\tfrac{\mu_0+\mu_1}2\big)-\tau$，$w=\Sigma^{-1}(\mu_1-\mu_0)$；在类别 1 下 $w^\top\big(x-\tfrac{\mu_0+\mu_1}2\big)\sim N\big(\tfrac{\Delta^2}2,\Delta^2\big)$，在类别 0 下 $\sim N\big(-\tfrac{\Delta^2}2,\Delta^2\big)$，判对的概率直接写出。其他情形用固定种子的 2 万个样本做蒙特卡罗估计（估计 $\mathbb E[\max_cP(c\mid X)]$，附标准误）。

**该看什么**：两类、共享协方差时逻辑回归是正确设定的模型（后验的对数几率是线性的），但统计效率不如 LDA：Efron（1975）算出，正态假设成立时，在常见的分离程度下逻辑回归的渐近相对效率只有 LDA 的一半到三分之二。"相关"协方差下，分到欧氏距离最近的类中心不再最优，要用 $\Sigma^{-1}$。"各类不同"时边界弯曲，线性模型输给 QDA、k 近邻和神经网络。把 $d$ 加大（多出的维度全是噪声），看 k 近邻怎么变差。

**参考**：T. W. Anderson,《An Introduction to Multivariate Statistical Analysis》第 3 版，第 6 章（Wiley, 2003）；B. Efron, The efficiency of logistic regression compared to normal discriminant analysis, *JASA* 70, 892–898 (1975)。`
});

add({
  id: "sparse_logistic", family: "tabular", kind: "classification", name: "高维稀疏逻辑回归", summary: "很多特征里只有几个影响类别的概率：L1 惩罚的主场",
  params: [
    SAMPLES(1000, 100, 20000, 100),
    I("d", "特征数 d", 50, 5, 500, 5),
    I("s", "相关特征个数 s", 5, 1, 50, 1, "超过 d 时按 d 算"),
    N("b", "非零系数的大小 b", 1.5, 0.1, 5, 0.1),
    N("rho", "相邻特征的相关 ρ", 0, 0, 0.9, 0.05)
  ],
  gen: function (p, rng) {
    var n = p.n, d = p.d, sp = support(d, p.s, 77002), X = new Float64Array(n * d), y = new Int32Array(n), beta = new Float64Array(d), j;
    for (j = 0; j < sp.idx.length; j++) beta[sp.idx[j]] = p.b * sp.sign[j];
    for (var i = 0; i < n; i++) {
      var o = i * d; arRow(X, o, d, p.rho, rng);
      var eta = 0; for (j = 0; j < sp.idx.length; j++) eta += beta[sp.idx[j]] * X[o + sp.idx[j]];
      y[i] = rng.u() < 1 / (1 + Math.exp(-eta)) ? 1 : 0;
    }
    return sup(X, y, n, d, { classes: ["0", "1"], featureNames: seqNames(d), meta: { beta: beta, support: Int32Array.from(sp.idx) } });
  },
  oracle: function (p) {
    var sp = support(p.d, p.s, 77002), d = p.d;
    return { predict: function (X, n) { var out = new Float64Array(2 * n); for (var i = 0; i < n; i++) { var eta = 0; for (var j = 0; j < sp.idx.length; j++) eta += p.b * sp.sign[j] * X[i * d + sp.idx[j]]; var q1 = 1 / (1 + Math.exp(-eta)); out[2 * i] = 1 - q1; out[2 * i + 1] = q1; } return out; }, note: "真模型 P(y = 1 | x) = σ(xᵀβ*)" };
  },
  bayes: function (p) {
    return once("sparse_logistic", p, function () {
      var sp = support(p.d, p.s, 77002), q = 0, a, c;
      for (a = 0; a < sp.idx.length; a++) for (c = 0; c < sp.idx.length; c++) q += p.b * p.b * sp.sign[a] * sp.sign[c] * Math.pow(p.rho, Math.abs(sp.idx[a] - sp.idx[c]));
      var sq = Math.sqrt(q), phi = function (z) { return Math.exp(-0.5 * z * z) / Math.sqrt(TAU); };
      var acc = 2 * simpson(function (z) { return phi(z) / (1 + Math.exp(-sq * z)); }, 0, 10, 2000);
      var ll = 2 * simpson(function (z) { var u = sq * z, pr = 1 / (1 + Math.exp(-u)); return phi(z) * (pr * softplus(-u) + (1 - pr) * softplus(u)); }, 0, 10, 2000);
      return { metric: "acc", value: acc, also: { logloss: ll }, note: "精确值（一维积分）：贝叶斯准确率 " + acc.toFixed(4) + "，最好的对数损失 " + ll.toFixed(4) + "（xᵀβ* 的标准差 " + sq.toFixed(3) + "）" };
    });
  },
  plot: "table",
  docs: R`**是什么**：高维稀疏的逻辑回归模型：几十上百个特征里只有几个影响类别的概率。用来比较不加惩罚、L2 惩罚和 L1 惩罚的逻辑回归，以及树模型挑特征的能力。

**生成方式**：$x\sim N(0,\Sigma)$，$\Sigma_{jl}=\rho^{|j-l|}$；$P(y=1\mid x)=\sigma(x^\top\beta^*)$，$\sigma(u)=1/(1+e^{-u})$。$\beta^*$ 在 $s$ 个位置上是 $\pm b$，其余为 0；位置和符号只由 $(d,s)$ 决定，与数据的种子无关。

**贝叶斯成绩（精确）**：记 $\eta=x^\top\beta^*\sim N(0,q)$，$q=\beta^{*\top}\Sigma\beta^*$。贝叶斯分类器按 $\eta>0$ 判，准确率是 $\mathbb E[\sigma(|\eta|)]=2\int_0^\infty\sigma(\sqrt q\,z)\,\varphi(z)\,dz$；能达到的最小对数损失是 $\mathbb E\big[H(\sigma(\eta))\big]$，$H$ 是二元熵（单位：奈特）。两者都是一维积分，这里直接数值算出。注意即使知道真模型，准确率也远不到 100%：标签本身是随机的。

**已知的结论**：Negahban–Ravikumar–Wainwright–Yu（2012）的统一框架给出与 Lasso 同样形式的界：若平均负对数似然 $\mathcal L$ 在锥 $\mathcal C(S)$（定义见"高维稀疏线性"）上满足曲率为 $\kappa$ 的限制强凸性，并且 $\lambda\ge2\|\nabla\mathcal L(\beta^*)\|_\infty$，则 L1 惩罚估计满足 $\|\hat\beta-\beta^*\|_2\le\frac3\kappa\sqrt s\,\lambda$；取 $\lambda\asymp\sqrt{\log d/n}$，误差 $\asymp\sqrt{s\log d/n}$。另一方面，$d/n$ 不小时，不加惩罚的极大似然估计会系统性地把系数放大（Sur & Candès 2019）；$n\le d+1$ 时样本几乎必然线性可分，极大似然估计根本不存在（系数趋于无穷），必须加惩罚。

**该看什么**：$n$ 小、$d$ 大时 L1 惩罚明显好。除了准确率，还要看输出的概率是否校准（对数损失、Brier 分数、校准曲线），并和上面的贝叶斯对数损失比。

**参考**：S. Negahban, P. Ravikumar, M. Wainwright, B. Yu, *Statist. Sci.* 27(4), 538–557 (2012)；P. Sur, E. Candès, *PNAS* 116(29), 14516–14525 (2019)。`
});

/* ================================================================== *
 *  真实数据（UCI 机器学习库，CC BY 4.0；数值取自 scikit-learn 附带的副本）
 * ================================================================== */
var ALPH = "#$%&'()*+,-./0123456789:;=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";
var LOOK = new Int16Array(128);
(function () { for (var i = 0; i < ALPH.length; i++) LOOK[ALPH.charCodeAt(i)] = i; })();
var P10 = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];
function decodeTable(raw) {
  var n = raw.labs.length, d = raw.spec.length, X = new Float64Array(n * d), y = new Int32Array(n), pos = 0, base = ALPH.length;
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < d; j++) {
      var sp = raw.spec[j], v = 0;
      for (var q = 0; q < sp[2]; q++) v = v * base + LOOK[raw.body.charCodeAt(pos++)];
      X[i * d + j] = (v + sp[1]) / P10[sp[0]];
    }
    y[i] = raw.labs.charCodeAt(i) - 48;
  }
  if (pos !== raw.body.length) throw new Error("内置数据解码出错");
  return { X: X, y: y, n: n, d: d };
}
var CC_BY = "https://creativecommons.org/licenses/by/4.0/";
function realSet(o) {
  var cache = null;
  function base() { if (!cache) cache = decodeTable(o.raw); return cache; }
  function cols(key) {
    for (var s = 0; s < o.subsets.length; s++) if (o.subsets[s][0] === key) return o.subsets[s][2] || null;
    return null;
  }
  add({
    id: o.id, family: "tabular", kind: "classification", name: o.name, summary: o.summary,
    params: [S("cols", "用哪些特征", "all", o.subsets.map(function (s) { return [s[0], s[1]]; }), "只用两个特征时可以直接画出决策边界")],
    // 真实数据与种子无关：每次都是同一张表；划分由运行器按种子做
    gen: function (p) {
      var B0 = base(), c = cols(p.cols), d = c ? c.length : B0.d, n = B0.n, X = new Float64Array(n * d), i, j;
      if (!c) { c = []; for (j = 0; j < B0.d; j++) c.push(j); }
      for (i = 0; i < n; i++) for (j = 0; j < d; j++) X[i * d + j] = B0.X[i * B0.d + c[j]];
      return sup(X, new Int32Array(B0.y), n, d, { classes: o.classes.slice(), featureNames: c.map(function (j2) { return o.names[j2]; }), meta: { fixed: true, cols: c, real: o.id } });
    },
    plot: "table", docs: o.docs, source: o.source
  });
}

realSet({
  id: "iris", name: "鸢尾花（Iris）", summary: "Fisher 1936：三种鸢尾、四个尺寸，150 个样本",
  raw: { spec: [[1,43,1],[1,20,1],[1,10,1],[1,1,1]],
    labs: "000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222",
    body: "+2'$)-'$'/&$&.($*3'$.6*&&1'%*1($$,'$).(#.4($(1)$(-'##-$#27%$1;(&.6&&+2'%15*%+5(%.1*$+4(&&3#$+0*'(1,$*-)$*1)&,2($,1'$'/)$(.)$.1(&,8(#/9'$).($*/%$/2&$)3'#$-&$+1($*2&%%&&%$/&$*2)(+5,&(-'%+5)$&/'$-4($*0'$?/I08/G1>.K1/&B/9+H11+G/70I2)':,:,H/,*A0*#=,3-D14%B,5,I00,>/;.F00-G12*C,6%G10(A-3/J45+B/7(K15+I.8,E/:-F0=+J0;-L34,G11)=,/'@-/'?,2*A.4*M2.-G141G2;.I17&F/0-C//(B//)F.5-H02)B.*&:,0*D/1-D.1,D/6,E/+(7-1+C/70V;2*M5@-U77,R49-T8E-]7)(G3B,Y4;(T4A3W;9/M68*O5=-Q71(L62+M:8/O99-Q4F5^8F)`94%L1>/S90+K6F+^67*K4;0S7A/V46+J45-K48+R7A-T2C+W5H5Z68+R87+M15)R0F-W971R:8.Q44-J4>.P7;.R:>.M92*M5=/U9;0S;;-N97(L59-N661P93-M4" },
  names: ["萼片长 sepal length (cm)", "萼片宽 sepal width (cm)", "花瓣长 petal length (cm)", "花瓣宽 petal width (cm)"],
  classes: ["山鸢尾 setosa", "变色鸢尾 versicolor", "维吉尼亚鸢尾 virginica"],
  subsets: [["all", "全部 4 个"], ["petal", "花瓣长、花瓣宽", [2, 3]], ["sepal", "萼片长、萼片宽（更难）", [0, 1]]],
  source: { name: "UCI Machine Learning Repository: Iris", url: "https://archive.ics.uci.edu/dataset/53/iris", license: "CC BY 4.0", licenseUrl: CC_BY, doi: "10.24432/C56C76",
    cite: "Fisher, R. (1936). Iris [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C56C76",
    changes: "数值取自 scikit-learn 附带的 iris.csv，它与 Fisher (1936) 原文和 R 的版本一致：UCI 存档的文件里第 35 个样本的第 4 个特征、第 38 个样本的第 2、3 个特征与原文不符，这里用的是原文的值。为了嵌进页面重新编码成紧凑的字符串，数值不变。" },
  docs: R`**是什么**：Fisher（1936）的鸢尾花数据：三种鸢尾各 50 朵，量了萼片和花瓣的长与宽（厘米）。统计学和机器学习里被引用最多的数据集之一。

**形状**：150 × 4，三类各 50 个。特征：萼片长、萼片宽、花瓣长、花瓣宽。

**已知的性质**：山鸢尾与另外两种线性可分（只看花瓣长就能分开：山鸢尾都在 1.9 cm 以下，另外两种都在 3 cm 以上）；变色鸢尾和维吉尼亚鸢尾有少量重叠，线性分不开。所以好的方法都在 95%–98%，到不了 100%。参考成绩（scikit-learn，10 折分层交叉验证）：LDA 98.0%，QDA 97.3%，逻辑回归 95.3%，5 近邻 94.7%，单棵决策树 94.0%。只用两个花瓣特征，逻辑回归仍有 95.3%；只用两个萼片特征就降到 81% 左右。

**注意**：样本只有 150 个，默认的测试集只有 30 个，一个样本就是 3.3 个百分点：算法之间差一两个样本说明不了任何问题，要看排行榜上的置信区间和配对检验。

**数值**：与 R 和 scikit-learn 附带的版本相同，即 Fisher 原文的数值；UCI 存档的文件里第 35、38 个样本有三个数与原文不符。

**出处**：R. A. Fisher, The use of multiple measurements in taxonomic problems, *Annals of Eugenics* 7(2), 179–188 (1936)。数据集：Fisher, R. (1936). Iris [Dataset]. UCI Machine Learning Repository, [https://doi.org/10.24432/C56C76](https://doi.org/10.24432/C56C76)。许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。`
});

realSet({
  id: "wine", name: "葡萄酒（Wine）", summary: "三个品种的意大利葡萄酒、13 项化学指标，178 个样本",
  raw: { spec: [[2,1103,2],[2,74,2],[2,136,2],[1,106,2],[0,70,2],[2,98,2],[2,34,2],[2,13,1],[2,41,2],[6,1280000,4],[3,480,2],[2,127,2],[0,278,2]],
    labs: "0000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222",
    body: "&V$*$4#V#^%%&%2%+(};L)7%z+h%I$1#s#)#B$r%c0#|'9eL)B%E+X%E$m$M#u#C%%&74%a)&5u)-%--*&e$C$;#c#O&4&Q.$|+yyL'7%J0D%M%($b$1#T%%%[>$W'2?k)7$q(*&S$/$6#R#N%U&G8$g*Q?k)B$i0%&g$:$6#L#>$c%J4$h(L.-)#%W.9&E$W$G#k#W$m%I5#y(2Ju)L%W.?'7$##v#F#?%%%y3$h(EzV)a$i+S&0#b$$#Z#@%7&.,$Z+0B#(u%T+S&I$X$'#o#G%4&@,%4).qa+V%-0c&K#o$)#c#=$D%A0$>(,:B*a$f./&%$,$2#Z#6$m%c3$V(xB#*L$n.X'/$,$0#+#8%D&fB%a(_^k+V$],c&f$:$/#1#D%X&a3%p+Sv-+#$x1,%u$4$P#g#N%*%r4$2+:5u+u$l.N&^$@$R$'#V%%&-7$g)hHa)V$T./&-#x$H$'#Q%4&H?$M*>l-*7$L,N&R#z$9#`#J%X&~6$[-3'L+B$f2X%v%]$B#R#R$w%~'$G(8ZL(B%A)?&E#~$%#Z#]%9&0.$t(~QV)k%e(X%-&H$K#u#D$Y%?/$h'ISk)-%Q(N%}$9$-#a#C$n%o1$J&M-#*#&&+I%%#{$>#m#=$a%:0$2&^1L)k%]+4%h$4$G$'#>$f%S2$G&)Tu*-%p)?%9$M%)$Z#Z$p%ZF$b&0zV*7%0)/%]$0$H#[#:%*%u8$1'oW-'u%2-4%S$+#s#e#;$X%(1$'&`]a)#$a.4&1$>$Z#}#I%4%x;$Q'ISk+V%E**&A$'#z#Z#>$r%60$h'c7#)7%X+I&##q$P$A#C%9&83%4)(b-*u$Z.4%p$%$-#z#H%+&2,$e*doL)k$l0h%z$6$-#g#F$Z%[A$g&R'L+B$k*w&&#t$P#~#c%4%aI$'(_^k+V$x-^%i$3$K#y#L$S%K3$:'#PL)u$k,*%f$4$2$,#B$w%y0$[(8ZL)7%L*/%Q$#$_#U#L$m%Z8$('Usu)k$b)c%9$$$A#o#@$^%A3$0')a#*-$F,4%;#q#o#U#@$X%V2$)&@iu*k$X+9&U&[$=#>#_%9&#*$r(8ZL'V%R(D%n$*$(#]#S%I&=8%0)_iu(7%C(h%_&L#q#w#7$^%Z1$4'-EB'k$x+I&2$=$E#P#C%S&X'$K(cC-'L%U,*%M&Z$&#j#E$q%U6$G'797&k$x'N%9$0#o#e#I%9" +
    "%{2$m(14k'L%@)h&T&a$5#x#M%*%W4#y(Ju#'B%>+w&f&2$%#Z#D%S&01$}'{w7)7%I+h&4$'#q#Z#C%D&G+$x)[(V'k%>*r&I$J$1#w#E$|%s6%4)hHa)V$_+c&8$,$$#i#J%-&V6$r-Lga*-%&-w%9$,#i#5#9$y&:'%k+-rk*-$o,c&-$$$F#g#;$^%z,%+(xB#+L%B-|&,$.$3#F#M&7&k6$]*wC-(u%6-/&'$>$N#f#Q%9%f>$I)thk*7$q/4&$$&#~#_#T$m%q+$C);4k'u%0+c%n$,$7$,#R%5%e*%;)nX7(V${,D&U$)$'#^#T%N%{0$m)~]a(-%;*c%R$E$N#c#D%9&65$G)NeL)V$h.%%~#j$;#b#J%c&d)$n*WOB'V$k.4$P#7#####5$-#:2#$#weL)B#[%c$L#H$%#Z#C$4#pV##%fb-+V#L'N$l#c#g#c#B$1$4L#8).qa(V#D$w%y#W#]#o#;$9$[6#D&M-#+B$A&w$P#K#u#y#4%m&))$]'CD7+7$k$X$;#l$?#y#F$$$WD#c%>2V-k$)#r$P#S$B#p#@$Z%W;$r'Usu*u$0'L%@#?#F#P#+%7&10%*(R>a*-%.%P$P#O#]$##+$:$q1#d'`hk*-%M%X%W#7$-#e#L$f$)N#$%YB#)##g(9$@#Q#K#c#v#|$'$%A%0oL+u%#'u$H#|#z$+#E#/#i;$2%JRa'g#[)X&0#r$M$Z#3%4%m+$]%t:B,k%,$N%g$%#}$P#4$#$a1#c&EdB(V$b%1%3$&$F%1#j%X%p+$f%pV#,7%O*r$&#G$'$1#C%a%##$F%_;L(a%))i#d$;#]#Z#?#d$E8#o&M-#+B#|$a%7#3#G#Z#3$*$t.$2'Usu*u$C$;#v%G#|#o#N#o$+B#Z$t/7(B$G%N$L#=#`#N#g$%$b9%[%vfV)L$1(9$r&O$1$F#C%(%MB$e$j:B*u%)%($*#5#e#y#3$Z%/4$/$a[V-#%(##$t$4#y#w#3$D%K0$R&YM-*V%*'q$2#K$=$P#+$/$F?$,$:X7,7$[&w%9&N$)$A#2#h$GT$C'oW-'##o%^#v#2$D#o#;$D%*,%1%JRa&L%$%c$o#;#}#o#A$D$k4$2$pJu+B%,$w$:#|$($D#7#u$QB$=$ZL#,L$,%I#c$&$H$e#5$'$I?$&$m{a,k%1&1#b$N$7$7#1$*$QG$'%*_u(k$" +
    "_'N$2#`$'$L##$D$GA$*#]l-)V%1&r$2$6$)#t#.#c$>K$E$T;L)a$-%9$*#r$3$;#3#S$$I$D&3Ik)B$T$w$q#t$#$.#-#L$9Q$C%JRa(B#t%I$H%A#{#o#5$^%./$i$4Ha*L%:#/#`$G$%#o#@%;%/'$'%d5u*V$t#h$Z#s#y#y$%$c%06&4$m{a*V$R*A#s$T$T$6#e#c#f$$=$a[V(7$,&r$H#h#c#Z#2$h%H3$R%7##+B$^$a$P#E#o#t#5%o&l.$e'ISk)7$a'9$H%d#z#o#5%*%zD%a$GxB-L$g$J$2$P#F#j#?$G%&0$,%jFL+k$t'm$h#a#Z#t#5#S$/3$'$ZL#)7$a&1$M$v$7$1#@$i$|8$#%*_u&V%C$k#t$+#X#~#3$c$L;$.$)>a(-$?$S$_$,#c$,#2$D$i6$4%;yL)7%V'F$U%$$$$;#7#k$aY$.$z?k'7%:#I$D$,#q#y#-#h$t;$D%vfV(k%-%X$t$.$%$A#1#L$XG$D%jFL'L$=%B$A#[#_#y#9$T$u>$r$z?k'7$z#F#_#b$P$'#;${%s3%@$t/7(B%6'N#O&B#R#~#I%L%P.&S%7##&#$e&1$`$t#v$1#5$h%00#v#}u#'a$b#S#n%1$g$'#E#r$tS#e&M-#+B$E&`#J##$;$1#5$a$rA$0%N7#)u$1$g$2#f$;$A#1$i%2B#d%7##(#%/$4###r#y$6#2$_%&K$k#qTu0a$k$K#t#n#d$/#3$-$H4$9#weL(7%>%I$U#|#x$A#J$/$z8$B$)>a)L$t#h$y%~#c#Z#-#f$$B#N%vfV%L#z$'$*%~#e#y#4$/$L;$]####(#$}&3#N$q$3$'#>%/%f6$X%d5u&V%D&r#Y$M%*$~#U%L(;F$])NeL(#%c%*$U',$S$j#D$D$~B$L$+iu'u%(#|%9(]#r$6#3$o%W4$k$m{a%k%&$/#y&|$0$1#/%+%~+%k%*_u&#%^$/$1$X#v$1#2$m%W;$'%%eL'7%8$-$V#t$&$6#3${&.>$R&_GV%B$h#o#q$U$X$~#9$=%-Q$Q%DC-(L$?%+$P#~$'$U#5$F%C?$`$0dB'V$b#e$.&{$/$;#-$9$WA$'$m{a&L$L&D%&#b$)#o#X#Y$$+#Y&s0B&-#%&w%(%Q$1$'#F#D#}.#N(_^k%u#2%m$}$h$1$P#@#4#p1#N)(b-%##,&/$r&.$-$6#" +
    "H#m#{'#O(,:B&B#%&X$_#V#~#j#2$/#;S#y(enB&##;'/$h$w#y#t#;#e#DV#Y*}Ra%k#C'^$D'J$@$1#6#L#0L#K&S=V&###'w$a(?$J$Z#>#v#>V#j(,:B&k#N%^%g&2#x#~#5#e#1Q#S)(b-&a#[&D%$%N$G$P#C$P#>L#L'~FL'V#}&N%-%?$P$1#>#]#3L#F'Usu&7$1&X%Y%%$,$'#6#N#3;#:(xB#%L$B(X%j%d$R$K#?#^#5I#1'6$-'V#t%c%t'b$,$'#9$/#RF#b'=3a'k#s&%$D&P#y#t#N#L#P3#n,QV#$u#n)I%E&0#t$1#D#X#8B#~&fm7$B#M)/&2'k#|$'#-####?#?'{w7$-#)$S%''?$9$6#3#m#CF#Q+gIk#a#`&r%U%k$/$6#9$(#ND#y,lOB#k#G'/%=&R$-$6#O#O$28#n./N7$##)&%%h%_$H$P#Y#N$E,#y-&dB$7#&%N${%0$9$;#N#V$/.#z0(?k###7%9%@$>$U$`#R$D$'0$=*}Ra$L#)$^%L%q$%#t#@#w#UT$]/aga#u#;'I$f#[#o$'#E#V#;L$,+a97$-#@'%%F'z$)$;#:#q#AT$;,*=V$B#8'|&.&i$/#~#6#w#UG$=-Z@u$##I%9$X%U$J$o#?$%#;V#n+Sv-%-#R)c&b$'$P$Z#@%%$*L%U3)w7$##j'9%f$&$J$A#6$m#qK%+1DYB$##W&m$O&K$/$1#5$N#_I#d+gIk#u#C%c%{%m$@$'#I#z#9I#K)?v-(B#['N%%%n$D$;#H#h#>S#[(urk'B#y&9%0&$$,#t#H#M#H?#Y(OoL%7#T'I&(%9$'$;#7#I#F@#c.Fc7%L#M&h&#'%$#$A#5#B#0K#o*A:B&B#T%c%c&>$F$F#M#m#_B$2/uPL'-#A'^$~%x$'#~#5#V#D?#]/@^k%a#T'S%p%'$O$U#G#^#V>$:-.-#%u#Y(9%^'>$a$Z#N$-#c1#k,vD7%-#f&w$?%U$)#y#>#?#2?#D(k}u%##]%X$y$p$%#~#3#M#4G#:.o4j$##H%/&O$|$9$'#8#k#HC#x.UQV$V#P'9%}(M$6$,#=#k#?K#f+mYB$k#S(/%^&S$9$F#D#w#MB$-+:5u%L#A(9%P&y$#$'#V#b#GB$'/88-$7#A)4%F%($.$'#V#h#FL$2.#.-$B#G)9&L&g$T$U#>$4#NO$'-rk#" +
    "$L#E&/" },
  names: ["酒精 alcohol", "苹果酸 malic acid", "灰分 ash", "灰分碱度 alcalinity of ash", "镁 magnesium", "总酚 total phenols", "黄烷类 flavanoids", "非黄烷类酚 nonflavanoid phenols", "原花青素 proanthocyanins", "颜色强度 color intensity", "色调 hue", "稀释后的 OD280/OD315 (OD280/OD315 of diluted wines)", "脯氨酸 proline"],
  classes: ["品种 1", "品种 2", "品种 3"],
  subsets: [["all", "全部 13 个"], ["color_flav", "颜色强度、黄烷类", [9, 6]], ["alc_malic", "酒精、苹果酸（更难）", [0, 1]]],
  source: { name: "UCI Machine Learning Repository: Wine", url: "https://archive.ics.uci.edu/dataset/109/wine", license: "CC BY 4.0", licenseUrl: CC_BY, doi: "10.24432/C5PC7J",
    cite: "Aeberhard, S. & Forina, M. (1992). Wine [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5PC7J",
    changes: "类别编号从 1–3 改为 0–2；数值取自 scikit-learn 附带的副本，为了嵌进页面重新编码成紧凑的字符串，数值不变。" },
  docs: R`**是什么**：意大利同一产区、三个不同品种（栽培者）的葡萄酒，化学分析得到的 13 项指标（Forina 等人 PARVUS 数据的一部分）。

**形状**：178 × 13，三类分别有 59、71、48 个。特征：酒精、苹果酸、灰分、灰分碱度、镁、总酚、黄烷类、非黄烷类酚、原花青素、颜色强度、色调、稀释后的 OD280/OD315、脯氨酸。

**已知的性质**：各特征的量级相差很大（脯氨酸在 278–1680 之间，色调在 0.48–1.71 之间），所以**标不标准化**对 k 近邻这类看距离的方法影响巨大：参考成绩（scikit-learn，10 折分层交叉验证）里，5 近邻在原始单位下只有 67.5%，标准化以后 96.1%——原始单位下的距离几乎只由脯氨酸一列决定。其他方法：QDA 99.4%，LDA 98.9%，逻辑回归（标准化）98.3%，随机森林 97.8%，单棵决策树 88.2%。只用颜色强度和黄烷类两列，5 近邻约 93%。UCI 的说明文件记载，Aeberhard 等人（1992）在标准化后的数据上用留一法得到 RDA 100%、QDA 99.4%、LDA 98.9%、1 近邻 96.1%。

**注意**：178 个样本，测试集约 36 个，一个样本约 2.8 个百分点。

**出处**：Aeberhard, S. & Forina, M. (1992). Wine [Dataset]. UCI Machine Learning Repository, [https://doi.org/10.24432/C5PC7J](https://doi.org/10.24432/C5PC7J)。许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。类别编号从 1–3 改为 0–2。`
});

var BC_BASE = [["半径", "radius"], ["纹理", "texture"], ["周长", "perimeter"], ["面积", "area"], ["光滑度", "smoothness"], ["紧密度", "compactness"], ["凹度", "concavity"], ["凹点数", "concave points"], ["对称性", "symmetry"], ["分形维数", "fractal dimension"]];
var BC_NAMES = [];
[["均值", "mean "], ["标准误", " error"], ["最差", "worst "]].forEach(function (g, gi) { BC_BASE.forEach(function (b) { BC_NAMES.push(b[0] + "·" + g[0] + " " + (gi === 1 ? b[1] + g[1] : g[1] + b[1])); }); });
realSet({
  id: "breast_cancer", name: "乳腺癌诊断（Wisconsin）", summary: "细胞核的 30 个形态特征，判断肿块是恶性还是良性，569 个样本",
  raw: { spec: [[3,6981,3],[2,971,2],[2,4379,3],[1,1435,3],[5,5263,3],[5,1938,3],[7,0,4],[6,0,3],[4,1060,2],[5,4996,2],[4,1115,3],[4,3602,3],[4,7570,3],[3,6802,3],[6,1713,3],[6,2252,3],[7,0,4],[6,0,3],[6,7882,3],[7,8948,3],[3,7930,3],[2,1202,2],[2,5041,3],[1,1852,3],[5,7117,3],[5,2729,3],[6,0,4],[6,0,3],[4,1565,2],[5,5504,3]],
    labs: "00000000000000000001110000000000000001000000001011111001001111010011110100101001110010001110110011100111101101111111100010011100101001001101101111011111111101111001011001100111101100010101110110010000100010101101000011001110111110011011001011110111110100000000000000111111010110110100111111111111101101011111111111111011101011110001111010101110111111100011111111111001000100111110111110111011001111110111111101111101101111111111110100101111101101011010111111110011111101111111111011111110101101111100101011111011010100111011111111111010011111111111111111111111110000001",
    body: "$DA#h#|l$(=#n*&3w'-PL51L2,Cz$6=#aW,a75+s#X)(js#gB#${B%g+)Tc%0u(v$`,%:i$.0*t8#|u#DiuEg#k{$a~+{$,$$MG#Gb#fq$4=V+`a+D*M#T##MS&:L+?T#K%$B@#9{a$_u#gi&:%%,V/`$BK%3i#_O$|$#AoL9{a02#Ii$W6/o$(l$?f#d?$g/%ddB2l-.6.0#kM#SI'fB-j5#U?'a+#S?k%Ta$mJ'TN$xk2$$:K$t@#vE'vC#[ZLB##9i#H1#UA.r#IU#>{$,r&:w&@%7/}u4*Xi#Nb#}J&@a%R}#w4+x_#ju#%?L)F}-:c#rV3+#Yq#NQ$e&-D8#ym7Cl-]E$M)$^t(0$.M$J2#X|$H%%eL#/su+A,r#lh#Rl(k--ni$5^%iJ#k7#%AL$4T(5w$mB(2$:,$eJ#nY%4M#UFL7(V+t#;1#aj)`#O+#I)#xS$rD%1nB,}k.IA*#;k#_u$m7%RT#eI&q_#QB#$HB$c}(29#xk0&#_t#bo$Ax)/v#g-#8PL>u#r)$G6.I#y8$,[#Ra$,X$U/7,/7+1+>#I9#Qu%~7(nJ#@v$JT#?oL$=L#eT$Xc$q-4F$;6$hs#v0%pv#ReL:qa3_#Co#oj/D#WW#T;#n^$l9$=]a*G#/]?=#XL$9}&oB(L_#sm&MT#BeL$ku#rT(Ww$.L4w#gt#t+$1d'5l#E(V65u5.#gg#gt0M#TW#Mn#w|%0/%UQV.U71B>Y#8_#l@%&7%1_#P_''+#Ork$R7$aT&S/#y#7l#b~#bW$70)Al#gTu=JuC:#^{#at2x#P_#Hy#n?%ec&-[V-U7-kH*#7b$S_$XL%-J#aH+]s$(YB$j-$85.BX#tVCq#XP#_N$Hn/f8$RIk?=VC.$tH$-K2&#fM#md#Dd#XW#LfV',7(5*l#Ak$$s%,u'1T#=g#r|#0YB#yC#o_%_X$G-;>#vU$45#X0$X$#5$-/@B2E#Di$*j,+#gM#kp#UI$D%$Du#+1#+c/)#On#jI&Mu(q5#Q+'g5#FM-$XL$QT'$%$Tk3{$(`$Ei#q&)Xv#TzV9C-;h#[>$QK3j$+M$5p#Uh%lX%oyL0m71rC1$&k&{J/fu0QT#2q,{s$6hk('L'V_1h9$Zk6w$9U$IJ#H0'OC#PxB8nB4v#XR$+U2o#gW#l%#Fs#~m$Dc7)]#+h&m#DJ#ti%_L&as#~R&X@#cD7%MB%d_" +
    "%Z/$,#4F#iK#qn#RY%&M#@a#0nB0o#+d#o~1B#[C#T@#h4%Y9%weL,va.6Aq#.3#~s$Zu$Ss#XH*'T#hw7%#u$L@+tm#su96#et#]z$1E,5$#zeL?:B9W$*q#x~6n#_o#^:#i*$fc%9C-,+70n:.#@f#oi%[k&3+#O;'{+#_Sk$C-$@i(^w$2u?v#vt#y7$4E*kM#{ga8/7AO#|q#zU.X#][#a-#W1#_N$$>a)PB(q->#L/$*i&#u'is#PQ$1+#;a#$E7#j+$N9$Ek7{#v,$2s#xY$|W#G|k6rk3;#B/$.`/4#lM#mn#lS%:/%DYB/c7/;>7#Vr#t5&o-(qJ#`&%ms#KD7$Z-$-+'#m$Zk8]$(~$GT$Ad'u$#`(V=YB:l#fg$XU0o$(l$F(#Vi$%X%%YB.fB(m'K#lr#m})?V0&@#Y.%(@#Mrk$t##d+$DN%GL7{$bU%fs#}x&Ub#g@uAOB0E#:M#mt(2#TS#R}#V3#il#w;L(v7,2+V#4Z#SZ$ZV%)5#o~$S5#AN7$]-$NJ$g/#tk+'#Zj#_L#ux$qb#AQV2v-2c#6Q#hj)a#RP#Mp#a|$AX#]GV&pV-*72#+4#O(#jV#|J#>P%(s#7{a#m-$+s$u%#n#,I#Vi#UO#gd&+.#:B#+~74~#Aj#@&&&#5G#1P#[?#VZ#HPL%Va+G86#5J#iR$J#$+s#|d$P+#;QV$hu$S_%VD#=V''#3D#1I#i&$*8#-z7*bu,p#=6$%t((#f8#cA#ah%Gc%qIk/'#389]#HE#Jo&8u'dJ#]H)>}#tX7%k7&VJ'@m$9a*q#w~#}I#pE*$8#rpVATuFN#UD$hU1n$0l$V(#R=$%%$QJu-`-*t&/#eN#z5'F#-ii#EQ$;s#82V$=B#Di$CD%]#>4$ct%~}#qY%sW#JzV;m70|#9N$4K/|#nW#yW#g*$VD%+;L.@u-G1o#r:#a2(m#.oJ#T2%'+#EpV$GV#pT%Cm%=u8e$V`%QT$CO'*8#^{a=rk9i#Q-$9t*K#u8#zN#n?%WD&(3a4>a9#>r$0p#iJ+'B/w5#k3'I+#R)a%{B$ss+*c$j--J$:A$Wi$%Y'TM#SW-COB?l#]R#yK0/#`X#[d#_^%)%$zxB-pu098J#2u#j7$aB$i@#BK&PJ#E+u$a7#n}&Nw$4a:U#t~#t*$#E*rl#iFLEC-A~#uR$K6.e#|$$2[#RI$)w%&zV,U#" +
    "***n#wF$pJ)$a-di$-I&*J#cfV%DB$r5',/$_a3y$,K$Q@#jY%;v#NTu5GV+]#8?$%K4>#f.#fK#bh$r%%?k#-mB,]41#HG#mJ&FV'Si#K-&P_#P0B$BB$5s%V9$S-?K$6t$BJ$0:*5W#s5u;}u?D#TX$?`(y#t.$#3#Vy$4%$Cw7,na*U/n#Z@#WE'n-)d@#OP&M}#N(V$aL$H@&RD$P7+B$&t$=i#aE&/.#BfV4|k08#>p$KK4-$#$$1z#`h%+/&3>a2D7/O0C#tw$Ds(z7/.+#VG&ts#e0B$Ja$QJ'S9$t-;K$DA$o}#{Y'wb#peL9nB7t#ST#Y~,~#Iy#E$#eh$]w$aEB)Gk0lC0#M7#oJ&D#'6}#N_&y@#Ww7$>#$o}(u9$+k4u#q`#s2$/n)lC#zsu6*kGR$']$8U2r#qb#x}#oS$Zc&@GV1qa052H#ZF$=@'#7*ST#mp&SJ#c97$EV$[}&_m$Yu9?$(6$Ji$/O'(.#i}u9m78p#E+$RU5]$&M$:2#Q}$tN%;W-,Ea+n1(#UE#?B&Iu*Ws#Hc&n_#O2V$40#xs&dN%#77}$EA%#s#}Y*lv#p4k9&B:I#d]$.`,*#k8#nh#^*$bc$r1L,WB-J3t#;f#H2$iL&O_#?N&:_#Du#$-h$._&Zc$RL3y$$K$AT#vY)oW#f-#:$-B(#pq$5K05#nb#ua#T?$Hw$qIk*Ja,>*B#Ju#c2%k-'gT#Q0%m_#Q[V$Nk%N@%3c$P75u$%A$=}$'Y'Gl#gk#9FLH_#Fj#uj0C#[F#ZG#Va$-N$mpV)w#,2/U#6G#n5%C-%85#R=&Ii#`L#$K#$Si&rN#}L7F#n,#i;#vY'uW#e%74rk9R#WR#h6,b#O/#N:#MB#7@#C]a&Zk'S,^#+'%L5#Qu#vi#AA#AI#3X7$KB%A5$+%#`a.~#Ip#L*#@e#8##(|#)4#'c#*G#}~46#^Q#bd#Qo#GO#AZL&X-([(_$DQ%:+,&B/95#^L$)T#9L#%E####$(N#sL1_#V0#^)#=7#>c#%{L&X-######m6/C#UW#R4#ZI$?w$M8-)eB*B2n#.=#=c#|V$L5#LZ%Oi#I^k$V7#fJ%oc#yL2V#d6#bc$,n't.#c+u?su0m#^q#lj04#S,#R[#D6#QO#JGV%Qa+')W#1-#Wn$#V$cT#4I$*J#41L#qM#fi#ON#}u7:#^t#g|#NO%3b#=ga" +
    "0fV2t#59#P,/y#C8#=>#rr$:m$Ju#)~u,=7o#0v$@_$@B$9}#kW$u}#D&B$=7#d5%_D#ZV=w#Lv#HT$O&%~M#Ua#4X72U#QX$PA3k$&v$3f#NJ%Mm%u.-/>k0u1|$)]$[+,|#/,}#Yf//i$B&B&:-(Z}+B/$~V:Q$W,$ms#`O+ql#~HaBk#FQ#Z3#j~.h#TE#P^#^4$T%$CW-*Z7-16q#@j#W^%(V&%T#IA%ET#>|k$37$0J%~/$2#4i#j`#u7$#x':M#Q8-5Ik;1#X{#ij0L#R:#O-#UM$'m$.{a)OV*]0.#,0#@$#e-#zJ#54$Ji#4xB#q0#H+$$c$%76r#b6#bf#|x'OM#R%76pV:_#Qe$K`+j#}l$0[#d^$pm%ddB/M-,I.d#^P#Eb'Du*~T#Vv'_i#iW-%+B%%5&:D$pL-B$8A$dT$4O(z8$#b-AD7;o#Lv#0Q*x#+m#)P#I*#PQ#6ZL#fh*t3h#'}#g=#IL#2Y#u[$hs#6ZL#fh%5J%*N#.P.'#*[#)B#f&$BM#+PL&1u4-#82#ij,z#Rt#OM#k4$=9$bD7,(V.s6l#6R#`=$Ha%0s#YU%ZT#Grk$Q#$3+&GD#{#4d#_6#dm$AE'mW#bm7=k#=z#jq#]A(N#J(#E}#]*#tP#vFL&GL)p.^#3v#M%$C7$[5#Mz$OT#@a##cu#l+$tc#ek,_#Or#P1#{x%A8#I_u+*V0/#C*#mA0~#Sw#RG#Jj#e##__u'3#+A+%#0Y$7@$5a$_s#BN$JT#=rk$MV$'i$?w#u79##Y~#^)#V&$jl#@2V2oL1R#2d#Y,06#FE#CZ#IP#E_#7M-$Eu'p,w#Dh$'J%@a%ai#R'#xH#1Ik#wf$~i$*/#]-27#H4#Hn#MO#fH#)na'Xk,_#.j#n~*E#T9#SY#>w#Ql#9xB%.L&:-^#+I#cX#qu#{+#Be$2i#0@u#}H#`_%'%#ou/I#Vh#XG#Mx$[M#/{a-Z#+b#@$#[,,O#GN#Db#E@#C:#;C-$`u+}/F#/s#B?#yk$@T#b*#i+#33a#}u$P5%0D#^L-C#H{#J##T&#i^#.DV*jV0V#81$Ft,~#z$$+p#j*$YN%Jiu0*k.N1Z#u9$R}(*k.D@#;>&E}#Fk#$/N%AT(7/$Vk0M$',$H5#d0%Pv#DFL3D733#?Y$#60b#`I#d:#N0#^0#eqa'-L)3*_#9-#X^$_u%qi#Dw#~J#6" +
    "l-$/N#F+#vX$:#8r#oj$&s#p:%58#EOB5u#/B#>A#VK-'#Dp#AQ#SC#K=#IOB%n-,V-.#:e#gU$iL%(5#nQ#lu#3_u$)B%~}$pc#ZV.[#Fu#Ga#`d#gW#.5L*lk6C#4%$Qt,q$#l$9(#_S$A9$nB#.,B,S-f#iL$%T(&B.n@#Xf%W5#HD7$uu$@5%-D%9B4w$N~%Ii$.E&~l#Su#=nB8w#C##zt05#^R#^'#hr$L/$j]a-%V-h6X#FW#|i%Kk',s#8]&95#Chk$WB$;@&|%$7L7i#mU#}x#mx'{C#P=V9^k:d#aH#hK-a#O/#N^#C*#7W##qu#R?+K([#DQ$'s%;7&7_#e5#kM##qu#R?$fi%Xm#k#.E#P:#Tj#FE#JN##7Q$EL,e#+f#54%@#.f#,##Ut#I'#=L##{`)x;C#'y#;F#D-#3u$&?$%5#;M-#dm$Z_%BD#4S&i#-U#,|$:O$4C#1Ik(M#5G#K/#GK(h#:)#5e#hS#i&#0FL$YB5d8o#Px$B+&0u&K+#eM$*+#,Ma$$&'45)9%#FB)&#8[#7F#cY#t?#%au&3V9/#?{#4|/S#/*#+d#t^#s(#I&B$/t+T6W#?I%,_%/u$Ji$:S&]@#I&B$/t&2J%`9#523c#/z#,r$0&$iC#.--&Ja2^#;T#uj0o#_O#[m#_*%8X%xX7-bL,t=R#fl$-s(cu)`i#zP+J}#z2V%=B$.@)Km$576K#qA#{&$00*El#zM-9&B16#e]#;D'[#4.#0'#?@#pd#nxB%c7188r#E0%C_%=a%(i#s('XT#Y8-$xB'55)*N#:-+$#3s#0t#B6$g.#497)=76*#E3#dA2d#O7#KQ#g4$@c$U:B+Oa,G4e#Fu$#s%b-&`T#hJ%~5#HdB$YB$'+&Bc$.k:p#i6#s.$HY'av#Ub-83a75#YH#{`2n#`W#_@#lh$Xm$gIk.07,x5J#?D$/@%+-&Q}#[L%W_#@X7$MV$ET%sm$17:h#lA#w6$1&&t8#IB#6xB6R#Ir#?Z/V#5/#0~#^S#ep#>nB$r-*?80#0g%&J$-B#w5$*r$t}#81L$0d$p_'.D#?V8e#5N#32$%x$eW#.[k+'-1Y#M4#T,-E#C.#?q#C{#Bd#Ql-%hk()*M#4w#eh$AB$H+#y,#rF#=N7$,[$e}$U%#Tu0/#B`#C=#e:#lA#4oL+YL,=#/^#9i+N#3a#.u#`|$Q" +
    "N'>Ik(H-.bEu#:~$%_$GB$Bi#|)-C5'2(V',-'5i-cc#>L.n#3j#2Q#zY('b$eW-8ZLAY#jH#eK*T#Mi#Ku#Vi#H]#Q+u&T7(u*?#0x#^##tB$J+#jK#IB#6W-$)9$ms$9D#bL+Z#K3#M*#ex#T/#/oL*:V,+#-)$Nt/u#}b$6[#M]$%m$OB#,nL(m(2#p:#TY(pL.$_#BC$iT#@$-$c7#gJ#~9%+-33$JA%)i#YO%U8#E2V9*k-{#/(#84(O#3a#.2#V7$_X$397&U-,DP;#R*#Za%|u%?+$w4.=s#k$-%37%1i=|9#7&'(#0Q#.%#[&%aC#4dB(vk*`#`>$:U3M#s8#|A#aS%$m%@u#,ma,^3W#Y9#p_&^V*g@#Q^)_}#XPL$G7#w+)aN$v#;7$9K$q5$*&+l8#v(V:L#6J#|]#pj)i#Wo#T{#YI$Bc$)1L):7)c4L#5X#@x$OB%&s#EF%;J#8eL$/>#S}%iD$)#,o#gU#jc#rd'&8#F?k4)a.F#Y>#`6*W#KB#HF#OK#ZC#M]a%mL*B-5#2L#ns$67$Y+#Fv$|+#9Tu#}Q#gJ$gX#ia/K#Oa#SA#WY$yM#8%7-c7.d#:G$-~.'#h$#ow#OG#m)$BZL+4V+5'G#k`#ms(;a+y}$.4%Ki#O5u%8##y_$?%$MV0y#|,$=@#|Y%3v#FxB5iu/(#,n#mj$E#U%#R4#y|$'m#yv-++L1x5=#E3#m_%BV&45$Kr&7J#1C-$$U%55)QN#iB#S#QQ#Rd#w0$Dv#-Tk,0#/f#5h$D~*1#yv$(p#`r%Hw%?v-0B#//5^$)W#80)r-2m5#j4)xi#^QV%V#%7@*ZD$ka*`$7j$i@#z0)[b#Rga=zV;>#b{$]`2q$8$$DG#yI'%9(0M-6m77RF{$$/$tJ,gu0Si$)?+1J$Pc7&5-+j_)=m$vV8u$O6$ji$0&*;W$'oLB{aO(#UV#fA,6#Ok#L@#Wv#yT#T$-%r7*@..#4-#v_$:L$aT#Kk$jT#=W-$#t$3_%I%#k-17#R*#TU#e0%?W#8EB,ka0P#>o#U`/R#ED#@a#d|#wP#]b-%i-+c9A#:g%8T$]a%4}$)4$oT#CxB#xH$;5&mD#^V9F#Iw#Ij$&x$fv#8a#*Vk0?#I4#k`)p#SL#Mp#b?$`%$Z@u+]B,m83#6G#ms#{L#iJ#]M'/5#U/7$da$`T'X%#yL/I#WG#Sh$$" +
    "Y(X$#`|k8*k8m#Wg%9`3u$Wv%/f#`^&'X'X7#9k#+U6q#|@$Ei+3-0|i#ld)hT#kga%QV#Bi)2D%f7;#$~6%y+$(d*1l#tzVGGV+k#[]$P`5J$'l$6p#qS$|N%`/75/7)F;i#Q=&0@)7L*K}#em*45#>C-%;k%l}.f%$Sk:#$-~$E_#pY&/b#B%79fV+>#M,#[j)Z#Hq#E@#UV#_*#W97%?#.A-m#/q$,J#q#$0}#S>${@#;k##s*$MT%-9#dk1@#MS#NS#nx%/8#?}u,J#71#>u$IU,l#zv$0Q#W8$(N$onB-r7.w.H#fD$Es'|7,,}#Xs$i5#F^k$hk$zi&Sm$qa4H$:,$hT#q:%8l#J|k7;L:a#F2#xA0(#])#]*#RM#}~$_^k)+a.=*-#FA%>_&/a&{@#z)&HJ#g?k%2a%$+%vX$%#60#eK#j?#g&%,8#MC-2.-32#1w$Oj3T#{v$0[#Mq$9N%$8--6#,x*&#Ta#Ee%pB);}#:~$~_#Qm7$OB$L_&$D%'k7K$:t$ji#`d&[v#l'L;0B>W#N'#`j0K#K~#Gq#J~#xI#o:B']-,a2_#7d$Hs$ka$h5#`~%l}#EEB$Ya$K}'HN#fV7T#Q[#O=#fn%dC#B'L1su2^#Mh#z,)0#^i#]P#h?$I9$E&B+eu.g2##PL#Mu&ja'KT#N2(25#Ziu%#B%%+'sN$&L)w#fU#ie#cn&Nv#D0B4974]#D~#yt2v#]J#^c#M8#o+#J>a&_V)z,a#@{#xJ$t-&AT#G(${}#0pV$(]$Z+%N%$#u5~#_A#if#Pn$pv#.C#+Wk-^#6D$&61Q#cb#e|#Oh$&X$TRa,8L*?/8#9F#YM$]L%lT$#j%gT#[yL%2u%)}$TX$'L2D#dK#lh#aY%.W#G/757#.$#1e#jt([#QQ#QD#:9#F^#L:B&;7&]&X#Dc#}+%H#&_@#Bi$#@#3iu$B7#C5#a%$&a.O#a,#le#Dd$48#3a#/D7(/#*m#lt,U#SW#Qg#[*#j4#U(V&Ju)J*y#7G$9T$`-%;_#RC$V_#:-#$1)$Ci$/N#ta2N#XJ#^/#jd$o8#4'L,j#/E#/6#~j.9#cl#cM#]|$b%%Asu-tL+p1@#LY#h/&^a'}5#xh'?i#a*k%=a#ss&8c$;L0W#v6$&@$&:'qb#e8->-#1,#BB$^U1m$+M$FQ#NG$FD%#rk-ek.Q*:#ll$I_'bu-#i" +
    "#Sn'$s#X97$W#%?_'Bc%$#8h$?K$xs#Y0'%v#VYB6Ik:Z#Co#^j,&#Ik#F3#^^#]t#Bga&]k,B56#@>$Is%&a%2}#MB$2}#0{a$sk$j+&,9#ZL,u#G:#FL#SY#n`#)0B*:V*D#7m#C3.E#7D#3k#[?#IE#+Jk#}4&78'#;p%)}$ck$^5$1^$ST#)Uk#_B$9T(u9#E72r#7L#7,#h0#oy#%Sa%yV',#Je#WA&O#Ez#Av#MB#c*#Wm7'/7)74]#0B#6t#tk$,J#UB$Di#7v-#qP$(s%'%#^#(e#H2#HE#tx$zC#:fV-Jk0I#H/#w`.3#]A#[L#Ut$29$=v-*5k,,2P#6k$p_$~u%Ni#jw&>_#M##$i7#os'G9$&B7y#f`#l9#tx&Gv#KJu6@u/n#Nj#n`3|#U3#Tm#Rz#n&$3OB(Tk),,f#JB$0@%Yk'Oi#R6$V@#Db-$78#p5$m9$-a=p#e`#u0#bO%(W#K.-1[V/)#8&###'/#######lS#cV#######,aCD#/R$IT#}L#Eb$'4$(J#######%?s&{/###+D######$)x$08#######24#O+#^j/$#I0#G%#BV#:B#AIk%3a*U*W#+~$PT#SB#|T#II#Ng#04k#pS#n5#km#a-:/#I|#L>#Qd#i0#1/7,2a/U#2;#D2-j#9H#45#Y4#{6#p|k&gV,p1g#*_$(i#za#[5#v[%J}#IGV$EV$$5&?9#CL3M#;8#6V$'0%QM#D^k/&7.h#E3#J~-_#>9#8H#XR#nk#H|k$OL/r3Q#?($LJ$va%$J#fD%MT#GV#$(e%ET&1%#L-/U#>M#;3#]E$Pl#,rL&zu1$#9i#i,)Q#T9#N|$)r$yX%pb-.qk,[A{#C&#c]%&a&KT#aU&@T#hW-$e7#y@*`9$&-.T#c6#lB$In'f.#seL;Ra4X$'{#Wj,X#Fs#Au#iI$$N#|=V'?7+83y#8[$Z+$fB$dT#pr%W_#HD7$fB#{@&^9#^u61#K##IG$5O%z8#GN72&B0l#Kx#`j,n#K/#Gw#Ge#Z4#D]a%EL)%.u##y#`D#-1#>z#6F$$@#1Ha#bi#WJ#W9#`V44#K(#Kt#XO%*l#:w7-J#2i#5b$tt.)$C.$bf#}r&3%(qIk9QV3]9d$D[$M_.NV70@#YD-J+$JGV&(V%s5(-9%SL4j$xj%b_$6x+?.$@[VGxB?a#S[#TK/p#Ct" +
    "#@-#Jq#WS#dEB%C#'h4&#0`#jU$&B$3i#w7$^}#B1L#lQ#{_$zm#]L6&#I@#H~$6d%Eb#JRa-6k1'#H}#C)++#7l#3?#]h#lq#YQV%4V(o9~#DG$@5%M-$}T$Pr&Bi#EZL$:a&)}'[w#Fa-Q#:^#75#xx$pl#3'L)Xa-i#Dy#cj/=#N]#IK#Wu$9m$MOB*K#*Q:'#=`$k@%I-$b}$FI'e+#c|k%p#$a_)2/#a#1z#Nt#J%#dx%Kb#?D70^k*C#E/#ut.'#a'#Z'#@Z%RX'-ga,]L*1Bn#?x$GT&:V%jJ#Kp+w@$|1L%oa%4T1wm#vu0$#ct#_5#7D'pW#xga5X7,:#`)#K6._#?[#84#g4$E9#tzV&ku,XB{#;b$q_$Xa$[_$9|'C@#]b-$vV$qT*=9#Gu.x#;b#8%#fE%4C#2}u*Wk,+#K/#6G)m#0G#,e#j?#jY#W$-%Ek)UA?#)-#=/#gB#;'#mi%Ls#L8-$=V$/5&YN#5s+L#2^#.%$9O%XC#B@u/{a2.#Wq#Z~0/#HF#Dl#V(#fb#M*k%O-)}0@#9:#cQ$T-%6s#ha%nT#9_u#zb#ZJ&`%#dk2d#M:#P5#|Y%]8#5V#+z7,d#Eh#8t)f#3[#.?#R`$>X$;D7%qL%f;*#9I#ih&-B$9_%'r+)+$;D7%qL$|@(mw#3P([#1E#,J#Wx$}M#6(V'hB#|#;_#|`*g#az#`u#k^$lc%@^k.$L/46c#G$#fI%i#'8}#_X%ti#I2V$W7$#J&c/$Bu4(#z6$.+$KY(4M#_)a=%79L#^3$*j1a#il#l$#jr$x/%xB#.d7.R=z#Tz#t+&Qa)Gs#r]']i#nM-$eL#sT)=N$R77T#}j$Bi$I&(gv$#nB=-#5~#r{$Ct.L#s8$&2#Ft#Y1$#&B)vk.t#A#Tl$'s&5u(os#=b#iV#@=V$6Y(6T$8w$VV4W#|U$AT#L&$08#?iu1]aHr#)h#U6$8#Dp#@s#Qa#Xh#OD7&8L)h/I#&:#.2#JL#M+#T*$Zs#5c7#lk#bi$[c#ZB'G#I&#H0$%x%[8#=zV.(B3.#EU$Kj+8#{8$0f#_^$-c$~su-ck-)0S#gn$Q_(,k-A_#k~%@J#M:B$|u$U_'TD$j-1@$2U$bT#|x%P8#LGV7a#1j#Dm%.t.`$R$$~f$/?&?%(qw7;pV4f7v$f=&H_.2V?x@%a4.oT$hk#%9L'^_.*m%8#0?" +
    "$Z~%Ai$6E'v8#l^k?hk5I#?p#xU$@#],#[9#dr$-X$61L*/#+q2]#71#[5$L-%05#:G$>i#GX7$OB$F_%DX#{B'H#_6#c:#gn$sC#CZL2)a1e#?m#k~*J#S$#QV#7X#`r$,v-&M-'%,4#(o#{_#Wk#|@#Rg&i@#b4k$=B#R_&xN#kB.x#R5#U`#Fn%kv#LpV.*V(E#:Z#qA+B#U[#UN#K/#R_#4Sk$Hk)1,y#.u#[,#w#$EJ#D)#qr#.;-#YP#V}$#D#y#/q#[K#a*#UO$Ab#-$a)?-+t#5_#n`3_#Tr#Sb#PG#fo#f97&mk*l/Z#0=#l_$7V$Zi#>G$2J#92V#qL#`J#dD$,V>9#jj#nf#yE&7.#Rrk3Ha82#>]$OU-7#}M$7Q#Do#ha$;M-)z7,q#T#e8$6+(QL,3}#B2&+J#Usu$b7$S}%6%$ju28$5`$a@#FE%M8#KYB2&B13#.S$#6*J#b~#`##j?$~9$VPL-T7-M3C#GP#s_%RV'*+#v&'t}#KV#%ku$xs('D$#u*$#b`#e1#ox&7$#;4k4W-.G#==$XA4.$)8$>Q#Z?$f%&P4k13a/c/I#N_$&5%O-)}+#Hu&_5#_dB$=u#|i%sm$nB:{$66$f}#cY'Jb#k&B8FL6B#Dv#^t&}#K6#Fd#`|#y.#G97&V7,-3G#,u#Vb$Q-$&i#]7%hs#/W-#~y%@5'#w#a-)K#QS#L##tO%qv#/8a-,a81#MS$'6-r#eC#h;#cr$;D%#}u,}V,b+u#L@#S?%ta(.5#V?$Us#FfV$CL#h_$y%$Gu2T#wj$4s$%d%[b#Rm75c71/#?z$.~00#jC#o&#YS$C/$Jiu)xa/7,z#Gh$-T%Wu'Ui#G1%.s#?GV$/W#w}$o9$J78q#},$6}#px&K.#HyL34k8=#:Q$)~'c#eb#ic#R`#xZ#}*k*A7+H+*#99#VY$Q#%Zs#Jy$Y@#7eL$Vu$*s$jN$3B+&#k~#v{#]n%)8#8+u3{a/s#4I$IK0V#yv$0Q#R?#{C$XC-+Lk*%+.#Yo$&T&eB*Ys#S_$N}#G97$._#s5$[X$m-8S$2j$g+#xd%NM#TzV4%741#:H#eA13#N0#L@#N/#NO#_1L&BL(p.t#0w$:@#rk$[5#e>$5T#@l-$,-$(J%/c#mu:f#R:#X'#sY$Tv#>su.Rk1'#@O#XU*g#FE#C.#_?#R4#PC-&5u&,-U#IP%" +
    "__&*u&H@#Z($J@#Drk$[7#dJ&NN#a#1{#Kf#L2#c0#xv#/w7+Z7$^#7K#UK)@#DS#@O#T]#[$#O97&UL*P,`#*1#kH#Nu#f5#J#$Y}#4dB$(X#t5#r%#Tk.-#Dm#Bi#Y0$cl#4;L-Mk/C#1$#}U+g#_{#`H#l4$EN%-##-_7,|0V$M[$C@,MB.g_$%*'$_#v4k&M7(H_%MD$@#-M#st#|D#rd%B.#MIk7X77U#5:#Sj'+#DM#>n#kr$1c#^7#(wu*v.{#=6$65$CV%H}$34'&_#?##%JB#|}&0%#PB'2#A%#?_#mn$w.#-d7-]k(|#17#B^%R#6G#3-#P?#;'#######,E2q#,d#2+#W7#a_#T*#Io#######$pJ%sD#Au%@#4w#4S#_&#Uf#######4-#AI$.K,;#i.#oG#UT$1m$>]a*BB+v0w#fy$4}'`V+?T#]4%-@#Irk$Ka$Bi&//$O71f#|A$>J#gx%J.#FYB2$-0^#AP#UK+L#E4#@=#cr#xs#=)a%>k)Q4H#65$v}$M-$l}#[$$ri#1>a$2k$p}&9D#Yu3F#Gp#G@#rx$sl#,RL*vB.A#@m#fj)v#PG#L|#Iy#y.#aIk&n-*}0j#.J#Qa$0V$6@#L.$__#5^k#y;$]5$79#mk-u#W{#V{#gd%ml#=m7/PL9'#A'#Mt(q#?4#:T#@-#GW#?l-#|Q&j*c#2a$*_$>V$CT#Ye$ws#;w7#cD$++$mm#Pa,a#BJ#@L#LO$2W#/&u'67+2#1(#Z`(P#J/#D0#jS$DN#Qm7&da-GCY#C^#D]%lV%9T$&|(Wi#FJu$EB%ts-SX#_#'~#Kp#H'#t0%jC#.]a*MB/w#Y{#YU*^#K-#D(#ch$rD%;nB,0u4}>G#:/$@J$tB%6+#M;'5_#^GV%;k(|i'[X#eV2{#R/#Q2#on'eC#[ZL:%7Rj#Y>#}U-)#a(#aa#Cz$5/$8fV'Gk*Z3^#FQ$w+&,B'%T#Q?(gs#fN7$ta&2@-MN$%L1z#c~#jG#Cd%jl#Brk-Eu1?#M;#wt)*#[i#[3#X?$$w$1k#)oa*F/(#1C#N/$bL$j}#PE%V5#JL#$pu#n}%$N#}#+d#e`#e^#h0&&W#J?k6ga/R#;6#p,,-#U:#U(#Al#U@#GW-$^a'Y)P#2G#P/$#a$m}#/Q$bs#8|k#ei#a+$B/#wB.Z#W}#a*#@o$wC#6?k*Jk+f#3k" +
    "#gt/?#P/#Mj#h^#cl#JeL&:u3L/.#F?$3s%[-&Ls#_y$.s#;(V$J-%a@#kw#j70K#Pv#Sz#f&$%M#-$B*jV5.#-C#0i/6#-T#)e#R%$EN$n*k%au/wH=#,-$|}#Z##Is$A*)Hi$(eL$:V$s}0KN#/w6a#+S#*3$/&'}W#gJu,fL6S$0{#BV):#96#4I#a^$g/(^1L,d#3TSk#t7%p}'+L(@@$/r.V+(Ju#)RV&HJGg/#FB+?#9x#8d#eO&*b$.Ju6GV40#sg#RA&h#B+#>P#Uv#G=#;N7%5L+V/A#/]#Rn#oa$)J#v3#on#1iu$$N$|i#uN#Q-'i#@e#@H#jx#jD#+ka)lk1F#1+#iU):#R/#Oy#Ql#mu$;fV'?#+N0M#4f#T($@#$|_#qC%6+#I[V$2{%L+&4/#q#,J#XR#Zb#z0%LC#I0B/#7=F#Fj#_U,0#J@#G5#Ib#Xb#S{a%t#--0c#/(#j.#uk$4s#N=$_T#;[V#}'$9@${X#cu1a#L6#N-#]0$sC#:}u-/B45#A5$@t/:#vl$$/#fI$nN%U$-0$--.0##ri$=T(vL-hs#vF(pJ#e;L%;V$6}(%X$UB1U$$`$F+#sO&}C#P8-5dB,}#;o$6U-p#ll#vr#;9#_f#dX7&Iu+e&%#Lo%+s&DL'w@#67&#_#IfV$EB#v@#jD$;B4p#r`$'+#5I$jb#:8--IB-c#(5#]K&E#Hf#Ev#P}#Hd#;C-%J-(u-.#*r#Lx#R##l_#NG#xh#->u#jd#p5%$c#^u*,#II#J]#cY$3W#-`V+aV-U#>Z#OU&[#?a#;n#=%#6k#&nB#n5'9+?#5x#PX$>k$LJ#U6#O/#%:u#Kg$'@%3c#U7)s#Bg#C_#W&#bp#%>#'t70&#;8#X~.^#Gv#Bd#cS$29#yOB'[B-E34#OE$_+&w-&uJ#zk%c5#WL#$J#&6s(/w#`u2j#Nk#Kr#ln$~v#;0B,ik4n#?Y$Q`)x$$b$9[#J.$7/$^=V.y-*W%#$+f#BF*aL0t}#zO&PJ#Y]a&LL%x+&'/$ga)K$3t$[T#Qn%0b#?zV8yL,i#+?$V,,F$)W$@z#f|$nX&K]a2su-h/)#jK#qJ'}B./}#>'%S}#Uga$Zk$,i%~9%@u2|$TA%SJ#ud'I$#y)a?ga:+#MA#`U0v#L)#Ga#Y|$$9#g>a&OV(M6[#7F$Y}$O-$ns$3|&^i#JX7$H-$C5" +
    "(Pm#ck5R#M(#Ls#w:%UM#7pV--L*n#Ki%#~0d$BC$vG#G>$2c$nM-.}#+8)4#bI#[,'hB.8_#GS%r_#FpV%#B$Ki&R/%O-5#$_`%gJ#^E'*l#Tga@{a9P#Lx#}j.2#^M#ah#G+#Iy#;&B%GL((&##+(#s@#_k$6@#8C#db#-5a#lN$H5#jN#~L2B#^`#gA#I&#ug#,W-*,B/$#)M#NK###?i#:l#T.#N5#C97%+a&W2Z#)n#(/#M##W}#hg#y'#0W-#`F#Wi$R/#Lk###=p#=J#uO$6C#/xB(bL(p#;G$5t-,#ml#wT#L%#uP$0|k+-a,:(}#Z2$;T'1a*N_#U#%jJ#DIk$}7$Zi&5c$Pa2s#~6$AJ#Vd%=.#@[V54k0p#61$>U3^#uC$&M#_*$gX%{Tu/su(@26$5Q$>_+.-1:@#UW'5i#^B#$yB#K_(6N$t#9W$>U$ns#nn'G8#aEB897)[#N3#}j+'#_:#a;#W%#g*#D.-'a-+#*;#4i$(5$H7%15#II$I5#+}L$-n#cJ$#/$#u/5#a6#h[#]&$bW#+5a-Nk,A#-;#`A%}#J{#G]#[h#]&#U7#'W-,~-`#0p#Ey$.L$@+#kD$3+#7k#$Su$H5$aD#bu'%#L]#LK#on$7C#2B#.YL1%#1*#l`.%#Rf#Rt#N(#TB#m@u'9#(}*Q#Km#|J%z#'R_#Sa$&+#>V#$1x#v@$5/$8a6p#nU#~o#qY$WM#D^k1@u1`#7h$'6%J#f8#fy#v4$b9%krk0Tu-):&#FF#E.%SV'aJ#Lu%Xs#Y.-$]a$8T'&c$Ba(X#wt$.s$$&'*l#l|k9V#5C#W)#QU(V#AD#=N#Y?#N=#A2V&4#(]5Y#-_$kT#iu$RJ$^4%B_#4yL$zu%os'm9#J#(B#;##:O#]&#b8#'rV(@L&h#7,#Lt)'#>B#9v#K6#>;#######,_-t#;F$xs$fB$s_#rk#|}#######&(5#.w#L-*}#=A#;l#LO#Q/#######/f#*B#5k(;#.n#,?#O(#=}#######*D65#/,#SM#pB#V_#wt#dz#######%E_&+9#1m(X#+p#+7#V&#T+#######.I#>'#DO,=#:.#4`#U>$D9$lD7'Xu)jFa#GR%C5%xu%Ui$Er-Y_$^k#&&B&nT8$c#I#0h#=3#9k#fO&?M#O&B/8-.`#h{$2A.V#ml#qZ#Vi$bD%MD7-z-" +
    "+11h#8D$/_%.a&(J#ZZ'js#g?k%8L$,@'Uw$6V5:#v6#}L#s0(J8#mEB=.-3U#P[#g~0v#NN#NU#-}####$|7#7X&f%_#)q#{s#J7#xi#5z####$|7#7X$$_#+2#hL5u#M|#S)#.5#*n##}^$/t+-#&j#ej&f#Ma#LY#J]#7H#.CL$^k'R/^#6e#j|$:L$qT#pl#Qc#*]a#w@#Bi&%w#dB'Y#LA#Np#V&#B3#&HL'xB%J#72%Pt0R$db%Z(#d*%./&yL#:3a+7+Z#uR$FT)9V2'J#DJ%qs#JFL$Su#|J%=m&,u:0%,A&gi#yO'^v#fxBE3a1C#@_$gj5g$6v$Kf#i?&:/&I&B5N71p>c#^Y#Ph'RB,6T#@7(Yi#Sm7$y-$95(Jw%@B:q$V,%CT#{Y,%C#xdBGpV@0#vR$)t.k#dl#j8#T1#q8#vGV)HV)5)0#@e#|i%&7'6i#DE%RJ#;.-$5S#y@$uX$QB:-#|`$BJ#s&'&l#GoL6%77m#Fh#U6(l#E'#@f#N3#j*#q?k%wB$40W#;j#x+$I7$|J#cd'A5#n%7%-7$c}'m/#UB)@#Cv#CB#QO$_W#7C-*jV%g#8E$%61-#b:#d$#N1$(D#gD7'%V*I1b#-K#2'#f7$WJ#4S$K}#8v-#gj#N_%)c$6a4l#kK#|U#fO&g8#PnB2/74u#SJ#FK)##94#6B#PP#B^#$|L#>e*0.c#Fk$-s%Ea%J+$Vr$5@#$|L#>e%1J&3/#Ok-3#?i#?}#~x#wv##qu$=k25#;E$Gt,r#x.$,f#Hz#mV$-qa*3#)8'j#39#/p$?k%fi#/n#q~#4Ju#o`#C5#8D$_a2y$+`$R+#_&%bC#Ob-6GV58#2y#XU+@#FA#Bi#V.#Rd#S%7&~u()/6#1q#Q&$6L$Ds#^c#lc#;Ik$Ma$E5#{9#]L-I#Il#IE#hx#z8#5k#0W-.4#4d#Y`+T#F}#Ce#YI#L;#A'L$wV*@+e#+;$x}#@7#z5#h}#mP#65u#jB%v5$CN#WV3)#DH#En#lY#ul#-s-(@L52#.w#`,)t#Jy#GX#C?#`(#SM-%&k)h(@#1*#Xn$0B$I}#SY%Li#>/7#lO$SJ$%9#a7+I#L;#L2#Nd$d$#4W-(z#-4#+w#uK1v#]5#Wo#a|%gX%eW-+2B1e@>#6G%1J$aV&)s#jS3KJ$YzV%(-(BT0Dm#{k?{#c6#e/$$:.3$$1l-" +
    "8suL$$,R#eA0##NO#LK#Jg#Wn#JIk&T7*'1C#iq$e5(FV(kT#Ci$xs#>rk%27&45)0D#ea/i#Nx#On#=8#jK#)H7(uB)o#24#BK,M#5o#3)#5h#'R#######)Y3.#>y(Xi$na$pJ####Uo#######&eT#}/#9_,l#01#03#############&o#.f#`U6(#MR#I,#]I$Jm$OzV(]u,n8W#D_$k}%AL&I+#w('N5#RM-$]k$C+(um#zkBD#]~#er$A:(NW#Z]a5$-5B#mg#|U2##cv#_`#^S%5N%AQV-{L*S5]#5b#gu&Pu%;J#ki)'+#iSk%A7%25'6c$#V4R#pj#g[#h0(H.#]_u8@u2z#GS#ft*D#O'#MK#Ai#J+#SnB%y-+U*M#,4#ay#vk$,J#Kp$b@#@_u$&V$@@$Uc#g-.+#Pu#R1#Nn$S$#8k#-2#36#3(#pK0}#X'#UP#or$A9$u}u+(-+Z7v#]H%1_(.#(>_$P?&q}#^YB%Tu%C5'6%$'#;K#h~#j*$:x&RW#S%77_u3p#NU$EA0O#vl$*p#:J#oP$R2V*/#*u&o#_?$1}'G#+Xs#NI):J#pJu$kL$a5(-/$ML1+#|K$=s#5z%*l#C>a.B-+y#.e$QU15$&$$8[#H7$S/$SSk+DL*r(x#H%#t5&lk(qs#NC'=s#EHa$Qa#j_&+%$vL9;$Jt$q}#hn)X$#SeL8*k5+#M?#w~.b#]B#[N#W6$9N$[b-*FL,u3B#-r#D?#qV$V5#=v$cJ#;c7#v0#vT$B/$=V7-#o~$(J$&E'aC#b@u9c7GJ#WH#_A-z#J[#G=#T&#iA#Wc7()B-6.?#>t$4@$wB%S+#eM$w_#4>a$Ha#tJ&$N#mB51#RF#VD#td%3W#4##0B#/:#Aa$?A-b#t8#~l#M2$8X$Iv-,9#'{(Q#Cg#X#%t#'3}#T^%uJ#EPL$`L#~T%2w$Tk2D$+~$?+#oE&tb#O?k:yL20#>:%$65q$Iv$v=#i?%B%'oyL7##/a0d#U1$O@'oL,JJ#yZ)&}$7YB&&u$e+(?m%.#9{$V`%7+$$Y'mb$*JuEga50#H5#pt2Z#Y*#VO#}S$yw%/C-.AV08>z#VE$yJ&u7(a5#t$&V@#JIk$YL$PJ'M9$G7E0#{j$4T$s:)+M#^D7;qaCr#`R#a~,t#ML#IZ#X9$)%$+oL'eV,[2?#C]#p}%0B%u}#_7%*@#E" +
    "C-$=7$7J&A%#s71%#Ve#Zh#tE%Yv#D|k/Sk3,#H)$#K*h#b,#db#L0#z#$&5u(&7(y.##4g##6$Q7%J5#Mj%+5#=2V$$k#v_%Lc$6B,/#oj#~E#{Y&jl#M)a2M-7V#S)#D2+H#8:#3t#cS#_o#8b-%Hu,e1A#.D$6+#yL#bJ#}{$:i#,q-#x^$h}$z9#?a/L#5S#3;#s0$58#*aB)uu2o#7q$8K.f#n8#yT#J~#`]#zm7)_u-g%S#Xd#[%'/-*[+#Hz$W}#;%7$Fk$r@%*D$Mu1O#}K$:s#PE$Pl#:qa0Sk6##-f#i,1:#T&#Nt#Xr$Y9$4N7)>u+k=e#,)#cM#vV$%+#K@&Ns#C3a$%;%.i'*%#nV6'#ZS#VM#kn(+l#K&B0v-@O#_H$%,&V#aJ#ea#DK#Sc#mga&uk&A(u#.A##>#zB$]_#@_$9@#9fV#vx#5I#yX$2#'B#kA#x(#]d%DW#HW-/k#+G#8u$b,0n$.$$IG#NS$J9%9N7.mB*p#@#x3$FJ*gu/zT#l8'35#hiu&I7%z@$nD$u-4X$At$nJ#Wn&;.#Sa#:dB1y#'$#Y~-:#G9#C[#L+#[/#DzV$ek(:.l#/?#]-#qB$;_#N;$qs#=97#o|$$}%Q9#`a1I#Jb#L.#d0$}W#51L+T--k#?`%Zj,g$kl%vf#iI$]w'G3a6c7)T(t&Hp$E}>5-e'J$LI&/}#ssu$gB'xs'Iw%P7*2$dK%r+#Sn$T.#KRa6c7#x##8$=~4[#sW#~G#Y?$2m%?_u+0#%i,a#RM$[5&eL)Fi&]r-=T$|Sk'qB$e+1H/$9a4p#rj$%s#`&$sv#FZL0W-#J#1Z#u,2a#ZT#Ww#Ra$EX$S_u*}#0(2|#FD$o}&JV%}s$.r'?5#QSk%#k'X@'kD$,7=E#lj#jW$'0'ab#R7#8suG,#Xq#qK+%#XI#TF#[S$^%$D8-)wL.]8B#3+$%_$La${T#S4&{}#T:B$jL$Is'S9#{u3W#`~#cj#x0((8#^8-7Ik9z#]R#ZU,Z#I:#D*#QV$3c#vxB&t--*1_#7T$O_$^k$ms#tU'ui#nHa%5B%Ni'l/#`-3i#Kj#JL#r&&J.#F^k1'L7D#Cl#Gj+^#:]#6h#C$#P,#l=V$A#-'1`#?9$xT%M-$|_#D|&W_#l=V$A#%3s'Y/#KL0p#?j#;=#>k$Fv#:iu'Hk1O#=[$XK02$(M$Bf#Qk$E" +
    "X$h&B-fa.P)Q$&i$$i*)a1R_#]W&^+#NTu%-7$E5&u%%4k5N$O6%9_#l:&`.#P_u9N73f#BW$UK=>$&W$Az#G*$1%$WD7+4L'+&S#jh$3i'uV/fT#NR%}i#Du#$Ak#aJ$b9%MuI,$Z6%o_#rE'ev#U@u7(V/i#9y#o,&p#T~#S;#Td#p:#T##&1k&B1}#-|#+1#kL$?i#>u$n@#7GV#n~#ei%;N#wB'n#Zk#^u#gY%eW#8eL,z-,(#Ge#n,'`#Uk#RJ#_?$7w$*&B(PV-%1S#31#2A$UB$i+#Q}%X+#CHa$%u$?+%Pm#sB(b#]A#[e#nn%~M#CnB.7#3a#Ad#GU+c#:d#5q#`I#my#8oL%Dk,L89#2%$(5$+7$$_#ig$LT#-T7#ye%=J&TN#H#/%#:x#81#r0$Kb#+-7)tL3V#HY$*K.e#fC#i_#[I$99$WZL*}#,f1S#>5#c?$p7&/+#Ex%_i#AJu$(|$6@%iN$K77?#xt$-@$&E(4M#U*k5:B>}#^)#jt+.#Q>#Pj#GD#E{#Osu&%u'q*T#7/#_z$Y#%5_#S~$*_#?u#$-^#r+$|w#u-/s#Yn#_3#cd$=C#9'L.zB-M#:U#vj'3#Z/#[?#WY#d3#ka#(bL.=(%#Q[#V6&e#(-}#`g$O_#A/7$Xu$o5#d/$+7(J#g`#qL#f&$U.#70B0Ik3^#)@#JK)G#=E#7b#_S#e;#+5-$Q-++31#+s#a=#V-#]5#YB#eU#&O##[9#t@%F%#Ku+_#=]#:D#jx$*l#&:7(R#.a#Bf#~,)L#`]#a-#FT$-9#u?k'a#,.-.#0E#21$sk$[@#>g&b@#P}u$JB#g}%qX$'7+,#kt#j7#S0'/b#N##4%72K#Ci#c`2q#Mg#K6#AB#c.#h/7%R7('.E#1o#sJ#qL$L+#JH%Us#I8-$)W#e+&,/#ja8K#Pg#Ti#^:&xM#T=V1W-1$#QC#e~1%#R*#K|#cI$}D%A:B+NB.n=+#8]#si$qa%:_#_V'O_#^nB$qV$,+(oc#uk70#a~#^s$@E):C#rV#;Ha7N#q{$8t-I#rC#xQ#i?$d/%[m70M-.v1j#7P#GJ$f-&,i#NK%5+#IeL$dk#O5$k/$KV1?$%A$8T$70'Rl#bzVCGV41#KS#T66?#C*#@%#5##7p#71L#Ff+~*%#$(#`2#EV#7&#8V$h}#71L#Ff#x5$JX#R-;0#Db#Ab#:" +
    "3$Jl#0L#%WL1;#4Y#S,>k#B##?&#?|#53#).u#lP+f,9#/P$X}#vB$)5#AH#Vb#&}-#I~$G@%%/#U7E)#C0#Ch#C|#R3#%rV&dV1{#7&$aA7-$-b$L[#O>$*m%.qa->a'@)]#Qp$%+&eL*m@#Hh%;+#Nb-$C7#]_%MD%&k@3$Fj%*J#]n&)M#W3a6>a,c#CF#@g)u#59#2.#GW#:t#7GV%(7(M2^#.S#X6#Vu#es$7?$#T#1^k$3x$|5&:w#@a*y#4&#3h#}&#pH#+pa+wL09#Ae#sA/o#W-#W,#N?#[^#5'L%Ba(*,A#3F$H}$.-$t_#d)$J_#,$B$8V#Xi%QX#w77>#Y3#_x#dx$Sl#*cB,ok*C#:O%#A63$Cv$t[#S3$pD%aga2;L,K1Y$22#h&+$-5GT#XG&:+#[Ra%-a#~+%`m%qL;~$wt&HT#zO'i.#lqaD$-4+#G:$`~0($+W$K2#FD#l7$8]a*K-'S%$#d~#p_(IL,N5#jH&Y+#XV#%(a#bJ&hX%$#2f$E`$xs#^E%RM#J}u4pV*O#5&#uK71#Z3#YF#Du$&w$R2V(Kk&//Y#;t%J5$`k%r@#W'&8+#SSk$9B#P+&AD#{uCc#^t#e@#M&%`8#IoL-07&[#=N$>KDr#rC#{C#VU$Dc$yyL-t#+A-k#S8#[,%jL(5s#F|&1J#D.-$ca#T_%?/$m#HQ$-t$Qs#mY';b#L$-=QV1@#E9#n~)U#TK#S}#R7#X/#_*k'ZV*?*F#:^#EL$Sa%RT#Xr$:_#9C-$DV$E@$,w#qu*n#TV#[D#cx$:.#5xB.Fa-f#.3#aK(x#Jc#I##AY#32#0##$E-(H+J##J#Fx####;P#49#Ai#+$L#Mm$0T#Wc#_V,=#I1#Km#H0#]*#*da(#71q#16#S~,J#EP#?A#T,$Gc%.-#&S-.'Ad#1Y$XJ$~-$3T#[#*%+$6]a$]#$P+,ZN#Wa4e#Lp#C|#kY(_C$$m72&B6E#w{#p62]#Uf#U[#Bu#Z,#^}u%uL*x'n#Gw#rJ%V7'++#A@&$@#M[V$8u%8+%dX#sa2w#Xt#^s#=$$Kv#3k#*TL/5#,*$S~2A$'l$9G#[^$bX%m{a-|B-5.1#Qs$k5''L)[_$+r&g@#TB#$x7$f@&jD$cL7W$1~$Rs#xO&AM#Nc76?k2(#:L#Jt.=#=O#8X#aI#Pn#`^k&l-*S3'#@y%k5%2V%%J" +
    "$j4$J}#:%7$Gu&@_&>/#KL6F#=r#;3#~:#xb#1X7+@L1_#;y#j,+X#Po#P8#8c#@g#YSk$Dk'h*,#(f$Ss#/u#p+#VT$`@#J$-#`n$LJ$aX#gk4V#N*#R@#O:$S8#@EB)/70D#5o#f`'u#Qg#L|#Jr$J%$t]a'w7({2d#--#+u%$k$3+#N+)]@$-eL$c7#Y++7%#lk)@#a`#VK#a:)tW$(GV6;L.y#jg#Lj48#>w#9[#To#_q#AEB$~L,?1n#2D$Gs#w7$6@#aq#~}#0C-#jG$c5%.X#T#=h#B^#B(#|O$G$#0u#*Wk7P#AE#VK(m#EJ#A5#Z*#f7#YJu&[L,00%#3*#p@$07$M@#Z~$8J#=}u$8k$+i%Aw#XL-4#Er#F)#p:$[M#9;L.rV/6#=[$f,2G$2b$Q[#YI$gw&enB32V/f-%$,2#W3)xu33_#Ka'U5$?QV%?-$~5()D%3-3_$I`%9i#[O&X.#{?k=}u4C#>(#V6,e#Dj#AA#QD#Q&#DW-%Uu+Z-J#C9#Y^%F-%P@#Wr$&@#2EB$.z$r+#cw#]#.Z#HC#G|#XE#{8#-#V+*-0(#-x$W`.8$)W$@(#`S%&w&@GV/%7*O5v#mg#R_'0--[_#p6({s#xzV%K##pJ*r/%/k2*$CU%15$7x*$C$1m7BzV01#w{$;`+4#qv#|4#YS$'/$g>a-@-+E)r#8}#[3$jV&@+#Eo$W}#@l-$V7#h@$n%$NL1S#~K$=5#s:%]v#MdB9xB4O#@~$TU-c$$v$:z#]S$7N$u97-ZV*{*8#Yo#BL&hk*x@#D]$y}#EyL$Vk#e+%&w%4L0z$G6%5T#|:&Vv#Y>a;b-71#J>#rU+1#Xy#V~#d?$BX$Bqa)Nu,J/Z#Fp#U{%7a&WT#WT&%_#JQV$`-$WT%7%$'#.2#e,#l5#}x&c.#K[V3{a3d#?:$U`83$,l$@2#PI%?c%L971.-,:0g#v8$&5*v7/>_#WY(ZJ#Sc7$sk$IT(F/%-7>z$XK%0J#d:)8l#XOB:{a0x#VR$%`+H#g$#d@#~r%X9&D7#2B#1s@u#ar#r_'*-)Q+$&h(Fi#bRa%]B$Ci,Xm$5u.o#r,#w]$?&(7$#Zb-?Ra5n#l3$)K1~#nl#k##eh&ZN'D+u4##2zFT$M2%X_.VB3:@$@?*.+$.]a&g#$w+)Cw$NL8m$0`$=_#}&)'C#q?kBGV6%#X)$'~>Q#gW" +
    "#go#`^$kX%H2V-E7.M5F#1P$.}$IB%#5#LD%s}#Ga#$:V#9z&&m$?BMc#yA$'J$L0)Sv#kHa;rk8^#m]$_,6=$,$$I2#X^$,D%*Sk.S#+F)H#Cm#oi%:B([}#I#$a@#>/7$#z#Zs$7m%%7B1$FA%'@$#&&>v#Riu7zV4]#?f$=61p#ob#|g#Ij#TD#Gc7&Q7(Z&M#D/$3@%97'^s#PY$*s#2FL#z8#j5#pw$NL8[#{K$;i#_d$Pl#1zV-2#,r#.8$;U0m#sM#~E#MR$Aw$AeL,;-._(5#uE$WJ)_k-Fs#[Z*,T#^:B%_k%I_),9$TL3w$*6$E@#Rx&58#@EB5rk3c#9#$(t-h#cM#iC#@^#Ls#W{a&RB(I'|#00#k{#{B$us#/E#q0#33a#^P#;}#V%$7u8p#mj#~;#ME$uM#?v--X#/J#1f$:K0g#pC#|5#UY#sI$8rk+(7+|)P#F@#N$%U-'j+#Bu$5}#==V$6f#KT#pX$ba68$-,$T}$'&%ov#T$-;PL5C#9{$cj:l$/.$Wf#Rg$2N$siu-aa*t*T$?p$U_+]u:n@#CT$U5#>M-$0-#e@$g%&%uK'%$j'#i#qY%xM#NPL7OB1O#B1#L6-;#@A#9U#U2$2w#sqa&:V,X3[#Ia$%}&?#%QT#d|'/s#MHa$ba&Ci%~9#Ou//#B|#>]#[d%j.#:_u,ka2=#:0#nK0O#T4#RG#Ax#k8#V;L%_#)G,Y#=2$ws%:k%Mi#ME%c@#J:B$76$S}%Zw#qB7%#XQ#Xx#DY$lv#4yL*^a,l#3u#fK*7#Nt#L|#R9#SW#T0B$~L-V+Y#0a$(J#|a$I+#N=%H}#C{a#kB%7T$V9#gB/w#O3#Qn#aO$uW#;YB*/79`#4@#MK.s#@W#9F#bh$Cc$1>a&TV)i7g#:0$GJ$na$es#tt(]_$#ZL%0u%GT+>/#Mk1`#A##=%#j:%n$#C=V-[V.V#GS#v6*v#Wb#ZC#/{#+4#+zV#jL'}'7#%*#K{#,`#P+#6j#35#({7#L+#x+#Z%#rV,Y#Tx#[P#3-#=^#'jV'-B,x#)q#St&d#CZ#?2#Vl#d##L?k&H-*t11#+j#5l#Q7#ki#Xt$,_#2oL$+A$-J%EX#Tk']#B{#B:#ln$S.#2ga-m7/}#?}$o,/T$=$$`f#Q}%3D&#}u0Ju*C0@$?=$75-$-5R_#P1(q+#s/7$xL$H5'Y9%Q-4{" +
    "$l`%e@#c:(Pb#lc79fV1+#I;#Bb)]#6b#3;#My#BW#0[V$gB.C1]#4K$>T$7B$3T$P?$&T#-?L$29$95'1%#CB,q#6_#5u#xx#nl#'~7)E713#Ab$C`3I#tC$('#Kw#]U#kD7(r-(@(e#FI$A5%O-'nJ#MM$1s#7%7$'c#k+%>9$ZB=4$',$H+#h&$uC#=b-1%7-K#?1#ZU+Q#H$#DM#r^#_X#n4k,/a-[,j#_r%Fi'%a(4+$TS$VJ#2^k%D7%A}%Z/#Ua*h#D=#Cw#lx#c`#+ok.'#*=#(t#TA'z#C-#@.#Qg#8P#$p7#I&,y,2#1#$/5#~k$;@#oY#o{#$p7#I&$yJ#vD#SL*h#A{#B@#an#WA##[($EL0:#,m$MK.I#zb$3Q#La#Oq$,$-*67(L###;+#W}$}L&c_#f+$+i#DFL$mV$Hs#{m$Oa0_#|A$>i#`&$+W#?=V2|k./#%Y#nK,&#S2#S_#Ap#:P#;_u$SV(d(o#3=#~T$/u$v@#9T#EX#00B#]'#bi#=c#y-2_#Yu#bU#IY#ZE#0*k)H-+V#+K#qA)*#V7#UA#S:#du#[>a'XB.a,S#21#c0$A7$V+#@%$]5#4}u$=u#w5#rX#sB-m#Y>#Ys#XY$l8#4|k/BB2L#2_$QA5j$$W$7Q#Zr$Uw%^1L.xk,D0Z#_>#l5'H#*i@#d,%h+#U8-$Ya#ls&0N$zL>T$CU$u}$@x'HM#l&B:-#5n#Rq#Xt'l#Ep#CT#@B#>c#?eL&I#.W/I#V'$-s&_u&oi#k8$Q5#5c7%=-%]}$ED#`k)y#J,#Jf#H&#e.#+@B-8-4)#01$S~,I$%b$8=#]h$Tc%7ga.bV,:,{#Ky#kU%_L(f+#Ol%K@#Iiu$qV$%i$@w${75O$:A$k@#~Y'>8#Y=V?m79Q#=E$/t-)#m8#nR#`|$}c%aPL.2k,)5i#6T#bv%,a%]T#Ca'$i#Sm7$PB#g_&y%$@#1S#y~$&}#mY(NW#c'L8FL0G#]{#f`)`#Pj#MM#@G#yw$S_u'3a'/-K#6}$;@${a%&5#X='[+$*rk%4-$C+&M9#gB+S#RC#QZ#C6%S.#M=V/V#'o#5&#c6,`#L'#JG#Fk#=@#%>a#DP**,U#4o$6}$4-$xs#Wu#d{#%>a#DP%5+$FN#bu/>#K(#N,#H:#O=##b~$*N-L#-?#[,/=#Is#E(#I/$#m#v1L'b7(s6a#5*$" +
    ";J&$7$rs#[])*s#Z1L%$L$BJ+l/#`#3|#RK#L,#Px&/8#A4k1:B-##Uh#f`&l#NB#MF#5m#6v#?v-$L-&*)Q#'^#/+#Kk#f@#ET$FJ#7GV#f[$%@$Mm#d7&w#M,#OT#?j$*.#1^k)]7+;#2b#SU.G#E:#?q#B^$6c$;PL)uu4(0h#Mb$v_%[V&Ki$fr,w}$,}u'?L&95)yc#Oa.M#B{#@'#G0$yM#6*k.Pu2L#3f#Tj-5#CT#@(#JB#F-#A[V%bL-Y-`#4.$~@$O#$@i#Y[$K}#3}u$7;&8}%Qw#U72c#D+#BM#Q0#rU#,>V*`75w#3V#wU./#_'#]G#Jo$oc$s0B+0V*;;H#zR$g_'LB+b5#h6/r5$D{a&Iu'(J?-X#|-.8#]~#eb#Cq%eC#?Ha/ZL*r#H[#}`-K#`1#aJ#MK#|[#nB#(zL,,,R#6X#f@$h-%7i#L6%A}#5{a$Mu#vT%ED$%L2h#f6#jH#gn&HC#9;L5FL2S#D}#gA*$#Of#M/#Y4#gf#p}u'1L*L3F#-t#Po#Xa$Bi#rw%4T#@oL$Gk%;+'fc#eV+l#Na#PN#zd%6M#?a#0&B72#QB#Z,+[#G=#D/#FU#M1#E3a%nB,(*~#-[$*T#Y##s_#fD$W_#4Ju$(@$8T$+m#^#2:#Ie#H{#n&$p$#397.=V4)#3d#dj'S#N6#Jg#Ty#lf#2v-%Ek)J/;#*c#H~#ek#n+#TC$3+#+,B#}_#f+#[9#bu))#NE#Lz#f0$O8#)ML*ok+y#2i#pK&{#U4#Tm#Of#SY#0.-%E#(w-3#.{#I1#u7$CT#A=#fW#(;a#pt$bi$-m#ou(M#T]#Xt#Vx#}l#'Za*1a0}#1B#O`%y#@2#;N#H2#Bx#2:B$c-'A.Q#*+#o+#]a#S_#6[$7_#08-$1E%`5&.N#J7&-#;M#:##;G#Y*#&VL&yu)J#/`#Y,,E#Fb#C{#X=#P3#E0B'BV)61C#`=%0s'2a(7+#O0#{_#2dB$j-#|J%?%#aB/^#JU#Ly#S:#_=#*V#+pV'Y#2b#ut,H#Xd#ZH#1Y#HN#BV#$ca)G)V#02#F@$-L$cs#33$I}#0@u#_:#F}$@%$%-1e#bU#kQ#=s%BM#6@u,>a.v#;/#K61s#=]#84#Z?#Y~#Bm7%@B*(4B#6O#{}$u7$cs$&|$Q@#9|k$Tu&?@$AX#EB0V#8t#6f#Sx#fG#(/#&r7*D#10" +
    "$UK-6$(8$A=#j?$kw&$8-0-#+/4>$8(#}}+##2X5#T:&as#jZL%/V$Ci'mN%7#2m$P,%?T#|&'h$#pW-;L#2Y#U2#at.@#Le#HJ#GJ$$/#y@u&oB+$0x#@*#pT%9L%`+#YS&t@#_2V$fu%Hs'^D#bL/=#Mw#Lb#IY%AM#:QV,I7/L#=-$[`2f$.$$D[#bS%%c&.qa2m706?O$3f$d_+d#2?i#jM(Vi$'Ju%G-%HJ)69$z#6C$BK$rs#kY&qM#au#:ga66#P(#J~,u#=^#85#a4#Xa#@D7%4k'c4o#'-$O_#Bu#HJ#tX#t##9@u$/6$8J%~/#Fk0w#9[#8/#rx#zb#-Gu+(B*5#=}#Uj,G#E-#@q#Ku#d{#M=V$qu&v0r#;&#r_%-u$~5#Zt%~_#?Ik#{h$Ds&,X#Xk-`#Gs#Eq#T&$sM#2/7)m-*0#:e#WA3J#Eo#BI#;W#Ma#;EB$[u,f,m#2S$iJ$Ok$Hi#T~%Z_#6dB#ri%|@$]9#V-8k#FJ#DE#>}$Bv#+yB(z#5`#0l#j,)l#Pi#Oi#H+#Hn#$mB#H8)D,}#+i#:d#Ua$)_#8A#cA#$GB#>R#bi%*m#m#,E#R6#V4#R:$A8#$FL&*k/)#D$#9K(6#0|#.J#6D#0+#'U##JX++7I#*$$1}#O##E4#d)#A8#'U##JX%DT$Um#6`+z#.`#.0#BP#?n#$nV$eB2q#=V#mK&B#RV#R|#:O#5]#&HL#U,&G&j#/U#H9#xV$a}#5(#3Z#%QV#H%#qs#oX#s7(N#V*#^(#83#FS#$d7%fV*m#*_#hK'Y#O9#O$#FA#6|#(]V$+,'E(m#Ck#X&%8-&85#?(#?A#&PV#YW#kJ$d/#pV(}#TG#Z/#En#F_#%9a'DL)%#.{#XK-L#Ey#BX#KM#Hp#6Tu$IV,g/X#(H$@s#K-#Ui#TC#q5#/rk#ys$xJ#z/#X#30#Ev#E,#]n$#M#,jL**u8D#31#yj)_#ZA#^y#>2#4S#4rk%@V)D%t#9f#b:$O#%fT#Hs#Mt#)Wa#k;#sJ###$'k-n#`6#mq#E:#TJ#(rB*2u-f#%.#e6')#Nk#L)#K8#gk#V%7&0-)$/e#:u#E9${V%;5#Y.&/T#JfV$@k$1i'@X#jV's#R:#T3#YY%G$#8pV-FV.,#BU#V`$.#E;#AR#I'#Pl#3su$+|+Y/;#%4####Ju#A>#>l$Es#/FL#Wr$T5" +
    "$?N#U##z#F9#CH#N:$aC#-;u(nu7=#8L#4{,t#.L#+^#ar#OK#######/:>:#=&%}T$mk$D@%CS$Ls#######)[@*@D#.D.X#)y#),#kY#[}#######4S#A%#b6*y#KB#IW#H+#8)#(S##lE$f*S#)b#KK#D7#fJ#Gf#+L#&8-#Ia#h5#Uw#a-+U#Ir#Ku#OY#;e#%GB&KB&w#*L#^j'r#I3#GA#?M#11#0rk#].)n*:#.+#>Z#pa$-5#LB#K(#0rk#].$N+#)1#Za'z#F`#HK#D0#@x#(*B%=k++#(x$Ft-3#x8$+2#Un$/X$UQV,nB+?*J#DR#8.%5u(4i#FT$j@#AfV$I##Z+$ww$eV1J$-U$ZJ#u:&)b#SW-8xB0r#Ay#9v-6#5+#.7#X=%4X%doL)(B1-M^#K@$w@&ea%0@$#D*r5$Hl-&-k&B@+[m#:a/_#78#/K#]Y'>.#]v-1/74L#])#aU+,#Jb#I+#=P#3q#3W-%+k'X)=#AY%;J%/7&#_#ce$'s#/>V$FL&:s%UX#[7,,#Fp#Hh#1D#9&#%iV&Pa&g#'i#HA*4#=:#7*#`I$.w#x&B'uV*Y=E#@N$EJ$&B${J$*S'}s#UJu$vV%FT+;X#I7,U#:N#9m#qd%Wv#:Ju/%a.Y#R_$]K.($*$$G[#B^#n]$XYB,TL,_$-#YL#H8&pa+H+#CE$Is#D_u$TV$g+#r/$s-/8$7t$nT#J&$VM#D2V4YB3V#'j#fA'$#OE#L0#hS#q]#Rw7'4k(E3L#/4#pi$(7$5T#R^%5}#:OB$9B#Q}%fm#hu-)#S,#R&$%n%IW#9-#1:B,*#Et$_K0-$/C$FQ#lS%)m&Ra#5W-3j5Z#V|#n_'$a*bi#Mw%f+#KFL$c-%K}&%9%0#9'$P,%1i$*n(5l#f|kE0BPE#X]#^~)-#J%#Fy#Iu#W4#;[V%+#)J/Y#37#Ub$OV$Q_#M#$NT#/|k#^/#aT$L%#ea-H#Q7#P6#aO%&v#1Ha)rB/3#??#d6+K#M]#JP#[h#d]#KIk%Z-*4-}#-z#fY#~u$B+#]]#uc#3Ha#ly$V}$+m#e7-+#NU#O9#od$1C#/YB)wL/O#2F#t6&S#WF#XV#P{#IJ#8l-&Ea&O*o#33#u+#~#%-5#[A$-i#*(7#n^#ji$zc#yL)_#YA#ch#d:$%v#)Ua*;L(z#4U#],,/#Gu#E[#>u#8e#$vk#c/" +
    "&X.y#0V#b(#sk$9}#ER#WQ#$MV#Ov#p@$(X#^-.E#Gx#IX#EO#Wl##zw&La)g#4&$06/7#k.#oN#lI$G%%%N7-O-,s18#H7$)s&,7'^s#[F%>J#L+u$ea#x+%BN$H-7H#}6$0}$*Y&?.#PHa6Tu4+#A{$0,0S#kl#px#k|$C%%N+u,qk+~4)#W$$Cs%eu)=i$+?'D@#m*k$Mk&~@)T%$5u1`#kA#|k#tE%;l#M=V/xB0$#?6$-U)L#iv#m4#R}$Lm$_^k+cB+%-u#=)#O'%@#&;+#Qq&fT#Qrk$m-#pJ%hD$BB.)#w,$+@#uE(48#b3a;M-31#L7#g`-e#Q:#M2#S{$0N#|ga&^k*l41#4K#9w%,k$ds#PZ&g_#Z8-$6$%J+'TX#m-.&#Z7#Uv#e&&b.#NM-/2B9W#Lc#S,.=#C=#?+#_^#Yl#)37#y:,k.N#7b$}J$OV$XJ$F4$*_#')B#[4':s$@c#Q#2>#AL#?t#t0#r-#$_B%Pa64#.@#SK(^#B`#?G#En#@##$54#Db*x/(#.K#k`#zk$$s#OF#Z/#$54#Db$.@$H/#Ya.1#G4#F2#VO#sQ##b@%(70u#8;#`,-C#It#G`#Eu#=1#,Wk$'p(A-U#+($L5#U-#lT#iT#ia#+_7#mN$Is$^N#a75;#Iw#Kv#]d#k:#'N-'wV-~#5x$8~/U#pW#{.#fr$(m%)2V/:k*I.z#s>%3T)W#,w}#Xc$y_#[X7%0k$=_&QD$[-:O$0,$Li#vx%4l#TGV9V#.i#:=#gj(%#Pj#M5#R`#~4#R0B%Y-)X;w#*j#C7#5A#yT#K+%W+#JJu#v=$'T(y%#eB(K#M*#OJ#Sn%,.#4v-*7#,^#V{$L~0%#|v$2G#Nn$P9$Lrk*Ra,x/*#_|$K}'MB-'}#ep'S}#T@u%8k$d@'FN%'V;p$D~%*T#|E(]$#^5u==V:P#TR#F,+c#9w#5Y#YI#`s#C##%47,71p#3e%&s$:L$8_#ha$Q}#7rk#~E$[i%A9#Gu3N#:|#9+#qd$GM#0%7+%-1j#;#%&`33$Eb$}2#a?$C%&1yL4Ha+4(a$,f#cd*&u6Ii#Vt%0}#P7#$ZV#qi%h%%ma7l$st&D@#~:%|8#`PL=l-.J#;o#w`*Y#[{#[?#Us$2%$+qa(67,N2g#>H#QZ%EB&.T#Co&P5#SHa$T-$BT&(D$*--U#hj#p6#ed&o8#RD7" +
    "4M-3T#H7#A2*x#6p#27#Gi#v#$0|k%oa-q:`#+,#eh#oa#_T#S.'#_#c)a$'V$3s&sN#CB/=#:1#5e#^x&t8#YYB-%72h#T$#QA(p#Bk#=Z#]?#tU#g]a'.7*{88#(H#WE#gL#PJ#dE%&T#F'L$97$x@%Pc#PB+i#D[#@@#sO%G8#@FL0;L6>#Kg$W,0?$(b$>f#VF$I9%V##0[V.D*~#]l%Ei(La*R5#En&t5#Y^k%7a&`i%zw$oa=1$A,$aT#]:&xv#_L#?pV?V#>o#XU)F#Fe#Bi#j?#`E#UM-'$--U3k#=v#N0$|V%3}#{x$)s#7FL$FV$KJ%f%#^#)o#IQ#Hm#x0$&W#0Ik,dk0B#=X#HK(V#;v#6l#WA#u8#P5u%RB)E9A#=2%_i%$u$U5$xr(O}#D8-$Z#&Vi*8N#Dk+>#9i#6,#m&$bM#+pk(%a,`#E1#]K-6#HS#ET#Fd#Nq#,;L$'@(Q.c#1[#|}#~-$F_#ah$)i#*5##b($N_%>X#dL3e#L0#My#e0$Av#(Va)=u1[#@`#{K(Y#]i#_D#L/#ew#]u#'D#(.-3#=d#'6%4k%h@#EU$X@#9v-$@V$ci%Am$0k)W#kt#r>#]O%/v#>V#2L#41#An#Ut*%#DO#@m#NE#Os#CyL%s#)F2>#)X#PY#I##aT#x+#j{#.ZL#k2$4J%Zw#Vu,h#DR#D>$$&$'.#/.L+*V1>#H6#[6(p#I1#CN#k4$9N#1M-%5V2U4[#?f#q_%+a%LT#QI%dT#,_L$>u%H5%gX#Z7)B#H@#FV#eY$~.#&qu(tV4A#:3#W~+3#E8#Bp#=T#5m#-9u$K-)l+2#>t#Fc$n-%E_#Z-#X`#*C##j{$i_%4%#`L+X#Hu#Kd#CW#M^#&iL(:V/{#1b$*K-W#kC#iC#t^%b/&~hk2B#1[@|#QK$4+&D7(OT#y]*ni$Dsu%na(s@*z%$1k0Q#q`#v.$&0(uC#ypV>D7Ak#[R%@A+[$Zv%?G#j4%b%'[m7:[V,{/Q$+0#ZS*}B5(T#Wg'{J#Xa#$rV$vs&)c&-#/q%5j&ii$#x)~C#t^kF%7:[#Hl#~~4n#a8#db#[?#|$$cN7++-)S3@#a6$I@'6a)}T$*r%f+#a^k%1#$^}'vD$?V:V#s`$)+$2E%WM#Uga5pV/,#Oe#R6'q#BQ#>l#9C#Qq#[[V$nL*#/*#FS#Uu&2u%es#NT&v@#[" +
    "[V$nL%r+'rD#RV'7#DM#An#6I$68#1oL'pk.8#3o#b~-H#NE#J&#Jr$&m$I1L(Iu(:05#?^$F5&%k%Us$#L'zT#rIk%JL%=_'*m#aL.W#Nv#L9#Nd%/.#AOB.KL)3#5e#hK,s#Qu#Lz#bh$ED$@V#)wV-p3f#9.$Ii%:a$o+#he'Ws#d-#%@L%V5(zX#jV1:#Tb#Q-#k0%z$#Ciu2Sk45#C:#qU*7#Ud#V%#Ja#KP#5Tu%X#'',r#2s$8J$5u$es#O[#d4#)Ok#h/#x}$NN#tk2)#WO#]X#U&#vb#)S7)rB+r#4t#8*)J#1G#-p#Ea#e##_=V%yV,a5(#SH$&@'C-%ti$/I&?+#Kb-$rB%S_''D#9l)@#3R#/}#Ed$5C#.`#(t-,`#8I#?=,W#4n#2$#Y^#P_#EM-$g7'{8n#P'$+T&+u%x+#]x#ok#@}u#mz$J5%9%#QL1L#@5#@;#j&#{8#1.-)8B,t#A9#bj,>#KY#Je#;0#*w#$Na#aU(5%,#>]#fp$ya%_s#Q7#?.##},#L4$UJ#5/#eB,{#LM#PQ#;3#4i##Kl%$a*J##4#k603#R(#Pg#Ht#U=#M=V%~B+G*k#3g$L}$W7$hT#N(%95#91L#l,$=_$?w#ja6+#S:#TL#SY$ev#1{a)xk.w#/o#e6-0#N@#K8#U&#go#E3a%4u*j04#/5$/i#{L$>5#O=$hs#5su$8*$FT$SX#ea2S#MW#Op#f0$y$#2PL-:V0,#6;$2j,T#jl#r3#U0#mV#mEB(|7'p)^#=;$As${B&?T#bZ$zT#9[V$;k$-_$Dw$:B1x#o6$$T#jY$g8#7Sk.:a,6#-f#lA+'#RA#QK#Ae#Mi#>xB$na)V*p#(6#@%#C##l@#Al$:s#4w7#ay#[s$M%#pV-i#T2#Y0#[d$fv#3pV+]B0)#:+$`U0I$-$$If#O4$1/$B|k,[#)5)8#Wq#bq';V+,@#Uz%)i#A@u$mB#m}$9D%%#2z$E,$|5#iE%Yb#ED78l-.Z#0b$]t6%$,v$C2#WX$nw%9YB2[V,(.F$))$u5*ru.zT#og(P@#mu#&.k&Z_'3m%#a;6$Cj$p+#cx&t8#QeL>W-5{#:_#_,,8#JD#F~#P+#_4#Z7#%Q7*(-7#2c#RP$F-$Li#Qk$K5#;c7#sh$Ii$@D#ka0D#T;#To#mx%Bl#Al--v#5E#8q$n`+F$4v$fp#Ql#n" +
    "Z$Z4k-LV*?#_$Cf#qi+[->oJ#Np$+T#=su$O##Xi$-w%nV3%$p`&__#mE$aW#G@u9N7-Q#.#$q~0U$;v$_f#`^%2X&D7#5Sk+P/e$,[#Ih+H#28+#=2&5J#P0B$nL#v+&XD%K72@$k`%Rs#ed'MC#_eLB%70)#F-$1,2+#mM#rK#Uj$Zm%OX7-ok/G0X#GS#nT%g-'j}#OX'V5#o{a%'#%|_&yN$I78.#|`$5s#s0(J$#|PL?hkH6#Qa$$6&u#`q#d0#B##[R#Mu#&=7*C)+#*J#(n#eV$C@#H`$U}#60B$.f$(J$)w$$u'.#a,#kK#R&$mb#3nB-+a-9#1%$jt(~$5C$T(#Xh$]m%_Ra2PL-004#=U$2J%&B&}J#B0&%5#NJu$`7$+T'=m$o#-w$9~$`}#YE&28#Ub-;;L/z#G/$bj+P$..$NG#RO$+%%+Ra.&L(b(D#[m#E&'0V+a5#U}%(T#E+u$Ru#Z5$#c%0k/G$KA%2_$'O&K.#WC->)a/P#48#oU*)#Tz#TH#Ej#U>#CV#%Qa,%*O#)V#3;#iB#t}#?|$b@#1Ju#kG$J@$XN#qk,,#Z2#Yy#Od%9W#3[V+]B6T#;I$/,*)#jM#la#W?$T9#w-#)`a-B4R#*##1@#fk$#+#C*${@#;*k$Nu$I@&M9$-L*w#j`#p0#_0%n$#>+u2L#4_#JH#Kt.b#A>#8_#NB$mw&.OB*B-/TJF###$)i$}L#'g#pH,15%,QV&ZB$%+0{/#DL/##A##5S#Sx'.l#oL#5*k.N#m3#l~7V#Rk#RR#='#B}#2c7$F-'$+S#)F#|i#lL$#+#Gt$5_#,;7#^U#m_#|c#p->8#Wu#['#P&$MW#,lV*/B/U#4?#o6)'#UJ#TW#EG#cB#XM-&'V+/-$#&4#72#J7#VT#Jt&HT#B1L$%q$;J'vN#nL+N#Xp#XJ#cY&PW#CeL0$-79#Qy#QU-/#Dl#;8#q^%Im%@Ra*rL/]Do#.,#o+$3u#ts#d9(BJ#]^k$_k$2T'ED#`#:-#Qz#Gt$nY.8l$0fVC1L@j$'g#S`&[#D^#>}#s|$.w$*Sk)qa-_8@#3*#jR$>u$/_#Zc$wJ#=yL$KB$]_&P%#ZV,M#JD#DA$,n%`W#?ga3;L6i#M8#Q,(m#As#=N#B;#^.#Ok#%VL-O0u#(r#oT#_7#Z5#Kn%)J#8;L#rB$C@$>9#R7,l#DX#A,#N" +
    "Y%,v#62V+BL54#6n#]A1M#Jq#En#5X$*c$+(V&au$Y5O##t$A@$:L#BS#H~(C_#Y0B%(7%)s*}/#WV5U#M(#Ec#5c&]l#GzV0OB){#Nf#a,+^#Lz#GP#^?$DX#mga&V#*~4c#3Y#]}$b-$Si#[X'>_#_fV$>k$>_*GN#jL/C#Um#R0#tO'+v#KX7/,B0y#d)#j~'M#Ra#P:#FL#nh#cb-&T7)4)_#*}#5{$%k$&}#@J%=@#Fw7$'+#oi%-w#k-(z#W@#Tf#VO%}$#GFL.A70$#73#y`2+#[i#^w#I~#X5$0X7)Qa)?'a#Em$Vi%`a&85#nA$sT#MpV$z-$2i%KX#|B8t#^U#da#gd$[C#E%73k#-/#1m#_,'s#Jt#GG#C[#fG#yJu&.V)R/s#48#X?$_u$]5#Aw&M5#Y]a$Bk$Gs'Z/#^k+*#MF#J?#Fx%`l#I|k.=V/D#Hu#q`*2#UT#VC#6Y#D0#=97$'S)*(@#2q#A)$2k%$@#9G$N5#;Tu#r{$(J$AN#y7+p#Zf#c8#24$3b#0N7(Z--r#/K#S`)K#Dt#?[#FN$/9$F@u&HB+B=)#;B#sT%8B$~_$)?*z}$>yL%SL#Ss1-X#Qa*b#DX#AJ#OE&.l#I>a-6-)X#Zg$U`2#$'W$;Q#Yh$Fw%U/7/ZL-A,s#[N&(+(e#*n@$2r'k5$%5u'9B%K})Yw$Y77N$.j$G@#`x%^v#S;L9Sk.8#:@#HK%l#;H#6l#XY#c;#:ga%Ja+74O#+q#7p#fa#]J#P,$H_#-P##q~$Ii$o%#JB'&#=D#::#k0$d$#-^7+;#29#;_#6O*x#/i#-+#]|#b########-=:D#Q'%-}%|k%e}$gh%0J#######$A_*6%#;u.}#2-#1_#x0$=8#######,k#IC$'U.H#f.#gm#kI$c%%YM-.9V,`6J#`Q$4s'pB*Is#bg&B@#bFL%%-$@5'-m$^L6A$.t$LJ$4d'PM#iV#>3a5%#X)$mU0|$8l$VG#l4%BD&qw76=V/94u#]|#c?'4u,1@#Jw'@}#_97$Y-$U_&s/%:B5X$Q,%B_#|n)ev#|)aAv-=0#Vg#]t+v#J+#E^#[r#{u#`'L',V,h/z#63$YT$EV$v@#lO$g5#9hk#xO$R@$-D#cV2@#N/#MY#u&$qb#6l-*g73P#4S#s`+?#W)#Wg#Bw#J&#E+u'$7)M+T#'A$^5#YB#f5" +
    "#L_$>J#0|k$.f$0J#b%#ra1m#W.#[O#KE$3M#-L#,j#-_#/=#mU-5#U8#R)#`4$2w$2xB)^u+>/&#.C$4}#y#$Ti#MK%/J#Ll-$bu#_T$yD#qB3s#X/#ZL#tY%p8#NL#4yL/8#;9#e`+[#O]#LT#Bv#r?$$8-(&a(e+F#@'$-T%DB%y+#M5'$@#]-#$dk$B+&wN#eV-'#Pl#Q+#>r$v$#:N7-8k'd#46#QA(c#AN#>*#?T#CL#EOB#uR(=0T#+7#HK#]7#i_#@>$T5#:zV#R@#Pi&:X#Xk,:#Ei#F[#QE$}M#=a#)rB.G#LZ#YU+G#F|#D'#NP#Se#G7#%%#+h.E#=n#{_$n-%9s#Ma%05#=a##`}#qT%bm#bB0r#KU#Ms#`0$lM#4u#)[-0P#A*$CK/W#~W$'Q#s4%yc'EdB1l-.d:U#DG#R(%wu'=_#aR'@+#q-#$>k#~5(4/$Y#4R$76$F@$K&)|.$8Sk;975a#l{#Z~$B#Gz#E9#L,#He#D2V%6V)$)(#2^#q+$,-$P}#UX$5i#3}u#em#F5$3w#f7,%#ME#Px#nY$Zb#5c7+P#,z#6T#gK,T#Pt#NI#:5#g8#V*k%A7,'-&#0m$1@%%7$_}#8>'?T#N[V$@B%;s&N9#iu0~#W##TS#;X%S8#6m7+1759#6E#g6*3#Oj#LM#W>#q_#Lc7%zV*Q0F#&n#aT#>f#V_#0'$?i#6w7#v5$B5$Ac#fu/7#O_#O|#W0%*8#9C--D#69#=u#`U(o#JB#H3#I~#A:#>&B%T7(b*w#B5#aq%=#%tJ#gU#jA#3/7$;L%cJ#`c#_B(E#IL#J`#IE#P[#))k(wV+0#(7#O~,s#AV#=2#Y*#bD#b&B&[k'g4~#Al$d_%l7%Bs#{g%D+#;W-$JB$YJ%7c#Ua2)#Gz#Cw#mE$cC#4Ju,gB*]#;i$.j(f#h8#mz#S%#mx#hv-(Y-*Q,j#1/#Bk$5#$q}#;z$:J#9ZL$*4#t+#uc$5a+H#mj#yh#Zx$l$#@Ra0yL0O#3i#f6/{#O1#M7#=J#ks#p]a%?L(k/J#O+$ji%6L'9_#Si(9i#du#$`#%@}+KX#lu3`#Qm#W3#=G%'l#9c7)wB-:#AI$DA/2#w8$'9#]^$ED$_;L-uL-D.x#J%#^$%q#(?s#b@&/}#B|k$oL#jT&$9$]-1t$*K$K@#zY';b#Lhk;EB3[#EA#_j,.#JN" +
    "#Gq#J%#V}#K^k&;k-))b#;h$hs$]u%B}#RG%W_#=Ik$AL%5s$cN#iV5g#Nt#S7#_d$t.#4##.j-8##2N#T`+g#Cu#@O#Kz#IQ#FD7%YB)$-4#+v$Ni#gu#q5#Ls#zQ#1D7#f9#bJ#yw#]u?##JR#IC#wE$`v#9D7-gL2_#;v#Q,*w#B0#=S#b4#f3#IZL&(V*;1y#,N$;+#f##os#J=#sx#0&B#x0$0@$Zm#Uk3%#Dm#Cm#n&$PC#02V,2a2x#>I#>q0?#4g#0x#B)#Qf#R-##]}%F65##l$$@#RB####N9&%+#R-##]}$K5'Um#9[4h#5##/s#MY$~C#:(V&1u,$#M/#}~0k#`e#b/#H/$%D#yb-'ka,o-4#:$$5J$wV%b5#BH&3}#Lu#$Nu$F5&qc$+-8d#gK#pj#LY&lC#JL#30B4i#M^$#U9B#_m#e##E|#A^#^qa&FB+m&@#K]$Vi%o#'i_#]s$OT#BfV$-|%wT$(%$0a?`#gA#ww#TO#t?#6+u+-V5T#*C#ZU/g#H7#D:#V-#ic#CTu%c--`1F#5/$&_$LB$WJ$#w&P5#7.-$0)$n@$d%#]u3t#JT#IS#tE%Db#1EB-5-3k#7S#>y0A#4W#14#^S#Rv#=;L$Ua-f4p#GI&,i%NL%;+$Zh$k}#3su$)F%k_'VX#DL8D#7D#6D$#O$/8#*XB'_u1S#C-$'`/^#fb#n>#f|$d%%*v--NB.G7i$Up$'i-d#7zT#m('S+#[N7%^a$R_))c$tB4E$@U$x_#~O'ZC#W}u>C-2}#[>#dU%g#M6#K(#K/#Nq#A/7%{u(n16#/_#Cf#zV$?J#U+$=@#.5B$$M$/i'C%#dV(L#Mv#NI#gx$_8#.Xk-0k0L#P##RK0##B3#>@#Z^#Pu#.(#$AV)2/i#6L$]J$PV$QJ#^f#tu#+Za#iK%Ci$KN#U75k#D(#B@#dE$%l#'J#(@L2b#4~#V~-E#El#AX#HO#e;#heL$ia-l1.#6K$A}$l#$`}#bp%9J#Zv-$*j$A}&$X#^-3]#L%#I:#`d%'v#CZL+7L3B#Bu#z`'h#aO#]{#]*%%N$~$-*k#.H>k#T?$Is'}a(:s$$n)4_#f1L$zV%?5([N$'k*%#kj#jB#gd'0W#Kga0b-1%#M1#WK*$#G4#AI#cI$59#|[V(Ua,31e#1v#MS$.-$-}#RC%4i#DOB$Zu$?i$Bm#XB+Q" +
    "#G%#D=#s0%Bl#@Ik0^k0X#8E#o6-N#Vh#S}#N1$2w$A7#(ya+i02#/U#`J$>B$UT#=4&4+#Q>a$WV#}+&k/#u-1}#]`#_3#TE&WW#Q3a4EB0,#I(#Bb-M#71#39#a|#l(#.%a%JV3J9Y#f#$e+'hk'S}$H4%'J#*K#$>u%qs'-%#HL/G#:i#8h#q:$Av#%Wa(`u5.#?p#Et/r#8V#55#Ce#8y#&'L#^A)B3&#+3$5}#SL#Y@#PW#J=#%VL#K4#m}$sN#GB5m#8b#88#R&#TQ#$S7&3V+e#@I#Jt(r#>B#8.#VY$$%#s5u%gL,[8A#;$#z5%7k$f5#cl'P_#e|k$VL$cT'r9#Ra-[#FL#@D#iE&DW#H=V.PL32#R%#NK0^#?k#;'#K@#N=#P[V$g#-]-v#8m$V+$ok$_s#Ya%E_#HxB$>-$?@%6N#Ya99#H}#En#fd$i.#:l-,8a2V#:}#R,*b#A_#>H#D+#8)#3v-$c7($/m#&B#hK#:L#D9#RB#PW#.Z7#ij$Q_$oc#Ma,4#>Z#>6#GE#Jk#(_u'~B,+#4U#dj+q#MA#Ki#A:#@e#4?k%:u'K)+#7K#_1$a7%%_#cP$2J#)_-#cO$I}#Cc#fL,y#Ng#P]#KY#qH#'=L'MB)a#(l#|~19#el#a2#X'%Qc&hHa.~#-v8/#2f#^4&C#%05#_D*G@$*qa%i7#s})&9$&V4=#xA#lz#sY+IM$8C-BV#1M#h3#a6+r#Ms#H&#_^$Fc$(W-&M#+C:H#*9$D5$kk$(s$%*&l+#a$-$Ka$fJ)?m#[#/,#OV#Hg#w&%vl#Aa#,+u.$#Np$]`-x$-$$Dz#hI$Yw%xB#2Tu*F.h#Gg#l5%k-(^_#vy&)_#iN7%D7%'i&pX$ga1Q$36$Yi$2x&>W#fSk>oL3?#@W$MU0]#}l$4G#Z^$Nm%3l--lV,n/]#s]$yT'[-.}s#kb'j5#fc7%:k$|5'N9$na8$$2K$hT#pE&yM#T>a8*k3%#C7#|U+&#]k#_w#Lb#^)#M?k&Ua(d*r#8:#F8$(#%-5#Px$j}#5&B$%$#yi$WN$&-,N#^`#fn#]:$Wv#2(V,pa-a#1d#rj.$#XY#Va#`?$1D$U$-*}-)j45#/0#fv$&u$Os#L$$x}#>|k$3?#T@%Hm$.77s#kU#q$$-0').#V8-9V#4y#])#fK-x#O5#L^#O&#g(#93a%X7+v2$#@B#" +
    "QM%;L%Js#R^$H@#+f-#m9$jJ$om#mL0g#Ud#U*#[n$d8#+lu*tB6J#;l#sK)|#W,#W|#GQ#O|#O]a&^-*;-%#Br#q5%Aa&55#jY$@s#6qa$-R$Q5%G%#zu-]#]K#ci#Yd$5l#0l-,5-/u#67#qA-~#Ut#Uv#J$#Tm#3W-%ok(Q*S#=Z$]J$yu%n_#Qn$)_#*2k#s6$R5$j%#zV4j#],#c`#Q0$)M#(s-*;L-T#2^#s6)[#Vu#WL#B&#LO#=iu&;a(t)V#.I#Dh$'B$T@#Fe#r]#.Ea$AV#NT$PD#rV+,#W9#[|#Gn#wb#*fV-/u)C#0H#PA+A#C'#=B#LX$//$>hk'ML'j5;#36$9s%Sa$H+#q/(L@#tFL%3L#us(&N#U73Q#P0#DD#pO'd8#`##64k-p#Pi$;A4M#q8#|:#F+$.c$_^k**B'S'W#P=$]T&-a)E+#l)(&_#b$-%0V#~T&R%$TB>'$$U$D+#uO'hb#c2V8N7-G#?-#pU)i#UT#U1#KP#Y-#0%7$7I&p,N#?5#0b$o7%kJ#XK$0J#,V-#cr#Ti%(N#vV)+#Xj#^y#L&#}b#'Bk'+#&;#1R#Kt,W#=Y#8y#C~#@'#;ZL$EL1X+X#*n%cJ#^k#k5$-*$Ds#;ZL$EL$05'Kc#EL/U#8'#7.#Ah#NE#'wu%gu/Z#0c$Dj*y#vv$'(#Ly$=D$PW-*eu*B+e#7l#=Z$KB&Ws#>e$_@#HfV$5E#]@$v9$TB.-$%,$D}#b:%zv#X{a5zV14#B8#[`3s#IX#E+#[|#uu#h2V(;u+L7Z#3i$&i$E-$Us#nI%6}#@nB%(#$[+&Jm#]-7F#Ir#HS#gY$w.#6rk1pV.P#BS$A`7D#vb$&.#XZ$FN%A]a-8L*:-7#Bw#t_%[-'Xi#EC%5s#Q^k$EB#Us%'X$b-AN$2U$U+#qY'?b#t##;@u2^#Kb#{t+p#^t#`&#OR#r9#V8-%l-,:,u#/,#A,#uV$Ys#F:$2+#8dB#q^$ms$AX$'L.w#b`#lY#^0$}b#=Ju-:-9[#6l#xt-d#])#^D#Ff#f/$5qa&[#'Y+B#2k$7J$SL%#J#?'%9T#MeL$+@#h@$j/$&#54#e,#ld#Mx%y$#R_u.q#-)#8j$gt/$$1l$Sp#U.$6%%1)a1:B(P*G#bJ$85'aV,;@#Me%=T#K@u$mu#>i$[X%479=$Lt%;+#mx&P8#Z?k@0B*n#8C" +
    "#ZA00#He#D(#2#$)c$5D7%z-&64{#3($N_$O-$`@#^.*5_#w:B$wV$x},w9#Z#4{#Hk#Gk#>#&rC#KfV-m7+7#UJ$V,3~$&8$>G#]4#}0%;@u.4#)d'G#KU$9i%`u)+_$:4%,@#aX7$qV$'i$.D$a-8'$,A$S@$#d$yb#U+u5+u++#)S#[j7X#H_#E7#G;#V/#V(V%H-)2/@#+r$`J#yB#sJ#cM%w_#H?k$.q$3@'5X#^B@g#JR#I[#[0$zv#9D7+ka,m#Au#xt'h#[^#[^#d^#v1#z.-+$a)V/Q#8[#L.$e#%A}#U-$:}#6yL$H7$h_&>N#|L(M#_U#ch#kY$Ov#3zV04k.W#=]#c`+;#Lx#Jo#Hu#Jm#H[V%mL+6,7#)I#F/#Ku#mJ#;2#jr#2QV#qT$$+#wX#l7.:#Ql#Un#^&$T8#:>a/1V5z#7>#l,:C#S=#Q|#P9#a}#Fm7'%a&Q.B#=O$xi$u#%fs#Qs$:J#,lk$.J#{5%X9#t-Dt#WJ#^o#W0$IW#+_-,XV*$#;.#W`8i#FT#B3#QP#ng#}GV%P-+60##9L%UT$ek%$J$#T%d_#Xk#$/G%*J$S%#^aAj#KY#J)#r0%2C#H*k+KL1`#6)#j64;#Pl#Oo#K5#H?#F7#%Uk)6)T#-j$6}#bu$Ai#Q(#ek#5^k#lb#c+$0c#lB;b#QJ#Uh#e0#|l#41L*I7,j#1;#gt4/#O/#Mr#FR#Fp#1u#%2k)h(&#3g$)s$-#$js#T8#oc#*$7#kH#SJ#im#l79)#Q2#U:#]:$$.#(Qk*?u+8#+h#Bo7U#6t#3F#B8#As#6%7$=u)8-]#*H$^J#Z##Ui#Z2$>+#4v-#ho#|@$cX#BL?a#6X#5?#P:$%v#+su)#a+H#5|$966F#ov#|P#WQ$.m$F@u*yV+01=$#q#|})T70FJ#s*%MT#EYB$m#$U_'CD$r#;|$9~$mT$+d%b8#DX764k3(#KR%S,5H$j$%vz#b|%6D'}iu7qa..)|&#[$2+9+-g+s#f|)D+$,L#&5a$-}'S%&NB8Q%O,(%+#ld'wW#yD7DHa.{#8E#wK65#Yq#[q#69#HQ#Nw7%0#*4'r#0B#b7$4k$cJ#LO$lT#;B##kk#jT$7m#x#93#[U#b'#Ex$Mv#52V)s-+a#-a#WA,[#EK#Aw#H(#OS#MW-%4L(),Y#*l#Q'#aa#h_#[R$n}#=b-#x?$_J" +
    "%@/#Yk0B#Gr#FK#k&$uW#9{a-7u5=#>6#ij,M#P~#Oi#;O#Q)#`}u&Tu'F)0#-+#H+#Y7$9+#S>$Vs#6?k$'&#Es#{D#rL04#U`#[o#dE%+$#:1L/v-*L#2l#jU.X#Ss#PF#EW$;D$Fc7&Pk)$2{#5p#VE&77%+}#Gg*y_$'qa$c##v}+y9#xL1}#lj#ax#ZE)^$#uyL3hk17#r]#iK/:#Rt#Oe#Iw$,N$OzV'B#(X.F#9^#SX$wk%Ts#c%&_5#]|k$UB#zs%tN#qB1y#],#[~#l&''$#[ZL1X7.+#Aa#Ar,A#64#2s#Es#Jk#5:B#e,)u2g#=W$2i$sa$hT$/|$;_#/fV#Oe%C_%WX#Gk1##:##8a#p0$6.#*w-&*k3X#>C$?~2/#xW$&##Pg%8/%xdB/EB*)>E$#o$Di)7L/,}#]0+GT#vEB%qk$+@/q/$bV5f$0U$U+#[&(WC#diu;^k+3#oq#WU,I#H6#AO#m*$Y9$GxB)s7,|=,#E3$d@%m7%Ys$Y*&b5#b97%;V$:5(B9#aB1s#Mx#J,$@d&6M#KB#4OB/2#Mq#Aq,i#6a#33#Lx#T##HGV$s70+2h#AW$6}%8B${}#e@%2}#EQV$6n$L5&fD#Ga2-#9h#97#_&$W$#2iu++u4t#EV#]67O#Hg#F'#Jj#Q/#A7#%y-+o*m#Z{%n_'.B'd}#eP$^i#5*k$ML$Us&c%#d#:b#Lx#NP#HY#rh#)nk)qB,A#/[#}6(m#_R#aF#CQ#nM#iFL&|u)|*O#1l#+/$@k%&J#4@$v_#@Ra$&A#K}$ow$/k)u#iK#u1#K:&,l#Jv-11L/O#Bj#_j9R#IE#Gj#?)#37#######*.-e#I-'(5%]B&Pi#cR#gW#######%vJ%j%#bB@x#JS#MS#=[#?Z#######,F#0j#OA)W#AX#:y#YI$*9#d0B$yV+v7M#'*#6i#aL#C(#Bb&T_#F&B#oC#S+'`c#PV+0#Eh#?U#ix'Nl#MTu,p-.>#_q#e~)c#OL#LF#M|#kC#m&B&m#*2-4#';#10#Ta#Yi#G-$yT#L{a$%u$#@$ew#iL+0#SW#Rg#i:%tb#Nw7/*#3$#=T#u6/%#Z%#Xj#Li$.X#cQV&jk'{.:#>:#n+%MB%}}#>Z&k@#FoL$a#$$@%=N$'a3y#iU#lO#U&&ub#C$-3Sk-j#>1#qt*b#V5#V`#4G#IW#?M-$_k" +
    "+E)##'u#;##kV#u@#4f$C+#/7L#Yc#__$OD#u--s#]K#`?#=4%/W#4*k*bB/F#;F#V,(J#EV#A'#^h#ju#fSk%Jk*~4T#-6#~T$###xi#H'%As#W?k#~@$?5&D/#Ua-}#G0#CF#l0%0$#D'L,2a2>#Lq$/~-u#nC#od#[S%+m&)'L.CV/.4X#9X#jQ%r#&9J#x1)Ni$,ga%g-%LT)gc$2-/:#t`#xp#nx(2M#mm78w76O#LD#^U,9#JB#F_#NP#fV#H##$ta'P1@#.~$%5$/B$2+#GT$k+#497#^C#n}$4%#a-4[#Nc#L9#[0%Nv#7##*%7,C#;f#qt-Y#Uy#W'#B@#I_#H|k%V#(j)_#;M#cw$ZB%a+#9.$(5#5u##jf#BJ$]w$'73##`~#ld#K0$Hv#7_u-(V+l#:A#m,'p#TE#Pi#aS$3m#lJu)Q-*~5:#(:#:b#JB#h+#BI$R@#3N7$*b$.+%B9#qa*##UO#Xk#pd%hC#9nB3OB5N#NN#o`+n#Tr#SR#X*#gt#]0B&v-*N//#1]#f-#~a$di#4%#fy#7{a$/Y#[5#jw#s-/l#VI#[d#Z0$A8#8QV.5V-Y#33$*6$h#fW#h*#^I$Dm$^&B*a-+'1&#(f#%~#Nu#sT#T$$|5#M3a$@V#N}$b9$-u%J#i~#oC$%0&Bb#UJu4xB.%#Ah#aj*L#OH#I%#S8$]D%-[V(}L.D=t#C3$'+(8u%ts#bC+z+$SSk&DB&$T-k9#f#-$#Xb#Oy#WO'av#aL#3W-5R#Yg#z,*y#]%#_(#IT#Xu#e+u&L-&t&~#/,#li#tB$]J#79$Ki#97##i;#Wi#H%$'k1w#bj#li#Sn%6b#B*k,`k,u#//$TK-.$&b$:f#cS$UD&+Ra1ga+O/K#VP$>J&UB*S+#Kf&6i#XTu$La$05%rD$}-7I$;~$wi#~0':W#n=V=Ju5v#Jz#X6*3#G7#Bk#gr#vG#XoL&s#+n2[#@s#}5%6a%Vi#uz$@T#9qa$Ka$bT%rX#`u-^#L3#LR$#O$Ol#5GV/-V0j#@#$4t.`#kC#tC#;o#^P#Q'L%qB+g&`#2+#:*$:-$~J#-Z$Q_#4W-#_r$L@#~N$G#31#zK$,s#E&&;.#BX7-kkFX#:U#_U10#J6#Gu#DU#H9#81L$V-(F-u#/P#{T$$-$Fs#IY$5s#.[V#VW$$+$r/#jB94#S&#T^#aO$u.#23a" +
    "*nu4(#A~$Bj&w#sb$'>#@[#SU#Zsu(17$k%h#MA#q5%|B(LT#AR#gw#18-#w^#^+#R%$N-*-#z6$:s#BQ#uS#/yL->k%J#'*$DU/(#wv$(z#Xh$Cc$ZL#,XL.g/$#lO$0+(aa-8T#jo&'}#R/7%&-%Z@&oX$b-2Z$0A$Ss#gE%T8#CHa5FL5g#:W#at&N#Jy#I+#:K#:G#+r#$Ia)0.?#;$$G+$a-%4i$)I#{J#*wu#|f%W5'q9#_L'o#HO#Ji#=m#M_#%)#&?k*z#3y#i`/&#Ph#Ow#:%#I*#97#$UV*:,w#:X$E_$yB%F+#h`%9}#3V##bo$Z5%7c#n#5;#Us#WM#Q0$cW#,QB(3-/N#8G#|`.a#_0#`e#T'#l4#y97)--'h+D#0J$Wi$&7$r+#M/$I@#>X7$ML$L+$.w#~k5>#`K#gP#]&$Ev#7}u/V#+y#/2#c~,H#O7#J$#b*$Hc$+|k):k)M7_#0K#BB$1B$Js#PC%m}#DTu$;a$4s&>N#la.:#Us#Up$$:'HW#P7#4EB5Q#Y]#a~+L#Lg#IH#Lf#d9#PV#%x7(3.a#'^#Ri#[-#]i#:0$I@#3[V#sq#x+#lm#i-0c#S.#Rv#cd%i.#=&B0##3B#:|$It+b#{.$/f#Y|$Fm%')a.BB+X5v#p_#q+('u-}T#jW&c+#Zhk$yk$%+(FN$oa/)$3`$h5#rn&Nv#O[V7Sk-Q#Ol$b6/n$1M$Lf#c*$l/&#.-0pV+i0]#Y6$(+':7+Ji#[&&2+#V0B$oB#HT&Pc$|#7o$GA$y}#xY',C#dyL>*k-2#Jp#~U*n#b'#a`#WB$L%$(@u*XL)i7n#@z#YW$vu&MT#>k$|+#;^k$8V#A_%u9$+-,C#ft#o^#S&%CM#9w7/W-)m#Ep#p~3J#Yy#V;#k^$p9$rSk+C#0Q;v#LH$Ki%gB&}@#}S'OJ#Nw7$~V%%s*Sm#~k:9#bj#g}$B:'VC#Mga5k#:3#k>#bj*C#M]#H}#k4$,%#n3a''B,n4{#39#v_#~u$Ks#}j$`+#Cl-$K#%O_${/#ca-J#L>#Li$)O$o8#:@u-FV4a#9Z$}~.9$BC$uz#QA$B/%>w7/FL'z(J$M(#Nk-{L8H_#Pu&rs#U*k%`V$g}%NN%o#02$}~&5T#Z0'/M#RpV?zV1x#6d#=I&R#6a#.c$E*%S9$B.-)OV1_V)#Dv#vJ%kk$^+#~a(A_#O" +
    "##%d-%1s.lc#>-'q#7e#/k$N:&w$#=w7/_u3E#r{#Az&n#9Y#1B#u|%OD$]a#+c#.*Vt#5,$;J$;L$Bi%Nr(i+#e(V$l-%;s0)/#Aa)c#83#2t$Yn'3b#G{a0;L1:$#H#_6.O#K_#FH#d?$3N$-xB%aa.o8+#*g#TI#=I#e5#V`%K5#T{a$6y#`+&Z9#_-0Q#JX#Hb#qd%Rv#O^k,}a/e#I(#QA+8#BR#;k#o4$*N#V1L(;7,yE-#*F#oJ#cB#b+$C4%[s#97#$Xk$j+,19#Mk,c#@S#=,$2Y%2C#2QV.h-0Q#i]$0U)`#hb#p0#R;#Y'#i7#(^#*8*C#-X#/;#O7$e+#d.$5_#BPL$j##bi%)%$1B)F#f~#wV#lE$Bv#;&B3hk+2#63$'62o#gb#f@#m|%)9%k[V-Ra+?:4#;]$|s%c7&2i#{z(ns#o?k%Rk$]@)?9$/#?$#oj#uN$:E(lW#m|k>dB3+#^H#Xt(T#H/#CG#CR#zn#x&B&:7't6X#+~#C=#fB#j@#_U'V+#UYB$tk$nT*@X#V7)5#F;#D)#L0&-$#E5u0&B.U#T[#{~(U#]S#`c#G`#F5#N2V&/B)`&w#.r#A7$/7$e_#[Q$4}#5>a$?B#|}$+9#zB)3#]~#du#SO#w$#0YB,nu+U#*+#lA/$#Up#Qw#eI$Wc$}GV-+#.g=t#C$#dF%tV&@T#M.%R_#N[V$_7$.s&pX$'76Z#jt#n9$(n'J.#d&B=@u9L#c)#yK'G#]-#^:#Vj#rV$.QV(E7*U*1#Eu#A=%7L&gi#H#${@#IN7$)+#xJ$e%$+-(m#eU#p5#]n%&v#Biu.Ba.l#41#~`-H#`I#c'#Ow#n~$%Ik(Ca(W-6#BQ$&+%@-&w+#G~$g+#H]a$1d#LJ$$N$474o#kK#{s#`E%:.#GFL0oL*|#3-#TK,u#D4#?S#_*#mv#Y-#&57,^0Q#1[#m5#vV$HT#q;$h@#=w7$E#%%s#Gm#VL/8#Cy#DZ#zd$ZW#7'L-U-3[#16$Gt/*#zW$-z#a4$?/%0dB.a-+u-Q#T1#cO&&L*Ns#UY%&T#G{a$>7#z_%:D$ek2i$.~$[@#{d%lM#RHa5^k3j#>6$YK.f$)C$@z#]h$F%$y4k.^u+909#P'#^(&Wu)Si#IR%Vs#Ib-$Lu#As&*D$zV1b$DA$m@#sE&hC#Wa#6w7-y#LD#fU,M#Q3#Jq#qr$n" +
    "%#`W-)U7*6=*#Hl#~s%}k&H@#KV%Yi#4C-$T7$;5%|/#t-0f#ZB#ZG#wd&@b#2FL0Sk.?#I`#e,*j#O%#Jx#gS$/X#Sv-&ck.k5*#B6#lJ%0-%cJ#eH$_J#;Ha$/6$9}&Em#mL-m#T%#Tj#yn%,W#4W-,xu3g#Ex#=e'`#4|#/d$&r$;X#M/7%~#/^B##>x#zT%$7$XT$ch%r5#?.-$zV&{T&e%#AB)N#6E#2e$HO%9b#/Ba+{u:R#J_%3,06$Q8%+[#[|%DN&23a51L-C6E$*k#a%*j73Js#HH&bs#P*k$|L$C5'jN%eB3W$wU&%}#k&'p$#^QVBV#4c#R?#SU.9#BW#?3#H+#?Q#):##cy)I1|#%U#u@#;w#@-#?^#LT#'hB#Q2#r_$fX#PL3$#@r#?r#P&#[P#&.L&Pa.%#:K#oj,|#Uy#SQ#Wd$*D#gOB'aB*;7S#:)$+i$ta%J@#[q%Q+#=hk$a7$B5&Rw#tk2.#ZN#^I#t:%ol#:u#2qa1;#K4#Cq)^#8C#3^#R~#m$#@iu%}L&^8(#2E$(+$QL$&i#r~%8s#0-##pW$=+&5m#Hk/4#>W#8:#sY%Jv#-I-+(B-I#M2#4a&j#.y#+_#]^#d;#Ca#$rk)s:a#$c#GM#Fa#(%#ie$ui#98-#vB#~@&gc#40*0#1A#-'$0:%J$#8_u-Qk2i#[H#l~-'#TQ#Q>#a|$1w#Wrk&u7*E1b#,n#?H#q7$/}#B#$Q@#5]a#vt#cs$,/#wL1Z#^6#`H$.E&Rl#Diu4[V8d#G.#`U%q#K(#H-#MV#TU#HRa&;-)~,%##W#2(#$Z#:x#8s#qr#-k7#dk#Is#XD#d-+(#Lv#N4#eO%7.#9-#05u42#:5#rA&q#Wc#V*#u4#{r$Fc7+2#-338#T>%mi'-L'bT$%S&fi#_m7&S#$/}(em#oB&g#U$#X$#pn$C8#697/Sk)[#6K#]U'0#Io#ES#dh#sW#Rb-&Lu)^4w#2T#2}$3B$LJ#cF$0+#94k#}g$LJ$_m#bB'2#LW#LS#~x$b$#7%7,.L0R#@@#X~+f#Ga#C'#ah#{G#f5u(OB(}5b#HA$vs%zk%z+#Z1${_#8L#$]7$>@$i/#bu4g#NC#Ll#kn$zb#3rk/N7-0#=&#X,.M#Fw#B?#ZI#xQ#Wqa%`a+t3=#-X#^0#ka$'s#K@$qs#9eL#_s#nJ%4D#a75`#L`#LZ$&" +
    "0&A$#F'L-%758#J>#oK*D#Tr#T##PZ#`*#8]a%@u)C/t#-D#0A#iL$>+#:Q#[>#+gL#]I#AT#~/#}#,+#]t#fD#bE$YM#1u#-h-0l#=@$`t/3$.$$JG#O:$FD%+%7/Sk/>'d#u8$cs(L-.U}#Gp&T5#VSk%+k%Q@%9c$u#3n$9t$m5#Nn%l8#J2V6w75G#,m#P6+l#B##;b#U1#{o#e|k&Kk)62c#'D$Qs#QB#HT#{T&u@#ZB#$`V#`@&:9#M#3,#@w#;d#tY%iW#>5u/2a+'#Bo$aj/G$1M$KG#^h$vc%rHa3@u.r0z#f8#j~'sk,~i#Cp%z_#UL#$hu$Js%6D%$u1{$C~%#J#bn&T$#ZfV>Ra3m#9z#u~1;#[T#Z&#]r$3c%#[V*X-,]-{#-/$p_$HL$LJ#Tu%v}#^C-$Wk#n_&Sw#vk;f#`t#aC#o:&&C#X;L3nB/Y#C^#XA3E#H5#A6#sr$aw#[ga(YL.v>j#7N$~i$fa$h5$F*'&@#:%7%37#zi)*c#]-9I#Kb#E[$?E&av#47#30B0i#U]#+@4T#'`#&x#CQ#Da#######,#=K#AX$DJ%/k$S+$C^#wa#######%X_*F/#/h8##*R#)}#aO#cC#######3Y#U;#*u4O#((#%~#Ip$8c$;7#$bV-rB[#/$$F@#qL#Zi$cr*cJ$;7#$bV$]@+6X#+@9*#'T#';$+:&L.#Mu#)2V0[#^>#V`(:#F>#@o#XM$/w#x2V&57+J6q#5U$gJ$)k$g5$=|'ls#iV#$q#$>s(d%#T-+R#CS#B>#kE%=$#93a+Ta+P#A7#x63}#^m#]~#Ke$=/$FW-'m7,%1z#2r#ts%>L%$5#a=(M}#S;L$K-$X5)KX$%-8v#k,#j?#jn'qW#Usu1su5%#XR#{64M#]W#_C#EN#_]#Vb-&gB+a*Z#8>$:s$hk%T}#F%$25#;&B$W#$B5%/D$(B9S#dA#l9#Jd$DW#6u#0Ra/r#3/#j67G#Q`#Ot#Is#Zt#Hsu'&u)@+f#0g$SJ#{u$Di#H7$IJ#5PL$.?$0}#Um#lV?z#Rh#UF#L&$E.#0-#,o7-+#-K#qU/6#W+#U&#Sz$$X#QSk%x7)75m#4p#q@$]V%$@#Vz%H@#D=V$-b#r}&BN#t-10#Z3#[y#bE%3$#4##+LV*Z#E5#nj2%#T7#Sh#P:#YK#HeL&$L)e+z#>($5J$[L&$T" +
    "#R2%@5#;zV$-e$Z@%*X#wL5|#XI#aR#]&$T8#/zV+r-.|#3,#I,*F#:w#71#RC#E{#/PL#b(,20G#-~#hJ#gV#iT#`d#[Q#/PL#b(#zi%-/#Hu-p#:$#94#dd#hx#(I-%yV/H#8(#HK*^#;R#6d#L1#i+#Ym7&#u)j6+##A#n_#=h#(o$(*&S_#D:B$Cu$pJ)2%#D7./#9|#6/#x:%K8#9$--=u/R#P2#B%-d#63#2m#Gs#FD#@qa$3p(k0j#7N$8J$Z-$I+#d^$,i#@qa$3p$h5'%/#EB2*#7j#6u#Z0#ph#.Tu'hB-|#>q#N`3-#?u#;8#DU#Wo#6-#$#a-31m#QC$x+&Mu&8+#mk%%i#2iu#fh%)J%WD#]a8Y#I6#GZ#Zd$b.#*_7'%a3Z#:X#O,0*#?N#;-#;+#=K#######)b-X#9i$1s$au$e+#|H$*_#######%g5$_/#ML12#>?#=8#D0#WA#######,x#/+#R,10#Bk#>,#Sn#jR#`V#%kk-k4>#5f$D}$SL$Di#6m&O}#NSk$:k%[}'fD#QL5'#BK#?y#Md$rb#6?k*wV4o#@+#eA8w#Mg#LP#EO#=R#;_u$qV(A*.#1F$8s#u#$Ns#t/$8}#3GV$0G$E5$%D#g#>_#Mt#QQ#_&#|v#-bL+%#,D#-u#>/0Y#3w#0G#P4#Lh#UB#$XL*%4V#8+$si$bV$Ds$/S$}i#UB#$XL&a+'Z9#8=1O#0p#/>#OO#bt#,s-&1u,a#7~#fU8C#O$#M5#Ck#O3#qOB%uB(]*w#..$8+#wk$8J#oK%F5#T.-#ya$-i%Cm#g7>D#Nd#Q[#^:$`b#B-#+$L+|#6@#Hj6u#;@#6j#Mr#dV#o(V&F7(x/W#/'%@i#pV#z+$;r&+}#`?k%.7$?5'~9#DB=K#8>#61#od$jb#;c7.;-*C#Bt#GA-}#:;#5c#X|#bq#)5B$F#+.1p#1g%/5$,#$8+$FI%Ms#(0k#sc%55$dc#B7/)#6I#5$#bO$0$#$8a%i#*h#0i#?/74#44#15#Ck#Ed#######*X.n#SB&25&Su%hs$6h$,s#######%g5%~w#@L;c#4t#31#L0#U6#######--#3=#yU1I#_L#^)#Ga$H9$I&B'[-'F/l#/`#x+$n#$WT#@,(LJ#v5u$}L$'J'B/#xu3z#b`#ax#Fx&X$#Q5u0^k*d#?k#VA2m#F0" +
    "#@u#PJ$$w$S=V()-&_4P#10&/_$M#$9}#m*&H@#kpV$Vk#ri'h%#VV?y#GI#D-#f0%jC#PnB.wV)*#Gs#sU6F#Xt#Vj#Wq$0X#[*k(@7(?0(#@-$Gi%]k%p}#bY&%T#=W-%#a$YT(Kw#vu:Q#[A#^z#_n%M8#3EB/yL*[#C?#Rt8q#As#>z#;>#5##########(]#9R'Ds$Xa$|s#fC#n]#######$OJ$*X#PBA5#?T#@;#:u#Bf########$#'M$$U:8#g8#de#^|%BD&PnB.^a.s:{#3S$&s$}B${+#DD(d5$#qa$}a$`s)O%$3VF4#{~#v+#sE,KC$ZL#A*k@'$(H$et4+$78$Of#d^%Rw'Cqa54k/,7x$'S#n},t#0oJ#X)(&s$)qa&8V$V})Vw%$k6A$X~%$T#r:'ol#vN7CFL21#TU$l~1+$6.$_G#er$49&C-#40B*H)|$@=$,T+TL5hi$(I&>5#e2V&%a#H5'.X%1a2}$JU%;_#rY%;M#VdB?D7(Q#4v$],7Z$*.$F2#V4$&D$|k#/*u*c(|#ma%Y_(P#.Fs#Q)%e5#Tiu%)L$E@$}/$z-A0$>6$vi#VO%&8#Kc77+u.4#/Y$3t7I#lb#tH#GN$%/$;5u)U-(u*9#JA#tJ&>L(0s#RV'AT#_GV$x##_s&d%$Dk;V#yj$1@#SO&OM#N$-4QV*:#=g$bA8m$4$$F[#mI&39'noL5iu1r9L#i=$S5)47,mJ#YK*A5#|rk%'u$u_)Sm%4uBL$`,%$i$1:-F8$=u#DeL@%#q]#+`3O#'Y#'2####>y#######(r,s#BN$@_%6#$S5#aq#>i#######%Ai%Am#3{7G#,f#,;#7t#M=#######1R#4(" },
  names: BC_NAMES,
  classes: ["恶性 malignant", "良性 benign"],
  subsets: [["all", "全部 30 个"], ["mean", "10 个均值特征", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]], ["street3", "原作者的三个：平均纹理、最差面积、最差光滑度", [1, 23, 24]], ["two", "最差半径、最差凹点数", [20, 27]]],
  source: { name: "UCI Machine Learning Repository: Breast Cancer Wisconsin (Diagnostic)", url: "https://archive.ics.uci.edu/dataset/17/breast+cancer+wisconsin+diagnostic", license: "CC BY 4.0", licenseUrl: CC_BY, doi: "10.24432/C5DW2B",
    cite: "Wolberg, W., Mangasarian, O., Street, N., & Street, W. (1993). Breast Cancer Wisconsin (Diagnostic) [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5DW2B",
    changes: "去掉了病人编号；诊断 M / B 编成 0（恶性）/ 1（良性），与 scikit-learn 相同；数值取自 scikit-learn 附带的副本，为了嵌进页面重新编码成紧凑的字符串，数值不变。" },
  docs: R`**是什么**：威斯康星大学医院的乳腺肿块细针穿刺图像：在每张图里勾出细胞核的轮廓，计算 10 个形态量；每个量再取全图的均值、标准误和"最差"值（最大的三个的平均），共 30 个特征。目标是诊断：恶性还是良性。

**形状**：569 × 30，恶性 212 个、良性 357 个。十个形态量：半径、纹理（灰度的标准差）、周长、面积、光滑度（半径长度的局部变化）、紧密度（周长² / 面积 − 1）、凹度（轮廓凹进部分的严重程度）、凹点数、对称性、分形维数（"海岸线近似" − 1）。特征顺序：前 10 个是均值，接着 10 个标准误，最后 10 个"最差"值。

**已知的性质**：半径、周长、面积几乎是彼此的函数（面积约为 π·半径²），高度共线：线性模型的单个系数没法解释，但预测不受影响；置换重要性也会被这几列"分摊"。原作者（Street, Wolberg & Mangasarian 1993）用一个平面在"平均纹理、最差面积、最差光滑度"三个特征上，重复 10 折交叉验证估计的准确率约 97.5%。参考成绩（scikit-learn，10 折分层交叉验证）：逻辑回归（标准化）97.7%，5 近邻标准化后 96.5%、原始单位 93.3%，随机森林 96.3%，单棵决策树 92.3%；只用原作者那三个特征，逻辑回归约 96.7%。

**注意**：两种错误的代价很不对称（把恶性判成良性远比反过来严重），要看混淆矩阵和 ROC 曲线，而不只看准确率。

**出处**：Wolberg, W., Mangasarian, O., Street, N., & Street, W. (1993). Breast Cancer Wisconsin (Diagnostic) [Dataset]. UCI Machine Learning Repository, [https://doi.org/10.24432/C5DW2B](https://doi.org/10.24432/C5DW2B)。许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。论文：W. N. Street, W. H. Wolberg, O. L. Mangasarian, Nuclear feature extraction for breast tumor diagnosis, *Proc. SPIE* 1905, 861–870 (1993)。编码：0 = 恶性，1 = 良性（与 scikit-learn 相同）；去掉了病人编号。`
});

return QL.mlreg;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLDATA_TABULAR;
