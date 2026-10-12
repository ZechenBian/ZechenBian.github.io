/* 光电效应 — Nobel Physics 1921 (Einstein, law of the photoelectric effect)
 * Constants (SI exact): h = 6.62607015e-34 J·s, e = 1.602176634e-19 C, c = 2.99792458e8 m/s
 * hc = 1239.84 eV·nm.  Eₖ,max = hν − W,  eV₀ = Eₖ,max  ⇒  V₀ = (h/e)ν − W/e
 * Work functions (textbook approx.): Cs 2.14, Na 2.28, Zn 4.33, Pt 5.65 eV
 */
(() => {
  const hP = 6.62607015e-34, qe = 1.602176634e-19, cL = 2.99792458e8;
  const HC = (hP * cL) / qe * 1e9; // 1239.84 eV·nm
  const METALS = [
    { id: 'Cs', name: '铯 Cs', W: 2.14, s: '--s1' },
    { id: 'Na', name: '钠 Na', W: 2.28, s: '--s2' },
    { id: 'Zn', name: '锌 Zn', W: 4.33, s: '--s3' },
    { id: 'Pt', name: '铂 Pt', W: 5.65, s: '--s4' },
  ];
  const photonEV = (nm) => HC / nm;
  const nuOf = (nm) => cL / (nm * 1e-9);                 // Hz
  const kemax = (nm, W) => Math.max(0, photonEV(nm) - W); // eV
  // Least-squares line y = a + b x
  function fit(pts) {
    const n = pts.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const d = n * sxx - sx * sx; if (n < 2 || Math.abs(d) < 1e-12) return null;
    const b = (n * sxy - sx * sy) / d; return { a: (sy - b * sx) / n, b };
  }
  const lamColor = (nm, a = 1) => h0.wavelengthRGB(nm, a) || (nm < 380 ? `rgba(170,120,255,${a})` : `rgba(160,60,40,${a})`);
  let h0 = typeof H !== 'undefined' ? H : null;

  LABS.einstein = {
    title: '光电效应',
    _m: { HC, photonEV, nuOf, kemax, fit, METALS },
    mount(root, ctx) {
      const h = (h0 = ctx.h), col = ctx.color;
      const S = { nm: 400, I: 60, metal: METALS[0], pts: [] }; // pts: {nu (1e14 Hz), V, metal}
      const photons = [], electrons = []; let emitAcc = 0;

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '把波长调长、越过阈值 λ₀（偏红），再把光强拉满——一个电子也打不出来；调回阈值以下，哪怕很暗也立即有电子。多测几个点：直线斜率就是 h/e，换金属只平移截距，斜率不变。' });
      root.append(stage, controls, readout, hint);
      const cvS = h.canvas(stage, { aspect: 0.4, minH: 170, maxH: 260 });
      const cvP = h.canvas(stage, { aspect: 0.55, minH: 210, maxH: 360 });

      const above = () => photonEV(S.nm) > S.metal.W;

      /* ---- Stage geometry ---- */
      const geo = () => {
        const W = cvS.w, Hh = cvS.h;
        return { W, Hh, lamp: { x: W * 0.82, y: Hh * 0.22 }, plate: { x: W * 0.16, y0: Hh * 0.18, y1: Hh * 0.82 } };
      };
      function spawnPhoton(G) {
        const ty = G.plate.y0 + Math.random() * (G.plate.y1 - G.plate.y0);
        const dx = G.plate.x + 4 - G.lamp.x, dy = ty - G.lamp.y, L = Math.hypot(dx, dy), v = 260;
        photons.push({ x: G.lamp.x, y: G.lamp.y, vx: (dx / L) * v, vy: (dy / L) * v, ty, nm: S.nm });
      }
      function step(dt) {
        const G = geo();
        emitAcc += dt * 40 * (S.I / 100); // photons per second ∝ intensity
        while (emitAcc >= 1) { emitAcc -= 1; spawnPhoton(G); }
        for (let i = photons.length - 1; i >= 0; i--) {
          const p = photons[i]; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x <= G.plate.x + 4) {
            photons.splice(i, 1);
            const ke = kemax(p.nm, S.metal.W);
            if (ke > 0) { // each photon ejects at most one electron; KE spread 0..Eₖ,max
              const sp = 40 + 120 * Math.sqrt(ke * (0.4 + 0.6 * Math.random())); // ∝ √KE
              const ang = (Math.random() - 0.5) * 1.6;
              electrons.push({ x: G.plate.x + 6, y: p.ty, vx: sp * Math.cos(ang), vy: sp * Math.sin(ang), life: 0 });
            }
          }
        }
        for (let i = electrons.length - 1; i >= 0; i--) {
          const e = electrons[i]; e.x += e.vx * dt; e.y += e.vy * dt; e.life += dt;
          if (e.x > G.W || e.y < 0 || e.y > G.Hh || e.life > 4) electrons.splice(i, 1);
        }
      }

      function drawStage() {
        const g = cvS.g, G = geo(), { W, Hh } = G;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const font = (px) => px + 'px ' + col('--body-font');
        // Plate
        g.fillStyle = col('--muted'); g.fillRect(G.plate.x - 8, G.plate.y0, 12, G.plate.y1 - G.plate.y0);
        g.fillStyle = col('--fg'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(`${S.metal.name}  W=${S.metal.W} eV`, 6, G.plate.y1 + 6);
        // Lamp with beam cone
        const c = lamColor(S.nm, 1);
        g.fillStyle = lamColor(S.nm, 0.06 + 0.14 * (S.I / 100));
        g.beginPath(); g.moveTo(G.lamp.x, G.lamp.y); g.lineTo(G.plate.x + 4, G.plate.y0); g.lineTo(G.plate.x + 4, G.plate.y1); g.closePath(); g.fill();
        g.fillStyle = col('--line'); g.beginPath(); g.arc(G.lamp.x, G.lamp.y, 14, 0, 7); g.fill();
        g.fillStyle = c; g.globalAlpha = 0.3 + 0.7 * (S.I / 100); g.beginPath(); g.arc(G.lamp.x, G.lamp.y, 9, 0, 7); g.fill(); g.globalAlpha = 1;
        g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText(`${S.nm} nm${S.nm < 380 ? ' 紫外' : ''}`, G.lamp.x, G.lamp.y + 18);

        if (ctx.reduced) {
          // Static schematic: three photon arrows, then electron arrows (length ∝ √KE) or a ✕
          for (let k = 0; k < 3; k++) {
            const ty = G.plate.y0 + (G.plate.y1 - G.plate.y0) * (0.25 + 0.25 * k);
            arrow(g, G.lamp.x - 18, G.lamp.y + 4 + k * 6, G.plate.x + 10, ty, c, S.I > 0 ? 1 + 2 * (S.I / 100) : 0.5);
            if (above() && S.I > 0) arrow(g, G.plate.x + 8, ty, G.plate.x + 8 + 30 + 45 * Math.sqrt(kemax(S.nm, S.metal.W)), ty - 14 + k * 14, col('--accent'), 2);
          }
        } else {
          for (const p of photons) { // wave packet: short sinusoid along the direction of travel
            const L = Math.hypot(p.vx, p.vy), ux = p.vx / L, uy = p.vy / L, lam = 3 + 6 * (p.nm - 150) / 550;
            g.strokeStyle = lamColor(p.nm, 1); g.lineWidth = 1.5; g.beginPath();
            for (let s = -10; s <= 10; s += 1) { const a = 3 * Math.exp(-(s * s) / 40) * Math.sin((2 * Math.PI * s) / lam); const x = p.x + ux * s - uy * a, y = p.y + uy * s + ux * a; s === -10 ? g.moveTo(x, y) : g.lineTo(x, y); }
            g.stroke();
          }
          g.fillStyle = col('--accent');
          for (const e of electrons) { g.beginPath(); g.arc(e.x, e.y, 3, 0, 7); g.fill(); }
        }
        // Verdict banner
        g.font = font(12); g.textAlign = 'left'; g.textBaseline = 'top';
        if (!above()) { g.fillStyle = col('--warn'); g.fillText(S.I > 0 ? '低于阈值：再亮也没有电子逸出' : '低于阈值', 10, 8); }
        else { g.fillStyle = col('--good'); g.fillText(S.I > 0 ? 'e⁻ 逸出：Eₖ,max = hν − W' : '高于阈值（光强为 0）', 10, 8); }
      }
      function arrow(g, x0, y0, x1, y1, c, w) {
        g.strokeStyle = c; g.fillStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1, y1);
        g.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4)); g.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4)); g.fill();
      }

      /* ---- Millikan plot: V₀ vs ν ---- */
      function drawPlot() {
        const g = cvP.g, W = cvP.w, Hh = cvP.h;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: 4, x1: 20, y0: 0, y1: 6.5, pad: { l: 42, r: 12, t: 12, b: 34 },
          xTicks: [4, 8, 12, 16, 20], yTicks: [0, 2, 4, 6], xLabel: '频率 ν (10¹⁴ Hz)', yLabel: '遏止电压 V₀ (V)' }, col);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const line = (a, b, c, dash, w) => { g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); g.moveTo(A.X(4), A.Y(a + b * 4)); g.lineTo(A.X(20), A.Y(a + b * 20)); g.stroke(); g.setLineDash([]); };
        const hE = (hP / qe) * 1e14; // V per 10¹⁴ Hz
        // Theory line for current metal
        line(-S.metal.W, hE, col(S.metal.s), [5, 4], 1.5);
        // Current ν marker
        const nuNow = nuOf(S.nm) / 1e14;
        g.strokeStyle = lamColor(S.nm, 0.6); g.lineWidth = 2; g.beginPath(); g.moveTo(A.X(nuNow), A.p.t); g.lineTo(A.X(nuNow), A.p.t + A.ih); g.stroke();
        // Data points & per-metal fits
        for (const m of METALS) {
          const pts = S.pts.filter((p) => p.metal === m && p.V > 0);
          const cur = m === S.metal, alpha = cur ? 1 : 0.35;
          g.globalAlpha = alpha;
          const f = pts.length >= 2 ? fit(pts.map((p) => [p.nu, p.V])) : null;
          if (f) line(f.a, f.b, col(m.s), [], cur ? 2 : 1.5);
          g.fillStyle = col(m.s);
          for (const p of S.pts.filter((q) => q.metal === m)) { g.beginPath(); g.arc(A.X(p.nu), A.Y(p.V), cur ? 4 : 3, 0, 7); g.fill(); }
          g.globalAlpha = 1;
        }
        g.restore();
        // Legend of metals with data
        g.font = '11px ' + col('--body-font'); g.textBaseline = 'middle'; g.textAlign = 'left';
        let ly = A.p.t + 10;
        for (const m of METALS) {
          if (m !== S.metal && !S.pts.some((p) => p.metal === m)) continue;
          g.globalAlpha = m === S.metal ? 1 : 0.5; g.fillStyle = col(m.s); g.beginPath(); g.arc(A.p.l + 10, ly, 4, 0, 7); g.fill();
          g.fillStyle = col('--fg'); g.fillText(m.name + (m === S.metal ? '（虚线=理论）' : ''), A.p.l + 18, ly); ly += 15;
        }
        g.globalAlpha = 1;
      }

      /* ---- Controls ---- */
      const sL = h.slider({ label: '波长 λ', min: 150, max: 700, step: 1, value: S.nm, format: (v) => v + ' nm', onInput: (v) => { S.nm = v; refresh(); } });
      const sI = h.slider({ label: '光强', min: 0, max: 100, step: 1, value: S.I, format: (v) => v + ' %', onInput: (v) => { S.I = v; refresh(); } });
      const cM = h.choice({ label: '金属', value: 'Cs', options: METALS.map((m) => ({ value: m.id, label: m.name })),
        onChange: (v) => { S.metal = METALS.find((m) => m.id === v); photons.length = 0; electrons.length = 0; refresh(); } });
      const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) / Math.sqrt(0.5); }; // ~N(0,1)
      const bMeasure = h.button({ label: '测一个数据点', kind: 'primary', onClick: () => {
        const ke = kemax(S.nm, S.metal.W);
        const V = ke > 0 ? Math.max(0, ke + 0.015 * gauss()) : 0; // ±~0.03 V experimental noise
        S.pts.push({ nu: nuOf(S.nm) / 1e14, V, metal: S.metal }); refresh();
      } });
      const bClear = h.button({ label: '清空', onClick: () => { S.pts = []; refresh(); } });
      controls.append(sL.el, sI.el, cM.el, bMeasure, bClear);

      const rE = h.readout('光子能量 hν'), rK = h.readout('Eₖ,max = hν − W'), rL0 = h.readout('阈值 λ₀ = hc/W');
      const rI = h.readout('光电流（相对）'), rH = h.readout('拟合 h = 斜率·e'), rN0 = h.readout('拟合阈值 ν₀');
      readout.append(rE.el, rK.el, rL0.el, rI.el, rH.el, rN0.el);
      function updateReadouts() {
        const E = photonEV(S.nm), W = S.metal.W, ke = E - W;
        rE.set(`${E.toFixed(2)} eV（ν = ${(nuOf(S.nm) / 1e14).toFixed(2)}×10¹⁴ Hz）`);
        rK.set(ke > 0 ? `${E.toFixed(2)} − ${W.toFixed(2)} = ${ke.toFixed(2)} eV` : '0（低于阈值）');
        rL0.set(`${(HC / W).toFixed(0)} nm`);
        rI.set(ke > 0 ? `${S.I} %` : '0');
        const pts = S.pts.filter((p) => p.metal === S.metal && p.V > 0).map((p) => [p.nu, p.V]);
        const f = pts.length >= 2 ? fit(pts) : null;
        if (f && f.b > 0) {
          const hfit = (f.b * qe) / 1e14;
          rH.set(`${(hfit / 1e-34).toFixed(2)}×10⁻³⁴ J·s（真值 6.63）`);
          rN0.set(`${(-f.a / f.b).toFixed(2)}×10¹⁴ Hz（W ≈ ${((-f.a)).toFixed(2)} eV）`);
        } else { rH.set(`需 ≥2 个 V₀>0 的点（${pts.length}/2）`); rN0.set('—'); }
      }

      function refresh() { updateReadouts(); drawPlot(); if (ctx.reduced || !lp.running) drawStage(); }
      const lp = h.loop((dt) => { step(dt); drawStage(); });
      if (!ctx.reduced) lp.start();

      // Opening state: a few measured points for Cs so the plot is already meaningful
      for (const nm of [250, 330, 420]) S.pts.push({ nu: nuOf(nm) / 1e14, V: kemax(nm, 2.14) + 0.015 * gauss(), metal: METALS[0] });

      cvS.onResize(drawStage); cvP.onResize(drawPlot);
      const mo = new MutationObserver(() => { drawPlot(); drawStage(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      refresh();

      return { destroy() { lp.stop(); cvS.destroy(); cvP.destroy(); mo.disconnect(); } };
    },
  };
})();
