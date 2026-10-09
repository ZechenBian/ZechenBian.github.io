// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 四套观测玩法（测量、预测、检测、停时）
 * 与 games.js 的十套共用同一个裁判框架：gen(c) 生成一局的全部随机数，play(E) 一回合一回合地问规则要动作、按细则结算。
 * 区别在于这里不挣钱：动作是一个估计、一个预测，或者"现在报警""现在停"，计分是误差或延迟。
 * 每一套都能换世界（数据服从哪一种过程）：同一种做法，换一个世界还灵不灵，是这四套要看的东西。
 * 同一份代码在主线程（只用元数据和理论值）和后台线程（真正去跑）里各执行一遍，所以必须自包含。 */
function QL_OBS_INSTALL(QL) {
"use strict";
var WORLDS = QL.WORLDS, num = QL.num, sel = QL.sel, LIB = QL.gameLib, ncdf = QL.ncdf, npdf = QL.npdf, GROUP = "观测玩法";
QL.WORLD_GROUPS.splice(1, 0, GROUP);
QL.OBS_GROUP = GROUP;
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
var memo = {};
/** 理论值算起来不便宜（要倒推一遍），而界面上会反复来问：同样的参数只算一次 */
function once(tag, key, f) { var m = memo[tag]; if (!m || m.key !== key) m = memo[tag] = { key: key, val: f() }; return m.val; }
var T3 = 0.5773502691896258;   // 自由度 3 的 t 分布方差是 3：乘上 1/√3 之后方差为 1

/* ================================================================== *
 *  ⑪ 测量参数
 * ================================================================== */
/** 这一局测的是什么：真值的先验（均值 m0、方差 v0、取值范围）和采样的时间步长 */
function measSpec(p) {
  var n = clamp(p.T | 0, 8, 4000), what = p.what, o = { what: what, n: n, lo: -Infinity, hi: Infinity }, a, b, lg;
  if (what === "sigma") {
    a = clamp(+p.slo, 0.001, 100); b = Math.max(a * 1.01, +p.shi); lg = Math.log(b / a);
    o.lo = a; o.hi = b; o.m0 = (b - a) / lg; o.v0 = (b * b - a * a) / (2 * lg) - o.m0 * o.m0; o.dt = 1 / (n - 1); o.name = "波动 σ"; o.span = 1;
  } else if (what === "kappa") {
    a = clamp(+p.klo, 0.001, 1000); b = Math.max(a * 1.01, +p.khi); lg = Math.log(b / a);
    o.lo = a; o.hi = b; o.m0 = (b - a) / lg; o.v0 = (b * b - a * a) / (2 * lg) - o.m0 * o.m0; o.span = clamp(+p.durk, 0.01, 1e4); o.dt = o.span / (n - 1); o.name = "回复速度 κ";
  } else if (what === "hurst") {
    a = clamp(+p.hlo, 0.02, 0.97); b = clamp(Math.max(a + 0.01, +p.hhi), a + 0.01, 0.98);
    a = Math.round(a * 100) / 100; b = Math.round(b * 100) / 100;                  // 真值取在 0.01 的格点上（生成分数高斯噪声时要按 H 缓存一张表）
    var k = Math.round((b - a) * 100) + 1;
    o.lo = a; o.hi = b; o.m0 = (a + b) / 2; o.v0 = (k * k - 1) / 12 * 1e-4; o.dt = 1; o.span = n - 1; o.name = "Hurst 指数 H"; o.grid = k;
  } else {
    o.what = "mu"; o.sigma = clamp(+p.sigma, 1e-4, 100); o.tau = clamp(+p.tau, 1e-4, 100);
    o.m0 = 0; o.v0 = o.tau * o.tau; o.span = clamp(+p.dur, 0.01, 1e4); o.dt = o.span / (n - 1); o.name = "漂移 μ";
  }
  return o;
}
/** 标准估计。用第 a 个到第 b 个观测，每隔 k 个取一个；t 是规则此刻看得到的最后一个观测。
 *    漂移：首尾之差 ÷ 经过的时间          波动：增量的平方和 ÷ 经过的时间，再开方（已知没有漂移）
 *    回复速度：相邻两点做带截距的回归，斜率 φ，κ = −ln φ ÷ 时间步长
 *    Hurst 指数：隔两步的增量与隔一步的增量，方差之比是 2^(2H)
 *  后三样的真值有已知的范围，估计落到范围之外时收回到边界上。数据不够时返回先验均值。 */
function measStd(g, lv, a, b, k, t) {
  a = a === undefined ? 0 : a | 0; b = b === undefined ? t : b | 0; k = k === undefined ? 1 : k | 0;
  if (a < 0) a = 0; if (b > t) b = t; if (k < 1) k = 1;
  var m = Math.floor((b - a) / k), dt = g.dt * k, i, d, s = 0;
  if (g.what === "mu") return m >= 1 ? (lv[a + m * k] - lv[a]) / (m * dt) : g.m0;
  if (g.what === "sigma") {
    if (m < 1) return g.m0;
    for (i = 0; i < m; i++) { d = lv[a + (i + 1) * k] - lv[a + i * k]; s += d * d; }
    return clamp(Math.sqrt(s / (m * dt)), g.lo, g.hi);
  }
  if (g.what === "kappa") {
    if (m < 3) return g.m0;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, x, y;
    for (i = 0; i < m; i++) { x = lv[a + i * k]; y = lv[a + (i + 1) * k]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    var den = sxx - sx * sx / m, phi = den > 0 ? (sxy - sx * sy / m) / den : 1;
    return phi >= 1 ? g.lo : phi <= 0 ? g.hi : clamp(-Math.log(phi) / dt, g.lo, g.hi);
  }
  if (m < 4) return g.m0;
  var v1 = 0, v2 = 0;
  for (i = 0; i < m; i++) { d = lv[a + (i + 1) * k] - lv[a + i * k]; v1 += d * d; }
  for (i = 0; i + 2 <= m; i++) { d = lv[a + (i + 2) * k] - lv[a + i * k]; v2 += d * d; }
  v1 /= m; v2 /= m - 1;
  return v1 > 0 && v2 > 0 ? clamp(0.5 * Math.log(v2 / v1) / Math.LN2, g.lo, g.hi) : g.m0;
}
QL.measSpec = measSpec; QL.measStd = measStd;
/** 把标准估计向先验均值收缩时，权重大致取多少（漂移是精确的最优值，其余是粗略的） */
function measShrink(p) {
  var sp = measSpec(p), m = sp.n - 1, noise;
  if (sp.what === "mu") noise = sp.sigma * sp.sigma / sp.span;
  else if (sp.what === "sigma") noise = (sp.v0 + sp.m0 * sp.m0) / (2 * m);
  else if (sp.what === "kappa") noise = 2 * sp.m0 / sp.span + 16 / (sp.span * sp.span);
  else noise = 0.5 / m;
  return sp.v0 / (sp.v0 + noise);
}

LIB.meas_prior = {
  head: "不看数据：每一局都报先验均值。它是这套玩法的基准，得分按定义是 1。",
  decide: function decide(s, p) {
    return s.g.m0;                                // 真值的先验均值
  }
};
LIB.meas_std = {
  head: "标准估计：用到目前为止的全部观测，套教科书上的公式。",
  decide: function decide(s, p) {
    return s.mle(0, s.t, 1);                      // 第 0 个到第 t 个观测，一个不落
  }
};
LIB.meas_half = {
  head: "只用最近一段：只取最近比例为 w 的那一段观测来算标准估计。",
  decide: function decide(s, p) {
    return s.mle(s.t - Math.floor(s.t * p.w), s.t, 1);
  }
};
LIB.meas_sub = {
  head: "降采样：每隔 k 个观测才取一个（时间跨度不变，点数只剩 1/k），再算标准估计。",
  decide: function decide(s, p) {
    return s.mle(0, s.t, p.k);
  }
};
LIB.meas_shrink = {
  head: "向先验收缩：标准估计和先验均值之间按权重 w 取一个折中。w = 1 就是标准估计，w = 0 就是不看数据。",
  decide: function decide(s, p) {
    return s.g.m0 + p.w * (s.mle(0, s.t, 1) - s.g.m0);
  }
};
LIB.meas_jack = {
  head: "折半去偏（刀切法）：全部数据算一次，前一半、后一半各算一次；2 × 全部 − 两个半段的平均，把与样本长度成反比的偏差消掉。",
  decide: function decide(s, p) {
    var h = s.t >> 1, a = s.mle(0, s.t, 1), b = s.mle(0, h, 1), c = s.mle(h, s.t, 1);
    return 2 * a - (b + c) / 2;
  }
};

WORLDS.o_meas = {
  ideas: ['测漂移时用后验均值：把收缩的权重写成"已经看了多久"的函数，而不是一个常数', '测波动时用绝对值的中位数（对离群点不敏感），再和标准估计比一比', '测回复速度时先减去 4/总时长 这个已知的偏差，再收回到范围里'],
  name: "⑪ 测量参数", short: "测量参数", group: GROUP, game: true, obsGame: true, retune: true, no: 11, unit: "个观测",
  blurb: "每一局给你一条轨迹，背后有一个你看不到的参数（漂移、波动、回复速度或者 Hurst 指数），它每一局都不一样。看完轨迹，报出你的估计。",
  wsel: "what", wkeys: ["what", "sigma", "tau", "slo", "shi", "klo", "khi", "hlo", "hhi"],
  params: [
    sel("what", "世界 · 测什么", "mu", [["mu", "布朗运动 · 测漂移 μ"], ["sigma", "布朗运动 · 测波动 σ"], ["kappa", "均值回复 · 测回复速度 κ"], ["hurst", "分数布朗运动 · 测 Hurst 指数 H"]],
      { descs: { mu: "X 每单位时间平均移动 μ，再叠加波动 σ 的随机游走。σ 已知，μ 每局不同。", sigma: "没有漂移的随机游走，波动 σ 每局不同。", kappa: "X 被一根弹簧拉回平衡位置（位置未知），回复速度 κ 每局不同；偏离的半衰期是 ln2/κ。", hurst: "增量之间有长程相关：H > ½ 时趋势延续，H < ½ 时来回震荡，H = ½ 就是布朗运动。" } }),
    num("T", "采样点数 n", 250, 10, 2000, 10),
    num("dur", "总时长 D", 1, 0.25, 100, 0.25, { show: function (p) { return p.what === "mu"; }, hint: "n 个点均匀地铺在这段时间里。想成\"年\"的话，D = 1、n = 250 就是一年的日线" }),
    num("sigma", "波动 σ（已知）", 0.2, 0.02, 1, 0.01, { show: function (p) { return p.what === "mu"; }, hint: "每单位时间的标准差" }),
    num("tau", "漂移真值的分散程度 τ", 0.1, 0.01, 1, 0.01, { show: function (p) { return p.what === "mu"; }, hint: "每一局的漂移从 N(0, τ²) 里抽" }),
    num("slo", "σ 的下限", 0.1, 0.01, 1, 0.01, { show: function (p) { return p.what === "sigma"; } }),
    num("shi", "σ 的上限", 0.4, 0.02, 2, 0.01, { show: function (p) { return p.what === "sigma"; }, hint: "每一局的 σ 在上下限之间按对数均匀地抽" }),
    num("durk", "总时长 D", 10, 0.5, 200, 0.5, { show: function (p) { return p.what === "kappa"; }, hint: "κ 的单位是\"每单位时间\"：κ·D 是这段时间里偏离衰减了多少个 e 倍" }),
    num("klo", "κ 的下限", 1, 0.1, 20, 0.1, { show: function (p) { return p.what === "kappa"; } }),
    num("khi", "κ 的上限", 10, 0.5, 100, 0.5, { show: function (p) { return p.what === "kappa"; }, hint: "每一局的 κ 在上下限之间按对数均匀地抽" }),
    num("hlo", "H 的下限", 0.25, 0.05, 0.9, 0.01, { show: function (p) { return p.what === "hurst"; } }),
    num("hhi", "H 的上限", 0.85, 0.1, 0.95, 0.01, { show: function (p) { return p.what === "hurst"; }, hint: "每一局的 H 在上下限之间均匀地抽" })
  ],
  defaults: { N: 2000, T: 250, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 8, 4000); },
  hidden: function () { return { truth: 1 }; },
  consts: function (p, T) { var sp = measSpec(p); return { T: T, what: sp.what, dt: sp.dt, m0: sp.m0, v0: sp.v0, lo: sp.lo, hi: sp.hi, sigma: sp.sigma || NaN, tau: sp.tau || NaN, span: sp.span }; },
  score: function () { return { name: "剩余误差（1 = 等于没测）", digits: 3, lower: true }; },
  track: { name: "估计的误差（以真值的分散程度为单位）" }, obs: { name: "轨迹 X" }, rName: "增量", rAxis: "相邻两个观测之差 X(i+1) − X(i)", action: { name: "你报的估计", kind: "level" },
  aux: [{ name: "平均偏差（估计 − 真值）", digits: 4 }, { name: "平均绝对误差", digits: 4 }],
  defStrat: "meas_std",
  ranges: function (p) { var w = measShrink(p); return { "meas_shrink.w": [0, 1, +w.toFixed(3)] }; },
  gen: function (c) {
    var p = c.p, sp = measSpec(p), g = c.rng, T = c.T, lv = c.lv, r = c.r, x = 0, t, th, s;
    if (sp.what === "sigma") {
      th = sp.lo * Math.exp(g.u() * Math.log(sp.hi / sp.lo)); s = th * Math.sqrt(sp.dt);
      lv[0] = 0; for (t = 0; t < T; t++) { x += s * g.normal(); lv[t + 1] = x; }
    } else if (sp.what === "kappa") {
      th = sp.lo * Math.exp(g.u() * Math.log(sp.hi / sp.lo));
      var a = Math.exp(-th * sp.dt), sd = Math.sqrt(1 - a * a), m = g.normal();    // 平衡位置 m 每局不同、规则不知道；偏离的平稳标准差是 1
      x = m + g.normal(); lv[0] = x;
      for (t = 0; t < T; t++) { x = m + (x - m) * a + sd * g.normal(); lv[t + 1] = x; }
    } else if (sp.what === "hurst") {
      th = sp.lo + 0.01 * Math.min(sp.grid - 1, Math.floor(g.u() * sp.grid));
      var tmp = c.tmp && c.tmp.length >= T ? c.tmp : (c.tmp = new Float64Array(T));
      QL.fgn(T, th, g, tmp);
      lv[0] = 0; for (t = 0; t < T; t++) { x += tmp[t]; lv[t + 1] = x; }
    } else {
      th = sp.tau * g.normal(); s = sp.sigma * Math.sqrt(sp.dt);
      lv[0] = 0; for (t = 0; t < T; t++) { x += th * sp.dt + s * g.normal(); lv[t + 1] = x; }
    }
    c.h.truth[0] = th;
    for (t = 0; t < T; t++) r[t] = lv[t + 1] - lv[t];
  },
  play: function (E) {
    var T = E.T, V = E.V, g = E.g, lv = E.lv, truth = E.h.truth[0], sd0 = Math.sqrt(g.v0), est = g.m0, next = 0, t, a;
    V.mle = function (a, b, k) { return measStd(g, lv, a, b, k, V.t); };
    for (t = 0; t < T; t++) {
      if (t >= next || t === T - 1) {             // 只在检查点问（点数按 1.1 倍递增），最后一个观测一定问
        a = E.ask(t); est = a === a && a !== Infinity && a !== -Infinity ? a : g.m0;
        next = Math.max(t + 1, Math.floor(t * 1.1) + 1);
      }
      E.put(t, est, (est - truth) / sd0, 0);
    }
    var e = est - truth;
    E.score = -e * e / g.v0; E.aux[0] = e; E.aux[1] = Math.abs(e);            // 引擎里的得分一律"越高越好"：成本记成负数，显示时再翻回来
  },
  theory: function (p) {
    var sp = measSpec(p), marks = [{ id: "prior", name: "不看数据，报先验均值（按定义）", value: -1 }], curves = {}, out = { marks: marks, curves: curves, what: sp.what, m0: sp.m0, sd0: Math.sqrt(sp.v0), span: sp.span, n: sp.n };
    if (sp.what === "mu") {
      var snr = sp.span * sp.tau * sp.tau / (sp.sigma * sp.sigma);
      out.snr = snr; out.wStar = snr / (1 + snr); out.seStd = sp.sigma / Math.sqrt(sp.span);
      marks.push({ id: "std", name: "标准估计（公式 σ²/(Dτ²)）", value: -1 / snr });
      marks.push({ id: "bayes", name: "理论最优：后验均值（公式 1/(1 + Dτ²/σ²)）", value: -1 / (1 + snr), kind: "optimum" });
      curves["meas_shrink.w"] = { f: function (w) { return -(w * w / snr + (1 - w) * (1 - w)); }, name: "理论：w²·σ²/(Dτ²) + (1 − w)²" };
    }
    return out;
  },
  refs: function (p) {
    var w = +measShrink(p).toFixed(3);
    return [
      { id: "prior", name: "不看数据，报先验均值", lib: "meas_prior", p: {}, bench: true },
      { id: "std", name: "标准估计", lib: "meas_std", p: {} },
      { id: "shrink", name: "向先验收缩（w = " + w + "）", lib: "meas_shrink", p: { w: w } },
      { id: "jack", name: "折半去偏", lib: "meas_jack", p: {} }
    ];
  },
  scenes: [
    { name: "漂移 · 时长 1", p: { what: "mu" } }, { name: "漂移 · 时长 25", p: { what: "mu", dur: 25 } },
    { name: "波动 · 250 个点", p: { what: "sigma" } }, { name: "波动 · 30 个点", p: { what: "sigma", T: 30 } },
    { name: "回复速度 · 时长 10", p: { what: "kappa" } }, { name: "回复速度 · 时长 2", p: { what: "kappa", durk: 2 } },
    { name: "Hurst · 250 个点", p: { what: "hurst" } }, { name: "Hurst · 1000 个点", p: { what: "hurst", T: 1000 } }
  ],
  api: [
    "动作：返回你对这一局那个参数的估计（一个数）。裁判只在一部分时刻来问（观测数每增加一成问一次），最后一个观测到手时一定问；计分只看最后一次。没给出有限的数时，按先验均值算。",
    "s.mle(a, b, k)   标准估计：用第 a 个到第 b 个观测、每隔 k 个取一个算出来（b 不能超过 s.t）；观测太少算不出来时返回先验均值。公式见手册里这套玩法的那一页",
    "s.t              现在手里最后一个观测的编号（从 0 起）；s.p(k) 是 k 个观测之前的 X，s.p(0) 是最新的那个",
    "s.ret(k)         最近第 k+1 个增量 X(i+1) − X(i)；s.rets(n)、s.mean(n)、s.vol(n) 是最近 n 个增量组成的数组、均值、标准差",
    "s.prices(n)      最近 n 个观测组成的数组（旧的在前）；s.sma(n)、s.psd(n) 是它们的均值和标准差",
    "s.g.what         这一局测什么：\"mu\" 漂移、\"sigma\" 波动、\"kappa\" 回复速度、\"hurst\" Hurst 指数",
    "s.g.dt  s.g.span 相邻两个观测隔多久、全部观测一共跨多久（Hurst 那一档里时间步长记作 1）",
    "s.g.m0  s.g.v0   真值的先验均值和先验方差；s.g.lo、s.g.hi 是真值的范围（漂移没有范围）",
    "s.g.sigma s.g.tau 测漂移时：已知的波动 σ，和漂移真值的分散程度 τ（每局的漂移从 N(0, τ²) 里抽）"
  ].join("\n")
};

/* ================================================================== *
 *  ⑫ 预测
 * ================================================================== */
/** 分数布朗运动：知道 H、只用最近 m 个增量时，对"接下来 h 步一共走多少"的最优线性预测。返回系数和能解释掉的方差比例 */
function fbmPredictor(H, h, m) {
  return once("fbm" + m, H.toFixed(4) + "/" + h, function () {
    var h2 = 2 * H, i, j, k, s;
    function gam(k) { k = Math.abs(k); return 0.5 * (Math.pow(k + 1, h2) - 2 * Math.pow(k, h2) + Math.pow(Math.abs(k - 1), h2)); }
    var Lc = [], c = new Float64Array(m), y = new Float64Array(m), a = new Float64Array(m);
    for (i = 0; i < m; i++) { s = 0; for (j = 1; j <= h; j++) s += gam(i + j); c[i] = s; }
    for (i = 0; i < m; i++) {                      // Cholesky：Γ = L·Lᵀ，Γ(i,j) = γ(i − j)
      Lc.push(new Float64Array(i + 1));
      for (j = 0; j <= i; j++) { s = gam(i - j); for (k = 0; k < j; k++) s -= Lc[i][k] * Lc[j][k]; Lc[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-14)) : s / Lc[j][j]; }
    }
    for (i = 0; i < m; i++) { s = c[i]; for (k = 0; k < i; k++) s -= Lc[i][k] * y[k]; y[i] = s / Lc[i][i]; }
    for (i = m - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < m; k++) s -= Lc[k][i] * a[k]; a[i] = s / Lc[i][i]; }
    var ex = 0; for (i = 0; i < m; i++) ex += a[i] * c[i];
    return { a: a, skill: ex / Math.pow(h, h2) };
  });
}
/** 带噪谐振子（没有观测噪声时）：AR(2) 的 h 步最优预测比原地不动少掉多少均方误差 */
function oscCoef(p) { var f1 = 2 * p.rho * Math.cos(2 * Math.PI / p.period), f2 = -p.rho * p.rho; return { f1: f1, f2: f2, sd: Math.sqrt((1 - f2) / ((1 + f2) * ((1 - f2) * (1 - f2) - f1 * f1))) }; }
function oscSkill(p, h) {
  var c = oscCoef(p), f1 = c.f1, f2 = c.f2, r0 = 1, r1 = f1 / (1 - f2), psi0 = 1, psi1 = f1, s = 1, j, x;
  for (j = 1; j < h; j++) { s += psi1 * psi1; x = f1 * psi1 + f2 * psi0; psi0 = psi1; psi1 = x; }
  for (j = 1; j < h; j++) { x = f1 * r1 + f2 * r0; r0 = r1; r1 = x; }      // r1 = ρ(h)
  return 1 - s / (c.sd * c.sd) / (2 * (1 - (h === 0 ? 1 : r1)));
}
function predBest(p) {
  var h = clamp(p.h | 0, 1, 500), ns = +p.noise || 0, src = p.src;
  if (src === "bm") return { v: 0, name: "理论最优 = 原地不动（鞅）" };
  if (src === "ou") return { v: (1 - Math.pow(clamp(+p.phi, 0, 0.9999), h)) / 2, name: "理论最优：(1 − φ^h)/2（知道 φ 和均值）" };
  if (src === "fbm") return { v: fbmPredictor(clamp(+p.H, 0.02, 0.98), h, 60).skill, name: "知道 H、用最近 60 个增量的最优线性预测" };
  if (src === "osc" && !ns) return { v: oscSkill(p, h), name: "理论最优：知道两个系数的线性预测" };
  if (src === "logi" && !ns) return { v: 1, name: "理论上界：知道方程就能完全预测" };
  if (src === "lorenz" && !ns) return { v: 1, name: "理论上界：确定性系统，原则上可以完全预测" };
  return null;
}
/** "知道方程"的预测在这一局上的技巧分（裁判自己算，规则拿不到） */
function predOracle(E) {
  var p = E.p, T = E.T, lv = E.lv, h = E.g.h, w0 = E.g.warm, src = p.src, t, i, f, sr = 0, sp = 0, e;
  var a = src === "ou" ? Math.pow(clamp(+p.phi, 0, 0.9999), h) : 0, fb = src === "fbm" ? fbmPredictor(clamp(+p.H, 0.02, 0.98), h, 60).a : null, oc = src === "osc" ? oscCoef(p) : null, x0, x1, x2;
  for (t = w0; t + h <= T; t++) {
    if (src === "ou") f = a * lv[t];
    else if (src === "fbm") { f = lv[t]; for (i = 0; i < 60 && t - i - 1 >= 0; i++) f += fb[i] * (lv[t - i] - lv[t - i - 1]); }
    else if (src === "osc") { if (t < 1) f = lv[t]; else { x1 = lv[t]; x2 = lv[t - 1]; for (i = 0; i < h; i++) { x0 = oc.f1 * x1 + oc.f2 * x2; x2 = x1; x1 = x0; } f = x1; } }
    else if (src === "logi") { f = lv[t]; for (i = 0; i < h; i++) f = p.a * f * (1 - f); }
    else f = lv[t];
    e = f - lv[t + h]; sr += e * e; e = lv[t] - lv[t + h]; sp += e * e;
  }
  return sp > 0 ? 1 - sr / sp : 0;
}

LIB.pred_stay = {
  head: "原地不动：预测 h 步之后还是现在这个值。它是这套玩法的基准，技巧分按定义是 0。",
  decide: function decide(s, p) {
    return s.x;                                   // s.x 是这一步刚看到的观测值
  }
};
LIB.pred_line = {
  head: "线性外推：最近一步变了多少，就认为接下来每一步都照这样变（乘上力度 w）。",
  decide: function decide(s, p) {
    if (s.t < 1) return s.x;
    return s.x + p.w * s.g.h * (s.x - s.p(1));    // s.p(1) 是上一步的观测值
  }
};
LIB.pred_mean = {
  head: "回到均值：把到现在为止的平均值当作归宿，预测\"现在的偏离到时候只剩 w 倍\"。",
  decide: function decide(s, p) {
    var m = s.sma(s.t + 1);                       // 到现在为止全部观测的平均
    return m + p.w * (s.x - m);
  }
};
LIB.pred_ar = {
  head: "自回归（递推最小二乘）：把 h 步之后的值写成最近 q 个值的线性组合；每过一步，就用刚揭晓的答案修正一次系数。",
  init: function init(p) {
    var d = (p.q | 0) + 1, P = [], i;
    for (i = 0; i < d; i++) { P.push(new Float64Array(d)); P[i][i] = 1000; }       // P 是系数的"不确定程度"，开局时很大
    return { b: new Float64Array(d), P: P, z: new Float64Array(d), k: new Float64Array(d) };
  },
  decide: function decide(s, p, st) {
    var q = p.q | 0, d = q + 1, h = s.g.h, x0 = s.p(s.t), b = st.b, P = st.P, z = st.z, k = st.k, i, j, den, err, f;
    // 1) h 步之前的那组"最近 q 个值"，现在有了答案（就是 s.x）：用它修正系数
    if (s.t >= h + q - 1) {
      z[0] = 1; for (i = 0; i < q; i++) z[i + 1] = s.p(h + i) - x0;                // 都减去开局的值 x0，数值上稳一些
      den = 1;
      for (i = 0; i < d; i++) { k[i] = 0; for (j = 0; j < d; j++) k[i] += P[i][j] * z[j]; den += z[i] * k[i]; }
      err = s.x - x0; for (i = 0; i < d; i++) err -= b[i] * z[i];
      for (i = 0; i < d; i++) { b[i] += k[i] * err / den; for (j = 0; j < d; j++) P[i][j] -= k[i] * k[j] / den; }
    }
    // 2) 用现在的系数预测 h 步之后
    if (s.t < 2 * (h + q) + 8) return s.x;                                         // 数据太少：先原地不动
    f = b[0]; for (i = 0; i < q; i++) f += b[i + 1] * (s.p(i) - x0);
    return x0 + f;
  }
};
LIB.pred_nn = {
  head: "相似历史（最近邻）：在过去找出和\"刚走过的这一小段\"最像的 k 段，看它们后来各走了多少，取平均。",
  decide: function decide(s, p) {
    var m = p.m | 0, k = p.k | 0, h = s.g.h, t = s.t, u, i, j, d, e, bd = [], bv = [], worst, wi, sum = 0;
    if (t - h - m + 2 < 4 * k) return s.x;                         // 历史太短：先原地不动
    var X = s.prices(t + 1);                                       // 从开局到现在的全部观测值：X[0] … X[t]
    // 候选是过去的每一个时刻 u（它后面的 h 步已经发生过了）。两段轨迹的距离 = 逐点相减的平方和
    for (u = m - 1; u <= t - h; u++) {
      d = 0; for (j = 0; j < m; j++) { e = X[t - j] - X[u - j]; d += e * e; }
      if (bd.length < k) { bd.push(d); bv.push(X[u + h] - X[u]); continue; }
      worst = -1; wi = 0; for (i = 0; i < k; i++) if (bd[i] > worst) { worst = bd[i]; wi = i; }
      if (d < worst) { bd[wi] = d; bv[wi] = X[u + h] - X[u]; }
    }
    for (i = 0; i < bd.length; i++) sum += bv[i];
    return s.x + sum / bd.length;                                  // 现在的值 + 那几段后来的平均变化
  }
};

function isSrc(list) { return function (p) { return list.indexOf(p.src) >= 0; }; }
WORLDS.o_pred = {
  ideas: ['先判断这个世界是随机游走还是有结构：两种预测都算，哪个最近的误差小就用哪个', '最近邻里按距离加权，而不是简单平均', '提前 h 步时，把一步的预测迭代 h 次，和直接预测 h 步比一比'],
  name: "⑫ 预测", short: "预测", group: GROUP, game: true, obsGame: true, retune: true, no: 12, unit: "步",
  blurb: "一个量随时间变化。每一步，你报出它 h 步之后会是多少。和\"原地不动\"（预测它不变）比：少掉了多少均方误差。",
  wsel: "src", wkeys: ["src", "phi", "H", "period", "rho", "a", "tau", "noise"],
  params: [
    sel("src", "世界", "logi", [["bm", "布朗运动（随机游走）"], ["ou", "均值回复"], ["fbm", "分数布朗运动（长记忆）"], ["osc", "带噪谐振子"], ["logi", "Logistic 映射（混沌）"], ["lorenz", "洛伦兹系统（混沌）"]],
      { descs: { bm: "每一步加上一个独立的标准正态增量。", ou: "偏离均值的部分每一步只留下 φ 倍，再加上新的噪声。平稳标准差是 1。", fbm: "增量之间有长程相关：H > ½ 时趋势延续，H < ½ 时来回震荡。", osc: "被随机力推动的欠阻尼振子：x(t) = 2ρcos(2π/周期)·x(t−1) − ρ²·x(t−2) + 噪声。", logi: "x(t+1) = a·x(t)·(1 − x(t))。没有任何随机性，但看起来像噪声。", lorenz: "三个变量的确定性方程组，你只看得到其中一个，每隔 τ 采样一次。" } }),
    num("T", "一局多少步", 400, 80, 3000, 10),
    num("h", "提前几步 h", 1, 1, 50, 1),
    num("warm", "热身的步数（不计分）", 100, 0, 1000, 10, { hint: "给需要先学一会儿的规则留的时间" }),
    num("phi", "每步保留的偏离 φ", 0.9, 0, 0.999, 0.001, { show: isSrc(["ou"]), hint: "半衰期 = ln 2 ÷ ln(1/φ) 步" }),
    num("H", "Hurst 指数 H", 0.75, 0.05, 0.95, 0.01, { show: isSrc(["fbm"]) }),
    num("period", "周期（步）", 20, 6, 200, 1, { show: isSrc(["osc"]) }),
    num("rho", "每步保留的振幅 ρ", 0.95, 0.8, 0.999, 0.001, { show: isSrc(["osc"]) }),
    num("a", "参数 a", 4, 3.57, 4, 0.001, { show: isSrc(["logi"]), hint: "a = 4 时相邻两步的线性相关恰好是 0" }),
    num("tau", "采样间隔 τ", 0.1, 0.01, 0.5, 0.01, { show: isSrc(["lorenz"]) }),
    num("noise", "观测噪声（信号标准差的倍数）", 0, 0, 1, 0.01, { show: isSrc(["osc", "logi", "lorenz"]) })
  ],
  defaults: { N: 400, T: 400, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 20, 20000); },
  consts: function (p, T) { var h = clamp(p.h | 0, 1, Math.max(1, T - 2)); return { T: T, h: h, warm: clamp(p.warm | 0, 0, Math.max(0, T - h - 1)) }; },
  score: function () { return { name: "技巧分（比原地不动少掉的均方误差比例）", digits: 3 }; },
  track: { name: "累计少掉的平方误差" }, obs: { name: "观测值" }, rName: "增量", rAxis: "相邻两个观测值之差", action: { name: "你的预测（h 步之后）", kind: "same" },
  aux: [{ name: "你的均方根误差", digits: 4 }, { name: "原地不动的均方根误差", digits: 4 }],
  defStrat: "pred_nn",
  ranges: function (p) { var h = clamp(p.h | 0, 1, 500), o = {}; if (p.src === "ou") o["pred_mean.w"] = [0, 1, +Math.pow(clamp(+p.phi, 0, 0.9999), h).toFixed(3)]; return o; },
  gen: function (c) {
    var p = c.p, g = c.rng, T = c.T, lv = c.lv, src = p.src, ns = +p.noise || 0, x, t, i;
    if (src === "ou") {
      var a = clamp(+p.phi, 0, 0.9999), sd = Math.sqrt(1 - a * a); x = g.normal();
      for (t = 0; t <= T; t++) { lv[t] = x; x = a * x + sd * g.normal(); }
    } else if (src === "fbm") {
      var tmp = c.tmp && c.tmp.length >= T ? c.tmp : (c.tmp = new Float64Array(T));
      QL.fgn(T, clamp(+p.H, 0.02, 0.98), g, tmp); x = 0; lv[0] = 0;
      for (t = 0; t < T; t++) { x += tmp[t]; lv[t + 1] = x; }
    } else if (src === "osc") {
      var oc = oscCoef(p), x1 = 0, x2 = 0;
      for (i = 0; i < 400; i++) { x = oc.f1 * x1 + oc.f2 * x2 + g.normal(); x2 = x1; x1 = x; }
      for (t = 0; t <= T; t++) { lv[t] = x1 / oc.sd + (ns > 0 ? ns * g.normal() : 0); x = oc.f1 * x1 + oc.f2 * x2 + g.normal(); x2 = x1; x1 = x; }
    } else if (src === "logi") {
      x = 0.1 + 0.8 * g.u();
      for (i = 0; i < 60; i++) { x = p.a * x * (1 - x); if (!(x > 1e-14 && x < 1)) x = 0.1 + 0.8 * g.u(); }    // 浮点轨道偶尔会塌到 0，那时重新撒一个初值
      for (t = 0; t <= T; t++) { lv[t] = x + (ns > 0 ? ns * 0.35355339 * g.normal() : 0); x = p.a * x * (1 - x); if (!(x > 1e-14 && x < 1)) x = 0.1 + 0.8 * g.u(); }
    } else if (src === "lorenz") {
      var hh = 0.01, m = Math.max(1, Math.round(p.tau / hh)), y = 1 + g.normal(), z = 20 + 5 * g.normal(); x = 1 + g.normal();
      var step = function () {                    // 四阶 Runge–Kutta，步长 0.01
        var k1x = 10 * (y - x), k1y = x * (28 - z) - y, k1z = x * y - 8 / 3 * z;
        var x2 = x + 0.5 * hh * k1x, y2 = y + 0.5 * hh * k1y, z2 = z + 0.5 * hh * k1z;
        var k2x = 10 * (y2 - x2), k2y = x2 * (28 - z2) - y2, k2z = x2 * y2 - 8 / 3 * z2;
        var x3 = x + 0.5 * hh * k2x, y3 = y + 0.5 * hh * k2y, z3 = z + 0.5 * hh * k2z;
        var k3x = 10 * (y3 - x3), k3y = x3 * (28 - z3) - y3, k3z = x3 * y3 - 8 / 3 * z3;
        var x4 = x + hh * k3x, y4 = y + hh * k3y, z4 = z + hh * k3z;
        var k4x = 10 * (y4 - x4), k4y = x4 * (28 - z4) - y4, k4z = x4 * y4 - 8 / 3 * z4;
        x += hh / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); y += hh / 6 * (k1y + 2 * k2y + 2 * k3y + k4y); z += hh / 6 * (k1z + 2 * k2z + 2 * k3z + k4z);
      };
      for (i = 0; i < 800; i++) step();
      for (t = 0; t <= T; t++) { lv[t] = x / 7.93 + (ns > 0 ? ns * g.normal() : 0); for (i = 0; i < m; i++) step(); }
    } else {
      x = 0; for (t = 0; t <= T; t++) { lv[t] = x; x += g.normal(); }
    }
    for (t = 0; t < T; t++) c.r[t] = lv[t + 1] - lv[t];
  },
  play: function (E) {
    var T = E.T, V = E.V, lv = E.lv, h = E.g.h, w0 = E.g.warm, t, a, f, sr = 0, sp = 0, cum = 0, e1, e0, cnt = 0;
    for (t = 0; t < T; t++) {
      V.x = lv[t];
      a = E.ask(t); f = a === a && a !== Infinity && a !== -Infinity ? a : lv[t];      // 没给出有限的数：按原地不动算
      if (t >= w0 && t + h <= T) { e1 = f - lv[t + h]; e0 = lv[t] - lv[t + h]; sr += e1 * e1; sp += e0 * e0; cum += e0 * e0 - e1 * e1; cnt++; }
      E.put(t, f, cum, 0);
    }
    E.score = sp > 0 ? 1 - sr / sp : 0; E.aux[0] = Math.sqrt(sr / Math.max(1, cnt)); E.aux[1] = Math.sqrt(sp / Math.max(1, cnt));
  },
  theory: function (p) {
    var b = predBest(p), marks = [{ id: "stay", name: "原地不动（按定义）", value: 0 }], curves = {}, h = clamp(p.h | 0, 1, 500);
    if (b) marks.push({ id: "best", name: b.name, value: b.v, kind: b.v === 1 ? "bound" : "optimum" });
    if (p.src === "ou") { var a = Math.pow(clamp(+p.phi, 0, 0.9999), h); curves["pred_mean.w"] = { f: function (w) { return 1 - (1 - 2 * w * a + w * w) / (2 * (1 - a)); }, name: "理论（均值已知时）" }; }
    return { marks: marks, curves: curves, best: b ? b.v : null };
  },
  refs: function (p) {
    var L = [
      { id: "stay", name: "原地不动", lib: "pred_stay", p: {}, bench: true },
      { id: "ar", name: "自回归（q = 3）", lib: "pred_ar", p: { q: 3 } },
      { id: "nn", name: "相似历史（m = 2，k = 4）", lib: "pred_nn", p: { m: 2, k: 4 } }
    ], ns = +p.noise || 0;
    if (p.src === "ou" || p.src === "fbm" || (p.src === "osc" && !ns) || (p.src === "logi" && !ns)) L.push({ id: "oracle", name: "知道方程的预测（这一批对局上算的）", calc: predOracle, kind: "bound" });
    return L;
  },
  scenes: [
    { name: "布朗运动", p: { src: "bm" } }, { name: "均值回复 φ=0.9", p: { src: "ou" } }, { name: "均值回复 · 提前 10 步", p: { src: "ou", h: 10 } },
    { name: "分数布朗 H=0.75", p: { src: "fbm" } }, { name: "带噪谐振子", p: { src: "osc" } }, { name: "Logistic", p: { src: "logi" } },
    { name: "Logistic · 提前 5 步", p: { src: "logi", h: 5 } }, { name: "Logistic · 5% 观测噪声", p: { src: "logi", noise: 0.05 } }, { name: "洛伦兹", p: { src: "lorenz" } }
  ],
  api: [
    "动作：返回你对 h 步之后那个观测值的预测（一个数）。没给出有限的数时，按\"原地不动\"算。前面热身的那些步照样会来问，只是不计分。",
    "s.x          这一步刚看到的观测值；s.p(k) 是 k 步之前的观测值（s.p(0) 就是 s.x）",
    "s.ret(k)     最近第 k+1 个增量；s.rets(n)、s.mean(n)、s.vol(n) 是最近 n 个增量组成的数组、均值、标准差",
    "s.prices(n)  最近 n 个观测值组成的数组（旧的在前）；s.sma(n)、s.psd(n) 是它们的均值和标准差",
    "s.g.h        提前几步；s.g.warm 热身的步数；s.g.T 一局多少步；s.t 现在是第几步（从 0 起）",
    "规则不知道这是哪一种世界，也读不到世界的参数：要么把这份知识写进规则的参数里，要么从数据里学。"
  ].join("\n")
};

/* ================================================================== *
 *  ⑬ 变点检测
 * ================================================================== */
function detSpec(p, T) { return { T: T, rho: 1 / clamp(+p.gap, 2, 1e7), delta: clamp(+p.delta, 0.01, 50), F: clamp(+p.F, 0, 1e7) }; }
/** 从不报警的期望代价 E(T − ν)⁺：变化发生之后的每一步都算一步延迟 */
function detNever(g) { var q = 1 - g.rho; return g.T - q * (1 - Math.pow(q, g.T)) / g.rho; }

LIB.det_shew = {
  head: "单点超限：某一个读数高过 k 就报警（休哈特控制图）。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return s.x >= p.k ? 1 : 0;                    // s.x 是这一步的读数，单位是噪声的标准差
  }
};
LIB.det_ma = {
  head: "滑动平均超限：最近 n 个读数的平均值高过 c/√n 就报警（n 个独立读数的平均，标准差是 1/√n）。",
  decide: function decide(s, p) {
    var n = Math.min(p.n | 0, s.t + 1), m = n > 1 ? (s.mean(n - 1) * (n - 1) + s.x) / n : s.x;     // s.mean(j) 是这一步之前最近 j 个读数的平均
    return n >= (p.n | 0) && m * Math.sqrt(n) >= p.c ? 1 : 0;
  }
};
LIB.det_cusum = {
  head: "累积和（CUSUM）：把每个读数超出参考值 k 的部分累加起来，跌到 0 以下就从 0 重新开始；累到 h 就报警。",
  init: function init(p) {
    return { S: 0 };
  },
  decide: function decide(s, p, st) {
    st.S = Math.max(0, st.S + s.x - p.k);
    return st.S >= p.h ? 1 : 0;
  }
};
LIB.det_clip = {
  head: "截断的累积和：先把每个读数收到 ±c 之内，再做累积和。一个离谱的读数最多只能把 S 推高 c − k。",
  init: function init(p) {
    return { S: 0 };
  },
  decide: function decide(s, p, st) {
    var y = s.x > p.c ? p.c : s.x < -p.c ? -p.c : s.x;            // 截断
    st.S = Math.max(0, st.S + y - p.k);
    return st.S >= p.h ? 1 : 0;
  }
};
LIB.det_shir = {
  head: "后验概率（Shiryaev）：每看到一个读数，就用贝叶斯公式更新\"变化已经发生\"的概率 π；π 超过 A 就报警。",
  init: function init(p) {
    return { pi: 0 };
  },
  decide: function decide(s, p, st) {
    var g = s.g, pm = st.pi + (1 - st.pi) * g.rho;                 // 这一步之前，变化又有 ρ 的概率刚刚发生
    var lr = Math.exp(g.delta * (s.x - g.delta / 2));             // 似然比：读数 x 在"已变"和"未变"两种情形下的概率密度之比
    st.pi = pm * lr / (pm * lr + 1 - pm);
    return st.pi >= p.A ? 1 : 0;
  }
};
LIB.det_dp = {
  head: "动态规划：把\"变化已经发生\"的后验概率 π 当作状态，从最后一步往前倒推每一步的报警线。",
  fit: function fit(D, p, ml, rng) {
    // 假设：噪声是标准正态，变化之后均值抬高 δ，每一步之前有 ρ 的概率发生变化（这些都是细则里写明的）。
    // 状态用 π 的对数几率 l = ln(π/(1−π))：看到读数 y 之后，l 变成 logit(π + (1−π)ρ) + δ·y − δ²/2。
    // V[l]：走到这一步、后验是 π 时，从这里到终局最少还要付出多少期望代价。
    //   现在报警：F·(1−π)（报错了才罚）；再等一步：π（变化若已发生，这一步就是一步延迟）+ E[下一步的 V]。
    var T = D.g.T, rho = D.g.rho, dl = D.g.delta, F = D.g.F, L0 = -16, dL = 0.125, NL = 257, nq = 49, i, j, t, tot = 0;
    var z = new Float64Array(nq), w = new Float64Array(nq), V = new Float64Array(NL), W = new Float64Array(NL), A = new Float64Array(T), tmp;
    for (j = 0; j < nq; j++) { z[j] = -6 + 0.25 * j; w[j] = Math.exp(-0.5 * z[j] * z[j]); tot += w[j]; }
    for (j = 0; j < nq; j++) w[j] /= tot;                          // 标准正态在等距格点上的权重
    function at(V, l) { var q = (l - L0) / dL; if (q <= 0) return V[0]; if (q >= NL - 1) return V[NL - 1]; var k = Math.floor(q); return V[k] + (q - k) * (V[k + 1] - V[k]); }
    function next(V, pi) {                                         // 后验是 pi 时，下一步的 V 的期望
      var pm = pi + (1 - pi) * rho, base = Math.log(pm / (1 - pm)) - 0.5 * dl * dl, a = 0, b = 0;
      for (var j = 0; j < nq; j++) { a += w[j] * at(V, base + dl * (z[j] + dl)); b += w[j] * at(V, base + dl * z[j]); }     // 已变：读数 ~ N(δ, 1)；未变：~ N(0, 1)
      return pm * a + (1 - pm) * b;
    }
    for (t = T - 1; t >= 0; t--) {
      var open = true; A[t] = 2;                                   // 2 = 这一步无论如何都不报
      for (i = NL - 1; i >= 0; i--) {
        var pi = 1 / (1 + Math.exp(-(L0 + i * dL))), sc = F * (1 - pi), cc = pi + (t < T - 1 ? next(V, pi) : 0);
        W[i] = sc <= cc ? sc : cc;
        if (open && sc <= cc) A[t] = pi; else open = false;        // 从 π = 1 往下扫：报警更划算的那一段的下端就是报警线
      }
      tmp = V; V = W; W = tmp;
    }
    var value = next(V, 0), mid = A[Math.min(T - 1, T >> 1)];
    return { A: A, value: value, note: "倒推出的报警线：开局 π ≥ " + A[0].toFixed(3) + "，中段 " + mid.toFixed(3) + "，最后一步 " + (A[T - 1] > 1 ? "不报" : A[T - 1].toFixed(3)) + "。按这些假设，期望代价是 " + value.toFixed(2) + " 步。" };
  },
  init: function init(p, model) {
    return { pi: 0 };
  },
  decide: function decide(s, p, st, model) {
    var g = s.g, pm = st.pi + (1 - st.pi) * g.rho, lr = Math.exp(g.delta * (s.x - g.delta / 2));
    st.pi = pm * lr / (pm * lr + 1 - pm);
    return st.pi >= model.A[s.t] ? 1 : 0;
  }
};
function detDP(p) {
  var T = WORLDS.o_det.Tof(p), g = detSpec(p, T);
  return once("det", [T, g.rho, g.delta, g.F].join("/"), function () { return LIB.det_dp.fit({ g: g }, {}, null, null); });
}
QL.detDP = detDP;

WORLDS.o_det = {
  ideas: ['用最近 13 个读数的中位数代替平均值，超过 3/√13 就报（中位数不怕离群点）', '幅度不知道时：同时跑三条累积和（参考值 0.25、0.5、1），任何一条越线就报', '报警线随剩余步数变化：快到终局时更不愿意报'],
  mk: { 1: "报警（报对了）", 2: "误报" },
  name: "⑬ 变点检测", short: "变点检测", group: GROUP, game: true, obsGame: true, retune: true, no: 13, unit: "步",
  blurb: "一串带噪声的读数。在某个你不知道的时刻，它的均值悄悄抬高了一点。你要尽早报警，但报早了（变化还没发生）要罚。",
  wsel: "src", wkeys: ["src", "gap", "delta"],
  params: [
    sel("src", "世界", "gauss", [["gauss", "正态噪声，幅度已知"], ["unk", "正态噪声，幅度不确定"], ["t3", "厚尾噪声（Student-t，自由度 3）"]],
      { descs: { gauss: "噪声是标准正态；变化之后均值正好抬高 δ。", unk: "噪声是标准正态；实际抬高的幅度每局不同，在 δ 的一半到两倍之间（对数均匀），规则只知道名义值 δ。", t3: "噪声的方差仍是 1，但服从自由度 3 的 t 分布：偶尔会蹦出一个很离谱的读数。" } }),
    num("T", "一局多少步", 400, 50, 3000, 10),
    num("gap", "平均多少步之后发生变化 1/ρ", 100, 10, 2000, 10, { hint: "每一步之前，变化有 ρ 的概率发生；可能到终局都没发生" }),
    num("delta", "变化的幅度 δ", 1, 0.2, 4, 0.05, { hint: "以噪声的标准差为单位" }),
    num("F", "一次误报的代价 F", 50, 1, 1000, 1, { hint: "相当于晚报多少步" })
  ],
  defaults: { N: 2000, T: 400, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 10, 20000); },
  hidden: function () { return { nu: 1, amp: 1 }; },
  consts: function (p, T) { return detSpec(p, T); },
  score: function () { return { name: "平均代价（步）", digits: 2, lower: true }; },
  track: { name: "累计代价" }, obs: { name: "读数" }, action: { name: "报警", kind: "flag" },
  aux: [{ name: "误报的比例", kind: "prob", digits: 1 }, { name: "报对时平均晚了几步", digits: 1, cond: true }, { name: "变了却一直没报的比例", kind: "prob", digits: 1 }],
  defStrat: "det_cusum",
  ranges: function (p) {
    // 默认值都按"正态噪声、幅度正好是 δ"来定：后验概率的报警线取动态规划在一局中段的那个值；
    // 累积和的 h 用一条经验公式从它换算过来（δ·h ≈ 报警线的对数几率 − ln ρ − ln(1/(1 − e^(−δ²/2))) − 0.7，在几组设定下与扫描出的最优值相差不到 1）
    var g = detSpec(p, WORLDS.o_det.Tof(p)), o = { "det_cusum.k": [0, 4, +(g.delta / 2).toFixed(3)] }, A = detDP(p).A, a = clamp(A[Math.min(g.T - 1, g.T >> 1)], 0.01, 0.999);
    o["det_shir.A"] = [0.01, 0.999, +a.toFixed(3)];
    o["det_cusum.h"] = [0.25, 30, +clamp((Math.log(a / (1 - a)) - Math.log(g.rho) + Math.log(1 - Math.exp(-g.delta * g.delta / 2)) - 0.7) / g.delta, 0.5, 30).toFixed(2)];
    o["det_clip.k"] = o["det_cusum.k"]; o["det_clip.h"] = o["det_cusum.h"];
    o["det_ma.n"] = [2, 100, clamp(Math.round(12 / (g.delta * g.delta)), 2, 100)];
    return o;
  },
  gen: function (c) {
    var p = c.p, g = c.rng, T = c.T, rho = 1 / clamp(+p.gap, 2, 1e7), src = p.src, nu = 0, amp = clamp(+p.delta, 0.01, 50), t, y = 0;
    while (nu < T && g.u() >= rho) nu++;          // 每一步之前有 ρ 的概率发生变化；nu = T 表示这一局没变
    if (src === "unk") amp *= 0.5 * Math.pow(4, g.u());
    c.h.nu[0] = nu; c.h.amp[0] = amp;
    for (t = 0; t < T; t++) { y = (src === "t3" ? g.t(3) * T3 : g.normal()) + (t >= nu ? amp : 0); c.r[t] = y; c.lv[t] = y; }
    c.lv[T] = y;
  },
  play: function (E) {
    var T = E.T, V = E.V, y = E.r, nu = E.h.nu[0], F = E.g.F, t, a, cost = 0, stop = -1;
    for (t = 0; t < T; t++) {
      V.x = y[t];
      a = E.ask(t);
      if (a >= 0.5) { stop = t; if (t < nu) cost += F; E.put(t, 1, cost, t < nu ? 2 : 1); E.fill(t + 1, cost, 0); break; }
      if (t >= nu) cost += 1;                     // 变化已经发生而你还没报：这一步算一步延迟
      E.put(t, 0, cost, 0);
    }
    E.score = -cost;                              // 成本记成负数（引擎里的得分一律越高越好）
    E.aux[0] = stop >= 0 && stop < nu ? 1 : 0;
    E.aux[1] = stop >= nu && nu < T ? stop - nu : NaN;
    E.aux[2] = nu < T && stop < 0 ? 1 : 0;
  },
  theory: function (p) {
    var g = detSpec(p, WORLDS.o_det.Tof(p)), marks = [{ id: "never", name: "从不报警（公式）", value: -detNever(g) }], out = { marks: marks, curves: {}, never: detNever(g) };
    if (p.src === "gauss") { var dp = detDP(p); out.dp = dp.value; out.A0 = dp.A[0]; out.Amid = dp.A[Math.min(g.T - 1, g.T >> 1)]; marks.push({ id: "dp", name: "理论最优（动态规划）", value: -dp.value, kind: "optimum" }); }
    return out;
  },
  refs: function (p) {
    var g = detSpec(p, WORLDS.o_det.Tof(p)), R = WORLDS.o_det.ranges(p);
    return [
      { id: "shew", name: "单点超限（k = 3）", lib: "det_shew", p: { k: 3 }, bench: true },
      { id: "cusum", name: "累积和 CUSUM（k = " + (g.delta / 2).toFixed(2) + "，h = " + R["det_cusum.h"][2] + "）", lib: "det_cusum", p: { k: g.delta / 2, h: R["det_cusum.h"][2] } },
      { id: "dp", name: "动态规划（按正态噪声、幅度 δ 算）", lib: "det_dp", p: {} }
    ];
  },
  scenes: [
    { name: "幅度 1σ", p: { src: "gauss" } }, { name: "幅度 0.5σ", p: { delta: 0.5 } }, { name: "幅度 2σ", p: { delta: 2 } }, { name: "误报罚 500 步", p: { F: 500 } },
    { name: "幅度不确定", p: { src: "unk" } }, { name: "厚尾噪声", p: { src: "t3" } }
  ],
  api: [
    "动作：返回 1（或任何 ≥ 0.5 的数）= 现在报警，这一局到此结束；返回 0 = 继续看。",
    "s.x          这一步的读数（噪声的标准差是 1）",
    "s.ret(k)     k+1 步之前的读数；s.rets(n)、s.mean(n)、s.vol(n) 是这一步之前最近 n 个读数组成的数组、均值、标准差",
    "s.g.rho      每一步之前发生变化的概率；s.g.delta 变化的（名义）幅度；s.g.F 一次误报的代价；s.g.T 一局多少步；s.t 现在是第几步",
    "规则不知道变化发生了没有，也不知道这是哪一种世界：厚尾、幅度不确定这些，都得你自己防。"
  ].join("\n")
};

/* ================================================================== *
 *  ⑭ 停在最高点
 * ================================================================== */
/** 连续时间、没有漂移时的最优值（Graversen–Peskir–Shiryaev 2001）：z* 是 4Φ(z) − 2zφ(z) − 3 = 0 的根，最优代价 2Φ(z*) − 1 */
function gps() {
  var lo = 0, hi = 3, i, m;
  for (i = 0; i < 80; i++) { m = (lo + hi) / 2; if (4 * ncdf(m) - 2 * m * npdf(m) - 3 > 0) hi = m; else lo = m; }
  return { z: (lo + hi) / 2, v: 2 * ncdf((lo + hi) / 2) - 1 };
}
QL.gps = gps;

LIB.stop_end = {
  head: "走到头：从不主动停。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 0;                                     // 0 = 继续走，1 = 现在停
  }
};
LIB.stop_now = {
  head: "立刻停：第一步就停，手里的值是 0。",
  decide: function decide(s, p) {
    return 1;
  }
};
LIB.stop_trail = {
  head: "固定回落：从到目前为止的最高点回落超过 d 就停。",
  decide: function decide(s, p) {
    return s.hi(s.t + 1) - s.x >= p.d ? 1 : 0;    // s.hi(n) 是最近 n 个值里最大的；s.t + 1 个就是从开局到现在
  }
};
LIB.stop_sqrt = {
  head: "回落超过 z·√剩余步数 就停：剩的时间越少，越小的回落就该停。",
  decide: function decide(s, p) {
    return s.hi(s.t + 1) - s.x >= p.z * Math.sqrt(s.g.T - s.t) ? 1 : 0;
  }
};
LIB.stop_37 = {
  head: "照搬秘书问题：前一段时间只看不停，之后一旦回到（或超过）此前的最高点就停。",
  decide: function decide(s, p) {
    return s.t >= p.f * s.g.T && s.x >= s.hi(s.t + 1) ? 1 : 0;
  }
};
LIB.stop_dp = {
  head: "动态规划：把\"还剩几步、现在离最高点多远\"当作状态，从最后一步往前倒推每个状态下该停还是该走。",
  fit: function fit(D, p, ml, rng) {
    // 假设：每一步的增量互相独立，服从 N(μ, 1)。记 s = 还剩几步，y = 现在离到目前为止的最高点多远（y ≥ 0）。
    //   现在停下：最后离全程最高点的距离是 Z = max(y, 之后 s 步里从现在算起的最大涨幅)。
    //   m1[y] = E[Z]，m2[y] = E[Z²]（现在停的代价），V[y] = 按最优方式走下去的代价。三张表都按 s = 0, 1, 2, … 往上递推：
    //   先走一步 Δ，则 Z = Δ + Z'，Z' 是"还剩 s−1 步、离最高点 max(y − Δ, 0)"时的 Z。
    // 增量取在间距 dy 的格点上（权重按正态密度），这样 y − Δ 总落在格点上，不用插值。
    var T = D.g.T, mu = D.g.mu, dy = 0.2, J = 26, Y = Math.ceil((5 * Math.sqrt(T) + 6 + Math.max(0, -mu) * T) / dy), i, j, s, tot = 0, tmp;
    var d = new Float64Array(2 * J + 1), w = new Float64Array(2 * J + 1);
    for (j = -J; j <= J; j++) { d[j + J] = j * dy; w[j + J] = Math.exp(-0.5 * (j * dy - mu) * (j * dy - mu)); tot += w[j + J]; }
    for (j = 0; j <= 2 * J; j++) w[j] /= tot;
    var m1 = new Float64Array(Y + 1), m2 = new Float64Array(Y + 1), V = new Float64Array(Y + 1), n1 = new Float64Array(Y + 1), n2 = new Float64Array(Y + 1), nV = new Float64Array(Y + 1);
    var stop = new Uint8Array((T + 1) * (Y + 1));
    for (i = 0; i <= Y; i++) { m1[i] = i * dy; m2[i] = m1[i] * m1[i]; V[i] = m2[i]; }
    for (s = 1; s <= T; s++) {
      for (i = 0; i <= Y; i++) {
        var e1 = 0, e2 = 0, ev = 0;
        for (j = -J; j <= J; j++) {
          var k = i - j, dd = d[j + J], ww = w[j + J], u1, u2, uv;
          if (k < 0) k = 0;
          if (k > Y) { u1 = k * dy; u2 = u1 * u1; uv = Math.min(u2, (u1 - mu * (s - 1)) * (u1 - mu * (s - 1)) + s - 1); }    // 网格之外：离最高点太远，之后不会再创新高
          else { u1 = m1[k]; u2 = m2[k]; uv = V[k]; }
          e1 += ww * (dd + u1); e2 += ww * (dd * dd + 2 * dd * u1 + u2); ev += ww * uv;
        }
        n1[i] = e1; n2[i] = e2;
        if (e2 <= ev) { nV[i] = e2; stop[s * (Y + 1) + i] = 1; } else nV[i] = ev;
      }
      tmp = m1; m1 = n1; n1 = tmp; tmp = m2; m2 = n2; n2 = tmp; tmp = V; V = nV; nV = tmp;
    }
    var b = function (s) { for (var i = 0; i <= Y; i++) if (stop[s * (Y + 1) + i]) return i * dy; return Infinity; };
    return { stop: stop, Y: Y, dy: dy, value: V[0] / T, now: m2[0] / T, b1: b(T), bHalf: b(T >> 1),
      note: "倒推的结果：开局时回落超过 " + b(T).toFixed(1) + " 才停，走到一半时是 " + b(T >> 1).toFixed(1) + "，最后一步是 " + b(1).toFixed(1) + "。按这些假设，期望代价是 " + (V[0] / T).toFixed(3) + "（立刻停是 " + (m2[0] / T).toFixed(3) + "）。" };
  },
  decide: function decide(s, p, st, model) {
    var left = s.g.T - s.t, y = s.hi(s.t + 1) - s.x, i = Math.round(y / model.dy), mu = s.g.mu;
    if (i > model.Y) return y * y <= (y - mu * left) * (y - mu * left) + left ? 1 : 0;       // 表格之外：比较"现在停"和"走到头"
    return model.stop[left * (model.Y + 1) + i];
  }
};
function stopDP(p) {
  var T = WORLDS.o_stop.Tof(p), mu = +p.mu || 0;
  return once("stop", T + "/" + mu, function () {
    var a = LIB.stop_dp.fit({ g: { T: T, mu: mu } }, {}, null, null), b = mu === 0 ? a : LIB.stop_dp.fit({ g: { T: T, mu: -mu } }, {}, null, null);
    return { value: a.value, now: a.now, end: b.now, b1: a.b1, bHalf: a.bHalf };       // 走到头的代价 = 把路径倒过来看的"立刻停"：漂移反号
  });
}
QL.stopDP = stopDP;

WORLDS.o_stop = {
  ideas: ['报警线不用 √剩余步数，改成剩余步数的别的次幂，扫描一下指数', '有向上的漂移时：除非只剩最后几步，否则一直走', '均值回复的世界里：高出均值一定幅度就停，不看回落'],
  mk: { 1: "停在这里" },
  name: "⑭ 停在最高点", short: "停在最高点", group: GROUP, game: true, obsGame: true, retune: true, no: 14, unit: "步",
  blurb: "看着一条路径一步一步往前走。你可以在任何一步喊停，喊了就不能反悔；不喊就走到头。目标是停下的地方离整条路径的最高点尽量近。",
  wsel: "src", wkeys: ["src", "mu", "phi"],
  params: [
    sel("src", "世界", "bm", [["bm", "布朗运动（随机游走）"], ["t3", "厚尾步长（Student-t，自由度 3）"], ["ou", "均值回复"]],
      { descs: { bm: "从 0 出发，每一步加上 μ 和一个标准正态增量。", t3: "步长的方差仍是 1，但服从自由度 3 的 t 分布：偶尔一步跨得很远。", ou: "从均值 0 出发，偏离每一步只留下 φ 倍，再加噪声；平稳标准差是 1。" } }),
    num("T", "一局多少步", 250, 20, 2000, 10),
    num("mu", "每步的漂移 μ", 0, -0.3, 0.3, 0.01, { show: isSrc(["bm", "t3"]), hint: "以步长的标准差为单位" }),
    num("phi", "每步保留的偏离 φ", 0.97, 0.5, 0.999, 0.001, { show: isSrc(["ou"]) })
  ],
  defaults: { N: 2000, T: 250, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 5, 20000); },
  consts: function (p, T) { return { T: T, mu: p.src === "ou" ? 0 : +p.mu || 0, norm: p.src === "ou" ? 1 : T }; },
  score: function (p) { return { name: p.src === "ou" ? "离最高点距离的平方" : "离最高点距离的平方 ÷ 步数", digits: 3, lower: true }; },
  track: { name: "手里的值" }, obs: { name: "路径" }, rName: "步长", rAxis: "每一步走了多少", action: { name: "停", kind: "flag" },
  aux: [{ name: "停在全程的什么位置", kind: "prob", digits: 0 }, { name: "离最高点的平均距离（以 √步数 为单位）", digits: 3 }, { name: "正好停在最高点的比例", kind: "prob", digits: 1 }],
  defStrat: "stop_sqrt",
  ranges: function (p) { var T = WORLDS.o_stop.Tof(p); return { "stop_trail.d": [0, +(4 * Math.sqrt(T)).toFixed(1), +(p.src === "ou" ? 1.5 : 0.75 * Math.sqrt(T)).toFixed(1)] }; },
  gen: function (c) {
    var p = c.p, g = c.rng, T = c.T, lv = c.lv, src = p.src, x = 0, t, mu = +p.mu || 0;
    lv[0] = 0;
    if (src === "ou") { var a = clamp(+p.phi, 0, 0.9999), sd = Math.sqrt(1 - a * a); for (t = 0; t < T; t++) { x = a * x + sd * g.normal(); lv[t + 1] = x; } }
    else for (t = 0; t < T; t++) { x += mu + (src === "t3" ? g.t(3) * T3 : g.normal()); lv[t + 1] = x; }
    for (t = 0; t < T; t++) c.r[t] = lv[t + 1] - lv[t];
  },
  play: function (E) {
    var T = E.T, V = E.V, lv = E.lv, M = lv[0], stop = T, t, a;
    for (t = 1; t <= T; t++) if (lv[t] > M) M = lv[t];
    for (t = 0; t < T; t++) {
      V.x = lv[t];
      a = E.ask(t);
      if (a >= 0.5) { stop = t; E.put(t, 1, lv[t], 1); E.fill(t + 1, lv[t], 0); break; }
      E.put(t, 0, lv[t + 1], 0);
    }
    var d = M - lv[stop];
    E.score = -d * d / E.g.norm; E.aux[0] = stop / T; E.aux[1] = d / Math.sqrt(T); E.aux[2] = d < 1e-12 ? 1 : 0;
  },
  theory: function (p) {
    var marks = [], out = { marks: marks, curves: {} };
    if (p.src === "bm") {
      var dp = stopDP(p), mu = +p.mu || 0;
      out.dp = dp.value; out.now = dp.now; out.end = dp.end; out.b1 = dp.b1; out.bHalf = dp.bHalf;
      marks.push({ id: "end", name: "走到头（递推）", value: -dp.end });
      marks.push({ id: "now", name: "立刻停（递推）", value: -dp.now });
      marks.push({ id: "dp", name: "理论最优（动态规划）", value: -dp.value, kind: "optimum" });
      if (mu === 0) { var G = gps(); out.gpsZ = G.z; out.gpsV = G.v; marks.push({ id: "gps", name: "连续时间的最优值 2Φ(z*) − 1（步数趋于无穷时的极限）", value: -G.v }); }
    }
    return out;
  },
  refs: function (p) {
    return [
      { id: "end", name: "走到头", lib: "stop_end", p: {}, bench: true },
      { id: "now", name: "立刻停", lib: "stop_now", p: {} },
      { id: "sqrt", name: "回落超过 1.12·√剩余步数 就停", lib: "stop_sqrt", p: { z: 1.12 } },
      { id: "dp", name: "动态规划（按正态步长" + (p.src === "ou" ? "、没有回复" : "") + "算）", lib: "stop_dp", p: {} }
    ];
  },
  scenes: [
    { name: "没有漂移", p: { src: "bm", mu: 0 } }, { name: "向上漂移 +0.05", p: { mu: 0.05 } }, { name: "向下漂移 −0.05", p: { mu: -0.05 } },
    { name: "只有 50 步", p: { T: 50 } }, { name: "厚尾步长", p: { src: "t3" } }, { name: "均值回复", p: { src: "ou" } }
  ],
  api: [
    "动作：返回 1（或任何 ≥ 0.5 的数）= 现在停，手里的值就定在这一步的 s.x；返回 0 = 继续走。一直不停，就走到最后一步，手里是终点的值。",
    "s.x          路径现在的值（开局是 0）；s.p(k) 是 k 步之前的值",
    "s.hi(n)      最近 n 个值里最大的（s.hi(s.t + 1) 就是开局到现在的最高点）；s.lo(n) 是最小的",
    "s.ret(k)     最近第 k+1 步的增量；s.mean(n)、s.vol(n) 是最近 n 个增量的均值、标准差",
    "s.g.T        一局多少步；s.t 现在是第几步（从 0 起）；s.g.mu 每步的漂移（均值回复的世界里记作 0）",
    "规则不知道这是哪一种世界。计分只看停下的地方离整条路径最高点的距离（包括你停下之后才出现的最高点）。"
  ].join("\n")
};

QL.OBS = ["o_meas", "o_pred", "o_det", "o_stop"];
QL.ALL_GAMES = QL.GAMES.concat(QL.OBS);
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_OBS_INSTALL;
