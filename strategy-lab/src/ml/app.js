// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 界面主体（一）：小工具、状态与存档、左栏（任务 → 数据 → 算法 → 设置）、运行的调度、摘要。
 * 各种看法（图表、排行榜、模型内部、动画、数据）在 src/ml/views.js；AI 面板在 src/ml/ai.js；启动在 src/ml/main.js。
 * 所有计算都在后台线程里（src/ml/runner.js）；这个文件只管界面。 */
var MLA = (function () {
  "use strict";
  var QL = QL_CORE(window);
  ["QL_MLNN_INSTALL", "QL_MLSTATS_INSTALL", "QL_MLREG_INSTALL", "QL_MLDATA_TABULAR", "QL_MLDATA_TS", "QL_MLDATA_IMAGE", "QL_MLDATA_TOY"].forEach(function (n) { if (typeof window[n] === "function") window[n](QL); });
  var REG = QL.mlreg, ST = QL.mlstats, A = { QL: QL, REG: REG };

  /* ---------- DOM 小工具（和策略实验室的同名函数用法一样） ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag), i, k;
    if (attrs) for (k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") for (var s in v) el.style.setProperty(s, v[s]);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden" || k === "selected" || k === "open") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; } el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c))); }
  function $(id) { return document.getElementById(id); }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  var toastT;
  function toast(msg, ms) { var old = document.querySelector(".toast"); if (old) old.remove(); var el = h("div", { class: "toast", role: "status", text: msg }); document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(function () { el.remove(); }, ms || 2800); }
  var stack = [];
  function modal(title, body, opt) {
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
    var f = box.querySelector(opt.focus || "input, textarea, select, button"); if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 0);
    return api;
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && stack.length) { e.preventDefault(); stack[stack.length - 1].close(); return; }
    if ((e.key === "?" || e.key === "？") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var t = e.target, tag = t && t.tagName, ty = tag === "INPUT" ? String(t.type || "text").toLowerCase() : "";
      if (tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable) || (tag === "INPUT" && !/^(checkbox|radio|range|button|submit|reset|file|color)$/.test(ty))) return;
      e.preventDefault(); if (stack.length && stack[stack.length - 1].guide) stack[stack.length - 1].close(); else if (!stack.length && A.openGuide) A.openGuide(); return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !stack.length && document.activeElement && document.activeElement.id !== "aiInput") { e.preventDefault(); A.run(); }
  });
  var F = QLChart.fmtNum, G = QLChart.fmtG, P = QLChart.fmtPct;
  A.h = h; A.$ = $; A.clear = clear; A.toast = toast; A.modal = modal; A.modalTop = function () { return stack.length ? stack[stack.length - 1] : null; }; A.F = F; A.G = G; A.P = P;
  var subs = {};
  A.on = function (ev, f) { (subs[ev] = subs[ev] || []).push(f); };
  A.emit = function (ev, x) { (subs[ev] || []).forEach(function (f) { try { f(x); } catch (e) { console.error(e); } }); };

  /* ---------- 状态与存档 ---------- */
  var KEY = "ql.ml.v1";
  function fresh() { return { v: 1, group: "tab-cls", ds: {}, algo: {}, my: [], budget: 20, split: { train: 0.6, valid: 0.2 }, horizon: 1, view: "charts", flags: {} }; }
  function loadState() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o && o.v === 1) { var f = fresh(); for (var k in f) if (o[k] === undefined) o[k] = f[k]; return o; } } catch (e) {}
    return fresh();
  }
  var S = A.S = loadState();
  A.persist = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  /* ---------- 任务、数据、算法 ---------- */
  A.groups = function () { return REG.groups; };
  A.group = function () { var g = REG.groups.filter(function (x) { return x.id === S.group; })[0]; return g || REG.groups[0]; };
  A.dsOf = function (g) { return REG.inGroup ? REG.inGroup(g.id) : REG.list.filter(function (d) { return d.family === g.family && (!g.kind || d.kind === g.kind); }); };
  function dsState() { var g = A.group(); var st = S.ds[g.id]; if (!st || !REG.get(st.id) && st.id !== "csv") { var first = A.dsOf(g)[0]; st = S.ds[g.id] = { id: first ? first.id : "", seed: 1, params: {} }; } return st; }
  A.csv = null;   // 导入的 CSV：{ def, data }（只在这次打开页面期间有效，另外尽量存一份原文）
  A.ds = function () { var st = dsState(); if (st.id === "csv" && A.csv) return A.csv.def; return REG.get(st.id) || A.dsOf(A.group())[0]; };
  A.dsParams = function () { var d = A.ds(), st = dsState(); if (!d || d.id === "csv") return {}; var p = REG.clean(d, st.params[d.id] || {}); st.params[d.id] = p; return p; };
  A.dsSeed = function () { return dsState().seed | 0 || 1; };
  A.apiOf = function (def) { return def && def.kind === "forecast" ? "forecast" : "supervised"; };
  /** 这个数据集能用的算法：内置的、我的（自己改的和 AI 写的）、Python（连着本机引擎时） */
  A.algosFor = function (def) {
    if (!def) return [];
    var api = A.apiOf(def);
    function fits(a) { return a.api === api && (!a.kinds || a.kinds.indexOf(def.kind) >= 0) && (!a.families || a.families.indexOf(def.family) >= 0); }
    var list = (window.QL_MLALGOS || []).filter(fits).map(function (a) { return Object.assign({ src: "builtin", lang: "js" }, a); });
    S.my.forEach(function (a) { if (fits(a) && (a.lang !== "py" || (A.engineReady && A.engineReady()))) list.push(a); });
    if (A.engineReady && A.engineReady()) (window.QL_MLPY || []).filter(fits).forEach(function (a) { list.push(Object.assign({ src: "py", lang: "py" }, a)); });
    return list;
  };
  function algoState() { var d = A.ds(), key = d ? d.family + "/" + d.kind : "_"; var st = S.algo[key]; if (!st) st = S.algo[key] = { id: "", params: {} }; return st; }
  A.algo = function () { var d = A.ds(), list = A.algosFor(d), st = algoState(); var a = list.filter(function (x) { return x.id === st.id; })[0]; if (!a) { a = list[0] || null; st.id = a ? a.id : ""; } return a; };
  A.algoParams = function () { var a = A.algo(), st = algoState(); if (!a) return {}; var p = cleanParams(a.params || [], st.params[a.id] || {}); st.params[a.id] = p; return p; };
  function cleanParams(spec, vals) {
    var o = {};
    spec.forEach(function (q) {
      var v = vals[q.key];
      if (q.type === "select") o[q.key] = q.options.some(function (x) { return x[0] === v; }) ? v : q.def;
      else if (q.type === "bool") o[q.key] = typeof v === "boolean" ? v : !!q.def;
      else { var x = +v; if (!(x === x)) x = q.def; x = Math.min(q.max, Math.max(q.min, x)); if (q.type === "int") x = Math.round(x); o[q.key] = x; }
    });
    return o;
  }
  A.cleanParams = cleanParams;
  A.selectGroup = function (id) { if (S.group === id) return; S.group = id; A.persist(); A.renderLeft(); A.dataChanged(); };
  A.selectDs = function (id) { var st = dsState(); if (st.id === id) return; st.id = id; A.persist(); A.renderLeft(); A.dataChanged(); };
  A.selectAlgo = function (id) { var st = algoState(); st.id = id; A.persist(); A.renderAlgo(); A.emit("algo"); };
  A.newSeed = function () { var st = dsState(); st.seed = (st.seed | 0) + 1; A.persist(); A.renderData(); A.dataChanged(); };

  /* ---------- 参数的输入框（滑块 + 数字框；下拉；勾选） ---------- */
  function decimals(step) { var s = String(step); return s.indexOf("e-") >= 0 ? +s.split("e-")[1] : (s.split(".")[1] || "").length; }
  A.fields = function (host, spec, vals, onCommit, prefix) {
    var box = h("div", { class: "fields" }); host.appendChild(box);
    (spec || []).forEach(function (q) {
      var id = (prefix || "f") + "-" + q.key;
      if (q.type === "select") {
        var sel = h("select", { id: id, onchange: function () { vals[q.key] = sel.value; onCommit(q.key); } }, q.options.map(function (o) { return h("option", { value: o[0], text: o[1], selected: vals[q.key] === o[0] }); }));
        box.appendChild(h("div", { class: "field" }, h("label", { for: id, text: q.label }), h("span"), sel, q.desc ? h("div", { class: "hint", text: q.desc }) : null)); return;
      }
      if (q.type === "bool") {
        var cb = h("input", { type: "checkbox", id: id, checked: !!vals[q.key], onchange: function () { vals[q.key] = cb.checked; onCommit(q.key); } });
        box.appendChild(h("div", { class: "field inline" }, h("label", { for: id, text: q.label, title: q.desc || "" }), cb)); return;
      }
      var d = q.type === "int" ? 0 : decimals(q.step || 1), v = +vals[q.key]; if (!(v === v)) v = vals[q.key] = q.def;
      var numI = h("input", { type: "number", id: id, min: q.min, max: q.max, step: q.step || 1, value: v.toFixed(d), "aria-label": q.label });
      var rng = h("input", { type: "range", id: id + "-r", min: q.min, max: q.max, step: q.step || 1, value: v, "aria-label": q.label + "（滑块）", tabindex: "-1" });
      function put(x, from) { if (!(x === x)) return false; x = Math.min(q.max, Math.max(q.min, x)); if (q.type === "int") x = Math.round(x); vals[q.key] = x; if (from !== "num") numI.value = x.toFixed(d); if (from !== "rng") rng.value = x; return true; }
      rng.addEventListener("input", function () { put(parseFloat(rng.value), "rng"); });
      rng.addEventListener("change", function () { onCommit(q.key); });
      numI.addEventListener("change", function () { var x = parseFloat(numI.value); put(x === x ? x : vals[q.key], ""); onCommit(q.key); });
      box.appendChild(h("div", { class: "field" }, h("label", { for: id, text: q.label }), h("span", { class: "val" }, numI, q.unit ? h("span", { class: "unit", text: q.unit }) : null), rng, q.desc ? h("div", { class: "hint", text: q.desc }) : null));
    });
    return box;
  };
  function helpBtn(key, label) { return h("button", { class: "iconbtn helpbtn", type: "button", "aria-label": "说明：" + label, title: "说明", text: "?", onclick: function () { A.openGuide(key); } }); }
  A.helpBtn = helpBtn;

  /* ---------- 左栏 ---------- */
  var SHORT = { "tab-reg": "一行特征 → 一个实数", "tab-cls": "一行特征 → 一个类别", ts: "过去 → 未来", img: "像素与自旋格点", toy: "顿悟、群表示、相变……" };
  A.renderTask = function () {
    var host = clear($("blkTask")), g = A.group();
    host.appendChild(h("h2", null, "任务", h("small", { text: "先选做什么" }), h("span", { class: "sp" }), helpBtn("task:" + g.id, g.name)));
    host.appendChild(h("div", { class: "ml-groups", role: "group", "aria-label": "任务类型" }, REG.groups.map(function (x) {
      return h("button", { class: "chip", type: "button", "data-g": x.id, "aria-pressed": x.id === g.id ? "true" : "false", onclick: function () { A.selectGroup(x.id); } }, h("span", { text: x.name }), h("small", { text: x.short || SHORT[x.id] || "" }));
    })));
    $("topTask").textContent = g.name + " · " + (A.ds() ? A.ds().name : "");
  };
  A.renderData = function () {
    var host = clear($("blkData")), g = A.group(), d = A.ds(), st = dsState(), list = A.dsOf(g);
    host.appendChild(h("h2", null, "数据", h("small", { text: d ? kindName(d.kind) : "" }), h("span", { class: "sp" }), d ? helpBtn("ds:" + d.id, d.name) : null));
    var sel = h("select", { class: "ml-pick", id: "dsSel", "aria-label": "数据集", onchange: function () { A.selectDs(sel.value); } });
    var real = list.filter(function (x) { return x.source; }), syn = list.filter(function (x) { return !x.source; });
    if (syn.length) sel.appendChild(h("optgroup", { label: "模拟的数据（真值已知）" }, syn.map(function (x) { return h("option", { value: x.id, text: x.name, selected: x.id === st.id }); })));
    if (real.length) sel.appendChild(h("optgroup", { label: "真实数据" }, real.map(function (x) { return h("option", { value: x.id, text: x.name, selected: x.id === st.id }); })));
    if (A.csv && (g.family === A.csv.def.family) && (!g.kind || g.kind === A.csv.def.kind)) sel.appendChild(h("optgroup", { label: "导入的" }, h("option", { value: "csv", text: A.csv.def.name, selected: st.id === "csv" })));
    host.appendChild(sel);
    if (!d) return;
    host.appendChild(h("p", { class: "ml-blurb", text: d.summary || "" }));
    if (d.id !== "csv") {
      var vals = A.dsParams();
      A.fields(host, d.params, vals, function () { A.persist(); A.dataChanged(); }, "dp");
    }
    var seedI = h("input", { type: "number", id: "dsSeed", min: 1, max: 999999, step: 1, value: A.dsSeed(), "aria-label": "种子" });
    seedI.addEventListener("change", function () { var x = Math.max(1, Math.round(+seedI.value || 1)); seedI.value = x; st.seed = x; A.persist(); A.dataChanged(); });
    host.appendChild(h("div", { class: "ml-row" }, h("label", { class: "note", for: "dsSeed", text: "种子" }), seedI, h("button", { class: "btn small", type: "button", text: "换一批", title: "换一个种子：同样的设定，另一批随机样本", onclick: A.newSeed }), h("span", { class: "sp" }),
      (g.family === "tabular" || g.family === "timeseries") && A.openCsv ? h("button", { class: "btn small", type: "button", text: "导入 CSV…", onclick: function () { A.openCsv(); } }) : null));
    if (d.source) host.appendChild(h("div", { class: "ml-src" }, "来源：", d.source.url ? h("a", { href: d.source.url, target: "_blank", rel: "noopener noreferrer", text: d.source.name }) : d.source.name, d.source.license ? "（" + d.source.license + "）" : ""));
    $("topTask").textContent = g.name + " · " + d.name;
  };
  function kindName(k) { return k === "regression" ? "回归" : k === "classification" ? "分类" : k === "forecast" ? "预测" : ""; }
  A.kindName = kindName;
  var GROUP_NAMES = { baseline: "基线", linear: "线性模型", neighbors: "近邻", trees: "树模型", kernel: "核方法", neural: "神经网络", probabilistic: "概率模型", ts: "时间序列模型", other: "其他" };
  A.renderAlgo = function () {
    var host = clear($("blkAlgo")), d = A.ds(), list = A.algosFor(d), a = A.algo();
    host.appendChild(h("h2", null, "算法", h("small", { text: a ? (a.src === "ai" ? "AI 写的" : a.src === "mine" ? "我的" : a.src === "py" ? "Python · 本机引擎" : "内置") : "" }), h("span", { class: "sp" }), a && a.src !== "ai" && a.src !== "mine" ? helpBtn("algo:" + a.id, a.name) : null));
    if (!list.length) { host.appendChild(h("p", { class: "note", text: "这类任务还没有可用的算法。" })); return; }
    var sel = h("select", { class: "ml-pick", id: "algoSel", "aria-label": "算法", onchange: function () { A.selectAlgo(sel.value); } }), byG = {}, order = [];
    list.forEach(function (x) { var gname = x.src === "ai" ? "AI 写的" : x.src === "mine" ? "我的算法" : x.src === "py" ? "Python（本机引擎）" : GROUP_NAMES[x.group] || "其他"; if (!byG[gname]) { byG[gname] = []; order.push(gname); } byG[gname].push(x); });
    order.forEach(function (gname) { sel.appendChild(h("optgroup", { label: gname }, byG[gname].map(function (x) { return h("option", { value: x.id, text: x.name, selected: a && x.id === a.id }); }))); });
    host.appendChild(sel);
    if (!a) return;
    if (a.summary) host.appendChild(h("p", { class: "ml-blurb", text: a.summary }));
    var vals = A.algoParams();
    A.fields(host, a.params, vals, function () { A.persist(); A.emit("algo"); }, "ap");
    var runBtn = h("button", { class: "btn primary", type: "button", id: "btnRun", text: A.busy() ? "重新运行" : "运行", title: "⌘/Ctrl + Enter", onclick: function () { A.run(); } });
    var stopBtn = h("button", { class: "btn", type: "button", id: "btnStop", text: "停止", hidden: !A.busy(), onclick: function () { A.stop(); } });
    host.appendChild(h("div", { class: "ml-run" }, runBtn, h("span", { class: "row tight" }, stopBtn, h("button", { class: "btn", type: "button", id: "btnCode", text: "代码与说明", onclick: function () { A.openCode(); } }))));
    host.appendChild(h("div", { class: "ml-status", id: "runStatus", role: "status" }, A.statusText || ""));
  };
  A.renderSet = function () {
    var host = clear($("blkSet")), d = A.ds();
    host.appendChild(h("h2", null, "设置", h("small", { text: "所有算法共用" }), h("span", { class: "sp" }), helpBtn("eval:split", "划分与评价")));
    var spec = [{ key: "budget", label: "时间预算（秒）", def: 20, min: 3, max: 180, step: 1, type: "int", desc: "fit 里用 ctx.timeLeft() 读剩下多少毫秒。神经网络一般训练到时间用完为止。" }];
    if (d && d.family !== "toy" && !(d.split && d.split.by === "custom")) spec.push({ key: "train", label: "训练集比例", def: 0.6, min: 0.2, max: 0.85, step: 0.05, type: "num" }, { key: "valid", label: "验证集比例", def: 0.2, min: 0.05, max: 0.4, step: 0.05, type: "num", desc: "剩下的是测试集：算法看不到它，只在最后看一次。" });
    if (d && d.kind === "forecast" && !(d.params || []).some(function (q) { return q.key === "horizon"; })) spec.push({ key: "horizon", label: "预测步长 H", def: 1, min: 1, max: 30, step: 1, type: "int", desc: "每个时刻往后预测几步。" });
    var vals = { budget: S.budget, train: S.split.train, valid: S.split.valid, horizon: S.horizon };
    A.fields(host, spec, vals, function () {
      S.budget = vals.budget; S.horizon = vals.horizon;
      var tr = vals.train, va = vals.valid; if (tr + va > 0.95) va = Math.max(0.05, 0.95 - tr); S.split = { train: tr, valid: va };
      A.persist(); A.renderSet(); A.dataChanged(true);
    }, "set");
  };
  A.renderLeft = function () { A.renderTask(); A.renderData(); A.renderAlgo(); A.renderSet(); };

  /* ---------- 后台线程：数据预览与运行 ---------- */
  var run = null;      // 正在跑的：{ job, t0, def, algo, points, snap, phase }
  var prevJob = null;
  A.busy = function () { return !!run; };
  A.last = null;       // 最近一次的结果：{ res, def, algo, params, dsParams, seed, key, runId, t }
  A.preview = null;    // 当前数据的预览（ml-data 任务的输出）
  function dsSpec() {
    var d = A.ds(), st = dsState();
    if (d && d.id === "csv" && A.csv) return { id: "csv", params: {}, seed: A.dsSeed(), inline: A.csv.data, inlineDef: { id: "csv", family: A.csv.def.family, kind: A.csv.def.kind, name: A.csv.def.name, params: [], plot: A.csv.def.plot, split: A.csv.def.split || null } };
    return { id: d.id, params: A.dsParams(), seed: A.dsSeed() };
  }
  A.dsSpec = dsSpec;
  function runOpts() { var d = A.ds(); return { budgetMs: S.budget * 1000, split: S.split, horizon: d && d.kind === "forecast" ? S.horizon : undefined, importance: true }; }
  A.runOpts = runOpts;
  /** 数据变了：重新生成预览；当前结果标成"过期" */
  A.dataChanged = function (soft) {
    A.renderAlgo();
    if (prevJob) prevJob.cancel();
    var spec = dsSpec(), mine = prevJob = QLMLRunner.run({ kind: "ml-data", data: { dataset: spec, opts: runOpts() }, mine: true, budgetMs: 15000 });
    mine.promise.then(function (out) { if (prevJob !== mine) return; prevJob = null; A.preview = out.preview; A.emit("preview"); A.renderViews(); },
      function (e) { if (prevJob !== mine || e.cancelled) return; prevJob = null; A.preview = null; A.dataErr = e.message; A.renderViews(); });
    A.renderSummary(); A.renderViews();
    if (!soft) A.emit("data");
  };
  A.stale = function () { var L = A.last; if (!L) return true; return L.key !== A.expKey() || L.algoKey !== algoKey(); };
  function algoKey() { var a = A.algo(); return a ? a.id + "|" + JSON.stringify(A.algoParams()) + "|" + hashStr(a.code || "") : ""; }
  function hashStr(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
  A.hashStr = hashStr;
  /** 一次"实验"= 同一个数据集、同样的参数和种子、同样的划分：排行榜按实验分 */
  A.expKey = function () { var d = A.ds(); if (!d) return ""; var sp = dsSpec(); return d.id + "|" + (d.id === "csv" ? A.csv.hash : JSON.stringify(sp.params)) + "|" + sp.seed + "|" + (d.family === "toy" ? "" : S.split.train + "/" + S.split.valid) + (d.kind === "forecast" ? "|H" + S.horizon : ""); };
  A.setStatus = function (text, bad) { A.statusText = text; var el = $("runStatus"); if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); } };

  /** 运行当前的算法。返回 Promise：兑现为结果（AI 的"自动改进"用它等结果） */
  A.run = function (opt) {
    opt = opt || {};
    var d = A.ds(), a = opt.algo || A.algo(); if (!d || !a) return Promise.reject(new Error("没有可运行的算法"));
    if (run) A.stop(true);
    var params = opt.params || A.algoParams();
    if (a.lang === "py") return A.runEngine ? A.runEngine(a, params, opt) : Promise.reject(new Error("没有连上本机引擎"));
    var bad = QLMLRunner.syntax(a.code || ""); if (bad) { A.setStatus("代码有语法错误：" + bad, true); toast("代码有语法错误，先改一改：" + bad, 4000); if (!opt.quiet && A.openCode && a.src !== "builtin") A.openCode(); return Promise.reject(new Error("语法错误：" + bad)); }
    var spec = dsSpec(), opts = runOpts(), key = A.expKey(), aKey = algoKey();
    var job = QLMLRunner.run({ kind: "ml-run", data: { dataset: spec, algo: { api: A.apiOf(d), params: params, code: a.code, seed: 0 }, opts: opts }, code: a.code, mine: true, budgetMs: opts.budgetMs, onProgress: onProg });
    run = { job: job, t0: Date.now(), def: d, algo: a, points: [], snap: null, phase: "data", msg: "生成数据…" };
    A.setStatus("运行中…"); A.renderAlgo(); A.renderSummary(); A.emit("runstart");
    var me = run;
    return job.promise.then(function (res) {
      if (run !== me) return res;
      run = null;
      A.last = { res: res, def: d, algo: a, params: params, dsSpec: spec, key: key, algoKey: aKey, t: Date.now(), revealed: false };
      if (A.record) A.last.runId = A.record(A.last);
      A.setStatus("完成：用时 " + secs(res.ms) + (res.fitMs != null ? "（训练 " + secs(res.fitMs) + "）" : ""));
      A.renderAlgo(); A.renderSummary(); A.renderViews(); A.emit("run", A.last);
      return res;
    }, function (e) {
      if (run !== me) throw e;
      run = null;
      var msg = e.cancelled ? "已停止。" : "出错了：" + e.message + (e.line ? "（代码第 " + e.line + " 行）" : "");
      A.setStatus(msg, !e.cancelled); A.lastError = e.cancelled ? null : { message: e.message, line: e.line || 0, algo: a };
      A.renderAlgo(); A.renderSummary(); A.emit("runerror", e);
      throw e;
    });
  };
  A.stop = function (silent) { if (!run) return; var r = run; run = null; try { r.job.cancel(); } catch (e) {} if (!silent) { A.setStatus("已停止。"); A.renderAlgo(); A.renderSummary(); } };
  function secs(ms) { return ms == null ? "—" : ms < 1000 ? Math.round(ms) + " 毫秒" : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + " 秒"; }
  A.secs = secs;
  var liveT = 0;
  function onProg(m) {
    if (!run) return;
    if (m.phase) run.phase = m.phase; if (m.msg) run.msg = m.msg;
    if (m.point) run.points.push(m.point);
    if (m.snap) run.snap = m.snap;
    var now = Date.now(); if (now - liveT > 200) { liveT = now; A.renderLive(); }
  }
  A.running = function () { return run; };
  /** 外部（本机引擎）也能用同一套"正在运行"的显示 */
  A.beginExternal = function (job, d, a) { if (run) A.stop(true); run = { job: job, t0: Date.now(), def: d, algo: a, points: [], snap: null, phase: "data", msg: "发送到本机引擎…" }; A.setStatus("运行中（本机引擎）…"); A.renderAlgo(); A.renderSummary(); return run; };
  A.progress = onProg;
  A.endExternal = function (me, res, params, spec, key, aKey) {
    if (run !== me) return false; run = null;
    A.last = { res: res, def: me.def, algo: me.algo, params: params, dsSpec: spec, key: key, algoKey: aKey, t: Date.now(), revealed: false };
    if (A.record) A.last.runId = A.record(A.last);
    A.setStatus("完成：用时 " + secs(res.ms)); A.renderAlgo(); A.renderSummary(); A.renderViews(); A.emit("run", A.last); return true;
  };
  A.failExternal = function (me, e) { if (run !== me) return; run = null; A.setStatus(e.cancelled ? "已停止。" : "出错了：" + e.message + (e.line ? "（代码第 " + e.line + " 行）" : ""), !e.cancelled); A.lastError = e.cancelled ? null : { message: e.message, line: e.line || 0, algo: me.algo }; A.renderAlgo(); A.renderSummary(); A.emit("runerror", e); };
  A.algoKey = algoKey;

  /* ---------- 摘要 ---------- */
  var MET = {
    acc: { name: "准确率", fmt: function (v) { return P(v, 1); }, hb: true }, logloss: { name: "对数损失", fmt: function (v) { return F(v, 3); } }, brier: { name: "Brier", fmt: function (v) { return F(v, 3); } }, f1: { name: "宏平均 F1", fmt: function (v) { return F(v, 3); }, hb: true }, auc: { name: "AUC", fmt: function (v) { return F(v, 3); }, hb: true },
    mse: { name: "均方误差 MSE", fmt: G }, rmse: { name: "RMSE", fmt: G }, mae: { name: "MAE", fmt: G }, r2: { name: "R²", fmt: function (v) { return F(v, 3); }, hb: true }, mase: { name: "MASE", fmt: function (v) { return F(v, 3); } }, dirAcc: { name: "方向准确率", fmt: function (v) { return P(v, 1); }, hb: true }
  };
  A.MET = MET;
  A.metName = function (k) { return MET[k] ? MET[k].name : k; };
  A.metFmt = function (k, v) { return v == null || !(v === v) ? "—" : (MET[k] ? MET[k].fmt : G)(v); };
  /** 主指标的标准误：分类用正确率的二项标准误；回归 / 预测用逐样本平方误差的标准误 */
  A.primarySE = function (res, which) {
    if (res.kind === "classification") { var a = res.metrics[which].acc, n = res.correct[which].length; return Math.sqrt(Math.max(0, a * (1 - a)) / n); }
    var L = res.loss[which], n2 = L.length, m = 0, v = 0, i; for (i = 0; i < n2; i++) m += L[i]; m /= n2; for (i = 0; i < n2; i++) v += (L[i] - m) * (L[i] - m); return Math.sqrt(v / Math.max(1, n2 - 1) / n2);
  };
  function tile(k, v, s, cls) { return h("div", { class: "ml-tile" + (cls ? " " + cls : "") }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), s ? h("div", { class: "s" }, s) : null); }
  A.renderSummary = function () {
    var host = clear($("summary")), d = A.ds();
    var head = h("div", { class: "sum-head" }, h("h2", { text: "结果" }), h("span", { class: "meta", id: "sumMeta" }), h("span", { class: "sp" }));
    host.appendChild(head);
    if (!run) drop();
    if (run) {
      $("sumMeta").textContent = run.algo.name + " · " + run.def.name;
      var el = Math.round((Date.now() - run.t0) / 1000), budget = S.budget;
      head.appendChild(h("span", { class: "note", id: "liveClock", text: (run.msg || "") + " · " + el + " 秒" }));
      head.appendChild(h("button", { class: "btn small", type: "button", text: "停止", onclick: function () { A.stop(); } }));
      host.appendChild(h("div", { class: "ml-prog" }, h("i", { id: "liveBar", style: { width: Math.min(100, el / budget * 100) + "%" } })));
      host.appendChild(h("div", { class: "ml-live", id: "liveBox" }));
      A.renderLive();
      return;
    }
    var L = A.last;
    if (!L) {
      $("sumMeta").textContent = d ? d.name : "";
      host.appendChild(h("div", { class: "ml-empty" }, h("b", { text: "还没有运行。" }), " 左栏选好任务、数据和算法以后点“运行”（或按 ⌘/Ctrl + Enter）。算法在后台线程里训练，算完以后这里显示训练集和验证集上的成绩；测试集的成绩先遮住，确定不再改了再揭晓。",
        A.lastError ? h("div", { class: "warn err", style: { "margin-top": "10px" } }, h("span", { text: "上一次运行出错：" + A.lastError.message + (A.lastError.line ? "（第 " + A.lastError.line + " 行）" : "") }), A.aiFix ? h("button", { class: "btn small", type: "button", text: "让 AI 修", onclick: function () { A.aiFix(A.lastError); } }) : null) : null));
      return;
    }
    var res = L.res, pk = res.primary, mfmt = function (v) { return A.metFmt(pk, v); }, stale = A.stale();
    $("sumMeta").textContent = L.algo.name + " · " + L.def.name + (stale ? " · 设定已经改了，这是上一次的结果" : "");
    var seV = A.primarySE(res, "valid"), tiles = h("div", { class: "ml-tiles" });
    tiles.appendChild(tile(A.metName(pk) + " · 训练", mfmt(res.metrics.train[pk]), gapNote(res)));
    tiles.appendChild(tile(A.metName(pk) + " · 验证", mfmt(res.metrics.valid[pk]), "± " + mfmt(seV) + "（1 个标准误）"));
    var revealed = L.revealed || (A.isRevealed && A.isRevealed(L));
    if (revealed) tiles.appendChild(tile(A.metName(pk) + " · 测试", mfmt(res.metrics.test[pk]), "± " + mfmt(A.primarySE(res, "test")), "test"));
    else tiles.appendChild(tile(A.metName(pk) + " · 测试", h("button", { class: "btn small ml-lock", type: "button", id: "btnReveal", text: "🔒 揭晓", title: "测试集只该在最后看一次：看过之后再改算法，测试集的成绩就不再是\"没见过的数据\"了", onclick: function () { A.reveal(L); } }), A.looksText ? A.looksText() : "", "test"));
    tiles.appendChild(tile("基线 · 验证", mfmt(res.baseline.metrics.valid[pk]), res.baseline.name));
    if (res.oracle && res.oracle.metrics) tiles.appendChild(tile("理论最优 · 验证", mfmt(res.oracle.metrics.valid[pk]), "知道真实规律时的成绩"));
    else if (res.bayes && res.bayes.value != null) { var bt = tile("理论上限", A.metFmt(res.bayes.metric || pk, res.bayes.value), "贝叶斯最优（知道真实分布）"); if (res.bayes.note) bt.title = String(res.bayes.note); tiles.appendChild(bt); }
    host.appendChild(tiles);
    // 其他指标、用时、参数量
    var st = h("div", { class: "statline" }), mv = res.metrics.valid;
    Object.keys(mv).forEach(function (k) { if (k === pk || mv[k] == null || !(mv[k] === mv[k]) || k === "n") return; st.appendChild(h("span", null, A.metName(k) + " ", h("b", { text: A.metFmt(k, mv[k]) }))); });
    st.appendChild(h("span", null, "训练用时 ", h("b", { text: secs(res.fitMs) })));
    if (res.predUs != null) st.appendChild(h("span", null, "每个样本预测 ", h("b", { text: res.predUs < 1000 ? F(res.predUs, 1) + " 微秒" : secs(res.predUs / 1000) })));
    if (res.size != null) st.appendChild(h("span", null, "参数 ", h("b", { text: res.size.toLocaleString("en-US") })));
    st.appendChild(h("span", null, "样本 ", h("b", { text: res.split.nTrain + " / " + res.split.nValid + " / " + res.split.nTest })));
    if (res.engine === "py") st.appendChild(h("span", { class: "tag", text: "本机引擎 · Python" }));
    host.appendChild(st);
    verdicts(res).forEach(function (w) { host.appendChild(h("div", { class: "warn" + (w.err ? " err" : "") }, h("span", { text: w.text }))); });
    var acts = h("div", { class: "statline" }, h("span", { class: "sp", style: { flex: "1" } }),
      A.aiDiagnose ? h("button", { class: "btn small primary", type: "button", id: "btnDiag", text: "让 AI 诊断", onclick: function () { A.aiDiagnose(); } }) : null,
      A.aiImprove ? h("button", { class: "btn small", type: "button", text: "让 AI 改进", onclick: function () { A.aiImprove(); } }) : null);
    host.appendChild(acts);
  };
  function gapNote(res) {
    var pk = res.primary, tr = res.metrics.train[pk], va = res.metrics.valid[pk];
    if (!(tr === tr) || !(va === va)) return "";
    if (res.kind === "classification") return tr - va > 0.02 ? "比验证集高 " + P(tr - va, 1) : "和验证集相近";
    return va > 0 ? "是验证集的 " + F(tr / va, 2) + " 倍" : "";
  }
  /** 几条自动的判断：比基线好没好、过拟合了没有、离理论最优多远 */
  function verdicts(res) {
    var out = [], pk = res.primary, hb = res.higherBetter, tr = res.metrics.train[pk], va = res.metrics.valid[pk], b = res.baseline.metrics.valid[pk], se = A.primarySE(res, "valid");
    var better = hb ? va - b : b - va;
    if (better < 2 * se) out.push({ text: "验证集上没有显著好过基线（" + res.baseline.name + "）：差距 " + A.metFmt(pk, Math.abs(va - b)) + "，不到 2 个标准误。" + (better < 0 ? "它还更差。" : "") });
    if (res.kind === "classification" ? tr - va > Math.max(0.05, 4 * se) : va > 0 && tr / va < 0.5) out.push({ text: "训练集比验证集好很多：多半是过拟合了。试试更强的正则化、更小的模型、早停，或者更多的数据。" });
    if (res.oracle && res.oracle.metrics) { var o = res.oracle.metrics.valid[pk], gap = hb ? o - va : va - o; if (gap <= 2 * se) out.push({ text: "已经和理论最优差不多了（差距在 2 个标准误以内）：在这个数据集上很难再好多少。" }); }
    if (res.curve && res.curve.length > 3) { var lc = res.curve[res.curve.length - 1], fc = res.curve[0]; if (lc.loss != null && fc.loss != null && !(lc.loss < fc.loss)) out.push({ text: "训练损失没有下降：学习率可能太大或太小，或者梯度没有传到参数上。", err: true }); }
    return out;
  }
  /** 运行中：进度条、实时的学习曲线、实时的决策面 */
  var liveChart = null, liveCv = null;
  function drop() { try { if (liveChart && liveChart.destroy) liveChart.destroy(); if (liveCv && liveCv.ro) liveCv.ro.disconnect(); } catch (e) {} liveChart = null; liveCv = null; }
  function thin(a, m) { var o = [], st = a.length / m; for (var i = 0; i < m; i++) o.push(a[Math.floor(i * st)]); o.push(a[a.length - 1]); return o; }
  A.on("run", drop); A.on("runerror", drop);
  A.renderLive = function () {
    var box = $("liveBox"); if (!box || !run) return;
    var clock = $("liveClock"), el = Math.round((Date.now() - run.t0) / 1000); if (clock) clock.textContent = (run.msg || (run.phase === "fit" ? "训练中" : "")) + " · " + el + " 秒";
    var bar = $("liveBar"); if (bar) bar.style.width = Math.min(100, el / S.budget * 100) + "%";
    var pts = run.points;
    if (!box.firstChild) { box.appendChild(h("div", { id: "liveCurve" })); box.appendChild(h("div", { id: "liveSnap" })); drop(); }
    if (pts.length >= 2) {
      var host = $("liveCurve"); if (liveChart && liveChart.destroy) liveChart.destroy();
      clear(host); liveChart = QLMLViz.curve(host, { curve: pts.length > 600 ? thin(pts, 600) : pts }, { log: true });
    } else if (!$("liveCurve").firstChild) $("liveCurve").appendChild(h("p", { class: "note", text: run.phase === "fit" ? "训练中……算法汇报进度（ctx.report）时这里会画出学习曲线。" : run.msg || "" }));
    var sh = $("liveSnap");
    if (run.snap && run.snap.kind === "grid2d") { if (!liveCv) { clear(sh); liveCv = QLMLViz.surface(sh, run.snap, A.preview, { caption: "第 " + G(run.snap.step) + " 步" }); } else liveCv.set(function (ctx, w, hh) { QLMLViz.drawSurface(ctx, w, hh, run.snap, A.preview && A.preview.scatter ? A.preview.scatter.pts : null, { caption: "第 " + G(run.snap.step) + " 步" }); }); }
    box.classList.toggle("one", !(run.snap && run.snap.kind === "grid2d"));
  };
  setInterval(function () { if (run) A.renderLive(); }, 1000);

  return A;
})();
