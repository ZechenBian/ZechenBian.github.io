// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The figures you can play with at the top of each written unit, and the two static diagrams.
 * Each widget is one phenomenon to find by hand before the notes name it:
 *   hinge       (week 1)  fitting a curve with three ReLU hinges is choosing six numbers; a rule can choose them for you
 *   codelen     (week 2)  a letter costs −log₂ q bits; the shortest message comes from the true frequencies, and
 *                         a letter the model thinks rare is expensive
 *   ballmin     (week 3)  minimize a quadratic loss inside a disk or a diamond: the diamond's minimum keeps landing on
 *                         a corner, where a coordinate is exactly 0
 *   shiftconv   (week 5)  slide a shape: a convolution's output slides with it, a dense layer's does not; the maximum
 *                         over positions does not move at all
 *   bptt        (week 6)  feed one number back into itself 60 times: the gradient through time shrinks or saturates
 *                         for almost every weight; an additive path keeps it
 *   isoflop     (week 8)  a fixed compute budget C = 6ND: find the model size with the lowest loss, and where GPT-3 sat
 *   elbo        (week 9)  choose an approximate posterior q: the evidence lower bound never exceeds log p(x), and
 *                         the gap closes exactly when q is the posterior
 *   gdquad      (week 4)  the stiff direction caps the step size, the soft direction then crawls; momentum helps
 *   softlookup  (week 7)  attention is a lookup made soft: sharp scores pick one value, flat scores average all of them
 * A widget is a function (host) -> { destroy }. Nothing here is saved; these are sketches, the experiments are the measurements. */
(function () {
  "use strict";
  var h = DL.h;
  function cssv(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function pal() {
    var s = []; for (var i = 1; i <= 8; i++) s.push(cssv("--c-s" + i));
    return { ink: cssv("--ink"), ink2: cssv("--ink-2"), rule: cssv("--rule"), grid: cssv("--c-grid"), axis: cssv("--c-axis"), surface: cssv("--surface"), accent: cssv("--accent"), neutral: cssv("--c-neutral"), crit: cssv("--c-crit"), good: cssv("--c-good"), s: s, font: cssv("--f-ui") || "sans-serif", mono: cssv("--f-mono") || "monospace" };
  }
  /** Size a canvas for the device pixel ratio; returns the context and the size in CSS pixels */
  function fit(cv, H) {
    var W = Math.max(220, Math.floor(cv.clientWidth)), dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    cv.style.height = H + "px";
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }
  /** Redraw when the canvas is resized or the colour scheme changes */
  function watch(el, draw) {
    var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null; if (ro) ro.observe(el);
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null, on = function () { draw(); };
    if (mq && mq.addEventListener) mq.addEventListener("change", on);
    var mo = new MutationObserver(on); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return function () { if (ro) ro.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener("change", on); mo.disconnect(); };
  }
  function slider(label, min, max, step, value, fmt, oninput) {
    var out = h("b", { text: fmt(value) });
    var inp = h("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(value), "aria-label": label });
    inp.addEventListener("input", function () { out.textContent = fmt(+inp.value); oninput(+inp.value); });
    return { el: h("label", {}, [h("span", {}, [label, out]), inp]), get: function () { return +inp.value; }, set: function (v) { inp.value = String(v); out.textContent = fmt(+inp.value); } };
  }
  function line(ctx, pts) { ctx.beginPath(); for (var i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]); } ctx.stroke(); }
  function arrow(ctx, x0, y0, x1, y1, head) {
    var a = Math.atan2(y1 - y0, x1 - x0); head = head || 8;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - head * Math.cos(a - 0.4), y1 - head * Math.sin(a - 0.4)); ctx.lineTo(x1 - head * Math.cos(a + 0.4), y1 - head * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  function sci(v) { return v === 0 ? "0" : (v >= 0.001 && v < 1000 ? String(+v.toPrecision(3)) : v.toExponential(1).replace("e+", "e")); }
  function reveal(title, src) { var d = h("details", { class: "w-reveal" }, [h("summary", { text: title })]); d.appendChild(DL.md(src)); return d; }

  DL.WIDGETS = {};

  /* ================= week 1: three hinges ================= */
  var HINGE = DL.hingeMath = (function () {
    var M = 201, xs = [], tg = [], i;
    for (i = 0; i < M; i++) { xs.push(-1 + 2 * i / (M - 1)); tg.push(Math.max(0, 1 - 2 * Math.abs(xs[i]))); }
    function f(p, x) { var s = 0; for (var j = 0; j < 3; j++) if (x > p[j]) s += p[3 + j] * (x - p[j]); return s; }
    function loss(p) { var s = 0; for (var m = 0; m < M; m++) { var r = f(p, xs[m]) - tg[m]; s += r * r; } return s / M; }
    function grad(p) {
      var g = [0, 0, 0, 0, 0, 0];
      for (var m = 0; m < M; m++) { var x = xs[m], r = 2 * (f(p, x) - tg[m]) / M; for (var j = 0; j < 3; j++) if (x > p[j]) { g[3 + j] += r * (x - p[j]); g[j] -= r * p[3 + j]; } }
      return g;
    }
    /** One step of gradient descent; the step size is halved whenever the loss would go up, and grows slowly otherwise */
    function step(st) {
      var g = grad(st.p), gn = Math.sqrt(g.reduce(function (a, b) { return a + b * b; }, 0)), q, Lq;
      if (gn < 1e-7) { st.done = "flat"; return st; }
      for (;;) { q = st.p.map(function (v, k) { return v - st.lr * g[k]; }); Lq = loss(q); if (Lq <= st.L || st.lr < 1e-9) break; st.lr /= 2; }
      if (st.lr < 1e-9) { st.done = "flat"; return st; }
      st.p = q; st.L = Lq; st.lr = Math.min(st.lr * 1.1, 0.5); st.n++;
      if (st.L < 1e-6) st.done = "fit";
      return st;
    }
    return { xs: xs, target: tg, f: f, loss: loss, grad: grad, step: step };
  })();

  DL.WIDGETS.hinge = function (host) {
    var START = [-0.8, -0.1, 0.55, 1, -1, 1], p = START.slice(), run = null, nsteps = 0, trace = [], note = "";
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "Target hat and the sum of three hinges" });
    var read = h("div", { class: "w-read" }), msg = h("div", { class: "w-read" });
    var COL = [0, 1, 3], sl = [], geo = null, drag = -1;
    function setP(k, v) { stop(); p[k] = v; note = ""; draw(); }
    // the kinks can be dragged sideways on the picture; a vertical swipe still scrolls the page
    cv.style.touchAction = "pan-y";
    function near(e, reach) {
      if (!geo) return -1;
      var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = -1, bd = reach || 20;
      for (var j = 0; j < 3; j++) { var d = Math.hypot(mx - geo.sx(p[j]), my - geo.sy(HINGE.f(p, p[j]))); if (d < bd) { bd = d; best = j; } }
      return best;
    }
    var TOUCH = 40;      // a finger is wider than a pointer: a touch within 40 px of a dot takes it
    cv.addEventListener("pointerdown", function (e) { var j = near(e, e.pointerType === "touch" ? TOUCH : 20); if (j < 0) return; drag = j; try { cv.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
    // a touch that starts on a dot is a drag of that dot, also when the finger moves diagonally: the page must not scroll under it
    cv.addEventListener("touchstart", function (e) { var t = e.touches && e.touches[0]; if (t && near(t, TOUCH) >= 0) e.preventDefault(); }, { passive: false });
    cv.addEventListener("pointermove", function (e) {
      if (drag < 0) { cv.style.cursor = near(e) >= 0 ? "ew-resize" : ""; return; }
      var r = cv.getBoundingClientRect(), x = (e.clientX - r.left - geo.x0) / (geo.x1 - geo.x0) * 2 - 1;
      x = Math.round(Math.max(-1, Math.min(1, x)) * 100) / 100;
      if (x !== p[drag]) { setP(drag, x); sl[drag].set(x); }
    });
    function endDrag() { drag = -1; }
    cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
    for (var j = 0; j < 3; j++) (function (j) {
      sl[j] = slider("Hinge " + (j + 1) + " · kink at x = ", -1, 1, 0.01, p[j], function (v) { return v.toFixed(2); }, function (v) { setP(j, v); });
      sl[3 + j] = slider("Hinge " + (j + 1) + " · bend ", -5, 5, 0.05, p[3 + j], function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2); }, function (v) { setP(3 + j, v); });
    })(j);
    var go = h("button", { class: "btn small", text: "Let gradient descent finish", onclick: function () { if (run) stop(); else start(); } });
    var reset = h("button", { class: "btn quiet small", text: "Reset", onclick: function () { stop(); p = START.slice(); nsteps = 0; trace = []; note = ""; sync(); draw(); } });
    function sync() { for (var k = 0; k < 6; k++) sl[k].set(p[k]); }
    function stop() { if (run) { cancelAnimationFrame(run.raf); run = null; go.textContent = "Let gradient descent finish"; } }
    function start() {
      var st = { p: p.slice(), L: HINGE.loss(p), lr: 0.05, n: 0, done: null }, frame = 0;
      trace = [st.L]; nsteps = 0; note = ""; go.textContent = "Stop";
      run = { raf: 0 };
      (function tick() {
        // single steps for the first half second, so that the first moves can be seen; then faster and faster
        var batch = frame < 30 ? 1 : Math.min(400, Math.ceil(Math.pow(1.07, frame - 30))); frame++;
        for (var k = 0; k < batch && !st.done && st.n < 40000; k++) { HINGE.step(st); if (st.n % 20 === 0) trace.push(st.L); }
        p = st.p.slice(); nsteps = st.n; sync();
        if (st.done || st.n >= 40000) {
          run = null; go.textContent = "Let gradient descent finish";
          note = st.L < 1e-5 ? "Gradient descent found the hat in " + st.n.toLocaleString("en-US") + " steps."
            : "Gradient descent stopped at loss " + sci(st.L) + ": the slope of the loss is zero here, but the fit is not exact. Move a kink and press the button again.";
          draw(); return;
        }
        draw(); run.raf = requestAnimationFrame(tick);
      })();
    }
    function draw() {
      var c = fit(cv, Math.max(190, Math.min(300, cv.clientWidth * 0.42))), ctx = c.ctx, W = c.W, H = c.H, P = pal();
      var x0 = 34, x1 = W - 10, y0 = 10, y1 = H - 22, YLO = -0.6, YHI = 1.5;
      function sx(x) { return x0 + (x + 1) / 2 * (x1 - x0); }
      function sy(y) { return y1 - (Math.max(YLO - 1, Math.min(YHI + 1, y)) - YLO) / (YHI - YLO) * (y1 - y0); }
      geo = { x0: x0, x1: x1, sx: sx, sy: function (y) { return Math.max(y0, Math.min(y1, sy(y))); } };
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, H);
      ctx.font = "11px " + P.font; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
      [-0.5, 0, 0.5, 1, 1.5].forEach(function (y) { ctx.strokeStyle = y === 0 ? P.axis : P.grid; line(ctx, [[x0, Math.round(sy(y)) + 0.5], [x1, Math.round(sy(y)) + 0.5]]); ctx.fillStyle = P.ink2; ctx.textAlign = "right"; ctx.fillText(String(y), x0 - 6, sy(y)); });
      [-1, -0.5, 0, 0.5, 1].forEach(function (x) { ctx.strokeStyle = P.grid; line(ctx, [[Math.round(sx(x)) + 0.5, y0], [Math.round(sx(x)) + 0.5, y1]]); ctx.fillStyle = P.ink2; ctx.textAlign = "center"; ctx.fillText(String(x), sx(x), y1 + 12); });
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      ctx.lineJoin = "round"; ctx.strokeStyle = P.neutral; ctx.lineWidth = 6; ctx.globalAlpha = 0.55;
      line(ctx, HINGE.xs.map(function (x, i) { return [sx(x), sy(HINGE.target[i])]; })); ctx.globalAlpha = 1;
      ctx.strokeStyle = P.s[0]; ctx.lineWidth = 2.5; line(ctx, HINGE.xs.map(function (x) { return [sx(x), sy(HINGE.f(p, x))]; }));
      for (var j = 0; j < 3; j++) {
        var kx = sx(p[j]), ky = sy(HINGE.f(p, p[j]));
        ctx.strokeStyle = P.s[COL[j] + 1]; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); line(ctx, [[kx, y0], [kx, y1]]); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(kx, ky, 6.5, 0, 6.2832); ctx.fillStyle = P.surface; ctx.fill(); ctx.beginPath(); ctx.arc(kx, ky, 4.5, 0, 6.2832); ctx.fillStyle = P.s[COL[j] + 1]; ctx.fill();
        ctx.fillStyle = P.ink2; ctx.textAlign = "center"; ctx.fillText(String(j + 1), kx, y0 + 8);
      }
      ctx.restore();
      var L = HINGE.loss(p);
      DL.clear(read);
      DL.add(read, [h("span", {}, ["loss (mean squared error) ", h("b", { text: sci(L) })]), h("span", {}, ["goal ", h("b", { text: "below 0.001" + (L < 1e-3 ? " ✓" : "") })]), nsteps ? h("span", {}, ["gradient descent steps ", h("b", { text: nsteps.toLocaleString("en-US") })]) : null]);
      msg.textContent = note; msg.hidden = !note;
    }
    var legend = h("div", { class: "w-read" }, [h("span", {}, [h("i", { class: "qc-key", style: "--k:var(--c-neutral);height:5px;margin-right:6px;vertical-align:middle" }), "target"]), h("span", {}, [h("i", { class: "qc-key", style: "--k:var(--c-s1);margin-right:6px;vertical-align:middle" }), "sum of your three hinges"]), h("span", { text: "dots: the kinks (drag them sideways)" })]);
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "Fit the hat with three hinges" })]),
      h("p", { class: "w-task", text: "A hinge is flat to the left of its kink and a straight line to the right of it; its bend is the slope of that line. The blue curve is the sum of three hinges. Choose the six numbers so that it matches the grey hat: drag the dots or use the sliders. Try by hand first, then let a rule do it." }),
      legend, cv, read, msg,
      h("div", { class: "w-ctl" }, sl.map(function (s) { return s.el; })),
      h("div", { class: "w-row" }, [go, reset]),
      reveal("What you just did", "- You chose six numbers so that a formula matches a curve. Training a neural network is the same task with more numbers.\n- One hinge is $v\\,\\mathrm{ReLU}(x - k)$: one unit of a one-hidden-layer ReLU network. The exact answer here is kinks at $-\\tfrac12, 0, \\tfrac12$ with bends $2, -4, 2$.\n- The button did by rule what your hand did by eye: nudge every number in the direction that lowers the loss fastest, and repeat. That is gradient descent (section 5). Getting that direction cheaply for millions of numbers is backpropagation (section 6).\n- From some starting positions the rule stalls at a loss that is not zero. Try kinks at $0.2, 0.4, 0.6$ with bends $+1$. The loss is not convex in the six numbers (section 4), and a hinge whose kink is pushed past the right end of the data no longer feels the data at all.")
    ]);
    var unwatch = watch(cv, draw); draw();
    return { destroy: function () { stop(); unwatch(); } };
  };

  /* ================= week 2: what a message costs under a model ================= */
  /** Three sources of four letters; each message has exactly the source's frequencies (40 letters), in a fixed order. */
  DL.CODE_SOURCES = [
    { name: "Four letters, unequal", p: [0.5, 0.25, 0.125, 0.125] },
    { name: "One letter dominates", p: [0.7, 0.1, 0.1, 0.1] },
    { name: "All four equally likely", p: [0.25, 0.25, 0.25, 0.25] }];
  DL.codeMessage = function (p) {
    var m = [], s = 7, i, j, t;
    p.forEach(function (pi, k) { for (i = 0; i < Math.round(pi * 40); i++) m.push(k); });
    for (i = m.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; j = s % (i + 1); t = m[i]; m[i] = m[j]; m[j] = t; }
    return m;
  };
  /** Bits for a message under the model q: the sum of −log₂ q(letter) */
  DL.codeCost = function (msg, q) { return msg.reduce(function (a, x) { return a + -Math.log(q[x]) / Math.LN2; }, 0); };
  DL.WIDGETS.codelen = function (host) {
    var L = ["A", "B", "C", "D"], src = 0, msg = DL.codeMessage(DL.CODE_SOURCES[0].p), q = [0.25, 0.25, 0.25, 0.25], best = [null, null, null], drag = -1, QMIN = 0.002;
    var bars = h("canvas", { class: "w-canvas", role: "img", "aria-label": "The model's probability for each letter; drag a bar to change it" });
    var strip = h("canvas", { class: "w-canvas", role: "img", "aria-label": "The message laid out at its cost: each letter is as wide as the bits it costs" });
    var read = h("div", { class: "w-read" });
    function lg2(v) { return Math.log(v) / Math.LN2; }
    function H(p) { return p.reduce(function (a, v) { return a - (v > 0 ? v * lg2(v) : 0); }, 0); }
    /** Set q[i] = v and rescale the others in proportion so that the four still add up to 1 */
    function setQ(i, v) {
      v = Math.max(QMIN, Math.min(1 - 3 * QMIN, v));
      var rest = 0, k; for (k = 0; k < 4; k++) if (k !== i) rest += q[k];
      for (k = 0; k < 4; k++) if (k !== i) q[k] = Math.max(QMIN, rest > 0 ? q[k] * (1 - v) / rest : (1 - v) / 3);
      rest = 0; for (k = 0; k < 4; k++) if (k !== i) rest += q[k];
      for (k = 0; k < 4; k++) if (k !== i) q[k] *= (1 - v) / rest;
      q[i] = v;
    }
    var sl = L.map(function (name, i) { return slider("q(" + name + ") ", 0, 1, 0.005, q[i], function (v) { return v.toFixed(3); }, function (v) { setQ(i, v); draw(); }); });
    function syncSliders() { sl.forEach(function (s, i) { s.set(q[i]); }); }
    var geo = null;
    function draw() {
      var P = pal(), cost = DL.codeCost(msg, q), per = cost / msg.length, Hs = H(DL.CODE_SOURCES[src].p);
      // bars: the model's probabilities, with each letter's cost underneath
      var c = fit(bars, 168), ctx = c.ctx, W = c.W, top = 22, base = 128, colW = Math.min(110, (W - 40) / 4), x0 = (W - 4 * colW) / 2;
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, c.H);
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.font = "11px " + P.font; ctx.fillStyle = P.ink2; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      [0, 0.25, 0.5, 0.75, 1].forEach(function (v) { var y = Math.round(base - v * (base - top)) + 0.5; line(ctx, [[x0 - 4, y], [x0 + 4 * colW, y]]); });
      ctx.fillText("1", x0 - 6, top); ctx.fillText("0", x0 - 6, base);
      geo = { x0: x0, colW: colW, top: top, base: base };
      for (var i = 0; i < 4; i++) {
        var bx = x0 + i * colW + colW * 0.2, bw = colW * 0.6, by = base - q[i] * (base - top);
        ctx.fillStyle = P.s[i]; ctx.globalAlpha = drag === i ? 1 : 0.85; ctx.fillRect(bx, by, bw, base - by); ctx.globalAlpha = 1;
        ctx.fillStyle = P.ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = "12px " + P.mono;
        ctx.fillText(q[i].toFixed(3), bx + bw / 2, Math.max(13, by - 5));
        ctx.font = "bold 13px " + P.font; ctx.fillText(L[i], bx + bw / 2, base + 16);
        ctx.font = "11px " + P.font; ctx.fillStyle = P.ink2; ctx.fillText(lg2(1 / q[i]).toFixed(2) + (colW >= 90 ? " bits each" : " bits"), bx + bw / 2, base + 31);
      }
      // the strip: the message, each letter as wide as its cost, wrapped into rows of a fixed number of bits
      var Ws = Math.max(220, Math.floor(strip.clientWidth)), bitW = 16, perRow = Math.max(12, Math.floor((Ws - 16) / bitW / 4) * 4), rows = Math.min(9, Math.ceil(cost / perRow - 1e-9)), rowH = 24, gap = 6;
      var s = fit(strip, 16 + Math.max(2, rows) * (rowH + gap)), g = s.ctx, sx = 8, sy = 8;
      g.fillStyle = P.surface; g.fillRect(0, 0, s.W, s.H);
      g.strokeStyle = P.grid; g.lineWidth = 1;
      for (var r = 0; r < Math.max(2, rows); r++) for (var b = 0; b <= perRow; b++) { var gx = Math.round(sx + b * bitW) + 0.5; line(g, [[gx, sy + r * (rowH + gap)], [gx, sy + r * (rowH + gap) + rowH]]); }
      var pos = 0, cut = 9 * perRow;
      msg.forEach(function (x) {
        var w = lg2(1 / q[x]), a = pos, e = Math.min(pos + w, cut); pos += w; if (a >= cut) return;
        while (a < e - 1e-9) {
          var row = Math.floor(a / perRow + 1e-9), end = Math.min(e, (row + 1) * perRow), px = sx + (a - row * perRow) * bitW, pw = (end - a) * bitW, py = sy + row * (rowH + gap);
          g.fillStyle = P.s[x]; g.globalAlpha = 0.5; g.fillRect(px + 0.5, py + 1, Math.max(0.6, pw - 1), rowH - 2); g.globalAlpha = 1;
          if (pw >= 11) { g.fillStyle = P.ink; g.font = "bold 11px " + P.font; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(L[x], px + pw / 2, py + rowH / 2 + 0.5); }
          a = end;
        }
      });
      if (pos > cut) { g.fillStyle = P.crit; g.font = "12px " + P.font; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText("… " + Math.round(pos - cut) + " more bits", s.W - 6, s.H - 1); }
      if (best[src] == null || cost < best[src]) best[src] = cost;
      DL.clear(read);
      DL.add(read, [
        h("span", {}, ["the 40 letters cost ", h("b", { text: cost.toFixed(1) + " bits" })]),
        h("span", {}, ["per letter ", h("b", { text: per.toFixed(3) })]),
        h("span", {}, ["your shortest for this source ", h("b", { text: best[src].toFixed(1) + " bits" })]),
        per <= Hs + 0.01 ? h("span", {}, [h("b", { text: "✓ no model does better: " + (Hs * 40).toFixed(1) + " bits is the minimum" })]) : null
      ]);
    }
    function colAt(e) {
      var r = bars.getBoundingClientRect(), x = e.clientX - r.left; if (!geo) return -1;
      var i = Math.floor((x - geo.x0) / geo.colW); return i >= 0 && i < 4 ? i : -1;
    }
    function valAt(e) { var r = bars.getBoundingClientRect(); return (geo.base - (e.clientY - r.top)) / (geo.base - geo.top); }
    bars.style.touchAction = "pan-y";
    bars.addEventListener("pointerdown", function (e) { var i = colAt(e); if (i < 0) return; drag = i; try { bars.setPointerCapture(e.pointerId); } catch (x) {} setQ(i, valAt(e)); syncSliders(); draw(); e.preventDefault(); });
    bars.addEventListener("touchstart", function (e) { var t = e.touches && e.touches[0]; if (t && colAt(t) >= 0) e.preventDefault(); }, { passive: false });
    bars.addEventListener("pointermove", function (e) { if (drag < 0) return; setQ(drag, valAt(e)); syncSliders(); draw(); });
    function endDrag() { if (drag >= 0) { drag = -1; draw(); } }
    bars.addEventListener("pointerup", endDrag); bars.addEventListener("pointercancel", endDrag);
    var srcBtns = DL.CODE_SOURCES.map(function (S, i) {
      return h("button", { class: "chip", "aria-pressed": String(i === 0), text: S.name, onclick: function () { src = i; msg = DL.codeMessage(S.p); srcBtns.forEach(function (b, j) { b.setAttribute("aria-pressed", String(j === i)); }); draw(); } });
    });
    function setModel(v) { q = v.slice(); syncSliders(); draw(); }
    var body = reveal("What you found", "- The message is shortest when the model's probabilities equal the letters' frequencies. The cost per letter is then the **entropy** $H(p) = -\\sum_x p(x)\\log_2 p(x)$: 1.75 bits for the first source, 1.357 for the second, 2 for the third. Any other model costs more, by exactly the **KL divergence** $D(p\\,\\|\\,q)$ per letter (sections 1, 3 and 4).\n- A letter the model thinks rare is expensive: it costs $-\\log_2 q$ bits, which grows without bound as $q \\to 0$. A few underrated letters dominate the total, while overrating a letter only makes the others a little dearer. $D$ is not symmetric (section 3).\n- No model beats 2 bits per letter on the third source: with four letters, the uniform distribution has the largest entropy, $\\log_2 4$ (section 1).\n\nCan a real code spend $-\\log_2 q$ bits on a letter when that is not a whole number? One letter at a time, no: lengths must be rounded up (section 4). A whole message at once, yes, to within two bits for the entire message: arithmetic coding (section 5) does it, and the first experiment runs it.");
    body.appendChild(h("div", { class: "w-row" }, [
      h("button", { class: "btn quiet small", text: "Set the model to the letter frequencies", onclick: function () { setModel(DL.CODE_SOURCES[src].p.map(function (v) { return Math.max(QMIN, v); })); } }),
      h("button", { class: "btn quiet small", text: "Reset to equal probabilities", onclick: function () { setModel([0.25, 0.25, 0.25, 0.25]); } })
    ]));
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "Pay for surprise" })]),
      h("p", { class: "w-task", text: "A source writes letters A to D; below are 40 of them. Your model gives each letter a probability q, and a letter costs log₂(1/q) bits: a letter with probability ½ costs 1 bit, one with probability ⅛ costs 3. The strip lays the message out at that cost, one grid square per bit. At the start every letter gets ¼, which is 2 bits each." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "Drag the bars (or use the sliders) to make the message as short as you can. How short does it get, and what does your model look like then?" }),
        h("li", { text: "Drag D's probability towards zero. Where in the strip does the cost go, and how fast does it grow?" }),
        h("li", { text: "Choose “All four equally likely”. Can any model beat 2 bits per letter?" })
      ]),
      h("div", { class: "w-row" }, [h("span", { class: "hint", text: "Source:" })].concat(srcBtns)),
      bars, strip, read,
      h("div", { class: "w-ctl" }, sl.map(function (s) { return s.el; })),
      body
    ]);
    var un1 = watch(bars, draw); draw();
    return { destroy: function () { un1(); } };
  };

  /* ================= week 3: a quadratic loss minimized inside a disk or a diamond ================= */
  DL.ballMin = function (ws, shape, r) {
    var c = Math.cos(25 * Math.PI / 180), sn = Math.sin(25 * Math.PI / 180), a = 1, b = 5;
    var A = [[a * c * c + b * sn * sn, (a - b) * c * sn], [(a - b) * c * sn, a * sn * sn + b * c * c]];
    function f(w) { var d0 = w[0] - ws[0], d1 = w[1] - ws[1]; return A[0][0] * d0 * d0 + 2 * A[0][1] * d0 * d1 + A[1][1] * d1 * d1; }
    var inside = shape === "l1" ? Math.abs(ws[0]) + Math.abs(ws[1]) <= r : ws[0] * ws[0] + ws[1] * ws[1] <= r * r;
    if (inside) return { w: ws.slice(), f: 0, A: A, inside: true };
    var best = null, bf = Infinity, i;
    if (shape === "l1") {
      var V = [[r, 0], [0, r], [-r, 0], [0, -r]];
      for (i = 0; i < 4; i++) {
        var p = V[i], q = V[(i + 1) % 4], e = [q[0] - p[0], q[1] - p[1]], d = [p[0] - ws[0], p[1] - ws[1]];
        var eAe = A[0][0] * e[0] * e[0] + 2 * A[0][1] * e[0] * e[1] + A[1][1] * e[1] * e[1];
        var eAd = A[0][0] * e[0] * d[0] + A[0][1] * (e[0] * d[1] + e[1] * d[0]) + A[1][1] * e[1] * d[1];
        var t = Math.max(0, Math.min(1, -eAd / eAe)), w = [p[0] + t * e[0], p[1] + t * e[1]];
        if (t === 0 || t === 1) w = t === 0 ? p.slice() : q.slice();
        var fv = f(w); if (fv < bf) { bf = fv; best = w; }
      }
    } else {
      var bt = 0;
      for (i = 0; i < 720; i++) { var th = i * Math.PI / 360, fv2 = f([r * Math.cos(th), r * Math.sin(th)]); if (fv2 < bf) { bf = fv2; bt = th; } }
      var lo = bt - Math.PI / 360, hi = bt + Math.PI / 360;
      for (i = 0; i < 60; i++) { var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f([r * Math.cos(m1), r * Math.sin(m1)]) < f([r * Math.cos(m2), r * Math.sin(m2)])) hi = m2; else lo = m1; }
      bt = (lo + hi) / 2; best = [r * Math.cos(bt), r * Math.sin(bt)]; bf = f(best);
    }
    return { w: best, f: bf, A: A, inside: false };
  };
  DL.WIDGETS.ballmin = function (host) {
    var shape = "l2", r = 1, ws = [1.6, 0.9], drag = false, tally = { l1: [0, 0], l2: [0, 0] }, rain = null;
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "Level sets of a quadratic loss and the region it is minimized over; drag the unconstrained minimum" });
    var read = h("div", { class: "w-read" }), geo = null, L = 2.4;
    function zero(w) { return Math.abs(w[0]) < 1e-9 || Math.abs(w[1]) < 1e-9; }
    function draw() {
      var P = pal(), c = fit(cv, 330), ctx = c.ctx, W = c.W, H = c.H, S = Math.min(W - 20, H - 20) / (2 * L), cx = W / 2, cy = H / 2;
      geo = { S: S, cx: cx, cy: cy };
      function X(v) { return cx + v * S; } function Y(v) { return cy - v * S; }
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; line(ctx, [[X(-L), Y(0)], [X(L), Y(0)]]); line(ctx, [[X(0), Y(-L)], [X(0), Y(L)]]);
      ctx.fillStyle = P.ink2; ctx.font = "11px " + P.font; ctx.fillText("w₁", X(L) - 16, Y(0) - 6); ctx.fillText("w₂", X(0) + 6, Y(L) + 12);
      // the region
      ctx.fillStyle = P.accent; ctx.globalAlpha = 0.13; ctx.beginPath();
      if (shape === "l1") { ctx.moveTo(X(r), Y(0)); ctx.lineTo(X(0), Y(r)); ctx.lineTo(X(-r), Y(0)); ctx.lineTo(X(0), Y(-r)); ctx.closePath(); }
      else ctx.arc(X(0), Y(0), r * S, 0, 2 * Math.PI);
      ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5; ctx.stroke();
      if (rain) rain.forEach(function (q) { ctx.fillStyle = zero(q) ? P.crit : P.ink2; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(X(q[0]), Y(q[1]), 2.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1; });
      var sol = DL.ballMin(ws, shape, r), A = sol.A;
      // level sets f = c through the solution and two others: w = ws + sqrt(c) A^(-1/2) u
      var ev = [1, 5], ang = 25 * Math.PI / 180;
      function ell(cval, cls, width, dash) {
        var pts = []; for (var k = 0; k <= 120; k++) { var t = k * Math.PI / 60, u0 = Math.cos(t) * Math.sqrt(cval / ev[0]), u1 = Math.sin(t) * Math.sqrt(cval / ev[1]);
          pts.push([X(ws[0] + Math.cos(ang) * u0 - Math.sin(ang) * u1), Y(ws[1] + Math.sin(ang) * u0 + Math.cos(ang) * u1)]); }
        ctx.strokeStyle = cls; ctx.lineWidth = width; ctx.setLineDash(dash || []); line(ctx, pts); ctx.setLineDash([]);
      }
      var fs = sol.inside ? 0.6 : sol.f;
      [0.25, 2.2].forEach(function (m) { ell(fs * m, P.grid, 1); });
      if (!sol.inside) ell(sol.f, P.ink2, 1.2, [4, 3]);
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(X(ws[0]), Y(ws[1]), drag ? 7 : 6, 0, 7); ctx.fill();
      ctx.font = "12px " + P.font; var rt = X(ws[0]) > W - 190; ctx.textAlign = rt ? "right" : "left"; ctx.fillText("unconstrained minimum (drag)", X(ws[0]) + (rt ? -9 : 9), Y(ws[1]) - 8); ctx.textAlign = "left";
      ctx.fillStyle = zero(sol.w) && !sol.inside ? P.crit : P.accent; ctx.beginPath(); ctx.arc(X(sol.w[0]), Y(sol.w[1]), 5.5, 0, 7); ctx.fill();
      DL.clear(read);
      DL.add(read, [
        h("span", {}, ["minimum in the region ", h("b", { text: "(" + sol.w[0].toFixed(3) + ", " + sol.w[1].toFixed(3) + ")" })]),
        h("span", {}, ["a coordinate exactly 0: ", h("b", { text: sol.inside ? "no (the minimum is inside)" : zero(sol.w) ? "yes" : "no" })]),
        h("span", {}, ["your drags so far: ", h("b", { text: (tally[shape][1] ? tally[shape][0] + " of " + tally[shape][1] : "none") + " with a zero" })]),
        rain ? h("span", {}, ["random minima: ", h("b", { text: rain.filter(zero).length + " of " + rain.length + " land with a zero" })]) : null
      ]);
      return sol;
    }
    function at(e) { var b = cv.getBoundingClientRect(); return [(e.clientX - b.left - geo.cx) / geo.S, -(e.clientY - b.top - geo.cy) / geo.S]; }
    cv.style.touchAction = "pan-y";
    cv.addEventListener("pointerdown", function (e) { var p = at(e); if (Math.hypot(p[0] - ws[0], p[1] - ws[1]) * geo.S > 40) return; drag = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); draw(); });
    cv.addEventListener("touchstart", function (e) { var t = e.touches && e.touches[0]; if (!t || !geo) return; var p = at(t); if (Math.hypot(p[0] - ws[0], p[1] - ws[1]) * geo.S <= 40) e.preventDefault(); }, { passive: false });
    cv.addEventListener("pointermove", function (e) { if (!drag) return; var p = at(e); ws = [Math.max(-L, Math.min(L, p[0])), Math.max(-L, Math.min(L, p[1]))]; rain = null; draw(); });
    function end() { if (!drag) return; drag = false; var sol = draw(); if (!sol.inside) { tally[shape][1]++; if (zero(sol.w)) tally[shape][0]++; } draw(); }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    var rs = slider("size of the region r ", 0.2, 2, 0.05, r, function (v) { return v.toFixed(2); }, function (v) { r = v; rain = null; draw(); });
    var chips = [["l2", "Disk: w₁² + w₂² ≤ r²"], ["l1", "Diamond: |w₁| + |w₂| ≤ r"]].map(function (s) {
      return h("button", { class: "chip", "aria-pressed": String(s[0] === shape), text: s[1], onclick: function () { shape = s[0]; rain = null; chips.forEach(function (b, j) { b.setAttribute("aria-pressed", String(["l2", "l1"][j] === shape)); }); draw(); } });
    });
    /** 200 unconstrained minima spread over the square, outside the region: where do their constrained minima land? */
    DL.ballRain = function (sh, rr) {
      var out = [], s = 11, k = 0;
      while (out.length < 200 && k < 5000) { k++; s = (s * 1103515245 + 12345) % 2147483648; var u = s / 2147483648; s = (s * 1103515245 + 12345) % 2147483648; var v = s / 2147483648;
        var p = [(2 * u - 1) * L, (2 * v - 1) * L]; var sol = DL.ballMin(p, sh, rr); if (!sol.inside) out.push(sol.w); }
      return out;
    };
    var body = reveal("What you found", "- With the **disk**, the minimum lands on the boundary where a level set of the loss touches it, and that point has a coordinate exactly 0 only if the unconstrained minimum already lies on an axis. With the **diamond**, it lands on a corner for a whole range of positions, and at a corner one coordinate is exactly 0.\n- Shrinking $r$ makes the corners win more often.\n\nMinimizing a loss inside the disk is the same as adding a penalty $\\lambda(w_1^2 + w_2^2)$ for a suitable $\\lambda$ (Lagrange multipliers): that is **weight decay**, or **ridge**, and it is the MAP estimate under a Gaussian prior. The diamond corresponds to the penalty $\\lambda(\\lvert w_1\\rvert + \\lvert w_2\\rvert)$, the **lasso**, the MAP estimate under a Laplace prior (section 4). The corners are why the lasso sets coefficients exactly to zero and ridge only shrinks them; in one dimension this is soft thresholding against scaling (section 4).");
    body.appendChild(h("div", { class: "w-row" }, [h("button", { class: "btn quiet small", text: "Drop 200 random minima", onclick: function () { rain = DL.ballRain(shape, r); draw(); } })]));
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "Where does the minimum land?" })]),
      h("p", { class: "w-task", text: "A quadratic loss of two weights has its minimum at the black dot; the ellipses are its level sets. Now minimize the same loss only over the shaded region. The coloured dot is where the minimum lands; it turns red when a coordinate is exactly 0." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "With the disk, drag the black dot around outside it. Can you make a coordinate of the constrained minimum exactly 0?" }),
        h("li", { text: "Switch to the diamond and drag again. How often is a coordinate exactly 0 now?" }),
        h("li", { text: "Make the region smaller. What changes? Then press “Drop 200 random minima” below “What you found” for each shape." })
      ]),
      h("div", { class: "w-row" }, chips),
      cv, read, h("div", { class: "w-ctl" }, [rs.el]), body
    ]);
    var un = watch(cv, draw); draw();
    return { destroy: function () { un(); } };
  };

  /* ================= week 4: gradient descent on a quadratic bowl ================= */
  /** Heavy ball on f = (x^2 + kappa y^2) / 2 from (-1.8, 0.9); mu = 0 is gradient descent.
   *  hit = the number of steps after which BOTH coordinates stay below a thousandth of their starting size (null: not within n).
   *  That count does not depend on the starting point, and for mu = 0 it is smallest exactly at eta = 2 / (1 + kappa). */
  DL.quadSim = function (kappa, eta, mu, n) {
    var X0 = -1.8, Y0 = 0.9, x = X0, y = Y0, vx = 0, vy = 0, f0 = 0.5 * (x * x + kappa * y * y), path = [[x, y]], fs = [1], last = 0, t, TOL = 1e-3;
    for (t = 1; t <= n; t++) {
      vx = mu * vx + x; vy = mu * vy + kappa * y; x -= eta * vx; y -= eta * vy;
      if (t <= 80) { path.push([x, y]); fs.push(0.5 * (x * x + kappa * y * y) / f0); }
      if (!(Math.abs(x) + Math.abs(y) < 1e9)) break;
      if (Math.abs(x) > TOL * Math.abs(X0) || Math.abs(y) > TOL * Math.abs(Y0)) last = t;
      else if (t > 80 && t - last > 400) break;
    }
    var diverged = !(Math.abs(x) + Math.abs(y) < 1e6);
    return { path: path, fs: fs, hit: diverged || last >= n ? null : last + 1, diverged: diverged };
  };
  /** The slower of the two coordinates' long-run factors per step: the larger root of r^2 - (1 + mu - eta lam) r + mu, for lam = 1 and kappa */
  DL.quadRate = function (kappa, eta, mu) {
    function r(lam) { var c = 1 + mu - eta * lam, d = c * c - 4 * mu; return d <= 0 ? Math.sqrt(mu) : (Math.abs(c) + Math.sqrt(d)) / 2; }
    return Math.max(r(1), r(kappa));
  };
  DL.WIDGETS.gdquad = function (host) {
    var kappa = 25, eta = 0.02, mu = 0, best = null;
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "Level curves of the bowl and the path of the iteration" });
    var tr = h("canvas", { class: "w-canvas", role: "img", "aria-label": "Loss by step, logarithmic scale" });
    var read = h("div", { class: "w-read" });
    function lg(v) { return Math.log(v) / Math.LN10; }
    var sK = slider("Condition number κ ", 0, 2, 0.01, lg(kappa), function (v) { return String(Math.round(Math.pow(10, v))); }, function (v) { kappa = Math.round(Math.pow(10, v)); best = null; draw(); });
    var sE = slider("Step size η ", -3, 0.35, 0.005, lg(eta), function (v) { return sci(Math.pow(10, v)); }, function (v) { eta = Math.pow(10, v); draw(); });
    var sM = slider("Momentum μ ", 0, 0.95, 0.01, mu, function (v) { return v.toFixed(2); }, function (v) { mu = v; draw(); });
    function set(k, e, m) { kappa = k; eta = e; mu = m; sK.set(lg(k)); sE.set(lg(e)); sM.set(m); draw(); }
    function draw() {
      var sim = DL.quadSim(kappa, eta, mu, 20000), P = pal();
      var c = fit(cv, Math.max(170, Math.min(300, cv.clientWidth * 2.6 / 4.4))), ctx = c.ctx, W = c.W, H = c.H;
      var sc = Math.min(W / 4.4, H / 2.6), cx = W / 2, cy = H / 2;
      function X(x) { return cx + x * sc; } function Y(y) { return cy - y * sc; }
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, H);
      var f0 = 0.5 * (1.8 * 1.8 + kappa * 0.81);
      ctx.strokeStyle = P.axis; ctx.lineWidth = 1;
      [1, 0.5, 0.2, 0.08, 0.03, 0.01, 0.003].forEach(function (q) { var a = Math.sqrt(2 * q * f0), b = Math.sqrt(2 * q * f0 / kappa); ctx.beginPath(); ctx.ellipse(cx, cy, a * sc, b * sc, 0, 0, 6.2832); ctx.stroke(); });
      ctx.fillStyle = P.ink2; ctx.font = "11px " + P.font; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText("soft direction, curvature 1 →", 8, H - 8); ctx.save(); ctx.translate(12, H / 2 + 60); ctx.rotate(-Math.PI / 2); ctx.fillText("stiff direction, curvature κ →", 0, 0); ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.2832); ctx.fillStyle = P.ink; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      ctx.strokeStyle = sim.diverged ? P.crit : P.s[0]; ctx.lineWidth = 1.75; ctx.lineJoin = "round";
      var pts = sim.path.map(function (q) { return [X(Math.max(-50, Math.min(50, q[0]))), Y(Math.max(-50, Math.min(50, q[1])))]; }); line(ctx, pts);
      ctx.fillStyle = sim.diverged ? P.crit : P.s[0]; pts.forEach(function (q, i) { if (i < 40 || i % 4 === 0) { ctx.beginPath(); ctx.arc(q[0], q[1], i ? 2.2 : 4.5, 0, 6.2832); ctx.fill(); } });
      ctx.restore();
      // loss trace
      var t = fit(tr, 96), g = t.ctx, TW = t.W, TH = t.H, a0 = 38, a1 = TW - 10, b0 = 8, b1 = TH - 18, LO = -8, HI = 2;
      g.fillStyle = P.surface; g.fillRect(0, 0, TW, TH); g.font = "11px " + P.font; g.textBaseline = "middle";
      [-8, -6, -4, -2, 0, 2].forEach(function (e) { var yy = Math.round(b1 - (e - LO) / (HI - LO) * (b1 - b0)) + 0.5; g.strokeStyle = e === 0 ? P.axis : P.grid; line(g, [[a0, yy], [a1, yy]]); g.fillStyle = P.ink2; g.textAlign = "right"; g.fillText(e === 0 ? "1" : "1e" + e, a0 - 5, yy); });
      g.textAlign = "center"; [0, 20, 40, 60, 80].forEach(function (s) { g.fillText(String(s), a0 + s / 80 * (a1 - a0), b1 + 10); });
      g.textAlign = "right"; g.fillText("step", a1, b0 + 4);
      g.strokeStyle = sim.diverged ? P.crit : P.s[0]; g.lineWidth = 2; g.lineJoin = "round";
      line(g, sim.fs.map(function (v, i) { var e = Math.max(LO, Math.min(HI, lg(Math.max(v, 1e-300)))); return [a0 + i / 80 * (a1 - a0), b1 - (e - LO) / (HI - LO) * (b1 - b0)]; }));
      if (!sim.diverged && sim.hit != null && (!best || sim.hit < best.hit)) best = { hit: sim.hit, eta: eta, mu: mu };
      DL.clear(read);
      DL.add(read, [
        h("span", {}, ["η × κ = ", h("b", { text: sci(eta * kappa) })]),
        h("span", {}, ["loss after 80 steps ÷ loss at start ", h("b", { text: sim.diverged ? "blew up" : sci(sim.fs[sim.fs.length - 1]) })]),
        h("span", {}, ["steps until both coordinates are a thousandth of where they started ", h("b", { text: sim.diverged ? "never" : sim.hit == null ? "more than 20,000" : sim.hit.toLocaleString("en-US") })]),
        h("span", {}, ["long-run factor per step ", h("b", { text: (function (q) { return q >= 1 ? q.toFixed(3) + " (no decay)" : q.toFixed(3); })(DL.quadRate(kappa, eta, mu)) })]),
        best ? h("span", {}, ["your best at this κ ", h("b", { text: best.hit.toLocaleString("en-US") + " steps (η = " + sci(best.eta) + ", μ = " + best.mu.toFixed(2) + ")" })]) : null
      ]);
    }
    var body = reveal("What you found", "- Without momentum, each step multiplies the stiff coordinate by $1 - \\eta\\kappa$ and the soft one by $1 - \\eta$. The path explodes once $\\eta\\kappa > 2$: the stiffest direction caps the step size.\n- The fewest steps come at $\\eta = 2/(1+\\kappa)$, just below the cap, where the two factors have the same size $(\\kappa-1)/(\\kappa+1)$: the soft coordinate creeps and the stiff one overshoots, flipping sign at every step. The number of steps grows in proportion to $\\kappa$.\n- Momentum builds up speed in the soft direction, where successive gradients agree, and damps the stiff one, where they alternate in sign. The cap on the step moves from $\\eta\\kappa = 2$ to $\\eta\\kappa = 2(1+\\mu)$, and with a suitable pair $(\\eta, \\mu)$ the step count grows like $\\sqrt\\kappa$ instead of $\\kappa$.\n\nSections 1 and 2 prove all three. The first button sets $\\eta = 2/(1+\\kappa)$: no plain step needs fewer steps on this counter. The second sets the pair $(\\eta^*, \\mu^*)$ of section 2, which makes the *long-run factor per step* in the read-out as small as it can be. Its step count can be beaten, by about a quarter, with a slightly larger $\\mu$: at the textbook pair both coordinates sit at a double root, which costs a factor that grows with the step number (the proposition in section 2 says so). In the long run no pair beats its factor.");
    body.appendChild(h("div", { class: "w-row" }, [
      h("button", { class: "btn quiet small", text: "Set the textbook step η = 2/(1+κ)", onclick: function () { set(kappa, 2 / (1 + kappa), 0); } }),
      h("button", { class: "btn quiet small", text: "Set the textbook step and momentum", onclick: function () { var r = Math.sqrt(kappa); set(kappa, Math.pow(2 / (1 + r), 2), Math.pow((r - 1) / (r + 1), 2)); } })
    ]));
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "Walk downhill in a narrow valley" })]),
      h("p", { class: "w-task", text: "The loss is a bowl, f(x, y) = (x² + κ y²) / 2: gentle along x, κ times steeper along y. Each step moves against the gradient by the step size η. The dots are the first 80 steps." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "With momentum at 0, raise η until the path blows up. Note the value of η × κ where that happens. Change κ and check it again." }),
        h("li", { text: "Find the η that needs the fewest steps, and note η × κ again. Just below it, which direction is the slow one? Just above it?" }),
        h("li", { text: "Now add momentum, and adjust η again. Can you beat your best?" })
      ]),
      cv, tr, read,
      h("div", { class: "w-ctl" }, [sK.el, sE.el, sM.el]),
      body
    ]);
    var un1 = watch(cv, draw); draw();
    return { destroy: function () { un1(); } };
  };

  /* ================= week 5: a convolution and a dense layer applied to a shape you slide ================= */
  DL.conv2same = function (img, k, N) {
    var out = new Float64Array(N * N), r = (k.length - 1) / 2;
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      var s = 0; for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) { var ii = i + a, jj = j + b; if (ii >= 0 && ii < N && jj >= 0 && jj < N) s += k[a + r][b + r] * img[ii * N + jj]; }
      out[i * N + j] = s;
    }
    return out;
  };
  DL.WIDGETS.shiftconv = function (host) {
    var N = 16, SHAPE = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [1, 1]], pos = [4, 5], drag = false, fk = 0;
    var FILTERS = [["vertical edges", [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]], ["horizontal edges", [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]], ["blur", [[1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9]]]];
    var Wd = new Float64Array(N * N * N * N), sd = 5;
    for (var q = 0; q < Wd.length; q += 2) { sd = (sd * 1103515245 + 12345) % 2147483648; var u1 = (sd + 1) / 2147483649; sd = (sd * 1103515245 + 12345) % 2147483648; var u2 = sd / 2147483648;
      var rr = Math.sqrt(-2 * Math.log(u1)) / N; Wd[q] = rr * Math.cos(2 * Math.PI * u2); if (q + 1 < Wd.length) Wd[q + 1] = rr * Math.sin(2 * Math.PI * u2); }
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "Three grids: the input with a shape you can drag, the output of a convolution, the output of a dense layer" });
    var read = h("div", { class: "w-read" }), geo = null;
    function image() { var im = new Float64Array(N * N); SHAPE.forEach(function (c) { var i = pos[1] + c[0], j = pos[0] + c[1]; if (i >= 0 && i < N && j >= 0 && j < N) im[i * N + j] = 1; }); return im; }
    function dense(im) { var out = new Float64Array(N * N); for (var o = 0; o < N * N; o++) { var s = 0, base = o * N * N; for (var i = 0; i < N * N; i++) if (im[i]) s += Wd[base + i]; out[o] = s; } return out; }
    function maxOf(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
    function draw() {
      var P = pal(), im = image(), co = DL.conv2same(im, FILTERS[fk][1], N), de = dense(im);
      var c = fit(cv, 0), W = c.W, gap = 14, side = Math.min(190, Math.floor((W - 2 * gap) / 3)), cell = side / N, Hh = side + 26;
      c = fit(cv, Hh); var ctx = c.ctx; ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, c.H);
      var x0 = (W - 3 * side - 2 * gap) / 2; geo = { x0: x0, cell: cell, top: 20 };
      var wide = side >= 150;
      [[wide ? "input (drag the shape)" : "input", im], [wide ? "convolution: " + FILTERS[fk][0] : "convolution", co], [wide ? "dense layer, random weights" : "dense layer", de]].forEach(function (pn, k) {
        var ox = x0 + k * (side + gap), a = pn[1], m = 0; for (var i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
        ctx.fillStyle = P.ink2; ctx.font = "11px " + P.font; ctx.textAlign = "left"; ctx.fillText(pn[0], ox, 13);
        for (var i2 = 0; i2 < N; i2++) for (var j = 0; j < N; j++) {
          var v = a[i2 * N + j] / (m || 1);
          ctx.fillStyle = v >= 0 ? (k === 0 ? P.ink : P.accent) : P.crit; ctx.globalAlpha = Math.min(1, Math.abs(v)) * (k === 0 ? 0.9 : 0.85);
          ctx.fillRect(ox + j * cell, 20 + i2 * cell, cell - 0.5, cell - 0.5); ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.strokeRect(ox + 0.5, 20.5, side, side);
      });
      DL.clear(read);
      DL.add(read, [h("span", {}, ["shape at ", h("b", { text: "(" + pos[0] + ", " + pos[1] + ")" })]),
        h("span", {}, ["convolution, largest response ", h("b", { text: maxOf(co).toFixed(3) })]),
        h("span", {}, ["dense layer, largest response ", h("b", { text: maxOf(de).toFixed(3) })])]);
    }
    function cellAt(e) { var b = cv.getBoundingClientRect(), x = e.clientX - b.left - geo.x0, y = e.clientY - b.top - geo.top; return [Math.floor(x / geo.cell), Math.floor(y / geo.cell)]; }
    function move(dx, dy) { pos = [Math.max(-2, Math.min(N - 2, pos[0] + dx)), Math.max(-2, Math.min(N - 2, pos[1] + dy))]; draw(); }
    cv.style.touchAction = "pan-y";
    cv.addEventListener("pointerdown", function (e) { var c = cellAt(e); if (c[0] < 0 || c[0] >= N || c[1] < 0 || c[1] >= N) return; drag = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} pos = [c[0] - 1, c[1] - 2]; draw(); e.preventDefault(); });
    cv.addEventListener("touchstart", function (e) { var t = e.touches && e.touches[0]; if (!t || !geo) return; var c = cellAt(t); if (c[0] >= 0 && c[0] < N && c[1] >= 0 && c[1] < N) e.preventDefault(); }, { passive: false });
    cv.addEventListener("pointermove", function (e) { if (!drag) return; var c = cellAt(e); var np = [Math.max(-2, Math.min(N - 2, c[0] - 1)), Math.max(-2, Math.min(N - 2, c[1] - 2))]; if (np[0] !== pos[0] || np[1] !== pos[1]) { pos = np; draw(); } });
    cv.addEventListener("pointerup", function () { drag = false; }); cv.addEventListener("pointercancel", function () { drag = false; });
    var chips = FILTERS.map(function (f, i) { return h("button", { class: "chip", "aria-pressed": String(i === fk), text: f[0], onclick: function () { fk = i; chips.forEach(function (b, j) { b.setAttribute("aria-pressed", String(j === fk)); }); draw(); } }); });
    var arrows = [["←", -1, 0, "left"], ["→", 1, 0, "right"], ["↑", 0, -1, "up"], ["↓", 0, 1, "down"]].map(function (a) { return h("button", { class: "btn quiet small", text: a[0], "aria-label": "Move the shape " + a[3], onclick: function () { move(a[1], a[2]); } }); });
    var body = reveal("What you found", "- Moving the shape moves the convolution's output by the same amount and changes nothing else: the layer **commutes with translations**, it is *translation equivariant*. The dense layer's output changes completely, with no relation between the pictures before and after.\n- So the largest response of the convolution stays fixed as the shape moves, while the dense one jumps around. Taking the maximum (or the average) over positions turns an equivariant map into an *invariant* one: **pooling** (section 3).\n- Against the edge, the convolution's output is cut off: the zero padding outside the grid breaks the symmetry at the border.\n\nSection 2 proves that this is no accident of the three filters: a linear map on signals on a cycle commutes with all shifts if and only if it is a convolution. Locality, the small $3\\times3$ support, is a separate choice on top of that.");
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "Slide the shape" })]),
      h("p", { class: "w-task", text: "A 16 × 16 image with a small shape in it goes through two linear layers: a 3 × 3 convolution, and a dense layer whose 65,536 weights are random. Blue is positive, red negative." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "Drag the shape (or use the arrows). What does the middle picture do? And the right one?" }),
        h("li", { text: "Watch the two “largest response” numbers as you move it. Which one stays put?" }),
        h("li", { text: "Push the shape against an edge. Does the middle picture still simply move?" })
      ]),
      h("div", { class: "w-row" }, chips),
      cv, h("div", { class: "w-row" }, [h("span", { class: "hint", text: "Move:" })].concat(arrows)), read, body
    ]);
    var un = watch(cv, draw); draw();
    return { destroy: function () { un(); } };
  };

  /* ================= week 6: a one-number recurrent network and its gradient through time ================= */
  DL.bpttCurves = function (w, a, f, T) {
    var xs = [], sd = 9, i;
    for (i = 0; i < T; i++) { sd = (sd * 1103515245 + 12345) % 2147483648; var u1 = (sd + 1) / 2147483649; sd = (sd * 1103515245 + 12345) % 2147483648; xs.push(a * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * sd / 2147483648)); }
    var h = [0]; for (i = 1; i <= T; i++) h.push(Math.tanh(w * h[i - 1] + xs[i - 1]));
    var plain = [1], prod = 1; for (var lag = 1; lag <= T; lag++) { var k = T - lag + 1; prod *= Math.abs(w * (1 - h[k] * h[k])); plain.push(prod); }
    var add = []; for (var l2 = 0; l2 <= T; l2++) add.push(Math.pow(f, l2));
    return { plain: plain, add: add, h: h };
  };
  DL.WIDGETS.bptt = function (host) {
    var w = 0.9, a = 0.5, f = 1, T = 60, showAdd = false;
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "How much of the gradient survives going back through time, on a logarithmic scale, for each lag" });
    var read = h("div", { class: "w-read" });
    function draw() {
      var P = pal(), c = fit(cv, 260), ctx = c.ctx, W = c.W, H = c.H, L = 52, R = W - 14, top = 14, bot = H - 30, lo = -12, hi = 4;
      var cur = DL.bpttCurves(w, a, f, T);
      function X(l) { return L + (R - L) * l / T; } function Y(v) { var g = Math.log(Math.max(v, 1e-300)) / Math.LN10; g = Math.max(lo, Math.min(hi, g)); return top + (bot - top) * (hi - g) / (hi - lo); }
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.font = "11px " + P.font; ctx.fillStyle = P.ink2;
      for (var e = lo; e <= hi; e += 4) { var y = Math.round(Y(Math.pow(10, e))) + 0.5; line(ctx, [[L, y], [R, y]]); ctx.textAlign = "right"; ctx.fillText(e === 0 ? "1" : "1e" + e, L - 6, y + 4); }
      ctx.textAlign = "center"; [0, 20, 40, 60].forEach(function (l) { ctx.fillText(String(l), X(l), bot + 15); });
      ctx.fillText("steps back in time", (L + R) / 2, bot + 27);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2; line(ctx, cur.plain.map(function (v, l) { return [X(l), Y(v)]; }));
      if (showAdd) { ctx.strokeStyle = P.s[1]; ctx.setLineDash([6, 4]); line(ctx, cur.add.map(function (v, l) { return [X(l), Y(v)]; })); ctx.setLineDash([]); }
      ctx.textAlign = "left"; ctx.fillStyle = P.accent; ctx.fillText("plain: h = tanh(w h + x)", L + 6, top + 12);
      if (showAdd) { ctx.fillStyle = P.s[1]; ctx.fillText("additive: c = f c + …", L + 6, top + 27); }
      var g = cur.plain[T];
      DL.clear(read);
      DL.add(read, [h("span", {}, ["plain, 60 steps back: ", h("b", { text: g === 0 ? "0" : g.toExponential(1) })]),
        h("span", {}, ["state at the end: ", h("b", { text: cur.h[T].toFixed(3) })]),
        showAdd ? h("span", {}, ["additive, 60 steps back: ", h("b", { text: Math.pow(f, T).toExponential(1) })]) : null]);
    }
    var sw = slider("recurrent weight w ", 0, 4, 0.01, w, function (v) { return v.toFixed(2); }, function (v) { w = v; draw(); });
    var sa = slider("input size a ", 0, 2, 0.05, a, function (v) { return v.toFixed(2); }, function (v) { a = v; draw(); });
    var sf = slider("forget gate f ", 0.8, 1, 0.001, f, function (v) { return v.toFixed(3); }, function (v) { f = v; draw(); });
    var body = reveal("What you found", "- For almost every $w$ the gradient dies exponentially with the lag. Below 1, each step multiplies it by at most $w$. Above 1, the state saturates near $\\pm1$, where $\\tanh' = 1 - h^2$ is small, and the factor $w(1 - h^2)$ drops below 1 again. Only near $w = 1$ with small inputs does it survive 60 steps: an unstable balance.\n- That is the **vanishing gradient problem** (section 2). With matrices instead of numbers, the factors are Jacobians $\\operatorname{diag}(1 - h_t^2)\\,U$, and large singular values can also make products *explode*.\n- An additive path, $c_t = f\\,c_{t-1} + (\\text{something new})$, contributes exactly $f^{\\text{lag}}$: with $f = 1$ the gradient reaches back unchanged, with $f = 0.99$ it keeps about half after 60 steps. That is the LSTM's cell state, and $f$ its forget gate (section 3).");
    body.appendChild(h("div", { class: "w-row" }, [h("button", { class: "btn quiet small", text: "Show the additive path", onclick: function () { showAdd = true; draw(); } })]));
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "How far back does the gradient reach?" })]),
      h("p", { class: "w-task", text: "The smallest recurrent network: one number h, updated 60 times by h ← tanh(w·h + x) with small random inputs x. The curve shows how much of a gradient arriving at the last step is left after going back 1, 2, …, 60 steps (logarithmic scale)." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "Try w = 0.5, 0.9 and 1.5. How fast does the gradient die?" }),
        h("li", { text: "Make w large, say 3. Does that stop the shrinking? Look at the state at the end." }),
        h("li", { text: "Is there any w for which a sizeable gradient survives 60 steps? Try changing the input size too." })
      ]),
      cv, read, h("div", { class: "w-ctl" }, [sw.el, sa.el, sf.el]), body
    ]);
    var un = watch(cv, draw); draw();
    return { destroy: function () { un(); } };
  };

  /* ================= week 8: one compute budget, many ways to spend it ================= */
  DL.CHIN = { E: 1.82, A: 482.01, B: 2085.43, a: 0.3478, b: 0.3658 };
  DL.chinLoss = function (N, D) { var p = DL.CHIN; return p.E + p.A / Math.pow(N, p.a) + p.B / Math.pow(D, p.b); };
  DL.chinBest = function (C) { var p = DL.CHIN, G = Math.pow(p.a * p.A / (p.b * p.B), 1 / (p.a + p.b)), N = G * Math.pow(C / 6, p.b / (p.a + p.b)); return { N: N, D: C / (6 * N), L: DL.chinLoss(N, C / (6 * N)) }; };
  DL.WIDGETS.isoflop = function (host) {
    var lc = 23, ln = 9.5;
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "Loss against model size for a fixed compute budget; the marker is your choice" });
    var read = h("div", { class: "w-read" });
    function fmt(x) { var e = Math.floor(Math.log10(x)), m = x / Math.pow(10, e); return m.toFixed(2) + "e" + e; }
    function words(x) { return x >= 1e12 ? (x / 1e12).toFixed(2) + " trillion" : x >= 1e9 ? (x / 1e9).toFixed(1) + " billion" : (x / 1e6).toFixed(0) + " million"; }
    function draw() {
      var P = pal(), c = fit(cv, 250), ctx = c.ctx, W = c.W, H = c.H, L = 48, R = W - 12, top = 12, bot = H - 32, n0 = 7, n1 = 13;
      var C = Math.pow(10, lc), N = Math.pow(10, ln), D = C / (6 * N), loss = DL.chinLoss(N, D), best = DL.chinBest(C);
      var pts = [], ymin = Infinity, ymax = -Infinity, i;
      for (i = 0; i <= 240; i++) { var x = n0 + (n1 - n0) * i / 240, v = DL.chinLoss(Math.pow(10, x), C / (6 * Math.pow(10, x))); pts.push([x, v]); ymin = Math.min(ymin, v); }
      ymax = ymin + 0.6;
      function X(x) { return L + (R - L) * (x - n0) / (n1 - n0); } function Y(v) { return bot - (bot - top) * (Math.min(v, ymax) - ymin + 0.02) / (ymax - ymin + 0.04); }
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.fillStyle = P.ink2; ctx.font = "11px " + P.font; ctx.textAlign = "center";
      for (var e = n0; e <= n1; e++) { line(ctx, [[X(e), top], [X(e), bot]]); ctx.fillText("1e" + e, X(e), bot + 14); }
      ctx.fillText(W > 420 ? "parameters N (the rest of the budget is tokens: D = C / 6N)" : "parameters N (tokens D = C / 6N)", (L + R) / 2, bot + 28);
      ctx.textAlign = "right"; ctx.fillText(ymin.toFixed(2), L - 4, Y(ymin) + 4); ctx.fillText((ymin + 0.5).toFixed(2), L - 4, Y(ymin + 0.5) + 4);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2; line(ctx, pts.map(function (q) { return [X(q[0]), Y(q[1])]; }));
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(X(ln), Y(loss), 6, 0, 7); ctx.fill();
      var ok = loss - best.L < 0.001;
      DL.clear(read);
      DL.add(read, [h("span", {}, ["budget C ", h("b", { text: fmt(C) })]), h("span", {}, ["model ", h("b", { text: words(N) + " parameters" })]),
        h("span", {}, ["data ", h("b", { text: words(D) + " tokens" })]), h("span", {}, ["tokens per parameter ", h("b", { text: (D / N).toFixed(1) })]),
        h("span", {}, ["loss ", h("b", { text: loss.toFixed(4) })]),
        ok ? h("span", {}, [h("b", { text: "✓ the lowest loss for this budget" })]) : h("span", {}, ["above this budget's best by ", h("b", { text: (loss - best.L).toFixed(4) })])]);
    }
    var sc = slider("compute budget, log₁₀ C ", 19, 25.5, 0.05, lc, function (v) { return "1e" + v.toFixed(2); }, function (v) { lc = v; draw(); });
    var sn = slider("model size, log₁₀ N ", 7, 13, 0.01, ln, function (v) { return v.toFixed(2); }, function (v) { ln = v; draw(); });
    var body = reveal("What you found", "- For a fixed budget the loss is U-shaped in the model size: too small a model cannot use the data, too large a model sees too few tokens. Every budget has a **compute-optimal** model, and on this loss surface it trains on about 20 tokens per parameter, almost independently of the budget.\n- Raising the budget moves the optimum right, but less than proportionally: ten times the compute buys a model about $10^{0.51} \\approx 3.3$ times larger, and the rest goes to data. This is the **Chinchilla** scaling law (section 5); the closed form is $N^* \\propto C^{\\beta/(\\alpha+\\beta)}$.\n- GPT-3 put its budget into 175 billion parameters and 300 billion tokens, under 2 tokens per parameter. By this law it was several times too large for its compute. Labs now often go far the other way, past the optimum, because a smaller model is cheaper to run (section 5).");
    body.appendChild(h("div", { class: "w-row" }, [
      h("button", { class: "btn quiet small", text: "Set GPT-3's choice", onclick: function () { lc = Math.log10(6 * 175e9 * 300e9); ln = Math.log10(175e9); sc.set(lc); sn.set(ln); draw(); } }),
      h("button", { class: "btn quiet small", text: "Jump to this budget's optimum", onclick: function () { ln = Math.log10(DL.chinBest(Math.pow(10, lc)).N); sn.set(ln); draw(); } })
    ]));
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "One budget, many ways to spend it" })]),
      h("p", { class: "w-task", text: "Training a language model with N parameters on D tokens costs about C = 6·N·D operations. The curve is the loss predicted by a published fit (section 5) for every way of splitting a fixed budget C between N and D." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "At a budget of 1e23, move the model size to the lowest loss. How many tokens per parameter is that?" }),
        h("li", { text: "Multiply the budget by 10 (one step of 1 in log₁₀ C) and find the best size again. By what factor did it grow?" }),
        h("li", { text: "Open “What you found” and set GPT-3's choice. How far is it from the best model for the same budget?" })
      ]),
      cv, read, h("div", { class: "w-ctl" }, [sc.el, sn.el]), body
    ]);
    var un = watch(cv, draw); draw();
    return { destroy: function () { un(); } };
  };

  /* ================= week 9: the evidence lower bound in a model where everything is known ================= */
  DL.elboToy = function (x, s2, m, v) {
    var lp = -0.5 * Math.log(2 * Math.PI * (1 + s2)) - x * x / (2 * (1 + s2)), pm = x / (1 + s2), pv = s2 / (1 + s2);
    var el = -0.5 * Math.log(2 * Math.PI * s2) - ((x - m) * (x - m) + v) / (2 * s2) - 0.5 * Math.log(2 * Math.PI) - (m * m + v) / 2 + 0.5 * Math.log(2 * Math.PI * Math.E * v);
    var kl = 0.5 * (v / pv + (m - pm) * (m - pm) / pv - 1 + Math.log(pv / v));
    return { logp: lp, elbo: el, kl: kl, pm: pm, pv: pv };
  };
  DL.WIDGETS.elbo = function (host) {
    var x = 1.5, s2 = 0.5, m = 0, v = 1;
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "The posterior density of z and your approximation q, with bars for log p(x) and the evidence lower bound" });
    var read = h("div", { class: "w-read" });
    function N(z, mu, var_) { return Math.exp(-(z - mu) * (z - mu) / (2 * var_)) / Math.sqrt(2 * Math.PI * var_); }
    function draw() {
      var P = pal(), c = fit(cv, 240), ctx = c.ctx, W = c.W, H = c.H, r = DL.elboToy(x, s2, m, v);
      var bw = W < 420 ? 26 : 40, bg = W < 420 ? 14 : 24, split = W - (2 * bw + bg + 36), L = 14, R = split - 14, top = 16, bot = H - 26, lo = -3, hi = 4;
      function X(z) { return L + (R - L) * (z - lo) / (hi - lo); } function Y(d) { return bot - (bot - top) * d / 1.3; }
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; line(ctx, [[L, bot], [R, bot]]);
      ctx.fillStyle = P.ink2; ctx.font = "11px " + P.font; ctx.textAlign = "center";
      [-2, 0, 2, 4].forEach(function (t) { ctx.fillText(String(t).replace("-", "−"), X(t), bot + 14); });
      function curve(f, col, wdt, dash) { var pts = []; for (var i = 0; i <= 200; i++) { var z = lo + (hi - lo) * i / 200; pts.push([X(z), Y(f(z))]); } ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.setLineDash(dash || []); line(ctx, pts); ctx.setLineDash([]); }
      curve(function (z) { return N(z, r.pm, r.pv); }, P.ink, 2);
      curve(function (z) { return N(z, m, v); }, P.accent, 2, [6, 4]);
      ctx.textAlign = "left"; ctx.fillStyle = P.ink; ctx.fillText("posterior p(z | x)", L + 4, top + 10); ctx.fillStyle = P.accent; ctx.fillText("your q(z)", L + 4, top + 26);
      // bars: log p(x) and the ELBO, on a common scale
      var bx = split + 20, lo2 = -6, hi2 = 0;
      function YB(v2) { return top + (bot - top) * (hi2 - Math.max(lo2, v2)) / (hi2 - lo2); }
      [[r.logp, P.ink, "log p(x)"], [r.elbo, P.accent, "ELBO"]].forEach(function (b, k) {
        var xx = bx + k * (bw + bg); ctx.fillStyle = b[1]; ctx.globalAlpha = 0.8; ctx.fillRect(xx, top, bw, YB(b[0]) - top); ctx.globalAlpha = 1;
        ctx.fillStyle = P.ink2; ctx.textAlign = "center"; ctx.fillText(b[2], xx + bw / 2, bot + 14); ctx.fillText(b[0].toFixed(3), xx + bw / 2, Math.min(bot - 4, YB(b[0]) + 14));
      });
      ctx.textAlign = "left"; ctx.fillStyle = P.ink2; ctx.fillText("0", bx - 14, top + 4);
      DL.clear(read);
      DL.add(read, [h("span", {}, ["log p(x) ", h("b", { text: r.logp.toFixed(4) })]), h("span", {}, ["ELBO ", h("b", { text: r.elbo.toFixed(4) })]),
        h("span", {}, ["gap ", h("b", { text: (r.logp - r.elbo).toFixed(4) })]), r.logp - r.elbo < 5e-4 ? h("span", {}, [h("b", { text: "✓ the bound is tight" })]) : null]);
      return r;
    }
    var sm = slider("mean of q ", -2, 3, 0.01, m, function (t) { return t.toFixed(2); }, function (t) { m = t; draw(); });
    var sv = slider("variance of q ", 0.05, 2, 0.01, v, function (t) { return t.toFixed(2); }, function (t) { v = t; draw(); });
    var sx = slider("observation x ", -3, 3, 0.05, x, function (t) { return t.toFixed(2); }, function (t) { x = t; draw(); });
    var body = reveal("What you found", "- The lower bar never rises above the upper one: for every $q$, the **evidence lower bound** satisfies $\\mathrm{ELBO}(q) \\le \\log p(x)$.\n- The gap closes exactly when $q$ is the posterior: here mean $x/1.5$ and variance $1/3$. In fact the gap *is* $\\mathrm{KL}(q\\,\\|\\,p(z\\mid x))$ (section 3), so maximizing the ELBO over $q$ is variational inference, and maximizing it over the model's parameters at the same time is how a VAE is trained.\n- Changing $x$ moves the posterior. A VAE's *encoder* is a network that outputs a good $q$ for each $x$ in one pass, instead of optimizing $q$ afresh for every data point.");
    body.appendChild(h("div", { class: "w-row" }, [h("button", { class: "btn quiet small", text: "Set q to the posterior", onclick: function () { var r = DL.elboToy(x, s2, m, v); m = r.pm; v = r.pv; sm.set(m); sv.set(v); draw(); } })]));
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "A lower bound you can see" })]),
      h("p", { class: "w-task", text: "A tiny latent-variable model: a hidden z ~ N(0, 1) and an observation x ~ N(z, 0.5). Given x, the posterior over z (black) is known exactly here. Pick an approximation q = N(mean, variance) (orange). The bars compare the true log-likelihood log p(x) with a quantity, the ELBO, that only needs q and samples from it." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "Move the mean and variance of q. Can you make the orange bar longer than the black one, that is, push the ELBO above log p(x)?" }),
        h("li", { text: "Find the q that brings the two bars together. What is it?" }),
        h("li", { text: "Change the observation x. What has to change in q?" })
      ]),
      cv, read, h("div", { class: "w-ctl" }, [sm.el, sv.el, sx.el]), body
    ]);
    var un = watch(cv, draw); draw();
    return { destroy: function () { un(); } };
  };

  /* ================= week 7: a lookup made soft ================= */
  DL.softWeights = function (q, keys, beta) {
    var s = keys.map(function (k) { return beta * (q[0] * k[0] + q[1] * k[1]); }), m = Math.max.apply(null, s), e = s.map(function (v) { return Math.exp(v - m); }), z = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (v) { return v / z; });
  };
  DL.WIDGETS.softlookup = function (host) {
    var ANG = [20, 80, 150, 215, 300], NAMES = ["A", "B", "C", "D", "E"], VAL = [1, 2, 3, 4, 5];
    var keys = ANG.map(function (a) { return [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]; });
    var qa = 112, ql = 1.0, beta = 4, drag = false;
    var cv = h("canvas", { class: "w-canvas", role: "img", "aria-label": "Five key vectors and the query vector", style: "touch-action:none;max-width:420px;margin:0 auto" });
    var bars = h("div", { style: "display:grid;gap:5px;align-content:center;padding:6px;border-radius:6px;min-width:0" });
    var out = h("div", { class: "w-read" });
    var sB = slider("Sharpness (scores are multiplied by) ", 0, 12, 0.1, beta, function (v) { return v.toFixed(1); }, function (v) { beta = v; draw(); });
    var sA = slider("Query direction ", 0, 360, 1, qa, function (v) { return Math.round(v) + "°"; }, function (v) { qa = v; draw(); });
    var sL = slider("Query length ", 0, 1.5, 0.01, ql, function (v) { return v.toFixed(2); }, function (v) { ql = v; draw(); });
    function q() { return [ql * Math.cos(qa * Math.PI / 180), ql * Math.sin(qa * Math.PI / 180)]; }
    function geom() { var W = Math.max(220, Math.floor(cv.clientWidth)), H = Math.min(W, 300); return { W: W, H: H, sc: Math.min(W, H) / 3.5, cx: W / 2, cy: H / 2 }; }
    function fromPointer(e) {
      var r = cv.getBoundingClientRect(), g = geom(), x = (e.clientX - r.left - g.cx) / g.sc, y = -(e.clientY - r.top - g.cy) / g.sc;
      ql = Math.min(1.5, Math.sqrt(x * x + y * y)); qa = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; sA.set(qa); sL.set(ql); draw();
    }
    cv.addEventListener("pointerdown", function (e) { drag = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} fromPointer(e); });
    cv.addEventListener("pointermove", function (e) { if (drag) fromPointer(e); });
    cv.addEventListener("pointerup", function () { drag = false; }); cv.addEventListener("pointercancel", function () { drag = false; });
    function draw() {
      var g = geom(), c = fit(cv, g.H), ctx = c.ctx, P = pal(), Q = q(), w = DL.softWeights(Q, keys, beta);
      ctx.fillStyle = P.surface; ctx.fillRect(0, 0, g.W, g.H);
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; [0.5, 1, 1.5].forEach(function (r) { ctx.beginPath(); ctx.arc(g.cx, g.cy, r * g.sc, 0, 6.2832); ctx.stroke(); });
      ctx.font = "600 13px " + P.font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      keys.forEach(function (k, j) {
        var col = P.s[j]; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5 + 5 * w[j];
        arrow(ctx, g.cx, g.cy, g.cx + k[0] * g.sc, g.cy - k[1] * g.sc, 9);
        ctx.fillStyle = P.ink; ctx.fillText(NAMES[j], g.cx + k[0] * g.sc * 1.2, g.cy - k[1] * g.sc * 1.2);
      });
      ctx.strokeStyle = P.ink; ctx.fillStyle = P.ink; ctx.lineWidth = 3; arrow(ctx, g.cx, g.cy, g.cx + Q[0] * g.sc, g.cy - Q[1] * g.sc, 11);
      ctx.beginPath(); ctx.arc(g.cx + Q[0] * g.sc, g.cy - Q[1] * g.sc, 9, 0, 6.2832); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = "11px " + P.font; ctx.fillStyle = P.ink2; ctx.textAlign = "left"; ctx.fillText("query: drag it", 8, 12);
      DL.clear(bars);
      w.forEach(function (a, j) {
        bars.appendChild(h("div", { style: "display:grid;grid-template-columns:112px minmax(0,1fr) 48px;gap:8px;align-items:center;font-size:12.5px" }, [
          h("span", { text: "key " + NAMES[j] + " · value " + VAL[j] }),
          h("span", { style: "height:12px;border-radius:3px;background:var(--surface-2);overflow:hidden;display:block" }, h("span", { style: "display:block;height:100%;width:" + (a * 100).toFixed(1) + "%;background:var(--c-s" + (j + 1) + ")" })),
          h("b", { class: "num", style: "text-align:right;font-weight:500", text: (a * 100).toFixed(a > 0.0995 ? 0 : 1) + "%" })
        ]));
      });
      var y = w.reduce(function (s, a, j) { return s + a * VAL[j]; }, 0), top = w.indexOf(Math.max.apply(null, w));
      DL.clear(out);
      DL.add(out, [h("span", {}, ["output = Σ weight × value = ", h("b", { text: y.toFixed(2) })]), h("span", {}, ["largest weight ", h("b", { text: (w[top] * 100).toFixed(0) + "% on " + NAMES[top] })]), top === 3 && w[3] >= 0.85 ? h("span", {}, [h("b", { text: "✓ D has " + (w[3] * 100).toFixed(0) + "% of the weight, so the output is close to D's value, 4" })]) : null]);
    }
    DL.add(host, [
      h("div", { class: "w-h" }, [h("span", { class: "tag sim", text: "Sketch" }), h("b", { text: "A lookup made soft" })]),
      h("p", { class: "w-task", text: "Five keys, A to E, each a direction in the plane, each holding a value, 1 to 5. The black arrow is the query. Every key gets a score, its dot product with the query times the sharpness, and softmax turns the scores into weights. The output is the weighted average of the values." }),
      h("ol", { class: "w-task", style: "margin:0;padding-left:24px" }, [
        h("li", { text: "Point the query along D. Which value does the output come close to, and what keeps it from being exactly that value?" }),
        h("li", { text: "Leave the query there and lower the sharpness to 0. What is the output, and why?" }),
        h("li", { text: "Set the sharpness back to 4 and change only the length of the query. What does length do?" })
      ]),
      h("div", { class: "w-split" }, [cv, bars]),
      out,
      h("div", { class: "w-ctl" }, [sB.el, sA.el, sL.el]),
      reveal("What you found", "- The query along D gives D most of the weight, and the output is close to D's value. It is not exactly 4, because the other keys keep a little weight. Raise the sharpness and the weights collapse onto the best-matching key: the output becomes that key's value. That is a table lookup.\n- With sharpness 0 every key gets weight $\\tfrac15$ and the output is the plain average, 3. Everything in between is a weighted average: a lookup that can be differentiated.\n- Lengthening the query multiplies every score by the same factor, exactly as the sharpness does. Direction decides *which* key, length decides *how firmly*.\n\nIn a transformer the query, keys and values are learned linear images of the token vectors, the dimension is in the tens or hundreds instead of 2, and the fixed factor $1/\\sqrt{d_k}$ sets the sharpness the layer starts with (section 1).")
    ]);
    var un = watch(cv, draw); draw();
    return { destroy: function () { un(); } };
  };

  /* ================= static diagrams (inline SVG; colours come from the theme through CSS classes) ================= */
  var DEFS = '<defs><marker id="ah-i" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-i"/></marker>' +
    '<marker id="ah-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-a"/></marker></defs>';
  function svg(vb, minW, label, body) { return '<div class="scroll"><svg viewBox="' + vb + '" style="min-width:' + minW + 'px" role="img" aria-label="' + label + '">' + DEFS + body + '</svg></div>'; }
  DL.FIGS = {
    backprop: function () {
      var y = 60, b = '';
      function node(x, t) { return '<circle cx="' + x + '" cy="' + y + '" r="16" class="nd"/><text x="' + x + '" y="' + (y + 5) + '" class="tx c">' + t + '</text>'; }
      function box(x, w, t, t2) { return '<rect x="' + (x - w / 2) + '" y="' + (y - 22) + '" width="' + w + '" height="44" rx="6" class="bx"/><text x="' + x + '" y="' + (y - 2) + '" class="tx c">' + t + '</text><text x="' + x + '" y="' + (y + 14) + '" class="ts c">' + t2 + '</text>'; }
      function fwd(x0, x1) { return '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>'; }
      b += '<text x="8" y="18" class="ts">forward pass: compute and store</text>';
      b += node(26, 'a⁰') + fwd(43, 62) + box(106, 84, '× W¹ + b¹', 'affine') + fwd(149, 166) + node(184, 'z¹') + fwd(201, 216) + box(242, 48, 'h', 'ReLU') + fwd(267, 282) + node(300, 'a¹') + fwd(317, 336) + box(380, 84, '× W² + b²', 'affine') + fwd(423, 440) + node(458, 'z²') + fwd(475, 490) + box(538, 92, 'softmax, −ln', 'loss, label y') + fwd(585, 600) + '<text x="612" y="' + (y + 5) + '" class="tx c">ℓ</text>';
      var yb = 190;
      b += '<text x="8" y="' + (yb + 40) + '" class="ts a">backward pass: one row vector travels right to left</text>';
      b += '<text x="458" y="' + (yb + 5) + '" class="tx c a">δ² = p − e_y</text><text x="184" y="' + (yb + 5) + '" class="tx c a">δ¹ = (δ² W²ᵀ) ⊙ h′(z¹)</text>';
      b += '<path d="M538,' + (y + 24) + ' C538,140 500,' + (yb - 30) + ' 474,' + (yb - 14) + '" class="ln a" marker-end="url(#ah-a)"/>';
      b += '<line x1="408" y1="' + yb + '" x2="276" y2="' + yb + '" class="ln a" marker-end="url(#ah-a)"/>';
      b += '<text x="380" y="126" class="tx c">∇W² = a¹ᵀ δ²</text><text x="106" y="126" class="tx c">∇W¹ = a⁰ᵀ δ¹</text>';
      b += '<path d="M300,' + (y + 17) + ' L340,112" class="ln d"/><path d="M450,' + (yb - 14) + ' L412,134" class="ln d a"/>';
      b += '<path d="M26,' + (y + 17) + ' L66,112" class="ln d"/><path d="M176,' + (yb - 14) + ' L138,134" class="ln d a"/>';
      return svg("0 0 624 240", 540, "Forward and backward pass through a two-layer network", b);
    },
    block: function () {
      var b = '', sx = 150;
      b += '<line x1="' + sx + '" y1="372" x2="' + sx + '" y2="30" class="ln w" marker-end="url(#ah-i)"/>';
      b += '<text x="' + sx + '" y="392" class="tx c">x  (one position)</text><text x="' + sx + '" y="20" class="tx c">y</text>';
      function sub(yIn, yOut, t1, t2) {
        var s = '';
        s += '<path d="M' + sx + ',' + yIn + ' H300 V' + (yIn - 14) + '" class="ln" marker-end="url(#ah-i)"/>';
        s += '<rect x="240" y="' + (yIn - 44) + '" width="120" height="28" rx="5" class="bx"/><text x="300" y="' + (yIn - 25) + '" class="ts c">layer norm</text>';
        s += '<line x1="300" y1="' + (yIn - 44) + '" x2="300" y2="' + (yIn - 58) + '" class="ln" marker-end="url(#ah-i)"/>';
        s += '<rect x="216" y="' + (yIn - 104) + '" width="168" height="44" rx="6" class="bx"/><text x="300" y="' + (yIn - 85) + '" class="tx c">' + t1 + '</text><text x="300" y="' + (yIn - 69) + '" class="ts c">' + t2 + '</text>';
        s += '<path d="M300,' + (yIn - 104) + ' V' + yOut + ' H' + (sx + 14) + '" class="ln" marker-end="url(#ah-i)"/>';
        s += '<circle cx="' + sx + '" cy="' + yOut + '" r="11" class="nd"/><text x="' + sx + '" y="' + (yOut + 5) + '" class="tx c">+</text>';
        return s;
      }
      b += sub(340, 216, 'multi-head attention', 'softmax(QKᵀ/√d_k) V');
      b += sub(186, 62, 'MLP', 'd → 4d → d, GELU');
      b += '<text x="402" y="248" class="ts a">reads the other positions j ≤ i</text>';
      b += '<path d="M398,244 H388" class="ln a" marker-end="url(#ah-a)"/>';
      b += '<text x="402" y="110" class="ts">same weights at every position</text>';
      b += '<text x="' + (sx - 14) + '" y="130" class="ts" text-anchor="end">residual</text><text x="' + (sx - 14) + '" y="146" class="ts" text-anchor="end">stream</text>';
      return svg("0 0 600 400", 420, "One pre-normalization transformer block", b);
    },
    /* week 1, section 3: T, T∘T, T∘T∘T. Each composition doubles the number of linear pieces. */
    sawtooth: function () {
      var b = '', W = 170, H = 100, y0 = 40, xs = [26, 228, 430], names = ['T', 'T ∘ T', 'T ∘ T ∘ T'];
      for (var k = 1; k <= 3; k++) {
        var x0 = xs[k - 1], n = 1 << k, pts = [];
        for (var j = 0; j <= n; j++) pts.push([x0 + W * j / n, y0 + (j % 2 ? 0 : H)]);
        b += '<rect x="' + x0 + '" y="' + y0 + '" width="' + W + '" height="' + H + '" class="gr"/>' + poly(pts, 'ln a w2');
        b += txt(x0 + W / 2, y0 - 12, 'tx c', names[k - 1]);
        b += txt(x0 - 6, y0 + 5, 'ts e', '1') + txt(x0 - 6, y0 + H + 4, 'ts e', '0') + txt(x0 + W, y0 + H + 15, 'ts e', '1');
        b += txt(x0 + W / 2, y0 + H + 24, 'tx c', n + ' pieces');
        b += txt(x0 + W / 2, y0 + H + 42, 'ts c', k + (k > 1 ? ' layers' : ' layer') + ' of width 2');
        if (k > 1) b += txt(x0 + W / 2, y0 + H + 58, 'ts c', 'in one layer: at least ' + (n - 1) + ' units');
      }
      return svg("0 0 624 206", 500, "The tent map composed with itself: 2, 4 and 8 linear pieces from 1, 2 and 3 layers of width 2", b);
    },
    /* week 4, section 2: the factor by which one step multiplies the component along an eigenvector of curvature λ,
       κ = 100, best constant settings. Gradient descent: |1 − ηλ|. Heavy ball: the larger root of r² − (1 + μ − ηλ) r + μ. */
    rates: function () {
      var X0 = 56, X1 = 604, Y0 = 24, Y1 = 196, lo = Math.log(0.3), hi = Math.log(150), top = 1.12, b = '';
      var kappa = 100, eg = 2 / (1 + kappa), rt = Math.sqrt(kappa), eh = Math.pow(2 / (1 + rt), 2), mu = Math.pow((rt - 1) / (rt + 1), 2);
      function X(l) { return X0 + (X1 - X0) * (Math.log(l) - lo) / (hi - lo); }
      function Y(v) { return Y1 - (Y1 - Y0) * v / top; }
      function gd(l) { return Math.abs(1 - eg * l); }
      function hb(l) { var c = 1 + mu - eh * l, d = c * c - 4 * mu; return d <= 0 ? Math.sqrt(mu) : (Math.abs(c) + Math.sqrt(d)) / 2; }
      var ls = [1, 1 / eg, kappa, 2 * (1 + mu) / eh, 2 / eg], i;
      for (i = 0; i <= 240; i++) ls.push(Math.exp(lo + (hi - lo) * i / 240));
      ls.sort(function (p, q) { return p - q; });
      function curve(f, cls) {
        var pts = [];
        for (var k = 0; k < ls.length; k++) { var v = f(ls[k]); if (v > top) { pts.push([X(ls[k]), Y(top)]); break; } pts.push([X(ls[k]), Y(v)]); }
        return poly(pts, cls);
      }
      b += '<rect x="' + f1(X(1)) + '" y="' + Y0 + '" width="' + f1(X(kappa) - X(1)) + '" height="' + (Y1 - Y0) + '" class="ar"/>';
      [0, 0.5, 1].forEach(function (v) { b += '<line x1="' + X0 + '" y1="' + f1(Y(v)) + '" x2="' + X1 + '" y2="' + f1(Y(v)) + '" class="gr"/>' + txt(X0 - 8, f1(Y(v) + 4), 'ts e', v); });
      [[1, 'λ₁ = 1'], [10, '10'], [kappa, 'λₙ = 100']].forEach(function (t) { b += '<line x1="' + f1(X(t[0])) + '" y1="' + Y1 + '" x2="' + f1(X(t[0])) + '" y2="' + (Y1 + 5) + '" class="gr"/>' + txt(f1(X(t[0])), Y1 + 19, 'ts c', t[1]); });
      b += txt((X0 + X1) / 2, Y1 + 38, 'ts c', 'curvature λ of the direction (logarithmic axis)');
      b += txt(f1((X(1) + X(kappa)) / 2), Y1 - 8, 'ts c', 'the spectrum of H');
      b += curve(hb, 'ln s2') + curve(gd, 'ln s1');
      [1, kappa].forEach(function (l) { b += '<circle cx="' + f1(X(l)) + '" cy="' + f1(Y(gd(l))) + '" r="3.2" class="dot s1"/>' + (l === 1 ? txt(f1(X(l)), f1(Y(gd(l)) - 9), 'ts c', '0.980') : txt(f1(X(l) - 9), f1(Y(gd(l)) - 9), 'ts e', '0.980')); });
      b += txt(X0 - 40, 14, 'ts', 'factor per step (1 = no progress)');
      b += txt(f1(X(1) + 10), f1(Y(Math.sqrt(mu)) + 17), 'ts', 'heavy ball: 0.818 throughout');
      b += txt(f1(X(25) - 30), f1(Y(0.5) - 4), 'ts e', 'gradient descent,') + txt(f1(X(25) - 30), f1(Y(0.5) + 12), 'ts e', 'fast only in the middle');
      return svg("0 0 624 242", 520, "Per-step contraction factor against curvature for gradient descent and heavy ball, condition number 100", b);
    },
    /* week 4, section 8: the score y (u·x) is N(m, 1) in every dimension; the attack shifts it by ε√d. */
    shift: function () {
      var X0 = 30, X1 = 606, base = 172, sc = (X1 - X0) / 12, hgt = 190, m = 3, b = '';
      function X(v) { return X0 + (v + 5) * sc; }
      function pdf(v, mean) { return Math.exp(-(v - mean) * (v - mean) / 2) / Math.sqrt(2 * Math.PI); }
      function bell(mean, from) { var pts = []; for (var k = Math.round(from * 10); k <= 70; k++) pts.push([X(k / 10), base - hgt * pdf(k / 10, mean)]); return pts; }
      var moved = m - 3.2, kept = bell(moved, 0);
      b += '<polygon points="' + [[X(0), base]].concat(kept, [[X(7), base]]).map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' ') + '" class="ar"/>';
      b += '<line x1="' + X0 + '" y1="' + base + '" x2="' + X1 + '" y2="' + base + '" class="gr"/>';
      [-3, 0, 3, 6].forEach(function (v) { b += '<line x1="' + f1(X(v)) + '" y1="' + base + '" x2="' + f1(X(v)) + '" y2="' + (base + 5) + '" class="gr"/>' + txt(f1(X(v)), base + 19, 'ts c', String(v).replace('-', '−')); });
      b += txt((X0 + X1) / 2, base + 38, 'ts c', 'score y · (u · x), in units of the noise');
      b += '<line x1="' + f1(X(0)) + '" y1="14" x2="' + f1(X(0)) + '" y2="' + base + '" class="ln d"/>';
      b += txt(f1(X(0) - 8), 24, 'ts e', 'misclassified') + txt(f1(X(0) + 8), 24, 'ts', 'correct');
      b += poly(bell(moved, -5), 'ln a') + poly(bell(m, -5), 'ln');
      [[16, 0.4], [64, 0.8], [256, 1.6], [1024, 3.2]].forEach(function (r, k) {
        var y = 42 + 14 * k;
        b += '<line x1="' + f1(X(m)) + '" y1="' + y + '" x2="' + f1(X(m - r[1]) + 2) + '" y2="' + y + '" class="ln a" marker-end="url(#ah-a)"/>';
        b += txt(f1(X(m) + 8), y + 4, 'ts', 'd = ' + r[0] + ': ' + (k === 0 ? 'shift ' : '') + r[1] + (k === 3 ? ' = ε√d' : ''));
      });
      b += txt(f1(X(4.35)), 122, 'ts', 'clean: N(m, 1),') + txt(f1(X(4.35)), 138, 'ts', 'm = 3');
      b += txt(f1(X(-1.55)), 116, 'ts e a', 'attacked,') + txt(f1(X(-1.55)), 132, 'ts e a', 'd = 1024');
      b += txt(f1(X(0) + 7), base - 12, 'ts', '42%');
      return svg("0 0 624 216", 520, "The attack shifts the score distribution left by epsilon times the square root of the dimension", b);
    },
    /* week 9, section 2: a generative adversarial network */
    ganfig: function () {
      var b = '';
      function box(x, y, w, t, cls) { return '<rect x="' + x + '" y="' + (y - 18) + '" width="' + w + '" height="36" rx="6" class="bx"/>' + txt(x + w / 2, y + 5, cls || 'tx c', t); }
      b += txt(36, 109, 'tx c', 'z') + '<line x1="50" y1="105" x2="96" y2="105" class="ln" marker-end="url(#ah-i)"/>' + box(98, 105, 110, 'generator G') + '<line x1="208" y1="105" x2="266" y2="105" class="ln" marker-end="url(#ah-i)"/>' + txt(300, 109, 'ts c', 'G(z): fake');
      b += txt(300, 39, 'ts c', 'x: real data') + '<line x1="334" y1="35" x2="398" y2="68" class="ln" marker-end="url(#ah-i)"/>' + '<line x1="334" y1="105" x2="398" y2="78" class="ln" marker-end="url(#ah-i)"/>';
      b += box(400, 72, 130, 'discriminator D') + '<line x1="530" y1="72" x2="560" y2="72" class="ln" marker-end="url(#ah-i)"/>' + txt(586, 68, 'ts c', 'P(real)');
      b += '<path d="M465,92 C465,150 153,150 153,125" class="ln a" marker-end="url(#ah-a)"/>' + txt(310, 160, 'ts c a', 'G is trained through D: make D call its samples real');
      return svg("0 0 620 172", 480, "A generator maps noise to fake samples; a discriminator scores real and fake samples; the generator is trained through the discriminator", b);
    },
    /* week 9, section 3: a variational autoencoder */
    vaefig: function () {
      var b = '';
      function box(x, y, w, t) { return '<rect x="' + x + '" y="' + (y - 18) + '" width="' + w + '" height="36" rx="6" class="bx"/>' + txt(x + w / 2, y + 5, 'tx c', t); }
      b += txt(24, 64, 'tx c', 'x') + '<line x1="36" y1="60" x2="62" y2="60" class="ln" marker-end="url(#ah-i)"/>' + box(64, 60, 92, 'encoder');
      b += '<line x1="156" y1="60" x2="186" y2="60" class="ln" marker-end="url(#ah-i)"/>' + txt(222, 64, 'tx c', 'μ(x), σ(x)');
      b += '<line x1="258" y1="60" x2="300" y2="60" class="ln" marker-end="url(#ah-i)"/>' + '<rect x="302" y="42" width="128" height="36" rx="6" class="cell on"/>' + txt(366, 65, 'tx c', 'z = μ + σ ⊙ ε');
      b += txt(366, 120, 'ts c', 'ε ~ N(0, I)') + '<line x1="366" y1="106" x2="366" y2="80" class="ln" marker-end="url(#ah-i)"/>';
      b += '<line x1="430" y1="60" x2="460" y2="60" class="ln" marker-end="url(#ah-i)"/>' + box(462, 60, 92, 'decoder') + '<line x1="554" y1="60" x2="580" y2="60" class="ln" marker-end="url(#ah-i)"/>' + txt(598, 64, 'tx c', 'x̂');
      b += txt(310, 150, 'ts c', 'loss = reconstruction error + KL(q(z | x) ‖ N(0, I)); ε enters from the side, so gradients reach μ, σ');
      return svg("0 0 620 162", 500, "An encoder outputs a mean and a standard deviation; a sample is formed by adding scaled noise; a decoder reconstructs the input", b);
    },
    /* week 8, section 2: byte-pair encoding of one word */
    bpefig: function () {
      var b = '', rows = [['␣', 'l', 'o', 'w', 'e', 'r'], ['␣l', 'o', 'w', 'e', 'r'], ['␣l', 'ow', 'e', 'r'], ['␣low', 'e', 'r'], ['␣low', 'er']];
      var notes = ['start: characters', 'merge ␣ + l (frequent in training)', 'merge o + w', 'merge ␣l + ow', 'merge e + r: 2 tokens'];
      rows.forEach(function (r, i) {
        var y = 16 + i * 40, x = 30;
        r.forEach(function (t) { var w = 22 + 12 * t.length; b += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="28" rx="4" class="cell' + (i === rows.length - 1 ? ' on' : '') + '"/>' + txt(x + w / 2, y + 19, 'tx c', t); x += w + 6; });
        b += txt(300, y + 19, 'ts', notes[i]);
      });
      return svg("0 0 560 " + (16 + rows.length * 40), 440, "The word lower with its leading space, merged step by step from six characters into two tokens", b);
    },
    /* week 8, section 3: the stages of training a chat model */
    stages: function () {
      var b = '', y = 46, xs = [20, 220, 420], w = 180;
      var t = [['pretraining', 'next-token prediction on', 'trillions of tokens of text'], ['supervised fine-tuning', 'imitate thousands of', 'written demonstrations'], ['preference tuning', 'RLHF or DPO on human', 'or AI comparisons (week 13)']];
      xs.forEach(function (x, i) {
        b += '<rect x="' + x + '" y="' + (y - 26) + '" width="' + w + '" height="78" rx="8" class="bx"/>' + txt(x + w / 2, y - 6, 'tx c', t[i][0]) + txt(x + w / 2, y + 16, 'ts c', t[i][1]) + txt(x + w / 2, y + 32, 'ts c', t[i][2]);
        if (i) b += '<line x1="' + (xs[i - 1] + w + 2) + '" y1="' + (y + 12) + '" x2="' + (x - 3) + '" y2="' + (y + 12) + '" class="ln" marker-end="url(#ah-i)"/>';
      });
      b += txt(110, y + 70, 'ts c', 'almost all of the compute') + txt(410, y + 70, 'ts c', 'a small fraction: shapes behaviour, not knowledge');
      return svg("0 0 620 " + (y + 80), 480, "Three boxes: pretraining, then supervised fine-tuning, then preference tuning", b);
    },
    /* week 6, section 1: a recurrent network and its unrolling */
    unroll: function () {
      var b = '', y = 80, xs = [210, 310, 410, 510];
      b += '<rect x="30" y="' + (y - 20) + '" width="70" height="40" rx="6" class="bx"/>' + txt(65, y + 5, 'tx c', 'h');
      b += '<path d="M100,' + (y - 8) + ' C140,' + (y - 50) + ' 130,' + (y + 50) + ' 100,' + (y + 8) + '" class="ln" marker-end="url(#ah-i)"/>' + txt(140, y + 4, 'ts', 'U');
      b += '<line x1="65" y1="' + (y + 62) + '" x2="65" y2="' + (y + 22) + '" class="ln" marker-end="url(#ah-i)"/>' + txt(65, y + 76, 'ts c', 'x_t') + txt(165, y + 4, 'tx', '=');
      xs.forEach(function (x, i) {
        b += '<rect x="' + (x - 30) + '" y="' + (y - 20) + '" width="60" height="40" rx="6" class="bx"/>' + txt(x, y + 5, 'tx c', 'h' + (i + 1));
        b += '<line x1="' + x + '" y1="' + (y + 62) + '" x2="' + x + '" y2="' + (y + 22) + '" class="ln" marker-end="url(#ah-i)"/>' + txt(x, y + 76, 'ts c', 'x' + (i + 1));
        if (i > 0) b += '<line x1="' + (xs[i - 1] + 30) + '" y1="' + y + '" x2="' + (x - 32) + '" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>' + txt((xs[i - 1] + x) / 2, y - 6, 'ts c', 'U');
        if (i > 0) b += '<line x1="' + (x - 32) + '" y1="' + (y + 14) + '" x2="' + (xs[i - 1] + 30) + '" y2="' + (y + 14) + '" class="ln a" marker-end="url(#ah-a)"/>';
      });
      b += '<line x1="540" y1="' + y + '" x2="580" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>' + txt(592, y + 4, 'ts', 'loss');
      b += txt(360, y - 54, 'ts c', 'the same U and W at every step');
      b += txt(360, y - 36, 'ts c a', 'backward (blue): one Jacobian per step');
      return svg("0 0 640 170", 500, "A recurrent cell with a loop, and the same cell unrolled over four time steps with shared weights; gradients flow back through every step", b);
    },
    /* week 6, section 4: greedy decoding against beam search on a small tree */
    beamtree: function () {
      var b = '', x0 = 60, x1 = 250, x2 = 430;
      var first = [['A', 0.5, 40], ['B', 0.4, 120], ['C', 0.1, 190]];
      var second = { A: [['x', 0.4, 16], ['y', 0.3, 46], ['z', 0.3, 76]], B: [['x', 0.9, 104], ['y', 0.05, 128], ['z', 0.05, 152]] };
      b += '<circle cx="' + x0 + '" cy="115" r="6" class="nd"/>';
      first.forEach(function (n) {
        b += '<line x1="' + (x0 + 6) + '" y1="115" x2="' + (x1 - 14) + '" y2="' + n[2] + '" class="ln' + (n[0] === 'A' ? ' d' : n[0] === 'B' ? ' a' : '') + '"/>' + txt(x1 - 18, n[2] - 10, 'ts e', String(n[1]));
        b += '<circle cx="' + x1 + '" cy="' + n[2] + '" r="12" class="nd"/>' + txt(x1, n[2] + 5, 'tx c', n[0]);
        (second[n[0]] || []).forEach(function (m) {
          var good = n[0] === 'B' && m[0] === 'x', gr = n[0] === 'A' && m[0] === 'x';
          b += '<line x1="' + (x1 + 12) + '" y1="' + n[2] + '" x2="' + (x2 - 12) + '" y2="' + m[2] + '" class="ln' + (gr ? ' d' : good ? ' a' : '') + '"/>' + '';
          b += txt(x2, m[2] + 4, 'ts', n[0] + m[0] + ': ' + n[1] + ' × ' + m[1] + ' = ' + (n[1] * m[1]).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
        });
      });
      b += txt(330, 214, 'ts c', 'dashed: greedy takes A (0.5), then x (0.4): 0.2.   blue: a beam of width 2 keeps A and B and finds Bx: 0.36');
      return svg("0 0 640 226", 520, "A two-step tree of next-token probabilities in which greedy decoding finds a sequence of probability 0.2 and beam search one of probability 0.36", b);
    },
    /* week 6, section 5: an encoder-decoder for translation */
    encdec: function () {
      var b = '', y = 70, xe = [40, 120, 200, 280], xd = [400, 480, 560];
      var src = ['the', 'cat', 'sat', '&lt;end&gt;'], tgt = ['le', 'chat', "s'assit"];
      xe.forEach(function (x, i) {
        b += '<rect x="' + x + '" y="' + (y - 16) + '" width="56" height="32" rx="6" class="bx"/>' + txt(x + 28, y + 5, 'ts c', 'enc');
        b += '<line x1="' + (x + 28) + '" y1="' + (y + 56) + '" x2="' + (x + 28) + '" y2="' + (y + 18) + '" class="ln" marker-end="url(#ah-i)"/>' + txt(x + 28, y + 70, 'ts c', src[i]);
        if (i) b += '<line x1="' + (xe[i - 1] + 56) + '" y1="' + y + '" x2="' + (x - 2) + '" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>';
      });
      b += '<line x1="336" y1="' + y + '" x2="396" y2="' + y + '" class="ln a" marker-end="url(#ah-a)"/>' + txt(366, y - 10, 'ts c a', 'one vector');
      xd.forEach(function (x, i) {
        b += '<rect x="' + x + '" y="' + (y - 16) + '" width="56" height="32" rx="6" class="bx"/>' + txt(x + 28, y + 5, 'ts c', 'dec');
        b += '<line x1="' + (x + 28) + '" y1="' + (y - 18) + '" x2="' + (x + 28) + '" y2="' + (y - 46) + '" class="ln" marker-end="url(#ah-i)"/>' + txt(x + 28, y - 52, 'ts c', tgt[i]);
        if (i) { b += '<line x1="' + (xd[i - 1] + 56) + '" y1="' + y + '" x2="' + (x - 2) + '" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>';
          b += '<path d="M' + (xd[i - 1] + 34) + ',' + (y - 46) + ' C' + (xd[i - 1] + 50) + ',' + (y - 20) + ' ' + (x - 10) + ',' + (y + 40) + ' ' + (x + 10) + ',' + (y + 18) + '" class="ln d"/>'; }
      });
      b += txt(320, y + 92, 'ts c', 'the encoder reads the source; its last state starts the decoder, which feeds each output back in');
      return svg("0 0 640 172", 520, "An encoder RNN reads a source sentence into one vector, from which a decoder RNN generates the translation word by word", b);
    },
    /* week 5, section 2: a dense weight matrix against the matrix of a convolution on a cycle */
    circulant: function () {
      var n = 12, c = 17, b = '', ox1 = 40, ox2 = 340, oy = 30, sd = 3, labs = ['a', 'b', 'c'];
      b += txt(ox1 + n * c / 2, 18, 'tx c', 'dense: 144 free weights') + txt(ox2 + n * c / 2, 18, 'tx c', 'convolution on a cycle: 3 weights');
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        sd = (sd * 1103515245 + 12345) % 2147483648; var op = (0.12 + 0.75 * sd / 2147483648).toFixed(2);
        b += '<rect x="' + (ox1 + j * c) + '" y="' + (oy + i * c) + '" width="' + (c - 1) + '" height="' + (c - 1) + '" class="cell on" style="fill-opacity:' + op + '"/>';
        var d = ((j - i) % n + n) % n, k = d === n - 1 ? 0 : d === 0 ? 1 : d === 1 ? 2 : -1;
        b += '<rect x="' + (ox2 + j * c) + '" y="' + (oy + i * c) + '" width="' + (c - 1) + '" height="' + (c - 1) + '" class="cell' + (k >= 0 ? ' on' : '') + '"/>';
        if (k >= 0) b += txt(ox2 + j * c + (c - 1) / 2, oy + i * c + 12, 'ts c', labs[k]);
      }
      b += txt(ox2 + n * c / 2, oy + n * c + 18, 'ts c', 'row i is row i − 1 shifted one place, wrapping around');
      return svg("0 0 600 " + (oy + n * c + 28), 460, "A dense matrix with 144 independent entries next to a circulant matrix with three repeated entries on three diagonals", b);
    },
    /* week 5, section 3: the receptive field of stacked 3-wide convolutions */
    receptive: function () {
      var n = 17, L = 4, dx = 30, ox = 66, b = '', mid = 8;
      function Y(r) { return 26 + (L - r) * 44; } function X(i) { return ox + 10 + i * dx; }
      for (var r = 1; r <= L; r++) { var hw = L - r; for (var i = mid - hw; i <= mid + hw; i++) for (var t = -1; t <= 1; t++)
        b += '<line x1="' + X(i) + '" y1="' + (Y(r) + 6) + '" x2="' + X(i + t) + '" y2="' + (Y(r - 1) - 6) + '" class="ln" style="opacity:0.4"/>'; }
      for (var r2 = 0; r2 <= L; r2++) {
        var w = L - r2;
        b += txt(ox - 12, Y(r2) + 4, 'ts e', r2 === 0 ? 'input' : 'layer ' + r2);
        for (var k = 0; k < n; k++) b += '<circle cx="' + X(k) + '" cy="' + Y(r2) + '" r="6" class="nd' + (Math.abs(k - mid) <= w ? ' on' : '') + '"/>';
      }
      b += txt(X(mid), 12, 'ts c', 'one unit in layer 4');
      b += txt(X(mid), Y(0) + 26, 'ts c', 'depends on 2·4 + 1 = 9 inputs: each layer of width-3 filters adds 2');
      return svg("0 0 600 " + (Y(0) + 34), 480, "Five rows of units; one unit in the top layer depends on a window of inputs that widens by two per layer", b);
    },
    /* week 5, section 5: a residual block */
    resblock: function () {
      var b = '', y = 70;
      function box(x, w, t) { return '<rect x="' + x + '" y="' + (y - 18) + '" width="' + w + '" height="36" rx="6" class="bx"/>' + txt(x + w / 2, y + 5, 'tx c', t); }
      b += txt(40, y + 5, 'tx c', 'h');
      b += '<line x1="56" y1="' + y + '" x2="118" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>' + box(120, 120, 'relu(W h + b)');
      b += '<line x1="240" y1="' + y + '" x2="288" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>' + box(290, 80, 'V ·');
      b += '<line x1="370" y1="' + y + '" x2="434" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>';
      b += '<circle cx="450" cy="' + y + '" r="14" class="nd"/>' + txt(450, y + 6, 'tx c', '+');
      b += '<line x1="464" y1="' + y + '" x2="528" y2="' + y + '" class="ln" marker-end="url(#ah-i)"/>' + txt(560, y + 5, 'tx c', 'h + F(h)');
      b += '<path d="M70,' + (y - 10) + ' C70,10 450,10 450,' + (y - 16) + '" class="ln a" marker-end="url(#ah-a)"/>' + txt(260, 22, 'ts c a', 'identity: the skip connection');
      b += txt(300, y + 42, 'ts c', 'F(h) = V relu(W h + b) is the residual; with V = 0 the block is exactly the identity');
      return svg("0 0 620 130", 480, "A residual block: the input goes through a weight layer, ReLU and a second weight layer, and is added back to the result", b);
    },
    /* week 3, section 1: standardized sums of exponential variables against the normal density */
    clt: function () {
      var X0 = 46, X1 = 600, base = 196, top = 14, lo = -3.5, hi = 4, ymax = 1.04, b = '';
      function lgam(n) { var s = 0; for (var k = 2; k < n; k++) s += Math.log(k); return s; }
      function dens(n, z) { var x = n + Math.sqrt(n) * z; if (x <= 0) return 0; return Math.sqrt(n) * Math.exp((n - 1) * Math.log(x) - x - lgam(n)); }
      function X(v) { return X0 + (X1 - X0) * (v - lo) / (hi - lo); } function Y(v) { return base - (base - top) * v / ymax; }
      function curve(f) { var p = []; for (var i = 0; i <= 300; i++) { var z = lo + (hi - lo) * i / 300; p.push([X(z), Y(Math.min(ymax, f(z)))]); } return p; }
      b += '<line x1="' + X0 + '" y1="' + base + '" x2="' + X1 + '" y2="' + base + '" class="gr"/>';
      [-3, -2, -1, 0, 1, 2, 3, 4].forEach(function (v) { b += '<line x1="' + f1(X(v)) + '" y1="' + base + '" x2="' + f1(X(v)) + '" y2="' + (base + 5) + '" class="gr"/>' + txt(f1(X(v)), base + 19, 'ts c', String(v).replace('-', '−')); });
      b += '<polygon points="' + [[X(lo), base]].concat(curve(function (z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); }), [[X(hi), base]]).map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' ') + '" class="ar"/>';
      var cls = { 1: 'ln s2', 2: 'ln d', 5: 'ln s1', 30: 'ln' };
      [1, 2, 5, 30].forEach(function (n) { b += poly(curve(function (z) { return dens(n, z); }), cls[n]); });
      [['ln s2', 'n = 1'], ['ln d', 'n = 2'], ['ln s1', 'n = 5'], ['ln', 'n = 30']].forEach(function (l, i) { var y = top + 10 + i * 17; b += '<line x1="430" y1="' + y + '" x2="456" y2="' + y + '" class="' + l[0] + '"/>' + txt(462, y + 4, 'ts', l[1]); });
      b += '<rect x="430" y="' + (top + 74) + '" width="26" height="9" class="ar"/>' + txt(462, top + 83, 'ts', 'N(0, 1)');
      return svg("0 0 620 " + (base + 28), 480, "Densities of the standardized sum of n exponential variables for n = 1, 2, 5 and 30, approaching the normal density", b);
    },
    /* week 3, section 3: losses as negative log-densities */
    nll: function () {
      var X0 = 60, X1 = 590, base = 178, top = 14, lo = -3, hi = 3, ymax = 4.6, b = '';
      function X(v) { return X0 + (X1 - X0) * (v - lo) / (hi - lo); } function Y(v) { return base - (base - top) * v / ymax; }
      function curve(f) { var p = []; for (var i = 0; i <= 240; i++) { var z = lo + (hi - lo) * i / 240; p.push([X(z), Y(f(z))]); } return p; }
      var gn = 0.5 * Math.log(2 * Math.PI), bl = 1 / Math.sqrt(2), ln0 = Math.log(2 * bl);
      b += '<line x1="' + X0 + '" y1="' + base + '" x2="' + X1 + '" y2="' + base + '" class="gr"/>' + '<line x1="' + f1(X(0)) + '" y1="' + top + '" x2="' + f1(X(0)) + '" y2="' + base + '" class="gr"/>';
      [-3, -2, -1, 0, 1, 2, 3].forEach(function (v) { b += txt(f1(X(v)), base + 18, 'ts c', String(v).replace('-', '−')); });
      [0, 1, 2, 3, 4].forEach(function (v) { b += txt(X0 - 8, f1(Y(v)) + 4, 'ts e', String(v)); });
      b += poly(curve(function (z) { return z * z / 2 + gn; }), 'ln s1') + poly(curve(function (z) { return Math.abs(z) / bl + ln0; }), 'ln s2');
      b += '<line x1="' + (X0 + 120) + '" y1="' + (top + 8) + '" x2="' + (X0 + 146) + '" y2="' + (top + 8) + '" class="ln s1"/>' + txt(X0 + 152, top + 12, 'ts', 'Gaussian: r²/2 + const (least squares)');
      b += '<line x1="' + (X0 + 120) + '" y1="' + (top + 26) + '" x2="' + (X0 + 146) + '" y2="' + (top + 26) + '" class="ln s2"/>' + txt(X0 + 152, top + 30, 'ts', 'Laplace: √2 |r| + const (absolute deviations)');
      b += txt(X1, base + 34, 'ts e', 'residual r (noise of variance 1); vertical: −ln density');
      return svg("0 0 620 " + (base + 42), 480, "Negative log-densities of Gaussian and Laplace noise of variance 1: a parabola and a V", b);
    },
    /* week 2, section 2: the information diagram for two variables */
    infovenn: function () {
      var b = '', cy = 116, r = 92, c1 = 250, c2 = 370;
      b += '<circle cx="' + c1 + '" cy="' + cy + '" r="' + r + '" class="ar"/><circle cx="' + c2 + '" cy="' + cy + '" r="' + r + '" class="ar"/>';
      b += '<circle cx="' + c1 + '" cy="' + cy + '" r="' + r + '" class="ln"/><circle cx="' + c2 + '" cy="' + cy + '" r="' + r + '" class="ln"/>';
      b += txt(c1 - 52, cy + 5, 'tx c', 'H(X | Y)') + txt((c1 + c2) / 2, cy + 5, 'tx c', 'I(X; Y)') + txt(c2 + 52, cy + 5, 'tx c', 'H(Y | X)');
      b += txt(c1 - r + 6, 22, 'tx e', 'H(X)') + txt(c2 + r - 6, 22, 'tx', 'H(Y)');
      b += '<path d="M' + (c1 - r + 10) + ',26 L' + (c1 - 50) + ',' + (cy - 70) + '" class="ln d"/><path d="M' + (c2 + r - 10) + ',26 L' + (c2 + 50) + ',' + (cy - 70) + '" class="ln d"/>';
      b += txt((c1 + c2) / 2, cy + r + 26, 'ts c', 'H(X, Y) is everything inside either circle, and I(X; Y) = H(X) + H(Y) − H(X, Y)');
      return svg("0 0 620 236", 460, "Two overlapping circles: the entropies of X and Y, their overlap the mutual information, the crescents the conditional entropies", b);
    },
    /* week 2, section 3: one Gaussian fitted to a mixture of two, by minimizing the KL divergence in each direction */
    klfit: function () {
      var X0 = 40, X1 = 600, base = 176, top = 18, lo = -6, hi = 6, ymax = 0.62, n = 481, xs = [], i, b = '';
      function N(x, m, s) { return Math.exp(-(x - m) * (x - m) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI)); }
      function p(x) { return 0.5 * N(x, -2, 0.7) + 0.5 * N(x, 2, 0.7); }
      for (i = 0; i < n; i++) xs.push(lo + (hi - lo) * i / (n - 1));
      var dx = (hi - lo) / (n - 1), px = xs.map(p);
      function rev(m, s) { var d = 0; for (var k = 0; k < n; k++) { var qv = N(xs[k], m, s); if (qv > 1e-300) d += qv * Math.log(qv / Math.max(px[k], 1e-300)) * dx; } return d; }
      // reverse fit: coarse grid, then a finer one around the best point (the mirror image at -m is equally good)
      var bm = 0, bs = 1, bd = Infinity, m, s, d;
      for (m = 0; m <= 3.0001; m += 0.1) for (s = 0.3; s <= 3.0001; s += 0.05) { d = rev(m, s); if (d < bd) { bd = d; bm = m; bs = s; } }
      var cm = bm, cs = bs;
      for (m = cm - 0.1; m <= cm + 0.1001; m += 0.005) for (s = Math.max(0.2, cs - 0.05); s <= cs + 0.0501; s += 0.0025) { d = rev(m, s); if (d < bd) { bd = d; bm = m; bs = s; } }
      var fs = Math.sqrt(0.49 + 4);      // forward fit: match the mean (0) and the variance (0.7² + 2²) of p
      function X(x) { return X0 + (X1 - X0) * (x - lo) / (hi - lo); }
      function Y(v) { return base - (base - top) * v / ymax; }
      function curve(f) { return xs.map(function (x) { return [X(x), Y(f(x))]; }); }
      b += '<polygon points="' + [[X(lo), base]].concat(curve(p), [[X(hi), base]]).map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' ') + '" class="ar"/>';
      b += '<line x1="' + X0 + '" y1="' + base + '" x2="' + X1 + '" y2="' + base + '" class="gr"/>';
      [-4, -2, 0, 2, 4].forEach(function (v) { b += '<line x1="' + f1(X(v)) + '" y1="' + base + '" x2="' + f1(X(v)) + '" y2="' + (base + 5) + '" class="gr"/>' + txt(f1(X(v)), base + 19, 'ts c', String(v).replace('-', '−')); });
      b += poly(curve(p), 'ln') + poly(curve(function (x) { return N(x, 0, fs); }), 'ln s1') + poly(curve(function (x) { return N(x, bm, bs); }), 'ln s2');
      b += txt(f1(X(-2)), f1(Y(p(-2)) - 8), 'ts c', 'p');
      var ly = 30;
      b += '<line x1="' + X0 + '" y1="' + ly + '" x2="' + (X0 + 22) + '" y2="' + ly + '" class="ln s1"/>' + txt(X0 + 28, ly + 4, 'ts', 'q minimizing D(p ‖ q): mean 0, sd ' + fs.toFixed(2));
      b += '<line x1="' + X0 + '" y1="' + (ly + 18) + '" x2="' + (X0 + 22) + '" y2="' + (ly + 18) + '" class="ln s2"/>' + txt(X0 + 28, ly + 22, 'ts', 'q minimizing D(q ‖ p): mean ' + bm.toFixed(2) + ', sd ' + bs.toFixed(2));
      b += txt(X0, ly + 40, 'ts', 'p: two humps, means ±2, sd 0.7 (shaded)');
      return svg("0 0 620 " + (base + 30), 480, "A two-humped density and two Gaussian fits: a broad one covering both humps and a narrow one on a single hump", b);
    },
    /* week 2, section 4: a prefix code as a tree and as dyadic intervals */
    codetree: function () {
      var X0 = 40, X1 = 600, b = '', Yd = [26, 66, 106, 146], iy = 186, ih = 26;
      function X(t) { return X0 + (X1 - X0) * t; }
      var nodes = { r: [0.5, 0], n1: [0.75, 1], n2: [0.875, 2], A: [0.25, 1], B: [0.625, 2], C: [0.8125, 3], D: [0.9375, 3] };
      var edges = [['r', 'A', '0'], ['r', 'n1', '1'], ['n1', 'B', '0'], ['n1', 'n2', '1'], ['n2', 'C', '0'], ['n2', 'D', '1']];
      function at(k) { return [X(nodes[k][0]), Yd[nodes[k][1]]]; }
      edges.forEach(function (e) { var a = at(e[0]), c = at(e[1]); b += '<line x1="' + f1(a[0]) + '" y1="' + a[1] + '" x2="' + f1(c[0]) + '" y2="' + c[1] + '" class="ln"/>' + txt(f1((a[0] + c[0]) / 2 + (e[2] === '0' ? -8 : 8)), f1((a[1] + c[1]) / 2 + 2), 'ts c', e[2]); });
      ['r', 'n1', 'n2'].forEach(function (k) { var a = at(k); b += '<circle cx="' + f1(a[0]) + '" cy="' + a[1] + '" r="4" class="nd"/>'; });
      var leaves = [['A', '0', '1/2', 0, 0.5], ['B', '10', '1/4', 0.5, 0.75], ['C', '110', '1/8', 0.75, 0.875], ['D', '111', '1/8', 0.875, 1]];
      leaves.forEach(function (l) {
        var a = at(l[0]);
        b += '<circle cx="' + f1(a[0]) + '" cy="' + a[1] + '" r="12" class="nd"/>' + txt(f1(a[0]), a[1] + 5, 'tx c', l[0]);
        b += '<line x1="' + f1(a[0]) + '" y1="' + (a[1] + 12) + '" x2="' + f1(a[0]) + '" y2="' + iy + '" class="ln d"/>';
        b += '<rect x="' + f1(X(l[3])) + '" y="' + iy + '" width="' + f1(X(l[4]) - X(l[3])) + '" height="' + ih + '" class="cell"/>';
        b += txt(f1((X(l[3]) + X(l[4])) / 2), iy + 17, 'ts c', l[1]);
      });
      b += txt(f1(X(0.25) - 18), Yd[1] + 5, 'ts e', 'p = 1/2, 1 bit') + txt(f1(X(0.625) - 18), Yd[2] + 5, 'ts e', 'p = 1/4, 2 bits') + txt(f1(X(0.8125) - 18), Yd[3] + 5, 'ts e', 'p = 1/8, 3 bits');
      [[0, '0'], [0.5, '1/2'], [0.75, '3/4'], [0.875, '7/8'], [1, '1']].forEach(function (t) { b += txt(f1(X(t[0])), iy + ih + 16, 'ts c', t[1]); });
      return svg("0 0 640 " + (iy + ih + 24), 500, "The prefix code A = 0, B = 10, C = 110, D = 111 drawn as a binary tree above the dyadic intervals it names", b);
    },
    /* week 2, section 5: arithmetic coding of B, A, D with q = (1/2, 1/4, 1/8, 1/8) */
    arith: function () {
      var X0 = 92, X1 = 560, b = '', rh = 24, gap = 46, q = [0.5, 0.25, 0.125, 0.125], L = ['A', 'B', 'C', 'D'];
      var rows = [{ lo: 0, w: 1, pick: 1, name: 'start', ends: ['0', '1'] }, { lo: 0.5, w: 0.25, pick: 0, name: 'after B', ends: ['1/2', '3/4'] }, { lo: 0.5, w: 0.125, pick: 3, name: 'after B A', ends: ['1/2', '5/8'] }];
      rows.forEach(function (r, i) {
        var y = 14 + i * (rh + gap), a = 0;
        b += txt(X0 - 10, y + 16, 'ts e', r.name);
        q.forEach(function (v, k) {
          var xa = X0 + (X1 - X0) * a, xb = X0 + (X1 - X0) * (a + v);
          b += '<rect x="' + f1(xa) + '" y="' + y + '" width="' + f1(xb - xa) + '" height="' + rh + '" class="cell' + (k === r.pick ? ' on' : '') + '"/>' + txt(f1((xa + xb) / 2), y + 16, 'ts c', L[k]);
          if (k === r.pick) {
            var yn = y + rh + gap;
            b += '<path d="M' + f1(xa) + ',' + (y + rh) + ' L' + X0 + ',' + yn + ' M' + f1(xb) + ',' + (y + rh) + ' L' + X1 + ',' + yn + '" class="ln d"/>';
          }
          a += v;
        });
        b += txt(X0 - 4, y + rh + 12, 'ts e', r.ends[0]) + txt(X1 + 4, y + rh + 12, 'ts', r.ends[1]);
        b += txt(X1 + 10, y + 16, 'ts', 'width ' + ['1', '1/4', '1/8'][i]);
      });
      var y = 14 + 3 * (rh + gap);
      b += txt(X0 - 10, y + 16, 'ts e', 'after B A D');
      b += '<rect x="' + X0 + '" y="' + y + '" width="' + (X1 - X0) + '" height="' + rh + '" class="cell on"/>' + txt((X0 + X1) / 2, y + 16, 'tx c', '[39/64, 40/64) = [0.100111, 0.101000) in binary');
      b += txt(X0 - 4, y + rh + 12, 'ts e', '39/64') + txt(X1 + 4, y + rh + 12, 'ts', '40/64') + txt(X1 + 10, y + 16, 'ts', 'width 1/64');
      b += txt((X0 + X1) / 2, y + rh + 34, 'ts c a', 'codeword 100111: 6 bits = 2 + 1 + 3, the surprisals of B, A, D');
      return svg("0 0 640 " + (y + rh + 44), 520, "Arithmetic coding narrows the unit interval letter by letter; the final interval is named by six binary digits", b);
    },
    /* week 7, section 2: the attention weights of a causal layer, T = 6. */
    mask: function () {
      var b = '', gx = 104, gy = 50, c = 28, T = 6, i, j, sub = ['₂', '₃', '₄', '₅', '₆', '₇'];
      b += txt(gx + T * c / 2, 18, 'ts c', 'input position j');
      for (j = 1; j <= T; j++) b += txt(gx + (j - 0.5) * c, gy - 8, 'ts c', j);
      b += txt(gx - 40, gy + T * c / 2 - 3, 'ts e', 'output') + txt(gx - 40, gy + T * c / 2 + 13, 'ts e', 'position i');
      for (i = 1; i <= T; i++) {
        var cy = gy + (i - 0.5) * c;
        b += txt(gx - 10, cy + 4, 'ts e', i);
        for (j = 1; j <= T; j++) b += '<rect x="' + (gx + (j - 1) * c) + '" y="' + (gy + (i - 1) * c) + '" width="' + c + '" height="' + c + '" class="cell' + (j <= i ? ' on' : '') + '"/>';
        b += '<line x1="' + (gx + T * c + 8) + '" y1="' + cy + '" x2="' + (gx + T * c + 30) + '" y2="' + cy + '" class="ln" marker-end="url(#ah-i)"/>' + txt(gx + T * c + 38, cy + 5, 'tx', 'x' + sub[i - 1]);
      }
      b += txt(gx + T * c + 8, gy - 8, 'ts', 'is trained to predict');
      b += '<rect x="' + gx + '" y="' + (gy + 3 * c) + '" width="' + (4 * c) + '" height="' + c + '" class="ln a w"/>';
      b += txt(360, gy + 3.5 * c - 3, 'ts a', 'y₄ averages x₁, …, x₄ and nothing later;') + txt(360, gy + 3.5 * c + 13, 'ts a', 'shuffling x₁, x₂, x₃ leaves it unchanged');
      var ly = gy + T * c + 18;
      b += '<rect x="' + gx + '" y="' + ly + '" width="14" height="14" class="cell on"/>' + txt(gx + 22, ly + 11, 'ts', 'j ≤ i: allowed. Each row is a probability vector.');
      b += '<rect x="' + gx + '" y="' + (ly + 22) + '" width="14" height="14" class="cell"/>' + txt(gx + 22, ly + 33, 'ts', 'j &gt; i: the score is set to −∞ before the softmax, so the weight is 0.');
      return svg("0 0 620 " + (ly + 46), 540, "Attention weights of a causal layer with six positions: a lower triangular pattern", b);
    }
  };
  function f1(v) { return Math.round(v * 10) / 10; }
  function poly(pts, cls) { return '<polyline points="' + pts.map(function (q) { return f1(q[0]) + ',' + f1(q[1]); }).join(' ') + '" class="' + cls + '"/>'; }
  function txt(x, y, cls, t) { return '<text x="' + x + '" y="' + y + '" class="' + cls + '">' + t + '</text>'; }
})();
