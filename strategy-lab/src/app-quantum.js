// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 应用主体：量子电路谜题（十关）。
 * 关卡、门和判定在 q-circuit.js 里，态矢量用的是三套量子玩法同一份模拟器（QL.qsim）。这个文件只管界面：
 * 左边是十关的目录，右边是电路板（点格子放门）、量子态（振幅和每个比特的 Bloch 球）和检验。
 * 第六关、第七关、第十关做完之后，可以一键去对应的量子玩法：在这里搭出来的是一次实验，到了那边由规则跑几千次。
 * 进度只记在这台设备的浏览器里：每一关的星数和最后摆的电路。 */
(function (A) {
  "use strict";
  var h = A.h, clear = A.clear, QL = A.QL;
  if (typeof QL_QCIRCUIT_INSTALL !== "function" || !QL.qsim) return;
  var QC = QL.QCIRCUIT || QL_QCIRCUIT_INSTALL(QL), LV = QC.LEVELS, GATES = QC.GATES, Q = QL.qsim, NS = "http://www.w3.org/2000/svg";

  /** SVG 元素：s(tag, attrs, 子元素…) */
  function s(tag, attrs) {
    var el = document.createElementNS(NS, tag), k, i;
    if (attrs) for (k in attrs) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "text") el.textContent = v; else el.setAttribute(k, v === true ? "" : v); }
    for (i = 2; i < arguments.length; i++) (function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c))); })(arguments[i]);
    return el;
  }
  function line(x1, y1, x2, y2, stroke, w, extra) { var o = { x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke, "stroke-width": w || 1.5 }; if (extra) for (var k in extra) o[k] = extra[k]; return s("line", o); }
  function pad2(i) { return (i < 10 ? "0" : "") + i; }

  /* ---------- 存档（只在这台设备的浏览器里） ---------- */
  var KEY = "ql.qcircuit.v1", ZERO = { a0: 0, a1: 0, b0: 0, b1: 0 };
  var save = { stars: LV.map(function () { return 0; }), circ: {}, chsh: null };
  function int8(x) { x = Math.round(+x); return x === x ? Math.max(-8, Math.min(8, x)) : 0; }
  function bitOf(x) { return +x === 1 ? 1 : 0; }
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var d0 = JSON.parse(raw);
      if (d0 && Array.isArray(d0.stars)) save.stars = LV.map(function (_, i) { return Math.max(0, Math.min(3, Math.round(+d0.stars[i]) || 0)); });
      if (d0 && d0.circ && typeof d0.circ === "object") save.circ = d0.circ;
      if (d0 && d0.chsh && typeof d0.chsh === "object") save.chsh = d0.chsh;
    }
  } catch (e) { /* 存不了就不存 */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 忽略 */ } }

  /* ---------- 当前的局面 ---------- */
  var ui = null, root = null, cur = 0, ops = [], tool = null, pending = null, viewCol = null, scen = 0, result = null, undoStack = [], status = { text: "", warn: false }, openHints = {};
  var chsh = { cl: clone4(ZERO, bitOf), q: clone4(ZERO, int8), sample: null };
  if (save.chsh) { chsh.cl = clone4(save.chsh.cl || ZERO, bitOf); chsh.q = clone4(save.chsh.q || ZERO, int8); }
  function clone4(o, f) { return { a0: f(o.a0), a1: f(o.a1), b0: f(o.b0), b1: f(o.b1) }; }

  var WIRE_NAMES = { deutsch: ["x", "y"], bomb: ["光子"], dense: ["Alice", "Bob"], teleport: ["Alice", "Alice", "Bob"] }, SUBS = ["₀", "₁", "₂"];
  function wireName(L, q) { var nm = WIRE_NAMES[L.id]; return nm ? nm[q] : "q" + SUBS[q]; }
  /** 存档里读回来的电路：只留下合法的门（这一关能用的、位置在板内、同一列里不重叠） */
  function sanitize(L, arr) {
    var out = [];
    if (!Array.isArray(arr) || !L.gates) return out;
    arr.forEach(function (o) {
      if (!o || L.gates.indexOf(o.g) < 0 || !Array.isArray(o.q)) return;
      if (!(o.col === (o.col | 0) && o.col >= 0 && o.col < L.cols)) return;
      if (o.q.some(function (w) { return !(w === (w | 0) && w >= 0 && w < L.n); })) return;
      if (GATES[o.g].arity !== o.q.length || (o.q.length === 2 && o.q[0] === o.q[1])) return;
      var lo = Math.min.apply(null, o.q), hi = Math.max.apply(null, o.q);
      var clash = L.locked.concat(out).some(function (p) { return p.col === o.col && Math.max(lo, Math.min.apply(null, p.q)) <= Math.min(hi, Math.max.apply(null, p.q)); });
      if (!clash) out.push({ g: o.g, col: o.col, q: o.q.slice() });
    });
    return out;
  }
  function withLocks(L) { return L.locked.map(function (o) { return Object.assign({ locked: true }, o); }).concat(ops); }
  function occupant(L, c, w) { var all = withLocks(L); for (var i = 0; i < all.length; i++) { var o = all[i]; if (o.col === c && w >= Math.min.apply(null, o.q) && w <= Math.max.apply(null, o.q)) return o; } return null; }

  function loadLevel(i) {
    cur = i; var L = LV[i];
    ops = L.gates ? sanitize(L, save.circ[L.id]) : [];
    tool = L.gates ? L.gates[0] : null;
    pending = null; viewCol = null; scen = 0; result = null; undoStack = []; status = { text: "", warn: false };
    render();
    var sc = root && root.querySelector(".qc-main"); if (sc) sc.scrollTop = 0;
    if (ui && ui.box) ui.box.scrollTop = 0;
  }
  function changed() { save.circ[LV[cur].id] = ops; persist(); result = null; }
  function commit(next) { undoStack.push(ops); if (undoStack.length > 100) undoStack.shift(); ops = next; changed(); }
  function undo() { if (!undoStack.length) return; ops = undoStack.pop(); pending = null; changed(); setStatus("已撤销。"); render(); }
  function clearAll() { if (!ops.length) return; commit([]); pending = null; setStatus("电路已清空。可以点\"撤销\"恢复。"); render(); }
  function setStatus(text, warn) { status = { text: text, warn: !!warn }; }

  /* ---------- 在电路板上点 ---------- */
  function clickCell(c, w) {
    var L = LV[cur], occ = occupant(L, c, w), k;
    if (pending) {
      if (c === pending.col && w === pending.w) { pending = null; setStatus("已取消。"); render(); return; }
      if (c !== pending.col) { pending = occ ? null : { col: c, w: w }; setStatus(""); render(); return; }
      var lo = Math.min(pending.w, w), hi = Math.max(pending.w, w);
      for (k = lo; k <= hi; k++) if (occupant(L, c, k)) { pending = null; setStatus("这一列在两根线之间已经有门了，换一列试试。", true); render(); return; }
      var op = { g: tool, col: c, q: [pending.w, w] };
      pending = null; tryAdd(L, op); return;
    }
    if (occ) {
      if (occ.locked) { setStatus("黑盒固定在这里，不能移动或删除。", true); render(); return; }
      var next = ops.filter(function (o) { return o !== occ; });
      commit(next);
      var err = L.validate ? L.validate(next) : null;
      setStatus(err ? "已删除。注意：" + err : "已删除 " + GATES[occ.g].name + "。", !!err);
      render(); return;
    }
    if (!tool) { setStatus("先在上面选一个门。", true); render(); return; }
    if (GATES[tool].arity === 2) { pending = { col: c, w: w }; setStatus(""); render(); return; }
    tryAdd(L, { g: tool, col: c, q: [w] });
  }
  function tryAdd(L, op) {
    var next = ops.concat([op]);
    if (L.validate) { var err = L.validate(next); if (err) { setStatus(err, true); render(); return; } }
    commit(next); setStatus(""); render();
  }
  function doCheck() {
    var L = LV[cur];
    result = L.type === "chsh" ? chshResult() : QC.check(L, ops);
    if (result.pass && result.stars > save.stars[cur]) { save.stars[cur] = result.stars; persist(); }
    render();
    var v = root && root.querySelector(".qc-verdict"); if (v && v.scrollIntoView) v.scrollIntoView({ block: "nearest" });
  }

  /* ---------- 小部件 ---------- */
  function starsEl(n, cls) {
    var out = h("span", { class: cls || "qc-stars", "aria-label": n + " 星" });
    for (var k = 0; k < 3; k++) out.appendChild(k < n ? document.createTextNode("★") : h("span", { class: "off", text: "★" }));
    return out;
  }
  function pct2(x) { return (100 * x).toFixed(2) + "%"; }
  function fmtNum(x) { var v = Math.abs(x) < 5e-4 ? 0 : x; return v.toFixed(3).replace("-", "−"); }
  function fmtAmp(a) {
    var r = a[0], i = a[1];
    if (Math.abs(i) < 5e-4) return fmtNum(r);
    if (Math.abs(r) < 5e-4) return fmtNum(i) + "i";
    return fmtNum(r) + (i < 0 ? " − " : " + ") + Math.abs(i).toFixed(3) + "i";
  }
  function phaseColor(ph) { var deg = ph * 180 / Math.PI, hue = ((210 + deg) % 360 + 360) % 360; return "hsl(" + hue.toFixed(0) + " 68% 50%)"; }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function piFrac(k) {
    if (k === 0) return "0";
    var g = gcd(Math.abs(k), 16), num = Math.abs(k) / g, den = 16 / g;
    return (k < 0 ? "−" : "") + (num === 1 ? "" : num) + "π" + (den === 1 ? "" : "/" + den);
  }
  function degOf(k) { var d = k * 11.25; return (d < 0 ? "−" : "") + String(+Math.abs(d).toFixed(2)) + "°"; }
  function gateGlyph(g) { var G = GATES[g]; return h("span", { class: "g", "aria-hidden": "true" }, G.label, G.sub ? h("sub", { text: G.sub }) : null); }
  function closeThen(fn) { return function () { if (ui) ui.close(); fn(); }; }

  /* ---------- 题目 ---------- */
  function brief(L) {
    var hints = h("div", { class: "qc-hints" }, L.hints.map(function (t, k) {
      var key = L.id + k, d = h("details", { class: "qc-hint", open: !!openHints[key] }, h("summary", { text: "提示 " + (k + 1) }), h("p", { text: t }));
      d.addEventListener("toggle", function () { openHints[key] = d.open; });
      return d;
    }));
    return h("section", { class: "qc-brief" },
      h("div", { class: "qc-tag", text: pad2(cur + 1) + " / 10 · " + L.tag }),
      h("h3", { class: "qc-title", text: L.title }),
      h("p", { class: "qc-goal", text: L.goal }),
      hints);
  }

  /* ---------- 电路板 ---------- */
  function bench(L) {
    var pal = h("div", { class: "qc-palette", role: "toolbar", "aria-label": "可用的门" },
      L.gates.map(function (g) {
        return h("button", { class: "qc-tool", type: "button", "aria-pressed": tool === g ? "true" : "false", title: GATES[g].desc, "data-fk": "tool-" + g, onclick: function () { tool = g; pending = null; setStatus(""); render(); } }, gateGlyph(g), GATES[g].name);
      }),
      h("span", { class: "qc-spacer" }),
      h("button", { class: "btn small", type: "button", onclick: undo, disabled: !undoStack.length, "data-fk": "undo", text: "撤销" }),
      h("button", { class: "btn small", type: "button", onclick: clearAll, disabled: !ops.length, "data-fk": "clear", text: "清空" }),
      h("button", { class: "btn small primary", type: "button", onclick: doCheck, "data-fk": "check", id: "qcCheck", text: "检验" }));
    var G = tool && GATES[tool];
    var desc = h("div", { class: "qc-tooldesc" }, G ? [h("b", { text: G.name + "：" }), G.desc] : "");
    var stText = status.text;
    if (!stText && pending) stText = "现在点第 " + (pending.col + 1) + " 列的另一根线" + (tool === "CNOT" ? "作为目标位" : "") + "。再点一次同一格取消。";
    var st = h("div", { class: "qc-status" + (status.warn ? " warn" : ""), role: "status", "aria-live": "polite", text: stText });
    var how = h("div", { class: "qc-howto", text: "点空格放门；两比特门先点控制位，再点同一列的目标位；点已放的门删除它；点上方的步骤号查看那一步之后的状态。" });
    return h("section", { class: "qc-bench", "aria-label": "电路" }, pal, desc, h("div", { class: "qc-board-wrap" }, boardSVG(L)), st, how);
  }
  function boardSVG(L) {
    var n = L.n, cols = L.cols, cw = cols > 10 ? 46 : 56, rh = 60, lw = 74, top = 30, W = lw + cols * cw + 16, H = top + n * rh + 4, c, w;
    var svg = s("svg", { class: "qc-board", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": "电路板" });
    function cx(c) { return lw + c * cw + cw / 2; }
    function wy(w) { return top + w * rh + rh / 2; }
    var all = withLocks(L), measuredAt = {};
    all.forEach(function (o) { if (o.g === "M") { var q = o.q[0]; if (measuredAt[q] == null || o.col < measuredAt[q]) measuredAt[q] = o.col; } });
    for (c = 0; c < cols; c++) (function (c) {
      var g = s("g", { class: "qc-step" + (viewCol === c ? " on" : ""), tabindex: 0, role: "button", "data-fk": "step-" + c, "aria-label": "查看第 " + (c + 1) + " 步之后的状态" },
        s("rect", { x: cx(c) - 12, y: 5, width: 24, height: 19, rx: 4 }), s("text", { x: cx(c), y: 18.5, "text-anchor": "middle", text: String(c + 1) }));
      var act = function () { viewCol = viewCol === c ? null : c; render(); };
      g.addEventListener("click", act);
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      svg.appendChild(g);
    })(c);
    for (w = 0; w < n; w++) {
      var y = wy(w), mc = measuredAt[w], xEnd = W - 8;
      if (mc == null) svg.appendChild(line(lw - 6, y, xEnd, y, "var(--qc-wire)", 1.6));
      else { var xm = cx(mc); svg.appendChild(line(lw - 6, y, xm, y, "var(--qc-wire)", 1.6)); svg.appendChild(line(xm, y - 2.2, xEnd, y - 2.2, "var(--qc-wire)", 1.1)); svg.appendChild(line(xm, y + 2.2, xEnd, y + 2.2, "var(--qc-wire)", 1.1)); }
    }
    for (w = 0; w < n; w++) {
      var yy = wy(w), lab = L.initLabels[w];
      svg.appendChild(s("text", { x: 6, y: yy - 12, "font-size": 10, class: "qc-wname", text: wireName(L, w) }));
      var pairStart = lab === "Φ⁺" && L.initLabels[w + 1] === "Φ⁺", pairEnd = lab === "Φ⁺" && L.initLabels[w - 1] === "Φ⁺";
      if (pairStart) {
        var y2 = wy(w + 1), x0 = lw - 12;
        svg.appendChild(s("path", { d: "M" + (x0 + 5) + " " + yy + " H" + x0 + " V" + y2 + " H" + (x0 + 5), fill: "none", stroke: "var(--ink2)", "stroke-width": 1.3 }));
        svg.appendChild(s("text", { x: x0 - 5, y: (yy + y2) / 2 + 5, "text-anchor": "end", "font-size": 14, text: "Φ⁺" }));
      } else if (!pairEnd) svg.appendChild(s("text", { x: lw - 10, y: yy + 5, "text-anchor": "end", "font-size": 14, text: lab }));
    }
    if (viewCol != null) { var xv = lw + (viewCol + 1) * cw; svg.appendChild(line(xv, top - 2, xv, H - 2, "var(--accent)", 1.5, { "stroke-dasharray": "4 3" })); }
    for (c = 0; c < cols; c++) for (w = 0; w < n; w++) (function (c, w) {
      var occ = occupant(L, c, w), label = "第 " + (c + 1) + " 列，" + wireName(L, w) + (occ ? "，" + (occ.locked ? "黑盒" : GATES[occ.g].name + "，按下删除") : "，空");
      var r = s("rect", { class: "qc-cell", x: lw + c * cw + 2, y: top + w * rh + 3, width: cw - 4, height: rh - 6, rx: 7, tabindex: 0, role: "button", "aria-label": label, "data-fk": "cell-" + c + "-" + w });
      r.addEventListener("click", function () { clickCell(c, w); });
      r.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clickCell(c, w); } });
      svg.appendChild(r);
    })(c, w);
    all.forEach(function (o) { svg.appendChild(drawOp(o, cx, wy)); });
    if (pending) {
      svg.appendChild(s("rect", { x: cx(pending.col) - 21, y: wy(pending.w) - 21, width: 42, height: 42, rx: 9, fill: "none", stroke: "var(--accent)", "stroke-width": 2, "stroke-dasharray": "4 3", "pointer-events": "none" }));
      svg.appendChild(s("circle", { cx: cx(pending.col), cy: wy(pending.w), r: 5.5, fill: "var(--accent)", "pointer-events": "none" }));
    }
    return svg;
  }
  function drawOp(o, cx, wy) {
    var g = s("g", { "pointer-events": "none" }), x = cx(o.col), y, G;
    function box(y, w, hh) { w = w || 38; hh = hh || 38; return s("rect", { x: x - w / 2, y: y - hh / 2, width: w, height: hh, rx: 6, fill: "var(--qc-gate)", stroke: "var(--ink)", "stroke-width": 1.5 }); }
    if (o.g === "CNOT") {
      var yc = wy(o.q[0]), yt = wy(o.q[1]);
      g.appendChild(line(x, yc, x, yt, "var(--ink)", 1.8));
      g.appendChild(s("circle", { cx: x, cy: yc, r: 5.5, fill: "var(--ink)" }));
      g.appendChild(s("circle", { cx: x, cy: yt, r: 12, fill: "var(--qc-gate)", stroke: "var(--ink)", "stroke-width": 1.8 }));
      g.appendChild(line(x - 12, yt, x + 12, yt, "var(--ink)", 1.8)); g.appendChild(line(x, yt - 12, x, yt + 12, "var(--ink)", 1.8));
    } else if (o.g === "CZ") {
      var y1 = wy(o.q[0]), y2 = wy(o.q[1]);
      g.appendChild(line(x, y1, x, y2, "var(--ink)", 1.8));
      g.appendChild(s("circle", { cx: x, cy: y1, r: 5.5, fill: "var(--ink)" })); g.appendChild(s("circle", { cx: x, cy: y2, r: 5.5, fill: "var(--ink)" }));
    } else if (o.g === "M") {
      y = wy(o.q[0]); g.appendChild(box(y, 38, 34));
      g.appendChild(s("path", { d: "M" + (x - 12) + " " + (y + 8) + " A13 13 0 0 1 " + (x + 12) + " " + (y + 8), fill: "none", stroke: "var(--ink)", "stroke-width": 1.5 }));
      g.appendChild(line(x, y + 9, x + 8, y - 8, "var(--ink)", 1.5));
    } else if (o.g === "BOMB") {
      y = wy(o.q[0]);
      g.appendChild(s("circle", { cx: x - 2, cy: y + 4, r: 11, fill: "var(--ink)" }));
      g.appendChild(s("rect", { x: x + 3, y: y - 11, width: 7, height: 6, rx: 1, fill: "var(--ink)", transform: "rotate(40 " + (x + 6.5) + " " + (y - 8) + ")" }));
      g.appendChild(s("path", { d: "M" + (x + 8) + " " + (y - 12) + " q 4 -6 9 -4", fill: "none", stroke: "var(--ink2)", "stroke-width": 1.4 }));
      g.appendChild(s("circle", { cx: x + 17, cy: y - 16, r: 3, fill: "var(--accent)" }));
    } else if (o.g === "ORACLE") {
      var lo = Math.min.apply(null, o.q), hi = Math.max.apply(null, o.q), ya = wy(lo) - 22, yb = wy(hi) + 22, ym = (ya + yb) / 2;
      g.appendChild(s("rect", { x: x - 22, y: ya, width: 44, height: yb - ya, rx: 7, fill: "var(--qc-oracle)", stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "5 3" }));
      g.appendChild(s("text", { x: x - (o.sub ? 3 : 0), y: ym + 6, "text-anchor": "middle", "font-size": 17, "font-weight": 600, text: o.label }));
      if (o.sub) g.appendChild(s("text", { x: x + 7, y: ym + 11, "font-size": 10, text: o.sub }));
      g.appendChild(s("rect", { x: x + 9, y: ya + 6, width: 9, height: 7, rx: 1.5, fill: "var(--ink2)" }));
      g.appendChild(s("path", { d: "M" + (x + 10.8) + " " + (ya + 6) + " v-2 a2.7 2.7 0 0 1 5.4 0 v2", fill: "none", stroke: "var(--ink2)", "stroke-width": 1.2 }));
    } else {
      G = GATES[o.g]; y = wy(o.q[0]); g.appendChild(box(y));
      if (G.sub) { g.appendChild(s("text", { x: x - 6, y: y + 4, "text-anchor": "middle", "font-size": 15, "font-weight": 600, text: G.label })); g.appendChild(s("text", { x: x + 6, y: y + 9, "text-anchor": "middle", "font-size": 8.5, text: G.sub })); }
      else g.appendChild(s("text", { x: x, y: y + 5.5, "text-anchor": "middle", "font-size": 16, "font-weight": 600, text: G.label }));
    }
    return g;
  }

  /* ---------- 量子态 ---------- */
  function blochFig(v, label) {
    var S = 118, c = S / 2, R = 40;
    function P(x, y, z) { return [c + R * (-0.5 * x + 0.86 * y), c - R * (-0.28 * x - 0.1 * y + 0.95 * z)]; }
    var svg = s("svg", { width: S, height: S, viewBox: "0 0 " + S + " " + S, role: "img", "aria-label": label + " 的 Bloch 向量 (" + v.x.toFixed(2) + ", " + v.y.toFixed(2) + ", " + v.z.toFixed(2) + ")" });
    svg.appendChild(s("circle", { cx: c, cy: c, r: R, fill: "none", stroke: "var(--line)", "stroke-width": 1.2 }));
    var eq = [];
    for (var k = 0; k <= 48; k++) { var t = k / 48 * 2 * Math.PI; eq.push(P(Math.cos(t), Math.sin(t), 0).map(function (u) { return u.toFixed(1); }).join(",")); }
    svg.appendChild(s("polyline", { points: eq.join(" "), fill: "none", stroke: "var(--line)", "stroke-width": 1 }));
    [[1, 0, 0, "x"], [0, 1, 0, "y"], [0, 0, 1, ""]].forEach(function (a) {
      var p1 = P(-a[0], -a[1], -a[2]), p2 = P(a[0], a[1], a[2]);
      svg.appendChild(line(p1[0], p1[1], p2[0], p2[1], "var(--line)", 1, { "stroke-dasharray": "2 3" }));
      if (a[3]) { var pl = P(1.25 * a[0], 1.25 * a[1], 1.25 * a[2]); svg.appendChild(s("text", { x: pl[0], y: pl[1] + 3, "text-anchor": "middle", text: a[3] })); }
    });
    var pt = P(0, 0, 1), pb = P(0, 0, -1);
    svg.appendChild(s("text", { x: pt[0], y: pt[1] - 5, "text-anchor": "middle", text: "|0⟩" })); svg.appendChild(s("text", { x: pb[0], y: pb[1] + 13, "text-anchor": "middle", text: "|1⟩" }));
    var pv = P(v.x, v.y, v.z);
    svg.appendChild(line(c, c, pv[0], pv[1], "var(--accent)", 2.2, { "stroke-linecap": "round" })); svg.appendChild(s("circle", { cx: pv[0], cy: pv[1], r: 3.6, fill: "var(--accent)" }));
    var r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z), kind = v.tr === 0 ? "" : r > 0.995 ? "纯态" : r < 0.005 ? "最大混合" : "混合";
    return h("div", { class: "qc-bloch" }, svg, h("span", { text: label }), h("span", { text: "|r| = " + r.toFixed(2) + " " + kind }));
  }
  function stateCard(L) {
    var sc = L.scenarios[scen] || L.scenarios[0], st = QC.run(L, ops, sc, viewCol), n = L.n, total = 0;
    var where = viewCol == null ? "最终态" : "第 " + (viewCol + 1) + " 步之后";
    var head = h("h4", null, "状态", h("span", { class: "aside" }, where, viewCol != null ? [" · ", h("button", { class: "linkbtn", type: "button", "data-fk": "tofinal", onclick: function () { viewCol = null; render(); }, text: "看最终态" })] : null));
    var tabs = L.scenarios.length > 1 ? h("div", { class: "qc-seg", role: "group", "aria-label": "选择情形" }, L.scenarios.map(function (x, k) { return h("button", { type: "button", "aria-pressed": k === scen ? "true" : "false", "data-fk": "scen-" + k, onclick: function () { scen = k; render(); }, text: x.label }); })) : null;
    var grid = h("div", { class: "qc-amps" });
    st.forEach(function (a, i) {
      var p = Q.abs2(a), dim = p < 1e-9 ? " dim" : ""; total += p;
      grid.appendChild(h("span", { class: "k" + dim, text: QC.ket(n, i) }));
      grid.appendChild(h("span", { class: "bar" }, h("i", { style: { width: (100 * p).toFixed(2) + "%", background: phaseColor(Math.atan2(a[1], a[0])) } })));
      grid.appendChild(h("span", { class: "p" + dim, text: QC.pct(p) }));
      grid.appendChild(h("span", { class: "a" + dim, text: p < 1e-9 ? "0" : fmtAmp(a) }));
    });
    var legend = h("div", { class: "qc-legend" }, "条长 = 概率，颜色 = 振幅的相位：", [[0, "+1"], [Math.PI / 2, "+i"], [Math.PI, "−1"], [-Math.PI / 2, "−i"]].map(function (x) { return h("span", null, h("i", { style: { background: phaseColor(x[0]) } }), x[1]); }));
    var bl = h("div", { class: "qc-blochs" }); for (var q = 0; q < n; q++) bl.appendChild(blochFig(Q.bloch(st, n, q), wireName(L, q)));
    var notes = [];
    if (sc.bombLive) notes.push("真炸弹的情形：各结果的概率加起来，就是光子还没引爆炸弹的概率，现在是 " + QC.pct(total) + "。");
    if (L.gates && L.gates.indexOf("M") >= 0) notes.push("测量按延迟测量原理处理：这里显示的是测量之前的叠加态。测量过的比特之后只当控制位，所以结果与真的先测量完全相同。");
    if (n > 1) notes.push("Bloch 球画的是单个比特的约化态。与别的比特纠缠时，向量会缩进球里。");
    return h("section", { class: "qc-card", "aria-label": "量子态" }, head, tabs, grid, legend, bl, notes.map(function (t) { return h("p", { class: "note", text: t }); }));
  }

  /* ---------- 检验 ---------- */
  /** 去对应的量子玩法：把这一关的设定带过去 */
  function goGame(L) {
    if (L.id === "bomb") {
      var N = Math.max(1, ops.filter(function (o) { return o.g === "BOMB"; }).length);
      A.applySetup({ world: "q_bomb", std: true, resetW: true, wp: { eps: 0 }, strat: "bomb_zeno", resetS: true, sp: { N: N }, note: "你的电路里有 " + N + " 颗炸弹：已经换成\"量子芝诺：分 N 步转\"，N = " + N + "，光路设成完美的。把丢光子的概率调上去试试。" });
    } else if (L.id === "grover") {
      A.applySetup({ world: "q_search", std: true, resetW: true, wp: { n: 2, M: 1, mk: "known", eps: 0, T: 16 }, strat: "srch_full", resetS: true, note: "四个盒子、一个奖品：转一步就测中。把量子比特数调大，看看要转几步。" });
    } else if (L.id === "chsh") {
      var sp = QC.chshToDeg(chsh.q);
      A.applySetup({ world: "q_bell", std: true, resetW: true, strat: "bell_q", resetS: true, sp: sp, note: "你拨的四个角度（" + [sp.a0, sp.a1, sp.b0, sp.b1].map(function (x) { return (x < 0 ? "−" : "") + String(+Math.abs(x).toFixed(2)) + "°"; }).join("、") + "）已经交给\"纠缠光子 · 四个角度\"：一局 200 回合，跑 2000 局。" });
    } else A.applySetup({ world: L.game, strat: QL.WORLDS[L.game].defStrat });
  }
  var GO_LABEL = { bomb: "去 ⑰ 炸弹检测：让规则一次测几千颗", grover: "去 ⑯ 量子搜索：盒子多到一百万个时怎么办", chsh: "把这组角度交给 ⑮ Bell 游戏里的规则", bell: "去 ⑮ Bell 游戏：两人各拿一个这样的光子" };
  function verdictCard(L) {
    var card = h("section", { class: "qc-card qc-verdict", "data-has": result ? "1" : "0" }, h("h4", { text: "检验" }));
    if (!result) {
      card.appendChild(h("p", { class: "note", text: L.type === "chsh" ? "调好四个角度之后点\"检验\"。" : "摆好电路之后点\"检验\"。判定会把\"状态\"里列出的每一种情形都跑一遍。" }));
      if (L.ref) card.appendChild(h("div", { class: "qc-meta", text: "已用 " + ops.length + " 个门 · 参考解 " + L.ref + " 个门" }));
      if (save.stars[cur]) card.appendChild(h("div", { class: "qc-meta" }, "最好成绩 ", starsEl(save.stars[cur])));
      return card;
    }
    var r = result;
    card.appendChild(h("div", { class: "qc-headline", "aria-live": "polite" }, h("strong", { class: r.pass ? "pass" : "fail", text: r.pass ? "通过" : "还没成功" }), r.pass ? starsEl(r.stars) : null));
    if (r.note) card.appendChild(h("p", { class: "note qc-warn", text: r.note }));
    if (r.rows.length) card.appendChild(h("div", { class: "qc-rows" }, r.rows.map(function (x) {
      return h("div", { class: "qc-row" }, h("span", { class: "ic " + (x.ok === true ? "ok" : x.ok === false ? "no" : "na"), text: x.ok === true ? "✓" : x.ok === false ? "✗" : "·" }), h("span", { text: x.label }), h("span", { class: "v", text: x.value }));
    })));
    if (r.pass && L.ref) card.appendChild(h("div", { class: "qc-meta", text: r.count < L.ref ? "用了 " + r.count + " 个门，比参考解（" + L.ref + " 个）还少。" : "用了 " + r.count + " 个门 · 参考解 " + L.ref + " 个门" + (r.stars < 3 ? " · 再精简一些可以拿三星" : "") }));
    if (r.pass && L.type === "bomb" && r.stars < 3) card.appendChild(h("div", { class: "qc-meta", text: "想拿三星，看看提示 2。" }));
    if (r.pass && L.type === "chsh" && r.stars < 3) card.appendChild(h("div", { class: "qc-meta", text: "离量子力学的上限还有距离，看看提示 2。" }));
    if (r.pass) {
      card.appendChild(h("div", { class: "qc-explain" }, h("b", { text: "原理" }), L.explain));
      var acts = h("div", { class: "row tight" });
      if (L.game) acts.appendChild(h("button", { class: "btn small", type: "button", id: "qcGo", "data-fk": "go", onclick: closeThen(function () { goGame(L); }), text: GO_LABEL[L.id] || "去对应的玩法" }));
      if (cur < LV.length - 1) acts.appendChild(h("button", { class: "btn small primary", type: "button", "data-fk": "next", onclick: function () { loadLevel(cur + 1); }, text: "下一关：" + LV[cur + 1].title }));
      else card.appendChild(h("p", { class: "note", text: "十关全部完成。" }));
      card.appendChild(acts);
    }
    return card;
  }

  /* ---------- 第十关 ---------- */
  function persistChsh() { save.chsh = { cl: chsh.cl, q: chsh.q }; persist(); }
  function winsTable(cells, f, cls) {
    return h("table", { class: "qc-wins" },
      h("thead", null, h("tr", null, h("th", { text: "x \\ y" }), h("th", { text: "y = 0" }), h("th", { text: "y = 1" }))),
      h("tbody", null, [0, 1].map(function (x) { return h("tr", null, h("th", { text: "x = " + x }), [0, 1].map(function (y) { return h("td", { class: cls(cells[x][y]), text: f(cells[x][y]) }); })); })));
  }
  function chshClassicalCard() {
    var cl = QC.chshClassical(chsh.cl);
    function bit(key) { return h("div", { class: "qc-seg", role: "group" }, [0, 1].map(function (b) { return h("button", { type: "button", "aria-pressed": chsh.cl[key] === b ? "true" : "false", "data-fk": "cl-" + key + b, onclick: function () { chsh.cl[key] = b; persistChsh(); render(); }, text: String(b) }); })); }
    var pick = h("div", { class: "qc-pick" }, h("span"), h("span", { class: "who", text: "收到 0 时答" }), h("span", { class: "who", text: "收到 1 时答" }), h("span", { text: "Alice" }), bit("a0"), bit("a1"), h("span", { text: "Bob" }), bit("b0"), bit("b1"));
    return h("section", { class: "qc-card a-cl", "aria-label": "经典的答法" },
      h("h4", null, "第一步 · 经典的答法", h("span", { class: "aside mono", text: "胜率 " + QC.pct(cl.tot) })),
      pick,
      winsTable(cl.cells, function (v) { return v ? "赢" : "输"; }, function (v) { return v ? "ok" : "no"; }),
      h("p", { class: "note", text: "16 张确定的答法表里，最好的也只赢 3 格，即 75%。事先共享随机数，只是在这些答法表之间抽签，平均不会更高。" }));
  }
  function angleDiagram(k) {
    var S = 200, c = S / 2, R = 62, svg = s("svg", { width: S, height: S, viewBox: "0 0 " + S + " " + S, role: "img", "aria-label": "四个测量方向" });
    svg.appendChild(s("circle", { cx: c, cy: c, r: R, fill: "none", stroke: "var(--line)", "stroke-width": 1.2 }));
    svg.appendChild(line(c - R, c, c + R, c, "var(--line)", 1, { "stroke-dasharray": "2 3" })); svg.appendChild(line(c, c - R, c, c + R, "var(--line)", 1, { "stroke-dasharray": "2 3" }));
    function t(x, y, str, anchor) { return s("text", { x: x, y: y, "text-anchor": anchor || "middle", "font-size": 10, class: "qc-wname", text: str }); }
    svg.appendChild(t(c, c - R - 6, "|0⟩")); svg.appendChild(t(c, c + R + 14, "|1⟩")); svg.appendChild(t(c + R + 5, c + 4, "|+⟩", "start")); svg.appendChild(t(c - R - 5, c + 4, "|−⟩", "end"));
    [["a0", "α₀", "var(--accent)", null, R - 13], ["a1", "α₁", "var(--accent)", null, R - 13], ["b0", "β₀", "var(--ink)", "5 4", R - 30], ["b1", "β₁", "var(--ink)", "5 4", R - 30]].forEach(function (x) {
      var th = k[x[0]] * QC.UNIT, dx = Math.sin(2 * th), dy = -Math.cos(2 * th), col = x[2], dash = x[3] || "", lr = x[4];
      svg.appendChild(line(c - R * dx, c - R * dy, c, c, col, 1, { "stroke-opacity": 0.35, "stroke-dasharray": dash }));
      svg.appendChild(line(c, c, c + R * dx, c + R * dy, col, 2, { "stroke-dasharray": dash }));
      svg.appendChild(s("circle", { cx: c + R * dx, cy: c + R * dy, r: 3, fill: col }));
      svg.appendChild(s("text", { x: c + lr * dx - 9 * dy, y: c + lr * dy + 9 * dx + 4, "text-anchor": "middle", "font-size": 11, fill: col, class: "mono", text: x[1] }));
    });
    return svg;
  }
  function sampleRounds(k, N) {
    var r = QC.chshQuantum(k), w = 0;
    for (var i = 0; i < N; i++) {
      var x = Math.random() < 0.5 ? 0 : 1, y = Math.random() < 0.5 ? 0 : 1, P = r.joint[x][y], u = Math.random(), idx = 0;
      while (idx < 3 && u > P[idx]) { u -= P[idx]; idx++; }
      if (((idx >> 1) ^ (idx & 1)) === (x & y)) w++;
    }
    return w;
  }
  function chshQuantumCard() {
    var outs = {}, sliders = h("div", { class: "qc-sliders" });
    [["a0", "α₀ · Alice 收到 0"], ["a1", "α₁ · Alice 收到 1"], ["b0", "β₀ · Bob 收到 0"], ["b1", "β₁ · Bob 收到 1"]].forEach(function (x) {
      var k = x[0], id = "qcAng-" + k;
      var inp = h("input", { type: "range", id: id, min: -8, max: 8, step: 1, value: chsh.q[k], "data-fk": id, "aria-valuetext": piFrac(chsh.q[k]) + "（" + degOf(chsh.q[k]) + "）" });
      var out = h("output", { for: id, text: piFrac(chsh.q[k]) });
      inp.addEventListener("input", function () {
        chsh.q[k] = int8(inp.value); chsh.sample = null;
        inp.setAttribute("aria-valuetext", piFrac(chsh.q[k]) + "（" + degOf(chsh.q[k]) + "）");
        persistChsh();
        var had = result != null; result = null; update(had);
      });
      outs[k] = out;
      sliders.appendChild(h("label", { for: id, text: x[1] })); sliders.appendChild(inp); sliders.appendChild(out);
    });
    var diagramBox = h("div"), tableBox = h("div"), big = h("div", { class: "qc-big" }), fill = h("div", { class: "fill" }), tsi = 100 * Math.pow(Math.cos(Math.PI / 8), 2);
    var gauge = h("div", { class: "qc-gauge", role: "img" }, h("div", { class: "track" }), fill, h("div", { class: "mk", style: { left: "75%" } }), h("div", { class: "mk ts", style: { left: tsi.toFixed(2) + "%" } }));
    var legend = h("div", { class: "qc-legend" }, h("span", null, h("i", { style: { background: "var(--ink2)" } }), "经典的上限 75%"), h("span", null, h("i", { style: { background: "var(--accent)" } }), "Tsirelson 界 85.36%"));
    var sampleOut = h("span", { class: "qc-meta" });
    var degLine = h("p", { class: "note" });
    var bottom = h("div", { class: "qc-duo" },
      h("button", { class: "btn small", type: "button", "data-fk": "sample", onclick: function () { chsh.sample = sampleRounds(chsh.q, 1000); update(false); }, text: "模拟 1000 轮" }),
      sampleOut, h("span", { class: "qc-spacer" }),
      h("button", { class: "btn small primary", type: "button", "data-fk": "check", id: "qcCheck", onclick: doCheck, text: "检验" }));
    function update(refreshVerdict) {
      var r = QC.chshQuantum(chsh.q);
      Object.keys(outs).forEach(function (k) { outs[k].textContent = piFrac(chsh.q[k]); });
      clear(diagramBox).appendChild(angleDiagram(chsh.q));
      clear(tableBox).appendChild(winsTable(r.cells, function (v) { return QC.pct(v); }, function (v) { return v >= 0.8 ? "ok" : v < 0.5 ? "no" : ""; }));
      big.textContent = pct2(r.tot);
      fill.style.width = (100 * r.tot).toFixed(2) + "%";
      gauge.setAttribute("aria-label", "量子的做法的胜率 " + pct2(r.tot));
      sampleOut.textContent = chsh.sample == null ? "" : "1000 轮里赢了 " + chsh.sample + " 轮";
      degLine.textContent = "换成偏振片的角度：α₀ = " + degOf(chsh.q.a0) + "，α₁ = " + degOf(chsh.q.a1) + "，β₀ = " + degOf(chsh.q.b0) + "，β₁ = " + degOf(chsh.q.b1) + "。";
      if (refreshVerdict) { var v = root && root.querySelector(".qc-verdict"); if (v) { var nv = verdictCard(LV[cur]); nv.classList.add("a-vd"); v.parentNode.replaceChild(nv, v); } }
    }
    update(false);
    return h("section", { class: "qc-card a-qu", "aria-label": "量子的做法" },
      h("h4", null, "第二步 · 共享 |Φ⁺⟩", h("span", { class: "aside", text: "角度以 π/16 为一格" })),
      sliders,
      h("div", { class: "qc-duo" }, diagramBox, h("div", { class: "qc-col" }, h("div", { class: "qc-meta", text: "每一格的获胜概率" }), tableBox)),
      h("p", { class: "note", text: "图是 Bloch 球的 x–z 截面。沿角度 θ 测量，对应球面上从 |0⟩ 转过 2θ 的方向；实线是 Alice 的两个设置，虚线是 Bob 的。" }),
      degLine,
      h("div", null, h("div", { class: "qc-meta", text: "量子的做法的胜率" }), big, gauge, legend),
      bottom);
  }
  function chshResult() {
    var p = QC.chshQuantum(chsh.q).tot, stars = QC.chshStars(p);
    return {
      pass: stars > 0, stars: stars,
      rows: [{ label: "量子的做法的胜率", value: pct2(p), ok: p > 0.75 + 1e-9 }, { label: "经典的做法的上限", value: "75.00%", ok: null }, { label: "Tsirelson 界 cos²(π/8)", value: "85.36%", ok: null }],
      note: stars ? "" : "还没有超过经典的上限 75%。"
    };
  }

  /* ---------- 整个面板 ---------- */
  function tally() { var sum = 0, done = 0; save.stars.forEach(function (x) { sum += x; if (x > 0) done++; }); return { sum: sum, done: done }; }
  function render() {
    if (!root) return;
    var fk = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-fk");
    var t = tally(), L = LV[cur];
    clear(root.querySelector(".qc-tally")).appendChild(h("span", null, "通过 ", h("b", { text: String(t.done) }), " / 10 关 · ★ ", h("b", { text: String(t.sum) }), " / 30"));
    var nav = clear(root.querySelector(".qc-levels"));
    LV.forEach(function (x, i) {
      nav.appendChild(h("button", { class: "qc-lv", type: "button", "aria-current": i === cur ? "true" : "false", "data-fk": "lv-" + i, "aria-label": "第 " + (i + 1) + " 关：" + x.title + "，" + save.stars[i] + " 星", onclick: function () { loadLevel(i); } },
        h("span", { class: "num", text: pad2(i + 1) }), h("span", { class: "name", text: x.title }), starsEl(save.stars[i], "st")));
    });
    var main = clear(root.querySelector(".qc-main"));
    if (L.type === "chsh") {
      var vd = verdictCard(L); vd.classList.add("a-vd");
      main.appendChild(brief(L)); main.appendChild(h("div", { class: "qc-chsh" }, chshClassicalCard(), chshQuantumCard(), vd));
    } else {
      main.appendChild(brief(L)); main.appendChild(bench(L)); main.appendChild(h("div", { class: "qc-lower" }, stateCard(L), verdictCard(L)));
    }
    if (fk) { var el = root.querySelector('[data-fk="' + fk + '"]'); if (el && el.focus) try { el.focus({ preventScroll: true }); } catch (e) {} }
  }
  function firstOpen() { for (var i = 0; i < save.stars.length; i++) if (!save.stars[i]) return i; return 0; }
  /** 打开面板。lv：关卡的编号（0–9）或 id（"bomb"、"grover"、"chsh"……）；不给就到第一个还没通过的关 */
  A.openQuantum = function (lv) {
    var i = typeof lv === "string" ? QC.BYID[lv] : lv;
    if (!(i >= 0 && i < LV.length)) i = firstOpen();
    if (ui && root) { loadLevel(i); return ui; }                       // 面板已经开着：换到那一关，不再叠一层
    root = h("div", { class: "qc" },
      h("div", { class: "qc-top" }, h("p", { class: "qc-lead", text: "十关，从叠加到 Bell 不等式。点格子放门，看振幅和 Bloch 球怎么变，再点\"检验\"。炸弹、四选一、打破 75% 这三关做完，可以去对应的量子玩法里让规则跑几千局。" }), h("div", { class: "qc-tally" })),
      h("div", { class: "qc-shell" }, h("nav", { class: "qc-levels", "aria-label": "关卡" }), h("div", { class: "qc-main" })));
    ui = A.modal("量子电路谜题", root, { cls: "qcm", focus: ".qc-lv[aria-current=true]", onClose: function () { ui = null; root = null; } });
    loadLevel(i);
    return ui;
  };
  A.quantumProgress = tally;

  /* ---------- 大厅里的一张卡片（地址里写 #quantum 也能直接打开） ---------- */
  if (A.lobbyAdd) A.lobbyAdd({
    id: "qcircuit", order: 60, route: "quantum", kicker: "一个人玩 · 量子", title: "量子电路谜题",
    label: function () { return tally().done ? "接着玩" : "开始"; }, keys: "quantum circuit 量子 电路 谜题 量子比特 纠缠 叠加 Bell Grover 炸弹 隐形传态",
    blurb: "十关：相对相位、换基、纠缠、三次异或、Deutsch 算法、不碰炸弹、四选一、超密编码、隐形传态、打破 75%。和三套量子玩法用的是同一个模拟器。",
    status: function () { var t = tally(); return t.done ? "通过 " + t.done + " / 10 关，★ " + t.sum + " / 30" : ""; },
    go: function (arg) { A.openQuantum(arg && QC.BYID[arg] != null ? arg : undefined); }
  });
})(App);
