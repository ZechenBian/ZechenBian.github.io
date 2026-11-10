// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* The figures you can play with at the top of each written unit, and the two static diagrams.
 * Each widget is one phenomenon to find by hand before the notes name it:
 *   hinge       (week 1)  fitting a curve with three ReLU hinges is choosing six numbers; a rule can choose them for you
 *   codelen     (week 2)  a letter costs −log₂ q bits; the shortest message comes from the true frequencies, and
 *                         a letter the model thinks rare is expensive
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
