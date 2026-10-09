// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（五）：手册。
 * 一个平时收起的说明层：顶栏的"手册"按钮、每个标题旁的小问号、? 键、命令面板都能把它调出来，
 * 并且直接落在对应的那一条上。内容在 guide*.js 里；这里只管怎么排、怎么找、怎么从条目跳回实验。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, S = A.state, QL = A.QL, F = A.F, P = A.P, G = window.QL_GUIDE || { start: [], charts: {}, games: {}, worlds: {}, strats: {}, gstrats: {}, algo: {}, models: [], glossary: [], figs: {}, tour: [] };
  /* 独立的网页里右栏不是 Claude，而是使用者自己接入的 AI：讲那块面板的一页换成另一种写法（guide.js 里的 web），别处泛指那位助手的地方跟着改口 */
  if (!A.aiHost) {
    (G.start || []).forEach(function (s) { if (s.web) { s.title = s.web.title; s.keys = s.web.keys; s.body = s.web.body; delete s.web; } });
    (function swap(o, seen) {
      if (seen.indexOf(o) >= 0) return; seen.push(o);
      for (var k in o) { var v = o[k]; if (typeof v === "string") { if (v.indexOf("Claude") >= 0) o[k] = A.aiSay(v); } else if (v && typeof v === "object" && !(v instanceof Node)) swap(v, seen); }
    })(G, []);
  }
  var MX = { seed: QL.live.SEED };                // 对照表：清单是现成的，格子在这台电脑上现算（app-live.js）。真正用到时才去取 A.matrix
  function mxAll() { return A.matrix; }
  var ui = null, curKey = "", idx = null;
  function flags() { var f = S.copt.__flags; if (!f || typeof f !== "object") f = S.copt.__flags = {}; return f; }
  function narrow() { return window.matchMedia("(max-width: 779.9px)").matches; }

  /* ---------- 小零件 ---------- */
  function md(src, cls) { var el = h("div", cls ? { class: cls } : null); QLMD.mount(el, G.code ? G.code(src) : src); return el; }
  function sec(title) { var s = h("section", { class: "gd-sec" }, h("h3", { text: title })); for (var i = 1; i < arguments.length; i++) add(s, arguments[i]); return s; }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; } el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c))); }
  function fig(name) {
    var f = G.figs[name]; if (!f) return null;
    var box = h("div", { class: "scroll", html: f.svg });
    return h("figure", { class: "gd-fig" }, box, h("figcaption", { text: f.cap }));
  }
  function btn(label, fn, primary) { return h("button", { class: "btn" + (primary ? " primary" : ""), type: "button", text: label, onclick: fn }); }
  function link(label, key) { return h("button", { class: "gd-a", type: "button", text: label, onclick: function () { show(key); } }); }
  function ul(items) { return h("ul", { class: "gd-ul" }, items.map(function (x) { var li = h("li"); QLMD.mount(li, x); li.classList.remove("md"); li.classList.add("md-in"); return li; })); }
  function stratBy(id) { var L = A.allStrats(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  function wname(type) { var w = QL.WORLDS[type]; return type === "custom" && S.custom ? "自定义：" + S.custom.name : w.name; }
  function closeThen(fn) { return function () { if (ui) ui.close(); setTimeout(fn, 0); }; }

  /* ================================================================== *
   *  把实验摆成某个样子（手册里的"带我去""去试试"）
   * ================================================================== */
  /** go 里可以写：
   *  world / ds / resetW / wp      换到哪个世界、用哪份数据、世界的参数（resetW：先回到默认值）
   *  std                           标准设定：默认的路径数和步数、对照表用的种子、默认的交易设定。手册里引用的数字都是在这个设定下算的
   *  N / T / K / seed              个别地改
   *  strat / resetS / sp           换到哪条规则、它的参数
   *  copt / scenes / charts        图表的选项、"场景对比"用哪种看法、要打开哪些图
   *  claude / note                 打开 Claude 面板；摆好之后给一句提示 */
  A.applySetup = function (go) {
    if (go.world && QL.WORLDS[go.world] && !(go.world === "custom" && !S.custom)) {
      if (go.world !== S.world.type) A.setWorldType(go.world, true);   // 只改状态：等规则也换好了，最后一起重画、只跑一次
      var d = QL.WORLDS[go.world], D0 = QL.DEFAULT_SET;
      if (go.ds && A.datasets.some(function (x) { return x.id === go.ds; })) S.world.dsId = go.ds;
      if (go.resetW) S.wparams[go.world] = {};
      if (go.std) {
        S.world.N = d.defaults.N;
        if (!d.game && go.world !== "real") { S.world.T = d.defaults.T; if (!d.needsData) S.world.K = d.defaults.K; }
        S.world.seed = MX.seed;
        ["costBps", "rf", "lam", "ddLimit", "ddProb"].forEach(function (k) { S.set[k] = D0[k]; });
        if (d.bounds) { S.set.fmin = d.bounds[0]; S.set.fmax = d.bounds[1]; S.set._saved = [D0.fmin, D0.fmax]; } else { S.set.fmin = D0.fmin; S.set.fmax = D0.fmax; }
      }
      if (go.N) S.world.N = go.N; if (go.T) S.world.T = go.T; if (go.K) S.world.K = go.K; if (go.seed != null) S.world.seed = go.seed;
      var wp = A.wp(); if (go.wp) Object.keys(go.wp).forEach(function (k) { wp[k] = go.wp[k]; });
    }
    if (go.strat) { var st = stratBy(go.strat); if (st && A.stratOk(st)) { S.stratId = st.id; if (go.resetS) S.sparams[st.id] = {}; A.fitMs = null; } }
    A.fixStrat();
    if (go.sp) { var sp = A.sp(); Object.keys(go.sp).forEach(function (k) { sp[k] = go.sp[k]; }); A.sp(); }   // 再取一次：超出这个场景允许范围的收回来
    if (go.copt) Object.keys(go.copt).forEach(function (k) { S.copt[k] = JSON.parse(JSON.stringify(go.copt[k])); if (k === "sweep" && A.sweep) A.sweep.res = null; });
    if (go.scenes && A.scenesSet) A.scenesSet(go.scenes);
    A.renderWorld(); A.renderSettings(); A.renderStrat(); A.worldChanged(true);
    if (go.charts) { A.showCharts(go.charts, true); go.charts.forEach(function (id) { if (A.chartOk(id)) { A.rebuildControls(id); A.refreshChart(id); } }); }
    if (go.claude) A.openClaude(true); else if (narrow()) A.setTab("res");
    if (go.note) A.toast(go.note, 4200);
    A.persist();
  };
  /** 对照表里的一格摆到页面上：世界、规则、种子、交易设定都按算表时的来，所以看到的是同一个数 */
  var STD_NOTE = "已按对照表的设定摆好：默认参数、种子 " + MX.seed + "、默认的交易设定。";

  /* ================================================================== *
   *  条目的目录
   * ================================================================== */
  function flat(o, out) { if (typeof o === "string") out.push(o); else if (Array.isArray(o)) o.forEach(function (x) { flat(x, out); }); else if (o && typeof o === "object") for (var k in o) if (k !== "svg" && typeof o[k] !== "function") flat(o[k], out); return out; }
  function buildIndex() {
    var L = [];
    G.start.forEach(function (s) { L.push({ key: "start:" + s.id, group: "从这里开始", title: s.title, keys: s.keys || "", src: s.body }); });
    L.push({ key: "glossary", group: "从这里开始", title: "名词", keys: "名词 术语 词汇 解释 是什么 行话", src: G.glossary });
    L.push({ key: "now", group: "当前", title: "当前的细则", keys: "规则 游戏规则 细则 当前 现在 这一局 计分 基准 怎么算 怎么玩" });
    L.push({ key: "games", group: "玩法", title: "总览：玩法、世界、规则", keys: "玩法 游戏 十套 四套 观测 规则方案 总览 世界 三层 架构 区别" });
    L.push({ key: "game:trade", group: "玩法", title: A.TRADE.name, keys: "交易 仓位 价格 trade 净值 三种口径 定仓位 " + A.TRADE.blurb });
    QL.GAMES.forEach(function (t) { var w = QL.WORLDS[t]; L.push({ key: "game:" + t, group: "十套玩法", title: w.name, keys: w.short + " " + t + " " + w.blurb, src: G.games[t] }); });
    QL.OBS.forEach(function (t) { var w = QL.WORLDS[t]; L.push({ key: "game:" + t, group: QL.OBS_GROUP, title: w.name, keys: w.short + " " + t + " 观测 自然 物理 " + w.blurb, src: G.games[t] }); });
    QL.WORLD_GROUPS.forEach(function (g) {
      if (g === QL.GAME_GROUP || g === QL.OBS_GROUP) return;
      Object.keys(QL.WORLDS).forEach(function (t) { var w = QL.WORLDS[t]; if (w.group !== g || w.game) return; var ob = (G.worldObs || {})[t]; L.push({ key: "world:" + t, group: "世界", sub: g, title: w.short, keys: w.name + " " + t + " " + w.blurb + (ob ? " 不当价格 研究对象 观测 物理" : ""), src: [G.worlds[t], ob ? ob.md : ""] }); });
    });
    A.allStrats().forEach(function (st) {
      if (!st || !st.id) return;
      var nm = st.name || st.id;
      if (st.game) { var gw = QL.WORLDS[st.game]; if (!gw) return; L.push({ key: "strat:" + st.id, group: "规则", hidden: true, title: nm, kicker: gw.short, keys: st.id + " " + (st.summary || "") + " " + (G.gstrats[st.id] || "") }); return; }
      L.push({ key: "strat:" + st.id, group: "规则", sub: st.src ? "我的策略" : st.group, title: st.src ? nm : nm.replace(/（.*$/, ""), full: nm, keys: st.id + " " + nm + " " + (st.summary || ""), src: G.strats[st.id] });   // 自己写的规则名字原样显示
    });
    Object.keys(A.CH).forEach(function (id) { L.push({ key: "chart:" + id, group: "图表", title: A.CH[id].name, keys: (A.CH[id].keys || "") + " " + A.CH[id].about, src: G.charts[id] }); });
    L.push({ key: "matrix", group: "对照", title: "对照表：规则 × 场景", keys: "对照 矩阵 对比 场景 规则 世界 应用场景 横向 一览 matrix" });
    L.push({ key: "algos", group: "对照", title: "算法对比：计算量与存储", keys: "算法 复杂度 时间 空间 存储 训练 用时 complexity 优劣 比较", src: [G.algoNotes, G.models] });
    L.push({ key: "selfcheck", group: "对照", title: "自检：在这台电脑上核对", keys: "自检 核对 验证 现算 检查 对不对 可信 self check 定理 模拟", src: (G.checks || []).map(function (c) { return c.say; }) });
    var by = {}; L.forEach(function (e) { by[e.key] = e; });
    return { list: L, by: by };
  }
  function textOf(e) { if (e._t == null) e._t = (e.title + " " + (e.full || "") + " " + (e.keys || "") + " " + (e.src ? flat(e.src, []).join(" ") : "")).toLowerCase(); return e._t; }

  /* ================================================================== *
   *  各种条目怎么排
   * ================================================================== */
  function head(host, kicker, title, lede, acts) {
    host.appendChild(h("div", { class: "gd-kicker", text: kicker }));
    host.appendChild(h("h2", { class: "gd-title", text: title }));
    if (lede) host.appendChild(typeof lede === "string" ? h("p", { class: "gd-lede", text: lede }) : lede);
    if (acts && acts.length) host.appendChild(h("div", { class: "gd-acts" }, acts));
  }
  function body(host, blocks) {
    (blocks || []).forEach(function (b) {
      if (typeof b === "string") host.appendChild(md(b));
      else if (b.fig) add(host, fig(b.fig));
      else if (b.tour) host.appendChild(tour());
    });
  }
  function tour() {
    return h("ol", { class: "gd-tour" }, G.tour.map(function (t, i) {
      return h("li", null, h("div", { class: "gd-tour-n", text: String(i + 1) }), h("div", null, h("h4", { text: t.t }), md(t.md), h("div", { class: "gd-acts" }, btn("带我去", closeThen(function () { A.applySetup(t.go); }), true))));
    }));
  }

  /* ---------- 当前的细则 ---------- */
  function mn(x) { return String(x).replace(/-/g, "−"); }      // 正文里的负号
  /** 一个世界现在的参数，写成一句话 */
  function paramLine(schema, vals) {
    return (schema || []).filter(function (q) { return !q.show || q.show(vals); }).map(function (q) {
      var v = vals[q.key];
      if (q.type === "select") { var o = (q.options || []).filter(function (x) { return x[0] === v; })[0]; return q.label + "：" + (o ? o[1] : v); }
      if (q.type === "bool") return q.label + "：" + (v ? "是" : "否");
      return q.label + " = " + mn(v) + (q.unit ? " " + q.unit : "");
    }).join("；");
  }
  function rulesList(items) { return h("ol", { class: "gd-rules" }, items.map(function (x) { return h("li", null, h("span", { text: x })); })); }
  function priceRules() {
    var w = S.world, d = A.wdef(), cfg = A.worldCfg(), set = S.set, st = A.strat(), ws = A.worldStats && A.worldStatsKey === A.worldKey() ? A.worldStats : null;
    var N = ws ? ws.N : cfg.N, T = ws ? ws.T : cfg.T, K = cfg.K, L = [], ds = d.needsData ? A.dataset() : null, bet = !!d.bounds, fit = A.hasFit(st), wp = A.wp();
    var known = !!ws || !d.needsData;   // 真实数据的路径数和步数要等后台算出来才知道；还没到时不写数字（到了这一页会自己刷新）
    var stepIs = K === 252 ? "一个交易日" : K === 12 ? "一个月" : K === 52 ? "一周" : "1/" + K + " 年";
    if (bet) {
      L.push("这一批有 " + N + " 条互相独立的路径，每条是连着下注 " + T + " 次。");
      L.push("每一次以 " + wp.p + " 的概率赢：赢了净得赌注的 " + wp.b + " 倍，输了失去赌注。各次互相独立，这两个数你是知道的。");
      L.push("每一次下注之前，规则给出押上的比例 f：赌注 = f × 当前的资金。f 被限制在 " + set.fmin + " 到 " + set.fmax + " 之间。");
      L.push("调整比例按换手付成本：比例每变动 1，扣掉资金的 " + set.costBps + " 个基点。硬币本来没有交易成本，这是把赌局套进价格世界的记账方式带来的；想去掉，把\"交易设定\"里的交易成本调成 0。");
      L.push("资金一旦归零，这一条路径就破产了，到此为止。");
      L.push("押完 " + T + " 次，记下期末的资金和途中的最大回撤。全部路径汇总成三个数：长期增长率（每次）、夏普比率、带风险上限的期望收益。");
      L.push("基准是不下注：资金始终是 1。");
    } else {
      if (w.type === "real" && ds) {
        L.push("数据是你导入的\"" + ds.name + "\"：" + QLIO.describe(ds) + "。");
        if (wp.mode === "windows") L.push("前 " + wp.split + "% 是训练段。训练段被切成长度 " + wp.L + " 步、间隔 " + wp.stride + " 步的滚动窗口，每个窗口当作一条路径" + (known ? "，一共 " + N + " 条" : "") + "。窗口互相重叠，所以标准误偏小。");
        else L.push("前 " + wp.split + "% 是训练段，当作一条" + (known ? " " + T + " 步的" : "") + "路径来回测。只有一条路径，所以没有分布，标准误来自时间序列本身。");
        L.push("后面的 " + (100 - wp.split) + "% 是样本外：平时不参与任何计算，点\"揭晓样本外\"才用它跑一遍。");
      } else if (w.type === "boot" && ds) {
        L.push("从\"" + ds.name + "\"训练段的收益率里一块一块地有放回重新抽样（平均块长 " + wp.block + " 步），拼成 " + N + " 条路径，每条 " + T + " 步。");
        L.push("每条路径的涨跌都是历史上真实出现过的，只是先后顺序被重排了。");
      } else {
        L.push("这一批有 " + N + " 条互相独立的价格路径，每条 " + T + " 步。一年算 " + K + " 步，所以一步是" + stepIs + "，一条路径是 " + F(T / K, 2) + " 年。");
        L.push((d.level ? "价格" : "价格从 100 出发，") + "按\"" + (w.type === "custom" && S.custom ? S.custom.name : d.short) + "\"的规律走：" + (w.type === "custom" && S.custom ? S.custom.summary || d.blurb : d.blurb));
        var pl = paramLine(A.wschema(), wp); if (pl) L.push("现在的参数：" + pl + "。每个参数是什么意思，见手册里这个世界的那一页。");
      }
      L.push("每一步，规则先看到截至此刻的价格、自己的净值和仓位（未来的价格它读不到），然后给出目标仓位 f = 持仓市值 ÷ 净值。");
      L.push("仓位被限制在 " + mn(set.fmin) + " 到 " + mn(set.fmax) + " 之间。负数是做空，大于 1 是借钱加杠杆。规则返回的不是数时，按空仓算。");
      L.push("调仓要付成本：仓位每变动 1（买卖了与净值等值的资产），扣掉净值的 " + set.costBps + " 个基点，也就是 " + F(set.costBps / 100, 3) + "%。买和卖各算一次（单边）。");
      L.push("然后价格走一步。投在资产里的部分随价格涨跌；其余的部分按无风险利率每年 " + set.rf + "% 计息，借钱加杠杆时付的也是这个利率。");
      L.push("两次调仓之间仓位会自己漂移：资产涨了，它占净值的比例就变大。下一步的换手从漂移后的仓位算起。");
      L.push("净值一旦不再是正数，这条路径就破产了，到此为止，期末净值记为 0。");
      L.push("走完全程，记下期末净值和途中的最大回撤。全部路径汇总成三个数：长期增长率、夏普比率、带风险上限的期望收益。风险上限现在是：最大回撤达到 " + set.ddLimit + "% 的路径不超过 " + set.ddProb + "%。");
      L.push("基准是买入持有：始终满仓，付同样的成本，跑在同一批路径上。规则和基准的比较用的是逐条路径的配对差。");
    }
    if (fit) L.push(d.needsData ? "当前的规则带训练：训练段的前 " + Math.round(QL.FIT_FRAC * 100) + "% 留给模型学，上面的回测只用后面的一段。" : "当前的规则带训练：另外生成同样多的一批路径给模型学，计分用的这一批它没见过。");
    if (w.type !== "real") L.push("点\"用新路径检验\"，会再生成一批没见过的路径，用当前的参数重跑一遍。");
    return L;
  }
  /** 玩法怎么计分、和谁比。标签与结果栏的对照表里的一致 */
  function scoreInfo(d, p) {
    var sc = d.score(p), refs = d.refs ? d.refs(p) : [], th = d.theory ? d.theory(p) : null, out = [];
    out.push("**得分**是" + sc.name + (sc.unit ? "（" + sc.unit + "）" : "") + "，" + (sc.lower ? "越低越好" : "越高越好") + "。" + (d.scoreHow || "每一局算一个，全部对局取平均，± 是平均值的标准误。") + (d.crit ? "这套玩法的净值是利滚利的，所以同时按三种口径计分。" : ""));
    var rows = refs.map(function (r) { return "- " + (r.bench ? "**基准**：" : r.kind === "bound" || r.calc ? "上界：" : r.alt ? "换细则：" : "参照：") + r.name; });
    ((th && th.marks) || []).forEach(function (m) { rows.push("- " + (m.kind === "optimum" ? "理论最优：" : m.kind === "human" ? "真人实验：" : m.kind === "bound" ? "上界：" : "理论：") + m.name); });
    if (rows.length) out.push("结果栏的对照表里，你的得分会和下面这些比。带\"基准\"\"参照\"\"上界\"\"换细则\"的几行是在同一批对局上现跑出来的，\"你 − 它\"是逐局的配对差；带\"理论\"字样的几行是算出来的数，不是跑出来的。\n\n" + rows.join("\n") + "\n\n**基准**是不动脑筋也做得到的打法，一条规则有没有用，看它比基准强多少。**上界**是提前知道答案才做得到的成绩，谁也超不过。**换细则**是同一条规则放到改过一处细则的同一批对局里重打一遍，量的是那一处细则值多少。");
    if (d.aux && d.aux.length) out.push("结果栏下面的一行小字另外报告：" + d.aux.map(function (a) { return a.name; }).join("；") + "。");
    return out.join("\n\n");
  }
  function apiBox(d) { return h("pre", { class: "code", style: { "white-space": "pre-wrap" }, text: d.api }); }
  function pageNow(host) {
    var d = A.wdef(), st = A.strat(), type = S.world.type;
    head(host, "当前", "当前的细则", h("p", { class: "gd-lede" }, "你现在在：", h("b", { text: A.worldLabel() }), "；用的规则是", h("b", { text: "「" + st.name + "」" }), "。这一页写的是这个" + (d.game ? "玩法" : "世界") + "自己的规定：数据怎么来、你能做什么、怎么结算、怎么计分。数字都取自左栏当前的设定，改了设定，这一页跟着变。"),
      [btn(d.game ? "这套玩法的来历与已知结论" : "这个世界从哪来", function () { show((d.game ? "game:" : "world:") + type); }), btn("这条规则的应用场景", function () { show("strat:" + st.id); }), btn("怎么读结果栏", function () { show("start:read"); })]);
    if (d.game) {
      var p = A.wp(), g = G.games[type];
      host.appendChild(sec("细则", rulesList(g ? g.rules(p, d.theory(p)) : [d.blurb])));
      host.appendChild(sec("计分，以及和谁比", md(scoreInfo(d, p))));
      host.appendChild(sec("你的规则看得到什么、能做什么", apiBox(d), h("p", { class: "note", text: "s 是裁判每回合交给规则的那个对象。上面没列出来的东西，规则读不到。" })));
    } else {
      host.appendChild(sec("细则", rulesList(priceRules())));
      host.appendChild(sec("三个数各是什么", md("**长期增长率** $g=\\mathbb{E}[\\log W_T]/\\text{年数}$：钱利滚利时的增长速度。**夏普比率**：每承担一份波动换回多少超额收益，与仓位大小无关。**期望收益**：$\\mathbb{E}[W_T]-1$，只在满足风险上限时才算数。"), h("div", { class: "gd-acts" }, btn("三种口径的来历和区别", function () { show("start:criteria"); }), btn("怎么读结果栏", function () { show("start:read"); }), btn("一步之内发生了什么", function () { show("start:step"); }))));
      host.appendChild(sec("你的规则看得到什么、能做什么", h("pre", { class: "code", style: { "white-space": "pre-wrap" }, text: A.API_DOC }), h("p", { class: "note", text: "s 是引擎每一步交给规则的那个对象。未来的价格不在它上面，规则读不到。" })));
    }
  }

  /* ---------- 十套玩法 ---------- */
  /** 一套玩法能换哪些世界（给总览和各页用的一句话） */
  function worldsOf(type) {
    var w = QL.WORLDS[type]; if (!w.wsel) return w.wname || "";
    var q = (w.params || []).filter(function (x) { return x.key === w.wsel; })[0];
    return q ? q.options.map(function (o) { return o[1].replace(/（.*$/, ""); }).join("、") : "";
  }
  function pageGames(host) {
    head(host, "玩法", "总览：玩法、世界、规则", "一次实验由三样东西定下来：玩法规定你能做什么、怎么算分；世界规定数据从哪里来；规则是你自己定的做法。");
    host.appendChild(md("**三层。** 左栏从上到下就是这三层。\n\n1. **玩法**是题目的类型：每一步你看到什么、能做什么动作、怎么结算、怎么计分。它写在细则里，不由你定。\n2. **世界**是数据服从的那个分布或者过程：布朗运动、均值回复、一枚偏硬币、指数分布的报价……同一种玩法可以换不同的世界，能换哪些由玩法决定。\n3. **规则**是你的做法：每一步看到信息之后给出一个动作。可以选内置的，也可以让 " + A.AI + " 写。\n\n**为什么要把玩法和世界分开。** 一条规则总是按某个假设推出来的：\"报价服从指数分布\"\"步长是正态的\"\"噪声没有厚尾\"。把玩法固定、只换世界，看到的就是\"假设错了会怎样\"。在一个世界里可证最优的规则，换一个世界可以输给朴素的做法；这是这里最值得看的东西之一。\n\n**用词。** 一**局**是从头到尾完整的一场，里面的一步叫回合（有的玩法里叫次、把、天、期、步）。页面一次打很多局，得分是各局的平均。**细则**是玩法自己的规定；**规则**专指你定的做法。"));
    add(host, fig("round"));
    host.appendChild(sec("一、" + A.TRADE.name, md(A.TRADE.blurb + "\n\n这是量化里最基本的玩法，十几个价格世界都是给它用的：几何布朗运动、均值回复、牛熊切换、混沌序列、你导入的真实行情。它们之间只有\"价格怎么来\"不同，记账的办法完全一样。"),
      h("div", { class: "gd-acts" }, btn("它的细则", function () { show("game:trade"); }), btn("每一步怎么记账", function () { show("start:step"); }))));
    var mk = function (list) {
      var tb = h("tbody");
      list.forEach(function (t) { var w = QL.WORLDS[t], gi = (G.gameIndex || {})[t] || ["", "", ""]; tb.appendChild(h("tr", null, h("th", null, link(w.name, "game:" + t)), h("td", { text: gi[0] }), h("td", { text: gi[1] }), h("td", { text: worldsOf(t) }), h("td", { text: gi[2] }))); });
      return h("div", { class: "gd-tw" }, h("table", { class: "gd-t" }, h("thead", null, h("tr", null, ["玩法", "每回合决定什么", "难在哪里", "能换的世界", "来自"].map(function (x) { return h("th", { text: x }); }))), tb));
    };
    host.appendChild(sec("二、十套玩法", md("十套回合制的小游戏。细则写死，计分明确，每一套都取自一个真实的场景、一道经典的题目或者一个做过的实验，而且（至少部分地）知道最优解是什么。所以结果栏里除了你的得分，还有理论最优、上界和真人实验的成绩可以对照。"), mk(QL.GAMES)));
    host.appendChild(sec("三、四套观测玩法", md("把布朗运动、均值回复、混沌映射这些来自自然世界的过程，当作研究对象而不是价格。这里不挣钱：动作是一个估计、一个预测，或者\"现在报警\"\"现在停\"；计分是误差或延迟。它们回答的是这样的问题：这个过程的参数，一条轨迹能量准吗？它能不能预测，能提前多久？它变了没有？它的最高点能不能抓住？"), mk(QL.OBS)));
    host.appendChild(sec("怎么开始", md("1. 左栏最上面的\"玩法\"里选一套。下面的\"世界\"会换成这套玩法能用的那几种；\"规则\"会换成它自己的内置规则，第一条通常是基准。\n2. 结果栏给出这套玩法自己的得分，旁边（窄屏上在下面）是同一批对局上的对照表。\n3. \"单局明细\"把一局从头到尾回放出来；\"参数扫描\"对一个参数逐个取值重打一遍，有公式可循的参数会叠上理论曲线。\n4. 换一个世界，规则不动，看得分怎么变。\"场景对比\"和手册里每套玩法的那张表，做的就是这件事。\n5. \"玩法\"一栏里的\"完整的细则与来历\"，通向这本手册里它的那一条。")));
  }
  /* ---------- 交易一个资产 ---------- */
  function pageTrade(host) {
    var cur = !A.isGame();
    head(host, "玩法", A.TRADE.name, A.TRADE.blurb, [cur ? btn("回到实验", function () { if (ui) ui.close(); }, true) : btn("去玩这一套", closeThen(function () { A.setGame("trade"); }), true), cur ? btn("当前的细则（带着眼下的数字）", function () { show("now"); }) : null]);
    host.appendChild(sec("它从哪来", md("你管着一笔钱，市场上有一个价格在变的资产和一个不变的现金账户。每一步你要回答同一个问题：这笔钱里拿多大比例放在资产上？答案可以是 0（空仓）、1（满仓）、负数（做空）或者大于 1（借钱加杠杆）。\n\n量化交易里绝大多数\"策略\"，说到底都是这个问题的一种答法：均线、动量、均值回复、止损、Kelly 比例、机器学习模型，区别只在于它们各自根据什么来定这个比例。")));
    host.appendChild(sec("细则", rulesList([
      "世界给出一批互相独立的价格路径（路径数、步数、每年多少步，都在\"世界\"一栏里）。",
      "每一步，规则先看到截至此刻的价格、自己的净值和仓位（未来的价格它读不到），然后给出目标仓位 f = 持仓市值 ÷ 净值。",
      "仓位被限制在\"交易设定\"里的上下限之内。规则返回的不是数时，按空仓算。",
      "调仓要付成本：仓位每变动 1（买卖了与净值等值的资产），按\"交易设定\"里的单边成本扣一次。",
      "然后价格走一步。投在资产里的部分随价格涨跌；其余的部分按无风险利率计息，借钱加杠杆付的也是这个利率。",
      "净值一旦不再是正数，这条路径就破产了，到此为止，期末净值记为 0。",
      "走完全程，记下期末净值和途中的最大回撤。全部路径汇总成三个数：长期增长率、夏普比率、带风险上限的期望收益。",
      "基准是买入持有：始终满仓，付同样的成本，跑在同一批路径上（只有\"下注游戏\"例外，那里的基准是不下注）。规则和基准的比较用的是逐条路径的配对差。"
    ]), h("p", { class: "note", text: "眼下用的具体数字（路径数、成本、上下限……）在\"当前的细则\"里；每一步的公式在\"一步之内发生了什么\"里。" }),
      h("div", { class: "gd-acts" }, btn("一步之内发生了什么", function () { show("start:step"); }), btn("三种口径：怎么才算好", function () { show("start:criteria"); }))));
    host.appendChild(sec("你的规则看得到什么、能做什么", h("pre", { class: "code", style: { "white-space": "pre-wrap" }, text: A.API_DOC }), h("p", { class: "note", text: "s 是引擎每一步交给规则的那个对象。未来的价格不在它上面，规则读不到。" })));
    var box = h("div");
    QL.WORLD_GROUPS.forEach(function (g) {
      var ws = Object.keys(QL.WORLDS).filter(function (t) { var w = QL.WORLDS[t]; return w.group === g && !w.game && !(t === "custom" && !S.custom); }); if (!ws.length) return;
      var p = h("p", null, h("b", { text: g + "：" })); ws.forEach(function (t, i) { if (i) p.appendChild(document.createTextNode("、")); p.appendChild(link(QL.WORLDS[t].short, "world:" + t)); }); box.appendChild(p);
    });
    host.appendChild(sec("能换的世界", box, h("p", { class: "note", text: "每个世界自己的那一页写着它从哪来、什么规则在那里管用。" })));
    host.appendChild(sec("各条规则在各个世界里的成绩", md("全表在\"对照表\"一页：每条内置规则 × 十五个世界。"), h("div", { class: "gd-acts" }, btn("打开对照表", function () { show("matrix"); }))));
  }
  /* ---------- 自检 ---------- */
  function pageSelf(host) {
    var C = G.checks || [], groups = [];
    head(host, "对照", "自检：在这台电脑上核对", "手册里有一类话是可以用计算判对错的：某个公式给出的数，和模拟出来的数对不对得上；某条规则是不是真的比另一条好。这一页把它们列出来，在你的电脑上逐条现算、逐条判。");
    host.appendChild(md("每一条先在这台电脑上把需要的数算出来（用到对照表里的格子，或者专门跑一次），再按写明的标准判断。\"相符\"的意思是差距在抽样误差之内（一般取 4 个标准误）。结果存在浏览器里，下次打开直接读；引擎或者规则一改，自动重算。\n\n目前列出 " + C.length + " 条，分三部分。前两部分（价格世界的对照表、十套玩法）核对的是手册正文里拿对照表说过的话，和几个公式给出的数；第三部分是四套观测玩法，那里的理论值最多。定理的证明不是计算能核对的，它们不在这张表里。"));
    C.forEach(function (c) { if (groups.indexOf(c.group) < 0) groups.push(c.group); });
    var sumBox = h("div"), rows = [];
    host.appendChild(sumBox);
    groups.forEach(function (gname) {
      var ol = h("ul", { class: "ck-list" });
      C.filter(function (c) { return c.group === gname; }).forEach(function (c) { var li = h("li", { class: "ck wait" }, h("span", { class: "ck-i", text: "…" }), h("span", { class: "ck-say", text: c.say }), h("span", { class: "ck-note" })); rows.push({ c: c, li: li }); ol.appendChild(li); });
      host.appendChild(sec(gname, ol));
    });
    function draw() {
      var pass = 0, fail = 0, wait = 0;
      rows.forEach(function (r) {
        var x = A.live.check(r.c); r.li.className = "ck " + x.state; r.li.children[0].textContent = x.state === "pass" ? "✓" : x.state === "fail" ? "✗" : "…";
        r.li.children[2].textContent = x.state === "wait" ? "正在算" : x.note || "";
        if (x.state === "pass") pass++; else if (x.state === "fail") fail++; else wait++;
      });
      clear(sumBox);
      sumBox.appendChild(h("div", { class: "row lv-bar", id: "ckSum" }, h("b", { text: wait ? "已核对 " + (pass + fail) + " / " + rows.length + " 条" : fail ? rows.length + " 条里有 " + fail + " 条没通过" : rows.length + " 条全部通过" }),
        wait ? h("span", { class: "note", text: "正在这台电脑上现算…" }) : h("button", { class: "btn small", type: "button", text: "全部重算", title: "丢掉存着的结果，重新算一遍", onclick: function () { A.live.reset(); show("selfcheck"); } })));
      return !wait;
    }
    var fin = draw();
    if (!fin) lvBlocks.push({ box: sumBox, draw: function () { fin = draw(); }, fin: function () { return fin; } });
  }
  /* ---------- 现算的内容块 ---------- */
  var lvBlocks = [];
  /** 一块依赖现算结果的内容：先把要的格子报上去，画出眼下已有的；之后每来一批新结果重画一次，齐了为止 */
  function liveBlock(q, build) {
    var box = h("div", { class: "lvb" }), fin = false;
    function draw() {
      var sw = box.querySelector(".mx-wrap"), sl = sw ? sw.scrollLeft : 0;
      fin = A.live.ready(q); var el = build(fin); clear(box); if (el) box.appendChild(el);
      if (sl) { sw = box.querySelector(".mx-wrap"); if (sw) sw.scrollLeft = sl; }
    }
    A.live.need(q); draw();
    if (!fin) lvBlocks.push({ box: box, draw: draw, fin: function () { return fin; } });
    return box;
  }
  function lvNote(what) { var L = A.live; return h("p", { class: "note lv-prog", text: "正在这台电脑上现算" + (what || "") + (L.total ? "（这一批已完成 " + Math.min(L.done, L.total) + " / " + L.total + " 格）" : "") + "…算过的会存在浏览器里，下次直接读。" }); }
  A.on("live", function () { lvBlocks = lvBlocks.filter(function (b) { if (!document.body.contains(b.box)) return false; b.draw(); return !b.fin(); }); });
  function pendTd() { return h("td", { class: "pend", title: "还在算", text: "·" }); }

  function gameMatrix(type) {
    if (!mxAll().games[type]) return null;
    return liveBlock({ game: type }, function () { return gameMatrixNow(type); });
  }
  function gameMatrixNow(type) {
    var M = mxAll().games[type];
    var w = QL.WORLDS[type], head1 = [h("th", { text: "规则 ＼ 场景" })].concat(M.scenes.map(function (s) { return h("th", null, h("span", { text: s.name })); })), tb = h("tbody");
    var names = []; M.scenes.forEach(function (s) { if (s.scoreName && names.indexOf(s.scoreName) < 0) names.push(s.scoreName); }); var mixed = names.length > 1;
    var fmt = function (v, sc) { var g = { kind: sc.kind, digits: sc.digits, lower: M.lower }; return A.gfmt(g, v); };
    M.strats.forEach(function (sid) {
      var st = stratBy(sid); if (!st) return;
      var tr = h("tr", null, h("th", null, link(st.name, "strat:" + sid)));
      M.cells[sid].forEach(function (c, i) {
        var sc = M.scenes[i]; if (c === undefined) { tr.appendChild(pendTd()); return; } if (!c) { tr.appendChild(h("td", { text: "—" })); return; }
        var mk = A.zMark(c[2], c[3]), cls = mk === "up" ? "up" : mk === "down" ? "down" : "flat", z = c[3] > 0 ? Math.abs(c[2] / c[3]) : 0;
        tr.appendChild(h("td", { class: cls, style: { "--a": (z > 12 ? 34 : z > 5 ? 24 : 14) + "%" } }, h("button", { type: "button", title: st.name + " · " + sc.name + "：" + (M.lower ? "成本 " : "得分 ") + fmt(c[0], sc) + " ± " + A.gdiff({ kind: sc.kind, digits: sc.digits }, c[1]).slice(1) + "；比基准（" + sc.benchName + "）" + A.gdiff({ kind: sc.kind, digits: sc.digits }, c[2]) + "。点一下去试", text: (mk === "flat" || mk === "same" ? "≈ " : "") + fmt(c[0], sc),
          onclick: closeThen(function () { A.applySetup({ world: type, std: true, resetW: true, wp: sc.p, strat: sid, resetS: true, sp: QL.live.sceneParams(type, i, [st])[sid], note: STD_NOTE }); }) })));
      });
      tb.appendChild(tr);
    });
    return h("div", null, h("div", { class: "mx-wrap" }, h("table", { class: "mx wide-h" }, h("thead", null, h("tr", null, head1)), tb)),
      h("p", { class: "note", style: { "margin-top": "6px" }, text: "每格是" + (M.lower ? "成本（越低越好）" : "得分") + (mixed ? "；各个场景的计分办法不全一样（" + names.join("；") + "），不同计分的列之间不能横着比" : "") + "。蓝底：显著好于这个场景的基准；红底：显著差于基准；带 ≈ 的：分不出高下。" + (M.retune ? "各个场景是不同的世界，同一组参数没有可比性，所以凡是这套玩法按当前设定给了默认值的参数（比如按幅度换算的报警线），每一列用的是那个场景自己的默认值；其余参数不变。" : "规则的参数取默认场景下的默认值，换场景时没有重新调（只收回到那个场景允许的范围里），所以这张表同时在回答：在一个场景里调好的参数，换个场景还好不好用。") + "这些数是在你的电脑上现算的。点任何一格，页面会摆成那个样子。" }));
  }
  function ruleCards(type) {
    var L = A.allStrats().filter(function (st) { return st.game === type && !st.src; });
    return h("div", { class: "gd-cards" }, L.map(function (st) {
      return h("div", { class: "gd-card" }, h("h4", null, st.name, A.tierBadge(st.explain && st.explain.tier)), h("p", { text: st.summary || "" }), G.gstrats[st.id] ? h("p", { class: "use", text: G.gstrats[st.id] }) : null,
        h("div", { class: "gd-acts" }, h("button", { class: "btn small", type: "button", text: "详细说明", onclick: function () { show("strat:" + st.id); } }), h("button", { class: "btn small", type: "button", text: "选用", onclick: closeThen(function () { A.applySetup({ world: type, strat: st.id }); }) })));
    }));
  }
  function pageGame(host, type) {
    // 数字用哪一套：正在玩这一套就用左栏当前的；玩过、改过就用你上次留下的（"去玩这一局"会回到那里）；否则是默认值
    var w = QL.WORLDS[type], g = G.games[type] || {}, isCur = S.world.type === type, mine = S.wparams[type] || {}, p = QL.worldDefaults(type), touched = false;
    Object.keys(p).forEach(function (k) { if (mine[k] !== undefined && mine[k] !== p[k]) { p[k] = mine[k]; touched = true; } });
    if (isCur) p = A.wp();
    var th = w.theory(p);
    head(host, (w.obsGame ? QL.OBS_GROUP : "十套玩法") + " · " + ((G.gameIndex || {})[type] || ["", "", ""])[2], w.name, w.blurb, [isCur ? btn("回到这一套", function () { if (ui) ui.close(); }, true) : btn("去玩这一套", closeThen(function () { A.applySetup({ world: type, strat: S.last[type] || w.defStrat }); }), true)]);   // 从手册过去：用这套玩法自己的规则（上次用的，或者默认的）
    if (g.scene) host.appendChild(sec("它从哪来", md(g.scene)));
    if (g.rules) host.appendChild(sec("细则", rulesList(g.rules(p, th)), h("p", { class: "note", text: isCur ? "数字取自左栏当前的设定。" : touched ? "数字取自你上次在这套玩法里留下的设定；\"去玩这一套\"会回到那里。" : "数字是默认的设定；选了这套玩法之后，在左栏可以改。" })));
    host.appendChild(sec("你的规则看得到什么、能做什么", apiBox(w), h("p", { class: "note", text: "s 是裁判每回合交给规则的那个对象。上面没列出来的东西，规则读不到。让 " + A.AI + " 写规则时，它拿到的也是这一份。" })));
    host.appendChild(sec("计分，以及和谁比", md(scoreInfo(w, p))));
    var wq = w.wsel ? (w.params || []).filter(function (x) { return x.key === w.wsel; })[0] : null;
    host.appendChild(sec("能换的世界", wq ? ul(wq.options.map(function (o) { return "**" + o[1] + "**" + (wq.descs && wq.descs[o[0]] ? "：" + wq.descs[o[0]] : ""); })) : md("**" + (w.wname || "这套玩法自带的世界") + "。** " + (w.wdesc || "")),
      h("p", { class: "note", text: wq ? "在左栏\"世界\"一栏里换。换了世界，细则里写的数据来源跟着变，规则不动。" : "这套玩法的世界是固定的一种；它的参数在左栏\"世界\"一栏里。" })));
    if (g.see) host.appendChild(sec("换一个世界，应该看到什么", md(g.see), h("p", { class: "note", text: "带下划线的数字不是事先写好的：它们是在你的电脑上现算的，设定与下面那张表相同（默认的局数、种子 " + MX.seed + "）。" })));
    if (g.known) host.appendChild(sec("已经知道的结论", md(g.known)));
    host.appendChild(sec("内置的规则", ruleCards(type)));
    var gmx = gameMatrix(type); if (gmx) host.appendChild(sec("各条规则在各个场景下的成绩", gmx, g.mxNote ? md(g.mxNote) : null));
    if (g.tryit) host.appendChild(sec("可以试试", ul(g.tryit)));
    if (g.origin) host.appendChild(sec("出处", md(g.origin)));
    if (w.ideas && w.ideas.length) host.appendChild(sec("可以交给 " + A.AI + " 的想法", ul(w.ideas.map(function (x) { return x; })), h("div", { class: "gd-acts" }, btn("打开 " + A.AI + " 面板", closeThen(function () { A.applySetup({ world: type, claude: true }); })))));
  }

  /* ---------- 世界 ---------- */
  function pctTxt(v) { var a = Math.abs(v * 100), s = a >= 100 ? a.toFixed(0) : a.toFixed(1); return (!/[1-9]/.test(s) ? "" : v < 0 ? "−" : "+") + s; }
  function priceCell(c, metric, wb) {   // 对照表里一格的数、写法、记号
    if (!c) return { text: "—", mark: "" };
    var ruin = c[0] === "-inf";
    if (metric === "sharpe") { var se = Math.SQRT2 * (c[4] || 0); return { v: c[3], se: c[4], text: F(c[3], 2), mark: A.zMark(c[3] - wb[1], se), z: se > 0 ? Math.abs((c[3] - wb[1]) / se) : 0 }; }
    var mk = ruin ? "down" : A.zMark(c[1], c[2]), z = ruin ? 99 : c[2] > 0 ? Math.abs(c[1] / c[2]) : 0;
    if (metric === "g") return { v: ruin ? NaN : c[0], se: c[9], text: ruin ? "破产" : pctTxt(c[0]), mark: mk, z: z };
    return { v: ruin ? NaN : c[1], se: c[2], text: ruin ? "破产" : pctTxt(c[1]), mark: mk, z: z };
  }
  function cellTip(st, w, c) {
    if (!c) return "";
    return st.name + " · " + w.name + "：增长率 " + (c[0] === "-inf" ? "−∞（" + P(c[7], 2) + " 的路径破产）" : P(c[0], 2)) + "；比买入持有 " + (c[1] == null ? "—" : pctTxt(c[1]) + " ± " + (c[2] * 100).toFixed(1) + " 个百分点") + "；夏普 " + F(c[3], 2) + "（基准 " + F(w.bench[1], 2) + "）；回撤中位数 " + P(c[6], 1) + "；每年换手 " + F(c[8], 1) + " 倍。点一下去试";
  }
  function goPrice(w, sid) { return closeThen(function () { A.applySetup({ world: w.type, std: true, resetW: true, wp: w.over, ds: w.ds, strat: sid, resetS: true, note: STD_NOTE }); }); }
  /** 一条规则在各个世界里（或者一个世界里的各条规则）：对照表里的那一行（列），画成条形表 */
  function priceBars(opt) {
    var M = mxAll().price, wi0 = -1;
    if (opt.strat) { if (!M.cells[opt.strat]) return null; return liveBlock({ strat: opt.strat }, function (done) { return done ? priceBarsNow(opt) : lvNote("这条规则在各个世界里的成绩"); }); }
    M.worlds.forEach(function (w, i) { if (wi0 < 0 && w.type === opt.world) wi0 = i; }); if (wi0 < 0) return null;
    return liveBlock({ world: wi0 }, function (done) { return done ? priceBarsNow(opt) : lvNote("各条规则在这个世界里的成绩"); });
  }
  function priceBarsNow(opt) {
    var M = mxAll().price, rows = [];
    if (opt.strat) {
      var cells = M.cells[opt.strat]; if (!cells) return null; var st = stratBy(opt.strat);
      M.worlds.forEach(function (w, i) { var c = cells[i], x = priceCell(c, "dg", w.bench); rows.push({ name: w.name, v: x.v, se: x.se, text: x.text === "破产" ? "有路径破产" : x.text === "—" ? "—" : x.text + "%", mark: x.mark, tip: cellTip(st, w, c), go: goPrice(w, opt.strat), goLabel: "去试试" }); });
      return A.barList(rows, { caption: "默认参数下，长期增长率比买入持有高出多少（每年，同一批路径上的配对差；细线是 ±2 个标准误）。" });
    }
    var wi = -1; M.worlds.forEach(function (w, i) { if (wi < 0 && w.type === opt.world) wi = i; }); if (wi < 0) return null;
    var w0 = M.worlds[wi];
    M.strats.forEach(function (sid) { var st = stratBy(sid); if (!st || sid === "hold") return; var c = M.cells[sid][wi], x = priceCell(c, "dg", w0.bench); rows.push({ name: st.name.replace(/（.*$/, ""), v: x.v, se: x.se, text: x.text === "破产" ? "有路径破产" : x.text === "—" ? "—" : x.text + "%", mark: x.mark, tip: cellTip(st, w0, c), go: goPrice(w0, sid), goLabel: "去试试" }); });
    rows.sort(function (a, b) { return (b.v === b.v && b.v != null ? b.v : -Infinity) - (a.v === a.v && a.v != null ? a.v : -Infinity); });
    return A.barList(rows, { caption: "默认参数下，各条规则的长期增长率比买入持有高出多少（每年，配对差；细线是 ±2 个标准误）。买入持有自己的增长率是每年 " + P(w0.bench[0], 1) + "。" });
  }
  function pageWorld(host, type) {
    var w = QL.WORLDS[type], g = G.worlds[type] || {}, isCur = S.world.type === type, can = !(type === "custom" && !S.custom);
    head(host, "世界 · " + w.group, wname(type), type === "custom" && S.custom ? S.custom.summary || w.blurb : w.blurb,
      [isCur ? btn("回到这个世界", function () { if (ui) ui.close(); }, true) : can ? btn("切到这个世界", closeThen(function () { A.applySetup({ world: type }); }), true) : null, isCur ? btn("当前的细则", function () { show("now"); }) : null]);
    if (g.story) host.appendChild(sec("它从哪来", md(g.story)));
    if (g.when) host.appendChild(sec("什么时候用它", md(g.when)));
    if (g.works) host.appendChild(sec("在这里什么管用", md(g.works)));
    var th = w.theory ? w.theory(isCur ? A.wp() : QL.worldDefaults(type), { K: w.defaults.K, rf: S.set.rf }) : null, note = type === "custom" && S.custom ? S.custom.explain : th && th.note;
    if (note) host.appendChild(sec("已经知道的结论", md(note), h("p", { class: "note", text: isCur ? "按左栏当前的参数算的。" : "按默认参数算的。" })));
    var bars = priceBars({ world: type });
    if (bars) host.appendChild(sec("各条规则在这里的成绩", bars, h("p", { class: "note", text: "在你的电脑上现算的，规则都用默认参数。点行尾的箭头，页面会摆成那个样子。完整的表在\"对照表\"一页。" })));
    var ob = (G.worldObs || {})[type];
    if (ob) host.appendChild(sec("不当价格，当作研究对象", md(ob.md), h("div", { class: "gd-acts" }, ob.go.map(function (x) { return btn(x[0], closeThen(function () { A.applySetup({ world: x[1], resetW: true, wp: x[2] }); })); }))));
    if (g.tryit) host.appendChild(sec("可以试试", ul(g.tryit)));
    if (w.params && w.params.length) host.appendChild(sec("参数", h("dl", { class: "gd-gloss" }, [].concat.apply([], w.params.map(function (q) { return [h("dt", { text: q.label }), h("dd", { text: (q.type === "select" ? q.options.map(function (o) { return o[1]; }).join(" / ") : "范围 " + mn(q.min) + " 到 " + mn(q.max) + (q.unit ? " " + q.unit : "") + "，默认 " + mn(q.def)) + (q.hint ? "。" + q.hint : "") })]; })))));
  }

  /* ---------- 规则 ---------- */
  function algoCard(st) {
    var al = G.algo[st.lib || st.id]; if (!al) return null;
    // 实测的数字只在"这份结果确实是这条规则跑出来的"时才写
    var np = (st.params || []).filter(function (q) { return q.type === "num"; }).length, ns = (st.params || []).length - np, r = A.run && S.stratId === st.id && A.runStratId === st.id ? A.run : null, rows = [];
    rows.push(["类型", al.kind], ["事先的计算", al.fit], ["每一步的计算", al.step], ["要记住的东西", al.mem], ["需要的数据", al.need], ["可调的参数", np + " 个数值" + (ns ? "，" + ns + " 个选项" : "")]);
    if (r && r.stepNs != null) rows.push(["在这台设备上实测", "每步" + A.fmtStep(r.stepNs, r.runMs) + (r.stateSize != null ? (r.stateSize > 0 ? "；开局时状态 " + A.fmtCount(r.stateSize) : r.hasInit ? "；开局时状态是空的，之后边跑边记" : "；不带状态") : "") + (r.modelSize != null ? "；模型 " + A.fmtCount(r.modelSize) + (r.fitMs != null ? "，训练 " + A.fmtMs(r.fitMs) : "") : "")]);
    return h("div", null, h("dl", { class: "gd-gloss tight" }, [].concat.apply([], rows.map(function (x) { return [h("dt", { text: x[0] }), h("dd", { text: x[1] })]; }))),
      h("div", { class: "gd-acts" }, h("button", { class: "btn small", type: "button", text: "记号是什么意思，和别的算法怎么比", onclick: function () { show("algos"); } })));
  }
  /** 一条玩法规则在各个场景下的成绩。计分办法不同的场景分开画，不放在一根轴上 */
  function gameRow(st) {
    var M0 = mxAll().games[st.game]; if (!M0 || !M0.cells[st.id]) return null;
    return liveBlock({ game: st.game }, function (done) { return done ? gameRowNow(st) : lvNote("这条规则在各个场景里的成绩"); });
  }
  function gameRowNow(st) {
    var M = mxAll().games[st.game];
    var groups = [], by = {};
    M.cells[st.id].forEach(function (c, i) {
      var sc = M.scenes[i], g = { kind: sc.kind, digits: sc.digits, lower: M.lower }, k = sc.scoreName || "", row;
      if (!c) row = { name: sc.name, text: "—" };
      else row = { name: sc.name, v: M.lower ? -c[0] : c[0], se: c[1], text: A.gfmt(g, c[0]), mark: A.zMark(c[2], c[3]), tip: (M.lower ? "成本 " : "得分 ") + A.gfmt(g, c[0]) + "；比基准（" + sc.benchName + "）" + A.gdiff(g, c[2]) + " ± " + A.gdiff(g, c[3]).slice(1), goLabel: "去试试",
        go: closeThen(function () { A.applySetup({ world: st.game, std: true, resetW: true, wp: sc.p, strat: st.id, resetS: true, sp: QL.live.sceneParams(st.game, i, [st])[st.id], note: STD_NOTE }); }) };
      if (!by[k]) { by[k] = []; groups.push(k); } by[k].push(row);
    });
    var box = h("div");
    groups.forEach(function (k, i) {
      var bl = A.barList(by[k], { caption: (M.lower ? "各个场景下的成本（越低越好）" : "各个场景下的得分") + (groups.length > 1 && k ? "：" + k : "") + (M.retune ? "。参数取各个场景自己的默认值" : "。参数取默认值，换场景时没有重新调") + "；▲▼ 是和那个场景的基准比。" });
      if (i > 0) bl.style.marginTop = "12px"; box.appendChild(bl);
    });
    return box;
  }
  function pageStrat(host, id) {
    var st = stratBy(id); if (!st) { head(host, "规则", "这条规则已经不在了"); return; }
    var g = st.game ? null : G.strats[id], isCur = S.stratId === id, ok = A.stratOk(st), tier = st.explain && st.explain.tier || st.tier, gw = st.game ? QL.WORLDS[st.game] : null;
    // 选用：这条规则在当前的世界里用不了时，要换一个世界，换之前说一声
    var pick = function () { return st.game ? { world: st.game, strat: id } : ok ? { world: S.world.type, strat: id } : { world: "gbm", strat: id, note: "这条规则用在价格世界里：已经切到\"" + QL.WORLDS.gbm.short + "\"。" }; };
    var acts = [isCur ? btn("回到实验", function () { if (ui) ui.close(); }, true) : btn("选用这条规则", closeThen(function () { A.applySetup(pick()); }), true),
      btn("代码与理论说明", function () { A.openCode("explain", st); })];   // 只是看：不换规则、不重跑，Esc 回到这一页
    if (gw) acts.push(btn("所属的玩法：" + gw.short, function () { show("game:" + st.game); }));
    head(host, "规则 · " + (gw ? gw.short : st.src ? "我的策略" : st.group), st.name, h("p", { class: "gd-lede" }, A.tierBadge(tier), " ", st.summary || ""), acts);
    if (st.game && G.gstrats[id]) host.appendChild(sec("用在哪", md(G.gstrats[id])));
    if (g) {
      host.appendChild(sec("它从哪来", md(g.story)));
      host.appendChild(sec("适合的场景", md(g.good)));
      host.appendChild(sec("不适合的场景", md(g.bad)));
      host.appendChild(sec("该看什么", md(g.look)));
    }
    var bars = st.game ? gameRow(st) : priceBars({ strat: id });
    if (bars) host.appendChild(sec(st.game ? "在各个场景下的成绩" : "在各个世界里的成绩", bars, h("p", { class: "note", text: "在你的电脑上现算的，用的是默认参数。想用现在的参数重跑一遍，打开图表里的\"场景对比\"。" }),
      h("div", { class: "gd-acts" }, btn("打开\"场景对比\"", closeThen(function () { var go = pick(); go.charts = ["scenes"]; go.scenes = "rule"; A.applySetup(go); })))));
    var ac = algoCard(st); if (ac) host.appendChild(sec("算法的基础信息", ac));
    var e = st.explain;
    if (e && typeof e === "object") {
      host.appendChild(sec("假设", md(e.assume)));
      host.appendChild(sec("目标", md(e.objective)));
      host.appendChild(sec("最优性", md(e.optimal), tier ? h("p", { class: "note", text: "档位：" + (A.TIER[tier] || A.TIER.heuristic) + "。" + ((G.tiers || {})[tier] || "") }) : null));
      host.appendChild(sec("什么时候失效", md(e.fails)));
      host.appendChild(sec("可以检验的预测", md(e.test)));
    } else if (typeof e === "string") host.appendChild(sec("说明", md(e)));
    if (st.params && st.params.length) host.appendChild(sec("参数", h("dl", { class: "gd-gloss" }, [].concat.apply([], st.params.map(function (q) { return [h("dt", { text: q.label }), h("dd", { text: (q.type === "select" ? q.options.map(function (o) { return o[1]; }).join(" / ") : q.type === "bool" ? "开 / 关，默认" + (q.def ? "开" : "关") : "范围 " + mn(q.min) + " 到 " + mn(q.max) + (q.unit ? " " + q.unit : "") + "，默认 " + mn(q.def)) + (q.hint ? "。" + q.hint : "") })]; })))));
  }

  /* ---------- 图表 ---------- */
  function pageChart(host, id) {
    var c = A.CH[id]; if (!c) { head(host, "图表", "没有这张图"); return; }
    var g = G.charts[id] || {}, ok = A.chartOk(id), shown = A.shown().indexOf(id) >= 0;
    head(host, "图表", c.name, c.about, [ok ? btn(shown ? "去看这张图" : "打开这张图", closeThen(function () { A.toggleChart(id, true); }), true) : h("span", { class: "note", text: "这张图在当前的世界里用不上。" })]);
    if (g.q) host.appendChild(sec("它回答什么问题", md(g.q)));
    if (g.read) host.appendChild(sec("怎么读", md(g.read)));
    if (g.use) host.appendChild(sec("什么时候用", md(g.use)));
    if (g.trap) host.appendChild(sec("容易读错的地方", md(g.trap)));
    if (g.game) host.appendChild(sec("在十套玩法里", md(g.game)));
  }

  /* ---------- 对照表 ---------- */
  var mxMetric = "dg";
  function priceMatrix() {
    var M = mxAll().price, tb = h("tbody"), hd = [h("th", { text: "规则 ＼ 世界" })].concat(M.worlds.map(function (w) { return h("th", null, link(w.name, "world:" + w.type)); }));
    var bench = h("tr", { class: "mx-bench" }, h("th", { text: "基准：买入持有" + (mxMetric === "sharpe" ? "的夏普" : "的增长率") }));
    M.worlds.forEach(function (w) { bench.appendChild(w.bench ? h("td", null, h("span", { text: mxMetric === "sharpe" ? F(w.bench[1], 2) : pctTxt(w.bench[0]) })) : pendTd()); });
    M.strats.forEach(function (sid) {
      var st = stratBy(sid); if (!st || sid === "hold" || sid === "const") return;
      var tr = h("tr", null, h("th", null, link(st.name.replace(/（.*$/, ""), "strat:" + sid)));
      M.cells[sid].forEach(function (c, i) {
        var w = M.worlds[i]; if (c === undefined || (c && !w.bench)) { tr.appendChild(pendTd()); return; }
        var x = priceCell(c, mxMetric, w.bench), cls = x.mark === "up" ? "up" : x.mark === "down" ? "down" : "flat";
        tr.appendChild(h("td", { class: cls, style: { "--a": (x.z > 12 ? 34 : x.z > 5 ? 24 : 14) + "%" } }, h("button", { type: "button", title: cellTip(st, w, c), text: (cls === "flat" && x.text !== "—" ? "≈ " : "") + x.text, onclick: goPrice(w, sid) })));
      });
      tb.appendChild(tr);
    });
    return h("div", { class: "mx-wrap" }, h("table", { class: "mx" }, h("thead", null, h("tr", null, hd), bench), tb));
  }
  function pageMatrix(host) {
    head(host, "对照", "对照表：规则 × 场景", "横着读一行，是一条规则在不同场景下的表现；竖着读一列，是一个场景里各条规则的表现。");
    host.appendChild(md("这些数字不是事先写好的，是在你的电脑上现算的：每条规则用默认参数，每个世界用默认设定、种子 " + MX.seed + " 和默认的交易设定。第一次打开要等一会儿（算出一格显示一格），算过的存在这台设备的浏览器里，下次直接读；引擎或者任何一条内置规则一改，旧结果自动作废重算。\n\n点任何一格，页面会把世界、规则、种子和交易设定都摆成算表时的样子，所以点过去看到的是同一个数（你原来的交易设定会被换回默认值）。想换成自己的规则和参数，用图表里的\"场景对比\"。"));
    var all = { price: true, games: true };
    host.appendChild(liveBlock(all, function (done) {
      var L = A.live, n = 0, M0 = mxAll(); M0.price.strats.forEach(function () { n += M0.price.worlds.length; }); QL.ALL_GAMES.forEach(function (t) { n += M0.games[t].strats.length * M0.games[t].scenes.length; });
      return h("div", { class: "row lv-bar" }, done ? h("span", { class: "note", id: "mxDone", text: "全部 " + n + " 格都算好了" + (L.err ? "（有的格子没能算出来：" + L.err + "）" : "") + "。" }) : lvNote("对照表" + (L.threads ? "，用了 " + L.threads + " 个后台线程" : "")),
        done ? h("button", { class: "btn small", type: "button", text: "全部重算", title: "丢掉存着的结果，重新算一遍", onclick: function () { A.live.reset(); show("matrix"); } }) : null);
    }));
    var box = h("div"), seg = A.seg([["dg", "比基准多赚"], ["g", "增长率"], ["sharpe", "夏普"]], mxMetric, function (v) { mxMetric = v; draw(); });
    function draw() { clear(box); box.appendChild(liveBlock({ price: true }, function () { return priceMatrix(); })); }
    draw();
    host.appendChild(sec("价格世界：十六条规则 × 十五个世界", h("div", { class: "row", style: { margin: "4px 0 8px" } }, h("span", { class: "note", text: "每格显示" }), seg), box,
      h("p", { class: "note", style: { "margin-top": "6px" }, text: "\"比基准多赚\"和\"增长率\"的单位是每年的百分点。蓝底：显著好于买入持有（配对差超过 2 个标准误）；红底：显著差于；带 ≈ 的：分不出高下；\"破产\"：有路径净值归零，长期增长率是 −∞。\"买入持有\"就是基准，\"固定比例\"默认满仓、与基准相同，所以没有列出。一共两百多格，即使全无差别，也会有十来格碰巧显著。" }),
      md("**几条值得看的规律**\n\n- 前六列（经典分布的两列、几何布朗运动、跳跃、随机波动率、GARCH）没有可以预测的方向，几乎整列都是红的。在这些世界里，择时只是在付成本、丢漂移。\n- 趋势类的规则（均线、动量、止损、CPPI）在\"分数布朗运动\"一列是蓝的，在\"均值回复\"一列是红的；均值回复类的规则（z 分数带、固定阈值带、线性均值回复、网格）正好反过来。\n- \"牛熊切换\"一列里，隐马尔可夫模型遥遥领先：它假设的结构恰好就是那个世界真实的结构。\n- 带训练的规则在有结构的世界里赢得最多，在没有结构的世界里输得也不少。灵活是有代价的。\n- 最右边的一列是把标普 500 指数 1990 年起二十多年（训练段）的月收益一块一块打散重排：没有一条规则显著地大幅跑赢买入持有。")));
    QL.ALL_GAMES.forEach(function (t) { var m = gameMatrix(t); if (m) host.appendChild(sec(QL.WORLDS[t].name, m, h("div", { class: "gd-acts" }, h("button", { class: "btn small", type: "button", text: "这套玩法的细则与来历", onclick: function () { show("game:" + t); } })))); });
  }

  /* ---------- 算法对比 ---------- */
  function tbl(headRow, rows, cls) { return h("div", { class: "gd-tw" }, h("table", { class: "gd-t" + (cls ? " " + cls : "") }, h("thead", null, h("tr", null, headRow.map(function (x) { return h("th", { text: x }); }))), h("tbody", null, rows.map(function (r) { return h("tr", null, r.map(function (c, i) { return i === 0 ? h("th", null, c) : h("td", typeof c === "string" ? { text: c } : null, typeof c === "string" ? null : c); })); })))); }
  function pageAlgos(host) {
    var N = G.algoNotes || {};
    head(host, "对照", "算法对比：计算量与存储", "四张表，加上在你这台设备上量出来的数：事先算多少，每一步算多少，要记住多少东西。");
    host.appendChild(md(N.intro || ""));
    var np = function (st) { return String((st.params || []).filter(function (q) { return q.type === "num"; }).length); };
    var pr = A.allStrats().filter(function (st) { return !st.game && !st.src && G.algo[st.id]; }).map(function (st) { var a = G.algo[st.id]; return [link(st.name.replace(/（.*$/, ""), "strat:" + st.id), a.kind, a.fit, a.step, a.mem, a.need, np(st), A.tierBadge(st.explain && st.explain.tier)]; });
    host.appendChild(sec("价格世界的十八条规则", tbl(["规则", "类型", "事先的计算", "每一步", "存储", "需要的数据", "数值参数", "保证"], pr), md(N.price || "")));
    host.appendChild(sec("\"预测模型流水线\"里的十种模型", tbl(["模型", "它是什么", "训练", "预测一次", "存储", "备注"], G.models.map(function (m) { return [m.name, m.what || "", m.fit, m.pred, m.mem, m.note]; })), md(N.model || ""),
      h("div", { class: "gd-acts" }, btn("在当前的世界里实测这十种模型", closeThen(function () { var ok = !A.isGame(); A.applySetup({ world: ok ? S.world.type : "ar1", strat: "pipe", charts: ["mdlcmp"], note: ok ? "" : "预测模型的流水线是给\"" + A.TRADE.name + "\"用的：已经切到\"" + QL.WORLDS.ar1.short + "\"。" }); })))));
    var gr = []; QL.GAMES.forEach(function (t) { A.allStrats().filter(function (st) { return st.game === t && !st.src && G.algo[st.lib]; }).forEach(function (st) { var a = G.algo[st.lib]; gr.push([link(st.name, "strat:" + st.id), QL.WORLDS[t].short, a.kind, a.fit, a.step, a.mem, a.need]); }); });
    host.appendChild(sec("十套玩法的内置规则", tbl(["规则", "玩法", "类型", "事先的计算", "每一步", "存储", "需要的数据"], gr), md(N.game || "")));
    var orr = []; QL.OBS.forEach(function (t) { A.allStrats().filter(function (st) { return st.game === t && !st.src && G.algo[st.lib]; }).forEach(function (st) { var a = G.algo[st.lib]; orr.push([link(st.name, "strat:" + st.id), QL.WORLDS[t].short, a.kind, a.fit, a.step, a.mem, a.need]); }); });
    host.appendChild(sec("四套观测玩法的内置规则", tbl(["规则", "玩法", "类型", "事先的计算", "每一步", "存储", "需要的数据"], orr), md(N.obs || "")));
    host.appendChild(sec("实测", md(N.measure || "")));
  }

  /* ---------- 名词 ---------- */
  function pageGlossary(host) {
    head(host, "从这里开始", "名词", "页面和手册里出现的词，分成几组。不认识的词在这里筛，或者在手册顶上的搜索框里找。");
    var inp = h("input", { type: "text", placeholder: "筛选…", "aria-label": "筛选名词", class: "gd-filter" }), box = h("div");
    function draw() {
      var q = inp.value.trim().toLowerCase(), any = false; clear(box);
      var dl = null; box._pending = null;
      G.glossary.forEach(function (x) {
        if (typeof x === "string") { dl = null; box._pending = x; return; }                       // 小标题：这一组里有匹配的才写出来
        if (q && (x[0] + x[1]).toLowerCase().indexOf(q) < 0) return;
        if (!dl) { if (box._pending) box.appendChild(h("h3", { class: "gd-gh", text: box._pending })); dl = h("dl", { class: "gd-gloss" }); box.appendChild(dl); }
        dl.appendChild(h("dt", { text: x[0] })); dl.appendChild(h("dd", { text: x[1] })); any = true;
      });
      if (!any) box.appendChild(h("p", { class: "note", text: "没有匹配的名词。" }));
    }
    inp.addEventListener("input", draw); host.appendChild(inp); host.appendChild(box); draw();
  }

  /* ================================================================== *
   *  外壳：目录、搜索、翻页
   * ================================================================== */
  function renderPage(key) {
    var art = ui.art, host = h("div", { class: "gd-in" }), m;
    clear(art); art.appendChild(host);
    try {
      if ((m = /^start:(.+)$/.exec(key))) { var s = G.start.filter(function (x) { return x.id === m[1]; })[0]; head(host, "从这里开始", s.title); body(host, s.body); }
      else if (key === "now") pageNow(host);
      else if (key === "games") pageGames(host);
      else if (key === "game:trade") pageTrade(host);
      else if ((m = /^game:(.+)$/.exec(key))) pageGame(host, m[1]);
      else if (key === "selfcheck") pageSelf(host);
      else if ((m = /^world:(.+)$/.exec(key))) pageWorld(host, m[1]);
      else if ((m = /^strat:(.+)$/.exec(key))) pageStrat(host, m[1]);
      else if ((m = /^chart:(.+)$/.exec(key))) pageChart(host, m[1]);
      else if (key === "matrix") { host.classList.add("wide"); pageMatrix(host); }
      else if (key === "algos") { host.classList.add("wide"); pageAlgos(host); }
      else if (key === "glossary") pageGlossary(host);
    } catch (e) { console.error(e); host.appendChild(h("div", { class: "warn err", text: "这一条显示不出来：" + (e.message || e) })); }
    // 上一条 / 下一条
    var L = idx.list.filter(function (e) { return !e.hidden; }), i = -1; L.forEach(function (e, k) { if (e.key === key) i = k; });
    if (i >= 0) host.appendChild(h("div", { class: "gd-pn" }, i > 0 ? h("button", { class: "btn", type: "button", text: "← " + L[i - 1].title, onclick: function () { show(L[i - 1].key); } }) : h("span"), i < L.length - 1 ? h("button", { class: "btn", type: "button", text: L[i + 1].title + " →", onclick: function () { show(L[i + 1].key); } }) : h("span")));
    art.scrollTop = 0;
  }
  function renderToc() {   // 窄屏上代替左边目录的下拉框
    var toc = ui.toc, lastG = "", og = null; clear(toc);
    if (idx.by[curKey] && idx.by[curKey].hidden) toc.appendChild(h("option", { value: curKey, text: idx.by[curKey].title, selected: true }));
    idx.list.forEach(function (e) {
      if (e.hidden) return;
      if (e.group !== lastG) { og = h("optgroup", { label: e.group }); toc.appendChild(og); lastG = e.group; }
      og.appendChild(h("option", { value: e.key, text: (e.sub ? e.sub + " · " : "") + e.title, selected: e.key === curKey }));
    });
  }
  function renderNav(q) {
    var nav = ui.nav, lastG = "", lastS = "", words = (q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    clear(nav); ui.main.classList.toggle("searching", words.length > 0);
    var L = idx.list.filter(function (e) { if (words.length) return words.every(function (w) { return textOf(e).indexOf(w) >= 0; }); return !e.hidden; });
    if (words.length) {
      var rank = function (e) { var t = (e.title + " " + (e.full || "")).toLowerCase(), k = (e.keys || "").toLowerCase(), sc = 0; words.forEach(function (w) { sc += t.indexOf(w) >= 0 ? 4 : k.indexOf(w) >= 0 ? 2 : 1; }); return sc; };
      L = L.map(function (e, i) { return [rank(e), i, e]; }).sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; }).map(function (x) { return x[2]; });
    }
    if (words.length) nav.appendChild(h("div", { class: "sub", text: L.length ? "找到 " + L.length + " 条" : "没有找到。换个说法，或者到 " + A.AI + " 面板里直接问。" }));
    L.forEach(function (e) {
      if (!words.length && e.group !== lastG) { nav.appendChild(h("h4", { text: e.group })); lastG = e.group; lastS = ""; }
      if (!words.length && e.sub && e.sub !== lastS) { nav.appendChild(h("div", { class: "sub", text: e.sub })); lastS = e.sub; }
      nav.appendChild(h("button", { class: "gd-link", type: "button", "data-key": e.key, "aria-current": e.key === curKey ? "true" : null, onclick: function () { pick(e.key); } }, words.length ? h("small", { text: (e.kicker || e.group) + " · " }) : null, e.title));
    });
    ui.results = L;
  }
  function pick(key) { show(key); }
  function show(key) {
    if (!ui) { A.openGuide(key); return; }
    if (!idx.by[key]) key = "start:what";
    if (ui.search.value && narrow()) { ui.search.value = ""; renderNav(""); }   // 窄屏上搜索结果盖着正文：不管从哪里翻到一条，都先把搜索收起来
    curKey = key; flags().guideKey = key;
    renderPage(key);
    Array.prototype.forEach.call(ui.nav.querySelectorAll(".gd-link"), function (b) { if (b.getAttribute("data-key") === key) { b.setAttribute("aria-current", "true"); if (b.scrollIntoView) b.scrollIntoView({ block: "nearest" }); } else b.removeAttribute("aria-current"); });
    renderToc();
  }
  /** 打开手册。key 省略时回到上次看的那一条；第一次打开落在"这是什么" */
  A.openGuide = function (key) {
    idx = buildIndex();
    if (!key) key = flags().guideKey || "start:what";
    if (!idx.by[key]) key = "start:what";
    dismissHint();
    if (ui) { show(key); return; }
    var search = h("input", { type: "text", class: "gd-search", placeholder: "在手册里找…", "aria-label": "在手册里找" });
    var toc = h("select", { class: "gd-toc", "aria-label": "目录", onchange: function () { show(toc.value); } });
    var nav = h("nav", { class: "gd-nav", "aria-label": "手册目录" }), art = h("article", { class: "gd-art", tabindex: "-1" });
    var hd = h("div", { class: "gd-h" }, h("h2", { text: "手册" }), h("button", { class: "btn small", type: "button", text: "当前的细则", title: "这个世界（这套玩法）现在怎么运转、怎么计分", onclick: function () { show("now"); } }), search,
      h("button", { class: "iconbtn gd-close", type: "button", "aria-label": "收起手册", title: "收起（Esc）", text: "✕", onclick: function () { m.close(); } }));
    var main = h("div", { class: "gd-main" }, nav, art);
    var m = A.modal("手册", [hd, toc, main], { bare: true, cls: "guide", focus: ".gd-art", onClose: function () { ui = null; A.persist(); } });
    ui = { close: m.close, api: m, nav: nav, art: art, toc: toc, search: search, main: main, results: [] };
    search.addEventListener("input", function () { renderNav(search.value); });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229 && search.value.trim() && ui.results && ui.results[0]) { e.preventDefault(); pick(ui.results[0].key); }   // 输入法选字时的回车不算；空着的时候回车不跳页
    });
    m.box.addEventListener("keydown", function (e) {   // 搜索框里有字时，Esc 先清空它，再按一次才收起手册（焦点在手册里的哪儿都一样）
      if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229 && search.value) { e.preventDefault(); e.stopPropagation(); search.value = ""; renderNav(""); }
    });
    curKey = key; renderNav(""); show(key);
  };
  /** ? 键：手册在最上面就收起；上面还盖着别的弹层（代码、命令面板）时不动它；什么都没开时打开 */
  A.toggleGuide = function () {
    var top = A.modalTop ? A.modalTop() : null;
    if (ui) { if (!top || top === ui.api) ui.close(); }
    else if (!top) A.openGuide();
  };
  A.guideCommands = function () {
    return buildIndex().list.map(function (e) { return { kind: "手册", name: (e.hidden ? (e.kicker || "") + " · " : e.group === "从这里开始" || e.group === "对照" || e.group === "当前" ? "" : e.group + " · ") + (e.full || e.title), key: e.title + " " + (e.keys || ""), run: function () { A.openGuide(e.key); } }; });
  };
  /** 左栏的设定变了、新的结果出来了：开着的那一页如果写着当前的数字，跟着重画（滚动位置不动） */
  function live() {
    if (!ui || !(curKey === "now" || /^strat:/.test(curKey) || curKey === "game:" + S.world.type || curKey === "world:" + S.world.type)) return;
    if (A.modalTop && A.modalTop() !== ui.api) return;
    var y = ui.art.scrollTop; renderPage(curKey); ui.art.scrollTop = y;
  }
  A.on("run", live); A.on("world", live);
  /** 给 Claude 的图表目录用：这张图回答什么问题、什么时候该用它 */
  A.guideChartAbout = function (id) { var g = G.charts[id]; return g ? "回答的问题：" + g.q + " 适用：" + g.use : A.CH[id].about; };

  /* ---------- 第一次来的提示 ---------- */
  function dismissHint() { var el = $("guideHint"); if (el) el.remove(); if (!flags().guideSeen) { flags().guideSeen = true; A.persist(); } }
  A.initGuide = function () {
    if (flags().guideSeen || $("guideHint")) return;
    var pane = $("paneRes"); if (!pane) return;
    pane.insertBefore(h("div", { class: "ghint", id: "guideHint", role: "note" },
      h("span", null, h("b", { text: "第一次来？" }), "手册里有五个两三分钟的小实验、每套玩法的完整细则，以及每张图、每条规则的应用场景。平时它是收起的，按 ", h("kbd", { text: "?" }), " 或者点任何一个小问号都能调出来。"),
      h("span", { class: "row tight" }, h("button", { class: "btn small primary", type: "button", text: "打开手册", onclick: function () { A.openGuide("start:what"); } }), h("button", { class: "btn small", type: "button", text: "知道了", onclick: dismissHint }))), pane.firstChild);
  };
})(App);
