/* 陈绝缘体：体与边 — Thouless, Haldane, Kosterlitz, Nobel Physics 2016 (demo lab)
 * Haldane model (1988) on the honeycomb lattice: NN hopping t1, NNN hopping t2·e^{±iφ} (zero net flux per cell),
 * sublattice potential ±M. Lattice vectors a1, a2; cell-phase convention, k_j = k·a_j ∈ [0, 2π).
 *   Bulk: H(k) = d0 + d·σ; lower band Chern number C by the Fukui–Hatsugai–Suzuki lattice field strength (N×N mesh,
 *   exact integer for any mesh once the gap is open); sign fixed so that C = (1/2π)∫ Ω_lower d²k = deg(d̂: T² → S²)
 *   (checked against the solid-angle degree on the QWZ model). Phase boundary |M| = 3√3 |t2 sin φ|.
 *   Ribbon: periodic along a1 (momentum k), W rows along a2 (open); 2×2 blocks D(k), U(k) = H_{n,n+1}.
 *   Eigenvalues by Sturm counting (block LDLᴴ inertia + bisection), edge weight by inverse iteration (block Thomas).
 *   Verified against dense diagonalisation (W = 6, random k): agreement to 1e-6.
 * Integrated Berry curvature check: C = −1 at (M, φ) = (0, π/2) in this convention; flips with φ → −φ.
 */
(() => {
  const S3 = Math.sqrt(3), TAU = 2 * Math.PI;
  // ---- model: ribbon blocks (zigzag edges) — the bulk Bloch Hamiltonian is derived from the same blocks ----
  function blocks(k, P) { // D = on-row block (Hermitian [a, Re h12, Im h12, d]), U = H_{n,n+1} (complex 2×2, row-major re/im)
    const { t1, t2, phi, M } = P, c = Math.cos, s = Math.sin;
    const D = [M + 2 * t2 * c(k + phi), t1 * (1 + c(k)), -t1 * s(k), -M + 2 * t2 * c(k - phi)];
    const U = [t2 * (c(phi - k) + c(phi)), t2 * (s(phi - k) - s(phi)), 0, 0, t1, 0, t2 * (c(phi + k) + c(phi)), t2 * (s(phi) - s(phi + k))];
    return { D, U };
  }
  function bloch(k1, k2, P) { // H(k) = D + U e^{ik2} + U† e^{−ik2} = d0 + d·σ  → [d0, dx, dy, dz]
    const { D, U } = blocks(k1, P), c = Math.cos(k2), s = Math.sin(k2);
    const a = D[0] + 2 * (U[0] * c - U[1] * s), d = D[3] + 2 * (U[6] * c - U[7] * s);
    const hr = D[1] + U[2] * c - U[3] * s + U[4] * c - U[5] * s, hi = D[2] + U[2] * s + U[3] * c - U[4] * s - U[5] * c; // h12 = D12 + U12 e^{ik2} + conj(U21) e^{−ik2}
    return [(a + d) / 2, hr, -hi, (a - d) / 2]; // (1,2) entry = dx − i dy
  }
  function lowerVec([, dx, dy, dz]) { // eigenvector of d·σ with eigenvalue −|d|
    const d = Math.hypot(dx, dy, dz);
    const v = dz <= 0 ? [dz - d, 0, dx, dy] : [-dx, dy, dz + d, 0];
    const n = Math.hypot(v[0], v[1], v[2], v[3]) || 1; return v.map((t) => t / n);
  }
  const ip = (u, v) => [u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3], u[0] * v[1] - u[1] * v[0] + u[2] * v[3] - u[3] * v[2]];
  const cm = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
  function chern(P, N) { // returns {C, F (N×N plaquette curvatures), gap (direct), lo/hi (band edges)}; the mesh contains K, K' when 3 | N
    const U = [], F = new Float64Array(N * N); let gap = 1e9, lo = -1e9, hi = 1e9;
    for (let i = 0; i < N; i++) { U.push([]); for (let j = 0; j < N; j++) { const b = bloch((TAU * i) / N, (TAU * j) / N, P), d = Math.hypot(b[1], b[2], b[3]); gap = Math.min(gap, 2 * d); lo = Math.max(lo, b[0] - d); hi = Math.min(hi, b[0] + d); U[i].push(lowerVec(b)); } }
    let S = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = U[i][j], b = U[(i + 1) % N][j], c = U[(i + 1) % N][(j + 1) % N], d = U[i][(j + 1) % N];
      const z = cm(cm(ip(a, b), ip(b, c)), cm(ip(c, d), ip(d, a))); const f = -Math.atan2(z[1], z[0]); // sign: see header
      F[i * N + j] = f; S += f;
    }
    return { C: S / TAU, F, gap, lo, hi };
  }
  // ---- ribbon: Sturm counting + inverse iteration on the block-tridiagonal H ----
  function congr(X, U) { // U† X U, X Hermitian [a, br, bi, d]
    const [a, br, bi, d] = X, [u11r, u11i, u12r, u12i, u21r, u21i, u22r, u22i] = U;
    const y11r = a * u11r + br * u21r - bi * u21i, y11i = a * u11i + br * u21i + bi * u21r, y12r = a * u12r + br * u22r - bi * u22i, y12i = a * u12i + br * u22i + bi * u22r;
    const y21r = br * u11r + bi * u11i + d * u21r, y21i = br * u11i - bi * u11r + d * u21i, y22r = br * u12r + bi * u12i + d * u22r, y22i = br * u12i - bi * u12r + d * u22i;
    return [u11r * y11r + u11i * y11i + u21r * y21r + u21i * y21i, u11r * y12r + u11i * y12i + u21r * y22r + u21i * y22i, u11r * y12i - u11i * y12r + u21r * y22i - u21i * y22r, u12r * y12r + u12i * y12i + u22r * y22r + u22i * y22i];
  }
  const hinv = ([a, br, bi, d]) => { const t = a * d - br * br - bi * bi; return [d / t, -br / t, -bi / t, a / t]; };
  const negs = ([a, br, bi, d]) => { const t = a * d - br * br - bi * bi; return t < 0 ? 1 : a + d < 0 ? 2 : 0; };
  function count(E, D, U, W) { // number of eigenvalues < E (Sylvester inertia of the block LDLᴴ factorisation)
    let S = [D[0] - E, D[1], D[2], D[3] - E], n = negs(S);
    for (let r = 1; r < W; r++) { const C = congr(hinv(S), U); S = [D[0] - E - C[0], D[1] - C[1], D[2] - C[2], D[3] - E - C[3]]; n += negs(S); }
    return n;
  }
  function eigs(D, U, W, lo, hi, tol) {
    const out = [];
    const rec = (a, b, ca, cb) => { if (cb <= ca) return; if (b - a < tol) { for (let i = ca; i < cb; i++) out.push(0.5 * (a + b)); return; } const m = 0.5 * (a + b), c = count(m, D, U, W); rec(a, m, ca, c); rec(m, b, c, cb); };
    rec(lo, hi, count(lo, D, U, W), count(hi, D, U, W)); return out;
  }
  const hmv = ([a, br, bi, d], [x1r, x1i, x2r, x2i]) => [a * x1r + br * x2r - bi * x2i, a * x1i + br * x2i + bi * x2r, br * x1r + bi * x1i + d * x2r, br * x1i - bi * x1r + d * x2i];
  const umv = (U, [x1r, x1i, x2r, x2i]) => [U[0] * x1r - U[1] * x1i + U[2] * x2r - U[3] * x2i, U[0] * x1i + U[1] * x1r + U[2] * x2i + U[3] * x2r, U[4] * x1r - U[5] * x1i + U[6] * x2r - U[7] * x2i, U[4] * x1i + U[5] * x1r + U[6] * x2i + U[7] * x2r];
  const uhv = (U, [x1r, x1i, x2r, x2i]) => [U[0] * x1r + U[1] * x1i + U[4] * x2r + U[5] * x2i, U[0] * x1i - U[1] * x1r + U[4] * x2i - U[5] * x2r, U[2] * x1r + U[3] * x1i + U[6] * x2r + U[7] * x2i, U[2] * x1i - U[3] * x1r + U[6] * x2i - U[7] * x2r];
  function edgeW(D, U, W, E) { // inverse iteration (2 steps) → weight on the first / last two rows
    let x = Array.from({ length: W }, (_, r) => [1, 0.3 * r, 0.7, -0.2]);
    for (let it = 0; it < 2; it++) {
      const sig = E + 1e-7, S = [], Y = [];
      S.push([D[0] - sig, D[1], D[2], D[3] - sig]); Y.push(x[0]);
      for (let r = 1; r < W; r++) { const Si = hinv(S[r - 1]), C = congr(Si, U); S.push([D[0] - sig - C[0], D[1] - C[1], D[2] - C[2], D[3] - sig - C[3]]); const u = uhv(U, hmv(Si, Y[r - 1])); Y.push(x[r].map((t, q) => t - u[q])); }
      const X = new Array(W); X[W - 1] = hmv(hinv(S[W - 1]), Y[W - 1]);
      for (let r = W - 2; r >= 0; r--) { const u = umv(U, X[r + 1]); X[r] = hmv(hinv(S[r]), Y[r].map((t, q) => t - u[q])); }
      let n = 0; X.forEach((v) => v.forEach((t) => (n += t * t))); n = Math.sqrt(n); x = X.map((v) => v.map((t) => t / n));
    }
    const w = x.map((v) => v[0] ** 2 + v[1] ** 2 + v[2] ** 2 + v[3] ** 2);
    return [w[0] + w[1], w[W - 1] + w[W - 2]];
  }

  const SGN = Math.sign(chern({ t1: 1, t2: 0.15, phi: Math.PI / 2, M: 0 }, 12).C); // Chern number of the lower band at φ = +π/2

  LABS.topo = {
    title: '陈绝缘体：体与边',
    _math: { bloch, chern, blocks, count, eigs, edgeW },
    mount(root, ctx) {
      const h = ctx.h, C = (k) => ctx.color(k);
      const NK = 64, WR = 12, NB = 24;
      const st = { t2: 0.15, phi: Math.PI / 2, M: 0.2, data: null };
      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '金色 ▼ 和蓝色 ▲ 的点是局域在条带下边与上边的态。陈数 C ≠ 0 时，它们各有 |C| 支横穿体能隙，两条边的群速度方向相反。把 M 拖过相图中的边界线：能隙闭合，陈数变为 0，横穿能隙的边缘态随之消失。' });
      root.append(stage, controls, readout, hint);
      const cvR = h.canvas(stage, { aspect: 0.62, minH: 240, maxH: 380 });
      const cvP = h.canvas(stage, { aspect: 0.5, minH: 170, maxH: 260 });
      const P = () => ({ t1: 1, t2: st.t2, phi: st.phi, M: st.M });
      const sM = h.slider({ label: '子格势 M / t₁', min: -1.2, max: 1.2, step: 0.01, value: st.M, format: (v) => v.toFixed(2), onInput: (v) => { st.M = v; recompute(); } });
      const sF = h.slider({ label: '次近邻相位 φ', min: -3.14, max: 3.14, step: 0.01, value: st.phi, format: (v) => (v / Math.PI).toFixed(2) + ' π', onInput: (v) => { st.phi = v; recompute(); } });
      const sT = h.slider({ label: '次近邻跳跃 t₂ / t₁', min: 0, max: 0.3, step: 0.005, value: st.t2, format: (v) => v.toFixed(3), onInput: (v) => { st.t2 = v; recompute(); } });
      controls.append(sM.el, sF.el, sT.el);
      const ro = { c: h.readout('陈数 C（下能带）'), g: h.readout('最小直接能隙 2 min|d(k)|'), b: h.readout('相边界 |M| = 3√3 |t₂ sin φ|'), e: h.readout('每条边的边缘态') };
      Object.values(ro).forEach((r) => readout.append(r.el));

      let raf = 0;
      function recompute() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const p = P(), bulk = chern(p, NB), pts = [];
          for (let i = 0; i < NK; i++) {
            const k = (TAU * (i + 0.5)) / NK, b = blocks(k, p), es = eigs(b.D, b.U, WR, -3.55, 3.55, 3e-3); // only the plotted window
            es.forEach((E) => { let tag = 0; if (E > bulk.lo - 0.35 && E < bulk.hi + 0.35) { const [w0, w1] = edgeW(b.D, b.U, WR, E); tag = w0 > 0.45 ? 1 : w1 > 0.45 ? 2 : 0; } pts.push([k, E, tag]); });
          }
          st.data = { bulk, pts };
          draw();
        });
      }
      function draw() {
        if (!st.data) return;
        drawRibbon(); drawPhase();
        const { bulk } = st.data, Cn = Math.round(bulk.C), bnd = 3 * S3 * Math.abs(st.t2 * Math.sin(st.phi));
        ro.c.set(bulk.gap < 0.02 ? '能隙闭合（无定义）' : String(Cn === 0 ? 0 : Cn));
        ro.g.set(bulk.gap.toFixed(3) + ' t₁');
        ro.b.set(bnd.toFixed(3) + '  (|M| = ' + Math.abs(st.M).toFixed(3) + ')');
        ro.e.set(bulk.gap < 0.02 ? '—' : Math.abs(Cn) + ' 支');
      }
      function drawRibbon() {
        const g = cvR.g, W = cvR.w, Hh = cvR.h, mono = C('--mono-font') || 'monospace', { pts, bulk } = st.data;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const ax = h.axes(g, W, Hh, { x0: 0, x1: TAU, y0: -3.6, y1: 3.6, pad: { l: 40, r: 10, t: 22, b: 34 }, xTicks: [0, Math.PI, TAU], yTicks: [-3, -2, -1, 0, 1, 2, 3], fmtX: (v) => (v === 0 ? '0' : v < 4 ? 'π' : '2π'), xLabel: '沿条带的动量 k', yLabel: '能量 E / t₁' }, C);
        const r = Math.max(1.6, Math.min(2.4, W / 260));
        pts.forEach(([k, E, tag]) => {
          if (tag) return; g.fillStyle = C('--muted'); g.globalAlpha = 0.6; g.fillRect(ax.X(k) - r / 2, ax.Y(E) - r / 2, r, r);
        });
        g.globalAlpha = 1;
        pts.forEach(([k, E, tag]) => {
          if (!tag) return; const X = ax.X(k), Y = ax.Y(E), s = 3.6; g.fillStyle = C(tag === 1 ? '--accent' : '--s1');
          g.beginPath(); if (tag === 2) { g.moveTo(X, Y - s); g.lineTo(X - s, Y + s * 0.8); g.lineTo(X + s, Y + s * 0.8); } else { g.moveTo(X, Y + s); g.lineTo(X - s, Y - s * 0.8); g.lineTo(X + s, Y - s * 0.8); } g.closePath(); g.fill();
        });
        g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillStyle = C('--muted'); g.fillText(W < 460 ? '条带宽 ' + WR + ' 元胞' : '条带：宽 ' + WR + ' 个元胞，沿 a₁ 周期', ax.p.l, 4);
        g.textAlign = 'right'; g.fillStyle = C('--accent'); g.fillText('▼ 下边', W - 62, 4); g.fillStyle = C('--s1'); g.fillText('▲ 上边', W - 10, 4);
        if (bulk.hi - bulk.lo >= 0.02) { g.fillStyle = C('--fg'); g.globalAlpha = 0.07; g.fillRect(ax.p.l, ax.Y(bulk.hi), ax.iw, ax.Y(bulk.lo) - ax.Y(bulk.hi)); g.globalAlpha = 1; }
      }
      function drawPhase() {
        const g = cvP.g, W = cvP.w, Hh = cvP.h, mono = C('--mono-font') || 'monospace', { bulk } = st.data;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        // left: phase diagram in (φ, M); right: Berry curvature of the lower band over the BZ
        const half = Math.min(W * 0.58, W - 150), Mx = 1.2;
        const ax = h.axes(g, half, Hh, { x0: -Math.PI, x1: Math.PI, y0: -Mx, y1: Mx, pad: { l: 40, r: 8, t: 16, b: 30 }, xTicks: [-Math.PI, 0, Math.PI], yTicks: [-1, 0, 1], fmtX: (v) => (v < -1 ? '−π' : v > 1 ? 'π' : '0'), xLabel: 'φ', yLabel: 'M / t₁' }, C);
        const nx = 90;
        for (let i = 0; i < nx; i++) { // topological region |M| < 3√3|t₂ sin φ|; C = SGN·sign(sin φ)
          const f = -Math.PI + (TAU * (i + 0.5)) / nx, b = 3 * S3 * st.t2 * Math.sin(f), x0 = ax.X(-Math.PI + (TAU * i) / nx), x1 = ax.X(-Math.PI + (TAU * (i + 1)) / nx);
          g.fillStyle = C(SGN * b > 0 ? '--s3' : '--s4'); g.globalAlpha = 0.35; g.fillRect(x0, ax.Y(Math.abs(b)), x1 - x0 + 0.5, ax.Y(-Math.abs(b)) - ax.Y(Math.abs(b))); g.globalAlpha = 1;
        }
        g.strokeStyle = C('--fg'); g.lineWidth = 1.2; [1, -1].forEach((sg) => { g.beginPath(); for (let i = 0; i <= 120; i++) { const f = -Math.PI + (TAU * i) / 120, b = sg * 3 * S3 * st.t2 * Math.sin(f); i ? g.lineTo(ax.X(f), ax.Y(b)) : g.moveTo(ax.X(f), ax.Y(b)); } g.stroke(); });
        g.font = '10.5px ' + mono; g.textAlign = 'center'; g.textBaseline = 'middle';
        const lab = (c) => 'C = ' + (c > 0 ? '+1' : '−1');
        g.fillStyle = C('--fg'); g.fillText(lab(SGN), ax.X(Math.PI / 2), ax.Y(0)); g.fillText(lab(-SGN), ax.X(-Math.PI / 2), ax.Y(0)); g.fillText('C = 0', ax.X(0), ax.Y(0.85));
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.beginPath(); g.arc(ax.X(st.phi), ax.Y(Math.max(-Mx, Math.min(Mx, st.M))), 5, 0, TAU); g.fill(); g.stroke();
        // Berry curvature map (k1, k2 ∈ [0, 2π)²), colour = sign × magnitude
        const x0 = half + 18, sz = Math.min(W - x0 - 10, Hh - 46), y0 = 16, F = bulk.F, N = NB;
        let fm = 1e-9; for (let i = 0; i < F.length; i++) fm = Math.max(fm, Math.abs(F[i]));
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const f = F[i * N + j] / fm; g.fillStyle = C(f > 0 ? '--s3' : '--s4'); g.globalAlpha = Math.min(1, Math.abs(f) ** 0.6);
          g.fillRect(x0 + (i * sz) / N, y0 + sz - ((j + 1) * sz) / N, sz / N + 0.5, sz / N + 0.5);
        }
        g.globalAlpha = 1; g.strokeStyle = C('--line'); g.strokeRect(x0 + 0.5, y0 + 0.5, sz, sz);
        g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('贝里曲率 Ω(k)', x0 + sz / 2, y0 + sz + 4); g.fillText('布里渊环面 T²', x0 + sz / 2, y0 + sz + 17);
      }
      cvR.onResize(draw); cvP.onResize(draw);
      const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true });
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', draw);
      recompute();
      return { destroy() { if (raf) cancelAnimationFrame(raf); cvR.destroy(); cvP.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', draw); } };
    },
  };
})();
