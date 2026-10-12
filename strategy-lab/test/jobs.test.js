// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 一次性的计算任务（jobs.js）和十项全能的引擎（deca.js）。
// 线程的源码原样放进一个全新的 vm 环境里执行（和浏览器里的后台线程一样：先装内核、冻住内置对象、再编进规则代码），
// 所以"冻住之后内核还能不能照常算""别人的代码改不改得动内置对象"都是真测，不是推想。浏览器才有的那一层（隔离页、内容安全策略）在 ui-deca.js 里测。
const vm = require("vm"), path = require("path"), { QL, STRATS, compile, defaults, ok, near, section, done } = require("./harness.js");
global.QL_CORE = require(path.join(__dirname, "../src/core.js"));
global.QL_DECA_INSTALL = require(path.join(__dirname, "../src/deca.js"));
const JI = require(path.join(__dirname, "../src/jobs.js")), QLJobs = JI.QLJobs;
global.QL_DECA_INSTALL(QL); JI(QL);

/** 把一件任务放进新的环境里跑完：返回 { posts, ctx, built }。编不过时抛出（带行号） */
function program(codes) {
  const built = QLJobs.source(codes), posts = [], self = { postMessage: m => posts.push(JSON.parse(JSON.stringify(m, (k, v) => (v === -Infinity ? "-inf" : v === Infinity ? "inf" : v !== v ? "nan" : v)))), onmessage: null };
  const ctx = vm.createContext({ self, console, performance });
  vm.runInContext(built.src, ctx, { filename: "job.js" });
  return { posts, ctx, built, send: m => self.onmessage({ data: m }) };
}
function runJob(codes, msg) { const P = program(codes); P.send(Object.assign({ type: "job" }, msg)); const last = P.posts[P.posts.length - 1]; return Object.assign(P, { last, result: last.type === "done" ? last.result : null }); }
const price = STRATS.filter(s => !s.game), plain = price.filter(s => !/function\s+fit\s*\(/.test(s.code));
const num = v => (v === "-inf" ? -Infinity : v === "nan" ? NaN : v);

section("一、赛季和项目");
{
  const mon = Date.UTC(2026, 9, 12), a = QL.decaSeason(mon), b = QL.decaSeason(mon + 6 * 864e5 + 86399e3), c = QL.decaSeason(mon + 7 * 864e5), z = QL.decaSeason(mon - 1);
  ok(a.id === "2026-10-12" && b.id === a.id && b.seed === a.seed && a.next === mon + 7 * 864e5, "一个赛季从周一 UTC 0 点到周日最后一秒，种子不变", JSON.stringify(a));
  ok(c.id === "2026-10-19" && c.seed !== a.seed && z.id === "2026-10-05", "过了周日就是下一个赛季，换一个种子", c.id + " " + z.id);
  ok(new Date(a.id + "T00:00:00Z").getUTCDay() === 1 && new Date(QL.decaSeason(Date.UTC(2030, 0, 1)).id + "T00:00:00Z").getUTCDay() === 1, "赛季的编号总是一个星期一");
  const seeds = new Set(); for (let i = 0; i < 100; i++) seeds.add(QL.decaSeason(mon + i * 7 * 864e5).seed);
  ok(seeds.size >= 99 && [...seeds].every(s => Number.isInteger(s) && s >= 0 && s < 1e6), "一百个星期的种子基本不重样");
  ok(QL.DECA.events.length === 10 && new Set(QL.DECA.events).size === 10 && QL.DECA.events.every(t => QL.WORLDS[t] && !QL.WORLDS[t].game && !QL.WORLDS[t].needsData && !QL.WORLDS[t].needsCode), "十个项目都是自带的价格世界，不需要数据也不需要代码", QL.DECA.events.join(","));
  const cfg = QL.decaCfg("regime", 5, 40);
  ok(cfg.T === QL.WORLDS.regime.defaults.T && cfg.K === QL.WORLDS.regime.defaults.K && JSON.stringify(cfg.params) === JSON.stringify(QL.worldDefaults("regime")) && cfg.N === 40 && cfg.seed === 5, "每个项目用那个世界的默认参数和默认长度");
}

section("二、一条规则在一个项目上");
{
  const st = STRATS.filter(s => s.id === "voltarget")[0], S = compile(st.code), p = defaults(st.params), seed = 4242, n = 80, set = QL.decaSet();
  const ev = QL.decaEvent("heston", seed, S, p, n, {});
  const B = QL.makeBatch(QL.decaCfg("heston", seed, n), null, 0), bench = QL.runBatch(B, QL.benchFor("heston"), {}, { costBps: set.costBps, rf: set.rf, fmin: Math.min(set.fmin, 0), fmax: Math.max(set.fmax, 1), lam: 1 }, {}), sum = QL.summarize(QL.runBatch(B, S, p, set, {}), set, bench);
  ok(ev.d === sum.dGrowth && ev.dse === sum.dGrowthSE && ev.growth === sum.growth && ev.bench === QL.summarize(bench, set).growth && ev.N === n && ev.T === B.T, "和手工跑一遍是同样的数：与买入持有在同一批路径上的增长率之差", String(ev.d));
  const hold = QL.decaEvent("heston", seed, compile(STRATS.filter(s => s.id === "hold")[0].code), {}, n, {});
  ok(hold.d === 0 && hold.growth === hold.bench, "买入持有自己：差恰好是 0");
  const cache = {}, e1 = QL.decaEvent("gbm", seed, S, p, n, cache), e2 = QL.decaEvent("gbm", seed, S, p, n, cache), e3 = QL.decaEvent("gbm", seed + 1, S, p, n, {});
  ok(e1.d === e2.d && e1.d !== e3.d, "同一个种子给出同样的结果，换种子就变");
  const lev = QL.DECA.events.map(t => [QL.decaEvent(t, seed, { decide: () => 99 }, {}, 60, {}), QL.decaEvent(t, seed, { decide: () => -99 }, {}, 60, {}), QL.decaEvent(t, seed, { decide: () => 3 }, {}, 60, {}), QL.decaEvent(t, seed, { decide: () => -1 }, {}, 60, {})]);
  ok(lev.every(r => r[0].d === r[2].d && r[1].d === r[3].d && isFinite(r[0].d) && isFinite(r[1].d) && r[0].pRuin === 0 && r[1].pRuin === 0), "规则喊多大的仓位都被收进默认的上下限（−1 到 3 倍）；在这个范围里，十个项目上满杠杆也不至于破产");
  ok(QL.decaScore([{ id: "a", d: 0.02 }, { id: "b", d: -0.01 }, { id: "c", d: 0.5 }]).score === -0.01 && QL.decaScore([{ id: "a", d: 0.02 }, { id: "b", d: -0.01 }]).worst === "b", "十项的得分是最差的那一项");
  ok(QL.decaScore([{ id: "a", d: 0.02 }, { id: "b", d: -Infinity }]).score === -Infinity && QL.decaScore([{ id: "a", d: NaN }, { id: "b", d: 1 }]).score === -Infinity && QL.decaScore([{ id: "a", d: NaN }]).worst === "a", "破产或者算不出来的一项按负无穷算");
}

section("三、任务放进线程里跑：和直接算一模一样（内置对象冻住之后内核照常工作）");
{
  const seed = 777, n = 40, codes = plain.map(s => ({ id: s.id, code: s.code })), entries = plain.map(s => ({ id: s.id, p: defaults(s.params) }));
  const J = runJob(codes, { kind: "deca", seed, n, entries });
  ok(J.posts[0].type === "ready" && J.last.type === "done" && J.result.entries.length === plain.length && J.result.seed === seed && J.result.n === n, "线程报到、接任务、交结果", J.last.type + " " + (J.last.message || ""));
  let same = 0, bad = [];
  const cache = {};
  plain.forEach((s, i) => {
    const S = compile(s.code), p = defaults(s.params), r = J.result.entries[i], rows = QL.DECA.events.map(t => QL.decaEvent(t, seed, S, p, n, cache)), sc = QL.decaScore(rows);
    const okRow = !r.err && r.rows.length === 10 && r.rows.every((x, k) => Object.is(num(x.d), rows[k].d) && Object.is(num(x.growth), rows[k].growth) && Object.is(num(x.dse), rows[k].dse)) && Object.is(num(r.score), sc.score) && r.worst === sc.worst;
    if (okRow) same++; else bad.push(s.id + (r.err ? ": " + r.err : ""));
  });
  ok(same === plain.length, plain.length + " 条不带训练的内置规则：线程里的十项和直接算的逐个数相同", bad.join(" | "));
  const prog = J.posts.filter(m => m.type === "progress");
  ok(prog.filter(m => m.event).length === plain.length * 10 && prog.filter(m => m.done).length === plain.length && prog[0].i === 0 && prog[0].n === 10, "每走一项报一次进度，每条规则走完报一次");
  const holdRow = J.result.entries[plain.findIndex(s => s.id === "hold")];
  ok(num(holdRow.score) === 0, "买入持有的十项全能得分恰好是 0");
  const frozen = vm.runInContext("[Object.isFrozen(Math), Object.isFrozen(Array.prototype), Object.isFrozen(Object.prototype), Object.isFrozen(Float64Array.prototype), Object.isFrozen(Object.getPrototypeOf(Float64Array.prototype)), Object.isFrozen(JSON), Object.isFrozen(QL.RNG.prototype), Object.isFrozen(QL.ml), QL.hardened]", J.ctx);
  ok(frozen.every(Boolean), "线程里：Math、数组和类型数组的原型、Object.prototype、JSON、随机数发生器、模型库都冻住了", JSON.stringify(frozen));
}
{
  const fit = price.filter(s => /function\s+fit\s*\(/.test(s.code) && (s.id === "kalman" || s.id === "pipe")), seed = 31, n = 30;
  const J = runJob(fit.map(s => ({ id: s.id, code: s.code })), { kind: "deca", seed, n, entries: fit.map(s => ({ id: s.id, p: defaults(s.params) })) });
  let good = 0; const cache = {};
  fit.forEach((s, i) => { const S = compile(s.code), p = defaults(s.params), rows = QL.DECA.events.map(t => QL.decaEvent(t, seed, S, p, n, cache)), r = J.result.entries[i]; if (!r.err && r.rows.every((x, k) => Object.is(num(x.d), rows[k].d))) good++; });
  ok(fit.length === 2 && good === 2, "带训练的规则（卡尔曼滤波、预测模型流水线）在冻住的线程里照样训练、照样算，数也相同", J.result.entries.map(e => e.err || "ok").join(" | "));
}

section("四、别人的代码想捣乱");
{
  const base = "function decide(s, p) { return p.f; }";
  const evil = `
var hits = 0;
function tryAll() {
  try { Math.log = function () { return 99; }; hits++; } catch (e) {}
  try { Math.random = function () { return 0; }; hits++; } catch (e) {}
  try { Array.prototype.sort = function () { return this; }; hits++; } catch (e) {}
  try { Float64Array.prototype.sort = function () { return this; }; hits++; } catch (e) {}
  try { Object.prototype.lam = 100; hits++; } catch (e) {}
  try { Object.defineProperty(Object.prototype, "fmax", { value: 100 }); hits++; } catch (e) {}
  try { JSON.stringify = function () { return "{}"; }; hits++; } catch (e) {}
  try { Number.prototype.toFixed = function () { return "9"; }; hits++; } catch (e) {}
}
function init(p) { tryAll(); try { p.f = 3; hits++; } catch (e) {} return {}; }
function decide(s, p, st) {
  tryAll();
  try { s.constructor.prototype.zz = 1; hits++; } catch (e) {}
  try { Object.getPrototypeOf(s.rets(1)).fill = function () {}; hits++; } catch (e) {}
  return p.f;
}`;
  const seed = 99, n = 30, J = runJob([{ id: "evil", code: evil }, { id: "base", code: base }, { id: "after", code: STRATS.filter(s => s.id === "voltarget")[0].code }], { kind: "deca", seed, n, entries: [{ id: "evil", p: { f: 1 } }, { id: "base", p: { f: 1 } }, { id: "after", p: defaults(STRATS.filter(s => s.id === "voltarget")[0].params) }] });
  const e = J.result.entries, hits = vm.runInContext("__CODE.evil.decide.length", J.ctx);
  ok(!e[0].err && e[0].rows.every((r, k) => Object.is(num(r.d), num(e[1].rows[k].d))) && num(e[0].score) === 0, "一条规则每一步都去改 Math、数组、Object.prototype、自己的参数：全都改不动，它的成绩和老老实实的同一条规则分毫不差");
  const S = compile(STRATS.filter(s => s.id === "voltarget")[0].code), cache = {}, rows = QL.DECA.events.map(t => QL.decaEvent(t, seed, S, defaults(STRATS.filter(s => s.id === "voltarget")[0].params), n, cache));
  ok(!e[2].err && e[2].rows.every((r, k) => Object.is(num(r.d), rows[k].d)), "排在它后面跑的规则不受影响", e[2].err || "");
  const leak = vm.runInContext("typeof Object.prototype.lam + '|' + typeof Object.prototype.fmax + '|' + Math.log(Math.E) + '|' + [3,1,2].sort().join('')", J.ctx);
  ok(leak === "undefined|undefined|1|123", "事后去看线程：内置对象还是原样", leak);
  ok(hits === 3, "（那条规则的 decide 确实有三个参数，测的就是它）");
  // 顶层语句就动手：这在把代码编进线程时就会抛错
  let threw = null; try { program([{ id: "ok", code: base }, { id: "top", code: "function decide(s, p) { return 1; }\nvar a = 1;\nMath.log = function () { return 99; };" }]); } catch (err) { threw = err; }
  ok(threw && /read only|Cannot assign|not extensible|object is not extensible/i.test(threw.message), "代码一上来就改 Math：编进线程时就报错，这件任务不会开始", threw && threw.message);
  // 遮住的名字
  const probe = `function decide() { var names = { self: typeof self, globalThis: typeof globalThis, postMessage: typeof postMessage, onmessage: typeof onmessage, fetch: typeof fetch, XMLHttpRequest: typeof XMLHttpRequest, WebSocket: typeof WebSocket, importScripts: typeof importScripts, Worker: typeof Worker, URL: typeof URL, Blob: typeof Blob, dispatchEvent: typeof dispatchEvent, addEventListener: typeof addEventListener, BroadcastChannel: typeof BroadcastChannel, setTimeout: typeof setTimeout, crypto: typeof crypto, QL: typeof QL, __CODE: typeof __CODE, QL_CORE: typeof QL_CORE, navigator: typeof navigator, indexedDB: typeof indexedDB, close: typeof close };
  return Object.keys(names).filter(function (k) { return names[k] !== "undefined"; }).join(","); }
function init() { return (function () { return this; })(); }`;
  const P = program([{ id: "probe", code: probe }]);
  ok(vm.runInContext("__CODE.probe.decide()", P.ctx) === "" && vm.runInContext("__CODE.probe.init()", P.ctx) === undefined, "编进去的代码里：线程的全局对象、发消息、联网、开线程、内核本身这些名字全都够不着；函数里的 this 也不是全局对象", vm.runInContext("__CODE.probe.decide()", P.ctx));
  // 一条规则每次都抛错、一条返回的不是数、一条没有 decide：各记各的，别的规则照常
  const J2 = runJob([{ id: "boom", code: "function decide() { throw new Error('炸了'); }" }, { id: "nan", code: "function decide() { return 'abc'; }" }, { id: "none", code: "var x = 1;" }, { id: "base", code: base }], { kind: "deca", seed, n, entries: [{ id: "boom", p: {} }, { id: "nan", p: {} }, { id: "none", p: {} }, { id: "base", p: { f: 1 } }, { id: "ghost", p: {} }] });
  const r2 = J2.result.entries;
  ok(/炸了/.test(r2[0].err) && r2[0].at === "gbm" && !r2[1].err && r2[1].rows[0].bad === 1 && /decide/.test(r2[2].err) && /decide/.test(r2[4].err) && !r2[3].err && num(r2[3].score) === 0, "抛错的、返回值不是数的、没有 decide 的、根本没编进来的：各自记下，不连累别的规则", JSON.stringify(r2.map(x => x.err || "ok")));
}

section("五、线程只接一件任务；源码的行号；语法检查");
{
  const P = program([{ id: "a", code: "function decide(s, p) { return 1; }" }]);
  P.send({ type: "cancel" }); P.send(null); P.send({ type: "job", kind: "nope" });
  ok(P.posts.length === 2 && P.posts[1].type === "error" && /没有这种任务/.test(P.posts[1].message), "不认识的任务报错；不是任务的消息不理", JSON.stringify(P.posts[1]));
  P.send({ type: "job", kind: "deca", seed: 1, n: 20, entries: [{ id: "a", p: {} }] });
  ok(P.posts.length === 2, "接过一件之后，再来的任务一概不接（别人的代码没法给线程塞第二件任务来冒充结果）");
  const codes = [{ id: "one", code: "function decide(s, p) {\n  return 1;\n}" }, { id: "two", code: "// 第一行\n// 第二行\nfunction decide(s, p) {\n  return oops;\n}" }], built = QLJobs.source(codes), lines = built.src.split("\n");
  ok(built.spans.length === 2 && lines[built.spans[0].from - 1] === "function decide(s, p) {" && lines[built.spans[1].from - 1] === "// 第一行" && lines[built.spans[1].to - 1] === "}" && built.spans[1].to - built.spans[1].from === 4, "每段代码落在源码的哪几行，记得一行不差", JSON.stringify(built.spans));
  ok(QLJobs.syntax("function decide(s, p) { return 1; }") === "" && /Unexpected|token|expected/i.test(QLJobs.syntax("function decide(s, p { return 1; }")) && QLJobs.syntax("function decide() { return notDefined; }") === "", "语法检查只管语法：写错括号的查得出，用了没定义的名字不算语法错");
  ok(/^var self, globalThis, postMessage/.test(QLJobs.SHADOW) && ["dispatchEvent", "Worker", "URL", "Blob", "QL", "__CODE", "importScripts", "fetch", "BroadcastChannel"].every(k => new RegExp("[ ,]" + k + "[,;]").test(QLJobs.SHADOW)), "遮住的名字清单里有该有的那些");
}
done();
