// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 每日一题（引擎这一半）
 * 一道题 = 一套带裁判的玩法（和世界工坊里的玩法是同一个接口：deal / show / referee，见 shop.js），加上几条基准规则。
 * 大家各写一条规则（decide），在"公开的几组数据"上随便试；交上去以后，到截止的时候换"结算的几组数据"排名。
 *
 * 一组数据 = 一个种子发出来的 K 局。公开的几组，种子由题目自己定，谁都能算；
 * 结算的几组，种子取自一个公共随机信标（drand）在截止之后那一刻发布的随机数：截止之前谁也算不出来，
 * 截止之后人人取到的都是同一个数，所以每个人的浏览器各自重放，排出来的是同一张榜。
 *
 * 题目是数据（daily/q/日期.json），不随页面发布；格式的检查在这个文件里（QL.questCheck），页面和校验脚本用的是同一份。
 * 题目里的文字都有中、英两份；代码里只许有整行的 // 注释，执行的是去掉注释以后的那一份，所以两种语言的页面跑的是同一段代码。
 * 这个文件在页面里和后台线程里各执行一遍：页面用到格式、种子、名次；线程用到最后那个任务。 */
function QL_QUEST_INSTALL(QL) {
"use strict";
var Q = QL.QUEST = { ver: 1, slot: 32, maxSets: 40, maxK: 5000, maxCost: 2e6, maxRefs: 6, maxCode: 20000,
  // drand 的 quicknet 链：每 3 秒出一个随机数，第 r 轮在 genesis + (r − 1) × period 那一秒发布
  beacon: { chain: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971", genesis: 1692803367, period: 3, margin: 30 } };
var IDRE = /^[a-z0-9][a-z0-9-]{1,39}$/, KEYRE = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;

/* ---------- 小工具 ---------- */
/** 一段字 → 一个 32 位的数（FNV-1a 再搅一遍） */
function qhash(s) { var x = 2166136261, i; s = String(s); for (i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return QL.hash32(x); }
QL.questHash = qhash;
/** "2026-10-14" → 这一天 UTC 零点的毫秒数；写法不对或者没有这一天时是 NaN */
function dayMs(day) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day)); if (!m) return NaN;
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return t === t && new Date(t).toISOString().slice(0, 10) === day ? t : NaN;
}
QL.questOpen = dayMs;
/** 这一天的题几点截止（毫秒）：第二天 UTC 零点 */
QL.questDeadline = function (day) { return dayMs(day) + 864e5; };
/** 某一时刻（毫秒）已经发布的最新一轮是第几轮；第几轮是什么时候发布的（毫秒） */
QL.beaconRound = function (ms) { var b = Q.beacon; return Math.floor((Math.floor(ms / 1000) - b.genesis) / b.period) + 1; };
QL.beaconTime = function (round) { var b = Q.beacon; return (b.genesis + (round - 1) * b.period) * 1000; };
/** 这一天的题用哪一轮随机数结算：截止之后再过 margin 秒的那一轮 */
QL.questRound = function (day) { return QL.beaconRound(QL.questDeadline(day) + Q.beacon.margin * 1000); };
/** 执行用的代码：整行的注释换成空行（行号不变），行尾的空白去掉。两种语言的版本去掉注释以后必须一字不差 */
QL.questCanon = function (code) {
  return String(code == null ? "" : code).replace(/\r\n?/g, "\n").split("\n").map(function (l) { return /^\s*\/\//.test(l) ? "" : l.replace(/\s+$/, ""); }).join("\n").replace(/\n+$/, "");
};
/** 中、英两份文字里取一份。x 是 { zh, en }，也可以就是一段字 */
QL.questText = function (x, lang) {
  if (typeof x === "string") return x;
  if (!x || typeof x !== "object") return "";
  return typeof x[lang] === "string" && x[lang] ? x[lang] : typeof x.zh === "string" && x.zh ? x.zh : typeof x.en === "string" ? x.en : "";
};
function finite(x) { return typeof x === "number" && x === x && x !== Infinity && x !== -Infinity; }
function isInt(x) { return finite(x) && Math.floor(x) === x; }

/* ---------- 题目的格式 ---------- */
function okP(p, errs, where) {
  var o = {};
  if (p == null) return o;
  if (typeof p !== "object" || Array.isArray(p)) { errs.push(where + ": must be an object of numbers"); return o; }
  var ks = Object.keys(p); if (ks.length > 12) errs.push(where + ": more than 12 parameters");
  ks.slice(0, 12).forEach(function (k) { if (!KEYRE.test(k) || !finite(p[k])) errs.push(where + "." + k + ": parameter names are letters, values are finite numbers"); else o[k] = p[k]; });
  return o;
}
/** 题目文件里，一段文字或者代码可以写成一个字符串，也可以写成"一行一个字符串"的数组（JSON 里好写，改动也好审）。不是这两样时返回 null */
function lines(x) { return typeof x === "string" ? x : Array.isArray(x) && x.every(function (l) { return typeof l === "string"; }) ? x.join("\n") : null; }
/** { zh, en } 拆成两段字；x 本身就是一段字时两份相同。single：是不是没有分语言 */
function pair(x) {
  var one = lines(x);
  if (one != null) return { zh: one, en: one, single: true, bad: false };
  if (x && typeof x === "object" && !Array.isArray(x)) { var zh = lines(x.zh), en = lines(x.en); return { zh: zh || "", en: en || "", single: false, bad: (x.zh != null && zh == null) || (x.en != null && en == null) }; }
  return { zh: "", en: "", single: false, bad: x != null };
}
/** 一段给人看的文字：{ zh, en } 或者一段字。strict 时两份都要有 */
function okText(x, max, need, strict, errs, where) {
  var pr = pair(x), zh = pr.zh, en = pr.en;
  if (pr.bad) errs.push(where + ": must be text (a string or an array of lines) or { zh, en }");
  if (need && !zh.trim() && !en.trim()) errs.push(where + ": missing");
  if (zh.length > max || en.length > max) errs.push(where + ": longer than " + max + " characters");
  if (strict && (need || zh || en)) {
    if (pr.single) errs.push(where + ": needs both { zh, en }");
    else { if (!zh.trim()) errs.push(where + ".zh: missing"); if (!en.trim()) errs.push(where + ".en: missing"); if (/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/.test(en)) errs.push(where + ".en: contains Chinese characters or full-width punctuation"); }
    // 手册里"现算的数字"用的那对括号，在题面里填不出数来
    if (/[\u27ea\u27eb]/.test(zh + en)) errs.push(where + ": must not contain the live-number brackets (U+27EA, U+27EB)");
  }
  return pr.single ? zh.slice(0, max) : { zh: zh.slice(0, max), en: en.slice(0, max) };
}
/** 一段代码：{ zh, en } 或者一段字。返回 { show（给人看的，原样）, canon（执行的） } */
function okCode(x, need, strict, errs, where) {
  var pr = pair(x), zh = pr.zh, en = pr.en;
  var a = zh || en, b = en || zh, ca = QL.questCanon(a), cb = QL.questCanon(b);
  if (pr.bad || !a.trim()) { errs.push(where + ": missing, or not text (a string or an array of lines) or { zh, en }"); return { show: "", canon: "" }; }
  if (a.length > Q.maxCode || b.length > Q.maxCode) errs.push(where + ": longer than " + Q.maxCode + " characters");
  if (ca !== cb) errs.push(where + ": the zh and en versions differ in more than whole-line // comments");
  if (/\/\*|`/.test(a + b)) errs.push(where + ": no /* */ comments and no backticks (whole-line // comments only)");
  if (ca.split("\n").some(function (l) { return /\/\//.test(l.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')); })) errs.push(where + ": // comments must be on lines of their own");
  if (need) need.forEach(function (fn) { if (!new RegExp("\\bfunction\\s+" + fn + "\\s*\\(").test(ca)) errs.push(where + ": function " + fn + " is missing"); });
  if (/\b(?:eval|Function|import|require|fetch|XMLHttpRequest|WebSocket|importScripts|postMessage|globalThis|self|window|document|Date|setTimeout|setInterval|performance)\b|Math\s*\.\s*random/.test(ca)) errs.push(where + ": uses something a challenge may not use (network, timers, clocks, eval, Math.random; use the rng you are given)");
  if (strict) { if (pr.single) { if (/[^\x00-\x7f]/.test(a)) errs.push(where + ": has non-ASCII text, so it needs both { zh, en }"); } else { if (!zh.trim() || !en.trim()) errs.push(where + ": needs both zh and en"); if (/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/.test(en)) errs.push(where + ".en: contains Chinese characters or full-width punctuation"); } }
  return { show: pr.single ? a : { zh: zh || en, en: en || zh }, canon: ca };
}
/** 把读进来的一道题核对一遍。返回 { spec, errors }：errors 不空时 spec 是 null。
 *  strict（校验脚本用）：文字要有中、英两份，英文那份里不能有中文；代码里有注释的也要两份（没有注释、全是 ASCII 的可以只写一份） */
QL.questCheck = function (raw, strict) {
  var errs = [], o = raw;
  if (!o || typeof o !== "object" || Array.isArray(o)) return { spec: null, errors: ["not an object"] };
  if (o.v !== 1) errs.push("v: must be 1");
  if (!(dayMs(o.day) === dayMs(o.day))) errs.push("day: must be a date like 2026-10-14");
  if (typeof o.id !== "string" || !IDRE.test(o.id)) errs.push("id: lower-case letters, digits and hyphens, 2 to 40 characters");
  var T = o.T, s = o.sets || {};
  if (!isInt(T) || T < 1 || T > 2000) errs.push("T: an integer from 1 to 2000");
  if (!isInt(s.pub) || s.pub < 1 || s.pub > Q.maxSets) errs.push("sets.pub: an integer from 1 to " + Q.maxSets);
  if (!isInt(s.fin) || s.fin < 1 || s.fin > Q.maxSets) errs.push("sets.fin: an integer from 1 to " + Q.maxSets);
  if (!isInt(s.K) || s.K < 1 || s.K > Q.maxK) errs.push("sets.K: an integer from 1 to " + Q.maxK);
  if (!isInt(s.seed) || s.seed < 0 || s.seed > 2147483647) errs.push("sets.seed: a non-negative integer");
  if (isInt(T) && isInt(s.pub) && isInt(s.fin) && isInt(s.K) && Math.max(s.pub, s.fin) * s.K * T > Q.maxCost) errs.push("sets: too much work (sets × K × T must not exceed " + Q.maxCost + ")");
  if (o.higher != null && typeof o.higher !== "boolean") errs.push("higher: true or false");
  if (o.digits != null && (!isInt(o.digits) || o.digits < 0 || o.digits > 6)) errs.push("digits: an integer from 0 to 6");
  var code = okCode(o.code, ["deal", "referee"], strict, errs, "code");
  var spec = { v: 1, day: String(o.day), id: String(o.id), title: okText(o.title, 60, true, strict, errs, "title"), summary: okText(o.summary, 200, true, strict, errs, "summary"), about: okText(o.about, 6000, true, strict, errs, "about"), note: okText(o.note, 6000, false, strict, errs, "note"),
    T: T, p: okP(o.p, errs, "p"), code: code.show, canon: code.canon, sets: { pub: s.pub, fin: s.fin, K: s.K, seed: s.seed }, higher: o.higher !== false, digits: o.digits == null ? 3 : o.digits, refs: [], starter: null, cid: "" };
  var refs = Array.isArray(o.refs) ? o.refs : [], seen = {};
  if (!refs.length || refs.length > Q.maxRefs) errs.push("refs: 1 to " + Q.maxRefs + " reference rules (the first one is the benchmark)");
  refs.slice(0, Q.maxRefs).forEach(function (r, i) {
    var w = "refs[" + i + "]"; if (!r || typeof r !== "object") { errs.push(w + ": not an object"); return; }
    if (typeof r.id !== "string" || !IDRE.test(r.id) || seen[r.id]) errs.push(w + ".id: missing, malformed or repeated");
    seen[r.id] = 1;
    var c = okCode(r.code, ["decide"], strict, errs, w + ".code");
    spec.refs.push({ id: String(r.id), name: okText(r.name, 40, true, strict, errs, w + ".name"), summary: okText(r.summary, 200, true, strict, errs, w + ".summary"), p: okP(r.p, errs, w + ".p"), code: c.show, canon: c.canon });
  });
  var st = o.starter;
  if (!st || typeof st !== "object") errs.push("starter: missing (the code a participant starts from)");
  else { var sc = okCode(st.code, ["decide"], strict, errs, "starter.code"); spec.starter = { p: okP(st.p, errs, "starter.p"), code: sc.show }; }
  if (errs.length) return { spec: null, errors: errs };
  // 这道题的"指纹"：裁判的代码、回合数、参数、几组几局、朝哪边算好，任何一样变了，以前交的规则就不算这道题的了
  var ks = Object.keys(spec.p).sort(), fp = [spec.canon, spec.T, ks.map(function (k) { return k + "=" + spec.p[k]; }).join(","), spec.sets.pub, spec.sets.fin, spec.sets.K, spec.sets.seed, spec.higher ? 1 : 0].join("|");
  spec.cid = spec.id + "." + qhash(fp).toString(36);
  return { spec: spec, errors: [] };
};
QL.questOk = function (raw) { return QL.questCheck(raw, false).spec; };

/* ---------- 几组数据的种子 ---------- */
/** kind: "pub"（公开的）或 "fin"（结算的）。salt：公开的用题目自己的种子，结算的用信标给的那串随机数。返回 n 个 32 位的种子 */
QL.questSeeds = function (kind, spec, salt, n) {
  var out = [], i;
  for (i = 0; i < n; i++) out.push(qhash(kind + "|" + spec.day + "|" + spec.cid + "|" + salt + "|" + i) | 0);
  return out;
};
QL.questPubSeeds = function (spec) { return QL.questSeeds("pub", spec, spec.sets.seed, spec.sets.pub); };
QL.questFinSeeds = function (spec, randomness) { return QL.questSeeds("fin", spec, String(randomness).toLowerCase(), spec.sets.fin); };

/* ---------- 交上来的规则 ---------- */
/** 从 GitHub 上取回的东西（hub.js 收拾过的）里挑出这道题的：当天（UTC）交的、指纹对得上的、代码像样的；
 *  同一个账号只算截止前最后交的那一条。touched：截止之后这条 Issue 又有过变动（可能是改了代码，也可能只是有人评论） */
QL.questEntries = function (items, spec) {
  var open = dayMs(spec.day), dead = open + 864e5, by = {};
  (items || []).forEach(function (it) {
    var m = it && it.meta; if (!m || it.kind !== "quest" || m.day !== spec.day || m.cid !== spec.cid || !it.user) return;
    if (typeof it.code !== "string" || !it.code.trim() || it.code.length > Q.maxCode || !/\bfunction\s+decide\s*\(/.test(it.code)) return;
    if (!(it.at >= open && it.at < dead)) return;
    var p = {}; if (m.p && typeof m.p === "object") Object.keys(m.p).slice(0, 12).forEach(function (k) { if (KEYRE.test(k) && finite(m.p[k])) p[k] = m.p[k]; });
    var e = { n: it.n | 0, user: String(it.user), avatar: it.avatar || "", url: it.url || "", at: it.at, name: typeof m.name === "string" ? m.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40) : "", p: p, code: it.code, touched: it.upd > dead, up: it.up | 0, tries: 1 };
    var old = by[e.user];
    if (old) e.tries = old.tries + 1;
    if (!old || e.at > old.at || (e.at === old.at && e.n > old.n)) by[e.user] = e; else old.tries = e.tries;
  });
  return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.at - b.at || a.n - b.n; });
};
/** 排名次。rows: [{ score, at, n, err }]；higher：分数是不是越高越好。同分时先交的在前。返回每一行的名次（从 1 起；没有成绩的是 0） */
QL.questRank = function (rows, higher) {
  var idx = [], rank = new Array(rows.length), i;
  for (i = 0; i < rows.length; i++) { rank[i] = 0; if (!rows[i].err && finite(rows[i].score)) idx.push(i); }
  idx.sort(function (a, b) { var d = higher ? rows[b].score - rows[a].score : rows[a].score - rows[b].score; return d || (rows[a].at || 0) - (rows[b].at || 0) || (rows[a].n || 0) - (rows[b].n || 0) || a - b; });
  for (i = 0; i < idx.length; i++) rank[idx[i]] = i + 1;
  return rank;
};

/* ---------- 任务：几条规则在几组数据上各打一遍 ---------- */
function meanSE(a, n) {
  var s1 = 0, s2 = 0, i; for (i = 0; i < n; i++) { s1 += a[i]; s2 += a[i] * a[i]; }
  var v = n > 1 ? Math.max(0, (s2 - s1 * s1 / n) / (n - 1)) : 0;
  return { mean: n ? s1 / n : NaN, se: n > 1 ? Math.sqrt(v / n) : NaN };
}
QL.jobs = QL.jobs || {};
/** m: { game: 裁判那段代码的编号, gp, T, K, seeds: [每组一个种子], entries: [{ id, p, slot }], cut, trace: 要不要记下第一组第一局的过程 }
 *  每条规则一行：{ id, mean, se（所有局合起来的平均数和标准误）, sets: [每一组的平均数], d, dse（和排在第一的那条逐局相减）, rounds, bad, err }
 *  cut：给了的话，前 cut 组和剩下的几组各算一份 { mean, se, d, dse }，放在 parts 里（结算的几组和公开的几组一次跑完）
 *  slot 决定规则自己的随机数从哪里来：同一条规则不管和谁一起跑，只要 slot 相同，结果就一样 */
QL.jobs.quest = function (m, CODE, progress) {
  var S = CODE[m.game];
  if (!S || typeof S.deal !== "function" || typeof S.referee !== "function") throw new Error("这道题的代码里没有 deal(T, rng, p) 和 referee(G, t, a) 这两个函数");
  var game = { deal: S.deal, show: typeof S.show === "function" ? S.show : null, referee: S.referee }, gp = QL.jobParams(m.gp);
  var T = Math.max(1, Math.min(2000, m.T | 0 || 1)), K = Math.max(1, Math.min(Q.maxK, m.K | 0 || 1)), seeds = (Array.isArray(m.seeds) ? m.seeds : []).slice(0, 2 * Q.maxSets).map(function (x) { return x | 0; }), n = seeds.length, N = n * K;
  if (!n) throw new Error("没有给数据的种子");
  if (N * T > 2 * Q.maxCost) throw new Error("这道题的计算量超过了上限");
  var cut = m.cut | 0, players = [], skipped = [], rows = [], trace = [], base = null;
  if (!(cut > 0 && cut < n)) cut = 0;
  (m.entries || []).slice(0, 12).forEach(function (en) {
    var R = CODE[en.id];
    if (!R || typeof R.decide !== "function") { skipped.push({ id: en.id, err: "代码里没有定义 decide(s, p, st) 函数" }); return; }
    players.push({ id: en.id, decide: R.decide, init: R.init || null, p: QL.jobParams(en.p), slot: Math.max(0, Math.min(63, en.slot | 0)) });
  });
  /** 第 lo 到 hi 局的平均数和标准误，以及和基准逐局相减之后的 */
  function part(sc, lo, hi, isBase) {
    var a = sc.subarray(lo, hi), ms = meanSE(a, hi - lo), o = { mean: ms.mean, se: ms.se, d: NaN, dse: NaN }, k;
    if (isBase) { o.d = 0; o.dse = 0; }
    else if (base) { var df = new Float64Array(hi - lo); for (k = lo; k < hi; k++) df[k - lo] = sc[k] - base[k]; var dm = meanSE(df, hi - lo); o.d = dm.mean; o.dse = dm.se; }
    return o;
  }
  players.forEach(function (pl, i) {
    var sc = new Float64Array(N), per = [], rounds = 0, bad = 0, err = "", log = [], s, k, e = 0;
    for (s = 0; s < n && !err; s++) {
      if (progress) progress({ id: pl.id, i: i, n: players.length, s: s, S: n });
      var sum = 0;
      for (k = 0; k < K; k++) {
        var ep;
        try { ep = QL.shopEpisode(game, gp, T, seeds[s], k, pl, pl.slot, m.trace && s === 0 && k === 0 ? log : null); }
        catch (x) { if (x && x.rule) { err = x.message; break; } throw x; }
        sc[e++] = ep.score; sum += ep.score; rounds += ep.rounds; bad += ep.bad;
      }
      if (!err) per.push(sum / K);
    }
    var row = { id: pl.id, mean: NaN, se: NaN, sets: err ? [] : per, d: NaN, dse: NaN, rounds: err ? NaN : rounds / N, bad: err || !rounds ? 0 : bad / rounds, err: err };
    if (!err) {
      var all = part(sc, 0, N, i === 0);
      row.mean = all.mean; row.se = all.se; row.d = all.d; row.dse = all.dse;
      if (cut) row.parts = [part(sc, 0, cut * K, i === 0), part(sc, cut * K, N, i === 0)];
      if (i === 0) base = sc;
    }
    rows.push(row);
    if (m.trace) trace.push({ id: pl.id, score: err ? NaN : sc[0], log: log });
  });
  return { T: T, K: K, n: n, cut: cut, rows: rows, skipped: skipped, trace: trace };
};
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_QUEST_INSTALL;
