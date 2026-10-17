// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 青少年版（src/teen/）：七个小游戏都跑得通、可复现、基准规则分得出高下、填空填上就能跑；讲解里写的数一个个拿精确计算或大样本去对；
// 七课的例子跑得通、"改一改"的参考答案能过；七个想法的实验里说的"哪条更好"在数据上成立。
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

section("四、七课");
{
  const sb = { print: null };
  const runSnippet = code => { const out = []; const ctx = vm.createContext({ print: function () { out.push(Array.prototype.map.call(arguments, v => typeof v === "number" ? String(+v.toPrecision(12)) : v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)).join(" ")); } }); let err = ""; try { vm.runInContext("(function () { \"use strict\";\n" + code + "\n})();", ctx, { timeout: 2000 }); } catch (e) { err = String(e && e.message || e); } return { out, err }; };
  ok(LESSONS.code.length === 7 && LESSONS.code.every(l => l.id && l.title && l.intro.length && l.code && l.notes.length && l.task && typeof l.task.check === "function"), "七课，每课有讲解、例子、要点、改一改");
  const SOL = { seq: l => l.code + "\nprint(7 * 8);", var: l => l.code.replace("price = price * 2;      // 取出来乘以 2，再放回去", "price = price * 2; price = price * 2;"), if: l => l.code.replace("var see = 1;", "var see = 0;"), loop: l => l.code.replace("results[i] === 1", "results[i] === 0"), fn: l => l.code + "\nfunction avg(a, b, c) { return (a + b + c) / 3; }\nprint(avg(1, 2, 3));", obj: l => l.code.replace("st.wins = [0, 0, 0];", "st.wins = [2, 5, 3];"), rule: l => "function decide(s, p, st) {\n  return s.see === 0 ? 0 : 1;\n}" };
  for (const l of LESSONS.code) {
    if (l.rule) { ok(QLJobs_syntax(l.code) === "" && /function\s+decide/.test(l.code), "第七课：例子是一条完整的规则"); const sol = SOL.rule(l); ok(l.task.check([], l.code) !== "" && l.task.check([], sol) === "", "第七课：原样不算做到，改成“跟着上一次”算做到"); continue; }
    const r = runSnippet(l.code);
    ok(!r.err && r.out.length > 0, "《" + l.title + "》的例子跑得通，有输出", r.err || r.out.join(" / "));
    const bad = l.task.check(r.out, l.code), sol = SOL[l.id](l), r2 = runSnippet(sol), good = l.task.check(r2.out, sol);
    ok(bad !== "" && good === "" && !r2.err, "《" + l.title + "》：原样跑不算做到，参考答案算做到", bad + " | " + good + " | " + r2.err);
  }
  ok(/while \(true\)/.test(LESSONS.code[3].loopDemo), "第四课带一个死循环的演示");
  function QLJobs_syntax(code) { try { new Function("\"use strict\";\n" + code + "\n"); return ""; } catch (e) { return String(e.message); } }
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
