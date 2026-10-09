// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体（二）：左栏的控件、结果摘要、弹层。 */
(function (A) {
  "use strict";
  var h = A.h, $ = A.$, clear = A.clear, S = A.state, QL = A.QL, F = A.F, P = A.P;
  var TIER = { proven: "可证最优", family: "族内最优", bound: "有保证", heuristic: "启发式" };
  var TIER_TIP = { proven: "在所述模型与目标下可以证明是最优的", family: "只在这个规则族内，通过选参数达到最优", bound: "有可以证明的性能保证（比如遗憾的上界、收敛到最优），但不是最优的", heuristic: "启发式规则，没有最优性保证" };
  A.TIER = TIER;
  A.tierBadge = function (t) { return h("span", { class: "tier " + (TIER[t] ? t : "heuristic"), title: TIER_TIP[t] || TIER_TIP.heuristic, text: TIER[t] || TIER.heuristic }); };

  /** 小问号：打开手册里对应的那一条 */
  A.helpBtn = function (key, title) {
    return h("button", { class: "helpbtn", type: "button", "aria-label": title || "说明", title: title || "说明", text: "?", onclick: function (e) { e.stopPropagation(); if (A.openGuide) A.openGuide(key); } });
  };

  /* ---------- 参数控件 ---------- */
  function decimals(step) { var s = String(step), i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; }
  /** 按参数表生成一组控件。onInput 在拖动中触发，onCommit 在松手后触发 */
  A.renderParams = function (host, schema, vals, onInput, onCommit, idp) {
    clear(host);
    (schema || []).forEach(function (q) {
      if (q.show && !q.show(vals)) return;
      var id = (idp || "p") + "-" + q.key;
      if (q.type === "select") {
        var sel = h("select", { id: id, onchange: function () { vals[q.key] = sel.value; onCommit(q.key, true); } },
          q.options.map(function (o) { return h("option", { value: o[0], text: o[1], selected: vals[q.key] === o[0] }); }));
        var dsc = q.descs && q.descs[vals[q.key]], hintEl = dsc || q.hint ? h("div", { class: "hint", text: dsc || q.hint }) : null;
        if (hintEl && q.descs) sel.addEventListener("change", function () { hintEl.textContent = q.descs[sel.value] || q.hint || ""; });
        host.appendChild(h("div", { class: "field" }, h("label", { for: id, text: q.label }), h("span"), sel, hintEl));
        return;
      }
      if (q.type === "bool") {
        var cb = h("input", { type: "checkbox", id: id, checked: !!vals[q.key], onchange: function () { vals[q.key] = cb.checked; onCommit(q.key); } });
        host.appendChild(h("div", { class: "field inline" }, h("label", { for: id, text: q.label }), cb));
        return;
      }
      var d = decimals(q.step), v = +vals[q.key];
      if (!(v === v)) v = vals[q.key] = q.def;
      var numI = h("input", { type: "number", id: id, min: q.min, max: q.max, step: q.step, value: v.toFixed(d), "aria-label": q.label });
      var rng = h("input", { type: "range", id: id + "-r", min: q.min, max: q.max, step: q.step, value: v, "aria-label": q.label + "（滑块）", tabindex: "-1" });
      function put(x, from) {
        if (!(x === x)) return false;
        x = Math.min(q.max, Math.max(q.min, x)); vals[q.key] = x;
        if (from !== "num") numI.value = x.toFixed(d);
        if (from !== "rng") rng.value = x;
        return true;
      }
      rng.addEventListener("input", function () { if (put(parseFloat(rng.value), "rng")) onInput(q.key); });
      rng.addEventListener("change", function () { onCommit(q.key); });
      numI.addEventListener("input", function () { var x = parseFloat(numI.value); if (x === x && x >= q.min && x <= q.max) { put(x, "num"); onInput(q.key); } });
      numI.addEventListener("change", function () { var x = parseFloat(numI.value); put(x === x ? x : vals[q.key], ""); onCommit(q.key); });
      host.appendChild(h("div", { class: "field" },
        h("label", { for: id, text: q.label }),
        h("span", { class: "val" }, numI, q.unit ? h("span", { class: "unit", text: q.unit }) : null),
        rng, q.hint || q.desc ? h("div", { class: "hint", text: q.hint || q.desc }) : null));
    });
  };
  function numField(label, id, val, min, max, step, onChange, unit) {
    var inp = h("input", { type: "number", id: id, min: min, max: max, step: step, value: val });
    inp.addEventListener("change", function () { var x = parseFloat(inp.value); if (!(x === x)) x = val; x = Math.min(max, Math.max(min, x)); inp.value = x; val = x; onChange(x); });
    return h("div", { class: "field" }, h("label", { for: id, text: label }), h("span", { class: "val" }, inp, unit ? h("span", { class: "unit", text: unit }) : null));
  }

  /* ---------- 世界 ---------- */
  /* 左栏最上面两块：先选玩法（做什么、怎么算分），再选世界（数据服从什么）。
   * 价格世界共用同一种玩法"交易一个资产"；十套玩法和四套观测玩法各自规定了能换哪些世界。 */
  A.TRADE = { name: "交易一个资产", blurb: "给你一条价格路径。每一步你决定持有多少仓位，净值跟着价格涨跌。和基准（一般是买入持有）在同一批路径上比，按三种口径衡量：长期增长率、夏普比率、带风险上限的期望收益。" };
  A.gameOf = function (type) { type = type || S.world.type; var x = QL.WORLDS[type]; return x && x.game ? type : "trade"; };
  /** 换玩法。回到"交易一个资产"时，世界回到上次在那里用的那一个 */
  A.setGame = function (g) { if (g === "trade") { var t = QL.WORLDS[S.lastPrice] && !QL.WORLDS[S.lastPrice].game && (S.lastPrice !== "custom" || S.custom) ? S.lastPrice : "gbm"; A.setWorldType(t); } else if (QL.WORLDS[g] && QL.WORLDS[g].game) A.setWorldType(g); };
  A.renderWorld = function () {
    var host = clear($("blkWorld")), gh = clear($("blkGame")), w = S.world, d = A.wdef(), vals = A.wp(), game = A.gameOf();
    var isW = function (q) { return !!d.wkeys && d.wkeys.indexOf(q.key) >= 0; };
    var onIn = function () { A.worldChanged(false); }, onCm = function (k, structural) { if (structural) A.renderWorld(); if (d.ranges) A.renderStrat(); A.worldChanged(true); };
    /* ---- 玩法 ---- */
    gh.appendChild(h("h2", null, "玩法", h("small", { text: "做什么、怎么算分" }), h("span", { class: "sp" }), A.helpBtn("game:" + game, "这套玩法的细则、来历和已知结论")));
    var gsel = h("select", { id: "gameType", "aria-label": "玩法", onchange: function () { A.setGame(gsel.value); } });
    gsel.appendChild(h("optgroup", { label: "交易" }, h("option", { value: "trade", text: A.TRADE.name + "（定仓位）", selected: game === "trade" })));
    [[QL.GAME_GROUP, QL.GAMES], [QL.OBS_GROUP, QL.OBS]].forEach(function (x) { gsel.appendChild(h("optgroup", { label: x[0] }, x[1].map(function (k) { return h("option", { value: k, text: QL.WORLDS[k].name, selected: k === game }); }))); });
    gh.appendChild(gsel);
    gh.appendChild(h("p", { class: "blurb", text: d.game ? d.blurb : A.TRADE.blurb }));
    gh.appendChild(h("div", { class: "row tight", style: { "margin-bottom": d.game ? "10px" : "0" } }, h("button", { class: "btn small", type: "button", id: "btnRules", text: "完整的细则与来历", onclick: function () { A.openGuide("game:" + game); } })));
    if (d.game) {
      var gp = h("div", { class: "fields" }); gh.appendChild(gp);
      A.renderParams(gp, A.wschema().filter(function (q) { return !isW(q); }), vals, onIn, onCm, "w");
    }
    /* ---- 世界 ---- */
    host.appendChild(h("h2", null, "世界", h("small", { text: "数据从哪里来" }), h("span", { class: "sp" }), A.helpBtn(d.game ? "game:" + w.type : "world:" + w.type, d.game ? "这套玩法能换哪些世界、换了之后应该看到什么" : "这个世界从哪来、什么时候用它")));
    if (d.game) {
      if (!d.wsel) host.appendChild(h("p", { class: "blurb", id: "worldFixed" }, h("b", { text: d.wname || "这套玩法自带的世界" }), "。", d.wdesc || ""));
      var wp0 = h("div", { class: "fields" }); host.appendChild(wp0);
      var ws = A.wschema().filter(isW); ws.sort(function (a, b) { return (b.key === d.wsel ? 1 : 0) - (a.key === d.wsel ? 1 : 0); });       // 换世界的那个下拉框排在最前面
      A.renderParams(wp0, ws, vals, onIn, onCm, "w");
    } else {
      var sel = h("select", { id: "worldType", "aria-label": "世界", onchange: function () { A.setWorldType(sel.value); } });
      QL.WORLD_GROUPS.forEach(function (g) {
        var og = h("optgroup", { label: g });
        Object.keys(QL.WORLDS).forEach(function (k) { var x = QL.WORLDS[k]; if (x.group !== g || x.game) return; if (k === "custom" && !S.custom) return; og.appendChild(h("option", { value: k, text: k === "custom" && S.custom ? "自定义：" + S.custom.name : x.name, selected: k === w.type })); });
        if (og.children.length) sel.appendChild(og);
      });
      host.appendChild(sel);
      host.appendChild(h("p", { class: "blurb", text: w.type === "custom" && S.custom ? (S.custom.summary || d.blurb) : d.blurb }));
    }
    if (d.needsData) {
      var ds = A.dataset(), dsel = h("select", { id: "dsSel", "aria-label": "数据集", onchange: function () { w.dsId = dsel.value; A.afterWorldChange(); } },
        A.datasets.map(function (x) { return h("option", { value: x.id, text: (x.src === "sample" ? "示例 · " : "") + x.name, selected: ds && x.id === ds.id }); }));
      host.appendChild(h("div", { class: "row tight", style: { "margin-bottom": "8px" } }, dsel, h("button", { class: "btn small", type: "button", text: "导入数据…", onclick: function () { A.openImport(); } })));
      if (ds) host.appendChild(h("p", { class: "note", style: { margin: "0 0 10px" }, text: QLIO.describe(ds) + (ds.src === "sample" ? "。示例数据是旧行情，只用来演示流程。" : "") }));
    }
    if (!d.game) { var ph = h("div", { class: "fields" }); host.appendChild(ph); A.renderParams(ph, A.wschema(), vals, onIn, onCm, "w"); }
    if (d.game) {   // 玩法：回合数由它自己的参数决定，这里只定重复多少局
      var gg = h("div", { class: "pair", style: { "margin-top": "12px" } });
      var capNote = h("div", { class: "note", id: "wNcap", style: { "margin-top": "6px" } });
      var showCap = function () { capNote.hidden = !(A.gameN() < w.N); capNote.textContent = capNote.hidden ? "" : "局数 × 每局的回合数有上限，这里实际按 " + A.gameN() + " 局算。"; };
      gg.appendChild(numField("局数 N", "wN", w.N, 20, 6000, 10, function (x) { w.N = Math.round(x); showCap(); A.worldChanged(true); }));
      gg.appendChild(numField("随机种子", "wSeed", w.seed, 0, 999999, 1, function (x) { w.seed = Math.round(x); A.worldChanged(true); }));
      host.appendChild(gg); host.appendChild(capNote); showCap();
      host.appendChild(h("div", { class: "row tight", style: { "margin-top": "10px" } }, h("button", { class: "btn small", type: "button", text: "换一批对局", title: "种子加 1，重新生成全部对局", onclick: function () { w.seed = (w.seed + 1) % 1000000; A.renderWorld(); A.worldChanged(true); } })));
      return;
    }
    if (w.type !== "real") {
      var grid = h("div", { class: "pair", style: { "margin-top": "12px" } });
      grid.appendChild(numField("路径数 N", "wN", w.N, 20, 6000, 10, function (x) { w.N = Math.round(x); A.worldChanged(true); }));
      grid.appendChild(numField(d.unit === "次" ? "下注次数 T" : "步数 T", "wT", w.T, 10, 4000, 1, function (x) { w.T = Math.round(x); A.worldChanged(true); }));
      if (!d.needsData && d.unit !== "次") grid.appendChild(numField("每年步数 K", "wK", w.K, 1, 100000, 1, function (x) { w.K = Math.round(x); A.worldChanged(true); }));
      var seedI = numField("随机种子", "wSeed", w.seed, 0, 999999, 1, function (x) { w.seed = Math.round(x); A.worldChanged(true); });
      grid.appendChild(seedI); host.appendChild(grid);
      host.appendChild(h("div", { class: "row tight", style: { "margin-top": "10px" } },
        h("button", { class: "btn small", type: "button", text: "换一批路径", title: "种子加 1，重新生成全部路径", onclick: function () { w.seed = (w.seed + 1) % 1000000; A.renderWorld(); A.worldChanged(true); } }),
        w.type === "custom" ? h("button", { class: "btn small", type: "button", text: "采样代码与说明", onclick: function () { A.openWorldCode(); } }) : null));
    }
    var th = d.theory ? d.theory(vals, { K: A.worldCfg().K, rf: S.set.rf }) : null, note = w.type === "custom" && S.custom ? S.custom.explain : th && th.note;
    if (note) {
      var body = h("div", { class: "more-body" }); QLMD.mount(body, note);
      host.appendChild(h("details", { class: "more", id: "worldKnown" }, h("summary", { text: "这个世界里已知什么" }), body));
    }
  };
  /** 把规则换成某套玩法自己的：你上次在那里用的，没有就用它的默认规则 */
  A.pickGameRule = function (t) {
    var d = QL.WORLDS[t], ids = [S.last[t], d.defStrat];
    for (var i = 0; i < ids.length; i++) { var id = ids[i]; if (typeof id !== "string") continue; var st = A.strat(id); if (st.id === id && A.stratOk(st, t)) { S.stratId = id; return; } }
  };
  A.setWorldType = function (t, quiet) {
    var prev = S.world.type, d = QL.WORLDS[t]; S.world.type = t;
    if (!d.game) S.lastPrice = t;
    if (d.game) S.world.N = d.defaults.N;
    else if (!d.needsData) { S.world.N = d.defaults.N; S.world.T = d.defaults.T; S.world.K = d.defaults.K; }
    else if (t === "boot") { S.world.N = d.defaults.N; S.world.T = d.defaults.T; }
    // 下注游戏的仓位天然在 [0,1]；离开时恢复
    var cf = S.sparams["const"] || (S.sparams["const"] = {});
    if (d.bounds && !(QL.WORLDS[prev] && QL.WORLDS[prev].bounds)) {
      S.set._saved = [S.set.fmin, S.set.fmax]; S.set.fmin = d.bounds[0]; S.set.fmax = d.bounds[1];
      // 满仓在赌局里等于每次全押，必然破产：进来时把固定比例先放到一个温和的值
      S.set._savedF = cf.f == null ? 1 : cf.f; if (!(cf.f <= 0.5)) cf.f = 0.1;
    } else if (!d.bounds && QL.WORLDS[prev] && QL.WORLDS[prev].bounds) {
      var sv = S.set._saved || [QL.DEFAULT_SET.fmin, QL.DEFAULT_SET.fmax]; S.set.fmin = sv[0]; S.set.fmax = sv[1];
      if (S.set._savedF != null) cf.f = S.set._savedF;
    }
    // 从价格世界进入一套玩法：先换成你上次在这里用的规则，没有就用它的默认规则。价格世界的规则在"动作是仓位"的玩法里也能用，
    // 但那得你自己去选：刚进来时看到的应该是这套玩法自己的打法，而不是碰巧还留着的那一条（比如满仓的"固定比例"，它恰好就是基准）。
    // 在两套玩法之间换的时候，手上的规则在新的那套里还能用就不动它。
    if (d.game && !(QL.WORLDS[prev] && QL.WORLDS[prev].game)) A.pickGameRule(t);
    A.fixStrat();                                    // 换了世界：规则换成这个世界里能用的那一条
    if (A.syncCharts) A.syncCharts();                // 图表架也跟着换（玩法和价格世界各记各的）
    if (A.claudeRefresh) A.claudeRefresh();          // Claude 面板里的例子也跟着换
    if (quiet) return;                               // 调用的人自己负责重画和重跑
    A.renderWorld(); A.renderSettings(); A.renderStrat(); A.worldChanged(true);
  };
  var liveWorld = A.debounce(function () { A.requestRun("live"); }, 60);
  A.worldChanged = function (commit) { $("topWorld").textContent = A.worldLabel(); if (commit) { A.afterWorldChange(); } else liveWorld(); };
  A.afterWorldChange = function () { A.oosCount = 0; A.renderWorldHead(); A.requestRun("commit"); };
  A.renderWorldHead = function () { $("topWorld").textContent = A.worldLabel(); };

  /* ---------- 规则 ---------- */
  A.renderStrat = function () {
    A.fixStrat();
    var host = clear($("blkStrat")), st = A.strat(), vals = A.sp(), d = A.wdef();
    S.stratId = st.id;
    host.appendChild(h("h2", null, "规则", h("small", { text: d.game && d.act !== "position" ? "每回合怎么做" : "怎么交易" }), h("span", { class: "sp" }), A.helpBtn("strat:" + st.id, "这条规则从哪来、用在什么场合")));
    var sel = h("select", { id: "stratSel", "aria-label": "规则", onchange: function () { A.setStrat(sel.value); } }), groups = [];
    var ok = A.stratsFor(), built = ok.filter(function (x) { return !x.src; }), mine = ok.filter(function (x) { return !!x.src; });
    built.sort(function (a, b) { return (b.game ? 1 : 0) - (a.game ? 1 : 0); });      // 这套玩法自己的规则排在前面
    built.forEach(function (x) { if (groups.indexOf(x.group) < 0) groups.push(x.group); });
    groups.forEach(function (g) { sel.appendChild(h("optgroup", { label: g }, built.filter(function (x) { return x.group === g; }).map(function (x) { return h("option", { value: x.id, text: x.name, selected: x.id === st.id }); }))); });
    if (mine.length) sel.appendChild(h("optgroup", { label: "我的策略" }, mine.map(function (x) { return h("option", { value: x.id, text: x.name, selected: x.id === st.id }); })));
    host.appendChild(sel);
    host.appendChild(h("p", { class: "blurb" }, A.tierBadge(st.explain && st.explain.tier || st.tier), " ", st.summary || ""));
    var ph = h("div", { class: "fields" }); host.appendChild(ph);
    // 需要重新训练模型的参数：拖动时不重算，松手才算
    A.renderParams(ph, A.sschema(st), vals, function (k) { if (!(st.fitKeys && st.fitKeys.indexOf(k) >= 0)) A.requestRun("live"); }, function (k, structural) { if (structural) A.renderStrat(); A.requestRun("commit"); }, "s");
    if (!st.params || !st.params.length) ph.appendChild(h("div", { class: "note", text: "这个规则没有可调的参数。" }));
    host.appendChild(h("div", { class: "row tight", style: { "margin-top": "12px" } },
      h("button", { class: "btn small", type: "button", text: "代码与说明", onclick: function () { A.openCode(); } }),
      h("button", { class: "btn small", type: "button", text: "加入对比", title: "把当前规则和参数钉到\"多策略对比\"图里", onclick: function () { A.pinCompare(); } }),
      st.src ? h("button", { class: "btn small ghost", type: "button", text: "删除", onclick: function () { A.deleteMy(st.id); } }) : null));
    host.appendChild(h("div", { class: "note", id: "fitNote", style: { "margin-top": "8px", "white-space": "pre-line" }, hidden: true }));
    host.appendChild(h("div", { class: "note algo", id: "algoNote", hidden: true }));
  };
  A.setStrat = function (id) { S.stratId = id; A.fitMs = null; A.fixStrat(); A.renderStrat(); A.requestRun("commit"); };
  A.deleteMy = function (id) {
    A.my = A.my.filter(function (m) { return m.id !== id; }); S.compare = S.compare.filter(function (c) { return c.stratId !== id; });
    if (S.stratId === id) { S.stratId = "const"; A.fixStrat(); }
    A.renderStrat(); A.requestRun("commit"); A.toast("已删除");
  };
  /** 新增或更新一条"我的策略"，返回它 */
  A.saveMy = function (o) {
    var i = -1; A.my.forEach(function (m, k) { if (m.id === o.id) i = k; });
    if (i >= 0) A.my[i] = o; else A.my.push(o);
    if (A.my.length > 40) A.my.shift();
    A.persist(); return o;
  };
  A.showFitNote = function () {
    var el = $("fitNote"), r = A.run; if (!el) return;
    var parts = [];
    if (r && r.hasFit && A.fitMs != null) {
      var took = A.fitMs < 1000 ? A.fitMs + " 毫秒" : (A.fitMs / 1000).toFixed(1) + " 秒", fi = r.fit;
      parts.push(!fi ? "模型已拟合，用时 " + took + "。"
        : fi.data ? "模型在训练段的前 " + Math.round(fi.frac * 100) + "%（" + fi.T + " 步）上拟合，用时 " + took + "；回测只用后面那一段。"
          : A.isGame() ? "先在另外生成的 " + fi.N + " 局上算了一遍，用时 " + took + "；计分用的这批对局它没见过。"
            : "模型在另外生成的 " + fi.N + " 条路径上拟合，用时 " + took + "；回测用的这批路径它没见过。");
    }
    if (r && r.note) parts.push(r.note);
    el.hidden = !parts.length; el.textContent = parts.join("\n");
  };
  /** 时间和大小的写法 */
  A.fmtNs = function (ns) { if (!(ns === ns) || ns == null) return "—"; return ns < 950 ? Math.round(ns) + " 纳秒" : ns < 950e3 ? (ns / 1e3).toFixed(ns < 1e4 ? 1 : 0) + " 微秒" : (ns / 1e6).toFixed(ns < 1e7 ? 1 : 0) + " 毫秒"; };
  /** 每步决策用时。整趟回测不到 1 毫秒时，浏览器计时器的分辨率不够，只能给一个上限 */
  A.fmtStep = function (ns, runMs, compact) {
    if (ns == null || !(ns === ns)) return compact ? "—" : " —";
    if (runMs != null && runMs < 1) { var cap = runMs > 0 ? ns / runMs : NaN; return cap === cap ? (compact ? "< " : "不到 ") + A.fmtNs(cap) + (compact ? "" : "（这一趟太短，量不准）") : compact ? "量不出来" : "太快，量不出来"; }
    return (compact ? "" : "约 ") + A.fmtNs(ns);
  };
  A.fmtMs = function (ms) { if (!(ms === ms) || ms == null) return "—"; return ms < 1 ? "不到 1 毫秒" : ms < 1000 ? Math.round(ms) + " 毫秒" : (ms / 1000).toFixed(ms < 1e4 ? 1 : 0) + " 秒"; };
  A.fmtCount = function (n) { if (!(n === n) || n == null) return "—"; return Math.round(n).toLocaleString("en-US") + A.n1(Math.round(n), " 个数", " 个数"); };
  /** 规则下面的一行小字：这条规则的计算量和存储量（理论上的写法 + 在这台设备上量出来的） */
  A.showAlgoNote = function () {
    var el = $("algoNote"), r = A.run; if (!el) return;
    clear(el);
    var st = A.strat(), G = window.QL_GUIDE, al = G && G.algo ? G.algo[st.lib || st.id] : null, parts = [];
    var brief = function (x) { return String(x).replace(/，见下表$/, ""); };   // 左栏里没有那张表
    if (al) parts.push(h("div", null, h("b", { text: "计算量 " }), "每步 " + brief(al.step) + "；存储 " + brief(al.mem) + (al.fit && al.fit !== "不用" ? "；事先 " + brief(al.fit) : "")));
    if (r && r.stepNs != null) {
      var m = ["每步决策" + A.fmtStep(r.stepNs, r.runMs)];
      if (r.stateSize != null) m.push(r.stateSize > 0 ? "开局时自带状态 " + A.fmtCount(r.stateSize) : r.hasInit ? "开局时状态是空的，之后边跑边记" : "不带状态");
      if (r.modelSize != null) m.push("模型 " + A.fmtCount(r.modelSize) + (r.fitMs != null ? "，训练用了 " + A.fmtMs(r.fitMs) : ""));
      parts.push(h("div", null, h("b", { text: "实测 " }), m.join("；"), " ", A.helpBtn("algos", "这些数字是什么意思、各种算法怎么比")));
    }
    el.hidden = !parts.length; parts.forEach(function (x) { el.appendChild(x); });
  };
  A.on("fit", function () { A.showFitNote(); });
  A.on("run", function () { A.showFitNote(); A.showAlgoNote(); });

  /* ---------- 交易设定 ---------- */
  A.renderSettings = function () {
    var host = clear($("blkSet")), set = S.set, bet = !!A.wdef().bounds, gd = A.wdef();
    host.hidden = !!gd.game && !gd.crit;             // 玩法的约束都写在它自己的参数里
    if (host.hidden) return;
    if (gd.game) {                                   // 仍按三种口径计分的玩法：成本和仓位范围归玩法管，这里只留风险上限
      host.appendChild(h("h2", null, "风险上限"));
      var gh = h("div", { class: "fields" }); host.appendChild(gh);
      A.renderParams(gh, [
        { key: "ddLimit", label: "回撤阈值 d", def: 30, min: 5, max: 95, step: 1, unit: "%", type: "num" },
        { key: "ddProb", label: "允许的概率 α", def: 5, min: 0, max: 50, step: 0.5, unit: "%", type: "num", hint: "第三种口径：在 P(最大回撤 ≥ d) ≤ α 的前提下看期望收益" }
      ], set, function () { A.requestRun("live"); }, function () { A.requestRun("commit"); }, "set");
      host.appendChild(h("div", { class: "note", style: { "margin-top": "8px" }, text: "交易成本和仓位范围由这套玩法的细则决定，在上面\"玩法\"一栏里改。" }));
      return;
    }
    host.appendChild(h("h2", null, "交易设定"));
    var cost = { key: "costBps", label: "交易成本（单边）", def: 5, min: 0, max: 100, step: 0.5, unit: "bp", type: "num", hint: "每换手 1 倍净值，扣掉这么多个基点" };
    var schema = bet
      ? [cost, { key: "fmax", label: "每次最多押上的比例（上限）", def: 1, min: 0.05, max: 1, step: 0.05, type: "num", hint: "这是上限，不是押多少。押多少在上面\"规则\"一栏的\"仓位比例 f\"里改" }]
      : [cost,
        { key: "rf", label: "无风险利率", def: 0, min: 0, max: 15, step: 0.25, unit: "%/" + A.unit(), type: "num" },
        { key: "fmin", label: "仓位下限", def: -1, min: -20, max: 0, step: 0.25, type: "num" },
        { key: "fmax", label: "仓位上限", def: 3, min: 0.25, max: 20, step: 0.25, type: "num" }];
    var ph = h("div", { class: "fields" }); host.appendChild(ph);
    A.renderParams(ph, schema, set, function () { A.requestRun("live"); }, function () { A.requestRun("commit"); }, "set");
    var rh = h("div", { class: "fields more-body" });
    A.renderParams(rh, [
      { key: "ddLimit", label: "回撤阈值 d", def: 30, min: 5, max: 95, step: 1, unit: "%", type: "num" },
      { key: "ddProb", label: "允许的概率 α", def: 5, min: 0, max: 50, step: 0.5, unit: "%", type: "num", hint: "第三种口径：在 P(最大回撤 ≥ d) ≤ α 的前提下看期望收益" }
    ], set, function () { A.requestRun("live"); }, function () { A.requestRun("commit"); }, "set");
    host.appendChild(h("details", { class: "more", open: true }, h("summary", { text: "风险上限" }), rh));
  };

  /* ---------- 摘要 ---------- */
  function verdict(d, se, unitFmt) {
    if (!(d === d) || !(se === se)) return h("span", { class: "verdict flat", text: "无法与基准比较" });
    if (d === 0 && !(se > 0)) return h("span", { class: "verdict flat", text: "= 与基准完全相同" });
    var z = se > 0 ? d / se : 0, cls = z > 2 ? "up" : z < -2 ? "down" : "flat";
    var txt = cls === "up" ? "▲ 高于基准 " : cls === "down" ? "▼ 低于基准 " : "≈ 与基准无显著差别 ", ds = unitFmt(d);
    if (!/[1-9]/.test(ds)) return h("span", { class: "verdict flat", title: "同一批路径上的配对差小于这里显示的精度", text: "≈ 与基准几乎相同" });
    return h("span", { class: "verdict " + cls, title: "同一批路径上的配对差；|差| > 2 倍标准误才算显著" }, txt, h("span", { class: "num", text: ds + " " + A.pm(se, true) }));
  }
  A.renderSummary = function () {
    var host = clear($("summary")), r = A.run, st = A.strat(), unit = A.unit(), d = A.wdef();
    var head = h("div", { class: "sum-head" }, h("h2", { text: "结果" }), h("span", { class: "meta", id: "sumMeta" }), h("span", { class: "sp" }));
    host.appendChild(head);
    if (A.err) {
      var e = A.err, msg = e.message || "出错了";
      host.appendChild(h("div", { class: "warn err" }, h("div", null, h("b", { text: e.compile ? "代码无法运行：" : e.needData ? "" : "运行出错：" }), msg,
        e.needData ? h("div", { class: "row", style: { "margin-top": "8px" } }, h("button", { class: "btn small", type: "button", text: "导入数据…", onclick: function () { A.openImport(); } })) : null,
        (e.compile || e.runtime || e.timeout) ? h("div", { class: "row", style: { "margin-top": "8px" } }, h("button", { class: "btn small", type: "button", text: "打开代码", onclick: function () { A.openCode("code"); } }), A.askFix ? h("button", { class: "btn small", type: "button", text: "让 " + A.AI + " 修复", onclick: function () { A.askFix(msg); } }) : null) : null)));
      return;
    }
    if (!r) { host.appendChild(h("div", { class: "statline" }, h("span", { class: "spin", style: { display: "inline-block", "vertical-align": "-2px", "margin-right": "8px" } }), d.game ? "正在生成对局并计分…" : "正在生成路径并回测…")); return; }
    var s = r.sum, b = r.benchSum, per = "每" + unit, G = d.game ? r.game : null, benchRef = G ? G.refs.filter(function (x) { return x.bench; })[0] : null;
    var benchName = benchRef ? benchRef.name : d.benchF === 0 ? "不下注" : "买入持有";
    $("sumMeta").textContent = st.name + " · " + s.N + (d.game ? " 局 × " : A.n1(s.N, " 条 × ", " 条 × ")) + s.T + (d.game && !d.crit ? " " + d.unit : " 步") + " · 用时 " + r.ms + " 毫秒";
    head.appendChild(h("span", { class: "meta", id: "sumBusy", hidden: true }, h("span", { class: "spin", style: { display: "inline-block", "vertical-align": "-2px", "margin-right": "6px" } }), "正在计算…"));
    head.appendChild(h("span", { class: "meta", text: "基准：" + benchName }));
    head.appendChild(A.helpBtn(d.game && !d.crit ? "game:" + S.world.type : "start:criteria", d.game && !d.crit ? "这套玩法怎么计分" : "这三个数各是什么意思"));
    if (G && !d.crit) { gameSummary(host, r, G); return; }
    var crit = h("div", { class: "crit" });
    // 口径一：长期增长率
    crit.appendChild(h("div", null,
      h("h3", null, "长期增长率 g", h("em", { text: "Kelly 口径 · E[log W_T] / 时长" })),
      h("div", { class: "big" }, s.growth === -Infinity ? "−∞" : A.pctS(s.growth), h("span", { class: "se", text: s.growth === -Infinity ? "有路径破产" : A.pm(s.growthSE, true) + " " + per })),
      h("div", { class: "sub" }, h("span", null, "基准 ", h("b", { class: "num", text: b.growth === -Infinity ? "−∞" : A.pctS(b.growth) })),
        s.growth === -Infinity ? h("span", { class: "verdict down", text: "▼ " + P(s.pRuin, s.pRuin < 0.01 ? 2 : 1) + " 的路径净值归零" }) : verdict(s.dGrowth, s.dGrowthSE, A.pctS))));
    // 口径二：夏普
    var dS = s.sharpe - b.sharpe;
    crit.appendChild(h("div", null,
      h("h3", null, "夏普比率", h("em", { text: unit === "年" ? "年化 · 超额收益 / 波动" : "每" + unit + " · 超额收益 / 波动" })),
      h("div", { class: "big" }, F(s.sharpe, 2), h("span", { class: "se", text: A.pm(s.sharpeSE, false, 2) })),
      h("div", { class: "sub" }, h("span", null, "基准 ", h("b", { class: "num", text: F(b.sharpe, 2) })), h("span", { class: "verdict " + (Math.abs(dS) < 2 * Math.hypot(s.sharpeSE, b.sharpeSE || 0) ? "flat" : dS > 0 ? "up" : "down"), text: Math.abs(dS) < 0.005 ? "差 0.00" : (dS > 0 ? "差 +" : "差 −") + Math.abs(dS).toFixed(2) }))));
    // 口径三：期望收益 + 风险上限
    crit.appendChild(h("div", null,
      h("h3", null, "期望收益", h("em", { text: "E[W_T] − 1，带风险上限" })),
      h("div", { class: "big" }, A.pctS(s.meanW - 1), h("span", { class: "se", text: A.pm(s.meanWSE, true) })),
      h("div", { class: "sub" }, h("span", null, "P(回撤 ≥ " + P(s.ddLimit, 0) + ") = ", h("b", { class: "num", text: P(s.pDD, 1) })),
        h("span", { class: "verdict " + (s.feasible ? "up" : "down"), text: (s.feasible ? "✓ 满足上限 " : "✕ 超出上限 ") + P(S.set.ddProb / 100, 1) }))));
    host.appendChild(crit);
    if (G) { host.appendChild(refTable(G, "同一批对局上的对照（按长期增长率）")); host.appendChild(auxLine(G)); }
    host.appendChild(h("div", { class: "statline" },
      h("span", null, "终值中位数 ", h("b", { text: F(s.medW, 3) })), h("span", null, "5%–95% 分位 ", h("b", { text: F(s.q05, 2) + " – " + F(s.q95, 2) })),
      h("span", null, "亏损概率 ", h("b", { text: P(s.pLoss, 1) })), h("span", null, "破产概率 ", h("b", { text: P(s.pRuin, s.pRuin > 0 && s.pRuin < 0.01 ? 2 : 1) })),
      h("span", null, "最大回撤中位数 ", h("b", { text: P(s.ddMed, 1) })), h("span", null, per + "换手 ", h("b", { text: F(s.turnover, 2) + " 倍" })), h("span", null, "平均仓位 ", h("b", { text: F(s.exposure, 2) }))));
    // 样本外
    var o = A.oos, real = A.isReal(), oosBox = h("div", { class: "oos" + (o && o.stale ? " stale" : ""), id: "oosBox" });
    oosBox.appendChild(h("button", { class: "btn small", type: "button", id: "btnOos", text: real ? "揭晓样本外" : d.game ? "用新的一批对局检验" : "用新路径检验", title: real ? "在没参与调参的后一段历史上回测" : "重新生成一批没见过的路径，用当前参数回测", onclick: function () { A.runOos(); } }));
    if (o && o.sum) {
      var q = o.sum;
      oosBox.appendChild(h("div", { class: "oos-vals" },
        h("span", null, (real ? "样本外（后一段历史）" : "新路径 #" + o.k) + (o.stale ? "（参数已变）" : "") + "："),
        h("span", null, "g ", h("b", { text: q.growth === -Infinity ? "−∞" : A.pctS(q.growth) + " " + A.pm(q.growthSE, true) })),
        h("span", null, "夏普 ", h("b", { text: F(q.sharpe, 2) + " " + A.pm(q.sharpeSE, false, 2) })),
        h("span", null, "E[W]−1 ", h("b", { text: A.pctS(q.meanW - 1) + " " + A.pm(q.meanWSE, true) })),
        h("span", null, "相对基准 Δg ", h("b", { text: q.dGrowth === q.dGrowth ? A.pctS(q.dGrowth) + " " + A.pm(q.dGrowthSE, true) : "—" }))));
      if (real && A.oosCount > 1) oosBox.appendChild(h("div", { class: "note", style: { "flex-basis": "100%" }, text: "这段样本外数据你已经看了 " + A.oosCount + " 次。每看一次、再回去调参，它就少一分\"样本外\"：在 " + A.oosCount + " 个互不相干的方案里挑最好的，即使全是噪声，最好的那个也会领先约 " + QL.expectedMaxNormal(A.oosCount).toFixed(1) + " 个标准误。" }));
      if (o.overlap) oosBox.appendChild(h("div", { class: "note", style: { "flex-basis": "100%" }, text: "滚动窗口互相重叠，上面的标准误偏小，只能当作下限。" }));
    } else oosBox.appendChild(h("span", { class: "note", text: real ? "上面的数字来自训练段。调好参数后再看样本外，并且尽量只看一次。" : S.world.type === "boot" ? "上面的数字来自你正在调参的这批路径。新路径是从同一段历史里重新抽出来的：它检验的是抽样的运气，不是这段历史本身；后者要换到\"真实数据\"世界去揭晓样本外。" : "上面的数字来自你正在调参的这批路径。新路径随时可以再生成，所以这里的检验是干净的。" }));
    host.appendChild(oosBox);
    if (s.badFrac > 0.25) host.appendChild(h("div", { class: "warn" }, "有 " + P(s.badFrac, 0) + " 的步数里规则返回了无效值（NaN），按空仓处理。若不是预热期造成的，请检查代码。"));
    if (r.sum.N === 1) host.appendChild(h("div", { class: "warn" }, "只有一条历史路径：没有分布，标准误来自时间序列本身，夏普的标准误约为 1/√年数。想看分布可以改用\"滚动窗口\"或 bootstrap 世界。"));
    if (r.overlapTrain) host.appendChild(h("div", { class: "warn" }, "滚动窗口互相重叠，标准误偏小。"));
    if (r.fit && r.fit.data) host.appendChild(h("div", { class: "warn" }, "这条规则要先训练模型：训练段的前 " + Math.round(r.fit.frac * 100) + "%（" + r.fit.T + " 步）留给模型学，上面的结果和图表只来自后面的 " + s.T + " 步。不带训练的规则用的是整个训练段，两者的数字不能直接比；放进\"多策略对比\"里会自动对齐到同一段。"));
  };
  /* ---------- 玩法的摘要：得分 + 对照 ---------- */
  var KIND = { sim: "参照", bound: "上界", alt: "换细则", theory: "理论", optimum: "理论最优", human: "真人实验" };
  /** 差值的判词：|差| 不到 2 倍标准误的不算数 */
  function gVerdict(G, d, se, soft) {
    if (!(d === d)) return h("span", { class: "verdict flat", text: "—" });
    var z = se > 0 ? d / se : d === 0 ? 0 : d > 0 ? 99 : -99, cls = z > 2 ? "up" : z < -2 ? "down" : "flat";
    if (d === 0 && !(se > 0)) return h("span", { class: "verdict flat", text: "= 逐局相同" });
    var ds = A.gdiff(G, d), ss = se > 0 ? A.gdiff(G, se).slice(1) : "";
    if (ds.charAt(0) === " " && !/[1-9]/.test(ss)) return h("span", { class: "verdict flat", title: "差别小于这里显示的精度", text: "≈ 几乎逐局相同" });
    var txt = (cls === "up" ? "▲ " : cls === "down" ? (soft ? "" : "▼ ") : "≈ ") + ds.replace(/^ /, "") + (ss ? " ± " + ss : "");
    return h("span", { class: "verdict " + (soft && cls === "down" ? "flat" : cls), title: "你的得分减去它的得分；同一批对局上的配对差，|差| > 2 倍标准误才算显著" + (G.lower ? "。正数表示你的成本更低" : "") }, h("span", { class: "num", text: txt }));
  }
  function refTable(G, caption) {
    var tb = h("tbody");
    G.refs.forEach(function (x) {
      var tag = x.bench ? "基准" : KIND[x.kind] || "参照";
      tb.appendChild(h("tr", { "data-ref": x.id }, h("td", null, h("span", { class: "tag", text: tag }), " ", x.name),
        h("td", { class: "num", text: x.err ? "出错" : A.gfmt(G, x.score) }),
        h("td", null, x.err ? h("span", { class: "note", text: x.err }) : gVerdict(G, x.d, x.dse, x.kind === "bound"))));
    });
    G.marks.forEach(function (m) {
      tb.appendChild(h("tr", { "data-mark": m.id }, h("td", null, h("span", { class: "tag", text: KIND[m.kind] || "理论" }), " ", m.name),
        h("td", { class: "num", text: A.gfmt(G, m.value) }), h("td", null, gVerdict(G, G.score - m.value, G.se, m.kind === "bound"))));
    });
    return h("div", { class: "gref" }, h("table", { class: "gtab" }, h("caption", { text: caption || "同一批对局上的对照" }),
      h("thead", null, h("tr", null, h("th", { text: "和谁比" }), h("th", { text: G.lower ? "它的成本" : "它的得分" }), h("th", { text: "你 − 它" }))), tb));
  }
  function auxFmt(a) { return a.kind === "prob" ? P(a.value, a.digits) : F(a.value, a.digits); }
  function auxLine(G) {
    return h("div", { class: "statline" }, G.aux.filter(function (a) { return a.value === a.value; }).map(function (a) { return h("span", null, a.name + " ", h("b", { text: auxFmt(a) })); }));
  }
  function gameSummary(host, r, G) {
    var d = A.wdef(), fm = function (v) { return A.gfmt(G, v); }, opt = null, bound = null, bench = null;
    G.marks.forEach(function (m) { if (m.kind === "optimum" && !opt) opt = m; if (m.kind === "bound" && !bound) bound = m; });
    G.refs.forEach(function (x) { if (x.bench) bench = x; if (x.kind === "bound" && !bound && !x.err) bound = { name: x.name, value: x.score }; });
    var sub = h("div", { class: "sub" });
    if (bench && !bench.err) sub.appendChild(h("span", null, "基准（" + bench.name + "）", h("b", { class: "num", text: " " + fm(bench.score) }), "　", gVerdict(G, bench.d, bench.dse)));
    if (opt) {
      var gap = G.score - opt.value, z = G.se > 0 ? gap / G.se : 0;
      sub.appendChild(h("span", { class: "verdict " + (z < -2 ? "down" : z > 2 ? "up" : "flat") }, z < -2 ? "▼ 离理论最优 " + fm(opt.value) + " 还差 " + A.gdiff(G, -gap).slice(1) : z > 2 ? "▲ 高于理论值 " + fm(opt.value) + "（理论值是长期平均或近似时会这样）" : "≈ 达到了理论最优 " + fm(opt.value)));
    } else if (bound) sub.appendChild(h("span", { class: "verdict flat", text: "上界 " + fm(bound.value) + "（" + bound.name.replace(/（.*$/, "") + "）" }));
    var left = h("div", { class: "gscore" },
      h("h3", null, G.lower ? "成本（越低越好）" : "得分", h("em", { text: G.name + (G.unit ? " · " + G.unit : "") })),
      h("div", { class: "big" }, fm(G.score), h("span", { class: "se", text: G.se > 0 ? "± " + A.gdiff(G, G.se).slice(1) : "" })), sub);
    host.appendChild(h("div", { class: "gsum" }, left, refTable(G)));
    host.appendChild(auxLine(G));
    var o = A.oos, oosBox = h("div", { class: "oos" + (o && o.stale ? " stale" : ""), id: "oosBox" });
    oosBox.appendChild(h("button", { class: "btn small", type: "button", id: "btnOos", text: "用新的一批对局检验", title: "重新生成一批没见过的对局，用当前参数再打一遍", onclick: function () { A.runOos(); } }));
    if (o && o.game) {
      var ob = o.game.refs.filter(function (x) { return x.bench; })[0];
      oosBox.appendChild(h("div", { class: "oos-vals" }, h("span", null, "新的一批 #" + o.k + (o.stale ? "（参数已变）" : "") + "："),
        h("span", null, (G.lower ? "成本 " : "得分 "), h("b", { text: A.gfmt(o.game, o.game.score) + (o.game.se > 0 ? " ± " + A.gdiff(o.game, o.game.se).slice(1) : "") })),
        ob && !ob.err ? h("span", null, "相对基准 ", h("b", { text: A.gdiff(o.game, ob.d) + (ob.dse > 0 ? " ± " + A.gdiff(o.game, ob.dse).slice(1) : "") })) : null));
    } else oosBox.appendChild(h("span", { class: "note", text: "上面的得分来自你正在调参数的这批对局。调好之后换一批没见过的再打一遍：分数掉得多，说明参数只是迎合了这一批的运气。" }));
    host.appendChild(oosBox);
    if (r.sum.badFrac > 0.25) host.appendChild(h("div", { class: "warn" }, "有 " + P(r.sum.badFrac, 0) + " 的回合里规则返回了无效值（不是数，或者 NaN），裁判按\"什么都不做\"处理。请检查代码。"));
    else if (d.act === "position" && r.sum.exposure === 0 && r.sum.turnover === 0) host.appendChild(h("div", { class: "warn" }, "这条规则在这一批对局里从头到尾没有开过仓。常见的原因：它要回看的步数比一局还长（这里一局只有 " + r.sum.T + " " + (d.unit || "步") + "）。把它的窗口调短，或者把这一局调长。"));
  }
  A.gameRefTable = refTable;

  A.runOos = function () {
    var btn = $("btnOos"); if (btn) btn.disabled = true;
    var k = (A.oos && A.oos.k || 0) + 1, p = Object.assign({}, A.sp()), set = Object.assign({}, S.set), st0 = A.strat();
    A.send("oos", { p: p, set: set, k: k, fitKeys: A.fitKeys() }, { timeout: A.tmo(60000) }).then(function (m) {
      A.oosCount++; A.oos = { sum: m.sum, benchSum: m.benchSum, game: m.game || null, k: k, stale: false, overlap: m.overlap, sig: A.runSig(st0, p, set) }; A.renderSummary();
    }).catch(function (e) { A.toast("样本外检验失败：" + (e.message || e)); if (btn) btn.disabled = false; });
  };

  var busyT = 0;
  var busyTick = 0, busyT0 = 0;
  A.on("busy", function (on) {
    clearTimeout(busyT); clearInterval(busyTick);
    var set = function (v) {
      var el = $("sumBusy"); if (!el) return; el.hidden = !v; if (!v) return;
      var e = A.currentEngine(), fit = e && e.info && e.info.hasFit, sec = Math.round((Date.now() - busyT0) / 1000);
      el.lastChild.textContent = (fit ? "正在训练模型并回测…" : "正在计算…") + (sec >= 3 ? " 已用 " + sec + " 秒" + (sec >= 15 ? "（模型太重时可以把树的棵数、样本上限或特征数调小）" : "") : "");
    };
    if (on) { busyT0 = Date.now(); busyT = setTimeout(function () { set(true); busyTick = setInterval(function () { set(true); }, 1000); }, 350); } else set(false);
  });

  /* ---------- 弹层 ---------- */
  var stack = [];
  A.modal = function (title, body, opt) {
    opt = opt || {};
    var box = h("div", { class: "modal-box" + (opt.narrow ? " narrow" : "") + (opt.cls ? " " + opt.cls + "-box" : ""), role: "dialog", "aria-modal": "true", "aria-label": title });
    var wrap = h("div", { class: "modal" + (opt.cls ? " " + opt.cls : "") }, box), prev = document.activeElement;
    function close() { var i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); wrap.remove(); if (opt.onClose) opt.onClose(); if (prev && prev.focus) try { prev.focus(); } catch (e) {} }
    var api = { close: close, box: box, body: null, foot: null };
    if (!opt.bare) box.appendChild(h("div", { class: "modal-h" }, h("h2", { text: title }), opt.head || null, h("button", { class: "iconbtn", type: "button", "aria-label": "关闭", text: "✕", onclick: close })));
    api.body = h("div", { class: "modal-b" }, body); box.appendChild(api.body);
    if (opt.foot) { api.foot = h("div", { class: "modal-f" }, opt.foot); box.appendChild(api.foot); }
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) close(); });
    $("overlays").appendChild(wrap); stack.push(api);
    var f = box.querySelector(opt.focus || "input, textarea, select, button"); if (f) setTimeout(function () { f.focus(); }, 0);
    return api;
  };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && stack.length) { e.preventDefault(); stack[stack.length - 1].close(); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); A.openPalette(); return; }
    if ((e.key === "?" || e.key === "？") && !e.metaKey && !e.ctrlKey && !e.altKey && A.toggleGuide) {   // 正在打字时不抢
      var t = e.target, tag = t && t.tagName, ty = tag === "INPUT" ? String(t.type || "text").toLowerCase() : "";
      var typing = tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable) || (tag === "INPUT" && !/^(checkbox|radio|range|button|submit|reset|file|color)$/.test(ty));   // 勾选框、滑块上按 ? 照样算
      if (typing) return;
      e.preventDefault(); A.toggleGuide(); return;
    }
    if (e.key === "Tab" && stack.length && !e.defaultPrevented) {   // 弹层开着的时候，Tab 只在弹层里转
      var box = stack[stack.length - 1].box, cur = document.activeElement;
      var f = Array.prototype.filter.call(box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'), function (el) { return el.getClientRects().length > 0; });
      if (!f.length) { e.preventDefault(); return; }
      if (!box.contains(cur)) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && (cur === f[0] || f.indexOf(cur) < 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && cur === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  A.modalDepth = function () { return stack.length; };
  A.modalTop = function () { return stack.length ? stack[stack.length - 1] : null; };

  /* ---------- 代码与说明 ---------- */
  var KW = /\b(function|return|var|let|const|if|else|for|while|do|break|continue|new|typeof|null|undefined|true|false|NaN|Infinity|switch|case|default|this)\b/g;
  A.highlight = function (code) {
    var out = "", re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*(?:e[-+]?\d+)?\b)/gi, last = 0, m;
    function plain(s) { return QLMD.esc(s).replace(KW, '<span class="k">$1</span>'); }
    while ((m = re.exec(code))) {
      out += plain(code.slice(last, m.index));
      out += '<span class="' + (m[1] ? "c" : m[2] ? "s" : "n") + '">' + QLMD.esc(m[0]) + "</span>"; last = re.lastIndex;
    }
    return out + plain(code.slice(last));
  };
  A.explainMd = function (st) {
    var e = st.explain;
    if (!e) return "（这个策略没有附带说明。）";
    if (typeof e === "string") return e;
    return "## 模型假设\n\n" + e.assume + "\n\n## 目标函数\n\n" + e.objective + "\n\n## 最优性结论\n\n" + e.optimal + "\n\n## 何时失效\n\n" + e.fails + "\n\n## 可检验的预测\n\n" + e.test;
  };
  var API_DOC = [
    "function decide(s, p, st, model)   必须。每一步调用一次，返回目标仓位 f",
    "function init(p, model)            可选。每条路径开始时调用，返回这条路径自己的状态 st",
    "function fit(D, p, ml, rng)        可选。回测前调用一次，在专门留给模型的数据 D 上训练，返回 model",
    "",
    "f = 资产市值 / 净值：1 满仓，0 空仓，负数做空，大于 1 加杠杆。返回 NaN 视为空仓。",
    "",
    "s.t  s.T  s.K        当前步、总步数、每年步数",
    "s.price  s.logp      当前价格及其对数",
    "s.wealth  s.pos      当前净值（初始为 1）、当前仓位",
    "s.rf                 每步的无风险利率（交易设定里的年利率 ÷ 每年步数）；按超额收益下注时要减掉它",
    "s.p(k)               k 步前的价格",
    "s.ret(k)             最近第 k 个单步收益（k=0 是刚实现的一步）",
    "s.mom(n)             过去 n 步的累计收益",
    "s.sma(n)  s.psd(n)   最近 n 个价格的均值、标准差",
    "s.z(n)               (价格 − 均线) / 标准差",
    "s.mean(n)  s.vol(n)  最近 n 个单步收益的均值、标准差（每步）",
    "s.hi(n)  s.lo(n)     最近 n 个价格的最高、最低",
    "s.rets(n)  s.prices(n)  最近 n 个收益 / 价格组成的数组（旧的在前）",
    "数据不够时，上面返回单个数的函数给出 NaN，s.rets / s.prices 给出较短的数组。规则只能看到当前步及以前的数据。"
  ].join("\n");
  A.API_DOC = API_DOC;
  var GAME_DOC = [
    "function decide(s, p, st, model)   必须。每回合调用一次，返回这一回合的动作（一个数，含义见下）",
    "function init(p, model)            可选。每一局开始时调用，返回这一局自己的状态 st",
    "function fit(D, p, ml, rng)        可选。计分之前调用一次，在另外一批对局 D 上先算好要用的东西，返回 model",
    "",
    "s.t  s.T             现在是第几回合（从 0 数起）、一局共几回合",
    "s.g                  这套玩法的常数（见下）；fit 里是 D.g",
    "返回值不是数，或者是 NaN：记为无效动作，裁判按\"什么都不做\"处理。规则只能看到当前回合及以前的信息。"
  ].join("\n");
  /** 当前世界里规则能用到的接口：价格世界是一份，每套玩法各有自己的一份 */
  A.apiDoc = function () {
    var d = A.wdef(); if (!d.game) return API_DOC;
    return (d.act === "position" ? API_DOC + "\n\n── 这套玩法另外的规定 ──\n" : GAME_DOC + "\n\n── 这套玩法（" + d.short + "）──\n") + d.api;
  };
  A.ML_DOC = [
    "fit(D, p, ml, rng) 在回测前调用一次；返回的对象会作为 model 传给 init 和 decide。",
    "D 是专门留给模型的数据，回测用的数据 fit 看不到：模拟的世界里是另外生成的一批路径；真实数据里是训练段的前 60%，只有一条路径（D.N = 1）。",
    "D.N 路径数，D.T 步数，D.K；D.at(n, t) 返回第 n 条路径第 t 步的 s（与 decide 里的 s 一样用）；",
    "  D.next(n, t) 是第 t→t+1 步资产的收益；D.fwd(n, t, h) 是未来 h 步的累计收益。",
    "ml.dataset(D, feat, {warmup, maxRows, from, to, t0, t1, h, target}) → ds",
    "  feat(s) 返回特征数组，含 NaN 的行、长度不足的行（预热期）自动丢弃；目标默认是下一步收益；from/to 限定路径范围、t0/t1 限定时刻范围（切训练/验证用）。",
    "  训练集为空时各个模型会直接报错：先检查 ds.n，样本太少就 throw new Error(说明原因)。",
    "模型（都返回带 predict(x) 的对象，x 是特征数组）：",
    "  ml.ols(ds)   ml.ridge(ds, lambda)   ml.lasso(ds, alpha)   ml.logistic(ds, {l2})（y 取 0/1，predict 给概率）",
    "  ml.knn(ds, {k})   ml.tree(ds, {depth, minLeaf})   ml.forest(ds, {trees, depth, minLeaf, mtry, rng})",
    "  ml.gbm(ds, {trees, depth, lr, minLeaf, rng})   ml.mlp(ds, {hidden: [16], epochs, lr, rng})",
    "  ml.hmm(seqs, {states, iters}) → {mu, sd, A, stationary, filter()}；filter() 返回在线滤波器：update(r)、p、mean()、variance()",
    "  ml.kalman({q, r}) → 在线滤波器，update(y) 返回滤波后的均值",
    "工具：ml.mean(a)  ml.variance(a)  ml.metrics(pred, y) → {r2, ic, hit, mse}  ml.predictAll(model, ds)  ml.table(rows, ys)",
    "ml.diagnose(model, trainDs, validDs, featureNames) → 诊断报告。把它放进返回对象的 diag 字段，实验室会画出\"学到的函数\"\"模型诊断\"\"特征重要性\"三张图；",
    "  返回对象的 note 字段（字符串）会显示在规则下方。",
    "fit 的计算量控制在几秒以内：maxRows 一般取 1–2 万。"
  ].join("\n");
  /** viewSt：要看的规则。不是当前选用的那条时只读（能看、能复制，改之前先选用它） */
  A.openCode = function (tab, viewSt) {
    var st = viewSt || A.strat(), view = tab || "explain", ro = st.id !== S.stratId;
    var ex = h("div", { class: "explain" }), codeBox = h("div", { style: { display: "grid", "grid-template-columns": "minmax(0, 1fr)", gap: "10px" } }), errBox = h("div", { class: "warn err", hidden: true });
    QLMD.mount(ex, A.explainMd(st));
    var ta = h("textarea", { class: "codeedit", spellcheck: "false", "aria-label": "策略代码", id: "codeEdit" }); ta.value = st.code; if (ro) ta.readOnly = true;
    ta.addEventListener("keydown", function (e) { if (e.key === "Tab") { e.preventDefault(); var a = ta.selectionStart; ta.value = ta.value.slice(0, a) + "  " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = a + 2; } });
    var doc = h("pre", { class: "code", text: A.apiDoc() + "\n\n── 模型库（只在 fit 里可用）──\n" + A.ML_DOC, style: { "max-height": "260px" } });
    if (ro) codeBox.appendChild(h("div", { class: "note", text: "这条规则现在没有选用，这里只能看。想改它，先选用它，再点规则下面的\"代码与说明\"。" }));
    codeBox.appendChild(ta); codeBox.appendChild(errBox);
    if (!ro) codeBox.appendChild(h("details", { class: "more" }, h("summary", { text: "规则能用到的接口" }), h("div", { class: "more-body" }, doc)));
    var seg = h("div", { class: "seg" });
    function show(v) { view = v; ex.hidden = v !== "explain"; codeBox.hidden = v !== "code"; Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", b.dataset.v === v ? "true" : "false"); }); apply.hidden = v !== "code" || ro; copy.hidden = v !== "code"; }
    [["explain", "说明"], ["code", "代码"]].forEach(function (x) { seg.appendChild(h("button", { type: "button", "data-v": x[0], text: x[1], onclick: function () { show(x[0]); } })); });
    var apply = h("button", { class: "btn primary", type: "button", text: "应用修改", onclick: function () {
      var code = ta.value; if (code === st.code) { m.close(); return; }
      apply.disabled = true; errBox.hidden = true;
      A.tryStrategy(code, Object.assign({}, A.sp()), st.fitKeys).then(function () {
        var o;
        if (st.src) { o = Object.assign({}, st, { code: code }); }
        else { o = { id: "my-" + Date.now().toString(36), name: st.name + "（改）", group: "我的策略", summary: st.summary, params: st.params, scaleKey: st.scaleKey, fitKeys: st.fitKeys, explain: st.explain, tier: st.explain && st.explain.tier, code: code, src: "edit" }; if (st.game) o.game = st.game; S.sparams[o.id] = Object.assign({}, A.sp()); }
        A.saveMy(o); S.stratId = o.id; A.renderStrat(); A.requestRun("commit"); m.close(); A.toast(st.src ? "已更新" : "已另存为\"" + o.name + "\"");
      }).catch(function (e) { errBox.hidden = false; errBox.textContent = e.message || String(e); apply.disabled = false; });
    } });
    var copy = h("button", { class: "btn", type: "button", text: "复制代码", onclick: function () { A.copy(ta.value); } });
    var m = A.modal(st.name, [ex, codeBox], { head: [A.tierBadge(st.explain && st.explain.tier || st.tier), seg], foot: [copy, apply] });
    show(view);
  };
  A.copy = function (text) {
    var done = function () { A.toast("已复制"); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    function fallback() { var t = h("textarea", { style: { position: "fixed", opacity: "0" } }); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) { A.toast("复制失败，请手动选择文本"); } t.remove(); }
  };
  A.openWorldCode = function () {
    var c = S.custom; if (!c) return;
    var ex = h("div"); QLMD.mount(ex, c.explain || "（没有说明）");
    var ta = h("textarea", { class: "codeedit", spellcheck: "false", "aria-label": "采样代码" }); ta.value = c.code;
    var errBox = h("div", { class: "warn err", hidden: true });
    var apply = h("button", { class: "btn primary", type: "button", text: "应用修改", onclick: function () {
      var old = c.code; c.code = ta.value; errBox.hidden = true; apply.disabled = true;
      A.engine().then(function () { A.requestRun("commit"); m.close(); }).catch(function (e) { c.code = old; errBox.hidden = false; errBox.textContent = e.message || String(e); apply.disabled = false; });
    } });
    var m = A.modal("自定义世界：" + c.name, [ex, h("pre", { class: "code", style: { "max-height": "120px" }, text: "function simulate(T, rng, p)  →  返回长度为 T+1 的正的价格数组\nrng.u()  rng.normal()  rng.exp(rate)  rng.t(nu)  rng.gamma(k)  rng.poisson(lam)\nrng.bernoulli(p)  rng.laplace()  rng.cauchy()  rng.int(n)  rng.uniform(a, b)" }), ta, errBox], { foot: [apply] });
  };

  /* ---------- 命令面板 ---------- */
  A.commands = function () {
    var L = [];
    L.push({ kind: "操作", name: "用新路径做样本外检验", key: "oos 样本外 检验", run: function () { A.runOos(); } });
    L.push({ kind: "操作", name: "导入数据（CSV / 粘贴）", key: "import csv 导入 数据", run: function () { A.openImport(); } });
    L.push({ kind: "操作", name: "查看当前规则的代码与说明", key: "code 代码 说明", run: function () { A.openCode(); } });
    L.push({ kind: "操作", name: "换一批路径（种子 +1）", key: "seed 种子 重新", run: function () { S.world.seed = (S.world.seed + 1) % 1000000; A.renderWorld(); A.worldChanged(true); } });
    L.push({ kind: "操作", name: "把当前规则加入对比", key: "compare 对比 pin", run: function () { A.pinCompare(); } });
    L.push({ kind: "操作", name: "打开 " + A.AI + " 面板", key: "claude ai 助手", run: function () { A.openClaude(true); } });
    if (!A.aiHost && A.openAiSettings) L.push({ kind: "操作", name: "AI 设置：服务商、密钥、模型", key: "ai 设置 接入 密钥 key deepseek chatgpt openai kimi 豆包 doubao 模型", run: function () { A.openAiSettings(); } });
    L.push({ kind: "操作", name: "打开手册", key: "手册 说明 帮助 help guide 文档 怎么用", run: function () { if (A.openGuide) A.openGuide(); } });
    L.push({ kind: "操作", name: "恢复默认设置", key: "reset 重置 默认", run: function () { A.resetting = true; try { localStorage.removeItem("ql.lab.v1"); } catch (e) {} A.toast("已清除本机保存的设置。重新打开页面后生效；在那之前的改动不会再保存。", 5000); } });
    Object.keys(A.CH).forEach(function (id) { var c = A.CH[id]; if (!A.chartOk(id)) return; L.push({ kind: "图表", name: (A.shown().indexOf(id) >= 0 ? "收起：" : "显示：") + A.chartName(id), hint: c.about, key: c.name + " " + (c.keys || ""), run: function () { A.toggleChart(id, true); } }); });
    QL.WORLD_GROUPS.forEach(function (g) { Object.keys(QL.WORLDS).forEach(function (k) { var w = QL.WORLDS[k]; if (w.group !== g || (k === "custom" && !S.custom)) return; L.push({ kind: w.game ? "玩法" : "世界", name: w.name, key: w.name + " " + w.short + " " + k + (w.game ? " 玩法 游戏" : " 世界"), run: function () { A.setWorldType(k); } }); }); });
    L.push({ kind: "玩法", name: A.TRADE.name + "（定仓位）", key: "交易 资产 仓位 trade 玩法", run: function () { A.setGame("trade"); } });
    A.stratsFor().forEach(function (s) { L.push({ kind: "规则", name: s.name, key: s.name + " " + s.id + " " + (s.summary || ""), run: function () { A.setStrat(s.id); } }); });
    if (A.guideCommands) { try { A.guideCommands().forEach(function (c) { L.push(c); }); } catch (e) { console.error(e); } }   // 手册条目排在最后
    return L;
  };
  A.openPalette = function () {
    if (document.querySelector(".pal-in")) return;
    var cmds = A.commands(), list = h("div", { class: "pal-list", role: "listbox" }), cur = 0, shown = [];
    var inp = h("input", { class: "pal-in", type: "text", placeholder: "输入图表、世界、规则、操作或手册条目的名字…", "aria-label": "搜索命令" });
    function render() {
      var q = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      shown = cmds.filter(function (c) { if (!q.length && c.kind === "手册") return false; var k = (c.kind + " " + c.key + " " + c.name).toLowerCase(); return q.every(function (w) { return k.indexOf(w) >= 0; }); }).slice(0, 80);   // 什么都没输入时不把一百多条手册条目倒出来
      if (cur >= shown.length) cur = Math.max(0, shown.length - 1);
      clear(list);
      shown.forEach(function (c, i) { list.appendChild(h("button", { class: "pal-item", type: "button", role: "option", "aria-selected": i === cur ? "true" : "false", onclick: function () { go(i); } }, h("small", { text: c.kind }), h("span", { text: c.name }))); });
      if (!shown.length) list.appendChild(h("div", { class: "note", style: { padding: "8px 10px" }, text: "没有匹配的项。想要一张这里没有的图，可以到 " + A.AI + " 面板里直接说。" }));
      var sel = list.children[cur]; if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
    }
    function go(i) { var c = shown[i]; if (!c) return; m.close(); c.run(); }
    inp.addEventListener("input", function () { cur = 0; render(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); cur = Math.min(shown.length - 1, cur + 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cur = Math.max(0, cur - 1); render(); }
      else if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); go(cur); }   // 输入法正在选字时的回车不算
    });
    var m = A.modal("命令", [inp, list], { narrow: true, bare: true, focus: ".pal-in" });
    render();
  };

  /* ---------- 导入数据 ---------- */
  var MODES = [["price", "价格（正数水平）"], ["retpct", "每步收益率（%）"], ["ret", "每步收益率（小数）"], ["logret", "每步对数收益"], ["signal", "一般信号（物理量、指数等）"]];
  A.openImport = function () {
    var body = h("div", { style: { display: "grid", gap: "14px" } }), m;
    function useDs(id) { S.world.dsId = id; if (!A.wdef().needsData) { S.world.type = "real"; } m.close(); A.renderWorld(); A.afterWorldChange(); }
    function listBox() {
      var box = h("div", { class: "dslist" });
      A.datasets.forEach(function (ds) {
        box.appendChild(h("div", { class: "dsitem" }, h("span", { class: "tag", text: ds.src === "sample" ? "示例" : "已导入" }), h("span", { class: "nm", text: ds.name }), h("span", { class: "mt", text: ds.v.length + " 点 · K=" + ds.K }),
          h("button", { class: "btn small", type: "button", text: "使用", onclick: function () { useDs(ds.id); } }),
          ds.src === "import" ? h("button", { class: "iconbtn", type: "button", "aria-label": "删除 " + ds.name, text: "✕", onclick: function () { A.datasets = A.datasets.filter(function (x) { return x !== ds; }); if (S.world.dsId === ds.id) S.world.dsId = A.datasets[0] && A.datasets[0].id; A.persist(); redraw(); } }) : null));
      });
      return box;
    }
    var stage = h("div", { style: { display: "grid", gap: "10px" } });
    var file = h("input", { type: "file", accept: ".csv,.txt,.tsv,.dat,text/csv,text/plain", hidden: true, id: "impFile" });
    var drop = h("div", { class: "drop", tabindex: "0", role: "button", "aria-label": "选择或拖入文件" }, h("div", null, h("b", { text: "把 CSV 文件拖到这里" }), "，或者 ", h("button", { class: "btn small", type: "button", text: "选择文件", onclick: function (e) { e.stopPropagation(); file.click(); } }), " ", h("button", { class: "btn small", type: "button", text: "粘贴文本", onclick: function (e) { e.stopPropagation(); showPaste(); } })),
      h("div", { class: "note", style: { "margin-top": "6px" }, text: "任何一列数字都可以：行情、指数、物理测量值。自动识别逗号、分号、制表符和常见的日期写法。" }));
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) readFile(f); });
    file.addEventListener("change", function () { if (file.files[0]) readFile(file.files[0]); });
    function readFile(f) { if (f.size > 40e6) { fail("文件超过 40 MB，请先截取需要的时间段。"); return; } var r = new FileReader(); r.onload = function () { parsed(String(r.result), f.name.replace(/\.[^.]+$/, "")); }; r.onerror = function () { fail("读不了这个文件。"); }; r.readAsText(f); }
    function showPaste() {
      clear(stage); var ta = h("textarea", { rows: "7", placeholder: "把表格或一列数字粘贴到这里…", "aria-label": "粘贴数据", style: { width: "100%", "font-family": "var(--font-mono)", "font-size": "12px" } });
      stage.appendChild(ta); stage.appendChild(h("div", { class: "row" }, h("button", { class: "btn", type: "button", text: "解析", onclick: function () { parsed(ta.value, "粘贴的数据"); } }))); ta.focus();
    }
    function fail(msg) { clear(stage); stage.appendChild(h("div", { class: "warn err", text: msg })); }
    function parsed(text, name) {
      var tb; try { tb = QLIO.parseTable(text); } catch (e) { fail(e.message); return; }
      var g = QLIO.guess(tb), opt = { timeCol: g.timeCol, valCol: g.valCol, mode: "price", sens: 2 }, K = null, series = null;
      if (opt.valCol < 0) { fail("没有找到数值列。"); return; }
      clear(stage);
      var prev = h("div", { class: "tablewrap", style: { "max-height": "150px" } }), info = h("div", { class: "note" }), err = h("div", { class: "warn err", hidden: true });
      var tbl = h("table", { class: "data" }, h("thead", null, h("tr", null, tb.header.map(function (x) { return h("th", { text: x }); }))), h("tbody", null, tb.rows.slice(0, 5).map(function (r) { return h("tr", null, r.map(function (c) { return h("td", { text: c }); })); })));
      prev.appendChild(tbl);
      function colSel(cur, allowNone, on) { var s = h("select", { onchange: function () { on(+s.value); } }, (allowNone ? [h("option", { value: -1, text: "（没有）", selected: cur < 0 })] : []).concat(tb.header.map(function (x, i) { return h("option", { value: i, text: x, selected: i === cur }); }))); return s; }
      var nameI = h("input", { type: "text", value: name, "aria-label": "名称", id: "impName" }), kI = h("input", { type: "number", min: 1, max: 1000000, step: 1, id: "impK", "aria-label": "每年步数" });
      var modeS = h("select", { id: "impMode", onchange: function () { opt.mode = modeS.value; rebuild(); } }, MODES.map(function (x) { return h("option", { value: x[0], text: x[1] }); }));
      function rebuild() {
        try { series = QLIO.buildSeries(tb, opt); err.hidden = true; if (K == null || !kI.dataset.touched) { kI.value = series.K; } info.textContent = "识别到 " + series.n + " 个点" + (series.t ? "，" + QLIO.fmtDate(series.t[0]) + " 至 " + QLIO.fmtDate(series.t[series.t.length - 1]) : "，没有时间列（按行顺序）") + (series.dropped ? "，丢弃了 " + series.dropped + " 个非正数" : "") + "。"; go.disabled = false; }
        catch (e) { series = null; err.hidden = false; err.textContent = e.message; go.disabled = true; }
      }
      kI.addEventListener("input", function () { kI.dataset.touched = "1"; });
      var go = h("button", { class: "btn primary", type: "button", text: "导入并使用", onclick: function () {
        if (!series) return; var k = Math.max(1, Math.round(parseFloat(kI.value) || series.K));
        var ds = { id: "ds-" + Date.now().toString(36), name: (nameI.value || "未命名").slice(0, 40), K: k, mode: opt.mode, v: series.v, t: series.t, src: "import" };
        A.datasets.push(ds); A.persist(); useDs(ds.id); A.toast("已导入：" + ds.name);
      } });
      stage.appendChild(prev); stage.appendChild(info);
      stage.appendChild(h("div", { class: "pair" },
        h("div", { class: "field" }, h("label", { text: "时间列" }), h("span"), colSel(opt.timeCol, true, function (v) { opt.timeCol = v; rebuild(); })),
        h("div", { class: "field" }, h("label", { text: "数值列" }), h("span"), colSel(opt.valCol, false, function (v) { opt.valCol = v; rebuild(); })),
        h("div", { class: "field" }, h("label", { for: "impMode", text: "这一列是" }), h("span"), modeS),
        h("div", { class: "field" }, h("label", { for: "impK", text: "每年多少步" }), h("span", { class: "val" }, kI)),
        h("div", { class: "field", style: { "grid-column": "1 / -1" } }, h("label", { for: "impName", text: "名称" }), h("span"), nameI)));
      stage.appendChild(h("div", { class: "note", text: "\"一般信号\"会先按前 70% 的数据标准化，再映射成价格 100·exp(2%·z)：这样任何有正有负的序列都能当作可交易的指数，押的是它下一步的增减。" }));
      stage.appendChild(err); stage.appendChild(h("div", { class: "row", style: { "justify-content": "flex-end" } }, go));
      rebuild();
    }
    function redraw() {
      clear(body);
      body.appendChild(h("div", null, h("h3", { style: { margin: "0 0 6px", "font-size": "13.5px" }, text: "已有的数据" }), listBox()));
      body.appendChild(h("div", null, h("h3", { style: { margin: "0 0 6px", "font-size": "13.5px" }, text: "导入新的序列" }), drop, file));
      body.appendChild(stage);
      body.appendChild(h("details", { class: "more" }, h("summary", { text: "去哪里下载 CSV" }), h("div", { class: "more-body links" },
        h("div", null, h("b", { text: "美股与 ETF 日线：" }), h("a", { href: "https://stooq.com/q/d/?s=spy.us", target: "_blank", rel: "noopener", text: "Stooq" }), "（每个代码的历史数据页底部有 CSV 下载，如 spy.us、aapl.us）；", h("a", { href: "https://www.nasdaq.com/market-activity/etf/spy/historical", target: "_blank", rel: "noopener", text: "Nasdaq.com" }), "（Historical Data 页的 Download，最长 10 年）。"),
        h("div", null, h("b", { text: "指数与加密货币日线：" }), h("a", { href: "https://fred.stlouisfed.org/series/SP500", target: "_blank", rel: "noopener", text: "FRED" }), "（SP500、NASDAQCOM，以及 Coinbase 的 CBBTCUSD、CBETHUSD；页面右上 Download → CSV）。"),
        h("div", null, h("b", { text: "各交易所的加密货币 K 线：" }), h("a", { href: "https://www.cryptodatadownload.com/data/", target: "_blank", rel: "noopener", text: "CryptoDataDownload" }), "（日线、小时线、分钟线）；", h("a", { href: "https://data.binance.vision/?prefix=data/spot/monthly/klines/BTCUSDT/1d/", target: "_blank", rel: "noopener", text: "Binance 公开数据" }), "（解压后的 CSV 没有表头，会自动识别）。"),
        h("div", null, h("b", { text: "物理数据举例：" }), h("a", { href: "https://www.sidc.be/SILSO/datafiles", target: "_blank", rel: "noopener", text: "SILSO 太阳黑子数" }), "（分号分隔、没有表头：数值列选第 4 列，含义选\"一般信号\"，月度数据每年 12 步）。"),
        h("div", { class: "note", text: "页面本身不能联网，所以需要你下载后拖进来。导入的数据只保存在这台设备的浏览器里。" }))));
    }
    m = A.modal("数据", body, {});
    redraw();
  };

  /* ---------- 顶栏、标签页 ---------- */
  A.openClaude = function (on) {
    var app = $("app"), open = on == null ? !app.classList.contains("ai-open") : on;
    app.classList.toggle("ai-open", open); $("btnClaude").setAttribute("aria-pressed", open ? "true" : "false");
    if (open && window.matchMedia("(max-width: 779.9px)").matches) A.setTab("ai");
    if (open) { var t = $("aiInput"); if (t) setTimeout(function () { t.focus(); }, 30); }
    setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 30);
  };
  A.setTab = function (t) { $("app").dataset.tab = t; Array.prototype.forEach.call($("tabs").children, function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); }); setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 30); };
  A.initChrome = function () {
    $("btnPalette").addEventListener("click", function () { A.openPalette(); });
    var bg = $("btnGuide"); if (bg) bg.addEventListener("click", function () { if (A.openGuide) A.openGuide(); });
    $("btnClaude").addEventListener("click", function () { A.openClaude(); });
    Array.prototype.forEach.call($("tabs").children, function (b) { b.addEventListener("click", function () { A.setTab(b.dataset.tab); }); });
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "")) { var k = $("btnPalette").querySelector("kbd"); if (k) k.textContent = "Ctrl K"; }
  };
  /** 左栏的三块每次都是整块重画：原来有焦点的控件被换掉了，就把焦点交给新画出来的同一个控件 */
  function keepFocus(fn) {
    return function () {
      var el = document.activeElement, id = el && el.id ? el.id : "", pane = $("paneCtl"), top = pane ? pane.scrollTop : 0, r = fn.apply(this, arguments);
      if (id && !document.body.contains(el)) { var n = document.getElementById(id); if (n) { try { n.focus({ preventScroll: true }); } catch (e) {} } }
      if (pane && pane.scrollTop !== top) pane.scrollTop = top;      // 重画的一瞬间内容变短，浏览器会把滚动位置往上收：放回去
      return r;
    };
  }
  A.renderWorld = keepFocus(A.renderWorld); A.renderStrat = keepFocus(A.renderStrat); A.renderSettings = keepFocus(A.renderSettings);
})(App);
