// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 图表层：只用 Canvas 2D，不依赖外部库。
 * 一张图 = 共享 x 轴的若干面板（每个面板只有一条 y 轴，绝不做双轴）或一张热力图。
 * 颜色全部取自 CSS 变量，所以明暗主题切换时重画即可。 */
var QLChart = (function () {
  "use strict";
  var DPR = function () { return Math.min(3, window.devicePixelRatio || 1); };

  /* ---------- 数字格式 ---------- */
  function trimZeros(s) { return s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s; }
  /** 四舍五入之后是 0 的负数（"-0.00"）不带负号 */
  function noNegZero(s) { return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s; }
  function fmtNum(v, digits) {
    if (v === Infinity) return "+∞"; if (v === -Infinity) return "−∞"; if (!(v === v)) return "—";
    var a = Math.abs(v), s;
    if (digits != null) s = noNegZero(v.toFixed(digits));
    else if (a === 0) s = "0";
    else if (a >= 1e6 || a < 1e-4) { s = v.toExponential(2).replace("e+", "e").replace(/\.?0+e/, "e"); }
    else if (a >= 1000) s = Math.round(v).toLocaleString("en-US");
    else if (a >= 100) s = v.toFixed(1);
    else if (a >= 10) s = v.toFixed(2);
    else if (a >= 1) s = v.toFixed(3);
    else s = v.toPrecision(3);
    return s.replace("-", "−");
  }
  /** 紧凑写法：最多 4 位有效数字，去掉末尾的 0（坐标值、参数值用） */
  function fmtG(v) {
    if (v === Infinity) return "+∞"; if (v === -Infinity) return "−∞"; if (!(v === v)) return "—";
    var a = Math.abs(v); if (a !== 0 && (a >= 1e6 || a < 1e-4)) return fmtNum(v);
    return trimZeros((+v.toPrecision(4)).toString()).replace("-", "−");
  }
  function fmtPct(v, digits) {
    if (v === Infinity) return "+∞"; if (v === -Infinity) return "−∞"; if (!(v === v)) return "—";
    var x = v * 100, a = Math.abs(x);
    var d = digits != null ? digits : a >= 100 ? 0 : a >= 10 ? 1 : 2;
    return noNegZero(x.toFixed(d)).replace("-", "−") + "%";
  }
  function fmtTick(v, step) {
    if (v === 0) return "0";
    var a = Math.abs(v);
    if (a >= 1e6 || a < 1e-4) return v.toExponential(1).replace("e+", "e").replace(".0e", "e").replace("-", "−");
    var e10 = Math.floor(Math.log10(Math.abs(step)) + 1e-9), mant = Math.abs(step) / Math.pow(10, e10);
    var d = Math.max(0, Math.min(6, -e10 + (Math.abs(mant - Math.round(mant)) > 1e-6 ? 1 : 0)));   // 步长是 2.5 这一类时要多留一位，否则 0.025 会被写成 0.03
    var s = v.toFixed(d);
    if (a >= 10000) s = Math.round(v).toLocaleString("en-US");
    return s.replace("-", "−");
  }
  function niceStep(span, count) {
    var raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  }
  function linTicks(lo, hi, count) {
    if (!(hi > lo)) return { ticks: [lo], step: 1 };
    var step = niceStep(hi - lo, count), out, tries = 0;
    do { // 至少要有 3 个刻度，否则换更细的一档
      if (tries++) { var mag = Math.pow(10, Math.floor(Math.log10(step) + 1e-9)), r = Math.round(step / mag * 10) / 10; step = (r > 5 ? 5 : r > 2.5 ? 2.5 : r > 2 ? 2 : r > 1 ? 1 : 0.5) * mag; }
      var t0 = Math.ceil(lo / step - 1e-9) * step; out = [];
      for (var v = t0; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    } while (out.length < 3 && tries < 4);
    return { ticks: out, step: step };
  }
  function logTicks(lo, hi) {
    var out = [], e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi)), mult = e1 - e0 <= 2 ? [1, 2, 5] : e1 - e0 <= 5 ? [1, 3] : [1];
    for (var e = e0; e <= e1; e++) for (var i = 0; i < mult.length; i++) { var v = mult[i] * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
    if (out.length < 2) return linTicks(lo, hi, 4);
    return { ticks: out, step: null };
  }

  /* ---------- 颜色 ---------- */
  var TOKENS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "ink", "ink2", "muted", "grid", "axis", "surface", "good", "warn", "serious", "crit", "neutral", "accent"];
  function readColors(el) {
    var cs = getComputedStyle(el), o = {};
    TOKENS.forEach(function (t) { o[t] = (cs.getPropertyValue("--c-" + t) || "").trim() || "#888"; });
    o.seq = (cs.getPropertyValue("--c-seq") || "").trim().split(/\s*,\s*/).filter(Boolean);
    o.divNeg = (cs.getPropertyValue("--c-div-neg") || "").trim().split(/\s*,\s*/).filter(Boolean);
    o.divPos = (cs.getPropertyValue("--c-div-pos") || "").trim().split(/\s*,\s*/).filter(Boolean);
    o.font = (cs.getPropertyValue("--font-body") || "sans-serif").trim();
    o.dark = (cs.getPropertyValue("--is-dark") || "0").trim() === "1";
    return o;
  }
  function hexToRgb(h) {
    h = h.replace("#", ""); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgba(hex, a) { if (hex.charAt(0) !== "#") return hex; var c = hexToRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function lerpRamp(ramp, t) {
    if (!ramp.length) return "#888";
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var x = t * (ramp.length - 1), i = Math.floor(x), f = x - i;
    if (i >= ramp.length - 1) return ramp[ramp.length - 1];
    var a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," + Math.round(a[2] + (b[2] - a[2]) * f) + ")";
  }
  function lum(css) { var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(css), c = m ? [+m[1], +m[2], +m[3]] : hexToRgb(css); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }

  /* ---------- 图表对象 ---------- */
  function Chart(host, opts) {
    opts = opts || {};
    this.host = host; this.spec = null; this.h = opts.height || 240; this.hoverI = -1; this.hoverJ = -1; this.geom = null;
    host.classList.add("qc");
    this.legend = document.createElement("div"); this.legend.className = "qc-legend"; host.appendChild(this.legend);
    this.wrap = document.createElement("div"); this.wrap.className = "qc-wrap"; host.appendChild(this.wrap);
    this.cv = document.createElement("canvas"); this.cv.className = "qc-canvas"; this.cv.tabIndex = 0; this.cv.setAttribute("role", "img"); this.wrap.appendChild(this.cv);
    this.tip = document.createElement("div"); this.tip.className = "qc-tip"; this.tip.hidden = true; this.wrap.appendChild(this.tip);
    this.msg = document.createElement("div"); this.msg.className = "qc-msg"; this.msg.hidden = true; this.wrap.appendChild(this.msg);
    var self = this;
    this._move = function (e) { self.onMove(e); };
    this._leave = function () { self.setHover(-1, -1); };
    this._key = function (e) { self.onKey(e); };
    this.cv.addEventListener("pointermove", this._move); this.cv.addEventListener("pointerdown", this._move);
    this.cv.addEventListener("pointerleave", this._leave); this.cv.addEventListener("blur", this._leave);
    this.cv.addEventListener("keydown", this._key);
    this.cv.addEventListener("click", function (e) { if (self.spec && self.spec.onClick && self.hoverI >= 0) self.spec.onClick(self.hoverI, self.hoverJ); });
    if (window.ResizeObserver) { this.ro = new ResizeObserver(function () { self.draw(); }); this.ro.observe(this.wrap); }
  }
  Chart.prototype.destroy = function () { if (this.ro) this.ro.disconnect(); this.host.textContent = ""; };
  Chart.prototype.set = function (spec) {
    this.spec = spec; this.hoverI = -1; this.hoverJ = -1; this.tip.hidden = true;
    if (spec && spec.height) this.h = spec.height;
    this.renderLegend(); this.draw();
  };
  Chart.prototype.message = function (text) { this.spec = null; this.legend.textContent = ""; this.msg.textContent = text; this.msg.hidden = false; this.draw(); };
  Chart.prototype.renderLegend = function () {
    var L = this.legend, items = (this.spec && this.spec.legend) || [];
    L.textContent = "";
    L.hidden = items.length === 0;
    items.forEach(function (it) {
      var s = document.createElement("span"); s.className = "qc-leg";
      var k = document.createElement("i"); k.className = "qc-key qc-key-" + (it.mark || "line"); k.style.setProperty("--k", "var(--c-" + it.color + ")");
      var t = document.createElement("span"); t.textContent = it.name;
      s.appendChild(k); s.appendChild(t); L.appendChild(s);
    });
  };

  function finiteRange(arrs, positive) {
    var lo = Infinity, hi = -Infinity;
    for (var a = 0; a < arrs.length; a++) { var A = arrs[a]; if (!A) continue; for (var i = 0; i < A.length; i++) { var v = A[i]; if (v === v && v !== Infinity && v !== -Infinity && (!positive || v > 0)) { if (v < lo) lo = v; if (v > hi) hi = v; } } }
    return [lo, hi];
  }
  function layerYs(l) {
    switch (l.kind) {
      case "band": return [l.lo, l.hi];
      case "lines": return l.ys;
      case "bars": return [l.y, [l.base || 0]];
      case "hline": return [[l.y]];
      case "err": case "errbar": return [l.y.map(function (v, i) { return v - (l.se[i] || 0); }), l.y.map(function (v, i) { return v + (l.se[i] || 0); })];
      case "vline": case "vband": return [];
      default: return [l.y];
    }
  }
  function layerXs(l) {
    switch (l.kind) {
      case "bars": return [l.x0, l.x1];
      case "vline": return [[l.x]];
      case "vband": return [[l.x0, l.x1]];
      case "hline": return [];
      default: return [l.x];
    }
  }

  Chart.prototype.layout = function (ctx, C, W, H) {
    var sp = this.spec, panels = sp.panels, i, p;
    // x 轴
    var xd = sp.x.domain ? sp.x.domain.slice() : finiteRange([].concat.apply([], panels.map(function (pn) { return [].concat.apply([], pn.layers.map(layerXs)); })));
    if (!(xd[1] > xd[0])) { xd = [xd[0] - 1, xd[0] + 1]; if (!(xd[0] === xd[0])) xd = [0, 1]; }
    var xlog = sp.x.scale === "log";
    var padB = sp.x.label ? 38 : 24, padT = 6, gapP = 14, stagger = false;
    if (sp.x.stagger && sp.x.ticks && sp.x.fmt) {   // 类别轴：标签一行放不下时错开成两行
      ctx.font = "11px " + C.font; var need = 0; sp.x.ticks.forEach(function (v) { need += ctx.measureText(sp.x.fmt(v)).width + 10; });
      if (need > W - 64) { stagger = true; padB += 13; }
    }
    var totalWeight = 0; panels.forEach(function (pn) { totalWeight += pn.weight || 1; });
    var titleH = 16;
    var availH = H - padB - padT - gapP * (panels.length - 1) - titleH * panels.length;
    // y 轴
    var geo = [], maxLab = 0, y = padT;
    ctx.font = "11px " + C.font;
    for (i = 0; i < panels.length; i++) {
      p = panels[i];
      var ylog = p.y.scale === "log";
      var yd = p.y.domain ? p.y.domain.slice() : finiteRange([].concat.apply([], p.layers.map(layerYs)), ylog);
      if (!(yd[0] === yd[0]) || yd[0] === Infinity) yd = ylog ? [0.5, 2] : [0, 1];
      if (!p.y.domain) {
        if (p.y.zero && !ylog) { if (yd[0] > 0) yd[0] = 0; if (yd[1] < 0) yd[1] = 0; }
        if (!(yd[1] > yd[0])) { var e = Math.abs(yd[0]) * 0.1 || 1; yd = ylog ? [yd[0] / 1.5, yd[0] * 1.5] : [yd[0] - e, yd[1] + e]; }
        else if (ylog) { var f = Math.pow(yd[1] / yd[0], 0.05); yd = [yd[0] / f, yd[1] * f]; }
        else { var pad = (yd[1] - yd[0]) * 0.06; if (!(p.y.zero && yd[0] === 0)) yd[0] -= pad; if (!(p.y.zero && yd[1] === 0)) yd[1] += pad; }
      }
      var ph = Math.max(40, availH * (p.weight || 1) / totalWeight);
      var tk = ylog ? logTicks(yd[0], yd[1]) : linTicks(yd[0], yd[1], Math.max(2, Math.round(ph / 44)));
      var fmt = p.y.fmt || (function (step) { return function (v) { return fmtTick(v, step || v); }; })(tk.step);
      var labs = tk.ticks.map(fmt);
      labs.forEach(function (s) { var w = ctx.measureText(s).width; if (w > maxLab) maxLab = w; });
      geo.push({ top: y + titleH, h: ph, yd: yd, ylog: ylog, ticks: tk.ticks, labs: labs, title: p.y.label || "" });
      y += titleH + ph + gapP;
    }
    var padL = Math.ceil(maxLab) + 12, padR = sp.padR != null ? sp.padR : 14;
    var x0 = padL, x1 = W - padR, pw = x1 - x0;
    var xt = xlog ? logTicks(xd[0], xd[1]) : (sp.x.ticks ? { ticks: sp.x.ticks, step: 1 } : linTicks(xd[0], xd[1], Math.max(2, Math.round(pw / 90))));
    var xfmt = sp.x.fmt || (function (step) { return function (v) { return fmtTick(v, step || v); }; })(xt.step);
    var lx0 = xlog ? Math.log(xd[0]) : xd[0], lx1 = xlog ? Math.log(xd[1]) : xd[1];
    var g = {
      W: W, H: H, x0: x0, x1: x1, xd: xd, xticks: xt.ticks, xfmt: xfmt, stagger: stagger, panels: geo, bottom: geo[geo.length - 1].top + geo[geo.length - 1].h,
      sx: function (v) { return x0 + ((xlog ? Math.log(v) : v) - lx0) / (lx1 - lx0) * pw; },
      ix: function (px) { var u = lx0 + (px - x0) / pw * (lx1 - lx0); return xlog ? Math.exp(u) : u; }
    };
    geo.forEach(function (q) {
      var a = q.ylog ? Math.log(q.yd[0]) : q.yd[0], b = q.ylog ? Math.log(q.yd[1]) : q.yd[1];
      q.sy = function (v) { if (q.ylog) { if (!(v > 0)) v = q.yd[0]; v = Math.log(v); } return q.top + q.h - (v - a) / (b - a) * q.h; };
    });
    return g;
  };

  Chart.prototype.draw = function () {
    var cv = this.cv, W = Math.max(120, Math.floor(this.wrap.clientWidth)), H = this.h, dpr = DPR();
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    cv.style.height = H + "px";
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    this.msg.hidden = !!this.spec;
    if (!this.spec) return;
    this.msg.hidden = true;
    var C = this.C = readColors(this.host);
    if (this.spec.type === "heat") return this.drawHeat(ctx, C, W, H);
    var g = this.geom = this.layout(ctx, C, W, H), sp = this.spec, self = this;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.textBaseline = "middle";
    // x 刻度
    ctx.font = "11px " + C.font; ctx.fillStyle = C.muted; ctx.textAlign = "center";
    var lastR = [-1e9, -1e9];
    g.xticks.forEach(function (v, ti) {
      var px = g.sx(v); if (px < g.x0 - 1 || px > g.x1 + 1) return;
      var s = g.xfmt(v), w = ctx.measureText(s).width, l = Math.min(Math.max(px - w / 2, 0), W - w), row = g.stagger ? ti % 2 : 0;
      if (l < lastR[row] + 8) return; lastR[row] = l + w;
      ctx.fillText(s, l + w / 2, g.bottom + 12 + row * 13);
    });
    if (sp.x.label) { ctx.fillStyle = C.muted; ctx.textAlign = "right"; ctx.fillText(sp.x.label, g.x1, g.bottom + 28 + (g.stagger ? 13 : 0)); }
    sp.panels.forEach(function (pn, k) {
      var q = g.panels[k], sy = q.sy, sx = g.sx;
      // 面板标题（y 轴含义）
      ctx.font = "11px " + C.font; ctx.fillStyle = C.ink2; ctx.textAlign = "left"; ctx.fillText(q.title, 0, q.top - 9);
      // 网格与 y 刻度
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.fillStyle = C.muted; ctx.textAlign = "right";
      q.ticks.forEach(function (v, i) {
        var py = Math.round(sy(v)) + 0.5; if (py < q.top - 1 || py > q.top + q.h + 1) return;
        ctx.beginPath(); ctx.moveTo(g.x0, py); ctx.lineTo(g.x1, py); ctx.stroke();
        ctx.fillText(q.labs[i], g.x0 - 6, py);
      });
      // 零线 / 基线
      if (!q.ylog && q.yd[0] < 0 && q.yd[1] > 0) { ctx.strokeStyle = C.axis; ctx.beginPath(); var zy = Math.round(sy(0)) + 0.5; ctx.moveTo(g.x0, zy); ctx.lineTo(g.x1, zy); ctx.stroke(); }
      ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(g.x0, Math.round(q.top + q.h) + 0.5); ctx.lineTo(g.x1, Math.round(q.top + q.h) + 0.5); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(g.x0 - 1, q.top - 2, g.x1 - g.x0 + 2, q.h + 4); ctx.clip();
      var endLabels = [];
      pn.layers.forEach(function (l) {
        var col = C[l.color] || l.color || C.s1, i, n;
        switch (l.kind) {
          case "vband":
            ctx.fillStyle = rgba(col, l.alpha == null ? 0.08 : l.alpha); ctx.fillRect(sx(l.x0), q.top, sx(l.x1) - sx(l.x0), q.h); break;
          case "band": case "err": {
            var lo = l.kind === "err" ? l.y.map(function (v, j) { return v - (l.se[j] || 0); }) : l.lo, hi = l.kind === "err" ? l.y.map(function (v, j) { return v + (l.se[j] || 0); }) : l.hi;
            ctx.fillStyle = rgba(col, l.alpha == null ? 0.12 : l.alpha);
            // 把序列按"两端都有限"切成段分别填充
            var start = -1; n = l.x.length;
            for (i = 0; i <= n; i++) {
              var okp = i < n && isFinite(lo[i]) && isFinite(hi[i]) && (!q.ylog || (lo[i] > 0 && hi[i] > 0));
              if (okp && start < 0) start = i;
              if (!okp && start >= 0) {
                ctx.beginPath();
                for (var a = start; a < i; a++) { if (a === start) ctx.moveTo(sx(l.x[a]), sy(hi[a])); else ctx.lineTo(sx(l.x[a]), sy(hi[a])); }
                for (a = i - 1; a >= start; a--) ctx.lineTo(sx(l.x[a]), sy(lo[a]));
                ctx.closePath(); ctx.fill(); start = -1;
              }
            }
            break;
          }
          case "lines":
            ctx.strokeStyle = rgba(col, l.alpha == null ? 0.25 : l.alpha); ctx.lineWidth = l.width || 1;
            l.ys.forEach(function (ys) { strokeLine(ctx, l.x, ys, sx, sy, q.ylog); });
            break;
          case "line": case "step":
            ctx.strokeStyle = l.alpha != null ? rgba(col, l.alpha) : col; ctx.lineWidth = l.width || 2; ctx.setLineDash(l.dash || []);
            strokeLine(ctx, l.x, l.y, sx, sy, q.ylog, l.kind === "step"); ctx.setLineDash([]);
            if (l.end) { for (i = l.x.length - 1; i >= 0; i--) if (isFinite(l.y[i])) { endLabels.push({ x: sx(l.x[i]), y: sy(l.y[i]), text: l.end, col: col }); break; } }
            break;
          case "area":
            ctx.fillStyle = rgba(col, l.alpha == null ? 0.1 : l.alpha); ctx.beginPath(); n = l.x.length;
            ctx.moveTo(sx(l.x[0]), sy(l.base || 0)); for (i = 0; i < n; i++) ctx.lineTo(sx(l.x[i]), sy(l.y[i])); ctx.lineTo(sx(l.x[n - 1]), sy(l.base || 0)); ctx.closePath(); ctx.fill();
            break;
          case "bars": {
            n = l.y.length; var base = sy(l.base || 0);
            for (i = 0; i < n; i++) {
              if (!isFinite(l.y[i]) || l.y[i] === (l.base || 0)) continue;
              var bx0 = sx(l.x0[i]), bx1 = sx(l.x1[i]), bw = bx1 - bx0, gap = bw > 6 ? 2 : bw > 3 ? 1 : 0;
              var w2 = Math.min(bw - gap, l.maxW || 24), cx = (bx0 + bx1) / 2, top = sy(l.y[i]);
              ctx.fillStyle = self.hoverI === i && sp.hover && sp.hover.bars ? rgba(col, 0.75) : (l.alpha != null ? rgba(col, l.alpha) : col);
              roundBar(ctx, cx - w2 / 2, top, w2, base - top, Math.min(4, w2 / 2));
            }
            break;
          }
          case "points":
            n = l.x.length; var r = l.r || 4;
            for (i = 0; i < n; i++) {
              if (!isFinite(l.y[i]) || !isFinite(l.x[i])) continue;
              ctx.beginPath(); ctx.arc(sx(l.x[i]), sy(l.y[i]), r + (l.ring === false ? 0 : 2), 0, 6.2832); ctx.fillStyle = l.ring === false ? "rgba(0,0,0,0)" : C.surface; ctx.fill();
              ctx.beginPath(); ctx.arc(sx(l.x[i]), sy(l.y[i]), r, 0, 6.2832); ctx.fillStyle = l.alpha != null ? rgba(col, l.alpha) : col; ctx.fill();
            }
            break;
          case "errbar":
            ctx.strokeStyle = col; ctx.lineWidth = l.width || 1.5; n = l.x.length; var capW = l.cap == null ? 3 : l.cap;
            for (i = 0; i < n; i++) { if (!isFinite(l.y[i]) || !(l.se[i] > 0)) continue; var ex = Math.round(sx(l.x[i])) + 0.5, e0 = sy(l.y[i] - l.se[i]), e1 = sy(l.y[i] + l.se[i]); ctx.beginPath(); ctx.moveTo(ex, e0); ctx.lineTo(ex, e1); if (capW > 0) { ctx.moveTo(ex - capW, e0); ctx.lineTo(ex + capW, e0); ctx.moveTo(ex - capW, e1); ctx.lineTo(ex + capW, e1); } ctx.stroke(); }
            break;
          case "vline": {
            var vx = Math.round(sx(l.x)) + 0.5; ctx.strokeStyle = col; ctx.lineWidth = l.width || 1.5; ctx.setLineDash(l.dash || []); ctx.beginPath(); ctx.moveTo(vx, q.top); ctx.lineTo(vx, q.top + q.h); ctx.stroke(); ctx.setLineDash([]);
            if (l.label) { ctx.font = "11px " + C.font; ctx.fillStyle = C.ink2; var tw = ctx.measureText(l.label).width, lx = vx + 5 + tw > g.x1 ? vx - 5 - tw : vx + 5; ctx.textAlign = "left"; ctx.fillStyle = C.surface; ctx.fillRect(lx - 2, q.top + (l.row || 0) * 15 + 1, tw + 4, 14); ctx.fillStyle = C.ink2; ctx.fillText(l.label, lx, q.top + 8 + (l.row || 0) * 15); }
            break;
          }
          case "hline": {
            var hy = Math.round(sy(l.y)) + 0.5; ctx.strokeStyle = col; ctx.lineWidth = l.width || 1.5; ctx.setLineDash(l.dash || []); ctx.beginPath(); ctx.moveTo(g.x0, hy); ctx.lineTo(g.x1, hy); ctx.stroke(); ctx.setLineDash([]);
            if (l.label) { ctx.font = "11px " + C.font; ctx.textAlign = "right"; var tw2 = ctx.measureText(l.label).width; ctx.fillStyle = C.surface; ctx.fillRect(g.x1 - tw2 - 6, hy - 15, tw2 + 4, 13); ctx.fillStyle = C.ink2; ctx.fillText(l.label, g.x1 - 4, hy - 8); }
            break;
          }
        }
      });
      ctx.restore();
      // 末端直接标注（互相重叠时只保留先画的）
      ctx.font = "11px " + C.font; ctx.textAlign = "right"; var used = [];
      endLabels.reverse().forEach(function (e) {   // 后画的（更重要的）序列优先占位
        var ty = Math.min(Math.max(e.y - 9, q.top + 7), q.top + q.h - 7), clash = used.some(function (u) { return Math.abs(u - ty) < 13; });
        if (clash) return; used.push(ty);
        var tw = ctx.measureText(e.text).width; ctx.fillStyle = rgba(C.surface, 0.85); ctx.fillRect(e.x - tw - 14, ty - 7, tw + 12, 14);
        ctx.fillStyle = e.col; ctx.beginPath(); ctx.arc(e.x - tw - 9, ty, 3, 0, 6.2832); ctx.fill();
        ctx.fillStyle = C.ink2; ctx.fillText(e.text, e.x - 2, ty);
      });
    });
    // 十字线
    var hv = sp.hover;
    if (hv && hv.xs && this.hoverI >= 0 && !hv.bars) {
      var hx = Math.round(g.sx(hv.xs[this.hoverI])) + 0.5;
      ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, g.panels[0].top); ctx.lineTo(hx, g.bottom); ctx.stroke();
      if (hv.dots) hv.dots(this.hoverI).forEach(function (d) {
        if (!isFinite(d.y)) return; var q = g.panels[d.panel || 0], py = q.sy(d.y); if (py < q.top - 1 || py > q.top + q.h + 1) return;
        ctx.beginPath(); ctx.arc(hx, py, 6, 0, 6.2832); ctx.fillStyle = C.surface; ctx.fill();
        ctx.beginPath(); ctx.arc(hx, py, 4, 0, 6.2832); ctx.fillStyle = C[d.color] || d.color; ctx.fill();
      });
    }
  };
  function strokeLine(ctx, xs, ys, sx, sy, ylog, step) {
    var pen = false, n = xs.length, py0 = 0;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var v = ys[i];
      if (!(v === v) || v === Infinity || v === -Infinity || (ylog && !(v > 0))) { pen = false; continue; }
      var px = sx(xs[i]), py = sy(v);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else { if (step) ctx.lineTo(px, py0); ctx.lineTo(px, py); }
      py0 = py;
    }
    ctx.stroke();
  }
  function roundBar(ctx, x, y, w, h, r) { // h>0 向下到基线；圆角只在数据端
    if (h < 0) { y += h; h = -h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.closePath(); ctx.fill(); return; }
    r = Math.min(r, h);
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  }

  /* ---------- 热力图 ---------- */
  Chart.prototype.drawHeat = function (ctx, C, W, H) {
    var sp = this.spec, nx = sp.xs.length, ny = sp.ys.length, V = sp.values, i, j;
    ctx.font = "11px " + C.font; ctx.textBaseline = "middle";
    var xfmt = sp.xfmt || fmtG, yfmt = sp.yfmt || fmtG, vfmt = sp.fmt || fmtNum;
    var maxLab = 0; sp.ys.forEach(function (v) { maxLab = Math.max(maxLab, ctx.measureText(yfmt(v)).width); });
    var padL = Math.ceil(maxLab) + 12, padT = 20, padB = 58, padR = 10;
    var x0 = padL, y0 = padT, pw = W - padL - padR, ph = H - padT - padB, cw = pw / nx, ch = ph / ny;
    var r = finiteRange([V]), lo = r[0], hi = r[1];
    if (!(lo === lo) || lo === Infinity) { lo = 0; hi = 1; }
    var div = sp.diverging !== false && lo < 0 && hi > 0, mx = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    var seq = C.seq;
    function colorOf(v) {
      if (!(v === v) || v === -Infinity || v === Infinity) return null;
      if (div) return v >= 0 ? lerpRamp(C.divPos, v / mx) : lerpRamp(C.divNeg, -v / mx);
      return lerpRamp(seq, hi > lo ? (v - lo) / (hi - lo) : 0.5);
    }
    var gap = Math.min(cw, ch) >= 14 ? 2 : Math.min(cw, ch) >= 6 ? 1 : 0;
    ctx.fillStyle = C.ink2; ctx.textAlign = "left"; ctx.fillText((sp.yLabel || "") + " ↓　" + (sp.xLabel || "") + " →", 0, 8);
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      var v = V[j * nx + i], col = colorOf(v), cx = x0 + i * cw, cy = y0 + (ny - 1 - j) * ch;
      if (col) { ctx.fillStyle = col; ctx.fillRect(cx + gap / 2, cy + gap / 2, cw - gap, ch - gap); }
      else { // 无值（破产 / 不满足约束）：细斜线
        ctx.save(); ctx.beginPath(); ctx.rect(cx + gap / 2, cy + gap / 2, cw - gap, ch - gap); ctx.clip(); ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
        for (var d = -ch; d < cw; d += 6) { ctx.beginPath(); ctx.moveTo(cx + d, cy + ch); ctx.lineTo(cx + d + ch, cy); ctx.stroke(); } ctx.restore();
      }
      if (sp.cellText !== false && cw >= 40 && ch >= 18 && col) {
        ctx.fillStyle = lum(col) > 0.55 ? "#101418" : "#ffffff"; ctx.textAlign = "center"; ctx.font = "10.5px " + C.font; ctx.fillText(vfmt(v), cx + cw / 2, cy + ch / 2 + 0.5); ctx.font = "11px " + C.font;
      }
    }
    // 标记（最优点、当前点）
    (sp.marks || []).forEach(function (m) {
      if (m.i < 0 || m.j < 0) return; var cx = x0 + m.i * cw, cy = y0 + (ny - 1 - m.j) * ch;
      ctx.strokeStyle = C.surface; ctx.lineWidth = 4; ctx.strokeRect(cx + 1.5, cy + 1.5, cw - 3, ch - 3);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash(m.dash || []); ctx.strokeRect(cx + 1.5, cy + 1.5, cw - 3, ch - 3); ctx.setLineDash([]);
    });
    if (this.hoverI >= 0 && this.hoverJ >= 0) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(x0 + this.hoverI * cw + 0.5, y0 + (ny - 1 - this.hoverJ) * ch + 0.5, cw - 1, ch - 1); }
    // 轴标签
    ctx.fillStyle = C.muted; ctx.textAlign = "right";
    var stepY = Math.max(1, Math.ceil(14 / ch)); for (j = 0; j < ny; j += stepY) ctx.fillText(yfmt(sp.ys[j]), x0 - 6, y0 + (ny - 1 - j) * ch + ch / 2);
    ctx.textAlign = "center"; var wl = 0; sp.xs.forEach(function (v) { wl = Math.max(wl, ctx.measureText(xfmt(v)).width); });
    var stepX = Math.max(1, Math.ceil((wl + 8) / cw)); for (i = 0; i < nx; i += stepX) ctx.fillText(xfmt(sp.xs[i]), x0 + i * cw + cw / 2, y0 + ph + 11);
    // 色标
    var lw = Math.min(220, pw), lx = x0, ly = y0 + ph + 28, n = 60;
    for (i = 0; i < n; i++) { var t = i / (n - 1), vv = div ? -mx + 2 * mx * t : lo + (hi - lo) * t; ctx.fillStyle = colorOf(vv) || C.grid; ctx.fillRect(lx + i * lw / n, ly, lw / n + 0.6, 8); }
    ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.fillText(vfmt(div ? -mx : lo), lx, ly + 18); ctx.textAlign = "right"; ctx.fillText(vfmt(div ? mx : hi), lx + lw, ly + 18);
    if (div) { ctx.textAlign = "center"; ctx.fillText("0", lx + lw / 2, ly + 18); }
    if (sp.naLabel) { ctx.textAlign = "left"; var bx = lx + lw + 18; if (bx + 90 < W) { ctx.strokeStyle = C.axis; ctx.save(); ctx.beginPath(); ctx.rect(bx, ly, 14, 8); ctx.clip(); for (var dd = -8; dd < 14; dd += 6) { ctx.beginPath(); ctx.moveTo(bx + dd, ly + 8); ctx.lineTo(bx + dd + 8, ly); ctx.stroke(); } ctx.restore(); ctx.fillStyle = C.muted; ctx.fillText(sp.naLabel, bx + 20, ly + 4); } }
    this.geom = { heat: true, x0: x0, y0: y0, cw: cw, ch: ch, nx: nx, ny: ny };
  };

  /* ---------- 悬停与键盘 ---------- */
  Chart.prototype.onMove = function (e) {
    var sp = this.spec, g = this.geom; if (!sp || !g) return;
    var rc = this.cv.getBoundingClientRect(), px = e.clientX - rc.left, py = e.clientY - rc.top;
    if (g.heat) {
      var i = Math.floor((px - g.x0) / g.cw), j = g.ny - 1 - Math.floor((py - g.y0) / g.ch);
      if (i < 0 || i >= g.nx || j < 0 || j >= g.ny) return this.setHover(-1, -1);
      return this.setHover(i, j, px, py);
    }
    var hv = sp.hover; if (!hv || !hv.xs) return;
    if (px < g.x0 - 12 || px > g.x1 + 12) return this.setHover(-1, -1);
    var xs = hv.xs, best = -1, bd = Infinity;
    if (hv.pts) { // 最近点（散点）
      for (var k = 0; k < xs.length; k++) { var q = g.panels[0], dx = g.sx(xs[k]) - px, dy = q.sy(hv.pts[k]) - py, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = k; } }
    } else {
      var xv = g.ix(px), lo = 0, hi = xs.length - 1;
      if (xs.length && xs[hi] >= xs[0]) { while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] < xv) lo = mid; else hi = mid; } best = Math.abs(xs[lo] - xv) <= Math.abs(xs[hi] - xv) ? lo : hi; }
      else for (var m = 0; m < xs.length; m++) { var dd = Math.abs(g.sx(xs[m]) - px); if (dd < bd) { bd = dd; best = m; } }
    }
    this.setHover(best, -1, px, py);
  };
  Chart.prototype.onKey = function (e) {
    var sp = this.spec, g = this.geom; if (!sp || !g) return;
    var dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0, dy = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (e.key === "Escape") return this.setHover(-1, -1);
    if (e.key === "Enter" && sp.onClick && this.hoverI >= 0) { sp.onClick(this.hoverI, this.hoverJ); return; }
    if (!dx && !dy) return;
    e.preventDefault();
    if (g.heat) { var i = Math.min(g.nx - 1, Math.max(0, (this.hoverI < 0 ? 0 : this.hoverI) + dx)), j = Math.min(g.ny - 1, Math.max(0, (this.hoverJ < 0 ? 0 : this.hoverJ) + dy)); return this.setHover(i, j, g.x0 + (i + 0.5) * g.cw, g.y0 + (g.ny - 1 - j + 0.5) * g.ch); }
    if (!sp.hover || !sp.hover.xs || !dx) return;
    var n = sp.hover.xs.length, stepN = e.shiftKey ? Math.max(1, Math.round(n / 20)) : 1, k = Math.min(n - 1, Math.max(0, (this.hoverI < 0 ? (dx > 0 ? -1 : n) : this.hoverI) + dx * stepN));
    this.setHover(k, -1, g.sx(sp.hover.xs[k]), g.panels[0].top + 20);
  };
  Chart.prototype.setHover = function (i, j, px, py) {
    if (i === this.hoverI && j === this.hoverJ && i < 0) return;
    var changed = i !== this.hoverI || j !== this.hoverJ; this.hoverI = i; this.hoverJ = j;
    if (changed) this.draw();
    var tip = this.tip, sp = this.spec;
    if (i < 0 || !sp) { tip.hidden = true; return; }
    var data = sp.type === "heat" ? (sp.tip ? sp.tip(i, j) : null) : (sp.hover && sp.hover.tip ? sp.hover.tip(i) : null);
    if (!data) { tip.hidden = true; return; }
    tip.textContent = "";
    if (data.title) { var h = document.createElement("div"); h.className = "qc-tip-h"; h.textContent = data.title; tip.appendChild(h); }
    (data.rows || []).forEach(function (r) {
      var row = document.createElement("div"); row.className = "qc-tip-r";
      var k = document.createElement("i"); k.className = "qc-key qc-key-" + (r.mark || "line"); if (r.color) k.style.setProperty("--k", "var(--c-" + r.color + ")"); else k.style.visibility = "hidden";
      var nm = document.createElement("span"); nm.className = "qc-tip-n"; nm.textContent = r.name;
      var v = document.createElement("b"); v.textContent = r.value;
      row.appendChild(k); row.appendChild(v); row.appendChild(nm); tip.appendChild(row);
    });
    if (data.note) { var nt = document.createElement("div"); nt.className = "qc-tip-note"; nt.textContent = data.note; tip.appendChild(nt); }
    tip.hidden = false;
    var W = this.wrap.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight, left = px + 14, top = Math.max(2, Math.min(py - th / 2, this.h - th - 2));
    if (left + tw > W - 2) left = px - 14 - tw; if (left < 2) left = 2;
    tip.style.left = left + "px"; tip.style.top = top + "px";
  };

  return {
    Chart: Chart, fmtNum: fmtNum, fmtG: fmtG, fmtPct: fmtPct, fmtTick: fmtTick, linTicks: linTicks, niceStep: niceStep, rgba: rgba,
    /** 把直方图计数变成 bars 图层需要的数组 */
    histLayer: function (h, color, density) {
      var n = h.counts.length, w = (h.hi - h.lo) / n, x0 = [], x1 = [], y = [], tot = h.n || 1;
      for (var i = 0; i < n; i++) { x0.push(h.lo + i * w); x1.push(h.lo + (i + 1) * w); y.push(density ? h.counts[i] / tot / w : h.counts[i] / tot); }
      return { kind: "bars", x0: x0, x1: x1, y: y, color: color, base: 0 };
    }
  };
})();
