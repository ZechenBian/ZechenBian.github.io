// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 数据分析案例 · 页面：左栏是八步框架和案例目录，中栏是一个案例从头到尾的分析。
 * 每个案例（src/cases/case-*.js）是一份数据：标题、对应的面试题、数据来源、八个步骤（每步一个 body(ctx, el, U) 函数，
 * 自己往 el 里写文字、表格、图和控件）、面试官的追问，以及"交给机器学习实验室"的那份 CSV。
 * 步骤滚到眼前才渲染（有的要拟合几次回归），算过的东西存在 ctx.memo 里，换控件只重算受影响的那一块。 */
var QLCASES = (typeof QLCASES !== "undefined" && QLCASES) || [];
var QLCaseApp = (function () {
  "use strict";
  var QL = typeof QL_CORE === "function" ? QL_CORE(window) : null;
  var SKEY = "ql.cases.v1", MLKEY = "ql.ml.csv.v1";
  var STEP_NAMES = ["定义问题", "数据从哪来", "清洗与探索", "先给 baseline", "特征", "模型", "验证", "局限与迭代"];
  var STEP_HINTS = ["预测服务什么决策？目标变量、观测单位、时间尺度、评价指标。", "谁记录的、什么时候能拿到、漏掉了什么：选择偏差、删失、缺失机制、时间戳。",
    "分布、趋势、季节性、重复、异常值；异常值先问是错误还是真实的极端情况。", "最简单的做法定下及格线，复杂模型要证明比它好。",
    "按类别头脑风暴，每个特征说出背后的假设；预测时刻拿不到的就是泄漏。", "从简到繁，每一步说明理由；计数、偏态、共线各有对策。",
    "切分方式要和使用方式一致：时间序列按时间切，推广到新对象按组切。", "什么情况下会失效、怎么监控、有更多时间会做什么。"];

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var el = document.createElement(tag), k;
    attrs = attrs || {};
    for (k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") { for (var s in v) el.style.setProperty(s, v[s]); }
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function load() { try { return JSON.parse(localStorage.getItem(SKEY) || "{}") || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(SKEY, JSON.stringify(o)); } catch (e) {} }

  /* ---------- 数字格式 ---------- */
  var F = {
    /** 固定小数位；负号用 U+2212 */
    n: function (v, d) { if (!(v === v)) return "—"; if (v === Infinity) return "+∞"; var s = (+v).toFixed(d == null ? 2 : d); if (/^-0(\.0*)?$/.test(s)) s = s.slice(1); return s.replace("-", "−"); },
    /** 整数，千分位 */
    i: function (v) { if (!(v === v)) return "—"; return Math.round(v).toLocaleString("en-US").replace("-", "−"); },
    p: function (v, d) { if (!(v === v)) return "—"; return F.n(v * 100, d == null ? 1 : d) + "%"; },
    /** 有正负号的数（变化、偏差） */
    s: function (v, d) { if (!(v === v)) return "—"; return (v > 0 ? "+" : "") + F.n(v, d); },
    sp: function (v, d) { if (!(v === v)) return "—"; return (v > 0 ? "+" : "") + F.p(v, d); },
    /** 有正负号的整数，千分位 */
    si: function (v) { if (!(v === v)) return "—"; return (v > 0 ? "+" : "") + F.i(v); },
    usd: function (v) { return F.i(v) + " 美元"; },
    g: function (v) { return typeof QLChart !== "undefined" ? QLChart.fmtG(v) : String(v); }
  };

  /* ---------- 给案例用的界面积木 ---------- */
  var U = {
    h: h, clear: clear, F: F, QL: QL,
    /** 一段 Markdown（可以有 $公式$） */
    md: function (parent, src) { var el = h("div", { class: "md cs-md" }); parent.appendChild(el); if (typeof QLMD !== "undefined") QLMD.mount(el, src); else el.textContent = src; return el; },
    /** 一张图：spec 见 src/charts.js（panels、x、legend、hover）；先挂进页面再画，宽度才对 */
    chart: function (parent, spec, height, label) {
      var host = h("div", { class: "cs-chart", "data-chart": label || "" }); parent.appendChild(host);
      if (typeof QLChart === "undefined") { host.textContent = "（图表库没有加载）"; return null; }
      var ch = new QLChart.Chart(host, { height: height || 230 });
      if (label) ch.cv.setAttribute("aria-label", label);
      ch.set(spec); return ch;
    },
    /** 表格：head 是列名，rows 是二维数组（单元格可以是字符串、数或 { v, cls }）；num：哪些列右对齐等宽 */
    table: function (parent, head, rows, opt) {
      opt = opt || {};
      var num = opt.num || [], t = h("table", { class: "cs-table" + (opt.cls ? " " + opt.cls : "") });
      if (opt.caption) t.appendChild(h("caption", { text: opt.caption }));
      var tr = h("tr"); head.forEach(function (c, j) { tr.appendChild(h("th", { class: num.indexOf(j) >= 0 ? "num" : null, text: c })); }); t.appendChild(h("thead", null, tr));
      var tb = h("tbody");
      rows.forEach(function (r) {
        var row = h("tr", r.cls ? { class: r.cls } : null), cells = r.cells || r;
        cells.forEach(function (c, j) {
          var o = c != null && typeof c === "object" && !(c instanceof Node) ? c : { v: c };
          var td = h("td", { class: [num.indexOf(j) >= 0 ? "num" : "", o.cls || ""].join(" ").trim() || null });
          add(td, o.v == null ? "" : o.v instanceof Node ? o.v : String(o.v)); row.appendChild(td);
        });
        tb.appendChild(row);
      });
      t.appendChild(tb);
      var wrap = h("div", { class: "cs-tablewrap" }, t); parent.appendChild(wrap); return t;
    },
    /** 一排数字卡片：[{ k: 名字, v: 数, s: 小字 }] */
    tiles: function (parent, items) {
      var row = h("div", { class: "cs-tiles" });
      items.forEach(function (it) { row.appendChild(h("div", { class: "cs-tile" + (it.cls ? " " + it.cls : ""), "data-k": it.id || null }, h("div", { class: "k", text: it.k }), h("div", { class: "v num", text: it.v }), it.s ? h("div", { class: "s", text: it.s }) : null)); });
      parent.appendChild(row); return row;
    },
    /** 提示框：kind = "warn"（要小心）| "key"（要点）| "info" */
    note: function (parent, src, kind) { var el = h("div", { class: "cs-note " + (kind || "info") }); parent.appendChild(el); U.md(el, src); return el; },
    /** 控件。specs：[{ key, type: "seg" | "check" | "select" | "range", label, options: [[值, 文字]], min, max, step, fmt, def }]；
     *  值存在 state[key]（每个案例自己的 ctx.ui），变了就调 onChange */
    controls: function (parent, specs, state, onChange) {
      var box = h("div", { class: "cs-ctl" });
      specs.forEach(function (sp) {
        if (!(sp.key in state)) state[sp.key] = sp.def;
        var lab = h("span", { class: "cs-ctl-l", text: sp.label }), w;
        if (sp.type === "seg") {
          w = h("div", { class: "cs-seg", role: "group", "aria-label": sp.label });
          sp.options.forEach(function (o) {
            var b = h("button", { type: "button", class: "chip", "data-v": String(o[0]), "aria-pressed": state[sp.key] === o[0] ? "true" : "false", text: o[1],
              onclick: function () { state[sp.key] = o[0]; Array.prototype.forEach.call(w.children, function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); }); onChange(sp.key); } });
            w.appendChild(b);
          });
          box.appendChild(h("div", { class: "cs-ctl-row" }, lab, w));
        } else if (sp.type === "check") {
          var cb = h("input", { type: "checkbox", "data-k": sp.key, onchange: function () { state[sp.key] = cb.checked; onChange(sp.key); } }); cb.checked = !!state[sp.key];
          box.appendChild(h("label", { class: "cs-ctl-row cs-check" }, cb, h("span", { text: sp.label })));
        } else if (sp.type === "select") {
          var sel = h("select", { "aria-label": sp.label, "data-k": sp.key, onchange: function () { var v = sel.value; sp.options.forEach(function (o) { if (String(o[0]) === v) state[sp.key] = o[0]; }); onChange(sp.key); } });
          sp.options.forEach(function (o) { sel.appendChild(h("option", { value: String(o[0]), text: o[1], selected: state[sp.key] === o[0] })); });
          box.appendChild(h("div", { class: "cs-ctl-row" }, lab, sel));
        } else if (sp.type === "range") {
          var out = h("b", { class: "num", text: (sp.fmt || String)(state[sp.key]) });
          var rg = h("input", { type: "range", min: sp.min, max: sp.max, step: sp.step || 1, value: state[sp.key], "aria-label": sp.label, "data-k": sp.key });
          rg.addEventListener("input", function () { out.textContent = (sp.fmt || String)(+rg.value); });
          rg.addEventListener("change", function () { state[sp.key] = +rg.value; onChange(sp.key); });
          box.appendChild(h("div", { class: "cs-ctl-row cs-range" }, lab, out, rg));
        }
      });
      parent.appendChild(box); return box;
    },
    /** 先放一句"正在计算…"，让页面先画出来，再在下一拍里算（拟合要几百毫秒的那些） */
    later: function (parent, fn) {
      var box = h("div", { class: "cs-later" }, h("p", { class: "note cs-busy", text: "正在计算…" })); parent.appendChild(box);
      setTimeout(function () {
        clear(box);
        try { fn(box); } catch (e) { box.appendChild(h("div", { class: "cs-note warn" }, h("p", { text: "这一块没有算出来：" + (e && e.message || e) }))); if (window.console) console.error(e); }
        box.setAttribute("data-done", "1");
      }, 16);
      return box;
    },
    /** 一个可以点开的"推导 / 细节"块 */
    more: function (parent, title, src) { var d = h("details", { class: "cs-more" }, h("summary", { text: title })); parent.appendChild(d); U.md(d, src); return d; },
    /** 新的随机数发生器（同样的种子得到同样的结果） */
    rng: function (seed, stream) { return QL ? new QL.RNG(seed, stream || 0, 0) : null; }
  };

  /* ---------- 状态 ---------- */
  var S = load(), ctxs = {}, cur = null, observer = null;
  function caseById(id) { for (var i = 0; i < QLCASES.length; i++) if (QLCASES[i].id === id) return QLCASES[i]; return null; }
  function ctxOf(c) {
    if (ctxs[c.id]) return ctxs[c.id];
    var ctx = { ui: {}, cache: {}, U: U, F: F };
    ctx.memo = function (key, fn) { if (!(key in ctx.cache)) ctx.cache[key] = fn(); return ctx.cache[key]; };
    /** 设定变了：清掉算过的东西，整个案例重画，停在 anchor 那一步 */
    ctx.refresh = function (anchor) { ctx.cache = {}; if (cur && cur.id === c.id) { renderCase(c); var t = anchor && $(anchor); if (t) { ensure(t); t.scrollIntoView({ block: "start" }); } } };
    if (c.prep) c.prep(ctx);
    ctxs[c.id] = ctx; return ctx;
  }

  /* ---------- 左栏 ---------- */
  function renderNav() {
    var nav = clear($("caseNav"));
    nav.appendChild(h("h2", { text: "案例" }));
    QLCASES.forEach(function (c) {
      var b = h("button", { type: "button", class: "cs-navitem", "data-case": c.id, "aria-current": cur && cur.id === c.id ? "true" : "false", onclick: function () { go(c.id); setTab("main"); } },
        h("span", { class: "t" }, c.title, badge(c.tag)), h("span", { class: "q", text: c.short }));
      nav.appendChild(b);
    });
    var fw = clear($("frameNav"));
    fw.appendChild(h("h2", { text: "八步框架" }));
    var ol = h("ol", { class: "cs-frame" });
    STEP_NAMES.forEach(function (n, i) { ol.appendChild(h("li", null, h("b", { text: n }), h("span", { text: STEP_HINTS[i] }))); });
    fw.appendChild(ol);
    fw.appendChild(h("p", { class: "note", text: "每个案例都按这八步走一遍。数字都是打开页面时在你的浏览器里现算的；改控件会重算。" }));
  }
  function badge(tag) { return h("span", { class: "cs-badge " + (tag === "sim" ? "sim" : "real"), text: tag === "sim" ? "模拟数据" : "真实数据" }); }

  /* ---------- 中栏 ---------- */
  function go(id, noScroll) {
    var c = caseById(id) || QLCASES[0]; if (!c) return;
    cur = c; S.last = c.id; save(S);
    if ((location.hash || "").split("-")[0] !== "#" + c.id) { try { history.replaceState(null, "", "#" + c.id); } catch (e) { location.hash = c.id; } }
    renderNav(); renderCase(c);
    if (!noScroll) $("paneMain").scrollTop = 0;
    document.title = c.title + " · 数据分析案例";
  }
  function renderCase(c) {
    var main = clear($("caseMain")), ctx = ctxOf(c);
    if (observer) { observer.disconnect(); observer = null; }
    var head = h("header", { class: "cs-head" },
      h("div", { class: "cs-kicker" }, badge(c.tag), h("span", { text: c.kicker || "" })),
      h("h2", { class: "cs-title", text: c.title }));
    main.appendChild(head);
    if (c.interview) { var iv = h("div", { class: "cs-interview" }, h("div", { class: "cs-interview-l", text: "对应的面试题" })); U.md(iv, c.interview); main.appendChild(iv); }
    if (c.intro) U.md(main, c.intro);
    // 步骤目录
    var strip = h("nav", { class: "cs-strip", "aria-label": "这个案例的八步" });
    c.steps.forEach(function (st, i) {
      strip.appendChild(h("a", { href: "#" + c.id + "-" + (i + 1), class: "chip", "data-step": i + 1, onclick: function (e) { e.preventDefault(); var t = $(c.id + "-" + (i + 1)); if (t) { ensure(t); t.scrollIntoView({ block: "start", behavior: "smooth" }); } } },
        h("span", { class: "n", text: String(i + 1) }), STEP_NAMES[st.kind - 1]));
    });
    main.appendChild(strip);
    c.steps.forEach(function (st, i) {
      var sec = h("section", { class: "cs-step", id: c.id + "-" + (i + 1), "data-kind": st.kind },
        h("h3", { class: "cs-step-h" }, h("span", { class: "n", text: String(i + 1) }), h("span", { class: "k", text: STEP_NAMES[st.kind - 1] }), h("span", { class: "t", text: st.title })),
        h("div", { class: "cs-step-b", "data-pending": "1" }, h("p", { class: "note", text: "滚到这里时再算…" })));
      sec._step = st; sec._ctx = ctx;
      main.appendChild(sec);
    });
    // 追问、交接、来源
    if (c.followups && c.followups.length) {
      var fu = h("section", { class: "cs-step cs-follow", id: c.id + "-followups" }, h("h3", { class: "cs-step-h" }, h("span", { class: "k", text: "面试官会追问" })));
      c.followups.forEach(function (f) { var d = h("details", { class: "cs-more" }, h("summary", { text: f.q })); U.md(d, f.a); fu.appendChild(d); });
      main.appendChild(fu);
    }
    var tail = h("section", { class: "cs-step cs-tail", id: c.id + "-data" }, h("h3", { class: "cs-step-h" }, h("span", { class: "k", text: "数据与延伸" })));
    if (c.source) U.md(tail, c.source);
    if (c.handoff) {
      var row = h("div", { class: "row cs-handoff" },
        h("button", { type: "button", class: "btn primary", id: "btnHandoff", text: "在机器学习实验室里继续", onclick: function () { handoff(c, ctx); } }),
        h("button", { type: "button", class: "btn", id: "btnCsv", text: "下载这份 CSV", onclick: function () { downloadCsv(c, ctx); } }));
      tail.appendChild(row);
      tail.appendChild(h("p", { class: "note", text: "“在机器学习实验室里继续”把案例整理好的这张表交给机器学习实验室（同一个网站，数据只存在这台电脑的浏览器里），那边可以换各种算法、看学习曲线和排行榜。" }));
    }
    main.appendChild(tail);
    // 滚到眼前才渲染
    var secs = main.querySelectorAll(".cs-step[data-kind]");
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) ensure(e.target); }); }, { root: $("paneMain"), rootMargin: "600px 0px" });
      Array.prototype.forEach.call(secs, function (s) { observer.observe(s); });
    } else Array.prototype.forEach.call(secs, ensure);
  }
  function ensure(sec) {
    var body = sec.querySelector(".cs-step-b[data-pending]"); if (!body) return;
    body.removeAttribute("data-pending"); clear(body);
    try { sec._step.body(sec._ctx, body, U); }
    catch (e) { body.appendChild(h("div", { class: "cs-note warn" }, h("p", { text: "这一步没有渲染出来：" + (e && e.message || e) }))); if (window.console) console.error(e); }
    if (observer) observer.unobserve(sec);
  }
  /** 把当前案例的所有步骤都渲染出来（打印、测试用） */
  function renderAll() { Array.prototype.forEach.call(document.querySelectorAll(".cs-step[data-kind]"), ensure); }

  /* ---------- 交给机器学习实验室 ---------- */
  function csvText(rows) {
    return rows.map(function (r) { return r.map(function (v) { var s = v == null || (typeof v === "number" && !(v === v)) ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); }).join("\n") + "\n";
  }
  function handoffRecord(c, ctx) {
    var o = c.handoff(ctx), text = csvText([o.header].concat(o.rows));
    return { v: 2, target: o.target, kind: o.kind, features: o.features || null, time: o.time || null, name: o.name, summary: o.summary, docs: o.docs, web: null, text: text };
  }
  function handoff(c, ctx) {
    var rec = handoffRecord(c, ctx);
    try { localStorage.setItem(MLKEY, JSON.stringify(rec)); }
    catch (e) { alert("浏览器的本地存储放不下这张表（" + Math.round(rec.text.length / 1024) + " KB），可以先“下载这份 CSV”，再在机器学习实验室里导入。"); return; }
    location.href = (location.protocol === "file:" ? "../ml/index.html" : "../ml/") + "#csv";
  }
  function downloadCsv(c, ctx) {
    var rec = handoffRecord(c, ctx), blob = new Blob([rec.text], { type: "text/csv;charset=utf-8" }), a = h("a", { href: URL.createObjectURL(blob), download: c.id + ".csv" });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- 手机上的两个标签 ---------- */
  function setTab(t) {
    $("app").dataset.tab = t;
    Array.prototype.forEach.call($("tabs").children, function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); });
  }

  /** 地址：#ames 是一个案例，#ames-6 是它的第 6 步 */
  function route(first) {
    var m = /^#([a-z]+)(?:-(\d+))?$/.exec(location.hash || ""), id = m && caseById(m[1]) ? m[1] : null;
    if (!id && !first) return;
    if (!id) id = S.last && caseById(S.last) ? S.last : (QLCASES[0] && QLCASES[0].id);
    if (!cur || cur.id !== id) go(id, true);
    if (m && m[2]) setTimeout(function () { var t = $(cur.id + "-" + m[2]); if (t) { ensure(t); t.scrollIntoView({ block: "start" }); } }, 50);
  }
  function boot() {
    Array.prototype.forEach.call($("tabs").children, function (b) { b.addEventListener("click", function () { setTab(b.dataset.tab); }); });
    route(true);
    window.addEventListener("hashchange", function () { route(false); });
  }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot(); }
  return { U: U, F: F, go: go, renderAll: renderAll, handoffRecord: handoffRecord, csvText: csvText, cases: function () { return QLCASES; }, ctxOf: ctxOf };
})();
