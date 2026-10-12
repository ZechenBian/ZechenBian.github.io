/* 加速膨胀的宇宙 — Nobel Physics 2011 (Perlmutter; Schmidt & Riess). Demo lab.
 * The (Ω_m, Ω_Λ) plane with Δχ² confidence regions (1σ/2σ/3σ for two parameters: 2.30, 6.18, 11.8) computed from a
 * synthetic SN Ia Hubble diagram (18 low-z + 42 high-z, seeded 7, drawn from a flat Ω_m = 0.28 universe; 0.13 mag
 * intrinsic scatter), plus the residual Hubble diagram Δμ = μ − μ_empty for the model you pick (click the plane or use sliders).
 * Distances: D_L = (1+z) S_k(χ)/√|Ω_k|, χ = ∫ dz/E, E² = Ω_m(1+z)³ + Ω_k(1+z)² + Ω_Λ. μ = 5 log10 d_L[Mpc] + 25.
 * q0 = Ω_m/2 − Ω_Λ. Age t0 = (1/H0) ∫0^1 da /(a E(a)), H0 = 70 km/s/Mpc → 1/H0 = 13.97 Gyr.
 * "No Big Bang" region: E²(z) hits 0 at some z > 0 (the universe bounced in the past).
 */
(() => {
  const C_KMS = 299792.458, H0 = 70, TH = 977.792 / H0, MU0 = 5 * Math.log10(C_KMS / H0) + 25;
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gaussR = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const E2 = (z, Om, OL) => { const x = 1 + z, Ok = 1 - Om - OL; return Om * x * x * x + Ok * x * x + OL; };
  function bigBang(Om, OL) { const Ok = 1 - Om - OL; for (let lx = 0; lx <= 4; lx += 0.005) { const x = 10 ** lx; if (Om * x * x * x + Ok * x * x + OL <= 0) return false; } return true; }
  const ZMAX = 1.0, DZ = 0.005, NZ = Math.round(ZMAX / DZ);
  function chiTable(Om, OL) {
    const chi = new Float64Array(NZ + 1); let prev = 1 / Math.sqrt(E2(0, Om, OL));
    for (let i = 1; i <= NZ; i++) {
      const z = i * DZ, e = E2(z, Om, OL), em = E2(z - DZ / 2, Om, OL);
      if (e <= 0 || em <= 0) return null;
      const cur = 1 / Math.sqrt(e), mid = 1 / Math.sqrt(em); chi[i] = chi[i - 1] + (DZ * (prev + 4 * mid + cur)) / 6; prev = cur;
    }
    return chi;
  }
  function DL(z, Om, OL, chi) {
    const f = Math.min(NZ - 1e-9, z / DZ), i = Math.floor(f), c = chi[i] + (chi[i + 1] - chi[i]) * (f - i);
    const Ok = 1 - Om - OL, sk = Math.sqrt(Math.abs(Ok)); let S;
    if (Math.abs(Ok) < 1e-9) S = c; else if (Ok > 0) S = Math.sinh(sk * c) / sk; else { const a = sk * c; if (a >= Math.PI) return NaN; S = Math.sin(a) / sk; }
    return (1 + z) * S;
  }
  const muEmpty = (z) => MU0 + 5 * Math.log10(z * (1 + z / 2));
  // Same synthetic sample as the challenge (seed 7)
  const SN = (() => {
    const r = mulberry32(7), out = [], chi = chiTable(0.28, 0.72), SI = 0.13;
    for (let k = 0; k < 18; k++) { const z = 0.012 + 0.09 * Math.pow(r(), 0.9); const vp = ((300 / (C_KMS * z)) * 5) / Math.LN10; const sm = 0.05 + 0.05 * r(); out.push({ z: +z.toFixed(4), e: +Math.sqrt(SI * SI + vp * vp + sm * sm).toFixed(3) }); }
    for (let k = 0; k < 42; k++) { const z = 0.17 + 0.72 * Math.pow(r(), 0.8); const sm = 0.05 + 0.2 * z + 0.06 * r(); out.push({ z: +z.toFixed(3), e: +Math.sqrt(SI * SI + sm * sm).toFixed(3) }); }
    for (const d of out) d.mu = +(MU0 + 5 * Math.log10(DL(d.z, 0.28, 0.72, chi)) + d.e * gaussR(r)).toFixed(3);
    return out.sort((a, b) => a.z - b.z);
  })();
  const OFF_LOW = (() => { let sw = 0, swr = 0; for (const d of SN) if (d.z < 0.1) { const w = 1 / (d.e * d.e); sw += w; swr += w * (d.mu - muEmpty(d.z)); } return swr / sw; })();
  function fit(Om, OL) { // χ² with the offset (M + 5 log H0) marginalised analytically
    const chi = chiTable(Om, OL); if (!chi) return null;
    let sw = 0, swr = 0, swr2 = 0;
    for (const d of SN) { const dl = DL(d.z, Om, OL, chi); if (!(dl > 0)) return null; const x = d.mu - MU0 - 5 * Math.log10(dl), w = 1 / (d.e * d.e); sw += w; swr += w * x; swr2 += w * x * x; }
    return { chi2: swr2 - (swr * swr) / sw, off: swr / sw, chi };
  }
  function age(Om, OL) { // t0 H0 = ∫0^1 da/(a E(a)), a = u², NaN if no Big Bang
    if (!bigBang(Om, OL)) return NaN; const Ok = 1 - Om - OL; let s = 0; const n = 2000;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, a = u * u, e = Om / (a * a * a) + Ok / (a * a) + OL; s += (2 * u) / (a * Math.sqrt(e)); }
    return s / n;
  }
  // Δχ² grid over the plane (computed once, lazily)
  const GX = [0, 1.6, 41], GY = [-0.6, 1.8, 61];
  let GRID = null;
  function grid() {
    if (GRID) return GRID;
    const [x0, x1, nx] = GX, [y0, y1, ny] = GY, v = new Float64Array(nx * ny); let mn = Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const Om = x0 + ((x1 - x0) * i) / (nx - 1), OL = y0 + ((y1 - y0) * j) / (ny - 1);
      const f = bigBang(Om, OL) ? fit(Om, OL) : null; v[j * nx + i] = f ? f.chi2 : Infinity; if (f && f.chi2 < mn) mn = f.chi2;
    }
    for (let k = 0; k < v.length; k++) v[k] -= mn;
    return (GRID = { v, mn });
  }
  function dchiAt(Om, OL) { // bilinear interpolation of the grid
    const G = grid(), [x0, x1, nx] = GX, [y0, y1, ny] = GY;
    const fx = ((Om - x0) / (x1 - x0)) * (nx - 1), fy = ((OL - y0) / (y1 - y0)) * (ny - 1);
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(ny - 2, Math.floor(fy))), u = fx - i, w = fy - j;
    const a = G.v[j * nx + i], b = G.v[j * nx + i + 1], c = G.v[(j + 1) * nx + i], d = G.v[(j + 1) * nx + i + 1];
    if (![a, b, c, d].every(isFinite)) return Infinity;
    return (1 - w) * ((1 - u) * a + u * b) + w * ((1 - u) * c + u * d);
  }
  const fmt = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

  LABS.darkenergy = {
    title: '加速膨胀的宇宙',
    _m: { SN, fit, age, grid, dchiAt, bigBang },
    mount(root, ctx) {
      const h = ctx.h, col = (n) => ctx.color(n);
      const S = { Om: 0.28, OL: 0.72 };
      const stage = h.el('div', { class: 'lab-stage' }), controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '点击左图选一个宇宙（或用滑块）。金色区域是超新星允许的范围（由深到浅 1σ/2σ/3σ），它整个落在“加速”一侧；平直线穿过它的地方就是 Ω_m ≈ 0.3、Ω_Λ ≈ 0.7。试试 Ω_Λ = 0 的任何一点：右图里远处的超新星总比曲线暗。' });
      root.append(stage, controls, readout, hint);
      const cvP = h.canvas(stage, { aspect: 0.9, minH: 260, maxH: 420 });
      const cvH = h.canvas(stage, { aspect: 0.55, minH: 200, maxH: 300 });
      cvP.canvas.setAttribute('aria-label', 'Ω_m–Ω_Λ 平面：超新星置信区域；点击选择模型');
      cvP.canvas.style.cursor = 'crosshair';
      const sM = h.slider({ label: '物质 Ω_m', min: 0, max: 1.6, step: 0.01, value: S.Om, format: (v) => v.toFixed(2), onInput: (v) => { S.Om = v; upd(); } });
      const sL = h.slider({ label: '宇宙学常数 Ω_Λ', min: -0.6, max: 1.8, step: 0.01, value: S.OL, format: (v) => fmt(v), onInput: (v) => { S.OL = v; upd(); } });
      const pre = (label, Om, OL) => h.button({ label, onClick: () => { S.Om = Om; S.OL = OL; sM.set(Om); sL.set(OL); upd(); } });
      controls.append(sM.el, sL.el, h.el('div', { class: 'ctl', style: 'grid-column: 1 / -1' }, [h.el('div', {}, [pre('ΛCDM (0.3, 0.7)', 0.3, 0.7), pre('只有物质 (1, 0)', 1, 0), pre('低密度 (0.3, 0)', 0.3, 0), pre('空宇宙 (0, 0)', 0, 0)])]));
      const R = { chi: h.readout('χ² / Δχ²'), q: h.readout('q₀ = Ω_m/2 − Ω_Λ'), k: h.readout('曲率 Ω_k'), t: h.readout('年龄 t₀（H₀ = 70）'), v: h.readout('判定') };
      Object.values(R).forEach((r) => readout.append(r.el));
      let cur = null, A = null;

      function upd() {
        cur = bigBang(S.Om, S.OL) ? fit(S.Om, S.OL) : null;
        const G = grid(), d = cur ? cur.chi2 - G.mn : Infinity, q = S.Om / 2 - S.OL, Ok = 1 - S.Om - S.OL, t = age(S.Om, S.OL);
        R.chi.set(cur ? `${cur.chi2.toFixed(1)} / +${Math.max(0, d).toFixed(1)}` : '—');
        R.q.set(`${fmt(q)}（${q < 0 ? '加速' : '减速'}）`);
        R.k.set(fmt(Ok) + (Math.abs(Ok) < 0.005 ? ' 平直' : Ok > 0 ? ' 开放' : ' 闭合'));
        R.t.set(isFinite(t) ? `${(t * TH).toFixed(1)} Gyr = ${t.toFixed(3)}/H₀` : '—');
        R.v.set(!cur ? '没有大爆炸（排除）' : d <= 2.3 ? '1σ 内' : d <= 6.18 ? '2σ 内' : d <= 11.8 ? '3σ 内' : '被排除（> 3σ）');
        drawP(); drawH();
      }
      function drawP() {
        const g = cvP.g, W = cvP.w, Hh = cvP.h;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        A = h.axes(g, W, Hh, { x0: 0, x1: 1.6, y0: -0.6, y1: 1.8, pad: { l: 42, r: 10, t: 12, b: 34 }, xTicks: [0, 0.4, 0.8, 1.2, 1.6], yTicks: [-0.4, 0, 0.4, 0.8, 1.2, 1.6], fmtX: (v) => v.toFixed(1), fmtY: (v) => v.toFixed(1), xLabel: 'Ω_m', yLabel: 'Ω_Λ' }, col);
        const bs = 3; // confidence bands painted in 3-px blocks (bilinear Δχ²)
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.fillStyle = col('--accent');
        for (let py = A.p.t; py < A.p.t + A.ih; py += bs) for (let px = A.p.l; px < A.p.l + A.iw; px += bs) {
          const Om = ((px + bs / 2 - A.p.l) / A.iw) * 1.6, OL = 1.8 - ((py + bs / 2 - A.p.t) / A.ih) * 2.4, d = dchiAt(Om, OL);
          const al = d <= 2.3 ? 0.62 : d <= 6.18 ? 0.36 : d <= 11.8 ? 0.16 : 0;
          if (al) { g.globalAlpha = al; g.fillRect(px, py, bs, bs); }
        }
        g.globalAlpha = 1;
        // no-Big-Bang region: for each Ω_m find the smallest Ω_Λ with a bounce
        g.fillStyle = col('--warn'); g.globalAlpha = 0.13; g.beginPath(); g.moveTo(A.X(0), A.p.t);
        for (let i = 0; i <= 32; i++) { const Om = (1.6 * i) / 32; let lo = 0.9, hi = 3.5; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (bigBang(Om, m)) lo = m; else hi = m; } g.lineTo(A.X(Om), Math.max(A.p.t, A.Y(lo))); }
        g.lineTo(A.X(1.6), A.p.t); g.closePath(); g.fill(); g.globalAlpha = 1;
        const line = (f, c, dash, w = 1.3) => { g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); g.moveTo(A.X(0), A.Y(f(0))); g.lineTo(A.X(1.6), A.Y(f(1.6))); g.stroke(); g.setLineDash([]); };
        line((x) => 1 - x, col('--s1'), [6, 4]);          // flat
        line((x) => x / 2, col('--s3'), [2, 3]);          // q0 = 0
        line(() => 0, col('--muted'), [], 1);              // Λ = 0
        g.restore();
        const tag = (t, x, y, c, al = 'left') => { g.font = '11px ' + col('--mono-font'); g.textAlign = al; g.textBaseline = 'middle'; g.fillStyle = c; g.fillText(t, x, y); };
        tag('平直', A.X(0.08), A.Y(0.92) - 9, col('--s1'));
        tag('加速 ↑', A.X(1.58), A.Y(0.79) - 10, col('--s3'), 'right'); tag('减速 ↓', A.X(1.58), A.Y(0.79) + 12, col('--s3'), 'right');
        tag('没有大爆炸', A.X(0.04), A.p.t + 12, col('--warn'));
        // current model
        const x = A.X(S.Om), y = A.Y(S.OL);
        g.strokeStyle = col('--fg'); g.lineWidth = 2; g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
        g.beginPath(); g.arc(x, y, 4, 0, 6.2832); g.stroke();
      }
      function drawH() {
        const g = cvH.g, W = cvH.w, Hh = cvH.h;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const B = h.axes(g, W, Hh, { x0: 0, x1: 0.95, y0: -0.9, y1: 0.8, pad: { l: 42, r: 10, t: 12, b: 34 }, xTicks: [0, 0.2, 0.4, 0.6, 0.8], yTicks: [-0.8, -0.4, 0, 0.4, 0.8], fmtX: (v) => v.toFixed(1), fmtY: (v) => v.toFixed(1), xLabel: '红移 z', yLabel: 'Δμ（相对空宇宙）' }, col);
        g.save(); g.beginPath(); g.rect(B.p.l, B.p.t, B.iw, B.ih); g.clip();
        const model = (f, Om, OL, c, w, dash) => { if (!f) return; g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); for (let i = 0; i <= 120; i++) { const z = 0.005 + (0.945 * i) / 120, y = MU0 + 5 * Math.log10(DL(z, Om, OL, f.chi)) + f.off - muEmpty(z) - OFF_LOW; i ? g.lineTo(B.X(z), B.Y(y)) : g.moveTo(B.X(z), B.Y(y)); } g.stroke(); g.setLineDash([]); };
        g.strokeStyle = col('--muted'); g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(B.X(0), B.Y(0)); g.lineTo(B.X(0.95), B.Y(0)); g.stroke(); g.setLineDash([]);
        model(fit(1, 0), 1, 0, col('--s2'), 1.4, [6, 4]);
        g.fillStyle = col('--fg'); g.strokeStyle = col('--fg'); g.lineWidth = 1;
        for (const d of SN) { const y = d.mu - muEmpty(d.z) - OFF_LOW, X = B.X(d.z); g.beginPath(); g.moveTo(X, B.Y(y - d.e)); g.lineTo(X, B.Y(y + d.e)); g.stroke(); g.beginPath(); g.arc(X, B.Y(y), 2.2, 0, 6.2832); g.fill(); }
        model(cur, S.Om, S.OL, col('--accent'), 2.5, []);
        g.restore();
        g.font = '11px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
        const t1 = cur ? `你的模型 (${S.Om.toFixed(2)}, ${S.OL.toFixed(2)})` : '你的模型：没有大爆炸', t2 = '只有物质 (1, 0)';
        g.fillStyle = col('--panel'); g.globalAlpha = 0.85; g.fillRect(B.p.l + 2, B.p.t + 2, Math.max(g.measureText(t1).width, g.measureText(t2).width) + 8, 31); g.globalAlpha = 1;
        g.fillStyle = col('--accent'); g.fillText(t1, B.p.l + 6, B.p.t + 10);
        g.fillStyle = col('--s2'); g.fillText(t2, B.p.l + 6, B.p.t + 25);
      }
      function pick(e) {
        if (!A) return; const r = cvP.canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        if (px < A.p.l || px > A.p.l + A.iw || py < A.p.t || py > A.p.t + A.ih) return;
        S.Om = Math.round(((px - A.p.l) / A.iw) * 160) / 100; S.OL = Math.round((1.8 - ((py - A.p.t) / A.ih) * 2.4) * 100) / 100;
        sM.set(S.Om); sL.set(S.OL); upd();
      }
      let drag = false;
      const pd = (e) => { drag = true; pick(e); }, pm = (e) => { if (drag) pick(e); }, pu = () => { drag = false; };
      cvP.canvas.addEventListener('pointerdown', pd); cvP.canvas.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
      cvP.onResize(drawP); cvH.onResize(drawH);
      const redraw = () => { drawP(); drawH(); };
      const mo = new MutationObserver(redraw); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; if (mq && mq.addEventListener) mq.addEventListener('change', redraw);
      upd();
      return { destroy() { cvP.destroy(); cvH.destroy(); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', redraw); window.removeEventListener('pointerup', pu); cvP.canvas.removeEventListener('pointerdown', pd); cvP.canvas.removeEventListener('pointermove', pm); } };
    },
  };
})();
