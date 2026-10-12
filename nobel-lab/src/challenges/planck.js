/* 炽热之光 — challenge for Nobel Physics 1918 (Planck, energy quanta)
 * The reader rediscovers Wien's displacement law from noisy cavity spectra, sees equipartition fail,
 * and fits ε = C·ν^p to find p = 1 and C = h.
 * Constants (SI exact): h = 6.62607015e-34 J·s, c = 2.99792458e8 m/s, k = 1.380649e-23 J/K.
 * Spectral energy density per unit λ: u_λ = (8π/λ⁴)·⟨E⟩, ⟨E⟩ = ε/(e^{ε/kT} − 1), ε = Cν^p (data: C = h, p = 1).
 * Per unit ν: u_ν = (8πν²/c³)·⟨E⟩.  Wien: λ_max·T = 2897.77 µm·K.
 */
(() => {
  const hP = 6.62607015e-34, cL = 2.99792458e8, kB = 1.380649e-23;
  const WIEN = 2897.771955; // µm·K
  const TS = [1100, 1400, 1700];
  const TCOL = ['--s4', '--s2', '--s1'];
  const CHI_OK = 5;

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // Mean energy of one mode when energy comes in packets ε (Boltzmann counting)
  const meanE = (eps, T) => { const x = eps / (kB * T); if (!(x > 1e-9)) return kB * T; if (x > 700) return 0; return eps / Math.expm1(x); };
  // u_λ in SI (J/m⁴) for λ in µm
  const uLamSI = (lum, T, C, p, classical) => { const lam = lum * 1e-6, nu = cL / lam; const E = classical ? kB * T : meanE(C * Math.pow(nu, p), T); return ((8 * Math.PI) / lam ** 4) * E; };
  const S0 = 100 / uLamSI(WIEN / 1700, 1700, hP, 1); // display units: 1700 K peak = 100
  const uLam = (lum, T, C = hP, p = 1, classical = false) => S0 * uLamSI(lum, T, C, p, classical);
  // u_ν in display units (1700 K peak = 100), ν in THz
  const uNuSI = (nuT, T, classical) => { const nu = nuT * 1e12; const E = classical ? kB * T : meanE(hP * nu, T); return ((8 * Math.PI * nu * nu) / cL ** 3) * E; };
  const SN = 100 / uNuSI((2.821439 * kB * 1700) / hP / 1e12, 1700);

  // "Measured" spectra (seeded, ~2% noise plus a small floor), λ = 0.5 … 8 µm
  const DATA = (() => {
    const rnd = mulberry32(1900);
    const gauss = () => { const a = rnd() || 1e-12, b = rnd(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
    return TS.map((T) => {
      const pk = uLam(WIEN / T, T); const pts = [];
      for (let i = 0; i <= 60; i++) {
        const l = 0.5 + i * 0.125, tr = uLam(l, T), s = 0.02 * tr + 0.004 * pk;
        pts.push({ l, y: tr + s * gauss(), s });
      }
      const max = Math.max(...pts.map((q) => q.y));
      return { T, pts, max };
    });
  })();
  function chi2(C, p, classical) {
    let s = 0, n = 0;
    for (const d of DATA) for (const q of d.pts) { const m = uLam(q.l, d.T, C, p, classical); s += ((m - q.y) / q.s) ** 2; n++; }
    return s / n;
  }

  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 3) => { if (!isFinite(v)) return '∞'; if (v === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-planck')) return;
    const s = document.createElement('style'); s.id = 'st-planck';
    s.textContent = `
.planck-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; align-items: start; }
.planck-row > * { min-width: 0; }
.planck-note { font-size: 13px; color: var(--muted); line-height: 1.65; margin: 0; }
.planck-box { display: grid; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
.planck-meter { height: 10px; border-radius: 5px; background: var(--bg2); position: relative; overflow: hidden; border: 1px solid var(--line); }
.planck-meter > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--warn); }
.planck-meter > i.ok { background: var(--good); }
.planck-meter > b { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--fg); }
.planck-details { font-size: 13px; line-height: 1.7; }
.planck-details summary { cursor: pointer; color: var(--accent); }
.planck-hidden { display: none !important; }`;
    document.head.append(s);
  }

  // Shared drawing helpers
  function tag(g, col, text, x, y, color, align = 'left') {
    g.font = '11px ' + col('--mono-font');
    const w = g.measureText(text).width + 6;
    const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    g.fillStyle = col('--panel'); g.globalAlpha = 0.85; g.fillRect(x0, y - 8, w, 16); g.globalAlpha = 1;
    g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x0 + 3, y);
  }
  function curve(g, A, x0, x1, f, color, width = 2, dash = []) {
    g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath(); let first = true;
    for (let px = 0; px <= A.iw; px++) {
      const x = x0 + (px / A.iw) * (x1 - x0), v = f(x);
      if (!isFinite(v)) { first = true; continue; }
      const y = Math.max(A.p.t - 30, Math.min(A.p.t + A.ih + 30, A.Y(v)));
      if (first) { g.moveTo(A.p.l + px, y); first = false; } else g.lineTo(A.p.l + px, y);
    }
    g.stroke(); g.restore();
  }
  function legend(g, col, items, x, y, xMax) {
    g.font = '11px ' + col('--body-font'); g.textBaseline = 'middle'; g.textAlign = 'left';
    const x0 = x;
    for (const [lab, c, dot] of items) {
      if (x + 18 + g.measureText(lab).width > xMax) { x = x0; y += 14; }
      g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 2;
      if (dot) { g.beginPath(); g.arc(x + 7, y, 3, 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); }
      g.fillStyle = col('--muted'); g.fillText(lab, x + 18, y); x += 28 + g.measureText(lab).width;
    }
    return y;
  }

  // Spectra plot (λ space). opts: {norm, marks:[λ|null]×3, sel, model(l,T) | null}
  function drawSpectra(cv, h, col, o) {
    const g = cv.g, W = cv.w, Hh = cv.h;
    g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
    const top = W < 480 ? 40 : 26;
    const A = h.axes(g, W, Hh, { x0: 0, x1: 8, y0: 0, y1: 115, pad: { l: 40, r: 10, t: top, b: 34 },
      xTicks: [0, 1, 2, 3, 4, 5, 6, 7, 8], yTicks: [0, 25, 50, 75, 100], xLabel: '波长 λ (µm)', yLabel: o.norm ? '强度（各自归一）' : '强度（同一刻度）' }, col);
    const items = [];
    DATA.forEach((d, i) => {
      const c = col(TCOL[i]), sc = o.norm ? 100 / d.max : 1;
      if (o.model) curve(g, A, 0.3, 8, (l) => (l < 0.3 ? NaN : o.model(l, d.T) * sc), c, 2);
      g.fillStyle = c; g.globalAlpha = o.model ? 0.75 : 1;
      for (const q of d.pts) { const y = A.Y(q.y * sc); if (y < A.p.t - 4) continue; g.beginPath(); g.arc(A.X(q.l), y, 2.4, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      items.push([d.T + ' K', c, true]);
    });
    if (o.marks) {
      o.marks.forEach((m, i) => {
        if (m == null) return;
        const x = A.X(m), c = col(TCOL[i]), on = i === o.sel;
        g.strokeStyle = c; g.lineWidth = on ? 2.5 : 1.5; g.setLineDash(on ? [] : [5, 4]);
        g.beginPath(); g.moveTo(x, A.p.t); g.lineTo(x, A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        const right = x > A.p.l + A.iw * 0.7;
        tag(g, col, `${TS[i]}K ${m.toFixed(2)}`, right ? x - 4 : x + 4, A.p.t + 12 + i * 17, c, right ? 'right' : 'left');
      });
    }
    if (o.model && o.overflow) tag(g, col, o.overflow, A.p.l + A.iw - 4, A.p.t + 12, col('--warn'), 'right');
    legend(g, col, items, A.p.l, 11, W - 6);
    return A;
  }

  CHALLENGES.planck = {
    title: '炽热之光',
    _m: { DATA, chi2, uLam, meanE, WIEN, hP },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color, el = h.el;

      /* ================= Stage 1 ================= */
      const stage1 = {
        title: '颜色与温度',
        task: `<p>柏林，1900 年。吹玻璃的工匠和炼钢工人靠“火色”判断炉温：暗红、橙红、亮黄……帝国物理技术研究所（PTR）的 Lummer 与 Pringsheim 用一个开小孔的空腔炉（“黑体”）把这件事做成了精密测量：在不同温度下，逐个波长测出辐射强度。</p>
<p>下图是三组“测量值”（1100 K、1400 K、1700 K，λ = 0.5–8 µm，约 2% 噪声）。<b>在每条曲线上标出峰值所在的波长</b>（在图上点击或拖动竖线；也可以用下方滑块）。然后在右边的小图里换着坐标看你的三个点，找出峰值波长 $\\lambda_{\\text{peak}}$ 怎样随温度 $T$ 变化。</p>`,
        hints: [
          '三个点在「λ – 1/T」坐标里像是落在一条过原点的直线上吗？在「lg λ – lg T」坐标里，直线的斜率就是 $\\lambda_{\\text{peak}}\\propto T^p$ 中的 $p$。',
          '若 $\\lambda_{\\text{peak}}\\propto T^{-1}$，那么乘积 $\\lambda_{\\text{peak}}\\,T$ 对三个温度应当是同一个数——把表里每行的 λ 乘以 T 看看。',
          '$p=-1$；$\\lambda_{\\text{peak}}T$ 大约是 2900 µm·K。',
        ],
        answer: '峰值波长反比于温度：$\\lambda_{\\text{peak}}T = b \\approx 2898\\ \\mu\\text{m·K}$（维恩位移律，1893）。例如 1700 K 时 $\\lambda_{\\text{peak}}\\approx 1.70\\ \\mu$m，1100 K 时 ≈ 2.63 µm；在 lg–lg 图里三点连成斜率 −1 的直线。',
        build(body, api) {
          const S = { marks: [null, null, null], sel: 0, norm: true, axis: 'inv', drag: false };
          const dispC = h.choice({ label: '纵轴显示', value: 'norm', options: [{ value: 'norm', label: '每条曲线各自归一（便于找峰）' }, { value: 'abs', label: '同一刻度' }], onChange: (v) => { S.norm = v === 'norm'; draw(); } });
          const stage = el('div', { class: 'lab-stage' });
          body.append(dispC.el, stage);
          const cv = h.canvas(stage, { aspect: 0.56, minH: 230, maxH: 380 });
          cv.canvas.style.cursor = 'crosshair';
          cv.canvas.setAttribute('aria-label', '三条空腔辐射谱；点击或拖动以标记峰值位置');
          const ctrls = el('div', { class: 'lab-controls' });
          const selC = h.choice({ label: '正在标记的曲线', value: 0, options: TS.map((T, i) => ({ value: i, label: T + ' K' })), onChange: (v) => { S.sel = v; sl.set(S.marks[v] ?? 3); draw(); } });
          const sl = h.slider({ label: '峰值标记 λ', min: 0.5, max: 8, step: 0.01, value: 3, format: (v) => v.toFixed(2) + ' µm', onInput: (v) => { S.marks[S.sel] = v; changed(); } });
          ctrls.append(selC.el, sl.el);
          body.append(ctrls);

          const tbody = el('tbody');
          const table = el('div', { class: 'dtable' }, [el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'T (K)' }), el('th', { text: 'λ_peak (µm)' })])]), tbody])]);
          const relWrap = el('div', { class: 'lab-stage' });
          const axC = h.choice({ label: '小图坐标', value: 'inv', options: [{ value: 'lin', label: 'λ – T' }, { value: 'inv', label: 'λ – 1/T' }, { value: 'log', label: 'lg λ – lg T' }], onChange: (v) => { S.axis = v; drawRel(); } });
          relWrap.append(axC.el);
          const cvR = h.canvas(relWrap, { aspect: 0.72, minH: 190, maxH: 260 });
          body.append(el('div', { class: 'planck-row' }, [el('div', { class: 'planck-box' }, [el('p', { class: 'planck-note', text: '你的标记' }), table]), relWrap]));

          let okP = false, okB = false;
          const marksDone = () => S.marks.every((m) => m != null);
          const ansP = h.answer({ label: '$\\lambda_{\\text{peak}}\\propto T^{\\,p}$，指数 $p$ = ?（容差 ±0.12）', placeholder: '例如 0.5',
            check: (v) => {
              if (!marksDone()) return { ok: false, msg: '先把三条曲线的峰都标出来。' };
              const own = ownSlope();
              const ok = Math.abs(v + 1) <= 0.12 || (Math.abs(own + 1) <= 0.3 && Math.abs(v - own) <= 0.05);
              return ok ? { ok, msg: '对：温度升高，峰向短波移动，而且是成反比。' } : { ok, msg: v > 0 ? '温度越高峰越靠左（短波），所以 p 应当是负的。' : '不对。试试 lg–lg 坐标：三点连线的斜率是多少？' };
            }, onOk: () => { okP = true; finish(); } });
          const ansB = h.answer({ label: '那么对三条曲线都相同的那个常数 $\\lambda_{\\text{peak}}\\cdot T$ = ?（容差 ±4%）', unit: 'µm·K', placeholder: '由你的标记算出',
            check: (v) => {
              if (!marksDone()) return { ok: false, msg: '先把三条曲线的峰都标出来。' };
              const m = ownB();
              const okTrue = Math.abs(v / WIEN - 1) <= 0.04;
              const okOwn = Math.abs(m / WIEN - 1) <= 0.1 && Math.abs(v / m - 1) <= 0.04;
              if (okTrue || okOwn) return { ok: true, msg: `对。你的三次标记给出 λT = ${S.marks.map((x, i) => (x * TS[i]).toFixed(0)).join('、')} µm·K。` };
              if (Math.abs(v / m - 1) <= 0.04) return { ok: false, msg: '这和你的标记一致，但你的标记本身偏离峰值较多——放大看看每条曲线最高处。' };
              return { ok: false, msg: '把表里每行的 λ 乘以 T，取平均。' };
            }, onOk: () => { okB = true; finish(); } });
          body.append(ansP.el, ansB.el);
          function finish() { if (okP && okB) api.done('<b>维恩位移律：</b>$\\lambda_{\\text{peak}}\\,T = b\\approx 2.9\\times10^{3}\\ \\mu$m·K。炉子越热，光越“蓝”——工匠的火色就是一支温度计。'); }

          function ownSlope() { // least squares lg λ vs lg T
            const xs = TS.map(Math.log10), ys = S.marks.map(Math.log10), n = 3;
            const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
            let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
            return sxy / sxx;
          }
          const ownB = () => S.marks.reduce((a, m, i) => a + m * TS[i], 0) / 3;

          let A = null;
          function draw() { A = drawSpectra(cv, h, col, { norm: S.norm, marks: S.marks, sel: S.sel }); }
          function drawRel() {
            const g = cvR.g, W = cvR.w, Hh = cvR.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            let o, fx, fy;
            if (S.axis === 'lin') { o = { x0: 1000, x1: 1800, y0: 0, y1: 4, xTicks: [1000, 1200, 1400, 1600, 1800], yTicks: [0, 1, 2, 3, 4], xLabel: 'T (K)', yLabel: 'λ_peak (µm)' }; fx = (T) => T; fy = (l) => l; }
            else if (S.axis === 'inv') { o = { x0: 0, x1: 10, y0: 0, y1: 4, xTicks: [0, 2, 4, 6, 8, 10], yTicks: [0, 1, 2, 3, 4], xLabel: '1/T (10⁻⁴ K⁻¹)', yLabel: 'λ_peak (µm)' }; fx = (T) => 1e4 / T; fy = (l) => l; }
            else { o = { x0: 3.0, x1: 3.3, y0: 0.0, y1: 0.6, xTicks: [3.0, 3.1, 3.2, 3.3], yTicks: [0, 0.2, 0.4, 0.6], xLabel: 'lg T', yLabel: 'lg λ_peak', fmtX: (v) => v.toFixed(1), fmtY: (v) => v.toFixed(1) }; fx = Math.log10; fy = Math.log10; }
            o.pad = { l: 42, r: 10, t: 10, b: 34 };
            const B = h.axes(g, W, Hh, o, col);
            S.marks.forEach((m, i) => {
              if (m == null) return;
              g.fillStyle = col(TCOL[i]); g.beginPath(); g.arc(B.X(fx(TS[i])), B.Y(fy(m)), 4.5, 0, 7); g.fill();
            });
            if (!S.marks.some((m) => m != null)) { g.fillStyle = col('--muted'); g.font = '12px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('标记峰值后，点会出现在这里', B.p.l + B.iw / 2, B.p.t + B.ih / 2); }
          }
          function table_() {
            tbody.replaceChildren(...TS.map((T, i) => el('tr', {}, [el('td', { text: String(T) }), el('td', { text: S.marks[i] == null ? '—' : S.marks[i].toFixed(2) })])));
          }
          function changed() { draw(); drawRel(); table_(); }

          // Pointer: grab the nearest marker within 10 px, otherwise place the selected curve's marker
          const lamAt = (e) => { const r = cv.canvas.getBoundingClientRect(); const x = e.clientX - r.left; return Math.round(Math.max(0.5, Math.min(8, ((x - A.p.l) / A.iw) * 8)) * 100) / 100; };
          function pd(e) {
            if (!A) return;
            const r = cv.canvas.getBoundingClientRect(), x = e.clientX - r.left;
            let best = -1, bd = 10;
            S.marks.forEach((m, i) => { if (m != null) { const d = Math.abs(A.X(m) - x); if (d < bd) { bd = d; best = i; } } });
            if (best >= 0 && best !== S.sel) { S.sel = best; selC.set(best); }
            S.drag = true; cv.canvas.setPointerCapture && cv.canvas.setPointerCapture(e.pointerId);
            S.marks[S.sel] = lamAt(e); sl.set(S.marks[S.sel]); changed(); e.preventDefault();
          }
          function pm(e) { if (!S.drag) return; S.marks[S.sel] = lamAt(e); sl.set(S.marks[S.sel]); changed(); }
          function pu() { if (S.drag && marksDone() === false) { const nxt = S.marks.findIndex((m) => m == null); if (nxt >= 0) { S.sel = nxt; selC.set(nxt); sl.set(3); draw(); } } S.drag = false; }
          cv.canvas.addEventListener('pointerdown', pd); cv.canvas.addEventListener('pointermove', pm);
          cv.canvas.addEventListener('pointerup', pu); cv.canvas.addEventListener('pointercancel', pu);
          cv.onResize(draw); cvR.onResize(drawRel);
          const unwatch = watchTheme(() => { draw(); drawRel(); });
          changed();
          return { destroy() { cv.destroy(); cvR.destroy(); unwatch(); } };
        },
      };

      /* ================= Stage 2 ================= */
      const stage2 = {
        title: '经典物理的预言',
        task: `<p>理论家的问题：空腔里的电磁场可以分解为一个个驻波“模式”。边长 $L$ 的立方腔中，模式由三个正整数 $(n_1,n_2,n_3)$ 标记，频率 $\\nu = \\dfrac{c}{2L}\\,|n|$。经典统计力学（能量均分）说：热平衡时<b>每个模式平均分得能量 $kT$</b>，与频率无关。</p>
<p>第一步，数一数模式。下图是一个二维切片：落在四分之一圆 $|n|\\le R$ 内的整点。拖动 $R$，看计数怎样增长，然后推广到三维。</p>`,
        hints: [
          '二维里计数约等于四分之一圆的面积 $\\tfrac{\\pi}{4}R^2$；三维里是八分之一球的体积。把 R 加倍，三维计数变成几倍？',
          '三维计数 $\\propto R^3$，而 $R\\propto\\nu$，所以 $N(\\nu)\\propto\\nu^3$，$dN/d\\nu\\propto\\nu^2$。叠加曲线后看高频端：每个模式 $kT$、模式数 $\\propto\\nu^2$ 无限增长……',
          '在低频（长波）处经典曲线与数据吻合，在高频（短波）处一路冲上去；总能量 $\\int_0^\\infty \\nu^2\\,d\\nu$ 发散。',
        ],
        answer: '三维中 $|n|\\le R$ 的模式数 $\\approx \\tfrac{1}{8}\\cdot\\tfrac{4}{3}\\pi R^3\\propto R^3$；因 $\\nu\\propto|n|$，频率间隔 $d\\nu$ 内的模式数 $\\propto\\nu^2 d\\nu$（计入两个偏振为 $8\\pi\\nu^2 V/c^3\\,d\\nu$）。每个模式分 $kT$ 得 $u_\\nu = \\dfrac{8\\pi\\nu^2}{c^3}kT$（瑞利–金斯）。它在长波处与数据吻合，在短波处无限增长，总能量 $\\int u_\\nu d\\nu$ 发散——“紫外灾变”。',
        build(body, api) {
          const S = { R: 6, overlay: false };
          const st = el('div', { class: 'lab-stage' });
          body.append(st);
          const cvL = h.canvas(st, { aspect: 0.62, minH: 210, maxH: 320 });
          const ctrls = el('div', { class: 'lab-controls' });
          const sR = h.slider({ label: '半径 R', min: 1, max: 30, step: 0.1, value: S.R, format: (v) => v.toFixed(1), onInput: (v) => { S.R = v; drawL(); ro_(); } });
          ctrls.append(sR.el);
          const rd = el('div', { class: 'lab-readout' });
          const r2 = h.readout('二维：|n| ≤ R 的整点数'), r3 = h.readout('三维（同样数法）：整点数');
          rd.append(r2.el, r3.el);
          body.append(ctrls, rd);
          const count2 = (R) => { let n = 0; for (let a = 1; a <= R; a++) for (let b = 1; b <= R; b++) if (a * a + b * b <= R * R) n++; return n; };
          const count3 = (R) => { let n = 0; const R2 = R * R; for (let a = 1; a <= R; a++) for (let b = 1; b <= R; b++) { const r = R2 - a * a - b * b; if (r >= 1) n += Math.floor(Math.sqrt(r) + 1e-9); } return n; };
          function ro_() { r2.set(String(count2(S.R))); r3.set(String(count3(S.R))); }
          function drawL() {
            const g = cvL.g, W = cvL.w, Hh = cvL.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const M = Math.max(5, Math.ceil(S.R * 1.08));
            const pad = { l: 34, r: 10, t: 10, b: 30 };
            const side = Math.min(W - pad.l - pad.r, Hh - pad.t - pad.b);
            const ox = pad.l + (W - pad.l - pad.r - side) / 2, oy = pad.t + side;
            const X = (n) => ox + (n / M) * side, Y = (n) => oy - (n / M) * side;
            g.strokeStyle = col('--line'); g.lineWidth = 1; g.strokeRect(ox + 0.5, Y(M) + 0.5, side, side);
            g.fillStyle = col('--accent'); g.globalAlpha = 0.12;
            g.beginPath(); g.moveTo(X(0), Y(0)); g.arc(X(0), Y(0), (S.R / M) * side, -Math.PI / 2, 0); g.closePath(); g.fill(); g.globalAlpha = 1;
            g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.beginPath(); g.arc(X(0), Y(0), (S.R / M) * side, -Math.PI / 2, 0); g.stroke();
            const rad = Math.max(1, Math.min(4, (side / M) * 0.22));
            for (let a = 1; a <= M; a++) for (let b = 1; b <= M; b++) {
              const inside = a * a + b * b <= S.R * S.R;
              g.fillStyle = inside ? col('--accent') : col('--muted'); g.globalAlpha = inside ? 1 : 0.35;
              g.beginPath(); g.arc(X(a), Y(b), rad, 0, 7); g.fill();
            }
            g.globalAlpha = 1;
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'top';
            g.fillText('n₁', X(M) - 8, oy + 6); g.fillText('0', X(0), oy + 6); g.fillText(String(M), X(M), oy + 16);
            g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText('n₂', ox - 6, Y(M) + 8); g.fillText(String(M), ox - 6, Y(M) + 22);
          }

          // Part B (revealed step by step)
          let ok3 = false, ok2 = false;
          const ans3 = h.answer({ label: '三维中 $|n|\\le R$ 的模式数 $\\propto R^{\\,q}$，$q$ = ?（容差 ±0.2）', placeholder: '指数',
            check: (v) => (Math.abs(v - 3) <= 0.2 ? { ok: true, msg: '对：R 加倍，计数约变为 8 倍。' } : Math.abs(v - 2) <= 0.2 ? { ok: false, msg: '这是二维切片的结果；三维计数呢？看右边那个数在 R 加倍时变成几倍。' } : { ok: false, msg: '把 R 从 10 调到 20，三维计数变为几倍？' }),
            onOk: () => { ok3 = true; partB.classList.remove('planck-hidden'); api.typeset(partB); } });
          const ans2 = h.answer({ label: '因为 $\\nu\\propto|n|$，频率落在 $[\\nu,\\nu+d\\nu]$ 内的模式数 $\\propto \\nu^{\\,s}\\,d\\nu$，$s$ = ?', placeholder: '指数',
            check: (v) => (Math.abs(v - 2) <= 0.1 ? { ok: true, msg: '对：$N(\\nu)\\propto\\nu^3$，求导得 $\\nu^2$。' } : { ok: false, msg: '$N(\\nu)\\propto\\nu^3$ 是累计数；单位频率间隔里的数是它的导数。' }),
            onOk: () => { ok2 = true; partC.classList.remove('planck-hidden'); api.typeset(partC); drawS(); } });
          const partB = el('div', { class: 'planck-hidden' }, [ans2.el]);
          const partC = el('div', { class: 'planck-hidden lab-stage' });
          body.append(ans3.el, partB, partC);

          partC.append(el('p', { class: 'planck-note', html: '计入两个偏振，单位体积、单位频率的模式数是 $8\\pi\\nu^2/c^3$。现在把“每个模式分得 $kT$”的预言和 1700 K 的实测谱（换算成按频率的谱 $u_\\nu$）放在一起。' }));
          const bOv = h.button({ label: '叠加：每个模式分到 kT', kind: 'primary', onClick: () => { S.overlay = !S.overlay; bOv.textContent = S.overlay ? '隐藏经典预言' : '叠加：每个模式分到 kT'; drawS(); if (S.overlay && !quizShown) { quizShown = true; partC.append(quiz.el); api.typeset(quiz.el); } } });
          partC.append(el('div', {}, [bOv]));
          const cvS = h.canvas(partC, { aspect: 0.55, minH: 220, maxH: 340 });
          let quizShown = false;
          const quiz = h.quiz({ question: '经典预言在哪里失败？总能量是多少？', options: [
            { label: '长波（低频）处失败，短波处吻合', ok: false, why: '恰好相反：看低频端，经典曲线与数据重合。' },
            { label: '短波（高频）处失败，而且总能量 $\\int u_\\nu\\,d\\nu$ 发散', ok: true, why: '对：$\\nu^2kT$ 随频率无限增长，积分发散。' },
            { label: '处处吻合', ok: false, why: '看高频端：数据回落到零，经典曲线却一路上升。' },
            { label: '总能量为零', ok: false, why: '每个模式都有 $kT$，模式无穷多——总能量只会更大。' },
          ], onOk: () => api.done('<b>瑞利–金斯定律与“紫外灾变”：</b>能均分 + 模式数 ∝ν² 在长波处正确，在短波处无限发散——经典物理预言炉子会放出无穷多的能量。') });

          // ν-space data for 1700 K
          const d17 = DATA[2];
          const nuPts = d17.pts.map((q) => { const lam = q.l * 1e-6; const f = (SN * lam * lam) / cL / S0; return { nu: cL / lam / 1e12, y: q.y * f }; });
          function drawS() {
            if (!ok2) return;
            const g = cvS.g, W = cvS.w, Hh = cvS.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 650, y0: 0, y1: 130, pad: { l: 40, r: 10, t: 26, b: 34 }, xTicks: [0, 100, 200, 300, 400, 500, 600], yTicks: [0, 50, 100],
              xLabel: '频率 ν (THz)', yLabel: 'u_ν（任意单位）' }, col);
            const items = [['1700 K 实测', col('--s1'), true]];
            if (S.overlay) {
              curve(g, A, 0, 650, (nu) => SN * uNuSI(nu, 1700, true), col('--warn'), 2.5);
              items.push(['每模式 kT × 模式密度', col('--warn')]);
              const nCross = Math.sqrt(130 / (SN * uNuSI(1, 1700, true)));
              tag(g, col, '↑ 一路上升', Math.min(A.X(nCross) + 6, W - 80), A.p.t + 14, col('--warn'));
            }
            g.fillStyle = col('--s1');
            for (const q of nuPts) { g.beginPath(); g.arc(A.X(q.nu), A.Y(q.y), 2.6, 0, 7); g.fill(); }
            legend(g, col, items, A.p.l, 11, W - 6);
          }
          cvL.onResize(drawL); cvS.onResize(drawS);
          const unwatch = watchTheme(() => { drawL(); drawS(); });
          drawL(); ro_();
          return { destroy() { cvL.destroy(); cvS.destroy(); unwatch(); } };
        },
      };

      /* ================= Stage 3 ================= */
      const stage3 = {
        title: '把能量切成小包',
        task: `<p>1900 年 10 月，普朗克先凑出了一个与 PTR 数据吻合的公式，然后试图为它找物理理由。他做了一个“孤注一掷”的假设：<b>腔壁振子与辐射只能以大小为 $\\varepsilon$ 的整份交换能量</b>，$\\varepsilon = C\\,\\nu^{\\,p}$。</p>
<p>按玻尔兹曼计数，一个模式的平均能量变为 $\\langle E\\rangle = \\dfrac{\\varepsilon}{e^{\\varepsilon/kT}-1}$（这是玻尔兹曼计数给出的结果，推导见下方折叠栏）；模式密度仍是上一关的结果，$u_\\lambda = \\dfrac{8\\pi}{\\lambda^4}\\langle E\\rangle$。</p>
<p>调节 $p$ 与 $C$，让模型<b>同时</b>拟合三个温度的全部数据。你能把 $C$ 测到多准？</p>`,
        hints: [
          '第一关的定律说明：谱的形状只依赖 $\\nu/T$（即 $\\lambda T$）。而 $\\langle E\\rangle/kT = x/(e^x-1)$ 只依赖 $x=\\varepsilon/kT$，所以 $\\varepsilon/kT = C\\nu^p/kT$ 必须只是 $\\nu/T$ 的函数。',
          '$C\\nu^p/kT$ 只依赖 $\\nu/T$ ⟺ $p = 1$。把 $p$ 定在 1.00，然后只调 $C$，盯着 χ² 指示条。',
          '$C\\approx 6.6\\times10^{-34}$ J·s，即 $\\lg C\\approx -33.18$。',
        ],
        answer: '$p = 1$，$C = h \\approx 6.626\\times10^{-34}$ J·s：能量子 $\\varepsilon = h\\nu$。代入得普朗克定律 $u_\\lambda = \\dfrac{8\\pi hc}{\\lambda^5}\\dfrac{1}{e^{hc/\\lambda kT}-1}$。$\\varepsilon\\ll kT$（长波）时回到 $kT$，即瑞利–金斯；$\\varepsilon\\gg kT$（短波）时 $\\langle E\\rangle\\approx\\varepsilon e^{-\\varepsilon/kT}$ 被指数压低，灾变消失。$p=1$ 也正是维恩位移律所要求的。',
        build(body, api) {
          const S = { p: 0.5, lc: -34, classical: false, norm: false };
          const det = el('details', { class: 'planck-details' }, [el('summary', { text: '推导：整份能量的玻尔兹曼计数' }),
            el('div', { html: '能量只能取 $0,\\varepsilon,2\\varepsilon,\\dots$，权重 $e^{-n\\varepsilon/kT}$。令 $\\beta=1/kT$：$Z=\\sum_{n\\ge0}e^{-n\\beta\\varepsilon}=\\dfrac{1}{1-e^{-\\beta\\varepsilon}}$，$\\langle E\\rangle=-\\dfrac{\\partial\\ln Z}{\\partial\\beta}=\\dfrac{\\varepsilon}{e^{\\beta\\varepsilon}-1}$。当 $\\varepsilon\\to0$，$\\langle E\\rangle\\to kT$（经典能均分）。' })]);
          body.append(det);
          const dispC = h.choice({ label: '纵轴显示', value: 'abs', options: [{ value: 'abs', label: '同一刻度' }, { value: 'norm', label: '每条曲线各自归一' }], onChange: (v) => { S.norm = v === 'norm'; draw(); } });
          const st = el('div', { class: 'lab-stage' });
          body.append(dispC.el, st);
          const cv = h.canvas(st, { aspect: 0.56, minH: 230, maxH: 380 });
          const ctrls = el('div', { class: 'lab-controls' });
          const sP = h.slider({ label: '指数 p（ε = Cν^p）', min: 0, max: 2, step: 0.01, value: S.p, format: (v) => v.toFixed(2), onInput: (v) => { S.p = v; upd(); } });
          const sC = h.slider({ label: 'lg C', min: -35.5, max: -32.5, step: 0.001, value: S.lc, format: (v) => v.toFixed(3), onInput: (v) => { S.lc = v; upd(); } });
          const nud = (d) => h.button({ label: (d > 0 ? '+' : '−') + Math.abs(d), onClick: () => { S.lc = Math.max(-35.5, Math.min(-32.5, +(S.lc + d).toFixed(3))); sC.set(S.lc); upd(); } });
          const tC = h.toggle({ label: 'ε → 0（经典）', value: false, onChange: (b) => { S.classical = b; upd(); } });
          ctrls.append(sP.el, el('div', { class: 'ctl' }, [sC.el, el('div', {}, [nud(-0.01), nud(-0.001), nud(0.001), nud(0.01)])]), tC.el);
          const rd = el('div', { class: 'lab-readout' });
          const rC = h.readout('C'), rP = h.readout('p'), rX = h.readout('ε/kT（λ = 2 µm, T = 1400 K）'), rChi = h.readout('拟合优度 χ²/N（≤ 5 视为吻合）');
          const bar = el('i'), thr = el('b');
          const meter = el('div', { class: 'planck-meter', role: 'meter', 'aria-label': '拟合优度' }, [bar, thr]);
          rd.append(rC.el, rP.el, rX.el, rChi.el);
          body.append(ctrls, el('div', { class: 'ctl' }, [el('span', { class: 'ctl-lab', text: '吻合程度（越满越好）' }), meter]), rd);
          let lastMsg = '';
          function upd() {
            const C = 10 ** S.lc, X2 = chi2(C, S.p, S.classical);
            rC.set(sci(C) + (Math.abs(S.p - 1) < 1e-9 ? ' J·s' : ' (SI)'));
            rP.set(S.p.toFixed(2));
            const eps = S.classical ? 0 : C * Math.pow(cL / 2e-6, S.p);
            rX.set(S.classical ? '0（经典）' : (eps / (kB * 1400)).toPrecision(3));
            rChi.set(X2 > 1e6 ? '> 10⁶' : X2.toPrecision(3));
            const f = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(1, X2)) / 6));
            bar.style.width = (f * 100).toFixed(1) + '%'; bar.className = X2 <= CHI_OK ? 'ok' : '';
            thr.style.left = ((1 - Math.log10(CHI_OK) / 6) * 100).toFixed(1) + '%';
            meter.setAttribute('aria-valuenow', X2.toPrecision(3));
            draw();
            if (api.solved()) return;
            const okP = Math.abs(S.p - 1) <= 0.04, okC = Math.abs(C / hP - 1) <= 0.04;
            let msg = '';
            if (!S.classical && X2 <= CHI_OK && okP && okC) {
              api.done(`<b>普朗克常数：</b>你测得 $h \\approx ${(C / 1e-34).toFixed(3)}\\times10^{-34}$ J·s（今天的定义值 6.626）。能量以 $\\varepsilon = h\\nu$ 的整份交换——量子论由此诞生。`);
              return;
            }
            if (!S.classical && X2 <= CHI_OK && !(okP && okC)) msg = '数据被拟合得相当好——但要注意 p 和 C 之间可以互相“补偿”。哪个 p 能让第一关的位移律<b>严格</b>成立？';
            else if (S.classical) msg = 'ε → 0 时每个模式都回到 kT：这正是上一关的紫外灾变。';
            if (msg !== lastMsg) { lastMsg = msg; if (msg) api.say(msg, 'info'); else api.say('', 'info'); }
          }
          function draw() {
            const C = 10 ** S.lc;
            const model = (l, T) => uLam(l, T, C, S.p, S.classical);
            const over = DATA.some((d) => model(1.0, d.T) * (S.norm ? 100 / d.max : 1) > 115) ? '模型 ↑ 超出图框' : '';
            drawSpectra(cv, h, col, { norm: S.norm, model, overflow: over });
          }
          cv.onResize(draw);
          const unwatch = watchTheme(draw);
          upd();
          return { destroy() { cv.destroy(); unwatch(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
