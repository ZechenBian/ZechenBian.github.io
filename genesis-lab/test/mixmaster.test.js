// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// Mixmaster 引擎对照：Kasner 极限、各向同性尘埃 = 封闭 FLRW（摆线）、约束守恒、BKL 高斯映射
const assert = require('assert');
const MX = require('../src/mixmaster.js');
let n = 0; function ok(name, cond, info) { n++; assert.ok(cond, name + (info ? '：' + info : '')); console.log('✓ ' + name + (info ? '：' + info : '')); }

// 1 Kasner 参数化：Σp = 1，Σp² = 1，u 还原
for (const u of [1.2, 2, 3.7, 10]) { const p = MX.kasnerFromU(u); ok(`Kasner u=${u}`, Math.abs(p[0] + p[1] + p[2] - 1) < 1e-12 && Math.abs(p[0] ** 2 + p[1] ** 2 + p[2] ** 2 - 1) < 1e-12 && Math.abs(MX.uFromKasner(p) - u) < 1e-9); }
// 2 真空、尺度很小 → 势能可忽略 → 指数是 Kasner 的，并且在一段 τ 里不变
{
  const R = MX.solve({ a0: 1e-3, shear: 1, chi: 0.4, tauMax: 2 });
  const p0 = MX.velocityExponents(R.y0);
  ok('vacuum small-scale start is Kasner', Math.abs(p0[0] + p0[1] + p0[2] - 1) < 1e-3 && Math.abs(p0[0] ** 2 + p0[1] ** 2 + p0[2] ** 2 - 1) < 2e-3, p0.map((v) => v.toFixed(3)).join(','));
  const iLast = R.y.length - 1, pL = MX.velocityExponents(R.y[iLast]);
  ok('exponents stay constant over the epoch', Math.max(...pL.map((v, k) => Math.abs(v - p0[k]))) < 2e-3, pL.map((v) => v.toFixed(3)).join(','));
}
// 3 各向同性尘埃 = 封闭 FLRW：a_max = 4M/3，寿命 8πM/3（R = 2a 的摆线）
{
  // 各向同性时 BKL 时间 τ 到不了奇点（a ∝ |τ|^{-2/3}），所以比的是从最大膨胀到某个 a 的宇宙时：摆线 R = 2a = (R_max/2)(1 − cos η)，t = (R_max/2)(η − sin η)
  const M = 0.5, R = MX.solve({ a0: 0.05, shear: 0, M, tauMax: 400, hMax: 0.02, every: 1 });
  let iMax = 0; for (let i = 0; i < R.y.length; i++) if (R.y[i][0] > R.y[iMax][0]) iMax = i;
  const amax = Math.exp(R.y[iMax][0]), Rmax = 8 * M / 3, aEnd = Math.exp(R.y[0][0]), eta = Math.acos(1 - 2 * (2 * aEnd) / Rmax), dtA = (Rmax / 2) * (Math.PI - (eta - Math.sin(eta))), dtN = R.y[iMax][6] - R.y[0][6];
  ok('dust closed: a_max = 4M/3', Math.abs(amax - 4 * M / 3) / (4 * M / 3) < 2e-3, `${amax.toFixed(4)} vs ${(4 * M / 3).toFixed(4)}`);
  ok('dust closed: cycloid timing from a_end to a_max', Math.abs(dtN - dtA) / dtA < 2e-3, `${dtN.toFixed(4)} vs ${dtA.toFixed(4)} (a_end = ${aEnd.toExponential(2)})`);
  ok('isotropic stays isotropic', Math.max(...R.y.map((y) => Math.abs(y[0] - y[1]) + Math.abs(y[1] - y[2]))) < 1e-9);
  ok('constraint preserved (dust)', Math.max(...R.cerr) < 1e-5, Math.max(...R.cerr).toExponential(1));
}
// 4 真空 Mixmaster：约束守恒；两端都是奇点；从精确 Kasner 态（u = 3.7）出发，靠近大爆炸的时代序列满足 BKL 的高斯映射
{
  const R = MX.solve({ a0: 0.3, shear: 0.9, chi: 0.7 });
  let cm = 0; for (const c of R.cerr) if (c > cm) cm = c;
  ok('vacuum constraint preserved', cm < 1e-3, cm.toExponential(1));
  ok('vacuum Bianchi IX recollapses', R.Tbang && R.Tcrunch, R.pastStop + '/' + R.futStop);
  for (const u0 of [3.7, 5.5]) {
    const K = MX.solve({ u: u0, a0: 0.02, lambda: 1 }), ep = K.epochs.slice().reverse(); // 从起始时代往奇点方向列
    ok(`u=${u0}: several Kasner epochs found`, ep.length >= 5, ep.map((e) => e.u.toFixed(3)).join(' → '));
    let u = u0, worst = 0; const pred = []; for (let k = 0; k < ep.length; k++) { pred.push(u.toFixed(3)); worst = Math.max(worst, Math.abs(ep[k].u - u) / u); u = MX.bklMap(u); }
    ok(`u=${u0}: sequence follows the BKL map u→u−1 / 1/(u−1)`, worst < 0.03, `worst rel. err ${worst.toFixed(3)}; BKL: ${pred.join(' → ')}`);
  }
}
// 5 带尘埃：膨胀到最大再坍缩；奇点附近仍是 Kasner 振荡
{
  const R = MX.solve({ a0: 0.3, shear: 0.9, chi: 0.7, M: 1 });
  ok('dust Bianchi IX: big bang and big crunch', R.Tbang && R.Tcrunch && isFinite(R.tCrunch - R.tBang), `lifetime ${(R.tCrunch - R.tBang).toFixed(3)}`);
  ok('dust: Kasner epochs near the singularity', R.epochs.length >= 3, R.epochs.map((e) => e.u.toFixed(2)).join(' → '));
}
console.log(`\n全部通过 / all ${n} checks passed`);
