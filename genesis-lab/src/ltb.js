// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// LTB（Lemaître–Tolman–Bondi）空洞宇宙引擎：球对称、不均匀的尘埃宇宙，没有暗能量。
//   度规 ds² = −dt² + R'²/(1+2E) dr² + R² dΩ²，每个壳层 r 各自按 Ṙ² = 2M(r)/R + 2E(r) 演化（和弗里德曼方程一样，但 M、E 随 r 变）。
//   规范：今天 R(t₀, r) = r；大爆炸时刻处处相同（t_B = 0，只留增长模）。
//   给定今天的物质份额剖面 Ω_M(r)（中心 Ω_in，远处 Ω_out，半径 r₀，过渡宽度 Δr；García-Bellido & Haugbølle 2008 的形式），
//   同时大爆炸的要求定出 H₀(r) = F(Ω_M(r))/t₀，t₀ = F(Ω_out)/H_out；于是 M = ½Ω_M H₀² r³，E = ½(1−Ω_M) H₀² r²。
//   壳层解析解：E>0 时 R = (M/2E)(cosh η − 1)，t = M(sinh η − η)/(2E)^{3/2}；E=0 时 R = (9M/2)^{1/3} t^{2/3}；E<0 用 cos。
//   中心观察者的径向光线：dt/dr = −R'/√(1+2E)，dz/dr = (1+z) Ṙ'/√(1+2E)；角直径距离 D_A = R(t, r)，D_L = (1+z)² D_A。
// 单位：c = 1，长度 Mpc，时间 Mpc（1 Mpc/c = 3.26 Myr），H 以 Mpc⁻¹ 计（km/s/Mpc ÷ 299792.458）。
const LTB = (function () {
  const CKMS = 299792.458, MPC_MYR = 3.2616;
  // 均匀尘埃宇宙的年龄 × H₀：F(Ω)
  function F(O) {
    if (Math.abs(O - 1) < 1e-9) return 2 / 3;
    if (O < 1) { const k = 1 - O; return 1 / k - O / Math.pow(k, 1.5) * Math.asinh(Math.sqrt(k / O)); }
    const k = O - 1; return O / Math.pow(k, 1.5) * Math.asin(Math.sqrt(k / O)) - 1 / k;
  }
  // 某个壳层：给 M、E、t 求 R（Newton 解参数 η）
  function shellR(M, E, t) {
    if (!(M > 0)) return 0;
    if (Math.abs(E) < 1e-12 * Math.pow(M, 2 / 3)) return Math.cbrt(4.5 * M * t * t); // 抛物（EdS）
    if (E > 0) {
      const K = t * Math.pow(2 * E, 1.5) / M; // sinh η − η = K
      let eta = K < 1 ? Math.cbrt(6 * K) : Math.log(2 * K + 2); // 初值
      for (let i = 0; i < 60; i++) { const f = Math.sinh(eta) - eta - K, d = Math.cosh(eta) - 1; if (d < 1e-300) break; const step = f / d; eta -= step; if (Math.abs(step) < 1e-13 * Math.max(1, eta)) break; }
      return M / (2 * E) * (Math.cosh(eta) - 1);
    }
    const e = -E, K = t * Math.pow(2 * e, 1.5) / M; // η − sin η = K（闭壳层，膨胀段 η < π）
    let eta = K < 1 ? Math.cbrt(6 * K) : Math.PI / 2;
    for (let i = 0; i < 60; i++) { const f = eta - Math.sin(eta) - K, d = 1 - Math.cos(eta); if (d < 1e-300) break; const step = f / d; eta -= step; if (Math.abs(step) < 1e-13) break; }
    return M / (2 * e) * (1 - Math.cos(eta));
  }
  // 模型：par = { Hout(km/s/Mpc), Oin, Oout, r0(Mpc), dr(Mpc) }
  function model(par) {
    const Hout = (par.Hout || 50) / CKMS, Oin = par.Oin === undefined ? 0.13 : par.Oin, Oout = par.Oout === undefined ? 1 : par.Oout, r0 = par.r0 || 2500, dr = par.dr || 600;
    const t0 = F(Oout) / Hout; // 年龄（Mpc）
    const OmegaM = (r) => Oout + (Oin - Oout) * (1 - Math.tanh((r - r0) / (2 * dr))) / (1 + Math.tanh(r0 / (2 * dr)));
    const H0 = (r) => F(OmegaM(r)) / t0;
    const Mf = (r) => 0.5 * OmegaM(r) * H0(r) ** 2 * r ** 3, Ef = (r) => 0.5 * (1 - OmegaM(r)) * H0(r) ** 2 * r * r;
    const R = (t, r) => shellR(Mf(r), Ef(r), t);
    const Rdot = (t, r) => { const Rv = R(t, r); return Rv > 0 ? Math.sqrt(Math.max(0, 2 * Mf(r) / Rv + 2 * Ef(r))) : 0; };
    const h = (r) => Math.max(1e-3, 1e-4 * r);
    const Rp = (t, r) => (R(t, r + h(r)) - R(t, Math.max(0, r - h(r)))) / (r + h(r) - Math.max(0, r - h(r)));
    const Rdotp = (t, r) => (Rdot(t, r + h(r)) - Rdot(t, Math.max(0, r - h(r)))) / (r + h(r) - Math.max(0, r - h(r)));
    // 今天的密度（相对远处）：8πGρ = 2M'/(R²R')，今天 R = r、R' = 1 → ρ ∝ M'/r²
    const Mp = (r) => (Mf(r + h(r)) - Mf(Math.max(1e-6, r - h(r)))) / (r + h(r) - Math.max(1e-6, r - h(r)));
    const rhoRel = (r) => { const far = 1.5 * Oout * Hout * Hout; return r < 1e-6 ? Mp(1e-3) / (1e-3 * 1e-3) / far : Mp(r) / (r * r) / far; };
    return { par: { Hout: par.Hout || 50, Oin, Oout, r0, dr }, Hout, t0, t0Gyr: t0 * MPC_MYR / 1000, OmegaM, H0, Hkms: (r) => H0(r) * CKMS, M: Mf, E: Ef, R, Rdot, Rp, Rdotp, rhoRel,
      Hpar: (r) => Rdotp(t0, r) / Rp(t0, r) * CKMS, // 今天的径向膨胀率 Ṙ'/R'（km/s/Mpc）
      Hperp: (r) => H0(r) * CKMS };
  }
  // 中心观察者的径向光线（向过去追）：输出 r, t, z, DA, DL（Mpc）
  function ray(mod, opts) {
    opts = opts || {}; const rMax = opts.rMax || 9000, dr = opts.dr || 2; const out = { r: [0], t: [mod.t0], z: [0], DA: [0], DL: [0] };
    let t = mod.t0, z = 0, r = 0;
    const f = (r, t, z) => { const rr = Math.max(r, 1e-3), E = mod.E(rr), s = Math.sqrt(1 + 2 * E), Rp = mod.Rp(t, rr), Rdp = mod.Rdotp(t, rr); return [-Rp / s, (1 + z) * Rdp / s]; };
    while (r < rMax && t > 0.02 * mod.t0) {
      const k1 = f(r, t, z), k2 = f(r + dr / 2, t + dr / 2 * k1[0], z + dr / 2 * k1[1]), k3 = f(r + dr / 2, t + dr / 2 * k2[0], z + dr / 2 * k2[1]), k4 = f(r + dr, t + dr * k3[0], z + dr * k3[1]);
      t += dr / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); z += dr / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); r += dr;
      if (!(t > 0)) break;
      const DA = mod.R(t, r); out.r.push(r); out.t.push(t); out.z.push(z); out.DA.push(DA); out.DL.push((1 + z) * (1 + z) * DA);
      if (z > (opts.zMax || 6)) break;
    }
    return out;
  }
  function interp(xs, ys, x) { if (x <= xs[0]) return ys[0]; const n = xs.length; if (x >= xs[n - 1]) return ys[n - 1]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; } const u = (x - xs[lo]) / (xs[hi] - xs[lo]); return ys[lo] + (ys[hi] - ys[lo]) * u; }
  // 平坦 FLRW 的光度距离（Mpc）：H0 km/s/Mpc，Ω_Λ = 1 − Ω_m
  function dlFlat(H0, OL, z) { const Om = 1 - OL, n = 200; let s = 0; for (let i = 0; i <= n; i++) { const zz = z * i / n, e = Math.sqrt(Om * (1 + zz) ** 3 + OL), w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); s += w / e; } return (1 + z) * CKMS / H0 * s * (z / n) / 3; }
  // 把 LTB 的哈勃图当成平坦 FLRW 来拟合：在 z ∈ [zlo, zhi] 上最小化距离模数残差；返回"你以为的" H₀ 和 Ω_Λ
  function fitFLRW(ry, zlo, zhi) {
    zlo = zlo || 0.02; zhi = zhi || 1.2; const zs = []; for (let i = 0; i < 40; i++) zs.push(zlo * Math.pow(zhi / zlo, i / 39));
    const mu = zs.map((z) => 5 * Math.log10(interp(ry.z, ry.DL, z)) + 25);
    let best = null;
    for (let OL = 0; OL <= 0.95; OL += 0.01) { // 对每个 Ω_Λ，H₀ 只是整体平移，解析求最优
      const m1 = zs.map((z) => 5 * Math.log10(dlFlat(70, OL, z)) + 25); let d = 0; for (let i = 0; i < zs.length; i++) d += mu[i] - m1[i]; d /= zs.length; // 平均残差 = −5 log10(H0/70)
      let chi = 0; for (let i = 0; i < zs.length; i++) chi += (mu[i] - m1[i] - d) ** 2;
      if (!best || chi < best.chi) best = { OL, H0: 70 * Math.pow(10, -d / 5), chi, rms: Math.sqrt(chi / zs.length) };
    }
    return best;
  }
  // 偏离中心 d（Mpc）的观察者看到的 CMB 偶极（准牛顿估计）：ΔT/T ≈ [H(d) − H_out]·d / c
  function dipole(mod, d) { return (mod.Hkms(d) - mod.par.Hout) * d / CKMS; }
  return { CKMS, MPC_MYR, F, shellR, model, ray, interp, dlFlat, fitFLRW, dipole };
})();
if (typeof module !== 'undefined') module.exports = LTB;
