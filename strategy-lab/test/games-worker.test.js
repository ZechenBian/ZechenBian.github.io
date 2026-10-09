// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 玩法经过后台线程的消息循环：回测、参照物、样本外、单局明细、参数扫描
const { QL, STRATS, compile, world, ok, near, section, done } = require("./harness.js");
const f = (x, d = 4) => (typeof x === "number" && x === x ? x.toFixed(d) : String(x));
const defs = st => { const p = {}; (st.params || []).forEach(q => { p[q.key] = q.def; }); return p; };
const S = id => STRATS.find(x => x.id === id);
function worker(code) {
  const out = [], scope = { postMessage: m => out.push(m) }; let seq = 0;
  QL.workerMain(scope, compile(code), {});
  return {
    out,
    call(type, payload) {
      const id = ++seq; scope.onmessage({ data: Object.assign({ type, id }, payload) });
      return new Promise((res, rej) => { const poll = () => { const m = out.find(x => x.id === id && (x.type === type || x.type === "error")); if (!m) return setImmediate(poll); if (m.type === "error") rej(new Error(m.message)); else res(m); }; poll(); });
    }
  };
}
const SET = QL.DEFAULT_SET;

(async () => {
  section("回测一局玩法");
  {
    const st = S("lock_thr"), w = worker(st.code), cfg = world("g_lock", null, 200);
    const wm = await w.call("world", { cfg }); ok(wm.N === 200 && wm.T === 2000 && wm.K === 1 && wm.stats && Math.abs(wm.stats.mean - 1) < 0.02, "生成对局，并给出这批随机数的统计（报价均值 1）", f(wm.stats.mean));
    const r = await w.call("run", { p: defs(st), set: SET, fan: true }), g = r.game;
    ok(g && g.game === "g_lock" && Math.abs(g.score - 0.134) < 0.004 && g.se > 0 && g.name === "平均每回合收益", "结果里带着玩法自己的得分", `${f(g.score)} ± ${f(g.se)}`);
    ok(g.refs.length === 4 && g.refs.filter(x => x.bench).length === 1 && g.refs.every(x => typeof x.score === "number" && typeof x.d === "number" && !x.err), "四个参照物都在同一批对局上跑了，各有配对差", g.refs.map(x => `${x.id} ${f(x.score)}`).join("，"));
    const thr = g.refs.find(x => x.id === "thr"), any = g.refs.find(x => x.id === "any"), pro = g.refs.find(x => x.id === "prophet");
    ok(Math.abs(thr.d) < 1e-4 && thr.dse < 1e-4, "当前规则就是参照里的那条（门槛只差舍入）：配对差几乎为 0", `${thr.d.toExponential(2)}`);
    ok(any.d > 0.06 && any.d / any.dse > 50 && pro.d < 0 && pro.kind === "bound", "相对基准显著领先，低于事后诸葛亮的上界", `${f(any.d)} ± ${f(any.dse)}`);
    ok(g.marks.length === 2 && Math.abs(g.marks[0].value - 0.134) < 1e-3 && g.aux.length === 2 && Math.abs(g.aux[0].value - 89.5) < 3, "理论值和附带统计都在", g.aux.map(a => `${a.name} ${f(a.value, 2)}`).join("，"));
    ok(r.SC.length === 200 && r.benchSC.length === 200 && r.eq && r.eq.fan.q50.length === r.eq.grid.length && r.benchFan && r.benchFan.q50.length === r.eq.grid.length, "每局的得分、累计收益的扇形图、基准的扇形图");
    near(r.eq.fan.q50[r.eq.grid.length - 1] / 2000, g.score, 0.004, "扇形图的终点 = 累计收益的中位数");
    near(r.benchFan.q50[r.eq.grid.length - 1] / 2000, any.score, 0.003, "基准的扇形图用的是这套玩法的基准规则");
    ok(typeof r.runMs === "number" && r.sum && r.benchSum, "仍带着通用的摘要字段，界面的其余部分不用改");
    // 样本外
    const o = await w.call("oos", { p: defs(st), set: SET, k: 1 }); ok(o.game && Math.abs(o.game.score - g.score) < 6 * g.se && o.game.score !== g.score && o.game.refs.length === 4 && o.kind === "fresh", "新的一批对局：得分在误差之内，但不是同一批", `${f(o.game.score)} 对 ${f(g.score)}`);
    // 单局明细
    const pm = await w.call("path", { n: 5, p: defs(st), set: SET }); let cnt = 0, lockOk = true, last = -99; for (let t = 0; t < 2000; t++) { if (pm.m[t] === 1) { cnt++; if (t - last <= 15) lockOk = false; last = t; if (!(pm.x[t] >= 2.01 - 1e-6)) lockOk = false; } }
    ok(pm.game && pm.x.length === 2000 && pm.w.length === 2001 && lockOk && Math.abs(pm.w[2000] / 2000 - r.SC[5]) < 1e-6 && Math.abs(pm.bw[2000] / 2000 - r.benchSC[5]) < 1e-6 && pm.benchName === "见单就接", "单局明细：报价、每次接单、累计收益，与那一局的得分对得上", `接了 ${cnt} 单`);
    // 扫描门槛
    const cs = []; for (let c = 0; c <= 4.01; c += 0.25) cs.push(+c.toFixed(2));
    const sw = await w.call("sweep", { axes: [{ key: "c", values: cs }], p: defs(st), set: SET }), th = QL.lockTheory(cfg.params); let bi = 0, fit = true;
    for (let i = 0; i < cs.length; i++) { if (sw.score[i] > sw.score[bi]) bi = i; if (Math.abs(sw.score[i] - th.rho(cs[i])) > 5 * sw.scoreSE[i] + 0.002) fit = false; }
    ok(Math.abs(cs[bi] - th.cStar) <= 0.26 && fit && sw.stepNs.every(v => v >= 0), "参数扫描：得分曲线贴着理论的 ρ(c)，峰值在 c* 附近", `峰值 c = ${cs[bi]}`);
    const sw2 = await w.call("sweep", { axes: [{ key: "__lam", values: [0.5, 1, 2] }], p: defs(st), set: SET }); ok(sw2.score.every(v => Math.abs(v - g.score) < 1e-12), "玩法里没有\"仓位倍数\"：扫它不改变结果，也不会出错");
  }

  section("带训练的玩法规则");
  {
    const st = S("lock_dp"), w = worker(st.code), cfg = world("g_lock", { T: 300 }, 300); await w.call("world", { cfg });
    const r = await w.call("run", { p: {}, set: SET, fitKeys: st.fitKeys }); ok(r.hasFit && r.fit && r.fit.N === 300 && /倒推出的门槛/.test(r.note || ""), "动态规划在另外生成的一批对局上估分布", r.note);
    const dp = r.game.refs.find(x => x.id === "dp"); ok(Math.abs(dp.d) < 1e-12, "与参照里的动态规划逐局相同（同一批数据、同一段代码）");
    ok(w.out.filter(m => m.type === "fitted").length === 1, "只训练一次");
    const st2 = S("coin_dp"), w2 = worker(st2.code); await w2.call("world", { cfg: world("g_coin", null, 400) });
    const r2 = await w2.call("run", { p: defs(st2), set: SET, fitKeys: st2.fitKeys }), k = r2.game.refs.find(x => x.id === "kelly"); ok(r2.game.score > 240 && k.d > 0 && r2.game.marks.some(m => m.kind === "human" && m.value === 91), "偏硬币：动态规划高于 Kelly；实验里真人的平均成绩作为对照", `${f(r2.game.score, 1)}，高出 ${f(k.d, 1)}`);
    const sw = await w2.call("sweep", { axes: [{ key: "grid", values: [50, 250] }], p: defs(st2), set: SET, fitKeys: st2.fitKeys }); ok(sw.score[1] >= sw.score[0] - 1 && sw.fitMs.every(v => v >= 0) && w2.out.filter(m => m.type === "fitted").length === 2, "扫描要重新训练的参数：每个取值训练一次，并记下用时", Array.from(sw.fitMs).join(" / ") + " 毫秒");
  }

  section("仓位类的玩法");
  {
    const st = S("ash_rev"), w = worker(st.code), cfg = world("g_ashare", null, 150); await w.call("world", { cfg });
    const r = await w.call("run", { p: defs(st), set: SET, fan: true }), g = r.game, free = g.refs.find(x => x.id === "free"), ns = g.refs.find(x => x.id === "nostamp"), hold = g.refs.find(x => x.id === "hold");
    ok(free && free.kind === "alt" && typeof free.score === "number" && free.d < -0.04 && ns && ns.d < -0.03 && hold.bench, "A 股规则：\"同一条规则换一套规则\"的对照现跑出来了", `去掉 T+1 和涨跌停多赚 ${f(-free.d * 100, 1)}%，不收印花税多赚 ${f(-ns.d * 100, 1)}%`);
    near(r.sum.growth, g.score, 1e-9, "得分 = 三种口径里的长期增长率"); ok(isFinite(r.sum.sharpe) && r.sum.turnover > 100 && r.sum.exposure > 0.3 && r.sum.exposure < 0.7 && r.sum.ddMed > 0, "夏普、换手、平均仓位、回撤都算出来了", `夏普 ${f(r.sum.sharpe, 2)}，换手 ${f(r.sum.turnover, 0)}，仓位 ${f(r.sum.exposure, 2)}`);
    const st2 = S("ma"), w2 = worker(st2.code); await w2.call("world", { cfg });
    const r2 = await w2.call("run", { p: defs(st2), set: SET, fan: true }); ok(r2.game && isFinite(r2.game.score) && r2.game.refs.find(x => x.id === "free").score != null, "价格世界的规则（均线交叉）直接可用，对照也跟着它重算");
    const st3 = S("const"), w3 = worker(st3.code); await w3.call("world", { cfg: world("g_prop", null, 1500) });
    const r3 = await w3.call("run", { p: { f: 2 }, set: SET }), f1 = r3.game.refs.find(x => x.id === "f1"); ok(Math.abs(r3.game.score - 0.38) < 0.06 && f1.d > 0.1, "自营考核：固定比例 2 倍的通过率约 38%，高于 1 倍", `${f(r3.game.score, 3)}`);
    const sw = await w3.call("sweep", { axes: [{ key: "f", values: [0.5, 1, 2, 3, 5, 8] }], p: { f: 2 }, set: SET }); let bi = 0; for (let i = 0; i < 6; i++) if (sw.score[i] > sw.score[bi]) bi = i; ok(bi === 2, "对杠杆做扫描：峰值在 2 倍附近", Array.from(sw.score).map(v => f(v, 3)).join(" "));
  }

  section("其余玩法过一遍消息循环（十套玩法和四套观测玩法）");
  for (const k of QL.ALL_GAMES) {
    const wd = QL.WORLDS[k], st = S(wd.defStrat), w = worker(st.code), cfg = world(k, null, k === "g_lock" ? 40 : 120); let err = "", r, pm, o;
    try { await w.call("world", { cfg }); r = await w.call("run", { p: defs(st), set: SET, fan: true, fitKeys: st.fitKeys }); pm = await w.call("path", { n: 3, p: defs(st), set: SET, fitKeys: st.fitKeys }); o = await w.call("oos", { p: defs(st), set: SET, k: 2, fitKeys: st.fitKeys }); } catch (e) { err = e.message; }
    ok(!err && r.game && isFinite(r.game.score) && r.game.refs.every(x => !x.err) && pm.game && pm.w.length === r.sum.T + 1 && (k === "g_exec" ? isFinite(pm.SC) : Math.abs(pm.SC - r.SC[3]) < 1e-9) && isFinite(o.game.score), `${wd.short}：回测、单局明细、新的一批都通`, err || `得分 ${f(r.game.score)}`);
  }
  // 规则写错时的报错
  {
    const w = worker("function decide(s) { return s.nope.x; }"); await w.call("world", { cfg: world("g_coin", null, 20) }); let msg = ""; try { await w.call("run", { p: {}, set: SET }); } catch (e) { msg = e.message; } ok(/nope|undefined/.test(msg), "规则代码出错时，错误原样报出来", msg.slice(0, 60));
    const w2 = worker("function decide(s) { return 'abc'; }"); await w2.call("world", { cfg: world("g_coin", null, 20) }); const r = await w2.call("run", { p: {}, set: SET }); ok(r.sum.badFrac === 1 && r.game.score === 25, "返回的不是数：记为无效动作，按什么都不做处理");
  }
  done();
})().catch(e => { console.error("TEST CRASHED:", e.stack); process.exit(1); });
