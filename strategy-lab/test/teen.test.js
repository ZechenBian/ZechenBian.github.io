// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 青少年版（src/teen/）：七个小游戏都跑得通、可复现、基准规则分得出高下、填空填上就能跑；讲解里写的数一个个拿精确计算或大样本去对；
// 编程教程每一步的例子跑得通、参考答案过核对、没改的例子不算；七个想法的实验里说的"哪条更好"在数据上成立。
const vm = require("vm"), fs = require("fs"), path = require("path"), { ok, near, section, done } = require("./harness.js");
const { QL, job } = require("../daily/engine.js");
const GAMES = require("../src/teen/games.js"), LESSONS = require("../src/teen/lessons.js"), by = {}; GAMES.forEach(g => { by[g.id] = g; });
const PUB = []; for (let i = 0; i < 10; i++) PUB.push(QL.questHash("teen|pub|" + i) | 0);
const run = (g, rules, K, over) => { const gg = Object.assign({}, g, over || {}); return job([{ id: "game", code: gg.code }].concat(rules.map((r, i) => ({ id: "r" + i, code: r.code }))), { kind: "quest", game: "game", gp: gg.p, T: gg.T, K: K || 50, seeds: PUB, entries: rules.map((r, i) => ({ id: "r" + i, p: r.p, slot: r.slot == null ? 32 : r.slot })) }).rows; };
const refRun = (g, K) => run(g, g.refs.map((r, i) => Object.assign({ slot: i }, r)), K);
const FILL = { coin: ["st.heads * 2 >= st.n"], pig: ["s.see >= p.c"], melon: ["1.1", "0.9"], bandit: ["for (var i = 1; i < 3; i++) if (st.wins[i] > st.wins[best]) best = i;"], stop: ["s.see >= p.c"], shop: ["1", "2"], park: ["s.see.free === 1 && s.see.dist <= p.d"] };
const CJK = /[㐀-鿿]/;

section("一、七个小游戏");
{
  ok(GAMES.length === 7 && GAMES.map(g => g.id).join() === "coin,pig,melon,bandit,stop,shop,park", "七个游戏，从猜硬币到停车");
  const keys = ["id", "name", "kicker", "idea", "T", "p", "unit", "about", "see", "act", "score", "example", "ui", "fmtSee", "fmtAct", "code", "refs", "starter", "blanks", "think", "math"];
  ok(GAMES.every(g => keys.every(k => g[k] != null)), "每个游戏都有题面、你会看到什么、要做什么、怎么算分、例子、裁判、基准规则、起始代码、填空提示、想一想、这题背后的想法");
  ok(GAMES.every(g => g.refs.length >= 3 && g.refs.every(r => r.id && r.name && r.summary && r.why && r.code && typeof r.p === "object")) && GAMES.every(g => new Set(g.refs.map(r => r.id)).size === g.refs.length), "每个游戏至少三条基准规则，每条都有名字、一句话、为什么这么想、代码");
  ok(GAMES.every(g => g.T >= 10 && g.T <= 60 && (g.ui.kind === "choice" ? g.ui.options.length >= 2 : g.ui.presets.length >= 3)), "每局 10 到 60 回合；按钮至少两个，数字输入至少三个预设");
  ok(GAMES.every(g => (g.starter.code.match(/____/g) || []).length === FILL[g.id].length && g.starter.code.split("\n").filter(l => /____/.test(l)).every(l => !/^\s*\/\//.test(l))), "起始代码里的空只在代码行里，注释里不出现 ____（填空的时候才好认）");
  ok(GAMES.every(g => [g.code].concat(g.refs.map(r => r.code)).every(c => !/Math\.random|Date\b|setTimeout|fetch|eval|import/.test(c))), "裁判和基准规则里没有随机数以外的随机、没有时间、没有联网");
}

section("二、跑得通、可复现、分得出高下");
for (const g of GAMES) {
  const a = refRun(g, 50), b = refRun(g, 50);
  ok(a.every(r => !r.err && Number.isFinite(r.mean) && r.bad === 0) && a.every((r, i) => r.mean === b[i].mean && r.se === b[i].se), g.name + "：基准规则都跑得通，没有报的不是数的回合；同样的种子跑两遍一个数都不差", a.map(r => r.id + "=" + (r.err || r.mean.toFixed(2))).join());
  const base = a[0], best = a.slice(1).sort((x, y) => y.mean - x.mean)[0];
  ok(best.d > 3 * best.dse, g.name + "：有一条基准规则明显比“基准”好（差 " + best.d.toFixed(2) + " ± " + best.dse.toFixed(2) + "）");
  const filled = run(g, [{ code: FILL[g.id].reduce((c, f) => c.replace("____", f), g.starter.code), p: g.starter.p }], 50)[0];
  ok(!filled.err && Number.isFinite(filled.mean), g.name + "：起始代码的空填上就跑得通（" + filled.mean.toFixed(2) + "）", filled.err);
  const lines = refRun(Object.assign({}, g, { T: g.T }), 2);
  ok(lines.every(r => r.rounds <= g.T), g.name + "：没有一局超过 T 回合");
}

section("三、讲解里写的数");
{
  // 猜硬币：知道 q 时 20 次平均能对 20·max(q, 1−q)，q 在 0.2 到 0.8 之间均匀：E = 20 × 0.65 = 13
  let s = 0, n = 0; for (let q = 0.2; q <= 0.8 + 1e-9; q += 0.001) { s += 20 * Math.max(q, 1 - q); n++; }
  near(s / n, 13, 0.02, "猜硬币：知道概率时的上限平均 13 分");
  ok(/13 分/.test(by.coin.math.join("")), "猜硬币的讲解写的就是 13 分");
  // 掷骰子：掷一次就收平均 5/6 × 4；(20 − x)/6 这笔账；门槛 20 最好
  near(5 / 6 * 4, 3.333, 0.001, "掷骰子：掷一次就收平均 3.33 分"); ok(/3\.3/.test(by.pig.refs[0].why), "讲解写的是 3.3");
  const HOLD = by.pig.refs[1].code, pig = run(by.pig, [10, 15, 20, 25, 30, 40].map(c => ({ code: HOLD, p: { c } })), 400);
  ok(pig[2].mean >= pig[0].mean && pig[2].mean >= pig[5].mean && pig[2].mean > pig[0].mean + 3 * Math.sqrt(pig[2].se ** 2 + pig[0].se ** 2) && pig[2].mean > pig[5].mean + 3 * Math.sqrt(pig[2].se ** 2 + pig[5].se ** 2), "门槛 20 明显比 10 和 40 好（4000 局）", pig.map(r => r.mean.toFixed(2)).join());
  for (const x of [10, 19, 20, 21, 30]) near((5 / 6) * (x + 4) - x, (20 - x) / 6, 1e-12, "再掷一次平均赚 (20 − x)/6，x = " + x);
  // 卖西瓜：知道上限 top 时最好的价是 top/2
  const rev = (x, top) => x * (1 - x / top); let bx = 0, bv = -1; for (let x = 0; x <= 10; x += 0.001) if (rev(x, 10) > bv) { bv = rev(x, 10); bx = x; }
  near(bx, 5, 0.002, "卖西瓜：上限 10 时最好的价是 5"); near(bv, 2.5, 1e-6, "平均每位收到 top/4");
  const melon = refRun(by.melon, 50);
  ok(melon[1].mean > melon[0].mean + 3 * melon[1].dse && melon[2].mean < melon[0].mean, "涨跌各一成明显比一口价好；涨得快降得慢比一口价还差（它停在太高的价上）", melon.map(r => r.mean.toFixed(1)).join());
  // 抽卡机：概率 60% 的机器试 3 次，只出 1 次甚至 0 次的概率超过四分之一
  const p01 = 0.4 ** 3 + 3 * 0.6 * 0.4 ** 2; ok(p01 > 0.25 && p01 < 0.4, "二项分布：试 3 次出不超过 1 次的概率 " + p01.toFixed(3));
  const EXPL = by.bandit.refs[2].code, band = run(by.bandit, [1, 2, 3, 5, 7].map(n => ({ code: EXPL, p: { tries: n } })), 100);
  ok(Math.max(band[1].mean, band[2].mean) > band[4].mean + 3 * Math.sqrt(band[2].se ** 2 + band[4].se ** 2), "各试 2、3 次比各试 7 次明显好", band.map(r => r.mean.toFixed(2)).join());
  // 找最大的数：从后往前算的 V(2) = 63.0，V(10) ≈ 86.6；过 70 就要约 84
  const v = [50.5]; for (let k = 2; k <= 10; k++) { let s2 = 0; for (let x = 1; x <= 100; x++) s2 += Math.max(x, v[k - 2]); v.push(s2 / 100); }
  near(v[1], 63.0, 0.01, "V(2) = 63.0"); near(v[9], 86.6, 0.1, "V(10) ≈ 86.6"); ok(/63\.0/.test(by.stop.refs[2].why) || /63\.0/.test(by.stop.math.join("")), "讲解写的是 63.0");
  const stop = refRun(by.stop, 200);
  near(stop[0].mean, 50.5, 4 * stop[0].se + 0.01, "要第一个平均 50.5"); near(stop[1].mean, 84, 1.5, "过 70 就要约 84"); near(stop[2].mean, v[9], 4 * stop[2].se + 0.01, "门槛越来越低的平均就是 V(10)");
  // 奶茶店：多做一杯值不值 → 卖得掉的概率超过 60%；平均 15 位时最划算是 14 杯；“卖光加 1 没卖光减 2”停在卖光概率 2/3
  const lam = 15, pmf = []; let pk = Math.exp(-lam); for (let k = 0; k <= 80; k++) { pmf.push(pk); pk = pk * lam / (k + 1); }
  const profit = q => { let e = 0; for (let d = 0; d <= 80; d++) e += Math.min(q, d) * pmf[d]; return 5 * e - 3 * q; }, tail = q => { let t = 0; for (let d = q; d <= 80; d++) t += pmf[d]; return t; };
  let bq = 0, bp = -1e9; for (let q = 5; q <= 30; q++) if (profit(q) > bp) { bp = profit(q); bq = q; }
  ok(bq === 14 && tail(15) < 0.6 && tail(14) > 0.6, "泊松 15 时最划算 14 杯，正好是“再多一杯卖得掉的概率”刚降到 60% 以下的地方（" + tail(14).toFixed(2) + " → " + tail(15).toFixed(2) + "）");
  near(2 / (1 + 2), 2 / 3, 1e-12, "加 1 减 2 停在卖光概率 2/3");
  const shop = refRun(by.shop, 50);
  ok(shop[2].mean > shop[0].mean + 3 * shop[2].dse && shop[2].mean > shop[1].mean, "卖光加 1 没卖光减 2 明显比固定 15 杯和“昨天卖几杯”好", shop.map(r => r.mean.toFixed(1)).join());
  const CHASE = by.shop.refs[2].code, ch = run(by.shop, [{ code: CHASE, p: { start: 15, up: 1, down: 2 } }, { code: CHASE, p: { start: 15, up: 2, down: 1 } }], 50);
  ok(ch[0].mean > ch[1].mean + 3 * Math.sqrt(ch[0].se ** 2 + ch[1].se ** 2), "反过来“加 2 减 1”明显差：亏的比赚的多，该少做", ch.map(r => r.mean.toFixed(1)).join());
  // 停车：(1 − q)^5
  near(0.7 ** 5, 0.168, 0.001, "q = 0.3 时后面 5 个全满的概率约 17%"); near(0.9 ** 5, 0.590, 0.001, "q = 0.1 时约 59%");
  const NEAR = by.park.refs[1].code, ADAPT = by.park.refs[2].code, both = [{ code: by.park.refs[0].code, p: {} }, { code: NEAR, p: { d: 3 } }, { code: NEAR, p: { d: 4 } }, { code: NEAR, p: { d: 6 } }, { code: ADAPT, p: {} }];
  const low = run(by.park, both, 50, { p: { lo: 0.1, hi: 0.3 } }), high = run(by.park, both, 50, { p: { lo: 0.6, hi: 0.9 } }), all = run(by.park, both, 50);
  ok(low[4].mean > low[1].mean + 3 * Math.sqrt(low[4].se ** 2 + low[1].se ** 2) && high[4].mean > high[3].mean + 3 * Math.sqrt(high[4].se ** 2 + high[3].se ** 2) && all[4].mean >= Math.max(all[1].mean, all[2].mean, all[3].mean), "看情况的那条：空位少的街上明显比“3 格以内”好，空位多的街上明显比“6 格以内”好，两种都有时不比任何固定门槛差", [low, high, all].map(x => x.map(r => r.mean.toFixed(1)).join()).join(" | "));
}

section("四、编程教程");
{
  const runSnippet = code => { const out = []; const ctx = vm.createContext({ print: function () { out.push(Array.prototype.map.call(arguments, v => typeof v === "number" ? String(+v.toPrecision(12)) : v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)).join(" ")); } }); let err = ""; try { vm.runInContext("(function () { \"use strict\";\n" + code + "\n})();", ctx, { timeout: 2000 }); } catch (e) { err = String(e && e.message || e); } return { out, error: err }; };
  const bare = code => code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, " "));
  const norm = c => String(c).replace(/\s+/g, "");
  const C = LESSONS.course, UNITS = C.units, STEPS = [].concat(...UNITS.map(u => u.steps)), S = {}; STEPS.forEach(st => { S[st.id] = st; });
  ok(UNITS.length === 10 && STEPS.length >= 30 && UNITS.every(u => u.id && u.title && u.goal && u.minutes > 0 && u.steps.length >= 3) && STEPS.every(st => st.id && st.title && st.text.length >= 1 && st.code && st.task && typeof st.check === "function" && st.hints.length >= 1 && st.answer && /^(print|rule|rule200)$/.test(st.kind)), "十个单元、三十几步；每一步有讲解、例子、试一试、核对、提示、答案");
  ok(new Set(STEPS.map(st => st.id)).size === STEPS.length && new Set(UNITS.map(u => u.id)).size === UNITS.length && /^[a-z0-9]+$/.test(UNITS.map(u => u.id).join("")), "编号不重复，能放进网址");
  ok(STEPS.every(st => st.kind === "print" ? !st.game : !!by[st.game]) && UNITS.every(u => !u.game || by[u.game]) && C.after.length >= 1, "规则类的步骤都指着一个存在的游戏；结尾有“学完以后”");
  ok(!STEPS.some(st => /____/.test(st.code) || /____/.test(st.answer)), "教程里不留 ____ 的空（填空在“写规则”那页）");
  ok(STEPS.filter(st => /[（）；，：“”]/.test(bare(st.code))).map(st => st.id).join() === "s14" && !STEPS.some(st => /[（）；，：“”]/.test(bare(st.answer))), "例子里的中文标点只出现在故意讲它的那一步；答案里没有");
  ok(STEPS.every(st => st.text.concat(st.hints, [st.task]).every(t => typeof t === "string" && t.length < 500)), "每一段都不太长");
  ok(STEPS.every(st => (st.same ? norm(st.answer) === norm(st.code) : norm(st.answer) !== norm(st.code))), "标了 same 的那几步答案就是例子，其余的答案和例子不同");
  ok(/while \(true\)/.test(S.s44.loopDemo) && !STEPS.some(st => st.loopDemo && st.id !== "s44"), "第 4.4 步带一个死循环的演示");
  for (const st of STEPS.filter(x => x.kind === "print")) {
    const r = runSnippet(st.code), ra = runSnippet(st.answer);
    if (st.id === "s14" || st.id === "s101") ok(r.error !== "", "第 " + st.title + "：例子故意有错，跑不通", r.out.join(" / ")); else ok(!r.error && r.out.length > 0, "《" + st.title + "》的例子跑得通，有显示", r.error || r.out.join(" / "));
    ok(!ra.error && st.check(ra, st.answer) === "", "《" + st.title + "》的参考答案过核对", ra.error || st.check(ra, st.answer));
    if (!st.same && !r.error) ok(st.check(r, st.code) !== "", "《" + st.title + "》：没改的例子不算做到");
  }
  // 规则类的步骤：和基准规则放到同一局上，答案要和核对说的那条基准规则得分一样；没改的例子不算（标了 same 的除外）
  const once = (g, code, seed) => { const players = g.refs.map((r, i) => ({ id: "ref:" + r.id, code: r.code, p: r.p, slot: i })).concat([{ id: "you", code, p: {}, slot: 32 }]); const res = job([{ id: "game", code: g.code }].concat(players.map(p => ({ id: p.id, code: p.code }))), { kind: "quest", game: "game", gp: g.p, T: g.T, K: 1, seeds: [seed], trace: true, entries: players.map(p => ({ id: p.id, p: p.p, slot: p.slot })) }); const you = res.rows.filter(x => x.id === "you")[0], sk = res.skipped.filter(x => x.id === "you")[0]; const refs = {}; res.rows.forEach(x => { if (x.id !== "you" && !x.err) refs[x.id.slice(4)] = x.mean; }); return sk ? { error: sk.err } : you.err ? { error: you.err } : { out: [], error: "", score: you.mean, refs, bad: you.bad, T: g.T }; };
  const daySeed = (gid, day) => QL.questHash("teen|" + gid + "|" + day) | 0, DAYS = ["2026-10-18", "2026-10-19", "2026-11-01", "2027-03-07", "2026-12-31"];
  for (const st of STEPS.filter(x => x.kind === "rule")) {
    const g = by[st.game], seeds = DAYS.map(d => daySeed(g.id, d));
    const good = seeds.map(sd => { const r = once(g, st.answer, sd); return r.error ? r.error : st.check(Object.assign({ changed: true }, r), st.answer); });
    ok(good.every(x => x === ""), "《" + st.title + "》（" + g.name + "）：参考答案在五个不同的日子上都过核对", good.join(" | "));
    const r0 = once(g, st.code, seeds[0]);
    if (st.same) ok(!r0.error && st.check(Object.assign({ changed: false }, r0), st.code) === "", "《" + st.title + "》：照原样跑一遍就算做到");
    else ok(r0.error !== "" || st.check(Object.assign({ changed: true }, r0), st.code) !== "", "《" + st.title + "》：没改的例子不算做到", JSON.stringify(r0));
  }
  ok(S.s103 && once(by.coin, S.s103.code, daySeed("coin", DAYS[0])).bad > 0 && once(by.coin, S.s103.answer, daySeed("coin", DAYS[0])).bad === 0, "第 10.3 步：忘了 return 的规则有报的不是数的回合，补上就没有了");
  for (const st of STEPS.filter(x => x.kind === "rule200")) {
    const g = by[st.game], rows = run(g, [{ code: st.code, p: {} }, { code: st.answer, p: {} }], 20);
    ok(rows.every(r => !r.err && Number.isFinite(r.mean)) && st.check({ changed: true }) === "" && st.check({ changed: false }) !== "", "《" + st.title + "》（" + g.name + "）：例子和答案在 200 局上都跑得通；改过才算做到", rows.map(r => r.err || r.mean.toFixed(2)).join());
  }
  ok(STEPS.filter(x => x.kind === "rule").length >= 9 && STEPS.filter(x => x.kind === "rule200").length === 3 && ["coin", "melon", "bandit"].every(gid => STEPS.some(x => x.kind === "rule200" && x.game === gid)), "三个真正的问题各有一步在 200 局上比");
}

section("五、七个想法和它们的实验");
{
  ok(LESSONS.algo.length === 7 && LESSONS.algo.every(l => l.id && l.title && by[l.game] && l.intro.length && l.experiment && l.takeaway.length), "七个想法，各对着一个游戏，各有讲解、实验、记住这几句");
  const check = (exp, what) => {
    const g = by[exp.game], players = exp.entries.map((e, i) => { const r = e.ref ? g.refs.filter(x => x.id === e.ref)[0] : null; ok(!e.ref || !!r, what + "：实验引用的基准规则存在：" + e.ref); return { code: e.code || (r && r.code), p: e.p || (r ? r.p : {}), slot: i, name: e.name || (r && r.name) }; });
    ok(players.every(p => p.code), what + "：每一条都有代码");
    const variants = exp.variants || [{ p: g.p }];
    return variants.map(vv => run(Object.assign({}, g, { p: vv.p }), players, 20).map((r, i) => ({ name: players[i].name, mean: r.mean, se: r.se, err: r.err })));
  };
  const res = {}; LESSONS.algo.forEach(l => { res[l.id] = check(l.experiment, l.title); if (l.experiment2) res[l.id + "2"] = check(l.experiment2, l.title + "（第二个实验）"); });
  ok(Object.keys(res).every(k => res[k].every(v => v.every(r => !r.err))), "所有实验都跑得通");
  const top = rows => rows.slice().sort((a, b) => b.mean - a.mean)[0].name;
  ok(top(res.estimate[0]) === "跟着多数猜" && /涨跌|卖掉就涨/.test(top(res.feedback[0])) && top(res.backward[0]) === "门槛越来越低" && top(res.expect2[0]) === "卖光加 1，没卖光减 2", "各个实验里讲解说最好的那条，在数据上也最好", [res.estimate, res.feedback, res.backward, res.expect2].map(x => top(x[0])).join());
  ok(res.explore[0].filter(r => /各试 [23] 次/.test(r.name)).some(r => r.mean >= Math.max.apply(null, res.explore[0].map(x => x.mean)) - 1e-9), "探索与利用：各试 2 或 3 次是最好的");
  const park = res.context; ok(park.length === 3 && top(park[0]) === "一路数空位，再定门槛" && top(park[1]) === "一路数空位，再定门槛", "停车：空位少的街和空位多的街上，看情况的那条都最好", park.map(v => top(v)).join(" | "));
  ok(LESSONS.algo.every(l => !l.intro.concat(l.takeaway).some(t => /\$|\\\(/.test(t))), "讲解里没有公式标记（青少年版不带公式库）");
}

section("六、文字");
{
  const all = JSON.stringify(GAMES, (k, v) => typeof v === "function" ? undefined : v) + JSON.stringify(LESSONS, (k, v) => typeof v === "function" ? undefined : v);
  ok(!/投资|炒股|赚钱的办法|股票|基金/.test(all), "青少年版的文字里没有投资、炒股");
  ok(GAMES.every(g => g.about.concat(g.math, g.think, g.example).every(t => typeof t === "string" && t.length < 400)), "每一段都不太长");
  ok(GAMES.every(g => g.refs.every(r => CJK.test(r.code.split("\n")[0]))), "每条基准规则的第一行都是中文注释");
}

done();
