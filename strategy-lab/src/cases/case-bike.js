// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据分析案例一：共享单车下一小时的租车量（真实数据：华盛顿特区 Capital Bikeshare，2011–2012，逐小时）。
 * 讲的事：目标与指标、缺失的小时不是 0、增长趋势让"历史均值"失效、计数数据用 Poisson、
 * 泄漏（registered + casual = cnt）、按时间切分与随机切分的差别。计算部分（compute）不碰页面，Node 测试直接调用。 */
var QLCASES = (typeof QLCASES !== "undefined" && QLCASES) || [];
var QLCASE_C_BIKE = (function () {
  "use strict";
  var WS_NAME = ["", "晴或少云", "雾或多云", "小雨小雪", "大雨、冰雹或暴雪"];
  var WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  // 划分：训练 2011-01-01 至 2012-06-30（第 0–546 天）；验证 2012 年第三季度（547–638）；测试 2012 年第四季度（639–730）
  var TRAIN_END = 546, VALID_END = 638;

  function dateStr(d) { var t = QLCASE_BIKE.dateOf(d); return t.getUTCFullYear() + "-" + ("0" + (t.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + t.getUTCDate()).slice(-2); }
  function monthOf(d) { return QLCASE_BIKE.dateOf(d).getUTCMonth() + 1; }

  /* ---------- 计算 ---------- */
  function prep(ctx) {
    var B = QLCASE_BIKE.decode(), n = B.n, i;
    var pos = new Int32Array(B.hours).fill(-1); for (i = 0; i < n; i++) pos[B.t[i]] = i;
    function lag(k) { var a = new Float64Array(n); for (var j = 0; j < n; j++) { var t = B.t[j] - k, q = t >= 0 ? pos[t] : -1; a[j] = q >= 0 ? B.cnt[q] : NaN; } return a; }
    var mon = new Int32Array(n); for (i = 0; i < n; i++) mon[i] = monthOf(B.day[i]);
    var X = { B: B, n: n, L1: lag(1), L24: lag(24), L168: lag(168), month: mon, tempC: new Float64Array(n), humP: new Float64Array(n), windK: new Float64Array(n) };
    for (i = 0; i < n; i++) { X.tempC[i] = B.temp[i] * 41; X.humP[i] = B.hum[i] * 100; X.windK[i] = B.wind[i] * 67; }
    var tr = [], va = [], te = [], all = [];
    for (i = 0; i < n; i++) {
      if (!(X.L1[i] === X.L1[i] && X.L24[i] === X.L24[i] && X.L168[i] === X.L168[i])) continue;   // 三个滞后都在的行才进模型（缺的小时没法当 0）
      all.push(i); (B.day[i] <= TRAIN_END ? tr : B.day[i] <= VALID_END ? va : te).push(i);
    }
    X.rows = { train: tr, valid: va, test: te, all: all };
    ctx.X = X;
  }
  /** 缺了记录的连续时段，按长度从大到小 */
  function gaps(X) {
    var B = X.B, out = [];
    for (var i = 1; i < B.n; i++) { var g = B.t[i] - B.t[i - 1] - 1; if (g > 0) out.push({ from: B.t[i - 1] + 1, hours: g }); }
    out.sort(function (a, b) { return b.hours - a.hours || a.from - b.from; });
    return out;
  }
  /** 四个 baseline 在某组行上的 RMSE / MAE（只用训练段的信息） */
  function baselines(X, rows) {
    var B = X.B, tr = X.rows.train, s = 0, i, j;
    for (j = 0; j < tr.length; j++) s += B.cnt[tr[j]]; var m = s / tr.length;
    var cell = {}; tr.forEach(function (r) { var k = B.hr[r] * 2 + B.work[r]; var o = cell[k] || (cell[k] = [0, 0]); o[0] += B.cnt[r]; o[1]++; });
    var y = QLCS.pick(B.cnt, rows), p0 = new Float64Array(rows.length), p1 = new Float64Array(rows.length), p2 = QLCS.pick(X.L168, rows), p3 = QLCS.pick(X.L1, rows);
    for (i = 0; i < rows.length; i++) { var c = cell[B.hr[rows[i]] * 2 + B.work[rows[i]]]; p0[i] = m; p1[i] = c[0] / c[1]; }
    return [
      { id: "mean", name: "训练段的平均值", rmse: QLCS.rmse(y, p0), mae: QLCS.mae(y, p0) },
      { id: "hw", name: "训练段里同一小时 × 是否工作日的平均", rmse: QLCS.rmse(y, p1), mae: QLCS.mae(y, p1) },
      { id: "l168", name: "上周同一小时（季节性朴素）", rmse: QLCS.rmse(y, p2), mae: QLCS.mae(y, p2) },
      { id: "l1", name: "上一小时（持续性）", rmse: QLCS.rmse(y, p3), mae: QLCS.mae(y, p3) }
    ];
  }
  /** 特征列。o：{ hw, weather, month, trend, lags, leak, scale: "count" | "log" }。scale = log 时滞后项和泄漏项取 log(1 + x) */
  function columns(X, o) {
    var B = X.B, cols = [{ name: "截距", f: function () { return 1; } }], h, w, m;
    var lg = o.scale === "log" ? function (v) { return Math.log(1 + v); } : function (v) { return v / 100; };
    if (o.hw) for (h = 0; h < 24; h++) for (w = 0; w < 2; w++) { if (!h && !w) continue; (function (h, w) { cols.push({ name: h + "点·" + (w ? "工作日" : "非工作日"), f: function (i) { return B.hr[i] === h && B.work[i] === w ? 1 : 0; } }); })(h, w); }
    if (o.weather) cols.push(
      { name: "天气：雾或多云", f: function (i) { return B.ws[i] === 2 ? 1 : 0; } },
      { name: "天气：雨雪", f: function (i) { return B.ws[i] >= 3 ? 1 : 0; } },
      { name: "气温（每 10°C，以 20°C 为中心）", f: function (i) { return (X.tempC[i] - 20) / 10; } },
      { name: "气温的平方", f: function (i) { var t = (X.tempC[i] - 20) / 10; return t * t; } },
      { name: "湿度（每 20 个百分点）", f: function (i) { return (X.humP[i] - 60) / 20; } },
      { name: "风速（每 8 km/h）", f: function (i) { return (X.windK[i] - 12) / 8; } });
    if (o.month) for (m = 2; m <= 12; m++) (function (m) { cols.push({ name: m + " 月", f: function (i) { return X.month[i] === m ? 1 : 0; } }); })(m);
    if (o.trend) cols.push({ name: "趋势（每年）", f: function (i) { return B.day[i] / 365; } });
    if (o.lags) cols.push({ name: "上一小时", f: function (i) { return lg(X.L1[i]); } }, { name: "昨天同一小时", f: function (i) { return lg(X.L24[i]); } }, { name: "上周同一小时", f: function (i) { return lg(X.L168[i]); } });
    if (o.leak) cols.push({ name: "registered（泄漏）", f: function (i) { return lg(B.registered[i]); } });
    return cols;
  }
  /** 拟合一个模型：model = "ols" | "logols" | "poisson"；train、test 是行号。返回预测、指标和拟合对象 */
  function fit(X, model, feats, train, test) {
    var B = X.B, cols = columns(X, { hw: feats.hw, weather: feats.weather, month: feats.month, trend: feats.trend, lags: feats.lags, leak: feats.leak, scale: model === "ols" ? "count" : "log" });
    var Dtr = QLCS.design(cols, train), Dte = QLCS.design(cols, test), ytr = QLCS.pick(B.cnt, train), yte = QLCS.pick(B.cnt, test), pred, f, i;
    if (model === "poisson") { f = QLCS.poisson(Dtr, ytr); pred = QLCS.poissonPredict(Dte, f.beta); }
    else if (model === "logols") {
      var lt = new Float64Array(ytr.length); for (i = 0; i < ytr.length; i++) lt[i] = Math.log(1 + ytr[i]);
      f = QLCS.ols(Dtr, lt); var lp = QLCS.predict(Dte, f.beta); pred = new Float64Array(lp.length);
      // 还原到计数：exp(·) − 1 给的是中位数一类的量；乘上残差的 smearing 因子（Duan）才近似均值
      var sm = 0; for (i = 0; i < f.resid.length; i++) sm += Math.exp(f.resid[i]); sm /= f.resid.length;
      for (i = 0; i < lp.length; i++) pred[i] = Math.exp(lp[i]) * sm - 1;
      f.smear = sm;
    } else { f = QLCS.ols(Dtr, ytr); pred = QLCS.predict(Dte, f.beta); }
    var neg = 0; for (i = 0; i < pred.length; i++) if (pred[i] < 0) neg++;
    var safe = new Float64Array(pred.length); for (i = 0; i < pred.length; i++) safe[i] = Math.max(pred[i], 0.5);
    return { f: f, cols: cols, pred: pred, y: yte, rmse: QLCS.rmse(yte, pred), mae: QLCS.mae(yte, pred), dev: QLCS.poissonDev(yte, safe), neg: neg, n: test.length };
  }
  var FULL = { hw: true, weather: true, month: true, trend: true, lags: true, leak: false };
  /** 随机切分（打乱全部行，75% 训练）与按时间切分的对照 */
  function randomVsTime(X, model, feats, rng) {
    var a = QLCS.shuffle(X.rows.all, rng), cut = Math.floor(a.length * 0.75);
    var r = fit(X, model, feats, a.slice(0, cut), a.slice(cut)), t = fit(X, model, feats, X.rows.train, X.rows.test);
    return { random: r, time: t };
  }

  var compute = { prep: prep, gaps: gaps, baselines: baselines, columns: columns, fit: fit, randomVsTime: randomVsTime, FULL: FULL, TRAIN_END: TRAIN_END, VALID_END: VALID_END, dateStr: dateStr };

  /* ---------- 页面 ---------- */
  function dayTicks() { var t = []; for (var y = 2011; y <= 2012; y++) for (var m = 0; m < 12; m += 3) t.push(Math.round((Date.UTC(y, m, 1) - Date.UTC(2011, 0, 1)) / 864e5)); t.push(731); return t; }
  function dayFmt(d) { var t = QLCASE_BIKE.dateOf(Math.round(d)); return t.getUTCFullYear() + "-" + ("0" + (t.getUTCMonth() + 1)).slice(-2); }
  function hourLabel(t) { var d = Math.floor(t / 24), hr = t % 24; return dateStr(d) + " " + ("0" + hr).slice(-2) + ":00"; }

  var C = {
    id: "bike", tag: "real", title: "共享单车：下一小时会有多少人租车", short: "Citi Bike 那一类题的系统版：计数、趋势、泄漏、按时间验证",
    kicker: "华盛顿特区 Capital Bikeshare · 2011–2012 · 逐小时",
    interview: "Two Sigma 的面经里多次出现共享单车题：预测纽约 Citi Bike 某个站点的取车需求、每个车桩的车辆数变化。这个案例先用整个系统的逐小时数据把**需求预测**这一半做完整；站点层面的删失与库存在下一个案例里。",
    intro: "数据是 UCI 公开的 Capital Bikeshare 逐小时记录（两年，17 379 行），带着当时的天气。下面八步就是面试时口头要讲的八步，只是这里每一步都真的算出来。",
    prep: prep, compute: compute,
    steps: [
      { kind: 1, title: "预测什么、给谁用、怎么算好", body: function (ctx, el, U) {
        var X = ctx.X, B = X.B, F = U.F, tot = 0; for (var i = 0; i < B.n; i++) tot += B.cnt[i];
        U.md(el, "**决策**：运营要提前安排调度车和维修人手，所以要知道接下来每个小时全系统大约有多少人租车。\n\n" +
          "**目标变量**：每小时的租车次数 `cnt`（会员 `registered` 加散客 `casual`）。**观测单位**：一个小时。**时间尺度**：下一小时（可以用刚刚过去那一小时的数）；同样的框架也能做“明天这个时候”，只是不能再用上一小时。\n\n" +
          "**指标**：主指标用 RMSE（单位就是“次”，和运营的直觉一致）；因为是计数，另外报 Poisson 偏差。所有模型都在同一批测试小时上比。");
        U.tiles(el, [{ k: "行数（小时）", v: F.i(B.n) }, { k: "时间范围", v: "2011-01-01 至 2012-12-31" }, { k: "两年总租车次数", v: F.i(tot), id: "bikeTotal" }, { k: "平均每小时", v: F.n(tot / B.n, 1) }]);
        var rows = []; for (i = 7; i < 13; i++) rows.push([hourLabel(B.t[i]), WD[B.weekday[i]], B.work[i] ? "是" : "否", WS_NAME[B.ws[i]], F.n(X.tempC[i], 1), F.n(X.humP[i], 0), F.n(X.windK[i], 1), F.i(B.casual[i]), F.i(B.registered[i]), F.i(B.cnt[i])]);
        U.table(el, ["时间", "星期", "工作日", "天气", "气温 °C", "湿度 %", "风速 km/h", "散客", "会员", "合计"], rows, { num: [4, 5, 6, 7, 8, 9], caption: "原始数据的几行（2011 年 1 月 1 日早上）" });
        U.note(el, "这份数据是**整个系统**的合计，不是某一个站点。站点层面多出来的问题（没车时看不到需求、库存有上限）留给下一个案例。", "info");
      } },
      { kind: 2, title: "字段是怎么来的，缺了什么", body: function (ctx, el, U) {
        var X = ctx.X, B = X.B, F = U.F, g = gaps(X), miss = B.hours - B.n, first = 0;
        for (var q = 0; q < B.n; q++) if (B.t[q] < 168) first++;
        U.md(el, "- `casual` 是临时买票的散客，`registered` 是年卡、月卡会员，两者之和恒等于 `cnt`。这一点在第 5 步会变成一个泄漏的陷阱。\n" +
          "- 天气是从当地的气象记录按小时对上的。UCI 发布的是归一化的值（气温除以 41°C、湿度除以 100、风速除以 67），这里已经换回原来的单位。天气分四档：" + WS_NAME.slice(1).map(function (s, k) { return (k + 1) + " = " + s; }).join("，") + "。\n" +
          "- 两年一共 " + F.i(B.hours) + " 个小时，表里只有 " + F.i(B.n) + " 行：**缺了 " + F.i(miss) + " 个小时**。");
        var rows = g.slice(0, 5).map(function (x) { return [hourLabel(x.from), hourLabel(x.from + x.hours - 1), F.i(x.hours)]; });
        U.table(el, ["从", "到", "缺了几个小时"], rows, { num: [2], caption: "最长的五段缺失" });
        U.md(el, "最长的一段从 2012 年 10 月 29 日凌晨开始，正是飓风桑迪登陆美国东岸的时候，当天 Capital Bikeshare 停止了服务；另外两段长的也落在当地的恶劣天气里（2011 年 1 月下旬的暴风雪、8 月底的飓风艾琳）。");
        U.note(el, "**缺一行不等于这一小时没人骑。**系统停了，需求并不是 0，而是没被记录下来。把缺的小时当成 0 去训练，模型会学到“坏天气让需求归零”这种其实是停机造成的规律。这里的做法：缺的小时不补；需要用到“上一小时”“上周同一小时”而那一小时恰好缺了的行，不进模型：一共少了 " + F.i(B.n - X.rows.all.length) + " 行，其中 " + F.i(first) + " 行是第一周（还没有“上周同一小时”）。", "warn");
      } },
      { kind: 3, title: "先看数据长什么样", body: function (ctx, el, U) {
        var X = ctx.X, B = X.B, F = U.F, i;
        // 每日合计与 7 日均值
        var nd = 731, daily = new Float64Array(nd), seen = new Int32Array(nd); for (i = 0; i < B.n; i++) { daily[B.day[i]] += B.cnt[i]; seen[B.day[i]]++; }
        var xs = [], ys = [], ma = []; for (var d = 0; d < nd; d++) { xs.push(d); ys.push(seen[d] ? daily[d] : NaN); var s = 0, c = 0; for (var k = Math.max(0, d - 6); k <= d; k++) if (seen[k]) { s += daily[k]; c++; } ma.push(c ? s / c : NaN); }
        var y1 = 0, y2 = 0; for (d = 0; d < 365; d++) y1 += daily[d]; for (d = 365; d < 731; d++) y2 += daily[d];
        U.md(el, "**每天的租车总数**：两条规律一眼就能看到，季节（夏天多、冬天少）和增长（第二年整体高出一截）。");
        U.chart(el, { x: { domain: [0, 731], ticks: dayTicks(), fmt: dayFmt }, legend: [{ name: "每天合计", color: "neutral" }, { name: "7 天平均", color: "s1" }],
          panels: [{ y: { label: "次/天", zero: true }, layers: [{ kind: "line", x: xs, y: ys, color: "neutral", width: 1 }, { kind: "line", x: xs, y: ma, color: "s1", width: 2 }] }],
          hover: { tip: function (j) { return { title: dateStr(j), rows: [{ name: "当天合计", value: F.i(ys[j]), color: "neutral" }, { name: "7 天平均", value: F.i(ma[j]), color: "s1" }] }; } } }, 230, "每天的租车总数");
        U.tiles(el, [{ k: "2011 年平均每天", v: F.i(y1 / 365) }, { k: "2012 年平均每天", v: F.i(y2 / 366) }, { k: "增长", v: F.sp(y2 / 366 / (y1 / 365) - 1, 0), id: "bikeGrowth" }]);
        U.md(el, "**一天之内的形状**：工作日是通勤的双峰（早 8 点、晚 5–6 点），非工作日是午后的一个平缓的峰。这两种形状差得太远，所以“小时”和“是否工作日”必须一起进模型（交互项），不能各放一个。");
        var host = U.h("div"); el.appendChild(host);
        var st = ctx.ui;
        U.controls(host, [{ key: "who", type: "seg", label: "看哪部分人", def: "cnt", options: [["cnt", "全部"], ["registered", "会员"], ["casual", "散客"]] }], st, draw);
        var out = U.h("div"); host.appendChild(out);
        function draw() {
          U.clear(out);
          var col = B[st.who], acc = [[], []], cntw = [[], []], h;
          for (h = 0; h < 24; h++) { acc[0][h] = 0; acc[1][h] = 0; cntw[0][h] = 0; cntw[1][h] = 0; }
          for (var j = 0; j < B.n; j++) { acc[B.work[j]][B.hr[j]] += col[j]; cntw[B.work[j]][B.hr[j]]++; }
          var hx = [], a0 = [], a1 = []; for (h = 0; h < 24; h++) { hx.push(h); a0.push(acc[0][h] / cntw[0][h]); a1.push(acc[1][h] / cntw[1][h]); }
          U.chart(out, { x: { label: "小时", domain: [0, 23] }, legend: [{ name: "工作日", color: "s1" }, { name: "周末与节假日", color: "s2" }],
            panels: [{ y: { label: "平均每小时", zero: true }, layers: [{ kind: "line", x: hx, y: a1, color: "s1", width: 2 }, { kind: "line", x: hx, y: a0, color: "s2", width: 2 }] }],
            hover: { tip: function (k) { return { title: k + " 点", rows: [{ name: "工作日", value: F.n(a1[k], 1), color: "s1" }, { name: "周末与节假日", value: F.n(a0[k], 1), color: "s2" }] }; } } }, 220, "一天之内的平均租车数");
        }
        draw();
        // 离散程度
        var ratios = []; for (var hh = 0; hh < 24; hh++) for (var w = 0; w < 2; w++) { var v = []; X.rows.train.forEach(function (r) { if (B.hr[r] === hh && B.work[r] === w) v.push(B.cnt[r]); }); ratios.push(QLCS.variance(v) / QLCS.mean(v)); }
        var mom = QLCS.moments(B.cnt);
        U.md(el, "**分布**：每小时的租车数严重右偏（偏度 " + F.n(mom.skew, 2) + "），也就是计数数据的典型样子。即使固定了“几点 × 是否工作日”，方差也远大于均值：48 个格子里方差 / 均值的中位数是 **" + F.n(QLCS.median(ratios), 1) + "**（Poisson 分布这个比值是 1）。这叫**过度离散**，第 6 步选模型时要用到。");
        var hs = QLCS.hist(B.cnt, 40, 0, 1000);
        U.chart(el, { x: { label: "一小时的租车数", domain: [0, 1000] }, panels: [{ y: { label: "占比", zero: true, fmt: function (v) { return F.p(v, 0); } }, layers: [QLChart.histLayer(hs, "s1")] }] }, 180, "每小时租车数的分布");
        ctx.dispersion = QLCS.median(ratios);
      } },
      { kind: 4, title: "最简单的几种做法能做到多好", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, bl = ctx.memo("baselines", function () { return baselines(X, X.rows.test); });
        U.md(el, "**测试段**：2012 年第四季度的 " + F.i(X.rows.test.length) + " 个小时（训练段是 2011 年 1 月到 2012 年 6 月，2012 年第三季度留作验证）。下面所有模型都在这批小时上比。");
        U.table(el, ["baseline", "RMSE", "MAE"], bl.map(function (b) { return { cells: [b.name, F.n(b.rmse, 1), F.n(b.mae, 1)], cls: "bl-" + b.id }; }), { num: [1, 2] });
        var best = bl.slice().sort(function (a, b) { return a.rmse - b.rmse; })[0];
        U.md(el, "几点观察：\n\n" +
          "- 只用“同一小时 × 是否工作日的历史平均”已经比总平均好很多，但它系统性地偏低：训练段大半在 2011 年，而测试段的需求高了一截（第 3 步的增长）。\n" +
          "- **上周同一小时**这种季节性朴素预测反而最强（RMSE " + F.n(best.rmse, 1) + "），因为它自动带着最近的水平。后面的模型要打败的就是它。\n" +
          "- “上一小时”也不差，但它在早晚高峰的上升沿和下降沿上一定落后一步。");
        ctx.bestBaseline = best;
      } },
      { kind: 5, title: "特征：每一类背后的假设", body: function (ctx, el, U) {
        var X = ctx.X, B = X.B, F = U.F, i;
        U.table(el, ["类别", "具体的列", "为什么"], [
          ["时间", "小时 × 是否工作日（47 个哑变量）、月份", "通勤结构决定了一天的形状；季节影响整体水平"],
          ["天气", "天气档位、气温及其平方、湿度、风速", "下雨直接压低需求；气温的作用不是线性的（太热也会少）"],
          ["趋势", "从 2011 年初算起的年数", "系统在扩张（新站、新会员），水平逐年抬高"],
          ["滞后", "上一小时、昨天同一小时、上周同一小时", "最近的水平包含了模型没写进去的一切（活动、施工、新站）"]
        ], {});
        // 气温的非线性
        var bins = {}; for (i = 0; i < B.n; i++) { var k = Math.floor(X.tempC[i] / 3) * 3; var o = bins[k] || (bins[k] = [0, 0]); o[0] += B.cnt[i]; o[1]++; }
        var ks = Object.keys(bins).map(Number).sort(function (a, b) { return a - b; }).filter(function (k) { return bins[k][1] >= 40; });
        var bx = ks.map(function (k) { return k + 1.5; }), by = ks.map(function (k) { return bins[k][0] / bins[k][1]; });
        U.md(el, "**气温**：按 3°C 分组看平均每小时的租车数，先升后降，所以模型里放气温和气温的平方。");
        U.chart(el, { x: { label: "气温 °C" }, panels: [{ y: { label: "平均每小时", zero: true }, layers: [{ kind: "line", x: bx, y: by, color: "s1", width: 2 }, { kind: "points", x: bx, y: by, color: "s1", r: 3 }] }],
          hover: { tip: function (j) { return { title: ks[j] + "–" + (ks[j] + 3) + " °C", rows: [{ name: "平均每小时", value: F.n(by[j], 1), color: "s1" }, { name: "小时数", value: F.i(bins[ks[j]][1]) }] }; } } }, 200, "气温与租车数");
        var wsm = [1, 2, 3, 4].map(function (w) { var s = 0, c = 0; for (var j = 0; j < B.n; j++) if (B.ws[j] === w) { s += B.cnt[j]; c++; } return { w: w, m: c ? s / c : NaN, c: c }; });
        U.table(el, ["天气", "平均每小时", "小时数"], wsm.map(function (o) { return [WS_NAME[o.w], F.n(o.m, 1), F.i(o.c)]; }), { num: [1, 2] });
        U.md(el, "“大雨、冰雹或暴雪”只有 " + wsm[3].c + " 个小时，单独估一个系数没有意义，所以和“小雨小雪”合成一档。");
        U.note(el, "**泄漏**：`registered` 和 `casual` 看上去是“很有用的特征”，但它们加起来就是答案，而且在要预测的那一小时开始时根本还不知道。任何在预测时刻拿不到的量都不能当特征。第 6 步可以把它打开，看看泄漏会让成绩好看到什么程度。", "warn");
      } },
      { kind: 6, title: "从线性回归到 Poisson 回归", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, st = ctx.ui;
        U.md(el, "三种模型都用同一组特征、在同一个训练段上拟合、在同一个测试段上评价。可以逐项关掉特征，看看每一类值多少。");
        U.controls(el, [
          { key: "model", type: "seg", label: "模型", def: "poisson", options: [["ols", "线性回归（计数）"], ["logols", "线性回归（log(1+计数)）"], ["poisson", "Poisson 回归"]] },
          { key: "hw", type: "check", label: "小时 × 是否工作日", def: true }, { key: "weather", type: "check", label: "天气", def: true }, { key: "month", type: "check", label: "月份", def: true },
          { key: "trend", type: "check", label: "趋势", def: true }, { key: "lags", type: "check", label: "滞后项（上一小时、昨天、上周）", def: true },
          { key: "leak", type: "check", label: "把 registered 当特征（泄漏，只为了看后果）", def: false }
        ], st, draw);
        var out = U.h("div", { class: "cs-out" }); el.appendChild(out);
        function draw() {
          U.clear(out);
          U.later(out, function (box) {
            var feats = { hw: st.hw, weather: st.weather, month: st.month, trend: st.trend, lags: st.lags, leak: st.leak };
            var key = st.model + JSON.stringify(feats), r = ctx.memo("fit:" + key, function () { return fit(X, st.model, feats, X.rows.train, X.rows.test); });
            var best = ctx.bestBaseline || baselines(X, X.rows.test).sort(function (a, b) { return a.rmse - b.rmse; })[0];
            U.tiles(box, [{ k: "测试段 RMSE", v: F.n(r.rmse, 1), id: "bikeRmse", cls: r.rmse < best.rmse ? "good" : "bad" }, { k: "MAE", v: F.n(r.mae, 1) }, { k: "Poisson 偏差", v: F.n(r.dev, 2) },
              { k: "相对最好的 baseline", v: F.sp(r.rmse / best.rmse - 1, 0), s: best.name }, { k: "负的预测", v: F.i(r.neg) + " 个", cls: r.neg ? "bad" : "" }]);
            if (st.leak) U.note(box, "打开泄漏之后成绩突然变得很好，但这个模型上线以后用不了：预测的那一刻还不知道这一小时会有多少会员来骑。看到“好得不像真的”的结果，第一件事就是查泄漏。", "warn");
            if (st.model === "ols" && r.neg) U.note(box, "线性回归给出了 " + r.neg + " 个负的预测（夜里需求接近 0 的那些小时）。计数不可能是负数；而且各个因素的作用更像是**乘法**（下雨让早高峰少掉的人数比让凌晨少掉的多得多），线性回归是加法。", "warn");
            // 测试段里一周的预测对实际
            var t0 = -1, rows = X.rows.test, idx = [], ys = [], ps = [];
            for (var j = 0; j < rows.length; j++) { var d = X.B.day[rows[j]]; if (d >= 676 && d < 683) { idx.push(X.B.t[rows[j]]); ys.push(r.y[j]); ps.push(r.pred[j]); if (t0 < 0) t0 = X.B.t[rows[j]]; } }
            U.chart(box, { x: { label: "2012 年 11 月 7 日至 13 日（测试段里的一周）", domain: [idx[0], idx[idx.length - 1]], ticks: idx.filter(function (t) { return t % 24 === 0; }), fmt: function (t) { return dateStr(Math.floor(t / 24)).slice(5); } },
              legend: [{ name: "实际", color: "neutral" }, { name: "预测", color: "s1" }],
              panels: [{ y: { label: "次/小时", zero: true }, layers: [{ kind: "line", x: idx, y: ys, color: "neutral", width: 1.5 }, { kind: "line", x: idx, y: ps, color: "s1", width: 1.8 }] }],
              hover: { tip: function (k) { return { title: hourLabel(idx[k]), rows: [{ name: "实际", value: F.i(ys[k]), color: "neutral" }, { name: "预测", value: F.n(ps[k], 0), color: "s1" }] }; } } }, 220, "测试段一周的预测与实际");
            if (st.model === "poisson") {
              var show = ["天气：雾或多云", "天气：雨雪", "趋势（每年）", "上一小时", "昨天同一小时", "上周同一小时"], tr = [];
              var LAGS = ["上一小时", "昨天同一小时", "上周同一小时"];
              r.f.names.forEach(function (nm, k) { if (show.indexOf(nm) >= 0) tr.push([nm, F.n(r.f.beta[k], 3), F.n(r.f.se[k], 3), F.n(r.f.seQ[k], 3), LAGS.indexOf(nm) >= 0 ? "它多 1% → " + F.sp(r.f.beta[k] / 100, 2) : F.sp(Math.exp(r.f.beta[k]) - 1, 0)]); });
              if (tr.length) {
                U.table(box, ["系数", "估计值", "标准误（按 Poisson）", "标准误（准 Poisson）", "对期望租车数的作用"], tr, { num: [1, 2, 3, 4], caption: "Poisson 回归里几个好解释的系数（对数尺度）" });
                U.md(box, "Poisson 回归的系数在对数尺度上：对哑变量和趋势，$e^{\\beta}-1$ 是这个因素让期望租车数变化的比例；滞后项放进去的是 $\\log(1+\\text{滞后})$，系数是弹性（滞后多 1%，期望约多 $\\beta\\%$）。估出来的离散度 $\\hat\\phi=" + F.n(r.f.phi, 1) + "$，也就是方差约为均值的 " + F.n(r.f.phi, 0) + " 倍：按纯 Poisson 算的标准误小了 $\\sqrt{\\hat\\phi}$ 倍，要用准 Poisson（或负二项）的那一列。点预测本身不受影响——只要均值的形式写对了，Poisson 的极大似然对均值仍然是一致的。");
              }
            }
          });
        }
        draw();
        U.more(el, "为什么 Poisson 回归在这里比线性回归自然", "设 $N_t$ 是第 $t$ 小时的租车数，Poisson 回归假设 $E[N_t\\mid x_t]=\\exp(x_t^\\top\\beta)$。\n\n" +
          "- **乘法结构**：$\\exp(x^\\top\\beta)=\\prod_j e^{\\beta_j x_j}$，下雨、冬天、凌晨这些因素是按比例叠加的，这和数据的样子一致。\n" +
          "- **预测恒为正**。\n" +
          "- **方差随均值增大**：Poisson 假设 $\\operatorname{Var}=\\mu$；实际数据是 $\\phi\\mu$ 量级（准 Poisson）。拟合用的估计方程 $\\sum_t x_t\\,(N_t-\\mu_t)=0$ 只依赖均值的形式，所以 $\\phi\\neq1$ 时系数依然一致，只是标准误要乘 $\\sqrt{\\phi}$。\n\n" +
          "拟合用迭代加权最小二乘（IRLS）：每一轮令 $w_t=\\mu_t$、$z_t=\\eta_t+(N_t-\\mu_t)/\\mu_t$，解加权最小二乘 $\\beta\\leftarrow(X^\\top WX)^{-1}X^\\top Wz$，几轮就收敛（它就是 Newton 法）。\n\n" +
          "对 $\\log(1+N)$ 做线性回归也能得到乘法结构，但还原成计数时 $e^{\\hat\\eta}-1$ 偏向中位数，要再乘一个 smearing 因子 $\\frac1n\\sum e^{\\hat\\varepsilon_i}$ 才近似均值（这里已经乘了）。");
      } },
      { kind: 7, title: "验证：切分方式决定了你相信什么", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F;
        U.later(el, function (box) {
          var cmp = ctx.memo("rvt", function () { return randomVsTime(X, "poisson", FULL, U.rng(7)); });
          U.md(box, "同一个模型（Poisson 回归 + 全部特征），两种切法：");
          U.table(box, ["切法", "训练", "测试", "测试 RMSE"], [
            ["随机：打乱全部小时，75% 训练、25% 测试", F.i(X.rows.all.length * 0.75 | 0) + " 小时", F.i(cmp.random.n) + " 小时", F.n(cmp.random.rmse, 1)],
            ["按时间：用 2012 年 6 月以前预测第四季度", F.i(X.rows.train.length) + " 小时", F.i(cmp.time.n) + " 小时", F.n(cmp.time.rmse, 1)]
          ], { num: [3] });
          U.md(box, "随机切分的成绩更好看（" + F.n(cmp.random.rmse, 1) + " 对 " + F.n(cmp.time.rmse, 1) + "）。原因有两个：随机切分时，测试的那一小时的前后几个小时、第二天同一时刻都在训练集里，模型等于见过它的邻居；趋势和季节也被“插值”而不是“外推”。上线以后模型面对的永远是外推，所以**评价要按时间切**。");
          // 按月份的误差
          var r = ctx.memo("fit:valtest", function () { return fit(X, "poisson", FULL, X.rows.train, X.rows.valid.concat(X.rows.test)); });
          var byM = {}, rows = X.rows.valid.concat(X.rows.test);
          rows.forEach(function (row, j) { var m = X.month[row]; var o = byM[m] || (byM[m] = [0, 0]); o[0] += (r.y[j] - r.pred[j]) * (r.y[j] - r.pred[j]); o[1]++; });
          var ms = [7, 8, 9, 10, 11, 12], mv = ms.map(function (m) { return Math.sqrt(byM[m][0] / byM[m][1]); });
          U.md(box, "**误差随时间怎么变**：同一个模型（只用 6 月以前的数据估一次）从 7 月一路预测到 12 月，每个月的 RMSE。这里误差没有随时间明显变大，因为滞后项让模型一直跟着最近的水平；12 月偏小主要是冬天的量本身小。把第 6 步的滞后项关掉，模型就只能靠趋势外推，那时离训练段越远越容易偏。这张图是决定“多久重新训练一次”的依据。");
          U.chart(box, { x: { label: "2012 年的月份", domain: [6.5, 12.5], ticks: ms, fmt: function (v) { return v + " 月"; } }, panels: [{ y: { label: "RMSE", zero: true }, layers: [{ kind: "bars", x0: ms.map(function (m) { return m - 0.35; }), x1: ms.map(function (m) { return m + 0.35; }), y: mv, color: "s1" }] }],
            hover: { tip: function (k) { return { title: ms[k] + " 月", rows: [{ name: "RMSE", value: F.n(mv[k], 1), color: "s1" }, { name: "小时数", value: F.i(byM[ms[k]][1]) }] }; } } }, 190, "按月份的误差");
          // 按小时的平均残差
          var rh = [], ch = []; for (var hh = 0; hh < 24; hh++) { rh[hh] = 0; ch[hh] = 0; }
          cmp.time.y.forEach(function (y, j) { var hr = X.B.hr[X.rows.test[j]]; rh[hr] += y - cmp.time.pred[j]; ch[hr]++; });
          var hx = [], hv = []; for (hh = 0; hh < 24; hh++) { hx.push(hh); hv.push(rh[hh] / ch[hh]); }
          U.md(box, "**残差还剩什么规律**：测试段里按小时平均的残差（实际减预测）。如果某几个小时一直是正的或负的，说明模型漏了东西——比如第四季度天黑得早，傍晚的需求掉得比训练段里快。");
          U.chart(box, { x: { label: "小时", domain: [-0.5, 23.5] }, panels: [{ y: { label: "平均残差（次）" }, layers: [{ kind: "hline", y: 0, color: "muted", width: 1 }, { kind: "bars", x0: hx.map(function (v) { return v - 0.4; }), x1: hx.map(function (v) { return v + 0.4; }), y: hv, color: "s2" }] }],
            hover: { tip: function (k) { return { title: k + " 点", rows: [{ name: "平均残差", value: F.s(hv[k], 1), color: "s2" }] }; } } }, 190, "按小时的平均残差");
        });
      } },
      { kind: 8, title: "这个模型在什么情况下会失效", body: function (ctx, el, U) {
        U.md(el, "- **用的是实测天气**。真正预测下一小时、明天时，手里只有天气**预报**；用实测值评价会偏乐观。上线前应该换成当时的预报重新回测。\n" +
          "- **趋势是线性外推**。系统扩张不是匀速的：新开一批站、调一次价，水平会跳一下。监控残差的均值，偏了就重新拟合，或者让趋势只看最近几个月。\n" +
          "- **全系统的合计掩盖了站点层面的问题**。对调度真正有用的是每个站点的需求，而站点的数据有删失（没车时看不到想骑的人）。见下一个案例。\n" +
          "- **会员和散客的规律不一样**：散客对天气和周末敏感得多。分开建模再相加通常更好，也更好解释。\n" +
          "- **节假日只有 21 天**，单独的效应估不准；可以把节假日当成周末，或者借用别的年份。\n" +
          "- 下一步可以试的：负二项回归（显式建模过度离散）、按预测步长分别评价、给出分位数而不是均值（调度时缺车和闲车的代价不一样）。");
      } }
    ],
    followups: [
      { q: "为什么不用普通的线性回归？", a: "三个原因：计数不能为负，而线性回归会给出负的预测；各因素的作用是乘法的（同样是下雨，早高峰少掉的人比凌晨多得多），对数连接更贴近；方差随均值增大，线性回归的同方差假设不成立。这个案例里，同样的特征，线性回归（计数）在测试段上的 RMSE 比 Poisson 回归高三成左右，还会给出负的预测。" },
      { q: "方差是均值的几十倍，Poisson 回归还能用吗？", a: "点预测能用。Poisson 极大似然的估计方程是 $\\sum_t x_t(N_t-\\mu_t)=0$，只要 $E[N\\mid x]=e^{x^\\top\\beta}$ 写对了，系数就是一致的，不需要方差真的等于均值。要改的是推断：标准误乘 $\\sqrt{\\hat\\phi}$（准 Poisson），或者换成负二项回归。" },
      { q: "随机交叉验证为什么在这里不对？", a: "相邻的小时高度相关，随机切分让测试小时的“邻居”出现在训练集里；趋势和季节被插值而不是外推。上线后面对的是未来，所以按时间切（滚动起点），并且训练和测试之间不能有重叠的滞后窗口。" },
      { q: "缺了 165 个小时，你怎么处理？", a: "先查原因：最长的几段对上了飓风、暴风雪时系统停运。停运的小时不是“需求为 0”，不能补 0；它们直接不进训练。需要滞后项而滞后那一小时恰好缺了的行也去掉。真要补，应该用模型预测值补，并且在评价时排除这些小时。" },
      { q: "如果要预测的是“明天这个时候”而不是下一小时？", a: "去掉“上一小时”这个特征（预测时刻还拿不到），只用昨天、上周同一小时和日历、天气预报；按预测步长分别评价，因为误差会随步长变大。" },
      { q: "业务说缺车比闲车贵得多，模型要怎么改？", a: "不再预测均值，改为预测需求分布的某个分位数：缺一辆车的代价是 $c_u$、多一辆闲车是 $c_o$ 时，最优的备车量是 $\\tau^*=c_u/(c_u+c_o)$ 分位数，评价用分位数损失。下一个案例的最后一步就做了这个决策。" }
    ],
    source: "**数据**：Fanaee-T, H. (2013). *Bike Sharing* [Dataset]. UCI Machine Learning Repository. [doi:10.24432/C5W894](https://doi.org/10.24432/C5W894)，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用。原始记录来自 Capital Bikeshare 公开的骑行数据，天气来自当地的气象记录。为了嵌进页面重新编码过，数值不变；去掉了能由日期推出的几列和体感温度。",
    handoff: function (ctx) {
      var X = ctx.X, B = X.B, rows = [];
      X.rows.all.forEach(function (i) { rows.push([B.hr[i], B.work[i], B.ws[i], +X.tempC[i].toFixed(2), +X.humP[i].toFixed(0), +X.windK[i].toFixed(3), X.month[i], +(B.day[i] / 365).toFixed(4), X.L1[i], X.L24[i], X.L168[i], B.cnt[i]]); });
      return { header: ["hour", "workingday", "weather", "temp_c", "humidity", "wind_kmh", "month", "years_since_2011", "lag_1h", "lag_24h", "lag_168h", "cnt"], rows: rows,
        target: "cnt", kind: "regression", name: "共享单车逐小时租车量（来自数据分析案例）",
        summary: "Capital Bikeshare 2011–2012 每小时的租车数，带天气、日历和三个滞后项（" + rows.length + " 行）。真实数据，CC BY 4.0。",
        docs: "来自“数据分析案例”的共享单车案例。行是小时，cnt 是要预测的租车数；lag_1h、lag_24h、lag_168h 是上一小时、昨天同一小时、上周同一小时的租车数。注意机器学习实验室默认**随机**切分，成绩会比按时间切分乐观（案例第 7 步讲了为什么）。数据：Fanaee-T (2013), UCI Machine Learning Repository, doi:10.24432/C5W894, CC BY 4.0。" };
    }
  };
  QLCASES.push(C);
  return C;
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLCASE_C_BIKE;
