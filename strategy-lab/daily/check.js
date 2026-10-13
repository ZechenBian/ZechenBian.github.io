#!/usr/bin/env node
// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 每日一题的校验脚本。只用 Node 自带的模块，不需要安装任何东西（要 Node 22.8 以上，见 engine.js）。
 *
 *   node daily/check.js daily/q/2026-10-14.json …   核对这几道题
 *   node daily/check.js --all                        核对 daily/q/ 里的每一道题，并核对 index.json
 *   node daily/check.js --review 文件…               核对之后，把这几道题印成一份给人审的 Markdown（贴进 PR 的正文）
 *   node daily/check.js --index                      按 daily/q/ 里现有的文件重写 daily/index.json
 *   node daily/check.js --try=规则.js [--p='{"r":8}'] 文件…   出题的时候用：把一条你自己写的规则放到这几道题上试，看它比基准规则好多少
 *
 * 核对些什么：
 *   1. 格式（和页面用的是同一份检查：src/quest.js 的 QL.questCheck，严格模式：中、英两份都要有）
 *   2. 裁判、基准规则、起始代码都编得过、跑得通：放进和页面后台线程一模一样的程序里执行（src/jobs.js 拼出来的那一份）
 *   3. 结果可复现：同样的种子跑两遍，一个数都不差
 *   4. 分得出高下：基准规则之间在"公开的几组"上的差别要明显大过噪声；换一批数据，名次大体不变
 *   5. 不慢：在这台机器上一条规则跑完公开的几组，不超过限定的时间
 *   6. 裁判受得了乱报的数：不是数、极大的正负数、小数、范围外的整数，裁判都要回一个有限的数
 * 有一条不过，退出码就是 1。 */
"use strict";
const fs = require("fs"), path = require("path");
const { QL, QLJobs, job } = require("./engine.js");
const QDIR = path.join(__dirname, "q"), INDEX = path.join(__dirname, "index.json");
const Q = QL.QUEST;

const LIMIT_MS = 4000;      // 一条规则跑完公开的几组，最多这么久（毫秒）
const DRAWS = Math.max(1, +process.env.QUEST_DRAWS || 30);   // 换多少批数据来看名次稳不稳（测试里用环境变量调小）
const args = process.argv.slice(2), flags = new Set(args.filter(a => a.startsWith("--"))), files0 = args.filter(a => !a.startsWith("--"));

function codesOf(spec, extra) { return [{ id: "game", code: spec.canon }].concat(spec.refs.map(r => ({ id: "ref:" + r.id, code: r.canon })), extra || []); }
function entriesOf(spec, extra) { return spec.refs.map((r, i) => ({ id: "ref:" + r.id, p: r.p, slot: i })).concat(extra || []); }
function run(spec, seeds, extraCodes, extraEntries, trace) {
  return job(codesOf(spec, extraCodes), { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: spec.sets.K, seeds, entries: entriesOf(spec, extraEntries), trace: !!trace });
}
const f3 = x => (x === x ? (Math.abs(x) >= 1000 ? x.toFixed(1) : x.toFixed(3)) : "—");
const sgn = x => (x > 0 ? "+" : "") + f3(x);

/** 核对一道题。返回 { file, spec, errors, warnings, pub, stab, ms, trace } */
function check(file) {
  const out = { file, spec: null, errors: [], warnings: [], pub: null, stab: null, ms: 0, trace: null };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { out.errors.push("读不出来：" + e.message); return out; }
  const c = QL.questCheck(raw, true);
  if (!c.spec) { out.errors = c.errors.slice(); return out; }
  const spec = out.spec = c.spec, base = path.basename(file, ".json");
  if (base !== spec.day) out.errors.push("文件名（" + base + "）和题目里写的日期（" + spec.day + "）对不上");
  // 题面是按手册那样排版的：两个 $ 之间的字会被当成公式。落单的 $、紧跟着数字的 $ 多半是想写钱数
  ["title", "summary", "about", "note"].forEach(k => ["zh", "en"].forEach(l => { const t = QL.questText(spec[k], l), c = (t.match(/\$/g) || []).length; if (c % 2 || /\$\s?\d/.test(t)) out.warnings.push(k + "." + l + " 里的 $ 看起来不是公式：两个 $ 之间的字会被当成公式来排。写钱数请不要用 $"); }));
  for (const code of [spec.canon].concat(spec.refs.map(r => r.canon), [QL.questCanon(QL.questText(spec.starter.code, "zh"))])) { const bad = QLJobs.syntax(code); if (bad) out.errors.push("代码有语法错误：" + bad); }
  if (QL.questCanon(QL.questText(spec.starter.code, "zh")) !== QL.questCanon(QL.questText(spec.starter.code, "en"))) out.errors.push("起始代码的中、英两份，去掉注释以后不一样");
  if (out.errors.length) return out;
  const starter = { id: "starter", code: QL.questCanon(QL.questText(spec.starter.code, "zh")) }, starterEntry = { id: "starter", p: spec.starter.p, slot: Q.slot };
  const pubSeeds = QL.questPubSeeds(spec);
  let r1, r2;
  try {
    const t0 = performance.now();
    r1 = run(spec, pubSeeds, [starter], [starterEntry], true);
    out.ms = (performance.now() - t0) / (spec.refs.length + 1);
    r2 = run(spec, pubSeeds, [starter], [starterEntry], true);
  } catch (e) { out.errors.push("没有跑通：" + e.message); return out; }
  if (JSON.stringify(r1) !== JSON.stringify(r2)) out.errors.push("同样的种子跑两遍，结果不一样（代码里用了 rng 以外的随机数，或者在局与局之间留了状态）");
  (r1.skipped || []).forEach(s => out.errors.push(s.id + " 没能上场：" + s.err));
  r1.rows.forEach(r => {
    if (r.err) out.errors.push(r.id + " 中途出错：" + r.err);
    else if (!(r.mean === r.mean) || !isFinite(r.mean)) out.errors.push(r.id + " 的得分不是有限的数");
    else if (r.bad > 0) out.errors.push(r.id + " 有 " + (100 * r.bad).toFixed(1) + "% 的回合报的不是数");
  });
  if (out.ms > LIMIT_MS) out.errors.push("太慢：一条规则跑完公开的几组用了 " + Math.round(out.ms) + " 毫秒（上限 " + LIMIT_MS + "）。把 sets.K 或者 T 调小");
  out.pub = r1; out.trace = (r1.trace || [])[0] || null;
  if (out.errors.length) return out;
  // 裁判受不受得了乱报的数：不是数、极大的正负数、小数、范围外的整数。裁判对什么都要回一个有限的数，不能出错
  try {
    const probes = [["probe-nan", "function decide(s, p) {\n  return NaN;\n}"], ["probe-huge", "function decide(s, p) {\n  return s.t % 2 ? 1e300 : -1e300;\n}"],
      ["probe-frac", "function decide(s, p) {\n  return s.rnd() * 6 - 2;\n}"], ["probe-int", "function decide(s, p) {\n  return Math.floor(s.rnd() * 7) - 2;\n}"]];
    const pr = job(codesOf(spec, probes.map(x => ({ id: x[0], code: x[1] }))), { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: Math.min(spec.sets.K, 200), seeds: pubSeeds.slice(0, 2), entries: probes.map((x, i) => ({ id: x[0], p: {}, slot: Q.slot + 1 + i })) });
    pr.rows.forEach(r => { if (r.err) out.errors.push("乱报数的规则（" + r.id + "）中途出错：" + r.err); else if (!isFinite(r.mean)) out.errors.push("乱报数的规则（" + r.id + "）得分不是有限的数"); });
  } catch (e) { out.errors.push("裁判受不了乱报的数（不是数、极大的正负数、小数、范围外的整数）：" + e.message); }
  if (out.errors.length) return out;
  // 亮给规则看的东西：超出"一层、256 个数、32 个字段、80 个字"的部分会被裁掉，题目里不该指望它
  try {
    const G = new Function('"use strict";\n' + spec.canon + '\n;return { deal: deal, show: typeof show === "function" ? show : null };')();
    if (G.show) for (let k = 0; k < 3; k++) {
      const g = G.deal(spec.T, new QL.RNG(pubSeeds[0], k, 9101), Object.freeze(Object.assign({}, spec.p))), v = G.show(g, 0), seen = QL.shopSee(v);
      if (Array.isArray(v) && v.length > 256) out.warnings.push("show 返回的数组超过 256 个数，后面的规则看不到");
      if (v && typeof v === "object" && !Array.isArray(v)) { if (Object.keys(v).length > 32) out.warnings.push("show 返回的对象超过 32 个字段，后面的规则看不到"); Object.keys(seen).forEach(key => { const x = v[key]; if (x && typeof x === "object" && !Array.isArray(x) && !ArrayBuffer.isView(x)) out.warnings.push("show 返回的 " + key + " 是嵌套的对象，规则看到的是 NaN"); }); }
    }
  } catch (e) { out.warnings.push("没能单独检查 show 的返回值：" + e.message); }
  // 分得出高下吗：基准（第一条）和其余几条在公开的几组上逐局相减，最明显的那个差要超过 3 个标准误
  const rows = r1.rows.filter(r => r.id !== "starter"), zs = rows.slice(1).map(r => (r.dse > 0 ? Math.abs(r.d) / r.dse : 0)), zmax = zs.length ? Math.max.apply(null, zs) : 0;
  if (rows.length >= 2 && zmax < 3) out.errors.push("分不出高下：基准规则之间的差别在公开的几组上最多只有 " + zmax.toFixed(1) + " 个标准误（要 3 个以上）。把 sets.K 调大，或者换一组差别更大的基准规则");
  if (rows.length < 2) out.errors.push("只有一条基准规则：至少要两条（一条基准，一条看得出道理的改进），不然没法检查这道题分不分得出高下");
  // 换一批数据，名次稳不稳
  const dir = spec.higher ? -1 : 1, order = rs => rs.slice().sort((a, b) => dir * (a.mean - b.mean)).map(r => r.id).join(" > "), pubOrder = order(rows), best = pubOrder.split(" > ")[0];
  let same = 0, bestSame = 0;
  for (let d = 0; d < DRAWS; d++) {
    const rr = run(spec, QL.questFinSeeds(spec, "check-" + d)).rows;
    if (order(rr) === pubOrder) same++;
    if (order(rr).split(" > ")[0] === best) bestSame++;
  }
  out.stab = { draws: DRAWS, same, bestSame, order: pubOrder };
  if (rows.length >= 2 && bestSame < 0.8 * DRAWS) out.warnings.push("换一批结算数据，最好的那条基准规则只在 " + bestSame + " / " + DRAWS + " 批里还是最好的。考虑把 sets.K 调大");
  // 公开的和结算的种子不该撞上
  const fin = QL.questFinSeeds(spec, "0".repeat(64));
  if (new Set(pubSeeds.concat(fin)).size !== pubSeeds.length + fin.length) out.warnings.push("公开的种子和一组结算的种子撞上了（极少见，换一个 sets.seed）");
  return out;
}

function listAll() { return fs.existsSync(QDIR) ? fs.readdirSync(QDIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map(f => path.join(QDIR, f)) : []; }
function report(r) {
  const tag = r.errors.length ? "不通过" : r.warnings.length ? "通过（有提醒）" : "通过";
  console.log((r.errors.length ? "✗ " : "✓ ") + path.relative(process.cwd(), r.file) + "  " + tag + (r.spec ? "  「" + QL.questText(r.spec.title, "zh") + "」" : ""));
  r.errors.forEach(e => console.log("    错误：" + e));
  r.warnings.forEach(e => console.log("    提醒：" + e));
  if (r.pub && !r.errors.length) {
    r.pub.rows.forEach(x => console.log("    " + x.id.padEnd(18) + " " + f3(x.mean).padStart(10) + " ± " + f3(x.se) + (x.d === x.d && x.id !== r.pub.rows[0].id ? "   比基准 " + sgn(x.d) + " ± " + f3(x.dse) : "")));
    if (r.stab) console.log("    换 " + r.stab.draws + " 批结算数据：名次和公开的完全一样 " + r.stab.same + " 批，最好的还是同一条 " + r.stab.bestSame + " 批。每条规则 " + Math.round(r.ms) + " 毫秒");
  }
}
function seeText(v) { if (typeof v === "number") return v === v ? String(+v.toPrecision(6)) : "—"; let s; try { s = JSON.stringify(v, (k, x) => (typeof x === "number" ? (x === x ? +x.toPrecision(5) : null) : x)); } catch (e) { s = String(v); } return s.length > 70 ? s.slice(0, 67) + "…" : s; }
/** 给人审的一份：题面（中、英）、基准规则在公开的几组上的成绩、基准规则的第一局是怎么打的 */
function review(r) {
  const s = r.spec, L = [], T = x => QL.questText(x, "zh"), E = x => QL.questText(x, "en");
  L.push("## " + s.day + " · " + T(s.title) + " / " + E(s.title), "");
  L.push("`" + s.id + "`　每局最多 " + s.T + " 回合　公开 " + s.sets.pub + " 组、结算 " + s.sets.fin + " 组，每组 " + s.sets.K + " 局　" + (s.higher ? "分数越高越好" : "分数越低越好") + (Object.keys(s.p).length ? "　参数 " + JSON.stringify(s.p) : ""), "");
  L.push("**" + T(s.summary) + "**", "", T(s.about), "");
  if (T(s.note)) L.push("> " + T(s.note).replace(/\n/g, "\n> "), "");
  L.push("<details><summary>English</summary>", "", "**" + E(s.summary) + "**", "", E(s.about), "", E(s.note) ? "> " + E(s.note).replace(/\n/g, "\n> ") : "", "", "</details>", "");
  L.push("| 基准规则 | 公开的几组上平均每局 | 比基准 | 各组的平均（最低到最高） |", "|---|---|---|---|");
  r.pub.rows.forEach((x, i) => { const ref = s.refs.filter(q => "ref:" + q.id === x.id)[0], name = ref ? T(ref.name) + (i === 0 ? "（基准）" : "") : "起始代码"; L.push("| " + name + " | " + f3(x.mean) + " ± " + f3(x.se) + " | " + (i === 0 ? "—" : sgn(x.d) + " ± " + f3(x.dse)) + " | " + f3(Math.min.apply(null, x.sets)) + " 到 " + f3(Math.max.apply(null, x.sets)) + " |"); });
  L.push("", "换 " + r.stab.draws + " 批结算数据：名次和公开的完全一样 " + r.stab.same + " 批，最好的还是同一条 " + r.stab.bestSame + " 批。", "");
  if (r.warnings.length) L.push(r.warnings.map(w => "- 提醒：" + w).join("\n"), "");
  if (r.trace && r.trace.log && r.trace.log.length) {
    L.push("<details><summary>基准规则的第一局（前 " + Math.min(12, r.trace.log.length) + " 回合）</summary>", "", "| 回合 | 规则看到的 | 规则报的数 | 这一回合的得分 |", "|---|---|---|---|");
    r.trace.log.slice(0, 12).forEach((o, t) => L.push("| " + (t + 1) + " | `" + seeText(o.see).replace(/\|/g, "\\|") + "` | " + (o.a === o.a ? +o.a.toPrecision(6) : "不是数") + " | " + sgn(o.gain) + " |"));
    L.push("", "</details>", "");
  }
  L.push("<details><summary>裁判的代码</summary>", "", "```js", T(s.code), "```", "", "</details>", "");
  return L.join("\n");
}

if (flags.has("--index")) {
  const days = listAll().map(f => path.basename(f, ".json"));
  fs.writeFileSync(INDEX, JSON.stringify({ v: 1, days }) + "\n");
  console.log("index.json：" + days.length + " 天" + (days.length ? "（" + days[0] + " 到 " + days[days.length - 1] + "）" : ""));
  if (!files0.length && !flags.has("--all")) process.exit(0);
}
const files = flags.has("--all") ? listAll() : files0.map(f => path.resolve(f));
if (!files.length) { console.log("用法：node daily/check.js [--all] [--review] [--index] 文件…"); process.exit(files0.length || flags.has("--all") ? 0 : 1); }
const results = files.map(check);
let bad = results.filter(r => r.errors.length).length;
if (flags.has("--review")) {
  results.forEach(r => { if (r.errors.length) { console.log("## " + path.basename(r.file) + "：不通过\n\n" + r.errors.map(e => "- " + e).join("\n") + "\n"); } else console.log(review(r)); });
} else results.forEach(report);
// 出题的时候用：把一条自己写的规则放上去试。它不进题目文件，只是用来估计"基准规则上面还有多少余地"
const opt = name => { const a = args.filter(x => x.startsWith("--" + name + "="))[0]; return a ? a.slice(name.length + 3) : null; };
if (opt("try")) {
  let tp = {}, code = "";
  try { tp = opt("p") ? JSON.parse(opt("p")) : {}; code = QL.questCanon(fs.readFileSync(opt("try"), "utf8")); } catch (e) { console.log("--try / --p 读不出来：" + e.message); process.exit(1); }
  const TRY_DRAWS = Math.min(DRAWS, 5);
  results.filter(r => r.spec && !r.errors.length && r.pub).forEach(r => {
    const spec = r.spec, extraC = [{ id: "try", code }], extraE = [{ id: "try", p: tp, slot: Q.slot }];
    console.log("  试 " + path.basename(opt("try")) + (Object.keys(tp).length ? " " + JSON.stringify(tp) : "") + " ← " + spec.day + "「" + QL.questText(spec.title, "zh") + "」");
    try {
      const res = run(spec, QL.questPubSeeds(spec), extraC, extraE), row = res.rows.filter(x => x.id === "try")[0], sk = (res.skipped || []).filter(x => x.id === "try")[0];
      if (sk || !row) { console.log("    没能上场：" + (sk ? sk.err : "")); return; }
      if (row.err) { console.log("    中途出错：" + row.err); return; }
      console.log("    公开的几组：" + f3(row.mean) + " ± " + f3(row.se) + "   比基准 " + sgn(row.d) + " ± " + f3(row.dse) + (row.bad > 0 ? "   有 " + (100 * row.bad).toFixed(1) + "% 的回合报的不是数" : ""));
      // 和最好的那条基准规则逐局相减，多换几批结算数据
      const refs = r.pub.rows.filter(x => x.id !== "starter"), dir = spec.higher ? 1 : -1, best = refs.slice().sort((a, b) => dir * (b.mean - a.mean))[0], bi = spec.refs.findIndex(q => "ref:" + q.id === best.id);
      let seeds = []; for (let d = 0; d < TRY_DRAWS; d++) seeds = seeds.concat(QL.questFinSeeds(spec, "try-" + d));
      const duel = job(codesOf(spec, extraC), { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: spec.sets.K, seeds, entries: [{ id: best.id, p: spec.refs[bi].p, slot: bi }].concat(extraE) }).rows;
      console.log("    换 " + TRY_DRAWS + " 批结算数据，和最好的基准规则（" + QL.questText(spec.refs[bi].name, "zh") + "，" + f3(duel[0].mean) + "）比：" + f3(duel[1].mean) + "，" + sgn(duel[1].d) + " ± " + f3(duel[1].dse) + "（" + (spec.higher ? "正" : "负") + "的是比它好）");
    } catch (e) { console.log("    没有跑通：" + e.message); }
  });
}
// 每道题的代号不能重复（重复了，往期的榜会混在一起）
const ids = {}; results.forEach(r => { if (r.spec) (ids[r.spec.id] = ids[r.spec.id] || []).push(r.spec.day); });
if (flags.has("--all")) {
  Object.keys(ids).filter(k => ids[k].length > 1).forEach(k => { bad++; console.log("✗ 代号 " + k + " 用了不止一次：" + ids[k].join("、")); });
  let idx = null; try { idx = JSON.parse(fs.readFileSync(INDEX, "utf8")); } catch (e) {}
  const want = listAll().map(f => path.basename(f, ".json"));
  if (!idx || idx.v !== 1 || JSON.stringify(idx.days) !== JSON.stringify(want)) { bad++; console.log("✗ daily/index.json 和 daily/q/ 里的文件对不上。运行 node daily/check.js --index"); }
} else {
  // 只核对了几道：和已有的题比一下代号
  const mine = new Set(files.map(f => path.resolve(f)));
  listAll().filter(f => !mine.has(path.resolve(f))).forEach(f => { try { const o = JSON.parse(fs.readFileSync(f, "utf8")); if (o && ids[o.id]) { bad++; console.log("✗ 代号 " + o.id + " 已经在 " + path.basename(f) + " 里用过了"); } } catch (e) {} });
  Object.keys(ids).filter(k => ids[k].length > 1).forEach(k => { bad++; console.log("✗ 代号 " + k + " 用了不止一次：" + ids[k].join("、")); });
}
if (!flags.has("--review")) console.log(bad ? "\n有 " + bad + " 处不通过。" : "\n" + results.length + " 道题全部通过。");
process.exit(bad ? 1 : 0);
