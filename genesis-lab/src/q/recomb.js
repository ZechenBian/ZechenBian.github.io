// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 复合与光子退耦（量子版）：氢原子的 Saha 平衡 + 汤姆孙散射率与膨胀率的比较 + 声学视界。
//   Saha：x_e²/(1−x_e) = (1/n_H)(m_e T/2π)^{3/2} e^{−B/T}，B = α² m_e c²/2 = 13.6 eV × (α/α₀)²(m_e/m_e₀)
//   退耦：n_e σ_T c = H，σ_T = (8π/3)(αħ/m_e c)² ∝ α²/m_e²
//   平衡近似比完整的 Peebles 三能级计算早约 4%（真实的 z_* = 1090）；页面上标明。
//   声学视界：r_s = ∫ c_s dt/a，c_s² = c²/(3(1+R))，R = 3ρ_b/4ρ_γ。
const RECOMB = (function () {
  const KB = 8.617333262e-14, ZETA3 = 1.2020569031595942, ME = 0.51099895e-3, B0 = 13.605693e-9; // GeV
  const SIGMA_T0 = 6.6524587e-25, C_CM = 2.99792458e10, HBAR = 6.582119569e-25, MPC_CM = 3.0857e24;
  const GEV3_CM3 = Math.pow(1 / 1.97327e-14, 3); // 1 GeV³ = 1.3e41 cm⁻³
  // 参数：m（cosmo.norm 的结果，含 T0、Or、Om…）、Ob、Yp、alpha（相对倍数）、me（相对倍数）
  function run(m, par) {
    par = par || {}; const Ob = par.Ob === undefined ? 0.049 : par.Ob, Yp = par.Yp === undefined ? 0.247 : par.Yp, al = par.alpha || 1, mer = par.me || 1;
    const T0 = m.T0 * KB, h = m.H0 / 100, B = B0 * al * al * mer, me = ME * mer, sigT = SIGMA_T0 * al * al / (mer * mer);
    // 重子-光子比：n_b0 = Ω_b ρ_crit/m_N，n_γ0 = (2ζ(3)/π²) T0³
    const rhoCrit = 8.0964e-47 * h * h, nb0 = Ob * rhoCrit / 0.93891, ng0 = 2 * ZETA3 / (Math.PI * Math.PI) * T0 ** 3, eta = T0 > 0 ? nb0 / ng0 : Infinity;
    const H0s = m.H0 * 1e5 / MPC_CM; // s⁻¹
    const out = { eta, zs: [], xe: [], zHalf: NaN, zDec: NaN, xeDec: NaN, rs: NaN, B_eV: B * 1e9 };
    if (!(T0 > 0)) return out;
    // 在 T 网格上算 x_e；找 x_e=0.5 和 Γ=H
    let prevG = null;
    for (let i = 0; i <= 600; i++) {
      const T = B / 10 * Math.pow(B / 200 / (B / 10), i / 600); // 从 B/10 到 B/200
      const z = T / T0 - 1; if (z < 0) break;
      const nH = (1 - Yp) * eta * (2 * ZETA3 / (Math.PI * Math.PI)) * T ** 3;
      const S = Math.pow(me * T / (2 * Math.PI), 1.5) * Math.exp(-B / T) / nH;
      const xe = S > 1e8 ? 1 : (-S + Math.sqrt(S * S + 4 * S)) / 2;
      out.zs.push(z); out.xe.push(xe);
      if (!isFinite(out.zHalf) && xe <= 0.5) out.zHalf = z;
      const Gamma = xe * nH * GEV3_CM3 * sigT * C_CM, a = 1 / (1 + z), H = H0s * Math.sqrt(COSMO.E2(m, a));
      const g = Gamma / H; if (prevG !== null && prevG >= 1 && g < 1 && !isFinite(out.zDec)) { out.zDec = z; out.xeDec = xe; }
      prevG = g;
    }
    if (!isFinite(out.zDec)) { out.zDec = NaN; }
    // 声学视界（Mpc）：∫_0^{a_dec} da/(a² E √(3(1+R)))，R = 3Ω_b a/(4Ω_γ)
    const Og = COSMO.OG_H2 * Math.pow(m.T0 / COSMO.T_CMB, 4) / (h * h);
    if (isFinite(out.zDec) && Og > 0) {
      const aDec = 1 / (1 + out.zDec), n = 3000, l1 = Math.log(1e-9), l2 = Math.log(aDec); let s = 0;
      for (let i = 0; i <= n; i++) { const a = Math.exp(l1 + (l2 - l1) * i / n), e2 = COSMO.E2(m, a); if (!(e2 > 0)) continue; const R = 3 * Ob * a / (4 * Og), w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2); s += w / (a * Math.sqrt(e2) * Math.sqrt(3 * (1 + R))); }
      out.rs = s * ((l2 - l1) / n) / 3 * COSMO.CKMS / m.H0; out.aDec = aDec;
    }
    return out;
  }
  // 重子-光子比（给核合成用）
  function eta(m, Ob) { const T0 = m.T0 * KB, h = m.H0 / 100; if (!(T0 > 0)) return Infinity; return Ob * 8.0964e-47 * h * h / 0.93891 / (2 * ZETA3 / (Math.PI * Math.PI) * T0 ** 3); }
  return { run, eta, B0, ME, SIGMA_T0 };
})();
if (typeof module !== 'undefined') module.exports = RECOMB;
