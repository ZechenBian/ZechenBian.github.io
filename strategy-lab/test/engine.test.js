// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
const { QL, STRATS, compile, defaults, world, SET0, ok, near, section, done, meanSd } = require("./harness.js");
const RNG = QL.RNG;

/* ---------- 随机数 ---------- */
section("随机数");
{
  const g = new RNG(1, 0, 0), n = 400000;
  let s = 0, s2 = 0, s4 = 0;
  for (let i = 0; i < n; i++) { const x = g.u(); s += x; s2 += x * x; }
  near(s / n, 0.5, 0.003, "均匀分布的均值"); near(s2 / n - (s / n) ** 2, 1 / 12, 0.001, "均匀分布的方差");
  s = s2 = s4 = 0;
  for (let i = 0; i < n; i++) { const x = g.normal(); s += x; s2 += x * x; s4 += x ** 4; }
  near(s / n, 0, 0.006, "正态均值"); near(s2 / n, 1, 0.01, "正态方差"); near(s4 / n, 3, 0.06, "正态四阶矩");
  for (const nu of [3, 5, 10]) { s2 = 0; for (let i = 0; i < n; i++) { const x = g.t(nu); s2 += x * x; } near(s2 / n, nu / (nu - 2), nu === 3 ? 0.35 : 0.06, `t(${nu}) 方差`); }
  for (const k of [0.5, 2.5, 7]) { s = 0; for (let i = 0; i < n; i++) s += g.gamma(k); near(s / n, k, 0.02 * Math.max(1, k), `Gamma(${k}) 均值`); }
  for (const lam of [0.02, 3, 50]) { s = 0; s2 = 0; for (let i = 0; i < n; i++) { const x = g.poisson(lam); s += x; s2 += x * x; } near(s / n, lam, 0.02 * Math.max(0.05, lam), `Poisson(${lam}) 均值`); }
  s = 0; s2 = 0; for (let i = 0; i < n; i++) { const x = g.laplace(); s += x; s2 += x * x; } near(s2 / n, 2, 0.03, "Laplace 方差");
  s = 0; for (let i = 0; i < n; i++) s += g.exp(2); near(s / n, 0.5, 0.004, "指数分布均值");
  // 可复现与流独立
  const a = new RNG(5, 3, 0), b = new RNG(5, 3, 0), c = new RNG(5, 4, 0), d = new RNG(5, 3, 1);
  const xa = a.u(), xb = b.u(), xc = c.u(), xd = d.u();
  ok(xa === xb, "同样的 (种子, 路径, 批次) 给出同样的数"); ok(xa !== xc && xa !== xd, "不同路径、不同批次给出不同的数");
  // 相邻流不相关
  let cs = 0; for (let k = 0; k < 4000; k++) { const p = new RNG(11, k, 0), q = new RNG(11, k + 1, 0); cs += (p.u() - 0.5) * (q.u() - 0.5); }
  near(cs / 4000 * 12, 0, 0.06, "相邻路径的首个随机数不相关");
  near(QL.expectedMaxNormal(100), 2.5076, 0.02, "100 个正态最大值的期望"); near(QL.normInv(0.975), 1.95996, 1e-4, "正态分位数");
}

/* ---------- 世界 ---------- */
section("世界：有限性与矩");
function rets(B) { return B.R; }
function logRets(B) { const out = new Float64Array(B.N * B.T); for (let n = 0; n < B.N; n++) for (let t = 0; t < B.T; t++) out[n * B.T + t] = Math.log(B.L[n * (B.T + 1) + t + 1] / B.L[n * (B.T + 1) + t]); return out; }
function acf1(B, f) { // 按路径去均值的 lag-1 自相关
  let num = 0, den = 0; f = f || (x => x);
  for (let n = 0; n < B.N; n++) { let m = 0; for (let t = 0; t < B.T; t++) m += f(B.R[n * B.T + t]); m /= B.T; for (let t = 0; t < B.T; t++) { const a = f(B.R[n * B.T + t]) - m; den += a * a; if (t + 1 < B.T) num += a * (f(B.R[n * B.T + t + 1]) - m); } }
  return num / den;
}
for (const type of Object.keys(QL.WORLDS)) {
  if (QL.WORLDS[type].needsData || QL.WORLDS[type].needsCode || QL.WORLDS[type].game) continue;   // 玩法不是价格序列，另有 games.test.js
  const cfg = world(type, null, 300, 200), B = QL.makeBatch(cfg, null, 0);
  let bad = 0; for (let i = 0; i < B.L.length; i++) if (!(B.L[i] > 0) || !isFinite(B.L[i])) bad++;
  for (let i = 0; i < B.R.length; i++) if (!(B.R[i] >= -1) || !isFinite(B.R[i])) bad++;
  ok(bad === 0, `${type}: 价格为有限正数、收益 ≥ −1`, `bad=${bad}`);
  const B2 = QL.makeBatch(Object.assign({}, cfg, { N: 50 }), null, 0);
  let same = true; for (let i = 0; i < 50 * 201; i++) if (B.L[i] !== B2.L[i]) { same = false; break; }
  ok(same, `${type}: 第 i 条路径与总路径数无关`);
  const B3 = QL.makeBatch(cfg, null, 1); ok(B3.L[5] !== B.L[5] || B3.L[50] !== B.L[50], `${type}: 新批次与训练批次不同`);
  const st = QL.worldStats(B); ok(isFinite(st.sd) && st.fan.q50.length === st.grid.length && st.hist.counts.length === 61, `${type}: 世界统计可算`);
}
{
  const K = 252, dt = 1 / K;
  let B = QL.makeBatch(world("gbm", { mu: 8, sigma: 20 }, 2000, 252), null, 0), [m, s] = meanSd(logRets(B));
  near(m, (0.08 - 0.02) * dt, 3 * 0.2 * Math.sqrt(dt) / Math.sqrt(B.N * B.T), "GBM 对数收益均值"); near(s, 0.2 * Math.sqrt(dt), 2e-4, "GBM 对数收益标准差");
  for (const dist of ["normal", "t", "laplace", "uniform", "twopoint", "mixture", "skewL", "skewR"]) {
    B = QL.makeBatch(world("iid", { dist, mu: 10, sigma: 25, q: 0.3, nu: 4 }, 2000, 252), null, 0); [m, s] = meanSd(rets(B));
    const se = 0.25 * Math.sqrt(dt) / Math.sqrt(B.N * B.T);
    near(m, 0.10 * dt, 4 * se, `iid/${dist} 每步均值`); near(s / (0.25 * Math.sqrt(dt)), 1, dist === "t" ? 0.06 : 0.02, `iid/${dist} 每步标准差`);
  }
  // 偏度的符号
  const skew = (dist) => QL.worldStats(QL.makeBatch(world("iid", { dist }, 1000, 252), null, 0)).skew;
  ok(skew("skewL") < -1.5 && skew("skewR") > 1.5, "左偏/右偏分布的偏度符号正确", `${skew("skewL").toFixed(2)}, ${skew("skewR").toFixed(2)}`);
  ok(QL.worldStats(QL.makeBatch(world("iid", { dist: "t", nu: 4 }, 2000, 252), null, 0)).kurt > 5, "t(4) 厚尾");
  // 下注
  B = QL.makeBatch(world("bet", { p: 0.6, b: 2 }, 2000, 100), null, 0); let w = 0; for (const x of B.R) { if (x === 2) w++; else if (x !== -1) w = NaN; }
  near(w / B.R.length, 0.6, 0.004, "下注游戏胜率");
  // OU
  B = QL.makeBatch(world("ou", { kappa: 8, sigma: 20, theta: 100, start: 100 }, 1500, 1000), null, 0);
  { let s2 = 0, c = 0, num = 0, den = 0; for (let n = 0; n < B.N; n++) for (let t = 500; t <= 1000; t++) { const x = Math.log(B.L[n * 1001 + t] / 100); s2 += x * x; c++; if (t < 1000) { num += x * Math.log(B.L[n * 1001 + t + 1] / 100); den += x * x; } }
    near(Math.sqrt(s2 / c), 0.2 / Math.sqrt(16), 0.002, "OU 平稳标准差 σ/√(2κ)"); near(num / den, Math.exp(-8 / 252), 0.002, "OU 一步自回归系数 e^{-κΔ}"); }
  // 跳跃：期望收益已补偿
  B = QL.makeBatch(world("jump", { mu: 8, sigma: 15, lam: 5, muJ: -5, sigJ: 6 }, 4000, 252), null, 0);
  { let s1 = 0; for (let n = 0; n < B.N; n++) s1 += B.L[n * 253 + 252] / 100; const [, sd] = meanSd(Array.from({ length: B.N }, (_, n) => B.L[n * 253 + 252] / 100));
    near(s1 / B.N, Math.exp(0.08), 4 * sd / Math.sqrt(B.N), "跳跃扩散 E[S_T] = e^{μT}"); }
  // Heston
  B = QL.makeBatch(world("heston", { mu: 8, sigma: 20, kappa: 3, xi: 0.4, rho: -0.7 }, 2000, 504), null, 0); [m, s] = meanSd(logRets(B));
  near(s * Math.sqrt(K), 0.2, 0.012, "Heston 平均波动接近长期值"); ok(acf1(B, x => x * x) > 0.02, "Heston 平方收益正自相关");
  // GARCH
  B = QL.makeBatch(world("garch", { mu: 5, sigma: 20, alpha: 0.1, beta: 0.85 }, 2000, 504), null, 0); [m, s] = meanSd(rets(B));
  near(s * Math.sqrt(K), 0.2, 0.012, "GARCH 无条件波动"); ok(acf1(B, x => x * x) > 0.08, "GARCH 平方收益正自相关"); near(acf1(B), 0, 0.01, "GARCH 收益本身不相关");
  // AR(1)
  for (const phi of [-0.3, 0.2]) { B = QL.makeBatch(world("ar1", { mu: 5, sigma: 20, phi }, 2000, 252), null, 0); [m, s] = meanSd(rets(B)); near(acf1(B), phi, 0.012, `AR(1) 自相关 φ=${phi}`); near(s / (0.2 * Math.sqrt(dt)), 1, 0.02, `AR(1) 无条件波动 φ=${phi}`); }
  // 牛熊
  B = QL.makeBatch(world("regime", { durB: 1.5, durR: 0.5 }, 2000, 504), null, 0); ok(acf1(B) > 0.002, "牛熊切换：收益弱正自相关", acf1(B).toFixed(4));
  // 分数布朗运动
  for (const H of [0.3, 0.5, 0.75]) {
    B = QL.makeBatch(world("fbm", { H, mu: 0, sigma: 20 }, 1500, 256), null, 0); const lr = logRets(B); [m, s] = meanSd(lr);
    near(s / (0.2 * Math.sqrt(dt)), 1, 0.02, `fBm 单步波动 H=${H}`);
    let num = 0, den = 0, v16 = 0; for (let n = 0; n < B.N; n++) { for (let t = 0; t < 256; t++) { const a = lr[n * 256 + t]; den += a * a; if (t < 255) num += a * lr[n * 256 + t + 1]; } for (let j = 0; j < 16; j++) { let sum = 0; for (let k = 0; k < 16; k++) sum += lr[n * 256 + j * 16 + k]; v16 += sum * sum; } }
    near(num / den, Math.pow(2, 2 * H - 1) - 1, 0.012, `fBm 相邻增量相关系数 H=${H}`);
    near(Math.log(v16 / (B.N * 16) / (s * s)) / Math.log(16), 2 * H, 0.03, `fBm 16 步增量方差 ∝ 16^{2H}, H=${H}`);
  }
  // Logistic
  B = QL.makeBatch(world("logistic", { a: 4, noise: 0, v: 2 }, 500, 252), null, 0);
  { const x = (lv) => Math.log(lv / 100) / 0.02 * 0.35355339 + 0.5; let err = 0, s1 = 0, s2 = 0, c = 0, num = 0;
    for (let n = 0; n < B.N; n++) for (let t = 0; t < 252; t++) { const a = x(B.L[n * 253 + t]), b = x(B.L[n * 253 + t + 1]); err = Math.max(err, Math.abs(b - 4 * a * (1 - a))); s1 += a; s2 += a * a; c++; num += (a - 0.5) * (b - 0.5); }
    ok(err < 2e-3, "Logistic：下一步 = 4x(1−x)", `最大误差 ${err.toExponential(2)}`); near(s1 / c, 0.5, 0.01, "Logistic 均值"); near(s2 / c - 0.25, 1 / 8, 0.004, "Logistic 方差 1/8"); near(num / c / (1 / 8), 0, 0.02, "Logistic 线性自相关为 0"); }
  // Lorenz
  B = QL.makeBatch(world("lorenz", { tau: 0.05, noise: 0, v: 2 }, 300, 400), null, 0);
  { const xs = []; for (let i = 0; i < B.L.length; i++) xs.push(Math.log(B.L[i] / 100) / 0.02); const [mm, ss] = meanSd(xs); near(ss, 1, 0.06, "洛伦兹 x 的标准化（σₓ≈7.93）"); near(mm, 0, 0.12, "洛伦兹 x 均值约为 0"); }
  // 谐振子
  B = QL.makeBatch(world("osc", { period: 40, rho: 0.97, noise: 0, v: 3 }, 1000, 252), null, 0);
  { const xs = []; for (let i = 0; i < B.L.length; i++) xs.push(Math.log(B.L[i] / 100) / 0.03); const [, ss] = meanSd(xs); near(ss, 1, 0.06, "谐振子标准化后标准差为 1");
    // OLS 复原 AR(2) 系数
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0; for (let n = 0; n < B.N; n++) for (let t = 2; t <= 252; t++) { const y = xs[n * 253 + t], x1 = xs[n * 253 + t - 1], x2 = xs[n * 253 + t - 2]; a11 += x1 * x1; a12 += x1 * x2; a22 += x2 * x2; b1 += x1 * y; b2 += x2 * y; }
    const det = a11 * a22 - a12 * a12, f1 = (b1 * a22 - b2 * a12) / det, f2 = (a11 * b2 - a12 * b1) / det;
    near(f1, 2 * 0.97 * Math.cos(2 * Math.PI / 40), 0.01, "谐振子 φ₁"); near(f2, -0.97 * 0.97, 0.01, "谐振子 φ₂"); }
}

/* ---------- 真实数据 / bootstrap ---------- */
section("真实数据与 bootstrap");
{
  const g = new RNG(3, 0, 0), series = [100]; for (let i = 1; i < 1000; i++) series.push(series[i - 1] * Math.exp(0.0003 + 0.01 * g.normal()));
  const ext = { series: Float64Array.from(series) };
  let cfg = { type: "real", params: { mode: "whole", split: 70 }, N: 1, T: 0, K: 252, seed: 1 };
  let tr = QL.makeBatch(cfg, ext, 0), te = QL.makeBatch(cfg, ext, 1);
  ok(tr.N === 1 && tr.T === 699 && te.T === 299, "整段：训练 700 点、测试 300 点", `${tr.T}, ${te.T}`);
  near(tr.L[699], series[699], 1e-3, "训练段终点对齐"); near(te.L[0], series[700], 1e-3, "测试段起点对齐"); near(tr.R[0], series[1] / series[0] - 1, 1e-7, "收益由价格算出");
  cfg = { type: "real", params: { mode: "windows", split: 70, L: 100, stride: 20 }, N: 1, T: 0, K: 252, seed: 1 };
  tr = QL.makeBatch(cfg, ext, 0); te = QL.makeBatch(cfg, ext, 1);
  ok(tr.T === 100 && tr.N === Math.floor((700 - 100 - 1) / 20) + 1, "滚动窗口数量", `N=${tr.N}`);
  let leak = false; tr.starts.forEach(s => { if (s + 100 >= 700) leak = true; }); te.starts.forEach(s => { if (s < 700) leak = true; }); ok(!leak, "训练窗口不越过切分点，测试窗口不早于切分点");
  cfg = { type: "boot", params: { block: 10 }, N: 500, T: 252, K: 252, seed: 2 };
  const bb = QL.makeBatch(cfg, { series: ext.series, split: 0.7 }, 0), src = new Set(); for (let t = 0; t < 699; t++) src.add(Math.fround(series[t + 1] / series[t] - 1));
  let all = true; for (let i = 0; i < 5000; i++) if (!src.has(bb.R[i])) { all = false; break; } ok(all, "bootstrap 的收益全部来自训练段");
  let cont = 0, tot = 0; const idxOf = new Map(); for (let t = 0; t < 699; t++) idxOf.set(Math.fround(series[t + 1] / series[t] - 1), t);
  for (let n = 0; n < 500; n++) for (let t = 0; t < 251; t++) { const a = idxOf.get(bb.R[n * 252 + t]), b = idxOf.get(bb.R[n * 252 + t + 1]); tot++; if (b === a + 1 || (a === 698 && b === 0)) cont++; }
  near(cont / tot, 0.9, 0.01, "bootstrap 平均块长 10（相邻延续概率 0.9）");
}

/* ---------- 执行与指标 ---------- */
section("执行：理论对照");
const S = Object.fromEntries(STRATS.map(s => [s.id, s]));
const run = (cfg, id, over, set, opt, batch) => { const B = batch || QL.makeBatch(cfg, null, 0); const st = compile(S[id].code); return [QL.runBatch(B, st, Object.assign(defaults(S[id].params), over || {}), Object.assign({}, SET0, set || {}), opt || {}), B]; };
{
  // 1) GBM 上的固定比例：E log W_T = T(fμ − f²σ²/2)
  const cfg = world("gbm", { mu: 8, sigma: 20 }, 4000, 252), B = QL.makeBatch(cfg, null, 0);
  for (const f of [0.5, 1, 2, 3]) {
    const [r] = run(cfg, "const", { f }, null, null, B), sm = QL.summarize(r, SET0);
    near(sm.growth, f * 0.08 - 0.5 * f * f * 0.04, 3.2 * sm.growthSE, `GBM 固定比例 f=${f} 的增长率`);
  }
  // 理论峰值
  const th = QL.WORLDS.gbm.theory(cfg.params, { K: 252, rf: 0 }); near(th.fStar, 2, 1e-9, "GBM 的 f* = μ/σ²"); near(th.gOfF(2), 0.08, 1e-12, "GBM 的 g* = μ²/(2σ²)"); near(th.gOfF(4), 0, 1e-12, "GBM：g(2f*) = r");
  // 2) 下注游戏：精确公式
  const cb = world("bet", { p: 0.6, b: 1 }, 6000, 200), Bb = QL.makeBatch(cb, null, 0), thb = QL.WORLDS.bet.theory(cb.params);
  near(thb.fStar, 0.2, 1e-12, "下注 f* = p − q/b");
  for (const f of [0.1, 0.2, 0.4]) { const [r] = run(cb, "const", { f }, { fmin: 0, fmax: 1 }, null, Bb), sm = QL.summarize(r, SET0); near(sm.growth, thb.gOfF(f), 3.2 * sm.growthSE, `下注 f=${f} 的每局增长率`); }
  { const [r] = run(cb, "const", { f: 1 }, { fmin: 0, fmax: 1 }, null, Bb), sm = QL.summarize(r, SET0); ok(sm.growth === -Infinity && sm.pRuin > 0.999, "全押必然破产，增长率 −∞", `pRuin=${sm.pRuin}`);
    near(sm.meanW, Math.pow(1.2, 200) * 0 + sm.meanW, 1, "（全押的期望财富由极少数路径决定，不检验数值）"); }
  // 3) 两点分布：精确 Kelly
  const ct = world("iid", { dist: "twopoint", mu: 10, sigma: 30, q: 0.5 }, 6000, 252), Bt = QL.makeBatch(ct, null, 0), tht = QL.WORLDS.iid.theory(ct.params, { K: 252, rf: 0 });
  { let best = -1e9, bf = 0; for (let f = 0; f < 4; f += 0.001) { const g = tht.gOfF(f); if (g > best) { best = g; bf = f; } } near(tht.fStar, bf, 2e-3, "两点分布 f* 的闭式解 = 数值极大点"); }
  for (const f of [0.5, 1.1, 2]) { const [r] = run(ct, "const", { f }, null, null, Bt), sm = QL.summarize(r, SET0); near(sm.growth, tht.gOfF(f), 3.2 * sm.growthSE, `两点分布 f=${f} 的增长率`); }
  // 4) 鞅世界：任何只看过去的规则期望为零
  const cm = world("iid", { dist: "normal", mu: 0, sigma: 20 }, 6000, 252), Bm = QL.makeBatch(cm, null, 0);
  for (const id of ["mom", "ma", "meanrev", "stop", "martingale", "voltarget", "kellyest", "grid"]) {
    const [r] = run(cm, id, null, { fmin: -3, fmax: 3 }, null, Bm), sm = QL.summarize(r, SET0);
    near(sm.meanW, 1, 3.5 * sm.meanWSE, `鞅世界里 ${id} 的 E[W_T] = 1`);
  }
  // 5) 偷看未来的规则拿不到未来
  { const cheat = compile(`function decide(s){ var a = s.p(-1), b = s.ret(-1), c = s.mom(0), d = s.prices(5).length, e = s.rets(9).length; if (a === a || b === b) return 1e9; return (d <= s.t + 1 && e <= s.t) ? 0 : 1e9; }`);
    const r = QL.runBatch(Bm, cheat, {}, SET0, {}); let allOne = true; for (const w of r.WT) if (w !== 1) allOne = false; ok(allOne && r.bad === 0, "访问未来返回 NaN，历史数组不越过当前步"); }
  { // 直接用下一步收益的作弊规则在引擎里写不出来；手工构造作为对照，确认检验有区分度
    const R = Bm.R, T = Bm.T; let s = 0; for (let n = 0; n < Bm.N; n++) { let w = 1; for (let t = 0; t < T; t++) w *= 1 + Math.sign(R[n * T + t]) * R[n * T + t]; s += w; } ok(s / Bm.N > 5, "对照：真偷看未来时 E[W_T] 远大于 1", (s / Bm.N).toFixed(1)); }
}
section("执行：记账细节");
{
  const cfg = world("gbm", { mu: 8, sigma: 20 }, 300, 252), B = QL.makeBatch(cfg, null, 0), T = 252;
  // 买入持有：只在开头付一次成本，之后零换手
  let [r] = run(cfg, "hold", null, { costBps: 10 }, null, B);
  let maxErr = 0; for (let n = 0; n < B.N; n++) { const w = (1 - 0.001) * B.L[n * 253 + 252] / B.L[n * 253]; maxErr = Math.max(maxErr, Math.abs(r.WT[n] / w - 1)); }
  ok(maxErr < 2e-4, "买入持有：W_T = (1−c)·S_T/S_0", `相对误差 ${maxErr.toExponential(2)}`); near(r.TO[0], 1, 1e-6, "买入持有换手 = 1");
  // 固定比例 f=0.5：每步都要再平衡，换手 > 0.5
  [r] = run(cfg, "const", { f: 0.5 }, null, null, B); ok(r.TO[0] > 0.5 && r.TO[0] < 3, "固定比例有再平衡换手", r.TO[0].toFixed(3));
  // 手工复算一条路径（f=0.5，成本 20bp，利率 3%）
  { const set = { costBps: 20, rf: 3 }; [r] = run(cfg, "const", { f: 0.5 }, set, { detail: 0 }, B); let W = 1, pos = 0; const c = 0.002, rf = 0.03 / 252;
    for (let t = 0; t < T; t++) { const x = B.R[t], base = 1 + 0.5 * x + 0.5 * rf; W *= (1 - c * Math.abs(0.5 - pos)) * base; pos = 0.5 * (1 + x) / base; }
    near(r.WT[0], W, 1e-12, "手工复算：成本 + 利率 + 仓位漂移"); near(r.det.w[T], W, 1e-6, "单路径明细的终值一致"); }
  // 空仓拿利息
  { const cash = compile("function decide(){ return 0; }"), rr = QL.runBatch(B, cash, {}, Object.assign({}, SET0, { rf: 5 }), {}); near(rr.WT[0], Math.pow(1 + 0.05 / 252, 252), 1e-12, "空仓：按无风险利率复利"); }
  // 上下限与杠杆倍数
  { const big = compile("function decide(){ return 10; }"), a = QL.runBatch(B, big, {}, Object.assign({}, SET0, { fmax: 2 }), {}), b2 = QL.runBatch(B, compile("function decide(){ return 2; }"), {}, SET0, {}); near(a.WT[3], b2.WT[3], 1e-12, "仓位上限截断");
    const l = QL.runBatch(B, compile("function decide(){ return 1; }"), {}, Object.assign({}, SET0, { lam: 2 }), {}); near(l.WT[3], b2.WT[3], 1e-12, "杠杆倍数 λ 等价于仓位乘以 λ"); }
  // 无效返回值按空仓处理并计数
  { const nanS = compile("function decide(s){ return s.t < 10 ? NaN : 1; }"), rr = QL.runBatch(B, nanS, {}, SET0, {}); ok(rr.bad === 10 * B.N, "NaN 仓位计数", String(rr.bad)); }
  // 指标与直接计算一致
  { const set = Object.assign({}, SET0, { ddLimit: 20 }); [r] = run(cfg, "const", { f: 1.5 }, set, { fan: true }, B); const bench = QL.runBatch(B, QL.benchFor("gbm"), {}, set, {}), sm = QL.summarize(r, set, bench);
    const lw = Array.from(r.WT, Math.log), [ml, sl] = meanSd(lw); near(sm.growth, ml, 1e-12, "增长率 = 平均对数终值 / 年数"); near(sm.growthSE, sl * Math.sqrt(B.N / (B.N - 1)) / Math.sqrt(B.N), 1e-12, "增长率标准误");
    // 夏普：逐步复算
    let s1 = 0, s2 = 0, c = 0; for (let n = 0; n < B.N; n++) { let W = 1, pos = 0; for (let t = 0; t < T; t++) { const x = B.R[n * T + t], base = 1 + 1.5 * x - 0.5 * 0; const g = base; s1 += g - 1; s2 += (g - 1) ** 2; c++; } }
    const m = s1 / c, sd = Math.sqrt(s2 / c - m * m); near(sm.sharpe, m / sd * Math.sqrt(252), 1e-9, "夏普 = 汇总均值/标准差·√K");
    // 最大回撤：复算第 0 条
    { let W = 1, peak = 1, mdd = 0; for (let t = 0; t < T; t++) { W *= 1 + 1.5 * B.R[t]; if (W > peak) peak = W; else mdd = Math.max(mdd, 1 - W / peak); } near(r.DD[0], mdd, 1e-6, "最大回撤"); }
    let hit = 0; for (const d of r.DD) if (d >= 0.2) hit++; near(sm.pDD, hit / B.N, 1e-12, "回撤超限的比例");
    // 配对差
    let d = 0; for (let n = 0; n < B.N; n++) d += Math.log(r.WT[n] / bench.WT[n]); near(sm.dGrowth, d / B.N, 1e-12, "相对基准的配对增长率差");
    ok(sm.dGrowthSE < sm.growthSE, "配对差的标准误小于单独的标准误", `${sm.dGrowthSE.toExponential(2)} < ${sm.growthSE.toExponential(2)}`);
    // 扇形图：最后一个网格点的中位数 = 终值中位数
    const G = r.G, col = []; for (let n = 0; n < B.N; n++) col.push(r.EQ[n * G + G - 1]); col.sort((a, b) => a - b); near(col[Math.floor(B.N / 2)], sm.medW, 0.02 * sm.medW, "净值扇形图末端与终值一致"); }
}
section("内置规则：都能编译并运行");
{
  const worlds = { ou: world("ou", null, 200, 252), gbm: world("gbm", null, 200, 252), bet: world("bet", null, 200, 100), regime: world("regime", null, 200, 400) };
  const batches = {}; for (const k in worlds) batches[k] = QL.makeBatch(worlds[k], null, 0);
  for (const st of STRATS.filter(x => !x.game)) {   // 玩法自带的规则只在各自的玩法里跑（见 games.test.js）
    for (const wk of ["gbm", "ou", "bet"]) {
      let err = null, r = null;
      try { const c = compile(st.code), pp = defaults(st.params); ok(typeof c.decide === "function", `${st.id}: 定义了 decide`); const model = c.fit ? c.fit(QL.makeData(batches[wk]), pp, QL.ml, new QL.RNG(1, 777, 1)) : undefined; r = QL.runBatch(batches[wk], c, pp, Object.assign({}, SET0, { fmin: wk === "bet" ? 0 : -3, fmax: wk === "bet" ? 1 : 3 }), {}, model); } catch (e) { err = e; }
      ok(!err && r && r.WT.every(x => x >= 0 && isFinite(x)), `${st.id} 在 ${wk} 上运行`, err ? String(err) : "");
      if (r) { const warm = Math.max(0, ...st.params.filter(p => /^(n|slow|fast)$/.test(p.key)).map(p => p.def)) + 1; ok(r.bad <= warm * batches[wk].N, `${st.id}@${wk}: 无效返回只出现在预热期`, `bad/N=${(r.bad / batches[wk].N).toFixed(1)} ≤ ${warm}`); }
    }
    ok(["proven", "family", "heuristic"].includes(st.explain.tier) && st.explain.assume && st.explain.optimal && st.explain.fails && st.explain.test, `${st.id}: 说明四段齐全`);
  }
}

section("审阅后补的检查");
{
  // 下注游戏：训练目标必须是真正的盈亏，而不是示意用的"价格"
  { const B = QL.makeBatch(world("bet", { p: 0.6, b: 1 }, 50, 40), null, 0), D = QL.makeData(B); let bad = 0, two = 0;
    for (let n = 0; n < 50; n++) for (let t = 0; t < 40; t++) { if (D.fwd(n, t, 1) !== D.next(n, t)) bad++; if (t < 39 && Math.abs(D.fwd(n, t, 2) - ((1 + D.next(n, t)) * (1 + D.next(n, t + 1)) - 1)) > 1e-12) two++; }
    ok(bad === 0 && two === 0, "D.fwd 由收益累乘得到，下注游戏里等于赌局的盈亏"); ok(D.fwd(0, -1, 1) !== D.fwd(0, -1, 1) && D.next(0, -1) !== D.next(0, -1) && D.fwd(0, 39, 2) !== D.fwd(0, 39, 2), "下标越界返回 NaN，不会读到别的路径");
    const lv = QL.makeData(QL.makeBatch(world("ou", null, 20, 60), null, 0)); let d = 0; for (let t = 0; t < 58; t++) d = Math.max(d, Math.abs(lv.fwd(3, t, 3) - (lv.at(3, t + 3).price / lv.at(3, t).price - 1))); ok(d < 1e-6, "有价格水平的世界里，D.fwd 与价格之比一致", d.toExponential(2)); }
  // 训练段的切点：整数运算，real 与 boot 用同一个数
  { let diff = 0; for (let len = 30; len <= 6000; len++) { const c = QL.trainCut(len, 70); if (c !== Math.min(len - 5, Math.max(10, Math.floor(len * 70 / 100)))) diff++; } ok(diff === 0 && QL.trainCut(1300, 70) === 910 && QL.trainCut(350, 70) === 245, "trainCut 对每个长度都是 ⌊0.7·len⌋"); }
  // 两点分布：涨跌都在无风险收益同一侧时没有有限的最优仓位
  { const T = QL.WORLDS.iid.theory; ok(T({ dist: "twopoint", mu: 60, sigma: 1, q: 0.5 }, { K: 252, rf: 0 }).fStar === Infinity && T({ dist: "twopoint", mu: -60, sigma: 1, q: 0.5 }, { K: 252, rf: 0 }).fStar === -Infinity, "两点分布的套利情形：f* = ±∞");
    near(T({ dist: "twopoint", mu: 8, sigma: 20, q: 0.5 }, { K: 252, rf: 0 }).fStar, 2.0013, 1e-3, "两点分布的常规情形不变"); }
  // 下注游戏的说明：增长率回到 0 的位置是按当前参数算出来的
  { const th = QL.WORLDS.bet.theory({ p: 0.6, b: 1 }), z = +/f=([\d.]+)\$ 处回到 0/.exec(th.note)[1]; near(th.gOfF(z), 0, 2e-4, "下注游戏：说明里给的零点确实使 g = 0"); ok(z < 0.4 && th.gOfF(0.4) < 0, "默认参数下零点略小于 2f*"); const t2 = QL.WORLDS.bet.theory({ p: 0.2, b: 5 }); ok(t2.gOfF(2 * t2.fStar) > 0, "p = 0.2、b = 5 时 g(2f*) 仍为正：\"超过 2f* 就为负\"并不总成立"); }
  // 规则能看到每步的无风险利率
  { const B = QL.makeBatch(world("gbm", null, 20, 30), null, 0), probe = compile("function decide(s) { return s.rf * s.K * 20; }"); const r0 = QL.runBatch(B, probe, {}, Object.assign({}, SET0, { rf: 0 }), {}), r5 = QL.runBatch(B, probe, {}, Object.assign({}, SET0, { rf: 5 }), {});
    near(r0.EX[0], 0, 1e-12, "无风险利率为 0 时 s.rf = 0"); near(r5.EX[0], 1, 1e-9, "s.rf = 年利率 / 每年步数"); }
  // 无风险利率不为 0 时，线性均值回复仍在收缩系数 1 处最优（代码里的分子减掉了利率）
  { const cfg = world("ou", { kappa: 5, sigma: 20, theta: 100, start: 100 }, 3000, 252), B = QL.makeBatch(cfg, null, 0), st = STRATS.find(x => x.id === "oukelly"), S = compile(st.code), p0 = defaults(st.params), set = { costBps: 0, rf: 6, fmin: -10, fmax: 10, lam: 1, ddLimit: 30, ddProb: 5 };
    const gs = [0.7, 0.85, 1, 1.15, 1.3].map(sh => QL.summarize(QL.runBatch(B, S, Object.assign({}, p0, { shrink: sh }), set, {}), set).growth); ok(gs[2] >= Math.max(gs[0], gs[4]) && gs[2] > gs[0], "利率 6% 时增长率仍在收缩系数 1 附近最高", gs.map(v => v.toFixed(4)).join(" "));
    // 对照：不减利率的旧公式在同样的设定下更差
    const old = compile(st.code.replace("(drift - s.rf * s.K)", "(drift)")), gOld = QL.summarize(QL.runBatch(B, old, p0, set, {}), set).growth; ok(gs[2] > gOld, "减掉利率的公式好于不减的", `${gs[2].toFixed(4)} vs ${gOld.toFixed(4)}`); }
}
section("第二轮复核后补的检查");
{
  // 规则拿到的 s：上面没有整批数据，t / wealth / pos 只能读，越过当前时刻的下标一律读不到
  const B = QL.makeBatch(world("gbm", null, 50, 60), null, 0);
  const keys = []; let leak = "", fut = 0;
  QL.runBatch(B, { decide: s => {
    if (s.t === 5 && !keys.length) for (const k in s) { keys.push(k); const v = s[k]; if (v && typeof v === "object") leak += k + " "; }
    if (s.p(-1) === s.p(-1) || s.ret(-1) === s.ret(-1) || s.mom(s.t + 1) === s.mom(s.t + 1) || s.sma(s.t + 2) === s.sma(s.t + 2) || s.hi(s.t + 2) === s.hi(s.t + 2) || s.rets(s.t + 9).length > s.t || s.prices(s.t + 9).length > s.t + 1) fut++;
    return 1; } }, {}, SET0, {});
  ok(keys.length > 12 && keys.every(k => k.charAt(0) !== "_") && !leak, "规则看到的 s 上没有内部字段，也没有挂着整批数据的数组", keys.filter(k => k.charAt(0) === "_").join(",") + leak);
  ok(fut === 0, "越过当前时刻的下标一律读不到（NaN 或更短的数组）");
  let e1 = "", e2 = "", e3 = "";
  try { QL.runBatch(B, compile("function decide(s) { s.t = s.t + 5; return 1; }"), {}, SET0, {}); } catch (x) { e1 = x.message; }
  try { QL.runBatch(B, compile("function decide(s) { s.wealth = 9; return 1; }"), {}, SET0, {}); } catch (x) { e2 = x.message; }
  try { QL.runBatch(B, compile("function decide(s) { s.pos = 9; return 1; }"), {}, SET0, {}); } catch (x) { e3 = x.message; }
  ok(/getter/.test(e1) && /getter/.test(e2) && /getter/.test(e3), "规则改不了 s.t、s.wealth、s.pos（严格模式下直接报错）", e1.slice(0, 50));
  // 旧版本里能偷看未来的写法，现在只拿到 undefined
  const peek = compile("function decide(s) { return s._R ? (s._R[s._oR + s.t] > 0 ? 3 : -1) : 0; }"), rp = QL.runBatch(B, peek, {}, SET0, {});
  ok(rp.EX.every(x => x === 0), "s._R 之类的内部数组已经不存在");
  // 净值和仓位照旧读得到，且读过之后杠杆曲线不走回放
  const rw = QL.runBatch(B, { decide: s => (s.wealth > 0 && s.pos === s.pos ? 0.5 : 0) }, {}, SET0, { rec: true }), r0 = QL.runBatch(B, { decide: () => 0.5 }, {}, SET0, { rec: true });
  ok(rw.touched === true && r0.touched === false && Math.abs(rw.WT[3] - r0.WT[3]) < 1e-12, "s.wealth / s.pos 可读；读没读过引擎记得");
  // fit 里的 D.at 仍然可以定位到任意时刻（那是留给模型学的数据）
  const D = QL.makeData(B), v10 = D.at(3, 10); ok(v10.t === 10 && Math.abs(v10.price - B.L[3 * 61 + 10]) < 1e-12 && Math.abs(v10.ret(0) - B.R[3 * 60 + 9]) < 1e-15, "训练数据的视图：D.at(n, t) 定位正确");

  // sizeOf：数得对、不怕环、Map/Set 里的数也算、出意外返回 null、大对象不慢
  const cyc = { x: 1 }; cyc.me = cyc;
  ok(QL.sizeOf({ a: 1, b: [1, 2, 3], c: new Float64Array(5), s: "x", f: true }) === 10 && QL.sizeOf(cyc) === 1 && QL.sizeOf(new Map([[1, [1, 2]], [2, 3]])) === 5 && QL.sizeOf(new Set([1, 2, [3]])) === 3, "sizeOf：数组、类型化数组、布尔、环、Map、Set");
  ok(QL.sizeOf({ kind: "knn", size: 1234, predict: () => 0 }) === 1234 && QL.sizeOf({ kind: "long", size: 0.5 }) === 1, "sizeOf：只有模型库的模型（带 predict / filter）才取它自报的 size");
  ok(QL.sizeOf({ get boom() { throw new Error("x"); } }) === null, "sizeOf：属性抛错时返回 null，不往外抛");
  const big = []; for (let i = 0; i < 50000; i++) big.push([i, i + 1, { z: i }]); const tb = Date.now(), nb = QL.sizeOf({ rows: big }), ms = Date.now() - tb;
  ok(nb === 150000 && ms < 400, "sizeOf：五万个小对象也是线性时间", ms + " ms");
}
done();
