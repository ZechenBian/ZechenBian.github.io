// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// FLRW 引擎的解析对照：有闭式解的宇宙逐个核对。用法：node test/cosmo.test.js
const C = require('../src/cosmo.js');
const assert = require('assert');
let n = 0;
function close(name, got, want, rel) { n++; const err = Math.abs(got - want) / Math.max(Math.abs(want), 1e-12); assert(err <= rel, `${name}: got ${got}, want ${want} (rel err ${err.toExponential(2)} > ${rel})`); console.log(`✓ ${name}: ${got} ≈ ${want}`); }
function eq(name, got, want) { n++; assert.strictEqual(got, want, `${name}: got ${got}, want ${want}`); console.log(`✓ ${name}: ${got}`); }

// 1 爱因斯坦–德西特：a = (1 + 3t/2)^{2/3}，年龄 2/3，粒子视界 2，无事件视界
{
  const R = C.solve({ H0: 70, Om: 1, Or: 0, OL: 0 });
  eq('EdS origin', R.origin, 'bigbang'); eq('EdS fate', R.fate, 'eternal'); eq('EdS decelerating', R.accelerating, false);
  close('EdS age', R.age, 2 / 3, 1e-4);
  const ts = R.fut.ts, as = R.fut.as; let worst = 0;
  for (let i = 0; i < ts.length; i++) { if (ts[i] > 50) break; worst = Math.max(worst, Math.abs(as[i] / Math.pow(1 + 1.5 * ts[i], 2 / 3) - 1)); }
  assert(worst < 2e-4, 'EdS trajectory error ' + worst); console.log('✓ EdS a(t) future worst rel err ' + worst.toExponential(2)); n++;
  close('EdS particle horizon', R.particleHorizon, 2, 2e-3); eq('EdS event horizon', R.eventHorizon, Infinity);
  // 增长 D ∝ a（物质主导）
  const g = R.growth; let r0 = null, worstD = 0;
  for (let i = 0; i < g.as.length; i++) { if (g.as[i] < 0.05) continue; if (g.as[i] > 1) break; const r = g.dGal[i] / g.as[i]; if (r0 === null) r0 = r; worstD = Math.max(worstD, Math.abs(r / r0 - 1)); }
  assert(worstD < 1e-2, 'EdS growth not ∝ a: ' + worstD); console.log('✓ EdS growth D ∝ a (worst dev ' + worstD.toExponential(2) + ')'); n++;
}
// 2 德西特：无奇点、永远加速，事件视界 1
{
  const R = C.solve({ H0: 70, Om: 0, Or: 0, OL: 1 });
  eq('dS origin', R.origin, 'eternalpast'); eq('dS fate', R.fate, 'eternal'); eq('dS accelerating', R.accelerating, true);
  close('dS event horizon', R.eventHorizon, 1, 2e-3); eq('dS particle horizon', R.particleHorizon, Infinity);
}
// 3 米尔恩：a = 1 + t，年龄 1，两个视界都没有
{
  const R = C.solve({ H0: 70, Om: 0, Or: 0, OL: 0 });
  eq('Milne origin', R.origin, 'bigbang'); close('Milne age', R.age, 1, 1e-4);
  eq('Milne particle horizon', R.particleHorizon, Infinity); eq('Milne event horizon', R.eventHorizon, Infinity);
}
// 4 封闭的物质宇宙 Ω_m = 2：a_max = Ω_m/(Ω_m−1) = 2，总寿命 πΩ_m/(Ω_m−1)^{3/2} = 2π
{
  const R = C.solve({ H0: 70, Om: 2, Or: 0, OL: 0 });
  eq('closed fate', R.fate, 'crunch'); close('closed a_max', R.aMax, 2, 2e-3);
  close('closed total lifetime', R.tEnd + R.age, 2 * Math.PI, 2e-3);
  // 年龄的闭式：t = Ω_m/(2(Ω_m−1)^{3/2}) (θ − sin θ)，a = Ω_m/(2(Ω_m−1)) (1 − cos θ)，今天 a=1 → cos θ = 0 → θ = π/2
  close('closed age', R.age, 2 / 2 * (Math.PI / 2 - 1), 2e-3);
  eq('closed geometry', R.geometry, 'closed');
}
// 5 辐射宇宙：a = (1+2t)^{1/2}，年龄 1/2
{
  const R = C.solve({ H0: 70, Om: 0, Or: 1, OL: 0 });
  close('radiation age', R.age, 0.5, 1e-4);
  const i = R.fut.ts.findIndex((t) => t > 3); close('radiation a(t=3)', R.fut.as[i] / Math.sqrt(1 + 2 * R.fut.ts[i]), 1, 2e-4);
}
// 6 大撕裂：w = −1.5，t_rip − t0 ≈ 2/(3|1+w|√Ω_Λ)（Caldwell 2003 的渐近式）
{
  const R = C.solve({ H0: 70, Om: 0.3, Or: 0, OL: 0.7, w: -1.5 });
  eq('rip fate', R.fate, 'rip'); close('rip time (asymptotic formula)', R.tEnd, 2 / (3 * 0.5 * Math.sqrt(0.7)), 0.1);
}
// 7 Planck 2018：年龄 13.80 Gyr，q0 = Ω_m/2 + Ω_r − Ω_Λ，a_eq ≈ 2.9e-4，距离 D_L(z=1) ≈ 6.80 Gpc（(c/H0)∫dz/E = 4448 × 0.765 × 2）
{
  const R = C.solve(C.FIDUCIAL), gyr = C.GYR / R.m.H0;
  close('Planck age (Gyr)', R.age * gyr, 13.80, 3e-3);
  close('Planck q0', R.q0, 0.315 / 2 + R.m.Or - 0.685, 1e-6);
  close('Planck a_eq', R.aEq, 2.92e-4, 0.02);
  close('Planck sigma8 today (by construction)', R.growth.sigma8Today, 0.81, 1e-4);
  assert(isFinite(R.growth.tFirst), 'Planck should form galaxies'); console.log('✓ Planck: first galaxies at t = ' + ((R.growth.tFirst + R.age) * gyr).toFixed(2) + ' Gyr, typical galaxies at ' + ((R.growth.tGal + R.age) * gyr).toFixed(2) + ' Gyr, clusters at ' + ((R.growth.tCluster + R.age) * gyr).toFixed(2) + ' Gyr after the Big Bang'); n++;
  eq('Planck verdict', R.verdict, 'alive');
  const T = C.chiTable(R.m, 3), d = C.distances(R.m, T, 1);
  close('Planck D_L(z=1) Mpc', d.DL, 6805, 0.01); close('Planck D_A(z=1) Mpc', d.DA, 6805 / 4, 0.01);
  close('Planck event horizon (Gpc; 16.5 Gly = 5.06 Gpc)', R.eventHorizon * C.CKMS / R.m.H0 / 1000, 5.06, 0.03);
}
// 8 反弹宇宙：Ω_m = 0.3、Ω_Λ = 2 → 过去 E² 触零，没有大爆炸
{
  const R = C.solve({ H0: 70, Om: 0.3, Or: 0, OL: 2 });
  eq('bounce origin', R.origin, 'bounce'); assert(R.aMin > 0.4 && R.aMin < 1, 'aMin ' + R.aMin); console.log('✓ bounce aMin = ' + R.aMin.toFixed(3)); n++;
  eq('bounce verdict is not alive', R.verdict !== 'alive', true);
}
// 9 温伯格边缘：Λ 太大，没有星系
{
  const R = C.solve({ H0: 67.4, Om: 0.002, Or: 9.2e-5, OL: 0.998 });
  assert(!isFinite(R.growth.tFirst), 'Weinberg edge should form no galaxies'); eq('Weinberg verdict', R.verdict, 'dead');
  console.log('✓ Weinberg edge: δ_first max = ' + R.growth.dFirstMax.toFixed(3)); n++;
}
// 10 年龄：常微分方程与数值积分一致（随机几组）
{
  let worst = 0; const rnd = (lo, hi) => lo + (hi - lo) * Math.random();
  for (let k = 0; k < 20; k++) {
    const m = { H0: 70, Om: rnd(0.05, 1.5), Or: rnd(0, 1e-3), OL: rnd(-0.5, 1.2) };
    const R = C.solve(m); if (R.origin !== 'bigbang') continue;
    const ode = -R.past.stop.t, quad = C.ageQuad(R.m); worst = Math.max(worst, Math.abs(ode / quad - 1));
  }
  assert(worst < 2e-3, 'ODE vs quadrature age mismatch ' + worst); console.log('✓ ODE age vs quadrature worst rel err ' + worst.toExponential(2)); n++;
}
console.log(`\n全部通过 / all ${n} checks passed`);
