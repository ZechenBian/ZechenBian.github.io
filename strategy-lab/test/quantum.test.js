// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 三套量子玩法和量子电路谜题：模拟器、裁判、理论值、内置规则、手册里写的每个数，以及"同一个模拟器"这件事本身
// （谜题里用态矢量一个门一个门算出来的概率，和玩法里裁判用的公式要一致）。
const path = require("path");
const { QL, STRATS, world, ok, near, section, done } = require("./harness.js");
global.QL_GUIDE = require("../src/guide.js"); require("../src/guide-games.js"); require("../src/guide-worlds.js"); require("../src/guide-obs.js"); require("../src/guide-quantum.js");
const G = global.QL_GUIDE, LIB = QL.gameLib, Q = QL.qsim, QC = require("../src/q-circuit.js")(QL), LV = QC.LEVELS;
const QS = STRATS.filter(s => (QL.QUANTUM || []).includes(s.game));
const f = (x, d = 4) => (typeof x === "number" && x === x ? x.toFixed(d) : String(x));
const defs = st => { const p = {}; (st.params || []).forEach(q => { p[q.key] = q.def; }); return p; };
function sim(type, over, strat, p, N, seed) {
  const cfg = world(type, over, N, null, null, seed), B = QL.makeBatch(cfg, null, 0), S = typeof strat === "string" ? LIB[strat] : strat;
  const model = S.fit ? S.fit(QL.makeData(QL.makeBatch(cfg, null, 0, "fit")), p || {}, QL.ml, new QL.RNG(cfg.seed, -3, -3)) : undefined;
  const res = QL.runGame(B, S, p || {}, null, {}, model), g = QL.gameSummary(B, res, null);
  return { cfg, B, res, g, score: g.score, se: g.se, aux: g.aux.map(a => a.value), model };
}
const within = (x, target, se, k, slack, name) => ok(Math.abs(x - target) <= k * se + (slack || 0), name, `模拟 ${f(x)} ± ${f(se)}，理论 ${f(target)}`);
const wd = (type, over) => Object.assign(QL.worldDefaults(type), over || {});
const TS = Math.pow(Math.cos(Math.PI / 8), 2);

section("登记：三套量子玩法，排在观测玩法之后");
{
  ok(QL.QUANTUM.join() === "q_bell,q_search,q_bomb" && QL.ALL_GAMES.join() === QL.GAMES.concat(QL.OBS, QL.QUANTUM).join(), "总表 = 十套 + 四套 + 三套");
  ok(QL.QUANTUM.every((k, i) => QL.WORLDS[k].no === 15 + i && QL.WORLDS[k].game && QL.WORLDS[k].quantum && QL.WORLDS[k].group === QL.QUANTUM_GROUP), "编号 15 到 17，单独成组");
  ok(QL.WORLD_GROUPS.slice(0, 3).join() === [QL.GAME_GROUP, QL.OBS_GROUP, QL.QUANTUM_GROUP].join(), "分组：十套、观测、量子，然后才是价格世界");
  for (const k of QL.QUANTUM) {
    const w = QL.WORLDS[k], need = ["name", "short", "blurb", "unit", "params", "defaults", "Tof", "consts", "score", "track", "action", "aux", "defStrat", "gen", "play", "theory", "refs", "scenes", "api", "wkeys"];
    ok(need.every(x => w[x] !== undefined), k + "：元数据齐全", need.filter(x => w[x] === undefined).join());
    ok(w.defaults.T === QL.worldDefaults(k).T || w.Tof(QL.worldDefaults(k)) === w.defaults.T, k + "：默认回合数与参数一致");
    ok(QS.some(s => s.id === w.defStrat && s.game === k), k + "：默认规则存在");
    ok(w.refs(QL.worldDefaults(k)).filter(r => r.bench).length === 1, k + "：正好一个基准");
    for (const r of w.refs(QL.worldDefaults(k))) ok(!r.lib || LIB[r.lib], k + "：参照规则 " + r.id + " 存在");
    ok(w.wkeys.every(x => w.params.some(q => q.key === x)), k + "：世界一层的参数都存在");
  }
  ok(QS.length === 15 && QS.every(s => s.explain && ["proven", "family", "bound", "heuristic"].includes(s.explain.tier) && s.explain.assume && s.explain.objective && s.explain.optimal && s.explain.fails && s.explain.test), "十五条内置规则，每条都有档位和五段说明");
  ok(QS.every(s => G.gstrats[s.id] && G.algo[s.lib]), "每条规则都有用处和算法信息");
  for (const s of QS) { const code = s.code; ok(/function decide\(s, p/.test(code) && code.startsWith("// "), s.id + "：代码就是裁判用的那一份"); }
}

section("模拟器：门、纠缠、约化态");
{
  const st = Q.basis(1, 0); Q.applySingle(st, 1, 0, Q.MAT.H); near(st[0][0], Math.SQRT1_2, 1e-12, "H|0⟩ = |+⟩"); near(st[1][0], Math.SQRT1_2, 1e-12, "H|0⟩ 的第二个分量");
  const b = Q.basis(2, 0); Q.applySingle(b, 2, 0, Q.MAT.H); Q.applyCtrl(b, 2, 0, 1, Q.MAT.X);
  ok(b.every((a, i) => Math.abs(a[0] - Q.BELL[i][0]) < 1e-12 && Math.abs(a[1] - Q.BELL[i][1]) < 1e-12), "H 再 CNOT 得到 |Φ⁺⟩");
  const v = Q.bloch(b, 2, 0); near(Math.hypot(v.x, v.y, v.z), 0, 1e-12, "|Φ⁺⟩ 里每个比特的 Bloch 向量在球心");
  const z = Q.bloch(Q.basis(1, 1), 1, 0); near(z.z, -1, 1e-12, "|1⟩ 在南极");
  let unitaryOk = true; for (const g of ["H", "X", "Y", "Z", "S", "T", "R4", "R8"]) { const M = Q.MAT[g]; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { let s0 = Q.C(0); for (let k = 0; k < 2; k++) s0 = Q.add(s0, Q.mul(Q.conj(M[k][i]), M[k][j])); if (Math.abs(s0[0] - (i === j ? 1 : 0)) > 1e-12 || Math.abs(s0[1]) > 1e-12) unitaryOk = false; } }
  ok(unitaryOk, "八个单比特门都是幺正的");
}

section("谜题：每一关都有三星的解");
{
  const sol = {
    minus: [{ g: "X", col: 0, q: [0] }, { g: "H", col: 1, q: [0] }],
    hzh: [{ g: "H", col: 0, q: [0] }, { g: "Z", col: 1, q: [0] }, { g: "H", col: 2, q: [0] }],
    bell: [{ g: "H", col: 0, q: [0] }, { g: "CNOT", col: 1, q: [0, 1] }],
    swap: [{ g: "CNOT", col: 0, q: [0, 1] }, { g: "CNOT", col: 1, q: [1, 0] }, { g: "CNOT", col: 2, q: [0, 1] }],
    deutsch: [{ g: "X", col: 0, q: [1] }, { g: "H", col: 1, q: [0] }, { g: "H", col: 1, q: [1] }, { g: "H", col: 3, q: [0] }],
    bomb: Array.from({ length: 8 }, (_, i) => [{ g: "R8", col: 2 * i, q: [0] }, { g: "BOMB", col: 2 * i + 1, q: [0] }]).flat(),
    grover: [{ g: "H", col: 0, q: [0] }, { g: "H", col: 0, q: [1] }, { g: "H", col: 2, q: [0] }, { g: "H", col: 2, q: [1] }, { g: "Z", col: 3, q: [0] }, { g: "Z", col: 3, q: [1] }, { g: "CZ", col: 4, q: [0, 1] }, { g: "H", col: 5, q: [0] }, { g: "H", col: 5, q: [1] }],
    dense: [{ g: "CNOT", col: 1, q: [0, 1] }, { g: "H", col: 2, q: [0] }],
    teleport: [{ g: "CNOT", col: 0, q: [0, 1] }, { g: "H", col: 1, q: [0] }, { g: "M", col: 2, q: [0] }, { g: "M", col: 2, q: [1] }, { g: "CNOT", col: 3, q: [1, 2] }, { g: "CZ", col: 4, q: [0, 2] }]
  };
  ok(LV.length === 10 && LV.map(L => L.id).join() === "minus,hzh,bell,swap,deutsch,bomb,grover,dense,teleport,chsh", "十关，次序不变");
  for (const L of LV) {
    if (L.type === "chsh") continue;
    const r = QC.check(L, sol[L.id]);
    ok(r.pass && r.stars === 3, L.id + "：参考解通过、三星", JSON.stringify(r.rows.map(x => x.value)) + " " + r.note);
    ok(!QC.check(L, []).pass, L.id + "：空电路不通过");
  }
  ok(QC.check(LV[QC.BYID.minus], [{ g: "H", col: 0, q: [0] }, { g: "Z", col: 1, q: [0] }]).pass, "第一关的另一条路：先 H 再 Z");
  ok(QC.check(LV[QC.BYID.minus], [{ g: "H", col: 0, q: [0] }]).pass === false, "只有 H 是 |+⟩，不是 |−⟩");
  const tp = LV[QC.BYID.teleport];
  ok(/跨越两边的门/.test(QC.teleportValidate([{ g: "CNOT", col: 0, q: [1, 2] }])), "隐形传态：没测量就跨过去的门被拒绝");
  ok(/只能当控制位/.test(QC.teleportValidate([{ g: "M", col: 0, q: [0] }, { g: "H", col: 1, q: [0] }])), "隐形传态：测量过的线不能再做别的");
  ok(QC.check(tp, sol.teleport).rows.length === 6, "隐形传态：用 6 个不同的 |ψ⟩ 检验");
  // 炸弹关：N 颗炸弹、每次 Ry(π/N) 的电路，完好地确认的概率就是 ⑰ 里的 cos^{2N}(π/2N)
  for (const [N, g] of [[4, "R4"], [8, "R8"]]) {
    const ops = Array.from({ length: N }, (_, i) => [{ g, col: 2 * i, q: [0] }, { g: "BOMB", col: 2 * i + 1, q: [0] }]).flat();
    const r = QC.check(LV[QC.BYID.bomb], ops);
    near(r.metric, QL.zenoOnce(N, 0).ok, 1e-12, "炸弹关：" + N + " 颗炸弹的电路 = 量子芝诺 N = " + N + " 的完好确认概率（" + f(r.metric, 4) + "）");
  }
  const mz = QC.check(LV[QC.BYID.bomb], [{ g: "H", col: 0, q: [0] }, { g: "BOMB", col: 1, q: [0] }, { g: "H", col: 2, q: [0] }]);
  near(mz.metric, 0.25, 1e-12, "炸弹关：Mach–Zehnder（H·B·H）确认 25%"); near(+mz.rows[0].value.replace("%", "") / 100, 0.5, 1e-9, "Mach–Zehnder：一半炸了");
  ok(mz.stars === 1, "Mach–Zehnder 一星");
}

section("同一个模拟器：谜题里一个门一个门算出来的，和玩法里的公式一致");
{
  // 第十关：态矢量算出的胜率 = ⑮ 里裁判用的 bellWin（角度换成度：一格 11.25°）
  let worst = 0, rng = new QL.RNG(3, 1, 1);
  for (let i = 0; i < 300; i++) { const k = { a0: rng.int(17) - 8, a1: rng.int(17) - 8, b0: rng.int(17) - 8, b1: rng.int(17) - 8 }, d = QC.chshToDeg(k); worst = Math.max(worst, Math.abs(QC.chshQuantum(k).tot - QL.bellWin("q", 1, d.a0, d.a1, d.b0, d.b1))); }
  ok(worst < 1e-12, "第十关的 300 组随机角度：态矢量与公式一致", "最大差 " + worst.toExponential(2));
  const opt = QC.chshQuantum({ a0: 0, a1: 4, b0: 2, b1: -2 }); near(opt.tot, TS, 1e-12, "最优角度 = cos²(π/8)"); ok(QC.chshStars(opt.tot) === 3, "最优角度三星");
  let best = 0; for (let m = 0; m < 16; m++) best = Math.max(best, QC.chshClassical({ a0: m & 1, a1: (m >> 1) & 1, b0: (m >> 2) & 1, b1: (m >> 3) & 1 }).tot); near(best, 0.75, 1e-12, "十六张经典答法表最多 75%");
  // Grover：用态矢量一步一步转（黑盒变号 + 关于均匀叠加态的反射），测中的概率 = ⑯ 里的 sin²((2k+1)θ)
  for (const [n, marks] of [[3, [5]], [4, [3]], [5, [1, 7, 20]], [6, [9]]]) {
    const N = 1 << n; let st = Array.from({ length: N }, () => Q.C(1 / Math.sqrt(N))), dev = 0;
    for (let k = 0; k <= 8; k++) {
      let p = 0; marks.forEach(w => { p += Q.abs2(st[w]); }); dev = Math.max(dev, Math.abs(p - QL.grovP(N, marks.length, k, 0)));
      marks.forEach(w => { st[w] = [-st[w][0], -st[w][1]]; });
      let m = [0, 0]; st.forEach(a => { m = Q.add(m, a); }); m = [m[0] / N, m[1] / N];
      st = st.map(a => [2 * m[0] - a[0], 2 * m[1] - a[1]]);
    }
    ok(dev < 1e-12, "Grover：N = " + N + "、" + marks.length + " 个奖品，态矢量与公式在前 9 步一致", dev.toExponential(2));
  }
  const gl = QC.check(LV[QC.BYID.grover], [{ g: "H", col: 0, q: [0] }, { g: "H", col: 0, q: [1] }, { g: "H", col: 2, q: [0] }, { g: "H", col: 2, q: [1] }, { g: "Z", col: 3, q: [0] }, { g: "Z", col: 3, q: [1] }, { g: "CZ", col: 4, q: [0, 1] }, { g: "H", col: 5, q: [0] }, { g: "H", col: 5, q: [1] }]);
  ok(gl.pass && QL.grovP(4, 1, 1, 0) === 1, "四选一：转一步就百分之百测中，和 ⑯ 里 N = 4 的公式一致");
}

section("⑮ Bell 游戏：裁判、理论值、规则");
{
  const r0 = sim("q_bell", {}, "bell_zero", {}, 4000, 11), rq = sim("q_bell", {}, "bell_phi", { phi: 22.5 }, 4000, 11);
  within(r0.score, 0.75, r0.se, 4, 0, "都答 0：75%"); near(r0.aux[0], 2, 1e-9, "都答 0：S 正好是 2");
  within(rq.score, TS, rq.se, 4, 0, "标准角度：cos²22.5°"); near(rq.aux[0], 2 * Math.SQRT2, 0.03, "标准角度：S ≈ 2√2");
  near(rq.aux[1], 0, 0.01, "不能传话：Bob 答 1 的比例与 Alice 收到什么无关");
  for (const v of [0.9, 0.7, 0.5]) { const r = sim("q_bell", { v }, "bell_phi", { phi: 22.5 }, 3000, 12); within(r.score, 0.5 + v * Math.SQRT2 / 4, r.se, 4, 0, "可见度 " + v + "：1/2 + v·√2/4"); }
  const rl = sim("q_bell", { src: "lhv" }, "bell_phi", { phi: 22.5 }, 4000, 13); within(rl.score, 0.75, rl.se, 4, 0, "局部隐变量源：标准角度 75%");
  for (const phi of [10, 30, 40]) { const r = sim("q_bell", { src: "lhv" }, "bell_phi", { phi }, 3000, 14); within(r.score, QL.bellPhi("lhv", 1, phi), r.se, 4, 0, "隐变量源 φ = " + phi + "°：直线关系 " + f(QL.bellPhi("lhv", 1, phi))); }
  near(QL.bellPhi("lhv", 1, 10), 0.75, 1e-12, "隐变量源：0° 到 30° 之间胜率恒为 3/4"); near(QL.bellPhi("lhv", 1, 30), 0.75, 1e-12, "隐变量源：30° 时仍是 3/4"); ok(QL.bellPhi("lhv", 1, 40) < 0.75, "隐变量源：过了 30° 往下掉");
  // 曲线：在 (0°, 45°) 里峰在 22.5°
  let arg = 0, bv = 0; for (let x = 0; x <= 45; x += 0.5) { const y = QL.bellPhi("q", 1, x); if (y > bv) { bv = y; arg = x; } } ok(arg === 22.5, "理论曲线的峰在 22.5°");
  // 十六张经典答法表
  let n75 = 0, n25 = 0, bad = 0;
  for (let m = 0; m < 16; m++) { const p = { a0: m & 1, a1: (m >> 1) & 1, b0: (m >> 2) & 1, b1: (m >> 3) & 1 }, r = sim("q_bell", { T: 100 }, "bell_table", p, 300, 15), e = QC.chshClassical(p).tot; if (e === 0.75) n75++; else if (e === 0.25) n25++; if (Math.abs(r.score - e) > 4 * r.se + 0.005) bad++; }
  ok(n75 === 8 && n25 === 8 && bad === 0, "十六张表：八张 3/4、八张 1/4，模拟与真值一致");
  // 共用随机数：胜率 1/4 + w/2；"w = 1"与"都答 0"逐回合相同
  for (const w of [0, 0.4, 1]) { const r = sim("q_bell", {}, "bell_shared", { w }, 2000, 16); within(r.score, 0.25 + w / 2, r.se, 4, 0, "共用随机数 w = " + w + "：1/4 + w/2"); }
  // 四个角度一起转：逐回合结果不变；β1 = +22.5° 时 0.677
  const a = sim("q_bell", {}, "bell_q", { a0: 0, a1: 45, b0: 22.5, b1: -22.5 }, 500, 17), b = sim("q_bell", {}, "bell_q", { a0: 30, a1: 75, b0: 52.5, b1: 7.5 }, 500, 17);
  ok(a.res.SC.every((x, i) => Math.abs(x - b.res.SC[i]) < 1e-12), "四个角度都加 30°：同一批对局上逐局相同");
  near(QL.bellWin("q", 1, 0, 45, 22.5, 22.5), 0.6768, 0.0001, "β1 改成 +22.5°：约 0.677");
  // Alice 和 Bob 的记事本互不相通；顶层变量能传话，而传话会超过 Tsirelson 界
  const peek = { init: () => ({}), decide: (s, p, st) => { if (s.role === "A") st.x = s.x; return s.role === "B" ? ((st.x === 1 && s.x === 1) ? 1 : 0) : 0; } };
  const rp = sim("q_bell", {}, peek, {}, 1000, 18); within(rp.score, 0.75, rp.se, 4, 0, "Bob 读不到 Alice 写在自己 st 里的东西：仍是 75%");
  let leak = null; const cheat = { decide: (s) => { if (s.role === "A") { leak = s.x; return 0; } return leak & s.x; } };
  const rc = sim("q_bell", {}, cheat, {}, 500, 19); near(rc.score, 1, 1e-12, "用顶层变量传话：100%"); ok(rc.score > TS + 0.05, "传话的结果超过 Tsirelson 界");
  // 一回合只能测一次
  let twice = true; const m2 = { decide: (s) => { const x = s.measure(0), y = s.measure(90); if (x !== y) twice = false; return x; } };
  sim("q_bell", {}, m2, {}, 100, 20); ok(twice, "同一回合再测一次，返回同一个结果");
  // 单看一局能否断定（3 个标准误）：精确的二项分布
  function lg(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
  function tail(T, p, k0) { let P = 0; for (let k = k0; k <= T; k++) P += Math.exp(lg(T) - lg(k) - lg(T - k) + k * Math.log(p) + (T - k) * Math.log(1 - p)); return P; }
  const k0 = Math.floor(150 + 3 * Math.sqrt(0.1875 * 200)) + 1, pOver = tail(200, TS, k0);
  near(pOver, 0.68, 0.005, "200 回合：标准角度能单独断定的概率约 68%（" + f(pOver) + "）"); within(rq.aux[2], pOver, Math.sqrt(pOver * (1 - pOver) / 4000), 4, 0, "模拟的这一项与二项分布一致");
  near(tail(200, 0.75, 151), 0.473, 0.0005, "都答 0：200 回合里超过 75% 的概率 47.3%");
  near(25 * 0.1875 / Math.pow(TS - 0.75, 2), 437, 0.5, "高出五个标准误约要 437 回合");
}

section("⑯ 量子搜索：裁判、理论值、规则");
{
  const th = QL.searchTheory(wd("q_search"));
  ok(th.kBest === 18 && th.kFull === 25, "N = 1024、一个奖品：最省的 k = 18，转到最高是 25");
  near(th.best, 22.68, 0.005, "最省的期望 22.68"); near(th.full, 26.01, 0.005, "转到最高 26.01"); near(th.sweep, 512.5, 1e-9, "经典不放回 (N+1)/(M+1) = 512.5"); near(th.guess, 1005.28, 0.01, "直接测（预算 4096）1005.28");
  for (const [lib, p, target] of [["srch_best", {}, th.best], ["srch_full", {}, th.full], ["srch_fixed", { k: 10 }, th.fixed(10)], ["srch_fixed", { k: 30 }, th.fixed(30)], ["srch_guess", {}, th.guess]]) {
    const r = sim("q_search", {}, lib, p, 2000, 21); within(-r.score, target, r.se, 4, 0.01, lib + JSON.stringify(p) + "：模拟与公式一致");
  }
  ok(Math.abs(th.fixed(50) - 4058.84) < 0.01, "k = 50 几乎转回起点：约 4059 次（预算 4096）");
  near(th.fixed(60), 170.91, 0.01, "k = 60 时约 171");
  // 经典的公式与暴力枚举
  for (const [N, M, T] of [[16, 1, 100], [16, 3, 100], [20, 4, 5], [64, 2, 30]]) {
    let s = 0, cnt = 0; const pos = Array.from({ length: N }, (_, i) => i);
    const rng = new QL.RNG(5, N, M);
    for (let r = 0; r < 20000; r++) { for (let i = N - 1; i > 0; i--) { const j = rng.int(i + 1); [pos[i], pos[j]] = [pos[j], pos[i]]; } let first = N; for (let i = 0; i < N; i++) if (pos[i] < M) { first = i + 1; break; } s += Math.min(first, T); cnt++; }
    near(QL.sweepCost(N, M, T), s / cnt, 0.04 * QL.sweepCost(N, M, T), "不放回地查：公式与抽样一致（N=" + N + "，M=" + M + "，T=" + T + "）");
  }
  for (const eps of [0.01, 0.05, 0.2]) { const t = QL.searchTheory(wd("q_search", { eps })), r = sim("q_search", { eps }, "srch_best", {}, 2000, 22); within(-r.score, t.best, r.se, 4, 0.01, "退相干 " + eps + "：最省的 k = " + t.kBest + "，模拟与公式一致"); }
  ok(QL.searchTheory(wd("q_search", { eps: 0.01 })).kBest === 17 && QL.searchTheory(wd("q_search", { eps: 0.05 })).kBest === 12 && QL.searchTheory(wd("q_search", { eps: 0.2 })).kBest === 4, "退相干 1%、5%、20%：最好的 k 是 17、12、4");
  ok(QL.searchTheory(wd("q_search", { eps: 0.2 })).full > 2800, "退相干 20%：转到最高要近三千次");
  const unk = wd("q_search", { mk: "unknown", M: 16 }), ru = sim("q_search", unk, "srch_full", {}, 2000, 23), rb = sim("q_search", unk, "srch_bbht", { lam: 1.2 }, 2000, 23), rg = sim("q_search", unk, "srch_guess", {}, 2000, 23);
  ok(-rb.score < 40 && -ru.score > 200 && -ru.score > -rg.score, "不知道有几个：随机步数逐轮放大 < 40，转到最高 > 200 且比随便猜还差", f(-rb.score, 1) + " / " + f(-ru.score, 1) + " / " + f(-rg.score, 1));
  within(rg.score * -1, QL.searchTheory(unk).guess, rg.se, 4, 0.5, "不知道有几个：随便猜与公式一致");
  const r1 = sim("q_search", {}, "srch_bbht", { lam: 1.2 }, 2000, 24); ok(-r1.score > 40 && -r1.score < 60, "知道只有一个时，随机步数逐轮放大约 50 次", f(-r1.score, 1));
  const r4 = sim("q_search", { M: 4 }, "srch_full", {}, 500, 25); ok(Math.abs(-r4.score - 13) < 0.5, "知道有 4 个：转到最高 13 次");
  const big = QL.searchTheory(wd("q_search", { n: 20, T: 6000 })); near(big.best, 707.2, 0.1, "2²⁰ 个盒子：约 707 次");
  ok(QL.grovBestK(1 << 30, 1, 0) > 0, "大 N 下也算得出");
  // 0.69 和 1.1656
  const x = 1.1656; near(Math.tan(x), 2 * x, 0.001, "tan x = 2x 的解约 1.1656"); near(Math.pow(Math.sin(x), 2), 0.845, 0.001, "此时测中的概率约 0.845"); near(x / (2 * Math.pow(Math.sin(x), 2)), 0.690, 0.001, "期望约 0.690·√(N/M)");
  const bbhtAvg = (m, th) => { let s = 0; for (let j = 0; j < m; j++) s += Math.pow(Math.sin((2 * j + 1) * th), 2); return s / m; };
  let lemma = 0; for (const th of [0.01, 0.05, 0.2]) for (const m of [1, 3, 10, 40]) lemma = Math.max(lemma, Math.abs(bbhtAvg(m, th) - (0.5 - Math.sin(4 * m * th) / (4 * m * Math.sin(2 * th)))));
  ok(lemma < 1e-12, "随机步数的平均成功率公式（Boyer 等人的引理）");
}

section("⑰ 炸弹检测：裁判、理论值、规则");
{
  const th = QL.bombTheory(wd("q_bomb"));
  ok(th.nBest === 64, "默认（每圈丢 1%，300 步）：最好的 N = 64"); near(th.best, 0.9451, 0.0005, "期望约 0.945");
  near(th.look, 0, 1e-9, "直接看一眼：0 分"); near(th.guess, 0, 1e-12, "一半一半时直接猜 0 分");
  for (const [over, lib, p] of [[{}, "bomb_look", {}], [{}, "bomb_zeno", { N: 2 }], [{}, "bomb_zeno", { N: 10 }], [{}, "bomb_best", {}], [{ eps: 0 }, "bomb_zeno", { N: 50 }], [{ eps: 0.05 }, "bomb_best", {}], [{ q: 0.1 }, "bomb_best", {}], [{ c: 10 }, "bomb_best", {}], [{ T: 30 }, "bomb_best", {}], [{ q: 0.1 }, "bomb_guess", {}]]) {
    const r = sim("q_bomb", over, lib, p, 6000, 31), t = QL.bombTheory(wd("q_bomb", over)), N = lib === "bomb_zeno" ? p.N : lib === "bomb_look" ? 1 : lib === "bomb_best" ? r.model.N : 0;
    const target = lib === "bomb_guess" ? t.guess : QL.zenoScore(N, t.q, t.eps, t.c, t.T).score;
    within(r.score, target, r.se, 4, 0, "炸弹 " + JSON.stringify(over) + " " + lib + JSON.stringify(p) + "：模拟与倒推一致");
    if (lib === "bomb_best") ok(r.model.N === t.nBest, "按损耗选步数：规则自己倒推的 N 与理论一致（" + r.model.N + "）");
    if (lib !== "bomb_guess") near(r.aux[1], 0, 1e-12, lib + "：量子芝诺（包括直接看）从不判错");
  }
  ok(QL.bombTheory(wd("q_bomb", { eps: 0.05 })).nBest === 28 && QL.bombTheory(wd("q_bomb", { c: 10 })).nBest === 78 && QL.bombTheory(wd("q_bomb", { T: 30 })).nBest === 14, "每圈丢 5%：28；扣 10 分：78；只给 30 步：14");
  const ideal = QL.bombTheory(wd("q_bomb", { eps: 0 })); let mono = true; for (let N = 2; N <= 298; N++) if (ideal.curve[N] < ideal.curve[N - 1] - 1e-12) mono = false;
  ok(mono, "完美的光路：得分随 N 单调上升"); near(ideal.curve[2], 0.25, 1e-12, "N = 2：0.25"); near(ideal.curve[10], 0.7805, 0.0005, "N = 10：约 0.78");
  near(th.curve[150], 0.5305, 0.0005, "每圈丢 1%：N = 150 时约 0.53");
  near(QL.zenoOnce(10, 0).ok, 0.7806, 0.0005, "N = 10：完好地确认 78.1%"); near(QL.zenoOnce(100, 0).ok, 0.9756, 0.0005, "N = 100：97.6%");
  for (const N of [1, 2, 5, 10, 50, 200]) ok(QL.zenoOnce(N, 0).ok >= 1 - Math.PI * Math.PI / (4 * N) - 1e-12, "cos^{2N}(π/2N) ≥ 1 − π²/(4N)，N = " + N);
  let bN = 0, bv = 0; for (let N = 1; N <= 2000; N++) { const z = QL.zenoOnce(N, 0.01), r = z.ok / (z.ok + z.boom); if (r > bv) { bv = r; bN = N; } }
  ok(bN === 160 && Math.abs(bv - 0.963) < 0.0005, "不限步数、每圈丢 1%：N = 160 时约 96.3%");
  near(0.25 / (0.25 + 0.5), 1 / 3, 1e-12, "Mach–Zehnder 重测：最后确认三分之一");
  const look = sim("q_bomb", { eps: 0 }, "bomb_look", {}, 4000, 32); let live = 0; for (let n = 0; n < look.B.N; n++) live += look.B.H.live[n];
  near(look.aux[0], live / look.B.N, 1e-12, "完美的光路：直接看一眼炸掉的比例正好等于这一批里真炸弹的比例");
}

section("手册：细则、数字、现算的登记");
{
  for (const k of QL.QUANTUM) {
    const g = G.games[k], w = QL.WORLDS[k], base = QL.worldDefaults(k);
    ok(g && g.scene.length > 80 && g.origin.length > 100 && g.known.length > 400 && g.tryit.length >= 4 && typeof g.rules === "function" && g.see, k + "：场景、出处、结论、可以试试、细则、应该看到什么");
    let bad = 0; for (const p of [base].concat(w.scenes.map(s => Object.assign({}, base, s.p)))) { const r = g.rules(p, w.theory(p)); if (!(r.length >= 5 && r.every(x => typeof x === "string" && x.length > 8 && !/undefined|NaN|\[object/.test(x)))) bad++; }
    ok(bad === 0, k + "：每个场景下细则都写得出来");
    ok(G.gameIndex[k] && G.gameIndex[k].length === 3, k + "：总览里的一行");
  }
  const R = (k, over) => G.games[k].rules(wd(k, over), QL.WORLDS[k].theory(wd(k, over))).join("\n");
  ok(/一局 200 回合/.test(R("q_bell")) && /\|Φ⁺⟩/.test(R("q_bell")) && /可见度 0\.9/.test(R("q_bell", { v: 0.9 })) && /隐藏的方向 λ/.test(R("q_bell", { src: "lhv" })), "Bell：回合数、光子源、可见度跟着参数变");
  ok(/1024 个盒子/.test(R("q_search")) && /正好藏着 1 个奖品/.test(R("q_search")) && /1 到 16 之间/.test(R("q_search", { mk: "unknown", M: 16 })) && /0\.05 的概率退相干/.test(R("q_search", { eps: 0.05 })) && /预算 4096 次/.test(R("q_search")), "搜索：盒子数、奖品数、退相干、预算");
  ok(/50% 的概率是真的/.test(R("q_bomb")) && /0\.01 的概率被吸收/.test(R("q_bomb")) && /光路是完美的/.test(R("q_bomb", { eps: 0 })) && /扣 10 分/.test(R("q_bomb", { c: 10 })) && /最多 300 步/.test(R("q_bomb")), "炸弹：比例、损耗、代价、步数");
  const ids = new Set(); for (const L of [G.games.q_bell, G.games.q_search, G.games.q_bomb]) (L.see.match(/⟪([^⟫|]+)/g) || []).forEach(m => ids.add(m.slice(1)));
  ok([...ids].every(id => G.live[id]), "正文里每个 ⟪…⟫ 都登记过", [...ids].filter(id => !G.live[id]).join());
  for (const id of [...ids]) { const sp = G.live[id], w = QL.WORLDS[sp.cell[0]]; ok(w && w.scenes.some(s => s.name === sp.cell[1]) && QS.some(s => s.id === sp.cell[2]), "现算 " + id + "：场景和规则都存在"); }
  ok(G.checks.filter(c => /^⑮|^⑯|^⑰/.test(c.group)).length === 13, "三套量子玩法的自检一共 13 条");
  // 规则说明里的数
  const S = Object.fromEntries(QS.map(s => [s.id, s.explain.optimal + s.explain.test + s.explain.fails]));
  ok(/0\.747/.test(S.bell_phi) && /0\.854/.test(S.bell_phi) && /0\.677/.test(S.bell_q) && /22\.7/.test(S.srch_fixed) && /171/.test(S.srch_fixed) && /0\.945/.test(S.bomb_best) && /28/.test(S.bomb_best) && /0\.53/.test(S.bomb_zeno) && /0\.78/.test(S.bomb_zeno), "规则说明里引用的数都在");
  const all = []; (function walk(o) { if (typeof o === "string") all.push(o); else if (o && typeof o === "object") for (const k in o) if (typeof o[k] !== "function") walk(o[k]); })([G.games.q_bell, G.games.q_search, G.games.q_bomb, G.algoNotes.quantum]);
  const odd = all.filter(s => ((s.replace(/\$\$/g, "").match(/\$/g) || []).length % 2) || ((s.match(/\$\$/g) || []).length % 2)); ok(odd.length === 0, "公式的定界符都成对", odd.map(s => s.slice(0, 30)).join(" | "));
  ok(!all.concat(QS.map(s => JSON.stringify(s.explain))).some(s => /\t/.test(s)), "没有混进制表符（转义写错的痕迹）");
}
done();
