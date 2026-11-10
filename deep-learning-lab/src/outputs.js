// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* Drawing what a run hands back: live curves, headline numbers, and the outputs a script gives to lab
 * (text, table, plot, scatter, heatmap, regions, images; see src/labrt.py). Charts use strategy-lab's QLChart. */
(function () {
  "use strict";
  var h = DL.h, COLORS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
  var O = DL.out = {};
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  /* ---------- curves ---------- */
  /** exp.chart ("auto" for scratch scripts) -> { panels, names, dash } for the keys that occur in the curve */
  O.chartConfig = function (chart, curve) {
    if (chart && chart !== "auto") return chart;
    var keys = {}, order = [];
    curve.forEach(function (p) { for (var k in p) if (k !== "step" && !keys[k]) { keys[k] = 1; order.push(k); } });
    var acc = order.filter(function (k) { return /acc|accuracy/i.test(k); }), rest = order.filter(function (k) { return acc.indexOf(k) < 0; });
    var panels = []; if (rest.length) panels.push({ label: rest.join(", "), keys: rest.slice(0, 8) }); if (acc.length) panels.push({ label: acc.join(", "), keys: acc.slice(0, 8), domain: [0, 1], weight: 0.7 });
    return { panels: panels, names: {} };
  };
  /** A QLChart spec for a training curve; `cmp` is an earlier run's curve, drawn dotted in the same colours */
  O.curveSpec = function (cfg, curve, cmp) {
    var xs = curve.map(function (p) { return p.step; }), panels = [], legend = [], rows = [], ci = 0;
    cfg.panels.forEach(function (pn, pi) {
      var layers = [];
      pn.keys.forEach(function (k) {
        var col = COLORS[ci++ % 8];
        function ys(c) { return c.map(function (p) { var v = p[k]; return !fin(v) ? NaN : pn.floor && v < pn.floor ? pn.floor : v; }); }
        var y = ys(curve); if (!y.some(fin)) return;
        var dash = cfg.dash && cfg.dash[k];
        if (cmp && cmp.length) { var cy = ys(cmp); if (cy.some(fin)) layers.push({ kind: "line", x: cmp.map(function (p) { return p.step; }), y: cy, color: col, width: 1.25, dash: [2, 3], alpha: 0.75 }); }
        layers.push({ kind: "line", x: xs, y: y, color: col, width: 2, dash: dash || null });
        legend.push({ name: (cfg.names && cfg.names[k]) || k, color: col, mark: dash ? "dash" : "line" });
        rows.push({ key: k, name: (cfg.names && cfg.names[k]) || k, color: col, y: y, panel: pi, valid: true });
      });
      if (layers.length) panels.push({ y: { label: pn.label, scale: pn.log ? "log" : undefined, domain: pn.domain || undefined }, weight: pn.weight || 1, layers: layers, _pi: pi });
    });
    if (!panels.length) return null;
    rows.forEach(function (r) { for (var i = 0; i < panels.length; i++) if (panels[i]._pi === r.panel) { r.panel = i; return; } r.valid = false; });
    if (cmp && cmp.length) legend.push({ name: "dotted: the run you are comparing with", color: "neutral", mark: "dash" });
    return {
      height: panels.length > 1 ? 340 : 250, x: { label: "step" }, panels: panels, legend: legend,
      hover: { xs: xs,
        tip: function (i) { return { title: "step " + DL.num(xs[i]), rows: rows.filter(function (r) { return fin(r.y[i]); }).map(function (r) { return { name: r.name, value: DL.num(r.y[i]), color: r.color }; }) }; },
        dots: function (i) { return rows.filter(function (r) { return r.valid && fin(r.y[i]); }).map(function (r) { return { y: r.y[i], color: r.color, panel: r.panel }; }); } }
    };
  };

  /* ---------- headline numbers ---------- */
  function fmtTile(t, r) {
    var v = r[t.k];
    if (v == null) return "—";
    if (typeof v === "string") return v;
    if (t.f === "pct") return DL.pct(v);
    if (t.f === "sci") return v === 0 ? "0" : v.toExponential(2).replace("e+", "e").replace("-", "−");
    if (t.f === "x") return DL.num(v, v < 10 ? 2 : 1) + "×";
    if (t.f === "secs") return DL.secs(v);
    var s = t.d != null ? DL.num(v, t.d) : DL.num(v);
    return t.of && r[t.of] != null ? s + " of " + DL.num(r[t.of]) : s;
  }
  O.tiles = function (tiles, results) {
    // a tile marked nz is only worth showing when its number is not zero
    var list = tiles && tiles.length ? tiles.filter(function (t) { return t.k in results && !(t.nz && !results[t.k]); }) : Object.keys(results).map(function (k) { return { k: k, label: k.replace(/_/g, " ") }; });
    if (!list.length) return null;
    return h("div", { class: "tiles" }, list.map(function (t) { return h("div", { class: "tile" }, [h("span", { text: t.label }), h("b", { text: fmtTile(t, results) })]); }));
  };

  /* ---------- outputs ---------- */
  function bytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function rgb(hex) { hex = hex.replace("#", ""); if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]; return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c) { return "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")"; }
  function ramp(list, t) { t = t < 0 ? 0 : t > 1 ? 1 : t; var x = t * (list.length - 1), i = Math.min(list.length - 2, Math.floor(x)); return mix(list[i], list[i + 1], x - i); }
  function rampOf(name) { return cssv(name).split(",").map(function (s) { return rgb(s.trim()); }); }
  function canvasFor(aspect) {
    var cv = h("canvas", { role: "img" }), S = Math.max(220, Math.min(380, (window.innerWidth || 400) - 96)), dpr = Math.min(3, window.devicePixelRatio || 1);
    var W = S, H = Math.round(S * aspect);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px";
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv: cv, ctx: ctx, W: W, H: H };
  }
  var DRAW = {
    regions: function (o) {
      var c = canvasFor(o.h / o.w), cls = bytes(o.cls), conf = bytes(o.conf), surf = rgb(cssv("--surface")), ink = rgb(cssv("--ink")), cols = COLORS.map(function (n) { return rgb(cssv("--c-" + n)); });
      var cw = c.W / o.w, ch = c.H / o.h, i, j;
      for (i = 0; i < o.h; i++) for (j = 0; j < o.w; j++) { var k = i * o.w + j; c.ctx.fillStyle = css(mix(surf, cols[cls[k] % 8], 0.12 + 0.5 * conf[k] / 255)); c.ctx.fillRect(j * cw, i * ch, cw + 0.6, ch + 0.6); }
      if (o.points && o.extent) {
        var e = o.extent;
        o.points.forEach(function (p, n) {
          var x = (p[0] - e[0]) / (e[1] - e[0]) * c.W, y = (e[3] - p[1]) / (e[3] - e[2]) * c.H, col = cols[(o.labels ? o.labels[n] : 0) % 8];
          c.ctx.beginPath(); c.ctx.arc(x, y, 2.8, 0, 6.2832); c.ctx.fillStyle = css(col); c.ctx.fill(); c.ctx.lineWidth = 0.9; c.ctx.strokeStyle = css(mix(ink, surf, 0.25)); c.ctx.stroke();
        });
      }
      c.cv.setAttribute("aria-label", o.title + (o.frame ? ", " + o.frame : ""));
      var note = "Colour: the predicted class; stronger colour: more confident. Dots: validation points in the colour of their true class." + (o.extent ? " Both axes run from " + DL.num(o.extent[0]) + " to " + DL.num(o.extent[1]) + "." : "");
      return [c.cv, h("div", { class: "scale", text: note, style: "max-width:380px;white-space:normal;font-family:var(--f-ui)" })];
    },
    heatmap: function (o) {
      var c = canvasFor(o.h / o.w), z = bytes(o.b64), cw = c.W / o.w, ch = c.H / o.h, seq = rampOf("--c-seq"), neg = rampOf("--c-div-neg"), pos = rampOf("--c-div-pos"), i, j;
      function col(t) { return o.diverging ? (t < 0.5 ? ramp(neg, (0.5 - t) * 2) : ramp(pos, (t - 0.5) * 2)) : ramp(seq, t); }
      for (i = 0; i < o.h; i++) for (j = 0; j < o.w; j++) { c.ctx.fillStyle = css(col(z[i * o.w + j] / 255)); c.ctx.fillRect(j * cw, i * ch, cw + 0.6, ch + 0.6); }
      c.cv.setAttribute("aria-label", o.title);
      var stops = [0, 0.25, 0.5, 0.75, 1].map(function (t) { return css(col(t)); }).join(",");
      var bar = h("div", { class: "scale" }, [DL.num(o.vmin), h("i", { style: "background:linear-gradient(90deg," + stops + ")" }), DL.num(o.vmax)]);
      var ax = (o.ylabel ? "rows: " + o.ylabel : "") + (o.xlabel ? (o.ylabel ? " · " : "") + "columns: " + o.xlabel : "");
      return [c.cv, bar, ax ? h("div", { class: "scale", text: ax + " (row 1 at the top)", style: "font-family:var(--f-ui)" }) : null];
    },
    images: function (o) {
      var cols = Math.max(1, Math.min(o.cols || 8, o.n)), rows = Math.ceil(o.n / cols), px = bytes(o.b64), pad = 2;
      var cv = h("canvas", { role: "img", "aria-label": o.title }), sc = Math.max(1, Math.min(4, Math.floor(360 / (cols * (o.w + pad)))));
      cv.width = cols * (o.w + pad) + pad; cv.height = rows * (o.h + pad) + pad; cv.style.width = cv.width * sc + "px";
      var ctx = cv.getContext("2d"), img = ctx.createImageData(o.w, o.h), n, k;
      ctx.fillStyle = cssv("--surface-2"); ctx.fillRect(0, 0, cv.width, cv.height);
      for (n = 0; n < o.n; n++) { for (k = 0; k < o.w * o.h; k++) { var v = px[n * o.w * o.h + k]; img.data[4 * k] = img.data[4 * k + 1] = img.data[4 * k + 2] = v; img.data[4 * k + 3] = 255; } ctx.putImageData(img, pad + (n % cols) * (o.w + pad), pad + Math.floor(n / cols) * (o.h + pad)); }
      return [cv];
    }
  };
  function plotSpec(o) {
    var legend = [], layers = o.series.map(function (s, i) { legend.push({ name: s.name, color: COLORS[i % 8] }); return { kind: "line", x: o.x, y: s.y.map(function (v) { return v == null ? NaN : v; }), color: COLORS[i % 8], width: 2 }; });
    return { height: 250, x: { label: o.xlabel || "", scale: o.logx ? "log" : undefined }, panels: [{ y: { label: o.ylabel || "", scale: o.logy ? "log" : undefined }, layers: layers }], legend: legend,
      hover: { xs: o.x, tip: function (i) { return { title: (o.xlabel ? o.xlabel + " " : "") + DL.num(o.x[i]), rows: o.series.map(function (s, k) { return { name: s.name, value: DL.num(s.y[i]), color: COLORS[k % 8] }; }) }; },
        dots: function (i) { return o.series.filter(function (s) { return fin(s.y[i]); }).map(function (s) { return { y: s.y[i], color: COLORS[o.series.indexOf(s) % 8], panel: 0 }; }); } } };
  }
  function scatterSpec(o) {
    var legend = [], layers = o.groups.map(function (g, i) { legend.push({ name: g.name, color: COLORS[i % 8], mark: "dot" }); return { kind: "points", x: g.xy.map(function (p) { return p[0]; }), y: g.xy.map(function (p) { return p[1]; }), color: COLORS[i % 8], r: 2.5, ring: false, alpha: 0.8 }; });
    return { height: 300, x: { label: o.xlabel || "" }, panels: [{ y: { label: o.ylabel || "" }, layers: layers }], legend: legend };
  }
  function cell(v) { return typeof v === "number" ? DL.num(v) : v == null ? "—" : String(v); }
  /** One output (or a group of frames with the same kind and title) as a DOM node. `charts` collects QLChart objects to destroy later. */
  function one(group, charts) {
    var o = group[group.length - 1], box = h("div", { class: "out" }, h("h4", { text: o.title }));
    if (o.kind === "text") box.appendChild(h("pre", { class: "out-text", text: o.text }));
    else if (o.kind === "table") {
      box.appendChild(h("div", { class: "tablewrap" }, h("table", { class: "data" }, [h("thead", {}, h("tr", {}, o.columns.map(function (c) { return h("th", { text: c }); }))), h("tbody", {}, o.rows.map(function (r) { return h("tr", {}, r.map(function (c) { return h("td", { text: cell(c) }); })); }))])));
    } else if (o.kind === "plot" || o.kind === "scatter") {
      var host = h("div", {}); box.appendChild(host);
      var ch = new QLChart.Chart(host, {}); charts.push(ch);
      var show = function (f) { ch.set(f.kind === "plot" ? plotSpec(f) : scatterSpec(f)); };
      show(o); frames(box, group, show);
    } else if (DRAW[o.kind]) {
      var pix = h("div", { class: "pix" }); box.appendChild(pix);
      var paint = function (f) { DL.clear(pix); DL.add(pix, DRAW[f.kind](f)); };
      paint(o); frames(box, group, paint);
    }
    return box;
  }
  function frames(box, group, show) {
    if (group.length < 2) return;
    var lab = h("span", { text: group[group.length - 1].frame }), inp = h("input", { type: "range", min: "0", max: String(group.length - 1), step: "1", value: String(group.length - 1), "aria-label": "Frame" });
    inp.addEventListener("input", function () { var f = group[+inp.value]; lab.textContent = f.frame; show(f); });
    box.appendChild(h("div", { class: "pix" }, h("div", { class: "frame" }, [inp, lab])));
  }
  /** All outputs of a run. Returns { el, destroy } */
  O.render = function (outputs) {
    var charts = [], el = h("div", { style: "display:grid;gap:14px;min-width:0" }), groups = [], index = {};
    (outputs || []).forEach(function (o) {
      var key = o.kind + "\u0000" + o.title;
      if (o.frame != null && index[key]) index[key].push(o); else { var g = [o]; groups.push(g); if (o.frame != null) index[key] = g; }
    });
    groups.forEach(function (g) { try { el.appendChild(one(g, charts)); } catch (e) { el.appendChild(h("p", { class: "hint", text: "One output could not be drawn (" + g[0].title + ")." })); console.error(e); } });
    return { el: el, destroy: function () { charts.forEach(function (c) { c.destroy(); }); } };
  };
})();
