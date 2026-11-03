// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 结构形成的 N 体模拟（二维粒子-网格法）：在你拨的宇宙背景 a(t) 里，粒子真的互相吸引，纤维、空洞、星系团从微小涨落里长出来。
//   共动坐标 x，正则动量 p = a² dx/dt；泊松方程 ∇²φ = (3/2) H0² Ω_m δ / a（共动梯度）；dp/dt = −∇φ，dx/dt = p/a²。
//   时间步在宇宙时 t 上走（而不是 a），所以大坍缩的回转和收缩段也能算。
//   泊松方程用 FFT 在周期网格上解；密度用云中格（CIC）撒到网格、力用同样的核插回粒子。
//   初条件：Zel'dovich 近似——按 P(k) = A k^{n_s} T²(k)（BBKS 转移函数，Γ = Ω_m h e^{−Ω_b(1+√(2h)/Ω_m)}）生成高斯场，
//   幅度定标到 a_i 时 8 h⁻¹Mpc 平滑后的 δ 均方根（创世台把线性增长算出的 δ₈(a_i) 传进来，量子版的 A_s 倍数已含在内）。
//   二维是三维宇宙的一个薄片近似：线性增长方程在二维完全相同，非线性的纤维-空洞形态定性相同。
// 单位：长度 = 盒子边长（共动，默认 300 h⁻¹Mpc），时间 = 1/H0。
const NBODY = (function () {
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // ---------- FFT（基 2，就地，复数分开存）----------
  function fft1(re, im, n, inv) {
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2; const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  function fft2(re, im, N, inv) { // 行、列各做一次
    const tr = new Float64Array(N), ti = new Float64Array(N);
    for (let y = 0; y < N; y++) { const o = y * N; for (let x = 0; x < N; x++) { tr[x] = re[o + x]; ti[x] = im[o + x]; } fft1(tr, ti, N, inv); for (let x = 0; x < N; x++) { re[o + x] = tr[x]; im[o + x] = ti[x]; } }
    for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) { tr[y] = re[y * N + x]; ti[y] = im[y * N + x]; } fft1(tr, ti, N, inv); for (let y = 0; y < N; y++) { re[y * N + x] = tr[y]; im[y * N + x] = ti[y]; } }
  }
  // BBKS 转移函数（k 以 h/Mpc 计）
  function bbks(k, Gamma) { const q = k / Gamma; if (q <= 0) return 1; return Math.log(1 + 2.34 * q) / (2.34 * q) * Math.pow(1 + 3.89 * q + (16.1 * q) ** 2 + (5.46 * q) ** 3 + (6.71 * q) ** 4, -0.25); }

  function pow2(n) { let p = 1; while (p * 2 <= n) p *= 2; return (n - p < p * 2 - n) ? p : p * 2; } // 最近的 2 的幂（FFT 是基 2 的）

  class PM2D {
    // o: { N 网格（取为 2 的幂）, np 每边粒子数, L 盒长 h⁻¹Mpc, seed, Om, Ob, h, ns, aInit,
    //      amp: a_init 时 8 h⁻¹Mpc 平滑后的 δ 均方根（给了就用它；否则 sigma8 × Dratio），E: a→E(a), aOf: t→a, tOf: a→t }
    constructor(o) {
      this.o = o; const N = this.N = pow2(o.N || 256), np = this.np = o.np || 160, n = this.n = np * np;
      this.L = o.L || 300; this.x = new Float64Array(n); this.y = new Float64Array(n); this.px = new Float64Array(n); this.py = new Float64Array(n);
      this.rho = new Float64Array(N * N); this.fx = new Float64Array(N * N); this.fy = new Float64Array(N * N);
      this.re = new Float64Array(N * N); this.im = new Float64Array(N * N);
      this.init();
    }
    init() {
      const o = this.o, N = this.N, np = this.np, rnd = mulberry32(o.seed || 7), L = this.L;
      // 高斯场 δ_k：|δ_k|² ∝ P(k)，相位随机；用 Box–Muller
      const re = this.re, im = this.im, Gamma = o.Om * o.h * Math.exp(-o.Ob * (1 + Math.sqrt(2 * o.h) / o.Om)), ns = o.ns === undefined ? 0.965 : o.ns;
      const kf = 2 * Math.PI / L; // 基频 h/Mpc
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const kx = (i <= N / 2 ? i : i - N) * kf, ky = (j <= N / 2 ? j : j - N) * kf, k = Math.hypot(kx, ky), idx = j * N + i;
        if (k === 0) { re[idx] = 0; im[idx] = 0; continue; }
        const P = Math.pow(k, ns) * bbks(k, Gamma) ** 2 * k; // 二维薄片：多乘一个 k（三维 P(k) 投影到二维平面的近似）
        let u = 0; while (!u) u = rnd(); const g = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * rnd();
        const amp = Math.sqrt(P / 2) * g; re[idx] = amp * Math.cos(th); im[idx] = amp * Math.sin(th);
      }
      // 实空间场 → 用 8 h⁻¹Mpc 高斯平滑后的 rms 定标到 σ₈ × D(a_i)/D(1)
      const dk = new Float64Array(re), dki = new Float64Array(im);
      const sm = new Float64Array(N * N), smi = new Float64Array(N * N); const R = 8;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const kx = (i <= N / 2 ? i : i - N) * kf, ky = (j <= N / 2 ? j : j - N) * kf, w = Math.exp(-0.5 * (kx * kx + ky * ky) * R * R), idx = j * N + i; sm[idx] = re[idx] * w; smi[idx] = im[idx] * w; }
      fft2(sm, smi, N, true); let s2 = 0; for (let k = 0; k < N * N; k++) s2 += sm[k] * sm[k]; const rms = Math.sqrt(s2 / (N * N));
      const target = o.amp !== undefined ? o.amp : (o.sigma8 || 0.81) * (o.Dratio || 1), scale = target / (rms || 1);
      for (let k = 0; k < N * N; k++) { dk[k] *= scale; dki[k] *= scale; }
      // 初始的实空间 δ 场（线性，a_init 时），给页面画 N 体开始之前的线性阶段
      { const d0 = new Float64Array(dk), d0i = new Float64Array(dki); fft2(d0, d0i, N, true); this.delta0 = new Float32Array(N * N); for (let k = 0; k < N * N; k++) this.delta0[k] = d0[k]; }
      // Zel'dovich 位移 ψ = −∇∇⁻²δ：ψ_k = −i k δ_k / k²（分量）
      const psx = new Float64Array(N * N), psxi = new Float64Array(N * N), psy = new Float64Array(N * N), psyi = new Float64Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const kx = (i <= N / 2 ? i : i - N) * kf, ky = (j <= N / 2 ? j : j - N) * kf, k2 = kx * kx + ky * ky, idx = j * N + i; if (k2 === 0) continue;
        // −i k δ/k²：(a+ib)(−i) = b − ia
        psx[idx] = kx * dki[idx] / k2; psxi[idx] = -kx * dk[idx] / k2; psy[idx] = ky * dki[idx] / k2; psyi[idx] = -ky * dk[idx] / k2;
      }
      fft2(psx, psxi, N, true); fft2(psy, psyi, N, true); // 单位 h⁻¹Mpc
      const a0 = o.aInit || 0.02, E0 = o.E(a0), f = 1; // 早期物质主导 f = dlnD/dlna ≈ 1
      for (let j = 0; j < np; j++) for (let i = 0; i < np; i++) {
        const q = j * np + i, qx = (i + 0.5) / np, qy = (j + 0.5) / np; // 格点（盒子单位）
        const gx = Math.floor(qx * N), gy = Math.floor(qy * N), g = gy * N + gx; const dx = psx[g] / L, dy = psy[g] / L; // 位移（盒子单位；δ 已含 D(a_i)）
        this.x[q] = ((qx + dx) % 1 + 1) % 1; this.y[q] = ((qy + dy) % 1 + 1) % 1;
        this.px[q] = a0 * a0 * E0 * f * dx; this.py[q] = a0 * a0 * E0 * f * dy; // p = a² ẋ = a² H f D ψ
      }
      this.a = a0; this.t = o.tOf(a0); this.steps = 0; this.deposit();
    }
    deposit() { // CIC：rho 是每格的粒子数相对平均值（1 + δ）
      const N = this.N, rho = this.rho; rho.fill(0); const n = this.n, w0 = N * N / n;
      for (let q = 0; q < n; q++) {
        const X = this.x[q] * N - 0.5, Y = this.y[q] * N - 0.5, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j;
        const i0 = ((i % N) + N) % N, i1 = (i0 + 1) % N, j0 = ((j % N) + N) % N, j1 = (j0 + 1) % N;
        rho[j0 * N + i0] += w0 * (1 - fx) * (1 - fy); rho[j0 * N + i1] += w0 * fx * (1 - fy); rho[j1 * N + i0] += w0 * (1 - fx) * fy; rho[j1 * N + i1] += w0 * fx * fy;
      }
    }
    forces() { // ∇²φ = (3/2) Ω_m δ / a（盒子单位，H0 = 1）→ φ_k = −(3/2 Ω_m/a) δ_k / k²；力 = −∇φ（中心差分）
      const N = this.N, re = this.re, im = this.im, L = this.L; for (let k = 0; k < N * N; k++) { re[k] = this.rho[k] - 1; im[k] = 0; }
      fft2(re, im, N, false); const kf = 2 * Math.PI, C = -1.5 * this.o.Om / this.a; // k 以盒子单位（2π/L 的倍数 → 这里 L = 1）
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const kx = (i <= N / 2 ? i : i - N) * kf, ky = (j <= N / 2 ? j : j - N) * kf, k2 = kx * kx + ky * ky, idx = j * N + i; if (k2 === 0) { re[idx] = 0; im[idx] = 0; continue; } const s = C / k2; re[idx] *= s; im[idx] *= s; }
      fft2(re, im, N, true); // re = φ（盒子单位）
      const h = 1 / N, fx = this.fx, fy = this.fy;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const ip = (i + 1) % N, im1 = (i + N - 1) % N, jp = (j + 1) % N, jm = (j + N - 1) % N; fx[j * N + i] = -(re[j * N + ip] - re[j * N + im1]) / (2 * h); fy[j * N + i] = -(re[jp * N + i] - re[jm * N + i]) / (2 * h); }
    }
    kick(dt) { // dp/dt = −∇φ（p = a²ẋ，φ 是共动坐标里的扰动势），CIC 插值
      const N = this.N, n = this.n, fx = this.fx, fy = this.fy, s = dt;
      for (let q = 0; q < n; q++) {
        const X = this.x[q] * N - 0.5, Y = this.y[q] * N - 0.5, i = Math.floor(X), j = Math.floor(Y), ux = X - i, uy = Y - j;
        const i0 = ((i % N) + N) % N, i1 = (i0 + 1) % N, j0 = ((j % N) + N) % N, j1 = (j0 + 1) % N;
        const w00 = (1 - ux) * (1 - uy), w10 = ux * (1 - uy), w01 = (1 - ux) * uy, w11 = ux * uy;
        this.px[q] += s * (fx[j0 * N + i0] * w00 + fx[j0 * N + i1] * w10 + fx[j1 * N + i0] * w01 + fx[j1 * N + i1] * w11);
        this.py[q] += s * (fy[j0 * N + i0] * w00 + fy[j0 * N + i1] * w10 + fy[j1 * N + i0] * w01 + fy[j1 * N + i1] * w11);
      }
    }
    drift(dt) { const s = dt / (this.a * this.a), n = this.n; for (let q = 0; q < n; q++) { this.x[q] = (((this.x[q] + s * this.px[q]) % 1) + 1) % 1; this.y[q] = (((this.y[q] + s * this.py[q]) % 1) + 1) % 1; } }
    // 一步：kick-drift-kick，dt 按 |H| 自适应（a 由背景 t→a 给出，回转和收缩都能走）
    step(dtMax) {
      const o = this.o, E = Math.abs(o.E(this.a)) || 1e-3, dt = Math.min(dtMax || 0.05, 0.02 / E);
      this.deposit(); this.forces(); this.kick(dt / 2);
      const aMid = o.aOf(this.t + dt / 2); this.a = aMid > 0 ? aMid : this.a; this.drift(dt);
      this.t += dt; const a1 = o.aOf(this.t); this.a = a1 > 0 ? a1 : this.a;
      this.deposit(); this.forces(); this.kick(dt / 2); this.steps++;
      return dt;
    }
    // 快照：log10(1+δ) 从 −1 到 +2.5 量化成一个字节（给页面存每一帧用），并返回最密格子和 δ 的均方根
    snapshot(out) {
      const N2 = this.N * this.N, rho = this.rho; this.deposit(); let max = 0, s2 = 0;
      for (let k = 0; k < N2; k++) { const r = rho[k]; if (r > max) max = r; const d = r - 1; s2 += d * d; out[k] = Math.max(0, Math.min(255, Math.round((Math.log10(Math.max(r, 1e-3)) + 1) / 3.5 * 255))); }
      return { max, rms: Math.sqrt(s2 / N2) };
    }
    // 诊断：δ 的 rms（8 h⁻¹Mpc 高斯平滑）
    sigma8() {
      const N = this.N, re = this.re, im = this.im; this.deposit(); for (let k = 0; k < N * N; k++) { re[k] = this.rho[k] - 1; im[k] = 0; }
      fft2(re, im, N, false); const kf = 2 * Math.PI / this.L, R = 8;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const kx = (i <= N / 2 ? i : i - N) * kf, ky = (j <= N / 2 ? j : j - N) * kf, w = Math.exp(-0.5 * (kx * kx + ky * ky) * R * R), idx = j * N + i; re[idx] *= w; im[idx] *= w; }
      fft2(re, im, N, true); let s2 = 0; for (let k = 0; k < N * N; k++) s2 += re[k] * re[k]; return Math.sqrt(s2 / (N * N));
    }
  }
  return { PM2D, fft2, bbks };
})();
if (typeof module !== 'undefined') module.exports = NBODY;
