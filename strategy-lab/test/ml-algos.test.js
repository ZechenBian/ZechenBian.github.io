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
vm.runInThisContext(text, { filename: "algos.js" });
/* global QL_MLALGOS, QL_MLALGO_GROUPS */
const ALGOS = QL_MLALGOS, GROUPS = QL_MLALGO_GROUPS;
ok(Array.isArray(ALGOS) && ALGOS.length >= 20, "QL_MLALGOS 是数组，至少 20 个算法", String(ALGOS && ALGOS.length));
ok(require(SRC("ml/algos.js")) instanceof Array && require(SRC("ml/algos.js")).length === ALGOS.length, "Node 里 require 得到同一个列表");
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
    checkParams(a.params).forEach(x => e.push(x));
    if (typeof a.code !== "string" || a.code.length < 200) e.push("code 太短");
    let C = null;
    try { new Function("\"use strict\";\n" + a.code + "\n"); C = compile(a.code); } catch (err) { e.push("编译失败：" + err.message); }
    if (C) {
      if (!C.fit) e.push("没有 fit");
      if (a.api === "supervised" && !C.predict) e.push("没有 predict");
      if (a.api === "forecast" && !C.forecast) e.push("没有 forecast");
    }
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

