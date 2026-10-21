// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 科研玩具数据集（family = "toy"）
 *   modadd   模 p 的加 / 减 / 乘（grokking 的经典任务）
 *   group    有限群的乘法表（C_n、D_n、S_3、S_4、S_5、A_4、A_5、Q_8），附全部实不可约表示的显式矩阵
 *   parity   稀疏奇偶：n 个比特里藏着 k 个，标签是它们的异或
 *   setfn    集合函数回归：n 个平面点的置换不变函数（项目 87）
 *   teacher  师生回归：随机两层 tanh 老师网络加噪声（双下降）
 * 另外装上 QL.mltoy：分析训练好的模型用的工具（傅里叶谱、按不可约表示的方差分解、距离的群不变性、伊辛交叉温度），
 * 页面和线程里都能用，输入是 inspect() 给出的嵌入。
 * 这个函数会被 toString() 拼进后台线程，所以只用参数 QL 和标准 JavaScript。
 * 群的约定（与项目 12 的 groups.py 相同）：置换 p 写成像的数组，乘法 (pq)(i) = p(q(i))，即先作用 q 再作用 p；
 * table[a·|G| + b] = ab 的编号，inverse[a] = a⁻¹ 的编号。表示矩阵按行展开：matrices[(g·d + i)·d + j] = ρ(g)_{ij}。 */
function QL_MLDATA_TOY(QL) {
"use strict";
var reg = QL.mlreg;
if (!reg || typeof reg.add !== "function") throw new Error("data-toy.js：请先安装 registry.js（QL.mlreg）。");

/* ---------- 小工具 ---------- */
function num(p, k, d) { var v = p && p[k]; if (v === undefined || v === null || v === "") return d; v = +v; return isFinite(v) ? v : d; }
function str(p, k, d) { var v = p && p[k]; return v === undefined || v === null || v === "" ? d : String(v); }
function clampI(v, lo, hi) { v = Math.round(v); return v < lo ? lo : v > hi ? hi : v; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = rng.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function isPrime(n) { if (n < 2) return false; for (var q = 2; q * q <= n; q++) if (n % q === 0) return false; return true; }
function powmod(a, e, m) { var r = 1; a %= m; while (e > 0) { if (e & 1) r = r * a % m; a = a * a % m; e >>= 1; } return r; }
/** 最小的原根 g：对 p−1 的每个素因子 q，g^{(p−1)/q} ≠ 1 */
function primitiveRoot(p) {
  var fac = [], m = p - 1, q;
  for (q = 2; q * q <= m; q++) if (m % q === 0) { fac.push(q); while (m % q === 0) m /= q; }
  if (m > 1) fac.push(m);
  for (var g = 2; g < p; g++) { var ok = true; for (var i = 0; i < fac.length && ok; i++) if (powmod(g, (p - 1) / fac[i], p) === 1) ok = false; if (ok) return g; }
  return 1;
}
/** 按 trainFrac 随机划分 n 个下标：训练集取 round(f·n) 个，剩下的对半分成验证集与测试集（各至少一个） */
function fracSplit(n, f, rng) {
  var idx = []; for (var i = 0; i < n; i++) idx.push(i); shuffle(idx, rng);
  var a = Math.max(1, Math.min(n - 2, Math.round(f * n))), b = a + Math.max(1, Math.floor((n - a) / 2));
  if (b >= n) b = n - 1;
  return { train: Int32Array.from(idx.slice(0, a)), valid: Int32Array.from(idx.slice(a, b)), test: Int32Array.from(idx.slice(b)) };
}
function oneHot(k, c) { var o = new Array(k); for (var i = 0; i < k; i++) o[i] = 0; o[c] = 1; return o; }
function splitMask(n, sp) { var m = new Uint8Array(n), i; for (i = 0; i < sp.valid.length; i++) m[sp.valid[i]] = 1; for (i = 0; i < sp.test.length; i++) m[sp.test[i]] = 2; return m; }

/* ================================================================== *
 *  一、有限群
 * ================================================================== */
/** 由元素列表和乘法（返回乘积的编号）建群：乘法表、单位元、逆元、共轭类 */
function finishGroup(G) {
  var n = G.order, T = G.table, a, b;
  G.identity = -1;
  for (a = 0; a < n && G.identity < 0; a++) { var ok = true; for (b = 0; b < n && ok; b++) if (T[a * n + b] !== b || T[b * n + a] !== b) ok = false; if (ok) G.identity = a; }
  G.inverse = new Int32Array(n);
  for (a = 0; a < n; a++) for (b = 0; b < n; b++) if (T[a * n + b] === G.identity) { G.inverse[a] = b; break; }
  var classOf = new Int32Array(n).fill(-1), classes = [];
  for (a = 0; a < n; a++) {
    if (classOf[a] >= 0) continue;
    var orb = {}, list = [];
    for (var g = 0; g < n; g++) { var c = T[T[g * n + a] * n + G.inverse[g]]; if (!orb[c]) { orb[c] = 1; list.push(c); } }
    list.sort(function (x, y) { return x - y; });
    list.forEach(function (c2) { classOf[c2] = classes.length; });
    classes.push(list);
  }
  G.classes = classes; G.classOf = classOf;
  G.abelian = true; for (a = 0; a < n && G.abelian; a++) for (b = 0; b < n; b++) if (T[a * n + b] !== T[b * n + a]) { G.abelian = false; break; }
  return G;
}
function permGroup(name, title, perms, labels) {
  var n = perms.length, index = {}, i, j;
  for (i = 0; i < n; i++) index[perms[i].join(",")] = i;
  var T = new Int32Array(n * n);
  for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
    var p = perms[i], q = perms[j], r = new Array(q.length);
    for (var t = 0; t < q.length; t++) r[t] = p[q[t]];       // (pq)(t) = p(q(t))
    var k = index[r.join(",")]; if (k === undefined) throw new Error("置换不封闭：" + name);
    T[i * n + j] = k;
  }
  return finishGroup({ name: name, title: title, order: n, table: T, labels: labels, perms: perms, index: index });
}
function permutationsLex(m) {
  var a = [], out = [], i, j, t;
  for (i = 0; i < m; i++) a.push(i);
  for (;;) {
    out.push(a.slice());
    for (i = m - 2; i >= 0 && a[i] > a[i + 1]; i--) {}
    if (i < 0) break;
    for (j = m - 1; a[j] < a[i]; j--) {}
    t = a[i]; a[i] = a[j]; a[j] = t;
    for (var lo = i + 1, hi = m - 1; lo < hi; lo++, hi--) { t = a[lo]; a[lo] = a[hi]; a[hi] = t; }
  }
  return out;
}
function permSign(p) { var seen = new Uint8Array(p.length), cyc = 0; for (var i = 0; i < p.length; i++) if (!seen[i]) { cyc++; for (var j = i; !seen[j]; j = p[j]) seen[j] = 1; } return (p.length - cyc) % 2 ? -1 : 1; }
/** 轮换记号（点从 1 起标；单位元写 e） */
function cycleLabel(p) {
  var seen = new Uint8Array(p.length), s = "", sep = p.length > 9 ? " " : "";
  for (var i = 0; i < p.length; i++) {
    if (seen[i] || p[i] === i) { seen[i] = 1; continue; }
    var c = []; for (var j = i; !seen[j]; j = p[j]) { seen[j] = 1; c.push(j + 1); }
    s += "(" + c.join(sep) + ")";
  }
  return s || "e";
}
function cyclicGroup(n) {
  var T = new Int32Array(n * n), labels = [];
  for (var a = 0; a < n; a++) { labels.push(String(a)); for (var b = 0; b < n; b++) T[a * n + b] = (a + b) % n; }
  var G = finishGroup({ name: "C" + n, title: "循环群 C" + n + "（阶 " + n + "）", order: n, table: T, labels: labels });
  G.exps = new Int32Array(n); for (a = 0; a < n; a++) G.exps[a] = a;
  return G;
}
/** D_n = ⟨r, s | rⁿ = s² = 1, srs = r⁻¹⟩，阶 2n。元素 r^j s^e 作用在正 n 边形顶点上：i ↦ j + (−1)^e i (mod n)。顺序：先 e = 0 的 n 个，再 e = 1 的 n 个 */
function dihedralGroup(n) {
  var perms = [], labels = [], J = [], E = [];
  for (var e = 0; e < 2; e++) for (var j = 0; j < n; j++) {
    var p = []; for (var i = 0; i < n; i++) p.push(((j + (e ? -i : i)) % n + n) % n);
    perms.push(p); J.push(j); E.push(e);
    labels.push(e === 0 ? (j === 0 ? "e" : j === 1 ? "r" : "r^" + j) : (j === 0 ? "s" : j === 1 ? "rs" : "r^" + j + "s"));
  }
  var G = permGroup("D" + n, "二面体群 D" + n + "（阶 " + 2 * n + "）", perms, labels);
  G.J = Int32Array.from(J); G.E = Int32Array.from(E);
  return G;
}
function symmetricGroup(m) { var ps = permutationsLex(m); return permGroup("S" + m, "对称群 S" + m + "（阶 " + ps.length + "）", ps, ps.map(cycleLabel)); }
function alternatingGroup(m) { var ps = permutationsLex(m).filter(function (p) { return permSign(p) === 1; }); return permGroup("A" + m, "交错群 A" + m + "（阶 " + ps.length + "）", ps, ps.map(cycleLabel)); }
/** 四元数群 Q8 = {±1, ±i, ±j, ±k}，元素存成四元数 (w, x, y, z) */
var Q8Q = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];
function qmul(a, b) { return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]]; }
function quaternionGroup() {
  var n = 8, T = new Int32Array(64), key = {};
  Q8Q.forEach(function (q, i) { key[q.join(",")] = i; });
  for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) T[a * n + b] = key[qmul(Q8Q[a], Q8Q[b]).join(",")];
  return finishGroup({ name: "Q8", title: "四元数群 Q8（阶 8）", order: 8, table: T, labels: ["1", "−1", "i", "−i", "j", "−j", "k", "−k"] });
}

/* ================================================================== *
 *  二、实不可约表示
 *  每个表示：{ name, dim, type: "real" | "complex" | "quaternionic", frob = dim_R End_G(V) ∈ {1,2,4},
 *             frobSchur（对应复不可约表示的 Frobenius–Schur 指标 1 / 0 / −1）, matrices, chi, desc }
 * ================================================================== */
function irrep(name, d, mats, order, type, desc) {
  var chi = new Float64Array(order);
  for (var g = 0; g < order; g++) { var s = 0; for (var i = 0; i < d; i++) s += mats[(g * d + i) * d + i]; chi[g] = s; }
  type = type || "real";
  return { name: name, dim: d, type: type, frob: type === "real" ? 1 : type === "complex" ? 2 : 4, frobSchur: type === "real" ? 1 : type === "complex" ? 0 : -1, matrices: mats, chi: chi, desc: desc || "" };
}
function rotInto(M, off, th, flip) { var c = Math.cos(th), s = Math.sin(th); M[off] = c; M[off + 1] = flip ? s : -s; M[off + 2] = s; M[off + 3] = flip ? -c : c; }   // R(θ)·F^e，F = diag(1, −1)
/** C_n（以及经离散对数换名后的 (Z/p)^×）：平凡、（n 偶时）符号、旋转 rot_k = χ_k ⊕ χ_{−k} 的实形式（复型） */
function cyclicIrreps(n, exps) {
  var N = exps.length, out = [], g, M;
  M = new Float64Array(N).fill(1); out.push(irrep("triv", 1, M, N, "real", "平凡表示"));
  if (n % 2 === 0) { M = new Float64Array(N); for (g = 0; g < N; g++) M[g] = exps[g] % 2 ? -1 : 1; out.push(irrep("sgn", 1, M, N, "real", "a ↦ (−1)^a")); }
  for (var k = 1; 2 * k < n; k++) {
    M = new Float64Array(N * 4); for (g = 0; g < N; g++) rotInto(M, 4 * g, 2 * Math.PI * k * exps[g] / n, false);
    out.push(irrep("rot" + k, 2, M, N, "complex", "a ↦ R(2πka/n)：一对复特征标 χ_{±" + k + "} 的实形式"));
  }
  return out;
}
/** D_n：r^j s^e ↦ R(2πkj/n) F^e（1 ≤ k < n/2，实型二维），加上一维表示 */
function dihedralIrreps(G) {
  var n = G.order / 2, N = G.order, out = [], g, M;
  function one(name, f, desc) { var A = new Float64Array(N); for (var q = 0; q < N; q++) A[q] = f(G.J[q], G.E[q]); out.push(irrep(name, 1, A, N, "real", desc)); }
  one("triv", function () { return 1; }, "平凡表示");
  one("sgn_s", function (j, e) { return e ? -1 : 1; }, "r ↦ 1，s ↦ −1");
  if (n % 2 === 0) { one("sgn_r", function (j) { return j % 2 ? -1 : 1; }, "r ↦ −1，s ↦ 1"); one("sgn_rs", function (j, e) { return (j + e) % 2 ? -1 : 1; }, "r ↦ −1，s ↦ −1"); }
  for (var k = 1; 2 * k < n; k++) { M = new Float64Array(N * 4); for (g = 0; g < N; g++) rotInto(M, 4 * g, 2 * Math.PI * k * G.J[g] / n, G.E[g] === 1); out.push(irrep("ρ" + k, 2, M, N, "real", "r^j s^e ↦ R(2π·" + k + "j/" + n + ")·F^e")); }
  return out;
}
/* ---- S_n：Young 正交形式 ---- */
function partitions(m, maxPart) {
  if (maxPart === undefined) maxPart = m;
  if (m === 0) return [[]];
  var out = [];
  for (var k = Math.min(m, maxPart); k >= 1; k--) partitions(m - k, k).forEach(function (r) { out.push([k].concat(r)); });
  return out;
}
function conjugatePartition(lam) { var out = []; for (var j = 0; j < lam[0]; j++) { var c = 0; for (var r = 0; r < lam.length; r++) if (lam[r] > j) c++; out.push(c); } return out; }
/** 形状 λ 的全部标准 Young 表：pos[m] = [行, 列]（m = 1..n），依次把 1, 2, …, n 放到当前形状的外角上 */
function standardTableaux(lam) {
  var n = 0, res = []; lam.forEach(function (v) { n += v; });
  var shape = lam.map(function () { return 0; }), pos = [];
  (function rec(m) {
    if (m > n) { res.push(pos.slice()); return; }
    for (var r = 0; r < lam.length; r++) {
      var c = shape[r];
      if (c < lam[r] && (r === 0 || shape[r - 1] > c)) { shape[r]++; pos[m] = [r, c]; rec(m + 1); shape[r]--; }
    }
  })(1);
  return res;
}
/** 相邻对换 s_i = (i, i+1)（i = 1..n−1，作用在数字上）：s_i e_T = (1/a) e_T + √(1 − 1/a²) e_{s_i T}，
 *  a = c_T(i+1) − c_T(i) 是轴距（content = 列 − 行 之差）。|a| = 1 时 i、i+1 同行（作用 +1）或同列（作用 −1） */
function youngGenerators(lam) {
  var tabs = standardTableaux(lam), d = tabs.length, n = tabs[0].length - 1, key = {}, gens = [];
  tabs.forEach(function (t, k) { key[t.slice(1).map(function (x) { return x.join("."); }).join("|")] = k; });
  for (var i = 1; i < n; i++) {
    var M = new Float64Array(d * d);
    for (var k = 0; k < d; k++) {
      var t = tabs[k], a = (t[i + 1][1] - t[i + 1][0]) - (t[i][1] - t[i][0]);
      M[k * d + k] = 1 / a;
      if (Math.abs(a) > 1) {
        var t2 = t.slice(); t2[i] = t[i + 1]; t2[i + 1] = t[i];
        var k2 = key[t2.slice(1).map(function (x) { return x.join("."); }).join("|")];
        M[k2 * d + k] = Math.sqrt(1 - 1 / (a * a));
      }
    }
    gens.push(M);
  }
  return { d: d, gens: gens };
}
function matmulInto(A, B, d, out, off) { for (var i = 0; i < d; i++) for (var j = 0; j < d; j++) { var s = 0; for (var k = 0; k < d; k++) s += A[i * d + k] * B[off + k * d + j]; out[i * d + j] = s; } }
/** 已知生成元的矩阵，按 ρ(s g) = ρ(s) ρ(g) 广度优先得到全部元素的矩阵（只有生成元满足群的全部关系时才是同态，测试里验证） */
function repFromGenerators(G, genIds, genMats, d) {
  var N = G.order, mats = new Float64Array(N * d * d), done = new Uint8Array(N), queue = [G.identity], tmp = new Float64Array(d * d), i;
  for (i = 0; i < d; i++) mats[(G.identity * d + i) * d + i] = 1;
  done[G.identity] = 1;
  while (queue.length) {
    var g = queue.shift();
    for (var q = 0; q < genIds.length; q++) {
      var h = G.table[genIds[q] * N + g];
      if (done[h]) continue;
      matmulInto(genMats[q], mats, d, tmp, g * d * d); mats.set(tmp, h * d * d); done[h] = 1; queue.push(h);
    }
  }
  for (i = 0; i < N; i++) if (!done[i]) throw new Error("生成元没能生成整个群");
  return mats;
}
function symmetricIrreps(G) {
  var m = G.perms[0].length, genIds = [];
  for (var i = 1; i < m; i++) { var p = []; for (var t = 0; t < m; t++) p.push(t); p[i - 1] = i; p[i] = i - 1; genIds.push(G.index[p.join(",")]); }
  return partitions(m).map(function (lam) {
    var Y = youngGenerators(lam), name = "(" + lam.join(",") + ")";
    var desc = lam.length === 1 ? "平凡表示" : lam[0] === 1 ? "符号表示" : lam.length === 2 && lam[1] === 1 ? "标准表示（置换表示减去平凡表示）" : "Specht 模 S^" + name;
    return irrep(name, Y.d, repFromGenerators(G, genIds, Y.gens, Y.d), G.order, "real", desc);
  });
}
/** 列向量组的正交规范基（改进的 Gram–Schmidt，两遍；范数低于 tol 的丢掉）。cols：d 个长度为 m 的列，按列展开在 A[c·m + r] */
function orthoBasis(A, m, nc, tol) {
  var Q = [], v = new Float64Array(m);
  for (var c = 0; c < nc; c++) {
    for (var r = 0; r < m; r++) v[r] = A[c * m + r];
    var n0 = 0; for (r = 0; r < m; r++) n0 += v[r] * v[r]; n0 = Math.sqrt(n0); if (n0 === 0) continue;
    for (var pass = 0; pass < 2; pass++) for (var q = 0; q < Q.length; q++) { var dot = 0, Qq = Q[q]; for (r = 0; r < m; r++) dot += Qq[r] * v[r]; for (r = 0; r < m; r++) v[r] -= dot * Qq[r]; }
    var nn = 0; for (r = 0; r < m; r++) nn += v[r] * v[r]; nn = Math.sqrt(nn);
    if (nn > tol * n0) { var u = new Float64Array(m); for (r = 0; r < m; r++) u[r] = v[r] / nn; Q.push(u); }
  }
  return Q;
}
/** A_n：S_n 不可约表示的限制。λ ≠ λ' 时不可约（λ 与 λ' 给同一个，只留一个）；λ = λ' 时用"交错算子"
 *  M = Σ_{g∈S_n} sgn(g) ρ(g) X ρ(g)ᵀ（M ρ(h) = sgn(h) ρ(h) M，由 Schur 引理 M² = cI）劈开：
 *  c > 0：M 对称，±√c 的特征空间给出两个实不可约表示；c < 0：M 反对称，两支互为复共轭，保留实形式（复型）。 */
function alternatingIrreps(G) {
  var m = G.perms[0].length, S = symmetricGroup(m), SI = symmetricIrreps(S), N = G.order, out = [], seen = {};
  var sub = G.perms.map(function (p) { return S.index[p.join(",")]; }), sgn = S.perms.map(permSign);
  SI.forEach(function (rep) {
    var lam = rep.name.slice(1, -1).split(",").map(Number), lc = conjugatePartition(lam), d = rep.dim, g, i, j, k;
    if (seen["(" + lc.join(",") + ")"]) return;
    seen[rep.name] = 1;
    var R = new Float64Array(N * d * d);
    for (g = 0; g < N; g++) R.set(rep.matrices.subarray(sub[g] * d * d, (sub[g] + 1) * d * d), g * d * d);
    if (lc.join(",") !== lam.join(",")) { out.push(irrep(rep.name, d, R, N, "real", "S" + m + " 的 " + rep.name + " 限制到 A" + m + "（与 (" + lc.join(",") + ") 的限制相同）")); return; }
    // 自共轭：找一个让 M ≠ 0 的 X = E_{ab}
    var M = null;
    for (var ab = 0; ab < d * d && !M; ab++) {
      var a0 = Math.floor(ab / d), b0 = ab % d, T = new Float64Array(d * d);
      for (g = 0; g < S.order; g++) { var o = g * d * d; for (i = 0; i < d; i++) for (j = 0; j < d; j++) T[i * d + j] += sgn[g] * rep.matrices[o + i * d + a0] * rep.matrices[o + j * d + b0]; }
      var nrm = 0; for (i = 0; i < d * d; i++) nrm += T[i] * T[i];
      if (nrm > 1e-12 * S.order * S.order) M = T;
    }
    var c = 0; for (i = 0; i < d; i++) for (k = 0; k < d; k++) c += M[i * d + k] * M[k * d + i]; c /= d;   // tr(M²)/d
    if (c < 0) { out.push(irrep(rep.name + "_C", d, R, N, "complex", "S" + m + " 的自共轭表示 " + rep.name + " 限制到 A" + m + "：分裂成两个互为复共轭的 " + d / 2 + " 维复表示，这是它们的实形式")); return; }
    var sc = Math.sqrt(c);
    [1, -1].forEach(function (sign) {
      var P = new Float64Array(d * d);   // P± = (I ± M/√c)/2，按列展开
      for (i = 0; i < d; i++) for (j = 0; j < d; j++) P[j * d + i] = ((i === j ? 1 : 0) + sign * M[i * d + j] / sc) / 2;
      var B = orthoBasis(P, d, d, 1e-8), h = B.length, Rs = new Float64Array(N * h * h);
      for (g = 0; g < N; g++) for (var u = 0; u < h; u++) for (var v = 0; v < h; v++) {
        var s = 0; for (i = 0; i < d; i++) { var Bi = B[u][i]; if (!Bi) continue; for (j = 0; j < d; j++) s += Bi * R[(g * d + i) * d + j] * B[v][j]; }
        Rs[(g * h + u) * h + v] = s;
      }
      out.push(irrep(rep.name + (sign > 0 ? "+" : "−"), h, Rs, N, "real", "S" + m + " 的自共轭表示 " + rep.name + " 在 A" + m + " 上分裂出的一支（M 的 " + (sign > 0 ? "+" : "−") + "√c 特征空间）"));
    });
  });
  return out;
}
/** Q8：四个一维表示（核分别是 Q8、⟨i⟩、⟨j⟩、⟨k⟩），以及二维四元数型复表示的实形式：q ↦ 左乘 L_q（ℍ ≅ ℝ⁴） */
function quaternionIrreps() {
  var N = 8, out = [], g;
  function one(name, f, desc) { var A = new Float64Array(N); for (var q = 0; q < N; q++) A[q] = f(Q8Q[q]); out.push(irrep(name, 1, A, N, "real", desc)); }
  one("triv", function () { return 1; }, "平凡表示");
  one("sgn_i", function (q) { return q[0] || q[1] ? 1 : -1; }, "核为 ⟨i⟩：±1, ±i ↦ 1，±j, ±k ↦ −1");
  one("sgn_j", function (q) { return q[0] || q[2] ? 1 : -1; }, "核为 ⟨j⟩");
  one("sgn_k", function (q) { return q[0] || q[3] ? 1 : -1; }, "核为 ⟨k⟩");
  var M = new Float64Array(N * 16), E = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (g = 0; g < N; g++) for (var c = 0; c < 4; c++) { var col = qmul(Q8Q[g], E[c]); for (var r = 0; r < 4; r++) M[g * 16 + r * 4 + c] = col[r]; }
  out.push(irrep("H", 4, M, N, "quaternionic", "二维复表示（Pauli 矩阵 iσ）是四元数型，不能在 ℝ 上实现；这是它的 4 维实形式：q 左乘 ℍ = ℝ⁴"));
  return out;
}
/** 按名字造群并附上全部实不可约表示："C"/"D" 要带 n；"S3" "S4" "S5" "A4" "A5" "Q8" */
var GROUP_NAMES = ["S3", "S4", "S5", "A4", "A5", "Q8", "C", "D"];
function makeGroup(name, n) {
  var G;
  if (name === "C") { G = cyclicGroup(n); G.irreps = cyclicIrreps(n, G.exps); }
  else if (name === "D") { G = dihedralGroup(n); G.irreps = dihedralIrreps(G); }
  else if (name === "Q8") { G = quaternionGroup(); G.irreps = quaternionIrreps(); }
  else if (name.charAt(0) === "S") { G = symmetricGroup(+name.slice(1)); G.irreps = symmetricIrreps(G); }
  else if (name.charAt(0) === "A") { G = alternatingGroup(+name.slice(1)); G.irreps = alternatingIrreps(G); }
  else throw new Error("不认识的群：" + name);
  return G;
}

/* ================================================================== *
 *  三、数据集
 * ================================================================== */
var PRIMES = []; (function () { for (var q = 5; q <= 113; q++) if (isPrime(q)) PRIMES.push(q); })();
/** 模 p 运算的记号与群结构。add / sub：记号 t ↔ 余数 t ∈ Z/p，群 = (Z/p, +)；mul：记号 t ↔ 余数 t+1 ∈ (Z/p)^×，群 = ((Z/p)^×, ×) */
function modSetup(p, op) {
  var m = op === "mul" ? p - 1 : p, val = new Int32Array(m), tab = new Int32Array(m * m), law = new Int32Array(m * m), a, b;
  for (a = 0; a < m; a++) val[a] = op === "mul" ? a + 1 : a;
  for (a = 0; a < m; a++) for (b = 0; b < m; b++) {
    if (op === "mul") { tab[a * m + b] = (val[a] * val[b]) % p - 1; law[a * m + b] = tab[a * m + b]; }
    else { tab[a * m + b] = op === "sub" ? ((a - b) % p + p) % p : (a + b) % p; law[a * m + b] = (a + b) % p; }
  }
  var inv = new Int32Array(m), S = { p: p, op: op, order: m, values: val, table: tab, law: law, inverse: inv, identity: 0 };
  for (a = 0; a < m; a++) for (b = 0; b < m; b++) if (law[a * m + b] === 0) { inv[a] = b; break; }
  if (op === "mul") {
    var g = primitiveRoot(p), dlog = new Int32Array(m), order = new Int32Array(m), x = 1;
    for (var k = 0; k < m; k++) { order[k] = x - 1; dlog[x - 1] = k; x = x * g % p; }
    S.g = g; S.dlog = dlog; S.fourierOrder = order; S.fourierN = m; S.exps = dlog;
  } else { S.fourierN = p; S.exps = new Int32Array(m); for (a = 0; a < m; a++) S.exps[a] = a; }
  return S;
}
reg.add({
  id: "modadd", family: "toy", kind: "classification", plot: "cayley",
  name: "模 p 加法（grokking）", summary: "输入两个余数 a、b，输出 a+b（或 a−b、a×b）mod p；全部 p² 对里取一部分训练，其余全没见过。",
  params: [
    { key: "p", label: "素数 p", def: 31, type: "select", options: PRIMES.map(function (q) { return [q, String(q)]; }), desc: "记号与类别都是 Z/p 的元素（乘法时去掉 0）" },
    { key: "op", label: "运算", def: "add", type: "select", options: [["add", "加法 a + b"], ["sub", "减法 a − b"], ["mul", "乘法 a × b（去掉 0）"]] },
    { key: "trainFrac", label: "训练比例", def: 0.6, min: 0.05, max: 0.95, step: 0.05, type: "num", desc: "全部有序对里放进训练集的比例；其余对半分成验证集与测试集" }
  ],
  split: { by: "custom" },
  gen: function (p, rng) {
    var P = clampI(num(p, "p", 31), 3, 113); if (!isPrime(P)) { while (!isPrime(P)) P--; }
    var op = str(p, "op", "add"); if (["add", "sub", "mul"].indexOf(op) < 0) op = "add";
    var S = modSetup(P, op), m = S.order, n = m * m, X = new Float64Array(2 * n), y = new Int32Array(n), classes = [];
    for (var a = 0; a < m; a++) { classes.push(String(S.values[a])); for (var b = 0; b < m; b++) { var i = a * m + b; X[2 * i] = a; X[2 * i + 1] = b; y[i] = S.table[i]; } }
    var sp = fracSplit(n, clamp(num(p, "trainFrac", 0.6), 0.01, 0.99), rng);
    S.split = splitMask(n, sp); S.name = op === "mul" ? "(Z/" + P + ")^×" : "Z/" + P; S.labels = classes.slice();
    return { X: X, y: y, n: n, d: 2, classes: classes, featureNames: ["a", "b"], tokens: { vocab: m }, splitIdx: sp, meta: S };
  },
  oracle: function (p) {
    var P = clampI(num(p, "p", 31), 3, 113); while (!isPrime(P)) P--;
    var op = str(p, "op", "add"), S = modSetup(P, op), m = S.order;
    return { predict: function (x) { return oneHot(m, S.table[(x[0] | 0) * m + (x[1] | 0)]); }, note: "标签是输入的确定函数（运算表本身），贝叶斯最优准确率 = 1。" };
  },
  bayes: function () { return { metric: "acc", value: 1, note: "标签是 (a, b) 的确定函数，所以贝叶斯最优准确率是 1；问题只在于从一部分表格泛化到没见过的格子。" }; },
  docs: [
    "**任务.** 素数 $p$。输入两个记号 $a,b$（嵌入层的编号就是余数），输出 $c=a\\circ b$，其中 $\\circ$ 是模 $p$ 的加、减或乘。全部有序对（加、减为 $p^2$ 个，乘为 $(p-1)^2$ 个）里随机取比例 `trainFrac` 进训练集，其余对半分成验证集与测试集。没有噪声，也不会有“更多数据”：验证、测试集里的每个输入训练时都没见过，模型只能靠学到运算本身的结构来泛化。",
    "",
    "**grokking（顿悟）.** Power 等（2022）发现：小网络在这类任务上先把训练集背下来（训练准确率 100%，验证准确率在 $1/p$ 附近），过了很久，在权重衰减的作用下验证准确率才突然升到接近 100%。权重衰减是关键旋钮，训练比例也是：比例越小，grok 越晚，太小就不发生。粗测（numpy，嵌入 32 维、128 个 ReLU、AdamW 学习率 $3\\times10^{-3}$、权重衰减 1、全批量）：$p=31$、比例 0.6 约 6000–10000 步 grok；比例 0.5 时 12000 步内还没到 99%；$p=23$ 需要更高的比例。默认值按此选取。",
    "",
    "**网络学到的算法：傅里叶乘法（Nanda 等 2023）.** 记 $\\omega_k=2\\pi k/p$。由三角恒等式",
    "$$\\cos\\omega_k(a+b-c)=\\cos\\omega_k(a+b)\\cos\\omega_kc+\\sin\\omega_k(a+b)\\sin\\omega_kc,$$",
    "$$\\cos\\omega_k(a+b)=\\cos\\omega_ka\\cos\\omega_kb-\\sin\\omega_ka\\sin\\omega_kb,$$",
    "只要嵌入里有 $\\cos\\omega_ka,\\sin\\omega_ka$，中间层能做乘法，反嵌入里有 $\\cos\\omega_kc,\\sin\\omega_kc$，就能算出 logit $\\ell_c=\\sum_{k\\in K}\\cos\\omega_k(a+b-c)$。它在 $c\\equiv a+b$ 处取最大值 $\\lvert K\\rvert$，其余 $c$ 处严格更小（$p$ 是素数，$k\\ne0$ 时 $\\cos\\omega_k\\Delta=1$ 当且仅当 $\\Delta\\equiv0$）。",
    "",
    "**分析工具.** grok 之后，嵌入矩阵 $E\\in\\mathbb R^{p\\times D}$ 的列在离散傅里叶变换下集中在少数几个频率上。`QL.mltoy.fourier(E, p)` 先减去列均值 $\\bar E$，再计算",
    "$$s_k=\\frac{\\lVert\\hat E_k\\rVert^2+\\lVert\\hat E_{p-k}\\rVert^2}{\\sum_{j=1}^{p-1}\\lVert\\hat E_j\\rVert^2},\\qquad\\hat E_j=\\sum_{a}e^{-2\\pi ija/p}(E_a-\\bar E),\\qquad k=1,\\dots,\\lfloor p/2\\rfloor,$$",
    "即把 $k$ 与 $p-k$（余弦与正弦）合并。$\\sum_ks_k=1$；分母等于 $p\\sum_a\\lVert E_a-\\bar E\\rVert^2$（Parseval）。随机嵌入的 $s_k\\approx2/(p-1)$；嵌入为 $E_a=(\\cos\\omega_ka,\\sin\\omega_ka)$ 时 $s_k=1$。",
    "",
    "**减法与乘法.** 减法的记号集合仍是 $\\mathbb Z/p$，分析方式相同。乘法去掉 0：取原根 $g$（`meta.g`），离散对数 $\\log_g:(\\mathbb Z/p)^\\times\\to\\mathbb Z/(p-1)$ 是群同构，所以 $a\\times b$ 就是 $\\mathbb Z/(p-1)$ 上的加法换了记号名字。",
    "",
    "**命题.** 设网络对记号编号置换等变：嵌入表、反嵌入表的初始化在行之间独立同分布，划分是均匀随机的。则“模 $p$ 乘法”与“模 $p-1$ 加法”的训练过程同分布，只差记号的重新编号 $t\\mapsto\\log_gt$。",
    "**证明.** 换名是记号集合上的双射，把乘法表映成加法表；它保持初始化分布（行独立同分布）、划分分布（均匀）与损失（交叉熵只看编号是否相同）。$\\square$",
    "所以乘法任务的嵌入要按 $g^0,g^1,\\dots$ 重排行再做傅里叶分析：`QL.mltoy.fourierFor(E, meta)` 会自动用 `meta.fourierOrder`。注意 $p-1$ 是偶数，频率 $(p-1)/2$ 对应实的一维符号表示。",
    "",
    "`meta.table` 是任务的运算表，`meta.law` 是记号集合的群运算（给 `invarianceR2` 用），`meta.split` 标出每一格属于训练（0）、验证（1）还是测试（2）。",
    "",
    "## 参考文献",
    "1. A. Power, Y. Burda, H. Edwards, I. Babuschkin, V. Misra, Grokking: generalization beyond overfitting on small algorithmic datasets, arXiv:2201.02177 (2022).",
    "2. N. Nanda, L. Chan, T. Lieberum, J. Smith, J. Steinhardt, Progress measures for grokking via mechanistic interpretability, *ICLR* (2023), arXiv:2301.05217."
  ].join("\n")
});

reg.add({
  id: "group", family: "toy", kind: "classification", plot: "cayley",
  name: "有限群的乘法表", summary: "输入两个群元素，输出乘积；附全部实不可约表示的矩阵，用来按表示分解学到的嵌入。",
  params: [
    { key: "G", label: "群", def: "S4", type: "select", options: [["S3", "对称群 S3（阶 6）"], ["S4", "对称群 S4（阶 24）"], ["S5", "对称群 S5（阶 120）"], ["A4", "交错群 A4（阶 12）"], ["A5", "交错群 A5（阶 60）"], ["Q8", "四元数群 Q8（阶 8）"], ["D", "二面体群 D_n（阶 2n）"], ["C", "循环群 C_n（阶 n）"]] },
    { key: "n", label: "n（C_n、D_n 用）", def: 7, min: 3, max: 60, step: 1, type: "int", show: function (p) { return p.G === "C" || p.G === "D"; } },
    { key: "trainFrac", label: "训练比例", def: 0.7, min: 0.05, max: 0.95, step: 0.05, type: "num", desc: "全部 |G|² 个有序对里放进训练集的比例" }
  ],
  split: { by: "custom" },
  gen: function (p, rng) {
    var name = str(p, "G", "S4"); if (GROUP_NAMES.indexOf(name) < 0) name = "S4";
    var G = makeGroup(name, clampI(num(p, "n", 7), name === "C" ? 2 : 3, 60)), m = G.order, n = m * m, X = new Float64Array(2 * n), y = new Int32Array(n);
    for (var a = 0; a < m; a++) for (var b = 0; b < m; b++) { var i = a * m + b; X[2 * i] = a; X[2 * i + 1] = b; y[i] = G.table[i]; }
    var sp = fracSplit(n, clamp(num(p, "trainFrac", 0.7), 0.01, 0.99), rng);
    var meta = { name: G.name, title: G.title, order: m, table: G.table, law: G.table, inverse: G.inverse, identity: G.identity, labels: G.labels, elements: G.labels.slice(), irreps: G.irreps,
      classes: G.classes, classOf: G.classOf, abelian: G.abelian, split: splitMask(n, sp) };
    return { X: X, y: y, n: n, d: 2, classes: G.labels.slice(), featureNames: ["a", "b"], tokens: { vocab: m }, splitIdx: sp, meta: meta };
  },
  oracle: function (p) {
    var name = str(p, "G", "S4"); if (GROUP_NAMES.indexOf(name) < 0) name = "S4";
    var G = makeGroup(name, clampI(num(p, "n", 7), name === "C" ? 2 : 3, 60)), m = G.order;
    return { predict: function (x) { return oneHot(m, G.table[(x[0] | 0) * m + (x[1] | 0)]); }, note: "标签就是乘法表，贝叶斯最优准确率 = 1。" };
  },
  bayes: function () { return { metric: "acc", value: 1, note: "标签是 (a, b) 的确定函数，贝叶斯最优准确率是 1。" }; },
  docs: [
    "**任务.** 有限群 $G$。输入两个元素 $a,b$（编号 $0,\\dots,\\lvert G\\rvert-1$），输出乘积 $ab$ 的编号；全部 $\\lvert G\\rvert^2$ 个有序对按 `trainFrac` 划分。可选 $C_n$、$D_n$、$S_3,S_4,S_5$、$A_4,A_5$、$Q_8$。置换写成像的数组，乘法 $(pq)(i)=p(q(i))$（先作用 $q$），元素名用轮换记号（点从 1 起标）；$D_n$ 的元素 $r^js^e$ 作用在正 $n$ 边形的顶点上：$i\\mapsto j+(-1)^ei\\pmod n$。项目 12 的实测：$S_4$、训练比例 0.7、AdamW 权重衰减 1，约 3000 步 grok；比例 0.5 时 8000 步内不 grok。",
    "",
    "## 表示论数据（`meta.irreps`）",
    "每个实不可约表示给出正交矩阵 $\\rho(g)$（`matrices`，$\\lvert G\\rvert\\times d\\times d$，按行展开）与特征标 `chi`。实表示分三种（Frobenius–Schur）：",
    "",
    "| 类型 | $\\operatorname{End}_G(V)$ | 复不可约的指标 $\\frac1{\\lvert G\\rvert}\\sum_g\\chi(g^2)$ | 本数据集里的例子 |",
    "|---|---|---|---|",
    "| 实型 | $\\mathbb R$ | $1$ | $S_n$、$D_n$ 的全部表示 |",
    "| 复型 | $\\mathbb C$ | $0$ | $C_n$ 的旋转表示，$A_4$ 的 $(2,2)_C$ |",
    "| 四元数型 | $\\mathbb H$ | $-1$ | $Q_8$ 的 4 维表示 `H` |",
    "",
    "复型、四元数型的复不可约表示不能在 $\\mathbb R$ 上实现，这里给出的是它的实形式（维数加倍），字段 `type`、`frob` $=\\dim_{\\mathbb R}\\operatorname{End}_G(V)\\in\\{1,2,4\\}$、`frobSchur` 标明类型。于是特征标正交关系写成 $\\langle\\chi_\\rho,\\chi_\\sigma\\rangle=\\frac1{\\lvert G\\rvert}\\sum_g\\chi_\\rho(g)\\chi_\\sigma(g)=\\delta_{\\rho\\sigma}\\,\\mathrm{frob}_\\rho$，完备性写成 $\\sum_\\rho d_\\rho^2/\\mathrm{frob}_\\rho=\\lvert G\\rvert$。",
    "- **$D_n$.** $r^js^e\\mapsto R(2\\pi kj/n)F^e$，$F=\\operatorname{diag}(1,-1)$，$1\\le k<n/2$；另有 2 个（$n$ 奇）或 4 个（$n$ 偶）一维表示。",
    "- **$S_n$：Young 正交形式.** 基为形状 $\\lambda$ 的标准 Young 表 $T$。相邻对换 $s_i=(i\\ i{+}1)$ 作用为 $s_ie_T=\\frac1ae_T+\\sqrt{1-a^{-2}}\\,e_{s_iT}$，其中 $a=c_T(i+1)-c_T(i)$ 是轴距（content $=$ 列 $-$ 行）；$\\lvert a\\rvert=1$ 时 $s_iT$ 不标准，第二项系数为 0。生成元满足 Coxeter 关系，其余元素按 $\\rho(sg)=\\rho(s)\\rho(g)$ 广度优先得到。",
    "- **$A_n$：限制与分裂.** $\\lambda\\ne\\lambda'$ 时 $\\rho_\\lambda|_{A_n}\\cong\\rho_{\\lambda'}|_{A_n}$ 不可约，只留一个。$\\lambda=\\lambda'$ 时令 $M=\\sum_{g\\in S_n}\\operatorname{sgn}(g)\\rho(g)X\\rho(g)^{\\top}$，则 $M\\rho(h)=\\operatorname{sgn}(h)\\rho(h)M$，由 Schur 引理 $M^2=cI$，且 $M^{\\top}=\\pm M$。$c>0$ 时 $M$ 对称，$\\pm\\sqrt c$ 的特征空间给出两个不等价的实不可约表示（$A_5$ 的 $(3,1,1)\\pm$，各 3 维）；$c<0$ 时 $M$ 反对称，两支互为复共轭，只保留实形式（$A_4$ 的 $(2,2)_C$）。",
    "- **$Q_8$.** 四个一维表示，加上二维四元数型表示的实形式：$q\\mapsto$ 左乘 $L_q$，$\\mathbb H\\cong\\mathbb R^4$。",
    "",
    "以上全部在测试里数值验证：同态、正交、特征标正交、$\\sum d^2/\\mathrm{frob}=\\lvert G\\rvert$、Frobenius–Schur 指标。",
    "",
    "## 网络学到的算法（Chughtai–Chan–Nanda 2023）",
    "对忠实的实表示 $\\rho$，$\\chi_\\rho(g)=\\operatorname{tr}\\rho(g)\\le d_\\rho$，等号当且仅当 $\\rho(g)=I$，即 $g=e$（正交矩阵的特征值在单位圆上）。所以 logit $\\ell_c=\\chi_\\rho(abc^{-1})=\\operatorname{tr}\\big(\\rho(a)\\rho(b)\\rho(c)^{\\top}\\big)$ 在 $c=ab$ 处取唯一最大值。这只要求嵌入里有 $\\rho(a)$、$\\rho(b)$ 的矩阵元，中间做一次矩阵乘法。若只用了不忠实的表示，答案只能确定到 $ab\\ker\\rho$ 这个陪集。",
    "",
    "## 分析工具",
    "- **`QL.mltoy.irrepFVE(E, meta)`.** $L^2(G)=\\bigoplus_\\rho V_\\rho$，$V_\\rho=\\operatorname{span}\\{g\\mapsto\\rho(g)_{ij}\\}$，$\\dim V_\\rho=d_\\rho^2/\\mathrm{frob}_\\rho$，各 $V_\\rho$ 两两正交（Schur 正交关系）。把嵌入矩阵 $E$（行 = 群元素）减去列均值（即去掉平凡分量），按列投影到各 $V_\\rho$，返回方差占比 `fve`。对各向同性高斯的随机嵌入，$\\mathbb E\\,\\mathrm{fve}_\\rho=\\dim V_\\rho/(\\lvert G\\rvert-1)$（`baseline`）。不和基线比的占比没有意义：$S_4$ 的 $(3,1)$ 占 0.39 等于什么都没学。",
    "- **`QL.mltoy.invarianceR2(E, meta)`.** 若 $E(a)=\\sum_\\rho M_\\rho\\rho(a)v_\\rho$，$M_\\rho^{\\top}M_\\rho=c_\\rho I$，各项的像两两正交，则 $\\lVert E(a)-E(b)\\rVert^2=\\sum_\\rho c_\\rho\\lVert v_\\rho-\\rho(a^{-1}b)v_\\rho\\rVert^2$ 只依赖 $a^{-1}b$（左不变）；若 $E(b)=\\sum_\\rho N_\\rho\\rho(b)^{\\top}u_\\rho$，则只依赖 $ba^{-1}$（右不变）。把距离矩阵的非对角元按 $a^{-1}b$（或 $ba^{-1}$）分组，返回组均值解释的方差比例 $R^2$，并给出同样大小的高斯随机嵌入的值作对照（约 $1/\\lvert G\\rvert$ 量级）。",
    "",
    "## 参考文献",
    "1. B. Chughtai, L. Chan, N. Nanda, A toy model of universality: reverse engineering how networks learn group operations, *ICML* (2023), arXiv:2302.03025.",
    "2. D. Stander, Q. Yu, H. Fan, S. Biderman, Grokking group multiplication with cosets, *ICML* (2024), arXiv:2312.06581.",
    "3. J.-P. Serre, *Linear Representations of Finite Groups*, GTM 42, Springer (1977)；W. Fulton, J. Harris, *Representation Theory: A First Course*, GTM 129, Springer (1991)。"
  ].join("\n")
});

/** 稀疏奇偶的隐藏集合：只由 (nbits, k, sseed) 决定，与数据种子无关（这样 oracle 也知道它） */
function hiddenSet(p) {
  var nb = clampI(num(p, "nbits", 20), 1, 256), k = clampI(num(p, "k", 3), 1, nb), R = new QL.RNG(clampI(num(p, "sseed", 1), 0, 1e9), 404, 0), all = [], i;
  for (i = 0; i < nb; i++) all.push(i);
  for (i = 0; i < k; i++) { var j = i + R.int(nb - i), t = all[i]; all[i] = all[j]; all[j] = t; }   // 部分洗牌：前 k 个就是隐藏的集合
  return all.slice(0, k).sort(function (a, b) { return a - b; });
}
reg.add({
  id: "parity", family: "toy", kind: "classification", plot: "table",
  name: "稀疏奇偶（k-sparse parity）", summary: "n 个随机比特里藏着 k 个，标签是这 k 个的异或；损失曲线长时间不动，然后突然下降。",
  params: [
    { key: "nbits", label: "比特数 n", def: 20, min: 2, max: 64, step: 1, type: "int" },
    { key: "k", label: "相关比特数 k", def: 3, min: 1, max: 8, step: 1, type: "int" },
    { key: "samples", label: "样本数", def: 6000, min: 200, max: 50000, step: 100, type: "int" },
    { key: "noise", label: "标签翻转概率 η", def: 0, min: 0, max: 0.45, step: 0.01, type: "num" },
    { key: "enc", label: "比特编码", def: "pm1", type: "select", options: [["pm1", "±1（推荐）"], ["01", "0 / 1"]] },
    { key: "trainFrac", label: "训练比例", def: 0.5, min: 0.05, max: 0.95, step: 0.05, type: "num" },
    { key: "sseed", label: "隐藏集合的种子", def: 1, min: 0, max: 9999, step: 1, type: "int", desc: "决定哪 k 个比特相关；数据种子只决定样本" }
  ],
  split: { by: "custom" },
  gen: function (p, rng) {
    var nb = clampI(num(p, "nbits", 20), 1, 256), k = clampI(num(p, "k", 3), 1, nb), n = clampI(num(p, "samples", 6000), 10, 200000), eta = clamp(num(p, "noise", 0), 0, 0.5), pm = str(p, "enc", "pm1") !== "01";
    var S = hiddenSet(p), inS = new Uint8Array(nb), i; S.forEach(function (s) { inS[s] = 1; });
    var X = new Float64Array(n * nb), y = new Int32Array(n), clean = new Int32Array(n), names = [];
    for (i = 0; i < nb; i++) names.push("b" + (i + 1));
    for (var r = 0; r < n; r++) {
      var par = 0;
      for (i = 0; i < nb; i++) { var bit = rng.u() < 0.5 ? 1 : 0; X[r * nb + i] = pm ? 1 - 2 * bit : bit; if (inS[i]) par ^= bit; }
      clean[r] = par; y[r] = eta > 0 && rng.u() < eta ? 1 - par : par;
    }
    var sp = fracSplit(n, clamp(num(p, "trainFrac", 0.5), 0.01, 0.99), rng);
    return { X: X, y: y, n: n, d: nb, classes: pm ? ["偶（积 = +1）", "奇（积 = −1）"] : ["偶（异或 = 0）", "奇（异或 = 1）"], featureNames: names, splitIdx: sp,
      meta: { S: Int32Array.from(S), nbits: nb, k: k, noise: eta, enc: pm ? "pm1" : "01", clean: clean, note: "S 是隐藏的相关比特（从 0 起标，上帝视角）" } };
  },
  oracle: function (p) {
    var eta = clamp(num(p, "noise", 0), 0, 0.5), pm = str(p, "enc", "pm1") !== "01", S = hiddenSet(p);
    return { predict: function (x) { var par = 0; for (var q = 0; q < S.length; q++) if (pm ? x[S[q]] < 0 : x[S[q]] > 0.5) par ^= 1; return par ? [eta, 1 - eta] : [1 - eta, eta]; },
      note: "知道隐藏集合 S：后验 P(y = S 上的异或 | x) = 1 − η，这就是贝叶斯最优。" };
  },
  bayes: function (p) { var eta = clamp(num(p, "noise", 0), 0, 0.5); return { metric: "acc", value: 1 - eta, note: "知道隐藏集合 S 时，贝叶斯最优就是输出 S 上的异或：准确率 1 − η，对数损失 = 二元熵 H(η)。" }; },
  docs: [
    "**任务.** $x\\in\\{\\pm1\\}^n$ 均匀随机（“0/1”编码时存的是 $b_i=(1-x_i)/2$）。隐藏集合 $S\\subset\\{1,\\dots,n\\}$，$\\lvert S\\rvert=k$，只由参数“隐藏集合的种子”决定（`meta.S`，从 0 起标；数据种子只换样本）。标签 $y=\\bigoplus_{i\\in S}b_i$，等价于 $\\chi_S(x)=\\prod_{i\\in S}x_i=(-1)^y$；可选地以概率 $\\eta$ 翻转标签。贝叶斯最优准确率 $=1-\\eta$（oracle 知道 $S$）。",
    "",
    "**Walsh–傅里叶基.** $\\{\\chi_T\\}_{T\\subseteq[n]}$ 是 $L^2(\\{\\pm1\\}^n,\\text{均匀})$ 的正交规范基：$\\mathbb E[\\chi_S\\chi_T]=\\delta_{ST}$。所以目标与任何只依赖少于 $k$ 个坐标的函数 $g$ 协方差为 0（$g$ 的傅里叶支撑里没有 $S$）。逐个特征看相关性、线性模型、只看两两交互的模型都看不到任何信号。",
    "",
    "**统计查询下界（可以严格化的直觉）.** 统计查询（SQ）算法每次提交一个有界函数 $\\phi(x,y)\\in[-1,1]$，得到 $\\mathbb E[\\phi]$ 的一个误差不超过 $\\tau$ 的估计。写 $\\phi(x,y)=\\phi_0(x)+y\\,\\phi_1(x)$（$y=\\chi_S(x)\\in\\{\\pm1\\}$，$\\lvert\\phi_1\\rvert\\le1$），则 $\\mathbb E[\\phi]=\\mathbb E[\\phi_0]+\\hat\\phi_1(S)$。由 Parseval，$\\sum_T\\hat\\phi_1(T)^2=\\mathbb E[\\phi_1^2]\\le1$，所以至多 $1/\\tau^2$ 个候选集合能让答案偏离“零值” $\\mathbb E[\\phi_0]$ 超过 $\\tau$。对手总回答零值，每次查询至多排除 $1/\\tau^2$ 个候选，于是分辨 $\\binom nk$ 个候选至少要 $\\big(\\binom nk-1\\big)\\tau^2$ 次查询（Blum 等 1994；Kearns 1998）。小批量梯度的每个分量是一个统计查询，批量 $B$ 大致对应 $\\tau\\sim B^{-1/2}$：这就是“梯度方法学 $k$-稀疏奇偶要 $n^{\\Omega(k)}$ 量级计算”的来由。",
    "",
    "**SGD 的实际表现（Barak 等 2022）.** 在小规模实例上，SGD 训练的网络大约在 $n^{O(k)}$ 次迭代时突然学会，接近 SQ 下界；在此之前损失和准确率几乎不动，但初始化处的种群梯度有一个傅里叶“间隙”，网络一直在逐渐放大那 $k$ 个坐标——“隐藏的进步”。可以盯着第一层权重在 $S$ 上与 $S$ 外的范数之比随步数的变化看。",
    "",
    "**不是 SQ 的算法.** 无噪声时这是 $\\mathbb F_2$ 上的线性方程组：约 $n$ 个样本加高斯消元就能解出 $S$，时间 $O(n^3)$。所以这里的难是“梯度 / 统计查询类方法”的难，不是信息论上的难。有噪声（$\\eta>0$）时就是带噪奇偶学习（LPN），一般认为困难；稀疏时可以暴力枚举 $\\binom nk$ 个子集。",
    "",
    "## 参考文献",
    "1. B. Barak, B. L. Edelman, S. Goel, S. Kakade, E. Malach, C. Zhang, Hidden progress in deep learning: SGD learns parities near the computational limit, *NeurIPS* (2022), arXiv:2207.08799.",
    "2. A. Blum, M. Furst, J. Jackson, M. Kearns, Y. Mansour, S. Rudich, Weakly learning DNF and characterizing statistical query learning using Fourier analysis, *STOC* (1994).",
    "3. M. Kearns, Efficient noise-tolerant learning from statistical queries, *J. ACM* 45(6), 983 (1998)."
  ].join("\n")
});

/* ---- 集合函数（项目 87 的任务 A） ---- */
var SET_FNS = { pair: "成对势 Σ_{i<j} exp(−|x_i − x_j|²/2)", max: "最大值 max_i g(x_i)", kth: "第二大的投影 ⟨x_i, u⟩", sum: "可加 Σ_i g(x_i)" };
function setValue(fn, x, n) {
  var i, j, s = 0;
  if (fn === "pair") { for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { var dx = x[2 * i] - x[2 * j], dy = x[2 * i + 1] - x[2 * j + 1]; s += Math.exp(-(dx * dx + dy * dy) / 2); } return s; }
  if (fn === "max") { s = -Infinity; for (i = 0; i < n; i++) s = Math.max(s, Math.sin(x[2 * i]) + Math.cos(x[2 * i + 1])); return s; }
  if (fn === "sum") { for (i = 0; i < n; i++) s += Math.sin(x[2 * i]) + Math.cos(x[2 * i + 1]); return s; }
  var pr = []; for (i = 0; i < n; i++) pr.push((x[2 * i] + x[2 * i + 1]) * Math.SQRT1_2);
  pr.sort(function (a, b) { return b - a; }); return pr[1];
}
reg.add({
  id: "setfn", family: "toy", kind: "regression", plot: "table",
  name: "集合函数（置换不变）", summary: "n 个平面点拼成一行输入，目标只依赖点的集合，与排列顺序无关。",
  params: [
    { key: "npts", label: "点数 n", def: 5, min: 3, max: 8, step: 1, type: "int" },
    { key: "fn", label: "目标函数", def: "pair", type: "select", options: [["pair", "成对势 Σ exp(−|xi−xj|²/2)"], ["max", "最大值 max g(xi)"], ["kth", "第二大的投影"], ["sum", "可加 Σ g(xi)"]] },
    { key: "samples", label: "样本数", def: 3000, min: 200, max: 20000, step: 100, type: "int" },
    { key: "noise", label: "噪声 σ", def: 0, min: 0, max: 1, step: 0.01, type: "num" },
    { key: "trainFrac", label: "训练比例", def: 0.5, min: 0.05, max: 0.95, step: 0.05, type: "num" }
  ],
  split: { by: "custom" },
  gen: function (p, rng) {
    var np = clampI(num(p, "npts", 5), 2, 12), fn = str(p, "fn", "pair"), n = clampI(num(p, "samples", 3000), 10, 200000), sig = clamp(num(p, "noise", 0), 0, 10);
    if (!SET_FNS[fn]) fn = "pair";
    var d = 2 * np, X = new Float64Array(n * d), y = new Float64Array(n), truth = new Float64Array(n), names = [], row = new Float64Array(d), i, r;
    for (i = 0; i < np; i++) names.push("x" + (i + 1), "y" + (i + 1));
    for (r = 0; r < n; r++) { for (i = 0; i < d; i++) row[i] = X[r * d + i] = rng.normal(); truth[r] = setValue(fn, row, np); y[r] = truth[r] + (sig > 0 ? sig * rng.normal() : 0); }
    return { X: X, y: y, n: n, d: d, featureNames: names, truth: truth, splitIdx: fracSplit(n, clamp(num(p, "trainFrac", 0.5), 0.01, 0.99), rng),
      meta: { npts: np, fn: fn, fnName: SET_FNS[fn], noise: sig, layout: "X 的一行 = (x1, y1, x2, y2, …)：第 i 个点是 (x_i, y_i)，各点独立 N(0, I₂)" } };
  },
  oracle: function (p) {
    var np = clampI(num(p, "npts", 5), 2, 12), fn = str(p, "fn", "pair"); if (!SET_FNS[fn]) fn = "pair";
    return { predict: function (x) { return setValue(fn, x, np); }, note: "真函数 f 本身：均方误差只剩噪声 σ²。" };
  },
  bayes: function (p) { var s = clamp(num(p, "noise", 0), 0, 10); return { metric: "mse", value: s * s, note: "f 已知时只剩独立噪声：最优均方误差 = σ²。" }; },
  docs: [
    "**任务.** $n$ 个点 $x_1,\\dots,x_n\\in\\mathbb R^2$ 独立服从 $N(0,I_2)$，拼成一行 $X=(x_1^{(1)},x_1^{(2)},\\dots,x_n^{(1)},x_n^{(2)})\\in\\mathbb R^{2n}$。目标是**集合函数**，与点的排列顺序无关，四选一：",
    "- 成对势 $f=\\sum_{i<j}\\exp(-\\lVert x_i-x_j\\rVert^2/2)$（默认）；",
    "- 最大值 $f=\\max_ig(x_i)$，$g(x)=\\sin x^{(1)}+\\cos x^{(2)}$；",
    "- 第二大的投影 $\\langle x_i,u\\rangle$，$u=(1,1)/\\sqrt2$（排序统计量）；",
    "- 可加 $f=\\sum_ig(x_i)$（最简单的 Deep Sets 形式）。",
    "可选地加噪声 $N(0,\\sigma^2)$。oracle 是真函数，贝叶斯最优均方误差 $=\\sigma^2$；`truth` 是无噪声的 $f$。",
    "",
    "## 置换不变与 Reynolds 算子",
    "$S_n$ 作用在 $(\\mathbb R^2)^n$ 上：$(\\sigma\\cdot x)_i=x_{\\sigma^{-1}(i)}$，数据分布 $\\mu$ 是 $S_n$-不变的。**Reynolds 算子** $(Qf)(x)=\\frac1{n!}\\sum_\\sigma f(\\sigma\\cdot x)$ 是 $L^2(\\mu)$ 上的正交投影，像恰好是不变函数。证明：$Qf$ 不变；$f$ 不变时 $Qf=f$，所以 $Q^2=Q$；由 $\\mu$ 不变，$\\langle Qf,h\\rangle=\\langle f,Qh\\rangle$。",
    "**推论（Elesedy–Zaidi 2021）.** 若 $Y=f^\\star(X)+\\xi$，$f^\\star$ 不变，$\\xi$ 独立、均值 0，则对任何模型 $f$：$\\mathbb E(Y-f(X))^2-\\mathbb E(Y-Qf(X))^2=\\lVert f-Qf\\rVert_\\mu^2\\ge0$。把模型对置换做平均，泛化误差只减不增——但没说减多少。",
    "",
    "## Deep Sets 表示定理",
    "- **Zaheer 等 2017.** 若 $\\mathfrak X$ 可数，$\\mathfrak X$ 的有限子集上的函数 $f$ 置换不变，当且仅当 $f(X)=\\rho\\big(\\sum_{x\\in X}\\phi(x)\\big)$，其中 $\\phi:\\mathfrak X\\to\\mathbb R$。",
    "- **连续情形.** 连续的置换不变函数 $f:[0,1]^M\\to\\mathbb R$ 可以写成 $\\rho\\big(\\sum_{i=1}^M\\phi(x_i)\\big)$，$\\phi:[0,1]\\to\\mathbb R^M$ 与 $\\rho$ 连续，隐空间 $M$ 维就够（Wagstaff 等 2019 的整理）。证明梗概：取 $\\phi(x)=(x,x^2,\\dots,x^M)$；由 Newton 恒等式，幂和与初等对称多项式可以互相多项式表示，后者是 $\\prod_i(t-x_i)$ 的系数，决定根的多重集，所以 $\\Phi=\\sum_i\\phi(x_i)$ 在 $[0,1]^M/S_M$ 上是单射；紧空间上的连续单射是到像上的同胚；令 $\\rho=f\\circ\\Phi^{-1}$，再用 Tietze 定理延拓。",
    "- **限制（Wagstaff 等 2019，定理 4.1）.** 若隐空间维数 $N<M$，则存在连续的置换不变函数 $f:\\mathbb R^M\\to\\mathbb R$，不能写成 $\\rho(\\sum_i\\phi(x_i))$（$\\phi:\\mathbb R\\to\\mathbb R^N$，$\\phi,\\rho$ 连续）。直觉：$\\mathbb R^M/S_M$ 的拓扑维数是 $M$，不能连续单射进 $\\mathbb R^N$。所以 Deep Sets 的隐层宽度至少要和集合大小同阶。",
    "",
    "这些定理只回答“能不能表示”，不回答“要多少样本”。本数据集的点在 $\\mathbb R^2$ 里：次数 $\\le n$ 的多重对称幂和 $\\sum_i(x_i^{(1)})^a(x_i^{(2)})^b$ 生成不变多项式环，但它们有 $\\binom{n+2}{2}-1$ 个。",
    "",
    "## 为什么“样本省 $n!$ 倍”是错的直觉",
    "对称性的样本收益由**维数之比**决定，不是 $\\lvert G\\rvert$。线性回归里可以精确算（Elesedy–Zaidi 2021）：$d$ 维各向同性高斯设计、$m>d+1$ 个样本时，最小二乘的超额风险是 $\\sigma^2d/(m-d-1)$；只在不变子空间（维数 $d_G$）上回归则是 $\\sigma^2d_G/(m-d_G-1)$；达到同一误差所需样本数之比 $\\nearrow d/d_G$。这里 $d=2n$，不变的线性函数只有 $w\\cdot\\sum_ix_i$，$d_G=2$，比值是 $n$ 而不是 $n!$。非线性时，Molien 级数 $\\frac1{\\lvert G\\rvert}\\sum_g\\det(I-tg)^{-1}$ 说明：$k$ 次多项式中“全部 / 不变”的维数之比只在 $k\\to\\infty$ 时才趋于 $\\lvert G\\rvert$，修正项由不动子空间的余维数控制（对换 $(i\\,j)$ 只固定余维 2 的子空间）。有限样本只分辨得了低次部分，学习器看到的“有效群大小”远小于 $n!$：项目 87 的核方法实验里，$n=5$ 时实测的同误差样本比约为 19，而 $n!=120$。",
    "",
    "## 参考文献",
    "1. M. Zaheer, S. Kottur, S. Ravanbakhsh, B. Póczos, R. Salakhutdinov, A. Smola, Deep Sets, *NeurIPS* (2017), arXiv:1703.06114.",
    "2. E. Wagstaff, F. Fuchs, M. Engelcke, I. Posner, M. Osborne, On the limitations of representing functions on sets, *ICML* (2019), arXiv:1901.09006.",
    "3. B. Elesedy, S. Zaidi, Provably strict generalisation benefit for equivariant models, *ICML* (2021)."
  ].join("\n")
});

/* ---- 师生回归 ---- */
function teacherOf(p) {
  // 老师的权重只由 (d, m, gain, tseed) 决定，与数据种子无关：换种子只换样本，不换要学的函数
  var d = clampI(num(p, "dim", 20), 1, 500), m = clampI(num(p, "hidden", 4), 1, 256), gain = clamp(num(p, "gain", 1), 0.01, 20), ts = clampI(num(p, "tseed", 1), 0, 1e9);
  var R = new QL.RNG(ts, 303, 0), W = new Float64Array(m * d), a = new Float64Array(m);
  for (var i = 0; i < m * d; i++) W[i] = R.normal();
  for (var j = 0; j < m; j++) a[j] = R.normal();
  var sd = Math.sqrt(d), sm = Math.sqrt(m);
  return { d: d, m: m, gain: gain, W: W, a: a, f: function (x, off) {
    off = off || 0; var s = 0;
    for (var j2 = 0; j2 < m; j2++) { var z = 0; for (var k = 0; k < d; k++) z += W[j2 * d + k] * x[off + k]; s += a[j2] * Math.tanh(gain * z / sd); }
    return s / sm;
  } };
}
reg.add({
  id: "teacher", family: "toy", kind: "regression", plot: "table",
  name: "师生回归（双下降）", summary: "高斯输入，目标是一个随机两层 tanh 网络的输出加噪声；训练样本数是你直接调的旋钮。",
  params: [
    { key: "dim", label: "输入维数 d", def: 20, min: 1, max: 200, step: 1, type: "int" },
    { key: "hidden", label: "老师的隐藏单元 m", def: 4, min: 1, max: 64, step: 1, type: "int" },
    { key: "gain", label: "非线性强度", def: 1, min: 0.1, max: 5, step: 0.1, type: "num", desc: "tanh(gain · w·x/√d)：越小越接近线性老师" },
    { key: "noise", label: "噪声 σ", def: 0.3, min: 0, max: 2, step: 0.05, type: "num" },
    { key: "nTrain", label: "训练样本数", def: 100, min: 5, max: 5000, step: 5, type: "int" },
    { key: "nValid", label: "验证样本数", def: 200, min: 20, max: 5000, step: 10, type: "int" },
    { key: "nTest", label: "测试样本数", def: 1000, min: 100, max: 20000, step: 100, type: "int" },
    { key: "tseed", label: "老师的种子", def: 1, min: 0, max: 9999, step: 1, type: "int", desc: "决定老师网络的权重；数据种子只决定样本" }
  ],
  split: { by: "custom" },
  gen: function (p, rng) {
    var T = teacherOf(p), d = T.d, sig = clamp(num(p, "noise", 0.3), 0, 10);
    var nTr = clampI(num(p, "nTrain", 100), 1, 100000), nVa = clampI(num(p, "nValid", 200), 1, 100000), nTe = clampI(num(p, "nTest", 1000), 1, 200000), n = nTr + nVa + nTe;
    var X = new Float64Array(n * d), y = new Float64Array(n), truth = new Float64Array(n), names = [], i, r;
    for (i = 0; i < d; i++) names.push("x" + (i + 1));
    for (r = 0; r < n; r++) { for (i = 0; i < d; i++) X[r * d + i] = rng.normal(); truth[r] = T.f(X, r * d); y[r] = truth[r] + (sig > 0 ? sig * rng.normal() : 0); }
    function rg(a, b) { var o = new Int32Array(b - a); for (var q = a; q < b; q++) o[q - a] = q; return o; }
    var vy = 0, my = 0; for (r = 0; r < n; r++) my += truth[r]; my /= n; for (r = 0; r < n; r++) vy += (truth[r] - my) * (truth[r] - my); vy /= n;
    return { X: X, y: y, n: n, d: d, featureNames: names, truth: truth, splitIdx: { train: rg(0, nTr), valid: rg(nTr, nTr + nVa), test: rg(nTr + nVa, n) },
      meta: { dim: d, hidden: T.m, gain: T.gain, noise: sig, W: T.W, a: T.a, signalVar: vy, snr: sig > 0 ? vy / (sig * sig) : Infinity, nTrain: nTr } };
  },
  oracle: function (p) { var T = teacherOf(p); return { predict: function (x) { return T.f(x, 0); }, note: "老师网络本身：均方误差只剩噪声 σ²。" }; },
  bayes: function (p) { var s = clamp(num(p, "noise", 0.3), 0, 10); return { metric: "mse", value: s * s, note: "目标 = 老师 f*(x) + 独立噪声，最优均方误差 = σ²。" }; },
  docs: [
    "**任务.** 输入 $x\\sim N(0,I_d)$，目标 $y=f^\\star(x)+\\sigma\\varepsilon$，老师网络",
    "$$f^\\star(x)=\\frac1{\\sqrt m}\\sum_{j=1}^ma_j\\tanh\\Big(\\gamma\\,\\frac{w_j\\cdot x}{\\sqrt d}\\Big),\\qquad w_j\\sim N(0,I_d),\\quad a_j\\sim N(0,1),$$",
    "$\\gamma$ 是“非线性强度”。老师的权重只由“老师的种子”决定（`meta.W`、`meta.a`），数据种子只决定样本；训练、验证、测试的样本数直接给定，`nTrain` 就是双下降图的横轴。oracle 是 $f^\\star$ 本身，贝叶斯最优均方误差 $=\\sigma^2$；`meta.snr` 是信噪比 $\\operatorname{Var}f^\\star/\\sigma^2$。$\\gamma\\to0$ 时 $f^\\star(x)\\approx\\gamma\\,\\theta\\cdot x$，$\\theta=\\frac1{\\sqrt{md}}\\sum_ja_jw_j$，几乎是线性老师。",
    "",
    "## 双下降",
    "经典的偏差—方差图景说测试误差随模型复杂度先降后升（U 形）。Belkin 等（2019）指出：越过**插值阈值**（模型恰好能把训练集拟合到零误差）之后，如果取最小范数解，测试误差会再次下降，整条曲线是“双下降”。Nakkiran 等（2020）在深度网络上看到它随模型宽度、训练轮数、样本数都会出现。",
    "",
    "**能精确算的例子：线性最小范数回归**（Belkin–Hsu–Xu 2020；Hastie 等 2022）。设 $x\\sim N(0,I_p)$，$y=\\theta\\cdot x+\\sigma\\varepsilon$，$m$ 个样本，$\\hat\\theta=X^+y$（最小范数最小二乘）。超额风险（测试均方误差减 $\\sigma^2$）为",
    "$$\\mathbb E\\lVert\\hat\\theta-\\theta\\rVert^2=\\begin{cases}\\lVert\\theta\\rVert^2\\Big(1-\\dfrac mp\\Big)+\\sigma^2\\dfrac m{p-m-1}, & m\\le p-2,\\\\[2ex]\\sigma^2\\dfrac p{m-p-1}, & m\\ge p+2,\\end{cases}$$",
    "在 $m\\approx p$ 处发散。",
    "**证明梗概.** $m<p$ 时 $\\hat\\theta=P\\theta+\\sigma X^+\\varepsilon$，$P$ 是到 $X$ 的行空间（一个均匀随机的 $m$ 维子空间）的正交投影，偏差 $\\mathbb E\\lVert(I-P)\\theta\\rVert^2=\\lVert\\theta\\rVert^2(1-m/p)$；方差 $\\sigma^2\\,\\mathbb E\\operatorname{tr}(XX^{\\top})^{-1}=\\sigma^2m/(p-m-1)$（逆 Wishart 分布的均值）。$m>p$ 时 $\\hat\\theta$ 无偏，方差用 $\\mathbb E(X^{\\top}X)^{-1}=I/(m-p-1)$。$\\square$",
    "在这个数据集上：取小的 $\\gamma$，对原始 $x$ 做（几乎不加正则的）最小二乘，$p=d$；把 `nTrain` 从 $d/2$ 扫到 $3d$，误差峰出现在 $n_{\\text{train}}\\approx d$，噪声越大峰越高。",
    "",
    "**随机特征回归.** 取 $N$ 个固定的随机特征 $\\phi_k(x)=\\tanh(v_k\\cdot x/\\sqrt d)$，只训练线性读出，岭参数 $\\lambda\\to0$。在 $N,n,d\\to\\infty$ 成比例的极限下，测试误差有精确公式，在 $N=n$（插值阈值）处发散（Mei–Montanari 2022）。固定 `nTrain`、扫特征数 $N$，就是“随模型大小的双下降”；$\\lambda>0$ 会把峰压平，在各向同性的线性回归里，取最优 $\\lambda$ 时曲线单调（Nakkiran 等 2021）。",
    "",
    "## 参考文献",
    "1. M. Belkin, D. Hsu, S. Ma, S. Mandal, Reconciling modern machine-learning practice and the classical bias–variance trade-off, *PNAS* 116(32), 15849 (2019).",
    "2. P. Nakkiran, G. Kaplun, Y. Bansal, T. Yang, B. Barak, I. Sutskever, Deep double descent: where bigger models and more data hurt, *ICLR* (2020), arXiv:1912.02292.",
    "3. M. Belkin, D. Hsu, J. Xu, Two models of double descent for weak features, *SIAM J. Math. Data Sci.* (2020), doi:10.1137/20M1336072.",
    "4. T. Hastie, A. Montanari, S. Rosset, R. J. Tibshirani, Surprises in high-dimensional ridgeless least squares interpolation, *Ann. Statist.* 50(2), 949 (2022).",
    "5. S. Mei, A. Montanari, The generalization error of random features regression: precise asymptotics and the double descent curve, *Comm. Pure Appl. Math.* 75(4), 667 (2022).",
    "6. P. Nakkiran, P. Venkat, S. Kakade, T. Ma, Optimal regularization can mitigate double descent, *ICLR* (2021)."
  ].join("\n")
});

/* ================================================================== *
 *  四、分析工具 QL.mltoy
 * ================================================================== */
/** 把各种形状的嵌入统一成 { R 行, D 列, data(按行) }：{rows, cols, data} | 二维数组 | 一维数组（给出行数） */
function asRows(E, nRows) {
  if (E && E.data && E.rows && E.cols) return { R: E.rows, D: E.cols, data: E.data };
  if (Array.isArray(E) && E.length && typeof E[0] === "object" && E[0] !== null && typeof E[0].length === "number") {
    var R = E.length, D = E[0].length, out = new Float64Array(R * D);
    for (var i = 0; i < R; i++) for (var j = 0; j < D; j++) out[i * D + j] = E[i][j];
    return { R: R, D: D, data: out };
  }
  if (E && typeof E.length === "number" && nRows > 0) return { R: nRows, D: Math.floor(E.length / nRows), data: E };
  throw new Error("嵌入的格式不认识：要 {rows, cols, data}、二维数组，或一维数组加行数。");
}
/** 取出指定的行（order 给出第 k 行用原来的哪一行），按列减去均值，返回 Float64Array(m·D) */
function centered(M, m, order) {
  if (M.R < m) throw new Error("嵌入只有 " + M.R + " 行，少于 " + m + " 个元素。");
  var D = M.D, Z = new Float64Array(m * D), mu = new Float64Array(D), i, j;
  for (i = 0; i < m; i++) { var r = order ? order[i] : i; for (j = 0; j < D; j++) { var v = +M.data[r * D + j]; Z[i * D + j] = v; mu[j] += v; } }
  for (j = 0; j < D; j++) mu[j] /= m;
  for (i = 0; i < m; i++) for (j = 0; j < D; j++) Z[i * D + j] -= mu[j];
  return Z;
}
/** 每个频率的能量占比（返回 energy[k−1]，k = 1..⌊N/2⌋；top = 能量最大的几个频率，topShare 是它们的占比；effective = 1/Σ占比²，"有效频率个数"）：Ê_k = Σ_a e^{−2πika/N} (E_a − Ē)，k 与 N−k 合并（即 cos 与 sin 合并），除以 Σ_{k≠0} |Ê_k|²（= N·Σ_a |E_a − Ē|²，Parseval） */
function fourier(E, N, opts) {
  if (N && typeof N === "object") return fourierFor(E, N);   // 第二个参数也可以直接给数据集的 meta
  opts = opts || {};
  var M = asRows(E, N), D = M.D, Z = centered(M, N, opts.order), pw = new Float64Array(N), a, j, k;
  var cs = new Float64Array(N), sn = new Float64Array(N);
  for (a = 0; a < N; a++) { cs[a] = Math.cos(2 * Math.PI * a / N); sn[a] = Math.sin(2 * Math.PI * a / N); }
  for (k = 1; k < N; k++) {
    var tot = 0;
    for (j = 0; j < D; j++) { var re = 0, im = 0; for (a = 0; a < N; a++) { var t = (k * a) % N, z = Z[a * D + j]; re += z * cs[t]; im -= z * sn[t]; } tot += re * re + im * im; }
    pw[k] = tot;
  }
  var K = Math.floor(N / 2), share = new Float64Array(K), abs = new Float64Array(K), total = 0;
  for (k = 1; k < N; k++) total += pw[k];
  for (k = 1; k <= K; k++) { abs[k - 1] = pw[k] + (N - k !== k ? pw[N - k] : 0); share[k - 1] = total > 0 ? abs[k - 1] / total : 0; }
  var idx = []; for (k = 0; k < K; k++) idx.push(k); idx.sort(function (x, y) { return share[y] - share[x]; });
  var ipr = 0; for (k = 0; k < K; k++) ipr += share[k] * share[k];
  var freqs = new Int32Array(K); for (k = 0; k < K; k++) freqs[k] = k + 1;
  var top = idx.slice(0, Math.min(8, K));
  return { N: N, freqs: freqs, energy: share, abs: abs, total: total, top: top.map(function (q) { return q + 1; }), topShare: top.map(function (q) { return share[q]; }), effective: ipr > 0 ? 1 / ipr : 0, uniform: K ? 1 / K : 0 };
}
/** 按数据集 meta 选对的群阶与行顺序（乘法：按 g⁰, g¹, … 重排） */
function fourierFor(E, meta) {
  if (!meta) throw new Error("需要数据集的 meta");
  if (meta.fourierOrder) return fourier(E, meta.fourierN, { order: meta.fourierOrder });
  if (meta.p) return fourier(E, meta.p);
  if (meta.name && /^C\d+$/.test(meta.name)) return fourier(E, meta.order);
  throw new Error("这个群不是循环群：请用 irrepFVE 按不可约表示分解。");
}
/** 拿到 meta 对应的不可约表示：group 数据集直接带着；modadd 现场造 C_N 的（乘法时按离散对数） */
function irrepsOf(meta) {
  if (meta.irreps) return meta.irreps;
  if (meta.p && meta.exps) return cyclicIrreps(meta.fourierN, meta.exps);
  throw new Error("meta 里没有不可约表示。");
}
/** V_ρ = span{g ↦ ρ(g)_ij} ⊂ ℝ^{|G|} 的正交规范基（复型、四元数型时 d² 个矩阵元线性相关，维数是 d²/frob） */
function isotypicBasis(ir, N) {
  var d = ir.dim, nc = d * d, A = new Float64Array(nc * N);
  for (var g = 0; g < N; g++) for (var c = 0; c < nc; c++) A[c * N + g] = ir.matrices[g * nc + c];
  return orthoBasis(A, N, nc, 1e-9);
}
/** 嵌入（行 = 群元素）按列减去均值后，投影到各个 V_ρ 上的方差占比；随机基线 = dim V_ρ / (|G| − 1)（平凡表示为 0） */
function irrepFVE(E, meta) {
  var irs = irrepsOf(meta), N = meta.order, M = asRows(E, N), D = M.D, Z = centered(M, N), tot = 0, i;
  for (i = 0; i < Z.length; i++) tot += Z[i] * Z[i];
  var names = [], fve = new Float64Array(irs.length), base = new Float64Array(irs.length), dims = new Int32Array(irs.length), types = [];
  irs.forEach(function (ir, q) {
    var Q = isotypicBasis(ir, N), e = 0, triv = ir.dim === 1 && ir.chi.every(function (v) { return Math.abs(v - 1) < 1e-12; });
    for (var b = 0; b < Q.length; b++) for (var j = 0; j < D; j++) { var s = 0; for (var g = 0; g < N; g++) s += Q[b][g] * Z[g * D + j]; e += s * s; }
    names.push(ir.name); fve[q] = tot > 0 ? e / tot : 0; dims[q] = Q.length; base[q] = triv ? 0 : Q.length / (N - 1); types.push(ir.type);
  });
  return { names: names, fve: fve, baseline: base, dims: dims, types: types, total: tot };
}
/** 距离矩阵的群不变性：D(a,b) = |E_a − E_b|，非对角元按 a⁻¹b（左）或 ba⁻¹（右）分组，组均值解释的方差比例 R²。
 *  另给同样大小的高斯随机嵌入（固定种子）作对照 */
function invR2core(Z, N, D, law, inv) {
  var cntL = new Float64Array(N), sumL = new Float64Array(N), cntR = new Float64Array(N), sumR = new Float64Array(N), vals = [], kl = [], kr = [], a, b, j;
  for (a = 0; a < N; a++) for (b = 0; b < N; b++) {
    if (a === b) continue;
    var s = 0; for (j = 0; j < D; j++) { var t = Z[a * D + j] - Z[b * D + j]; s += t * t; }
    var dd = Math.sqrt(s), gl = law[inv[a] * N + b], gr = law[b * N + inv[a]];
    vals.push(dd); kl.push(gl); kr.push(gr); cntL[gl]++; sumL[gl] += dd; cntR[gr]++; sumR[gr] += dd;
  }
  var mu = 0, i; for (i = 0; i < vals.length; i++) mu += vals[i]; mu /= vals.length;
  var sst = 0, ssl = 0, ssr = 0;
  for (i = 0; i < vals.length; i++) { var v = vals[i]; sst += (v - mu) * (v - mu); var el = v - sumL[kl[i]] / cntL[kl[i]], er = v - sumR[kr[i]] / cntR[kr[i]]; ssl += el * el; ssr += er * er; }
  return { left: sst > 0 ? 1 - ssl / sst : 1, right: sst > 0 ? 1 - ssr / sst : 1 };
}
function invarianceR2(E, meta) {
  var N = meta.order, law = meta.law || meta.table, inv = meta.inverse, M = asRows(E, N), D = M.D, Z = centered(M, N);
  var r = invR2core(Z, N, D, law, inv), R = new QL.RNG(20261021, 89, 0), Zr = new Float64Array(N * D);
  for (var i = 0; i < Zr.length; i++) Zr[i] = R.normal();
  var nul = invR2core(Zr, N, D, law, inv);
  return { left: r.left, right: r.right, nullLeft: nul.left, nullRight: nul.right };
}
/** 伊辛交叉温度（与 QL.mlimage.crossover 相同）：按温度平均 P(有序)，找它从上往下穿过 1/2 的位置（线性插值） */
function isingCrossover(probs, T) {
  var n = T.length, two = probs.length === 2 * n, map = {}, keys = [], i;
  for (i = 0; i < n; i++) { var key = (+T[i]).toPrecision(12), v = two ? probs[2 * i + 1] : probs[i]; if (!map[key]) { map[key] = { T: +T[i], s: 0, c: 0 }; keys.push(key); } map[key].s += v; map[key].c++; }
  var rows = keys.map(function (k) { return map[k]; }).sort(function (a, b) { return a.T - b.T; });
  var temps = rows.map(function (r) { return r.T; }), mean = rows.map(function (r) { return r.s / r.c; }), cross = [], down = null;
  for (i = 0; i + 1 < rows.length; i++) {
    var a = mean[i] - 0.5, b = mean[i + 1] - 0.5;
    if (a === 0) cross.push(temps[i]); else if (a * b < 0) cross.push(temps[i] + (temps[i + 1] - temps[i]) * a / (a - b));
    if (down === null && mean[i] >= 0.5 && mean[i + 1] < 0.5) down = a === 0 ? temps[i] : temps[i] + (temps[i + 1] - temps[i]) * a / (a - b);
  }
  if (rows.length && mean[rows.length - 1] === 0.5) cross.push(temps[rows.length - 1]);
  return { Tstar: down !== null ? down : cross.length ? cross[0] : NaN, crossings: cross, temps: temps, mean: mean, count: rows.map(function (r) { return r.c; }) };
}
QL.mltoy = {
  fourier: fourier, fourierFor: fourierFor, irrepFVE: irrepFVE, invarianceR2: invarianceR2, isingCrossover: isingCrossover,
  makeGroup: makeGroup, groupNames: GROUP_NAMES.slice(), isotypicBasis: function (ir, N) { return isotypicBasis(ir, N); },
  primitiveRoot: primitiveRoot, modSetup: modSetup, setValue: setValue, teacher: function (p) { return teacherOf(p || {}); }
};
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_MLDATA_TOY;
