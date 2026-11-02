// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 哥德尔引擎核对：笛卡尔型度规与柱坐标度规一致、克氏符对称、测地线守恒量、从轴发出的光在 sinh r = 1 折返。用法：node test/godel.test.js
const G = require('../src/godel.js');
const assert = require('assert');
let n = 0;
const ok = (name, cond, extra) => { n++; assert(cond, name + (extra ? ' ' + extra : '')); console.log('✓ ' + name + (extra ? '：' + extra : '')); };

// 1 笛卡尔型度规 = 柱坐标度规经坐标变换（在几个点上比线元）
for (const [r, phi] of [[0.3, 0.4], [0.8814, 2.0], [1.5, -1.0], [2.5, 3.0], [0.02, 1.0]]) {
  const x = G.pointCart(r, phi, 0, 0), g = G.metric(x), gc = G.metricCyl(r); let worst = 0;
  for (let k = 0; k < 20; k++) { // 随机位移向量，比较 ds²
      const dt = Math.random() - .5, dr = Math.random() - .5, dphi = Math.random() - .5, dz = Math.random() - .5;
      const dX = Math.cos(phi) * dr - r * Math.sin(phi) * dphi, dY = Math.sin(phi) * dr + r * Math.cos(phi) * dphi;
      const vC = [dt, dX, dY, dz], vP = [dt, dr, dphi, dz]; let a = 0, b = 0;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { a += g[i][j] * vC[i] * vC[j]; b += gc[i][j] * vP[i] * vP[j]; }
      worst = Math.max(worst, Math.abs(a - b));
  }
  ok(`Cartesian metric matches cylindrical at r=${r}`, worst < 1e-9, 'worst ' + worst.toExponential(1));
}
// 2 Γ 对称；轴上度规是闵可夫斯基
{
  const C = G.christoffel([0, 0.7, -0.4, 0]); let asym = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) asym = Math.max(asym, Math.abs(C[a][b][c] - C[a][c][b]));
  ok('Christoffel symmetric in lower indices', asym < 1e-9, asym.toExponential(1));
  const g0 = G.metric([0, 0, 0, 0]); ok('Minkowski on the axis', g0[0][0] === -1 && g0[1][1] === 1 && g0[0][1] === 0);
}
// 3 光锥斜率：u− 在 sinh r = 1 处为零（闭合零曲线），之后为正（φ 圆类时）
{
  const s0 = G.coneSlopes(G.R_C), s1 = G.coneSlopes(0.5), s2 = G.coneSlopes(1.5);
  ok('u− = 0 at r_c', Math.abs(s0.minus) < 1e-12, s0.minus.toExponential(1));
  ok('u− < 0 inside, > 0 outside', s1.minus < 0 && s2.minus > 0);
  ok('g_φφ < 0 outside r_c (CTC)', G.metricCyl(1.5)[2][2] < 0, 'g_φφ(1.5) = ' + G.metricCyl(1.5)[2][2].toFixed(3));
  ok('g_φφ > 0 inside r_c', G.metricCyl(0.5)[2][2] > 0);
  ok('loop proper time finite outside, NaN inside', isFinite(G.loopProperTime(1.2)) && isNaN(G.loopProperTime(0.5)));
}
// 4 从轴发出的光：零性、E、L 守恒；最大半径 = asinh 1；回到轴
{
  const k = G.nullVector(0, 0, 0.3);
  ok('null vector is null', Math.abs(G.dot([0, 0, 0, 0], k, k)) < 1e-12);
  const path = G.geodesic([0, 0, 0, 0], k, { lambdaMax: 8, dl: 0.002, every: 1 });
  const c0 = G.conserved(path[0].x, path[0].u); let worstE = 0, worstL = 0, worstN = 0, rMax = 0, backToAxis = false, tBack = NaN;
  for (const p of path) { const c = G.conserved(p.x, p.u); const r = Math.hypot(p.x[1], p.x[2]); worstE = Math.max(worstE, Math.abs(c.E - c0.E)); worstL = Math.max(worstL, Math.abs(c.L - c0.L)); worstN = Math.max(worstN, Math.abs(c.norm)); if (r > rMax) rMax = r; if (rMax > 0.8 && r < 0.01 && !backToAxis) { backToAxis = true; tBack = p.x[0]; } }
  ok('E conserved along null geodesic', worstE < 1e-6, worstE.toExponential(1));
  ok('L conserved (= 0 from the axis)', worstL < 1e-6, worstL.toExponential(1));
  ok('stays null', worstN < 1e-6, worstN.toExponential(1));
  ok('turning radius sinh r = 1', Math.abs(rMax - G.R_C) < 2e-3, `r_max = ${rMax.toFixed(4)}, asinh 1 = ${G.R_C.toFixed(4)}`);
  ok('light returns to the axis', backToAxis, 'at coordinate time t = ' + tBack.toFixed(3));
}
// 5 任意方向从 r = 0.6 和 r = 1.4（CTC 区）发出的光：守恒量
{
  for (const [r0, th] of [[0.6, 0.7], [0.6, 2.2], [0.6, -1.3], [1.4, 0.5], [1.4, 3.0]]) {
    const k = G.nullVector(r0, 0.3, th), x0 = G.pointCart(r0, 0.3, 0, 0);
    const path = G.geodesic(x0, k, { lambdaMax: 6, dl: 0.002, every: 1 });
    const c0 = G.conserved(path[0].x, path[0].u); let worst = 0;
    for (const p of path) { const c = G.conserved(p.x, p.u); worst = Math.max(worst, Math.abs(c.E - c0.E), Math.abs(c.L - c0.L), Math.abs(c.norm)); }
    ok(`conservation from r=${r0}, θ=${th}`, worst < 1e-5, worst.toExponential(1) + ' (' + path.length + ' pts)');
  }
}
// 6 物理换算：ω → CTC 半径 = √2 asinh(1)/ω，周期 2π/ω，Λ = −ω²
{
  const P = G.physical(2); ok('CTC radius', Math.abs(P.Rctc - Math.SQRT2 * G.R_C / 2) < 1e-12); ok('period', Math.abs(P.period - Math.PI) < 1e-12); ok('Λ = −ω²', P.Lambda === -4);
}
console.log(`\n全部通过 / all ${n} checks passed`);
