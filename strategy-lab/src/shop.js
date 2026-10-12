// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 世界工坊（引擎这一半）
 * 工坊里能造两样东西，样板也都在这个文件里。
 *
 * 世界 = 一段 simulate(T, rng, p, K)：每条路径调用一次，返回 T+1 个正的价格。和实验室里"自定义世界"是同一个接口，
 *        所以造好的世界可以直接拿到实验室里，让任何一条规则在上面回测。
 *
 * 玩法 = 三个函数，合起来就是"裁判"：
 *   deal(T, rng, p)     发牌。每一局开始时调用一次，返回这一局藏起来的东西 G。规则看不到 G
 *   show(G, t)          亮牌。每回合开始时调用，返回规则这一回合能看到的东西：一个数、一个数组，或者只有一层的对象。可以不写
 *   referee(G, t, a)    判分。规则报出动作 a（一个数）之后调用，返回这一回合的得分。可以在 G 上记账；把 G.over 设成 true，这一局到此为止
 * 一局的得分 = 各回合得分加起来。
 * 玩法里的规则：decide(s, p, st) 返回一个数。s.see 是 show 给的东西，s.t、s.T 是第几回合和一共几回合，s.last 是上一回合的得分，
 *              s.total 是这一局到目前的得分，s.g 是玩法的参数，s.rnd() 给一个 0 到 1 之间的随机数。init(p) 可以没有。
 *
 * 比的时候每条规则各打 K 局，第 k 局发给每条规则的牌是同一副（同一个种子），所以规则之间的差别不是牌运。
 * 这个文件在后台线程里执行（jobs.js 把它编进去）；页面里只用到样板的清单。 */
function QL_SHOP_INSTALL(QL) {
"use strict";
var RNG = QL.RNG, LOGN = 30;
function num(key, label, def, min, max, step) { return { key: key, label: label, def: def, min: min, max: max, step: step, type: "num" }; }

/* ---------- 样板：两个世界 ---------- */
var WORLD_LIB = [
  { id: "w_walk", name: "随机游走（最简单的样板）", summary: "每一步的涨跌互相独立，只有一个固定的漂移和一个固定的波动。",
    schema: [num("mu", "年化漂移 μ", 0.06, -0.3, 0.5, 0.01), num("sigma", "年化波动 σ", 0.2, 0.02, 1, 0.01)], K: 252, T: 252,
    explain: "和内置的\"几何布朗运动\"是同一个过程，放在这里当样板：十行代码就是一个世界。\n\n每一步的对数收益独立同分布，过去的价格对猜下一步没有任何帮助，所以择时的规则在这里都是白忙。长期增长率最高的做法是一直把固定比例 f = μ/σ² 的钱放在这个资产上（Merton 的结论）。",
    code: [
      "// 最简单的世界：每一步的对数收益互相独立，分布也都一样。",
      "// mu、sigma 是按年给的；K 是每年几步，所以一步的时间是 dt = 1/K。",
      "function simulate(T, rng, p, K) {",
      "  var dt = 1 / K, S = [100];",
      "  for (var t = 0; t < T; t++) {",
      "    S.push(S[t] * Math.exp((p.mu - p.sigma * p.sigma / 2) * dt + p.sigma * Math.sqrt(dt) * rng.normal()));",
      "  }",
      "  return S;",
      "}"
    ].join("\n") },
  { id: "w_limit", name: "涨跌停板", summary: "每天的涨跌幅有上限；当天没走完的行情留到第二天接着走。",
    schema: [num("sigma", "年化波动 σ", 0.4, 0.05, 1.5, 0.05), num("lim", "每天涨跌幅的上限", 0.02, 0.005, 0.2, 0.005)], K: 252, T: 252,
    explain: "没有涨跌停的时候，这是一个没有漂移的随机游走。加上涨跌停之后，当天没走完的幅度留到第二天，所以涨停的第二天多半接着涨，跌停的第二天多半接着跌：相邻两天的收益有了正的相关。上限相对于每天的波动（σ/√K）越紧，这种延续越明显。\n\n可以试的规则：内置的\"时间序列动量\"（把回看窗口调成 1 步）在这里比买入持有好得多；把涨跌幅的上限调到 0.2（几乎碰不到），它的优势就没有了，只剩下交易成本。\n\n要留意的一点：真实的市场里，涨停的时候往往买不进去。这个世界没有管这件事，所以这里的收益比现实里拿得到的高得多。",
    code: [
      "// 每天的涨跌幅不许超过 ±lim（按对数算）。没走完的行情不会消失，留到第二天接着走。",
      "function simulate(T, rng, p, K) {",
      "  var S = [100], carry = 0, sd = p.sigma / Math.sqrt(K);",
      "  for (var t = 0; t < T; t++) {",
      "    var want = carry + sd * rng.normal();              // 今天想走的幅度",
      "    var r = Math.max(-p.lim, Math.min(p.lim, want));   // 实际只能走到涨跌停",
      "    carry = want - r;                                  // 没走完的留给明天",
      "    S.push(S[t] * Math.exp(r));",
      "  }",
      "  return S;",
      "}"
    ].join("\n") }
];

/* ---------- 样板：两套带裁判的玩法，各带几条规则 ---------- */
var GAME_LIB = [
  { id: "s_pig", name: "掷骰子，见好就收", summary: "一直掷骰子攒分，掷出 1 就前功尽弃。什么时候收手？",
    about: "一局里你可以一直掷骰子。掷出 2 到 6，点数加进这一局的累计；掷出 1，累计清零，这一局结束，一分没有。每次掷之前你都可以收手，把累计的分数带走。\n\n规则每回合看到的是眼下的累计分数（s.see），报 1 是接着掷，报别的数是收手。\n\n算一笔账：累计是 s 分的时候再掷一次，有 1/6 的机会丢掉 s 分，有 5/6 的机会平均多得 4 分。两头相等时 s = 20，所以攒到 20 分就该收手。",
    p: {}, T: 60,
    code: [
      "// 发牌：把这一局可能用到的骰子先掷好，藏起来。pot 是眼下的累计分数。",
      "function deal(T, rng, p) {",
      "  var dice = [];",
      "  for (var t = 0; t < T; t++) dice.push(1 + rng.int(6));",
      "  return { dice: dice, pot: 0 };",
      "}",
      "// 亮牌：规则看到的是眼下累计了多少分。",
      "function show(G, t) {",
      "  return G.pot;",
      "}",
      "// 判分：规则报 1 是接着掷，报别的是收手。收手时，累计的分数就是这一局的得分。",
      "function referee(G, t, a) {",
      "  if (a !== 1) { G.over = true; return G.pot; }",
      "  var d = G.dice[t];",
      "  if (d === 1) { G.pot = 0; G.over = true; return 0; }",
      "  G.pot += d;",
      "  if (t === G.dice.length - 1) { G.over = true; return G.pot; }   // 回合用完了：算作收手",
      "  return 0;",
      "}"
    ].join("\n"),
    rules: [
      { id: "once", name: "掷一次就收", summary: "有分就走。拿来当基准。", p: {},
        code: "// 手里一有分就收手。\nfunction decide(s, p) {\n  return s.see > 0 ? 0 : 1;\n}" },
      { id: "hold", name: "攒到 20 分就收", summary: "累计不到 c 分就接着掷。c = 20 时平均得分最高。", p: { c: 20 },
        code: "// 累计不到 c 分就接着掷。\nfunction decide(s, p) {\n  return s.see >= p.c ? 0 : 1;\n}" },
      { id: "greedy", name: "太贪：攒到 40 分才收", summary: "同一条规则，c = 40。多数时候等不到 40 分就掷出 1 了。", p: { c: 40 },
        code: "// 累计不到 c 分就接着掷。\nfunction decide(s, p) {\n  return s.see >= p.c ? 0 : 1;\n}" }
    ] },
  { id: "s_guess", name: "猜下一次是正是反", summary: "硬币是偏的，偏多少不知道。每回合猜下一次的结果，猜对得 1 分。",
    about: "每一局换一枚硬币：正面的概率 q 在 lo 和 hi 之间随机抽一个，规则不知道 q 是多少。每回合先猜这一次抛出来是正面还是反面，猜对得 1 分；然后才看到结果。\n\n规则每回合看到的是上一次抛出来的结果（s.see：1 是正面，0 是反面，第一回合还没有，是 NaN），报 1 是猜正面，报别的数是猜反面。\n\n要是知道 q，永远猜可能性大的那一面，每回合平均得 max(q, 1 − q) 分。不知道 q，就只能一边猜一边数。",
    p: { lo: 0.2, hi: 0.8 }, T: 50,
    code: [
      "// 发牌：抽一枚硬币（正面的概率 q），把这一局的 T 次都先抛好，藏起来。",
      "function deal(T, rng, p) {",
      "  var q = rng.uniform(p.lo, p.hi), flips = [];",
      "  for (var t = 0; t < T; t++) flips.push(rng.u() < q ? 1 : 0);",
      "  return { flips: flips };",
      "}",
      "// 亮牌：规则看到的是上一次抛出来的结果（第一回合还没有）。",
      "function show(G, t) {",
      "  return t > 0 ? G.flips[t - 1] : NaN;",
      "}",
      "// 判分：规则报 1 是猜正面，报别的都算猜反面。猜对得 1 分。",
      "function referee(G, t, a) {",
      "  return (a === 1 ? 1 : 0) === G.flips[t] ? 1 : 0;",
      "}"
    ].join("\n"),
    rules: [
      { id: "heads", name: "总猜正面", summary: "什么也不看。拿来当基准。", p: {},
        code: "// 每回合都猜正面。\nfunction decide(s, p) {\n  return 1;\n}" },
      { id: "repeat", name: "上次是什么就猜什么", summary: "只看上一次的结果。", p: {},
        code: "// 上一次是正面就猜正面，否则猜反面。\nfunction decide(s, p) {\n  return s.see === 1 ? 1 : 0;\n}" },
      { id: "major", name: "跟着多数猜", summary: "数一数到现在正面多还是反面多，猜多的那一面。", p: {},
        code: "// 记下到现在出过几次正面，猜出得多的那一面（一样多时猜正面）。\nfunction init(p) {\n  return { heads: 0, n: 0 };\n}\nfunction decide(s, p, st) {\n  if (s.t > 0) { st.n++; if (s.see === 1) st.heads++; }\n  return 2 * st.heads >= st.n ? 1 : 0;\n}" }
    ] }
];
QL.SHOP = { worlds: WORLD_LIB, games: GAME_LIB, ver: 1, maxRules: 12 };

/* ---------- 给规则看的东西：只放行数、短字符串、数组和只有一层的对象，而且是抄一份 ---------- */
function scalar(v) { return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "string" ? v.slice(0, 80) : NaN; }
function listOf(a) { var n = Math.min(a.length >>> 0, 256), o = new Array(n), i; for (i = 0; i < n; i++) o[i] = scalar(a[i]); return Object.freeze(o); }
function isList(v) { return Array.isArray(v) || ArrayBuffer.isView(v); }
QL.shopSee = function (x) {
  if (typeof x === "number") return x;
  if (x == null) return NaN;
  if (typeof x !== "object") return scalar(x);
  if (isList(x)) return listOf(x);
  var o = {}, ks = Object.keys(x), i;
  for (i = 0; i < ks.length && i < 32; i++) { var v = x[ks[i]]; o[ks[i]] = v && typeof v === "object" ? (isList(v) ? listOf(v) : NaN) : scalar(v); }
  return Object.freeze(o);
};

function ruleErr(e) { return { rule: true, message: String(e && e.message || e) }; }
function finite(x) { return typeof x === "number" && x === x && x !== Infinity && x !== -Infinity; }
/** 打一局。game: { deal, show, referee }；pl: { decide, init, p }；slot 是这条规则排第几（它自己的随机数从这里来）。
 *  返回 { score, rounds, bad }；log 是数组时把前几回合记进去。
 *  规则抛的错带着 rule 标记（这条规则出局，别的规则照常比）；玩法自己抛的错不带（整件事停下来） */
QL.shopEpisode = function (game, gp, T, seed, k, pl, slot, log) {
  var G = game.deal(T, new RNG(seed, k, 9101), gp);
  if (!G || typeof G !== "object") throw new Error("deal 要返回一个对象（这一局藏起来的东西），现在返回的是 " + (G === null ? "null" : typeof G));
  var r = new RNG(seed, k * 64 + (slot | 0), 9102), rnd = function () { return r.u(); }, st, total = 0, last = NaN, bad = 0, t = 0, a, see, gain;
  try { st = pl.init ? pl.init(pl.p) || {} : {}; } catch (e) { throw ruleErr(e); }
  for (; t < T; t++) {
    see = game.show ? QL.shopSee(game.show(G, t)) : NaN;
    try { a = pl.decide(Object.freeze({ t: t, T: T, see: see, last: last, total: total, g: gp, rnd: rnd }), pl.p, st); } catch (e2) { throw ruleErr(e2); }
    if (!finite(a)) { bad++; a = NaN; }
    gain = game.referee(G, t, a);
    if (!finite(gain)) throw new Error("第 " + t + " 回合，referee 返回的不是有限的数：" + String(gain));
    total += gain; last = gain;
    if (log && log.length < LOGN) log.push({ see: see, a: a, gain: gain });
    if (G.over === true) { t++; break; }
  }
  return { score: total, rounds: t, bad: bad };
};
function meanSE(a, n) {
  var s1 = 0, s2 = 0, i; for (i = 0; i < n; i++) { s1 += a[i]; s2 += a[i] * a[i]; }
  var v = n > 1 ? Math.max(0, (s2 - s1 * s1 / n) / (n - 1)) : 0;
  return { mean: n ? s1 / n : NaN, se: n > 1 ? Math.sqrt(v / n) : NaN };
}
/** 每条规则各打 K 局，汇总成每条规则一行：{ id, mean, se, d, dse, rounds, bad, err }。
 *  d、dse：和排在第一的那条规则（基准）逐局相减之后的平均数和标准误；基准自己那一行是 0 */
QL.shopRun = function (game, gp, T, K, seed, players, progress) {
  var n = players.length, sc = [], rows = [], trace = [], i, k;
  for (i = 0; i < n; i++) {
    var pl = players[i], s = new Float64Array(K), rounds = 0, bad = 0, err = "", log = [];
    if (progress) progress({ id: pl.id, i: i, n: n, k: 0, K: K });
    for (k = 0; k < K; k++) {
      var ep;
      try { ep = QL.shopEpisode(game, gp, T, seed, k, pl, i, k === 0 ? log : null); }
      catch (e) { if (e && e.rule) { err = e.message; break; } throw e; }
      s[k] = ep.score; rounds += ep.rounds; bad += ep.bad;
      if (progress && k % 200 === 199) progress({ id: pl.id, i: i, n: n, k: k + 1, K: K });
    }
    sc.push(err ? null : s);
    var ms = err ? { mean: NaN, se: NaN } : meanSE(s, K), row = { id: pl.id, mean: ms.mean, se: ms.se, d: NaN, dse: NaN, rounds: err ? NaN : rounds / K, bad: err || !rounds ? 0 : bad / rounds, err: err };
    if (!err && sc[0]) {
      if (i === 0) { row.d = 0; row.dse = 0; }
      else { var df = new Float64Array(K); for (k = 0; k < K; k++) df[k] = s[k] - sc[0][k]; var dm = meanSE(df, K); row.d = dm.mean; row.dse = dm.se; }
    }
    rows.push(row); trace.push({ id: pl.id, score: err ? NaN : s[0], log: log });
  }
  return { rows: rows, trace: trace };
};

QL.jobs = QL.jobs || {};
/** 任务：几条规则在一套玩法里比。m: { game: 玩法那段代码的编号, gp, T, K, seed, entries: [{ id, p }] } */
QL.jobs.game = function (m, CODE, progress) {
  var S = CODE[m.game];
  if (!S || typeof S.deal !== "function" || typeof S.referee !== "function") throw new Error("玩法的代码里要有 deal(T, rng, p) 和 referee(G, t, a) 这两个函数");
  var game = { deal: S.deal, show: typeof S.show === "function" ? S.show : null, referee: S.referee }, gp = QL.jobParams(m.gp);
  var T = Math.max(1, Math.min(2000, m.T | 0 || 20)), K = Math.max(1, Math.min(20000, m.K | 0 || 2000)), seed = m.seed | 0, players = [], skipped = [];
  K = Math.max(1, Math.min(K, Math.floor(4e6 / T)));
  (m.entries || []).slice(0, QL.SHOP.maxRules).forEach(function (en) {
    var R = CODE[en.id];
    if (!R || typeof R.decide !== "function") { skipped.push({ id: en.id, err: "代码里没有定义 decide(s, p, st) 函数" }); return; }
    players.push({ id: en.id, decide: R.decide, init: R.init || null, p: QL.jobParams(en.p) });
  });
  if (!players.length) return { T: T, K: K, seed: seed, rows: [], skipped: skipped, trace: [] };
  var out = QL.shopRun(game, gp, T, K, seed, players, progress);
  return { T: T, K: K, seed: seed, rows: out.rows, skipped: skipped, trace: out.trace };
};
/** 任务：试一个世界。m: { id: 世界那段代码的编号, p, T, K, N, seed }。返回几个数和几条样本路径 */
QL.jobs.world = function (m, CODE, progress) {
  var S = CODE[m.id];
  if (!S || typeof S.simulate !== "function") throw new Error("代码里没有定义 simulate(T, rng, p, K) 函数");
  var T = Math.max(10, Math.min(4000, m.T | 0 || 252)), N = Math.max(20, Math.min(4000, m.N | 0 || 400)), K = +m.K > 0 ? Math.min(+m.K, 100000) : 252;
  if (N * T > 2e6) N = Math.max(20, Math.floor(2e6 / T));
  progress({ id: m.id });
  var B = QL.makeBatch({ type: "custom", params: Object.assign({}, QL.jobParams(m.p)), N: N, T: T, K: K, seed: m.seed | 0, S0: 100 }, { simulate: S.simulate }, 0), ws = QL.worldStats(B);
  var G = ws.grid.length, arr = function (a) { return Array.prototype.map.call(a, function (v) { return +(+v).toPrecision(7); }); }, paths = [], i;
  for (i = 0; i < Math.min(8, ws.paths.n); i++) paths.push(arr(ws.paths.data.subarray(i * G, (i + 1) * G)));
  return { N: N, T: T, K: K, annMean: ws.annMean, annVol: ws.annVol, skew: ws.skew, kurt: ws.kurt, min: ws.min, max: ws.max, acf1: ws.acf.length ? ws.acf[0] : NaN, acfAbs1: ws.acfAbs.length ? ws.acfAbs[0] : NaN,
    grid: Array.prototype.slice.call(ws.grid), q5: arr(ws.fan.q5), q50: arr(ws.fan.q50), q95: arr(ws.fan.q95), paths: paths };
};
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_SHOP_INSTALL;
