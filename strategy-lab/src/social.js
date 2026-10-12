// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 策略实验室 · 大家一起打（引擎这一半）
 * 每日一局是哪一局、一局的动作怎么写成一行字、别人交来的一局怎么核对。
 * 核对靠重放：同一局（同一套玩法、同一组设定、同一个种子、第几局）交给同一个裁判，照着交来的动作再走一遍，
 * 得分以这一遍算出来的为准。所以交上来的只需要动作，不需要分数，也没法虚报分数。
 * 防不了的是"事后诸葛亮"：种子是公开的，有人可以先看完整局再回头挑动作。人亲手打的榜只适合图个乐。
 * 只在主线程里用（要先装好 human.js）；Node 里也能跑。 */
function QL_SOCIAL_INSTALL(QL) {
"use strict";
var WORLDS = QL.WORLDS;
var DAILY = ["g_sec", "g_lock", "g_bandit", "g_coin"];   // 每日一局按天轮换的四套玩法
function hashStr(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return QL.hash32(x); }
QL.hashStr = hashStr;

/* ---------- 日期（一律按 UTC 算：全站在同一时刻换到新的一天） ---------- */
/** 毫秒时间戳 → "2026-10-12" */
QL.dayOf = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
/** "2026-10-12" → 从 1970-01-01 算起的第几天；写法不对或者没有这一天时是 NaN */
QL.dayNum = function (day) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day)); if (!m) return NaN;
  var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return t === t && new Date(t).toISOString().slice(0, 10) === day ? Math.round(t / 864e5) : NaN;
};
QL.dayShift = function (day, d) { return QL.dayOf((QL.dayNum(day) + d) * 864e5); };
QL.dailyGames = function () { return DAILY.slice(); };
/** 这一天全站打的是哪一局：{ day, type, hp, seed, k, T }。只由日期决定 */
QL.dailySpec = function (day) {
  var n = QL.dayNum(day); if (!(n === n)) throw new Error("日期不对：" + day);
  var type = DAILY[((n % DAILY.length) + DAILY.length) % DAILY.length];
  var z = QL.humanSizes(type, QL.worldDefaults(type)).filter(function (x) { return x.id === "m"; })[0];
  return { day: day, type: type, hp: z.hp, seed: hashStr("daily|" + day) % 1000000, k: 0, T: WORLDS[type].Tof(z.hp) };
};

/* ---------- 一局的动作写成一行字 ---------- */
/** [1, 0, NaN, 0.25] → "1,0,,0.25"。裁判没问的回合（NaN）留空 */
QL.actsPack = function (acts) {
  return (acts || []).map(function (a) { return typeof a === "number" && a === a && isFinite(a) ? String(a) : ""; }).join(",");
};
/** 反过来。写法不对、比这一局的回合数还长时返回 null */
QL.actsUnpack = function (str, T) {
  if (typeof str !== "string" || str.length > 40000) return null;
  if (str === "") return [];
  var parts = str.split(","), out = [], i;
  if (parts.length > T) return null;
  for (i = 0; i < parts.length; i++) {
    var s = parts[i];
    if (s === "") { out.push(NaN); continue; }
    if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
    var v = +s; if (!isFinite(v)) return null;
    out.push(v);
  }
  return out;
};
/** 照着动作把指定的那一局重放一遍：{ ok, score, acts, why }。没打完的、重放出错的都不算数 */
QL.humanReplay = function (spec, acts) {
  try {
    if (!Array.isArray(acts)) return { ok: false, why: "bad" };
    var B = QL.humanEpisode(spec.type, spec.hp, spec.seed, spec.k | 0), st = QL.humanStep(B, acts);
    if (!st.done) return { ok: false, why: "short" };
    return { ok: true, score: st.score, acts: st.acts };
  } catch (e) { return { ok: false, why: "error" }; }
};
/** 把一组成绩排成名次。rows: [{ score, at }]；lower：分数越低越好。并列的按交得早的在前；返回每一行的名次（从 1 起，并列同名次） */
QL.rankRows = function (rows, lower) {
  var idx = rows.map(function (_, i) { return i; }), rank = new Array(rows.length), i;
  idx.sort(function (a, b) { var d = lower ? rows[a].score - rows[b].score : rows[b].score - rows[a].score; return d || (rows[a].at || 0) - (rows[b].at || 0) || a - b; });
  for (i = 0; i < idx.length; i++) rank[idx[i]] = i > 0 && rows[idx[i]].score === rows[idx[i - 1]].score ? rank[idx[i - 1]] : i + 1;
  return { order: idx, rank: rank };
};
return { daily: DAILY };
}
if (typeof module !== "undefined" && module.exports) module.exports = QL_SOCIAL_INSTALL;
