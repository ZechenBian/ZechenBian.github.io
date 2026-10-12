// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 规则同场（引擎这一半）
 * 别处的规则都是各打各的：对手是裁判手里的随机数。这里把几条规则放进同一个市场，互相当对手，一条规则赚多少取决于别的规则怎么出手。
 * 两种市场，信息结构是同一个（Kagel–Levin 1986 的共同价值拍卖实验）：
 *   每一回合有一件东西，真实价值 V 在 [lo, hi] 上均匀分布，谁也看不到；每条规则各自看到一个带误差的估计 x = V + U(−ε, ε)，互相独立。
 *   竞价（auction）：各出一个价，出价最高的买走。第一价格：付自己出的价；第二价格：付第二高的出价（只有一个人出价时付 0）。买到的人赚 V − 付的钱。
 *   做市（mm）：各报一个半价差 h，等于同时挂出卖价 x + h 和买价 x − h。来一位客人：
 *       不知情的（概率 1 − π）随机想买或想卖，在最好的那个报价上成交，只要它离 V 不超过 R；
 *       知情的（概率 π）知道 V，只在有便宜可占时出手：最低卖价低于 V 就买，最高买价高于 V 就卖，挑便宜大的那一边。
 *     成交的那条规则：卖出去赚 卖价 − V，买进来赚 V − 买价。
 * 每回合结束，V、成交价、谁成交了都公布，规则可以边打边学。得分 = 平均每回合的盈亏；比很多场（每场换一批随机数），报均值和标准误。
 * 已知的结论（信号离边界不太近时）：
 *   · 信号是多少就出多少：出价最高的人拿到的恰恰是最乐观的那个估计，E[V − 最高的信号] = −ε(N−1)/(N+1)，这就是赢家诅咒。
 *   · 让 ε(N−1)/(N+1) 刚好保本；第一价格下的均衡出价是 x − ε + Y，Y = 2ε/(N+1)·exp(−N(x − lo − ε)/(2ε))，
 *     全场都这样出时，赢的人期望赚 2ε/(N+1) − Y。第二价格下的均衡出价是 x − ε(N−2)/N。
 *   · 做市是反过来的同一件事：挂出最低卖价的人，手里是最悲观的那个估计。人越多，越要多让。
 * 规则拿到的 s：t, T, n（场上几条规则）, x（这一回合我的估计）, g（常数：market, lo, hi, eps, fmt, pi, R）,
 *   last（上一回合我的盈亏）, lastA（上一回合我报的数）, won（上一回合我成交了没有，1 / 0）, v（上一回合的真实价值）,
 *   win（上一回合的成交价，没成交是 NaN）, side（做市：上一回合客人是买 +1、卖 −1、没成交 0）, total（我到目前为止的累计盈亏）, rnd()（均匀随机数）。
 *   每回合给的是一个新的、冻住的对象。返回一个数：竞价里是出价（不大于 0 或者不是数 = 这一回合不出价），做市里是半价差（不是数 = 这一回合不报价，负数按 0 算）。
 * 这个文件在后台线程里执行（jobs.js 把它编进去）；主线程里只用到市场的清单、自带的规则和理论值。 */
function QL_ARENA_INSTALL(QL) {
"use strict";
var RNG = QL.RNG;
var MARKETS = {
  auction: { name: "竞价", defaults: { lo: 50, hi: 250, eps: 20, fmt: "first", pi: 0, R: 0 } },
  mm: { name: "做市", defaults: { lo: 50, hi: 250, eps: 20, fmt: "first", pi: 0.2, R: 60 } }
};
/* 自带的规则：代码就是给人看、给人改的样板 */
var LIB = [
  { id: "a_face", market: "auction", name: "信号是多少出多少", summary: "把自己的估计当真：出价 = x。", p: {},
    code: "// 信号是多少就出多少。\n// 出价最高的人，手里是全场最乐观的那个估计：平均每次买贵 ε(N−1)/(N+1)。\nfunction decide(s, p) {\n  return s.x;\n}" },
  { id: "a_even", market: "auction", name: "保本价", summary: "让掉赢家诅咒那一截：出价 = x − ε(N−1)/(N+1)。", p: {},
    code: "// 假如我的估计是全场最高的，V 平均比它低 ε(N−1)/(N+1)。让掉这一截，买到手的时候平均不赚不亏。\nfunction decide(s, p) {\n  return s.x - s.g.eps * (s.n - 1) / (s.n + 1);\n}" },
  { id: "a_eq", market: "auction", name: "均衡出价", summary: "所有人都这样出时，谁单独改主意都占不到便宜（Kagel–Levin 1986）。", p: {},
    code: "// 风险中性的对称均衡。\n// 第一价格：x − ε + Y，Y = 2ε/(N+1)·exp(−N(x − lo − ε)/(2ε))；信号比 lo + ε 还低时是 lo + (x + ε − lo)/(N+1)。\n// 第二价格：x − ε(N−2)/N（假如第二高的估计和我的一样，V 的期望值）。\n// 信号贴近上边界 hi 时这只是近似。\nfunction decide(s, p) {\n  var g = s.g, n = s.n, e = g.eps;\n  if (g.fmt === \"second\") return s.x - e * (n - 2) / n;\n  if (s.x < g.lo + e) return g.lo + (s.x + e - g.lo) / (n + 1);\n  return s.x - e + 2 * e / (n + 1) * Math.exp(-n * (s.x - g.lo - e) / (2 * e));\n}" },
  { id: "a_cut", market: "auction", name: "固定让价", summary: "出价 = x − d，d 是一个固定的数。", p: { d: 10 },
    code: "// 每次都比自己的估计少出 d。d 太小会中赢家诅咒，太大又总是买不到。\nfunction decide(s, p) {\n  return s.x - p.d;\n}" },
  { id: "a_learn", market: "auction", name: "边打边调", summary: "不用公式：买贵了就多让一点，很久买不到就少让一点。", p: { d0: 5, up: 2, down: 0.5, wait: 8 },
    code: "// 从盈亏里学让价 d。\n// 上一回合买到了而且亏了：d 加 up。连着 wait 个回合没买到：d 减 down。\nfunction init(p) {\n  return { d: p.d0, dry: 0 };\n}\nfunction decide(s, p, st) {\n  if (s.t > 0) {\n    if (s.won) { st.dry = 0; if (s.last < 0) st.d += p.up; }\n    else if (++st.dry >= p.wait) { st.dry = 0; st.d = Math.max(0, st.d - p.down); }\n  }\n  return s.x - st.d;\n}" },
  { id: "m_fix", market: "mm", name: "固定价差", summary: "半价差永远是 h。", p: { h: 6 },
    code: "// 卖价 = x + h，买价 = x − h。\n// h 小：总能抢到单，但抢到的多半是自己估错的那些。h 大：安全，可是没人找你成交。\nfunction decide(s, p) {\n  return p.h;\n}" },
  { id: "m_even", market: "mm", name: "保本价差", summary: "半价差 = ε(N−1)/(N+1)：对不知情的客人刚好保本。", p: {},
    code: "// 卖价全场最低的那条规则，手里是最悲观的估计：V 平均比它高 ε(N−1)/(N+1)。\n// 半价差取这么大，卖给不知情的客人平均不赚不亏；碰上知情的客人还是要亏。\nfunction decide(s, p) {\n  return s.g.eps * (s.n - 1) / (s.n + 1);\n}" },
  { id: "m_safe", market: "mm", name: "保本再加一点", summary: "半价差 = ε(N−1)/(N+1) + m，多出来的 m 用来垫知情客人那一头。", p: { m: 4 },
    code: "// 在保本价差上再加 m。知情的客人越多（s.g.pi 越大），m 就该越大。\nfunction decide(s, p) {\n  return s.g.eps * (s.n - 1) / (s.n + 1) + p.m;\n}" },
  { id: "m_learn", market: "mm", name: "边做边调", summary: "成交了却亏钱就把价差放宽，很久没人成交就收窄。", p: { h0: 8, up: 1.5, down: 0.4, wait: 6 },
    code: "// 从盈亏里学半价差 h。\nfunction init(p) {\n  return { h: p.h0, dry: 0 };\n}\nfunction decide(s, p, st) {\n  if (s.t > 0) {\n    if (s.won) { st.dry = 0; if (s.last < 0) st.h += p.up; }\n    else if (++st.dry >= p.wait) { st.dry = 0; st.h = Math.max(0, st.h - p.down); }\n  }\n  return st.h;\n}" }
];
function consts(market, over) {
  var d = MARKETS[market].defaults, o = over || {}, lo = +o.lo, hi = +o.hi, eps = +o.eps, pi = +o.pi, R = +o.R;
  lo = isFinite(lo) ? lo : d.lo; hi = isFinite(hi) && hi > lo ? hi : lo + (d.hi - d.lo);
  return Object.freeze({ market: market, lo: lo, hi: hi, eps: isFinite(eps) && eps > 0 ? Math.min(eps, 1e6) : d.eps, fmt: o.fmt === "second" ? "second" : "first",
    pi: market === "mm" ? Math.min(1, Math.max(0, isFinite(pi) ? pi : d.pi)) : 0, R: market === "mm" ? (isFinite(R) && R > 0 ? R : d.R) : 0 });
}
/** 这个市场、这么多条规则时的几个理论值：[{ id, name, value }]，都是"平均每回合每条规则的盈亏" */
function marks(g, n) {
  var e = g.eps, out = [];
  if (n < 2) return out;
  if (g.market === "auction") {
    out.push({ id: "face", name: "全场都\"信号是多少出多少\"", value: -e * (n - 1) / (n + 1) / n });
    out.push({ id: "even", name: "全场都出保本价", value: 0 });
    if (g.fmt === "first") out.push({ id: "eq", name: "全场都按均衡出价（信号不贴边界时的近似）", value: 2 * e / (n + 1) / n });
  } else if (!(g.pi > 0)) {
    out.push({ id: "even", name: "全场都报保本价差", value: 0 });
  }
  return out;
}
QL.ARENA = { markets: MARKETS, lib: LIB, consts: consts, marks: marks, ver: 1 };

/** 打一场。players: [{ decide, init, p }]；返回 { pnl[], fills[], edge[], act[], nact[], bad[], err[], trace }。
 *  trace 为真时记下每回合之后各条规则的累计盈亏 */
QL.arenaMatch = function (g, T, players, seed, k, trace) {
  var n = players.length, rng = new RNG(seed, k, 9001), i, t, auction = g.market === "auction", second = g.fmt === "second";
  var st = [], rnds = [], tot = new Float64Array(n), last = new Float64Array(n).fill(NaN), lastA = new Float64Array(n).fill(NaN), won = new Uint8Array(n);
  var fills = new Float64Array(n), edge = new Float64Array(n), act = new Float64Array(n), nact = new Float64Array(n), bad = new Float64Array(n), err = [], x = new Float64Array(n), a = new Float64Array(n);
  var pv = NaN, pwin = NaN, pside = 0, cum = trace ? players.map(function () { return new Float32Array(T + 1); }) : null;
  for (i = 0; i < n; i++) {
    err.push("");
    (function (r) { rnds.push(function () { return r.u(); }); })(new RNG(seed, k * 64 + i, 9002));
    try { st.push(players[i].init ? players[i].init(players[i].p) || {} : {}); } catch (e) { st.push({}); err[i] = String(e && e.message || e); }
  }
  for (t = 0; t < T; t++) {
    var V = g.lo + (g.hi - g.lo) * rng.u();
    for (i = 0; i < n; i++) x[i] = V + g.eps * (2 * rng.u() - 1);
    for (i = 0; i < n; i++) {
      var r = NaN;
      if (!err[i]) {
        try { r = players[i].decide(Object.freeze({ t: t, T: T, n: n, x: x[i], g: g, last: last[i], lastA: lastA[i], won: won[i], v: pv, win: pwin, side: pside, total: tot[i], rnd: rnds[i] }), players[i].p, st[i]); }
        catch (e2) { err[i] = String(e2 && e2.message || e2); r = NaN; }   // 抛过一次错的规则，这一场余下的回合不再问它
      }
      if (typeof r !== "number" || r !== r || r === Infinity || r === -Infinity) { if (!err[i]) bad[i]++; r = NaN; }
      a[i] = r; lastA[i] = r; last[i] = 0; won[i] = 0;
    }
    var w = -1, price = NaN, side = 0, ties, u;
    if (auction) {
      var best = 0, sec = 0;
      for (i = 0; i < n; i++) { var b = a[i] > 0 ? a[i] : 0; if (b > 0) { act[i] += x[i] - b; nact[i]++; } if (b > best) { if (best > sec) sec = best; best = b; } else if (b > sec) sec = b; }
      if (best > 0) {
        ties = []; for (i = 0; i < n; i++) if (a[i] === best) ties.push(i);
        w = ties.length > 1 ? ties[Math.floor(rng.u() * ties.length)] : ties[0];
        if (second && ties.length > 1) sec = best;
        price = second ? sec : best; side = 1;
        last[w] = V - price;
      }
    } else {
      var ask = Infinity, bid = -Infinity;
      for (i = 0; i < n; i++) { if (a[i] !== a[i]) continue; var hh = a[i] > 0 ? a[i] : 0; a[i] = hh; act[i] += hh; nact[i]++; if (x[i] + hh < ask) ask = x[i] + hh; if (x[i] - hh > bid) bid = x[i] - hh; }
      if (ask < Infinity) {
        u = rng.u();
        if (u < g.pi) { var gb = V - ask, gs = bid - V; side = gb > 0 && gb >= gs ? 1 : gs > 0 ? -1 : 0; }
        else { side = rng.u() < 0.5 ? 1 : -1; if (side > 0 ? ask > V + g.R : bid < V - g.R) side = 0; }
        if (side) {
          ties = []; for (i = 0; i < n; i++) if (a[i] === a[i] && (side > 0 ? x[i] + a[i] === ask : x[i] - a[i] === bid)) ties.push(i);
          w = ties.length > 1 ? ties[Math.floor(rng.u() * ties.length)] : ties[0];
          price = side > 0 ? ask : bid;
          last[w] = side > 0 ? price - V : V - price;
        }
      }
    }
    if (w >= 0) { won[w] = 1; fills[w]++; edge[w] += last[w]; tot[w] += last[w]; }
    pv = V; pwin = price; pside = w >= 0 ? side : 0;
    if (cum) for (i = 0; i < n; i++) cum[i][t + 1] = tot[i];
  }
  return { pnl: tot, fills: fills, edge: edge, act: act, nact: nact, bad: bad, err: err, trace: cum };
};
/** 比 K 场，汇总成每条规则一行：{ id, mean, se, fill, edge, act, bad, err } */
QL.arenaRun = function (g, T, K, players, seed, progress) {
  var n = players.length, s1 = new Float64Array(n), s2 = new Float64Array(n), fills = new Float64Array(n), edge = new Float64Array(n), act = new Float64Array(n), nact = new Float64Array(n), bad = new Float64Array(n), err = players.map(function () { return ""; }), trace = null, k, i;
  for (k = 0; k < K; k++) {
    var m = QL.arenaMatch(g, T, players, seed, k, k === 0);
    if (k === 0) trace = m.trace;
    for (i = 0; i < n; i++) { var v = m.pnl[i] / T; s1[i] += v; s2[i] += v * v; fills[i] += m.fills[i]; edge[i] += m.edge[i]; act[i] += m.act[i]; nact[i] += m.nact[i]; bad[i] += m.bad[i]; if (m.err[i] && !err[i]) err[i] = m.err[i]; }
    if (progress && (k % 10 === 9 || k === K - 1)) progress({ done: k + 1, total: K });
  }
  return {
    rows: players.map(function (pl, j) {
      var mean = s1[j] / K, va = K > 1 ? Math.max(0, (s2[j] - s1[j] * s1[j] / K) / (K - 1)) : 0;
      return { id: pl.id, mean: mean, se: K > 1 ? Math.sqrt(va / K) : NaN, fill: fills[j] / (K * T), edge: fills[j] ? edge[j] / fills[j] : NaN, act: nact[j] ? act[j] / nact[j] : NaN, bad: bad[j] / (K * T), err: err[j] };
    }),
    trace: trace ? trace.map(function (c) { return Array.prototype.slice.call(c); }) : null
  };
};
/** 任务：m: { market, params, T, K, seed, entries: [{ id, p }] }。先让每条规则单独走几步（卡死的话外面知道是哪一条），再正式比 */
QL.jobs = QL.jobs || {};
QL.jobs.arena = function (m, CODE, progress) {
  var market = MARKETS[m.market] ? m.market : "auction", g = consts(market, m.params), T = Math.max(5, Math.min(2000, m.T | 0 || 200)), K = Math.max(1, Math.min(5000, m.K | 0 || 200)), seed = m.seed | 0;
  var players = [], skipped = [];
  (m.entries || []).slice(0, 8).forEach(function (en) {
    var S = CODE[en.id];
    if (!S || typeof S.decide !== "function") { skipped.push({ id: en.id, err: "代码里没有定义 decide(s, p, st) 函数" }); return; }
    var pl = { id: en.id, decide: S.decide, init: S.init || null, p: QL.jobParams(en.p) };
    progress({ id: en.id, warm: true });
    var w = QL.arenaMatch(g, 12, [pl, { id: "_", decide: function (s) { return s.x; }, init: null, p: {} }], seed, 4000000, false);   // 体检：单独走 12 个回合
    if (w.err[0]) { skipped.push({ id: en.id, err: w.err[0] }); return; }
    players.push(pl);
  });
  if (players.length < 2) return { market: market, g: g, T: T, K: K, n: players.length, rows: [], skipped: skipped, trace: null, marks: [] };
  progress({ id: "", start: true });
  var out = QL.arenaRun(g, T, K, players, seed, function (p) { progress(p); });
  return { market: market, g: g, T: T, K: K, n: players.length, rows: out.rows, skipped: skipped, trace: out.trace, marks: marks(g, players.length) };
};
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_ARENA_INSTALL;
