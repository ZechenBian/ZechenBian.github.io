// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 框选提问（样本，目前只用在 cases-ask/）：在页面上任意位置选中文字或拖一个框，就地提问；回答以"批注"的形式插在被问的地方，
 * 回答里面还能再选、再框、再问，一层套一层。
 *
 *   · 框选：按住 Alt（Mac 上是 Option）拖动；从空白处、图表或公式上直接拖；或者打开顶栏的"框选"（快捷键 B）。
 *     框里的东西整理成文字交给 AI：文字原样，公式取 TeX 原文，表格取框到的行（带表头），canvas 图表取框内的数据点（用图表自己的悬停说明）。
 *   · 批注挂在"块"上（一段文字、一张图、一张表……）。页面换控件会整篇重画，所以块的身份不能靠 DOM 节点：
 *     由页面适配层（src/ask/cases.js）给每个块一个稳定的 id（所在的步骤 + 块的种类 + 内容的哈希），每次页面变化后重新挂回去。
 *     找不到原来的块就放到那一步的末尾，标"原文已变"；块还在但数字变了（图表数据、表格数值），标"数字已变"。
 *   · 谁来回答：在 Claude 里打开页面时用 window.claude.use("sample")（打开页面的人自己的额度）；独立网页里用 src/ai.js 的 QLAI
 *     （使用者自己的密钥，和策略实验室共用同一份设置）。
 *   · 存储：只在这台电脑的浏览器里（localStorage），换设备看不到。
 * 适配层要提供的东西见 init(adapter) 的说明。 */
var QLAsk = (function () {
  "use strict";
  var A = null, root = null, R = {}, mo = null, syncT = 0, engine = { kind: null, fn: null, ready: false, off: "" };
  var MODEKEY = "ql.ask.mode.v1", LEVKEY = "ql.ask.levels.v1", DEPTHKEY = "ql.ask.depth.v1";
  var mode = "folded", maxLevel = 0, composer = null, boxing = false, swallowClick = false;

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function $$(sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); }
  function h(tag, attrs) {
    var el = document.createElement(tag), k;
    attrs = attrs || {};
    for (k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
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
  function hash(s) { var x = 0x811c9dc5; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36); }
  function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  var toastT = 0;
  function toast(msg) { var t = $("askToast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 5200); }
  function isShown(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    for (var d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) {
      if (!d.open) { var s = d.querySelector(":scope > summary"); if (!(s && s.contains(el))) return false; }
    }
    return true;
  }
  function scrollParent(el) {
    for (var e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      var oy = getComputedStyle(e).overflowY; if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight + 1) return e;
    }
    return document.scrollingElement || document.documentElement;
  }

  /* ---------- 页面上的文字（公式保留 TeX、控件写成当前取值、图表写成数据） ---------- */
  function ctlText(box) {
    return $$(".cs-ctl-row", box).map(function (row) {
      var lab = row.querySelector(".cs-ctl-l"), name = lab ? lab.textContent : "", v = "";
      var seg = row.querySelector(".cs-seg"); if (seg) { var on = seg.querySelector('[aria-pressed="true"]'); v = on ? on.textContent : ""; }
      var sel = row.querySelector("select"); if (sel && sel.selectedOptions && sel.selectedOptions[0]) v = sel.selectedOptions[0].textContent;
      var rg = row.querySelector('input[type="range"]'); if (rg) { var b = row.querySelector("b"); v = b ? b.textContent : rg.value; }
      var cb = row.querySelector('input[type="checkbox"]'); if (cb) { name = row.textContent.trim(); v = cb.checked ? "是" : "否"; }
      return "控件 " + norm(name) + " = " + norm(v);
    }).join("\n");
  }
  function chartOf(host) { return host && (host.__qc || (host.querySelector && host.querySelector(".qc") && host.querySelector(".qc").__qc)) || null; }
  function srcText(node, opt) {
    var out = "", full = !!(opt && opt.charts);
    function walk(n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1 && n.nodeType !== 11) return;
      if (n.nodeType === 1) {
        if (n.hasAttribute("data-tex")) { var d = n.getAttribute("data-display") === "1", t = n.getAttribute("data-tex"); out += d ? "\n$$" + t + "$$\n" : "$" + t + "$"; return; }
        if (n.matches(".ask-remark.mine, .ask-composer, .ask-stub, .ask-ui, button, canvas, svg, .katex, .qc-tip, .qc-msg, .qc-legend, script, style, .lv-skip")) return;
        if (n.classList.contains("cs-ctl")) { out += "\n" + ctlText(n) + "\n"; return; }
        if (n.classList.contains("cs-chart")) {
          out += "\n[图表：" + (n.getAttribute("data-chart") || "") + "]";
          var ch = chartOf(n); if (full && ch) { var d2 = describeChart(ch, null, 24); if (d2) out += "\n" + d2; }
          out += "\n"; return;
        }
        if (n.tagName === "TR") { out += "\n| " + Array.prototype.map.call(n.children, function (c) { return norm(srcText(c)); }).join(" | ") + " |"; return; }
        if (n.tagName === "SUMMARY") { out += "\n[可展开] "; Array.prototype.forEach.call(n.childNodes, walk); out += "\n"; return; }
        if (/^(P|LI|H\d|DIV|FIGCAPTION|DETAILS|BLOCKQUOTE|TABLE|UL|OL|PRE|SECTION|HEADER|NAV)$/.test(n.tagName)) out += "\n";
        if (n.tagName === "LI") out += "- ";
      }
      Array.prototype.forEach.call(n.childNodes, walk);
    }
    walk(node);
    return out.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
  }

  /* ---------- canvas 图表：框里是哪些数据（用图表自己的悬停说明） ---------- */
  function tipLine(t) {
    if (!t) return "";
    return (t.title ? t.title + "：" : "") + (t.rows || []).map(function (r) { return r.name + " " + r.value; }).join("，") + (t.note ? "（" + t.note + "）" : "");
  }
  function numOf(s) { var m = /-?\d[\d,]*\.?\d*(e-?\d+)?/i.exec(String(s).replace(/−/g, "-")); return m ? parseFloat(m[0].replace(/,/g, "")) : NaN; }
  function g4(v) { return (+v.toPrecision(4)).toString(); }
  /** 图层里能读出数据的那些：折线、阶梯、点、面积、柱子（取中点）、区间带。名字取颜色相同的图例，没有就用面板标题 */
  function layerSeries(sp) {
    var out = [], legend = sp.legend || [];
    function nameOf(l, pn, k) { for (var i = 0; i < legend.length; i++) if (legend[i].color === l.color) return legend[i].name; return l.name || (pn.y && pn.y.label) || "系列 " + (k + 1); }
    (sp.panels || []).forEach(function (pn) {
      (pn.layers || []).forEach(function (l, k) {
        if ((l.kind === "line" || l.kind === "step" || l.kind === "points" || l.kind === "area" || !l.kind) && l.x && l.y) out.push({ name: nameOf(l, pn, k), xs: l.x, ys: l.y });
        else if (l.kind === "bars" && l.x0 && l.x1 && l.y) out.push({ name: nameOf(l, pn, k), xs: l.x0.map(function (v, i) { return (v + l.x1[i]) / 2; }), ys: l.y });
        else if (l.kind === "band" && l.x && l.lo && l.hi) out.push({ name: nameOf(l, pn, k) + "（区间）", xs: l.x, lo: l.lo, hi: l.hi });
      });
    });
    return out;
  }
  /** rc：框（屏幕坐标），null 表示整张图；max：最多列出几个点 */
  function describeChart(ch, rc, max) {
    var sp = ch.spec, g = ch.geom; if (!sp || !g) return null;
    max = max || 30;
    var cr = ch.cv.getBoundingClientRect();
    var bx0 = rc ? rc.left - cr.left : -1e9, bx1 = rc ? rc.right - cr.left : 1e9, by0 = rc ? rc.top - cr.top : -1e9, by1 = rc ? rc.bottom - cr.top : 1e9;
    var out = [], i, j;
    if (g.heat) {
      var cells = [];
      for (j = 0; j < g.ny; j++) for (i = 0; i < g.nx; i++) {
        var cx = g.x0 + i * g.cw, cy = g.y0 + (g.ny - 1 - j) * g.ch;
        if (cx + g.cw > bx0 && cx < bx1 && cy + g.ch > by0 && cy < by1) cells.push([i, j]);
      }
      if (!cells.length) return null;
      var step = Math.max(1, Math.ceil(cells.length / max)), xf = sp.xfmt || g4, yf = sp.yfmt || g4, vf = sp.fmt || g4;
      out.push("热力图（" + (sp.yLabel || "纵轴") + " × " + (sp.xLabel || "横轴") + "）" + (rc ? "框内" : "") + "的格子" + (step > 1 ? "（共 " + cells.length + " 格，每 " + step + " 格取一格）" : "") + "：");
      cells.forEach(function (c, k) {
        if (k % step) return;
        var t = sp.tip ? sp.tip(c[0], c[1]) : null, v = sp.values[c[1] * g.nx + c[0]];
        out.push(t ? tipLine(t) : (sp.yLabel || "y") + " " + yf(sp.ys[c[1]]) + "，" + (sp.xLabel || "x") + " " + xf(sp.xs[c[0]]) + "：" + (v === v ? vf(v) : "无值"));
      });
      return out.join("\n");
    }
    var x0 = Math.max(bx0, g.x0), x1 = Math.min(bx1, g.x1);
    if (x1 < x0) return null;
    var xlo = g.ix(x0), xhi = g.ix(x1), xfmt = g.xfmt || g4;
    var leg = (sp.legend || []).map(function (l) { return l.name; }).join("、");
    var titles = g.panels.map(function (q) { return q.title; }).filter(Boolean).join("；");
    out.push((rc ? "框住的横轴范围：" : "横轴范围：") + xfmt(xlo) + " 到 " + xfmt(xhi) + (sp.x.label ? "（" + sp.x.label + "）" : "") + (titles ? "；纵轴：" + titles : "") + (leg ? "；图例：" + leg : ""));
    var hv = sp.hover, series = layerSeries(sp), xs = hv && hv.xs || (series[0] && series[0].xs);
    if (hv && hv.tip && xs) {
      var idx = [];
      for (i = 0; i < xs.length; i++) {
        var x = xs[i]; if (!(x >= Math.min(xlo, xhi) && x <= Math.max(xlo, xhi))) continue;
        if (rc && hv.pts) { var py = g.panels[0].sy(hv.pts[i]); if (py < by0 || py > by1) continue; }
        idx.push(i);
      }
      if (!idx.length) return out.join("\n");
      var stepI = Math.max(1, Math.ceil(idx.length / max));
      if (idx.length > 3) {   // 每个系列的最小、最大、平均
        var acc = {};
        idx.forEach(function (k) { var t = hv.tip(k); (t && t.rows || []).forEach(function (r) { var v = numOf(r.value); if (v === v) { var a = acc[r.name] || (acc[r.name] = { n: 0, s: 0, lo: Infinity, hi: -Infinity, pct: /%/.test(r.value) }); a.n++; a.s += v; if (v < a.lo) a.lo = v; if (v > a.hi) a.hi = v; } }); });
        Object.keys(acc).forEach(function (name) { var a = acc[name], u = a.pct ? "%" : ""; if (a.n >= 3) out.push(name + "：" + a.n + " 个点，最小 " + g4(a.lo) + u + "，最大 " + g4(a.hi) + u + "，平均 " + g4(a.s / a.n) + u); });
      }
      out.push((stepI > 1 ? "逐点（共 " + idx.length + " 个，每 " + stepI + " 个取一个）：" : "逐点："));
      idx.forEach(function (k, m) { if (m % stepI === 0 || m === idx.length - 1) out.push(tipLine(hv.tip(k))); });
      return out.join("\n");
    }
    series.forEach(function (S) {   // 没有悬停说明的图：直接读图层的数据
      var pts = [];
      for (var k = 0; k < S.xs.length; k++) { var xv = S.xs[k]; if (xv >= Math.min(xlo, xhi) && xv <= Math.max(xlo, xhi)) pts.push(k); }
      if (!pts.length) return;
      var st2 = Math.max(1, Math.ceil(pts.length / max));
      out.push(S.name + "（" + pts.length + " 个点" + (st2 > 1 ? "，每 " + st2 + " 个取一个" : "") + "）：" + pts.filter(function (k, m) { return m % st2 === 0 || m === pts.length - 1; }).map(function (k) {
        return xfmt(S.xs[k]) + " → " + (S.lo ? g4(S.lo[k]) + "～" + g4(S.hi[k]) : g4(S.ys[k]));
      }).join("；"));
    });
    return out.join("\n");
  }

  /* ---------- 存储 ---------- */
  var Store = {
    all: {},
    load: function () { var m = lsGet(A.storeKey, {}); this.all = m && typeof m === "object" ? m : {}; return this.all; },
    save: function (r) { this.all[r.rid] = body(r); if (!lsSet(A.storeKey, this.all)) toast("浏览器的本地存储满了，这条批注没有存下来。删掉一些旧的批注再试。"); },
    remove: function (r) { delete this.all[r.rid]; lsSet(A.storeKey, this.all); }
  };
  function body(r) {
    var d = r.doc;
    return { parent: d.parent || null, bid: d.bid || null, turn: d.turn, pos: d.pos, sid: d.sid, page: d.page || "", kind: d.kind, quote: d.quote || null, passage: d.passage || "",
      sig: d.sig || "", where: d.where || "", thread: d.thread.map(function (t) { return { role: t.role, content: t.content }; }), at: d.at, upd: d.upd };
  }
  function cleanDoc(x) {
    if (!x || typeof x !== "object" || !Array.isArray(x.thread)) return null;
    var th = x.thread.filter(function (t) { return t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string"; }).slice(0, 80)
      .map(function (t) { return { role: t.role, content: t.content.slice(0, 40000) }; });
    if (th.length < 2) return null;
    function int(v) { return typeof v === "number" && v >= 0 && Math.floor(v) === v ? v : null; }
    return { parent: x.parent ? String(x.parent) : null, bid: x.bid ? String(x.bid) : null, turn: int(x.turn), pos: int(x.pos), sid: String(x.sid || ""), page: String(x.page || ""),
      kind: ["block", "text", "box"].indexOf(x.kind) >= 0 ? x.kind : "block", quote: x.quote ? String(x.quote).slice(0, 4000) : null, passage: x.passage ? String(x.passage).slice(0, 4000) : "",
      sig: String(x.sig || ""), where: String(x.where || ""), thread: th, at: +x.at || 0, upd: +x.upd || 0 };
  }

  /* ---------- 批注树 ---------- */
  function vals() { return Object.keys(R).map(function (k) { return R[k]; }); }
  function firstQ(r) { return (r.doc.thread[0] && r.doc.thread[0].content) || (r.pending && r.pending.q) || ""; }
  function levelOf(r) { var l = 1, p = r.doc.parent && R[r.doc.parent], g = 0; while (p && g++ < 40) { l++; p = p.doc.parent && R[p.doc.parent]; } return l; }
  function lcOf(l) { return String((l - 1) % 4 + 1); }
  function kidsOf(rid) { return vals().filter(function (c) { return c.doc.parent === rid; }).sort(function (a, b) { return a.doc.at - b.doc.at; }); }
  function descendants(rid) { var out = []; (function walk(id) { kidsOf(id).forEach(function (c) { out.push(c); walk(c.rid); }); })(rid); return out; }
  function rootOf(r) { var p = r, g = 0; while (p.doc.parent && R[p.doc.parent] && g++ < 40) p = R[p.doc.parent]; return p; }
  function chainOf(r) { var c = [], p = r.doc.parent && R[r.doc.parent], g = 0; while (p && g++ < 40) { c.unshift(p); p = p.doc.parent && R[p.doc.parent]; } return c; }
  function chev() { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("class", "ask-chev"); s.setAttribute("aria-hidden", "true"); s.innerHTML = '<path d="M6 3.5l4.5 4.5L6 12.5"/>'; return s; }
  function remarkEl(r) {
    var lv = levelOf(r);
    var d = h("details", { class: "ask-remark mine", "data-rid": r.rid, "data-level": String(lv), "data-lc": lcOf(lv) },
      h("summary", null, chev(), h("span", { class: "ask-tag", text: "提问" }), lv > 1 ? h("span", { class: "ask-lvl", text: "L" + lv }) : null, h("span", { class: "ask-q" }), h("span", { class: "ask-flag" })),
      h("div", { class: "ask-rbody" }));
    d.addEventListener("toggle", function () { if (d.open) typeset(d); });
    return d;
  }
  function typeset(el) { if (window.QLMD) { try { QLMD.typeset(el); } catch (e) {} } }
  function insertAfterBlock(block, node) {
    var ref = block;
    while (ref.nextElementSibling && ref.nextElementSibling.matches(".ask-remark.mine, .ask-stub")) ref = ref.nextElementSibling;
    ref.parentNode.insertBefore(node, ref.nextSibling);
  }
  function statusText(r) { return r.busy ? "正在写…" : ""; }
  function abtn(label, fn, cls) { return h("button", { type: "button", class: "ask-ra" + (cls ? " " + cls : ""), text: label, onclick: fn }); }
  function actionsRow(r) {
    var row = h("div", { class: "ask-actions" });
    if (r.busy) row.appendChild(abtn("停止", function () { if (r.ctl) r.ctl.abort(); }));
    else {
      if (r.pending && r.error) {
        if (engine.ready) row.appendChild(abtn("重试", function () { runTurn(r, r.pending.q, r.pending.depth); }));
        row.appendChild(abtn("放弃", function () { discardPending(r); }));
      } else if (engine.ready && r.doc.thread.length) row.appendChild(abtn("追问", function () { openFollowUp(r); }));
      if (r.doc.thread.length) { row.appendChild(abtn("复制", function () { copyRemark(r); })); row.appendChild(abtn("删除", function () { confirmDelete(r, row); })); }
    }
    row.appendChild(h("span", { class: "ask-status", text: statusText(r) }));
    return row;
  }
  function anchorView(doc) {
    if (!doc.quote) return null;
    if (doc.kind === "box") return h("div", { class: "ask-box" }, h("span", { class: "ask-box-l", text: "框选" }), h("div", { class: "ask-box-t", text: doc.quote }));
    return h("blockquote", { class: "ask-quote", text: doc.quote });
  }
  function markAns(a, rid, ti) {
    Array.prototype.forEach.call(a.children, function (c, k) { c.classList.add("ask-blk", "ask-ablk"); c.setAttribute("data-ask-rid", rid); c.setAttribute("data-ask-turn", String(ti)); c.setAttribute("data-ask-pos", String(k)); });
  }
  function mountMd(el, text) { if (window.QLMD) QLMD.mount(el, text); else el.textContent = text; }
  function renderRemark(r) {
    var d = r.el, b = d.querySelector(":scope > .ask-rbody");
    d.querySelector(":scope > summary .ask-q").textContent = firstQ(r);
    clear(b); r.liveEl = null;
    var av = anchorView(r.doc); if (av) b.appendChild(av);
    var th = r.doc.thread;
    th.forEach(function (t, i) {
      if (t.role === "user") { if (i > 0) b.appendChild(h("p", { class: "ask-fu" }, h("span", { class: "ask-fu-l", text: "追问" }), t.content)); }
      else { var a = h("div", { class: "ask-ans" }); mountMd(a, t.content); markAns(a, r.rid, i); b.appendChild(a); }
    });
    if (r.pending) {
      if (th.length) b.appendChild(h("p", { class: "ask-fu" }, h("span", { class: "ask-fu-l", text: "追问" }), r.pending.q));
      if (r.busy) { r.liveEl = h("div", { class: "ask-ans live" }, h("p", { class: "ask-thinking", text: "正在想…" })); b.appendChild(r.liveEl); }
    }
    if (r.error) b.appendChild(h("p", { class: "ask-err", text: r.error }));
    b.appendChild(actionsRow(r));
    kidsOf(r.rid).forEach(function (c) { if (c.el) placeChild(c); });
  }
  function refreshActions(r) {
    if (!r.el || r.busy) return;
    var old = r.el.querySelector(":scope > .ask-rbody > .ask-actions"); if (old) old.parentNode.replaceChild(actionsRow(r), old);
  }
  function ansHost(p, c) { return p.el && p.el.querySelector('.ask-ablk[data-ask-rid="' + CSS.escape(p.rid) + '"][data-ask-turn="' + c.doc.turn + '"][data-ask-pos="' + c.doc.pos + '"]'); }
  function placeChild(c) {
    var p = R[c.doc.parent]; if (!p || !p.el) return false;
    var host = ansHost(p, c);
    if (host) { if (!(c.el.isConnected && c.el.parentNode === host.parentNode)) insertAfterBlock(host, c.el); c.el.classList.remove("orphan"); }
    else { var acts = p.el.querySelector(":scope > .ask-rbody > .ask-actions"); if (acts && c.el.nextElementSibling !== acts) acts.parentNode.insertBefore(c.el, acts); c.el.classList.add("orphan"); }
    return true;
  }
  function ensureEl(r) { if (!r.el) { r.el = remarkEl(r); if (mode === "open") r.el.open = true; renderRemark(r); } return r.el; }

  /* ---------- 挂回页面（页面每次变化之后） ---------- */
  function blockByBid(bid) { return bid ? root.querySelector('[data-ask-bid="' + CSS.escape(bid) + '"]') : null; }
  function sigOf(block) { return hash(norm(srcText(block, { charts: true }))); }
  function placeTop(r) {
    ensureEl(r);
    var block = blockByBid(r.doc.bid);
    if (block) {
      if (!(r.el.isConnected && r.anchor === block && !r.orphan)) { insertAfterBlock(block, r.el); r.anchor = block; r.orphan = false; r.el.classList.remove("orphan"); }
      var stale = !!(r.doc.sig && r.doc.sig !== sigOf(block));
      r.el.classList.toggle("stale", stale);
      return;
    }
    var sec = A.orphanHost(r.doc.sid);
    if (!sec) { if (r.el.isConnected) r.el.parentNode.removeChild(r.el); r.anchor = null; return; }
    if (!(r.el.isConnected && r.orphan && r.el.parentNode === sec.parent)) { sec.parent.insertBefore(r.el, sec.before || null); }
    r.orphan = true; r.anchor = null; r.el.classList.add("orphan"); r.el.classList.remove("stale");
  }
  function sync() {
    syncT = 0;
    if (mo) mo.disconnect();
    try {
      A.markBlocks(root);
      vals().filter(function (r) { return !r.doc.parent; }).sort(function (a, b) { return a.doc.at - b.doc.at; }).forEach(placeTop);
      vals().filter(function (r) { return r.doc.parent && !R[r.doc.parent]; }).forEach(function (r) { r.doc.parent = null; r.doc.bid = r.doc.bid || null; placeTop(r); });
      if (composer && composer.block && !composer.block.isConnected) closeComposer();
      afterChanged();
      if (pendingGo) { var pr = R[pendingGo]; if (pr && pr.el && pr.el.isConnected) { var id = pendingGo; pendingGo = null; setTimeout(function () { reveal(id); }, 30); } }
    } finally { if (mo) mo.observe(root, { childList: true, subtree: true }); }
  }
  function schedule() { if (!syncT) syncT = setTimeout(sync, 90); }

  /* ---------- 显示：折叠 / 展开 / 隐藏，层数，占位条 ---------- */
  function hideable(d) { return mode === "hidden" || (maxLevel > 0 && +d.getAttribute("data-level") > maxLevel); }
  function refreshStubs() {
    $$(".ask-remark.mine", root).forEach(function (d) { d.classList.toggle("hid", hideable(d)); });
    $$(".ask-stub", root).forEach(function (s) { s.parentNode.removeChild(s); });
    $$(".ask-remark.mine", root).forEach(function (d) {
      var prev = d.previousElementSibling; if (prev && prev.matches(".ask-remark.mine")) return;
      var run = []; for (var x = d; x && x.matches(".ask-remark.mine"); x = x.nextElementSibling) run.push(x);
      var hid = run.filter(function (e) { return e.classList.contains("hid"); }); if (!hid.length) return;
      var label = mode === "hidden" ? (hid.length === 1 ? "1 条提问" : hid.length + " 条提问") : (hid.length === 1 ? "1 条更深的提问" : hid.length + " 条更深的提问");
      var peeked = hid.every(function (e) { return e.classList.contains("peek"); });
      var stub = h("button", { type: "button", class: "ask-stub", "data-lc": hid[0].getAttribute("data-lc"), "aria-expanded": peeked ? "true" : "false", text: label });
      stub.addEventListener("click", function () { var on = !hid.every(function (e) { return e.classList.contains("peek"); }); hid.forEach(function (e) { e.classList.toggle("peek", on); if (on) e.open = true; }); stub.setAttribute("aria-expanded", on ? "true" : "false"); });
      d.parentNode.insertBefore(stub, d);
    });
  }
  function afterChanged() {
    vals().forEach(function (r) { if (r.el) { var lv = levelOf(r); r.el.setAttribute("data-level", String(lv)); r.el.setAttribute("data-lc", lcOf(lv)); } });
    $$(".ask-blk.annotated", root).forEach(function (b) { b.classList.remove("annotated"); b.removeAttribute("data-ask-dot"); });
    vals().forEach(function (r) {
      if (!r.el || !r.el.isConnected) return;
      var host = r.doc.parent ? (R[r.doc.parent] && ansHost(R[r.doc.parent], r)) : (r.orphan ? null : blockByBid(r.doc.bid));
      if (host) { host.classList.add("annotated"); var lc = r.el.getAttribute("data-lc"), cur = host.getAttribute("data-ask-dot"); if (!cur || +cur > +lc) host.setAttribute("data-ask-dot", lc); }
    });
    refreshStubs();
    var n = vals().filter(function (r) { return r.doc.thread.length || r.pending; }).length, c = $("askCount"); if (c) c.textContent = String(n);
    if ($("askDrawer") && !$("askDrawer").hidden) renderDrawer();
  }
  function setMode(m) {
    if (["folded", "open", "hidden"].indexOf(m) < 0) m = "folded";
    mode = m; lsSet(MODEKEY, m);
    $$('#askView [data-g="mode"] button').forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === m ? "true" : "false"); });
    $$(".ask-remark.mine.peek", root).forEach(function (d) { d.classList.remove("peek"); });
    if (m === "open") $$(".ask-remark.mine", root).forEach(function (d) { d.open = true; });
    if (m === "folded") $$(".ask-remark.mine", root).forEach(function (d) { var r = R[d.getAttribute("data-rid")]; if (!(r && r.busy) && !(composer && d.contains(composer.el))) d.open = false; });
    refreshStubs();
  }
  function setLevels(v) {
    if (["1", "2", "all"].indexOf(v) < 0) v = "all";
    maxLevel = v === "all" ? 0 : +v; lsSet(LEVKEY, v);
    $$('#askView [data-g="levels"] button').forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === v ? "true" : "false"); });
    $$(".ask-remark.mine.peek", root).forEach(function (d) { d.classList.remove("peek"); });
    refreshStubs();
  }
  function reveal(rid) {
    var r = R[rid]; if (!r || !r.el || !r.el.isConnected) return;
    for (var p = r.el; p; p = p.parentElement && p.parentElement.closest("details")) { if (p.tagName === "DETAILS") { p.open = true; if (p.classList.contains("hid")) p.classList.add("peek"); } }
    refreshStubs();
    r.el.scrollIntoView({ block: "start", behavior: "smooth" });
    var s = r.el.querySelector("summary"); if (s) s.focus({ preventScroll: true });
  }
  var pendingGo = null;
  function goTo(rid) {
    var r = R[rid]; if (!r) return;
    if (r.el && r.el.isConnected) { reveal(rid); return; }
    pendingGo = rid; A.navigate(rootOf(r).doc.sid); schedule();
  }

  /* ---------- 提问 ---------- */
  function contextText(r) {
    var chain = chainOf(r), first = chain.length ? chain[0] : r, parts = [A.sys, ""];
    parts.push(A.pageContext(first.doc.sid), "");
    function anchor(doc, where) {
      var o = [where, '"""', clip(doc.passage || "（没有记下原文）", 3000), '"""'];
      if (doc.quote) o.push(doc.kind === "box" ? '读者在这里框了一块，框里是：\n"""\n' + clip(doc.quote, 3500) + '\n"""' : '读者在里面选中了："' + clip(doc.quote, 1500) + '"');
      return o.join("\n");
    }
    if (!chain.length) { parts.push(anchor(r.doc, "读者标出的这一块：")); return parts.join("\n"); }
    parts.push(anchor(first.doc, "读者先在页面上标出的这一块："), "");
    chain.slice(-6).forEach(function (p, k, arr) {
      var lv = levelOf(p);
      if (k > 0 || lv > 1) parts.push(anchor(p.doc, "然后在第 " + (lv - 1) + " 层的回答里，读者标出："), "");
      parts.push("第 " + lv + " 层批注：");
      p.doc.thread.forEach(function (t) { parts.push((t.role === "user" ? "问：" : "答：") + clip(t.content, 5000)); });
      parts.push("");
    });
    parts.push(anchor(r.doc, "现在，在上面第 " + levelOf(chain[chain.length - 1]) + " 层的回答里，读者标出了这一部分："));
    return parts.join("\n");
  }
  function buildInput(r, q, depth) {
    var all = r.doc.thread.concat([{ role: "user", content: q }]), last = all[all.length - 1];
    function tag(t) { return t.content + (t === last ? (depth === "deep" ? " [详细]" : " [简短]") : ""); }
    return all.map(function (t, i) {
      if (i === 0) return { role: "user", content: contextText(r) + "\n\n问题：" + tag(t) };
      if (t.role === "user") return { role: "user", content: "追问：" + tag(t) };
      return { role: "assistant", content: t.content };
    });
  }
  var HIDE = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];
  function errText(e) {
    var code = e && e.code || "upstream_error";
    if (engine.kind === "web" && window.QLAI && QLAI.explain) { try { var ex = QLAI.explain(e); if (ex && ex.text) return ex.text; } catch (x) {} }
    switch (code) {
      case "rate_limited": return "问得太快，或者额度用完了。过一会儿再试。";
      case "session_expired": return "登录过期了。重新登录后再试。";
      case "prompt_too_large": return "要发的内容太长。框小一点、或者选一小段再问。";
      case "empty_completion": return "没有收到回答。换个问法再试。";
      case "refused": return "这个问题没有得到回答。换个问法再试。";
      case "not_granted": return "这个页面还没有被允许调用 Claude。在页面的权限设置里允许以后，刷新再试。";
      default: return "连接断了，回答没有写完。准备好了点“重试”。";
    }
  }
  function anchorOf(host) {
    var rid = host.getAttribute("data-ask-rid");
    if (rid) { var p = R[rid]; return { parent: rid, bid: null, turn: +host.getAttribute("data-ask-turn"), pos: +host.getAttribute("data-ask-pos"), sid: p ? rootOf(p).doc.sid : "" }; }
    return { parent: null, bid: host.getAttribute("data-ask-bid"), turn: null, pos: null, sid: host.getAttribute("data-ask-sid") || "" };
  }
  function newId() { return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function startAsk(host, kind, quote, q, depth) {
    var a = anchorOf(host), rid = newId(), now = Date.now();
    var doc = { parent: a.parent, bid: a.bid, turn: a.turn, pos: a.pos, sid: a.sid, page: A.pageTitle(a.sid), where: A.sectionTitle(a.sid), kind: kind, quote: quote || null,
      passage: clip(srcText(host, { charts: true }), 4000), sig: a.parent ? "" : sigOf(host), thread: [], at: now, upd: now };
    var r = { rid: rid, doc: doc, busy: false, pending: null, error: null };
    R[rid] = r; r.el = remarkEl(r);
    if (mo) mo.disconnect();
    insertAfterBlock(host, r.el); r.anchor = a.parent ? null : host; r.el.open = true;
    runTurn(r, q, depth);
    afterChanged();
    if (r.el.classList.contains("hid")) { r.el.classList.add("peek"); refreshStubs(); }
    if (mo) mo.observe(root, { childList: true, subtree: true });
  }
  function runTurn(r, q, depth) {
    r.pending = { q: q, depth: depth }; r.error = null;
    if (!engine.ready || !engine.fn) { r.error = engine.off || "还没有接入 AI。"; renderRemark(r); return; }
    r.busy = true; r.ctl = new AbortController(); renderRemark(r);
    var live = r.liveEl, raf = 0, latest = "";
    function paint() { raf = 0; if (latest && window.QLMD) QLMD.mountPartial(live, latest); else if (latest) live.textContent = latest; }
    var tier = depth === "deep" ? "complex" : "default";
    Promise.resolve().then(function () {
      return engine.fn(buildInput(r, q, depth), { onText: function (u) { latest = u && typeof u.text === "string" ? u.text : latest; if (!raf) raf = requestAnimationFrame(paint); }, signal: r.ctl.signal, modelTier: tier, cache: engine.kind === "host" ? false : undefined });
    }).then(function (res) {
      cancelAnimationFrame(raf);
      var text = res && typeof res.text === "string" && res.text ? res.text : latest;
      if (res && res.truncated) text += "\n\n*（回答被截断了。）*";
      commit(r, q, text);
    }, function (e) {
      cancelAnimationFrame(raf);
      var code = e && e.code || "upstream_error", partial = e && typeof e.text === "string" ? e.text.trim() : "";
      r.busy = false; r.ctl = null;
      if (code === "cancelled" || code === "aborted") { if (partial) commit(r, q, partial + "\n\n*（停下了。）*"); else { r.error = "回答出来之前停下了。"; renderRemark(r); } return; }
      if (HIDE.indexOf(code) >= 0) { setEngine(null, errText(e)); r.error = errText(e); renderRemark(r); return; }
      if (partial && code !== "refused") { commit(r, q, partial + "\n\n*（中断了：" + errText(e) + "）*"); return; }
      r.error = errText(e); renderRemark(r);
    });
  }
  function commit(r, q, text) {
    r.doc.thread.push({ role: "user", content: q }, { role: "assistant", content: text });
    r.doc.upd = Date.now(); r.pending = null; r.error = null; r.busy = false; r.ctl = null;
    Store.save(r);
    if (!r.el) return;
    if (mo) mo.disconnect();
    renderRemark(r); afterChanged();
    if (mo) mo.observe(root, { childList: true, subtree: true });
  }
  function dropRemark(r) { if (r.ctl) r.ctl.abort(); if (r.el && r.el.parentNode) r.el.parentNode.removeChild(r.el); delete R[r.rid]; Store.remove(r); }
  function discardPending(r) {
    if (!r.doc.thread.length) { descendants(r.rid).forEach(dropRemark); dropRemark(r); afterChanged(); return; }
    r.pending = null; r.error = null; renderRemark(r);
  }
  function copyRemark(r) {
    var lines = [];
    if (r.doc.quote) lines.push("> " + r.doc.quote.replace(/\n/g, "\n> "), "");
    r.doc.thread.forEach(function (t) { lines.push((t.role === "user" ? "问：" : "答：") + t.content, ""); });
    var text = lines.join("\n").trim();
    function fallback() { var s = getSelection(), rg = document.createRange(); rg.selectNodeContents(r.el.querySelector(".ask-rbody")); s.removeAllRanges(); s.addRange(rg); toast("已经选中，按 Ctrl+C 或 ⌘C 复制。"); }
    try { navigator.clipboard.writeText(text).then(function () { toast("问答已复制。"); }, fallback); } catch (e) { fallback(); }
  }
  function confirmDelete(r, row) {
    var desc = descendants(r.rid); clear(row);
    row.appendChild(h("span", { class: "ask-confirm", text: desc.length ? "删除这条批注，连同嵌在里面的 " + desc.length + " 条？" : "删除这条批注？" }));
    row.appendChild(abtn("删除", function () { desc.reverse().concat([r]).forEach(dropRemark); afterChanged(); toast(desc.length ? "删掉了 " + (desc.length + 1) + " 条批注。" : "批注已删除。"); }, "danger"));
    row.appendChild(abtn("保留", function () { refreshActions(r); }));
  }

  /* ---------- 输入框 ---------- */
  var QUICK = [["讲简单点", "讲简单一点：先给直觉，再给准确的说法。"], ["为什么", "为什么是这样？给出理由。"], ["推导", "一步一步推导出来。"], ["举个例子", "举一个小而具体的例子。"], ["面试怎么说", "面试里要用两三句话说清楚，该怎么说？"]];
  var QUICK_SEL = [["什么意思", "选中的这句话在这里是什么意思？"], ["为什么", "选中的说法为什么成立？"], ["推导", "推导选中的这部分。"], ["举个例子", "给选中的概念举一个具体的例子。"]];
  var QUICK_BOX = [["解释框里的", "解释框里这部分内容。"], ["为什么长这样", "框里这部分为什么是这个样子？"], ["推导", "推导框里这部分背后的道理。"], ["面试怎么说", "面试里怎么用两三句话讲清框里这部分？"]];
  var QUICK_FU = [["再深一层", "再深入一层，给出准确的论证。"], ["说简单点", "用更简单的话再说一遍。"], ["举个例子", "举一个具体的例子。"]];
  function shortLabel(b) {
    var t = norm(srcText(b)).replace(/\$/g, "");
    if (b.classList.contains("ask-ablk")) return "问回答里的这一段：" + clip(t, 90);
    if (b.classList.contains("cs-chart")) return "问这张图：" + (b.getAttribute("data-chart") || "");
    if (b.classList.contains("cs-tablewrap")) return "问这张表：" + clip(t, 80);
    if (b.matches("h2, h3")) return "问这一节：" + clip(t, 60);
    return "问这一段：" + clip(t, 100);
  }
  function closeComposer() {
    if (!composer) return;
    if (composer.block) composer.block.classList.remove("asking");
    if (composer.boxed) { var bx = $("askBoxSel"); if (bx) { bx.hidden = true; bx.classList.remove("held"); } }
    if (composer.el.parentNode) composer.el.parentNode.removeChild(composer.el);
    composer = null;
  }
  function nextLevel(host) { var rid = host && host.getAttribute("data-ask-rid"); return rid && R[rid] ? levelOf(R[rid]) + 1 : 1; }
  function composerUI(o) {
    var depth = lsGet(DEPTHKEY, "brief") === "deep" ? "deep" : "brief";
    var ta = h("textarea", { id: o.followUp ? "askFollowInput" : "askInput", rows: "2", placeholder: o.placeholder, "aria-label": "你的问题" });
    var dbtn = h("button", { type: "button", class: "chip ask-toggle", "aria-pressed": depth === "deep" ? "true" : "false", title: "回答更长，把推导写完整；在 Claude 里会用更强的模型", text: "详细" });
    dbtn.addEventListener("click", function () { depth = depth === "deep" ? "brief" : "deep"; dbtn.setAttribute("aria-pressed", depth === "deep" ? "true" : "false"); lsSet(DEPTHKEY, depth); });
    function submit(q) { q = (q || "").trim(); if (!q) { ta.focus(); return; } o.onSubmit(q, depth); }
    var el = h("div", { class: "ask-composer", role: "group", "aria-label": "提问", "data-lc": o.lc || "1" },
      o.box ? h("div", { class: "ask-box" }, h("span", { class: "ask-box-l", text: "框选" }), h("div", { class: "ask-box-t", text: o.box })) : o.quote ? h("blockquote", { class: "ask-quote", text: o.quote }) : o.ctx ? h("p", { class: "ask-ctx", text: o.ctx }) : null,
      ta,
      h("div", { class: "ask-chips" }, o.chips.map(function (c) { return h("button", { type: "button", class: "chip", text: c[0], onclick: function () { submit(c[1]); } }); })),
      h("div", { class: "ask-crow" }, dbtn, h("span", { class: "ask-grow" }), h("span", { class: "ask-hint", text: "Enter 发送 · Shift+Enter 换行" }),
        h("button", { type: "button", class: "btn", text: "取消", onclick: closeComposer }),
        h("button", { type: "button", class: "btn primary", text: "提问", onclick: function () { submit(ta.value); } })));
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(ta.value); }
      else if (e.key === "Escape") { e.preventDefault(); closeComposer(); }
    });
    return { el: el, ta: ta };
  }
  function openComposer(host, opt) {
    opt = opt || {};
    if (!host) return;
    if (!engine.ready) { toast(engine.off || "还没有接入 AI。"); if (engine.kind === "web") openSettings(); return; }
    var boxed = !!opt.boxed; if (boxed && composer) composer.boxed = false;
    closeComposer(); disarm(); hideAsk();
    var kind = opt.kind || (opt.quote ? "text" : "block");
    var ui = composerUI({
      placeholder: kind === "box" ? "想问框里的什么？" : kind === "text" ? "想问选中的什么？" : "哪里不明白？",
      chips: kind === "box" ? QUICK_BOX : kind === "text" ? QUICK_SEL : QUICK,
      ctx: kind === "block" ? shortLabel(host) : null, quote: kind === "text" ? opt.quote : null, box: kind === "box" ? opt.quote : null,
      lc: lcOf(nextLevel(host)),
      onSubmit: function (q, depth) { closeComposer(); startAsk(host, kind, opt.quote || null, q, depth); }
    });
    if (mo) mo.disconnect();
    insertAfterBlock(host, ui.el); host.classList.add("asking");
    if (mo) mo.observe(root, { childList: true, subtree: true });
    composer = { el: ui.el, block: host, boxed: boxed };
    if (kind === "box") typeset(ui.el);
    ui.ta.focus({ preventScroll: true });
    ui.el.scrollIntoView({ block: "nearest" });
  }
  function openFollowUp(r) {
    closeComposer();
    var ui = composerUI({ placeholder: "接着问…", chips: QUICK_FU, followUp: true, lc: r.el.getAttribute("data-lc"), onSubmit: function (q, depth) { closeComposer(); runTurn(r, q, depth); } });
    var acts = r.el.querySelector(":scope > .ask-rbody > .ask-actions"); acts.parentNode.insertBefore(ui.el, acts);
    composer = { el: ui.el, block: null, boxed: false };
    ui.ta.focus({ preventScroll: true }); ui.el.scrollIntoView({ block: "nearest" });
  }

  /* ---------- 悬停（或点一下）出现的"问"按钮 ---------- */
  var canHover = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : { matches: true };
  var askBlock = null, armed = null, hideT = 0;
  function eligible(b) { return !!(b && root.contains(b) && !b.closest(".ask-composer") && !(composer && composer.block === b)); }
  function hideAsk() { var b = $("askBtn"); if (b) b.hidden = true; askBlock = null; }
  function showAsk(b) {
    clearTimeout(hideT); askBlock = b;
    var btn = $("askBtn"); btn.hidden = false; btn.querySelector(".l").textContent = armed ? "问这里" : "问";
    var ar = root.getBoundingClientRect(), br = b.getBoundingClientRect(), w = btn.offsetWidth, hh = btn.offsetHeight, left, top;
    if (armed) { left = br.right - w; top = br.bottom - hh - 4; }
    else if (ar.right + w + 16 < window.innerWidth) { left = ar.right + 10; top = br.top + 2; }
    else { left = br.right - w; top = br.top - hh / 2; }
    btn.style.left = Math.round(Math.max(4, left)) + "px"; btn.style.top = Math.round(Math.max(4, top)) + "px";
  }
  function scheduleHide() { clearTimeout(hideT); hideT = setTimeout(function () { if (!armed) hideAsk(); }, 450); }
  function arm(b) { disarm(); armed = b; b.classList.add("armed"); showAsk(b); }
  function disarm() { if (armed) armed.classList.remove("armed"); armed = null; }

  /* ---------- 选中文字 ---------- */
  var selInfo = null, selT = 0;
  function hideSel() { var b = $("askSelBtn"); if (b) b.hidden = true; selInfo = null; }
  function hostOf(n) { var el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.closest(".ask-blk") : null; }
  function checkSel() {
    if (!engine.ready || boxing) return hideSel();
    var s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return hideSel();
    var rg = s.getRangeAt(0), anc = rg.commonAncestorContainer.nodeType === 1 ? rg.commonAncestorContainer : rg.commonAncestorContainer.parentNode;
    if (!anc || !root.contains(anc) || anc.closest(".ask-composer, .ask-actions, .cs-ctl")) return hideSel();
    var frag = document.createElement("div"); frag.appendChild(rg.cloneContents());
    var text = norm(srcText(frag)); if (text.length < 2) return hideSel();
    text = clip(text, 1500);
    var block = hostOf(rg.startContainer) || hostOf(anc);
    if (!block) { var w = document.createTreeWalker(anc, NodeFilter.SHOW_ELEMENT), n; while ((n = w.nextNode())) if (n.classList.contains("ask-blk") && rg.intersectsNode(n)) { block = n; break; } }
    if (!eligible(block)) return hideSel();
    selInfo = { text: text, block: block };
    var b = $("askSelBtn"); b.hidden = false;
    var rect = rg.getBoundingClientRect(), bw = b.offsetWidth;
    b.style.top = Math.round(Math.min(rect.bottom + 10, window.innerHeight - 48)) + "px";
    b.style.left = Math.round(Math.max(8, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 8))) + "px";
  }

  /* ---------- 框选 ---------- */
  function capture(rc) {
    function hit(r) { return r.width + r.height > 0 && !(r.right < rc.left || r.left > rc.right || r.bottom < rc.top || r.top > rc.bottom); }
    function inside(r) { var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; return r.width + r.height > 0 && cx >= rc.left && cx <= rc.right && cy >= rc.top && cy <= rc.bottom; }
    var items = [], tables = [];
    $$(".cs-chart", root).forEach(function (host) {
      if (!isShown(host)) return; var ch = chartOf(host); if (!ch || !hit(ch.cv.getBoundingClientRect())) return;
      var d = describeChart(ch, rc, 30); if (!d) return;
      items.push({ node: host, host: host.closest(".ask-blk") || host, text: "[图表：" + (host.getAttribute("data-chart") || "") + "]\n" + d });
    });
    $$("table", root).forEach(function (t) {
      if (!isShown(t) || t.closest(".ask-composer")) return;
      var rows = $$("tr", t).filter(function (tr) { return !tr.closest("thead") && tr.querySelector("td") && hit(tr.getBoundingClientRect()); });
      if (!rows.length) return; tables.push(t);
      function line(tr) { return "| " + Array.prototype.map.call(tr.children, function (c) { return norm(srcText(c)); }).join(" | ") + " |"; }
      var head = t.querySelector("thead tr") || (t.querySelector("tr th") ? t.querySelector("tr") : null);
      items.push({ node: rows[0], host: hostOf(t), text: "[表格的几行]\n" + (head ? line(head) + "\n" : "") + rows.map(line).join("\n") });
    });
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      if (n.nodeType === 1) {
        if (n.parentElement && n.parentElement.tagName === "DETAILS" && !n.parentElement.open && n.tagName !== "SUMMARY") return NodeFilter.FILTER_REJECT;
        if (n.matches("canvas, svg, button, select, input, textarea, .katex, .ask-composer, .ask-stub, .ask-actions, .ask-tag, .ask-lvl, .ask-box-l, .ask-fu-l, .qc-tip, .qc-msg, .qc-legend, .cs-chart") || (n.tagName === "TABLE" && tables.indexOf(n) >= 0)) return NodeFilter.FILTER_REJECT;
        return n.hasAttribute("data-tex") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      return n.nodeValue.trim() && !n.parentElement.closest("[data-tex]") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    } });
    var rg = document.createRange(), n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 1) { var r0 = n.getBoundingClientRect(); if (inside(r0) || (n.getAttribute("data-display") === "1" && hit(r0))) items.push({ node: n, host: hostOf(n), inline: true, text: n.getAttribute("data-display") === "1" ? "$$" + n.getAttribute("data-tex") + "$$" : "$" + n.getAttribute("data-tex") + "$" }); continue; }
      rg.selectNodeContents(n); if (!hit(rg.getBoundingClientRect())) continue;
      var words = [], re = /[㐀-鿿＀-￯　-〿]|[^\s㐀-鿿＀-￯　-〿]+/g, m, txt = n.nodeValue, pieces = [];
      while ((m = re.exec(txt))) { rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); if (inside(rg.getBoundingClientRect())) pieces.push(m); }
      if (!pieces.length) continue;
      var s = "", lastEnd = -1;
      pieces.forEach(function (p) { if (lastEnd >= 0) s += /\s/.test(txt.slice(lastEnd, p.index)) ? " " : (p.index > lastEnd ? " … " : ""); s += p[0]; lastEnd = p.index + p[0].length; });
      items.push({ node: n, host: hostOf(n), text: s, inline: true });
    }
    if (!items.length) return null;
    items.sort(function (a, b) { return a.node === b.node ? 0 : (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1); });
    function lineOf(it) { var el = it.node.nodeType === 1 ? it.node : it.node.parentElement; return el.closest("p, li, h2, h3, h4, summary, blockquote, td, th, .cs-tile, .ask-fu, .ask-quote, .ask-box") || it.host; }
    var out = "", prev = null;
    items.forEach(function (it) { var L = it.inline ? lineOf(it) : it; out += (out ? (L === prev && it.inline ? (/^[.,;:!?)\]，。；：！？）]/.test(it.text) ? "" : " ") : "\n") : "") + it.text; prev = L; });
    var host = null;
    for (var i = 0; i < items.length && !host; i++) if (items[i].host && eligible(items[i].host)) host = items[i].host;
    if (!host) host = $$(".ask-blk", root).filter(function (b) { return eligible(b) && isShown(b) && hit(b.getBoundingClientRect()); })[0] || null;
    return host ? { host: host, text: clip(out.trim(), 4000) } : null;
  }
  var drag = null, autoRaf = 0, held = null;
  function setBox(on) {
    document.body.classList.toggle("ask-boxmode", !!on);
    var b = $("askBoxBtn"); if (b) b.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) { hideAsk(); hideSel(); disarm(); }
  }
  function boxAllowed(e) {
    if (!engine.ready || e.button !== 0) return false;
    if (e.clientX >= document.documentElement.clientWidth || e.clientY >= document.documentElement.clientHeight) return false;
    var t = e.target; if (!(t instanceof Element) || !A.scope().contains(t)) return false;
    if (t.closest(".ask-composer, .ask-ui, #askDrawer, .ask-modal, a, button, input, textarea, select, label")) return false;
    if (document.body.classList.contains("ask-boxmode")) return true;
    if (e.pointerType !== "mouse" || t.closest("summary")) return false;
    if (e.altKey) return true;
    if (t.closest(".cs-chart canvas, .tex")) return true;
    return t.matches(A.blankSel);
  }
  function drawBox() {
    if (!drag) return;
    var dy = drag.sc.scrollTop - drag.st0, dx = drag.sc.scrollLeft - drag.sl0, sx = drag.sx - dx, sy = drag.sy - dy, b = $("askBoxSel");
    b.style.left = Math.min(sx, drag.cx) + "px"; b.style.top = Math.min(sy, drag.cy) + "px";
    b.style.width = Math.abs(drag.cx - sx) + "px"; b.style.height = Math.abs(drag.cy - sy) + "px";
  }
  function autoScroll() {
    autoRaf = 0; if (!drag || !drag.started) return;
    var r = drag.sc === document.scrollingElement || drag.sc === document.documentElement ? { top: 0, bottom: window.innerHeight } : drag.sc.getBoundingClientRect(), d = 0, edge = 40;
    if (drag.cy < r.top + edge) d = -Math.ceil((r.top + edge - drag.cy) / 3); else if (drag.cy > r.bottom - edge) d = Math.ceil((drag.cy - (r.bottom - edge)) / 3);
    if (d) { drag.sc.scrollTop += d; drawBox(); autoRaf = requestAnimationFrame(autoScroll); }
  }
  /** 提问框打开时，框住的那块跟着页面滚动 */
  function moveHeld() {
    var b = $("askBoxSel"); if (!held || !b || b.hidden || !b.classList.contains("held")) return;
    b.style.top = Math.round(held.top - (held.sc.scrollTop - held.st)) + "px"; b.style.left = Math.round(held.left - (held.sc.scrollLeft - held.sl)) + "px";
  }
  function endDrag(e, cancel) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null; boxing = false; document.body.classList.remove("ask-boxing");
    if (autoRaf) { cancelAnimationFrame(autoRaf); autoRaf = 0; }
    if (!d.started) return;
    swallowClick = true; setTimeout(function () { swallowClick = false; }, 0);
    var b = $("askBoxSel"), r = b.getBoundingClientRect();
    if (cancel || r.width < 8 || r.height < 8) { b.hidden = true; return; }
    var cap = capture({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    setBox(false);
    if (!cap) { b.hidden = true; toast("框里没有能问的东西。框住一段文字、公式、表格或者图表。"); return; }
    b.classList.add("held"); held = { sc: d.sc, st: d.sc.scrollTop, sl: d.sc.scrollLeft, top: r.top, left: r.left };
    openComposer(cap.host, { kind: "box", quote: cap.text, boxed: true });
  }

  /* ---------- 抽屉：我的提问 ---------- */
  function renderDrawer() {
    var b = $("askDrawerBody"); clear(b);
    var list = vals().filter(function (r) { return r.doc.thread.length; });
    if (!list.length) { b.appendChild(h("p", { class: "note", text: "还没有提问。选中几个字或者拖一个框（按住 Alt，或者打开顶栏的“框选”），回答会出现在原处；在回答里也可以接着框、接着问。" })); return; }
    var roots = list.filter(function (r) { return !r.doc.parent || !R[r.doc.parent]; }).sort(function (a, b) { return (a.doc.sid < b.doc.sid ? -1 : a.doc.sid > b.doc.sid ? 1 : a.doc.at - b.doc.at); });
    var lastPage = null, lastSec = null;
    function item(r, lv) {
      b.appendChild(h("button", { type: "button", class: "ask-ditem", "data-lc": lcOf(lv), style: "padding-left:" + (8 + (lv - 1) * 14) + "px", onclick: function () { setDrawer(false); goTo(r.rid); } },
        h("span", { class: "ask-ddot" }), lv > 1 ? h("span", { class: "ask-lvl", text: "L" + lv }) : null, h("span", { text: firstQ(r) })));
      kidsOf(r.rid).forEach(function (c) { if (c.doc.thread.length) item(c, lv + 1); });
    }
    roots.forEach(function (r) {
      if (r.doc.page !== lastPage) { lastPage = r.doc.page; lastSec = null; b.appendChild(h("p", { class: "ask-dpage", text: r.doc.page || "页面" })); }
      if (r.doc.where !== lastSec) { lastSec = r.doc.where; b.appendChild(h("p", { class: "ask-dsec", text: r.doc.where || "" })); }
      item(r, 1);
    });
  }
  function setDrawer(open) { var d = $("askDrawer"); d.hidden = !open; var q = $("askQBtn"); if (q) q.setAttribute("aria-expanded", open ? "true" : "false"); if (open) renderDrawer(); }

  /* ---------- 接入 AI（独立网页里，用使用者自己的密钥；设置和策略实验室共用） ---------- */
  function setEngine(fn, off) {
    engine.fn = fn || null; engine.ready = !!fn; engine.off = fn ? "" : (off || "");
    document.body.classList.toggle("ask-ready", engine.ready);
    var st = $("askStatus");
    if (st) { st.textContent = engine.ready ? (engine.kind === "host" ? "回答的是 Claude（你自己的额度）。" : "回答的是 " + ((QLAI.label() || {}).short || "AI") + "（你自己的密钥）。") + (canHover.matches ? "选中文字，或者按住 Alt 拖一个框。" : "点一下段落，或者打开“框选”。") : (engine.off || "还没有接入 AI。"); st.className = "ask-status-line" + (engine.ready ? " ok" : ""); }
    var sb = $("askSetBtn"); if (sb) { sb.hidden = engine.kind !== "web"; var lab = sb.querySelector(".l"), L = engine.kind === "web" && window.QLAI ? QLAI.label() : null; if (lab) lab.textContent = engine.ready && L ? L.short : "接入 AI"; }
    var bb = $("askBoxBtn"); if (bb) bb.disabled = !engine.ready;
    vals().forEach(refreshActions);
    if (!engine.ready) { hideAsk(); hideSel(); setBox(false); }
  }
  function initEngine() {
    if (window.claude && typeof window.claude.use === "function") {
      engine.kind = "host"; setEngine(null, "正在连接 Claude…");
      Promise.resolve(window.claude.use("sample")).then(function (fn) { if (typeof fn === "function") setEngine(fn); else setEngine(null, "当前的打开方式不能调用 Claude。页面的其余部分照常可用。"); }, function () { setEngine(null, "当前的打开方式不能调用 Claude。"); });
      return;
    }
    if (window.QLAI) {
      engine.kind = "web";
      var sync2 = function () { var fn = QLAI.ready() ? QLAI.sample() : null; setEngine(fn, "还没有接入 AI：点顶栏的“接入 AI”，选一家服务商、填你自己的 API 密钥（只存在这台电脑的浏览器里）。"); };
      sync2(); QLAI.onChange(sync2); return;
    }
    engine.kind = null; setEngine(null, "这个页面没有可用的 AI 接口。");
  }
  function openSettings() {
    if (!window.QLAI) return;
    var W = QLAI, draft = W.cfg(); if (!draft.p) draft.p = W.PRE[0].id; if (!draft.by) draft.by = {};
    function cur() { return draft.by[draft.p] || (draft.by[draft.p] = {}); }
    var bodyEl = h("div", { class: "ask-set" }), st = null, busy = false;
    function say(kind, text) { if (st) { st.className = "ask-set-st " + (kind || ""); st.textContent = text || ""; } }
    function sayErr(e) { var ex = W.explain(e); say("bad", "✕ " + ex.text + (ex.detail ? "（服务商的原话：" + ex.detail + "）" : "")); }
    function paint() {
      var P = W.preset(draft.p), u = cur(); clear(bodyEl);
      bodyEl.appendChild(h("p", { class: "note", text: "用你自己的 API 密钥调用所选的服务商。密钥只保存在这台电脑的这个浏览器里，和策略实验室、机器学习实验室共用；请求从浏览器直接发给服务商，费用按你的账号计。" }));
      bodyEl.appendChild(h("div", { class: "ask-provs", role: "group", "aria-label": "服务商" }, W.PRE.map(function (x) { return h("button", { type: "button", class: "chip", "aria-pressed": x.id === draft.p ? "true" : "false", text: x.name, onclick: function () { draft.p = x.id; paint(); } }); })));
      if (P.hint) bodyEl.appendChild(h("p", { class: "note", text: P.hint }));
      if (W.noCors(W.conf(draft))) bodyEl.appendChild(h("p", { class: "warn", text: P.short + " 不允许网页直接调用，要在下面填一个转发代理。" }));
      if (P.sites) { var site = h("select", { id: "askSite", onchange: function () { u.base = site.value === P.base ? "" : site.value; } }, P.sites.map(function (x) { return h("option", { value: x[0], text: x[1], selected: (u.base || P.base) === x[0] }); })); bodyEl.appendChild(h("label", { class: "ask-f" }, h("span", { text: "站点" }), site)); }
      if (!P.base) { var base = h("input", { id: "askBase", type: "text", value: u.base || "", placeholder: "https://…/v1", spellcheck: "false", autocomplete: "off", oninput: function () { u.base = base.value; } }); bodyEl.appendChild(h("label", { class: "ask-f" }, h("span", { text: "接口地址" }), base)); }
      var key = h("input", { id: "askKey", type: "password", value: u.key || "", placeholder: "sk-…", spellcheck: "false", autocomplete: "off", oninput: function () { u.key = key.value; } });
      bodyEl.appendChild(h("label", { class: "ask-f" }, h("span", { text: "API 密钥" }), key));
      if (P.keyUrl) bodyEl.appendChild(h("p", { class: "note" }, "还没有密钥？", h("a", { href: P.keyUrl, target: "_blank", rel: "noopener noreferrer", text: "到 " + P.short + " 的控制台申请 ↗" })));
      var model = h("input", { id: "askModel", type: "text", value: u.model || "", placeholder: P.model || "模型的名字", spellcheck: "false", autocomplete: "off", oninput: function () { u.model = model.value; } });
      bodyEl.appendChild(h("label", { class: "ask-f" }, h("span", { text: "模型" }), model));
      var proxy = h("input", { id: "askProxy", type: "text", value: draft.proxy || "", placeholder: "一般留空", spellcheck: "false", autocomplete: "off", oninput: function () { draft.proxy = proxy.value; } });
      bodyEl.appendChild(h("details", { class: "cs-more", open: !!draft.proxy || W.noCors(W.conf(draft)) }, h("summary", { text: "高级：转发代理" }), h("label", { class: "ask-f" }, h("span", { text: "转发代理" }), proxy), h("p", { class: "note", text: "有的服务商不允许网页直接调用。这时页面请求 <代理地址>/<完整的接口地址>。代理能看到你的密钥，只填你自己部署或者信得过的。" })));
      st = h("p", { class: "ask-set-st", role: "status", "aria-live": "polite" }); bodyEl.appendChild(st);
    }
    paint();
    var modal = h("div", { class: "ask-modal", role: "dialog", "aria-modal": "true", "aria-label": "接入 AI" });
    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    function lock(on) { busy = on; $$(".ask-modal-foot button", modal).forEach(function (b) { b.disabled = on; }); }
    modal.appendChild(h("div", { class: "ask-modal-box" },
      h("div", { class: "ask-modal-h" }, h("b", { text: "接入 AI" }), h("span", { class: "ask-grow" }), h("button", { type: "button", class: "iconbtn", "aria-label": "关闭", text: "✕", onclick: close })),
      bodyEl,
      h("div", { class: "ask-modal-foot" },
        h("button", { type: "button", class: "btn", text: "清除密钥", onclick: function () { delete cur().key; var c = W.cfg(); if (c.by && c.by[draft.p]) delete c.by[draft.p].key; W.save(c); paint(); say("", "已经把密钥从这个浏览器里删掉。"); } }),
        h("span", { class: "ask-grow" }),
        h("button", { type: "button", class: "btn", text: "测试连接", onclick: function () { if (busy) return; lock(true); say("", "正在测试…"); W.test(draft).then(function (r) { lock(false); say("good", "✓ 通了：" + r.model + " 在 " + (r.ms / 1000).toFixed(1) + " 秒里回了话。记得点“保存”。"); }, function (e) { lock(false); sayErr(e); }); } }),
        h("button", { type: "button", class: "btn primary", text: "保存", onclick: function () { var bad = W.problem(W.conf(draft)); if (bad) { sayErr({ code: bad }); return; } W.save(draft); close(); toast("已接入 " + W.label().short + "。"); } }))));
    modal.addEventListener("mousedown", function (e) { if (e.target === modal) close(); });
    document.body.appendChild(modal); document.addEventListener("keydown", onKey, true);
    var k = $("askKey"); if (k) k.focus();
  }

  /* ---------- 页面上的按钮和浮层 ---------- */
  function icon(path, dash) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("width", "14"); s.setAttribute("height", "14"); s.setAttribute("aria-hidden", "true"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.5"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); if (dash) s.setAttribute("stroke-dasharray", "2.2 2"); s.innerHTML = path; return s; }
  var I_ASK = '<path d="M2.5 3h11v7.5h-6.2L4.5 13v-2.5h-2z"/><path d="M6.7 5.6a1.4 1.4 0 1 1 1.9 1.3c-.4.17-.6.45-.6.85"/><path d="M8 9.1v.02"/>';
  function seg(g, items, cur) { return h("span", { class: "ask-seg", "data-g": g, role: "group" }, items.map(function (x) { return h("button", { type: "button", "data-v": x[0], "aria-pressed": x[0] === cur ? "true" : "false", text: x[1], title: x[2] || null }); })); }
  function buildUI() {
    var bar = A.toolbar();
    var levelsCur = lsGet(LEVKEY, "all");
    var boxBtn = h("button", { type: "button", class: "btn ask-ui", id: "askBoxBtn", "aria-pressed": "false", title: "拖一个框问框里的东西（快捷键 B；也可以按住 Alt 直接拖）", disabled: true }, icon('<rect x="2.5" y="3" width="11" height="10" rx="1"/>', true), h("span", { class: "lang-long", text: "框选提问" }), h("span", { class: "lang-short", text: "框选" }));
    var viewBtn = h("button", { type: "button", class: "btn ask-ui", id: "askViewBtn", "aria-expanded": "false", "aria-controls": "askView" }, h("span", { class: "lang-long", text: "批注显示" }), h("span", { class: "lang-short", text: "批注" }));
    var qBtn = h("button", { type: "button", class: "btn ask-ui", id: "askQBtn", "aria-expanded": "false", "aria-controls": "askDrawer" }, h("span", { class: "lang-long", text: "我的提问" }), h("span", { class: "lang-short", text: "提问" }), h("span", { class: "ask-count", id: "askCount", text: "0" }));
    var setBtn = h("button", { type: "button", class: "btn ask-ui", id: "askSetBtn", hidden: true }, h("span", { class: "l", text: "接入 AI" }));
    bar.insertBefore(qBtn, bar.firstChild); bar.insertBefore(viewBtn, bar.firstChild); bar.insertBefore(boxBtn, bar.firstChild); bar.insertBefore(setBtn, bar.firstChild);
    var view = h("div", { class: "ask-view ask-ui", id: "askView", hidden: true },
      h("div", { class: "ask-vrow" }, h("span", { class: "ask-vl", text: "批注" }), seg("mode", [["folded", "折叠", "只显示一行问题"], ["open", "展开", "全部展开"], ["hidden", "隐藏", "只看正文"]], mode)),
      h("div", { class: "ask-vrow" }, h("span", { class: "ask-vl", text: "层数" }), seg("levels", [["1", "1", "只显示直接问页面的"], ["2", "2", "再显示回答里追问的一层"], ["all", "全部"]], levelsCur)));
    document.body.appendChild(view);
    document.body.appendChild(h("button", { type: "button", class: "ask-float ask-ui", id: "askBtn", hidden: true }, icon(I_ASK), h("span", { class: "l", text: "问" })));
    document.body.appendChild(h("button", { type: "button", class: "ask-float ask-sel ask-ui", id: "askSelBtn", hidden: true, text: "问选中的" }));
    document.body.appendChild(h("div", { class: "ask-boxsel", id: "askBoxSel", hidden: true }));
    document.body.appendChild(h("div", { class: "ask-boxhint", role: "status", text: "拖一个框，框住想问的东西 · Esc 取消" }));
    document.body.appendChild(h("div", { class: "ask-toast", id: "askToast", role: "status", "aria-live": "polite", hidden: true }));
    document.body.appendChild(h("aside", { class: "ask-drawer ask-ui", id: "askDrawer", hidden: true, "aria-label": "我的提问" },
      h("div", { class: "ask-drawer-h" }, h("b", { text: "我的提问" }), h("span", { class: "ask-grow" }), h("button", { type: "button", class: "btn", text: "关闭", onclick: function () { setDrawer(false); } })),
      h("div", { class: "ask-drawer-b", id: "askDrawerBody" })));
    var banner = A.banner(); if (banner) banner.appendChild(h("p", { class: "ask-status-line", id: "askStatus" }));
    boxBtn.addEventListener("click", function () { setBox(!document.body.classList.contains("ask-boxmode")); });
    viewBtn.addEventListener("click", function () { var open = view.hidden; view.hidden = !open; viewBtn.setAttribute("aria-expanded", open ? "true" : "false"); if (open) { var r = viewBtn.getBoundingClientRect(); view.style.top = Math.round(r.bottom + 6) + "px"; view.style.right = Math.round(Math.max(8, window.innerWidth - r.right)) + "px"; } });
    qBtn.addEventListener("click", function () { setDrawer($("askDrawer").hidden); });
    setBtn.addEventListener("click", openSettings);
    $$('#askView [data-g="mode"] button').forEach(function (b) { b.addEventListener("click", function () { setMode(b.getAttribute("data-v")); }); });
    $$('#askView [data-g="levels"] button').forEach(function (b) { b.addEventListener("click", function () { setLevels(b.getAttribute("data-v")); }); });
    var ab = $("askBtn");
    ab.addEventListener("mouseenter", function () { clearTimeout(hideT); }); ab.addEventListener("mouseleave", scheduleHide);
    ab.addEventListener("click", function () { var b = askBlock; if (b) openComposer(b); });
    var sb = $("askSelBtn");
    sb.addEventListener("mousedown", function (e) { e.preventDefault(); });
    sb.addEventListener("click", function () { if (!selInfo) return; var t = selInfo.text, b = selInfo.block; hideSel(); var s = getSelection(); if (s) s.removeAllRanges(); openComposer(b, { kind: "text", quote: t }); });
  }
  function bindEvents() {
    var scope = A.scope();
    root.addEventListener("mouseover", function (e) {
      if (!engine.ready || !canHover.matches || armed || boxing || document.body.classList.contains("ask-boxmode")) return;
      var b = e.target.closest(".ask-blk"); if (eligible(b)) showAsk(b);
    });
    root.addEventListener("mouseleave", scheduleHide);
    root.addEventListener("click", function (e) {
      if (!engine.ready || canHover.matches || document.body.classList.contains("ask-boxmode")) return;
      if (e.target.closest("a, button, summary, textarea, input, select, label, .ask-composer, .cs-chart, .ask-actions, .cs-ctl")) return;
      var s = getSelection(); if (s && !s.isCollapsed) return;
      var b = e.target.closest(".ask-blk");
      if (!eligible(b)) { if (armed) { disarm(); hideAsk(); } return; }
      if (armed === b) { disarm(); hideAsk(); return; }
      arm(b);
    });
    document.addEventListener("selectionchange", function () { clearTimeout(selT); selT = setTimeout(checkSel, 200); });
    document.addEventListener("scroll", function () { if (armed) showAsk(armed); else hideAsk(); if (!$("askSelBtn").hidden) checkSel(); if (drag && drag.started) drawBox(); else moveHeld(); }, true);
    window.addEventListener("resize", function () { if (!armed) hideAsk(); });
    document.addEventListener("pointerdown", function (e) {
      if (!boxAllowed(e)) return;
      var sc = scrollParent(e.target);
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, sc: sc, st0: sc.scrollTop, sl0: sc.scrollLeft, started: false };
      if (e.pointerType !== "mouse") e.preventDefault();
    }, true);
    document.addEventListener("mousedown", function (e) { if (drag && !drag.started) { e.preventDefault(); var s = getSelection(); if (s && !s.isCollapsed) s.removeAllRanges(); } }, true);
    window.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.cx = e.clientX; drag.cy = e.clientY;
      if (!drag.started) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 7) return;
        drag.started = true; boxing = true; document.body.classList.add("ask-boxing"); hideAsk(); hideSel(); disarm();
        if (composer && composer.boxed) composer.boxed = false;
        var b = $("askBoxSel"); b.classList.remove("held"); b.hidden = false;
      }
      e.preventDefault(); drawBox(); if (!autoRaf) autoRaf = requestAnimationFrame(autoScroll);
    }, { passive: false });
    window.addEventListener("pointerup", function (e) { endDrag(e, false); });
    window.addEventListener("pointercancel", function (e) { endDrag(e, true); });
    document.addEventListener("click", function (e) {
      if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; return; }
      var v = $("askView"); if (v && !v.hidden && !e.target.closest("#askView, #askViewBtn")) { v.hidden = true; $("askViewBtn").setAttribute("aria-expanded", "false"); }
      var d = $("askDrawer"); if (d && !d.hidden && !e.target.closest("#askDrawer, #askQBtn")) setDrawer(false);
    }, true);
    document.addEventListener("keydown", function (e) {
      var typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (!typing && engine.ready && (e.key === "b" || e.key === "B") && !e.metaKey && !e.ctrlKey && !e.altKey) { setBox(!document.body.classList.contains("ask-boxmode")); return; }
      if (e.key !== "Escape") return;
      if (drag) { endDrag(null, true); return; }
      if (document.body.classList.contains("ask-boxmode")) { setBox(false); return; }
      var d = $("askDrawer"); if (d && !d.hidden) { setDrawer(false); return; }
      var v = $("askView"); if (v && !v.hidden) { v.hidden = true; return; }
      if (composer && !e.defaultPrevented) closeComposer();
      hideSel(); disarm(); hideAsk();
    });
  }

  /**
   * adapter（页面适配层）要提供：
   *   root()          批注挂在里面的那个元素（页面会整块重画它）
   *   scope()         可以开始框选的范围（一般是包着 root、会滚动的那一栏）
   *   toolbar()       顶栏上放按钮的容器；banner() 放说明和状态的地方（可以没有）
   *   markBlocks(root) 给每个可以提问的块加 class "ask-blk"、data-ask-bid（稳定的 id）、data-ask-sid（所在的部分）
   *   orphanHost(sid) 原来的块找不到时批注放在哪里：{ parent, before }；那一部分还没渲染（或者不在当前页面）时返回 null
   *   navigate(sid)   打开那一部分（换案例、滚过去）
   *   pageTitle(sid)、sectionTitle(sid)、pageContext(sid)  给抽屉和提示词用的标题与上下文
   *   sys             给 AI 的说明；storeKey  localStorage 的键；blankSel  在哪些元素的空白处按下就直接开始框选
   */
  function init(adapter) {
    A = adapter; root = A.root();
    mode = lsGet(MODEKEY, "folded"); if (["folded", "open", "hidden"].indexOf(mode) < 0) mode = "folded";
    var lv = lsGet(LEVKEY, "all"); maxLevel = lv === "all" ? 0 : +lv || 0;
    buildUI(); bindEvents(); initEngine();
    var saved = Store.load();
    Object.keys(saved).forEach(function (rid) { var d = cleanDoc(saved[rid]); if (d) R[rid] = { rid: rid, doc: d, busy: false, pending: null, error: null }; });
    var byLevel = vals().sort(function (a, b) { return levelOf(a) - levelOf(b) || a.doc.at - b.doc.at; });
    byLevel.forEach(function (r) { if (r.doc.parent && R[r.doc.parent]) { ensureEl(R[r.doc.parent]); ensureEl(r); placeChild(r); } });
    mo = new MutationObserver(schedule); mo.observe(root, { childList: true, subtree: true });
    schedule();
  }
  return { init: init, hash: hash, clip: clip, describeChart: describeChart, srcText: srcText, capture: capture, _R: R, _sync: sync };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QLAsk;
