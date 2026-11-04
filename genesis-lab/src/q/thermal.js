// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 早期宇宙的热历史（量子版）：粒子汤的成分、有效自由度 g*(T)、温度–时间关系。
//   每种粒子的能量密度 ρ_i/T⁴ = (g_i/2π²) ∫ x²√(x²+y²)/(e^{√(x²+y²)} ± 1) dx，y = m_i/T（玻色子 −，费米子 +）——这就是量子统计。
//   膨胀：H² = 8πρ/(3M_Pl²)；温度随膨胀由熵守恒 s a³ = const 给出（e⁺e⁻ 湮灭把熵交给光子，中微子 1 MeV 后自己冷却，T_ν/T_γ → (4/11)^{1/3}）。
//   QCD 相变（150 MeV）以上是夸克和胶子，以下是强子（π、K、η、核子）。
// 单位：能量 GeV，时间 s（ħ = 6.582e-25 GeV·s），温度也可换算成 K（k_B = 8.617e-14 GeV/K）。
const THERMAL = (function () {
  const MPL = 1.220890e19, HBAR = 6.582119569e-25, KB = 8.617333262e-14, ZETA3 = 1.2020569031595942;
  const C_CM = 2.99792458e10, GEV_KG = 1.78266192e-27; // 1 GeV/c² 的质量 kg
  const RHO_CRIT_H2 = 8.0964e-47;  // 临界密度 ρ_crit = 8.096e-47 h² GeV⁴
  const T_QCD = 0.150, T_NUDEC = 2.0e-3; // QCD 相变、中微子退耦（GeV；瞬时退耦近似，取 2 MeV 使 e± 仍是相对论性的）
  // 标准模型的粒子：名字、质量 GeV、自由度 g、费米子？、相（q 夸克-胶子相，h 强子相，a 两相都在）、颜色
  const SPECIES = [
    { n: 'γ 光子', m: 0, g: 2, f: false, ph: 'a', c: '#f2c14e' },
    { n: 'g 胶子', m: 0, g: 16, f: false, ph: 'q', c: '#b08cff' },
    { n: 'W±', m: 80.379, g: 6, f: false, ph: 'a', c: '#ff6f87' },
    { n: 'Z', m: 91.1876, g: 3, f: false, ph: 'a', c: '#ff9f6f' },
    { n: 'H 希格斯', m: 125.1, g: 1, f: false, ph: 'a', c: '#ffffff' },
    { n: 't 顶夸克', m: 172.8, g: 12, f: true, ph: 'q', c: '#6fb5ff' },
    { n: 'b 底夸克', m: 4.18, g: 12, f: true, ph: 'q', c: '#5f8fff' },
    { n: 'c 粲夸克', m: 1.27, g: 12, f: true, ph: 'q', c: '#4f7fe0' },
    { n: 's 奇夸克', m: 0.093, g: 12, f: true, ph: 'q', c: '#3f6fc0' },
    { n: 'u d 夸克', m: 0.004, g: 24, f: true, ph: 'q', c: '#2f5fa0' },
    { n: 'τ', m: 1.777, g: 4, f: true, ph: 'a', c: '#b6ef6a' },
    { n: 'μ', m: 0.10566, g: 4, f: true, ph: 'a', c: '#8fd65a' },
    { n: 'e± 电子', m: 0.00051099895, g: 4, f: true, ph: 'a', c: '#5fe0cf' },
    { n: 'ν 中微子', m: 0, g: 6, f: true, ph: 'a', c: '#98a4c7', nu: true },
    { n: 'π 介子', m: 0.138, g: 3, f: false, ph: 'h', c: '#d9a066' },
    { n: 'K 介子', m: 0.4957, g: 4, f: false, ph: 'h', c: '#c08a55' },
    { n: 'η 介子', m: 0.548, g: 1, f: false, ph: 'h', c: '#a87a4a' },
    { n: 'p n 核子', m: 0.9389, g: 8, f: true, ph: 'h', c: '#e9edf9' },
  ];
  // 玻色/费米积分 J_ρ(y)、J_p(y)（除以 g/2π²），在 ln y 网格上算一次
  const YMIN = 1e-3, YMAX = 80, NY = 240, JTAB = { B: null, F: null };
  function integ(y, fermi) {
    const n = 800, xmax = 60; let r = 0, p = 0;
    for (let i = 0; i <= n; i++) {
      const x = xmax * i / n, E = Math.sqrt(x * x + y * y), w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      const den = Math.exp(E) + (fermi ? 1 : -1); if (!(den > 0)) continue;
      r += w * x * x * E / den; p += w * x * x * x * x / (3 * (E || 1e-300)) / den;
    }
    return [r * (xmax / n) / 3, p * (xmax / n) / 3];
  }
  function jtab(fermi) {
    const k = fermi ? 'F' : 'B'; if (JTAB[k]) return JTAB[k];
    const t = { lny: [], r: [], p: [] };
    for (let i = 0; i <= NY; i++) { const ly = Math.log(YMIN) + (Math.log(YMAX) - Math.log(YMIN)) * i / NY; const [r, p] = integ(Math.exp(ly), fermi); t.lny.push(ly); t.r.push(r); t.p.push(p); }
    t.r0 = fermi ? 7 * Math.PI ** 4 / 120 : Math.PI ** 4 / 15; t.p0 = t.r0 / 3;
    return (JTAB[k] = t);
  }
  function J(y, fermi) { // [ρ/T⁴, p/T⁴] 除以 g/2π²
    const t = jtab(fermi); if (y <= YMIN) return [t.r0, t.p0]; if (y >= YMAX) return [0, 0];
    const f = (Math.log(y) - t.lny[0]) / (t.lny[NY] - t.lny[0]) * NY, i = Math.min(NY - 1, Math.floor(f)), u = f - i;
    return [t.r[i] + (t.r[i + 1] - t.r[i]) * u, t.p[i] + (t.p[i + 1] - t.p[i]) * u];
  }
  // 某温度下每种粒子的 ρ/T⁴ 和 s/T³（不含中微子；中微子单独按 T_ν 算）
  function plasma(T, Neff) {
    const phase = T > T_QCD ? 'q' : 'h'; let rho = 0, s = 0; const parts = [];
    for (const sp of SPECIES) {
      if (sp.nu) continue; if (sp.ph !== 'a' && sp.ph !== phase) continue;
      const y = sp.m / T, [r, p] = J(y, sp.f), k = sp.g / (2 * Math.PI * Math.PI); const ri = k * r, si = k * (r + p);
      if (ri > 1e-12) parts.push({ sp, rho: ri, s: si }); rho += ri; s += si;
    }
    return { rho, s, parts }; // ρ = rho·T⁴，s = s·T³（自然单位）
  }
  function nuDens(Tnu, Neff) { // 中微子：6 个自由度 × N_eff/3，费米子
    const k = 6 * (Neff / 3) / (2 * Math.PI * Math.PI), r0 = 7 * Math.PI ** 4 / 120; return { rho: k * r0 * Tnu ** 4, s: k * (4 / 3) * r0 * Tnu ** 3 };
  }
  // 建表：T 从 1e16 GeV 到今天
  function build(o) {
    o = o || {}; const Neff = o.Neff === undefined ? 3.044 : o.Neff, T0K = o.T0 === undefined ? 2.7255 : o.T0, H0 = o.H0 || 67.4, Om = o.Om === undefined ? 0.315 : o.Om, OL = o.OL === undefined ? 0.685 : o.OL;
    const h = H0 / 100, rhoCrit = RHO_CRIT_H2 * h * h, T0 = T0K * KB;
    const lnTmax = Math.log(1e16), lnTmin = Math.log(T0 * 0.5), N = Math.ceil((lnTmax - lnTmin) / Math.log(10) * 20);
    const lnT = new Float64Array(N + 1), aT = new Float64Array(N + 1), Tnu = new Float64Array(N + 1), gS = new Float64Array(N + 1), gR = new Float64Array(N + 1), Hs = new Float64Array(N + 1), ts = new Float64Array(N + 1), rhoT = new Float64Array(N + 1);
    // 熵的锚点：今天 a = 1、只剩光子；中微子退耦时的等离子体熵
    const sPl = (T) => plasma(T, Neff).s * T ** 3;
    const sPl0 = sPl(T0), sPlDec = sPl(T_NUDEC), aDec = Math.cbrt(sPl0 / sPlDec);
    const sNuDec = nuDens(T_NUDEC, Neff).s, sTotDec = sPlDec + sNuDec;
    for (let i = 0; i <= N; i++) {
      const T = Math.exp(lnTmax + (lnTmin - lnTmax) * i / N); lnT[i] = Math.log(T);
      const P = plasma(T, Neff); let a, tn;
      if (T >= T_NUDEC) { const sTot = P.s * T ** 3 + nuDens(T, Neff).s; a = aDec * Math.cbrt(sTotDec / sTot); tn = T; }
      else { a = aDec * Math.cbrt(sPlDec / (P.s * T ** 3)); tn = T_NUDEC * aDec / a; }
      aT[i] = a; Tnu[i] = tn;
      const NU = nuDens(tn, Neff), rho = P.rho * T ** 4 + NU.rho + rhoCrit * (Om / (a * a * a) + OL);
      rhoT[i] = rho; gR[i] = rho / (Math.PI * Math.PI / 30 * T ** 4); gS[i] = (P.s * T ** 3 + NU.s) / (2 * Math.PI * Math.PI / 45 * T ** 3);
      Hs[i] = Math.sqrt(8 * Math.PI * rho / 3) / MPL / HBAR; // s⁻¹
    }
    // 时间：t = ∫ dln a / H，起点辐射主导 t = 1/(2H)
    ts[0] = 1 / (2 * Hs[0]);
    for (let i = 1; i <= N; i++) { const dln = Math.log(aT[i] / aT[i - 1]); ts[i] = ts[i - 1] + dln * 0.5 * (1 / Hs[i] + 1 / Hs[i - 1]); }
    const tab = { N, lnT, aT, Tnu, gS, gR, Hs, ts, rhoT, Neff, T0K, T0, H0, Om, OL, aDec, rhoCrit };
    const idx = (lt) => { if (lt >= lnT[0]) return 0; if (lt <= lnT[N]) return N - 1; let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lnT[m] > lt) lo = m; else hi = m; } return lo; };
    const lerp = (arr, i, u) => arr[i] + (arr[i + 1] - arr[i]) * u;
    // 由温度（GeV）取状态
    const llerp = (arr, i, u) => Math.exp(Math.log(arr[i]) + (Math.log(arr[i + 1]) - Math.log(arr[i])) * u);
    tab.atT = (T) => { const lt = Math.log(T), i = idx(lt), u = Math.max(0, Math.min(1, (lt - lnT[i]) / (lnT[i + 1] - lnT[i]))); return { T, TK: T / KB, a: llerp(aT, i, u), Tnu: lerp(Tnu, i, u), gS: lerp(gS, i, u), gR: lerp(gR, i, u), H: llerp(Hs, i, u), t: llerp(ts, i, u), rho: llerp(rhoT, i, u) }; };
    // 由时间（s）取温度
    tab.TofT = (t) => { if (t <= ts[0]) return Math.exp(lnT[0]); if (t >= ts[N]) return Math.exp(lnT[N]); let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m; else hi = m; } const u = (Math.log(t) - Math.log(ts[lo])) / (Math.log(ts[hi]) - Math.log(ts[lo])); return Math.exp(lnT[lo] + (lnT[hi] - lnT[lo]) * u); };
    tab.atTime = (t) => tab.atT(tab.TofT(t));
    tab.species = (T) => { const P = plasma(T, Neff), st = tab.atT(T), NU = nuDens(st.Tnu, Neff); const parts = P.parts.map((p) => ({ name: p.sp.n, color: p.sp.c, rho: p.rho * T ** 4, m: p.sp.m })); parts.push({ name: 'ν 中微子', color: '#98a4c7', rho: NU.rho, m: 0 }); const tot = parts.reduce((s, p) => s + p.rho, 0); for (const p of parts) p.frac = p.rho / tot; return parts.sort((a, b) => b.frac - a.frac); };
    return tab;
  }
  // 视界：哈勃半径 c/H（cm）和其中的质量（kg）
  function hubble(st) { const Rh = C_CM / st.H; const rhoKg = st.rho * GEV_KG / Math.pow(1.97327e-14, 3); /* GeV⁴ → GeV/cm³ → kg/cm³ */ return { Rh_cm: Rh, M_kg: 4 / 3 * Math.PI * Rh ** 3 * rhoKg }; }
  return { MPL, HBAR, KB, ZETA3, C_CM, GEV_KG, RHO_CRIT_H2, T_QCD, T_NUDEC, SPECIES, J, plasma, nuDens, build, hubble };
})();
if (typeof module !== 'undefined') module.exports = THERMAL;
