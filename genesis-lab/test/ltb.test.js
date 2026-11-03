// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// LTB 引擎对照：均匀极限 = FLRW（EdS 的闭式 D_L、开放宇宙对 cosmo.js 的距离和年龄）、同时大爆炸、GBH 空洞模仿暗能量
const assert = require('assert');
const C = require('../src/cosmo.js'); global.COSMO = C;
const L = require('../src/ltb.js');
let n = 0; function ok(name, cond, info) { n++; assert.ok(cond, name + (info ? '：' + info : '')); console.log('✓ ' + name + (info ? '：' + info : '')); }

// 1 均匀 Ω = 1：EdS 的 D_L = (2c/H0)(1+z)(1 − 1/√(1+z))，年龄 2/(3H0)
{
  const m = L.model({ Hout: 70, Oin: 1, Oout: 1, r0: 2500, dr: 600 }), ry = L.ray(m, { dr: 2 }); let worst = 0;
  for (const z of [0.1, 0.5, 1, 2]) { const DL = L.interp(ry.z, ry.DL, z), an = 2 * L.CKMS / 70 * (1 + z) * (1 - 1 / Math.sqrt(1 + z)); worst = Math.max(worst, Math.abs(DL / an - 1)); }
  ok('EdS limit: D_L(z) closed form', worst < 1e-5, worst.toExponential(1));
  ok('EdS limit: age 2/(3H0)', Math.abs(m.t0Gyr - 2 / 3 / 70 * 977.79) < 1e-3, m.t0Gyr.toFixed(4) + ' Gyr');
}
// 2 均匀 Ω = 0.3：开放 FLRW，距离和年龄对 cosmo.js
{
  const m = L.model({ Hout: 70, Oin: 0.3, Oout: 0.3, r0: 2500, dr: 600 }), ry = L.ray(m, { dr: 2 });
  const mm = C.norm({ H0: 70, Om: 0.3, OL: 0, Or: 0, w: -1 }), T = C.chiTable(mm, 3, 3000); let worst = 0;
  for (const z of [0.1, 0.5, 1, 2]) { const DL = L.interp(ry.z, ry.DL, z), an = C.distances(mm, T, z).DL; worst = Math.max(worst, Math.abs(DL / an - 1)); }
  ok('open FLRW limit: D_L(z) vs cosmo.js', worst < 1e-5, worst.toExponential(1));
  const age = C.solve({ H0: 70, Om: 0.3, OL: 0, Or: 0, w: -1 }).age * 977.79 / 70;
  ok('open FLRW limit: age vs cosmo.js', Math.abs(m.t0Gyr - age) < 1e-3, `${m.t0Gyr.toFixed(4)} vs ${age.toFixed(4)} Gyr`);
}
// 3 GBH 2008 的空洞：中心 H₀ ≈ 66、远处 50；按平坦 FLRW 拟合哈勃图得到 Ω_Λ ≈ 0.7（没有暗能量却像有）；z 单调；壳层各处年龄相同
{
  const m = L.model({ Hout: 50, Oin: 0.13, Oout: 1, r0: 2500, dr: 600 }), ry = L.ray(m, { dr: 2 });
  ok('GBH void: central H0 ≈ 66, far H0 = 50', Math.abs(m.Hkms(0) - 66) < 1.5 && Math.abs(m.Hkms(8000) - 50) < 0.01, `${m.Hkms(0).toFixed(1)} / ${m.Hkms(8000).toFixed(1)}`);
  const fit = L.fitFLRW(ry); ok('GBH void mimics dark energy: fitted Ω_Λ ≈ 0.7', fit.OL > 0.6 && fit.OL < 0.8 && fit.rms < 0.05, `Ω_Λ = ${fit.OL.toFixed(2)}, H0 = ${fit.H0.toFixed(1)}, rms ${fit.rms.toFixed(3)} mag`);
  let mono = true; for (let i = 1; i < ry.z.length; i++) if (ry.z[i] <= ry.z[i - 1]) mono = false; ok('redshift increases outward', mono);
  // 同时大爆炸：每个壳层在 t → 0 时 R → 0，即 R(0.001 t0, r) ≪ r
  let worst = 0; for (const r of [100, 1000, 2500, 5000]) worst = Math.max(worst, m.R(1e-3 * m.t0, r) / r); ok('simultaneous big bang (t_B = 0)', worst < 0.02, worst.toExponential(1));
  ok('density contrast at the centre', Math.abs(m.rhoRel(1) - 0.227) < 0.02, m.rhoRel(1).toFixed(3));
  ok('no void → no fake Λ', L.fitFLRW(L.ray(L.model({ Hout: 70, Oin: 1, Oout: 1, r0: 2500, dr: 600 }), { dr: 2 })).OL < 0.02);
}
console.log(`\n全部通过 / all ${n} checks passed`);
