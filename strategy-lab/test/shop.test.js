// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 世界工坊的引擎（shop.js）：一局怎么打、规则看到什么、出了错算谁的；两个样板世界和两套样板玩法里写的结论，拿模拟和精确计算去对。
// 任务那一层和 jobs.test.js 一样，把线程的源码原样放进全新的 vm 环境里执行。
const vm = require("vm"), path = require("path"), { QL, STRATS, compile, compileWorld, defaults, ok, near, section, done } = require("./harness.js");
global.QL_CORE = require(path.join(__dirname, "../src/core.js"));
global.QL_SHOP_INSTALL = require(path.join(__dirname, "../src/shop.js"));
const JI = require(path.join(__dirname, "../src/jobs.js")), QLJobs = JI.QLJobs;
JI(QL); global.QL_SHOP_INSTALL(QL);
const SH = QL.SHOP, W = id => SH.worlds.filter(w => w.id === id)[0], G = id => SH.games.filter(g => g.id === id)[0];
const compGame = code => new Function('"use strict";\n' + code + '\n;return { deal: typeof deal === "function" ? deal : null, show: typeof show === "function" ? show : null, referee: typeof referee === "function" ? referee : null };')();
const compRule = code => new Function('"use strict";\n' + code + '\n;return { init: typeof init === "function" ? init : null, decide: typeof decide === "function" ? decide : null };')();
const player = (g, id, over) => { const r = g.rules.filter(x => x.id === id)[0], S = compRule(r.code); return { id, decide: S.decide, init: S.init, p: Object.freeze(Object.assign({}, r.p, over || {})) }; };
const fix = (id, f) => ({ id, init: null, decide: typeof f === "function" ? f : () => f, p: Object.freeze({}) });
function program(codes) {
  const built = QLJobs.source(codes), posts = [], self = { postMessage: m => posts.push(JSON.parse(JSON.stringify(m, (k, v) => (v === -Infinity ? "-inf" : v === Infinity ? "inf" : v !== v ? "nan" : v)))), onmessage: null };
  const ctx = vm.createContext({ self, console, performance });
  vm.runInContext(built.src, ctx, { filename: "job.js" });
  return { posts, ctx, built, send: m => self.onmessage({ data: m }) };
}
function runJob(codes, msg) { const P = program(codes); P.send(Object.assign({ type: "job" }, msg)); const last = P.posts[P.posts.length - 1]; return Object.assign(P, { last, result: last.type === "done" ? last.result : null }); }
const num = v => (v === "-inf" ? -Infinity : v === "nan" ? NaN : v);

section("一、样板");
{
  ok(SH.worlds.length === 2 && SH.games.length === 2 && new Set(SH.worlds.concat(SH.games).map(x => x.id)).size === 4, "两个样板世界、两套样板玩法");
  ok(SH.worlds.every(w => { const S = compileWorld(w.code); return typeof S.simulate === "function" && QLJobs.syntax(w.code) === "" && w.name && w.summary.length > 6 && w.explain.length > 20 && w.schema.length >= 2 && w.schema.every(q => q.type === "num" && q.def >= q.min && q.def <= q.max && q.step > 0) && w.K > 0 && w.T >= 10; }), "世界：代码编得过，有名字、说明和参数表，默认值都在范围里");
  ok(SH.games.every(g => { const S = compGame(g.code); return S.deal && S.show && S.referee && QLJobs.syntax(g.code) === "" && g.name && g.summary.length > 6 && g.about.length > 40 && g.T >= 1 && g.rules.length >= 3 && new Set(g.rules.map(r => r.id)).size === g.rules.length; }), "玩法：发牌、亮牌、判分三个函数都有，带至少三条规则");
  ok(SH.games.every(g => g.rules.every(r => { const S = compRule(r.code); return typeof S.decide === "function" && QLJobs.syntax(r.code) === "" && r.name && r.summary; })), "玩法带的每条规则都编得过");
}

section("二、给规则看的东西只是一份抄件");
{
  const arr = [1, 2, 3], inner = { deep: 1 }, obj = { a: 5, b: arr, c: inner, d: "x".repeat(200), e: true, f: () => 1, g: null, h: new Float64Array([7, 8]) };
  const s1 = QL.shopSee(arr), s2 = QL.shopSee(obj);
  ok(QL.shopSee(3.5) === 3.5 && Number.isNaN(QL.shopSee(undefined)) && Number.isNaN(QL.shopSee(null)) && QL.shopSee(true) === 1 && QL.shopSee("ab") === "ab" && Number.isNaN(QL.shopSee(() => 1)), "数原样给；没有就是 NaN；真假变成 1 和 0；函数不给");
  ok(s1 !== arr && Object.isFrozen(s1) && s1.join(",") === "1,2,3", "数组抄一份再给，冻住");
  ok(s2 !== obj && Object.isFrozen(s2) && s2.a === 5 && s2.b !== arr && s2.b.join(",") === "1,2,3" && Number.isNaN(s2.c) && s2.d.length === 80 && s2.e === 1 && Number.isNaN(s2.f) && Number.isNaN(s2.g) && s2.h.join(",") === "7,8", "对象只留一层：里面的数、数组、短字符串留下，再深一层的不给", JSON.stringify(s2));
  ok(QL.shopSee(new Array(1000).fill(1)).length === 256 && Object.keys(QL.shopSee(Object.fromEntries(new Array(100).fill(0).map((_, i) => ["k" + i, i])))).length === 32, "太长的数组、字段太多的对象截短");
}

section("三、一局怎么打");
{
  const seen = [], calls = [];
  const game = { deal: (T, rng, p) => { calls.push(["deal", T, p]); const xs = []; for (let t = 0; t < T; t++) xs.push(rng.u()); return { xs, sum: 0 }; }, show: (Gm, t) => ({ x: Gm.xs[t], hist: Gm.xs.slice(0, t) }), referee: (Gm, t, a) => { calls.push(["ref", t, a]); Gm.sum += a === a ? a : 0; return a === a ? a * Gm.xs[t] : -1; } };
  const gp = Object.freeze({ q: 0.3 });
  const spy = { id: "spy", init: p => ({ n: 0, pp: p }), decide: (s, p, st) => { seen.push({ s, frozen: Object.isFrozen(s), keys: Object.keys(s).sort().join(","), st, p }); st.n++; return s.t === 2 ? NaN : s.t === 3 ? "x" : 1; }, p: Object.freeze({ a: 1 }) };
  const ep = QL.shopEpisode(game, gp, 6, 11, 0, spy, 0, null);
  ok(seen.length === 6 && seen.every(o => o.frozen) && seen[0].keys === "T,g,last,rnd,see,t,total", "每回合给规则一个新的、冻住的对象，字段就是说明里写的那些", seen[0].keys);
  ok(seen[0].s.t === 0 && seen[0].s.T === 6 && seen[0].s.g === gp && seen[0].s.last !== seen[0].s.last && seen[0].s.total === 0 && seen[5].st.n === 6 && seen[0].st.pp === spy.p && seen[2].p.a === 1, "第一回合没有\"上一回合\"；状态一局里一直是同一个；init 和 decide 拿到的参数是同一份");
  ok(seen.every((o, t) => typeof o.s.see.x === "number" && o.s.see.hist.length === t && Object.isFrozen(o.s.see)) && seen[1].s.last === seen[0].s.see.x && Math.abs(seen[2].s.total - (seen[0].s.see.x + seen[1].s.see.x)) < 1e-12, "看到的是亮牌给的东西；上一回合的得分和累计得分跟着走");
  ok(ep.bad === 2 && ep.rounds === 6 && calls.filter(c => c[0] === "ref" && c[2] !== c[2]).length === 2 && calls[0][0] === "deal" && calls[0][1] === 6 && calls[0][2] === gp, "规则报的不是数：裁判收到 NaN，并且记一次数", JSON.stringify(ep));
  near(ep.score, seen[0].s.see.x + seen[1].s.see.x - 1 - 1 + seen[4].s.see.x + seen[5].s.see.x, 1e-12, "一局的得分是各回合得分的总和");
  const again = QL.shopEpisode(game, gp, 6, 11, 0, fix("one", 1), 3, null), other = QL.shopEpisode(game, gp, 6, 11, 1, fix("one", 1), 3, null), seed2 = QL.shopEpisode(game, gp, 6, 12, 0, fix("one", 1), 3, null);
  ok(Math.abs(again.score - (seen[0].s.see.x + seen[1].s.see.x + seen[2].s.see.x + seen[3].s.see.x + seen[4].s.see.x + seen[5].s.see.x)) < 1e-12 && other.score !== again.score && seed2.score !== again.score, "同一个种子、同一局：发给每条规则的牌是同一副；换一局、换种子就换牌");
  const rnds = []; QL.shopEpisode(game, gp, 3, 11, 0, fix("r", s => { rnds.push(s.rnd()); return 0; }), 0, null); const rnds2 = []; QL.shopEpisode(game, gp, 3, 11, 0, fix("r", s => { rnds2.push(s.rnd()); return 0; }), 1, null); const rnds3 = []; QL.shopEpisode(game, gp, 3, 11, 0, fix("r", s => { rnds3.push(s.rnd()); return 0; }), 0, null);
  ok(rnds.every(u => u > 0 && u < 1) && rnds.join() === rnds3.join() && rnds.join() !== rnds2.join(), "s.rnd() 可复现；排在不同位置的规则拿到的随机数不同");
  // 提前结束
  const stopper = { deal: () => ({ n: 0 }), show: Gm => Gm.n, referee: (Gm, t, a) => { Gm.n++; if (a === 0) { Gm.over = true; return 10; } return 1; } };
  const e1 = QL.shopEpisode(stopper, {}, 50, 1, 0, fix("s", s => (s.t === 4 ? 0 : 1)), 0, null), e2 = QL.shopEpisode(stopper, {}, 50, 1, 0, fix("s", 1), 0, null);
  ok(e1.rounds === 5 && e1.score === 14 && e2.rounds === 50 && e2.score === 50, "裁判把 G.over 设成 true，这一局到此为止", JSON.stringify(e1));
  const noShow = QL.shopEpisode({ deal: () => ({}), show: null, referee: () => 1 }, {}, 3, 1, 0, fix("s", s => (s.see !== s.see ? 1 : 0)), 0, null);
  ok(noShow.score === 3 && noShow.bad === 0, "玩法不写亮牌：规则看到的是 NaN");
  const log = []; QL.shopEpisode(stopper, {}, 50, 1, 0, fix("s", 1), 0, log);
  ok(log.length === 30 && log[0].see === 0 && log[0].a === 1 && log[0].gain === 1 && log[29].see === 29, "过程只记前 30 个回合");
  // 出错算谁的
  const thr = f => { try { f(); return null; } catch (e) { return e; } };
  const eRule = thr(() => QL.shopEpisode(stopper, {}, 5, 1, 0, fix("b", s => { if (s.t === 2) throw new Error("规则炸了"); return 1; }), 0, null));
  const eInit = thr(() => QL.shopEpisode(stopper, {}, 5, 1, 0, { id: "b", init: () => { throw new Error("init 炸了"); }, decide: () => 1, p: {} }, 0, null));
  ok(eRule && eRule.rule === true && /规则炸了/.test(eRule.message) && eInit && eInit.rule === true && /init 炸了/.test(eInit.message), "规则抛的错带着记号：是这条规则的事");
  const eRef = thr(() => QL.shopEpisode({ deal: () => ({}), show: null, referee: () => { throw new Error("裁判炸了"); } }, {}, 5, 1, 0, fix("s", 1), 0, null));
  const eNan = thr(() => QL.shopEpisode({ deal: () => ({}), show: null, referee: (Gm, t) => (t === 1 ? NaN : 1) }, {}, 5, 1, 0, fix("s", 1), 0, null));
  const eInf = thr(() => QL.shopEpisode({ deal: () => ({}), show: null, referee: () => Infinity }, {}, 5, 1, 0, fix("s", 1), 0, null));
  const eDeal = thr(() => QL.shopEpisode({ deal: () => 5, show: null, referee: () => 1 }, {}, 5, 1, 0, fix("s", 1), 0, null));
  const eShow = thr(() => QL.shopEpisode({ deal: () => ({}), show: () => { throw new Error("亮牌炸了"); }, referee: () => 1 }, {}, 5, 1, 0, fix("s", 1), 0, null));
  ok(eRef instanceof Error && !eRef.rule && /裁判炸了/.test(eRef.message) && eShow instanceof Error && !eShow.rule, "玩法自己抛的错不带记号：是玩法的事");
  ok(eNan instanceof Error && /第 1 回合/.test(eNan.message) && /NaN/.test(eNan.message) && eInf instanceof Error && /Infinity/.test(eInf.message), "裁判返回的不是有限的数：报出是第几回合", eNan && eNan.message);
  ok(eDeal instanceof Error && /deal/.test(eDeal.message), "发牌返回的不是对象：直接报错", eDeal && eDeal.message);
  // 规则改不动给它的东西
  const cheat = fix("c", (s, p) => { try { s.see = 99; } catch (e) {} try { s.total = 99; } catch (e) {} try { s.g.q = 9; } catch (e) {} try { p.z = 1; } catch (e) {} if (s.see && s.see.hist) { try { s.see.hist.push(1); } catch (e) {} try { s.see.x = 0; } catch (e) {} } return 1; });
  ok(QL.shopEpisode(game, gp, 6, 11, 0, cheat, 0, null).score === again.score && gp.q === 0.3, "规则改不动看到的东西、玩法的参数和自己的参数");
}

section("四、几条规则在同一套玩法里比");
{
  const g = G("s_guess"), game = compGame(g.code), gp = Object.freeze(Object.assign({}, g.p));
  const prog = [], out = QL.shopRun(game, gp, g.T, 400, 5, [player(g, "heads"), player(g, "major"), fix("boom", s => { if (s.t === 7) throw new Error("第八回合炸了"); return 1; }), fix("nan", NaN)], pm => prog.push(pm));
  const [a, b, c, d] = out.rows;
  ok(out.rows.length === 4 && out.rows.map(r => r.id).join() === "heads,major,boom,nan" && a.d === 0 && a.dse === 0 && a.err === "" && a.rounds === 50 && a.bad === 0, "每条规则一行；排第一的是基准，它和自己的差是 0");
  ok(isFinite(b.d) && Math.abs(b.d - (b.mean - a.mean)) < 1e-9 && b.dse > 0 && b.dse < Math.sqrt(a.se * a.se + b.se * b.se), "差是逐局相减再平均：同一副牌上比，标准误比各算各的小", JSON.stringify(b));
  ok(/炸了/.test(c.err) && c.mean !== c.mean && c.d !== c.d && d.err === "" && d.bad === 1 && isFinite(d.mean), "中途抛错的规则出局，别的规则照常比；报的不是数的规则照常比，只是全算坏动作", JSON.stringify([c, d]));
  ok(out.trace.length === 4 && out.trace[0].id === "heads" && out.trace[0].log.length === 30 && out.trace[0].score === QL.shopEpisode(game, gp, g.T, 5, 0, player(g, "heads"), 0, null).score && out.trace[2].log.length === 7 && out.trace[2].score !== out.trace[2].score, "记下每条规则第一局的过程（只记前 30 个回合）；出错的那条记到出错为止");
  ok(prog.length >= 4 + 3 * 2 && prog[0].id === "heads" && prog[0].k === 0 && prog.filter(p => p.id === "boom").length === 1, "打每条规则之前先报一声（卡住时外面知道是哪一条）");
  const again = QL.shopRun(game, gp, g.T, 400, 5, [player(g, "heads"), player(g, "major")], null), seed2 = QL.shopRun(game, gp, g.T, 400, 6, [player(g, "heads"), player(g, "major")], null);
  ok(again.rows[0].mean === a.mean && again.rows[1].mean === b.mean && seed2.rows[0].mean !== a.mean, "同一个种子给出同样的结果，换种子就变");
  const rev = QL.shopRun(game, gp, g.T, 400, 5, [player(g, "major"), player(g, "heads")], null);
  ok(rev.rows[0].mean === b.mean && rev.rows[1].mean === a.mean && Math.abs(rev.rows[1].d + b.d) < 1e-9, "这两条规则不用随机数：换个上场顺序，各自的得分不变");
  const refBoom = (() => { try { QL.shopRun({ deal: () => ({}), show: null, referee: (Gm, t) => { if (t === 2) throw new Error("裁判炸了"); return 1; } }, {}, 5, 10, 1, [fix("a", 1)], null); return null; } catch (e) { return e; } })();
  ok(refBoom instanceof Error && /裁判炸了/.test(refBoom.message), "玩法出错：整件事停下来");
}

section("五、样板玩法里写的结论");
{
  // 掷骰子：攒到 c 分就收的精确期望（回合数够多时）
  const val = c => { const memo = {}; const E = s => { if (s >= c) return s; if (memo[s] !== undefined) return memo[s]; let v = 0; for (let k = 2; k <= 6; k++) v += E(s + k) / 6; return (memo[s] = v); }; return E(0); };
  let best = 0, bc = 0; for (let c = 1; c <= 80; c++) { const v = val(c); if (v > best + 1e-12) { best = v; bc = c; } }
  ok(bc === 20 && Math.abs(val(21) - val(20)) < 1e-12 && Math.abs(val(1) - 20 / 6) < 1e-12, "精确计算：攒到 20 分就收的期望最高（8.14 分），21 分与它打平；掷一次就收是 3.33 分", bc + " " + best);
  const g = G("s_pig"), game = compGame(g.code), K = 40000;
  const out = QL.shopRun(game, Object.freeze({}), g.T, K, 2024, [player(g, "once"), player(g, "hold"), player(g, "greedy"), player(g, "hold", { c: 15 }), player(g, "hold", { c: 25 })], null);
  const [once, hold, greedy, c15, c25] = out.rows;
  near(once.mean, 20 / 6, 4 * once.se, "掷一次就收：模拟和 20/6 对得上");
  near(hold.mean, val(20), 4 * hold.se, "攒到 20 分就收：模拟和精确值 8.1418 对得上");
  near(greedy.mean, val(40), 4 * greedy.se, "攒到 40 分才收：模拟和精确值 6.3532 对得上");
  ok(hold.d > 10 * hold.dse && greedy.d > 10 * greedy.dse && hold.mean - greedy.mean > 1.5, "两条都比基准好得多；太贪的那条比 20 分那条每局少一分多");
  near(c15.mean, val(15), 4 * c15.se, "换成 15 分：还是和精确值对得上");
  near(c25.mean, val(25), 4 * c25.se, "换成 25 分：还是和精确值对得上");
  ok(once.rounds > 1.8 && once.rounds < 1.9 && hold.rounds > once.rounds && greedy.rounds > hold.rounds && out.rows.every(r => r.bad === 0 && !r.err), "掷一次就收平均打 1.83 个回合（掷出 1 时一回合就完）；越贪打得越久", once.rounds + " " + hold.rounds + " " + greedy.rounds);
  const never = QL.shopRun(game, Object.freeze({}), g.T, 2000, 3, [fix("never", 1)], null).rows[0];
  ok(never.mean < 0.5 && never.rounds < 7 && never.rounds > 5, "从不收手：几乎总是掷出 1（一局平均撑不到 6 个回合），回合用完才算收手", JSON.stringify(never));
  const about = g.about;
  ok(/20/.test(about) && /1\/6/.test(about) && /5\/6/.test(about), "说明里的那笔账：(1/6)·s = (5/6)·4 时 s = 20");

  // 猜硬币
  const g2 = G("s_guess"), game2 = compGame(g2.code), gp2 = Object.freeze(Object.assign({}, g2.p)), T = g2.T, K2 = 20000;
  const o2 = QL.shopRun(game2, gp2, T, K2, 77, [player(g2, "heads"), player(g2, "repeat"), player(g2, "major"), fix("tails", 0), fix("nan", NaN)], null);
  const [heads, repeat, major, tails, nan] = o2.rows;
  near(heads.mean, T * 0.5, 4 * heads.se, "总猜正面：平均猜对一半（q 的平均数是 0.5）");
  near(tails.mean, T * 0.5, 4 * tails.se, "总猜反面也是一半");
  ok(Math.abs(heads.mean + tails.mean - T) < 1e-9 && nan.mean === tails.mean && nan.bad === 1, "正面和反面的得分加起来正好是回合数；报的不是数算猜反面");
  // 上次是什么就猜什么：每回合猜对的概率 q² + (1−q)²，对 q 在 [0.2, 0.8] 上平均是 0.56；第一回合看不到上一次，猜反面，对的概率 0.5
  near(repeat.mean, 0.5 + (T - 1) * 0.56, 4 * repeat.se, "上次是什么就猜什么：0.5 + 49 × 0.56 = 27.94");
  ok(major.mean > repeat.mean + 2 && major.mean < T * 0.65 && major.d > 20 * major.dse, "跟着多数猜：比只看上一次好得多，又到不了知道 q 时的 0.65 × 50 = 32.5", String(major.mean));
  ok(/max\(q, 1 − q\)/.test(g2.about), "说明里写的是知道 q 时每回合 max(q, 1 − q)");
}

section("六、样板世界里写的结论");
{
  const evalRule = (w, over, strat, p, N, seed) => {
    const cfg = { type: "custom", params: Object.assign(defaults(w.schema), over || {}), N: N || 1000, T: w.T, K: w.K, seed: seed || 7, S0: 100 };
    const B = QL.makeBatch(cfg, { simulate: compileWorld(w.code).simulate }, 0), set = Object.assign({}, QL.DEFAULT_SET);
    const bench = QL.runBatch(B, QL.benchFor("custom"), {}, set, {}), sum = QL.summarize(QL.runBatch(B, strat, p, set, {}), set, bench), ws = QL.worldStats(B);
    return { d: sum.dGrowth, dse: sum.dGrowthSE, bench: QL.summarize(bench, set).growth, ws, B };
  };
  const mom = compile(STRATS.filter(s => s.id === "mom")[0].code), hold = compile(STRATS.filter(s => s.id === "hold")[0].code), fixed = compile(STRATS.filter(s => s.id === "const")[0].code);
  const walk = evalRule(W("w_walk"), {}, mom, { n: 1, size: 1, short: false }, 2000);
  near(walk.ws.annVol, 0.2, 0.004, "随机游走：年化波动就是 σ");
  near(walk.ws.annMean, 0.06, 4 * 0.2 / Math.sqrt(2000), "随机游走：年化收益的均值是 μ（4 个标准误之内）");
  ok(Math.abs(walk.ws.acf[0]) < 0.01 && walk.d < -5 * walk.dse, "随机游走：相邻两步不相关；只看前一天的动量规则比买入持有差（白交了成本）", walk.ws.acf[0] + " " + walk.d);
  near(walk.bench, 0.06 - 0.02, 4 * 0.2 / Math.sqrt(2000), "随机游走：买入持有的长期增长率是 μ − σ²/2");
  // Merton：f = μ/σ² = 1.5 的固定比例，增长率比满仓（f = 1）高 (μ f − σ² f²/2) − (μ − σ²/2) = 0.005，差得很小，这里只验方向不反
  const mer = evalRule(W("w_walk"), {}, fixed, { f: 1.5 }, 4000), f3 = evalRule(W("w_walk"), {}, fixed, { f: 3 }, 4000);
  ok(mer.d > -2 * mer.dse && f3.d < mer.d - 0.02, "随机游走：固定比例 f = μ/σ² = 1.5 不比买入持有差，f = 3 明显更差", mer.d + " " + f3.d);
  const K4 = evalRule(Object.assign({}, W("w_walk"), { K: 52, T: 104 }), {}, hold, {}, 2000);
  near(K4.ws.annVol, 0.2, 0.006, "第四个参数 K 传到了：换成每年 52 步，年化波动还是 σ");
  const lim = evalRule(W("w_limit"), {}, mom, { n: 1, size: 1, short: false }), loose = evalRule(W("w_limit"), { lim: 0.2 }, mom, { n: 1, size: 1, short: false }), def20 = evalRule(W("w_limit"), {}, mom, { n: 20, size: 1, short: true });
  ok(lim.ws.max <= Math.exp(0.02) - 1 + 1e-6 && lim.ws.min >= Math.exp(-0.02) - 1 - 1e-6, "涨跌停板：每天的对数涨跌幅不超过 ±lim", lim.ws.min + " " + lim.ws.max);
  ok(lim.ws.acf[0] > 0.2 && Math.abs(loose.ws.acf[0]) < 0.02, "涨跌停板：上限紧的时候相邻两天正相关，上限碰不到时不相关", lim.ws.acf[0] + " " + loose.ws.acf[0]);
  ok(lim.d > 0.2 && lim.d > 20 * lim.dse && def20.d > 5 * def20.dse, "涨跌停板：回看 1 步的动量比买入持有每年高出两成以上；默认的 20 步也显著更好", lim.d + " ± " + lim.dse);
  ok(loose.d < -2 * loose.dse, "涨跌停板：上限调到 0.2，动量的优势没有了，只剩交易成本", loose.d + " ± " + loose.dse);
  ok(/买不进去/.test(W("w_limit").explain) && /μ\/σ²/.test(W("w_walk").explain), "说明里交代了：真实市场里涨停时买不进去；随机游走里最好的是固定比例 μ/σ²");
}

section("七、放进线程里跑（内置对象已经冻住）");
{
  const g = G("s_guess"), codes = [{ id: "game", code: g.code }].concat(g.rules.map(r => ({ id: r.id, code: r.code })));
  const R = runJob(codes, { kind: "game", game: "game", gp: g.p, T: g.T, K: 500, seed: 9, entries: g.rules.map(r => ({ id: r.id, p: r.p })) });
  const direct = QL.shopRun(compGame(g.code), Object.freeze(Object.assign({}, g.p)), g.T, 500, 9, g.rules.map(r => player(g, r.id)), null);
  ok(R.last.type === "done" && R.result.rows.length === 3 && R.result.rows.every((r, i) => r.mean === direct.rows[i].mean && r.se === direct.rows[i].se && num(r.d) === direct.rows[i].d) && R.result.K === 500 && R.result.T === 50 && R.result.skipped.length === 0, "任务算出来的数和直接算的逐个相同", JSON.stringify(R.last).slice(0, 200));
  ok(R.posts[0].type === "ready" && R.posts.filter(p => p.type === "progress").length >= 3 && R.result.trace.length === 3 && R.result.trace[0].log.length === 30, "先报就绪，中间报进度，结果里带着第一局的过程");
  const bad = runJob(codes.concat([{ id: "nodecide", code: "var x = 1;" }, { id: "boom", code: "function decide(s) { if (s.t === 3) throw new Error('炸了'); return 1; }" }]), { kind: "game", game: "game", gp: g.p, T: g.T, K: 200, seed: 9, entries: [{ id: "heads", p: {} }, { id: "nodecide", p: {} }, { id: "boom", p: {} }, { id: "ghost", p: {} }] });
  ok(bad.result && bad.result.rows.length === 2 && bad.result.skipped.length === 2 && bad.result.skipped.map(x => x.id).join() === "nodecide,ghost" && /decide/.test(bad.result.skipped[0].err) && /炸了/.test(bad.result.rows[1].err), "没有 decide 的、找不到代码的不上场；中途抛错的那条单独记错", JSON.stringify(bad.result && bad.result.skipped));
  const noGame = runJob([{ id: "game", code: "function deal() { return {}; }" }, { id: "r", code: "function decide() { return 1; }" }], { kind: "game", game: "game", gp: {}, T: 5, K: 5, seed: 1, entries: [{ id: "r", p: {} }] });
  ok(noGame.last.type === "error" && /deal\(T, rng, p\) 和 referee\(G, t, a\)/.test(noGame.last.message), "玩法缺了判分的函数：报错说清楚要哪两个", noGame.last.message);
  const refErr = runJob([{ id: "game", code: "function deal() { return {}; }\nfunction referee(G, t, a) { if (t === 1) throw new Error('裁判炸了'); return 1; }" }, { id: "r", code: "function decide() { return 1; }" }], { kind: "game", game: "game", gp: {}, T: 5, K: 5, seed: 1, entries: [{ id: "r", p: {} }] });
  ok(refErr.last.type === "error" && /裁判炸了/.test(refErr.last.message) && refErr.posts.some(p => p.type === "progress" && p.id === "r"), "玩法的代码出错：整件任务报错，进度里留着当时上场的是哪条规则", refErr.last.message);
  const cap = runJob(codes, { kind: "game", game: "game", gp: g.p, T: 99999, K: 99999999, seed: 9, entries: [{ id: "heads", p: {} }] });
  ok(cap.result && cap.result.T === 2000 && cap.result.K === 2000, "回合数和局数有上限：一共不超过四百万个回合", cap.result && cap.result.T + " " + cap.result.K);
  const empty = runJob(codes, { kind: "game", game: "game", gp: g.p, T: 5, K: 5, seed: 9, entries: [] });
  ok(empty.result && empty.result.rows.length === 0, "一条规则也没有：返回空表，不报错");
  // 规则想改内置对象、想改别的规则的结果
  const evil = "Math.max = function () { return 1e9; };\nfunction decide(s) { try { Array.prototype.push = function () { return 0; }; } catch (e) {} try { Object.prototype.over = true; } catch (e) {} return 1; }";
  let evilRes = null, evilErr = "";
  try { evilRes = runJob(codes.concat([{ id: "evil", code: evil }]), { kind: "game", game: "game", gp: g.p, T: g.T, K: 500, seed: 9, entries: [{ id: "heads", p: {} }, { id: "evil", p: {} }, { id: "major", p: {} }] }); } catch (e) { evilErr = String(e.message || e); }
  ok(/Math|read only|extensible|object/i.test(evilErr) || (evilRes.result && evilRes.result.rows[0].mean === direct.rows[0].mean && evilRes.result.rows[2].mean === direct.rows[2].mean), "规则在顶层改 Math：编进去的时候就报错（内置对象已经冻住）", evilErr.slice(0, 80));
  const evil2 = "function decide(s) { try { Array.prototype.push = function () { return 0; }; } catch (e) {} try { Object.prototype.over = true; } catch (e) {} try { s.g.lo = 0.99; } catch (e) {} return 1; }";
  const e2 = runJob(codes.concat([{ id: "evil", code: evil2 }]), { kind: "game", game: "game", gp: g.p, T: g.T, K: 500, seed: 9, entries: [{ id: "heads", p: {} }, { id: "evil", p: {} }, { id: "major", p: {} }] });
  ok(e2.result && e2.result.rows[0].mean === direct.rows[0].mean && e2.result.rows[2].mean === direct.rows[2].mean && e2.result.rows[1].mean === direct.rows[0].mean && e2.result.rows[1].rounds === 50, "规则在 decide 里想改内置对象、改玩法的参数：改不动，别的规则的结果一个数也没变");
  // 世界
  const w = W("w_limit"), RW = runJob([{ id: "w", code: w.code }], { kind: "world", id: "w", p: defaults(w.schema), T: w.T, K: w.K, N: 400, seed: 3 });
  ok(RW.result && RW.result.N === 400 && RW.result.T === 252 && RW.result.K === 252 && RW.result.acf1 > 0.2 && RW.result.annVol > 0.2 && RW.result.annVol < 0.3 && RW.result.max <= Math.exp(0.02) - 1 + 1e-6, "试一个世界：返回路径条数、年化波动、相邻两步的相关", JSON.stringify(RW.result).slice(0, 160));
  ok(RW.result.paths.length === 8 && RW.result.grid.length === RW.result.paths[0].length && RW.result.q50.length === RW.result.grid.length && RW.result.paths.every(p => p[0] === 100 && p.every(v => v > 0)) && RW.result.grid[0] === 0 && RW.result.grid[RW.result.grid.length - 1] === 252 && RW.result.q5.every((v, i) => v <= RW.result.q50[i] && RW.result.q50[i] <= RW.result.q95[i]), "带着 8 条样本路径和 5%、50%、95% 三条分位线，都从 100 出发");
  const noSim = runJob([{ id: "w", code: "var a = 1;" }], { kind: "world", id: "w", p: {}, T: 50, K: 252, N: 50, seed: 1 });
  ok(noSim.last.type === "error" && /simulate\(T, rng, p, K\)/.test(noSim.last.message), "代码里没有 simulate：报错说清楚");
  const badSim = runJob([{ id: "w", code: "function simulate(T) { var S = [100]; for (var t = 0; t < T; t++) S.push(t === 5 ? -1 : 100); return S; }" }], { kind: "world", id: "w", p: {}, T: 50, K: 252, N: 50, seed: 1 });
  const shortSim = runJob([{ id: "w", code: "function simulate(T) { return [100, 101]; }" }], { kind: "world", id: "w", p: {}, T: 50, K: 252, N: 50, seed: 1 });
  ok(badSim.last.type === "error" && /第 6 个价格/.test(badSim.last.message) && shortSim.last.type === "error" && /T\+1/.test(shortSim.last.message), "价格不是正数、长度不够：报出是哪一个", badSim.last.message + " | " + shortSim.last.message);
  const big = runJob([{ id: "w", code: W("w_walk").code }], { kind: "world", id: "w", p: defaults(W("w_walk").schema), T: 4000, K: 252, N: 4000, seed: 1 });
  ok(big.result && big.result.T === 4000 && big.result.N === 500, "路径条数 × 步数有上限（二百万）：超了就少生成几条", big.result && big.result.N);
  ok(/QL_SHOP_INSTALL/.test(QLJobs.SHADOW) && /show: typeof show/.test(QLJobs.source([{ id: "a", code: "" }]).src), "线程里编进去的代码拿得到 show，碰不到安装工坊的那个函数");
}

done();
