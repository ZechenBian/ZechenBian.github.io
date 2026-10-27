// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据分析案例 · 数值工具：描述统计、设计矩阵、最小二乘（经典 / 异方差稳健 / Newey–West 标准误）、
 * Poisson 回归（IRLS，可带 offset）、方差膨胀因子、误差指标。只用标准 JavaScript，页面和 Node 测试共用。
 * 约定：样本用"行号数组"（Int32Array 或普通数组）挑出来，列用函数 f(i) 取值，这样同一份数据可以随意换子集、换特征。 */
var QLCS = (function () {
  "use strict";

  /* ---------- 描述统计 ---------- */
  function rowsOf(n) { var r = new Int32Array(n); for (var i = 0; i < n; i++) r[i] = i; return r; }
  function pick(a, rows) { var out = new Float64Array(rows.length); for (var i = 0; i < rows.length; i++) out[i] = a[rows[i]]; return out; }
  function finite(a) { var out = []; for (var i = 0; i < a.length; i++) if (a[i] === a[i] && a[i] !== Infinity && a[i] !== -Infinity) out.push(a[i]); return out; }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; }
  function variance(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? s / (a.length - 1) : NaN; }
  function sd(a) { return Math.sqrt(variance(a)); }
  function sorted(a) { return Array.prototype.slice.call(a).sort(function (x, y) { return x - y; }); }
  /** 线性插值的分位数（与 numpy 默认、R 的 type 7 相同） */
  function quantile(a, q) {
    var s = sorted(a), n = s.length; if (!n) return NaN;
    var h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  }
  function median(a) { return quantile(a, 0.5); }
  /** 偏度与超额峰度都用总体矩（除以 n），与 scipy.stats 的默认相同 */
  function moments(a) {
    var n = a.length, m = mean(a), m2 = 0, m3 = 0, m4 = 0;
    for (var i = 0; i < n; i++) { var d = a[i] - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
    m2 /= n; m3 /= n; m4 /= n;
    return { mean: m, var: m2, skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) - 3 };
  }
  /** 样本自相关（分母用全样本的离差平方和，与 statsmodels 的 acf 相同） */
  function autocorr(a, k) {
    var n = a.length, m = mean(a), num = 0, den = 0, i;
    for (i = 0; i < n; i++) den += (a[i] - m) * (a[i] - m);
    for (i = k; i < n; i++) num += (a[i] - m) * (a[i - k] - m);
    return num / den;
  }
  function corr(a, b) {
    var ma = mean(a), mb = mean(b), sab = 0, saa = 0, sbb = 0;
    for (var i = 0; i < a.length; i++) { var x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return sab / Math.sqrt(saa * sbb);
  }
  /** 直方图：{ lo, hi, counts, n }（QLChart.histLayer 认得这个格式） */
  function hist(a, bins, lo, hi) {
    var v = finite(a); if (lo == null) lo = Math.min.apply(null, v); if (hi == null) hi = Math.max.apply(null, v);
    if (!(hi > lo)) hi = lo + 1;
    var c = new Array(bins).fill(0), w = (hi - lo) / bins;
    v.forEach(function (x) { var k = Math.floor((x - lo) / w); if (k === bins) k = bins - 1; if (k >= 0 && k < bins) c[k]++; });
    return { lo: lo, hi: hi, counts: c, n: v.length };
  }
  /** 按 key(i) 分组求均值：返回 { key: { n, mean, sum } } */
  function groupMean(rows, key, val) {
    var g = {};
    for (var j = 0; j < rows.length; j++) { var i = rows[j], k = key(i), v = val(i); if (!(v === v)) continue; var o = g[k] || (g[k] = { n: 0, sum: 0 }); o.n++; o.sum += v; }
    Object.keys(g).forEach(function (k) { g[k].mean = g[k].sum / g[k].n; });
    return g;
  }

  /* ---------- 误差指标 ---------- */
  function rmse(y, p) { var s = 0; for (var i = 0; i < y.length; i++) s += (y[i] - p[i]) * (y[i] - p[i]); return Math.sqrt(s / y.length); }
  function mae(y, p) { var s = 0; for (var i = 0; i < y.length; i++) s += Math.abs(y[i] - p[i]); return s / y.length; }
  function r2(y, p) { var m = mean(y), a = 0, b = 0; for (var i = 0; i < y.length; i++) { a += (y[i] - p[i]) * (y[i] - p[i]); b += (y[i] - m) * (y[i] - m); } return 1 - a / b; }
  /** Poisson 偏差的平均值：2·mean(y log(y/μ) − (y − μ))；μ ≤ 0 时记为无穷大 */
  function poissonDev(y, mu) {
    var s = 0;
    for (var i = 0; i < y.length; i++) { if (!(mu[i] > 0)) return Infinity; s += (y[i] > 0 ? y[i] * Math.log(y[i] / mu[i]) : 0) - (y[i] - mu[i]); }
    return 2 * s / y.length;
  }
  /** 分位数损失（pinball）：τ(y − q)₊ + (1 − τ)(q − y)₊ 的平均 */
  function pinball(y, q, tau) { var s = 0; for (var i = 0; i < y.length; i++) { var d = y[i] - q[i]; s += d >= 0 ? tau * d : (tau - 1) * d; } return s / y.length; }

  /* ---------- 线性代数（小矩阵，按行展开的 Float64Array） ---------- */
  /** 对称正定矩阵的 Cholesky 分解 A = L Lᵀ；不正定时在对角线上加一点点（相对于对角线的平均） */
  function chol(A, p) {
    var tr = 0, i, j, k; for (i = 0; i < p; i++) tr += A[i * p + i];
    var jitter = 0;
    for (var attempt = 0; attempt < 6; attempt++) {
      var L = new Float64Array(p * p), ok = true;
      for (i = 0; i < p && ok; i++) {
        for (j = 0; j <= i; j++) {
          var s = A[i * p + j] + (i === j ? jitter : 0);
          for (k = 0; k < j; k++) s -= L[i * p + k] * L[j * p + k];
          if (i === j) { if (!(s > 0)) { ok = false; break; } L[i * p + i] = Math.sqrt(s); }
          else L[i * p + j] = s / L[j * p + j];
        }
      }
      if (ok) { L.jitter = jitter; return L; }
      jitter = jitter ? jitter * 100 : 1e-10 * (tr / p || 1);
    }
    throw new Error("矩阵不是正定的（特征之间完全共线？）");
  }
  function cholSolve(L, p, b) {
    var y = new Float64Array(p), x = new Float64Array(p), i, k;
    for (i = 0; i < p; i++) { var s = b[i]; for (k = 0; k < i; k++) s -= L[i * p + k] * y[k]; y[i] = s / L[i * p + i]; }
    for (i = p - 1; i >= 0; i--) { var t = y[i]; for (k = i + 1; k < p; k++) t -= L[k * p + i] * x[k]; x[i] = t / L[i * p + i]; }
    return x;
  }
  function cholInv(L, p) {
    var inv = new Float64Array(p * p), e = new Float64Array(p);
    for (var j = 0; j < p; j++) { e.fill(0); e[j] = 1; var c = cholSolve(L, p, e); for (var i = 0; i < p; i++) inv[i * p + j] = c[i]; }
    return inv;
  }

  /* ---------- 设计矩阵 ---------- */
  /** cols：[{ name, f: function (i) → 数 }]；rows：行号。返回 { X, n, p, names, rows } */
  function design(cols, rows) {
    var n = rows.length, p = cols.length, X = new Float64Array(n * p);
    for (var r = 0; r < n; r++) { var i = rows[r]; for (var j = 0; j < p; j++) X[r * p + j] = cols[j].f(i); }
    return { X: X, n: n, p: p, names: cols.map(function (c) { return c.name; }), rows: rows };
  }
  /** 类别变量的哑变量：levels 里第一个是基准（不出列） */
  function dummies(prefix, levels, get) {
    return levels.slice(1).map(function (lv) { return { name: prefix + "=" + lv, f: function (i) { return get(i) === lv ? 1 : 0; } }; });
  }
  function xtx(D, w) {
    var X = D.X, n = D.n, p = D.p, A = new Float64Array(p * p), r, j, k;
    for (r = 0; r < n; r++) {
      var o = r * p, wr = w ? w[r] : 1;
      for (j = 0; j < p; j++) { var xj = X[o + j] * wr; if (xj === 0) continue; for (k = 0; k <= j; k++) A[j * p + k] += xj * X[o + k]; }
    }
    for (j = 0; j < p; j++) for (k = j + 1; k < p; k++) A[j * p + k] = A[k * p + j];
    return A;
  }
  function xty(D, y, w) {
    var X = D.X, n = D.n, p = D.p, b = new Float64Array(p);
    for (var r = 0; r < n; r++) { var o = r * p, yr = y[r] * (w ? w[r] : 1); for (var j = 0; j < p; j++) b[j] += X[o + j] * yr; }
    return b;
  }
  function predict(D, beta) {
    var X = D.X, n = D.n, p = D.p, out = new Float64Array(n);
    for (var r = 0; r < n; r++) { var o = r * p, s = 0; for (var j = 0; j < p; j++) s += X[o + j] * beta[j]; out[r] = s; }
    return out;
  }

  /* ---------- 最小二乘 ---------- */
  /** D：design 的结果；y：与 D.rows 对齐的 Float64Array。opt.nw：Newey–West 的滞后阶数（行按时间顺序排时才有意义）。
   *  返回系数、三种标准误、t 值、R²、调整后 R²、残差与拟合值 */
  function ols(D, y, opt) {
    opt = opt || {};
    var n = D.n, p = D.p, A = xtx(D), L = chol(A, p), beta = cholSolve(L, p, xty(D, y)), inv = cholInv(L, p);
    var fit = predict(D, beta), e = new Float64Array(n), rss = 0, my = mean(y), tss = 0, r, j, k;
    for (r = 0; r < n; r++) { e[r] = y[r] - fit[r]; rss += e[r] * e[r]; tss += (y[r] - my) * (y[r] - my); }
    var s2 = rss / (n - p), se = new Float64Array(p);
    for (j = 0; j < p; j++) se[j] = Math.sqrt(s2 * inv[j * p + j]);
    // 夹心估计：inv · S · inv，S 由 z_r = x_r e_r 构成
    function sandwich(S, scale) {
      var T = new Float64Array(p * p), V = new Float64Array(p), a, b, c;
      for (a = 0; a < p; a++) for (b = 0; b < p; b++) { var s = 0; for (c = 0; c < p; c++) s += inv[a * p + c] * S[c * p + b]; T[a * p + b] = s; }
      for (a = 0; a < p; a++) { var v = 0; for (c = 0; c < p; c++) v += T[a * p + c] * inv[c * p + a]; V[a] = Math.sqrt(Math.max(0, v * scale)); }
      return V;
    }
    var X = D.X, S0 = new Float64Array(p * p);
    for (r = 0; r < n; r++) { var o = r * p, e2 = e[r] * e[r]; for (j = 0; j < p; j++) for (k = 0; k <= j; k++) S0[j * p + k] += X[o + j] * X[o + k] * e2; }
    for (j = 0; j < p; j++) for (k = j + 1; k < p; k++) S0[j * p + k] = S0[k * p + j];
    var seHC = sandwich(S0, n / (n - p)), seNW = null;
    if (opt.nw != null) {
      var Lg = Math.max(0, opt.nw | 0), S = S0.slice();
      for (var l = 1; l <= Lg; l++) {
        var wl = 1 - l / (Lg + 1);
        for (r = l; r < n; r++) {
          var o1 = r * p, o2 = (r - l) * p, ee = e[r] * e[r - l] * wl;
          for (j = 0; j < p; j++) { var xj = X[o1 + j] * ee; for (k = 0; k < p; k++) { var v = xj * X[o2 + k]; S[j * p + k] += v; S[k * p + j] += v; } }
        }
      }
      seNW = sandwich(S, 1);
    }
    var t = new Float64Array(p), tHC = new Float64Array(p), tNW = seNW ? new Float64Array(p) : null;
    for (j = 0; j < p; j++) { t[j] = beta[j] / se[j]; tHC[j] = beta[j] / seHC[j]; if (tNW) tNW[j] = beta[j] / seNW[j]; }
    var R2 = 1 - rss / tss;
    return { beta: beta, se: se, seHC: seHC, seNW: seNW, t: t, tHC: tHC, tNW: tNW, r2: R2, adjR2: 1 - (1 - R2) * (n - 1) / (n - p), sigma: Math.sqrt(s2),
             resid: e, fitted: fit, n: n, p: p, names: D.names, rss: rss, jitter: L.jitter || 0 };
  }

  /* ---------- Poisson 回归（对数连接），IRLS ---------- */
  /** offset：与 D.rows 对齐的 log 暴露量（可省）。返回系数、按模型的标准误、Pearson 离散度 φ 与准 Poisson 标准误 */
  function poisson(D, y, offset, opt) {
    opt = opt || {};
    var n = D.n, p = D.p, beta = new Float64Array(p), w = new Float64Array(n), z = new Float64Array(n), eta, mu = new Float64Array(n), r, it;
    var ybar = mean(y) || 1, intercept = D.names.indexOf("截距");
    if (intercept >= 0) beta[intercept] = Math.log(ybar) - (offset ? mean(offset) : 0);
    var L = null, maxIt = opt.maxIt || 60, converged = false;
    for (it = 0; it < maxIt; it++) {
      eta = predict(D, beta);
      for (r = 0; r < n; r++) {
        var et = eta[r] + (offset ? offset[r] : 0); if (et > 30) et = 30;
        mu[r] = Math.exp(et); w[r] = mu[r]; z[r] = eta[r] + (y[r] - mu[r]) / mu[r];
      }
      L = chol(xtx(D, w), p);
      var nb = cholSolve(L, p, xty(D, z, w)), diff = 0;
      for (var j = 0; j < p; j++) diff = Math.max(diff, Math.abs(nb[j] - beta[j]));
      beta = nb;
      if (diff < 1e-8) { converged = true; it++; break; }
    }
    eta = predict(D, beta);
    var dev = 0, pear = 0;
    for (r = 0; r < n; r++) { var m = Math.exp(eta[r] + (offset ? offset[r] : 0)); mu[r] = m; dev += (y[r] > 0 ? y[r] * Math.log(y[r] / m) : 0) - (y[r] - m); pear += (y[r] - m) * (y[r] - m) / m; w[r] = m; }
    var inv = cholInv(chol(xtx(D, w), p), p), phi = pear / (n - p), se = new Float64Array(p), seQ = new Float64Array(p);
    for (var k = 0; k < p; k++) { se[k] = Math.sqrt(inv[k * p + k]); seQ[k] = se[k] * Math.sqrt(phi); }
    return { beta: beta, se: se, seQ: seQ, phi: phi, dev: 2 * dev / n, mu: mu, iters: it, converged: converged, names: D.names };
  }
  /** 用拟合好的系数在另一组行上预测均值 exp(Xβ + offset) */
  function poissonPredict(D, beta, offset) {
    var eta = predict(D, beta), out = new Float64Array(D.n);
    for (var r = 0; r < D.n; r++) out[r] = Math.exp(Math.min(30, eta[r] + (offset ? offset[r] : 0)));
    return out;
  }

  /** 方差膨胀因子：第 j 列对其余各列（含截距）回归的 R²，VIF = 1/(1 − R²)。D 的第一列必须是截距 */
  function vif(D) {
    var out = [];
    for (var j = 1; j < D.p; j++) {
      var cols = [], y = new Float64Array(D.n), r, k;
      for (r = 0; r < D.n; r++) y[r] = D.X[r * D.p + j];
      for (k = 0; k < D.p; k++) if (k !== j) cols.push(k);
      var sub = { X: new Float64Array(D.n * cols.length), n: D.n, p: cols.length, names: cols.map(function (c) { return D.names[c]; }) };
      for (r = 0; r < D.n; r++) for (k = 0; k < cols.length; k++) sub.X[r * cols.length + k] = D.X[r * D.p + cols[k]];
      var f = ols(sub, y);
      out.push({ name: D.names[j], r2: f.r2, vif: 1 / (1 - f.r2) });
    }
    return out;
  }

  /* ---------- 分布 ---------- */
  function normCdf(x) {
    // Abramowitz–Stegun 7.1.26 的误差在 1.5e-7 以内，这里够用
    var t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }
  /** 双侧 p 值（大样本，按正态近似） */
  function pTwo(t) { return 2 * (1 - normCdf(Math.abs(t))); }
  /** Poisson(λ) 的 τ 分位数：最小的 k 使 P(N ≤ k) ≥ τ */
  function poissonQuantile(lam, tau) {
    var k = 0, pk = Math.exp(-lam), c = pk;
    while (c < tau && k < 10000) { k++; pk *= lam / k; c += pk; }
    return k;
  }

  /* ---------- 划分 ---------- */
  /** 用页面的随机数发生器把行号打乱（Fisher–Yates） */
  function shuffle(rows, rng) {
    var a = Array.prototype.slice.call(rows);
    for (var i = a.length - 1; i > 0; i--) { var j = rng.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /** 把行分成 k 折（打乱之后轮流分） */
  function kfold(rows, k, rng) {
    var a = shuffle(rows, rng), folds = []; for (var f = 0; f < k; f++) folds.push([]);
    a.forEach(function (r, i) { folds[i % k].push(r); });
    return folds;
  }

  return { rowsOf: rowsOf, pick: pick, finite: finite, mean: mean, variance: variance, sd: sd, quantile: quantile, median: median, moments: moments,
           autocorr: autocorr, corr: corr, hist: hist, groupMean: groupMean, rmse: rmse, mae: mae, r2: r2, poissonDev: poissonDev, pinball: pinball,
           chol: chol, cholSolve: cholSolve, cholInv: cholInv, design: design, dummies: dummies, predict: predict, ols: ols, poisson: poisson,
           poissonPredict: poissonPredict, vif: vif, normCdf: normCdf, pTwo: pTwo, poissonQuantile: poissonQuantile, shuffle: shuffle, kfold: kfold };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLCS;
