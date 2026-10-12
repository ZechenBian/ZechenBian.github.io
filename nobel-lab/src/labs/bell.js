/* CHSH 实验台 — Aspect, Clauser, Zeilinger, Nobel Physics 2022
 * Two-channel polarizers (outcomes ±1), settings a, a′ (Alice) and b, b′ (Bob); θ = polarizer angle difference.
 *   量子 |Φ+⟩ = (|HH⟩+|VV⟩)/√2:        E(θ) = cos 2θ                 → max S = 2√2 (Tsirelson) at 0°, 45°, 22.5°, 157.5°
 *   局域·符号模型 (Bell 1964): λ ∈ [0,π) uniform, A = sign cos 2(a−λ):  E(θ) = 1 − 4|θ|/π   → max S = 2
 *   局域·马吕斯模型: shared polarization λ, each photon passes with prob cos²(a−λ) independently: E(θ) = ½ cos 2θ → max S = √2
 * Detection efficiency η per side, no click recorded as +1 (fair counting): E_η = η² E + (1−η)²  (marginals are unbiased),
 *   so S_η = η² S + 2(1−η)²;  quantum S_η > 2 ⇔ η > 2(√2−1) ≈ 0.828.  CHSH game: p_win = 1/2 + S/8.
 */
(() => {
  const D2R = Math.PI / 180, SQ8 = 2 * Math.SQRT2;
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const wrap90 = (d) => { const t = ((d % 180) + 180) % 180; return t >= 90 ? t - 180 : t; };
  const MODELS = {
    qm: { label: '量子（纠缠光子）', E: (t) => Math.cos(2 * t * D2R), col: '--s1' },
    sign: { label: '局域·符号模型', E: (t) => 1 - (4 * Math.abs(wrap90(t))) / 180, col: '--s2' },
    malus: { label: '局域·马吕斯模型', E: (t) => 0.5 * Math.cos(2 * t * D2R), col: '--s3' },
  };
  const PAIRS = [[0, 0], [0, 1], [1, 0], [1, 1]];
  function chsh(model, ang, eta) {
    const E = PAIRS.map(([x, y]) => { const d = wrap90(ang[x] - ang[2 + y]); return { d, E: eta * eta * MODELS[model].E(d) + (1 - eta) ** 2 }; });
    return { E, S: E[0].E + E[1].E + E[2].E - E[3].E };
  }

  LABS.bell = {
    title: 'CHSH 实验台',
    _math: { chsh, MODELS, wrap90 },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n), rnd = mulberry32(1982);
      const NAMES = ['a', 'a′', 'b', 'b′'], COLS = ['--s1', '--s3', '--s2', '--s4'];
      const st = { ang: [0, 45, 22.5, 157.5], model: 'qm', eta: 1, sample: null };
      const stage = h.el('div', { class: 'lab-stage' }), controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '金色竖线是当前的 S。量子关联能进入 2 到 2√2 之间的那一段，两个局域模型无论怎样转偏振片都进不去。拖动圆盘上的偏振片（或用滑块），再把探测效率降到 82.8% 以下试试。' });
      root.append(stage, controls, readout, hint);
      const cvD = h.canvas(stage, { aspect: 0.3, minH: 130, maxH: 180 });
      const cvE = h.canvas(stage, { aspect: 0.45, minH: 200, maxH: 300 });
      const cvG = h.canvas(stage, { aspect: 0.16, minH: 92, maxH: 110 });

      const cM = h.choice({ label: '关联的来源', value: st.model, options: Object.entries(MODELS).map(([k, m]) => ({ value: k, label: m.label })), onChange: (v) => { st.model = v; st.sample = null; draw(); } });
      const sl = NAMES.map((n, k) => h.slider({ label: (k < 2 ? '爱丽丝 ' : '鲍勃 ') + n, min: 0, max: 180, step: 0.5, value: st.ang[k], format: (v) => v.toFixed(1) + '°', onInput: (v) => { st.ang[k] = v; st.sample = null; draw(); } }));
      const sEta = h.slider({ label: '每侧探测效率 η（未响应记 +1）', min: 0.5, max: 1, step: 0.005, value: st.eta, format: (v) => (100 * v).toFixed(1) + '%', onInput: (v) => { st.eta = v; st.sample = null; draw(); } });
      const setAng = (a) => { st.ang = a.slice(); sl.forEach((s, k) => s.set(st.ang[k])); st.sample = null; draw(); };
      const btns = h.el('div', { class: 'ctl' }, h.el('div', {}, [
        h.button({ label: '最优角度', onClick: () => setAng([0, 45, 22.5, 157.5]) }),
        h.button({ label: '随机角度', onClick: () => setAng([0, 1, 2, 3].map(() => Math.round(rnd() * 360) / 2)) }),
        h.button({ label: '抽样 4 × 5000 对', onClick: sample }),
      ]));
      controls.append(cM.el, ...sl.map((s) => s.el), sEta.el, btns);
      const ro = { S: h.readout('S = E(a,b) + E(a,b′) + E(a′,b) − E(a′,b′)'), E: h.readout('四个关联 E'), p: h.readout('游戏胜率 1/2 + S/8'), m: h.readout('抽样结果') };
      Object.values(ro).forEach((r) => readout.append(r.el));

      function sample() { // binomial sampling of P(same) = (1 + E)/2 per setting pair
        const { E } = chsh(st.model, st.ang, st.eta); let S = 0, v = 0;
        E.forEach((q, k) => { const N = 5000, p = (1 + q.E) / 2, n = Math.max(0, Math.min(N, Math.round(N * p + Math.sqrt(N * p * (1 - p)) * gauss(rnd)))), e = (2 * n - N) / N; S += k === 3 ? -e : e; v += Math.max(1e-6, 1 - e * e) / N; });
        st.sample = { S, sig: Math.sqrt(v) }; draw();
      }

      let dialGeo = null;
      function drawDials() {
        const g = cvD.g, W = cvD.w, Hh = cvD.h, mono = C('--mono-font') || 'monospace', r = Math.min(W / 4 - 22, Hh / 2 - 16);
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        dialGeo = [[W / 4, Hh / 2 + 8, r], [(3 * W) / 4, Hh / 2 + 8, r]];
        g.font = '11px ' + mono;
        dialGeo.forEach(([cx, cy, rr], side) => {
          g.strokeStyle = C('--grid'); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rr, 0, 6.283); g.stroke();
          g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(side ? '鲍勃' : '爱丽丝', cx, 2);
          [0, 1].forEach((j) => {
            const k = 2 * side + j, a = st.ang[k] * D2R, dx = Math.cos(a) * rr, dy = -Math.sin(a) * rr;
            g.strokeStyle = C(COLS[k]); g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke();
            g.fillStyle = C(COLS[k]); g.textAlign = dx >= 0 ? 'left' : 'right'; g.textBaseline = 'middle'; g.fillText(NAMES[k], cx + dx * 1.1 + (dx >= 0 ? 3 : -3), cy + dy * 1.1);
          });
          g.fillStyle = C('--fg'); g.beginPath(); g.arc(cx, cy, 3, 0, 6.283); g.fill();
        });
        const x1 = W / 4 + r + 26, x2 = (3 * W) / 4 - r - 26;
        if (x2 - x1 > 44) { g.strokeStyle = C('--accent'); g.setLineDash([3, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(x1, Hh / 2 + 8); g.lineTo(x2, Hh / 2 + 8); g.stroke(); g.setLineDash([]); g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('光子对', W / 2, Hh / 2 + 4); }
      }
      function drawE() {
        const g = cvE.g, W = cvE.w, Hh = cvE.h, mono = C('--mono-font') || 'monospace', { E } = chsh(st.model, st.ang, st.eta);
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const ax = h.axes(g, W, Hh, { x0: -90, x1: 90, y0: -1.1, y1: 1.1, pad: { l: 40, r: 10, t: 14, b: 32 }, xTicks: [-90, -45, 0, 45, 90], yTicks: [-1, -0.5, 0, 0.5, 1], fmtX: (v) => v + '°', fmtY: (v) => String(v), xLabel: '夹角 θ = a − b', yLabel: 'E(θ)' }, C);
        Object.entries(MODELS).forEach(([k, m]) => {
          const on = k === st.model; g.strokeStyle = C(m.col); g.lineWidth = on ? 2.4 : 1.1; g.globalAlpha = on ? 1 : 0.45; g.setLineDash(on ? [] : [4, 4]);
          g.beginPath(); for (let i = 0; i <= 180; i++) { const t = -90 + i, y = st.eta ** 2 * m.E(t) + (1 - st.eta) ** 2; i ? g.lineTo(ax.X(t), ax.Y(y)) : g.moveTo(ax.X(t), ax.Y(y)); } g.stroke();
          g.setLineDash([]); g.globalAlpha = 1;
        });
        E.forEach((q, k) => {
          const x = ax.X(q.d), y = ax.Y(q.E), col = C(k === 3 ? '--warn' : '--accent');
          g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, ax.Y(-1.1)); g.lineTo(x, ax.Y(1.1)); g.stroke(); g.setLineDash([]);
          g.fillStyle = col; g.beginPath(); g.arc(x, y, 4.5, 0, 6.283); g.fill();
        });
        g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = C(MODELS[st.model].col);
        g.fillText(MODELS[st.model].label + (st.eta < 1 ? ' · η = ' + (100 * st.eta).toFixed(1) + '%' : ''), ax.p.l + 6, ax.p.t + 4);
        g.fillStyle = C('--warn'); g.fillText('红点 E(a′,b′) 取负号', ax.p.l + 6, ax.p.t + 18);
      }
      function drawGauge() {
        const g = cvG.g, W = cvG.w, Hh = cvG.h, mono = C('--mono-font') || 'monospace', { S } = chsh(st.model, st.ang, st.eta);
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const l = 18, r = W - 18, X = (s) => l + ((s + 4) / 8) * (r - l), y0 = 30, bh = 20;
        const band = (a, b, col, al) => { g.fillStyle = C(col); g.globalAlpha = al; g.fillRect(X(a), y0, X(b) - X(a), bh); g.globalAlpha = 1; };
        band(-4, 4, '--grid', 0.6); band(-SQ8, SQ8, '--s1', 0.3); band(-2, 2, '--s2', 0.45);
        g.font = '10.5px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
        [-4, -SQ8, -2, 0, 2, SQ8, 4].forEach((s) => { g.fillRect(X(s) - 0.5, y0 + bh, 1, 4); g.fillText(Math.abs(Math.abs(s) - SQ8) < 1e-9 ? (s < 0 ? '−2√2' : '2√2') : String(s).replace('-', '−'), X(s), y0 + bh + 6); });
        g.textBaseline = 'bottom'; g.textAlign = 'left'; g.fillStyle = C('--s2'); g.fillText('局域 |S| ≤ 2', X(-2) + 3, y0 - 3);
        g.textAlign = 'right'; g.fillStyle = C('--s1'); g.fillText('量子 ≤ 2√2', X(SQ8) - 3, y0 - 15);
        g.fillStyle = C('--muted'); g.fillText('无信号 ≤ 4', r, y0 - 3);
        g.strokeStyle = C('--accent'); g.lineWidth = 3; g.beginPath(); g.moveTo(X(S), y0 - 6); g.lineTo(X(S), y0 + bh + 2); g.stroke();
        if (st.sample) { g.fillStyle = C('--fg'); g.beginPath(); g.arc(X(st.sample.S), y0 + bh / 2, 3.5, 0, 6.283); g.fill(); }
      }
      function readouts() {
        const { E, S } = chsh(st.model, st.ang, st.eta);
        ro.S.set(S.toFixed(3) + (Math.abs(S) > 2 + 1e-9 ? '  > 2，违反 CHSH' : '  在局域界内'));
        ro.E.set(E.map((q) => q.E.toFixed(2)).join(' · '));
        ro.p.set((0.5 + S / 8).toFixed(3) + '（经典上限 0.750）');
        ro.m.set(st.sample ? `${st.sample.S.toFixed(3)} ± ${st.sample.sig.toFixed(3)}` : '—');
      }
      function draw() { drawDials(); drawE(); drawGauge(); readouts(); }

      let drag = null;
      function pick(e) {
        const rc = cvD.canvas.getBoundingClientRect(), px = e.clientX - rc.left, py = e.clientY - rc.top;
        const side = px < cvD.w / 2 ? 0 : 1, [cx, cy] = dialGeo[side], ang = ((Math.atan2(-(py - cy), px - cx) / D2R) % 180 + 180) % 180;
        return { side, ang };
      }
      function onDown(e) {
        if (!dialGeo) return; const { side, ang } = pick(e);
        const dist = (k) => Math.abs(wrap90(st.ang[k] - ang));
        drag = dist(2 * side) <= dist(2 * side + 1) ? 2 * side : 2 * side + 1;
        cvD.canvas.setPointerCapture && cvD.canvas.setPointerCapture(e.pointerId); onMove(e);
      }
      function onMove(e) {
        if (drag == null) return; const { ang } = pick(e);
        st.ang[drag] = Math.round(ang * 2) / 2; sl[drag].set(st.ang[drag]); st.sample = null; draw();
      }
      const onUp = () => { drag = null; };
      cvD.canvas.addEventListener('pointerdown', onDown); cvD.canvas.addEventListener('pointermove', onMove);
      cvD.canvas.addEventListener('pointerup', onUp); cvD.canvas.addEventListener('pointercancel', onUp);
      cvD.onResize(draw); cvE.onResize(draw); cvG.onResize(draw);
      const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true });
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', draw);
      draw();
      return { destroy() { cvD.destroy(); cvE.destroy(); cvG.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', draw);
        ['pointerdown', 'pointermove'].forEach((t, i) => cvD.canvas.removeEventListener(t, i ? onMove : onDown)); cvD.canvas.removeEventListener('pointerup', onUp); cvD.canvas.removeEventListener('pointercancel', onUp); } };
    },
  };
})();
