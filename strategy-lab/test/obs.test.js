// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 四套观测玩法、"玩法 → 世界"两层的元数据、现算的登记表与自检清单。
// 现算的数由 test/live-node.js 按页面同样的办法算（按源码内容缓存）；这里另外用不同的种子直接跑引擎，核对理论值不是只在一个种子上成立。
const path = require("path"), fs = require("fs");
const { QL, STRATS, compile, world, ok, near, section, done } = require("./harness.js");
global.QL_GUIDE = require("../src/guide.js"); require("../src/guide-games.js"); require("../src/guide-worlds.js"); require("../src/guide-obs.js");
const G = global.QL_GUIDE, LN = require("./live-node.js"), LV = QL.live, LIB = QL.gameLib;
const OS = STRATS.filter(s => QL.OBS.includes(s.game));
const f = (x, d = 4) => (typeof x === "number" && x === x ? x.toFixed(d) : String(x));
const defs = st => { const p = {}; (st.params || []).forEach(q => { p[q.key] = q.def; }); return p; };
function sim(type, over, strat, p, N, seed) {
  const cfg = world(type, over, N, null, null, seed), B = QL.makeBatch(cfg, null, 0), S = typeof strat === "string" ? LIB[strat] : strat;
  const model = S.fit ? S.fit(QL.makeData(QL.makeBatch(cfg, null, 0, "fit")), p || {}, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined;
  const res = QL.runGame(B, S, p || {}, null, {}, model), g = QL.gameSummary(B, res, null);
  return { cfg, B, res, g, score: g.score, se: g.se, aux: g.aux.map(a => a.value) };
}
/** 一条规则在某个设定下"玩法给的默认参数"（界面上选中这条规则时用的就是这一组） */
function tuned(type, over, st) { const w = QL.WORLDS[type], params = Object.assign(QL.worldDefaults(type), over || {}), Rg = w.ranges ? w.ranges(params) : {}, p = defs(st); (st.params || []).forEach(q => { const r = Rg[st.lib + "." + q.key]; if (r && r[2] != null) p[q.key] = r[2]; }); return p; }
const rule = id => OS.find(s => s.id === id);
const within = (x, target, se, k, slack, name) => ok(Math.abs(x - target) <= k * se + (slack || 0), name, `模拟 ${f(x)} ± ${f(se)}，理论 ${f(target)}`);

section("登记：四套观测玩法，和十套玩法并列");
{
  ok(QL.OBS.join() === "o_meas,o_pred,o_det,o_stop" && QL.ALL_GAMES.join() === QL.GAMES.concat(QL.OBS).join() && QL.GAMES.length === 10, "十套玩法不变，另有四套观测玩法");
  ok(QL.OBS.every((k, i) => QL.WORLDS[k].no === 11 + i && QL.WORLDS[k].game === true && QL.WORLDS[k].group === QL.OBS_GROUP), "编号 11 到 14，单独成组");
  ok(QL.WORLD_GROUPS[0] === QL.GAME_GROUP && QL.WORLD_GROUPS[1] === QL.OBS_GROUP, "世界的分组里，观测玩法紧跟在十套玩法后面");
  ok(Object.keys(QL.WORLDS).filter(k => QL.WORLDS[k].game).sort().join() === QL.ALL_GAMES.slice().sort().join(), "所有标成玩法的世界都在总表里");
  for (const k of QL.OBS) {
    const w = QL.WORLDS[k], need = ["name", "short", "blurb", "unit", "params", "defaults", "Tof", "consts", "score", "track", "action", "aux", "defStrat", "gen", "play", "theory", "refs", "scenes", "api", "ranges"];
    ok(need.every(q => w[q] != null) && w.retune === true, `${w.short}：元数据齐全，场景里的规则参数按场景重新取默认值`, need.filter(q => w[q] == null).join(","));
    const p = QL.worldDefaults(k), refs = w.refs(p), th = w.theory(p), sc = w.score(p);
    ok(refs.filter(r => r.bench).length === 1 && refs.every(r => r.calc || r.alt || LIB[r.lib]), `${w.short}：有且只有一个基准，参照规则都找得到`);
    ok(Array.isArray(th.marks) && th.marks.every(m => typeof m.value === "number" && isFinite(m.value)) && typeof sc.name === "string", `${w.short}：理论值都是有限的数`, th.marks.map(m => f(m.value, 3)).join(" "));
    ok(OS.some(s => s.id === w.defStrat && s.game === k) && OS.filter(s => s.game === k).length >= 5, `${w.short}：默认规则存在，内置规则不少于 5 条`);
    ok(w.scenes.length >= 6 && new Set(w.scenes.map(s => s.name)).size === w.scenes.length, `${w.short}：不少于 6 个预设场景，名字不重复`);
    ok(typeof w.api === "string" && w.api.length > 200 && /s\./.test(w.api), `${w.short}：写明了规则看得到什么`);
  }
  ok(OS.length === 23 && OS.every(s => s.lib && LIB[s.lib] && !s.src), "二十三条内置规则都指向裁判手里的参照");
}

section("两层：每套玩法都说得清它的世界是什么");
for (const k of QL.ALL_GAMES) {
  const w = QL.WORLDS[k], keys = w.params.map(q => q.key);
  if (w.wsel) {
    const q = w.params.find(x => x.key === w.wsel);
    ok(q && q.type === "select" && q.options.length >= 2 && Array.isArray(w.wkeys) && w.wkeys[0] === w.wsel && w.wkeys.every(x => keys.includes(x)), `${w.short}：世界由参数「${q && q.label}」选，世界的参数都存在`, (w.wkeys || []).filter(x => !keys.includes(x)).join(","));
  } else {
    ok(typeof w.wname === "string" && w.wname.length >= 2 && typeof w.wdesc === "string" && w.wdesc.length >= 10 && (w.wkeys || []).every(x => keys.includes(x)), `${w.short}：世界是固定的，有名字和一句说明`, (w.wkeys || []).filter(x => !keys.includes(x)).join(","));
  }
}
ok(QL.OBS.every(k => QL.WORLDS[k].wsel), "四套观测玩法都能换世界");

section("裁判：信息、计分的符号、默认参数");
{
  // 成本型的玩法内部一律记成负数（越高越好），显示时翻回来
  for (const k of QL.OBS) {
    const w = QL.WORLDS[k], lower = !!w.score(QL.worldDefaults(k)).lower, r = sim(k, null, w.defStrat.replace(/^.*$/, OS.find(s => s.id === w.defStrat).lib), tuned(k, null, rule(w.defStrat)), 60, 5);
    let neg = true; for (let i = 0; i < r.res.SC.length; i++) if (r.res.SC[i] > 1e-12) neg = false;
    ok(k === "o_pred" ? !lower : lower && neg, `${w.short}：${lower ? "成本型，每一局的内部得分都不大于 0" : "得分型，越高越好"}`);
    ok(r.res.bad === 0 && isFinite(r.score), `${w.short}：默认规则没有无效动作`);
  }
  // 规则拿不到答案：视图上没有真值、变点、未来的值
  const peek = (type, over) => { const seen = []; const S = { decide(s) { if (seen.length < 3) { const o = {}; for (const key in s) o[key] = typeof s[key]; seen.push(o); } return 0; } }; sim(type, over, S, {}, 3, 2); return seen[0] || {}; };
  for (const k of QL.OBS) {
    const v = peek(k), bad = Object.keys(v).filter(x => /^(truth|nu|amp|h|hidden|future|max|answer)$/.test(x));
    ok(Object.keys(v).length >= 4 && bad.length === 0, `${QL.WORLDS[k].short}：交给规则的对象上没有答案`, Object.keys(v).join(" "));
  }
  // 测量：数据不够时标准估计退回先验均值，而不是给出 NaN
  { const sp = QL.measSpec(Object.assign(QL.worldDefaults("o_meas"), { what: "kappa" })); ok(isFinite(sp.m0) && sp.v0 > 0 && QL.measStd(sp, new Float64Array([0, 0.1]), 0, 1, 1, 1) === sp.m0, "测量：只有两个观测时，标准估计给出先验均值", f(sp.m0)); }
  // 场景里的默认参数跟着场景走
  { const sts = OS.filter(s => s.game === "o_det"), W = QL.WORLDS.o_det, i0 = W.scenes.findIndex(s => /幅度 1σ/.test(s.name)), i1 = W.scenes.findIndex(s => /幅度 0\.5σ/.test(s.name)), a = LV.sceneParams("o_det", i0, sts), b = LV.sceneParams("o_det", i1, sts);
    ok(i0 >= 0 && i1 >= 0 && a.det_cusum.k === 0.5 && b.det_cusum.k === 0.25 && b.det_cusum.h > a.det_cusum.h, "变点检测：幅度减半的场景里，累积和的参考值取 δ/2 = 0.25，报警线抬高", JSON.stringify([a.det_cusum, b.det_cusum])); }
  { const sts = OS.filter(s => s.game === "o_stop"), W = QL.WORLDS.o_stop, i = W.scenes.findIndex(s => /只有 50 步/.test(s.name)), a = LV.sceneParams("o_stop", 0, sts), b = LV.sceneParams("o_stop", i, sts);
    near(b.stop_trail.d / a.stop_trail.d, Math.sqrt(50 / 250), 0.02, "停时：只有 50 步的场景里，固定回落的默认幅度按 √步数 缩小"); }
  // 十套玩法不带 retune：场景里用的还是基础场景的默认值（和上一版的对照表一致）
  ok(QL.GAMES.every(k => !QL.WORLDS[k].retune), "十套玩法的对照表仍用基础场景的默认参数");
}

section("理论值，换一个种子直接跑引擎核对");
{
  // 测漂移：标准估计 σ²/(Dτ²) = 4，收缩 1/(1+s) = 0.8，先验 1
  let r = sim("o_meas", { what: "mu" }, "meas_std", {}, 4000, 11); within(-r.score, 4, r.se, 4, 0, "测漂移 · 时长 1：标准估计的得分 = 4");
  r = sim("o_meas", { what: "mu" }, "meas_shrink", tuned("o_meas", { what: "mu" }, rule("meas_shrink")), 4000, 11); within(-r.score, 0.8, r.se, 4, 0, "测漂移：按最优权重收缩 = 0.8");
  ok(Math.abs(tuned("o_meas", { what: "mu" }, rule("meas_shrink")).w - 0.2) < 1e-9, "测漂移：默认的收缩权重就是 s/(1+s) = 0.2");
  r = sim("o_meas", { what: "mu" }, "meas_prior", {}, 4000, 11); within(-r.score, 1, r.se, 4, 0, "不看数据 = 1");
  r = sim("o_meas", { what: "mu", T: 1000 }, "meas_std", {}, 3000, 13); within(-r.score, 4, r.se, 4, 0, "测漂移：采样点数从 250 加到 1000，得分不变");
  r = sim("o_meas", { what: "mu", dur: 4 }, "meas_std", {}, 4000, 13); within(-r.score, 1, r.se, 4, 0, "测漂移：时长加到 4，得分降到四分之一");
  // 测波动：相对方差 1/(2(n−1))
  { const p = Object.assign(QL.worldDefaults("o_meas"), { what: "sigma" }), th = LN.val(G, "m.sg.th"); r = sim("o_meas", { what: "sigma" }, "meas_std", {}, 4000, 11); within(-r.score, th, r.se, 4, 0.001, "测波动 · 250 个点：与公式相符");
    const r4 = sim("o_meas", { what: "sigma", T: 1000 }, "meas_std", {}, 2500, 11); ok(-r4.score < -r.score / 3 && -r4.score > -r.score / 5.5, "测波动：点数加到四倍，误差降到四分之一上下", f(-r4.score) + " 对 " + f(-r.score)); void p; }
  // 测回复速度：偏差约 4/D
  r = sim("o_meas", { what: "kappa" }, "meas_std", {}, 4000, 11); ok(r.aux[0] > 0.25 && r.aux[0] < 0.55, "测回复速度 · 时长 10：平均高估约 0.4", f(r.aux[0]));
  r = sim("o_meas", { what: "kappa", durk: 40 }, "meas_std", {}, 3000, 11); ok(r.aux[0] > 0.04 && r.aux[0] < 0.17, "测回复速度 · 时长 40：偏差降到约 0.1", f(r.aux[0]));
  // 预测
  r = sim("o_pred", { src: "bm" }, "pred_line", { w: 1 }, 1500, 11); within(r.score, -1, r.se, 4, 0.02, "预测 · 布朗运动：线性外推的技巧分 = −1");
  r = sim("o_pred", { src: "bm" }, "pred_stay", {}, 300, 11); ok(r.score === 0, "预测：原地不动的技巧分按定义是 0");
  { const th = QL.WORLDS.o_pred.theory(Object.assign(QL.worldDefaults("o_pred"), { src: "ou", h: 10 })).best; near(th, (1 - Math.pow(0.9, 10)) / 2, 1e-9, "预测 · 均值回复：上限 (1 − φ^h)/2");
    r = sim("o_pred", { src: "ou", h: 10 }, "pred_mean", tuned("o_pred", { src: "ou", h: 10 }, rule("pred_mean")), 1500, 11); ok(r.score > th - 0.06 && r.score < th + 4 * r.se, "预测 · 均值回复 · 提前 10 步：回到均值接近上限，不超过它", f(r.score) + " 对 " + f(th)); }
  r = sim("o_pred", { src: "logi" }, "pred_nn", defs(rule("pred_nn")), 400, 11); ok(r.score > 0.99, "预测 · Logistic：最近邻一步几乎报准", f(r.score));
  { const a = sim("o_pred", { src: "logi" }, "pred_ar", defs(rule("pred_ar")), 600, 11); ok(a.score > 0.4 && a.score < 0.55, "预测 · Logistic：线性自回归停在 0.5 上下（它只能报均值）", f(a.score)); }
  // 变点检测：动态规划的实测 = 倒推值；Shiryaev 接近它；累积和略差
  { const p = QL.worldDefaults("o_det"), dp = QL.detDP(p); r = sim("o_det", null, "det_dp", {}, 4000, 11); within(-r.score, dp.value, r.se, 4, 0.05, "变点检测：动态规划的实测代价 = 倒推值");
    const sh = sim("o_det", null, "det_shir", tuned("o_det", null, rule("det_shir")), 4000, 11), cu = sim("o_det", null, "det_cusum", tuned("o_det", null, rule("det_cusum")), 4000, 11), sw = sim("o_det", null, "det_shew", defs(rule("det_shew")), 4000, 11);
    ok(-sh.score < -r.score + 0.25 && -cu.score < -r.score + 0.6 && -cu.score > -r.score - 3 * r.se && -sw.score > 2.5 * -r.score, "变点检测：后验概率门槛紧贴最优，累积和略差，单点超限差得远", [-r.score, -sh.score, -cu.score, -sw.score].map(x => f(x, 2)).join(" "));
    const nv = LN.val(G, "d.never"); ok(nv > 250 && nv < 350, "变点检测：从不报警的代价在 300 步上下", f(nv, 1)); }
  // 停在最高点：动态规划 = 倒推值；走到头 = 立刻停；按距离本身计分打平
  { const p = QL.worldDefaults("o_stop"), dp = QL.stopDP(p); r = sim("o_stop", null, "stop_dp", {}, 4000, 11); within(-r.score, dp.value, r.se, 4, 0, "停时：动态规划的实测代价 = 倒推值");
    const e = sim("o_stop", null, "stop_end", {}, 4000, 11), n0 = sim("o_stop", null, "stop_now", {}, 4000, 11); within(-e.score, dp.end, e.se, 4, 0, "停时：走到头 = 递推值"); within(-n0.score, dp.now, n0.se, 4, 0, "停时：立刻停 = 递推值"); near(dp.end, dp.now, 1e-9, "停时：没有漂移时两者的理论值相等");
    ok(Math.abs(e.aux[1] - n0.aux[1]) < 0.03 && Math.abs(r.aux[1] - e.aux[1]) < 0.03, "停时：按距离本身计分，三条规则打平（可选停止定理）", [e.aux[1], n0.aux[1], r.aux[1]].map(x => f(x, 3)).join(" "));
    const g = QL.gps(); ok(Math.abs(g.z - 1.1228) < 0.002 && Math.abs(g.v - 0.7385) < 0.002 && dp.value < g.v, "停时：连续时间的常数 z* ≈ 1.12、最优值 ≈ 0.7385；离散的最优值在它下面", f(g.z) + " " + f(g.v) + " " + f(dp.value));
    let c = 1; for (let i = 1; i <= 250; i++) c *= (2 * i - 1) / (2 * i); ok(Math.abs(LN.val(G, "s.sa") - c) < 1e-9 && Math.abs(n0.aux[2] - c) < 0.012, "停时：起点就是最高点的概率 = C(2T, T)/4^T", f(n0.aux[2]) + " 对 " + f(c)); }
}

section("现算：表里的格子和直接跑引擎的一致");
{
  const MX = LN.matrix();
  for (const [t, sname, sid] of [["o_meas", "漂移 · 时长 25", "meas_shrink"], ["o_pred", "洛伦兹", "pred_ar"], ["o_det", "幅度 0.5σ", "det_cusum"], ["o_det", "误报罚 500 步", "det_dp"], ["o_stop", "只有 50 步", "stop_trail"], ["o_stop", "均值回复", "stop_37"], ["g_coin", 0, "coin_frac"], ["g_news", 1, "news_fix"]]) {
    const M = MX.games[t], si = typeof sname === "number" ? sname : M.scenes.findIndex(s => s.name === sname), W = QL.WORLDS[t], st = STRATS.find(s => s.id === sid), sts = STRATS.filter(s => s.game === t && !s.src);
    const p = LV.sceneParams(t, si, sts)[sid], r = sim(t, W.scenes[si].p, st.lib, p, M.scenes[si].N, LV.SEED), c = M.cells[sid][si];
    ok(si >= 0 && c && Math.abs(c[0] - r.score) <= 1e-4 * Math.max(1, Math.abs(r.score)) && Math.abs(c[1] - r.se) <= 1e-4 * Math.max(1, Math.abs(r.se)), `表与直接跑一致：${W.short} · ${M.scenes[si] && M.scenes[si].name} · ${st.name}`, c && (c[0] + " 对 " + r.score));
    // 界面上的代码（单独编译）和裁判手里的参照，在这个场景里逐局相同
    const r2 = sim(t, W.scenes[si].p, compile(st.code), p, 80, 3), r3 = sim(t, W.scenes[si].p, st.lib, p, 80, 3); let eq = true; for (let i = 0; i < r2.res.SC.length; i++) if (r2.res.SC[i] !== r3.res.SC[i]) eq = false;
    ok(eq, `同一格：界面上的代码与参照逐局相同（${sid}）`);
  }
  // 先后次序无关：后台线程不按顺序算，缓存的中间结果不能串
  { const sts = OS.filter(s => s.game === "o_det"), a = LV.gameScene("o_det", 3, sts), b = LV.gameScene("o_det", 0, sts), c3 = LN.gameCol("o_det", 3), c0 = LN.gameCol("o_det", 0);
    ok(JSON.stringify(a.cells) === JSON.stringify(c3.cells) && JSON.stringify(b.cells) === JSON.stringify(c0.cells) && a.bench === c3.bench, "变点检测：先算第 4 个场景再算第 1 个，结果与按顺序算的相同"); }
  { const sts = OS.filter(s => s.game === "o_stop"), a = LV.gameScene("o_stop", 2, sts), b = LV.gameScene("o_stop", 0, sts);
    ok(JSON.stringify(a.cells) === JSON.stringify(LN.gameCol("o_stop", 2).cells) && JSON.stringify(b.cells) === JSON.stringify(LN.gameCol("o_stop", 0).cells), "停时：同上"); }
  ok(QL.ALL_GAMES.every(t => { const M = MX.games[t]; return M.scenes.every((sc, si) => M.strats.every(id => { const c = M.cells[id][si]; return c && (M.lower ? c[0] <= 1e-9 : true); })); }), "成本型的玩法，表里存的都是负的成本");
  ok(MX.price.strats.length === 18 && MX.price.worlds.length === 15 && MX.seed === 7, "价格世界的表：十八条规则 × 十五个世界，种子 7");
}

section("活数字：正文里引用的每一个都登记了，都算得出来");
{
  const texts = []; (function walk(o, where) { if (typeof o === "string") texts.push([where, o]); else if (o && typeof o === "object") for (const k in o) if (k !== "svg" && k !== "live" && k !== "checks" && typeof o[k] !== "function") walk(o[k], where + "." + k); })(G, "G");
  OS.forEach(st => { texts.push(["strat." + st.id + ".summary", st.summary || ""]); Object.keys(st.explain || {}).forEach(k => texts.push(["strat." + st.id + "." + k, String(st.explain[k])])); });
  // 细则是函数写出来的：四套观测玩法的每个场景都展开一遍
  for (const k of QL.OBS) { const w = QL.WORLDS[k]; [{}].concat(w.scenes.map(s => s.p)).forEach((over, i) => { const p = Object.assign(QL.worldDefaults(k), over); G.games[k].rules(p, w.theory(p)).forEach(s => texts.push(["rules." + k + "#" + i, s])); }); }
  const used = new Map(), badFmt = [], inMath = [];
  for (const [where, s] of texts) {
    const re = /⟪([^⟫|]+)(?:\|([^⟫]*))?⟫/g; let m;
    while ((m = re.exec(s))) { if (!used.has(m[1])) used.set(m[1], where); if (m[2] != null && !/^(%?\d)$/.test(m[2])) badFmt.push(where + ":" + m[0]); }
    if (/⟪|⟫/.test(s.replace(re, ""))) badFmt.push(where + ": 不成对的记号");
    s.split("$").forEach((seg, i) => { if (i % 2 === 1 && /⟪/.test(seg)) inMath.push(where); });
  }
  const unreg = [...used.keys()].filter(id => !G.live[id]);
  ok(used.size >= 80, "正文里引用了八十个以上的现算数字", String(used.size));
  ok(unreg.length === 0, "引用到的名字都登记了", unreg.slice(0, 8).map(id => id + " @ " + used.get(id)).join("; "));
  ok(badFmt.length === 0, "格式写法都认得（位数，或 % 加位数）", badFmt.slice(0, 6).join("; "));
  ok(inMath.length === 0, "活数字不写在公式里面", inMath.slice(0, 6).join("; "));
  const kinds = id => { const sp = G.live[id]; return ["calc", "cell", "pcell", "pbench", "sim", "of"].filter(k => sp[k]); };
  ok(Object.keys(G.live).every(id => kinds(id).length === 1), "登记表里每一条恰好有一种取法");
  const dead = [...used.keys()].filter(id => { const v = LN.val(G, id); return !(typeof v === "number" && isFinite(v)); });
  ok(dead.length === 0, "引用到的每一个数都算得出来", dead.slice(0, 8).join(" "));
  // 登记了格子的，场景名和规则都对得上
  const wrong = Object.keys(G.live).filter(id => { const sp = G.live[id]; if (!sp.cell) return false; const w = QL.WORLDS[sp.cell[0]]; return !w || (typeof sp.cell[1] === "string" ? !w.scenes.some(s => s.name === sp.cell[1]) : !w.scenes[sp.cell[1]]) || !STRATS.some(s => s.id === sp.cell[2] && s.game === sp.cell[0]); });
  ok(wrong.length === 0, "登记的格子都指向存在的玩法、场景和规则", wrong.slice(0, 6).join(" "));
  // 用正数表示成本的那些：翻过符号之后确实是正的
  const negs = Object.keys(G.live).filter(id => G.live[id].neg), bad = negs.filter(id => !(LN.val(G, id) >= 0));
  ok(negs.length > 100 && bad.length === 0, "成本一律显示成正数", bad.slice(0, 6).join(" "));
}

section("自检清单：每一条都通过");
{
  const C = G.checks;
  ok(C.length === 65 && new Set(C.map(c => c.id)).size === C.length && C.every(c => typeof c.say === "string" && c.say.length > 6 && Array.isArray(c.need) && c.need.length && typeof c.test === "function"), "六十五条，每条有一句话、要用的数、判定办法", String(C.length));
  ok(C.every(c => c.need.every(id => G.live[id])), "要用的数都登记了", C.filter(c => !c.need.every(id => G.live[id])).map(c => c.say).join("; "));
  const groups = [...new Set(C.map(c => c.group))]; ok(groups.length === 6 && groups[0] === "价格世界的对照表" && groups[1] === "十套玩法" && groups.slice(2).join() === QL.OBS.map(k => QL.WORLDS[k].name).join(), "分六组：价格世界的对照表、十套玩法、四套观测玩法各一组", groups.join(" | "));
  ok(C.filter(c => c.group === groups[0]).length === 9 && C.filter(c => c.group === groups[1]).length === 15 && QL.GAMES.every((k, i) => C.some(c => c.group === groups[1] && c.say.indexOf("①②③④⑤⑥⑦⑧⑨⑩".charAt(i)) === 0)), "价格世界 9 条；十套玩法 15 条，每一套至少一条");
  ok(G.checkStrats.join() === STRATS.filter(x => !x.game && !x.src).map(x => x.id).join(), "核对「整列」时用的规则单子就是全部内置的价格规则", G.checkStrats.join());
  { const pk = Object.keys(G.live).filter(id => G.live[id].pcell || G.live[id].pbench), bad = pk.filter(id => { const sp = G.live[id]; return sp.pcell ? !(LV.PW.some(w => w.key === sp.pcell[1]) && G.checkStrats.includes(sp.pcell[0]) && LV.PRICE_COLS.includes(sp.pcell[2])) : !(LV.PW.some(w => w.key === sp.pbench[0]) && sp.pbench[1] >= 0 && sp.pbench[1] < 4); }); ok(pk.length > 60 && bad.length === 0, "登记的价格格子都指向存在的规则、世界和列", bad.slice(0, 5).join(" ")); }
  for (const c of C) { const r = LN.check(G, c); ok(r.state === "pass", "自检 · " + c.group + " · " + c.say, r.note); }
  // 判定办法本身要判得出"不对"：把数换成明显不对的，应当不通过
  const fills = [() => 1e6, () => -1e6, () => 0, i => Math.pow(10, i), i => Math.pow(10, -i), i => (i % 2 ? 1e6 : 1)];
  const vacuous = C.filter(c => !fills.some(fill => { const vals = {}; c.need.forEach((id, i) => { vals[id] = fill(i); }); let r; try { r = c.test(k => vals[k]); } catch (e) { return true; } return !(r && typeof r === "object" ? r.ok : r); }));
  ok(vacuous.length === 0, "把要用的数换成离谱的值，每一条都判得出不对（判定不是摆设）", vacuous.map(c => c.say).join("; "));
}

section("手册：世界的另一面、规则的用处、算法信息");
{
  const price = Object.keys(QL.WORLDS).filter(k => !QL.WORLDS[k].game);
  ok(Object.keys(G.worldObs).length >= 8 && Object.keys(G.worldObs).every(k => price.includes(k)), "「不当价格，当作研究对象」写给了八个以上的价格世界", Object.keys(G.worldObs).join(" "));
  for (const k of Object.keys(G.worldObs)) {
    const o = G.worldObs[k], bullets = (o.md.match(/^- \*\*/gm) || []).length, bad = [];
    for (const [label, game, wp] of o.go) {
      const w = QL.WORLDS[game]; if (!w || !QL.OBS.includes(game) || !label) { bad.push(label + ": 玩法"); continue; }
      for (const key of Object.keys(wp || {})) { const q = w.params.find(x => x.key === key); if (!q) bad.push(label + ": 没有参数 " + key); else if (q.type === "select" ? !q.options.some(op => op[0] === wp[key]) : !(wp[key] >= q.min && wp[key] <= q.max)) bad.push(label + ": " + key + " = " + wp[key]); }
    }
    ok(o.md.length > 200 && bullets >= 2 && o.go.length >= 1 && bad.length === 0, `世界 ${k}：有两条以上"应该看到什么"，按钮都指向存在的设定`, bad.join("; "));
  }
  ok(OS.every(st => typeof G.gstrats[st.id] === "string" && G.gstrats[st.id].length > 20), "二十三条规则各有一段「用在哪」");
  ok(OS.every(st => G.algo[st.lib]), "二十三条规则都有算法信息");
  ok(typeof G.algoNotes.obs === "string" && G.algoNotes.obs.length > 80, "算法对比页有观测玩法这一段的读法");
  for (const k of QL.OBS) { const g = G.games[k]; ok(typeof g.see === "string" && g.see.length > 200 && /⟪/.test(g.see) && /定理|证明/.test(g.known), `${QL.WORLDS[k].short}：有「换一个世界，应该看到什么」，结论里有定理和证明`); }
  const gl = G.glossary.filter(x => Array.isArray(x)).map(x => x[0]); ok(["先验 / 后验", "均方误差", "收缩", "二次变差", "Hurst 指数", "技巧分", "Lyapunov 指数", "变点", "似然比", "反正弦律"].every(x => gl.includes(x)) && G.glossary.includes("观测与估计"), "名词里补上了观测与估计这一组");
  { const byName = Object.fromEntries(G.glossary.filter(x => Array.isArray(x))); ok(/玩法/.test(byName["世界"]) && /世界/.test(byName["玩法"]), "名词「世界」「玩法」互相说清了关系"); }
}

section("细则：四套观测玩法在每个场景下都写得出来");
for (const k of QL.OBS) {
  const w = QL.WORLDS[k], base = QL.worldDefaults(k), opts = w.params.find(q => q.key === w.wsel).options.map(o => o[0]);
  const variants = [base].concat(w.scenes.map(s => Object.assign({}, base, s.p))).concat(opts.map(o => Object.assign({}, base, { [w.wsel]: o })));
  let bad = 0, first = ""; for (const p of variants) { const r = G.games[k].rules(p, w.theory(p)); if (!(r.length >= 5 && r.every(x => typeof x === "string" && x.length > 8 && !/undefined|NaN|\[object/.test(x)))) { bad++; first = first || JSON.stringify(p) + " → " + r.find(x => /undefined|NaN|\[object/.test(x)); } }
  ok(bad === 0, `${w.short}：${variants.length} 组设定下细则都完整`, first);
  // 每一档世界都有理论对照可算，默认规则都能跑
  let err = ""; for (const o of opts) { try { const p = Object.assign({}, base, { [w.wsel]: o }), st = rule(w.defStrat), r = sim(k, { [w.wsel]: o }, st.lib, tuned(k, { [w.wsel]: o }, st), 40, 3), rf = QL.gameRefs(r.B, { fitData: () => QL.makeData(QL.makeBatch(r.cfg, null, 0, "fit")), alt: () => null }); if (!isFinite(r.score) || r.res.bad || rf.some(x => x.err)) err += o + " "; void p; } catch (e) { err += o + ":" + e.message + " "; } }
  ok(!err, `${w.short}：${opts.length} 档世界都能跑，对照都算得出来`, err);
}
done();
