// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 亲手玩一局（引擎这一半）
 * 裁判 play(E) 是同步的：它一回合一回合地问规则要动作，一口气把一局走完。人没法同步作答，
 * 所以这里每次都从头重放：已经定下的回合照原样作答，走到第一个还没定的回合，把这时候规则看得到的东西抄下来交给界面。
 * 人打的局很短（几十到几百回合），重放一遍不到一毫秒。这样做有两个好处：
 *   1. 裁判的代码一个字不用动，人和规则面对的是同一个裁判、同一局的同一串随机数；
 *   2. 给人看的局面只从 s（裁判交给规则的那个对象）里取：规则读不到的东西，人在打的时候也看不到。
 * 这个文件只在主线程里用，不进后台线程。 */
function QL_HUMAN_INSTALL(QL) {
"use strict";
var WORLDS = QL.WORLDS, LIB = QL.gameLib, RNG = QL.RNG;
var EP_BID = 7000, LONG_BID = 6999;   // 亲手玩的对局用自己的批次号：与计分的那一批（0）、样本外的各批（1, 2, …）、给模型学的（负数）都不相同
var SAME_MAX = 300;                   // 左栏的设定不超过这么多回合时，可以原样拿来打
function copy(a) { return Array.prototype.slice.call(a); }
function meanSe(a) { var n = a.length, s = 0, s2 = 0, i; for (i = 0; i < n; i++) { s += a[i]; s2 += a[i] * a[i]; } var m = n ? s / n : NaN, v = n > 1 ? Math.max(0, (s2 - s * s / n) / (n - 1)) : 0; return { m: m, se: n > 1 ? Math.sqrt(v / n) : NaN, n: n }; }

/* ---------- 每套玩法给人打时的规定 ----------
 * sizes   人打得动的几种长度（只改长度；分布、目标、概率这些"风味"跟左栏走）
 * star    打完之后先和哪一条参照规则比：{ id, why }。why 是理由："opt" 理论上最好；"growth" 增长率最优（见偏硬币下注）；
 *         "long" 没有事先指定的（id 是 null），打之前按长期平均挑最高的那条
 * snap    从 s 里抄下这一回合给人看的东西（只许读规则读得到的）
 * auto    这一回合其实没得选时，替人作答（被锁住、只剩最后一个人）；有得选就返回 null
 * reveal  打完之后才揭晓的东西（整局的数据，连同裁判藏着的那些） */
var H = {};
H.g_lock = {
  sizes: [{ id: "s", over: { T: 30, L: 3 } }, { id: "m", over: { T: 60, L: 5 } }, { id: "l", over: { T: 120, L: 8 } }],
  star: function () { return { id: "dp", why: "opt" }; },
  snap: function (s) { return { x: s.x, locked: s.locked }; },
  auto: function (v) { return v.locked > 0 ? 0 : null; },
  reveal: function (B) {
    // 事后诸葛亮接的是哪几单：先倒推出每个回合起最多还能拿多少，再顺着走一遍
    var T = B.T, Lk = Math.max(0, B.gp.L | 0), x = B.R, V = new Float64Array(T + Lk + 2), take = [], t;
    for (t = T - 1; t >= 0; t--) { var a = x[t] + V[t + Lk + 1]; V[t] = a > V[t + 1] ? a : V[t + 1]; }
    for (t = 0; t < T;) { if (x[t] + V[t + Lk + 1] > V[t + 1]) { take.push(t); t += Lk + 1; } else t++; }
    return { x: copy(x), prophet: take, prophetTotal: V[0] };
  }
};
H.g_sec = {
  sizes: [{ id: "s", over: { n: 10 } }, { id: "m", over: { n: 20 } }, { id: "l", over: { n: 50 } }],
  // 看得到分数、又按名次计分时没有现成的最优解（Robbins 问题）：那时按长期平均挑
  star: function (p) { return p.goal === "rank" ? (p.info === "full" ? { id: null, why: "long" } : { id: "rank", why: "opt" }) : { id: p.info === "full" ? "gm" : "cut", why: "opt" }; },
  snap: function (s) { return { rank: s.rank, x: s.x, left: s.left }; },
  auto: function (v) { return v.left === 0 ? 1 : null; },
  reveal: function (B) {
    var T = B.T, abs = B.H.abs, best = 0, t;
    for (t = 0; t < T; t++) if (abs[t] === 1) best = t;
    return { x: copy(B.R), abs: copy(abs), rel: copy(B.H.rel), best: best };
  }
};
H.g_coin = {
  sizes: [{ id: "s", over: { T: 20 } }, { id: "m", over: { T: 40 } }, { id: "l", over: { T: 100 } }],
  star: function (p) { return +p.cap > 0 ? { id: "dp", why: "opt" } : { id: "kelly", why: "growth" }; },   // 不封顶时"期望到手"最大的打法是每次全押，几乎必然输光：那时和 Kelly 比
  snap: function (s) { return { wealth: s.wealth, last: s.last, lastA: s.lastA, prev: s.t > 0 ? s.ret(0) : NaN }; },
  /** 把"押多少美元、押哪一面"换成裁判认的那个数：押上的资金比例，负数押反面。
   *  比例乘回资金时可能差最后一位，所以往上让一丝：押 1 美分不会因为舍入变成"不足 1 美分" */
  frac: function (W, stake, side) {
    if (!(stake > 0) || !(W > 0)) return 0;
    var f = stake >= W ? 1 : Math.min(1, stake / W * (1 + 1e-15));
    return side < 0 ? -f : f;
  },
  reveal: function (B) { var h = 0, t; for (t = 0; t < B.T; t++) if (B.R[t] > 0) h++; return { flips: copy(B.R), heads: h }; }
};
H.g_bandit = {
  sizes: [{ id: "s", over: { T: 30 } }, { id: "m", over: { T: 60 } }, { id: "l", over: { T: 120 } }],
  star: function () { return { id: null, why: "long" }; },   // 哪条参照规则好要看一局有多长：几十回合的短局里"贪心"比 Thompson 抽样好，长局里反过来
  snap: function (s) { return { pulls: copy(s.pulls), wins: copy(s.wins), lock: copy(s.lock), last: s.last, lastA: s.lastA }; },
  auto: function (v) { for (var k = 0; k < v.lock.length; k++) if (!(v.lock[k] > 0)) return null; return 0; },   // 每一台都锁着：这一回合只能作废
  reveal: function (B) { var mu = copy(B.H.mu), best = 0, k; for (k = 1; k < mu.length; k++) if (mu[k] > mu[best]) best = k; return { mu: mu, best: best }; }
};

QL.HUMAN_VER = 1;   // 对局的生成方式变了就加一：存下来的成绩是按"第几局"记的，换了生成方式就对不上了
QL.humanGames = function () { return Object.keys(H); };
QL.humanDef = function (type) { return H[type] || null; };
/** 这套玩法给人打时可以选的几种长度：[{ id, hp }]。hp 是完整的一组参数。
 *  左栏的设定本身就打得动（不超过 300 回合）而且不在预设里时，多一个 id 为 "same" 的选项：原样打 */
QL.humanSizes = function (type, p) {
  var hd = H[type], w = WORLDS[type], out = [], seen = {};
  if (!hd) return out;
  hd.sizes.forEach(function (z) { var hp = Object.assign({}, p, z.over); out.push({ id: z.id, hp: hp }); seen[JSON.stringify(hp)] = 1; });
  if (w.Tof(p) <= SAME_MAX && !seen[JSON.stringify(p)]) out.push({ id: "same", hp: Object.assign({}, p) });
  return out;
};
/** 第 k 局（k = 0, 1, 2, …）。同一个种子、同一组参数下，第 k 局永远是同一局 */
QL.humanEpisode = function (type, hp, seed, k) {
  if (!H[type]) throw new Error("这套玩法不能亲手玩：" + type);
  return QL.gameBatch({ type: type, params: hp, N: 1, seed: seed, S0: 100 }, EP_BID + (k | 0));
};

/** 把一局推进到下一个要人拿主意的回合。acts[t]：第 t 回合已经定下的动作（和规则的 decide 返回的是同一种数）。
 *  没打完：{ done: false, t, view, views, a, w, m, acts }：view 是眼下这一回合给人看的东西，views[i] 是前面各回合的；
 *    a / w / m 是裁判记下的动作、随回合推进的那个量（累计收益、资金……）、回合上的标记，只到已经打过的回合为止。
 *  打完了：{ done: true, score, aux, views, a, w, m, acts }。acts 里补上了替人作答的那些回合。 */
QL.humanStep = function (B, acts) {
  var hd = H[B.game];
  if (!hd) throw new Error("这套玩法不能亲手玩：" + B.game);
  acts = copy(acts || []);
  for (var guard = 0; guard <= B.T + 1; guard++) {
    var n = acts.length, at = -1, views = [];
    var res = QL.runGame(B, {
      decide: function (s) {
        var t = s.t;
        if (at < 0) { var v = hd.snap(s); v.t = t; views[t] = v; }   // 过了第一个没定的回合，裁判面前的局面就不是真的了：不再抄
        if (t < n) return acts[t];
        if (at < 0) at = t;
        return NaN;                                                  // 之后的回合按"什么都不做"走完，结果不算数
      }
    }, {}, null, { detail: 0 });
    var det = res.det;
    if (at < 0) return { done: true, acts: acts, views: views, a: copy(det.a), w: copy(det.w), m: copy(det.m), score: res.SC[0], aux: copy(res.AUX), T: B.T };
    var a = hd.auto ? hd.auto(views[at], B) : null;
    if (a == null) return { done: false, acts: acts, t: at, view: views[at], views: views, a: copy(det.a.subarray(0, at)), w: copy(det.w.subarray(0, at + 1)), m: copy(det.m.subarray(0, at)), T: B.T };
    while (acts.length < at) acts.push(NaN);                         // 裁判没问的回合占个位
    acts.push(a);
  }
  throw new Error("这一局推进不下去：裁判一直在问同一个回合。");
};

/* ---------- 参照规则 ---------- */
/** 只做逐局计算的参照物（"事后诸葛亮"这一类）。与 games.js 里的 calcRef 是同一回事 */
function calcOn(B, calc) {
  var w = WORLDS[B.game], N = B.N, T = B.T, SC = new Float64Array(N), hk = Object.keys(B.H || {}), E = { T: T, p: B.gp, g: w.consts ? w.consts(B.gp, T) : {}, r: null, lv: null, h: {}, tmp: {} };
  for (var n = 0; n < N; n++) {
    E.r = B.R.subarray(n * T, (n + 1) * T); E.lv = B.L.subarray(n * (T + 1), (n + 1) * (T + 1));
    for (var i = 0; i < hk.length; i++) { var Hh = B.H[hk[i]], len = Hh.length / N; E.h[hk[i]] = Hh.subarray(n * len, (n + 1) * len); }
    SC[n] = calc(E);
  }
  return SC;
}
/** 这一组设定要用到的东西，算一次，之后每一局都用它：参照规则（要先学一遍的，在另外一批对局上学好）、理论值、得分的写法 */
QL.humanKit = function (type, hp, seed) {
  var hd = H[type], w = WORLDS[type];
  if (!hd) throw new Error("这套玩法不能亲手玩：" + type);
  var T = w.Tof(hp), fitD = null, th = w.theory ? w.theory(hp) : null, sd = w.score(hp), refs = [];
  function fitData() { return fitD || (fitD = QL.makeData(QL.gameBatch({ type: type, params: hp, N: Math.max(200, Math.min(2000, Math.ceil(24000 / T))), seed: seed, S0: 100 }, 0, "fit"))); }
  (w.refs ? w.refs(hp) : []).forEach(function (r) {
    if (!r.lib && !r.calc) return;                 // "换细则"那一类要另外生成对局，这里不比
    var o = { id: r.id, name: r.name, kind: r.kind || (r.calc ? "bound" : "sim"), bench: !!r.bench, lib: r.lib || "", p: r.p || {}, calc: r.calc || null, strat: r.lib ? LIB[r.lib] : null, model: undefined, err: "" };
    try { if (o.strat && o.strat.fit) o.model = o.strat.fit(fitData(), o.p, QL.ml, new RNG(seed, -5, -5)); } catch (e) { o.err = String(e && e.message || e); }
    refs.push(o);
  });
  var marks = th && th.marks ? th.marks.map(function (m) { return { id: m.id, name: m.name, value: m.value, kind: m.kind || "theory" }; }) : [];
  var star = hd.star(hp);
  return { type: type, hp: hp, seed: seed, T: T, refs: refs, star: star.id, starWhy: star.why, marks: marks, score: { name: sd.name, kind: sd.kind || "num", digits: sd.digits == null ? 3 : sd.digits, lower: !!sd.lower, unit: sd.unit || "" } };
};
function runRef(B, r, detail) {
  if (r.calc) return { SC: calcOn(B, r.calc), det: null };
  var res = QL.runGame(B, r.strat, r.p, null, detail ? { detail: 0 } : {}, r.model);
  return { SC: res.SC, det: res.det };
}
/** 同一局交给各条参照规则各打一遍：[{ id, score, a, w, m }]。a / w / m 是它那一局的明细（只做逐局计算的上界没有） */
QL.humanRefsOn = function (kit, B, detail) {
  return kit.refs.map(function (r) {
    var o = { id: r.id, score: NaN, a: null, w: null, m: null, err: r.err };
    if (r.err) return o;
    try { var x = runRef(B, r, detail !== false); o.score = x.SC[0]; if (x.det) { o.a = copy(x.det.a); o.w = copy(x.det.w); o.m = copy(x.det.m); } } catch (e) { o.err = String(e && e.message || e); }
    return o;
  });
};
/** 长期平均：另外生成 N 局（与亲手打的那些局不是同一批），某一条参照规则在上面的平均得分 ± 标准误 */
QL.humanLongN = function (kit) { return Math.max(300, Math.min(4000, Math.round(240000 / kit.T))); };
QL.humanLongBatch = function (kit, N) { return QL.gameBatch({ type: kit.type, params: kit.hp, N: N || QL.humanLongN(kit), seed: kit.seed, S0: 100 }, LONG_BID); };
QL.humanLongRef = function (kit, B, id) {
  var r = kit.refs.filter(function (x) { return x.id === id; })[0];
  if (!r || r.err) return { m: NaN, se: NaN, n: 0 };
  return meanSe(runRef(B, r, false).SC);
};
/** 先和哪一条参照规则比。事先指定了就是它；没有指定的，在真的规则（不算上界）里挑长期平均最高的。by：{ id: { m } } */
QL.humanStar = function (kit, by) {
  if (kit.star) return kit.star;
  var best = null;
  kit.refs.forEach(function (r) { var x = by && by[r.id]; if (r.strat && !r.err && x && x.m === x.m && (best === null || x.m > by[best].m)) best = r.id; });
  return best;
};
QL.humanMeanSe = meanSe;
return H;
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_HUMAN_INSTALL;
