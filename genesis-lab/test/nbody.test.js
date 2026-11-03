// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// N 体核对：FFT 往返、小幅度下 rms δ 按线性增长因子 D(a) 长、EdS 里 D ∝ a。用法：node test/nbody.test.js
const C = require('../src/cosmo.js'), NB = require('../src/nbody.js'); const assert = require('assert'); let n = 0;
const ok = (name, c, extra) => { n++; assert(c, name + (extra ? ' ' + extra : '')); console.log('✓ ' + name + (extra ? '：' + extra : '')); };
{ const N = 16, re = new Float64Array(N * N), im = new Float64Array(N * N); for (let k = 0; k < N * N; k++) re[k] = Math.sin(k * 0.37) + (k % 5); const r0 = new Float64Array(re); NB.fft2(re, im, N, false); NB.fft2(re, im, N, true); let w = 0; for (let k = 0; k < N * N; k++) w = Math.max(w, Math.abs(re[k] - r0[k]), Math.abs(im[k])); ok('FFT round trip', w < 1e-9, w.toExponential(1)); }
function run(model, aEnd, sig0) {
  const R = C.solve(model), m = R.m, g = R.growth;
  const Dof = (a) => { let i = 1; while (i < g.as.length - 1 && g.as[i] < a) i++; const u = (a - g.as[i - 1]) / (g.as[i] - g.as[i - 1]); return g.d8[i - 1] + (g.d8[i] - g.d8[i - 1]) * u; };
  const aInit = 0.05, Dr = Dof(aInit) / g.sigma8Today;
  const sim = new NB.PM2D({ N: 64, np: 64, L: 300, seed: 3, Om: m.Om, Ob: 0.049, h: m.H0 / 100, ns: 0.965, sigma8: sig0, aInit, Dratio: Dr, E: (a) => Math.sqrt(Math.max(1e-12, C.E2(m, a))), aOf: (t) => { if (t <= 0) { const { ts, as } = R.past; let lo = 0, hi = ts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] >= t) lo = mid; else hi = mid; } const f = (t - ts[lo]) / (ts[hi] - ts[lo]); return as[lo] + (as[hi] - as[lo]) * f; } const { ts, as } = R.fut; let lo = 0, hi = ts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; } const f = (t - ts[lo]) / (ts[hi] - ts[lo]); return as[lo] + (as[hi] - as[lo]) * f; }, tOf: (a) => C.tOfA(R, a) });
  const s0 = sim.sigma8(); let steps = 0; while (sim.a < aEnd && steps++ < 4000) sim.step(0.02);
  return { s0, s1: sim.sigma8(), Dgrow: Dof(sim.a) / Dof(aInit), a: sim.a, steps };
}
{ const r = run({ H0: 70, Om: 1, Or: 0, OL: 0 }, 0.2, 0.01); const ratio = r.s1 / r.s0; ok('EdS small-amplitude growth ≈ D(a) ∝ a', Math.abs(ratio / r.Dgrow - 1) < 0.08, `rms grew ×${ratio.toFixed(3)}, D grew ×${r.Dgrow.toFixed(3)} (a=${r.a.toFixed(3)}, ${r.steps} steps)`); }
{ const r = run(C.FIDUCIAL, 0.3, 0.01); const ratio = r.s1 / r.s0; ok('ΛCDM small-amplitude growth ≈ D(a)', Math.abs(ratio / r.Dgrow - 1) < 0.08, `×${ratio.toFixed(3)} vs ×${r.Dgrow.toFixed(3)}`); }
{ const r = run(C.FIDUCIAL, 1.0, 0.81); ok('ΛCDM full amplitude at a=1 (64² test grid, resolution-limited)', r.s1 > 0.55, `σ8(sim) = ${r.s1.toFixed(2)} (linear 0.81)`); }
{ const R = C.solve(C.FIDUCIAL), m = R.m; const aOf = (t) => { const br = t <= 0 ? R.past : R.fut, { ts, as } = br, dec = t <= 0; let lo = 0, hi = ts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (dec ? ts[mid] >= t : ts[mid] <= t) lo = mid; else hi = mid; } const f = (t - ts[lo]) / (ts[hi] - ts[lo]); return as[lo] + (as[hi] - as[lo]) * f; };
  const sim = new NB.PM2D({ N: 64, np: 64, L: 300, seed: 5, Om: m.Om, Ob: 0.049, h: m.H0 / 100, ns: 0.965, aInit: 0.05, amp: 0.05, E: (a) => Math.sqrt(Math.max(1e-12, C.E2(m, a))), aOf, tOf: (a) => C.tOfA(R, a) }); for (let i = 0; i < 30; i++) sim.step(0.05);
  ok('σ8 from Parseval in forces() equals the real-space σ8', Math.abs(sim.s8 / sim.sigma8() - 1) < 1e-9, `${sim.s8.toFixed(6)} vs ${sim.sigma8().toFixed(6)}`); }
console.log(`\n全部通过 / all ${n} checks passed`);
