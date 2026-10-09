// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（三）：图表架、每张图的画法、参数扫描、杠杆曲线、单路径明细、多策略对比。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, S = A.state, QL = A.QL, F = A.F, P = A.P, G = QLChart.fmtG;
  var CH = A.CH = {}, cards = {};
  function arr(a) { return Array.prototype.slice.call(a); }
  function opt(id) { return S.copt[id] || (S.copt[id] = {}); }
  function per() { return "每" + A.unit(); }
  /** 玩法（不按三种口径计分的那些）：图上的量、轴的名字都要换 */
  function gm() { var w = A.wdef(); return w.game && !w.crit ? w : null; }
  function stepLabel() { var w = A.wdef(); return w.game ? (w.stepUnit || (w.crit ? "步" : w.unit)) : A.unit() === "次" ? "次" : "步"; }
  /** 玩法得分的写法（名字、小数位、是不是"越低越好"） */
  function gdesc() { var w = A.wdef(); return w.game ? w.score(A.wp()) : { name: "", kind: "num", digits: 3 }; }
  function gval(v) { return gdesc().lower ? -v : v; }                      // 画在图上的数："越低越好"的成本取正
  function gtxt(v) { return A.gfmt(gdesc(), v); }
  function benchName() { var r = A.run, b = r && r.game ? r.game.refs.filter(function (x) { return x.bench; })[0] : null; return b ? b.name : A.wdef().benchF === 0 ? "不下注" : "买入持有"; }
  A.shown = function () { return A.isGame() ? S.gcharts : S.charts; };
  A.chartOk = function (id) { var c = CH[id]; return !!c && (!c.when || !!c.when(A.wdef())); };
  A.chartName = function (id) { var c = CH[id], w = A.wdef(); return w.game && c.gname ? c.gname(w) || c.name : c.name; };
  function pricey(w) { return !w.game || !!w.pricePath; }
  function priceOnly(w) { return !w.game; }
  function critOnly(w) { return !w.game || !!w.crit; }
  var OBJ = { growth: "长期增长率", sharpe: "夏普比率", mean: "期望收益", r2: "验证集 R²", score: "得分" };
  function objName(k) { return k === "score" ? (gdesc().lower ? "成本" : "得分") : OBJ[k]; }
  function objFmt(k) { return k === "score" ? function (v) { return A.gfmt(gdesc(), v, true); } : k === "sharpe" ? function (v) { return F(v, 2); } : k === "r2" ? function (v) { return F(v, 4); } : function (v) { return P(v); }; }
  function objTick(k) { if (k === "score") { var g0 = gdesc(); return g0.kind === "prob" || g0.kind === "pct" ? function (v) { return P(v, Math.abs(v) < 0.1 ? 1 : 0); } : null; } return k === "sharpe" || k === "r2" ? null : function (v) { return P(v, Math.abs(v) < 0.1 ? 1 : 0); }; }
  /** 扫描结果里某个口径的数组。得分是"越低越好"的成本时，图上画的是成本本身（正数），找最优仍按得分最高 */
  function swVals(m, k) { if (k === "r2") return m.r2Valid; if (k === "score" && gdesc().lower) { if (!m._cost) m._cost = arr(m.score).map(function (v) { return -v; }); return m._cost; } return m[k]; }
  function swSE(m, k) { return k === "r2" ? null : m[k + "SE"]; }
  function swBetter(k) { return k === "score" && gdesc().lower ? -1 : 1; }   // 这个口径是越大越好（1）还是越小越好（−1）
  function defObj(o) { var w = A.wdef(); if (gm()) return "score"; if (o.obj === "score" || !o.obj) return "growth"; return o.obj; }
  function hasR2(m) { return !!m && !!m.r2Valid && Array.prototype.some.call(m.r2Valid, function (v) { return v === v; }); }
  function pctTick(v) { return P(v, 0); }

  /* ---------- 直方图 ---------- */
  function sortedCopy(a) { return Float64Array.from(a).sort(); }
  function histPair(a, b, bins, tf) {
    var va = [], vb = [], i, zeroA = 0, zeroB = 0;
    for (i = 0; i < a.length; i++) { var x = tf ? (a[i] > 0 ? Math.log(a[i]) : NaN) : a[i]; if (x === x) va.push(x); else zeroA++; }
    if (b) for (i = 0; i < b.length; i++) { var y = tf ? (b[i] > 0 ? Math.log(b[i]) : NaN) : b[i]; if (y === y) vb.push(y); else zeroB++; }
    var all = sortedCopy(va.concat(vb)); if (!all.length) return null;
    var lo = QL.quantileSorted(all, 0.004), hi = QL.quantileSorted(all, 0.996);
    if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
    var pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    return { ha: QL.histogram(va, bins, lo, hi), hb: b ? QL.histogram(vb, bins, lo, hi) : null, lo: lo, hi: hi, zeroA: zeroA, zeroB: zeroB, na: a.length, nb: b ? b.length : 0 };
  }
  function histSpec(hp, o) {
    var n = hp.ha.counts.length, w = (hp.hi - hp.lo) / n, x0 = [], x1 = [], xc = [], ya = [], yb = [], i;
    for (i = 0; i < n; i++) { x0.push(hp.lo + i * w); x1.push(hp.lo + (i + 1) * w); xc.push(hp.lo + (i + 0.5) * w); ya.push(hp.ha.counts[i] / hp.na); if (hp.hb) yb.push(hp.hb.counts[i] / hp.nb); }
    var layers = [{ kind: "bars", x0: x0, x1: x1, y: ya, color: "s1", name: o.nameA }];
    if (hp.hb) layers.push({ kind: "step", x: xc, y: yb, color: "s2", name: o.nameB, width: 2 });
    (o.vlines || []).forEach(function (v) { if (v.x >= hp.lo && v.x <= hp.hi) layers.push(v); });
    return {
      x: { label: o.xLabel, domain: [hp.lo, hp.hi], fmt: o.xfmt }, panels: [{ y: { label: o.yLabel || "路径占比", zero: true, fmt: function (v) { return P(v, v < 0.1 ? 1 : 0); } }, layers: layers }],
      legend: hp.hb ? [{ name: o.nameA, color: "s1", mark: "rect" }, { name: o.nameB, color: "s2", mark: "line" }] : [],
      hover: { xs: xc, bars: true, tip: function (k) { var f = o.xfmt || F, rows = [{ name: o.nameA, color: "s1", mark: "rect", value: P(ya[k], 1) }]; if (hp.hb) rows.push({ name: o.nameB, color: "s2", value: P(yb[k], 1) }); return { title: f(x0[k]) + " 到 " + f(x1[k]), rows: rows }; } }
    };
  }

  /* ---------- 各张图 ---------- */
  CH.equity = {
    name: "净值扇形图", about: "策略净值随时间的分布：中位数、25–75% 和 5–95% 分位带，叠上基准的中位数。", keys: "equity 净值 曲线 fan 分位",
    gname: function (w) { return w.crit ? "" : w.track.name + "怎么走"; },
    controls: function (o, re) { var w = gm(); if (w) return w.money ? [toggle("对数坐标", !!o.glog, function (v) { o.glog = v; re(); })] : []; return [toggle("对数坐标", o.log !== false, function (v) { o.log = v; re(); })]; },
    spec: function (o) {
      var r = A.run; if (!r || !r.eq) return "还没有回测结果";
      var x = arr(r.eq.grid), f = r.eq.fan, b = r.benchFan, one = r.sum.N === 1, layers = [];
      var gw = gm();
      if (gw) {   // 玩法：画各局的平均（很多玩法里这个量只取 0 或 1，中位数没有信息），分位带照旧
        var bn = benchName(), gl = [{ kind: "band", x: x, lo: f.q5, hi: f.q95, color: "s1", alpha: 0.1, name: "你的规则 5–95%" }, { kind: "band", x: x, lo: f.q25, hi: f.q75, color: "s1", alpha: 0.17, name: "你的规则 25–75%" }];
        if (b) gl.push({ kind: "line", x: x, y: b.mean, color: "s2", name: "基准（" + bn + "）的平均", end: "基准" });
        gl.push({ kind: "line", x: x, y: f.mean, color: "s1", name: "你的规则的平均", end: "你的规则" });
        return { x: { label: stepLabel() }, panels: [{ y: { label: gw.track.name, scale: gw.money && o.glog ? "log" : "linear" }, layers: gl }],
          legend: [{ name: "你的规则：各局的平均", color: "s1" }, { name: "5–95% 与 25–75% 分位带", color: "s1", mark: "band" }].concat(b ? [{ name: "基准（" + bn + "）：各局的平均", color: "s2" }] : []),
          hover: { xs: x, dots: function (i) { return [{ y: f.mean[i], color: "s1" }].concat(b ? [{ y: b.mean[i], color: "s2" }] : []); },
            tip: function (i) { var rows = [{ name: "你的规则（平均）", color: "s1", value: F(f.mean[i], 3) }, { name: "5%–95%", color: "s1", mark: "band", value: F(f.q5[i], 2) + " – " + F(f.q95[i], 2) }]; if (b) rows.push({ name: "基准（平均）", color: "s2", value: F(b.mean[i], 3) }); return { title: "第 " + x[i] + " " + stepLabel(), rows: rows }; } } };
      }
      if (!one) layers.push({ kind: "band", x: x, lo: f.q5, hi: f.q95, color: "s1", alpha: 0.1, name: "策略 5–95%" }, { kind: "band", x: x, lo: f.q25, hi: f.q75, color: "s1", alpha: 0.17, name: "策略 25–75%" });
      layers.push({ kind: "hline", y: 1, color: "axis", width: 1 });
      if (b) layers.push({ kind: "line", x: x, y: b.q50, color: "s2", name: one ? "基准" : "基准中位数", end: "基准" });
      layers.push({ kind: "line", x: x, y: f.q50, color: "s1", name: one ? "策略" : "策略中位数", end: "策略" });
      return {
        x: { label: stepLabel() }, panels: [{ y: { label: "净值（初始 = 1）", scale: o.log !== false ? "log" : "linear" }, layers: layers }],
        legend: [{ name: one ? "策略" : "策略中位数", color: "s1" }].concat(one ? [] : [{ name: "5–95% 与 25–75% 分位带", color: "s1", mark: "band" }]).concat(b ? [{ name: one ? "基准" : "基准中位数", color: "s2" }] : []),
        hover: { xs: x, dots: function (i) { return [{ y: f.q50[i], color: "s1" }].concat(b ? [{ y: b.q50[i], color: "s2" }] : []); },
          tip: function (i) { var rows = [{ name: one ? "策略" : "策略中位数", color: "s1", value: F(f.q50[i], 3) }]; if (!one) rows.push({ name: "5%–95%", color: "s1", mark: "band", value: F(f.q5[i], 2) + " – " + F(f.q95[i], 2) }); if (b) rows.push({ name: "基准", color: "s2", value: F(b.q50[i], 3) }); return { title: "第 " + x[i] + " " + stepLabel(), rows: rows }; } }
      };
    },
    foot: function () { return gm() ? "粗线是所有对局的平均，带子是各局之间的差别：带子越宽，一局的结果越靠运气。" : "带子越宽，结果越靠运气。对数坐标下，直线表示恒定的增长率。"; }
  };

  CH.paths = {
    name: "价格路径", about: "这个世界生成的价格：若干条样本路径，加上各时刻的分位带。", keys: "price path 价格 路径 世界", when: pricey,
    controls: function (o, re) { return [toggle("对数坐标", !!o.log, function (v) { o.log = v; re(); })]; },
    spec: function (o) {
      var ws = A.worldStats; if (!ws) return "还没有生成路径";
      var ds = A.isReal() ? A.dataset() : null, wp = A.wp();
      if (ds && wp.mode !== "windows") { // 真实数据整段：画出全长，标出样本外
        var n = ds.v.length, cut = Math.min(n - 5, Math.max(10, Math.floor(n * (wp.split || 70) / 100))), stride = Math.max(1, Math.floor(n / 700)), xs = [], ys = [], i;
        for (i = 0; i < n; i += stride) { xs.push(i); ys.push(ds.v[i]); }
        var tfmt = ds.t ? function (v) { var k = Math.max(0, Math.min(n - 1, Math.round(v))); return QLIO.fmtDate(ds.t[k]).slice(0, 7); } : null;
        // 带训练的规则：训练段的前一部分留给模型，回测只用后一部分
        var cf = 0; if (A.hasFit()) { try { cf = QL.fitCut(cut) - 1; } catch (e) { cf = 0; } }
        var pl = [{ kind: "vband", x0: cut, x1: n - 1, color: "s2", alpha: 0.09 }], lg = [{ name: "样本外（留到最后才看）", color: "s2", mark: "band" }];
        if (cf > 0) { pl.push({ kind: "vband", x0: 0, x1: cf, color: "neutral", alpha: 0.16 }); lg.unshift({ name: "留给模型训练", color: "neutral", mark: "band" }); }
        pl.push({ kind: "line", x: xs, y: ys, color: "s1", name: "价格" }, { kind: "vline", x: cut, color: "axis", label: "此后是样本外" });
        if (cf > 0) pl.push({ kind: "vline", x: cf, color: "axis", label: "此后用来回测", row: 1 });
        return { x: { label: ds.t ? "" : "步", fmt: tfmt }, panels: [{ y: { label: ds.name, scale: o.log ? "log" : "linear" }, layers: pl }],
          legend: lg, hover: { xs: xs, dots: function (k) { return [{ y: ys[k], color: "s1" }]; }, tip: function (k) { return { title: ds.t ? QLIO.fmtDate(ds.t[xs[k]]) : "第 " + xs[k] + " 步", rows: [{ name: xs[k] >= cut ? "样本外" : cf > 0 && xs[k] < cf ? "留给模型训练" : cf > 0 ? "回测段" : "训练段", color: "s1", value: F(ys[k]) }] }; } } };
      }
      var x = arr(ws.grid), f = ws.fan, G = x.length, lines = [], k;
      for (k = 0; k < ws.paths.n; k++) lines.push(ws.paths.data.subarray(k * G, (k + 1) * G));
      var layers = ws.N > 1 ? [{ kind: "band", x: x, lo: f.q5, hi: f.q95, color: "s1", alpha: 0.08, name: "5–95%" }, { kind: "band", x: x, lo: f.q25, hi: f.q75, color: "s1", alpha: 0.12, name: "25–75%" }] : [];
      layers.push({ kind: "lines", x: x, ys: lines, color: "s1", alpha: 0.28, width: 1 }, { kind: "line", x: x, y: f.q50, color: "s1", name: "中位数" });
      return { x: { label: stepLabel() }, panels: [{ y: { label: A.wdef().unit === "次" ? "净胜次数指数" : "价格", scale: o.log ? "log" : "linear" }, layers: layers }],
        legend: [{ name: "中位数", color: "s1" }, { name: "样本路径与分位带", color: "s1", mark: "band" }],
        hover: { xs: x, dots: function (i) { return [{ y: f.q50[i], color: "s1" }]; }, tip: function (i) { return { title: "第 " + x[i] + " " + stepLabel(), rows: [{ name: "中位数", color: "s1", value: F(f.q50[i]) }, { name: "5%–95%", color: "s1", mark: "band", value: F(f.q5[i]) + " – " + F(f.q95[i]) }] }; } } };
    },
    foot: function () { var ws = A.worldStats, w = A.wdef(); if (w.game && !w.crit && w.act !== "position") return ws ? "这是没有你的交易时市场本来的价格。" : ""; return ws ? "实测：每步收益年化均值 " + P(ws.annMean, 1) + "，年化波动 " + P(ws.annVol, 1) + "（" + ws.N + " 条路径）。" : ""; }
  };

  CH.dist = {
    name: "终值分布", about: "所有路径期末净值的直方图，对照基准。", keys: "terminal wealth 终值 分布 直方图 对数净值 期末净值",
    gname: function (w) { return w.crit ? "" : (gdesc().lower ? "各局成本的分布" : "各局得分的分布"); },
    controls: function (o, re) { return gm() ? [] : [toggle("看 log W_T", !!o.log, function (v) { o.log = v; re(); })]; },
    spec: function (o) {
      var r = A.run; if (!r) return "还没有回测结果"; if (r.sum.N < 30) return "路径太少，画不出分布。真实数据可以改用滚动窗口，或换到 bootstrap 世界。";
      if (gm() && r.SC) {
        var gd = gdesc(), sa = arr(r.SC).map(gval), sb = r.benchSC ? arr(r.benchSC).map(gval) : null, hg = histPair(sa, sb, 41, false); if (!hg) return "没有数据";
        var mu = gval(r.game.score), xf = gd.kind === "prob" || gd.kind === "pct" ? function (v) { return P(v, 0); } : gd.kind === "usd" ? function (v) { return "$" + F(v, 0); } : null;
        return histSpec(hg, { nameA: "你的规则", nameB: "基准（" + benchName() + "）", xLabel: "一局的" + (gd.lower ? "成本" : "得分") + "：" + gd.name, yLabel: "对局占比", xfmt: xf, vlines: [{ kind: "vline", x: mu, color: "ink", label: "平均 " + gtxt(r.game.score) }] });
      }
      var hp = histPair(r.WT, r.benchWT, 41, !!o.log); if (!hp) return "所有路径都破产了";
      var s = r.sum, vl = o.log ? [{ kind: "vline", x: 0, color: "axis", width: 1 }] : [{ kind: "vline", x: 1, color: "axis", width: 1 }, { kind: "vline", x: s.meanW, color: "ink", dash: [4, 3], label: "均值 " + F(s.meanW, 3), row: 1 }];
      vl.push({ kind: "vline", x: o.log ? Math.log(Math.max(s.medW, 1e-12)) : s.medW, color: "ink", label: "中位数 " + F(s.medW, 3) });
      return histSpec(hp, { nameA: "策略", nameB: "基准", xLabel: o.log ? "log W_T" : "期末净值 W_T", vlines: vl });
    },
    foot: function (o) { var r = A.run; if (!r) return ""; if (gm()) return "每一局算一个数。结果栏里的得分是这些数的平均；分布越分散，同一条规则打一局的结果越说明不了问题。"; var s = r.sum; return (s.ruined ? "有 " + s.ruined + " 条路径破产" + (o.log ? "，不在对数图里。" : "。") : "") + "均值高于中位数说明分布右偏：平均数被少数大赢家拉高，多数路径拿不到这个数。"; }
  };

  CH.dd = {
    name: "最大回撤分布", about: "每条路径从最高点回落的最大幅度。", keys: "drawdown 回撤 最大回撤 风险", when: critOnly,
    spec: function () {
      var r = A.run; if (!r) return "还没有回测结果"; if (r.sum.N < 30) return "路径太少，画不出分布。";
      var hp = histPair(r.DD, r.benchDD, 40); if (!hp) return "没有数据"; hp.lo = Math.max(0, hp.lo);
      var lim = r.sum.ddLimit, s = histSpec({ ha: QL.histogram(r.DD, 40, 0, Math.max(hp.hi, 0.02)), hb: QL.histogram(r.benchDD, 40, 0, Math.max(hp.hi, 0.02)), lo: 0, hi: Math.max(hp.hi, 0.02), na: r.DD.length, nb: r.benchDD.length },
        { nameA: "策略", nameB: "基准", xLabel: "最大回撤", xfmt: function (v) { return P(v, 0); }, vlines: [{ kind: "vline", x: lim, color: "crit", dash: [4, 3], label: "阈值 " + P(lim, 0) }] });
      return s;
    },
    foot: function () { var r = A.run; return r ? "超过阈值的路径占 " + P(r.sum.pDD, 1) + "（基准 " + P(r.benchSum.pDD, 1) + "）。阈值在左栏\"风险上限\"里改。" : ""; }
  };

  CH.retdist = {
    name: "单步收益分布", about: "这个世界每一步收益的直方图，对照同均值、同方差的正态分布。", keys: "return distribution 收益 分布 厚尾 正态 偏度 峰度",
    when: function (w) { return !w.game || !!w.obs; }, gname: function (w) { return w.pricePath ? "" : (w.rName || w.obs.name) + "的分布"; },      // 画的是每一步的那个量：有的玩法里它是观测本身，有的是相邻观测之差（rName）
    controls: function (o, re) { return [toggle("纵轴取对数（看尾部）", !!o.log, function (v) { o.log = v; re(); })]; },
    spec: function (o) {
      var ws = A.worldStats; if (!ws) return "还没有生成路径";
      var hgm = ws.hist, n = hgm.counts.length, w = (hgm.hi - hgm.lo) / n, x0 = [], x1 = [], xc = [], y = [], g = [], i, tot = ws.N * ws.T;
      for (i = 0; i < n; i++) { x0.push(hgm.lo + i * w); x1.push(hgm.lo + (i + 1) * w); var c = hgm.lo + (i + 0.5) * w; xc.push(c); var d = hgm.counts[i] / tot / w; y.push(o.log && d <= 0 ? NaN : d); var z = (c - ws.mean) / ws.sd; g.push(Math.exp(-0.5 * z * z) / (ws.sd * Math.sqrt(2 * Math.PI))); }
      var pos = y.filter(function (v) { return v > 0; }), floor = pos.length ? Math.min.apply(null, pos) * 0.5 : 1e-6;
      var gw = A.wdef(), raw = gw.game && !gw.pricePath;   // 玩法里这个量不是收益率（报价、需求、分数……），按原数写
      return { x: { label: raw ? gw.rAxis || "每" + gw.unit + "的" + gw.obs.name : "单步收益", domain: [hgm.lo, hgm.hi], fmt: raw ? null : function (v) { return P(v, Math.abs(hgm.hi - hgm.lo) < 0.1 ? 1 : 0); } },
        panels: [{ y: { label: "概率密度", scale: o.log ? "log" : "linear", zero: !o.log, domain: o.log ? [floor, Math.max.apply(null, pos.concat(g)) * 1.5] : null }, layers: [{ kind: "bars", x0: x0, x1: x1, y: y, color: "s1", name: "实际", base: o.log ? floor : 0 }, { kind: "line", x: xc, y: g.map(function (v) { return o.log && v < floor ? NaN : v; }), color: "s3", name: "正态参照" }] }],
        legend: [{ name: "这个世界", color: "s1", mark: "rect" }, { name: "同均值同方差的正态", color: "s3" }],
        hover: { xs: xc, bars: true, tip: function (k) { var pf = raw ? function (v) { return F(v); } : function (v) { return P(v, 2); }; return { title: pf(x0[k]) + " 到 " + pf(x1[k]), rows: [{ name: "实际密度", color: "s1", mark: "rect", value: F(y[k]) }, { name: "正态密度", color: "s3", value: F(g[k]) }] }; } } };
    },
    foot: function () { var ws = A.worldStats, gw = A.wdef(), raw = gw.game && !gw.pricePath; return ws ? (raw ? "均值 " + F(ws.mean, 3) + "，标准差 " + F(ws.sd, 3) + "，" : "") + "偏度 " + F(ws.skew, 2) + "，峰度 " + F(ws.kurt, 2) + "（正态为 0 和 3）。最小 " + (raw ? F(ws.min) : P(ws.min, 1)) + "，最大 " + (raw ? F(ws.max) : P(ws.max, 1)) + "。" : ""; }
  };

  CH.acf = {
    name: "自相关", about: "收益和收益绝对值在各个滞后上的自相关：前者看方向能否预测，后者看波动有没有记忆。", keys: "acf autocorrelation 自相关 记忆 波动聚集 可预测", when: pricey,
    spec: function () {
      var ws = A.worldStats; if (!ws) return "还没有生成路径";
      var L = ws.acf.length, x0 = [], x1 = [], xc = [], i, b = 2 / Math.sqrt(ws.acfN);
      for (i = 0; i < L; i++) { x0.push(i + 0.55); x1.push(i + 1.45); xc.push(i + 1); }
      function panel(vals, color, label) { var mx = b * 1.6; arr(vals).forEach(function (v) { if (Math.abs(v) * 1.15 > mx) mx = Math.abs(v) * 1.15; }); return { y: { label: label, domain: [-mx, mx] }, layers: [{ kind: "hline", y: b, color: "axis", dash: [4, 3] }, { kind: "hline", y: -b, color: "axis", dash: [4, 3], label: "±2/√n" }, { kind: "bars", x0: x0, x1: x1, y: arr(vals), color: color, name: label }] }; }
      return { x: { label: "滞后（步）", domain: [0.3, L + 0.7], ticks: xc.filter(function (v) { return v === 1 || v % 5 === 0; }) }, panels: [panel(ws.acf, "s1", "收益的自相关"), panel(ws.acfAbs, "s2", "|收益| 的自相关")], height: 300,
        legend: [], hover: { xs: xc, bars: true, tip: function (k) { return { title: "滞后 " + (k + 1) + " 步", rows: [{ name: "收益", color: "s1", mark: "rect", value: F(ws.acf[k], 3) }, { name: "|收益|", color: "s2", mark: "rect", value: F(ws.acfAbs[k], 3) }] }; } } };
    },
    foot: function () { return "上图的柱子都在虚线以内，说明用过去的收益线性预测方向没有希望；下图明显为正，说明波动可以预测。非线性的依赖关系在这张图上看不出来。"; }
  };

  /* ---------- 单条路径 ---------- */
  A.single = { n: 0, data: null, key: "" };
  function loadSingle() {
    if (!A.run || A.shown().indexOf("single") < 0) return;
    var N = A.run.sum.N, n = Math.min(Math.max(0, A.single.n | 0), N - 1), p = Object.assign({}, A.sp()), set = Object.assign({}, S.set);
    A.single.n = n;
    A.send("path", { n: n, p: p, set: set, fitKeys: A.fitKeys() }, { timeout: A.tmo(60000) }).then(function (m) { A.single.data = m; refresh("single"); }).catch(function () {});
  }
  CH.single = {
    name: "单条路径明细", about: "挑一条路径，看价格、规则给出的仓位和净值怎么一步步走出来。", keys: "single path 单条 路径 仓位 买卖点 明细",
    gname: function () { return "单局明细"; },
    controls: function (o, re) {
      var inp = h("input", { type: "number", min: 0, step: 1, value: A.single.n, "aria-label": "路径编号", id: "singleN" });
      inp.addEventListener("change", function () { A.single.n = Math.max(0, parseInt(inp.value, 10) || 0); loadSingle(); });
      function pick(q) { var r = A.run; if (!r) return; var src = gm() && r.SC ? r.SC : r.WT, idx = arr(src).map(function (w, i) { return [w, i]; }).sort(function (a, b) { return a[0] - b[0]; }); A.single.n = idx[Math.min(idx.length - 1, Math.floor(q * (idx.length - 1)))][1]; inp.value = A.single.n; loadSingle(); }
      var out = [h("label", null, A.isGame() ? "第几局 #" : "路径 #", inp), h("button", { class: "btn small", type: "button", text: "最差", onclick: function () { pick(0); } }), h("button", { class: "btn small", type: "button", text: "中位", onclick: function () { pick(0.5); } }), h("button", { class: "btn small", type: "button", text: "最好", onclick: function () { pick(1); } })];
      if (A.isGame()) {   // 回合很多时整局挤在一起看不清：默认只看开头的一段
        var T = A.worldCfg().T, win = gwin(o, T);
        if (T > GWIN) {
          var a0 = h("input", { type: "number", min: 0, max: T - 1, step: 10, value: win[0], "aria-label": "从第几" + stepLabel() + "看起" }), a1 = h("input", { type: "number", min: 10, max: T, step: 10, value: win[1] - win[0], "aria-label": "看多少" + stepLabel() });
          a0.addEventListener("change", function () { o.w0 = Math.max(0, parseInt(a0.value, 10) || 0); A.persist(); re(); }); a1.addEventListener("change", function () { o.wn = Math.max(10, parseInt(a1.value, 10) || GWIN); A.persist(); re(); });
          out.push(h("label", null, "从第", a0, stepLabel() + "起，看", a1, stepLabel()), h("button", { class: "btn small", type: "button", text: "看整局", onclick: function () { o.w0 = 0; o.wn = T; A.persist(); rebuildControls("single"); re(); } }));
        }
      }
      return out;
    },
    spec: function () {
      var d = A.single.data; if (!d) return "正在取这条路径…";
      if (d.game) return A.isGame() ? singleGame(d) : "正在取这条路径…";
      if (A.isGame()) return "正在取这一局…";
      var T = d.f.length, x = [], xf = [], i, bands = [], start = 0, sign = 0;
      for (i = 0; i <= T; i++) x.push(i); for (i = 0; i < T; i++) xf.push(i);
      for (i = 0; i <= T; i++) { var sg = i < T ? (d.f[i] > 1e-9 ? 1 : d.f[i] < -1e-9 ? -1 : 0) : 99; if (sg !== sign) { if (sign !== 0 && i > start) bands.push({ kind: "vband", x0: start, x1: i, color: sign > 0 ? "s1" : "s2", alpha: 0.1 }); start = i; sign = sg; } }
      var price = arr(d.price), w = arr(d.w), bw = arr(d.bw), f = arr(d.f);
      return { height: 420, x: { label: stepLabel() },
        panels: [{ weight: 1.25, y: { label: A.wdef().unit === "次" ? "净胜次数指数" : "价格" }, layers: bands.concat([{ kind: "line", x: x, y: price, color: "ink2", width: 1.5, name: "价格" }]) },
          { weight: 0.7, y: { label: "仓位 f", zero: true }, layers: [{ kind: "step", x: xf, y: f, color: "s1", width: 1.5, name: "仓位" }] },
          { weight: 1, y: { label: "净值" }, layers: [{ kind: "hline", y: 1, color: "axis", width: 1 }, { kind: "line", x: x, y: bw, color: "s2", name: "基准", end: "基准" }, { kind: "line", x: x, y: w, color: "s1", name: "策略", end: "策略" }] }],
        legend: [{ name: "持有多头", color: "s1", mark: "band" }, { name: "持有空头", color: "s2", mark: "band" }, { name: "策略净值", color: "s1" }, { name: "基准净值", color: "s2" }],
        hover: { xs: x, dots: function (k) { return [{ y: price[k], color: "ink2", panel: 0 }, { y: w[k], color: "s1", panel: 2 }]; },
          tip: function (k) { return { title: "第 " + k + " " + stepLabel(), rows: [{ name: "价格", color: "ink2", value: F(price[k]) }, { name: "这一步之后的仓位", color: "s1", value: k < T ? F(f[k], 2) : "—" }, { name: "策略净值", color: "s1", value: F(w[k], 3) }, { name: "基准净值", color: "s2", value: F(bw[k], 3) }] }; } } };
    },
    foot: function () {
      var d = A.single.data; if (!d) return "";
      if (d.game) { if (!A.isGame()) return ""; var w = A.wdef(), gd = gdesc(), one = { name: gd.name, kind: gd.kind, digits: gd.digits, lower: gd.lower }; return "第 #" + d.n + " 局：" + (w.crit ? "期末净值 " + F(d.WT, 3) : (gd.lower ? "成本 " : "得分 ") + A.gfmt(one, d.SC)) + "；同一局里基准（" + d.benchName + "）" + (w.crit ? "的期末净值 " + F(d.bw[d.bw.length - 1], 3) : "是 " + A.gfmt(one, d.benchSC)) + "。各栏共用同一条横轴。"; }
      return "路径 #" + d.n + "：期末净值 " + F(d.WT, 3) + "，最大回撤 " + P(d.DD, 1) + "。仓位在每一步收盘后决定，下一步才生效。";
    }
  };
  var GWIN = 160;   // 一局超过这么多回合时，单局明细默认只看开头的一段
  function gwin(o, T) { if (T <= GWIN) return [0, T]; var a = Math.min(Math.max(0, o.w0 | 0), T - 10), n = o.wn > 0 ? o.wn : 120; return [a, Math.min(T, a + n)]; }
  /** 玩法的单局明细：第一栏是这一局摆在面前的数，中间是你的动作，最后是那个随回合推进的量（与基准对照） */
  function singleGame(d) {
    var w = A.wdef(), T0 = d.a.length, win = gwin(opt("single"), T0), lo = win[0], T = win[1] - lo, x = [], xf = [], i, kind = w.action.kind, names = w.mk || {};
    var obs = arr(d.x).slice(lo, lo + T), act = arr(d.a).slice(lo, lo + T), tr = arr(d.w).slice(lo, lo + T + 1), btr = arr(d.bw).slice(lo, lo + T + 1), mk = arr(d.m).slice(lo, lo + T);
    for (i = 0; i <= T; i++) x.push(lo + i); for (i = 0; i < T; i++) xf.push(lo + i);
    var bands = [], start = 0, cur = 0;
    for (i = 0; i <= T; i++) { var c = i < T ? (mk[i] === 2 ? 2 : mk[i] === 3 ? 3 : 0) : -1; if (c !== cur) { if (cur === 2 || cur === 3) bands.push({ kind: "vband", x0: lo + start - 0.5, x1: lo + i - 0.5, color: cur === 2 ? "s4" : "neutral", alpha: cur === 2 ? 0.14 : 0.12 }); start = i; cur = c; } }
    var px = [], py = [], has2 = mk.indexOf(2) >= 0, has3 = mk.indexOf(3) >= 0;
    for (i = 0; i < T; i++) if (mk[i] === 1) { px.push(lo + i); py.push(obs[i]); }
    var obsName = w.dxName || (w.obs ? w.obs.name : ""), legend = [], p1 = bands.slice(), panels = [], draw = (w.obs && w.obs.draw) || (kind === "arm" ? "step" : "line");
    if (draw === "bars") { p1.push({ kind: "bars", x0: xf.map(function (v) { return v - 0.42; }), x1: xf.map(function (v) { return v + 0.42; }), y: obs, color: "neutral", name: obsName, maxW: 14 }); legend.push({ name: obsName, color: "neutral", mark: "rect" }); }
    else { p1.push({ kind: draw, x: xf, y: obs, color: "ink2", width: T > 400 ? 1 : 1.5, name: obsName }); legend.push({ name: obsName, color: "ink2" }); }
    if (kind === "same") { p1.push({ kind: "step", x: xf, y: act, color: "s1", width: 2, name: w.action.name }); legend.push({ name: w.action.name, color: "s1" }); }
    if (px.length && names[1]) { var c1 = kind === "flag" || kind === "same" ? "s1" : "s8"; p1.push({ kind: "points", x: px, y: py, color: c1, r: T > 400 ? 2.5 : 3.5, name: names[1] }); legend.push({ name: names[1], color: c1, mark: "dot" }); }
    panels.push({ weight: 1.2, y: { label: obsName + (kind === "same" ? " 与 " + w.action.name : ""), zero: draw === "bars" }, layers: p1 });
    if (kind === "level" || kind === "arm") {
      var al = bands.slice(); if (kind === "arm") al.push({ kind: "points", x: xf, y: act, color: "s1", r: 2, ring: false, name: w.action.name }); else al.push({ kind: "step", x: xf, y: act, color: "s1", width: 1.5, name: w.action.name });
      panels.push({ weight: 0.75, y: { label: w.action.name, zero: kind !== "arm" }, layers: al });
    }
    panels.push({ weight: 1, y: { label: w.track.name }, layers: bands.concat([{ kind: "line", x: x, y: btr, color: "s2", name: "基准", end: "基准" }, { kind: "line", x: x, y: tr, color: "s1", name: "你的规则", end: "你的规则" }]) });
    legend.push({ name: "你的规则", color: "s1" }, { name: "基准（" + d.benchName + "）", color: "s2" });
    if (has2 && names[2]) legend.push({ name: names[2], color: "s4", mark: "band" });
    if (has3 && names[3]) legend.push({ name: names[3], color: "neutral", mark: "band" });
    var last = panels.length - 1;
    return { height: panels.length === 3 ? 420 : 330, x: { label: stepLabel() + (T < T0 ? "（只画了第 " + lo + " 到 " + (lo + T) + " 个，共 " + T0 + " 个）" : "") }, panels: panels, legend: legend,
      hover: { xs: x, dots: function (k) { return [{ y: tr[k], color: "s1", panel: last }, { y: btr[k], color: "s2", panel: last }]; },
        tip: function (k) {
          var rows = []; if (k < T) { rows.push({ name: obsName, color: "ink2", value: F(obs[k]) }); rows.push({ name: w.action.name, color: "s1", value: act[k] === act[k] ? F(act[k], kind === "arm" ? 0 : 3) : "—" }); if (mk[k] && names[mk[k]]) rows.push({ name: names[mk[k]], value: "✓" }); }
          rows.push({ name: w.track.name + "（你的规则）", color: "s1", value: F(tr[k], 3) }, { name: w.track.name + "（基准）", color: "s2", value: F(btr[k], 3) });
          return { title: "第 " + (lo + k) + " " + stepLabel() + (lo + k < T0 ? "" : "（结束）"), rows: rows };
        } } };
  }

  /* ---------- 杠杆曲线 ---------- */
  A.lev = { res: null, xs: null, mode: "lam", key: "", busy: false };
  function loadLev() {
    if (!A.run || A.isGame() || A.shown().indexOf("lev") < 0) return;
    var st = A.strat(), p = Object.assign({}, A.sp()), set = Object.assign({}, S.set), isF = st.id === "const", xs = [], i, n = 31;
    if (isF) { var a = Math.max(0, set.fmin), b = set.fmax; for (i = 0; i < n; i++) xs.push(+(a + (b - a) * i / (n - 1)).toFixed(4)); }
    else for (i = 0; i < n; i++) xs.push(+(3 * i / (n - 1)).toFixed(4));
    var key = JSON.stringify([st.id, p, set, A.worldLabel(), S.world.seed]); A.lev.key = key; A.lev.busy = true;
    if (A.lev.eng && A.lev.pid) A.lev.eng.cancel(A.lev.pid);          // 上一条还没算完的曲线作废
    A.sweepEngine().then(function (e) {
      if (A.lev.key !== key) throw { cancelled: true };
      var pr = e.send("sweep", { axes: [{ key: isF ? "f" : "__lam", values: xs }], p: p, set: set, fitKeys: A.fitKeys() }, { timeout: A.tmo(120000) });
      A.lev.eng = e; A.lev.pid = pr.id; return pr;
    }).then(function (m) {
      if (A.lev.key !== key) return; A.lev.res = m; A.lev.xs = xs; A.lev.mode = isF ? "f" : "lam"; A.lev.cur = isF ? p.f : 1; A.lev.busy = false; A.lev.pid = 0; refresh("lev");
    }).catch(function () { if (A.lev.key === key) A.lev.busy = false; });
  }
  CH.lev = {
    name: "杠杆曲线", about: "把规则给出的仓位整体放大或缩小，看三种口径各自怎么变。增长率的峰值就是这条规则的 Kelly 倍数。", keys: "leverage kelly 杠杆 仓位 倍数 增长率曲线 g(f)", when: priceOnly,
    controls: function (o, re) { return [seg([["growth", "增长率"], ["sharpe", "夏普"], ["mean", "期望收益"]], o.obj || "growth", function (v) { o.obj = v; re(); })]; },
    spec: function (o) {
      var L = A.lev, m = L.res; if (!m) return "正在计算杠杆曲线…";
      var k = o.obj || "growth", xs = L.xs, y = arr(m[k]), se = arr(m[k + "SE"]), isF = L.mode === "f", i, layers = [], legend = [{ name: "模拟（±1 标准误）", color: "s1" }];
      var firstRuin = -1; for (i = 0; i < xs.length; i++) if (m.pRuin[i] > 0) { firstRuin = i; break; }
      if (firstRuin >= 0) layers.push({ kind: "vband", x0: xs[firstRuin], x1: xs[xs.length - 1], color: "crit", alpha: 0.07 });
      if (k !== "growth" || firstRuin !== 0) layers.push({ kind: "err", x: xs, y: y, se: se, color: "s1", alpha: 0.16 });
      var th = isF && A.wdef().theory ? A.wdef().theory(A.wp(), { K: A.worldCfg().K, rf: S.set.rf }) : null;
      if (k === "growth" && th && th.gOfF) {
        var ty = xs.map(function (f) { var g = th.gOfF(f); return g === -Infinity ? NaN : g; });
        layers.push({ kind: "line", x: xs, y: ty, color: "s3", name: "理论 g(f)", end: "理论" }); legend.push({ name: th.exact ? "理论（精确）" : "理论（连续调仓近似）", color: "s3" });
        if (isFinite(th.fStar) && th.fStar >= xs[0] && th.fStar <= xs[xs.length - 1]) layers.push({ kind: "vline", x: th.fStar, color: "s3", dash: [4, 3], label: "f* = " + F(th.fStar, 2), row: 1 });
      }
      layers.push({ kind: "hline", y: 0, color: "axis", width: 1 });
      layers.push({ kind: "line", x: xs, y: y, color: "s1", name: OBJ[k], end: "模拟" });
      var best = -1, bv = -Infinity; for (i = 0; i < xs.length; i++) if (y[i] === y[i] && y[i] > bv && (k !== "mean" || m.pDD[i] <= S.set.ddProb / 100)) { bv = y[i]; best = i; }
      if (best >= 0 && k !== "sharpe") layers.push({ kind: "points", x: [xs[best]], y: [y[best]], color: "s1", r: 4.5 });
      layers.push({ kind: "vline", x: L.cur, color: "ink", label: "当前" });
      if (firstRuin >= 0) legend.push({ name: "出现破产路径的区域", color: "crit", mark: "band" });
      var fin = y.filter(function (v) { return isFinite(v); }), lo = Math.min.apply(null, fin.concat([0])), hi = Math.max.apply(null, fin.concat([0]));
      var dom = k === "growth" && fin.length ? [Math.max(lo, -Math.abs(hi) * 2.5 - 0.02), hi + (hi - Math.max(lo, -Math.abs(hi) * 2.5 - 0.02)) * 0.12] : null;
      A.lev.best = best >= 0 ? { x: xs[best], v: bv } : null;
      return { x: { label: isF ? "仓位比例 f" : "仓位倍数 λ（1 = 当前规则）" }, panels: [{ y: { label: OBJ[k] + (k === "sharpe" ? "" : k === "growth" ? "（" + per() + "）" : "（整段）"), fmt: objTick(k), domain: dom }, layers: layers }], legend: legend,
        hover: { xs: xs, dots: function (j) { return [{ y: y[j], color: "s1" }]; }, tip: function (j) { var rows = [{ name: OBJ[k], color: "s1", value: (y[j] === -Infinity ? "−∞" : objFmt(k)(y[j])) + (isFinite(se[j]) && isFinite(y[j]) ? " ± " + objFmt(k)(se[j]) : "") }]; if (m.pRuin[j] > 0) rows.push({ name: "破产概率", color: "crit", mark: "rect", value: P(m.pRuin[j], 2) }); rows.push({ name: "回撤超限的概率", value: P(m.pDD[j], 1) }); return { title: (isF ? "f = " : "λ = ") + F(xs[j], 2), rows: rows }; } } };
    },
    foot: function (o) {
      var L = A.lev, k = o.obj || "growth"; if (!L.res) return "";
      var s = k === "sharpe" ? "夏普比率不随杠杆变化（除非碰到仓位上下限或成本）：它衡量的是信号的质量，不告诉你该押多大。" : L.best ? "这批路径上的峰值在 " + (L.mode === "f" ? "f" : "λ") + " ≈ " + F(L.best.x, 2) + "。峰值附近曲线很平，位置本身的误差不小；押过头比押不够的代价大得多。" : "";
      if (k === "mean") s = "不设风险上限时，期望收益随杠杆一直上升，最优解是\"能借多少借多少\"。实心点是满足回撤上限的最大值。";
      return s;
    }
  };

  /* ---------- 参数扫描 ---------- */
  A.sweep = { res: null, cfg: null, busy: false, id: 0, prog: 0 };
  function numParams() { var cur = A.sp(); var L = A.sschema().filter(function (q) { return q.type === "num" && !(q.show && !q.show(cur)); }).map(function (q) { return { key: q.key, label: q.label, min: q.min, max: q.max, step: q.step }; }); if (!A.isGame()) L.push({ key: "__lam", label: "仓位倍数 λ", min: 0, max: 3, step: 0.01 }); return L; }
  function sweepCfg() {
    var o = opt("sweep"), ps = numParams(), st = A.strat();
    if (!ps.length) { o.stratId = st.id; o.x = { key: "" }; o.y = { key: "" }; o.none = true; return o; }   // 这条规则没有可扫的数值参数
    o.none = false;
    if (o.stratId !== st.id || !o.x || !o.x.key) { o.stratId = st.id; var first = ps[0]; o.x = { key: (st.scaleKey && ps.some(function (q) { return q.key === st.scaleKey; }) ? st.scaleKey : first.key) }; var qx = ps.filter(function (q) { return q.key === o.x.key; })[0]; o.x.min = qx.min; o.x.max = qx.max; o.x.n = 21; o.y = { key: "" }; A.sweep.res = null; }
    // 换了模型之后，有些参数不再出现：轴上选的参数若已隐藏，就退回默认
    var has = function (k) { return ps.some(function (q) { return q.key === k; }); };
    if (!has(o.x.key)) { var q0 = ps.filter(function (q) { return q.key === st.scaleKey; })[0] || ps[0]; o.x = { key: q0.key, min: q0.min, max: q0.max, n: 21 }; A.sweep.res = null; }
    if (o.y.key && !has(o.y.key)) { o.y = { key: "" }; A.sweep.res = null; }
    o.sig = ps.map(function (q) { return q.key; }).join(",");
    return o;
  }
  function gridVals(a) { var q = numParams().filter(function (p) { return p.key === a.key; })[0], out = [], n = Math.max(2, Math.min(61, a.n | 0)), isInt = q && q.step >= 1; for (var i = 0; i < n; i++) { var v = a.min + (a.max - a.min) * i / (n - 1); v = isInt ? Math.round(v) : +v.toPrecision(6); if (!out.length || out[out.length - 1] !== v) out.push(v); } return out; }
  A.runSweep = function () {
    var o = sweepCfg(); if (o.none) return;
    var axes = [{ key: o.x.key, values: gridVals(o.x) }]; if (o.y.key) axes.push({ key: o.y.key, values: gridVals(o.y) });
    var p = Object.assign({}, A.sp()), set = Object.assign({}, S.set), sw = A.sweep, fk = A.fitKeys() || [];
    var refit = axes.some(function (a) { return fk.indexOf(a.key) >= 0; });   // 扫到了要重新训练的参数：每个取值都得训练一次，放宽时限
    sw.busy = true; sw.prog = 0; sw.res = null; rebuildControls("sweep"); refresh("sweep");
    A.sweepEngine().then(function (e) {
      var pr = e.send("sweep", { axes: axes, p: p, set: set, fitKeys: A.fitKeys() }, { timeout: refit ? 900000 : A.tmo(120000), onProgress: function (d, t) { sw.prog = d / t; var pg = $("sweepProg"); if (pg) pg.value = sw.prog; } });
      sw.id = pr.id; sw.eng = e; return pr;
    }).then(function (m) { sw.busy = false; sw.res = m; sw.axes = axes; sw.p = p; rebuildControls("sweep"); refresh("sweep"); })
      .catch(function (e) { sw.busy = false; rebuildControls("sweep"); if (!e.cancelled) A.toast("扫描失败：" + (e.message || e)); refresh("sweep"); });
  };
  /** R² 扫描的纵轴：模型最灵活的那一端，训练 R² 会冲到 1、验证 R² 掉到 −1，把最优点附近压成一条线。
   *  这时只画最优值附近的一段，超出的部分截掉（悬停仍能读到数值）。不需要截时返回 null。 */
  function r2Domain(m) {
    var lo = Infinity, hi = -Infinity, best = -Infinity, i, v;
    for (i = 0; i < m.r2Valid.length; i++) { v = m.r2Valid[i]; if (v === v) { if (v > best) best = v; if (v < lo) lo = v; if (v > hi) hi = v; } v = m.r2Train[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    if (!(hi > lo)) return null;
    var V = Math.max(best, 0.005), a = Math.max(lo, -1.5 * V), b = Math.min(hi, 4 * V);
    if (a <= lo && b >= hi) return null;
    var pad = 0.06 * (b - a); return [a - pad, b + pad];
  }
  function sweepBest(k) {
    var m = A.sweep.res; if (!m) return null; if (k === "r2" && !hasR2(m)) k = "growth";
    var v = swVals(m, k), se = swSE(m, k), best = -1, bv = -Infinity, sg = swBetter(k);
    for (var i = 0; i < v.length; i++) if (v[i] === v[i] && sg * v[i] > bv && (k !== "mean" || m.pDD[i] <= S.set.ddProb / 100)) { bv = sg * v[i]; best = i; }
    return best < 0 ? null : { idx: best, i: best % m.nx, j: Math.floor(best / m.nx), v: sg * bv, se: se ? se[best] : NaN };
  }
  /** 这套玩法对"当前规则的这个参数"有没有理论曲线（有的话，扫描图上叠一条） */
  function theoryCurve(key) {
    var w = A.wdef(), st = A.strat(); if (!w.game || !st.lib || !w.theory) return null;
    var th = w.theory(A.wp()), c = th && th.curves ? th.curves[st.lib + "." + key] : null;
    return c || null;
  }
  CH.sweep = {
    name: "参数扫描", about: "让一个或两个参数在一段范围内取值，逐个回测，看目标随参数怎么变。", keys: "sweep scan 扫描 参数 热力图 优化 heatmap 最优",
    controls: function (o, re) {
      o = sweepCfg(); var ps = numParams(), sw = A.sweep, out = [];
      if (o.none) return out;
      function axis(name, a, allowNone) {
        var sel = h("select", { "aria-label": name + "轴参数", onchange: function () { a.key = sel.value; var q = ps.filter(function (p) { return p.key === a.key; })[0]; if (q) { a.min = q.min; a.max = q.max; a.n = a.n || (allowNone ? 13 : 21); } sw.res = null; rebuildControls("sweep"); refresh("sweep"); } },
          (allowNone ? [h("option", { value: "", text: "（不用第二个参数）", selected: !a.key })] : []).concat(ps.map(function (q) { return h("option", { value: q.key, text: q.label, selected: q.key === a.key }); })));
        var box = [h("label", null, name, sel)];
        if (a.key) { ["min", "max", "n"].forEach(function (f) { var inp = h("input", { type: "number", value: a[f], step: f === "n" ? 1 : "any", "aria-label": name + (f === "min" ? " 起" : f === "max" ? " 止" : " 点数") }); inp.addEventListener("change", function () { var v = parseFloat(inp.value); if (v === v) a[f] = f === "n" ? Math.max(2, Math.min(61, Math.round(v))) : v; }); box.push(h("label", null, f === "min" ? "从" : f === "max" ? "到" : "点数", inp)); }); }
        return h("div", { class: "row tight", style: { "flex-basis": "100%" } }, box);
      }
      out.push(axis("横轴", o.x, false), axis("纵轴", o.y, true));
      var objs = A.isCrit() ? [["growth", "增长率"], ["sharpe", "夏普"], ["mean", "期望收益"]] : [["score", objName("score")]];
      if (A.strat().fitKeys && !A.isGame()) objs.push(["r2", "预测力 R²"]); else if (o.obj === "r2") o.obj = "growth";
      o.obj = defObj(o);
      if (objs.length > 1) out.push(seg(objs, o.obj, function (v) { o.obj = v; rebuildControls("sweep"); re(); }));
      if (sw.busy) { out.push(h("progress", { id: "sweepProg", max: 1, value: sw.prog })); out.push(h("button", { class: "btn small", type: "button", text: "停止", onclick: function () { if (sw.eng) sw.eng.cancel(sw.id); } })); }
      else out.push(h("button", { class: "btn small primary", type: "button", text: "开始扫描", onclick: A.runSweep }));
      var b = sweepBest(o.obj || "growth");
      if (b && !sw.busy) out.push(h("button", { class: "btn small", type: "button", text: "采用最优参数", title: "把这批路径上最好的那组参数设为当前参数", onclick: function () {
        var p = A.sp(); sw.axes.forEach(function (a, d) { var v = a.values[d === 0 ? b.i : b.j]; if (a.key === "__lam") { S.set.lam = 1; A.toast("仓位倍数不是规则自己的参数，请手动把仓位大小乘以 " + F(v, 2)); } else p[a.key] = v; });
        A.renderStrat(); A.requestRun("commit");
      } }));
      return out;
    },
    spec: function (o) {
      var sw = A.sweep, m = sw.res; o = sweepCfg(); var k = defObj(o);
      if (o.none) return "这条规则没有可以扫描的数值参数。换一条带参数的规则（比如带门槛、比例或系数的）再来。";
      if (sw.busy) return "正在扫描…"; if (!m) return A.isGame() ? "选好参数和范围，点\"开始扫描\"：每个取值都在同一批对局上打一遍。找到最好的取值之后，用结果栏里的\"用新的一批对局检验\"核对。" : "选好参数和范围，点\"开始扫描\"。扫描只用训练路径；找到最优点之后，用结果栏里的\"" + (A.isReal() ? "揭晓样本外" : "用新路径检验") + "\"核对。";
      if (k === "score" && !(m.score && m.score.some(function (v) { return v === v; }))) return "这次扫描不是在当前的玩法里做的。重新扫描一次。";
      if (k === "r2" && !hasR2(m)) return "这次扫描里没有模型的诊断数据。重新扫描一次，或者换成别的口径。";
      var ps = numParams(), lab = function (key) { var q = ps.filter(function (p) { return p.key === key; })[0]; return q ? q.label : key; }, ax = sw.axes, b = sweepBest(k), cur = A.sp();
      var V0 = swVals(m, k), vals = arr(V0).map(function (v, i) { return k === "mean" && m.pDD[i] > S.set.ddProb / 100 ? NaN : v; });
      if (m.ny === 1) {
        var xs = ax[0].values, se = swSE(m, k) ? arr(swSE(m, k)) : xs.map(function () { return NaN; }), layers = [{ kind: "err", x: xs, y: arr(V0), se: se.map(function (v) { return v === v ? v : 0; }), color: "s1", alpha: 0.16 }, { kind: "hline", y: 0, color: "axis", width: 1 }];
        var ydom = null;
        if (k === "r2") {
          layers.push({ kind: "line", x: xs, y: arr(m.r2Train), color: "s2", name: "训练集 R²", end: "训练" });
          ydom = r2Domain(m); sw.clipped = !!ydom;
        }
        var cv = k === "score" ? theoryCurve(ax[0].key) : null, lg1 = k === "r2" ? [{ name: "验证集", color: "s1" }, { name: "训练集", color: "s2" }] : [];
        if (cv) { layers.push({ kind: "line", x: xs, y: xs.map(function (xv) { var tv = cv.f(xv); return tv === tv ? gval(tv) : NaN; }), color: "s3", width: 6, alpha: 0.4, name: cv.name }); lg1 = [{ name: "模拟（±1 标准误）", color: "s1" }, { name: cv.name + "（宽带）", color: "s3" }]; }
        layers.push({ kind: "line", x: xs, y: arr(V0), color: "s1", name: objName(k), end: k === "r2" ? "验证" : null });
        if (b) layers.push({ kind: "points", x: [xs[b.i]], y: [b.v], color: "s1", r: 4.5 });
        var cx = ax[0].key === "__lam" ? 1 : cur[ax[0].key]; if (cx >= xs[0] && cx <= xs[xs.length - 1]) layers.push({ kind: "vline", x: cx, color: "ink", label: "当前" });
        if (sw.claim && sw.claim.param === ax[0].key) layers.push({ kind: "vline", x: sw.claim.value, color: "s3", dash: [4, 3], label: "声明的最优值", row: 1 });
        return { x: { label: lab(ax[0].key) }, panels: [{ y: { label: k === "r2" ? "R²（对下一步收益的预测）" : k === "score" ? objName(k) + "：" + gdesc().name : OBJ[k] + (k === "growth" ? "（" + per() + "）" : ""), fmt: objTick(k), domain: ydom }, layers: layers }], legend: lg1,
          hover: { xs: xs, dots: function (j) { return [{ y: V0[j], color: "s1" }]; }, tip: function (j) { var rows = [{ name: objName(k), color: "s1", value: (V0[j] === -Infinity ? "−∞" : objFmt(k)(V0[j])) + (isFinite(se[j]) ? " ± " + objFmt(k)(se[j]) : "") }]; if (k === "r2") rows.push({ name: "训练集 R²", color: "s2", value: F(m.r2Train[j], 4) }, { name: "对应的增长率", value: m.growth[j] === -Infinity ? "−∞" : P(m.growth[j]) }); else if (k === "score") { if (cv) { var tv = cv.f(xs[j]); if (tv === tv) rows.push({ name: cv.name, color: "s3", value: objFmt(k)(gval(tv)) }); } } else rows.push({ name: "回撤超限的概率", value: P(m.pDD[j], 1) }, { name: "破产概率", value: P(m.pRuin[j], 2) }); return { title: lab(ax[0].key) + " = " + G(xs[j]), rows: rows }; } } };
      }
      var marks = []; if (b) marks.push({ i: b.i, j: b.j });
      var ci = ax[0].values.indexOf(cur[ax[0].key]), cj = ax[1].values.indexOf(cur[ax[1].key]); if (ci >= 0 && cj >= 0) marks.push({ i: ci, j: cj, dash: [3, 3] });
      return { type: "heat", height: 330, xs: ax[0].values, ys: ax[1].values, values: vals, xLabel: lab(ax[0].key), yLabel: lab(ax[1].key), fmt: objFmt(k), marks: marks, naLabel: k === "mean" ? "超出风险上限" : k === "score" ? "" : "破产", diverging: k === "score" ? false : undefined,
        tip: function (i, j) { var q = j * m.nx + i, rows = [{ name: objName(k), value: (V0[q] === -Infinity ? "−∞" : objFmt(k)(V0[q])) + (swSE(m, k) && isFinite(swSE(m, k)[q]) ? " ± " + objFmt(k)(swSE(m, k)[q]) : "") }]; if (k !== "score") rows.push({ name: "回撤超限的概率", value: P(m.pDD[q], 1) }, { name: "破产概率", value: P(m.pRuin[q], 2) }); return { title: lab(ax[0].key) + " = " + G(ax[0].values[i]) + "，" + lab(ax[1].key) + " = " + G(ax[1].values[j]), rows: rows }; },
        onClick: function (i, j) { var p = A.sp(); if (ax[0].key !== "__lam") p[ax[0].key] = ax[0].values[i]; if (ax[1].key !== "__lam") p[ax[1].key] = ax[1].values[j]; A.renderStrat(); A.requestRun("commit"); } };
    },
    foot: function (o) {
      var sw = A.sweep, m = sw.res; o = sweepCfg(); if (!m || o.none) return ""; var k = defObj(o), b = sweepBest(k), n = m.nx * m.ny;
      if (k === "r2") return hasR2(m) ? (b ? "验证集 R² 最高的点：" + sw.axes.map(function (a, d) { return (numParams().filter(function (p) { return p.key === a.key; })[0] || { label: a.key }).label + " = " + G(a.values[d === 0 ? b.i : b.j]); }).join("，") + "（" + F(b.v, 4) + "）。" : "") + "两条线之间的缺口就是过拟合：模型越灵活，训练集 R² 越高，验证集 R² 先升后降。" + (m.ny === 1 && sw.clipped ? "纵轴只画了最优值附近的一段，超出的部分被截掉了，悬停可以读到数值。" : "") : "";
      var ps = numParams(), lab = function (key) { var q = ps.filter(function (p) { return p.key === key; })[0]; return q ? q.label : key; };
      var s = b ? "最优点：" + sw.axes.map(function (a, d) { return lab(a.key) + " = " + G(a.values[d === 0 ? b.i : b.j]); }).join("，") + "，" + objName(k) + " " + objFmt(k)(b.v) + (isFinite(b.se) ? " ± " + objFmt(k)(b.se) : "") + "。" : "没有满足条件的点。";
      if (k === "score" && m.ny === 1 && theoryCurve(sw.axes[0].key)) s += "绿色的宽带是理论曲线：细线落在带子里，说明模拟和推导对上了。";
      s += "这次比较了 " + n + " 组参数：即使它们全无差别，其中最好的一组也会领先约 " + QL.expectedMaxNormal(n).toFixed(1) + " 个标准误，所以这个最优值是偏乐观的。";
      if (m.ny > 1) s += "点一下格子可以把那组参数设为当前参数；实线框是最优点，虚线框是当前参数。";
      return s;
    }
  };

  /* ---------- 多策略对比 ---------- */
  A.cmp = { rows: {}, key: "" };
  /** 钉住的规则按世界分开记：玩法里钉的只在那套玩法里比，价格世界里钉的在各个价格世界里通用 */
  function pins() { var wkey = A.isGame() ? S.world.type : ""; return S.compare.filter(function (c) { return (c.world || "") === wkey; }); }
  A.pins = pins;
  A.pinCompare = function () {
    var st = A.strat(), p = Object.assign({}, A.sp());
    // 名字里带上当前用得到的选项和前几个数值参数（被隐藏的参数与这次运行无关，不写）
    var vis = (st.params || []).filter(function (q) { return !(q.show && !q.show(p)); });
    var bits = vis.filter(function (q) { return q.type === "select"; }).slice(0, 2).map(function (q) { var o = q.options.filter(function (x) { return x[0] === p[q.key]; })[0]; return (q.short && q.short[p[q.key]]) || (o ? o[1] : p[q.key]); })
      .concat(vis.filter(function (q) { return q.type === "num"; }).slice(0, 3).map(function (q) { return q.key + "=" + G(p[q.key]); }));
    var label = (st.name.length > 14 ? st.name.replace(/（.*$/, "") : st.name) + (bits.length ? "（" + bits.join("，") + "）" : "");
    if (pins().length >= 6) { A.toast("最多对比 6 条规则，请先移除一条"); return; }
    S.compare.push({ id: "c" + Date.now().toString(36), name: label, stratId: st.id, params: p, world: A.isGame() ? S.world.type : "" });
    if (A.shown().indexOf("compare") < 0) A.toggleChart("compare", true); else loadCompare();
    A.persist(); A.toast("已加入对比");
  };
  function loadCompare() {
    var PN = pins();
    if (A.shown().indexOf("compare") < 0 || !PN.length) { refresh("compare"); return; }
    var key = JSON.stringify([PN, S.set, A.worldLabel(), S.world.seed, A.wp()]); A.cmp.key = key; var rows = {}, chain = Promise.resolve();
    // 真实数据上，带训练的规则只能在训练段的后一部分回测；只要对比里有一条这样的规则，其余的也都放到那一段上跑
    var needEval = A.wdef().needsData && PN.some(function (c) { var st = A.strat(c.stratId); return st.id === c.stratId && A.hasFit(st); });
    A.cmp.aligned = needEval;
    PN.forEach(function (c) {
      chain = chain.then(function () {
        var st = A.strat(c.stratId); if (st.id !== c.stratId) { rows[c.id] = { err: "这条规则已被删除" }; return; }
        if (!A.stratOk(st)) { rows[c.id] = { err: "这条规则不能用在当前的世界里" }; return; }
        return A.sideEngine(st.code).then(function (e) { return e.send("run", { p: c.params, set: Object.assign({}, S.set), fan: true, fitKeys: st.fitKeys || null, part: needEval ? "eval" : "" }, { timeout: A.tmo(180000, st) }); }).then(function (m) { rows[c.id] = m; }, function (e) { rows[c.id] = { err: e.message || String(e) }; });
      });
    });
    chain.then(function () { if (A.cmp.key !== key) return; A.cmp.rows = rows; refresh("compare"); });
  }
  CH.compare = {
    name: "多策略对比", about: "把钉住的几条规则放在同一批路径上比：净值中位数，加上三种口径和配对差。", keys: "compare 对比 多策略 比较",
    spec: function () {
      var PN = pins(), gw = gm();
      if (!PN.length) return "还没有要对比的规则。在左栏调好一条规则后点\"加入对比\"。" + (A.isGame() ? "（每套玩法各记各的。）" : "");
      var rows = A.cmp.rows, layers = gw ? [] : [{ kind: "hline", y: 1, color: "axis", width: 1 }], legend = [], x = null, series = [];
      var pickY = function (m) { return gw ? m.eq.fan.mean : m.eq.fan.q50; };
      PN.forEach(function (c, i) { var m = rows[c.id]; if (!m || m.err || !m.eq) return; x = arr(m.eq.grid); var col = "s" + (i + 1); layers.push({ kind: "line", x: x, y: pickY(m), color: col, name: c.name, end: String(i + 1) }); legend.push({ name: (i + 1) + ". " + c.name, color: col }); series.push({ c: c, m: m, col: col, i: i }); });
      if (!x) return "正在回测要对比的规则…";
      return { x: { label: stepLabel() }, panels: [{ y: gw ? { label: gw.track.name + "（各局平均）" } : { label: "净值中位数", scale: "log" }, layers: layers }], legend: legend,
        hover: { xs: x, tip: function (k) { return { title: "第 " + x[k] + " " + stepLabel(), rows: series.map(function (s) { return { name: s.i + 1 + ". " + s.c.name, color: s.col, value: F(pickY(s.m)[k], 3) }; }) }; } } };
    },
    extra: function (host) {
      var PN = pins(), gw = gm(); if (!PN.length) return;
      var rows = A.cmp.rows, first = rows[PN[0].id], tb = h("tbody");
      if (gw) {   // 玩法：比的是得分
        var gd = gdesc();
        PN.forEach(function (c, i) {
          var m = rows[c.id], rm = h("button", { class: "iconbtn", type: "button", "aria-label": "移除 " + c.name, text: "✕", onclick: function () { S.compare = S.compare.filter(function (x) { return x !== c; }); A.persist(); loadCompare(); } });
          var nameCell = h("td", null, h("i", { class: "qc-key", style: { "--k": "var(--c-s" + (i + 1) + ")", "margin-right": "6px", "vertical-align": "middle" } }), (i + 1) + ". " + c.name);
          if (!m) { tb.appendChild(h("tr", null, nameCell, h("td", { colspan: 4, text: "…" }), h("td", null, rm))); return; }
          if (m.err || !m.game) { tb.appendChild(h("tr", null, nameCell, h("td", { colspan: 4, text: "出错：" + (m.err || "没有得分") }), h("td", null, rm))); return; }
          var dg = "—";
          if (i > 0 && first && first.SC && m.SC && first.SC.length === m.SC.length) { var d = 0, d2 = 0, n = m.SC.length; for (var k = 0; k < n; k++) { var z = m.SC[k] - first.SC[k]; d += z; d2 += z * z; } var mean = d / n, se = Math.sqrt(Math.max(0, d2 / n - mean * mean) / n); dg = A.gdiff(gd, mean) + (se > 0 ? " ± " + A.gdiff(gd, se).slice(1) : ""); }
          tb.appendChild(h("tr", null, nameCell, h("td", { text: A.gfmt(m.game, m.game.score) + (m.game.se > 0 ? " ± " + A.gdiff(m.game, m.game.se).slice(1) : "") }), h("td", { text: i === 0 ? "参照" : dg }), h("td", { text: A.fmtStep(m.stepNs, m.runMs, true) }), h("td", { text: m.modelSize != null ? A.fmtCount(m.modelSize) : "—" }), h("td", null, rm)));
        });
        host.appendChild(h("div", { class: "tablewrap", style: { "margin-top": "6px" } }, h("table", { class: "data" }, h("thead", null, h("tr", null, ["规则", gd.lower ? "成本" : "得分", "比第 1 条" + (gd.lower ? "省了多少（配对）" : "高出多少（配对）"), "每步用时", "模型大小", ""].map(function (t) { return h("th", { text: t }); }))), tb)));
        return;
      }
      PN.forEach(function (c, i) {
        var m = rows[c.id], rm = h("button", { class: "iconbtn", type: "button", "aria-label": "移除 " + c.name, text: "✕", onclick: function () { S.compare = S.compare.filter(function (x) { return x !== c; }); A.persist(); loadCompare(); } });
        if (!m) { tb.appendChild(h("tr", null, h("td", { text: (i + 1) + ". " + c.name }), h("td", { colspan: 7, text: "…" }), h("td", null, rm))); return; }
        if (m.err) { tb.appendChild(h("tr", null, h("td", { text: (i + 1) + ". " + c.name }), h("td", { colspan: 7, text: "出错：" + m.err }), h("td", null, rm))); return; }
        var s = m.sum, dg = "—";
        if (i > 0 && first && first.WT && m.WT && first.WT.length === m.WT.length && first.sum.T === m.sum.T) { var d = 0, d2 = 0, n = 0; for (var k = 0; k < m.WT.length; k++) if (m.WT[k] > 0 && first.WT[k] > 0) { var z = Math.log(m.WT[k] / first.WT[k]); d += z; d2 += z * z; n++; } if (n > 1) { var mean = d / n / s.years, se = Math.sqrt(Math.max(0, (d2 - d * d / n) / (n - 1)) / n) / s.years; dg = A.pctS(mean) + " ± " + P(se); } }
        tb.appendChild(h("tr", null, h("td", null, h("i", { class: "qc-key", style: { "--k": "var(--c-s" + (i + 1) + ")", "margin-right": "6px", "vertical-align": "middle" } }), (i + 1) + ". " + c.name),
          h("td", { text: s.growth === -Infinity ? "−∞" : A.pctS(s.growth) + " ± " + P(s.growthSE) }), h("td", { text: F(s.sharpe, 2) + " ± " + F(s.sharpeSE, 2) }), h("td", { text: A.pctS(s.meanW - 1) }), h("td", { text: P(s.ddMed, 1) }), h("td", { text: i === 0 ? "参照" : dg }), h("td", { text: A.fmtStep(m.stepNs, m.runMs, true) }), h("td", { text: m.modelSize != null ? A.fmtCount(m.modelSize) : "—" }), h("td", null, rm)));
      });
      host.appendChild(h("div", { class: "tablewrap", style: { "margin-top": "6px" } }, h("table", { class: "data" }, h("thead", null, h("tr", null, ["规则", "增长率", "夏普", "期望收益", "回撤中位数", "相对第 1 条的 Δg（配对）", "每步用时", "模型大小", ""].map(function (t) { return h("th", { text: t }); }))), tb)));
    },
    foot: function () { return pins().length ? (A.isGame() ? "所有规则打的是同一批对局，所以配对差比各自的标准误准得多。" : "所有规则用的是同一批路径，所以最后一列的配对差比各自的标准误准得多。") + (A.cmp.aligned ? "对比里有带训练的规则：所有规则都只在训练段的后 " + Math.round((1 - QL.FIT_FRAC) * 100) + "% 上回测，前面那一段留给模型学。" : "") : ""; }
  };

  CH.scatter = {
    name: "终值与回撤", about: "每个点是一条路径：横轴是它经历的最大回撤，纵轴是期末净值。", keys: "scatter 散点 回撤 终值 风险 收益", when: critOnly,
    spec: function () {
      var r = A.run; if (!r) return "还没有回测结果"; if (r.sum.N < 30) return "路径太少。";
      var N = r.sum.N, n = Math.min(N, 600), xs = [], ys = [], ids = [], i;
      for (i = 0; i < n; i++) { var k = Math.floor(i * N / n); if (r.WT[k] > 0) { xs.push(r.DD[k]); ys.push(r.WT[k]); ids.push(k); } }
      return { x: { label: "最大回撤", fmt: pctTick }, panels: [{ y: { label: "期末净值（对数）", scale: "log" }, layers: [{ kind: "hline", y: 1, color: "axis", width: 1 }, { kind: "points", x: xs, y: ys, color: "s1", r: 2.5, alpha: 0.5, ring: false }] }], legend: [],
        hover: { xs: xs, pts: ys, tip: function (j) { return { title: "路径 #" + ids[j], rows: [{ name: "期末净值", color: "s1", mark: "dot", value: F(ys[j], 3) }, { name: "最大回撤", value: P(xs[j], 1) }], note: "点一下查看这条路径的明细" }; } },
        onClick: function (j) { A.single.n = ids[j]; if (A.shown().indexOf("single") < 0) A.toggleChart("single", true); else { rebuildControls("single"); loadSingle(); } } };
    },
    foot: function () { var r = A.run; return r && r.sum.N > 600 ? "只画了 600 条路径的抽样。" : ""; }
  };

  /* ---------- 模型诊断 ---------- */
  var NO_MODEL = "当前规则没有训练模型。到规则里选\"模型\"一组，或者让 Claude 写一个带 fit 的策略。";
  function diag() { return A.run && A.run.diag; }
  /** 世界的真实条件期望 E[下一步收益 | 第一个特征 = x]；只在能写出来的组合上给出 */
  function truthFor(pd) {
    var st = A.strat(); if (st.id !== "pipe" || pd.feature !== 0) return null;
    var p = A.runP || A.sp(), w = S.world.type, wp = A.wp(), dt = 1 / A.worldCfg().K, level = p.feat === "level";
    if (w === "gbm") return function () { return Math.exp(wp.mu / 100 * dt) - 1; };
    if (w === "iid" && wp.dist !== "cauchy") return function () { return wp.mu / 100 * dt; };
    if (!level && w === "ar1") { var m = wp.mu / 100 * dt; return function (x) { return m + wp.phi * (x - m); }; }
    if (level && w === "ou") { var lt = Math.log(wp.theta / 100), a = Math.exp(-wp.kappa * dt), sd2 = Math.pow(wp.sigma / 100, 2) * (1 - a * a) / (2 * wp.kappa); return function (x) { return Math.exp((lt - x) * (1 - a) + sd2 / 2) - 1; }; }
    if (level && w === "logistic" && !(wp.noise > 0)) { var v = wp.v / 100, sd = 0.35355339; return function (x) { var u = 0.5 + sd * x / v, u2 = wp.a * u * (1 - u); return Math.exp(v * (u2 - 0.5) / sd - x) - 1; }; }
    return null;
  }
  CH.mdlfn = {
    when: priceOnly, name: "学到的函数", about: "模型学到的\"下一步收益关于第一个特征\"的函数，对照训练数据的分组均值；世界的真实条件期望能写出来时也画上。", keys: "model learned function 模型 学到 条件期望 真值 拟合",
    spec: function () {
      var d = diag(); if (!d) return NO_MODEL; var pd = d.pd; if (!pd) return "这个模型没有给出可画的函数。";
      var truth = truthFor(pd), layers = [{ kind: "hline", y: 0, color: "axis", width: 1 }], legend = [{ name: "模型", color: "s1" }, { name: "训练数据的分组均值（±1 标准误）", color: "s2", mark: "dot" }], ty = null;
      layers.push({ kind: "errbar", x: pd.binX, y: pd.binY, se: pd.binSE, color: "s2" }, { kind: "points", x: pd.binX, y: pd.binY, color: "s2", r: 3 });
      if (truth) { ty = pd.xs.map(truth); layers.push({ kind: "line", x: pd.xs, y: ty, color: "s3", width: 7, alpha: 0.4, name: "真实的条件期望" }); legend.push({ name: "这个世界真实的条件期望（宽带）", color: "s3" }); }
      layers.push({ kind: "line", x: pd.xs, y: pd.yhat, color: "s1", name: "模型", end: "模型" });
      return { x: { label: pd.name + (pd.single ? "" : "（其余特征取均值）") }, tableFmt: function (v) { return P(v, 4); }, panels: [{ y: { label: "预测的下一步收益", fmt: function (v) { return P(v, Math.abs(v) < 0.001 ? 3 : 2); } }, layers: layers }], legend: legend,
        hover: { xs: pd.xs, dots: function (i) { return [{ y: pd.yhat[i], color: "s1" }]; }, tip: function (i) { var rows = [{ name: "模型的预测", color: "s1", value: P(pd.yhat[i], 3) }]; if (ty) rows.push({ name: "真实的条件期望", color: "s3", value: P(ty[i], 3) }); return { title: pd.name + " = " + G(pd.xs[i]), rows: rows }; } } };
    },
    foot: function () { var d = diag(); if (!d || !d.pd) return ""; return truthFor(d.pd) ? "绿色的宽带是这个世界里能达到的最好预测。蓝线落在带子里，说明模型学对了；蓝线跟着橙点的抖动走，说明它在拟合噪声。" : "这个世界的条件期望写不出来（或者不只依赖这一个特征），只能拿蓝线和橙点比：蓝线比橙点的走势更曲折，就是过拟合的迹象。"; }
  };
  CH.mdl = {
    when: priceOnly, name: "模型诊断", about: "预测准不准：训练集与验证集的 R²、IC、方向命中率，以及按预测值分组之后的校准图。", keys: "model diagnostics 模型 诊断 r2 ic 校准 命中率 过拟合",
    spec: function () {
      var d = diag(); if (!d) return NO_MODEL; var c = d.calib || []; if (c.length < 2) return "验证样本太少，画不出校准图。";
      var x = c.map(function (q) { return q.pred; }), y = c.map(function (q) { return q.actual; }), se = c.map(function (q) { return q.se; }), lo = Math.min.apply(null, x), hi = Math.max.apply(null, x);
      if (!(hi > lo)) { lo -= 1e-4; hi += 1e-4; }
      var pf = function (v) { return P(v, Math.abs(v) < 0.001 ? 3 : 2); }, padx = 0.05 * (hi - lo);
      return { x: { label: "这一组的平均预测", fmt: pf, domain: [lo - padx, hi + padx] }, tableFmt: function (v) { return P(v, 4); }, panels: [{ y: { label: "这一组的平均实际收益", fmt: pf }, layers: [{ kind: "hline", y: 0, color: "axis", width: 1 }, { kind: "line", x: [lo, hi], y: [lo, hi], color: "s3", dash: [5, 4], name: "完全校准", width: 1.5 }, { kind: "errbar", x: x, y: y, se: se, color: "s1" }, { kind: "points", x: x, y: y, color: "s1", r: 4, name: "验证集" }] }],
        legend: [{ name: "验证集：按预测值从低到高分成 " + c.length + " 组", color: "s1", mark: "dot" }, { name: "完全校准（预测 = 实际）", color: "s3", mark: "dash" }],
        hover: { xs: x, pts: y, tip: function (i) { return { title: "第 " + (i + 1) + " 组（" + c[i].n + " 个样本）", rows: [{ name: "平均预测", value: P(x[i], 3) }, { name: "平均实际", color: "s1", mark: "dot", value: P(y[i], 3) + " ± " + P(se[i], 3) }] }; } } };
    },
    extra: function (host) {
      var d = diag(); if (!d) return;
      host.appendChild(h("div", { class: "statline", style: { padding: "8px 0 0", border: "0" } },
        h("span", null, "训练集 R² ", h("b", { text: F(d.r2Train, 4) })), h("span", null, "验证集 R² ", h("b", { text: F(d.r2Valid, 4) })), h("span", null, "IC ", h("b", { text: F(d.ic, 3) + " ± " + F(d.icSE, 3) })),
        h("span", null, "方向命中率 ", h("b", { text: P(d.hit, 1) })), h("span", null, "样本 ", h("b", { text: d.nTrain + " / " + d.nValid })),
        (A.run && A.run.modelSize != null) || d.size != null ? h("span", null, "模型存了 ", h("b", { text: A.fmtCount(A.run && A.run.modelSize != null ? A.run.modelSize : d.size) })) : null, d.predUs != null ? h("span", null, "预测一次 ", h("b", { text: A.fmtNs(d.predUs * 1000) })) : null));
    },
    foot: function () {
      var d = diag(); if (!d) return "";
      var gap = d.r2Train - d.r2Valid, sh = Math.sqrt(Math.max(0, d.r2Valid) / (1 + Math.max(0, d.r2Valid))), s;
      if (d.r2Valid <= 0) s = "验证集 R² 不大于 0：在没见过的数据上，这个模型还不如直接用均值去猜。";
      else if (d.r2Valid < 0.2) s = "验证集 R² 为 " + F(d.r2Valid, 4) + "：按预测值成比例下注，每步夏普约 √(R²/(1+R²)) = " + F(sh, 3) + "（年化约 " + F(sh * Math.sqrt(A.worldCfg().K), 2) + "，不计成本）。";
      else s = "验证集 R² 为 " + F(d.r2Valid, 4) + "：下一步在很大程度上可以预测。真实的价格序列里见不到这么高的数，见到了先怀疑用了未来的数据。";
      if (gap > 0.01 && gap > 2 * Math.abs(d.r2Valid)) s += "训练集比验证集高出 " + F(gap, 4) + "，过拟合明显。";
      return s + "IC 是预测值与实际值的相关系数；点落在虚线上说明预测的大小也是对的，不只是方向。";
    }
  };
  CH.mdlimp = {
    when: priceOnly, name: "特征重要性", about: "把验证集里某个特征的取值打乱，看预测误差增加多少（置换重要性）。", keys: "feature importance 特征 重要性 置换",
    spec: function () {
      var d = diag(); if (!d) return NO_MODEL; var imp = d.importance || []; if (!imp.length) return "这个模型没有特征。";
      var x0 = [], x1 = [], xc = [], i; for (i = 0; i < imp.length; i++) { x0.push(i + 0.6); x1.push(i + 1.4); xc.push(i + 1); }
      return { x: { label: "特征编号", domain: [0.3, imp.length + 0.7], ticks: xc }, panels: [{ y: { label: "打乱后验证集 R² 的下降", zero: true }, layers: [{ kind: "bars", x0: x0, x1: x1, y: imp, color: "s1", name: "重要性" }] }], legend: [],
        hover: { xs: xc, bars: true, tip: function (k) { return { title: (k + 1) + ". " + (d.names[k] || "特征 " + (k + 1)), rows: [{ name: "R² 的下降", color: "s1", mark: "rect", value: F(imp[k], 4) }] }; } } };
    },
    foot: function () { var d = diag(); if (!d || !d.importance) return ""; return d.importance.map(function (_, k) { return (k + 1) + " = " + (d.names[k] || "特征 " + (k + 1)); }).join("；") + "。负值或接近 0 的柱子表示模型没有真正用到这个特征（或者用错了）。"; }
  };


  /* ---------- 模型对比：把一个选项的每个取值都跑一遍 ---------- */
  A.arena = { res: null, busy: false, prog: 0, id: 0, sig: "" };
  function selParams() { var cur = A.sp(); return (A.strat().params || []).filter(function (q) { return q.type === "select" && !(q.show && !q.show(cur)) && q.options.length > 1; }); }
  function arenaParam(o) {
    var ps = selParams(); if (!ps.length) return null;
    var q = ps.filter(function (x) { return x.key === o.key; })[0];
    if (!q) { q = ps.filter(function (x) { return x.key === "model"; })[0] || ps[0]; o.key = q.key; }
    return q;
  }
  function arenaSig(q) { var p = Object.assign({}, A.sp()); delete p[q.key]; return JSON.stringify([S.stratId, q.key, p, S.set, A.worldKey()]); }
  function arenaFresh(q) { var ar = A.arena; return !!ar.res && !!q && ar.sig === arenaSig(q); }
  A.runArena = function () {
    var o = opt("mdlcmp"), q = arenaParam(o), ar = A.arena; if (!q || ar.busy) return;
    var p = Object.assign({}, A.sp()), set = Object.assign({}, S.set), sig = arenaSig(q), vals = q.options.map(function (x) { return x[0]; });
    ar.busy = true; ar.prog = 0; ar.res = null; rebuildControls("mdlcmp"); refresh("mdlcmp");
    A.sweepEngine().then(function (e) {
      var pr = e.send("sweep", { axes: [{ key: q.key, values: vals }], p: p, set: set, fitKeys: A.fitKeys() }, { timeout: 900000, onProgress: function (d, t) { ar.prog = d / t; var pg = $("arenaProg"); if (pg) pg.value = ar.prog; } });
      ar.id = pr.id; ar.eng = e; return pr;
    }).then(function (m) { ar.busy = false; ar.res = m; ar.sig = sig; ar.bench = A.run && A.run.benchSum ? A.run.benchSum.growth : NaN; rebuildControls("mdlcmp"); refresh("mdlcmp"); })
      .catch(function (e) { ar.busy = false; rebuildControls("mdlcmp"); if (!e.cancelled) A.toast("对比失败：" + (e.message || e)); refresh("mdlcmp"); });
  };
  CH.mdlcmp = {
    when: priceOnly, name: "模型对比", wide: true, about: "把规则里的某个选项（比如用哪个模型）逐个换一遍，各自训练、回测，把预测力和增长率放在一起比。", keys: "model compare arena 模型 对比 擂台 比较 横评 过拟合 选模型",
    controls: function (o, re) {
      var q = arenaParam(o), ar = A.arena, out = []; if (!q) return out;
      var ps = selParams();
      if (ps.length > 1) { var sel = h("select", { "aria-label": "要比较的选项", onchange: function () { o.key = sel.value; ar.res = null; A.persist(); rebuildControls("mdlcmp"); re(); } }, ps.map(function (x) { return h("option", { value: x.key, text: x.label, selected: x.key === q.key }); })); out.push(h("label", null, "比较", sel)); }
      if (ar.busy) { out.push(h("progress", { id: "arenaProg", max: 1, value: ar.prog })); out.push(h("button", { class: "btn small", type: "button", text: "停止", onclick: function () { if (ar.eng) ar.eng.cancel(ar.id); } })); }
      else out.push(h("button", { class: "btn small primary", type: "button", text: arenaFresh(q) ? "重新对比" : "开始对比", onclick: A.runArena }));
      return out;
    },
    spec: function (o) {
      var q = arenaParam(o), ar = A.arena, m = ar.res;
      if (!q) return "当前规则没有可以逐个比较的选项。选\"预测模型流水线\"，就能把十种模型放在一起比。";
      if (ar.busy) return "正在逐个训练并回测…";
      if (!arenaFresh(q)) return (m ? "世界、参数或交易设定变了，上一次的对比已经过期。" : "") + "点\"开始对比\"：\"" + q.label + "\"的 " + q.options.length + " 个取值会在同一批路径上各自训练并回测一次。";
      var n = m.nx, xs = [], i, names = q.options.map(function (x) { return x[1]; }), short = q.options.map(function (x, j) { return q.short && q.short[x[0]] || String(j + 1); });
      for (i = 0; i < n; i++) xs.push(i + 1);
      var cur = q.options.map(function (x) { return x[0]; }).indexOf(A.sp()[q.key]), hasR2 = hasR2m(m), panels = [], legend = [];
      var band = cur >= 0 ? { kind: "vband", x0: cur + 0.5, x1: cur + 1.5, color: "ink", alpha: 0.06 } : null;
      if (hasR2) {
        var tr = arr(m.r2Train), va = arr(m.r2Valid), mid = tr.map(function (v, j) { return (v + va[j]) / 2; }), half = tr.map(function (v, j) { return Math.abs(v - va[j]) / 2; });
        var L1 = [{ kind: "hline", y: 0, color: "axis", width: 1 }, { kind: "errbar", x: xs, y: mid, se: half, color: "neutral", cap: 0 }, { kind: "points", x: xs, y: tr, color: "s2", r: 4, name: "训练集 R²", tfmt: function (v) { return F(v, 4); } }, { kind: "points", x: xs, y: va, color: "s1", r: 4.5, name: "验证集 R²", tfmt: function (v) { return F(v, 4); } }];
        if (band) L1.unshift(band);
        panels.push({ y: { label: "R²（对下一步收益的预测）", domain: r2Domain(m), fmt: objTick("r2") }, layers: L1 });
        legend.push({ name: "验证集 R²", color: "s1", mark: "dot" }, { name: "训练集 R²（两点的距离就是过拟合的程度）", color: "s2", mark: "dot" });
      }
      var g = arr(m.growth).map(function (v) { return v === -Infinity ? NaN : v; }), gse = arr(m.growthSE), L2 = [{ kind: "hline", y: 0, color: "axis", width: 1 }];
      if (band) L2.unshift(band);
      if (ar.bench === ar.bench) L2.push({ kind: "hline", y: ar.bench, color: "ink2", dash: [4, 3], width: 1.2, label: "基准" });
      L2.push({ kind: "errbar", x: xs, y: g, se: gse, color: "s1" }, { kind: "points", x: xs, y: g, color: "s1", r: 4.5, name: "长期增长率", tfmt: function (v) { return P(v, 2); } });
      panels.push({ y: { label: "长期增长率（" + per() + "，±1 标准误）", fmt: objTick("growth") }, layers: L2 });
      if (!hasR2) legend.push({ name: "长期增长率 ± 1 标准误", color: "s1", mark: "dot" });
      if (band) legend.push({ name: "当前选用", color: "ink", mark: "band" });
      return { height: hasR2 ? 380 : 250, x: { label: q.label, domain: [0.4, n + 0.6], ticks: xs, stagger: true, fmt: function (v) { return short[Math.round(v) - 1] || ""; } }, panels: panels, legend: legend,
        hover: { xs: xs, dots: function (j) { var d = [{ y: g[j], color: "s1", panel: panels.length - 1 }]; if (hasR2) d.push({ y: m.r2Valid[j], color: "s1", panel: 0 }, { y: m.r2Train[j], color: "s2", panel: 0 }); return d; },
          tip: function (j) {
            var rows = []; if (hasR2 && m.r2Valid[j] === m.r2Valid[j]) rows.push({ name: "验证集 R²", color: "s1", mark: "dot", value: F(m.r2Valid[j], 4) }, { name: "训练集 R²", color: "s2", mark: "dot", value: F(m.r2Train[j], 4) }, { name: "IC", value: F(m.ic[j], 3) });
            rows.push({ name: "长期增长率", color: "s1", mark: "dot", value: m.growth[j] === -Infinity ? "−∞（有路径破产）" : P(m.growth[j], 2) + " ± " + P(m.growthSE[j], 2) }, { name: "夏普", value: F(m.sharpe[j], 2) }, { name: per() + "换手", value: F(m.turnover[j], 1) + " 倍" });
            return { title: names[j], rows: rows, note: j === cur ? "当前选用" : "点一下换成它" };
          } },
        onClick: function (j) { var v = q.options[j][0], p = A.sp(); if (p[q.key] === v) return; p[q.key] = v; A.renderStrat(); A.requestRun("commit"); } };
    },
    extra: function (host) {
      var o = opt("mdlcmp"), q = arenaParam(o), ar = A.arena, m = ar.res; if (!q || !arenaFresh(q) || ar.busy || !m.fitMs) return;
      var G = window.QL_GUIDE, th = {}; if (G && G.models && q.key === "model") G.models.forEach(function (x) { th[x.id] = x; });
      var hasTh = Object.keys(th).length > 0, tb = h("tbody"), curV = A.sp()[q.key];
      q.options.forEach(function (x, j) {
        var t = th[x[0]], cells = [h("td", null, (j + 1) + ". " + x[1] + (x[0] === curV ? "（当前）" : "")), h("td", { text: m.r2Valid[j] === m.r2Valid[j] ? F(m.r2Valid[j], 4) : "—" }), h("td", { text: m.growth[j] === -Infinity ? "−∞" : P(m.growth[j], 2) }),
          h("td", { text: A.fmtMs(m.fitMs[j]) }), h("td", { text: m.predUs[j] === m.predUs[j] ? A.fmtNs(m.predUs[j] * 1000) : "—" }), h("td", { text: m.size[j] === m.size[j] ? A.fmtCount(m.size[j]) : "—" })];
        if (hasTh) cells.push(h("td", { class: "txt", text: t ? t.fit : "" }), h("td", { class: "txt", text: t ? t.pred : "" }), h("td", { class: "txt", text: t ? t.mem : "" }));
        tb.appendChild(h("tr", null, cells));
      });
      var head = [q.label, "验证集 R²", "增长率", "训练用时", "预测一次", "存了多少"].concat(hasTh ? ["训练的计算量", "预测的计算量", "存储"] : []);
      host.appendChild(h("div", { class: "tablewrap", style: { "margin-top": "8px", "max-height": "none" } }, h("table", { class: "data" }, h("caption", { text: "算得多快、存了多少（用时是在这台设备上量的）" }), h("thead", null, h("tr", null, head.map(function (t) { return h("th", { text: t }); }))), tb)));
      host.appendChild(h("div", { class: "note", style: { "margin-top": "4px" } }, hasTh ? "记号：n 训练样本数，d 特征数，k 近邻数，B 树的棵数，h 树的深度，H 隐层宽度，E 训练轮数，I 迭代轮数。" : "", A.helpBtn("algos", "各种算法的计算量和存储怎么比")));
    },
    foot: function (o) {
      var q = arenaParam(o), ar = A.arena, m = ar.res; if (!q || !arenaFresh(q) || ar.busy) return "";
      var names = q.options.map(function (x) { return x[1]; }), bg = -1, br = -1, i;
      for (i = 0; i < m.nx; i++) { if (m.growth[i] === m.growth[i] && (bg < 0 || m.growth[i] > m.growth[bg])) bg = i; if (m.r2Valid[i] === m.r2Valid[i] && (br < 0 || m.r2Valid[i] > m.r2Valid[br])) br = i; }
      var s = "";
      if (br >= 0) s += "验证集 R² 最高：" + names[br] + "（" + F(m.r2Valid[br], 4) + "）。";
      if (bg >= 0) s += "增长率最高：" + names[bg] + "（" + P(m.growth[bg], 2) + "）。";
      if (br >= 0 && bg >= 0 && br !== bg) s += "两者不是同一个：预测得准只是一半，仓位怎么随预测变、换手多少同样决定收益。";
      s += "比较了 " + m.nx + " 个取值，即使它们全无差别，最好的那个也会领先约 " + QL.expectedMaxNormal(m.nx).toFixed(1) + " 个标准误；选定之后用\"用新路径检验\"核对。";
      if (!(q.short)) s += "横轴的编号：" + names.map(function (nm, j) { return (j + 1) + " = " + nm; }).join("；") + "。";
      return s;
    }
  };
  function hasR2m(m) { return !!m && !!m.r2Valid && Array.prototype.some.call(m.r2Valid, function (v) { return v === v; }); }

  /* ---------- 小控件 ---------- */
  function toggle(label, on, fn) { var cb = h("input", { type: "checkbox", checked: on }); cb.addEventListener("change", function () { fn(cb.checked); A.persist(); }); return h("label", null, cb, label); }
  function seg(items, cur, fn) { var s = h("span", { class: "seg" }); items.forEach(function (it) { s.appendChild(h("button", { type: "button", "aria-pressed": it[0] === cur ? "true" : "false", text: it[1], onclick: function () { arr(s.children).forEach(function (b) { b.setAttribute("aria-pressed", "false"); }); this.setAttribute("aria-pressed", "true"); fn(it[0]); A.persist(); } })); }); return s; }
  A.seg = seg;

  /* ---------- 表格视图 ---------- */
  function tableOf(spec) {
    if (spec.type === "heat") {
      var f = spec.fmt || F, head = [(spec.yLabel || "") + " \\ " + (spec.xLabel || "")].concat(spec.xs.map(function (v) { return F(v); })), rows = [];
      for (var j = spec.ys.length - 1; j >= 0; j--) rows.push([F(spec.ys[j])].concat(spec.xs.map(function (_, i) { var v = spec.values[j * spec.xs.length + i]; return v === v ? f(v) : "—"; })));
      return { head: head, rows: rows };
    }
    var cols = [], xs = null, xname = spec.x.label || "x";
    spec.panels.forEach(function (pn) { pn.layers.forEach(function (l) {
      if (!l.name) return;
      if (l.kind === "bars") { if (!xs) { xs = l.x0.map(function (v, i) { return F(v) + " – " + F(l.x1[i]); }); } cols.push({ name: l.name, y: l.y }); }
      else if (l.kind === "band") { if (!xs) xs = l.x.map(function (v) { return F(v); }); cols.push({ name: l.name + " 下沿", y: l.lo }, { name: l.name + " 上沿", y: l.hi }); }
      else if (l.x && l.y) { if (!xs) xs = l.x.map(function (v) { return spec.x.fmt ? spec.x.fmt(v) : F(v); }); cols.push({ name: l.name, y: l.y, fmt: l.tfmt }); }
    }); });
    if (!xs || !cols.length) return null;
    var n = xs.length, stride = Math.max(1, Math.ceil(n / 80)), out = [];
    var tf = spec.tableFmt || F;
    for (var i = 0; i < n; i += stride) out.push([xs[i]].concat(cols.map(function (c) { var v = c.y[i]; return v == null || !(v === v) ? "—" : (c.fmt || tf)(v); })));
    return { head: [xname].concat(cols.map(function (c) { return c.name; })), rows: out, thinned: stride > 1 };
  }

  /* ---------- 卡片 ---------- */
  function mount(id) {
    var def = CH[id]; if (!def || cards[id]) return;
    if (def.wide && S.wide[id] == null) S.wide[id] = true;
    var o = opt(id), ctl = h("div", { class: "card-c" }), body = h("div", { class: "card-b" }), chartHost = h("div"), tableHost = h("div", { hidden: true }), extra = h("div"), foot = h("div", { class: "card-f" });
    var tbBtn = h("button", { class: "iconbtn", type: "button", "aria-pressed": "false", title: "切换表格视图", text: "表格", onclick: function () { c.table = !c.table; tbBtn.setAttribute("aria-pressed", c.table ? "true" : "false"); refresh(id); } });
    var wideBtn = h("button", { class: "iconbtn", type: "button", "aria-pressed": S.wide[id] ? "true" : "false", title: "占满整行", text: "加宽", onclick: function () { S.wide[id] = !S.wide[id]; el.classList.toggle("wide", !!S.wide[id]); wideBtn.setAttribute("aria-pressed", S.wide[id] ? "true" : "false"); A.persist(); if (!def.plain) c.chart.draw(); } });
    var el = h("section", { class: "card" + (S.wide[id] ? " wide" : ""), "data-chart": id, "aria-label": A.chartName(id) },
      h("div", { class: "card-h" }, h("h3", { text: A.chartName(id), title: def.about }), A.helpBtn("chart:" + id, "这张图回答什么问题、怎么读"), def.plain ? null : tbBtn, wideBtn, h("button", { class: "iconbtn", type: "button", "aria-label": "收起 " + A.chartName(id), text: "✕", onclick: function () { A.toggleChart(id, false); } })),
      ctl, body, foot);
    body.appendChild(chartHost); body.appendChild(tableHost); body.appendChild(extra);
    var c = cards[id] = { el: el, def: def, ctl: ctl, chartHost: chartHost, tableHost: tableHost, extra: extra, foot: foot, table: false, chart: new QLChart.Chart(chartHost, { height: 250 }) };
    $("grid").appendChild(el); rebuildControls(id);
  }
  var FOCUSABLE = "button, select, input, textarea";
  function rebuildControls(id) {
    var c = cards[id]; if (!c) return;
    // 这一排控件是整排重建的：原来焦点在其中第几个上，重建之后还给第几个（用键盘操作时不至于每按一下就丢焦点）
    var ae = document.activeElement, at = ae && c.ctl.contains(ae) ? Array.prototype.indexOf.call(c.ctl.querySelectorAll(FOCUSABLE), ae) : -1;
    clear(c.ctl); var items = c.def.controls ? c.def.controls(opt(id), function () { refresh(id); }) : []; c.ctl.hidden = !items.length; items.forEach(function (x) { c.ctl.appendChild(x); });
    if (at >= 0) { var L = c.ctl.querySelectorAll(FOCUSABLE), n = L[Math.min(at, L.length - 1)]; if (n && !n.disabled) { try { n.focus({ preventScroll: true }); } catch (e) {} } }
  }
  function refresh(id) {
    var c = cards[id]; if (!c) return; var o = opt(id), spec;
    try { spec = c.def.spec(o); } catch (e) { console.error(e); spec = "这张图画不出来：" + (e.message || e); }
    clear(c.extra);
    if (spec == null) { c.tableHost.hidden = true; c.chartHost.hidden = true; c.foot.textContent = c.def.foot ? c.def.foot(o) || "" : ""; }
    else if (typeof spec === "string") { c.tableHost.hidden = true; c.chartHost.hidden = false; c.chart.message(spec); c.chart.h = 150; c.chart.draw(); c.foot.textContent = ""; }
    else {
      if (!spec.height) spec.height = spec.type === "heat" ? 330 : 250;
      var tb = c.table ? tableOf(spec) : null;
      if (tb) {
        c.chartHost.hidden = true; c.tableHost.hidden = false; clear(c.tableHost);
        c.tableHost.appendChild(h("div", { class: "tablewrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, tb.head.map(function (t) { return h("th", { text: t }); }))), h("tbody", null, tb.rows.map(function (r) { return h("tr", null, r.map(function (v) { return h("td", { text: v }); })); })))));
        if (tb.thinned) c.tableHost.appendChild(h("div", { class: "note", style: { "margin-top": "4px" }, text: "行数较多，表格里做了等间隔抽取。" }));
      } else { c.tableHost.hidden = true; c.chartHost.hidden = false; c.chart.set(spec); c.chart.cv.setAttribute("aria-label", A.chartName(id) + "。" + c.def.about + " 按\"表格\"查看数值。"); }
      c.foot.textContent = c.def.foot ? c.def.foot(o) || "" : "";
    }
    if (c.def.extra) c.def.extra(c.extra);
    c.foot.hidden = !c.foot.textContent;
  }
  A.refreshChart = refresh; A.rebuildControls = rebuildControls;
  function unmount(id) { if (cards[id]) { cards[id].chart.destroy(); cards[id].el.remove(); delete cards[id]; } }
  /** 换了世界：把图表架换成这个世界自己的那一组（玩法和价格世界各记各的），用不上的图收起来 */
  A.syncCharts = function () {
    var want = A.shown().filter(function (id) { return A.chartOk(id); });
    Object.keys(cards).forEach(unmount);                       // 卡片的标题、小问号都跟着世界变，干脆重建
    want.forEach(mount); want.forEach(refresh);
    A.single.data = null; A.lev.res = null;
    A.sweep.res = null; A.sweep.claim = null; if (cards.sweep) { rebuildControls("sweep"); refresh("sweep"); }
    A.renderShelf();
  };
  A.toggleChart = function (id, scroll, byUser) {
    if (!A.chartOk(id)) { A.toast("这张图在当前的世界里用不上"); return; }
    var L = A.shown(), i = L.indexOf(id);
    if (i >= 0 && scroll !== true) { L.splice(i, 1); unmount(id); if (id === "scenes" && A.scenesStop) A.scenesStop(true); }   // 收起了就别在后台接着算；跑到一半的结果也不留
    else if (i >= 0) { /* 已显示：只滚动过去 */ }
    else { L.push(id); mount(id); refresh(id); if (id === "lev") loadLev(); if (id === "single") loadSingle(); if (id === "compare") loadCompare(); if (id === "scenes" && A.scenesMaybeRun) A.scenesMaybeRun(); }
    A.renderShelf(); A.persist();
    if (cards[id] && (scroll || (i < 0 && byUser))) reveal(id);   // 你自己点开的图排在最后面，不滚过去就像没反应；页面替你打开的（选了带模型的规则时）不抢镜头
  };
  /** 把一张图滚到眼前，并在接下来的一小段时间里"按住"它：别的图陆续画出来、结果栏变高，都会把它挤走，
   *  所以这段时间里版面一变就重新对齐一次。你自己一动手（滚轮、触摸、点按、按键），就松开。 */
  var revealWait = null, pin = null;
  function scrollToCard(id) { var c = cards[id]; if (!c) return; try { c.el.scrollIntoView({ behavior: "auto", block: "start" }); } catch (e) { c.el.scrollIntoView(true); } }
  function reveal(id, holdMs, stay) {
    if (window.matchMedia("(max-width: 779.9px)").matches) { if (stay) { if ($("app").dataset.tab !== "res") return; } else A.setTab("res"); }   // stay：不替你换页
    pin = { id: id, until: Date.now() + (holdMs || 1500) };
    setTimeout(function () { if (pin && pin.id === id) scrollToCard(id); }, 60);
  }
  function repin() { if (!pin) return; if (Date.now() > pin.until || !cards[pin.id]) { pin = null; return; } scrollToCard(pin.id); }
  function unpin() { pin = null; revealWait = null; }
  /** 把这几张图都打开，把第一张（要你看的那一张）滚到眼前。afterRun：接下来还有一次回测，结果栏和各张图会跟着重排，等它跑完再对齐一次 */
  A.showCharts = function (ids, afterRun, stay) {
    ids = ids.filter(function (id) { return A.chartOk(id); }); ids.forEach(function (id) { if (A.shown().indexOf(id) < 0) A.toggleChart(id); });
    var first = ids[0]; if (!first) return;
    if (stay && window.matchMedia("(max-width: 779.9px)").matches) return;   // 窄屏上留在原来那一页：图已经打开了，要看的时候自己切过去
    A.toggleChart(first, true);
    revealWait = afterRun ? { id: first, t: Date.now() } : null;
  };
  A.on("run", function () { var w = revealWait; revealWait = null; if (w && Date.now() - w.t < 180000 && cards[w.id]) reveal(w.id, 6000, true); });   // 这期间你要是切到了别的页，就不再拽回来
  A.renderShelf = function () {
    var ae = document.activeElement, keep = ae && ae.classList && ae.classList.contains("chip") && $("shelf").contains(ae) ? ae.getAttribute("data-chart") : "";
    setTimeout(function () { if (!keep || (document.activeElement && document.activeElement !== document.body)) return; var b = $("shelf").querySelector('.chip[data-chart="' + keep + '"]'); if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} } }, 0);
    var host = clear($("shelf")); host.appendChild(h("span", { class: "lab", text: "图表" }));
    Object.keys(CH).forEach(function (id) { if (!A.chartOk(id)) return; host.appendChild(h("button", { class: "chip", type: "button", "data-chart": id, "aria-pressed": A.shown().indexOf(id) >= 0 ? "true" : "false", title: CH[id].about, text: A.chartName(id), onclick: function () { A.toggleChart(id, undefined, true); } })); });
  };
  A.initCharts = function () {
    var pane = $("paneRes");
    if (pane) {
      ["wheel", "touchmove", "pointerdown", "keydown"].forEach(function (ev) { pane.addEventListener(ev, unpin, { passive: true }); });
      if (window.ResizeObserver) { var ro = new ResizeObserver(function () { repin(); }); ro.observe($("grid")); ro.observe($("summary")); }
    }
    S.charts = S.charts.filter(function (id) { return CH[id]; }); S.gcharts = S.gcharts.filter(function (id) { return CH[id]; });
    A.renderShelf(); A.shown().filter(function (id) { return A.chartOk(id); }).forEach(mount); Object.keys(cards).forEach(refresh);
    A.on("world", function () { ["paths", "retdist", "acf"].forEach(refresh); });
    A.on("run", function () {
      ["equity", "dist", "dd", "scatter", "mdlfn", "mdl", "mdlimp"].forEach(refresh);
      if (A.run && A.run.diag && !A.isGame() && !opt("__flags").mdlAuto) {   // 只自动调出一次（记在本机），之后由用户自己开关
        opt("__flags").mdlAuto = true; A.persist(); var want = ["mdlfn", "mdl"]; if (selParams().some(function (q) { return q.key === "model"; })) want.push("mdlcmp");
        want.forEach(function (id) { if (A.shown().indexOf(id) < 0) A.toggleChart(id); }); A.toast("已显示模型诊断图");
      }   // 第一次用到模型时，把诊断图调出来
    });
    var lazyLev = A.debounce(loadLev, 220), lazyCmp = A.debounce(loadCompare, 300), lastStrat = S.stratId, lastSig = sweepSig();
    function sweepSig() { return numParams().map(function (q) { return q.key; }).join(","); }
    A.on("commit", function () {
      lazyLev(); loadSingle(); lazyCmp();
      if (lastStrat !== S.stratId) { lastStrat = S.stratId; A.sweep.res = null; A.sweep.claim = null; rebuildControls("sweep"); refresh("sweep"); lastSig = sweepSig(); }   // 换了规则：扫描的参数表跟着换
      else if (sweepSig() !== lastSig) { lastSig = sweepSig(); rebuildControls("sweep"); refresh("sweep"); }
      if (A.shown().indexOf("mdlcmp") >= 0 && !A.arena.busy) { rebuildControls("mdlcmp"); refresh("mdlcmp"); }                          // 同一条规则里换了模型：可扫的参数变了
      else if (A.sweep.res) refresh("sweep");                                                                                                   // 只是参数变了："当前"标记跟着移动
    });
    A.on("error", function () { ["equity", "dist", "dd", "scatter", "lev", "single"].forEach(function (id) { var c = cards[id]; if (c) { c.chart.message("规则没有跑通，见上方的错误信息"); } }); });
    var mq = window.matchMedia("(prefers-color-scheme: dark)"), redraw = function () { Object.keys(cards).forEach(function (id) { cards[id].chart.draw(); }); };
    if (mq.addEventListener) mq.addEventListener("change", redraw);
    if (window.MutationObserver) new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  };
  A.loadLev = loadLev; A.loadSingle = loadSingle; A.loadCompare = loadCompare;
})(App);
