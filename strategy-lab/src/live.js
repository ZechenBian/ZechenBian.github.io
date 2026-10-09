// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 现算
 * 对照表和手册里引用的数字不再事先写好，而是在用户自己的电脑上算出来。这里是与界面无关的那一半：
 * 对照表列哪些世界、哪些场景（清单），一格怎么算，一次指定的实验怎么跑。主线程用清单画表；后台线程和 Node 里的测试用它来算。
 * 算法与主界面的回测完全一致（同样的种子、同样的批次、同样的默认参数），所以从表里点过去，页面上看到的是同一个数。 */
function QL_LIVE_INSTALL(QL) {
"use strict";
var WORLDS = QL.WORLDS, LV = QL.live = { SEED: 7, v: 2 };
function r5(x) { return x == null || x !== x ? null : x === Infinity ? "inf" : x === -Infinity ? "-inf" : +x.toPrecision(5); }
function defaultsOf(st) { var p = {}; (st.params || []).forEach(function (q) { p[q.key] = q.def; }); return p; }
function paired(a, b) { var n = a.length, s = 0, s2 = 0; for (var i = 0; i < n; i++) { var d = a[i] - b[i]; s += d; s2 += d * d; } var m = s / n; return { m: m, se: Math.sqrt(Math.max(0, s2 / n - m * m) / n) }; }
LV.set = function () { return Object.assign({}, QL.DEFAULT_SET); };

/* ---------- 价格世界那张表 ---------- */
LV.PRICE_COLS = ["g", "dg", "dgSE", "sharpe", "sharpeSE", "mean", "ddMed", "ruin", "turnover", "gSE"];
LV.PW = [
  { key: "iid", type: "iid", over: {}, name: "经典分布·正态" },
  { key: "iid_t", type: "iid", over: { dist: "t", nu: 3 }, name: "经典分布·厚尾" },
  { key: "gbm", type: "gbm", over: {}, name: "几何布朗运动" },
  { key: "jump", type: "jump", over: {}, name: "跳跃扩散" },
  { key: "heston", type: "heston", over: {}, name: "随机波动率" },
  { key: "garch", type: "garch", over: {}, name: "GARCH" },
  { key: "regime", type: "regime", over: {}, name: "牛熊切换" },
  { key: "ar1", type: "ar1", over: {}, name: "AR(1) 动量" },
  { key: "ar1_rev", type: "ar1", over: { phi: -0.1 }, name: "AR(1) 反转" },
  { key: "fbm", type: "fbm", over: {}, name: "分数布朗运动" },
  { key: "ou", type: "ou", over: {}, name: "均值回复" },
  { key: "osc", type: "osc", over: {}, name: "带噪谐振子" },
  { key: "logistic", type: "logistic", over: {}, name: "Logistic 映射" },
  { key: "lorenz", type: "lorenz", over: {}, name: "洛伦兹系统" },
  { key: "boot", type: "boot", over: {}, name: "Bootstrap·标普月线", ds: "sample-spx" }
];
/** series：需要外部数据的世界用的那段数据 {v, K}，别的世界传 null */
LV.priceCfg = function (w, series) {
  var d = WORLDS[w.type];
  return { cfg: { type: w.type, params: Object.assign(QL.worldDefaults(w.type), w.over), N: d.defaults.N, T: d.defaults.T, K: series ? series.K : d.defaults.K, seed: LV.SEED, S0: 100 }, ext: series ? { series: series.v, splitPct: 70 } : { splitPct: 70 } };
};
/** 一条规则在一个价格世界里的那一格。S 是编译好的规则 {init, decide, fit}，st 带着它的参数表；memo 在同一个世界的各条规则之间共用，省得把路径重新生成一遍 */
LV.priceCell = function (S, st, w, series, memo) {
  var m = LV.priceCfg(w, series), cfg = m.cfg, ext = m.ext, isData = cfg.type === "real" || cfg.type === "boot", p = defaultsOf(st), SET = LV.set(), tag = S.fit && isData ? "eval" : "";
  memo = memo || {};
  var train = memo["b" + tag] || (memo["b" + tag] = QL.makeBatch(cfg, ext, 0, tag || undefined)), model, fitMs = null, t0;
  if (S.fit) { t0 = Date.now(); model = S.fit(QL.makeData(memo.fit || (memo.fit = QL.makeBatch(cfg, ext, 0, "fit"))), p, QL.ml, new QL.RNG(cfg.seed, -3, -3)); fitMs = Date.now() - t0; }
  t0 = Date.now();
  var res = QL.runBatch(train, S, p, SET, {}, model), ms = Date.now() - t0;
  var bench = memo["h" + tag] || (memo["h" + tag] = QL.runBatch(train, QL.benchFor(cfg.type), {}, { costBps: SET.costBps, rf: SET.rf, fmin: Math.min(SET.fmin, 0), fmax: Math.max(SET.fmax, 1), lam: 1 }, {}));
  var s = QL.summarize(res, SET, bench), b = QL.summarize(bench, SET);
  return { cell: [r5(s.growth), r5(s.dGrowth), r5(s.dGrowthSE), r5(s.sharpe), r5(s.sharpeSE), r5(s.meanW - 1), r5(s.ddMed), r5(s.pRuin), r5(s.turnover), r5(s.growthSE)],
    bench: [r5(b.growth), r5(b.sharpe), r5(b.meanW - 1), r5(b.ddMed)], N: train.N, T: train.T, K: train.K, ms: ms, fitMs: fitMs, plain: !tag };
};

/* ---------- 每套玩法各一张表 ---------- */
/** 规则在某个场景里用的参数：默认场景下的默认值（玩法可以把个别默认值换成当前设定下的最优值），换场景时不重新调，只收回到允许的范围之内 */
LV.gameParams = function (type, strats) {
  var w = WORLDS[type], base = QL.worldDefaults(type), R0 = w.ranges ? w.ranges(base) : {}, out = {};
  strats.forEach(function (st) { var p = defaultsOf(st); (st.params || []).forEach(function (q) { var r = R0[st.lib + "." + q.key]; if (r && r[2] != null) p[q.key] = r[2]; }); out[st.id] = p; });
  return out;
};
/** 规则在第 si 个场景里实际用的参数。十套玩法：默认场景下的那一组，收回到这个场景允许的范围之内。
 *  声明了 retune 的玩法（四套观测玩法：各个场景是不同的世界，同一组参数没有可比性）：凡是玩法按当前设定给了默认值的参数，就用这个场景自己的默认值 */
LV.sceneParams = function (type, si, strats) {
  var w = WORLDS[type], params = Object.assign(QL.worldDefaults(type), w.scenes[si].p), Rg = w.ranges ? w.ranges(params) : {}, basep = LV.gameParams(type, strats), out = {};
  strats.forEach(function (st) {
    var p = Object.assign({}, basep[st.id]);
    (st.params || []).forEach(function (q) {
      var r = Rg[st.lib + "." + q.key], lo = r ? r[0] : q.min, hi = r ? r[1] : q.max;
      if (w.retune && r && r[2] != null) p[q.key] = r[2];
      if (typeof p[q.key] === "number") p[q.key] = Math.min(hi, Math.max(lo, p[q.key]));
    });
    out[st.id] = p;
  });
  return out;
};
/** 一套玩法的清单：有哪些场景、哪些规则、各用什么参数。不含任何算出来的数 */
LV.gameSpec = function (type, strats) {
  var w = WORLDS[type], base = QL.worldDefaults(type), sd = w.score(base);
  return {
    name: w.short, retune: !!w.retune, lower: !!sd.lower, kind: sd.kind || "num", digits: sd.digits == null ? 3 : sd.digits, scoreName: sd.name, strats: strats.map(function (s) { return s.id; }), params: LV.gameParams(type, strats), cells: {},
    scenes: w.scenes.map(function (sc) {
      var params = Object.assign({}, base, sc.p), T = w.Tof(params), N = Math.max(1, Math.min(w.defaults.N, Math.floor(QL.GAME_MAX_CELLS / T))), sdc = w.score(params), bs = QL.gameBenchSpec(type, params);
      return { name: sc.name, p: sc.p, N: N, T: T, bench: undefined, benchName: bs ? bs.name : "", scoreName: sdc.name, kind: sdc.kind || "num", digits: sdc.digits == null ? 3 : sdc.digits };
    })
  };
};
/** 一套玩法的一个场景：基准的得分，和每条规则的那一格 [得分, 标准误, 与基准的配对差, 配对差的标准误, 附带统计…] */
LV.gameScene = function (type, si, strats, each) {
  var w = WORLDS[type], base = QL.worldDefaults(type), sc = w.scenes[si], params = Object.assign({}, base, sc.p), T = w.Tof(params), N = Math.max(1, Math.min(w.defaults.N, Math.floor(QL.GAME_MAX_CELLS / T)));
  var cfg = { type: type, params: params, N: N, T: T, K: w.Kof ? w.Kof(params) : 1, seed: LV.SEED, S0: 100 }, B = QL.makeBatch(cfg, null, 0), sp = LV.sceneParams(type, si, strats);
  var bs = QL.gameBenchSpec(type, params), bres = QL.runGame(B, bs.strat, bs.p, null, {}), bsum = QL.gameSummary(B, bres, null), cells = {}, fitB = null;
  var out = { bench: r5(bsum.score), cells: cells };
  if (each) each(null, out.bench);
  strats.forEach(function (st) {
    var S = QL.gameLib[st.lib], p = sp[st.id];
    try {
      var model = S.fit ? S.fit(QL.makeData(fitB || (fitB = QL.makeBatch(cfg, null, 0, "fit"))), p, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined;
      var res = QL.runGame(B, S, p, null, {}, model), g = QL.gameSummary(B, res, null), d = paired(res.SC, bres.SC);
      cells[st.id] = [r5(g.score), r5(g.se), r5(d.m), r5(d.se)].concat(g.aux.map(function (a) { return r5(a.value); }));
    } catch (e) { cells[st.id] = null; out.err = (out.err || "") + st.id + ": " + String(e && e.message || e) + "; "; }
    if (each) each(st.id, cells[st.id]);
  });
  return out;
};

/* ---------- 指定的一次实验（手册正文里引用的数字、自检用） ---------- */
/** job: { world, wp, strat, sp, N, T, K, seed, refs }。玩法里规则的参数先取默认值（含玩法按当前设定给的默认值），再盖上 sp。
 *  S 是这条规则编译好的样子（玩法自带的规则直接用裁判手里的那一份），st 带着它的参数表 */
LV.sim = function (job, S, st, series) {
  var type = job.world, w = WORLDS[type], params = Object.assign(QL.worldDefaults(type), job.wp || {}), seed = job.seed == null ? LV.SEED : job.seed, p = defaultsOf(st), cfg, ext = null, model, res, out;
  if (w.game) {
    var T = w.Tof(params), N = Math.max(1, Math.min(job.N || w.defaults.N, Math.floor(QL.GAME_MAX_CELLS / T))), Rg = w.ranges ? w.ranges(params) : {};
    (st.params || []).forEach(function (q) { var r = Rg[st.lib + "." + q.key]; if (r && r[2] != null) p[q.key] = r[2]; });
    Object.assign(p, job.sp || {});
    cfg = { type: type, params: params, N: N, T: T, K: w.Kof ? w.Kof(params) : 1, seed: seed, S0: 100 };
    var B = QL.makeBatch(cfg, null, 0), fitData = function () { return QL.makeData(QL.makeBatch(cfg, null, 0, "fit")); };
    model = S.fit ? S.fit(fitData(), p, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined;
    res = QL.runGame(B, S, p, null, {}, model);
    var refs = job.refs ? QL.gameRefs(B, { fitData: fitData }) : null, g = QL.gameSummary(B, res, refs), bs = QL.gameBenchSpec(type, params), d = null;
    if (bs) { var bres = QL.runGame(B, bs.strat, bs.p, null, {}); d = paired(res.SC, bres.SC); }
    out = { game: true, score: g.score, se: g.se, N: g.N, T: g.T, lower: g.lower, aux: g.aux.map(function (a) { return a.value; }), d: d ? d.m : null, dse: d ? d.se : null, bad: res.bad,
      refs: g.refs.map(function (r) { return { id: r.id, score: r.score, se: r.se, d: r.d, dse: r.dse, err: r.err || null }; }), marks: g.marks.map(function (m) { return { id: m.id, value: m.value }; }), note: model && model.note ? String(model.note) : "" };
  } else {
    Object.assign(p, job.sp || {});
    var d0 = w.defaults || {}, SET = Object.assign(LV.set(), job.set || {});
    cfg = { type: type, params: params, N: job.N || d0.N, T: job.T || d0.T, K: series ? series.K : job.K || d0.K, seed: seed, S0: 100 };
    ext = series ? { series: series.v, splitPct: 70 } : { splitPct: 70 };
    var isData = type === "real" || type === "boot", train = QL.makeBatch(cfg, ext, 0, S.fit && isData ? "eval" : undefined);
    model = S.fit ? S.fit(QL.makeData(QL.makeBatch(cfg, ext, 0, "fit")), p, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined;
    res = QL.runBatch(train, S, p, SET, {}, model);
    var bench = QL.runBatch(train, QL.benchFor(type), {}, { costBps: SET.costBps, rf: SET.rf, fmin: Math.min(SET.fmin, 0), fmax: Math.max(SET.fmax, 1), lam: 1 }, {}), s = QL.summarize(res, SET, bench), b = QL.summarize(bench, SET);
    out = { game: false, g: s.growth, gSE: s.growthSE, dg: s.dGrowth, dgSE: s.dGrowthSE, sharpe: s.sharpe, sharpeSE: s.sharpeSE, mean: s.meanW - 1, ddMed: s.ddMed, ruin: s.pRuin, pDD: s.pDD, turnover: s.turnover, exposure: s.exposure, N: train.N, T: train.T,
      bench: { g: b.growth, sharpe: b.sharpe, mean: b.meanW - 1, ddMed: b.ddMed } };
  }
  return out;
};

/* ---------- 后台线程 ---------- */
/** CODE：价格世界的内置规则，编译好的 {id: {init, decide, fit}}；META：全部内置规则的 {id, lib, game, params}。
 *  一条消息算一件事，算出一格就先发回一格：
 *    pcol {wi, sids, series}   一个价格世界里的若干条规则
 *    gcol {game, si}           一套玩法的一个场景（全部规则）
 *    sim  {job, series}        一次指定的实验 */
LV.main = function (scope, CODE, META) {
  var by = {}; META.forEach(function (m) { by[m.id] = m; });
  function compiled(id) { var m = by[id]; if (!m) throw new Error("没有这条规则：" + id); return m.lib ? QL.gameLib[m.lib] : CODE[id]; }
  scope.onmessage = function (ev) {
    var m = ev.data, t0 = Date.now();
    try {
      if (m.type === "pcol") {
        var w = LV.PW[m.wi], memo = {};
        m.sids.forEach(function (sid) {
          var r; try { r = LV.priceCell(compiled(sid), by[sid], w, m.series || null, memo); } catch (e) { r = { cell: null, err: String(e && e.message || e) }; }
          scope.postMessage({ type: "cell", id: m.id, wi: m.wi, sid: sid, cell: r.cell, bench: r.plain ? r.bench : null, N: r.N, T: r.T, K: r.K, err: r.err || null });
        });
      } else if (m.type === "gcol") {
        var list = META.filter(function (x) { return x.game === m.game; });
        var out = LV.gameScene(m.game, m.si, list, function (sid, v) { scope.postMessage(sid == null ? { type: "gbench", id: m.id, game: m.game, si: m.si, bench: v } : { type: "gcell", id: m.id, game: m.game, si: m.si, sid: sid, cell: v }); });
        if (out.err) scope.postMessage({ type: "note", id: m.id, message: out.err });
      } else if (m.type === "sim") {
        scope.postMessage({ type: "sim", id: m.id, key: m.key, res: LV.sim(m.job, compiled(m.job.strat), by[m.job.strat], m.series || null) });
      } else throw new Error("未知消息: " + m.type);
      scope.postMessage({ type: "done", id: m.id, ms: Date.now() - t0 });
    } catch (e) {
      scope.postMessage({ type: "error", id: m.id, key: m.key, message: String(e && e.message || e) });
    }
  };
  scope.postMessage({ type: "ready" });
};
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_LIVE_INSTALL;
