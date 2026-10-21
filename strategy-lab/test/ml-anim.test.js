// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 机器学习实验室 · 动画里的纯计算（src/ml/anim.js 的 QL_MLANIM）：
// 伊辛的 Metropolis / Wolff（细致平衡、能量的逐步记账、对穷举精确值的平稳分布、高低温的行为）、逾渗的并查集（对暴力广度优先搜索）、
// 优化器（凸二次型上收敛到已知的最小值）、最小范数的随机特征解（插值、等于伪逆解、范数最小）、多项式最小二乘（对直接解）、偏差—方差分解。
const { QL, ok, near, section, done } = require("./harness.js");
const M = require("../src/ml/anim.js");
const RNG = QL.RNG;
const t0 = Date.now();

/* ---------- 测试里自己写的"笨办法" ---------- */
// 自由边界、上下左右相邻：广度优先搜索数团簇、判断有没有一个团簇同时碰到第一行和最后一行
function bfsClusters(open, L) {
  const N = L * L, seen = new Uint8Array(N), sizes = []; let spans = false;
  for (let s = 0; s < N; s++) {
    if (!open[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1; let size = 0, top = false, bot = false;
    while (q.length) {
      const i = q.pop(), r = Math.floor(i / L), c = i % L; size++;
      if (r === 0) top = true; if (r === L - 1) bot = true;
      const nbs = []; if (c + 1 < L) nbs.push(i + 1); if (c > 0) nbs.push(i - 1); if (r + 1 < L) nbs.push(i + L); if (r > 0) nbs.push(i - L);
      for (const j of nbs) if (open[j] && !seen[j]) { seen[j] = 1; q.push(j); }
    }
    sizes.push(size); if (top && bot) spans = true;
  }
  return { K: sizes.length, sizes: sizes.sort((a, b) => a - b), spans };
}
// 带部分选主元的高斯消元（直接解，和 Cholesky 对照）
function gaussSolve(A, b, n) {
  const a = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A[i * n + j]).concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) { const f = a[r][c] / a[c][c]; for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = a[r][n]; for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k]; x[r] = s / a[r][r]; }
  return x;
}
function matvec(A, x, n, p) { const o = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < p; j++) s += A[i * p + j] * x[j]; o[i] = s; } return o; }
function norm(v) { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s); }
function maxAbsDiff(a, b) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; }
/** 批均值标准误：把相关的序列切成 B 段，段均值近似独立 */
function batchSE(xs, B) { const n = Math.floor(xs.length / B) * B, m = n / B, means = []; for (let b = 0; b < B; b++) { let s = 0; for (let i = b * m; i < (b + 1) * m; i++) s += xs[i]; means.push(s / m); } const mu = means.reduce((a, b) => a + b, 0) / B; let v = 0; for (const x of means) v += (x - mu) * (x - mu); return { mean: mu, se: Math.sqrt(v / (B - 1) / B) }; }

section("装载：纯函数，Node 里不需要 DOM");
{
  const names = ["isingLattice", "isingEnergy", "isingMag", "isingInit", "metroAccept", "metropolisSweep", "wolffStep", "yangM", "percLabel", "spanThreshold", "surface", "optInit", "optStep", "cholSolve", "svdThin", "minNormSolve", "ridgeSolve", "legendre", "polyFit", "polyEval", "biasVariance", "rfPool", "rfMatrix"];
  const miss = names.filter(n => typeof M[n] !== "function"); ok(!miss.length, "接口齐全", miss.join(","));
  near(M.TC, 2 / Math.log(1 + Math.SQRT2), 1e-15, "T_c = 2/ln(1+√2)"); near(M.TC, 2.269185314, 1e-8, "T_c ≈ 2.269185");
  ok(M.OPTIMIZERS.length === 5 && M.OPTIMIZERS.every(o => o.id && o.name), "五种优化器都有编号和名字");
}

section("伊辛：Metropolis 的细致平衡（精确核对）");
{
  // 单点核：π(x)P(x→y) = π(y)P(y→x)，对 ΔE ∈ {±4, ±8, 0} 与几个温度
  let worst = 0;
  for (const beta of [0.1, 0.3, 1 / M.TC, 0.8, 2]) for (const dE of [-8, -4, 0, 4, 8]) {
    // 记 E_x = 0、E_y = dE：π(x) ∝ 1，π(y) ∝ e^{−β dE}
    const lhs = 1 * M.metroAccept(dE, beta), rhs = Math.exp(-beta * dE) * M.metroAccept(-dE, beta);
    worst = Math.max(worst, Math.abs(lhs - rhs) / Math.max(lhs, rhs));
  }
  ok(worst < 1e-14, "单点翻转的接受率满足细致平衡", "最大相对误差 " + worst.toExponential(2));
  // 整个扫描（单点核按棋盘顺序复合）保持 π：在 2×2 环面（16 个状态）上把一次扫描的转移矩阵精确算出来，检验 πP = π
  const L = 2, lat = M.isingLattice(L), N = 4, S = 1 << N, beta = 0.6;
  const st = x => Int8Array.from({ length: N }, (_, i) => (x >> i) & 1 ? 1 : -1), idx = s => s.reduce((a, v, i) => a | (v > 0 ? 1 << i : 0), 0);
  const pi = new Float64Array(S); let Z = 0; for (let x = 0; x < S; x++) { pi[x] = Math.exp(-beta * M.isingEnergy(st(x), lat)); Z += pi[x]; } for (let x = 0; x < S; x++) pi[x] /= Z;
  // 单点核 K_i：以 metroAccept 的概率翻转 i
  function kernelSite(i) { const K = new Float64Array(S * S); for (let x = 0; x < S; x++) { const s = st(x), b = 4 * i, dE = 2 * s[i] * (s[lat.nb[b]] + s[lat.nb[b + 1]] + s[lat.nb[b + 2]] + s[lat.nb[b + 3]]), a = M.metroAccept(dE, beta), y = x ^ (1 << i); K[x * S + y] += a; K[x * S + x] += 1 - a; } return K; }
  function mul(A, B) { const C = new Float64Array(S * S); for (let i = 0; i < S; i++) for (let k = 0; k < S; k++) { const a = A[i * S + k]; if (a) for (let j = 0; j < S; j++) C[i * S + j] += a * B[k * S + j]; } return C; }
  let P = null, dbWorst = 0;
  for (const col of lat.colors) for (const i of col) { const K = kernelSite(i); for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) dbWorst = Math.max(dbWorst, Math.abs(pi[x] * K[x * S + y] - pi[y] * K[y * S + x])); P = P ? mul(P, K) : K; }
  let stat = 0, rows = 0; for (let y = 0; y < S; y++) { let s = 0; for (let x = 0; x < S; x++) s += pi[x] * P[x * S + y]; stat = Math.max(stat, Math.abs(s - pi[y])); } for (let x = 0; x < S; x++) { let s = 0; for (let y = 0; y < S; y++) s += P[x * S + y]; rows = Math.max(rows, Math.abs(s - 1)); }
  ok(dbWorst < 1e-15, "2×2 环面上每个单点核都满足细致平衡", dbWorst.toExponential(2));
  ok(stat < 1e-14 && rows < 1e-14, "一次棋盘扫描的转移矩阵保持 Gibbs 分布（πP = π），每行和为 1", "max|πP − π| = " + stat.toExponential(2));
  ok(idx(st(11)) === 11, "（自检）状态编号往返");
}

section("伊辛：能量与磁化的逐步记账");
{
  const rng = new RNG(5, 1, 1);
  for (const L of [4, 8, 16]) {
    const lat = M.isingLattice(L), s = M.isingInit(new Int8Array(L * L), "random", rng), st = { E: M.isingEnergy(s, lat), M: M.isingMag(s) };
    let bad = 0;
    for (let t = 0; t < 300; t++) {
      const T = [0.8, 1.5, M.TC, 3, 6][t % 5];
      if (t % 3 === 2) M.wolffStep(s, lat, 1 / T, rng, st); else M.metropolisSweep(s, lat, 1 / T, rng, st);
      if (st.E !== M.isingEnergy(s, lat) || st.M !== M.isingMag(s)) bad++;
    }
    ok(bad === 0, "L = " + L + "：逐次累加的 ΔE、ΔM 与重算的完全相等（Metropolis 和 Wolff 交替，300 步）", bad + " 次不等");
  }
  const lat = M.isingLattice(8), s = M.isingInit(new Int8Array(64), "up");
  ok(M.isingEnergy(s, lat) === -128 && M.isingMag(s) === 64, "全部朝上：E = −2N，M = N");
  const st = { E: -128, M: 64 }, acc = M.metropolisSweep(s, lat, 1 / 0.3, new RNG(1, 2, 3), st);
  ok(st.tries === 64 && st.acc === acc, "接受计数：tries 每扫加 N");
}

section("伊辛：长时间平均对穷举的精确值（4×4 环面，2^16 个状态）");
{
  const L = 4, N = 16, lat = M.isingLattice(L), s = new Int8Array(N);
  for (const T of [1.8, 2.5, 4.0]) {
    const beta = 1 / T; let Z = 0, Ee = 0, Em = 0;
    for (let x = 0; x < 1 << N; x++) { for (let i = 0; i < N; i++) s[i] = (x >> i) & 1 ? 1 : -1; const E = M.isingEnergy(s, lat), w = Math.exp(-beta * (E + 2 * N)); Z += w; Ee += w * E / N; Em += w * Math.abs(M.isingMag(s)) / N; }
    Ee /= Z; Em /= Z;
    for (const algo of ["metro", "wolff"]) {
      const rng = new RNG(2026, algo === "metro" ? 1 : 2, Math.round(T * 10)), st = { E: 0, M: 0 };
      M.isingInit(s, "random", rng); st.E = M.isingEnergy(s, lat); st.M = M.isingMag(s);
      for (let t = 0; t < 2000; t++) algo === "metro" ? M.metropolisSweep(s, lat, beta, rng, st) : M.wolffStep(s, lat, beta, rng, st);
      const es = [], ms = [];
      for (let t = 0; t < 120000; t++) { algo === "metro" ? M.metropolisSweep(s, lat, beta, rng, st) : M.wolffStep(s, lat, beta, rng, st); es.push(st.E / N); ms.push(Math.abs(st.M) / N); }
      const be = batchSE(es, 60), bm = batchSE(ms, 60);
      ok(Math.abs(be.mean - Ee) < 4 * be.se + 1e-4, (algo === "metro" ? "Metropolis" : "Wolff") + "，T = " + T + "：⟨e⟩ 与精确值一致", be.mean.toFixed(5) + " vs " + Ee.toFixed(5) + " ± " + be.se.toExponential(1));
      ok(Math.abs(bm.mean - Em) < 4 * bm.se + 1e-4, (algo === "metro" ? "Metropolis" : "Wolff") + "，T = " + T + "：⟨|m|⟩ 与精确值一致", bm.mean.toFixed(5) + " vs " + Em.toFixed(5) + " ± " + bm.se.toExponential(1));
    }
  }
}

section("伊辛：对 Kaufman 的有限环面精确能量（8×8，T = 2.5）");
{
  let mlimage = null;
  try { const Q = require("../src/core.js")({}); require("../src/ml/registry.js")(Q); require("../src/ml/data-image.js")(Q); mlimage = Q.mlimage; } catch (e) { mlimage = null; }
  if (!mlimage) ok(true, "（data-image.js 不可用，跳过）");
  else {
    const L = 8, N = 64, T = 2.5, lat = M.isingLattice(L), s = new Int8Array(N), rng = new RNG(9, 9, 9), st = {};
    M.isingInit(s, "random", rng); st.E = M.isingEnergy(s, lat); st.M = M.isingMag(s);
    for (let t = 0; t < 1000; t++) M.metropolisSweep(s, lat, 1 / T, rng, st);
    const es = []; for (let t = 0; t < 60000; t++) { M.metropolisSweep(s, lat, 1 / T, rng, st); es.push(st.E / N); }
    const be = batchSE(es, 60), ex = mlimage.kaufmanEnergy(T, L).e;
    ok(Math.abs(be.mean - ex) < 4 * be.se, "Metropolis 的 ⟨e⟩ 与 Kaufman 的精确值一致", be.mean.toFixed(5) + " vs " + ex.toFixed(5) + " ± " + be.se.toExponential(1));
    near(M.yangM(1.5), mlimage.yang(1.5), 1e-15, "Yang 的 M(T) 和 data-image.js 的一致");
  }
  ok(M.yangM(M.TC + 1e-9) === 0 && M.yangM(3) === 0 && M.yangM(1) > 0.999, "M(T) 在 T_c 以上为 0，低温趋于 1");
}

section("伊辛：低温有序、高温无序");
{
  // 从全部朝上出发，T = 1 远低于 T_c：|m| 一直接近 Yang 的 M(1) = 0.99928
  for (const algo of ["metro", "wolff"]) {
    const L = 16, N = 256, lat = M.isingLattice(L), s = M.isingInit(new Int8Array(N), "up"), rng = new RNG(3, 3, algo === "metro" ? 1 : 2), st = { E: M.isingEnergy(s, lat), M: N };
    let sum = 0, cnt = 0; for (let t = 0; t < 3000; t++) { algo === "metro" ? M.metropolisSweep(s, lat, 1, rng, st) : M.wolffStep(s, lat, 1, rng, st); if (t >= 500) { sum += Math.abs(st.M) / N; cnt++; } }
    ok(sum / cnt > 0.99, (algo === "metro" ? "Metropolis" : "Wolff") + "：T = 1 时 ⟨|m|⟩ > 0.99", (sum / cnt).toFixed(4));
  }
  // 从随机初态降到 T = 1.2（8×8）：大多数链会长成一个畴（偶尔卡在条纹态，所以看多数）
  let ordered = 0;
  for (let k = 0; k < 10; k++) { const L = 8, N = 64, lat = M.isingLattice(L), rng = new RNG(100 + k, 5, 5), s = M.isingInit(new Int8Array(N), "random", rng), st = { E: M.isingEnergy(s, lat), M: M.isingMag(s) }; for (let t = 0; t < 3000; t++) M.metropolisSweep(s, lat, 1 / 1.2, rng, st); if (Math.abs(st.M) / N > 0.9) ordered++; }
  ok(ordered >= 7, "随机初态、T = 1.2 的 Metropolis：至少 7/10 条链有序（|m| > 0.9）", ordered + "/10");
  // 高温 T = 10：|m| ~ N^{−1/2}，16×16 上远小于 0.2
  const L = 16, N = 256, lat = M.isingLattice(L), rng = new RNG(4, 4, 4), s = M.isingInit(new Int8Array(N), "up"), st = { E: M.isingEnergy(s, lat), M: N };
  let sum = 0, cnt = 0; for (let t = 0; t < 4000; t++) { M.metropolisSweep(s, lat, 0.1, rng, st); if (t >= 200) { sum += Math.abs(st.M) / N; cnt++; } }
  ok(sum / cnt < 0.12, "T = 10、从全部朝上出发：⟨|m|⟩ < 0.12（无序）", (sum / cnt).toFixed(4));
  ok(st.E / N > -0.35 && st.E / N < 0.1, "T = 10 时每格点能量接近 0（高温展开 e ≈ −2 tanh β ≈ −0.2）", (st.E / N).toFixed(3));
}

section("逾渗：并查集的团簇与连通 vs 暴力广度优先搜索");
{
  const rng = new RNG(77, 7, 7); let badK = 0, badSpan = 0, badSize = 0, badLab = 0, n = 0;
  for (const L of [1, 2, 3, 5, 8, 13, 20, 31]) for (let rep = 0; rep < 60; rep++) {
    const p = 0.3 + 0.5 * rng.u(), N = L * L, open = new Uint8Array(N); for (let i = 0; i < N; i++) open[i] = rng.u() < p ? 1 : 0;
    const R = M.percLabel(open, L), B = bfsClusters(open, L); n++;
    if (R.K !== B.K) badK++;
    if ((R.nSpan > 0) !== B.spans) badSpan++;
    if (JSON.stringify(Array.from(R.size).sort((a, b) => a - b)) !== JSON.stringify(B.sizes)) badSize++;
    // 标签一致性：相邻的开放格点同标签；关闭的为 −1；first[k] 是该团簇编号最小的格点
    for (let i = 0; i < N; i++) { if (!open[i] && R.label[i] !== -1) badLab++; if (open[i]) { const r = Math.floor(i / L), c = i % L; if (c + 1 < L && open[i + 1] && R.label[i + 1] !== R.label[i]) badLab++; if (r + 1 < L && open[i + L] && R.label[i + L] !== R.label[i]) badLab++; } }
    for (let k = 0; k < R.K; k++) { if (R.label[R.first[k]] !== k) badLab++; for (let i = 0; i < R.first[k]; i++) if (R.label[i] === k) badLab++; }
    if (R.spanId >= 0 && !R.spans[R.spanId]) badLab++;
  }
  ok(badK === 0, "团簇个数一致（" + n + " 张随机格子，L = 1 … 31）", badK + " 张不一致");
  ok(badSpan === 0, "上下连通的判断一致", badSpan + " 张不一致");
  ok(badSize === 0, "团簇大小的多重集一致", badSize + " 张不一致");
  ok(badLab === 0, "标签自洽（相邻开放格点同标签、first 是最小编号）", String(badLab));
  // 工作区复用：同一个 ws 反复用，结果不变
  const ws = {}, L = 12, open = new Uint8Array(L * L).map(() => rng.u() < 0.6 ? 1 : 0), a = M.percLabel(open, L, ws), b = M.percLabel(open, L, ws);
  ok(a.K === b.K && a.nSpan === b.nSpan, "复用工作区");
}

section("逾渗：Newman–Ziff 的临界值 p*（p > p* ⇔ 连通）");
{
  const rng = new RNG(31, 3, 1); let bad = 0, n = 0, badImg = 0; let mlimage = null;
  try { const Q = require("../src/core.js")({}); require("../src/ml/registry.js")(Q); require("../src/ml/data-image.js")(Q); mlimage = Q.mlimage; } catch (e) {}
  for (const L of [2, 4, 7, 16, 25]) for (let rep = 0; rep < 40; rep++) {
    const N = L * L, u = new Float64Array(N); for (let i = 0; i < N; i++) u[i] = rng.u();
    const thr = M.spanThreshold(u, L);
    for (let k = 0; k < 6; k++) {
      const p = rng.u(), open = new Uint8Array(N); for (let i = 0; i < N; i++) open[i] = u[i] < p ? 1 : 0;
      n++; if ((p > thr) !== bfsClusters(open, L).spans) bad++;
      if (mlimage && mlimage.spans(Float64Array.from(open), L) !== (p > thr)) badImg++;
    }
    // 恰好在 p* 处：比 p* 小一点不连通，大一点连通
    const below = new Uint8Array(N), above = new Uint8Array(N); for (let i = 0; i < N; i++) { below[i] = u[i] < thr ? 1 : 0; above[i] = u[i] <= thr ? 1 : 0; }
    if (bfsClusters(below, L).spans || !bfsClusters(above, L).spans) bad++;
  }
  ok(bad === 0, "p* 与暴力判断一致（" + n + " 个 (格子, p) 组合，以及 p* 两侧）", bad + " 处不一致");
  ok(!mlimage || badImg === 0, "与数据集里的 spans（data-image.js）一致", mlimage ? badImg + " 处不一致" : "跳过");
  // 大格子上 p* 集中在 p_c 附近：64×64 的 200 张格子，中位数离 p_c 不远
  const ths = []; for (let k = 0; k < 200; k++) { const L = 64, u = new Float64Array(L * L); for (let i = 0; i < L * L; i++) u[i] = rng.u(); ths.push(M.spanThreshold(u, L)); }
  ths.sort((a, b) => a - b); const med = ths[100];
  ok(Math.abs(med - M.PC) < 0.015, "64×64：p* 的中位数接近 p_c = 0.5927", med.toFixed(4));
}

section("优化器：凸二次型上收敛到已知的最小值");
{
  // f = ½ xᵀAx − bᵀx，A = [[3, 1], [1, 2]]，b = [1, −1]：x* = A⁻¹b，f* = −½ bᵀx*
  const A = [3, 1, 1, 2], bv = [1, -1], det = A[0] * A[3] - A[1] * A[2], xs = [(A[3] * bv[0] - A[1] * bv[1]) / det, (A[0] * bv[1] - A[2] * bv[0]) / det], fs = -0.5 * (bv[0] * xs[0] + bv[1] * xs[1]);
  const surf = { f: (x, y) => 0.5 * (A[0] * x * x + 2 * A[1] * x * y + A[3] * y * y) - bv[0] * x - bv[1] * y, grad: (x, y, g) => { g[0] = A[0] * x + A[1] * y - bv[0]; g[1] = A[2] * x + A[3] * y - bv[1]; return g; } };
  const cfg = { gd: { lr: 0.3, steps: 400, tol: 1e-10 }, momentum: { lr: 0.1, beta: 0.9, steps: 1500, tol: 1e-10 }, nesterov: { lr: 0.1, beta: 0.9, steps: 1500, tol: 1e-10 }, rmsprop: { lr: 0.003, rho: 0.99, steps: 6000, tol: 2e-2 }, adam: { lr: 0.003, steps: 6000, tol: 2e-2 } };
  for (const o of M.OPTIMIZERS) {
    const c = cfg[o.id], st = M.optInit(o.id, 2, 2), f0 = surf.f(2, 2) - fs; let mono = true, prev = f0;
    for (let t = 0; t < c.steps; t++) { M.optStep(st, surf, c); const f = surf.f(st.x, st.y) - fs; if (f > prev + 1e-15) mono = false; prev = f; }
    const dist = Math.hypot(st.x - xs[0], st.y - xs[1]), gap = surf.f(st.x, st.y) - fs;
    ok(dist < c.tol && gap < 1e-3 * f0, o.name + "：到最小值的距离 < " + c.tol + "，f − f* 降到起点的千分之一以下", "距离 " + dist.toExponential(2) + "，f − f* = " + gap.toExponential(2));
    if (o.id === "gd") ok(mono, "梯度下降（η < 2/λ_max）：损失单调下降");
  }
  // 学习率太大时梯度下降发散（η > 2/λ_max，λ_max = (5 + √5)/2 ≈ 3.618）
  const st = M.optInit("gd", 2, 2); for (let t = 0; t < 100; t++) M.optStep(st, surf, { lr: 0.6 }); ok(!(Math.abs(st.x) < 1e6), "η = 0.6 > 2/λ_max：梯度下降发散");
  // 内置的损失面：梯度对数值差分；最小值点处梯度为 0、函数值为 fmin
  for (const id of ["quad", "rosen", "saddle"]) {
    const s = M.surface(id, { kappa: 37 }), g = new Float64Array(2); let worst = 0;
    for (const [x, y] of [[0.3, -0.7], [-1.1, 1.4], [1.7, 0.2]]) { s.grad(x, y, g); const e = 1e-6, nx = (s.f(x + e, y) - s.f(x - e, y)) / (2 * e), ny = (s.f(x, y + e) - s.f(x, y - e)) / (2 * e); worst = Math.max(worst, Math.abs(nx - g[0]) / (1 + Math.abs(nx)), Math.abs(ny - g[1]) / (1 + Math.abs(ny))); }
    ok(worst < 1e-6, id + "：解析梯度 = 数值差分", worst.toExponential(2));
    ok(s.min.every(m => Math.abs(s.f(m[0], m[1]) - s.fmin) < 1e-15 && Math.hypot(...s.grad(m[0], m[1], g)) < 1e-12), id + "：最小值点处梯度为 0、函数值为 fmin");
    ok(s.xr[0] < s.start[0] && s.start[0] < s.xr[1] && s.yr[0] < s.start[1] && s.start[1] < s.yr[1], id + "：起点在画图范围里");
  }
  // 病态二次型的 Hessian 特征值是 1 和 1/κ
  const q = M.surface("quad", { kappa: 50 }), g = new Float64Array(2), H = []; for (const [dx, dy] of [[1, 0], [0, 1]]) { q.grad(dx, dy, g); H.push(g[0], g[1]); }
  const tr = H[0] + H[3], dt = H[0] * H[3] - H[1] * H[2], l1 = tr / 2 + Math.sqrt(tr * tr / 4 - dt), l2 = tr / 2 - Math.sqrt(tr * tr / 4 - dt);
  near(l1, 1, 1e-12, "病态二次型：λ_max = 1"); near(l2, 1 / 50, 1e-12, "病态二次型：λ_min = 1/κ");
}

section("线性代数：Cholesky、SVD");
{
  const rng = new RNG(8, 8, 8);
  // Cholesky 对高斯消元
  const m = 7, B = new Float64Array(m * m).map(() => rng.normal()), G = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += B[k * m + i] * B[k * m + j]; G[i * m + j] = s + (i === j ? 0.5 : 0); }
  const r = new Float64Array(m).map(() => rng.normal());
  ok(maxAbsDiff(M.cholSolve(G, m, r), gaussSolve(G, r, m)) < 1e-10, "Cholesky 解 = 高斯消元解");
  // SVD：A = U S Vᵀ，U、V 的列正交
  for (const [rr, cc] of [[9, 4], [5, 5], [30, 12]]) {
    const Amat = new Float64Array(rr * cc).map(() => rng.normal()), sv = M.svdThin(Amat, rr, cc); let rec = 0, ou = 0, ov = 0;
    for (let i = 0; i < rr; i++) for (let j = 0; j < cc; j++) { let s = 0; for (let k = 0; k < cc; k++) s += sv.U[k * rr + i] * sv.s[k] * sv.V[k * cc + j]; rec = Math.max(rec, Math.abs(s - Amat[i * cc + j])); }
    for (let a = 0; a < cc; a++) for (let b = 0; b < cc; b++) { let su = 0, sv2 = 0; for (let k = 0; k < rr; k++) su += sv.U[a * rr + k] * sv.U[b * rr + k]; for (let k = 0; k < cc; k++) sv2 += sv.V[a * cc + k] * sv.V[b * cc + k]; ou = Math.max(ou, Math.abs(su - (a === b ? 1 : 0))); ov = Math.max(ov, Math.abs(sv2 - (a === b ? 1 : 0))); }
    ok(rec < 1e-12 && ou < 1e-12 && ov < 1e-12, rr + "×" + cc + "：A = U S Vᵀ，UᵀU = VᵀV = I", "重构 " + rec.toExponential(1) + "，正交 " + Math.max(ou, ov).toExponential(1));
  }
  // 秩亏：两列相同时有一个奇异值为 0
  const D = new Float64Array(6 * 3); for (let i = 0; i < 6; i++) { D[i * 3] = rng.normal(); D[i * 3 + 1] = D[i * 3]; D[i * 3 + 2] = rng.normal(); }
  const sd = M.svdThin(D, 6, 3), smin = Math.min(...sd.s), smax = Math.max(...sd.s); ok(smin < 1e-12 * smax, "秩亏矩阵：最小奇异值 ≈ 0", (smin / smax).toExponential(2));
}

section("随机特征：最小范数解（p ≥ n 时插值，且等于伪逆解）");
{
  // x ∈ [−1, 1]³（一维的 ReLU 特征常常不满秩，见 anim.js 里 rfPool 的说明）
  const rng = new RNG(12, 1, 2), n = 25, d = 3, X = new Float64Array(n * d).map(() => 2 * rng.u() - 1), y = new Float64Array(n).map((_, i) => Math.sin(2.2 * X[i * d]) + 0.1 * rng.normal());
  const pool = M.rfPool(200, d, rng);
  ok(pool.W.length === 200 * d && pool.b.length === 200 && pool.d === d, "特征池的形状");
  for (const p of [26, 50, 100, 200]) {
    const Phi = M.rfMatrix(X, n, pool, p), a = M.minNormSolve(Phi, n, p, y), res = maxAbsDiff(matvec(Phi, a, n, p), y);
    ok(res < 1e-8, "p = " + p + " > n = " + n + "：Φa = y（插值）", "最大残差 " + res.toExponential(2));
    // 伪逆解 = Φᵀ(ΦΦᵀ)⁻¹y（Φ 行满秩时），用高斯消元直接解
    const GG = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < p; k++) s += Phi[i * p + k] * Phi[j * p + k]; GG[i * n + j] = s; }
    const z = gaussSolve(GG, y, n), aDirect = new Float64Array(p); for (let k = 0; k < p; k++) { let s = 0; for (let i = 0; i < n; i++) s += Phi[i * p + k] * z[i]; aDirect[k] = s; }
    const rel = maxAbsDiff(a, aDirect) / Math.max(...aDirect.map(Math.abs));
    ok(rel < 1e-6, "p = " + p + "：等于 Φᵀ(ΦΦᵀ)⁻¹y", "相对差 " + rel.toExponential(2));
    // 范数最小：加上零空间里的任意方向，插值不变、范数变大
    const v = new Float64Array(p).map(() => rng.normal()), Pv = M.minNormSolve(Phi, n, p, matvec(Phi, v, n, p)), nul = v.map((x, i) => x - Pv[i]);
    const a2 = a.map((x, i) => x + 0.3 * nul[i]);
    ok(maxAbsDiff(matvec(Phi, a2, n, p), y) < 1e-7 && norm(a2) > norm(a) * (1 + 1e-9), "p = " + p + "：零空间方向不改变插值、只让范数变大", norm(a).toFixed(3) + " < " + norm(a2).toFixed(3));
    // 岭回归 λ → 0⁺ 趋于最小范数解
    const ar = M.ridgeSolve(Phi, n, p, y, 1e-10), relR = maxAbsDiff(ar, a) / Math.max(...a.map(Math.abs));
    ok(relR < 1e-3, "p = " + p + "：岭回归 λ = 1e-10 ≈ 最小范数解", relR.toExponential(2));
  }
  for (const p of [5, 15, 25]) {
    const Phi = M.rfMatrix(X, n, pool, p), a = M.minNormSolve(Phi, n, p, y), GG = new Float64Array(p * p), rr = new Float64Array(p);
    for (let i = 0; i < p; i++) { for (let j = 0; j < p; j++) { let s = 0; for (let k = 0; k < n; k++) s += Phi[k * p + i] * Phi[k * p + j]; GG[i * p + j] = s; } let s = 0; for (let k = 0; k < n; k++) s += Phi[k * p + i] * y[k]; rr[i] = s; }
    const aLS = gaussSolve(GG, rr, p), rel = maxAbsDiff(a, aLS) / Math.max(...aLS.map(Math.abs));
    ok(rel < 1e-6, "p = " + p + " ≤ n：等于普通最小二乘（正规方程）的解", rel.toExponential(2));
    ok(maxAbsDiff(M.ridgeSolve(Phi, n, p, y, 0), aLS) / Math.max(...aLS.map(Math.abs)) < 1e-6, "p = " + p + "：岭回归 λ = 0 = 正规方程解");
  }
  // 秩亏的 Φ（p > n 但有两行相同）：没法插值，最小范数解仍是伪逆解——拟合值是 y 在列空间上的投影（两行相同的样本拟合成它们的平均）
  {
    const p = 40, Phi = M.rfMatrix(X, n, pool, p); for (let j = 0; j < p; j++) Phi[1 * p + j] = Phi[0 * p + j];
    const a = M.minNormSolve(Phi, n, p, y), fit = matvec(Phi, a, n, p), avg = (y[0] + y[1]) / 2;
    ok(Math.abs(fit[0] - avg) < 1e-8 && Math.abs(fit[1] - avg) < 1e-8 && maxAbsDiff(fit.subarray(2), y.subarray(2)) < 1e-8, "两行相同（秩亏）：那两个样本拟合成平均值，其余照样插值");
  }
  // 薄 QR：Q 列正交，A = QR，R 上三角
  {
    const r = 60, c = 12, Amat = new Float64Array(r * c).map(() => rng.normal()), qr = M.qrThin(Amat, r, c); let rec = 0, orth = 0, low = 0;
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { let s = 0; for (let k = 0; k <= j; k++) s += qr.Q[k * r + i] * qr.R[k * c + j]; rec = Math.max(rec, Math.abs(s - Amat[i * c + j])); }
    for (let a = 0; a < c; a++) for (let b = 0; b < c; b++) { let s = 0; for (let k = 0; k < r; k++) s += qr.Q[a * r + k] * qr.Q[b * r + k]; orth = Math.max(orth, Math.abs(s - (a === b ? 1 : 0))); if (a > b) low = Math.max(low, Math.abs(qr.R[a * c + b])); }
    ok(rec < 1e-12 && orth < 1e-13 && low === 0, "薄 QR：A = QR，QᵀQ = I，R 上三角", "重构 " + rec.toExponential(1) + "，正交 " + orth.toExponential(1));
  }
  // 特征缩放 1/√p 不影响最小范数解的预测
  const p = 60, Phi = M.rfMatrix(X, n, pool, p), Phi2 = Phi.map(v => v * 7.5), Xt = Float64Array.from([-0.9, 0.1, 0.3, -0.2, 0.5, -0.7, 0.33, 0, 0.8, 0.8, -0.8, 0.2]);
  const a1 = M.minNormSolve(Phi, n, p, y), a2 = M.minNormSolve(Phi2, n, p, y), Ft = M.rfMatrix(Xt, 4, pool, p), Ft2 = Ft.map(v => v * 7.5);
  ok(maxAbsDiff(matvec(Ft, a1, 4, p), matvec(Ft2, a2, 4, p)) < 1e-8, "特征整体乘一个常数，最小范数解的预测不变");
}

section("多项式最小二乘：勒让德基 vs 单项式的直接解");
{
  const rng = new RNG(21, 2, 1);
  // 勒让德多项式的几个闭式
  const P = M.legendre(0.37, 4); near(P[2], (3 * 0.37 ** 2 - 1) / 2, 1e-15, "P_2(x) = (3x² − 1)/2"); near(P[3], (5 * 0.37 ** 3 - 3 * 0.37) / 2, 1e-15, "P_3(x) = (5x³ − 3x)/2"); near(P[4], (35 * 0.37 ** 4 - 30 * 0.37 ** 2 + 3) / 8, 1e-15, "P_4");
  for (const deg of [0, 1, 3, 6]) {
    const n = 30, xs = new Float64Array(n).map(() => 2 * rng.u() - 1), ys = xs.map(x => Math.cos(2 * x) + 0.2 * rng.normal());
    const c = M.polyFit(xs, ys, n, deg, 0), m = deg + 1, V = new Float64Array(m * m), r = new Float64Array(m);
    for (let k = 0; k < n; k++) for (let i = 0; i < m; i++) { r[i] += xs[k] ** i * ys[k]; for (let j = 0; j < m; j++) V[i * m + j] += xs[k] ** (i + j); }
    const mono = gaussSolve(V, r, m); let worst = 0;
    for (const x of [-1, -0.5, 0, 0.42, 1]) { let a = 0; for (let i = 0; i < m; i++) a += mono[i] * x ** i; worst = Math.max(worst, Math.abs(a - M.polyEval(c, x))); }
    ok(worst < 1e-9, deg + " 次：拟合出的多项式与单项式正规方程的直接解相同", worst.toExponential(2));
  }
  // 无噪声的三次多项式被精确恢复；n = deg + 1 个点时恰好插值
  const f = x => 0.5 - x + 2 * x ** 3, xs = Float64Array.from([-0.9, -0.3, 0.1, 0.4, 0.7, 0.95]), c = M.polyFit(xs, xs.map(f), 6, 3, 0);
  ok([-1, -0.2, 0.6].every(x => Math.abs(M.polyEval(c, x) - f(x)) < 1e-12), "无噪声的三次多项式被精确恢复");
  const x4 = Float64Array.from([-0.8, -0.1, 0.5, 0.9]), y4 = Float64Array.from([1, -2, 0.5, 3]), c4 = M.polyFit(x4, y4, 4, 3, 0);
  ok(Array.from(x4).every((x, i) => Math.abs(M.polyEval(c4, x) - y4[i]) < 1e-10), "4 个点拟合 3 次：恰好插值");
  // 次数比点数还高时，小小的岭让方程组可解
  const c9 = M.polyFit(x4, y4, 4, 9, 1e-8); ok(Array.from(c9).every(isFinite) && Array.from(x4).every((x, i) => Math.abs(M.polyEval(c9, x) - y4[i]) < 1e-3), "9 次拟合 4 个点（加岭 1e-8）：有限且几乎插值");
}

section("偏差—方差分解：E[(ŷ − y)²] = 偏差² + 方差 + σ²");
{
  const rng = new RNG(4, 4, 2), R = 300, n = 20, J = 101, sigma = 0.3, f = x => Math.sin(Math.PI * x), xt = new Float64Array(J).map((_, j) => -1 + 2 * (j + 0.5) / J), ft = xt.map(f);
  for (const deg of [1, 3, 9]) {
    const preds = new Float64Array(R * J), buf = new Float64Array(deg + 1); let direct = 0;
    for (let r = 0; r < R; r++) {
      const xs = new Float64Array(n).map(() => 2 * rng.u() - 1), ys = xs.map(x => f(x) + sigma * rng.normal()), c = M.polyFit(xs, ys, n, deg, 1e-8);
      for (let j = 0; j < J; j++) { const v = M.polyEval(c, xt[j], buf); preds[r * J + j] = v; const yNew = ft[j] + sigma * rng.normal(); direct += (v - yNew) ** 2; }
    }
    direct /= R * J;
    const bv = M.biasVariance(preds, R, J, ft, sigma);
    near(bv.bias2 + bv.variance + bv.noise, bv.expected, 1e-12 * bv.expected, deg + " 次：偏差² + 方差 + σ² 恰好等于期望测试误差（代数恒等式）");
    ok(Math.abs(direct - bv.expected) < 0.06 * bv.expected, deg + " 次：用新抽的带噪声 y 直接算的测试误差 ≈ 分解之和", direct.toFixed(4) + " vs " + bv.expected.toFixed(4));
    if (deg === 1) ok(bv.bias2 > bv.variance, "1 次拟合 sin(πx)：偏差主导", bv.bias2.toFixed(3) + " > " + bv.variance.toFixed(3));
    if (deg === 9) ok(bv.variance > bv.bias2, "9 次拟合、n = 20：方差主导", bv.variance.toFixed(3) + " > " + bv.bias2.toFixed(4));
  }
}

console.log("\n（用时 " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒）");
done();
