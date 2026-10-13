// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 每日一题的引擎（quest.js）：题目的格式、公开和结算的几组数据、结算随机数是哪一轮、任务算出来的数和直接算的一样、
// 交上来的规则怎么挑、名次怎么排；仓库里现有的每一道题都过一遍，题面里写的几个数拿精确计算去对；校验脚本的退出码。
// 封起来交：页面那一头封、结算那一头开。结算的程序（daily/settle.js）对着假的 GitHub 和 drand 从头到尾跑一遍，
// 沙盒用子进程代替容器；交上来的规则别人看不到，所以规则想捣鬼的那些路（逃出执行环境、换掉内置的东西、
// 造假结果、摸到结算的种子）在这里一条一条试，都得办不到。容器的命令行用一个假的 docker 命令核对。
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
  const flat = pub.concat(fin);
  ok(pub.length === 4 && fin.length === 3 && flat.every(s => Array.isArray(s) && s.length === 4 && s.every(x => Number.isInteger(x) && x === (x | 0))) && new Set(flat.map(s => s.join())).size === 7 && new Set([].concat(...flat)).size === 28, "公开 4 组、结算 3 组；一组的种子是四个 32 位整数，互不相同");
  // 结算的四个数各用随机数的一截：规则能从自己的随机数里反推出后两个，所以它们不能和发牌用的前两个有任何瓜葛
  const R = "0123456789abcdef".repeat(4), alt = j => R.slice(0, 16 * j) + "f".repeat(16) + R.slice(16 * j + 16), f0 = QL.questFinSeeds(spec0, R);
  ok([0, 1, 2, 3].every(j => QL.questFinSeeds(spec0, alt(j)).every((s, i) => s.every((v, q) => (q === j) === (v !== f0[i][q])))), "结算的四个数各用随机数的一截：改掉哪一截，只有那一个数跟着变");
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
  // 一组的四个数各管各的：前两个定发牌，后两个定规则自己的随机数
  {
    const sd = pub[0], k = 3, slot = Q.slot, look = seed => { const see = [], rnd = []; QL.shopEpisode(game, gp, spec0.T, seed, k, { init: null, decide: s => { see.push(s.see); rnd.push(s.rnd()); return 0; }, p: {} }, slot, null); return { see: see.join(), rnd: rnd.join() }; };
    const a = look(sd), b = look([sd[0], sd[1], sd[2] ^ 1, sd[3]]), c = look([sd[0], sd[1], sd[2], sd[3] ^ 1]), d = look([sd[0] ^ 1, sd[1], sd[2], sd[3]]), e = look([sd[0], sd[1] ^ 1, sd[2], sd[3]]);
    ok(b.see === a.see && c.see === a.see && b.rnd !== a.rnd && c.rnd !== a.rnd && d.rnd === a.rnd && e.rnd === a.rnd && d.see !== a.see && e.see !== a.see, "一组的四个数：前两个定发的牌，后两个定规则自己的随机数，互不相干");
    ok(+a.rnd.split(",")[0] === new QL.RNG(sd[2], k * 64 + slot, sd[3]).u() && +look(7).rnd.split(",")[0] === new QL.RNG(7, k * 64 + slot, 9102).u(), "规则的第一个随机数就是那两个数定出来的那条流的第一个数（只给一个数的老用法不变）");
  }
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
  const day = spec0.day, cid = spec0.cid, t0 = Date.UTC(2026, 9, 14), box = n => "A".repeat(200 - String(n).length) + n;   // 样子像样的一份（200 个字符），里面是什么这里不管
  const it = (n, user, at, over) => Object.assign({ n, kind: "quest", meta: { kind: "quest", day, cid, v: 2, kid: "k", box: box(n) }, code: "", user, uid: 100 + n, avatar: "", url: "u" + n, at: t0 + at * 36e5, upd: t0 + at * 36e5, up: 0 }, over || {});
  const items = [
    it(1, "alice", 1), it(2, "alice", 5), it(3, "alice", 3),                        // 同一个人交了三次：算最后一次（第 2 条）
    it(4, "bob", 2, { upd: t0 + 30 * 36e5 }),                                       // 截止之后又动过
    it(5, "carol", 24),                                                             // 正好在截止那一刻：不算
    it(6, "dave", -1),                                                              // 前一天交的：不算
    it(7, "erin", 4, { meta: { kind: "quest", day, cid: "other.1", v: 2, box: box(7) } }),  // 别的题
    it(8, "frank", 4, { meta: { kind: "quest", day: "2026-10-13", cid, v: 2, box: box(8) } }),
    it(9, "gina", 4, { meta: { kind: "quest", day, cid, v: 2, box: "太短" } }),       // 封好的那一份不像样
    it(10, "", 4), it(11, "hank", 4, { kind: "rule" }),
    it(12, "ivy", 4, { meta: { kind: "quest", day, cid, name: "没封的", p: {} }, code: "function decide(s, p) { return 1; }" }),   // 没有封起来的（明文）：不收
    it(13, "jack", 4, { meta: { kind: "quest", day, cid, v: 2, box: "A".repeat(199) + "!" } }),
    it(14, "kim", 4, { meta: { kind: "quest", day, cid, v: 2, box: "A".repeat(60001) } })
  ];
  const E = QL.questEntries(items, spec0);
  ok(E.map(e => e.user).join() === "bob,alice", "只留当天交的、指纹对得上的、封好的那一份像样的；没封的不收；按交的时间排", E.map(e => e.user + ":" + e.n).join());
  const a = E.filter(e => e.user === "alice")[0], b = E.filter(e => e.user === "bob")[0];
  ok(a.n === 2 && a.tries === 3 && b.tries === 1 && b.touched === true && a.touched === false, "同一个账号只算截止前最后交的那一条，并且记下交了几次；截止之后动过的标出来");
  ok(a.box === box(2) && a.uid === 102 && !("code" in a) && !("name" in a) && !("p" in a), "一条记录里只有谁、什么时候、封好的那一份：名字、参数、代码这里都没有");
  ok(QL.questEntries(null, spec0).length === 0 && QL.questEntries([null, {}, { kind: "quest" }], spec0).length === 0, "空的、残缺的都不出错");
  const rk = QL.questRank([{ score: 5, at: 3, n: 1 }, { score: 7, at: 9, n: 2 }, { score: 5, at: 1, n: 3 }, { score: NaN, at: 0, n: 4 }, { score: 9, at: 0, n: 5, err: "x" }, { score: 5, at: 1, n: 2 }], true);
  ok(rk.join() === "4,1,3,0,0,2", "分数高的在前；同分先交的在前，再同就按编号；没有成绩的不排名", rk.join());
  ok(QL.questRank([{ score: 5, at: 3 }, { score: 7, at: 9 }, { score: -1, at: 1 }], false).join() === "2,3,1", "越低越好的题反过来排");
  const P = (days, d) => QL.questPick(days, d), D7 = ["2026-10-14", "2026-10-15", "2026-10-16"];
  ok(P(D7, "2026-10-15").src === "2026-10-15" && P(D7, "2026-10-15").rerun === "" && P(D7, "2026-10-13").src === "" && P(D7, "2026-10-13").first === "2026-10-14" && P([], "2026-10-15").src === "" && P(null, "2026-10-15").first === "", "清单里有这一天就是它自己；比第一天还早、一道题都没有时挑不出来");
  const g = P(D7, "2026-10-25"), g2 = P(D7.slice().reverse().concat(["乱写", 5]), "2026-10-25");
  ok(D7.indexOf(g.src) >= 0 && g.rerun === g.src && g2.src === g.src && D7.some(d => P(D7, "2026-11-0" + (1 + D7.indexOf(d))).src !== g.src), "没有题的日子：从更早的题里按日期固定挑一道（清单的顺序、里面的杂质不影响），不同的日子挑到的不全一样", g.src);
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

/* 下面几节要等加密、子进程这些异步的东西，包在一个函数里 */
(async () => {
const crypto = require("crypto"), S = require(path.join(DAILY, "settle.js")), QLHub = require(path.join(__dirname, "../src/hub.js"));
const kp = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }), spki = new Uint8Array(kp.publicKey.export({ type: "spki", format: "der" })), pem = kp.publicKey.export({ type: "spki", format: "pem" });
const DAY = "2026-10-14", NEXT = "2026-10-15", L = S.loadSpec(DAY), spec = L.spec, info = QL.questSealInfo(DAY, spec.cid), dead = QL.questDeadline(DAY), round = QL.questRound(DAY);
const UPDOWN = "function init(p) {\n  return { price: p.start };\n}\nfunction decide(s, p, st) {\n  if (s.see === 1) st.price *= 1 + p.step;\n  if (s.see === 0) st.price *= 1 - p.step;\n  return st.price;\n}";
const fails = async f => { try { await f(); return false; } catch (e) { return true; } };

section("九、封起来交：页面那一头封，结算那一头开");
{
  const obj = { name: "涨跌各一成", p: { start: 1, step: 0.1 }, code: UPDOWN }, a = await QL.questSeal(spki, obj, info), b = await QL.questSeal(spki, obj, info);
  ok(QL.questBoxOk(a.box) && /^[0-9a-f]{16}$/.test(a.ch) && a.ch === crypto.createHash("sha256").update(a.box).digest("hex").slice(0, 16), "封好的一份只有字母、数字、- 和 _；记号是它的 SHA-256 的前 16 位", a.box.length + " " + a.ch);
  ok(a.box !== b.box && a.ch !== b.ch, "同样的东西封两次，得到的两份不一样（每次都现生成密钥和随机数）");
  ok(JSON.stringify(S.unseal(kp.privateKey, a.box, info)) === JSON.stringify(obj) && JSON.stringify(S.unseal(kp.privateKey, b.box, info)) === JSON.stringify(obj), "拿私钥解开，里面的东西一字不差");
  const big = { name: "长", p: {}, code: "function decide(s, p) {\n" + "  // 这是一行很长的注释，用来把代码撑大\n".repeat(300) + "  return 1;\n}" }, sb = await QL.questSeal(spki, big, info), raw = QL.questB64.dec(sb.box);
  ok(raw[0] === 1 && raw[1] === 1 && sb.box.length < JSON.stringify(big).length / 4 && S.unseal(kp.privateKey, sb.box, info).code === big.code, "正文先压缩再加密：重复多的代码封好以后短得多，解开还是原样", sb.box.length + " vs " + JSON.stringify(big).length);
  ok(await fails(async () => S.unseal(kp.privateKey, a.box, QL.questSealInfo(NEXT, spec.cid))) && await fails(async () => S.unseal(kp.privateKey, a.box, QL.questSealInfo(DAY, "other.1"))), "挪到别的日子、别的题上解不开");
  const flip = s => s.slice(0, 150) + (s[150] === "A" ? "B" : "A") + s.slice(151), other = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  ok(await fails(async () => S.unseal(kp.privateKey, flip(a.box), info)) && await fails(async () => S.unseal(other.privateKey, a.box, info)) && await fails(async () => S.unseal(kp.privateKey, "A".repeat(300), info)) && await fails(async () => S.unseal(kp.privateKey, "", info)), "改过一个字符的、换一把私钥的、乱写的，都解不开");
  const der = QL.questPem(pem);
  ok(der && Buffer.compare(Buffer.from(der), Buffer.from(spki)) === 0 && QL.questPem("-----BEGIN PUBLIC KEY-----\n!!!\n-----END PUBLIC KEY-----") === null && QL.questPem("") === null && QL.questPem(null) === null, "公钥从 PEM 里读出来；不像样的读不出来");
  ok(await fails(() => QL.questSeal(new Uint8Array(91), obj, info)), "公钥不对时封不了，报错而不是给出一份没用的东西");
  ok(!QL.questBoxOk("A".repeat(127)) && !QL.questBoxOk("A".repeat(60001)) && !QL.questBoxOk("A".repeat(200) + "=") && !QL.questBoxOk("A".repeat(201)) && !QL.questBoxOk(null) && QL.questBoxOk("A".repeat(200)), "太短、太长、带别的字符、长度不可能的，样子就不对");
  const P = S.payloadOf;
  ok(typeof P({ name: "x", p: { a: 1 }, code: UPDOWN }) === "object" && P({ code: UPDOWN }).name === "" && JSON.stringify(P({ code: UPDOWN }).p) === "{}", "解开以后像一条规则的：名字、参数可以没有");
  ok([null, [], {}, { code: "" }, { code: "var x = 1;" }, { code: "function decide(s, p) { return 1 +; }" }, { code: UPDOWN, p: { "bad key": 1 } }, { code: UPDOWN, p: { a: "1" } }, { code: UPDOWN, p: [1] }, { code: "function decide(s,p){return 1;}" + " ".repeat(20001) }].every(x => typeof P(x) === "string"), "不像样的（没有 decide、语法错、参数不是数、太长）一律不收，原因里不带内容");
  ok(P({ name: "  带\u0001控制符  " + "长".repeat(60), code: UPDOWN }).name.length === 40 && !/[\u0000-\u001f]/.test(P({ name: "a\u0001b\nc", code: UPDOWN }).name), "名字去掉控制符、截到 40 个字");
}

section("十、结算：从取回封着的规则，到公布成绩");
{
  const seal = o => QL.questSeal(spki, o, info);
  const A1 = await seal({ name: "先试试", p: {}, code: "function decide(s, p) { return 0.5; }" }), A2 = await seal({ name: "涨跌各一成", p: { start: 1, step: 0.1 }, code: UPDOWN });
  const B = await seal({ name: "一口价两块", p: { x: 2 }, code: "function decide(s, p) { return p.x; }" }), C = await seal({ name: "事后改的", p: {}, code: "function decide(s, p) { return 3; }" });
  const F = await seal({ name: "死循环", p: {}, code: "function decide(s, p) { while (true) {} }" }), G = await seal({ name: "半路出错", p: {}, code: "function decide(s, p) { if (s.t === 3) throw new Error('boom'); return 1; }" });
  const B2 = await seal({ name: "也是两块", p: { x: 2 }, code: "function decide(s, p) { return p.x; }" }), KT = await seal({ name: "撤下的", p: {}, code: "function decide(s, p) { return 4; }" });
  const H = await seal({ name: "语法错", p: {}, code: "function decide(s, p) { return 1 +; }" }), X = await seal({ name: "想偷东西", p: {}, code: "var leak = typeof process + typeof require + typeof fetch;\nfunction decide(s, p) { if (leak !== 'undefinedundefinedundefined') throw new Error(leak); return 1; }" });
  let num = 10;
  const issue = (user, box, at, over) => { const n = ++num, o = Object.assign({ day: DAY, cid: spec.cid }, over || {}); return { number: n, title: QLHub.title("quest", DAY + " x · 封好的规则"), body: QLHub.pack({ kind: "quest", day: o.day, cid: o.cid, v: 2, kid: "t", box }, "", "说明"), user: { login: user, id: 1000 + n, avatar_url: "https://avatars.githubusercontent.com/u/" + (1000 + n) + "?v=4" }, html_url: "https://github.com/x/y/issues/" + n, created_at: at, updated_at: o.upd || at, reactions: {}, comments: 0 }; };
  const issues = [issue("alice", A1.box, DAY + "T02:00:00Z"), issue("alice", A2.box, DAY + "T03:00:00Z"), issue("bob", B.box, DAY + "T05:00:00Z", { upd: NEXT + "T00:05:00Z" }), issue("carol", C.box, DAY + "T06:00:00Z", { upd: NEXT + "T00:03:00Z" }),
    issue("dave", A2.box, DAY + "T07:00:00Z"), issue("erin", "A".repeat(300), DAY + "T08:00:00Z"), issue("frank", F.box, DAY + "T09:00:00Z"), issue("gina", G.box, DAY + "T10:00:00Z"), issue("hank", H.box, DAY + "T11:00:00Z"),
    issue("ivy", B.box, DAY + "T12:00:00Z", { cid: "other.1" }), issue("late", B.box, NEXT + "T00:00:05Z"), issue("xena", X.box, DAY + "T13:00:00Z"),
    issue("ivan", A1.box, DAY + "T14:00:00Z"), issue("judy", B2.box, DAY + "T15:00:00Z"), Object.assign(issue("kate", KT.box, DAY + "T16:00:00Z"), { state: "closed" }), issue("leo", KT.box, DAY + "T17:00:00Z")];
  const sig = crypto.randomBytes(48), rnd = crypto.createHash("sha256").update(sig).digest("hex"), posted = [], calls = [], logs = [], env = { drand: "ok", gql: "ok" };
  const res = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj });
  const fetch = async (url, init) => {
    calls.push((init && init.method || "GET") + " " + url.replace(/\?.*$/, ""));
    if (/\/issues\?/.test(url)) return res(200, /page=1&/.test(url) ? issues.concat(posted) : []);
    if (/\/graphql$/.test(url)) { if (env.gql === "bad") return res(200, { errors: [{ message: "nope" }] }); const q = JSON.parse(init.body).query, d = {}; (q.match(/i(\d+):/g) || []).forEach(x => { const n = +x.slice(1, -1); d["i" + n] = env.gql === "gone" && n === 13 ? null : { lastEditedAt: n === 14 ? NEXT + "T00:02:30Z" : null }; }); return res(200, env.gql === "gone" ? { data: { repository: d }, errors: [{ type: "NOT_FOUND", message: "Could not resolve to an Issue" }] } : { data: { repository: d } }); }
    if (/drand/.test(url)) { if (env.drand === "down") throw new Error("down"); const s2 = env.drand === "split" && /api2/.test(url) ? crypto.randomBytes(48) : sig; return res(200, { round, randomness: crypto.createHash("sha256").update(s2).digest("hex"), signature: s2.toString("hex") }); }
    if (/\/issues$/.test(url) && init.method === "POST") { const b = JSON.parse(init.body), n = ++num; posted.push({ number: n, title: b.title, body: b.body, user: { login: S.BOT, id: 41898282 }, html_url: "https://github.com/x/y/issues/" + n, created_at: NEXT + "T00:20:00Z", updated_at: NEXT + "T00:20:00Z" }); return res(201, { number: n }); }
    return res(404, {});
  };
  const base = { day: DAY, key: kp.privateKey, fetch, repo: "ZechenBian/ZechenBian.github.io", token: "t", mode: "process", image: "", now: () => Date.parse(NEXT + "T00:20:00Z"), log: s => logs.push(s), entryMs: 3000, allowUnsandboxed: true };
  ok((await S.settleDay(Object.assign({}, base, { now: () => dead + 10000 }))).status === "early" && (await S.settleDay(Object.assign({}, base, { day: "2026-10-13" }))).status === "none" && calls.length === 0, "截止之后没过多久（随机数还没出来）不结算；比第一道题还早的日子没有题；这两种情况什么也不去取");
  ok(await fails(() => S.settleDay(Object.assign({}, base, { allowUnsandboxed: false }))) && posted.length === 0, "没有真的隔离（子进程）算出来的结果不许公布");
  const dry = await S.settleDay(Object.assign({}, base, { dryRun: true }));
  ok(dry.status === "dry" && posted.length === 0 && dry.meta.rows.length === 9, "演练：照常解开、跑一遍，但不公布");
  const r = await S.settleDay(base), rows = r.meta.rows, by = u => rows.filter(x => x.user === u)[0];
  ok(r.status === "posted" && posted.length === 1 && rows.map(x => x.user).join() === "alice,bob,judy,xena,dave,frank,gina,ivan,leo", "结算：有成绩的按成绩排在前面，没成绩的在后面", rows.map(x => x.user + (x.fin ? "=" + x.fin.mean.toFixed(2) : "")).join());
  // 引擎直接算：结算的几组上各打 K 局
  const fin = QL.questFinSeeds(spec, rnd), game = comp(spec.canon, ["deal", "show", "referee"]), gp = Object.freeze(Object.assign({}, spec.p));
  const direct = (code, p, slot) => { const Pl = Object.assign(comp(code, ["init", "decide"]), { id: "x", p: Object.freeze(Object.assign({}, p)) }); let s = 0, n = 0; for (const sd of fin) for (let k = 0; k < spec.sets.K; k++) { s += QL.shopEpisode(game, gp, spec.T, sd, k, Pl, slot, null).score; n++; } return s / n; };
  near(by("alice").fin.mean, direct(UPDOWN, { start: 1, step: 0.1 }, Q.slot), 1e-9, "结算出来的成绩，和引擎在结算的几组上直接算的一样（alice）");
  near(by("bob").fin.mean, direct("function decide(s, p) { return p.x; }", { x: 2 }, Q.slot), 1e-9, "…（bob）");
  ok(by("alice").n === 12 && by("alice").tries === 2 && by("alice").name === "涨跌各一成" && by("alice").ch === A2.ch && by("alice").uid === 1012 && by("alice").pub && Number.isFinite(by("alice").fin.se) && Number.isFinite(by("alice").fin.d), "同一个账号只算截止前最后交的那一条；公布的有名字、记号、结算和公开两头的成绩");
  ok(by("bob").fin && r.meta.skipped.edited === 1 && !by("carol"), "截止之后只是被评论过的照算；截止之后改过正文的作废（问 GraphQL 才分得清）");
  ok(by("dave").dup === 12 && by("dave").dupUser === "alice" && by("dave").fin === null && by("dave").name === "", "把别人封好的那一份原样再交一遍：同一份密文出现在两个账号名下，后来的那个不排名，也不去解它（名字是空的）");
  ok(by("ivan").dup === 11 && by("ivan").dupUser === "alice" && by("ivan").fin === null, "照搬的是别人中途交过、后来又换掉的那一份：一样不排名");
  ok(by("leo").dup === 25 && by("leo").dupUser === "kate" && !by("kate"), "照搬的是别人交了又撤下（关掉）的那一份：一样不排名；撤下的那一条自己也不算");
  ok(by("judy").fin && by("judy").dup === 0 && by("judy").fin.mean === by("bob").fin.mean && rows.indexOf(by("bob")) < rows.indexOf(by("judy")), "两个人各自写出一模一样的规则、各自封好交上来：都算数，同分，先交的排前面");
  ok(r.meta.skipped.sealed === 2 && !by("erin") && !by("hank") && !by("ivy") && !by("late"), "解不开的、解开以后不成样子的不算；别的题的、截止之后交的根本不在其中");
  ok(by("frank").err === "timeout" && by("frank").fin === null && by("gina").err === "error" && by("xena").fin && by("xena").err === "", "死循环的算超时，中途出错的记一笔，都不影响别人；想摸 process、require、fetch 的那条什么也摸不到");
  const refD = spec.refs.map((x, i) => direct(x.canon, x.p, i));
  ok(r.meta.refs.length === spec.refs.length && r.meta.refs.every((x, i) => x.id === spec.refs[i].id && Math.abs(x.fin.mean - refD[i]) < 1e-9) && r.meta.round === round && r.meta.randomness === rnd && r.meta.cid === spec.cid, "结果里带着基准规则的成绩（页面拿它和自己算的对）、用的是哪一轮随机数、哪一道题");
  const text = logs.join("\n") + "\n" + calls.join("\n");
  ok(!/涨跌|一口价|死循环|st\.price|return p\.x|boom/.test(text) && /#12 @alice: scored/.test(text) && /#14 @carol: edited after the deadline/.test(text), "日志里只有编号、账号和每一步成没成；名字、参数、代码一个字都没有");
  ok(!/涨跌各一成"[^}]*"code"|st\.price|function decide/.test(posted[0].body) && posted[0].body.includes("没有代码") && posted[0].title === "[SL:result] " + DAY + " 给新产品定价 · 结算", "公布的那条 Issue 里没有代码", posted[0].title);
  // 页面那一头读结果
  const trusted = [S.BOT, "ZechenBian"], N = QLHub.norm, got = QL.questResult(posted.map(N), spec, trusted);
  ok(got && got.issue === posted[0].number && got.rows.length === 9 && got.rows[0].user === "alice" && got.rows[0].fin.mean === by("alice").fin.mean && got.rows[4].dup === 12 && got.rows[4].dupUser === "alice" && got.rows[5].err === "timeout" && got.skipped.edited === 1 && got.skipped.sealed === 2 && got.refs.length === spec.refs.length && got.by === S.BOT, "页面把这条 Issue 读成结果：名次、成绩、作废了几条都在");
  ok(QL.questResult(posted.map(x => N(Object.assign({}, x, { user: { login: "mallory", id: 5 } }))), spec, trusted) === null && QL.questResult(posted.map(x => N(Object.assign({}, x, { user: { login: "ZechenBian", id: 6 } }))), spec, trusted) !== null, "别人发一条一模一样的不认；仓库主人自己发的认");
  ok(QL.questResult(posted.map(x => N(Object.assign({}, x, { created_at: DAY + "T23:59:59Z" }))), spec, trusted) === null && QL.questResult(posted.map(N), Object.assign({}, spec, { cid: "other.1" }), trusted) === null && QL.questResult([], spec, trusted) === null && QL.questResult(null, spec, trusted) === null, "截止之前发的、别的题的不认；没有就是没有");
  const m0 = JSON.parse(JSON.stringify(r.meta)), bad = f => { const m = JSON.parse(JSON.stringify(m0)); f(m); return QL.questResultNorm(Object.assign({ sl: 1 }, m), spec); };
  ok(bad(m => {}) !== null && bad(m => { m.round++; }) === null && bad(m => { m.randomness = "zz"; }) === null && bad(m => { m.rows[0].user = "<img>"; }) === null && bad(m => { m.rows[1].n = m.rows[0].n; }) === null && bad(m => { m.rows = "x"; }) === null && bad(m => { m.v = 2; }) === null, "结果里的东西对不上（轮数、随机数、账号的样子、重复的编号）就整份不认");
  ok(bad(m => { m.rows[0].fin = { mean: "9e9", se: 1 }; }).rows[0].fin === null && bad(m => { m.rows[0].name = "x".repeat(99) + "\u0001"; }).rows[0].name.length === 40 && bad(m => { m.rows[4].dupUser = "<b>"; }).rows[4].dupUser === "", "成绩不是数的当没有成绩；名字照样去控制符、截短；照搬的是谁，不像账号的不要");
  // 已经公布过；重新结算；出岔子
  const n1 = posted.length; calls.length = 0;
  ok((await S.settleDay(base)).status === "done" && posted.length === n1 && !calls.some(c => /POST/.test(c)), "已经公布过的日子不再结算");
  const again = await S.settleDay(Object.assign({}, base, { force: true, now: () => Date.parse(NEXT + "T03:00:00Z") }));
  posted[posted.length - 1].created_at = NEXT + "T03:00:00Z";
  ok(again.status === "posted" && posted.length === n1 + 1 && QL.questResult(posted.map(N), spec, trusted).issue === posted[n1].number, "要求重新结算就再贴一条；页面认最新的那一条");
  posted.length = 0;
  env.drand = "split"; const split = await fails(() => S.settleDay(base)); env.drand = "down"; const down = await fails(() => S.settleDay(base)); env.drand = "ok";
  env.gql = "bad"; const gql = await fails(() => S.settleDay(base)); env.gql = "ok";
  ok(split && down && gql && posted.length === 0, "两个地址给的随机数不一样、随机数取不到、查不清谁在截止之后改过：都停下来，什么也不公布");
  env.gql = "gone"; const gone = await S.settleDay(Object.assign({}, base, { dryRun: true })); env.gql = "ok";
  ok(gone.status === "dry" && !gone.meta.rows.some(x => x.user === "bob") && gone.meta.skipped.edited === 2 && gone.meta.rows.some(x => x.user === "alice" && x.fin), "只有一条问不清（那条 Issue 刚好没了）：作废它自己，别人照常结算", JSON.stringify(gone.meta.skipped));
  // 沙盒里跑的那一小段（box.js）自己守住的几样
  const boxJob = code => S.runBox({ codes: [{ id: "game", code: spec.canon }, { id: "you", code }], msg: { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: 20, seeds: [1, 2], cut: 1, entries: [{ id: "you", p: {}, slot: Q.slot }] } }, { mode: "process", image: "", timeout: 20000 });
  const plain = await boxJob("function decide(s, p) { return 1; }");
  const sneaky = await boxJob("import(\"fs\").catch(function (e) { var P = e.constructor.constructor(\"return process\")(); P.stdout.write(\"GARBAGE\"); });\nfunction decide(s, p) { return 1; }");
  ok(plain.ok && sneaky.ok && sneaky.result.rows[0].mean === plain.result.rows[0].mean, "规则里用 import() 想借着报错摸到外面的东西：结果一写完进程就退出，它留下的回调没有机会运行，成绩也改不了");
  const trace = await boxJob("Error.prepareStackTrace = function (e, fr) { return fr; };\nfunction decide(s, p) { return 1; }"), evil = await boxJob("var g = (0, eval)(\"this\");\nfunction decide(s, p) { return 1; }");
  ok(!trace.ok && /not extensible/.test(trace.error) && !evil.ok && /Code generation/.test(evil.error), "想改 Error.prepareStackTrace（借调用栈摸到全局对象）、想用 eval：都办不到，这条规则直接算失败");
  ok(S.payloadOf({ code: "import(\"fs\");\n" + UPDOWN }) === "uses import" && S.payloadOf({ code: "var m = import/* x */(\"fs\");\n" + UPDOWN }) === "uses import" && S.payloadOf({ code: "// import nothing\n" + UPDOWN }) === "uses import" && typeof S.payloadOf({ code: UPDOWN.replace("return st.price;", "var important = 1, reimport_ = 2; return st.price;") }) === "object", "代码里出现 import 这个词的规则结算的时候不收（中间夹注释、写在注释里的也一样；只是名字里带这几个字母的不受牵连）");
  // 封着的规则没有人看得到，所以下面这些得靠程序自己守住
  const rowOf = (r, id) => r.ok && r.result.rows.filter(x => x.id === id)[0], NAMES = "typeof self + typeof globalThis + typeof postMessage + typeof onmessage + typeof QL + typeof __CODE + typeof __posts + typeof __msg + typeof process + typeof require + typeof module + typeof fetch + typeof performance";
  const names = await boxJob("var leak = " + NAMES + ";\nfunction decide(s, p) { if (leak !== \"" + "undefined".repeat(13) + "\") throw new Error(leak); return (" + NAMES + ") === \"" + "undefined".repeat(13) + "\" ? 1 : 0; }");
  ok(names.ok && !rowOf(names, "you").err && rowOf(names, "you").mean === rowOf(plain, "you").mean, "规则叫得出名字的东西里，没有线程自己、全局对象、发消息的函数、任务的参数（里面有结算的种子），也没有 Node 的任何东西", JSON.stringify(names).slice(0, 300));
  const host = await boxJob("var P = constructor.constructor(\"return process\")();\nfunction decide(s, p) { return 1; }"), host2 = await boxJob("function decide(s, p) { return toString.constructor(\"return 1\")(); }");
  ok(!host.ok && /Code generation/.test(host.error) && host2.ok && /Code generation/.test(rowOf(host2, "you").err), "顺着 constructor、toString 这些名字摸不到外面那一层的 Function：上下文的全局对象不是从外面带进去的");
  const base0 = spec.refs[0], boxPair = code => S.runBox({ codes: [{ id: "game", code: spec.canon }, { id: "ref", code: base0.canon }, { id: "you", code }], msg: { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: 20, seeds: QL.questPubSeeds(spec).slice(0, 2), cut: 1, entries: [{ id: "ref", p: base0.p, slot: 0 }, { id: "you", p: {}, slot: Q.slot }] } }, { mode: "process", image: "", timeout: 20000 });
  const pair = await boxPair("function decide(s, p) { return 1; }");
  const rebind = await boxJob("Math = { min: function () { return 1e9; }, max: function () { return 1e9; } };\nfunction decide(s, p) { return 1; }"), lazy = await boxPair("function decide(s, p) { isFinite = function () { return true; }; return 1; }");
  ok(!rebind.ok && /read only/.test(rebind.error) && lazy.ok && /read only/.test(rowOf(lazy, "you").err) && pair.ok && !rowOf(pair, "you").err && rowOf(lazy, "ref").mean === rowOf(pair, "ref").mean && rowOf(lazy, "ref").parts[0].mean === rowOf(pair, "ref").parts[0].mean, "想把 Math、isFinite 这些全局的名字整个换掉（裁判要用它们）：办不到。写在顶层的整条失败，写在 decide 里的算规则自己出错", String(rebind.error) + " | " + JSON.stringify(lazy).slice(0, 200));
  const tamper = await boxJob("var won = 0;\ntry { Object.getPrototypeOf(new Map().entries()).next = function () {}; won++; } catch (e) {}\ntry { BigInt.prototype.toString = function () {}; won++; } catch (e) {}\ntry { Promise.resolve = null; won++; } catch (e) {}\ntry { parseFloat = function () { return 1; }; won++; } catch (e) {}\ntry { Intl.x = 1; won++; } catch (e) {}\ntry { Object.defineProperty(Object.prototype, \"g0\", { get: function () { return this; } }); won++; } catch (e) {}\ntry { console.log = 1; won++; } catch (e) {}\ntry { Object.defineProperty(Math.max, \"apply\", { value: function () { return 1e9; } }); won++; } catch (e) {}\ntry { Object.defineProperty(Object.prototype.hasOwnProperty, \"call\", { value: function () { return true; } }); won++; } catch (e) {}\ntry { Array.prototype.push.mark = 1; won++; } catch (e) {}\ntry { Object.defineProperty(Object.getOwnPropertyDescriptor(Map.prototype, \"size\").get, \"call\", { value: 1 }); won++; } catch (e) {}\nfunction decide(s, p) { if (won) throw new Error(\"won \" + won); return 1; }");
  ok(tamper.ok && !rowOf(tamper, "you").err && rowOf(tamper, "you").mean === rowOf(plain, "you").mean, "内置的东西一样也改不动：迭代器的原型、BigInt、Promise、parseFloat、Intl、Object.prototype（想借它拿到全局对象）；连内置函数本身也添不了东西（不然给 Math.max 添一个 apply，裁判用 Math.max.apply 时调到的就是规则的函数）", JSON.stringify(tamper).slice(0, 300));
  const usual = await boxJob("function Foo() { this.a = 1; }\nFoo.prototype.go = function () { return this.a; };\nvar m = new Map(); m.set(1, 2); var arr = [3, 1, 2].sort(function (a, b) { return a - b; });\nclass K { constructor() { this.v = 1; } get w() { return this.v; } }\nfunction* g() { yield 1; }\nfunction decide(s, p, st) { st.n = (st.n || 0) + 1; return new Foo().go() * new K().w * g().next().value * arr[0] * (m.get(1) - 1) * Math.max.apply(null, [0, 1]) * JSON.parse(\"1\"); }");
  ok(usual.ok && !rowOf(usual, "you").err && rowOf(usual, "you").mean === rowOf(plain, "you").mean, "冻成这样，规则里平常的写法照样能用：自己的构造函数和类、Map、排序、生成器、Math.max.apply、JSON", JSON.stringify(usual).slice(0, 300));
  const self2 = await boxJob("function decide(s, p) { this.slot = 0; return 1; }"), self3 = await boxJob("function decide(s, p) { return Object.isFrozen(this) && Object.isFrozen(s) && Object.isFrozen(p) && Object.isFrozen(s.g) ? 1 : 0; }");
  ok(self2.ok && /read only|Cannot assign/.test(rowOf(self2, "you").err) && self3.ok && rowOf(self3, "you").mean === rowOf(plain, "you").mean, "规则被调用时拿到的 this（它自己的那份记录）、看到的东西、参数都是冻住的");
  const out1 = "return {}; })(); self.postMessage({ type: \"done\", result: { rows: [] } }); (function () { \"use strict\"; function decide(s, p) { return 1; }";
  const broke = await boxJob(out1);
  ok(!broke.ok && /syntax error in you/.test(broke.error) && S.payloadOf({ code: out1 }) === "syntax error" && QLJobs.syntax(out1) !== "", "想提前把包着规则的那层函数收掉、跑到外面去发一条假的“算完了”：这样的代码自己不是一段完整的函数体，语法检查就过不了", String(broke.error));
  const self = await S.sandboxOk({ mode: "process", image: "" });
  ok(typeof self === "string" && self.length > 0, "开工之前的自查：没有真的关住（这里是普通的子进程）就查得出来，不往下干", self);
  // 容器那一层在测试里起不来。拿一个假的 docker 命令顶替（它把 box.js 直接当子进程跑，什么也没隔离），查三件事：
  // 开容器时带的那些限制一样不少；超时了会去把容器停掉；开工之前的自查发现"根本没关住"，就什么也不干
  {
    const os = require("os"), shim = fs.mkdtempSync(path.join(os.tmpdir(), "sl-docker-")), shimLog = path.join(shim, "calls.log"), oldPath = process.env.PATH;
    fs.writeFileSync(path.join(shim, "docker"), "#!/bin/sh\necho \"$@\" >> \"" + shimLog + "\"\nif [ \"$1\" = \"run\" ]; then exec \"" + process.execPath + "\" \"" + path.join(DAILY, "box.js") + "\"; fi\nif [ \"$1\" = \"kill\" ]; then exit 0; fi\nexit 1\n", { mode: 0o755 });
    process.env.PATH = shim + path.delimiter + oldPath;
    const job1 = { codes: [{ id: "game", code: spec.canon }, { id: "you", code: "function decide(s, p) { return 1; }" }], msg: { kind: "quest", game: "game", gp: spec.p, T: spec.T, K: 20, seeds: [1, 2], cut: 1, entries: [{ id: "you", p: {}, slot: Q.slot }] } };
    const viaDocker = await S.runBox(job1, { mode: "docker", image: "node:22-alpine", timeout: 20000 }), line = fs.readFileSync(shimLog, "utf8").split("\n").filter(l => /^run /.test(l))[0] || "";
    ok(viaDocker.ok && viaDocker.result.rows[0].mean === plain.result.rows[0].mean, "容器模式：任务从标准输入进去，结果从标准输出出来，和子进程模式算的一样");
    ok(["run --rm -i --name sl-quest-", "--network none", "--read-only", "--cap-drop ALL", "--security-opt no-new-privileges", "--user 65534:65534", "--pids-limit 128", "--memory 1g", "--memory-swap 1g", "--cpus 1", "--workdir /", "-v " + path.join(DAILY, "..") + ":/sl:ro", "node:22-alpine node --max-old-space-size=768 /sl/daily/box.js"].every(x => line.includes(x)) && !/ -e |--env|--privileged|docker\.sock|--network host|:rw/.test(line), "开容器的命令：没有网络、文件只读、去掉所有权限、不是 root、限内存和进程数，引擎只读挂进去；不带任何环境变量，也不挂别的东西", line);
    const slow = await S.runBox({ codes: [{ id: "game", code: spec.canon }, { id: "you", code: "function decide(s, p) { while (true) {} }" }], msg: job1.msg }, { mode: "docker", image: "node:22-alpine", timeout: 1500 });
    // "去停容器"的那条命令是另起的一个进程，和这边收到"超时"的先后不一定：等它一小会儿
    let killed = false; for (let i = 0; i < 40 && !killed; i++) { killed = /^kill sl-quest-[0-9a-f]{12}$/m.test(fs.readFileSync(shimLog, "utf8")); if (!killed) await new Promise(r => setTimeout(r, 50)); }
    ok(slow.timedOut && !slow.ok && slow.error === "timeout" && killed, "容器模式下超时：记成超时，并且按名字去把那个容器停掉");
    const notSafe = await S.sandboxOk({ mode: "docker", image: "node:22-alpine" });
    ok(typeof notSafe === "string" && /can write to|runs as root|network works|DNS works/.test(notSafe), "这个假的 docker 什么也没隔离：自查查得出来", notSafe);
    const cli = cp.spawnSync(process.execPath, [path.join(DAILY, "settle.js"), "--day=" + DAY], { encoding: "utf8", env: { PATH: process.env.PATH, QUEST_PRIVATE_KEY: kp.privateKey.export({ type: "sec1", format: "pem" }) } });
    ok(cli.status === 1 && /The sandbox is not safe to use/.test(cli.stdout) && /Nothing was run/.test(cli.stdout) && !/challenge|published|sealed entr/.test(cli.stdout) && !cli.stdout.includes("BEGIN"), "命令行：自查不过就停在那里，什么也不取、什么也不解；私钥不进日志", cli.stdout.slice(0, 400));
    process.env.PATH = oldPath; fs.rmSync(shim, { recursive: true, force: true });
  }
  const run = args => cp.spawnSync(process.execPath, [path.join(DAILY, "settle.js")].concat(args), { encoding: "utf8", env: { PATH: process.env.PATH } });
  const noKey = run([]), noBox = cp.spawnSync(process.execPath, [path.join(DAILY, "settle.js"), "--sandbox=process"], { encoding: "utf8", env: { PATH: process.env.PATH, QUEST_PRIVATE_KEY: kp.privateKey.export({ type: "sec1", format: "pem" }) } });
  ok(noKey.status === 0 && /QUEST_PRIVATE_KEY is not set/.test(noKey.stdout) && noBox.status === 1 && /no isolation/.test(noBox.stdout), "命令行：没有私钥就什么也不做（不算出错）；不开容器又不是演练，拒绝");
}

done();
})().catch(e => { console.log("CRASH", e && e.stack || e); process.exit(1); });
