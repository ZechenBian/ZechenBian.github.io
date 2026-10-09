// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 核对内置说明里写的"可检验的预测"是否真的成立：解释里写了什么，这里就断言什么。
const { QL, STRATS, compile, defaults, world, SET0, ok, near, section, done } = require("./harness.js");
const S = Object.fromEntries(STRATS.map(s => [s.id, s]));
const P = (id, over) => Object.assign(defaults(S[id].params), over || {});
const R = (B, id, over, set) => { const st = Object.assign({}, SET0, set || {}); const r = QL.runBatch(B, compile(S[id].code), P(id, over), st, {}); return [QL.summarize(r, st), r]; };
const argmax = a => a.indexOf(Math.max.apply(null, a));
const f4 = x => (x === -Infinity ? "−∞" : x.toFixed(4));

section("固定比例：杠杆曲线的峰值在 f*，2f* 处回到无风险利率");
{ const B = QL.makeBatch(world("gbm", { mu: 8, sigma: 20 }, 4000, 504), null, 0), fs = [0.5, 1, 1.5, 2, 2.5, 3, 4], g = fs.map(f => R(B, "const", { f })[0]);
  console.log("   " + fs.map((f, i) => `f=${f}: ${f4(g[i].growth)}`).join("  "));
  ok(fs[argmax(g.map(s => s.growth))] === 2, "峰值在 f* = μ/σ² = 2"); near(g[6].growth, 0, 4 * g[6].growthSE + 0.004, "g(2f*) ≈ r = 0");
  const th = QL.WORLDS.gbm.theory({ mu: 8, sigma: 20 }, { K: 252, rf: 0 }); near(th.fStar, 2, 1e-9, "理论值 f* = 2"); near(g[3].growth, th.gOfF(2), 4 * g[3].growthSE, "模拟的 g(f*) 与公式一致"); }

section("马丁格尔：公平赌局");
{ const B = QL.makeBatch(world("bet", { p: 0.5, b: 1 }, 20000, 100), null, 0); const [sm] = R(B, "martingale", null, { fmin: 0, fmax: 1 });
  console.log("   100 局: E[W]=%s ± %s  破产比例=%s", sm.meanW.toFixed(4), sm.meanWSE.toFixed(4), sm.pRuin.toFixed(3));
  near(sm.meanW, 1, 3 * sm.meanWSE, "E[W_T] = 1（100 局）"); ok(sm.pRuin > 0.5, "100 局：破产的路径超过一半", "破产比例 " + sm.pRuin.toFixed(3));
  const B10 = QL.makeBatch(world("bet", { p: 0.5, b: 1 }, 20000, 10), null, 0); const [s10, r10] = R(B10, "martingale", null, { fmin: 0, fmax: 1 }); let win = 0; for (const w of r10.WT) if (w > 1) win++;
  console.log("   10 局: E[W]=%s ± %s  赢钱比例=%s  破产比例=%s", s10.meanW.toFixed(4), s10.meanWSE.toFixed(4), (win / B10.N).toFixed(3), s10.pRuin.toFixed(3));
  near(s10.meanW, 1, 3 * s10.meanWSE, "E[W_T] = 1（10 局）"); near(win / B10.N, 0.65, 0.04, "10 局：约 65% 的路径赢钱"); near(s10.pRuin, 0.05, 0.02, "10 局：约 5% 破产"); }

section("固定阈值带（OU）：对称退出");
{ const cfg = world("ou", { kappa: 8, sigma: 20, theta: 100, start: 100 }, 3000, 504), B = QL.makeBatch(cfg, null, 0);
  // 带宽固定得偏大（4%）：最优退出点在 0 和带宽之间
  for (const cost of [0, 5, 20]) { const exits = [-2, 0, 1, 2, 3, 4], g = exits.map(ex => R(B, "band", { width: 4, exit: ex, short: false, size: 1 }, { costBps: cost, fmin: -3, fmax: 3 })[0].growth), b = exits[argmax(g)];
    console.log(`   带宽 4，成本 ${cost} bp：` + exits.map((e, i) => `${e}:${f4(g[i])}`).join("  ")); ok(b > 0 && b < 4, `成本 ${cost} bp：带宽偏大时，最优退出点落在 0 和带宽之间`, "最优退出点 " + b); }
  // 二维扫描：有成本时最高点在对角线 退出点 = 带宽 上，成本越高最优带宽越大；成本为 0 时最优带宽趋于 0
  const widths = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6], best = {};
  for (const cost of [0, 5, 20, 50]) { let bv = -Infinity, bw = 0, be = 0, diag = -Infinity; for (const w of widths) for (const fr of [0, 0.5, 1]) { const g = R(B, "band", { width: w, exit: w * fr, short: false, size: 1 }, { costBps: cost, fmin: -3, fmax: 3 })[0].growth; if (g > bv) { bv = g; bw = w; be = fr; } if (fr === 1 && g > diag) diag = g; } best[cost] = { w: bw, fr: be, g: bv, diag }; console.log(`   成本 ${cost} bp：最优 带宽 ${bw}，退出点 = ${be} × 带宽，g = ${f4(bv)}（对角线上最高 ${f4(diag)}）`); }
  ok(best[20].fr === 1 && best[50].fr === 1, "成本 20、50 bp：最高点落在 退出点 = 带宽 的对角线上"); ok(best[5].g - best[5].diag < 0.0005, "成本 5 bp：对角线上的最高点与全局最高点几乎一样（附近很平）", (best[5].g - best[5].diag).toFixed(5));
  ok(best[50].w > best[20].w && best[20].w > best[5].w, "成本越高，最优带宽越大", `${best[5].w} → ${best[20].w} → ${best[50].w}`); ok(best[0].w === widths[0], "成本为 0：最优带宽取到最小的一档", "带宽 " + best[0].w); }

section("线性均值回复：收缩系数的峰值与离散调仓的破产");
{ const cfg = world("ou", { kappa: 5, sigma: 20, theta: 100, start: 100 }, 3000, 252), B = QL.makeBatch(cfg, null, 0), shs = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
  const g10 = shs.map(sh => R(B, "oukelly", { shrink: sh }, { costBps: 0, fmin: -10, fmax: 10 })[0].growth), gInf = shs.map(sh => R(B, "oukelly", { shrink: sh }, { costBps: 0, fmin: -100, fmax: 100 })[0]);
  console.log("   上下限 ±10：" + shs.map((s, i) => `${s}:${f4(g10[i])}`).join("  ")); console.log("   上下限 ±100：" + shs.map((s, i) => `${s}:${f4(gInf[i].growth)}`).join("  "));
  ok(shs[argmax(g10)] === 1, "成本为 0、上下限 ±10：峰值在收缩系数 = 1"); ok(gInf[3].growth === -Infinity && gInf[3].pRuin > 0, "上下限放宽到 ±100：按天调仓出现破产路径，增长率为 −∞", "破产比例 " + gInf[3].pRuin); }

section("滚动 Kelly：收缩系数与窗口");
{ const cfg = world("gbm", { mu: 8, sigma: 20 }, 3000, 756), B = QL.makeBatch(cfg, null, 0), shs = [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 1], g = shs.map(sh => R(B, "kellyest", { shrink: sh, n: 120, cap: 5 }, { fmin: -5, fmax: 5 })[0].growth);
  console.log("   窗口 120：" + shs.map((s, i) => `${s}:${f4(g[i])}`).join("  ")); const b = shs[argmax(g)]; ok(b >= 0.05 && b <= 0.1, "收缩系数的峰值远小于 1，在公式给出的 c* ≈ 0.07 附近", "峰值在 " + b);
  const cStar = 4 / (4 + 1 / (0.04 * 120 / 252)); near(cStar, 0.07, 0.005, "公式：c* = f*²/(f*² + 1/(σ²τ)) ≈ 0.07");
  const gc = shs.map(sh => R(B, "kellyest", { shrink: sh, n: 120, cap: 2 }, { costBps: 5, fmin: -1, fmax: 3 })[0].growth); console.log("   窗口 120、成本 5 bp、上限 2：" + shs.map((s2, i) => `${s2}:${f4(gc[i])}`).join("  ")); ok(shs[argmax(gc)] <= b && shs[argmax(gc)] <= 0.05, "有成本时峰值更靠近 0", "峰值在 " + shs[argmax(gc)]);
  const ns = [20, 60, 120, 250, 500], gn = ns.map(n => R(B, "kellyest", { shrink: 0.2, n, cap: 5 }, { fmin: -5, fmax: 5 })[0].growth); console.log("   收缩 0.2：" + ns.map((n, i) => `${n}:${f4(gn[i])}`).join("  "));
  ok(gn.every((v, i) => i === 0 || v > gn[i - 1]), "独立同分布的世界里窗口越长越好"); const [c2] = R(B, "const", { f: 2 }); ok(c2.growth > Math.max.apply(null, g) + 0.04, "参数已知的 Kelly 远好于任何估计版本", `${f4(c2.growth)} vs ${f4(Math.max.apply(null, g))}`); }

section("波动率目标 vs 同等平均仓位的固定比例");
{ const out = {};
  for (const wt of [["garch", { mu: 8, sigma: 20, alpha: 0.12, beta: 0.85 }], ["heston", { mu: 8, sigma: 20, kappa: 3, xi: 0.6, rho: -0.7 }], ["iid", { dist: "normal", mu: 8, sigma: 20 }]]) {
    const B = QL.makeBatch(world(wt[0], wt[1], 4000, 504), null, 0); const [sv] = R(B, "voltarget", { target: 15, n: 20, cap: 3 }, { fmax: 3 }); const [sc] = R(B, "const", { f: sv.exposure }); out[wt[0]] = [sv, sc];
    console.log(`   ${wt[0]}: 波动率目标 夏普 ${sv.sharpe.toFixed(3)} ± ${sv.sharpeSE.toFixed(3)} | 同等仓位的固定比例 ${sc.sharpe.toFixed(3)}`); }
  ok(out.garch[0].sharpe > out.garch[1].sharpe + 2 * out.garch[0].sharpeSE, "GARCH：夏普高于同等仓位的固定比例"); ok(out.heston[0].sharpe > out.heston[1].sharpe + 2 * out.heston[0].sharpeSE, "Heston：夏普高于同等仓位的固定比例");
  ok(out.iid[0].sharpe < out.iid[1].sharpe + out.iid[0].sharpeSE, "独立同分布的正态世界：没有优势（略差）", `${out.iid[0].sharpe.toFixed(3)} vs ${out.iid[1].sharpe.toFixed(3)}`); }

section("CPPI：保底线");
{ let B = QL.makeBatch(world("gbm", { mu: 8, sigma: 20 }, 4000, 252), null, 0); let [sm, r] = R(B, "cppi", { floor: 80, m: 4, cap: 2 }, { fmax: 3 }); let below = 0, mn = 1e9; for (const w of r.WT) { if (w < 0.8) below++; mn = Math.min(mn, w); }
  console.log("   GBM: P(W_T<0.8)=%s  min=%s  median=%s", below / B.N, mn.toFixed(4), sm.medW.toFixed(4)); ok(below === 0, "GBM 下不破底");
  B = QL.makeBatch(world("jump", { mu: 8, sigma: 15, lam: 3, muJ: -25, sigJ: 10 }, 4000, 252), null, 0); [sm, r] = R(B, "cppi", { floor: 80, m: 4, cap: 2 }, { fmax: 3 }); below = 0; for (const w of r.WT) if (w < 0.8) below++; console.log("   大跳跃: P(W_T<0.8)=%s", below / B.N); ok(below > 0, "有大跳跃时会破底"); }

section("止损：GBM 与牛熊");
{ let B = QL.makeBatch(world("gbm", { mu: 8, sigma: 20 }, 4000, 504), null, 0); let [ss] = R(B, "stop", { stop: 10, n: 20 }); let [sc] = R(B, "const", { f: ss.exposure }); let [sh] = R(B, "hold");
  console.log(`   GBM: 止损 g=${f4(ss.growth)} ± ${f4(ss.growthSE)}（平均仓位 ${ss.exposure.toFixed(2)}，回撤 95% 分位 ${ss.dd95.toFixed(3)}）| 同等仓位的固定比例 g=${f4(sc.growth)} | 买入持有 g=${f4(sh.growth)}（回撤 95% 分位 ${sh.dd95.toFixed(3)}）`);
  ok(ss.growth < sc.growth + ss.growthSE, "GBM：增长率不高于平均仓位相同的固定比例"); ok(ss.dd95 < sh.dd95, "GBM：最大回撤分布的右尾变短");
  B = QL.makeBatch(world("regime", null, 4000, 1008), null, 0); [ss] = R(B, "stop", { stop: 10, n: 20 }); [sh] = R(B, "hold"); console.log(`   牛熊: 止损 g=${f4(ss.growth)} ± ${f4(ss.growthSE)} | 买入持有 g=${f4(sh.growth)} ± ${f4(sh.growthSE)}`);
  ok(ss.growth > sh.growth + 2 * ss.growthSE, "牛熊切换：增长率超过买入持有"); }

section("动量 vs φ（AR(1)）");
{ const phis = [-0.2, -0.1, 0, 0.1, 0.2], d = phis.map(phi => { const B = QL.makeBatch(world("ar1", { mu: 5, sigma: 20, phi }, 3000, 252), null, 0); const r = QL.runBatch(B, compile(S.mom.code), P("mom", { n: 1 }), SET0, {}), bench = QL.runBatch(B, QL.benchFor("ar1"), {}, SET0, {}); return QL.summarize(r, SET0, bench); });
  console.log("   相对基准的增长率差：" + phis.map((p, i) => `φ=${p}: ${f4(d[i].dGrowth)}`).join("  "));
  ok(d.every((s, i) => i === 0 || s.dGrowth > d[i - 1].dGrowth), "差值随 φ 单调上升"); ok(d[2].dGrowth < 0 && d[3].dGrowth > 0, "窗口 1、成本 0：在 φ 略大于 0 处由负转正（φ = 0 时为负）");
  const set5 = Object.assign({}, SET0, { costBps: 5 }), d20 = [0.1, 0.2].map(phi => { const B = QL.makeBatch(world("ar1", { mu: 5, sigma: 20, phi }, 3000, 252), null, 0); const r = QL.runBatch(B, compile(S.mom.code), P("mom", { n: 20 }), set5, {}), bench = QL.runBatch(B, QL.benchFor("ar1"), {}, set5, {}); return QL.summarize(r, set5, bench).dGrowth; });
  console.log("   窗口 20、成本 5 bp：φ=0.1: " + f4(d20[0]) + "  φ=0.2: " + f4(d20[1])); ok(d20[0] < 0 && d20[1] > 0, "窗口 20、成本 5 bp：转正的位置更靠右（φ = 0.1 时仍为负）"); }

section("均线交叉：GBM 里处处不如买入持有；牛熊切换里夏普更高；分数布朗运动里看 H");
{ const combos = [[5, 20], [10, 50], [10, 100], [20, 100], [50, 200]], set = { costBps: 5 };
  let B = QL.makeBatch(world("gbm", { mu: 8, sigma: 20 }, 3000, 504), null, 0); const [h1] = R(B, "hold", null, set); const g1 = combos.map(c => R(B, "ma", { fast: c[0], slow: c[1] }, set)[0]);
  console.log("   GBM：买入持有 g " + f4(h1.growth) + " 夏普 " + h1.sharpe.toFixed(2) + " | " + combos.map((c, i) => `${c[0]}/${c[1]}: ${f4(g1[i].growth)} / ${g1[i].sharpe.toFixed(2)}`).join("  "));
  ok(g1.every(s => s.growth < h1.growth && s.sharpe < h1.sharpe), "GBM：任何窗口组合的增长率和夏普都不如买入持有");
  const cmp = combos.map((c, i) => R(B, "const", { f: g1[i].exposure }, set)[0].growth); ok(g1.every((s, i) => s.growth < cmp[i] + s.growthSE), "GBM：增长率不超过仓位取其平均值的固定比例（Jensen）", g1.map((s, i) => `${f4(s.growth)}≤${f4(cmp[i])}`).join(" "));
  B = QL.makeBatch(world("regime", null, 3000, 1008), null, 0); const [h2] = R(B, "hold", null, set); const g2 = combos.map(c => R(B, "ma", { fast: c[0], slow: c[1] }, set)[0]);
  console.log("   牛熊：买入持有 g " + f4(h2.growth) + " 夏普 " + h2.sharpe.toFixed(2) + " | " + combos.map((c, i) => `${c[0]}/${c[1]}: ${f4(g2[i].growth)} / ${g2[i].sharpe.toFixed(2)}`).join("  "));
  ok(g2[2].sharpe > h2.sharpe + 0.15 && g2[1].sharpe > h2.sharpe + 0.15, "牛熊切换：长均线 50–100 步时夏普明显高于买入持有"); ok(g2[2].growth > h2.growth - 0.002 && g2[2].growth < h2.growth + 0.03, "牛熊切换：增长率只略高一点", `${f4(g2[2].growth)} vs ${f4(h2.growth)}`); ok(g2[2].ddMed < h2.ddMed * 0.8, "牛熊切换：回撤小得多", `${g2[2].ddMed.toFixed(3)} vs ${h2.ddMed.toFixed(3)}`);
  for (const H of [0.65, 0.35]) { B = QL.makeBatch(world("fbm", { H }, 2000, 512), null, 0); const [h3] = R(B, "hold", null, set), a = R(B, "ma", { fast: 3, slow: 20 }, set)[0], b = R(B, "ma", { fast: 20, slow: 100 }, set)[0];
    console.log(`   分数布朗 H=${H}：买入持有 ${f4(h3.growth)} | 3/20: ${f4(a.growth)}  20/100: ${f4(b.growth)}`);
    if (H > 0.5) ok(a.growth > h3.growth + 0.1 && a.growth > b.growth, "H > ½：优势很大，而且窗口越短越好"); else ok(a.growth < h3.growth - 0.05 && b.growth < h3.growth, "H < ½：系统性亏损"); } }

section("均值回复 z 分数带：成本为 0 时最优开仓阈值更小");
{ const B = QL.makeBatch(world("ou", { kappa: 5, sigma: 20 }, 3000, 252), null, 0), es = [0.25, 0.5, 1, 1.5, 2, 2.5], best = {};
  for (const cost of [0, 20]) { const g = es.map(e => R(B, "meanrev", { entry: e, exit: Math.min(0.3, e / 2) }, { costBps: cost })[0].growth); best[cost] = es[argmax(g)]; console.log(`   成本 ${cost} bp：` + es.map((e, i) => `${e}:${f4(g[i])}`).join("  ")); }
  ok(best[0] < best[20], "成本为 0 时最优开仓阈值明显更小", `${best[0]} vs ${best[20]}`); }

section("网格：斜率 κ/σ²");
{ const B = QL.makeBatch(world("ou", { kappa: 5, sigma: 20 }, 3000, 252), null, 0), units = [0.25, 0.5, 1, 2, 3.75, 6], g = units.map(unit => R(B, "grid", { grid: 3, unit, base: 0.5, minPos: -20, maxPos: 20 }, { fmin: -30, fmax: 30 })[0].growth);
  console.log("   κ/σ² = 125；格距 3%：" + units.map((u, i) => `每格 ${u}（斜率 ${(u / 0.03).toFixed(0)}）: ${f4(g[i])}`).join("  ")); ok(units[argmax(g)] === 3.75, "增长率在 每格仓位/格距 = κ/σ² 处最高"); }

section("第三轮复核：改过的几条\"可检验的预测\"");
{ const PAGE = { costBps: 5, rf: 0, fmin: -1, fmax: 3, lam: 1, ddLimit: 30, ddProb: 5 };
  const RB = (B, id, over, set) => { const st = Object.assign({}, PAGE, set || {}), r = QL.runBatch(B, compile(S[id].code), P(id, over), st, {}), bf = (QL.WORLDS[B.type] || {}).benchF === 0 ? 0 : 1, b = QL.runBatch(B, { decide: () => bf }, {}, st, {}); return QL.summarize(r, st, b); };
  const pc = x => (x === -Infinity ? "−∞" : (x * 100).toFixed(2) + "%");
  // 阈值带：成本为 0 时，退出点贴着均衡价最好；离得远就明显变差
  { const B = QL.makeBatch(world("ou", null, 3000, 252), null, 0), g = e => RB(B, "band", { width: 0.5, exit: e, short: false }, { costBps: 0 }).growth, g0 = g(0), g1 = g(1), gm1 = g(-1), g6 = g(6), gm6 = g(-6), g10 = g(10);
    console.log(`   退出点 −6/−1/0/1/6/10：${[gm6, gm1, g0, g1, g6, g10].map(pc).join("  ")}`);
    ok(Math.abs(g1 - g0) < 0.004 && Math.abs(gm1 - g0) < 0.004 && g0 - g6 > 0.012 && g0 - gm6 > 0.012 && g0 - g10 > 0.035, "阈值带（成本 0）：退出点在均衡价上下 1% 以内差不多，偏出 6% 每年少一两个百分点以上"); }
  // 网格：默认的仓位上下限里，增长率只取决于 每格仓位/格距，到顶之后是一片高原
  { const B = QL.makeBatch(world("ou", null, 3000, 252), null, 0), g = (unit, grid) => RB(B, "grid", { unit, grid }, { costBps: 0 }).growth;
    const a = g(0.2, 2), b = g(0.4, 4), lo = g(0.1, 4), mid = g(0.5, 1), hi = g(1, 1), top = g(1, 0.5);
    console.log(`   比值 0.025/0.1/0.1/0.5/1/2：${[lo, a, b, mid, hi, top].map(pc).join("  ")}`);
    ok(Math.abs(a - b) < 0.012 && lo < a - 0.03 && mid > a + 0.04 && Math.abs(hi - mid) < 0.008 && Math.abs(top - hi) < 0.008, "网格（默认上下限）：同一个比值的两组参数成绩相近；比值到 0.5 上下到顶，再大不掉下来"); }
  // 线性均值回复：每年步数调小、或者只把世界的波动调大，才会有路径破产；世界和规则的 σ 一起调大不会
  { const set = { costBps: 0, fmin: -20, fmax: 20 }, ruin = (wo, so, K) => RB(QL.makeBatch(world("ou", wo, 2000, 252, K || 252), null, 0), "oukelly", so, set).pRuin * 2000;
    const both = ruin({ sigma: 60 }, { sigma: 60 }), only = ruin({ sigma: 30 }, null), k52 = ruin(null, null, 52);
    console.log(`   破产的路径数（2000 条里）：σ 一起调到 60 → ${both}；只把世界的 σ 调到 30 → ${only}；每年 52 步 → ${k52}`);
    ok(both <= 3 && only > 30 && k52 > 30, "线性均值回复：σ 一起调大不增加破产，估计错了或者步子大了才会"); }
  // 经典分布：固定 2 倍赢基准，2.8 倍上下打平，3 倍不赢；仓位忽大忽小的规则不赢
  { const B = QL.makeBatch(world("iid", null, 4000, 252), null, 0), f2 = RB(B, "const", { f: 2 }), f28 = RB(B, "const", { f: 2.8 }), f3 = RB(B, "const", { f: 3 }), ok1 = RB(B, "oukelly", null);
    console.log(`   固定 2 / 2.8 / 3 倍比基准：${[f2, f28, f3].map(x => pc(x.dGrowth) + " ± " + pc(x.dGrowthSE)).join("  ")}；线性均值回复（平均仓位 ${ok1.exposure.toFixed(2)}）${pc(ok1.dGrowth)}`);
    ok(f2.dGrowth > 2 * f2.dGrowthSE && Math.abs(f28.dGrowth) < 3 * f28.dGrowthSE + 0.004 && f3.dGrowth < f3.dGrowthSE && ok1.exposure > 1 && ok1.exposure < 3 && ok1.dGrowth < -0.05, "经典分布：固定仓位在 1 到 3 倍之间才赢，平均仓位落在这个区间的择时规则不赢"); }
  // 几何布朗运动：算上换手成本，杠杆曲线在 4 倍之前就过零
  { const B = QL.makeBatch(world("gbm", null, 6000, 252), null, 0), g35 = RB(B, "const", { f: 3.5 }, { fmax: 5 }), g42 = RB(B, "const", { f: 4.2 }, { fmax: 5 });
    ok(g35.growth > 0 && g42.growth < 0, "几何布朗运动：增长率在 3.5 倍还是正的，4.2 倍已经是负的", `${pc(g35.growth)} / ${pc(g42.growth)}`); }
  // 带噪谐振子上的均值回复：窗口 40 到 100 步最好，再长又变差
  { const B = QL.makeBatch(world("osc", null, 2000, 252), null, 0), d = n => RB(B, "meanrev", { n }).dGrowth, d20 = d(20), d60 = d(60), d100 = d(100), d200 = d(200);
    console.log(`   窗口 20/60/100/200：${[d20, d60, d100, d200].map(pc).join("  ")}`);
    ok(d20 < -0.15 && d60 > 0.06 && d100 > 0.06 && d200 < d100 - 0.03 && d200 > 0, "带噪谐振子：20 步大亏，40 到 100 步每年 +7% 到 +9%，200 步只剩 +3% 上下"); }
  // AR(1) 上默认的时间序列动量：φ = 0.1 时略逊于基准（分不出来），φ = −0.1 时明显落后
  { const m = phi => RB(QL.makeBatch(world("ar1", { phi }, 2000, 252), null, 0), "mom", null), a = m(0.1), b = m(-0.1);
    ok(a.dGrowth < 0 && a.dGrowth > -0.035 && b.dGrowth < -0.09, "AR(1)：动量在 φ = 0.1 时每年少一两个百分点，φ = −0.1 时少十个百分点以上", `${pc(a.dGrowth)} ± ${pc(a.dGrowthSE)} / ${pc(b.dGrowth)}`); }
  // 在线梯度：默认的 φ = 0.1 下学习率越小越好；φ = 0.2 时有内部的峰
  { const g = (phi, eta) => RB(QL.makeBatch(world("ar1", { phi }, 2000, 252), null, 0), "ogd", { eta }).growth;
    const a = [0.001, 0.005, 0.02, 0.1].map(e => g(0.1, e)), b = [0.001, 0.005, 0.05].map(e => g(0.2, e));
    console.log(`   φ = 0.1：${a.map(pc).join("  ")}；φ = 0.2：${b.map(pc).join("  ")}`);
    ok(a[0] >= a[1] - 0.002 && a[1] > a[2] && a[2] > a[3] && b[1] > b[0] + 0.03 && b[1] > b[2] + 0.05, "在线梯度：φ = 0.1 时峰贴在学习率的下限，φ = 0.2 时峰在 0.005 上下"); }
  // 世界的说明：公式的 $ 成对；下注游戏的零点写在公式里
  { let bad = []; for (const k of Object.keys(QL.WORLDS)) { const w = QL.WORLDS[k]; if (w.game || !w.theory) continue; const n = (w.theory(QL.worldDefaults(k), { K: w.defaults.K, rf: 0 }) || {}).note || ""; if ((n.match(/\$/g) || []).length % 2) bad.push(k); if (/[\^_{}\\]/.test(n.replace(/\$[^$]*\$/g, ""))) bad.push(k + "(raw)"); }
    ok(bad.length === 0, "世界的说明：公式都包在成对的 $ 里，正文里没有半截的记号", bad.join(",")); }
  // 单步收益的最小值、最大值来自全部数据
  { const B = QL.makeBatch(world("iid", { dist: "t", nu: 3 }, 2000, 252), null, 0), ws = QL.worldStats(B); let mn = Infinity, mx = -Infinity; for (let i = 0; i < B.R.length; i++) { if (B.R[i] < mn) mn = B.R[i]; if (B.R[i] > mx) mx = B.R[i]; }
    ok(ws.min === mn && ws.max === mx, "单步收益分布脚注里的极值就是全部数据的极值", `${ws.min} / ${mn}`); }
}

done();
