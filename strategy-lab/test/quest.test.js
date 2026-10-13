// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 每日一题的引擎（quest.js）：题目的格式、公开和结算的几组数据、结算随机数是哪一轮、任务算出来的数和直接算的一样、
// 交上来的规则怎么挑、名次怎么排；仓库里现有的每一道题都过一遍，题面里写的几个数拿精确计算去对；校验脚本的退出码。
const vm = require("vm"), fs = require("fs"), path = require("path"), cp = require("child_process"), { QL, ok, near, section, done } = require("./harness.js");
global.QL_CORE = require(path.join(__dirname, "../src/core.js"));
global.QL_SHOP_INSTALL = require(path.join(__dirname, "../src/shop.js"));
global.QL_QUEST_INSTALL = require(path.join(__dirname, "../src/quest.js"));
const JI = require(path.join(__dirname, "../src/jobs.js")), QLJobs = JI.QLJobs;
JI(QL); global.QL_SHOP_INSTALL(QL); global.QL_QUEST_INSTALL(QL);
const Q = QL.QUEST, DAILY = path.join(__dirname, "../daily"), QDIR = path.join(DAILY, "q");
const comp = (code, names) => new Function('"use strict";\n' + code + "\n;return { " + names.map(n => n + ": typeof " + n + ' === "function" ? ' + n + " : null").join(", ") + " };")();
function runJob(codes, msg) {
  const built = QLJobs.source(codes), posts = [], self = { postMessage: m => posts.push(m), onmessage: null };
  vm.runInContext(built.src, vm.createContext({ self, console, performance }), { filename: "job.js" });
  self.onmessage({ data: Object.assign({ type: "job", kind: "quest" }, msg) });
  const last = posts[posts.length - 1];
  return { last, result: last.type === "done" ? last.result : null, posts };
}
const clone = o => JSON.parse(JSON.stringify(o));
/** 一道最小的题：每回合发一个 0 到 1 之间的数 x，规则报 1 就拿走 x 并结束，否则接着看下一个 */
const BASE = {
  v: 1, day: "2026-10-14", id: "mini", title: { zh: "小题", en: "Mini" }, summary: { zh: "拿一个尽量大的数。", en: "Take a number that is as large as possible." },
  about: { zh: ["每回合看到一个数。", "", "报 1 就拿走它。"], en: ["Each round you see a number.", "", "Return 1 to take it."] }, T: 8, p: { floor: 0 },
  code: { zh: ["// 发牌", "function deal(T, rng, p) {", "  var x = [];", "  for (var t = 0; t < T; t++) x.push(rng.u());", "  return { x: x, floor: p.floor };", "}", "// 亮牌", "function show(G, t) {", "  return G.x[t];", "}", "// 判分", "function referee(G, t, a) {", "  if (a === 1 || t === G.x.length - 1) { G.over = true; return Math.max(G.floor, G.x[t]); }", "  return 0;", "}"],
          en: ["// Deal", "function deal(T, rng, p) {", "  var x = [];", "  for (var t = 0; t < T; t++) x.push(rng.u());", "  return { x: x, floor: p.floor };", "}", "// Show", "function show(G, t) {", "  return G.x[t];", "}", "// Referee", "function referee(G, t, a) {", "  if (a === 1 || t === G.x.length - 1) { G.over = true; return Math.max(G.floor, G.x[t]); }", "  return 0;", "}"] },
  sets: { pub: 4, fin: 3, K: 50, seed: 99 }, higher: true, digits: 3,
  refs: [{ id: "first", name: { zh: "第一个", en: "The first" }, summary: { zh: "第一个就拿。", en: "Takes the first one." }, p: {}, code: "function decide(s, p) {\n  return 1;\n}" },
         { id: "half", name: { zh: "过半就拿", en: "Above a half" }, summary: { zh: "超过 c 就拿。", en: "Takes the first one above c." }, p: { c: 0.5 }, code: "function decide(s, p) {\n  return s.see > p.c ? 1 : 0;\n}" },
         { id: "coin", name: { zh: "掷硬币", en: "Flip a coin" }, summary: { zh: "一半的机会拿。", en: "Takes it half of the time." }, p: {}, code: "function decide(s, p) {\n  return s.rnd() < 0.5 ? 1 : 0;\n}" }],
  starter: { p: { c: 0.5 }, code: { zh: ["// 起始代码", "function decide(s, p, st) {", "  return s.see > p.c ? 1 : 0;", "}"], en: ["// Starter code", "function decide(s, p, st) {", "  return s.see > p.c ? 1 : 0;", "}"] } }
};
const spec0 = QL.questOk(BASE);

section("一、题目的格式");
{
  const c = QL.questCheck(BASE, true);
  ok(c.errors.length === 0 && c.spec && c.spec.cid === spec0.cid && /^mini\.[0-9a-z]+$/.test(spec0.cid), "一道写对了的题通过严格检查，带上指纹", JSON.stringify(c.errors));
  ok(spec0.about.zh === "每回合看到一个数。\n\n报 1 就拿走它。" && spec0.about.en.split("\n").length === 3 && QL.questText(spec0.about, "en").startsWith("Each round") && QL.questText(spec0.about, "zh").startsWith("每回合") && QL.questText("x", "en") === "x" && QL.questText({ zh: "只有中文" }, "en") === "只有中文" && QL.questText(null, "zh") === "", "文字可以写成一行一个字符串的数组；按语言取，缺的那份用另一份顶");
  ok(spec0.canon.split("\n").length === BASE.code.zh.length && spec0.canon.split("\n")[0] === "" && !/发牌|Deal/.test(spec0.canon) && QL.questCanon(BASE.code.zh.join("\n")) === QL.questCanon(BASE.code.en.join("\r\n")) && spec0.code.zh.includes("// 发牌") && spec0.code.en.includes("// Deal"), "执行的是去掉整行注释以后的代码（行号不变）；两种语言的版本去掉注释以后一样；给人看的保留注释");
  ok(spec0.refs.length === 3 && spec0.refs[0].canon.includes("return 1") && spec0.higher === true && spec0.digits === 3 && spec0.T === 8 && spec0.sets.K === 50 && spec0.p.floor === 0, "基准规则、回合数、几组几局、参数都读进来了");
  const bad = (name, f, re, strict) => { const o = clone(BASE); f(o); const r = QL.questCheck(o, !!strict); ok(r.spec === null && r.errors.some(e => re.test(e)), name, r.errors.join(" / ")); };
  bad("版本号不对的不收", o => { o.v = 2; }, /^v:/);
  bad("日期不存在的不收", o => { o.day = "2026-02-30"; }, /^day:/);
  bad("代号有大写字母的不收", o => { o.id = "Mini"; }, /^id:/);
  bad("回合数超出范围的不收", o => { o.T = 5000; }, /^T:/);
  bad("组数超出范围的不收", o => { o.sets.pub = 0; }, /sets\.pub/);
  bad("计算量太大的不收", o => { o.T = 2000; o.sets.K = 5000; o.sets.pub = 40; }, /too much work/);
  bad("没有裁判的不收", o => { o.code = "function deal(T, rng, p) { return {}; }"; }, /function referee is missing/);
  bad("两种语言的代码不一样的不收", o => { o.code.en = o.code.en.map(l => l.replace("x.push(rng.u())", "x.push(0.5)")); }, /differ in more than whole-line/);
  bad("行尾带注释的不收", o => { o.code = "function deal(T, rng, p) { return {}; } // x\nfunction referee(G, t, a) { return 0; }"; }, /lines of their own/);
  bad("用了 Math.random 的不收", o => { o.code = "function deal(T, rng, p) { return { x: Math.random() }; }\nfunction referee(G, t, a) { return 0; }"; }, /may not use/);
  bad("想联网的不收", o => { o.refs[0].code = "function decide(s, p) { fetch('x'); return 1; }"; }, /refs\[0\]\.code: uses something/);
  bad("没有基准规则的不收", o => { o.refs = []; }, /^refs:/);
  bad("基准规则重名的不收", o => { o.refs[1].id = "first"; }, /refs\[1\]\.id/);
  bad("没有起始代码的不收", o => { delete o.starter; }, /^starter:/);
  bad("参数不是数的不收", o => { o.p = { a: "x" }; }, /^p\.a/);
  bad("严格检查：只有一种语言的不收", o => { o.title = "只有中文"; }, /title: needs both/, true);
  bad("严格检查：英文那份里有中文的不收", o => { o.about.en = ["There is 中文 here."]; }, /about\.en: contains Chinese/, true);
  bad("严格检查：带中文注释的代码只写一份的不收", o => { o.starter.code = "// 中文\nfunction decide(s, p) { return 1; }"; }, /starter\.code: has non-ASCII/, true);
  const loose = clone(BASE); loose.title = "只有中文"; loose.code = BASE.code.zh.join("\n");
  ok(QL.questOk(loose) && QL.questOk(loose).title === "只有中文" && QL.questOk(loose).cid === spec0.cid, "页面用的宽松检查：一种语言也收；指纹只看执行的代码，和注释、标题无关");
  const diff = [o => { o.T = 9; }, o => { o.p.floor = 0.1; }, o => { o.sets.K = 51; }, o => { o.sets.seed = 100; }, o => { o.higher = false; }, o => { o.code.zh[4] = "  return { x: x, floor: p.floor, y: 1 };"; o.code.en[4] = o.code.zh[4]; }].map(f => { const o = clone(BASE); f(o); return QL.questOk(o).cid; });
  ok(new Set(diff.concat([spec0.cid])).size === 7, "回合数、参数、局数、种子、朝哪边算好、裁判的代码，改了任何一样，指纹就变");
  ok(QL.questOk(null) === null && QL.questOk([]) === null && QL.questOk({}) === null && QL.questOk("x") === null, "不是题目的东西一概不收");
}

section("二、日子、截止和结算用的那一轮随机数");
{
  ok(QL.questOpen("2026-10-14") === Date.UTC(2026, 9, 14) && QL.questDeadline("2026-10-14") === Date.UTC(2026, 9, 15) && Number.isNaN(QL.questOpen("2026-13-01")) && Number.isNaN(QL.questOpen("10/14")), "一天从 UTC 零点到第二天 UTC 零点");
  // 两个实测的对照点（2026-10-13 从线上页面向 drand 取到的）：quicknet 第 33018781 轮是 02:48:27 UTC 发布的
  ok(QL.beaconRound(Date.parse("2026-10-13T02:48:27Z")) === 33018781 && QL.beaconRound(Date.parse("2026-10-13T02:48:29.999Z")) === 33018781 && QL.beaconRound(Date.parse("2026-10-13T02:48:30Z")) === 33018782 && QL.beaconTime(33018781) === Date.parse("2026-10-13T02:48:27Z"), "时刻和轮次的换算对得上实测的那一轮");
  const r = QL.questRound("2026-10-14");
  ok(QL.beaconTime(r) === Date.UTC(2026, 9, 15) + 30000 && QL.questRound("2026-10-15") - r === 86400 / Q.beacon.period && Q.beacon.period === 3 && /^[0-9a-f]{64}$/.test(Q.beacon.chain), "结算用的是截止之后半分钟发布的那一轮；隔一天正好差一天的轮数");
}

section("三、公开的几组和结算的几组");
{
  const pub = QL.questPubSeeds(spec0), fin = QL.questFinSeeds(spec0, "ab".repeat(32)), fin2 = QL.questFinSeeds(spec0, "AB".repeat(32)), fin3 = QL.questFinSeeds(spec0, "cd".repeat(32));
  ok(pub.length === 4 && fin.length === 3 && pub.concat(fin).every(x => Number.isInteger(x) && x === (x | 0)) && new Set(pub.concat(fin)).size === 7, "公开 4 组、结算 3 组，种子都是 32 位整数，互不相同");
  ok(JSON.stringify(pub) === JSON.stringify(QL.questPubSeeds(QL.questOk(BASE))) && JSON.stringify(fin) === JSON.stringify(fin2) && JSON.stringify(fin) !== JSON.stringify(fin3), "同一道题、同一个随机数，种子每次都一样（随机数的大小写不影响）；随机数不同，结算的种子就不同");
  const other = QL.questOk(Object.assign(clone(BASE), { day: "2026-10-15" }));
  ok(other.cid === spec0.cid && JSON.stringify(QL.questPubSeeds(other)) !== JSON.stringify(pub) && JSON.stringify(QL.questFinSeeds(other, "ab".repeat(32))) !== JSON.stringify(fin), "同一道题换一天再出（重温旧题），公开的和结算的数据都换一批");
}

section("四、任务：算出来的数和直接算的一样");
{
  const game = comp(spec0.canon, ["deal", "show", "referee"]), gp = Object.freeze(Object.assign({}, spec0.p)), pub = QL.questPubSeeds(spec0), fin = QL.questFinSeeds(spec0, "ab".repeat(32)), K = spec0.sets.K;
  const pl = (r, slot) => Object.assign(comp(r.canon, ["init", "decide"]), { id: r.id, p: Object.freeze(Object.assign({}, r.p)), slot });
  const direct = (r, slot, seeds) => { const P = pl(r, slot), out = []; for (const sd of seeds) for (let k = 0; k < K; k++) out.push(QL.shopEpisode(game, gp, spec0.T, sd, k, P, slot, null).score); return out; };
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const codes = [{ id: "game", code: spec0.canon }].concat(spec0.refs.map(r => ({ id: r.id, code: r.canon }))), entries = spec0.refs.map((r, i) => ({ id: r.id, p: r.p, slot: i }));
  const J = runJob(codes, { game: "game", gp: spec0.p, T: spec0.T, K, seeds: pub, entries, trace: true }).result;
  ok(J && J.n === 4 && J.K === K && J.T === 8 && J.rows.length === 3 && J.cut === 0, "三条基准规则在公开的 4 组上各打一遍");
  const D = spec0.refs.map((r, i) => direct(r, i, pub));
  ok(J.rows.every((row, i) => Math.abs(row.mean - mean(D[i])) < 1e-12 && row.sets.length === 4 && row.sets.every((v, s) => Math.abs(v - mean(D[i].slice(s * K, (s + 1) * K))) < 1e-12)), "总的平均数、每一组的平均数，和直接算的一个数都不差");
  const dd = D[1].map((v, k) => v - D[0][k]), dm = mean(dd), dse = Math.sqrt(dd.reduce((s, v) => s + (v - dm) * (v - dm), 0) / (dd.length - 1) / dd.length);
  ok(J.rows[0].d === 0 && J.rows[0].dse === 0 && Math.abs(J.rows[1].d - dm) < 1e-12 && Math.abs(J.rows[1].dse - dse) < 1e-12, "“比基准多”是逐局相减之后的平均数，标准误也是逐局算的");
  near(J.rows[0].mean, 0.5, 4 * J.rows[0].se + 1e-9, "第一个就拿：平均 1/2");
  near(J.rows[1].mean, 0.75 - 0.25 * Math.pow(0.5, 7), 4 * J.rows[1].se + 1e-9, "超过 1/2 就拿：平均 3/4 − (1/2)^7 × 1/4（精确值）");
  ok(J.trace.length === 3 && J.trace[0].log.length === 1 && J.trace[0].score === D[0][0] && J.trace[1].log.length >= 1 && J.trace[1].log[J.trace[1].log.length - 1].gain === D[1][0], "要了过程的话，记下的是第一组第一局");
  // 同一条规则不管和谁一起跑，只要 slot 相同，结果就一样；slot 不同，它自己的随机数就不同
  const coin = spec0.refs[2];
  const alone = runJob([{ id: "game", code: spec0.canon }, { id: "c", code: coin.canon }], { game: "game", gp: spec0.p, T: spec0.T, K, seeds: pub, entries: [{ id: "c", p: {}, slot: 2 }] }).result.rows[0];
  const moved = runJob([{ id: "game", code: spec0.canon }, { id: "c", code: coin.canon }], { game: "game", gp: spec0.p, T: spec0.T, K, seeds: pub, entries: [{ id: "c", p: {}, slot: Q.slot }] }).result.rows[0];
  ok(alone.mean === J.rows[2].mean && alone.se === J.rows[2].se && moved.mean !== alone.mean && Math.abs(moved.mean - mean(direct(coin, Q.slot, pub))) < 1e-12, "用到随机数的规则：slot 相同结果相同，slot 不同结果不同");
  // 结算的几组和公开的几组一次跑完，分开报
  const both = runJob(codes, { game: "game", gp: spec0.p, T: spec0.T, K, seeds: fin.concat(pub), cut: fin.length, entries }).result, onlyFin = runJob(codes, { game: "game", gp: spec0.p, T: spec0.T, K, seeds: fin, entries }).result;
  ok(both.cut === 3 && both.rows.every((r, i) => r.parts.length === 2 && r.parts[0].mean === onlyFin.rows[i].mean && r.parts[0].se === onlyFin.rows[i].se && r.parts[0].d === onlyFin.rows[i].d && r.parts[0].dse === onlyFin.rows[i].dse && r.parts[1].mean === J.rows[i].mean && r.parts[1].dse === J.rows[i].dse), "一次跑完再分开报，和分两次跑一个数都不差");
  ok(Math.abs(onlyFin.rows[1].mean - J.rows[1].mean) > 1e-9, "结算的几组和公开的几组是不同的数据（同一条规则，成绩不同）");
}

section("五、任务：出了错算谁的");
{
  const pub = QL.questPubSeeds(spec0), K = 20, msg = (extra, entries) => ({ game: "game", gp: spec0.p, T: spec0.T, K, seeds: pub, entries: [{ id: "b", p: {}, slot: 0 }].concat(entries || [{ id: "x", p: {}, slot: Q.slot }]) }), G = { id: "game", code: spec0.canon }, B = { id: "b", code: spec0.refs[0].canon };
  const good = runJob([G, B, { id: "x", code: spec0.refs[1].canon }], Object.assign(msg(), { entries: [{ id: "b", p: {}, slot: 0 }, { id: "x", p: { c: 0.5 }, slot: Q.slot }] })).result;
  const thrower = runJob([G, B, { id: "x", code: "function decide(s, p) { if (s.t === 2) throw new Error('boom'); return 0; }" }], msg()).result;
  ok(thrower.rows[1].err === "boom" && Number.isNaN(thrower.rows[1].mean) && thrower.rows[1].sets.length === 0 && thrower.rows[0].mean === good.rows[0].mean, "规则中途抛错：这条规则出局，基准照常");
  const nan = runJob([G, B, { id: "x", code: "function decide(s, p) { return s.t === 0 ? 'abc' : 1; }" }], msg()).result;
  ok(!nan.rows[1].err && nan.rows[1].bad > 0.4 && nan.rows[1].bad < 0.6 && Number.isFinite(nan.rows[1].mean), "规则报的不是数：当作没报，记下有多少回合是这样");
  const nodecide = runJob([G, B, { id: "x", code: "var z = 1;" }], msg()).result;
  ok(nodecide.rows.length === 1 && nodecide.skipped.length === 1 && nodecide.skipped[0].id === "x" && /decide/.test(nodecide.skipped[0].err), "没有 decide 的不上场，别的照常");
  // 想使坏的规则：改内置对象、提前结束别人的局、偷看藏起来的东西
  const evil = "try { Math.max = function () { return 99; }; } catch (e) {}\ntry { Object.prototype.over = true; } catch (e) {}\nfunction decide(s, p) { try { s.see = 1; s.g.floor = 9; } catch (e) {} return typeof G === 'undefined' && typeof self === 'undefined' && typeof postMessage === 'undefined' ? 1 : 0; }";
  const ev = runJob([G, B, { id: "x", code: evil }], msg()).result;
  ok(ev.rows[0].mean === good.rows[0].mean && ev.rows[1].mean === good.rows[0].mean, "改不动内置对象和题目的参数，看不到藏起来的东西，也碰不到线程：它的成绩就是“第一个就拿”该得的，基准的成绩不受影响");
  const badGame = runJob([{ id: "game", code: "function deal(T, rng, p) { return {}; }\nfunction referee(G, t, a) { return NaN; }" }, B], { game: "game", gp: {}, T: 3, K: 2, seeds: [1], entries: [{ id: "b", p: {}, slot: 0 }] });
  ok(badGame.last.type === "error" && /referee/.test(badGame.last.message), "裁判判出来的不是数：整件事停下来，说清楚是裁判的问题");
  ok(runJob([G, B], { game: "game", gp: {}, T: 8, K: 2, seeds: [], entries: [{ id: "b", p: {}, slot: 0 }] }).last.type === "error" && runJob([G, B], { game: "nope", gp: {}, T: 8, K: 2, seeds: [1], entries: [] }).last.type === "error", "没有种子、没有裁判，都报错");
  ok(/QL_QUEST_INSTALL/.test(QLJobs.SHADOW), "线程里编进去的代码碰不到安装每日一题引擎的那个函数");
}

section("六、交上来的规则怎么挑，名次怎么排");
{
  const day = spec0.day, cid = spec0.cid, t0 = Date.UTC(2026, 9, 14), code = "function decide(s, p) { return 1; }";
  const it = (n, user, at, over) => Object.assign({ n, kind: "quest", meta: { kind: "quest", day, cid, name: "规则 " + n, p: { c: 0.5, bad: "x" } }, code, user, avatar: "", url: "u" + n, at: t0 + at * 36e5, upd: t0 + at * 36e5, up: 0 }, over || {});
  const items = [
    it(1, "alice", 1), it(2, "alice", 5), it(3, "alice", 3),                        // 同一个人交了三次：算最后一次（第 2 条）
    it(4, "bob", 2, { upd: t0 + 30 * 36e5 }),                                       // 截止之后又动过
    it(5, "carol", 24),                                                             // 正好在截止那一刻：不算
    it(6, "dave", -1),                                                              // 前一天交的：不算
    it(7, "erin", 4, { meta: { kind: "quest", day, cid: "other.1", name: "x" } }),  // 别的题
    it(8, "frank", 4, { meta: { kind: "quest", day: "2026-10-13", cid, name: "x" } }),
    it(9, "gina", 4, { code: "var x = 1;" }),                                       // 没有 decide
    it(10, "", 4), it(11, "hank", 4, { kind: "rule" }),
    it(12, "ivy", 23.999, { meta: { kind: "quest", day, cid, name: "  带\u0001控制符  " + "长".repeat(60) } })
  ];
  const E = QL.questEntries(items, spec0);
  ok(E.map(e => e.user).join() === "bob,alice,ivy", "只留当天交的、指纹对得上的、有 decide 的；按交的时间排", E.map(e => e.user + ":" + e.n).join());
  const a = E.filter(e => e.user === "alice")[0], b = E.filter(e => e.user === "bob")[0], i = E.filter(e => e.user === "ivy")[0];
  ok(a.n === 2 && a.tries === 3 && b.tries === 1 && b.touched === true && a.touched === false, "同一个账号只算截止前最后交的那一条，并且记下交了几次；截止之后动过的标出来");
  ok(JSON.stringify(a.p) === '{"c":0.5}' && i.name.length === 40 && !/[\u0000-\u001f]/.test(i.name) && i.name.startsWith("带控制符"), "参数只留是数的；名字去掉控制符、截到 40 个字");
  ok(QL.questEntries(null, spec0).length === 0 && QL.questEntries([null, {}, { kind: "quest" }], spec0).length === 0, "空的、残缺的都不出错");
  const rk = QL.questRank([{ score: 5, at: 3, n: 1 }, { score: 7, at: 9, n: 2 }, { score: 5, at: 1, n: 3 }, { score: NaN, at: 0, n: 4 }, { score: 9, at: 0, n: 5, err: "x" }, { score: 5, at: 1, n: 2 }], true);
  ok(rk.join() === "4,1,3,0,0,2", "分数高的在前；同分先交的在前，再同就按编号；没有成绩的不排名", rk.join());
  ok(QL.questRank([{ score: 5, at: 3 }, { score: 7, at: 9 }, { score: -1, at: 1 }], false).join() === "2,3,1", "越低越好的题反过来排");
}

section("七、仓库里现有的每一道题");
{
  const files = fs.readdirSync(QDIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(), specs = {};
  let allOk = true, why = "";
  files.forEach(f => { const c = QL.questCheck(JSON.parse(fs.readFileSync(path.join(QDIR, f), "utf8")), true); if (!c.spec || c.spec.day !== f.slice(0, 10)) { allOk = false; why += f + ": " + c.errors.join("; ") + " "; } else specs[c.spec.id] = c.spec; });
  ok(files.length >= 7 && allOk, "每一道题都通过严格检查，文件名和日期对得上（" + files.length + " 道）", why);
  ok(Object.keys(specs).length === files.length, "代号互不相同");
  const idx = JSON.parse(fs.readFileSync(path.join(DAILY, "index.json"), "utf8"));
  ok(idx.v === 1 && JSON.stringify(idx.days) === JSON.stringify(files.map(f => f.slice(0, 10))), "index.json 列的就是现有的这些日子");
  ok(Object.keys(specs).every(id => { const s = specs[id]; return s.refs.length >= 2 && [s.canon].concat(s.refs.map(r => r.canon), [QL.questCanon(QL.questText(s.starter.code, "zh"))]).every(c => QLJobs.syntax(c) === "") && QL.questCanon(QL.questText(s.starter.code, "zh")) === QL.questCanon(QL.questText(s.starter.code, "en")); }), "裁判、基准规则、起始代码都没有语法错误；起始代码的两种语言版本一样");
  /** 一道题的几条基准规则在指定的种子上各打 K 局，返回每条的 { mean, se, scores } */
  const play = (s, seeds, K, over) => {
    const game = comp(s.canon, ["deal", "show", "referee"]), gp = Object.freeze(Object.assign({}, s.p, over || {})), out = {};
    s.refs.forEach((r, i) => { const P = Object.assign(comp(r.canon, ["init", "decide"]), { id: r.id, p: Object.freeze(Object.assign({}, r.p)) }), sc = []; for (const sd of seeds) for (let k = 0; k < K; k++) sc.push(QL.shopEpisode(game, gp, s.T, sd, k, P, i, null).score); const m = sc.reduce((x, y) => x + y, 0) / sc.length, v = sc.reduce((x, y) => x + (y - m) * (y - m), 0) / (sc.length - 1); out[r.id] = { mean: m, se: Math.sqrt(v / sc.length), scores: sc }; });
    return out;
  };
  if (specs["price-probe"]) {
    // 一口价 1：每位顾客的期望是 E[(1 − 1/θ)⁺]，θ 在 0.5 到 8 之间对数均匀 → (ln 8 − 7/8) / ln 16；60 位顾客
    const r = play(specs["price-probe"], [1, 2, 3], 2000), exact = 60 * (Math.log(8) - 7 / 8) / Math.log(16);
    near(r.fixed.mean, exact, 4 * r.fixed.se, "定价：一口价 1 的平均成交额对得上积分算出来的 " + exact.toFixed(3));
    ok(r.updown.mean > r.fixed.mean + 5 && r.updown.mean < 60 * 7.5 / Math.log(16) / 4, "定价：会学的规则比一口价好，但超不过“知道 θ”时的 15 E[θ] = " + (60 * 7.5 / Math.log(16) / 4).toFixed(2));
  }
  if (specs["parking"]) {
    const r = play(specs["parking"], [1, 2], 3000), s = specs["parking"];
    ok(r.first.scores.every(v => v <= 0 && v >= -s.p.garage && Number.isInteger(v)) && r.door.scores.every(v => v >= -14 || v === -s.p.garage) && s.p.garage > s.p.door && s.T - 1 - s.p.door === 14, "停车：得分是负的车位数；开到门口再找的，最远走 14 个车位，否则进停车场；停车场比街上任何车位都远");
    ok(r.door.mean > r.first.mean + 20 && r.near.mean > r.first.mean + 20, "停车：两条像样的规则都比见空就停好得多");
  }
  if (specs["newsstand"]) {
    const r = play(specs["newsstand"], [1, 2], 2000);
    ok(r.chase.mean < r.fixed.mean && r.bump.mean > r.fixed.mean, "报摊：“昨天卖多少今天进多少”比每天进 15 份还差（越进越少），卖光了就加码的更好");
    // 知道 λ 时每天最多赚 1.5λ；λ 平均 19，30 天 → 855
    ok(r.bump.mean < 30 * 1.5 * 19, "报摊：成绩超不过“每天正好进对”的 855");
  }
  if (specs["budget-bids"]) {
    const s = specs["budget-bids"], game = comp(s.canon, ["deal", "show", "referee"]), P = Object.assign(comp(s.refs[0].canon, ["init", "decide"]), { id: "t", p: Object.freeze({}) });
    let over = 0, broke = 0; const N = 400;
    for (let k = 0; k < N; k++) { const G = game.deal(s.T, new QL.RNG(5, k, 9101), Object.freeze(Object.assign({}, s.p))); let spent = 0; for (let t = 0; t < s.T; t++) { const v = game.show(G, t); game.referee(G, t, v.v); spent = s.p.budget - G.left; } if (spent > s.p.budget + 1e-9) over++; if (G.left < 0.5) broke++; }
    ok(over === 0 && broke > 0.9 * N, "竞拍：花的钱从不超过预算；照价值出价，九成以上的局里钱都花光了");
    // 题面补充里的话：照价值出，前 50 场平均花掉预算的八成多；后 50 场里值得赢的（v ≥ m）大多没赢到
    let spent50 = 0, worth = 0, won = 0;
    for (let k = 0; k < N; k++) { const G = game.deal(s.T, new QL.RNG(6, k, 9101), Object.freeze(Object.assign({}, s.p))); for (let t = 0; t < s.T; t++) { const v = game.show(G, t), before = G.left; game.referee(G, t, v.v); if (t >= 50) { if (G.v[t] >= G.m[t]) worth++; if (G.left < before) won++; } if (t === 49) spent50 += (s.p.budget - G.left) / s.p.budget / N; } }
    ok(spent50 > 0.8 && spent50 < 0.9 && won < 0.5 * worth, "竞拍：照价值出价，前 50 场平均花掉预算的八成多，后 50 场里值得赢的大多没赢到", (100 * spent50).toFixed(1) + "% " + won + "/" + worth);
    const r = play(s, [1, 2], 1500);
    ok(r.shade.mean > r.skip.mean && r.skip.mean > r.truthful.mean, "竞拍：打折 > 只挑值钱的 > 照价值出价");
  }
  if (specs["put-exercise"]) {
    // 只在到期行权：波动是 σ 时值 Black–Scholes 的欧式看跌价；σ 在 slo 到 shi 之间均匀，取平均
    const s = specs["put-exercise"], r = play(s, [1, 2, 3], 6000), N = x => 0.5 * (1 + erf(x / Math.SQRT2)), rr = s.p.r, bsOf = sg => { const d1 = (rr + sg * sg / 2) / sg, d2 = d1 - sg; return 100 * Math.exp(-rr) * N(-d2) - 100 * N(-d1); };
    let bs = 0; for (let i = 0; i < 400; i++) bs += bsOf(s.p.slo + (i + 0.5) * (s.p.shi - s.p.slo) / 400) / 400;
    function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
    near(r.hold.mean, bs, 4 * r.hold.se, "行权：拿到到期的平均值对得上 Black–Scholes 的欧式看跌价（对波动取平均）" + bs.toFixed(3));
    ok(r.patient.mean > r.hold.mean + 0.2 && r.eager.mean < r.hold.mean - 0.5, "行权：门槛 75 的比拿到到期值钱；门槛 90 的行权太早，还不如拿到到期", [r.hold.mean, r.eager.mean, r.patient.mean].map(x => x.toFixed(3)).join(" "));
    // 题面补充里的两个数：知道波动时，一开始的行权边界在波动 10% 时大约是 95，50% 时大约是 57。在对数价格的网格上倒着推（每一步都能行权）
    const boundary0 = sg => {
      const T = s.T, dt = 1 / T, n = 1601, lo = -3.2, dx = 6.4 / (n - 1), zs = [], ws = []; for (let z = -6; z <= 6 + 1e-9; z += 0.2) { zs.push(z); ws.push(Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * 0.2); }
      let V = new Float64Array(n), b = 0; for (let i = 0; i < n; i++) V[i] = Math.max(100 - 100 * Math.exp(lo + i * dx), 0);
      const at = (V, x) => { if (x <= lo) return 100 - 100 * Math.exp(x); if (x >= -lo) return 0; const u = (x - lo) / dx, i = Math.floor(u), f = u - i; return V[i] * (1 - f) + V[i + 1] * f; };
      for (let t = T - 1; t >= 0; t--) { const W = new Float64Array(n); b = 0; for (let i = 0; i < n; i++) { const x = lo + i * dx; let c = 0; for (let k = 0; k < zs.length; k++) c += ws[k] * at(V, x + (rr - sg * sg / 2) * dt + sg * Math.sqrt(dt) * zs[k]); c *= Math.exp(-rr * dt); const ex = Math.max(100 - 100 * Math.exp(x), 0); W[i] = Math.max(ex, c); if (ex > c && ex > 0) b = 100 * Math.exp(x); } V = W; }
      return b;
    };
    const bLo = boundary0(s.p.slo), bHi = boundary0(s.p.shi);
    ok(Math.abs(bLo - 95) < 1 && Math.abs(bHi - 57) < 1.5, "行权：知道波动时，一开始的行权边界在波动 10% 时大约是 95，50% 时大约是 57", bLo.toFixed(2) + " " + bHi.toFixed(2));
  }
  if (specs["sell-order"]) {
    const s = specs["sell-order"], r = play(s, [1, 2], 1500), flat = play(s, [1, 2], 1500, { trend: 0 });
    ok(r.even.scores.every(v => v === 0), "卖货：匀着卖每一局都正好是 0 分");
    near(r.dump.mean, -(s.p.impact * s.p.units * s.p.units - s.p.impact * s.p.units * s.p.units / s.T), 4 * r.dump.se, "卖货：一次卖光平均比匀着卖少 η X² (1 − 1/T) = 95");
    ok(flat.react.mean < 0 && r.react.mean > 0, "卖货：没有趋势的时候，跟着价格调快慢只会亏（多付压价的钱）；有趋势的时候才赚");
  }
  if (specs["drifting-arms"]) {
    const r = play(specs["drifting-arms"], [1, 2], 800);
    near(r.stay.mean, 100, 5 * r.stay.se, "老虎机：只拉一台，200 次平均中 100 次");
    ok(r.fade.mean > r.wsls.mean && r.wsls.mean > r.stay.mean + 10, "老虎机：看近期战绩 > 中了留下没中就换 > 只拉一台");
  }
}

section("八、校验脚本");
{
  const run = args => cp.spawnSync(process.execPath, [path.join(DAILY, "check.js")].concat(args), { encoding: "utf8", env: Object.assign({}, process.env, { QUEST_DRAWS: "3" }) });
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "quest-")), good = path.join(tmp, "2026-10-14.json"), bad = path.join(tmp, "2026-10-15.json"), noisy = path.join(tmp, "2026-10-16.json");
  fs.writeFileSync(good, JSON.stringify(BASE));
  const b = clone(BASE); b.day = "2026-10-15"; b.id = "mini-bad"; b.refs[1].code = "function decide(s, p) {\n  return s.see.nothing.here;\n}"; fs.writeFileSync(bad, JSON.stringify(b));
  const n = clone(BASE); n.day = "2026-10-16"; n.id = "mini-noisy"; n.sets.K = 2; n.sets.pub = 2; n.refs = [BASE.refs[0], Object.assign(clone(BASE.refs[2]), { id: "coin" })]; fs.writeFileSync(noisy, JSON.stringify(n));
  const g = run([good]), bb = run([bad]), nn = run([noisy]), rv = run(["--review", good]);
  ok(g.status === 0 && /通过/.test(g.stdout) && /half/.test(g.stdout), "写对了的题：退出码 0，印出基准规则的成绩", g.stdout.slice(0, 300) + g.stderr.slice(0, 300));
  ok(bb.status === 1 && /中途出错/.test(bb.stdout), "基准规则会出错的题：退出码 1，说清楚哪条规则出了什么错", bb.stdout.slice(0, 300));
  ok(nn.status === 1 && /分不出高下/.test(nn.stdout), "局数太少、分不出高下的题：退出码 1", nn.stdout.slice(0, 300));
  ok(rv.status === 0 && rv.stdout.includes("## 2026-10-14 · 小题 / Mini") && rv.stdout.includes("<details><summary>English</summary>") && rv.stdout.includes("| 第一个（基准） |") && rv.stdout.includes("```js"), "--review 印出给人审的一份：中英文题面、基准规则的成绩、裁判的代码");
  const wrongName = path.join(tmp, "2026-11-01.json"); fs.writeFileSync(wrongName, JSON.stringify(BASE));
  ok(run([wrongName]).status === 1, "文件名和题目里的日期对不上：退出码 1");
  // 出题的时候用的：把一条自己写的规则放上去试
  const tryFile = path.join(tmp, "try.js"); fs.writeFileSync(tryFile, "// 门槛一回合比一回合低\nfunction decide(s, p) {\n  return s.see > p.c - 0.05 * s.t ? 1 : 0;\n}");
  const tr = run(["--try=" + tryFile, '--p={"c":0.8}', good]);
  ok(tr.status === 0 && /试 try\.js \{"c":0\.8\}/.test(tr.stdout) && /公开的几组：/.test(tr.stdout) && /和最好的基准规则（过半就拿，/.test(tr.stdout), "--try：把一条自己写的规则放上去试，印出它的成绩，以及它比最好的基准规则多多少", tr.stdout.slice(-500) + tr.stderr.slice(0, 300));
  const one = clone(BASE); one.day = "2026-10-17"; one.id = "mini-one"; one.refs = [BASE.refs[0]];
  const oneFile = path.join(tmp, "2026-10-17.json"); fs.writeFileSync(oneFile, JSON.stringify(one));
  const o1 = run([oneFile]);
  ok(o1.status === 1 && /至少要两条/.test(o1.stdout), "只有一条基准规则的题：退出码 1", o1.stdout.slice(0, 300));
  const dollar = clone(BASE); dollar.day = "2026-10-18"; dollar.id = "mini-dollar"; dollar.about.en = ["Each round you see a prize worth up to $1.", "", "Return 1 to take it."];
  const dollarFile = path.join(tmp, "2026-10-18.json"); fs.writeFileSync(dollarFile, JSON.stringify(dollar));
  const d1 = run([dollarFile]);
  ok(d1.status === 0 && /提醒：about\.en 里的 \$/.test(d1.stdout), "题面里拿 $ 写钱数：给一条提醒（两个 $ 之间会被当成公式）", d1.stdout.slice(0, 300));
  const live = clone(BASE); live.note = { zh: "见 " + String.fromCharCode(0x27ea) + "x" + String.fromCharCode(0x27eb) + "。", en: "See the handbook." };
  ok(QL.questCheck(live, true).errors.some(e => /live-number/.test(e)) && QL.questCheck(BASE, true).errors.length === 0, "题面里不许用手册里“现算的数字”那对括号（题面里填不出数来）");
  fs.rmSync(tmp, { recursive: true, force: true });
}

done();
