/* 双黑洞并合的啁啾 — Nobel Physics 2017 (Weiss, Barish, Thorne; LIGO, GW150914)
 * Constants: GM☉/c³ = 4.925491e-6 s, GM☉/c² = 1476.625 m, c = 2.99792458e8 m/s, 1 Mpc = 3.0857e22 m
 * Leading-order (Newtonian quadrupole) inspiral, τ = t_c − t:
 *   f_GW(τ) = (1/π)(5/(256τ))^{3/8} (G𝓜/c³)^{−5/8}     τ(f) = (5/256)(πf)^{−8/3} (G𝓜/c³)^{−5/3}
 *   GW phase φ(τ) = φ_c − 2(τ/(5G𝓜/c³))^{5/8};  h = 4(G𝓜/c²)^{5/3}(πf/c)^{2/3}/D  (optimal orientation)
 *   Kepler: r/(GM/c²) = (π f_GW GM/c³)^{−2/3}, f_orb = f_GW/2;  ISCO: f_GW = c³/(6^{3/2} π G M)
 * Past ISCO everything is SCHEMATIC: the Newtonian f(τ) is continued up to the ringdown frequency, amplitude
 * grows only ∝ f^{1/3}; remnant from simple fits E_rad/M ≈ 0.0572η + 0.54η², a_f ≈ 2√3η − 3.871η² + 4.028η³;
 * ℓ=m=2 quasi-normal mode (Berti–Cardoso–Will 2006): f = [1.5251 − 1.1568(1−a)^{0.1292}]/(2π GM_f/c³),
 * Q = 0.7 + 1.4187(1−a)^{−0.499}, damping time τ_d = Q/(π f).  (36+29 M☉ → ~270 Hz, ~4 ms, as GW150914.)
 */
(() => {
  const TSUN = 4.925491e-6, LSUN = 1476.625, CL = 2.99792458e8, MPC = 3.0857e22, LARM = 4000, PROTON = 1.68e-15;
  const FS = 8192, T0 = -0.30, T1 = 0.05;          // sample rate (Hz) and window, s relative to amplitude peak
  const SLOW = 20, A_SLOW = 3, A_PITCH = 4;         // animation slow-down; audio: 3× slower, 4× higher pitch
  const chirpMass = (m1, m2) => Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2);
  const fOfTau = (tau, Mc) => (1 / Math.PI) * Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(Mc * TSUN, -5 / 8);
  const tauOfF = (f, Mc) => (5 / 256) * Math.pow(Math.PI * f, -8 / 3) * Math.pow(Mc * TSUN, -5 / 3);
  const fISCO = (M) => 1 / (Math.pow(6, 1.5) * Math.PI * M * TSUN);
  const strain = (f, Mc, Dmpc) => (4 * Math.pow(Mc * LSUN, 5 / 3) * Math.pow((Math.PI * f) / CL, 2 / 3)) / (Dmpc * MPC);
  const cyclesBetween = (tauA, tauB, Mc) => (Math.pow(tauA / (5 * Mc * TSUN), 5 / 8) - Math.pow(tauB / (5 * Mc * TSUN), 5 / 8)) / Math.PI;
  function remnant(m1, m2) {
    const M = m1 + m2, eta = (m1 * m2) / (M * M);
    const Mf = M * (1 - 0.0572 * eta - 0.54 * eta * eta);
    const a = 2 * Math.sqrt(3) * eta - 3.871 * eta * eta + 4.028 * eta ** 3;
    const f = (1.5251 - 1.1568 * Math.pow(1 - a, 0.1292)) / (2 * Math.PI * Mf * TSUN);
    const Q = 0.7 + 1.4187 * Math.pow(1 - a, -0.499);
    return { eta, Mf, a, f, Q, tau: Q / (Math.PI * f) };
  }
  /* Sampled waveform on s ∈ [T0, T1], s = 0 at the amplitude peak (start of ringdown). */
  function build(m1, m2, D) {
    const M = m1 + m2, Mc = chirpMass(m1, m2), rem = remnant(m1, m2);
    const fI = fISCO(M), tR = tauOfF(rem.f, Mc), sI = tR - tauOfF(fI, Mc);
    const AI = strain(fI, Mc, D), AP = AI * Math.cbrt(rem.f / fI);
    const N = Math.round((T1 - T0) * FS) + 1;
    const f = new Float64Array(N), A = new Float64Array(N), ph = new Float64Array(N), hh = new Float64Array(N), r = new Float64Array(N);
    let p = 0;
    for (let i = 0; i < N; i++) {
      const s = T0 + i / FS;
      if (s < 0) {
        f[i] = fOfTau(tR - s, Mc);
        A[i] = s < sI ? strain(f[i], Mc, D) : AI * Math.cbrt(f[i] / fI);
        r[i] = Math.pow(Math.PI * f[i] * M * TSUN, -2 / 3);
      } else { f[i] = rem.f; A[i] = AP * Math.exp(-s / rem.tau); r[i] = 0; }
      if (i) p += (2 * Math.PI * f[i]) / FS;
      ph[i] = p; hh[i] = A[i] * Math.cos(p);
    }
    return { m1, m2, M, Mc, D, rem, fI, sI, tR, AI, AP, N, f, A, ph, hh, r,
      cycles35: cyclesBetween(tauOfF(35, Mc), tR, Mc) };
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sci = (v, d = 2) => { const [m, e] = v.toExponential(d).split('e'); return m + '×10' + String(+e).replace(/./g, (c) => SUP[c]); };

  LABS.ligo = {
    title: '双黑洞并合的啁啾',
    _m: { chirpMass, fOfTau, tauOfF, fISCO, strain, remnant, build, cyclesBetween },
    mount(root, ctx) {
      const h = ctx.h, col = ctx.color;
      let B = build(36, 29, 410), s = ctx.reduced ? -0.02 : T0, speed = SLOW;
      let actx = null, src = null;
      const full = ctx.reduced;                         // reduced motion: static full waveform

      const stage = h.el('div', { class: 'lab-stage' });
      const cvO = h.canvas(stage, { aspect: 0.5, minH: 170, maxH: 270 });
      const cvW = h.canvas(stage, { aspect: 0.3, minH: 130, maxH: 200 });
      const cvS = h.canvas(stage, { aspect: 0.26, minH: 115, maxH: 170 });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      root.append(stage, controls, readout, h.el('p', { class: 'lab-hint',
        text: `看频率随时间“啁啾”上扬：轨道越缩越快，GW 频率 = 2× 轨道频率。加大质量，信号变短、频率变低；距离只改振幅。声音：真实波形本就在可听频段，但为让笔记本扬声器放得出，时间放慢 ${A_SLOW} 倍、频率升高 ${A_PITCH} 倍（35 Hz → 140 Hz）。` }));

      const rebuild = () => { B = build(m1.get(), m2.get(), dd.get()); updateFixed(); drawAll(); };
      const m1 = h.slider({ label: 'm₁', min: 5, max: 80, value: 36, format: (v) => v + ' M☉', onInput: rebuild });
      const m2 = h.slider({ label: 'm₂', min: 5, max: 80, value: 29, format: (v) => v + ' M☉', onInput: rebuild });
      const dd = h.slider({ label: '距离 D', min: 100, max: 3000, step: 10, value: 410, format: (v) => v + ' Mpc', onInput: rebuild });
      const sc = h.slider({ label: '时刻 t − t_峰', min: T0, max: T1, step: 0.001, value: s, format: (v) => (v * 1000).toFixed(0) + ' ms',
        onInput: (v) => { lp.stop(); s = v; drawAll(); } });
      const bPlay = h.button({ label: '▶ 播放并合', kind: 'primary', onClick: () => play(SLOW) });
      const bSnd = h.button({ label: '♪ 播放声音', onClick: playSound });
      const bRst = h.button({ label: '复位 GW150914', onClick: () => { m1.set(36); m2.set(29); dd.set(410); rebuild(); } });
      controls.append(m1.el, m2.el, dd.el, sc.el, bPlay, bSnd, bRst);

      const rMc = h.readout('啁啾质量 𝓜 = (m₁m₂)^{3/5}/M^{1/5}'), rF2 = h.readout('f_GW(τ = 0.2 s)'), rT35 = h.readout('35 Hz → 并合 τ(f)'),
        rIs = h.readout('f_ISCO = c³/(6^{3/2}πGM) · 铃宕 f'), rH = h.readout('h = 4(G𝓜/c²)^{5/3}(πf/c)^{2/3}/D'), rDL = h.readout('臂长变化 ΔL = h·4 km'),
        rN = h.readout('35 Hz→峰值 GW 周期数'), rNow = h.readout('此刻');
      [rMc, rF2, rT35, rIs, rH, rDL, rN, rNow].forEach((r) => readout.append(r.el));

      function updateFixed() {
        rMc.set(`${B.Mc.toFixed(1)} M☉（总质量 ${B.M} M☉）`);
        rF2.set(`${fOfTau(0.2, B.Mc).toFixed(1)} Hz`);
        rT35.set(`${tauOfF(35, B.Mc).toFixed(3)} s`);
        rIs.set(`${B.fI.toFixed(0)} Hz · ≈${B.rem.f.toFixed(0)} Hz（示意，τ_d ${(B.rem.tau * 1000).toFixed(1)} ms）`);
        rH.set(`ISCO ${sci(B.AI)} · 峰≈${sci(B.AP, 1)}（最佳取向；实测约 1.0×10⁻²¹）`);
        const dL = B.AI * LARM;
        rDL.set(`${sci(dL)} m ≈ 质子直径的 1/${Math.round(PROTON / dL)}`);
        rN.set(`≈ ${B.cycles35.toFixed(1)}（领头阶）`);
      }
      const idx = (t) => Math.max(0, Math.min(B.N - 1, Math.round((t - T0) * FS)));
      const mono = () => col('--mono-font') || 'monospace';
      const phaseName = (t) => (t >= 0 ? '铃宕（示意）' : t >= B.sI ? '并合（示意）' : '旋近（领头阶公式）');

      /* ---- top: the binary seen face-on, true geometric scale in units of GM/c² ---- */
      function drawOrbit() {
        const g = cvO.g, W = cvO.w, Hh = cvO.h, i = idx(s);
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const mx = Math.max(B.m1, B.m2), mn = Math.min(B.m1, B.m2);
        const ext = (B.r[0] * mx) / B.M + (2 * mn) / B.M + 0.3;
        const k = (Math.min(W * 0.36, Hh / 2) - 10) / ext, cx = W * 0.62, cy = Hh / 2;
        const pos = (j, which) => {               // BH1 sits at −(m₂/M)r, BH2 at +(m₁/M)r from the centre of mass
          const a = B.ph[j] / 2, rr = B.r[j] * k * (which ? B.m1 / B.M : -B.m2 / B.M);
          return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
        };
        g.strokeStyle = col('--grid'); g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.stroke();
        const bh = (x, y, rx, ry, rot) => {
          g.fillStyle = '#000'; g.strokeStyle = col('--accent'); g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(x, y, Math.max(3, rx), Math.max(3, ry), rot, 0, 7); g.fill(); g.stroke();
        };
        if (s < 0) {
          for (const w of [0, 1]) {                // trail: about one orbit back
            g.strokeStyle = w ? col('--s1') : col('--s2'); g.globalAlpha = 0.45; g.lineWidth = 1.2; g.beginPath();
            for (let j = i, n = 0; j >= 0 && B.ph[i] - B.ph[j] < 4 * Math.PI; j -= 2, n++) { const [x, y] = pos(j, w); n ? g.lineTo(x, y) : g.moveTo(x, y); }
            g.stroke(); g.globalAlpha = 1;
          }
          const [x1, y1] = pos(i, 0), [x2, y2] = pos(i, 1);
          bh(x1, y1, (2 * B.m1 * k) / B.M, (2 * B.m1 * k) / B.M, 0);
          bh(x2, y2, (2 * B.m2 * k) / B.M, (2 * B.m2 * k) / B.M, 0);
        } else {                                   // single remnant, quadrupole "ringing" of its shape
          const rf = ((B.rem.Mf * (1 + Math.sqrt(1 - B.rem.a ** 2))) / B.M) * k, e = 0.22 * (B.A[i] / B.AP) * Math.cos(B.ph[i]);
          bh(cx, cy, rf * (1 + e), rf * (1 - e), B.ph[i] / 2);
        }
        g.font = '11px ' + mono(); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillStyle = s < B.sI ? col('--fg') : col('--accent'); g.fillText(phaseName(s), 8, 8);
        g.fillStyle = col('--muted');
        const lines = s < 0
          ? [`r = ${B.r[i].toFixed(1)} GM/c²`, `  = ${((B.r[i] * B.M * LSUN) / 1000).toFixed(0)} km`, `f_orb = f_GW/2 = ${(B.f[i] / 2).toFixed(0)} Hz`,
            `v/c ≈ ${Math.cbrt(Math.PI * B.f[i] * B.M * TSUN).toFixed(2)}`]
          : [`M_f ≈ ${B.rem.Mf.toFixed(1)} M☉`, `自旋 a ≈ ${B.rem.a.toFixed(2)}`, `辐射 ≈ ${(B.M - B.rem.Mf).toFixed(1)} M☉c²`];
        lines.forEach((t, j) => g.fillText(t, 8, 26 + 15 * j));
        g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('真实比例 · 俯视', W - 6, Hh - 4);
      }

      /* ---- middle: strain h(t) ---- */
      function drawWave() {
        const g = cvW.g, W = cvW.w, Hh = cvW.h, yr = (B.AP / 1e-21) * 1.15, tk = +((yr * 0.7).toPrecision(1));
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: T0, x1: T1, y0: -yr, y1: yr, pad: { l: 42, t: 16, b: 30 }, xTicks: [-0.3, -0.2, -0.1, 0],
          yTicks: [-tk, 0, tk], fmtX: (v) => v.toFixed(1), fmtY: (v) => String(+v.toPrecision(2)), xLabel: 't − t_峰 / s', yLabel: 'h / 10⁻²¹' }, col);
        shadeMerger(g, A);
        const ip = full ? B.N - 1 : idx(s);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip(); g.lineWidth = 1.3;
        for (const [a, b, c, al] of [[0, ip, '--s1', 1], [ip, B.N - 1, '--muted', 0.5]]) {
          g.strokeStyle = col(c); g.globalAlpha = al; g.beginPath();
          for (let j = a; j <= b; j++) { const x = A.X(T0 + j / FS), y = A.Y(B.hh[j] / 1e-21); j === a ? g.moveTo(x, y) : g.lineTo(x, y); }
          g.stroke();
        }
        g.restore(); playhead(g, A);
      }
      function shadeMerger(g, A) {
        const xa = A.X(Math.max(T0, B.sI)), xb = A.X(0), xc = A.X(Math.min(T1, 6 * B.rem.tau));
        g.fillStyle = col('--accent'); g.globalAlpha = 0.07; g.fillRect(xa, A.p.t, xc - xa, A.ih); g.globalAlpha = 1;
        g.strokeStyle = col('--accent'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xa, A.p.t); g.lineTo(xa, A.p.t + A.ih);
        g.moveTo(xb, A.p.t); g.lineTo(xb, A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        g.font = '10px ' + mono(); g.fillStyle = col('--accent'); g.textBaseline = 'bottom'; g.textAlign = 'right';
        if (B.sI > T0) g.fillText('ISCO', xa - 2, A.p.t - 2);
        g.textAlign = 'left'; g.fillText('并合/铃宕（示意）', Math.min(xb + 2, A.p.l + A.iw - 86), A.p.t - 2);
        g.fillStyle = col('--muted'); g.fillText('旋近', A.p.l + 3, A.p.t - 2);
      }
      function playhead(g, A) {
        const x = A.X(s); g.strokeStyle = col('--fg'); g.lineWidth = 1; g.globalAlpha = 0.6;
        g.beginPath(); g.moveTo(x, A.p.t); g.lineTo(x, A.p.t + A.ih); g.stroke(); g.globalAlpha = 1;
      }

      /* ---- bottom: time–frequency strip (Q-transform–like) ---- */
      const noise = Array.from({ length: 700 }, () => [Math.random(), Math.random(), Math.random()]);
      function drawSpec() {
        const g = cvS.g, W = cvS.w, Hh = cvS.h;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: T0, x1: T1, y0: 20, y1: 2048, logY: true, pad: { l: 42, t: 8, b: 30 }, xTicks: [-0.3, -0.2, -0.1, 0],
          yTicks: [32, 128, 512], fmtX: (v) => v.toFixed(1), xLabel: 't − t_峰 / s', yLabel: 'f / Hz' }, col);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.fillStyle = col('--muted');
        for (const [u, v, a] of noise) { g.globalAlpha = 0.05 + 0.12 * a; g.fillRect(A.p.l + u * A.iw, A.p.t + v * A.ih, 3, 3); }
        g.fillStyle = col('--accent');
        for (let px = 0; px < A.iw; px++) {
          const t = T0 + ((px + 0.5) / A.iw) * (T1 - T0), j = idx(t), e = Math.pow(B.A[j] / B.AP, 2), y = A.Y(B.f[j]);
          const fut = t > s && !full ? 0.18 : 1;
          g.globalAlpha = Math.min(1, 0.06 + 0.35 * e) * fut; g.fillRect(A.p.l + px, y - 6, 1, 12);
          g.globalAlpha = Math.min(1, 0.15 + 0.85 * e) * fut; g.fillRect(A.p.l + px, y - 1.5, 1, 3);
        }
        g.restore(); g.globalAlpha = 1; playhead(g, A);
        const j = idx(s);
        if (B.A[j] > 1e-3 * B.AP) {
          g.font = '11px ' + mono(); g.fillStyle = col('--fg'); g.textBaseline = 'bottom';
          const x = A.X(s); g.textAlign = x > A.p.l + A.iw - 70 ? 'right' : 'left';
          g.fillText(`${B.f[j].toFixed(0)} Hz`, x + (g.textAlign === 'left' ? 4 : -4), Math.max(A.p.t + 12, A.Y(B.f[j]) - 6));
        }
      }

      function drawAll() {
        drawOrbit(); drawWave(); drawSpec();
        const j = idx(s);
        rNow.set(`${phaseName(s).replace(/（.*）/, '')} · f_GW ${B.f[j].toFixed(0)} Hz · h ${sci(B.A[j], 1)}`);
      }
      const lp = h.loop((dt) => {
        s += dt / speed;
        if (s >= T1) { s = T1; lp.stop(); }
        sc.set(s); drawAll();
      });
      function play(sp) {
        speed = sp;
        if (ctx.reduced) { s = 0; sc.set(s); drawAll(); return; }   // no motion: jump to the merger frame
        s = T0; lp.start();
      }

      /* ---- audio: render the chirp into a buffer, slowed A_SLOW× with phase × (A_SLOW·A_PITCH) ---- */
      function stopSound() { if (src) { try { src.stop(); } catch (e) { /* already stopped */ } src = null; } }
      function playSound() {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        stopSound(); actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
        const sr = actx.sampleRate, n = Math.floor((T1 - T0) * A_SLOW * sr), buf = actx.createBuffer(1, n, sr), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) {
          const x = (i / sr / A_SLOW) * FS, j = Math.min(B.N - 2, Math.floor(x)), u = x - j;
          const amp = (B.A[j] + (B.A[j + 1] - B.A[j]) * u) / B.AP, p = B.ph[j] + (B.ph[j + 1] - B.ph[j]) * u;
          const fade = Math.min(1, i / (0.03 * sr), (n - i) / (0.05 * sr));
          d[i] = 0.55 * fade * Math.max(amp, 0.0) * Math.sin(A_SLOW * A_PITCH * p);
        }
        src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination);
        src.onended = () => { src = null; }; src.start();
        play(A_SLOW);                                   // animation in step with the sound
      }

      [cvO, cvW, cvS].forEach((c) => c.onResize(drawAll));
      const mo = new MutationObserver(drawAll);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', drawAll);
      updateFixed(); drawAll();
      if (!ctx.reduced) lp.start();

      return { destroy() {
        lp.stop(); stopSound(); if (actx) { actx.close(); actx = null; }
        [cvO, cvW, cvS].forEach((c) => c.destroy()); mo.disconnect(); mq.removeEventListener('change', drawAll);
      } };
    },
  };
})();
