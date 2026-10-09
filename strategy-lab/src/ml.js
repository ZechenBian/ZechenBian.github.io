// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 模型库
 * 经典的建模方法，全部自己实现、不依赖外部库，跑在后台线程里。
 * 约定：数据集 ds = {X: Float64Array(n×d，按行), y: Float64Array(n), n, d}；
 *       每个模型返回一个带 predict(x) 的对象，x 是长度为 d 的数组。 */
function QL_ML_INSTALL(QL) {
"use strict";
var ml = {};

/* ---------- 基础 ---------- */
function mean(a, n) { var s = 0; n = n == null ? a.length : n; for (var i = 0; i < n; i++) s += a[i]; return n ? s / n : NaN; }
function variance(a, n) { n = n == null ? a.length : n; var m = mean(a, n), s = 0; for (var i = 0; i < n; i++) { var d = a[i] - m; s += d * d; } return n ? s / n : NaN; }
ml.mean = mean; ml.variance = variance;
/** 解对称正定方程组 A x = b（Cholesky），A 为 d×d 的 Float64Array，会被改写 */
function cholSolve(A, b, d) {
  var i, j, k, s;
  for (j = 0; j < d; j++) {
    s = A[j * d + j]; for (k = 0; k < j; k++) s -= A[j * d + k] * A[j * d + k];
    if (!(s > 1e-300)) s = 1e-12;
    var L = Math.sqrt(s); A[j * d + j] = L;
    for (i = j + 1; i < d; i++) { s = A[i * d + j]; for (k = 0; k < j; k++) s -= A[i * d + k] * A[j * d + k]; A[i * d + j] = s / L; }
  }
  var y = new Float64Array(d), x = new Float64Array(d);
  for (i = 0; i < d; i++) { s = b[i]; for (k = 0; k < i; k++) s -= A[i * d + k] * y[k]; y[i] = s / A[i * d + i]; }
  for (i = d - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < d; k++) s -= A[k * d + i] * x[k]; x[i] = s / A[i * d + i]; }
  return x;
}
ml.cholSolve = cholSolve;

/** 每个特征的均值和标准差 */
function scaler(ds) {
  var n = ds.n, d = ds.d, X = ds.X, mu = new Float64Array(d), sd = new Float64Array(d), i, j;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) mu[j] += X[i * d + j];
  for (j = 0; j < d; j++) mu[j] /= n || 1;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { var v = X[i * d + j] - mu[j]; sd[j] += v * v; }
  for (j = 0; j < d; j++) { sd[j] = Math.sqrt(sd[j] / (n || 1)); if (!(sd[j] > 1e-300)) sd[j] = 1; }
  return { mean: mu, sd: sd };
}
function scaled(ds, sc) {
  var n = ds.n, d = ds.d, Z = new Float64Array(n * d);
  for (var i = 0; i < n; i++) for (var j = 0; j < d; j++) Z[i * d + j] = (ds.X[i * d + j] - sc.mean[j]) / sc.sd[j];
  return Z;
}
ml.scaler = scaler;

/** 从训练路径里取样本。feat(s) 返回特征数组；目标默认是下一步的收益。
 *  opt: {h 预测步长, maxRows 样本上限, warmup 每条路径跳过的步数, from/to 路径范围, t0/t1 时刻范围, target(D, n, t)} */
ml.dataset = function (D, feat, opt) {
  opt = opt || {};
  var h = opt.h || 1, warm = opt.warmup || 0, maxRows = Math.max(1, opt.maxRows || 20000), n0 = Math.max(0, opt.from || 0), n1 = Math.min(D.N, opt.to == null ? D.N : opt.to);
  var ta = Math.max(warm, opt.t0 || 0, 0), tb = Math.min(D.T - h, opt.t1 == null ? D.T - h : opt.t1);   // 只取 t ∈ [ta, tb] 的时刻
  var perPath = Math.max(0, tb - ta + 1), total = Math.max(0, n1 - n0) * perPath;
  var rows = [], ys = [], d = 0, j;
  if (total > 0) {
    // 特征个数以最靠后的那个时刻为准：预热期里 s.rets(n) 这类函数返回的数组更短，那些行直接丢掉
    var probe = feat(D.at(n0, tb)); d = probe && probe.length ? probe.length : 0;
    // 抽样：把全部 (路径, 时刻) 均分成 m 段，每段里取一个由哈希决定的位置。
    // 这样行数正好是 m；固定步长则可能成倍地丢数据，或者与每条路径的步数"共振"、只抽到同一个时刻。
    var m = Math.min(total, maxRows), w = total / m, last = -1;
    for (var k = 0; k < m && d > 0; k++) {
      var c = total <= maxRows ? k : Math.floor((k + hash01(k)) * w);
      if (c <= last) c = last + 1;
      if (c >= total) break;
      last = c;
      var n = n0 + Math.floor(c / perPath), t = ta + c % perPath;
      var x = feat(D.at(n, t)); if (!x || x.length !== d) continue;
      var okRow = true; for (j = 0; okRow && j < d; j++) if (!(x[j] === x[j]) || x[j] === Infinity || x[j] === -Infinity) okRow = false;
      if (!okRow) continue;
      var y = opt.target ? opt.target(D, n, t) : D.fwd(n, t, h);
      if (!(y === y) || y === Infinity || y === -Infinity) continue;
      rows.push(x); ys.push(y);
    }
  }
  var X = new Float64Array(rows.length * d);
  for (var i = 0; i < rows.length; i++) for (j = 0; j < d; j++) X[i * d + j] = rows[i][j];
  return { X: X, y: Float64Array.from(ys), n: rows.length, d: d };
};
/** 整数 → [0, 1) 的确定性哈希（抽样用，保证同样的输入得到同样的数据集） */
function hash01(k) { var x = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 15; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2f); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
/** 模型都需要非空的训练集：空的时候给一个说得清的错误，而不是悄悄返回 NaN 或者死循环 */
function need(ds, who, min) { if (!ds || !(ds.n >= (min || 1))) throw new Error(who + "：训练集只有 " + (ds ? ds.n : 0) + " 行。多半是路径太短、预热期太长，或者特征在整段上都是 NaN。"); }
/** 直接用数组造数据集（测试和自定义用） */
ml.table = function (rows, ys) { var n = rows.length, d = n ? rows[0].length : 0, X = new Float64Array(n * d); for (var i = 0; i < n; i++) for (var j = 0; j < d; j++) X[i * d + j] = rows[i][j]; return { X: X, y: Float64Array.from(ys), n: n, d: d }; };

/* ---------- 线性模型 ---------- */
/** 最小二乘 / 岭回归。opt: {lambda 岭惩罚（作用在标准化后的系数上，不罚截距）} */
ml.ols = function (ds, opt) {
  opt = opt || {}; need(ds, "线性回归");
  var n = ds.n, d = ds.d, lam = opt.lambda || 0, sc = scaler(ds), Z = scaled(ds, sc), ym = mean(ds.y), i, j, k;
  var A = new Float64Array(d * d), b = new Float64Array(d);
  for (i = 0; i < n; i++) { var o = i * d, yi = ds.y[i] - ym; for (j = 0; j < d; j++) { var zj = Z[o + j]; b[j] += zj * yi; for (k = 0; k <= j; k++) A[j * d + k] += zj * Z[o + k]; } }
  for (j = 0; j < d; j++) { for (k = 0; k < j; k++) A[k * d + j] = A[j * d + k]; A[j * d + j] += lam * n + 1e-10 * n; }
  var bz = d ? cholSolve(A, b, d) : new Float64Array(0), coef = new Float64Array(d), c0 = ym;
  for (j = 0; j < d; j++) { coef[j] = bz[j] / sc.sd[j]; c0 -= coef[j] * sc.mean[j]; }
  return linearModel(coef, c0, "ols");
};
ml.ridge = function (ds, lambda) { return ml.ols(ds, { lambda: lambda == null ? 0.1 : lambda }); };
function linearModel(coef, c0, kind) {
  return { kind: kind, coef: coef, intercept: c0, size: coef.length + 1, predict: function (x) { var s = c0; for (var j = 0; j < coef.length; j++) s += coef[j] * x[j]; return s; } };
}
/** Lasso（坐标下降）。alpha 是相对强度：0 = 最小二乘，1 = 刚好把所有系数压成 0。
 *  用协方差形式迭代：先算好 G = ZᵀZ/n 和 c = Zᵀy/n，每一轮只花 O(d²)，所以可以一直跑到收敛
 *  （特征高度相关时坐标下降收敛得很慢，轮数给少了会停在半路）。 */
ml.lasso = function (ds, alpha, opt) {
  opt = opt || {}; need(ds, "Lasso");
  var n = ds.n, d = ds.d, sc = scaler(ds), Z = scaled(ds, sc), ym = mean(ds.y), i, j, k, it;
  var G = new Float64Array(d * d), c = new Float64Array(d), beta = new Float64Array(d), lmax = 0;
  for (i = 0; i < n; i++) { var o = i * d, yi = ds.y[i] - ym; for (j = 0; j < d; j++) { var zj = Z[o + j]; c[j] += zj * yi; for (k = 0; k <= j; k++) G[j * d + k] += zj * Z[o + k]; } }
  for (j = 0; j < d; j++) { c[j] /= n; for (k = 0; k <= j; k++) { G[j * d + k] /= n; G[k * d + j] = G[j * d + k]; } if (Math.abs(c[j]) > lmax) lmax = Math.abs(c[j]); }
  var lam = (alpha == null ? 0.1 : alpha) * lmax, tol = 1e-11 * (Math.sqrt(variance(ds.y)) + 1e-300), maxIt = opt.iters || 200000;
  for (it = 0; it < maxIt; it++) {
    var change = 0;
    for (j = 0; j < d; j++) {
      var gjj = G[j * d + j]; if (!(gjj > 1e-12)) { beta[j] = 0; continue; }
      var rho = c[j]; for (k = 0; k < d; k++) if (k !== j && beta[k] !== 0) rho -= G[j * d + k] * beta[k];
      var nb = (rho > lam ? rho - lam : rho < -lam ? rho + lam : 0) / gjj, db = nb - beta[j];
      if (db !== 0) { beta[j] = nb; if (Math.abs(db) > change) change = Math.abs(db); }
    }
    if (change < tol) break;
  }
  var coef = new Float64Array(d), c0 = ym; for (j = 0; j < d; j++) { coef[j] = beta[j] / sc.sd[j]; c0 -= coef[j] * sc.mean[j]; }
  var m = linearModel(coef, c0, "lasso"); m.nonzero = Array.prototype.filter.call(beta, function (v) { return v !== 0; }).length; m.sweeps = it + 1; return m;
};
/** 逻辑回归（牛顿法 / IRLS）。y 取 0/1；predict 返回概率。opt: {l2} */
ml.logistic = function (ds, opt) {
  opt = opt || {}; need(ds, "逻辑回归");
  var n = ds.n, d = ds.d, sc = scaler(ds), Z = scaled(ds, sc), p1 = d + 1, w = new Float64Array(p1), l2 = opt.l2 == null ? 1e-4 : opt.l2, i, j, k, it;
  for (it = 0; it < (opt.iters || 25); it++) {
    var H = new Float64Array(p1 * p1), g = new Float64Array(p1);
    for (i = 0; i < n; i++) {
      var o = i * d, eta = w[d]; for (j = 0; j < d; j++) eta += w[j] * Z[o + j];
      var p = 1 / (1 + Math.exp(-eta)), e = ds.y[i] - p, q = Math.max(p * (1 - p), 1e-9);
      for (j = 0; j <= d; j++) { var zj = j < d ? Z[o + j] : 1; g[j] += zj * e; for (k = 0; k <= j; k++) H[j * p1 + k] += q * zj * (k < d ? Z[o + k] : 1); }
    }
    for (j = 0; j < p1; j++) { for (k = 0; k < j; k++) H[k * p1 + j] = H[j * p1 + k]; if (j < d) { H[j * p1 + j] += l2 * n; g[j] -= l2 * n * w[j]; } H[j * p1 + j] += 1e-9; }
    var step = cholSolve(H, g, p1), mx = 0; for (j = 0; j < p1; j++) { w[j] += step[j]; mx = Math.max(mx, Math.abs(step[j])); }
    if (mx < 1e-8) break;
  }
  var coef = new Float64Array(d), c0 = w[d]; for (j = 0; j < d; j++) { coef[j] = w[j] / sc.sd[j]; c0 -= coef[j] * sc.mean[j]; }
  return { kind: "logistic", coef: coef, intercept: c0, size: d + 1, predict: function (x) { var s = c0; for (var j = 0; j < d; j++) s += coef[j] * x[j]; return 1 / (1 + Math.exp(-s)); } };
};

/* ---------- k 近邻 ---------- */
/** opt: {k, maxTrain 保留的训练点上限}。用 KD 树找邻居：特征少的时候比逐点比较快一两个数量级 */
ml.knn = function (ds, opt) {
  opt = opt || {}; need(ds, "k 近邻");
  var d = ds.d, k = Math.max(1, opt.k || 20), cap = Math.max(1, opt.maxTrain || 3000), sc = scaler(ds), src = [], i, j;
  if (ds.n <= cap) for (i = 0; i < ds.n; i++) src.push(i);
  else { var wS = ds.n / cap, lastS = -1; for (i = 0; i < cap; i++) { var pick = Math.floor((i + hash01(i + 7777)) * wS); if (pick <= lastS) pick = lastS + 1; if (pick >= ds.n) break; lastS = pick; src.push(pick); } }
  var n = src.length, Z = new Float64Array(n * d), y = new Float64Array(n), idx = new Int32Array(n);
  for (i = 0; i < n; i++) { idx[i] = i; y[i] = ds.y[src[i]]; for (j = 0; j < d; j++) Z[i * d + j] = (ds.X[src[i] * d + j] - sc.mean[j]) / sc.sd[j]; }
  k = Math.min(k, n);
  // 建树：每次沿取值范围最宽的那一维，在中位数处切开
  var LEAF = 12, nDim = [], nSplit = [], nL = [], nR = [], nA = [], nB = [];
  function build(a, b) {
    var id = nDim.length; nDim.push(-1); nSplit.push(0); nL.push(-1); nR.push(-1); nA.push(a); nB.push(b);
    if (b - a <= LEAF || d === 0) return id;
    var bestDim = 0, bestW = -1, jj, ii;
    for (jj = 0; jj < d; jj++) { var lo = Infinity, hi = -Infinity; for (ii = a; ii < b; ii++) { var v = Z[idx[ii] * d + jj]; if (v < lo) lo = v; if (v > hi) hi = v; } if (hi - lo > bestW) { bestW = hi - lo; bestDim = jj; } }
    if (!(bestW > 0)) return id;
    var sub = Array.prototype.slice.call(idx.subarray(a, b)).sort(function (p, q) { return Z[p * d + bestDim] - Z[q * d + bestDim]; });
    for (ii = 0; ii < sub.length; ii++) idx[a + ii] = sub[ii];
    var mid = (a + b) >> 1;
    nDim[id] = bestDim; nSplit[id] = Z[idx[mid] * d + bestDim];
    nL[id] = build(a, mid); nR[id] = build(mid, b);
    return id;
  }
  if (d === 1) { // 只有一个特征：排好序，二分查找后向两边扩，精确且极快
    var ord = Array.prototype.slice.call(idx).sort(function (a, b) { return Z[a] - Z[b]; }), zs = new Float64Array(n), ysrt = new Float64Array(n);
    for (i = 0; i < n; i++) { zs[i] = Z[ord[i]]; ysrt[i] = y[ord[i]]; }
    return { kind: "knn", k: k, nTrain: n, trainIdx: src, size: 2 * n + 2, predict: function (x) {
      var qv = (x[0] - sc.mean[0]) / sc.sd[0], lo = 0, hi = n;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (zs[mid] < qv) lo = mid + 1; else hi = mid; }
      var l = lo - 1, r = lo, s = 0;
      for (var c = 0; c < k; c++) { if (l < 0) s += ysrt[r++]; else if (r >= n) s += ysrt[l--]; else if (qv - zs[l] <= zs[r] - qv) s += ysrt[l--]; else s += ysrt[r++]; }
      return s / k;
    } };
  }
  build(0, n);
  var bd = new Float64Array(k), by = new Float64Array(k), q = new Float64Array(d), m = 0, worst = Infinity, wi = 0;
  function offer(dist, yv) {
    var c;
    if (m < k) { bd[m] = dist; by[m] = yv; m++; if (m === k) { worst = -1; for (c = 0; c < k; c++) if (bd[c] > worst) { worst = bd[c]; wi = c; } } }
    else if (dist < worst) { bd[wi] = dist; by[wi] = yv; worst = -1; for (c = 0; c < k; c++) if (bd[c] > worst) { worst = bd[c]; wi = c; } }
  }
  function search(id) {
    var dim = nDim[id], ii, jj;
    if (dim < 0) {
      for (ii = nA[id]; ii < nB[id]; ii++) { var o = idx[ii] * d, dist = 0; for (jj = 0; jj < d; jj++) { var e = Z[o + jj] - q[jj]; dist += e * e; } offer(dist, y[idx[ii]]); }
      return;
    }
    var diff = q[dim] - nSplit[id];
    if (diff < 0) { search(nL[id]); if (m < k || diff * diff < worst) search(nR[id]); }
    else { search(nR[id]); if (m < k || diff * diff <= worst) search(nL[id]); }
  }
  return { kind: "knn", k: k, nTrain: n, trainIdx: src, size: n * (d + 1) + 2 * d + 6 * nDim.length, predict: function (x) {
    for (var j2 = 0; j2 < d; j2++) q[j2] = (x[j2] - sc.mean[j2]) / sc.sd[j2];
    m = 0; worst = Infinity; search(0);
    var s = 0; for (var c = 0; c < m; c++) s += by[c]; return m ? s / m : NaN;
  } };
};

/* ---------- 树 ---------- */
function binEdges(ds, bins) { // 每个特征按分位数切成若干箱
  var n = ds.n, d = ds.d, cap = Math.min(n, 4000), step = Math.max(1, Math.floor(n / cap)), E = [], col = new Float64Array(Math.ceil(n / step));
  for (var j = 0; j < d; j++) {
    var m = 0; for (var i = 0; i < n; i += step) col[m++] = ds.X[i * d + j];
    var s = col.subarray(0, m).slice().sort(), qs = [], e = [], b;
    for (b = 1; b < bins; b++) qs.push(b / bins);
    // 等分位的箱在两端很宽，而函数往往在尾部变化最快：给尾部补几个分界点
    [0.002, 0.005, 0.01, 0.02, 0.98, 0.99, 0.995, 0.998].forEach(function (q) { qs.push(q); });
    qs.sort(function (a, c) { return a - c; });
    for (b = 0; b < qs.length; b++) { var v = s[Math.min(m - 1, Math.floor(qs[b] * m))]; if (!e.length || v > e[e.length - 1]) e.push(v); }
    E.push(Float64Array.from(e));
  }
  return E;
}
function binOf(e, v) { var lo = 0, hi = e.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (v > e[mid]) lo = mid + 1; else hi = mid; } return lo; } // 箱号 = 小于 v 的分界点个数
function binAll(ds, E) { var n = ds.n, d = ds.d, B = new Uint16Array(n * d); for (var i = 0; i < n; i++) for (var j = 0; j < d; j++) B[i * d + j] = binOf(E[j], ds.X[i * d + j]); return B; }
/** 在已分箱的数据上长一棵回归树。rows 是样本下标；target 是要拟合的值 */
function growTree(B, E, d, target, rows, opt, rng, imp) {
  var maxDepth = opt.depth || 3, minLeaf = opt.minLeaf || 20, mtry = opt.mtry || d, nodes = [];
  function build(idx, depth) {
    var n = idx.length, s = 0, i, j; for (i = 0; i < n; i++) s += target[idx[i]];
    var node = { v: n ? s / n : 0, f: -1, t: 0, l: -1, r: -1 }, id = nodes.length; nodes.push(node);
    if (depth >= maxDepth || n < 2 * minLeaf) return id;
    var best = 0, bf = -1, bb = -1, feats = [];
    if (mtry < d && rng) { var pool = []; for (j = 0; j < d; j++) pool.push(j); for (j = 0; j < mtry; j++) { var q = j + rng.int(d - j), tmp = pool[j]; pool[j] = pool[q]; pool[q] = tmp; feats.push(pool[j]); } } else for (j = 0; j < d; j++) feats.push(j);
    var base = s * s / n;
    for (var fi = 0; fi < feats.length; fi++) {
      j = feats[fi]; var nb = E[j].length + 1; if (nb < 2) continue;
      var cnt = new Float64Array(nb), sum = new Float64Array(nb);
      for (i = 0; i < n; i++) { var b = B[idx[i] * d + j]; cnt[b]++; sum[b] += target[idx[i]]; }
      var cl = 0, sl = 0;
      for (b = 0; b < nb - 1; b++) { cl += cnt[b]; sl += sum[b]; var cr = n - cl; if (cl < minLeaf || cr < minLeaf) continue; var gain = sl * sl / cl + (s - sl) * (s - sl) / cr - base; if (gain > best) { best = gain; bf = j; bb = b; } }
    }
    if (bf < 0 || !(best > 1e-18 * Math.abs(base) + 1e-300)) return id;
    var L = [], R = []; for (i = 0; i < n; i++) (B[idx[i] * d + bf] <= bb ? L : R).push(idx[i]);
    node.f = bf; node.t = E[bf][bb]; if (imp) imp[bf] += best;
    node.l = build(L, depth + 1); node.r = build(R, depth + 1);
    return id;
  }
  build(rows, 0);
  return nodes;
}
function treePredict(nodes, x) { var k = 0; for (;;) { var nd = nodes[k]; if (nd.f < 0) return nd.v; k = x[nd.f] <= nd.t ? nd.l : nd.r; } }
function allRows(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = i; return a; }
function normImp(imp) { var s = 0, j; for (j = 0; j < imp.length; j++) s += imp[j]; if (s > 0) for (j = 0; j < imp.length; j++) imp[j] /= s; return imp; }
/** 回归树（CART，直方图分裂）。opt: {depth, minLeaf, bins} */
ml.tree = function (ds, opt) {
  opt = opt || {}; need(ds, "回归树"); var E = binEdges(ds, opt.bins || 64), B = binAll(ds, E), imp = new Float64Array(ds.d), nodes = growTree(B, E, ds.d, ds.y, allRows(ds.n), opt, null, imp);
  return { kind: "tree", nodes: nodes, size: 5 * nodes.length, leaves: nodes.filter(function (n) { return n.f < 0; }).length, importance: normImp(imp), predict: function (x) { return treePredict(nodes, x); } };
};
/** 随机森林。opt: {trees, depth, minLeaf, mtry, rng} */
ml.forest = function (ds, opt) {
  opt = opt || {}; need(ds, "随机森林"); var rng = opt.rng || new QL.RNG(1, 2, 3), T = opt.trees || 50, d = ds.d, n = ds.n, E = binEdges(ds, opt.bins || 64), B = binAll(ds, E), imp = new Float64Array(d), forest = [];
  var o2 = { depth: opt.depth || 5, minLeaf: opt.minLeaf || 20, mtry: opt.mtry || Math.max(1, Math.round(Math.sqrt(d))) };
  for (var t = 0; t < T; t++) { var rows = new Array(n); for (var i = 0; i < n; i++) rows[i] = rng.int(n); forest.push(growTree(B, E, d, ds.y, rows, o2, rng, imp)); }
  var fsz = 0; forest.forEach(function (nd) { fsz += 5 * nd.length; });   // 每个节点 5 个数：预测值、特征、分裂点、左右孩子
  return { kind: "forest", trees: T, size: fsz, importance: normImp(imp), predict: function (x) { var s = 0; for (var k = 0; k < T; k++) s += treePredict(forest[k], x); return s / T; } };
};
/** 梯度提升（平方损失）。opt: {trees, depth, lr, minLeaf, subsample, rng} */
ml.gbm = function (ds, opt) {
  opt = opt || {}; need(ds, "梯度提升"); var rng = opt.rng || new QL.RNG(4, 5, 6), T = opt.trees || 100, lr = opt.lr || 0.1, d = ds.d, n = ds.n, sub = opt.subsample || 0.7, E = binEdges(ds, opt.bins || 64), B = binAll(ds, E), imp = new Float64Array(d);
  var f0 = mean(ds.y), F = new Float64Array(n).fill(f0), res = new Float64Array(n), trees = [], o2 = { depth: opt.depth || 3, minLeaf: opt.minLeaf || 20 }, i;
  for (var t = 0; t < T; t++) {
    for (i = 0; i < n; i++) res[i] = ds.y[i] - F[i];
    var rows = []; for (i = 0; i < n; i++) if (rng.u() < sub) rows.push(i);
    if (rows.length < 2 * o2.minLeaf) rows = allRows(n);
    var nodes = growTree(B, E, d, res, rows, o2, null, imp); trees.push(nodes);
    for (i = 0; i < n; i++) { var k = 0; for (;;) { var nd = nodes[k]; if (nd.f < 0) { F[i] += lr * nd.v; break; } k = ds.X[i * d + nd.f] <= nd.t ? nd.l : nd.r; } }
  }
  var gsz = 1; trees.forEach(function (nd) { gsz += 5 * nd.length; });
  return { kind: "gbm", trees: T, size: gsz, importance: normImp(imp), predict: function (x) { var s = f0; for (var k = 0; k < T; k++) s += lr * treePredict(trees[k], x); return s; } };
};

/* ---------- 神经网络 ---------- */
/** 多层感知机（tanh 隐层，线性输出，Adam）。opt: {hidden:[16], epochs, lr, l2, batch, rng} */
ml.mlp = function (ds, opt) {
  opt = opt || {}; need(ds, "神经网络");
  var rng = opt.rng || new QL.RNG(7, 8, 9), n = ds.n, d = ds.d, sc = scaler(ds), Z = scaled(ds, sc), ym = mean(ds.y), ys = Math.sqrt(variance(ds.y)) || 1;
  var sizes = [d].concat(opt.hidden || [16]).concat([1]), Lr = sizes.length - 1, W = [], Bv = [], mW = [], vW = [], mB = [], vB = [], l, i, j, k;
  for (l = 0; l < Lr; l++) { var fan = sizes[l], out = sizes[l + 1], w = new Float64Array(fan * out), sdw = Math.sqrt(1 / fan); for (i = 0; i < w.length; i++) w[i] = sdw * rng.normal(); W.push(w); Bv.push(new Float64Array(out)); mW.push(new Float64Array(w.length)); vW.push(new Float64Array(w.length)); mB.push(new Float64Array(out)); vB.push(new Float64Array(out)); }
  var acts = sizes.map(function (s) { return new Float64Array(s); }), deltas = sizes.map(function (s) { return new Float64Array(s); });
  var gW = W.map(function (w2) { return new Float64Array(w2.length); }), gB = Bv.map(function (b2) { return new Float64Array(b2.length); });
  function forward(x) {
    var a = acts[0]; for (j = 0; j < d; j++) a[j] = x[j];
    for (l = 0; l < Lr; l++) { var inp = acts[l], o = acts[l + 1], w3 = W[l], fi = sizes[l], fo = sizes[l + 1]; for (k = 0; k < fo; k++) { var s = Bv[l][k], off = k * fi; for (j = 0; j < fi; j++) s += w3[off + j] * inp[j]; o[k] = l < Lr - 1 ? Math.tanh(s) : s; } }
    return acts[Lr][0];
  }
  var epochs = opt.epochs || 30, lr = opt.lr || 0.01, l2 = opt.l2 || 1e-5, batch = Math.max(1, Math.min(opt.batch || 64, n)), order = allRows(n), step = 0, b1 = 0.9, b2 = 0.999, xrow = new Float64Array(d);
  var total = Math.max(1, epochs * Math.floor(n / batch)), lr0 = lr;   // 学习率按余弦曲线从 lr 降到接近 0：收尾时不再被小批量的噪声推着走
  for (var ep = 0; ep < epochs; ep++) {
    for (i = n - 1; i > 0; i--) { var q = rng.int(i + 1), tmp = order[i]; order[i] = order[q]; order[q] = tmp; }
    for (var s0 = 0; s0 + batch <= n; s0 += batch) {
      for (l = 0; l < Lr; l++) { gW[l].fill(0); gB[l].fill(0); }
      for (var r = s0; r < s0 + batch; r++) {
        var row = order[r]; for (j = 0; j < d; j++) xrow[j] = Z[row * d + j];
        var err = forward(xrow) - (ds.y[row] - ym) / ys; deltas[Lr][0] = err;
        for (l = Lr - 1; l >= 0; l--) {
          var fi2 = sizes[l], fo2 = sizes[l + 1], dl = deltas[l + 1], inp2 = acts[l], dprev = deltas[l]; if (l > 0) dprev.fill(0);
          for (k = 0; k < fo2; k++) { var g = dl[k], off2 = k * fi2; gB[l][k] += g; for (j = 0; j < fi2; j++) { gW[l][off2 + j] += g * inp2[j]; if (l > 0) dprev[j] += g * W[l][off2 + j]; } }
          if (l > 0) for (j = 0; j < fi2; j++) dprev[j] *= 1 - inp2[j] * inp2[j];
        }
      }
      step++; var c1 = 1 - Math.pow(b1, step), c2 = 1 - Math.pow(b2, step);
      lr = lr0 * (0.01 + 0.99 * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, step / total))));
      for (l = 0; l < Lr; l++) {
        var w4 = W[l], gw = gW[l], m1 = mW[l], v1 = vW[l];
        for (i = 0; i < w4.length; i++) { var gg = gw[i] / batch + l2 * w4[i]; m1[i] = b1 * m1[i] + (1 - b1) * gg; v1[i] = b2 * v1[i] + (1 - b2) * gg * gg; w4[i] -= lr * (m1[i] / c1) / (Math.sqrt(v1[i] / c2) + 1e-8); }
        var bb = Bv[l], gb = gB[l], m2 = mB[l], v2 = vB[l];
        for (i = 0; i < bb.length; i++) { var g2 = gb[i] / batch; m2[i] = b1 * m2[i] + (1 - b1) * g2; v2[i] = b2 * v2[i] + (1 - b2) * g2 * g2; bb[i] -= lr * (m2[i] / c1) / (Math.sqrt(v2[i] / c2) + 1e-8); }
      }
    }
  }
  var xin = new Float64Array(d), nw = 0; W.forEach(function (w5, li) { nw += w5.length + Bv[li].length; });
  return { kind: "mlp", weights: nw, size: nw + 2 * d + 2, predict: function (x) { for (var j2 = 0; j2 < d; j2++) xin[j2] = (x[j2] - sc.mean[j2]) / sc.sd[j2]; return forward(xin) * ys + ym; } };
};

/* ---------- 状态空间 ---------- */
/** 局部水平模型的卡尔曼滤波：观测 y_t = m_t + ε，状态 m_{t+1} = m_t + η。
 *  opt: {q 状态噪声方差, r 观测噪声方差, m0, p0}。返回在线滤波器：update(y) 给出滤波后的 m。 */
ml.kalman = function (opt) {
  opt = opt || {}; var q = opt.q == null ? 1e-6 : opt.q, r = opt.r == null ? 1e-4 : opt.r;
  var f = { m: opt.m0 || 0, p: opt.p0 == null ? r : opt.p0, k: 0 };
  f.update = function (y) { var pp = f.p + q, K = pp / (pp + r); f.k = K; f.m += K * (y - f.m); f.p = pp * r / (pp + r); return f.m; };   // (1−K)·P⁻ 写成 P⁻R/(P⁻+R)，先验很宽时不会相消
  return f;
};
/** 高斯隐马尔可夫模型（Baum–Welch）。seqs 是若干条观测序列；opt: {states, iters}。
 *  返回参数和一个在线滤波器工厂 filter()：update(y) 给出状态的后验概率。
 *  logLik / llHistory 是每次 E 步时的对数似然，对应的是那一步更新之前的参数。 */
ml.hmm = function (seqs, opt) {
  opt = opt || {};
  var K = opt.states || 2, iters = opt.iters || 25, all = [], i, j, k, t, s;
  seqs.forEach(function (q) { for (var a = 0; a < q.length; a++) all.push(q[a]); });
  var gm = mean(all), gsd = Math.sqrt(variance(all)) || 1e-6;
  // 初值：按滚动波动的高低分组——波动最低的一组和最高的一组
  var mu = new Float64Array(K), sd = new Float64Array(K), pi = new Float64Array(K).fill(1 / K), A = [];
  for (k = 0; k < K; k++) { mu[k] = gm + (K > 1 ? (0.5 - k / (K - 1)) * gsd * 0.2 : 0); sd[k] = gsd * (K > 1 ? 0.6 + 1.0 * k / (K - 1) : 1); A.push(new Float64Array(K).fill(K > 1 ? 0.03 / (K - 1) : 0)); A[k][k] = K > 1 ? 0.97 : 1; }
  var ll = -Infinity, hist = [];
  for (var it = 0; it < iters; it++) {
    var nPi = new Float64Array(K), nA = A.map(function () { return new Float64Array(K); }), g0 = new Float64Array(K), g1 = new Float64Array(K), g2 = new Float64Array(K), newLL = 0;
    for (s = 0; s < seqs.length; s++) {
      var y = seqs[s], T = y.length; if (T < 2) continue;
      var al = new Float64Array(T * K), be = new Float64Array(T * K), cs = new Float64Array(T), bq = new Float64Array(T * K);
      for (t = 0; t < T; t++) for (k = 0; k < K; k++) { var z = (y[t] - mu[k]) / sd[k]; bq[t * K + k] = Math.exp(-0.5 * z * z) / (sd[k] * 2.5066282746310002) + 1e-300; }
      var c = 0; for (k = 0; k < K; k++) { al[k] = pi[k] * bq[k]; c += al[k]; } cs[0] = c; for (k = 0; k < K; k++) al[k] /= c;
      for (t = 1; t < T; t++) { c = 0; for (j = 0; j < K; j++) { var a2 = 0; for (i = 0; i < K; i++) a2 += al[(t - 1) * K + i] * A[i][j]; a2 *= bq[t * K + j]; al[t * K + j] = a2; c += a2; } cs[t] = c; for (j = 0; j < K; j++) al[t * K + j] /= c; }
      for (k = 0; k < K; k++) be[(T - 1) * K + k] = 1;
      for (t = T - 2; t >= 0; t--) for (i = 0; i < K; i++) { var b3 = 0; for (j = 0; j < K; j++) b3 += A[i][j] * bq[(t + 1) * K + j] * be[(t + 1) * K + j]; be[t * K + i] = b3 / cs[t + 1]; }
      for (t = 0; t < T; t++) { newLL += Math.log(cs[t]); for (k = 0; k < K; k++) { var gma = al[t * K + k] * be[t * K + k]; if (t === 0) nPi[k] += gma; g0[k] += gma; g1[k] += gma * y[t]; g2[k] += gma * y[t] * y[t]; } }
      for (t = 0; t < T - 1; t++) for (i = 0; i < K; i++) for (j = 0; j < K; j++) nA[i][j] += al[t * K + i] * A[i][j] * bq[(t + 1) * K + j] * be[(t + 1) * K + j] / cs[t + 1];
    }
    var sp = 0; for (k = 0; k < K; k++) sp += nPi[k];
    for (k = 0; k < K; k++) {
      pi[k] = sp > 0 ? nPi[k] / sp : 1 / K; mu[k] = g0[k] > 0 ? g1[k] / g0[k] : mu[k];
      var v = g0[k] > 0 ? g2[k] / g0[k] - mu[k] * mu[k] : sd[k] * sd[k]; sd[k] = Math.sqrt(Math.max(v, 1e-4 * gsd * gsd));
      var rs = 0; for (j = 0; j < K; j++) rs += nA[k][j]; if (rs > 0) for (j = 0; j < K; j++) A[k][j] = nA[k][j] / rs;
    }
    hist.push(newLL); if (it > 3 && newLL - ll < 1e-7 * Math.abs(newLL)) { ll = newLL; break; } ll = newLL;
  }
  // 状态按均值从高到低排列（0 = 牛）
  var ord = []; for (k = 0; k < K; k++) ord.push(k); ord.sort(function (a3, b4) { return mu[b4] - mu[a3]; });
  var M = { kind: "hmm", size: K * K + 3 * K, states: K, mu: ord.map(function (o) { return mu[o]; }), sd: ord.map(function (o) { return sd[o]; }), pi: ord.map(function (o) { return pi[o]; }), A: ord.map(function (o) { return ord.map(function (o2) { return A[o][o2]; }); }), logLik: ll, llHistory: hist };
  // 平稳分布
  var Pm = M.A.map(function (row) { return Array.from(row); });
  for (i = 0; i < 60; i++) {   // P ← P²，60 次相当于走 2^60 步
    var P2 = Pm.map(function () { return new Array(K).fill(0); }), a7, b7, c7;
    for (a7 = 0; a7 < K; a7++) for (b7 = 0; b7 < K; b7++) { var acc = 0; for (c7 = 0; c7 < K; c7++) acc += Pm[a7][c7] * Pm[c7][b7]; P2[a7][b7] = acc; }
    for (a7 = 0; a7 < K; a7++) { var rsum = 0; for (b7 = 0; b7 < K; b7++) rsum += P2[a7][b7]; for (b7 = 0; b7 < K; b7++) P2[a7][b7] /= rsum || 1; }
    Pm = P2;
  }
  var st = new Float64Array(K); for (j = 0; j < K; j++) { for (k = 0; k < K; k++) st[j] += Pm[k][j]; st[j] /= K; }   // 各行此时已基本相同，取平均
  M.stationary = Array.from(st);
  /** 在线滤波：p 是"下一步处于各状态"的预测概率 */
  M.filter = function () {
    var p = Float64Array.from(M.stationary), F = { p: p };
    F.update = function (yv) {
      var post = new Float64Array(K), c2 = 0, a4, b5;
      for (a4 = 0; a4 < K; a4++) { var z2 = (yv - M.mu[a4]) / M.sd[a4]; post[a4] = p[a4] * (Math.exp(-0.5 * z2 * z2) / M.sd[a4] + 1e-300); c2 += post[a4]; }
      for (a4 = 0; a4 < K; a4++) post[a4] /= c2;
      for (b5 = 0; b5 < K; b5++) { var s2 = 0; for (a4 = 0; a4 < K; a4++) s2 += post[a4] * M.A[a4][b5]; p[b5] = s2; }
      return p;
    };
    F.mean = function () { var m3 = 0; for (var a5 = 0; a5 < K; a5++) m3 += p[a5] * M.mu[a5]; return m3; };
    F.variance = function () { var m4 = F.mean(), v2 = 0; for (var a6 = 0; a6 < K; a6++) v2 += p[a6] * (M.sd[a6] * M.sd[a6] + M.mu[a6] * M.mu[a6]); return v2 - m4 * m4; };
    return F;
  };
  return M;
};

/* ---------- 评估与诊断 ---------- */
/** 预测值与实际值的几个指标 */
ml.metrics = function (pred, y) {
  var n = y.length, my = mean(y), mp = mean(pred), sse = 0, sst = 0, spy = 0, spp = 0, hit = 0, cnt = 0;
  for (var i = 0; i < n; i++) { var e = y[i] - pred[i]; sse += e * e; var dy = y[i] - my, dp = pred[i] - mp; sst += dy * dy; spy += dy * dp; spp += dp * dp; if (pred[i] !== 0 && y[i] !== 0) { cnt++; if ((pred[i] > 0) === (y[i] > 0)) hit++; } }
  return { n: n, mse: sse / n, r2: sst > 0 ? 1 - sse / sst : 0, ic: spp > 0 && sst > 0 ? spy / Math.sqrt(spp * sst) : 0, hit: cnt ? hit / cnt : NaN };
};
ml.predictAll = function (model, ds) { var out = new Float64Array(ds.n), x = new Float64Array(ds.d); for (var i = 0; i < ds.n; i++) { for (var j = 0; j < ds.d; j++) x[j] = ds.X[i * ds.d + j]; out[i] = model.predict(x); } return out; };
/** 一份标准的诊断报告，结果会显示在"模型诊断"那几张图里。
 *  tr / va：训练集和验证集；names：特征名；opt.truth(x) 可选，给出真实的条件期望以便对照 */
ml.diagnose = function (model, tr, va, names, opt) {
  opt = opt || {};
  var d = tr.d, i, j, b, trU = tr;
  if (model.trainIdx && model.trainIdx.length < tr.n) {   // 模型只存了训练集的一部分（k 近邻）："训练集"指标就在它真正见过的那些点上算
    var ix = model.trainIdx, Xs = new Float64Array(ix.length * d), ysub = new Float64Array(ix.length);
    for (i = 0; i < ix.length; i++) { ysub[i] = tr.y[ix[i]]; for (j = 0; j < d; j++) Xs[i * d + j] = tr.X[ix[i] * d + j]; }
    trU = { X: Xs, y: ysub, n: ix.length, d: d };
  }
  var ptr = ml.predictAll(model, trU), pva = ml.predictAll(model, va), mtr = ml.metrics(ptr, trU.y), mva = ml.metrics(pva, va.y);
  // 预测一次要多久：把验证集反复预测几遍，凑够几毫秒再除（单次太快，时钟分辨不出来）
  var reps = 0, tp0 = QL.nowMs(), tpe = 0;
  if (va.n > 0) do { ml.predictAll(model, va); reps++; tpe = QL.nowMs() - tp0; } while (tpe < 4 && reps < 400);
  // 基准：只用训练集均值去预测
  var ym = mean(tr.y), base = 0; for (i = 0; i < va.n; i++) { var e0 = va.y[i] - ym; base += e0 * e0; } base /= va.n || 1;
  var out = { names: names || [], d: d, nTrain: trU.n, nValid: va.n, r2Train: mtr.r2, r2Valid: base > 0 ? 1 - mva.mse / base : 0, ic: mva.ic, hit: mva.hit, icSE: va.n > 3 ? 1 / Math.sqrt(va.n - 3) : NaN, targetSD: Math.sqrt(variance(va.y)), predSD: Math.sqrt(variance(pva)), kind: model.kind || "",
    size: typeof model.size === "number" ? model.size : null, predUs: reps && tpe > 0 ? tpe * 1000 / (reps * va.n) : null };
  // 置换重要性：把验证集里某一列打乱，看均方误差涨多少
  var rng = new QL.RNG(11, 12, 13), imp = [], x = new Float64Array(d), perm = allRows(va.n);
  for (j = 0; j < d; j++) {
    for (i = va.n - 1; i > 0; i--) { var q = rng.int(i + 1), t = perm[i]; perm[i] = perm[q]; perm[q] = t; }
    var sse = 0; for (i = 0; i < va.n; i++) { for (var c = 0; c < d; c++) x[c] = va.X[(c === j ? perm[i] : i) * d + c]; var e = va.y[i] - model.predict(x); sse += e * e; }
    imp.push(mva.mse > 0 ? (sse / va.n - mva.mse) / (base || mva.mse) : 0);
  }
  out.importance = imp;
  // 校准：按预测值分 10 组，比较每组的平均预测和平均实际
  var order = allRows(va.n).sort(function (a, b2) { return pva[a] - pva[b2]; }), G = Math.min(10, Math.max(2, Math.floor(va.n / 30))), cal = [];
  for (b = 0; b < G; b++) { var lo = Math.floor(b * va.n / G), hi = Math.floor((b + 1) * va.n / G), sp = 0, sy = 0, sy2 = 0, m = hi - lo; for (i = lo; i < hi; i++) { sp += pva[order[i]]; sy += va.y[order[i]]; sy2 += va.y[order[i]] * va.y[order[i]]; } if (m > 1) cal.push({ pred: sp / m, actual: sy / m, se: Math.sqrt(Math.max(0, sy2 / m - sy * sy / m / m) / m), n: m }); }
  out.calib = cal;
  // 学到的函数：沿第一个特征切一刀（其余特征取训练集均值），并给出按该特征分组的实际均值
  if (d > 0) {
    var f0 = opt.feature || 0, sc = scaler(tr), col = new Float64Array(tr.n); for (i = 0; i < tr.n; i++) col[i] = tr.X[i * d + f0];
    var srt = col.slice().sort(), xlo = srt[Math.floor(0.01 * (tr.n - 1))], xhi = srt[Math.floor(0.99 * (tr.n - 1))], P = 41, xs = [], yh = [], tru = [];
    for (j = 0; j < d; j++) x[j] = sc.mean[j];
    for (i = 0; i < P; i++) { var xv = xlo + (xhi - xlo) * i / (P - 1); x[f0] = xv; xs.push(xv); yh.push(model.predict(x)); if (opt.truth) tru.push(opt.truth(xv)); }
    var NB = 20, bx = [], by = [], bse = [], ord2 = allRows(tr.n).sort(function (a, b3) { return col[a] - col[b3]; });
    for (b = 0; b < NB; b++) { var l2 = Math.floor(b * tr.n / NB), h2 = Math.floor((b + 1) * tr.n / NB), sx = 0, sy3 = 0, sq = 0, m2 = h2 - l2; for (i = l2; i < h2; i++) { sx += col[ord2[i]]; sy3 += tr.y[ord2[i]]; sq += tr.y[ord2[i]] * tr.y[ord2[i]]; } if (m2 > 1) { bx.push(sx / m2); by.push(sy3 / m2); bse.push(Math.sqrt(Math.max(0, sq / m2 - sy3 * sy3 / m2 / m2) / m2)); } }
    out.pd = { feature: f0, name: (names || [])[f0] || "特征 1", xs: xs, yhat: yh, truth: opt.truth ? tru : null, binX: bx, binY: by, binSE: bse, single: d === 1 };
  }
  return out;
};

QL.ml = ml;
return ml;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_ML_INSTALL;
