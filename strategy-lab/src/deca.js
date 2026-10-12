// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 十项全能（引擎这一半）
 * 一条规则走遍十个世界。每个世界都用它的默认参数、同一组交易设定（默认的成本和仓位上下限），生成 N 条路径，
 * 规则和买入持有在同一批路径上各跑一遍，比的是长期增长率（每年的对数增长率）之差：正数表示比买入持有好。
 * 十项全能的得分 = 十个差里最小的那一个。所以想拿高分，不是在哪个世界里大赚，而是在每个世界里都不比买入持有差。
 * 有一条路径破产，那一项的增长率就是负无穷，整个得分也是负无穷。
 * 每个星期（周一 UTC 0 点起）换一个种子：这个星期大家用的是同一批路径，下个星期换一批，针对种子调参数的规则到时候会现原形。
 * 这个文件在后台线程里执行（jobs.js 把它编进去），主线程里只用到赛季和项目的清单。 */
function QL_DECA_INSTALL(QL) {
"use strict";
var WORLDS = QL.WORLDS;
// 十个项目：四个没有可预测性的（只有漂移；偶发大跌；波动自己在动；波动聚集）、三个有记忆的、一个均值回复的、两个确定性混沌的
var EVENTS = ["gbm", "jump", "heston", "garch", "regime", "ar1", "fbm", "ou", "logistic", "lorenz"];
var N = 1000;
function hs(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return QL.hash32(x); }
QL.DECA = { events: EVENTS.slice(), N: N, ver: 1 };
/** 这一刻属于哪个赛季：{ id: 这个星期一的日期（UTC）, seed, next: 下个星期一 0 点的毫秒时间戳 } */
QL.decaSeason = function (ms) {
  var d = Math.floor(ms / 864e5), mon = d - ((d + 3) % 7), id = new Date(mon * 864e5).toISOString().slice(0, 10);   // 1970-01-01 是星期四
  return { id: id, seed: hs("deca|" + QL.DECA.ver + "|" + id) % 1000000, next: (mon + 7) * 864e5 };
};
QL.decaCfg = function (type, seed, n) { var d = WORLDS[type].defaults; return { type: type, params: QL.worldDefaults(type), N: n || N, T: d.T, K: d.K, seed: seed, S0: 100 }; };
QL.decaSet = function () { return Object.assign({}, QL.DEFAULT_SET); };
/** 一个项目用到的东西，同一件任务里各条规则共用：路径、买入持有在上面的结果 */
function stage(cache, type, seed, n) {
  if (cache[type]) return cache[type];
  var cfg = QL.decaCfg(type, seed, n), set = QL.decaSet(), B = QL.makeBatch(cfg, null, 0);
  var s2 = { costBps: set.costBps, rf: set.rf, fmin: Math.min(set.fmin, 0), fmax: Math.max(set.fmax, 1), lam: 1 };
  var bench = QL.runBatch(B, QL.benchFor(type), {}, s2, {});
  return (cache[type] = { cfg: cfg, set: set, B: B, bench: bench, benchSum: QL.summarize(bench, set), fitD: null });
}
/** 一条规则在一个项目上：{ id, growth, bench, d, dse, sharpe, pRuin, bad, turnover, N, T }。d 是比买入持有每年多出来的对数增长率 */
QL.decaEvent = function (type, seed, strat, p, n, cache) {
  var S = stage(cache || {}, type, seed, n), model;
  if (strat.fit) {   // 带训练的规则：模型在另外生成的一批路径上学，计分用的这批它没见过
    if (!S.fitD) S.fitD = QL.makeData(QL.makeBatch(S.cfg, null, 0, "fit"));
    model = strat.fit(S.fitD, p, QL.ml, new QL.RNG(S.cfg.seed, -3, -3));
  }
  var res = QL.runBatch(S.B, strat, p, S.set, {}, model), sum = QL.summarize(res, S.set, S.bench), ruined = sum.growth === -Infinity;
  return { id: type, growth: sum.growth, bench: S.benchSum.growth, d: ruined ? -Infinity : sum.dGrowth, dse: ruined ? NaN : sum.dGrowthSE, sharpe: sum.sharpe, pRuin: sum.pRuin, bad: sum.badFrac, turnover: sum.turnover, N: S.B.N, T: S.B.T };
};
/** 十项的得分：最差的那一项。{ score, worst } */
QL.decaScore = function (rows) {
  var score = Infinity, worst = "";
  rows.forEach(function (r) { var v = r.d === r.d ? r.d : -Infinity; if (v < score) { score = v; worst = r.id; } });
  return { score: rows.length ? score : NaN, worst: worst };
};
/** 任务：几条规则各走一遍十项。m: { seed, n, entries: [{ id, p }] }；CODE[id] 是那条规则编好的代码 */
QL.jobs = QL.jobs || {};
QL.jobs.deca = function (m, CODE, progress) {
  var cache = {}, out = [], seed = m.seed | 0, n = Math.max(20, Math.min(4000, m.n | 0 || N));
  (m.entries || []).forEach(function (en) {
    var S = CODE[en.id], rows = [], err = "", i;
    if (!S || typeof S.decide !== "function") { var r0 = { id: en.id, err: "代码里没有定义 decide(s, p, st) 函数", rows: [] }; out.push(r0); progress({ id: en.id, done: true, result: r0 }); return; }
    var strat = { decide: S.decide, init: S.init || null, fit: S.fit || null }, p = QL.jobParams(en.p);
    for (i = 0; i < EVENTS.length && !err; i++) {
      progress({ id: en.id, event: EVENTS[i], i: i, n: EVENTS.length });
      try { rows.push(QL.decaEvent(EVENTS[i], seed, strat, p, n, cache)); } catch (e) { err = String(e && e.message || e); }
    }
    var r = err ? { id: en.id, err: err, at: EVENTS[rows.length], rows: rows } : Object.assign({ id: en.id, rows: rows }, QL.decaScore(rows));
    out.push(r); progress({ id: en.id, done: true, result: r });
  });
  return { seed: seed, n: n, entries: out };
};
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_DECA_INSTALL;
