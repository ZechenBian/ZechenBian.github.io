/* 霍奇金–赫胥黎动作电位 — Nobel Medicine 1963 (Eccles, Hodgkin, Huxley: ionic mechanisms of nerve excitation)
 * HH (1952) squid giant axon, modern convention (V in mV, rest ≈ −65 mV), 6.3 °C reference:
 *   C dV/dt = I − ḡNa m³h (V−E_Na) − ḡK n⁴ (V−E_K) − ḡL (V−E_L)
 *   C = 1 µF/cm², ḡNa = 120, ḡK = 36, ḡL = 0.3 mS/cm², E_Na = 50, E_K = −77, E_L = −54.387 mV
 *   dx/dt = φ[αx(1−x) − βx·x],  φ = 3^((T−6.3)/10)  (Q10 = 3);  RK4, dt = 0.01 ms
 * Sodium hypothesis (Hodgkin & Katz 1949): E_Na = 58 mV·log10([Na]o/[Na]i); [Na]o 440 → f·440 mM shifts E_Na by 58·log10 f.
 */
(() => {
  const P0 = { C: 1, gNa: 120, gK: 36, gL: 0.3, ENa: 50, EK: -77, EL: -54.387, phi: 1 };
  const DT = 0.01, NAO = 440, NAI = 50;
  // x/(1−e^{−x/k}) with its removable singularity at x = 0 (limit k + x/2)
  const vtrap = (x, k) => (Math.abs(x / k) < 1e-6 ? k + x / 2 : x / (1 - Math.exp(-x / k)));
  const rates = (V) => ({
    am: 0.1 * vtrap(V + 40, 10), bm: 4 * Math.exp(-(V + 65) / 18),
    ah: 0.07 * Math.exp(-(V + 65) / 20), bh: 1 / (1 + Math.exp(-(V + 35) / 10)),
    an: 0.01 * vtrap(V + 55, 10), bn: 0.125 * Math.exp(-(V + 65) / 80),
  });
  const xinf = (V) => { const r = rates(V); return [r.am / (r.am + r.bm), r.ah / (r.ah + r.bh), r.an / (r.an + r.bn)]; };
  const currents = ([V, m, h, n], p) => ({ INa: p.gNa * m * m * m * h * (V - p.ENa), IK: p.gK * n ** 4 * (V - p.EK), IL: p.gL * (V - p.EL) });
  function deriv(y, I, p) {
    const r = rates(y[0]), c = currents(y, p);
    return [(I - c.INa - c.IK - c.IL) / p.C, p.phi * (r.am * (1 - y[1]) - r.bm * y[1]),
      p.phi * (r.ah * (1 - y[2]) - r.bh * y[2]), p.phi * (r.an * (1 - y[3]) - r.bn * y[3])];
  }
  function rk4(y, I, p, dt) {
    const k1 = deriv(y, I, p), a = (k, s) => y.map((v, i) => v + s * k[i]);
    const k2 = deriv(a(k1, dt / 2), I, p), k3 = deriv(a(k2, dt / 2), I, p), k4 = deriv(a(k3, dt), I, p);
    return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  // Steady state V*: root of the steady-state I–V curve I_ion(V, m∞, h∞, n∞) = I (bisection)
  function restV(p, I = 0) {
    const f = (V) => { const [m, h, n] = xinf(V), c = currents([V, m, h, n], p); return c.INa + c.IK + c.IL - I; };
    let a = -120, b = 60;
    for (let i = 0; i < 80; i++) { const c = (a + b) / 2; (f(a) * f(c) <= 0) ? (b = c) : (a = c); }
    return (a + b) / 2;
  }
  // Simulator: pulses [{t0,dur,amp}], tonic current, spike detection (upward 0 mV crossing) with peak currents
  function makeSim(p) {
    const V0 = restV(p, 0);
    const s = { p, t: 0, y: [V0, ...xinf(V0)], pulses: [], Iton: 0, spikes: [], cur: null };
    s.I = (t) => s.pulses.reduce((I, q) => (t >= q.t0 && t < q.t0 + q.dur ? I + q.amp : I), s.Iton);
    s.step = () => {
      const Vp = s.y[0]; s.y = rk4(s.y, s.I(s.t + DT / 2), s.p, DT); s.t += DT;
      const V = s.y[0];
      if (Vp < 0 && V >= 0) { // new spike: attribute to the earliest still-unanswered pulse
        s.cur = { t: s.t, peak: V, y: s.y.slice() }; s.spikes.push(s.cur);
        const q = s.pulses.find((q) => q.fired == null && s.t >= q.t0 && s.t <= q.t0 + q.dur + 8); if (q) q.fired = true;
      }
      if (s.cur) { if (V >= s.cur.peak) { s.cur.peak = V; s.cur.y = s.y.slice(); } else { Object.assign(s.cur, currents(s.cur.y, s.p)); s.cur = null; } }
      for (const q of s.pulses) if (q.fired == null && s.t > q.t0 + q.dur + 8) q.fired = false;
    };
    return s;
  }
  // Headless run used by tests: returns spike times
  function run(pars, { pulses = [], Iton = 0, T = 60 } = {}) {
    const s = makeSim(Object.assign({}, P0, pars)); s.pulses = pulses.map((q) => ({ ...q })); s.Iton = Iton;
    while (s.t < T) s.step();
    return { spikes: s.spikes, pulses: s.pulses, y: s.y };
  }

  LABS.hh = {
    title: '霍奇金–赫胥黎动作电位',
    _m: { rates, xinf, rk4, restV, run, P0 },
    mount(root, ctx) {
      const h = ctx.h, col = ctx.color, WIN = 50, SAMPLE = 4; // 50 ms window, store every 0.04 ms
      const S = { amp: 10, dur: 1, gap: 10, Iton: 0, ttx: false, tea: false, na: 1, temp: 6.3, speed: 8 };
      const par = () => ({ ...P0, gNa: S.ttx ? 0 : P0.gNa, gK: S.tea ? 0 : P0.gK, ENa: P0.ENa + 58 * Math.log10(S.na), phi: Math.pow(3, (S.temp - 6.3) / 10) });
      const sim = makeSim(par());
      const hist = { t: [], V: [], m: [], h: [], n: [], I: [] }; let nstep = 0, acc = 0;
      function record() { const [V, m, hh, n] = sim.y; hist.t.push(sim.t); hist.V.push(V); hist.m.push(m); hist.h.push(hh); hist.n.push(n); hist.I.push(sim.I(sim.t)); }
      function advance(ms) {
        const N = Math.round(ms / DT);
        for (let i = 0; i < N; i++) { sim.step(); if (++nstep % SAMPLE === 0) record(); }
        if (hist.t.length > 2 * WIN / (DT * SAMPLE) + 50) { const cut = hist.t.length - Math.ceil(WIN / (DT * SAMPLE)) - 10; for (const k in hist) hist[k].splice(0, cut); }
        sim.pulses = sim.pulses.filter((q) => sim.t < q.t0 + 60 || q === lastPulses[0] || q === lastPulses[1]);
        sim.spikes = sim.spikes.filter((sp) => sim.t - sp.t < 300);
      }
      let lastPulses = [];
      function stim(paired) {
        const t0 = sim.t + (ctx.reduced ? 5 : 1);
        lastPulses = [{ t0, dur: S.dur, amp: S.amp }];
        if (paired) lastPulses.push({ t0: t0 + S.gap, dur: S.dur, amp: S.amp });
        sim.pulses.push(...lastPulses); kick();
      }
      const kick = () => { if (ctx.reduced) { advance(WIN - 5); drawAll(); } };

      const stage = h.el('div', { class: 'lab-stage' }), controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '看第三栏：Na⁺ 电导先快速冲起（内流、上冲），随后 h 关闭、慢的 K⁺ 电导接手把膜电位拉回。试试 2 µA/cm² 不发放、10 µA/cm² 发放；成对刺激间隔 3 ms vs 15 ms 看不应期；降低胞外 Na⁺，超射随 E_Na 一起下降。' });
      root.append(stage, controls, readout, hint);
      const cvV = h.canvas(stage, { aspect: 0.5, minH: 190, maxH: 280 });
      const gWrap = h.el('div'); stage.append(gWrap);
      const cvG = h.canvas(gWrap, { aspect: 0.6, minH: 220, maxH: 330 });
      const showG = (root.getBoundingClientRect().width || window.innerWidth) >= 480;
      gWrap.style.display = showG ? '' : 'none';

      const win = () => { const x1 = Math.max(WIN, sim.t); return [x1 - WIN, x1]; };
      const ticks = (x0, x1) => { const t = []; for (let v = Math.ceil(x0 / 10) * 10; v <= x1; v += 10) t.push(v); return t; };
      function series(g, A, key, color, f = (v) => v, w = 1.6) {
        const T = hist.t, Y = hist[key]; g.strokeStyle = color; g.lineWidth = w; g.beginPath();
        for (let i = 0; i < T.length; i++) { const x = A.X(T[i]), y = A.Y(f(Y[i], i)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      const clip = (g, A) => { g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip(); };
      function label(g, txt, x, y, c, align = 'left') { g.fillStyle = c; g.font = '11px ' + col('--mono-font'); g.textAlign = align; g.textBaseline = 'middle'; g.fillText(txt, x, y); }

      function drawV() {
        const g = cvV.g, W = cvV.w, Hh = cvV.h, p = sim.p, [x0, x1] = win();
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0, x1, y0: -100, y1: 65, pad: { l: 44, r: 44, t: 10, b: 30 }, xTicks: ticks(x0, x1), yTicks: [-80, -40, 0, 40], xLabel: 't (ms)', yLabel: 'V (mV)' }, col);
        clip(g, A);
        g.setLineDash([5, 4]); g.lineWidth = 1;
        for (const [E, c] of [[p.ENa, col('--s1')], [p.EK, col('--s2')]]) { g.strokeStyle = c; g.beginPath(); g.moveTo(A.p.l, A.Y(E)); g.lineTo(A.p.l + A.iw, A.Y(E)); g.stroke(); }
        g.setLineDash([]);
        // stimulus trace in the bottom band (scaled: 20 µA/cm² ≙ 18 px)
        g.fillStyle = col('--accent'); g.globalAlpha = 0.35; const base = A.p.t + A.ih;
        g.beginPath(); g.moveTo(A.X(hist.t[0] || x0), base);
        hist.t.forEach((t, i) => g.lineTo(A.X(t), base - Math.min(1.2, hist.I[i] / 20) * 18));
        g.lineTo(A.X(hist.t[hist.t.length - 1] || x0), base); g.fill(); g.globalAlpha = 1;
        series(g, A, 'V', col('--fg'), undefined, 2);
        g.restore();
        label(g, 'E_Na ' + p.ENa.toFixed(0), A.p.l + A.iw + 3, A.Y(Math.min(p.ENa, 62)), col('--s1'));
        label(g, 'E_K ' + p.EK, A.p.l + A.iw + 3, A.Y(p.EK), col('--s2'));
        label(g, 'I_stim', A.p.l + 4, A.p.t + A.ih - 26, col('--accent'));
      }
      function drawG() {
        if (gWrap.style.display === 'none') return;
        const g = cvG.g, W = cvG.w, Hh = cvG.h, p = sim.p, [x0, x1] = win(), sub = Hh / 2;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const pad = { l: 44, r: 44, t: 10, b: 24 };
        g.save();
        let A = h.axes(g, W, sub, { x0, x1, y0: 0, y1: 1, pad, xTicks: ticks(x0, x1), yTicks: [0, 0.5, 1], yLabel: '门控' }, col);
        clip(g, A); series(g, A, 'm', col('--s1')); series(g, A, 'h', col('--s3')); series(g, A, 'n', col('--s2')); g.restore();
        [['m', '--s1'], ['h', '--s3'], ['n', '--s2']].forEach(([k, c], i) => label(g, k, A.p.l + A.iw + 6, A.p.t + 10 + i * 15, col(c)));
        g.translate(0, sub);
        A = h.axes(g, W, sub, { x0, x1, y0: 0, y1: 40, pad, xTicks: ticks(x0, x1), yTicks: [0, 20, 40], xLabel: 't (ms)', yLabel: 'g (mS/cm²)' }, col);
        clip(g, A);
        series(g, A, 'm', col('--s1'), (m, i) => p.gNa * m ** 3 * hist.h[i], 2);
        series(g, A, 'n', col('--s2'), (n) => p.gK * n ** 4, 2); g.restore();
        label(g, 'g_Na', A.p.l + A.iw + 4, A.p.t + 10, col('--s1')); label(g, 'g_K', A.p.l + A.iw + 4, A.p.t + 25, col('--s2'));
        g.restore();
      }

      /* ---- Controls ---- */
      const f1 = (v) => v.toFixed(1);
      const sAmp = h.slider({ label: '脉冲幅度', min: 0, max: 20, step: 0.5, value: S.amp, format: (v) => f1(v) + ' µA/cm²', onInput: (v) => (S.amp = v) });
      const sDur = h.slider({ label: '脉冲时长', min: 0.5, max: 5, step: 0.5, value: S.dur, format: (v) => f1(v) + ' ms', onInput: (v) => (S.dur = v) });
      const sGap = h.slider({ label: '成对间隔', min: 2, max: 20, step: 0.5, value: S.gap, format: (v) => f1(v) + ' ms', onInput: (v) => (S.gap = v) });
      const sTon = h.slider({ label: '持续电流', min: 0, max: 20, step: 0.1, value: 0, format: (v) => f1(v) + ' µA/cm²', onInput: (v) => { sim.Iton = S.Iton = v; kick(); } });
      const sNa = h.slider({ label: '胞外 [Na⁺]o', min: 0.1, max: 1, step: 0.05, value: 1, format: (v) => Math.round(v * NAO) + ' mM', onInput: (v) => { S.na = v; upd(); } });
      const sT = h.slider({ label: '温度', min: 6.3, max: 30, step: 0.1, value: 6.3, format: (v) => f1(v) + ' °C', onInput: (v) => { S.temp = v; upd(); } });
      const tTTX = h.toggle({ label: '河豚毒素 TTX（ḡNa→0）', onChange: (b) => { S.ttx = b; upd(); } });
      const tTEA = h.toggle({ label: '四乙铵 TEA（ḡK→0）', onChange: (b) => { S.tea = b; upd(); } });
      const tG = h.toggle({ label: '显示门控/电导', value: showG, onChange: (b) => { gWrap.style.display = b ? '' : 'none'; drawG(); } });
      const cSp = h.choice({ label: '回放速度', value: 8, options: [{ value: 2, label: '2 ms/s' }, { value: 8, label: '8 ms/s' }, { value: 25, label: '25 ms/s' }], onChange: (v) => (S.speed = v) });
      function upd() { sim.p = par(); kick(); drawAll(); }
      controls.append(h.button({ label: '单次刺激', kind: 'primary', onClick: () => stim(false) }), h.button({ label: '成对刺激', onClick: () => stim(true) }),
        sAmp.el, sDur.el, sGap.el, sTon.el, sNa.el, sT.el, tTTX.el, tTEA.el, tG.el);
      if (!ctx.reduced) controls.append(cSp.el);

      const R = Object.fromEntries([['V', '膜电位 V'], ['st', '判定'], ['pk', '最近峰值 / 幅度'], ['ii', '该峰时 I_Na / I_K'], ['rest', '稳态 V*（静息）'], ['fr', '放电频率'], ['en', 'E_Na = 58·log₁₀([Na]o/[Na]i)']].map(([k, l]) => [k, h.readout(l)]));
      Object.values(R).forEach((r) => readout.append(r.el));
      function readouts() {
        const p = sim.p, V = sim.y[0], sp = sim.spikes.filter((s) => s.INa != null), last = sp[sp.length - 1];
        R.V.set(`${V.toFixed(1)} mV  ·  t = ${sim.t.toFixed(1)} ms`);
        const verdict = (q) => (q.fired == null ? '…' : q.fired ? '产生动作电位' : '未达阈值');
        R.st.set(lastPulses.length ? lastPulses.map((q, i) => (lastPulses.length > 1 ? `第${i + 1}个：` : '') + verdict(q)).join('；') + (S.tea ? '（TEA：K⁺ 通道被堵，无法复极，卡在去极化）' : '') : '—');
        if (last) {
          let vmin = Infinity; hist.t.forEach((t, i) => { if (t < last.t && t > last.t - 10) vmin = Math.min(vmin, hist.V[i]); });
          R.pk.set(`${last.peak >= 0 ? '+' : ''}${last.peak.toFixed(1)} mV / ${isFinite(vmin) ? (last.peak - vmin).toFixed(1) + ' mV' : '—'}`);
          R.ii.set(`${last.INa.toFixed(0)} / +${last.IK.toFixed(0)} µA/cm²（内流为负）`);
        } else { R.pk.set('—'); R.ii.set('—'); }
        R.rest.set(`${restV(p, S.Iton).toFixed(1)} mV`);
        const a = sim.spikes, n = a.length, isi = n >= 2 ? a[n - 1].t - a[n - 2].t : 0;
        const tonic = S.Iton > 0 && isi > 0 && isi < 60 && sim.t - a[n - 1].t < 1.5 * isi + 2;
        R.fr.set(tonic ? `${(1000 / isi).toFixed(0)} Hz（ISI ${isi.toFixed(1)} ms）` : S.Iton >= 6.2 && S.Iton < 9.8 && !S.ttx ? '0 Hz（双稳区：给一次刺激试试）' : '0 Hz');
        R.en.set(`${p.ENa.toFixed(1)} mV（[Na]o ${Math.round(S.na * NAO)} / [Na]i ${NAI} mM）`);
      }
      function drawAll() { drawV(); drawG(); readouts(); }

      const lp = h.loop((dt) => {
        acc += dt * S.speed; const ms = Math.floor(acc / DT) * DT; acc -= ms;
        if (ms > 0) advance(Math.min(ms, 5)); drawAll();
      });
      // Opening state: one 10 µA/cm², 1 ms pulse at t = 5 ms, already computed
      lastPulses = [{ t0: 5, dur: 1, amp: 10 }]; sim.pulses.push(lastPulses[0]);
      advance(ctx.reduced ? WIN : 30);
      record(); drawAll();
      if (!ctx.reduced) lp.start();
      cvV.onResize(drawV); cvG.onResize(drawG);
      const mo = new MutationObserver(drawAll);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      return { destroy() { lp.stop(); cvV.destroy(); cvG.destroy(); mo.disconnect(); } };
    },
  };
})();
