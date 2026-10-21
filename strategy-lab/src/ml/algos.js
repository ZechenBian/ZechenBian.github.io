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

/*@@MORE@@*/

return ALGOS;
})();
if (typeof module !== "undefined" && module.exports) { module.exports = QL_MLALGOS; module.exports.GROUPS = QL_MLALGO_GROUPS; }
