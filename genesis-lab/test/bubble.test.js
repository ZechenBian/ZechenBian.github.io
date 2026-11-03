// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 泡泡宇宙引擎对照：假真空存活概率的闭式 vs 数值积分、永恒暴胀阈值、二维泡沫模拟的假真空份额 vs 解析、泡内曲率
const assert = require('assert');
const B = require('../src/bubble.js');
let n = 0; function ok(name, cond, info) { n++; assert.ok(cond, name + (info ? '：' + info : '')); console.log('✓ ' + name + (info ? '：' + info : '')); }
const simpson = (f, x) => { const m = 2000; let s = 0; for (let i = 0; i <= m; i++) { const u = x * i / m, w = (i === 0 || i === m) ? 1 : (i % 2 ? 4 : 2); s += w * f(u); } return s * (x / m) / 3; };
// 1 闭式积分
for (const x of [0.5, 2, 6]) { ok(`∫(1−e^{−u})³ closed form at x=${x}`, Math.abs(B.surv3Int(x) - simpson((u) => (1 - Math.exp(-u)) ** 3, x)) < 1e-8); ok(`∫(1−e^{−u})² closed form at x=${x}`, Math.abs(B.surv2Int(x) - simpson((u) => (1 - Math.exp(-u)) ** 2, x)) < 1e-8); }
// 2 永恒暴胀阈值：三维 9/4π，二维 2/π；阈值处体积增长指数为零
ok('3D critical rate 9/4π', Math.abs(B.eternal3(9 / (4 * Math.PI)).exponent) < 1e-12 && B.eternal3(0.5).eternal && !B.eternal3(0.8).eternal);
ok('2D critical rate 2/π', Math.abs(B.eternal2(2 / Math.PI).exponent) < 1e-12 && B.eternal2(0.3).eternal && !B.eternal2(0.7).eternal);
// 3 存活概率随时间单调下降，趋于 exp[−(4π/3)λ(Ht − 11/6)]
{ const l = 0.3; ok('survival decreases', B.survival3(l, 1) > B.survival3(l, 2) && B.survival3(l, 2) > B.survival3(l, 5)); ok('late-time asymptote', Math.abs(Math.log(B.survival3(l, 12)) + 4 * Math.PI / 3 * l * (12 - 11 / 6)) < 1e-3); }
// 4 二维泡沫：假真空份额和解析式在统计误差内一致（λ₂ = 0.2，到 Ht = 3.2）
{
  let F = null, s = 0; for (let seed = 1; seed <= 12; seed++) { F = new B.Foam2D({ lam2: 0.2, W: 30, seed }); for (let k = 0; k < 64; k++) F.step(0.05); s += F.falseFraction(3000); }
  const sim = s / 12, an = B.survival2(0.2, F.t); // 单次模拟涨落大（早成核的大泡吃掉一片），按 12 个种子平均
  ok('2D foam false-vacuum fraction ≈ analytic survival (12-seed mean)', Math.abs(sim - an) < 0.06, `${sim.toFixed(3)} vs ${an.toFixed(3)} at Ht = ${F.t.toFixed(2)}`);
  ok('bubbles collide', F.collisions.length > 0, F.collisions.length + ' collisions');
  ok('bubble physical radius R = e^{H(t−t_n)} − 1', Math.abs(F.phys(F.bubbles[0]).R - (Math.exp(F.t - F.bubbles[0].tn) - 1)) < 1e-12);
}
// 5 泡内曲率：N = N* 时 Ω_k = 1，每多一个 e-fold 缩 e²
ok('interior curvature scaling', Math.abs(B.interiorCurvature(60) - 1) < 1e-12 && Math.abs(B.interiorCurvature(61) / B.interiorCurvature(62) - Math.E ** 2) < 1e-9);
console.log(`\n全部通过 / all ${n} checks passed`);
