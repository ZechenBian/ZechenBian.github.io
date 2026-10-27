// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据分析案例二：一个车桩的需求与库存（模拟数据，知道真实需求）。
 * 讲的事：观测到的取车数是删失的需求；直接平均、扔掉删失的小时都有偏；用"有车的时间"做暴露量（Poisson offset）可以修正；
 * 怎样在不知道真相时检验修正方法；最后用估出来的需求决定早上补多少车（成本不对称时的分位数决策）。 */
var QLCASES = (typeof QLCASES !== "undefined" && QLCASES) || [];
var QLCASE_C_DOCK = (function () {
  "use strict";
  var TYPES = [["home", "住宅区（早上往外骑）"], ["office", "办公区（早上骑进来）"], ["balanced", "两头均衡"]];
  var DEF = { type: "home", days: 140, cap: 19, target: 10, scale: 1, daySd: 0.25, seed: 1 };

  function opts(ctx) { var o = {}, k; for (k in DEF) o[k] = ctx.ui[k] != null ? ctx.ui[k] : DEF[k]; return o; }
  function newRng(seed, stream) { return new QL_RNG_CTOR(seed, stream || 0, 0); }
  var QL_RNG_CTOR = null;
  function rngCtor() { if (QL_RNG_CTOR) return QL_RNG_CTOR; if (typeof QLCaseApp !== "undefined" && QLCaseApp.U.QL) QL_RNG_CTOR = QLCaseApp.U.QL.RNG; return QL_RNG_CTOR; }
  /** Node 测试里没有页面：由测试把 RNG 构造函数传进来 */
  function setRng(R) { QL_RNG_CTOR = R; }

  /* ---------- 计算 ---------- */
  function run(o, seed) {
    rngCtor();
    return QLCASE_DOCK.simulate({ type: o.type, days: o.days, cap: o.cap, target: o.target, scale: o.scale, daySd: o.daySd, rebalance: true }, newRng(seed != null ? seed : o.seed, 0));
  }
  /** 在 reps 次独立的模拟上看三种估计在某个小时的偏差和误差 */
  function replicate(o, hour, reps) {
    var acc = { naive: [], dropped: [], offset: [] }, truth = [];
    for (var r = 0; r < reps; r++) {
      var sim = run(o, 1000 + r), e = QLCASE_DOCK.estimate(sim, 1);
      truth.push(e.truth[hour]); ["naive", "dropped", "offset"].forEach(function (k) { acc[k].push(e[k][hour]); });
    }
    var out = {};
    ["naive", "dropped", "offset"].forEach(function (k) {
      var b = [], se = 0, nn = 0;
      acc[k].forEach(function (v, i) { if (v === v) { b.push(v - truth[i]); se += (v - truth[i]) * (v - truth[i]); nn++; } });
      out[k] = { bias: QLCS.mean(b), rel: QLCS.mean(b) / QLCS.mean(truth), rmse: Math.sqrt(se / Math.max(1, nn)), n: nn };
    });
    out.truth = QLCS.mean(truth); out.reps = reps;
    return out;
  }
  /** 决策：早上 5 点补到几辆。用三套强度（真实的基准强度、按观测平均估出来的、按暴露量修正的）各自找出最优的 B，再都放到真实的强度下算期望成本 */
  function decide(o, est, cu, co, reps) {
    rngCtor();
    var base = QLCASE_DOCK.rates(o.type, 1, o.scale), from = 6, to = 10;
    function plan(pick) { return QLCASE_DOCK.morningCosts(pick, base.ret, o.cap, from, to, cu, co, reps, newRng(77, 1)).best; }
    var truthCurve = QLCASE_DOCK.morningCosts(base.pick, base.ret, o.cap, from, to, cu, co, reps, newRng(78, 2));
    var naivePick = base.pick.map(function (v, h) { return est.naive[h] === est.naive[h] ? est.naive[h] : v; });
    var offPick = base.pick.map(function (v, h) { return est.offset[h] === est.offset[h] ? est.offset[h] : v; });
    var bN = plan(naivePick), bO = plan(offPick);
    return { curve: truthCurve.costs, best: truthCurve.best, naive: bN, offset: bO, costBest: truthCurve.costs[truthCurve.best], costNaive: truthCurve.costs[bN], costOffset: truthCurve.costs[bO], tau: cu / (cu + co), from: from, to: to };
  }
  var compute = { DEF: DEF, run: run, replicate: replicate, decide: decide, setRng: setRng };

  /* ---------- 页面 ---------- */
  var C = {
    id: "dock", tag: "sim", title: "车桩：没车的时候，需求去哪了", short: "删失的需求、暴露量修正、怎样检验修正、早上补几辆车",
    kicker: "一个共享单车站点 · 模拟数据（知道真实需求）",
    interview: "面经里的原题：预测纽约每个 Citi Bike 车桩的车辆数变化，有哪些因素、怎么建模；第三方题库还追问了“站点没车时观测到的取车数是 0，怎么估计真实需求、怎么验证”。这里用模拟数据，因为只有模拟才知道真相，才能看清每种做法错在哪、错多少。",
    intro: "下面的数据是按一个明确的过程生成的：想取车、想还车的人按 Poisson 过程到达，每天的需求再乘一个随机因子；有车才能取，有空桩才能还；每天 5 点调度车把车数补到目标值。系统只记下成功的取车、还车和站点状态，**没取到车的人不会出现在任何记录里**。",
    prep: function (ctx) {},
    compute: compute,
    steps: [
      { kind: 1, title: "要估计的是需求，不是成交", body: function (ctx, el, U) {
        var F = U.F;
        U.md(el, "**决策**：每天 5 点调度车来的时候，这个站该补到几辆车。**目标变量**：每个小时**想取车的人数**的期望（需求强度 $\\lambda_h$），不是成功取车的次数。两者只在站里一直有车时才一样。\n\n" +
          "**指标**：估计 $\\lambda_h$ 的偏差（和真相比，只有模拟里能算）；决策的期望成本：没取到车的人每个算 $c_u$，10 点时还闲着的车每辆算 $c_o$。");
        U.md(el, "**模拟的设定**（改了之后整个案例重算）：");
        U.controls(el, [
          { key: "type", type: "seg", label: "站点类型", def: DEF.type, options: TYPES },
          { key: "cap", type: "range", label: "车桩数（容量）", def: DEF.cap, min: 9, max: 31, step: 2 },
          { key: "target", type: "range", label: "5 点补到几辆", def: DEF.target, min: 0, max: 31 },
          { key: "scale", type: "range", label: "需求的规模（相对默认）", def: DEF.scale, min: 0.5, max: 2, step: 0.1, fmt: function (v) { return F.n(v, 1) + " 倍"; } },
          { key: "daySd", type: "range", label: "需求的日间波动（对数标准差）", def: DEF.daySd, min: 0, max: 0.6, step: 0.05, fmt: function (v) { return F.n(v, 2); } },
          { key: "seed", type: "range", label: "随机种子", def: DEF.seed, min: 1, max: 50 }
        ], ctx.ui, function () { if (ctx.ui.target > ctx.ui.cap) ctx.ui.target = ctx.ui.cap; ctx.refresh("dock-1"); });
        var o = opts(ctx), sim = ctx.memo("sim", function () { return run(o); }), lost = 0, want = 0, rej = 0, wantR = 0;
        sim.recs.forEach(function (r) { lost += r.wantP - r.pick; want += r.wantP; rej += r.wantR - r.ret; wantR += r.wantR; });
        U.tiles(el, [{ k: "模拟的天数", v: F.i(o.days) }, { k: "想取车的人", v: F.i(want) }, { k: "其中没取到车", v: F.p(lost / want, 1), id: "dockLost", cls: lost / want > 0.1 ? "bad" : "" },
          { k: "想还车却遇到满桩", v: F.p(rej / Math.max(1, wantR), 1) }]);
      } },
      { kind: 2, title: "系统记下了什么，没记下什么", body: function (ctx, el, U) {
        var F = U.F, o = opts(ctx), sim = ctx.memo("sim", function () { return run(o); }), rows = [];
        U.table(el, ["记下的（站点能拿到）", "没记下的（只有模拟知道）"], [
          ["每小时成功取车、还车的次数", "每小时想取车、想还车的人数"],
          ["每小时开始时站里的车数", "需求的真实强度 λ（随小时、工作日、当天的因子变）"],
          ["这一小时里“有车”“桩满”各有多少分钟（站点状态日志）", "没取到车的人去了哪：走路、换站、放弃"],
          ["调度车搬来或拉走了几辆", ""]
        ], {});
        U.md(el, "库存的变化：$B_{t+1}=\\min\\big(K,\\ \\max(0,\\ B_t+A_t-D_t+R_t)\\big)$，$K$ 是车桩数，$A_t$、$D_t$ 是成功的还车、取车，$R_t$ 是调度。$D_t\\le$ 想取车的人数，差的那部分就是**删失**：只知道需求至少是观测到的数。");
        for (var i = 0; i < sim.recs.length && rows.length < 8; i++) { var r = sim.recs[i]; if (r.work && r.hr >= 6 && r.hr <= 10 && r.day < 7) rows.push(["第 " + (r.day + 1) + " 天 " + r.hr + " 点", F.i(r.bikes0), F.i(r.pick), F.i(r.ret), F.n(r.avail, 0), { v: F.i(r.wantP), cls: "god" }, { v: F.n(r.lamP, 1), cls: "god" }]); }
        U.table(el, ["时间", "开始时的车数", "取车", "还车", "有车的分钟", "想取车的人", "真实强度 λ"], rows, { num: [1, 2, 3, 4, 5, 6], caption: "头几个工作日的早高峰（最后两列是上帝视角）" });
        U.note(el, "面试时要**主动问**有没有站点状态的日志（每分钟有几辆车、几个空桩）。只有骑行记录的话，删失的小时根本认不出来；有了它，“这一小时里有车的时间”就是修正需求的关键。", "key");
      } },
      { kind: 3, title: "缺车发生在什么时候", body: function (ctx, el, U) {
        var F = U.F, o = opts(ctx), sim = ctx.memo("sim", function () { return run(o); }), est = ctx.memo("est", function () { return QLCASE_DOCK.estimate(sim, 1); });
        var xs = [], ys = [], bands = [], d0 = 7 * 2, i;
        sim.recs.forEach(function (r) { if (r.day >= d0 && r.day < d0 + 7) { var t = (r.day - d0) * 24 + r.hr; xs.push(t); ys.push(r.bikes0); if (r.avail < 60 - 1e-9) bands.push({ kind: "vband", x0: t, x1: t + 1, color: "s8", alpha: 0.18 }); } });
        U.md(el, "**一周里站内的车数**（每小时开始时），红色的竖条是这一小时里出现过“没车”的时段。");
        U.chart(el, { x: { label: "第 3 周（周一到周日）", domain: [0, 168], ticks: [0, 24, 48, 72, 96, 120, 144, 168], fmt: function (t) { return ["周一", "周二", "周三", "周四", "周五", "周六", "周日", ""][Math.round(t / 24)] || ""; } },
          panels: [{ y: { label: "车数", domain: [0, o.cap + 1] }, layers: bands.concat([{ kind: "hline", y: o.cap, color: "muted", width: 1, dash: [4, 3] }, { kind: "step", x: xs, y: ys, color: "s1", width: 1.8 }]) }],
          hover: { tip: function (k) { return { title: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][Math.floor(xs[k] / 24)] + " " + (xs[k] % 24) + " 点", rows: [{ name: "开始时的车数", value: F.i(ys[k]), color: "s1" }] }; } } }, 220, "一周里站内的车数");
        var hx = [], so = []; for (i = 0; i < 24; i++) { hx.push(i); so.push(est.stockout[i]); }
        U.md(el, "**工作日每个小时出现缺车的比例**：");
        U.chart(el, { x: { label: "小时", domain: [-0.5, 23.5] }, panels: [{ y: { label: "出现过没车的小时占比", domain: [0, 1], fmt: function (v) { return F.p(v, 0); } }, layers: [{ kind: "bars", x0: hx.map(function (v) { return v - 0.4; }), x1: hx.map(function (v) { return v + 0.4; }), y: so, color: "s8" }] }],
          hover: { tip: function (k) { return { title: k + " 点", rows: [{ name: "缺车的比例", value: F.p(so[k], 0), color: "s8" }] }; } } }, 190, "每小时出现缺车的比例");
        var peak = 0; for (i = 1; i < 24; i++) if (so[i] > so[peak]) peak = i;
        U.md(el, "缺车最常见的是 **" + peak + " 点**（" + F.p(so[peak], 0) + " 的工作日这一小时里出现过没车），而且一旦被取空，往往要等到有人把车骑回来才恢复。删失**不是随机的**：它由前面几个小时的需求决定，需求越大的日子越早被取空，而早高峰正是最需要估准的时段。");
      } },
      { kind: 4, title: "直接平均：系统性地低估", body: function (ctx, el, U) {
        var F = U.F, o = opts(ctx), sim = ctx.memo("sim", function () { return run(o); }), est = ctx.memo("est", function () { return QLCASE_DOCK.estimate(sim, 1); });
        var hx = [], i; for (i = 0; i < 24; i++) hx.push(i);
        U.md(el, "最直接的 baseline：每个小时**观测到的取车数的平均**。和上帝视角的真实强度放在一起：");
        U.chart(el, { x: { label: "小时（工作日）", domain: [0, 23] }, legend: [{ name: "真实强度", color: "ink", mark: "dash" }, { name: "观测到的平均", color: "s8" }],
          panels: [{ y: { label: "每小时想取车的人数", zero: true }, layers: [{ kind: "line", x: hx, y: est.truth, color: "ink", width: 1.6, dash: [5, 3] }, { kind: "line", x: hx, y: est.naive, color: "s8", width: 2 }] }],
          hover: { tip: function (k) { return { title: k + " 点", rows: [{ name: "真实强度", value: F.n(est.truth[k], 2), color: "ink" }, { name: "观测到的平均", value: F.n(est.naive[k], 2), color: "s8" }] }; } } }, 220, "真实强度与观测平均");
        var tot = 0, totN = 0; for (i = 0; i < 24; i++) { tot += est.truth[i]; totN += est.naive[i]; }
        var worst = -1; for (i = 0; i < 24; i++) if (est.truth[i] >= 1 && (worst < 0 || est.naive[i] / est.truth[i] < est.naive[worst] / est.truth[worst])) worst = i;
        U.tiles(el, [{ k: "全天需求被低估", v: F.p(1 - totN / tot, 0), id: "dockUnder" }, { k: "低估最多的小时", v: worst + " 点", s: "观测只有真实的 " + F.p(est.naive[worst] / est.truth[worst], 0) }]);
        U.note(el, "用这个数去决定补几辆车，会觉得“早高峰其实没那么多人”，于是补得更少，下一天缺得更多，记录里的需求就显得更低：**删失会自我强化**。", "warn");
      } },
      { kind: 5, title: "能用来修正的信息：有车的时间", body: function (ctx, el, U) {
        var F = U.F, o = opts(ctx), sim = ctx.memo("sim", function () { return run(o); }), pts = [];
        sim.recs.forEach(function (r) { if (r.work && r.hr === 8) pts.push([r.avail, r.pick]); });
        U.md(el, "关键的变量是**这一小时里站内有车的分钟数** $a_t$（来自站点状态日志）。有车的那 $a_t$ 分钟里来取车的人都取到了，没车的时候来的人看不见：需求只在“有车”的时间里被观测。下图是工作日 8 点的每个小时：有车的时间越短，成交越少（点很散，因为每小时来多少人本身是随机的）。");
        U.chart(el, { x: { label: "8 点这一小时里有车的分钟数", domain: [0, 60] }, panels: [{ y: { label: "成功取车数", zero: true }, layers: [{ kind: "points", x: pts.map(function (p) { return p[0]; }), y: pts.map(function (p) { return p[1]; }), color: "s1", r: 3, alpha: 0.6 }] }] }, 210, "有车的时间与取车数");
        U.md(el, "其他有用的特征和需求预测那个案例一样（小时 × 工作日、天气、日历、邻近站点）；站点层面多出来的是：容量、开始时的车数（决定了多快会空）、邻近站点的状态（这一站没车时，需求有一部分会溢出到旁边的站，那边的记录会虚高）。");
      } },
      { kind: 6, title: "三种估计：直接平均、扔掉删失的小时、用暴露量", body: function (ctx, el, U) {
        var F = U.F, o = opts(ctx), sim = ctx.memo("sim", function () { return run(o); }), est = ctx.memo("est", function () { return QLCASE_DOCK.estimate(sim, 1); }), hx = [], i;
        for (i = 0; i < 24; i++) hx.push(i);
        U.md(el, "- **直接平均**：$\\hat\\lambda_h=\\frac1n\\sum_t D_t$。\n- **只用一直有车的小时**：扔掉 $a_t<60$ 的小时再平均。\n- **暴露量修正**（Poisson 回归加 offset $\\log(a_t/60)$）：$\\hat\\lambda_h=\\sum_t D_t\\big/\\sum_t (a_t/60)$。");
        U.chart(el, { x: { label: "小时（工作日）", domain: [0, 23] }, legend: [{ name: "真实强度", color: "ink", mark: "dash" }, { name: "直接平均", color: "s8" }, { name: "只用一直有车的小时", color: "s4" }, { name: "暴露量修正", color: "s3" }],
          panels: [{ y: { label: "每小时想取车的人数", zero: true }, layers: [{ kind: "line", x: hx, y: est.truth, color: "ink", width: 1.6, dash: [5, 3] }, { kind: "line", x: hx, y: est.naive, color: "s8", width: 1.8 }, { kind: "line", x: hx, y: est.dropped, color: "s4", width: 1.8 }, { kind: "line", x: hx, y: est.offset, color: "s3", width: 2.2 }] }],
          hover: { tip: function (k) { return { title: k + " 点", rows: [{ name: "真实", value: F.n(est.truth[k], 2), color: "ink" }, { name: "直接平均", value: F.n(est.naive[k], 2), color: "s8" }, { name: "只用一直有车", value: F.n(est.dropped[k], 2), color: "s4" }, { name: "暴露量修正", value: F.n(est.offset[k], 2), color: "s3" }] }; } } }, 240, "三种估计与真相");
        var hs = [6, 7, 8, 9, 17, 18], rows = hs.map(function (h) { function rel(v) { return v === v ? F.sp(v / est.truth[h] - 1, 0) : "（没有样本）"; } return [h + " 点", F.n(est.truth[h], 2), rel(est.naive[h]), rel(est.dropped[h]), rel(est.offset[h]), F.p(est.stockout[h], 0)]; });
        U.table(el, ["小时", "真实强度", "直接平均", "只用一直有车", "暴露量修正", "缺车的比例"], rows, { num: [1, 2, 3, 4, 5], caption: "相对真相的偏差（这一次模拟）" });
        U.md(el, "“扔掉删失的小时”看起来很稳妥，其实也偏低：留下来的恰好是**需求偶然偏小**、车没被取光的那些小时，这是选择偏差。暴露量修正在需求最集中的小时也最接近真相；剩下的一点误差来自样本少（缺车严重时，有车的时间很短）和下面要说的日间波动。");
        U.more(el, "为什么暴露量修正是对的（以及它什么时候不对）", "设想取车的人按强度 $\\lambda$ 的 Poisson 过程到达，第 $t$ 小时里站内有车的总时长是 $a_t$（小时）。有车时每个来的人都能取到，所以**成功取车**是一个强度为 $\\lambda\\,\\mathbf 1\\{B_s>0\\}$ 的计数过程（$B_s$ 是时刻 $s$ 的车数）。计数过程的似然里和 $\\lambda$ 有关的部分是\n$$\\ell(\\lambda)=\\sum_t\\big(D_t\\log\\lambda-\\lambda a_t\\big)+\\text{常数},$$\n令导数为 0 得 $\\hat\\lambda=\\sum_t D_t/\\sum_t a_t$。这和“$D_t\\sim\\mathrm{Poisson}(\\lambda a_t)$、带 offset $\\log a_t$ 的 Poisson 回归”要最大化的是同一个函数，所以可以直接用 Poisson 回归来做；但严格说 $D_t$ 在给定 $a_t$ 时并不服从 Poisson（$a_t$ 本身取决于取走了多少辆），所以按 Poisson 算的标准误只是近似。这里有一个要紧的条件：$a_t$ 只能取决于**过去**（之前取走了多少、调度补了多少），不能取决于“接下来会来多少人”。Poisson 过程的增量独立，有车与否由过去决定，所以这个条件成立（用鞅的语言：$N(t)-\\lambda\\int_0^t \\mathbf 1\\{B_s>0\\}ds$ 是鞅）。\n\n" +
          "**它什么时候不对**：如果每天的需求强度不一样（天气、活动），需求大的那天更早被取空、$a_t$ 更小，于是 $\\sum D_t/\\sum a_t$ 实际上是按 $a_t$ 加权的平均，偏向需求小的日子。把“需求的日间波动”拉到 0，偏差就消失；拉大，偏差变大。真实数据里的办法是把能观测到的日间因素（天气、日历、邻站的需求）放进 Poisson 回归，让 $\\lambda$ 因日而异：$\\log E[D_t]=\\log a_t+x_t^\\top\\beta$。\n\n" +
          "**只用一直有车的小时为什么偏低**：$D_t$ 大的小时更容易把车取光，于是被扔掉；留下的是 $D_t$ 偏小的样本，$E[D_t\\mid a_t=1]<\\lambda$。");
      } },
      { kind: 7, title: "不知道真相的时候，怎么检验修正方法", body: function (ctx, el, U) {
        var F = U.F, o = opts(ctx);
        U.md(el, "真实数据里没有上帝视角。检验的办法是**在一个已知真相的模拟上跑同一套方法**：用估出来的强度（或者一组合理的假设）生成数据，人为加上同样的删失机制，看方法能不能把真相还原出来，并且多跑几次看误差有多大。下面就是这样做的：同样的设定，换 " + 30 + " 个随机种子，看工作日 8 点的估计。");
        U.later(el, function (box) {
          var rep = ctx.memo("rep8", function () { return replicate(o, 8, 30); });
          U.table(box, ["做法", "平均偏差", "相对偏差", "RMSE"], [
            ["直接平均", F.s(rep.naive.bias, 2), F.sp(rep.naive.rel, 0), F.n(rep.naive.rmse, 2)],
            ["只用一直有车的小时", rep.dropped.n ? F.s(rep.dropped.bias, 2) : "—", rep.dropped.n ? F.sp(rep.dropped.rel, 0) : "—", rep.dropped.n ? F.n(rep.dropped.rmse, 2) : "—"],
            ["暴露量修正", F.s(rep.offset.bias, 2), F.sp(rep.offset.rel, 0), F.n(rep.offset.rmse, 2)]
          ], { num: [1, 2, 3], caption: "工作日 8 点，" + rep.reps + " 次模拟（真实强度的平均是 " + F.n(rep.truth, 2) + "）" });
          ctx.rep8 = rep;
          U.md(box, "在真实数据上也可以做一半：挑出那些**一直有车**的小时（这些小时的成交就是需求），假装它们在某个时刻被取空了——把那之后的取车删掉，再用修正方法估，和原来的数比。这检验的是“修正公式本身”有没有偏差；检验不了的是“需求在没车时是不是还按同样的强度到达”（有人看到 App 上没车就不来了），后者要靠实验，比如在部分日子里多补车，看需求是不是跟着涨。");
        });
      } },
      { kind: 8, title: "决策：早上 5 点补到几辆，以及哪些地方还会出错", body: function (ctx, el, U) {
        var F = U.F, o = opts(ctx), st = ctx.ui;
        U.md(el, "调度车 5 点来，补到 $B$ 辆。6 点到 10 点之间每个没取到车的人代价 $c_u$，10 点时每辆闲着的车代价 $c_o$。如果只有取车没有还车，这就是报童问题：最优的 $B$ 是早高峰净需求的 $\\tau^*=c_u/(c_u+c_o)$ 分位数。这里还车会边走边补，所以直接在模型里模拟每个 $B$ 的期望成本。");
        U.controls(el, [{ key: "ratio", type: "seg", label: "缺一个人 : 闲一辆车", def: 5, options: [[1, "1 : 1"], [2, "2 : 1"], [5, "5 : 1"], [10, "10 : 1"]] }], st, draw);
        var out = U.h("div"); el.appendChild(out);
        function draw() {
          U.clear(out);
          U.later(out, function (box) {
            var sim = ctx.memo("sim", function () { return run(o); }), est = ctx.memo("est", function () { return QLCASE_DOCK.estimate(sim, 1); });
            var d = ctx.memo("decide:" + st.ratio, function () { return decide(o, est, st.ratio, 1, 300); }), bx = [];
            for (var b = 0; b <= o.cap; b++) bx.push(b);
            U.chart(box, { x: { label: "5 点补到的车数 B", domain: [-0.5, o.cap + 0.5] }, legend: [{ name: "期望成本（按真实需求）", color: "s1" }],
              panels: [{ y: { label: "期望成本（闲车 = 1）", zero: true }, layers: [{ kind: "line", x: bx, y: d.curve, color: "s1", width: 2 }, { kind: "vline", x: d.best, color: "s3", width: 2 }, { kind: "vline", x: d.naive, color: "s8", width: 2, dash: [5, 3] }, { kind: "vline", x: d.offset, color: "s4", width: 2, dash: [2, 3] }] }],
              hover: { tip: function (k) { return { title: "B = " + bx[k], rows: [{ name: "期望成本", value: F.n(d.curve[k], 2), color: "s1" }] }; } } }, 220, "补车数与期望成本");
            U.table(box, ["按什么估计来定", "选的 B", "按真实需求的期望成本", "多花了"], [
              ["真实需求（上帝视角）", F.i(d.best), F.n(d.costBest, 2), "—"],
              ["直接平均", F.i(d.naive), F.n(d.costNaive, 2), F.sp(d.costNaive / d.costBest - 1, 0)],
              ["暴露量修正", F.i(d.offset), F.n(d.costOffset, 2), F.sp(d.costOffset / d.costBest - 1, 0)]
            ], { num: [1, 2, 3], caption: "竖线：绿 = 真正最优，红虚线 = 按直接平均，黄点线 = 按暴露量修正" });
            ctx.decision = d;
            var why = d.naive < d.best ? "按直接平均估的需求偏低，于是补得少（" + d.naive + " 辆对 " + d.best + " 辆），多付的成本就是删失的代价；具体差多少，取决于代价比和车桩数（换几个代价比看看）。" :
              d.naive === d.best ? "这一次按直接平均选出来的 B 恰好也是最优的：要么缺车的代价不够高，要么容量先卡住了。把代价比调大、或者把车桩数调多再看。" :
              "这一次按直接平均反而补得更多，通常是模拟的样本太少、某个小时的估计偶然偏高；换几个种子看看。";
            U.md(box, "缺一个人的代价是闲一辆车的 " + st.ratio + " 倍时，$\\tau^*=" + F.n(d.tau, 2) + "$：要补到能覆盖早高峰净需求的 " + F.p(d.tau, 0) + " 分位数。" + why + (d.best >= o.cap ? "最优的 B 已经顶到车桩数 " + o.cap + "：需求再大也补不进更多的车，该谈的是扩容或者白天加一趟调度。" : ""));
          });
        }
        draw();
        U.md(el, "**还会出错的地方**：\n\n" +
          "- **还车也被删失**：桩满了还不进来的人同样看不到，净流量的估计要对“桩满的时间”做同样的修正。\n" +
          "- **需求会溢出**：这一站没车时，一部分人走到旁边的站，邻站的记录虚高；全网一起估，或者把邻站状态放进模型。\n" +
          "- **需求会适应供给**：用户在 App 上看到总是没车，就不再来了。这一部分在数据里永远看不到，只能靠实验（某些天多补车）去测。\n" +
          "- **一个站的数据很少**：一年里同一小时也只有两百多个样本。实际做法是全网一个模型，站点特征（位置、容量、周边类型）加上站点自己的随机效应，让小站向相似的站收缩。");
      } }
    ],
    followups: [
      { q: "观测到的取车数在站点没车时是 0，怎么估计真实需求？怎么验证？", a: "先要站点状态日志，算出每小时有车的时间 $a_t$；在 Poisson 到达下用 $\\log a_t$ 做 offset 的 Poisson 回归（最简单的情形就是 $\\sum D_t/\\sum a_t$）。验证：在已知真相的模拟上跑同一套方法；在真实数据上挑一直有车的小时，人为截断再还原；需求在没车时是否照常到达，只能靠实验。" },
      { q: "扔掉缺车的小时、只用正常的小时，可以吗？", a: "不行，会偏低：缺车的恰好是需求偶然大的小时，扔掉它们是按结果筛样本（选择偏差）。案例第 6 步的表里可以看到它和直接平均一样偏。" },
      { q: "一个站一个模型，还是全网一个模型？", a: "全网一个模型更好：单站数据太少，而且站与站之间可以共享小时、天气、日历的规律。用站点特征加站点的随机效应（或者嵌入），数据少的站会向相似的站收缩；新站也能直接预测。代价是要处理站与站之间的相关（溢出、同一天的天气）。" },
      { q: "附近地铁停运一个月，需求突然涨了，你的系统怎么发现、怎么调整？", a: "监控残差：每天的实际减预测的累积和（CUSUM），或者滚动窗口里残差的均值超过几个标准误就报警。调整：把停运作为特征加进去；让模型更看重最近的数据（指数衰减的权重、更短的训练窗口）；停运结束后再去掉。" },
      { q: "缺车的代价是闲车的 5 倍，目标和指标要怎么改？", a: "不再预测均值，而是预测需求分布的 $\\tau^*=5/6\\approx0.83$ 分位数，评价用分位数损失（pinball loss）或直接用决策的期望成本。第 8 步就是在模拟里对每个补车数算期望成本。" }
    ],
    source: "**数据**：模拟。生成过程写在 `src/cases/sim-dock.js` 里：每小时的强度是按住宅区、办公区、均衡三类站点设定的工作日曲线和一条周末曲线，乘上需求的规模和每天一个均值为 1 的对数正态因子；同样的种子得到逐位相同的数据。之所以用模拟，是因为删失问题只有在知道真相时才能看清每种做法的偏差。",
    handoff: function (ctx) {
      var o = opts(ctx), sim = ctx.memo("sim", function () { return run(o); }), rows = sim.recs.map(function (r) { return [r.day, r.hr, r.work, r.bikes0, +r.avail.toFixed(1), +r.full.toFixed(1), r.ret, r.pick]; });
      return { header: ["day", "hour", "workday", "bikes_at_start", "minutes_with_bikes", "minutes_full", "returns", "pickups"], rows: rows, target: "pickups", kind: "regression",
        name: "车桩的逐小时记录（模拟，来自数据分析案例）", summary: "一个共享单车站点 " + o.days + " 天的逐小时记录（模拟数据，" + rows.length + " 行）。",
        docs: "来自“数据分析案例”的车桩案例（模拟数据）。pickups 是**成功**的取车数：站里没车时想取车的人不会被记下，所以它是删失的需求；minutes_with_bikes 是这一小时里站内有车的分钟数。可以试试：直接预测 pickups，和把 minutes_with_bikes 当特征，差别在哪里。" };
    }
  };
  QLCASES.push(C);
  return C;
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLCASE_C_DOCK;
