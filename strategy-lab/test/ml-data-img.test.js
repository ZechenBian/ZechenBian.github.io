// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室：图像与格点数据集（data-image.js）、科研玩具数据集与分析工具（data-toy.js）的测试
// 运行：cd strategy-lab && node test/ml-data-img.test.js
const path = require("path"), fs = require("fs");
const { ok, near, section, done } = require("./harness.js");
const SRC = path.join(__dirname, "../src");
const QL_CORE = require(path.join(SRC, "core.js"));
const IMG = require(path.join(SRC, "ml/data-image.js")), TOY = require(path.join(SRC, "ml/data-toy.js"));
const REG_PATH = path.join(SRC, "ml/registry.js"), HAS_REG = fs.existsSync(REG_PATH);
const REG = HAS_REG ? require(REG_PATH) : null;

/** 装好一个新的 QL：registry（没有就用小替身）+ 两个数据文件 */
function fresh(fromSource) {
  const QL = QL_CORE({});
  if (REG) REG(QL);
  else QL.mlreg = { list: [], byId: {}, add(d) { if (this.byId[d.id]) throw new Error("dup " + d.id); this.list.push(d); this.byId[d.id] = d; return d; }, get(id) { return this.byId[id] || null; },
    clean(def, p) { const o = {}; def.params.forEach(s => { o[s.key] = p && p[s.key] !== undefined ? p[s.key] : s.def; }); return o; } };
  if (fromSource) {
    // 和后台线程一样：只拿 toString() 的源码，在全局作用域里执行（碰不到模块里的任何变量）
    new Function("QL", "(" + IMG.toString() + ")(QL);\n(" + TOY.toString() + ")(QL);")(QL);
  } else { IMG(QL); TOY(QL); }
  return QL;
}
const QL = fresh(false), R = QL.mlreg, RNG = QL.RNG;
const clean = (def, p) => R.clean(def, p || {});
const gen = (id, p, seed) => { const d = R.get(id); return d.gen(clean(d, p), new RNG(seed == null ? 7 : seed, 101, 0)); };
const IDS = ["ising", "digits", "shapes", "percolation", "modadd", "group", "parity", "setfn", "teacher"];
function eqArr(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i])) return false; return true; }
function counts(y, k) { const c = new Array(k).fill(0); for (const v of y) c[v]++; return c; }

section("注册与定义");
{
  console.log("  " + (HAS_REG ? "使用真正的 registry.js" : "registry.js 不存在：使用测试里的小替身"));
  IDS.forEach(id => ok(!!R.get(id), "已注册 " + id));
  ok(R.list.filter(d => d.family === "image").map(d => d.id).join() === "ising,digits,shapes,percolation", "image 类：ising、digits、shapes、percolation");
  ok(R.list.filter(d => d.family === "toy").map(d => d.id).join() === "modadd,group,parity,setfn,teacher", "toy 类：modadd、group、parity、setfn、teacher");
  for (const id of IDS) {
    const d = R.get(id);
    let bad = "";
    if (!/^[a-z0-9_]+$/.test(d.id)) bad = "id";
    else if (["classification", "regression"].indexOf(d.kind) < 0) bad = "kind";
    else if (typeof d.gen !== "function" || typeof d.docs !== "string" || d.docs.length < 400) bad = "gen/docs";
    else if (["images", "lattice", "cayley", "table", "scatter2d"].indexOf(d.plot) < 0) bad = "plot";
    for (const s of d.params) {
      if (s.type === "int" || s.type === "num") { if (!(s.min <= s.def && s.def <= s.max)) bad = "param " + s.key; if (s.type === "int" && [s.min, s.max, s.def].some(v => Math.floor(v) !== v)) bad = "int " + s.key; }
      else if (s.type === "select") { if (!s.options.some(o => o[0] === s.def)) bad = "select " + s.key; }
      else if (s.type === "bool") { if (typeof s.def !== "boolean") bad = "bool " + s.key; }
      else bad = "type " + s.key;
    }
    ok(!bad, id + "：定义合规", bad);
    ok(/参考|出处/.test(d.docs) && /\$/.test(d.docs), id + "：说明里有公式和参考文献", d.docs.length + " 字符");
  }
  ok(R.get("digits").source && /^https:\/\//.test(R.get("digits").source.url) && R.get("digits").source.license === "CC BY 4.0" && /10\.24432\/C50P49/.test(R.get("digits").source.cite), "digits：出处、CC BY 4.0、DOI");
  const head = f => fs.readFileSync(path.join(SRC, "ml", f), "utf8").split("\n").slice(0, 2).join("\n");
  const H = "// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。\n// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。";
  ok(head("data-image.js") === H && head("data-toy.js") === H, "两个文件的头两行是版权声明");
  for (const f of ["data-image.js", "data-toy.js"]) { const s = fs.readFileSync(path.join(SRC, "ml", f), "utf8"); ok(!/Math\.random/.test(s), f + "：不用 Math.random"); }
}

section("说明文档：Markdown 与 KaTeX");
{
  const md = new Function("window", fs.readFileSync(path.join(SRC, "md.js"), "utf8") + "\n;return QLMD;")({ addEventListener() {} });
  let katex = null; try { katex = require("/opt/npm-tools/node_modules/katex"); } catch (e) { try { katex = require("katex"); } catch (e2) { katex = null; } }
  for (const id of IDS) {
    const html = md.render(R.get(id).docs), rest = html.replace(/<span class="tex"[^>]*>[\s\S]*?<\/span>/g, "");
    ok(rest.indexOf("$") < 0, id + "：所有 $ 都配成了公式", (rest.match(/.{0,30}\$.{0,30}/) || [""])[0]);
    if (katex) {
      const texs = []; html.replace(/data-tex="([^"]*)"/g, (_, t) => { texs.push(t.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")); return ""; });
      let err = "";
      for (const t of texs) { try { katex.renderToString(t, { throwOnError: true, strict: "ignore" }); } catch (e) { err = t.slice(0, 60) + " → " + String(e.message).slice(0, 80); break; } }
      ok(!err, id + "：" + texs.length + " 个公式都能被 KaTeX 解析", err);
    }
  }
  if (!katex) ok(true, "（没找到 KaTeX，跳过公式解析检查）");
}

section("数据形状、确定性、生成时间");
{
  const times = {};
  for (const id of IDS) {
    const d = R.get(id), t0 = Date.now(), D = gen(id, {}, 11), ms = Date.now() - t0; times[id] = ms;
    if (R.checkData) ok(R.checkData(d, D) === "", id + "：registry.checkData 通过", R.checkData(d, D));
    ok(D.X instanceof Float64Array && D.X.length === D.n * D.d, id + "：X 是 n×d 的 Float64Array", D.n + "×" + D.d);
    ok(d.kind === "classification" ? D.y instanceof Int32Array && D.classes.length >= 2 && Array.from(D.y).every(v => v >= 0 && v < D.classes.length) : D.y instanceof Float64Array, id + "：y 的类型与取值");
    let fin = true; for (const v of D.X) if (!isFinite(v)) { fin = false; break; } ok(fin, id + "：X 全是有限数");
    if (D.shape) ok(D.shape.reduce((a, b) => a * b, 1) === D.d, id + "：shape 与 d 一致");
    if (D.splitIdx) { const s = D.splitIdx, all = new Uint8Array(D.n); let dup = false; for (const k of ["train", "valid", "test"]) for (const i of s[k]) { if (all[i]) dup = true; all[i] = 1; } ok(!dup && s.train.length > 0 && s.valid.length > 0 && s.test.length > 0, id + "：splitIdx 三份不交且非空", s.train.length + "/" + s.valid.length + "/" + s.test.length); }
    const D2 = gen(id, {}, 11);
    ok(eqArr(D.X, D2.X) && eqArr(D.y, D2.y) && (!D.splitIdx || eqArr(D.splitIdx.test, D2.splitIdx.test)), id + "：同一个种子逐位相同");
    if (id === "modadd" || id === "group") { const D3 = gen(id, {}, 12); ok(eqArr(D.X, D3.X) && !eqArr(D.splitIdx.train, D3.splitIdx.train), id + "：输入是整张表，换种子只换划分"); }
    else if (id !== "digits") { const D3 = gen(id, {}, 12); ok(!eqArr(D.X, D3.X), id + "：换种子数据就变"); }
    ok(ms < 3000, id + "：默认参数下生成用时 < 3 秒", ms + " ms");
  }
  console.log("  生成用时（ms）：" + JSON.stringify(times));
  // 和后台线程一样从 toString() 装：结果逐位相同
  const QW = fresh(true);
  for (const id of ["ising", "digits", "group", "parity"]) { const dW = QW.mlreg.get(id), DW = dW.gen(QW.mlreg.clean(dW, {}), new QW.RNG(11, 101, 0)), D = gen(id, {}, 11); ok(eqArr(DW.X, D.X) && eqArr(DW.y, D.y), id + "：从 toString() 源码装（线程方式）结果相同"); }
  ok(typeof QW.mltoy.fourier === "function" && typeof QW.mlimage.kaufmanLogZ === "function", "线程方式下 QL.mltoy、QL.mlimage 也装上了");
}

section("伊辛：精确结果");
{
  const I = QL.mlimage;
  near(I.Tc, 2 / Math.log(1 + Math.SQRT2), 1e-15, "T_c = 2/ln(1+√2)");
  near(Math.sinh(2 * I.Kc), 1, 1e-14, "自对偶点 sinh 2K_c = 1");
  near(I.onsagerEnergy(I.Tc), -Math.SQRT2, 1e-12, "Onsager：u(T_c) = −√2");
  near(I.onsagerEnergy(2.0), -1.7455645753125535, 1e-10, "Onsager：u(2.0)（对照项目 35 的数值微分）");
  near(I.yang(2.0), 0.911319377877496, 1e-12, "Yang：M(2.0)");
  ok(I.yang(2.3) === 0 && I.yang(I.Tc + 1e-9) === 0, "Yang：T ≥ T_c 时 M = 0");
  near(I.tinf(0.8), 2.1877, 5e-4, "T_∞(0.8) = 2.1877（项目 35 的表）"); near(I.tinf(0.5), 2.2674, 5e-4, "T_∞(0.5) = 2.2674"); near(I.yang(I.tinf(0.7)), 0.7, 1e-12, "M(T_∞(m*)) = m*");
  // Kaufman 与暴力枚举（4×4 与 2×8 的非方形）
  function brute(K, m, n) {
    const N = m * n; let mx = -Infinity; const ws = [];
    for (let c = 0; c < 1 << N; c++) { let E = 0; for (let r = 0; r < m; r++) for (let q = 0; q < n; q++) { const s = (c >> (r * n + q) & 1) ? 1 : -1, sr = (c >> (r * n + (q + 1) % n) & 1) ? 1 : -1, sd = (c >> (((r + 1) % m) * n + q) & 1) ? 1 : -1; E -= s * (sr + sd); } ws.push(-K * E); if (-K * E > mx) mx = -K * E; }
    let s = 0; for (const w of ws) s += Math.exp(w - mx); return mx + Math.log(s);
  }
  let kb = 0; for (const [m, n] of [[4, 4], [2, 8], [8, 2]]) for (const T of [1.5, I.Tc, 3.0]) kb = Math.max(kb, Math.abs(I.kaufmanLogZ(1 / T, m, n) - brute(1 / T, m, n)));
  ok(kb < 1e-10, "Kaufman 有限环面 ln Z 与暴力枚举一致", kb.toExponential(2));
  // 与项目 35（ising_exact.py）的有限 L 精确能量对照
  [[8, 1.5, -1.9511154236673267], [16, 2.0, -1.7455305984537262], [16, I.Tc, -1.4530647006705255], [16, 2.5, -1.131318140433768], [16, 3.0, -0.8176893965361476]].forEach(([L, T, e]) => near(I.kaufmanEnergy(T, L).e, e, 1e-8, "Kaufman 能量 L=" + L + " T=" + T.toFixed(3)));
  near(I.kaufmanEnergy(2.0, 256).e, I.onsagerEnergy(2.0), 1e-6, "L = 256 时 Kaufman → Onsager");
}

section("伊辛：采样器与数据");
{
  const I = QL.mlimage;
  function chainStats(S, C, P) { const cm = []; for (let c = 0; c < C; c++) { let s = 0; for (let q = 0; q < P; q++) s += S.e[c * P + q]; cm.push(s / P); } const m = cm.reduce((a, b) => a + b) / C, sd = Math.sqrt(cm.reduce((a, b) => a + (b - m) * (b - m), 0) / (C - 1)); return { mean: m, se: sd / Math.sqrt(C) }; }
  for (const [T, samp] of [[2.0, "sw"], [I.Tc, "sw"], [3.0, "sw"], [I.Tc, "wolff"], [2.0, "wolff"]]) {
    const C = 40, P = 25, S = I.isingSample(16, T, { chains: C, perChain: P, therm: 100, gap: 3, sampler: samp }, new RNG(2026, 35, T * 1000 | 0)), st = chainStats(S, C, P), ex = I.kaufmanEnergy(T, 16).e, z = (st.mean - ex) / st.se;
    ok(Math.abs(z) < 4, "L=16 T=" + T.toFixed(3) + "（" + samp + "）：能量与 Kaufman 精确值相差 < 4σ", "MC " + st.mean.toFixed(4) + " ± " + st.se.toFixed(4) + "，精确 " + ex.toFixed(4) + "，z = " + z.toFixed(2));
  }
  const D = gen("ising", {}, 3), M = D.meta, L = 16, N = L * L;
  let lo = 0, nlo = 0, hi = 0, nhi = 0;
  for (let i = 0; i < D.n; i++) { if (M.T[i] <= 1.6) { lo += Math.abs(M.m[i]); nlo++; } if (M.T[i] >= 3.2) { hi += Math.abs(M.m[i]); nhi++; } }
  ok(nlo > 0 && lo / nlo > 0.9, "⟨|m|⟩ 在 T ≤ 1.6 时 > 0.9", (lo / nlo).toFixed(3));
  ok(nhi > 0 && hi / nhi < 0.3, "⟨|m|⟩ 在 T ≥ 3.2 时 < 0.3", (hi / nhi).toFixed(3));
  let em = 0; for (let i = 0; i < D.n; i++) { let H = 0, M2 = 0; for (let r = 0; r < L; r++) for (let c = 0; c < L; c++) { const s = D.X[i * N + r * L + c]; M2 += s; H -= s * (D.X[i * N + r * L + (c + 1) % L] + D.X[i * N + ((r + 1) % L) * L + c]); } em = Math.max(em, Math.abs(H / N - M.e[i]), Math.abs(M2 / N - M.m[i])); }
  ok(em < 1e-12, "meta.e、meta.m 与构型一致");
  ok(Array.from(D.X).every(v => v === 1 || v === -1), "自旋都是 ±1");
  const frac = D.y.reduce((a, b) => a + b, 0) / D.n; ok(frac > 0.35 && frac < 0.65, "有序 / 无序大致平衡", frac.toFixed(3));
  ok(Array.from(D.y).every((v, i) => v === (M.T[i] < M.Tc ? 1 : 0)), "标签 = 1[T < T_c]");
  ok(M.temps.length === 20 && M.temps.every(T => Math.abs(T - M.Tc) > 1e-4) && M.temps.filter(T => Math.abs(T / M.Tc - 1) <= 0.13).length >= 10, "温度网格：20 个点，一半在 T_c(1±0.13) 内，不含 T_c");
  const gT = {}, gc = {}; let mixed = false; for (let i = 0; i < D.n; i++) { const g = D.groups[i]; if (gT[g] === undefined) gT[g] = M.T[i]; else if (gT[g] !== M.T[i]) mixed = true; gc[g] = (gc[g] || 0) + 1; }
  ok(!mixed && Object.keys(gc).length === 200 && Object.values(gc).every(c => c === 3), "groups = 链编号：200 条链，每条 3 个样本、温度相同");
  const F = gen("ising", { protocol: "far" }, 3), sp = F.splitIdx, Tf = F.meta.T;
  ok(Array.from(sp.train).concat(Array.from(sp.valid)).every(i => Tf[i] <= 1.6 || Tf[i] >= 3.0) && Array.from(sp.test).every(i => Tf[i] > 1.6 && Tf[i] < 3.0), "“远离 T_c”方案：训练、验证只在 T ≤ 1.6 或 T ≥ 3.0，测试只在中间", sp.train.length + "/" + sp.valid.length + "/" + sp.test.length);
  const gTr = new Set(Array.from(sp.train).map(i => F.groups[i])); ok(Array.from(sp.valid).every(i => !gTr.has(F.groups[i])), "“远离”方案也按链划分");
  for (const s of ["wolff", "metro"]) { const t0 = Date.now(), E = gen("ising", { sampler: s, L: "8", nT: 6, perT: 10 }, 1); ok(E.n === 60 && Date.now() - t0 < 2000, "采样器 " + s + " 能跑"); }
  const t24 = Date.now(); gen("ising", { L: "24" }, 1); const ms24 = Date.now() - t24; ok(ms24 < 5000, "L = 24 默认其余参数用时", ms24 + " ms");
  // oracle：后验只依赖能量，关于能量单调；在数据上准确率高
  const O = R.get("ising").oracle(clean(R.get("ising"), {}));
  let acc = 0, mono = true; const pts = [];
  for (let i = 0; i < D.n; i++) { const x = D.X.subarray(i * N, (i + 1) * N), pr = O.predict(x); if (Math.abs(pr[0] + pr[1] - 1) > 1e-12) mono = false; pts.push([M.e[i], pr[1]]); acc += (pr[1] > 0.5 ? 1 : 0) === D.y[i] ? 1 : 0; }
  pts.sort((a, b) => a[0] - b[0]); for (let i = 1; i < pts.length; i++) if (pts[i][1] > pts[i - 1][1] + 1e-12 && pts[i][0] > pts[i - 1][0]) mono = false;
  ok(mono, "oracle：P(有序) 是能量的单调递减函数（能量是充分统计量）");
  ok(acc / D.n > 0.85, "oracle 在数据上的准确率", (acc / D.n).toFixed(3));
  const bz = R.get("ising").bayes({}); ok(bz.metric === "acc" && bz.value === null && bz.note.length > 10, "bayes：没有闭式，只给说明");
}

section("手写数字");
{
  const D = gen("digits", { scale: "raw" }), U = gen("digits", {});
  ok(D.n === 1797 && D.d === 64 && D.shape[0] === 8 && D.shape[1] === 8 && D.classes.length === 10, "1797 张 8×8，10 类");
  ok(counts(D.y, 10).join() === "178,182,177,183,181,182,181,179,174,180", "每类样本数与 scikit-learn 一致", counts(D.y, 10).join());
  ok(Array.from(D.X.subarray(0, 64)).join() === "0,0,5,13,9,1,0,0,0,0,13,15,10,15,5,0,0,3,15,2,0,11,8,0,0,4,12,0,0,8,8,0,0,5,8,0,0,9,8,0,0,4,11,0,1,12,7,0,0,2,14,5,10,12,0,0,0,0,6,13,10,0,0,0" && D.y[0] === 0 && D.y[1] === 1 && D.y[2] === 2, "第一张图与原文件逐像素相同");
  let s = 0, mx = 0; for (const v of D.X) { s += v; mx = Math.max(mx, v); } ok(s === 561718 && mx === 16, "像素总和 561718、最大值 16");
  ok(Math.abs(U.X[2] - 5 / 16) < 1e-15 && Math.max.apply(null, Array.from(U.X)) === 1, "默认尺度：除以 16");
}

section("形状");
{
  const D = gen("shapes", {}), k = D.classes.length;
  ok(k === 4 && counts(D.y, k).every(c => c === 300), "4 类，各 300 张", counts(D.y, k).join());
  ok(Array.from(D.X).every(v => v >= 0 && v <= 1), "灰度在 [0, 1]");
  const Z = gen("shapes", { noise: 0, k: 6, n: 600 }); let m = Infinity, M = -Infinity; for (let i = 0; i < Z.n; i++) { let s = 0; for (let j = 0; j < 256; j++) s += Z.X[i * 256 + j]; m = Math.min(m, s); M = Math.max(M, s); }
  ok(Z.classes.length === 6 && m > 3, "无噪声时每张图都画出了东西", "最小总亮度 " + m.toFixed(1));
  const O = gen("shapes", { ood: true }), sp = O.splitIdx, dx = O.meta.dx, dy = O.meta.dy;
  ok(Array.from(sp.train).concat(Array.from(sp.valid)).every(i => Math.abs(dx[i]) <= 1 && Math.abs(dy[i]) <= 1) && Array.from(sp.test).every(i => Math.max(Math.abs(dx[i]), Math.abs(dy[i])) >= 2), "“测试集换位置”：训练 / 验证中心在 [−1,1]²，测试中心离正中 ≥ 2");
}

section("逾渗");
{
  const I = QL.mlimage, L = 16, N = L * L;
  const col = new Float64Array(N); for (let r = 0; r < L; r++) col[r * L + 5] = 1; ok(I.spans(col, L), "整列开放：连通");
  const cut = col.slice(); cut[8 * L + 5] = 0; ok(!I.spans(cut, L), "断开一格：不连通");
  const zig = new Float64Array(N); for (let r = 0; r <= 7; r++) zig[r * L + 3] = 1; for (let c = 3; c <= 9; c++) zig[7 * L + c] = 1; for (let r = 7; r < L; r++) zig[r * L + 9] = 1; ok(I.spans(zig, L), "拐弯的路径：连通");
  const zig2 = zig.slice(); zig2[7 * L + 6] = 0; ok(!I.spans(zig2, L), "拐弯处断开：不连通");
  const diag = new Float64Array(N); for (let r = 0; r < L; r++) diag[r * L + r] = 1; ok(!I.spans(diag, L), "对角线（只对角相邻）：不连通");
  const D = gen("percolation", {});
  ok(D.y.reduce((a, b) => a + b, 0) === D.n / 2, "类别平衡：恰好各一半");
  let agree = true; for (let i = 0; i < D.n; i++) if ((I.spans(D.X.subarray(i * N, (i + 1) * N), L) ? 1 : 0) !== D.y[i]) agree = false; ok(agree, "标签 = 广度优先搜索的结果");
  ok(Array.from(D.meta.p).every(p => Math.abs(p - I.pcSite) <= 0.08 + 1e-12), "p 都在 [p_c − w, p_c + w] 里");
  const O = R.get("percolation").oracle(clean(R.get("percolation"), {})); let oa = 0; for (let i = 0; i < D.n; i++) oa += O.predict(D.X.subarray(i * N, (i + 1) * N))[D.y[i]]; ok(oa === D.n, "oracle 准确率 = 1");
  // 文档里"剪切—交换"命题：r×r 窗口（零填充，近边界的位置单独记）的多重集相同，但一个连通、一个不连通
  for (const rho of [1, 2]) {
    const a = 2 * rho, b = 4 * rho + 1, h1 = 1, h2 = 4 * rho + 1, S1 = new Float64Array(N), S2 = new Float64Array(N);
    for (let r = 0; r < L; r++) { S1[r * L + a] = 1; if (r >= h1 && r <= h2) S1[r * L + b] = 1; if (r <= h2) S2[r * L + a] = 1; if (r >= h1) S2[r * L + b] = 1; }
    const ms = S => { const c = {}; for (let r = 0; r < L; r++) for (let q = 0; q < L; q++) { let k = ""; for (let i = -rho; i <= rho; i++) for (let j = -rho; j <= rho; j++) { const rr = r + i, qq = q + j; k += rr >= 0 && rr < L && qq >= 0 && qq < L ? S[rr * L + qq] : 0; } k += "|" + (r < rho ? "T" + r : "") + (r > L - 1 - rho ? "B" + (L - 1 - r) : "") + (q < rho ? "L" + q : "") + (q > L - 1 - rho ? "R" + (L - 1 - q) : ""); c[k] = (c[k] || 0) + 1; } return c; };
    const A = ms(S1), B = ms(S2), same = Object.keys(A).length === Object.keys(B).length && Object.keys(A).every(k => A[k] === B[k]);
    ok(I.spans(S1, L) && !I.spans(S2, L) && same, "剪切—交换（r = " + (2 * rho + 1) + "，L = 16）：一个连通一个不连通，窗口多重集相同");
    const S3 = S1.slice(); S3[10 * L + 12] = 1; const C3 = ms(S3); ok(Object.keys(C3).some(k => C3[k] !== A[k]), "对照：多开一个格点，多重集就变了（检查本身有效）");
  }
}

section("有限群：乘法表与不可约表示");
{
  const specs = [["S3"], ["S4"], ["S5"], ["A4"], ["A5"], ["Q8"], ["C", 2], ["C", 7], ["C", 12], ["D", 3], ["D", 6], ["D", 7], ["D", 8]];
  for (const [name, n] of specs) {
    const G = QL.mltoy.makeGroup(name, n), N = G.order, T = G.table, e = G.identity, lab = G.name;
    let assoc = true; for (let a = 0; a < N && assoc; a++) for (let b = 0; b < N; b++) { const ab = T[a * N + b]; for (let c = 0; c < N; c++) if (T[ab * N + c] !== T[a * N + T[b * N + c]]) { assoc = false; break; } }
    let idok = true, invok = true; for (let a = 0; a < N; a++) { if (T[e * N + a] !== a || T[a * N + e] !== a) idok = false; if (T[a * N + G.inverse[a]] !== e || T[G.inverse[a] * N + a] !== e) invok = false; }
    let latin = true; for (let a = 0; a < N; a++) { const row = new Set(), cl = new Set(); for (let b = 0; b < N; b++) { row.add(T[a * N + b]); cl.add(T[b * N + a]); } if (row.size !== N || cl.size !== N) latin = false; }
    ok(assoc && idok && invok && latin, lab + "：结合律、单位元、逆元、拉丁方", "阶 " + N);
    let hom = 0, orth = 0, cls = 0, sq = 0, fs = 0, chiOrth = 0, ncomplex = 0;
    const irs = G.irreps;
    irs.forEach(ir => {
      const d = ir.dim, Mt = ir.matrices;
      for (let a = 0; a < N; a++) {
        for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { let s = 0; for (let k = 0; k < d; k++) s += Mt[(a * d + i) * d + k] * Mt[(a * d + j) * d + k]; orth = Math.max(orth, Math.abs(s - (i === j ? 1 : 0))); }
        for (let b = 0; b < N; b++) { const ab = T[a * N + b]; for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { let s = 0; for (let k = 0; k < d; k++) s += Mt[(a * d + i) * d + k] * Mt[(b * d + k) * d + j]; hom = Math.max(hom, Math.abs(s - Mt[(ab * d + i) * d + j])); } }
      }
      G.classes.forEach(C => C.forEach(g => { cls = Math.max(cls, Math.abs(ir.chi[g] - ir.chi[C[0]])); }));
      let ind = 0; for (let g = 0; g < N; g++) ind += ir.chi[T[g * N + g]]; ind /= N;
      fs = Math.max(fs, Math.abs(ind - (ir.type === "real" ? 1 : ir.type === "complex" ? 0 : -2)), Math.abs(ir.frobSchur - (ir.type === "real" ? 1 : ir.type === "complex" ? 0 : -1)));
      sq += d * d / ir.frob; ncomplex += ir.type === "complex" ? 2 : 1;
    });
    for (let p = 0; p < irs.length; p++) for (let q = 0; q < irs.length; q++) { let s = 0; for (let g = 0; g < N; g++) s += irs[p].chi[g] * irs[q].chi[g]; chiOrth = Math.max(chiOrth, Math.abs(s / N - (p === q ? irs[p].frob : 0))); }
    ok(hom < 1e-9, lab + "：每个表示都是同态 ρ(ab) = ρ(a)ρ(b)", hom.toExponential(1));
    ok(orth < 1e-9, lab + "：矩阵正交", orth.toExponential(1));
    ok(chiOrth < 1e-9, lab + "：特征标正交 ⟨χ_ρ, χ_σ⟩ = δ·frob（Schur）", chiOrth.toExponential(1));
    ok(Math.abs(sq - N) < 1e-9, lab + "：Σ d²/frob = |G|", sq + " = " + N);
    ok(cls < 1e-9 && ncomplex === G.classes.length, lab + "：特征标是类函数，复不可约表示个数 = 共轭类个数", ncomplex + " 个，" + G.classes.length + " 类");
    ok(fs < 1e-9, lab + "：Frobenius–Schur 指标与类型一致", irs.map(r => r.name + ":" + r.type[0]).join(" "));
  }
  const A4 = QL.mltoy.makeGroup("A4"), A5 = QL.mltoy.makeGroup("A5"), Q8 = QL.mltoy.makeGroup("Q8");
  ok(A4.irreps.map(r => r.dim + r.type[0]).join() === "1r,3r,2c", "A4：1、3、以及 (2,2) 的复型实形式");
  ok(A5.irreps.map(r => r.dim).join() === "1,4,5,3,3", "A5：1、4、5、3、3（(3,1,1) 分裂成两个实表示）");
  ok(Q8.irreps.map(r => r.dim + r.type[0]).join() === "1r,1r,1r,1r,4q", "Q8：四个一维 + 一个四元数型");
  const S4 = QL.mltoy.makeGroup("S4"); ok(S4.labels[0] === "e" && S4.labels.indexOf("(12)") >= 0 && S4.labels.indexOf("(1234)") >= 0 && S4.classes.map(c => c.length).sort((a, b) => a - b).join() === "1,3,6,6,8", "S4：轮换记号、共轭类大小 1,3,6,6,8");
  const D5 = QL.mltoy.makeGroup("D", 5); ok(D5.labels.join(" ") === "e r r^2 r^3 r^4 s rs r^2s r^3s r^4s" && !D5.abelian, "D5：元素名 r^j s^e");
  const Dg = gen("group", { G: "S3" }), Gm = Dg.meta; ok(Dg.n === 36 && Gm.order === 6 && Array.from(Dg.y).every((v, i) => v === Gm.table[i]) && Dg.tokens.vocab === 6, "group 数据：标签 = 乘法表");
  const ms = Gm.split; ok(Array.from(Dg.splitIdx.valid).every(i => ms[i] === 1) && Array.from(Dg.splitIdx.test).every(i => ms[i] === 2) && Array.from(Dg.splitIdx.train).every(i => ms[i] === 0), "meta.split 与 splitIdx 一致");
  const Do = R.get("group").oracle(clean(R.get("group"), { G: "A5" })), DA = gen("group", { G: "A5" }); let oa = 0; for (let i = 0; i < DA.n; i++) oa += Do.predict([DA.X[2 * i], DA.X[2 * i + 1]])[DA.y[i]]; ok(oa === DA.n, "group oracle 准确率 = 1（A5）");
}

section("模 p 运算");
{
  const D = gen("modadd", {}), M = D.meta, p = M.p;
  ok(p === 31 && D.n === 961 && D.classes.length === 31 && Array.from(D.y).every((v, i) => v === (D.X[2 * i] + D.X[2 * i + 1]) % p), "加法：961 对，标签 = (a+b) mod 31");
  ok(D.splitIdx.train.length === Math.round(0.6 * 961) && Math.abs(D.splitIdx.valid.length - D.splitIdx.test.length) <= 1, "训练比例 0.6，其余对半", D.splitIdx.train.length + "/" + D.splitIdx.valid.length + "/" + D.splitIdx.test.length);
  const S = gen("modadd", { op: "sub", p: 23 }); ok(Array.from(S.y).every((v, i) => v === ((S.X[2 * i] - S.X[2 * i + 1]) % 23 + 23) % 23) && S.meta.law[5 * 23 + 7] === 12, "减法：标签 = (a−b) mod 23，law 仍是加法");
  const X = gen("modadd", { op: "mul", p: 29 }), XM = X.meta, m = 28;
  ok(X.n === m * m && X.classes[0] === "1" && X.classes[27] === "28" && Array.from(X.y).every((v, i) => v + 1 === ((X.X[2 * i] + 1) * (X.X[2 * i + 1] + 1)) % 29), "乘法：去掉 0，标签 = ab mod 29");
  let iso = true; for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) if (XM.dlog[XM.table[a * m + b]] !== (XM.dlog[a] + XM.dlog[b]) % m) iso = false;
  ok(iso && new Set(Array.from(XM.dlog)).size === m, "离散对数是同构 (Z/29)^× → Z/28", "原根 g = " + XM.g);
  for (const q of [5, 7, 23, 31, 97, 113]) { const g = QL.mltoy.primitiveRoot(q); let x = 1, ord = 0; do { x = x * g % q; ord++; } while (x !== 1); ok(ord === q - 1, "原根 mod " + q + " 的阶是 p − 1", "g = " + g); }
  const O = R.get("modadd").oracle(clean(R.get("modadd"), {})); ok(O.predict([3, 30])[2] === 1, "oracle：3 + 30 ≡ 2");
}

section("分析工具：傅里叶谱");
{
  const T = QL.mltoy;
  for (const [p, k] of [[31, 1], [31, 7], [23, 11], [113, 40]]) {
    const E = []; for (let a = 0; a < p; a++) E.push([Math.cos(2 * Math.PI * k * a / p), Math.sin(2 * Math.PI * k * a / p)]);
    const f = T.fourier(E, p); near(f.energy[k - 1], 1, 1e-10, "E[a] = (cos 2πka/p, sin 2πka/p)：能量全在 k = " + k + "（p = " + p + "）"); ok(f.top[0] === k && Math.abs(f.topShare[0] - 1) < 1e-10, "  最大频率是 " + k);
  }
  const p = 31, E2 = { rows: p, cols: 5, data: new Float32Array(p * 5) };
  for (let a = 0; a < p; a++) { E2.data[a * 5] = 3 * Math.cos(2 * Math.PI * 4 * a / p); E2.data[a * 5 + 1] = 3 * Math.sin(2 * Math.PI * 4 * a / p); E2.data[a * 5 + 2] = Math.cos(2 * Math.PI * 9 * a / p + 1); E2.data[a * 5 + 3] = 7; E2.data[a * 5 + 4] = -2; }
  const f2 = T.fourier(E2, p); near(f2.energy[3], 9 / 9.5, 1e-9, "两个频率按能量分配：k = 4 占 9/9.5"); near(f2.energy[8], 0.5 / 9.5, 1e-9, "  k = 9 占 0.5/9.5（常数列被中心化去掉）");
  let s = 0; for (const v of f2.energy) s += v; near(s, 1, 1e-12, "  各频率占比之和 = 1");
  const rr = new RNG(5, 5, 5), Er = []; for (let a = 0; a < p; a++) { const row = []; for (let j = 0; j < 400; j++) row.push(rr.normal()); Er.push(row); }
  const fr = T.fourier(Er, p); ok(Math.max.apply(null, Array.from(fr.energy)) < 0.1 && Math.abs(fr.uniform - 2 / (p - 1)) < 1e-12, "随机嵌入：每个频率约 2/(p−1)", Math.max.apply(null, Array.from(fr.energy)).toFixed(3));
  const X = gen("modadd", { op: "mul", p: 29 }), XM = X.meta, Em = []; for (let t = 0; t < 28; t++) Em.push([Math.cos(2 * Math.PI * 3 * XM.dlog[t] / 28), Math.sin(2 * Math.PI * 3 * XM.dlog[t] / 28), 0]);
  ok(Math.abs(T.fourier(Em, XM).energy[2] - 1) < 1e-10, "fourier(E, meta) 等同 fourierFor"); let thrown = ""; try { T.fourier(Em, 29); } catch (e) { thrown = e.message; } ok(/少于/.test(thrown), "行数不够时给出说得清的错误", thrown);
  const fm = T.fourierFor(Em, XM); near(fm.energy[2], 1, 1e-10, "乘法：按离散对数重排后能量全在 k = 3（Z/28）");
  const fa = T.fourierFor(Array.from({ length: 31 }, (_, a) => [Math.cos(2 * Math.PI * 5 * a / 31), Math.sin(2 * Math.PI * 5 * a / 31)]), gen("modadd", {}).meta); near(fa.energy[4], 1, 1e-10, "fourierFor 对加法用 Z/p");
}

section("分析工具：按不可约表示分解、距离的群不变性");
{
  const T = QL.mltoy, rr = new RNG(9, 9, 9);
  function pureEmbedding(G, ir, D, side) {   // E(g) = W · vec(ρ(g))（或 ρ(g)ᵀ）：行落在 V_ρ 里
    const d = ir.dim, W = []; for (let q = 0; q < d * d; q++) { const w = []; for (let j = 0; j < D; j++) w.push(rr.normal()); W.push(w); }
    const E = []; for (let g = 0; g < G.order; g++) { const row = new Array(D).fill(0); for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { const v = side === "T" ? ir.matrices[(g * d + j) * d + i] : ir.matrices[(g * d + i) * d + j]; for (let c = 0; c < D; c++) row[c] += v * W[i * d + j][c]; } E.push(row); }
    return E;
  }
  for (const [name, n] of [["S4"], ["A4"], ["A5"], ["Q8"], ["D", 6], ["C", 9]]) {
    const G = T.makeGroup(name, n), meta = { order: G.order, irreps: G.irreps, table: G.table, inverse: G.inverse };
    let worst = 0, names = [];
    G.irreps.forEach((ir, q) => {
      if (ir.dim === 1 && ir.chi.every(v => v === 1)) return;
      const r = T.irrepFVE(pureEmbedding(G, ir, 16), meta); worst = Math.max(worst, Math.abs(r.fve[q] - 1)); names.push(ir.name);
    });
    ok(worst < 1e-9, G.name + "：纯 ρ 嵌入在 ρ 分量上的占比 = 1", names.join(" "));
    const r0 = T.irrepFVE(pureEmbedding(G, G.irreps[G.irreps.length - 1], 8), meta); let sum = 0; for (const v of r0.fve) sum += v; near(sum, 1, 1e-9, G.name + "：各分量占比之和 = 1");
    let dsum = 0; for (const v of r0.dims) dsum += v; ok(dsum === G.order && r0.baseline.reduce((a, b) => a + b, 0) > 1 - 1e-9, G.name + "：Σ dim V_ρ = |G|，基线之和 = 1");
    const Er = []; for (let g = 0; g < G.order; g++) { const row = []; for (let j = 0; j < 3000; j++) row.push(rr.normal()); Er.push(row); }
    const rnd = T.irrepFVE(Er, meta); let dev = 0; rnd.fve.forEach((v, q) => { dev = Math.max(dev, Math.abs(v - rnd.baseline[q])); });
    ok(dev < 0.03, G.name + "：随机嵌入 ≈ 基线 dim V_ρ/(|G|−1)", "最大偏差 " + dev.toFixed(4));
  }
  const S4 = T.makeGroup("S4"), meta = { order: 24, table: S4.table, inverse: S4.inverse }, st = S4.irreps[1];   // (3,1)
  const v = [0.3, -1.1, 0.7], EL = [], ER = [];
  for (let g = 0; g < 24; g++) { const a = [], b = []; for (let i = 0; i < 3; i++) { let s = 0, t = 0; for (let j = 0; j < 3; j++) { s += st.matrices[(g * 3 + i) * 3 + j] * v[j]; t += st.matrices[(g * 3 + j) * 3 + i] * v[j]; } a.push(s); b.push(t); } EL.push(a); ER.push(b); }
  const iL = T.invarianceR2(EL, meta), iR = T.invarianceR2(ER, meta);
  near(iL.left, 1, 1e-9, "E(a) = ρ(a)v：距离左不变，R²_左 = 1"); ok(iL.right < 0.9, "  右不变 R² 明显小于 1", iL.right.toFixed(3));
  near(iR.right, 1, 1e-9, "E(b) = ρ(b)ᵀu：距离右不变，R²_右 = 1"); ok(iL.nullLeft < 0.2 && iL.nullRight < 0.2, "  随机嵌入对照很小", iL.nullLeft.toFixed(3) + " / " + iL.nullRight.toFixed(3));
  const md = gen("modadd", { op: "sub" }).meta, Ec = []; for (let a = 0; a < 31; a++) Ec.push([Math.cos(2 * Math.PI * 2 * a / 31), Math.sin(2 * Math.PI * 2 * a / 31), Math.cos(2 * Math.PI * 5 * a / 31)]);
  const Ec2 = Ec.map((r, a) => [r[0], r[1], 2 * Math.cos(2 * Math.PI * 5 * a / 31), 2 * Math.sin(2 * Math.PI * 5 * a / 31)]);
  const ic2 = T.invarianceR2(Ec2, md); near(ic2.left, 1, 1e-9, "Z/31：两个频率的完整傅里叶嵌入，距离只依赖 b − a");
  const fmod = T.irrepFVE(Ec2, Object.assign({}, md)); near(fmod.fve[2] + fmod.fve[5], 1, 1e-9, "modadd 的 meta 也能做 irrepFVE（现场造 C_31 的表示）：rot2 + rot5 = 1");
}

section("伊辛交叉温度");
{
  const T = [], P = [], P2 = [];
  const grid = [1.5, 1.9, 2.1, 2.2, 2.25, 2.3, 2.4, 2.6, 3.0];
  grid.forEach(t => { for (let r = 0; r < 5; r++) { T.push(t); const v = t < 2.27 ? 1 : 0; P.push(v); P2.push(1 - v, v); } });
  const c = QL.mltoy.isingCrossover(P, T); near(c.Tstar, 2.275, 1e-12, "阶跃（2.25 → 2.3 之间）：线性插值给中点");
  const c2 = QL.mltoy.isingCrossover(P2, T); near(c2.Tstar, 2.275, 1e-12, "  输入 n×2 的类别概率也行");
  const Tl = [], Pl = []; [1, 1.5, 2, 2.5, 3, 3.5].forEach(t => { Tl.push(t, t); Pl.push(Math.min(1, Math.max(0, 1 - (t - 1.5) / 2)) + 0.1, Math.min(1, Math.max(0, 1 - (t - 1.5) / 2)) - 0.1); });
  near(QL.mltoy.isingCrossover(Pl, Tl).Tstar, 2.5, 1e-12, "线性下降的曲线：在 2.5 处穿过 1/2");
  near(QL.mlimage.crossover(P, T).Tstar, c.Tstar, 1e-15, "QL.mlimage.crossover 与 QL.mltoy.isingCrossover 一致");
  ok(isNaN(QL.mltoy.isingCrossover([1, 1, 1], [1, 2, 3]).Tstar), "从不穿过 1/2：返回 NaN");
}

section("稀疏奇偶、集合函数、师生回归");
{
  const D = gen("parity", {}), S = Array.from(D.meta.S);
  ok(S.length === 3 && Array.from(D.y).every((y, i) => y === (S.reduce((s, j) => s * D.X[i * 20 + j], 1) < 0 ? 1 : 0)), "标签 = 隐藏 3 个比特的异或（±1 编码时积为 −1）", "S = " + S.join(","));
  ok(Array.from(gen("parity", {}, 99).meta.S).join() === S.join(), "隐藏集合不随数据种子变（只由参数决定）");
  ok(new Set([1, 2, 3, 4, 5].map(q => Array.from(gen("parity", { sseed: q }).meta.S).join())).size >= 4, "换“隐藏集合的种子”就换集合");
  const frac = D.y.reduce((a, b) => a + b, 0) / D.n; ok(Math.abs(frac - 0.5) < 0.03, "两类大致平衡", frac.toFixed(3));
  let corr = 0; for (let j = 0; j < 20; j++) { let s = 0; for (let i = 0; i < D.n; i++) s += D.X[i * 20 + j] * (1 - 2 * D.y[i]); corr = Math.max(corr, Math.abs(s / D.n)); }
  ok(corr < 0.06, "每个单独的比特与标签几乎不相关", "最大 |相关| " + corr.toFixed(3));
  const Nz = gen("parity", { noise: 0.2, samples: 20000 }); let fl = 0; for (let i = 0; i < Nz.n; i++) fl += Nz.y[i] !== Nz.meta.clean[i] ? 1 : 0; near(fl / Nz.n, 0.2, 0.015, "标签翻转比例 ≈ η = 0.2");
  const Op = R.get("parity").oracle(clean(R.get("parity"), { noise: 0.2, samples: 20000 })); let oa = 0; for (let i = 0; i < Nz.n; i++) { const pr = Op.predict(Nz.X.subarray(i * 20, i * 20 + 20)); oa += pr[Nz.y[i]] > 0.5 ? 1 : 0; } near(oa / Nz.n, 0.8, 0.015, "oracle 准确率 ≈ 1 − η"); near(R.get("parity").bayes({ noise: 0.2 }).value, 0.8, 1e-12, "bayes = 1 − η");
  const B = gen("parity", { enc: "01" }); ok(Array.from(B.X).every(v => v === 0 || v === 1) && Array.from(B.y).every((y, i) => y === Array.from(B.meta.S).reduce((s, j) => s ^ B.X[i * 20 + j], 0)), "0/1 编码：标签 = 异或");

  const F = gen("setfn", {}), np = 5, rp = new RNG(3, 3, 3); let inv = 0, orc = 0; const Of = R.get("setfn").oracle(clean(R.get("setfn"), {}));
  for (const fn of ["pair", "max", "kth", "sum"]) {
    const G = gen("setfn", { fn: fn, samples: 300 });
    for (let i = 0; i < 50; i++) { const x = G.X.subarray(i * 10, i * 10 + 10), perm = [0, 1, 2, 3, 4]; for (let q = 4; q > 0; q--) { const j = rp.int(q + 1); [perm[q], perm[j]] = [perm[j], perm[q]]; } const y = new Float64Array(10); perm.forEach((s, t) => { y[2 * t] = x[2 * s]; y[2 * t + 1] = x[2 * s + 1]; }); inv = Math.max(inv, Math.abs(QL.mltoy.setValue(fn, y, np) - G.truth[i])); }
  }
  for (let i = 0; i < F.n; i++) orc = Math.max(orc, Math.abs(Of.predict(F.X.subarray(i * 10, i * 10 + 10)) - F.truth[i]));
  ok(inv < 1e-12, "四种集合函数都对点的排列不变"); ok(orc === 0 && F.d === 10 && F.featureNames[2] === "x2", "setfn：oracle = 真函数，d = 2n");
  let pr0 = 0; for (let i = 0; i < 200; i++) { let s = 0; for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { const dx = F.X[i * 10 + 2 * a] - F.X[i * 10 + 2 * b], dy = F.X[i * 10 + 2 * a + 1] - F.X[i * 10 + 2 * b + 1]; s += Math.exp(-(dx * dx + dy * dy) / 2); } pr0 = Math.max(pr0, Math.abs(s - F.truth[i])); } ok(pr0 < 1e-12, "成对势按定义计算");

  const Tt = gen("teacher", {}), T2 = gen("teacher", {}, 99), Ot = R.get("teacher").oracle(clean(R.get("teacher"), {}));
  ok(Tt.splitIdx.train.length === 100 && Tt.splitIdx.valid.length === 200 && Tt.splitIdx.test.length === 1000, "师生：训练 / 验证 / 测试 = 100 / 200 / 1000");
  ok(eqArr(Tt.meta.W, T2.meta.W) && !eqArr(Tt.X, T2.X), "老师的权重不随数据种子变，样本会变");
  let om = 0; for (let i = 0; i < Tt.n; i++) om = Math.max(om, Math.abs(Ot.predict(Tt.X.subarray(i * 20, i * 20 + 20)) - Tt.truth[i])); ok(om < 1e-12, "oracle = 老师网络");
  const Tn = gen("teacher", { nTrain: 4000, nTest: 20000 }); let r2 = 0; for (let i = 0; i < Tn.n; i++) r2 += (Tn.y[i] - Tn.truth[i]) ** 2; near(r2 / Tn.n, 0.09, 0.006, "残差方差 ≈ σ² = 0.09");
  near(R.get("teacher").bayes({ noise: 0.3 }).value, 0.09, 1e-12, "bayes：均方误差 σ²");
}

done();
