/* 索洛增长模型 — Economic Sciences 1987 (Robert M. Solow)
 * k = K/(AL),  k̇ = s k^α − (n+g+δ) k,  δ = 0.05.  Exact solution in z = k^{1−α}:
 *   z(t) = z* + (z₀ − z*) e^{−λt},  z* = s/(n+g+δ),  λ = (1−α)(n+g+δ).
 * Per-capita output ln(Y/L) = ln A + α ln k,  A = e^{gt}.  Baseline: s₀ = 0.20, n₀ = 0.01, g₀ = 0.02 until year 20,
 *   then the reader's (s, n, g); optional war shock halves K at year 20.
 * Harrod–Domar comparison: fixed v = K/Y at the baseline value, per-capita growth = s/v − δ − n.
 * Golden rule: c* max at f′(k_G) = n+g+δ ⇔ s_G = α (Cobb–Douglas).
 * Checks: α = 1/3, n+g+δ = 0.08, s = 0.2 → k* = 2.5^{1.5} = 3.953, λ = 5.33 %/yr, half-life 13.0 yr.
 */
(() => {
  const DEL = 0.05, S0 = 0.2, N0 = 0.01, G0 = 0.02, TE = 20, TMAX = 150;
  const kStar = (s, a, n, g) => Math.pow(s / (n + g + DEL), 1 / (1 - a));
  // path of ln(Y/L) over [0, TMAX], step 0.5 yr
  function path(P, shock) {
    const a = P.a, k0 = kStar(S0, a, N0, G0), out = { t: [], ly: [], gy: [] };
    const zs = P.s / (P.n + P.g + DEL), lam = (1 - a) * (P.n + P.g + DEL), z0 = Math.pow(k0 * (shock ? 0.5 : 1), 1 - a);
    for (let t = 0; t <= TMAX + 1e-9; t += 0.5) {
      let lk, gr;
      if (t < TE) { lk = Math.log(k0); gr = G0; }
      else { const z = zs + (z0 - zs) * Math.exp(-lam * (t - TE)); lk = Math.log(z) / (1 - a); gr = P.g + (a / (1 - a)) * lam * (zs - z) / z; }
      const lnA = t < TE ? G0 * t : G0 * TE + P.g * (t - TE);
      out.t.push(t); out.ly.push(lnA + a * lk - (G0 * t + a * Math.log(k0))); out.gy.push(100 * gr);
    }
    return out;
  }
  function hdPath(P) { // Harrod–Domar with v fixed at the baseline K/Y
    const v = S0 / (N0 + G0 + DEL), out = { t: [], ly: [], gy: [] };
    for (let t = 0; t <= TMAX + 1e-9; t += 0.5) {
      const gr = t < TE ? G0 : P.s / v - DEL - P.n;
      out.t.push(t); out.ly.push(t < TE ? 0 : (gr - G0) * (t - TE)); out.gy.push(100 * gr);
    }
    return out;
  }

  LABS.solow = {
    title: '索洛增长模型',
    _m: { kStar, path, hdPath },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const P = { s: 0.3, n: N0, g: G0, a: 1 / 3, war: false, hd: false };
      const stage = h.el('div', { class: 'lab-stage' }), controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '第 20 年起换成你选的参数（之前是 s = 0.20 的平衡增长）。储蓄率只让上图抬到一个新台阶，下图的增长率冲高后回到 g；只有 g 能改变长期斜率。打开哈罗德–多马对照，看固定资本–产出比时的预言。' });
      root.append(stage, controls, readout, hint);
      const cvP = h.canvas(stage, { aspect: 0.5, minH: 200, maxH: 300 });
      const cvT = h.canvas(stage, { aspect: 0.62, minH: 240, maxH: 380 });
      cvP.canvas.setAttribute('aria-label', '相图：s·f(k) 与 (n+g+δ)k');
      cvT.canvas.setAttribute('aria-label', '人均产出相对旧趋势的偏离与人均增长率');

      const sS = h.slider({ label: '储蓄率 s（第 20 年起）', min: 0.05, max: 0.7, step: 0.01, value: P.s, format: (v) => v.toFixed(2), onInput: (v) => { P.s = v; draw(); } });
      const sN = h.slider({ label: '人口增长 n', min: 0, max: 0.04, step: 0.001, value: P.n, format: (v) => (100 * v).toFixed(1) + ' %/年', onInput: (v) => { P.n = v; draw(); } });
      const sG = h.slider({ label: '技术进步 g', min: 0, max: 0.04, step: 0.001, value: P.g, format: (v) => (100 * v).toFixed(1) + ' %/年', onInput: (v) => { P.g = v; draw(); } });
      const cA = h.choice({ label: '资本份额 α', value: P.a, options: [{ value: 0.25, label: '0.25' }, { value: 1 / 3, label: '1/3' }, { value: 0.5, label: '0.50' }, { value: 2 / 3, label: '2/3（广义资本）' }], onChange: (v) => { P.a = v; draw(); } });
      const tW = h.toggle({ label: '第 20 年战争：资本减半', onChange: (b) => { P.war = b; draw(); } });
      const tH = h.toggle({ label: '对照：哈罗德–多马（v 固定）', onChange: (b) => { P.hd = b; draw(); } });
      const bG = h.el('div', { class: 'ctl' }, [h.el('div', {}, [
        h.button({ label: 's 设为黄金律', onClick: () => { P.s = P.a; sS.set(P.s); draw(); } }),
        h.button({ label: '重置', onClick: () => { Object.assign(P, { s: 0.3, n: N0, g: G0, a: 1 / 3, war: false, hd: false }); sS.set(P.s); sN.set(P.n); sG.set(P.g); cA.set(P.a); tW.set(false); tH.set(false); draw(); } }),
      ])]);
      controls.append(sS.el, sN.el, sG.el, tW.el, tH.el, bG, cA.el);
      const ro = { k: h.readout('稳态 k*（旧 → 新）'), y: h.readout('稳态人均产出相对旧趋势'), c: h.readout('稳态消费 c* / 黄金律 c_G'), l: h.readout('收敛速度 λ = (1−α)(n+g+δ)'), hl: h.readout('半衰期 ln 2 / λ'), g: h.readout('长期人均增长') };
      Object.values(ro).forEach((r) => readout.append(r.el));

      function legend(g, items, x, y, xMax) {
        g.font = '11px ' + (C('--body-font') || 'sans-serif'); g.textBaseline = 'middle'; g.textAlign = 'left'; const x0 = x;
        for (const [lab, c, dash] of items) {
          if (x + 22 + g.measureText(lab).width > xMax) { x = x0; y += 14; }
          g.strokeStyle = c; g.lineWidth = 2; g.setLineDash(dash ? [4, 3] : []); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]);
          g.fillStyle = C('--muted'); g.fillText(lab, x + 18, y); x += 30 + g.measureText(lab).width;
        }
      }
      function line(g, A, xs, ys, color, w, dash) {
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath();
        xs.forEach((x, i) => (i ? g.lineTo(A.X(x), A.Y(ys[i])) : g.moveTo(A.X(x), A.Y(ys[i])))); g.stroke(); g.restore();
      }
      const fmt = (v) => String(+v.toFixed(2));
      function tk(a, b, n) { const r = (b - a) / n, e = Math.pow(10, Math.floor(Math.log10(r))), m = r / e, st = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e, o = []; for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) o.push(+v.toFixed(8)); return o; }

      function drawPhase() {
        const g = cvP.g, W = cvP.w, Hh = cvP.h, a = P.a, ng = P.n + P.g + DEL;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const k0 = kStar(S0, a, N0, G0), ks = kStar(P.s, a, P.n, P.g), kG = Math.pow(a / ng, 1 / (1 - a));
        const kmax = Math.max(k0, ks, kG) * 1.45, ymax = 1.05 * Math.max(Math.pow(kmax, a), ng * kmax);
        const A = h.axes(g, W, Hh, { x0: 0, x1: kmax, y0: 0, y1: ymax, pad: { l: 42, r: 12, t: W < 520 ? 38 : 24, b: 32 }, xTicks: tk(0, kmax, 5), yTicks: tk(0, ymax, 3), fmtX: fmt, fmtY: fmt, xLabel: 'k = K/(AL)', yLabel: '每单位有效劳动' }, C);
        const xs = Array.from({ length: 161 }, (_, i) => (kmax * i) / 160);
        line(g, A, xs, xs.map((k) => Math.pow(k, a)), C('--muted'), 1.3, [4, 3]);
        line(g, A, xs, xs.map((k) => P.s * Math.pow(k, a)), C('--s1'), 2.2);
        line(g, A, xs, xs.map((k) => ng * k), C('--s2'), 2);
        // consumption bar at k*, golden-rule tick, old steady state
        g.strokeStyle = C('--good'); g.lineWidth = 3; g.beginPath(); g.moveTo(A.X(ks), A.Y(ng * ks)); g.lineTo(A.X(ks), A.Y(Math.pow(ks, a))); g.stroke();
        g.strokeStyle = C('--muted'); g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(A.X(kG), A.p.t); g.lineTo(A.X(kG), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        g.fillStyle = C('--muted'); g.font = '10.5px ' + C('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('k_G', A.X(kG), A.p.t + 2);
        g.strokeStyle = C('--muted'); g.lineWidth = 1.5; g.beginPath(); g.arc(A.X(k0), A.Y(0), 4.5, 0, 7); g.stroke();
        g.fillStyle = C('--accent'); g.beginPath(); g.arc(A.X(ks), A.Y(0), 5, 0, 7); g.fill();
        g.textBaseline = 'bottom'; g.fillText('k*', A.X(ks), A.Y(0) - 6);
        legend(g, [['f(k)', C('--muted'), 1], [`s·f(k)`, C('--s1')], ['(n+g+δ)k', C('--s2')], ['c*', C('--good')]], A.p.l, 10, W - 6);
      }
      function drawTime() {
        const g = cvT.g, W = cvT.w, Hh = cvT.h, pa = path(P, P.war), hd = P.hd ? hdPath(P) : null;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const top = Math.floor(Hh * 0.55), xT = [0, 25, 50, 75, 100, 125, 150];
        let lo = Math.min(-0.05, ...pa.ly), hi = Math.max(0.05, ...pa.ly);
        if (hd) { lo = Math.min(lo, -1); hi = Math.max(hi, 1); }
        lo = Math.max(lo, -1.5); hi = Math.min(hi, 1.5);
        const A1 = h.axes(g, W, top, { x0: 0, x1: TMAX, y0: lo * 1.1, y1: hi * 1.1, pad: { l: 46, r: 12, t: W < 520 ? 36 : 22, b: 20 }, xTicks: xT, yTicks: tk(lo, hi, 3), fmtY: fmt, yLabel: 'ln(y / 旧趋势)' }, C);
        g.strokeStyle = C('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(A1.p.l, A1.Y(0)); g.lineTo(A1.p.l + A1.iw, A1.Y(0)); g.stroke();
        if (hd) line(g, A1, hd.t, hd.ly, C('--warn'), 1.6, [5, 4]);
        line(g, A1, pa.t, pa.ly, C('--s1'), 2.3);
        legend(g, [['索洛', C('--s1')], P.hd ? ['哈罗德–多马', C('--warn'), 1] : null].filter(Boolean), A1.p.l, 10, W - 6);
        g.save(); g.translate(0, top);
        let glo = Math.min(0, ...pa.gy), ghi = Math.max(4, ...pa.gy.slice(0, 400));
        if (hd) { glo = Math.min(glo, ...hd.gy); ghi = Math.max(ghi, ...hd.gy); }
        glo = Math.max(glo, -8); ghi = Math.min(ghi, 12);
        const A2 = h.axes(g, W, Hh - top, { x0: 0, x1: TMAX, y0: glo, y1: ghi * 1.05, pad: { l: 46, r: 12, t: 8, b: 32 }, xTicks: xT, yTicks: tk(glo, ghi, 3), fmtY: fmt, xLabel: '年（第 20 年换参数）', yLabel: '增长 %/年' }, C);
        if (hd) line(g, A2, hd.t, hd.gy, C('--warn'), 1.6, [5, 4]);
        line(g, A2, pa.t, pa.gy, C('--s3'), 2.3);
        g.restore();
        [A1].forEach((A) => { g.strokeStyle = C('--muted'); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(A.X(TE), A.p.t); g.lineTo(A.X(TE), Hh - 32); g.stroke(); g.setLineDash([]); });
      }
      function readouts() {
        const a = P.a, ng = P.n + P.g + DEL, k0 = kStar(S0, a, N0, G0), ks = kStar(P.s, a, P.n, P.g), lam = (1 - a) * ng;
        const kG = Math.pow(a / ng, 1 / (1 - a)), c = (1 - P.s) * Math.pow(ks, a), cG = (1 - a) * Math.pow(kG, a);
        ro.k.set(`${k0.toFixed(2)} → ${ks.toFixed(2)}`);
        ro.y.set(`${((Math.exp(a * Math.log(ks / k0)) - 1) * 100).toFixed(1)} %（不含 g 的变化）`);
        ro.c.set(`${c.toFixed(3)} / ${cG.toFixed(3)}${Math.abs(P.s - a) < 0.006 ? '  ✓ 黄金律' : P.s > a ? '  储蓄过多' : ''}`);
        ro.l.set(`${(100 * lam).toFixed(2)} %/年`);
        ro.hl.set(`${(Math.LN2 / lam).toFixed(1)} 年`);
        ro.g.set(`${(100 * P.g).toFixed(1)} %/年（与 s 无关）`);
      }
      function draw() { drawPhase(); drawTime(); readouts(); }
      cvP.onResize(drawPhase); cvT.onResize(drawTime);
      const mo = new MutationObserver(draw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      if (mq && mq.addEventListener) mq.addEventListener('change', draw);
      draw();
      return { destroy() { cvP.destroy(); cvT.destroy(); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', draw); } };
    },
  };
})();
