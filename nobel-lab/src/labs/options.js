/* Black–Scholes 工作台 — lab for the 1997 Prize in Economic Sciences (Merton & Scholes)
 * Upper panel: call value C(S; τ) = S N(d₁) − K e^{−rτ} N(d₂) against S, with payoff, lower bound S − Ke^{−rτ},
 *   and the tangent at the current S (slope Δ = N(d₁)). Readouts: C, put by parity, Δ, Γ, Θ, vega,
 *   and the PDE residual Θ + ½σ²S²Γ + rSΔ − rC (identically 0).
 * Lower panel: you sell the call at implied σ_imp and delta-hedge at σ_imp, N times a year, while the stock really
 *   moves with σ_real (GBM, drift μ = 8%, fine grid 500 steps). Histogram of terminal P&L over 400 paths and the
 *   path average of the "gamma P&L" ∫ e^{r(T−t)} ½ Γ S² (σ_imp² − σ_real²) dt, which the mean should match.
 * N(x): Numerical Recipes erfc approximation (relative error < 1.2e-7).
 */
(() => {
  const NC = (x) => {
    const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.5 * z);
    const e = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? 1 - e / 2 : e / 2;
  };
  const npdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  function greeks(S, K, T, r, s) {
    if (T <= 1e-9) { const itm = S > K; return { C: Math.max(S - K, 0), D: itm ? 1 : 0, G: 0, Th: 0, V: 0 }; }
    const sq = s * Math.sqrt(T), d1 = (Math.log(S / K) + (r + 0.5 * s * s) * T) / sq, d2 = d1 - sq, df = Math.exp(-r * T);
    const C = S * NC(d1) - K * df * NC(d2), D = NC(d1), G = npdf(d1) / (S * sq), V = S * Math.sqrt(T) * npdf(d1);
    const Th = (-S * npdf(d1) * s) / (2 * Math.sqrt(T)) - r * K * df * NC(d2); // ∂C/∂t (calendar time)
    return { C, D, G, Th, V };
  }
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  /* sell one call at σ_imp, hedge at σ_imp every M/N fine steps; stock has volatility σ_real */
  function hedgeBatch({ K, T, r, sImp, sReal, N, seed, paths = 400, M = 500, mu = 0.08 }) {
    const rnd = mul32(seed), gauss = () => { let u = rnd(); while (u < 1e-12) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
    const dt = T / M, a = (mu - 0.5 * sReal * sReal) * dt, b = sReal * Math.sqrt(dt), gr = Math.exp(r * dt), every = Math.max(1, Math.round(M / N));
    const C0 = greeks(100, K, T, r, sImp).C, pnl = [], gam = [];
    for (let p = 0; p < paths; p++) {
      let S = 100, D = greeks(S, K, T, r, sImp).D, cash = C0 - D * S, gp = 0;
      for (let i = 1; i <= M; i++) {
        const tau = T - (i - 1) * dt;
        gp += Math.exp(r * tau) * 0.5 * greeks(S, K, tau, r, sImp).G * S * S * (sImp * sImp - sReal * sReal) * dt;
        S *= Math.exp(a + b * gauss()); cash *= gr;
        if (i % every === 0 && i < M) { const Dn = greeks(S, K, T - i * dt, r, sImp).D; cash -= (Dn - D) * S; D = Dn; }
      }
      pnl.push(D * S + cash - Math.max(S - K, 0)); gam.push(gp);
    }
    const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
    const m = mean(pnl), sd = Math.sqrt(pnl.reduce((x, y) => x + (y - m) ** 2, 0) / (pnl.length - 1));
    return { pnl, mean: m, sd, gamma: mean(gam) };
  }

  LABS.options = {
    title: 'Black–Scholes 工作台',
    _m: { greeks, hedgeBatch, NC },
    mount(root, ctx) {
      const h = ctx.h, col = ctx.color, el = h.el;
      if (!document.getElementById('st-options-lab')) { // empty readout cells: panel colour instead of the grid's line colour
        document.head.append(el('style', { id: 'st-options-lab', text: '.options-rd{background:var(--panel)}.options-rd .ro{box-shadow:0 0 0 1px var(--line)}' }));
      }
      const st = { S: 100, K: 100, tau: 0.5, sig: 0.2, r: 0.05, N: 100, sR: 0.2, seed: 1, res: null };
      const stage = el('div', { class: 'lab-stage' });
      const cvV = h.canvas(stage, { aspect: 0.56, minH: 220, maxH: 330 });
      const ctr1 = el('div', { class: 'lab-controls' });
      const rd1 = el('div', { class: 'lab-readout options-rd' });
      const stage2 = el('div', { class: 'lab-stage' });
      const cvH = h.canvas(stage2, { aspect: 0.48, minH: 190, maxH: 280 });
      const ctr2 = el('div', { class: 'lab-controls' });
      const rd2 = el('div', { class: 'lab-readout options-rd' });
      const hint = el('p', { class: 'lab-hint', text: '上图：拖 τ 看期权价值曲线怎样贴向折线支付；切线斜率就是 Δ，PDE 残差始终为 0。下图：用隐含 σ 对冲，却让股票按另一个“实际 σ”波动。实际波动更大时，卖方平均亏损，大小正是 Γ 加权的方差差。' });
      root.append(stage, ctr1, rd1, stage2, ctr2, rd2, hint);

      const pct = (v) => (v * 100).toFixed(1) + '%';
      const sl = (label, key, min, max, step, f, after) => h.slider({ label, min, max, step, value: st[key], format: f, onInput: (v) => { st[key] = v; (after || drawV)(); } });
      const rerun = () => { st.res = null; drawH(); };
      ctr1.append(
        sl('股价 S', 'S', 50, 150, 0.5, (v) => v.toFixed(1)).el,
        sl('行权价 K', 'K', 70, 130, 1, (v) => String(v), () => { drawV(); rerun(); }).el,
        sl('剩余期限 τ', 'tau', 0.01, 2, 0.01, (v) => v.toFixed(2) + ' 年', () => { drawV(); rerun(); }).el,
        sl('波动率 σ（隐含）', 'sig', 0.05, 0.6, 0.01, pct, () => { drawV(); rerun(); }).el,
        sl('无风险利率 r', 'r', 0, 0.1, 0.005, pct, () => { drawV(); rerun(); }).el,
      );
      const ro = { C: h.readout('看涨 C'), P: h.readout('看跌 P = C − S + Ke^{−rτ}'), D: h.readout('Δ = N(d₁)'), G: h.readout('Γ'), T: h.readout('Θ = ∂C/∂t（每年）'), V: h.readout('vega（每 1% σ）'), E: h.readout('Θ + ½σ²S²Γ + rSΔ − rC') };
      Object.values(ro).forEach((x) => rd1.append(x.el));
      const cN = h.choice({ label: '一年调仓次数 N', value: st.N, options: [5, 20, 100, 500].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { st.N = v; rerun(); } });
      const sR = sl('股票的实际波动率 σ_real', 'sR', 0.05, 0.6, 0.01, pct, rerun);
      ctr2.append(cN.el, sR.el, el('div', { class: 'ctl' }, [el('div', {}, [h.button({ label: '模拟 400 条路径', kind: 'primary', onClick: () => { st.seed++; run(); } })])]));
      const ro2 = { m: h.readout('平均盈亏（卖方）'), s: h.readout('盈亏标准差'), g: h.readout('Γ 盈亏的路径平均'), c: h.readout('期初卖价 C₀（按隐含 σ）') };
      Object.values(ro2).forEach((x) => rd2.append(x.el));

      function drawV() {
        const g = cvV.g, W = cvV.w, Hh = cvV.h, { S, K, tau, sig, r } = st;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const ymax = Math.max(20, greeks(150, K, tau, r, sig).C * 1.05);
        // legend layout first (wraps on narrow screens), so the plot can start below it
        const items = [['C(S; τ)', '--accent', []], ['到期支付', '--muted', [5, 4]], ['切线：Δ 股股票 + 债券', '--s3', []]];
        g.font = '11px ' + col('--body-font');
        let lx = 40, ly = 11; const lpos = [];
        items.forEach(([t]) => { const w = 30 + g.measureText(t).width; if (lx > 40 && lx + w - 12 > W - 6) { lx = 40; ly += 15; } lpos.push([lx, ly]); lx += w; });
        const A = h.axes(g, W, Hh, { x0: 50, x1: 150, y0: 0, y1: ymax, pad: { l: 40, r: 10, t: ly + 13, b: 34 }, xTicks: [50, 75, 100, 125, 150], yTicks: [0, 20, 40, 60, 80].filter((v) => v <= ymax), xLabel: '股价 S', yLabel: '价值 (元)' }, col);
        const line = (f, c, w, dash) => { g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip(); g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); for (let i = 0; i <= 200; i++) { const x = 50 + i / 2, y = f(x); i ? g.lineTo(A.X(x), A.Y(y)) : g.moveTo(A.X(x), A.Y(y)); } g.stroke(); g.restore(); };
        line((x) => Math.max(x - K, 0), col('--muted'), 1.5, [5, 4]);
        line((x) => Math.max(x - K * Math.exp(-r * tau), 0), col('--grid'), 1.5, [2, 3]);
        line((x) => greeks(x, K, tau, r, sig).C, col('--accent'), 2.4);
        const gk = greeks(S, K, tau, r, sig);
        line((x) => gk.C + gk.D * (x - S), col('--s3'), 1.4);
        g.fillStyle = col('--accent'); g.beginPath(); g.arc(A.X(S), A.Y(gk.C), 5, 0, 7); g.fill();
        g.font = '11px ' + col('--body-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
        items.forEach(([t, c, d], i) => {
          const [x, y] = lpos[i];
          g.strokeStyle = col(c); g.lineWidth = 2; g.setLineDash(d); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]);
          g.fillStyle = col('--muted'); g.fillText(t, x + 18, y);
        });
        const resid = gk.Th + 0.5 * sig * sig * S * S * gk.G + r * S * gk.D - r * gk.C;
        ro.C.set(gk.C.toFixed(3) + ' 元'); ro.P.set((gk.C - S + K * Math.exp(-r * tau)).toFixed(3) + ' 元');
        ro.D.set(gk.D.toFixed(4)); ro.G.set(gk.G.toFixed(5)); ro.T.set(gk.Th.toFixed(3) + ' 元/年'); ro.V.set((gk.V / 100).toFixed(4) + ' 元');
        ro.E.set(Math.abs(resid) < 1e-6 ? '0（≈ ' + resid.toExponential(1) + '）' : resid.toExponential(2));
      }
      function run() {
        st.res = hedgeBatch({ K: st.K, T: st.tau, r: st.r, sImp: st.sig, sReal: st.sR, N: st.N, seed: 1997 + st.seed });
        drawH();
      }
      function drawH() {
        const g = cvH.g, W = cvH.w, Hh = cvH.h, res = st.res;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const C0 = greeks(100, st.K, st.tau, st.r, st.sig).C;
        ro2.c.set(C0.toFixed(3) + ' 元（S₀ = 100, T = τ）');
        if (!res) {
          ['m', 's', 'g'].forEach((k) => ro2[k].set('—'));
          h.axes(g, W, Hh, { x0: -5, x1: 5, y0: 0, y1: 1, pad: { l: 40, r: 10, t: 24, b: 34 }, xTicks: [-5, 0, 5], yTicks: [], xLabel: '到期盈亏 (元)' }, col);
          g.fillStyle = col('--muted'); g.font = '12px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('按「模拟 400 条路径」', W / 2, Hh / 2); return;
        }
        const lim = Math.max(1, ...res.pnl.map((v) => Math.abs(v))) * 1.05, nb = 41, bins = new Array(nb).fill(0);
        res.pnl.forEach((v) => { bins[Math.min(nb - 1, Math.max(0, Math.floor(((v + lim) / (2 * lim)) * nb)))]++; });
        const top = Math.max(...bins) * 1.15, step = lim > 20 ? 10 : lim > 8 ? 4 : lim > 3 ? 2 : lim > 1.5 ? 1 : 0.5, xt = [];
        for (let x = -Math.floor(lim / step) * step; x <= lim; x += step) xt.push(+x.toFixed(2));
        const A = h.axes(g, W, Hh, { x0: -lim, x1: lim, y0: 0, y1: top, pad: { l: 40, r: 10, t: 24, b: 34 }, xTicks: xt, yTicks: [], xLabel: '到期盈亏 (元)', yLabel: '路径数' }, col);
        g.fillStyle = col('--s1'); const bw = A.iw / nb;
        bins.forEach((c, i) => { if (c) g.fillRect(A.p.l + i * bw + 0.5, A.Y(c), Math.max(1, bw - 1), A.Y(0) - A.Y(c)); });
        const vline = (x, c, lab, row) => { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(A.X(x), A.p.t); g.lineTo(A.X(x), A.p.t + A.ih); g.stroke(); g.fillStyle = c; g.font = '11px ' + col('--mono-font'); g.textAlign = A.X(x) > A.p.l + A.iw * 0.6 ? 'right' : 'left'; g.textBaseline = 'top'; g.fillText(lab, A.X(x) + (g.textAlign === 'right' ? -4 : 4), A.p.t + 4 + 14 * row); };
        vline(0, col('--muted'), '0', 0);
        vline(res.mean, col('--accent'), '均值 ' + res.mean.toFixed(2), 1);
        ro2.m.set(res.mean.toFixed(3) + ' 元'); ro2.s.set(res.sd.toFixed(3) + ' 元'); ro2.g.set(res.gamma.toFixed(3) + ' 元');
      }
      cvV.onResize(drawV); cvH.onResize(drawH);
      const mo = new MutationObserver(() => { drawV(); drawH(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      const onMq = () => { drawV(); drawH(); };
      if (mq && mq.addEventListener) mq.addEventListener('change', onMq);
      drawV(); run();
      return { destroy() { cvV.destroy(); cvH.destroy(); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq); } };
    },
  };
})();
