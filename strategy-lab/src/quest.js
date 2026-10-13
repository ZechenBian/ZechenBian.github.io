// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 每日一题（引擎这一半）
 * 一道题 = 一套带裁判的玩法（和世界工坊里的玩法是同一个接口：deal / show / referee，见 shop.js），加上几条基准规则。
 * 大家各写一条规则（decide），在"公开的几组数据"上随便试；封起来（加密）交上去以后，到截止的时候换"结算的几组数据"排名。
 *
 * 一组数据 = 一个种子发出来的 K 局。公开的几组，种子由题目自己定，谁都能算；
 * 结算的几组，种子取自一个公共随机信标（drand）在截止之后那一刻发布的随机数：截止之前谁也算不出来，
 * 截止之后人人取到的都是同一个数，所以结算的程序和每个人的浏览器用的是同一批数据。
 *
 * 交上来的规则别人看不到，截止之后也只有结算的程序解得开（daily/settle.js，私钥只在它那里）；它算完分，公布成绩和名字。
 * 页面不执行别人的规则，只把基准规则和自己交的那一条重算一遍，和公布的对一对。封、认结果、排名次的办法都在这个文件里。
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
/** 一组数据的种子是四个 32 位的整数：[发牌的种子, 发牌的批次, 规则自己的随机数的种子, 批次]（怎么用见 shop.js 的 shopEpisode）。
 *  kind: "pub"（公开的）或 "fin"（结算的）。salts：四段字，各管一个数。返回 n 组。
 *  结算时这四段是信标那个随机数（256 位）的四截，互不相干。这样做是因为规则能从 s.rnd() 给的数里反推出自己那两个数：
 *  要是发牌用的也是同一个数，或者几个数是从同一个 32 位的中间结果里出来的，规则就能把这一局藏起来的东西自己重算一遍。 */
QL.questSeeds = function (kind, spec, salts, n) {
  var out = [], i, j, one;
  for (i = 0; i < n; i++) { one = []; for (j = 0; j < 4; j++) one.push(qhash(kind + "|" + spec.day + "|" + spec.cid + "|" + i + "|" + j + "|" + salts[j]) | 0); out.push(one); }
  return out;
};
QL.questPubSeeds = function (spec) { var s = String(spec.sets.seed); return QL.questSeeds("pub", spec, [s, s, s, s], spec.sets.pub); };
QL.questFinSeeds = function (spec, randomness) {
  var r = String(randomness).toLowerCase();
  return QL.questSeeds("fin", spec, /^[0-9a-f]{64}$/.test(r) ? [r.slice(0, 16), r.slice(16, 32), r.slice(32, 48), r.slice(48)] : [r, r, r, r], spec.sets.fin);
};

/* ---------- 这一天是哪一道题 ---------- */
/** 清单里有这一天，就是它自己的题；没有，就从更早的题里按日期挑一道（人人挑到的是同一道）。
 *  返回 { src, rerun, first }：src 是题目文件的日期（一道也挑不出来时是 ""），rerun 是重温的那道题原来的日子（不是重温时是 ""），first 是清单里的第一天 */
QL.questPick = function (days, day) {
  var list = (Array.isArray(days) ? days : []).filter(function (d) { return typeof d === "string" && dayMs(d) === dayMs(d); }).sort(), first = list.length ? list[0] : "";
  if (list.indexOf(day) >= 0) return { src: day, rerun: "", first: first };
  var past = list.filter(function (d) { return d < day; });
  if (!past.length) return { src: "", rerun: "", first: first };
  var src = past[qhash("rerun|" + day) % past.length];
  return { src: src, rerun: src, first: first };
};

/* ---------- 封起来交 ---------- */
/* 交上去的规则是加密的，别人看不到；截止之后也只有结算的程序解得开（daily/settle.js，在仓库的 GitHub Actions 里跑），榜上只公布成绩和名字。
 * 做法：公钥在 daily/quest-public.pem（P-256）。交的时候现生成一对一次性的密钥，和公钥做 ECDH，再用 HKDF-SHA256 导出一把 AES-256-GCM 的密钥，
 * 把 { 名字, 参数, 代码 } 加密。全部用浏览器自带的 WebCrypto，没有第三方的库。
 * 封好的一份 = base64url( 版本 1 字节 | 标志 1 字节（1：正文压缩过）| 一次性公钥 65 字节 | 随机数 12 字节 | 密文连同校验 )。
 * 日期和题目的指纹写进了导出密钥用的那串字里，所以这一份挪到别的日子、别的题上解不开。 */
Q.seal = { ver: 1, head: 79, min: 128, max: 60000, settlers: ["github-actions[bot]"] };
QL.questSealInfo = function (day, cid) { return "strategy-lab/quest/v1|" + day + "|" + cid; };
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** 字节 → base64url（不带等号）；反过来，写得不对时返回 null */
function b64u(bytes) {
  var s = "", i, n = bytes.length, a, b, c;
  for (i = 0; i < n; i += 3) {
    a = bytes[i]; b = i + 1 < n ? bytes[i + 1] : 0; c = i + 2 < n ? bytes[i + 2] : 0;
    s += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | (b >> 4)) + (i + 1 < n ? B64.charAt(((b & 15) << 2) | (c >> 6)) : "") + (i + 2 < n ? B64.charAt(c & 63) : "");
  }
  return s;
}
function unb64u(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) return null;
  var n = Math.floor(str.length * 3 / 4), out = new Uint8Array(n), i, j = 0, v = [0, 0, 0, 0], k;
  for (i = 0; i < str.length; i += 4) {
    for (k = 0; k < 4; k++) v[k] = i + k < str.length ? B64.indexOf(str.charAt(i + k)) : 0;
    if (j < n) out[j++] = (v[0] << 2) | (v[1] >> 4);
    if (j < n) out[j++] = ((v[1] & 15) << 4) | (v[2] >> 2);
    if (j < n) out[j++] = ((v[2] & 3) << 6) | v[3];
  }
  return out;
}
QL.questB64 = { enc: b64u, dec: unb64u };
function hexOf(bytes) { var s = "", i; for (i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16); return s; }
/** PEM 格式的公钥 → DER 的字节；不像样时返回 null */
QL.questPem = function (pem) {
  var m = /-----BEGIN PUBLIC KEY-----([A-Za-z0-9+\/=\s]+)-----END PUBLIC KEY-----/.exec(String(pem == null ? "" : pem)); if (!m) return null;
  var der = unb64u(m[1].replace(/\s+/g, "").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"));
  return der && der.length >= 80 && der.length <= 200 ? der : null;
};
/** 封好的一份，样子对不对（只看样子，解不解得开要等结算） */
QL.questBoxOk = function (box) { return typeof box === "string" && box.length >= Q.seal.min && box.length <= Q.seal.max && /^[A-Za-z0-9_-]+$/.test(box) && box.length % 4 !== 1; };
/** 压缩（浏览器不会就不压，返回 null） */
function deflate(bytes) {
  try {
    if (typeof CompressionStream !== "function" || typeof Response !== "function" || typeof Blob !== "function") return Promise.resolve(null);
    return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer().then(function (b) { return new Uint8Array(b); }, function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}
/** 把一份东西封起来。spki：公钥（DER 的字节）；obj：要封的东西；info：questSealInfo 给的那串字。
 *  返回 { box, ch }：box 是封好的一份，ch 是它的 SHA-256 的前 16 位（榜上拿它认出"这一行是我的"）。这个环境不会加密时拒绝，原因是 "no-crypto" */
QL.questSeal = function (spki, obj, info) {
  var C = typeof crypto !== "undefined" && crypto && crypto.subtle && typeof TextEncoder === "function" ? crypto : null;
  if (!C) return Promise.reject(new Error("no-crypto"));
  var S = C.subtle, te = new TextEncoder(), plain = te.encode(JSON.stringify(obj)), infoB = te.encode(info), iv = C.getRandomValues(new Uint8Array(12)), flags = 0, pubRaw, ephRaw;
  return S.importKey("spki", spki, { name: "ECDH", namedCurve: "P-256" }, true, []).then(function (pub) {
    return Promise.all([S.exportKey("raw", pub), S.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), pub]);
  }).then(function (a) {
    pubRaw = new Uint8Array(a[0]);
    return Promise.all([S.exportKey("raw", a[1].publicKey), S.deriveBits({ name: "ECDH", public: a[2] }, a[1].privateKey, 256)]);
  }).then(function (a) {
    ephRaw = new Uint8Array(a[0]);
    if (pubRaw.length !== 65 || ephRaw.length !== 65) throw new Error("bad-key");
    return S.importKey("raw", a[1], "HKDF", false, ["deriveKey"]);
  }).then(function (ikm) {
    var salt = new Uint8Array(130); salt.set(ephRaw, 0); salt.set(pubRaw, 65);
    return S.deriveKey({ name: "HKDF", hash: "SHA-256", salt: salt, info: infoB }, ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  }).then(function (key) {
    return deflate(plain).then(function (z) {
      if (z && z.length && z.length < plain.length) { plain = z; flags = 1; }
      return S.encrypt({ name: "AES-GCM", iv: iv, additionalData: infoB }, key, plain);
    });
  }).then(function (ct) {
    ct = new Uint8Array(ct);
    var out = new Uint8Array(Q.seal.head + ct.length); out[0] = Q.seal.ver; out[1] = flags; out.set(ephRaw, 2); out.set(iv, 67); out.set(ct, Q.seal.head);
    var box = b64u(out);
    if (!QL.questBoxOk(box)) throw new Error("too-long");
    return S.digest("SHA-256", te.encode(box)).then(function (h) { return { box: box, ch: hexOf(new Uint8Array(h)).slice(0, 16) }; });
  });
};

/* ---------- 交上来的规则 ---------- */
/** 从 GitHub 上取回的东西（hub.js 收拾过的）里挑出这道题的：当天（UTC）交的、指纹对得上的、封好的一份样子像样的；
 *  同一个账号只算截止前最后交的那一条。封着的东西这里打不开，所以只知道谁交了、什么时候交的。
 *  touched：截止之后这条 Issue 又有过变动（可能是改了正文，也可能只是有人评论；结算的程序会去查到底是哪一种） */
QL.questEntries = function (items, spec) {
  var open = dayMs(spec.day), dead = open + 864e5, by = {};
  (items || []).forEach(function (it) {
    var m = it && it.meta; if (!m || it.kind !== "quest" || m.day !== spec.day || m.cid !== spec.cid || m.v !== 2 || !it.user) return;
    if (!QL.questBoxOk(m.box) || !(it.at >= open && it.at < dead)) return;
    var e = { n: it.n | 0, user: String(it.user), uid: it.uid | 0, avatar: it.avatar || "", url: it.url || "", at: it.at, box: m.box, kid: typeof m.kid === "string" ? m.kid.slice(0, 16) : "", touched: it.upd > dead, tries: 1 };
    var old = by[e.user];
    if (old) e.tries = old.tries + 1;
    if (!old || e.at > old.at || (e.at === old.at && e.n > old.n)) by[e.user] = e; else old.tries = e.tries;
  });
  return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.at - b.at || a.n - b.n; });
};

/* ---------- 结算的结果 ---------- */
/* 结算的程序把结果贴成一条 Issue（类别 result）。页面只认"仓库的 Actions 机器人"和仓库主人发的：别人发一条长得一样的没有用。
 * 结果里有每个人的成绩和名字，没有代码。 */
function numOr(x) { return finite(x) ? x : NaN; }
function partOf(x, full) { if (!x || typeof x !== "object") return null; var o = { mean: numOr(x.mean), se: numOr(x.se), d: numOr(x.d), dse: numOr(x.dse) }; return o.mean === o.mean && (!full || o.se === o.se) ? o : null; }
var USERRE = /^[A-Za-z0-9-]{1,39}(\[bot\])?$/;   // GitHub 账号的样子
function cleanName(s, n) { return typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, n) : ""; }
/** 一份结果的内容收拾成这里用的样子；对不上这道题、缺东少西的返回 null */
QL.questResultNorm = function (m, spec) {
  if (!m || typeof m !== "object" || m.v !== 1 || m.day !== spec.day || m.cid !== spec.cid) return null;
  if (m.round !== QL.questRound(spec.day) || !/^[0-9a-f]{64}$/.test(m.randomness) || !Array.isArray(m.rows) || m.rows.length > 400 || !Array.isArray(m.refs)) return null;
  var rows = [], ok = true, seen = {};
  m.rows.forEach(function (r) {
    if (!r || typeof r !== "object" || !isInt(r.n) || r.n < 1 || seen[r.n] || typeof r.user !== "string" || !USERRE.test(r.user) || !finite(r.at)) { ok = false; return; }
    seen[r.n] = 1;
    rows.push({ n: r.n, user: r.user, uid: isInt(r.uid) && r.uid > 0 ? r.uid : 0, at: r.at, name: cleanName(r.name, 40), ch: typeof r.ch === "string" && /^[0-9a-f]{16}$/.test(r.ch) ? r.ch : "",
      fin: partOf(r.fin, true), pub: partOf(r.pub, false), err: cleanName(r.err, 160), dup: isInt(r.dup) && r.dup > 0 ? r.dup : 0, dupUser: typeof r.dupUser === "string" && USERRE.test(r.dupUser) ? r.dupUser : "", tries: isInt(r.tries) && r.tries > 0 ? r.tries : 1 });
  });
  if (!ok) return null;
  var refs = m.refs.slice(0, Q.maxRefs).map(function (r) { return r && typeof r === "object" && typeof r.id === "string" ? { id: r.id.slice(0, 40), fin: partOf(r.fin, true), pub: partOf(r.pub, false) } : null; }).filter(Boolean);
  var sk = m.skipped && typeof m.skipped === "object" ? m.skipped : {}, cnt = function (k) { return isInt(sk[k]) && sk[k] > 0 ? sk[k] : 0; };
  return { day: spec.day, cid: spec.cid, round: m.round, randomness: m.randomness, at: finite(m.at) ? m.at : 0, rows: rows, refs: refs,
    skipped: { edited: cnt("edited"), sealed: cnt("sealed"), more: cnt("more") }, issue: 0, url: "", posted: 0, by: "" };
};
/** 从取回的东西里找出这道题的结算结果：只认 trusted 里的账号发的、截止之后发的；有几份就用最新的。没有就是 null */
QL.questResult = function (items, spec, trusted) {
  var dead = dayMs(spec.day) + 864e5, best = null;
  (items || []).forEach(function (it) {
    if (!it || it.kind !== "result" || (trusted || []).indexOf(it.user) < 0 || !(it.at >= dead)) return;
    var r = QL.questResultNorm(it.meta, spec); if (!r) return;
    r.issue = it.n | 0; r.url = it.url || ""; r.posted = it.at; r.by = it.user;
    if (!best || r.posted > best.posted || (r.posted === best.posted && r.issue > best.issue)) best = r;
  });
  return best;
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
  var T = Math.max(1, Math.min(2000, m.T | 0 || 1)), K = Math.max(1, Math.min(Q.maxK, m.K | 0 || 1)), seeds = (Array.isArray(m.seeds) ? m.seeds : []).slice(0, 2 * Q.maxSets).map(function (x) { return Array.isArray(x) && x.length === 4 ? [x[0] | 0, x[1] | 0, x[2] | 0, x[3] | 0] : x | 0; }), n = seeds.length, N = n * K;
  if (!n) throw new Error("没有给数据的种子");
  if (N * T > 2 * Q.maxCost) throw new Error("这道题的计算量超过了上限");
  var cut = m.cut | 0, players = [], skipped = [], rows = [], trace = [], base = null;
  if (!(cut > 0 && cut < n)) cut = 0;
  (m.entries || []).slice(0, 12).forEach(function (en) {
    var R = CODE[en.id];
    if (!R || typeof R.decide !== "function") { skipped.push({ id: en.id, err: "代码里没有定义 decide(s, p, st) 函数" }); return; }
    // 冻住：规则被调用时 this 就是这份记录，不冻的话它可以改自己的编号、参数和随机数的位置
    players.push(Object.freeze({ id: en.id, decide: R.decide, init: R.init || null, p: QL.jobParams(en.p), slot: Math.max(0, Math.min(63, en.slot | 0)) }));
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
