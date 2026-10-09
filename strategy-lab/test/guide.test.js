// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 手册的内容：每个世界、每条规则、每张图、每套玩法都有条目；规则文字带得上当前的数字；
// 对照表（现算，test/live-node.js 按页面同样的办法算、按源码内容缓存）齐全，而且和引擎直接跑的一致；手册里引用的数字和引擎对得上。
const path = require("path"), fs = require("fs");
const { QL, STRATS, compile, ok, near, section, done } = require("./harness.js");
global.QL_GUIDE = require("../src/guide.js"); require("../src/guide-games.js"); require("../src/guide-worlds.js"); require("../src/guide-obs.js");
const G = global.QL_GUIDE, MX = require("./live-node.js").matrix();
const chartsSrc = fs.readFileSync(path.join(__dirname, "../src/app-charts.js"), "utf8") + fs.readFileSync(path.join(__dirname, "../src/app-scenes.js"), "utf8");
const chartIds = Array.from(new Set((chartsSrc.match(/CH\.([a-z0-9]+) = \{/g) || []).map(s => s.slice(3, -4))));
const long = (s, n) => typeof s === "string" && s.length >= n;

section("每一样东西都有条目");
ok(G.start.length === 9 && G.start.every(s => s.id && s.title && s.body && s.body.length) && G.start.map(s => s.id).join() === "what,loop,read,tour,step,criteria,trust,claude,keys", "入门九篇（含「怎么读结果栏」）");
ok(G.tour.length === 5 && G.tour.every(t => t.t && long(t.md, 60) && t.go), "五个小实验");
for (const k of Object.keys(QL.WORLDS)) {
  const w = QL.WORLDS[k];
  if (w.game) { const g = G.games[k]; ok(g && long(g.scene, 80) && long(g.origin, 100) && long(g.known, 400) && g.tryit.length >= 4 && typeof g.rules === "function", "玩法 " + k + "：场景、出处、结论、可以试试、规则"); ok(G.gameIndex[k] && G.gameIndex[k].length === 3, "玩法 " + k + "：总览里的一行"); }
  else { const g = G.worlds[k]; ok(g && long(g.story, 60) && long(g.when, 40) && long(g.works, 20) && g.tryit.length >= 2, "世界 " + k + "：来历、何时用、什么管用、可以试试"); }
}
for (const st of STRATS) {
  if (st.game) { ok(long(G.gstrats[st.id], 8), "玩法规则 " + st.id + "：用处"); continue; }
  const g = G.strats[st.id]; ok(g && long(g.story, 60) && long(g.good, 10) && long(g.bad, 6) && long(g.look, 8), "规则 " + st.id + "：来历、适合、不适合、该看什么");
  const a = G.algo[st.id]; ok(a && a.kind && a.fit && a.step && a.mem && a.need, "规则 " + st.id + "：算法信息");
}
ok(chartIds.length === 16, "图表一共十六张", chartIds.join(","));
for (const id of chartIds) { const c = G.charts[id]; ok(c && long(c.q, 8) && long(c.read, 30) && long(c.use, 30) && long(c.trap, 20), "图表 " + id + "：问题、读法、场景、误区"); }
ok(Object.keys(G.charts).every(id => chartIds.includes(id)), "没有多出来的图表条目");
const GL = G.glossary.filter(x => Array.isArray(x)), GH = G.glossary.filter(x => typeof x === "string");
ok(GL.length >= 110 && GH.length >= 8 && typeof G.glossary[0] === "string" && GL.every(x => x.length === 2 && long(x[0], 1) && long(x[1], 8)) && new Set(GL.map(x => x[0])).size === GL.length, "名词：分组，不少于 110 条，没有重复", GL.length + " 条 / " + GH.length + " 组");
{ const have = w => GL.some(x => x[0].split(" / ").includes(w) || x[0] === w), need = ["规则", "细则", "结果栏", "局", "做多", "做空", "止损", "择时", "调仓", "平仓", "底仓", "单边", "跳空", "终值", "期权", "波动率微笑", "复制", "做市商", "买卖价差", "限价单", "高频", "期货", "共同基金", "自营", "清盘线", "套利", "封板", "TWAP", "有效前沿", "效用", "优势", "正确设定", "价格水平", "窗口", "滞后", "可证最优", "族内最优", "有保证", "启发式", "机会成本", "状态机"];
  const miss = need.filter(w => !have(w)); ok(miss.length === 0, "名词：复核时点名缺的词都补上了", miss.join(" ")); }
ok(Object.keys(G.tiers).join() === "proven,family,bound,heuristic" && Object.values(G.tiers).every(s => long(s, 10)), "四个档位各有一句解释");
ok(G.models.length === 10 && G.models.every(m => m.fit && m.pred && m.mem && long(m.what, 10)), "十种模型：是什么、计算量");
const pipe = STRATS.find(s => s.id === "pipe"), opts = pipe.params.find(q => q.key === "model").options.map(o => o[0]); ok(G.models.map(m => m.id).join() === opts.join(), "模型表的顺序和规则里的选项一致", G.models.map(m => m.id).join());
for (const id of Object.keys(G.algo)) ok(STRATS.some(s => s.id === id || s.lib === id), "算法信息 " + id + " 对应一条存在的规则");
for (const f of ["loop", "step", "round", "kelly"]) ok(G.figs[f] && /^<svg viewBox/.test(G.figs[f].svg) && /role="img"/.test(G.figs[f].svg) && long(G.figs[f].cap, 10) && !/<script|<style|foreignObject/.test(G.figs[f].svg), "插图 " + f);
// 文字里不许出现美元符号以外的公式定界问题：成对出现
const all = []; (function walk(o) { if (typeof o === "string") all.push(o); else if (o && typeof o === "object") for (const k in o) if (k !== "svg" && typeof o[k] !== "function") walk(o[k]); })(G);
const odd = all.filter(s => ((s.replace(/\$\$/g, "").match(/\$/g) || []).length % 2) || ((s.match(/\$\$/g) || []).length % 2)); ok(odd.length === 0, "公式的定界符都成对", odd.map(s => s.slice(0, 30)).join(" | "));
ok(!all.some(s => /genuinely|honestly|straightforward/i.test(s)), "没有混进英文套话");
// 用词：界面上那一块叫"结果"，手册里叫结果栏，不再叫摘要；世界和玩法的规定叫细则
{ const bad = all.filter(s => /摘要/.test(s) && !/^结果 结果栏 摘要/.test(s)); ok(bad.length === 0, "手册正文里不再把结果栏叫作摘要", bad.map(s => s.slice(0, 24)).join(" | ")); }
ok(!all.some(s => /这一局的规则|规则写死|有明确规则的游戏|财富/.test(s)), "手册正文：细则和规则分开叫，不用「财富」");
// 复核时确认写错的几句话不再出现
{ const gone = [/所有规则的成功率都是 50%/, /好单好得多，应该更挑/, /实际最好的在 0\.3 到 0\.6 之间/, /所有规则的优势都缩小/, /由引擎的结构保证/, /有锁时是轮流拉最好的几台/, /只好千分之四/, /夏普只略有改善。`?$/, /调到和总亏损线一样大（等于取消它）/];
  const hit = gone.filter(re => all.some(s => re.test(s))); ok(hit.length === 0, "复核时确认写错的句子都改掉了", hit.map(String).join(" ")); }

section("五个小实验指向存在的世界、规则和图表");
for (const t of G.tour) {
  const go = t.go; ok(!go.world || QL.WORLDS[go.world], "世界 " + go.world); ok(!go.strat || STRATS.some(s => s.id === go.strat), "规则 " + go.strat);
  (go.charts || []).forEach(c => ok(chartIds.includes(c), "图表 " + c));
  if (go.strat) ok(go.std === true && go.resetW === true && go.resetS === true, "小实验自带完整的设定（默认参数、默认种子），不受之前改动的影响：" + t.t);
  if (go.sp) { const st = STRATS.find(s => s.id === go.strat); Object.keys(go.sp).forEach(k => ok(st.params.some(q => q.key === k), "参数 " + go.strat + "." + k)); }
  if (go.copt && go.copt.sweep) { const st = STRATS.find(s => s.id === go.strat); ok(st.params.some(q => q.key === go.copt.sweep.x.key) && st.params.some(q => q.key === go.copt.sweep.y.key), "扫描的两个参数存在"); }
}

section("玩法的规则文字：默认设定和每个场景下都写得出来，带着当前的数字");
for (const k of QL.ALL_GAMES) {
  const w = QL.WORLDS[k], base = QL.worldDefaults(k), g = G.games[k];
  const variants = [base].concat(w.scenes.map(s => Object.assign({}, base, s.p)));
  let bad = 0; for (const p of variants) { const r = g.rules(p, w.theory(p)); if (!(r.length >= 5 && r.every(x => typeof x === "string" && x.length > 8 && !/undefined|NaN|\[object/.test(x)))) bad++; }
  ok(bad === 0, k + "：" + variants.length + " 组设定下规则都完整");
}
const R = (k, over) => G.games[k].rules(Object.assign(QL.worldDefaults(k), over || {}), QL.WORLDS[k].theory(Object.assign(QL.worldDefaults(k), over || {}))).join("\n");
ok(/2000 回合/.test(R("g_lock")) && /随后的 15 个回合/.test(R("g_lock")) && /随后的 40 个回合/.test(R("g_lock", { L: 40 })) && /帕累托/.test(R("g_lock", { dist: "pareto" })), "接单：回合数、锁期、分布跟着参数变");
ok(/100 个候选人/.test(R("g_sec")) && /只知道他在已经见过的人（包括他自己）里排第几/.test(R("g_sec")) && /分数裁判不交给规则/.test(R("g_sec")) && /均匀分布/.test(R("g_sec", { info: "full" })) && !/不交给规则/.test(R("g_sec", { info: "full" })) && /\(100 − r\)\/\(100 − 1\)/.test(R("g_sec", { goal: "rank" })), "秘书：信息和目标两种设定");
ok(/25 美元/.test(R("g_coin")) && /60%/.test(R("g_coin")) && /250 美元就封顶/.test(R("g_coin")) && /不设封顶/.test(R("g_coin", { cap: 0 })), "偏硬币：本金、概率、封顶");
ok(/0\.4737/.test(R("g_bold")) && /500 把/.test(R("g_bold")) && /报 0 就是这一把不押，但这一把照样过去/.test(R("g_bold")) && /这个胜率你是知道的/.test(R("g_bold")), "翻倍：胜率、把数、不押也算一把");
ok(/有 5 台机器/.test(R("g_bandit")) && !/要锁/.test(R("g_bandit")) && /要锁 3 个回合/.test(R("g_bandit", { D: 3 })) && /0\.6，其余全是 0\.5/.test(R("g_bandit", { prior: "needle" })), "老虎机：台数、锁、中奖率的三种设定");
ok(/进价 3/.test(R("g_news")) && /售价 12/.test(R("g_news")) && /当天作废/.test(R("g_news")) && /残值 2/.test(R("g_news", { salvage: 2 })), "报童：价格和残值");
ok(/1\.5·V/.test(R("g_curse")) && /没有任何关于这家公司的信息/.test(R("g_curse")) && /标准差 15/.test(R("g_curse", { info: "sig" })), "赢家诅咒：倍数和信号");
ok(/30 个交易日/.test(R("g_prop")) && /1\.100/.test(R("g_prop")) && /0\.900/.test(R("g_prop")) && /0\.050/.test(R("g_prop")) && /持有的股数不变/.test(R("g_prop")), "自营考核：三条线和期限");
ok(!/等于没有这条线/.test(R("g_prop", { dayLoss: 10 })) && /超过之后它比总亏损线更近（开盘净值 1\.050 时，单日线在 0\.950/.test(R("g_prop", { dayLoss: 10 })) && /不超过 1\.080 时不起作用/.test(R("g_prop", { dayLoss: 18 })) && /开盘净值 1\.090 时，单日线在 0\.910/.test(R("g_prop", { dayLoss: 18 })) && /等于没有这条线/.test(R("g_prop", { dayLoss: 20 })) && !/等于没有这条线/.test(R("g_prop", { dayLoss: 19.5 })), "自营考核：单日线调到「目标 + 总亏损线」才算没有");
ok(/每个时段开始时可以交易一次/.test(R("g_ashare")) && /向上或向下跳一次/.test(R("g_ashare")) && /第二天开盘那一次仍然封着/.test(R("g_ashare")), "A 股：交易发生在时段开始，跳的方向和幅度写明");
ok(/这一期卖出之后，市价立刻永久下降/.test(R("g_exec")) && /先成交、后变动/.test(R("g_exec")) && /不是每一局算一个再取平均/.test(R("g_exec")), "大单执行：先后次序和计分办法写明");
ok(/和每回合都拉最好的那一台相比/.test(R("g_bandit")) && /轮流拉最好的 3 台/.test(R("g_bandit", { D: 2 })) && /没有"不拉"这个选项/.test(R("g_bandit")), "老虎机：遗憾永远和最好的那一台比");
ok(/报 0 就是这一次不押/.test(R("g_coin")) && /出价 0 等于不出价/.test(R("g_curse")) && /到现在为止出现过的全部报价/.test(R("g_lock")) && /可以装作不知道/.test(R("g_news")), "各套玩法都写了「你知道什么」");
ok(/T\+1/.test(R("g_ashare")) && /10%/.test(R("g_ashare")) && /印花税 5 个基点/.test(R("g_ashare")) && /T\+0/.test(R("g_ashare", { t1: "off" })) && /不设涨跌停/.test(R("g_ashare", { limit: "0" })), "A 股：各条制度可以开关");
ok(/20 期/.test(R("g_exec")) && /5% × n/.test(R("g_exec")) && /0\.5 × 成本的方差/.test(R("g_exec")) && /自相关为 0\.3/.test(R("g_exec", { phi: 0.3 })), "大单执行：期数、冲击、风险厌恶");

section("手册里引用的数字和引擎对得上");
{ const th = QL.lockTheory(QL.worldDefaults("g_lock")); near(th.cStar, 2.010, 0.001, "接单：c* ≈ 2.010"); near(th.rhoStar, 0.1340, 0.0001, "接单：ρ* ≈ 0.1340"); near(th.dp, 0.1345, 0.0001, "接单：有限期最优 ≈ 0.1345"); near(th.any, 0.0625, 0.0001, "接单：见单就接 = 1/16"); }
{ const c = QL.secClassic(100); ok(c.m === 37, "秘书：n = 100 时先看 37 人"); near(c.value, 0.3710, 0.0001, "秘书：成功率 0.3710"); near(QL.secRankDP(100).value, 3.60, 0.01, "秘书：最优期望名次 3.60"); }
{ let prod = 1; for (let j = 1; j < 200000; j++) prod *= Math.pow((j + 2) / j, 1 / (j + 1)); near(prod, 3.87, 0.01, "秘书：名次极限的无穷乘积 ≈ 3.87"); }
{ const t = QL.coinTheory({ p: 0.6, start: 25, T: 300, cap: 250 }); near(t.f, 0.2, 1e-9, "硬币：f* = 0.2"); near(t.g, 0.0201, 0.0001, "硬币：g* ≈ 0.0201"); near(t.median, 10500, 60, "硬币：不封顶的中位数约 10500"); near(250 * Math.pow(0.6, 4), 32.4, 0.01, "硬币：全押约 32 美元");
  let lo = 0.2, hi = 0.9; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (0.6 * Math.log(1 + m) + 0.4 * Math.log(1 - m) > 0) ? lo = m : hi = m; } near(lo, 0.389, 0.001, "硬币：增长率在 0.389 处回到 0"); }
near(QL.boldQ(0.5, 18 / 38), 18 / 38, 1e-9, "翻倍：Q(½) = p"); near(QL.boldQ(0.3, 0.4737), 0.27, 0.005, "翻倍：Q(0.3) ≈ 0.27"); near(QL.timidQ(0.5, 0.05, 18 / 38), 0.259, 0.001, "翻倍：每把 5% → 25.9%"); near(QL.timidQ(0.5, 0.01, 18 / 38), 0.005, 0.0005, "翻倍：每把 1% → 0.5%");
{ const t = QL.newsTheory(QL.worldDefaults("g_news")); near(t.cr, 0.75, 1e-9, "报童：临界分位 0.75"); near(t.qStar, 225.25, 0.01, "报童：q* ≈ 225"); near(t.best, 1018, 0.5, "报童：最优利润 1018"); near(t.atMean, 906, 0.5, "报童：订均值 906"); near(t.prophet, 1354.5, 0.01, "报童：上界 1354.5"); near(t.prophet - t.best, 336, 0.6, "报童：完美预测值 336");
  near(QL.newsTheory(Object.assign(QL.worldDefaults("g_news"), { cost: 9 })).qStar, 75.75, 0.01, "报童：进价 9 时 q* ≈ 76"); }
near(QL.curseProfit(60, 1.5), -9, 1e-9, "赢家诅咒：出价 60 平均亏 9"); near(QL.curseProfit(100, 2.5), 25, 1e-9, "赢家诅咒：m = 2.5 时全买赚 50m − 100");
{ const p = QL.propPass(2, 0.1, 0.2, 0.1, 0.1); ok(p > 0.5 && p < 1, "自营考核：不设期限的公式给出合理的值", String(p)); near(QL.propPass(1e6, 0.1, 0.2, 0.1, 0.1), 0.5, 0.001, "自营考核：杠杆极大时趋于 b/(a+b)"); ok(QL.propPass(0.05, 0.1, 0.2, 0.1, 0.1) > 0.99 && QL.propPass(0.2, 0.1, 0.2, 0.1, 0.1) > QL.propPass(1, 0.1, 0.2, 0.1, 0.1), "自营考核：仓位越小通过率越高，趋于 1"); }
{ const p = QL.worldDefaults("g_exec"), th = QL.execTheory(p); near(th.cost(th.now()).obj, 5.0, 1e-9, "执行：一次卖完 5.0"); near(th.cost(th.twap()).obj, 3.81, 0.005, "执行：匀速 3.81"); near(th.cost(th.ac(p.lam)).obj, 1.77, 0.005, "执行：AC 计划 1.77"); }
{ const E = (m) => { let s = 0, n = 200000; const g = new QL.RNG(3, m, 1); for (let i = 0; i < n; i++) { let b = -Infinity; for (let j = 0; j < m; j++) { const z = g.normal(); if (z > b) b = z; } s += b; } return s / n; }; near(E(10), 1.54, 0.02, "多重比较：10 个里最好的领先 1.5 个标准误"); near(QL.expectedMaxNormal(100), 2.51, 0.03, "多重比较：100 个 → 2.5"); near(QL.expectedMaxNormal(1000), 3.24, 0.03, "多重比较：1000 个 → 3.2"); }

section("对照表（现算）");
const pst = STRATS.filter(s => !s.game).map(s => s.id);
ok(MX.v === 2 && MX.price.strats.join() === pst.join() && MX.price.worlds.length === 15, "价格表：十八条规则 × 十五个世界", MX.price.strats.length + "×" + MX.price.worlds.length);
ok(pst.every(id => MX.price.cells[id].length === 15 && MX.price.cells[id].every(c => c && c.length === 10)), "价格表每一格都有数");
ok(MX.price.worlds.every(w => QL.WORLDS[w.type] && w.bench.length === 4), "价格表的列都指向存在的世界");
ok(QL.ALL_GAMES.length === 14 && QL.ALL_GAMES.every(t => { const M = MX.games[t], rules = STRATS.filter(s => s.game === t).map(s => s.id); return M && M.strats.join() === rules.join() && M.scenes.length === QL.WORLDS[t].scenes.length && M.scenes.every(sc => typeof sc.bench === "number") && rules.every(id => M.cells[id].length === M.scenes.length && M.cells[id].every(c => c && c.length >= 4 && c.slice(0, 4).every(x => typeof x === "number" && x === x))); }), "十四套玩法的表：每条规则 × 每个场景都有数");
// 抽查：表里的数和引擎现算的一致（同样的种子、同样的批次、同样的默认参数）
function priceCell(sid, wkey) {
  const w = MX.price.worlds.find(x => x.key === wkey), d = QL.WORLDS[w.type], st = STRATS.find(s => s.id === sid), S = compile(st.code), p = {}; st.params.forEach(q => { p[q.key] = q.def; });
  const cfg = { type: w.type, params: Object.assign(QL.worldDefaults(w.type), w.over), N: d.defaults.N, T: d.defaults.T, K: d.defaults.K, seed: MX.seed, S0: 100 }, B = QL.makeBatch(cfg, { splitPct: 70 }, 0);
  const model = S.fit ? S.fit(QL.makeData(QL.makeBatch(cfg, { splitPct: 70 }, 0, "fit")), p, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined;
  const res = QL.runBatch(B, S, p, MX.set, {}, model), bench = QL.runBatch(B, QL.benchFor(w.type), {}, { costBps: MX.set.costBps, rf: MX.set.rf, fmin: Math.min(MX.set.fmin, 0), fmax: Math.max(MX.set.fmax, 1), lam: 1 }, {});
  return QL.summarize(res, MX.set, bench);
}
for (const [sid, wk] of [["stop", "gbm"], ["stop", "regime"], ["ma", "fbm"], ["meanrev", "ou"], ["oukelly", "ou"], ["voltarget", "regime"], ["pipe", "ar1"], ["kalman", "regime"]]) {
  const s = priceCell(sid, wk), c = MX.price.cells[sid][MX.price.worlds.findIndex(w => w.key === wk)];
  ok(Math.abs(s.dGrowth - c[1]) < 1e-4 * Math.max(1, Math.abs(c[1])) && Math.abs(s.sharpe - c[3]) < 1e-3, `表与现算一致：${sid} × ${wk}`, s.dGrowth + " vs " + c[1]);
}
// 手册正文里拿这张表说过的几句话
const cell = (sid, wk) => MX.price.cells[sid][MX.price.worlds.findIndex(w => w.key === wk)], sig = c => c[0] === "-inf" ? -99 : c[2] > 0 ? c[1] / c[2] : 0;
ok(sig(cell("stop", "gbm")) < -2 && sig(cell("stop", "regime")) > 2, "止损：GBM 里显著为负，牛熊切换里显著为正");
ok(["iid", "iid_t", "gbm", "jump", "heston", "garch"].every(wk => pst.filter(id => id !== "hold" && id !== "const").filter(id => sig(cell(id, wk)) < -2).length >= 14), "没有方向可预测的六个世界里，几乎整列都是显著为负");
ok(["ma", "mom", "stop", "cppi"].every(id => sig(cell(id, "fbm")) > 2 && sig(cell(id, "ou")) < -2), "趋势类：分数布朗运动里为正，均值回复里为负");
ok(["meanrev", "band", "oukelly", "grid"].every(id => sig(cell(id, "ou")) > 2 && sig(cell(id, "fbm")) < -2), "均值回复类：正好相反");
ok(pst.every(id => id === "hmm" || cell("hmm", "regime")[1] > cell(id, "regime")[1]), "牛熊切换里隐马尔可夫模型领先");
ok(cell("pipe", "ar1")[1] > 0.1 && cell("pipe", "ar1_rev")[1] > 0.1 && sig(cell("mom", "ar1_rev")) < -2 && Math.abs(sig(cell("mom", "ar1"))) < 3, "AR(1)：流水线两个方向都赚，动量在反转的世界里明显落后");
ok(cell("voltarget", "regime")[3] > 1.1 && MX.price.worlds.find(w => w.key === "regime").bench[1] < 0.65, "牛熊切换：波动率目标的夏普 1.14，买入持有 0.61");
ok(pst.every(id => !(sig(cell(id, "boot")) > 2 && cell(id, "boot")[1] > 0.03)), "Bootstrap 一列：没有规则显著地大幅跑赢");
ok(cell("oukelly", "iid_t")[0] === "-inf" && cell("voltarget", "iid_t")[0] === "-inf", "厚尾世界里带杠杆的规则有路径破产");
{ const M = MX.games.g_lock, i = M.scenes.findIndex(s => /均匀/.test(s.name)); ok(M.cells.lock_thr[i][0] === 0 && M.params.lock_thr.c === 2.01, "接单：门槛 2.01 放到均匀分布里一单也接不到"); }
{ const M = MX.games.g_ashare, a = M.cells.ash_rev; near(a[0][0], 0.015, 0.004, "A 股：全部制度下高抛低吸每年约 1.5%"); near(a[1][0], 0.154, 0.01, "A 股：T+0、不设涨跌停约 15%"); near(a[4][0] - a[0][0], 0.067, 0.01, "A 股：印花税每年六七个百分点"); near(a[3][0], 0.12, 0.015, "A 股：±20% 时约 12%"); }
{ const M = MX.games.g_prop; ok(M.params.prop_fix.f === 2 && M.cells.prop_fix[0][0] > 0.36 && M.cells.prop_fix[0][0] < 0.42 && M.cells.prop_fix[1][0] < 0.5, "自营考核：2 倍仓位通过率接近四成；没有优势时不过半"); }
{ const M = MX.games.g_bandit, c = id => M.cells[id][0][0]; ok(Math.abs(c("ban_greedy") - 0.78) < 0.012 && Math.abs(c("ban_ucb") - 0.73) < 0.012 && Math.abs(c("ban_ts") - 0.80) < 0.012 && Math.abs(c("ban_rand") - 0.5) < 0.01, "老虎机：默认设定下各算法的成绩与手册一致", [c("ban_greedy"), c("ban_ucb"), c("ban_ts")].join(",")); }
{ const M = MX.games.g_coin, c = id => M.cells[id][0][0]; near(c("coin_frac"), 237, 2, "硬币：Kelly 约 237 美元"); near(c("coin_dp"), 246, 2, "硬币：动态规划约 246 美元"); near(c("coin_frac") / c("coin_dp"), 0.96, 0.01, "硬币：Kelly 拿到最优值的 96%"); }

section("第二轮复核：改过的结论和引擎、对照表对得上");
{
  const LIB = QL.gameLib, world = require("./harness.js").world;
  const gsim = (type, over, S, p, N) => { const cfg = world(type, over, N), B = QL.makeBatch(cfg, null, 0); S = typeof S === "string" ? LIB[S] : S; const model = S.fit ? S.fit(QL.makeData(QL.makeBatch(cfg, null, 0, "fit")), p || {}, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined; const res = QL.runGame(B, S, p || {}, null, {}, model), g = QL.gameSummary(B, res, null); return { score: g.score, se: g.se, aux: g.aux.map(a => a.value) }; };
  // ① 帕累托：最优门槛比指数分布时低，2.01 太挑
  { const th = QL.lockTheory(Object.assign(QL.worldDefaults("g_lock"), { dist: "pareto", alpha: 2.5 })); near(th.cStar, 1.507, 0.002, "接单 · 帕累托 α = 2.5：c* ≈ 1.51"); near(th.rhoStar, 0.1005, 0.0003, "接单 · 帕累托：ρ* ≈ 0.100"); ok(th.rho(2.01) < th.rhoStar - 0.004 && Math.abs(th.dist.tail(2) - 0.049) < 0.001, "接单 · 帕累托：门槛留在 2.01 就太挑；超过 2 的报价只有 5%", th.rho(2.01).toFixed(4));
    ok(QL.lockTheory(Object.assign(QL.worldDefaults("g_lock"), { dist: "pareto", alpha: 1.9 })).cStar > 2.01 && QL.lockTheory(Object.assign(QL.worldDefaults("g_lock"), { dist: "pareto", alpha: 2 })).cStar < 2.01, "接单 · 帕累托：α 到 1.9 以下最优门槛才超过 2.01"); }
  // ① 固定门槛在 2000 回合的局里的精确值：只比动态规划差千分之一
  { const th = QL.lockTheory(QL.worldDefaults("g_lock")), D = th.dist, L = 15, T = 2000, q = D.tail(th.cStar), m = D.epos(th.cStar) + th.cStar * q, V = new Float64Array(T + L + 2); for (let t = T - 1; t >= 0; t--) V[t] = (1 - q) * V[t + 1] + m + q * V[t + L + 1];
    near(V[0] / T, 0.1344, 0.0001, "接单：固定门槛在 2000 回合的局里是 0.1344"); ok((th.dp - V[0] / T) / th.dp < 0.002 && th.dp > V[0] / T, "接单：动态规划只比固定门槛好千分之一", ((th.dp - V[0] / T) / th.dp).toFixed(5)); }
  // ② 人数变了，"先看多少人"不会自己跟着变
  { const c10 = QL.secClassic(10), c1000 = QL.secClassic(1000); ok(c10.m === 3 && Math.abs(c10.value - 0.399) < 0.001 && c1000.m === 368 && Math.abs(c1000.value - 0.368) < 0.001, "秘书：10 人时先看 3 人（39.9%），1000 人时先看 368 人（36.8%）"); ok(Math.abs(c10.P[9] - 0.1) < 1e-9 && c1000.P[37] < 0.13, "秘书：m 留在 37 不动，10 人时只有 10%，1000 人时只有 12%"); }
  // ③ 押到 0.5 只剩高原上的一半
  { const a = gsim("g_coin", null, "coin_frac", { f: 0.5 }, 6000), b = gsim("g_coin", null, "coin_frac", { f: 0.15 }, 6000); ok(a.score / b.score > 0.45 && a.score / b.score < 0.6, "硬币：押到 0.5，平均到手只有高原上的一半左右", a.score.toFixed(0) + " 对 " + b.score.toFixed(0)); }
  // ④ 公平赌局：分得出胜负的打法都是 50%，小注慢磨 500 把里分不出来
  { const bold = gsim("g_bold", { p: 0.5 }, "bold_all", {}, 6000), t5 = gsim("g_bold", { p: 0.5 }, "bold_timid", { stake: 0.05 }, 6000), t1 = gsim("g_bold", { p: 0.5 }, "bold_timid", { stake: 0.01 }, 3000), t1long = gsim("g_bold", { p: 0.5, T: 4000 }, "bold_timid", { stake: 0.01 }, 2000);
    ok(Math.abs(bold.score - 0.5) < 0.03 && Math.abs(t5.score - 0.5) < 0.03 && t1.score < 0.05 && t1.aux[1] > 0.9 && t1long.score > 0.38, "翻倍 · 公平赌局：大注 50%；每把 1% 在 500 把里只有 3% 上下，放到 4000 把回到 40% 以上", [bold.score, t5.score, t1.score, t1long.score].map(x => x.toFixed(3)).join(" "));
    const r2 = gsim("g_bold", null, "bold_timid", { stake: 0.02 }, 6000), r5 = gsim("g_bold", null, "bold_timid", { stake: 0.05 }, 6000); ok(Math.abs(r5.score - QL.timidQ(0.5, 0.05, 0.4737)) < 0.02 && r2.score < QL.timidQ(0.5, 0.02, 0.4737) - 0.005, "翻倍 · 轮盘：注码 5% 时与赌徒破产公式一致，2% 时把数不够、落在公式下方"); }
  // ⑤ UCB 的探索系数：最好的在 0.1 上下
  { const s = c => gsim("g_bandit", null, "ban_ucb", { c }, 2500).score, a = s(0.1), b = s(0.5), c2 = s(2), ts = gsim("g_bandit", null, "ban_ts", {}, 2500).score; ok(a > b + 0.01 && b > c2 + 0.03 && Math.abs(a - 0.81) < 0.012 && a > ts - 0.004, "老虎机：UCB 的 c 取 0.1 上下最好（约 0.81），0.5 时 0.79，2 时 0.74", [a, b, c2, ts].map(x => x.toFixed(3)).join(" "));
    const lk = gsim("g_bandit", { D: 2 }, "ban_ts", {}, 1500); ok(lk.aux[0] > 80, "老虎机：有锁时遗憾里有 80 分上下免不掉", lk.aux[0].toFixed(1)); }
  // ⑥ 订到 q* 时，缺货的天数占四分之一
  { const th = QL.newsTheory(QL.worldDefaults("g_news")), r = gsim("g_news", null, "news_fix", { q: th.qStar }, 3000); near(r.aux[1], 0.25, 0.01, "报童：订到 q* 时四天里有一天缺货（够卖的概率 0.75）"); }
  // ⑦ 有信号时最好的出价在信号之上
  { const s = (noise, k) => gsim("g_curse", { info: "sig", noise }, "curse_shade", { k }, 2500).score, by = noise => gsim("g_curse", { info: "sig", noise }, "curse_bayes", {}, 2500).score;
    const a08 = s(15, 0.8), a10 = s(15, 1), a115 = s(15, 1.15), b15 = by(15); ok(a08 < a10 && a10 < a115 && a115 < b15 + 0.05 && Math.abs(a08 - 2.0) < 0.4 && Math.abs(a10 - 7.1) < 0.5 && Math.abs(a115 - 8.6) < 0.5, "赢家诅咒 · 噪声 15：k = 0.8 赚 2.0，k = 1 赚 7.1，k = 1.15 赚 8.6，都不超过贝叶斯出价", [a08, a10, a115, b15].map(x => x.toFixed(2)).join(" "));
    ok(s(5, 1.1) > s(5, 1) + 3 && s(40, 0.8) > s(40, 1.1) + 0.5, "赢家诅咒：噪声 5 时加价更好，噪声 40 时打折更好"); }
  // ⑧ 通过率最高的杠杆几乎不随优势变；默认设定下 Kelly 比它高
  { const pass = (mu, f) => gsim("g_prop", { mu }, "prop_fix", { f }, 5000).score;
    ok([0, 40].every(mu => pass(mu, 1.75) > pass(mu, 1) + 0.03 && pass(mu, 1.75) > pass(mu, 3) + 0.03), "自营考核：μ = 0 和 μ = 40% 时，通过率的峰都在 1.75 倍附近");
    const th = QL.WORLDS.g_prop.theory(QL.worldDefaults("g_prop")); near(th.kellyX2 / 2, 2.5, 1e-9, "自营考核：默认设定下 Kelly 比例是 2.5 倍，比峰高"); }
  // 对照表里的几格
  const cell = (sid, wk) => MX.price.cells[sid][MX.price.worlds.findIndex(w => w.key === wk)], sig = c => c[0] === "-inf" ? -99 : c[2] > 0 ? c[1] / c[2] : 0, bench = wk => MX.price.worlds.find(w => w.key === wk).bench;
  ok(sig(cell("meanrev", "osc")) < -2 && cell("meanrev", "osc")[1] < -0.2 && sig(cell("meanrev", "ou")) > 2 && sig(cell("meanrev", "logistic")) > 2, "z 分数带：默认窗口在带噪谐振子里每年亏 20% 以上；均值回复和 Logistic 里为正");
  ok(cell("voltarget", "garch")[3] < bench("garch")[1] + 0.01 && cell("voltarget", "heston")[3] > bench("heston")[1] + 0.02, "波动率目标：GARCH 默认参数下夏普不高于买入持有，Heston 下略高");
  ok(sig(cell("martingale", "logistic")) > 2 && cell("martingale", "logistic")[1] > 0.05 && sig(cell("martingale", "gbm")) < -2, "输了加倍：只在 Logistic 映射里碰巧为正");
  ok(cell("pipe", "ou")[1] < -0.02 && sig(cell("pipe", "ou")) < -2, "流水线：默认特征在均值回复世界里学不到东西，每年亏 4% 上下");
  ok(Math.abs(cell("ma", "regime")[1]) < 0.012 && cell("ma", "regime")[3] > bench("regime")[1] + 0.1, "均线交叉 · 牛熊切换：增长率和买入持有差不多，夏普高出一截");
  { const M = MX.games.g_sec, i0 = M.scenes.findIndex(s => /选最好 · 只看名次/.test(s.name)), i1 = M.scenes.findIndex(s => /选最好 · 看得到分数/.test(s.name)); ok(i0 >= 0 && i1 >= 0 && M.cells.sec_gm[i0][0] < 0.02 && M.cells.sec_gm[i1][0] > 0.56 && Math.abs(M.cells.sec_cut[i0][0] - 0.371) < 0.02, "秘书：只看名次时分数门槛无从下手（1/n），看得到分数时约 0.58"); }
  { const M = MX.games.g_curse, i = M.scenes.findIndex(s => /噪声 15/.test(s.name)); ok(M.params.curse_shade.k === 0.8 && Math.abs(M.cells.curse_shade[i][0] - 2.0) < 0.5 && M.cells.curse_bayes[i][0] > 8, "赢家诅咒：默认的 k = 0.8 在噪声 15 时只赚 2 上下，贝叶斯出价约 9"); }
}

section("第三轮复核：细则写的是裁判实际用的数；每条规则都有算法信息；名词补齐");
{
  // 报童：进价高过售价、残值高过进价时，细则里写的是收回来之后的数，并且说明了
  let t = R("g_news", { salvage: 5 }); ok(/按残值 3 处理掉/.test(t) && /残值设得比进价还高，裁判按进价 3 算/.test(t) && /\+ 3 × 剩下的件数/.test(t), "报童：残值高过进价时按进价算，细则里写明");
  t = R("g_news", { cost: 20 }); ok(/每件进价 12/.test(t) && /进价设得比售价还高，裁判按售价 12 算/.test(t), "报童：进价高过售价时按售价算");
  t = R("g_news"); ok(!/裁判按/.test(t) && /每件进价 3/.test(t), "报童：正常的参数下没有多余的说明");
  // 大单执行：永久冲击超过 2η 时按 2η 算
  t = R("g_exec", { eta: 2, gamma: 5 }); ok(/永久下降 起始价 × 4% × n/.test(t) && /裁判按 2η = 4% 算/.test(t), "大单执行：永久冲击超过 2η 时细则写的是 2η");
  t = R("g_exec"); ok(!/裁判按/.test(t), "大单执行：正常的参数下没有多余的说明");
  { const cst = QL.WORLDS.g_exec.consts(Object.assign(QL.worldDefaults("g_exec"), { eta: 2, gamma: 5 }), 20); ok(Math.abs(cst.gamma - 4) < 1e-4, "裁判确实把 γ 收到了 2η", String(cst.gamma)); }
  // 老虎机：锁的回合数比台数还多时，轮流拉的是全部的台
  t = R("g_bandit", { arms: 3, D: 5 }); ok(/轮流拉最好的 3 台/.test(t), "老虎机：轮流拉的台数不超过总台数");
  // 每条内置规则都有算法信息；条目不多不少
  const miss = STRATS.filter(st => !st.src && !G.algo[st.lib || st.id]).map(st => st.id), extra = Object.keys(G.algo).filter(k => !STRATS.some(st => (st.lib || st.id) === k));
  ok(miss.length === 0 && extra.length === 0 && Object.keys(G.algo).length === 85, "八十五条内置规则，每条都有计算量和存储", miss.concat(extra).join(","));
  ok(Object.keys(G.algo).every(k => { const a = G.algo[k]; return long(a.kind, 2) && long(a.fit, 2) && long(a.step, 2) && long(a.mem, 2) && long(a.need, 2); }), "算法信息的五项都填了");
  ok(!/同一张表/.test(G.algo.pipe.mem) && /算法对比/.test(G.algo.pipe.mem), "流水线的存储一栏自己说得清去哪看");
  // 名词
  const GL2 = G.glossary.filter(x => typeof x !== "string").map(x => x[0]), GH2 = G.glossary.filter(x => typeof x === "string");
  ok(["独立同分布", "方差 / 标准差", "z 分数", "均匀分布 U(a, b)", "正态分布 N(μ, σ²)", "指数分布 Exp(1)", "帕累托分布", "Student-t 分布", "Beta(a, b) 分布", "布朗运动（dW）", "几何布朗运动", "Black–Scholes", "状态（规则的记忆）", "纳秒 / 微秒 / 毫秒"].every(k => GL2.includes(k)) && GH2.includes("常见的分布"), "名词里补上了分布、标准差、z 分数、布朗运动、状态、纳秒");
  ok(G.glossary.filter(x => typeof x !== "string").every(x => !/\^|\$|\\/.test(x[1])), "名词是纯文字：里面没有 ^、$、反斜杠这些排版记号");
  // 偏硬币的对照表下面那句话；自营考核的场景
  ok(long(G.games.g_coin.mxNote, 60) && /每次全押/.test(G.games.g_coin.mxNote), "偏硬币：对照表里那一格 0 有解释");
  { const M = MX.games.g_coin, i = M.scenes.findIndex(x => /不封顶/.test(x.name)); ok(i >= 0 && M.cells.coin_dp && M.cells.coin_dp[i] && M.cells.coin_dp[i][0] === 0, "它解释的那一格确实是 0"); }
  { const M = MX.games.g_prop, i = M.scenes.findIndex(x => /没有单日亏损线/.test(x.name)); ok(i >= 0 && M.scenes[i].p.dayLoss === 20, "对照表里\"没有单日亏损线\"那一列用的是 20%"); }
  ok(MX.price.worlds[0].name === "经典分布·正态" && MX.price.worlds[1].name === "经典分布·厚尾", "对照表里的列名和世界下拉框里的名字一致");
  // 说明文字里改过的几句
  const allG = JSON.stringify(G.games, (k, v) => typeof v === "function" ? undefined : v) + JSON.stringify(STRATS.map(st => st.explain || ""));
  ok(!/峰越靠左/.test(allG) && !/四分之三的局/.test(allG) && !/多数的局 300 次滚不到封顶/.test(allG) && !/两者打平）/.test(allG) && !/把波动调大或者把每年的步数调小/.test(allG) && !/退出点放在哪里几乎没有差别/.test(allG), "上一轮查出来不对的几句话都不在了");
  ok(/结果栏的对照表里/.test(G.tour[3].md) && !/结果栏右边/.test(JSON.stringify(G.tour) + allG), "不再说\"结果栏右边的表\"（窄屏上它在下面）");
}

section("第四轮复核：补上的前提、改正的出处");
{
  const X = id => STRATS.find(st => st.id === id).explain, all = k => Object.values(X(k)).join("\n"), gk = k => G.games[k].known, crit = G.start.find(x => x.id === "criteria").body.join ? G.start.find(x => x.id === "criteria").body.join("\n") : String(G.start.find(x => x.id === "criteria").body);
  ok(/不会把净值押成负数的规则/.test(crit) && /朝任何可行的/.test(crit), "三种口径的定理：写明规则不能把净值押成负数");
  const GLm = Object.fromEntries(G.glossary.filter(x => typeof x !== "string"));
  ok(/IC² ≥ R²/.test(GLm["IC"]) && /校准/.test(GLm["IC"]) && /pb − \(1 − p\)/.test(GLm["优势"]), "名词：IC 与 √R² 的关系带上了条件；优势按一般的赔率写");
  ok(/开局时状态是空的/.test(GLm["状态（规则的记忆）"]) && /由裁判记着/.test(GLm["状态（规则的记忆）"]), "名词：状态一条和页面上的三种写法对得上");
  ok(/当且仅当最优门槛/.test(X("lock_any").optimal) && /x_\{\\min\}/.test(X("lock_any").optimal), "见单就接：什么时候最优写成了充要条件");
  ok(/门槛反而要比 \$c\^\*\$ 高/.test(X("lock_thr").fails), "固定门槛：有限局数时门槛不是一路往下降");
  ok(/Blum 1954/.test(X("lock_sa").optimal), "随机逼近：几乎必然收敛的出处");
  ok(/2\.25/.test(all("sec_mem")) && !/2\.24/.test(all("sec_mem")), "只看分数的门槛：n = 100 时约 2.25");
  ok(/p=\\tfrac12\$ 时不押才是对的/.test(X("coin_none").fails), "一分不押：只有 p = ½ 时才对");
  ok(/e\^\{-m\\Delta\^2\}/.test(X("ban_etc").optimal) && /Hoeffding/.test(X("ban_etc").optimal), "先试后定：常数按 [0,1] 内的回报写");
  ok(/当且仅当它恰好落在临界分位数上/.test(X("news_mean").optimal), "订平均数：最优的充要条件");
  ok(/\\gamma<2\\eta/.test(X("exec_twap").assume) && /\\gamma<2\\eta/.test(X("exec_ac").assume) && /\\gamma\$ 越大，\$\\kappa\$ 越大/.test(X("exec_ac").optimal), "大单执行：前提 γ < 2η；永久冲击会改变计划的形状");
  ok(/1-\\sum_k n_k\^2/.test(gk("g_exec")) && /\\eta>\\gamma\/2\$ 时，只最小化期望/.test(gk("g_exec")), "大单执行的结论一节同样");
  ok(/有界函数里唯一的解/.test(gk("g_bold")) && /取极限/.test(gk("g_prop")) && /取极限/.test(X("prop_fix").optimal), "翻倍或出局：唯一性限定在有界函数里；自营考核：θ = 0 时取极限");
  ok(/模拟资金/.test(G.games.g_prop.scene) && !/给你真钱去做/.test(G.games.g_prop.scene), "自营考核的来历：通过之后用的仍是模拟资金");
  ok(/渐进的/.test(G.games.g_lock.origin) && /事先不公布/.test(G.games.g_coin.scene) && /主要的实验证据之一/.test(G.games.g_curse.origin) && /融券/.test(G.games.g_ashare.scene), "几处出处和事实的说法收紧了");
  ok(/g\(1\)-g\(0\)/.test(X("ma").test) && /现值/.test(X("cppi").optimal) && /无风险利率取 0/.test(X("mom").optimal), "均线、CPPI、动量：和无风险利率有关的地方写清楚了");
  ok(/Saltzman/.test(G.worlds.lorenz.story) && /Sauer–Yorke–Casdagli/.test(QL.WORLDS.lorenz.theory().note) && /x_\{t-m\+1\}/.test(QL.WORLDS.lorenz.theory().note), "洛伦兹：三个变量的模型从哪来；嵌入定理的出处与坐标个数");
  const fb = QL.WORLDS.fbm.theory(QL.worldDefaults("fbm")).note, bt = QL.WORLDS.bet.theory({ p: 0.6, b: 1 }).note;
  ok(/\\sum_\{k\\in\\mathbb\{Z\}\}\\gamma\(k\)=0/.test(fb) && /胜率低于一半时精确的零点略大于/.test(bt), "分数布朗运动：哪个和为 0；下注游戏：零点在 2f* 哪一边只看胜率");
  { const g = (p, b, f) => p * Math.log(1 + b * f) + (1 - p) * Math.log(1 - f), fs = (p, b) => p - (1 - p) / b; ok(g(0.4, 2, 2 * fs(0.4, 2)) > 0 && g(0.6, 3, 2 * fs(0.6, 3)) < 0 && Math.abs(g(0.5, 2, 2 * fs(0.5, 2))) < 1e-12, "核对：g(2f*) 的符号确实只由胜率决定"); }
  ok(/现在跳跃的频率/.test(QL.WORLDS.jump.theory(Object.assign(QL.worldDefaults("jump"), { lam: 0 }), { K: 252, rf: 0 }).note) && /0\.00050/.test(QL.WORLDS.heston.theory(Object.assign(QL.worldDefaults("heston"), { kappa: 0.1, sigma: 5 }), { K: 252, rf: 0 }).note), "跳跃频率为 0、Heston 的数很小时，说明照样说得通");
  ok(/会自己变回 37/.test(G.games.g_sec.tryit.join("")) && !/不会自己变回/.test(G.games.g_sec.tryit.join("")), "秘书问题：参数被收回来之后会还回来（和页面的行为一致）");
  ok(/试探结束时排一次名次/.test(G.algo.ban_etc.step) && /当前的资金/.test(G.algo.coin_mart.need) && /典型波动/.test(G.algo.ash_rev.need) && /每期的波动/.test(G.algo.exec_aim.need), "算法信息：先试后定按新的写法；几条规则\"需要的数据\"补全了");
}
done();
