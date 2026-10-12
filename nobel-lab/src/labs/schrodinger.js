/* Lab: 盒中粒子的波函数 (Nobel Physics 1933, Schrödinger & Dirac)
 * Infinite well on [0, L]. Units ħ = m = L = 1:
 *   ψ_n(x) = √2 sin(nπx),  E_n = n²π²/2 = n²E₁,  T₁ = 2π/E₁ = 4/π.
 *   Ψ(x,t) = Σ c_n ψ_n(x) e^{−iE_n t},  equal |c_n| = 1/√N, optional phase φ on c₂.
 * ⟨x⟩ and the measurement CDF are computed numerically on a grid (midpoint rule).
 */
(() => {
  const NG = 240, DX = 1 / NG, E1 = (Math.PI * Math.PI) / 2, T1 = (2 * Math.PI) / E1;
  const XS = Array.from({ length: NG }, (_, i) => (i + 0.5) * DX);
  const SIN = [null]; for (let n = 1; n <= 5; n++) SIN.push(XS.map((x) => Math.SQRT2 * Math.sin(n * Math.PI * x)));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  /* coefficients: [{n, re, im}] for included levels */
  function coeffs(on, phi) {
    const ns = [1, 2, 3, 4, 5].filter((n) => on[n]), a = 1 / Math.sqrt(ns.length);
    return ns.map((n) => ({ n, re: n === 2 ? a * Math.cos(phi) : a, im: n === 2 ? a * Math.sin(phi) : 0 }));
  }
  /* Ψ on the grid at time t -> {re, im, rho} arrays */
  function psi(cs, t) {
    const re = new Float64Array(NG), im = new Float64Array(NG), rho = new Float64Array(NG);
    for (const c of cs) {
      const w = -c.n * c.n * E1 * t, cr = Math.cos(w), ci = Math.sin(w);
      const ar = c.re * cr - c.im * ci, ai = c.re * ci + c.im * cr, s = SIN[c.n];
      for (let i = 0; i < NG; i++) { re[i] += ar * s[i]; im[i] += ai * s[i]; }
    }
    for (let i = 0; i < NG; i++) rho[i] = re[i] * re[i] + im[i] * im[i];
    return { re, im, rho };
  }
  const meanX = (rho) => { let s = 0, z = 0; for (let i = 0; i < NG; i++) { s += XS[i] * rho[i]; z += rho[i]; } return s / z; };
  const meanE = (cs) => cs.reduce((s, c) => s + (c.re * c.re + c.im * c.im) * c.n * c.n, 0);   // in E₁
  /* beat of the two lowest included levels, and full revival period of |Ψ|², both in units of T₁ */
  function periods(cs) {
    if (cs.length < 2) return null;
    const ns = cs.map((c) => c.n); let g = 0;
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) g = gcd(g, ns[j] ** 2 - ns[i] ** 2);
    return { beat: 1 / (ns[1] ** 2 - ns[0] ** 2), lowPair: [ns[0], ns[1]], rep: 1 / g };
  }
  /* Born-rule sample from rho (u ∈ [0,1)) */
  function sample(rho, u) {
    let z = 0; for (let i = 0; i < NG; i++) z += rho[i];
    let acc = 0, target = u * z;
    for (let i = 0; i < NG; i++) { acc += rho[i]; if (acc >= target) return XS[i] - DX / 2 + DX * (1 - (acc - target) / rho[i]); }
    return 1 - 1e-9;
  }

  LABS.schrodinger = {
    title: '盒中粒子的波函数',
    _math: { coeffs, psi, meanX, meanE, periods, sample, E1, T1 },
    mount(root, ctx) {
      const h = ctx.h, col = ctx.color;
      const on = [false, true, true, false, false, false];
      let phi = 0, t = 0, speed = 0.15, playing = !ctx.reduced, cs = coeffs(on, phi), D = 4;
      const NB = 40, hist = new Array(NB).fill(0); let nMeas = 0, flash = null;   // flash = {x, age}

      const stage = h.el('div', { class: 'lab-stage' });
      const cv = h.canvas(stage, { aspect: 0.56, minH: 230, maxH: 370 });
      const tr = h.canvas(stage, { aspect: 0.2, minH: 84, maxH: 120 });
      const ctl = h.el('div', { class: 'lab-controls' });
      const ro = h.el('div', { class: 'lab-readout' });
      root.append(stage, ctl, ro, h.el('p', { class: 'lab-hint',
        text: '只开一个 n：|ψ|² 静止不动（定态，只有整体相位在转）。开 n=1 和 n=2：概率在盒里左右晃，周期 2π/(E₂−E₁)。按“测量位置”（会暂停时间），直方图会逼近 |ψ|²（玻恩规则；每次测量都用一份新制备的同样的态）。' }));

      /* --- controls --- */
      const chips = [1, 2, 3, 4, 5].map((n) => h.toggle({ label: `n=${n}`, value: on[n], onChange: (b) => {
        on[n] = b;
        if (!on.some(Boolean)) { on[n] = true; chips[n - 1].set(true); }   // keep at least one state
        stateChanged();
      } }));
      const chipRow = h.el('div', { class: 'ctl ctl-choice' }, [h.el('span', { class: 'ctl-lab', text: '叠加的本征态（等幅）' }),
        h.el('div', { class: 'segs', role: 'group' }, chips.map((c) => c.el))]);
      const sPhi = h.slider({ label: 'n=2 的相对相位 φ', min: 0, max: 2, step: 0.01, value: 0, format: (v) => `${v.toFixed(2)}π`,
        onInput: (v) => { phi = v * Math.PI; stateChanged(); } });
      const sSpd = h.slider({ label: '播放速度', min: 0.03, max: 0.5, step: 0.01, value: speed, format: (v) => `${v.toFixed(2)} T₁/s`,
        onInput: (v) => (speed = v) });
      const bPlay = h.button({ label: playing ? '暂停' : '播放', kind: 'primary', onClick: () => { setPlaying(!playing); if (playing) clearHist(); kick(); } });
      const bStep = h.button({ label: '前进 1/8 周期', onClick: () => { const P = periods(cs); t += (P ? P.beat : 1) * T1 / 8; clearHist(); kick(); } });
      const bMeas = h.button({ label: '测量位置', onClick: () => measure(1) });
      const bMeas50 = h.button({ label: '测量 ×50', onClick: () => measure(50) });
      const bClr = h.button({ label: '清空直方图', onClick: () => { clearHist(); kick(); } });
      ctl.append(chipRow, sPhi.el, sSpd.el, h.el('div', { class: 'ctl' }, [bPlay, ' ', bStep]), h.el('div', { class: 'ctl' }, [bMeas, ' ', bMeas50, ' ', bClr]));

      const rT = h.readout('时间 t'), rX = h.readout('⟨x⟩ = ∫x|ψ|²dx'), rE = h.readout('⟨E⟩ = Σ|cₙ|²n²E₁'),
        rB = h.readout('拍周期 T_拍 = 2π/(E_b−E_a)'), rM = h.readout('测量次数');
      [rT, rX, rE, rB, rM].forEach((r) => ro.append(r.el));

      /* peak of |Ψ|² over one full period T₁ (motion is T₁-periodic since E_n = n²E₁) -> fixed y scale */
      function rescale() {
        let m = 0; for (let k = 0; k < 160; k++) { const r = psi(cs, (k / 160) * T1).rho; for (let i = 0; i < NG; i++) m = Math.max(m, r[i]); }
        D = m * 1.08;
      }
      function stateChanged() { cs = coeffs(on, phi); rescale(); clearHist(); kick(); }

      function setPlaying(b) { playing = b; bPlay.textContent = b ? '暂停' : '播放'; }
      function clearHist() { hist.fill(0); nMeas = 0; }
      /* measuring pauses time: the histogram only makes sense for one fixed |Ψ(x,t)|² */
      function measure(k) {
        if (playing) setPlaying(false);
        const { rho } = psi(cs, t);
        let x = 0;
        for (let j = 0; j < k; j++) { x = sample(rho, Math.random()); hist[Math.min(NB - 1, Math.floor(x * NB))]++; nMeas++; }
        flash = { x, age: 0 }; kick();
      }

      /* --- drawing --- */
      function draw() {
        const g = cv.g, W = cv.w, Hh = cv.h, mono = col('--mono-font') || 'monospace';
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const lw = W > 460 ? 92 : 64, A = Math.sqrt(D);
        const ax = h.axes(g, W - lw, Hh, { x0: 0, x1: 1, y0: -A, y1: A, pad: { l: 34, r: 10, t: 12, b: 32 },
          xTicks: [0, 0.25, 0.5, 0.75, 1], fmtX: (v) => (v === 1 ? 'L' : String(v)), yTicks: [-1, 0, 1].map((v) => v * Math.floor(A)),
          xLabel: 'x / L', yLabel: 'ψ' }, col);
        const { X, Y } = ax, Yd = (r) => Y(0) - (r / D) * (Y(0) - Y(A));   // |ψ|² scale: 0 → axis, D → top
        const { re, im, rho } = psi(cs, t);
        // walls
        g.fillStyle = col('--line'); g.fillRect(X(0) - 4, ax.p.t, 4, ax.ih); g.fillRect(X(1), ax.p.t, 4, ax.ih);
        // histogram (density, same scale as |ψ|²)
        if (nMeas) {
          g.fillStyle = col('--s3'); g.globalAlpha = 0.28;
          for (let b = 0; b < NB; b++) { const d = hist[b] / (nMeas / NB); g.fillRect(X(b / NB) + 0.5, Yd(d), X(1 / NB) - X(0) - 1, Y(0) - Yd(d)); }
          g.globalAlpha = 1;
        }
        // |ψ|² filled
        g.beginPath(); g.moveTo(X(0), Y(0));
        for (let i = 0; i < NG; i++) g.lineTo(X(XS[i]), Yd(rho[i]));
        g.lineTo(X(1), Y(0)); g.closePath();
        g.fillStyle = col('--accent'); g.globalAlpha = 0.22; g.fill(); g.globalAlpha = 1;
        g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.stroke();
        // Re ψ, Im ψ
        [[re, '--s1'], [im, '--s2']].forEach(([arr, c]) => {
          g.strokeStyle = col(c); g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), Y(0));
          for (let i = 0; i < NG; i++) g.lineTo(X(XS[i]), Y(arr[i]));
          g.lineTo(X(1), Y(0)); g.stroke();
        });
        // ⟨x⟩ dot on the axis
        const mx = meanX(rho);
        g.fillStyle = col('--fg'); g.beginPath(); g.arc(X(mx), Y(-A) - 1, 5, 0, 7); g.fill();
        g.font = '11px ' + mono; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('⟨x⟩', X(mx), Y(-A) - 7);
        // measurement flash
        if (flash && flash.age < 1) {
          const a = 1 - flash.age; g.strokeStyle = col('--warn'); g.fillStyle = col('--warn'); g.globalAlpha = a; g.lineWidth = 2;
          g.beginPath(); g.moveTo(X(flash.x), ax.p.t); g.lineTo(X(flash.x), ax.p.t + ax.ih); g.stroke();
          g.beginPath(); g.arc(X(flash.x), Y(0), 4 + 10 * flash.age, 0, 7); g.stroke(); g.globalAlpha = 1;
        }
        // legend
        g.textAlign = 'left'; g.textBaseline = 'top';
        [['Re ψ', '--s1'], ['Im ψ', '--s2'], ['|ψ|²', '--accent']].concat(nMeas ? [['测量', '--s3']] : []).forEach(([s, c], k) => {
          g.fillStyle = col(c); g.fillRect(X(0) + 6 + k * 50, ax.p.t + 5, 10, 3); g.fillStyle = col('--muted'); g.fillText(s, X(0) + 19 + k * 50, ax.p.t + 1);
        });
        // energy ladder: E ∝ n²
        const lx0 = W - lw + 8, lx1 = W - 30, top = 16, bot = Hh - 32, YE = (e) => bot - (e / 26) * (bot - top);
        g.strokeStyle = col('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(lx0, top); g.lineTo(lx0, bot); g.stroke();
        g.fillStyle = col('--muted'); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('E/E₁', (lx0 + lx1) / 2, bot + 6);
        for (let n = 1; n <= 5; n++) {
          const y = YE(n * n), inc = on[n];
          g.strokeStyle = inc ? col('--accent') : col('--grid'); g.lineWidth = inc ? 2.5 : 1;
          g.beginPath(); g.moveTo(lx0 + 2, y); g.lineTo(lx1, y); g.stroke();
          g.fillStyle = inc ? col('--fg') : col('--muted'); g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText(String(n * n), lx1 + 4, y);
        }
        const yE = YE(meanE(cs));
        g.setLineDash([3, 3]); g.strokeStyle = col('--fg'); g.beginPath(); g.moveTo(lx0 + 2, yE); g.lineTo(lx1, yE); g.stroke(); g.setLineDash([]);
        g.fillStyle = col('--muted'); g.textAlign = 'right'; g.fillText('⟨E⟩', lx0 - 2, yE);

        drawTrail();
        // readouts
        const P = periods(cs);
        rT.set(`${(t / T1).toFixed(3)} T₁`);
        rX.set(`${mx.toFixed(3)} L`);
        rE.set(`${meanE(cs).toFixed(2)} E₁`);
        rB.set(P ? `${P.beat.toFixed(3)} T₁（n=${P.lowPair[1]}与${P.lowPair[0]}）· |ψ|²周期 ${P.rep.toFixed(3)} T₁` : '单一本征态：定态，无拍');
        rM.set(String(nMeas));
      }

      /* ⟨x⟩(t) over the last 2 T₁ */
      function drawTrail() {
        const g = tr.g, W = tr.w, Hh = tr.h, span = 2;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const t0 = t / T1 - span;
        const ax = h.axes(g, W, Hh, { x0: t0, x1: t0 + span, y0: 0, y1: 1, pad: { l: 34, r: 10, t: 8, b: 22 },
          yTicks: [0, 0.5, 1], fmtY: (v) => (v === 1 ? 'L' : String(v)), yLabel: '⟨x⟩' }, col);
        g.strokeStyle = col('--s1'); g.lineWidth = 1.6; g.beginPath();
        const M = Math.min(240, Math.floor(ax.iw));
        for (let k = 0; k <= M; k++) {
          const tt = t0 + (span * k) / M, y = meanX(psi(cs, tt * T1).rho);
          k ? g.lineTo(ax.X(tt), ax.Y(y)) : g.moveTo(ax.X(tt), ax.Y(y));
        }
        g.stroke();
        g.fillStyle = col('--muted'); g.font = '11px ' + (col('--mono-font') || 'monospace'); g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillText('t（过去 2 T₁ →现在）', ax.p.l + 4, Hh - 3);
      }

      /* --- loop: runs while playing or a flash is fading --- */
      const lp = h.loop((dt) => {
        if (playing) t += dt * speed * T1;
        if (flash) { flash.age += dt / 0.8; if (flash.age >= 1) flash = null; }
        draw();
        if (!playing && !flash) lp.stop();
      });
      function kick() {
        if (ctx.reduced && !playing) { if (flash) flash.age = 0.3; draw(); flash = null; return; }   // static frames only
        if (playing || flash) lp.start(); else draw();
      }

      cv.onResize(draw); tr.onResize(draw);
      const mo = new MutationObserver(() => draw());
      mo.observe(document.documentElement, { attributes: true });
      if (ctx.reduced) { bPlay.textContent = '播放'; }
      rescale(); draw(); kick();

      return { destroy() { lp.stop(); cv.destroy(); tr.destroy(); mo.disconnect(); } };
    },
  };
})();
