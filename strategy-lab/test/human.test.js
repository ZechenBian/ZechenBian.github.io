// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 亲手玩一局：逐回合推进与一口气走完是不是同一局；给人看的局面有没有泄露裁判藏着的东西；参照规则、长期平均、打完后揭晓的内容对不对
const path = require("path");
const { QL, ok, near, section, done } = require("./harness.js");
const H = require(path.join(__dirname, "../src/human.js"))(QL);
const LIB = QL.gameLib, GAMES = ["g_lock", "g_sec", "g_coin", "g_bandit"];
const f = (x, d = 4) => (typeof x === "number" && x === x ? x.toFixed(d) : String(x));
const eqArr = (a, b) => a.length === b.length && Array.prototype.every.call(a, (v, i) => v === b[i] || (v !== v && b[i] !== b[i]));
/** 让一条规则打第 k 局，记下它每一回合交给裁判的数 */
function record(B, S, p, model) {
  const acts = [], seen = [];
  const res = QL.runGame(B, { init: S.init, decide: (s, pp, st, m) => { const a = S.decide(s, pp, st, m); acts[s.t] = a; seen[s.t] = H[B.game].snap(s); return a; } }, p, null, { detail: 0 }, model);
  for (let i = 0; i < acts.length; i++) if (acts[i] === undefined) acts[i] = NaN;
  return { acts, seen, res };
}
/** 像人那样一回合一回合地把同一串动作交上去。
 *  替人作答的回合（被锁住、每一台都锁着、只剩最后一个人）交的数可能和规则自己交的不一样，但那些回合交什么都不改变结果；
 *  核对"人看到的局面"时，把前面的回合全换成规则自己交的数再重放一遍，这样两边应该一模一样。 */
function drive(B, want) {
  const J = v => JSON.stringify(v, (k, x) => (k === "t" ? undefined : x !== x ? "NaN" : x));
  let st = QL.humanStep(B, []), steps = 0, viewsOk = true, why = "";
  while (!st.done) {
    if (st.t >= want.acts.length) return { st, steps, viewsOk: false, why: "裁判问到了规则没被问过的回合 " + st.t };
    const chk = QL.humanStep(B, want.acts.slice(0, st.t));
    if (chk.done || chk.t !== st.t || J(chk.view) !== J(want.seen[st.t])) { viewsOk = false; why = why || "第 " + st.t + " 回合"; }
    const acts = st.acts.slice(); acts[st.t] = want.acts[st.t]; steps++;
    st = QL.humanStep(B, acts);
    if (steps > B.T + 5) return { st, steps, viewsOk: false, why: "走不完" };
  }
  return { st, steps, viewsOk, why };
}
const variants = {
  g_lock: [null, { dist: "pareto", alpha: 2.5 }, { dist: "normal", sd: 1 }],
  g_sec: [null, { goal: "best", info: "full" }, { goal: "rank", info: "rank" }, { goal: "rank", info: "full" }],
  g_coin: [null, { cap: 0 }, { p: 0.75 }],
  g_bandit: [null, { prior: "needle", arms: 10 }, { D: 2 }, { arms: 2, D: 3 }]
};

(async () => {
  section("登记");
  {
    ok(eqArr(QL.humanGames(), GAMES), "四套玩法可以亲手玩", QL.humanGames().join(" "));
    ok(QL.GAMES.concat(QL.OBS).filter(k => !QL.humanDef(k)).length === 10 && QL.humanDef("gbm") === null, "其余的玩法和价格世界不能");
    for (const g of GAMES) {
      const w = QL.WORLDS[g], p = QL.worldDefaults(g), hd = QL.humanDef(g), zs = QL.humanSizes(g, p), ids = w.refs(p).map(r => r.id);
      ok(zs.length >= 3 && zs.slice(0, 3).every(z => w.Tof(z.hp) >= 10 && w.Tof(z.hp) <= 120) && zs.slice(0, 3).map(z => z.id).join("") === "sml", `${w.short}：三种人打得动的长度（10 到 120 回合）`, zs.map(z => z.id + ":" + w.Tof(z.hp)).join(" "));
      ok(zs.every(z => Object.keys(z.hp).length === Object.keys(p).length && Object.keys(p).every(k => k in z.hp)), `${w.short}：人打的参数是完整的一组，只改了长度`);
      const st = hd.star(p);
      ok(st.id === null ? st.why === "long" : ids.indexOf(st.id) >= 0 && !!w.refs(p).filter(r => r.id === st.id)[0].lib && /^(opt|growth)$/.test(st.why), `${w.short}：先比的那条参照规则在对照表里而且是一条真的规则，或者留到打之前按长期平均挑`, st.id + " / " + st.why);
    }
    const pc = QL.worldDefaults("g_coin");
    ok(QL.humanSizes("g_coin", pc).map(z => z.id).join(",") === "s,m,l,same" && QL.humanSizes("g_coin", pc)[3].hp.T === 300, "偏硬币默认 300 次：可以原样打（实验原样）");
    ok(QL.humanSizes("g_lock", QL.worldDefaults("g_lock")).length === 3 && QL.humanSizes("g_bandit", QL.worldDefaults("g_bandit")).length === 3, "接单 2000 回合、老虎机 500 回合：不给原样打");
    ok(QL.humanSizes("g_sec", QL.worldDefaults("g_sec")).map(z => z.id).join(",") === "s,m,l,same" && QL.humanSizes("g_sec", Object.assign(QL.worldDefaults("g_sec"), { n: 20 })).length === 3, "秘书问题 100 人可以原样打；左栏正好是 20 人时不重复列出");
    let msg = ""; try { QL.humanEpisode("g_news", {}, 1, 0); } catch (e) { msg = e.message; } ok(/不能亲手玩/.test(msg), "不支持的玩法给出说得清的错误", msg);
  }

  section("对局：可复现，各局互不相同，与计分用的那一批无关");
  for (const g of GAMES) {
    const w = QL.WORLDS[g], hp = QL.humanSizes(g, QL.worldDefaults(g))[1].hp;
    const a = QL.humanEpisode(g, hp, 7, 0), b = QL.humanEpisode(g, hp, 7, 0), c = QL.humanEpisode(g, hp, 7, 1), d = QL.humanEpisode(g, hp, 8, 0), tr = QL.sliceGame(QL.gameBatch({ type: g, params: hp, N: 3, seed: 7 }, 0), 0);
    const key = B => Array.from(B.R).concat(Object.keys(B.H).map(k => Array.from(B.H[k]).join(","))).join("|");
    ok(a.N === 1 && a.T === w.Tof(hp) && key(a) === key(b), `${w.short}：同一个种子、同一个局号，生成的是同一局`);
    ok(key(a) !== key(c) && key(a) !== key(d) && key(a) !== key(tr), `${w.short}：换局号、换种子都是另一局；也不是计分那一批里的第 0 局`);
  }

  section("逐回合推进 = 一口气走完");
  for (const g of GAMES) {
    const w = QL.WORLDS[g];
    for (const over of variants[g]) {
      const base = Object.assign(QL.worldDefaults(g), over || {});
      for (const z of QL.humanSizes(g, base).filter(z => z.id !== "same")) {
        const kit = QL.humanKit(g, z.hp, 11), tag = `${w.short}${over ? " " + JSON.stringify(over) : ""} · ${w.Tof(z.hp)}`;
        let bad = [], n = 0, steps = 0;
        for (let k = 0; k < 6; k++) {
          const B = QL.humanEpisode(g, z.hp, 11, k);
          for (const r of kit.refs) {
            if (!r.strat) continue;
            const want = record(B, r.strat, r.p, r.model), got = drive(B, want); n++; steps += got.steps;
            const full = QL.humanStep(B, want.acts), det = want.res.det, void0 = (a, m) => Array.from(a).map((v, i) => (m[i] === 2 ? 0 : v));
            if (!full.done || full.score !== want.res.SC[0] || !eqArr(full.a, det.a) || !eqArr(full.w, det.w) || !eqArr(full.m, det.m)) bad.push(`${r.id}#${k} 把整串动作原样交回去，结果不同`);
            else if (!got.st.done || got.st.score !== want.res.SC[0]) bad.push(`${r.id}#${k} 得分 ${got.st.done ? f(got.st.score) : "没走完"} ≠ ${f(want.res.SC[0])}${got.why ? "（" + got.why + "）" : ""}`);
            else if (!eqArr(void0(got.st.a, got.st.m), void0(det.a, det.m)) || !eqArr(got.st.w, det.w) || !eqArr(got.st.m, det.m) || !eqArr(got.st.aux, Array.from(want.res.AUX))) bad.push(`${r.id}#${k} 明细不同`);
            else if (!got.viewsOk) bad.push(`${r.id}#${k} 人看到的局面和规则看到的不一样（${got.why}）`);
          }
        }
        ok(bad.length === 0 && n >= 12, `${tag}：${n} 局逐回合交上规则自己的动作，得分、明细、看到的局面都与原样一致`, bad.slice(0, 3).join("; ") || `共 ${steps} 次决定`);
      }
    }
  }

  section("局面：只有规则读得到的东西；没得选的回合替人作答");
  {
    // 接单：被锁住的回合不问人
    const hp = QL.humanSizes("g_lock", QL.worldDefaults("g_lock"))[1].hp, B = QL.humanEpisode("g_lock", hp, 3, 0);
    let st = QL.humanStep(B, []);
    ok(!st.done && st.t === 0 && st.view.x === B.R[0] && st.view.locked === 0 && st.a.length === 0 && st.w.length === 1, "接单：开局问的是第 0 回合，看到的是这一回合的报价");
    st = QL.humanStep(B, [1]);
    ok(!st.done && st.t === hp.L + 1 && st.acts.length === hp.L + 1 && st.acts.slice(1).every(a => a === 0) && st.m[0] === 1 && st.m.slice(1).every(m => m === 2), "接单：接下之后，锁着的回合自动放过，下一次问的是解锁后的那一回合", `t = ${st.t}`);
    ok(st.views.length === hp.L + 2 && st.views.slice(1, hp.L + 1).every((v, i) => v.x === B.R[i + 1] && v.locked === hp.L - i), "接单：锁着的时候来过的报价照样看得到");
    let acts = []; st = QL.humanStep(B, acts); while (!st.done) { acts = st.acts.slice(); acts[st.t] = 0; st = QL.humanStep(B, acts); }
    ok(st.done && st.score === 0 && st.a.length === hp.T && st.aux[0] === 0, "接单：一单不接，得分是 0");
    const rv = QL.humanDef("g_lock").reveal(B); let tot = 0, gapOk = true; rv.prophet.forEach((t, i) => { tot += B.R[t]; if (i && t - rv.prophet[i - 1] <= hp.L) gapOk = false; });
    const kit = QL.humanKit("g_lock", hp, 3), refs = QL.humanRefsOn(kit, B), pr = refs.filter(r => r.id === "prophet")[0];
    ok(gapOk && Math.abs(tot - rv.prophetTotal) < 1e-9 && Math.abs(pr.score - tot / hp.T) < 1e-12, "接单：揭晓的\"事后诸葛亮\"接法满足间隔约束，总收益与对照表里的上界一致", `${rv.prophet.length} 单，${f(tot)}`);
    ok(refs.every(r => r.id === "prophet" || r.score <= pr.score + 1e-12), "接单：这一局里没有哪条规则超过事后诸葛亮");
  }
  {
    // 秘书："只能和见过的人比"时，人看到的只有相对名次
    const p = QL.worldDefaults("g_sec"), hp = QL.humanSizes("g_sec", p)[1].hp, B = QL.humanEpisode("g_sec", hp, 5, 2);
    let acts = [], st = QL.humanStep(B, acts), leak = false, n = 0;
    while (!st.done) { n++; if (st.view.x === st.view.x || st.view.rank !== B.H.rel[st.t] || st.view.left !== hp.n - 1 - st.t) leak = true; if (Object.keys(st.view).sort().join() !== "left,rank,t,x") leak = true; acts = st.acts.slice(); acts[st.t] = 0; st = QL.humanStep(B, acts); }
    ok(!leak && n === hp.n - 1, "秘书（只看名次）：分数从头到尾是 NaN，看到的只有到场时的相对名次和身后人数", `问了 ${n} 次`);
    ok(st.done && st.acts.length === hp.n && st.acts[hp.n - 1] === 1 && st.aux[0] === hp.n && st.aux[2] === 1, "秘书：一路放过，最后一个人不问，只能要他");
    const rv = QL.humanDef("g_sec").reveal(B);
    ok(rv.abs[rv.best] === 1 && rv.x[rv.best] === Math.max.apply(null, rv.x) && rv.abs.slice().sort((a, b) => a - b).every((v, i) => v === i + 1), "秘书：揭晓的绝对名次是 1 到 n 的一个排列，第 1 名是分数最高的那位");
    const acts2 = []; for (let t = 0; t < rv.best; t++) acts2.push(0); acts2.push(1);
    const win = QL.humanStep(B, acts2);
    ok(win.done && win.score === 1 && win.aux[0] === rv.best + 1 && win.views.length === rv.best + 1, "秘书：正好要了全场最好的那一位，得 1 分；之后的人裁判不再问");
    const hf = QL.humanSizes("g_sec", Object.assign({}, p, { info: "full" }))[1].hp, Bf = QL.humanEpisode("g_sec", hf, 5, 2), sf = QL.humanStep(Bf, []);
    ok(sf.view.x === Bf.R[0] && sf.view.x > 0 && sf.view.x < 1, "秘书（看得到分数）：看到的是眼前这个人的分数");
  }
  {
    // 硬币：下注金额与裁判认的比例之间来回换算
    const hd = QL.humanDef("g_coin"), p = QL.worldDefaults("g_coin"), hp = QL.humanSizes("g_coin", p)[1].hp, B = QL.humanEpisode("g_coin", hp, 9, 0);
    ok(hd.frac(25, 0.01, 1) * 25 >= 0.01 && hd.frac(25, 5, 1) * 25 >= 5 && hd.frac(25, 5, 1) * 25 - 5 < 1e-12 && hd.frac(25, 25, -1) === -1 && hd.frac(25, 30, 1) === 1 && hd.frac(25, 0, 1) === 0 && hd.frac(31.249999999999996, 31.25, 1) === 1, "硬币：押 1 美分不会因为舍入变成不足 1 美分；押得比资金多就是全押");
    let st = QL.humanStep(B, []);
    ok(st.view.wealth === 25 && st.view.prev !== st.view.prev, "硬币：开局看到本金，没有上一次的结果");
    st = QL.humanStep(B, [hd.frac(25, 5, 1)]);
    ok(Math.abs(st.view.wealth - (B.R[0] > 0 ? 30 : 20)) < 1e-9 && st.view.prev === B.R[0] && Math.abs(Math.abs(st.view.last) - 5) < 1e-9, "硬币：押 5 美元正面，押中变 30，没中变 20；上一次的结果看得到", f(st.view.wealth, 2));
    st = QL.humanStep(B, [hd.frac(25, 0.01, -1)]);
    ok(Math.abs(Math.abs(st.view.last) - 0.01) < 1e-12 && Math.sign(st.view.last) === -Math.sign(B.R[0]), "硬币：押 1 美分反面算数，结果和硬币相反");
    st = QL.humanStep(B, [0]); ok(st.view.wealth === 25 && st.view.last === 0 && st.t === 1, "硬币：不押，这一次照样过去");
    let acts = []; st = QL.humanStep(B, acts); while (!st.done) { acts = st.acts.slice(); acts[st.t] = 1; st = QL.humanStep(B, acts); }
    const firstTail = Array.from(B.R).indexOf(-1), dbl = Math.ceil(Math.log2(hp.cap / hp.start));
    ok(st.done && (firstTail >= 0 && firstTail < dbl ? st.score === 0 && st.aux[0] === 1 && st.views.length === firstTail + 1 : st.score === hp.cap && st.aux[1] === 1), "硬币：每次全押，出第一个反面就输光（除非之前已经封顶），之后裁判不再问", `第一个反面在第 ${firstTail} 次，得 ${f(st.score, 2)}`);
  }
  {
    // 老虎机：看得到的只有拉过几次、中过几次；真实的中奖率打完才揭晓
    const p = QL.worldDefaults("g_bandit"), hp = QL.humanSizes("g_bandit", p)[0].hp, B = QL.humanEpisode("g_bandit", hp, 4, 1), K = hp.arms;
    let acts = [], st = QL.humanStep(B, acts), okv = true, wins = 0;
    while (!st.done) { const v = st.view; if (Object.keys(v).sort().join() !== "last,lastA,lock,pulls,t,wins" || v.pulls.length !== K || v.pulls.reduce((a, b) => a + b, 0) !== st.t) okv = false; acts = st.acts.slice(); acts[st.t] = st.t % K; st = QL.humanStep(B, acts); }
    for (let t = 0; t < hp.T; t++) if (B.H.u[t] < B.H.mu[t % K]) wins++;
    ok(okv && st.done && Math.abs(st.score - wins / hp.T) < 1e-12 && st.w[hp.T] === wins, "老虎机：轮流拉，看到的是各台拉过、中过的次数；得分与用隐藏的中奖率直接算的一致", `${wins} / ${hp.T}`);
    const rv = QL.humanDef("g_bandit").reveal(B); ok(rv.mu.length === K && rv.mu[rv.best] === Math.max.apply(null, rv.mu), "老虎机：打完揭晓各台真实的中奖率和最好的那一台");
    // 有锁、台数比锁期少：每一台都锁着的回合自动作废
    const h2 = Object.assign({}, hp, { arms: 2, D: 3 }), B2 = QL.humanEpisode("g_bandit", h2, 4, 0);
    st = QL.humanStep(B2, [0]); ok(!st.done && st.t === 1 && st.view.lock[0] === 3 && st.view.lock[1] === 0, "老虎机（有锁）：拉过的那台锁着，另一台能拉");
    st = QL.humanStep(B2, [0, 1]); ok(!st.done && st.t === 4 && st.m[2] === 2 && st.m[3] === 2 && st.view.lock[0] === 0, "老虎机（有锁）：两台都锁着的回合自动作废，等到有一台解锁再问", `t = ${st.t}`);
  }

  section("参照规则、长期平均");
  for (const g of GAMES) {
    const w = QL.WORLDS[g], p = QL.worldDefaults(g), hp = QL.humanSizes(g, p)[1].hp, kit = QL.humanKit(g, hp, 7), B = QL.humanEpisode(g, hp, 7, 0);
    const refs = QL.humanRefsOn(kit, B), again = QL.humanRefsOn(kit, B), want = QL.gameRefs(B, { fitData: () => QL.makeData(QL.gameBatch({ type: g, params: hp, N: Math.max(200, Math.min(2000, Math.ceil(24000 / kit.T))), seed: 7 }, 0, "fit")) });
    ok(kit.refs.length === w.refs(hp).length && kit.refs.every(r => !r.err) && kit.refs.filter(r => r.bench).length === 1 && (kit.star === null || kit.refs.some(r => r.id === kit.star)), `${w.short}：参照规则齐全，没有出错的`, kit.refs.map(r => r.id).join(" "));
    ok(refs.every((r, i) => r.score === want[i].SC[0] && r.id === want[i].id) && refs.every((r, i) => r.score === again[i].score), `${w.short}：同一局上各条参照的得分与对照表的算法逐条相同，重算不变`, refs.map(r => r.id + "=" + f(r.score, 3)).join(" "));
    ok(refs.every(r => kit.refs.filter(x => x.id === r.id)[0].calc ? r.w === null : r.w.length === kit.T + 1 && r.a.length === kit.T), `${w.short}：真的规则带着那一局的明细`);
    const N = QL.humanLongN(kit), LB = QL.humanLongBatch(kit), th = w.theory(hp);
    ok(LB.N === N && N * kit.T <= 240000 + kit.T && N >= 300, `${w.short}：长期平均用 ${N} 局`);
    const by = {}; kit.refs.forEach(r => { by[r.id] = QL.humanLongRef(kit, LB, r.id); });
    const sid = QL.humanStar(kit, by), star = by[sid], bench = by[kit.refs.filter(r => r.bench)[0].id];
    ok(!!sid && (kit.star === null || sid === kit.star) && kit.refs.filter(r => r.id === sid)[0].strat && star.n === N && star.se > 0 && star.m > bench.m + 2 * Math.hypot(star.se, bench.se || 0), `${w.short}：先比的那条规则（${sid}）长期平均明显高于基准`, `${f(star.m)} ± ${f(star.se)} 对 ${f(bench.m)}`);
    const opt = (th.marks || []).filter(m => m.kind === "optimum")[0];
    if (opt) ok(Math.abs(star.m - opt.value) < 4 * star.se + 0.02 * Math.abs(opt.value), `${w.short}：它的长期平均与这组（短局的）设定下的理论最优对得上`, `${f(star.m)} ± ${f(star.se)}，理论 ${f(opt.value)}`);
  }
  {
    // 秘书问题四种设定各自先和谁比
    const p = QL.worldDefaults("g_sec"), star = (goal, info) => QL.humanDef("g_sec").star(Object.assign({}, p, { goal, info })).id;
    ok(star("best", "rank") === "cut" && star("best", "full") === "gm" && star("rank", "rank") === "rank" && star("rank", "full") === null, "秘书问题：三种设定有理论上最优的参照；看得到分数又按名次计分的那种留给长期平均去挑");
    for (const [goal, info] of [["best", "rank"], ["best", "full"], ["rank", "rank"], ["rank", "full"]]) {
      const hp = QL.humanSizes("g_sec", Object.assign({}, p, { goal, info }))[1].hp, kit = QL.humanKit("g_sec", hp, 7), LB = QL.humanLongBatch(kit);
      const all = kit.refs.filter(r => r.strat).map(r => ({ id: r.id, s: QL.humanLongRef(kit, LB, r.id) })), top = all.slice().sort((a, b) => b.s.m - a.s.m)[0], by = {}; all.forEach(x => { by[x.id] = x.s; });
      const sid = QL.humanStar(kit, by), st = all.filter(x => x.id === sid)[0];
      ok(top.id === sid || top.s.m - st.s.m < 2 * Math.hypot(top.s.se, st.s.se), `秘书问题（${goal} / ${info}）：先比的那条在长期平均里排第一（或与第一名分不出高下）`, all.map(x => x.id + "=" + f(x.s.m, 3)).join(" "));
    }
    const hc = QL.humanSizes("g_coin", Object.assign(QL.worldDefaults("g_coin"), { cap: 0 }))[1].hp;
    ok(QL.humanDef("g_coin").star(hc).id === "kelly" && QL.humanDef("g_coin").star(hc).why === "growth" && QL.humanDef("g_coin").star(QL.worldDefaults("g_coin")).id === "dp", "偏硬币：封顶时和动态规划比，不封顶时和 Kelly 比");
    // 老虎机：短局里贪心最好，长局里 Thompson 抽样最好，所以不事先指定
    const pick = T => { const kit = QL.humanKit("g_bandit", Object.assign(QL.worldDefaults("g_bandit"), { T }), 7), LB = QL.humanLongBatch(kit), by = {}; kit.refs.forEach(r => { by[r.id] = QL.humanLongRef(kit, LB, r.id); }); return { id: QL.humanStar(kit, by), by }; };
    const s30 = pick(30), s300 = pick(300);
    ok(s30.id === "greedy" && s300.id === "ts" && s30.by.prophet.m > s30.by.greedy.m, "老虎机：30 回合的短局先和贪心比，300 回合的先和 Thompson 抽样比；上界不参加挑选", `30: 贪心 ${f(s30.by.greedy.m, 3)} 对 TS ${f(s30.by.ts.m, 3)}；300: ${f(s300.by.greedy.m, 3)} 对 ${f(s300.by.ts.m, 3)}`);
  }
  done();
})();
