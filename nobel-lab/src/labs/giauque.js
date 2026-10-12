/* 绝热去磁制冷机 — Giauque, Nobel Chemistry 1949
 * Ideal paramagnet of Gd³⁺ (J = 7/2, g = 2) in Gd₂(SO₄)₃·8H₂O, per mole of Gd³⁺.
 *   x = g μ_B B_eff / (k T),  B_eff = √(B² + b²)   (b = small effective internal field, 模型参数 0.13 T)
 *   Z = sinh((2J+1)x/2) / sinh(x/2),   S/R = ln Z − x · d(ln Z)/dx,   ⟨J_z⟩ = d(ln Z)/dx (Brillouin)
 * S depends only on x, so an adiabatic change keeps B_eff/T fixed:  T_f = T_i · b / √(B_i² + b²)
 *   1.5 K, 0.8 T → 0.24 K  (Giauque & MacDougall 1933 reached ≈ 0.25 K).
 * Lattice entropy (∝ T³) is negligible below ~2 K and is ignored.
 * Constants: μ_B = 9.274e-24 J/T, k = 1.380649e-23 J/K, R = 8.314 J K⁻¹ mol⁻¹.
 * Simulated clock runs 10× wall time; field ramps at 0.02 T/s (sim); switch relaxation τ = 5 s (sim).
 */
(() => {
  const MUB = 9.274e-24, KB = 1.380649e-23, R = 8.314, J = 3.5, G = 2, BINT = 0.13;
  const CX = (G * MUB) / KB; // x = CX · B_eff / T  (≈ 1.343 K/T)
  const lnsinh = (a) => (a > 20 ? a - Math.LN2 : Math.log(Math.sinh(a)));
  const coth = (a) => (a > 20 ? 1 : 1 / Math.tanh(a));
  const lnZ = (x) => { x = Math.max(x, 1e-9); return lnsinh(((2 * J + 1) * x) / 2) - lnsinh(x / 2); };
  const Jz = (x) => { x = Math.max(x, 1e-9); return ((2 * J + 1) / 2) * coth(((2 * J + 1) * x) / 2) - 0.5 * coth(x / 2); };
  const Sx = (x) => lnZ(x) - x * Jz(x); // S/R, decreasing in x, → ln 8 as x → 0
  const Beff = (B) => Math.hypot(B, BINT);
  const S = (T, B) => Sx((CX * Beff(B)) / T);
  const xOfS = (s) => { // invert S/R(x) by bisection on log x
    let a = Math.log(1e-6), b = Math.log(400);
    for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (Sx(Math.exp(m)) > s) a = m; else b = m; }
    return Math.exp((a + b) / 2);
  };
  const TofS = (s, B) => (CX * Beff(B)) / xOfS(s);
  const mag = (T, B) => (Jz((CX * Beff(B)) / T) / J) * (B / Beff(B)); // ⟨J_z⟩/J along the applied field
  const Tfinal = (Ti, Bi) => (Ti * BINT) / Beff(Bi);
  const SMAX = Math.log(8);

  LABS.giauque = {
    title: '绝热去磁制冷机',
    _math: { S, TofS, mag, Tfinal, Sx, CX, BINT },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const SIM = 10, RAMP = 0.02, TAU = 5;
      const st = { T: 1.5, B: 0.8, Bt: 0.8, sw: true, Tb: 1.5, leak: 0.5, Q: 0, P: 0, s: 0, path: [] };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '盐已在 1.5 K 下充磁（热开关闭合，熵减少的部分作为热量 Q = TΔS 交给了氦浴）。现在断开热开关，再点「缓慢降场」：熵不变，状态水平左移，温度跌到约 0.24 K。时钟加速 ×10。' });
      root.append(stage, controls, readout, hint);
      const plot = h.canvas(stage, { aspect: 0.6, minH: 230, maxH: 380 });
      const spin = h.canvas(stage, { aspect: 0.2, minH: 92, maxH: 120 });

      const tSw = h.toggle({ label: '热开关闭合（接触氦浴）', value: st.sw, onChange: (b) => { st.sw = b; wake(); } });
      const sTb = h.slider({ label: '氦浴温度', min: 1, max: 4.2, step: 0.05, value: st.Tb, format: (v) => v.toFixed(2) + ' K', onInput: (v) => { st.Tb = v; wake(); } });
      const sB = h.slider({ label: '目标磁场', min: 0, max: 1, step: 0.01, value: st.Bt, format: (v) => v.toFixed(2) + ' T', onInput: (v) => { st.Bt = v; wake(); } });
      const sL = h.slider({ label: '漏热', min: 0, max: 5, step: 0.1, value: st.leak, format: (v) => v.toFixed(1) + ' mW/mol', onInput: (v) => { st.leak = v; wake(); } });
      const ramp = (v) => { st.Bt = v; sB.set(v); wake(); };
      const btns = h.el('div', { class: 'ctl' }, [
        h.el('div', {}, [
          h.button({ label: '缓慢升场', onClick: () => ramp(0.8) }),
          h.button({ label: '缓慢降场', onClick: () => ramp(0) }),
          h.button({ label: '重置', onClick: reset }),
        ]),
      ]);
      controls.append(tSw.el, sTb.el, sB.el, sL.el, btns);
      const ro = {
        T: h.readout('盐温 T'), S: h.readout('自旋熵 S/R'), B: h.readout('磁场 B'),
        m: h.readout('磁化 ⟨Jz⟩/J'), Q: h.readout('累计放给浴的热'), P: h.readout('热流 (→浴为正)'),
      };
      Object.values(ro).forEach((r) => readout.append(r.el));

      function reset() {
        st.T = 1.5; st.Tb = 1.5; st.B = 0.8; st.Bt = 0.8; st.sw = true; st.P = 0;
        sTb.set(1.5); sB.set(0.8); tSw.set(true);
        // pre-trace the isothermal magnetization 0 → 0.8 T at 1.5 K
        st.path = []; for (let i = 0; i <= 40; i++) st.path.push([1.5, S(1.5, (0.8 * i) / 40)]);
        st.s = S(1.5, 0.8); st.Q = R * 1.5 * (S(1.5, 0) - st.s);
        wake();
      }

      let dirty = true, idle = 0;
      function step(dtw) {
        const dt = dtw * SIM; let moved = false;
        if (st.B !== st.Bt) { // ramp field at constant S (fast compared to nothing else)
          const d = Math.sign(st.Bt - st.B) * Math.min(Math.abs(st.Bt - st.B), RAMP * dt);
          st.B += d; moved = true;
        }
        let T = TofS(st.s, st.B);
        st.P = 0;
        if (st.sw) { // thermal contact: relax toward bath; heat to bath = −T dS
          const Tn = T + (st.Tb - T) * (1 - Math.exp(-dt / TAU));
          const sn = S(Tn, st.B), dQ = -R * 0.5 * (T + Tn) * (sn - st.s);
          if (Math.abs(sn - st.s) > 1e-7) moved = true;
          st.Q += dQ; st.P = dt > 0 ? dQ / dt : 0; st.s = sn; T = Tn;
        } else if (st.leak > 0) { // adiabatic except for the heat leak: dS = dQ_leak / T
          st.s = Math.min(SMAX - 1e-6, st.s + (st.leak * 1e-3 * dt) / (R * T)); moved = true;
          T = TofS(st.s, st.B); st.P = -st.leak * 1e-3;
        }
        st.T = T;
        if (moved) {
          const last = st.path[st.path.length - 1];
          if (!last || Math.abs(Math.log(last[0] / T)) > 0.004 || Math.abs(last[1] - st.s) > 0.004) st.path.push([T, st.s]);
          if (st.path.length > 3000) st.path.splice(0, 1000);
        }
        return moved;
      }

      const LT0 = Math.log10(0.05), LT1 = Math.log10(5);
      const lg = (T) => Math.log10(Math.min(5, Math.max(0.05, T)));
      function drawPlot() {
        const g = plot.g, W = plot.w, Hh = plot.h, mono = C('--mono-font') || 'monospace';
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const ax = h.axes(g, W, Hh, {
          x0: LT0, x1: LT1, y0: 0, y1: 2.15, pad: { l: 44, r: 12, t: 12, b: 34 },
          xTicks: [0.05, 0.1, 0.2, 0.5, 1, 2, 5].map(Math.log10), yTicks: [0, 0.5, 1, 1.5, 2],
          fmtX: (v) => String(+(10 ** v).toPrecision(2)), fmtY: (v) => v.toFixed(1), xLabel: 'T (K, 对数)', yLabel: 'S / R',
        }, C);
        // ln 8 ceiling
        g.save(); g.setLineDash([4, 4]); g.strokeStyle = C('--muted'); g.beginPath(); g.moveTo(ax.X(LT0), ax.Y(SMAX)); g.lineTo(ax.X(LT1), ax.Y(SMAX)); g.stroke(); g.restore();
        g.font = '10px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillText('ln 8 (2J+1 = 8 个态)', ax.X(LT0) + 4, ax.Y(SMAX) - 2);
        // isofield curves
        const Bs = [[0, '--s1'], [0.2, '--s2'], [0.4, '--s3'], [0.8, '--s4']];
        g.lineWidth = 1.6;
        Bs.forEach(([B, col]) => {
          g.strokeStyle = C(col); g.beginPath();
          for (let i = 0; i <= 160; i++) { const lt = LT0 + ((LT1 - LT0) * i) / 160, s = S(10 ** lt, B); i ? g.lineTo(ax.X(lt), ax.Y(s)) : g.moveTo(ax.X(lt), ax.Y(s)); }
          g.stroke();
          // label where the curve crosses S/R ≈ 1.0
          const sl = { 0: 1.6, 0.2: 1.2, 0.4: 0.8, 0.8: 0.4 }[B]; let lt = LT0; for (let i = 0; i <= 160; i++) { lt = LT0 + ((LT1 - LT0) * i) / 160; if (S(10 ** lt, B) > sl) break; }
          g.fillStyle = C(col); g.textAlign = 'left'; g.textBaseline = 'top';
          g.fillText(B.toFixed(1) + ' T', ax.X(lt) + 5, ax.Y(sl) + 2);
        });
        // bath temperature line
        g.strokeStyle = C('--muted'); g.globalAlpha = 0.6; g.setLineDash([2, 3]);
        g.beginPath(); g.moveTo(ax.X(lg(st.Tb)), ax.p.t); g.lineTo(ax.X(lg(st.Tb)), ax.p.t + ax.ih); g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
        g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.fillText('浴', ax.X(lg(st.Tb)), ax.Y(0) - 2);
        // path
        g.strokeStyle = C('--accent'); g.lineWidth = 2; g.beginPath();
        st.path.forEach(([T, s], i) => (i ? g.lineTo(ax.X(lg(T)), ax.Y(s)) : g.moveTo(ax.X(lg(T)), ax.Y(s))));
        g.stroke();
        // current state
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(ax.X(lg(st.T)), ax.Y(st.s), 5.5, 0, 2 * Math.PI); g.fill(); g.stroke();
      }

      // 40 spins: each has a fixed random direction φ_i; its tilt is (1 − m)·φ_i, plus a little jitter
      let seed = 7; const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const spins = Array.from({ length: 40 }, () => ({ phi: (rnd() * 2 - 1) * Math.PI, w: 0.6 + rnd(), ph: rnd() * 6.28 }));
      function drawSpins(t) {
        const g = spin.g, W = spin.w, Hh = spin.h, mono = C('--mono-font') || 'monospace';
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const m = mag(st.T, st.B), cols = 20, rows = 2, dx = (W - 70) / cols, dy = (Hh - 10) / rows, L = Math.min(dx, dy) * 0.38;
        const jit = ctx.reduced ? 0 : 0.25 * (1 - m) * Math.min(1, st.T);
        g.strokeStyle = C('--fg'); g.fillStyle = C('--fg'); g.lineWidth = 1.4;
        spins.forEach((sp, i) => {
          const cx = 64 + dx * ((i % cols) + 0.5), cy = 5 + dy * (Math.floor(i / cols) + 0.5);
          const a = (1 - m) * sp.phi + jit * Math.sin(sp.w * t * 3 + sp.ph);
          const ux = Math.sin(a), uy = -Math.cos(a);
          g.beginPath(); g.moveTo(cx - ux * L, cy - uy * L); g.lineTo(cx + ux * L, cy + uy * L); g.stroke();
          g.beginPath(); g.moveTo(cx + ux * L, cy + uy * L);
          g.lineTo(cx + ux * L * 0.45 - uy * L * 0.35, cy + uy * L * 0.45 + ux * L * 0.35);
          g.lineTo(cx + ux * L * 0.45 + uy * L * 0.35, cy + uy * L * 0.45 - ux * L * 0.35); g.closePath(); g.fill();
        });
        g.font = '11px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText('Gd³⁺', 6, Hh / 2 - 14); g.fillText('B ↑', 6, Hh / 2 + 2);
        g.fillStyle = C('--accent'); g.fillText((100 * m).toFixed(0) + '%', 6, Hh / 2 + 18);
      }

      function readouts() {
        ro.T.set(st.T.toFixed(3) + ' K');
        ro.S.set(st.s.toFixed(3) + '  (ln 8 = 2.079)');
        ro.B.set(st.B.toFixed(3) + ' T' + (st.B !== st.Bt ? (st.Bt > st.B ? '  ↑ 升场中' : '  ↓ 降场中') : ''));
        ro.m.set(mag(st.T, st.B).toFixed(3));
        ro.Q.set(st.Q.toFixed(2) + ' J/mol');
        ro.P.set((1000 * st.P).toFixed(2) + ' mW/mol' + (st.sw ? '' : '  (开关断开)'));
      }

      let tt = 0;
      const lp = h.loop((dt, t) => {
        tt = t;
        const moved = step(dt);
        if (moved || dirty) { drawPlot(); readouts(); dirty = false; idle = 0; } else idle += dt;
        if (!ctx.reduced || moved) drawSpins(t);
        if (ctx.reduced && !moved && idle > 0.3) lp.stop();
      });
      function wake() { dirty = true; tSw.set(st.sw); if (!lp.running) lp.start(); }
      const redraw = () => { drawPlot(); drawSpins(tt); readouts(); };
      plot.onResize(redraw); spin.onResize(redraw);
      const mo = new MutationObserver(redraw);
      mo.observe(document.documentElement, { attributes: true });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener && mq.addEventListener('change', redraw);
      reset(); redraw(); lp.start();
      return { destroy() { lp.stop(); plot.destroy(); spin.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', redraw); } };
    },
  };
})();
