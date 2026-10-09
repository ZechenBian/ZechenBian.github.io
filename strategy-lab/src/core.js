// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 计算内核
 * 同一份代码在页面主线程（只用到元数据）和后台线程（真正做计算）里各跑一遍：
 * 主线程用 QL_CORE.toString() 取得源码，拼上策略代码后做成 Worker。
 * 所以这个函数必须自包含，不能引用外面的任何变量。 */
function QL_CORE(self) {
"use strict";
var QL = { version: 3 };

/* ================================================================== *
 *  一、随机数
 * ================================================================== */
function hash32(x) {
  x |= 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
QL.hash32 = hash32;

/* sfc32：每条路径一个独立的流，(种子, 路径号, 批次号) 决定一切，
 * 所以第 i 条路径长什么样与总路径数无关，也与生成顺序无关。 */
function RNG(seed, stream, batch) {
  this.a = hash32((seed | 0) ^ 0x9e3779b9);
  this.b = hash32(Math.imul((stream | 0) + 1, 0x7f4a7c15) ^ this.a);
  this.c = hash32(Math.imul((batch | 0) + 1, 0x165667b1) ^ this.b);
  this.d = 1;
  this._sp = NaN;
  for (var i = 0; i < 15; i++) this.next();
}
RNG.prototype.next = function () {
  var a = this.a, b = this.b, c = this.c;
  var t = (a + b | 0) + this.d | 0;
  this.d = this.d + 1 | 0;
  this.a = b ^ (b >>> 9);
  this.b = c + (c << 3) | 0;
  c = (c << 21) | (c >>> 11);
  this.c = c + t | 0;
  return t >>> 0;
};
/** (0,1) 上的均匀分布 */
RNG.prototype.u = function () { return (this.next() + 0.5) / 4294967296; };
RNG.prototype.uniform = function (lo, hi) {
  if (lo === undefined) return this.u();
  return lo + (hi - lo) * this.u();
};
/** 标准正态（Marsaglia 极坐标法） */
RNG.prototype.normal = function (mean, sd) {
  var z = this._sp;
  if (z === z) { this._sp = NaN; }
  else {
    var u, v, q;
    do { u = 2 * this.u() - 1; v = 2 * this.u() - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
    var f = Math.sqrt(-2 * Math.log(q) / q);
    this._sp = v * f; z = u * f;
  }
  return mean === undefined ? z : mean + (sd === undefined ? 1 : sd) * z;
};
RNG.prototype.exp = function (rate) { return -Math.log(this.u()) / (rate === undefined ? 1 : rate); };
RNG.prototype.bernoulli = function (p) { return this.u() < p ? 1 : 0; };
RNG.prototype.int = function (n) { return Math.floor(this.u() * n); };
RNG.prototype.choice = function (arr) { return arr[this.int(arr.length)]; };
RNG.prototype.laplace = function () { // 方差 = 2
  var u = this.u() - 0.5;
  return u < 0 ? Math.log(1 + 2 * u) : -Math.log(1 - 2 * u);
};
RNG.prototype.cauchy = function () { return Math.tan(Math.PI * (this.u() - 0.5)); };
/** Gamma(k, 1)，Marsaglia–Tsang */
RNG.prototype.gamma = function (k) {
  if (k < 1) return this.gamma(k + 1) * Math.pow(this.u(), 1 / k);
  var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d), x, v, u;
  for (;;) {
    do { x = this.normal(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; u = this.u();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
};
/** Student-t，自由度 nu */
RNG.prototype.t = function (nu) { return this.normal() / Math.sqrt(2 * this.gamma(nu / 2) / nu); };
RNG.prototype.poisson = function (lam) {
  if (lam <= 0) return 0;
  if (lam > 30) { var x = Math.round(lam + Math.sqrt(lam) * this.normal()); return x < 0 ? 0 : x; }
  var L = Math.exp(-lam), k = 0, p = 1;
  do { k++; p *= this.u(); } while (p > L);
  return k - 1;
};
QL.RNG = RNG;
/** 计时：能用高精度时钟就用它 */
var nowMs = typeof performance !== "undefined" && performance && typeof performance.now === "function" ? function () { return performance.now(); } : function () { return Date.now(); };
QL.nowMs = nowMs;
/** 一个对象里一共存了多少个数（规则的状态、训练出来的模型有多大）。
 *  模型库里的模型把数据藏在闭包里，数不到，所以由它们自己报：带 kind、size 并且能 predict（或 filter）的对象直接取 size。
 *  出任何意外（比如会抛错的属性）都返回 null，不让"量一下大小"拖垮一次回测。 */
function sizeOf(o) {
  var seen = typeof Set === "function" ? new Set() : null;
  function walk(x, depth) {
    if (x == null) return 0;
    var t = typeof x;
    if (t === "number" || t === "boolean") return 1;
    if (t !== "object") return 0;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(x)) return x.length || 0;
    if (depth > 8 || (seen && seen.has(x))) return 0;
    if (seen) seen.add(x);
    if (typeof x.kind === "string" && typeof x.size === "number" && x.size >= 0 && (typeof x.predict === "function" || typeof x.filter === "function")) return x.size;
    var s = 0, k;
    if (Array.isArray(x)) { for (k = 0; k < x.length; k++) s += typeof x[k] === "number" ? 1 : walk(x[k], depth + 1); return s; }
    if (typeof Map === "function" && x instanceof Map) { x.forEach(function (v, key) { s += walk(key, depth + 1) + walk(v, depth + 1); }); return s; }
    if (typeof Set === "function" && x instanceof Set) { x.forEach(function (v) { s += walk(v, depth + 1); }); return s; }
    for (k in x) { if (k === "diag" || k === "note") continue; s += walk(x[k], depth + 1); }
    return s;
  }
  try { return walk(o, 0); } catch (e) { return null; }
}
QL.sizeOf = sizeOf;

/* ================================================================== *
 *  二、小工具
 * ================================================================== */
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function nextPow2(n) { var m = 1; while (m < n) m <<= 1; return m; }
/** 原地 FFT（长度为 2 的幂）。re, im 为 Float64Array */
function fft(re, im) {
  var n = re.length, i, j = 0, k, t;
  for (i = 1; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (i = 0; i < n; i += len) {
      var cr = 1, ci = 0;
      for (k = 0; k < len / 2; k++) {
        var a = i + k, b = a + len / 2;
        var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
QL.fft = fft;
function quantileSorted(a, q) {
  var n = a.length; if (!n) return NaN;
  var h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return a[lo] + (a[hi] - a[lo]) * (h - lo);
}
QL.quantileSorted = quantileSorted;
/** N 个独立标准正态最大值的期望（选择偏差的量级） */
QL.expectedMaxNormal = function (n) {
  if (n <= 1) return 0;
  // Blom 近似，n=100 时给出 2.499（精确值 2.5076，低估约 0.4%）
  var p = (n - 0.375) / (n + 0.25);
  return QL.normInv(p);
};
QL.normInv = function (p) { // Acklam
  var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
      b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
      c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
      d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  var q, r;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
};

/* ================================================================== *
 *  三、世界（数据来源）
 *  每个世界：元数据（给界面用）+ gen(c)（给后台线程用）。
 *  gen 要么填 c.r（每步简单收益，引擎据此累乘出价格），
 *  要么填 c.lv（价格水平，长度 T+1，引擎据此算收益），由 level 标志区分。
 *  参数里带百分号的量都是"年化、百分数"，在 gen 里换算成每步。
 * ================================================================== */
var WORLDS = {};
var WORLD_GROUPS = ["经典分布", "连续时间模型", "有记忆的过程", "物理来源", "真实数据", "自定义"];

function num(key, label, def, min, max, step, extra) {
  var o = { key: key, label: label, def: def, min: min, max: max, step: step, type: "num" };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}
function sel(key, label, def, options, extra) {
  var o = { key: key, label: label, def: def, options: options, type: "select" };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}
QL.num = num; QL.sel = sel;

/* ---------- 经典分布：独立同分布的每步收益 ---------- */
WORLDS.iid = {
  name: "经典分布（独立同分布收益）", short: "经典分布", group: "经典分布",
  blurb: "每一步的收益独立地从同一个分布里抽：r = μΔ + σ√Δ·ε，ε 已标准化为均值 0、方差 1（柯西除外）。",
  params: [
    sel("dist", "分布", "normal", [
      ["normal", "正态"], ["t", "Student-t（厚尾）"], ["laplace", "拉普拉斯（双指数）"], ["uniform", "均匀"],
      ["twopoint", "两点（二叉树）"], ["mixture", "混合正态（偶发大跌）"], ["skewL", "左偏（指数尾）"],
      ["skewR", "右偏（指数尾）"], ["cauchy", "柯西（截断于 ±50 个尺度）"]]),
    num("mu", "期望收益 μ", 8, -30, 60, 0.5, { unit: "%/年" }),
    num("sigma", "波动 σ", 20, 1, 120, 0.5, { unit: "%/年" }),
    num("nu", "自由度 ν", 3, 2.1, 30, 0.1, { show: function (p) { return p.dist === "t"; }, hint: "尾部指数；ν 越小尾越厚，ν ≤ 2 时方差不存在" }),
    num("q", "上涨概率 q", 0.5, 0.05, 0.95, 0.01, { show: function (p) { return p.dist === "twopoint"; }, hint: "q ≠ 0.5 时涨跌幅自动调整，保持均值和方差不变" }),
    num("w", "大跌概率 w", 0.02, 0.002, 0.2, 0.002, { show: function (p) { return p.dist === "mixture"; } }),
    num("d", "大跌幅度（σ 的倍数）", 4, 1, 6, 0.1, { show: function (p) { return p.dist === "mixture"; }, hint: "大跌概率调大之后它有上限（否则整体的方差凑不成 1）：超过时按上限算，比如 w = 0.05 时最多约 3.9" })
  ],
  defaults: { N: 2000, T: 252, K: 252 },
  gen: function (c) {
    var p = c.p, T = c.T, r = c.r, g = c.rng, m = p.mu / 100 * c.dt, s = p.sigma / 100 * Math.sqrt(c.dt);
    var dist = p.dist, t, e, x;
    var nu = Math.max(2.05, p.nu || 3), tscale = Math.sqrt((nu - 2) / nu);
    var q = clamp(p.q == null ? 0.5 : p.q, 0.01, 0.99), up = Math.sqrt((1 - q) / q), dn = -Math.sqrt(q / (1 - q));
    var w = clamp(p.w == null ? 0.02 : p.w, 0.0005, 0.4), d = p.d == null ? 4 : p.d, kk = 1.5;
    // 混合正态：以概率 w 取 N(-d, kk²)，否则取 N(m1, s1²)，整体均值 0、方差 1
    var dmax = Math.sqrt(Math.max(0.01, (1 - w * kk * kk) * (1 - w) / w)) * 0.95;
    if (d > dmax) d = dmax; // 参数过猛时收缩大跌幅度，保证另一支的方差为正
    var m1 = w * d / (1 - w), s1sq = Math.max(1e-4, (1 - w * (kk * kk + d * d)) / (1 - w) - m1 * m1);
    var s1 = Math.sqrt(s1sq), SQ3 = Math.sqrt(3), SQH = Math.SQRT1_2;
    for (t = 0; t < T; t++) {
      switch (dist) {
        case "t": e = g.t(nu) * tscale; break;
        case "laplace": e = g.laplace() * SQH; break;
        case "uniform": e = (2 * g.u() - 1) * SQ3; break;
        case "twopoint": e = g.u() < q ? up : dn; break;
        case "mixture": e = g.u() < w ? -d + kk * g.normal() : m1 + s1 * g.normal(); break;
        case "skewL": e = 1 + Math.log(g.u()); break;
        case "skewR": e = -1 - Math.log(g.u()); break;
        case "cauchy": do { e = g.cauchy(); } while (e > 50 || e < -50); e *= 0.5; break;
        default: e = g.normal();
      }
      x = m + s * e;
      r[t] = x < -0.999 ? -0.999 : x;
    }
  },
  theory: function (p, env) {
    if (p.dist !== "twopoint") {
      if (p.dist === "cauchy") return { note: "柯西分布没有均值和方差：样本均值不收敛，加路径也不会让估计变准。这里截断在 ±50 个尺度，矩才存在。" };
      return { note: "收益独立同分布，过去对未来没有任何预测力：任何择时规则的期望对数增长率都不会超过同等平均仓位的固定比例（每一步的期望收益则恰好相等）。最优的固定比例由 $\\max_f \\mathbb{E}\\log(1+f\\,r)$ 给出；$\\sigma\\sqrt{\\Delta}$ 很小时 $f^*\\approx\\mu/\\sigma^2$（二阶近似，无风险利率取 0，$\\Delta$ 是一步的时长），厚尾和负偏会让它更小。分布没有下界时，严格地说只要 $f>1$ 就有正概率一步亏光：正态时这个概率小到看不见，Student-t 时在模拟里真的会出现。" };
    }
    var q = clamp(p.q, 0.01, 0.99), dt = 1 / env.K, m = p.mu / 100 * dt, s = p.sigma / 100 * Math.sqrt(dt);
    var a = m + s * Math.sqrt((1 - q) / q), cdn = -(m - s * Math.sqrt(q / (1 - q))), rf = env.rf / 100 * dt;
    return {
      exact: true,
      gOfF: function (f) {
        var u = 1 + f * a + (1 - f) * rf, v = 1 - f * cdn + (1 - f) * rf;
        if (u <= 0 || v <= 0) return -Infinity;
        return env.K * (q * Math.log(u) + (1 - q) * Math.log(v));
      },
      fStar: (function () { // 一阶条件 q(a-rf)/(1+rf+f(a-rf)) = (1-q)(c+rf)/(1+rf-f(c+rf))
        var A = a - rf, C = cdn + rf, R = 1 + rf;
        if (A > 0 && C > 0) return R * (q * A - (1 - q) * C) / (A * C);
        return A > 0 ? Infinity : C > 0 ? -Infinity : NaN;   // 涨跌都不低于（或都不高于）无风险收益：套利，没有有限的最优仓位
      })(),
      note: "两点分布下 Kelly 问题有闭式解：每步涨 $a$ 的概率为 $q$、跌 $c$ 的概率为 $1-q$ 时，$f^*=q/c-(1-q)/a$（无风险利率为 0）。要求 $a>0$、$c>0$，即涨和跌分居无风险收益的两侧；否则是套利，$f^*$ 无界。"
    };
  }
};

/* ---------- 下注游戏 ---------- */
WORLDS.bet = {
  name: "下注游戏（抛硬币）", short: "下注游戏", group: "经典分布",
  blurb: "每一次以概率 p 赢得 b 倍赌注，否则输掉赌注。仓位 f 就是每次押上的资金比例。",
  params: [
    num("p", "胜率 p", 0.6, 0.05, 0.95, 0.01),
    num("b", "赔率 b（赢时净得 b 倍）", 1, 0.2, 5, 0.1)
  ],
  defaults: { N: 2000, T: 100, K: 1 }, unit: "次", level: true, benchF: 0, bounds: [0, 1],
  gen: function (c) {
    var p = c.p, T = c.T, r = c.r, lv = c.lv, g = c.rng, x = 0;
    lv[0] = c.S0;
    for (var t = 0; t < T; t++) {
      var win = g.u() < p.p;
      r[t] = win ? p.b : -1; x += win ? 1 : -1;
      lv[t + 1] = c.S0 * Math.exp(0.02 * x);
    }
  },
  theory: function (p) {
    var q = 1 - p.p;
    return {
      exact: true,
      gOfF: function (f) { if (f >= 1 || 1 + p.b * f <= 0) return f === 0 ? 0 : -Infinity; return p.p * Math.log(1 + p.b * f) + q * Math.log(1 - f); },
      fStar: Math.max(0, p.p - q / p.b),
      note: (function () {
        var fs = p.p - q / p.b, base = "Kelly (1956)：最大化每次的对数增长率 $g(f)=p\\log(1+bf)+(1-p)\\log(1-f)$，解得 $f^*=p-(1-p)/b$。";
        if (!(fs > 0)) return base + "按当前参数 $f^*\\le 0$：这个赌局的期望不为正，最优是一分不押。";
        var g = function (f) { return p.p * Math.log(1 + p.b * f) + q * Math.log(1 - f); }, lo = fs, hi = 1 - 1e-12;
        for (var i = 0; i < 80; i++) { var mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid; }
        return base + "增长率在 $f=" + lo.toFixed(3) + "$ 处回到 0，再多就是负的（二阶近似下这个点是 $2f^*=" + (2 * fs).toFixed(3) + "$；胜率低于一半时精确的零点略大于 $2f^*$，高于一半时略小，恰为一半时正好是 $2f^*$）。$f=1$ 时第一次输就归零。";
      })()
    };
  }
};

/* ---------- 几何布朗运动 ---------- */
WORLDS.gbm = {
  name: "几何布朗运动（GBM）", short: "GBM", group: "连续时间模型",
  blurb: "每一步的对数收益互相独立、服从同一个正态分布：平均每年涨 μ，波动每年 σ。写成公式是 dS/S = μ dt + σ dW，Black–Scholes 期权定价用的就是这个模型。",
  params: [num("mu", "漂移 μ", 8, -30, 60, 0.5, { unit: "%/年" }), num("sigma", "波动 σ", 20, 1, 120, 0.5, { unit: "%/年" })],
  defaults: { N: 2000, T: 252, K: 252 },
  gen: function (c) {
    var mu = c.p.mu / 100, sg = c.p.sigma / 100, a = (mu - 0.5 * sg * sg) * c.dt, b = sg * Math.sqrt(c.dt), r = c.r, g = c.rng;
    for (var t = 0; t < c.T; t++) r[t] = Math.exp(a + b * g.normal()) - 1;
  },
  theory: function (p, env) {
    var mu = p.mu / 100, sg = p.sigma / 100, rf = env.rf / 100;
    return {
      gOfF: function (f) { return rf + f * (mu - rf) - 0.5 * f * f * sg * sg; },
      fStar: (mu - rf) / (sg * sg),
      note: "Merton (1969)：连续再平衡、对数效用下最优仓位恒为 $f^*=(\\mu-r_f)/\\sigma^2$，增长率 $g(f)=r_f+f(\\mu-r_f)-f^2\\sigma^2/2$，峰值 $g^*=r_f+(\\mu-r_f)^2/(2\\sigma^2)$（$r_f$ 是无风险利率，按年）。按天再平衡时曲线略有偏离；严格地说，离散调仓下 $f>1$ 或 $f<0$ 都有正概率一步亏光（这时 $\\mathbb{E}\\log$ 是 $-\\infty$），只是概率小到模拟里看不见。"
    };
  }
};

/* ---------- OU：均值回复 ---------- */
WORLDS.ou = {
  name: "均值回复（OU / 朗之万方程）", short: "均值回复", group: "连续时间模型",
  blurb: "对数价格 X 满足 dX = κ(ln θ − X) dt + σ dW，被一根弹簧拉回均衡价 θ。物理上就是过阻尼朗之万方程。",
  params: [
    num("theta", "均衡价 θ", 100, 20, 500, 1),
    num("kappa", "回复速度 κ", 5, 0.2, 60, 0.1, { unit: "/年", hint: "半衰期 = ln2/κ 年" }),
    num("sigma", "波动 σ", 20, 1, 120, 0.5, { unit: "%/年" }),
    num("start", "起始价", 100, 20, 500, 1)
  ],
  defaults: { N: 2000, T: 252, K: 252 }, level: true,
  gen: function (c) {
    var p = c.p, lt = Math.log(p.theta), a = Math.exp(-p.kappa * c.dt), sg = p.sigma / 100;
    var sd = sg * Math.sqrt((1 - a * a) / (2 * p.kappa)), x = Math.log(p.start), lv = c.lv, g = c.rng;
    lv[0] = p.start;
    for (var t = 0; t < c.T; t++) { x = lt + (x - lt) * a + sd * g.normal(); lv[t + 1] = Math.exp(x); }
  },
  theory: function (p) {
    return { note: "记 $X$ 为对数价格，$\\Delta$ 为一步的时长。条件期望已知：$\\mathbb{E}[\\Delta X\\mid X]=(\\ln\\theta-X)(1-e^{-\\kappa\\Delta})$。对数效用的投资者是短视的，最优仓位 $f_t=(\\kappa(\\ln\\theta-X_t)+\\sigma^2/2-r_f)/\\sigma^2$（$r_f$ 是无风险利率），随偏离线性变化；有交易成本时最优策略变成在一条\"不交易带\"外才调仓。$X$ 的平稳标准差为 $\\sigma/\\sqrt{2\\kappa}$。" };
  },
  condMean: function (p, env) { // 给定当前价格，下一步对数收益的条件期望
    var lt = Math.log(p.theta), a = Math.exp(-p.kappa / env.K);
    return function (feat) { return (lt - feat.logp) * (1 - a); };
  }
};

/* ---------- Merton 跳跃扩散 ---------- */
WORLDS.jump = {
  name: "跳跃扩散（Merton）", short: "跳跃扩散", group: "连续时间模型",
  blurb: "GBM 之上叠加泊松到达的跳跃，跳幅对数正态。漂移已做补偿，期望收益仍是 μ。",
  params: [
    num("mu", "漂移 μ", 8, -30, 60, 0.5, { unit: "%/年" }), num("sigma", "扩散波动 σ", 15, 1, 100, 0.5, { unit: "%/年" }),
    num("lam", "跳跃强度 λ", 3, 0, 50, 0.5, { unit: "次/年" }), num("muJ", "对数跳幅的均值", -5, -30, 30, 0.5, { unit: "%", hint: "每次跳跃价格乘以 J，ln J 服从正态分布；这是 ln J 的均值" }),
    num("sigJ", "对数跳幅的标准差", 6, 0, 30, 0.5, { unit: "%" })
  ],
  defaults: { N: 2000, T: 252, K: 252 },
  gen: function (c) {
    var p = c.p, mu = p.mu / 100, sg = p.sigma / 100, mj = p.muJ / 100, sj = p.sigJ / 100, lam = p.lam;
    var k = Math.exp(mj + 0.5 * sj * sj) - 1, a = (mu - 0.5 * sg * sg - lam * k) * c.dt, b = sg * Math.sqrt(c.dt), g = c.rng, r = c.r;
    for (var t = 0; t < c.T; t++) {
      var x = a + b * g.normal(), n = g.poisson(lam * c.dt);
      if (n > 0) x += n * mj + Math.sqrt(n) * sj * g.normal();
      r[t] = Math.max(-0.999, Math.exp(x) - 1);
    }
  },
  theory: function (p, env) {
    var mu = p.mu / 100, sg = p.sigma / 100, mj = p.muJ / 100, sj = p.sigJ / 100, lam = p.lam, rf = (env && env.rf || 0) / 100;
    var k = Math.exp(mj + 0.5 * sj * sj) - 1, gp1 = mu - lam * k - rf - sg * sg + lam * (1 - Math.exp(-mj + 0.5 * sj * sj));   // g'(1)，用到 E[1/J] = exp(−m + s²/2)
    var s = "有跳跃时 Merton 比例 $(\\mu-r)/\\sigma^2$ 不再最优：最优仓位要解 $g(f)=r+f(\\mu-\\lambda k-r)-f^2\\sigma^2/2+\\lambda\\,\\mathbb{E}\\log(1+f(J-1))$ 的一阶条件（$r$ 是无风险利率，$J$ 是跳跃时价格乘上的倍数，$k=\\mathbb{E}[J-1]$，现在是 " + (k * 100).toFixed(2).replace("-", "−") + "%），向下的跳跃会把它压低。";
    if (!(lam > 0)) return { note: "现在跳跃的频率 $\\lambda$ 是 0：这个世界退化成几何布朗运动，最优仓位就是 Merton 比例 $(\\mu-r)/\\sigma^2$（$r$ 是无风险利率）。把 $\\lambda$ 调大，才看得到跳跃的影响。" };
    if (!(sj > 0)) return { note: s };
    s += "跳幅对数正态时 $J-1$ 可以任意接近 −100%，也可以任意大，所以严格地说可行的仓位只有 $0\\le f\\le 1$：$f>1$ 时一次足够大的下跳就会让净值归零，这时 $\\mathbb{E}\\log$ 是 $-\\infty$。";
    var z = (Math.log(0.5) - mj) / sj, lg = z < -3 ? (-z * z / 2 - Math.log(-z * 2.5066282746)) / Math.LN10 : NaN;   // P(J ≤ ½) 的量级：f = 2 时一次跳跃致命的概率
    s += "按当前参数 $g'(1)=" + gp1.toFixed(3) + (gp1 > 0 ? ">0$，$g$ 在 $[0,1]$ 上单调上升，严格的最优解是 $f^*=1$。" : "<0$，最优解在 $[0,1)$ 之内。");
    var pw = function (x) { var e = Math.floor(x), m = Math.pow(10, x - e); return "$" + m.toFixed(0) + "\\times 10^{" + e + "}$"; };
    s += !(lg === lg) ? "$f=2$ 时一次跳跃就致命的概率并不小，模拟的杠杆曲线在 1 以上很快就会出现破产路径。"
      : lg < -9 ? "模拟的杠杆曲线仍可能在 1 以上出峰：$f=2$ 时一次跳跃致命的概率只有约 " + pw(lg) + "，样本里遇不到。"
        : "$f=2$ 时一次跳跃致命的概率约 " + pw(lg) + "：路径多、时间长时样本里会碰上，那时增长率直接变成 $-\\infty$。";
    return { note: s };
  }
};

/* ---------- Heston 随机波动率 ---------- */
WORLDS.heston = {
  name: "随机波动率（Heston）", short: "Heston", group: "连续时间模型",
  blurb: "方差 v 自己也是一个均值回复过程：dv = κ(θ − v)dt + ξ√v dW'，与价格的布朗运动相关系数为 ρ。",
  params: [
    num("mu", "漂移 μ", 8, -30, 60, 0.5, { unit: "%/年" }), num("sigma", "长期波动 √θ", 20, 2, 100, 0.5, { unit: "%/年" }),
    num("kappa", "方差回复速度 κ", 3, 0.2, 20, 0.1, { unit: "/年" }), num("xi", "波动的波动 ξ", 0.4, 0, 2, 0.05, { hint: "2κθ > ξ² 时方差碰不到 0（Feller 条件）" }),
    num("rho", "相关系数 ρ", -0.7, -0.95, 0.95, 0.05)
  ],
  defaults: { N: 2000, T: 252, K: 252 },
  gen: function (c) {
    var p = c.p, mu = p.mu / 100, th = p.sigma / 100 * p.sigma / 100, v = th, dt = c.dt, sq = Math.sqrt(dt);
    var rho = p.rho, rc = Math.sqrt(1 - rho * rho), g = c.rng, r = c.r;
    for (var t = 0; t < c.T; t++) {
      var z1 = g.normal(), z2 = rho * z1 + rc * g.normal(), vp = v > 0 ? v : 0, sv = Math.sqrt(vp);
      r[t] = Math.max(-0.999, Math.exp((mu - 0.5 * vp) * dt + sv * sq * z1) - 1);
      v += p.kappa * (th - vp) * dt + p.xi * sv * sq * z2;
    }
  },
  theory: function (p) {
    var th = p.sigma / 100 * p.sigma / 100, a = 2 * p.kappa * th, b = p.xi * p.xi;
    return { note: "对数效用下最优仓位仍是短视的：$f_t=(\\mu-r_f)/v_t$，与方差成反比；\"波动率目标\"（与标准差成反比）方向相同、反应不足。这个结论要求 $\\mathbb{E}\\int(\\mu-r_f)^2/v_t\\,dt<\\infty$，在 Heston 模型里即 $2\\kappa\\theta>\\xi^2$。当前参数 $2\\kappa\\theta=" + (a < 0.01 ? a.toPrecision(2) : a.toFixed(3)) + "$，$\\xi^2=" + (b < 0.01 ? b.toPrecision(2) : b.toFixed(3)) + "$" + (a > b ? "，条件成立。" : "，条件不成立：$v_t$ 会贴到 0 附近，连续时间里的最优增长率发散，这里靠仓位上限挡住。") + "按步观测时 $v_t$ 不能直接看到，只能用已实现波动去估计。" };
  }
};

/* ---------- GARCH(1,1) ---------- */
WORLDS.garch = {
  name: "GARCH(1,1)（波动聚集）", short: "GARCH", group: "有记忆的过程",
  blurb: "σ²ₜ₊₁ = ω + α·ε²ₜ + β·σ²ₜ。收益本身不相关，但波动有记忆：大波动之后跟着大波动。",
  params: [
    num("mu", "期望收益 μ", 8, -30, 60, 0.5, { unit: "%/年" }), num("sigma", "长期波动", 20, 2, 100, 0.5, { unit: "%/年" }),
    num("alpha", "α（对冲击的反应）", 0.1, 0, 0.3, 0.01), num("beta", "β（波动的惯性）", 0.85, 0, 0.98, 0.01, { hint: "α + β 要小于 1，方差才收得住：两者之和超过 0.995 时，β 按 0.995 − α 算" })
  ],
  defaults: { N: 2000, T: 252, K: 252 },
  gen: function (c) {
    var p = c.p, m = p.mu / 100 * c.dt, hL = p.sigma / 100 * p.sigma / 100 * c.dt, al = p.alpha, be = p.beta;
    if (al + be > 0.995) be = 0.995 - al;
    var om = hL * (1 - al - be), h = hL, g = c.rng, r = c.r;
    for (var t = 0; t < c.T; t++) {
      var e = Math.sqrt(h) * g.normal();
      r[t] = Math.max(-0.999, m + e);
      h = om + al * e * e + be * h;
    }
  },
  theory: function () { return { note: "收益的方向不可预测，但波动可预测：条件方差 $\\sigma_t^2$ 由过去的冲击决定。短视的对数最优仓位约为 $\\mu\\Delta/\\sigma_t^2$（无风险利率取 0，$\\Delta$ 是一步的时长），所以按条件方差的倒数调仓能提高增长率（按波动的倒数调仓，即波动率目标，方向相同、反应不足）；$\\alpha>0$ 时无条件分布比正态厚尾（峰度大于 3）。" }; }
};

/* ---------- 牛熊机制切换 ---------- */
WORLDS.regime = {
  name: "牛熊机制切换（隐马尔可夫）", short: "牛熊切换", group: "有记忆的过程",
  blurb: "市场在牛、熊两个不可见的状态之间按马尔可夫链切换，每个状态有自己的漂移和波动。物理上叫随机电报噪声。",
  params: [
    num("muB", "牛市漂移", 25, 0, 80, 1, { unit: "%/年" }), num("sgB", "牛市波动", 12, 2, 80, 0.5, { unit: "%/年" }),
    num("muR", "熊市漂移", -30, -90, 0, 1, { unit: "%/年" }), num("sgR", "熊市波动", 30, 2, 100, 0.5, { unit: "%/年" }),
    num("durB", "牛市平均时长", 1.5, 0.05, 6, 0.05, { unit: "年" }), num("durR", "熊市平均时长", 0.5, 0.05, 6, 0.05, { unit: "年" })
  ],
  defaults: { N: 2000, T: 504, K: 252 },
  gen: function (c) {
    var p = c.p, dt = c.dt, sq = Math.sqrt(dt), g = c.rng, r = c.r;
    var pb = Math.min(1, dt / p.durB), pr = Math.min(1, dt / p.durR);
    var bull = g.u() < p.durB / (p.durB + p.durR);
    var aB = (p.muB / 100 - 0.5 * p.sgB * p.sgB / 1e4) * dt, bB = p.sgB / 100 * sq;
    var aR = (p.muR / 100 - 0.5 * p.sgR * p.sgR / 1e4) * dt, bR = p.sgR / 100 * sq;
    for (var t = 0; t < c.T; t++) {
      r[t] = Math.exp(bull ? aB + bB * g.normal() : aR + bR * g.normal()) - 1;
      if (g.u() < (bull ? pb : pr)) bull = !bull;
    }
  },
  theory: function () { return { note: "状态不可见，只能由收益序列做贝叶斯滤波（隐马尔可夫的前向算法；连续时间、各状态波动相同时对应 Wonham 滤波）得到牛市的后验概率 $\\pi_t$。对数最优仓位用滤波后的条件矩：$f_t\\approx\\mathbb{E}[r\\mid\\mathcal{F}_t]/\\operatorname{Var}[r\\mid\\mathcal{F}_t]$（$\\mathcal{F}_t$ 是到 $t$ 时刻为止看到的全部收益；无风险利率取 0）。两个状态的波动不同时，波动的大小本身也在泄露状态。动量规则之所以在这里有效，是因为过去收益携带了状态信息。" }; }
};

/* ---------- AR(1) 收益 ---------- */
WORLDS.ar1 = {
  name: "收益自相关 AR(1)（动量 / 反转）", short: "AR(1)", group: "有记忆的过程",
  blurb: "rₜ₊₁ − μΔ = φ·(rₜ − μΔ) + 噪声。φ > 0 是动量，φ < 0 是反转。无条件波动固定为 σ。",
  params: [
    num("mu", "期望收益 μ", 5, -30, 60, 0.5, { unit: "%/年" }), num("sigma", "波动 σ", 20, 1, 120, 0.5, { unit: "%/年" }),
    num("phi", "自相关 φ", 0.1, -0.9, 0.9, 0.01)
  ],
  defaults: { N: 2000, T: 252, K: 252 },
  gen: function (c) {
    var p = c.p, m = p.mu / 100 * c.dt, s = p.sigma / 100 * Math.sqrt(c.dt), ph = p.phi, se = s * Math.sqrt(1 - ph * ph), g = c.rng, r = c.r;
    var x = s * g.normal();
    for (var t = 0; t < c.T; t++) { x = ph * x + se * g.normal(); r[t] = Math.max(-0.999, m + x); }
  },
  theory: function (p) { return { note: "条件期望 $\\mathbb{E}[r_{t+1}\\mid r_t]=\\mu\\Delta+\\varphi(r_t-\\mu\\Delta)$，条件方差 $\\sigma^2\\Delta(1-\\varphi^2)$（$\\Delta$ 是一步的时长）。短视的对数最优仓位 $f_t\\approx\\mathbb{E}[r_{t+1}\\mid r_t]/\\operatorname{Var}[r_{t+1}\\mid r_t]$（二阶近似，无风险利率取 0）：对最近一步收益线性反应。可预测的比例只有 $R^2=\\varphi^2$，现在是 " + (p.phi * p.phi * 100).toFixed(1) + "%。" }; },
  condMean: function (p, env) {
    var m = p.mu / 100 / env.K;
    return function (feat) { return m + p.phi * (feat.ret0 - m); };
  }
};

/* ---------- 分数布朗运动 ---------- */
var fgnCache = {};
function fgnEigen(H, M) {
  var key = H.toFixed(4) + ":" + M;
  if (fgnCache[key]) return fgnCache[key];
  var n = M / 2, re = new Float64Array(M), im = new Float64Array(M), h2 = 2 * H;
  function gam(k) { return 0.5 * (Math.pow(k + 1, h2) - 2 * Math.pow(k, h2) + Math.pow(Math.abs(k - 1), h2)); }
  for (var k = 0; k <= n; k++) { var v = gam(k); re[k] = v; if (k > 0 && k < n) re[M - k] = v; }
  fft(re, im);
  var out = new Float64Array(M);
  for (var j = 0; j < M; j++) out[j] = Math.sqrt(Math.max(0, re[j]) / M);
  fgnCache[key] = out;
  return out;
}
/** 生成 n 个单位方差的分数高斯噪声（Davies–Harte 循环嵌入法） */
function fgn(n, H, rng, out) {
  var M = 2 * nextPow2(n), half = M / 2, sq = fgnEigen(H, M), re = new Float64Array(M), im = new Float64Array(M);
  re[0] = sq[0] * rng.normal(); re[half] = sq[half] * rng.normal();
  for (var j = 1; j < half; j++) {
    var a = sq[j] * Math.SQRT1_2 * rng.normal(), b = sq[j] * Math.SQRT1_2 * rng.normal();
    re[j] = a; im[j] = b; re[M - j] = a; im[M - j] = -b;
  }
  fft(re, im);
  for (var t = 0; t < n; t++) out[t] = re[t];
  return out;
}
QL.fgn = fgn;
WORLDS.fbm = {
  name: "分数布朗运动（长记忆）", short: "分数布朗", group: "有记忆的过程",
  blurb: "对数价格是 Hurst 指数为 H 的分数布朗运动：H > ½ 时增量正相关（趋势持续），H < ½ 时负相关（来回震荡），H = ½ 退化为普通布朗运动。",
  params: [
    num("H", "Hurst 指数 H", 0.65, 0.05, 0.95, 0.01), num("mu", "漂移 μ", 0, -30, 60, 0.5, { unit: "%/年" }),
    num("sigma", "单步波动（年化）", 20, 1, 120, 0.5, { unit: "%/年" })
  ],
  defaults: { N: 1000, T: 256, K: 252 },
  gen: function (c) {
    var p = c.p, m = p.mu / 100 * c.dt, s = p.sigma / 100 * Math.sqrt(c.dt), r = c.r, tmp = c.tmp || (c.tmp = new Float64Array(c.T));
    if (tmp.length < c.T) tmp = c.tmp = new Float64Array(c.T);
    fgn(c.T, clamp(p.H, 0.02, 0.98), c.rng, tmp);
    for (var t = 0; t < c.T; t++) r[t] = Math.max(-0.999, Math.exp(m + s * tmp[t]) - 1);
  },
  theory: function (p) {
    var rho1 = Math.pow(2, 2 * p.H - 1) - 1;
    return { note: "增量的自协方差 $\\gamma(k)=\\tfrac12(|k+1|^{2H}-2|k|^{2H}+|k-1|^{2H})$，相邻两步的相关系数为 $2^{2H-1}-1=" + rho1.toFixed(3) + "$，且按 $H(2H-1)\\,k^{2H-2}$ 的幂律衰减：$H>\\tfrac12$ 时不可和（长记忆），$H<\\tfrac12$ 时 $k\\ne 0$ 的项全为负、可和，并且 $\\sum_{k\\in\\mathbb{Z}}\\gamma(k)=0$（负相关正好抵掉 $\\gamma(0)=1$；反持续）。$H\\ne\\tfrac12$ 时它不是半鞅：理论上存在套利，现实中被交易成本吃掉。最优线性预测要用到全部历史，而不只是最近一步。这里的 $\\mu$ 是对数价格的漂移：$H=\\tfrac12$ 时，这个世界就是漂移取 $\\mu+\\sigma^2/2$ 的 GBM 世界。" };
  }
};

/* ---------- 物理来源 ---------- */
WORLDS.logistic = {
  name: "Logistic 映射（确定性混沌）", short: "Logistic 映射", group: "物理来源",
  blurb: "xₜ₊₁ = a·xₜ(1 − xₜ)。a = 4 时序列看起来像白噪声（线性自相关为零），但下一步完全由当前值决定。价格 = 100·exp(v·标准化的 x)。",
  params: [
    num("a", "参数 a", 4, 3.57, 4, 0.001, { hint: "a > 3.5699… 之后以混沌为主，中间夹着周期窗口（如 a ≈ 3.83 的周期 3）；a = 4 时不变密度是反正弦分布" }),
    num("noise", "观测噪声（x 的标准差倍数）", 0, 0, 1, 0.01),
    num("v", "价格灵敏度 v", 2, 0.2, 10, 0.1, { unit: "%", hint: "x 每变化 1 个标准差，价格变化 v%" })
  ],
  defaults: { N: 500, T: 252, K: 252 }, level: true,
  gen: function (c) {
    // 浮点轨道偶尔会塌到 0（x 恰好落到 1 之后），那时重新撒一个初值
    var p = c.p, g = c.rng, x = 0.1 + 0.8 * g.u(), lv = c.lv, v = p.v / 100, sd = 0.35355339, i;
    for (i = 0; i < 60; i++) { x = p.a * x * (1 - x); if (!(x > 1e-14 && x < 1)) x = 0.1 + 0.8 * g.u(); }
    for (var t = 0; t <= c.T; t++) {
      var obs = (x - 0.5) / sd + (p.noise > 0 ? p.noise * g.normal() : 0);
      lv[t] = c.S0 * Math.exp(v * obs);
      x = p.a * x * (1 - x); if (!(x > 1e-14 && x < 1)) x = 0.1 + 0.8 * g.u();
    }
  },
  theory: function () { return { note: "$a=4$ 时 $x$ 的自相关在所有非零滞后上恰好为 0：用线性模型预测下一个 $x$，$R^2$ 是 0，它看起来就是白噪声。但价格是 $x$ 的水平而不是 $x$ 的累加，所以\"下一步收益\"是水平的增量：用当前水平对水平的增量做线性回归，$R^2$ 恰好是 $\\tfrac12$（对简单收益则约为 $\\tfrac12$，$v=2\\%$ 时是 0.496），这只是\"白噪声的水平会回到均值\"。真实的条件期望是抛物线 $\\mathbb{E}[x_{t+1}\\mid x_t]=4x_t(1-x_t)$，能拟合非线性的模型（k 近邻、树、神经网络）可以把 $R^2$ 从 $\\tfrac12$ 提到 1。Lyapunov 指数为 $\\ln 2$：预测误差每步翻倍，所以只能预测很短的未来。" }; }
};

WORLDS.lorenz = {
  name: "洛伦兹系统（x 分量）", short: "洛伦兹", group: "物理来源",
  blurb: "ẋ = 10(y − x)，ẏ = x(28 − z) − y，ż = xy − 8z/3。每隔 τ 采样一次 x，价格 = 100·exp(v·x/σₓ)。",
  params: [
    num("tau", "采样间隔 τ", 0.05, 0.01, 0.5, 0.01, { hint: "τ 越大，相邻两个采样点之间的关系越非线性" }),
    num("noise", "观测噪声（σₓ 的倍数）", 0, 0, 1, 0.01),
    num("v", "价格灵敏度 v", 2, 0.2, 10, 0.1, { unit: "%" })
  ],
  defaults: { N: 300, T: 400, K: 252 }, level: true,
  gen: function (c) {
    var p = c.p, g = c.rng, lv = c.lv, v = p.v / 100, SD = 7.93, h = 0.01, m = Math.max(1, Math.round(p.tau / h));
    var x = 1 + g.normal(), y = 1 + g.normal(), z = 20 + 5 * g.normal();
    function step() {
      var k1x = 10 * (y - x), k1y = x * (28 - z) - y, k1z = x * y - 8 / 3 * z;
      var x2 = x + 0.5 * h * k1x, y2 = y + 0.5 * h * k1y, z2 = z + 0.5 * h * k1z;
      var k2x = 10 * (y2 - x2), k2y = x2 * (28 - z2) - y2, k2z = x2 * y2 - 8 / 3 * z2;
      var x3 = x + 0.5 * h * k2x, y3 = y + 0.5 * h * k2y, z3 = z + 0.5 * h * k2z;
      var k3x = 10 * (y3 - x3), k3y = x3 * (28 - z3) - y3, k3z = x3 * y3 - 8 / 3 * z3;
      var x4 = x + h * k3x, y4 = y + h * k3y, z4 = z + h * k3z;
      var k4x = 10 * (y4 - x4), k4y = x4 * (28 - z4) - y4, k4z = x4 * y4 - 8 / 3 * z4;
      x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); y += h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y); z += h / 6 * (k1z + 2 * k2z + 2 * k3z + k4z);
    }
    var i; for (i = 0; i < 800; i++) step();
    for (var t = 0; t <= c.T; t++) {
      lv[t] = c.S0 * Math.exp(v * (x / SD + (p.noise > 0 ? p.noise * g.normal() : 0)));
      for (i = 0; i < m; i++) step();
    }
  },
  theory: function () { return { note: "三维确定性系统只观测一个分量。Takens 嵌入定理及其推广（Sauer–Yorke–Casdagli 1991）：用足够多的滞后坐标 $(x_t,x_{t-1},\\dots,x_{t-m+1})$ 可以重构吸引子（坐标的个数 $m>2d$ 就够，$d$ 是吸引子的盒维数；洛伦兹吸引子 $d\\approx 2.06$，所以 5 个滞后一定够，实际上 3 个通常就行），所以\"滞后特征 + 非参数模型\"是这里的正确做法（Farmer–Sidorowich 1987）。最大 Lyapunov 指数约 0.906/单位时间，可预测的时间尺度约为 1/0.906。" }; }
};

WORLDS.osc = {
  name: "带噪谐振子（AR(2) 周期）", short: "带噪谐振子", group: "物理来源",
  blurb: "被随机力推动的欠阻尼振子的离散时间版本，一个 AR(2)：xₜ = 2ρcos(ω)·xₜ₋₁ − ρ²·xₜ₋₂ + εₜ（对连续时间的振子等间隔采样，严格地说得到 ARMA(2,1)，自回归部分相同）。价格 = 100·exp(v·x/σₓ)。",
  params: [
    num("period", "周期（步）", 40, 6, 200, 1), num("rho", "每步保留的振幅 ρ", 0.97, 0.8, 0.999, 0.001, { hint: "越接近 1 阻尼越小，周期越清晰" }),
    num("noise", "观测噪声（σₓ 的倍数）", 0, 0, 1, 0.01), num("v", "价格灵敏度 v", 3, 0.2, 10, 0.1, { unit: "%" })
  ],
  defaults: { N: 1000, T: 252, K: 252 }, level: true,
  gen: function (c) {
    var p = c.p, g = c.rng, lv = c.lv, v = p.v / 100, f1 = 2 * p.rho * Math.cos(2 * Math.PI / p.period), f2 = -p.rho * p.rho;
    var sd = Math.sqrt((1 - f2) / ((1 + f2) * ((1 - f2) * (1 - f2) - f1 * f1)));
    var x1 = 0, x2 = 0, x, i;
    for (i = 0; i < 400; i++) { x = f1 * x1 + f2 * x2 + g.normal(); x2 = x1; x1 = x; }
    for (var t = 0; t <= c.T; t++) {
      lv[t] = c.S0 * Math.exp(v * (x1 / sd + (p.noise > 0 ? p.noise * g.normal() : 0)));
      x = f1 * x1 + f2 * x2 + g.normal(); x2 = x1; x1 = x;
    }
  },
  theory: function (p) {
    var f1 = 2 * p.rho * Math.cos(2 * Math.PI / p.period), f2 = -p.rho * p.rho;
    return { note: "线性高斯过程，最优预测就是线性的：$\\mathbb{E}[x_{t+1}\\mid\\text{过去}]=\\varphi_1x_t+\\varphi_2x_{t-1}$，其中 $\\varphi_1=2\\rho\\cos(2\\pi/\\text{周期})=" + f1.toFixed(3) + "$，$\\varphi_2=-\\rho^2=" + f2.toFixed(3) + "$。两个滞后的线性回归是正确设定，更复杂的模型只会增加估计噪声。有观测噪声时最优预测变成卡尔曼滤波。" };
  }
};

/* ---------- 需要外部数据的世界（由引擎直接处理） ---------- */
WORLDS.real = {
  name: "真实数据（导入的序列）", short: "真实数据", group: "真实数据", needsData: true,
  blurb: "用导入的历史序列回测。前一段做训练，后一段留作样本外。",
  params: [
    sel("mode", "用法", "whole", [["whole", "整段历史当一条路径"], ["windows", "滚动窗口（每个起点一条路径）"]]),
    num("split", "训练占比", 70, 30, 90, 1, { unit: "%" }),
    num("L", "窗口长度（步）", 252, 20, 2000, 1, { show: function (p) { return p.mode === "windows"; } }),
    num("stride", "窗口间隔（步）", 21, 1, 500, 1, { show: function (p) { return p.mode === "windows"; } })
  ],
  defaults: { N: 1, T: 0, K: 252 },
  theory: function () { return { note: "真实数据的分布未知，没有\"最优\"可言，只能问样本外是否还成立。滚动窗口之间高度重叠，标准误会被低估，只适合看分布的形状。" }; }
};
WORLDS.boot = {
  name: "对真实收益做 bootstrap", short: "Bootstrap", group: "真实数据", needsData: true,
  blurb: "把导入序列训练段的收益率按块重新抽样拼成新路径（平稳 bootstrap）：保留真实的收益分布和短程相关，打乱长程结构。",
  params: [num("block", "平均块长（步）", 10, 1, 120, 1, { hint: "块长为 1 时完全打乱时间顺序，等于假设收益独立同分布" })],
  defaults: { N: 2000, T: 252, K: 252 },
  theory: function () { return { note: "Politis–Romano (1994) 平稳 bootstrap：块长服从几何分布，重采样序列仍然平稳。块长 1 的结果与真实历史的差距，度量了\"时间顺序\"本身贡献了多少收益。" }; }
};
WORLDS.custom = {
  name: "自定义（AI 或你自己写的采样函数）", short: "自定义", group: "自定义", needsCode: true,
  blurb: "由一段 simulate(T, rng, p) 函数生成每条路径的价格。",
  params: [], defaults: { N: 1000, T: 252, K: 252 },
  theory: function () { return { note: "" }; }
};

QL.WORLDS = WORLDS; QL.WORLD_GROUPS = WORLD_GROUPS;
QL.worldDefaults = function (type) {
  var w = WORLDS[type], p = {};
  (w.params || []).forEach(function (s) { p[s.key] = s.def; });
  return p;
};

/* ================================================================== *
 *  四、生成一批路径
 * ================================================================== */
/** 带训练的规则要把"给模型学的数据"和"回测用的数据"分开。
 *  模拟的世界：另外生成一批路径给模型（FIT_STREAM 这条随机数流）。
 *  真实数据：把训练段再按时间切开，前 FIT_FRAC 给模型，后面的回测。 */
var FIT_BATCH = -7, FIT_FRAC = 0.6;   // 给模型的那批路径用负的批次号，永远不会和样本外批次（1, 2, …）撞上
/** 训练段的终点（价格下标）。pct 是整数百分比：len·pct 先算成整数再除，避免 0.7 这类小数带来的一位之差 */
function trainCut(len, pct) { return clamp(Math.floor(len * Math.round(pct) / 100), 10, len - 5); }
function fitCut(cut) {
  if (cut < 60) throw new Error("训练段只有 " + cut + " 个点，不够再分出一段给模型训练（至少 60 个）。把\"训练占比\"调大，或者导入更长的数据。");
  return clamp(Math.floor(cut * FIT_FRAC), 30, cut - 20);
}
QL.FIT_FRAC = FIT_FRAC; QL.FIT_BATCH = FIT_BATCH; QL.fitCut = fitCut; QL.trainCut = trainCut;
/** cfg: {type, params, N, T, K, seed, S0}; ext: {series, code hooks}; batchId: 0=训练, >0=新鲜的样本外批次；
 *  part: 不填 = 整批；"fit" = 给模型训练的那一份；"eval" = 带训练的规则回测用的那一份 */
function makeBatch(cfg, ext, batchId, part) {
  var type = cfg.type, w = WORLDS[type];
  if (!w) throw new Error("未知的世界类型: " + type);
  if (w.game) return QL.gameBatch(cfg, batchId, part);   // 回合制的玩法：有自己的生成方式（见 games.js）
  if (type === "real") return realBatch(cfg, ext, batchId, part);
  if (type === "boot" && part === "fit") {   // 模型学的是真实的那段历史，不是重抽样；价格换算成从 S0 出发，与重抽样路径的起点一致
    var fb = realBatch({ params: { mode: "whole", split: ext && ext.splitPct || 70 }, K: cfg.K }, ext, 0, "fit"), sc0 = (cfg.S0 || 100) / fb.L[0];
    for (var q0 = 0; q0 < fb.L.length; q0++) fb.L[q0] *= sc0;
    return fb;
  }
  var N = cfg.N | 0, T = cfg.T | 0, K = cfg.K, S0 = cfg.S0 || 100;
  var R = new Float32Array(N * T), L = new Float32Array(N * (T + 1));
  var r = new Float64Array(T), lv = new Float64Array(T + 1);
  var c = { p: cfg.params, T: T, K: K, dt: 1 / K, S0: S0, r: r, lv: lv, rng: null, tmp: null };
  var n, t, src = null, nsrc = 0, pb = 1;
  if (type === "boot") {
    if (!ext || !ext.series || ext.series.length < 30) throw new Error("bootstrap 需要先导入一段真实数据");
    var s = ext.series, cut = trainCut(s.length, ext.splitPct || 70), r0 = part === "eval" ? fitCut(cut) - 1 : 0;   // 带训练的规则：只从训练段的后一部分重抽样
    nsrc = cut - 1 - r0; src = new Float64Array(nsrc);
    for (t = 0; t < nsrc; t++) src[t] = s[r0 + t + 1] / s[r0 + t] - 1;
    pb = 1 / Math.max(1, cfg.params.block || 10);
  }
  var sim = type === "custom" ? (ext && ext.simulate) : null;
  if (type === "custom" && typeof sim !== "function") throw new Error("自定义世界缺少 simulate(T, rng, p) 函数");
  for (n = 0; n < N; n++) {
    var rng = new RNG(cfg.seed, n, part === "fit" ? FIT_BATCH - batchId : batchId);
    c.rng = rng;
    var hasLevel = !!w.level;
    if (src) {
      var idx = rng.int(nsrc);
      for (t = 0; t < T; t++) { if (rng.u() < pb) idx = rng.int(nsrc); else if (++idx >= nsrc) idx = 0; r[t] = src[idx]; }
    } else if (sim) {
      var out = sim(T, rng, cfg.params);
      if (!out || typeof out.length !== "number" || out.length < T + 1) throw new Error("simulate 必须返回长度为 T+1 的价格数组（现在返回的长度是 " + (out && out.length) + "）");
      for (t = 0; t <= T; t++) {
        var x = +out[t];
        if (!(x > 0) || x === Infinity) throw new Error("simulate 返回的第 " + t + " 个价格不是有限正数: " + out[t]);
        lv[t] = x;
      }
      hasLevel = true;
    } else {
      w.gen(c);
    }
    var oL = n * (T + 1), oR = n * T;
    if (hasLevel) {
      L[oL] = lv[0];
      if (type === "bet") { for (t = 0; t < T; t++) { R[oR + t] = r[t]; L[oL + t + 1] = lv[t + 1]; } }
      else for (t = 0; t < T; t++) { R[oR + t] = lv[t + 1] / lv[t] - 1; L[oL + t + 1] = lv[t + 1]; }
    } else {
      var lev = S0; L[oL] = lev;
      for (t = 0; t < T; t++) { R[oR + t] = r[t]; lev *= 1 + r[t]; L[oL + t + 1] = lev; }
    }
  }
  return { N: N, T: T, K: K, R: R, L: L, kind: batchId === 0 ? "train" : "fresh", part: part || "" };
}

/** 真实数据：batchId 0 = 训练段，>0 = 样本外段。part 把训练段再切成 给模型的前一段 / 回测的后一段 */
function realBatch(cfg, ext, batchId, part) {
  if (!ext || !ext.series || ext.series.length < 30) throw new Error("请先导入一段真实数据（至少 30 个点）");
  var s = ext.series, len = s.length, p = cfg.params, K = cfg.K;
  var cut = trainCut(len, p.split || 70);
  var a = batchId === 0 ? 0 : cut, b = batchId === 0 ? cut : len; // 价格下标区间 [a, b)
  if (batchId === 0 && (part === "fit" || part === "eval")) { var cf = fitCut(cut); if (part === "fit") b = cf; else a = cf - 1; }   // 两段只共用一个价格点，收益互不重叠
  var seg = b - a, N, T, starts = [], n, t;
  if (p.mode === "windows" && part !== "fit") {   // 给模型的那一段总是一整条：滚动窗口互相重叠，会让同一行数据既在训练集又在验证集
    T = Math.min(p.L | 0, seg - 1);
    var stride = Math.max(1, p.stride | 0);
    for (var st = a; st + T < b; st += stride) starts.push(st);
    if (!starts.length) starts.push(a);
  } else { T = seg - 1; starts.push(a); }
  N = starts.length;
  if (T < 5) throw new Error("这一段数据太短，无法回测");
  var R = new Float32Array(N * T), L = new Float32Array(N * (T + 1));
  for (n = 0; n < N; n++) {
    var o = starts[n], oL = n * (T + 1), oR = n * T;
    L[oL] = s[o];
    for (t = 0; t < T; t++) { L[oL + t + 1] = s[o + t + 1]; R[oR + t] = s[o + t + 1] / s[o + t] - 1; }
  }
  return { N: N, T: T, K: K, R: R, L: L, kind: batchId === 0 ? "train" : "test", starts: starts, overlap: p.mode === "windows" && part !== "fit", part: part || "", range: [a, b] };
}
QL.makeBatch = makeBatch;

/* ================================================================== *
 *  五、世界本身的统计（收益分布、自相关、路径扇形）
 * ================================================================== */
function timeGrid(T, maxPts) {
  var G = Math.min(T + 1, maxPts || 220), idx = new Int32Array(G);
  for (var i = 0; i < G; i++) idx[i] = Math.round(i * T / (G - 1));
  return idx;
}
/** 对一个 N×(T+1) 的矩阵按时间网格求分位数带 */
function fanOf(M, N, W, grid, qs, logScale) {
  var G = grid.length, col = new Float64Array(N), out = {}, i, n, q;
  for (q = 0; q < qs.length; q++) out["q" + Math.round(qs[q] * 100)] = new Float32Array(G);
  out.mean = new Float32Array(G);
  for (i = 0; i < G; i++) {
    var t = grid[i], s = 0;
    for (n = 0; n < N; n++) { var v = M[n * W + t]; col[n] = v; s += v; }
    col.sort();
    for (q = 0; q < qs.length; q++) out["q" + Math.round(qs[q] * 100)][i] = quantileSorted(col, qs[q]);
    out.mean[i] = s / N;
  }
  return out;
}
var QS = [0.05, 0.25, 0.5, 0.75, 0.95];
function samplePaths(M, N, W, grid, count) {
  var c = Math.min(count, N), G = grid.length, out = new Float32Array(c * G), ids = new Int32Array(c);
  for (var k = 0; k < c; k++) {
    var n = Math.floor(k * N / c); ids[k] = n;
    for (var i = 0; i < G; i++) out[k * G + i] = M[n * W + grid[i]];
  }
  return { n: c, ids: ids, data: out };
}
function histogram(vals, bins, lo, hi) {
  var h = new Float64Array(bins), w = (hi - lo) / bins, under = 0, over = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (!(v === v)) continue;
    if (v < lo) { under++; continue; } if (v >= hi) { if (v === hi) h[bins - 1]++; else over++; continue; }
    h[Math.floor((v - lo) / w)]++;
  }
  return { counts: h, lo: lo, hi: hi, under: under, over: over, n: vals.length };
}
QL.histogram = histogram;

function worldStats(B) {
  var N = B.N, T = B.T, R = B.R, n, t, i, tot = N * T;
  var s1 = 0, s2 = 0, s3 = 0, s4 = 0, mn = Infinity, mx = -Infinity;
  for (i = 0; i < tot; i++) { var x = R[i]; s1 += x; s2 += x * x; if (x < mn) mn = x; if (x > mx) mx = x; }   // 极值在全部数据上取：下面的抽样只用来估分位数
  var m = s1 / tot, v = s2 / tot - m * m, sd = Math.sqrt(Math.max(v, 1e-300));
  for (i = 0; i < tot; i++) { var z = (R[i] - m) / sd, z2 = z * z; s3 += z2 * z; s4 += z2 * z2; }
  // 分位数用抽样
  var cap = Math.min(tot, 200000), stepI = Math.max(1, Math.floor(tot / cap)), smp = new Float64Array(Math.ceil(tot / stepI)), k = 0;
  for (i = 0; i < tot; i += stepI) smp[k++] = R[i];
  smp = smp.subarray(0, k); smp.sort();
  var lo = quantileSorted(smp, 0.002), hi = quantileSorted(smp, 0.998);
  if (!(hi > lo)) { lo = m - 3 * sd - 1e-9; hi = m + 3 * sd + 1e-9; }
  var pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  var hist = histogram(R, 61, lo, hi);
  // 自相关：收益与 |收益|，滞后 1..20，按路径去均值后汇总
  var LAG = Math.min(20, T - 2), acf = new Float64Array(LAG), acfA = new Float64Array(LAG);
  var den = 0, denA = 0, cnt = 0, numr = new Float64Array(LAG), numa = new Float64Array(LAG);
  var mA = 0; for (i = 0; i < tot; i += stepI) mA += Math.abs(R[i] - m); mA /= Math.ceil(tot / stepI);
  var useN = Math.min(N, Math.max(1, Math.floor(400000 / T)));
  for (n = 0; n < useN; n++) {
    var o = n * T;
    for (t = 0; t < T; t++) {
      var a = R[o + t] - m, aa = Math.abs(a) - mA; den += a * a; denA += aa * aa; cnt++;
      for (var l = 1; l <= LAG && t + l < T; l++) { var b = R[o + t + l] - m; numr[l - 1] += a * b; numa[l - 1] += aa * (Math.abs(b) - mA); }
    }
  }
  for (l = 0; l < LAG; l++) { acf[l] = numr[l] / den; acfA[l] = numa[l] / denA; }
  var grid = timeGrid(T, 220);
  return {
    N: N, T: T, K: B.K, mean: m, sd: sd, skew: s3 / tot, kurt: s4 / tot,
    annMean: m * B.K, annVol: sd * Math.sqrt(B.K), min: mn, max: mx,
    hist: hist, acf: acf, acfAbs: acfA, acfN: useN * T,
    grid: grid, fan: fanOf(B.L, N, T + 1, grid, QS), paths: samplePaths(B.L, N, T + 1, grid, 24)
  };
}
QL.worldStats = worldStats;
QL.timeGrid = timeGrid;

/* ================================================================== *
 *  六、逐步执行策略
 * ================================================================== */
/** 规则在第 t 步看到的东西。
 *  数据本身、"现在是第几步"、净值和仓位都关在闭包里：交给规则的只有 view 这个对象，
 *  它上面的函数只读得到 ≤ t 的数据，t、wealth、pos 也只能读不能写。
 *  返回的是控制柄，由引擎自己留着：bind 换一条路径，at / acct / step 往前推一步。 */
function makeView() {
  var L = null, R = null, oL = 0, oR = 0, cp = null, cp2 = null, cr = null, cr2 = null, t = 0, w = 1, pos = 0, touched = false;
  var V = { T: 0, K: 252, dt: 1 / 252, price: 0, logp: 0, rf: 0 };
  Object.defineProperty(V, "t", { get: function () { return t; }, enumerable: true });
  Object.defineProperty(V, "wealth", { get: function () { touched = true; return w; }, enumerable: true });
  Object.defineProperty(V, "pos", { get: function () { touched = true; return pos; }, enumerable: true });
  /** k 步之前的价格（k=0 是当前价） */
  V.p = function (k) { k = k | 0; return k < 0 || k > t ? NaN : L[oL + t - k]; };
  /** 最近第 k 个单步收益（k=0 是刚刚实现的那一步） */
  V.ret = function (k) { k = k | 0; var i = t - 1 - k; return k < 0 || i < 0 ? NaN : R[oR + i]; };
  /** 过去 n 步的累计收益 */
  V.mom = function (n) { n = n | 0; return n < 1 || n > t ? NaN : L[oL + t] / L[oL + t - n] - 1; };
  /** 最近 n 个价格的均值 */
  V.sma = function (n) { n = n | 0; return n < 1 || n > t + 1 ? NaN : (cp[t + 1] - cp[t + 1 - n]) / n; };
  /** 最近 n 个价格的标准差 */
  V.psd = function (n) {
    n = n | 0; if (n < 2 || n > t + 1) return NaN;
    var s = cp[t + 1] - cp[t + 1 - n], s2 = cp2[t + 1] - cp2[t + 1 - n], v = (s2 - s * s / n) / (n - 1);
    return v > 0 ? Math.sqrt(v) : 0;
  };
  /** 价格相对 n 步均线的 z 分数 */
  V.z = function (n) { var sd = V.psd(n); return sd > 0 ? (V.price - V.sma(n)) / sd : NaN; };
  /** 最近 n 个单步收益的均值 */
  V.mean = function (n) { n = n | 0; return n < 1 || n > t ? NaN : (cr[t] - cr[t - n]) / n; };
  /** 最近 n 个单步收益的标准差（每步，未年化） */
  V.vol = function (n) {
    n = n | 0; if (n < 2 || n > t) return NaN;
    var s = cr[t] - cr[t - n], s2 = cr2[t] - cr2[t - n], v = (s2 - s * s / n) / (n - 1);
    return v > 0 ? Math.sqrt(v) : 0;
  };
  V.hi = function (n) { n = n | 0; if (n < 1 || n > t + 1) return NaN; var m = -Infinity, o = oL + t; for (var i = 0; i < n; i++) { var x = L[o - i]; if (x > m) m = x; } return m; };
  V.lo = function (n) { n = n | 0; if (n < 1 || n > t + 1) return NaN; var m = Infinity, o = oL + t; for (var i = 0; i < n; i++) { var x = L[o - i]; if (x < m) m = x; } return m; };
  /** 最近 n 个单步收益，旧的在前 */
  V.rets = function (n) { n = Math.min(n | 0, t); var a = new Float64Array(n > 0 ? n : 0), o = oR + t - n; for (var i = 0; i < n; i++) a[i] = R[o + i]; return a; };
  /** 最近 n 个价格，旧的在前 */
  V.prices = function (n) { n = Math.min(n | 0, t + 1); var a = new Float64Array(n > 0 ? n : 0), o = oL + t + 1 - n; for (var i = 0; i < n; i++) a[i] = L[o + i]; return a; };
  return {
    view: V,
    bind: function (L_, R_, oL_, oR_, sc) { L = L_; R = R_; oL = oL_; oR = oR_; cp = sc.cp; cp2 = sc.cp2; cr = sc.cr; cr2 = sc.cr2; },
    at: function (t_) { t = t_; },
    acct: function (w_, pos_) { w = w_; if (pos_ !== undefined) pos = pos_; },
    step: function (t_, w_, pos_) { t = t_; w = w_; pos = pos_; },
    touched: function () { return touched; }
  };
}
/** 把控制柄 C 接到第 n 条路径上。玩法可以另备一份"规则看得到的数"（B.VL / B.VR）：裁判用原数，规则只见得到那一份 */
function bindPath(C, B, n, scratch) {
  var T = B.T, oL = n * (T + 1), oR = n * T, L = B.VL || B.L, R = B.VR || B.R, cp = scratch.cp, cp2 = scratch.cp2, cr = scratch.cr, cr2 = scratch.cr2, t;
  cp[0] = 0; cp2[0] = 0; cr[0] = 0; cr2[0] = 0;
  for (t = 0; t <= T; t++) { var x = L[oL + t]; cp[t + 1] = cp[t] + x; cp2[t + 1] = cp2[t] + x * x; }
  for (t = 0; t < T; t++) { var y = R[oR + t]; cr[t + 1] = cr[t] + y; cr2[t + 1] = cr2[t] + y * y; }
  C.bind(L, R, oL, oR, scratch);
  var V = C.view; V.T = T; V.K = B.K; V.dt = 1 / B.K;
}
function makeScratch(T) { return { cp: new Float64Array(T + 2), cp2: new Float64Array(T + 2), cr: new Float64Array(T + 1), cr2: new Float64Array(T + 1) }; }
QL.makeView = makeView; QL.bindPath = bindPath; QL.makeScratch = makeScratch;

/** 训练数据的只读视图，传给策略的 fit(D, p, ml) */
function makeData(B) {
  var C = makeView(), V = C.view, sc = makeScratch(B.T), cur = -1, L = B.VL || B.L, R = B.VR || B.R;
  return {
    N: B.N, T: B.T, K: B.K,
    /** 玩法里的常数（与 decide 里的 s.g 相同）；价格世界里是 null */
    g: B.game && WORLDS[B.game].consts ? WORLDS[B.game].consts(B.gp, B.T) : null,
    /** 定位到第 n 条路径的第 t 步，返回与 decide 里一样的 s */
    at: function (n, t) {
      if (n !== cur) { bindPath(C, B, n, sc); cur = n; }
      C.step(t, 1, 0); V.price = L[n * (B.T + 1) + t]; V.logp = Math.log(V.price);
      return V;
    },
    /** 从 t 起未来 h 步的累计收益（只在训练时可用：这是要预测的目标） */
    fwd: function (n, t, h) { h = h || 1; if (!(t >= 0) || !(h >= 1) || t + h > B.T) return NaN; var o = n * B.T + t, g = 1; for (var i = 0; i < h; i++) g *= 1 + R[o + i]; return g - 1; },
    /** 第 t → t+1 步资产的实际收益 */
    next: function (n, t) { return !(t >= 0) || t >= B.T ? NaN : R[n * B.T + t]; }
  };
}
QL.makeData = makeData;

var DEFAULT_SET = { costBps: 5, rf: 0, fmin: -1, fmax: 3, lam: 1, ddLimit: 30, ddProb: 5 };
QL.DEFAULT_SET = DEFAULT_SET;

/** 在一批路径上执行策略。opt: {fan, detail: n, keepArrays} */
function runBatch(B, strat, p, set, opt, model) {
  opt = opt || {};
  var N = B.N, T = B.T, R = B.R, L = B.L, K = B.K;
  var c = (set.costBps || 0) / 1e4, rfS = (set.rf || 0) / 100 / K, fmin = set.fmin, fmax = set.fmax, lam = set.lam == null ? 1 : set.lam;
  var WT = new Float64Array(N), DD = new Float32Array(N), TO = new Float32Array(N), EX = new Float32Array(N), PM = new Float64Array(N);
  var grid = opt.fan ? timeGrid(T, 220) : null, G = grid ? grid.length : 0, gpos = null, EQ = null;
  if (grid) { gpos = new Int32Array(T + 1).fill(-1); for (var gi = 0; gi < G; gi++) gpos[grid[gi]] = gi; EQ = new Float32Array(N * G); }
  var det = opt.detail != null ? { n: opt.detail, f: new Float32Array(T), w: new Float32Array(T + 1) } : null;
  var replay = opt.replay || null, rec = opt.rec ? new Float32Array(N * T) : null;
  var C = makeView(), V = C.view, sc = makeScratch(T), decide = replay ? null : strat.decide, init = replay ? null : strat.init;
  V.rf = rfS;
  var sum = 0, sumsq = 0, bad = 0, ruined = 0, steps = N * T, n, t;
  for (n = 0; n < N; n++) {
    if (!replay) bindPath(C, B, n, sc);
    var oL = n * (T + 1), oR = n * T, st = init ? init(p, model) : {};
    if (st == null) st = {};
    var W = 1, pos = 0, peak = 1, mdd = 0, turn = 0, expo = 0, psum = 0, dead = false;
    if (EQ) EQ[n * G] = 1;
    if (det && det.n === n) det.w[0] = 1;
    for (t = 0; t < T; t++) {
      var f;
      if (replay) f = replay[oR + t];
      else {
        var price = L[oL + t];
        C.step(t, W, pos); V.price = price; V.logp = Math.log(price);
        f = decide(V, p, st, model);
        if (rec) rec[oR + t] = typeof f === "number" ? f : NaN;
      }
      if (typeof f !== "number" || f !== f) { f = 0; bad++; }
      f *= lam;
      if (f < fmin) f = fmin; else if (f > fmax) f = fmax;
      var d = f - pos; if (d < 0) d = -d;
      var r = R[oR + t], base = 1 + f * r + (1 - f) * rfS, g = (1 - c * d) * base;
      if (det && det.n === n) det.f[t] = f;
      if (!(g > 0)) {
        dead = true; W = 0;
        // 录带（给杠杆曲线回放用）：这条路径在 λ = 1 时到此为止，但 λ 更小时它还活着，后面的决策也得录下来
        if (rec) for (var t2 = t + 1; t2 < T; t2++) { C.step(t2, 0, 0); V.price = L[oL + t2]; V.logp = Math.log(V.price); var f2 = decide(V, p, st, model); rec[oR + t2] = typeof f2 === "number" ? f2 : NaN; }
        break;
      }
      var ex = g - 1 - rfS; psum += ex; sumsq += ex * ex;
      W *= g; pos = f * (1 + r) / base; turn += d; expo += f < 0 ? -f : f;
      if (W > peak) peak = W; else { var dd = 1 - W / peak; if (dd > mdd) mdd = dd; }
      if (EQ) { var gp = gpos[t + 1]; if (gp >= 0) EQ[n * G + gp] = W; }
      if (det && det.n === n) det.w[t + 1] = W;
    }
    if (dead) { ruined++; mdd = 1; psum += -1 - rfS; sumsq += (1 + rfS) * (1 + rfS); /* 之后各步净值为 0，数组已是 0 */ }
    WT[n] = W; DD[n] = mdd; TO[n] = turn; EX[n] = expo / T; PM[n] = psum / T; sum += psum;
  }
  return { N: N, T: T, K: K, WT: WT, DD: DD, TO: TO, EX: EX, PM: PM, sum: sum, sumsq: sumsq, bad: bad, ruined: ruined, steps: steps, EQ: EQ, grid: grid, G: G, det: det, rec: rec, touched: C.touched() };
}
QL.runBatch = runBatch;

/** 把一次运行压成三种口径的数字（都带标准误）。bench 是同一批路径上的基准结果，用来做配对比较。 */
function summarize(res, set, bench) {
  var N = res.N, T = res.T, K = res.K, yrs = T / K, WT = res.WT, n, i;
  var sl = 0, sl2 = 0, sw = 0, sw2 = 0, fin = 0, loss = 0, ddHit = 0, sdd = 0, sto = 0, sex = 0;
  var ddLim = (set.ddLimit == null ? 30 : set.ddLimit) / 100;
  for (n = 0; n < N; n++) {
    var w = WT[n]; sw += w; sw2 += w * w;
    if (w > 0) { var lw = Math.log(w); sl += lw; sl2 += lw * lw; fin++; }
    if (w < 1) loss++;
    if (res.DD[n] >= ddLim) ddHit++;
    sdd += res.DD[n]; sto += res.TO[n]; sex += res.EX[n];
  }
  var mW = sw / N, vW = N > 1 ? (sw2 - sw * sw / N) / (N - 1) : 0;
  var mL = fin ? sl / fin : NaN, vL = fin > 1 ? (sl2 - sl * sl / fin) / (fin - 1) : 0;
  var ruin = res.ruined / N;
  // 夏普：全部路径、全部步数汇总；标准误来自各路径的均值
  var m = res.sum / res.steps, s2 = res.sumsq / res.steps - m * m, s = Math.sqrt(Math.max(s2, 1e-300));
  var spm = 0, spm2 = 0; for (n = 0; n < N; n++) { spm += res.PM[n]; spm2 += res.PM[n] * res.PM[n]; }
  var seM = N > 1 ? Math.sqrt(Math.max(0, (spm2 - spm * spm / N) / (N - 1)) / N) : s / Math.sqrt(T);
  var sharpe = s2 > 1e-24 ? m / s * Math.sqrt(K) : 0, seS = s2 > 1e-24 ? seM / s * Math.sqrt(K) : 0;
  var sorted = Float64Array.from(WT); sorted.sort();
  var dds = Float64Array.from(res.DD); dds.sort();
  var out = {
    N: N, T: T, K: K, years: yrs,
    growth: res.ruined ? -Infinity : mL / yrs, growthSE: N > 1 ? Math.sqrt(vL / fin) / yrs : NaN, growthAlive: mL / yrs,
    sharpe: sharpe, sharpeSE: seS,
    meanW: mW, meanWSE: N > 1 ? Math.sqrt(vW / N) : NaN, medW: quantileSorted(sorted, 0.5),
    q05: quantileSorted(sorted, 0.05), q25: quantileSorted(sorted, 0.25), q75: quantileSorted(sorted, 0.75), q95: quantileSorted(sorted, 0.95),
    pLoss: loss / N, pRuin: ruin, ruined: res.ruined,
    ddMean: sdd / N, ddMed: quantileSorted(dds, 0.5), dd95: quantileSorted(dds, 0.95), pDD: ddHit / N, ddLimit: ddLim,
    feasible: ddHit / N <= (set.ddProb == null ? 5 : set.ddProb) / 100,
    turnover: sto / N / yrs, exposure: sex / N, bad: res.bad, badFrac: res.bad / res.steps
  };
  if (bench) {
    // 配对差：同一批路径上，策略减基准
    var dl = 0, dl2 = 0, dw = 0, dw2 = 0, dm = 0, dm2 = 0, cnt = 0;
    for (n = 0; n < N; n++) {
      var a = WT[n], b = bench.WT[n];
      var x = a - b; dw += x; dw2 += x * x;
      var y = res.PM[n] - bench.PM[n]; dm += y; dm2 += y * y;
      if (a > 0 && b > 0) { var z = Math.log(a / b); dl += z; dl2 += z * z; cnt++; }
    }
    out.dGrowth = res.ruined || bench.ruined ? NaN : dl / cnt / yrs;
    out.dGrowthSE = cnt > 1 ? Math.sqrt(Math.max(0, (dl2 - dl * dl / cnt) / (cnt - 1)) / cnt) / yrs : NaN;
    out.dMeanW = dw / N; out.dMeanWSE = N > 1 ? Math.sqrt(Math.max(0, (dw2 - dw * dw / N) / (N - 1)) / N) : NaN;
    out.dExcess = dm / N * K; out.dExcessSE = N > 1 ? Math.sqrt(Math.max(0, (dm2 - dm * dm / N) / (N - 1)) / N) * K : NaN;
  }
  return out;
}
QL.summarize = summarize;

/** 三个目标的数值（扫描和验证用） */
function objectiveOf(sum, which) {
  if (which === "sharpe") return { v: sum.sharpe, se: sum.sharpeSE };
  if (which === "mean") return { v: sum.feasible ? sum.meanW - 1 : NaN, se: sum.meanWSE, raw: sum.meanW - 1, feasible: sum.feasible };
  return { v: sum.growth, se: sum.growthSE };
}
QL.objectiveOf = objectiveOf;

var BENCH = { decide: function () { return 1; } }, CASH = { decide: function () { return 0; } };
QL.benchFor = function (type) { return WORLDS[type] && WORLDS[type].benchF === 0 ? CASH : BENCH; };

/* ================================================================== *
 *  七、后台线程主循环
 * ================================================================== */
QL.workerMain = function (scope, strat, worldHooks) {
  var cfg = null, ext = null, train = null, fitB = null, evalB = null, benchCache = {}, modelCache = {}, cancelled = {}, busy = Promise.resolve();
  function isData() { return cfg.type === "real" || cfg.type === "boot"; }
  function isGame() { return !!WORLDS[cfg.type].game; }
  /** 在一批数据上执行规则：价格世界走 runBatch，玩法走 runGame */
  function run(B, s, p, set, opt, model) { return B.game ? QL.runGame(B, s, p, set, opt, model) : runBatch(B, s, p, set, opt, model); }
  /** 基准：价格世界是买入持有（或不下注），玩法是它自己指定的那条基准规则 */
  function benchRun(B, set, opt) {
    if (B.game) { var bs = QL.gameBenchSpec(B.game, B.gp); return QL.runGame(B, bs.strat, bs.p, null, opt || {}); }
    var s2 = { costBps: set.costBps, rf: set.rf, fmin: Math.min(set.fmin, 0), fmax: Math.max(set.fmax, 1), lam: 1 };
    return runBatch(B, QL.benchFor(cfg.type), {}, s2, opt || {});
  }
  /** 玩法的参照物（同一批对局上），按批次缓存 */
  var refCache = {};
  function refsOn(B, tag) {
    if (!B.game) return null;
    if (!refCache[tag]) {
      refCache[tag] = QL.gameRefs(B, {
        fitData: function () { return makeData(fitBatch()); },
        alt: function (over) {   // 同一条规则、同一个种子，换一组玩法参数再跑一遍
          var c2 = Object.assign({}, cfg, { params: Object.assign({}, cfg.params, over) });
          return { cfg: c2 };
        }
      });
    }
    return refCache[tag];
  }
  /** 参照物里"同一条规则换一组参数"的那一类，要用当前规则现跑 */
  function withAlt(refs, B, p, set, model) {
    if (!refs) return refs;
    return refs.map(function (r) {
      if (r.kind !== "alt" || !r.SC || !r.SC.cfg) return r;
      var o = Object.assign({}, r), key = "alt#" + r.id + "#" + B.bid;
      try { var B2 = altCache[key] || (altCache[key] = makeBatch(r.SC.cfg, extOf(), B.bid < 0 ? 0 : B.bid, undefined)); o.SC = run(B2, strat, p, set, {}, model).SC; } catch (e) { o.SC = null; o.err = String(e && e.message || e); }
      return o;
    });
  }
  var altCache = {};
  /** 带训练的规则在真实数据上回测用的那一段；模拟的世界里就是训练批次本身 */
  function evalBatch() { if (!isData()) return train; if (strat.fit) return train; return evalB || (evalB = makeBatch(cfg, extOf(), 0, "eval")); }
  function fitBatch() { return fitB || (fitB = makeBatch(cfg, extOf(), 0, "fit")); }
  function fitInfo() { return strat.fit && fitB ? { N: fitB.N, T: fitB.T, data: isData(), frac: FIT_FRAC } : null; }
  function post(m, tr) { scope.postMessage(m, tr || []); }
  function yieldNow() { return new Promise(function (res) { setTimeout(res, 0); }); }
  function setKey(set) { return [set.costBps, set.rf, set.fmin, set.fmax].join("|"); }
  function benchOn(B, tag, set) {
    var key = tag + "#" + (B.game ? "" : setKey(set));
    if (!benchCache[key]) benchCache[key] = benchRun(B, set, {});
    return benchCache[key];
  }
  function extOf() { return { series: ext && ext.series, splitPct: 70, simulate: worldHooks && worldHooks.simulate }; }
  var lastFit = null;
  /** 规则给每条路径（每一局）准备的状态里有几个数 */
  function stateSize(p, model) { if (!strat.init) return 0; try { return sizeOf(strat.init(p, model)); } catch (e) { return null; } }
  function fitKeyOf(p, fitKeys) { var sub = p; if (fitKeys) { sub = {}; fitKeys.forEach(function (k) { sub[k] = p[k]; }); } return JSON.stringify(sub); }
  function getModel(p, fitKeys) {
    if (!strat.fit) return undefined;
    var key = fitKeyOf(p, fitKeys);
    if (!(key in modelCache)) {
      var keys = Object.keys(modelCache); if (keys.length > 8) delete modelCache[keys[0]];
      var FD = makeData(fitBatch());   // 先把训练用的那批数据生成好：它不该算进"训练用时"里
      var t0 = nowMs();
      var mdl = strat.fit(FD, p, QL.ml, new RNG(cfg.seed, -3, -3));   // 模型只见得到 fitBatch，回测用的 train 它没见过；随机数也取自单独的一条流
      var took = nowMs() - t0;
      modelCache[key] = { model: mdl, ms: took < 10 ? Math.round(took * 10) / 10 : Math.round(took), size: mdl != null ? sizeOf(mdl) : null };   // 大小只量这一次
      post({ type: "fitted", ms: modelCache[key].ms, fit: fitInfo() });
    }
    lastFit = { key: key, ms: modelCache[key].ms, size: modelCache[key].size };
    return modelCache[key].model;
  }
  function fresh(k) { return makeBatch(cfg, extOf(), 1 + (k | 0), strat.fit && cfg.type === "boot" ? "eval" : undefined); }
  function packFan(res, bench) {
    var qs = fanOf(res.EQ, res.N, res.G, new Int32Array(res.G).map(function (_, i) { return i; }), QS);
    var out = { grid: res.grid, fan: qs, paths: samplePaths(res.EQ, res.N, res.G, new Int32Array(res.G).map(function (_, i) { return i; }), 24) };
    return out;
  }
  function handle(m) {
    var id = m.id, t0 = Date.now(), res, bench, sum, model;
    switch (m.type) {
      case "world": {
        cfg = m.cfg; ext = m.ext || null; benchCache = {}; modelCache = {}; fitB = null; evalB = null; refCache = {}; altCache = {};
        train = makeBatch(cfg, extOf(), 0, strat.fit && isData() ? "eval" : undefined);
        var ws = worldStats(train);
        post({ type: "world", id: id, stats: ws, N: train.N, T: train.T, K: train.K, part: train.part || "", ms: Date.now() - t0 });
        break;
      }
      case "run": {
        if (!train) throw new Error("世界还没生成");
        model = getModel(m.p, m.fitKeys);
        // part = "eval"：多策略对比里只要有一条带训练的规则，其余规则也都放到同一段数据上跑，配对差才有意义
        var RB = m.part === "eval" ? evalBatch() : train, tag = RB === train ? "train" : "eval";
        var tRun = nowMs();
        res = run(RB, strat, m.p, m.set, { fan: !!m.fan }, model);
        var runMs = nowMs() - tRun;
        bench = benchOn(RB, tag, m.set);
        sum = summarize(res, m.set, bench);
        var out = { type: "run", id: id, sum: sum, benchSum: summarize(bench, m.set), ms: Date.now() - t0, runMs: runMs, stepNs: runMs * 1e6 / Math.max(1, res.steps), modelSize: strat.fit && lastFit ? lastFit.size : null, stateSize: stateSize(m.p, model), hasInit: !!strat.init, fitMs: strat.fit && lastFit ? lastFit.ms : null, WT: res.WT, DD: res.DD, benchWT: Float64Array.from(bench.WT), benchDD: Float32Array.from(bench.DD), hasFit: !!strat.fit, fit: fitInfo(), part: RB.part || "", overlapTrain: !!RB.overlap };
        if (RB.game) { out.game = QL.gameSummary(RB, res, m.noRefs ? null : withAlt(refsOn(RB, tag), RB, m.p, m.set, model)); out.SC = res.SC; out.benchSC = Float64Array.from(bench.SC); }   // noRefs：场景对比只要得分，不必把参照物都跑一遍
        if (m.fan) {
          out.eq = packFan(res);
          var fk = tag + "#" + (RB.game ? "" : setKey(m.set));
          if (benchCache.__fanKey !== fk) { benchCache.__fan = packFan(benchRun(RB, m.set, { fan: true })).fan; benchCache.__fanKey = fk; }
          out.benchFan = benchCache.__fan;
        }
        if (strat.fit && model && model.diag) out.diag = model.diag;
        if (strat.fit && model && model.note) out.note = String(model.note).slice(0, 800);
        post(out);
        break;
      }
      case "oos": {
        var B = fresh(m.k); model = getModel(m.p, m.fitKeys);
        res = run(B, strat, m.p, m.set, {}, model);
        bench = benchRun(B, m.set, {});
        var oo = { type: "oos", id: id, sum: summarize(res, m.set, bench), benchSum: summarize(bench, m.set), kind: B.kind, N: B.N, T: B.T, overlap: !!B.overlap, ms: Date.now() - t0 };
        if (B.game) oo.game = QL.gameSummary(B, res, withAlt(QL.gameRefs(B, { fitData: function () { return makeData(fitBatch()); }, alt: function (over) { return { cfg: Object.assign({}, cfg, { params: Object.assign({}, cfg.params, over) }) }; } }), B, m.p, m.set, model));
        post(oo);
        break;
      }
      case "path": {
        model = getModel(m.p, m.fitKeys);
        if (train.game) {   // 玩法：这一局从头到尾重放一遍，连同基准规则在同一局上的表现
          var g1 = QL.sliceGame(train, m.n);
          res = QL.runGame(g1, strat, m.p, m.set, { detail: 0 }, model);
          var gb = QL.gameBenchSpec(train.game, train.gp), gres = QL.runGame(g1, gb.strat, gb.p, null, { detail: 0 });
          post({ type: "path", id: id, n: m.n, game: true, x: res.det.x, a: res.det.a, w: res.det.w, m: res.det.m, bw: gres.det.w, ba: gres.det.a, raw: Float64Array.from(g1.R), SC: res.SC[0], benchSC: gres.SC[0], benchName: gb.name, WT: res.WT[0], DD: res.DD[0] });
          break;
        }
        var one = { N: 1, T: train.T, K: train.K, R: train.R.subarray(m.n * train.T, (m.n + 1) * train.T), L: train.L.subarray(m.n * (train.T + 1), (m.n + 1) * (train.T + 1)) };
        res = runBatch(one, strat, m.p, m.set, { detail: 0 }, model);
        var s4 = { costBps: m.set.costBps, rf: m.set.rf, fmin: Math.min(m.set.fmin, 0), fmax: Math.max(m.set.fmax, 1), lam: 1 };
        var bres = runBatch(one, QL.benchFor(cfg.type), {}, s4, { detail: 0 });
        post({ type: "path", id: id, n: m.n, price: Float32Array.from(one.L), f: res.det.f, w: res.det.w, bw: bres.det.w, WT: res.WT[0], DD: res.DD[0] });
        break;
      }
      default: throw new Error("未知消息: " + m.type);
    }
  }
  /** 参数扫描 / 杠杆曲线 / 声明验证：一格一格地算，中间让出线程以便取消 */
  async function sweep(m) {
    var id = m.id, ax = m.axes, nx = ax[0].values.length, ny = ax[1] ? ax[1].values.length : 1, tot = nx * ny;
    var B = m.fresh != null ? fresh(m.fresh) : train;
    var G = new Float64Array(tot), GS = new Float64Array(tot), S = new Float64Array(tot), SS = new Float64Array(tot), Mw = new Float64Array(tot), MS = new Float64Array(tot),
        PD = new Float64Array(tot), PR = new Float64Array(tot), DDm = new Float64Array(tot), R2T = new Float64Array(tot).fill(NaN), R2V = new Float64Array(tot).fill(NaN),
        TO = new Float64Array(tot), IC = new Float64Array(tot).fill(NaN), SCv = new Float64Array(tot).fill(NaN), SCs = new Float64Array(tot).fill(NaN),
        FM = new Float64Array(tot).fill(NaN), RM = new Float64Array(tot).fill(NaN), SZ = new Float64Array(tot).fill(NaN), PU = new Float64Array(tot).fill(NaN);
    var keep = m.keepWT ? [] : null, last = Date.now(), tape = null;
    if (ny === 1 && ax[0].key === "__lam" && !B.game) { // 杠杆曲线：若规则不读净值和仓位，各个倍数下的原始决策完全相同，录一遍回放即可
      var probe = runBatch(B, strat, m.p, Object.assign({}, m.set, { lam: 1 }), { rec: true }, getModel(m.p, m.fitKeys));
      if (!probe.touched) tape = probe.rec;
      await yieldNow();
    }
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      if (cancelled[id]) { post({ type: "cancelled", id: id }); return; }
      var p = Object.assign({}, m.p), set = Object.assign({}, m.set);
      [[ax[0], i], [ax[1], j]].forEach(function (a) { if (!a[0]) return; var v = a[0].values[a[1]]; if (a[0].key === "__lam") set.lam = v; else p[a[0].key] = v; });
      var model = tape ? null : getModel(p, m.fitKeys), tf1 = nowMs(), res = tape ? runBatch(B, null, p, set, { replay: tape }) : run(B, strat, p, set, {}, model), tf2 = nowMs(), sum = summarize(res, set), k = j * nx + i;
      if (res.SC) { var gsw = QL.gameSummary(B, res, null); SCv[k] = gsw.score; SCs[k] = gsw.se; }
      RM[k] = (tf2 - tf1) * 1e6 / Math.max(1, res.steps);            // 每次决策的平均用时（纳秒）
      if (strat.fit && lastFit && lastFit.key === fitKeyOf(p, m.fitKeys)) FM[k] = lastFit.ms;
      G[k] = sum.growth; GS[k] = sum.growthSE; S[k] = sum.sharpe; SS[k] = sum.sharpeSE; Mw[k] = sum.meanW - 1; MS[k] = sum.meanWSE; PD[k] = sum.pDD; PR[k] = sum.pRuin; DDm[k] = sum.ddMed; TO[k] = sum.turnover;
      if (model && model.diag) { R2T[k] = model.diag.r2Train; R2V[k] = model.diag.r2Valid; IC[k] = model.diag.ic; if (model.diag.predUs != null) PU[k] = model.diag.predUs; }
      if (strat.fit && lastFit && lastFit.key === fitKeyOf(p, m.fitKeys) && lastFit.size != null) SZ[k] = lastFit.size;
      if (keep) keep.push({ WT: res.WT, PM: res.PM, SC: res.SC || null });
      if (Date.now() - last > 60) { post({ type: "progress", id: id, done: k + 1, total: tot }); await yieldNow(); last = Date.now(); }
    }
    var out = { type: "sweep", id: id, nx: nx, ny: ny, growth: G, growthSE: GS, sharpe: S, sharpeSE: SS, mean: Mw, meanSE: MS, pDD: PD, pRuin: PR, ddMed: DDm, r2Train: R2T, r2Valid: R2V, turnover: TO, ic: IC, score: SCv, scoreSE: SCs, fitMs: FM, stepNs: RM, size: SZ, predUs: PU, N: B.N, T: B.T, K: B.K, kind: B.kind };
    if (keep) out.keep = keep;
    post(out);
  }
  scope.onmessage = function (ev) {
    var m = ev.data;
    if (m.type === "cancel") { cancelled[m.id] = true; return; }
    busy = busy.then(function () {
      if (m.type === "sweep") return sweep(m);
      handle(m);
    }).catch(function (e) {
      post({ type: "error", id: m.id, message: String(e && e.message || e), stack: String(e && e.stack || "").split("\n").slice(0, 8).join("\n") });
    });
  };
  post({ type: "ready", hasFit: !!strat.fit, hasInit: !!strat.init });
};

QL.ml = {}; // 模型库在下面的 QL_ML 里补上
if (typeof QL_ML_INSTALL === "function") QL_ML_INSTALL(QL);
if (typeof QL_GAMES_INSTALL === "function") QL_GAMES_INSTALL(QL);   // 十套玩法
if (typeof QL_OBS_INSTALL === "function") QL_OBS_INSTALL(QL);       // 四套观测玩法（要排在十套之后：它们共用同一个裁判）
if (typeof QL_LIVE_INSTALL === "function") QL_LIVE_INSTALL(QL);     // 现算：对照表的清单和一格怎么算

self.QL = QL;
return QL;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_CORE;
