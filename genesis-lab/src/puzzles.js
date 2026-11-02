// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 反推台：隐藏一个宇宙，只给观测数据（全部是模拟的：由 cosmo.js 按隐藏参数算出再加噪声），玩家调参数把它反推出来。
const PUZZLES = (function () {
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const OR = 4.18e-5 / (0.674 * 0.674), RULER = 147.09; // 标准尺：声学视界（共动 Mpc）

  // 第一关的隐藏宇宙池（w = −1）
  const POOL = [
    { key: 'A', H0: 70, Om: 0.30, OL: 0.70, story: '平坦、暗能量主导：和我们的宇宙是近亲。' },
    { key: 'B', H0: 62, Om: 1.60, OL: 0.00, story: '封闭、物质过多：注定大坍缩。' },
    { key: 'C', H0: 73, Om: 0.15, OL: 0.00, story: '开放、物质稀薄：近乎匀速膨胀到永远。' },
    { key: 'D', H0: 58, Om: 1.00, OL: 0.00, story: '爱因斯坦–德西特：平坦、只有物质、减速膨胀到永远。' },
    { key: 'E', H0: 66, Om: 0.35, OL: 1.00, story: '封闭却在加速：Λ 赢过了曲率。' },
    { key: 'F', H0: 68, Om: 0.60, OL: 0.25, story: '开放、现在还在减速，但那点 Λ 终将接管并加速。' },
  ];
  function model(p) { return { H0: p.H0, Om: p.Om, Or: OR, OL: p.OL, w: -1 }; }

  // 生成一组观测：标准烛光（60 颗，已定标）、标准尺（8 把）、最老恒星年龄
  function observe(p, seed) {
    const r = mulberry32(seed), m = COSMO.norm(model(p)), T = COSMO.chiTable(m, 3), R = COSMO.solve(model(p)), gyr = COSMO.GYR / m.H0;
    const sn = [];
    for (let k = 0; k < 20; k++) { const z = 0.012 + 0.088 * Math.pow(r(), 0.9); const vp = (5 / Math.LN10) * 300 / (299792.458 * z); const sig = Math.sqrt(0.1 * 0.1 + vp * vp); sn.push({ z: +z.toFixed(4), sig: +sig.toFixed(3) }); }
    for (let k = 0; k < 40; k++) { const z = 0.1 + 1.7 * Math.pow(r(), 0.75); sn.push({ z: +z.toFixed(3), sig: +(0.1 + 0.06 * z).toFixed(3) }); }
    for (const d of sn) { const mu = COSMO.distances(m, T, d.z).mu; d.mu = +(mu + d.sig * gauss(r)).toFixed(3); }
    sn.sort((a, b) => a.z - b.z);
    const rulers = [];
    for (const z of [0.3, 0.5, 0.7, 1.0, 1.3, 1.7, 2.1, 2.6]) {
      const DM = COSMO.distances(m, T, z).DM; if (!(DM > 0)) continue;
      const th = RULER / DM * 180 / Math.PI, sig = 0.02 * th; rulers.push({ z, theta: +(th + sig * gauss(r)).toFixed(4), sig: +sig.toFixed(4) });
    }
    const tStars = (R.age - (isFinite(R.growth.tFirst) ? (R.growth.tFirst + R.age) : 0)) * gyr; // 第一批星系形成到今天
    const oldest = { t: +(tStars * (1 + 0.06 * gauss(r))).toFixed(2), sig: +(0.08 * tStars).toFixed(2) };
    return { sn, rulers, oldest, truth: p, R };
  }
  // 玩家模型对这组观测的 χ²
  function chi2(obs, p) {
    const m = COSMO.norm(model(p)), T = COSMO.chiTable(m, 3); let c = 0, n = 0, bad = false;
    const snModel = obs.sn.map((d) => { const mu = COSMO.distances(m, T, d.z).mu; if (!isFinite(mu)) { bad = true; return NaN; } c += ((d.mu - mu) / d.sig) ** 2; n++; return mu; });
    const rulerModel = obs.rulers.map((d) => { const DM = COSMO.distances(m, T, d.z).DM; if (!(DM > 0)) { bad = true; return NaN; } const th = RULER / DM * 180 / Math.PI; c += ((d.theta - th) / d.sig) ** 2; n++; return th; });
    let cSn = 0; for (let i = 0; i < obs.sn.length; i++) if (isFinite(snModel[i])) cSn += ((obs.sn[i].mu - snModel[i]) / obs.sn[i].sig) ** 2;
    const R = COSMO.solve(model(p)); const age = R.origin === 'bigbang' ? R.age * COSMO.GYR / p.H0 : Infinity;
    let agePen = 0; if (age < obs.oldest.t) { agePen = ((obs.oldest.t - age) / obs.oldest.sig) ** 2; c += agePen; } n++;
    return { chi2: c, n, perDof: c / n, bad, snModel, rulerModel, age, agePen, R, snPerDof: cSn / obs.sn.length, rulerPerDof: (c - cSn - agePen) / Math.max(1, obs.rulers.length) };
  }
  // 假设检验：Ω_Λ 固定为 0 时的最佳拟合（网格搜索）
  function bestFitNoLambda(obs) {
    let best = null;
    for (let H0 = 40; H0 <= 100; H0 += 1) for (let Om = 0; Om <= 3.0001; Om += 0.05) {
      const m = COSMO.norm({ H0, Om, Or: OR, OL: 0, w: -1 }), T = COSMO.chiTable(m, 3, 300); let c = 0, bad = false;
      for (const d of obs.sn) { const mu = COSMO.distances(m, T, d.z).mu; if (!isFinite(mu)) { bad = true; break; } c += ((d.mu - mu) / d.sig) ** 2; }
      if (bad) continue;
      for (const d of obs.rulers) { const DM = COSMO.distances(m, T, d.z).DM; if (!(DM > 0)) { bad = true; break; } c += ((d.theta - RULER / DM * 180 / Math.PI) / d.sig) ** 2; }
      if (bad) continue;
      if (!best || c < best.chi2) best = { H0, Om: +Om.toFixed(2), OL: 0, chi2: c };
    }
    if (best) { const full = chi2(obs, best); best.chi2 = full.chi2; best.perDof = full.perDof; }
    return best;
  }
  const geomClass = (p) => { const Ok = 1 - p.Om - OR - p.OL; return Math.abs(Ok) < 0.08 ? 'flat' : (Ok > 0 ? 'open' : 'closed'); };
  // 锁定答案：比几何、命运、参数
  function judge(obs, p) {
    const truth = obs.truth, Rt = obs.R, Rp = COSMO.solve(model(p));
    const geomOK = geomClass(p) === geomClass(truth), fateOK = Rp.fate === Rt.fate && (Rp.fate !== 'eternal' || Rp.accelerating === Rt.accelerating);
    const dOm = Math.abs(p.Om - truth.Om), dOL = Math.abs(p.OL - truth.OL), dH = Math.abs(p.H0 - truth.H0) / truth.H0;
    const precise = dOm < 0.15 && dOL < 0.2 && dH < 0.06;
    const stars = (geomOK ? 1 : 0) + (fateOK ? 1 : 0) + (precise ? 1 : 0);
    return { geomOK, fateOK, precise, stars, truth, Rt, Rp, geomTruth: geomClass(truth), geomPlayer: geomClass(p) };
  }
  return { POOL, OR, RULER, model, observe, chi2, bestFitNoLambda, judge, geomClass };
})();
if (typeof module !== 'undefined') module.exports = PUZZLES;
