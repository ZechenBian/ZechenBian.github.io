// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 十套玩法：框架本身、每套玩法的裁判是否照规则办事、说明文字里写的每一个数是否对得上模拟
const { QL, STRATS, compile, world, ok, near, section, done } = require("./harness.js");
const LIB = QL.gameLib, GS = STRATS.filter(s => s.game);
const f = (x, d = 4) => (typeof x === "number" && x === x ? x.toFixed(d) : String(x));
const defs = st => { const p = {}; (st.params || []).forEach(q => { p[q.key] = q.def; }); return p; };
/** 在一批对局上跑一条规则（lib 的名字、内置规则的 id，或者 {decide, init, fit}） */
function sim(type, over, strat, p, N, seed, opt) {
  const cfg = world(type, over, N, null, null, seed), B = QL.makeBatch(cfg, null, 0), S = typeof strat === "string" ? LIB[strat] : strat;
  const model = S.fit ? S.fit(QL.makeData(QL.makeBatch(cfg, null, 0, "fit")), p || {}, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined;
  const res = QL.runGame(B, S, p || {}, null, opt || {}, model), g = QL.gameSummary(B, res, null);
  return { cfg, B, res, g, model, score: g.score, se: g.se, aux: g.aux.map(a => a.value), sum: QL.summarize(res, QL.DEFAULT_SET) };
}
const pairedDiff = (a, b) => { let s = 0, s2 = 0; const n = a.length; for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d; s2 += d * d; } const m = s / n; return { m, se: Math.sqrt(Math.max(0, s2 / n - m * m) / n) }; };
const within = (x, target, se, k, slack, name, extra) => ok(Math.abs(x - target) <= k * se + (slack || 0), name, `模拟 ${f(x)} ± ${f(se)}，理论 ${f(target)}${extra ? "；" + extra : ""}`);

(async () => {
  section("框架");
  {
    ok(QL.GAMES.length === 10 && QL.GAMES.every((k, i) => QL.WORLDS[k].no === i + 1), "十套玩法都登记了，编号 1 到 10", QL.GAMES.join(" "));
    ok(QL.WORLD_GROUPS[0] === QL.GAME_GROUP, "玩法在世界列表里单独成组");
    for (const k of QL.GAMES) {
      const w = QL.WORLDS[k], need = ["name", "short", "blurb", "unit", "params", "defaults", "Tof", "consts", "score", "track", "action", "aux", "defStrat", "gen", "play", "theory", "refs", "scenes", "api"];
      ok(need.every(q => w[q] != null) && w.game === true && w.group === QL.GAME_GROUP, `${w.short}：元数据齐全`, need.filter(q => w[q] == null).join(","));
      const p = QL.worldDefaults(k), refs = w.refs(p), th = w.theory(p), sc = w.score(p);
      ok(refs.filter(r => r.bench).length === 1 && refs.every(r => r.calc || r.alt || LIB[r.lib]), `${w.short}：有且只有一个基准，参照规则都找得到`);
      ok(Array.isArray(th.marks) && th.marks.every(m => typeof m.value === "number" && isFinite(m.value)) && typeof sc.name === "string", `${w.short}：理论值都是有限的数`, th.marks.map(m => f(m.value, 3)).join(" "));
      ok(GS.some(s => s.id === w.defStrat && s.game === k) && GS.filter(s => s.game === k).length >= 3, `${w.short}：默认规则存在，内置规则不少于 3 条`, String(GS.filter(s => s.game === k).length));
    }
    // 可复现、与路径数无关、各批次互不相同
    const cfg = world("g_lock", null, 30), B1 = QL.makeBatch(cfg, null, 0), B2 = QL.makeBatch(cfg, null, 0), B3 = QL.makeBatch(world("g_lock", null, 7), null, 0), Bf = QL.makeBatch(cfg, null, 0, "fit"), Bn = QL.makeBatch(cfg, null, 1);
    let same = true, sub = true, dFit = 0, dNew = 0;
    for (let i = 0; i < B1.R.length; i++) { if (B1.R[i] !== B2.R[i]) same = false; if (Bf.R[i] !== B1.R[i]) dFit++; if (Bn.R[i] !== B1.R[i]) dNew++; }
    for (let i = 0; i < B3.R.length; i++) if (B3.R[i] !== B1.R[i]) sub = false;
    ok(same && sub, "同一个种子生成同一批对局；第 i 局长什么样与总局数无关");
    ok(dFit === B1.R.length && dNew === B1.R.length, "给模型学的那一批、新的一批，都与当前这一批不同");
    let big = ""; try { QL.makeBatch(world("g_lock", { T: 4000 }, 6000), null, 0); } catch (e) { big = e.message; } ok(/太大了/.test(big), "对局总量超过上限时给出说得清的错误", big.slice(0, 40));
    ok(B1.T === 2000 && B1.K === 1 && QL.makeBatch(world("g_ashare", null, 3), null, 0).K === 1008 && QL.makeBatch(world("g_ashare", { M: 2, days: 50 }, 3), null, 0).T === 100, "回合数、每年步数由玩法的参数决定");
  }

  section("内置规则：界面上的代码与裁判用的参照是同一段");
  for (const st of GS) {
    const w = QL.WORLDS[st.game], S = compile(st.code), p = defs(st), N = st.game === "g_lock" ? 20 : 60;
    let a, b, err = "";
    try { a = sim(st.game, null, S, p, N, 11); b = sim(st.game, null, st.lib, p, N, 11); } catch (e) { err = e.message; }
    let eq = !err && a.res.SC.length === b.res.SC.length; if (eq) for (let i = 0; i < a.res.SC.length; i++) if (a.res.SC[i] !== b.res.SC[i]) eq = false;
    ok(eq && a.res.bad === 0 && isFinite(a.score), `${w.short} · ${st.name}：能跑，没有无效动作，与参照逐局相同`, err || `得分 ${f(a.score)}`);
    ok(!!st.explain && ["assume", "objective", "optimal", "fails", "test"].every(k => typeof st.explain[k] === "string" && st.explain[k].length > 5) && /^(proven|family|bound|heuristic)$/.test(st.explain.tier) && st.summary.length > 5, `${w.short} · ${st.name}：说明五节齐全`);
    ok((st.params || []).every(q => q.min <= q.def && q.def <= q.max && q.step > 0), `${w.short} · ${st.name}：参数默认值在范围内`);
  }
  // 每套玩法的每个预设场景都能生成、默认规则都能跑
  for (const k of QL.GAMES) {
    const w = QL.WORLDS[k], st = GS.find(s => s.id === w.defStrat); let bad = [];
    for (const sc of w.scenes) { try { const r = sim(k, sc.p, compile(st.code), defs(st), k === "g_lock" ? 8 : 24, 3); if (!isFinite(r.score) || r.res.bad) bad.push(sc.name); const rf = QL.gameRefs(r.B, { fitData: () => QL.makeData(QL.makeBatch(r.cfg, null, 0, "fit")), alt: () => null }); if (rf.some(x => x.err)) bad.push(sc.name + ":" + rf.filter(x => x.err).map(x => x.err).join("|")); } catch (e) { bad.push(sc.name + ":" + e.message); } }
    ok(bad.length === 0 && w.scenes.length >= 4, `${w.short}：${w.scenes.length} 个预设场景都能跑`, bad.join("; "));
  }

  section("① 接单与冷却");
  {
    const th = QL.lockTheory({ T: 2000, L: 15, dist: "exp" });
    near(th.cStar * Math.exp(th.cStar), 15, 1e-9, "指数分布：c* 满足 c·e^c = L（Lambert W）");
    near(th.cStar, 2.0099, 2e-4, "c* ≈ 2.010"); near(th.rhoStar, 0.1340, 1e-4, "ρ* ≈ 0.134"); near(th.rhoStar, th.cStar / 15, 1e-12, "ρ* = c*/L");
    ok(th.rhoStar / (1 / 16) > 2 && th.rhoStar / (1 / 16) < 2.3, "最优门槛是见单就接的两倍多", f(th.rhoStar * 16, 3));
    let peak = true; for (const c of [1.6, 1.9, 2.1, 2.4]) if (th.rho(c) > th.rhoStar + 1e-12) peak = false; ok(peak, "ρ(c) 在 c* 处最大");
    ok(th.dp > th.rhoStar && th.dp - th.rhoStar < 0.002, "有限期的最优略高于长期平均（终局效应 O(L/T)）", `${f(th.dp, 5)} 对 ${f(th.rhoStar, 5)}`);
    for (const [dist, extra] of [["exp", {}], ["uniform", {}], ["lognormal", { s: 1 }], ["pareto", { alpha: 2.5 }], ["normal", { sd: 1 }]]) {
      const over = Object.assign({ dist }, extra), t2 = QL.lockTheory(Object.assign(QL.worldDefaults("g_lock"), over));
      near(t2.cStar, 15 * t2.dist.epos(t2.cStar), 1e-8, `${dist}：c* = L·E[(X − c*)⁺]`);
      // E[(X − c)⁺] 和 P(X ≥ c) 的公式对不对：与直接抽样比
      const g = new QL.RNG(5, 5, 5), M = 200000; let s1 = 0, s2 = 0, sq = 0, c0 = t2.cStar; for (let i = 0; i < M; i++) { const x = t2.dist.draw(g), e = Math.max(x - c0, 0); s1 += e; sq += e * e; if (x >= c0) s2++; }
      const seE = Math.sqrt(Math.max(sq / M - (s1 / M) ** 2, 0) / M);
      ok(Math.abs(s1 / M - t2.dist.epos(c0)) < 4.5 * seE + 1e-4 && Math.abs(s2 / M - t2.dist.tail(c0)) < 0.004, `${dist}：E[(X − c)⁺] 与 P(X ≥ c) 的闭式与抽样一致`, `${f(s1 / M)} 对 ${f(t2.dist.epos(c0))}，${f(s2 / M)} 对 ${f(t2.dist.tail(c0))}`);
      const a = sim("g_lock", over, "lock_any", {}, 300), b = sim("g_lock", over, "lock_thr", { c: t2.cStar }, 300), d = sim("g_lock", over, "lock_dp", {}, 300);
      within(a.score, t2.any, a.se, 4, 0, `${dist}：见单就接 = 1/(1 + L)`);
      within(b.score, t2.rhoStar, b.se, 4, 0.001, `${dist}：固定门槛 c* 的得分 = ρ*`);
      within(d.score, t2.dp, d.se, 4, 0.0012, `${dist}：动态规划（分布从数据里估）接近理论最优`);
      const pd = pairedDiff(d.res.SC, b.res.SC); ok(pd.m > -3 * pd.se - 2e-4, `${dist}：动态规划不比固定门槛差`, `配对差 ${f(pd.m, 5)} ± ${f(pd.se, 5)}`);
      const refs = QL.gameRefs(a.B, { fitData: () => QL.makeData(QL.makeBatch(a.cfg, null, 0, "fit")) }), pr = refs.find(r => r.id === "prophet");
      let dom = true; for (let i = 0; i < pr.SC.length; i++) if (pr.SC[i] < d.res.SC[i] - 1e-12 || pr.SC[i] < b.res.SC[i] - 1e-12) dom = false; ok(dom, `${dist}：事后诸葛亮逐局都不低于任何规则`);
    }
    const sa = sim("g_lock", null, "lock_sa", { c0: 1, a: 1, b: 20 }, 300), b0 = sim("g_lock", null, "lock_thr", { c: th.cStar }, 300);
    ok(sa.score > 0.97 * b0.score && sa.score < b0.score + 3 * b0.se, "随机逼近：不知道分布，也能做到最优门槛的 97% 以上", `${f(sa.score)} 对 ${f(b0.score)}`);
    // 裁判：接了之后的 L 回合确实接不了
    const greedy = sim("g_lock", { L: 15, T: 200 }, "lock_any", {}, 20, 3, { detail: 0 }); let okLock = true, last = -99; for (let t = 0; t < 200; t++) { if (greedy.res.det.m[t] === 1) { if (t - last <= 15) okLock = false; last = t; } }
    ok(okLock && greedy.aux[0] === Math.ceil(200 / 16), "裁判：两次接单之间至少隔 L 回合", "接了 " + greedy.aux[0] + " 单");
    near(sim("g_lock", { L: 0 }, "lock_any", {}, 100).score, 1, 0.01, "不锁（L = 0）时见单就接拿到全部报价，均值 1");
  }

  section("② 秘书问题");
  {
    for (const n of [5, 10, 37, 100, 1000]) { const cl = QL.secClassic(n); let m = 0; for (;;) { let s = 0; for (let j = m + 1; j <= n - 1; j++) s += 1 / j; if (s <= 1) break; m++; } ok(cl.m === m, `n = ${n}：最优的观察人数 = 使 Σ_{j=m+1}^{n−1} 1/j ≤ 1 的最小 m`, `${cl.m}，P = ${f(cl.value, 5)}`); }
    const cl = QL.secClassic(100); ok(cl.m === 37, "n = 100：先看 37 人"); near(cl.value, 0.37104, 1e-5, "n = 100：成功概率 0.3710"); near(QL.secClassic(100000).value, 1 / Math.E, 1e-4, "n → ∞：1/e");
    const N = 30000;
    const a = sim("g_sec", { goal: "best", info: "rank" }, "sec_cut", { m: 37 }, N); within(a.score, cl.value, a.se, 4, 0, "先看 37 人再选：模拟与 P(m) 一致");
    within(a.aux[2], 37 / 99, 0.003, 4, 0, "拖到最后一个人的概率 = m/(n − 1)");
    for (const m of [10, 60]) { const r = sim("g_sec", null, "sec_cut", { m }, N); within(r.score, cl.P[m], r.se, 4, 0, `先看 ${m} 人：模拟与 P(m) 一致`); }
    const fst = sim("g_sec", null, "sec_first", {}, N); within(fst.score, 0.01, fst.se, 4, 0, "第一个就要：1/n");
    const gm = sim("g_sec", { goal: "best", info: "full" }, "sec_gm", {}, N); ok(gm.score > 0.57 && gm.score < 0.595, "看得到分数：Gilbert–Mosteller 约 0.58", f(gm.score));
    near(gm.model.b[1], 0.5, 1e-9, "门槛 b₁ = 1/2"); near(gm.model.b[2], 0.6899, 1e-4, "门槛 b₂ ≈ 0.690"); near((1 - gm.model.b[99]) * 99, 0.8043, 0.01, "b_m ≈ 1 − 0.804/m");
    const gmWrong = sim("g_sec", { goal: "best", info: "rank" }, "sec_gm", {}, 8000); ok(gmWrong.score < 0.2, "分布未知时照搬分数门槛：成绩大跌", f(gmWrong.score));
    const rk = QL.secRankDP(100); near(rk.value, 3.6032, 1e-3, "名次门槛表：n = 100 的最优期望名次 3.603"); near(QL.secRankDP(10).value, 2.5579, 1e-3, "n = 10：2.558");
    let prod = 1; for (let j = 1; j <= 2e6; j++) prod *= Math.pow((j + 2) / j, 1 / (j + 1)); near(prod, 3.8695, 2e-3, "极限 ∏((j+2)/j)^(1/(j+1)) ≈ 3.8695"); ok(QL.secRankDP(1000).value < prod && QL.secRankDP(1000).value > rk.value, "最优期望名次随 n 递增并趋于这个极限", f(QL.secRankDP(1000).value));
    const rd = sim("g_sec", { goal: "rank", info: "rank" }, "sec_rank", {}, N), seRank = rd.g.sd * 99 / Math.sqrt(N); within(rd.aux[1], rk.value, seRank, 4, 0, "名次门槛表：模拟的平均名次与倒推值一致");
    const rc = sim("g_sec", { goal: "rank", info: "rank" }, "sec_cut", { m: 37 }, N); ok(rc.aux[1] > 18 && rc.aux[1] < 22, "目标换成名次：37% 规则的平均名次约 n/5", f(rc.aux[1], 2));
    const rc10 = sim("g_sec", { goal: "rank", info: "rank" }, "sec_cut", { m: 10 }, N); ok(rc10.aux[1] < rc.aux[1] / 1.8, "名次目标下，同一条规则的最优观察人数小得多", `m = 10 时平均名次 ${f(rc10.aux[1], 2)}`);
    const mem = sim("g_sec", { goal: "rank", info: "full" }, "sec_mem", { c: 2 }, N); ok(Math.abs(mem.aux[1] - 2.24) < 0.06 && mem.aux[1] < rk.value, "看得到分数：只看分数的门槛（c = 2）平均名次约 2.24，好于只看名次的最优", f(mem.aux[1], 3));
    // 裁判：只能选一次；相对名次、绝对名次算得对
    const B = QL.makeBatch(world("g_sec", { n: 30 }, 50), null, 0); let rankOk = true;
    for (let n = 0; n < 50; n++) for (let t = 0; t < 30; t++) { let rel = 1, abs = 1; for (let j = 0; j < 30; j++) { if (B.R[n * 30 + j] > B.R[n * 30 + t]) { abs++; if (j < t) rel++; } } if (rel !== B.H.rel[n * 30 + t] || abs !== B.H.abs[n * 30 + t]) rankOk = false; }
    ok(rankOk, "裁判：相对名次和绝对名次与逐个比较的结果一致");
    const never = sim("g_sec", { n: 30 }, { decide: () => 0 }, {}, 200); ok(never.aux[0] === 30 && never.aux[2] === 1, "一直放过：只能要最后一个人");
  }

  section("③ 偏硬币下注");
  {
    const th = QL.coinTheory({ p: 0.6, start: 25, T: 300 }); near(th.f, 0.2, 1e-12, "Kelly 比例 2p − 1 = 0.2"); near(th.g, 0.020136, 1e-6, "每局增长率 0.0201"); ok(Math.abs(th.median - 10504) < 2 && Math.abs(th.mean / 3220637 - 1) < 1e-4, "不封顶押 300 局：中位数约 10,500，期望约 322 万", `${f(th.median, 0)}，${f(th.mean, 0)}`);
    { const g = x => 0.6 * Math.log(1 + x) + 0.4 * Math.log(1 - x); let lo = 0.2, hi = 0.99; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; } near(lo, 0.389, 2e-3, "增长率在 f ≈ 0.39 处回到 0"); }
    const N = 20000, k = sim("g_coin", null, "coin_frac", { f: 0.2 }, N), k1 = sim("g_coin", null, "coin_frac", { f: 0.1 }, N), dp = sim("g_coin", null, "coin_dp", { grid: 250 }, N), all = sim("g_coin", null, "coin_frac", { f: 1 }, N), none = sim("g_coin", null, "coin_none", {}, 200), mart = sim("g_coin", null, "coin_mart", { base: 1 }, N), stk = sim("g_coin", null, "coin_streak", { k: 3, f: 0.2 }, N);
    ok(none.score === 25 && none.se === 0, "一分不押：原样带走 25");
    ok(k.score > 230 && k.score < 242 && k.aux[1] > 0.91 && k.aux[1] < 0.96 && k1.score > 236 && k1.score < 245 && k1.aux[1] > 0.92, "固定押 10%–20%：九成以上封顶，期望接近 240", `20%：${f(k.score, 1)}（封顶 ${f(k.aux[1], 3)}）；10%：${f(k1.score, 1)}（封顶 ${f(k1.aux[1], 3)}）`);
    const pd = pairedDiff(dp.res.SC, k.res.SC); ok(pd.m > 3 * pd.se && dp.score > 244 && dp.score < 248.5, "动态规划：期望约 246，显著高于 Kelly", `${f(dp.score, 2)}；配对差 ${f(pd.m, 2)} ± ${f(pd.se, 2)}`);
    const v0 = +/期望到手 ([\d.]+)/.exec(dp.model.note)[1]; within(dp.score, v0, dp.se, 4, 0, "动态规划：模拟与倒推出的期望值一致");
    ok(+/第一次该押 ([\d.]+)/.exec(dp.model.note)[1] < 5, "动态规划开局押得比 Kelly 小", dp.model.note);
    within(all.score, Math.pow(0.6, 4) * 250, all.se, 4, 0, "每局全押：只有连赢 4 把才封顶，期望 0.6⁴ × 250");
    ok(mart.aux[0] > 0.28 && mart.aux[0] < 0.39 && k.aux[0] === 0, "输了加倍：约三分之一的局输光；固定比例不会输光", f(mart.aux[0], 3));
    ok(stk.score < k.score - 30 && stk.aux[2] > 0.99, "\"该出反面了\"：押反面把优势送了回去", `${f(stk.score, 1)} 对 ${f(k.score, 1)}`);
    const free = sim("g_coin", { cap: 0 }, "coin_frac", { f: 0.2 }, N), W = Array.from(free.res.SC).sort((a, b) => a - b); near(W[N / 2] / th.median, 1, 0.08, "不封顶的 Kelly：模拟的中位数与 25·e^(300g) 一致");
    const freeDp = sim("g_coin", { cap: 0 }, "coin_dp", { grid: 250 }, 2000); ok(freeDp.model.all === true && freeDp.aux[0] > 0.99, "不封顶时最大化期望的做法是全押：几乎必然输光", f(freeDp.aux[0], 3));
    // 裁判：封顶后停止、押注不超过资金、不足 1 美分不算
    const big = sim("g_coin", null, { decide: () => 5 }, {}, 500, 2, { detail: 0 }); ok(Math.max(...big.res.SC) === 250 && Math.max(...Array.from(big.res.det.a).filter(x => x === x)) === 1, "裁判：比例超过 1 按全押算，到手不超过封顶");
    const tiny = sim("g_coin", null, { decide: s => 0.001 / s.wealth }, {}, 100); ok(tiny.score === 25, "裁判：不足 1 美分的赌注不算数");
  }

  section("④ 翻倍或出局");
  {
    near(QL.boldQ(0.5, 18 / 38), 18 / 38, 1e-12, "大胆下注：x = ½ 时 Q = p");
    let fe = true; for (const x of [0.1, 0.3, 0.45, 0.6, 0.83]) { const p = 0.45, lhs = QL.boldQ(x, p), rhs = x <= 0.5 ? p * QL.boldQ(2 * x, p) : p + (1 - p) * QL.boldQ(2 * x - 1, p); if (Math.abs(lhs - rhs) > 1e-12) fe = false; } ok(fe, "Q 满足函数方程");
    let mono = true, fair = true; for (let i = 1; i < 200; i++) { if (QL.boldQ(i / 200, 0.45) <= QL.boldQ((i - 1) / 200, 0.45)) mono = false; if (Math.abs(QL.boldQ(i / 200, 0.5) - i / 200) > 1e-12) fair = false; } ok(mono && fair, "Q 严格递增；公平赌局时 Q(x) = x");
    near(QL.timidQ(0.5, 0.05, 18 / 38), 0.2585, 2e-4, "小注 5%：25.9%"); near(QL.timidQ(0.5, 0.01, 18 / 38), 0.00513, 2e-5, "小注 1%：0.5%"); near(QL.timidQ(0.3, 0.1, 0.5), 0.3, 1e-12, "公平赌局的赌徒破产公式：i/N");
    const N = 10000;
    for (const [p, x0] of [[18 / 38, 0.5], [18 / 38, 0.3], [0.4, 0.5], [0.5, 0.3]]) {
      const over = { p, x0, T: 1000 }, b = sim("g_bold", over, "bold_all", {}, N), t5 = sim("g_bold", over, "bold_timid", { stake: 0.05 }, N), h = sim("g_bold", over, "bold_frac", { f: 0.5 }, N);
      within(b.score, QL.boldQ(x0, p), b.se, 4, 0, `p = ${f(p, 3)}，x₀ = ${x0}：大胆下注的成功率 = Q(x₀)`);
      within(t5.score, QL.timidQ(x0, 0.05, p), t5.se, 4, 0.002, `p = ${f(p, 3)}，x₀ = ${x0}：小注 5% 与赌徒破产公式一致`);
      if (p < 0.5) ok(b.score > t5.score + 4 * t5.se && b.score > h.score, `p = ${f(p, 3)}：不利赌局里大胆下注胜过小注和固定比例`, `${f(b.score, 3)} / ${f(t5.score, 3)} / ${f(h.score, 3)}`);
      else ok(Math.abs(b.score - t5.score) < 5 * b.se, "公平赌局：打法不影响成功率", `${f(b.score, 3)} / ${f(t5.score, 3)}`);
    }
    const fav = sim("g_bold", { p: 0.55, T: 2500 }, "bold_timid", { stake: 0.01 }, 2000), favB = sim("g_bold", { p: 0.55 }, "bold_all", {}, 4000); ok(fav.score > 0.99 && favB.score < 0.6, "有利赌局反过来：小注几乎必胜，大胆下注只有 p", `${f(fav.score, 3)} 对 ${f(favB.score, 3)}`);
    const one = sim("g_bold", null, "bold_all", {}, 2000); ok(one.aux[0] === 1, "x₀ = ½ 时大胆下注一把定输赢");
    const over = sim("g_bold", { x0: 0.8 }, { decide: () => 1 }, {}, 3000, 2, { fan: true }); ok(Math.max(...over.res.WT) <= 1 / 0.8 + 1e-9, "裁判：赌注不超过够到目标所需的数额");
  }

  section("⑤ 多臂老虎机");
  {
    const N = 3000, r = {}; for (const [k, lib, p] of [["rand", "ban_rand", {}], ["greedy", "ban_greedy", {}], ["eps", "ban_eps", { eps: 0.1 }], ["etc", "ban_etc", { m: 10 }], ["ucb", "ban_ucb", { c: 2 }], ["ucb05", "ban_ucb", { c: 0.5 }], ["ts", "ban_ts", {}]]) r[k] = sim("g_bandit", null, lib, p, N);
    within(r.rand.score, 0.5, r.rand.se, 4, 0, "随便拉：各台中奖率的平均 0.5");
    const refs = QL.gameRefs(r.rand.B, { fitData: () => null }), pro = refs.find(x => x.id === "prophet"), pm = pro.SC.reduce((a, b) => a + b, 0) / N; near(pm, 5 / 6, 0.012, "知道中奖率的上界：E[最大值] = K/(K+1)");
    ok(r.ts.score > r.ucb.score && r.ucb.score > r.rand.score + 0.15 && r.ts.aux[0] < r.greedy.aux[0] && r.ts.aux[0] < r.ucb05.aux[0] * 1.05, "Thompson 抽样的遗憾在内置规则里最小", Object.keys(r).map(k => `${k} ${f(r[k].aux[0], 1)}`).join("，"));
    ok(r.ucb05.score > r.ucb.score, "500 回合时，c = 2 的标准 UCB1 探索过头，不如 c = 0.5", `${f(r.ucb05.score, 3)} 对 ${f(r.ucb.score, 3)}`);
    let above = 0; for (const k of Object.keys(r)) { const d = pairedDiff(pro.SC, r[k].res.SC); if (d.m > 0) above++; } ok(above === 7, "所有规则的平均得分都低于上界");
    const gL = sim("g_bandit", { T: 5000 }, "ban_greedy", {}, 600), tL = sim("g_bandit", { T: 5000 }, "ban_ts", {}, 600), g5 = sim("g_bandit", null, "ban_greedy", {}, 600), t5 = sim("g_bandit", null, "ban_ts", {}, 600);
    ok(gL.aux[0] / g5.aux[0] > 5 && tL.aux[0] / t5.aux[0] < 2.5, "回合数从 500 加到 5000：贪心的遗憾线性增长，Thompson 的只按对数增长", `贪心 ${f(g5.aux[0], 1)} → ${f(gL.aux[0], 1)}；Thompson ${f(t5.aux[0], 1)} → ${f(tL.aux[0], 1)}`);
    // 遗憾 = T·最好的中奖率 − Σ 所拉机器的中奖率；同一局里各规则面对的是同一组机器
    const d1 = sim("g_bandit", null, "ban_ts", {}, 40, 5, { detail: 3 }), d2 = sim("g_bandit", null, "ban_ts", {}, 40, 5, { detail: 3 }); let rep = true; for (let t = 0; t < 500; t++) if (d1.res.det.a[t] !== d2.res.det.a[t]) rep = false; ok(rep, "用到随机数的规则，结果可以复现");
    const one = QL.runGame(QL.sliceGame(d1.B, 3), LIB.ban_ts, {}, null, { detail: 0 }); let sameSlice = one.SC[0] === d1.res.SC[3]; for (let t = 0; t < 500; t++) if (one.det.a[t] !== d1.res.det.a[t]) sameSlice = false; ok(sameSlice, "单局明细：切出一局重放，与整批里的那一局完全相同（随机数流按局号取）");
    // 锁
    const lk = sim("g_bandit", { D: 2 }, "ban_ucb", { c: 0.5 }, 300, 2, { detail: 0 }); let consec = false; for (let t = 1; t < 500; t++) { const a = lk.res.det.a; if (a[t] === a[t - 1] || (t > 1 && a[t] === a[t - 2])) consec = true; } ok(!consec && lk.aux[2] === 0, "锁 2 回合：同一台机器至少隔两回合才再拉；内置规则会避开被锁的机器");
    const lr = sim("g_bandit", { D: 2 }, { decide: () => 0 }, {}, 200); near(lr.aux[2], 1 - 167 / 500, 1e-9, "锁 2 回合时死拉同一台：三回合里有两回合作废");
    const pr2 = QL.gameRefs(lk.B, { fitData: () => null }).find(x => x.id === "prophet"); let okP = true; for (let n = 0; n < 5; n++) { const mu = Array.from(lk.B.H.mu.subarray(n * 5, n * 5 + 5)).sort((a, b) => b - a); if (Math.abs(pr2.SC[n] - (mu[0] + mu[1] + mu[2]) / 3) > 1e-12) okP = false; } ok(okP, "有锁时的上界：轮流拉最好的 D + 1 台");
    const bad = sim("g_bandit", null, { decide: () => 99 }, {}, 50); ok(bad.score === 0 && bad.aux[2] === 1, "裁判：无效的机器编号，回合作废");
  }

  section("⑥ 报童问题");
  {
    for (const over of [{}, { cost: 9 }, { dist: "normal" }, { dist: "lognormal" }, { dist: "lognormal", cost: 6, salvage: 2 }]) {
      const p0 = Object.assign(QL.worldDefaults("g_news"), over), th = QL.newsTheory(p0), tag = JSON.stringify(over);
      let best = -Infinity, bq = 0; for (let q = 0; q <= 400; q += 0.25) { const v = th.profit(q); if (v > best) { best = v; bq = q; } }
      ok(Math.abs(bq - th.qStar) < 0.6 && Math.abs(best - th.best) < 0.05, `${tag}：期望利润 π(q) 的峰值正在临界分位处`, `q* = ${f(th.qStar, 2)}，网格最优 ${f(bq, 2)}`);
      const N = 3000, a = sim("g_news", over, "news_fix", { q: th.qStar }, N), c = sim("g_news", over, "news_crit", {}, N), m = sim("g_news", over, "news_fix", { q: th.dist.mean }, N);
      within(a.score, th.best, a.se, 4, 0.5, `${tag}：订 q* 的模拟利润 = π(q*)`); within(m.score, th.atMean, m.se, 4, 0.5, `${tag}：订均值的模拟利润 = π(均值)`);
      let same = true; for (let i = 0; i < N; i++) if (a.res.SC[i] !== c.res.SC[i]) same = false; ok(same, `${tag}："临界分位"规则订的就是 q*`);
      within(a.aux[1], 1 - th.cr, 0.003, 4, 0, `${tag}：缺货的天数比例 = 1 − 临界分位`);
    }
    const th = QL.newsTheory(QL.worldDefaults("g_news")); near(th.cr, 0.75, 1e-12, "默认：临界分位 0.75"); near(th.qStar, 225.25, 1e-9, "默认：q* ≈ 225"); near(QL.newsTheory(Object.assign(QL.worldDefaults("g_news"), { cost: 9 })).qStar, 75.75, 1e-9, "进价 9：q* ≈ 76");
    const N = 3000, mean = sim("g_news", null, "news_mean", {}, N), chase = sim("g_news", null, "news_chase", { q0: 150, theta: 0.5 }, N), saa = sim("g_news", null, "news_saa", { q0: 150 }, N), crit = sim("g_news", null, "news_crit", {}, N), ch0 = sim("g_news", null, "news_chase", { q0: 150, theta: 0 }, N);
    ok(chase.score < mean.score && mean.score < saa.score && saa.score < crit.score, "追着上期走 < 订平均数 < 从历史里学 < 临界分位", [chase, mean, saa, crit].map(x => f(x.score, 1)).join(" < "));
    ok(ch0.score > chase.score + 5, "追得越多越差：θ = 0 好于 θ = 0.5", `${f(ch0.score, 1)} 对 ${f(chase.score, 1)}`);
    const saaL = sim("g_news", { T: 1000 }, "news_saa", { q0: 150 }, 600); ok(th.best - saaL.score < (th.best - saa.score) / 3, "天数越多，从历史里学的越接近最优", `100 天差 ${f(th.best - saa.score, 1)}，1000 天差 ${f(th.best - saaL.score, 1)}`);
    const marks = QL.WORLDS.g_news.theory(QL.worldDefaults("g_news")).marks, hm = marks.find(m => m.kind === "human"); ok(hm && Math.abs(hm.value - th.profit(176.68)) < 1e-9 && hm.value < th.best, "实验对照：受试者平均订 177，期望利润低于最优", hm ? f(hm.value, 1) + " 对 " + f(th.best, 1) : "");
    const neg = sim("g_news", null, { decide: () => -5 }, {}, 50); ok(neg.score === 0, "裁判：订货量不能为负");
  }

  section("⑦ 赢家诅咒");
  {
    const N = 4000;
    for (const [m, b] of [[1.5, 30], [1.5, 60], [1.5, 100], [2.5, 60], [2.5, 100], [1.5, 130]]) { const r = sim("g_curse", { m }, "curse_fix", { b }, N); within(r.score, QL.curseProfit(b, m), r.se, 4, 0, `m = ${m}，出价 ${b}：模拟盈亏 = 理论值`); }
    near(QL.curseProfit(60, 1.5), -9, 1e-12, "m = 1.5 时出价 60：每次平均亏 9"); ok(QL.curseProfit(100, 2.5) === 25 && QL.curseProfit(50, 2) === 0, "m = 2.5 时出价 100 赚 25；m = 2 时恰好不赚不亏");
    const r60 = sim("g_curse", null, "curse_fix", { b: 60 }, N); within(r60.aux[0], 0.6, 0.002, 4, 0, "出价 60：六成成交"); within(r60.aux[1], -15, 0.05, 4, 0.2, "成交时平均每笔亏 15（出价的四分之一）");
    const ln = sim("g_curse", null, "curse_learn", { eps: 0.1, opt: 5 }, N), lg = sim("g_curse", { m: 2.5 }, "curse_learn", { eps: 0.1, opt: 5 }, N); ok(ln.score < 0 && ln.score > -4 && lg.score > 10, "从盈亏里学：m = 1.5 时小亏（试探的代价），m = 2.5 时学到出高价", `${f(ln.score, 2)}，${f(lg.score, 2)}`);
    const res = {}; for (const noise of [5, 15, 40]) { const over = { info: "sig", noise }, by = sim("g_curse", over, "curse_bayes", {}, N), s1 = sim("g_curse", over, "curse_shade", { k: 1 }, N), s8 = sim("g_curse", over, "curse_shade", { k: 0.8 }, N); res[noise] = by; const d1 = pairedDiff(by.res.SC, s1.res.SC), d8 = pairedDiff(by.res.SC, s8.res.SC); ok(d1.m > 2 * d1.se && d8.m > 2 * d8.se && by.score > 0, `噪声 ${noise}：贝叶斯出价胜过固定折扣`, `${f(by.score, 2)} 对 ${f(s1.score, 2)}、${f(s8.score, 2)}`); }
    ok(res[5].score > res[15].score && res[15].score > res[40].score && res[5].score < 25 && Math.abs(res[5].score - 17) < 1.5 && Math.abs(res[40].score - 2.2) < 0.8, "信号越准，利润越高（噪声 5 时约 17，40 时约 2），都低于信息对称时的 25", [5, 15, 40].map(k => f(res[k].score, 2)).join(" > "));
    const tab = res[15].model, at = s => tab.tab[Math.round((s - tab.lo) / (tab.hi - tab.lo) * (tab.tab.length - 1))]; ok(at(30) === 0 && at(70) > 60, "噪声 15：信号 30 时不出价，信号 70 时出价", `${at(30)}，${f(at(70), 1)}`);
    // 一阶条件：(m − 1)·b·f(b|s) = F(b|s)
    { const sd = 15, i0 = Math.round((60 - tab.lo) / (tab.hi - tab.lo) * (tab.tab.length - 1)), s0 = tab.lo + (tab.hi - tab.lo) * i0 / (tab.tab.length - 1), b = tab.tab[i0], W = v => Math.exp(-0.5 * ((s0 - v) / sd) ** 2); let F = 0; const n = 4000; for (let i = 0; i < n; i++) { const v = (i + 0.5) * b / n; F += W(v) * b / n; } near(0.5 * b * W(b) / F, 1, 0.02, "贝叶斯出价满足一阶条件 (m − 1)·b·f(b|s) = F(b|s)"); }
    const noSig = sim("g_curse", null, "curse_shade", { k: 1 }, 200); ok(noSig.score === 0, "没有信号时 s.x 是 NaN，按估值出价的规则不出价");
  }

  section("⑧ 自营考核");
  {
    for (const fv of [1, 2, 4, 8]) { const r = sim("g_prop", { days: fv === 1 ? 1500 : 600, dayLoss: 30, cost: 0, lev: 100 }, "prop_fix", { f: fv }, 4000); within(r.score, QL.propPass(fv, 0.1, 0.2, 0.1, 0.1), r.se, 3.5, 0.008, `不设期限、没有日线，固定仓位 ${fv} 倍：通过率与公式一致`); }
    near(QL.propPass(5, 0.1, 0.2, 0.1, 0.1), Math.log(1 / 0.9) / (Math.log(1.1) + Math.log(1 / 0.9)), 1e-9, "θ = 0（f = 2μ/σ²）时公式取对数形式的极限"); near(QL.propPass(5, 0.1, 0.2, 0.1, 0.1), QL.propPass(5.00001, 0.1, 0.2, 0.1, 0.1), 1e-6, "公式在 θ = 0 附近连续");
    near(QL.propPass(3, 0, 0.2, 0.1, 0.1), 0.5, 1e-12, "μ = 0 时公式给出的正是上限 b/(a + b)"); ok(QL.propPass(0.5, 0.1, 0.2, 0.1, 0.1) > QL.propPass(2, 0.1, 0.2, 0.1, 0.1) && QL.propPass(0.05, 0.1, 0.2, 0.1, 0.1) > 0.99, "μ > 0、不设期限时杠杆越低通过率越高，趋于 1");
    const N = 8000, z = {}; for (const fv of [0.5, 1, 2, 4, 8, 10]) z[fv] = sim("g_prop", { mu: 0, cost: 0 }, "prop_fix", { f: fv }, N);
    ok(Object.keys(z).every(k => z[k].score <= 0.5 + 3 * z[k].se), "没有优势时，任何杠杆的通过率都不超过 亏损线/(目标 + 亏损线) = ½", Object.keys(z).map(k => `f=${k}: ${f(z[k].score, 3)}`).join("，"));
    within(z[10].score, 1 / 3, z[10].se, 3.5, 0.012, "高杠杆时由单日亏损线说了算：通过率趋于 d/(a + d) = ⅓");
    const nd = sim("g_prop", { mu: 0, cost: 0, dayLoss: 10 }, "prop_fix", { f: 10 }, N); within(nd.score, 0.5, nd.se, 3.5, 0.012, "去掉单日亏损线：高杠杆的通过率趋于 ½");
    const d = {}; for (const fv of [0.5, 2, 10]) d[fv] = sim("g_prop", null, "prop_fix", { f: fv }, N);
    ok(d[2].score > d[0.5].score + 0.2 && d[2].score > d[10].score + 4 * d[10].se, "默认设定：通过率在中等杠杆处有一个峰（期限逼着加杠杆，日线不让加太多）", `0.5 倍 ${f(d[0.5].score, 3)}，2 倍 ${f(d[2].score, 3)}，10 倍 ${f(d[10].score, 3)}`);
    ok(d[0.5].aux[3] > 0.95 && d[10].aux[2] > 0.5, "低杠杆死于到期没达标，高杠杆死于单日亏损线", `${f(d[0.5].aux[3], 3)}，${f(d[10].aux[2], 3)}`);
    near(d[2].score + d[2].aux[1] + d[2].aux[2] + d[2].aux[3], 1, 1e-9, "四种结局的比例加起来是 1");
    // 裁判：碰线时按线上的净值离场；通过后不再交易
    const one = sim("g_prop", null, "prop_fix", { f: 6 }, 3000, 4, { fan: true }); let lo = Infinity, hi = -Infinity; for (const w of one.res.WT) { if (w < lo) lo = w; if (w > hi) hi = w; } ok(lo >= 0.9 - 1e-9 && hi <= 1.1 + 1e-9, "裁判：净值不会越过目标和总亏损线", `${f(lo)} – ${f(hi)}`);
    const capd = sim("g_prop", { lev: 3 }, "prop_fix", { f: 50 }, 2000), at3 = sim("g_prop", { lev: 3 }, "prop_fix", { f: 3 }, 2000); ok(capd.score === at3.score, "裁判：仓位超过杠杆上限时按上限算");
    for (const id of ["const", "ma", "cppi", "voltarget"]) { const st = STRATS.find(x => x.id === id), r = sim("g_prop", null, compile(st.code), defs(st), 300); ok(isFinite(r.score) && r.res.bad / r.res.steps < 0.9, `价格世界的规则"${st.name}"在这里也能跑`, `通过率 ${f(r.score, 3)}`); }
  }

  section("⑨ A 股交易规则");
  {
    const B = QL.makeBatch(world("g_ashare", null, 200), null, 0), M = 4; let beyond = 0, up = 0, dn = 0;
    for (let n = 0; n < B.N; n++) for (let dd = 0; dd < B.T / M; dd++) { const c0 = B.L[n * (B.T + 1) + dd * M]; for (let k = 1; k <= M; k++) { const i = n * (B.T + 1) + dd * M + k, q = B.L[i] / c0 - 1; if (Math.abs(q) > 0.1 + 1e-9) beyond++; const st = B.H.lim[i]; if (st > 0) { up++; if (Math.abs(q - 0.1) > 1e-9) beyond++; } else if (st < 0) { dn++; if (Math.abs(q + 0.1) > 1e-9) beyond++; } } }
    ok(beyond === 0 && up > 100 && dn > 100, "每天的涨跌幅都在 ±10% 之内；封板时价格正好在板上", `涨停 ${up} 个时段，跌停 ${dn} 个`);
    const B0 = QL.makeBatch(world("g_ashare", { limit: "0" }, 50), null, 0); ok(!Array.prototype.some.call(B0.H.lim, v => v !== 0), "不设涨跌停时没有封板");
    // 封板时的"真实价格"在板外：涨停之后的下一个时段平均还在涨
    { let s = 0, c = 0, s2 = 0, c2 = 0; for (let n = 0; n < B.N; n++) for (let t = 1; t < B.T; t++) { const st = B.H.lim[n * (B.T + 1) + t], r = B.R[n * B.T + t]; if (st > 0) { s += r; c++; } else if (st < 0) { s2 += r; c2++; } } ok(s / c > 0.01 && s2 / c2 < -0.01, "涨停之后下一个时段平均继续涨，跌停之后继续跌", `${f(s / c, 4)}，${f(s2 / c2, 4)}`); }
    const hold = sim("g_ashare", null, "ash_hold", {}, 200, 7, { detail: 0 }), fee = 2.5e-4 + 1e-5; let exact = true; for (let n = 0; n < 200; n++) { const want = B.L[n * (B.T + 1) + B.T] / B.L[n * (B.T + 1)] / (1 + fee); if (Math.abs(hold.res.WT[n] / want - 1) > 1e-9) exact = false; } ok(exact && hold.aux[2] === 0, "买入持有：终值 = 价格涨幅 ÷ (1 + 买入费率)");
    // T+1：当天买的当天卖不掉
    const inOut = { decide: s => (s.slot === 0 ? 1 : 0) }, t1 = sim("g_ashare", { pj: 0 }, inOut, {}, 60, 3, { detail: 0 }), t0 = sim("g_ashare", { pj: 0, t1: "off" }, inOut, {}, 60, 3, { detail: 0 });
    ok(t1.res.det.a[1] > 0.99 && t1.res.det.m[1] === 1 && t1.aux[2] > 0, "T+1：开盘买进、下一个时段想卖，被挡住，仓位还在", `被挡 ${f(t1.aux[2], 0)} 次`);
    ok(t0.res.det.a[1] === 0 && t0.aux[2] === 0, "T+0：同样的操作卖得掉");
    ok(sim("g_ashare", { M: 1 }, "ash_rev", { base: 0.5, k: 0.5 }, 100).aux[2] === 0, "每天只有一个时段时 T+1 不起作用");
    // 涨停买不进、跌停卖不出
    const chase = { decide: s => (s.lim === 1 ? 1 : 0) }, ch = sim("g_ashare", null, chase, {}, 200); ok(ch.sum.exposure === 0 && ch.aux[0] > 1, "只在涨停时下买单：一股也买不到", `被挡 ${f(ch.aux[0], 1)} 次`);
    const dump = { decide: s => (s.lim === -1 ? 0 : 1) }, du = sim("g_ashare", null, dump, {}, 200), pdH = pairedDiff(du.res.SC, sim("g_ashare", null, "ash_hold", {}, 200).res.SC); ok(du.aux[1] > 1 && pdH.m <= 1e-9, "跌停时想卖：卖不出，躲不掉后面的下跌", `被挡 ${f(du.aux[1], 1)} 次；相对买入持有 ${f(pdH.m, 4)}`);
    // 仓位约束、费用
    const wild = sim("g_ashare", null, { decide: s => (s.t % 2 ? 5 : -3) }, {}, 50, 2, { detail: 0 }); let rng = true; for (const a of wild.res.det.a) if (a < -1e-12 || a > 1 + 1e-12) rng = false; ok(rng, "裁判：不能做空，不能加杠杆");
    const N = 400, on = sim("g_ashare", null, "ash_rev", { base: 0.5, k: 0.3 }, N), off = sim("g_ashare", { t1: "off", limit: "0" }, "ash_rev", { base: 0.5, k: 0.3 }, N), noT1 = sim("g_ashare", { limit: "0" }, "ash_rev", { base: 0.5, k: 0.3 }, N), noStamp = sim("g_ashare", { stamp: 0 }, "ash_rev", { base: 0.5, k: 0.3 }, N), flat = sim("g_ashare", { phi: 0 }, "ash_rev", { base: 0.5, k: 0.3 }, N);
    const dRule = pairedDiff(off.res.SC, on.res.SC), dT1 = pairedDiff(off.res.SC, noT1.res.SC), dSt = pairedDiff(noStamp.res.SC, on.res.SC);
    ok(dRule.m > 0.05 && dRule.m > 4 * dRule.se, "做 T：去掉 T+1 和涨跌停，每年多赚不止 5 个百分点", `${f(dRule.m * 100, 1)}% ± ${f(dRule.se * 100, 1)}%`);
    ok(dT1.m > 0.01 && dT1.m > 3 * dT1.se, "其中 T+1 单独的代价也显著", `${f(dT1.m * 100, 1)}% ± ${f(dT1.se * 100, 1)}%`);
    ok(Math.abs(dSt.m - on.sum.turnover / 2 * 5e-4) < 0.012 && dSt.m > 0.04, "印花税的代价 ≈ 卖出的换手 × 万分之五（默认参数下每年六七个百分点）", `${f(dSt.m * 100, 2)}% 对 ${f(on.sum.turnover / 2 * 0.05, 2)}%；换手 ${f(on.sum.turnover, 0)} 倍`);
    ok(flat.score < -0.1 && off.score > 0.08, "没有日内反转时做 T 只是在付费；有反转且没有规则时它是赚的", `${f(flat.score * 100, 1)}%，${f(off.score * 100, 1)}%`);
    near(on.sum.growth, on.score, 1e-9, "得分就是长期增长率（与三种口径里的第一种是同一个数）");
    const bd = sim("g_ashare", null, "ash_board", { th: 0.05, h: 2 }, N); ok(Math.abs(bd.score) < 0.03 && bd.aux[0] > 3, "追涨停：买不到板上的，买得到的已经没有后劲", `增长率 ${f(bd.score * 100, 2)}% ± ${f(bd.se * 100, 2)}%，被挡 ${f(bd.aux[0], 1)} 次`);
    const hOn = sim("g_ashare", null, "ash_hold", {}, N), hOff = sim("g_ashare", { t1: "off", limit: "0" }, "ash_hold", {}, N), dh = pairedDiff(hOn.res.SC, hOff.res.SC); ok(Math.abs(dh.m) < 0.02, "买入持有几乎不受规则影响", `${f(dh.m * 100, 2)}%`);
    for (const id of ["ma", "mom", "meanrev", "stop", "voltarget", "kellyest"]) { const st = STRATS.find(x => x.id === id), r = sim("g_ashare", null, compile(st.code), defs(st), 60); ok(isFinite(r.score), `价格世界的规则"${st.name}"在这里也能跑`, `增长率 ${f(r.score * 100, 1)}%`); }
  }

  section("⑩ 大单拆分执行");
  {
    const p0 = QL.worldDefaults("g_exec"), th = QL.execTheory(p0), ac = th.cost(th.ac(p0.lam)), tw = th.cost(th.twap()), nw = th.cost(th.now());
    near(tw.mean, 0.5 + 4.5 / 20, 1e-12, "匀速：期望成本 γ/2 + (η − γ/2)/T"); near(nw.obj, 5, 1e-12, "一次卖完：成本恰为 η，方差为 0"); near(tw.variance, 6.175, 1e-9, "匀速：方差 σ²·Σ(1 − k/T)²");
    near(2 * (Math.cosh(th.kappa(0.5)) - 1), 0.5 * 1 / 4.5, 1e-12, "κ 满足 2(cosh κ − 1) = λσ²/(η − γ/2)"); near(th.kappa(0.5), 0.3318, 2e-4, "默认参数下 κ ≈ 0.33");
    { const n = th.ac(0.5); let s = 0, mono = true; for (let k = 0; k < n.length; k++) { s += n[k]; if (k && n[k] > n[k - 1] + 1e-12) mono = false; } ok(Math.abs(s - 1) < 1e-12 && mono && ac.obj < tw.obj && ac.obj < nw.obj, "最优计划卖完全部、前快后慢，目标值低于匀速和一次卖完", `${f(ac.obj, 3)} 对 ${f(tw.obj, 3)}、${f(nw.obj, 3)}`); }
    { const n0 = th.ac(0.5), base = ac.obj, g = new QL.RNG(5, 5, 5); let worse = 0; for (let i = 0; i < 3000; i++) { const n = n0.slice(), a = g.int(20), b = g.int(20), e = 0.02 * g.normal(); if (a === b) { worse++; continue; } n[a] += e; n[b] -= e; if (n[a] < 0 || n[b] < 0 || th.cost(n).obj >= base - 1e-13) worse++; } ok(worse === 3000, "在最优计划附近任意挪动，目标值都不会更低"); }
    { let best = 0, bv = -Infinity; const cv = QL.WORLDS.g_exec.theory(p0).curves; for (let l = 0; l <= 3; l += 0.05) { const v = cv["exec_ac.lam"].f(l); if (v > bv) { bv = v; best = l; } } near(best, 0.5, 1e-9, "对规则的 λ 扫描：理论曲线的峰值恰在裁判的 λ 处"); let br = 0, bvr = -Infinity; for (let r = 0.02; r <= 1; r += 0.01) { const v = cv["exec_front.rho"].f(r); if (v > bvr) { bvr = v; br = r; } } near(br, 1 - Math.exp(-th.kappa(0.5)), 0.03, "固定比例的族：最优的 ρ ≈ 1 − e^(−κ)"); ok(-bvr < ac.obj * 1.02 && -bvr >= ac.obj - 1e-12, "这个族的最好成绩与最优计划相差不到 2%", `${f(-bvr, 4)} 对 ${f(ac.obj, 4)}`); }
    const N = 20000;
    for (const [lib, p, want, nm] of [["exec_twap", {}, tw, "匀速"], ["exec_now", {}, nw, "一次卖完"], ["exec_ac", { lam: 0.5 }, ac, "最优计划"], ["exec_front", { rho: 0.2 }, th.cost(th.front(0.2)), "每期卖两成"]]) {
      const r = sim("g_exec", null, lib, p, N); within(-r.score, want.obj, r.se, 4, 0.002, `${nm}：模拟的 E + λ·Var 与理论一致`, `E ${f(r.aux[0], 3)} 对 ${f(want.mean, 3)}，Var ${f(r.aux[1], 3)} 对 ${f(want.variance, 3)}`);
      ok(Math.abs(r.aux[0] - want.mean) < 4 * Math.sqrt(want.variance / N) + 1e-9 && Math.abs(r.aux[1] - want.variance) < 0.05 * want.variance + 1e-9, `${nm}：期望成本和方差各自对得上`);
    }
    const a0 = sim("g_exec", { lam: 0 }, "exec_ac", { lam: 0 }, 500), t0 = sim("g_exec", { lam: 0 }, "exec_twap", {}, 500); let eq = true; for (let i = 0; i < 500; i++) if (Math.abs(a0.res.SC[i] - t0.res.SC[i]) > 1e-9) eq = false; ok(eq, "λ = 0 时最优计划退化成匀速卖出");
    const aim = sim("g_exec", null, "exec_aim", { k: 0.5 }, N), twp = sim("g_exec", null, "exec_twap", {}, N); ok(aim.aux[1] > twp.aux[1] * 1.15, "涨了多卖、跌了少卖：成本的方差比匀速还大", `${f(aim.aux[1], 2)} 对 ${f(twp.aux[1], 2)}`);
    const mom = sim("g_exec", { phi: 0.3 }, "exec_ac", { lam: 0.5 }, N); ok(-mom.score > ac.obj + 0.1, "价格有动量时方差变大，事先定好的计划的理论值不再适用", `${f(-mom.score, 3)} 对 ${f(ac.obj, 3)}`);
    const lazy = sim("g_exec", null, { decide: () => 0 }, {}, 300, 2, { detail: 0 }); ok(lazy.res.det.w[20] === 0 && lazy.res.det.w[19] === 1 && Math.abs(lazy.aux[0] - 5) < 0.6, "裁判：最后一期强制卖完（拖到最后等于一次卖完，还多担了风险）", f(lazy.aux[0], 3));
    const over = sim("g_exec", null, { decide: () => 7 }, {}, 100), nowR = sim("g_exec", null, "exec_now", {}, 100); ok(over.score === nowR.score, "裁判：卖出量不能超过手里剩下的");
  }

  section("第二轮复核后补的检查");
  {
    // 秘书问题 · 只能和见过的人比：规则读不到分数，读得到的只有相对名次
    const seen = [], probe = { decide: s => { if (seen.length < 400) seen.push([s.t, s.x, s.price, s.ret(0), s.rank, s.p(1)]); return 0; } };
    const pr = sim("g_sec", { goal: "best", info: "rank", n: 40 }, probe, {}, 10), rel = pr.B.H.rel;
    ok(seen.every(r => r[1] !== r[1]), "只看名次时 s.x 是 NaN");
    ok(seen.every(r => r[2] === r[4] && r[4] === rel[Math.floor(seen.indexOf(r) / 40) * 40 + r[0]] && (r[0] === 0 || (r[3] === rel[Math.floor(seen.indexOf(r) / 40) * 40 + r[0] - 1] && r[5] === r[3]))), "只看名次时 s.price、s.ret(k)、s.p(k) 给的都是到场时的相对名次");
    ok(pr.B.VR && pr.B.VL && pr.B.R[0] !== pr.B.VR[0] && Math.abs(pr.B.R[0]) > 2, "裁判和图表用的分数另存一份，没有变");
    const Dv = QL.makeData(pr.B); ok(Dv.next(0, 3) === rel[3] && Dv.at(0, 5).price === rel[5], "fit 里的训练数据同样只给相对名次");
    // 想靠分数之间的差距估计分布的规则：现在无从下手，成绩不可能超过只用名次的最优
    const est = { init: () => ({ s: 0, s2: 0, n: 0 }), decide: (s, p, st) => { const x = s.ret(0); if (x === x) { st.s += x; st.s2 += x * x; st.n++; } if (s.t < 20 || s.rank !== 1) return 0; const m = st.s / st.n, sd = Math.sqrt(Math.max(1e-12, st.s2 / st.n - m * m)); return (s.x - m) / sd > 1.2 ? 1 : 0; } };
    const cl = QL.secClassic(100), er = sim("g_sec", { goal: "best", info: "rank" }, est, {}, 8000); ok(er.score < cl.value + 3 * er.se, "只看名次：用到分数的规则拿不到比 37% 更高的成绩", f(er.score));
    // 看得到分数时一切照旧
    const seenF = [], prF = sim("g_sec", { goal: "best", info: "full", n: 40 }, { decide: s => { if (seenF.length < 80) seenF.push([s.t, s.x, s.price, s.ret(0)]); return 0; } }, {}, 3);
    ok(!prF.B.VR && seenF.every((r, i) => r[1] === prF.B.R[Math.floor(i / 40) * 40 + r[0]] && r[1] === r[2] && r[1] >= 0 && r[1] <= 1), "看得到分数时 s.x 就是分数");

    // 布朗桥先碰到哪条线：对称的情形是 Kolmogorov 分布，线离得极近时退化成"按距离分"，只有一条线时退化成反射原理
    const bf = QL.bridgeFirst; let ks = 0; for (let k = 1; k < 20; k++) ks += 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k);
    const sym = bf(0, 0, -1, 1, 1); near(sym[0] + sym[1], ks, 1e-9, "对称双线：碰线概率 = 2Σ(−1)^{k−1}e^{−2k²}"); near(sym[0], sym[1], 1e-12, "对称双线：上下各半");
    const tight = bf(0, 0.001, -0.01, 0.02, 1); near(tight[0], 1 / 3, 2e-3, "线很近：先碰上线的概率 = 到下线的距离 / 两线间距"); near(tight[0] + tight[1], 1, 1e-9, "线很近：必然碰线");
    const one = bf(0, 0.1, -Infinity, 0.5, 0.5); near(one[0], Math.exp(-2 * 0.5 * 0.4 / 0.5), 1e-12, "只有上线：exp(−2b(b − y)/v)"); ok(one[1] === 0, "只有上线：下线概率 0");
    const out = bf(0, 0.5, -0.3, 0.4, 0.2); ok(out[0] > 0.85 && Math.abs(out[0] + out[1] - 1) < 1e-12, "终点在上线之外：必然碰线，多半先碰上线", f(out[0]));
    { // 和很细的随机游走比（细分 4000 步，离散化会少算一点碰线）
      const g = new QL.RNG(3, 3, 3), M = 4000, n = 3000, y1 = 0.15, lo = -0.25, hi = 0.35, v = 0.16, sd = Math.sqrt(v / M), z = new Float64Array(M); let up = 0, dn = 0;
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < M; j++) { z[j] = g.normal(); s += z[j]; } const zb = s / M; let acc = 0, hit = 0; for (let j = 1; j <= M && !hit; j++) { acc += z[j - 1] - zb; const y = y1 * j / M + sd * acc; if (y >= hi) hit = 1; else if (y <= lo) hit = 2; } if (hit === 1) up++; else if (hit === 2) dn++; }
      const ex = bf(0, y1, lo, hi, v); ok(Math.abs(up / n - ex[0]) < 0.035 && Math.abs(dn / n - ex[1]) < 0.035, "与直接模拟的布朗桥一致", `${f(up / n, 3)}/${f(dn / n, 3)} 对 ${f(ex[0], 3)}/${f(ex[1], 3)}`); }
    // 自营考核：杠杆很高时，一天之内见分晓，通过率 ≈ (单日线 − 建仓成本) / (目标 + 单日线)
    const N2 = 12000, h0 = sim("g_prop", { lev: 100, cost: 0 }, "prop_fix", { f: 100 }, N2), h2 = sim("g_prop", { lev: 100 }, "prop_fix", { f: 100 }, N2), h50 = sim("g_prop", { lev: 100 }, "prop_fix", { f: 50 }, N2);
    within(h0.score, 0.05 / 0.15, h0.se, 4, 0.006, "100 倍杠杆、不计成本：通过率 ≈ d/(a + d) = 1/3");
    within(h2.score, (0.05 - 0.02) / 0.15, h2.se, 4, 0.006, "100 倍杠杆、成本 2 个基点：建仓先付掉 2%，通过率 ≈ 0.2");
    within(h50.score, (0.05 - 0.01) / 0.15, h50.se, 4, 0.006, "50 倍杠杆：≈ 0.267");
    // 单日亏损线和总亏损线一样大时并没有消失：账户盈利之后它更近
    const d10 = sim("g_prop", { dayLoss: 10 }, "prop_fix", { f: 5 }, N2), d20 = sim("g_prop", { dayLoss: 20 }, "prop_fix", { f: 5 }, N2);
    ok(d10.aux[2] > 0.06 && d20.aux[2] === 0 && d20.score > d10.score, "单日线 = 总亏损线时仍有局栽在单日线上；调到 目标 + 总亏损线 才彻底不起作用", `${f(d10.aux[2], 3)}；通过率 ${f(d10.score, 3)} 对 ${f(d20.score, 3)}`);
  }

  section("第三轮复核：改过的数字和结论");
  {
    // ④ 赌徒破产公式不再把筹码数取整：曲线单调、不超过大胆下注；注码除不尽时和模拟差在两个百分点以内
    const p4 = 18 / 38, bold = QL.boldQ(0.5, p4); let prev = -1, mono = true, mx = 0;
    for (let s = 0.005; s <= 0.5001; s += 0.0025) { const v = QL.timidQ(0.5, s, p4); if (v < prev - 1e-12) mono = false; if (v > mx) mx = v; prev = v; }
    ok(mono && mx <= bold + 1e-9, "小注的理论曲线单调上升，处处不超过大胆下注", `最大 ${f(mx)}，大胆 ${f(bold)}`);
    near(QL.timidQ(0.5, 0.25, p4), (1 - Math.pow(20 / 18, 2)) / (1 - Math.pow(20 / 18, 4)), 1e-12, "注码整除时就是赌徒破产公式");
    for (const st of [0.07925, 0.203, 0.302, 0.37625]) { const r = sim("g_bold", null, "bold_timid", { stake: st }, 12000); ok(Math.abs(r.score - QL.timidQ(0.5, st, p4)) < 0.02, `注码 ${st}（除不尽）：模拟与公式差不到两个百分点`, `${f(r.score)} 对 ${f(QL.timidQ(0.5, st, p4))}`); }
    const t1 = sim("g_bold", null, "bold_timid", { stake: 0.01 }, 12000); ok(t1.aux[1] > 0.76 && t1.aux[1] < 0.82, "每把押 1%：近八成的局 500 把里分不出胜负", f(t1.aux[1], 3));
    // ⑧ "没有单日亏损线"这个场景：没有一局栽在单日线上
    const sc8 = QL.WORLDS.g_prop.scenes.find(x => /没有单日亏损线/.test(x.name)); ok(sc8 && sc8.p.dayLoss === 20, "自营考核：\"没有单日亏损线\"的场景把单日线调到了 目标 + 总亏损线");
    for (const ff of [3, 5, 8]) { const r = sim("g_prop", sc8.p, "prop_fix", { f: ff }, 4000); ok(r.aux[2] === 0, `那个场景里固定 ${ff} 倍：没有一局因为单日亏损出局`, f(r.aux[2], 4)); }
    // ⑤ ε-贪心：50 回合时不探索最好；500 回合时峰在 0.01 到 0.05 之间，默认的 0.1 偏大
    const eps = (T, e, N) => sim("g_bandit", { T }, "ban_eps", { eps: e }, N).score;
    const e50 = [0, 0.02, 0.1].map(e => eps(50, e, 12000)), e500 = [0, 0.01, 0.03, 0.05, 0.1].map(e => eps(500, e, 3000));
    console.log(`   ε-贪心 50 回合 ε = 0/0.02/0.1：${e50.map(x => f(x)).join("  ")}；500 回合 ε = 0/0.01/0.03/0.05/0.1：${e500.map(x => f(x)).join("  ")}`);
    ok(e50[0] > e50[1] && e50[1] > e50[2], "只拉 50 次：ε 越小越好");
    ok(Math.max(e500[1], e500[2], e500[3]) > e500[0] + 0.003 && Math.max(e500[1], e500[2], e500[3]) > e500[4] + 0.005, "拉 500 次：峰在 0.01 到 0.05 之间，0 和 0.1 都不如它");
    // ⑤ 遗憾：贪心从 500 到 5000 回合涨八九倍，Thompson 不到 3 倍；UCB 把 c 调到 0.1 比 Thompson 的遗憾还小
    const reg = (T, id, p, N) => sim("g_bandit", { T }, id, p, N).aux[0];
    const g5 = reg(500, "ban_greedy", {}, 4000), g50 = reg(5000, "ban_greedy", {}, 500), t5 = reg(500, "ban_ts", {}, 4000), t50 = reg(5000, "ban_ts", {}, 500), u01 = reg(500, "ban_ucb", { c: 0.1 }, 4000), u2 = sim("g_bandit", null, "ban_ucb", { c: 2 }, 4000).score;
    console.log(`   遗憾 500 → 5000：贪心 ${f(g5, 1)} → ${f(g50, 1)}（${f(g50 / g5, 1)} 倍），Thompson ${f(t5, 1)} → ${f(t50, 1)}；UCB(c = 0.1) ${f(u01, 1)}；UCB(c = 2) 的得分 ${f(u2)}`);
    ok(g50 / g5 > 7 && g50 / g5 < 10.5 && t50 / t5 < 3 && u01 < t5 && Math.abs(u2 - 0.74) < 0.006, "老虎机：贪心的遗憾涨八九倍，Thompson 不到 3 倍；c = 0.1 的 UCB 遗憾比 Thompson 小；c = 2 的 UCB 得分约 0.74");
    // ⑤ 有锁时内置的几条规则会跳过被锁的机器
    const D2 = id => sim("g_bandit", { D: 2 }, id, defs(GS.find(x => x.id === id)), 1500).aux[2];
    ok(D2("ban_ts") === 0 && D2("ban_ucb") === 0 && D2("ban_greedy") === 0 && D2("ban_etc") === 0 && D2("ban_rand") > 0.2, "锁 2 回合：贪心、先试后定、UCB、Thompson 没有作废的回合，随便拉有两成多", f(D2("ban_rand"), 3));
    // ③ 正面 55%：按 Kelly（10%）押，不到一半的局封顶；60% 时九成多。期望到手金额的平台在 0.1 到 0.2
    const c55 = sim("g_coin", { p: 0.55 }, "coin_frac", { f: 0.1 }, 6000), c60 = sim("g_coin", null, "coin_frac", { f: 0.2 }, 6000), cf = ff => sim("g_coin", null, "coin_frac", { f: ff }, 6000).score, c10 = cf(0.1), c30 = cf(0.3), c40 = cf(0.4), c50 = cf(0.5);
    console.log(`   偏硬币：55% 时封顶 ${f(c55.aux[1], 3)}、到手 ${f(c55.score, 1)}；60% 时封顶 ${f(c60.aux[1], 3)}；f = 0.1/0.2/0.3/0.4/0.5 到手 ${[c10, c60.score, c30, c40, c50].map(x => f(x, 0)).join(" / ")}`);
    ok(c55.aux[1] > 0.4 && c55.aux[1] < 0.5 && c60.aux[1] > 0.9 && Math.abs(c55.score - 143) < 6, "偏硬币 55%：不到一半的局封顶，到手约 143 美元");
    ok(Math.abs(c10 - 240) < 4 && Math.abs(c60.score - 237) < 4 && Math.abs(c30 - 215) < 6 && Math.abs(c40 - 174) < 7 && Math.abs(c50 - 126) < 8, "偏硬币：0.1 到 0.2 是平台，过了 0.2 一路下滑（约 215 / 174 / 126）");
    // ⑦ m = 2.5：出价 100 最好，125 时利润归零
    const cu = b => sim("g_curse", { m: 2.5 }, "curse_fix", { b }, 4000), b50 = cu(50), b100 = cu(100), b125 = cu(125);
    ok(b100.score > b50.score + 10 && Math.abs(b100.score - 25) < 1 && Math.abs(b125.score) < 1, "赢家诅咒 m = 2.5：出到 100 最好（约 +25），出到 125 利润归零", `${f(b50.score, 2)} / ${f(b100.score, 2)} / ${f(b125.score, 2)}`);
    // ② 1000 人：先看 37 人只有 12%，先看 9 人只有 4%
    const s37 = sim("g_sec", { n: 1000 }, "sec_cut", { m: 37 }, 4000), s9 = sim("g_sec", { n: 1000 }, "sec_cut", { m: 9 }, 4000);
    ok(Math.abs(s37.score - 0.1225) < 0.02 && Math.abs(s9.score - 0.043) < 0.012, "秘书问题 1000 人：先看 37 人约 12%，先看 9 人约 4%", `${f(s37.score, 3)} / ${f(s9.score, 3)}`);
    // ⑨ 默认的"日内高抛低吸"：涨跌停放宽到 ±20% 每年多出十一个百分点上下，印花税吃掉近七个，T+1 不到一个
    const ash = o => sim("g_ashare", o, "ash_rev", defs(GS.find(x => x.id === "ash_rev")), 1500, 11).score, a0 = ash({}), a20 = ash({ limit: "20" }), aS = ash({ stamp: 0 }), aT = ash({ t1: "off" }), aF = ash({ t1: "off", limit: "0" });
    console.log(`   A 股：全部制度 ${f(a0 * 100, 2)}%；±20% 多出 ${f((a20 - a0) * 100, 2)}；不收印花税多出 ${f((aS - a0) * 100, 2)}；T+0 多出 ${f((aT - a0) * 100, 2)}；T+0 且不设涨跌停 ${f(aF * 100, 2)}%`);
    ok(a0 > 0 && a0 < 0.045 && Math.abs(a20 - a0 - 0.11) < 0.015 && Math.abs(aS - a0 - 0.0675) < 0.01 && aT - a0 > 0 && aT - a0 < 0.012 && aF > 0.14 && aF < 0.175, "A 股制度的拆解：各项的大小和说明里写的一致");
  }

  section("第四轮复核：先试后定真的认准一台；报童与大单执行的边角");
  {
    // 先试后定：试探结束时排一次名次，之后不管数据怎么变都不改
    const etc = LIB.ban_etc, st = etc.init({ m: 2 }), s = { g: { arms: 3 }, t: 0, pulls: new Float64Array(3), wins: new Float64Array(3), lock: new Int32Array(3) }, p = { m: 2 };
    const seq = []; for (let t = 0; t < 6; t++) { s.t = t; const k = etc.decide(s, p, st); seq.push(k); s.pulls[k]++; if (k === 1) s.wins[k]++; }
    ok(seq.join("") === "012012" && st.order === null, "试探阶段：三台轮流各拉两次", seq.join(""));
    s.t = 6; const first = etc.decide(s, p, st); s.wins[0] = 100; s.pulls[0] = 100; s.wins[1] = 0; s.t = 7; const second = etc.decide(s, p, st);
    ok(first === 1 && second === 1 && st.order[0] === 1, "认定之后不再看新的数据：后来别的台看上去更好，也不换", `${first} ${second} ${st.order}`);
    s.lock[1] = 2; s.t = 8; ok(etc.decide(s, p, st) === st.order[1], "认准的那台被锁住的回合，拉名次第二的那台");
    const e1 = sim("g_bandit", null, "ban_etc", { m: 10 }, 3000), e2 = sim("g_bandit", { prior: "close" }, "ban_etc", { m: 10 }, 3000), e3 = sim("g_bandit", { prior: "close" }, "ban_etc", { m: 25 }, 3000);
    ok(Math.abs(e1.score - 0.77) < 0.015 && e3.score > e2.score, "先试后定的得分约 0.77；中奖率难分辨时，多试几次更好", `${f(e1.score)}；${f(e2.score)} → ${f(e3.score)}`);
    // 报童：售价、进价、残值收到同一个数时，知道分布的两条规则不再算出 0/0
    for (const id of ["news_crit", "news_saa"]) { const r = sim("g_news", { price: 6, cost: 8, salvage: 9 }, id, defs(GS.find(x => x.id === id)), 200); ok(isFinite(r.score) && r.sum.badFrac === 0, `${id}：售价 = 进价 = 残值时照常给出订货量`, `${f(r.score)}，无效回合 ${f(r.sum.badFrac, 3)}`); }
    // 大单执行：永久冲击设得超过 2η 时，理论值和裁判用的是同一个（收回来的）γ
    const pe = Object.assign(QL.worldDefaults("g_exec"), { eta: 1, gamma: 5, lam: 0.5 }), th = QL.WORLDS.g_exec.theory(pe), tw = sim("g_exec", { eta: 1, gamma: 5, lam: 0.5 }, "exec_twap", {}, 6000), mk = th.marks.find(m => /匀速/.test(m.name));
    ok(mk && Math.abs(mk.value - tw.score) < 0.12, "γ > 2η 时，对照表里\"匀速卖出\"的理论值与模拟一致", `${mk ? f(mk.value, 3) : "?"} 对 ${f(tw.score, 3)}`);
  }

  done();
})().catch(e => { console.error("TEST CRASHED:", e.stack); process.exit(1); });
