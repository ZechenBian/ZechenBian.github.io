// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 指标与检验（QL.mlstats，算法里是 lib.stats）
 * 页面和后台线程各装一份：线程的源码是用 toString() 拼出来的，所以这个函数必须自包含，
 * 只用参数 QL（只用到 QL.RNG）和标准 JavaScript。所有函数都不改动传进来的数组。
 * 运行器会把 QL.mlstats 冻结起来，所以这里不在 S 上存任何会变的状态。 */
function QL_MLSTATS_INSTALL(QL) {
"use strict";
var S = { version: 1 };
var SQRT2PI = Math.sqrt(2 * Math.PI), P_MIN = 1e-15;
var log1p = Math.log1p || function (x) { var u = 1 + x; return u === 1 ? x : Math.log(u) * x / (u - 1); };
var expm1 = Math.expm1 || function (x) { var u = Math.exp(x); return u === 1 ? x : u - 1 === -1 ? -1 : (u - 1) * x / Math.log(u); };

function isArr(a) { return a != null && typeof a === "object" && typeof a.length === "number"; }
function need(a, what) { if (!isArr(a)) throw new Error("mlstats：" + what + " 应该是数组"); return a; }
function sameLen(a, b, who) {
  need(a, who + " 的第一个数组"); need(b, who + " 的第二个数组");
  if (a.length !== b.length) throw new Error("mlstats." + who + "：两个数组长度不一致（" + a.length + " 与 " + b.length + "）");
  return a.length;
}
function defRng(rng) { return rng && typeof rng.int === "function" ? rng : new QL.RNG(20261021, 7, 0); }

/* ================================================================== *
 *  一、基本统计
 * ================================================================== */
function mean(a) { var n = a.length, s = 0; for (var i = 0; i < n; i++) s += a[i]; return n ? s / n : NaN; }
/** 无偏样本方差（除以 n − 1） */
function variance(a) {
  var n = a.length; if (n < 2) return NaN;
  var m = mean(a), s = 0; for (var i = 0; i < n; i++) { var d = a[i] - m; s += d * d; }
  return s / (n - 1);
}
function corr(x, y) {
  var n = sameLen(x, y, "corr"); if (n < 2) return NaN;
  var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
  for (var i = 0; i < n; i++) { var a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
// NaN 会让排序的比较函数前后矛盾，先换成 −∞（排在最后/最前，不至于打乱别的元素）
function cleanScores(a) { var n = a.length, s = new Float64Array(n); for (var i = 0; i < n; i++) { var v = +a[i]; s[i] = v === v ? v : -Infinity; } return s; }
function order(s, desc) {
  var n = s.length, idx = new Array(n), i;
  for (i = 0; i < n; i++) idx[i] = i;
  idx.sort(desc ? function (a, b) { return (s[b] - s[a]) || (a - b); } : function (a, b) { return (s[a] - s[b]) || (a - b); });
  return idx;
}
/** 秩（从 1 起），并列取平均秩 */
function ranks(a) {
  var s = cleanScores(need(a, "ranks 的输入")), n = s.length, idx = order(s, false), r = new Float64Array(n), i = 0;
  while (i < n) {
    var j = i; while (j + 1 < n && s[idx[j + 1]] === s[idx[i]]) j++;
    var avg = (i + j) / 2 + 1; for (var q = i; q <= j; q++) r[idx[q]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(x, y) { sameLen(x, y, "spearman"); return corr(ranks(x), ranks(y)); }
/** 已排好序的数组的 q 分位数（线性插值，与 QL.quantileSorted 相同的约定） */
function quantile(sorted, q) {
  var n = sorted.length; if (!n) return NaN;
  q = q < 0 ? 0 : q > 1 ? 1 : q;
  var h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}
/** 等宽直方图：区间外的值和非有限值不计（与 numpy 相同），hi 落进最后一格 */
function histogram(values, bins, lo, hi) {
  need(values, "histogram 的输入");
  bins = Math.max(1, (bins | 0) || 20);
  var i, v, n = values.length;
  if (lo == null || hi == null) {
    var mn = Infinity, mx = -Infinity;
    for (i = 0; i < n; i++) { v = values[i]; if (v === v && v !== Infinity && v !== -Infinity) { if (v < mn) mn = v; if (v > mx) mx = v; } }
    if (mn === Infinity) { mn = 0; mx = 1; }
    if (lo == null) lo = mn; if (hi == null) hi = mx;
  }
  if (!(hi > lo)) { lo = lo - 0.5; hi = lo + 1; }   // 全部相等时撑开一格，否则宽度为 0
  var counts = new Int32Array(bins), w = (hi - lo) / bins, cnt = 0;
  for (i = 0; i < n; i++) {
    v = values[i]; if (!(v >= lo && v <= hi)) continue;
    var b = Math.floor((v - lo) / w); if (b >= bins) b = bins - 1;
    counts[b]++; cnt++;
  }
  return { lo: lo, hi: hi, counts: counts, n: cnt, width: w };
}
S.mean = mean; S.variance = variance; S.corr = corr; S.spearman = spearman; S.ranks = ranks; S.quantile = quantile; S.histogram = histogram;

/* ================================================================== *
 *  二、分布函数
 * ================================================================== */
function normPdf(x) { return Math.exp(-x * x / 2) / SQRT2PI; }
/** 标准正态分布函数。|x| < 2 用 Φ(x) = 1/2 + φ(x)·Σ x^(2n+1)/(2n+1)!!（正项级数）；
 *  |x| ≥ 2 用 Mills 比的 Laplace 连分式算尾部 φ(z)/(z + 1/(z + 2/(z + …)))，最多约 100 项。
 *  尾部按相对误差算（约 1e-14），所以 normCdf(−30) 也是准的；常用的 Hart/West 近似在尾部只有 1e-8。 */
function normCdf(x) {
  if (x !== x) return NaN;
  var z = Math.abs(x), c, n;
  if (z < 2) {
    var s = z, t = z, z2 = z * z;
    for (n = 1; n < 100; n++) { t *= z2 / (2 * n + 1); s += t; if (t < 1e-17 * s) break; }
    c = 0.5 - Math.exp(-z2 / 2) / SQRT2PI * s;
  } else if (z > 38.6) c = 0;   // 再往外 exp 下溢
  else {
    var f = z, C = z, D = 0;   // 修正 Lentz 法
    for (n = 1; n < 400; n++) { D = 1 / (z + n * D); C = z + n / C; var del = C * D; f *= del; if (Math.abs(del - 1) < 1e-16) break; }
    c = Math.exp(-z * z / 2) / SQRT2PI / f;
  }
  return x > 0 ? 1 - c : c;
}
function acklam(p) {   // 只在 p ≤ 0.5 时调用；相对误差约 1e-9，下面再用一步 Halley 修到机器精度
  var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
      b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
      c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
      d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  var q, r;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** 标准正态分位数：Acklam 初值 + 一步 Halley 迭代（误差远小于 1e-9） */
function normInv(p) {
  if (p !== p) return NaN;
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  if (p > 0.5) return -normInv(1 - p);   // p ∈ [0.5, 1] 时 1 − p 是精确的；只在下尾算，尾部才有相对精度
  var x = acklam(p), e = normCdf(x) - p, u = e * SQRT2PI * Math.exp(x * x / 2);
  if (u === u && u !== Infinity && u !== -Infinity) x = x - u / (1 + x * u / 2);
  return x;
}
var LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
/** ln Γ(x)（Lanczos，g = 7，相对误差约 1e-15） */
function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  x -= 1;
  var a = LANCZOS[0], t = x + 7.5;
  for (var i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(a, b, x) {   // 不完全贝塔函数的连分式（修正 Lentz 法，Numerical Recipes 6.4）
  var TINY = 1e-300, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap, h, m, m2, aa, del;
  if (Math.abs(d) < TINY) d = TINY; d = 1 / d; h = d;
  for (m = 1; m <= 20000; m++) {
    m2 = 2 * m;
    aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
/** 正则化不完全贝塔函数 I_x(a, b)。y = 1 − x 可以单独传进来：x 很接近 1 时直接算 1 − x 会丢精度 */
function betaInc(x, a, b, y) {
  if (y == null) y = 1 - x;
  if (x !== x || !(a > 0) || !(b > 0)) return NaN;
  if (!(x > 0)) return 0; if (!(y > 0)) return 1;
  var lx = x < 0.5 ? Math.log(x) : log1p(-y), ly = y < 0.5 ? Math.log(y) : log1p(-x);
  var bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * lx + b * ly);
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, y) / b;
}
/** Student t 的双侧尾概率 P(|T| ≥ |t|) = I_{ν/(ν+t²)}(ν/2, 1/2)，直接算尾部，没有 1 − (…) 的相消 */
function tTwoSided(t, df) {
  if (t !== t || !(df > 0)) return NaN;
  var at = Math.abs(t);
  if (at === Infinity) return 0;
  if (df > 1e6) {   // ν 极大时连分式收敛慢；用带 1/ν 修正项的正态近似，误差 O(1/ν²)
    var c = normCdf(-at) + normPdf(at) * (at * at * at + at) / (4 * df);
    return Math.min(1, 2 * c);
  }
  var t2 = at * at, x = df / (df + t2), y = t2 / (df + t2);
  return betaInc(x, df / 2, 0.5, y);
}
function tCdf(t, df) {
  if (t !== t || !(df > 0)) return NaN;
  if (df === Infinity) return normCdf(t);
  var tail = tTwoSided(t, df) / 2;
  return t > 0 ? 1 - tail : tail;
}
/** 正则化上不完全伽马函数 Q(a, x) = Γ(a, x) / Γ(a) */
function gammaQ(a, x) {
  if (x !== x || !(a > 0)) return NaN;
  if (x <= 0) return 1; if (x === Infinity) return 0;
  var lf = -x + a * Math.log(x) - lnGamma(a), i;
  if (x < a + 1) {   // 级数算 P，此时 Q 不会太小，1 − P 不丢精度
    var ap = a, sum = 1 / a, del = sum;
    for (i = 0; i < 100000; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return Math.max(0, 1 - sum * Math.exp(lf));
  }
  var TINY = 1e-300, b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;   // 连分式直接算 Q
  for (i = 1; i < 100000; i++) {
    var an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY; c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; var dl = d * c; h *= dl; if (Math.abs(dl - 1) < 1e-15) break;
  }
  return Math.exp(lf) * h;
}
function chi2Sf(x, df) { if (!(df > 0)) return NaN; return gammaQ(df / 2, x / 2); }
/** 二项分布 Bin(n, 1/2) 的精确双侧 p 值：2·P(X ≤ min(k, n − k))，不超过 1 */
function binomTwoSided(k, n) {
  n = Math.round(n); k = Math.round(k);
  if (!(n >= 0) || !(k >= 0) || k > n) return NaN;
  var m = Math.min(k, n - k);
  if (2 * m >= n) return 1;
  // m < n/2 时第 m 项最大；从它往下按比例累加，避免 2^(−n) 下溢
  var lpm = -n * Math.LN2, i;
  for (i = 1; i <= m; i++) lpm += Math.log((n - i + 1) / i);
  var s = 1, r = 1;
  for (i = m; i >= 1; i--) { r *= i / (n - i + 1); s += r; if (r < 1e-17 * s) break; }
  return Math.min(1, 2 * s * Math.exp(lpm));
}
S.normPdf = normPdf; S.normCdf = normCdf; S.normInv = normInv; S.lnGamma = lnGamma; S.betaInc = betaInc; S.gammaQ = gammaQ;
S.tCdf = tCdf; S.tTwoSided = tTwoSided; S.chi2Sf = chi2Sf; S.binomTwoSided = binomTwoSided;

/* ================================================================== *
 *  三、指标
 * ================================================================== */
function argmaxRow(p, off, k) { var b = 0, bv = p[off]; for (var c = 1; c < k; c++) if (p[off + c] > bv) { bv = p[off + c]; b = c; } return b; }   // 并列取下标小的
function kOf(pred, truth, k, who) {
  var n = truth.length;
  if (!(k > 0)) k = n ? Math.round(pred.length / n) : 0;
  if (pred.length !== n * k) throw new Error("mlstats." + who + "：分类的预测应是 n×k 个概率（n = " + n + "，k = " + k + "），实际长度是 " + pred.length);
  return k;
}
function label(truth, i, k, who) {
  var y = truth[i];
  if (!(y >= 0 && y < k) || y !== Math.floor(y)) throw new Error("mlstats." + who + "：第 " + i + " 个样本的类别 " + y + " 不在 0.." + (k - 1) + " 里");
  return y;
}
/** Mann–Whitney 形式的 AUC：随机取一个正例和一个负例，正例得分更高的概率，并列算 1/2 */
function aucOf(score, pos) {
  var r = ranks(score), n = r.length, nP = 0, sR = 0;
  for (var i = 0; i < n; i++) if (pos[i]) { nP++; sR += r[i]; }
  var nN = n - nP; if (!nP || !nN) return null;
  return (sR - nP * (nP + 1) / 2) / (nP * nN);
}
function regM(pred, truth, who) {
  var n = sameLen(pred, truth, who), sse = 0, sae = 0, sy = 0, i, e;
  if (!n) return { mse: NaN, rmse: NaN, mae: NaN, r2: NaN };
  for (i = 0; i < n; i++) { e = pred[i] - truth[i]; sse += e * e; sae += Math.abs(e); sy += truth[i]; }
  var my = sy / n, sst = 0;
  for (i = 0; i < n; i++) { e = truth[i] - my; sst += e * e; }
  var mse = sse / n;
  return { mse: mse, rmse: Math.sqrt(mse), mae: sae / n, r2: sst > 0 ? 1 - sse / sst : 0 };
}
function clsM(pred, truth, k) {
  need(pred, "预测"); need(truth, "真值");
  k = kOf(pred, truth, k, "metrics");
  var n = truth.length, i, c;
  if (!n) return { acc: NaN, logloss: NaN, brier: NaN, f1: NaN, auc: null };
  var tp = new Float64Array(k), fp = new Float64Array(k), fn = new Float64Array(k), seen = new Uint8Array(k), hit = 0, ll = 0, br = 0;
  for (i = 0; i < n; i++) {
    var off = i * k, y = label(truth, i, k, "metrics"), a = argmaxRow(pred, off, k);
    if (a === y) { hit++; tp[y]++; } else { fp[a]++; fn[y]++; }
    seen[y] = 1; seen[a] = 1;
    ll -= Math.log(Math.max(pred[off + y], P_MIN));
    for (c = 0; c < k; c++) { var d = pred[off + c] - (c === y ? 1 : 0); br += d * d; }
  }
  var f1 = 0, nc = 0;
  for (c = 0; c < k; c++) if (seen[c]) { f1 += 2 * tp[c] / (2 * tp[c] + fp[c] + fn[c]); nc++; }
  var auc = null;
  if (k === 2) { var sc = new Float64Array(n), pos = new Uint8Array(n); for (i = 0; i < n; i++) { sc[i] = pred[2 * i + 1]; pos[i] = truth[i] === 1 ? 1 : 0; } auc = aucOf(sc, pos); }
  return { acc: hit / n, logloss: ll / n, brier: br / n, f1: nc ? f1 / nc : NaN, auc: auc };
}
/* 预测（forecast）任务：pred[i] 是某个原点 t 往后某一步的预测，truth[i] 是对应的实际值。
 * 第五个参数 extra（可选）：
 *   extra.origin       与 pred 等长：每个预测所在原点的观测 y_t，用来算方向准确率 dirAcc
 *   extra.naiveAbsErr  与 pred 等长：同一批目标上朴素预测（ŷ = y_t）的绝对误差，用来算 MASE = MAE / mean(naiveAbsErr)
 * 没给的那一项返回 null。 */
function fcM(pred, truth, extra) {
  var base = regM(pred, truth, "metrics"), n = truth.length, i;
  var M = { mse: base.mse, rmse: base.rmse, mae: base.mae, mase: null, dirAcc: null };
  extra = extra || {};
  if (extra.naiveAbsErr != null) {
    sameLen(extra.naiveAbsErr, truth, "metrics（naiveAbsErr）");
    var mn = mean(extra.naiveAbsErr);
    M.mase = mn > 0 && n ? base.mae / mn : null;   // 序列是常数时朴素误差为 0，MASE 没有定义
  }
  if (extra.origin != null) {
    var o = extra.origin; sameLen(o, truth, "metrics（origin）");
    var tot = 0, hit = 0;
    for (i = 0; i < n; i++) {
      var sp = Math.sign(pred[i] - o[i]), st = Math.sign(truth[i] - o[i]);
      if (sp && st && sp === sp && st === st) { tot++; if (sp === st) hit++; }
    }
    M.dirAcc = tot ? hit / tot : null;
  }
  return M;
}
/** 指标。kind：regression | classification | forecast；分类时 pred 是按行展开的 n×k 概率；forecast 的 extra 见上 */
S.metrics = function (kind, pred, truth, k, extra) {
  if (kind === "regression") return regM(pred, truth, "metrics");
  if (kind === "classification") return clsM(pred, truth, k);
  if (kind === "forecast") return fcM(pred, truth, extra);
  throw new Error("mlstats.metrics：未知的任务类型「" + kind + "」（应为 regression / classification / forecast）");
};
/** 逐样本损失（给配对检验用）：回归 / 预测是平方误差，分类是对数损失（概率下限 1e-15）外加 0-1 正确与否 */
S.perExample = function (kind, pred, truth, k) {
  var n, i, loss;
  if (kind === "classification") {
    need(pred, "预测"); need(truth, "真值");
    k = kOf(pred, truth, k, "perExample"); n = truth.length; loss = new Float64Array(n);
    var correct = new Uint8Array(n);
    for (i = 0; i < n; i++) { var y = label(truth, i, k, "perExample"), off = i * k; loss[i] = -Math.log(Math.max(pred[off + y], P_MIN)); correct[i] = argmaxRow(pred, off, k) === y ? 1 : 0; }
    return { loss: loss, correct: correct };
  }
  if (kind === "regression" || kind === "forecast") {
    n = sameLen(pred, truth, "perExample"); loss = new Float64Array(n);
    for (i = 0; i < n; i++) { var e = pred[i] - truth[i]; loss[i] = e * e; }
    return { loss: loss };
  }
  throw new Error("mlstats.perExample：未知的任务类型「" + kind + "」");
};
/** 最简单的基线：回归 = 训练集 y 的均值；分类 = 训练集各类的频率（每类加 0.5 平滑，免得没见过的类概率为 0、对数损失爆掉）。
 *  train 可以是 { y } 也可以直接是 y。预测任务的朴素基线（上一个值）由运行器自己算。 */
S.baselinePred = function (kind, train, nOut, k) {
  var y = need(train && train.y != null ? train.y : train, "训练集的 y"), n = y.length, i, c;
  nOut = Math.max(0, nOut | 0);
  if (kind === "regression") { var m = n ? mean(y) : 0, out = new Float64Array(nOut); out.fill(m); return out; }
  if (kind === "classification") {
    k = k > 0 ? k : train && train.k > 0 ? train.k : 0;
    if (!k) { for (i = 0; i < n; i++) if (y[i] + 1 > k) k = y[i] + 1; }
    if (!(k > 0)) throw new Error("mlstats.baselinePred：不知道类别数 k");
    var cnt = new Float64Array(k);
    for (i = 0; i < n; i++) cnt[label(y, i, k, "baselinePred")]++;
    var p = new Float64Array(k), tot = n + 0.5 * k;
    for (c = 0; c < k; c++) p[c] = (cnt[c] + 0.5) / tot;
    var o = new Float64Array(nOut * k);
    for (i = 0; i < nOut; i++) for (c = 0; c < k; c++) o[i * k + c] = p[c];
    return o;
  }
  if (kind === "forecast") throw new Error("mlstats.baselinePred：预测任务的朴素基线（上一个值）由运行器计算");
  throw new Error("mlstats.baselinePred：未知的任务类型「" + kind + "」");
};
/** 混淆矩阵 k×k（行 = 真实类别，列 = 预测类别）。pred 可以是 n×k 概率（取 argmax），也可以是 n 个类别编号 */
S.confusion = function (pred, truth, k) {
  need(pred, "预测"); need(truth, "真值");
  var n = truth.length, i;
  if (!(k > 0)) {   // 没给 k：从真值和预测里推断
    k = 0;
    for (i = 0; i < n; i++) if (truth[i] + 1 > k) k = truth[i] + 1;
    if (pred.length === n) { for (i = 0; i < n; i++) if (pred[i] + 1 > k) k = pred[i] + 1; }
    else if (n) k = Math.max(k, Math.round(pred.length / n));
  }
  var probs = pred.length === n * k && k > 1;
  if (!probs && pred.length !== n) throw new Error("mlstats.confusion：预测的长度应为 n 或 n×k");
  var M = new Int32Array(k * k);
  for (i = 0; i < n; i++) {
    var y = label(truth, i, k, "confusion"), a = probs ? argmaxRow(pred, i * k, k) : pred[i];
    if (!(a >= 0 && a < k)) throw new Error("mlstats.confusion：第 " + i + " 个预测类别 " + a + " 超出范围");
    M[y * k + a]++;
  }
  return M;
};
// 二分类曲线的输入：prob 是 P(类别 1)，长度 n；也接受 n×2 的概率矩阵（取第 2 列）
function binScores(prob, truth, who) {
  need(prob, "概率"); need(truth, "真值");
  var n = truth.length, i, s;
  if (prob.length === 2 * n && n > 0) { s = new Float64Array(n); for (i = 0; i < n; i++) s[i] = prob[2 * i + 1]; }
  else if (prob.length === n) s = prob;
  else throw new Error("mlstats." + who + "：概率的长度应为 n 或 2n");
  var pos = new Uint8Array(n), nP = 0;
  for (i = 0; i < n; i++) { pos[i] = truth[i] == 1 ? 1 : 0; nP += pos[i]; }
  return { s: cleanScores(s), pos: pos, n: n, nP: nP };
}
/** ROC 曲线：阈值从高到低，并列得分作为一个台阶；auc 是曲线下梯形面积（等于并列算 1/2 的 Mann–Whitney） */
S.roc = function (prob, truth) {
  var B = binScores(prob, truth, "roc"), s = B.s, n = B.n, P = B.nP, N = n - P;
  if (!P || !N) return { fpr: new Float64Array([0, 1]), tpr: new Float64Array([0, 1]), thr: new Float64Array([Infinity, -Infinity]), auc: null };
  var idx = order(s, true), fpr = [0], tpr = [0], thr = [Infinity], tp = 0, fp = 0, i = 0, auc = 0;
  while (i < n) {
    var v = s[idx[i]];
    while (i < n && s[idx[i]] === v) { if (B.pos[idx[i]]) tp++; else fp++; i++; }
    var f = fp / N, t = tp / P;
    auc += (f - fpr[fpr.length - 1]) * (t + tpr[tpr.length - 1]) / 2;
    fpr.push(f); tpr.push(t); thr.push(v);
  }
  return { fpr: Float64Array.from(fpr), tpr: Float64Array.from(tpr), thr: Float64Array.from(thr), auc: auc };
};
/** 精确率–召回率曲线；ap = Σ (R_k − R_{k−1})·P_k（台阶式平均精确率，与 sklearn 的 average_precision_score 相同） */
S.pr = function (prob, truth) {
  var B = binScores(prob, truth, "pr"), s = B.s, n = B.n, P = B.nP;
  if (!P) return { recall: new Float64Array([0]), precision: new Float64Array([1]), thr: new Float64Array([Infinity]), ap: null };
  var idx = order(s, true), rec = [0], prec = [1], thr = [Infinity], tp = 0, fp = 0, i = 0, ap = 0;
  while (i < n) {
    var v = s[idx[i]];
    while (i < n && s[idx[i]] === v) { if (B.pos[idx[i]]) tp++; else fp++; i++; }
    var r = tp / P, p = tp / (tp + fp);
    ap += (r - rec[rec.length - 1]) * p;
    rec.push(r); prec.push(p); thr.push(v);
  }
  return { recall: Float64Array.from(rec), precision: Float64Array.from(prec), thr: Float64Array.from(thr), ap: ap };
};
/** 校准（可靠性图）。prob 长度为 n（或 n×2）时按二分类：横轴 P(类别 1)、纵轴类别 1 的实际频率；
 *  n×k（k ≥ 3）时按"置信度"：横轴最大概率、纵轴猜对的频率。等宽分箱，空箱的 conf / acc 为 NaN。
 *  ece = Σ_b (n_b / n)·|acc_b − conf_b|。 */
S.calibration = function (prob, truth, bins) {
  need(prob, "概率"); need(truth, "真值");
  bins = Math.max(1, (bins | 0) || 10);
  var n = truth.length, m = n ? Math.round(prob.length / n) : 1, i, b;
  if (prob.length !== n * m) throw new Error("mlstats.calibration：概率的长度应为 n 或 n×k");
  var mode = m <= 2 ? "binary" : "confidence";
  var sc = new Float64Array(bins), sh = new Float64Array(bins), count = new Int32Array(bins), tot = 0;
  for (i = 0; i < n; i++) {
    var p, hit;
    if (m === 1) { p = prob[i]; hit = truth[i] == 1 ? 1 : 0; }
    else if (m === 2) { p = prob[2 * i + 1]; hit = truth[i] == 1 ? 1 : 0; }
    else { var a = argmaxRow(prob, i * m, m); p = prob[i * m + a]; hit = a === truth[i] ? 1 : 0; }
    if (!(p >= 0 && p <= 1)) continue;
    b = Math.floor(p * bins); if (b >= bins) b = bins - 1;
    sc[b] += p; sh[b] += hit; count[b]++; tot++;
  }
  var mid = new Float64Array(bins), conf = new Float64Array(bins), acc = new Float64Array(bins), ece = 0;
  for (b = 0; b < bins; b++) {
    mid[b] = (b + 0.5) / bins;
    if (count[b]) { conf[b] = sc[b] / count[b]; acc[b] = sh[b] / count[b]; ece += count[b] / tot * Math.abs(acc[b] - conf[b]); }
    else { conf[b] = NaN; acc[b] = NaN; }
  }
  return { mid: mid, conf: conf, acc: acc, count: count, ece: tot ? ece : NaN, n: tot, mode: mode };
};

/* ================================================================== *
 *  四、检验
 * ================================================================== */
function bootMeans(x, B, rng) {
  var n = x.length, out = new Float64Array(B);
  for (var b = 0; b < B; b++) { var s = 0; for (var j = 0; j < n; j++) s += x[rng.int(n)]; out[b] = s / n; }
  out.sort();
  return out;
}
function sdOf(a) { var v = variance(a); return v === v ? Math.sqrt(v) : NaN; }
/** 均值的自助法：se 是自助均值的标准差，[lo, hi] 是 95% 百分位区间。rng 用 QL.RNG（不给就用固定种子，结果可复现） */
S.bootstrapMean = function (values, B, rng) {
  need(values, "bootstrapMean 的输入");
  B = Math.max(2, (B | 0) || 1000); rng = defRng(rng);
  var n = values.length; if (!n) return { mean: NaN, se: NaN, lo: NaN, hi: NaN, B: B };
  var x = Float64Array.from(values), bm = bootMeans(x, B, rng);
  return { mean: mean(x), se: sdOf(bm), lo: quantile(bm, 0.025), hi: quantile(bm, 0.975), B: B };
};
/** 配对自助法：对逐样本差 d = a − b 重抽样（同一批样本上比两个模型，所以要配对）。
 *  p：自助均值落在 0 另一侧的比例乘 2（不超过 1）；分辨率是 2/B，等于 0 时应读作 "< 2/B"。
 *  pNormal：用 diff / se 的正态近似得到的双侧 p，分辨率不受 B 限制。 */
S.pairedBootstrap = function (a, b, B, rng) {
  var n = sameLen(a, b, "pairedBootstrap"), i;
  B = Math.max(2, (B | 0) || 1000); rng = defRng(rng);
  if (!n) return { diff: NaN, se: NaN, lo: NaN, hi: NaN, p: NaN, pNormal: NaN, B: B, n: 0 };
  var d = new Float64Array(n); for (i = 0; i < n; i++) d[i] = a[i] - b[i];
  var diff = mean(d), bm = bootMeans(d, B, rng), le = 0, ge = 0;
  for (i = 0; i < B; i++) { if (bm[i] <= 0) le++; if (bm[i] >= 0) ge++; }
  var se = sdOf(bm), p = Math.min(1, 2 * Math.min(le, ge) / B);
  var pN = se > 0 ? Math.min(1, 2 * normCdf(-Math.abs(diff) / se)) : diff === 0 ? 1 : 0;
  return { diff: diff, se: se, lo: quantile(bm, 0.025), hi: quantile(bm, 0.975), p: p, pNormal: pN, B: B, n: n };
};
/** McNemar 检验：两个分类器在同一批样本上的对错。b = A 对 B 错，c = A 错 B 对；只有这两格有信息。
 *  b + c ≤ 50 用精确二项（Bin(b+c, 1/2)），否则用带连续性修正的卡方（自由度 1）。 */
S.mcnemar = function (correctA, correctB) {
  var n = sameLen(correctA, correctB, "mcnemar"), b = 0, c = 0;
  for (var i = 0; i < n; i++) { var ra = !!correctA[i], rb = !!correctB[i]; if (ra && !rb) b++; else if (!ra && rb) c++; }
  var m = b + c;
  if (!m) return { b: 0, c: 0, p: 1, stat: 0, exact: true, n: n };
  if (m <= 50) return { b: b, c: c, p: binomTwoSided(b, m), stat: null, exact: true, n: n };
  var z = Math.max(0, Math.abs(b - c) - 1), stat = z * z / m;
  return { b: b, c: c, p: chi2Sf(stat, 1), stat: stat, exact: false, n: n };
};
/** Diebold–Mariano 检验：两组预测的逐期损失之差 d_t = lossA_t − lossB_t 的均值是否为 0。
 *  长期方差用 Newey–West（Bartlett 权重 1 − j/h，滞后 h − 1），再乘 Harvey–Leybourne–Newbold 小样本修正
 *  √[(T + 1 − 2h + h(h − 1)/T) / T]，p 值查自由度 T − 1 的 t 分布（双侧）。stat > 0 表示 A 的损失更大。
 *  h = 1 时恰好等于对 d 做单样本 t 检验。
 *  opts.kernel = "rect"：改用原始 DM 的等权截断（γ0 + 2Σγ_j），对 MA(h − 1) 的损失无偏；算出负方差时退回 Bartlett。 */
S.dieboldMariano = function (lossA, lossB, h, opts) {
  var T = sameLen(lossA, lossB, "dieboldMariano"), i, j;
  h = Math.max(1, Math.round(h || 1)); opts = opts || {};
  var d = new Float64Array(T); for (i = 0; i < T; i++) d[i] = lossA[i] - lossB[i];
  var dbar = mean(d);
  if (T < 2) return { stat: NaN, p: NaN, dbar: dbar, dm: NaN, lrv: NaN, T: T, h: h };
  var L = Math.min(h - 1, T - 1), g = new Float64Array(L + 1);
  for (j = 0; j <= L; j++) { var s = 0; for (i = j; i < T; i++) s += (d[i] - dbar) * (d[i - j] - dbar); g[j] = s / T; }
  function lrv(rect) { var v = g[0]; for (var q = 1; q <= L; q++) v += 2 * (rect ? 1 : 1 - q / (L + 1)) * g[q]; return v; }
  var V = lrv(opts.kernel === "rect"); if (!(V > 0) && opts.kernel === "rect") V = lrv(false);
  var hl = (T + 1 - 2 * h + h * (h - 1) / T) / T;
  if (!(hl > 0)) return { stat: NaN, p: NaN, dbar: dbar, dm: NaN, lrv: V, T: T, h: h };   // 样本太短，h 相对 T 太大
  if (!(V > 0)) { var inf = dbar === 0 ? 0 : dbar > 0 ? Infinity : -Infinity; return { stat: inf, p: dbar === 0 ? 1 : 0, dbar: dbar, dm: inf, lrv: V, T: T, h: h }; }
  var dm = dbar / Math.sqrt(V / T), stat = dm * Math.sqrt(hl);
  return { stat: stat, p: tTwoSided(stat, T - 1), dbar: dbar, dm: dm, lrv: V, T: T, h: h };
};
// 多重比较：非有限的 p 值原样保留（NaN），不计入 m
function validP(p) { return p === p && p != null && p >= 0; }
/** Holm 逐步校正：控制族错误率，比 Bonferroni 强（同样不需要独立性） */
S.holm = function (pvals) {
  need(pvals, "p 值");
  var n = pvals.length, out = new Array(n), idx = [], i;
  for (i = 0; i < n; i++) { if (validP(pvals[i])) idx.push(i); else out[i] = NaN; }
  idx.sort(function (a, b) { return (pvals[a] - pvals[b]) || (a - b); });
  var m = idx.length, run = 0;
  for (i = 0; i < m; i++) { var v = Math.min(1, (m - i) * pvals[idx[i]]); if (v > run) run = v; out[idx[i]] = run; }
  return out;
};
S.bonferroni = function (pvals) {
  need(pvals, "p 值");
  var n = pvals.length, m = 0, out = new Array(n), i;
  for (i = 0; i < n; i++) if (validP(pvals[i])) m++;
  for (i = 0; i < n; i++) out[i] = validP(pvals[i]) ? Math.min(1, m * pvals[i]) : NaN;
  return out;
};
function logPhi(x) { return x >= 0 ? log1p(-normCdf(-x)) : Math.log(normCdf(x)); }
/** N 个独立标准正态的最大值的期望 E[max]，数值积分：
 *  E[M] = ∫_0^∞ (1 − Φ(x)^N) dx − ∫_0^∞ Φ(−x)^N dx，Simpson 法；Φ^N 在对数里算，N = 10^6 时也不丢精度。
 *  （core.js 的 QL.expectedMaxNormal 是 Blom 近似，N = 100 时低估约 0.4%。） */
S.expectedMaxNormal = function (N) {
  N = +N;
  if (!(N > 1)) return 0;
  if (N === Infinity) return Infinity;
  var U = Math.max(9, Math.sqrt(2 * Math.log(N)) + 7), M = 6000, h = U / M, s = 0;
  for (var i = 0; i <= M; i++) {
    var x = i * h, f = -expm1(N * logPhi(x)) - Math.exp(N * logPhi(-x));
    s += f * (i === 0 || i === M ? 1 : i & 1 ? 4 : 2);
  }
  return s * h / 3;
};
/** 选择偏差：试了 N 个（彼此独立、其实都没本事的）模型挑最好的，最好那个的 z 值平均也有 E[max of N]。
 *  deflatedZ = z − E[max]：大于 0 才说明它比"挑出来的运气"更好（粗略版，假设各次尝试相互独立）。 */
S.deflatedZ = function (z, N) { return z - S.expectedMaxNormal(N); };
/** 学习曲线的幂律拟合 err ≈ a·N^(−b)：在对数–对数坐标里做最小二乘，非正的点忽略；r2 是对数坐标里的 R² */
S.powerLawFit = function (ns, errs) {
  var n = sameLen(ns, errs, "powerLawFit"), lx = [], ly = [], i;
  for (i = 0; i < n; i++) { var a = +ns[i], e = +errs[i]; if (a > 0 && e > 0 && a < Infinity && e < Infinity) { lx.push(Math.log(a)); ly.push(Math.log(e)); } }
  var m = lx.length;
  if (m < 2) return { a: NaN, b: NaN, r2: NaN, n: m };
  var mx = mean(lx), my = mean(ly), sxx = 0, sxy = 0, syy = 0;
  for (i = 0; i < m; i++) { var dx = lx[i] - mx, dy = ly[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  if (!(sxx > 0)) return { a: NaN, b: NaN, r2: NaN, n: m };   // 所有 N 都一样，斜率无从谈起
  var slope = sxy / sxx, icpt = my - slope * mx, sse = 0;
  for (i = 0; i < m; i++) { var r = ly[i] - icpt - slope * lx[i]; sse += r * r; }
  return { a: Math.exp(icpt), b: -slope, r2: syy > 0 ? 1 - sse / syy : 0, n: m };
};

QL.mlstats = S;
return S;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLSTATS_INSTALL;
