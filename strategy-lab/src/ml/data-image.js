// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 图像与格点数据集（family = "image"）
 *   ising        二维伊辛模型的构型（环面，Swendsen–Wang / Wolff + 棋盘 Metropolis），按链分组
 *   digits       UCI 手写数字 8×8（scikit-learn 自带的那 1797 张；按像素位置的典范 Huffman 码压缩后内嵌）
 *   shapes       程序生成的 16×16 形状图（平移、缩放、旋转、实心/空心、噪声）
 *   percolation  方格座逾渗：是否上下连通（非局部的标签）
 * 另外装上 QL.mlimage：伊辛的精确结果（Onsager、Yang、Kaufman）、采样器、连通判定、交叉温度，给页面画参考曲线和测试用。
 * 这个函数会被 toString() 拼进后台线程，所以只用参数 QL 和标准 JavaScript，数据常量都写在函数体里。 */
function QL_MLDATA_IMAGE(QL) {
"use strict";
var reg = QL.mlreg;
if (!reg || typeof reg.add !== "function") throw new Error("data-image.js：请先安装 registry.js（QL.mlreg）。");

/* ---------- 小工具 ---------- */
// 参数可能来自界面（字符串）或已经清洗过（数字）；这里统一取数，缺了就用默认值
function num(p, k, d) { var v = p && p[k]; if (v === undefined || v === null || v === "") return d; v = +v; return isFinite(v) ? v : d; }
function str(p, k, d) { var v = p && p[k]; return v === undefined || v === null || v === "" ? d : String(v); }
function bool(p, k, d) { var v = p && p[k]; if (v === undefined || v === null) return d; return v === true || v === "true" || v === 1 || v === "1"; }
function clampI(v, lo, hi) { v = Math.round(v); return v < lo ? lo : v > hi ? hi : v; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = rng.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function oneHot(k, c) { var o = new Float64Array(k); o[c] = 1; return o; }

/* ================================================================== *
 *  一、二维伊辛：精确结果（J = k_B = 1）
 * ================================================================== */
var KC = 0.5 * Math.log(1 + Math.SQRT2), TC = 1 / KC;        // K_c = 0.44068679…，T_c = 2.26918531…
function asinh(x) { return Math.log(x + Math.sqrt(x * x + 1)); }
function acosh(x) { return Math.log(x + Math.sqrt(x * x - 1)); }
/** Yang（1952）：T < T_c 时 M = (1 − sinh^{-4} 2K)^{1/8}，否则 0 */
function yang(T) { var s = Math.sinh(2 / T); return s > 1 ? Math.pow(1 - Math.pow(s, -4), 0.125) : 0; }
/** 解 M(T) = m*：固定阈值 |m| > m* 的分类器在 L → ∞ 时的交叉温度（项目 35 命题 35.11） */
function tinf(mStar) { if (!(mStar > 0 && mStar < 1)) return NaN; return 2 / asinh(Math.pow(1 - Math.pow(mStar, 8), -0.25)); }
/** 第一类完全椭圆积分 K(k)（模数 k）= π / (2·AGM(1, √(1−k²))) */
function ellipK(k) { var a = 1, b = Math.sqrt(1 - k * k); if (b === 0) return Infinity; for (var i = 0; i < 40 && Math.abs(a - b) > 1e-16 * a; i++) { var t = (a + b) / 2; b = Math.sqrt(a * b); a = t; } return Math.PI / (2 * a); }
/** Onsager：无穷格子的每格点能量 u = −coth2K [1 + (2/π)(2tanh²2K − 1) K(κ)]，κ = 2 sinh2K / cosh²2K */
function onsagerEnergy(T) {
  var K = 1 / T, s = Math.sinh(2 * K), c = Math.cosh(2 * K), kap = 2 * s / (c * c), th = Math.tanh(2 * K);
  if (kap >= 1) return -1 / th;                  // 恰好在 T_c：系数 2tanh²2K − 1 = 0
  return -1 / th * (1 + 2 / Math.PI * (2 * th * th - 1) * ellipK(kap));
}
/** log(2 cosh x) 与 log|2 sinh x|，数值稳定 */
function log2cosh(x) { x = Math.abs(x); return x + Math.log(1 + Math.exp(-2 * x)); }
function log2sinhAbs(x) { x = Math.abs(x); return x + Math.log(-Math.expm1(-2 * x)); }
/** Kaufman（1949）：m 行 n 列、两个方向都周期的方格子的精确 ln Z（K = β）。
 *  Z = ½ (2 sinh 2K)^{mn/2} Σ_{i=1}^{4} Z_i，Z_1 = Π_r 2cosh(m γ_{2r+1}/2)，Z_2 = Π_r 2sinh(m γ_{2r+1}/2)，
 *  Z_3 = Π_r 2cosh(m γ_{2r}/2)，Z_4 = Π_r 2sinh(m γ_{2r}/2)，r = 0..n−1；
 *  l ≥ 1 时 cosh γ_l = cosh2K coth2K − cos(πl/n)，而 γ_0 = 2K + ln tanh K 带符号（高温为负，Z_4 随之变号）。 */
function kaufmanLogZ(K, m, n) {
  var cc = Math.cosh(2 * K) / Math.tanh(2 * K), l, r;
  var g = new Float64Array(2 * n);
  for (l = 1; l < 2 * n; l++) g[l] = acosh(cc - Math.cos(Math.PI * l / n));
  g[0] = 2 * K + Math.log(Math.tanh(K));
  var L1 = 0, L2 = 0, L3 = 0, L4 = 0, s4 = 1;
  for (r = 0; r < n; r++) {
    var go = m * g[2 * r + 1] / 2, ge = m * g[2 * r] / 2;
    L1 += log2cosh(go); L2 += log2sinhAbs(go); L3 += log2cosh(ge);
    if (ge === 0) s4 = 0; else { L4 += log2sinhAbs(ge); if (ge < 0) s4 = -s4; }
  }
  var mx = Math.max(L1, L2, L3, s4 ? L4 : -Infinity);
  var s = Math.exp(L1 - mx) + Math.exp(L2 - mx) + Math.exp(L3 - mx) + (s4 ? s4 * Math.exp(L4 - mx) : 0);
  return Math.log(0.5) + 0.5 * m * n * Math.log(2 * Math.sinh(2 * K)) + mx + Math.log(s);
}
/** L×L 环面的精确每格点能量 ⟨e⟩ = −(1/N) d lnZ / dK 与比热 c = K² d²lnZ/dK² / N（中心差分） */
function kaufmanEnergy(T, L) {
  var K = 1 / T, N = L * L, h = 1e-4, f0 = kaufmanLogZ(K, L, L), fp = kaufmanLogZ(K + h, L, L), fm = kaufmanLogZ(K - h, L, L);
  var hh = Math.min(1e-3, 0.02 / L), d2 = (kaufmanLogZ(K + hh, L, L) - 2 * f0 + kaufmanLogZ(K - hh, L, L)) / (hh * hh);
  return { e: -(fp - fm) / (2 * h) / N, c: K * K * d2 / N };
}

/* ================================================================== *
 *  二、二维伊辛：采样器
 * ================================================================== */
/** 邻接表：nb[4i..4i+3] = 右、下、左、上；color[i] = (行 + 列) mod 2（L 为偶数时同色格点之间没有键） */
function lattice(L) {
  var N = L * L, nb = new Int32Array(4 * N), c0 = [], c1 = [];
  for (var r = 0; r < L; r++) for (var c = 0; c < L; c++) {
    var i = r * L + c;
    nb[4 * i] = r * L + (c + 1) % L; nb[4 * i + 1] = ((r + 1) % L) * L + c;
    nb[4 * i + 2] = r * L + (c + L - 1) % L; nb[4 * i + 3] = ((r + L - 1) % L) * L + c;
    ((r + c) & 1 ? c1 : c0).push(i);
  }
  return { L: L, N: N, nb: nb, colors: [Int32Array.from(c0), Int32Array.from(c1)], parent: new Int32Array(N), flip: new Int8Array(N), stack: new Int32Array(N) };
}
/** 棋盘 Metropolis：依次更新两种颜色。翻转 σ_i 的能量变化 ΔE = 2σ_i h_i ∈ {−8,−4,0,4,8}；只有 ΔE > 0 时才抽随机数 */
function metroSweep(s, lat, w4, w8, rng) {
  var nb = lat.nb;
  for (var col = 0; col < 2; col++) {
    var sites = lat.colors[col];
    for (var q = 0; q < sites.length; q++) {
      var i = sites[q], b = 4 * i, de = 2 * s[i] * (s[nb[b]] + s[nb[b + 1]] + s[nb[b + 2]] + s[nb[b + 3]]);
      if (de <= 0 || rng.u() < (de === 4 ? w4 : w8)) s[i] = -s[i];
    }
  }
}
function findRoot(par, i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
/** Swendsen–Wang：同号邻居以 p = 1 − e^{−2β} 连键（并查集），每个团簇以 1/2 的概率整体翻转 */
function swSweep(s, lat, pb, rng) {
  var N = lat.N, nb = lat.nb, par = lat.parent, flip = lat.flip, i, j, a, b;
  for (i = 0; i < N; i++) { par[i] = i; flip[i] = -1; }
  for (i = 0; i < N; i++) for (var d = 0; d < 2; d++) {
    j = nb[4 * i + d];
    if (s[i] === s[j] && rng.u() < pb) { a = findRoot(par, i); b = findRoot(par, j); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } }
  }
  for (i = 0; i < N; i++) { a = findRoot(par, i); if (flip[a] < 0) flip[a] = rng.u() < 0.5 ? 1 : 0; if (flip[a]) s[i] = -s[i]; }
}
/** Wolff：从随机种子长一个团簇并翻转（加入时就翻转，所以每条"团簇—同号邻居"键恰好只试一次），返回团簇大小 */
function wolffOne(s, lat, pb, rng) {
  var nb = lat.nb, st = lat.stack, i0 = rng.int(lat.N), s0 = s[i0], top = 0, size = 1;
  s[i0] = -s0; st[top++] = i0;
  while (top > 0) {
    var i = st[--top];
    for (var d = 0; d < 4; d++) { var j = nb[4 * i + d]; if (s[j] === s0 && rng.u() < pb) { s[j] = -s0; st[top++] = j; size++; } }
  }
  return size;
}
function energyPerSite(s, lat) { var E = 0, nb = lat.nb; for (var i = 0; i < lat.N; i++) E -= s[i] * (s[nb[4 * i]] + s[nb[4 * i + 1]]); return E / lat.N; }
function magPerSite(s, N) { var M = 0; for (var i = 0; i < N; i++) M += s[i]; return M / N; }
/** 在温度 T 下跑若干条独立的链，记录样本。opts：chains、perChain（数组或数）、therm、gap、sampler（"sw" | "wolff" | "metro"）。
 *  每条链：随机初态（每个自旋独立 ±1），热化 therm 步，之后每隔 gap 步记一个样本。一步 = 一次团簇更新 + 一次 Metropolis 扫描（"metro" 时只有后者）。
 *  Wolff 的"一次"：热化时反复翻团簇直到累计翻转 ≥ N，同时估计平均团簇大小 ⟨|C|⟩；热化之后每步固定翻 round(N/⟨|C|⟩) 个团簇。
 *  （如果每步翻几个团簇取决于当前状态，"在第几次停下"就是一个停时，停下时的状态不再服从 Gibbs 分布——实测在 T_c 处能量偏低好几个标准误。） */
function isingSample(L, T, opts, rng, sink) {
  var lat = lattice(L), N = lat.N, beta = 1 / T, w4 = Math.exp(-4 * beta), w8 = Math.exp(-8 * beta), pb = -Math.expm1(-2 * beta);
  var chains = Math.max(1, opts.chains | 0), therm = Math.max(0, opts.therm | 0), gap = Math.max(1, opts.gap | 0), sampler = opts.sampler || "sw";
  var per = []; for (var c = 0; c < chains; c++) per.push(typeof opts.perChain === "number" ? opts.perChain : opts.perChain[c]);
  var total = 0; per.forEach(function (v) { total += v; });
  var out = sink || { X: new Int8Array(total * N), m: new Float64Array(total), e: new Float64Array(total), chain: new Int32Array(total), off: 0 };
  var s = new Int8Array(N), nW = 1, wSum = 0, wCnt = 0;
  function step(burn) {
    if (sampler === "sw") swSweep(s, lat, pb, rng);
    else if (sampler === "wolff") {
      if (burn) { var tot = 0, g = 0; while (tot < N && g++ < 4 * N) { var sz = wolffOne(s, lat, pb, rng); tot += sz; wSum += sz; wCnt++; } }
      else for (var q = 0; q < nW; q++) wolffOne(s, lat, pb, rng);
    }
    metroSweep(s, lat, w4, w8, rng);
  }
  for (c = 0; c < chains; c++) {
    for (var i = 0; i < N; i++) s[i] = rng.u() < 0.5 ? 1 : -1;
    wSum = 0; wCnt = 0;
    for (var t = 0; t < therm; t++) step(true);
    if (sampler === "wolff") {
      if (!wCnt) for (t = 0; t < 10; t++) { wSum += wolffOne(s, lat, pb, rng); wCnt++; }
      nW = Math.max(1, Math.min(N, Math.round(N * wCnt / wSum)));
    }
    for (var q = 0; q < per[c]; q++) {
      for (t = 0; t < gap; t++) step(false);
      var o = out.off++;
      if (out.X) { if (out.X instanceof Int8Array) out.X.set(s, o * N); else for (i = 0; i < N; i++) out.X[o * N + i] = s[i]; }
      out.m[o] = magPerSite(s, N); out.e[o] = energyPerSite(s, lat);
      if (out.chain) out.chain[o] = (out.chainBase || 0) + c;
      if (out.T) out.T[o] = T;
    }
  }
  return out;
}
/** 温度网格：一部分均匀铺在 [Tmin, Tmax]，另一部分（个数取偶数）加密在 T_c(1 ± 0.13)，后者关于 T_c 对称且不含 T_c 本身 */
function isingTemps(P) {
  var nT = P.nT, nD = 2 * Math.round(P.dense * nT / 2), nU, out = [], i;
  if (nD > nT) nD = nT - (nT & 1); nU = nT - nD;
  for (i = 0; i < nU; i++) out.push(nU === 1 ? (P.Tmin + P.Tmax) / 2 : P.Tmin + (P.Tmax - P.Tmin) * i / (nU - 1));
  for (i = 0; i < nD; i++) out.push(TC * (1 + 0.13 * (2 * (i + 0.5) / nD - 1)));
  out = out.map(function (T) { return Math.abs(T - TC) < 1e-6 ? T + 1e-3 : T; });
  out.sort(function (a, b) { return a - b; });
  return out;
}
function isingParams(p) {
  var L = clampI(num(p, "L", 16), 4, 64); if (L & 1) L++;
  var P = { L: L, nT: clampI(num(p, "nT", 20), 2, 60), perT: clampI(num(p, "perT", 30), 1, 1000), chains: clampI(num(p, "chains", 10), 1, 200),
    Tmin: clamp(num(p, "Tmin", 1.0), 0.3, 2.2), Tmax: clamp(num(p, "Tmax", 3.5), 2.35, 8), dense: clamp(num(p, "dense", 0.5), 0, 1),
    therm: clampI(num(p, "therm", 60), 0, 5000), gap: clampI(num(p, "gap", 3), 1, 200), sampler: str(p, "sampler", "sw"), protocol: str(p, "protocol", "all") };
  if (P.chains > P.perT) P.chains = P.perT;
  if (["sw", "wolff", "metro"].indexOf(P.sampler) < 0) P.sampler = "sw";
  return P;
}
var FAR_LO = 1.6, FAR_HI = 3.0;   // 项目 35 的"远离 T_c"方案：只用 T ≤ 1.6 与 T ≥ 3.0 训练

/** 交叉温度：按温度分组求平均预测 P(有序)，找它从上往下穿过 1/2 的位置（相邻网格点之间线性插值）。
 *  probs：每个样本的 P(有序)（长度 n），或 n×2 的类别概率（取第 2 列）。 */
function crossover(probs, T) {
  var n = T.length, two = probs.length === 2 * n, map = {}, keys = [], i;
  for (i = 0; i < n; i++) { var key = T[i].toPrecision(12), v = two ? probs[2 * i + 1] : probs[i]; if (!map[key]) { map[key] = { T: +T[i], s: 0, c: 0 }; keys.push(key); } map[key].s += v; map[key].c++; }
  var rows = keys.map(function (k) { return map[k]; }).sort(function (a, b) { return a.T - b.T; });
  var temps = rows.map(function (r) { return r.T; }), mean = rows.map(function (r) { return r.s / r.c; }), cross = [];
  for (i = 0; i + 1 < rows.length; i++) {
    var a = mean[i] - 0.5, b = mean[i + 1] - 0.5;
    if (a === 0) cross.push(temps[i]);
    else if (a * b < 0) cross.push(temps[i] + (temps[i + 1] - temps[i]) * a / (a - b));
  }
  if (rows.length && mean[rows.length - 1] === 0.5) cross.push(temps[rows.length - 1]);
  // 多个穿越点时取"由有序到无序"的第一个下穿点；没有下穿就取第一个穿越点
  var down = null; for (i = 0; i + 1 < rows.length && down === null; i++) if (mean[i] >= 0.5 && mean[i + 1] < 0.5) down = mean[i] === 0.5 ? temps[i] : temps[i] + (temps[i + 1] - temps[i]) * (mean[i] - 0.5) / (mean[i] - mean[i + 1]);
  return { Tstar: down !== null ? down : cross.length ? cross[0] : NaN, crossings: cross, temps: temps, mean: mean, count: rows.map(function (r) { return r.c; }) };
}

reg.add({
  id: "ising", family: "image", kind: "classification", plot: "lattice",
  name: "二维伊辛模型的相", summary: "环面上的 ±1 自旋构型，按温度是否低于 T_c 标成有序 / 无序；同一条马尔可夫链的样本整组划分。",
  params: [
    { key: "L", label: "边长 L", def: "16", type: "select", options: [["8", "8 × 8"], ["12", "12 × 12"], ["16", "16 × 16"], ["24", "24 × 24"]], desc: "环面的边长；N = L² 个自旋" },
    { key: "nT", label: "温度个数", def: 20, min: 4, max: 40, step: 1, type: "int", desc: "一半均匀铺在 [Tmin, Tmax]，一半加密在 T_c(1 ± 0.13)" },
    { key: "perT", label: "每个温度的样本数", def: 30, min: 4, max: 200, step: 1, type: "int" },
    { key: "chains", label: "每个温度的链数", def: 10, min: 1, max: 50, step: 1, type: "int", desc: "独立的马尔可夫链；划分按链进行" },
    { key: "Tmin", label: "最低温度", def: 1.0, min: 0.5, max: 2.2, step: 0.05, type: "num" },
    { key: "Tmax", label: "最高温度", def: 3.5, min: 2.4, max: 6, step: 0.05, type: "num" },
    { key: "dense", label: "加密比例", def: 0.5, min: 0, max: 1, step: 0.05, type: "num", desc: "温度点里放在 T_c 附近的比例" },
    { key: "sampler", label: "采样器", def: "sw", type: "select", options: [["sw", "Swendsen–Wang + Metropolis"], ["wolff", "Wolff + Metropolis"], ["metro", "只用 Metropolis（看临界慢化）"]] },
    { key: "therm", label: "热化步数", def: 60, min: 0, max: 2000, step: 10, type: "int" },
    { key: "gap", label: "样本间隔（步）", def: 3, min: 1, max: 50, step: 1, type: "int" },
    { key: "protocol", label: "训练方案", def: "all", type: "select", options: [["all", "所有温度（按链划分）"], ["far", "只在远离 T_c 处训练（T ≤ 1.6 或 T ≥ 3.0）"]], desc: "远离方案：中间温度全部进测试集，检验外推" }
  ],
  split: { train: 0.6, valid: 0.2, test: 0.2, by: "group" },
  gen: function (p, rng) {
    var P = isingParams(p), L = P.L, N = L * L, temps = isingTemps(P), nT = temps.length, n = nT * P.perT;
    var out = { X: new Float64Array(n * N), m: new Float64Array(n), e: new Float64Array(n), chain: new Int32Array(n), T: new Float64Array(n), off: 0, chainBase: 0 };
    var per = []; for (var c = 0; c < P.chains; c++) per.push(Math.floor(P.perT / P.chains) + (c < P.perT % P.chains ? 1 : 0));
    for (var t = 0; t < nT; t++) { out.chainBase = t * P.chains; isingSample(L, temps[t], { chains: P.chains, perChain: per, therm: P.therm, gap: P.gap, sampler: P.sampler }, rng, out); }
    var y = new Int32Array(n), i;
    for (i = 0; i < n; i++) y[i] = out.T[i] < TC ? 1 : 0;
    var yangM = new Float64Array(nT), eEx = new Float64Array(nT);
    for (t = 0; t < nT; t++) { yangM[t] = yang(temps[t]); eEx[t] = kaufmanEnergy(temps[t], L).e; }
    var data = { X: out.X, y: y, n: n, d: N, classes: ["无序 T>Tc", "有序 T<Tc"], shape: [L, L], groups: out.chain,
      meta: { T: out.T, Tc: TC, m: out.m, e: out.e, temps: temps, L: L, chainsPerT: P.chains, sampler: P.sampler, protocol: P.protocol, yangM: yangM, eExact: eEx, label: "y = 1[T < T_c]，T_c = 2/ln(1+√2)" } };
    if (P.protocol === "far") {
      // 远离 T_c 的链：按链 3:1 分给训练 / 验证；中间温度的链全部进测试集
      var farChains = [], tr = [], va = [], te = [], isTr = {};
      for (t = 0; t < nT; t++) if (temps[t] <= FAR_LO || temps[t] >= FAR_HI) for (c = 0; c < P.chains; c++) farChains.push(t * P.chains + c);
      if (farChains.length < 2) throw new Error("“远离 T_c”方案需要至少两条落在 T ≤ 1.6 或 T ≥ 3.0 的链：请调低最低温度或调高最高温度。");
      shuffle(farChains, rng);
      var nTr = Math.max(1, Math.min(farChains.length - 1, Math.round(farChains.length * 0.75)));
      for (i = 0; i < farChains.length; i++) isTr[farChains[i]] = i < nTr ? 1 : 2;
      for (i = 0; i < n; i++) { var g = out.chain[i]; (isTr[g] === 1 ? tr : isTr[g] === 2 ? va : te).push(i); }
      if (!te.length) throw new Error("“远离 T_c”方案下没有中间温度可测：请让温度网格覆盖 (1.6, 3.0)。");
      data.splitIdx = { train: Int32Array.from(tr), valid: Int32Array.from(va), test: Int32Array.from(te) };
    }
    return data;
  },
  // 贝叶斯后验只通过能量依赖构型（指数族）：P(T_t | σ) ∝ e^{−β_t H(σ)} / Z_L(β_t)，Z_L 用 Kaufman 精确公式
  oracle: function (p) {
    var P = isingParams(p), L = P.L, N = L * L, temps = isingTemps(P), lat = lattice(L), nT = temps.length;
    var lz = temps.map(function (T) { return kaufmanLogZ(1 / T, L, L); });
    return {
      predict: function (x) {
        var H = 0, nb = lat.nb, lw = new Float64Array(nT), mx = -Infinity, t, i;
        for (i = 0; i < N; i++) H -= x[i] * (x[nb[4 * i]] + x[nb[4 * i + 1]]);
        for (t = 0; t < nT; t++) { lw[t] = -H / temps[t] - lz[t]; if (lw[t] > mx) mx = lw[t]; }
        var num1 = 0, den = 0; for (t = 0; t < nT; t++) { var w = Math.exp(lw[t] - mx); den += w; if (temps[t] < TC) num1 += w; }
        var q = num1 / den; return [1 - q, q];
      },
      note: "贝叶斯最优：后验 P(T<T_c | σ) 只依赖能量 H(σ)，并且关于 H 单调，所以最优分类器是一个能量阈值；这里用 Kaufman 的精确配分函数在本数据集的温度网格上算后验（“远离 T_c”方案的测试集只含中间温度，此时它不再严格最优）。"
    };
  },
  bayes: function () { return { metric: "acc", value: null, note: "没有闭式：最优分类器是能量阈值（见 oracle），它的准确率等于 E[max_c P(c | H)]，依赖 L 和温度网格；排行榜上 oracle 一行就是它的估计。" }; },
  docs: [
    "**定义.** $\\Lambda_L=(\\mathbb Z/L\\mathbb Z)^2$ 是 $L\\times L$ 的环面，$N=L^2$。构型 $\\sigma\\in\\{\\pm1\\}^{\\Lambda_L}$，哈密顿量 $H(\\sigma)=-\\sum_{\\langle ij\\rangle}\\sigma_i\\sigma_j$（$2N$ 条最近邻键，$J=k_B=1$），Gibbs 测度 $\\mu_{L,\\beta}(\\sigma)=e^{-\\beta H(\\sigma)}/Z_L(\\beta)$，$\\beta=1/T$。每个样本是一张 $L\\times L$ 的 $\\pm1$ 图，标签 $y=\\mathbf 1[T<T_c]$（1 = 有序）。`meta` 里有每个样本的温度 `T`、磁化 $m=N^{-1}\\sum_i\\sigma_i$（`m`）、每格点能量 $e=H/N$（`e`），以及 `Tc`、每个温度的有限尺寸精确能量 `eExact`（Kaufman）与无穷体积磁化 `yangM`（Yang）。",
    "",
    "## 相变：三个精确结果",
    "- **Peierls（1936）.** 在 $\\mathbb Z^2$ 上取 $+$ 边界条件，$\\mu^+_{n,\\beta}(\\sigma_0=-1)\\le\\sum_{\\ell\\ge4,\\,\\ell\\text{ 偶}}\\ell\\,(3e^{-2\\beta})^{\\ell}$。$\\beta$ 大时右边 $<\\tfrac12$，所以自发磁化 $M(\\beta)=\\lim_n\\mu^+_{n,\\beta}(\\sigma_0)>0$：低温有序。证明梗概：$\\sigma_0=-1$ 时有一条包围原点的对偶围道 $\\gamma$；把 $\\gamma$ 内的自旋全部翻转是单射，且能量降低 $2\\lvert\\gamma\\rvert$，故 $\\mu(\\gamma)\\le e^{-2\\beta\\lvert\\gamma\\rvert}$；长度为 $\\ell$ 的这种围道不超过 $\\ell\\,3^{\\ell}$ 条。",
    "- **Kramers–Wannier（1941）与 Onsager（1944）.** 高温展开与低温展开给出自由能 $\\varphi(K)=\\lim N^{-1}\\ln Z$ 的对偶：$\\varphi(K)-\\tfrac12\\ln\\sinh2K=\\varphi(K^*)-\\tfrac12\\ln\\sinh2K^*$，其中 $\\sinh2K\\,\\sinh2K^*=1$。若非解析点唯一，它只能是自对偶点 $\\sinh2K_c=1$；Onsager 的精确解证实了这一点：$$T_c=\\frac{2}{\\ln(1+\\sqrt2)}\\approx2.269185.$$",
    "- **Yang（1952）.** $T<T_c$ 时 $M(T)=\\big(1-\\sinh^{-4}2\\beta\\big)^{1/8}$，$T\\ge T_c$ 时 $M=0$。因此 $M\\propto(T_c-T)^{1/8}$：序参量在 $T_c$ 下方陡得出奇。",
    "",
    "**有限尺寸.** 环面上 $\\langle m\\rangle=0$（$\\mathbb Z_2$ 对称），只能看 $\\langle\\lvert m\\rvert\\rangle$；它随 $T$ 光滑下降，过渡区宽度 $\\sim L^{-1/\\nu}$，$\\nu=1$。同一个 $L$ 的精确能量由 Kaufman（1949）的有限环面配分函数给出（$T_c$ 处 $e\\approx-\\sqrt2-0.622/L$），检验采样器时要和它比，而不是和 $-\\sqrt2$ 比。",
    "",
    "## 贝叶斯最优：能量是充分统计量",
    "温度在网格 $\\{T_t\\}$ 上等可能，给定温度后 $\\sigma\\sim\\mu_{L,1/T}$，于是",
    "$$P(T_t\\mid\\sigma)=\\frac{e^{-\\beta_tH(\\sigma)}/Z_L(\\beta_t)}{\\sum_se^{-\\beta_sH(\\sigma)}/Z_L(\\beta_s)}$$",
    "只依赖 $H(\\sigma)$（指数族）。$e^{-\\beta H}$ 关于 $(\\beta,-H)$ 有单调似然比，所以 $P(T<T_c\\mid\\sigma)$ 关于 $H$ 单调递减：**贝叶斯最优分类器就是一个能量阈值**。oracle 用 Kaufman 的精确 $Z_L$ 计算这个后验；它的准确率没有闭式，排行榜上 oracle 一行就是估计值。",
    "",
    "## 项目 35 的教训：网络“找到的”不一定是 $T_c$",
    "记分类器在测试集上的平均输出为 $P_L(T)$，它穿过 $\\tfrac12$ 的温度为 $T^*(L)$（`QL.mltoy.isingCrossover`）。",
    "- **固定阈值收敛到 Yang 温度.** 设 $C(\\sigma)=\\mathbf 1[\\lvert m\\rvert>m^*]$，$m^*\\in(0,1)$ 固定。则 $L\\to\\infty$ 时 $T^*(L)\\to T_\\infty(m^*)$，它由 $M(T_\\infty)=m^*$ 决定：$$T_\\infty(m^*)=\\frac{2}{\\operatorname{arsinh}\\big((1-m^{*8})^{-1/4}\\big)}<T_c.$$ 例如 $m^*=0.5$ 给 $2.267$，$m^*=0.8$ 给 $2.188$。证明梗概：$T>T_c$ 时关联指数衰减，$\\langle m^2\\rangle_L\\to0$，用 Chebyshev；$T<T_c$ 时要用“环面上 $m$ 的分布集中在 $\\pm M(T)$”（Dobrushin–Kotecký–Shlosman 的 Wulff 构造）。项目 35 的实测：在 $L=16$ 上选定阈值 $0.797$ 后拿去测 $L=8,16,32,64$，$T^*=2.315,\\,2.252,\\,2.206,\\,2.189$，收敛到预言的 $2.190$，而不是 $2.269$。",
    "- **带全局平均池化的 CNN** 是 $\\mathbf 1\\big[N^{-1}\\sum_xg(\\sigma|_{x+B})>\\theta\\big]$ 的形式（$B$ 是感受野），空间平均服从大数定律，$T^*$ 收敛到 $\\langle g\\rangle_T=\\theta$ 的根；只有 $\\theta=\\langle g\\rangle_{T_c}$ 时它才是 $T_c$。",
    "- **标签泄露.** 标签 $\\mathbf 1[T<T_c]$ 本身用了精确的 $T_c$；逐个 $L$ 训练时，最优阈值被标签拉向 $T_c$。所以“网络找到了 $T_c$”的信息主要来自标签，再加上 $\\beta=1/8$ 让 $T_\\infty(m^*)$ 对 $m^*$ 极不敏感（$m^*\\le0.6$ 都落在 $T_c$ 下方 $0.008$ 以内）。“训练方案 = 远离 $T_c$”只用 $T\\le1.6$ 与 $T\\ge3.0$ 的链训练和验证，中间温度全部进测试集，这才是外推检验。",
    "",
    "## 采样器与细致平衡",
    "- **棋盘 Metropolis.** 单点翻转以 $\\min\\{1,e^{-\\beta\\Delta E}\\}$ 接受，$\\Delta E=2\\sigma_ih_i$，$h_i=\\sum_{j\\sim i}\\sigma_j$。对称提议加这个接受率满足细致平衡 $\\pi(x)P(x,y)=\\pi(y)P(y,x)$（两边都等于 $q(x,y)\\min\\{\\pi(x),\\pi(y)\\}$），从而 $\\pi P=\\pi$。$L$ 为偶数时同色格点之间没有键，“同时”更新一种颜色就是若干个可交换单点核的复合，每个都保持 $\\pi$。",
    "- **Swendsen–Wang.** 令 $p=1-e^{-2\\beta}$，Edwards–Sokal 联合测度 $\\nu(\\sigma,\\omega)\\propto\\prod_{\\langle ij\\rangle}\\big[(1-p)\\mathbf 1_{\\omega_{ij}=0}+p\\,\\mathbf 1_{\\omega_{ij}=1}\\mathbf 1_{\\sigma_i=\\sigma_j}\\big]$ 的 $\\sigma$-边缘就是伊辛测度（每条边的因子是 $e^{-\\beta}e^{\\beta\\sigma_i\\sigma_j}$）。SW 交替地 (i) 给定 $\\sigma$ 以概率 $p$ 连接同号邻居，(ii) 给定键把每个团簇独立地以 $\\tfrac12$ 翻转：这是 $\\nu$ 上的分块 Gibbs 采样，所以保持伊辛测度。",
    "- **Wolff.** 只长随机种子所在的团簇 $C$ 并翻转。从 $\\sigma$ 长出 $C$ 与从翻转后的 $\\sigma'$ 长出同一个 $C$ 的概率之比为 $(1-p)^{n_s-n_u}=e^{-2\\beta(n_s-n_u)}=\\pi(\\sigma')/\\pi(\\sigma)$，$n_s,n_u$ 是 $C$ 边界上满足 / 不满足的键数。一个细节：每步翻几个团簇不能取决于当前状态（例如“翻到累计 $N$ 个格点为止”）——那样停下的时刻是一个停时，停下时的状态不再服从 Gibbs 分布。这里热化时估计平均团簇大小 $\\langle\\lvert C\\rvert\\rangle$，之后每步固定翻 $\\operatorname{round}(N/\\langle\\lvert C\\rvert\\rangle)$ 个团簇。",
    "- 局部更新在 $T_c$ 附近临界慢化：自相关时间 $\\tau\\propto L^z$，Metropolis 的 $z\\approx2.17$，SW / Wolff 的 $z\\approx0.25$。默认每一步 = 一次 SW 扫描 + 一次 Metropolis 扫描，热化 60 步，样本间隔 3 步。选“只用 Metropolis”可以看到样本相关、低温卡在条纹态的样子。",
    "",
    "**划分必须按链.** 同一条马尔可夫链上的样本彼此相关，`groups` 是链编号，划分整组进行；随机划分会让测试准确率虚高。",
    "",
    "## 参考文献",
    "1. R. Peierls, On Ising's model of ferromagnetism, *Proc. Cambridge Philos. Soc.* 32, 477 (1936).",
    "2. H. A. Kramers, G. H. Wannier, Statistics of the two-dimensional ferromagnet, *Phys. Rev.* 60, 252 (1941).",
    "3. L. Onsager, Crystal statistics I, *Phys. Rev.* 65, 117 (1944)；B. Kaufman, Crystal statistics II, *Phys. Rev.* 76, 1232 (1949)。",
    "4. C. N. Yang, The spontaneous magnetization of a two-dimensional Ising model, *Phys. Rev.* 85, 808 (1952).",
    "5. R. H. Swendsen, J.-S. Wang, *Phys. Rev. Lett.* 58, 86 (1987)；R. G. Edwards, A. D. Sokal, *Phys. Rev. D* 38, 2009 (1988)；U. Wolff, *Phys. Rev. Lett.* 62, 361 (1989)。",
    "6. J. Carrasquilla, R. G. Melko, Machine learning phases of matter, *Nature Physics* 13, 431 (2017)."
  ].join("\n")
});

/* ================================================================== *
 *  三、UCI 手写数字 8×8
 * ================================================================== */
/* 数据：scikit-learn 1.x 自带的 datasets/data/digits.csv.gz（即 UCI optdigits 的测试集 optdigits.tes，1797 张）。
 * 编码：64 个像素位置各有一张典范 Huffman 码表（17 个符号 0..16 的码长，"." 表示该位置没出现过这个值），
 * 按样本、按行展开依次写码字，比特流用 base64 存。解码后用总和与滚动哈希自检。 */
var DIGITS = { n: 1797, sum: 561718, hash: 155520075,
  lens: [
    "0................123456878........24444444544555656566776665544334326666665555544333223444555455555554134455556766676661336656666565666.",
    "122..............134445555666798aa45555555555444432777755554544443325656455544444444225554555555544443134545655666677661344645655566....",
    "122..............1444445556666678835555555555444442244454555455555532445555555455445325565655455444443144445455676677761343445.5........",
    "11...............1444445546667989.355555555554444423555555545544544235665555555544432245545554555455431445545545566677.11...............",
    "0................144544554656677..24555555455544543265655555555554423566665545554443225555555554544443144454554556788..0................",
    "12344............1344445657877888725555666565544542245555555555444432455555545555444326565555455444443145455554565566771245454..........",
    "12.3....3........133444677777.9.98255555554454444444555454444444444345554455455544442256555655544444431454555555655666513344466777..7...",
    "11...............1234568888.......244444445555545555776666655444333246666665555543332245455554555455431345555565666677513556556556557755"
  ].join(""),
  labels: [
    "012345678901234567890123456789095565098984177351002278201263373346664915095282001763217463139176843140536961754472822579",
    "548849089801234567890123456789012345678909556509898417735100227820126337334666491509528200176321731391768431405369617544",
    "728225548849089801234567890123456789012345678909556509898417735100227820126337334666491509528200176321746313917684314053",
    "696175447282257954884908930123456789012345678901234567890955650989841773510022782012633733466649150952820017632174631391",
    "768431405369617544728225795488490898012345678901234567890123456789095565098984177351002278201263373346664915095282001763",
    "217463139176843140536961754472822579548849089801234567890123456789012345678909556509898417735100227820126337334666491509",
    "528200176321746313917684314053696175447282257954884908980123456789012345678901234567890955650989841773510022782012633733",
    "466649150952820017632174631391768431405369617544728225795488490898123456789012345678901234567890955650989841773512782012",
    "633733466649150952820017632146313917684314053696175447282257954490898012345678901234567890123456789095565098984177351007",
    "820126337334666491509528200176321746313917684314053696175447282257954884908980123456789012345678901234567890955650989841",
    "773510022782012633733466649150952820017632174631391768431405369617544728225795488490898012345678901234567890123456789095",
    "565098984177351002278201263373346664915095282001763217463139176843140536961754472822579548849080123456789012345678901234",
    "567890955650989841773510022782012633733466649150952820017632174631391768431405369617544728225795488490898012345678901234",
    "569012345678909556509898417735100227820126337334666491509528017632174631391768431405369617544722579544908980123456789012",
    "345678901234567890955650989841773510022782012633733466649150952820017632174631391768431405369617544728225795488490898"
  ].join(""),
  bits: [
    "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"
  ].join("") };
var digitsCache = null;
function decodeDigits() {
  if (digitsCache) return digitsCache;
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", val = {}, i, j;
  for (i = 0; i < 64; i++) val[B64.charAt(i)] = i;
  // 每个位置的典范码：按 (码长, 符号) 排序；解码时逐位读，维护"当前长度下的首码字与首下标"
  var tabs = [];
  for (j = 0; j < 64; j++) {
    var syms = [], only = -1;
    for (var v = 0; v < 17; v++) { var ch = DIGITS.lens.charAt(j * 17 + v); if (ch === ".") continue; var len = parseInt(ch, 36); if (len === 0) only = v; else syms.push([len, v]); }
    syms.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var maxLen = syms.length ? syms[syms.length - 1][0] : 0, count = new Int32Array(maxLen + 1);
    syms.forEach(function (s) { count[s[0]]++; });
    tabs.push({ only: only, count: count, sym: syms.map(function (s) { return s[1]; }), maxLen: maxLen });
  }
  var bits = DIGITS.bits, pos = 0, cur = 0, left = 0, n = DIGITS.n;
  function bit() { if (!left) { cur = val[bits.charAt(pos++)]; left = 6; } left--; return (cur >> left) & 1; }
  var X = new Uint8Array(n * 64);
  for (i = 0; i < n; i++) for (j = 0; j < 64; j++) {
    var tb = tabs[j];
    if (tb.only >= 0) { X[i * 64 + j] = tb.only; continue; }
    var code = 0, first = 0, index = 0;
    for (var l = 1; l <= tb.maxLen; l++) {
      code = code | bit(); var c = tb.count[l];
      if (code - first < c) { X[i * 64 + j] = tb.sym[index + code - first]; break; }
      index += c; first = (first + c) << 1; code <<= 1;
    }
  }
  var s = 0, h = 0; for (i = 0; i < X.length; i++) { s += X[i]; h = (h * 31 + X[i] + 1) % 2147483647; }
  if (s !== DIGITS.sum || h !== DIGITS.hash) throw new Error("内嵌的手写数字数据解码校验失败。");
  var y = new Int32Array(n); for (i = 0; i < n; i++) y[i] = DIGITS.labels.charCodeAt(i) - 48;
  digitsCache = { X: X, y: y, n: n };
  return digitsCache;
}
reg.add({
  id: "digits", family: "image", kind: "classification", plot: "images",
  name: "手写数字 8×8（UCI）", summary: "1797 张 8×8 手写数字（像素 0–16），10 类；UCI 光学识别数据集的测试部分。",
  params: [ { key: "scale", label: "像素尺度", def: "unit", type: "select", options: [["unit", "除以 16（0–1）"], ["raw", "原始计数 0–16"]] } ],
  split: { train: 0.6, valid: 0.2, test: 0.2, by: "stratified" },
  gen: function (p) {
    var D = decodeDigits(), f = str(p, "scale", "unit") === "raw" ? 1 : 1 / 16, X = new Float64Array(D.n * 64);
    for (var i = 0; i < X.length; i++) X[i] = D.X[i] * f;
    return { X: X, y: new Int32Array(D.y), n: D.n, d: 64, classes: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], shape: [8, 8],
      meta: { source: "UCI optdigits（测试集 optdigits.tes）", writers: 13, scale: f === 1 ? "raw" : "unit" } };
  },
  source: { name: "UCI Machine Learning Repository：Optical Recognition of Handwritten Digits", url: "https://archive.ics.uci.edu/dataset/80/optical+recognition+of+handwritten+digits", license: "CC BY 4.0",
    cite: "E. Alpaydin, C. Kaynak (1998). Optical Recognition of Handwritten Digits [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C50P49" },
  docs: [
    "UCI“手写数字光学识别”数据集的测试部分（scikit-learn 自带的 `load_digits` 就是这一份）：1797 张 $8\\times8$ 灰度图，10 类，每类 174–183 张。",
    "",
    "**怎么来的.** NIST 的预处理程序从预印表格里提取规范化的 $32\\times32$ 二值位图，再分成 $4\\times4$ 的不重叠小块，数每块里亮像素的个数，得到 $8\\times8$、取值 $0$–$16$ 的整数矩阵。这一步降低维数，也让图像对小的形变不敏感。原始数据共 43 位书写者：30 人的字进训练集（3823 张），另外 13 人的字进测试集（1797 张）。这里只有后者。",
    "",
    "**要注意.** 这 1797 张只来自 13 个人，又没有书写者编号，随机划分时同一个人的字会同时落在训练集和测试集里。测试准确率衡量的是“见过这个人的笔迹之后”的泛化，比换一批人要乐观。",
    "",
    "**适合什么.** 小而干净的多分类基准：$k$ 近邻、逻辑回归、核方法、小 MLP、小 CNN 在随机划分下都能到九成以上，可以拿来比较模型、校准和显著性检验。图像已经居中、归一化过，所以卷积的平移偏置在这里帮助有限；想看平移不变性的作用，去用“形状识别”。",
    "",
    "**参数.** “像素尺度”：除以 16（落在 $[0,1]$）或保持原始计数 $0$–$16$。数据本身是固定的，种子只影响划分。",
    "",
    "**内嵌方式.** 64 个像素位置各用一张典范 Huffman 码表压缩，解码后用总和与滚动哈希自检（与 scikit-learn 的文件逐位一致）。",
    "",
    "## 出处",
    "- E. Alpaydin, C. Kaynak, *Optical Recognition of Handwritten Digits* [数据集], UCI Machine Learning Repository (1998), doi:10.24432/C50P49。许可：CC BY 4.0。",
    "- C. Kaynak, *Methods of Combining Multiple Classifiers and Their Applications to Handwritten Digit Recognition*, 硕士论文, Boğaziçi University (1995)；E. Alpaydin, C. Kaynak, Cascading classifiers, *Kybernetika* 34 (1998)。"
  ].join("\n")
});

/* ================================================================== *
 *  四、形状 16×16
 * ================================================================== */
var SHAPE_NAMES = ["圆", "正方形", "三角形", "十字", "五角星", "L 形"];
var STAR = (function () { var v = []; for (var q = 0; q < 10; q++) { var a = -Math.PI / 2 + q * Math.PI / 5, r = q & 1 ? 0.42 : 1; v.push([r * Math.cos(a), r * Math.sin(a)]); } return v; })();
function inPoly(u, v, P) { var inside = false; for (var a = 0, b = P.length - 1; a < P.length; b = a++) { var xa = P[a][0], ya = P[a][1], xb = P[b][0], yb = P[b][1]; if ((ya > v) !== (yb > v) && u < (xb - xa) * (v - ya) / (yb - ya) + xa) inside = !inside; } return inside; }
/** 单位尺寸（外接半径约 1）的形状，坐标 (u, v)，v 向下 */
function inShape(k, u, v) {
  switch (k) {
    case 0: return u * u + v * v <= 1;
    case 1: return Math.abs(u) <= 0.8 && Math.abs(v) <= 0.8;
    case 2: // 等边三角形，外接半径 1（内切半径 1/2），一个顶点朝上
      return v <= 0.5 && 0.8660254 * u - 0.5 * v <= 0.5 && -0.8660254 * u - 0.5 * v <= 0.5;
    case 3: return (Math.abs(u) <= 1 && Math.abs(v) <= 0.3) || (Math.abs(u) <= 0.3 && Math.abs(v) <= 1);
    case 4: return inPoly(u, v, STAR);
    default: return (u >= -0.7 && u <= -0.15 && v >= -0.9 && v <= 0.9) || (u >= -0.7 && u <= 0.75 && v >= 0.35 && v <= 0.9);
  }
}
var ERODE = (function () { var o = []; for (var q = 0; q < 8; q++) o.push([Math.cos(q * Math.PI / 4), Math.sin(q * Math.PI / 4)]); return o; })();
/** 画一张 S×S 的图。g：{k, cx, cy, r, th, stroke, fg, bg}；2×2 子像素采样；空心 = 形状减去它的（8 方向近似）腐蚀 */
function drawShape(img, off, S, g) {
  var c = Math.cos(g.th), s = Math.sin(g.th), w = 1.3 / g.r;
  for (var py = 0; py < S; py++) for (var px = 0; px < S; px++) {
    var cov = 0;
    for (var sy = 0; sy < 2; sy++) for (var sx = 0; sx < 2; sx++) {
      var x = px + 0.25 + 0.5 * sx - g.cx, y = py + 0.25 + 0.5 * sy - g.cy;
      var u = (c * x + s * y) / g.r, v = (-s * x + c * y) / g.r;
      if (!inShape(g.k, u, v)) continue;
      if (g.stroke) { var edge = false; for (var q = 0; q < 8 && !edge; q++) if (!inShape(g.k, u + w * ERODE[q][0], v + w * ERODE[q][1])) edge = true; if (!edge) continue; }
      cov += 0.25;
    }
    img[off + py * S + px] = g.bg + (g.fg - g.bg) * cov;
  }
}
reg.add({
  id: "shapes", family: "image", kind: "classification", plot: "images",
  name: "形状识别 16×16", summary: "程序生成的 16×16 灰度形状图：随机位置、大小、旋转、实心或空心，加像素噪声。",
  params: [
    { key: "k", label: "类别数", def: 4, min: 2, max: 6, step: 1, type: "int", desc: "依次取 圆、正方形、三角形、十字、五角星、L 形" },
    { key: "n", label: "样本数", def: 1200, min: 200, max: 6000, step: 100, type: "int" },
    { key: "shift", label: "平移范围（像素）", def: 3, min: 0, max: 5, step: 0.5, type: "num", desc: "中心偏移在 [−s, s]² 内均匀" },
    { key: "scale", label: "随机大小", def: true, type: "bool", desc: "半径在 3.5–5.5 像素之间；关掉则固定 4.5" },
    { key: "rotate", label: "随机旋转", def: true, type: "bool" },
    { key: "style", label: "画法", def: "mixed", type: "select", options: [["mixed", "实心与空心各半"], ["fill", "全部实心"], ["stroke", "全部空心（描边）"]] },
    { key: "noise", label: "像素噪声 σ", def: 0.15, min: 0, max: 0.6, step: 0.01, type: "num" },
    { key: "ood", label: "测试集换位置", def: false, type: "bool", desc: "训练 / 验证集的中心只在 [−1, 1]² 内，测试集的中心离正中至少 2 像素" }
  ],
  split: { train: 0.6, valid: 0.2, test: 0.2, by: "stratified" },
  gen: function (p, rng) {
    var S = 16, d = S * S, k = clampI(num(p, "k", 4), 2, 6), n = clampI(num(p, "n", 1200), 20, 20000), shift = clamp(num(p, "shift", 3), 0, 6);
    var scl = bool(p, "scale", true), rot = bool(p, "rotate", true), style = str(p, "style", "mixed"), sig = clamp(num(p, "noise", 0.15), 0, 2), ood = bool(p, "ood", false);
    var X = new Float64Array(n * d), y = new Int32Array(n), DX = new Float64Array(n), DY = new Float64Array(n), R = new Float64Array(n), TH = new Float64Array(n), ST = new Uint8Array(n);
    var nIn = ood ? Math.round(n * 0.8) : n, Sout = Math.max(shift, 3);
    for (var i = 0; i < n; i++) {
      var dx, dy;
      if (!ood) { dx = rng.uniform(-shift, shift); dy = rng.uniform(-shift, shift); }
      else if (i < nIn) { dx = rng.uniform(-1, 1); dy = rng.uniform(-1, 1); }
      else { do { dx = rng.uniform(-Sout, Sout); dy = rng.uniform(-Sout, Sout); } while (Math.max(Math.abs(dx), Math.abs(dy)) < 2); }
      var g = { k: i % k, cx: S / 2 + dx, cy: S / 2 + dy, r: scl ? rng.uniform(3.5, 5.5) : 4.5, th: rot ? rng.uniform(0, 2 * Math.PI) : 0,
        stroke: style === "stroke" ? true : style === "fill" ? false : rng.u() < 0.5, fg: rng.uniform(0.6, 1), bg: rng.uniform(0, 0.2) };
      drawShape(X, i * d, S, g);
      for (var j = 0; j < d; j++) { var o = i * d + j; X[o] = clamp(X[o] + (sig > 0 ? sig * rng.normal() : 0), 0, 1); }
      y[i] = g.k; DX[i] = dx; DY[i] = dy; R[i] = g.r; TH[i] = g.th; ST[i] = g.stroke ? 1 : 0;
    }
    var data = { X: X, y: y, n: n, d: d, classes: SHAPE_NAMES.slice(0, k), shape: [S, S], meta: { dx: DX, dy: DY, r: R, theta: TH, stroke: ST, ood: ood } };
    if (ood) {
      // 前 80%（中心在 [−1,1]² 内）按 3:1 随机分训练 / 验证；后 20%（中心离正中 ≥ 2 像素）是测试集
      var idx = []; for (i = 0; i < nIn; i++) idx.push(i); shuffle(idx, rng);
      var nTr = Math.round(nIn * 0.75), te = []; for (i = nIn; i < n; i++) te.push(i);
      data.splitIdx = { train: Int32Array.from(idx.slice(0, nTr)), valid: Int32Array.from(idx.slice(nTr)), test: Int32Array.from(te) };
    }
    return data;
  },
  bayes: function () { return { metric: "acc", value: null, note: "没有闭式。噪声小时接近 1；噪声大、半径小时圆与五角星、正方形与十字的边缘会混淆。" }; },
  docs: [
    "程序生成的 $16\\times16$ 灰度图，共 $k$ 类形状（依次取 圆、正方形、三角形、十字、五角星、L 形），类别轮流出现，所以各类样本数相同。每张图独立随机：中心偏移 $(\\Delta x,\\Delta y)$ 在 $[-s,s]^2$ 上均匀，半径 $r\\in[3.5,5.5]$ 像素，旋转角在 $[0,2\\pi)$ 上均匀（可关），实心或空心（描边约 1.3 像素），前景亮度 $\\in[0.6,1]$、背景亮度 $\\in[0,0.2]$；用 $2\\times2$ 子像素采样抗锯齿，最后加独立的高斯噪声 $N(0,\\sigma^2)$ 并截到 $[0,1]$。`meta` 里记着每张图的 `dx`、`dy`、`r`、`theta`、`stroke`。",
    "",
    "## 卷积为什么给出（近似的）平移不变性",
    "设 $G=\\mathbb Z/H\\times\\mathbb Z/W$ 以循环平移作用在特征图 $x:\\mathbb Z/H\\times\\mathbb Z/W\\to\\mathbb R^C$ 上：$(\\tau_ax)(i)=x(i-a)$。",
    "",
    "**命题.** (i) 循环卷积 $(k*x)(i)=\\sum_jk(j)\\,x(i-j)$（加常数偏置）满足 $k*(\\tau_ax)=\\tau_a(k*x)$；逐点非线性也与 $\\tau_a$ 交换；所以任意多层“循环卷积 + 逐点非线性”的复合 $\\Phi$ 是 $G$-等变的。(ii) 全局平均池化 $A(x)=\\frac1{HW}\\sum_ix(i)$ 满足 $A(\\tau_ax)=A(x)$。因此 $f=h\\circ A\\circ\\Phi$ 对一切 $a\\in G$ 都有 $f(\\tau_ax)=f(x)$：**对循环平移精确不变**。",
    "",
    "**证明.** (i) $(k*\\tau_ax)(i)=\\sum_jk(j)\\,x(i-j-a)=(k*x)(i-a)=\\tau_a(k*x)(i)$；逐点映射显然交换；等变映射的复合仍等变。(ii) 对 $i$ 求和时作代换 $i\\mapsto i+a$。$\\square$",
    "反过来，与所有平移交换的线性映射一定是卷积（推广到紧群见 Kondor–Trivedi 2018）。",
    "",
    "**哪里会坏.**",
    "- **边界.** 零填充（“same”）时 (i) 只在感受野碰不到边界的位置成立，物体靠近边缘时输出会变。本数据集的平移是真正的平移（图外是背景，不绕回）：只要物体连同它周围一圈感受野都在图内，无噪声图像的平移就等于循环平移，上面的命题适用；噪声是独立同分布的，分布也不变。",
    "- **步长与下采样.** 步长 2 的池化只对子群 $2\\mathbb Z\\times2\\mathbb Z$ 等变，奇数像素的平移会因为混叠改变输出（Azulay–Weiss 2019；Zhang 2019）。所以真实 CNN 只是“近似”平移不变。",
    "- **全连接网络（MLP）没有这个约束**，平移不变性只能从数据里学。打开“测试集换位置”：训练 / 验证集的中心只在 $[-1,1]^2$ 内，测试集的中心满足 $\\max(\\lvert\\Delta x\\rvert,\\lvert\\Delta y\\rvert)\\ge2$。这时 MLP 通常明显掉点，带全局池化的 CNN 掉得少。",
    "",
    "旋转同理：要对 $90^\\circ$ 旋转精确不变，可以用群卷积（Cohen–Welling 2016）把 $G$ 换成 $\\mathbb Z^2\\rtimes C_4$；本数据集的旋转是连续的，普通 CNN 只能从数据里学到近似的旋转不变。注意正方形、十字有 $C_4$ 对称，三角形 $C_3$，五角星 $C_5$，圆 $SO(2)$：旋转对它们的“难度”不同。",
    "",
    "**贝叶斯最优**没有闭式；噪声小时接近 1，噪声大、半径小时圆与五角星、正方形与十字的边缘会混淆。",
    "",
    "## 参考文献",
    "1. T. Cohen, M. Welling, Group equivariant convolutional networks, *ICML* (2016).",
    "2. R. Kondor, S. Trivedi, On the generalization of equivariance and convolution in neural networks to the action of compact groups, *ICML* (2018).",
    "3. A. Azulay, Y. Weiss, Why do deep convolutional networks generalize so poorly to small image transformations? *JMLR* 20 (2019).",
    "4. R. Zhang, Making convolutional networks shift-invariant again, *ICML* (2019)."
  ].join("\n")
});

/* ================================================================== *
 *  五、座逾渗
 * ================================================================== */
var PC_SITE = 0.59274605079210;   // Jacobsen 2015；Newman–Ziff 2000 给 0.59274621(13)
/** 开放格点（grid[i] > 0.5）之间按上下左右连通，是否有一条路从第一行连到最后一行（自由边界）。seen、stack 可复用 */
function spans(grid, L, off, seen, stack) {
  off = off || 0; var N = L * L, top = 0, i;
  seen = seen || new Uint8Array(N); stack = stack || new Int32Array(N);
  for (i = 0; i < N; i++) seen[i] = 0;
  for (i = 0; i < L; i++) if (grid[off + i] > 0.5) { seen[i] = 1; stack[top++] = i; }
  while (top > 0) {
    var s = stack[--top], r = (s / L) | 0, c = s - r * L;
    if (r === L - 1) return true;
    if (c + 1 < L && !seen[s + 1] && grid[off + s + 1] > 0.5) { seen[s + 1] = 1; stack[top++] = s + 1; }
    if (c > 0 && !seen[s - 1] && grid[off + s - 1] > 0.5) { seen[s - 1] = 1; stack[top++] = s - 1; }
    if (!seen[s + L] && grid[off + s + L] > 0.5) { seen[s + L] = 1; stack[top++] = s + L; }
    if (r > 0 && !seen[s - L] && grid[off + s - L] > 0.5) { seen[s - L] = 1; stack[top++] = s - L; }
  }
  return false;
}
reg.add({
  id: "percolation", family: "image", kind: "classification", plot: "lattice",
  name: "逾渗：上下连通吗", summary: "方格座逾渗，p 取在临界点 p_c ≈ 0.5927 附近；标签是有没有一条开放路径从顶连到底。",
  params: [
    { key: "L", label: "边长 L", def: "16", type: "select", options: [["8", "8 × 8"], ["12", "12 × 12"], ["16", "16 × 16"], ["24", "24 × 24"], ["32", "32 × 32"]] },
    { key: "n", label: "样本数", def: 1000, min: 200, max: 6000, step: 100, type: "int" },
    { key: "w", label: "p 的半宽", def: 0.08, min: 0, max: 0.3, step: 0.01, type: "num", desc: "每个样本的 p 在 [p_c − w, p_c + w] 上均匀" },
    { key: "balance", label: "类别平衡", def: true, type: "bool", desc: "拒绝抽样，使连通与不连通各占一半" }
  ],
  split: { train: 0.6, valid: 0.2, test: 0.2, by: "stratified" },
  gen: function (p, rng) {
    var L = clampI(num(p, "L", 16), 4, 64), N = L * L, n = clampI(num(p, "n", 1000), 20, 20000), w = clamp(num(p, "w", 0.08), 0, 0.4), bal = bool(p, "balance", true);
    var X = new Float64Array(n * N), y = new Int32Array(n), P = new Float64Array(n), dens = new Float64Array(n), buf = new Float64Array(N), seen = new Uint8Array(N), stack = new Int32Array(N);
    var need = [Math.floor(n / 2), n - Math.floor(n / 2)], got = 0, tries = 0, maxTries = 60 * n;
    while (got < n) {
      var pp = clamp(PC_SITE + w * (2 * rng.u() - 1), 0, 1), cnt = 0;
      for (var i = 0; i < N; i++) { buf[i] = rng.u() < pp ? 1 : 0; cnt += buf[i]; }
      var lab = spans(buf, L, 0, seen, stack) ? 1 : 0;
      tries++;
      if (bal && need[lab] <= 0 && tries < maxTries) continue;   // 这一类已满：丢掉（试太多次就不再强求平衡）
      need[lab]--; X.set(buf, got * N); y[got] = lab; P[got] = pp; dens[got] = cnt / N; got++;
    }
    return { X: X, y: y, n: n, d: N, classes: ["不连通", "上下连通"], shape: [L, L], meta: { p: P, density: dens, pc: PC_SITE, L: L, w: w, tries: tries } };
  },
  oracle: function (p) {
    var L = clampI(num(p, "L", 16), 4, 64), N = L * L, seen = new Uint8Array(N), stack = new Int32Array(N);
    return { predict: function (x) { return spans(x, L, 0, seen, stack) ? [0, 1] : [1, 0]; }, note: "标签是输入的确定函数：一次广度优先搜索就给出正确答案，贝叶斯最优准确率 = 1。" };
  },
  bayes: function () { return { metric: "acc", value: 1, note: "标签是构型的确定函数（有没有开放的上下路径），所以贝叶斯最优准确率恰好是 1；难点全在函数类。" }; },
  docs: [
    "$L\\times L$ 方格上的**座逾渗**：每个格点独立地以概率 $p$ 开放（像素 1），否则关闭（像素 0）。标签 $y=1$ 当且仅当存在一条只经过开放格点、每步上下左右走一格的路径，从第一行连到最后一行（自由边界，不绕回）。每个样本的 $p$ 在 $[p_c-w,p_c+w]$ 上均匀抽取；打开“类别平衡”时用拒绝抽样让两类各占一半（每一类内部仍是该类的条件分布）。`meta` 里有每个样本的 `p` 与开放密度 `density`。",
    "",
    "## 临界点",
    "$\\mathbb Z^2$ 上存在无穷开放团簇的概率在 $p<p_c$ 时为 0，在 $p>p_c$ 时为 1。座逾渗的 $p_c$ 没有已知的闭式，数值结果为 $p_c=0.59274621(13)$（Newman–Ziff 2000），更精确的是 $0.59274605079210(2)$（Jacobsen 2015）。（键逾渗的 $p_c=\\tfrac12$ 是 Kesten 1980 的定理。）有限 $L$ 上的连通概率 $R_L(p)$ 从 0 光滑地升到 1，过渡区宽度 $\\sim L^{-1/\\nu}$，$\\nu=4/3$；在 $p_c$ 处正方形的上下连通概率趋于 $\\tfrac12$（Cardy 公式）。这两条在三角格子座逾渗上已被证明（Smirnov 2001；Smirnov–Werner 2001），在方格子上是普适性猜想。所以 $p$ 取在 $p_c$ 附近时两类大致平衡。",
    "",
    "**对偶.** 在 $L\\times L$ 方格上，“开放格点的上下连通（4-邻接）”与“关闭格点的左右连通（8-邻接，即允许走对角）”恰有一个发生。",
    "",
    "## 标签是非局部的",
    "标签是 $X$ 的确定函数，所以贝叶斯最优准确率恰好是 1（oracle 就是一次广度优先搜索）。难的是函数类。",
    "",
    "**命题（剪切—交换）.** 设模型形如 $f(\\sigma)=h\\big(\\{\\!\\{g_x(\\sigma|_{x+B}):x\\in\\Lambda\\}\\!\\}\\big)$：$B=[-\\rho,\\rho]^2$ 是 $r\\times r$ 窗口（$r=2\\rho+1$，窗口出界的部分当作关闭），$h$ 是多重集的任意函数，$g_x$ 只在 $x$ 离边界不到 $\\rho$ 时才依赖位置 $x$。带零填充、总感受野为 $r$ 的任意 CNN，后面接全局平均 / 求和 / 最大池化和任意输出头，都是这种形式。若 $r\\ge3$ 且 $L\\ge3r$，则存在连通的 $\\sigma$ 与不连通的 $\\sigma'$，使 $f(\\sigma)=f(\\sigma')$ 对一切这样的 $g,h$ 成立。",
    "",
    "**证明.** 取两列 $a=2\\rho$，$b=4\\rho+1$，以及行号 $h_1=1$，$m=2\\rho+1$，$h_2=4\\rho+1\\le L-2$。$\\sigma$：第 $a$ 列整列开放，第 $b$ 列第 $h_1$ 到 $h_2$ 行开放，其余关闭——第 $a$ 列连通上下。$\\sigma'$：把两列在第 $m$ 行以下的部分互换——第 $a$ 列为第 $0$ 到 $h_2$ 行，第 $b$ 列为第 $h_1$ 到 $L-1$ 行；两段都碰不到对边，又相隔两列以上，所以不连通。中心行号 $>m+\\rho$、中心列离 $a$ 或 $b$ 不超过 $\\rho$ 的窗口，按水平平移 $\\pm(b-a)$ 互相配对，其余窗口原地配对。逐一核对：中心行号 $<m-\\rho$ 的窗口只看到第 $m$ 行以上，两种构型相同；中心行号在 $m\\pm\\rho$ 内的窗口看到第 $m-2\\rho$ 到 $m+2\\rho$ 行，两列在两种构型里都开放；中心行号 $>m+\\rho$ 的窗口只看到第 $m$ 行以下，正好是互换的部分。配对的窗口位置都离左右边界至少 $\\rho$，所以 $g_x$ 相同。于是两个多重集相等。$\\square$",
    "",
    "这是 Minsky–Papert（1969）“有限直径的感知机算不出连通性”的格点版。感受野必须随 $L$ 增长；即使深度足够，“洪水填充”式的判定也要沿开放路径一步步传递信息，而临界团簇上的最短路径长度 $\\sim L^{d_{\\min}}$，$d_{\\min}\\approx1.13$。局部统计（比如开放密度，它和 $p$ 强相关）只能给出部分答案，可以拿“只看密度”的阈值基线比一比。",
    "",
    "## 参考文献",
    "1. M. E. J. Newman, R. M. Ziff, Efficient Monte Carlo algorithm and high-precision results for percolation, *Phys. Rev. Lett.* 85, 4104 (2000).",
    "2. J. L. Jacobsen, Critical points of Potts and O(N) models from eigenvalue identities in periodic Temperley–Lieb algebras, *J. Phys. A* 48 (2015), arXiv:1507.03027.",
    "3. H. Kesten, The critical probability of bond percolation on the square lattice equals 1/2, *Comm. Math. Phys.* 74, 41 (1980).",
    "4. S. Smirnov, Critical percolation in the plane, *C. R. Acad. Sci. Paris* 333, 239 (2001)；S. Smirnov, W. Werner, Critical exponents for two-dimensional percolation, *Math. Res. Lett.* 8, 729 (2001)。",
    "5. M. Minsky, S. Papert, *Perceptrons*, MIT Press (1969)."
  ].join("\n")
});

/* ---------- 给页面与测试用的工具 ---------- */
QL.mlimage = {
  Tc: TC, Kc: KC, pcSite: PC_SITE, shapeNames: SHAPE_NAMES.slice(),
  yang: yang, tinf: tinf, onsagerEnergy: onsagerEnergy, ellipK: ellipK, kaufmanLogZ: kaufmanLogZ, kaufmanEnergy: kaufmanEnergy,
  isingTemps: function (p) { return isingTemps(isingParams(p || {})); },
  /** 在一个温度下采样：opts = { chains, perChain, therm, gap, sampler }；返回 { X: Int8Array(n·L²), m, e, chain } */
  isingSample: function (L, T, opts, rng) { opts = opts || {}; return isingSample(L, T, { chains: opts.chains || 1, perChain: opts.perChain || 1, therm: opts.therm == null ? 60 : opts.therm, gap: opts.gap || 3, sampler: opts.sampler || "sw" }, rng); },
  spans: function (grid, L) { return spans(grid, L, 0); },
  crossover: crossover
};
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLDATA_IMAGE;
