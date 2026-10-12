// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 规则同场的引擎（arena.js）：两种市场的结算、规则看到什么、出错的规则怎么处理，以及几条有闭式答案的结论拿模拟去对
const vm = require("vm"), path = require("path"), { QL, ok, near, section, done } = require("./harness.js");
global.QL_CORE = require(path.join(__dirname, "../src/core.js"));
global.QL_ARENA_INSTALL = require(path.join(__dirname, "../src/arena.js"));
const JI = require(path.join(__dirname, "../src/jobs.js")), QLJobs = JI.QLJobs;
JI(QL); global.QL_ARENA_INSTALL(QL);
const AR = QL.ARENA, lib = id => AR.lib.filter(r => r.id === id)[0];
const comp = code => new Function('"use strict";\n' + code + '\n;return { init: typeof init === "function" ? init : null, decide: decide };')();
const player = (id, over) => { const r = lib(id), S = comp(r.code); return { id, decide: S.decide, init: S.init, p: Object.freeze(Object.assign({}, r.p, over || {})) }; };
const many = (id, n, over) => { const a = []; for (let i = 0; i < n; i++) a.push(Object.assign(player(id, over), { id: id + i })); return a; };
const avg = rows => rows.reduce((s, r) => s + r.mean, 0) / rows.length, seAvg = rows => Math.sqrt(rows.reduce((s, r) => s + r.se * r.se, 0)) / rows.length;

section("一、市场的常数和自带的规则");
{
  const g = AR.consts("auction", {});
  ok(g.lo === 50 && g.hi === 250 && g.eps === 20 && g.fmt === "first" && g.pi === 0 && Object.isFrozen(g), "竞价的默认设定：V 在 50 到 250 之间，估计的误差 ±20，第一价格");
  const m = AR.consts("mm", { eps: "abc", pi: 7, R: -1, lo: 100, hi: 90, fmt: "weird" });
  ok(m.eps === 20 && m.pi === 1 && m.R === 60 && m.lo === 100 && m.hi === 300 && m.fmt === "first", "不合规矩的设定收回来：不是数的用默认值，概率收进 0 到 1，上界不能比下界低", JSON.stringify(m));
  ok(AR.consts("auction", { fmt: "second", eps: 5 }).fmt === "second" && AR.consts("auction", { pi: 0.5 }).pi === 0, "第二价格认得；竞价里没有知情客人这回事");
  ok(AR.lib.length === 9 && AR.lib.filter(r => r.market === "auction").length === 5 && AR.lib.filter(r => r.market === "mm").length === 4 && new Set(AR.lib.map(r => r.id)).size === 9, "自带 5 条竞价规则、4 条做市规则");
  ok(AR.lib.every(r => { try { const S = comp(r.code); return typeof S.decide === "function" && typeof r.name === "string" && r.summary.length > 4 && QLJobs.syntax(r.code) === ""; } catch (e) { return false; } }), "每一条的代码都编得过，有名字有说明");
  const mk = AR.marks(AR.consts("auction", {}), 4);
  ok(mk.length === 3 && Math.abs(mk[0].value + 3) < 1e-12 && mk[1].value === 0 && Math.abs(mk[2].value - 2) < 1e-12 && AR.marks(g, 1).length === 0 && AR.marks(AR.consts("mm", { pi: 0.3 }), 4).length === 0 && AR.marks(AR.consts("mm", { pi: 0 }), 4).length === 1, "理论值：4 条规则、ε = 20 时，全场照信号出价每人每回合 −3，保本价 0，均衡约 +2", JSON.stringify(mk.map(x => x.value)));
}

section("二、规则看到什么；结算");
{
  const seen = [], g = AR.consts("auction", {});
  const spy = { id: "spy", init: p => ({ n: 0 }), decide: (s, p, st) => { seen.push({ s, frozen: Object.isFrozen(s), keys: Object.keys(s).sort().join(","), st, p }); st.n++; return s.x - 45; }, p: Object.freeze({ a: 1 }) };
  const m = QL.arenaMatch(g, 50, [spy, player("a_face"), player("a_face")], 11, 0, true);
  ok(seen.length === 50 && seen.every(o => o.frozen) && seen[0].keys === "T,g,last,lastA,n,rnd,side,t,total,v,win,won,x", "每回合给规则一个新的、冻住的对象，字段就是说明里写的那些", seen[0].keys);
  ok(seen[0].s.t === 0 && seen[0].s.T === 50 && seen[0].s.n === 3 && seen[0].s.last !== seen[0].s.last && seen[0].s.v !== seen[0].s.v && seen[0].s.g === g && seen[49].st.n === 50 && seen[3].p.a === 1, "第一回合没有\"上一回合\"；状态一场里一直是同一个；参数原样传到");
  ok(seen.slice(1).every((o, i) => o.s.v >= 50 && o.s.v <= 250 && Math.abs(seen[i].s.x - o.s.v) <= 20 + 1e-9 && o.s.lastA === seen[i].s.x - 45), "上一回合的真实价值事后公布：它离我当时的估计不超过 ε；我上一回合报的数也记着");
  ok(seen.every(o => o.s.won === 0 && o.s.last === 0 || o.s.t === 0) && m.fills[0] === 0 && m.pnl[0] === 0 && m.fills[1] + m.fills[2] === 50, "比别人多让 45（超过 2ε）的规则一次也买不到；另外两条每回合总有一条买到");
  ok(seen.slice(1).every(o => o.s.win >= o.s.v - 20 - 1e-9 && o.s.win <= o.s.v + 20 + 1e-9 && o.s.side === 1), "成交价公布出来：照信号出价的人里最高的那个信号");
  ok(m.trace.length === 3 && m.trace[1].length === 51 && m.trace[1][0] === 0 && Math.abs(m.trace[1][50] - m.pnl[1]) < 1e-3 && m.trace[0].every(v => v === 0), "记下的累计盈亏从 0 开始，最后一个数就是这一场的总盈亏");
  const m2 = QL.arenaMatch(g, 50, [spy, player("a_face"), player("a_face")], 11, 0, false), m3 = QL.arenaMatch(g, 50, [spy, player("a_face"), player("a_face")], 11, 1, false);
  ok(m2.pnl[1] === m.pnl[1] && m2.pnl[2] === m.pnl[2] && m3.pnl[1] !== m.pnl[1], "同一个种子、同一场：结果逐个数相同；换一场就不同");
  // 出价的规矩
  const fix = (id, v) => ({ id, init: null, decide: () => v, p: {} });
  const r1 = QL.arenaMatch(g, 400, [fix("hi", 120), fix("lo", 100), fix("nan", NaN), fix("neg", -5), fix("str", "x"), fix("inf", Infinity)], 5, 0, false);
  ok(r1.fills[0] === 400 && r1.fills.slice(1).every(v => v === 0) && r1.bad[2] === 400 && r1.bad[4] === 400 && r1.bad[5] === 400 && r1.bad[3] === 0, "出价最高的每回合都买到；不是数的、无穷大的记作没出价并计数；负数就是不出价");
  const meanV = 150, tol = 4 * (200 / Math.sqrt(12)) / Math.sqrt(400);
  near(r1.pnl[0] / 400, meanV - 120, tol, "第一价格：付的是自己出的 120，平均赚 E[V] − 120");
  const r2 = QL.arenaMatch(AR.consts("auction", { fmt: "second" }), 400, [fix("hi", 120), fix("lo", 100)], 5, 0, false), r3 = QL.arenaMatch(AR.consts("auction", { fmt: "second" }), 400, [fix("hi", 120)], 5, 0, false), r4 = QL.arenaMatch(g, 400, [fix("low", 40)], 5, 0, false);
  near(r2.pnl[0] / 400, meanV - 100, tol, "第二价格：付的是第二高的 100");
  near(r3.pnl[0] / 400, meanV, tol, "第二价格只有一个人出价：付 0");
  ok(r4.fills[0] === 400, "只要出价大于 0 就算数，没有保留价");
  const tie = QL.arenaMatch(g, 2000, [fix("a", 100), fix("b", 100), fix("c", 100)], 5, 0, false);
  ok(tie.fills[0] + tie.fills[1] + tie.fills[2] === 2000 && Array.from(tie.fills).every(v => Math.abs(v - 2000 / 3) < 5 * Math.sqrt(2000 * 2 / 9)), "出价相同：抽签，各拿三分之一左右", Array.from(tie.fills).join(","));
  // 抛错的规则
  let calls = 0; const boom = { id: "boom", init: null, decide: s => { calls++; if (s.t === 3) throw new Error("第四回合炸了"); return s.x; }, p: {} };
  const rb = QL.arenaMatch(g, 30, [boom, player("a_even")], 5, 0, false);
  ok(calls === 4 && /炸了/.test(rb.err[0]) && rb.err[1] === "" && rb.fills[1] >= 26, "抛错的规则：这一场余下的回合不再问它，别的规则照常", calls + " " + rb.err[0]);
  const badInit = { id: "bi", init: () => { throw new Error("init 炸了"); }, decide: s => s.x, p: {} };
  ok(/init 炸了/.test(QL.arenaMatch(g, 10, [badInit, player("a_even")], 5, 0, false).err[0]), "init 里抛错同样处理");
  const cheat = { id: "ch", init: null, decide: (s, p) => { try { s.x = 0; } catch (e) {} try { s.g.eps = 0; } catch (e) {} try { p.d = 99; } catch (e) {} return s.x; }, p: Object.freeze({ d: 1 }) };
  const rc = QL.arenaMatch(g, 60, [cheat, player("a_face")], 5, 0, false), rd = QL.arenaMatch(g, 60, [player("a_face"), player("a_face")], 5, 0, false);
  ok(rc.pnl[0] === rd.pnl[0] && rc.pnl[1] === rd.pnl[1] && g.eps === 20, "规则改不动自己看到的东西、市场的常数和自己的参数");
}

section("三、竞价：有闭式答案的几条结论");
{
  const N = 4, e = 20, T = 200, K = 500, g = AR.consts("auction", {}), g2 = AR.consts("auction", { fmt: "second" });
  const face = QL.arenaRun(g, T, K, many("a_face", N), 21).rows, even = QL.arenaRun(g, T, K, many("a_even", N), 21).rows, eq = QL.arenaRun(g, T, K, many("a_eq", N), 21).rows;
  near(avg(face), -e * (N - 1) / (N + 1) / N, 4 * seAvg(face), "全场照信号出价：每人每回合亏 ε(N−1)/((N+1)N) = 3（赢家诅咒）");
  near(face[0].edge, -e * (N - 1) / (N + 1), 0.4, "买到的那一次平均亏 ε(N−1)/(N+1) = 12");
  near(avg(even), 0, 4 * seAvg(even), "全场出保本价：不赚不亏");
  near(avg(eq), 2 * e / (N + 1) / N, 0.25, "全场按均衡出价：每人每回合约赚 2ε/((N+1)N) = 2（信号贴近边界的那些回合有出入）");
  ok(eq[0].act > 16 && eq[0].act < e, "均衡出价让掉的比保本价（12）多得多：信号不贴下边界时接近一个 ε，平均下来 17 到 18", eq[0].act.toFixed(2));
  ok(face.every(r => Math.abs(r.fill - 1 / N) < 0.01) && eq.every(r => Math.abs(r.fill - 1 / N) < 0.01), "规则都一样时，每人买到四分之一的回合");
  // 均衡：单独改主意占不到便宜
  const base = avg(eq), dev = (id, over) => QL.arenaRun(g, T, K, [player(id, over)].concat(many("a_eq", N - 1)), 21).rows[0];
  const d1 = dev("a_face"), d2 = dev("a_cut", { d: 30 }), d3 = dev("a_cut", { d: 14 }), d4 = dev("a_even");
  ok(d1.mean < base - 3 * d1.se && d1.mean < 0, "别人都按均衡出价时，一个人改成照信号出价：买到的多了，但是亏钱", d1.mean.toFixed(3) + " fill " + d1.fill.toFixed(2));
  ok(d2.mean < base - 3 * d2.se && d2.fill < 0.1, "改成让得更多（让 30）：几乎买不到，赚得更少", d2.mean.toFixed(3));
  ok(d3.mean <= base + 3 * d3.se && d4.mean <= base + 3 * d4.se, "改成让 14、改成保本价：都不比老老实实按均衡出价强", [d3.mean, d4.mean, base].map(v => v.toFixed(3)).join(" "));
  const sp = QL.arenaRun(g2, T, K, many("a_eq", N), 21).rows;
  near(avg(sp), 2 * e * (N - 1) / (N * N * (N + 1)), 4 * seAvg(sp) + 0.02, "第二价格、全场出 x − ε(N−2)/N：每人每回合赚 2ε(N−1)/(N²(N+1)) = 1.5");
  const n8 = QL.arenaRun(g, T, K, many("a_face", 8), 21).rows;
  near(n8[0].edge, -e * 7 / 9, 0.4, "8 条规则时赢家诅咒更重：买到的那一次平均亏 ε·7/9 ≈ 15.6");
  const learn = QL.arenaRun(g, 400, 200, [player("a_learn")].concat(many("a_face", 3)), 21).rows[0], faceIn = QL.arenaRun(g, 400, 200, many("a_face", 4), 21).rows[0];
  ok(learn.mean > faceIn.mean + 3 * (learn.se + faceIn.se) && learn.act > 5, "\"边打边调\"混在三条照信号出价的规则里：它学会多让，比它们亏得少", learn.mean.toFixed(3) + " vs " + faceIn.mean.toFixed(3) + " 让 " + learn.act.toFixed(1));
}

section("四、做市");
{
  const N = 4, e = 20, T = 200, K = 500, g0 = AR.consts("mm", { pi: 0 }), g5 = AR.consts("mm", { pi: 0.5 });
  const even = QL.arenaRun(g0, T, K, many("m_even", N), 31).rows;
  near(avg(even), 0, 4 * seAvg(even), "没有知情的客人、全场报保本价差：不赚不亏");
  ok(even.every(r => Math.abs(r.fill - 1 / N) < 0.01) && Math.abs(even[0].act - e * (N - 1) / (N + 1)) < 1e-9, "每回合都有人成交，各拿四分之一；报的半价差就是 ε(N−1)/(N+1) = 12");
  const wide = QL.arenaRun(g0, T, K, many("m_fix", N, { h: 18 }), 31).rows;
  near(avg(wide), (18 - e * (N - 1) / (N + 1)) / N, 4 * seAvg(wide), "全场都报 18：每成交一次赚 18 − 12 = 6，每人每回合 1.5");
  const tight = QL.arenaRun(g0, T, K, [player("m_fix", { h: 6 })].concat(many("m_fix", N - 1, { h: 18 })), 31).rows;
  ok(tight[0].fill > 0.5 && tight[0].mean < 0 && tight[1].mean < avg(wide), "一条规则把价差收到 6 去抢单：单子多半归了它，可是它亏钱，别人也跟着少赚", tight[0].fill.toFixed(2) + " " + tight[0].mean.toFixed(3));
  const inf = QL.arenaRun(g5, T, K, many("m_even", N), 31).rows;
  ok(avg(inf) < -4 * seAvg(inf), "一半客人是知情的：同样的保本价差就要亏钱（知情的客人只在你报错价时才来）", avg(inf).toFixed(3));
  const safe0 = QL.arenaRun(g5, T, K, many("m_safe", N, { m: 4 }), 31).rows, safe1 = QL.arenaRun(g5, T, K, many("m_safe", N, { m: 12 }), 31).rows;
  ok(avg(safe1) > avg(safe0) + 3 * (seAvg(safe0) + seAvg(safe1)), "价差再放宽一些，亏得少（或者转成赚）", avg(safe0).toFixed(3) + " → " + avg(safe1).toFixed(3));
  const far = QL.arenaMatch(AR.consts("mm", { pi: 0, R: 5 }), 300, many("m_fix", 2, { h: 60 }), 31, 0, false);
  ok(far.fills[0] + far.fills[1] === 0, "报价离真实价值太远（超过客人肯接受的 R）：没人成交");
  const quiet = QL.arenaMatch(g0, 100, [{ id: "q", init: null, decide: () => NaN, p: {} }, player("m_even")], 31, 0, false);
  ok(quiet.fills[0] === 0 && quiet.fills[1] === 100 && quiet.bad[0] === 100, "不报价的规则不成交");
  const seenSide = []; QL.arenaMatch(g5, 300, [{ id: "s", init: null, decide: s => { seenSide.push(s.side); return 10; }, p: {} }, player("m_even")], 31, 0, false);
  ok(seenSide.includes(1) && seenSide.includes(-1) && seenSide.includes(0), "规则看得到上一回合客人是买、是卖，还是没成交");
}

section("五、放进线程里跑的任务");
{
  const built = QLJobs.source(AR.lib.filter(r => r.market === "auction").map(r => ({ id: r.id, code: r.code })).concat([{ id: "none", code: "var x = 1;" }, { id: "boom", code: "function decide(s) { throw new Error('一上来就炸'); }" }])), posts = [], self = { postMessage: m => posts.push(m), onmessage: null };
  const ctx = vm.createContext({ self, console, performance }); vm.runInContext(built.src, ctx);
  const entries = AR.lib.filter(r => r.market === "auction").map(r => ({ id: r.id, p: r.p })).concat([{ id: "none", p: {} }, { id: "boom", p: {} }]);
  self.onmessage({ data: { type: "job", kind: "arena", market: "auction", params: {}, T: 100, K: 40, seed: 3, entries } });
  const last = posts[posts.length - 1], res = last.result;
  ok(last.type === "done" && res.n === 5 && res.rows.length === 5 && res.skipped.length === 2 && /decide/.test(res.skipped[0].err) && /一上来就炸/.test(res.skipped[1].err), "没有 decide 的、一上来就抛错的在体检时就请出去，其余 5 条正式比", JSON.stringify(res.skipped));
  const direct = QL.arenaRun(AR.consts("auction", {}), 100, 40, AR.lib.filter(r => r.market === "auction").map(r => player(r.id)), 3).rows;
  ok(res.rows.every((r, i) => r.id === direct[i].id && r.mean === direct[i].mean && r.se === direct[i].se && r.fill === direct[i].fill), "线程里比出来的和直接算的逐个数相同");
  ok(res.trace.length === 5 && res.trace[0].length === 101 && res.marks.length === 3 && res.g.eps === 20 && res.T === 100 && res.K === 40, "带回第一场的累计盈亏、理论值和这次用的设定");
  const prog = posts.filter(m => m.type === "progress");
  ok(prog.filter(m => m.warm).length === 6 && prog.filter(m => m.done).pop().done === 40, "体检时逐条报到（卡死了知道是谁），正式比的时候报进度");
  const eq = res.rows.filter(r => r.id === "a_eq")[0], face = res.rows.filter(r => r.id === "a_face")[0];
  ok(face.fill > eq.fill && face.mean < 0 && eq.mean >= 0, "五条规则同场：照信号出价的那条买到的最多，也是亏的；均衡出价的那条不亏", face.mean.toFixed(2) + " / " + eq.mean.toFixed(2));
  const posts2 = [], self2 = { postMessage: m => posts2.push(m), onmessage: null }; vm.runInContext(built.src, vm.createContext({ self: self2, console, performance }));
  self2.onmessage({ data: { type: "job", kind: "arena", market: "nope", T: 1, K: 99999, seed: 3, entries: entries.slice(0, 1) } });
  const r2 = posts2[posts2.length - 1].result;
  ok(r2.market === "auction" && r2.rows.length === 0 && r2.n === 1 && r2.T === 5 && r2.K === 5000, "市场不认识的按竞价算；不到两条规则不比；回合数和场数收进允许的范围", JSON.stringify([r2.market, r2.T, r2.K]));
}
done();
