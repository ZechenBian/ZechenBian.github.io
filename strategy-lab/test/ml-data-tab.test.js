// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室的数据层：注册表的校验、CSV 导入、每个表格与时间序列数据集的形状、可复现性、
// 理论最优（oracle / bayes）是否名副其实、内置真实数据是否与原始数据逐位相同、说明文字能否正常渲染。
const fs = require("fs"), path = require("path"), vm = require("vm");
const QL_CORE = require("../src/core.js"), QL_ML = require("../src/ml.js");
const REG = require("../src/ml/registry.js"), TAB = require("../src/ml/data-tabular.js"), TSD = require("../src/ml/data-ts.js");
const QL = QL_CORE({}); QL_ML(QL); REG(QL); TAB(QL); TSD(QL);
const R = QL.mlreg, RNG = QL.RNG, ml = QL.ml;

let pass = 0, fail = 0; const fails = [];
function ok(cond, name, detail) {
  if (cond) { pass++; if (process.env.VERBOSE) console.log("  ok   " + name + (detail ? "  " + detail : "")); }
  else { fail++; fails.push(name + (detail ? "  " + detail : "")); console.log("  FAIL " + name + (detail ? "  " + detail : "")); }
}
function fmt(x) { return typeof x === "number" ? (Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(3) : x.toFixed(5)) : String(x); }
function near(x, target, tol, name) { ok(Math.abs(x - target) <= tol, name, `got ${fmt(x)} want ${fmt(target)} ± ${fmt(tol)}`); }
function section(s) { console.log("\n== " + s); }
function throwsZh(f, re) { try { f(); return false; } catch (e) { return /[一-鿿]/.test(e.message) && (!re || re.test(e.message)); } }
function sameBits(a, b) { if (!a || !b || a.length !== b.length || a.constructor !== b.constructor) return false; const A = Buffer.from(a.buffer, a.byteOffset, a.byteLength), B = Buffer.from(b.buffer, b.byteOffset, b.byteLength); return A.equals(B); }
function mse(a, b, idx) { let s = 0, n = 0; for (const i of idx || a.keys()) { s += (a[i] - b[i]) ** 2; n++; } return s / n; }
function accOf(prob, y, k) { let c = 0; for (let i = 0; i < y.length; i++) { let best = 0; for (let j = 1; j < k; j++) if (prob[i * k + j] > prob[i * k + best]) best = j; if (best === y[i]) c++; } return c / y.length; }
function gen(id, over, seed) { const def = R.get(id); return def.gen(R.clean(def, Object.assign(R.defaults(def), over || {})), new RNG(seed == null ? 1 : seed, 0, 0)); }
function P(id, over) { return R.clean(id, Object.assign(R.defaults(id), over || {})); }
function rows(D, idx) { const d = D.d, X = new Float64Array(idx.length * d); idx.forEach((r, i) => { for (let j = 0; j < d; j++) X[i * d + j] = D.X[r * d + j]; }); return X; }
const TABULAR = R.list.filter(d => d.family === "tabular").map(d => d.id), SERIES = R.list.filter(d => d.family === "timeseries").map(d => d.id);

/* ================================================================== */
section("源文件：版权声明、自包含（能用 toString() 拼进线程）");
{
  const HDR = "// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。\n// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。\n";
  for (const f of ["src/ml/registry.js", "src/ml/data-tabular.js", "src/ml/data-ts.js", "test/ml-data-tab.test.js"]) ok(fs.readFileSync(path.join(__dirname, "..", f), "utf8").startsWith(HDR), "版权声明：" + f);
  // 在一个全新的作用域里（只有 QL 和标准库）从源码文本重建，结果必须与 require 进来的逐位相同
  const Q2 = QL_CORE({}); QL_ML(Q2);
  new Function("QL", REG.toString() + "\n" + TAB.toString() + "\n" + TSD.toString() + "\nQL_MLREG_INSTALL(QL); QL_MLDATA_TABULAR(QL); QL_MLDATA_TS(QL);")(Q2);
  ok(Q2.mlreg.list.length === R.list.length && Q2.mlreg.list.every((d, i) => d.id === R.list[i].id), "toString() 重建后注册的数据集一样", Q2.mlreg.list.length + " 个");
  let same = true;
  for (const id of ["sine1d", "moons", "gauss_mix", "breast_cancer", "regime", "mackey_glass", "real_goog_daily"]) {
    const a = R.get(id).gen(R.defaults(id), new RNG(5, 0, 0)), b = Q2.mlreg.get(id).gen(Q2.mlreg.defaults(id), new Q2.RNG(5, 0, 0));
    if (!sameBits(a.y, b.y) || (a.X && !sameBits(a.X, b.X))) same = false;
  }
  ok(same, "重建版生成的数据与原版逐位相同");
  ok(R.list.length === 29, "一共 29 个数据集（表格 14、时间序列 15）", R.list.map(d => d.id).join(","));
}

/* ================================================================== */
section("注册表：校验与参数整理");
{
  const good = () => ({ id: "tmp_ok", family: "tabular", kind: "regression", name: "临时", params: [{ key: "n", label: "样本数", def: 10, min: 1, max: 20, type: "int" }], gen: function () { return null; }, docs: "说明" });
  const bad = [
    ["编号重复", d => { d.id = "moons"; }, /已经注册/],
    ["编号有大写", d => { d.id = "Bad"; }, /编号/],
    ["编号有连字符", d => { d.id = "a-b"; }, /编号/],
    ["family 不认识", d => { d.family = "graph"; }, /family/],
    ["kind 不认识", d => { d.kind = "ranking"; }, /kind/],
    ["family 与 kind 不配", d => { d.family = "timeseries"; }, /不能是/],
    ["没有名字", d => { delete d.name; }, /名字/],
    ["params 不是数组", d => { d.params = {}; }, /params/],
    ["默认值超出范围", d => { d.params[0].def = 30; }, /不在/],
    ["min 大于 max", d => { d.params[0].min = 50; }, /大于/],
    ["整数参数的默认值不是整数", d => { d.params[0].def = 2.5; }, /整数/],
    ["参数名重复", d => { d.params.push({ key: "n", label: "又一个", def: 1, min: 0, max: 1, type: "num" }); }, /重复/],
    ["参数没有显示名", d => { delete d.params[0].label; }, /label/],
    ["类型不认识", d => { d.params[0].type = "text"; }, /类型/],
    ["选择题默认值不在选项里", d => { d.params = [{ key: "s", label: "形状", def: "c", type: "select", options: [["a", "甲"], ["b", "乙"]] }]; }, /选项/],
    ["选择题选项格式不对", d => { d.params = [{ key: "s", label: "形状", def: "a", type: "select", options: ["a", "b"] }]; }, /选项/],
    ["开关的默认值不是布尔", d => { d.params = [{ key: "f", label: "开关", def: 1, type: "bool" }]; }, /true/],
    ["gen 不是函数", d => { d.gen = "x"; }, /gen/],
    ["docs 是空的", d => { d.docs = "  "; }, /docs/],
    ["oracle 不是函数", d => { d.oracle = {}; }, /oracle/],
    ["plot 不认识", d => { d.plot = "pie"; }, /plot/],
    ["划分比例加起来不是 1", d => { d.split = { train: 0.5, valid: 0.2, test: 0.2 }; }, /1/],
    ["出处链接不是 https", d => { d.source = { name: "x", license: "CC BY 4.0", url: "http://example.org" }; }, /https/]
  ];
  for (const [name, mut, re] of bad) { const d = good(); mut(d); ok(throwsZh(() => R.add(d), re), "拒绝：" + name); }
  ok(!R.get("tmp_ok") && R.list.length === 29, "被拒绝的定义没有留在注册表里");
  ok(R.get("nope") === null && R.get("hasOwnProperty") === null, "get 不认识的编号返回 null");
  const p = R.clean("spirals", { n: "12345", k: "3", turns: -4, noise: "abc", junk: 1 });
  ok(p.n === 10000 && p.k === 3 && p.turns === 0.5 && p.noise === 0.05 && !("junk" in p), "clean：夹到范围、字符串转数、选项按取值认、坏值回默认、多余的键丢掉", JSON.stringify(p));
  const q = R.clean("sine1d", { n: 33.4, hetero: "true", extrap: 0 });
  ok(q.n === 33 && q.hetero === true && q.extrap === false, "clean：整数取整、开关接受 'true' 和 0", JSON.stringify(q));
  ok(R.groups.length === 5 && R.groups.map(g => g.id).join() === "tab-reg,tab-cls,ts,img,toy" && R.groups.every(g => g.name && g.desc && R.families[g.family]), "五个分组，都有名字和说明");
  ok(Object.keys(R.families).join() === "tabular,timeseries,image,toy" && Object.values(R.families).every(f => /[一-鿿]/.test(f.name + f.desc)), "四个 family 有中文名和说明");
  ok(R.inGroup("tab-reg").map(d => d.id).join() === "sine1d,friedman1,sparse_linear,step_fn", "表格回归组", R.inGroup("tab-reg").map(d => d.id).join());
  ok(R.inGroup("tab-cls").length === 10 && R.inGroup("ts").length === 15, "表格分类 10 个、时间序列 15 个");
  ok(R.splitOf("moons").by === "stratified" && R.splitOf("sine1d").by === "random" && R.splitOf("ar2").by === "time" && R.splitOf("ar2").train === 0.6, "默认划分（§4）");
}

/* ================================================================== */
section("每个数据集：参数、形状、速度、可复现");
for (const def of R.list) {
  const id = def.id, p0 = R.defaults(def);
  ok(JSON.stringify(R.clean(def, p0)) === JSON.stringify(p0), id + "：默认参数原样通过 clean");
  ok(def.params.every(s => s.type === "select" || s.type === "bool" || (s.def >= s.min && s.def <= s.max)), id + "：默认值都在范围内");
  const t0 = Date.now(), D = def.gen(p0, new RNG(11, 0, 0)), ms = Date.now() - t0;
  ok(ms < 1500, id + "：默认参数下生成用时 < 1.5 秒", ms + " ms");
  const err = R.checkData(def, D);
  ok(!err, id + "：数据形状正确", err);
  if (def.kind === "classification") {
    const k = D.classes.length, cnt = new Array(k).fill(0); for (const v of D.y) cnt[v]++;
    ok(k >= 2 && cnt.every(c => c > 0) && D.classes.every(c => typeof c === "string" && c.length), id + "：每个类别都有样本", cnt.join("/"));
  }
  if (def.family === "tabular") ok(D.featureNames && D.featureNames.length === D.d, id + "：特征名齐全");
  const A = def.gen(p0, new RNG(11, 0, 0)), B2 = def.gen(p0, new RNG(12, 0, 0));
  const fixed = !!(D.meta && D.meta.fixed);
  ok(sameBits(A.y, D.y) && (!D.X || sameBits(A.X, D.X)) && (!D.truthMean || sameBits(A.truthMean, D.truthMean)), id + "：同样的种子，逐位相同");
  if (fixed) ok(sameBits(A.y, B2.y) && (!D.X || sameBits(A.X, B2.X)), id + "：真实数据与种子无关");
  else ok(!sameBits(A.y, B2.y), id + "：换种子，数据不同");
  if (def.oracle) { const o = def.oracle(p0); ok(o && typeof o.note === "string" && (def.family === "timeseries" ? typeof o.forecast === "function" : typeof o.predict === "function"), id + "：oracle 的接口"); }
  if (def.bayes) { const b = def.bayes(p0); ok(b && (b.metric === "acc" || b.metric === "mse") && isFinite(b.value) && b.note, id + "：bayes 的接口", b && b.value); }
  if (def.family === "timeseries") ok(D.y.length === D.T && typeof D.label === "string" && (!D.truthMean || (D.meta && /^(observed|hidden)$/.test(D.meta.truthMeanInfo))), id + "：序列与 truthMean 的说明");
}

/* ================================================================== */
section("说明文字：长度、公式能渲染");
{
  const mdSrc = fs.readFileSync(path.join(__dirname, "../src/md.js"), "utf8"), ctx = { window: { addEventListener() {} } };
  vm.runInNewContext(mdSrc + "\n;this.QLMD = QLMD;", ctx);
  let katex = null;
  for (const c of ["katex", path.join(__dirname, "../node_modules/katex"), "/opt/npm-tools/node_modules/katex", process.env.KATEX_DIR && path.join(process.env.KATEX_DIR, "..")]) { if (!c) continue; try { katex = require(c); break; } catch (e) { /* 再试下一个 */ } }
  const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const def of R.list) {
    const doc = def.docs, html = ctx.QLMD.render(doc);
    ok(doc.length >= 150, def.id + "：说明不少于 150 字", doc.length + " 字");
    ok(!/[\u0000-\u0008\u000b-\u001f]/.test(doc), def.id + "：说明里没有控制字符（反斜杠没被当成转义）");
    const outside = html.replace(/<span class="tex"[^>]*>[\s\S]*?<\/span>/g, "");
    ok(outside.indexOf("$") < 0, def.id + "：没有落单的 $（公式都配对了）", (outside.match(/.{0,30}\$.{0,30}/) || [""])[0]);
    if (katex) {
      const bad = [];
      html.replace(/data-display="(\d)" data-tex="([^"]*)"/g, (_, disp, t) => { try { katex.renderToString(unesc(t), { displayMode: disp === "1", throwOnError: true, strict: "ignore" }); } catch (e) { bad.push(unesc(t).slice(0, 60) + " → " + e.message.slice(0, 80)); } return ""; });
      ok(!bad.length, def.id + "：KaTeX 能解析每个公式", bad.join(" | "));
    }
    for (const s of def.params) ok(/[一-鿿]/.test(s.label) || /^[A-Za-zα-ωφτ₀-₉ΔσδεT ]+$/.test(s.label), def.id + "：参数 " + s.key + " 有显示名");
  }
  if (!katex) console.log("  （没找到 KaTeX，跳过公式解析检查）");
}

/* ================================================================== */
section("回归：oracle 的均方误差 ≈ 理论值");
{
  let D = gen("sine1d", { n: 5000, noise: 0.3 }, 2), o = R.get("sine1d").oracle(P("sine1d", { noise: 0.3 }));
  near(mse(o.predict(D.X, D.n), D.y), 0.09, 0.009, "一维正弦：oracle MSE ≈ σ²");
  ok(sameBits(o.predict(D.X, D.n), D.truth), "一维正弦：oracle 与 truth 一致");
  const pe = P("sine1d", { n: 5000, noise: 0.3, hetero: true, extrap: true }); D = R.get("sine1d").gen(pe, new RNG(3, 0, 0));
  const te = Array.from(D.splitIdx.test), tr = Array.from(D.splitIdx.train);
  ok(te.every(i => D.X[i] > 1 && D.X[i] < 1.3) && tr.every(i => D.X[i] > 0 && D.X[i] < 1) && D.splitIdx.valid.length === 1000, "一维正弦外推：测试集在 (1, 1.3)，训练集在 (0, 1)");
  const op = R.get("sine1d").oracle(pe).predict(D.X, D.n), bv = R.get("sine1d").bayes(pe).value;
  near(mse(op, D.y, te), bv, 0.12 * bv, "一维正弦外推 + 异方差：测试集上 oracle MSE ≈ 3.99σ²");
  near(bv, 3.99 * 0.09, 1e-9, "bayes 值 = 3.99σ²");
  D = gen("friedman1", { n: 20000, noise: 1 }, 4);
  near(mse(R.get("friedman1").oracle(P("friedman1")).predict(D.X, D.n), D.y), 1, 0.05, "Friedman #1：oracle MSE ≈ σ²");
  const tm = D.truth.reduce((a, b) => a + b) / D.n, tv = D.truth.reduce((a, b) => a + (b - tm) ** 2, 0) / D.n;
  near(tv, 23.83, 0.6, "Friedman #1：Var f(X) ≈ 23.83（说明里的数）"); near(tm, 14.41, 0.1, "Friedman #1：均值 ≈ 14.41");
  // 最好的线性函数解释 75.2%
  const lin = ml.ols({ X: D.X, y: D.truth, n: D.n, d: D.d }), lp = ml.predictAll(lin, { X: D.X, n: D.n, d: D.d });
  near(1 - mse(lp, D.truth) / tv, 0.752, 0.01, "Friedman #1：最好的线性函数只解释约 75.2%");
  // 稀疏线性：oracle、真系数、Lasso 赢最小二乘
  const ps = P("sparse_linear", { n: 300, d: 100, s: 5, rho: 0.3 }); D = R.get("sparse_linear").gen(ps, new RNG(5, 0, 0));
  near(mse(R.get("sparse_linear").oracle(ps).predict(D.X, D.n), D.y), 1, 0.2, "稀疏线性：oracle MSE ≈ σ²");
  ok(D.meta.support.length === 5 && Array.from(D.meta.beta).filter(v => v !== 0).length === 5 && sameBits(R.get("sparse_linear").gen(ps, new RNG(99, 0, 0)).meta.beta, D.meta.beta), "稀疏线性：支撑集有 s 个、与种子无关");
  const idxTr = [...Array(200).keys()], idxTe = [...Array(100).keys()].map(i => i + 200);
  const dsTr = { X: rows(D, idxTr), y: Float64Array.from(idxTr.map(i => D.y[i])), n: 200, d: 100 }, dsTe = { X: rows(D, idxTe), y: Float64Array.from(idxTe.map(i => D.y[i])), n: 100, d: 100 };
  const mL = mse(ml.predictAll(ml.lasso(dsTr, 0.1), dsTe), dsTe.y), mO = mse(ml.predictAll(ml.ols(dsTr), dsTe), dsTe.y);
  ok(mL < 0.7 * mO, "稀疏线性：Lasso 的测试 MSE 明显低于最小二乘", `lasso ${fmt(mL)} ols ${fmt(mO)}`);
  for (const shape of ["tree", "grid", "oblique"]) { const pp = P("step_fn", { n: 20000, shape, noise: 0.3 }), Ds = R.get("step_fn").gen(pp, new RNG(6, 0, 0)); near(mse(R.get("step_fn").oracle(pp).predict(Ds.X, Ds.n), Ds.y), 0.09, 0.006, "阶梯函数（" + shape + "）：oracle MSE ≈ σ²"); }
  const Dtr = gen("step_fn", { n: 20000, noise: 0.3 }, 7), Dt = gen("step_fn", { n: 5000, noise: 0.3 }, 8);
  const mT = mse(ml.predictAll(ml.tree(Dtr, { depth: 5, minLeaf: 20 }), Dt), Dt.y), mLin = mse(ml.predictAll(ml.ols(Dtr), Dt), Dt.y);
  ok(mT < 0.16 && mLin > 0.8, "阶梯函数（树形）：树接近贝叶斯 MSE（只差分箱造成的边界误差），线性回归差得远", `tree ${fmt(mT)} ols ${fmt(mLin)} bayes 0.09`);
}

/* ================================================================== */
section("分类：oracle 的准确率 ≈ bayes()，并且赢过训练出来的模型");
{
  function check(id, over, name) {
    const pp = P(id, Object.assign({ n: 20000 }, over)), D = R.get(id).gen(pp, new RNG(21, 0, 0)), k = D.classes.length;
    const pr = R.get(id).oracle(pp).predict(D.X, D.n), b = R.get(id).bayes(pp);
    let rowsOk = true; for (let i = 0; i < D.n; i++) { let s = 0; for (let j = 0; j < k; j++) { if (!(pr[i * k + j] >= 0)) rowsOk = false; s += pr[i * k + j]; } if (Math.abs(s - 1) > 1e-9) rowsOk = false; }
    ok(rowsOk, name + "：oracle 输出每行是概率");
    const a = accOf(pr, D.y, k), tol = 4 * Math.sqrt(b.value * (1 - b.value) / D.n + 1e-8) + 3 * (b.se || 0) + 1e-3;
    near(a, b.value, tol, name + "：oracle 在新样本上的准确率 ≈ bayes()");
    // 也用 E[max 后验] 核对（无偏、方差更小）
    let s = 0; for (let i = 0; i < D.n; i++) { let m = 0; for (let j = 0; j < k; j++) m = Math.max(m, pr[i * k + j]); s += m; }
    near(s / D.n, b.value, 0.004 + 3 * (b.se || 0), name + "：E[max 后验] ≈ bayes()");
    return { D, pr, b };
  }
  check("moons", { noise: 0.2 }, "两个半月 σ=0.2"); check("moons", { noise: 0.4 }, "两个半月 σ=0.4");
  check("circles", { noise: 0.1 }, "同心圆 σ=0.1"); check("circles", { noise: 0.25, factor: 0.6 }, "同心圆 σ=0.25");
  check("spirals", { noise: 0.05 }, "螺旋 2 臂"); check("spirals", { k: 3, turns: 2, noise: 0.06 }, "螺旋 3 臂");
  check("xor", { flip: 0.1, q: 3 }, "异或"); check("checker", { m: 6, flip: 0.05 }, "棋盘格");
  check("gauss_mix", { k: 4, d: 3, sep: 2 }, "高斯混合 4 类 3 维"); check("gauss_mix", { k: 5, d: 2, cov: "hetero", imb: true }, "高斯混合 5 类、异方差、不平衡");
  check("gauss_mix", { k: 3, d: 6, cov: "corr" }, "高斯混合 3 类、相关协方差");
  const sl = check("sparse_logistic", {}, "稀疏逻辑回归");
  let ll = 0; for (let i = 0; i < sl.D.n; i++) ll -= Math.log(Math.max(1e-300, sl.pr[i * 2 + sl.D.y[i]]));
  near(ll / sl.D.n, sl.b.also.logloss, 0.012, "稀疏逻辑回归：oracle 的对数损失 ≈ 贝叶斯对数损失");
  // 闭式：两类、共享协方差、先验相等时 = Φ(Δ/2)
  near(R.get("gauss_mix").bayes(P("gauss_mix", { k: 2, d: 2, sep: 2 })).value, 0.841345, 2e-6, "高斯混合两类：贝叶斯准确率 = Φ(δ/2)");
  const bc = R.get("gauss_mix").bayes(P("gauss_mix", { k: 2, d: 4, sep: 2, cov: "corr", imb: true }));
  const mcC = check("gauss_mix", { k: 2, d: 4, sep: 2, cov: "corr", imb: true }, "高斯混合两类、相关、不平衡（闭式）");
  ok(!bc.se && /马氏距离/.test(bc.note), "两类共享协方差时用闭式而不是蒙特卡罗");
  // 贝叶斯准确率赢过同一份数据上训练出来的逻辑回归
  for (const cov of ["iso", "hetero"]) {
    const pp = P("gauss_mix", { k: 2, d: 5, sep: 2, cov, n: 6000 }), D = R.get("gauss_mix").gen(pp, new RNG(31, 0, 0)), nTr = 3000;
    const tr = { X: D.X.subarray(0, nTr * 5), y: Float64Array.from(D.y.subarray(0, nTr)), n: nTr, d: 5 }, te = { X: D.X.subarray(nTr * 5), n: D.n - nTr, d: 5 }, yte = D.y.subarray(nTr);
    const lr = ml.logistic(tr), pl = ml.predictAll(lr, te); let cl = 0; for (let i = 0; i < te.n; i++) if ((pl[i] > 0.5 ? 1 : 0) === yte[i]) cl++;
    const po = R.get("gauss_mix").oracle(pp).predict(te.X, te.n), ao = accOf(po, yte, 2), b = R.get("gauss_mix").bayes(pp);
    ok(ao >= cl / te.n && cl / te.n <= b.value + 3 * (b.se || 0) + 0.01, "高斯混合（" + cov + "）：贝叶斯分类器 ≥ 训练出来的逻辑回归", `oracle ${fmt(ao)} logistic ${fmt(cl / te.n)} bayes ${fmt(b.value)}`);
  }
  // 异或：逻辑回归学不到（凸损失 + 对称性），oracle 达到 1 − ε
  { const D = gen("xor", { n: 8000, flip: 0 }, 41), lr = ml.logistic({ X: D.X, y: Float64Array.from(D.y), n: D.n, d: D.d }), pl = ml.predictAll(lr, D); let mx = 0, ll = 0; for (let i = 0; i < D.n; i++) { mx = Math.max(mx, Math.abs(pl[i] - 0.5)); ll -= Math.log(D.y[i] ? pl[i] : 1 - pl[i]); } ok(mx < 0.06 && Math.abs(ll / D.n - Math.LN2) < 0.005, "异或：逻辑回归的概率处处接近 ½，对数损失 ≈ ln 2", `max|p − ½| = ${fmt(mx)}`); }
  // 单个特征与类别独立（偶数 m 的棋盘格）
  { const D = gen("checker", { n: 40000, m: 4 }, 42); let a = 0, b = 0; for (let i = 0; i < D.n; i++) if (D.X[2 * i] < 0.37) { a++; b += D.y[i]; } near(b / a, 0.5, 0.02, "棋盘格 m=4：P(y=1 | x₁ < 0.37) ≈ ½"); }
  ok(R.get("moons").bayes(P("moons", { noise: 0 })).value === 1 && R.get("circles").bayes(P("circles", { noise: 0 })).value === 1, "无噪声时贝叶斯准确率是 1");
  const t0 = Date.now(); R.get("spirals").bayes(P("spirals", { k: 3, turns: 3, noise: 0.01 })); ok(Date.now() - t0 < 3000, "最坏情况下 bayes() 也在 3 秒内", (Date.now() - t0) + " ms");
}

/* ================================================================== */
section("真实表格数据：形状、类别、数值、出处");
{
  const want = { iris: [150, 4, [50, 50, 50]], wine: [178, 13, [59, 71, 48]], breast_cancer: [569, 30, [212, 357]] };
  for (const id of Object.keys(want)) {
    const D = gen(id), [n, d, cnt] = want[id], c = new Array(cnt.length).fill(0); for (const v of D.y) c[v]++;
    ok(D.n === n && D.d === d && D.classes.length === cnt.length && c.join() === cnt.join(), id + `：${n} × ${d}，类别 ${cnt.join("/")}`, `${D.n}×${D.d} ${c.join("/")}`);
    const s = R.get(id).source;
    ok(s && s.license === "CC BY 4.0" && /^https:\/\/archive\.ics\.uci\.edu\/dataset\//.test(s.url) && /doi\.org\/10\.24432\//.test(s.cite) && s.changes, id + "：出处、许可、引用、改动说明齐全");
    ok(D.featureNames.every(f => /[一-鿿]/.test(f) && /[a-z]/i.test(f)), id + "：特征名中英对照");
  }
  const ir = gen("iris"), wi = gen("wine"), bc = gen("breast_cancer");
  ok([5.1, 3.5, 1.4, 0.2].every((v, j) => ir.X[j] === v) && [5.9, 3, 5.1, 1.8].every((v, j) => ir.X[149 * 4 + j] === v), "iris：第一行、最后一行");
  ok(ir.X[34 * 4 + 3] === 0.2 && ir.X[37 * 4 + 1] === 3.6 && ir.X[37 * 4 + 2] === 1.4, "iris：第 35、38 个样本是 Fisher 原文的值（与 UCI 文件不同）");
  ok(wi.X[0] === 14.23 && wi.X[12] === 1065 && wi.X[177 * 13 + 12] === 560, "wine：第一行、最后一行的几个值");
  ok(bc.X[0] === 17.99 && bc.X[3] === 1001 && bc.X[29] === 0.1189 && bc.y[0] === 0, "breast_cancer：第一行（恶性）");
  ok(gen("iris", { cols: "petal" }).d === 2 && gen("wine", { cols: "color_flav" }).featureNames[0].startsWith("颜色强度") && gen("breast_cancer", { cols: "street3" }).d === 3 && gen("breast_cancer", { cols: "mean" }).d === 10, "特征子集");
  // 与 scikit-learn 附带的原始 CSV 逐个对照（本机有 scikit-learn 时）
  let dir = null; for (const c of ["/usr/local/lib/python3.13/dist-packages/sklearn/datasets/data", "/usr/lib/python3/dist-packages/sklearn/datasets/data"]) if (fs.existsSync(path.join(c, "iris.csv"))) dir = c;
  if (dir) for (const [id, fn] of [["iris", "iris.csv"], ["wine", "wine_data.csv"], ["breast_cancer", "breast_cancer.csv"]]) {
    const lines = fs.readFileSync(path.join(dir, fn), "utf8").trim().split(/\r?\n/).slice(1).map(l => l.split(",")), D = gen(id); let bad = 0;
    lines.forEach((r, i) => { for (let j = 0; j < D.d; j++) if (D.X[i * D.d + j] !== parseFloat(r[j])) bad++; if (D.y[i] !== +r[D.d]) bad++; });
    ok(bad === 0 && lines.length === D.n, id + "：与 scikit-learn 的 CSV 逐位相同", bad + " 处不同");
  } else console.log("  （本机没有 scikit-learn 的 CSV，跳过逐个对照）");
}

/* ================================================================== */
section("时间序列：oracle 与理论值");
{
  function oneStep(id, D, pp, from) { const o = R.get(id).oracle(pp), f = []; for (let t = from; t < D.T - 1; t++) f.push([o.forecast(D.y.subarray(0, t + 1), 1)[0], D.y[t + 1]]); return f; }
  const m2 = f => f.reduce((s, [a, b]) => s + (a - b) ** 2, 0) / f.length;
  // 随机游走：oracle 就是朴素预测
  let pp = P("random_walk", { T: 20000 }), D = R.get("random_walk").gen(pp, new RNG(51, 0, 0)), o = R.get("random_walk").oracle(pp);
  let same = true; for (let t = 0; t < 200; t++) { const f = o.forecast(D.y.subarray(0, t + 1), 5); if (!f.every(v => v === D.y[t])) same = false; }
  ok(same, "随机游走（μ = 0）：oracle 的每一步预测都恰好等于最后一个值");
  near(m2(oneStep("random_walk", D, pp, 0)), 1, 0.04, "随机游走：一步 MSE ≈ σ²");
  const pd = P("random_walk", { drift: 0.2 }); ok(R.get("random_walk").oracle(pd).forecast(Float64Array.of(1, 2, 3), 3).every((v, j) => Math.abs(v - (3 + 0.2 * (j + 1))) < 1e-12), "随机游走带漂移：y_t + hμ");
  // truthMean 与 oracle 的一步预测一致（都是 E[y_t | 过去]）
  for (const [id, over] of [["random_walk", {}], ["ar2", {}], ["seasonal", {}], ["regime", {}], ["garch_vol", {}], ["logistic_map", { noise: 0 }]]) {
    const q = P(id, over), Dq = R.get(id).gen(q, new RNG(52, 0, 0)), oq = R.get(id).oracle(q); let mx = 0;
    for (let t = 1; t < Dq.T; t++) mx = Math.max(mx, Math.abs(oq.forecast(Dq.y.subarray(0, t), 1)[0] - Dq.truthMean[t]));
    ok(mx < 1e-9, id + "：truthMean[t] = oracle 用 y[0..t−1] 做的一步预测", fmt(mx));
  }
  // AR(2)
  pp = P("ar2", { T: 20000 }); D = R.get("ar2").gen(pp, new RNG(53, 0, 0));
  near(m2(oneStep("ar2", D, pp, 2)), 1, 0.04, "AR(2)：oracle 一步 MSE ≈ 创新方差 σ²");
  const g0 = D.meta.gamma0, ym = D.y.reduce((a, b) => a + b) / D.T, yv = D.y.reduce((a, b) => a + (b - ym) ** 2, 0) / D.T;
  near(yv / g0, 1, 0.06, "AR(2)：样本方差 ≈ γ₀（Yule–Walker）");
  let r1 = 0; for (let t = 1; t < D.T; t++) r1 += (D.y[t] - ym) * (D.y[t - 1] - ym); near(r1 / D.T / yv, 0.5 / 1.3, 0.03, "AR(2)：一阶自相关 ≈ φ₁ / (1 − φ₂)");
  // 平稳三角形 ⇔ 逆根都在单位圆内（数值核对定理），以及越界时把根缩回 0.995
  let agree = true;
  for (let a = -2; a <= 2.0001; a += 0.05) for (let b = -1; b <= 1.0001; b += 0.05) {
    const disc = a * a + 4 * b, mod = disc >= 0 ? Math.max(Math.abs((a + Math.sqrt(disc)) / 2), Math.abs((a - Math.sqrt(disc)) / 2)) : Math.sqrt(-b);
    const tri = a + b < 1 && b - a < 1 && Math.abs(b) < 1;
    if (Math.abs(mod - 1) > 1e-9 && tri !== mod < 1) agree = false;
  }
  ok(agree, "平稳三角形与特征根判据处处一致");
  for (const [a, b, out] of [[0.5, -0.3, false], [1.2, -0.3, false], [0.6, 0.5, true], [-0.2, 0.9, true], [0, -0.98, false], [1.9, -0.95, false], [2, -1, true]]) {
    const Dq = gen("ar2", { phi1: a, phi2: b, T: 500 });
    ok((Dq.meta.shrunk !== null) === out && Dq.meta.rootModulus <= 0.995 + 1e-12 && Dq.y.every(isFinite), `AR(2) (${a}, ${b})：${out ? "在三角形外，缩回" : "在三角形内，不动"}`, "shrunk=" + Dq.meta.shrunk);
  }
  // 季节
  pp = P("seasonal", { T: 12000 }); D = R.get("seasonal").gen(pp, new RNG(54, 0, 0));
  near(m2(oneStep("seasonal", D, pp, 0)), 1, 0.05, "趋势与季节：oracle 一步 MSE ≈ σ²");
  ok(D.season === 12 && D.freq === "month" && Math.abs(D.meta.pattern.reduce((a, b) => a + b)) < 1e-12 && Math.abs(R.get("seasonal").gen(P("seasonal", { shape: "spike", m: 7 }), new RNG(1, 0, 0)).meta.pattern.reduce((a, b) => a + b)) < 1e-12, "季节项一个周期加起来是 0；m = 12 是月度");
  // 机制切换：oracle 赢朴素预测和无条件均值；缓存不影响结果
  pp = P("regime", { T: 6000 }); D = R.get("regime").gen(pp, new RNG(55, 0, 0));
  const fr = oneStep("regime", D, pp, 3000), mOr = m2(fr), mNa = fr.reduce((s, [, b], i) => s + (D.y[3000 + i] - b) ** 2, 0) / fr.length;
  const ybar = D.y.reduce((a, b) => a + b) / D.T, mMe = fr.reduce((s, [, b]) => s + (ybar - b) ** 2, 0) / fr.length;
  ok(mOr < mNa && mOr < mMe, "机制切换：滤波预测赢朴素预测和均值", `oracle ${fmt(mOr)} naive ${fmt(mNa)} mean ${fmt(mMe)}`);
  const oA = R.get("regime").oracle(pp), oB = R.get("regime").oracle(pp); let cacheSame = true;
  for (const t of [4000, 4001, 4002, 3990, 5000, 10]) { const a = oA.forecast(D.y.subarray(0, t), 4); const fresh = R.get("regime").oracle(pp).forecast(D.y.subarray(0, t), 4); if (!sameBits(a, fresh)) cacheSame = false; }
  ok(cacheSame && sameBits(oB.forecast(D.y.subarray(0, 5000), 3), oA.forecast(D.y.subarray(0, 5000), 3)), "机制切换：接着算的滤波与从头算逐位相同");
  let acc = 0; for (let t = 0; t < D.T; t++) acc += (D.meta.filtProb[t] > 0.5 ? 1 : 0) === D.meta.state[t] ? 1 : 0; ok(acc / D.T > 0.85, "机制切换：滤波概率能认出大部分状态", fmt(acc / D.T));
  // Logistic 映射（r = 4）
  D = gen("logistic_map", { T: 20000, noise: 0 }, 56); const hx = D.meta.hidden;
  let lyap = 0; for (let t = 0; t < D.T; t++) lyap += Math.log(Math.abs(4 * (1 - 2 * hx[t])) + 1e-300); near(lyap / D.T, Math.LN2, 0.03, "Logistic 映射：Lyapunov 指数 ≈ ln 2");
  const xm = hx.reduce((a, b) => a + b) / D.T, xv = hx.reduce((a, b) => a + (b - xm) ** 2, 0) / D.T; near(xv, 0.125, 0.005, "Logistic 映射：方差 ≈ 1/8（反正弦分布）");
  for (const k of [1, 2, 3]) { let c = 0; for (let t = k; t < D.T; t++) c += (hx[t] - xm) * (hx[t - k] - xm); near(c / D.T / xv, 0, 0.03, "Logistic 映射：滞后 " + k + " 的自相关 ≈ 0"); }
  near(m2(oneStep("logistic_map", D, P("logistic_map", { noise: 0 }), 0)), 0, 1e-20, "Logistic 映射（无噪声）：oracle 一步预测完全准确");
  ok(R.get("logistic_map").oracle(P("logistic_map")).exact === false && gen("logistic_map").meta.truthMeanInfo === "hidden", "有噪声时 oracle 标为近似、truthMean 标为隐藏状态");
  // 洛伦兹、Mackey–Glass
  D = gen("lorenz", { T: 8000 }, 57); { const m = D.y.reduce((a, b) => a + b) / D.T, s = Math.sqrt(D.y.reduce((a, b) => a + (b - m) ** 2, 0) / D.T); near(s, 7.9, 1.2, "洛伦兹：x 的标准差 ≈ 7.9"); ok(D.y.every(v => Math.abs(v) < 25), "洛伦兹：|x| < 25（在吸引子上）"); }
  D = gen("mackey_glass", { T: 4000 }, 58); { const m = D.y.reduce((a, b) => a + b) / D.T, s = Math.sqrt(D.y.reduce((a, b) => a + (b - m) ** 2, 0) / D.T); ok(D.y.every(v => v > 0.1 && v < 1.6), "Mackey–Glass：值在 (0.1, 1.6) 里"); near(s, 0.23, 0.06, "Mackey–Glass（τ = 17）：标准差 ≈ 0.23"); }
  { const peaks = tau => { const y = gen("mackey_glass", { tau, T: 1500, dt: 0.5 }, 59).y.slice(500), m = []; for (let i = 1; i < y.length - 1; i++) if (y[i] > y[i - 1] && y[i] >= y[i + 1]) m.push(y[i]); return Math.max(...m) - Math.min(...m); };
    const p5 = peaks(5), p17 = peaks(17); ok(p5 < 2e-3 && p17 > 0.1, "Mackey–Glass：τ = 5 是周期振荡（峰值都一样高），τ = 17 是混沌", `峰值的极差 ${fmt(p5)} / ${fmt(p17)}`); }
  // GARCH
  pp = P("garch_vol", { T: 20000 }); D = R.get("garch_vol").gen(pp, new RNG(60, 0, 0));
  const fg = oneStep("garch_vol", D, pp, 1000), mG = m2(fg), vbar = 1, mC = fg.reduce((s, [, b]) => s + (vbar - b) ** 2, 0) / fg.length;
  ok(mG < 0.9 * mC, "GARCH：条件方差预测平方收益明显好于长期均值", `oracle ${fmt(mG)} const ${fmt(mC)}`);
  near(mG, R.get("garch_vol").bayes(pp).value, 0.35 * R.get("garch_vol").bayes(pp).value, "GARCH：一步 MSE ≈ (κ − 1)E[σ⁴]（厚尾，容差放宽）");
  ok(R.get("garch_vol").oracle(P("garch_vol", { target: "ret" })).forecast(D.y, 5).every(v => v === 0), "GARCH：收益的最优预测恒为 0");
  const oh = R.get("garch_vol").oracle(pp).forecast(D.y.subarray(0, 500), 30), s1 = D.meta.sigma2[500];
  ok(Math.abs(oh[0] - s1) < 1e-12 && oh.every((v, j) => Math.abs(v - (1 + Math.pow(0.95, j) * (s1 - 1))) < 1e-9), "GARCH：多步预测 v̄ + (α+β)^{h−1}(σ²_{t+1} − v̄)");
  ok(R.get("garch_vol").bayes(P("garch_vol", { alpha: 0.3, beta: 0.65 })) === null, "GARCH：四阶矩无穷时 bayes 返回 null");
}

/* ================================================================== */
section("真实行情：与 data/samples.json 一致");
{
  const S = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/samples.json"), "utf8"));
  const map = { "sample-goog": "real_goog_daily", "sample-spx": "real_sp500_monthly", "sample-ixic": "real_nasdaq_monthly", "sample-aapl": "real_aapl_monthly", "sample-msft": "real_msft_monthly", "sample-ibm": "real_ibm_monthly", "sample-amzn": "real_amzn_monthly" };
  ok(S.length === 7 && S.every(s => map[s.id]), "七段行情都有对应的数据集");
  for (const s of S) {
    const id = map[s.id], D = gen(id), Dr = gen(id, { target: "logret" });
    let d = s.d0; const dates = [d]; for (const g of s.dd) { d += g; dates.push(d); }
    const iso = dates.map(x => new Date(x * 86400000).toISOString().slice(0, s.K === 252 ? 10 : 7));
    ok(D.T === s.v.length && D.y.every((v, i) => v === Math.log(s.v[i])), id + "：对数价格与原始数据逐个相同", D.T + " 个点");
    ok(D.times.every((t, i) => t === iso[i]), id + "：日期一致", D.times[0] + " … " + D.times[D.T - 1]);
    ok(Dr.T === s.v.length - 1 && Math.abs(Dr.y[0] - 100 * Math.log(s.v[1] / s.v[0])) < 1e-12 && Dr.times[0] === iso[1], id + "：对数收益少一个点，日期对齐到收益的终点");
    ok(D.freq === (s.K === 252 ? "day" : "month") && /不保证准确/.test(R.get(id).docs) && D.meta.fixed, id + "：频率、免责说明");
  }
}

/* ================================================================== */
section("CSV 导入");
{
  // 引号里的逗号和换行、转义的引号、CRLF、BOM、行尾多余的逗号
  let t = R.parseCSV('﻿name,score,city,label\r\n"Smith, John",3.5,"New ""York""",yes\r\n"Li\nLei",,Paris,no\r\nBob, 7 , Paris ,yes,\r\n');
  ok(t.header.join("|") === "name|score|city|label" && t.rows.length === 3 && t.delimiter === "," && t.hasHeader, "表头、行数、分隔符", JSON.stringify(t.header));
  ok(t.rows[0][0] === "Smith, John" && t.rows[0][2] === 'New "York"' && t.rows[1][0] === "Li\nLei" && t.rows[2][1] === "7" && t.rows[2].length === 4, "引号里的逗号、换行和转义引号；去掉首尾空白；行尾多余的逗号", JSON.stringify(t.rows));
  let D = R.fromCSV(t, { target: "label" });
  ok(D.kind === "classification" && D.classes.join() === "no,yes" && Array.from(D.y).join() === "1,0,1", "文字目标 → 分类，类别按字符串排序编号");
  ok(D.meta.hasNaN && D.meta.missing === 1 && isNaN(D.X[1 * D.d + D.featureNames.indexOf("score")]), "数值列的缺失值留成 NaN，meta 里记下");
  ok(D.featureNames.includes("city=Paris") && D.featureNames.includes('city=New "York"') && D.featureNames.filter(f => f.startsWith("city=")).length === 2, "类别列独热编码", D.featureNames.join(" | "));
  ok(R.checkData(null, D) === "", "导入的数据通过形状检查（带 NaN 时由 meta.hasNaN 声明）");
  const I0 = R.impute(D, Int32Array.of(0, 2), { indicators: true }), js = D.featureNames.indexOf("score");
  ok(I0.X[1 * I0.d + js] === 5.25 && I0.d === D.d + 1 && I0.featureNames[I0.d - 1] === "score·缺失" && I0.X[1 * I0.d + I0.d - 1] === 1 && !I0.meta.hasNaN && I0.meta.imputed.from === "rows", "impute：只用给定的行算中位数，可加缺失指示列");
  ok(R.checkData(null, Object.assign({}, D, { meta: {} })) !== "", "没声明 hasNaN 时，带 NaN 的数据通不过检查");
  // 分号分隔 + 小数逗号；制表符；没有表头
  t = R.parseCSV("a;b;y\n1,5;2;0,25\n3,25;4;1,5\n2;6;2,75\n");
  D = R.fromCSV(t);
  ok(t.delimiter === ";" && D.kind === "regression" && D.X[0] === 1.5 && D.X[2] === 3.25 && D.y[1] === 1.5, "分号分隔、逗号当小数点 → 回归", JSON.stringify(Array.from(D.y)));
  t = R.parseCSV("1\t2\t0\n4\t5\t1\n7\t8\t1\n");
  ok(t.delimiter === "\t" && !t.hasHeader && t.header.join() === "列1,列2,列3" && t.rows.length === 3, "制表符分隔、自动识别没有表头");
  D = R.fromCSV(t); ok(D.kind === "classification" && D.classes.join() === "0,1", "目标是少数几个整数 → 分类");
  // 自动判断任务类型
  const mk = (ys) => "x,y\n" + ys.map((v, i) => i + "," + v).join("\n");
  ok(R.fromCSV(R.parseCSV(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2]))).kind === "classification", "不超过 10 个不同整数 → 分类");
  ok(R.fromCSV(R.parseCSV(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).kind === "regression", "超过 10 个不同整数 → 回归");
  ok(R.fromCSV(R.parseCSV(mk([0.5, 1.5, 0.5, 1.5]))).kind === "regression", "有小数 → 回归");
  ok(R.fromCSV(R.parseCSV(mk(["a", "b", "a", "c"]))).classes.join() === "a,b,c", "文字 → 分类");
  ok(R.fromCSV(R.parseCSV(mk([3, 10, 2, 10]))).classes.join() === "2,3,10", "数字类别按数值排序");
  ok(throwsZh(() => R.fromCSV(R.parseCSV(mk(["a", "b", "a", "c"])), { kind: "regression" }), /不能做回归/), "文字目标不能做回归");
  ok(throwsZh(() => R.fromCSV(R.parseCSV(mk([1, 1, 1]))), /一个类别/), "只有一个类别时报错");
  // 目标缺失的行去掉；缺失记号
  D = R.fromCSV(R.parseCSV("x,y\n1,a\n2,NA\n?,b\n4,\n5,a\n"));
  ok(D.n === 3 && D.meta.droppedRows === 2 && isNaN(D.X[1]), "目标缺失的行去掉，NA / ? / 空都算缺失");
  // 类别很多的列：编号样的列不用；否则保留最常见的 29 个 + (其他)
  let txt = "id,c,y\n"; for (let i = 0; i < 400; i++) txt += "u" + i + ",L" + (i % 40) + "," + (i % 2) + "\n";
  D = R.fromCSV(R.parseCSV(txt));
  const cc = D.meta.columns.find(c => c.name === "c"), ci = D.meta.columns.find(c => c.name === "id");
  ok(ci.type === "dropped" && cc.type === "cat" && cc.levels.length === 30 && cc.levels[29] === "(其他)" && D.d === 30, "编号列不用；40 个水平的列压成 30 个（含「(其他)」）", `d=${D.d}`);
  let rowOk = true; for (let i = 0; i < D.n; i++) { let s = 0; for (let j = 0; j < D.d; j++) s += D.X[i * D.d + j]; if (s !== 1) rowOk = false; } ok(rowOk, "独热编码每行恰好一个 1");
  D = R.fromCSV(R.parseCSV("c,y\nred,1.5\n,2.5\nblue,3.5\nred,4.5\n"));
  ok(D.featureNames.join() === "c=red,c=blue,c=(缺失)" && D.X[1 * 3 + 2] === 1, "类别列的缺失算单独一个水平");
  ok(R.fromCSV(R.parseCSV("zip,y\n94720,1.5\n10001,2.5\n94720,3.5\n"), { categorical: ["zip"] }).featureNames.join() === "zip=94720,zip=10001", "可以强制把数字列当类别");
  ok(R.fromCSV(R.parseCSV("a,b,y\n1,2,3.5\n4,5,6.5\n"), { features: ["b"], target: "y" }).featureNames.join() === "b", "可以指定特征列");
  // 时间序列：日期从新到旧时倒过来；缺失值用前一个观测补
  txt = "date,close\n"; for (let i = 20; i >= 1; i--) txt += `2024-01-${String(i).padStart(2, "0")},${i === 10 ? "" : 100 + i}\n`;
  D = R.fromCSV(R.parseCSV(txt), { kind: "forecast", target: "close" });
  ok(D.T === 20 && D.times[0] === "2024-01-01" && D.y[0] === 101 && D.y[9] === 109 && D.y[19] === 120 && D.freq === "day" && D.meta.filled === 1 && R.checkData(null, D) === "", "时间序列：倒序变正序、前值填补、识别日频", JSON.stringify(Array.from(D.y.subarray(7, 11))));
  ok(throwsZh(() => R.fromCSV(R.parseCSV("v\n1\n2\n3\n"), { kind: "forecast" }), /太短/), "时间序列太短时报错");
  // 上限
  let big = "a,b\n"; for (let i = 0; i < 50001; i++) big += i + "," + (i % 3) + "\n";
  ok(throwsZh(() => R.parseCSV(big), /50000/), "超过 50000 行报错");
  let wide = Array.from({ length: 201 }, (_, j) => "c" + j).join(",") + "\n" + Array.from({ length: 201 }, () => "1").join(",") + "\n";
  ok(throwsZh(() => R.parseCSV(wide), /200/), "超过 200 列报错");
  ok(throwsZh(() => R.parseCSV("   \n  "), /空/) && throwsZh(() => R.parseCSV("a,b\n"), /没有数据/), "空文件、只有表头时报错");
  ok(throwsZh(() => R.fromCSV(R.parseCSV("a,b\n1,2\n3,4\n"), { target: "zz" }), /找不到/), "找不到目标列时报错");
  const t50 = Date.now(); let csv = "x1,x2,x3,cat,y\n"; for (let i = 0; i < 50000; i++) csv += `${i * 0.5},${(i * 7) % 13},"${i % 5}.5",k${i % 7},${i % 3}\n`;
  const Dbig = R.fromCSV(R.parseCSV(csv)); ok(Dbig.n === 50000 && Dbig.d === 10 && Date.now() - t50 < 3000, "50000 行的文件 3 秒内导入", (Date.now() - t50) + " ms");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exitCode = 1; }
