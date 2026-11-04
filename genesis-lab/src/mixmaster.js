// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// Mixmaster（Bianchi IX）宇宙引擎：各向异性的封闭宇宙，三个方向各有一个尺度因子 a、b、c。
//   度规 ds² = −dt² + a²σ₁² + b²σ₂² + c²σ₃²，σᵢ 是 SU(2) 的左不变一形式（dσ₁ = σ₂∧σ₃ 等）。
//   用 BKL 的时间 τ（dt = abc dτ）和 α = ln a、β = ln b、γ = ln c，爱因斯坦方程变成
//     2α'' = (b² − c²)² − a⁴ + M·abc + 2Λ(abc)²   （β、γ 轮换）
//   约束  α'β' + β'γ' + γ'α' = ¼(a⁴ + b⁴ + c⁴) − ½(a²b² + b²c² + c²a²) + M·abc + Λ(abc)²
//   其中 M = 8πGρ₀V₀ 是尘埃的量（ρ ∝ 1/abc），Λ 是宇宙学常数；M = Λ = 0 就是真空的 Mixmaster。
//   各向同性 a = b = c = R/2 时约束退化成封闭 FLRW 的弗里德曼方程（test/mixmaster.test.js 对照）。
//   奇点附近：势能项轮流起作用，宇宙在 Kasner 时代之间跳——指数 (p₁,p₂,p₃)，Σp = Σp² = 1，由 u ≥ 1 参数化：
//     p₁ = −u/(1+u+u²)，p₂ = (1+u)/(1+u+u²)，p₃ = u(1+u)/(1+u+u²)；每次反弹 u → u−1（u ≥ 2）或 1/(u−1)（1 < u < 2）：高斯映射，混沌。
const MIXMASTER = (function () {
  function kasnerFromU(u) { const d = 1 + u + u * u; return [-u / d, (1 + u) / d, u * (1 + u) / d]; } // 升序：p1 < 0 < p2 < p3
  function uFromKasner(p) { const s = p.slice().sort((x, y) => x - y); return s[1] > 1e-12 ? s[2] / s[1] : Infinity; }
  function bklMap(u) { return u >= 2 ? u - 1 : 1 / (u - 1); } // 一次反弹后的 u（u > 1）
  // 右端项
  function rhs(y, M, L) { // y = [α, β, γ, α', β', γ', t]
    const a2 = Math.exp(2 * y[0]), b2 = Math.exp(2 * y[1]), c2 = Math.exp(2 * y[2]), abc = Math.exp(y[0] + y[1] + y[2]), V2 = abc * abc;
    const m = M * abc + 2 * L * V2;
    return [y[3], y[4], y[5], 0.5 * ((b2 - c2) ** 2 - a2 * a2 + m), 0.5 * ((a2 - c2) ** 2 - b2 * b2 + m), 0.5 * ((a2 - b2) ** 2 - c2 * c2 + m), abc];
  }
  function constraint(y, M, L) {
    const a2 = Math.exp(2 * y[0]), b2 = Math.exp(2 * y[1]), c2 = Math.exp(2 * y[2]), abc = Math.exp(y[0] + y[1] + y[2]);
    const lhs = y[3] * y[4] + y[4] * y[5] + y[5] * y[3], rhsV = 0.25 * (a2 * a2 + b2 * b2 + c2 * c2) - 0.5 * (a2 * b2 + b2 * c2 + c2 * a2) + M * abc + L * abc * abc;
    const scale = Math.abs(y[3] * y[4]) + Math.abs(y[4] * y[5]) + Math.abs(y[5] * y[3]) + 0.25 * (a2 * a2 + b2 * b2 + c2 * c2) + 0.5 * (a2 * b2 + b2 * c2 + c2 * a2) + M * abc + Math.abs(L) * abc * abc + 1e-300;
    return { lhs, rhs: rhsV, err: Math.abs(lhs - rhsV) / scale }; // 相对误差：分母是各项绝对值之和（避免相消处虚高）
  }
  // 初始数据：τ = 0 时 a = b = c = a0，速度 = 各向同性部分 s·(1,1,1) + 剪切 q（Σq = 0），s 由约束解出（取膨胀支）
  //   剪切用大小 |q| 和方向角 χ 给：q = |q|·(cos χ, cos(χ+2π/3), cos(χ+4π/3))·√(2/3)
  function initial(o) {
    const a0 = o.a0 || 1, M = o.M || 0, L = o.L || 0, qm = o.shear || 0, chi = o.chi || 0;
    const q = [0, 1, 2].map((k) => qm * Math.sqrt(2 / 3) * Math.cos(chi + k * 2 * Math.PI / 3));
    const y = [Math.log(a0), Math.log(a0), Math.log(a0), 0, 0, 0, 0];
    const c = constraint(y, M, L).rhs; // 约束右端（只和 a,b,c 有关）
    const q2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2], s2 = (c + 0.5 * q2) / 3;
    if (s2 < 0) return null; // 这个 a0 下连静止都不允许（曲率太强）
    const s = Math.sqrt(s2) * (o.contracting ? -1 : 1);
    y[3] = s + q[0]; y[4] = s + q[1]; y[5] = s + q[2];
    return y;
  }
  // 从一个精确的 Kasner 态出发（尺度 a0 很小、势能可忽略）：速度 = λ·pᵢ，p 由 u 给出，perm 指定哪个方向是负指数（0/1/2）
  function initialKasner(o) {
    const a0 = o.a0 || 0.02, u = o.u || 3.7, lam = o.lambda || 1, perm = o.perm || 0, M = o.M || 0, L = o.L || 0;
    const p = kasnerFromU(u), q = [p[perm % 3], p[(perm + 1) % 3], p[(perm + 2) % 3]];
    const y = [Math.log(a0), Math.log(a0), Math.log(a0), lam * q[0], lam * q[1], lam * q[2], 0];
    // 严格满足约束：速度加一个各向同性的小量 ε（Kasner 的 Σpᵢpⱼ = 0，势能项 c 很小）：3ε² + 2λε − c = 0
    const c = constraint(y, M, L).rhs, disc = 4 * lam * lam + 12 * c; if (disc < 0) return null;
    const eps = (-2 * lam + Math.sqrt(disc)) / 6; y[3] += eps; y[4] += eps; y[5] += eps;
    return y;
  }
  // RK4 自适应（步长按右端项大小），向 τ 增大（dir=+1）或减小（dir=−1）积分，直到体积缩到 e^{−lnVmin}、τ 到 tauMax 或步数用尽
  function integrate(y0, o) {
    o = o || {}; const M = o.M || 0, L = o.L || 0, dir = o.dir || 1, tauMax = o.tauMax || 20000, maxSteps = o.maxSteps || 1500000, lnVmin = o.lnVmin || -650, every = o.every || 4;
    let y = y0.slice(), tau = 0, n = 0; const out = { tau: [0], y: [y.slice()], cerr: [constraint(y, M, L).err], stop: null };
    const f = (y) => rhs(y, M, L);
    while (n++ < maxSteps) {
      // 步长：每步 |Δα| ≤ 0.03（势能墙 e^{4α} 每步最多变 e^{0.12}）；墙已经起作用时再细到 |Δα| ≤ 0.002（反弹处的误差会随后来越来越小的速度被放大，所以这里要细）；Kasner 长段里步子放大
      const k1 = f(y); const vel = Math.max(1e-6, Math.abs(y[3]), Math.abs(y[4]), Math.abs(y[5])), acc = Math.max(Math.abs(k1[3]), Math.abs(k1[4]), Math.abs(k1[5]));
      const wall = acc > 1e-7 * vel * vel, sa = Math.sqrt(acc);
      const h = dir * Math.min(o.hMax || 0.5, 0.03 / vel, 0.05 / Math.max(sa, 1e-9), wall ? Math.min(0.002 / vel, 0.005 / Math.max(sa, 1e-9)) : Infinity);
      const y2 = y.map((v, i) => v + 0.5 * h * k1[i]), k2 = f(y2), y3 = y.map((v, i) => v + 0.5 * h * k2[i]), k3 = f(y3), y4 = y.map((v, i) => v + h * k3[i]), k4 = f(y4);
      const ny = y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      if (!ny.every(isFinite)) { out.stop = 'overflow'; break; }
      y = ny; tau += h;
      if (n % every === 0) { out.tau.push(tau); out.y.push(y.slice()); out.cerr.push(constraint(y, M, L).err); }
      const lnV = y[0] + y[1] + y[2];
      if (lnV < lnVmin) { out.stop = 'singularity'; break; }
      if (Math.abs(tau) >= tauMax) { out.stop = 'tauMax'; break; }
      if (lnV > 60) { out.stop = 'big'; break; }
      if (y[0] > 300 || y[1] > 300 || y[2] > 300) { out.stop = 'range'; break; }
    }
    if (!out.stop) out.stop = 'steps';
    if (out.tau[out.tau.length - 1] !== tau) { out.tau.push(tau); out.y.push(y.slice()); out.cerr.push(constraint(y, M, L).err); }
    return out;
  }
  // 完整求解：从 τ = 0 向未来和过去各积一遍；宇宙时 t 以 τ = 0 为零点（y[6]）
  function solve(o) {
    const y0 = o.u ? initialKasner(o) : initial(o); if (!y0) return null;
    const fut = integrate(y0, Object.assign({}, o, { dir: 1 })), past = integrate(y0, Object.assign({}, o, { dir: -1 }));
    // 合并成一条按 τ 递增的轨迹
    const tau = [], Y = [], cerr = [];
    for (let i = past.tau.length - 1; i >= 1; i--) { tau.push(past.tau[i]); Y.push(past.y[i]); cerr.push(past.cerr[i]); }
    for (let i = 0; i < fut.tau.length; i++) { tau.push(fut.tau[i]); Y.push(fut.y[i]); cerr.push(fut.cerr[i]); }
    const R = { tau, y: Y, cerr, y0, pastStop: past.stop, futStop: fut.stop, M: o.M || 0, L: o.L || 0 };
    // 宇宙时：t(τ=0) = 0；大爆炸时刻 tBang = past 端的 t（负），大坍缩 tCrunch = fut 端的 t；体积已缩到 e^{−60} 以下就当作到了奇点（剩下的时间可忽略）
    const lnVend = (br) => { const y = br.y[br.y.length - 1]; return y[0] + y[1] + y[2]; };
    // 各向同性（或接近）的尘埃宇宙在 τ 上走不到奇点（τ → ∞），但体积已缩到 e⁻¹⁵ 以下、还在缩：剩下的宇宙时可以忽略，也当作到了奇点
    const shrinking = (br, sign) => { const y = br.y[br.y.length - 1]; return sign * (y[3] + y[4] + y[5]) > 0; };
    const pastSing = past.stop === 'singularity' || lnVend(past) < -60 || (past.stop === 'tauMax' && lnVend(past) < -15 && shrinking(past, 1)), futSing = fut.stop === 'singularity' || lnVend(fut) < -60 || (fut.stop === 'tauMax' && lnVend(fut) < -15 && shrinking(fut, -1));
    R.pastApprox = pastSing && past.stop === 'tauMax'; R.futApprox = futSing && fut.stop === 'tauMax';
    R.tBang = pastSing ? past.y[past.y.length - 1][6] : NaN; R.tCrunch = futSing ? fut.y[fut.y.length - 1][6] : NaN;
    // 离奇点的时间 T（从大爆炸算起）和 T'（到大坍缩）：从奇点那一端把 abc 累加回来，每个值都是正项之和，不会相消（能一路算到 e^{−500}）
    const n = tau.length, abc = Y.map((y) => Math.exp(y[0] + y[1] + y[2])); R.Tbang = new Float64Array(n); R.Tcrunch = new Float64Array(n);
    { const y = Y[0], s = y[3] + y[4] + y[5]; R.Tbang[0] = s > 0 ? abc[0] / s : 0; for (let i = 1; i < n; i++) R.Tbang[i] = R.Tbang[i - 1] + 0.5 * (abc[i - 1] + abc[i]) * (tau[i] - tau[i - 1]); }
    { const y = Y[n - 1], s = -(y[3] + y[4] + y[5]); R.Tcrunch[n - 1] = s > 0 ? abc[n - 1] / s : 0; for (let i = n - 2; i >= 0; i--) R.Tcrunch[i] = R.Tcrunch[i + 1] + 0.5 * (abc[i + 1] + abc[i]) * (tau[i + 1] - tau[i]); }
    if (!pastSing) R.Tbang = null; if (!futSing) R.Tcrunch = null;
    R.epochs = epochs(R, 'bang'); R.epochsCrunch = epochs(R, 'crunch');
    return R;
  }
  // 瞬时的"速度指数" pᵢ = αᵢ'/(α'+β'+γ')：势能可忽略时就是 Kasner 指数（不需要知道大爆炸时刻）
  function velocityExponents(y) { const s = y[3] + y[4] + y[5]; return Math.abs(s) > 1e-300 ? [y[3] / s, y[4] / s, y[5] / s] : null; }
  // Kasner 指数 pᵢ = d ln aᵢ / d ln T，T 是离奇点的时间（end = 'bang'：从大爆炸算起；'crunch'：到大坍缩，指数取反方向）
  function exponents(R, i, end) {
    const y = R.y[i], crunch = end === 'crunch', T = crunch ? (R.Tcrunch && R.Tcrunch[i]) : (R.Tbang && R.Tbang[i]); if (!(T > 0)) return null; const abc = Math.exp(y[0] + y[1] + y[2]), s = crunch ? -1 : 1;
    return [s * y[3] * T / abc, s * y[4] * T / abc, s * y[5] * T / abc];
  }
  // 时代划分：从奇点那一端往外看，指数几乎不变的一段算一个 Kasner 时代（Σp ≈ 1 且 Σp² ≈ 1 才算真的 Kasner）
  function epochs(R, end) {
    const crunch = end === 'crunch'; if (crunch ? !R.Tcrunch : !R.Tbang) return [];
    const list = []; let cur = null; const N = R.y.length;
    for (let k = 0; k < N; k++) {
      const i = crunch ? N - 1 - k : k;
      const p = exponents(R, i, end); if (!p) continue; const s1 = p[0] + p[1] + p[2], s2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
      const kasner = Math.abs(s1 - 1) < 0.03 && Math.abs(s2 - 1) < 0.06;
      if (!kasner) { if (cur) { cur.iEnd = i - 1; list.push(cur); cur = null; } continue; }
      if (cur && Math.max(Math.abs(p[0] - cur.p[0]), Math.abs(p[1] - cur.p[1]), Math.abs(p[2] - cur.p[2])) < 0.04) { cur.iEnd = i; cur.n++; for (let k = 0; k < 3; k++) cur.sum[k] += p[k]; cur.p = cur.sum.map((v) => v / cur.n); }
      else { if (cur) list.push(cur); cur = { iStart: i, iEnd: i, p: p.slice(), sum: p.slice(), n: 1 }; }
    }
    if (cur) list.push(cur);
    const T = crunch ? R.Tcrunch : R.Tbang;
    // 一个时代至少要跨 ln T 的 5（并且有 12 个以上采样点）：两次反弹之间指数恰好路过 Σp² ≈ 1 的过渡段只跨 2–3，不算时代
    const out = list.map((e) => { const l0 = Math.log(T[e.iStart]), l1 = Math.log(T[e.iEnd]); return { iStart: Math.min(e.iStart, e.iEnd), iEnd: Math.max(e.iStart, e.iEnd), p: e.p, u: uFromKasner(e.p), growing: e.p.indexOf(Math.max(...e.p)), shrinking: e.p.indexOf(Math.min(...e.p)), lnt0: Math.min(l0, l1), lnt1: Math.max(l0, l1), n: e.n }; }).filter((e) => e.n >= 12 && e.lnt1 - e.lnt0 > 5);
    return out;
  }
  return { kasnerFromU, uFromKasner, bklMap, rhs, constraint, initial, initialKasner, integrate, solve, velocityExponents, exponents, epochs };
})();
if (typeof module !== 'undefined') module.exports = MIXMASTER;
