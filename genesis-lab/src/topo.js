// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 多连通宇宙（宇宙拓扑）引擎：空间是平坦的三维环面 T³（或只有一两个方向周期的"烟囱"、"板"），局部和 FLRW 一模一样，整体有限无边。
//   光绕回来：同一个星系在天上出现多次（鬼像），距离 |x + n·L|，n 是整数向量。
//   最后散射面是半径 χ 的球；平移 v 后的像球和原球相交于一个圆：两个背靠背的圆心在 ±v̂，角半径 α = arccos(|v|/2χ)
//   （Cornish–Spergel–Starkman 1998 的"天上的圈"），|v| < 2χ 才有。沿这对圆的 CMB 温度一模一样。
//   CMB 用 Sachs–Wolfe 近似：ΔT/T ∝ Φ，Φ 是基本胞腔上的周期高斯随机场（P_Φ ∝ k^{−3}，标度不变），FFT 生成；
//   天图把 χ 球上的点按周期折回胞腔，三线性插值——所以周期性、鬼像、匹配圆都是"真的"而不是画上去的。
// 单位：长度以最后散射面的共动半径 χ 为 1。
const TOPO = (function () {
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function fft1(re, im, n, inv) {
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2; const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  function fft3(re, im, n, inv) { // 三个方向各做一次
    const tr = new Float64Array(n), ti = new Float64Array(n);
    for (let ax = 0; ax < 3; ax++) { const s = [1, n, n * n][ax]; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const base = ax === 0 ? a * n + b * n * n : (ax === 1 ? a + b * n * n : a + b * n); for (let k = 0; k < n; k++) { tr[k] = re[base + k * s]; ti[k] = im[base + k * s]; } fft1(tr, ti, n, inv); for (let k = 0; k < n; k++) { re[base + k * s] = tr[k]; im[base + k * s] = ti[k]; } } }
  }
  // 基本胞腔上的周期高斯场：胞腔边长 L = [Lx, Ly, Lz]（以 χ 为单位），网格 n³；P(k) ∝ k^{−3}（k ≥ k_min），归一化到单位方差
  const C0 = 4.2, SIG = 0.06; // C0：让 L = 4χ 的天图均方根 ≈ 1（n = 64）
  function field(L, n, seed) {
    n = n || 64; { let p = 1; while (p * 2 <= n) p *= 2; n = p; } // FFT 是基 2 的
    const rnd = mulberry32(seed || 1), re = new Float64Array(n * n * n), im = new Float64Array(n * n * n);
    for (let kz = 0; kz < n; kz++) for (let ky = 0; ky < n; ky++) for (let kx = 0; kx < n; kx++) {
      const ix = kx <= n / 2 ? kx : kx - n, iy = ky <= n / 2 ? ky : ky - n, iz = kz <= n / 2 ? kz : kz - n;
      const k = 2 * Math.PI * Math.hypot(ix / L[0], iy / L[1], iz / L[2]); const idx = kx + ky * n + kz * n * n; if (k === 0) continue;
      // 功率谱固定（不随胞腔大小重新归一）：离散模的幅度 ∝ n³ √(P/V)，常数 C0 让 L → ∞ 时天图的均方根 ≈ 1
      const P = Math.pow(k, -3) * Math.exp(-k * k * SIG * SIG); // 固定的物理平滑（σ = 0.06χ ≈ 3.4°），让结果不依赖网格分辨率
      let u = 0; while (!u) u = rnd(); const g = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * rnd(), amp = C0 * Math.sqrt(P / 2) * g * n * n * n / Math.sqrt(L[0] * L[1] * L[2]);
      re[idx] = amp * Math.cos(th); im[idx] = amp * Math.sin(th);
    }
    fft3(re, im, n, true);
    const f = new Float32Array(re.length); for (let i = 0; i < re.length; i++) f[i] = re[i];
    return { f, n, L };
  }
  // 三线性插值：x 以 χ 为单位（任意实数），按周期折回
  function sample(F, x, y, z) {
    const n = F.n, L = F.L; const u = ((x / L[0]) % 1 + 1) % 1 * n, v = ((y / L[1]) % 1 + 1) % 1 * n, w = ((z / L[2]) % 1 + 1) % 1 * n;
    const i0 = Math.floor(u) % n, j0 = Math.floor(v) % n, k0 = Math.floor(w) % n, i1 = (i0 + 1) % n, j1 = (j0 + 1) % n, k1 = (k0 + 1) % n, fu = u - Math.floor(u), fv = v - Math.floor(v), fw = w - Math.floor(w), f = F.f;
    const c = (i, j, k) => f[i + j * n + k * n * n];
    return (1 - fw) * ((1 - fv) * ((1 - fu) * c(i0, j0, k0) + fu * c(i1, j0, k0)) + fv * ((1 - fu) * c(i0, j1, k0) + fu * c(i1, j1, k0))) + fw * ((1 - fv) * ((1 - fu) * c(i0, j0, k1) + fu * c(i1, j0, k1)) + fv * ((1 - fu) * c(i0, j1, k1) + fu * c(i1, j1, k1)));
  }
  // 全天图：观察者在原点，看半径 χ = 1 的球；等距柱状投影 W×H，方向 n = (sinθcosψ, sinθsinψ, cosθ)
  function sky(F, W, H, out) {
    out = out || new Float32Array(W * H);
    for (let j = 0; j < H; j++) { const th = (j + 0.5) * Math.PI / H, st = Math.sin(th), ct = Math.cos(th); for (let i = 0; i < W; i++) { const ps = -Math.PI + (i + 0.5) * 2 * Math.PI / W; out[j * W + i] = sample(F, st * Math.cos(ps), st * Math.sin(ps), ct); } }
    return out;
  }
  // 匹配圆：所有 |v| < 2 的平移向量 v = (nx Lx, ny Ly, nz Lz)（成对只算一次：取 v 和 −v 中字典序正的那个）；每个方向搜到 |n| ≤ ⌈2/L⌉，一个不漏
  function circles(L) {
    const out = [], N = L.map((l) => Math.min(40, Math.ceil(2 / l)));
    for (let a = -N[0]; a <= N[0]; a++) for (let b = -N[1]; b <= N[1]; b++) for (let c = -N[2]; c <= N[2]; c++) {
      if (!a && !b && !c) continue; if (a < 0 || (a === 0 && b < 0) || (a === 0 && b === 0 && c < 0)) continue;
      const v = [a * L[0], b * L[1], c * L[2]], d = Math.hypot(v[0], v[1], v[2]); if (!(d < 2) || !isFinite(d)) continue;
      out.push({ n: [a, b, c], v, d, alpha: Math.acos(d / 2), dir: v.map((q) => q / d) });
    }
    return out.sort((p, q) => p.d - q.d);
  }
  // 一对匹配圆上的点：圆心方向 ±dir，角半径 α；参数 φ ∈ [0, 2π)。两个圆上对应点在三维里相差 v（所以温度相同）
  function circlePoints(c, m) {
    const d = c.dir, up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; const e1 = cross(d, up), n1 = norm(e1), e2 = cross(d, n1); const A = [], B = [];
    for (let k = 0; k < m; k++) { const ph = 2 * Math.PI * k / m, ca = Math.cos(c.alpha), sa = Math.sin(c.alpha); const p = [0, 1, 2].map((i) => ca * d[i] + sa * (Math.cos(ph) * n1[i] + Math.sin(ph) * e2[i])); A.push(p); B.push([p[0] - c.v[0], p[1] - c.v[1], p[2] - c.v[2]]); }
    return { A, B }; // A 在原球上（|p| = 1），B = A − v 也在原球上（|A − v| = 1），方向是对面那个圆
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return a.map((v) => v / l); }
  // 鬼像（二维环面示意）：星系 (x, y) 的像 (x + iLx, y + jLy)，取距离 < χ 的
  function ghosts(gal, L, chi) {
    const out = []; const imax = Math.ceil(chi / L[0]) + 1, jmax = Math.ceil(chi / L[1]) + 1;
    for (const g of gal) for (let i = -imax; i <= imax; i++) for (let j = -jmax; j <= jmax; j++) { const x = g.x + i * L[0], y = g.y + j * L[1], d = Math.hypot(x, y); if (d < chi) out.push({ x, y, d, g, i, j, direct: i === 0 && j === 0 }); }
    return out;
  }
  // 去掉单极和偶极（真实的 CMB 图也是这样处理的：偶极被我们的运动淹没）；返回减掉的均值，供匹配圆的温度曲线只减均值用
  function removeDipole(S, W, H) {
    const dO = (2 * Math.PI / W) * (Math.PI / H); let mean = 0, tot = 0; const a = [0, 0, 0], c1 = Math.sqrt(3 / (4 * Math.PI));
    for (let j = 0; j < H; j++) { const th = (j + 0.5) * Math.PI / H, w = Math.sin(th) * dO; for (let i = 0; i < W; i++) { mean += S[j * W + i] * w; tot += w; } } mean /= tot;
    for (let j = 0; j < H; j++) { const th = (j + 0.5) * Math.PI / H, w = Math.sin(th) * dO, ct = Math.cos(th), st = Math.sin(th); for (let i = 0; i < W; i++) { const ph = -Math.PI + (i + 0.5) * 2 * Math.PI / W, v = (S[j * W + i] - mean) * w; a[0] += v * c1 * ct; a[1] += v * c1 * st * Math.cos(ph); a[2] += v * c1 * st * Math.sin(ph); } }
    for (let j = 0; j < H; j++) { const th = (j + 0.5) * Math.PI / H, ct = Math.cos(th), st = Math.sin(th); for (let i = 0; i < W; i++) { const ph = -Math.PI + (i + 0.5) * 2 * Math.PI / W; S[j * W + i] -= mean + c1 * (a[0] * ct + a[1] * st * Math.cos(ph) + a[2] * st * Math.sin(ph)); } }
    return { mean, dipole: Math.hypot(a[0], a[1], a[2]) };
  }
  // 低阶多极：全天图在实球谐函数 ℓ = 1, 2, 3 上的功率 C_ℓ = Σ_m a_ℓm²/(2ℓ+1)（胞腔小于视界时大角度功率被截断）
  function lowMultipoles(S, W, H) {
    const Y = (th, ph) => { const c = Math.cos(th), s = Math.sin(th); return [
      [Math.sqrt(3 / (4 * Math.PI)) * c, Math.sqrt(3 / (4 * Math.PI)) * s * Math.cos(ph), Math.sqrt(3 / (4 * Math.PI)) * s * Math.sin(ph)],
      [Math.sqrt(5 / (16 * Math.PI)) * (3 * c * c - 1), Math.sqrt(15 / (4 * Math.PI)) * s * c * Math.cos(ph), Math.sqrt(15 / (4 * Math.PI)) * s * c * Math.sin(ph), Math.sqrt(15 / (16 * Math.PI)) * s * s * Math.cos(2 * ph), Math.sqrt(15 / (16 * Math.PI)) * s * s * Math.sin(2 * ph)],
      [Math.sqrt(7 / (16 * Math.PI)) * (5 * c * c * c - 3 * c), Math.sqrt(21 / (32 * Math.PI)) * s * (5 * c * c - 1) * Math.cos(ph), Math.sqrt(21 / (32 * Math.PI)) * s * (5 * c * c - 1) * Math.sin(ph), Math.sqrt(105 / (16 * Math.PI)) * s * s * c * Math.cos(2 * ph), Math.sqrt(105 / (16 * Math.PI)) * s * s * c * Math.sin(2 * ph), Math.sqrt(35 / (32 * Math.PI)) * s * s * s * Math.cos(3 * ph), Math.sqrt(35 / (32 * Math.PI)) * s * s * s * Math.sin(3 * ph)]]; };
    const a = [[0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]], dO = (2 * Math.PI / W) * (Math.PI / H); let mean = 0, tot = 0;
    for (let j = 0; j < H; j++) { const th = (j + 0.5) * Math.PI / H, w = Math.sin(th) * dO; for (let i = 0; i < W; i++) { mean += S[j * W + i] * w; tot += w; } } mean /= tot;
    for (let j = 0; j < H; j++) { const th = (j + 0.5) * Math.PI / H, w = Math.sin(th) * dO; for (let i = 0; i < W; i++) { const ph = -Math.PI + (i + 0.5) * 2 * Math.PI / W, y = Y(th, ph), v = (S[j * W + i] - mean) * w; for (let l = 0; l < 3; l++) for (let m = 0; m < a[l].length; m++) a[l][m] += v * y[l][m]; } }
    return { C1: a[0].reduce((s, v) => s + v * v, 0) / 3, C2: a[1].reduce((s, v) => s + v * v, 0) / 5, C3: a[2].reduce((s, v) => s + v * v, 0) / 7 };
  }
  return { field, sample, sky, circles, circlePoints, ghosts, lowMultipoles, removeDipole, fft3, mulberry32 };
})();
if (typeof module !== 'undefined') module.exports = TOPO;
