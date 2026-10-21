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
/* 动画的快照按几何间隔拍：前 5 步每步都拍，之后步数每增长约 20% 拍一张（变化快的早期多拍几张，也省时间） */
function snapDue(t) { if (t <= 5) return true; var r = Math.log(1.2); return Math.floor(Math.log(t) / r) !== Math.floor(Math.log(t - 1) / r); }
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
    if (snapDue(it)) ctx.snapshot(it, M);
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
  var out = { coef: coef, layers: [{ name: "权重 W（" + (M.inp.V > 0 ? "位置×词元" : "特征") + " × 类别）", rows: D, cols: k, data: W }],
    text: (M.iters != null ? "L-BFGS 迭代 " + M.iters + " 次，目标函数 " + M.obj.toPrecision(5) : "训练中") + "（λ = " + M.lam.toExponential(1) + "）。" + (k === 2 && M.inp.V === 0 ? "\n两类时系数画的是 w₁ − w₀：标准化特征每增加 1，对数几率 log(p₁/p₀) 增加多少。" : "") };
  if (M.inp.V > 0) {     // 词元输入：第一个位置那一块权重（词元 × 类别）就是这个线性模型的“嵌入”
    var V = M.inp.V, labels = [];
    for (j = 0; j < V; j++) labels.push(String(j));
    out.embedding = { rows: V, cols: k, data: W.subarray(0, V * k), labels: labels };
  }
  return out;
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
  if (M.V > 0) {
    var V = M.V, E = new Float32Array(V * M.k), labels = [];
    for (var v = 0; v < V; v++) { labels.push(String(v)); for (var c = 0; c < M.k; c++) E[v * M.k + c] = M.logp[(c * M.d + 0) * V + v]; }
    return { embedding: { rows: V, cols: M.k, data: E, labels: labels }, text: "类别分布的朴素贝叶斯：每个位置、每个类别一张 " + M.V + " 个词元的概率表（拉普拉斯平滑）。“嵌入”画的是第一个位置的 log P(词元 | 类别)（词元 × 类别）。\n位置之间被当作独立的：像 (a + b) mod p 这样必须同时看两个位置才能定的标签，它学不会。" };
  }
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

/* ================================================================== *
 *  树模型
 * ================================================================== */
add({
  id: "tree", name: "决策树（CART）", group: "trees", api: "supervised", kinds: ["classification", "regression"], families: ["tabular", "image"],
  summary: "贪心地一刀刀切分特征空间：分类按基尼指数或熵，回归按方差；长满之后按验证集做代价复杂度剪枝。",
  params: [
    I("maxDepth", "最大深度", 8, 1, 30, 1),
    I("minLeaf", "叶子最少样本数", 5, 1, 200, 1),
    S("crit", "分类的分裂准则", "gini", [["gini", "基尼指数"], ["entropy", "熵（信息增益）"]], "回归一律用方差（平方误差）的减少量"),
    B("prune", "代价复杂度剪枝", true, "长满之后，按“最弱的一环”逐步剪掉，取验证集上最好的那棵子树"),
    I("bins", "每个特征的切点数上限", 64, 8, 255, 1, "取值很多的特征按分位数分箱；取值少于这个数时每个取值都是候选切点")
  ],
  code: code(SN.base, SN.tree, js`
/* ================= 决策树（CART） =================
 * 长树：从根开始，每个节点在所有特征、所有切点里找使"不纯度"下降最多的一刀（贪心），直到达到最大深度或叶子太小。
 * 剪枝：Breiman 等（1984）的代价复杂度剪枝——反复剪掉 g(t) = (R(t) − R(T_t)) / (|T_t| − 1) 最小的节点（R 是训练误差），
 * 得到一串越来越小的嵌套子树，在验证集上挑最好的。
 * 叶子的值：分类是各类的比例（每类加 0.5 的平滑），回归是均值。 */
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, n = tr.n, d = tr.d, cls = data.kind === "classification", K = cls ? tr.k : 1, i, c;
  var fill = colMeans(tr.X, n, d), bins = makeBins(tr.X, n, d, p.bins, fill), rows = new Int32Array(n), imp = new Float64Array(d);
  for (i = 0; i < n; i++) rows[i] = i;
  var T = growTree(bins, rows, { mode: cls ? "cls" : "gh", k: K, y: tr.y, g: cls ? null : tr.y, alpha: cls ? 0.5 : 0, maxDepth: p.maxDepth, minLeaf: p.minLeaf, crit: p.crit, imp: imp });
  var M = { T: T, cls: cls, K: K, d: d, fill: fill, cut: null, maxDep: null, imp: imp, names: [], classes: tr.classes };
  for (var j = 0; j < d; j++) M.names.push(featName(tr, j));
  var depth = 0; for (i = 0; i < T.size; i++) depth = Math.max(depth, T.dep[i]);
  // 动画：深度 0、1、2…… 的树（把树截短来看）
  for (var dd = 0; dd <= depth; dd++) {
    M.maxDep = dd; ctx.snapshot(dd, M);
    if (!p.prune) { var e1 = evalErr(M, tr), e2 = evalErr(M, va); ctx.report(dd, { loss: e1.err, validLoss: e2.err, trainMetric: e1.met, validMetric: e2.met }); }
  }
  M.maxDep = null;
  if (p.prune && T.size > 1) prune(M, tr, va, ctx);
  M.leaves = 0; M.nodes = 0;
  (function walk(nd) { M.nodes++; if (T.f[nd] < 0 || (M.cut && M.cut[nd])) { M.leaves++; return; } walk(T.left[nd]); walk(T.right[nd]); })(0);
  M.size = M.leaves * K + 2 * (M.nodes - M.leaves);
  return M;
}
function evalErr(M, part) {
  var P = predict(M, part.X, part.n);
  if (M.cls) { var a = accOf(P, part.y, part.n, M.K); return { err: 1 - a, met: a }; }
  var e = mseOf(P, part.y, part.n); return { err: e, met: e };
}
function prune(M, tr, va, ctx) {
  var T = M.T, N = T.size, K = M.K, n = tr.n, d = M.d, i, nd, c;
  // 每个节点的训练误差 R(t)：把训练样本沿路径走一遍，在路过的每个节点上计数
  var cnt = M.cls ? new Float64Array(N * K) : null, s1 = new Float64Array(N), s2 = new Float64Array(N), nn = new Float64Array(N), R = new Float64Array(N);
  for (i = 0; i < n; i++) {
    nd = 0;
    for (;;) {
      nn[nd]++;
      if (M.cls) cnt[nd * K + tr.y[i]]++; else { s1[nd] += tr.y[i]; s2[nd] += tr.y[i] * tr.y[i]; }
      if (T.f[nd] < 0) break;
      var f = T.f[nd], v = tr.X[i * d + f]; if (v !== v) v = M.fill[f];
      nd = v <= T.thr[nd] ? T.left[nd] : T.right[nd];
    }
  }
  for (nd = 0; nd < N; nd++) {
    if (M.cls) { var mx = 0; for (c = 0; c < K; c++) mx = Math.max(mx, cnt[nd * K + c]); R[nd] = nn[nd] - mx; }
    else R[nd] = nn[nd] ? s2[nd] - s1[nd] * s1[nd] / nn[nd] : 0;
  }
  // 验证样本的路径（剪枝之后，预测停在路径上第一个被剪成叶子的节点）
  var maxD = 0; for (nd = 0; nd < N; nd++) maxD = Math.max(maxD, T.dep[nd]);
  var L = maxD + 1, path = new Int32Array(va.n * L).fill(-1);
  for (i = 0; i < va.n; i++) {
    nd = 0; var q = 0;
    for (;;) { path[i * L + q++] = nd; if (T.f[nd] < 0) break; var f2 = T.f[nd], v2 = va.X[i * d + f2]; if (v2 !== v2) v2 = M.fill[f2]; nd = v2 <= T.thr[nd] ? T.left[nd] : T.right[nd]; }
  }
  function validErr(cut) {
    var err = 0;
    for (var ii = 0; ii < va.n; ii++) {
      var q2 = 0, x = path[ii * L];
      while (T.f[x] >= 0 && !cut[x]) x = path[ii * L + (++q2)];
      if (M.cls) { var b = 0; for (var cc = 1; cc < K; cc++) if (T.val[x * K + cc] > T.val[x * K + b]) b = cc; if (b !== va.y[ii]) err++; }
      else { var e = T.val[x] - va.y[ii]; err += e * e; }
    }
    return err / va.n;
  }
  // 最弱的一环：每轮自底向上算出每棵子树的叶子数与训练误差，剪掉 g(t) 最小的（并列的一起剪）
  var cut = new Uint8Array(N), leaves = new Float64Array(N), Rs = new Float64Array(N), reach = new Uint8Array(N), stages = [];
  for (;;) {
    for (nd = N - 1; nd >= 0; nd--) {            // 孩子的编号总比父亲大，所以倒着扫就是自底向上
      if (T.f[nd] < 0 || cut[nd]) { leaves[nd] = 1; Rs[nd] = R[nd]; }
      else { leaves[nd] = leaves[T.left[nd]] + leaves[T.right[nd]]; Rs[nd] = Rs[T.left[nd]] + Rs[T.right[nd]]; }
    }
    stages.push({ cut: Uint8Array.from(cut), leaves: leaves[0], trainErr: Rs[0] / n, validErr: validErr(cut) });
    if (leaves[0] <= 1) break;
    reach.fill(0); reach[0] = 1;
    var gmin = Infinity;
    for (nd = 0; nd < N; nd++) {
      if (!reach[nd] || T.f[nd] < 0 || cut[nd]) continue;
      reach[T.left[nd]] = 1; reach[T.right[nd]] = 1;
      var gt = (R[nd] - Rs[nd]) / (leaves[nd] - 1); if (gt < gmin) gmin = gt;
    }
    for (nd = 0; nd < N; nd++) if (reach[nd] && T.f[nd] >= 0 && !cut[nd] && (R[nd] - Rs[nd]) / (leaves[nd] - 1) <= gmin + 1e-12 * (1 + Math.abs(gmin))) cut[nd] = 1;
    if (ctx.timeLeft() < 0) { ctx.log("剪枝在时间预算内没走完。"); break; }
  }
  // 按叶子数从少到多画曲线；挑验证误差最小的，并列时取更小的树
  var best = null;
  stages.slice().reverse().forEach(function (s) {
    var tm = M.cls ? 1 - s.trainErr : s.trainErr, vm = M.cls ? 1 - s.validErr : s.validErr;
    ctx.report(s.leaves, { loss: s.trainErr, validLoss: s.validErr, trainMetric: tm, validMetric: vm });
    if (!best || s.validErr < best.validErr - 1e-12) best = s;
  });
  M.cut = best.cut;
  ctx.log("剪枝：" + stages[0].leaves + " 片叶子 → " + best.leaves + " 片（验证集误差 " + best.validErr.toPrecision(4) + "）");
}
function predict(M, X, n) {
  var K = M.K, d = M.d, T = M.T, out = new Float64Array(M.cls ? n * K : n), i, c;
  for (i = 0; i < n; i++) {
    var nd = leafOf(T, X, i * d, M.fill, M.cut, M.maxDep);
    if (M.cls) for (c = 0; c < K; c++) out[i * K + c] = T.val[nd * K + c]; else out[i] = T.val[nd];
  }
  return out;
}
function inspect(M) {
  return { tree: exportTree(M.T, 1023, M.cut), text: "一共 " + M.leaves + " 片叶子（" + M.nodes + " 个节点）。分裂带来的不纯度下降，按特征的占比：\n" + importanceText(M.imp, M.names, 15) };
}
`),
  docs: md`
## 模型
把特征空间切成若干个轴对齐的矩形 $R_1,\dots,R_J$，每块给一个常数：
$$\hat f(x)=\sum_{j=1}^J v_j\,\mathbf 1[x\in R_j].$$
回归时 $v_j$ 是块内 $y$ 的均值；分类时 $v_j$ 是块内各类的比例（每类加 $0.5$ 的平滑）。这些块由一棵二叉树给出：每个内部节点问一个问题"$x_f\le t$ 吗？"。

## 损失与训练
**贪心地长树（CART）.** 在节点 $t$ 上，对每个特征 $f$ 与每个候选切点 $s$，把样本分成 $t_L=\{x_f\le s\}$ 和 $t_R$，取使
$$\Delta(f,s)=n_t\,i(t)-n_{t_L}i(t_L)-n_{t_R}i(t_R)$$
最大的一刀。不纯度 $i$：回归用方差 $i(t)=\frac1{n_t}\sum_{x_i\in t}(y_i-\bar y_t)^2$（于是 $\Delta$ 就是平方误差的减少量）；分类用基尼指数 $i(t)=1-\sum_cp_{tc}^2$ 或熵 $i(t)=-\sum_cp_{tc}\log p_{tc}$。候选切点：取值少于"切点数上限"时是相邻取值的中点（与精确的 CART 相同），否则按分位数分箱；用直方图扫一遍就找到最好的切点。直到深度达到上限、或者再切就会有叶子少于"叶子最少样本数"为止。

**代价复杂度剪枝.** 对子树 $T\subseteq T_{\max}$ 定义 $R_\alpha(T)=R(T)+\alpha|\tilde T|$（$R$ 为训练误差：分类是分错的个数，回归是平方误差和；$|\tilde T|$ 为叶子数）。下面的定理 2 给出一串嵌套子树，在验证集上挑误差最小的。曲线的横轴是叶子数；关掉剪枝时横轴是深度。动画回放的是深度逐层增加的树。

## 参数怎么调
- 一般保持剪枝打开，把最大深度设大一点（8–12），让剪枝去决定复杂度。
- **叶子最少样本数**：越大，树越平滑；噪声大时调大。
- 熵和基尼几乎总是给出差不多的树；基尼稍快。
- 单棵树方差很大（换一批数据，树的结构可能完全不同），想要更好的预测请用随机森林或梯度提升；单棵树的价值在于**可读**——在"模型内部"里看它的结构。

## 复杂度
分箱 $O(nd\log n)$（只做一次）；长树时每一层的代价是 $O(n\cdot d)$（每个样本在每层只属于一个节点）加上直方图扫描 $O(\text{节点数}\cdot d\cdot B\cdot k)$。剪枝 $O(\text{节点数}^2)$。预测每个样本 $O(\text{深度})$。

## 什么时候好用、什么时候失效
边界是轴对齐的（棋盘格、阶梯函数）、特征尺度和单调变换无关紧要、混有类别型和数值型特征时，树很自然；它对特征的单调变换完全不变，不需要标准化，也能自动做交互。斜着的、光滑的边界要用很多台阶来逼近（两个半月、正弦），而且台阶的位置对数据很敏感。它不能外推：训练范围之外的预测是最边上那片叶子的常数。

## 理论
**定理 1（分裂不会让不纯度上升）.** 若 $i(p)$ 是类别分布 $p$ 的凹函数（基尼指数和熵都是），则对任意切分，$n_ti(t)\ge n_{t_L}i(t_L)+n_{t_R}i(t_R)$，即 $\Delta\ge0$。

*证明.* $p_t=\frac{n_{t_L}}{n_t}p_{t_L}+\frac{n_{t_R}}{n_t}p_{t_R}$ 是两个孩子分布的凸组合，由凹性（Jensen 不等式）$i(p_t)\ge\frac{n_{t_L}}{n_t}i(p_{t_L})+\frac{n_{t_R}}{n_t}i(p_{t_R})$。回归的方差情形由全方差公式得到：$n_t\cdot$ 总方差 $=$ 组内平方和 $+$ 组间平方和 $\ge$ 组内平方和。$\square$
（误分类率 $1-\max_cp_c$ 也是凹的，但它是分片线性的，很多有用的切分让它的下降量为 0，所以长树时不用它。）

**定理 2（最弱一环剪枝，Breiman 等 1984）.** 对每个 $\alpha\ge0$，存在唯一的、在包含关系下最小的子树 $T(\alpha)$ 使 $R_\alpha$ 最小；$\alpha_1<\alpha_2$ 时 $T(\alpha_2)\subseteq T(\alpha_1)$。并且整个族 $\{T(\alpha)\}$ 可以这样得到：从 $T_{\max}$ 出发，反复对当前树的每个内部节点 $t$ 计算
$$g(t)=\frac{R(t)-R(T_t)}{|\tilde T_t|-1}$$
（$T_t$ 是以 $t$ 为根的子树），把 $g$ 最小的节点（们）剪成叶子；被剪的那一步的 $g$ 就是下一个临界的 $\alpha$。

*证明梗概.* $R_\alpha$ 对子树可加：$R_\alpha(T)=\sum_{\text{叶子}}(R(\ell)+\alpha)$，所以"在 $t$ 处剪还是不剪"只取决于 $R(t)+\alpha$ 与 $R_\alpha(T_t)$ 的大小，可以自底向上递归地决定，并由此得到唯一的最小最优子树。$R(t)+\alpha\le R(T_t)+\alpha|\tilde T_t|$ 恰好等价于 $\alpha\ge g(t)$，所以随着 $\alpha$ 增大，最先被剪的是 $g$ 最小的节点；剪完之后对新树重复同样的论证。$\square$

**为什么贪心.** 求给定叶子数下训练误差最小的二叉树是 NP-难的（Hyafil–Rivest 1976 对最优决策树的结果），所以 CART 每一步只看一刀；它可能错过"单独看每一刀都没用、合起来很有用"的切分（异或数据的第一刀就是这样，见那个数据集的说明）。

参考：L. Breiman, J. Friedman, R. Olshen, C. Stone,《Classification and Regression Trees》（Wadsworth, 1984）；L. Hyafil, R. Rivest, *Inf. Process. Lett.* 5 (1976)；Hastie–Tibshirani–Friedman §9.2。
`
});

add({
  id: "forest", name: "随机森林", group: "trees", api: "supervised", kinds: ["classification", "regression"], families: ["tabular", "image"],
  summary: "很多棵在自助样本上长、每个节点只看随机几个特征的深树，取平均；袋外样本给出免费的验证误差。",
  params: [
    I("trees", "树的棵数", 100, 1, 1000, 1, "时间预算用完时会提前停下（已经长好的树照常使用）"),
    I("maxDepth", "最大深度", 16, 1, 40, 1),
    I("minLeaf", "叶子最少样本数", 1, 1, 100, 1),
    S("mtry", "每个节点比较的特征数", "auto", [["auto", "自动（分类 √d，回归 d/3）"], ["sqrt", "√d"], ["third", "d/3"], ["half", "d/2"], ["all", "全部 d（就是装袋法）"]]),
    N("sampleFrac", "自助样本的大小（占 n 的比例）", 1, 0.1, 1, 0.05, "有放回地抽这么多个样本来长每棵树"),
    S("crit", "分类的分裂准则", "gini", [["gini", "基尼指数"], ["entropy", "熵"]]),
    I("bins", "每个特征的切点数上限", 64, 8, 255, 1)
  ],
  code: code(SN.base, SN.tree, js`
/* ================= 随机森林 =================
 * 每棵树：有放回地抽 m 个样本（自助样本），长一棵深树；每个节点只在随机挑的 mtry 个特征里找切分。
 * 预测：所有树的平均（分类是各类比例的平均）。
 * 袋外（OOB）：一棵树没抽到的样本（约 37%）就是它的"验证集"，把每个样本在没见过它的那些树上的平均预测拿来算误差。 */
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, n = tr.n, d = tr.d, cls = data.kind === "classification", K = cls ? tr.k : 1, rng = lib.rng, i, c, t;
  var fill = colMeans(tr.X, n, d), bins = makeBins(tr.X, n, d, p.bins, fill);
  var mt = p.mtry === "auto" ? (cls ? "sqrt" : "third") : p.mtry;
  var mtry = mt === "sqrt" ? Math.round(Math.sqrt(d)) : mt === "third" ? Math.round(d / 3) : mt === "half" ? Math.round(d / 2) : d;
  mtry = Math.max(1, Math.min(d, mtry));
  var M = { trees: [], cls: cls, K: K, d: d, fill: fill, imp: new Float64Array(d), names: [], mtry: mtry, classes: tr.classes };
  for (var j = 0; j < d; j++) M.names.push(featName(tr, j));
  var oob = new Float64Array(n * K), oobN = new Int32Array(n), vs = new Float64Array(va.n * K), m = Math.max(1, Math.round(p.sampleFrac * n));
  var opt = { mode: cls ? "cls" : "gh", k: K, y: tr.y, g: cls ? null : tr.y, alpha: 0, maxDepth: p.maxDepth, minLeaf: p.minLeaf, mtry: mtry, rng: rng, crit: p.crit, imp: M.imp };
  for (t = 0; t < p.trees; t++) {
    if (t > 0 && ctx.timeLeft() < 0) { ctx.log("时间到了：长了 " + t + " 棵树（计划 " + p.trees + " 棵）。"); break; }
    var rows = new Int32Array(m), inBag = new Uint8Array(n);
    for (i = 0; i < m; i++) { var r = rng.int(n); rows[i] = r; inBag[r] = 1; }
    var T = growTree(bins, rows, opt);
    M.trees.push(T);
    for (i = 0; i < n; i++) if (!inBag[i]) { var nd = leafOfCode(T, bins.codes, i * d); for (c = 0; c < K; c++) oob[i * K + c] += T.val[nd * K + c]; oobN[i]++; }
    for (i = 0; i < va.n; i++) { var nv = leafOf(T, va.X, i * d, fill); for (c = 0; c < K; c++) vs[i * K + c] += T.val[nv * K + c]; }
    // 曲线：袋外误差与验证误差随树的棵数的变化
    var pt = {}, cntO = 0, nT = t + 1;
    if (cls) {
      var hit = 0, ll = 0, vh = 0, vl = 0;
      for (i = 0; i < n; i++) if (oobN[i]) { cntO++; var b = 0; for (c = 1; c < K; c++) if (oob[i * K + c] > oob[i * K + b]) b = c; if (b === tr.y[i]) hit++; ll -= Math.log(Math.max((oob[i * K + tr.y[i]] / oobN[i] + 1e-3) / (1 + 1e-3 * K), 1e-15)); }
      for (i = 0; i < va.n; i++) { var bv = 0; for (c = 1; c < K; c++) if (vs[i * K + c] > vs[i * K + bv]) bv = c; if (bv === va.y[i]) vh++; vl -= Math.log(Math.max((vs[i * K + va.y[i]] / nT + 1e-3) / (1 + 1e-3 * K), 1e-15)); }
      if (cntO) { pt.oobLoss = ll / cntO; pt.oobAcc = hit / cntO; }
      pt.validLoss = vl / va.n; pt.validMetric = vh / va.n;
    } else {
      var se = 0, vse = 0;
      for (i = 0; i < n; i++) if (oobN[i]) { cntO++; var e = oob[i] / oobN[i] - tr.y[i]; se += e * e; }
      for (i = 0; i < va.n; i++) { var ev = vs[i] / nT - va.y[i]; vse += ev * ev; }
      if (cntO) pt.oobLoss = se / cntO;
      pt.validLoss = vse / va.n; pt.validMetric = vse / va.n;
    }
    ctx.report(nT, pt);
    ctx.snapshot(nT, M);
  }
  M.size = 0; M.trees.forEach(function (T2) { M.size += T2.size * (K + 2); });
  M.oob = pt;
  return M;
}
function predict(M, X, n) {
  var K = M.K, d = M.d, B = M.trees.length, out = new Float64Array(M.cls ? n * K : n), i, c, t;
  for (i = 0; i < n; i++) {
    for (t = 0; t < B; t++) { var T = M.trees[t], nd = leafOf(T, X, i * d, M.fill); for (c = 0; c < K; c++) out[i * K + c] += T.val[nd * K + c]; }
    for (c = 0; c < K; c++) out[i * K + c] /= B;
    if (M.cls) for (c = 0; c < K; c++) out[i * K + c] = (out[i * K + c] + 1e-3) / (1 + 1e-3 * K);
  }
  return out;
}
function inspect(M) {
  var o = M.oob || {}, txt = M.trees.length + " 棵树，每个节点比较 " + M.mtry + " 个特征。";
  if (o.oobLoss != null) txt += "\n袋外" + (M.cls ? "准确率 " + (100 * o.oobAcc).toFixed(1) + "%、对数损失 " + o.oobLoss.toFixed(4) : "均方误差 " + o.oobLoss.toPrecision(4)) + "。";
  return { tree: exportTree(M.trees[0], 255), text: txt + "\n（“模型内部”里画的是第一棵树。）不纯度下降按特征的占比（所有树合计）：\n" + importanceText(M.imp, M.names, 15) };
}
`),
  docs: md`
## 模型
$B$ 棵回归树或分类树的平均：
$$\hat f(x)=\frac1B\sum_{b=1}^BT_b(x;\Theta_b),$$
$\Theta_b$ 代表第 $b$ 棵树的随机性：它用的自助样本（有放回地抽 $m$ 个），以及每个节点上随机挑出的 $m_{\text{try}}$ 个候选特征。分类时平均的是叶子里各类的比例（最后加 $0.001$ 的平滑）。

## 损失与训练
每棵树按 CART 的准则（基尼 / 熵 / 方差）贪心地长到很深（默认叶子里至少 1 个样本），**不剪枝**——单棵树的方差很大、偏差很小，平均负责把方差降下来。树与树之间互不依赖，所以可以一直加到时间预算用完。
**袋外估计**：样本 $i$ 不在第 $b$ 棵树的自助样本里的概率是 $(1-\frac1n)^m\approx e^{-m/n}$（$m=n$ 时约 $0.368$）。把每个样本在"没见过它的那些树"上的平均预测拿来算误差，就是袋外误差——几乎免费的交叉验证。曲线的横轴是树的棵数，画出袋外与验证集的损失。

## 参数怎么调
- **棵数**：越多越好（不会过拟合，只是边际收益递减）；曲线走平就够了。
- **$m_{\text{try}}$**：最重要的参数。小一些，树之间更不相关、平均更有效，但每棵树更弱。有大量无关特征时调大，否则选不到有用的特征。
- **叶子最少样本数 / 深度**：噪声很大的回归问题上适当调大，可以降低方差。
- 不需要标准化特征。

## 复杂度
长一棵树 $O(m_{\text{try}}\cdot n\log n)$ 左右（每层 $O(m_{\text{try}}n)$，深度约 $\log n$），$B$ 棵乘以 $B$。预测每个样本 $O(B\cdot\text{深度})$。

## 什么时候好用、什么时候失效
表格数据上开箱即用、几乎不用调参就能有很好的成绩：能处理非线性、交互、混合类型的特征，对单调变换和离群的特征值不敏感。弱点：不能外推（和单棵树一样）；对光滑的、斜的结构（比如 $y$ 是特征的线性组合）需要很多台阶，比线性模型差；概率往往不够极端（校准偏保守）；模型很大，预测比线性模型慢得多。

## 理论
**定理 1（平均的方差）.** 设 $Z_1,\dots,Z_B$ 同分布，$\operatorname{Var}Z_b=\sigma^2$，两两相关系数都是 $\rho$。则
$$\operatorname{Var}\Big(\frac1B\sum_{b=1}^BZ_b\Big)=\rho\sigma^2+\frac{1-\rho}B\sigma^2 .$$

*证明.* $\operatorname{Var}(\sum Z_b)=\sum_b\operatorname{Var}Z_b+\sum_{b\ne b'}\operatorname{Cov}(Z_b,Z_{b'})=B\sigma^2+B(B-1)\rho\sigma^2$，除以 $B^2$ 即得。$\square$
在固定的 $x$ 处，把 $Z_b=T_b(x)$（给定训练集，对 $\Theta_b$ 的随机性）代入：随着 $B\to\infty$，方差降到 $\rho\sigma^2$ 而降不到 0。随机挑选特征（减小 $m_{\text{try}}$）的作用正是降低树与树之间的相关 $\rho$，代价是 $\sigma^2$ 和偏差可能略升。

**定理 2（Breiman 2001 的上界）.** 对分类森林定义间隔函数 $mg(X,Y)=P_\Theta(h(X;\Theta)=Y)-\max_{j\ne Y}P_\Theta(h(X;\Theta)=j)$，强度 $s=\mathbb E_{X,Y}\,mg(X,Y)$，$\bar\rho$ 为树之间（在间隔意义下的）平均相关。若 $s>0$，则泛化误差满足
$$PE^*\le\frac{\bar\rho\,(1-s^2)}{s^2}.$$
它定性地说明：要单棵树强（$s$ 大）而树与树之间不相关（$\bar\rho$ 小）。这个界通常很松，不能用来预测数值。

**袋外样本的比例.** $P(i\notin\text{自助样本})=(1-1/n)^m$；$m=n$ 时 $\to e^{-1}$，所以每个样本平均被约 $0.37B$ 棵树当作"没见过的"，袋外误差的方差与用 $0.37B$ 棵树的森林在独立验证集上的误差相当。

**一致性.** 随机森林的理论比它的实践落后：Scornet、Biau、Vert（2015）在可加回归模型下证明了 Breiman 原始算法（含自助抽样与 CART 分裂）的 $L^2$ 一致性；一般情形仍是开放问题。

参考：L. Breiman, Random forests, *Machine Learning* 45 (2001)；E. Scornet, G. Biau, J.-P. Vert, Consistency of random forests, *Ann. Statist.* 43 (2015)；Hastie–Tibshirani–Friedman 第 15 章。
`
});

add({
  id: "gbm", name: "梯度提升树", group: "trees", api: "supervised", kinds: ["classification", "regression"], families: ["tabular", "image"],
  summary: "一棵接一棵地用小树去拟合当前损失的负梯度（牛顿步），缩小步长加早停；分类用 softmax 偏差。",
  params: [
    I("rounds", "轮数（树的棵数）", 300, 1, 3000, 1, "多分类时每一轮每个类别各长一棵"),
    N("lr", "学习率 ν", 0.1, 0.005, 1, 0.005, "每棵树的贡献乘以 ν：小一些通常更好，但要更多轮"),
    I("maxDepth", "每棵树的深度", 3, 1, 10, 1),
    I("minLeaf", "叶子最少样本数", 10, 1, 200, 1),
    N("subsample", "每轮抽样比例", 0.8, 0.2, 1, 0.05, "每轮只用这么多训练样本（不放回）：随机梯度提升"),
    N("lambda", "叶子值的 L2 惩罚 λ", 1, 0, 20, 0.1, "叶子值 = −G/(H + λ)"),
    I("patience", "早停的耐心（轮）", 50, 0, 1000, 1, "验证损失这么多轮没有变好就停，并退回最好的那一轮；0 = 不早停"),
    I("bins", "每个特征的切点数上限", 64, 8, 255, 1)
  ],
  code: code(SN.base, SN.tree, js`
/* ================= 梯度提升树 =================
 * F_0 = 常数；第 m 轮：算出每个样本上损失 ℓ(y, F) 对 F 的一阶导 g 与二阶导 h，
 * 长一棵树，叶子值取牛顿步 w = −Σg/(Σh + λ)，分裂按 G²/(H + λ) 的增加量；F ← F + ν·树。
 * 回归：平方损失，g = F − y，h = 1。两类：逻辑损失，p = σ(F)，g = p − y，h = p(1 − p)。
 * 多类：softmax 交叉熵，每类一个 F_c，g_c = p_c − 1[y = c]，h_c = p_c(1 − p_c)（对角近似）。
 * （代码里传给 growTree 的是负梯度 −g，所以叶子值写成 ΣG/(ΣH + λ)。） */
function sigm(z) { return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)); }
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, n = tr.n, d = tr.d, cls = data.kind === "classification", K = cls ? tr.k : 0, rng = lib.rng, i, c;
  var C = cls ? (K === 2 ? 1 : K) : 1;                // 每轮长几棵树
  var fill = colMeans(tr.X, n, d), bins = makeBins(tr.X, n, d, p.bins, fill);
  var M = { cls: cls, K: K, C: C, d: d, fill: fill, f0: new Float64Array(C), rounds: [], imp: new Float64Array(d), names: [], lr: p.lr, classes: tr.classes };
  for (var j = 0; j < d; j++) M.names.push(featName(tr, j));
  // 初值：回归取均值；分类取对数频率（两类是对数几率）
  if (!cls) M.f0[0] = meanOf(tr.y, n);
  else {
    var cnt = new Float64Array(K); for (i = 0; i < n; i++) cnt[tr.y[i]]++;
    if (C === 1) M.f0[0] = Math.log((cnt[1] + 0.5) / (cnt[0] + 0.5));
    else for (c = 0; c < K; c++) M.f0[c] = Math.log((cnt[c] + 0.5) / (n + 0.5 * K));
  }
  var F = new Float64Array(n * C), Fv = new Float64Array(va.n * C), G = new Float64Array(n), H = new Float64Array(n), P = new Float64Array(n * Math.max(C, K || 1));
  for (i = 0; i < n; i++) for (c = 0; c < C; c++) F[i * C + c] = M.f0[c];
  for (i = 0; i < va.n; i++) for (c = 0; c < C; c++) Fv[i * C + c] = M.f0[c];
  var opt = { mode: "gh", g: G, h: H, lambda: p.lambda, maxDepth: p.maxDepth, minLeaf: p.minLeaf, scale: p.lr, imp: M.imp };
  var best = { loss: Infinity, round: 0 }, all = new Int32Array(n), m = Math.max(1, Math.round(p.subsample * n));
  for (i = 0; i < n; i++) all[i] = i;
  for (var r = 0; r < p.rounds; r++) {
    if (r > 0 && ctx.timeLeft() < 0) { ctx.log("时间到了：提升了 " + r + " 轮。"); break; }
    probs(M, F, n, P);
    // 这一轮用的样本：不放回地抽 m 个（部分洗牌）
    for (i = 0; i < m; i++) { var q = i + rng.int(n - i), t = all[i]; all[i] = all[q]; all[q] = t; }
    var rows = all.slice(0, m), trees = [];
    for (c = 0; c < C; c++) {
      for (i = 0; i < n; i++) {
        if (!cls) { G[i] = tr.y[i] - F[i]; H[i] = 1; }
        else if (C === 1) { var p1 = P[i]; G[i] = (tr.y[i] === 1 ? 1 : 0) - p1; H[i] = Math.max(p1 * (1 - p1), 1e-6); }
        else { var pc = P[i * K + c]; G[i] = (tr.y[i] === c ? 1 : 0) - pc; H[i] = Math.max(pc * (1 - pc), 1e-6); }
      }
      var T = growTree(bins, rows, opt);
      trees.push(T);
      for (i = 0; i < n; i++) F[i * C + c] += T.val[leafOfCode(T, bins.codes, i * d)];
      for (i = 0; i < va.n; i++) Fv[i * C + c] += T.val[leafOf(T, va.X, i * d, fill)];
    }
    M.rounds.push(trees);
    var e1 = lossOf(M, F, tr.y, n), e2 = lossOf(M, Fv, va.y, va.n);
    ctx.report(r + 1, { loss: e1.loss, validLoss: e2.loss, trainMetric: e1.met, validMetric: e2.met });
    ctx.snapshot(r + 1, M);
    if (e2.loss < best.loss - 1e-12) best = { loss: e2.loss, round: r + 1 };
    else if (p.patience > 0 && r + 1 - best.round >= p.patience) { ctx.log("早停：验证损失在第 " + best.round + " 轮之后 " + p.patience + " 轮没有变好。"); break; }
  }
  if (p.patience > 0 && best.round > 0 && best.round < M.rounds.length) M.rounds = M.rounds.slice(0, best.round);
  M.best = best.round;
  M.size = C; M.rounds.forEach(function (ts) { ts.forEach(function (T2) { M.size += T2.size * 3; }); });
  return M;
}
/* F（每行 C 个得分）→ 概率；回归时什么也不做 */
function probs(M, F, n, P) {
  var i, c, K = M.K;
  if (!M.cls) return P;
  if (M.C === 1) { for (i = 0; i < n; i++) P[i] = sigm(F[i]); return P; }
  for (i = 0; i < n * K; i++) P[i] = F[i];
  return softmaxRows(P, n, K);
}
function lossOf(M, F, y, n) {
  var i, s = 0, hit = 0;
  if (!M.cls) { for (i = 0; i < n; i++) { var e = F[i] - y[i]; s += e * e; } return { loss: s / n, met: s / n }; }
  if (M.C === 1) { for (i = 0; i < n; i++) { var p1 = sigm(F[i]); s -= Math.log(Math.max(y[i] === 1 ? p1 : 1 - p1, 1e-15)); if ((p1 > 0.5 ? 1 : 0) === y[i]) hit++; } return { loss: s / n, met: hit / n }; }
  var P = softmaxRows(Float64Array.from(F.subarray(0, n * M.K)), n, M.K);
  return { loss: ceOf(P, y, n, M.K), met: accOf(P, y, n, M.K) };
}
function predict(M, X, n) {
  var C = M.C, d = M.d, F = new Float64Array(n * C), i, c, r;
  for (i = 0; i < n; i++) {
    for (c = 0; c < C; c++) F[i * C + c] = M.f0[c];
    for (r = 0; r < M.rounds.length; r++) { var ts = M.rounds[r]; for (c = 0; c < C; c++) F[i * C + c] += ts[c].val[leafOf(ts[c], X, i * d, M.fill)]; }
  }
  if (!M.cls) return F;
  if (C === 1) { var out = new Float64Array(n * 2); for (i = 0; i < n; i++) { var p1 = sigm(F[i]); out[2 * i] = 1 - p1; out[2 * i + 1] = p1; } return out; }
  return softmaxRows(F, n, M.K);
}
function inspect(M) {
  var txt = M.rounds.length + " 轮" + (M.C > 1 ? "（每轮 " + M.C + " 棵树，每类一棵）" : "") + "，学习率 ν = " + M.lr + "。" + (M.best ? "验证损失最好的是第 " + M.best + " 轮。" : "");
  return { tree: M.rounds.length ? exportTree(M.rounds[0][0], 255) : null, text: txt + "\n（“模型内部”里画的是第一棵树；叶子值已经乘了 ν" + (M.cls ? "，单位是对数几率" : "") + "。）\n分裂增益按特征的占比：\n" + importanceText(M.imp, M.names, 15) };
}
`),
  docs: md`
## 模型
加法模型 $F(x)=F_0+\nu\sum_{m=1}^Mh_m(x)$，每个 $h_m$ 是一棵小回归树（深度 1–6），$\nu\in(0,1]$ 是学习率（收缩）。输出：回归直接用 $F$；两类 $P(y=1\mid x)=\sigma(F)$；$k$ 类每类一个 $F_c$，$P(y=c\mid x)=\operatorname{softmax}(F)_c$。

## 损失与训练
平方损失 $\ell=\frac12(y-F)^2$、逻辑损失、softmax 交叉熵。第 $m$ 轮在当前的 $F$ 处对每个样本算一阶、二阶导
$$g_i=\frac{\partial\ell(y_i,F)}{\partial F}\Big|_{F=F_{m-1}(x_i)},\qquad h_i=\frac{\partial^2\ell}{\partial F^2}\Big|_{F_{m-1}(x_i)}$$
（回归：$g=F-y$，$h=1$；两类：$g=p-y$，$h=p(1-p)$；多类对每个类别用对角近似 $h_c=p_c(1-p_c)$）。然后长一棵树，叶子 $j$ 的值取牛顿步 $w_j=-G_j/(H_j+\lambda)$，分裂按增益 $\frac{G_L^2}{H_L+\lambda}+\frac{G_R^2}{H_R+\lambda}-\frac{G^2}{H+\lambda}$ 选（$G_j=\sum_{i\in j}g_i$）。每轮只用随机抽的一部分样本（随机梯度提升）。验证集只用于早停：损失 patience 轮不再下降就停，并退回最好的那一轮。

## 参数怎么调
- **学习率与轮数**是一对：$\nu$ 减半，大约需要两倍的轮数，但验证误差通常更低。常用 $\nu=0.05\sim0.1$ 配合早停。
- **深度**：树的深度决定能表示的交互阶数（深度 $J$ 的树最多表示 $J$ 个特征的交互）。3–6 一般足够。
- **λ 与叶子最少样本数**：防止叶子值被少数样本决定；分类问题里 $h$ 接近 0 的样本（已经很有把握的）会让 $-G/H$ 很大，$\lambda$ 在这里很重要。
- **抽样比例** 0.5–0.8 往往比 1 好：既加速，又是一种正则化。

## 复杂度
每轮（每类）一棵树：直方图法 $O(nd)$ 每层，深度 $J$ 共 $O(ndJ)$。$M$ 轮共 $O(MndJ)$（多类再乘 $k$）。预测每个样本 $O(MJ)$。

## 什么时候好用、什么时候失效
在中等规模的表格数据上，它常常是精度最高的方法（XGBoost、LightGBM 的核心就是这里的算法）。它对特征尺度不敏感，能自动处理非线性与交互。弱点：参数比随机森林多、需要早停；对标签噪声比森林敏感（会去拟合噪声的梯度）；和所有树模型一样不能外推、对光滑的斜边界需要很多棵树。

## 理论
**梯度提升是函数空间的梯度下降（Friedman 2001）.** 经验风险 $\hat R(F)=\frac1n\sum_i\ell(y_i,F(x_i))$ 只依赖 $F$ 在训练点上的取值 $\mathbf F=(F(x_1),\dots,F(x_n))$，其梯度是 $(g_1,\dots,g_n)/n$。最速下降会令 $\mathbf F\leftarrow\mathbf F-\nu\,\mathbf g$，但这样得到的只是 $n$ 个数，不是一个能在新 $x$ 上求值的函数；于是用一棵树去拟合 $-\mathbf g$（最小二乘），把这一步"投影"到树的函数类上，再沿它走一步。平方损失下 $-g_i=y_i-F(x_i)$ 正是残差，所以提升就是"反复拟合残差"。

**定理（叶子值与分裂增益）.** 固定树的结构 $q:\mathcal X\to\{1,\dots,J\}$，把每个样本的损失在 $F_{m-1}$ 处展开到二阶，加上惩罚 $\frac\lambda2\sum_jw_j^2$：
$$\tilde L(w)=\sum_i\Big[g_iw_{q(x_i)}+\tfrac12h_iw_{q(x_i)}^2\Big]+\tfrac\lambda2\sum_jw_j^2=\sum_j\Big[G_jw_j+\tfrac12(H_j+\lambda)w_j^2\Big].$$
若 $H_j+\lambda>0$，则最优 $w_j^*=-G_j/(H_j+\lambda)$，最优值 $\tilde L^*=-\frac12\sum_jG_j^2/(H_j+\lambda)$。因此把一片叶子分成左右两片，二阶近似下的目标下降 $\frac12\big[\frac{G_L^2}{H_L+\lambda}+\frac{G_R^2}{H_R+\lambda}-\frac{G^2}{H+\lambda}\big]$。

*证明.* $\tilde L$ 对各 $w_j$ 可分，每一项是开口向上的一元二次函数，顶点在 $-G_j/(H_j+\lambda)$，值为 $-G_j^2/(2(H_j+\lambda))$。分裂前后只有被分的那片叶子的贡献变了，相减即得。$\square$
平方损失时 $h\equiv1$、$\lambda=0$，增益化为 $\frac{S_L^2}{n_L}+\frac{S_R^2}{n_R}-\frac{S^2}{n}$（$S$ 为残差之和），正是 CART 的方差减少量。

**收缩与早停是正则化.** Zhang–Yu（2005）证明：在一定条件下，带早停的提升（以样本数决定的轮数停止）是相合的；而不早停时，提升最终会插值训练数据。实践中 $\nu$ 小、配合按验证集早停，几乎总是比 $\nu=1$ 好（Friedman 2001 的经验结论）。

参考：J. H. Friedman, Greedy function approximation: a gradient boosting machine, *Ann. Statist.* 29 (2001)；J. Friedman, Stochastic gradient boosting, *CSDA* 38 (2002)；T. Chen, C. Guestrin, XGBoost, *KDD* (2016)；T. Zhang, B. Yu, Boosting with early stopping, *Ann. Statist.* 33 (2005)。
`
});

/* ================================================================== *
 *  核方法
 * ================================================================== */
SN.kernel = js`
/* ---------- 平移不变核（输入已标准化） ----------
 * r = ‖x − x'‖：RBF k = exp(−r²/2ℓ²)；Matérn-ν：ν = 3/2 时 (1 + √3 r/ℓ)e^{−√3 r/ℓ}，ν = 5/2 时 (1 + √5 r/ℓ + 5r²/3ℓ²)e^{−√5 r/ℓ}。 */
function kval(type, r2, ell) {
  if (type === "matern52") { var s5 = Math.sqrt(5 * r2) / ell; return (1 + s5 + s5 * s5 / 3) * Math.exp(-s5); }
  if (type === "matern32") { var s3 = Math.sqrt(3 * r2) / ell; return (1 + s3) * Math.exp(-s3); }
  return Math.exp(-0.5 * r2 / (ell * ell));
}
/* 核矩阵 K[i, j] = k(A_i, B_j)，A 是 na×d、B 是 nb×d（按行） */
function kmat(type, A, na, B, nb, d, ell) {
  var K = new Float64Array(na * nb), i, j, q;
  for (i = 0; i < na; i++) for (j = 0; j < nb; j++) {
    var s = 0; for (q = 0; q < d; q++) { var e = A[i * d + q] - B[j * d + q]; s += e * e; }
    K[i * nb + j] = kval(type, s, ell);
  }
  return K;
}
`;
SN.rff = js`
/* ---------- 随机傅里叶特征（Rahimi–Recht 2007） ----------
 * 由 Bochner 定理，平移不变的正定核 k(x − x') = E_ω[cos(ωᵀ(x − x'))]，ω 服从核的谱密度。
 * 取 z(x) = √(2/D)·cos(Wx + b)，W 的每一行 ~ 谱密度、b ~ U[0, 2π)，则 z(x)ᵀz(x') ≈ k(x, x')：
 * 核方法就变成了 D 维特征上的线性方法。RBF 核的谱密度是 N(0, I/ℓ²)；拉普拉斯核 exp(−‖δ‖₁/ℓ) 的谱密度是每一维独立的柯西分布（尺度 1/ℓ）。
 * ℓ 取"中位数启发"：标准化后两两距离的中位数乘以一个倍数。 */
function medianDist(Z, n, d, rng) {
  var ds = [], m = Math.min(500, n * (n - 1) / 2);
  for (var t = 0; t < m; t++) {
    var i = rng.int(n), j = rng.int(n); if (i === j) continue;
    var s = 0; for (var q = 0; q < d; q++) { var e = Z[i * d + q] - Z[j * d + q]; s += e * e; }
    ds.push(Math.sqrt(s));
  }
  ds.sort(function (a, b) { return a - b; });
  return ds.length ? ds[ds.length >> 1] || 1 : 1;
}
function makeRff(d, D, ell, kind, rng) {
  var W = new Float64Array(D * d), b = new Float64Array(D), i;
  for (i = 0; i < D * d; i++) W[i] = kind === "laplace" ? Math.tan(Math.PI * (rng.u() - 0.5)) / ell : rng.normal() / ell;
  for (i = 0; i < D; i++) b[i] = 2 * Math.PI * rng.u();
  return { W: W, b: b, d: d, D: D, ell: ell, kind: kind };
}
function rffFeatures(F, Z, n) {
  var d = F.d, D = F.D, out = new Float64Array(n * D), c = Math.sqrt(2 / D), i, j, q;
  for (i = 0; i < n; i++) for (j = 0; j < D; j++) {
    var s = F.b[j]; for (q = 0; q < d; q++) s += F.W[j * d + q] * Z[i * d + q];
    out[i * D + j] = c * Math.cos(s);
  }
  return out;
}
`;
add({
  id: "gp", name: "高斯过程回归（核岭回归）", group: "kernel", api: "supervised", kinds: ["regression"], families: ["tabular"],
  summary: "函数的先验是高斯过程，后验均值就是核岭回归；按边际似然选长度尺度和噪声，样本多时用 Nyström 近似。",
  params: [
    S("kernel", "核", "rbf", [["rbf", "RBF（平方指数）"], ["matern52", "Matérn 5/2"], ["matern32", "Matérn 3/2"]]),
    B("ml", "按边际似然选超参数", true, "在一个子样本上网格搜索长度尺度 ℓ 与噪声比 τ，使对数边际似然最大"),
    N("ell", "长度尺度 ℓ（标准化单位）", 1, 0.02, 20, 0.01, "不按边际似然选时使用"),
    N("lognoise", "噪声比 log₁₀ τ", -2, -6, 1, 0.1, "τ = 噪声方差 / 信号方差；不按边际似然选时使用"),
    I("nmax", "精确解最多用的训练点", 1000, 100, 2500, 50, "超过时改用 Nyström 近似（内存 O(n²)、时间 O(n³)）"),
    I("m", "Nyström 的中心点数", 400, 50, 1500, 10)
  ],
  code: code(SN.base, SN.scaler, SN.chol, SN.kernel, js`
/* ================= 高斯过程回归 =================
 * 先验 f ~ GP(0, s²k)，观测 y = f(x) + ε，ε ~ N(0, s²τ)。后验均值 m(x) = k(x, X)(K + τI)⁻¹y，它也是核岭回归的解。
 * 输入、输出都先标准化。s² 有闭式的最大似然 ŝ² = yᵀ(K + τI)⁻¹y / n，所以只需搜索 ℓ 和 τ。
 * 训练点多于 nmax 时用 Nyström（"回归子集"）近似：f(x) = Σ_j w_j k(x, c_j)，c_j 是随机挑的 m 个中心。 */
function logML(R, y, m, tau) {      // 剖面对数边际似然（s² 已经代入最优值），除以 m
  var A = Float64Array.from(R), j, i;
  for (j = 0; j < m; j++) A[j * m + j] += tau;
  var L = cholFactor(A, m), a = cholSolve(L, y, m), q = 0, ld = 0;
  for (i = 0; i < m; i++) { q += y[i] * a[i]; ld += 2 * Math.log(L[i * m + i]); }
  var s2 = Math.max(q / m, 1e-300);
  return { v: -0.5 * (m * Math.log(s2) + ld + m + m * Math.log(2 * Math.PI)) / m, s2: s2 };
}
function fit(data, p, lib, ctx) {
  var tr = data.train, n = tr.n, d = tr.d, i, j, rng = lib.rng;
  var sc = fitScaler(tr.X, n, d), Z = applyScaler(sc, tr.X, n), ym = meanOf(tr.y, n), ys = 0;
  for (i = 0; i < n; i++) ys += (tr.y[i] - ym) * (tr.y[i] - ym);
  ys = Math.sqrt(ys / n) || 1;
  var yz = new Float64Array(n); for (i = 0; i < n; i++) yz[i] = (tr.y[i] - ym) / ys;
  var M = { sc: sc, d: d, ym: ym, ys: ys, kernel: p.kernel, ell: p.ell, tau: Math.pow(10, p.lognoise), lml: NaN };
  function pick(cnt) { var a = []; for (var q = 0; q < n; q++) a.push(q); for (q = 0; q < cnt; q++) { var r = q + rng.int(n - q), t = a[q]; a[q] = a[r]; a[r] = t; } return a.slice(0, cnt); }
  if (p.ml) {
    var sub = pick(Math.min(n, 300)), m = sub.length, Zs = new Float64Array(m * d), ysub = new Float64Array(m);
    for (i = 0; i < m; i++) { for (j = 0; j < d; j++) Zs[i * d + j] = Z[sub[i] * d + j]; ysub[i] = yz[sub[i]]; }
    var ells = [0.05, 0.1, 0.18, 0.3, 0.5, 0.8, 1.3, 2.2, 3.5].map(function (g) { return g * Math.sqrt(d); }), taus = [1e-4, 1e-3, 1e-2, 0.03, 0.1, 0.3, 1], best = null;
    for (var a = 0; a < ells.length; a++) {
      var R = kmat(p.kernel, Zs, m, Zs, m, d, ells[a]), bestHere = -Infinity;
      for (var b = 0; b < taus.length; b++) {
        var r = logML(R, ysub, m, taus[b]);
        if (r.v > bestHere) bestHere = r.v;
        if (!best || r.v > best.v) best = { v: r.v, ell: ells[a], tau: taus[b] };
      }
      ctx.report(a, { negLogML: -bestHere, logEll: Math.log(ells[a]) / Math.LN10 });
      if (ctx.timeLeft() < 0) { ctx.log("超参数搜索在时间预算内没走完。"); break; }
    }
    M.ell = best.ell; M.tau = best.tau; M.lml = best.v;
    ctx.log("边际似然选出 ℓ = " + M.ell.toPrecision(3) + "，τ = " + M.tau);
  }
  if (n <= p.nmax) {
    var K = kmat(M.kernel, Z, n, Z, n, d, M.ell);
    for (i = 0; i < n; i++) K[i * n + i] += M.tau;
    M.C = Z; M.nc = n; M.alpha = cholSolve(cholFactor(K, n), yz, n); M.method = "精确解（" + n + " 个训练点）";
  } else {
    var mc = Math.min(p.m, n), ci = pick(mc), Cz = new Float64Array(mc * d);
    for (i = 0; i < mc; i++) for (j = 0; j < d; j++) Cz[i * d + j] = Z[ci[i] * d + j];
    var Knm = kmat(M.kernel, Z, n, Cz, mc, d, M.ell), A = gramT(Knm, n, mc), Kmm = kmat(M.kernel, Cz, mc, Cz, mc, d, M.ell), rhs = new Float64Array(mc);
    for (i = 0; i < mc * mc; i++) A[i] += M.tau * Kmm[i];
    for (i = 0; i < mc; i++) A[i * mc + i] += 1e-8 * mc;
    for (i = 0; i < n; i++) for (j = 0; j < mc; j++) rhs[j] += Knm[i * mc + j] * yz[i];
    M.C = Cz; M.nc = mc; M.alpha = cholSolve(cholFactor(A, mc), rhs, mc); M.method = "Nyström 近似（" + mc + " 个中心，" + n + " 个训练点）";
  }
  M.size = M.nc * (d + 1) + 2;
  return M;
}
function predict(M, X, n) {
  var Z = applyScaler(M.sc, X, n), out = new Float64Array(n), B = 512;
  for (var s = 0; s < n; s += B) {                 // 分块算，免得一次造出 n × 中心数 的大矩阵
    var e = Math.min(n, s + B), Kx = kmat(M.kernel, Z.subarray(s * M.d, e * M.d), e - s, M.C, M.nc, M.d, M.ell);
    for (var i = 0; i < e - s; i++) { var v = 0; for (var j = 0; j < M.nc; j++) v += Kx[i * M.nc + j] * M.alpha[j]; out[s + i] = M.ym + M.ys * v; }
  }
  return out;
}
function inspect(M) {
  return { text: M.method + "，核 " + M.kernel + "。\n长度尺度 ℓ = " + M.ell.toPrecision(3) + "（标准化单位），噪声比 τ = " + M.tau + "（噪声标准差约为 y 的标准差的 " + Math.sqrt(M.tau / (1 + M.tau)).toFixed(3) + " 倍）" +
    (isFinite(M.lml) ? "\n子样本上的对数边际似然（每个点）" + M.lml.toFixed(4) + "。" : "") };
}
`),
  docs: md`
## 模型
把未知函数看成随机过程：先验 $f\sim\mathcal{GP}(0,s^2k)$，即任意有限个点上的取值联合正态，$\operatorname{Cov}(f(x),f(x'))=s^2k(x,x')$。观测 $y_i=f(x_i)+\varepsilon_i$，$\varepsilon_i\sim N(0,s^2\tau)$ 独立。核取平移不变的 RBF $k(x,x')=e^{-\lVert x-x'\rVert^2/2\ell^2}$ 或 Matérn 核（输入先标准化，$y$ 也先标准化）。预测用后验均值
$$m(x)=k(x,X)\,(K+\tau I)^{-1}y,\qquad K_{ij}=k(x_i,x_j).$$

## 损失与训练
没有迭代优化：给定超参数，解一个 $n\times n$ 的正定方程组（Cholesky）。超参数 $(\ell,\tau)$ 在 300 个点的子样本上按**对数边际似然**网格搜索（$\ell$ 取 $\sqrt d$ 乘以 0.05–3.5，$\tau$ 取 $10^{-4}$–1），幅度 $s^2$ 用闭式的最大似然代入。曲线（如果打开）画的是每个 $\ell$ 上最好的负对数边际似然。训练点多于 nmax 时用 Nyström 近似。

## 参数怎么调
- 通常让边际似然去选 $\ell$ 和 $\tau$。手动时：$\ell$ 小，曲线扭得厉害（方差大）；$\ell$ 大，近似线性（偏差大）；$\tau$ 是"相信数据的程度"的倒数。
- Matérn 3/2 的样本路径只有一阶可导，比 RBF 更粗糙，更适合有拐点的函数。
- 维数高时，各向同性的核（所有特征共用一个 $\ell$）往往不合适：无关特征会稀释距离。

## 复杂度
精确解：时间 $O(n^3)$、内存 $O(n^2)$；$n=1000$ 时约一秒。Nyström（$m$ 个中心）：时间 $O(nm^2)$、内存 $O(nm)$。预测每个样本 $O(nd)$ 或 $O(md)$。

## 什么时候好用、什么时候失效
样本不多（几百到几千）、函数光滑、维数低时，GP 往往是最好的回归方法之一，还能给出不确定性（这里没有画出来）。$n$ 很大时必须近似；函数在不同区域的光滑程度不同（平稳核的假设不成立）、或者有跳变时，它会在跳变附近振荡、在平坦处过拟合；高维时退化成"按距离加权的平均"，不如树模型。

## 理论
**定理 1（后验分布）.** 在上面的模型里，给定数据，$f(x_*)$ 的后验是正态分布：
$$f(x_*)\mid y\sim N\Big(k_*^\top(K+\tau I)^{-1}y,\ \ s^2\big[k(x_*,x_*)-k_*^\top(K+\tau I)^{-1}k_*\big]\Big),\qquad k_*=k(X,x_*).$$

*证明.* $(y,f(x_*))$ 联合正态，均值为 0，$\operatorname{Cov}(y)=s^2(K+\tau I)$，$\operatorname{Cov}(y,f(x_*))=s^2k_*$，$\operatorname{Var}f(x_*)=s^2k(x_*,x_*)$。对联合正态分布 $\binom ab\sim N\big(0,\begin{pmatrix}A&C\\C^\top&B\end{pmatrix}\big)$，有 $b\mid a\sim N(C^\top A^{-1}a,\ B-C^\top A^{-1}C)$（舒尔补），代入即得。$\square$

**定理 2（与核岭回归等价；表示定理）.** 设 $\mathcal H_k$ 是 $k$ 的再生核希尔伯特空间。则
$$\min_{f\in\mathcal H_k}\ \sum_{i=1}^n(y_i-f(x_i))^2+\tau\lVert f\rVert_{\mathcal H_k}^2$$
的唯一解是 $\hat f(x)=\sum_i\alpha_ik(x,x_i)$，$\alpha=(K+\tau I)^{-1}y$，恰好等于定理 1 的后验均值。

*证明.* 把任一 $f\in\mathcal H_k$ 分解为 $f=f_\parallel+f_\perp$，$f_\parallel\in\operatorname{span}\{k(\cdot,x_i)\}$，$f_\perp$ 与之正交。由再生性 $f(x_i)=\langle f,k(\cdot,x_i)\rangle=f_\parallel(x_i)$，所以数据项只依赖 $f_\parallel$，而 $\lVert f\rVert^2=\lVert f_\parallel\rVert^2+\lVert f_\perp\rVert^2$，故最优解有 $f_\perp=0$。代入 $f=\sum\alpha_ik(\cdot,x_i)$，目标变为 $\lVert y-K\alpha\rVert^2+\tau\alpha^\top K\alpha$，对 $\alpha$ 求导得 $K[(K+\tau I)\alpha-y]=0$，$\alpha=(K+\tau I)^{-1}y$ 是解且给出唯一的 $\hat f$。$\square$

**边际似然.** 对 $f$ 积分后 $y\sim N(0,s^2(K+\tau I))$，所以
$$\log p(y\mid\ell,\tau,s^2)=-\tfrac1{2s^2}y^\top(K+\tau I)^{-1}y-\tfrac12\log\det(K+\tau I)-\tfrac n2\log(2\pi s^2).$$
对 $s^2$ 求极大得 $\hat s^2=y^\top(K+\tau I)^{-1}y/n$。第一项奖励拟合，第二项（行列式）惩罚复杂度：这是"奥卡姆剃刀"的自动版本。

**Nyström（回归子集）.** 把函数限制在 $f(x)=\sum_{j=1}^mw_jk(x,c_j)$ 上，最小化 $\lVert y-K_{nm}w\rVert^2+\tau\,w^\top K_{mm}w$，解为 $w=(K_{mn}K_{nm}+\tau K_{mm})^{-1}K_{mn}y$。它等价于把核换成低秩近似 $\tilde k(x,x')=k(x,C)K_{mm}^{-1}k(C,x')$ 后的精确解。

参考：C. E. Rasmussen, C. K. I. Williams,《Gaussian Processes for Machine Learning》（MIT Press, 2006）第 2、5、8 章；G. Kimeldorf, G. Wahba, *J. Math. Anal. Appl.* 33 (1971)。
`
});

add({
  id: "rff", name: "随机傅里叶特征 + 线性模型", group: "kernel", api: "supervised", kinds: ["regression", "classification"], families: ["tabular", "image"],
  summary: "用 D 个随机余弦特征近似 RBF / 拉普拉斯核，再做岭回归或逻辑回归：核方法的线性代价版本。",
  params: [
    I("D", "特征数 D", 500, 20, 3000, 10, "越多越接近精确的核方法；回归的代价约 n·D²"),
    N("ellFactor", "长度尺度 ℓ（中位数距离的倍数）", 1, 0.05, 10, 0.05, "ℓ = 倍数 × 标准化后两两距离的中位数"),
    S("kind", "核", "rbf", [["rbf", "RBF（高斯谱密度）"], ["laplace", "拉普拉斯 exp(−‖δ‖₁/ℓ)（柯西谱密度）"]]),
    N("loglam", "L2 强度 log₁₀ λ", -4, -8, 1, 0.1),
    I("maxIter", "分类：L-BFGS 最多迭代", 300, 10, 3000, 10)
  ],
  code: code(SN.base, SN.scaler, SN.chol, SN.lbfgs, SN.rff, js`
/* ================= 随机傅里叶特征 + 线性模型 =================
 * 回归：在特征 z(x) 上做岭回归（n ≥ D 解 D×D 的原问题，否则解 n×n 的对偶问题，结果一样）。
 * 分类：在 z(x) 上做 softmax 逻辑回归（L-BFGS）。 */
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, n = tr.n, d = tr.d, cls = data.kind === "classification", K = cls ? tr.k : 0, i, j, c;
  var sc = fitScaler(tr.X, n, d), Z = applyScaler(sc, tr.X, n), ell = p.ellFactor * medianDist(Z, n, d, lib.rng), D = p.D;
  var F = makeRff(d, D, ell, p.kind, lib.rng), Phi = rffFeatures(F, Z, n), Pv = rffFeatures(F, applyScaler(sc, va.X, va.n), va.n), lam = Math.pow(10, p.loglam);
  var M = { sc: sc, F: F, cls: cls, K: K, D: D, ell: ell, lam: lam };
  if (!cls) {
    var ym = meanOf(tr.y, n), r = new Float64Array(n);
    for (i = 0; i < n; i++) r[i] = tr.y[i] - ym;
    if (n >= D) {
      var G = gramT(Phi, n, D), cc = new Float64Array(D);
      for (i = 0; i < n; i++) for (j = 0; j < D; j++) cc[j] += Phi[i * D + j] * r[i];
      for (j = 0; j < D * D; j++) G[j] /= n;
      for (j = 0; j < D; j++) cc[j] /= n;
      M.beta = ridgeSolve(G, cc, D, lam);
    } else {                             // 对偶：β = Φᵀ(ΦΦᵀ + nλI)⁻¹ r
      var PhiT = new Float64Array(D * n); for (i = 0; i < n; i++) for (j = 0; j < D; j++) PhiT[j * n + i] = Phi[i * D + j];
      var Kd = gramT(PhiT, D, n), al = ridgeSolve(Kd, r, n, n * lam);
      M.beta = new Float64Array(D); for (i = 0; i < n; i++) for (j = 0; j < D; j++) M.beta[j] += Phi[i * D + j] * al[i];
    }
    M.ym = ym; M.size = D * (d + 2) + 1;
    return M;
  }
  // 分类：softmax 回归，参数 W（D×K）和截距 b（K）
  var nw = (D + 1) * K, w = new Float64Array(nw), S0 = new Float64Array(n * K), Sv = new Float64Array(va.n * K), last = {};
  var cnt = new Float64Array(K); for (i = 0; i < n; i++) cnt[tr.y[i]]++;
  for (c = 0; c < K; c++) w[D * K + c] = Math.log((cnt[c] + 0.5) / (n + 0.5 * K));
  M.w = w;
  function fg(wv, g) {
    scoresOf(wv, Phi, n, D, K, S0); softmaxRows(S0, n, K);
    last.loss = ceOf(S0, tr.y, n, K); last.acc = accOf(S0, tr.y, n, K);
    g.fill(0);
    for (i = 0; i < n; i++) S0[i * K + tr.y[i]] -= 1;
    var reg = 0, q;
    for (i = 0; i < n; i++) for (c = 0; c < K; c++) {
      var e = S0[i * K + c] / n; if (e === 0) continue;
      g[D * K + c] += e;
      for (j = 0; j < D; j++) g[j * K + c] += Phi[i * D + j] * e;
    }
    for (q = 0; q < D * K; q++) { reg += wv[q] * wv[q]; g[q] += lam * wv[q]; }
    return last.loss + 0.5 * lam * reg;
  }
  var res = lbfgs(fg, w, { maxIter: p.maxIter, m: 10, tol: 1e-12, onIter: function (it) {
    scoresOf(w, Pv, va.n, D, K, Sv); softmaxRows(Sv, va.n, K);
    ctx.report(it, { loss: last.loss, validLoss: ceOf(Sv, va.y, va.n, K), trainMetric: last.acc, validMetric: accOf(Sv, va.y, va.n, K) });
    if (snapDue(it)) ctx.snapshot(it, M);
    return ctx.timeLeft() < 0;
  } });
  M.iters = res.iters; M.size = D * (d + 1) + nw;
  return M;
}
function scoresOf(w, Phi, n, D, K, out) {
  for (var i = 0; i < n; i++) for (var c = 0; c < K; c++) {
    var s = w[D * K + c]; for (var j = 0; j < D; j++) s += Phi[i * D + j] * w[j * K + c];
    out[i * K + c] = s;
  }
  return out;
}
function predict(M, X, n) {
  var Phi = rffFeatures(M.F, applyScaler(M.sc, X, n), n), D = M.D;
  if (M.cls) return softmaxRows(scoresOf(M.w, Phi, n, D, M.K, new Float64Array(n * M.K)), n, M.K);
  var out = new Float64Array(n);
  for (var i = 0; i < n; i++) { var s = M.ym; for (var j = 0; j < D; j++) s += Phi[i * D + j] * M.beta[j]; out[i] = s; }
  return out;
}
function inspect(M) {
  return { text: M.D + " 个随机傅里叶特征（" + (M.F.kind === "laplace" ? "拉普拉斯核" : "RBF 核") + "），长度尺度 ℓ = " + M.ell.toPrecision(3) + "（标准化单位），λ = " + M.lam.toExponential(1) + (M.cls ? "，L-BFGS 迭代 " + M.iters + " 次" : "") + "。" };
}
`),
  docs: md`
## 模型
$$z(x)=\sqrt{\tfrac2D}\,\big(\cos(\omega_1^\top x+b_1),\dots,\cos(\omega_D^\top x+b_D)\big),\qquad \omega_j\overset{\text{iid}}\sim p,\ \ b_j\overset{\text{iid}}\sim U[0,2\pi),$$
$x$ 是标准化后的特征，$p$ 是核的谱密度：RBF 核 $e^{-\lVert\delta\rVert^2/2\ell^2}$ 对应 $N(0,\ell^{-2}I)$，拉普拉斯核 $e^{-\lVert\delta\rVert_1/\ell}$ 对应每一维独立的柯西分布（尺度 $1/\ell$）。然后在 $z(x)$ 上做线性模型：回归 $\hat y=\bar y+\beta^\top z(x)$，分类 $\operatorname{softmax}(W^\top z(x)+b)$。于是 $z(x)^\top z(x')\approx k(x,x')$：这是核岭回归 / 核逻辑回归的随机近似。

## 损失与训练
回归：岭回归的闭式解（$n\ge D$ 解 $D\times D$ 的原问题，否则解 $n\times n$ 的对偶问题 $\beta=\Phi^\top(\Phi\Phi^\top+n\lambda I)^{-1}r$，两者相同）。分类：交叉熵加 $\frac\lambda2\lVert W\rVert^2$，用 L-BFGS。$\ell$ 用"中位数启发"：标准化后随机 500 对样本距离的中位数乘以给定的倍数。

## 参数怎么调
- **ℓ**：最重要。倍数 0.3–1 之间通常最好；太小时每个点只"看见"自己（过拟合，像 1-近邻），太大时退化成近似线性的模型。
- **D**：越大越接近精确的核方法，误差约按 $1/\sqrt D$ 下降；几百通常够用。
- **λ**：核方法里的正则化；特征多于样本时尤其要有。
- 拉普拉斯核的谱密度是重尾的（柯西），特征里有很高的频率，适合不太光滑的函数。

## 复杂度
造特征 $O(nDd)$；回归 $O(n\min(n,D)^2)$；分类每次迭代 $O(nDk)$。预测每个样本 $O(Dd)$——与训练集大小无关，这是它相对精确核方法的最大好处。

## 什么时候好用、什么时候失效
需要非线性、样本又多到精确核方法（$O(n^3)$）算不动时，它把代价降到线性。函数光滑、维数中等时效果接近精确的高斯过程 / SVM。维数高而有用的方向很少时，各向同性的核同样不好用；$D$ 不够大时近似误差会主导，表现不如同样大小的神经网络（特征是随机的，不随数据调整）。

## 理论
**定理 1（Bochner）.** 设 $\kappa:\mathbb R^d\to\mathbb R$ 连续、$\kappa(0)=1$。则 $k(x,x')=\kappa(x-x')$ 是正定核，当且仅当存在 $\mathbb R^d$ 上的概率测度 $p$ 使 $\kappa(\delta)=\int e^{i\omega^\top\delta}\,dp(\omega)$。（$\kappa$ 是实的偶函数时 $p$ 对称，积分就是 $\int\cos(\omega^\top\delta)\,dp$。）

**命题 2（随机特征是无偏的）.** 取 $\omega\sim p$、$b\sim U[0,2\pi)$ 独立，则 $\mathbb E\big[2\cos(\omega^\top x+b)\cos(\omega^\top x'+b)\big]=k(x,x')$。

*证明.* $2\cos A\cos B=\cos(A-B)+\cos(A+B)$。这里 $A-B=\omega^\top(x-x')$ 与 $b$ 无关，而 $A+B=\omega^\top(x+x')+2b$，对 $b$ 在一个周期上平均为 0。所以期望是 $\mathbb E_\omega\cos(\omega^\top(x-x'))=\kappa(x-x')$（Bochner，$p$ 对称）。$\square$

**推论（逐点的集中）.** $z(x)^\top z(x')$ 是 $D$ 个独立、取值在 $[-2,2]$ 内的随机变量的平均，由 Hoeffding 不等式，$P\big(|z(x)^\top z(x')-k(x,x')|\ge\varepsilon\big)\le2e^{-D\varepsilon^2/8}$。Rahimi–Recht（2007）进一步给出在紧集 $\mathcal M$ 上一致的界：$P\big(\sup_{x,x'\in\mathcal M}|z(x)^\top z(x')-k(x,x')|\ge\varepsilon\big)\le2^8\big(\frac{\sigma_p\operatorname{diam}\mathcal M}\varepsilon\big)^2\exp\big(-\frac{D\varepsilon^2}{4(d+2)}\big)$，$\sigma_p^2=\mathbb E_p\lVert\omega\rVert^2$。

**谱密度的例子.** $e^{-\lVert\delta\rVert^2/2\ell^2}=\mathbb E_{\omega\sim N(0,\ell^{-2}I)}e^{i\omega^\top\delta}$（正态分布的特征函数）；$e^{-|\delta|/\ell}$ 是柯西分布 $\frac{\ell}{\pi(1+\ell^2\omega^2)}$ 的特征函数，各维相乘就是 $e^{-\lVert\delta\rVert_1/\ell}$。

参考：A. Rahimi, B. Recht, Random features for large-scale kernel machines, *NIPS* 20 (2007)；S. Bochner,《Lectures on Fourier Integrals》（1959）；W. Rudin,《Fourier Analysis on Groups》（1962）。
`
});

add({
  id: "svm", name: "支持向量机（RBF）", group: "kernel", api: "supervised", kinds: ["classification"], families: ["tabular", "image"],
  summary: "随机傅里叶特征上的合页损失，用 Pegasos 随机次梯度法训练（一对其余）；最后用留出的一份做 Platt 式的概率校准。",
  params: [
    I("D", "随机傅里叶特征数 D", 500, 20, 3000, 10),
    N("ellFactor", "长度尺度 ℓ（中位数距离的倍数）", 0.7, 0.05, 10, 0.05),
    N("loglam", "正则强度 log₁₀ λ", -4, -7, 0, 0.1, "目标 λ/2·‖w‖² + 平均合页损失；λ 越小间隔越窄、越贴合训练集（相当于 C = 1/(nλ)）"),
    I("epochs", "训练轮数", 40, 1, 500, 1),
    I("batch", "小批量大小", 32, 1, 512, 1),
    N("calib", "留作概率校准的比例", 0.2, 0, 0.5, 0.05, "从训练集里留出这么多，拟合 softmax(A·得分 + b)；0 = 直接在训练集上校准（会过于自信）")
  ],
  code: code(SN.base, SN.scaler, SN.lbfgs, SN.rff, js`
/* ================= 支持向量机 =================
 * 特征：随机傅里叶特征 z(x)（近似 RBF 核），末尾补一个常数 1 当截距。
 * 每个类别一台"这一类 vs 其余"的线性 SVM（两类时只有一台），目标 λ/2·‖w‖² + (1/n)Σ max(0, 1 − y·wᵀz)。
 * Pegasos：第 t 步取步长 η = 1/(λt)，w ← (1 − ηλ)w + (η/|B|) Σ_{违反间隔的样本} y·z，再投影到 ‖w‖ ≤ 1/√λ 的球里；
 * 输出后一半迭代的平均（后缀平均）。SVM 的得分不是概率：最后在留出的一份上拟合 P = softmax(A·s + b)（两类时就是 Platt 缩放）。 */
function fit(data, p, lib, ctx) {
  var tr = data.train, va = data.valid, n = tr.n, d = tr.d, K = tr.k, rng = lib.rng, i, j, c;
  var sc = fitScaler(tr.X, n, d), Z = applyScaler(sc, tr.X, n), ell = p.ellFactor * medianDist(Z, n, d, rng);
  var F = makeRff(d, p.D, ell, "rbf", rng), D1 = p.D + 1, Phi = withBias(rffFeatures(F, Z, n), n, p.D), Pv = withBias(rffFeatures(F, applyScaler(sc, va.X, va.n), va.n), va.n, p.D);
  // 训练 / 校准的划分
  var ord = []; for (i = 0; i < n; i++) ord.push(i);
  for (i = n - 1; i > 0; i--) { var q = rng.int(i + 1), t = ord[i]; ord[i] = ord[q]; ord[q] = t; }
  var nc = n >= 50 ? Math.round(p.calib * n) : 0, fitIdx = ord.slice(nc), calIdx = nc ? ord.slice(0, nc) : ord;
  var Cm = K === 2 ? 1 : K, lam = Math.pow(10, p.loglam), W = new Float64Array(Cm * D1), Wbar = new Float64Array(Cm * D1), nb = 0;
  var M = { sc: sc, F: F, K: K, Cm: Cm, D1: D1, W: Wbar, A: 1, b: new Float64Array(K), lam: lam, ell: ell };
  function lab(i2, c2) { return Cm === 1 ? (tr.y[i2] === 1 ? 1 : -1) : (tr.y[i2] === c2 ? 1 : -1); }
  var nf = fitIdx.length, bs = Math.max(1, Math.min(p.batch, nf)), perEp = Math.ceil(nf / bs), Ttot = p.epochs * perEp, step = 0, rad = 1 / Math.sqrt(lam), upd = new Float64Array(D1);
  for (var ep = 0; ep < p.epochs; ep++) {
    for (i = nf - 1; i > 0; i--) { var q2 = rng.int(i + 1), t2 = fitIdx[i]; fitIdx[i] = fitIdx[q2]; fitIdx[q2] = t2; }
    for (var s0 = 0; s0 < nf; s0 += bs) {
      step++;
      var eta = 1 / (lam * step), e0 = Math.min(nf, s0 + bs), m = e0 - s0;
      for (c = 0; c < Cm; c++) {
        var o = c * D1; upd.fill(0);
        for (var r = s0; r < e0; r++) {
          var ii = fitIdx[r], yv = lab(ii, c), f = 0;
          for (j = 0; j < D1; j++) f += W[o + j] * Phi[ii * D1 + j];
          if (yv * f < 1) for (j = 0; j < D1; j++) upd[j] += yv * Phi[ii * D1 + j];
        }
        var nrm = 0;
        for (j = 0; j < D1; j++) { W[o + j] = (1 - eta * lam) * W[o + j] + eta / m * upd[j]; nrm += W[o + j] * W[o + j]; }
        nrm = Math.sqrt(nrm); if (nrm > rad) for (j = 0; j < D1; j++) W[o + j] *= rad / nrm;
      }
      if (step > Ttot / 2) { nb++; for (j = 0; j < Cm * D1; j++) Wbar[j] += (W[j] - Wbar[j]) / nb; }   // 后缀平均
    }
    if (!nb) Wbar.set(W);
    // 曲线：原问题的目标（训练部分）与验证准确率（按未校准的得分取最大）
    var obj = 0, hinge = 0;
    for (c = 0; c < Cm; c++) { for (j = 0; j < D1; j++) obj += 0.5 * lam * Wbar[c * D1 + j] * Wbar[c * D1 + j]; }
    for (r = 0; r < nf; r++) { var i3 = fitIdx[r]; for (c = 0; c < Cm; c++) { var f3 = 0; for (j = 0; j < D1; j++) f3 += Wbar[c * D1 + j] * Phi[i3 * D1 + j]; hinge += Math.max(0, 1 - lab(i3, c) * f3); } }
    var Sv = scoresOf(M, Pv, va.n);
    ctx.report(ep + 1, { loss: obj + hinge / nf, validMetric: accOf(probsOf(M, Sv, va.n), va.y, va.n, K) });
    if (snapDue(ep + 1)) ctx.snapshot(ep + 1, M);
    if (ctx.timeLeft() < 0) { ctx.log("时间到了：训练了 " + (ep + 1) + " 轮。"); break; }
  }
  // 校准：在留出的样本上最小化 softmax(A·s + b) 的交叉熵（加一点点 L2）
  var Pc = new Float64Array(calIdx.length * D1), yc = new Int32Array(calIdx.length);
  for (i = 0; i < calIdx.length; i++) { for (j = 0; j < D1; j++) Pc[i * D1 + j] = Phi[calIdx[i] * D1 + j]; yc[i] = tr.y[calIdx[i]]; }
  var Sc = scoresOf(M, Pc, calIdx.length), ncal = calIdx.length, th = new Float64Array(K + 1), P = new Float64Array(ncal * K);
  th[0] = 1;
  lbfgs(function (v, g) {
    var L = 0, ii2, cc;
    for (ii2 = 0; ii2 < ncal; ii2++) for (cc = 0; cc < K; cc++) P[ii2 * K + cc] = v[0] * Sc[ii2 * K + cc] + v[1 + cc];
    softmaxRows(P, ncal, K);
    L = ceOf(P, yc, ncal, K) + 1e-4 * (v[0] - 1) * (v[0] - 1);
    g.fill(0); g[0] = 2e-4 * (v[0] - 1);
    for (ii2 = 0; ii2 < ncal; ii2++) for (cc = 0; cc < K; cc++) { var e = (P[ii2 * K + cc] - (yc[ii2] === cc ? 1 : 0)) / ncal; g[0] += e * Sc[ii2 * K + cc]; g[1 + cc] += e; }
    return L;
  }, th, { maxIter: 100 });
  M.A = th[0]; for (c = 0; c < K; c++) M.b[c] = th[1 + c];
  M.ncal = ncal; M.calibOnTrain = !nc; M.size = p.D * (d + 1) + Cm * D1 + K + 1;
  return M;
}
function withBias(Phi, n, D) { var out = new Float64Array(n * (D + 1)); for (var i = 0; i < n; i++) { out.set(Phi.subarray(i * D, i * D + D), i * (D + 1)); out[i * (D + 1) + D] = 1; } return out; }
/* 得分：两类时第 0 列恒为 0、第 1 列是 SVM 的输出；多类时每列是一台"一对其余"的 SVM */
function scoresOf(M, Phi, n) {
  var K = M.K, D1 = M.D1, S = new Float64Array(n * K), i, c, j;
  for (i = 0; i < n; i++) for (c = 0; c < M.Cm; c++) { var f = 0; for (j = 0; j < D1; j++) f += M.W[c * D1 + j] * Phi[i * D1 + j]; S[i * K + (M.Cm === 1 ? 1 : c)] = f; }
  return S;
}
function probsOf(M, S, n) { var P = new Float64Array(n * M.K); for (var i = 0; i < n * M.K; i++) P[i] = M.A * S[i] + M.b[i % M.K]; return softmaxRows(P, n, M.K); }
function predict(M, X, n) { var Phi = withBias(rffFeatures(M.F, applyScaler(M.sc, X, n), n), n, M.F.D); return probsOf(M, scoresOf(M, Phi, n), n); }
function inspect(M) {
  return { text: (M.Cm === 1 ? "一台两类 SVM" : M.Cm + " 台“一对其余”的 SVM") + "，" + M.F.D + " 个随机傅里叶特征（RBF，ℓ = " + M.ell.toPrecision(3) + "），λ = " + M.lam.toExponential(1) + "。\n概率校准：P = softmax(" + M.A.toFixed(3) + "·得分 + b)，在 " + M.ncal + " 个" + (M.calibOnTrain ? "训练样本（没有留出，概率会偏自信）" : "留出的训练样本") + "上拟合。" };
}
`),
  docs: md`
## 模型
在随机傅里叶特征 $z(x)\in\mathbb R^{D}$（近似 RBF 核，见"随机傅里叶特征"）后面补一个常数 1 作截距，得到 $\tilde z(x)$。两类时一台线性 SVM，得分 $f(x)=w^\top\tilde z(x)$，按 $\operatorname{sign}f$ 分类；$k>2$ 类时 $k$ 台"这一类对其余"的 SVM，取得分最大的类。概率由校准给出：$P(y=c\mid x)=\operatorname{softmax}_c(A\,s_c(x)+b_c)$（两类时 $s=(0,f)$，这就是 Platt 缩放 $\sigma(Af+b)$）。

## 损失与训练
每台 SVM 最小化（$y_i\in\{\pm1\}$）
$$P(w)=\frac\lambda2\lVert w\rVert^2+\frac1n\sum_i\max\big(0,\,1-y_iw^\top\tilde z_i\big).$$
**Pegasos**（随机次梯度法）：第 $t$ 步取小批量 $B_t$，步长 $\eta_t=1/(\lambda t)$，
$$w\leftarrow(1-\eta_t\lambda)w+\frac{\eta_t}{|B_t|}\sum_{i\in B_t:\,y_iw^\top\tilde z_i<1}y_i\tilde z_i,$$
再投影到球 $\lVert w\rVert\le1/\sqrt\lambda$ 上（最优解一定在这个球里）。输出后一半迭代的平均。训练结束后，在留出的一份训练样本上用 L-BFGS 拟合校准参数 $A,b$（最小化交叉熵）。曲线画的是原问题目标 $P(w)$ 与验证集准确率。

## 参数怎么调
- **λ** 与标准 SVM 的 $C$ 的关系是 $C=1/(n\lambda)$：$\lambda$ 小，间隔窄、贴合训练集；$\lambda$ 大，边界更平滑。
- **ℓ**（RBF 的宽度）：和 $\lambda$ 一起决定复杂度，通常要两个一起调。
- 轮数：Pegasos 的误差按 $1/(\lambda T)$ 下降，$\lambda$ 很小时需要更多轮。
- 校准比例：0 时在训练集上校准，概率会偏自信；对数损失要紧时留出一部分。

## 复杂度
特征 $O(nDd)$；每轮 $O(nDk')$（$k'$ 台 SVM）；校准很便宜。预测每个样本 $O(Dd+Dk')$。

## 什么时候好用、什么时候失效
中小规模、边界光滑但弯曲的分类问题上，RBF 核 SVM 是经典的强基线；合页损失只关心间隔附近的点（支持向量），对远离边界的点不敏感。它本身不给概率（校准是事后补的）；类别很多时"一对其余"的得分之间不可比，需要校准来协调；核宽度选错时表现很差；特征上千维、样本又极多时，深度网络或提升树通常更好。

## 理论
**定理 1（间隔与对偶）.** 对线性可分的数据，硬间隔 SVM $\min\frac12\lVert w\rVert^2$ s.t. $y_iw^\top x_i\ge1$ 的解使几何间隔 $\min_iy_iw^\top x_i/\lVert w\rVert=1/\lVert w\rVert$ 最大。软间隔问题的拉格朗日对偶是
$$\max_\alpha\ \sum_i\alpha_i-\frac12\sum_{i,j}\alpha_i\alpha_jy_iy_jk(x_i,x_j),\qquad 0\le\alpha_i\le C,$$
最优解 $w=\sum_i\alpha_iy_i\phi(x_i)$ 只依赖 $\alpha_i>0$ 的点（支持向量），并且只通过核 $k=\langle\phi,\phi\rangle$ 依赖特征映射。（$P(w)$ 中 $C=1/(n\lambda)$；这里不加截距约束，截距放进了特征里。）

**定理 2（Pegasos 的收敛，Shalev-Shwartz 等 2011）.** 设 $\lVert\tilde z_i\rVert\le R$，$w^*=\arg\min P$。用步长 $\eta_t=1/(\lambda t)$ 与投影的 Pegasos 迭代 $T$ 步，记 $\bar w$ 为迭代点的平均，则
$$\mathbb E\,P(\bar w)-P(w^*)\le\frac{c\,(\sqrt\lambda+R)^2\,(1+\ln T)}{\lambda T}$$
（$c$ 为绝对常数）。证明用的是强凸函数上在线梯度下降的对数遗憾界：$P$ 是 $\lambda$-强凸的，次梯度的范数被 $\sqrt\lambda+R$ 控制（投影保证 $\lVert w\rVert\le1/\sqrt\lambda$），再把遗憾除以 $T$ 并用 Jensen 不等式转到平均点上。后缀平均可以去掉 $\ln T$ 因子（Rakhlin 等 2012）。

**合页损失是分类相合的（Zhang 2004；Bartlett–Jordan–McAuliffe 2006）.** 设 $\eta(x)=P(y=1\mid x)$。在所有可测函数上，期望合页风险 $\mathbb E\max(0,1-yf(X))$ 的最小点是 $f^*(x)=\operatorname{sign}(2\eta(x)-1)$，并且合页风险的超额量控制 0-1 风险的超额量：$R_{01}(f)-R_{01}^*\le R_{\text{hinge}}(f)-R_{\text{hinge}}^*$。但 $f^*$ 只含符号、不含 $\eta$ 的大小——这正是 SVM 的得分不是概率、需要校准的原因。

参考：C. Cortes, V. Vapnik, Support-vector networks, *Machine Learning* 20 (1995)；S. Shalev-Shwartz, Y. Singer, N. Srebro, A. Cotter, Pegasos, *Math. Programming* 127 (2011)；J. Platt, Probabilistic outputs for SVMs (1999)；P. Bartlett, M. Jordan, J. McAuliffe, *JASA* 101 (2006)。
`
});

/* ================================================================== *
 *  神经网络
 * ================================================================== */
SN.train = js`
/* ---------- 神经网络训练的共用部分 ----------
 * 分块做前向（不记录计算图），免得一次几千行的中间结果太大 */
function forwardRows(nn, f, Z, n, dim, B) {
  var outs = [], k = 0;
  for (var s = 0; s < n; s += B) {
    var e = Math.min(n, s + B);
    var o = nn.noGrad(function () { return f(nn.fromRows(Z.subarray(s * dim, e * dim), dim)); });
    k = o.shape[1]; outs.push(o.data);
  }
  var all = new Float64Array(n * k), off = 0;
  outs.forEach(function (a) { all.set(a, off); off += a.length; });
  return { data: all, k: k };
}
/* 网络的原始输出 → 损失与指标：分类是交叉熵与准确率；回归是均方误差（换回 y 的原始单位） */
function scoreOut(out, n, part, cls, K, ym, ys) {
  if (cls) { var P = softmaxRows(Float64Array.from(out), n, K); return { loss: ceOf(P, part.y, n, K), met: accOf(P, part.y, n, K), P: P }; }
  var pr = new Float64Array(n); for (var i = 0; i < n; i++) pr[i] = out[i] * ys + ym;
  var e = mseOf(pr, part.y, n); return { loss: e, met: e, P: pr };
}
function batchAcc(out, y, n, K) { var hit = 0; for (var i = 0; i < n; i++) { var b = 0; for (var c = 1; c < K; c++) if (out[i * K + c] > out[i * K + b]) b = c; if (b === y[i]) hit++; } return hit; }
function yStats(part) { var n = part.n, m = meanOf(part.y, n), v = 0; for (var i = 0; i < n; i++) v += (part.y[i] - m) * (part.y[i] - m); return { m: m, s: Math.sqrt(v / n) || 1 }; }
`;
add({
  id: "mlp", name: "神经网络（多层感知机）", group: "neural", api: "supervised", kinds: ["classification", "regression"], families: ["tabular", "image", "toy"],
  summary: "全连接网络，AdamW 小批量训练，按验证损失早停并退回最好的一轮；词元输入展开成独热编码。",
  params: [
    S("hidden", "隐藏层", "64,64", [["16", "16"], ["64", "64"], ["256", "256"], ["32,32", "32 → 32"], ["64,64", "64 → 64"], ["128,128", "128 → 128"], ["256,256", "256 → 256"], ["128,128,128", "128 → 128 → 128"]]),
    S("act", "激活函数", "relu", [["relu", "ReLU"], ["tanh", "tanh"], ["gelu", "GELU"]]),
    N("lr", "学习率", 0.003, 0.0001, 0.1, 0.0001),
    N("wd", "权重衰减（AdamW）", 0.0001, 0, 1, 0.0001, "每一步把权重乘以 (1 − 学习率 × 衰减)；偏置不衰减"),
    N("dropout", "丢弃率", 0, 0, 0.8, 0.05, "训练时每个隐藏单元以这个概率置零"),
    I("batch", "小批量大小", 64, 4, 2048, 4),
    I("epochs", "最多训练几轮", 500, 1, 20000, 1, "一轮 = 把训练集过一遍；时间预算用完也会停"),
    I("patience", "早停的耐心（轮）", 50, 0, 5000, 1, "验证损失这么多轮没有变好就停；0 = 不早停（仍然退回最好的一轮）"),
    S("schedule", "学习率曲线", "const", [["const", "不变"], ["cosine", "余弦退火到 0"]])
  ],
  code: code(SN.base, SN.scaler, SN.input, SN.train, js`
/* ================= 多层感知机 =================
 * 结构：输入（标准化，或词元的独热编码）→ [线性 → 激活 → (丢弃)] × 层数 → 线性 → 输出（分类是 logits，回归是一个数）。
 * 训练：小批量 AdamW，分类用交叉熵、回归用（标准化后的 y 的）均方误差；每轮结束在验证集上评价，
 * 留住验证损失最好的那一版参数（早停），最后退回到它。 */
function fit(data, p, lib, ctx) {
  var nn = lib.nn, tr = data.train, va = data.valid, cls = data.kind === "classification", K = cls ? tr.k : 1, rng = lib.rng, n = tr.n, i;
  if (!nn) throw new Error("这个算法要用 lib.nn（自动求导库）。");
  var inp = makeInput(tr), D = inp.dim, Z = toInput(inp, tr.X, n), Zv = toInput(inp, va.X, va.n);
  var yst = cls ? { m: 0, s: 1 } : yStats(tr), yt = null;
  if (!cls) { yt = new Float32Array(n); for (i = 0; i < n; i++) yt[i] = (tr.y[i] - yst.m) / yst.s; }
  var hidden = String(p.hidden).split(",").map(function (s) { return Math.max(1, parseInt(s, 10) || 1); });
  var net = nn.MLP([D].concat(hidden, [cls ? K : 1]), { act: p.act, rng: rng, dropout: p.dropout }), params = net.params();
  net.layers.forEach(function (L) { L.b.noDecay = true; });
  var opt = nn.adam(params, { lr: p.lr, weightDecay: p.wd });
  var M = { nn: nn, net: net, inp: inp, D: D, cls: cls, K: K, ym: yst.m, ys: yst.s, act: p.act, hidden: hidden };   // predict 拿不到 lib，所以把 nn 存在模型里
  var bs = Math.max(1, Math.min(p.batch, n)), total = p.epochs * Math.ceil(n / bs), step = 0, best = { loss: Infinity, ep: 0, saved: null }, ep, stop = false;
  function fwd(x) { return net.forward(x); }
  for (ep = 1; ep <= p.epochs && !stop; ep++) {
    var bl = nn.batches(n, bs, rng), sL = 0, sA = 0, cnt = 0;
    for (var b = 0; b < bl.length; b++) {
      var idx = bl[b];
      if (p.schedule === "cosine") opt.lr = p.lr * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, step / total)));
      var out = net.forward(nn.fromRows(Z, D, idx)), loss = cls ? nn.crossEntropy(out, nn.pick(tr.y, idx)) : nn.mse(out, nn.pick(yt, idx));
      opt.zeroGrad(); loss.backward(); opt.step(); step++;
      sL += loss.data[0] * idx.length; cnt += idx.length;
      if (cls) sA += batchAcc(out.data, nn.pick(tr.y, idx), idx.length, K);
      if (ctx.timeLeft() < 0) { stop = true; ctx.log("时间到了：第 " + ep + " 轮没跑完就停了。"); break; }
    }
    var ev = scoreOut(forwardRows(nn, fwd, Zv, va.n, D, 1024).data, va.n, va, cls, K, M.ym, M.ys);
    var tl = cls ? sL / cnt : sL / cnt * M.ys * M.ys;
    ctx.report(ep, { loss: tl, validLoss: ev.loss, trainMetric: cls ? sA / cnt : tl, validMetric: ev.met, lr: opt.lr });
    if (snapDue(ep)) ctx.snapshot(ep, M);
    if (ev.loss < best.loss) best = { loss: ev.loss, ep: ep, saved: nn.saveParams(params) };
    else if (p.patience > 0 && ep - best.ep >= p.patience) { ctx.log("早停：验证损失在第 " + best.ep + " 轮之后 " + p.patience + " 轮没有变好。"); break; }
  }
  if (best.saved) nn.loadParams(params, best.saved);
  M.bestEpoch = best.ep; M.epochs = Math.min(ep, p.epochs); M.steps = step;
  M.sample = Float32Array.from(Zv.subarray(0, Math.min(va.n, 256) * D)); M.nSample = Math.min(va.n, 256);
  M.size = nn.numParams(params);
  return M;
}
function predict(M, X, n) {
  var Z = toInput(M.inp, X, n), out = forwardRows(M.nn, function (x) { return M.net.forward(x); }, Z, n, M.D, 1024).data;
  if (M.cls) return softmaxRows(out, n, M.K);
  var y = new Float64Array(n); for (var i = 0; i < n; i++) y[i] = out[i] * M.ys + M.ym;
  return y;
}
function inspect(M) {
  var nn = M.nn, L = M.net.layers, layers = L.map(function (l, i) { return { name: "第 " + (i + 1) + " 层 W（输入 × 输出）", rows: l.W.shape[0], cols: l.W.shape[1], data: l.W.data }; });
  var acts = [];
  if (M.nSample && L.length > 1) {
    var h = nn.noGrad(function () { return nn[M.act](L[0].forward(nn.fromRows(M.sample, M.D))); });
    acts.push({ name: "第 1 隐藏层（验证集的前 " + M.nSample + " 个样本，" + M.act + " 之后）", data: h.data });
  }
  var out = { layers: layers, activations: acts, text: "结构 " + [M.D].concat(M.hidden, [M.cls ? M.K : 1]).join(" → ") + "，" + nn.numParams(M.net.params()) + " 个参数。" + (M.epochs ? "\n训练了 " + M.epochs + " 轮（" + M.steps + " 步），用的是验证损失最好的第 " + M.bestEpoch + " 轮的参数。" : "") };
  if (M.inp.V > 0) {     // 词元输入：第一层权重里第一个位置的那一块（词元 × 隐藏单元）相当于一张嵌入表
    var V = M.inp.V, H = L[0].W.shape[1], labels = [];
    for (var v = 0; v < V; v++) labels.push(String(v));
    out.embedding = { rows: V, cols: H, data: L[0].W.data.subarray(0, V * H), labels: labels };
  }
  return out;
}
`),
  docs: md`
## 模型
$$h_0=z,\qquad h_\ell=\sigma(W_\ell^\top h_{\ell-1}+b_\ell)\ (\ell=1,\dots,L),\qquad \text{输出}=W_{L+1}^\top h_L+b_{L+1}.$$
$z$ 是标准化后的特征（词元输入是独热编码），$\sigma$ 是逐元素的激活函数（ReLU $\max(0,t)$、$\tanh$ 或 GELU）。分类时输出是 $k$ 个 logits，概率取 softmax；回归时输出一个数（在标准化的 $y$ 上训练，预测时换回原单位）。

## 损失与训练
分类：平均交叉熵；回归：均方误差。梯度由反向传播（链式法则，ˋlib.nnˋ 的自动求导）算出。优化器 **AdamW**：
$$m\leftarrow\beta_1m+(1-\beta_1)g,\quad v\leftarrow\beta_2v+(1-\beta_2)g^2,\quad \theta\leftarrow\theta-\eta\Big(\frac{\hat m}{\sqrt{\hat v}+\epsilon}+\lambda\theta\Big),$$
$\hat m,\hat v$ 是偏差修正后的矩估计，$\lambda$ 是**解耦的**权重衰减（不经过自适应分母，偏置不衰减）。每轮把训练集随机分成小批量走一遍，结束时在验证集上评价；保留验证损失最好的那一版参数，验证损失 patience 轮不再下降就停（早停）。丢弃（dropout）只在训练时生效。权重用 He（ReLU 类）或 Xavier（tanh）初始化。

## 参数怎么调
- **学习率**最重要：曲线一开始就不降，调小；降得极慢，调大。Adam 在 $10^{-3}$ 附近通常不错。
- **宽度与深度**：两层 64 对大多数二维玩具数据足够；容量不够时训练损失降不下去，容量过大时训练损失远低于验证损失。
- 过拟合的对策：早停（默认开着）、权重衰减、丢弃、更小的网络。
- 批量越小，梯度噪声越大（有时反而泛化更好），每轮越慢。

## 复杂度
每一步前向加反向约 $3\cdot b\sum_\ell n_{\ell-1}n_\ell$ 次乘加（$b$ 为批量大小，$n_\ell$ 为各层宽度），每轮 $n/b$ 步。预测每个样本 $\sum_\ell n_{\ell-1}n_\ell$。

## 什么时候好用、什么时候失效
特征之间有复杂的非线性和交互、样本足够多时，它很灵活；在图像、词元等结构化输入上配合合适的结构（卷积、嵌入）更强。在小的表格数据上，它通常不如梯度提升树，而且对学习率、初始化和特征尺度敏感，结果会随随机种子波动。它会外推，但外推的方式（ReLU 网络在远处是分片线性的）未必合理。

## 理论
**定理 1（万能逼近，Leshno–Lin–Pinkus–Schocken 1993）.** 设 $\sigma:\mathbb R\to\mathbb R$ 连续。则单隐藏层网络 $\{x\mapsto\sum_{j=1}^Nc_j\sigma(w_j^\top x+b_j):N\in\mathbb N,c_j,b_j\in\mathbb R,w_j\in\mathbb R^d\}$ 在 $C(K)$（$K\subset\mathbb R^d$ 紧，一致范数）中稠密，当且仅当 $\sigma$ 不是多项式。

*证明梗概（$\sigma$ 光滑的情形）.* 若 $\sigma$ 不是多项式，存在 $b_0$ 使 $\sigma^{(k)}(b_0)\ne0$ 对所有 $k$ 成立。$\frac{\partial^k}{\partial w^k}\sigma(wt+b_0)\big|_{w=0}=t^k\sigma^{(k)}(b_0)$，而导数是差商的极限，差商属于网络的线性张成，所以一元的所有单项式 $t^k$ 都在闭包里，由 Weierstrass 定理一元情形得证。多元时，形如 $g(a^\top x)$ 的"脊函数"的张成在 $C(K)$ 中稠密（齐次多项式可以写成 $(a^\top x)^k$ 的线性组合），再对每个 $g$ 用一元的结论。反之，若 $\sigma$ 是 $m$ 次多项式，网络都是次数不超过 $m$ 的多项式，不稠密。$\square$
这个定理只说"存在"，不说需要多少个神经元，也不说梯度下降能找到它们；它也不解释泛化。

**反向传播.** 对计算图 $u_\ell=f_\ell(u_{\ell-1})$，$\frac{\partial L}{\partial u_{\ell-1}}=\big(\frac{\partial f_\ell}{\partial u_{\ell-1}}\big)^\top\frac{\partial L}{\partial u_\ell}$：从损失出发逆序乘一遍雅可比矩阵的转置，一次反向的代价与一次前向同阶（与参数个数无关）。

**丢弃是集成.** 对一个线性层，训练时以概率 $p$ 置零并把其余放大 $1/(1-p)$，期望输出不变；预测时不丢弃，相当于用"所有子网络的几何平均"的一个近似（Srivastava 等 2014）。

**早停与 L2 的关系.** 对二次损失 $\frac12(\theta-\theta^*)^\top H(\theta-\theta^*)$、从 0 出发、步长 $\eta$ 的梯度下降，$t$ 步后的参数在 $H$ 的第 $i$ 个特征方向上是 $[1-(1-\eta h_i)^t]\theta_i^*$；岭回归是 $\frac{h_i}{h_i+\lambda}\theta_i^*$。两者都是"大特征值的方向先学会"，近似地有 $\lambda\approx1/(\eta t)$（Bishop 1995 的论证）。

参考：M. Leshno, V. Lin, A. Pinkus, S. Schocken, *Neural Networks* 6 (1993)；D. Kingma, J. Ba, Adam (2015)；I. Loshchilov, F. Hutter, Decoupled weight decay regularization (2019)；N. Srivastava 等, Dropout, *JMLR* 15 (2014)。
`
});

add({
  id: "cnn", name: "卷积网络（CNN）", group: "neural", api: "supervised", kinds: ["classification", "regression"], families: ["image"],
  summary: "两层小卷积 + 池化 + 全局平均池化（或全连接）读出；格点数据可以用周期边界和对称性数据增强。",
  params: [
    S("channels", "各层通道数", "8,16", [["8", "8（一层）"], ["16", "16（一层）"], ["8,16", "8 → 16"], ["16,32", "16 → 32"], ["32,64", "32 → 64"], ["8,16,32", "8 → 16 → 32"]]),
    S("ksize", "卷积核边长", "3", [["3", "3 × 3"], ["5", "5 × 5"]]),
    S("pad", "边界", "same", [["same", "补零（普通图像）"], ["circular", "周期边界（环面上的格点，如伊辛模型）"]]),
    B("pool", "每层之后 2×2 最大池化", true, "高或宽不能被 2 整除时那一层不池化"),
    S("head", "读出", "gap", [["gap", "全局平均池化 → 线性（平移不变）"], ["flat", "展平 → 全连接 64 → 输出（保留位置信息）"]]),
    S("augment", "数据增强", "none", [["none", "不做"], ["z2", "随机整体翻号 σ → −σ（伊辛的 ℤ₂ 对称）"], ["shift", "随机循环平移（周期格点）"], ["flip", "随机左右翻转"]], "只有在标签确实不变时才合理：比如逾渗的上下连通性在翻号下会变"),
    N("lr", "学习率", 0.003, 0.0001, 0.05, 0.0001),
    N("wd", "权重衰减（AdamW）", 0.0001, 0, 0.5, 0.0001),
    I("batch", "小批量大小", 32, 4, 512, 4),
    I("epochs", "最多训练几轮", 200, 1, 5000, 1),
    I("patience", "早停的耐心（轮）", 25, 0, 1000, 1)
  ],
  code: code(SN.base, SN.train, js`
/* ================= 卷积网络 =================
 * 输入按 [通道, 高, 宽] 排（单通道图像 C = 1），像素整体标准化（一个均值、一个标准差，不逐像素：保持平移结构）。
 * 结构：[卷积 k×k → ReLU → (2×2 最大池化)] × 层数 → 读出。
 * 读出 "gap"：每个通道在整张图上取平均，再接一个线性层——配合周期边界，整个网络对平移严格不变。
 * 读出 "flat"：展平后接 64 个单元的全连接层，能用到位置信息（普通图像上更常用）。 */
function imgShape(part) {
  var s = part.shape, d = part.d;
  if (!s || !s.length) { var r = Math.round(Math.sqrt(d)); if (r * r === d) return { C: 1, H: r, W: r, hwc: false }; throw new Error("卷积网络需要图像数据（data.shape 给出高和宽）。"); }
  if (s.length === 2) return { C: 1, H: s[0], W: s[1], hwc: false };
  if (s[0] <= 4 && s[2] > 4) return { C: s[0], H: s[1], W: s[2], hwc: false };   // [C, H, W]
  return { C: s[2], H: s[0], W: s[1], hwc: true };                               // 设计文档约定的 [H, W, C]
}
function toCHW(M, X, n) {
  var g = M.g, d = g.C * g.H * g.W, out = new Float32Array(n * d), i, c, h, w;
  for (i = 0; i < n; i++) for (c = 0; c < g.C; c++) for (h = 0; h < g.H; h++) for (w = 0; w < g.W; w++) {
    var v = X[i * d + (g.hwc ? (h * g.W + w) * g.C + c : (c * g.H + h) * g.W + w)];
    out[i * d + (c * g.H + h) * g.W + w] = v === v ? (v - M.mu) / M.sd : 0;
  }
  return out;
}
function net(M, x) {
  var nn = M.nn, h = x;
  for (var i = 0; i < M.convs.length; i++) { h = nn.relu(M.convs[i].forward(h)); if (M.pools[i]) h = nn.maxPool2d(h, 2); }
  if (M.head === "gap") return M.lin[0].forward(nn.avgPoolGlobal(h));
  return M.lin[1].forward(nn.relu(M.lin[0].forward(nn.flatten(h))));
}
function forwardImgs(M, Zi, n) {
  var nn = M.nn, g = M.g, d = g.C * g.H * g.W, outs = [], k = 0, B = 256;
  for (var s = 0; s < n; s += B) {
    var e = Math.min(n, s + B), o = nn.noGrad(function () { return net(M, nn.tensor(Zi.subarray(s * d, e * d), [e - s, g.C, g.H, g.W])); });
    k = o.shape[1]; outs.push(o.data);
  }
  var all = new Float64Array(n * k), off = 0; outs.forEach(function (a) { all.set(a, off); off += a.length; });
  return all;
}
/* 数据增强：直接改这一批的像素（已标准化：原始值 x 翻号对应 z → −z − 2μ/σ） */
function augmentBatch(M, buf, b, kind, rng) {
  var g = M.g, d = g.C * g.H * g.W, H = g.H, W = g.W, tmp = new Float32Array(d), i, j, c, h, w;
  for (i = 0; i < b; i++) {
    var o = i * d;
    if (kind === "z2" && rng.u() < 0.5) { var sh = 2 * M.mu / M.sd; for (j = 0; j < d; j++) buf[o + j] = -buf[o + j] - sh; }
    else if (kind === "shift") {
      var dy = rng.int(H), dx = rng.int(W);
      for (c = 0; c < g.C; c++) for (h = 0; h < H; h++) for (w = 0; w < W; w++) tmp[(c * H + (h + dy) % H) * W + (w + dx) % W] = buf[o + (c * H + h) * W + w];
      buf.set(tmp, o);
    } else if (kind === "flip" && rng.u() < 0.5) {
      for (c = 0; c < g.C; c++) for (h = 0; h < H; h++) for (w = 0; w < W; w++) tmp[(c * H + h) * W + (W - 1 - w)] = buf[o + (c * H + h) * W + w];
      buf.set(tmp, o);
    }
  }
}
function fit(data, p, lib, ctx) {
  var nn = lib.nn, tr = data.train, va = data.valid, cls = data.kind === "classification", K = cls ? tr.k : 1, rng = lib.rng, n = tr.n, i, j;
  if (!nn) throw new Error("这个算法要用 lib.nn（自动求导库）。");
  var g = imgShape(tr), d = g.C * g.H * g.W, mu = 0, cnt = 0, sd = 0;
  if (d !== tr.d) throw new Error("图像形状 " + JSON.stringify(tr.shape) + " 与每行的长度 " + tr.d + " 不符。");
  for (i = 0; i < n * d; i++) { var v = tr.X[i]; if (v === v) { mu += v; cnt++; } }
  mu /= cnt || 1;
  for (i = 0; i < n * d; i++) { var v2 = tr.X[i]; if (v2 === v2) sd += (v2 - mu) * (v2 - mu); }
  sd = Math.sqrt(sd / (cnt || 1)) || 1;
  var M = { nn: nn, g: g, mu: mu, sd: sd, cls: cls, K: K, head: p.head, convs: [], pools: [], lin: [] };
  var chans = String(p.channels).split(",").map(function (s) { return Math.max(1, parseInt(s, 10) || 1); }), C = g.C, H = g.H, W = g.W, k = parseInt(p.ksize, 10) || 3;
  for (i = 0; i < chans.length; i++) {
    M.convs.push(nn.Conv2d(C, chans[i], k, rng, { pad: p.pad }));
    var pl = !!p.pool && H % 2 === 0 && W % 2 === 0 && H >= 4 && W >= 4;
    M.pools.push(pl); if (pl) { H /= 2; W /= 2; }
    C = chans[i];
  }
  if (p.head === "gap") M.lin.push(nn.Linear(C, cls ? K : 1, rng, "xavier"));
  else { M.lin.push(nn.Linear(C * H * W, 64, rng)); M.lin.push(nn.Linear(64, cls ? K : 1, rng, "xavier")); }
  var params = [];
  M.convs.forEach(function (L) { params.push(L.w, L.b); L.b.noDecay = true; });
  M.lin.forEach(function (L) { params.push(L.W, L.b); L.b.noDecay = true; });
  var opt = nn.adam(params, { lr: p.lr, weightDecay: p.wd });
  var Zi = toCHW(M, tr.X, n), Zv = toCHW(M, va.X, va.n), yst = cls ? { m: 0, s: 1 } : yStats(tr), yt = null;
  M.ym = yst.m; M.ys = yst.s;
  if (!cls) { yt = new Float32Array(n); for (i = 0; i < n; i++) yt[i] = (tr.y[i] - yst.m) / yst.s; }
  var bs = Math.max(1, Math.min(p.batch, n)), best = { loss: Infinity, ep: 0, saved: null }, ep, stop = false, step = 0;
  for (ep = 1; ep <= p.epochs && !stop; ep++) {
    var bl = nn.batches(n, bs, rng), sL = 0, sA = 0, cn = 0;
    for (var b = 0; b < bl.length; b++) {
      var idx = bl[b], m = idx.length, buf = new Float32Array(m * d);
      for (i = 0; i < m; i++) buf.set(Zi.subarray(idx[i] * d, idx[i] * d + d), i * d);
      if (p.augment !== "none") augmentBatch(M, buf, m, p.augment, rng);
      var out = net(M, nn.tensor(buf, [m, g.C, g.H, g.W])), loss = cls ? nn.crossEntropy(out, nn.pick(tr.y, idx)) : nn.mse(out, nn.pick(yt, idx));
      opt.zeroGrad(); loss.backward(); opt.step(); step++;
      sL += loss.data[0] * m; cn += m;
      if (cls) sA += batchAcc(out.data, nn.pick(tr.y, idx), m, K);
      if (ctx.timeLeft() < 0) { stop = true; ctx.log("时间到了：第 " + ep + " 轮没跑完就停了。"); break; }
    }
    var ev = scoreOut(forwardImgs(M, Zv, va.n), va.n, va, cls, K, M.ym, M.ys), tl = cls ? sL / cn : sL / cn * M.ys * M.ys;
    ctx.report(ep, { loss: tl, validLoss: ev.loss, trainMetric: cls ? sA / cn : tl, validMetric: ev.met });
    if (ev.loss < best.loss) best = { loss: ev.loss, ep: ep, saved: nn.saveParams(params) };
    else if (p.patience > 0 && ep - best.ep >= p.patience) { ctx.log("早停：验证损失在第 " + best.ep + " 轮之后 " + p.patience + " 轮没有变好。"); break; }
  }
  if (best.saved) nn.loadParams(params, best.saved);
  M.bestEpoch = best.ep; M.epochs = Math.min(ep, p.epochs); M.steps = step; M.size = nn.numParams(params); M.k = k; M.chans = chans;
  return M;
}
function predict(M, X, n) {
  var out = forwardImgs(M, toCHW(M, X, n), n);
  if (M.cls) return softmaxRows(out, n, M.K);
  var y = new Float64Array(n); for (var i = 0; i < n; i++) y[i] = out[i] * M.ys + M.ym;
  return y;
}
function inspect(M) {
  var layers = M.convs.map(function (L, i) { var s = L.w.shape; return { name: "第 " + (i + 1) + " 层卷积核（每行一个 " + s[2] + "×" + s[3] + " 的核：输出通道 × 输入通道 = " + s[0] + " × " + s[1] + "）", rows: s[0] * s[1], cols: s[2] * s[3], data: L.w.data }; });
  M.lin.forEach(function (L, i) { layers.push({ name: "读出第 " + (i + 1) + " 层 W（输入 × 输出）", rows: L.W.shape[0], cols: L.W.shape[1], data: L.W.data }); });
  return { layers: layers, text: "输入 " + M.g.C + "×" + M.g.H + "×" + M.g.W + "，卷积通道 " + M.chans.join(" → ") + "（" + M.k + "×" + M.k + "），读出 " + (M.head === "gap" ? "全局平均池化" : "全连接") + "，" + M.size + " 个参数。\n训练了 " + M.epochs + " 轮，用的是验证损失最好的第 " + M.bestEpoch + " 轮。" };
}
`),
  docs: md`
## 模型
输入是 $C\times H\times W$ 的图（单通道 $C=1$；伊辛、逾渗的格点也是图）。卷积层
$$(x*w)_{o,i,j}=b_o+\sum_{c}\sum_{u,v}w_{o,c,u,v}\,x_{c,\,i+u,\,j+v},$$
同一组权重在所有位置共享。边界用补零（输出与输入同尺寸）或周期边界（下标对 $H$、$W$ 取模，适合环面上的格点）。结构：$[\text{卷积}\to\mathrm{ReLU}\to(2\times2\text{ 最大池化})]\times L$，再接读出：全局平均池化（每个通道在整张图上取平均）$\to$ 线性层，或展平 $\to$ 64 个单元的全连接层 $\to$ 输出。

## 损失与训练
和多层感知机一样：交叉熵或均方误差，AdamW 小批量训练，每轮在验证集上评价，早停并退回验证损失最好的一轮。像素整体标准化（一个均值、一个标准差）。可选的数据增强在每个小批量上随机做：整体翻号 $\sigma\to-\sigma$、随机循环平移、左右翻转——**只有标签在这个变换下确实不变时才合理**。

## 参数怎么调
- 伊辛模型：周期边界 + 全局平均池化 + 整体翻号增强，是"把物理对称性写进网络"的组合；小网络（8 → 16 通道）就足够。
- 普通图像（手写数字、形状）：补零 + 展平读出往往更好（位置有意义）；形状数据打开"测试集换位置"时，全局平均池化的平移不变性就体现出来了。
- 逾渗：标签是非局部的（见那个数据集的定理），网络必须足够深、感受野要覆盖整个格子；浅网络 + 全局池化原则上学不会。
- 学习率 $10^{-3}$–$3\times10^{-3}$；轮数让早停去决定。

## 复杂度
一层卷积的前向是 $O(N\cdot C_{\text{out}}C_{\text{in}}k^2HW)$ 次乘加（$N$ 为批量），反向约两倍；池化让后面的层便宜 4 倍。参数个数 $\sum C_{\text{out}}C_{\text{in}}k^2$，与图像大小无关——这正是卷积相对全连接的优势（$16\times16$ 的图上，全连接到 64 个单元就要 $16\,384$ 个权重）。

## 什么时候好用、什么时候失效
数据有空间结构、局部模式可以出现在任何位置时（图像、格点上的场），卷积远比全连接网络省参数、泛化好。像素的排列没有意义时（打乱顺序的表格）它没有任何优势。它的感受野有限，判断非局部的性质（连通性、拓扑）需要很深的网络；最大池化让严格的平移等变只对偶数位移成立。

## 理论
**定理 1（平移等变与不变）.** 记 $\tau_a$ 为环面 $\mathbb Z_H\times\mathbb Z_W$ 上的平移：$(\tau_ax)_{c,i,j}=x_{c,\,i-a_1,\,j-a_2}$（下标取模）。对周期边界的卷积，$\tau_a(x)*w=\tau_a(x*w)$ 对一切 $a$ 成立；逐点的激活函数 $\sigma$ 满足 $\sigma(\tau_ax)=\tau_a\sigma(x)$；全局平均池化满足 $\mathrm{GAP}(\tau_ax)=\mathrm{GAP}(x)$。因此"周期卷积 + 逐点激活 + 全局平均池化 + 任意读出"的网络 $f$ 满足 $f(\tau_ax)=f(x)$。

*证明.* $(\tau_ax*w)_{o,i,j}=b_o+\sum_{c,u,v}w_{o,c,u,v}x_{c,\,i+u-a_1,\,j+v-a_2}=(x*w)_{o,\,i-a_1,\,j-a_2}$，即 $\tau_a(x*w)$。逐点运算显然与重排下标可交换。平均池化对所有位置求和，平移只是重排求和的次序。复合起来即得。$\square$
补零时，等式只在离边界超过 $\lfloor k/2\rfloor$ 的位置成立；步长为 2 的池化只与偶数位移可交换（等变性降到子群 $2\mathbb Z_H\times2\mathbb Z_W$ 上，要求 $H,W$ 为偶数）。

**命题 2（对称性增强）.** 若数据分布与标签都在变换群 $G$ 下不变（$gX\overset d=X$，$y(gX)=y(X)$），则对任意损失 $\ell$，$\mathbb E\,\ell(f(X),y)=\mathbb E\,\ell(f(gX),y)$；把训练样本随机地换成 $gX$ 不改变总体风险，只是让经验风险更接近"在 $G$-轨道上平均"的版本。伊辛模型在零外场下有 $\mathbb Z_2$ 对称 $\sigma\mapsto-\sigma$（哈密顿量 $-J\sum\sigma_i\sigma_j$ 不变），而"$T<T_c$"这个标签也不变，所以整体翻号增强是合理的；卷积网络并不自动具有这种对称性。

**感受野.** $L$ 层 $k\times k$ 卷积（步长 1）的感受野边长为 $1+L(k-1)$，每过一层 $2\times2$ 池化，后面各层的感受野再按 2 倍放大。读出之前的每个单元只依赖这么大的一块输入。

参考：Y. LeCun 等, Gradient-based learning applied to document recognition, *Proc. IEEE* 86 (1998)；T. Cohen, M. Welling, Group equivariant CNNs, *ICML* (2016)；J. Carrasquilla, R. Melko, Machine learning phases of matter, *Nature Physics* 13 (2017)。
`
});

add({
  id: "embmlp", name: "嵌入 + MLP（顿悟）", group: "neural", api: "supervised", kinds: ["classification", "regression"], families: ["toy"], needs: "tokens",
  summary: "每个词元一个可学的向量，拼起来过一个隐藏层：模加法上用大权重衰减长时间训练，能看到先记住、后顿悟。",
  params: [
    I("dim", "嵌入维数", 32, 2, 256, 1),
    I("hidden", "隐藏层宽度", 128, 8, 2048, 8),
    B("shared", "各位置共用一张嵌入表", true, "关掉则每个位置一张表（“模型内部”只画第一张）"),
    S("combine", "合并方式", "concat", [["concat", "拼接 [e_a, e_b]"], ["sum", "相加 e_a + e_b"]]),
    S("act", "激活函数", "relu", [["relu", "ReLU"], ["gelu", "GELU"], ["square", "x²（Gromov 2023 有解析解）"]]),
    N("lr", "学习率", 0.003, 0.0001, 0.03, 0.0001),
    N("wd", "权重衰减（AdamW）", 1, 0, 5, 0.01, "顿悟的关键：没有它，模型记住训练集之后就停在那里"),
    N("beta2", "Adam 的 β₂", 0.98, 0.9, 0.999, 0.001),
    I("batch", "小批量大小（0 = 整个训练集）", 512, 0, 16384, 1),
    I("steps", "最多训练几步", 100000, 10, 1000000, 10, "通常是时间预算先用完：顿悟往往要几千到几万步，把预算调到一两分钟")
  ],
  code: code(SN.base, SN.train, js`
/* ================= 嵌入 + MLP =================
 * 输入是 d 个位置上的词元编号（模加法里 d = 2：a 和 b）。每个词元查表得到一个 D 维向量 e_v；
 * 把各位置的向量拼接（或相加），过一个隐藏层，再线性地读出 p 个类别的 logits。
 * AdamW、很大的权重衰减、常数学习率（前 10 步线性预热）：Power 等（2022）的"顿悟"——训练准确率很早就到 100%，
 * 验证准确率却要很久以后才突然上升。评价的间隔会自动调整，让评价只花大约一成的时间。 */
function vocabOf(part) { var t = part.tokens; if (t == null) return 0; return typeof t === "number" ? t | 0 : t.vocab | 0; }
function columns(X, n, d, V) {   // 每个位置一列 Int32Array
  var cols = [], j, i;
  for (j = 0; j < d; j++) { var c = new Int32Array(n); for (i = 0; i < n; i++) { var v = X[i * d + j] | 0; c[i] = v >= 0 && v < V ? v : 0; } cols.push(c); }
  return cols;
}
function sub(cols, idx) { return cols.map(function (c) { var o = new Int32Array(idx.length); for (var i = 0; i < idx.length; i++) o[i] = c[idx[i]]; return o; }); }
function net(M, cols) {
  var nn = M.nn, es = cols.map(function (c, j) { return nn.embedding(M.tables[M.shared ? 0 : j].weight, c); }), h;
  if (M.combine === "sum") { h = es[0]; for (var j = 1; j < es.length; j++) h = nn.add(h, es[j]); }
  else h = es.length === 1 ? es[0] : nn.concat(es, 1);
  h = M.L1.forward(h);
  h = M.act === "square" ? nn.square(h) : M.act === "gelu" ? nn.gelu(h) : nn.relu(h);
  return M.L2.forward(h);
}
function outputs(M, cols, n) {
  var nn = M.nn, outs = [], k = 0, B = 4096;
  for (var s = 0; s < n; s += B) {
    var e = Math.min(n, s + B), part = cols.map(function (c) { return c.subarray(s, e); });
    var o = nn.noGrad(function () { return net(M, part); }); k = o.shape[1]; outs.push(o.data);
  }
  var all = new Float64Array(n * k), off = 0; outs.forEach(function (a) { all.set(a, off); off += a.length; });
  return all;
}
function fit(data, p, lib, ctx) {
  var nn = lib.nn, tr = data.train, va = data.valid, cls = data.kind === "classification", K = cls ? tr.k : 1, rng = lib.rng, n = tr.n, d = tr.d, V = vocabOf(tr), i;
  if (!nn) throw new Error("这个算法要用 lib.nn（自动求导库）。");
  if (!V) throw new Error("嵌入 + MLP 只适用于词元输入的数据（模加法、群乘法这一类）：这份数据没有 data.tokens。奇偶、集合函数这类数值输入请用多层感知机。");
  var M = { nn: nn, V: V, d: d, cls: cls, K: K, dim: p.dim, shared: !!p.shared, combine: p.combine, act: p.act, tables: [] };
  for (i = 0; i < (M.shared ? 1 : d); i++) M.tables.push(nn.Embedding(V, p.dim, rng));
  M.L1 = nn.Linear(M.combine === "sum" ? p.dim : d * p.dim, p.hidden, rng);
  M.L2 = nn.Linear(p.hidden, cls ? K : 1, rng, "xavier");
  var params = M.tables.map(function (t) { return t.weight; }).concat([M.L1.W, M.L1.b, M.L2.W, M.L2.b]);
  M.L1.b.noDecay = true; M.L2.b.noDecay = true;
  var opt = nn.adam(params, { lr: p.lr, beta1: 0.9, beta2: p.beta2, weightDecay: p.wd });
  var cols = columns(tr.X, n, d, V), colsV = columns(va.X, va.n, d, V), yst = cls ? { m: 0, s: 1 } : yStats(tr), yt = null;
  M.ym = yst.m; M.ys = yst.s;
  if (!cls) { yt = new Float32Array(n); for (i = 0; i < n; i++) yt[i] = (tr.y[i] - yst.m) / yst.s; }
  var full = !(p.batch > 0) || p.batch >= n, all = new Int32Array(n), queue = [], bcols = null, by = null;
  for (i = 0; i < n; i++) all[i] = i;
  if (full) { bcols = cols; by = cls ? tr.y : yt; }
  var evalEvery = 10, nextEval = 1, lastEval = 0, stepMs = 0, evalMs = 0, t0 = ctx.timeLeft(), step;
  function evaluate(st) {
    lastEval = st;
    var ta = ctx.timeLeft(), e1 = scoreOut(outputs(M, cols, n), n, tr, cls, K, M.ym, M.ys), e2 = scoreOut(outputs(M, colsV, va.n), va.n, va, cls, K, M.ym, M.ys), wn = 0;
    params.forEach(function (q) { for (var j = 0; j < q.size; j++) wn += q.data[j] * q.data[j]; });
    ctx.report(st, { loss: e1.loss, validLoss: e2.loss, trainMetric: e1.met, validMetric: e2.met, weightNorm: Math.sqrt(wn) });
    ctx.snapshot(st, M);
    evalMs = ta - ctx.timeLeft();
  }
  for (step = 1; step <= p.steps; step++) {
    if (!full) {
      if (!queue.length) queue = nn.batches(n, p.batch, rng);
      var idx = queue.pop(); bcols = sub(cols, idx); by = nn.pick(cls ? tr.y : yt, idx);
    }
    opt.lr = p.lr * Math.min(1, step / 10);
    var out = net(M, bcols), loss = cls ? nn.crossEntropy(out, by) : nn.mse(out, by);
    opt.zeroGrad(); loss.backward(); opt.step();
    if (step === nextEval) {
      stepMs = (t0 - ctx.timeLeft()) / step;
      evaluate(step);
      evalEvery = Math.max(1, Math.min(2000, Math.ceil(9 * evalMs / Math.max(stepMs, 1e-3))));
      nextEval = step + (step < 10 ? 1 : evalEvery);
    }
    if (ctx.timeLeft() < 0) { ctx.log("时间到了：训练了 " + step + " 步。"); break; }
  }
  M.steps = Math.min(step, p.steps);
  if (lastEval !== M.steps) evaluate(M.steps);
  M.size = nn.numParams(params);
  return M;
}
function predict(M, X, n) {
  var out = outputs(M, columns(X, n, M.d, M.V), n);
  if (M.cls) return softmaxRows(out, n, M.K);
  var y = new Float64Array(n); for (var i = 0; i < n; i++) y[i] = out[i] * M.ys + M.ym;
  return y;
}
function inspect(M) {
  var E = M.tables[0].weight, labels = [];
  for (var v = 0; v < M.V; v++) labels.push(String(v));
  var layers = [{ name: "隐藏层 W₁（输入 × 隐藏）", rows: M.L1.W.shape[0], cols: M.L1.W.shape[1], data: M.L1.W.data }, { name: "读出 W₂（隐藏 × 输出）", rows: M.L2.W.shape[0], cols: M.L2.W.shape[1], data: M.L2.W.data }];
  for (var j = 1; j < M.tables.length; j++) layers.push({ name: "第 " + (j + 1) + " 个位置的嵌入表（词元 × 维数）", rows: M.V, cols: M.dim, data: M.tables[j].weight.data });
  return { embedding: { rows: M.V, cols: M.dim, data: E.data, labels: labels }, layers: layers,
    text: "词表 " + M.V + "，嵌入 " + M.dim + " 维（" + (M.shared ? "各位置共用" : "每个位置一张表；这里画第一张") + "），" + (M.combine === "sum" ? "相加" : "拼接") + "后过 " + M.L1.W.shape[1] + " 个 " + M.act + " 单元；" + M.nn.numParams(M.tables.map(function (t) { return t.weight; }).concat([M.L1.W, M.L1.b, M.L2.W, M.L2.b])) + " 个参数" + (M.steps ? "，训练了 " + M.steps + " 步" : "") + "。" };
}
`),
  docs: md`
## 模型
词表 $\{0,\dots,V-1\}$，每个词元一个可学的向量 $e_v\in\mathbb R^D$（各位置共用一张表，或每个位置一张）。输入 $(a,b)$ 时
$$h=\sigma\big(W_1^\top[e_a;e_b]+b_1\big)\ \ (\text{或 }W_1^\top(e_a+e_b)+b_1),\qquad \text{logits}=W_2^\top h+b_2,$$
$\sigma$ 取 ReLU、GELU 或 $x^2$。输出是 $p$ 个类别的 softmax（回归时是一个数）。

## 损失与训练
交叉熵（回归是均方误差），**AdamW**，$\beta_2=0.98$，常数学习率（前 10 步线性预热），**很大的解耦权重衰减**（默认 1）；默认每步 512 个样本的小批量，批量设为 0 就是整个训练集（全批量）。训练一直进行到步数上限或时间预算用完。评价的间隔自动调整（每次评价全部训练集与验证集，大约只占一成的时间）；每次评价拍一张快照，"动画回放"里能看到嵌入的傅里叶谱怎样从一团噪声变成几个尖峰。曲线里还画了全部参数的 $\ell_2$ 范数（权重范数）。

## 参数怎么调
- 模 $p$ 加法（训练比例 0.3–0.6）上看顿悟：权重衰减 0.5–2、学习率 $10^{-3}$–$3\times10^{-3}$、预算一两分钟以上；权重衰减为 0 时，训练准确率到 100% 之后验证准确率一般不再上升。
- 训练比例越小，顿悟越晚（或者不发生）；$p$ 越大越慢。
- $x^2$ 激活配合拼接，对应 Gromov（2023）的可解模型；ReLU 更通用。
- 想先确认"能记住"：权重衰减设 0，训练准确率很快到 100%。

## 复杂度
每步前向加反向约 $3b\,(dD\cdot H+H\cdot k)$ 次乘加（$b$ 为批量，$H$ 为隐藏宽度，$k$ 为类别数），嵌入的查表与反向累加是 $O(bdD)$。参数个数 $VD+dDH+Hk$（共用表时）。

## 什么时候好用、什么时候失效
它是研究"小算法任务上的学习动力学"的标准小模型：模加法、群乘法这类输入是有限集合上的记号、输出是确定函数的问题。它对数值输入没有意义（这里会直接报错，请用多层感知机）；位置很多、需要比较远处记号的任务应该用注意力（Transformer）。顿悟依赖权重衰减、训练比例和训练时长，不是每次都会在预算内发生。

## 理论
**定义（顿悟）.** Power 等（2022）观察到：在模运算之类的小算法数据集上，训练准确率在 $10^2$–$10^3$ 步内达到 100%，而验证准确率要到 $10^4$–$10^5$ 步之后才在很短的时间内从接近随机跳到接近 100%。权重衰减越大、训练比例越大，跳变来得越早。

**定理 1（模加法的傅里叶解，精确陈述）.** 设 $p$ 为素数，$\varnothing\ne\mathcal K\subseteq\{1,\dots,\frac{p-1}2\}$，$\omega_k=2\pi k/p$。定义
$$L(a,b,c)=\sum_{k\in\mathcal K}\cos\big(\omega_k(a+b-c)\big),\qquad a,b,c\in\mathbb Z_p .$$
则对每个 $(a,b)$，$c\mapsto L(a,b,c)$ 在 $c\equiv a+b\pmod p$ 处取到唯一的最大值 $|\mathcal K|$。

*证明.* 每一项 $\le1$，等号成立当且仅当 $k(a+b-c)\equiv0\pmod p$；因为 $p$ 是素数且 $0<k<p$，这等价于 $c\equiv a+b$。所以 $c\equiv a+b$ 时 $L=|\mathcal K|$，其余 $c$ 至少有一项严格小于 1。$\square$

**命题 2（一个隐藏层就能精确实现它）.** 取嵌入 $e_v=(\cos\omega_kv,\sin\omega_kv)_{k\in\mathcal K}\in\mathbb R^{2|\mathcal K|}$，激活 $\sigma(t)=t^2$，拼接 $[e_a;e_b]$。由
$$\cos\omega_k(a+b-c)=\cos\omega_k(a+b)\cos\omega_kc+\sin\omega_k(a+b)\sin\omega_kc,$$
$\cos\omega_k(a+b)=\cos\omega_ka\cos\omega_kb-\sin\omega_ka\sin\omega_kb$、$\sin\omega_k(a+b)=\sin\omega_ka\cos\omega_kb+\cos\omega_ka\sin\omega_kb$，以及极化恒等式 $xy=\frac14[(x+y)^2-(x-y)^2]$，每个乘积 $x_ay_b$ 用两个隐藏单元（输入权重分别取 $x_a+y_b$、$x_a-y_b$ 的系数）表示，于是宽度 $8|\mathcal K|$ 的隐藏层加上线性读出 $W_2$（第 $c$ 列由 $\cos\omega_kc,\sin\omega_kc$ 组成）恰好输出 $L(a,b,\cdot)$。这说明"嵌入是低频傅里叶基、隐藏层做乘法"的解在这个模型族里，且只需要很少的参数；Nanda 等（2023）在训练好的网络里实际看到了这种结构（嵌入的傅里叶谱集中在少数频率上）。

**为什么权重衰减有用（启发式，不是定理）.** 记住训练集的解需要的权重范数随训练集大小增长，而上面的傅里叶解的范数与训练集无关；在"拟合训练集"的约束下，权重衰减偏好范数小的解。Liu 等（2022）用"损失 vs 权重范数"的图景解释了顿悟的时间尺度；严格的动力学分析目前只在简化模型里有。

参考：A. Power 等, Grokking: generalization beyond overfitting on small algorithmic datasets (2022)；N. Nanda 等, Progress measures for grokking via mechanistic interpretability, *ICLR* (2023)；A. Gromov, Grokking modular arithmetic (2023)；Z. Liu 等, Omnigrok, *ICLR* (2023)。
`
});

/* ================================================================== *
 *  时间序列预测：基线
 * ================================================================== */
add({
  id: "snaive", name: "季节朴素", group: "baseline", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "用上一个季节同一时刻的值作预测；没有季节时就是“用最后一个值”。",
  params: [I("m", "季节长度 m（0 = 用数据自带的）", 0, 0, 400, 1, "数据没有季节、这里又是 0 时退化成朴素预测")],
  code: js`
/* ================= 季节朴素 =================
 * ŷ_{t+h} = y_{t+h−m·⌈h/m⌉}：往前跳整数个季节，落到已经观测到的最近一个"同一相位"的时刻。m = 1 就是朴素预测 ŷ = y_t。 */
function fit(series, p, lib, ctx) {
  var m = p.m > 0 ? p.m : (series.season | 0);
  if (!(m >= 1)) { m = 1; ctx.log("数据没有给出季节长度：退化成朴素预测（用最后一个值）。"); }
  return { m: m, size: 0 };
}
function forecast(M, past, h) {
  var t = past.length - 1, m = M.m, out = new Float64Array(h);
  for (var s = 1; s <= h; s++) { var j = t + s - m * Math.ceil(s / m); out[s - 1] = j >= 0 ? past[j] : past[t]; }
  return out;
}
function inspect(M) { return { text: "季节长度 m = " + M.m + "：预测 y_{t+h} 用 y_{t+h−m·⌈h/m⌉}。" }; }
`,
  docs: md`
## 模型
$$\hat y_{t+h\mid t}=y_{t+h-m\lceil h/m\rceil},$$
即往回跳整数个季节，取最近一个处于同一相位的观测。$m$ 为季节长度（默认用数据自带的，比如月度数据的 12）；$m=1$ 时就是朴素预测 $\hat y_{t+h\mid t}=y_t$（运行器自带的基线）。

## 损失与训练
没有参数，不训练。

## 参数怎么调
只有 $m$。季节长度设错时（比如把周数据当成月数据），它会比朴素预测还差。

## 复杂度
每个预测 $O(1)$。

## 什么时候好用、什么时候失效
季节模式强、而且年与年之间的水平变化不大时，它是很难打败的基线——所有季节模型都应该先和它比。有趋势时它系统性地滞后一个季节的趋势量；季节形状缓慢变化时它很快适应（只看上一季），但也把上一季的噪声原样带进预测。

## 理论
**命题 1（季节随机游走下最优）.** 若 $y_t=y_{t-m}+\varepsilon_t$，$\varepsilon_t$ 独立于过去、均值为 0，则对 $1\le h\le m$，$\mathbb E[y_{t+h}\mid y_{\le t}]=y_{t+h-m}$，季节朴素就是平方损失下的最优预测。

*证明.* $y_{t+h}=y_{t+h-m}+\varepsilon_{t+h}$，$h\le m$ 时 $y_{t+h-m}$ 已经观测到，而 $\mathbb E[\varepsilon_{t+h}\mid y_{\le t}]=0$。最优性由"条件期望在平方损失下最优"得到。$\square$

**命题 2（确定性季节加白噪声时的代价）.** 若 $y_t=s_t+\varepsilon_t$，$s_{t+m}=s_t$，$\varepsilon_t$ 独立同分布、方差 $\sigma^2$，则季节朴素的均方误差是 $\mathbb E(y_{t+h}-y_{t+h-m})^2=2\sigma^2$（$h\le m$），而知道 $s$ 的最优预测是 $\sigma^2$：它多付出一倍的噪声，因为它把上一季的噪声也当成了信号。估计出平滑的季节项（指数平滑、带季节项的模型）可以把这部分省下来。

*证明.* $y_{t+h}-y_{t+h-m}=\varepsilon_{t+h}-\varepsilon_{t+h-m}$，两项独立，方差相加。$\square$

参考：R. J. Hyndman, G. Athanasopoulos,《Forecasting: Principles and Practice》第 3 版，§5.2。
`
});

add({
  id: "drift", name: "漂移法", group: "baseline", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "最后一个值加上平均每步的变化 × 步数：带漂移的随机游走的最优预测。",
  params: [I("window", "估计漂移用最近多少步（0 = 全部）", 0, 0, 100000, 1)],
  code: js`
/* ================= 漂移法 =================
 * ŷ_{t+h} = y_t + h·(y_t − y_{t−w})/w：画一条连接 y_{t−w} 和 y_t 的直线再延长。w = 0 表示用全部历史。 */
function fit(series, p, lib, ctx) { return { w: p.window | 0, size: 1 }; }
function forecast(M, past, h) {
  var t = past.length - 1, w = M.w > 0 ? Math.min(M.w, t) : t, slope = w > 0 ? (past[t] - past[t - w]) / w : 0, out = new Float64Array(h);
  for (var s = 1; s <= h; s++) out[s - 1] = past[t] + s * slope;
  return out;
}
function inspect(M) { return { text: "漂移 = (y_t − y_{t−w}) / w，" + (M.w > 0 ? "w = " + M.w : "w = 全部历史") + "。" }; }
`,
  docs: md`
## 模型
$$\hat y_{t+h\mid t}=y_t+h\,\hat\mu_t,\qquad \hat\mu_t=\frac{y_t-y_{t-w}}{w},$$
$w$ 默认取全部历史（$w=t$）。$\hat\mu_t$ 就是最近 $w$ 个增量 $\Delta y$ 的平均。

## 损失与训练
没有需要拟合的东西；"估计"在每个预测原点上现算。

## 参数怎么调
窗口 $w$：全部历史最稳；漂移会变时用较短的窗口，但估计的方差变大（见下面的公式）。

## 复杂度
每个预测 $O(h)$。

## 什么时候好用、什么时候失效
对有稳定增长趋势的随机游走式序列（指数、累计量的对数）是很好的基线。序列均值回复（平稳）时它比朴素预测更差：它把随机的起伏当成趋势外推。漂移本身在变时，用全部历史会滞后。

## 理论
**命题（带漂移的随机游走）.** 设 $y_s=y_{s-1}+\mu+\varepsilon_s$，$\varepsilon_s$ 独立同分布 $N(0,\sigma^2)$。则：(i) 给定 $y_0,\dots,y_t$，$\mu$ 的最大似然估计是 $\hat\mu=\frac{y_t-y_0}t$；(ii) 用 $\hat y_{t+h}=y_t+h\hat\mu$ 预测，均方误差是
$$\mathbb E\big(y_{t+h}-\hat y_{t+h}\big)^2=h\sigma^2+\frac{h^2\sigma^2}t .$$

*证明.* (i) 增量 $\Delta y_s=\mu+\varepsilon_s$ 是独立同分布的正态样本，似然在样本均值 $\frac1t\sum_{s=1}^t\Delta y_s=\frac{y_t-y_0}t$ 处最大。(ii) $y_{t+h}-\hat y_{t+h}=\sum_{j=1}^h\varepsilon_{t+j}-h(\hat\mu-\mu)$，而 $\hat\mu-\mu=\frac1t\sum_{s\le t}\varepsilon_s$。两部分独立，方差分别是 $h\sigma^2$ 与 $h^2\sigma^2/t$。$\square$
第一项是不可约的（即使知道 $\mu$ 也躲不开），第二项来自估计漂移：$h$ 大、历史短时它占主导。

参考：Hyndman–Athanasopoulos《Forecasting: Principles and Practice》§5.2、§9.1。
`
});

/* ================================================================== *
 *  时间序列模型
 * ================================================================== */
add({
  id: "ar", name: "自回归 AR(p)", group: "ts", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "y_t 对自己的前 p 个值做最小二乘；按 AIC / BIC 选阶数，可以先差分（ARI），并检查平稳性。",
  params: [
    I("pmax", "最大阶数", 12, 1, 60, 1),
    S("crit", "选阶", "aic", [["aic", "AIC"], ["bic", "BIC"], ["fixed", "固定用最大阶数"]]),
    S("diff", "差分次数 d", "auto", [["auto", "自动（按验证集在 0、1 里选）"], ["0", "0（原序列）"], ["1", "1（一阶差分）"], ["2", "2"]]),
    B("sdiff", "先做一次季节差分", false, "y_t − y_{t−m}，m 为数据的季节长度"),
    B("intercept", "带常数项", true)
  ],
  code: code(SN.base, SN.chol, js`
/* ================= 自回归 AR(p)（可先差分：ARI） =================
 * 先把序列差分成 w（可选：季节差分 y_t − y_{t−m}，再做 d 次一阶差分），然后
 * w_t = c + φ_1 w_{t−1} + … + φ_p w_{t−p} + ε_t，用最小二乘估计。所有阶数都在同一段样本上拟合，AIC / BIC 才可比。
 * 预测：在 w 上递推 h 步，再逐层积分回原序列。 */
function diffSeq(y, lag) { var o = []; for (var i = lag; i < y.length; i++) o.push(y[i] - y[i - lag]); return o; }
function transform(y, M) { var w = Array.prototype.slice.call(y); M.ops.forEach(function (lag) { w = diffSeq(w, lag); }); return w; }
function fitAR(w, pmax, crit, icpt, ctx) {
  var N = w.length, P = Math.max(0, Math.min(pmax, Math.floor((N - 10) / 3))), q = P + 1, rows = N - P, G = new Float64Array(q * q), b = new Float64Array(q), yy = 0, t, i, j;
  if (rows < 5) return { phi: new Float64Array(0), c: 0, p: 0, s2: 1, table: [] };
  var x = new Float64Array(q);
  for (t = P; t < N; t++) {
    x[0] = 1; for (i = 1; i <= P; i++) x[i] = w[t - i];
    for (i = 0; i < q; i++) { b[i] += x[i] * w[t]; for (j = 0; j < q; j++) G[i * q + j] += x[i] * x[j]; }
    yy += w[t] * w[t];
  }
  var best = null, table = [];
  for (var p = 0; p <= P; p++) {
    var idx = []; if (icpt) idx.push(0); for (i = 1; i <= p; i++) idx.push(i);
    var k = idx.length, beta = new Float64Array(k), sse = yy;
    if (k) {
      var A = new Float64Array(k * k), r = new Float64Array(k);
      for (i = 0; i < k; i++) { r[i] = b[idx[i]]; for (j = 0; j < k; j++) A[i * k + j] = G[idx[i] * q + idx[j]]; }
      for (i = 0; i < k; i++) A[i * k + i] += 1e-10 * (A[i * k + i] + 1);
      beta = cholSolve(cholFactor(A, k), r, k);
      for (i = 0; i < k; i++) sse -= beta[i] * r[i];
    }
    var s2 = Math.max(sse / rows, 1e-300), aic = rows * Math.log(s2) + 2 * k, bic = rows * Math.log(s2) + Math.log(rows) * k;
    table.push({ p: p, s2: s2, aic: aic, bic: bic });
    if (ctx) ctx.report(p, { loss: s2, aic: aic, bic: bic });
    var score = crit === "bic" ? bic : crit === "fixed" ? (p === P ? -Infinity : Infinity) : aic;
    if (!best || score < best.score) { var phi = new Float64Array(p); for (i = 0; i < p; i++) phi[i] = beta[(icpt ? 1 : 0) + i]; best = { score: score, p: p, phi: phi, c: icpt ? beta[0] : 0, s2: s2 }; }
  }
  best.table = table;
  return best;
}
function fit(series, p, lib, ctx) {
  var y = series.y, m = series.season | 0, ops0 = [];
  if (p.sdiff) { if (m >= 2) ops0.push(m); else ctx.log("数据没有季节长度，跳过季节差分。"); }
  function build(d, report) {
    var M = { ops: ops0.slice(), d: d, m: m, icpt: !!p.intercept };
    for (var q = 0; q < d; q++) M.ops.push(1);
    var A = fitAR(transform(y, M), p.pmax, p.crit, M.icpt, report ? ctx : null);
    M.phi = A.phi; M.c = A.c; M.p = A.p; M.s2 = A.s2; M.table = A.table;
    M.need = M.p + M.ops.reduce(function (s, l) { return s + l; }, 0) + 1;
    return M;
  }
  var M;
  if (p.diff === "auto") {
    // 在 0 和 1 里选：验证段上一步预测的均方误差小的那个（验证集只用来选）
    var full = new Float64Array(y.length + series.valid.y.length); full.set(y); full.set(series.valid.y, y.length);
    var best = null;
    [0, 1].forEach(function (d) {
      var Mc = build(d, false), se = 0, cnt = 0;
      for (var t = y.length - 1; t < full.length - 1; t++) { var f = forecast(Mc, full.subarray(0, t + 1), 1)[0]; se += (f - full[t + 1]) * (f - full[t + 1]); cnt++; }
      ctx.log("差分 d = " + d + "：AR(" + Mc.p + ")，验证段一步预测的均方误差 " + (se / cnt).toPrecision(4));
      if (!best || se < best.se) best = { se: se, d: d };
    });
    M = build(best.d, true);
  } else M = build(parseInt(p.diff, 10) || 0, true);
  M.maxRoot = maxRoot(M.phi);
  M.size = M.p + (M.icpt ? 1 : 0) + 1;
  return M;
}
/* 递推 + 积分：lv[0] 是原序列的尾巴，lv[i+1] 是 lv[i] 做第 i 次差分的结果 */
function forecast(M, past, h) {
  var n0 = past.length, out = new Float64Array(h), s, i;
  if (n0 < M.need + 1) { for (s = 0; s < h; s++) out[s] = past[n0 - 1]; return out; }
  var lv = [Array.prototype.slice.call(past, n0 - M.need - 1)];
  M.ops.forEach(function (lag) { lv.push(diffSeq(lv[lv.length - 1], lag)); });
  var top = lv[lv.length - 1], lens = lv.map(function (a) { return a.length; });
  for (s = 0; s < h; s++) { var v = M.c, L = top.length; for (i = 0; i < M.p; i++) v += M.phi[i] * top[L - 1 - i]; top.push(v); }
  for (var k = lv.length - 2; k >= 0; k--) {
    var lag = M.ops[k], Li = lens[k], up = lv[k + 1], cur = lv[k];
    for (s = 0; s < h; s++) cur.push(up[Li - lag + s] + cur[Li - lag + s]);
  }
  for (s = 0; s < h; s++) out[s] = lv[0][lens[0] + s];
  return out;
}
/* 特征根：z^p − φ₁z^{p−1} − … − φ_p 的根（Durand–Kerner 迭代），返回最大的模；全部小于 1 ⇔ 平稳 */
function maxRoot(phi) {
  var p = phi.length, re = [], im = [], i, j, k, it;
  if (!p) return 0;
  var R = 1; for (i = 0; i < p; i++) R = Math.max(R, 1 + Math.abs(phi[i]));
  for (i = 0; i < p; i++) { var ang = 2 * Math.PI * i / p + 0.4; re.push(R * Math.cos(ang)); im.push(R * Math.sin(ang)); }
  for (it = 0; it < 1000; it++) {
    var ch = 0;
    for (i = 0; i < p; i++) {
      var pr = 1, pi = 0;
      for (k = 0; k < p; k++) { var nr = pr * re[i] - pi * im[i] - phi[k], ni = pr * im[i] + pi * re[i]; pr = nr; pi = ni; }
      var dr = 1, di = 0;
      for (j = 0; j < p; j++) if (j !== i) { var ar = re[i] - re[j], ai = im[i] - im[j], tr = dr * ar - di * ai; di = dr * ai + di * ar; dr = tr; }
      var den = dr * dr + di * di || 1e-300, qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
      re[i] -= qr; im[i] -= qi; ch = Math.max(ch, Math.abs(qr) + Math.abs(qi));
    }
    if (ch < 1e-12) break;
  }
  var mx = 0; for (i = 0; i < p; i++) mx = Math.max(mx, Math.sqrt(re[i] * re[i] + im[i] * im[i]));
  return mx;
}
function inspect(M) {
  var coef = [];
  if (M.icpt) coef.push({ name: "常数 c", value: M.c });
  for (var i = 0; i < M.p; i++) coef.push({ name: "φ" + (i + 1), value: M.phi[i] });
  var tr = M.ops.map(function (l) { return l === 1 ? "Δ" : "Δ_" + l; }).join("");
  return { coef: coef, text: "AR(" + M.p + ")，作用在 " + (tr ? tr + "y" : "原序列") + " 上；残差方差 " + M.s2.toPrecision(4) + "。\n特征根的最大模 " + M.maxRoot.toFixed(4) + (M.maxRoot < 1 ? "（< 1：拟合出的模型是平稳的）" : "（≥ 1：拟合出的模型不平稳，长期预测会发散；试试差分）") };
}
`),
  docs: md`
## 模型
先把序列变换成 $w$：可选的季节差分 $y_t-y_{t-m}$，再做 $d$ 次一阶差分 $\Delta y_t=y_t-y_{t-1}$。然后
$$w_t=c+\phi_1w_{t-1}+\dots+\phi_pw_{t-p}+\varepsilon_t,\qquad\varepsilon_t\ \text{白噪声}.$$
$d\ge1$ 时就是 ARI$(p,d)$（ARIMA 没有移动平均项的情形）。多步预测：在 $w$ 上递推（未来的 $\varepsilon$ 取 0），再逐层累加回原序列。

## 损失与训练
最小二乘（条件最大似然）：在同一段样本 $t=P,\dots,N-1$ 上（$P$ 为最大阶数），对每个 $p=0,\dots,P$ 解正规方程，按
$$\mathrm{AIC}(p)=N'\log\hat\sigma_p^2+2k,\qquad \mathrm{BIC}(p)=N'\log\hat\sigma_p^2+k\log N'$$
选阶（$k$ 为系数个数，$N'$ 为样本数）。差分次数选"自动"时，分别用 $d=0,1$ 拟合，取验证段上一步预测均方误差小的那个。学习曲线的横轴是阶数 $p$，画出残差方差和 AIC / BIC。最后用 Durand–Kerner 迭代求特征根，检查平稳性。

## 参数怎么调
- AR(2) 之类的平稳序列：$d=0$，AIC 通常选对或略高。随机游走、带趋势的序列：$d=1$。
- 季节性强时，打开季节差分，或者把最大阶数设到至少一个季节长度。
- BIC 罚得更重，选出的阶数更小（样本大时更接近真阶数）；AIC 更偏向预测精度。

## 复杂度
拟合 $O(NP^2+P^4)$（$P$ 个阶数各解一次小方程组），预测每个原点 $O(h\,p)$。

## 什么时候好用、什么时候失效
线性、平稳（或差分后平稳）的序列上，它是最优或接近最优的；AR(2) 数据上应当接近 oracle。非线性动力学（Logistic 映射、洛伦兹系统）它只能抓住线性自相关；机制切换和波动聚集（GARCH）它看不见；长期预测会回到均值（平稳时）或沿最后的趋势走（差分时）。

## 理论
**定理 1（平稳性与因果解）.** 设 $\varepsilon_t$ 是方差 $\sigma^2$ 的白噪声，$\phi(z)=1-\phi_1z-\dots-\phi_pz^p$。方程 $\phi(B)(y_t-\mu)=\varepsilon_t$（$B$ 为滞后算子）有平稳的因果解 $y_t=\mu+\sum_{j\ge0}\psi_j\varepsilon_{t-j}$（$\sum|\psi_j|<\infty$），当且仅当 $\phi(z)\ne0$ 对一切 $|z|\le1$ 成立；此时解唯一，$\psi$ 由 $\sum_j\psi_jz^j=1/\phi(z)$ 给出。等价地，$z^p-\phi_1z^{p-1}-\dots-\phi_p$ 的根（"逆根"，即伴随矩阵的特征值）的模都小于 1——"模型内部"里报告的就是它们的最大模。

*证明梗概.* $\phi$ 在闭单位圆盘上没有零点时，$1/\phi(z)$ 在半径略大于 1 的圆盘上解析，其幂级数系数指数衰减，于是 $\sum\psi_j\varepsilon_{t-j}$ 在 $L^2$ 中收敛，且满足方程。反之，若有 $|z_0|\le1$ 的根，可以构造出与之矛盾的谱密度（谱密度 $\sigma^2/(2\pi|\phi(e^{-i\lambda})|^2)$ 在 $|z_0|=1$ 时不可积）；$|z_0|<1$ 时解存在但依赖未来，不是因果的。$\square$

**定理 2（Yule–Walker 方程）.** 在定理 1 的因果平稳情形下，记 $\gamma(h)=\operatorname{Cov}(y_t,y_{t-h})$，则
$$\gamma(h)=\sum_{i=1}^p\phi_i\gamma(h-i)\ \ (h\ge1),\qquad \gamma(0)=\sum_{i=1}^p\phi_i\gamma(i)+\sigma^2 .$$

*证明.* 中心化后把 $y_t=\sum_i\phi_iy_{t-i}+\varepsilon_t$ 两边乘以 $y_{t-h}$ 取期望。因果性给出 $y_{t-h}$ 只依赖 $\varepsilon_{t-h},\varepsilon_{t-h-1},\dots$，所以 $h\ge1$ 时 $\mathbb E[\varepsilon_ty_{t-h}]=0$；$h=0$ 时 $\mathbb E[\varepsilon_ty_t]=\sigma^2$。$\square$
$p$ 个方程 $h=1,\dots,p$ 用样本自协方差解出的 $\hat\phi$ 就是 Yule–Walker 估计；它与这里的最小二乘估计渐近等价，二者都满足 $\sqrt N(\hat\phi-\phi)\Rightarrow N(0,\sigma^2\Gamma_p^{-1})$，$\Gamma_p=[\gamma(i-j)]_{i,j=1}^p$（Mann–Wald 1943）。

**选阶.** 若真模型是 AR$(p_0)$ 且最大阶数 $P\ge p_0$：BIC 选出的阶数以概率 1 收敛到 $p_0$（相合）；AIC 不相合——以正的概率选得过大（Shibata 1976），但它在"预测误差"意义下是渐近有效的。

参考：P. Brockwell, R. Davis,《Time Series: Theory and Methods》第 2 版（Springer, 1991）§3.1、§8.1–8.2；R. Shibata, *Biometrika* 63 (1976)；Hyndman–Athanasopoulos §9。
`
});

add({
  id: "ets", name: "指数平滑（Holt–Winters）", group: "ts", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "水平、趋势、季节三个分量各自按指数加权更新；平滑系数按一步预测误差最小来选，可以自动挑模型。",
  params: [
    S("type", "模型", "auto", [["auto", "自动（按 AIC 在下面几种里选）"], ["simple", "简单指数平滑（只有水平）"], ["holt", "Holt（水平 + 趋势）"], ["season", "水平 + 季节"], ["hw", "Holt–Winters（水平 + 趋势 + 季节）"]]),
    B("damped", "阻尼趋势", false, "趋势每步乘以 φ < 1，长期预测趋于平坦；“自动”时阻尼与否都会试"),
    I("m", "季节长度 m（0 = 用数据自带的）", 0, 0, 400, 1)
  ],
  code: code(SN.nm, js`
/* ================= 指数平滑（加法误差、加法趋势可阻尼、加法季节） =================
 * 一步预测 ŷ_t = ℓ + φb + s_{t−m}，误差 e = y_t − ŷ_t，然后
 *   ℓ ← ℓ + φb + αe，  b ← φb + αβe，  s_t ← s_{t−m} + γe。
 * 这和教科书上 "ℓ_t = α(y_t − s_{t−m}) + (1−α)(ℓ_{t−1} + φb_{t−1})" 的写法完全等价（代进去展开即可）。
 * 平滑系数 α、β、γ、φ 用 Nelder–Mead 最小化训练段上一步预测误差的平方和；初始状态用前两个季节的平均粗略估计。
 * 状态的历史全部记下来：滚动预测时，任何一个过去的原点都可以直接从那一刻的状态出发。 */
function sig(u) { return 1 / (1 + Math.exp(-u)); }
function initState(y, kind, m) {
  var T = y.length, l, b = 0, s = [], j;
  if (kind.season) {
    var a1 = 0, a2 = 0; for (j = 0; j < m; j++) { a1 += y[j] / m; a2 += y[j + m] / m; }
    if (kind.trend) b = (a2 - a1) / m;
    for (j = 0; j < m; j++) s.push(y[j] - (a1 + (j - (m - 1) / 2) * b));
    var ms = 0; for (j = 0; j < m; j++) ms += s[j] / m; for (j = 0; j < m; j++) s[j] -= ms;
    l = a1 - (m + 1) / 2 * b;
  } else {
    var k = Math.min(10, T - 1); if (kind.trend) b = (y[k] - y[0]) / k;
    l = y[0] - b; s = [0]; m = 1;
  }
  return { l: l, b: b, s: s };
}
function unpack(u, kind) {
  var i = 0, a = sig(u[i++]), par = { a: a, b: 0, g: 0, phi: 1 };
  if (kind.trend) par.b = sig(u[i++]);
  if (kind.season) par.g = (1 - a) * sig(u[i++]);
  if (kind.damped) par.phi = 0.8 + 0.18 * sig(u[i++]);
  return par;
}
/* 跑一遍递推，返回误差平方和；rec 给了就把每一步的状态记进去 */
function run(par, y, kind, m, st, rec) {
  var l = st.l, b = st.b, ring = st.s.slice(), sse = 0, mm = kind.season ? m : 1;
  for (var t = 0; t < y.length; t++) {
    var sj = t % mm, sv = kind.season ? ring[sj] : 0, yh = l + par.phi * b + sv, e = y[t] - yh;
    sse += e * e;
    var ln = l + par.phi * b + par.a * e;
    b = par.phi * b + par.a * par.b * e;
    l = ln;
    if (kind.season) ring[sj] = sv + par.g * e;
    if (rec) { rec.L.push(l); rec.B.push(b); rec.S.push(kind.season ? ring[sj] : 0); }
  }
  return sse;
}
function fit(series, p, lib, ctx) {
  var y = series.y, T = y.length, m = p.m > 0 ? p.m : (series.season | 0), cands = [], canSeason = m >= 2 && T >= 2 * m + 4;
  function K(trend, season, damped, name) { return { trend: trend, season: season, damped: damped && trend, name: name }; }
  if (p.type === "auto") {
    cands.push(K(false, false, false, "简单指数平滑"), K(true, false, false, "Holt"), K(true, false, true, "Holt（阻尼）"));
    if (canSeason) cands.push(K(false, true, false, "水平 + 季节"), K(true, true, false, "Holt–Winters"), K(true, true, true, "Holt–Winters（阻尼）"));
  } else {
    var tr = p.type === "holt" || p.type === "hw", se = p.type === "season" || p.type === "hw";
    if (se && !canSeason) { ctx.log("没有可用的季节长度（或序列短于两个季节）：去掉季节项。"); se = false; }
    cands.push(K(tr, se, !!p.damped, p.type));
  }
  var best = null;
  cands.forEach(function (kind, ci) {
    if (best && ctx.timeLeft() < 0) return;
    var st = initState(y, kind, m), k0 = 1 + (kind.trend ? 1 : 0) + (kind.season ? 1 : 0) + (kind.damped ? 1 : 0);
    var u0 = [-0.85, -2, -2, 0].slice(0, k0);
    var r = nelderMead(function (u) { return run(unpack(u, kind), y, kind, m, st, null); }, u0, { step: 1, maxIter: 300 * k0, tol: 1e-10 });
    var nInit = 1 + (kind.trend ? 1 : 0) + (kind.season ? m - 1 : 0), aic = T * Math.log(Math.max(r.f / T, 1e-300)) + 2 * (k0 + nInit);
    ctx.report(ci, { loss: r.f / T, aic: aic });
    ctx.log(kind.name + "：一步误差的均方 " + (r.f / T).toPrecision(4) + "，AIC " + aic.toFixed(1));
    if (!best || aic < best.aic) best = { aic: aic, kind: kind, par: unpack(r.x, kind), st: st, mse: r.f / T };
  });
  var M = { kind: best.kind, par: best.par, m: best.kind.season ? m : 1, init: best.st, aic: best.aic, mse: best.mse, L: [], B: [], S: [] };
  run(M.par, y, M.kind, m, M.init, M);
  M.size = 4 + M.m;
  return M;
}
/* 时刻 t 的状态：水平、趋势、最近 m 个季节分量（按时间从早到晚） */
function stateAt(M, past, t) {
  var m = M.m, n = M.L.length, ring = new Float64Array(m), j;
  function seasAt(tau) { return tau >= 0 ? M.S[tau] : M.init.s[tau + m]; }
  if (t < n) { for (j = 0; j < m; j++) ring[j] = seasAt(t - m + 1 + j); return { l: M.L[t], b: M.B[t], ring: ring }; }
  // 比记下的历史还新（没有通过 update 喂进来）：从最后一个状态接着递推，不改动模型
  var l = M.L[n - 1], b = M.B[n - 1], par = M.par;
  for (j = 0; j < m; j++) ring[j] = seasAt(n - m + j);
  for (var u = n; u <= t; u++) {
    var sv = M.kind.season ? ring[0] : 0, e = past[u] - (l + par.phi * b + sv), ln = l + par.phi * b + par.a * e;
    b = par.phi * b + par.a * par.b * e; l = ln;
    for (j = 0; j < m - 1; j++) ring[j] = ring[j + 1];
    ring[m - 1] = M.kind.season ? sv + par.g * e : 0;
  }
  return { l: l, b: b, ring: ring };
}
function forecast(M, past, h) {
  var t = past.length - 1, st = stateAt(M, past, t), out = new Float64Array(h), damp = 0, ph = 1;
  for (var s = 1; s <= h; s++) { ph *= M.par.phi; damp += ph; out[s - 1] = st.l + damp * st.b + (M.kind.season ? st.ring[(s - 1) % M.m] : 0); }
  return out;
}
function update(M, yNew) {
  var n = M.L.length, m = M.m, par = M.par, l = M.L[n - 1], b = M.B[n - 1], tau = n - m, sv = M.kind.season ? (tau >= 0 ? M.S[tau] : M.init.s[tau + m]) : 0;
  var e = yNew - (l + par.phi * b + sv);
  M.L.push(l + par.phi * b + par.a * e); M.B.push(par.phi * b + par.a * par.b * e); M.S.push(M.kind.season ? sv + par.g * e : 0);
}
function inspect(M) {
  var P = M.par, coef = [{ name: "α（水平）", value: P.a }];
  if (M.kind.trend) coef.push({ name: "β（趋势）", value: P.b });
  if (M.kind.season) coef.push({ name: "γ（季节）", value: P.g });
  if (M.kind.damped) coef.push({ name: "φ（阻尼）", value: P.phi });
  return { coef: coef, text: "选中的模型：" + M.kind.name + (M.kind.season ? "（m = " + M.m + "）" : "") + "，训练段一步误差的均方 " + M.mse.toPrecision(4) + "，AIC " + M.aic.toFixed(1) + "。" };
}
`),
  docs: md`
## 模型
加法误差的指数平滑（ETS 记号 A,A$_d$,A）：状态是水平 $\ell$、趋势 $b$、季节 $s$。一步预测 $\hat y_{t\mid t-1}=\ell_{t-1}+\phi b_{t-1}+s_{t-m}$，误差 $e_t=y_t-\hat y_{t\mid t-1}$，更新
$$\ell_t=\ell_{t-1}+\phi b_{t-1}+\alpha e_t,\qquad b_t=\phi b_{t-1}+\alpha\beta e_t,\qquad s_t=s_{t-m}+\gamma e_t .$$
$h$ 步预测 $\hat y_{t+h\mid t}=\ell_t+(\phi+\phi^2+\dots+\phi^h)b_t+s_{t+h-m\lceil h/m\rceil}$。去掉趋势（$b\equiv0$）是简单指数平滑或"水平 + 季节"；去掉季节是 Holt；$\phi=1$ 是不阻尼的趋势。

## 损失与训练
初始状态用前两个季节（无季节时用开头几步）粗略估计；平滑系数 $\alpha\in(0,1)$、$\beta\in(0,1)$、$\gamma\in(0,1-\alpha)$、$\phi\in(0.8,0.98)$ 经逻辑函数变换成无约束的参数，用 Nelder–Mead 最小化训练段一步误差的平方和 $\sum_te_t^2$。"自动"时在可用的几种模型里按 $\mathrm{AIC}=T\log(\mathrm{SSE}/T)+2(\text{参数个数}+\text{初始状态个数})$ 挑最小的；曲线的横轴是候选模型的编号。预测时，验证段与测试段的新观测通过 ˋupdateˋ 逐个喂进来，不重新估计系数。

## 参数怎么调
- 一般用"自动"。季节性明显时它会挑带季节项的模型；只有在你确定没有趋势时才手动选简单指数平滑。
- 阻尼趋势在长期预测上通常更稳（不会把短期的斜率无限外推），是很多预测竞赛里的强基线。
- 季节长度要和数据一致；短于两个季节的序列无法估计季节项。

## 复杂度
一次递推 $O(T)$；Nelder–Mead 约几百次递推，所以拟合是 $O(T)$ 乘以几百。预测与更新每步 $O(1+m)$（季节分量）。

## 什么时候好用、什么时候失效
水平、趋势、季节缓慢漂移的序列（销量、客流、气温）上它简单、稳健、往往难以打败。它是线性的、只用一个误差源，不能表示非线性动力学（混沌序列）、机制切换或波动聚集；乘法型季节（季节幅度随水平增长）应该先取对数。

## 理论
**定理 1（Holt–Winters 是一个创新形式的状态空间模型）.** 记 $x_t=(\ell_t,b_t,s_t,s_{t-1},\dots,s_{t-m+1})^\top$。上面的递推可以写成
$$y_t=w^\top x_{t-1}+\varepsilon_t,\qquad x_t=Fx_{t-1}+g\,\varepsilon_t,$$
$w=(1,\phi,0,\dots,0,1)$，$g=(\alpha,\alpha\beta,\gamma,0,\dots,0)^\top$，$F$ 为相应的转移矩阵，并且一步预测误差 $e_t$ 恰好等于 $\varepsilon_t$。若进一步假设 $\varepsilon_t\overset{\text{iid}}\sim N(0,\sigma^2)$，则给定初始状态 $x_0$ 的似然为 $(2\pi\sigma^2)^{-T/2}\exp(-\sum_te_t^2/2\sigma^2)$，对 $\sigma^2$ 取极大后 $\hat\sigma^2=\mathrm{SSE}/T$，对数似然为 $-\frac T2\log(\mathrm{SSE}/T)+\text{常数}$。所以"最小化一步误差平方和"就是高斯最大似然，AIC 也因此可用。

*证明.* 把 $e_t$ 换成 $\varepsilon_t$，递推式逐行就是 $x_t=Fx_{t-1}+g\varepsilon_t$；观测方程是 $\hat y_{t\mid t-1}$ 的定义。给定 $x_0$ 和过去的 $y$，$x_{t-1}$ 是已知的，所以 $y_t\mid y_{<t}\sim N(w^\top x_{t-1},\sigma^2)$，似然按时间分解成这些正态密度的乘积。$\square$

**命题 2（简单指数平滑是加权平均）.** 无趋势无季节时 $\ell_t=\alpha y_t+(1-\alpha)\ell_{t-1}$，展开得
$$\ell_t=\alpha\sum_{j=0}^{t-1}(1-\alpha)^jy_{t-j}+(1-\alpha)^t\ell_0,$$
权重按几何级数衰减。若 $y$ 服从 ARIMA(0,1,1)：$y_t-y_{t-1}=\varepsilon_t-\theta\varepsilon_{t-1}$，$0<\theta<1$，则 $\alpha=1-\theta$ 的简单指数平滑给出（在无限历史下）最小均方误差的一步预测 $\mathbb E[y_{t+1}\mid y_{\le t}]$（Muth 1960）。

*证明梗概.* 可逆性让 $\varepsilon_t=\sum_j\theta^j(y_t-y_{t-1})_{-j}$ 由过去确定，于是 $\mathbb E[y_{t+1}\mid y_{\le t}]=y_t-\theta\varepsilon_t$；把它写成 $y_t$ 的加权和，系数正是 $(1-\theta)\theta^j$。$\square$

参考：R. J. Hyndman, A. B. Koehler, J. K. Ord, R. D. Snyder,《Forecasting with Exponential Smoothing: The State Space Approach》（Springer, 2008）第 2–5 章；J. F. Muth, *JASA* 55 (1960)；E. S. Gardner, Exponential smoothing: the state of the art, *J. Forecasting* 25 (2006)。
`
});

add({
  id: "kalman", name: "卡尔曼滤波（局部线性趋势）", group: "ts", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "看不见的水平和斜率各自随机游走，观测再加噪声；三个方差按最大似然估计，新观测到来时只做一步滤波。",
  params: [S("model", "模型", "trend", [["trend", "局部线性趋势（水平 + 斜率）"], ["level", "局部水平（只有水平）"]])],
  code: code(SN.nm, js`
/* ================= 卡尔曼滤波：局部线性趋势模型 =================
 * 状态 (μ_t, ν_t)：μ_{t+1} = μ_t + ν_t + ξ_t，ν_{t+1} = ν_t + ζ_t；观测 y_t = μ_t + ε_t。
 * 三个噪声方差 (σ²_ε, σ²_ξ, σ²_ζ) 用"预测误差分解"的对数似然估计（Nelder–Mead，在对数尺度上）；
 * 初始状态用很宽的先验（近似扩散初始化），前两步不计入似然。
 * 为了数值稳定，先把序列平移、缩放：z = (y − y₀) / c，c 是一阶差分的标准差。
 * 滤波得到的每一时刻的状态都记下来；update 只做一步滤波（预测 + 更新），不重新估计方差。 */
function kfStep(K, z, first) {
  // 预测：x ← T x，P ← T P Tᵀ + Q
  if (!first) {
    if (K.r === 2) { K.a0 += K.a1; var p00 = K.P00 + 2 * K.P01 + K.P11 + K.q1, p01 = K.P01 + K.P11, p11 = K.P11 + K.q2; K.P00 = p00; K.P01 = p01; K.P11 = p11; }
    else K.P00 += K.q1;
  }
  // 更新：v = z − μ⁻，F = P₀₀ + σ²_ε，增益 k = P[:,0] / F
  var v = z - K.a0, F = K.P00 + K.h, k0 = K.P00 / F, k1 = K.P01 / F;
  K.a0 += k0 * v; K.a1 += k1 * v;
  var n00 = K.P00 - K.P00 * K.P00 / F, n01 = K.P01 - K.P00 * K.P01 / F, n11 = K.P11 - K.P01 * K.P01 / F;
  K.P00 = n00; K.P01 = n01; K.P11 = n11;
  return -0.5 * (Math.log(2 * Math.PI * F) + v * v / F);
}
function newFilter(r, h, q1, q2, z0) { return { r: r, h: h, q1: q1, q2: q2, a0: z0, a1: 0, P00: 1e4, P01: 0, P11: r === 2 ? 1e4 : 0 }; }
function fit(series, p, lib, ctx) {
  var y = series.y, T = y.length, r = p.model === "level" ? 1 : 2, i, sd = 0, md = 0;
  for (i = 1; i < T; i++) md += (y[i] - y[i - 1]) / (T - 1);
  for (i = 1; i < T; i++) sd += (y[i] - y[i - 1] - md) * (y[i] - y[i - 1] - md) / (T - 1);
  var c = Math.sqrt(sd) || 1, y0 = y[0], z = new Float64Array(T);
  for (i = 0; i < T; i++) z[i] = (y[i] - y0) / c;
  function nll(u) {
    var K = newFilter(r, Math.exp(u[0]), Math.exp(u[1]), r === 2 ? Math.exp(u[2]) : 0, z[0]), ll = 0;
    for (var t = 0; t < T; t++) { var l = kfStep(K, z[t], t === 0); if (t >= r) ll += l; }
    return -ll;
  }
  var u0 = r === 2 ? [Math.log(0.5), Math.log(0.5), Math.log(0.01)] : [Math.log(0.5), Math.log(0.5)];
  var res = nelderMead(nll, u0, { step: 1.5, maxIter: 600, tol: 1e-10, onIter: function (it, f) { if (it % 5 === 0) ctx.report(it, { negLogLik: f / (T - r) }); return ctx.timeLeft() < 0; } });
  var M = { r: r, c: c, y0: y0, h: Math.exp(res.x[0]), q1: Math.exp(res.x[1]), q2: r === 2 ? Math.exp(res.x[2]) : 0, ll: -res.f, mu: [], nu: [] };
  var K = newFilter(r, M.h, M.q1, M.q2, z[0]);
  for (var t = 0; t < T; t++) { kfStep(K, z[t], t === 0); M.mu.push(K.a0); M.nu.push(K.a1); }
  M.K = K; M.size = r + 1;
  return M;
}
function forecast(M, past, h) {
  var t = past.length - 1, n = M.mu.length, mu, nu, out = new Float64Array(h);
  if (t < n) { mu = M.mu[t]; nu = M.nu[t]; }
  else {      // 比记下的历史还新：拷一份滤波器接着往前滤，不改动模型
    var K = {}; for (var key in M.K) K[key] = M.K[key];
    for (var u = n; u <= t; u++) kfStep(K, (past[u] - M.y0) / M.c, false);
    mu = K.a0; nu = K.a1;
  }
  for (var s = 1; s <= h; s++) out[s - 1] = M.y0 + M.c * (mu + (M.r === 2 ? s * nu : 0));
  return out;
}
function update(M, yNew) { kfStep(M.K, (yNew - M.y0) / M.c, false); M.mu.push(M.K.a0); M.nu.push(M.K.a1); }
function inspect(M) {
  var c2 = M.c * M.c, q = M.q1 / M.h;
  var txt = (M.r === 2 ? "局部线性趋势" : "局部水平") + "模型（最大似然）：\n  观测噪声 σ²_ε = " + (M.h * c2).toPrecision(4) + "\n  水平的扰动 σ²_ξ = " + (M.q1 * c2).toPrecision(4) + (M.r === 2 ? "\n  斜率的扰动 σ²_ζ = " + (M.q2 * c2).toPrecision(4) : "") +
    "\n信噪比 q = σ²_ξ/σ²_ε = " + q.toPrecision(3) + (M.r === 1 ? "；稳态下等价于 α = " + ((-q + Math.sqrt(q * q + 4 * q)) / 2).toFixed(3) + " 的简单指数平滑" : "") + "\n对数似然 " + M.ll.toFixed(2) + "（缩放后的单位）";
  return { coef: [{ name: "σ²_ε", value: M.h * c2 }, { name: "σ²_ξ", value: M.q1 * c2 }].concat(M.r === 2 ? [{ name: "σ²_ζ", value: M.q2 * c2 }] : []), text: txt };
}
`),
  docs: md`
## 模型
线性高斯状态空间模型（"结构时间序列"）。**局部线性趋势**：
$$y_t=\mu_t+\varepsilon_t,\qquad \mu_{t+1}=\mu_t+\nu_t+\xi_t,\qquad \nu_{t+1}=\nu_t+\zeta_t,$$
$\varepsilon_t\sim N(0,\sigma^2_\varepsilon)$、$\xi_t\sim N(0,\sigma^2_\xi)$、$\zeta_t\sim N(0,\sigma^2_\zeta)$ 相互独立。**局部水平**去掉斜率 $\nu$。$h$ 步预测 $\hat y_{t+h\mid t}=\hat\mu_{t\mid t}+h\,\hat\nu_{t\mid t}$（局部水平时是 $\hat\mu_{t\mid t}$）。

## 损失与训练
给定三个方差，卡尔曼滤波逐步算出 $\hat x_{t\mid t}=\mathbb E[x_t\mid y_{\le t}]$ 与其协方差 $P_{t\mid t}$，同时得到一步预测误差 $v_t$ 和它的方差 $F_t$。对数似然用**预测误差分解**：
$$\log L=-\frac12\sum_{t\ge r}\Big(\log2\pi F_t+\frac{v_t^2}{F_t}\Big),$$
初始状态取很宽的先验（$P_0=10^4$，在缩放后的单位里），前 $r$ 步（状态维数）不计入似然——这近似于精确的扩散初始化。方差在对数尺度上用 Nelder–Mead 最大化似然；曲线画的是每个观测的平均负对数似然随迭代的下降。之后的新观测只做一步滤波（ˋupdateˋ）。

## 参数怎么调
只有模型的选择：序列没有持续的趋势时用局部水平（等价于简单指数平滑，见下面的命题），否则用局部线性趋势。估计出 $\sigma^2_\zeta\approx0$ 说明斜率几乎是常数（"确定性趋势"）。

## 复杂度
每一步滤波 $O(r^3)$（这里 $r\le2$，就是常数）；每次似然 $O(T)$，Nelder–Mead 几百次。预测 $O(h)$。

## 什么时候好用、什么时候失效
水平与趋势缓慢、随机地漂移，观测带噪声时，它给出有原则的平滑与预测，而且噪声方差都有解释。它是线性高斯的：混沌、机制切换、厚尾都不在模型里；对离群点敏感（一个大的 $v_t$ 会被当成水平的突变的一部分）。

## 理论
**定理 1（卡尔曼滤波的最优性）.** 设 $x_{t+1}=Tx_t+\eta_t$，$y_t=Zx_t+\varepsilon_t$，$x_0\sim N(a_0,P_0)$，$\eta_t\sim N(0,Q)$、$\varepsilon_t\sim N(0,H)$，且它们相互独立。则对每个 $t$，$x_t\mid y_{\le t}\sim N(a_{t\mid t},P_{t\mid t})$，其中
$$a_{t\mid t-1}=Ta_{t-1\mid t-1},\ P_{t\mid t-1}=TP_{t-1\mid t-1}T^\top+Q;\quad F_t=ZP_{t\mid t-1}Z^\top+H,\ K_t=P_{t\mid t-1}Z^\top F_t^{-1};$$
$$a_{t\mid t}=a_{t\mid t-1}+K_t(y_t-Za_{t\mid t-1}),\qquad P_{t\mid t}=P_{t\mid t-1}-K_tF_tK_t^\top .$$
因此 $a_{t\mid t}$ 是平方损失下 $x_t$ 的最优估计（条件期望），$Za_{t+h\mid t}$ 是 $y_{t+h}$ 的最优预测。去掉高斯假设（只保留二阶矩与独立性），同样的递推给出**线性**估计中均方误差最小的那一个。

*证明梗概.* 归纳。设 $x_{t-1}\mid y_{<t}$ 为正态；线性变换加独立的正态噪声，$x_t\mid y_{<t}\sim N(a_{t\mid t-1},P_{t\mid t-1})$。再加上 $y_t=Zx_t+\varepsilon_t$，$(x_t,y_t)\mid y_{<t}$ 联合正态，协方差分块为 $\begin{pmatrix}P&PZ^\top\\ZP&F\end{pmatrix}$；用正态条件分布的公式（舒尔补）对 $y_t$ 取条件，即得更新式。$\square$

**命题 2（局部水平模型 = 简单指数平滑）.** 局部水平模型中记 $q=\sigma^2_\xi/\sigma^2_\varepsilon$。预测方差 $P_{t\mid t-1}$（以 $\sigma^2_\varepsilon$ 为单位）的稳态是 $\bar P=\frac{q+\sqrt{q^2+4q}}2$，稳态增益 $\alpha=\frac{\bar P}{\bar P+1}=\frac{-q+\sqrt{q^2+4q}}2$，滤波 $\hat\mu_t=\hat\mu_{t-1}+\alpha(y_t-\hat\mu_{t-1})$ 正是平滑系数为 $\alpha$ 的简单指数平滑。

*证明.* 单位化后 Riccati 递推为 $P_{t+1\mid t}=\frac{P_{t\mid t-1}}{P_{t\mid t-1}+1}+q$，不动点满足 $\bar P^2-q\bar P-q=0$，取正根。代入 $\alpha=\bar P/(\bar P+1)$ 并化简即得。$\square$

参考：R. E. Kalman, A new approach to linear filtering and prediction problems, *J. Basic Eng.* 82 (1960)；A. C. Harvey,《Forecasting, Structural Time Series Models and the Kalman Filter》（Cambridge, 1989）；J. Durbin, S. J. Koopman,《Time Series Analysis by State Space Methods》第 2 版（Oxford, 2012）第 2、4、7 章。
`
});

SN.lags = js`
/* ---------- 滞后特征 ----------
 * 目标"变化量"：特征 f_j = y_{t−j} − y_t（j = 1..L，以最后一个值为参照，和水平无关），有季节时再加 y_{t+1−m} − y_t；
 *              目标 y_{t+h} − y_t。
 * 目标"水平"  ：特征 f_j = y_{t−j}（j = 0..L−1），有季节时再加 y_{t+1−m}；目标 y_{t+h}。 */
function lagSpec(L, m, target) {
  var seas = m >= 2 && m - 1 > (target === "diff" ? L : L - 1);
  return { L: L, m: m, target: target, seas: seas, d: L + (seas ? 1 : 0), tmin: Math.max(target === "diff" ? L : L - 1, seas ? m - 1 : 0) };
}
function lagRow(S, y, t, out, o) {
  var j, q = o || 0, ref = S.target === "diff" ? y[t] : 0;
  if (S.target === "diff") for (j = 1; j <= S.L; j++) out[q++] = y[t - j] - ref;
  else for (j = 0; j < S.L; j++) out[q++] = y[t - j];
  if (S.seas) out[q++] = y[t + 1 - S.m] - ref;
}
function lagNames(S) {
  var nm = [], j;
  if (S.target === "diff") for (j = 1; j <= S.L; j++) nm.push("y(t−" + j + ") − y(t)");
  else for (j = 0; j < S.L; j++) nm.push(j ? "y(t−" + j + ")" : "y(t)");
  if (S.seas) nm.push("y(t+1−" + S.m + ")" + (S.target === "diff" ? " − y(t)" : ""));
  return nm;
}
/* 用 y 里原点 t ∈ [t0, t1] 的窗口造一张表：X（n×d）和目标（h 步之后） */
function lagTable(S, y, t0, t1, h) {
  var rows = [], t, n, i;
  for (t = Math.max(t0, S.tmin); t <= t1 && t + h < y.length; t++) rows.push(t);
  n = rows.length;
  var X = new Float64Array(n * S.d), Y = new Float64Array(n);
  for (i = 0; i < n; i++) { lagRow(S, y, rows[i], X, i * S.d); Y[i] = y[rows[i] + h] - (S.target === "diff" ? y[rows[i]] : 0); }
  return { X: X, y: Y, n: n, d: S.d };
}
function concatSeries(series) { var a = new Float64Array(series.y.length + series.valid.y.length); a.set(series.y); a.set(series.valid.y, series.y.length); return a; }
`;
add({
  id: "lagboost", name: "滞后特征 + 梯度提升", group: "trees", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "把最近 L 个值（相对最后一个值）当特征，用梯度提升树预测下一步的变化；递归或直接地做多步预测。",
  params: [
    I("lags", "滞后个数 L", 24, 1, 200, 1),
    S("target", "预测目标", "diff", [["diff", "变化量 y(t+h) − y(t)（推荐：与水平无关）"], ["level", "水平 y(t+h)"]]),
    S("strategy", "多步预测", "recursive", [["recursive", "递归：一步模型反复用，把预测当作新的观测"], ["direct", "直接：每个步长单独训练一个模型"]]),
    I("hmax", "直接法训练到几步", 10, 1, 50, 1, "超过的步长改用一步模型递归"),
    I("rounds", "轮数", 300, 10, 3000, 10),
    N("lr", "学习率 ν", 0.05, 0.005, 1, 0.005),
    I("maxDepth", "树的深度", 4, 1, 10, 1),
    I("minLeaf", "叶子最少样本数", 10, 1, 200, 1),
    N("subsample", "每轮抽样比例", 0.8, 0.2, 1, 0.05),
    I("patience", "早停的耐心（轮）", 50, 0, 1000, 1, "按验证段上的误差早停")
  ],
  code: code(SN.base, SN.tree, SN.lags, js`
/* ================= 滞后特征 + 梯度提升（回归，平方损失） =================
 * 训练：训练段里每个原点 t 造一行特征（见上），目标是 h 步之后的变化（或水平）；验证段的窗口只用来早停。
 * 递归：只训练 h = 1 的模型，预测完一步就把预测值接到序列后面，再预测下一步。
 * 直接：h = 1..hmax 各训练一个模型，各自直接预测；更远的步长从直接预测的末端递归。 */
function boost(tab, val, p, rng, ctx, deadline, curve) {
  var n = tab.n, d = tab.d, i, fill = colMeans(tab.X, n, d), bins = makeBins(tab.X, n, d, 64, fill), M = { f0: meanOf(tab.y, n), trees: [], fill: fill, d: d, imp: new Float64Array(d) };
  var F = new Float64Array(n).fill(M.f0), Fv = new Float64Array(val.n).fill(M.f0), G = new Float64Array(n), all = new Int32Array(n), m = Math.max(1, Math.round(p.subsample * n)), best = { e: Infinity, r: 0 };
  for (i = 0; i < n; i++) all[i] = i;
  var opt = { mode: "gh", g: G, h: null, lambda: 1, maxDepth: p.maxDepth, minLeaf: p.minLeaf, scale: p.lr, imp: M.imp };
  for (var r = 0; r < p.rounds; r++) {
    if (r > 0 && ctx.timeLeft() < deadline) break;
    for (i = 0; i < n; i++) G[i] = tab.y[i] - F[i];
    for (i = 0; i < m; i++) { var q = i + rng.int(n - i), t = all[i]; all[i] = all[q]; all[q] = t; }
    var T = growTree(bins, all.slice(0, m), opt);
    M.trees.push(T);
    for (i = 0; i < n; i++) F[i] += T.val[leafOfCode(T, bins.codes, i * d)];
    var se = 0, sv = 0;
    for (i = 0; i < n; i++) se += (F[i] - tab.y[i]) * (F[i] - tab.y[i]);
    for (i = 0; i < val.n; i++) { Fv[i] += T.val[leafOf(T, val.X, i * d, fill)]; sv += (Fv[i] - val.y[i]) * (Fv[i] - val.y[i]); }
    var ve = val.n ? sv / val.n : se / n;
    if (curve) ctx.report(r + 1, { loss: se / n, validLoss: ve });
    if (ve < best.e - 1e-15) best = { e: ve, r: r + 1 };
    else if (p.patience > 0 && r + 1 - best.r >= p.patience) break;
  }
  if (p.patience > 0 && best.r > 0) M.trees = M.trees.slice(0, best.r);
  return M;
}
function predictRow(B, x, o) { var s = B.f0; for (var t = 0; t < B.trees.length; t++) s += B.trees[t].val[leafOf(B.trees[t], x, o, B.fill)]; return s; }
function fit(series, p, lib, ctx) {
  var y = series.y, T = y.length, full = concatSeries(series), m = series.season | 0, S = lagSpec(Math.min(p.lags, Math.floor(T / 3)), m, p.target);
  var H = p.strategy === "direct" ? p.hmax : 1, models = [];
  for (var h = 1; h <= H; h++) {
    var tab = lagTable(S, y, 0, T - 1 - h, h), val = lagTable(S, full, T - 1, full.length - 1 - h, h);
    if (tab.n < 20) { if (h === 1) throw new Error("序列太短：滞后 " + S.L + " 个之后只剩 " + tab.n + " 个训练窗口。"); break; }
    var left = ctx.timeLeft(), deadline = h < H ? left - left / (H - h + 1) : 0;     // 剩下的时间平分给剩下的模型
    var B = boost(tab, val, p, lib.rng, ctx, deadline, h === 1);                       // 只给一步模型画学习曲线
    models.push(B);
    ctx.log("步长 " + h + "：" + B.trees.length + " 棵树，训练窗口 " + tab.n + " 个。");
  }
  return { S: S, models: models, strategy: p.strategy, names: lagNames(S), size: models.reduce(function (s, B) { return s + B.trees.reduce(function (a, t) { return a + 3 * t.size; }, 1); }, 0) };
}
function forecast(M, past, h) {
  var S = M.S, n0 = past.length, out = new Float64Array(h), row = new Float64Array(S.d), s;
  if (n0 - 1 < S.tmin) { for (s = 0; s < h; s++) out[s] = past[n0 - 1]; return out; }
  var keep = Math.max(S.L, S.m) + 2, path = Array.prototype.slice.call(past, Math.max(0, n0 - keep)), t0 = path.length - 1, base = path[t0];
  var nd = M.strategy === "direct" ? Math.min(h, M.models.length) : 0;
  for (s = 1; s <= nd; s++) { lagRow(S, path, t0, row, 0); var v = predictRow(M.models[s - 1], row, 0); out[s - 1] = S.target === "diff" ? base + v : v; }
  for (s = 0; s < nd; s++) path.push(out[s]);
  for (s = nd + 1; s <= h; s++) {
    var t = path.length - 1; lagRow(S, path, t, row, 0);
    var v1 = predictRow(M.models[0], row, 0), nx = S.target === "diff" ? path[t] + v1 : v1;
    out[s - 1] = nx; path.push(nx);
  }
  return out;
}
function inspect(M) {
  var B = M.models[0];
  return { tree: B.trees.length ? exportTree(B.trees[0], 127) : null, text: (M.strategy === "direct" ? "直接法：" + M.models.length + " 个模型（步长 1…" + M.models.length + "）" : "递归：一个一步模型") + "，一步模型有 " + B.trees.length + " 棵树（深度 ≤ " + (B.trees[0] ? Math.max.apply(null, Array.prototype.slice.call(B.trees[0].dep)) : 0) + "）。\n一步模型的分裂增益按特征：\n" + importanceText(B.imp, M.names, 12) };
}
`),
  docs: md`
## 模型
把预测变成表格回归：在原点 $t$ 取特征 $f_j=y_{t-j}-y_t$（$j=1,\dots,L$；有季节长度 $m$ 时再加 $y_{t+1-m}-y_t$），目标 $y_{t+h}-y_t$（或者直接用水平 $y_{t-j}$ 预测 $y_{t+h}$）。回归器是梯度提升树（平方损失，见"梯度提升树"）。多步预测两种做法：**递归**——只训练 $h=1$ 的模型 $\hat g$，令 $\hat y_{t+1}=y_t+\hat g(f_t)$，把它当成观测接到序列后面，再算下一步；**直接**——对每个 $h\le h_{\max}$ 单独训练 $\hat g_h$，$\hat y_{t+h}=y_t+\hat g_h(f_t)$。

## 损失与训练
训练段里每个可用的原点给一行；验证段的窗口（特征可以用到训练段末尾的观测）只用于早停。每轮长一棵深度不超过给定值的回归树拟合残差，叶子值做 $\lambda=1$ 的收缩、再乘学习率。直接法把时间预算平分给各个步长的模型。曲线是一步模型的训练与验证均方误差（横轴是轮数）。

## 参数怎么调
- **L**：至少覆盖主要的自相关（AR(2) 只要几个；Mackey–Glass 的延迟是 17，至少 20 以上）。季节数据加上季节滞后。
- **预测目标**：用"变化量"时，模型对整体水平的平移不变，适合随机游走、有趋势的序列；均值回复很强、水平本身有信息时用"水平"。
- **递归 vs 直接**：递归把一步误差层层带入，步长大时可能偏；直接法每个步长一个模型，没有这种偏差，但每个模型的数据利用率低、代价是 $h_{\max}$ 倍。

## 复杂度
造表 $O(nL)$；提升 $O(\text{轮数}\cdot nL\cdot\text{深度})$（直接法再乘 $h_{\max}$）；每次预测 $O(h\cdot\text{轮数}\cdot\text{深度})$。

## 什么时候好用、什么时候失效
非线性的自回归结构（Logistic 映射、洛伦兹系统的短期预测、机制依赖于最近的取值时）上，它往往明显好于线性 AR。它不能外推：用"水平"作目标时，预测不会超出训练段出现过的取值；用"变化量"时，单步的变化也被限制在训练中见过的范围里。纯随机游走上它不可能好过朴素预测（下一步的变化不可预测），最多打平。

## 理论
**命题 1（最优的多步预测，及递归的偏差）.** 平方损失下 $h$ 步的最优预测是 $\mathbb E[y_{t+h}\mid\mathcal F_t]$。设一阶非线性自回归 $y_{t+1}=f(y_t)+\varepsilon_{t+1}$，$\varepsilon$ 独立同分布、均值 0、方差 $\sigma^2$，$f$ 三次连续可微且 $f'''$ 有界。则
$$\mathbb E[y_{t+2}\mid y_t]=\mathbb E\big[f(f(y_t)+\varepsilon)\big]=f\big(f(y_t)\big)+\tfrac12f''\big(f(y_t)\big)\sigma^2+O\big(\mathbb E|\varepsilon|^3\big).$$
所以"把一步预测代回去"的递归预测 $f(f(y_t))$ 一般是有偏的，偏差是 $\frac12f''\sigma^2$ 量级；$f$ 是仿射函数时 $f''=0$，递归是精确的（线性 AR 的多步预测就是递归）。

*证明.* $y_{t+2}=f(y_{t+1})+\varepsilon_{t+2}$，$\varepsilon_{t+2}$ 与 $y_{t+1}$ 独立且均值为 0，所以 $\mathbb E[y_{t+2}\mid y_t]=\mathbb E[f(f(y_t)+\varepsilon_{t+1})\mid y_t]$。在 $f(y_t)$ 处对 $f$ 做二阶泰勒展开（拉格朗日余项），取期望时一次项为 0，二次项是 $\frac12f''\sigma^2$，余项由 $\sup|f'''|\cdot\mathbb E|\varepsilon|^3/6$ 控制。$\square$
直接法估计的是 $\mathbb E[y_{t+h}\mid f_t]$ 本身，没有这个偏差，但方差更大（每个模型的有效样本是独立的）。

**命题 2（树不能外推）.** 一棵回归树的每片叶子的值是该叶子里训练目标的（收缩过的）平均，所以单棵树的预测落在 $[\min_iy_i,\max_iy_i]$ 里（带收缩时还更窄）。提升是很多棵树的和，可以超出单棵树的范围，但在远离训练数据的特征区域里，所有的树都落在边界的叶子上，预测变成常数。

参考：J. H. Friedman (2001)（见"梯度提升树"）；S. Ben Taieb 等, A review and comparison of strategies for multi-step ahead time series forecasting, *Expert Syst. Appl.* 39 (2012)；Makridakis 等, The M5 accuracy competition, *Int. J. Forecasting* 38 (2022)。
`
});

add({
  id: "lagmlp", name: "滞后窗口 + 神经网络", group: "neural", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "最近 L 个值（相对最后一个值、按增量的尺度缩放）进一个小 MLP，一次输出未来几步的变化。",
  params: [
    I("lags", "窗口长度 L", 24, 2, 200, 1),
    S("hidden", "隐藏层", "64", [["32", "32"], ["64", "64"], ["128", "128"], ["64,64", "64 → 64"]]),
    S("act", "激活函数", "tanh", [["tanh", "tanh"], ["relu", "ReLU"], ["gelu", "GELU"]]),
    I("hout", "一次输出几步", 1, 1, 30, 1, "直接多步；预测更远时把输出接回窗口再预测"),
    N("lr", "学习率", 0.002, 0.0001, 0.05, 0.0001),
    N("wd", "权重衰减（AdamW）", 0.0001, 0, 0.5, 0.0001),
    I("batch", "小批量大小", 64, 4, 1024, 4),
    I("epochs", "最多训练几轮", 300, 1, 5000, 1),
    I("patience", "早停的耐心（轮）", 30, 0, 1000, 1)
  ],
  code: code(SN.base, SN.train, js`
/* ================= 滞后窗口 + 多层感知机 =================
 * 输入 x_j = (y_{t−j} − y_t)/s（j = 1..L），输出 o_i = (y_{t+i} − y_t)/s（i = 1..hout），s 是训练段一阶差分的标准差。
 * 以最后一个值为参照，网络对整体水平的平移不变；除以 s 让输入输出都在 1 的量级。
 * 训练：小批量 AdamW，均方误差；验证段的窗口用于早停。 */
function windows(y, L, H, t0, t1, s) {
  var rows = [];
  for (var t = Math.max(t0, L); t <= t1 && t + H < y.length; t++) rows.push(t);
  var n = rows.length, X = new Float64Array(n * L), Y = new Float32Array(n * H), i, j;
  for (i = 0; i < n; i++) { var t2 = rows[i]; for (j = 1; j <= L; j++) X[i * L + j - 1] = (y[t2 - j] - y[t2]) / s; for (j = 1; j <= H; j++) Y[i * H + j - 1] = (y[t2 + j] - y[t2]) / s; }
  return { X: X, Y: Y, n: n };
}
function fit(series, p, lib, ctx) {
  var nn = lib.nn, rng = lib.rng, y = series.y, T = y.length, i;
  if (!nn) throw new Error("这个算法要用 lib.nn（自动求导库）。");
  var L = Math.max(2, Math.min(p.lags, Math.floor(T / 4))), H = p.hout, md = 0, sd = 0;
  for (i = 1; i < T; i++) md += (y[i] - y[i - 1]) / (T - 1);
  for (i = 1; i < T; i++) sd += (y[i] - y[i - 1] - md) * (y[i] - y[i - 1] - md) / (T - 1);
  var s = Math.sqrt(sd) || 1, full = new Float64Array(T + series.valid.y.length);
  full.set(y); full.set(series.valid.y, T);
  var tr = windows(y, L, H, 0, T - 1 - H, s), va = windows(full, L, H, T - 1, full.length - 1 - H, s);
  if (tr.n < 20) throw new Error("序列太短：窗口长度 " + L + " 之后只剩 " + tr.n + " 个训练窗口。");
  var hidden = String(p.hidden).split(",").map(function (v) { return Math.max(1, parseInt(v, 10) || 1); });
  var net = nn.MLP([L].concat(hidden, [H]), { act: p.act, rng: rng }), params = net.params();
  net.layers.forEach(function (Ly) { Ly.b.noDecay = true; });
  var opt = nn.adam(params, { lr: p.lr, weightDecay: p.wd }), M = { nn: nn, net: net, L: L, H: H, s: s, hidden: hidden };
  var bs = Math.max(1, Math.min(p.batch, tr.n)), best = { e: Infinity, ep: 0, saved: null }, ep, stop = false;
  function fwd(x) { return net.forward(x); }
  for (ep = 1; ep <= p.epochs && !stop; ep++) {
    var bl = nn.batches(tr.n, bs, rng), sL = 0, cnt = 0;
    for (var b = 0; b < bl.length; b++) {
      var idx = bl[b], tgt = new Float32Array(idx.length * H);
      for (i = 0; i < idx.length; i++) tgt.set(tr.Y.subarray(idx[i] * H, idx[i] * H + H), i * H);
      var loss = nn.mse(net.forward(nn.fromRows(tr.X, L, idx)), tgt);
      opt.zeroGrad(); loss.backward(); opt.step();
      sL += loss.data[0] * idx.length; cnt += idx.length;
      if (ctx.timeLeft() < 0) { stop = true; break; }
    }
    var ve = sL / cnt;
    if (va.n) { var o = forwardRows(nn, fwd, va.X, va.n, L, 1024).data, se = 0; for (i = 0; i < va.n * H; i++) se += (o[i] - va.Y[i]) * (o[i] - va.Y[i]); ve = se / (va.n * H); }
    ctx.report(ep, { loss: sL / cnt * s * s, validLoss: ve * s * s });
    if (ve < best.e) best = { e: ve, ep: ep, saved: nn.saveParams(params) };
    else if (p.patience > 0 && ep - best.ep >= p.patience) { ctx.log("早停：验证误差在第 " + best.ep + " 轮之后 " + p.patience + " 轮没有变好。"); break; }
  }
  if (best.saved) nn.loadParams(params, best.saved);
  M.bestEpoch = best.ep; M.size = nn.numParams(params);
  return M;
}
function forecast(M, past, h) {
  var nn = M.nn, L = M.L, H = M.H, n0 = past.length, out = new Float64Array(h), x = new Float64Array(L), done = 0, j;
  if (n0 <= L) { for (j = 0; j < h; j++) out[j] = past[n0 - 1]; return out; }
  var path = Array.prototype.slice.call(past, n0 - L - 1);
  while (done < h) {
    var t = path.length - 1;
    for (j = 1; j <= L; j++) x[j - 1] = (path[t - j] - path[t]) / M.s;
    var o = nn.noGrad(function () { return M.net.forward(nn.fromRows(x, L)); }).data;
    for (j = 0; j < H && done < h; j++) { out[done++] = path[t] + M.s * o[j]; }
    for (j = 0; j < H; j++) path.push(path[t] + M.s * o[j]);
  }
  return out;
}
function inspect(M) {
  return { layers: M.net.layers.map(function (l, i) { return { name: "第 " + (i + 1) + " 层 W（输入 × 输出）", rows: l.W.shape[0], cols: l.W.shape[1], data: l.W.data }; }),
    text: "窗口 " + M.L + " → " + M.hidden.join(" → ") + " → " + M.H + " 步，" + M.size + " 个参数；用的是验证误差最好的第 " + M.bestEpoch + " 轮。尺度 s = " + M.s.toPrecision(4) + "。" };
}
`),
  docs: md`
## 模型
非线性自回归（NAR）：
$$\big(\hat y_{t+1},\dots,\hat y_{t+H}\big)=y_t+s\cdot g_\theta\Big(\tfrac{y_{t-1}-y_t}s,\dots,\tfrac{y_{t-L}-y_t}s\Big),$$
$g_\theta$ 是一个多层感知机，$s$ 是训练段一阶差分的标准差。一次输出 $H$ 步（直接多步）；要预测更远时，把这 $H$ 个预测接到窗口末尾再算一次。

## 损失与训练
训练段里每个可用的原点给一个窗口，均方误差，小批量 AdamW；验证段的窗口用于早停并退回最好的一轮。曲线的单位是原序列的平方。

## 参数怎么调
- **窗口长度 L**：要覆盖系统"记忆"的长度。确定性混沌的序列（洛伦兹、Mackey–Glass）按下面的 Takens 定理，需要大约两倍吸引子维数以上的滞后（采样密时还要更多）。
- **一次输出几步**：评价的步长 $H$ 大时，设成同样的 $H$ 可以避免递归的偏差（见"滞后特征 + 梯度提升"里的命题）。
- tanh 激活在小网络、平滑的动力学上通常比 ReLU 稳。

## 复杂度
每轮 $O(n\cdot(L\cdot h_1+h_1\cdot H))$（$h_1$ 为隐藏宽度）；预测每个原点一次（或几次）前向。

## 什么时候好用、什么时候失效
平滑的非线性动力学、样本足够多时它能逼近真实的一步映射，好于线性 AR。随机游走、强噪声的序列上它学不到可预测的东西，容易对噪声过拟合（早停很重要）；序列的统计规律随时间变化（非平稳）时，训练段学到的映射到测试段就不再适用。

## 理论
**定理（Takens 嵌入，1981）.** 设 $\mathcal M$ 是 $m$ 维紧光滑流形，$\varphi:\mathcal M\to\mathcal M$ 是光滑微分同胚（动力系统），$h:\mathcal M\to\mathbb R$ 是光滑的观测函数。对通有的（在 $C^2$ 拓扑下开稠的集合中的）一对 $(\varphi,h)$，延迟映射
$$\Phi(x)=\big(h(x),h(\varphi(x)),\dots,h(\varphi^{2m}(x))\big)\in\mathbb R^{2m+1}$$
是嵌入（单射的浸入）。

**推论.** 对这样的系统，记 $y_t=h(\varphi^t(x_0))$，存在连续函数 $F$ 使 $y_{t+1}=F(y_t,y_{t-1},\dots,y_{t-2m})$（对时间反演用 $\varphi^{-1}$，或等价地把窗口取在过去）。*证明*：$\Phi$ 是从紧集到像的同胚，所以 $x_t=\Phi^{-1}(\text{窗口})$ 连续地依赖窗口，而 $y_{t+1}=h(\varphi(x_t))$。$\square$ 于是"用最近 $L\ge2m+1$ 个值预测下一个值"在原则上是一个确定的连续函数逼近问题，万能逼近定理（见"神经网络（多层感知机）"）说明足够大的 MLP 可以逼近它；实际的困难在于有限的数据、噪声，以及混沌系统里误差的指数放大（最大李雅普诺夫指数 $\lambda_1>0$ 时，可预测的步数约为 $\frac1{\lambda_1}\log\frac{\text{信号尺度}}{\text{初始误差}}$）。

参考：F. Takens, Detecting strange attractors in turbulence, *Lecture Notes in Math.* 898 (1981)；T. Sauer, J. Yorke, M. Casdagli, Embedology, *J. Stat. Phys.* 65 (1991)；H. Kantz, T. Schreiber,《Nonlinear Time Series Analysis》第 2 版（Cambridge, 2004）。
`
});

add({
  id: "esn", name: "回声状态网络（储备池）", group: "neural", api: "forecast", kinds: ["forecast"], families: ["timeseries"],
  summary: "一个固定的随机稀疏循环网络当“储备池”，只用岭回归训练读出层：训练极快，混沌序列上很强。",
  params: [
    I("N", "储备池大小 N", 300, 20, 1500, 10),
    N("rho", "谱半径 ρ", 0.9, 0.05, 1.5, 0.01, "把随机矩阵缩放到这个谱半径；< 1 通常能保证回声性质"),
    N("leak", "泄漏率 a", 0.5, 0.02, 1, 0.01, "x ← (1 − a)x + a·tanh(…)：越小记忆越长、反应越慢"),
    N("inScale", "输入的缩放", 1, 0.05, 5, 0.05),
    I("degree", "每个神经元的连接数", 10, 1, 100, 1),
    S("target", "读出预测什么", "level", [["level", "下一个值 u(t+1)"], ["diff", "下一步的变化 u(t+1) − u(t)"]]),
    B("autoLam", "按验证集选岭参数 λ", true, "在 10⁻¹⁰ … 10 上挑验证段一步误差最小的"),
    N("loglam", "岭参数 log₁₀ λ", -6, -12, 2, 0.1, "不按验证集选时使用"),
    I("washout", "丢掉开头几步", 50, 0, 1000, 1, "储备池从 0 状态出发，开头的状态还带着初值的痕迹")
  ],
  code: code(SN.base, SN.chol, js`
/* ================= 回声状态网络 =================
 * 储备池：x_t = (1 − a)x_{t−1} + a·tanh(W x_{t−1} + w_in u_t + b)，W 是 N×N 的稀疏随机矩阵（每行 degree 个非零元），
 * 缩放到谱半径 ρ；w_in、b 也随机固定。u_t = (y_t − μ)/σ 是标准化的输入。
 * 只训练读出层：ŷ(u_{t+1}) = w_outᵀ[1, u_t, x_t]，岭回归的闭式解。
 * 多步预测是"闭环"的：把预测值当作下一步的输入喂回储备池。
 * 谱半径用 Gelfand 公式 ρ(W) = lim ‖W^k v‖^{1/k} 估计（幂迭代的平均增长率；对复特征值也成立）。
 * 状态每 32 步存一个检查点：滚动预测时从最近的检查点接着跑，不必从头算。 */
function makeRes(N, deg, rho, inScale, rng) {
  var cols = new Int32Array(N * deg), vals = new Float64Array(N * deg), win = new Float64Array(N), bias = new Float64Array(N), i, k, it;
  for (i = 0; i < N * deg; i++) { cols[i] = rng.int(N); vals[i] = 2 * rng.u() - 1; }
  for (i = 0; i < N; i++) { win[i] = inScale * (2 * rng.u() - 1); bias[i] = 0.2 * (2 * rng.u() - 1); }
  var R = { N: N, deg: deg, cols: cols, vals: vals, win: win, bias: bias }, v = new Float64Array(N), w = new Float64Array(N), lg = 0, cnt = 0;
  for (i = 0; i < N; i++) v[i] = rng.normal();
  for (it = 0; it < 300; it++) {
    matvec(R, v, w);
    var nr = 0; for (i = 0; i < N; i++) nr += w[i] * w[i]; nr = Math.sqrt(nr);
    if (!(nr > 0)) break;
    if (it >= 100) { lg += Math.log(nr); cnt++; }
    for (i = 0; i < N; i++) v[i] = w[i] / nr;
  }
  R.rho0 = cnt ? Math.exp(lg / cnt) : 1;
  for (k = 0; k < N * deg; k++) vals[k] *= rho / (R.rho0 || 1);
  return R;
}
function matvec(R, x, out) { var N = R.N, d = R.deg; for (var i = 0; i < N; i++) { var s = 0, o = i * d; for (var k = 0; k < d; k++) s += R.vals[o + k] * x[R.cols[o + k]]; out[i] = s; } }
function stepRes(M, x, u, tmp) {   // 就地更新 x
  var R = M.R, a = M.leak; matvec(R, x, tmp);
  for (var i = 0; i < R.N; i++) x[i] = (1 - a) * x[i] + a * Math.tanh(tmp[i] + R.win[i] * u + R.bias[i]);
}
function readout(M, x, u) { var w = M.w, s = w[0] + w[1] * u; for (var i = 0; i < M.R.N; i++) s += w[2 + i] * x[i]; return s; }
function fit(series, p, lib, ctx) {
  var y = series.y, T = y.length, N = p.N, rng = lib.rng, i, j, t;
  var mu = meanOf(y, T), sd = 0; for (i = 0; i < T; i++) sd += (y[i] - mu) * (y[i] - mu); sd = Math.sqrt(sd / T) || 1;
  var M = { R: makeRes(N, p.degree, p.rho, p.inScale, rng), rho: p.rho, leak: p.leak, mu: mu, sd: sd, diff: p.target === "diff", cpT: [], cpX: [] };
  var x = new Float64Array(N), tmp = new Float64Array(N), D = N + 2, wash = Math.min(p.washout, Math.floor(T / 4)), rows = T - 1 - wash;
  if (rows < 20) throw new Error("序列太短：丢掉开头 " + wash + " 步之后只剩 " + rows + " 个训练样本。");
  var G = new Float64Array(D * D), c = new Float64Array(D), f = new Float64Array(D), Phi = new Float64Array(rows * D), tg = new Float64Array(rows), r = 0;
  for (t = 0; t < T; t++) {
    var u = (y[t] - mu) / sd; stepRes(M, x, u, tmp);
    if ((t + 1) % 32 === 0) { M.cpT.push(t); M.cpX.push(Float32Array.from(x)); }
    if (t >= wash && t < T - 1) {
      f[0] = 1; f[1] = u; for (i = 0; i < N; i++) f[2 + i] = x[i];
      var target = (y[t + 1] - mu) / sd - (M.diff ? u : 0);
      Phi.set(f, r * D); tg[r] = target; r++;
    }
  }
  M.x = x; M.t = T - 1;
  G = gramT(Phi, rows, D);
  for (r = 0; r < rows; r++) for (i = 0; i < D; i++) c[i] += Phi[r * D + i] * tg[r];
  for (i = 0; i < D * D; i++) G[i] /= rows;
  for (i = 0; i < D; i++) c[i] /= rows;
  // 验证段：从训练末尾的状态接着跑（在一份拷贝上），记下每一步的特征，用来挑 λ
  var vy = series.valid.y, nv = vy.length, Pv = new Float64Array(Math.max(0, nv) * D), tv = new Float64Array(nv), xv = Float64Array.from(x), uPrev = (y[T - 1] - mu) / sd;
  for (t = 0; t < nv; t++) {
    f[0] = 1; f[1] = uPrev; for (i = 0; i < N; i++) f[2 + i] = xv[i];
    Pv.set(f, t * D); tv[t] = (vy[t] - mu) / sd - (M.diff ? uPrev : 0);
    uPrev = (vy[t] - mu) / sd; stepRes(M, xv, uPrev, tmp);
  }
  var lams = p.autoLam && nv > 5 ? [] : [Math.pow(10, p.loglam)], best = null;
  if (!lams.length) for (var e = -10; e <= 1.001; e += 1) lams.push(Math.pow(10, e));
  lams.forEach(function (lam, q) {
    if (best && ctx.timeLeft() < 0) return;
    var w = ridgeSolve(G, c, D, lam), se = 0, sv = 0, k2;
    for (k2 = 0; k2 < rows; k2++) { var s1 = 0; for (j = 0; j < D; j++) s1 += Phi[k2 * D + j] * w[j]; se += (s1 - tg[k2]) * (s1 - tg[k2]); }
    for (k2 = 0; k2 < nv; k2++) { var s2 = 0; for (j = 0; j < D; j++) s2 += Pv[k2 * D + j] * w[j]; sv += (s2 - tv[k2]) * (s2 - tv[k2]); }
    var tr = se / rows * sd * sd, va = nv ? sv / nv * sd * sd : NaN;
    ctx.report(q, { loss: tr, validLoss: va, logLam: Math.log(lam) / Math.LN10 });
    if (!best || (nv ? va < best.va : true)) best = { va: va, w: w, lam: lam };
  });
  M.w = best.w; M.lam = best.lam; M.size = D;
  return M;
}
/* 截至时刻 t（含）的储备池状态：t 比模型当前的时刻早时，从最近的检查点（或 0 状态）接着跑 */
function stateAt(M, past, t) {
  var N = M.R.N, tmp = new Float64Array(N), x, from, k;
  if (t === M.t) return Float64Array.from(M.x);
  if (t > M.t) { x = Float64Array.from(M.x); from = M.t + 1; }
  else {
    var lo = 0, hi = M.cpT.length - 1, c = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (M.cpT[mid] <= t) { c = mid; lo = mid + 1; } else hi = mid - 1; }
    if (c >= 0) { x = Float64Array.from(M.cpX[c]); from = M.cpT[c] + 1; } else { x = new Float64Array(N); from = 0; }
  }
  for (k = from; k <= t; k++) stepRes(M, x, (past[k] - M.mu) / M.sd, tmp);
  return x;
}
function forecast(M, past, h) {
  var t = past.length - 1, x = stateAt(M, past, t), tmp = new Float64Array(M.R.N), u = (past[t] - M.mu) / M.sd, out = new Float64Array(h);
  for (var s = 0; s < h; s++) {
    var o = readout(M, x, u), un = M.diff ? u + o : o;
    out[s] = M.mu + M.sd * un;
    if (s + 1 < h) { stepRes(M, x, un, tmp); u = un; }
  }
  return out;
}
function update(M, yNew) {
  stepRes(M, M.x, (yNew - M.mu) / M.sd, new Float64Array(M.R.N)); M.t++;
  if ((M.t + 1) % 32 === 0) { M.cpT.push(M.t); M.cpX.push(Float32Array.from(M.x)); }
}
function inspect(M) {
  return { layers: [{ name: "读出权重 w_out（常数、输入、N 个储备池单元）", rows: 1, cols: M.w.length, data: Float32Array.from(M.w) }],
    activations: [{ name: "训练末尾的储备池状态", data: Float32Array.from(M.x) }],
    text: "N = " + M.R.N + "，每个神经元 " + M.R.deg + " 个连接；随机矩阵原来的谱半径约 " + M.R.rho0.toFixed(3) + "，缩放到 ρ = " + M.rho + "；泄漏率 a = " + M.leak + "；岭参数 λ = " + M.lam.toExponential(1) + "。" };
}
`),
  docs: md`
## 模型
**储备池计算**：一个固定的、随机的循环网络（储备池）
$$x_t=(1-a)\,x_{t-1}+a\tanh\big(Wx_{t-1}+w_{\text{in}}u_t+b\big),\qquad u_t=\frac{y_t-\mu}\sigma,$$
$W$ 是 $N\times N$ 的稀疏随机矩阵（每行若干个 $U(-1,1)$ 的非零元），缩放到给定的谱半径 $\rho$；$w_{\text{in}}$、$b$ 也随机固定。**只训练读出层**：$\hat u_{t+1}=w_{\text{out}}^\top[1,u_t,x_t]$（或预测变化量 $u_{t+1}-u_t$）。多步预测是闭环的：把 $\hat u_{t+1}$ 当作下一步的输入喂回储备池。

## 损失与训练
让储备池把训练段从头"听"一遍（丢掉开头 washout 步），收集状态，读出层用岭回归的闭式解。岭参数 $\lambda$ 默认在 $10^{-10},\dots,10$ 上挑：从训练末尾的状态接着跑过验证段（在一份拷贝上），取一步预测误差最小的那个；曲线的横轴是第几个 $\lambda$。谱半径用 Gelfand 公式估计：对随机向量做 300 次幂迭代，取后 200 次的平均增长率。

## 参数怎么调
- **谱半径 ρ**（0.8–1.0）与**泄漏率 a**决定记忆的长短：混沌序列上 $\rho\approx0.9$、$a\approx0.3$–$0.7$ 常常不错；慢变的序列用小的 $a$。
- **N**：越大越强（读出层的特征越多），代价是 $O(N^2)$ 的读出求解；几百通常够用。
- **输入缩放**：太大时 tanh 饱和（储备池变成二值的），太小时近似线性。
- 闭环多步预测会累积误差；评价步长大时，可以把读出目标改成"变化量"试试。

## 复杂度
储备池每步 $O(N\cdot\text{连接数})$；读出 $O(TN^2+N^3)$。预测：从最近的检查点（每 32 步一个）跑到原点，再闭环 $h$ 步，每步 $O(N\cdot\text{连接数})$。

## 什么时候好用、什么时候失效
确定性的混沌序列（洛伦兹、Mackey–Glass）上，它用很少的训练时间就能做出很好的短期预测，经常好过同样大小的、用反向传播训练的网络。随机性强的序列（随机游走、收益率）上它和其他方法一样无能为力，而且读出层容易对储备池的噪声过拟合（这时 $\lambda$ 会被选得很大）。结果随储备池的随机种子有一定波动。

## 理论
**定义（回声性质）.** 对给定的输入集合，若对任意输入序列 $(u_t)$ 与任意两个初始状态 $x_0,x_0'$，对应的状态序列满足 $\lVert x_t-x_t'\rVert\to0$（$t\to\infty$），就说网络有回声性质：状态最终只由输入的历史决定，"忘掉"了初值。

**定理（一个充分条件，Jaeger 2001；泄漏的情形）.** 若 $\sigma_{\max}(W)<1$（最大奇异值，即算子 2-范数），则对任意输入，$\lVert x_t-x_t'\rVert\le\big(1-a+a\,\sigma_{\max}(W)\big)^t\lVert x_0-x_0'\rVert$，所以回声性质成立（$0<a\le1$）。

*证明.* 两条轨迹由同一个输入驱动，
$x_t-x_t'=(1-a)(x_{t-1}-x_{t-1}')+a\big[\tanh(Wx_{t-1}+c_t)-\tanh(Wx_{t-1}'+c_t)\big]$，$c_t=w_{\text{in}}u_t+b$。$\tanh$ 逐分量 1-Lipschitz，所以方括号的范数 $\le\lVert W(x_{t-1}-x_{t-1}')\rVert\le\sigma_{\max}(W)\lVert x_{t-1}-x_{t-1}'\rVert$。由三角不等式得到压缩因子 $1-a+a\sigma_{\max}<1$，迭代即得。$\square$

**谱半径的角色.** $\rho(W)\le\sigma_{\max}(W)$，所以"$\rho<1$"比上面的充分条件弱，一般**不能**保证回声性质；但若 $\rho(W)>1$，零输入下原点是不稳定的不动点，回声性质对含零输入的输入集合不成立（Jaeger 2001）。实践中把 $\rho$ 设在 1 附近、略小于 1，是在"记得久"和"忘得掉初值"之间的经验折中。$\rho(W)=\lim_k\lVert W^k\rVert^{1/k}$（Gelfand 公式），这里用 $\lVert W^kv\rVert^{1/k}$ 对随机的 $v$ 估计。

参考：H. Jaeger, The "echo state" approach to analysing and training recurrent neural networks, GMD Report 148 (2001)；H. Jaeger 等, Optimization and applications of echo state networks with leaky-integrator neurons, *Neural Networks* 20 (2007)；M. Lukoševičius, H. Jaeger, Reservoir computing approaches, *Computer Science Review* 3 (2009)；J. Pathak 等, *Phys. Rev. Lett.* 120 (2018)。
`
});

/*@@MORE@@*/

return ALGOS;
})();
if (typeof module !== "undefined" && module.exports) { module.exports = QL_MLALGOS; module.exports.GROUPS = QL_MLALGO_GROUPS; }
