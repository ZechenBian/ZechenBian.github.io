// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 · 手册（src/ml/guide.js）的测试：
//   条目齐全、键不重复、界面上引用的每个键都有条目；每一条都能经 md.js 渲染，公式都能被 KaTeX 排版（throwOnError）；
//   没有空的小节、没有落单的美元符号；手册里的三段示例代码真能跑；手册里引用的数字和 stats.js 算的一致。
const fs = require("fs"), path = require("path");
const { QL, ok, near, section, done } = require("./harness.js");
const ROOT = path.join(__dirname, "..");
const G = require("../src/ml/guide.js");

/* ---------- 装上注册表、数据集、算法（生成"任务 / 数据集 / 算法"三组条目要用） ---------- */
function tryReq(p) { try { return require(p); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; return null; } }
["../src/ml/nn.js", "../src/ml/stats.js", "../src/ml/registry.js", "../src/ml/data-tabular.js", "../src/ml/data-ts.js", "../src/ml/data-image.js", "../src/ml/data-toy.js"].forEach(p => { const f = tryReq(p); if (typeof f === "function") f(QL); });
const ALGOS = tryReq("../src/ml/algos.js") || [], GROUPS = ALGOS.GROUPS || null;
// 本机引擎的 Python 例子：照 ml-engine/mllab_engine/server.py 的 examples() 读文件头的元数据
function pyExamples() {
  const dir = path.join(ROOT, "ml-engine/examples"); if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".py") && !f.startsWith("_")).sort().map(f => {
    const code = fs.readFileSync(path.join(dir, f), "utf8"), meta = {}, docs = [];
    for (const line of code.split("\n").slice(2)) { if (!line.startsWith("#")) break; const s = line.length < 2 || line[1] !== " " ? line.slice(1).trim() : line.slice(2).trimEnd(); if (s.startsWith("@")) { const i = s.indexOf(" "); meta[s.slice(1, i < 0 ? undefined : i)] = i < 0 ? "" : s.slice(i + 1).trim(); } else docs.push(s); }
    let params = []; try { params = JSON.parse(meta.params || "[]"); } catch (e) {}
    const split = v => (v || "").split(",").map(x => x.trim()).filter(Boolean), text = docs.join("\n").trim();
    return { id: "py-" + f.slice(0, -3), name: meta.name || f, api: meta.api || "supervised", kinds: split(meta.kinds), families: split(meta.families), group: "py", params, code, docs: text, summary: text.split("\n\n")[0].replace(/\n/g, ""), src: "py", lang: "py" };
  });
}
const PY = pyExamples();
const REG = QL.mlreg;
const GEN = G.generate(REG, ALGOS, GROUPS, PY), ALL = G.slice().concat(GEN), byKey = {}; ALL.forEach(e => { byKey[e.key] = e; });

/* ---------- md.js 和 KaTeX ---------- */
const QLMD = new Function("window", fs.readFileSync(path.join(ROOT, "src/md.js"), "utf8") + "\nreturn QLMD;")({ addEventListener() {} });
const KATEX_PATH = [path.join(ROOT, "node_modules/katex"), "/opt/npm-tools/node_modules/katex"].find(p => fs.existsSync(p));
const katex = KATEX_PATH ? require(KATEX_PATH) : null;
const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function check(e) {
  const out = { renderErr: "", texErr: [], dollars: [], empty: [], tex: 0 };
  let html = "";
  try { html = QLMD.render(e.md); } catch (err) { out.renderErr = err.message; return out; }
  const re = /<span class="tex" data-display="([01])" data-tex="([^"]*)">/g; let m;
  while ((m = re.exec(html))) {
    out.tex++;
    if (katex) { try { katex.renderToString(unesc(m[2]), { displayMode: m[1] === "1", throwOnError: true, strict: "ignore", trust: false }); } catch (err) { out.texErr.push(unesc(m[2]).slice(0, 60) + " → " + String(err.message).slice(0, 80)); } }
  }
  // 公式、代码去掉以后，正文里不该再有美元符号（说明有没配对的定界符）
  const rest = html.replace(/<span class="tex"[^>]*>[^<]*<\/span>/g, "").replace(/<pre><code>[\s\S]*?<\/code><\/pre>/g, "").replace(/<code>[^<]*<\/code>/g, "");
  const d = rest.match(/.{0,20}\$.{0,20}/g); if (d) out.dollars = d;
  // 空的小节：标题之后（到下一个同级或更高级的标题为止）没有内容
  const lines = e.md.replace(/```[a-zA-Z0-9_-]*\n[\s\S]*?```/g, "（代码）").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const hm = /^(#{1,4})\s+(.*)$/.exec(lines[i]); if (!hm) continue;
    let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
    const nx = j < lines.length ? /^(#{1,4})\s/.exec(lines[j]) : null;
    if (j >= lines.length || (nx && nx[1].length <= hm[1].length)) out.empty.push(hm[2]);
  }
  return out;
}

section("静态条目");
{
  ok(Array.isArray(G) && G.length === 57, "静态条目一共 57 条", String(G.length));
  ok(G.every(e => e && typeof e.key === "string" && typeof e.group === "string" && typeof e.title === "string" && typeof e.md === "string" && typeof e.keys === "string"), "每一条都有 key、group、title、keys、md");
  ok(G[0].key === "start" && G[0].group === "入门", "第一条是入门的\"这个实验室是什么\"（不带键打开手册时显示它）");
  const groups = []; G.forEach(e => { if (groups.indexOf(e.group) < 0) groups.push(e.group); });
  ok(groups.join() === "入门,评价,图表,模型内部,动画,排行榜,写算法,AI,本机引擎,理论", "静态条目的分组和顺序", groups.join());
  const need = ["start", "workflow", "keys", "eval:split", "eval:metrics", "eval:baseline", "eval:paired", "eval:holm", "eval:selection", "eval:forecast", "eval:budget",
    "chart:curve", "chart:surface", "chart:fn1d", "chart:forecast", "chart:errh", "chart:confusion", "chart:perclass", "chart:roc", "chart:calibration", "chart:predactual", "chart:resid", "chart:compare", "chart:importance",
    "inside:coef", "inside:weights", "inside:pca", "inside:fourier", "inside:irreps", "inside:ising", "inside:act", "inside:tree",
    "anim:replay", "anim:ising", "anim:perc", "anim:rolling", "anim:optim", "anim:biasvar", "anim:ddescent", "board:how",
    "api:supervised", "api:forecast", "api:ctx", "api:lib", "api:nn", "api:sandbox", "ai:how", "ai:modes", "ai:trust", "engine:how",
    "theory:generalization", "theory:biasvar", "theory:ddescent", "theory:grokking", "theory:equivariance", "theory:timeseries", "theory:phase"];
  const miss = need.filter(k => !G.some(e => e.key === k)); ok(!miss.length, "要求的静态条目都在", miss.join(" "));
  ok(G.filter(e => /^theory:/.test(e.key)).every(e => e.md.length > 1500), "理论一组每篇都是长文（定义、定理、证明）", G.filter(e => /^theory:/.test(e.key)).map(e => e.key + " " + e.md.length).join("；"));
  ok(G.every(e => e.md.length > 250), "没有只写一两句的条目", G.filter(e => e.md.length <= 250).map(e => e.key).join(" "));
  const all = G.map(e => e.md).join("\n");
  ok(!/[⟦⟧]/.test(all), "代码记号 ⟦⟧ 都换成了反引号");
  ok(!/！|!(?!\[)/.test(G.map(e => e.md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "").replace(/\$[^$]*\$/g, "")).join("")), "正文里没有感叹号");
  ok(!/genuinely|honestly|straightforward|delve/i.test(all), "没有混进英文套话");
}

section("生成的条目：任务、数据集、算法");
{
  const keys = ALL.map(e => e.key), dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  ok(!dup.length, "全部 " + ALL.length + " 条的键不重复", dup.join(" "));
  ok(REG.groups.every(g => byKey["task:" + g.id] && byKey["task:" + g.id].group === "任务" && byKey["task:" + g.id].title === g.name), "每个任务分组一条", REG.groups.map(g => g.id).join(","));
  ok(Object.keys(G.TASKS).sort().join() === REG.groups.map(g => g.id).sort().join(), "每个分组都写了导读，没有多余的");
  ok(REG.list.length >= 20 && REG.list.every(d => byKey["ds:" + d.id] && byKey["ds:" + d.id].title === d.name && byKey["ds:" + d.id].group === "数据集"), "每个数据集一条（共 " + REG.list.length + " 个）");
  ok(!!byKey["ds:csv"], "导入的 CSV 也有一条（数据块的问号在导入的数据上指向 ds:csv）");
  ok(ALGOS.length >= 5 && ALGOS.every(a => byKey["algo:" + a.id] && byKey["algo:" + a.id].group === "算法"), "每个内置算法一条（共 " + ALGOS.length + " 个）");
  ok(PY.every(a => byKey["algo:" + a.id] && /（Python）$/.test(byKey["algo:" + a.id].title)), "本机引擎的每个 Python 例子一条（共 " + PY.length + " 个）");
  const order = []; ALL.forEach(e => { if (order.indexOf(e.group) < 0) order.push(e.group); });
  ok(order.slice(-3).join() === "任务,数据集,算法" && order[0] === "入门", "生成的三组排在静态条目之后", order.join());
  const d0 = REG.list.filter(d => d.params && d.params.length)[0], e0 = d0 && byKey["ds:" + d0.id];
  ok(e0 && /\| 参数 \| 默认 \| 范围 \| 含义 \|/.test(e0.md) && e0.md.indexOf(d0.params[0].label) >= 0 && /## 划分/.test(e0.md), "数据集条目：说明 + 参数表 + 划分", d0 && d0.id);
  const real = REG.list.filter(d => d.source); ok(real.length > 0 && real.every(d => /## 来源/.test(byKey["ds:" + d.id].md) && byKey["ds:" + d.id].md.indexOf(d.source.license) >= 0), "真实数据带来源和许可");
  const a0 = ALGOS[0], ea = byKey["algo:" + a0.id]; ok(ea && /```js\n/.test(ea.md) && ea.md.indexOf(a0.code.split("\n")[0]) >= 0, "算法条目带代码块");
  ok(GEN.every(e => !/undefined|\[object /.test(e.md.replace(/```[\s\S]*?```/g, "")) && e.title && e.md.length > 80), "生成的正文里没有 undefined、[object …]", GEN.filter(e => /undefined|\[object /.test(e.md.replace(/```[\s\S]*?```/g, ""))).map(e => e.key).join(" "));
  const tm = byKey["task:toy"]; ok(tm && /模 p 加法/.test(tm.md) && /## 能用的算法/.test(tm.md), "任务条目列出这一组的数据集和算法");
  // 没有注册表、没有算法也不出错
  let err = ""; try { G.generate(null, null, null, null); G.generate({ groups: [], list: [] }, [], { x: 1 }, []); } catch (e2) { err = e2.message; } ok(!err, "缺了注册表或算法列表时照样能生成", err);
  // 页面里的那一层：MLA 不存在时什么也不做；存在时 guideEntries = 静态 + 生成
  const src = fs.readFileSync(path.join(ROOT, "src/ml/guide.js"), "utf8");
  const A = { REG }, w = { QL_MLALGOS: ALGOS, QL_MLALGO_GROUPS: GROUPS, QL_MLPY: PY };
  const got = new Function("MLA", "window", "module", src + "\nreturn MLA.guideEntries();")(A, w, undefined);
  ok(Array.isArray(got) && got.length === ALL.length && got[0].key === "start", "MLA.guideEntries() = 静态条目 + 生成的条目", got && got.length + " / " + ALL.length);
  let err2 = ""; try { new Function("module", "window", src.replace(/if \(typeof module[^\n]*\n?$/, ""))(undefined, undefined); } catch (e3) { err2 = e3.message; } ok(!err2, "没有 MLA（Node 里）时加载不出错", err2);
  ok(/^\/\/ Copyright \(c\) 2026 Zechen Bian\. All rights reserved\. 版权所有，保留所有权利。\n\/\/ Not open source\. See LICENSE at the repository root\. 非开源，详见仓库根目录 LICENSE。\n/.test(src), "头两行是版权声明");
}

section("界面上引用的每个键都有条目");
{
  const files = fs.readdirSync(path.join(ROOT, "src/ml")).filter(f => f.endsWith(".js") && f !== "guide.js");
  const refs = [];
  files.forEach(f => { const s = fs.readFileSync(path.join(ROOT, "src/ml", f), "utf8"); [/help:\s*"([^"]+)"/g, /helpBtn\(\s*"([^"]+)"/g, /openGuide\(\s*"([^"]+)"/g].forEach(re => { let m; while ((m = re.exec(s))) refs.push({ key: m[1], file: f }); }); });
  ok(refs.length >= 30, "界面里找到 " + refs.length + " 处手册引用");
  const exact = refs.filter(r => !/:$/.test(r.key)), prefix = Array.from(new Set(refs.filter(r => /:$/.test(r.key)).map(r => r.key)));
  const miss = exact.filter(r => !byKey[r.key]); ok(!miss.length, "写死的键都有条目", miss.map(r => r.key + "（" + r.file + "）").join(" "));
  ok(prefix.every(p => p === "task:" || p === "ds:" || p === "algo:"), "拼出来的键只有 task: / ds: / algo: 三种前缀", prefix.join(" "));
  ok(REG.groups.every(g => byKey["task:" + g.id]) && REG.list.every(d => byKey["ds:" + d.id]) && ALGOS.every(a => byKey["algo:" + a.id]), "三种前缀拼出来的键都有条目");
}

section("每一条都能渲染，公式都能排版");
{
  if (!katex) console.log("  （没有找到 KaTeX，只检查渲染，不检查公式）");
  let nTex = 0;
  const bad = { render: [], tex: [], dollars: [], empty: [] };
  ALL.forEach(e => { const r = check(e); nTex += r.tex; if (r.renderErr) bad.render.push(e.key + "：" + r.renderErr); r.texErr.forEach(x => bad.tex.push(e.key + "：" + x)); if (r.dollars.length) bad.dollars.push(e.key + "：" + r.dollars.slice(0, 2).join(" ‖ ")); r.empty.forEach(x => bad.empty.push(e.key + "：" + x)); });
  ok(!bad.render.length, "md.js 渲染不抛错", bad.render.join("；"));
  ok(!!katex && !bad.tex.length, "全部 " + nTex + " 处公式都能被 KaTeX 排版（throwOnError）", bad.tex.slice(0, 8).join("；"));
  ok(!bad.dollars.length, "没有落单的美元符号", bad.dollars.slice(0, 6).join("；"));
  ok(!bad.empty.length, "没有空的小节", bad.empty.join("；"));
  const S = G.map(check); ok(S.every(r => !r.renderErr && !r.texErr.length && !r.dollars.length && !r.empty.length), "静态条目逐条干净", G.filter((e, i) => S[i].renderErr || S[i].texErr.length || S[i].dollars.length || S[i].empty.length).map(e => e.key).join(" "));
  { const few = G.filter(e => /^(eval|theory|inside|anim|chart):/.test(e.key) && !/^(anim:replay|anim:rolling|chart:compare|eval:budget)$/.test(e.key) && check(e).tex < 3).map(e => e.key + " " + check(e).tex); ok(!few.length, "评价、理论、图表、模型内部、动画的条目都写出了公式（回放、滚动原点、比较图、时间预算这四条除外）", few.join("；")); }
  const html = QLMD.render(byKey["eval:holm"].md); ok(/<table>/.test(html) || /<p>/.test(html), "渲染出 HTML");
  ok(/<pre><code>function fit/.test(QLMD.render(byKey["api:supervised"].md).replace(/\/\/[^\n]*\n/, "")), "代码块渲染成 <pre><code>");
}

section("手册里的三段示例代码真能跑");
{
  function codeOf(key, i) { const m = byKey[key].md.match(/```js\n([\s\S]*?)```/g); return m[i || 0].replace(/^```js\n/, "").replace(/```$/, ""); }
  function compile(code) { return new Function('"use strict";\n' + code + '\n;return { fit: typeof fit === "function" ? fit : null, predict: typeof predict === "function" ? predict : null, forecast: typeof forecast === "function" ? forecast : null, update: typeof update === "function" ? update : null, inspect: typeof inspect === "function" ? inspect : null };')(); }
  function blobs(n, seed) {   // 两团二维高斯，类别 0 在 (−1.5, 0)，类别 1 在 (1.5, 0)
    const r = new QL.RNG(seed, 1, 0), X = new Float64Array(2 * n), y = new Int32Array(n);
    for (let i = 0; i < n; i++) { y[i] = i % 2; X[2 * i] = (y[i] ? 1.5 : -1.5) + r.normal(); X[2 * i + 1] = r.normal(); }
    return { X, y, n, d: 2, k: 2, classes: ["a", "b"], featureNames: null, shape: null, tokens: null, kind: "classification", index: null };
  }
  const logs = [], curve = [], snaps = [], ctx = { report: (s, o) => curve.push(o), snapshot: (s, m) => snaps.push(s), timeLeft: () => 5000, log: t => logs.push(t), budgetMs: 5000 };
  const lib = { nn: QL.nn, stats: QL.mlstats, la: QL.nn && QL.nn.la, rng: new QL.RNG(1, 303, 0) };
  function accOf(P, y, k) { let h = 0; for (let i = 0; i < y.length; i++) { let b = 0; for (let c = 1; c < k; c++) if (P[i * k + c] > P[i * k + b]) b = c; if (b === y[i]) h++; } return h / y.length; }
  function rowsOk(P, n, k) { for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < k; c++) { if (!(P[i * k + c] >= 0)) return false; s += P[i * k + c]; } if (Math.abs(s - 1) > 1e-3) return false; } return P.length === n * k; }
  const tr = blobs(400, 3), va = blobs(200, 4);
  // 1) 最近类均值
  { const A = compile(codeOf("api:supervised")), m = A.fit({ train: tr, valid: va, kind: "classification" }, Object.freeze({ beta: 1 }), lib, ctx), P = A.predict(m, va.X, va.n);
    ok(rowsOk(P, va.n, 2) && accOf(P, va.y, 2) > 0.9 && m.size === 4 && /每类的训练样本数：200、200/.test(logs.join()) && typeof A.inspect(m).text === "string", "最近类均值：概率合法、准确率 > 0.9", accOf(P, va.y, 2).toFixed(3)); }
  // 2) 两层 MLP（lib.nn）
  { curve.length = 0; snaps.length = 0; const A = compile(codeOf("api:nn")), m = A.fit({ train: tr, valid: va, kind: "classification" }, Object.freeze({ hidden: 16, lr: 0.01, epochs: 15 }), lib, ctx), P = A.predict(m, va.X, va.n), ins = A.inspect(m);
    ok(rowsOk(P, va.n, 2) && accOf(P, va.y, 2) > 0.9, "两层 MLP：概率合法、准确率 > 0.9", accOf(P, va.y, 2).toFixed(3));
    ok(curve.length === 15 && curve.every(p => p.loss > 0 && p.validLoss > 0) && snaps.length === 3 && ins.layers.length === 3 && ins.layers[0].rows === 2 && ins.layers[0].cols === 16 && m.size === 2 * 16 + 16 + 16 * 16 + 16 + 16 * 2 + 2, "两层 MLP：每轮汇报、每 5 轮一张快照、inspect 交出三层权重、参数个数对", curve.length + " / " + snaps.length + " / " + m.size); }
  // 3) 简单指数平滑
  { curve.length = 0; const r = new QL.RNG(9, 1, 0), T = 300, y = new Float64Array(T); for (let t = 1; t < T; t++) y[t] = y[t - 1] + r.normal();
    const series = { y: y.slice(0, 180), T: 180, freq: "step", season: 0, label: "x", valid: { y: y.slice(180, 240), start: 180 } };
    const A = compile(codeOf("api:forecast")), m = A.fit(series, {}, lib, ctx), f = A.forecast(m, y.subarray(0, 200), 3);
    ok(curve.length === 20 && m.alpha > 0.5 && f.length === 3 && f[0] === f[2] && Number.isFinite(f[0]), "指数平滑：在验证段上选 α（随机游走上 α 接近 1），预测各步相同", "α = " + m.alpha); }
  // 4) ctx 一段里的循环至少能编译
  { let e = ""; try { new Function("p", "ctx", codeOf("api:ctx").replace(/\/\/ …… 一步训练 ……/, "var trainLoss = 1, validLoss = 1, model = {};")); } catch (err) { e = err.message; } ok(!e, "ctx 一条里的训练循环能编译", e); }
}

section("手册里引用的数字");
{
  const S = QL.mlstats;
  [[2, 0.564], [5, 1.163], [10, 1.539], [20, 1.867], [50, 2.249], [100, 2.508], [1000, 3.241]].forEach(([N, v]) => near(S.expectedMaxNormal(N), v, 6e-4, "选择偏差的表：e_" + N + " ≈ " + v));
  near(S.expectedMaxNormal(2), 1 / Math.sqrt(Math.PI), 1e-9, "e_2 = 1/√π");
  ok([2, 10, 100, 1000, 1e6].every(N => S.expectedMaxNormal(N) <= Math.sqrt(2 * Math.log(N))), "上界 e_N ≤ √(2 ln N)");
  near(Math.sqrt(2 * Math.log(1000)), 3.72, 0.005, "N = 1000 时 √(2 ln N) ≈ 3.72");
  { const g = 0.5772156649, N = 1000, L = Math.log(N), a = Math.sqrt(2 * L) - (Math.log(L) + Math.log(4 * Math.PI) - 2 * g) / (2 * Math.sqrt(2 * L)); ok(Math.abs(a - S.expectedMaxNormal(N)) < 0.05, "Gumbel 修正的渐近式在 N = 1000 时误差 < 0.05", a.toFixed(4)); }
  { const r = 0.6, N = 50, rr = new QL.RNG(5, 5, 5); let s = 0; const M = 40000; for (let t = 0; t < M; t++) { const z0 = rr.normal(); let b = -Infinity; for (let i = 0; i < N; i++) { const z = Math.sqrt(r) * z0 + Math.sqrt(1 - r) * rr.normal(); if (z > b) b = z; } s += b; } near(s / M, Math.sqrt(1 - r) * S.expectedMaxNormal(N), 0.02, "等相关 ρ 时期望最大值是 √(1−ρ)·e_N（模拟）"); }
  near(Math.sqrt(Math.log(40) / 2000), 0.043, 0.0005, "Hoeffding：m = 1000 时半宽 0.043"); near(Math.sqrt(Math.log(40) / 400), 0.096, 0.0005, "m = 200 时 0.096"); near(Math.sqrt(Math.log(40) / 10000), 0.019, 0.0005, "m = 5000 时 0.019"); ok(1.96 * 0.5 / Math.sqrt(1000) < 0.031, "正态近似不超过 0.031");
  { const a = new Uint8Array(1000), b = new Uint8Array(1000); for (let i = 0; i < 790; i++) { a[i] = 1; b[i] = 1; } for (let i = 790; i < 830; i++) a[i] = 1; for (let i = 830; i < 850; i++) b[i] = 1;
    const mc = S.mcnemar(a, b); ok(mc.b === 40 && mc.c === 20 && !mc.exact && Math.abs(mc.stat - 361 / 60) < 1e-12 && Math.abs(mc.p - 0.014) < 0.0005, "McNemar 的例子：χ² = 19²/60 ≈ 6.02，p ≈ 0.014", mc.p.toFixed(5));
    near(Math.sqrt((0.06 - 0.0004) / 1000), 0.0077, 0.00005, "配对标准误 ≈ 0.0077"); near(Math.sqrt((0.85 * 0.15 + 0.83 * 0.17) / 1000), 0.0164, 0.00005, "不配对 ≈ 0.0164"); }
  { const h = S.holm([0.005, 0.01, 0.03, 0.04]), bf = S.bonferroni([0.005, 0.01, 0.03, 0.04]); ok([0.02, 0.03, 0.06, 0.06].every((v, i) => Math.abs(h[i] - v) < 1e-12) && [0.02, 0.04, 0.12, 0.16].every((v, i) => Math.abs(bf[i] - v) < 1e-12), "Holm 与 Bonferroni 的例子", h.join(",")); }
  ok(Math.abs(1 - Math.pow(0.95, 20) - 0.64) < 0.005, "20 个独立检验至少一个假阳性的概率 ≈ 0.64");
  { const tr = (802 + 200), det = 802 * 200 - 400 * 400, l1 = (tr + Math.sqrt(tr * tr - 4 * det)) / 2, l2 = (tr - Math.sqrt(tr * tr - 4 * det)) / 2; ok(Math.abs(l1 - 1001.6) < 0.05 && Math.abs(l2 - 0.399) < 0.001 && Math.abs(l1 / l2 - 2508) < 10, "Rosenbrock 在 (1,1) 的 Hessian：特征值 1001.6、0.399，条件数约 2500", l1.toFixed(3) + " " + l2.toFixed(4)); }
  { const hb = (L, mu) => { const k = L / mu, sb = (Math.sqrt(k) - 1) / (Math.sqrt(k) + 1), eta = 4 / Math.pow(Math.sqrt(L) + Math.sqrt(mu), 2); return [1 + sb * sb - eta * mu - 2 * sb, 1 + sb * sb - eta * L + 2 * sb]; }; const v = hb(10, 0.1); ok(Math.abs(v[0]) < 1e-12 && Math.abs(v[1]) < 1e-12, "重球法：λ = μ、L 时 1 + β − ηλ = ±2√β"); }
  near(2 / Math.log(1 + Math.SQRT2), 2.269185, 1e-6, "T_c = 2/ln(1+√2)");
  { const Tinf = m => 2 / Math.asinh(Math.pow(1 - Math.pow(m, 8), -0.25)), TC = 2 / Math.log(1 + Math.SQRT2); near(Tinf(0.5), 2.267, 0.0006, "T_∞(0.5) ≈ 2.267"); near(Tinf(0.8), 2.188, 0.0006, "T_∞(0.8) ≈ 2.188"); near(Tinf(0.797), 2.190, 0.0006, "T_∞(0.797) ≈ 2.190"); ok(TC - Tinf(0.6) < 0.008 && TC - Tinf(0.6) > 0, "m* ≤ 0.6 时都在 T_c 下方 0.008 以内", (TC - Tinf(0.6)).toFixed(4)); }
  near(9 / 23, 0.39, 0.005, "S_4 的 (3,1)：9/23 ≈ 0.39");
  // 指标的几条性质（手册里写了证明的）
  { const y = new Int32Array([1, 0, 1, 1]), p = new Float64Array([0.2, 0.8, 0.6, 0.4, 0.3, 0.7, 0.9, 0.1]), M = S.metrics("classification", p, y, 2); let b = 0; for (let i = 0; i < 4; i++) b += Math.pow(p[2 * i + 1] - y[i], 2); near(M.brier, 2 * b / 4, 1e-12, "二分类的 brier 是教科书二元 Brier 分数的两倍"); }
  { const ytr = [1, 2, 3], yva = Float64Array.from([4, 6, 8]), m = 2, pred = new Float64Array(3).fill(m), M = S.metrics("regression", pred, yva), s2 = (4 + 0 + 4) / 3; near(M.r2, -Math.pow(m - 6, 2) / s2, 1e-12, "训练均值基线的 R² = −(ȳ_tr − ȳ)²/s²"); }
  { const r = new QL.RNG(2, 2, 2), n = 300, sc = new Float64Array(n), yy = new Int32Array(n); for (let i = 0; i < n; i++) { yy[i] = r.u() < 0.4 ? 1 : 0; sc[i] = Math.round((yy[i] + r.normal()) * 4) / 4; } let num = 0, P = 0, N = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (yy[i] === 1 && yy[j] === 0) num += sc[i] > sc[j] ? 1 : sc[i] === sc[j] ? 0.5 : 0; for (let i = 0; i < n; i++) yy[i] ? P++ : N++;
    near(S.roc(sc, yy).auc, num / (P * N), 1e-12, "ROC 曲线下的梯形面积 = 正例打分更高的配对比例（并列算一半）"); }
  { const pr = new Float64Array(50), y = new Int32Array(50), r = new QL.RNG(4, 4, 4); for (let i = 0; i < 50; i++) { pr[i] = r.u(); y[i] = r.u() < pr[i] ? 1 : 0; } const c = S.calibration(pr, y, 10); let e = 0; for (let b = 0; b < 10; b++) if (c.count[b]) e += c.count[b] / c.n * Math.abs(c.acc[b] - c.conf[b]); near(c.ece, e, 1e-12, "ECE = Σ (n_b/n)·|a_b − p̄_b|"); }
  { const nO = 6, H = 2, pred = new Float64Array(nO * H), truth = new Float64Array(nO * H), origin = new Float64Array(nO * H), na = new Float64Array(nO * H); const r = new QL.RNG(8, 8, 8); for (let i = 0; i < nO * H; i++) { origin[i] = r.normal(); truth[i] = origin[i] + r.normal(); pred[i] = origin[i] + 0.5 * (truth[i] - origin[i]) + 0.1 * r.normal(); na[i] = Math.abs(origin[i] - truth[i]); }
    const M = S.metrics("forecast", pred, truth, 0, { origin, naiveAbsErr: na }); let mae = 0, mn = 0; for (let i = 0; i < nO * H; i++) { mae += Math.abs(pred[i] - truth[i]); mn += na[i]; } near(M.mase, mae / mn, 1e-12, "MASE = 模型的 MAE / 同一批目标上朴素预测的 MAE"); }
}

done();
