/* 量子霍尔平台 — Klaus von Klitzing, Nobel Physics 1985 (demo lab)
 * Field sweep of R_xy and ρ_xx for a 2D electron gas, plus the Landau-level density of states at the cursor.
 * Phenomenological model (示意, integer effect only): sublevels E = ħω_c(N+½) ± g*μ_B B/2 (± Δ_v/2 for Si),
 *   each a Gaussian of width G = G1·√B in the DOS (fixes E_F); only a core of width γ = (1 − f_loc)·G is extended.
 *   S(E) = Σ Φ((E−E_j)/γ) (extended states below E), m(E) = extended DOS / average; thermal smearing adds π²(kT)²/3 to γ².
 *   σ_xx = m·σ_D, σ_xy = S·e²/h − σ_xx/(μB), σ_D = neμ/(1+μ²B²). Low field → Drude; mobility gap → σ_xy = i e²/h.
 * Constants: h = 6.62607015e-34 J s, e = 1.602176634e-19 C (exact, SI 2019) ⇒ h/e² = 25 812.807 Ω, e/h = 2.418e14 m⁻² T⁻¹;
 *   ħe/m_e = 0.115768 meV/T, μ_B = 0.0578838 meV/T, k_B = 0.0861733 meV/K.
 */
(() => {
  const HP = 6.62607015e-34, EC = 1.602176634e-19, RK = HP / (EC * EC), EH = EC / HP;
  const HWC = 0.1157676, MUB = 0.0578838, KBM = 0.08617333;
  // m* (m_e), effective g, valley splitting (meV/T), valleys, mobility (m²/Vs), DOS width (meV/√T)
  const MAT = {
    gaas: { m: 0.067, g: 3, dv: 0, nv: 1, mu: 20, G1: 0.06, n: 3, name: 'GaAs/AlGaAs 异质结' },
    si: { m: 0.19, g: 4, dv: 0.1, nv: 2, mu: 1.6, G1: 0.16, n: 12.5, name: 'Si MOSFET' },
  };
  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  const Phi = (z) => (z > 8 ? 1 : z < -8 ? 0 : 0.5 * (1 + erf(z / Math.SQRT2)));
  function levels(B, S, Emax) {
    const hw = (HWC * B) / S.m, ds = S.g * MUB * B, dv = S.nv === 2 ? S.dv * B : 0, out = [];
    for (let N = 0; N < 4000; N++) {
      const b = hw * (N + 0.5); if (b - ds / 2 - dv / 2 > Emax) break;
      for (const s of [-1, 1]) { if (S.nv === 2) out.push(b + (s * ds) / 2 - dv / 2, b + (s * ds) / 2 + dv / 2); else out.push(b + (s * ds) / 2); }
    }
    return out.sort((a, b) => a - b);
  }
  function cnt(L, E, w) { let c = 0; for (const e of L) { const z = (E - e) / w; if (z > 8) c += 1; else if (z < -8) break; else c += Phi(z); } return c; }
  function ext(L, E, w) { let c = 0; for (const e of L) { const z = (E - e) / w; if (z < -9) break; if (z < 9) c += Math.exp(-0.5 * z * z); } return c / (2.5066282746 * w); }
  function transport(B, n, T, S, fx) {
    B = Math.max(B, 1e-3);
    const nu = n / (EH * B), hw = (HWC * B) / S.m, x = S.mu * B, sD = (n * EC * S.mu) / (1 + x * x);
    const G = S.G1 * Math.sqrt(B), gam = fx * G, kT = KBM * Math.max(T, 0.05), per = 2 * S.nv;
    const X = (2 * Math.PI * Math.PI * kT) / hw;
    const damp = Math.exp((-2 * Math.PI * Math.PI * G * G) / (hw * hw)) * (X > 50 ? 0 : X / Math.sinh(Math.max(X, 1e-9)));
    let Sx = nu, m = 1, EF = NaN;
    if (damp > 1e-6) {
      const GD = Math.sqrt(G * G + 3.29 * kT * kT), Emax = hw * (nu / per + 2) + 12 * GD + 12 * kT, L = levels(B, S, Emax);
      let a = L[0] - 10 * GD, b = Emax;
      for (let i = 0; i < 46; i++) { const c = 0.5 * (a + b); if (cnt(L, c, GD) < nu) a = c; else b = c; }
      EF = 0.5 * (a + b);
      const wT = Math.sqrt(gam * gam + 3.29 * kT * kT); // thermal smearing: −∂f/∂E has variance π²(kT)²/3 (Gaussian approximation)
      Sx = cnt(L, EF, wT); m = (ext(L, EF, wT) * hw) / per;
    }
    const sxx = sD * m, sxy = Sx / RK - sxx / x, den = sxx * sxx + sxy * sxy;
    return { nu, EF, hw, G, gam, rxy: sxy / den, rxx: sxx / den };
  }
  const fmt = (v, d) => v.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  LABS.qhe = {
    title: '量子霍尔平台',
    _math: { transport, RK, EH, MAT },
    mount(root, ctx) {
      const h = ctx.h, C = (k) => ctx.color(k);
      const B1 = 20, NP = 700;
      const st = { mat: 'gaas', n: 3, T: 0.3, loc: 0.7, B: 6.2, cls: true, curve: null };
      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '拖动光标停在平台上：R_xy 锁定在 h/ie²，ρ_xx 为零，下方能级图里费米能落在局域态之间。升高温度或把局域态比例调到 0，平台消失；换成 Si 样品，平台间距变成 4 重简并的样子。（整数效应的示意模型）' });
      root.append(stage, controls, readout, hint);
      const plot = h.canvas(stage, { aspect: 0.66, minH: 280, maxH: 430 });
      const dos = h.canvas(stage, { aspect: 0.26, minH: 120, maxH: 170 });

      const cM = h.choice({ label: '样品', value: st.mat, options: [{ value: 'gaas', label: 'GaAs 异质结' }, { value: 'si', label: 'Si MOSFET' }], onChange: (v) => { st.mat = v; st.n = MAT[v].n; sN.set(st.n); recompute(); } });
      const sN = h.slider({ label: '电子面密度 n', min: 1, max: 25, step: 0.1, value: st.n, format: (v) => v.toFixed(1) + ' ×10¹⁵ m⁻²', onInput: (v) => { st.n = v; recompute(); } });
      const sT = h.slider({ label: '温度 T', min: 0.3, max: 15, step: 0.1, value: st.T, format: (v) => v.toFixed(1) + ' K', onInput: (v) => { st.T = v; recompute(); } });
      const sL = h.slider({ label: '局域态比例（示意）', min: 0, max: 0.9, step: 0.01, value: st.loc, format: (v) => Math.round(v * 100) + '%', onInput: (v) => { st.loc = v; recompute(); } });
      const sB = h.slider({ label: '光标磁场 B', min: 0.2, max: B1, step: 0.01, value: st.B, format: (v) => v.toFixed(2) + ' T', onInput: (v) => { st.B = v; draw(); } });
      const tC = h.toggle({ label: '显示经典直线 B/(ne)', value: st.cls, onChange: (b) => { st.cls = b; draw(); } });
      controls.append(cM.el, sN.el, sT.el, sL.el, sB.el, tC.el);
      const ro = { nu: h.readout('填充因子 ν = nh/(eB)'), xy: h.readout('R_xy'), q: h.readout('最近的 h/(ie²)'), d: h.readout('R_xy 的相对偏差'), xx: h.readout('ρ_xx'), cl: h.readout('经典 B/(ne)') };
      Object.values(ro).forEach((r) => readout.append(r.el));

      let raf = 0;
      function recompute() { // full sweep (≈ 700 model evaluations), coalesced to one per frame
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const S = MAT[st.mat], n = st.n * 1e15, fx = 1 - st.loc, xy = new Float64Array(NP + 1), xx = new Float64Array(NP + 1);
          let mx = 0;
          for (let i = 0; i <= NP; i++) { const r = transport((B1 * Math.max(i, 1)) / NP, n, st.T, S, fx); xy[i] = r.rxy; xx[i] = r.rxx; mx = Math.max(mx, r.rxx); }
          st.curve = { xy, xx, ym: Math.max(1, Math.ceil(mx / 500) * 0.5) };
          draw();
        });
      }
      function draw() {
        if (!st.curve) return;
        drawPlot(); drawDos();
        const S = MAT[st.mat], n = st.n * 1e15, r = transport(st.B, n, st.T, S, 1 - st.loc), i = Math.max(1, Math.round(RK / r.rxy));
        const dev = r.rxy * i / RK - 1;
        ro.nu.set(r.nu.toFixed(3));
        ro.xy.set(fmt(r.rxy, 3) + ' Ω');
        ro.q.set('i = ' + i + ' → ' + fmt(RK / i, 3) + ' Ω');
        ro.d.set(Math.abs(dev) < 1e-9 ? '< 10⁻⁹' : dev.toExponential(1));
        ro.xx.set(fmt(r.rxx, 2) + ' Ω/□');
        ro.cl.set(fmt(st.B / (n * EC), 1) + ' Ω');
      }
      function drawPlot() {
        const g = plot.g, W = plot.w, Hh = plot.h, mono = C('--mono-font') || 'monospace', split = Math.round(Hh * 0.64), cv = st.curve;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const xT = [0, 5, 10, 15, 20], ymx = 30;
        const top = h.axes(g, W, Hh, { x0: 0, x1: B1, y0: 0, y1: ymx, pad: { l: 46, r: 34, t: 10, b: Hh - split + 6 }, xTicks: xT, yTicks: [0, 10, 20, 30], fmtX: () => '', yLabel: 'R_xy (kΩ)' }, C);
        const yT = []; for (let t = 0; t <= cv.ym + 1e-9; t += cv.ym > 2 ? 1 : 0.5) yT.push(t);
        const bot = h.axes(g, W, Hh, { x0: 0, x1: B1, y0: 0, y1: cv.ym, pad: { l: 46, r: 34, t: split + 6, b: 34 }, xTicks: xT, yTicks: yT, fmtY: (v) => String(v), xLabel: 'B (T)', yLabel: 'ρ_xx (kΩ)' }, C);
        // h/(ie²) reference lines
        g.font = '10px ' + mono; g.textAlign = 'left'; g.textBaseline = 'middle';
        let lastY = -99;
        for (let i = 1; i <= 12; i++) {
          const y = top.Y(RK / i / 1000);
          g.strokeStyle = C('--grid'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(top.p.l, y); g.lineTo(W - top.p.r, y); g.stroke(); g.setLineDash([]);
          if (y - lastY < 11) break; // stop labelling once the lines crowd together
          g.fillStyle = C('--muted'); g.fillText('i=' + i, W - top.p.r + 3, y); lastY = y;
        }
        if (st.cls) {
          const n = st.n * 1e15; g.strokeStyle = C('--muted'); g.setLineDash([5, 4]); g.lineWidth = 1; g.beginPath();
          g.moveTo(top.X(0), top.Y(0)); const Bm = Math.min(B1, (ymx * 1000 * n * EC)); g.lineTo(top.X(Bm), top.Y(Bm / (n * EC) / 1000)); g.stroke(); g.setLineDash([]);
        }
        const line = (ax, arr, y1, col) => {
          g.strokeStyle = C(col); g.lineWidth = 1.7; g.beginPath();
          for (let i = 0; i <= NP; i++) { const X = ax.X((B1 * i) / NP), Y = ax.Y(Math.min(y1, arr[i] / 1000)); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
          g.stroke();
        };
        g.save(); g.beginPath(); g.rect(top.p.l, top.p.t, top.iw, top.ih); g.clip(); line(top, cv.xy, ymx * 1.02, '--s1'); g.restore();
        g.save(); g.beginPath(); g.rect(bot.p.l, bot.p.t, bot.iw, bot.ih); g.clip(); line(bot, cv.xx, cv.ym * 1.02, '--s2'); g.restore();
        const x = top.X(st.B); g.strokeStyle = C('--accent'); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, top.p.t); g.lineTo(x, Hh - 34); g.stroke();
        g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(MAT[st.mat].name + ' · ' + st.T.toFixed(1) + ' K', top.p.l + 6, top.p.t + 4);
      }
      function drawDos() {
        const g = dos.g, W = dos.w, Hh = dos.h, mono = C('--mono-font') || 'monospace';
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const S = MAT[st.mat], r = transport(st.B, st.n * 1e15, st.T, S, 1 - st.loc);
        const hw = r.hw, G = r.G, gam = r.gam, EF = isNaN(r.EF) ? hw * (r.nu / (2 * S.nv)) : r.EF;
        const E1 = Math.max(EF + 1.5 * hw, 2.5 * hw), L = levels(st.B, S, E1 + 6 * G);
        const NS = 360, ys = new Float64Array(NS + 1), core = new Uint8Array(NS + 1); let ymax = 0;
        for (let i = 0; i <= NS; i++) {
          const E = (E1 * i) / NS; let s = 0;
          for (const e of L) { const z = (E - e) / G; if (z > -7 && z < 7) s += Math.exp(-0.5 * z * z); if (Math.abs(E - e) < gam) core[i] = 1; }
          ys[i] = s; ymax = Math.max(ymax, s);
        }
        const ax = { l: 46, r: 34, t: 18, b: 22 }, X = (i) => ax.l + ((W - ax.l - ax.r) * i) / NS, Y = (i) => Hh - ax.b - ((Hh - ax.t - ax.b) * ys[i]) / (ymax * 1.1);
        const band = (pred, col, al) => { g.fillStyle = C(col); g.globalAlpha = al; for (let i = 0; i < NS; i++) if (pred(i)) { g.beginPath(); g.moveTo(X(i), Hh - ax.b); g.lineTo(X(i), Y(i)); g.lineTo(X(i + 1), Y(i + 1)); g.lineTo(X(i + 1), Hh - ax.b); g.closePath(); g.fill(); } g.globalAlpha = 1; };
        band((i) => (E1 * (i + 0.5)) / NS < EF, '--accent', 0.4);
        band((i) => core[i], '--s1', 0.55);
        g.strokeStyle = C('--fg'); g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i <= NS; i++) (i ? g.lineTo(X(i), Y(i)) : g.moveTo(X(i), Y(i))); g.stroke();
        g.strokeStyle = C('--line'); g.beginPath(); g.moveTo(ax.l, Hh - ax.b + 0.5); g.lineTo(W - ax.r, Hh - ax.b + 0.5); g.stroke();
        const xf = ax.l + ((W - ax.l - ax.r) * EF) / E1;
        g.strokeStyle = C('--warn'); g.lineWidth = 2; g.beginPath(); g.moveTo(xf, ax.t - 4); g.lineTo(xf, Hh - ax.b); g.stroke();
        g.font = '10.5px ' + mono; g.fillStyle = C('--warn'); g.textBaseline = 'top'; g.textAlign = xf > W - 80 ? 'right' : 'left'; g.fillText('E_F', xf + (xf > W - 80 ? -4 : 4), 2);
        g.fillStyle = C('--muted'); g.textAlign = 'left'; g.fillText('态密度 @ 光标', 4, 2);
        g.textBaseline = 'bottom'; g.textAlign = 'right';
        g.fillText('E (0 → ' + E1.toFixed(1) + ' meV)；金 = 已占据，蓝 = 扩展态', W - ax.r, Hh - 2);
      }
      function onPtr(e) {
        if (e.type === 'pointermove' && !(e.buttons & 1)) return;
        const r = plot.canvas.getBoundingClientRect(), x = e.clientX - r.left, iw = plot.w - 46 - 34;
        st.B = Math.max(0.2, Math.min(B1, ((x - 46) / iw) * B1)); sB.set(+st.B.toFixed(2)); draw();
      }
      plot.canvas.addEventListener('pointerdown', onPtr); plot.canvas.addEventListener('pointermove', onPtr);
      plot.onResize(draw); dos.onResize(draw);
      const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true });
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', draw);
      recompute();
      return {
        destroy() {
          if (raf) cancelAnimationFrame(raf);
          plot.canvas.removeEventListener('pointerdown', onPtr); plot.canvas.removeEventListener('pointermove', onPtr);
          plot.destroy(); dos.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', draw);
        },
      };
    },
  };
})();
