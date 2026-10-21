// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 · 内置算法库（src/ml/algos.js）的测试。运行：node test/ml-algos.test.js（在 strategy-lab 目录下，或任意目录用绝对路径）
// 一、文件与导出；二、每个条目的格式（编号、分组、参数、代码能编译、说明的各节齐全、每个公式 KaTeX 都排得出来）；
// 三、每个算法在它声明的每一类数据上都能跑通，指标有限、概率合法、inspect 的输出符合 DESIGN.md §5；
// 四、几个容易的情形上的成绩（岭回归 R² > 0.9、两个半月上 MLP / k 近邻 ≥ 0.9、AR 胜过朴素预测……）；
// 五、导入的 CSV 里有缺失值时也能跑；同样的种子得到同样的结果；多步预测；
// 六、按后台线程的方式运行：在新的 vm 环境里先冻住内置对象、遮住危险的全局名字，再编进算法代码，每个算法跑一遍。
const { QL, ok, section, done } = require("./harness.js");
const fs = require("fs"), path = require("path"), vm = require("vm");
const T0 = Date.now(), ROOT = path.join(__dirname, "..");
const SRC = f => path.join(ROOT, "src", f);
const INSTALLS = { QL_MLNN_INSTALL: "ml/nn.js", QL_MLSTATS_INSTALL: "ml/stats.js", QL_MLREG_INSTALL: "ml/registry.js", QL_MLDATA_TABULAR: "ml/data-tabular.js", QL_MLDATA_TS: "ml/data-ts.js", QL_MLDATA_IMAGE: "ml/data-image.js", QL_MLDATA_TOY: "ml/data-toy.js", QL_MLRUN_INSTALL: "ml/run.js" };
const FN = {};
Object.keys(INSTALLS).forEach(k => { try { FN[k] = require(SRC(INSTALLS[k])); FN[k](QL); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; console.log("  （缺少 " + INSTALLS[k] + "，跳过）"); } });

/* 测试专用的小数据集（只注册在这个进程里）：图像回归——注册表里还没有这一类的数据 */
QL.mlreg.add({
  id: "t_imgreg", family: "image", kind: "regression", name: "测试：图像回归", params: [], plot: "images",
  gen: function (p, rng) {
    const n = 400, H = 6, d = H * H, X = new Float64Array(n * d), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < d; j++) { const v = rng.u(); X[i * d + j] = v; const r = Math.floor(j / H), c = j % H; if (r >= 2 && r <= 3 && c >= 2 && c <= 3) s += v; } y[i] = s + 0.1 * rng.normal(); }
    return { X, y, n, d, shape: [H, H] };
  },
  docs: "测试用：y 是中间 2×2 个像素之和加噪声。"
});

/* 一、文件与导出 */
section("一、文件与导出");
const text = fs.readFileSync(SRC("ml/algos.js"), "utf8");
const lines = text.split("\n");
ok(lines[0] === "// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。" && lines[1] === "// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。", "头两行是版权声明");
ok(/^\/\*[^\n]*[一-鿿]/.test(lines[2]), "第三行开始是中文的块注释");
ok(!/<\/script/i.test(text), "文件里没有 </script（要内联进页面）");
// 模板里的内容是原样（String.raw 式）取出的；ES2018 之前的引擎会把 \x、\u 后面不是十六进制、以及 \数字 当作语法错误，整页都会坏掉
ok(!/\\(x(?![0-9a-fA-F]{2})|u(?![0-9a-fA-F]{4}|\{)|[0-9])/.test(text), "没有老引擎不认的转义（\\xi 要写成 ξ）");
ok(!/\$\{/.test(text), "模板里没有 $\{（会被当成插值）");
ok(!/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text), "没有制表符和其他控制字符（多半是编辑时把 \\t、\\b 之类转义吞掉了）");
vm.runInThisContext(text, { filename: "algos.js" });
/* global QL_MLALGOS, QL_MLALGO_GROUPS */
const ALGOS = QL_MLALGOS, GROUPS = QL_MLALGO_GROUPS;
ok(Array.isArray(ALGOS) && ALGOS.length >= 20, "QL_MLALGOS 是数组，至少 20 个算法", String(ALGOS && ALGOS.length));
{ const R = require(SRC("ml/algos.js")); ok(R instanceof Array && R.length === ALGOS.length && R.GROUPS && R.GROUPS.neural === "神经网络" && Object.keys(R).every(k => /^\d+$/.test(k)), "Node 里 require 得到同一个列表；分组名挂在不可枚举的 GROUPS 上"); }
ok(GROUPS && GROUPS.baseline === "基线" && GROUPS.linear === "线性模型" && GROUPS.neighbors === "近邻" && GROUPS.trees === "树模型" && GROUPS.kernel === "核方法" && GROUPS.probabilistic === "概率模型" && GROUPS.neural === "神经网络" && GROUPS.ts === "时间序列", "QL_MLALGO_GROUPS 的分组名");
const byId = {}; ALGOS.forEach(a => { byId[a.id] = a; });

/* 二、每个条目的格式 */
section("二、每个条目的格式");
const FAMS = { tabular: ["regression", "classification"], timeseries: ["forecast"], image: ["classification", "regression"], toy: ["classification", "regression"] };
function checkParams(ps) {
  const bad = [], seen = {};
  if (!Array.isArray(ps)) return ["params 不是数组"];
  ps.forEach((q, i) => {
    const at = "参数 " + (q && q.key || i);
    if (!q || typeof q.key !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(q.key)) { bad.push(at + "：key 不合法"); return; }
    if (seen[q.key]) bad.push(at + "：重复"); seen[q.key] = 1;
    if (typeof q.label !== "string" || !q.label.trim()) bad.push(at + "：缺 label");
    if (q.desc != null && typeof q.desc !== "string") bad.push(at + "：desc 不是文字");
    if (q.type === "int" || q.type === "num") {
      if (![q.min, q.max, q.def].every(Number.isFinite) || !(q.min <= q.def && q.def <= q.max)) bad.push(at + "：min ≤ def ≤ max 不成立");
      if (q.step != null && !(q.step > 0)) bad.push(at + "：step 必须是正数");
      if (q.type === "int" && ![q.min, q.max, q.def].every(Number.isInteger)) bad.push(at + "：整数参数的 min、max、def 必须是整数");
    } else if (q.type === "select") {
      if (!Array.isArray(q.options) || !q.options.length) bad.push(at + "：选项为空");
      else {
        // 界面（app.js 的 cleanParams）用 === 比较 <select> 的字符串值，所以选项的取值必须是字符串
        if (!q.options.every(o => Array.isArray(o) && typeof o[0] === "string" && typeof o[1] === "string" && o[1].trim())) bad.push(at + "：选项要写成 [字符串取值, 显示名]");
        if (!q.options.some(o => o[0] === q.def)) bad.push(at + "：默认值不在选项里");
        if (new Set(q.options.map(o => o[0])).size !== q.options.length) bad.push(at + "：选项取值重复");
      }
    } else if (q.type === "bool") { if (typeof q.def !== "boolean") bad.push(at + "：开关的 def 必须是布尔值"); }
    else bad.push(at + "：type 不认识 " + q.type);
  });
  return bad;
}
const RET = "\n;return { fit: typeof fit === 'function' ? fit : null, predict: typeof predict === 'function' ? predict : null, forecast: typeof forecast === 'function' ? forecast : null, update: typeof update === 'function' ? update : null, inspect: typeof inspect === 'function' ? inspect : null };";
function compile(code) { return new Function("\"use strict\";\n" + code + RET)(); }
const SECTIONS = ["模型", "损失与训练", "参数怎么调", "复杂度", "什么时候好用、什么时候失效", "理论"];
{
  const ids = ALGOS.map(a => a.id);
  ok(new Set(ids).size === ids.length, "编号互不相同");
  const bad = [];
  ALGOS.forEach(a => {
    const e = [];
    if (!/^[a-z0-9_]+$/.test(a.id || "")) e.push("id");
    if (typeof a.name !== "string" || !/[一-鿿]/.test(a.name) || a.name.length > 24) e.push("name（中文、简短）");
    if (typeof a.summary !== "string" || !/[一-鿿]/.test(a.summary) || a.summary.length < 10) e.push("summary");
    if (a.api !== "supervised" && a.api !== "forecast") e.push("api");
    if (!GROUPS[a.group]) e.push("group 不在 QL_MLALGO_GROUPS 里：" + a.group);
    if (!Array.isArray(a.families) || !a.families.length || !a.families.every(f => FAMS[f])) e.push("families");
    if (!Array.isArray(a.kinds) || !a.kinds.length || !a.kinds.every(k => a.families.some(f => FAMS[f].indexOf(k) >= 0))) e.push("kinds 与 families 不配");
    if ((a.api === "forecast") !== (a.kinds.indexOf("forecast") >= 0) || (a.api === "forecast" && (a.kinds.length !== 1 || a.families.join() !== "timeseries"))) e.push("预测算法必须是 api forecast、kinds [forecast]、families [timeseries]");
    if (a.needs != null && a.needs !== "tokens") e.push("needs");
    if (a.curveX != null && !(typeof a.curveX === "string" && /[\u4e00-\u9fff]/.test(a.curveX))) e.push("curveX");
    checkParams(a.params).forEach(x => e.push(x));
    if (typeof a.code !== "string" || a.code.length < 200) e.push("code 太短");
    let C = null;
    try { new Function("\"use strict\";\n" + a.code + "\n"); C = compile(a.code); } catch (err) { e.push("编译失败：" + err.message); }
    if (C) {
      if (!C.fit) e.push("没有 fit");
      if (a.api === "supervised" && !C.predict) e.push("没有 predict");
      if (a.api === "forecast" && !C.forecast) e.push("没有 forecast");
    }
    const fnames = (a.code.match(/^function\s+([A-Za-z_$][\w$]*)/gm) || []).map(x => x.replace(/^function\s+/, "")), dup = fnames.filter((x, i) => fnames.indexOf(x) !== i);
    if (dup.length) e.push("顶层函数重名（后一个会悄悄覆盖前一个）：" + dup.join("、"));
    [/\bMath\.random\b/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bimportScripts\b/, /\bpostMessage\b/, /\bglobalThis\b/, /\beval\s*\(/, /new\s+Function\b/, /\bQL\./, /\bsetTimeout\b/].forEach(re => { if (re.test(a.code)) e.push("代码里用了不该用的 " + re); });
    if (e.length) bad.push(a.id + "：" + e.join("；"));
  });
  ok(!bad.length, ALGOS.length + " 个条目的字段、参数、代码都合规", bad.join(" | "));
}

/* 说明：各节齐全；公式按 src/md.js 的规则抽出来，每一个 KaTeX 都排得出来；抽完之后不剩落单的 $ */
let katex = null;
for (const p of ["/opt/npm-tools/node_modules/katex", "katex"]) { try { katex = require(p); break; } catch (e) {} }
function mathSpans(md) {
  const spans = [];
  let s = String(md).replace(/\r\n?/g, "\n");
  s = s.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, () => " ").replace(/`([^`\n]+)`/g, () => " ");
  const keep = (b, disp) => { spans.push({ tex: b, display: disp }); return "\u0001"; };
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, b) => keep(b.trim(), true));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, b) => keep(b.trim(), true));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, b) => keep(b.trim(), false));
  s = s.replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)\$(?!\d)/g, (_, pre, b) => pre + keep(b, false));
  return { spans, rest: s };
}
{
  const bad = [], texBad = [];
  let nSpans = 0;
  ALGOS.forEach(a => {
    const d = a.docs;
    if (typeof d !== "string" || d.length < 600) { bad.push(a.id + "：说明太短"); return; }
    const heads = (d.match(/^## .+$/gm) || []).map(h => h.slice(3).trim());
    SECTIONS.forEach(sct => { if (heads.indexOf(sct) < 0) bad.push(a.id + "：缺少 ## " + sct); });
    if (/ˋ/.test(d)) bad.push(a.id + "：还留着代替反引号的 ˋ");
    if (!/定理|命题/.test(d.split("## 理论")[1] || "")) bad.push(a.id + "：理论一节里没有定理或命题");
    const { spans, rest } = mathSpans(d);
    nSpans += spans.length;
    if (/\$/.test(rest)) bad.push(a.id + "：有落单的 $：" + rest.slice(Math.max(0, rest.indexOf("$") - 30), rest.indexOf("$") + 30).replace(/\n/g, " "));
    if (katex) spans.forEach(sp => { try { katex.renderToString(sp.tex, { displayMode: sp.display, throwOnError: true, strict: "ignore", trust: false }); } catch (e) { texBad.push(a.id + "：" + sp.tex.slice(0, 60) + " → " + String(e.message).slice(0, 80)); } });
  });
  ok(!bad.length, "说明都有六节（模型、损失与训练、参数怎么调、复杂度、什么时候好用 / 失效、理论），理论里有定理，没有落单的 $", bad.join(" | "));
  if (katex) ok(!texBad.length && nSpans > 500, "KaTeX 排得出全部 " + nSpans + " 个公式", texBad.slice(0, 8).join(" | "));
  else console.log("  （没有找到 KaTeX，跳过公式检查）");
}


/* 测试专用：词元输入的回归（嵌入类模型也声明了回归） */
QL.mlreg.add({
  id: "t_tokreg", family: "toy", kind: "regression", name: "测试：词元回归", params: [], plot: "table",
  gen: function (p, rng) {
    const V = 7, n = V * V, X = new Float64Array(2 * n), y = new Float64Array(n);
    for (let a = 0; a < V; a++) for (let b = 0; b < V; b++) { const i = a * V + b; X[2 * i] = a; X[2 * i + 1] = b; y[i] = Math.cos(2 * Math.PI * (a + b) / V) + 0.05 * rng.normal(); }
    return { X, y, n, d: 2, tokens: { vocab: V }, featureNames: ["a", "b"] };
  },
  docs: "测试用：y = cos(2π(a+b)/7) + 噪声。"
});

/* 三、四：在每一类数据上运行 */
function defaults(a) { const p = {}; a.params.forEach(q => { p[q.key] = q.def; }); return p; }
function run(aid, dsid, dp, ap, budget, extra) {
  const a = byId[aid], C = compile(a.code), params = Object.assign(defaults(a), ap || {});
  let model = null; const fit0 = C.fit; C.fit = function () { model = fit0.apply(null, arguments); return model; };
  const m = { dataset: { id: dsid, params: dp || {}, seed: 1 }, algo: { api: a.api, params, code: a.code, seed: 0 }, opts: Object.assign({ budgetMs: budget || 1500, importance: false }, extra || {}) };
  const t = Date.now(), res = QL.mlrun.run(m, C, () => {});
  return { res, model, C, m, a, ms: Date.now() - t };
}
function finiteMetrics(M) { return !!M && Object.keys(M).every(k => M[k] == null || Number.isFinite(M[k])); }
/* inspect 的原样输出（没有经过运行器的截断）对照 DESIGN.md §5 */
function checkInternals(ins, k) {
  const e = [];
  if (ins == null) return e;
  if (typeof ins !== "object") return ["不是对象"];
  const isNum = v => typeof v === "number" && Number.isFinite(v), isInt = v => Number.isInteger(v), arrLike = a => !!a && typeof a.length === "number";
  if (ins.layers != null) {
    if (!Array.isArray(ins.layers)) e.push("layers 不是数组");
    else ins.layers.forEach((l, i) => {
      if (typeof l.name !== "string" || !isInt(l.rows) || !isInt(l.cols) || l.rows < 1 || l.cols < 1 || !arrLike(l.data) || l.data.length !== l.rows * l.cols) e.push("layers[" + i + "] 的形状不对");
      else if (!Array.prototype.every.call(l.data, Number.isFinite)) e.push("layers[" + i + "] 有非有限的数");
    });
  }
  if (ins.embedding != null) {
    const E = ins.embedding;
    if (!isInt(E.rows) || !isInt(E.cols) || !arrLike(E.data) || E.data.length !== E.rows * E.cols) e.push("embedding 的形状不对");
    if (!Array.isArray(E.labels) || E.labels.length !== E.rows || !E.labels.every((s, i) => s === String(i))) e.push("embedding.labels 应为 \"0\"..\"V−1\"");
  }
  if (ins.coef != null && !(Array.isArray(ins.coef) && ins.coef.every(c => typeof c.name === "string" && isNum(c.value)))) e.push("coef 应为 [{ name, value }]");
  if (ins.activations != null && !(Array.isArray(ins.activations) && ins.activations.every(a => typeof a.name === "string" && arrLike(a.data) && a.data.length > 0))) e.push("activations 应为 [{ name, data }]");
  if (ins.text != null && typeof ins.text !== "string") e.push("text 不是文字");
  if (typeof ins.text === "string" && /undefined|NaN|\[object/.test(ins.text)) e.push("text 里有 undefined / NaN：" + ins.text.slice(0, 100));
  if (ins.tree != null) {
    const Nd = ins.tree.nodes;
    if (!Array.isArray(Nd) || !Nd.length) e.push("tree.nodes 为空");
    else Nd.forEach((nd, i) => {
      if (!isInt(nd.f) || nd.f < -1 || !isInt(nd.n) || nd.n < 0) { e.push("节点 " + i + " 的 f / n 不对"); return; }
      if (nd.f === -1) { if (nd.left !== -1 || nd.right !== -1) e.push("叶子 " + i + " 的 left / right 应为 −1"); }
      else if (!(isInt(nd.left) && isInt(nd.right) && nd.left > i && nd.right > i && nd.left < Nd.length && nd.right < Nd.length && isNum(nd.thr))) e.push("内部节点 " + i + " 的孩子或阈值不对");
      if (Array.isArray(nd.value)) { if (nd.value.length !== k || Math.abs(nd.value.reduce((s, v) => s + v, 0) - 1) > 1e-6 || !nd.value.every(v => v >= 0)) e.push("节点 " + i + " 的类别概率不对"); }
      else if (!isNum(nd.value)) e.push("节点 " + i + " 的值不是有限的数");
    });
  }
  return e;
}
/* 每次运行都做的检查：指标有限；原样调用 predict / forecast 的输出合法（概率非负、每行和为 1）；inspect 合规；参数个数是数 */
function generic(r) {
  const { res, model, C, a, m } = r, e = [];
  ["train", "valid", "test"].forEach(w => { if (!finiteMetrics(res.metrics[w])) e.push(w + " 的指标不是有限的数"); });
  if (a.api === "supervised") {
    const P = QL.mlrun.prepSupervised(m, QL.mlrun.makeData(m)), va = P.va, out = C.predict(model, va.X, va.n);
    if (res.kind === "classification") {
      const k = va.k;
      if (!out || out.length !== va.n * k) e.push("predict 的长度不对");
      else for (let i = 0; i < va.n; i++) { let s = 0; for (let c = 0; c < k; c++) { const v = out[i * k + c]; if (!(v >= 0) || !Number.isFinite(v)) { e.push("第 " + i + " 行有负数或非有限的概率"); break; } s += v; } if (Math.abs(s - 1) > 1e-3) { e.push("第 " + i + " 行概率之和 " + s); break; } }
    } else if (!out || out.length !== va.n || !Array.prototype.every.call(out, Number.isFinite)) e.push("predict 的输出不对");
  } else {
    const D = QL.mlrun.makeData(m), y = D.data.y, t1 = Math.floor(0.6 * y.length), f = C.forecast(model, y.subarray(0, t1), 4);   // 一个比模型当前状态早的原点
    if (!f || f.length < 4 || !Array.prototype.slice.call(f, 0, 4).every(Number.isFinite)) e.push("从较早的原点 forecast 的输出不对");
  }
  if (model && model.size != null && !(typeof model.size === "number" && model.size >= 0)) e.push("model.size 不是非负的数");
  if (C.inspect) { let ins = null; try { ins = C.inspect(model); } catch (err) { e.push("inspect 出错：" + err.message); } checkInternals(ins, res.k).forEach(x => e.push("inspect：" + x)); }
  return e;
}

const DS = {
  linreg: ["sparse_linear", { n: 300, d: 20, s: 5, noise: 0.3 }], sine: ["sine1d", { n: 300 }], fried: ["friedman1", { n: 600 }],
  moons: ["moons", { n: 600, noise: 0.2 }], gmix: ["gauss_mix", { n: 600, k: 3, d: 2 }], digits: ["digits", {}], imgreg: ["t_imgreg", {}], ising: ["ising", { L: "8", nT: 8, perT: 24, chains: 4 }],
  mod: ["modadd", { p: 23, trainFrac: 0.6 }], parity: ["parity", { nbits: 8, k: 2, samples: 800 }], setfn: ["setfn", { samples: 600 }], tokreg: ["t_tokreg", {}],
  ar2: ["ar2", { T: 800 }], seas: ["seasonal", { T: 480 }], rw: ["random_walk", { T: 600, drift: 0.5 }], logmap: ["logistic_map", { T: 1000 }], mg: ["mackey_glass", { T: 1500 }]
};
const acc = r => r.res.metrics.valid.acc, base = r => r.res.baseline.metrics.valid[r.res.primary], mse = r => r.res.metrics.valid.mse, R2 = r => r.res.metrics.valid.r2;
/* [算法, 数据, 算法参数, 预算（毫秒）, 质量检查（可选）：返回 [是否通过, 说明]] */
const CASES = [
  ["ridge", "linreg", {}, 1000, r => [R2(r) > 0.9, "岭回归在稀疏线性数据上 R² > 0.9"]],
  ["ridge", "sine", { degree: 5 }, 1000, r => [R2(r) > 0.7, "五次多项式拟合一维正弦 R² > 0.7"]],
  ["ridge", "sine", { degree: 8, auto: true }, 1500, r => [r.res.curve.length >= 20 && r.res.snaps.length >= 20 && R2(r) > 0.7, "按验证集选 λ：每个 λ 一个曲线点和一张快照（偏差—方差动画）"]],
  ["ridge", "imgreg", {}, 1000, r => [R2(r) > 0.8, "图像回归（线性目标）R² > 0.8"]],
  ["lasso", "linreg", {}, 1500, r => [R2(r) > 0.9 && r.model.nz <= 12, "Lasso：R² > 0.9，非零系数不超过 12 个（真值 5 个）"]],
  ["lasso", "imgreg", {}, 1500],
  ["logreg", "moons", {}, 1500, r => [acc(r) > 0.8, "逻辑回归在两个半月上 > 0.8（线性边界）"]],
  ["logreg", "digits", {}, 2000, r => [acc(r) > 0.9, "逻辑回归在手写数字上 > 0.9"]],
  ["logreg", "mod", {}, 1000, r => [r.res.snaps.some(s => s.kind === "embed"), "词元输入：有嵌入的快照"]],
  ["logreg", "parity", {}, 1000],
  ["nbayes", "moons", {}, 1000, r => [acc(r) > 0.8, "朴素贝叶斯在两个半月上 > 0.8"]],
  ["nbayes", "digits", {}, 1000, r => [acc(r) > 0.75, "朴素贝叶斯在手写数字上 > 0.75"]],
  ["nbayes", "mod", {}, 1000],
  ["nbayes", "parity", {}, 1000],
  ["lda", "gmix", {}, 1000, r => [acc(r) > base(r) + 0.3, "LDA 在高斯混合上远超基线"]],
  ["lda", "gmix", { type: "qda" }, 1000, r => [acc(r) > base(r) + 0.3, "QDA 在高斯混合上远超基线"]],
  ["lda", "digits", { shrink: 0.05 }, 1500, r => [acc(r) > 0.9, "LDA 在手写数字上 > 0.9"]],
  ["knn", "moons", {}, 1000, r => [acc(r) >= 0.9, "k 近邻在两个半月上 ≥ 0.9"]],
  ["knn", "sine", { autoK: true }, 1500, r => [R2(r) > 0.6 && r.res.curve.length >= 5 && r.model.k >= 1, "k 近邻按验证集选 k，R² > 0.6"]],
  ["knn", "digits", {}, 1500, r => [acc(r) > 0.9, "k 近邻在手写数字上 > 0.9"]],
  ["knn", "imgreg", {}, 1000],
  ["knn", "mod", {}, 1000],
  ["knn", "setfn", {}, 1000, r => [mse(r) < base(r), "k 近邻在集合函数上好过均值"]],
  ["tree", "moons", {}, 1000, r => [acc(r) > 0.85 && r.res.internals.tree.nodes.length > 3, "决策树在两个半月上 > 0.85，给出树的结构"]],
  ["tree", "sine", {}, 1000, r => [R2(r) > 0.5, "回归树拟合正弦 R² > 0.5"]],
  ["tree", "digits", {}, 1500, r => [acc(r) > 0.6, "决策树在手写数字上 > 0.6"]],
  ["tree", "imgreg", { prune: false }, 1000],
  ["forest", "moons", { trees: 60 }, 2000, r => [acc(r) >= 0.9 && r.res.curve.length >= 10 && r.res.curve[r.res.curve.length - 1].oobLoss > 0, "随机森林在两个半月上 ≥ 0.9，曲线里有袋外损失"]],
  ["forest", "fried", { trees: 60 }, 2000, r => [R2(r) > 0.6, "随机森林在 Friedman #1 上 R² > 0.6"]],
  ["forest", "digits", { trees: 60 }, 2000, r => [acc(r) > 0.9, "随机森林在手写数字上 > 0.9"]],
  ["forest", "imgreg", { trees: 30 }, 1500],
  ["gbm", "moons", {}, 2000, r => [acc(r) >= 0.9, "梯度提升在两个半月上 ≥ 0.9"]],
  ["gbm", "fried", {}, 2000, r => [R2(r) > 0.75, "梯度提升在 Friedman #1 上 R² > 0.75"]],
  ["gbm", "gmix", {}, 1500, r => [acc(r) > base(r) + 0.3, "梯度提升多分类（softmax）远超基线"]],
  ["gbm", "digits", { rounds: 60 }, 3000, r => [acc(r) > 0.85, "梯度提升在手写数字上 > 0.85"]],
  ["gbm", "imgreg", { rounds: 100 }, 1500],
  ["gp", "sine", {}, 2000, r => [R2(r) > 0.7, "高斯过程拟合正弦 R² > 0.7"]],
  ["gp", "fried", { nmax: 200, m: 150 }, 2500, r => [R2(r) > 0.6 && /Nyström/.test(r.res.internals.text), "样本多于 nmax 时用 Nyström，R² > 0.6"]],
  ["rff", "sine", {}, 1500, r => [R2(r) > 0.7, "随机傅里叶特征回归 R² > 0.7"]],
  ["rff", "moons", {}, 2000, r => [acc(r) >= 0.9, "随机傅里叶特征 + 逻辑回归在两个半月上 ≥ 0.9"]],
  ["rff", "digits", { D: 300 }, 2500, r => [acc(r) > 0.85, "随机傅里叶特征在手写数字上 > 0.85"]],
  ["rff", "imgreg", { kind: "laplace" }, 1500],
  ["svm", "moons", {}, 2000, r => [acc(r) >= 0.9, "SVM 在两个半月上 ≥ 0.9"]],
  ["svm", "digits", { D: 300, epochs: 15 }, 3000, r => [acc(r) > 0.85, "SVM 在手写数字上 > 0.85（一对其余 + 校准）"]],
  ["mlp", "moons", {}, 2500, r => [acc(r) >= 0.9 && r.res.snaps.length >= 3 && r.res.snaps[0].kind === "grid2d", "MLP 在两个半月上 ≥ 0.9，有决策面的快照"]],
  ["mlp", "sine", {}, 2500, r => [R2(r) > 0.6 && r.res.snaps[0].kind === "fn1d", "MLP 拟合正弦 R² > 0.6，有曲线的快照"]],
  ["mlp", "digits", {}, 3000, r => [acc(r) > 0.9, "MLP 在手写数字上 > 0.9"]],
  ["mlp", "imgreg", {}, 2000],
  ["mlp", "mod", {}, 1500, r => [r.res.snaps.some(s => s.kind === "embed"), "词元输入：第一层权重当嵌入拍快照"]],
  ["mlp", "parity", {}, 2000],
  ["mlp", "setfn", {}, 2000, r => [mse(r) < base(r), "MLP 在集合函数上好过均值"]],
  ["cnn", "ising", { pad: "circular", augment: "z2" }, 4000, r => [acc(r) > base(r) + 0.2, "CNN 在 8×8 伊辛模型上明显好于基线"]],
  ["cnn", "digits", { head: "flat" }, 4000, r => [acc(r) > 0.85, "CNN 在手写数字上 > 0.85"]],
  ["cnn", "imgreg", { augment: "flip" }, 2500],
  ["embmlp", "mod", { wd: 0, lr: 0.01 }, 3500, r => [r.res.metrics.train.acc >= 0.95 && r.res.snaps.filter(s => s.kind === "embed").length >= 5, "嵌入 + MLP 在模 23 加法上记住训练集（≥ 0.95），并拍下嵌入的快照"]],
  ["embmlp", "tokreg", { shared: false, combine: "sum", act: "square" }, 1500],
  ["transformer", "mod", { wd: 0, lr: 0.01, dim: 32 }, 3500, r => [r.res.metrics.train.acc > 0.5 && /平均注意力/.test(r.res.internals.text), "Transformer 在模 23 加法上训练准确率 > 0.5，并报告注意力"]],
  ["transformer", "tokreg", { heads: "1" }, 1500],
  ["snaive", "seas", {}, 1000],
  ["drift", "rw", {}, 1000, r => [mse(r) < base(r), "带漂移的随机游走上漂移法好过朴素预测"]],
  ["ar", "ar2", {}, 1000, r => [mse(r) < 0.85 * base(r) && r.model.p >= 2 && r.model.maxRoot < 1, "AR 在 AR(2) 序列上比朴素预测好 15% 以上，选出的阶数 ≥ 2，模型平稳"]],
  ["ar", "seas", { sdiff: true, diff: "0" }, 1000],
  ["ets", "seas", {}, 1500, r => [mse(r) < 0.9 * base(r) && r.model.kind.season, "Holt–Winters 在季节序列上好过朴素预测，并选中带季节项的模型"]],
  ["ets", "rw", { type: "holt", damped: true }, 1000],
  ["kalman", "rw", {}, 1000, r => [mse(r) < 1.05 * base(r), "局部线性趋势在随机游走上不比朴素差"]],
  ["kalman", "ar2", { model: "level" }, 1000, r => [mse(r) < base(r), "局部水平在 AR(2) 上好过朴素预测"]],
  ["lagboost", "logmap", {}, 2000, r => [mse(r) < 0.2 * base(r), "滞后特征 + 梯度提升在 Logistic 映射上把朴素误差降到 1/5 以下"]],
  ["lagmlp", "logmap", {}, 2500, r => [mse(r) < 0.5 * base(r), "滞后窗口 + MLP 在 Logistic 映射上好过朴素预测一倍"]],
  ["esn", "mg", {}, 2000, r => [mse(r) < 0.5 * base(r), "回声状态网络在 Mackey–Glass 上好过朴素预测一倍"]],
  ["esn", "ar2", { autoLam: false, target: "level" }, 1000]
];
section("三、四：在声明的每一类数据上运行，以及几个容易的情形上的成绩");
{
  const covered = {};   // 算法 → 跑过的 family/kind
  CASES.forEach(cs => {
    const [aid, dk, ap, budget, check] = cs, a = byId[aid], ds = DS[dk];
    if (!a) { ok(false, "没有算法 " + aid); return; }
    if (!QL.mlreg.get(ds[0])) { console.log("  （没有数据集 " + ds[0] + "，跳过 " + aid + "）"); return; }
    let r = null, err = "";
    try { r = run(aid, ds[0], ds[1], ap, budget); } catch (e) { err = e.stack.split("\n").slice(0, 3).join(" ← "); }
    const tag = aid + " @ " + ds[0] + (ap && Object.keys(ap).length ? " " + JSON.stringify(ap) : "");
    if (!r) { ok(false, tag + " 能跑通", err); return; }
    const def = QL.mlreg.get(ds[0]);
    covered[aid] = covered[aid] || {}; covered[aid][def.family + "/" + def.kind] = 1;
    const e = generic(r);
    ok(!e.length, tag + "：指标有限、输出合法、inspect 合规（" + r.ms + " 毫秒）", e.slice(0, 4).join("；"));
    if (check) { const [pass, what] = check(r); ok(pass, what, "valid " + r.res.primary + " = " + (+r.res.metrics.valid[r.res.primary]).toFixed(4) + "，基线 " + (+base(r)).toFixed(4) + (r.res.kind === "regression" ? "，R² " + (+R2(r)).toFixed(3) : "")); }
  });
  // 每个算法在它声明的每个 family 上至少跑过一次；声明的每个 kind 也至少跑过一次
  const miss = [];
  ALGOS.forEach(a => {
    const c = covered[a.id] || {};
    a.families.forEach(f => { if (!Object.keys(c).some(x => x.split("/")[0] === f)) miss.push(a.id + "：" + f); });
    a.kinds.forEach(k => { if (!Object.keys(c).some(x => x.split("/")[1] === k)) miss.push(a.id + "：" + k); });
  });
  ok(!miss.length, "每个算法在它声明的每个 family、每个 kind 上都跑过", miss.join("，"));
}

section("五、缺失值、需要词元的算法、可复现、多步预测");
{
  // 导入的 CSV：X 里有 NaN（registry.fromCSV 会原样保留缺失值）。表格算法都应当照常运行
  const g = new QL.RNG(5, 6, 7), n = 300, d = 3, X = new Float64Array(n * d), yc = new Int32Array(n), yr = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < d; j++) { const v = g.normal(); X[i * d + j] = g.u() < 0.08 ? NaN : v; s += (j + 1) * v; } yc[i] = s > 0 ? 1 : 0; yr[i] = s + 0.3 * g.normal(); }
  const inline = kind => ({ id: "csv", params: {}, seed: 1, inline: { X, y: kind === "classification" ? yc : yr, n, d, classes: kind === "classification" ? ["否", "是"] : undefined, featureNames: ["甲", "乙", "丙"], meta: { hasNaN: true } }, inlineDef: { id: "csv", family: "tabular", kind, name: "导入的数据" } });
  const bad = [];
  ALGOS.filter(a => a.api === "supervised" && a.families.indexOf("tabular") >= 0).forEach(a => {
    a.kinds.forEach(kind => {
      const fast = { maxIter: 20, epochs: 5, rounds: 20, trees: 10, steps: 20 };
      const ap = {}; a.params.forEach(q => { if (fast[q.key] != null) ap[q.key] = fast[q.key]; });
      try {
        const C = compile(a.code), res = QL.mlrun.run({ dataset: inline(kind), algo: { api: "supervised", params: Object.assign(defaults(a), ap), code: a.code, seed: 0 }, opts: { budgetMs: 1000, importance: false } }, C, () => {});
        if (!finiteMetrics(res.metrics.valid) || !finiteMetrics(res.metrics.test)) bad.push(a.id + "/" + kind + "：指标不是有限的数");
        else if (kind === "classification" ? !(res.metrics.valid.acc > 0.6) : !(res.metrics.valid.r2 > 0.3)) bad.push(a.id + "/" + kind + "：成绩太差 " + JSON.stringify(res.metrics.valid));
      } catch (e) { bad.push(a.id + "/" + kind + "：" + e.message); }
    });
  });
  ok(!bad.length, "X 里有 8% 的缺失值（NaN）时，所有表格算法都能跑、成绩合理", bad.join(" | "));

  // 需要词元的算法在数值输入上给出说得清的中文错误
  ["embmlp", "transformer"].forEach(aid => {
    let msg = ""; try { run(aid, "parity", { nbits: 6, samples: 300 }, {}, 1000); } catch (e) { msg = e.message; }
    ok(/词元/.test(msg) && byId[aid].needs === "tokens", aid + "：数值输入时报中文错误（needs = tokens）", msg.slice(0, 60));
  });

  // 可复现：同样的种子、不依赖时间预算的设置 → 逐位相同的指标与预测
  [["forest", "moons", { trees: 15 }], ["gbm", "fried", { rounds: 40, patience: 0 }], ["knn", "moons", {}], ["logreg", "moons", { maxIter: 30 }], ["ar", "ar2", {}], ["ets", "seas", {}], ["esn", "mg", { autoLam: false }]].forEach(([aid, dk, ap]) => {
    const a1 = run(aid, DS[dk][0], DS[dk][1], ap, 5000), a2 = run(aid, DS[dk][0], DS[dk][1], ap, 5000);
    ok(JSON.stringify(a1.res.metrics) === JSON.stringify(a2.res.metrics) && Array.prototype.every.call(a1.res.pred.valid, (v, i) => v === a2.res.pred.valid[i]), aid + "：同样的种子两次运行结果逐位相同");
  });

  // 多步预测（H = 5）：直接法、一次输出多步、闭环、积分回原序列都要走到
  [["ar", "ar2", { diff: "1" }], ["ets", "seas", {}], ["kalman", "rw", {}], ["snaive", "seas", {}], ["drift", "rw", {}], ["lagboost", "ar2", { strategy: "direct", hmax: 3, rounds: 60 }], ["lagmlp", "ar2", { hout: 2, epochs: 30 }], ["esn", "mg", {}]].forEach(([aid, dk, ap]) => {
    let r = null, err = "";
    try { r = run(aid, DS[dk][0], DS[dk][1], ap, 1500, { horizon: 5 }); } catch (e) { err = e.message; }
    const e = r ? generic(r) : [err];
    ok(r && r.res.horizon === 5 && r.res.pred.valid.length === 5 * (r.res.origins.valid[1] - r.res.origins.valid[0] + 1) && !e.length, aid + "：预测 5 步", e.join("；"));
  });
  // AR(2) 的 5 步预测仍然好过朴素预测；Holt–Winters 在季节数据上也是
  { const r = run("ar", "ar2", DS.ar2[1], {}, 1000, { horizon: 5 }); ok(r.res.metrics.valid.mse < r.res.baseline.metrics.valid.mse, "AR 的 5 步预测好过朴素预测"); }
  { const r = run("ets", "seasonal", DS.seas[1], {}, 1500, { horizon: 5 }); ok(r.res.metrics.valid.mse < r.res.baseline.metrics.valid.mse, "Holt–Winters 的 5 步预测好过朴素预测"); }
}

/* 六、按后台线程的方式运行：线程源码（runner.js 拼的那一份）放进新的 vm 环境，内置对象冻住、危险的全局名字遮住 */
section("六、按后台线程的方式运行每个算法（冻住的内置对象、遮住的全局名字）");
{
  const JI = require(SRC("jobs.js"));
  global.QLJobs = JI.QLJobs;
  const self0 = global;
  Object.assign(self0, { QL_CORE: require(SRC("core.js")), QL_ML_INSTALL: require(SRC("ml.js")), QL_JOBS_INSTALL: JI }, FN);
  global.self = self0;
  const Runner = require(SRC("ml/runner.js"));
  Runner._reset();
  // 每类任务一个小数据集；迭代次数都调小，只看能不能在线程里跑完
  const FAST = { maxIter: 15, epochs: 4, rounds: 15, trees: 8, steps: 25, D: 100, N: 60, pmax: 6 };
  const pick = a => a.api === "forecast" ? ["ar2", { T: 300 }] : a.families.indexOf("tabular") >= 0 ? (a.kinds.indexOf("classification") >= 0 ? ["moons", { n: 200 }] : ["sine1d", { n: 120 }]) : a.families.indexOf("image") >= 0 ? ["ising", { L: "8", nT: 4, perT: 12, chains: 3 }] : ["modadd", { p: 11 }];
  const bad = [];
  ALGOS.forEach(a => {
    const built = Runner.source(a.code), posts = [], sb = { postMessage: m => posts.push(m), onmessage: null };
    const ctx = vm.createContext({ self: sb, console, performance });
    try { vm.runInContext(built.src, ctx, { filename: "worker-" + a.id + ".js" }); } catch (e) { bad.push(a.id + "：编译 " + e.message); return; }
    const [dsid, dp] = pick(a), ap = defaults(a); a.params.forEach(q => { if (FAST[q.key] != null) ap[q.key] = Math.max(q.min, Math.min(q.max, FAST[q.key])); });
    sb.onmessage({ data: { type: "job", kind: "ml-run", dataset: { id: dsid, params: dp, seed: 3 }, algo: { api: a.api, params: ap, code: a.code, seed: 0 }, opts: { budgetMs: 1000, importance: a.api === "supervised" } } });
    const last = posts[posts.length - 1];
    if (!last || last.type !== "done") { bad.push(a.id + "：" + (last ? last.message : "没有结果")); return; }
    const r = last.result;
    if (!finiteMetrics(r.metrics.valid)) bad.push(a.id + "：指标不是有限的数");
    if (posts[0].type !== "ready") bad.push(a.id + "：线程没有先报到");
    const frozen = vm.runInContext("[Object.isFrozen(Math), Object.isFrozen(Array.prototype), Object.isFrozen(QL.nn), Object.isFrozen(QL.RNG.prototype), typeof __CODE.algo.fit]", ctx);
    if (!frozen.slice(0, 4).every(Boolean) || frozen[4] !== "function") bad.push(a.id + "：线程环境不对 " + JSON.stringify(frozen));
  });
  ok(!bad.length, ALGOS.length + " 个算法都能在冻住内置对象、遮住全局名字的线程环境里跑完", bad.join(" | "));
  // 算法代码碰不到 self、QL、fetch：遮住的名字在算法里是 undefined
  const probe = Runner.source("var seen = [typeof self, typeof QL, typeof fetch, typeof globalThis, typeof postMessage];\nfunction fit() { return { seen: seen }; }\nfunction predict(m, X, n) { return new Float64Array(n); }\nfunction inspect(m) { return { text: m.seen.join(',') }; }");
  const posts = [], sb = { postMessage: m => posts.push(m), onmessage: null }, ctx = vm.createContext({ self: sb, console, performance });
  vm.runInContext(probe.src, ctx);
  sb.onmessage({ data: { type: "job", kind: "ml-run", dataset: { id: "sine1d", params: { n: 60 }, seed: 1 }, algo: { api: "supervised", params: {}, code: "", seed: 0 }, opts: { budgetMs: 1000, importance: false } } });
  const res = posts[posts.length - 1];
  ok(res.type === "done" && res.result.internals.text === "undefined,undefined,undefined,undefined,undefined", "线程里的算法代码看不到 self、QL、fetch、globalThis、postMessage", res.type === "done" ? res.result.internals.text : res.message);
}

console.log("\n用时 " + ((Date.now() - T0) / 1000).toFixed(1) + " 秒");
done();
