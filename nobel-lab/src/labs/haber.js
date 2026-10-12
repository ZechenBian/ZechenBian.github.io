/* 合成氨的平衡与速率 — Haber, Nobel Chemistry 1918
 * N₂ + 3H₂ ⇌ 2NH₃.  Standard data (298 K, per 2 mol NH₃):
 *   ΔH° = −91.8 kJ, ΔS° = −198.1 J/K, ΔCp ≈ 2·35.1 − 29.1 − 3·28.8 = −45.3 J/K (kept so that
 *   Kp(500 °C) ≈ 1.1e-5 atm⁻², close to tabulated 1.45e-5; constant ΔH/ΔS would overshoot ×6).
 * Kp = exp(−ΔG°(T)/RT) in atm⁻² (ideal gas). Feed N₂:H₂ = 1:3, extent ξ ∈ (0,1):
 *   n = (1−ξ, 3−3ξ, 2ξ), total 4−2ξ  ⇒  x_NH₃²/(x_N₂ x_H₂³) = Kp P².
 * Kinetics (illustrative Arrhenius): t₉₀ = t_ref · exp(Ea/R (1/T − 1/773 K)).
 */
(() => {
  const R = 8.314, DH = -91800, DS = -198.1, DCP = -45.3, T0 = 298.15;
  const dG = (T) => (DH + DCP * (T - T0)) - T * (DS + DCP * Math.log(T / T0)); // J per 2 mol NH₃
  const Kp = (T) => Math.exp(-dG(T) / (R * T));
  // equilibrium extent by bisection on ln Q(ξ) = ln(Kp P²); ln Q increases monotonically in ξ
  function xiEq(T, P) {
    const target = Math.log(Kp(T) * P * P);
    let a = 1e-12, b = 1 - 1e-12;
    for (let i = 0; i < 70; i++) {
      const m = (a + b) / 2;
      const q = Math.log(4 * m * m * (4 - 2 * m) ** 2 / (27 * (1 - m) ** 4));
      if (q < target) a = m; else b = m;
    }
    return (a + b) / 2;
  }
  const yNH3 = (xi) => (2 * xi) / (4 - 2 * xi);
  // catalysts: Ea (J/mol) and t₉₀ at 500 °C (s). Uncatalysed: Ea ≈ 230 kJ, N≡N dissociation essentially frozen.
  const CATS = {
    none: { Ea: 230e3, tref: 1e11 },
    os: { Ea: 100e3, tref: 2 },
    fe: { Ea: 100e3, tref: 1 },
  };
  const t90 = (T, cat) => CATS[cat].tref * Math.exp((CATS[cat].Ea / R) * (1 / T - 1 / 773.15));
  const CONTACT = 60; // s, practical contact time per pass; slower than this = "too slow"
  // temperature (K) below which t₉₀ > CONTACT
  const Tslow = (cat) => 1 / (1 / 773.15 + Math.log(CONTACT / CATS[cat].tref) * R / CATS[cat].Ea);
  // conversion achieved in one pass of CONTACT seconds (first-order approach to equilibrium)
  const passConv = (T, P, cat) => xiEq(T, P) * (1 - Math.pow(10, -CONTACT / t90(T, cat)));
  const PURGE = 0.005; // purge fraction per recycle loop (inerts), sets the ~97% ceiling
  const recycleTotal = (x, n) => { let left = 1, made = 0; for (let k = 0; k < n; k++) { made += left * x; left *= (1 - x) * (1 - PURGE); } return made; };
  const recycleLimit = (x) => x / (1 - (1 - x) * (1 - PURGE));
  const M = { dG, Kp, xiEq, yNH3, t90, Tslow, passConv, recycleTotal, recycleLimit };

  function fmtTime(s) {
    if (!isFinite(s) || s > 3.15e10) return '> 千年';
    if (s < 1) return '< 1 秒';
    if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + ' 秒';
    if (s < 3600) return (s / 60).toFixed(1) + ' 分钟';
    if (s < 86400) return (s / 3600).toFixed(1) + ' 小时';
    if (s < 3.15e7) return (s / 86400).toFixed(1) + ' 天';
    return (s / 3.15e7).toPrecision(2) + ' 年';
  }
  function sci(v) {
    const e = Math.floor(Math.log10(v)), m = v / 10 ** e;
    const sup = String(e).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
    return m.toFixed(2) + '×10' + sup;
  }

  LABS.haber = {
    title: '合成氨的平衡与速率',
    _math: M,
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const st = { Tc: 500, P: 200, cat: 'fe', recycle: true, xi: 0 };
      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '低温产率高却慢、高温快却产率低；加压（4 mol 气体 → 2 mol）把平衡推向 NH₃。切到“无催化剂”看整个窗口变“太慢”；打开循环，看 10% 的单程也能累积到 90%+。理想气体近似，在数百 atm 下略低估产率。' });
      root.append(stage, controls, readout, hint);
      const plot = h.canvas(stage, { aspect: 0.62, minH: 220, maxH: 400 });
      const box = h.canvas(stage, { aspect: 0.42, minH: 170, maxH: 250 });

      const P2s = (P) => Math.log10(P) / 3;
      const sT = h.slider({ label: '温度', min: 200, max: 800, step: 5, value: st.Tc, format: (v) => v + ' °C', onInput: (v) => { st.Tc = v; update(); } });
      const sP = h.slider({ label: '压力', min: 0, max: 1, step: 0.001, value: P2s(st.P), format: (v) => Math.round(10 ** (3 * v)) + ' atm', onInput: (v) => { st.P = 10 ** (3 * v); update(); } });
      const cCat = h.choice({ label: '催化剂', value: st.cat, options: [{ value: 'none', label: '无催化剂' }, { value: 'os', label: '锇 Os' }, { value: 'fe', label: '铁基 Fe' }], onChange: (v) => { st.cat = v; update(); } });
      const tRec = h.toggle({ label: '循环回收未反应气体', value: st.recycle, onChange: (b) => { st.recycle = b; update(); } });
      const preset = (Tc, P, cat) => { st.Tc = Tc; st.P = P; st.cat = cat; sT.set(Tc); sP.set(P2s(P)); cCat.set(cat); update(); };
      const btns = h.el('div', { class: 'ctl' }, [
        h.button({ label: '哈伯 1909 参数', onClick: () => preset(550, 175, 'os') }), ' ',
        h.button({ label: '现代工厂', onClick: () => preset(450, 200, 'fe') }), ' ',
        h.button({ label: '重新进料', onClick: () => { st.xi = 0; drawBox(); } }),
      ]);
      controls.append(sT.el, sP.el, cCat.el, tRec.el, btns);
      const ro = {
        K: h.readout('Kp(T)'), G: h.readout('吉布斯能'), y: h.readout('平衡 NH₃'), xi: h.readout('平衡转化率 ξ (N₂)'),
        t: h.readout('t₉₀ 接近平衡'), x1: h.readout('单程转化率 (1 min)'), xr: h.readout('循环后总转化率'),
      };
      Object.values(ro).forEach((r) => readout.append(r.el));

      // derived quantities, recomputed on input
      let d = {};
      function compute() {
        const T = st.Tc + 273.15;
        const xe = xiEq(T, st.P);
        d = { T, xe, ye: yNH3(xe), t9: t90(T, st.cat), x1: passConv(T, st.P, st.cat) };
      }
      function update() {
        compute();
        if (ctx.reduced) st.xi = d.x1; // no animation: show the state after one contact time
        ro.K.set(sci(Kp(d.T)) + ' atm⁻²');
        ro.G.set('ΔG° = ' + (dG(d.T) / 1000 >= 0 ? '+' : '') + (dG(d.T) / 1000).toFixed(1) + ' kJ = −RT ln Kp');
        ro.y.set((100 * d.ye).toFixed(1) + ' %');
        ro.xi.set((100 * d.xe).toFixed(1) + ' %');
        ro.t.set(fmtTime(d.t9));
        ro.x1.set((100 * d.x1).toFixed(1) + ' %');
        ro.xr.set(st.recycle ? (100 * recycleTotal(d.x1, 10)).toFixed(1) + ' % (10 轮)' : '— (未回收)');
        drawPlot(); drawBox();
      }

      const PS = [1, 50, 100, 200, 300, 1000];
      function drawPlot() {
        const g = plot.g, W = plot.w, Hh = plot.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const ax = h.axes(g, W, Hh, { x0: 200, x1: 800, y0: 0, y1: 100, xTicks: [200, 300, 400, 500, 600, 700, 800], yTicks: [0, 20, 40, 60, 80, 100], xLabel: 'T (°C)', yLabel: '平衡 NH₃ (%)' }, C);
        const mono = C('--mono-font') || 'monospace';
        // "too slow" shading
        const ts = Math.min(800, Tslow(st.cat) - 273.15);
        if (ts > 200) {
          g.save(); g.fillStyle = C('--warn'); g.globalAlpha = 0.13;
          g.fillRect(ax.X(200), ax.p.t, ax.X(ts) - ax.X(200), ax.ih); g.restore();
          g.fillStyle = C('--warn'); g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'top';
          g.fillText(ts >= 800 ? '全程太慢 (t₉₀ > 1 min)' : '太慢', ax.X(200) + 5, ax.p.t + 4);
        }
        const curve = (P) => { g.beginPath(); for (let i = 0; i <= 120; i++) { const Tc = 200 + i * 5, y = 100 * yNH3(xiEq(Tc + 273.15, P)); i ? g.lineTo(ax.X(Tc), ax.Y(y)) : g.moveTo(ax.X(Tc), ax.Y(y)); } g.stroke(); };
        g.lineWidth = 1; g.strokeStyle = C('--muted'); g.globalAlpha = 0.45;
        PS.forEach(curve); g.globalAlpha = 1;
        g.font = '10px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'bottom';
        PS.forEach((P) => { const Tc = 365, y = 100 * yNH3(xiEq(Tc + 273.15, P)); g.fillText(P + ' atm', ax.X(Tc) + 2, ax.Y(y) - 1); });
        g.lineWidth = 2.5; g.strokeStyle = C('--s1'); curve(st.P);
        // operating point: equilibrium (filled) and what 1 min contact actually gives (hollow)
        const X = ax.X(st.Tc), Ye = ax.Y(100 * d.ye), Y1 = ax.Y(100 * yNH3(d.x1));
        g.setLineDash([3, 3]); g.strokeStyle = C('--fg'); g.lineWidth = 1;
        g.beginPath(); g.moveTo(X, Ye); g.lineTo(X, Y1); g.stroke(); g.setLineDash([]);
        g.fillStyle = C('--accent'); g.beginPath(); g.arc(X, Ye, 5, 0, 7); g.fill();
        g.strokeStyle = C('--s2'); g.lineWidth = 2; g.beginPath(); g.arc(X, Y1, 4.5, 0, 7); g.stroke();
        g.textAlign = 'right'; g.textBaseline = 'top'; g.font = '11px ' + mono;
        g.fillStyle = C('--accent'); g.fillText('● 平衡', W - ax.p.r - 6, ax.p.t + 4);
        g.fillStyle = C('--s2'); g.fillText('○ 1 min 实际', W - ax.p.r - 6, ax.p.t + 18);
        g.fillStyle = C('--s1'); g.fillText(Math.round(st.P) + ' atm', W - ax.p.r - 6, ax.p.t + 32);
      }

      // particles: 12 N₂ + 36 H₂ feed; k = round(12ξ) N₂ consumed → 2k NH₃
      const parts = Array.from({ length: 48 }, () => ({ x: Math.random(), y: Math.random(), vx: Math.random() - 0.5, vy: Math.random() - 0.5, a: Math.random() * 6 }));
      function drawBox() {
        const g = box.g, W = box.w, Hh = box.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const mono = C('--mono-font') || 'monospace';
        const bw = Math.floor(W * 0.46), bh = Hh - 40, bx = 8, by = 8;
        g.strokeStyle = C('--line'); g.lineWidth = 1.5; g.strokeRect(bx + 0.5, by + 0.5, bw, bh);
        const k = Math.round(12 * st.xi), nN = 12 - k, nH = 36 - 3 * k, nA = 2 * k;
        const r = Math.max(3, Math.min(5, bw / 55));
        parts.forEach((p, i) => {
          const type = i < nN ? 'N' : i < nN + nH ? 'H' : i < nN + nH + nA ? 'A' : null;
          if (!type) return;
          const x = bx + 8 + p.x * (bw - 16), y = by + 8 + p.y * (bh - 16), c = Math.cos(p.a), s = Math.sin(p.a);
          if (type === 'A') { // NH₃: N with three H
            g.fillStyle = C('--s3'); for (let j = 0; j < 3; j++) { const t = p.a + j * 2.09; g.beginPath(); g.arc(x + 1.3 * r * Math.cos(t), y + 1.3 * r * Math.sin(t), r * 0.55, 0, 7); g.fill(); }
            g.fillStyle = C('--s1'); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
          } else {
            const rr = type === 'N' ? r : r * 0.6; g.fillStyle = C(type === 'N' ? '--s2' : '--s3');
            g.beginPath(); g.arc(x - c * rr * 0.8, y - s * rr * 0.8, rr, 0, 7); g.arc(x + c * rr * 0.8, y + s * rr * 0.8, rr, 0, 7); g.fill();
          }
        });
        g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillStyle = C('--s2'); g.fillText('N₂ ' + nN, bx, by + bh + 6);
        g.fillStyle = C('--s3'); g.fillText('H₂ ' + nH, bx + bw * 0.3, by + bh + 6);
        g.fillStyle = C('--s1'); g.fillText('NH₃ ' + nA, bx + bw * 0.62, by + bh + 6);
        g.fillStyle = C('--muted'); g.fillText('ξ = ' + (100 * st.xi).toFixed(0) + '% → ' + (100 * d.xe).toFixed(0) + '%', bx, by + bh + 20);
        // recycle panel: cumulative conversion after n passes
        const px = bx + bw + 30, pw = W - px - 10, pt = by + 14, ph = bh - 14;
        g.fillStyle = C('--fg'); g.fillText(st.recycle ? '循环：累计转化率' : '单程：其余原料排空', px, by - 2);
        g.strokeStyle = C('--line'); g.beginPath(); g.moveTo(px, pt); g.lineTo(px, pt + ph); g.lineTo(px + pw, pt + ph); g.stroke();
        g.fillStyle = C('--muted'); g.textAlign = 'right'; g.textBaseline = 'middle';
        [0, 50, 100].forEach((v) => g.fillText(v + '', px - 3, pt + ph * (1 - v / 100)));
        const n = st.recycle ? 10 : 1, gap = 3, w = Math.min(28, (pw - gap * n) / n);
        for (let i = 1; i <= n; i++) {
          const v = recycleTotal(d.x1, i), x = px + 3 + (i - 1) * (w + gap);
          g.fillStyle = C(i === 1 ? '--s2' : '--s1'); g.fillRect(x, pt + ph * (1 - v), w, ph * v);
          if (!st.recycle) { g.fillStyle = C('--warn'); g.globalAlpha = 0.3; g.fillRect(x, pt, w, ph * (1 - v)); g.globalAlpha = 1; }
        }
        g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = C('--muted');
        g.fillText(st.recycle ? '1 … 10 轮' : '1 轮', px + pw / 2, pt + ph + 4);
        if (st.recycle) {
          const L = recycleLimit(d.x1), yL = pt + ph * (1 - L);
          g.setLineDash([4, 3]); g.strokeStyle = C('--accent'); g.beginPath(); g.moveTo(px, yL); g.lineTo(px + pw, yL); g.stroke(); g.setLineDash([]);
          g.fillStyle = C('--accent'); g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('极限 ' + (100 * L).toFixed(0) + '%', px + pw, yL - 2);
        }
      }

      // relaxation ξ → ξeq at rate ln10/t₉₀ (real time), particles drift
      const lp = h.loop((dt) => {
        st.xi += (d.xe - st.xi) * (1 - Math.exp(-dt * Math.LN10 / d.t9));
        parts.forEach((p) => {
          p.x += p.vx * dt * 0.25; p.y += p.vy * dt * 0.25; p.a += dt * 1.5;
          if (p.x < 0 || p.x > 1) { p.vx = -p.vx; p.x = Math.min(1, Math.max(0, p.x)); }
          if (p.y < 0 || p.y > 1) { p.vy = -p.vy; p.y = Math.min(1, Math.max(0, p.y)); }
        });
        drawBox();
      });
      update();
      if (!ctx.reduced) lp.start();
      plot.onResize(() => { if (d.T) drawPlot(); });
      box.onResize(() => { if (d.T) drawBox(); });
      const mo = new MutationObserver(() => { drawPlot(); drawBox(); });
      mo.observe(document.documentElement, { attributes: true });
      return { destroy() { lp.stop(); plot.destroy(); box.destroy(); mo.disconnect(); } };
    },
  };
})();
