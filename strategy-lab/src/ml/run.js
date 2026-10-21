// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 线程里的运行器
 * 一次运行 = 生成数据 → 划分（算法看不到测试集）→ 编译好的算法 fit → 在训练 / 验证 / 测试上预测 → 算指标、逐样本损失、
 * 基线、理论最优、置换重要性、模型内部 → 一个结果对象（格式见 src/ml/DESIGN.md §5）。
 * 这个函数会被 toString() 拼进后台线程，所以只用参数 QL 和标准 JavaScript。 */
function QL_MLRUN_INSTALL(QL) {
"use strict";
var R = {};
var MAX_CURVE = 2000, MAX_SNAPS = 60, GRID = 48;

function now() { return QL.nowMs ? QL.nowMs() : Date.now(); }
function isFn(f) { return typeof f === "function"; }

/* ---------- 划分 ---------- */
function shuffleInPlace(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = rng.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function range(n) { var a = new Int32Array(n); for (var i = 0; i < n; i++) a[i] = i; return a; }
function sorted(arr) { return Int32Array.from(arr).sort(); }
/** 按数据集的规定或默认规则划分，返回三份下标（升序）。fr = { train, valid }，剩下的是测试集 */
R.split = function (def, data, fr, rng) {
  var n = data.n, by = def.split && def.split.by;
  if (data.splitIdx) return { train: sorted(data.splitIdx.train), valid: sorted(data.splitIdx.valid), test: sorted(data.splitIdx.test), by: "custom" };
  if (data.groups) by = "group";
  if (!by) by = def.kind === "classification" ? "stratified" : "random";
  var ft = fr.train, fv = fr.valid, tr = [], va = [], te = [], i;
  function cut(list) {   // 一段下标按比例切三份；每份至少一个（样本够的话）
    var m = list.length, a = Math.round(m * ft), b = Math.round(m * (ft + fv));
    if (m >= 3) { a = Math.max(1, Math.min(m - 2, a)); b = Math.max(a + 1, Math.min(m - 1, b)); }
    for (var q = 0; q < m; q++) (q < a ? tr : q < b ? va : te).push(list[q]);
  }
  if (by === "stratified") {
    var k = data.classes ? data.classes.length : 0, buckets = [];
    for (i = 0; i < k; i++) buckets.push([]);
    for (i = 0; i < n; i++) buckets[data.y[i]].push(i);
    buckets.forEach(function (b) { cut(shuffleInPlace(b, rng)); });
  } else if (by === "group") {
    var gs = {}, order = [];
    for (i = 0; i < n; i++) { var g = data.groups[i]; if (!gs[g]) { gs[g] = []; order.push(g); } gs[g].push(i); }
    shuffleInPlace(order, rng);
    var got = 0;
    order.forEach(function (g) { var list = gs[g], dest = got < ft * n ? tr : got < (ft + fv) * n ? va : te; for (var q = 0; q < list.length; q++) dest.push(list[q]); got += list.length; });
    if (!va.length || !te.length) throw new Error("数据里的组太少，没法按组划分出训练、验证、测试三份。");
  } else cut(shuffleInPlace(Array.from(range(n)), rng));
  return { train: sorted(tr), valid: sorted(va), test: sorted(te), by: by };
};
/** 取出一份子集（只含算法该看到的东西） */
R.subset = function (def, data, idx) {
  var d = data.d, n = idx.length, X = new Float64Array(n * d), cls = def.kind === "classification", y = cls ? new Int32Array(n) : new Float64Array(n), i, j;
  for (i = 0; i < n; i++) { var r = idx[i]; for (j = 0; j < d; j++) X[i * d + j] = data.X[r * d + j]; y[i] = data.y[r]; }
  return { X: X, y: y, n: n, d: d, k: cls ? data.classes.length : 0, classes: data.classes || null, featureNames: data.featureNames || null, shape: data.shape || null, tokens: data.tokens || null, kind: def.kind, index: idx };
};
function gatherF(src, idx) { var o = new Float64Array(idx.length); for (var i = 0; i < idx.length; i++) o[i] = src[idx[i]]; return o; }

/* ---------- 检查数据与预测 ---------- */
function checkData(def, data) {
  if (!data || typeof data !== "object") throw new Error("数据集 " + def.id + " 没有生成数据。");
  if (def.kind === "forecast") {
    if (!(data.y && data.y.length >= 30)) throw new Error("时间序列太短（至少要 30 个点）。");
    for (var t = 0; t < data.y.length; t++) if (!isFinite(data.y[t])) throw new Error("时间序列的第 " + t + " 个值不是有限的数。");
    return;
  }
  if (!(data.n > 0 && data.d > 0) || !data.X || data.X.length !== data.n * data.d || !data.y || data.y.length !== data.n) throw new Error("数据集 " + def.id + " 的形状不对：X 应有 n×d 个数，y 应有 n 个。");
  if (def.kind === "classification") {
    var k = data.classes ? data.classes.length : 0; if (k < 2) throw new Error("分类数据至少要有两类。");
    for (var i = 0; i < data.n; i++) if (!(data.y[i] >= 0 && data.y[i] < k) || data.y[i] !== Math.floor(data.y[i])) throw new Error("第 " + i + " 个样本的类别编号不在 0 到 " + (k - 1) + " 之间。");
  }
}
/** 把算法的输出整理成规定的格式；不合规时给出说得清的错误 */
function cleanPred(kind, out, n, k, who) {
  if (!out || typeof out.length !== "number") throw new Error(who + " 没有返回数组。");
  var want = kind === "classification" ? n * k : n;
  if (out.length !== want) throw new Error(who + " 返回了 " + out.length + " 个数，应该是 " + want + " 个" + (kind === "classification" ? "（每个样本 " + k + " 个类别的概率，按行排）" : "") + "。");
  var o = new Float64Array(want), i, c;
  if (kind !== "classification") { for (i = 0; i < n; i++) { o[i] = +out[i]; if (!isFinite(o[i])) throw new Error(who + " 的第 " + i + " 个预测不是有限的数。"); } return o; }
  for (i = 0; i < n; i++) {
    var s = 0;
    for (c = 0; c < k; c++) { var v = +out[i * k + c]; if (!(v >= 0) || !isFinite(v)) throw new Error(who + " 的第 " + i + " 行概率里有负数或不是数的值（" + v + "）。"); o[i * k + c] = v; s += v; }
    if (!(s > 0)) throw new Error(who + " 的第 " + i + " 行概率全是 0。");
    if (Math.abs(s - 1) > 1e-3) throw new Error(who + " 的第 " + i + " 行概率加起来是 " + s.toPrecision(4) + "，应该是 1（是不是忘了做 softmax？）。");
    for (c = 0; c < k; c++) o[i * k + c] /= s;
  }
  return o;
}
function predictIn(A, model, sub, kind, who) {
  var out = A.predict(model, sub.X, sub.n);
  return cleanPred(kind, out, sub.n, sub.k, who);
}

/* ---------- 冻住 ---------- */
function deepFreeze(o, depth) {
  if (!o || (typeof o !== "object" && typeof o !== "function") || Object.isFrozen(o) || depth > 5) return;
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach(function (k) { var d = Object.getOwnPropertyDescriptor(o, k); if (d && "value" in d) deepFreeze(d.value, depth + 1); });
}
R.freezeLibs = function () { [QL.nn, QL.mlstats, QL.mlreg, QL.mltoy].forEach(function (x) { if (x) deepFreeze(x, 0); }); };

/* ---------- 快照：给动画用 ---------- */
function bounds(data) {
  var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], d = data.d;
  for (var i = 0; i < data.n; i++) for (var j = 0; j < 2; j++) { var v = data.X[i * d + j]; if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
  for (j = 0; j < 2; j++) { var pad = (hi[j] - lo[j]) * 0.08 || 0.5; lo[j] -= pad; hi[j] += pad; }
  return { x0: lo[0], x1: hi[0], y0: lo[1], y1: hi[1] };
}
function snapKind(def, data) {
  if (def.kind === "forecast") return "";
  if (data.tokens) return "embed";
  if (data.d === 2 && !data.shape) return "grid2d";
  if (data.d === 1 && def.kind === "regression") return "fn1d";
  return "";
}
function makeSnapper(def, data, A, k) {
  var kind = snapKind(def, data), b = kind === "grid2d" ? bounds(data) : null, gridX = null, xs = null, lo1 = 0, hi1 = 0;
  if (kind === "grid2d") {
    gridX = new Float64Array(GRID * GRID * 2);
    for (var j = 0; j < GRID; j++) for (var i = 0; i < GRID; i++) { var q = j * GRID + i; gridX[2 * q] = b.x0 + (i + 0.5) / GRID * (b.x1 - b.x0); gridX[2 * q + 1] = b.y0 + (j + 0.5) / GRID * (b.y1 - b.y0); }
  } else if (kind === "fn1d") {
    lo1 = Infinity; hi1 = -Infinity; for (var t = 0; t < data.n; t++) { if (data.X[t] < lo1) lo1 = data.X[t]; if (data.X[t] > hi1) hi1 = data.X[t]; }
    var pad = (hi1 - lo1) * 0.05 || 0.5; lo1 -= pad; hi1 += pad; xs = new Float64Array(200); for (t = 0; t < 200; t++) xs[t] = lo1 + (t + 0.5) / 200 * (hi1 - lo1);
  }
  return function (model) {
    if (kind === "grid2d") { var out = cleanPred(def.kind, A.predict(model, gridX, GRID * GRID), GRID * GRID, k, "predict（画决策面时）"); return { kind: kind, data: { nx: GRID, ny: GRID, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, k: k, values: Float32Array.from(out) } }; }
    if (kind === "fn1d") { var ys = cleanPred("regression", A.predict(model, xs, 200), 200, 0, "predict（画曲线时）"); return { kind: kind, data: { xs: Float32Array.from(xs), ys: Float32Array.from(ys) } }; }
    if (kind === "embed" && isFn(A.inspect)) { var ins = A.inspect(model); if (ins && ins.embedding && ins.embedding.data) return { kind: kind, data: { rows: ins.embedding.rows, cols: ins.embedding.cols, data: Float32Array.from(ins.embedding.data) } }; }
    return null;
  };
}

/* ---------- 置换重要性 ---------- */
function importance(def, va, A, model, k, rng, deadline) {
  var d = va.d; if (d > 40 || va.n < 10 || va.shape || va.tokens) return null;
  var cls = def.kind === "classification";
  function score(pred) { var M = QL.mlstats.metrics(def.kind, pred, va.y, k); return cls ? M.acc : M.mse; }
  var base = score(predictIn(A, model, va, def.kind, "predict")), out = [], X0 = va.X, Xp = new Float64Array(X0.length), sub = { X: Xp, y: va.y, n: va.n, d: d, k: va.k };
  for (var j = 0; j < d; j++) {
    if (now() > deadline) break;
    var drops = [];
    for (var rep = 0; rep < 3; rep++) {
      Xp.set(X0);
      var perm = shuffleInPlace(Array.from(range(va.n)), rng);
      for (var i = 0; i < va.n; i++) Xp[i * d + j] = X0[perm[i] * d + j];
      var s = score(predictIn(A, model, sub, def.kind, "predict"));
      drops.push(cls ? base - s : s - base);   // 都换成"变差了多少"：越大越重要
    }
    var m = (drops[0] + drops[1] + drops[2]) / 3, v = 0; drops.forEach(function (x) { v += (x - m) * (x - m); });
    out.push({ name: va.featureNames ? va.featureNames[j] : "x" + (j + 1), drop: m, se: Math.sqrt(v / 2 / 3) });
  }
  return out.length ? { metric: cls ? "acc" : "mse", base: base, items: out } : null;
}

/* ---------- 截断：别让结果大得离谱 ---------- */
function trimInternals(x) {
  if (!x || typeof x !== "object") return null;
  var budget = { left: 400000 };
  function arr(a) { if (!a || typeof a.length !== "number") return a; var n = Math.min(a.length, budget.left); budget.left -= n; var o = new Float32Array(n); for (var i = 0; i < n; i++) o[i] = +a[i]; return o; }
  var out = {};
  if (Array.isArray(x.layers)) out.layers = x.layers.slice(0, 12).map(function (l) { return { name: String(l.name || ""), rows: l.rows | 0, cols: l.cols | 0, data: arr(l.data) }; });
  if (x.embedding && x.embedding.data) out.embedding = { rows: x.embedding.rows | 0, cols: x.embedding.cols | 0, data: arr(x.embedding.data), labels: Array.isArray(x.embedding.labels) ? x.embedding.labels.slice(0, 2000).map(String) : null };
  if (Array.isArray(x.activations)) out.activations = x.activations.slice(0, 8).map(function (a) { return { name: String(a.name || ""), data: arr(a.data) }; });
  if (x.tree && Array.isArray(x.tree.nodes)) out.tree = { nodes: x.tree.nodes.slice(0, 2000).map(function (nd) { return { f: nd.f | 0, thr: +nd.thr, left: nd.left | 0, right: nd.right | 0, value: Array.isArray(nd.value) ? nd.value.slice(0, 50).map(Number) : +nd.value, n: nd.n | 0 }; }) };
  if (Array.isArray(x.coef)) out.coef = x.coef.slice(0, 500).map(function (c) { return { name: String(c.name), value: +c.value }; });
  if (typeof x.text === "string") out.text = x.text.slice(0, 4000);
  if (x.extra && typeof x.extra === "object") { try { out.extra = JSON.parse(JSON.stringify(x.extra)); } catch (e) {} }
  return out;
}
function decimate(curve, max) {
  if (curve.length <= max) return curve;
  var out = [], step = (curve.length - 1) / (max - 1);
  for (var i = 0; i < max; i++) out.push(curve[Math.round(i * step)]);
  return out;
}
/** 模型里（往下最多两层）有 params() 的对象：自动求导库的层或网络 */
function nnParts(model) {
  var out = [], seen = [];
  function visit(o, depth) {
    if (!o || typeof o !== "object" || seen.indexOf(o) >= 0 || seen.length > 200) return; seen.push(o);
    if (isFn(o.params)) { out.push(o); return; }
    if (depth >= 2) return;
    var ks = Object.keys(o); for (var i = 0; i < ks.length && i < 50; i++) { var v = o[ks[i]]; if (v && typeof v === "object" && !(ArrayBuffer.isView(v))) visit(v, depth + 1); }
  }
  visit(model, 0); return out;
}
function nnTensors(model) {
  var ts = [];
  nnParts(model).forEach(function (o) { try { (o.params() || []).forEach(function (t) { if (t && t.data && Array.isArray(t.shape) && ts.indexOf(t) < 0) ts.push(t); }); } catch (e) {} });
  return ts;
}
function countParams(model) {
  if (!model || typeof model !== "object") return null;
  if (typeof model.size === "number") return model.size;
  if (QL.nn) { var ts = nnTensors(model); if (ts.length) { var n = 0; ts.forEach(function (t) { n += t.data.length; }); return n; } }
  return null;
}
/** inspect 没有给权重时，从自动求导库的层里取出来（二维的直接用；卷积核按 输出通道 × 其余 摊平） */
function autoLayers(model) {
  if (!QL.nn) return [];
  return nnTensors(model).filter(function (t) { return t.shape.length >= 2; }).slice(0, 8).map(function (t, i) {
    var rows = t.shape[0], cols = t.data.length / rows;
    return { name: t.shape.length > 2 ? "第 " + (i + 1) + " 组卷积核（形状 " + t.shape.join("×") + "，按输出通道排成行）" : "第 " + (i + 1) + " 个权重矩阵", rows: rows, cols: cols, data: t.data };
  });
}

/* ---------- 数据：生成与预览 ---------- */
R.makeData = function (m) {
  var def;
  if (m.dataset.inline) {   // 导入的 CSV：数据和描述都随任务一起送来
    var di = m.dataset.inlineDef || {};
    def = { id: "csv", family: di.family || "tabular", kind: di.kind || "regression", name: String(di.name || "导入的数据"), params: [], plot: di.plot || "", split: di.split || null, gen: null };
  } else {
    def = QL.mlreg.get(m.dataset.id); if (!def) throw new Error("没有这个数据集：" + m.dataset.id);
  }
  var p = def.gen ? QL.mlreg.clean(def, m.dataset.params || {}) : {}, seed = m.dataset.seed | 0;
  var data = m.dataset.inline ? m.dataset.inline : def.gen(p, new QL.RNG(seed, 101, 0));
  if (m.dataset.inline && def.kind === "classification" && data.y && !(data.y instanceof Int32Array)) data.y = Int32Array.from(data.y);
  checkData(def, data);
  return { def: def, p: p, data: data, seed: seed };
};
R.preview = function (def, data, sp, p) {
  var out = { plot: def.plot || "" };
  if (def.kind === "forecast") {
    var T = data.y.length, stride = Math.max(1, Math.ceil(T / 2000)), ys = [];
    for (var t = 0; t < T; t += stride) ys.push(data.y[t]);
    out.series = { y: Float32Array.from(ys), stride: stride, T: T, label: data.label || "", freq: data.freq || "step", t1: sp ? sp.t1 : 0, t2: sp ? sp.t2 : 0 };
    return out;
  }
  var cls = def.kind === "classification";
  if (data.d === 2 && !data.shape) {
    var idx = sp ? sp.train : range(data.n), m = Math.min(idx.length, 900), pts = new Float32Array(m * 3);
    for (var i = 0; i < m; i++) { var r = idx[Math.floor(i * idx.length / m)]; pts[3 * i] = data.X[r * 2]; pts[3 * i + 1] = data.X[r * 2 + 1]; pts[3 * i + 2] = data.y[r]; }
    out.scatter = { pts: pts, cls: cls, k: cls ? data.classes.length : 0 };
  } else if (data.d === 1) {
    var mm = Math.min(data.n, 900), p1 = new Float32Array(mm * 2);
    for (i = 0; i < mm; i++) { var r1 = Math.floor(i * data.n / mm); p1[2 * i] = data.X[r1]; p1[2 * i + 1] = data.y[r1]; }
    out.xy = { pts: p1, truth: null };
    // 一维回归：数据集给了理论最优（真函数）时，在 200 个点上算出来画成虚线
    if (def.kind === "regression" && isFn(def.oracle)) {
      try {
        var O1 = def.oracle(p || {}), lo1 = Infinity, hi1 = -Infinity, t1;
        for (t1 = 0; t1 < data.n; t1++) { if (data.X[t1] < lo1) lo1 = data.X[t1]; if (data.X[t1] > hi1) hi1 = data.X[t1]; }
        var gx = new Float64Array(200); for (t1 = 0; t1 < 200; t1++) gx[t1] = lo1 + (t1 + 0.5) / 200 * (hi1 - lo1);
        var gy = O1 && isFn(O1.predict) ? O1.predict(gx, 200) : null;
        if (!(gy && gy.length === 200)) { gy = new Float64Array(200); for (t1 = 0; t1 < 200; t1++) { var v1 = O1.predict(gx.subarray(t1, t1 + 1)); gy[t1] = typeof v1 === "number" ? v1 : v1[0]; } }
        out.xy.truth = { x: Array.from(gx), y: Array.from(gy) };
      } catch (e) { out.xy.truth = null; }
    }
  } else if (data.shape) {
    var nImg = Math.min(32, data.n), d = data.d, imgs = new Float32Array(nImg * d), labs = new Int32Array(nImg), pick = [];
    var step = Math.max(1, Math.floor(data.n / nImg));
    for (i = 0; i < nImg; i++) pick.push((i * step + (i * 7919) % step) % data.n);
    pick.forEach(function (r2, q) { for (var j = 0; j < d; j++) imgs[q * d + j] = data.X[r2 * d + j]; labs[q] = data.y[r2]; });
    out.images = { shape: data.shape, data: imgs, labels: labs, n: nImg };
  }
  if (data.classes) { var cnt = new Int32Array(data.classes.length); for (i = 0; i < data.n; i++) cnt[data.y[i]]++; out.classCounts = Array.from(cnt); }
  out.n = data.n; out.d = data.d; out.classes = data.classes || null; out.featureNames = data.featureNames || null; out.tokens = data.tokens || null; out.shape = data.shape || null;
  if (data.meta) { try { out.meta = JSON.parse(JSON.stringify(data.meta, function (k, v) { return v && typeof v === "object" && typeof v.length === "number" && !Array.isArray(v) ? (v.length > 50000 ? undefined : Array.from(v)) : v; })); } catch (e) { out.meta = null; } }
  return out;
};

/* ---------- 一次运行：监督学习 ----------
 * 拆成三步，第二期的本机引擎只替换中间那一步：
 *   prepSupervised  生成数据、划分、取子集、决策面的网格（本机引擎拿到的就是这里的训练/验证集和测试集的输入）
 *   本地拟合        在线程里 fit、predict，得到原始输出 outs
 *   scoreSupervised 用原始输出算指标、逐样本损失、基线、理论最优（两种运行方式共用这一段，所以指标的定义只有一份） */
function fracOf(def, p, opts) {
  if (def.family === "toy" && p.trainFrac != null) return { train: +p.trainFrac, valid: (1 - p.trainFrac) / 2 };
  return { train: opts.split && opts.split.train || (def.split && def.split.train) || 0.6, valid: opts.split && opts.split.valid || (def.split && def.split.valid) || 0.2 };
}
R.prepSupervised = function (m, D) {
  var def = D.def, data = D.data, opts = m.opts || {};
  var sp = R.split(def, data, fracOf(def, D.p, opts), new QL.RNG(opts.splitSeed == null ? D.seed : opts.splitSeed, 202, 0));
  // 导入的表格里有缺失值：划分之后用训练集各列的中位数补（不让验证集、测试集的信息漏进来）
  if (data.meta && data.meta.hasNaN && QL.mlreg.impute) { data = D.data = QL.mlreg.impute(data, sp.train); }
  var tr = R.subset(def, data, sp.train), va = R.subset(def, data, sp.valid), te = R.subset(def, data, sp.test);
  if (!tr.n || !va.n || !te.n) throw new Error("划分之后有一份是空的（训练 " + tr.n + "、验证 " + va.n + "、测试 " + te.n + "）：样本太少，或者比例不对。");
  // 训练集太大时只在一部分上算训练指标：第 q 个取第 floor(q·n/20000) 行（本机引擎按同样的规则取）
  var trE = tr; if (tr.n > 20000) { var sub = new Int32Array(20000); for (var q = 0; q < 20000; q++) sub[q] = Math.floor(q * tr.n / 20000); trE = R.subset(def, { X: tr.X, y: tr.y, n: tr.n, d: tr.d, classes: tr.classes, featureNames: tr.featureNames, shape: tr.shape, tokens: tr.tokens }, sub); }
  return { def: def, D: D, sp: sp, tr: tr, va: va, te: te, trE: trE, k: tr.k };
};
R.scoreSupervised = function (P, outs) {
  var def = P.def, D = P.D, tr = P.tr, va = P.va, te = P.te, trE = P.trE, k = P.k, S = QL.mlstats;
  var pTr = cleanPred(def.kind, outs.train, trE.n, k, "predict（训练集）"), pVa = cleanPred(def.kind, outs.valid, va.n, k, "predict（验证集）"), pTe = cleanPred(def.kind, outs.test, te.n, k, "predict（测试集）");
  var res = {
    ok: true, api: "supervised", kind: def.kind, k: k, family: def.family,
    split: { nTrain: tr.n, nValid: va.n, nTest: te.n, by: P.sp.by },
    metrics: { train: S.metrics(def.kind, pTr, trE.y, k), valid: S.metrics(def.kind, pVa, va.y, k), test: S.metrics(def.kind, pTe, te.y, k) },
    primary: def.kind === "classification" ? "acc" : "mse", higherBetter: def.kind === "classification",
    pred: { valid: pVa, test: pTe }, truth: { valid: va.y, test: te.y }, index: { valid: va.index, test: te.index },
    curve: decimate(outs.curve || [], MAX_CURVE), snaps: outs.snaps || [], log: outs.log || [], fitMs: outs.fitMs, predUs: outs.predUs, size: outs.size == null ? null : outs.size,
    importance: outs.importance || null, internals: outs.internals || null, engine: outs.engine || "js"
  };
  var eVa = S.perExample(def.kind, pVa, va.y, k), eTe = S.perExample(def.kind, pTe, te.y, k);
  res.loss = { valid: Float32Array.from(eVa.loss), test: Float32Array.from(eTe.loss) };
  if (eVa.correct) res.correct = { valid: eVa.correct, test: eTe.correct };
  // 基线：训练集均值 / 按类别比例猜
  var bVa = S.baselinePred(def.kind, tr, va.n, k), bTe = S.baselinePred(def.kind, tr, te.n, k), ebVa = S.perExample(def.kind, bVa, va.y, k), ebTe = S.perExample(def.kind, bTe, te.y, k);
  res.baseline = { name: def.kind === "classification" ? "按训练集的类别比例猜" : "训练集的均值", metrics: { valid: S.metrics(def.kind, bVa, va.y, k), test: S.metrics(def.kind, bTe, te.y, k) },
    loss: { valid: Float32Array.from(ebVa.loss), test: Float32Array.from(ebTe.loss) }, correct: ebVa.correct ? { valid: ebVa.correct, test: ebTe.correct } : null };
  // 理论最优（数据集给了的话）
  if (isFn(def.oracle)) {
    try {
      var O = def.oracle(D.p);
      if (O && isFn(O.predict)) {
        // 两种写法都认：predict(X, n) 一次给整批（同算法的 predict），或者 predict(x) 一行一行地给
        var orc = function (sb) {
          var want = def.kind === "classification" ? sb.n * k : sb.n, b = null;
          try { b = O.predict(sb.X, sb.n); } catch (e) { b = null; }
          if (b && typeof b.length === "number" && b.length === want && sb.n > 1) return cleanPred(def.kind, b, sb.n, k, "理论最优的预测");
          var o = new Float64Array(want), x = new Float64Array(sb.d);
          for (var i = 0; i < sb.n; i++) { for (var j = 0; j < sb.d; j++) x[j] = sb.X[i * sb.d + j]; var v = O.predict(x); if (def.kind === "classification") for (var c = 0; c < k; c++) o[i * k + c] = v[c]; else o[i] = typeof v === "number" ? v : v[0]; }
          return cleanPred(def.kind, o, sb.n, k, "理论最优的预测");
        };
        var oVa = orc(va), oTe = orc(te);
        res.oracle = { note: O.note || "", metrics: { valid: S.metrics(def.kind, oVa, va.y, k), test: S.metrics(def.kind, oTe, te.y, k) }, loss: { valid: Float32Array.from(S.perExample(def.kind, oVa, va.y, k).loss), test: Float32Array.from(S.perExample(def.kind, oTe, te.y, k).loss) } };
      }
    } catch (e) { res.oracle = { note: "理论最优没算出来：" + String(e && e.message || e), metrics: null }; }
  }
  if (isFn(def.bayes)) { try { res.bayes = def.bayes(D.p); } catch (e) {} }
  res.data = R.preview(def, D.data, P.sp, D.p);
  return res;
};
/** 二维数据画决策面用的网格（本机引擎也拿这个网格去预测） */
R.gridOf = function (def, data) { return snapKind(def, data) === "grid2d" ? makeGrid(bounds(data)) : null; };
/** 本机引擎拍快照用的网格：二维是 48×48 的决策面网格（和 makeSnapper 同一套坐标），一维回归是 200 个点 */
R.snapGrid = function (def, data) {
  var kind = snapKind(def, data);
  if (kind === "grid2d") { var b = bounds(data); return { kind: kind, X: makeGrid(b), bounds: b, nx: GRID, ny: GRID }; }
  if (kind === "fn1d") {
    var lo1 = Infinity, hi1 = -Infinity, t; for (t = 0; t < data.n; t++) { if (data.X[t] < lo1) lo1 = data.X[t]; if (data.X[t] > hi1) hi1 = data.X[t]; }
    var pad = (hi1 - lo1) * 0.05 || 0.5, xs = new Float64Array(200); lo1 -= pad; hi1 += pad; for (t = 0; t < 200; t++) xs[t] = lo1 + (t + 0.5) / 200 * (hi1 - lo1);
    return { kind: kind, X: xs };
  }
  return kind ? { kind: kind, X: null } : null;
};
function makeGrid(b) {
  var X = new Float64Array(GRID * GRID * 2);
  for (var j = 0; j < GRID; j++) for (var i = 0; i < GRID; i++) { var q = j * GRID + i; X[2 * q] = b.x0 + (i + 0.5) / GRID * (b.x1 - b.x0); X[2 * q + 1] = b.y0 + (j + 0.5) / GRID * (b.y1 - b.y0); }
  return X;
}
/** 本机引擎送回来的决策面原始值 → 和本地运行一样的快照 */
R.wrapGridSnap = function (def, data, k, step, values) {
  var b = bounds(data), n = GRID * GRID, v = cleanPred(def.kind, values, n, k, "决策面");
  return { step: +step, kind: "grid2d", data: { nx: GRID, ny: GRID, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, k: k, values: Float32Array.from(v) } };
};
function runSupervised(m, D, A, post) {
  var def = D.def, data = D.data, opts = m.opts || {}, t0 = now(), budget = Math.max(1000, opts.budgetMs || 20000), deadline = t0 + budget;
  var P = R.prepSupervised(m, D), tr = P.tr, va = P.va, te = P.te, k = P.k;
  post({ phase: "data", msg: "数据：训练 " + tr.n + "、验证 " + va.n + "、测试 " + te.n });
  var curve = [], snaps = [], logs = [], lastPost = 0, minGap = 0, lastSnapStep = -Infinity, snap = makeSnapper(def, data, A, k);
  var params = Object.freeze(Object.assign({}, m.algo.params || {}));
  var ctx = Object.freeze({
    budgetMs: budget,
    timeLeft: function () { return deadline - now(); },
    log: function (s) { if (logs.length < 200) logs.push(String(s).slice(0, 500)); },
    report: function (step, obj) {
      var pt = { step: +step }; for (var key in obj) if (typeof obj[key] === "number" && isFinite(obj[key])) pt[key] = obj[key];
      curve.push(pt);
      var tnow = now(); if (tnow - lastPost > 120) { lastPost = tnow; post({ phase: "fit", step: +step, point: pt, n: curve.length }); }
    },
    snapshot: function (step, model) {
      if (step - lastSnapStep < minGap) return;
      if (snaps.length >= MAX_SNAPS) { snaps = snaps.filter(function (s, i) { return i % 2 === 0; }); minGap = Math.max(1, minGap * 2 || (step - snaps[0].step) / MAX_SNAPS); if (step - lastSnapStep < minGap) return; }
      var s = snap(model); if (!s) return; s.step = +step; snaps.push(s); lastSnapStep = step;
      var tnow = now(); if (tnow - lastPost > 120) { lastPost = tnow; post({ phase: "fit", step: +step, snap: s, n: curve.length }); }
    }
  });
  var lib = Object.freeze({ ml: QL.ml, nn: QL.nn || null, stats: QL.mlstats, la: QL.nn ? QL.nn.la : null, toy: QL.mltoy || null, rng: new QL.RNG(D.seed, 303, (m.algo.seed | 0)) });
  if (!isFn(A.fit) || !isFn(A.predict)) throw new Error("算法的代码里要有 fit(data, p, lib, ctx) 和 predict(model, X, n) 两个函数。");
  var tFit = now(), model = A.fit({ train: tr, valid: va, kind: def.kind }, params, lib, ctx), fitMs = now() - tFit;
  if (model === undefined) throw new Error("fit 没有返回模型（最后要 return 一个对象）。");
  if (!snaps.length) { var s0 = snap(model); if (s0) { s0.step = curve.length ? curve[curve.length - 1].step : 0; snaps.push(s0); } }
  post({ phase: "eval", msg: "评估中…" });
  var tP = now(), outs = { train: A.predict(model, P.trE.X, P.trE.n), valid: A.predict(model, va.X, va.n), test: A.predict(model, te.X, te.n) };
  outs.predUs = (now() - tP) / (P.trE.n + va.n + te.n) * 1000;
  outs.curve = curve; outs.snaps = snaps; outs.log = logs; outs.fitMs = fitMs; outs.size = countParams(model);
  if (opts.importance !== false) { try { outs.importance = importance(def, va, A, model, k, new QL.RNG(D.seed, 404, 0), now() + Math.max(500, budget * 0.25)); } catch (e) { outs.importance = null; } }
  var ins = null;
  if (isFn(A.inspect)) { try { ins = A.inspect(model); } catch (e) { logs.push("inspect 出错：" + String(e && e.message || e)); } }
  if (!ins || !Array.isArray(ins.layers) || !ins.layers.length) { var al = autoLayers(model); if (al.length) { ins = ins && typeof ins === "object" ? Object.assign({}, ins) : {}; ins.layers = al; } }
  outs.internals = trimInternals(ins);
  var res = R.scoreSupervised(P, outs);
  res.ms = now() - t0;
  return res;
}

/* ---------- 一次运行：时间序列预测（滚动原点、不重训） ----------
 * 原点的定义（本机引擎照抄）：H = 预测步长；t1 = ⌊0.6T⌋，t2 = ⌊0.8T⌋；warm = min(t1 − 2, max(10, 2·季节长度))；
 * 训练段（样本内）原点 warm … t1−1−H（不调用 update）；验证段 t1−1 … t2−1−H；测试段 t2−1 … T−1−H；
 * 验证段和测试段在原点 t 预测之前，把 y[t1..t] 中还没喂过的观测依次喂给 update（如果有）；forecast(model, y[0..t], H) 预测 y[t+1..t+H]。 */
R.prepForecast = function (m, D) {
  var def = D.def, data = D.data, y = data.y instanceof Float64Array ? data.y : Float64Array.from(data.y), T = y.length, opts = m.opts || {};
  var ft = opts.split && opts.split.train || 0.6, fv = opts.split && opts.split.valid || 0.2, t1 = Math.floor(T * ft), t2 = Math.floor(T * (ft + fv));
  var H = Math.max(1, Math.min(50, (opts.horizon || D.p.horizon || 1) | 0));
  if (t1 < 20 || t2 - t1 < 5 + H || T - t2 < 5 + H) throw new Error("序列太短，划分之后验证段或测试段不够预测 " + H + " 步。");
  var warm = Math.min(t1 - 2, Math.max(10, (data.season || 0) * 2));
  return { def: def, D: D, y: y, T: T, t1: t1, t2: t2, H: H, ranges: { train: [warm, t1 - 1 - H], valid: [t1 - 1, t2 - 1 - H], test: [t2 - 1, T - 1 - H] } };
};
R.scoreForecast = function (P, outs) {
  var def = P.def, D = P.D, y = P.y, H = P.H, S = QL.mlstats, O = null;
  if (isFn(def.oracle)) { try { O = def.oracle(D.p); if (!O || !isFn(O.forecast)) O = null; } catch (e) { O = null; } }
  function pack(which) {
    var r = P.ranges[which], nO = r[1] - r[0] + 1, pred = outs[which], truth = new Float64Array(nO * H), naive = new Float64Array(nO * H), orc = O && which !== "train" ? new Float64Array(nO * H) : null;
    if (!pred || pred.length !== nO * H) throw new Error((which === "train" ? "训练段" : which === "valid" ? "验证段" : "测试段") + "的预测个数不对：应该有 " + nO + " 个原点 × " + H + " 步。");
    var pr = new Float64Array(nO * H);
    for (var q = 0; q < nO; q++) {
      var t = r[0] + q, fo = orc ? O.forecast(y.subarray(0, t + 1), H) : null;
      for (var h = 0; h < H; h++) { var v = +pred[q * H + h]; if (!isFinite(v)) throw new Error("第 " + t + " 个时刻的预测不是有限的数。"); pr[q * H + h] = v; truth[q * H + h] = y[t + 1 + h]; naive[q * H + h] = y[t]; if (orc) orc[q * H + h] = +fo[h]; }
    }
    return { pred: pr, truth: truth, naive: naive, origin: naive, orc: orc, n: nO };
  }
  var eTr = pack("train"), eVa = pack("valid"), eTe = pack("test");
  function absErr(a, b) { var o = new Float64Array(a.length); for (var i = 0; i < a.length; i++) o[i] = Math.abs(a[i] - b[i]); return o; }
  function M(e, which) { return S.metrics("forecast", which || e.pred, e.truth, 0, { origin: e.origin, naiveAbsErr: absErr(e.naive, e.truth) }); }
  function perOrigin(e, which) { var pr = which || e.pred, o = new Float32Array(e.n); for (var q = 0; q < e.n; q++) { var s = 0; for (var h = 0; h < H; h++) { var d = pr[q * H + h] - e.truth[q * H + h]; s += d * d; } o[q] = s / H; } return o; }
  var res = {
    ok: true, api: "forecast", kind: "forecast", k: 0, family: def.family, horizon: H,
    split: { nTrain: P.t1, nValid: P.t2 - P.t1, nTest: P.T - P.t2, t1: P.t1, t2: P.t2, by: "time" },
    metrics: { train: M(eTr), valid: M(eVa), test: M(eTe) }, primary: "mse", higherBetter: false,
    pred: { valid: eVa.pred, test: eTe.pred }, truth: { valid: eVa.truth, test: eTe.truth }, origins: { valid: P.ranges.valid, test: P.ranges.test },
    loss: { valid: perOrigin(eVa), test: perOrigin(eTe) },
    baseline: { name: "用最后一个观测值（朴素预测）", metrics: { valid: M(eVa, eVa.naive), test: M(eTe, eTe.naive) }, loss: { valid: perOrigin(eVa, eVa.naive), test: perOrigin(eTe, eTe.naive) } },
    curve: decimate(outs.curve || [], MAX_CURVE), snaps: [], log: outs.log || [], fitMs: outs.fitMs, size: outs.size == null ? null : outs.size, internals: outs.internals || null, engine: outs.engine || "js"
  };
  if (O) res.oracle = { note: O.note || "", metrics: { valid: M(eVa, eVa.orc), test: M(eTe, eTe.orc) }, loss: { valid: perOrigin(eVa, eVa.orc), test: perOrigin(eTe, eTe.orc) } };
  if (isFn(def.bayes)) { try { res.bayes = def.bayes(D.p); } catch (e) {} }
  res.data = R.preview(def, D.data, { t1: P.t1, t2: P.t2 }, D.p);
  return res;
};
function runForecast(m, D, A, post) {
  var opts = m.opts || {}, t0 = now(), budget = Math.max(1000, opts.budgetMs || 20000), deadline = t0 + budget;
  var P = R.prepForecast(m, D), y = P.y, H = P.H, t1 = P.t1, t2 = P.t2, data = D.data;
  if (!isFn(A.fit) || !isFn(A.forecast)) throw new Error("时间序列算法的代码里要有 fit(series, p, lib, ctx) 和 forecast(model, past, h) 两个函数。");
  post({ phase: "data", msg: "数据：训练 " + t1 + "、验证 " + (t2 - t1) + "、测试 " + (P.T - t2) + " 个时刻；预测 " + H + " 步" });
  var curve = [], logs = [], lastPost = 0, params = Object.freeze(Object.assign({}, m.algo.params || {}));
  var ctx = Object.freeze({ budgetMs: budget, timeLeft: function () { return deadline - now(); }, log: function (s) { if (logs.length < 200) logs.push(String(s).slice(0, 500)); },
    report: function (step, obj) { var pt = { step: +step }; for (var key in obj) if (typeof obj[key] === "number" && isFinite(obj[key])) pt[key] = obj[key]; curve.push(pt); var tn = now(); if (tn - lastPost > 120) { lastPost = tn; post({ phase: "fit", step: +step, point: pt, n: curve.length }); } },
    snapshot: function () {} });
  var lib = Object.freeze({ ml: QL.ml, nn: QL.nn || null, stats: QL.mlstats, la: QL.nn ? QL.nn.la : null, rng: new QL.RNG(D.seed, 303, (m.algo.seed | 0)) });
  var series = { y: y.slice(0, t1), T: t1, freq: data.freq || "step", season: data.season || 0, label: data.label || "", valid: { y: y.slice(t1, t2), start: t1 } };
  var tFit = now(), model = A.fit(series, params, lib, ctx), fitMs = now() - tFit;
  if (model === undefined) throw new Error("fit 没有返回模型（最后要 return 一个对象）。");
  post({ phase: "eval", msg: "滚动预测中…" });
  var upd = isFn(A.update), fed = t1;
  function feed(to) { if (!upd) return; while (fed < to) { A.update(model, y[fed]); fed++; } }
  function roll(which, doFeed) {
    var r = P.ranges[which], nO = r[1] - r[0] + 1, out = new Float64Array(nO * H);
    for (var q = 0; q < nO; q++) {
      var t = r[0] + q; if (doFeed) feed(t + 1);
      var f = A.forecast(model, y.subarray(0, t + 1), H);
      if (!f || f.length < H) throw new Error("forecast 应该返回长度为 " + H + " 的数组。");
      for (var h = 0; h < H; h++) out[q * H + h] = +f[h];
      if ((q & 63) === 0 && now() > deadline + budget) throw new Error("滚动预测太慢，超过了时间预算的两倍。");
    }
    return out;
  }
  var outs = { train: roll("train", false), valid: roll("valid", true), test: roll("test", true), curve: curve, log: logs, fitMs: fitMs, size: countParams(model) };
  if (isFn(A.inspect)) { try { outs.internals = trimInternals(A.inspect(model)); } catch (e) { logs.push("inspect 出错：" + String(e && e.message || e)); } }
  var res = R.scoreForecast(P, outs);
  res.ms = now() - t0;
  return res;
}

R.run = function (m, A, post) {
  var D = R.makeData(m);
  return D.def.kind === "forecast" ? runForecast(m, D, A, post) : runSupervised(m, D, A, post);
};

/* ---------- 交给线程主循环的几种任务（主循环见 src/jobs.js 的 QL.jobMain） ---------- */
QL.jobs = QL.jobs || {};
QL.jobs["ml-data"] = function (m) {
  var D = R.makeData(m), def = D.def, sp;
  if (def.kind !== "forecast") sp = R.split(def, D.data, fracOf(def, D.p, m.opts || {}), new QL.RNG(m.opts && m.opts.splitSeed != null ? m.opts.splitSeed : D.seed, 202, 0));
  else { var T = D.data.y.length, o2 = m.opts || {}, ft = o2.split && o2.split.train || 0.6, fv = o2.split && o2.split.valid || 0.2; sp = { t1: Math.floor(T * ft), t2: Math.floor(T * (ft + fv)) }; }
  var out = { preview: R.preview(def, D.data, sp, D.p), params: D.p };
  if (m.full) { out.data = D.data; out.split = sp; }
  return out;
};
/** 给本机引擎准备的数据：训练集、验证集、测试集的输入（不含测试集的答案）、决策面的网格 */
QL.jobs["ml-prep"] = function (m) {
  var D = R.makeData(m), def = D.def;
  if (def.kind === "forecast") { var F = R.prepForecast(m, D); return { api: "forecast", kind: "forecast", y: F.y, t1: F.t1, t2: F.t2, H: F.H, season: D.data.season || 0, freq: D.data.freq || "step", label: D.data.label || "" }; }
  var P = R.prepSupervised(m, D);
  function strip(s) { return { X: s.X, y: s.y, n: s.n, d: s.d, k: s.k, classes: s.classes, featureNames: s.featureNames, shape: s.shape, tokens: s.tokens }; }
  return { api: "supervised", kind: def.kind, train: strip(P.tr), valid: strip(P.va), test: { X: P.te.X, n: P.te.n, d: P.te.d, shape: P.te.shape, tokens: P.te.tokens }, grid: R.snapGrid(def, D.data), k: P.k };
};
/** 本机引擎跑完以后：用它的原始输出打分（与本地运行同一段代码） */
QL.jobs["ml-score"] = function (m) {
  var D = R.makeData(m), def = D.def, o = m.outs || {};
  if (def.kind === "forecast") { var F = R.prepForecast(m, D), r = R.scoreForecast(F, o); r.ms = o.ms; return r; }
  var P = R.prepSupervised(m, D);
  var G1 = R.snapGrid(def, D.data);
  o.snaps = (o.gridSnaps || []).map(function (g) {
    if (g.kind === "fn1d" && G1 && G1.kind === "fn1d") return { step: +g.step, kind: "fn1d", data: { xs: Float32Array.from(G1.X), ys: Float32Array.from(cleanPred("regression", g.values, 200, 0, "predict（画曲线时）")) } };
    return R.wrapGridSnap(def, D.data, P.k, g.step, g.values);
  }).concat(o.snaps || []);
  var res = R.scoreSupervised(P, o); res.ms = o.ms; return res;
};
/** 出错时从调用栈里找出线程源码的行号（页面再换算成算法代码自己的行号）：附在消息末尾，格式是 "\u0000L行号" */
function stackLine(e) {
  var st = String(e && e.stack || ""), m = /(?:blob:[^\s)]*|<anonymous>|eval[^\s)]*|Function[^\s)]*):(\d+):\d+/.exec(st);
  return m ? +m[1] : 0;
}
QL.jobs["ml-run"] = function (m, CODE, progress) {
  try { return R.run(m, CODE.algo || {}, progress); }
  catch (e) { var ln = stackLine(e); throw new Error(String(e && e.message || e) + (ln ? "\u0000L" + ln : "")); }
};
QL.mlrun = R;
return R;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLRUN_INSTALL;
