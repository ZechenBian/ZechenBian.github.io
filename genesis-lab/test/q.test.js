// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 量子版引擎核对：有效自由度、温度-时间、核合成、复合、暴胀能标。用法：node test/q.test.js
global.COSMO = require('../src/cosmo.js');
const TH = require('../src/q/thermal.js'), BBN = require('../src/q/bbn.js'), RC = require('../src/q/recomb.js'), INF = require('../src/q/inflation.js');
const assert = require('assert'); let n = 0;
const close = (name, got, want, rel) => { n++; const err = Math.abs(got - want) / Math.abs(want); assert(err <= rel, `${name}: got ${got}, want ${want} (rel ${err.toExponential(1)})`); console.log(`✓ ${name}: ${got} ≈ ${want}`); };
const ok = (name, c, extra) => { n++; assert(c, name + (extra ? ' ' + extra : '')); console.log('✓ ' + name + (extra ? '：' + extra : '')); };
const tab = TH.build({});
close('g*(1 TeV) = 106.75', tab.atT(1e3).gR, 106.75, 1e-3);
close('g*(10 MeV) = 10.75', tab.atT(1e-2).gR, 10.75, 1e-2);
close('g*(after e± annihilation) = 3.36', tab.atT(1e-6).gR, 3.36, 0.012);
close('(T_ν/T_γ)₀ = (4/11)^{1/3}', tab.atT(2.36e-13).Tnu / 2.36e-13, Math.pow(4 / 11, 1 / 3), 3e-3);
close('t(1 MeV) ≈ 0.74 s', tab.atT(1e-3).t, 0.74, 0.03);
close('t(today) = 13.8 Gyr', tab.atT(2.7255 * TH.KB).t / 3.15576e16, 13.8, 0.01);
close('a(2970 K) = 1/1091', tab.atT(2970 * TH.KB).a, 1 / 1091, 0.01);
close('BBN f(q₀) = 1.636', BBN.f0(BBN.Q0 / BBN.ME), 1.636, 1e-3);
{ const r = BBN.rates(1, 1, BBN.Q0 / BBN.ME); close('detailed balance λ_pn/λ_np = e^{−Q/T}', r.pn / r.np, Math.exp(-BBN.Q0 / BBN.ME), 1e-3); }
const b = BBN.run(tab, {}); close('Y_p(standard) = 0.247', b.Yp, 0.247, 5e-3); ok('BBN at ~3–4 min', b.tNuc > 150 && b.tNuc < 300, b.tNuc.toFixed(0) + ' s');
ok('more N_eff → more helium', BBN.run(TH.build({ Neff: 6 }), {}).Yp > b.Yp); ok('weaker G_F → more helium', BBN.run(tab, { GF: 0.5 }).Yp > b.Yp); ok('larger Q → less helium', BBN.run(tab, { Q: 2.5e-3 }).Yp < 0.01);
const m = COSMO.norm(COSMO.FIDUCIAL), rc = RC.run(m, { Ob: 0.0493, Yp: 0.247 });
close('η = 6.1e-10', rc.eta, 6.1e-10, 0.01); close('z_dec (Saha) ≈ 1130', rc.zDec, 1130, 0.02); close('r_s ≈ 141 Mpc (Saha z_dec)', rc.rs, 141, 0.02);
ok('smaller α → later recombination', RC.run(m, { Ob: 0.0493, Yp: 0.247, alpha: 0.5 }).zDec < rc.zDec / 2);
const inf = INF.derive(2.1e-9, 0.965, 0.01); close('V^{1/4}(r=0.01) ≈ 1.0e16 GeV', inf.V4, 1.0e16, 0.03); ok('T_GH ~ 1e26 K', inf.TGH > 1e25 && inf.TGH < 1e28, inf.TGH.toExponential(2));
close('de Sitter T today ~ 2.2e-30 K', INF.deSitterT(67.4 * 1e5 / 3.0857e24 * Math.sqrt(0.685)), 2.2e-30, 0.05);
console.log(`\n全部通过 / all ${n} checks passed`);
