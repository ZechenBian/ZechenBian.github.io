// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 十套玩法（回合制的规则方案）
 * 每套玩法 = 生成这一局全部随机数的 gen(c) + 当裁判的 play(E)：一回合一回合地问规则要动作，按规则结算。
 * 玩法自带的规则（LIB）既是界面上能看能改的内置规则，也是摘要里"对照"一栏用的参照物：两处用的是同一份函数。
 * 同一份代码在主线程（只用元数据和理论值）和后台线程（真正去跑）里各执行一遍，所以必须自包含。 */
function QL_GAMES_INSTALL(QL) {
"use strict";
var WORLDS = QL.WORLDS, RNG = QL.RNG, num = QL.num, sel = QL.sel, GROUP = "十套玩法";
var LIB = {};
QL.WORLD_GROUPS.unshift(GROUP);
QL.GAME_GROUP = GROUP; QL.gameLib = LIB;

/* ================================================================== *
 *  一、小工具
 * ================================================================== */
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function npdf(x) { return Math.exp(-0.5 * x * x) / 2.5066282746310002; }
/** 标准正态分布函数（West 2005 的双精度算法） */
function ncdf(x) {
  var xa = Math.abs(x), c, b;
  if (xa > 37) c = 0;
  else {
    var e = Math.exp(-xa * xa / 2);
    if (xa < 7.07106781186547) {
      b = 3.52624965998911e-02 * xa + 0.700383064443688; b = b * xa + 6.37396220353165; b = b * xa + 33.912866078383;
      b = b * xa + 112.079291497871; b = b * xa + 221.213596169931; b = b * xa + 220.206867912376; c = e * b;
      b = 8.83883476483184e-02 * xa + 1.75566716318264; b = b * xa + 16.064177579207; b = b * xa + 86.7807322029461;
      b = b * xa + 296.564248779674; b = b * xa + 637.333633378831; b = b * xa + 793.826512519948; b = b * xa + 440.413735824752; c = c / b;
    } else { b = xa + 0.65; b = xa + 4 / b; b = xa + 3 / b; b = xa + 2 / b; b = xa + 1 / b; c = e / b / 2.506628274631; }
  }
  return x > 0 ? 1 - c : c;
}
QL.ncdf = ncdf; QL.npdf = npdf;
/** 单调增函数 f 在 [lo, hi] 上的零点 */
function bisect(f, lo, hi) { for (var i = 0; i < 90; i++) { var mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; } return (lo + hi) / 2; }
function msd(a) {
  var n = a.length, s = 0, s2 = 0, c = 0;
  for (var i = 0; i < n; i++) { var v = a[i]; if (v === v && v !== Infinity && v !== -Infinity) { s += v; s2 += v * v; c++; } }
  var m = c ? s / c : NaN, v2 = c > 1 ? Math.max(0, (s2 - s * s / c) / (c - 1)) : 0;
  return { m: m, sd: Math.sqrt(v2), se: c > 1 ? Math.sqrt(v2 / c) : NaN, n: c };
}
function paired(a, b) { var n = a.length, d = new Float64Array(n); for (var i = 0; i < n; i++) d[i] = a[i] - b[i]; return msd(d); }
QL.isGame = function (type) { return !!(WORLDS[type] && WORLDS[type].game); };

/* ================================================================== *
 *  二、框架：生成一批对局、逐回合裁判、汇总得分
 * ================================================================== */
/** 一批对局。R[n·T + t]：第 t 回合结束时揭晓的数；L[n·(T+1) + t]：第 t 回合行动之前就摆在面前的数。
 *  规则读得到的只有这两样（通过 s.x、s.ret(k) 等）；H 里的隐藏量只有裁判用。
 *  有的设定下连这两样也不该原样给规则（秘书问题"只能和见过的人比"：分数本身不能给）。
 *  这时玩法声明 veil(p) 为真，gen 另填一份 c.vr / c.vl，规则读到的是那一份；R / L 照旧留给裁判、图表和统计。 */
function gameBatch(cfg, batchId, part) {
  var w = WORLDS[cfg.type], p = cfg.params, N = cfg.N | 0, T = Math.max(1, w.Tof ? w.Tof(p) : cfg.T | 0), K = w.Kof ? w.Kof(p) : 1;
  if (N * T > QL.GAME_MAX_CELLS) throw new Error("这一批对局太大了（" + N + " 局 × " + T + " " + (w.stepUnit || w.unit || "回合") + "）：把局数调到 " + Math.max(1, Math.floor(QL.GAME_MAX_CELLS / T)) + " 以下，或者把每局的回合数调小。");
  var R = new Float64Array(N * T), L = new Float64Array(N * (T + 1)), H = {}, spec = w.hidden ? w.hidden(p, T) : {}, hk = Object.keys(spec), i, n;
  var veil = !!(w.veil && w.veil(p)), VR = veil ? new Float64Array(N * T) : null, VL = veil ? new Float64Array(N * (T + 1)) : null;
  for (i = 0; i < hk.length; i++) H[hk[i]] = new Float64Array(N * spec[hk[i]]);
  var bid = part === "fit" ? QL.FIT_BATCH - batchId : batchId;
  var c = { p: p, T: T, K: K, dt: 1 / K, S0: cfg.S0 || 100, rng: null, r: null, lv: null, h: {}, n: 0, N: N };
  for (n = 0; n < N; n++) {
    c.rng = new RNG(cfg.seed, n, bid); c.n = n; c.r = R.subarray(n * T, (n + 1) * T); c.lv = L.subarray(n * (T + 1), (n + 1) * (T + 1));
    if (veil) { c.vr = VR.subarray(n * T, (n + 1) * T); c.vl = VL.subarray(n * (T + 1), (n + 1) * (T + 1)); }
    for (i = 0; i < hk.length; i++) c.h[hk[i]] = H[hk[i]].subarray(n * spec[hk[i]], (n + 1) * spec[hk[i]]);
    w.gen(c);
  }
  var out = { N: N, T: T, K: K, R: R, L: L, H: H, game: cfg.type, gp: p, seed: cfg.seed | 0, bid: bid, kind: batchId === 0 ? "train" : "fresh", part: part || "" };
  if (veil) { out.VR = VR; out.VL = VL; }
  return out;
}
QL.gameBatch = gameBatch;
QL.GAME_MAX_CELLS = 1.2e7;   // 局数 × 回合数的上限：再大，后台线程的内存就吃紧了

/** 在一批对局上执行规则。返回的结构与价格世界的 runBatch 相同，另加每局的得分 SC 和附带统计 AUX。 */
function runGame(B, strat, p, set, opt, model) {
  opt = opt || {};
  var w = WORLDS[B.game], gp = B.gp, N = B.N, T = B.T, K = B.K, R = B.R, L = B.L;
  var decide = strat.decide, init = strat.init, naux = (w.aux || []).length, i, n;
  var SC = new Float64Array(N), WT = new Float64Array(N), DD = new Float32Array(N), TO = new Float32Array(N), EX = new Float32Array(N), PM = new Float64Array(N), AUX = new Float64Array(N * naux);
  var grid = opt.fan ? QL.timeGrid(T, 220) : null, G = grid ? grid.length : 0, gpos = null, EQ = null;
  if (grid) { gpos = new Int32Array(T + 1).fill(-1); for (i = 0; i < G; i++) gpos[grid[i]] = i; EQ = new Float32Array(N * G); }
  var det = opt.detail != null ? { n: opt.detail, x: new Float32Array(T).fill(NaN), a: new Float32Array(T).fill(NaN), w: new Float32Array(T + 1), m: new Int8Array(T) } : null;
  var C = QL.makeView(), V = C.view, VL = B.VL || L, sc = QL.makeScratch(T), bad = 0, sum = 0, sumsq = 0, ruined = 0, cur = 0, st = null, srng = null;
  var oL = 0, prev = 0, peak = 0, mdd = 0, psum = 0, rec = false, hk = Object.keys(B.H || {}), asRet = w.act === "position";
  V.rf = 0; V.g = Object.freeze(w.consts ? w.consts(gp, T) : {}); V.x = NaN; V.last = NaN; V.lastA = NaN; V.left = NaN; V.locked = 0;
  V.rnd = function () { return srng.u(); };
  V.rnorm = function () { return srng.normal(); };
  V.rbeta = function (a, b) { var x = srng.gamma(a), y = srng.gamma(b); return x / (x + y); };
  var E = { T: T, p: gp, g: V.g, V: V, acct: C.acct, r: null, lv: null, h: {}, aux: new Float64Array(naux), score: 0, wt: NaN, turn: 0, expo: 0, dead: false, n: 0, tmp: {} };
  /** 问规则要这一回合的动作。无效的返回值（非数、NaN）记一次，并交给裁判当作"什么都不做" */
  E.ask = function (t) {
    C.at(t); var price = VL[oL + t]; V.price = price; V.logp = Math.log(price);   // 规则看到的是 VL（没有另备时就是 L）
    var a = decide(V, p, st, model);
    if (typeof a !== "number" || a !== a) { bad++; return NaN; }
    return a;
  };
  /** 记下这一回合的结果。track 是这套玩法随回合推进的那个量（累计收益、资金、剩余持仓……） */
  E.put = function (t, a, track, mark) {
    var d = asRet ? (prev > 0 ? track / prev - 1 : 0) : track - prev; psum += d; sumsq += d * d; prev = track;   // 仓位类的玩法记每步收益率，其余记增量
    if (track > peak) peak = track; else if (peak > 0) { var dd = 1 - track / peak; if (dd > mdd) mdd = dd; }
    if (EQ) { var gq = gpos[t + 1]; if (gq >= 0) EQ[cur * G + gq] = track; }
    if (rec) { det.a[t] = a; det.w[t + 1] = track; det.m[t] = mark | 0; }
  };
  /** 这一局已经结束：余下的回合里那个量不再变化。只补扇形图的网格点和明细，不必一回合一回合地走 */
  E.fill = function (t0, track, mark) {
    if (t0 >= T) return;
    E.put(t0, NaN, track, mark);
    if (EQ) for (var gi = G - 1; gi >= 0 && grid[gi] > t0 + 1; gi--) EQ[cur * G + gi] = track;
    if (rec) for (var t = t0 + 1; t < T; t++) { det.w[t + 1] = track; det.m[t] = mark | 0; }
  };
  /** 单局明细里第一栏要画的数（默认是每回合行动前看到的那个数） */
  E.dx = function (t, v) { if (rec) det.x[t] = v; };
  for (n = 0; n < N; n++) {
    cur = n; QL.bindPath(C, B, n, sc); oL = n * (T + 1);
    E.n = n; E.r = R.subarray(n * T, (n + 1) * T); E.lv = L.subarray(oL, oL + T + 1);
    for (i = 0; i < hk.length; i++) { var Hh = B.H[hk[i]], len = Hh.length / N; E.h[hk[i]] = Hh.subarray(n * len, (n + 1) * len); }
    srng = new RNG(B.seed, (B.n0 | 0) + n, -1000 - B.bid);     // 规则自己要用的随机数（s.rnd() 等）：与对局的随机数不是同一条流
    st = init ? init(p, model) : {}; if (st == null) st = {};
    V.x = NaN; V.last = NaN; V.lastA = NaN; V.left = NaN; V.locked = 0; C.acct(1, 0);
    E.score = 0; E.wt = NaN; E.turn = 0; E.expo = 0; E.dead = false; E.aux.fill(0);
    rec = !!det && det.n === n;
    var t0 = w.track0 ? w.track0(gp) : 0; prev = t0; peak = t0; mdd = 0; psum = 0;
    if (EQ) EQ[n * G] = t0;
    if (rec) { det.w[0] = t0; for (i = 0; i < T; i++) det.x[i] = L[oL + i]; }
    w.play(E);
    SC[n] = E.score; WT[n] = E.wt === E.wt ? E.wt : prev; DD[n] = w.money ? (E.dead ? 1 : mdd) : 0; TO[n] = E.turn; EX[n] = E.expo; PM[n] = psum / T; sum += psum;
    if (E.dead) ruined++;
    for (i = 0; i < naux; i++) AUX[n * naux + i] = E.aux[i];
  }
  var res = { N: N, T: T, K: K, WT: WT, DD: DD, TO: TO, EX: EX, PM: PM, SC: SC, AUX: AUX, naux: naux, sum: sum, sumsq: sumsq, bad: bad, ruined: ruined, steps: N * T, EQ: EQ, grid: grid, G: G, det: det, rec: null, touched: true, game: B.game };
  if (w.post) w.post(res, gp);
  return res;
}
QL.runGame = runGame;
/** 从一批对局里切出第 n 局（单局明细用）。n0 记着它原来的局号：规则自己的随机数按局号取流，切出来之后也要用同一条 */
QL.sliceGame = function (B, n) {
  var T = B.T, H = {}, hk = Object.keys(B.H || {});
  hk.forEach(function (k) { var len = B.H[k].length / B.N; H[k] = B.H[k].subarray(n * len, (n + 1) * len); });
  var one = { N: 1, T: T, K: B.K, R: B.R.subarray(n * T, (n + 1) * T), L: B.L.subarray(n * (T + 1), (n + 1) * (T + 1)), H: H, game: B.game, gp: B.gp, seed: B.seed, bid: B.bid, n0: n, kind: B.kind, part: B.part };
  if (B.VR) { one.VR = B.VR.subarray(n * T, (n + 1) * T); one.VL = B.VL.subarray(n * (T + 1), (n + 1) * (T + 1)); }
  return one;
};

/** 只做逐局计算的参照物（"事后诸葛亮"这一类）：calc(E) 直接读这一局的全部数据，返回得分 */
function calcRef(B, calc) {
  var w = WORLDS[B.game], N = B.N, T = B.T, SC = new Float64Array(N), hk = Object.keys(B.H || {}), E = { T: T, p: B.gp, g: w.consts ? w.consts(B.gp, T) : {}, r: null, lv: null, h: {}, tmp: {} };
  for (var n = 0; n < N; n++) {
    E.r = B.R.subarray(n * T, (n + 1) * T); E.lv = B.L.subarray(n * (T + 1), (n + 1) * (T + 1));
    for (var i = 0; i < hk.length; i++) { var Hh = B.H[hk[i]], len = Hh.length / N; E.h[hk[i]] = Hh.subarray(n * len, (n + 1) * len); }
    SC[n] = calc(E);
  }
  return SC;
}
/** 跑出这套玩法的全部参照物。fitData()：需要先学一遍的参照规则用的数据（另外一批对局）；alt(over)：换一组参数重新生成同一批对局 */
QL.gameRefs = function (B, hooks) {
  var w = WORLDS[B.game], list = w.refs ? w.refs(B.gp) : [], out = [];
  list.forEach(function (r) {
    var o = { id: r.id, name: r.name, kind: r.kind || (r.calc ? "bound" : "sim"), note: r.note || "", bench: !!r.bench, lib: r.lib || "", p: r.p || null, SC: null, res: null };
    try {
      if (r.calc) o.SC = calcRef(B, r.calc);
      else if (r.lib) {
        var S = LIB[r.lib], model = S.fit ? S.fit(hooks.fitData(), r.p || {}, QL.ml, new RNG(B.seed, -5, -5)) : undefined;
        o.res = runGame(B, S, r.p || {}, null, r.bench ? { fan: !!hooks.fan } : {}, model); o.SC = o.res.SC;
      } else if (r.alt && hooks.alt) { o.SC = hooks.alt(r.alt); o.kind = "alt"; }
    } catch (e) { o.err = String(e && e.message || e); }
    if (o.SC || o.err) out.push(o);
  });
  return out;
};
QL.gameBenchSpec = function (type, p) { var w = WORLDS[type], list = w.refs ? w.refs(p) : [], b = list.filter(function (r) { return r.bench; })[0]; return b && b.lib ? { strat: LIB[b.lib], p: b.p || {}, name: b.name } : null; };

/** 把一次运行压成这套玩法自己的口径：得分（各局的平均 ± 标准误）、附带统计、与各个参照物的配对差 */
QL.gameSummary = function (B, res, refs) {
  var w = WORLDS[B.game], p = B.gp, s = msd(res.SC), sd = w.score(p), out, k;
  out = { game: B.game, name: sd.name, kind: sd.kind || "num", digits: sd.digits == null ? 3 : sd.digits, lower: !!sd.lower, unit: sd.unit || "", score: s.m, se: s.se, sd: s.sd, N: res.N, T: res.T, aux: [], refs: [], marks: [] };
  (w.aux || []).forEach(function (a, i) {
    var col = new Float64Array(res.N); for (var n = 0; n < res.N; n++) col[n] = res.AUX[n * res.naux + i];
    var m = msd(col); out.aux.push({ name: a.name, value: m.m, kind: a.kind || "num", digits: a.digits == null ? 2 : a.digits, cond: !!a.cond, n: m.n });
  });
  (refs || []).forEach(function (r) {
    var o = { id: r.id, name: r.name, kind: r.kind, note: r.note, bench: r.bench, lib: r.lib, p: r.p };
    if (r.err) o.err = r.err;
    else if (r.SC) { var m = msd(r.SC), d = paired(res.SC, r.SC); o.score = m.m; o.se = m.se; o.d = d.m; o.dse = d.se; }
    out.refs.push(o);
  });
  var th = w.theory ? w.theory(p) : null;
  if (th && th.marks) th.marks.forEach(function (m) { out.marks.push({ id: m.id, name: m.name, value: m.value, kind: m.kind || "theory", note: m.note || "" }); });
  return out;
};

/* ================================================================== *
 *  三、十套玩法
 * ================================================================== */

/* ---------- ① 接单与冷却 ---------- */
/** 报价的分布：都把均值定成 1，这样不同分布之间的得分可以直接比 */
function offerDist(p) {
  var kind = p.dist, s, a, xm, sd;
  if (kind === "uniform") return {
    label: "均匀分布 U(0, 2)", lo: 0, hi: 2, draw: function (g) { return 2 * g.u(); },
    tail: function (c) { return c <= 0 ? 1 : c >= 2 ? 0 : (2 - c) / 2; }, epos: function (c) { return c <= 0 ? 1 - c : c >= 2 ? 0 : (2 - c) * (2 - c) / 4; }
  };
  if (kind === "lognormal") {
    s = clamp(+p.s || 1, 0.05, 3);
    return {
      label: "对数正态（σ = " + s + "）", lo: 0, hi: Math.exp(8 * s), draw: function (g) { return Math.exp(-0.5 * s * s + s * g.normal()); },
      tail: function (c) { return c <= 0 ? 1 : ncdf((-Math.log(c) - 0.5 * s * s) / s); },
      epos: function (c) { if (c <= 0) return 1 - c; var d1 = (-Math.log(c) + 0.5 * s * s) / s; return ncdf(d1) - c * ncdf(d1 - s); }
    };
  }
  if (kind === "pareto") {
    a = clamp(+p.alpha || 2.5, 1.05, 20); xm = (a - 1) / a;
    return {
      label: "帕累托（尾指数 α = " + a + "）", lo: xm, hi: xm * Math.pow(1e-12, -1 / a), draw: function (g) { return xm * Math.pow(g.u(), -1 / a); },
      tail: function (c) { return c <= xm ? 1 : Math.pow(xm / c, a); }, epos: function (c) { return c <= xm ? 1 - c : Math.pow(xm, a) * Math.pow(c, 1 - a) / (a - 1); }
    };
  }
  if (kind === "normal") {
    sd = clamp(+p.sd || 1, 0.01, 10);
    return {
      label: "正态 N(1, " + sd + "²)，可以是负数", lo: 1 - 9 * sd, hi: 1 + 9 * sd, draw: function (g) { return 1 + sd * g.normal(); },
      tail: function (c) { return 1 - ncdf((c - 1) / sd); }, epos: function (c) { var z = (c - 1) / sd; return sd * npdf(z) - (c - 1) * (1 - ncdf(z)); }
    };
  }
  return {
    label: "指数分布 Exp(1)", lo: 0, hi: 60, draw: function (g) { return g.exp(); },
    tail: function (c) { return c <= 0 ? 1 : Math.exp(-c); }, epos: function (c) { return c <= 0 ? 1 - c : Math.exp(-c); }
  };
}
/** 门槛规则的长期平均收益 ρ(c) = E[X; X ≥ c] / (1 + L·P(X ≥ c))，最优门槛 c* = L·E[(X − c*)⁺]，以及有限期的精确最优值 */
function lockTheory(p) {
  var D = offerDist(p), Lk = Math.max(0, p.L | 0), T = Math.max(1, p.T | 0), t;
  function rho(c) { var q = D.tail(c); return (D.epos(c) + c * q) / (1 + Lk * q); }
  var cs = Lk > 0 ? bisect(function (c) { return c - Lk * D.epos(c); }, 0, D.hi) : 0;
  var V = new Float64Array(T + Lk + 2), c0 = 0;
  for (t = T - 1; t >= 0; t--) { var ct = V[t + 1] - V[t + Lk + 1]; V[t] = V[t + 1] + D.epos(ct); if (t === 0) c0 = ct; }
  return { dist: D, cStar: cs, rhoStar: rho(cs), rho: rho, any: Math.ceil(T / (Lk + 1)) / T, dp: V[0] / T, c0: c0 };
}
QL.lockTheory = lockTheory;

LIB.lock_any = {
  head: "见单就接：只要没被锁住，来什么接什么。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 1;                                   // 1 = 接，0 = 不接；被锁住的回合返回什么都不算数
  }
};
LIB.lock_thr = {
  head: "固定门槛：报价不低于 c 才接。",
  decide: function decide(s, p) {
    return s.x >= p.c ? 1 : 0;                  // s.x 是这一回合摆在面前的报价
  }
};
LIB.lock_dp = {
  head: "有限期的动态规划：先从另一批对局里把报价的分布估出来，再从最后一回合往前倒推每一回合的门槛。",
  fit: function fit(D, p, ml, rng) {
    // 1) 经验分布：把见过的报价排好序、做后缀和，E[(X − c)⁺] 就能用一次二分查找算出来
    var xs = [], n, t, stride = Math.max(1, Math.floor(D.N * D.T / 20000));
    for (n = 0; n < D.N; n++) for (t = n % stride; t < D.T; t += stride) xs.push(D.next(n, t));
    xs.sort(function (a, b) { return a - b; });
    var m = xs.length, suf = new Float64Array(m + 1);
    for (t = m - 1; t >= 0; t--) suf[t] = suf[t + 1] + xs[t];
    function epos(c) {                          // (1/m)·Σ max(x_i − c, 0)
      var lo = 0, hi = m;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (xs[mid] < c) lo = mid + 1; else hi = mid; }
      return (suf[lo] - c * (m - lo)) / m;
    }
    // 2) 倒推。V[t]：第 t 回合开始时没被锁，从这里到终局还能拿到的期望总收益
    //    接：x + V[t + L + 1]；不接：V[t + 1]。所以门槛是 c[t] = V[t + 1] − V[t + L + 1]
    var T = D.g.T, L = D.g.L, V = new Float64Array(T + L + 2), c = new Float64Array(T);
    for (t = T - 1; t >= 0; t--) { c[t] = V[t + 1] - V[t + L + 1]; V[t] = V[t + 1] + epos(c[t]); }
    return { c: c, note: "倒推出的门槛：开局 " + c[0].toFixed(3) + "，最后一回合 " + c[T - 1].toFixed(3) + "。按估出来的分布，期望每回合收益 " + (V[0] / T).toFixed(4) + "。" };
  },
  decide: function decide(s, p, st, model) {
    return s.x >= model.c[s.t] ? 1 : 0;
  }
};
LIB.lock_sa = {
  head: "边做边学的门槛（随机逼近）：不知道报价的分布，每看到一个报价，就把门槛朝方程 c = L·E[(X − c)⁺] 的解挪一小步。",
  init: function init(p) {
    return { c: p.c0, n: 0 };                   // 每局各自从 c0 学起
  },
  decide: function decide(s, p, st) {
    var take = s.x >= st.c ? 1 : 0;             // 先用眼下的门槛做决定
    st.n++;                                     // 再用这个报价修正门槛：Robbins–Monro 迭代，步长 a/(n + b)
    st.c += p.a / (st.n + p.b) * (s.g.L * Math.max(s.x - st.c, 0) - st.c);
    return take;
  }
};
/** 事后诸葛亮：提前知道整局的报价，间隔约束下能拿到的最大总收益 */
function lockProphet(E) {
  var T = E.T, Lk = E.g.L, x = E.r, H = E.tmp.H || (E.tmp.H = new Float64Array(T + Lk + 2)), t;
  for (t = T - 1; t >= 0; t--) { var take = x[t] + H[t + Lk + 1]; H[t] = take > H[t + 1] ? take : H[t + 1]; }
  return H[0] / T;
}

WORLDS.g_lock = {
  ideas: ['门槛随着剩余回合数下降：越到后面越不挑', '不知道分布：先观察 100 回合，取见过的报价的某个分位数当门槛', '刚被锁完的时候更挑一点，空等久了就降低门槛'],
  mk: { 1: "接下的单", 2: "被锁住的回合" },
  name: "① 接单与冷却", short: "接单与冷却", group: GROUP, game: true, no: 1, unit: "回合",
  blurb: "每回合来一个报价，接了就拿到它，但接下来的 L 回合不能再接。接得太勤，好单来的时候正被锁着；太挑，又白白空等。",
  params: [
    num("T", "一局多少回合", 2000, 100, 4000, 50),
    num("L", "接一单后锁几回合", 15, 0, 100, 1),
    sel("dist", "报价服从的分布（均值都是 1）", "exp", [["exp", "指数分布"], ["uniform", "均匀分布 U(0, 2)"], ["lognormal", "对数正态"], ["pareto", "帕累托（厚尾）"], ["normal", "正态（可以是负数）"]]),
    num("s", "对数正态的 σ", 1, 0.2, 2, 0.05, { show: function (p) { return p.dist === "lognormal"; } }),
    num("alpha", "帕累托的尾指数 α", 2.5, 1.2, 6, 0.1, { show: function (p) { return p.dist === "pareto"; }, hint: "α 越小尾越厚；α ≤ 2 时方差不存在" }),
    num("sd", "正态的标准差", 1, 0.1, 3, 0.05, { show: function (p) { return p.dist === "normal"; } })
  ],
  defaults: { N: 400, T: 2000, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 10, 20000); },
  consts: function (p, T) { return { T: T, L: Math.max(0, p.L | 0) }; },
  score: function () { return { name: "平均每回合收益", digits: 4 }; },
  track: { name: "累计收益" }, obs: { name: "报价", draw: "bars" }, action: { name: "接单", kind: "flag" },
  aux: [{ name: "一局接了几单", digits: 1 }, { name: "平均每单的大小", digits: 2 }],
  defStrat: "lock_thr",
  ranges: function (p) { var th = lockTheory(p); return { "lock_thr.c": [Math.min(0, th.dist.lo < -50 ? -2 : 0), Math.max(4, Math.ceil(2.5 * th.cStar)), +th.cStar.toFixed(2)] }; },
  gen: function (c) {
    var D = c.D || (c.D = offerDist(c.p)), r = c.r, lv = c.lv, T = c.T, g = c.rng;
    for (var t = 0; t < T; t++) { var x = D.draw(g); r[t] = x; lv[t] = x; }
    lv[T] = r[T - 1];
  },
  play: function (E) {
    var T = E.T, Lk = E.g.L, x = E.r, V = E.V, tot = 0, free = 0, cnt = 0, t, a, m;
    for (t = 0; t < T; t++) {
      V.x = x[t]; V.locked = t < free ? free - t : 0;
      a = E.ask(t); m = 0;
      if (t < free) m = 2;
      else if (a >= 0.5) { tot += x[t]; free = t + 1 + Lk; cnt++; m = 1; V.last = x[t]; }
      E.put(t, m === 1 ? 1 : 0, tot, m);
    }
    E.score = tot / T; E.aux[0] = cnt; E.aux[1] = cnt ? tot / cnt : NaN;
  },
  theory: function (p) {
    var th = lockTheory(p);
    return {
      cStar: th.cStar, rhoStar: th.rhoStar, dp: th.dp, any: th.any, c0: th.c0, label: th.dist.label,
      marks: [
        { id: "thr", name: "固定门槛 c* = " + th.cStar.toFixed(3) + " 的长期平均", value: th.rhoStar },
        { id: "dp", name: "知道分布时的最优（动态规划）", value: th.dp, kind: "optimum" }
      ],
      curves: { "lock_thr.c": { f: th.rho, name: "理论 ρ(c)（长期平均）" } }
    };
  },
  refs: function (p) {
    var th = lockTheory(p);
    return [
      { id: "any", name: "见单就接", lib: "lock_any", p: {}, bench: true },
      { id: "thr", name: "固定门槛 c* = " + th.cStar.toFixed(2), lib: "lock_thr", p: { c: th.cStar } },
      { id: "dp", name: "动态规划（分布从数据里估）", lib: "lock_dp", p: {} },
      { id: "prophet", name: "事后诸葛亮（提前知道全部报价）", calc: lockProphet, kind: "bound" }
    ];
  },
  scenes: [
    { name: "指数分布", p: { dist: "exp" } }, { name: "均匀分布", p: { dist: "uniform" } }, { name: "对数正态 σ=1", p: { dist: "lognormal", s: 1 } },
    { name: "帕累托 α=2.5", p: { dist: "pareto", alpha: 2.5 } }, { name: "正态（可为负）", p: { dist: "normal", sd: 1 } },
    { name: "锁 5 回合", p: { L: 5 } }, { name: "锁 50 回合", p: { L: 50 } }
  ],
  api: [
    "动作：返回 1（或任何 ≥ 0.5 的数）= 接下这一单，返回 0 = 放过。",
    "s.x          这一回合的报价（行动之前就看得到）",
    "s.locked     还要被锁几回合；大于 0 时返回什么都不算数（但 decide 照样每回合被调用，所以可以一直观察报价）",
    "s.g.L  s.g.T 接一单后锁几回合、一局多少回合",
    "s.ret(k)     k+1 回合之前的报价；s.rets(n)、s.mean(n)、s.vol(n) 是最近 n 个已经过去的报价组成的数组、均值、标准差",
    "s.last       上一次接下的那一单的金额"
  ].join("\n")
};

/* ---------- ② 秘书问题 ---------- */
/** 先看 m 个人、之后遇到"目前最好的"就要：选中全场最好者的概率 P(m) = (m/n)·Σ_{j=m}^{n−1} 1/j，P(0) = 1/n */
function secClassic(n) {
  var P = new Float64Array(n), m, s = 0;
  for (m = n - 1; m >= 1; m--) { s += 1 / m; P[m] = m / n * s; }
  P[0] = 1 / n;
  var best = 0; for (m = 1; m < n; m++) if (P[m] > P[best]) best = m;
  return { P: P, m: best, value: P[best] };
}
/** 只看得到相对名次、目标是期望名次最小时的最优规则（Chow–Moriguti–Robbins–Samuels 1964）。
 *  c[i]：放过第 i 个人之后按最优规则继续，最终名次的期望；thr[i]：第 i 个人的相对名次不超过它就要 */
function secRankDP(n) {
  var c = new Float64Array(n + 1), thr = new Int32Array(n + 1), i;
  c[n] = Infinity;
  for (i = n; i >= 1; i--) {
    var forced = c[i] === Infinity, s = forced ? i : Math.min(i, Math.floor(c[i] * (i + 1) / (n + 1)));
    thr[i] = s;
    c[i - 1] = ((n + 1) / (i + 1) * s * (s + 1) / 2 + (forced ? 0 : (i - s) * c[i])) / i;
  }
  return { c: c, thr: thr, value: c[0] };
}
QL.secClassic = secClassic; QL.secRankDP = secRankDP;

LIB.sec_first = {
  head: "第一个就要：不观察，不比较。选中最好者的概率正好是 1/n，它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 1;                                   // 1 = 就要这个人，0 = 放过（放过了不能回头）
  }
};
LIB.sec_cut = {
  head: "先看后选：前 m 个人只看不选，之后遇到第一个\"比之前所有人都好\"的就要。",
  decide: function decide(s, p) {
    if (s.t < p.m) return 0;                    // 观察期（s.t 从 0 数起）
    return s.rank === 1 ? 1 : 0;                // s.rank：这个人在已经见过的人里排第几，1 = 目前最好
  }
};
LIB.sec_gm = {
  head: "分数门槛（Gilbert–Mosteller）：知道分数服从 U(0,1) 时，目标是选中最好的那个人的最优规则。",
  fit: function fit(D, p, ml, rng) {
    // b[m]：身后还剩 m 个人时的门槛，是方程 Σ_{j=1..m} (b^(−j) − 1)/j = 1 的解（左边随 b 递减，二分法）
    var n = D.g.n, b = new Float64Array(n), m, j;
    for (m = 1; m < n; m++) {
      var lo = 0.4, hi = 1;
      for (var it = 0; it < 50; it++) {
        var mid = (lo + hi) / 2, sum = 0, pw = 1;
        for (j = 1; j <= m && sum <= 1; j++) { pw /= mid; sum += (pw - 1) / j; }
        if (sum > 1) lo = mid; else hi = mid;
      }
      b[m] = (lo + hi) / 2;
    }
    return { b: b, note: "门槛：身后还剩 1 人时 " + (n > 1 ? b[1].toFixed(3) : "—") + "，剩 10 人时 " + (n > 10 ? b[10].toFixed(3) : "—") + "，开局时 " + b[n - 1].toFixed(4) + "。" };
  },
  decide: function decide(s, p, st, model) {
    if (s.rank !== 1) return 0;                 // 不是目前最好的，要了也赢不了
    return s.x >= model.b[s.left] ? 1 : 0;      // s.left：身后还剩几个人
  }
};
LIB.sec_rank = {
  head: "名次门槛表：只看得到相对名次、目标是\"名次越靠前越好\"时的最优规则。越往后，可以接受的相对名次越宽。",
  fit: function fit(D, p, ml, rng) {
    // c[i]：放过第 i 个人之后按最优规则继续，最终名次的期望。第 i 个人相对名次是 j 时，他的最终名次期望为 j(n + 1)/(i + 1)
    var n = D.g.n, c = new Float64Array(n + 1), thr = new Int32Array(n + 1), i;
    c[n] = Infinity;                            // 最后一个人没得挑
    for (i = n; i >= 1; i--) {
      var forced = c[i] === Infinity;
      var s = forced ? i : Math.min(i, Math.floor(c[i] * (i + 1) / (n + 1)));   // 相对名次 ≤ s 就要
      thr[i] = s;
      c[i - 1] = ((n + 1) / (i + 1) * s * (s + 1) / 2 + (forced ? 0 : (i - s) * c[i])) / i;
    }
    return { thr: thr, note: "按这张表，最终名次的期望是 " + c[0].toFixed(3) + "（1 = 全场最好）。" };
  },
  decide: function decide(s, p, st, model) {
    return s.rank <= model.thr[s.t + 1] ? 1 : 0;   // 现在是第 s.t + 1 个人
  }
};
LIB.sec_mem = {
  head: "只看分数的门槛：分数不低于 1 − c/(身后人数 + c) 就要。不记历史，只看眼前这个人的分数和还剩多少人。",
  decide: function decide(s, p) {
    return s.x >= 1 - p.c / (s.left + p.c) ? 1 : 0;
  }
};

WORLDS.g_sec = {
  ideas: ['先看 √n 个人，之后只要是见过的人里的前两名就要', '门槛随位置变：前三分之一不选，中间只要第一名，最后三分之一前三名都要'],
  mk: { 1: "选定的人", 3: "已经选完" },
  name: "② 秘书问题", short: "秘书问题", group: GROUP, game: true, no: 2, unit: "人",
  blurb: "n 个候选人依次到场。每来一个，必须当场决定要不要；放过了不能回头，要了就结束。整局只能选一个人。",
  params: [
    num("n", "候选人数 n", 100, 5, 1000, 1),
    sel("goal", "目标", "best", [["best", "选中全场最好的才算赢"], ["rank", "名次越靠前越好"]], { descs: { best: "选中全场最好的那个人得 1 分，否则 0 分。", rank: "选中的人是全场第 1 名得 1 分，最后一名得 0 分，中间按名次均匀递减。" } }),
    sel("info", "你看得到什么", "rank", [["rank", "只能和见过的人比"], ["full", "看得到分数，且知道分布"]], { descs: { rank: "你只知道眼前这个人在见过的人里排第几。分数本身裁判不给：单局明细里画出来的分数是给你看的，规则读不到。", full: "分数独立地服从 U(0,1)，你也知道这一点：一个 0.99 分的人出现在开头，你就知道他很可能是最好的。" } })
  ],
  defaults: { N: 2000, T: 100, K: 1 },
  Tof: function (p) { return clamp(p.n | 0, 2, 5000); },
  hidden: function (p, T) { return { rel: T, abs: T }; },
  veil: function (p) { return p.info !== "full"; },   // 只能和见过的人比：分数不交给规则，规则读到的是相对名次
  consts: function (p, T) { return { n: T, T: T, goal: p.goal, info: p.info }; },
  score: function (p) { return p.goal === "rank" ? { name: "名次得分（全场最好 = 1，最差 = 0）", digits: 4 } : { name: "选中全场最好者的概率", kind: "prob", digits: 1 }; },
  track: { name: "已经定下来的得分" }, obs: { name: "候选人的分数" }, action: { name: "选定", kind: "flag" },
  aux: [{ name: "平均在第几个人停下", digits: 1 }, { name: "选中者的平均名次", digits: 2 }, { name: "拖到最后一个人的比例", kind: "prob", digits: 1 }],
  defStrat: "sec_cut",
  ranges: function (p) { var n = clamp(p.n | 0, 2, 5000); return { "sec_cut.m": [0, n - 1, secClassic(n).m] }; },
  gen: function (c) {
    var T = c.T, r = c.r, lv = c.lv, g = c.rng, full = c.p.info === "full", t, i;
    var loc = full ? 0 : 50 * g.normal(), sc = full ? 1 : Math.exp(g.normal());   // 分布未知：每一局的位置和尺度都不一样
    for (t = 0; t < T; t++) { var v = full ? g.u() : loc + sc * g.normal(); r[t] = v; lv[t] = v; }
    lv[T] = r[T - 1];
    var idx = c.idx && c.idx.length === T ? c.idx : (c.idx = new Int32Array(T)), bit = c.bit && c.bit.length === T + 1 ? c.bit : (c.bit = new Int32Array(T + 1)), abs = c.h.abs, rel = c.h.rel;
    for (t = 0; t < T; t++) idx[t] = t;
    idx.sort(function (a, b) { return r[b] - r[a]; });
    for (t = 0; t < T; t++) abs[idx[t]] = t + 1;                                    // 绝对名次，1 = 全场最好
    bit.fill(0);                                                                   // 相对名次：到场时见过的人里比他好的个数 + 1（树状数组）
    for (t = 0; t < T; t++) { var a = abs[t], s = 0; for (i = a - 1; i > 0; i -= i & -i) s += bit[i]; rel[t] = s + 1; for (i = a; i <= T; i += i & -i) bit[i]++; }
    if (c.vr) { for (t = 0; t < T; t++) { c.vr[t] = rel[t]; c.vl[t] = rel[t]; } c.vl[T] = rel[T - 1]; }   // 规则读得到的：每个人到场时的相对名次，仅此而已
  },
  play: function (E) {
    var T = E.T, V = E.V, v = E.r, rel = E.h.rel, abs = E.h.abs, best = E.p.goal !== "rank", full = E.p.info === "full", t, a, pick = T - 1;
    for (t = 0; t < T; t++) {
      V.x = full ? v[t] : NaN; V.rank = rel[t]; V.left = T - 1 - t;   // 分数只在"看得到分数"时给
      a = E.ask(t);
      if (a >= 0.5 || t === T - 1) { pick = t; break; }
      E.put(t, 0, 0, 0);
    }
    var ar = abs[pick], sc = best ? (ar === 1 ? 1 : 0) : (T > 1 ? (T - ar) / (T - 1) : 1);
    E.put(pick, 1, sc, 1); E.fill(pick + 1, sc, 3);
    E.score = sc; E.aux[0] = pick + 1; E.aux[1] = ar; E.aux[2] = pick === T - 1 ? 1 : 0;
  },
  theory: function (p) {
    var n = clamp(p.n | 0, 2, 5000), cl = secClassic(n), rk = secRankDP(n), marks = [], curves = {};
    var toScore = function (rank) { return n > 1 ? (n - rank) / (n - 1) : 1; };
    if (p.goal === "rank") {
      marks.push({ id: "rank", name: "只看名次时的最优（名次门槛表，期望名次 " + rk.value.toFixed(3) + "）", value: toScore(rk.value), kind: p.info === "full" ? "theory" : "optimum" });
    } else {
      marks.push({ id: "cut", name: "先看 " + cl.m + " 人再选", value: cl.value, kind: p.info === "full" ? "theory" : "optimum" });
      if (p.info === "full") marks.push({ id: "gm", name: "看得到分数时的最优，n → ∞ 的极限", value: 0.580164, kind: "theory" });
      curves["sec_cut.m"] = { f: function (m) { m = Math.round(m); return m >= 0 && m < n ? cl.P[m] : NaN; }, name: "理论 P(m)" };
    }
    return { n: n, mStar: cl.m, pStar: cl.value, rankStar: rk.value, marks: marks, curves: curves };
  },
  refs: function (p) {
    var n = clamp(p.n | 0, 2, 5000), cl = secClassic(n), L = [{ id: "first", name: "第一个就要", lib: "sec_first", p: {}, bench: true }, { id: "cut", name: "先看 " + cl.m + " 人再选", lib: "sec_cut", p: { m: cl.m } }];
    if (p.goal === "rank") L.push({ id: "rank", name: "名次门槛表", lib: "sec_rank", p: {} });
    if (p.info === "full") L.push(p.goal === "rank" ? { id: "mem", name: "只看分数的门槛（c = 2）", lib: "sec_mem", p: { c: 2 } } : { id: "gm", name: "分数门槛（Gilbert–Mosteller）", lib: "sec_gm", p: {} });
    return L;
  },
  scenes: [
    { name: "选最好 · 只看名次", p: { goal: "best", info: "rank" } }, { name: "选最好 · 看得到分数", p: { goal: "best", info: "full" } },
    { name: "名次 · 只看名次", p: { goal: "rank", info: "rank" } }, { name: "名次 · 看得到分数", p: { goal: "rank", info: "full" } },
    { name: "只有 10 人", p: { n: 10 } }, { name: "1000 人", p: { n: 1000 } }
  ],
  api: [
    "动作：返回 1（≥ 0.5）= 就要眼前这个人，整局结束；返回 0 = 放过，不能回头。走到最后一个人时不管返回什么都只能要他。",
    "s.rank       这个人在已经见过的人（包括他自己）里排第几：1 = 目前最好",
    "s.x          眼前这个人的分数。只在\"看得到分数\"时有；\"只能和见过的人比\"时是 NaN，裁判不把分数交给规则",
    "s.left       身后还剩几个人；s.t 是已经放过的人数；s.g.n 是总人数",
    "s.g.goal     \"best\"（选中全场最好才得分）或 \"rank\"（名次越靠前分越高）；s.g.info 是 \"rank\" 或 \"full\"",
    "s.ret(k)     k+1 个人之前那个人：\"看得到分数\"时是他的分数，否则是他到场时的相对名次"
  ].join("\n")
};

/* ---------- ③ 偏硬币下注 ---------- */
var COIN_MIN = 0.01;   // 最小押注：1 美分
function coinTheory(p) {
  var q = clamp(+p.p, 0.01, 0.99), f = Math.max(0, 2 * q - 1), g = f < 1 ? q * Math.log(1 + f) + (1 - q) * Math.log(1 - f) : -Infinity, T = p.T | 0;
  return { f: f, g: g, median: p.start * Math.exp(g * T), mean: p.start * Math.pow(1 + f * f, T) };
}
QL.coinTheory = coinTheory;

LIB.coin_none = {
  head: "一分不押：把本金原样带走。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 0;
  }
};
LIB.coin_frac = {
  head: "固定比例：每一次都押上手头资金的 f 倍。f = 2p − 1 就是 Kelly 比例。",
  decide: function decide(s, p) {
    return p.f;                                 // 正数押正面，负数押反面；绝对值是押上的资金比例
  }
};
LIB.coin_dp = {
  head: "动态规划：直接把\"期望到手的钱\"当目标，把封顶和剩余次数都算进去，倒推每个时刻、每个资金水平下该押多少。",
  fit: function fit(D, p, ml, rng) {
    var g = D.g, T = g.T, q = g.p, n = Math.max(10, p.grid | 0), t, w, b;
    if (!(g.cap > 0)) return { all: true, note: "不封顶时，期望终值最大的做法是每次全押：期望是 本金 × (2p)^T，但几乎必然输光。" };
    var step = g.cap / n;                       // 把 0 到封顶的资金分成 n 格
    // V[w]：手里有 w 格、还剩若干次时，最优打法的期望终值（以格为单位）。押完最后一次，V[w] = w
    var V = new Float64Array(n + 1), W = new Float64Array(n + 1), bet = new Int16Array(T * (n + 1));
    for (w = 0; w <= n; w++) V[w] = w;
    for (t = T - 1; t >= 0; t--) {
      for (w = 0; w <= n; w++) {
        var best = V[w], bb = 0;
        for (b = 1; b <= w; b++) {
          var up = w + b > n ? n : w + b, v = q * V[up] + (1 - q) * V[w - b];
          if (v > best + 1e-12) { best = v; bb = b; }   // 一样好的时候取小的那一注
        }
        W[w] = best; bet[t * (n + 1) + w] = bb;
      }
      var tmp = V; V = W; W = tmp;
    }
    var w0 = Math.round(g.start / step);
    return { bet: bet, n: n, step: step, note: "按每格 " + step.toFixed(2) + " 美元倒推：期望到手 " + (V[w0] * step).toFixed(2) + " 美元；第一次该押 " + (bet[w0] * step).toFixed(2) + " 美元（Kelly 会押 " + (g.start * Math.max(0, 2 * q - 1)).toFixed(2) + "）。" };
  },
  decide: function decide(s, p, st, model) {
    if (model.all) return 1;
    var w = Math.round(s.wealth / model.step);
    if (w <= 0) return 0;
    if (w > model.n) w = model.n;
    return model.bet[s.t * (model.n + 1) + w] * model.step / s.wealth;
  }
};
LIB.coin_mart = {
  head: "输了加倍：从一个小注开始，输一次就把注码翻倍，赢一次就回到起始注码。",
  init: function init(p) {
    return { stake: p.base };
  },
  decide: function decide(s, p, st) {
    if (s.t > 0) st.stake = s.last < 0 ? st.stake * 2 : p.base;   // s.last：上一次赢了多少钱，输了是负数
    return Math.min(1, st.stake / s.wealth);                       // 钱不够翻倍时只能全押
  }
};
LIB.coin_streak = {
  head: "\"该出反面了\"：平时按固定比例押正面，连出 k 次正面之后改押反面。实验里三分之二的人这么干过。",
  decide: function decide(s, p) {
    var k = Math.round(p.k), run = s.t >= k, i;
    for (i = 0; run && i < k; i++) if (!(s.ret(i) > 0)) run = false;   // s.ret(i)：i+1 次之前的结果，+1 正面，−1 反面
    return run ? -p.f : p.f;
  }
};

WORLDS.g_coin = {
  ideas: ['按 Kelly 的一半押，离封顶近的时候只押够到封顶的数', '不知道硬币偏多少：先小注试 30 次估计概率，再按估出来的 Kelly 比例押'],
  mk: { 3: "已封顶或输光" },
  name: "③ 偏硬币下注", short: "偏硬币下注", group: GROUP, game: true, no: 3, unit: "次", money: true,
  blurb: "一枚正面概率 60% 的硬币，25 美元本金，每次自己定押多少、押哪面，押中赢得同样多的钱。最多带走 250 美元。",
  params: [
    num("p", "正面的概率 p", 0.6, 0.5, 0.9, 0.01),
    num("start", "本金（美元）", 25, 5, 200, 5),
    num("T", "一共押多少次", 300, 10, 1000, 10),
    num("cap", "最多带走多少（0 = 不封顶）", 250, 0, 5000, 50)
  ],
  defaults: { N: 2000, T: 300, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 1, 5000); },
  consts: function (p, T) { return { T: T, p: +p.p, start: +p.start, cap: +p.cap, min: COIN_MIN }; },
  score: function () { return { name: "平均到手金额", kind: "usd", digits: 2 }; },
  track: { name: "资金（美元）" }, track0: function (p) { return +p.start; }, obs: { name: "正面比反面多出的次数" }, action: { name: "押上的比例（负 = 押反面）", kind: "level" },
  aux: [{ name: "输光的局数比例", kind: "prob", digits: 1 }, { name: "封顶的局数比例", kind: "prob", digits: 1 }, { name: "押过反面的局数比例", kind: "prob", digits: 1 }],
  defStrat: "coin_frac",
  gen: function (c) {
    var T = c.T, r = c.r, lv = c.lv, g = c.rng, q = +c.p.p, x = 0;
    lv[0] = 0;
    for (var t = 0; t < T; t++) { var h = g.u() < q ? 1 : -1; r[t] = h; x += h; lv[t + 1] = x; }
  },
  play: function (E) {
    var T = E.T, V = E.V, r = E.r, cap = E.g.cap, W = E.g.start, t, a, f, tails = 0, done = false;
    for (t = 0; t < T && !done; t++) {
      E.acct(W);
      a = E.ask(t); f = a === a ? clamp(a, -1, 1) : 0;
      var stake = Math.abs(f) * W, pnl = 0;
      if (stake >= COIN_MIN) { pnl = (f > 0) === (r[t] > 0) ? stake : -stake; if (f < 0) tails = 1; }
      W += pnl; V.last = pnl; V.lastA = f;
      if (cap > 0 && W >= cap) { W = cap; done = true; }
      if (W < COIN_MIN) { W = 0; done = true; }
      E.put(t, f, W, done ? 3 : 0);
    }
    E.fill(t, W, 3);
    E.score = W; E.wt = W / E.g.start; E.dead = W <= 0;
    E.aux[0] = W <= 0 ? 1 : 0; E.aux[1] = cap > 0 && W >= cap ? 1 : 0; E.aux[2] = tails;
  },
  theory: function (p) {
    var th = coinTheory(p), marks = [];
    if (+p.p === 0.6 && +p.start === 25 && +p.cap === 250 && (p.T | 0) === 300) marks.push({ id: "human", name: "实验里 61 名受试者的平均（Haghani–Dewey 2016）", value: 91, kind: "human" });
    return { f: th.f, g: th.g, median: th.median, mean: th.mean, marks: marks, curves: {} };
  },
  refs: function (p) {
    var th = coinTheory(p), L = [{ id: "none", name: "一分不押", lib: "coin_none", p: {}, bench: true }, { id: "kelly", name: "固定押 " + (th.f * 100).toFixed(0) + "%（Kelly）", lib: "coin_frac", p: { f: th.f } }, { id: "all", name: "每次全押", lib: "coin_frac", p: { f: 1 } }];
    if (+p.cap > 0) L.push({ id: "dp", name: "动态规划（直接最大化期望到手金额）", lib: "coin_dp", p: { grid: 250 } });
    return L;
  },
  scenes: [
    { name: "实验原样（封顶 250）", p: { p: 0.6, start: 25, T: 300, cap: 250 } }, { name: "不封顶", p: { cap: 0 } }, { name: "只押 30 次", p: { T: 30 } },
    { name: "正面 55%", p: { p: 0.55 } }, { name: "正面 75%", p: { p: 0.75 } }
  ],
  api: [
    "动作：返回押上的资金比例，范围 [−1, 1]（超出的按 ±1 算）。正数押正面，负数押反面，0 不押：不押的那一次硬币照样抛、结果照样公布，机会也照样少一次。押中赢得与赌注相同的钱，押错输掉赌注。",
    "s.wealth     手头的资金（美元）；s.g.start 是本金，s.g.cap 是封顶金额（0 = 不封顶），s.g.p 是正面的概率",
    "s.last       上一次赢了多少钱（输了是负数）；s.lastA 是上一次押的比例",
    "s.ret(k)     k+1 次之前的结果：+1 正面，−1 反面；s.mean(n) 是最近 n 次结果的平均",
    "不足 1 美分的赌注不算数。资金到了封顶金额，或者不足 1 美分，这一局就结束。"
  ].join("\n")
};

/* ---------- ④ 翻倍或出局 ---------- */
/** 大胆下注（每次押"够得着目标的最大数额"）到达目标的概率：Q(x) = p·Q(2x)（x ≤ ½），Q(x) = p + (1 − p)·Q(2x − 1)（x ≥ ½） */
function boldQ(x, p) {
  var q = 0, w = 1;
  for (var i = 0; i < 200 && w > 1e-17; i++) {
    if (x <= 0) return q;
    if (x >= 1) return q + w;
    if (x <= 0.5) { w *= p; x = 2 * x; } else { q += w * p; w *= 1 - p; x = 2 * x - 1; }
  }
  return q + w * x;
}
/** 每次押固定的一小注 s（都以目标为单位）：经典的赌徒破产公式。
 *  资金是注码的 i = x0/s 倍、目标是 n = 1/s 倍。注码能把起始资金和目标都整除时公式是精确的；
 *  除不尽时最后一把押不满，这里不把 i、n 取整，直接代进去：默认设定下差不到 1 个百分点（胜率离 ½ 越远差得越多），而且曲线是光滑、单调的。 */
function timidQ(x0, s, p) {
  var i = x0 / s, n = 1 / s, r = (1 - p) / p;
  if (Math.abs(r - 1) < 1e-12) return x0;
  if (r > 1) return (Math.pow(r, i - n) - Math.pow(r, -n)) / (1 - Math.pow(r, -n));   // 上下同除以 r^n，避免溢出
  return (1 - Math.pow(r, i)) / (1 - Math.pow(r, n));
}
QL.boldQ = boldQ; QL.timidQ = timidQ;

LIB.bold_timid = {
  head: "小注慢磨：每一把都押固定的一小注。",
  decide: function decide(s, p) {
    return p.stake / s.wealth;                  // 返回的是押上的资金比例；s.wealth 是手头资金占目标的比例
  }
};
LIB.bold_all = {
  head: "大胆下注：每一把都押上\"刚好够到目标\"的数额，够不着就全押。",
  decide: function decide(s, p) {
    return 1;                                   // 裁判不会让你押得比"够到目标所需"更多，所以这里写全押就行
  }
};
LIB.bold_frac = {
  head: "固定比例：每一把押上手头资金的 f 倍。",
  decide: function decide(s, p) {
    return p.f;
  }
};

WORLDS.g_bold = {
  ideas: ['先小注试几把，输到只剩一半就全押', '每把押\"离目标的距离\"的一半'],
  mk: { 3: "已分出结果" },
  name: "④ 翻倍或出局", short: "翻倍或出局", group: GROUP, game: true, no: 4, unit: "把",
  blurb: "一个对你不利的赌局（比如轮盘押红黑，胜率 18/38），你要把手里的钱变成目标金额。每一把押多少由你定，到了目标或者输光就结束。",
  params: [
    num("p", "每一把的胜率 p", 0.4737, 0.05, 0.95, 0.0001, { hint: "轮盘押红黑是 18/38 ≈ 0.4737；0.5 是公平赌局" }),
    num("x0", "起始资金占目标的比例", 0.5, 0.02, 0.98, 0.01, { hint: "0.5 就是\"把钱翻一倍\"" }),
    num("T", "最多押多少把", 500, 10, 4000, 10)
  ],
  defaults: { N: 4000, T: 500, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 1, 20000); },
  consts: function (p, T) { return { T: T, p: +p.p, x0: +p.x0 }; },
  score: function () { return { name: "到达目标的概率", kind: "prob", digits: 1 }; },
  track: { name: "资金（目标 = 1）" }, track0: function (p) { return +p.x0; }, obs: { name: "赢的比输的多出的把数" }, action: { name: "押上的比例", kind: "level" },
  aux: [{ name: "平均押了几把", digits: 1 }, { name: "到时间还没分出结果的比例", kind: "prob", digits: 1 }],
  defStrat: "bold_all",
  gen: function (c) {
    var T = c.T, r = c.r, lv = c.lv, g = c.rng, q = +c.p.p, x = 0;
    lv[0] = 0;
    for (var t = 0; t < T; t++) { var h = g.u() < q ? 1 : -1; r[t] = h; x += h; lv[t + 1] = x; }
  },
  play: function (E) {
    var T = E.T, V = E.V, r = E.r, x = E.g.x0, t, a, f, used = 0, done = false;
    for (t = 0; t < T && !done; t++) {
      E.acct(x);
      a = E.ask(t); f = a === a ? clamp(a, 0, 1) : 0;
      var stake = Math.min(f * x, 1 - x), pnl = 0;
      if (stake > 1e-12) { pnl = r[t] > 0 ? stake : -stake; used++; }
      x += pnl; V.last = pnl; V.lastA = f;
      if (x >= 1 - 1e-9) { x = 1; done = true; } else if (x <= 1e-9) { x = 0; done = true; }
      E.put(t, f, x, done ? 3 : 0);
    }
    E.fill(t, x, 3);
    E.score = x >= 1 ? 1 : 0; E.wt = x / E.g.x0; E.aux[0] = used; E.aux[1] = x > 0 && x < 1 ? 1 : 0;
  },
  theory: function (p) {
    var q = +p.p, x0 = +p.x0, bold = boldQ(x0, q), marks = [{ id: "bold", name: "大胆下注（不限把数）", value: bold, kind: q <= 0.5 ? "optimum" : "theory" }];
    marks.push({ id: "timid", name: "每把押目标的 1%（不限把数）", value: timidQ(x0, 0.01, q) });
    if (Math.abs(q - 0.5) < 1e-9) marks.push({ id: "fair", name: "公平赌局：任何打法都不超过 x₀（来得及分出胜负时恰好等于它）", value: x0, kind: "bound" });
    return { bold: bold, timid: timidQ(x0, 0.01, q), marks: marks, curves: { "bold_timid.stake": { f: function (s) { return s > 0 ? timidQ(x0, s, q) : NaN; }, name: "赌徒破产公式（不限把数）" } } };
  },
  refs: function (p) {
    return [
      { id: "timid", name: "每把押目标的 1%", lib: "bold_timid", p: { stake: 0.01 }, bench: true },
      { id: "half", name: "每把押手头的一半", lib: "bold_frac", p: { f: 0.5 } },
      { id: "bold", name: "大胆下注", lib: "bold_all", p: {} }
    ];
  },
  scenes: [
    { name: "轮盘 18/38，翻倍", p: { p: 0.4737, x0: 0.5 } }, { name: "从 30% 做到 100%", p: { x0: 0.3 } }, { name: "公平赌局", p: { p: 0.5 } },
    { name: "有利赌局 p = 0.55", p: { p: 0.55 } }, { name: "很不利 p = 0.4", p: { p: 0.4 } }
  ],
  api: [
    "动作：返回这一把押上的资金比例，范围 [0, 1]。押中赢得与赌注相同的钱，押错输掉赌注。每一把都要返回一个数：返回 0 这一把不押，但这一把照样过去，算在把数上限里。",
    "裁判会把赌注限制在\"刚好够到目标\"以内：资金是 x 时最多押 1 − x（都以目标金额为单位）。",
    "s.wealth     手头的资金占目标金额的比例；s.g.x0 是开局时的比例，s.g.p 是每一把的胜率",
    "s.last       上一把赢了多少（输了是负数）；s.ret(k) 是 k+1 把之前的结果，+1 赢，−1 输",
    "资金到达 1（目标）或 0 就结束；到了把数上限还没分出结果，算没有到达。"
  ].join("\n")
};

/* ---------- ⑤ 多臂老虎机 ---------- */
LIB.ban_rand = {
  head: "随便拉：每回合等可能地挑一台。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return Math.floor(s.rnd() * s.g.arms);      // 返回机器的编号 0, 1, …；s.rnd() 给出一个 (0,1) 上的随机数
  }
};
LIB.ban_greedy = {
  head: "贪心：每台先拉一次，之后永远拉目前平均回报最高的那台。",
  decide: function decide(s, p) {
    var K = s.g.arms, best = -1, bv = -1, k;
    for (k = 0; k < K; k++) {
      if (s.lock[k] > 0) continue;              // 被锁住的机器跳过
      if (s.pulls[k] === 0) return k;           // s.pulls[k]：第 k 台拉过几次；s.wins[k]：中了几次
      var m = s.wins[k] / s.pulls[k];
      if (m > bv) { bv = m; best = k; }
    }
    return best;
  }
};
LIB.ban_eps = {
  head: "ε-贪心：大多数时候拉目前看起来最好的那台，但每回合留 ε 的概率随便试一台。",
  decide: function decide(s, p) {
    var K = s.g.arms, best = -1, bv = -1, k;
    if (s.rnd() < p.eps) return Math.floor(s.rnd() * K);
    for (k = 0; k < K; k++) {
      if (s.lock[k] > 0) continue;
      if (s.pulls[k] === 0) return k;
      var m = s.wins[k] / s.pulls[k];
      if (m > bv) { bv = m; best = k; }
    }
    return best;
  }
};
LIB.ban_etc = {
  head: "先试后定：每台轮流拉 m 次，然后认准平均回报最高的那台一直拉到底。",
  init: function init(p) {
    return { order: null };                     // 试探结束时各台的名次；认定之后就不再改
  },
  decide: function decide(s, p, st) {
    var K = s.g.arms, k;
    if (s.t < p.m * K) return s.t % K;          // 试探阶段：轮流
    if (!st.order) {                            // 试探刚结束：按平均回报排一次名次，之后不再看新的数据
      st.order = [];
      for (k = 0; k < K; k++) st.order.push(k);
      st.order.sort(function (a, b) { return s.wins[b] / Math.max(1, s.pulls[b]) - s.wins[a] / Math.max(1, s.pulls[a]); });
    }
    for (k = 0; k < K; k++) if (!(s.lock[st.order[k]] > 0)) return st.order[k];   // 一直拉第一名；它被锁住的回合，拉没被锁的里面名次最高的
    return st.order[0];
  }
};
LIB.ban_ucb = {
  head: "置信上界（UCB1）：给每台机器的平均回报加上一个\"不确定性奖励\"，拉加完之后最高的那台。拉得越少，奖励越大。",
  decide: function decide(s, p) {
    var K = s.g.arms, best = -1, bv = -Infinity, k;
    for (k = 0; k < K; k++) {
      if (s.lock[k] > 0) continue;
      if (s.pulls[k] === 0) return k;
      var u = s.wins[k] / s.pulls[k] + Math.sqrt(p.c * Math.log(s.t + 1) / s.pulls[k]);
      if (u > bv) { bv = u; best = k; }
    }
    return best;
  }
};
LIB.ban_ts = {
  head: "Thompson 抽样：对每台机器的中奖率保持一个后验分布，每回合从各自的后验里抽一个数，拉抽出来最大的那台。",
  decide: function decide(s, p) {
    var K = s.g.arms, best = -1, bv = -1, k;
    for (k = 0; k < K; k++) {
      if (s.lock[k] > 0) continue;
      // 先验 Beta(1,1)（均匀），看到 中 w 次、没中 l 次 之后的后验是 Beta(1 + w, 1 + l)
      var x = s.rbeta(1 + s.wins[k], 1 + s.pulls[k] - s.wins[k]);
      if (x > bv) { bv = x; best = k; }
    }
    return best;
  }
};
/** 知道每台机器的真实中奖率时的最好成绩：没有锁时一直拉最好的那台；有锁时轮流拉最好的 D+1 台 */
function banditProphet(E) {
  var mu = Array.prototype.slice.call(E.h.mu).sort(function (a, b) { return b - a; }), D = E.g.D, m = Math.min(mu.length, D + 1), s = 0;
  for (var k = 0; k < m; k++) s += mu[k];
  return s / (D + 1);
}
function banditPriorMean(p) { var K = clamp(p.arms | 0, 2, 50); return p.prior === "needle" ? 0.5 + 0.1 / K : 0.5; }

WORLDS.g_bandit = {
  ideas: ['UCB，但置信宽度用 KL 散度来算（KL-UCB）', '先把明显差的机器淘汰掉（逐次淘汰），剩下的轮流拉', '有锁的时候：在没被锁的机器里做 Thompson 抽样'],
  mk: { 2: "作废的回合" },
  name: "⑤ 多臂老虎机", short: "多臂老虎机", group: GROUP, game: true, no: 5, unit: "回合",
  blurb: "K 台老虎机，每台的中奖率各不相同、事先不知道。每回合选一台拉一次，中了得 1 分。想知道哪台好就得去试，试的时候又在浪费回合。",
  params: [
    num("arms", "机器台数 K", 5, 2, 20, 1),
    num("T", "一局拉多少次", 500, 20, 5000, 10),
    sel("prior", "各台的中奖率", "uniform", [["uniform", "每局各自从 U(0,1) 里抽"], ["close", "都在 0.4 到 0.6 之间（难分辨）"], ["needle", "只有一台是 0.6，其余都是 0.5"]]),
    num("D", "拉过的机器锁几回合", 0, 0, 20, 1, { hint: "0 = 不锁。大于 0 时，同一台机器拉过之后要等这么多回合才能再拉" })
  ],
  defaults: { N: 500, T: 500, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 2, 20000); },
  hidden: function (p, T) { return { mu: clamp(p.arms | 0, 2, 50), u: T }; },
  consts: function (p, T) { return { T: T, arms: clamp(p.arms | 0, 2, 50), D: Math.max(0, p.D | 0) }; },
  score: function () { return { name: "平均每回合得分", digits: 4 }; },
  track: { name: "累计得分" }, obs: null, action: { name: "拉的是哪一台", kind: "arm" }, dxName: "所拉机器的真实中奖率",
  aux: [{ name: "累计遗憾（比一直拉最好的那台少拿的分）", digits: 1 }, { name: "拉对最好那台的比例", kind: "prob", digits: 1 }, { name: "作废的回合比例", kind: "prob", digits: 1 }],
  defStrat: "ban_ucb",
  gen: function (c) {
    var T = c.T, g = c.rng, mu = c.h.mu, u = c.h.u, K = mu.length, k, t, pr = c.p.prior;
    if (pr === "needle") { for (k = 0; k < K; k++) mu[k] = 0.5; mu[g.int(K)] = 0.6; }
    else for (k = 0; k < K; k++) mu[k] = pr === "close" ? 0.4 + 0.2 * g.u() : g.u();
    for (t = 0; t < T; t++) { u[t] = g.u(); c.r[t] = 0; c.lv[t] = 1; }
    c.lv[T] = 1;
  },
  play: function (E) {
    var T = E.T, V = E.V, K = E.g.arms, D = E.g.D, mu = E.h.mu, u = E.h.u, tmp = E.tmp, t, k, j, a, tot = 0, reg = 0, hit = 0, waste = 0, best = 0;
    if (!tmp.pulls || tmp.pulls.length !== K) { tmp.pulls = new Float64Array(K); tmp.wins = new Float64Array(K); tmp.lock = new Int32Array(K); }
    var pulls = tmp.pulls, wins = tmp.wins, lock = tmp.lock;
    pulls.fill(0); wins.fill(0); lock.fill(0); V.pulls = pulls; V.wins = wins; V.lock = lock;
    for (k = 1; k < K; k++) if (mu[k] > mu[best]) best = k;
    for (t = 0; t < T; t++) {
      a = E.ask(t); k = a === a ? Math.floor(a) : -1;
      var r = 0, m = 0;
      if (!(k >= 0 && k < K) || lock[k] > 0) { m = 2; waste++; reg += mu[best]; E.dx(t, NaN); }   // 编号无效，或者那台正被锁着：这一回合作废
      else { r = u[t] < mu[k] ? 1 : 0; pulls[k]++; wins[k] += r; reg += mu[best] - mu[k]; if (k === best) hit++; E.dx(t, mu[k]); }
      V.last = r; V.lastA = k;
      for (j = 0; j < K; j++) if (lock[j] > 0) lock[j]--;
      if (m === 0 && D > 0) lock[k] = D;
      tot += r; E.put(t, k, tot, m);
    }
    E.score = tot / T; E.aux[0] = reg; E.aux[1] = hit / T; E.aux[2] = waste / T;
  },
  theory: function (p) {
    var K = clamp(p.arms | 0, 2, 50), D = Math.max(0, p.D | 0), marks = [];
    if (D === 0) {   // 有锁时随便拉会撞上被锁的机器，没有这么简单的公式
      marks.push({ id: "rand", name: "随便拉的期望得分（公式）", value: banditPriorMean(p) });
      marks.push({ id: "oracle", name: "一直拉最好的那台（公式：对所有可能的对局取平均）", value: p.prior === "needle" ? 0.6 : p.prior === "close" ? 0.4 + 0.2 * K / (K + 1) : K / (K + 1), kind: "bound" });
    }
    return { marks: marks, curves: {} };
  },
  refs: function (p) {
    return [
      { id: "rand", name: "随便拉", lib: "ban_rand", p: {}, bench: true },
      { id: "greedy", name: "贪心", lib: "ban_greedy", p: {} },
      { id: "ucb", name: "置信上界 UCB1（c = 2）", lib: "ban_ucb", p: { c: 2 } },
      { id: "ts", name: "Thompson 抽样", lib: "ban_ts", p: {} },
      { id: "prophet", name: "知道每台的中奖率（在这一批对局上算的）", calc: banditProphet, kind: "bound" }
    ];
  },
  scenes: [
    { name: "5 台，U(0,1)", p: { arms: 5, prior: "uniform", D: 0 } }, { name: "难分辨（0.4–0.6）", p: { prior: "close" } }, { name: "大海捞针", p: { prior: "needle", arms: 10 } },
    { name: "20 台", p: { arms: 20 } }, { name: "只拉 50 次", p: { T: 50 } }, { name: "拉过锁 2 回合", p: { D: 2 } }
  ],
  api: [
    "动作：返回这一回合要拉的机器编号（0 到 s.g.arms − 1，小数会向下取整）。中了得 1 分，没中 0 分。每回合都得选一台，没有\"不拉\"这个选项。",
    "s.pulls[k]   第 k 台机器已经拉过几次；s.wins[k] 是它中过几次（两个都是数组）",
    "s.lock[k]    第 k 台机器还要锁几回合（0 = 能拉）。选了被锁的机器或者无效的编号，这一回合作废",
    "s.last       上一回合的得分（0 或 1）；s.lastA 是上一回合拉的机器",
    "s.g.arms  s.g.T  s.g.D   机器台数、总回合数、拉过之后锁几回合",
    "s.rnd()      (0,1) 上的均匀随机数；s.rnorm() 标准正态；s.rbeta(a, b) 从 Beta(a, b) 分布里抽一个数。每一局的随机数序列是固定的，结果可以复现。"
  ].join("\n")
};

/* ---------- ⑥ 报童问题 ---------- */
function newsDist(p) {
  var kind = p.dist, m, sd, s, mu;
  if (kind === "normal") {
    m = 150; sd = 45;
    return {
      label: "正态 N(150, 45²)（截掉负数）", mean: m, sd: sd, draw: function (g) { var x; do { x = m + sd * g.normal(); } while (x < 0); return x; },
      quantile: function (u) { return Math.max(0, m + sd * QL.normInv(clamp(u, 1e-9, 1 - 1e-9))); },
      emin: function (q) { var z = (q - m) / sd; return m - sd * (npdf(z) - z * (1 - ncdf(z))); }
    };
  }
  if (kind === "lognormal") {
    m = 150; s = Math.sqrt(Math.log(1 + 0.6 * 0.6)); mu = Math.log(m) - 0.5 * s * s;
    return {
      label: "对数正态（均值 150，右偏）", mean: m, sd: 0.6 * m, draw: function (g) { return Math.exp(mu + s * g.normal()); },
      quantile: function (u) { return Math.exp(mu + s * QL.normInv(clamp(u, 1e-9, 1 - 1e-9))); },
      emin: function (q) { if (!(q > 0)) return Math.min(q, 0); var d1 = (Math.log(m / q) + 0.5 * s * s) / s; return m - (m * ncdf(d1) - q * ncdf(d1 - s)); }
    };
  }
  return {
    label: "均匀分布 U(1, 300)", mean: 150.5, sd: 299 / Math.sqrt(12), draw: function (g) { return 1 + 299 * g.u(); },
    quantile: function (u) { return 1 + 299 * clamp(u, 0, 1); },
    emin: function (q) { return q <= 1 ? q : q >= 300 ? 150.5 : q - (q - 1) * (q - 1) / 598; }
  };
}
function newsTheory(p) {
  var D = newsDist(p), price = +p.price, cost = Math.min(+p.cost, price), sal = Math.min(+p.salvage || 0, cost);
  var cr = price > sal ? (price - cost) / (price - sal) : 0, qs = D.quantile(cr);
  function profit(q) { return (price - sal) * D.emin(q) - (cost - sal) * q; }
  return { dist: D, cr: cr, qStar: qs, profit: profit, best: profit(qs), atMean: profit(D.mean), prophet: (price - cost) * D.mean, price: price, cost: cost, salvage: sal };
}
QL.newsTheory = newsTheory;

LIB.news_mean = {
  head: "订平均数：每天都订历史需求的平均值。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return s.t === 0 ? s.g.mean : s.mean(s.t);  // s.mean(n)：最近 n 天需求的平均；第一天没有历史，用已知的均值
  }
};
LIB.news_fix = {
  head: "固定订货量：每天都订 q 件。",
  decide: function decide(s, p) {
    return p.q;
  }
};
LIB.news_crit = {
  head: "临界分位：知道需求的分布时，订到\"够卖（不缺货）的概率\"恰好等于 (售价 − 进价)/(售价 − 残值) 的那个量。",
  decide: function decide(s, p) {
    var g = s.g, cr = g.price > g.salvage ? (g.price - g.cost) / (g.price - g.salvage) : 0;   // 售价、进价、残值全相等时订多少都一样
    return g.quantile(cr);                      // s.g.quantile(u)：已知需求分布的 u 分位数
  }
};
LIB.news_saa = {
  head: "从历史里学：不知道分布，每天订\"到目前为止见过的需求\"的经验分位数。",
  init: function init(p) {
    return { xs: [] };                          // 见过的需求，从小到大排着
  },
  decide: function decide(s, p, st) {
    if (s.t === 0) return p.q0;
    var a = st.xs, x = s.x, lo = 0, hi = a.length;          // s.x：昨天的需求
    while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
    a.splice(lo, 0, x);                                      // 插到有序数组里的正确位置
    var g = s.g, cr = g.price > g.salvage ? (g.price - g.cost) / (g.price - g.salvage) : 0;
    return a[Math.min(a.length - 1, Math.floor(cr * a.length))];
  }
};
LIB.news_chase = {
  head: "追着上期走：昨天需求比订货多，今天就多订一点；少了就少订一点。实验里的人常这么干。",
  init: function init(p) {
    return { q: p.q0 };
  },
  decide: function decide(s, p, st) {
    if (s.t > 0) st.q += p.theta * (s.x - st.q);             // 朝昨天的需求挪 θ 那么远
    return st.q;
  }
};

WORLDS.g_news = {
  ideas: ['用最近 20 天需求的均值和标准差，按正态分布算临界分位', '指数平滑地跟踪需求的分位数（随机梯度法），不存历史'],
  mk: {},
  name: "⑥ 报童问题", short: "报童问题", group: GROUP, game: true, no: 6, unit: "天",
  blurb: "每天清晨订一批货，白天按需求卖。订少了，有生意做不成；订多了，卖不掉的当天作废。每天都要在看到需求之前定下订多少。",
  params: [
    num("T", "一局多少天", 100, 10, 1000, 10),
    sel("dist", "每天的需求", "unif", [["unif", "均匀分布 U(1, 300)"], ["normal", "正态 N(150, 45²)"], ["lognormal", "对数正态（均值 150，右偏）"]]),
    num("price", "售价", 12, 1, 50, 0.5),
    num("cost", "进价", 3, 0.5, 49.5, 0.5, { hint: "进价 3 是\"高利润\"商品，进价 9 是\"低利润\"商品（售价 12 时）" }),
    num("salvage", "卖不掉的每件残值", 0, 0, 20, 0.5)
  ],
  defaults: { N: 500, T: 100, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 2, 20000); },
  consts: function (p, T) { var th = newsTheory(p); return { T: T, price: th.price, cost: th.cost, salvage: th.salvage, mean: th.dist.mean, sd: th.dist.sd, quantile: th.dist.quantile }; },
  score: function () { return { name: "平均每天的利润", digits: 1 }; },
  track: { name: "累计利润" }, obs: { name: "需求", draw: "bars" }, action: { name: "订货量", kind: "same" }, dxName: "当天的需求",
  aux: [{ name: "平均订货量", digits: 1 }, { name: "缺货的天数比例", kind: "prob", digits: 1 }, { name: "平均每天剩下的货", digits: 1 }],
  defStrat: "news_fix",
  gen: function (c) {
    var D = c.D || (c.D = newsDist(c.p)), r = c.r, lv = c.lv, T = c.T, g = c.rng;
    lv[0] = D.mean;
    for (var t = 0; t < T; t++) { var x = D.draw(g); r[t] = x; lv[t + 1] = x; }   // lv[t]：第 t 天清晨已经知道的最近一次需求
  },
  play: function (E) {
    var T = E.T, V = E.V, d = E.r, g = E.g, t, a, q, tot = 0, sq = 0, out = 0, left = 0;
    for (t = 0; t < T; t++) {
      V.x = t > 0 ? d[t - 1] : NaN;
      a = E.ask(t); q = a === a ? Math.max(0, a) : 0;
      var sold = Math.min(q, d[t]), pf = g.price * sold - g.cost * q + g.salvage * (q - sold);
      tot += pf; sq += q; if (d[t] > q) out++; left += q - sold;
      V.last = pf; V.lastA = q; E.dx(t, d[t]);
      E.put(t, q, tot, 0);
    }
    E.score = tot / T; E.aux[0] = sq / T; E.aux[1] = out / T; E.aux[2] = left / T;
  },
  theory: function (p) {
    var th = newsTheory(p), marks = [
      { id: "crit", name: "最优订货量 q* = " + th.qStar.toFixed(1), value: th.best, kind: "optimum" },
      { id: "mean", name: "每天订均值 " + th.dist.mean.toFixed(1), value: th.atMean },
      { id: "prophet", name: "提前知道每天的需求", value: th.prophet, kind: "bound" }
    ];
    if (p.dist === "unif" && +p.price === 12 && !(+p.salvage > 0) && (+p.cost === 3 || +p.cost === 9)) {
      var hq = +p.cost === 3 ? 176.68 : 134.06;
      marks.push({ id: "human", name: "实验里受试者的平均订货量 " + hq + "（Schweitzer–Cachon 2000）", value: th.profit(hq), kind: "human" });
    }
    return { cr: th.cr, qStar: th.qStar, best: th.best, atMean: th.atMean, prophet: th.prophet, label: th.dist.label, marks: marks, curves: { "news_fix.q": { f: th.profit, name: "理论的期望利润 π(q)" } } };
  },
  refs: function (p) {
    return [
      { id: "mean", name: "订历史平均数", lib: "news_mean", p: {}, bench: true },
      { id: "chase", name: "追着上期走（θ = 0.5）", lib: "news_chase", p: { q0: 150, theta: 0.5 } },
      { id: "saa", name: "历史需求的经验分位数", lib: "news_saa", p: { q0: 150 } },
      { id: "crit", name: "临界分位（知道分布）", lib: "news_crit", p: {} }
    ];
  },
  scenes: [
    { name: "高利润（进价 3）", p: { cost: 3 } }, { name: "低利润（进价 9）", p: { cost: 9 } }, { name: "正态需求", p: { dist: "normal" } },
    { name: "右偏需求", p: { dist: "lognormal" } }, { name: "有残值 2", p: { salvage: 2 } }, { name: "只有 20 天", p: { T: 20 } }
  ],
  api: [
    "动作：返回今天的订货量（≥ 0 的数）。今天的需求在订货之后才揭晓。",
    "每天的利润 = 售价 × min(订货量, 需求) − 进价 × 订货量 + 残值 × 卖不掉的件数。卖不掉的货不能留到明天。",
    "s.x          昨天的需求（第一天是 NaN）；s.ret(k) 是 k+1 天之前的需求；s.mean(n)、s.vol(n)、s.rets(n) 是最近 n 天需求的均值、标准差、数组",
    "s.g.price  s.g.cost  s.g.salvage   售价、进价、残值",
    "s.g.mean  s.g.sd  s.g.quantile(u)  需求分布的均值、标准差、u 分位数（\"知道分布\"的规则才用它们；想模拟不知道分布的情形就别用）",
    "s.last       昨天的利润；s.lastA 是昨天的订货量"
  ].join("\n")
};

/* ---------- ⑦ 赢家诅咒 ---------- */
function curseProfit(b, m) { return b <= 0 ? 0 : b <= 100 ? (m / 2 - 1) * b * b / 100 : 50 * m - b; }
QL.curseProfit = curseProfit;

LIB.curse_zero = {
  head: "不出价：每一回合都出 0。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 0;
  }
};
LIB.curse_fix = {
  head: "固定出价：每一回合都出同一个价 b。",
  decide: function decide(s, p) {
    return p.b;
  }
};
LIB.curse_shade = {
  head: "按估值的倍数出价：有尽调信号时，出价 = k × 信号（k 小于 1 是打折，大于 1 是加价）。",
  decide: function decide(s, p) {
    if (!(s.x === s.x)) return 0;               // 没有信号就不出价
    return Math.max(0, Math.min(100, p.k * s.x));
  }
};
LIB.curse_bayes = {
  head: "贝叶斯出价：把\"对方肯卖\"这件事本身当作信息。对每一个可能的信号，算出使条件期望利润最大的出价。",
  fit: function fit(D, p, ml, rng) {
    var g = D.g, m = g.m, sd = g.noise, NV = 400, NS = 121, i, j, k;
    if (g.info !== "sig") return { flat: m > 2 ? 100 : 0, note: "没有信号时，期望利润是 (m/2 − 1)·b²/100：m < 2 时最优出价是 0，m > 2 时是 100。" };
    var lo = -3 * sd, hi = 100 + 3 * sd, tab = new Float64Array(NS), w = new Float64Array(NV + 1);
    for (i = 0; i < NS; i++) {
      var sg = lo + (hi - lo) * i / (NS - 1);
      for (j = 0; j <= NV; j++) { var z = (sg - 100 * j / NV) / sd; w[j] = Math.exp(-0.5 * z * z); }   // 后验 ∝ 先验 U(0,100) × 信号的似然
      // 出价 b = v_k 时成交的是 v ≤ b 的那些公司：期望利润 ∝ Σ_{j ≤ k} (m·v_j − b)·w_j，边扫边累加
      var cw = 0, cvw = 0, best = 0, bb = 0;
      for (k = 0; k <= NV; k++) { var vk = 100 * k / NV; cw += w[k]; cvw += vk * w[k]; var val = m * cvw - vk * cw; if (val > best) { best = val; bb = vk; } }
      tab[i] = bb;
    }
    var mid = function (x) { return tab[Math.round((x - lo) / (hi - lo) * (NS - 1))]; };
    return { tab: tab, lo: lo, hi: hi, note: "信号是 30 / 50 / 70 时的出价：" + mid(30).toFixed(1) + " / " + mid(50).toFixed(1) + " / " + mid(70).toFixed(1) + "。" };
  },
  decide: function decide(s, p, st, model) {
    if (model.flat != null) return model.flat;
    var n = model.tab.length - 1, u = (s.x - model.lo) / (model.hi - model.lo) * n;
    if (!(u > 0)) return model.tab[0];
    if (u >= n) return model.tab[n];
    var i = Math.floor(u);
    return model.tab[i] + (u - i) * (model.tab[i + 1] - model.tab[i]);   // 查表，线性插值
  }
};
LIB.curse_learn = {
  head: "从盈亏里学：把 0, 10, …, 100 这 11 档出价当成 11 台老虎机，用 ε-贪心去试，哪一档的平均盈亏最高就多用哪一档。",
  init: function init(p) {
    return { n: new Float64Array(11), sum: new Float64Array(11), last: -1 };
  },
  decide: function decide(s, p, st) {
    if (st.last >= 0) { st.n[st.last]++; st.sum[st.last] += s.last; }   // s.last：上一回合的盈亏
    var k, best = 0, bv = -Infinity;
    if (s.rnd() < p.eps) best = Math.floor(s.rnd() * 11);
    else for (k = 0; k < 11; k++) {
      var m = st.n[k] > 0 ? st.sum[k] / st.n[k] : p.opt;                // 没试过的档位先给一个乐观的估计
      if (m > bv) { bv = m; best = k; }
    }
    st.last = best;
    return best * 10;
  }
};

WORLDS.g_curse = {
  ideas: ['出价 = 信号 − k 倍的噪声标准差，信号太低就不出价', '用汤普森抽样在 0 到 100 的出价档位里学'],
  mk: { 1: "成交" },
  name: "⑦ 赢家诅咒", short: "赢家诅咒", group: GROUP, game: true, no: 7, unit: "回合",
  blurb: "你想收购一家公司。它对现在的老板值 V（只有他知道，在 0 到 100 之间均匀分布），到了你手里值 1.5V。你出一个价，他只在出价不低于 V 时才卖。",
  params: [
    num("T", "一局收购多少次", 200, 10, 2000, 10),
    num("m", "到你手里升值的倍数 m", 1.5, 1, 3, 0.05),
    sel("info", "出价之前你知道什么", "none", [["none", "什么都不知道"], ["sig", "有一份带噪声的估值"]], { descs: { none: "只知道 V 在 0 到 100 之间均匀分布。", sig: "出价前先看到 V + 噪声（噪声服从正态分布），相当于做了一次不太准的尽职调查。" } }),
    num("noise", "估值噪声的标准差", 15, 1, 60, 1, { show: function (p) { return p.info === "sig"; } })
  ],
  defaults: { N: 500, T: 200, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 1, 20000); },
  hidden: function (p, T) { return { v: T }; },
  consts: function (p, T) { return { T: T, m: +p.m, info: p.info, noise: p.info === "sig" ? +p.noise : NaN }; },
  score: function () { return { name: "平均每次收购的盈亏", digits: 2 }; },
  track: { name: "累计盈亏" }, obs: { name: "公司的真实价值 V", draw: "bars" }, action: { name: "出价", kind: "same" }, dxName: "公司的真实价值 V（事后才知道）",
  aux: [{ name: "成交的比例", kind: "prob", digits: 1 }, { name: "成交时平均每笔盈亏", digits: 2 }, { name: "平均出价", digits: 1 }],
  defStrat: "curse_fix",
  gen: function (c) {
    var T = c.T, g = c.rng, v = c.h.v, sig = c.p.info === "sig", sd = +c.p.noise || 0, t;
    for (t = 0; t < T; t++) { var x = 100 * g.u(); v[t] = x; c.r[t] = x; c.lv[t] = sig ? x + sd * g.normal() : 50; }   // r：成交与否，事后都会知道 V
    c.lv[T] = c.lv[T - 1];
  },
  play: function (E) {
    var T = E.T, V = E.V, v = E.h.v, m = E.g.m, sig = E.g.info === "sig", t, a, b, tot = 0, deals = 0, dsum = 0, bsum = 0;
    for (t = 0; t < T; t++) {
      V.x = sig ? E.lv[t] : NaN;
      a = E.ask(t); b = a === a ? Math.max(0, a) : 0;
      var deal = b > 0 && b >= v[t], pf = deal ? m * v[t] - b : 0;
      if (deal) { deals++; dsum += pf; }
      tot += pf; bsum += b; V.last = pf; V.lastA = b; E.dx(t, v[t]);
      E.put(t, b, tot, deal ? 1 : 0);
    }
    E.score = tot / T; E.aux[0] = deals / T; E.aux[1] = deals ? dsum / deals : NaN; E.aux[2] = bsum / T;
  },
  theory: function (p) {
    var m = +p.m, bStar = m > 2 ? 100 : 0, marks = [];
    if (p.info !== "sig") {
      marks.push({ id: "opt", name: "最优出价 " + bStar, value: curseProfit(bStar, m), kind: "optimum" });
      marks.push({ id: "naive", name: "出价 60（实验里多数人出在 50 到 75 之间）", value: curseProfit(60, m), kind: "human" });
    }
    return { bStar: bStar, marks: marks, curves: { "curse_fix.b": { f: function (b) { return curseProfit(b, m); }, name: "理论的期望盈亏 (m/2 − 1)·b²/100" } } };
  },
  refs: function (p) {
    var L = [{ id: "zero", name: "不出价", lib: "curse_zero", p: {}, bench: true }, { id: "naive", name: "每次出 60", lib: "curse_fix", p: { b: 60 } }];
    if (p.info === "sig") L.push({ id: "face", name: "信号是多少就出多少", lib: "curse_shade", p: { k: 1 } }, { id: "bayes", name: "贝叶斯出价", lib: "curse_bayes", p: {} });
    return L;
  },
  scenes: [
    { name: "原题（m = 1.5，没有信息）", p: { m: 1.5, info: "none" } }, { name: "m = 2.5（值得买）", p: { m: 2.5 } },
    { name: "有估值，噪声 15", p: { info: "sig", noise: 15 } }, { name: "有估值，噪声 5", p: { info: "sig", noise: 5 } }, { name: "有估值，噪声 40", p: { info: "sig", noise: 40 } }
  ],
  api: [
    "动作：返回这一回合的出价（≥ 0 的数；出 0 等于不出价，不会成交）。出价不低于公司的真实价值 V 就成交：盈亏 = m·V − 出价；否则不成交，盈亏为 0。",
    "s.x          尽调得到的估值 V + 噪声（没有信号的设定下是 NaN）",
    "s.last       上一回合的盈亏；s.lastA 是上一回合的出价",
    "s.ret(k)     k+1 回合之前那家公司的真实价值（每回合结束后都会公布）",
    "s.g.m  s.g.info  s.g.noise   升值倍数、有没有信号（\"none\" / \"sig\"）、信号噪声的标准差",
    "s.rnd()      (0,1) 上的均匀随机数（想随机试探时用）"
  ].join("\n")
};

/* ---------- ⑧ 自营考核 ---------- */
/** 固定杠杆 f、连续盯盘、不设期限时先碰到目标的概率。净值 W 是几何布朗运动，W^(−θ) 是鞅，θ = 2μ/(fσ²) − 1 */
function propPass(f, mu, sg, a, b) {
  if (!(f > 0) || !(sg > 0)) return 0;
  var th = 2 * mu / (f * sg * sg) - 1;
  if (Math.abs(th) < 1e-9) return -Math.log(1 - b) / (Math.log(1 + a) - Math.log(1 - b));
  var lo = Math.pow(1 - b, -th), hi = Math.pow(1 + a, -th);
  return (1 - lo) / (hi - lo);
}
QL.propPass = propPass;
var PROP_M = 8;   // 每天在日内再细分成几段来盯盘
/** 两个端点 y0、y1 之间的布朗桥（方差 v）碰到水平 b 的概率 */
function bridgeHit(y0, y1, b, v) {
  if (b === Infinity || b === -Infinity || b !== b) return 0;
  if ((y0 - b) * (y1 - b) <= 0) return 1;
  return Math.exp(-2 * (b - y0) * (b - y1) / v);
}
/** 同一座布朗桥、上下各一条线（lo < y0 < hi，可以是 ±∞）：返回 [先碰到 hi 的概率, 先碰到 lo 的概率]。
 *  镜像法：记 b = hi − y0，a = y0 − lo，d = a + b，y = y1 − y0，φ 是 N(0, v) 的密度，则
 *    P(先碰上线) = Σ_{k≥0} [φ(2b − y + 2kd) − φ(y − 2(k+1)d)] / φ(y)      （y ≤ b 时）
 *    P(先碰下线) = Σ_{k≥0} [φ(2a + y + 2kd) − φ(y + 2(k+1)d)] / φ(y)      （y ≥ −a 时）
 *  终点落在线外时那条线必然被碰到，另一条的概率仍由上式给出。只有一条线时退化成 bridgeHit。 */
function bridgeFirst(y0, y1, lo, hi, v) {
  var b = hi - y0, a = y0 - lo, y = y1 - y0;
  if (!(a > 0)) return [0, 1];
  if (!(b > 0)) return [1, 0];
  if (a === Infinity) return [b === Infinity ? 0 : y >= b ? 1 : Math.exp(-2 * b * (b - y) / v), 0];
  if (b === Infinity) return [0, y <= -a ? 1 : Math.exp(-2 * a * (a + y) / v)];
  var d = a + b, y2 = y * y, iv = 1 / (2 * v), up = 0, dn = 0, k, x, t1, t2, needUp = y < b, needDn = y > -a;
  for (k = 0; k < 400; k++) {
    var small = true;
    if (needUp) { x = 2 * b - y + 2 * k * d; t1 = Math.exp(-(x * x - y2) * iv); x = y - 2 * (k + 1) * d; t2 = Math.exp(-(x * x - y2) * iv); up += t1 - t2; if (t1 > 1e-15) small = false; }
    if (needDn) { x = 2 * a + y + 2 * k * d; t1 = Math.exp(-(x * x - y2) * iv); x = y + 2 * (k + 1) * d; t2 = Math.exp(-(x * x - y2) * iv); dn += t1 - t2; if (t1 > 1e-15) small = false; }
    if (small) break;
  }
  if (!needUp) up = 1 - dn; else if (!needDn) dn = 1 - up;
  up = up < 0 ? 0 : up > 1 ? 1 : up; dn = dn < 0 ? 0 : dn > 1 - up ? 1 - up : dn;
  return [up, dn];
}
QL.bridgeFirst = bridgeFirst;

LIB.prop_fix = {
  head: "固定仓位：每天都持有净值的 f 倍。",
  decide: function decide(s, p) {
    return p.f;                                 // 仓位 = 持仓市值 / 净值；负数是做空，绝对值不能超过杠杆上限
  }
};
LIB.prop_pace = {
  head: "看着两条线调仓：离出局线近了就缩，快到目标了也收一收。",
  decide: function decide(s, p) {
    var g = s.g, room = s.wealth - (1 - g.maxLoss), gap = 1 + g.target - s.wealth;   // 离出局线、离目标各还有多远
    var f = p.f * Math.min(1, room / p.buf);                                           // 余地不到 buf 时按比例减仓
    if (gap < p.near) f = Math.min(f, p.f * Math.max(gap, 0) / p.near + p.keep);       // 快达标时降到一个很小的仓位磨过去
    return f;
  }
};
LIB.prop_day = {
  head: "按日亏损线定仓位：把仓位定在\"一个 k 倍标准差的坏日子也碰不到单日亏损线\"的水平。",
  decide: function decide(s, p) {
    var v = s.vol(p.n);                         // 最近 n 天收益的标准差
    if (!(v > 0)) return p.f0;                  // 数据还不够时用一个保守的起始仓位
    return s.g.dayLoss / (p.k * v * s.wealth);
  }
};

WORLDS.g_prop = {
  ideas: ['前半程用 3 倍杠杆，净值到 1.05 之后降到 1 倍守住', '只在过去 5 天上涨时持仓，仓位按单日亏损线倒推'],
  mk: { 3: "考核已结束" }, pricePath: true,
  name: "⑧ 自营考核", short: "自营考核", group: GROUP, game: true, no: 8, unit: "天", act: "position", money: true,
  blurb: "自营交易公司的入门考核：给你一个账户，限期内赚到目标就算通过；其间只要亏到总亏损线，或者某一天亏得太多，立刻出局。",
  params: [
    sel("src", "行情", "gbm", [["gbm", "几何布朗运动（漂移 μ，波动 σ）"], ["t", "厚尾（日收益服从 Student-t，自由度 3）"], ["ar1", "有动量（日收益 AR(1)，φ = 0.15）"]]),
    num("mu", "漂移 μ（你的优势）", 10, -20, 60, 1, { unit: "%/年" }),
    num("sigma", "波动 σ", 20, 5, 80, 1, { unit: "%/年" }),
    num("target", "盈利目标", 10, 2, 30, 0.5, { unit: "%" }),
    num("maxLoss", "总亏损线", 10, 2, 30, 0.5, { unit: "%" }),
    num("dayLoss", "单日亏损线", 5, 1, 30, 0.5, { unit: "%", hint: "按期初资金的百分比算，从当天开盘时的净值往下量。账户盈利之后它比总亏损线更近；调到\"盈利目标 + 总亏损线\"以上才完全不起作用" }),
    num("days", "期限", 30, 5, 250, 1, { unit: "天" }),
    num("lev", "杠杆上限", 10, 1, 100, 1, { unit: "倍" }),
    num("cost", "交易成本（单边）", 2, 0, 50, 0.5, { unit: "bp" })
  ],
  defaults: { N: 2000, T: 30, K: 252 },
  Tof: function (p) { return clamp(p.days | 0, 2, 2000); },
  Kof: function () { return 252; },
  hidden: function (p, T) { return { z: T * PROP_M, u: T * PROP_M }; },
  consts: function (p, T) { return { T: T, days: T, target: p.target / 100, maxLoss: p.maxLoss / 100, dayLoss: p.dayLoss / 100, lev: +p.lev, cost: p.cost / 1e4, sd: p.sigma / 100 / Math.sqrt(252) }; },
  score: function () { return { name: "通过率", kind: "prob", digits: 1 }; },
  track: { name: "账户净值（期初 = 1）" }, track0: function () { return 1; }, obs: { name: "价格" }, action: { name: "仓位（杠杆倍数）", kind: "level" },
  aux: [{ name: "通过的人平均用了几天", digits: 1, cond: true }, { name: "碰到总亏损线出局", kind: "prob", digits: 1 }, { name: "单日亏损超限出局", kind: "prob", digits: 1 }, { name: "到期没达标", kind: "prob", digits: 1 }],
  defStrat: "prop_fix",
  ranges: function (p) { return { "prop_fix.f": [0, +p.lev], "prop_pace.f": [0.1, +p.lev] }; },
  gen: function (c) {
    var p = c.p, T = c.T, r = c.r, lv = c.lv, g = c.rng, dt = c.dt, t, mu = p.mu / 100, sg = p.sigma / 100;
    if (p.src === "ar1") {
      WORLDS.ar1.gen({ p: { mu: p.mu, sigma: p.sigma, phi: 0.15 }, T: T, K: c.K, dt: dt, S0: c.S0, r: r, lv: lv, rng: g, tmp: null });
    } else if (p.src === "t") {
      var sc = sg * Math.sqrt(dt) / Math.sqrt(3);
      for (t = 0; t < T; t++) r[t] = Math.max(-0.95, mu * dt + sc * g.t(3));
    } else {
      var a = (mu - 0.5 * sg * sg) * dt, b = sg * Math.sqrt(dt);
      for (t = 0; t < T; t++) r[t] = Math.exp(a + b * g.normal()) - 1;
    }
    var lev = c.S0; lv[0] = lev;
    for (t = 0; t < T; t++) { lev *= 1 + r[t]; lv[t + 1] = lev; }
    var z = c.h.z, u = c.h.u;                             // 日内盯盘用的随机数：布朗桥的噪声、判断"两次盯盘之间有没有越线"的均匀数
    for (t = 0; t < z.length; t++) { z[t] = g.normal(); u[t] = g.u(); }
  },
  play: function (E) {
    var T = E.T, V = E.V, r = E.r, g = E.g, z = E.h.z, u = E.h.u, M = PROP_M, sM = g.sd / Math.sqrt(M), v = sM * sM, top = 1 + g.target, floor = 1 - g.maxLoss;
    var W = 1, pos = 0, t, i, a, f, end = 0, turn = 0, expo = 0;
    for (t = 0; t < T && !end; t++) {
      E.acct(W, pos);
      a = E.ask(t); f = a === a ? clamp(a, -g.lev, g.lev) : 0;
      var d = Math.abs(f - pos), W0 = W * (1 - g.cost * d), out = Math.max(floor, W - g.dayLoss), Wn = W0 * (1 + f * r[t]);
      turn += d; expo += Math.abs(f);
      if (!(W0 > out)) { end = W0 <= floor ? 2 : 3; Wn = W0; }            // 极端情形：光是换仓的成本就压过了线
      else if (f !== 0) {
        // 白天仓位（股数）不动，净值 = W0·(1 + f·(价格比 − 1))：净值碰线 ⇔ 对数价格碰到下面两个水平
        var qa = 1 + (top / W0 - 1) / f, qb = 1 + (out / W0 - 1) / f;
        var bPass = qa > 0 ? Math.log(qa) : (f > 0 ? Infinity : -Infinity), bFail = qb > 0 ? Math.log(qb) : (f > 0 ? -Infinity : Infinity);
        var ell = Math.log(1 + r[t]), zbar = 0, acc = 0, y0 = 0, hit = 0, o = t * M;
        for (i = 0; i < M; i++) zbar += z[o + i];
        zbar /= M;
        for (i = 1; i <= M && !hit; i++) {
          acc += z[o + i - 1] - zbar;                                     // 布朗桥：终点正好落在当天的收盘价上
          var y1 = ell * i / M + sM * acc, uu = u[o + i - 1];
          // 这一小段里先碰到哪条线：两条线都可能碰到时（杠杆高、线离得近），先后次序要算对，否则高杠杆下的通过率会偏低
          var fr = f > 0 ? bridgeFirst(y0, y1, bFail, bPass, v) : bridgeFirst(y0, y1, bPass, bFail, v), qPass = f > 0 ? fr[0] : fr[1], qFail = f > 0 ? fr[1] : fr[0];
          if (uu < qFail) hit = 2; else if (uu < qFail + qPass) hit = 1;
          y0 = y1;
        }
        if (hit === 1) { end = 1; Wn = top; }                             // 盘中达标：就停在目标上
        else if (hit === 2) { end = out > floor ? 3 : 2; Wn = out; }      // 盘中碰线：按线上的净值出局
      }
      pos = Wn > 0 && !end ? f * W0 * (1 + r[t]) / Wn : 0;
      W = Wn > 0 ? Wn : 0;
      E.put(t, f, W, end ? 3 : 0);
    }
    var used = t;
    E.fill(t, W, 3);
    E.score = end === 1 ? 1 : 0; E.wt = W; E.turn = turn; E.expo = used ? expo / used : 0;
    E.aux[0] = end === 1 ? used : NaN; E.aux[1] = end === 2 ? 1 : 0; E.aux[2] = end === 3 ? 1 : 0; E.aux[3] = end === 0 ? 1 : 0;
  },
  theory: function (p) {
    var a = p.target / 100, b = p.maxLoss / 100, mu = p.mu / 100, sg = p.sigma / 100, marks = [], curves = {};
    marks.push({ id: "fair", name: "没有优势（μ = 0）时任何打法的上限：亏损线 /（目标 + 亏损线）", value: b / (a + b), kind: mu <= 0 && p.src !== "ar1" ? "bound" : "theory" });
    if (p.src === "gbm") curves["prop_fix.f"] = { f: function (f) { return propPass(f, mu, sg, a, b); }, name: "理论：不设期限、没有单日亏损线、连续调仓" };
    return { fair: b / (a + b), kellyX2: sg > 0 ? 2 * mu / (sg * sg) : NaN, marks: marks, curves: curves };
  },
  refs: function (p) {
    var lv = +p.lev, L = [{ id: "f1", name: "固定仓位 1 倍", lib: "prop_fix", p: { f: 1 }, bench: true }];
    [3, 6].forEach(function (f) { if (f <= lv) L.push({ id: "f" + f, name: "固定仓位 " + f + " 倍", lib: "prop_fix", p: { f: f } }); });
    return L;
  },
  scenes: [
    { name: "标准：30 天、±10%、日线 5%", p: { src: "gbm", mu: 10, sigma: 20, target: 10, maxLoss: 10, dayLoss: 5, days: 30 } }, { name: "没有优势（μ = 0）", p: { mu: 0 } },
    { name: "优势很大（μ = 40%）", p: { mu: 40 } }, { name: "期限 90 天", p: { days: 90 } }, { name: "没有单日亏损线", p: { dayLoss: 20 } }, { name: "厚尾行情", p: { src: "t" } }, { name: "有动量的行情", p: { src: "ar1" } }
  ],
  api: [
    "动作：返回目标仓位 f = 持仓市值 / 净值（和价格世界里的规则一样）。可以做空（负数），绝对值超过杠杆上限时按上限算。",
    "每天收盘后调用一次，定下第二天的仓位；白天不能再交易，持有的股数不变，净值随价格连续变化，裁判全天盯着两条线和目标。盘中的价格规则看不到，只看得到每天的收盘价。",
    "s.wealth     账户净值（期初 = 1）；s.pos 当前仓位",
    "s.g.target  s.g.maxLoss  s.g.dayLoss   盈利目标、总亏损线、单日亏损线（都是小数，如 0.10）；s.g.lev 杠杆上限；s.g.days 期限",
    "s.price、s.ret(k)、s.mom(n)、s.sma(n)、s.vol(n) 等价格函数都可以用（见上）。",
    "盘中净值一碰到 1 + 目标 就算通过，之后不再交易；一碰到 1 − 总亏损线，或者比当天开盘时的净值低了一个单日亏损线，立刻出局；到期没达标也算没通过。碰线时按线上的净值结算，不会越过线。现金不计息。",
    "s.g.sd       价格一天的典型波动（σ/√252）"
  ].join("\n")
};

/* ---------- ⑨ A 股交易制度 ---------- */
LIB.ash_hold = {
  head: "买入持有：第一个时段满仓买入，一直拿到最后。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return 1;                                   // 目标仓位：0 = 空仓，1 = 满仓。这套制度下不能做空，也不能加杠杆
  }
};
LIB.ash_rev = {
  head: "日内高抛低吸（\"做 T\"）：守着一个底仓，上一个时段跌了就多买一点，涨了就卖掉一点。",
  decide: function decide(s, p) {
    var r = s.ret(0);                           // 刚过去的这个时段的涨跌幅
    if (!(r === r)) return p.base;
    var f = p.base - p.k * r / s.g.sd;          // s.g.sd：一个时段的典型波动
    return Math.max(0, Math.min(1, f));
  }
};
LIB.ash_board = {
  head: "追涨停：封上涨停就想买（买不到），打开之后只要当天涨幅还超过阈值就买，持有若干个时段后卖出。",
  init: function init(p) {
    return { hold: 0 };
  },
  decide: function decide(s, p, st) {
    var dayRet = s.price / s.p(s.slot) - 1;     // 今天到现在的涨幅；s.p(s.slot) 是今天的开盘价（也就是昨天的收盘价）
    if (st.hold > 0) { st.hold--; return 1; }
    if (s.lim === 1 || dayRet > p.th) { st.hold = Math.round(p.h * s.g.M); return 1; }   // 持有 h 天
    return 0;
  }
};

WORLDS.g_ashare = {
  ideas: ['底仓五成，跌停打开后的第一个时段加仓，持有两天', '只在每天最后一个时段调仓的 20 日动量'],
  mk: { 1: "想卖却被 T+1 挡住", 2: "封板，买卖被挡住" }, pricePath: true, stepUnit: "时段",
  name: "⑨ A 股交易制度", short: "A 股制度", group: GROUP, game: true, no: 9, unit: "年", act: "position", crit: true, money: true,
  blurb: "同一只股票，套上 A 股的交易制度再交易：当天买的当天不能卖（T+1），涨跌停板上买不进或卖不出，只能做多，卖出要交印花税。",
  params: [
    num("days", "交易日数", 240, 20, 750, 10),
    num("M", "每天几个时段", 4, 1, 8, 1, { hint: "每个时段开始时可以交易一次，当天的第一次就是开盘。只有 1 个时段时 T+1 不起作用" }),
    num("mu", "漂移 μ", 8, -30, 60, 1, { unit: "%/年" }),
    num("sigma", "波动 σ", 35, 5, 100, 1, { unit: "%/年" }),
    num("phi", "相邻时段收益的自相关", -0.1, -0.5, 0.5, 0.01, { hint: "负数：涨了容易回落、跌了容易反弹，日内高抛低吸才有可能赚钱" }),
    num("pj", "每天出大消息的概率", 4, 0, 30, 0.5, { unit: "%" }),
    num("jump", "大消息的典型幅度", 12, 2, 40, 1, { unit: "%", hint: "对数价格跳 ±(0.5–1.5) 倍这个幅度；超过涨跌停的部分要等后面几天才兑现" }),
    sel("limit", "涨跌停幅度", "10", [["10", "±10%（主板）"], ["20", "±20%（创业板、科创板）"], ["30", "±30%（北交所）"], ["0", "不设涨跌停"]]),
    sel("t1", "当天买的能不能当天卖", "on", [["on", "不能（T+1）"], ["off", "能（T+0）"]]),
    num("stamp", "印花税（只在卖出时收）", 5, 0, 30, 0.5, { unit: "bp" }),
    num("comm", "佣金（买卖都收）", 2.5, 0, 30, 0.5, { unit: "bp" })
  ],
  defaults: { N: 500, T: 960, K: 1008 },
  Tof: function (p) { return clamp(p.days | 0, 2, 5000) * clamp(p.M | 0, 1, 48); },
  Kof: function (p) { return 252 * clamp(p.M | 0, 1, 48); },
  hidden: function (p, T) { return { lim: T + 1 }; },
  consts: function (p, T) {
    var M = clamp(p.M | 0, 1, 48), comm = (+p.comm || 0) / 1e4, st = (+p.stamp || 0) / 1e4;
    return { T: T, M: M, days: T / M, limit: (+p.limit || 0) / 100, t1: p.t1 !== "off", buy: comm + 1e-5, sell: comm + 1e-5 + st, sd: p.sigma / 100 / Math.sqrt(252 * M) };
  },
  score: function () { return { name: "长期增长率", kind: "pct", digits: 2, unit: "每年" }; },
  track: { name: "净值（期初 = 1）" }, track0: function () { return 1; }, obs: { name: "价格" }, action: { name: "成交后的实际仓位", kind: "level" },
  aux: [{ name: "想买却封在涨停上的次数", digits: 1 }, { name: "想卖却封在跌停上的次数", digits: 1 }, { name: "想卖却被 T+1 挡住的次数", digits: 1 }],
  defStrat: "ash_rev",
  gen: function (c) {
    var p = c.p, T = c.T, M = clamp(p.M | 0, 1, 48), g = c.rng, r = c.r, lv = c.lv, lim = c.h.lim, t;
    var dt = 1 / (252 * M), sg = p.sigma / 100, m = (p.mu / 100 - 0.5 * sg * sg) * dt, s = sg * Math.sqrt(dt), phi = clamp(+p.phi || 0, -0.9, 0.9), se = s * Math.sqrt(1 - phi * phi);
    var pj = p.pj / 100 / M, J = p.jump / 100, Lm = (+p.limit || 0) / 100;
    var lat = Math.log(c.S0), P = c.S0, C = c.S0, x = s * g.normal();
    lv[0] = P; lim[0] = 0;
    for (t = 0; t < T; t++) {
      x = phi * x + se * g.normal();                                               // 时段收益：AR(1)
      lat += m + x;                                                                // lat：没有涨跌停时"本来的"对数价格
      var u1 = g.u(), u2 = g.u(), u3 = g.u();
      if (u1 < pj) lat += (u2 < 0.5 ? -1 : 1) * J * (0.5 + u3);                     // 大消息
      var q = Math.exp(lat), st = 0;
      if (Lm > 0) { var up = C * (1 + Lm), dn = C * (1 - Lm); if (q >= up) { q = up; st = 1; } else if (q <= dn) { q = dn; st = -1; } }
      r[t] = q / P - 1; lv[t + 1] = q; lim[t + 1] = st; P = q;
      if ((t + 1) % M === 0) C = P;                                                // 收盘：明天的涨跌停以今天的收盘价为准
    }
  },
  play: function (E) {
    var T = E.T, V = E.V, lv = E.lv, lim = E.h.lim, g = E.g, M = g.M, cash = 1, sh = 0, sellable = 0, t, a, f, turn = 0, expo = 0, nb = 0, ns = 0, nt = 0;
    for (t = 0; t < T; t++) {
      var P = lv[t], st = lim[t];
      if (t % M === 0) sellable = sh;                    // 新的一天：手里的股票都可以卖了
      var cur = sh * P, W = cash + cur;
      E.acct(W, W > 0 ? cur / W : 0); V.lim = st; V.day = (t / M) | 0; V.slot = t % M; V.sellable = sh > 0 ? (g.t1 ? Math.min(1, sellable / sh) : 1) : 0;
      a = E.ask(t); f = a === a ? clamp(a, 0, 1) : 0;
      var d = f * W - cur, mark = 0, v;
      if (d > 1e-9 * W) {                                // 要买
        if (st === 1) { nb++; mark = 2; }                // 封在涨停板上：没人卖，买不进
        else { v = Math.min(d, cash / (1 + g.buy)); if (v > 0) { sh += v / P; cash -= v * (1 + g.buy); turn += v / W; } }
      } else if (d < -1e-9 * W) {                        // 要卖
        if (st === -1) { ns++; mark = 2; }               // 封在跌停板上：没人买，卖不出
        else {
          v = Math.min(-d, (g.t1 ? sellable : sh) * P);
          if (v < -d - 1e-9 * W) { nt++; mark = 1; }     // 今天买的那部分卖不了（T+1）
          if (v > 0) { sh -= v / P; if (g.t1) sellable -= v / P; cash += v * (1 - g.sell); turn += v / W; }
        }
      }
      if (sellable < 0) sellable = 0; if (sh < 1e-15) sh = 0;
      var now = cash + sh * P;
      expo += now > 0 ? sh * P / now : 0;
      E.put(t, now > 0 ? sh * P / now : 0, cash + sh * lv[t + 1], mark);
    }
    var WT = cash + sh * lv[T], yrs = T / (252 * M);
    E.score = Math.log(WT) / yrs; E.wt = WT; E.turn = turn; E.expo = expo / T;
    E.aux[0] = nb; E.aux[1] = ns; E.aux[2] = nt;
  },
  theory: function (p) { return { marks: [], curves: {} }; },
  refs: function (p) {
    var L = [{ id: "hold", name: "买入持有（同样的制度）", lib: "ash_hold", p: {}, bench: true }];
    if (p.t1 !== "off" || +p.limit > 0) L.push({ id: "free", name: "同一条规则，改成 T+0、不设涨跌停", alt: { t1: "off", limit: "0" } });
    if (+p.stamp > 0) L.push({ id: "nostamp", name: "同一条规则，不收印花税", alt: { stamp: 0 } });
    return L;
  },
  scenes: [
    { name: "主板制度（T+1，±10%）", p: { t1: "on", limit: "10" } }, { name: "T+0、不设涨跌停", p: { t1: "off", limit: "0" } }, { name: "只去掉 T+1", p: { t1: "off" } },
    { name: "±20%（创业板）", p: { limit: "20" } }, { name: "不收印花税", p: { stamp: 0 } }, { name: "没有日内反转（φ = 0）", p: { phi: 0 } }, { name: "消息更多（每天 15%）", p: { pj: 15 } }
  ],
  api: [
    "动作：返回目标仓位 f，范围 [0, 1]（0 空仓，1 满仓）。不能做空，不能加杠杆。裁判按这套制度尽量把仓位调到 f，调不到的部分作罢。",
    "每个时段开始时调用一次，一天有 s.g.M 个时段。当天的第一次是开盘，看到的价格等于前一天的收盘价（这个模型里没有隔夜的跳动）；这个时段的涨跌发生在你交易之后。",
    "T+1：当天买进的股票，当天不能卖，到第二天开盘那一次才能卖。涨停时买不进，跌停时卖不出（收盘封在板上的，第二天开盘那一次仍然封着）。买入付佣金，卖出付佣金和印花税。空仓的现金不计息。",
    "s.wealth  s.pos   净值（期初 = 1）、当前实际仓位",
    "s.lim        现在是否封板：+1 涨停，−1 跌停，0 没有",
    "s.sellable   手里的股票有多大比例现在可以卖（T+1 下，今天买的那部分不算）",
    "s.day  s.slot   第几个交易日、当天的第几个时段（都从 0 数起）",
    "s.g.limit  s.g.t1  s.g.buy  s.g.sell  s.g.sd   涨跌停幅度、是否 T+1、买入费率、卖出费率、一个时段的典型波动",
    "s.price、s.ret(k)、s.mom(n)、s.sma(n)、s.vol(n) 等价格函数都可以用；它们的窗口以时段为单位。"
  ].join("\n")
};

/* ---------- ⑩ 大单拆分执行 ---------- */
/** 确定性的卖出计划 n[0..T−1]（总和为 1）的成本：期望 γ/2 + (η − γ/2)·Σn²，方差 σ²·Σ_{j<T} x_j²（x_j 是第 j 期卖完之后的剩余）。单位：期初市值的百分数 */
function execTheory(p) {
  var T = clamp(p.T | 0, 1, 5000), sg = +p.sigma, eta = +p.eta, gam = Math.min(+p.gamma, 2 * eta - 1e-6), lam = +p.lam, et = eta - gam / 2;   // γ 与裁判一样收到 2η 以内
  function cost(n) { var s2 = 0, v = 0, x = 1; for (var k = 0; k < T; k++) { s2 += n[k] * n[k]; x -= n[k]; if (k < T - 1) v += x * x; } var e = gam / 2 + et * s2, vr = sg * sg * v; return { mean: e, variance: vr, obj: e + lam * vr }; }
  function kappa(l) { var a = et > 0 ? l * sg * sg / et : Infinity; return a < 1e12 ? Math.log(1 + a / 2 + Math.sqrt(a + a * a / 4)) : 60; }   // 2(cosh κ − 1) = λσ²/(η − γ/2)
  function hold(kp, k) { return kp < 1e-9 ? 1 - k / T : Math.exp(-kp * k) * (1 - Math.exp(-2 * kp * (T - k))) / (1 - Math.exp(-2 * kp * T)); }      // sinh(κ(T − k))/sinh(κT)
  function ac(l) { var kp = kappa(l), n = [], x = 1; for (var k = 1; k <= T; k++) { var xk = k === T ? 0 : hold(kp, k); n.push(x - xk); x = xk; } return n; }
  function twap() { var n = []; for (var k = 0; k < T; k++) n.push(1 / T); return n; }
  function now() { var n = [1]; for (var k = 1; k < T; k++) n.push(0); return n; }
  function front(rho) { var n = [], x = 1; for (var k = 0; k < T; k++) { var q = k === T - 1 ? x : x * clamp(rho, 0, 1); n.push(q); x -= q; } return n; }
  return { T: T, cost: cost, kappa: kappa, ac: ac, twap: twap, now: now, front: front, etaTilde: et };
}
QL.execTheory = execTheory;

LIB.exec_twap = {
  head: "匀速卖出（TWAP）：把剩下的平均摊到剩下的每一期。它是这套玩法的基准。",
  decide: function decide(s, p) {
    return s.left / (s.T - s.t);                // 返回这一期卖出的量（以最初的总量为 1）；s.left 是还没卖的
  }
};
LIB.exec_now = {
  head: "一次卖完：第一期就全部卖掉。不担任何价格风险，但把价格砸得最狠。",
  decide: function decide(s, p) {
    return s.left;
  }
};
LIB.exec_front = {
  head: "前快后慢：每一期卖掉手里剩余的一个固定比例 ρ，最后一期清仓。",
  decide: function decide(s, p) {
    return s.left * p.rho;                      // 最后一期裁判会自动把剩下的全部卖掉
  }
};
LIB.exec_ac = {
  head: "Almgren–Chriss 最优计划：持仓按 sinh(κ(T − t))/sinh(κT) 下降，κ 由风险厌恶、波动和冲击成本共同决定。",
  init: function init(p) {
    return { k: -1 };
  },
  decide: function decide(s, p, st) {
    var g = s.g, left = s.T - s.t;              // 连这一期在内还剩几期
    if (st.k < 0) {                             // κ 满足 2(cosh κ − 1) = λσ²/(η − γ/2)，每条路径算一次
      var a = p.lam * g.sigma * g.sigma / (g.eta - g.gamma / 2);
      st.k = Math.log(1 + a / 2 + Math.sqrt(a + a * a / 4));
    }
    if (left <= 1) return s.left;
    if (!(st.k > 1e-9)) return s.left / left;   // λ = 0：退化成匀速
    // 这一期之后该留下的比例：sinh(κ(left − 1))/sinh(κ·left)，写成指数的形式以免溢出
    var keep = Math.exp(-st.k) * (1 - Math.exp(-2 * st.k * (left - 1))) / (1 - Math.exp(-2 * st.k * left));
    return s.left * (1 - keep);
  }
};
LIB.exec_aim = {
  head: "看价格调速度：价格比开始时高就卖快一点，低就卖慢一点。",
  decide: function decide(s, p) {
    var left = s.T - s.t, base = s.left / left;                                   // 匀速时这一期该卖的量
    var z = (s.price / s.p(s.t) - 1) * 100 / (s.g.sigma * Math.sqrt(s.t + 1));    // 现价相对起始价的涨跌，折算成"几个标准差"
    return base * Math.max(0, 1 + p.k * z);
  }
};

WORLDS.g_exec = {
  ideas: ['前一半时间匀速卖出 70%，后一半卖完剩下的', '按 Almgren–Chriss 的计划卖，但价格每跌一个标准差就把速度提高 20%'],
  mk: {}, pricePath: true,
  name: "⑩ 大单拆分执行", short: "大单执行", group: GROUP, game: true, no: 10, unit: "期",
  blurb: "手里有一大笔股票，必须在 T 期之内卖完。卖得快，把价格砸下去；卖得慢，价格在你手里多晃几期。怎么把这一笔分到各期去卖？",
  params: [
    num("T", "必须在几期内卖完", 20, 2, 200, 1),
    num("sigma", "每一期价格的波动 σ", 1, 0, 5, 0.05, { unit: "%" }),
    num("eta", "临时冲击 η", 5, 0.5, 30, 0.1, { unit: "%", hint: "一期之内全部卖完时，成交价比市价低这么多；只卖一部分时按比例缩小" }),
    num("gamma", "永久冲击 γ", 1, 0, 9, 0.1, { unit: "%", hint: "全部卖完之后，价格被永久压低这么多。必须小于 2η" }),
    num("lam", "风险厌恶 λ", 0.5, 0, 5, 0.05, { hint: "成本的方差每多 1（%²），愿意多付 λ（%）的期望成本去消掉它" }),
    num("phi", "各期价格变动的自相关", 0, -0.5, 0.5, 0.05, { hint: "0：价格是随机游走，事先定好的计划就是最优的" })
  ],
  defaults: { N: 2000, T: 20, K: 1 },
  Tof: function (p) { return clamp(p.T | 0, 1, 5000); },
  consts: function (p, T) { return { T: T, sigma: +p.sigma, eta: +p.eta, gamma: Math.min(+p.gamma, 2 * p.eta - 1e-6), lam: +p.lam }; },
  score: function () { return { name: "风险调整后的成本 E + λ·Var", lower: true, digits: 3, unit: "期初市值的 %" }; },
  scoreHow: "它不是各局成本的平均：先在全部对局上算出成本的均值 E 和方差 Var，再合成 E + λ × Var。成本以期初市值的 % 计，方差以 %² 计；± 是这个合成量的标准误。",
  track: { name: "还没卖出的比例" }, track0: function () { return 1; }, obs: { name: "市价" }, action: { name: "这一期卖出的量", kind: "level" },
  aux: [{ name: "平均成本（期初市值的 %）", digits: 3 }, { name: "成本的方差（%²）", digits: 3 }, { name: "第一期卖掉的比例", kind: "prob", digits: 1 }],
  defStrat: "exec_ac",
  gen: function (c) {
    var T = c.T, g = c.rng, r = c.r, lv = c.lv, sg = +c.p.sigma / 100 * c.S0, phi = clamp(+c.p.phi || 0, -0.9, 0.9), se = Math.sqrt(1 - phi * phi), x = g.normal(), S = c.S0, t;
    lv[0] = S;
    for (t = 0; t < T; t++) { x = phi * x + se * g.normal(); var S2 = Math.max(1e-6, S + sg * x); r[t] = S2 / S - 1; lv[t + 1] = S2; S = S2; }   // 没有你的卖出时市场本来的价格（算术随机游走）
  },
  play: function (E) {
    var T = E.T, V = E.V, lv = E.lv, g = E.g, S0 = lv[0], x = 1, cash = 0, perm = 0, t, a, n, first = 0;
    for (t = 0; t < T; t++) {
      var mid = lv[t] - perm;                            // 眼下的市价：已经含了你之前卖出造成的永久冲击
      V.left = x; V.x = mid;
      a = E.ask(t); n = a === a ? clamp(a, 0, x) : 0;
      if (t === T - 1) n = x;                            // 最后一期必须卖完
      cash += n * (mid - g.eta / 100 * S0 * n);          // 成交价 = 市价 − 临时冲击（与这一期卖出的量成正比）
      perm += g.gamma / 100 * S0 * n; x -= n;
      if (t === 0) first = n;
      V.last = n; V.lastA = n;
      E.put(t, n, x, 0);
    }
    var is = (S0 - cash) / S0 * 100;                     // 执行缺口：比"全部按起始价成交"少拿了多少（%）
    E.score = -is; E.wt = cash / S0; E.aux[0] = is; E.aux[2] = first;
  },
  /** 得分是整批对局的 均值 + λ·方差，不是各局得分的平均：换算成每局的"伪值" IS_i + λ(IS_i − 均值)²，平均数不变，标准误也跟着有了 */
  post: function (res, p) {
    var N = res.N, m = 0, n, lam = +p.lam;
    for (n = 0; n < N; n++) m += res.AUX[n * res.naux];
    m /= N;
    for (n = 0; n < N; n++) { var is = res.AUX[n * res.naux], d2 = (is - m) * (is - m); res.AUX[n * res.naux + 1] = d2; res.SC[n] = -(is + lam * d2); }
  },
  theory: function (p) {
    var th = execTheory(p), ac = th.cost(th.ac(+p.lam)), tw = th.cost(th.twap()), nw = th.cost(th.now()), flat = !(+p.phi), marks = [];
    marks.push({ id: "ac", name: "Almgren–Chriss 计划", value: -ac.obj, kind: flat ? "optimum" : "theory" });
    marks.push({ id: "twap", name: "匀速卖出", value: -tw.obj }, { id: "now", name: "一次卖完", value: -nw.obj });
    var curves = {};
    if (flat) {
      curves["exec_ac.lam"] = { f: function (l) { return -th.cost(th.ac(l)).obj; }, name: "理论" };
      curves["exec_front.rho"] = { f: function (r) { return -th.cost(th.front(r)).obj; }, name: "理论" };
    }
    return { kappa: th.kappa(+p.lam), ac: ac, twap: tw, now: nw, marks: marks, curves: curves };
  },
  refs: function (p) {
    return [
      { id: "twap", name: "匀速卖出", lib: "exec_twap", p: {}, bench: true },
      { id: "now", name: "一次卖完", lib: "exec_now", p: {} },
      { id: "ac", name: "Almgren–Chriss 计划", lib: "exec_ac", p: { lam: +p.lam } }
    ];
  },
  scenes: [
    { name: "默认（λ = 0.5）", p: { lam: 0.5, phi: 0 } }, { name: "不在乎风险（λ = 0）", p: { lam: 0 } }, { name: "很怕风险（λ = 3）", p: { lam: 3 } },
    { name: "波动翻倍", p: { sigma: 2 } }, { name: "冲击很小（η = 1）", p: { eta: 1, gamma: 0.5 } }, { name: "价格有动量（φ = 0.3）", p: { phi: 0.3 } }, { name: "价格会回落（φ = −0.3）", p: { phi: -0.3 } }
  ],
  api: [
    "动作：返回这一期卖出的量（最初的总量记为 1）。不能超过手里剩下的，不能是负数；最后一期裁判会把剩下的全部卖掉。",
    "s.left       还没卖出的量；s.t 是第几期（从 0 数起），s.T 是总期数",
    "s.x          眼下的市价（已经含了你之前的卖出造成的永久冲击）",
    "s.price、s.p(k)、s.ret(k)、s.mom(n) 给的是\"没有你的卖出时市场本来的价格\"；起始价是 s.p(s.t)",
    "s.g.sigma  s.g.eta  s.g.gamma  s.g.lam   每期波动、临时冲击、永久冲击（都是期初市值的百分数）、裁判的风险厌恶系数",
    "这一期卖出 n：成交价 = 市价 − 起始价 × η% × n，成交之后市价立刻永久下降 起始价 × γ% × n。每一期先成交、后变动：第一期按起始价成交。",
    "得分看的是成本（越低越好）：成本 = 起始市值 − 实际卖得的钱；裁判按 期望 + λ × 方差 打分。"
  ].join("\n")
};

/* 玩法按编号排好，供界面列出 */
QL.GAMES = Object.keys(WORLDS).filter(function (k) { return WORLDS[k].game; }).sort(function (a, b) { return WORLDS[a].no - WORLDS[b].no; });

/* 每套玩法里，哪些参数说的是"世界"（数据服从什么分布、什么过程），其余的才是这套玩法的细则。左栏按这个分成两块。
 * wsel：用哪个参数来换世界；没有 wsel 的玩法，世界是固定的一种，wname / wdesc 是它的名字和一句说明。 */
var WLAYER = {
  g_lock: { wsel: "dist", wkeys: ["dist", "s", "alpha", "sd"] },
  g_sec: { wkeys: [], wname: "互不相干的候选人", wdesc: "每个人的好坏互不相干，到场的先后完全随机。只和见过的人比名次时，分数服从什么分布无关紧要，所以这套玩法没有别的世界可换。" },
  g_coin: { wkeys: ["p"], wname: "一枚偏硬币", wdesc: "每一次的结果互相独立，正面的概率固定，而且你事先知道它。" },
  g_bold: { wkeys: ["p"], wname: "一个胜率固定的赌局", wdesc: "每一把互相独立，押中赢得同样多的钱，胜率你事先知道。" },
  g_bandit: { wsel: "prior", wkeys: ["prior", "arms"] },
  g_news: { wsel: "dist", wkeys: ["dist"] },
  g_curse: { wkeys: [], wname: "一家只有卖方知道价值的公司", wdesc: "公司对现在的老板值多少，在 0 到 100 之间均匀分布，每次收购各抽一次。" },
  g_prop: { wsel: "src", wkeys: ["src", "mu", "sigma"] },
  g_ashare: { wkeys: ["mu", "sigma", "phi", "pj", "jump"], wname: "带日内反转和偶发跳跃的股价", wdesc: "反转给了高抛低吸一点可赚的钱，跳跃用来触发涨跌停。它不是对真实 A 股的拟合，只是让每一条制度都有机会起作用。" },
  g_exec: { wkeys: ["sigma", "eta", "gamma", "phi"], wname: "随机游走的价格，加上你自己卖出造成的冲击", wdesc: "不卖的时候价格自己随机游走；你每卖一笔，都会把成交价压低一点（临时冲击），并把之后的价格永久地压低一点（永久冲击）。" }
};
Object.keys(WLAYER).forEach(function (k) { var o = WLAYER[k]; Object.keys(o).forEach(function (q) { WORLDS[k][q] = o[q]; }); });

}
if (typeof module !== "undefined" && module.exports) module.exports = QL_GAMES_INSTALL;
