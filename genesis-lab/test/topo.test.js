// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 多连通宇宙引擎对照：FFT 往返、周期场、匹配圆的几何（角半径 arccos(|v|/2χ)、两圆对应点相差 v、温度一致）、鬼像计数
const assert = require('assert');
const T = require('../src/topo.js');
let n = 0; function ok(name, cond, info) { n++; assert.ok(cond, name + (info ? '：' + info : '')); console.log('✓ ' + name + (info ? '：' + info : '')); }
// 1 FFT 往返
{ const m = 8, re = new Float64Array(m * m * m), im = new Float64Array(m * m * m); for (let i = 0; i < re.length; i++) re[i] = Math.sin(i * 0.37) + i % 3; const r0 = re.slice(); T.fft3(re, im, m, false); T.fft3(re, im, m, true); let e = 0; for (let i = 0; i < re.length; i++) e = Math.max(e, Math.abs(re[i] - r0[i])); ok('fft3 round trip', e < 1e-12, e.toExponential(1)); }
// 2 周期场：单位方差、平移一个周期不变
{ const F = T.field([1.2, 0.9, 1.5], 32, 3); ok('field periodic in each axis', Math.abs(T.sample(F, 0.3, 0.5, 0.7) - T.sample(F, 0.3 + 1.2, 0.5 - 1.8, 0.7 + 3)) < 1e-12);
  // 功率谱固定：胞腔越大，天图均方根越大（多了长波）；L = 4 时约 1
  const rms = (L) => { let r = 0; for (const seed of [1, 2]) { const S = T.sky(T.field([L, L, L], 64, seed), 120, 60); r += Math.sqrt(S.reduce((s, v) => s + v * v, 0) / S.length) / 2; } return r; };
  const r1 = rms(0.7), r4 = rms(4); ok('fixed power spectrum: sky rms grows with cell size', r1 < 0.8 * r4, `${r1.toFixed(3)} (L=0.7) < ${r4.toFixed(3)} (L=4)`); ok('calibration: rms(L=4) ≈ 1', Math.abs(r4 - 1) < 0.3, r4.toFixed(3));
  // 低阶多极：小胞腔压低四极
  const c2 = (L) => { let c = 0; for (const seed of [1, 2, 3]) { const S = T.sky(T.field([L, L, L], 64, seed), 120, 60); c += T.lowMultipoles(S, 120, 60).C2 / 3; } return c; };
  const q1 = c2(0.6), q4 = c2(3); ok('small torus suppresses the quadrupole', q1 < 0.3 * q4, `C2 = ${q1.toExponential(2)} (L=0.6) vs ${q4.toExponential(2)} (L=3)`); }
// 3 匹配圆
{ const L = [1.2, 1.2, 1.2], cs = T.circles(L); ok('cubic torus L = 1.2χ: 9 circle pairs with |v| < 2χ', cs.length === 9, cs.map((c) => c.n.join('')).join(' '));
  ok('angular radius = arccos(|v|/2χ)', Math.abs(cs[0].alpha - Math.acos(0.6)) < 1e-12, (cs[0].alpha * 180 / Math.PI).toFixed(2) + '°');
  const F = T.field(L, 32, 5), cp = T.circlePoints(cs[3], 24); let worst = 0, geo = 0;
  for (let k = 0; k < 24; k++) { const a = cp.A[k], b = cp.B[k]; geo = Math.max(geo, Math.abs(Math.hypot(a[0], a[1], a[2]) - 1), Math.abs(Math.hypot(b[0], b[1], b[2]) - 1)); worst = Math.max(worst, Math.abs(T.sample(F, a[0], a[1], a[2]) - T.sample(F, b[0], b[1], b[2]))); }
  ok('both circles lie on the last-scattering sphere', geo < 1e-12, geo.toExponential(1));
  ok('temperature identical along the matched pair', worst < 1e-12, worst.toExponential(1));
  ok('L > 2χ: no matched circles', T.circles([2.5, 2.5, 2.5]).length === 0);
  ok('slab (one periodic axis): circles only along that axis', T.circles([0.8, 50, 50]).every((c) => c.n[1] === 0 && c.n[2] === 0)); }
{ const cs = T.circles([0.5, 0.5, 0.5]); let cnt = 0; for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) for (let c = -4; c <= 4; c++) if ((a || b || c) && (a * a + b * b + c * c) * 0.25 < 4) cnt++; ok('small torus L = 0.5χ: every |n|·L < 2χ counted (no search cap)', cs.length === cnt / 2 && cs.length === 125, `${cs.length} pairs, expected ${cnt / 2}`);
  const F = T.field([0.9, 60, 60], 32, 3), S = T.sky(F, 90, 45), r0 = Math.sqrt(S.reduce((q, v) => q + v * v, 0) / S.length), m = T.removeDipole(S, 90, 45); let mean = 0, dz = 0, tot = 0; for (let j = 0; j < 45; j++) { const th = (j + 0.5) * Math.PI / 45, w = Math.sin(th); for (let i = 0; i < 90; i++) { mean += S[j * 90 + i] * w; dz += S[j * 90 + i] * w * Math.cos(th); tot += w; } } ok('removeDipole: residual sky has zero monopole and zero z-dipole (solid-angle weighted)', Math.abs(mean / tot) < 1e-6 * Math.max(1, r0) && Math.abs(dz / tot) < 2e-3 * Math.max(1, r0), `${(mean / tot).toExponential(1)}, ${(dz / tot).toExponential(1)}`); }
// 4 鬼像个数 ≈ πχ²/(Lx Ly)
{ const g = T.ghosts([{ x: 0.1, y: 0.2 }], [0.5, 0.5], 1); ok('ghost image count ≈ πχ²/L²', Math.abs(g.length - Math.PI / 0.25) < 3, g.length + ' vs ' + (Math.PI / 0.25).toFixed(1)); ok('exactly one direct image', g.filter((q) => q.direct).length === 1); }
console.log(`\n全部通过 / all ${n} checks passed`);
