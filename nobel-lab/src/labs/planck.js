/* 黑体辐射谱 — Nobel Physics 1918 (Planck, energy quanta)
 * Constants (SI 2019 exact): h = 6.62607015e-34 J·s, c = 2.99792458e8 m/s, k = 1.380649e-23 J/K
 * Wien displacement b = 2.897771955e-3 m·K; σ = 2π⁵k⁴/(15c²h³) ≈ 5.670374e-8 W·m⁻²·K⁻⁴
 */
(() => {
  const hP = 6.62607015e-34, cL = 2.99792458e8, kB = 1.380649e-23;
  const WIEN_B = 2.897771955e-3;
  const SIGMA = (2 * Math.PI ** 5 * kB ** 4) / (15 * cL * cL * hP ** 3);

  // Spectral radiance per unit wavelength, W·sr⁻¹·m⁻³ (λ in m)
  const planck = (lam, T) => { const x = (hP * cL) / (lam * kB * T); return x > 700 ? 0 : (2 * hP * cL * cL) / lam ** 5 / Math.expm1(x); };
  const rayleighJeans = (lam, T) => (2 * cL * kB * T) / lam ** 4;
  const wien = (lam, T) => ((2 * hP * cL * cL) / lam ** 5) * Math.exp((-hP * cL) / (lam * kB * T));
  // Mean energy of one oscillator mode, in units of kT, as a function of x = hν/kT
  const meanPlanck = (x) => (x < 1e-6 ? 1 : x > 700 ? 0 : x / Math.expm1(x));

  // CIE 1931 colour-matching functions, multi-lobe Gaussian fit (Wyman, Sloan & Shirley 2013)
  const gs = (x, m, s1, s2) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
  const cmf = (l) => [
    1.056 * gs(l, 599.8, 37.9, 31.0) + 0.362 * gs(l, 442.0, 16.0, 26.7) - 0.065 * gs(l, 501.1, 20.4, 26.2),
    0.821 * gs(l, 568.8, 46.9, 40.5) + 0.286 * gs(l, 530.9, 16.3, 31.1),
    1.217 * gs(l, 437.0, 11.8, 36.0) + 0.681 * gs(l, 459.0, 26.0, 13.8),
  ];
  // Perceived colour of a blackbody: ∫B·cmf → XYZ → linear sRGB, normalised to brightest channel
  function bbColor(T) {
    let X = 0, Y = 0, Z = 0;
    for (let l = 380; l <= 780; l += 5) { const B = planck(l * 1e-9, T), [a, b, c] = cmf(l); X += B * a; Y += B * b; Z += B * c; }
    let rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
    rgb = rgb.map((v) => Math.max(0, v));
    const m = Math.max(...rgb) || 1;
    return rgb.map((v) => { v /= m; v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; return Math.round(255 * v); });
  }
  // Fraction of total exitance emitted in 380–780 nm: π∫B dλ / σT⁴
  function visibleFraction(T) { let s = 0; for (let l = 380.5; l < 780; l += 1) s += planck(l * 1e-9, T) * 1e-9; return (Math.PI * s) / (SIGMA * T ** 4); }

  const niceStep = (range, n) => { const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
  const fmtNum = (v) => (v === 0 ? '0' : Math.abs(v) >= 100 ? v.toFixed(0) : String(+v.toPrecision(3)));

  LABS.planck = {
    title: '黑体辐射谱',
    _m: { planck, rayleighJeans, wien, meanPlanck, bbColor, visibleFraction, SIGMA, WIEN_B },
    mount(root, ctx) {
      const h = ctx.h, col = ctx.color;
      const S = { T: 5800, ghost: 3000, rj: true, wien: false, modes: true };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '把温度调低：峰值向红光、红外移动，总辐射按 T⁴ 骤减。瑞利–金斯公式在长波处与普朗克吻合，短波处却发散到无穷（紫外灾变）；下图说明原因——能量只能按 hν 一份份给出，hν ≫ kT 的高频模式几乎激发不起来，被“冻结”。' });
      root.append(stage, controls, readout, hint);
      const cv1 = h.canvas(stage, { aspect: 0.58, minH: 220, maxH: 400 });
      const cv2 = h.canvas(stage, { aspect: 0.42, minH: 190, maxH: 300 });

      // Label with a panel-coloured backing so it stays readable over curves
      function tag(g, text, x, y, color, align = 'left') {
        g.font = '11px ' + col('--mono-font');
        const w = g.measureText(text).width + 6;
        const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
        g.fillStyle = col('--panel'); g.globalAlpha = 0.85; g.fillRect(x0, y - 8, w, 16); g.globalAlpha = 1;
        g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x0 + 3, y);
      }
      // Legend row drawn in the top padding: items = [[label, color, dashed]]
      function legend(g, items, x, y, xMax) {
        g.font = '11px ' + col('--body-font'); g.textBaseline = 'middle'; g.textAlign = 'left';
        const x0 = x;
        for (const [lab, c, dash] of items) {
          if (x + 18 + g.measureText(lab).width > xMax) { x = x0; y += 14; } // wrap on narrow screens
          g.strokeStyle = c; g.lineWidth = 2; g.setLineDash(dash ? [4, 3] : []);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]);
          g.fillStyle = col('--muted'); g.fillText(lab, x + 18, y); x += 28 + g.measureText(lab).width;
        }
      }
      // Stroke y = f(x) across the plot, clipped to the frame
      function curve(g, A, xs, f, color, { dash = null, width = 2, alpha = 1 } = {}) {
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.strokeStyle = color; g.lineWidth = width; g.globalAlpha = alpha; g.setLineDash(dash || []);
        g.beginPath(); let first = true;
        for (let px = 0; px <= A.iw; px += 1) {
          const v = f(xs(px)); if (!isFinite(v)) { first = true; continue; }
          const y = Math.max(A.p.t - 20, A.Y(v)); const x = A.p.l + px;
          if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
        }
        g.stroke(); g.restore();
      }

      /* ---- Panel 1: B_λ vs λ ---- */
      function drawSpectrum() {
        const g = cv1.g, W = cv1.w, Hh = cv1.h, T = S.T;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const unit = 1e-12; // W·sr⁻¹·m⁻³ → kW·sr⁻¹·m⁻²·nm⁻¹
        const lmax = WIEN_B / T, peak = planck(lmax, T) * unit, ymax = peak * 1.25;
        const st = niceStep(ymax, 4), yTicks = []; for (let v = 0; v <= ymax * 1.0001; v += st) yTicks.push(v);
        const A = h.axes(g, W, Hh, { x0: 0, x1: 3000, y0: 0, y1: ymax, pad: { l: 50, r: 12, t: W < 480 ? 38 : 26, b: 34 },
          xTicks: [0, 500, 1000, 1500, 2000, 2500, 3000], yTicks, fmtY: fmtNum,
          xLabel: '波长 λ (nm)', yLabel: 'B_λ  kW/(sr·m²·nm)' }, col);
        const lamAt = (px) => (px / A.iw) * 3000; // nm
        const B = (fn, T2) => (nm) => (nm < 20 ? NaN : fn(nm * 1e-9, T2) * unit);
        // Visible band: rainbow fill under the curve + strip along the axis
        for (let px = Math.floor(A.X(380) - A.p.l); px <= A.X(780) - A.p.l; px++) {
          const nm = lamAt(px), c = h.wavelengthRGB(nm, 0.45); if (!c) continue;
          const y = Math.max(A.p.t, A.Y(planck(nm * 1e-9, T) * unit));
          g.fillStyle = c; g.fillRect(A.p.l + px, y, 1.2, A.p.t + A.ih - y);
          g.fillStyle = h.wavelengthRGB(nm, 1); g.fillRect(A.p.l + px, A.p.t + A.ih - 5, 1.2, 5);
        }
        const items = [['普朗克', col('--s1')]];
        if (S.ghost) {
          curve(g, A, lamAt, B(planck, S.ghost), col('--muted'), { dash: [5, 4], width: 1.5 });
          items.push([S.ghost + ' K', col('--muted'), true]);
          const gl = (WIEN_B / S.ghost) * 1e9, gp = planck(gl * 1e-9, S.ghost) * unit;
          if (gp > ymax) tag(g, `${S.ghost} K ↑×${fmtNum(gp / peak)}`, Math.min(A.X(gl) + 4, W - 90), A.p.t + 30, col('--muted'));
        }
        if (S.wien) { curve(g, A, lamAt, B(wien, T), col('--s3'), { dash: [2, 3], width: 2 }); items.push(['维恩近似', col('--s3'), true]); }
        curve(g, A, lamAt, B(planck, T), col('--s1'), { width: 2.5 });
        if (S.rj) {
          curve(g, A, lamAt, B(rayleighJeans, T), col('--warn'), { width: 2 });
          items.push(['瑞利–金斯', col('--warn')]);
          // where RJ leaves the top of the plot
          const lc = Math.pow((2 * cL * kB * T) / (ymax / unit), 0.25) * 1e9;
          const xl = lc < 3000 ? A.X(lc) + 6 : A.p.l + A.iw - 110;
          tag(g, lc < 3000 ? '紫外灾变 ↑∞' : '瑞利–金斯 ↑ 图外', Math.min(xl, W - 92), A.p.t + 12, col('--warn'));
        }
        legend(g, items, A.p.l, 10, W - 6);
        // Peak marker
        const xm = A.X(lmax * 1e9), ym = A.Y(peak);
        g.fillStyle = col('--accent'); g.beginPath(); g.arc(xm, ym, 4, 0, 7); g.fill();
        g.strokeStyle = col('--accent'); g.setLineDash([2, 3]); g.lineWidth = 1;
        g.beginPath(); g.moveTo(xm, ym); g.lineTo(xm, A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        const right = xm > A.p.l + A.iw * 0.7;
        tag(g, `λ_max ${(lmax * 1e9).toFixed(0)} nm`, right ? xm - 8 : xm + 8, ym - 12, col('--accent'), right ? 'right' : 'left');
      }

      /* ---- Panel 2: ⟨E⟩ per mode vs ν ---- */
      function drawModes() {
        const g = cv2.g, W = cv2.w, Hh = cv2.h, T = S.T;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const nuT = (kB * T) / hP / 1e14; // kT/h in units of 10¹⁴ Hz
        const A = h.axes(g, W, Hh, { x0: 0, x1: 15, y0: 0, y1: 1.3, pad: { l: 50, r: 12, t: 26, b: 34 },
          xTicks: [0, 3, 6, 9, 12, 15], yTicks: [0, 0.5, 1], fmtY: (v) => String(v),
          xLabel: '频率 ν (10¹⁴ Hz)', yLabel: '⟨E⟩ / kT' }, col);
        const nuAt = (px) => (px / A.iw) * 15;
        // visible band on the frequency axis (ν = c/λ)
        for (let px = 0; px <= A.iw; px++) {
          const c = h.wavelengthRGB(cL / (nuAt(px) * 1e14) * 1e9, 1);
          if (c) { g.fillStyle = c; g.fillRect(A.p.l + px, A.p.t + A.ih - 5, 1.2, 5); }
        }
        const items = [['经典 ⟨E⟩=kT', col('--warn')], ['普朗克 ⟨E⟩', col('--s1')]];
        if (S.modes) {
          // × mode density ν² (normalised so Planck's peak = 1): the spectrum itself
          const norm = 1.4214; // max of x³/(eˣ−1) at x≈2.821
          curve(g, A, nuAt, (n) => (n / nuT) ** 2 / norm, col('--warn'), { dash: [4, 3], width: 1.5, alpha: 0.7 });
          curve(g, A, nuAt, (n) => { const x = n / nuT; return (x * x * meanPlanck(x)) / norm; }, col('--s1'), { dash: [4, 3], width: 1.5, alpha: 0.7 });
          items.push(['×ν²（谱）', col('--muted'), true]);
        }
        curve(g, A, nuAt, () => 1, col('--warn'), { width: 2 });
        curve(g, A, nuAt, (n) => meanPlanck(n / nuT), col('--s1'), { width: 2.5 });
        legend(g, items, A.p.l, 12, W - 6);
        // kT/h marker
        if (nuT <= 15) {
          const x = A.X(nuT);
          g.strokeStyle = col('--accent'); g.lineWidth = 1; g.setLineDash([2, 3]);
          g.beginPath(); g.moveTo(x, A.p.t); g.lineTo(x, A.p.t + A.ih); g.stroke(); g.setLineDash([]);
          tag(g, 'kT/h', x + 3, A.p.t + A.ih - 14, col('--accent'));
        }
        // "frozen" annotation where hν ≈ 4kT
        const xf = Math.min(4 * nuT, 13);
        tag(g, 'hν≫kT：冻结', Math.min(A.X(xf), W - 100), A.Y(Math.max(0.12, meanPlanck(xf / nuT))) - 12, col('--s1'));
        if (S.modes) tag(g, '经典×ν² → ∞', A.p.l + A.iw - 4, A.p.t + 12, col('--warn'), 'right');
      }

      /* ---- Controls & readouts ---- */
      const sT = h.slider({ label: '温度 T', min: 1000, max: 12000, step: 100, value: S.T,
        format: (v) => v + ' K' + (v === 5800 ? '（太阳表面）' : v === 3000 ? '（白炽灯丝）' : ''),
        onInput: (v) => { S.T = v; draw(); } });
      const cGhost = h.choice({ label: '对比曲线', value: 3000,
        options: [{ value: 0, label: '无' }, { value: 3000, label: '3000 K' }, { value: 5800, label: '5800 K' }, { value: 'pin', label: '钉住当前' }],
        onChange: (v) => { S.ghost = v === 'pin' ? S.T : v; draw(); } });
      const tRJ = h.toggle({ label: '瑞利–金斯（经典）', value: S.rj, onChange: (b) => { S.rj = b; draw(); } });
      const tW = h.toggle({ label: '维恩近似', value: S.wien, onChange: (b) => { S.wien = b; draw(); } });
      const tM = h.toggle({ label: '下图乘模式数 ν²', value: S.modes, onChange: (b) => { S.modes = b; draw(); } });
      controls.append(sT.el, cGhost.el, tRJ.el, tW.el, tM.el);

      const rPeak = h.readout('峰值 λ_max = b/T'), rM = h.readout('总出射度 σT⁴'), rVis = h.readout('可见光占比');
      const rkT = h.readout('kT · kT/h'), rFz = h.readout('550 nm 模式 ⟨E⟩ = hν/(e^{hν/kT}−1)'), rCol = h.readout('视觉颜色');
      const sw = h.el('span', { style: 'display:inline-block;width:2.2em;height:1em;border-radius:3px;vertical-align:middle;margin-left:.5em;border:1px solid var(--line)' });
      rCol.el.append(sw);
      readout.append(rPeak.el, rM.el, rVis.el, rkT.el, rFz.el, rCol.el);

      function updateReadouts() {
        const T = S.T, lm = (WIEN_B / T) * 1e9;
        const band = lm < 380 ? '紫外' : lm <= 780 ? '可见' : '红外';
        rPeak.set(`${lm.toFixed(0)} nm（${band}）`);
        rM.set(`${((SIGMA * T ** 4) / 1e6).toPrecision(3)} MW/m²`);
        rVis.set(`${(visibleFraction(T) * 100).toFixed(1)} %`);
        const kT = (kB * T) / 1.602176634e-19;
        rkT.set(`${kT.toFixed(3)} eV · ${((kB * T) / hP / 1e12).toFixed(0)} THz`);
        const x = (hP * cL) / (550e-9 * kB * T);
        rFz.set(`${meanPlanck(x).toFixed(3)} kT（hν = ${x.toFixed(2)} kT）`);
        const [r, g, b] = bbColor(T);
        rCol.set(T < 2000 ? '暗红（多为红外）' : `rgb(${r}, ${g}, ${b})`);
        sw.style.background = `rgb(${r},${g},${b})`;
      }
      function draw() { drawSpectrum(); drawModes(); updateReadouts(); }

      cv1.onResize(drawSpectrum); cv2.onResize(drawModes);
      // Redraw when the theme changes (colours are read at draw time)
      const mo = new MutationObserver(draw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', draw);
      draw();

      return { destroy() { cv1.destroy(); cv2.destroy(); mo.disconnect(); mq.removeEventListener('change', draw); } };
    },
  };
})();
