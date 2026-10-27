// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据分析案例三：房价（真实数据：艾奥瓦州埃姆斯市 2006–2010 年的 2930 笔住宅成交）。
 * 讲的事：为什么取对数、非市场交易与异常值、NA 的两种含义、"控制面积后卧室数系数为负"、共线与方差膨胀因子、
 * 异方差与稳健标准误、复制数据制造的虚假显著、随机切分 / 按时间切分 / 按街区切分的差别。 */
var QLCASES = (typeof QLCASES !== "undefined" && QLCASES) || [];
var QLCASE_C_AMES = (function () {
  "use strict";
  var COND = { Normal: "正常成交", Partial: "新房（完工前售出）", Abnorml: "非正常（法拍、卖空、置换）", Family: "亲属之间", Alloca: "多套打包分摊", AdjLand: "购买相邻地块" };

  /* ---------- 计算 ---------- */
  function prep(ctx) {
    var A = QLCASE_AMES.decode(), n = A.n, i;
    var X = { A: A, n: n, logP: new Float64Array(n), logArea: new Float64Array(n), big: new Uint8Array(n) };
    for (i = 0; i < n; i++) { X.logP[i] = Math.log(A.price[i]); X.logArea[i] = Math.log(A.area[i]); X.big[i] = A.area[i] > 4000 ? 1 : 0; }
    X.nbhds = A.levels.nbhd.slice();
    ctx.X = X;
  }
  /** 选样本：opt.dropBig 去掉面积 > 4000 平方英尺的 5 套；opt.normalOnly 只留正常成交 */
  function sample(X, opt) { var r = []; for (var i = 0; i < X.n; i++) { if (opt.dropBig && X.big[i]) continue; if (opt.normalOnly && X.A.saleCond[i] !== "Normal") continue; r.push(i); } return r; }
  function num(v) { return v === v ? v : 0; }
  /** 特征列。opt.nbhd：街区固定效应；opt.year：成交年份固定效应 */
  function columns(X, opt) {
    var A = X.A, cols = [
      { name: "截距", f: function () { return 1; } },
      { name: "log(地上居住面积)", f: function (i) { return X.logArea[i]; } },
      { name: "整体质量（1–10）", f: function (i) { return A.qual[i]; } },
      { name: "整体状况（1–10）", f: function (i) { return A.cond[i]; } },
      { name: "建成年份（每 10 年）", f: function (i) { return (A.yearBuilt[i] - 1970) / 10; } },
      { name: "翻修年份（每 10 年）", f: function (i) { return (A.yearRemod[i] - 1970) / 10; } },
      { name: "地下室面积（千平方英尺）", f: function (i) { return num(A.bsmtSF[i]) / 1000; } },
      { name: "车库车位", f: function (i) { return num(A.garageCars[i]); } },
      { name: "全卫数", f: function (i) { return A.fullBath[i]; } },
      { name: "半卫数", f: function (i) { return A.halfBath[i]; } },
      { name: "地上卧室数", f: function (i) { return A.bedrooms[i]; } },
      { name: "壁炉数", f: function (i) { return A.fireplaces[i]; } },
      { name: "log(地块面积)", f: function (i) { return Math.log(A.lotArea[i]); } },
      { name: "有中央空调", f: function (i) { return A.centralAir[i] === "Y" ? 1 : 0; } }
    ];
    if (opt.nbhd) cols = cols.concat(QLCS.dummies("街区", X.nbhds, function (i) { return A.nbhd[i]; }));
    if (opt.year) cols = cols.concat(QLCS.dummies("成交年份", [2006, 2007, 2008, 2009, 2010], function (i) { return A.yrSold[i]; }));
    return cols;
  }
  /** 拟合 + 在 test 上预测。target = "log" | "level"。返回 log 尺度的 RMSE（≈ 相对误差）和美元的 RMSE */
  function fitPredict(X, cols, target, train, test) {
    var A = X.A, Dtr = QLCS.design(cols, train), Dte = QLCS.design(cols, test), y = new Float64Array(train.length), i;
    for (i = 0; i < train.length; i++) y[i] = target === "log" ? X.logP[train[i]] : A.price[train[i]];
    var f = QLCS.ols(Dtr, y), p = QLCS.predict(Dte, f.beta), logp = new Float64Array(test.length), usd = new Float64Array(test.length), sm = 1;
    if (target === "log") { sm = 0; for (i = 0; i < f.resid.length; i++) sm += Math.exp(f.resid[i]); sm /= f.resid.length; }
    for (i = 0; i < test.length; i++) {
      if (target === "log") { logp[i] = p[i]; usd[i] = Math.exp(p[i]) * sm; }
      else { usd[i] = p[i]; logp[i] = Math.log(Math.max(p[i], 10000)); }     // 线性模型偶尔给出很小甚至负的价格：按 1 万美元截一下再取对数
    }
    var ly = QLCS.pick(X.logP, test), py = QLCS.pick(A.price, test);
    return { f: f, logp: logp, usd: usd, rmseLog: QLCS.rmse(ly, logp), rmseUsd: QLCS.rmse(py, usd), n: test.length };
  }
  /** k 折交叉验证：返回每一行的样本外预测（log 尺度）和汇总的误差 */
  function cv(X, cols, target, rows, folds) {
    var A = X.A, outLog = {}, outUsd = {};
    folds.forEach(function (fold, k) {
      var inFold = {}; fold.forEach(function (r) { inFold[r] = 1; });
      var train = rows.filter(function (r) { return !inFold[r]; }), res = fitPredict(X, cols, target, train, fold);
      fold.forEach(function (r, j) { outLog[r] = res.logp[j]; outUsd[r] = res.usd[j]; });
    });
    var ly = [], lp = [], py = [], pp = [];
    rows.forEach(function (r) { if (r in outLog) { ly.push(X.logP[r]); lp.push(outLog[r]); py.push(A.price[r]); pp.push(outUsd[r]); } });
    return { rmseLog: QLCS.rmse(ly, lp), rmseUsd: QLCS.rmse(py, pp), predLog: outLog, n: ly.length };
  }
  function foldsOf(rows, rng) { return QLCS.kfold(rows, 5, rng); }
  /** baseline：总体中位数；街区的每平方英尺中位价 × 面积（都只用训练折） */
  function baselineCV(X, rows, folds) {
    var A = X.A, o0 = {}, o1 = {};
    folds.forEach(function (fold) {
      var inFold = {}; fold.forEach(function (r) { inFold[r] = 1; });
      var train = rows.filter(function (r) { return !inFold[r]; }), med = QLCS.median(train.map(function (r) { return X.logP[r]; }));
      var byN = {}, all = []; train.forEach(function (r) { var v = A.price[r] / A.area[r]; (byN[A.nbhd[r]] = byN[A.nbhd[r]] || []).push(v); all.push(v); });
      var medAll = QLCS.median(all), medN = {}; Object.keys(byN).forEach(function (k) { medN[k] = QLCS.median(byN[k]); });
      fold.forEach(function (r) { o0[r] = med; o1[r] = Math.log((medN[A.nbhd[r]] || medAll) * A.area[r]); });
    });
    var y = rows.map(function (r) { return X.logP[r]; });
    return { median: QLCS.rmse(y, rows.map(function (r) { return o0[r]; })), ppsf: QLCS.rmse(y, rows.map(function (r) { return o1[r]; })) };
  }
  /** 卧室数的"悖论"：单独放 vs 和面积一起放，对数与原价两种尺度 */
  function bedroom(X, rows) {
    var A = X.A, one = { name: "截距", f: function () { return 1; } }, bed = { name: "卧室", f: function (i) { return A.bedrooms[i]; } };
    var ly = QLCS.pick(X.logP, rows), py = QLCS.pick(A.price, rows);
    var a = QLCS.ols(QLCS.design([one, bed], rows), ly), b = QLCS.ols(QLCS.design([one, bed, { name: "log面积", f: function (i) { return X.logArea[i]; } }], rows), ly);
    var c = QLCS.ols(QLCS.design([one, bed], rows), py), d = QLCS.ols(QLCS.design([one, bed, { name: "面积", f: function (i) { return A.area[i]; } }], rows), py);
    return { logAlone: a, logWith: b, lvlAlone: c, lvlWith: d, corr: QLCS.corr(QLCS.pick(A.bedrooms, rows), QLCS.pick(A.area, rows)) };
  }
  /** 三种切法：随机 5 折、按时间（2006–2009 训练，2010 测试）、留一个街区（这时不能有街区固定效应） */
  function splits(X, rows, rng) {
    var A = X.A, colsFE = columns(X, { nbhd: true, year: false }), colsNo = columns(X, { nbhd: false, year: false });
    var folds = foldsOf(rows, rng), rand = cv(X, colsFE, "log", rows, folds), randNo = cv(X, colsNo, "log", rows, folds);
    var tr = rows.filter(function (r) { return A.yrSold[r] <= 2009; }), te = rows.filter(function (r) { return A.yrSold[r] === 2010; }), time = fitPredict(X, colsFE, "log", tr, te);
    var byN = {}; rows.forEach(function (r) { (byN[A.nbhd[r]] = byN[A.nbhd[r]] || []).push(r); });
    var lno = cv(X, colsNo, "log", rows, Object.keys(byN).map(function (k) { return byN[k]; }));
    // 留一个街区时，每个街区平均的残差（实际 − 预测）：模型没写进去的“地段”
    var resN = {}; rows.forEach(function (r) { var o = resN[A.nbhd[r]] || (resN[A.nbhd[r]] = [0, 0]); o[0] += X.logP[r] - lno.predLog[r]; o[1]++; });
    return { random: rand, randomNoFE: randNo, time: time, nTrainTime: tr.length, groupNoFE: lno, resN: resN };
  }
  var compute = { prep: prep, sample: sample, columns: columns, fitPredict: fitPredict, cv: cv, foldsOf: foldsOf, baselineCV: baselineCV, bedroom: bedroom, splits: splits };

  /* ---------- 页面 ---------- */
  var C = {
    id: "ames", tag: "real", title: "房价：从一张成交表到一个可信的模型", short: "取对数、异常值、卧室数悖论、共线、异方差、三种切法",
    kicker: "艾奥瓦州埃姆斯市 · 2006–2010 · 2930 笔住宅成交",
    interview: "面经原题：“给你一个初始数据集，预测房价”；另一份是“预测某个城市的租金”，追问模型的输入输出、每个特征的理由、做了哪些假设、假设不成立会怎样。这个案例把这些都在真实的成交记录上做一遍。",
    intro: "数据来自埃姆斯市估价办公室的成交记录，由 Dean De Cock 整理成教学用的数据集（原表 82 列，这里留了 29 列）。每一行是一笔成交：房子的面积、质量、年份、街区，成交的年月、方式和价格。",
    prep: prep, compute: compute,
    steps: [
      { kind: 1, title: "预测什么、用什么尺度评价", body: function (ctx, el, U) {
        var X = ctx.X, A = X.A, F = U.F, rows = [];
        U.md(el, "**决策**：给一套待售的房子估一个价（卖家定价、买家出价、平台给参考价）。**目标变量**：成交价 `SalePrice`。**观测单位**：一笔成交。\n\n" +
          "**指标**：对数价格上的 RMSE。100 万美元的房子差 5 万和 20 万美元的房子差 5 万不是一回事；$\\log\\hat y-\\log y\\approx(\\hat y-y)/y$，所以对数尺度上的误差近似**相对误差**，0.15 大约就是“平均差 15%”。");
        U.tiles(el, [{ k: "成交笔数", v: F.i(A.n) }, { k: "成交年份", v: "2006–2010" }, { k: "价格中位数", v: F.usd(QLCS.median(A.price)), id: "amesMedian" }, { k: "价格均值", v: F.usd(QLCS.mean(A.price)) }]);
        for (var i = 0; i < 6; i++) rows.push([A.nbhd[i], F.i(A.area[i]), A.bedrooms[i], A.qual[i], A.yearBuilt[i], A.yrSold[i] + "-" + ("0" + A.moSold[i]).slice(-2), COND[A.saleCond[i]] || A.saleCond[i], F.i(A.price[i])]);
        U.table(el, ["街区", "居住面积（平方英尺）", "卧室", "质量", "建成", "成交", "成交方式", "价格（美元）"], rows, { num: [1, 2, 3, 4, 7], caption: "原始数据的前几行" });
      } },
      { kind: 2, title: "成交方式、NA 的两种意思", body: function (ctx, el, U) {
        var X = ctx.X, A = X.A, F = U.F, cnt = {}, i;
        for (i = 0; i < A.n; i++) { var c = A.saleCond[i]; (cnt[c] = cnt[c] || []).push(A.price[i]); }
        var order = ["Normal", "Partial", "Abnorml", "Family", "Alloca", "AdjLand"];
        U.table(el, ["成交方式", "笔数", "价格中位数（美元）"], order.map(function (k) { return [COND[k] + "（" + k + "）", F.i(cnt[k].length), F.i(QLCS.median(cnt[k]))]; }), { num: [1, 2], caption: "不同成交方式的价格" });
        U.md(el, "**不是每笔成交都是市场价**：亲属之间的转让、法拍和卖空，价格反映的不是“这套房子值多少”。要估的如果是正常市场上的价格，这些样本要么去掉，要么至少用一个哑变量标出来。新房（完工前售出）的价格按的是交房时的状态，也要单独看。");
        var noGarage = 0, lfMiss = 0; for (i = 0; i < A.n; i++) { if (A.garageType[i] == null) noGarage++; if (!(A.lotFrontage[i] === A.lotFrontage[i])) lfMiss++; }
        U.md(el, "**NA 有两种意思**：车库类型是 NA 的 " + F.i(noGarage) + " 套是**没有车库**（这是一个合法的取值，应当单独成一类）；临街长度是 NA 的 " + F.i(lfMiss) + " 套才是**真的缺了**。数据字典要先读。");
        var big = []; for (i = 0; i < A.n; i++) if (X.big[i]) big.push([F.i(A.area[i]), COND[A.saleCond[i]], F.i(A.price[i])]);
        U.table(el, ["居住面积（平方英尺）", "成交方式", "价格（美元）"], big, { num: [0, 2], caption: "面积超过 4000 平方英尺的 " + big.length + " 套" });
        U.note(el, "整理这份数据的 De Cock 在原文里就提醒过：这 5 套里有 3 套是新房的部分成交，价格远低于它们的面积，**不代表市场**；建议做教学时先去掉面积大于 4000 平方英尺的房子。异常值先问“是错误、是另一种机制，还是真实的极端情况”，再决定怎么处理。", "warn");
      } },
      { kind: 3, title: "分布、面积与地段", body: function (ctx, el, U) {
        var X = ctx.X, A = X.A, F = U.F, st = ctx.ui, i;
        var mp = QLCS.moments(A.price), ml = QLCS.moments(X.logP);
        U.md(el, "**价格的分布**：原价严重右偏（偏度 " + F.n(mp.skew, 2) + "），取对数之后接近对称（偏度 " + F.n(ml.skew, 2) + "）。");
        var host = U.h("div"); el.appendChild(host);
        U.controls(host, [{ key: "scale", type: "seg", label: "尺度", def: "log", options: [["level", "原价"], ["log", "对数价格"]] }], st, draw);
        var out = U.h("div"); host.appendChild(out);
        function draw() {
          U.clear(out);
          var v = st.scale === "log" ? X.logP : A.price, hs = QLCS.hist(v, 40);
          U.chart(out, { x: { label: st.scale === "log" ? "log(价格)" : "价格（美元）" }, panels: [{ y: { label: "占比", zero: true, fmt: function (x) { return F.p(x, 0); } }, layers: [QLChart.histLayer(hs, "s1")] }] }, 180, "价格的分布");
        }
        draw();
        U.md(el, "**面积与价格**（都取对数）：几乎是一条直线，斜率就是“面积每大 1%，价格大约贵多少 %”。红点是面积超过 4000 平方英尺的那 5 套，右下角的 3 个是新房的部分成交。");
        var px = [], py = [], bx = [], by = [];
        for (i = 0; i < A.n; i++) { if (X.big[i]) { bx.push(X.logArea[i]); by.push(X.logP[i]); } else { px.push(X.logArea[i]); py.push(X.logP[i]); } }
        U.chart(el, { x: { label: "log(地上居住面积)" }, legend: [{ name: "成交", color: "neutral", mark: "dot" }, { name: "面积 > 4000", color: "s8", mark: "dot" }],
          panels: [{ y: { label: "log(价格)" }, layers: [{ kind: "points", x: px, y: py, color: "neutral", r: 2, alpha: 0.6 }, { kind: "points", x: bx, y: by, color: "s8", r: 4 }] }] }, 240, "面积与价格");
        var byN = {}; for (i = 0; i < A.n; i++) (byN[A.nbhd[i]] = byN[A.nbhd[i]] || []).push(A.price[i] / A.area[i]);
        var ns = Object.keys(byN).map(function (k) { return { k: k, m: QLCS.median(byN[k]), n: byN[k].length }; }).sort(function (a, b) { return b.m - a.m; });
        U.md(el, "**地段**：同样的面积，不同街区的价格差得很远。下面是每个街区每平方英尺价格的中位数（" + ns.length + " 个街区）。");
        U.chart(el, { x: { domain: [-0.6, ns.length - 0.4], ticks: ns.map(function (_, j) { return j; }), fmt: function (v) { var o = ns[Math.round(v)]; return o ? o.k : ""; }, stagger: true },
          panels: [{ y: { label: "每平方英尺（美元）", zero: true }, layers: [{ kind: "bars", x0: ns.map(function (_, j) { return j - 0.38; }), x1: ns.map(function (_, j) { return j + 0.38; }), y: ns.map(function (o) { return o.m; }), color: "s1" }] }],
          hover: { tip: function (j) { return { title: ns[j].k, rows: [{ name: "每平方英尺中位价", value: F.i(ns[j].m) + " 美元", color: "s1" }, { name: "成交笔数", value: F.i(ns[j].n) }] }; } } }, 230, "各街区每平方英尺的中位价");
        var ys = [2006, 2007, 2008, 2009, 2010].map(function (y) { var v = []; for (var j = 0; j < A.n; j++) if (A.yrSold[j] === y) v.push(A.price[j]); return [String(y), F.i(v.length), F.i(QLCS.median(v))]; });
        U.table(el, ["成交年份", "笔数", "价格中位数（美元）"], ys, { num: [1, 2] });
        U.md(el, "2008 年金融危机前后，这个大学城的房价中位数几乎没动；2010 年的数据只到 7 月。这两点在第 7 步按时间切分时会用到。");
      } },
      { kind: 4, title: "baseline：中位数，和“每平方英尺多少钱”", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F;
        var rows = ctx.memo("rowsBase", function () { return sample(X, { dropBig: true }); });
        var folds = ctx.memo("folds", function () { return foldsOf(rows, U.rng(11)); });
        var b = ctx.memo("baseline", function () { return baselineCV(X, rows, folds); });
        ctx.base = b;
        U.md(el, "评价方式：去掉那 5 套之后的 " + F.i(rows.length) + " 笔成交，随机分成 5 折，每次用 4 折估、1 折测（第 7 步会解释为什么这只是其中一种切法）。");
        U.table(el, ["baseline", "对数 RMSE（≈ 相对误差）"], [["所有成交的中位数", F.n(b.median, 3)], ["所在街区每平方英尺的中位价 × 面积", F.n(b.ppsf, 3)]], { num: [1] });
        U.md(el, "第二个就是中介最常用的估法，已经把误差从 " + F.p(b.median, 0) + " 左右降到 " + F.p(b.ppsf, 0) + " 左右。回归模型要证明自己比“每平方英尺多少钱”好。");
      } },
      { kind: 5, title: "特征：卧室数悖论与共线", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, rows = ctx.memo("rowsBase", function () { return sample(X, { dropBig: true }); }), b = ctx.memo("bedroom", function () { return bedroom(X, rows); });
        U.md(el, "特征按类别想：**面积与格局**（居住面积、地下室、卧室、卫生间、车位）、**质量与年代**（整体质量、状况、建成与翻修年份）、**地段**（街区）、**地块**（地块面积）、**时间**（成交年份）。每一个都要说得出“为什么会影响价格”。");
        U.md(el, "**“控制面积之后，卧室数的系数是负的，正常吗？”**这是房价题最常见的追问。");
        U.table(el, ["回归", "卧室数的系数", "标准误"], [
          ["log(价格) ~ 卧室数", F.s(b.logAlone.beta[1], 3), F.n(b.logAlone.se[1], 3)],
          ["log(价格) ~ 卧室数 + log(面积)", F.s(b.logWith.beta[1], 3), F.n(b.logWith.se[1], 3)],
          ["价格 ~ 卧室数", F.si(b.lvlAlone.beta[1]) + " 美元", F.i(b.lvlAlone.se[1])],
          ["价格 ~ 卧室数 + 面积", F.si(b.lvlWith.beta[1]) + " 美元", F.i(b.lvlWith.se[1])]
        ], { num: [1, 2], caption: "同一个变量，放不放面积，符号相反" });
        U.md(el, "正常。单独放时，卧室多的房子往往也大，系数吸收了面积的作用（遗漏变量偏差）；面积固定时，多一个卧室意味着每个房间更小、格局更挤，于是价格更低。两个变量的相关系数是 " + F.n(b.corr, 2) + "。**系数的含义永远是“其他放进去的变量都不变时”**。");
        U.more(el, "遗漏变量偏差的公式", "真模型 $y=\\beta_0+\\beta_1x_1+\\beta_2x_2+\\varepsilon$，只对 $x_1$ 回归时\n$$\\operatorname{plim}\\hat\\beta_1=\\beta_1+\\beta_2\\,\\frac{\\operatorname{Cov}(x_1,x_2)}{\\operatorname{Var}(x_1)}.$$\n这里 $x_1$ 是卧室数、$x_2$ 是面积：$\\beta_2>0$、$\\operatorname{Cov}>0$，所以单独回归的系数被往上推，盖过了本来是负的 $\\beta_1$。");
        var base0 = ctx.memo("vif0", function () { return QLCS.vif(QLCS.design(columns(X, { nbhd: false, year: false }), rows))[0].vif; });
        var full = ctx.memo("vif", function () { return QLCS.vif(QLCS.design(columns(X, { nbhd: false, year: false }).concat([{ name: "地上房间总数（模型里没放）", f: function (i) { return X.A.rooms[i]; } }]), rows)); });
        U.md(el, "**共线**：方差膨胀因子 $\\mathrm{VIF}_j=1/(1-R_j^2)$，$R_j^2$ 是第 $j$ 个特征对其余特征回归的 $R^2$。VIF 大说明这个系数的方差被共线放大了，单个系数不稳定，但预测不一定受影响。下表最后一行是“地上房间总数”（模型里没有放它）：它和面积、卧室数高度相关，放进来以后面积的 VIF 从 " + U.F.n(base0, 2) + " 升到 " + U.F.n(full[0].vif, 2) + "。");
        U.table(el, ["特征", "VIF"], full.map(function (v) { return { cells: [v.name, F.n(v.vif, 2)], cls: v.vif > 5 ? "warnrow" : "" }; }), { num: [1] });
      } },
      { kind: 6, title: "特征价格模型（hedonic regression）", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F, st = ctx.ui;
        U.md(el, "模型：$\\log P_i=\\alpha_{\\text{街区}(i)}+\\gamma_{\\text{年份}(i)}+x_i^\\top\\beta+\\varepsilon_i$。可以切换下面几项，看误差和系数怎么变。");
        U.controls(el, [
          { key: "target", type: "seg", label: "目标", def: "log", options: [["log", "log(价格)"], ["level", "价格"]] },
          { key: "dropBig", type: "check", label: "去掉面积 > 4000 平方英尺的 5 套", def: true },
          { key: "normalOnly", type: "check", label: "只用正常成交", def: false },
          { key: "nbhd", type: "check", label: "街区固定效应", def: true },
          { key: "year", type: "check", label: "成交年份固定效应", def: true },
          { key: "dup", type: "check", label: "把数据整份复制一次（只看标准误会怎样）", def: false }
        ], st, draw);
        var out = U.h("div", { class: "cs-out" }); el.appendChild(out);
        function draw() {
          U.clear(out);
          U.later(out, function (box) {
            var rows = sample(X, { dropBig: st.dropBig, normalOnly: st.normalOnly }), cols = columns(X, { nbhd: st.nbhd, year: st.year });
            var key = [st.target, st.dropBig, st.normalOnly, st.nbhd, st.year].join(",");
            var res = ctx.memo("cv:" + key, function () { return cv(X, cols, st.target, rows, foldsOf(rows, U.rng(11))); });
            var fitRows = st.dup ? rows.concat(rows) : rows, y = new Float64Array(fitRows.length);
            for (var i = 0; i < fitRows.length; i++) y[i] = st.target === "log" ? X.logP[fitRows[i]] : X.A.price[fitRows[i]];
            var f = ctx.memo("fit:" + key + st.dup, function () { return QLCS.ols(QLCS.design(cols, fitRows), y); });
            var base = ctx.base || baselineCV(X, rows, foldsOf(rows, U.rng(11)));
            U.tiles(box, [{ k: "5 折交叉验证：对数 RMSE", v: F.n(res.rmseLog, 3), id: "amesCv", cls: res.rmseLog < base.ppsf ? "good" : "bad" }, { k: "美元 RMSE", v: F.i(res.rmseUsd) },
              { k: "样本内 R²", v: F.n(f.r2, 3) }, { k: "比“每平方英尺”好", v: F.sp(1 - res.rmseLog / base.ppsf, 0) }, { k: "参与拟合的行", v: F.i(fitRows.length) }]);
            var show = ["log(地上居住面积)", "整体质量（1–10）", "建成年份（每 10 年）", "地下室面积（千平方英尺）", "车库车位", "全卫数", "地上卧室数", "有中央空调"], tr = [];
            var L = st.target === "log", fx = function (v) { return L ? F.n(v, 3) : F.i(v); };
            f.names.forEach(function (nm, k) { if (show.indexOf(nm) < 0) return; tr.push([nm, fx(f.beta[k]), fx(f.se[k]), fx(f.seHC[k]), F.n(f.t[k], 1), L ? (nm.indexOf("log(") === 0 ? "面积 +1% → 价格 " + F.sp(f.beta[k] / 100, 2) : F.sp(Math.exp(f.beta[k]) - 1, 1)) : (nm.indexOf("log(") === 0 ? "面积 +1% → 价格 " + F.si(f.beta[k] / 100) + " 美元" : F.si(f.beta[k]) + " 美元")]); });
            U.table(box, ["系数", "估计值", "经典标准误", "稳健标准误（HC1）", "t（经典）", "含义"], tr, { num: [1, 2, 3, 4], caption: "几个主要的系数（全样本拟合）" });
            if (st.dup) U.note(box, "复制一份之后系数一模一样，标准误都缩小到原来的约 $1/\\sqrt2\\approx0.71$ 倍，t 值放大 $\\sqrt2$ 倍：**重复的样本不带来新信息，却制造出“更显著”**。真实数据里的重复常常是同一套房子被录了两次、同一个用户刷了多次。交叉验证的误差不受影响，是因为这里只复制了拟合用的那份。", "warn");
            if (st.target === "level") U.note(box, "用原价做目标时，大房子的误差把平方损失主导了，误差也随价格变大（异方差）。看下面的图：残差的标准差随拟合值上升；换成对数之后基本是平的。", "info");
            // 残差的标准差随拟合值的变化（五等分）
            var fit = f.fitted, res2 = f.resid, n = fit.length / (st.dup ? 2 : 1), idx = []; for (i = 0; i < n; i++) idx.push(i);
            idx.sort(function (a, b) { return fit[a] - fit[b]; });
            var q = [], qx = []; for (var g = 0; g < 5; g++) { var seg = idx.slice(Math.floor(g * n / 5), Math.floor((g + 1) * n / 5)).map(function (j) { return res2[j]; }); q.push(Math.sqrt(QLCS.mean(seg.map(function (v) { return v * v; })))); qx.push(g + 1); }
            U.chart(box, { x: { label: "按拟合值分成的五组（从便宜到贵）", domain: [0.4, 5.6], ticks: qx }, panels: [{ y: { label: st.target === "log" ? "残差的均方根（log）" : "残差的均方根（美元）", zero: true }, layers: [{ kind: "bars", x0: qx.map(function (v) { return v - 0.35; }), x1: qx.map(function (v) { return v + 0.35; }), y: q, color: "s2" }] }],
              hover: { tip: function (k) { return { title: "第 " + qx[k] + " 组", rows: [{ name: "残差均方根", value: st.target === "log" ? F.n(q[k], 3) : F.i(q[k]), color: "s2" }] }; } } }, 180, "残差随拟合值的变化");
          });
        }
        draw();
        U.more(el, "经典标准误与稳健标准误", "经典的 $\\widehat{\\operatorname{Var}}(\\hat\\beta)=\\hat\\sigma^2(X^\\top X)^{-1}$ 假设每笔成交的误差方差相同。不同时（这里贵的房子误差大），系数仍然无偏，但标准误错了。White 的异方差稳健估计用夹心形式\n$$\\widehat{\\operatorname{Var}}_{\\mathrm{HC1}}(\\hat\\beta)=\\frac{n}{n-p}(X^\\top X)^{-1}\\Big(\\sum_i \\hat\\varepsilon_i^2 x_ix_i^\\top\\Big)(X^\\top X)^{-1},$$\n不需要知道方差是怎么变的。两列差得多，就是异方差的信号。");
      } },
      { kind: 7, title: "验证：随机、按时间、按街区", body: function (ctx, el, U) {
        var X = ctx.X, F = U.F;
        U.later(el, function (box) {
          var rows = ctx.memo("rowsBase", function () { return sample(X, { dropBig: true }); }), s = ctx.memo("splits", function () { return splits(X, rows, U.rng(11)); });
          U.table(box, ["切法", "回答的问题", "对数 RMSE"], [
            ["随机 5 折（带街区固定效应）", "同一批街区、同一段时间里，没见过的一套房子", F.n(s.random.rmseLog, 3)],
            ["按时间：2006–2009 年估，2010 年测（带街区固定效应）", "明年的成交", F.n(s.time.rmseLog, 3)],
            ["随机 5 折（不带街区）", "对照：去掉街区之后", F.n(s.randomNoFE.rmseLog, 3)],
            ["每次留出一整个街区（不带街区）", "一个从没见过的街区", F.n(s.groupNoFE.rmseLog, 3)]
          ], { num: [2], caption: "同样的特征，不同的切法" });
          ctx.splitsRes = s;
          var big = Object.keys(s.resN).map(function (k) { return { k: k, m: s.resN[k][0] / s.resN[k][1], n: s.resN[k][1] }; }).filter(function (o) { return o.n >= 20; }).sort(function (a, b) { return Math.abs(b.m) - Math.abs(a.m); });
          var off5 = big.filter(function (o) { return Math.abs(o.m) > 0.05; });
          U.md(box, "- **按时间切更难**：2010 年的样本只到 7 月、季节构成不同，市场也在变；如果模型是要给明年的成交估价，这一行才是该报的数。\n- **新街区更难**：留出一整个街区时，模型只能靠房子本身的特征，地段的信息没了。这里总体差得不算多，因为质量、面积、年份已经解释了大部分；但成交 20 笔以上的街区里，有 " + off5.length + " 个的平均偏差超过 5%，最大的是 " + big[0].k + "（" + F.sp(Math.exp(big[0].m) - 1, 0) + "），见下面的图。要推广到新区域，就要按组切分，并且把“地段”换成能迁移的特征（到市中心的距离、学区、周边的价格指数）。\n- 随机切分回答的是最容易的那个问题。这几个数字都没错，**错的是报了和用途不一致的那一个**。");
          var resN = s.resN, ks = Object.keys(resN).map(function (k) { return { k: k, m: resN[k][0] / resN[k][1], n: resN[k][1] }; }).sort(function (a, b) { return b.m - a.m; });
          U.md(box, "**留出街区时，每个街区平均被低估或高估了多少**（实际减预测，对数尺度）：这就是模型里没写进去的“地段”。");
          U.chart(box, { x: { domain: [-0.6, ks.length - 0.4], ticks: ks.map(function (_, j) { return j; }), fmt: function (v) { var o = ks[Math.round(v)]; return o ? o.k : ""; }, stagger: true },
            panels: [{ y: { label: "平均残差（log）" }, layers: [{ kind: "hline", y: 0, color: "muted", width: 1 }, { kind: "bars", x0: ks.map(function (_, j) { return j - 0.38; }), x1: ks.map(function (_, j) { return j + 0.38; }), y: ks.map(function (o) { return o.m; }), color: "s2" }] }],
            hover: { tip: function (j) { return { title: ks[j].k, rows: [{ name: "平均残差", value: F.s(ks[j].m, 3) + "（约 " + F.sp(Math.exp(ks[j].m) - 1, 0) + "）", color: "s2" }, { name: "成交笔数", value: F.i(ks[j].n) }] }; } } }, 220, "各街区的平均残差");
        });
      } },
      { kind: 8, title: "这个模型的假设，以及它们不成立时", body: function (ctx, el, U) {
        U.md(el, "- **效应在对数尺度上可加**：面积、质量、地段按比例影响价格。不同街区每平方英尺的溢价可能不一样（交互项），树模型会自动处理这一点。\n" +
          "- **关系不随时间变化**：五年里只用年份的固定效应。市场转向时（利率、经济），系数本身也会变；可以加时间交互，或者只用最近的成交。\n" +
          "- **样本代表要估价的总体**：数据里只有**卖掉的**房子。要给所有房子估价（比如估房产税），没挂牌、没卖掉的房子可能系统性不同。\n" +
          "- **成交彼此独立**：同一街区、同一时期的成交误差相关，标准误要按街区聚类；随机交叉验证也会因此偏乐观。\n" +
          "- **没有泄漏**：这份表里没有成交之后才产生的字段。真实的挂牌数据里常有：成交后的评估价、实际挂牌天数、最终的成交方式——预测成交价时都不能用。\n" +
          "- 数据少（比如只有 500 笔）时：减少特征、加强正则，或者用分层模型让小街区向全市平均收缩。");
      } }
    ],
    followups: [
      { q: "控制面积后卧室数的系数为负，正常吗？", a: "正常。系数的意思是“其他变量不变时”：面积固定，多一个卧室就是每个房间更小。单独放卧室数时，它替面积背了锅（遗漏变量偏差，公式见第 5 步）。" },
      { q: "为什么要对价格取对数？", a: "三个理由：价格右偏，取对数后接近对称；各因素的作用近似按比例（好地段让大房子、小房子都贵一个百分比）；误差随价格增大，对数尺度上基本同方差。还原成价格时，$e^{\\hat\\mu}$ 是中位数，均值要乘 $e^{\\sigma^2/2}$ 或 smearing 因子。" },
      { q: "异常值你怎么处理？", a: "先查原因再处理。这里面积最大的 5 套里有 3 套是新房的部分成交，价格不代表市场，原作者也建议去掉；两套真实的豪宅则要看用途：估的是普通住宅，去掉；要覆盖豪宅，就保留并考虑用稳健的损失。处理前后都报一下，让人看到影响有多大。" },
      { q: "残差的方差随价格变大，怎么办？", a: "对数变换通常就解决了大半；推断用异方差稳健标准误（HC1）；也可以加权最小二乘。点预测不受影响，受影响的是标准误和区间。" },
      { q: "数据只有 500 笔怎么办？", a: "少用特征、加强正则（ridge）、合并稀少的类别；街区用分层模型（随机效应），让样本少的街区向全市平均收缩；评价用重复的交叉验证，并报误差的标准误。" },
      { q: "要给一个新开发的街区估价，你的评价方式要怎么改？", a: "按街区分组切分（每次留出整个街区），因为这才是“没见过的地段”；并且模型里不能依赖街区的哑变量，要换成可以迁移的地段特征。这个案例第 7 步里，这种切法的误差比带街区效应的随机切分大，而且有的街区整体被系统性地高估或低估了 5% 以上。" }
    ],
    source: "**数据**：De Cock, D. (2011). Ames, Iowa: Alternative to the Boston Housing Data as an End of Semester Regression Project. *Journal of Statistics Education* 19(3)，[doi:10.1080/10691898.2011.11889627](https://doi.org/10.1080/10691898.2011.11889627)。原始记录来自埃姆斯市估价办公室。这里的数值取自 R 包 AmesHousing（Max Kuhn）里与原文相同的 `ames_raw`（2930 行），只留了 29 列，数值不变。原作者没有声明许可，用于教学，见 THIRD-PARTY-NOTICES.md。",
    handoff: function (ctx) {
      var X = ctx.X, A = X.A, rows = [];
      for (var i = 0; i < A.n; i++) rows.push([A.nbhd[i], A.area[i], A.bedrooms[i], A.fullBath[i], A.halfBath[i], A.qual[i], A.cond[i], A.yearBuilt[i], A.yearRemod[i], A.bsmtSF[i], A.garageCars[i], A.fireplaces[i], A.lotArea[i], A.centralAir[i], A.saleCond[i], A.yrSold[i], A.price[i]]);
      return { header: ["neighborhood", "living_area_sqft", "bedrooms", "full_baths", "half_baths", "overall_quality", "overall_condition", "year_built", "year_remodeled", "basement_sqft", "garage_cars", "fireplaces", "lot_area_sqft", "central_air", "sale_condition", "year_sold", "SalePrice"], rows: rows,
        target: "SalePrice", kind: "regression", name: "埃姆斯房价（来自数据分析案例）", summary: "艾奥瓦州埃姆斯市 2006–2010 年的 2930 笔住宅成交（真实数据），17 列。",
        docs: "来自“数据分析案例”的房价案例。SalePrice 是成交价（美元），分布右偏：可以想想要不要先取对数（实验室目前直接对原价回归）。sale_condition 不是 Normal 的成交不一定是市场价；面积超过 4000 平方英尺的 5 套里有 3 套是新房的部分成交。数据：De Cock (2011), Journal of Statistics Education 19(3)。" };
    }
  };
  QLCASES.push(C);
  return C;
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLCASE_C_AMES;
