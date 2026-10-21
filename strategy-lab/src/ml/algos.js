// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 内置算法库
 * QL_MLALGOS：内置算法的列表。每个算法的代码是一段 JavaScript 字符串（界面里可以看、改、复制；AI 写的算法也是同样的格式），
 * 在后台线程的隔离环境里编译，只能用标准 JavaScript 和传进来的 lib、ctx（接口见 src/ml/DESIGN.md §3）。
 * 几个算法共用的小工具（标准化、Cholesky、L-BFGS、分箱的决策树、Nelder–Mead……）写成"片段"，拼在各自代码的最前面，
 * 所以每段代码都自成一体：复制出去单独改也能跑。
 * 说明（docs）是 Markdown + KaTeX：模型、损失与训练、参数怎么调、复杂度、什么时候好用 / 失效、理论（定义、定理与证明梗概）。
 * 写法上的约定：代码和说明都用 String.raw 式的模板（反斜杠原样保留），所以里面不能出现反引号和美元符号紧跟左花括号；
 * 说明里的行内代码用 ˋ（U+02CB）代替反引号，取出时换回来。
 * QL_MLALGO_GROUPS：分组的中文名（下拉框里的分组标题）。 */
var QL_MLALGO_GROUPS = { baseline: "基线", linear: "线性模型", neighbors: "近邻", trees: "树模型", kernel: "核方法", probabilistic: "概率模型", neural: "神经网络", ts: "时间序列" };

var QL_MLALGOS = (function () {
"use strict";
function js(s) { return String.raw({ raw: s.raw }).replace(/^\n/, ""); }
function md(s) { return String.raw({ raw: s.raw }).replace(/^\n/, "").replace(/ˋ/g, "`"); }
function I(key, label, def, min, max, step, desc) { return { key: key, label: label, def: def, min: min, max: max, step: step || 1, type: "int", desc: desc || "" }; }
function N(key, label, def, min, max, step, desc) { return { key: key, label: label, def: def, min: min, max: max, step: step, type: "num", desc: desc || "" }; }
function S(key, label, def, options, desc) { return { key: key, label: label, def: def, options: options, type: "select", desc: desc || "" }; }
function B(key, label, def, desc) { return { key: key, label: label, def: def, type: "bool", desc: desc || "" }; }
/** 把几段代码拼成一段（片段在前，算法本身在后） */
function code() { return Array.prototype.slice.call(arguments).join("\n"); }

/* ================================================================== *
 *  共用的代码片段
 * ================================================================== */
var SN = {};
SN.base = js`
/* ---------- 小工具 ---------- */
function meanOf(a, n) { var s = 0; for (var i = 0; i < n; i++) s += a[i]; return n ? s / n : 0; }
/* 分类：准确率与交叉熵（P 是按行展开的 n×k 概率） */
function accOf(P, y, n, k) {
  var hit = 0;
  for (var i = 0; i < n; i++) { var o = i * k, b = 0; for (var c = 1; c < k; c++) if (P[o + c] > P[o + b]) b = c; if (b === y[i]) hit++; }
  return n ? hit / n : 0;
}
function ceOf(P, y, n, k) { var s = 0; for (var i = 0; i < n; i++) s -= Math.log(Math.max(P[i * k + y[i]], 1e-15)); return n ? s / n : 0; }
function mseOf(pred, y, n) { var s = 0; for (var i = 0; i < n; i++) { var e = pred[i] - y[i]; s += e * e; } return n ? s / n : 0; }
/* 按行做 softmax（就地）：先减去每行的最大值再取指数，不会溢出 */
function softmaxRows(S, n, k) {
  for (var i = 0; i < n; i++) {
    var o = i * k, mx = -Infinity, s = 0, c;
    for (c = 0; c < k; c++) if (S[o + c] > mx) mx = S[o + c];
    for (c = 0; c < k; c++) { var e = Math.exp(S[o + c] - mx); S[o + c] = e; s += e; }
    for (c = 0; c < k; c++) S[o + c] /= s;
  }
  return S;
}
function featName(part, j) { return part.featureNames && part.featureNames[j] != null ? String(part.featureNames[j]) : "x" + (j + 1); }
`;
SN.scaler = js`
/* ---------- 标准化 ----------
 * 每一列减去训练集上的均值、除以标准差（只用训练集算，验证集和测试集用同一组数）。
 * 缺失值（NaN，导入的 CSV 里可能有）当作该列的均值，标准化之后就是 0。 */
function fitScaler(X, n, d) {
  var mu = new Float64Array(d), sd = new Float64Array(d), cnt = new Float64Array(d), i, j, v;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { v = X[i * d + j]; if (v === v) { mu[j] += v; cnt[j]++; } }
  for (j = 0; j < d; j++) mu[j] = cnt[j] > 0 ? mu[j] / cnt[j] : 0;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { v = X[i * d + j]; if (v === v) sd[j] += (v - mu[j]) * (v - mu[j]); }
  for (j = 0; j < d; j++) { sd[j] = cnt[j] > 0 ? Math.sqrt(sd[j] / cnt[j]) : 1; if (!(sd[j] > 1e-12)) sd[j] = 1; }
  return { mean: mu, sd: sd, d: d };
}
function applyScaler(sc, X, n) {
  var d = sc.d, Z = new Float64Array(n * d), i, j, v;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { v = X[i * d + j]; Z[i * d + j] = v === v ? (v - sc.mean[j]) / sc.sd[j] : 0; }
  return Z;
}
`;
SN.input = js`
/* ---------- 输入怎么变成特征 ----------
 * 科研玩具的数据里，X 的第 j 列是第 j 个位置上的词元编号 0..V−1（data.tokens 给出词表大小 V）。
 * 编号只是名字（"5 比 3 大"没有意义），所以把每个位置展开成长度为 V 的独热向量，一共 d·V 个特征；
 * 其余的数据（表格、图像）做标准化。 */
function vocabOf(part) { var t = part.tokens; if (t == null) return 0; return typeof t === "number" ? t | 0 : t.vocab | 0; }
function oneHot(X, n, d, V) {
  var Z = new Float64Array(n * d * V), i, j;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { var v = X[i * d + j] | 0; if (v >= 0 && v < V) Z[(i * d + j) * V + v] = 1; }
  return Z;
}
function makeInput(part) {
  var V = vocabOf(part);
  if (V > 0) return { V: V, d: part.d, dim: part.d * V, sc: null };
  return { V: 0, d: part.d, dim: part.d, sc: fitScaler(part.X, part.n, part.d) };
}
function toInput(inp, X, n) { return inp.V > 0 ? oneHot(X, n, inp.d, inp.V) : applyScaler(inp.sc, X, n); }
`;
SN.chol = js`
/* ---------- 对称正定方程组：Cholesky 分解 A = L Lᵀ ----------
 * 数值上不正定（舍入误差、特征共线）时，在对角线上加一点点再试。 */
function cholFactor(A, m) {
  var L = new Float64Array(m * m), jitter = 0, scale = 0, tries, i, j, k, s;
  for (i = 0; i < m; i++) scale = Math.max(scale, Math.abs(A[i * m + i]));
  for (tries = 0; tries < 10; tries++) {
    var ok = true;
    for (j = 0; j < m && ok; j++) {
      s = A[j * m + j] + jitter;
      for (k = 0; k < j; k++) s -= L[j * m + k] * L[j * m + k];
      if (!(s > 0)) { ok = false; break; }
      var ljj = Math.sqrt(s); L[j * m + j] = ljj;
      for (i = j + 1; i < m; i++) { s = A[i * m + j]; for (k = 0; k < j; k++) s -= L[i * m + k] * L[j * m + k]; L[i * m + j] = s / ljj; }
    }
    if (ok) return L;
    jitter = jitter ? jitter * 100 : (scale || 1) * 1e-12;
    L.fill(0);
  }
  throw new Error("矩阵严重病态，Cholesky 分解失败：试试加大正则化强度。");
}
/* 用分解好的 L 解 A x = b；b 是 m×r（按行展开，一次解 r 个右端） */
function cholSolve(L, b, m) {
  var r = b.length / m, x = new Float64Array(b.length), y = new Float64Array(m), i, k, c, s;
  for (c = 0; c < r; c++) {
    for (i = 0; i < m; i++) { s = b[i * r + c]; for (k = 0; k < i; k++) s -= L[i * m + k] * y[k]; y[i] = s / L[i * m + i]; }
    for (i = m - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < m; k++) s -= L[k * m + i] * x[k * r + c]; x[i * r + c] = s / L[i * m + i]; }
  }
  return x;
}
/* ZᵀZ（m×m）：只算上三角再对称过去；Z 是 n×m（按行） */
function gramT(Z, n, m) {
  var G = new Float64Array(m * m), i, a, b;
  for (i = 0; i < n; i++) {
    var o = i * m;
    for (a = 0; a < m; a++) { var za = Z[o + a]; if (za === 0) continue; var ga = a * m; for (b = a; b < m; b++) G[ga + b] += za * Z[o + b]; }
  }
  for (a = 0; a < m; a++) for (b = a + 1; b < m; b++) G[b * m + a] = G[a * m + b];
  return G;
}
/* 岭回归的正规方程 (G + λI) β = c */
function ridgeSolve(G, c, m, lam) {
  var A = Float64Array.from(G);
  for (var j = 0; j < m; j++) A[j * m + j] += lam;
  return cholSolve(cholFactor(A, m), c, m);
}
`;
SN.lbfgs = js`
/* ---------- L-BFGS（有限内存的拟牛顿法） ----------
 * fg(w, g)：返回目标函数 f(w)，并把梯度 ∇f(w) 写进 g。
 * 用最近 m 对 (s, y) =（参数的变化，梯度的变化）近似 Hessian 的逆（"双循环递推"），沿这个方向做回溯线搜索（Armijo 条件）。
 * o: { maxIter, m, tol, onIter(it, f) → 返回 true 时停下 } */
function lbfgs(fg, w, o) {
  var n = w.length, m = o.m || 10, Ss = [], Ys = [], Rs = [], al = new Float64Array(m + 1), i, j, it;
  var g = new Float64Array(n), gN = new Float64Array(n), dir = new Float64Array(n), wN = new Float64Array(n);
  function dot(a, b) { var s = 0; for (var q = 0; q < n; q++) s += a[q] * b[q]; return s; }
  var f = fg(w, g);
  for (it = 1; it <= (o.maxIter || 200); it++) {
    for (i = 0; i < n; i++) dir[i] = -g[i];
    for (j = Ss.length - 1; j >= 0; j--) { al[j] = Rs[j] * dot(Ss[j], dir); for (i = 0; i < n; i++) dir[i] -= al[j] * Ys[j][i]; }
    if (Ss.length) { var last = Ss.length - 1, gam = dot(Ss[last], Ys[last]) / dot(Ys[last], Ys[last]); for (i = 0; i < n; i++) dir[i] *= gam; }
    for (j = 0; j < Ss.length; j++) { var be = Rs[j] * dot(Ys[j], dir); for (i = 0; i < n; i++) dir[i] += (al[j] - be) * Ss[j][i]; }
    var gd = dot(g, dir);
    if (!(gd < 0)) { for (i = 0; i < n; i++) dir[i] = -g[i]; gd = -dot(g, g); Ss = []; Ys = []; Rs = []; }   // 不是下降方向：退回最速下降
    if (!(gd < -1e-300)) break;                                                                          // 梯度已经是 0
    var step = Ss.length ? 1 : Math.min(1, 1 / Math.sqrt(-gd)), fN = Infinity, tries = 0;
    for (;;) {
      for (i = 0; i < n; i++) wN[i] = w[i] + step * dir[i];
      fN = fg(wN, gN);
      if (fN <= f + 1e-4 * step * gd) break;
      if (++tries > 40) break;
      step *= 0.5;
    }
    if (!(fN <= f)) break;                                                                               // 线搜索失败：停在当前点
    var s = new Float64Array(n), y = new Float64Array(n);
    for (i = 0; i < n; i++) { s[i] = wN[i] - w[i]; y[i] = gN[i] - g[i]; }
    var sy = dot(s, y);
    if (sy > 1e-12 * dot(y, y)) { Ss.push(s); Ys.push(y); Rs.push(1 / sy); if (Ss.length > m) { Ss.shift(); Ys.shift(); Rs.shift(); } }
    var df = f - fN;
    w.set(wN); g.set(gN); f = fN;
    if (o.onIter && o.onIter(it, f)) break;
    if (df <= (o.tol || 1e-10) * Math.max(1, Math.abs(f))) break;
  }
  return { f: f, iters: it };
}
`;
SN.nm = js`
/* ---------- Nelder–Mead 单纯形法（不需要梯度的最小化） ----------
 * 维护 n+1 个点，每一步把最差的点沿"其余各点的重心"反射；更好就再往外扩，不好就往里缩，都不行就整体向最好的点收缩。
 * o: { step 初始单纯形的边长, maxIter, tol, onIter(it, fBest) → 返回 true 时停下 } */
function nelderMead(f0, x0, o) {
  var n = x0.length, P = [], F = [], i, j, it;
  function f(x) { var v = f0(x); return v === v ? v : Infinity; }
  P.push(Float64Array.from(x0)); F.push(f(P[0]));
  for (i = 0; i < n; i++) { var x = Float64Array.from(x0); x[i] += o.step || 0.5; P.push(x); F.push(f(x)); }
  function mix(a, b, t) { var z = new Float64Array(n); for (var q = 0; q < n; q++) z[q] = a[q] + t * (b[q] - a[q]); return z; }
  for (it = 0; it < (o.maxIter || 200 * n); it++) {
    var ord = []; for (i = 0; i <= n; i++) ord.push(i);
    ord.sort(function (a, b) { return F[a] - F[b]; });
    P = ord.map(function (q) { return P[q]; }); F = ord.map(function (q) { return F[q]; });
    if (o.onIter && o.onIter(it, F[0])) break;
    if (Math.abs(F[n] - F[0]) <= (o.tol || 1e-9) * (Math.abs(F[0]) + 1e-12)) break;
    var c = new Float64Array(n);
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) c[j] += P[i][j] / n;
    var xr = mix(c, P[n], -1), fr = f(xr);
    if (fr < F[0]) { var xe = mix(c, P[n], -2), fe = f(xe); if (fe < fr) { P[n] = xe; F[n] = fe; } else { P[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { P[n] = xr; F[n] = fr; }
    else {
      var xc = fr < F[n] ? mix(c, xr, 0.5) : mix(c, P[n], 0.5), fc = f(xc);
      if (fc < Math.min(fr, F[n])) { P[n] = xc; F[n] = fc; }
      else for (i = 1; i <= n; i++) { P[i] = mix(P[0], P[i], 0.5); F[i] = f(P[i]); }
    }
  }
  var b = 0; for (i = 1; i <= n; i++) if (F[i] < F[b]) b = i;
  return { x: P[b], f: F[b], iters: it };
}
`;
SN.tree = js`
/* ---------- 决策树（CART）的共用部分 ----------
 * 分箱：每个特征只在有限个"切点"上考虑分裂。不同的取值不多（≤ B）时，切点取相邻两个取值的中点（和逐点精确的 CART 一样）；
 * 取值很多时，按分位数取至多 B−1 个切点（估计分位数最多用 5000 个样本）。之后每个样本的每个特征都换成"箱号"
 * （0..B−1 的小整数），找分裂只要把箱号做成直方图，每个节点的代价与样本数成正比，不必每个节点都排序。
 * 缺失值（NaN）一律换成训练集上该列的均值。 */
function colMeans(X, n, d) {
  var mu = new Float64Array(d), cnt = new Float64Array(d), i, j;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { var v = X[i * d + j]; if (v === v) { mu[j] += v; cnt[j]++; } }
  for (j = 0; j < d; j++) mu[j] = cnt[j] ? mu[j] / cnt[j] : 0;
  return mu;
}
function binOf(e, v) { var lo = 0, hi = e.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (e[mid] < v) lo = mid + 1; else hi = mid; } return lo; }   // 小于 v 的切点个数
function makeBins(X, n, d, B, fill) {
  B = Math.max(2, Math.min(255, B | 0));
  var edges = [], codes = new Uint8Array(n * d), step = Math.max(1, Math.floor(n / 5000)), i, j;
  for (j = 0; j < d; j++) {
    var vals = [];
    for (i = 0; i < n; i += step) { var v = X[i * d + j]; vals.push(v === v ? v : fill[j]); }
    vals.sort(function (a, b) { return a - b; });
    var uq = [], e = [];
    for (i = 0; i < vals.length; i++) if (!uq.length || vals[i] > uq[uq.length - 1]) uq.push(vals[i]);
    if (uq.length <= B) for (i = 0; i + 1 < uq.length; i++) e.push(0.5 * (uq[i] + uq[i + 1]));
    else for (var b = 1; b < B; b++) { var q = vals[Math.floor(b * vals.length / B)]; if ((!e.length || q > e[e.length - 1]) && q < uq[uq.length - 1]) e.push(q); }
    edges.push(Float64Array.from(e));
  }
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { var x = X[i * d + j]; codes[i * d + j] = binOf(edges[j], x === x ? x : fill[j]); }
  return { edges: edges, codes: codes, d: d, n: n };
}
/* 长一棵树（深度优先）。rows：参与这棵树的样本下标（可以重复：自助抽样就是这样）。
 * o.mode = "cls"：分类。叶子存各类的比例（每类加 o.alpha 的平滑），分裂按基尼指数或熵的减少量；
 * o.mode = "gh" ：叶子值 = ΣG / (ΣH + λ) × o.scale，分裂按 G²/(H+λ) 的增加量。
 *               回归树取 G = y、H = 1，这就是"方差减少量"；梯度提升里 G 是负梯度、H 是二阶导数。
 * 其余选项：maxDepth、minLeaf（叶子里至少几个样本）、mtry（每个节点随机挑几个特征来比，随机森林用）、rng、crit、imp（累加各特征的增益）。
 * 返回平铺的数组：f（分裂用的特征，叶子为 −1）、thr（阈值：x_f ≤ thr 往左）、bin（对应的箱号）、left、right、n（样本数）、
 * val（每个节点的值：分类时每个节点 K 个数；内部节点也存，所以可以把树"截短"来看）、gain、dep（深度）。 */
function growTree(bins, rows, o) {
  var d = bins.d, codes = bins.codes, edges = bins.edges, cls = o.mode === "cls", K = cls ? o.k : 1;
  var idx = Int32Array.from(rows), maxDepth = o.maxDepth, minLeaf = Math.max(1, o.minLeaf | 0), mtry = Math.max(1, Math.min(d, o.mtry || d));
  var lam = o.lambda || 0, alpha = o.alpha || 0, scl = o.scale == null ? 1 : o.scale, y = o.y, g = o.g, h = o.h, ent = o.crit === "entropy";
  var T = { f: [], thr: [], bin: [], left: [], right: [], n: [], val: [], gain: [], dep: [] };
  var feats = new Int32Array(d), hist = new Float64Array(256 * Math.max(K, 3)), tot = new Float64Array(K), lc = new Float64Array(K), rc = new Float64Array(K), j;
  for (j = 0; j < d; j++) feats[j] = j;
  function xlogx(x) { return x > 0 ? x * Math.log(x) : 0; }
  function purity(cnt, m) {   // 分裂的增益 = 左边的分 + 右边的分 − 父节点的分（基尼：Σc²/m；熵：Σ c·log c − m·log m）
    var s = 0, c;
    if (ent) { for (c = 0; c < K; c++) s += xlogx(cnt[c]); return s - xlogx(m); }
    for (c = 0; c < K; c++) s += cnt[c] * cnt[c];
    return s / m;
  }
  function node(a, b, depth) {
    var id = T.f.length, i, c, r, parent, nn = b - a;
    T.f.push(-1); T.thr.push(0); T.bin.push(-1); T.left.push(-1); T.right.push(-1); T.n.push(nn); T.gain.push(0); T.dep.push(depth);
    if (cls) {
      tot.fill(0); for (i = a; i < b; i++) tot[y[idx[i]]]++;
      for (c = 0; c < K; c++) T.val.push((tot[c] + alpha) / (nn + K * alpha));
      parent = purity(tot, nn);
      for (c = 0; c < K; c++) if (tot[c] === nn) return id;          // 已经纯了
    } else {
      var G0 = 0, H0 = 0; for (i = a; i < b; i++) { r = idx[i]; G0 += g[r]; H0 += h ? h[r] : 1; }
      T.val.push(G0 / (H0 + lam) * scl);
      parent = G0 * G0 / (H0 + lam);
    }
    if (depth >= maxDepth || nn < 2 * minLeaf) return id;
    if (mtry < d) for (j = 0; j < mtry; j++) { var q = j + o.rng.int(d - j), t = feats[j]; feats[j] = feats[q]; feats[q] = t; }   // 部分洗牌：随机挑 mtry 个特征
    var best = 1e-12 * Math.max(1, Math.abs(parent)), bf = -1, bb = -1, fi, bn;
    for (fi = 0; fi < mtry; fi++) {
      var f = feats[fi], nb = edges[f].length + 1, nl = 0;
      if (nb < 2) continue;
      if (cls) {
        hist.fill(0, 0, nb * K);
        for (i = a; i < b; i++) { r = idx[i]; hist[codes[r * d + f] * K + y[r]]++; }
        lc.fill(0);
        for (bn = 0; bn < nb - 1; bn++) {
          for (c = 0; c < K; c++) { var hv = hist[bn * K + c]; lc[c] += hv; nl += hv; }
          if (nl < minLeaf) continue;
          if (nn - nl < minLeaf) break;
          for (c = 0; c < K; c++) rc[c] = tot[c] - lc[c];
          var gn = purity(lc, nl) + purity(rc, nn - nl) - parent;
          if (gn > best) { best = gn; bf = f; bb = bn; }
        }
      } else {
        hist.fill(0, 0, nb * 3);
        for (i = a; i < b; i++) { r = idx[i]; var cb = codes[r * d + f] * 3; hist[cb] += g[r]; hist[cb + 1] += h ? h[r] : 1; hist[cb + 2]++; }
        var GL = 0, HL = 0;
        for (bn = 0; bn < nb - 1; bn++) {
          GL += hist[bn * 3]; HL += hist[bn * 3 + 1]; nl += hist[bn * 3 + 2];
          if (nl < minLeaf) continue;
          if (nn - nl < minLeaf) break;
          var GR = G0 - GL, HR = H0 - HL, gh = GL * GL / (HL + lam) + GR * GR / (HR + lam) - parent;
          if (gh > best) { best = gh; bf = f; bb = bn; }
        }
      }
    }
    if (bf < 0) return id;
    var m = a;
    for (i = a; i < b; i++) { r = idx[i]; if (codes[r * d + bf] <= bb) { idx[i] = idx[m]; idx[m] = r; m++; } }
    T.f[id] = bf; T.thr[id] = edges[bf][bb]; T.bin[id] = bb; T.gain[id] = best;
    if (o.imp) o.imp[bf] += best;
    var l = node(a, m, depth + 1), rr = node(m, b, depth + 1);
    T.left[id] = l; T.right[id] = rr;
    return id;
  }
  node(0, idx.length, 0);
  return { f: Int32Array.from(T.f), thr: Float64Array.from(T.thr), bin: Int32Array.from(T.bin), left: Int32Array.from(T.left), right: Int32Array.from(T.right),
    n: Int32Array.from(T.n), val: Float64Array.from(T.val), gain: Float64Array.from(T.gain), dep: Int32Array.from(T.dep), K: K, size: T.f.length };
}
/* 一行原始特征（从 X 的第 o 个数开始）落到哪个节点；cut[节点] = 1 表示把它当叶子（剪枝），maxDep 截短深度 */
function leafOf(T, X, o, fill, cut, maxDep) {
  var nd = 0;
  while (T.f[nd] >= 0 && !(cut && cut[nd]) && !(maxDep != null && T.dep[nd] >= maxDep)) {
    var f = T.f[nd], v = X[o + f]; if (v !== v) v = fill[f];
    nd = v <= T.thr[nd] ? T.left[nd] : T.right[nd];
  }
  return nd;
}
/* 训练集上用箱号走：和用阈值走是同一条路（x ≤ 切点 ⇔ 箱号 ≤ 分裂的箱号） */
function leafOfCode(T, codes, o) { var nd = 0; while (T.f[nd] >= 0) nd = codes[o + T.f[nd]] <= T.bin[nd] ? T.left[nd] : T.right[nd]; return nd; }
/* 交给"模型内部"画的树：按层（广度优先）重新编号，最多 maxNodes 个；放不下的子树在边界处当作叶子（值是该节点自己的统计量） */
function exportTree(T, maxNodes, cut) {
  var ids = [0], out = [], K = T.K;
  for (var q = 0; q < ids.length; q++) {
    var od = ids[q], v = K > 1 ? Array.prototype.slice.call(T.val, od * K, od * K + K) : T.val[od];
    var nd = { f: -1, thr: 0, left: -1, right: -1, value: v, n: T.n[od] };
    if (T.f[od] >= 0 && !(cut && cut[od]) && ids.length + 2 <= maxNodes) { nd.f = T.f[od]; nd.thr = T.thr[od]; nd.left = ids.length; ids.push(T.left[od]); nd.right = ids.length; ids.push(T.right[od]); }
    out.push(nd);
  }
  return { nodes: out };
}
/* 各特征的增益占比，排好序的文字 */
function importanceText(imp, names, top) {
  var s = 0, j, list = [];
  for (j = 0; j < imp.length; j++) s += imp[j];
  if (!(s > 0)) return "（没有任何分裂）";
  for (j = 0; j < imp.length; j++) list.push([j, imp[j] / s]);
  list.sort(function (a, b) { return b[1] - a[1]; });
  return list.slice(0, top || 15).filter(function (e) { return e[1] > 0; }).map(function (e) { return "  " + (names && names[e[0]] != null ? names[e[0]] : "x" + (e[0] + 1)) + "：" + (100 * e[1]).toFixed(1) + "%"; }).join("\n");
}
`;

var ALGOS = [];
function add(a) { ALGOS.push(a); return a; }

/* ================================================================== *
 *  线性模型
 * ================================================================== */
add({
  id: "ridge", name: "线性 / 岭回归", group: "linear", api: "supervised", kinds: ["regression"], families: ["tabular", "image"],
  summary: "最小二乘加 L2 惩罚的闭式解；可以展开成多项式，看偏差与方差怎样随次数和 λ 变化。",
  params: [
    N("loglam", "正则强度 log₁₀ λ", -4, -8, 3, 0.1, "λ 作用在标准化后的特征上；−8 几乎就是普通最小二乘"),
    I("degree", "多项式次数", 1, 1, 8, 1, "d ≤ 3 时展开成全部不超过这个次数的单项式；d > 3 时只加各特征自己的幂（不含交叉项）"),
    B("auto", "按验证集选 λ", false, "在 λ = 10⁻⁸ … 10³ 上逐个求解，取验证集均方误差最小的那个；曲线上能看到偏差与方差的取舍")
  ],
  code: code(SN.base, SN.scaler, SN.chol, js`
/* ================= 线性回归 / 岭回归（闭式解） =================
 * 模型：ŷ = ȳ + Σ_j β_j φ_j(x)，φ 是标准化之后的特征（可选：多项式展开之后再标准化一次）。
 * 训练：最小化 (1/n)‖y − ȳ − Φβ‖² + λ‖β‖²，等价于解正规方程 (ΦᵀΦ/n + λI) β = Φᵀ(y − ȳ)/n。 */
var SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function powName(p) { return p === 1 ? "" : String(p).split("").map(function (ch) { return SUP.charAt(+ch); }).join(""); }
/* 多项式展开用到的单项式：每项记下各特征的次数 */
function makeTerms(d, deg) {
  var out = [], e = [], j, p;
  if (deg <= 1 || d > 3) {
    for (p = 1; p <= deg; p++) for (j = 0; j < d; j++) { var u = []; for (var q = 0; q < d; q++) u.push(q === j ? p : 0); out.push(u); }
    return out;
  }
  (function rec(j, left) {
    if (j === d) { var s = 0; for (var q = 0; q < d; q++) s += e[q]; if (s >= 1) out.push(e.slice()); return; }
    for (var t = 0; t <= left; t++) { e[j] = t; rec(j + 1, left - t); }
  })(0, deg);
  function tdeg(a) { var s = 0; for (var q = 0; q < a.length; q++) s += a[q]; return s; }
  out.sort(function (a, b) { return tdeg(a) - tdeg(b); });
  return out;
}
/* 原始特征 → 标准化 → 单项式 → 再标准化（各项的尺度相同，λ 对它们一视同仁） */
function expand(M, X, n) {
  var d = M.d, Z = applyScaler(M.sc1, X, n), T = M.terms, m = T.length, P = new Float64Array(n * m), i, t, j;
  for (i = 0; i < n; i++) for (t = 0; t < m; t++) {
    var v = 1, e = T[t];
    for (j = 0; j < d; j++) if (e[j]) v *= Math.pow(Z[i * d + j], e[j]);
    P[i * m + t] = v;
  }
  return M.sc2 ? applyScaler(M.sc2, P, n) : P;
}
function predictPhi(M, P, n) {
  var m = M.m, out = new Float64Array(n);
  for (var i = 0; i < n; i++) { var s = M.ym; for (var j = 0; j < m; j++) s += P[i * m + j] * M.beta[j]; out[i] = s; }
  return out;
}
/* 有效自由度 df(λ) = tr[G (G + λI)⁻¹] = m − λ·tr[(G + λI)⁻¹]，tr(A⁻¹) = ‖L⁻¹‖²（A = LLᵀ） */
function effDf(G, m, lam) {
  if (m > 300) return NaN;
  var A = Float64Array.from(G), i, j, k;
  for (j = 0; j < m; j++) A[j * m + j] += lam;
  var L = cholFactor(A, m), tr = 0, col = new Float64Array(m);
  for (j = 0; j < m; j++) {            // 解 L x = e_j，累加 ‖x‖²
    col.fill(0);
    for (i = j; i < m; i++) { var s = i === j ? 1 : 0; for (k = j; k < i; k++) s -= L[i * m + k] * col[k]; col[i] = s / L[i * m + i]; tr += col[i] * col[i]; }
  }
  return m - lam * tr;
}
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, n = tr.n, d = tr.d, i, j;
  var M = { d: d, deg: p.degree, sc2: null, names: [] };
  M.sc1 = fitScaler(tr.X, n, d);
  M.terms = makeTerms(d, p.degree); M.m = M.terms.length;
  var P = expand(M, tr.X, n); M.sc2 = fitScaler(P, n, M.m); P = applyScaler(M.sc2, P, n);
  var m = M.m; M.ym = meanOf(tr.y, n);
  M.names = M.terms.map(function (e) { var parts = []; for (var q = 0; q < d; q++) if (e[q]) parts.push(featName(tr, q) + powName(e[q])); return parts.join("·"); });
  if (m > 3000) throw new Error("展开之后有 " + m + " 个特征，正规方程太大了：请降低多项式次数。");
  var G = gramT(P, n, m), c = new Float64Array(m);
  for (i = 0; i < n; i++) { var r = tr.y[i] - M.ym; for (j = 0; j < m; j++) c[j] += P[i * m + j] * r; }
  for (j = 0; j < m * m; j++) G[j] /= n;
  for (j = 0; j < m; j++) c[j] /= n;
  var lams = [];
  if (p.auto) for (var e = 3; e >= -8.0001; e -= 0.5) lams.push(Math.pow(10, e));    // 从简单（λ 大）到复杂（λ 小）
  else lams.push(Math.pow(10, p.loglam));
  var Pv = expand(M, va.X, va.n), best = null;
  for (var q = 0; q < lams.length; q++) {
    if (best && ctx.timeLeft() < 0) { ctx.log("时间到了：λ 只试到了第 " + q + " 个。"); break; }
    M.lam = lams[q]; M.beta = ridgeSolve(G, c, m, M.lam);
    var trM = mseOf(predictPhi(M, P, n), tr.y, n), vaM = mseOf(predictPhi(M, Pv, va.n), va.y, va.n), df = lams.length > 1 ? effDf(G, m, M.lam) : NaN;
    ctx.report(q, { loss: trM, validLoss: vaM, trainMetric: trM, validMetric: vaM, df: df });
    ctx.snapshot(q, M);
    if (!best || vaM < best.va) best = { va: vaM, beta: M.beta, lam: M.lam, df: df };
  }
  M.beta = best.beta; M.lam = best.lam; M.df = isFinite(best.df) ? best.df : effDf(G, m, M.lam);
  if (p.auto) ctx.log("按验证集选出 λ = " + M.lam.toExponential(2) + "（有效自由度 " + M.df.toFixed(1) + "）");
  M.size = m + 1;
  return M;
}
function predict(M, X, n) { return predictPhi(M, expand(M, X, n), n); }
function inspect(M) {
  var coef = M.names.map(function (nm, j) { return { name: nm, value: M.beta[j] }; });
  return { coef: coef, text: "λ = " + M.lam.toExponential(2) + "，" + M.m + " 个特征（多项式次数 " + M.deg + "），有效自由度 df(λ) = " + (isFinite(M.df) ? M.df.toFixed(2) : "—") +
    "\n系数是标准化之后的：每一项先减均值、除以标准差，所以大小可以直接比。截距 = 训练集 y 的均值 " + M.ym.toPrecision(4) + "。" };
}
`),
  docs: md`
## 模型
输入 $x\in\mathbb R^d$ 先逐列标准化成 $z$（减训练集均值、除以标准差）。可选的多项式展开：$d\le3$ 时取全部总次数在 $1$ 到 $D$ 之间的单项式 $\phi_\alpha(z)=\prod_j z_j^{\alpha_j}$（共 $\binom{d+D}{d}-1$ 项）；$d>3$ 时只取 $z_j^k$（$k\le D$），不含交叉项。展开后的每一项再标准化一次，记作 $\Phi\in\mathbb R^{n\times m}$。预测
$$\hat y(x)=\bar y+\phi(x)^\top\hat\beta .$$

## 损失与训练
$$\hat\beta_\lambda=\operatorname*{arg\,min}_\beta\ \frac1n\lVert y-\bar y\mathbf 1-\Phi\beta\rVert^2+\lambda\lVert\beta\rVert^2=\Big(\tfrac1n\Phi^\top\Phi+\lambda I\Big)^{-1}\tfrac1n\Phi^\top(y-\bar y\mathbf 1).$$
截距不受惩罚（中心化之后它就是 $\bar y$）。用 Cholesky 分解解这个 $m\times m$ 的正规方程，一步到位，没有迭代。打开"按验证集选 λ"时，在 $\lambda=10^{3},10^{2.5},\dots,10^{-8}$ 上逐个求解，取验证集均方误差最小的；学习曲线的横轴是第几个 $\lambda$（从强到弱），另画出有效自由度 $\mathrm{df}(\lambda)$。

## 参数怎么调
- **λ**：太大，所有系数被压向 0（欠拟合）；太小，在特征多、样本少或特征高度相关时方差很大。不确定就打开"按验证集选 λ"。
- **多项式次数**：一维正弦数据上从 1 调到 8，配合很小的 $\lambda$，能清楚地看到训练误差一路下降、验证误差先降后升——这就是偏差与方差的取舍。
- 特征之间量纲不同不要紧：先标准化了，$\lambda$ 对每个方向一视同仁。

## 复杂度
构造 $\Phi^\top\Phi$ 要 $O(nm^2)$，分解要 $O(m^3/3)$；预测每个样本 $O(m)$。$m$ 上千时（比如 $32\times32$ 的格点）会慢一些，但仍是一次性的。

## 什么时候好用、什么时候失效
真实关系接近线性（或接近所选次数的多项式）、噪声近似同方差时，这是方差最小、最好解释的模型，也是每个回归任务都该先跑的基线。高次多项式在训练范围之外会迅速发散（外推极差）；样本少而次数高时，即使 $\lambda$ 很小，验证误差也会爆炸。非线性很强、或者有尖锐的跳变时，应该换树模型、核方法或神经网络。

## 理论
**定理 1（闭式解与偏差—方差）.** 设固定设计矩阵 $X\in\mathbb R^{n\times p}$，$y=X\beta+\varepsilon$，$\mathbb E\varepsilon=0$，$\operatorname{Cov}\varepsilon=\sigma^2I$。对 $\lambda>0$，$J(b)=\lVert y-Xb\rVert^2+\lambda\lVert b\rVert^2$ 有唯一的最小点 $\hat\beta_\lambda=(X^\top X+\lambda I)^{-1}X^\top y$，并且
$$\mathbb E\hat\beta_\lambda-\beta=-\lambda(X^\top X+\lambda I)^{-1}\beta,\qquad \operatorname{Cov}\hat\beta_\lambda=\sigma^2(X^\top X+\lambda I)^{-1}X^\top X(X^\top X+\lambda I)^{-1}.$$

*证明.* $J$ 的 Hessian 是 $2(X^\top X+\lambda I)\succ0$，所以 $J$ 严格凸，唯一的驻点 $\nabla J=2(X^\top X+\lambda I)b-2X^\top y=0$ 就是最小点。把 $y=X\beta+\varepsilon$ 代入：$\hat\beta_\lambda=A X^\top X\beta+AX^\top\varepsilon$，$A=(X^\top X+\lambda I)^{-1}$。由 $AX^\top X=I-\lambda A$ 得偏差；协方差是 $AX^\top(\sigma^2I)XA$。$\square$

**奇异值分解下的收缩.** 设 $X=UDV^\top$（$d_j$ 为奇异值，$u_j,v_j$ 为左右奇异向量），则
$$X\hat\beta_\lambda=\sum_j u_j\,\frac{d_j^2}{d_j^2+\lambda}\,u_j^\top y,\qquad \mathrm{df}(\lambda):=\operatorname{tr}\big[X(X^\top X+\lambda I)^{-1}X^\top\big]=\sum_j\frac{d_j^2}{d_j^2+\lambda}.$$
岭回归把数据在每个主方向上的分量按 $d_j^2/(d_j^2+\lambda)$ 收缩：方差小（$d_j$ 小）的方向收缩得最狠。$\mathrm{df}(\lambda)$ 从 $\operatorname{rank}X$（$\lambda\to0$）单调降到 0（$\lambda\to\infty$），是模型复杂度的度量。

**定理 2（Hoerl–Kennard 1970）.** 在定理 1 的设定下再设 $X^\top X$ 可逆，记 $\theta=V^\top\beta$。则总均方误差 $\mathrm{MSE}(\lambda)=\mathbb E\lVert\hat\beta_\lambda-\beta\rVert^2$ 满足：对一切 $0<\lambda<\sigma^2/\max_j\theta_j^2$，$\mathrm{MSE}(\lambda)<\mathrm{MSE}(0)$，即总存在比最小二乘更好的岭估计。

*证明.* 在奇异向量的坐标下逐项计算：$\mathrm{MSE}(\lambda)=\sum_j\dfrac{\sigma^2d_j^2+\lambda^2\theta_j^2}{(d_j^2+\lambda)^2}$。对 $\lambda$ 求导，第 $j$ 项的导数化简为 $\dfrac{2d_j^2(\lambda\theta_j^2-\sigma^2)}{(d_j^2+\lambda)^3}$，在所述范围内每一项都是负的，所以 $\mathrm{MSE}$ 在 $[0,\sigma^2/\max\theta_j^2]$ 上严格递减。$\square$

**预测误差的分解.** 对新的 $x_0$，$y_0=f(x_0)+\varepsilon_0$，$\mathbb E[(y_0-\hat f(x_0))^2]=\sigma^2+\big(\mathbb E\hat f(x_0)-f(x_0)\big)^2+\operatorname{Var}\hat f(x_0)$（期望对训练集和 $\varepsilon_0$ 取；$\varepsilon_0$ 与训练集独立）。多项式次数和 $\lambda$ 控制的正是后两项的此消彼长。

参考：A. E. Hoerl, R. W. Kennard, Ridge regression: biased estimation for nonorthogonal problems, *Technometrics* 12 (1970)；Hastie–Tibshirani–Friedman《The Elements of Statistical Learning》§3.4。
`
});

add({
  id: "lasso", name: "Lasso / 弹性网", group: "linear", api: "supervised", kinds: ["regression"], families: ["tabular", "image"],
  summary: "L1 惩罚让很多系数恰好为 0：坐标下降沿正则化路径求解，按验证集挑 λ。",
  params: [
    N("logalpha", "强度 log₁₀(λ/λ_max)", -2, -4, 0, 0.05, "λ_max 是让全部系数为 0 的最小 λ；0 就是全部为 0"),
    N("l1ratio", "L1 占比 ρ", 1, 0.05, 1, 0.05, "1 = Lasso；小于 1 是弹性网（再加 (1−ρ)/2·‖β‖² 的 L2 惩罚，相关特征成组进出）"),
    B("auto", "按验证集选 λ", true, "沿路径 λ_max → 10⁻⁴λ_max 走 40 步，取验证集均方误差最小的；关掉则用上面给定的强度")
  ],
  code: code(SN.base, SN.scaler, SN.chol, js`
/* ================= Lasso / 弹性网（坐标下降） =================
 * 目标：(1/2n)‖y − ȳ − Zβ‖² + λ[ρ‖β‖₁ + (1−ρ)/2·‖β‖²]，Z 是标准化后的特征。
 * 坐标下降：轮流对每个 β_j 精确求极小，β_j ← S(c_j − Σ_{k≠j} G_jk β_k, λρ) / (G_jj + λ(1−ρ))，
 * 其中 G = ZᵀZ/n，c = Zᵀ(y − ȳ)/n，S 是软阈值。用协方差形式：先算好 G，每一轮只要 O(d²)。 */
function soft(z, t) { return z > t ? z - t : z < -t ? z + t : 0; }
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, n = tr.n, d = tr.d, i, j, k;
  var sc = fitScaler(tr.X, n, d), Z = applyScaler(sc, tr.X, n), Zv = applyScaler(sc, va.X, va.n), ym = meanOf(tr.y, n);
  var G = gramT(Z, n, d), c = new Float64Array(d);
  for (j = 0; j < d * d; j++) G[j] /= n;
  for (i = 0; i < n; i++) { var r = tr.y[i] - ym; for (j = 0; j < d; j++) c[j] += Z[i * d + j] * r / n; }
  var rho = p.l1ratio, lmax = 0;
  for (j = 0; j < d; j++) lmax = Math.max(lmax, Math.abs(c[j]));
  lmax = Math.max(lmax / rho, 1e-300);
  var beta = new Float64Array(d), Gb = new Float64Array(d), sweeps = 0;
  function solve(lam) {                     // 从当前的 β 出发（热启动）跑到收敛
    var tol = 1e-9 * (Math.sqrt(meanOf(c.map(function (v) { return v * v; }), d)) + 1e-12);
    for (var it = 0; it < 10000; it++) {
      var ch = 0;
      for (j = 0; j < d; j++) {
        var gjj = G[j * d + j]; if (!(gjj > 1e-12)) continue;
        var nb = soft(c[j] - (Gb[j] - gjj * beta[j]), lam * rho) / (gjj + lam * (1 - rho)), db = nb - beta[j];
        if (db !== 0) { for (k = 0; k < d; k++) Gb[k] += G[k * d + j] * db; beta[j] = nb; if (Math.abs(db) > ch) ch = Math.abs(db); }
      }
      sweeps++;
      if (ch < tol || (it % 20 === 19 && ctx.timeLeft() < 0)) break;
    }
  }
  function pred(Zm, m, b) { var out = new Float64Array(m); for (var q = 0; q < m; q++) { var s = ym; for (var jj = 0; jj < d; jj++) s += Zm[q * d + jj] * b[jj]; out[q] = s; } return out; }
  var K = 40, target = Math.pow(10, p.logalpha), best = null, M = { sc: sc, ym: ym, d: d, names: [], beta: beta, lmax: lmax, rho: rho };
  for (j = 0; j < d; j++) M.names.push(featName(tr, j));
  for (var q = 0; q < K; q++) {
    var frac = Math.pow(10, -4 * q / (K - 1));
    if (!p.auto && frac < target) frac = target;
    var lam = frac * lmax;
    solve(lam);
    var trM = mseOf(pred(Z, n, beta), tr.y, n), vaM = mseOf(pred(Zv, va.n, beta), va.y, va.n), nz = 0;
    for (j = 0; j < d; j++) if (beta[j] !== 0) nz++;
    ctx.report(q, { loss: trM, validLoss: vaM, trainMetric: trM, validMetric: vaM, nonzero: nz });
    M.beta = beta; ctx.snapshot(q, M);
    if (p.auto ? (!best || vaM < best.va) : true) best = { va: vaM, beta: Float64Array.from(beta), lam: lam, nz: nz };
    if (!p.auto && frac <= target) break;
    if (ctx.timeLeft() < 0) { ctx.log("时间到了：路径只走到第 " + (q + 1) + " 步。"); break; }
  }
  M.beta = best.beta; M.lam = best.lam; M.nz = best.nz; M.sweeps = sweeps;
  M.coef = new Float64Array(d); M.c0 = ym;
  for (j = 0; j < d; j++) { M.coef[j] = M.beta[j] / sc.sd[j]; M.c0 -= M.coef[j] * sc.mean[j]; }
  M.size = M.nz + 1;
  return M;
}
function predict(M, X, n) {
  var Z = applyScaler(M.sc, X, n), d = M.d, out = new Float64Array(n);
  for (var i = 0; i < n; i++) { var s = M.ym; for (var j = 0; j < d; j++) if (M.beta[j] !== 0) s += Z[i * d + j] * M.beta[j]; out[i] = s; }
  return out;
}
function inspect(M) {
  var coef = [];
  for (var j = 0; j < M.d; j++) coef.push({ name: M.names[j], value: M.coef[j] });
  return { coef: coef, text: "λ = " + M.lam.toExponential(2) + "（λ/λ_max = " + (M.lam / M.lmax).toExponential(2) + "），L1 占比 ρ = " + M.rho + "\n非零系数 " + M.nz + " / " + M.d + " 个；坐标下降一共扫了 " + M.sweeps + " 轮。\n系数按原始单位给出（每单位特征的变化带来多少 y 的变化）；截距 " + M.c0.toPrecision(5) + "。" };
}
`),
  docs: md`
## 模型
和线性回归一样是 $\hat y=\bar y+z^\top\beta$（$z$ 为标准化后的特征），区别在惩罚：
$$\hat\beta=\operatorname*{arg\,min}_\beta\ \frac1{2n}\lVert y-\bar y\mathbf 1-Z\beta\rVert^2+\lambda\Big(\rho\lVert\beta\rVert_1+\frac{1-\rho}2\lVert\beta\rVert_2^2\Big).$$
$\rho=1$ 是 Lasso（Tibshirani 1996），$0<\rho<1$ 是弹性网（Zou–Hastie 2005）。L1 惩罚在 0 处不可导，最优解里通常有很多系数**恰好**等于 0：它同时做估计和变量选择。

## 损失与训练
**坐标下降**：每次只动一个坐标，其余固定，对 $\beta_j$ 精确求极小：
$$\beta_j\leftarrow\frac{S\big(c_j-\sum_{k\ne j}G_{jk}\beta_k,\ \lambda\rho\big)}{G_{jj}+\lambda(1-\rho)},\qquad S(z,t)=\operatorname{sign}(z)\,(|z|-t)_+,$$
$G=Z^\top Z/n$，$c=Z^\top(y-\bar y\mathbf 1)/n$。沿着**正则化路径** $\lambda_q=\lambda_{\max}10^{-4q/39}$（$q=0,\dots,39$）求解，每一步从上一步的解出发（热启动），所以整条路径的代价和单独解一个 $\lambda$ 差不多。学习曲线的横轴是路径上的第几步，另画出非零系数的个数。

## 参数怎么调
- 一般打开"按验证集选 λ"。曲线上能看到：$\lambda$ 从大到小，非零个数一个个增加，训练误差单调下降，验证误差先降后升。
- 特征成组高度相关时，Lasso 往往在组里随便挑一个；把 $\rho$ 调到 0.5 左右（弹性网）会让相关的特征一起进来，系数更稳定。
- 给出的系数是原始单位的；比较大小要看标准化后的 $\beta$（等于原始系数乘以该列的标准差）。

## 复杂度
算 $G$ 要 $O(nd^2)$；之后每扫一轮 $O(d^2)$（只在系数真的变了时更新 $G\beta$）。整条路径一般几十到几百轮。预测每个样本 $O(d)$。

## 什么时候好用、什么时候失效
真实系数稀疏（只有少数特征起作用）而 $d$ 很大、甚至 $d>n$ 时，Lasso 远好于最小二乘和岭回归，还能告诉你哪些特征有用。真实系数是"很多个小的"而不是"少数几个大的"时，岭回归往往更好。特征高度相关时，选出的变量集合不稳定（换一批数据就换一批变量），解释时要小心。和所有线性模型一样，它学不到非线性。

## 理论
**定理 1（最优性条件，KKT）.** 记 $L(\beta)=\frac1{2n}\lVert y-Z\beta\rVert^2$（$y$ 已中心化），考虑 $\rho=1$。$\hat\beta$ 是 Lasso 的解，当且仅当对每个 $j$：
$$\tfrac1n z_j^\top(y-Z\hat\beta)=\lambda\operatorname{sign}(\hat\beta_j)\ \ (\hat\beta_j\ne0),\qquad \big|\tfrac1n z_j^\top(y-Z\hat\beta)\big|\le\lambda\ \ (\hat\beta_j=0).$$
特别地，$\hat\beta=0$ 当且仅当 $\lambda\ge\lambda_{\max}=\max_j|z_j^\top y|/n$。

*证明.* 目标 $F=L+\lambda\lVert\cdot\rVert_1$ 是凸函数，$\hat\beta$ 是最小点当且仅当 $0\in\partial F(\hat\beta)=\nabla L(\hat\beta)+\lambda\,\partial\lVert\hat\beta\rVert_1$。$|t|$ 在 $t\ne0$ 处的次微分是 $\{\operatorname{sign}t\}$，在 $0$ 处是 $[-1,1]$，逐坐标写出来就是上面两式。取 $\hat\beta=0$ 代入第二式即得最后一句。$\square$

**推论（坐标更新是精确的）.** 固定其余坐标时，$F$ 作为 $\beta_j$ 的函数是 $\frac{G_{jj}}2\beta_j^2-r_j\beta_j+\lambda|\beta_j|+\text{常数}$（$r_j=c_j-\sum_{k\ne j}G_{jk}\beta_k$），由一维的 KKT 条件，它的唯一最小点是 $S(r_j,\lambda)/G_{jj}$。弹性网的 L2 项只是把分母换成 $G_{jj}+\lambda(1-\rho)$。

**定理 2（坐标下降收敛，Tseng 2001）.** 设 $F(\beta)=f(\beta)+\sum_jg_j(\beta_j)$，$f$ 凸且连续可微，$g_j$ 凸、下半连续，且水平集 $\{F\le F(\beta^0)\}$ 有界。则循环坐标下降产生的序列的每个极限点都是 $F$ 的最小点。Lasso 与弹性网满足这些条件（$f$ 是二次函数，$g_j=\lambda\rho|\cdot|$ 加上可选的二次项；$\lambda>0$ 时水平集有界）。

**关于变量选择的一致性（只陈述，不证明）.** Zhao–Yu（2006）证明：在固定维数、设计矩阵满足"不可表示条件" $\lVert C_{21}C_{11}^{-1}\operatorname{sign}(\beta_S)\rVert_\infty\le1-\eta$（$S$ 为真实非零集，$C$ 为特征的协方差分块，$\eta>0$）以及若干正则条件时，适当选取 $\lambda_n$ 可使 $P(\operatorname{sign}\hat\beta=\operatorname{sign}\beta)\to1$；这个条件在特征高度相关时很容易不满足，此时 Lasso 选错变量的概率不趋于 0。

参考：R. Tibshirani, Regression shrinkage and selection via the lasso, *JRSS-B* 58 (1996)；H. Zou, T. Hastie, *JRSS-B* 67 (2005)；P. Tseng, *J. Optim. Theory Appl.* 109 (2001)；J. Friedman, T. Hastie, R. Tibshirani, Regularization paths for GLMs via coordinate descent, *J. Stat. Softw.* 33 (2010)；P. Zhao, B. Yu, *JMLR* 7 (2006)。
`
});

add({
  id: "logreg", name: "多项逻辑回归", group: "linear", api: "supervised", kinds: ["classification"], families: ["tabular", "image", "toy"],
  summary: "softmax 线性分类器加 L2 惩罚，用 L-BFGS 在整个训练集上优化；词元输入自动展开成独热编码。",
  params: [
    N("loglam", "L2 强度 log₁₀ λ", -3, -7, 1, 0.1, "惩罚 λ/2·‖W‖²（不罚截距）；数据线性可分时必须有一点，否则权重会无限增大"),
    I("maxIter", "最多迭代", 300, 5, 3000, 5, "L-BFGS 的迭代次数上限；时间预算用完也会停")
  ],
  code: code(SN.base, SN.scaler, SN.input, SN.lbfgs, js`
/* ================= 多项逻辑回归（softmax 回归） =================
 * 模型：P(y = c | x) = softmax(Wᵀz + b)_c，z 是标准化后的特征（词元输入则是独热编码）。
 * 目标：平均交叉熵 + λ/2·‖W‖²，凸函数；用 L-BFGS 在整个训练集上最小化。
 * 参数排成一个长向量：先是 W（D×k，按行），后面是 k 个截距。
 * 独热输入每行只有 d 个 1，用"下标表"代替稠密矩阵：算一行的得分只要把 d 行权重加起来。 */
function design(inp, X, n) {
  if (inp.V > 0) {
    var d = inp.d, V = inp.V, idx = new Int32Array(n * d);
    for (var i = 0; i < n; i++) for (var j = 0; j < d; j++) { var v = X[i * d + j] | 0; idx[i * d + j] = j * V + (v >= 0 && v < V ? v : 0); }
    return { sparse: true, idx: idx, n: n, a: d };
  }
  return { sparse: false, Z: toInput(inp, X, n), n: n, a: inp.dim };
}
function scores(A, w, D, k, out) {
  var n = A.n, a = A.a, bo = D * k, i, j, c;
  for (i = 0; i < n; i++) {
    var o = i * k;
    for (c = 0; c < k; c++) out[o + c] = w[bo + c];
    if (A.sparse) { for (j = 0; j < a; j++) { var r = A.idx[i * a + j] * k; for (c = 0; c < k; c++) out[o + c] += w[r + c]; } }
    else for (j = 0; j < a; j++) { var z = A.Z[i * a + j]; if (z === 0) continue; var rr = j * k; for (c = 0; c < k; c++) out[o + c] += z * w[rr + c]; }
  }
  return out;
}
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, k = tr.k, n = tr.n, inp = makeInput(tr), D = inp.dim;
  var A = design(inp, tr.X, n), Av = design(inp, va.X, va.n), lam = Math.pow(10, p.loglam), nw = (D + 1) * k;
  var w = new Float64Array(nw), S = new Float64Array(n * k), Sv = new Float64Array(va.n * k), last = { loss: 0, acc: 0 }, i, j, c;
  // 截距从各类的对数频率开始（相当于先学会"按比例猜"）
  var cnt = new Float64Array(k); for (i = 0; i < n; i++) cnt[tr.y[i]]++;
  for (c = 0; c < k; c++) w[D * k + c] = Math.log((cnt[c] + 0.5) / (n + 0.5 * k));
  function fg(wv, g) {
    scores(A, wv, D, k, S); softmaxRows(S, n, k);
    var loss = ceOf(S, tr.y, n, k), reg = 0, q;
    last.loss = loss; last.acc = accOf(S, tr.y, n, k);
    g.fill(0);
    for (i = 0; i < n; i++) S[i * k + tr.y[i]] -= 1;                      // S ← P − Y
    for (i = 0; i < n; i++) {
      var o = i * k;
      for (c = 0; c < k; c++) g[D * k + c] += S[o + c] / n;
      if (A.sparse) { for (j = 0; j < A.a; j++) { var r = A.idx[i * A.a + j] * k; for (c = 0; c < k; c++) g[r + c] += S[o + c] / n; } }
      else for (j = 0; j < D; j++) { var z = A.Z[i * D + j]; if (z === 0) continue; var rr = j * k; for (c = 0; c < k; c++) g[rr + c] += z * S[o + c] / n; }
    }
    for (q = 0; q < D * k; q++) { reg += wv[q] * wv[q]; g[q] += lam * wv[q]; }
    return loss + 0.5 * lam * reg;
  }
  var M = { inp: inp, k: k, D: D, w: w, lam: lam, names: [], classes: tr.classes };
  for (j = 0; j < (inp.V > 0 ? 0 : D); j++) M.names.push(featName(tr, j));
  var res = lbfgs(fg, w, { maxIter: p.maxIter, m: 10, tol: 1e-12, onIter: function (it, f) {
    scores(Av, w, D, k, Sv); softmaxRows(Sv, va.n, k);
    ctx.report(it, { loss: last.loss, validLoss: ceOf(Sv, va.y, va.n, k), trainMetric: last.acc, validMetric: accOf(Sv, va.y, va.n, k), objective: f });
    ctx.snapshot(it, M);
    return ctx.timeLeft() < 0;
  } });
  M.iters = res.iters; M.obj = res.f; M.size = nw;
  return M;
}
function predict(M, X, n) {
  var A = design(M.inp, X, n), out = new Float64Array(n * M.k);
  return softmaxRows(scores(A, M.w, M.D, M.k, out), n, M.k);
}
function inspect(M) {
  var D = M.D, k = M.k, W = new Float32Array(D * k), coef = [], j, c;
  for (j = 0; j < D * k; j++) W[j] = M.w[j];
  if (M.inp.V === 0 && k === 2) for (j = 0; j < D; j++) coef.push({ name: M.names[j], value: M.w[j * 2 + 1] - M.w[j * 2] });
  else if (M.inp.V === 0 && D * k <= 200) for (j = 0; j < D; j++) for (c = 0; c < k; c++) coef.push({ name: (M.classes ? M.classes[c] : "类" + c) + "：" + M.names[j], value: M.w[j * k + c] });
  return { coef: coef, layers: [{ name: "权重 W（" + (M.inp.V > 0 ? "位置×词元" : "特征") + " × 类别）", rows: D, cols: k, data: W }],
    text: "L-BFGS 迭代 " + M.iters + " 次，目标函数 " + M.obj.toPrecision(5) + "（λ = " + M.lam.toExponential(1) + "）。" + (k === 2 && M.inp.V === 0 ? "\n两类时系数画的是 w₁ − w₀：标准化特征每增加 1，对数几率 log(p₁/p₀) 增加多少。" : "") };
}
`),
  docs: md`
## 模型
$k$ 个类别，每类一个线性得分 $s_c(x)=w_c^\top z+b_c$，概率取 softmax：
$$P(y=c\mid x)=\frac{e^{s_c(x)}}{\sum_{c'}e^{s_{c'}(x)}} .$$
$z$ 是标准化后的特征；科研玩具里的词元输入（每个位置一个编号）展开成独热向量，所以模型等价于"每个位置、每个词元对每个类别加一个分数"。两类时它就是普通的逻辑回归：$\log\frac{p_1}{p_0}=(w_1-w_0)^\top z+(b_1-b_0)$。决策边界 $\{s_c=s_{c'}\}$ 是超平面。

## 损失与训练
$$J(W,b)=\frac1n\sum_{i=1}^n-\log P(y_i\mid x_i)+\frac\lambda2\lVert W\rVert_F^2 .$$
梯度 $\nabla_W J=\frac1nZ^\top(P-Y)+\lambda W$，$\nabla_bJ=\frac1n(P-Y)^\top\mathbf 1$（$P$ 是预测概率矩阵，$Y$ 是独热标签）。用 **L-BFGS** 在整个训练集上优化：记住最近 10 步的参数变化 $s$ 与梯度变化 $y$，用它们近似 Hessian 的逆，再沿这个方向做满足 Armijo 条件的回溯线搜索。截距从各类的对数频率开始。学习曲线的横轴是迭代次数。

## 参数怎么调
- **λ**：数据线性可分（比如低噪声的高斯混合、两个特征的 Iris）时，没有惩罚的最优解不存在（权重趋于无穷），必须有 $\lambda>0$。$\lambda$ 大，概率更"温和"、校准更好，但边界会被拉向样本多的那边。
- 迭代上限一般不是瓶颈：凸问题上 L-BFGS 几十到几百步就收敛。
- 想要非线性边界：加特征（多项式、随机傅里叶特征）或者换核方法、树、神经网络。

## 复杂度
每次计算目标和梯度 $O(nDk)$（独热输入是 $O(ndk)$，$d$ 为位置数），L-BFGS 每步另加 $O(mDk)$。预测每个样本 $O(Dk)$。

## 什么时候好用、什么时候失效
各类在特征空间里大致线性可分、或者对数几率近似是特征的线性函数时，它稳定、快、概率校准得好，是分类的标准基线。两个半月、同心圆、异或这类边界弯曲的数据上，它最多只比按比例猜好一点。模加法这类词元任务上，独热线性模型只能表示"$a$ 的贡献 + $b$ 的贡献"，学不会 $(a+b)\bmod p$。

## 理论
**定理 1（凸性）.** $J$ 是 $(W,b)$ 的凸函数；$\lambda>0$ 时它对 $W$ 严格凸。

*证明.* 对一个样本，负对数似然是 $\phi(s)=\log\sum_c e^{s_c}-s_y$，其 Hessian 为 $\nabla^2\phi=\operatorname{diag}(p)-pp^\top$。对任意 $v$，$v^\top(\operatorname{diag}(p)-pp^\top)v=\sum_cp_cv_c^2-(\sum_cp_cv_c)^2$，这是以 $p$ 为分布时 $v_c$ 的方差，非负。$s$ 是参数的线性函数，凸函数与线性映射的复合仍是凸的；加上严格凸的 $\frac\lambda2\lVert W\rVert^2$ 即得结论。（截距方向上不严格凸：给所有 $b_c$ 同时加一个常数，概率不变；但预测的概率在最优解集上是唯一的。）$\square$

**定理 2（可分时最优解不存在）.** 设 $\lambda=0$，且存在 $(W^*,b^*)$ 使每个训练样本都满足 $s_{y_i}(x_i)>s_c(x_i)$（$c\ne y_i$）。则 $\inf J=0$ 但取不到。

*证明.* 沿 $t(W^*,b^*)$，$t\to\infty$，每个样本的正确类概率 $\to1$，所以 $J\to0$；而对任何有限参数，每个概率都严格小于 1，$J>0$。$\square$
对可分数据做（无惩罚的）梯度下降，权重的方向收敛到最大间隔的超平面（Soudry 等 2018，两类的情形）；这解释了为什么"训练到损失接近 0"仍能泛化，但也说明此时概率会越来越极端。

**定理 3（L-BFGS 的收敛，Liu–Nocedal 1989）.** 若目标函数二次连续可微、在初始点的水平集上一致强凸（Hessian 的特征值有正的上下界），则用满足 Wolfe 条件的线搜索的 L-BFGS 产生的迭代点 R-线性收敛到唯一最小点。（这里的实现用 Armijo 回溯，并在曲率条件 $s^\top y>0$ 不满足时跳过更新，以保持近似 Hessian 正定。）

参考：D. C. Liu, J. Nocedal, *Math. Programming* 45 (1989)；D. Soudry 等, The implicit bias of gradient descent on separable data, *JMLR* 19 (2018)；Hastie–Tibshirani–Friedman §4.4。
`
});

/* ================================================================== *
 *  概率模型
 * ================================================================== */
add({
  id: "nbayes", name: "朴素贝叶斯", group: "probabilistic", api: "supervised", kinds: ["classification"], families: ["tabular", "image", "toy"],
  summary: "假设给定类别时各特征独立：数值特征用高斯，词元用类别分布；有缺失值时直接把那一维积分掉。",
  params: [
    N("logsmooth", "方差平滑 log₁₀ ε", -9, -12, 0, 0.5, "每个方差加上 ε × 最大的特征方差，免得某一类里取值恒定的特征让概率变成 0 或无穷"),
    N("alpha", "词元的拉普拉斯平滑 α", 1, 0.01, 10, 0.01, "只用于词元输入：P(词元 = v | 类别) = (计数 + α)/(n_c + αV)"),
    S("prior", "先验", "data", [["data", "按训练集的类别比例"], ["uniform", "各类相等"]])
  ],
  code: code(SN.base, js`
/* ================= 朴素贝叶斯 =================
 * P(y = c | x) ∝ π_c · Π_j p(x_j | c)：给定类别时各特征独立。
 * 数值特征：p(x_j | c) = N(μ_cj, σ²_cj)；词元：p(x_j = v | c) = (计数 + α)/(n_c + αV)。
 * 缺失值（NaN）：独立性假设下，把这一维积分掉就是直接不乘它这一项——这是精确的，不是近似。 */
function vocabOf(part) { var t = part.tokens; if (t == null) return 0; return typeof t === "number" ? t | 0 : t.vocab | 0; }
function fit(data, p, lib, ctx) {
  var tr = data.train, n = tr.n, d = tr.d, k = tr.k, V = vocabOf(tr), i, j, c;
  var M = { k: k, d: d, V: V, logPrior: new Float64Array(k), classes: tr.classes, names: [] }, cnt = new Float64Array(k);
  for (j = 0; j < d; j++) M.names.push(featName(tr, j));
  for (i = 0; i < n; i++) cnt[tr.y[i]]++;
  for (c = 0; c < k; c++) M.logPrior[c] = p.prior === "uniform" ? -Math.log(k) : Math.log((cnt[c] + 0.5) / (n + 0.5 * k));
  if (V > 0) {
    // 词元：每个（类别, 位置, 词元）数一数
    var C = new Float64Array(k * d * V);
    for (i = 0; i < n; i++) for (j = 0; j < d; j++) { var v = tr.X[i * d + j] | 0; if (v >= 0 && v < V) C[(tr.y[i] * d + j) * V + v]++; }
    M.logp = new Float64Array(k * d * V);
    for (c = 0; c < k; c++) for (j = 0; j < d; j++) for (v = 0; v < V; v++) M.logp[(c * d + j) * V + v] = Math.log((C[(c * d + j) * V + v] + p.alpha) / (cnt[c] + p.alpha * V));
    M.size = k * d * V + k;
    return M;
  }
  // 数值特征：每类每个特征的均值和方差（忽略缺失值）
  var mu = new Float64Array(k * d), va = new Float64Array(k * d), m = new Float64Array(k * d), gm = new Float64Array(d), gv = new Float64Array(d), gc = new Float64Array(d), x;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { x = tr.X[i * d + j]; if (x === x) { mu[tr.y[i] * d + j] += x; m[tr.y[i] * d + j]++; gm[j] += x; gc[j]++; } }
  for (j = 0; j < k * d; j++) mu[j] = m[j] ? mu[j] / m[j] : 0;
  for (j = 0; j < d; j++) gm[j] = gc[j] ? gm[j] / gc[j] : 0;
  for (i = 0; i < n; i++) for (j = 0; j < d; j++) { x = tr.X[i * d + j]; if (x === x) { var e = x - mu[tr.y[i] * d + j]; va[tr.y[i] * d + j] += e * e; gv[j] += (x - gm[j]) * (x - gm[j]); } }
  var vmax = 0; for (j = 0; j < d; j++) { gv[j] = gc[j] ? gv[j] / gc[j] : 0; vmax = Math.max(vmax, gv[j]); }
  var eps = Math.pow(10, p.logsmooth) * (vmax || 1);
  for (j = 0; j < k * d; j++) { va[j] = (m[j] ? va[j] / m[j] : 0) + eps; if (!m[j]) mu[j] = gm[j % d]; }
  M.mu = mu; M.var = va; M.eps = eps; M.size = 2 * k * d + k;
  return M;
}
function predict(M, X, n) {
  var k = M.k, d = M.d, out = new Float64Array(n * k), i, j, c;
  for (i = 0; i < n; i++) {
    for (c = 0; c < k; c++) {
      var s = M.logPrior[c];
      if (M.V > 0) { for (j = 0; j < d; j++) { var v = X[i * d + j] | 0; if (v >= 0 && v < M.V) s += M.logp[(c * d + j) * M.V + v]; } }
      else for (j = 0; j < d; j++) { var x = X[i * d + j]; if (x !== x) continue; var q = c * d + j, e = x - M.mu[q]; s -= 0.5 * (Math.log(2 * Math.PI * M.var[q]) + e * e / M.var[q]); }
      out[i * k + c] = s;
    }
  }
  return softmaxRows(out, n, k);
}
function inspect(M) {
  if (M.V > 0) return { text: "类别分布的朴素贝叶斯：每个位置、每个类别一张 " + M.V + " 个词元的概率表（拉普拉斯平滑）。\n位置之间被当作独立的：像 (a + b) mod p 这样必须同时看两个位置才能定的标签，它学不会。" };
  var mus = new Float32Array(M.k * M.d), sds = new Float32Array(M.k * M.d);
  for (var j = 0; j < M.k * M.d; j++) { mus[j] = M.mu[j]; sds[j] = Math.sqrt(M.var[j]); }
  return { layers: [{ name: "各类的均值 μ（类别 × 特征）", rows: M.k, cols: M.d, data: mus }, { name: "各类的标准差 σ（类别 × 特征）", rows: M.k, cols: M.d, data: sds }],
    text: "高斯朴素贝叶斯：" + M.k + " 类 × " + M.d + " 个特征。方差平滑 ε = " + M.eps.toExponential(2) + "。" };
}
`),
  docs: md`
## 模型
生成式模型：先按先验 $\pi_c$ 抽类别，再在给定类别时**独立地**抽每个特征：
$$p(x,y=c)=\pi_c\prod_{j=1}^dp_j(x_j\mid c),\qquad P(y=c\mid x)=\frac{\pi_c\prod_jp_j(x_j\mid c)}{\sum_{c'}\pi_{c'}\prod_jp_j(x_j\mid c')}.$$
数值特征取 $p_j(x_j\mid c)=N(\mu_{cj},\sigma^2_{cj})$；科研玩具的词元取类别分布 $p_j(x_j=v\mid c)=\theta_{cjv}$。

## 损失与训练
最大似然（词元加拉普拉斯平滑），全是闭式的计数：$\hat\mu_{cj}$、$\hat\sigma^2_{cj}$ 是第 $c$ 类样本在第 $j$ 维上的均值与方差，再加上 $\varepsilon\cdot\max_j\widehat{\operatorname{Var}}(x_j)$（防止某类里取值恒定的像素让方差为 0）；$\hat\theta_{cjv}=(N_{cjv}+\alpha)/(N_c+\alpha V)$。先验取 $(N_c+\tfrac12)/(n+\tfrac k2)$ 或均匀。没有迭代，所以没有学习曲线。

## 参数怎么调
- 方差平滑 $\varepsilon$：图像数据（边上的像素在某一类里总是 0）里很关键。太小时概率极端（对数损失很大），太大时所有类的方差被拉平。
- 先验：测试时类别比例和训练时不同，就选"各类相等"。
- 它几乎没有可调的东西；表现不好时通常是独立性假设本身不成立。

## 复杂度
训练 $O(nd)$，预测每个样本 $O(kd)$。是这里最快的分类器之一，适合做基线。

## 什么时候好用、什么时候失效
特征多、样本少、特征之间相关性不强时（文本、某些医学指标），它常常和精心调过的判别式模型差不多，而且样本效率极高。特征强相关时（图像的相邻像素），独立性假设把同一份证据重复计算很多次，概率严重过于自信，但按最大概率分类的准确率往往还不错。标签取决于特征的**组合**（异或、模加法）时完全失效：在每个位置单独看，各类的分布是一样的。

## 理论
**定理 1（共享方差时是线性分类器）.** 设各类的方差相同：$\sigma^2_{cj}=\sigma^2_j$。则对任意两类 $c,c'$，
$$\log\frac{P(y=c\mid x)}{P(y=c'\mid x)}=\sum_j\frac{\mu_{cj}-\mu_{c'j}}{\sigma_j^2}\,x_j+\log\frac{\pi_c}{\pi_{c'}}-\sum_j\frac{\mu_{cj}^2-\mu_{c'j}^2}{2\sigma_j^2},$$
是 $x$ 的仿射函数，所以决策边界是超平面，后验是 softmax 线性模型。

*证明.* 两类的对数似然之差为 $\sum_j\frac{-(x_j-\mu_{cj})^2+(x_j-\mu_{c'j})^2}{2\sigma_j^2}$，展开后 $x_j^2$ 项抵消，剩下的就是上式。$\square$
方差随类别变化时，$x_j^2$ 项不抵消，边界是二次曲面（对角协方差的二次判别）。

**生成式与判别式（Ng–Jordan 2002）.** 上面的定理说明高斯朴素贝叶斯与逻辑回归有同样的假设空间（一对"生成—判别"模型）。两者渐近地收敛到各自的最优（模型不对时逻辑回归的渐近误差不更差），但朴素贝叶斯达到其渐近误差所需的样本数是 $O(\log d)$，逻辑回归是 $O(d)$：样本少时朴素贝叶斯常常更好，样本多时逻辑回归追上并超过。

**命题 2（缺失值）.** 在模型 $p(x\mid c)=\prod_jp_j(x_j\mid c)$ 下，若只观测到 $x_O$（$O\subset\{1,\dots,d\}$），则 $P(y=c\mid x_O)\propto\pi_c\prod_{j\in O}p_j(x_j\mid c)$。

*证明.* $p(x_O\mid c)=\int\prod_jp_j(x_j\mid c)\,dx_{\bar O}=\prod_{j\in O}p_j(x_j\mid c)\prod_{j\notin O}\int p_j\,dx_j$，后面每个积分都是 1。$\square$ 所以这里的实现遇到 NaN 就跳过那一项（前提是"缺失"本身与类别无关）。

**拉普拉斯平滑是贝叶斯估计.** 给 $\theta_{cj\cdot}$ 加狄利克雷先验 $\operatorname{Dir}(\alpha,\dots,\alpha)$，后验是 $\operatorname{Dir}(N_{cj\cdot}+\alpha)$，其后验均值正是 $(N_{cjv}+\alpha)/(N_c+\alpha V)$。

参考：A. Y. Ng, M. I. Jordan, On discriminative vs. generative classifiers, *NIPS* 14 (2002)；Hastie–Tibshirani–Friedman §6.6.3。
`
});

add({
  id: "lda", name: "线性 / 二次判别分析", group: "probabilistic", api: "supervised", kinds: ["classification"], families: ["tabular", "image"],
  summary: "每类一个高斯：共用协方差得到线性边界（LDA），各用各的得到二次边界（QDA）；可以向对角收缩。",
  params: [
    S("type", "类型", "lda", [["lda", "LDA：各类共用协方差（线性边界）"], ["qda", "QDA：各类各自的协方差（二次边界）"]]),
    N("shrink", "协方差收缩 γ", 0.01, 0, 1, 0.01, "Σ ← (1−γ)Σ + γ·(tr Σ / d)·I：样本少、维数高时调大")
  ],
  code: code(SN.base, SN.scaler, SN.chol, js`
/* ================= 线性 / 二次判别分析 =================
 * 假设 X | y = c ~ N(μ_c, Σ_c)，用贝叶斯公式得到后验。LDA：Σ_c 都等于共用的 Σ；QDA：各类各自估计。
 * 先把特征标准化（判别分析对仿射变换不变，标准化只是为了数值稳定）。
 * 维数超过 800 时只用对角协方差（解 d×d 的方程组太慢），并在日志里说明。 */
function covOf(Z, y, n, d, mu, which) {   // which = −1：类内合并；否则只用第 which 类
  var C = new Float64Array(d * d), e = new Float64Array(d), m = 0, i, a, b;
  for (i = 0; i < n; i++) {
    if (which >= 0 && y[i] !== which) continue;
    var c = y[i]; m++;
    for (a = 0; a < d; a++) e[a] = Z[i * d + a] - mu[c * d + a];
    for (a = 0; a < d; a++) { var ea = e[a]; if (ea === 0) continue; for (b = a; b < d; b++) C[a * d + b] += ea * e[b]; }
  }
  for (a = 0; a < d; a++) for (b = a; b < d; b++) { C[a * d + b] /= Math.max(1, m - (which >= 0 ? 1 : 0)); C[b * d + a] = C[a * d + b]; }
  return C;
}
function shrinkCov(C, d, g, diag) {
  var tr = 0, a, b; for (a = 0; a < d; a++) tr += C[a * d + a];
  var t = tr / d || 1;
  for (a = 0; a < d; a++) for (b = 0; b < d; b++) { if (diag && a !== b) { C[a * d + b] = 0; continue; } C[a * d + b] = (1 - g) * C[a * d + b] + (a === b ? g * t + 1e-9 * t : 0); }
  return C;
}
function fit(data, p, lib, ctx) {
  var tr = data.train, n = tr.n, d = tr.d, k = tr.k, sc = fitScaler(tr.X, n, d), Z = applyScaler(sc, tr.X, n), i, j, c;
  var mu = new Float64Array(k * d), cnt = new Float64Array(k), diag = d > 800, qda = p.type === "qda";
  if (diag) ctx.log("特征有 " + d + " 个：只用对角协方差。");
  for (i = 0; i < n; i++) { cnt[tr.y[i]]++; for (j = 0; j < d; j++) mu[tr.y[i] * d + j] += Z[i * d + j]; }
  for (c = 0; c < k; c++) for (j = 0; j < d; j++) mu[c * d + j] /= Math.max(1, cnt[c]);
  var M = { sc: sc, k: k, d: d, mu: mu, qda: qda, logPrior: new Float64Array(k), names: [], classes: tr.classes, diag: diag, shrink: p.shrink };
  for (j = 0; j < d; j++) M.names.push(featName(tr, j));
  for (c = 0; c < k; c++) M.logPrior[c] = Math.log((cnt[c] + 0.5) / (n + 0.5 * k));
  if (!qda) {
    var L = cholFactor(shrinkCov(covOf(Z, tr.y, n, d, mu, -1), d, p.shrink, diag), d), rhs = new Float64Array(d * k);
    for (j = 0; j < d; j++) for (c = 0; c < k; c++) rhs[j * k + c] = mu[c * d + j];
    M.A = cholSolve(L, rhs, d);                          // A = Σ⁻¹ M，第 c 列是 Σ⁻¹μ_c
    M.b = new Float64Array(k);
    for (c = 0; c < k; c++) { var s = 0; for (j = 0; j < d; j++) s += mu[c * d + j] * M.A[j * k + c]; M.b[c] = -0.5 * s + M.logPrior[c]; }
    M.size = d * k + k;
  } else {
    M.L = []; M.logdet = new Float64Array(k);
    for (c = 0; c < k; c++) {
      if (cnt[c] < 2) throw new Error("QDA 要求每一类至少有 2 个训练样本（第 " + (c + 1) + " 类只有 " + cnt[c] + " 个）。");
      var Lc = cholFactor(shrinkCov(covOf(Z, tr.y, n, d, mu, c), d, p.shrink, diag), d), ld = 0;
      for (j = 0; j < d; j++) ld += 2 * Math.log(Lc[j * d + j]);
      M.L.push(Lc); M.logdet[c] = ld;
      if (ctx.timeLeft() < 0) throw new Error("QDA 在时间预算内没算完：维数太高了，试试 LDA 或者加大预算。");
    }
    M.size = k * (d * (d + 1) / 2 + d + 1);
  }
  return M;
}
function predict(M, X, n) {
  var k = M.k, d = M.d, Z = applyScaler(M.sc, X, n), out = new Float64Array(n * k), e = new Float64Array(d), i, j, c, q;
  for (i = 0; i < n; i++) {
    for (c = 0; c < k; c++) {
      var s;
      if (!M.qda) { s = M.b[c]; for (j = 0; j < d; j++) s += Z[i * d + j] * M.A[j * k + c]; }
      else {
        // ‖L⁻¹(z − μ_c)‖²：解下三角方程组
        var L = M.L[c], qf = 0;
        for (j = 0; j < d; j++) { var t = Z[i * d + j] - M.mu[c * d + j]; for (q = 0; q < j; q++) t -= L[j * d + q] * e[q]; e[j] = t / L[j * d + j]; qf += e[j] * e[j]; }
        s = M.logPrior[c] - 0.5 * M.logdet[c] - 0.5 * qf;
      }
      out[i * k + c] = s;
    }
  }
  return softmaxRows(out, n, k);
}
function inspect(M) {
  var k = M.k, d = M.d, j, out = { text: (M.qda ? "QDA" : "LDA") + "：" + k + " 类、" + d + " 个（标准化后的）特征，收缩 γ = " + M.shrink + (M.diag ? "（对角协方差）" : "") + "。" };
  var mus = new Float32Array(k * d); for (j = 0; j < k * d; j++) mus[j] = M.mu[j];
  out.layers = [{ name: "各类的均值 μ（类别 × 标准化特征）", rows: k, cols: d, data: mus }];
  if (!M.qda) {
    var A = new Float32Array(d * k); for (j = 0; j < d * k; j++) A[j] = M.A[j];
    out.layers.push({ name: "判别方向 Σ⁻¹μ_c（特征 × 类别）", rows: d, cols: k, data: A });
    if (k === 2) { out.coef = []; for (j = 0; j < d; j++) out.coef.push({ name: M.names[j], value: M.A[j * 2 + 1] - M.A[j * 2] }); out.text += "\n两类时系数是 Σ⁻¹(μ₁ − μ₀)：Fisher 判别方向。"; }
  }
  return out;
}
`),
  docs: md`
## 模型
假设每一类是一个多元正态分布：$X\mid y=c\sim N(\mu_c,\Sigma_c)$，先验 $\pi_c$。由贝叶斯公式，$P(y=c\mid x)\propto\pi_c\,\varphi(x;\mu_c,\Sigma_c)$。
- **LDA**：$\Sigma_c\equiv\Sigma$（共用），判别函数 $\delta_c(x)=x^\top\Sigma^{-1}\mu_c-\tfrac12\mu_c^\top\Sigma^{-1}\mu_c+\log\pi_c$ 是线性的；
- **QDA**：各类各自的 $\Sigma_c$，$\delta_c(x)=-\tfrac12\log\det\Sigma_c-\tfrac12(x-\mu_c)^\top\Sigma_c^{-1}(x-\mu_c)+\log\pi_c$ 是二次的。

后验是 $\operatorname{softmax}_c\,\delta_c(x)$。

## 损失与训练
最大似然的闭式解：$\hat\mu_c$ 是类内均值，LDA 的 $\hat\Sigma$ 是合并的类内协方差（除以 $n-k$ 的近似：这里除以 $n$），QDA 的 $\hat\Sigma_c$ 除以 $n_c-1$。再做收缩 $\hat\Sigma\leftarrow(1-\gamma)\hat\Sigma+\gamma\,\frac{\operatorname{tr}\hat\Sigma}d I$。用 Cholesky 分解求 $\Sigma^{-1}\mu_c$（LDA）或 $L_c^{-1}(x-\mu_c)$ 与 $\log\det\Sigma_c=2\sum_j\log(L_c)_{jj}$（QDA）。先把特征标准化，只为数值稳定（判别分析对可逆仿射变换不变）。

## 参数怎么调
- 两类的协方差明显不同（一类紧、一类散）时 QDA 更好；否则 LDA 参数少得多，方差更小。
- **收缩 γ**：维数 $d$ 接近或超过某一类的样本数时，样本协方差奇异或极不稳定，必须收缩。图像数据上（64 或 256 个像素）LDA 取 0.01–0.1，QDA 取 0.1–0.5。
- 两个高斯类的"高斯混合"数据上，LDA / QDA 就是（估计出来的）贝叶斯最优分类器，可以和 oracle 直接比。

## 复杂度
协方差 $O(nd^2)$，分解 $O(d^3)$（QDA 乘以 $k$）。预测：LDA 每个样本 $O(dk)$，QDA $O(d^2k)$。$d>800$ 时退回对角协方差。

## 什么时候好用、什么时候失效
各类近似正态、样本相对维数不太少时，它们样本效率高、没有迭代、概率也比较可信；LDA 还能给出最多 $k-1$ 维的判别子空间（Fisher）。各类是弯曲的流形（两个半月）、多峰（异或、棋盘）或带重尾和离群点时，正态假设不成立，边界会放错位置。QDA 在维数高时参数个数是 $O(kd^2)$，极易过拟合。

## 理论
**定理 1（高斯假设下的贝叶斯分类器）.** 若 $X\mid y=c\sim N(\mu_c,\Sigma_c)$，$\Sigma_c\succ0$，则 0-1 损失下的贝叶斯最优分类器是 $\arg\max_c\delta_c(x)$，$\delta_c$ 为上面 QDA 的形式；若 $\Sigma_c\equiv\Sigma$，它化为 LDA 的线性形式。

*证明.* 贝叶斯分类器取后验最大的类，即最大化 $\log\pi_c+\log\varphi(x;\mu_c,\Sigma_c)=\log\pi_c-\frac d2\log2\pi-\frac12\log\det\Sigma_c-\frac12(x-\mu_c)^\top\Sigma_c^{-1}(x-\mu_c)$，去掉与 $c$ 无关的常数即得 $\delta_c$。协方差相同时，$\log\det$ 项和 $x^\top\Sigma^{-1}x$ 项与 $c$ 无关，也可以去掉，剩下的是 $x$ 的仿射函数。$\square$

**定理 2（两类 LDA 的错误率）.** 两类、先验相等、$\Sigma$ 共用时，贝叶斯错误率为 $\Phi(-\Delta/2)$，$\Delta^2=(\mu_1-\mu_0)^\top\Sigma^{-1}(\mu_1-\mu_0)$ 是马氏距离，$\Phi$ 为标准正态分布函数。

*证明.* 贝叶斯规则是 $w^\top x>w^\top\frac{\mu_0+\mu_1}2$，$w=\Sigma^{-1}(\mu_1-\mu_0)$。在第 $c$ 类下，$w^\top X\sim N(w^\top\mu_c,\ w^\top\Sigma w)=N(w^\top\mu_c,\ \Delta^2)$，两类均值相差 $w^\top(\mu_1-\mu_0)=\Delta^2$，阈值在正中间，所以每一类被分错的概率都是 $P(N(0,\Delta^2)>\Delta^2/2)=\Phi(-\Delta/2)$。$\square$

**Fisher 的视角.** 两类时，$w=\Sigma^{-1}(\mu_1-\mu_0)$ 也是使"类间距离 / 类内方差"$\frac{(w^\top(\mu_1-\mu_0))^2}{w^\top\Sigma w}$ 最大的方向（柯西—施瓦茨不等式），这个结论不需要正态假设。

**收缩.** 当 $d$ 与 $n$ 同阶时，样本协方差的特征值系统地比真实的更分散（大的偏大、小的偏小），求逆会放大误差。把它向 $\frac{\operatorname{tr}\hat\Sigma}dI$ 收缩，在 Frobenius 范数的意义下有最优的 $\gamma$（Ledoit–Wolf 2004 给出了它的相合估计）；这里把 $\gamma$ 留给你调。

参考：R. A. Fisher, The use of multiple measurements in taxonomic problems, *Ann. Eugenics* 7 (1936)；O. Ledoit, M. Wolf, *J. Multivariate Anal.* 88 (2004)；Hastie–Tibshirani–Friedman §4.3。
`
});

/* ================================================================== *
 *  近邻
 * ================================================================== */
add({
  id: "knn", name: "k 近邻", group: "neighbors", api: "supervised", kinds: ["classification", "regression"], families: ["tabular", "image", "toy"],
  summary: "找训练集里最近的 k 个点，投票（分类）或取平均（回归）；可以按验证集选 k。",
  params: [
    I("k", "邻居数 k", 15, 1, 200, 1),
    S("weight", "加权", "uniform", [["uniform", "等权"], ["distance", "按距离的倒数加权"]]),
    S("metric", "距离", "l2", [["l2", "欧氏距离"], ["l1", "曼哈顿距离"]], "特征先标准化；词元输入一律用汉明距离（不同的位置数）"),
    B("autoK", "按验证集选 k", false, "在 1、3、5、…、181 里挑验证集上最好的；动画里能看到 k 从小到大时边界怎样变平滑"),
    I("maxTrain", "最多保留的训练点", 5000, 200, 20000, 100, "训练集更大时随机抽这么多：预测的代价与它成正比")
  ],
  code: code(SN.base, SN.scaler, js`
/* ================= k 近邻 =================
 * 没有"训练"：把（标准化后的）训练点存起来；预测时逐个比较距离，留下最近的 k 个。
 * 分类：邻居投票的比例（再做一点平滑：p = (比例 + 0.001)/(1 + 0.001·类数)，免得概率恰好为 0 让对数损失爆掉）；回归：邻居的（加权）平均。 */
function vocabOf(part) { var t = part.tokens; if (t == null) return 0; return typeof t === "number" ? t | 0 : t.vocab | 0; }
function fit(data, p, lib, ctx) {
  var tr = data.train, n = tr.n, d = tr.d, tok = vocabOf(tr) > 0, cls = data.kind === "classification", i, j;
  var keep = [];
  for (i = 0; i < n; i++) keep.push(i);
  if (n > p.maxTrain) {                       // 随机抽 maxTrain 个（部分洗牌）
    for (i = 0; i < p.maxTrain; i++) { var q = i + lib.rng.int(n - i), t = keep[i]; keep[i] = keep[q]; keep[q] = t; }
    keep = keep.slice(0, p.maxTrain);
    ctx.log("训练集有 " + n + " 个点，随机保留了 " + p.maxTrain + " 个。");
  }
  var m = keep.length, sc = tok ? null : fitScaler(tr.X, n, d), Z = new Float64Array(m * d), y = cls ? new Int32Array(m) : new Float64Array(m);
  var Zall = tok ? tr.X : applyScaler(sc, tr.X, n);
  for (i = 0; i < m; i++) { for (j = 0; j < d; j++) Z[i * d + j] = Zall[keep[i] * d + j]; y[i] = tr.y[keep[i]]; }
  var M = { Z: Z, y: y, m: m, d: d, sc: sc, tok: tok, cls: cls, K: cls ? tr.k : 0, k: Math.min(p.k, m), weight: p.weight, metric: p.metric };
  M.size = m * (d + 1);
  if (p.autoK) {
    var va = data.valid, cand = [1, 3, 5, 7, 9, 11, 15, 21, 31, 45, 65, 91, 131, 181].filter(function (x) { return x <= m; });
    var kmax = cand[cand.length - 1], Q = tok ? va.X : applyScaler(sc, va.X, va.n), nb = neighbors(M, Q, va.n, kmax), best = null;
    cand.forEach(function (kk) {
      M.k = kk;
      var P = combine(M, nb, va.n, kmax), err, met;
      if (cls) { met = accOf(P, va.y, va.n, M.K); err = 1 - met; } else { met = mseOf(P, va.y, va.n); err = met; }
      ctx.report(kk, { validLoss: err, validMetric: met });
      ctx.snapshot(kk, M);
      if (!best || err < best.err - 1e-12 || (Math.abs(err - best.err) <= 1e-12 && kk > best.k)) best = { err: err, k: kk };
    });
    M.k = best.k;
    ctx.log("按验证集选出 k = " + M.k);
  }
  return M;
}
/* Q 的每一行找最近的 kk 个训练点：返回 { idx, dist }，各 n×kk，按距离从近到远 */
function neighbors(M, Q, n, kk) {
  var d = M.d, Z = M.Z, m = M.m, idx = new Int32Array(n * kk), dist = new Float64Array(n * kk), bd = new Float64Array(kk), bi = new Int32Array(kk), i, j, t, c;
  for (i = 0; i < n; i++) {
    var cnt = 0, qo = i * d;
    for (t = 0; t < m; t++) {
      var s = 0, to = t * d;
      if (M.tok) { for (j = 0; j < d; j++) if (Q[qo + j] !== Z[to + j]) s++; }
      else if (M.metric === "l1") { for (j = 0; j < d; j++) s += Math.abs(Q[qo + j] - Z[to + j]); }
      else { for (j = 0; j < d; j++) { var e = Q[qo + j] - Z[to + j]; s += e * e; } }
      if (cnt < kk) { c = cnt++; while (c > 0 && bd[c - 1] > s) { bd[c] = bd[c - 1]; bi[c] = bi[c - 1]; c--; } bd[c] = s; bi[c] = t; }
      else if (s < bd[kk - 1]) { c = kk - 1; while (c > 0 && bd[c - 1] > s) { bd[c] = bd[c - 1]; bi[c] = bi[c - 1]; c--; } bd[c] = s; bi[c] = t; }
    }
    for (c = 0; c < kk; c++) { idx[i * kk + c] = bi[c]; dist[i * kk + c] = M.metric === "l2" && !M.tok ? Math.sqrt(bd[c]) : bd[c]; }
  }
  return { idx: idx, dist: dist };
}
/* 用前 M.k 个邻居（按距离排好的）合成预测 */
function combine(M, nb, n, kk) {
  var K = M.K, k = M.k, out = new Float64Array(M.cls ? n * K : n), i, c;
  for (i = 0; i < n; i++) {
    var W = 0, acc = 0;
    for (c = 0; c < k; c++) {
      var w = M.weight === "distance" ? 1 / (nb.dist[i * kk + c] + 1e-9) : 1, t = nb.idx[i * kk + c];
      W += w;
      if (M.cls) out[i * K + M.y[t]] += w; else acc += w * M.y[t];
    }
    if (M.cls) { for (c = 0; c < K; c++) out[i * K + c] = (out[i * K + c] / W + 1e-3) / (1 + 1e-3 * K); }
    else out[i] = acc / W;
  }
  return out;
}
function predict(M, X, n) {
  var Q = M.tok ? X : applyScaler(M.sc, X, n);
  return combine(M, neighbors(M, Q, n, M.k), n, M.k);
}
function inspect(M) {
  return { text: "k = " + M.k + "，保留了 " + M.m + " 个训练点，" + (M.tok ? "汉明距离" : M.metric === "l1" ? "标准化后的曼哈顿距离" : "标准化后的欧氏距离") + "，" + (M.weight === "distance" ? "按距离的倒数加权" : "等权") + "。\nk 近邻没有可以画的参数：模型就是训练集本身。" };
}
`),
  docs: md`
## 模型
记 $x_{(1)}(x),\dots,x_{(k)}(x)$ 为训练集中离 $x$ 最近的 $k$ 个点（距离按标准化后的特征算；词元输入用汉明距离，即有几个位置不同）。
$$\hat f(x)=\sum_{i=1}^kw_i\,y_{(i)}\Big/\sum_iw_i\ \ (\text{回归}),\qquad \hat P(y=c\mid x)=\sum_{i:\,y_{(i)}=c}w_i\Big/\sum_iw_i\ \ (\text{分类}),$$
等权时 $w_i=1$，否则 $w_i=1/d(x,x_{(i)})$。分类的概率再做极轻的平滑 $(\hat P+0.001)/(1+0.001k_{\text{类}})$，避免恰好为 0。

## 损失与训练
没有训练：只是把（至多 maxTrain 个）训练点存下来。所有的计算都在预测时：每个查询点与所有存下的点比较，用插入排序维护最近的 $k$ 个。打开"按验证集选 k"时，先为每个验证点找出最近的 181 个邻居，再对 $k\in\{1,3,5,\dots,181\}$ 逐个评价——这一步也是唯一的"学习曲线"（横轴是 $k$）。

## 参数怎么调
- **k**：$k=1$ 训练误差为 0、方差最大；$k$ 越大边界越平滑、偏差越大。经验上从 $\sqrt n$ 附近开始试，或者直接按验证集选。
- **加权**：按距离加权在 $k$ 较大时减少远处邻居的影响，常常略好一点。
- **距离**：特征已标准化；如果有大量无关特征，所有方法的距离都会被噪声主导——先做特征选择，或换树模型。

## 复杂度
预测每个样本 $O(md)$（$m$ 为保留的训练点数），内存 $O(md)$。这里用的是逐个比较（暴力搜索）；低维时 KD 树能做到接近 $O(\log m)$，高维时没有本质上更快的精确方法。

## 什么时候好用、什么时候失效
低维（$d\lesssim10$）、样本多、边界形状复杂但局部平滑时，它几乎不需要调参就很有竞争力（两个半月、同心圆、螺旋）。高维时距离失去区分度（见下面的"维数灾难"），无关特征和尺度不当的特征会毁掉它。它不能外推：预测永远是训练目标的加权平均。模加法这种任务里，"最近的邻居"（共享 $a$ 或共享 $b$ 的样本）的标签恰好都是错的。

## 理论
**定理 1（Stone 1977：普遍相合性）.** 设 $(X,Y)\in\mathbb R^d\times\mathbb R$，$\mathbb E Y^2<\infty$，样本独立同分布，距离相同的邻居按随机顺序打破平局。若 $k=k_n\to\infty$ 且 $k_n/n\to0$，则等权 $k$ 近邻回归估计满足 $\mathbb E\int(\hat f_n-f)^2\,d\mu\to0$（$f(x)=\mathbb E[Y\mid X=x]$，$\mu$ 是 $X$ 的分布）——对**任意**分布都成立。分类时相应的 $k$ 近邻投票规则的错误率收敛到贝叶斯错误率。

*证明梗概.* 把误差分成方差项与偏差项。方差项：$\hat f_n(x)$ 是 $k$ 个（条件）独立噪声的平均，量级 $\sigma^2/k\to0$。偏差项：因为 $k/n\to0$，第 $k$ 个邻居到 $x$ 的距离对 $\mu$-几乎所有 $x$ 趋于 0（落在以 $x$ 为心的任一小球里的样本数约为 $n\mu(B)\gg k$）；再用连续函数在 $L^2(\mu)$ 中稠密逼近 $f$，加上 Stone 的"每个点至多是 $\gamma_dk$ 个点的 $k$ 近邻"这个几何引理控制平均，偏差项也趋于 0。完整证明见 Györfi 等（2002）第 6 章。$\square$

**定理 2（Cover–Hart 1967）.** 两类问题中，记 $R^*$ 为贝叶斯错误率，$R_{1\text{NN}}$ 为 1-近邻规则的渐近错误率（$n\to\infty$）。在 $\eta(x)=P(Y=1\mid X=x)$ 连续等正则条件下，
$$R^*\le R_{1\text{NN}}=\mathbb E\big[2\eta(X)(1-\eta(X))\big]\le2R^*(1-R^*).$$

*证明梗概.* $n\to\infty$ 时最近邻 $X'\to X$，而 $Y'$ 与 $Y$ 在给定 $X$ 下（渐近）独立同分布，所以出错的概率是 $P(Y\ne Y'\mid X)=2\eta(1-\eta)$。记 $r(x)=\min(\eta,1-\eta)$，则 $R^*=\mathbb Er$，$2\eta(1-\eta)=2r(1-r)$，$\mathbb E[2r(1-r)]=2R^*-2\mathbb Er^2\le2R^*-2(R^*)^2$（Jensen）。左边不等式因为 $2r(1-r)\ge r$（$r\le\frac12$）。$\square$
所以"只看一个邻居"的错误率最多是贝叶斯错误率的两倍——无论分布多复杂。

**维数灾难.** 设 $X$ 在 $[0,1]^d$ 上均匀，要让以某点为中心的立方体平均包含 $k$ 个样本，边长约为 $(k/n)^{1/d}$：$d=10$、$n=10^4$、$k=10$ 时边长约 $0.5$，"近邻"已经一点也不近了。等价地，高维中两两距离集中在它们的均值附近，最近与最远之比趋于 1。

参考：C. J. Stone, Consistent nonparametric regression, *Ann. Statist.* 5 (1977)；T. Cover, P. Hart, *IEEE Trans. Inf. Theory* 13 (1967)；L. Györfi, M. Kohler, A. Krzyżak, H. Walk,《A Distribution-Free Theory of Nonparametric Regression》（Springer, 2002）。
`
});

/*@@MORE@@*/

return ALGOS;
})();
if (typeof module !== "undefined" && module.exports) { module.exports = QL_MLALGOS; module.exports.GROUPS = QL_MLALGO_GROUPS; }
