// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 2+1 维引力引擎对照：锥形亏角的双像（分离角 → δ、只在质点背后出现）、BTZ 的视界/温度/熵、测地线能量守恒与"全部落入"、2+1 维尘埃宇宙不减速
const assert = require('assert');
const Gv = require('../src/gravity21.js');
let n = 0; function ok(name, cond, info) { n++; assert.ok(cond, name + (info ? '：' + info : '')); console.log('✓ ' + name + (info ? '：' + info : '')); }
// 1 锥
{ const d = 0.5, O = [-3, 0];
  const far = Gv.images(O, [600 * Math.cos(0.3), 600 * Math.sin(0.3)], d); ok('source behind the mass: two images', far.length === 2, far.map((i) => i.copy).join(','));
  ok('far source: image separation → deficit angle δ', Math.abs(Math.abs(far[0].dir - far[1].dir) - d) < 0.01, Math.abs(far[0].dir - far[1].dir).toFixed(4));
  ok('source to the side: one image', Gv.images(O, [0, 6], d).length === 1 && Gv.images(O, [6 * Math.cos(2.9), 6 * Math.sin(2.9)], d).length === 1);
  const near = Gv.images(O, [6 * Math.cos(0.3), 6 * Math.sin(0.3)], d); ok('near source: separation smaller than δ', near.length === 2 && Math.abs(near[0].dir - near[1].dir) < d);
  ok('glue map: chart edges meet', (() => { const a = Gv.glue(Math.cos(d / 2), Math.sin(d / 2), d), b = Gv.glue(Math.cos(2 * Math.PI - d / 2), Math.sin(2 * Math.PI - d / 2), d); return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9; })()); }
// 2 BTZ
{ const B = Gv.btz(2.25, 2); ok('BTZ horizon r₊ = ℓ√M', Math.abs(B.rp - 3) < 1e-12); ok('Hawking temperature r₊/(2πℓ²)', Math.abs(B.T - 3 / (2 * Math.PI * 4)) < 1e-12); ok('entropy = circumference/4G', Math.abs(B.S - 2 * Math.PI * 3 / 4) < 1e-12);
  const g = Gv.geodesic(Gv.btz(1, 1), { E: 4, L: 1.5, massive: true, r0: 3, outward: true, lambdaMax: 40 }); ok('massive geodesic conserves energy', g.energyErr < 1e-6, g.energyErr.toExponential(1));
  ok('massive geodesic turns at V(r) = E² and falls into the horizon (no stable orbits in BTZ)', g.fate === 'horizon' && Math.abs(g.rmax - Gv.turning(Gv.btz(1, 1), 4, 1.5, true)[0]) < 0.02, `${g.fate}, r_max ${g.rmax.toFixed(3)}`);
  const p = Gv.geodesic(Gv.btz(1, 1), { E: 3, L: 1, massive: false, r0: 3, outward: true, lambdaMax: 200 }); ok('photon with E² > L²/ℓ² reaches the AdS boundary and is reflected back', p.bounces >= 1 && p.rmax > 20, `${p.bounces} bounces, fate ${p.fate}`);
  const q = Gv.geodesic(Gv.btz(1, 1), { E: 0.8, L: 1, massive: false, r0: 1.5, outward: true, lambdaMax: 200 }); ok('photon with E² < L²/ℓ² turns around and falls in', q.fate === 'horizon' && q.rmax < 3); }
// 3 2+1 维 FLRW
{ const d = Gv.flrw21({ dust: 1 }); const at = (t) => d.as[d.ts.findIndex((x) => x >= t - 1e-9)]; ok('2+1 dust universe coasts: a = 1 + t', Math.abs(at(1) - 2) < 1e-3 && Math.abs(at(-0.5) - 0.5) < 1e-3, `${at(1).toFixed(4)}, ${at(-0.5).toFixed(4)}`);
  const r = Gv.flrw21({ rad: 1 }); ok('2+1 radiation universe decelerates', r.as[r.ts.findIndex((x) => x >= 1)] < 1.95);
  const L = Gv.flrw21({ lambda: 1 }); ok('2+1 Λ universe accelerates', L.as[L.ts.findIndex((x) => x >= 1)] > 2.2); }
console.log(`\n全部通过 / all ${n} checks passed`);
