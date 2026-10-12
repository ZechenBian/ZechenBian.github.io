/* 希格斯机制演示 — Englert & Higgs, Nobel Physics 2013
 * Abelian Higgs model (natural units, 示意): Φ = (φ₁ + iφ₂)/√2, V = μ²|Φ|² + λ|Φ|⁴, gauge coupling e.
 *   μ² > 0: two scalars of mass μ, massless photon (2 helicities).
 *   μ² < 0: v = √(−μ²/λ), m_h = √(2λ) v = √(−2μ²); e = 0 → massless Goldstone; e > 0 → m_A = e v and the
 *           Goldstone becomes the longitudinal polarization. Degrees of freedom: always 4.
 * Diphoton spectrum (示意): per fb⁻¹, background 40·e^{−0.03(m−130)} events/GeV, signal 23 events at 126 GeV (σ = 1.6 GeV);
 *   data accumulate in 1 fb⁻¹ steps (seeded), so the picture grows consistently with luminosity.
 *   Expected local significance in 124–128 GeV ≈ S/√B ∝ √L (≈ 4 at 10 fb⁻¹).
 */
(() => {
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const poisson = (rnd, m) => { if (m < 30) { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; } return Math.max(0, Math.round(m + Math.sqrt(m) * gauss(rnd))); };
  const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
  const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

  // model spectrum: returns modes [{name, mass, mult, col}]
  function spectrum(mu2, lam, e) {
    if (mu2 >= 0) {
      const m = Math.sqrt(mu2);
      return { v: 0, broken: false, modes: [
        { k: 'T', name: '光子（横向）', mass: 0, mult: 2 },
        { k: 'P', name: '标量 φ₂', mass: m, mult: 1 },
        { k: 'H', name: '标量 φ₁', mass: m, mult: 1 },
      ] };
    }
    const v = Math.sqrt(-mu2 / lam), mh = Math.sqrt(-2 * mu2), mA = e * v;
    return { v, broken: true, modes: [
      { k: 'T', name: e > 0 ? '矢量（横向）' : '光子（横向）', mass: mA, mult: 2 },
      { k: 'P', name: e > 0 ? '矢量（纵向）' : '戈德斯通', mass: mA, mult: 1 },
      { k: 'H', name: '希格斯 h', mass: mh, mult: 1 },
    ] };
  }

  // diphoton toy data, accumulated per 1 fb⁻¹
  const M0 = 100, NB = 60, LMAX = 40, A1 = 40, BB = 0.03, S1 = 23, MS = 126, SW = 1.6;
  const bgInt = (lo, hi) => (A1 / BB) * (Math.exp(-BB * (lo - 130)) - Math.exp(-BB * (hi - 130)));
  const sigFrac = (lo, hi) => Phi((hi - MS) / SW) - Phi((lo - MS) / SW);
  const CUM = (() => {
    const rnd = mulberry32(4072012), out = [new Array(NB).fill(0)];
    for (let l = 1; l <= LMAX; l++) out.push(out[l - 1].map((n, i) => n + poisson(rnd, bgInt(M0 + i, M0 + i + 1) + S1 * sigFrac(M0 + i, M0 + i + 1))));
    return out;
  })();
  function zWindow(L) {
    let N = 0, B = 0, S = 0;
    for (let i = 24; i < 28; i++) { N += CUM[L][i]; B += L * bgInt(M0 + i, M0 + i + 1); S += L * S1 * sigFrac(M0 + i, M0 + i + 1); }
    return { N, B, Zobs: (N - B) / Math.sqrt(B), Zexp: S / Math.sqrt(B) };
  }

  LABS.higgs = {
    title: '墨西哥帽与 125 GeV 的峰',
    _math: { spectrum, zWindow },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const st = { mu2: -0.5, lam: 0.5, e: 0.6, L: 10, sig: false };
      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const stage2 = h.el('div', { class: 'lab-stage' });
      const controls2 = h.el('div', { class: 'lab-controls' });
      const readout2 = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '把 μ² 拖过零：对称相里两个标量质量相同；破缺后一个变成戈德斯通（e = 0 时无质量），e > 0 时它变成矢量粒子的纵向偏振。下方：积分亮度翻 4 倍，显著性只翻 2 倍。' });
      root.append(stage, controls, readout, stage2, controls2, readout2, hint);
      const cvV = h.canvas(stage, { aspect: 0.38, minH: 170, maxH: 250 });
      const cvS = h.canvas(stage, { aspect: 0.36, minH: 170, maxH: 240 });
      const cvD = h.canvas(stage2, { aspect: 0.5, minH: 220, maxH: 330 });

      const sMu = h.slider({ label: 'μ²', min: -1, max: 1, step: 0.01, value: st.mu2, format: (v) => v.toFixed(2), onInput: (v) => { st.mu2 = v; drawModel(); } });
      const sLam = h.slider({ label: '自耦合 λ', min: 0.2, max: 1, step: 0.01, value: st.lam, format: (v) => v.toFixed(2), onInput: (v) => { st.lam = v; drawModel(); } });
      const sE = h.slider({ label: '规范耦合 e', min: 0, max: 1.5, step: 0.01, value: st.e, format: (v) => v.toFixed(2), onInput: (v) => { st.e = v; drawModel(); } });
      controls.append(sMu.el, sLam.el, sE.el);
      const ro = { v: h.readout('真空值 v'), mA: h.readout('矢量质量 m_A = e·v'), mh: h.readout('m_h = √(2λ)·v'), n0: h.readout('无质量模式 / 自由度') };
      Object.values(ro).forEach((r) => readout.append(r.el));

      const sL = h.slider({ label: '积分亮度', min: 1, max: LMAX, step: 1, value: st.L, format: (v) => v + ' fb⁻¹', onInput: (v) => { st.L = v; drawData(); } });
      const tSig = h.toggle({ label: '叠加信号模型', value: st.sig, onChange: (b) => { st.sig = b; drawData(); } });
      controls2.append(sL.el, tSig.el);
      const ro2 = { N: h.readout('124–128 GeV：N / B'), Z: h.readout('局域显著性 (N−B)/√B'), Ze: h.readout('期望显著性 ∝ √L') };
      Object.values(ro2).forEach((r) => readout2.append(r.el));

      function drawV() {
        const g = cvV.g, W = cvV.w, Hh = cvV.h, mono = C('--mono-font') || 'monospace';
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const ax = h.axes(g, W, Hh, { x0: -2.6, x1: 2.6, y0: -1.4, y1: 1.6, pad: { l: 36, r: 10, t: 24, b: 30 }, xTicks: [-2, -1, 0, 1, 2], yTicks: [-1, 0, 1], xLabel: 'φ₁（沿真空方向）', yLabel: 'V' }, C);
        const Vf = (x) => (st.mu2 * x * x) / 2 + (st.lam * x ** 4) / 4;
        g.save(); g.beginPath(); g.rect(ax.p.l, ax.p.t, ax.iw, ax.ih); g.clip();
        g.strokeStyle = C('--s1'); g.lineWidth = 2; g.beginPath();
        for (let i = 0; i <= 200; i++) { const x = -2.6 + (5.2 * i) / 200; i ? g.lineTo(ax.X(x), ax.Y(Vf(x))) : g.moveTo(ax.X(x), ax.Y(Vf(x))); }
        g.stroke();
        const sp = spectrum(st.mu2, st.lam, st.e), v = sp.v;
        if (sp.broken) { // the two vacua on this slice (in the plane: a whole circle)
          g.fillStyle = C('--muted'); g.beginPath(); g.arc(ax.X(-v), ax.Y(Vf(v)) - 6, 4, 0, 6.283); g.fill();
          g.setLineDash([3, 3]); g.strokeStyle = C('--muted'); g.beginPath(); g.moveTo(ax.X(v), ax.Y(0)); g.lineTo(ax.X(v), ax.Y(Vf(v))); g.stroke(); g.setLineDash([]);
        }
        g.fillStyle = C('--accent'); g.beginPath(); g.arc(ax.X(v), ax.Y(Vf(v)) - 6, 6, 0, 6.283); g.fill();
        g.restore();
        g.font = '11px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(sp.broken ? '真空：|Φ| = v/√2 的整个圆（图为截面）' : '真空：Φ = 0（对称相）', ax.p.l, 5);
      }
      function drawS() {
        const g = cvS.g, W = cvS.w, Hh = cvS.h, mono = C('--mono-font') || 'monospace';
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const sp = spectrum(st.mu2, st.lam, st.e), top = 3;
        const ax = h.axes(g, W, Hh, { x0: 0, x1: 3, y0: 0, y1: top, pad: { l: 36, r: 10, t: 10, b: 30 }, yTicks: [0, 1, 2, 3], xLabel: '粒子谱（每条线 = 一种模式，点数 = 自由度）', yLabel: '质量' }, C);
        const cols = { T: ['--s1', 0.5], P: ['--s2', 1.5], H: ['--s3', 2.5] };
        g.font = '11px ' + mono; g.textAlign = 'center';
        sp.modes.forEach((m) => {
          const [col, xc] = cols[m.k], y = ax.Y(Math.min(top, m.mass)), x0 = ax.X(xc - 0.36), x1 = ax.X(xc + 0.36);
          g.strokeStyle = C(col); g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
          g.fillStyle = C(col);
          for (let k = 0; k < m.mult; k++) { g.beginPath(); g.arc(ax.X(xc) + (k - (m.mult - 1) / 2) * 12, y - 9, 3.5, 0, 6.283); g.fill(); }
          g.textBaseline = m.mass > top - 0.5 ? 'top' : 'bottom'; g.fillText(m.name, ax.X(xc), m.mass > top - 0.5 ? y + 6 : y - 16);
        });
        const n0 = sp.modes.filter((m) => m.mass < 1e-6).reduce((a, m) => a + m.mult, 0);
        ro.v.set(sp.broken ? sp.v.toFixed(3) : '0（对称相）');
        ro.mA.set(sp.modes[0].mass.toFixed(3));
        ro.mh.set(sp.broken ? sp.modes[2].mass.toFixed(3) : '—（两个标量均为 μ = ' + Math.sqrt(Math.max(0, st.mu2)).toFixed(3) + '）');
        ro.n0.set(n0 + ' / ' + sp.modes.reduce((a, m) => a + m.mult, 0));
      }
      function drawModel() { drawV(); drawS(); }
      function drawData() {
        const g = cvD.g, W = cvD.w, Hh = cvD.h, mono = C('--mono-font') || 'monospace', L = st.L, D = CUM[L];
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const ymax = 1.12 * Math.max(...D) + 3 * Math.sqrt(Math.max(...D)), ymin = Math.max(0, 0.75 * Math.min(...D) - 3 * Math.sqrt(Math.min(...D)));
        const step = Math.pow(10, Math.floor(Math.log10((ymax - ymin) / 3))), tick = [];
        const st0 = Math.ceil(ymin / (step * 2)) * step * 2; for (let t = st0; t < ymax; t += step * 2) tick.push(t);
        const ax = h.axes(g, W, Hh, { x0: M0, x1: M0 + NB, y0: ymin, y1: ymax, pad: { l: 50, r: 10, t: 12, b: 32 }, xTicks: [100, 110, 120, 130, 140, 150, 160], yTicks: tick, fmtY: (v) => String(Math.round(v)), xLabel: 'm_γγ (GeV)', yLabel: '事例 / GeV' }, C);
        g.fillStyle = C('--accent'); g.globalAlpha = 0.13; g.fillRect(ax.X(124), ax.p.t, ax.X(128) - ax.X(124), ax.ih); g.globalAlpha = 1;
        const curve = (f, col, w) => { g.strokeStyle = C(col); g.lineWidth = w; g.beginPath(); for (let i = 0; i <= 240; i++) { const m = M0 + i / 4, y = ax.Y(f(m)); i ? g.lineTo(ax.X(m), y) : g.moveTo(ax.X(m), y); } g.stroke(); };
        const bg = (m) => L * A1 * Math.exp(-BB * (m - 130));
        curve(bg, '--s1', 1.8);
        if (st.sig) curve((m) => bg(m) + (L * S1 * Math.exp(-0.5 * ((m - MS) / SW) ** 2)) / (SW * Math.sqrt(2 * Math.PI)), '--warn', 1.6);
        g.fillStyle = C('--fg'); g.strokeStyle = C('--fg'); g.lineWidth = 1;
        D.forEach((n, i) => { const x = ax.X(M0 + i + 0.5), e = Math.sqrt(n); g.beginPath(); g.moveTo(x, ax.Y(n - e)); g.lineTo(x, ax.Y(n + e)); g.stroke(); g.beginPath(); g.arc(x, ax.Y(n), 2.1, 0, 6.283); g.fill(); });
        g.font = '11px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillText('合成数据（示意）· ' + L + ' fb⁻¹', ax.p.l + ax.iw - 6, ax.p.t + 4);
        const z = zWindow(L);
        ro2.N.set(z.N + ' / ' + z.B.toFixed(0)); ro2.Z.set(z.Zobs.toFixed(2) + ' σ' + (z.Zobs >= 5 ? '（≥ 5σ）' : ''));
        ro2.Ze.set(z.Zexp.toFixed(2) + ' σ');
      }
      const redraw = () => { drawModel(); drawData(); };
      cvV.onResize(drawV); cvS.onResize(drawS); cvD.onResize(drawData);
      const mo = new MutationObserver(redraw); mo.observe(document.documentElement, { attributes: true });
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', redraw);
      redraw();
      return { destroy() { cvV.destroy(); cvS.destroy(); cvD.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', redraw); } };
    },
  };
})();
