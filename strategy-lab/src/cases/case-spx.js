// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据分析案例四：标普 500 的收益能预测吗（真实数据：Shiller 整理的月度数据，1871 年起）。
 * 讲的事：价格水平 vs 收益；原文件把缺失写成 0；月均价制造的自相关（Working 效应）；重叠的长期收益让 t 值虚高（Newey–West）；
 * 样本内显著 ≠ 样本外有用（样本外 R²）；100 个纯噪声信号里也能挑出"显著"的。 */
var QLCASES = (typeof QLCASES !== "undefined" && QLCASES) || [];
var QLCASE_C_SPX = (function () {
  "use strict";
  function ym(i) { return (1871 + Math.floor(i / 12)) + "-" + ("0" + (i % 12 + 1)).slice(-2); }

  /* ---------- 计算 ---------- */
  function prep(ctx) {
    var S = QLCASE_SPX.decode(), n = S.n, i;
    var lastD = -1; for (i = 0; i < n; i++) if (S.D[i] > 0) lastD = i;
    // 含股息的总收益指数：每月加上 D/12（D 是年化的每股股息）；只算到股息还有记录的那个月
    var lt = new Float64Array(lastD + 1); lt[0] = 0;
    for (i = 1; i <= lastD; i++) lt[i] = lt[i - 1] + Math.log((S.P[i] + S.D[i] / 12) / S.P[i - 1]);
    var lp = new Float64Array(n); for (i = 0; i < n; i++) lp[i] = Math.log(S.P[i]);
    ctx.X = { S: S, n: n, lastD: lastD, lt: lt, lp: lp };
  }
  /** 原文件里写成 0 的"缺失"：每列有几个、从哪到哪 */
  function zeros(X) {
    var out = {};
    ["D", "E", "CPI", "LR", "PE10"].forEach(function (k) {
      var a = X.S[k], idx = []; for (var i = 0; i < X.n; i++) if (a[i] === 0) idx.push(i);
      var runs = [], s = null; idx.forEach(function (i, j) { if (s == null) s = i; if (j === idx.length - 1 || idx[j + 1] !== i + 1) { runs.push([s, i]); s = null; } });
      out[k] = { count: idx.length, runs: runs };
    });
    return out;
  }
  /** 价格水平的"预测"：下个月 = 这个月，R² 有多高；对收益做同样的事又如何 */
  function levelVsReturn(X) {
    var S = X.S, y = [], x = [], r1 = [], r0 = [];
    for (var i = 1; i < X.n; i++) { y.push(S.P[i]); x.push(S.P[i - 1]); }
    for (i = 2; i < X.n; i++) { r1.push(X.lp[i] - X.lp[i - 1]); r0.push(X.lp[i - 1] - X.lp[i - 2]); }
    var m = QLCS.mean(y), sse = 0, sst = 0; for (i = 0; i < y.length; i++) { sse += (y[i] - x[i]) * (y[i] - x[i]); sst += (y[i] - m) * (y[i] - m); }
    return { levelR2: 1 - sse / sst, retCorr: QLCS.corr(r1, r0) };
  }
  function monthlyReturns(X) { var r = new Float64Array(X.n - 1); for (var i = 1; i < X.n; i++) r[i - 1] = X.lp[i] - X.lp[i - 1]; return r; }
  /** 随机游走的日价格按月取平均，再算月收益的一阶自相关；理论值 (m² − 1) / (2(2m² + 1)) */
  function working(months, m, rng) {
    var avg = new Float64Array(months), end = new Float64Array(months), w = 0;
    for (var k = 0; k < months; k++) { var s = 0; for (var d = 0; d < m; d++) { w += rng.normal(); s += w; } avg[k] = s / m; end[k] = w; }
    var da = new Float64Array(months - 1), de = new Float64Array(months - 1);
    for (k = 1; k < months; k++) { da[k - 1] = avg[k] - avg[k - 1]; de[k - 1] = end[k] - end[k - 1]; }
    return { avg: QLCS.autocorr(da, 1), end: QLCS.autocorr(de, 1), theory: (m * m - 1) / (2 * (2 * m * m + 1)) };
  }
  /** 动量：过去 12 个月的收益（含最近一个月）与"12−1"（跳过最近一个月）对下个月收益的预测回归 */
  function momentum(X) {
    var lt = X.lt, a = { x: [], y: [] }, b = { x: [], y: [] };
    for (var t = 12; t < X.lastD; t++) { a.x.push(lt[t] - lt[t - 12]); a.y.push(lt[t + 1] - lt[t]); b.x.push(lt[t - 1] - lt[t - 12]); b.y.push(lt[t + 1] - lt[t]); }
    function reg(o) { var rows = QLCS.rowsOf(o.x.length), D = QLCS.design([{ name: "截距", f: function () { return 1; } }, { name: "信号", f: function (i) { return o.x[i]; } }], rows); return QLCS.ols(D, Float64Array.from(o.y), { nw: 1 }); }
    return { m12: reg(a), m121: reg(b) };
  }
  /** 预测回归：未来 h 个月的总收益（对数）对 log(CAPE)；lag：CAPE 用几个月之前的值（盈利公布有滞后）。from：起始年份 */
  function cape(X, h, lag, from) {
    var S = X.S, x = [], y = [], t0 = Math.max(lag, (from - 1871) * 12);
    for (var t = t0; t + h <= X.lastD; t++) { var pe = S.PE10[t - lag]; if (!(pe > 0)) continue; x.push(Math.log(pe)); y.push(X.lt[t + h] - X.lt[t]); }
    var rows = QLCS.rowsOf(x.length), D = QLCS.design([{ name: "截距", f: function () { return 1; } }, { name: "log(CAPE)", f: function (i) { return x[i]; } }], rows);
    var f = QLCS.ols(D, Float64Array.from(y), { nw: Math.max(0, h - 1) });
    return { f: f, x: x, y: y, n: x.length, h: h };
  }
  /** 样本外 R²（Campbell–Thompson）：从 start 年起每个月只用当时已知的数据重新估计，预测下个月的总收益；对照是历史平均 */
  function oos(X, lag, startYear) {
    var S = X.S, pairs = [];
    for (var t = lag; t + 1 <= X.lastD; t++) { var pe = S.PE10[t - lag]; if (pe > 0) pairs.push({ t: t, x: Math.log(pe), y: X.lt[t + 1] - X.lt[t] }); }
    var start = (startYear - 1871) * 12, sxx = 0, sx = 0, sy = 0, sxy = 0, n = 0, em = [], eh = [], ts = [], j = 0;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      // 截至 p.t 时已经知道结果的样本：结果在 s.t + 1 ≤ p.t 的那些
      while (j < i && pairs[j].t + 1 <= p.t) { var q = pairs[j]; sx += q.x; sy += q.y; sxx += q.x * q.x; sxy += q.x * q.y; n++; j++; }
      if (p.t < start || n < 120) continue;
      var b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
      em.push(p.y - (a + b * p.x)); eh.push(p.y - sy / n); ts.push(p.t);
    }
    var se = 0, sh = 0, cum = [], c = 0;
    for (i = 0; i < em.length; i++) { se += em[i] * em[i]; sh += eh[i] * eh[i]; c += eh[i] * eh[i] - em[i] * em[i]; cum.push(c); }
    return { r2: 1 - se / sh, n: em.length, cum: cum, ts: ts };
  }
  /** 100 个纯噪声"信号"去预测下个月的收益：t 值的分布 */
  function noise(X, k, rng) {
    var r = monthlyReturns(X), y = Float64Array.from(r.subarray(1)), rows = QLCS.rowsOf(y.length), ts = [];
    for (var j = 0; j < k; j++) {
      var s = new Float64Array(y.length); for (var i = 0; i < y.length; i++) s[i] = rng.normal();
      var D = QLCS.design([{ name: "截距", f: function () { return 1; } }, { name: "噪声", f: function (i) { return s[i]; } }], rows);
      ts.push(QLCS.ols(D, y).t[1]);
    }
    var big = ts.filter(function (t) { return Math.abs(t) > 2; }).length, mx = 0; ts.forEach(function (t) { if (Math.abs(t) > Math.abs(mx)) mx = t; });
    return { ts: ts, big: big, max: mx };
  }
  var compute = { prep: prep, zeros: zeros, levelVsReturn: levelVsReturn, monthlyReturns: monthlyReturns, working: working, momentum: momentum, cape: cape, oos: oos, noise: noise, ym: ym };

  /* ---------- 页面 ---------- */
  function yearTicks(n) { var t = []; for (var y = 1880; y <= 2020; y += 20) t.push((y - 1871) * 12); return t; }
  var C = {
    id: "spx", tag: "real", title: "标普 500：价格好预测，收益难预测", short: "水平 vs 收益、写成 0 的缺失、月均价的自相关、重叠收益、样本外、多重检验",
    kicker: "Shiller 月度数据 · 1871 年至今",
    interview: "面经原题：“怎么预测明天标普期货的价格？”第一句话就该把问题改成预测**收益**；接着要讲清楚信噪比有多低、怎样检验一个信号是真有预测力还是样本内过拟合。日度数据的版权限制较多，这里用 Shiller 公开的月度数据把同样的道理做一遍。",
    intro: "数据是 Robert Shiller 整理、公开的标普 500 月度数据：指数、股息、盈利、CPI、10 年期国债收益率和周期调整市盈率（CAPE），从 1871 年 1 月开始。",
    prep: prep, compute: compute,
    steps: [
      { kind: 1, title: "预测价格是个伪问题", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, lv = ctx.memo("lv", function () { return levelVsReturn(X); });
        U.md(el, "“下个月的指数 = 这个月的指数”这个“模型”的 $R^2$：");
        U.tiles(el, [{ k: "价格水平：下月 = 本月", v: F.n(lv.levelR2, 4), id: "spxLevelR2", s: "R²" }, { k: "收益：下月的收益和本月的相关系数", v: F.n(lv.retCorr, 3), s: "（这个数第 3 步还要回来看）" }]);
        U.md(el, "价格水平近似随机游走，几乎任何模型的 $R^2$ 都接近 1，但这毫无价值。要预测的是**收益** $r_{t+1}=\\log(P_{t+1}/P_t)$，或者它的方向、它的波动。\n\n" +
          "**指标**：样本外 $R^2$——和“历史平均收益”这个最简单的预测比，均方误差降了多少：$R^2_{\\text{OOS}}=1-\\sum(r_t-\\hat r_t)^2\\big/\\sum(r_t-\\bar r_t)^2$，其中 $\\bar r_t$ 只用 $t$ 之前的数据。月度收益上它哪怕只有 0.5%，换成策略也可能有意义；它可以是负的。\n\n" +
          "**决策**：这个预测用来干什么——调整股票仓位？那最后要看的是扣掉成本以后的收益和风险，不是 $R^2$ 本身。");
      } },
      { kind: 2, title: "读字段说明：平均价、年化股息、写成 0 的缺失", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, z = ctx.memo("zeros", function () { return zeros(X); });
        U.md(el, "- **SP500 是当月每个交易日收盘价的平均**，不是月底的收盘价。第 3 步会看到这一点有多要紧。\n- 股息、盈利是年化的每股值（盈利是季度数据插值到月的，而且公布有几个月的滞后）。\n- PE10（CAPE）= 价格 / 过去十年平均的实际盈利。");
        var NM = { D: "股息", E: "盈利", CPI: "CPI", LR: "10 年期国债收益率", PE10: "CAPE（PE10）" };
        U.table(el, ["列", "值为 0 的月数", "在哪些时段"], ["D", "E", "CPI", "LR", "PE10"].map(function (k) { return [NM[k], F.i(z[k].count), z[k].runs.map(function (r) { return ym(r[0]) + " 至 " + ym(r[1]); }).join("；")]; }), { num: [1], caption: "原文件里写成 0 的值" });
        U.note(el, "**这些 0 都是“缺失”**：CAPE 头十年没有十年的盈利可平均；2023 年以后的股息、盈利、CPI、利率还没更新。直接拿来算，会得到“股息率突然变成 0”“市盈率是 0”这种并不存在的信号，而且它们恰好集中在最近几年——最容易被当成“新现象”。这里的做法：含股息的总收益只算到 " + ym(X.lastD) + "，用到 CAPE 的地方只用大于 0 的月份。", "warn");
      } },
      { kind: 3, title: "厚尾、波动聚集，和一个假的自相关", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, r = ctx.memo("ret", function () { return monthlyReturns(X); }), i;
        var xs = [], ys = []; for (i = 0; i < X.n; i++) { xs.push(i); ys.push(X.S.P[i]); }
        U.chart(el, { x: { domain: [0, X.n], ticks: yearTicks(), fmt: function (v) { return String(1871 + Math.round(v / 12)); } }, panels: [{ y: { label: "指数（对数刻度）", scale: "log" }, layers: [{ kind: "line", x: xs, y: ys, color: "s1", width: 1.4 }] }],
          hover: { tip: function (k) { return { title: ym(xs[k]), rows: [{ name: "指数", value: F.n(ys[k], 2), color: "s1" }] }; } } }, 210, "标普 500 指数");
        var m = QLCS.moments(r);
        U.md(el, "**月收益的分布**：超额峰度 " + F.n(m.kurt, 1) + "（正态分布是 0），也就是厚尾：大跌的月份远比正态分布预期的多。");
        U.chart(el, { x: { label: "月对数收益" }, panels: [{ y: { label: "占比", zero: true, fmt: function (v) { return F.p(v, 0); } }, layers: [QLChart.histLayer(QLCS.hist(r, 60, -0.3, 0.3), "s1")] }] }, 170, "月收益的分布");
        var lags = [], acR = [], acA = [], absr = new Float64Array(r.length); for (i = 0; i < r.length; i++) absr[i] = Math.abs(r[i]);
        for (var k = 1; k <= 24; k++) { lags.push(k); acR.push(QLCS.autocorr(r, k)); acA.push(QLCS.autocorr(absr, k)); }
        var band = 2 / Math.sqrt(r.length);
        U.md(el, "**自相关**：收益本身在滞后 2 期以后都很小、正负不定；**收益的绝对值**（波动）在所有 24 期上都明显为正——波动会聚集，所以“波动好预测、方向难预测”。虚线是 $\\pm2/\\sqrt n$；它是按独立同分布算的，波动聚集时自相关的真实抽样误差更大，所以收益那几根略出界的柱子不必当真。");
        U.chart(el, { x: { label: "滞后（月）", domain: [0.4, 24.6] }, legend: [{ name: "收益", color: "s1", mark: "rect" }, { name: "收益的绝对值", color: "s2", mark: "rect" }],
          panels: [{ y: { label: "自相关" }, layers: [{ kind: "hline", y: 0, color: "muted", width: 1 }, { kind: "hline", y: band, color: "muted", width: 1, dash: [4, 3] }, { kind: "hline", y: -band, color: "muted", width: 1, dash: [4, 3] },
            { kind: "bars", x0: lags.map(function (v) { return v - 0.4; }), x1: lags.map(function (v) { return v; }), y: acR, color: "s1" }, { kind: "bars", x0: lags.map(function (v) { return v; }), x1: lags.map(function (v) { return v + 0.4; }), y: acA, color: "s2" }] }],
          hover: { tip: function (j) { return { title: "滞后 " + lags[j] + " 个月", rows: [{ name: "收益", value: F.n(acR[j], 3), color: "s1" }, { name: "绝对值", value: F.n(acA[j], 3), color: "s2" }] }; } } }, 200, "自相关");
        U.md(el, "但滞后 1 期的自相关是 **" + F.n(acR[0], 3) + "**，远超过 $2/\\sqrt n$。这是“上个月涨，这个月接着涨”的可交易规律吗？");
        U.later(el, function (box) {
          var w = ctx.memo("working", function () { return working(6000, 21, U.rng(5)); });
          U.md(box, "**不是。**它来自第 2 步那句字段说明：价格是**月内的平均**。即使日价格是纯随机游走，相邻两个月平均价的差也会正相关。模拟一下：随机游走、每月 21 个交易日、6000 个月——");
          U.tiles(box, [{ k: "用月均价算的收益：一阶自相关", v: F.n(w.avg, 3), id: "spxWorking" }, { k: "用月底价算的收益", v: F.n(w.end, 3) }, { k: "理论值 (m²−1)/(2(2m²+1))", v: F.n(w.theory, 3), s: "m = 21，m → ∞ 时是 1/4" }]);
          U.more(box, "Working（1960）的推导", "设日价格 $W_d$ 是随机游走，增量 iid、方差 1。第 $k$ 个月的平均价 $\\bar W_k=\\frac1m\\sum_{d=1}^m W_{(k-1)m+d}$。相邻两个月平均价之差 $\\Delta_k=\\bar W_k-\\bar W_{k-1}$ 可以写成增量的加权和：月界前后的增量同时出现在 $\\Delta_k$ 和 $\\Delta_{k+1}$ 里。直接算协方差得\n$$\\operatorname{Var}(\\Delta_k)=\\frac{2m^2+1}{3m},\\qquad \\operatorname{Cov}(\\Delta_k,\\Delta_{k+1})=\\frac{m^2-1}{6m},$$\n所以一阶自相关是 $\\frac{m^2-1}{2(2m^2+1)}$，$m\\to\\infty$ 时趋于 $\\tfrac14$；更高阶的自相关为 0。这和数据里“只有滞后 1 期显著”正好对上。用月底价（或者每月最后一天的收盘价）算收益，这个自相关就消失了。");
          U.note(box, "**教训**：发现一个强得意外的规律时，先去读数据是怎么生成的。这里用月均价做任何“短期动量”“下个月预测”都会被这 0.25 污染（第 5 步）。", "key");
        });
      } },
      { kind: 4, title: "baseline：历史平均", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, r = ctx.memo("ret", function () { return monthlyReturns(X); });
        var m = QLCS.mean(r), s = QLCS.sd(r);
        U.md(el, "下个月收益的 baseline 就是**到目前为止的平均收益**（每个时点只用之前的数据，扩展窗口）。全样本上月收益（这里只算价格，不含股息）的均值是 " + F.p(m, 2) + "、标准差是 " + F.p(s, 2) + "：信号与噪声之比大约是 " + F.n(m / s, 2) + "。\n\n" +
          "把它换成年化的 Sharpe 比，$\\mathrm{SR}\\approx " + F.n(m / s * Math.sqrt(12), 2) + "$；而均值收益的 t 值是 $\\mathrm{SR}_{\\text{每月}}\\sqrt T$。一个年化 Sharpe 为 1 的策略要大约 4 年数据才到 $t\\approx2$。所以在 150 年的数据上，指数“会涨”这件事本身是显著的，但任何**额外的**可预测性都很小。");
      } },
      { kind: 5, title: "候选信号：动量、估值、利率", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, mo = ctx.memo("mom", function () { return momentum(X); });
        U.table(el, ["信号", "背后的假设"], [
          ["过去 12 个月的收益（动量）", "趋势会延续一段时间（投资者反应不足、资金慢慢流入）"],
          ["log(CAPE)", "估值高的时候，未来的长期收益低（均值回复）"],
          ["10 年期国债收益率", "股票要和债券争夺资金：利率高时股票的估值承压"]
        ], {});
        U.md(el, "先看动量：用过去 12 个月的总收益预测下个月的总收益。");
        U.table(el, ["信号", "系数", "t（经典）", "t（Newey–West）"], [
          ["过去 12 个月（含最近一个月）", F.n(mo.m12.beta[1], 4), F.n(mo.m12.t[1], 2), F.n(mo.m12.tNW[1], 2)],
          ["12−1：跳过最近一个月", F.n(mo.m121.beta[1], 4), F.n(mo.m121.t[1], 2), F.n(mo.m121.tNW[1], 2)]
        ], { num: [1, 2, 3] });
        ctx.mom = mo;
        U.md(el, "含最近一个月的版本 t 值很大，跳过最近一个月之后小了很多：一大半“动量”来自第 3 步那个由月均价造成的一阶自相关。用月均价时，至少要跳过最近一个月（学术上的“12−1 动量”本来也这么做，原因是短期反转）。");
      } },
      { kind: 6, title: "预测回归与重叠的长期收益", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, st = ctx.ui;
        U.md(el, "回归未来 $h$ 个月的总收益对当月的 log(CAPE)：$\\sum_{j=1}^{h}r_{t+j}=a+b\\log\\mathrm{CAPE}_t+\\varepsilon_t$。$h$ 越长，$R^2$ 越高——但要看清楚 t 值是怎么来的。");
        U.controls(el, [{ key: "h", type: "seg", label: "预测期", def: 120, options: [[1, "1 个月"], [12, "1 年"], [60, "5 年"], [120, "10 年"]] },
          { key: "lag", type: "seg", label: "CAPE 用几个月前的", def: 0, options: [[0, "当月"], [3, "3 个月前"], [6, "6 个月前"]] }], st, draw);
        var out = U.h("div", { class: "cs-out" }); el.appendChild(out);
        function draw() {
          U.clear(out);
          var c = ctx.memo("cape:" + st.h + ":" + st.lag, function () { return cape(X, st.h, st.lag, 1881); }), f = c.f;
          U.tiles(out, [{ k: "斜率 b", v: F.n(f.beta[1], 3) }, { k: "R²", v: F.n(f.r2, 3), id: "spxCapeR2" }, { k: "t（经典）", v: F.n(f.t[1], 1), id: "spxTOls" }, { k: "t（Newey–West，" + Math.max(0, st.h - 1) + " 阶）", v: F.n(f.tNW[1], 1), id: "spxTNw" },
            { k: "月度样本 / 不重叠的样本", v: F.i(c.n) + " / " + F.i(Math.floor(c.n / st.h)) }]);
          U.chart(out, { x: { label: "log(CAPE)" }, panels: [{ y: { label: "未来 " + st.h + " 个月的对数总收益" }, layers: [{ kind: "points", x: c.x, y: c.y, color: "s1", r: 2, alpha: 0.4 },
            { kind: "line", x: [Math.min.apply(null, c.x), Math.max.apply(null, c.x)], y: [f.beta[0] + f.beta[1] * Math.min.apply(null, c.x), f.beta[0] + f.beta[1] * Math.max.apply(null, c.x)], color: "s2", width: 2 }] }] }, 230, "CAPE 与未来收益");
          if (st.h > 1) U.note(out, "预测期是 " + st.h + " 个月、而样本按月排时，相邻两个样本的未来收益有 " + (st.h - 1) + " 个月是重叠的，误差高度相关。经典的 t 值把 " + F.i(c.n) + " 个样本当成独立的，实际上独立的信息只有约 " + F.i(c.n / st.h) + " 份。Newey–West 标准误把这种相关算进去，t 值一下子小了很多。长期回归的高 $R^2$ 也部分来自这里：估值本身变化很慢，几乎就是一个缓慢的趋势，和同样缓慢的长期收益放在一起，很容易“看起来”相关。", "warn");
        }
        draw();
        U.more(el, "Newey–West 标准误", "回归 $y_t=x_t^\\top\\beta+\\varepsilon_t$，误差可能自相关时，$\\hat\\beta$ 的方差是 $(X^\\top X)^{-1}\\,S\\,(X^\\top X)^{-1}$，其中\n$$S=\\sum_t z_tz_t^\\top+\\sum_{l=1}^{L}\\Big(1-\\frac{l}{L+1}\\Big)\\sum_t\\big(z_tz_{t-l}^\\top+z_{t-l}z_t^\\top\\big),\\qquad z_t=x_t\\hat\\varepsilon_t.$$\nBartlett 权重保证 $S$ 半正定。重叠 $h$ 期的收益，误差的自相关到 $h-1$ 阶为止，所以取 $L=h-1$。");
      } },
      { kind: 7, title: "验证：样本外，以及一百个噪声", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F;
        U.later(el, function (box) {
          var o = ctx.memo("oos", function () { return oos(X, 0, 1950); }), o3 = ctx.memo("oos3", function () { return oos(X, 3, 1950); });
          U.md(box, "**样本外**：从 1950 年起，每个月只用当时已经知道的数据重新估计“下个月收益 ~ log(CAPE)”，预测下个月，再和历史平均比。");
          U.tiles(box, [{ k: "样本外 R²（CAPE 用当月）", v: F.p(o.r2, 2), id: "spxOos", cls: o.r2 > 0 ? "good" : "bad" }, { k: "样本外 R²（CAPE 用 3 个月前）", v: F.p(o3.r2, 2) }, { k: "预测的月数", v: F.i(o.n) }]);
          var xs = o.ts;
          U.chart(box, { x: { domain: [xs[0], xs[xs.length - 1]], ticks: yearTicks().filter(function (t) { return t >= xs[0]; }), fmt: function (v) { return String(1871 + Math.round(v / 12)); } },
            panels: [{ y: { label: "累计的（历史平均的平方误差 − 模型的平方误差）" }, layers: [{ kind: "hline", y: 0, color: "muted", width: 1 }, { kind: "line", x: xs, y: o.cum, color: "s1", width: 1.8 }] }],
            hover: { tip: function (k) { return { title: ym(xs[k]), rows: [{ name: "累计差", value: F.n(o.cum[k] * 1e4, 2) + "（×10⁻⁴）", color: "s1" }] }; } } }, 210, "样本外的累计表现");
          U.md(box, "曲线往上走的时段，模型比历史平均好；往下走则更差。样本内显著的信号，样本外常常只是在某些年代有用、而在另一些年代把赚的都还回去——这是 Goyal 和 Welch（2008）对一大批“预测股市收益”的变量做过的同一种检验。");
          var nz = ctx.memo("noise", function () { return noise(X, 100, U.rng(9)); });
          U.md(box, "**一百个纯噪声**：生成 100 个和收益毫无关系的随机序列，各自去回归下个月的收益。");
          U.chart(box, { x: { label: "噪声信号的 t 值", domain: [-4, 4] }, panels: [{ y: { label: "占比", zero: true, fmt: function (v) { return F.p(v, 0); } }, layers: [{ kind: "vband", x0: -4, x1: -2, color: "s8", alpha: 0.08 }, { kind: "vband", x0: 2, x1: 4, color: "s8", alpha: 0.08 }, QLChart.histLayer(QLCS.hist(nz.ts, 32, -4, 4), "s1")] }] }, 180, "噪声信号的 t 值");
          U.md(box, "有 **" + nz.big + " 个**的 |t| > 2，最大的一个 t = " + F.n(nz.max, 2) + "。只报这一个，它就是一篇“显著”的结果。**试了多少个，就要按多少个来校正**（Bonferroni：显著性水平除以 $m$），并且把挑选过程本身也放进样本外检验里。");
        });
      } },
      { kind: 8, title: "还有哪些坑，以及怎么回答日度的那道题", body: function (ctx, el, U) {
        U.md(el, "- **前视偏差**：Shiller 的盈利是季度数据插值到月的，而且公司公布盈利有几个月的滞后。“当月的 CAPE”在当月其实还算不出来。第 6、7 步可以把 CAPE 改成几个月之前的值再看。\n" +
          "- **数据会修订**：CPI、盈利都有修订；用的应当是当时公布的版本（point-in-time）。\n" +
          "- **结构变化**：会计准则、股息政策（回购取代分红）、指数成分的变化，让 1900 年的 CAPE 和今天的不完全可比。\n" +
          "- **从信号到策略**：预测要变成仓位，还要考虑交易成本、换手、杠杆限制；最后看扣成本后的 Sharpe 和最大回撤，而且同样要样本外。\n\n" +
          "**回到“预测明天的标普期货”**：先把目标改成明天的收益（或方向、或波动）；说明日收益的信噪比极低，样本外 $R^2$ 到 1% 就可能有价值，而波动率因为聚集好预测得多；数据要注意期货换月的拼接、收盘价与结算价的时间、宏观数据的公布时刻；特征可以是隔夜走势、跨资产（国债、VIX、汇率、海外市场）、事件日历；评价用滚动的样本外、扣成本的 Sharpe、各时段的稳定性，并且报告试过多少种方案。");
      } }
    ],
    followups: [
      { q: "怎么预测明天的标普期货价格？", a: "改成预测明天的收益（或方向、波动）。价格水平的 $R^2$ 接近 1 没有意义。然后讲信噪比、特征、前视偏差、换月、按时间的样本外评价和多重检验；见第 8 步。" },
      { q: "一个信号在样本内 t = 4，你信吗？", a: "先问：数据是怎么生成的（月均价会制造自相关）；样本是不是重叠的（要 Newey–West）；试了多少个信号（要多重检验校正）；样本外表现如何（扩展窗口的样本外 $R^2$）；在各个年代是否稳定；有没有经济上的理由。" },
      { q: "为什么长期收益的回归 $R^2$ 那么高？", a: "部分是真的（估值的均值回复），部分是统计假象：未来 $h$ 期收益重叠、误差高度相关，有效样本只有 $n/h$；而且估值本身变化很慢，两个缓慢变化的序列很容易显得相关。按不重叠的样本或 Newey–West 标准误看，证据弱得多。" },
      { q: "为什么说波动比方向好预测？", a: "收益的自相关几乎为 0，但收益绝对值（或平方）的自相关在很多期上显著为正：大波动后面跟着大波动（GARCH 一类模型描述的就是这个）。第 3 步的图里两种柱子差得很明显。" },
      { q: "用这个数据做“下个月动量”会出什么问题？", a: "价格是月内的平均，平均会让相邻月份的收益人为地正相关（理论值约 0.25）。不跳过最近一个月的动量信号，一大半显著性来自这个假象。用月底价或者跳过最近一个月。" }
    ],
    source: "**数据**：github.com/datasets/s-and-p-500 整理的 Robert Shiller 月度数据（`data/data.csv`），按 [ODC-PDDL-1.0](https://opendatacommons.org/licenses/pddl/1-0/)（公有领域）使用；原始数据见 Shiller 的个人主页与《非理性繁荣》。数值不变，原文件里写成 0 的缺失原样保留。",
    handoff: function (ctx) {
      var X = ctx.X, S = X.S, rows = [];
      for (var t = 1; t <= X.lastD; t++) rows.push([ym(t), +(X.lt[t] - X.lt[t - 1]).toFixed(6), S.PE10[t] > 0 ? +Math.log(S.PE10[t]).toFixed(5) : "", S.LR[t] > 0 ? S.LR[t] : ""]);
      return { header: ["date", "log_total_return", "log_cape", "long_rate"], rows: rows, target: "log_total_return", kind: "forecast", time: "date",
        name: "标普 500 月度总收益（来自数据分析案例）", summary: "1871 年 2 月至 " + ym(X.lastD) + " 的月度对数总收益（含股息），真实数据。",
        docs: "来自“数据分析案例”的标普 500 案例。log_total_return 是含股息的月度对数总收益。注意：价格是月内平均价，月收益因此有约 0.25 的人为一阶自相关（Working 效应），时间序列模型会把它当成可预测性。数据：Robert Shiller，经 github.com/datasets/s-and-p-500 整理，ODC-PDDL-1.0。" };
    }
  };
  QLCASES.push(C);
  return C;
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLCASE_C_SPX;
