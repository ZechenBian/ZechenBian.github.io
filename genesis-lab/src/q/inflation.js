// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 暴胀的量子涨落（量子版）：由观测到的原初扰动幅度 A_s、谱指数 n_s 和张标比 r 反推暴胀的能标与量子涨落。
//   A_s = H²/(8π² ε M_Pl²)，r = 16ε，n_s − 1 = 2η − 6ε（慢滚）；V^{1/4} = (3π² A_s r/2)^{1/4} M_Pl，H = π M_Pl √(A_s r/2)
//   德西特温度 T_GH = ħH/(2πk_B)，场的量子涨落每个哈勃时间 δφ = H/2π——这就是星系的种子。
//   结构尺度的归一化：σ(M) ∝ √A_s，谱倾斜让小尺度相对 8 h⁻¹Mpc 变化 (M/M₈)^{−Δn_s/6}。
const INFLATION = (function () {
  const MPL_RED = 2.435e18, KB = 8.617333262e-14, HBAR = 6.582119569e-25; // GeV
  const AS0 = 2.1e-9, NS0 = 0.965, M8 = 2.8e14, M_GAL = 1e12, M_FIRST = 1e8; // M☉
  function derive(As, ns, r, N) {
    N = N || 60; const eps = r / 16, eta = ((ns - 1) + 6 * eps) / 2;
    const H = Math.PI * MPL_RED * Math.sqrt(As * r / 2), V4 = Math.pow(1.5 * Math.PI * Math.PI * As * r, 0.25) * MPL_RED;
    const Hs = H / HBAR, tInf = N / Hs, TGH = H / (2 * Math.PI) / KB, dphi = H / (2 * Math.PI);
    return { eps, eta, H, Hs, V4, tInf, TGH, dphi, N, Treh: 0.3 * V4 };
  }
  // 三个尺度的 σ 倍数（相对 Planck 宇宙）
  function sigScale(As, ns) { const amp = Math.sqrt(As / AS0), dn = ns - NS0; return { first: amp * Math.pow(M_FIRST / M8, -dn / 6), gal: amp * Math.pow(M_GAL / M8, -dn / 6), c8: amp }; }
  // 终态：永远加速的宇宙的德西特温度
  function deSitterT(Hinf_s) { return HBAR * Hinf_s / (2 * Math.PI) / KB; }
  return { AS0, NS0, derive, sigScale, deSitterT, MPL_RED };
})();
if (typeof module !== 'undefined') module.exports = INFLATION;
