// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 机器学习实验室 · 画图
 * 折线、柱状、热力图用策略实验室的图表层（src/charts.js，QLChart）；决策面、图片、点云这些"像素图"自己用 Canvas 画。
 * 颜色都取自 CSS 变量（--c-s1 … --c-s8 等），所以明暗主题切换以后重画即可。
 * 每个函数只管画，不管数据从哪来：参数是一次运行的结果（格式见 src/ml/DESIGN.md §5）里的某一部分。 */
var QLMLViz = (function () {
  "use strict";
  var C = QLChart, F = C.fmtNum, G = C.fmtG;
  var SER = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

  /* ---------- 小工具 ---------- */
  function css(name, el) { return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim(); }
  function hexRgb(h) { h = String(h).trim(); if (h.charAt(0) === "#") { if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; } var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(h); return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128]; }
  function palette(el) { return SER.map(function (s) { return hexRgb(css("--c-" + s, el)); }); }
  function ramp(name, el) { return css(name, el).split(",").map(function (x) { return hexRgb(x); }); }
  function lerpRamp(r, t) { t = Math.max(0, Math.min(1, t)); var x = t * (r.length - 1), i = Math.min(r.length - 2, Math.floor(x)), f = x - i, a = r[i], b = r[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  function rgb(c, a) { return a == null ? "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")" : "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")"; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function chart(host, h) { var d = el("div", "ml-chart"); host.appendChild(d); return new C.Chart(d, { height: h || 220 }); }
  /** 一块会跟着宽度缩放的画布：draw(ctx, w, h) 在尺寸变化时重画 */
  function canvasBox(host, aspect, draw, opt) {
    opt = opt || {};
    var wrap = el("div", "ml-cv" + (opt.cls ? " " + opt.cls : "")), cv = el("canvas"); wrap.appendChild(cv); host.appendChild(wrap);
    if (opt.label) cv.setAttribute("aria-label", opt.label); cv.setAttribute("role", "img");
    function paint() {
      var w = Math.max(80, Math.floor(wrap.clientWidth || opt.width || 300)), hh = Math.round(w * aspect), dpr = Math.min(3, window.devicePixelRatio || 1);
      if (opt.maxH && hh > opt.maxH) { hh = opt.maxH; }
      cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); cv.style.width = w + "px"; cv.style.height = hh + "px";
      var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hh); draw(ctx, w, hh);
    }
    var api = { el: wrap, canvas: cv, redraw: paint, set: function (fn) { draw = fn; paint(); }, destroy: function () { if (api.ro) api.ro.disconnect(); } };
    if (window.ResizeObserver) { var last = 0; api.ro = new ResizeObserver(function () { var w = wrap.clientWidth; if (Math.abs(w - last) > 1) { last = w; paint(); } }); api.ro.observe(wrap); }
    paint();
    return api;
  }
  function argmaxRow(P, i, k) { var b = 0, bv = -1; for (var c = 0; c < k; c++) if (P[i * k + c] > bv) { bv = P[i * k + c]; b = c; } return b; }
  function finite(a) { var lo = Infinity, hi = -Infinity; for (var i = 0; i < a.length; i++) { var v = a[i]; if (v === v && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } return [lo, hi]; }
  function pad(r, f) { var s = (r[1] - r[0]) * (f || 0.05) || Math.abs(r[0]) * 0.1 || 1; return [r[0] - s, r[1] + s]; }
  /** 画一个坐标框（不依赖图表层，给像素图用）：返回从数据坐标到像素的两个函数 */
  function frame(ctx, w, h, xr, yr, o) {
    o = o || {}; var L = o.left == null ? 40 : o.left, B = o.bottom == null ? 22 : o.bottom, T = o.top == null ? 6 : o.top, Rr = o.right == null ? 8 : o.right;
    var pw = w - L - Rr, ph = h - T - B, sx = function (x) { return L + (x - xr[0]) / (xr[1] - xr[0]) * pw; }, sy = function (y) { return T + ph - (y - yr[0]) / (yr[1] - yr[0]) * ph; };
    if (o.axes !== false) {
      var ink = css("--c-muted"), font = "11px " + (css("--font-body") || "sans-serif");
      ctx.strokeStyle = css("--c-axis"); ctx.lineWidth = 1; ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);
      ctx.fillStyle = ink; ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "top";
      C.linTicks(xr[0], xr[1], Math.max(2, Math.round(pw / 80))).ticks.forEach(function (v) { var x = sx(v); if (x < L - 1 || x > L + pw + 1) return; ctx.fillText(G(v), x, T + ph + 4); });
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      C.linTicks(yr[0], yr[1], Math.max(2, Math.round(ph / 50))).ticks.forEach(function (v) { var y = sy(v); if (y < T - 1 || y > T + ph + 1) return; ctx.fillText(G(v), L - 5, y); });
      if (o.xLabel) { ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(o.xLabel, L + pw, h - 1); }
      if (o.yLabel) { ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(o.yLabel, L + 4, T + 3); ctx.restore(); }
    }
    return { sx: sx, sy: sy, L: L, T: T, pw: pw, ph: ph };
  }

  /* ---------- 学习曲线 ---------- */
  var CURVE_NAMES = { loss: "训练损失", validLoss: "验证损失", trainMetric: "训练指标", validMetric: "验证指标", trainAcc: "训练准确率", validAcc: "验证准确率", lr: "学习率", gradNorm: "梯度范数", weightNorm: "权重范数" };
  function curveKeys(curve) { var seen = {}; curve.forEach(function (p) { for (var k in p) if (k !== "step") seen[k] = 1; }); return Object.keys(seen); }
  /** 学习曲线：损失一张面板（可选对数坐标），准确率/指标一张，其余（学习率、范数）各自一张 */
  function curve(host, res, opt) {
    opt = opt || {};
    var cv = res.curve || [];
    if (cv.length < 2) { host.appendChild(el("p", "note", "这个算法没有汇报训练过程（代码里没有调用 ctx.report），所以没有学习曲线。")); return null; }
    var xs = cv.map(function (p) { return p.step; }), keys = curveKeys(cv), panels = [], legend = [];
    var lossK = keys.filter(function (k) { return /loss/i.test(k); }), accK = keys.filter(function (k) { return /acc|metric|r2/i.test(k) && lossK.indexOf(k) < 0; }), other = keys.filter(function (k) { return lossK.indexOf(k) < 0 && accK.indexOf(k) < 0; });
    var ci = 0;
    function layerOf(k) { var c = SER[ci++ % SER.length]; legend.push({ name: CURVE_NAMES[k] || k, color: c }); return { kind: "line", x: xs, y: cv.map(function (p) { return p[k] == null ? NaN : p[k]; }), color: c, width: 1.8, dash: /valid/i.test(k) ? [5, 3] : null }; }
    var pos = lossK.every(function (k) { return cv.every(function (p) { return p[k] == null || p[k] > 0; }); });
    if (lossK.length) panels.push({ y: { label: "损失", scale: opt.log !== false && pos ? "log" : "linear" }, layers: lossK.map(layerOf), weight: 1.4 });
    if (accK.length) panels.push({ y: { label: "指标" }, layers: accK.map(layerOf) });
    other.slice(0, 2).forEach(function (k) { panels.push({ y: { label: CURVE_NAMES[k] || k, scale: cv.every(function (p) { return p[k] == null || p[k] > 0; }) && /lr|norm/i.test(k) ? "log" : "linear" }, layers: [layerOf(k)], weight: 0.7 }); });
    if (opt.mark != null) panels.forEach(function (p) { p.layers.push({ kind: "vline", x: opt.mark, color: "muted", width: 1 }); });
    var ch = chart(host, 120 + 110 * panels.length);
    ch.set({ x: { label: "训练步数" }, panels: panels, legend: legend, hover: { xs: xs, tip: function (i) { return { title: "第 " + G(xs[i]) + " 步", rows: keys.filter(function (k) { return cv[i][k] != null; }).map(function (k) { return { name: CURVE_NAMES[k] || k, value: G(cv[i][k]) }; }) }; } } });
    return ch;
  }

  /* ---------- 决策面（二维数据） ---------- */
  /** snap.data = { nx, ny, x0, x1, y0, y1, k, values }；pts = Float32Array [x, y, label]×m（训练集的一部分） */
  function drawSurface(ctx, w, h, snap, pts, opt) {
    opt = opt || {};
    var g = snap.data, k = g.k || 0, pal = palette(), fr = frame(ctx, w, h, [g.x0, g.x1], [g.y0, g.y1], { left: 34, bottom: 20 });
    var off = document.createElement("canvas"); off.width = g.nx; off.height = g.ny;
    var oc = off.getContext("2d"), img = oc.createImageData(g.nx, g.ny), surf = hexRgb(css("--c-surface")), seq = ramp("--c-seq"), V = g.values, i, j;
    var vr = k ? null : finite(V);
    for (j = 0; j < g.ny; j++) for (i = 0; i < g.nx; i++) {
      var q = j * g.nx + i, col, a;
      if (k) { var best = 0, bv = -1, c; for (c = 0; c < k; c++) if (V[q * k + c] > bv) { bv = V[q * k + c]; best = c; } col = pal[best % pal.length]; a = Math.max(0, Math.min(1, (bv - 1 / k) / (1 - 1 / k))); a = 0.18 + 0.5 * a; }
      else { col = lerpRamp(seq, vr[1] > vr[0] ? (V[q] - vr[0]) / (vr[1] - vr[0]) : 0.5); a = 0.75; }
      var o = ((g.ny - 1 - j) * g.nx + i) * 4;
      img.data[o] = surf[0] + (col[0] - surf[0]) * a; img.data[o + 1] = surf[1] + (col[1] - surf[1]) * a; img.data[o + 2] = surf[2] + (col[2] - surf[2]) * a; img.data[o + 3] = 255;
    }
    oc.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, fr.L + 1, fr.T + 1, fr.pw - 1, fr.ph - 1); ctx.restore();
    // 决策边界：对每一类 c 取 F_c = p_c − max_{c'≠c} p_c'，在格点中心之间用"行进方块"插值画出 F_c = 0 的等值线
    if (k) {
      ctx.strokeStyle = rgb(hexRgb(css("--c-ink")), 0.6); ctx.lineWidth = 1.2; ctx.lineJoin = "round"; ctx.beginPath();
      var cw = fr.pw / g.nx, chh = fr.ph / g.ny, nxy = g.nx * g.ny, Fc = new Float32Array(nxy);
      var px = function (x) { return fr.L + (x + 0.5) * cw; }, py = function (y) { return fr.T + (g.ny - 1 - y + 0.5) * chh; };
      for (var c0 = 0; c0 < (k === 2 ? 1 : Math.min(k, 12)); c0++) {
        for (q = 0; q < nxy; q++) { var mo = -Infinity; for (var c1 = 0; c1 < k; c1++) if (c1 !== c0 && V[q * k + c1] > mo) mo = V[q * k + c1]; Fc[q] = V[q * k + c0] - mo; }
        contour(ctx, Fc, g.nx, g.ny, px, py);
      }
      ctx.stroke();
    }
    if (pts) {
      var ring = css("--c-surface"), m = pts.length / 3, r = m > 500 ? 2.2 : 3;
      for (var t = 0; t < m; t++) {
        var x = fr.sx(pts[3 * t]), y = fr.sy(pts[3 * t + 1]); if (!(x >= fr.L && x <= fr.L + fr.pw && y >= fr.T && y <= fr.T + fr.ph)) continue;
        ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 6.2832); ctx.fillStyle = ring; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
        ctx.fillStyle = k ? rgb(pal[pts[3 * t + 2] % pal.length]) : rgb(lerpRamp(seq, vr[1] > vr[0] ? (pts[3 * t + 2] - vr[0]) / (vr[1] - vr[0]) : 0.5)); ctx.fill();
      }
    }
    if (opt.caption) { ctx.fillStyle = css("--c-ink2"); ctx.font = "600 12px " + css("--font-body"); ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(opt.caption, fr.L + 6, fr.T + 4); }
  }
  /** 行进方块：F 在 nx×ny 个格点上，把 F = 0 的线段加进当前路径。px(i)、py(j) 把（可以是小数的）格点下标换成像素 */
  function contour(ctx, F, nx, ny, px, py) {
    function cut(i0, j0, i1, j1) { var a = F[j0 * nx + i0], b = F[j1 * nx + i1], t = a / (a - b); return [px(i0 + (i1 - i0) * t), py(j0 + (j1 - j0) * t)]; }
    function seg(p, r) { ctx.moveTo(p[0], p[1]); ctx.lineTo(r[0], r[1]); }
    for (var j = 0; j + 1 < ny; j++) for (var i = 0; i + 1 < nx; i++) {
      var a = F[j * nx + i], b = F[j * nx + i + 1], c = F[(j + 1) * nx + i + 1], d = F[(j + 1) * nx + i];
      var sa = a > 0, sb = b > 0, sc = c > 0, sd = d > 0;
      if (sa === sb && sb === sc && sc === sd) continue;
      var e = [sa !== sb ? cut(i, j, i + 1, j) : null, sb !== sc ? cut(i + 1, j, i + 1, j + 1) : null, sc !== sd ? cut(i + 1, j + 1, i, j + 1) : null, sd !== sa ? cut(i, j + 1, i, j) : null];
      var on = e.filter(function (x) { return x; });
      if (on.length === 2) seg(on[0], on[1]);
      else if (on.length === 4) { if (((a + b + c + d) / 4 > 0) === sa) { seg(e[0], e[1]); seg(e[2], e[3]); } else { seg(e[3], e[0]); seg(e[1], e[2]); } }
    }
  }
  function surface(host, snap, preview, opt) {
    var pts = preview && preview.scatter ? preview.scatter.pts : null;
    return canvasBox(host, 0.82, function (ctx, w, h) { drawSurface(ctx, w, h, snap, pts, opt); }, { label: "决策面", maxH: 460 });
  }
  /** 只画数据（还没有模型时的预览） */
  function scatter2d(host, preview, opt) {
    var s = preview.scatter; if (!s) return null;
    return canvasBox(host, 0.82, function (ctx, w, h) {
      var xs = [], ys = [], m = s.pts.length / 3; for (var i = 0; i < m; i++) { xs.push(s.pts[3 * i]); ys.push(s.pts[3 * i + 1]); }
      var fr = frame(ctx, w, h, pad(finite(xs), 0.06), pad(finite(ys), 0.06), { left: 34, bottom: 20 }), pal = palette(), seq = ramp("--c-seq"), vr = s.cls ? null : finite(Array.prototype.slice.call(s.pts).filter(function (v, q) { return q % 3 === 2; }));
      var ring = css("--c-surface"), r = m > 500 ? 2.2 : 3;
      for (i = 0; i < m; i++) { var x = fr.sx(s.pts[3 * i]), y = fr.sy(s.pts[3 * i + 1]); ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 6.2832); ctx.fillStyle = ring; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = s.cls ? rgb(pal[s.pts[3 * i + 2] % pal.length]) : rgb(lerpRamp(seq, (s.pts[3 * i + 2] - vr[0]) / ((vr[1] - vr[0]) || 1))); ctx.fill(); }
    }, { label: "数据的散点图", maxH: 420 });
  }
  /** 一维回归：数据点、学到的曲线、真函数（有的话） */
  function fn1d(host, snap, preview, truthPts) {
    var xy = preview && preview.xy ? preview.xy.pts : null;
    var ch = chart(host, 260), xs = Array.from(snap.data.xs), ys = Array.from(snap.data.ys), layers = [], legend = [];
    if (xy) { var px = [], py = []; for (var i = 0; i < xy.length / 2; i++) { px.push(xy[2 * i]); py.push(xy[2 * i + 1]); } layers.push({ kind: "points", x: px, y: py, color: "neutral", r: 2, alpha: 0.55, ring: false }); legend.push({ name: "数据", color: "neutral", mark: "dot" }); }
    if (truthPts) { layers.push({ kind: "line", x: truthPts.x, y: truthPts.y, color: "s3", width: 1.6, dash: [5, 3] }); legend.push({ name: "真函数", color: "s3" }); }
    layers.push({ kind: "line", x: xs, y: ys, color: "s1", width: 2.2 }); legend.push({ name: "学到的函数", color: "s1" });
    ch.set({ x: { label: "x" }, panels: [{ y: { label: "y" }, layers: layers }], legend: legend });
    return ch;
  }

  /* ---------- 回归：预测对实际、残差 ---------- */
  function predActual(host, pred, truth, opt) {
    var n = Math.min(truth.length, 3000), stride = Math.max(1, Math.floor(truth.length / n)), px = [], py = [];
    for (var i = 0; i < truth.length; i += stride) { px.push(truth[i]); py.push(pred[i]); }
    var r = finite(px.concat(py)), ch = chart(host, 260);
    ch.set({ x: { label: "实际值", domain: pad(r, 0.03) }, panels: [{ y: { label: "预测值" }, layers: [{ kind: "line", x: [r[0], r[1]], y: [r[0], r[1]], color: "muted", width: 1, dash: [4, 3] }, { kind: "points", x: px, y: py, color: "s1", r: 2.2, alpha: 0.6, ring: false }] }],
      legend: [{ name: (opt && opt.name) || "验证集", color: "s1", mark: "dot" }, { name: "y = x（完美预测）", color: "muted" }] });
    return ch;
  }
  function histogram(host, values, opt) {
    opt = opt || {}; var v = Array.prototype.slice.call(values).filter(function (x) { return isFinite(x); }); if (!v.length) return null;
    var r = opt.range || finite(v), bins = opt.bins || Math.min(40, Math.max(8, Math.round(Math.sqrt(v.length)))), w = (r[1] - r[0]) / bins || 1, counts = new Array(bins).fill(0);
    v.forEach(function (x) { var b = Math.min(bins - 1, Math.max(0, Math.floor((x - r[0]) / w))); counts[b]++; });
    var ch = chart(host, opt.height || 200), x0 = [], x1 = [], y = [];
    for (var b = 0; b < bins; b++) { x0.push(r[0] + b * w); x1.push(r[0] + (b + 1) * w); y.push(counts[b] / v.length); }
    var layers = [{ kind: "bars", x0: x0, x1: x1, y: y, color: opt.color || "s1" }]; if (opt.vline != null) layers.push({ kind: "vline", x: opt.vline, color: "muted", width: 1, dash: [4, 3] });
    ch.set({ x: { label: opt.xLabel || "" }, panels: [{ y: { label: "占比", zero: true, fmt: function (q) { return C.fmtPct(q, 0); } }, layers: layers }], hover: { xs: x0.map(function (a, i) { return (a + x1[i]) / 2; }), bars: true, tip: function (i) { return { title: G(x0[i]) + " 到 " + G(x1[i]), rows: [{ name: "占比", value: C.fmtPct(y[i], 1) }, { name: "个数", value: String(counts[i]) }] }; } } });
    return ch;
  }
  function residuals(host, pred, truth) { var e = new Float64Array(truth.length); for (var i = 0; i < truth.length; i++) e[i] = truth[i] - pred[i]; return histogram(host, e, { xLabel: "残差 = 实际 − 预测", vline: 0 }); }

  /* ---------- 分类：混淆矩阵、ROC、校准、每一类的准确率 ---------- */
  function confusion(host, pred, truth, k, classes) {
    var M = new Int32Array(k * k), rows = new Int32Array(k), i;
    for (i = 0; i < truth.length; i++) { var p = argmaxRow(pred, i, k); M[truth[i] * k + p]++; rows[truth[i]]++; }
    // 每一行按真实类别归一：格子里是"真实为 i 的样本里，有多少被判成 j"
    var vals = new Float64Array(k * k), names = (classes || []).map(String);
    for (var t = 0; t < k; t++) for (var c = 0; c < k; c++) vals[(k - 1 - t) * k + c] = rows[t] ? M[t * k + c] / rows[t] : NaN;
    var ch = chart(host, Math.min(420, 120 + 26 * k));
    var lab = function (j) { return names[j] != null ? names[j] : String(j); };
    ch.set({ type: "heat", height: Math.min(420, 120 + 26 * k), xs: Array.from({ length: k }, function (_, j) { return j; }), ys: Array.from({ length: k }, function (_, j) { return k - 1 - j; }), values: vals, xLabel: "预测的类别", yLabel: "真实的类别",
      xfmt: function (j) { return k <= 12 ? lab(j) : String(j); }, yfmt: function (j) { return k <= 12 ? lab(j) : String(j); }, fmt: function (v) { return C.fmtPct(v, 0); }, diverging: false,
      tip: function (i2, j2) { var tr = k - 1 - j2; return { title: "真实：" + lab(tr) + " → 预测：" + lab(i2), rows: [{ name: "个数", value: String(M[tr * k + i2]) }, { name: "占这一类的", value: C.fmtPct(vals[j2 * k + i2], 1) }] }; } });
    return ch;
  }
  function rocChart(host, roc) {
    var ch = chart(host, 260);
    ch.set({ x: { label: "假阳性率", domain: [0, 1] }, panels: [{ y: { label: "真阳性率", fmt: function (v) { return C.fmtPct(v, 0); } }, layers: [{ kind: "line", x: [0, 1], y: [0, 1], color: "muted", width: 1, dash: [4, 3] }, { kind: "line", x: Array.from(roc.fpr), y: Array.from(roc.tpr), color: "s1", width: 2.2 }] }],
      legend: [{ name: "ROC，AUC = " + F(roc.auc, 3), color: "s1" }, { name: "随机猜", color: "muted" }] });
    return ch;
  }
  function calibrationChart(host, cal) {
    var ch = chart(host, 240), x = [], y = [], se = [];
    for (var i = 0; i < cal.mid.length; i++) if (cal.count[i] > 0) { x.push(cal.conf[i]); y.push(cal.acc[i]); se.push(Math.sqrt(Math.max(1e-9, cal.acc[i] * (1 - cal.acc[i]) / cal.count[i]))); }
    ch.set({ x: { label: "模型给出的置信度", domain: [0, 1] }, panels: [{ y: { label: "实际正确的比例", fmt: function (v) { return C.fmtPct(v, 0); } }, layers: [{ kind: "line", x: [0, 1], y: [0, 1], color: "muted", width: 1, dash: [4, 3] }, { kind: "errbar", x: x, y: y, se: se, color: "s1" }, { kind: "points", x: x, y: y, color: "s1", r: 3.5 }] }],
      legend: [{ name: "每一档（误差棒 = 1 个标准误）；ECE = " + F(cal.ece, 3), color: "s1", mark: "dot" }, { name: "完美校准", color: "muted" }] });
    return ch;
  }
  function perClass(host, pred, truth, k, classes) {
    var ok = new Float64Array(k), cnt = new Float64Array(k);
    for (var i = 0; i < truth.length; i++) { cnt[truth[i]]++; if (argmaxRow(pred, i, k) === truth[i]) ok[truth[i]]++; }
    var x0 = [], x1 = [], y = [], se = [], xm = [];
    for (var c = 0; c < k; c++) { x0.push(c - 0.4); x1.push(c + 0.4); xm.push(c); var a = cnt[c] ? ok[c] / cnt[c] : NaN; y.push(a); se.push(cnt[c] ? Math.sqrt(Math.max(0, a * (1 - a)) / cnt[c]) : 0); }
    var ch = chart(host, 220), names = classes || [];
    ch.set({ x: { label: "类别", domain: [-0.6, k - 0.4], ticks: xm, fmt: function (v) { var j = Math.round(v); return k <= 12 && names[j] != null ? String(names[j]) : String(j); } }, panels: [{ y: { label: "这一类的准确率", zero: true, fmt: function (v) { return C.fmtPct(v, 0); } }, layers: [{ kind: "bars", x0: x0, x1: x1, y: y, color: "s1" }, { kind: "errbar", x: xm, y: y, se: se, color: "ink2" }] }],
      hover: { xs: xm, bars: true, tip: function (i2) { return { title: String(names[i2] != null ? names[i2] : i2), rows: [{ name: "准确率", value: C.fmtPct(y[i2], 1) + " ± " + C.fmtPct(se[i2], 1) }, { name: "样本数", value: String(cnt[i2]) }] }; } } });
    return ch;
  }

  /* ---------- 时间序列：预测对实际 ---------- */
  /** 画整条序列，验证段和测试段叠上一步预测（H > 1 时画第 h 步） */
  function forecastPlot(host, res, preview, showTest, hSel) {
    var s = preview.series, stride = s.stride || 1, H = res.horizon || 1, h = Math.max(1, Math.min(H, hSel || 1)) - 1, xs = [], ys = [];
    for (var i = 0; i < s.y.length; i++) { xs.push(i * stride); ys.push(s.y[i]); }
    function seg(which) { var o = res.origins[which], pr = res.pred[which], x = [], y = []; if (!o || !pr) return null; for (var q = 0; q <= o[1] - o[0]; q++) { x.push(o[0] + q + 1 + h); y.push(pr[q * H + h]); } return { x: x, y: y }; }
    var va = seg("valid"), te = showTest ? seg("test") : null, layers = [{ kind: "vband", x0: s.t1, x1: s.t2, color: "s4", alpha: 0.07 }, { kind: "vband", x0: s.t2, x1: s.T, color: "s8", alpha: 0.05 }, { kind: "line", x: xs, y: ys, color: "neutral", width: 1.3 }];
    if (va) layers.push({ kind: "line", x: va.x, y: va.y, color: "s1", width: 1.6 });
    if (te) layers.push({ kind: "line", x: te.x, y: te.y, color: "s2", width: 1.6 });
    var ch = chart(host, 280), legend = [{ name: "实际值", color: "neutral" }, { name: "验证段的预测", color: "s1" }];
    if (te) legend.push({ name: "测试段的预测", color: "s2" });
    ch.set({ x: { label: "时刻（浅色底：验证段 / 测试段）" }, panels: [{ y: { label: s.label || "y" }, layers: layers }], legend: legend });
    return ch;
  }
  /** 误差随预测步长的变化（H > 1） */
  function errByH(host, res, which) {
    var H = res.horizon || 1, pr = res.pred[which], tr = res.truth[which]; if (H < 2 || !pr) return null;
    var n = pr.length / H, x = [], y = [];
    for (var h = 0; h < H; h++) { var s = 0; for (var q = 0; q < n; q++) { var d = pr[q * H + h] - tr[q * H + h]; s += d * d; } x.push(h + 1); y.push(Math.sqrt(s / n)); }
    var ch = chart(host, 200); ch.set({ x: { label: "预测步长 h" }, panels: [{ y: { label: "RMSE", zero: true }, layers: [{ kind: "line", x: x, y: y, color: "s1", width: 2 }, { kind: "points", x: x, y: y, color: "s1", r: 3 }] }] });
    return ch;
  }

  /* ---------- 和基线、理论最优比 ---------- */
  /** rows: [{ name, train, valid, test, color }]（test 为 null 表示还没揭晓）；metric 的名字和方向 */
  function compareBars(host, rows, metric, higherBetter, fmt) {
    var groups = ["train", "valid", "test"], gname = { train: "训练", valid: "验证", test: "测试" }, layers = [], legend = [], nR = rows.length, w = 0.8 / nR, xm = [0, 1, 2];
    rows.forEach(function (r, i) {
      var x0 = [], x1 = [], y = [];
      groups.forEach(function (g, gi) { var v = r[g]; x0.push(gi - 0.4 + i * w); x1.push(gi - 0.4 + (i + 1) * w); y.push(v == null ? NaN : v); });
      layers.push({ kind: "bars", x0: x0, x1: x1, y: y, color: r.color || SER[i % SER.length], maxW: 40 }); legend.push({ name: r.name, color: r.color || SER[i % SER.length], mark: "rect" });
    });
    var ch = chart(host, 220);
    ch.set({ x: { label: "", domain: [-0.55, 2.55], ticks: xm, fmt: function (v) { return gname[groups[Math.round(v)]] || ""; } }, panels: [{ y: { label: metric + (higherBetter ? "（越高越好）" : "（越低越好）"), zero: true, fmt: fmt } , layers: layers }], legend: legend,
      hover: { xs: xm, tip: function (gi) { var g = groups[gi]; return { title: gname[g] + "集", rows: rows.map(function (r, i) { return { name: r.name, color: r.color || SER[i % SER.length], mark: "rect", value: r[g] == null ? "未揭晓" : (fmt || G)(r[g]) }; }) }; } } });
    return ch;
  }
  function importanceBars(host, imp) {
    var items = imp.items.slice().sort(function (a, b) { return b.drop - a.drop; }).slice(0, 20), n = items.length;
    var x0 = [], x1 = [], y = [], se = [], xm = [];
    items.forEach(function (it, i) { x0.push(i - 0.4); x1.push(i + 0.4); xm.push(i); y.push(it.drop); se.push(it.se); });
    var ch = chart(host, 230);
    ch.set({ x: { label: "", domain: [-0.6, n - 0.4], ticks: xm, fmt: function (v) { var it = items[Math.round(v)]; return it ? (it.name.length > 8 ? it.name.slice(0, 7) + "…" : it.name) : ""; } }, panels: [{ y: { label: imp.metric === "acc" ? "打乱后准确率下降" : "打乱后 MSE 上升" , zero: true }, layers: [{ kind: "bars", x0: x0, x1: x1, y: y, color: "s3" }, { kind: "errbar", x: xm, y: y, se: se, color: "ink2" }] }],
      hover: { xs: xm, bars: true, tip: function (i) { return { title: items[i].name, rows: [{ name: "变差", value: G(items[i].drop) + " ± " + G(items[i].se) }] }; } } });
    return ch;
  }

  /* ---------- 模型内部 ---------- */
  function weights(host, layer) {
    var R = layer.rows, Cc = layer.cols, maxCells = 64 * 64, sR = Math.max(1, Math.ceil(R / 64)), sC = Math.max(1, Math.ceil(Cc / 64)), nr = Math.ceil(R / sR), nc = Math.ceil(Cc / sC), vals = new Float64Array(nr * nc);
    for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) { var s = 0, m = 0; for (var a = i * sR; a < Math.min(R, (i + 1) * sR); a++) for (var b = j * sC; b < Math.min(Cc, (j + 1) * sC); b++) { s += layer.data[a * Cc + b]; m++; } vals[(nr - 1 - i) * nc + j] = m ? s / m : NaN; }
    var ch = chart(host, Math.max(160, Math.min(360, 60 + 5 * nr)));
    ch.set({ type: "heat", height: Math.max(160, Math.min(360, 60 + 5 * nr)), xs: Array.from({ length: nc }, function (_, j) { return j * sC; }), ys: Array.from({ length: nr }, function (_, i) { return (nr - 1 - i) * sR; }), values: vals, xLabel: "列（输出单元）", yLabel: "行（输入）", cellText: false, fmt: G,
      tip: function (i2, j2) { return { title: "行 " + ((nr - 1 - j2) * sR) + (sR > 1 ? "…" : "") + "，列 " + (i2 * sC) + (sC > 1 ? "…" : ""), rows: [{ name: sR * sC > 1 ? "这一块的平均权重" : "权重", value: G(vals[j2 * nc + i2]) }] }; } });
    return ch;
  }
  function coefBars(host, coef) {
    var items = coef.slice().sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); }).slice(0, 24), n = items.length, x0 = [], x1 = [], y = [], xm = [];
    items.forEach(function (it, i) { x0.push(i - 0.4); x1.push(i + 0.4); xm.push(i); y.push(it.value); });
    var ch = chart(host, 220);
    ch.set({ x: { label: "", domain: [-0.6, n - 0.4], ticks: xm, fmt: function (v) { var it = items[Math.round(v)]; return it ? (it.name.length > 8 ? it.name.slice(0, 7) + "…" : it.name) : ""; } }, panels: [{ y: { label: "系数（按绝对值排）" }, layers: [{ kind: "hline", y: 0, color: "muted", width: 1 }, { kind: "bars", x0: x0, x1: x1, y: y, color: "s1" }] }],
      hover: { xs: xm, bars: true, tip: function (i) { return { title: items[i].name, rows: [{ name: "系数", value: G(items[i].value) }] }; } } });
    return ch;
  }
  /** 嵌入矩阵的前两个主成分（行 = 词表里的元素） */
  function embedPCA(host, emb, labels, color) {
    var R = emb.rows, D = emb.cols, X = emb.data, mean = new Float64Array(D), i, j;
    for (i = 0; i < R; i++) for (j = 0; j < D; j++) mean[j] += X[i * D + j] / R;
    var Z = new Float64Array(R * D); for (i = 0; i < R; i++) for (j = 0; j < D; j++) Z[i * D + j] = X[i * D + j] - mean[j];
    var comps = [], expl = [];
    // 幂迭代取前两个主方向（D 最多几百，R 最多几百，够快）
    var tot = 0; for (i = 0; i < R * D; i++) tot += Z[i] * Z[i];
    for (var c = 0; c < 2; c++) {
      var v = new Float64Array(D); for (j = 0; j < D; j++) v[j] = Math.sin(j * 1.7 + c * 3.1) + 0.01;
      for (var it = 0; it < 80; it++) {
        var u = new Float64Array(R); for (i = 0; i < R; i++) { var s = 0; for (j = 0; j < D; j++) s += Z[i * D + j] * v[j]; u[i] = s; }
        var w = new Float64Array(D); for (i = 0; i < R; i++) for (j = 0; j < D; j++) w[j] += Z[i * D + j] * u[i];
        comps.forEach(function (q) { var dd = 0; for (var t = 0; t < D; t++) dd += w[t] * q[t]; for (t = 0; t < D; t++) w[t] -= dd * q[t]; });
        var nrm = 0; for (j = 0; j < D; j++) nrm += w[j] * w[j]; nrm = Math.sqrt(nrm) || 1; for (j = 0; j < D; j++) v[j] = w[j] / nrm;
      }
      comps.push(v); var ss = 0; for (i = 0; i < R; i++) { var p = 0; for (j = 0; j < D; j++) p += Z[i * D + j] * v[j]; ss += p * p; } expl.push(tot ? ss / tot : 0);
    }
    var px = [], py = []; for (i = 0; i < R; i++) { var a = 0, b = 0; for (j = 0; j < D; j++) { a += Z[i * D + j] * comps[0][j]; b += Z[i * D + j] * comps[1][j]; } px.push(a); py.push(b); }
    return canvasBox(host, 0.9, function (ctx, w2, h2) {
      var fr = frame(ctx, w2, h2, pad(finite(px), 0.12), pad(finite(py), 0.12), { left: 34, bottom: 20, xLabel: "主成分 1（" + C.fmtPct(expl[0], 0) + "）", yLabel: "主成分 2（" + C.fmtPct(expl[1], 0) + "）" }), pal = palette(), seq = ramp("--c-seq");
      ctx.font = "10px " + css("--font-mono"); ctx.textAlign = "left"; ctx.textBaseline = "middle";
      for (var t = 0; t < R; t++) { var x = fr.sx(px[t]), y = fr.sy(py[t]); ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 6.2832); ctx.fillStyle = color ? rgb(lerpRamp(seq, color(t))) : rgb(pal[0]); ctx.fill(); if (R <= 64 && labels) { ctx.fillStyle = css("--c-ink2"); ctx.fillText(String(labels[t]), x + 5, y); } }
    }, { label: "嵌入的主成分", maxH: 420 });
  }
  /** 各个频率的能量占比（模加法：grokking 之后集中在少数几个频率上） */
  function spectrum(host, fourier) {
    var k = fourier.energy.length, x0 = [], x1 = [], y = [], xm = [];
    for (var i = 0; i < k; i++) { x0.push(i + 1 - 0.4); x1.push(i + 1 + 0.4); xm.push(i + 1); y.push(fourier.energy[i]); }
    var ch = chart(host, 210);
    ch.set({ x: { label: "频率 k", domain: [0.4, k + 0.6] }, panels: [{ y: { label: "能量占比", zero: true, fmt: function (v) { return C.fmtPct(v, 0); } }, layers: [{ kind: "hline", y: 1 / k, color: "muted", width: 1, dash: [4, 3], label: "均匀分布 = " + C.fmtPct(1 / k, 1) }, { kind: "bars", x0: x0, x1: x1, y: y, color: "s1" }] }],
      hover: { xs: xm, bars: true, tip: function (i2) { return { title: "频率 " + (i2 + 1), rows: [{ name: "能量占比", value: C.fmtPct(y[i2], 1) }] }; } } });
    return ch;
  }
  /** 按不可约表示分解的方差占比，和随机基线并排 */
  function irrepBars(host, fve) {
    var n = fve.names.length, x0 = [], x1 = [], b0 = [], b1 = [], y = [], yb = [], xm = [];
    for (var i = 0; i < n; i++) { x0.push(i - 0.38); x1.push(i); b0.push(i); b1.push(i + 0.38); xm.push(i); y.push(fve.fve[i]); yb.push(fve.baseline[i]); }
    var ch = chart(host, 220);
    ch.set({ x: { label: "不可约表示", domain: [-0.6, n - 0.4], ticks: xm, fmt: function (v) { return fve.names[Math.round(v)] || ""; } }, panels: [{ y: { label: "方差占比", zero: true, fmt: function (v) { return C.fmtPct(v, 0); } }, layers: [{ kind: "bars", x0: x0, x1: x1, y: y, color: "s1" }, { kind: "bars", x0: b0, x1: b1, y: yb, color: "neutral" }] }],
      legend: [{ name: "学到的嵌入", color: "s1", mark: "rect" }, { name: "随机基线", color: "neutral", mark: "rect" }],
      hover: { xs: xm, tip: function (i2) { return { title: fve.names[i2], rows: [{ name: "嵌入", value: C.fmtPct(y[i2], 1) }, { name: "随机基线", value: C.fmtPct(yb[i2], 1) }] }; } } });
    return ch;
  }

  /* ---------- 数据预览 ---------- */
  function series(host, preview) {
    var s = preview.series, xs = [], ys = Array.from(s.y); for (var i = 0; i < ys.length; i++) xs.push(i * (s.stride || 1));
    var ch = chart(host, 220), layers = [];
    if (s.t1) layers.push({ kind: "vband", x0: s.t1, x1: s.t2, color: "s4", alpha: 0.07 }, { kind: "vband", x0: s.t2, x1: s.T, color: "s8", alpha: 0.05 });
    layers.push({ kind: "line", x: xs, y: ys, color: "s1", width: 1.4 });
    ch.set({ x: { label: "时刻（浅色底：验证段 / 测试段）" }, panels: [{ y: { label: s.label || "y" }, layers: layers }] });
    return ch;
  }
  /** 一排小图片：灰度图（或 ±1 的自旋） */
  function images(host, prev, opt) {
    opt = opt || {}; var im = prev.images; if (!im) return null;
    var H = im.shape[0], W = im.shape[1], d = H * W, wrap = el("div", "ml-thumbs"); host.appendChild(wrap);
    var lo = Infinity, hi = -Infinity; for (var i = 0; i < im.data.length; i++) { if (im.data[i] < lo) lo = im.data[i]; if (im.data[i] > hi) hi = im.data[i]; }
    var ink = hexRgb(css("--c-ink")), bg = hexRgb(css("--c-surface"));
    for (var q = 0; q < im.n; q++) {
      var fig = el("figure", "ml-thumb"), cv = el("canvas"); cv.width = W; cv.height = H; var ctx = cv.getContext("2d"), img = ctx.createImageData(W, H);
      for (i = 0; i < d; i++) { var t = hi > lo ? (im.data[q * d + i] - lo) / (hi - lo) : 0; var o = i * 4; img.data[o] = bg[0] + (ink[0] - bg[0]) * t; img.data[o + 1] = bg[1] + (ink[1] - bg[1]) * t; img.data[o + 2] = bg[2] + (ink[2] - bg[2]) * t; img.data[o + 3] = 255; }
      ctx.putImageData(img, 0, 0); fig.appendChild(cv);
      var lab = prev.classes ? prev.classes[im.labels[q]] : im.labels[q]; fig.appendChild(el("figcaption", "", opt.caption ? opt.caption(q, lab) : String(lab)));
      wrap.appendChild(fig);
    }
    return wrap;
  }
  /** 乘法表（群）：格子 (a, b) 的颜色是 ab 的编号；训练集里的格子实心，其余空心 */
  function cayley(host, table, order, trainMask) {
    return canvasBox(host, 1, function (ctx, w, h) {
      var n = order, s = Math.min(w, h) / n, seq = ramp("--c-seq"), pal = palette(), surf = css("--c-surface");
      for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
        var v = table[a * n + b], col = rgb(lerpRamp(seq, n > 1 ? v / (n - 1) : 0.5)), on = !trainMask || trainMask[a * n + b];
        ctx.fillStyle = on ? col : surf; ctx.fillRect(b * s, a * s, Math.max(1, s - (s > 6 ? 1 : 0)), Math.max(1, s - (s > 6 ? 1 : 0)));
        if (!on) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, s * 0.12); ctx.strokeRect(b * s + 0.5, a * s + 0.5, s - 1.5, s - 1.5); }
      }
    }, { label: "乘法表", maxH: 420, cls: "square" });
  }

  return {
    palette: palette, css: css, rgb: rgb, hexRgb: hexRgb, lerpRamp: lerpRamp, ramp: ramp, frame: frame, canvasBox: canvasBox, chart: chart,
    curve: curve, drawSurface: drawSurface, surface: surface, scatter2d: scatter2d, fn1d: fn1d,
    predActual: predActual, histogram: histogram, residuals: residuals,
    confusion: confusion, rocChart: rocChart, calibrationChart: calibrationChart, perClass: perClass,
    forecastPlot: forecastPlot, errByH: errByH, compareBars: compareBars, importanceBars: importanceBars,
    weights: weights, coefBars: coefBars, embedPCA: embedPCA, spectrum: spectrum, irrepBars: irrepBars,
    series: series, images: images, cayley: cayley, argmaxRow: argmaxRow
  };
})();
