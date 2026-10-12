/* 平面上的旋涡与链的两端 — Thouless, Haldane, Kosterlitz, Nobel Physics 2016 (challenge)
 * Stage 1 转一圈: 16×16 XY spin field, three planted vortices (+1 at (4.5,5.5), −1 at (9.5,10.5), +1 at (11.5,4.5)) on a
 *   smooth background, open boundary. Loops ①–④ measure windings (Σ wrapped neighbour differences / 2π). The reader
 *   predicts the boundary winding (= 1). T = 0 relaxation θ_i ← arg Σ_j e^{iθ_j} (boundary pinned) annihilates a ± pair;
 *   one +1 vortex must remain (lattice Stokes: Σ plaquette windings = boundary winding, exactly).
 * Stage 2 能量与熵: ideal vortex θ = φ on a disk of radius R (square lattice, J = 1): E(R) computed numerically
 *   (slope in ln R → π). S = k ln(πR²) ⇒ F(R) flat at T* = πJ/2k ≈ 1.571. Then live Metropolis MC (L = 24, periodic)
 *   and helicity-modulus data Υ(T) for L = 24 (precomputed by the author: Metropolis + over-relaxation, 2000 equilibration
 *   sweeps, 1.2–2×10⁴ measurement sweeps per point, 20 bins). Crossing with 2T/π at ≈ 0.93 for L = 24;
 *   L → ∞: T_KT = 0.8929 J/k_B (Hasenbusch 2005).
 * Stage 3 链的两端: open SSH chain, N = 20 cells, hoppings v (A_n–B_n), w (B_n–A_{n+1}), u (B_n–A_{n+2});
 *   h(k) = v + w e^{ik} + u e^{2ik}; winding = number of zeros of h(z) in |z| < 1 = zero modes per end.
 */
(() => {
  const R = String.raw;
  const TAU = 2 * Math.PI, wrap = (d) => d - TAU * Math.round(d / TAU);
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function watchTheme(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-topo')) return;
    const s = document.createElement('style'); s.id = 'st-topo';
    s.textContent = `
.topo-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px;margin-top:4px}
.topo-sec[hidden]{display:none}
.topo-sec h4{margin:0;font-size:14px}
.topo-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.topo-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}
.topo-row>div{min-width:0}`;
    document.head.append(s);
  }
  // needle (spin arrow) centred at (x, y), length 2r, angle t (screen coordinates, y down)
  function needle(g, x, y, t, r) {
    const c = Math.cos(t), s = Math.sin(t);
    g.beginPath(); g.moveTo(x - c * r, y - s * r); g.lineTo(x + c * r, y + s * r); g.stroke();
    g.beginPath(); g.moveTo(x + c * r, y + s * r); g.lineTo(x + c * r * 0.35 - s * r * 0.4, y + s * r * 0.35 + c * r * 0.4); g.lineTo(x + c * r * 0.35 + s * r * 0.4, y + s * r * 0.35 - c * r * 0.4); g.closePath(); g.fill();
  }

  /* ---------- Stage 1: winding numbers ---------- */
  const L1 = 16, DEF = [[4.5, 5.5, 1], [9.5, 10.5, -1], [11.5, 4.5, 1]];
  const LOOPS = [null, [3, 4, 6, 7], [8, 9, 11, 12], [10, 3, 13, 6], [3, 4, 10, 12], [0, 0, 15, 15]];
  const MARK = ['', '①', '②', '③', '④', '⑤'];
  function field1() {
    const th = new Float64Array(L1 * L1);
    for (let y = 0; y < L1; y++) for (let x = 0; x < L1; x++) {
      let t = 0.35 * Math.sin(0.5 * x + 0.3) + 0.25 * Math.cos(0.4 * y - 0.6);
      for (const [cx, cy, q] of DEF) t += q * Math.atan2(y - cy, x - cx);
      th[y * L1 + x] = t;
    }
    return th;
  }
  function loopSites([x0, y0, x1, y1]) { // top edge →, right edge ↓, bottom ←, left ↑ (same orientation as a plaquette)
    const p = [];
    for (let x = x0; x < x1; x++) p.push([x, y0]);
    for (let y = y0; y < y1; y++) p.push([x1, y]);
    for (let x = x1; x > x0; x--) p.push([x, y1]);
    for (let y = y1; y > y0; y--) p.push([x0, y]);
    return p;
  }
  function trace(th, p) { const acc = [0]; let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += wrap(th[b[1] * L1 + b[0]] - th[a[1] * L1 + a[0]]); acc.push(s); } return acc; }
  function vort1(th) {
    const v = [];
    for (let y = 0; y < L1 - 1; y++) for (let x = 0; x < L1 - 1; x++) {
      const a = y * L1 + x, w = wrap(th[a + 1] - th[a]) + wrap(th[a + L1 + 1] - th[a + 1]) + wrap(th[a + L1] - th[a + L1 + 1]) + wrap(th[a] - th[a + L1]);
      const q = Math.round(w / TAU); if (q) v.push([x + 0.5, y + 0.5, q]);
    }
    return v;
  }
  function relax1(th) { // one T = 0 sweep, boundary spins fixed
    for (let y = 1; y < L1 - 1; y++) for (let x = 1; x < L1 - 1; x++) {
      const i = y * L1 + x;
      const sx = Math.cos(th[i - 1]) + Math.cos(th[i + 1]) + Math.cos(th[i - L1]) + Math.cos(th[i + L1]);
      const sy = Math.sin(th[i - 1]) + Math.sin(th[i + 1]) + Math.sin(th[i - L1]) + Math.sin(th[i + L1]);
      th[i] = Math.atan2(sy, sx);
    }
  }

  function stage1(ctx) {
    return {
      title: '转一圈',
      task: R`<p>1972 年，伯明翰。考虑平面上的“XY 自旋”：每个格点上有一根只能在平面内转动的小箭头，角度为 $\theta_i$；相邻箭头倾向于平行，能量 $E = -J\sum_{\langle ij\rangle}\cos(\theta_i - \theta_j)$。下图是一张示意的低温自旋构型（为教学而构造）：箭头大体平滑地变化，但有几处不对劲。</p>
<p>选一条回路，沿图中标出的方向走一圈，累计自旋转过的角度。相邻两格之间的转角取 $-180^\circ$ 到 $180^\circ$ 之间的那个值，与你行走方向同向的转动记为正。结果总是 $360^\circ$ 的整数倍，这个整数叫回路的<b>绕数</b>。测完 ①–④ 后回答：沿整块样品的边界（最外一圈格点）走一圈，绕数是多少？</p>`,
      hints: [
        R`回路 ④ 恰好把 ① 和 ② 围在一起。比较 ④ 的绕数与 ①、② 的绕数。`,
        R`绕数可以相加：把一条回路围住的区域切成小格，相邻小格的公共边被正反各走一次，贡献抵消，所以大回路的绕数等于其中各个小格绕数之和。先找出图中所有的“缺陷”。`,
        R`图中只有 ①、②、③ 三处缺陷，绕数分别为 $+1$、$-1$、$+1$，边界把它们全部围住：$1 - 1 + 1 = 1$。`,
      ],
      answer: R`①、③ 的绕数为 $+1$，② 为 $-1$，④ 围住 ① 和 ②，绕数为 $0$。绕数对区域可加：内部每条边被相邻两个小格正反各走一次，所以边界绕数等于所有小格（缺陷）绕数之和，$1 - 1 + 1 = 1$。数学上，回路 $\gamma\cong S^1$ 上的自旋方向是一个映射 $S^1\to S^1$，绕数是它的映射度，连续形变下不变。“抹平”时边界固定，边界绕数始终为 1，所以内部至少要剩下一个 $+1$ 缺陷；② 与 ③ 这一对 $\mp1$ 则可以相遇并湮灭。`,
      build(body, api) {
        const h = H, C = (k) => ctx.color(k);
        const th0 = field1();
        let th = Float64Array.from(th0), sel = 1, sweeps = 0, showDef = false, okA = false, okQ = false, anim = null;
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.8, minH: 250, maxH: 430 });
        const cvT = h.canvas(stg, { aspect: 0.26, minH: 112, maxH: 160 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const cL = h.choice({ label: '回路', value: 1, options: [1, 2, 3, 4].map((i) => ({ value: i, label: MARK[i] })), onChange: (v) => { sel = v; update(); } });
        ctl.append(cL.el);
        const roW = h.el('div', { class: 'lab-readout' }); body.append(roW);
        const ro = { n: h.readout('回路上的格点'), a: h.readout('自旋累计转过') };
        roW.append(ro.n.el, ro.a.el);
        const finish = () => { if (okA && okQ) api.done(R`<b>拓扑缺陷与绕数</b>：沿闭合回路，自旋方向给出一个映射 $S^1\to S^1$，它的映射度（绕数）是整数，对区域可加，在连续形变下不变。孤立的涡旋因此无法被“抹平”，只能与绕数相反的反涡旋成对湮灭。`); };
        const a1 = H.answer({
          label: '不用测量，预言：沿样品边界（最外一圈格点）走一圈，绕数 = ?', placeholder: '整数',
          check: (v) => {
            if (v === 1) return { ok: true, msg: '对：1 − 1 + 1 = 1。下面验证它，然后试着把缺陷“抹平”。' };
            if (v === 3) return { ok: false, msg: '符号要算进去：② 处箭头转动的方向与行走方向相反。' };
            if (v === 0) return { ok: false, msg: '④ 的结果是 0，但边界还围住了 ③。' };
            if (v === -1) return { ok: false, msg: '正负号反了：①、③ 与行走方向同向。' };
            if (Math.abs(v - 360) < 1) return { ok: false, msg: '这是角度；绕数是它除以 360°。' };
            return { ok: false, msg: '不对。先分别测出 ①、②、③ 的绕数，再想想大回路与小回路的关系。' };
          },
          onOk: () => { okA = true; sec.hidden = false; api.typeset(sec); },
        });
        body.append(a1.el);
        const sec = h.el('div', { class: 'topo-sec', hidden: true }); body.append(sec);
        const ctl2 = h.el('div', { class: 'lab-controls' });
        const bRelax = h.button({ label: '抹平 ▶', onClick: relaxStart });
        ctl2.append(h.el('div', { class: 'ctl' }, [h.el('div', {}, [
          h.button({ label: '验证：沿边界走一圈 ⑤', onClick: () => { sel = 5; cL.set(5); update(); } }),
          bRelax, h.button({ label: '复原', onClick: restore }),
        ])]));
        const roW2 = h.el('div', { class: 'lab-readout' });
        const ro2 = { s: h.readout('抹平的步数'), v: h.readout('内部缺陷（+1 / −1）') };
        roW2.append(ro2.s.el, ro2.v.el);
        const quiz = H.quiz({
          question: '反复抹平之后，±1 的一对缺陷相遇消失了，但总有一个 +1 缺陷留下来。为什么它消失不了？',
          options: [
            { label: '它的能量比周围低，抹平推不动它', ok: false, why: '恰好相反：缺陷周围的箭头扭曲得最厉害，能量最高。阻止它消失的不是能量。' },
            { label: '边界上的绕数是 1；所有小格的绕数之和恒等于边界绕数，而抹平不改变边界', ok: true, why: R`对。这是离散的斯托克斯公式。连续情形就是映射度的同伦不变性：若自旋场能在整个圆盘上连续地定义而没有缺陷，边界映射 $S^1\to S^1$ 就可以连续收缩成常值映射，绕数只能是 0。` },
            { label: '格子太小，缺陷走不出去', ok: false, why: '固定边界时，换成更大的格子它也不会消失。若边界是自由的，缺陷确实可以从边上“走出去”，那时边界绕数也随之改变。' },
            { label: '数值误差', ok: false, why: '绕数是整数，每一步弛豫都精确守恒，与计算精度无关。' },
          ],
          onOk: () => { okQ = true; finish(); },
        });
        sec.append(h.el('h4', { text: '抹平' }),
          h.el('p', { class: 'topo-note', html: '让每个内部自旋反复转向四个邻居的平均方向（相当于 T = 0 的弛豫；最外一圈固定不动）。图中标出每个绕数不为零的小格：圆点为 +1，方块为 −1。' }),
          ctl2, roW2, quiz.el);

        function relaxStart() {
          showDef = true;
          if (ctx.reduced) { for (let k = 0; k < 300; k++) relax1(th); sweeps += 300; update(); return; }
          if (anim) return;
          let left = 300;
          anim = h.loop(() => { relax1(th); sweeps++; left--; update(); if (left <= 0) { anim.stop(); anim = null; } }).start();
        }
        function restore() { if (anim) { anim.stop(); anim = null; } th = Float64Array.from(th0); sweeps = 0; update(); }
        function geo() { const W = cv.w, Hh = cv.h, s = Math.min((W - 16) / L1, (Hh - 16) / L1); return { s, x0: (W - s * L1) / 2, y0: (Hh - s * L1) / 2 }; }
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, G = geo(), s = G.s, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const P = (x, y) => [G.x0 + (x + 0.5) * s, G.y0 + (y + 0.5) * s];
          const lp = LOOPS[sel], p = loopSites(lp), on = new Set(p.map(([x, y]) => y * L1 + x));
          g.strokeStyle = C('--accent'); g.lineWidth = 2; g.globalAlpha = 0.45; g.beginPath();
          p.forEach(([x, y], i) => { const [X, Y] = P(x, y); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.stroke(); g.globalAlpha = 1;
          const [x0, y0, x1, y1] = lp, ch = Math.max(4, s * 0.28);
          g.fillStyle = C('--accent');
          [[(x0 + x1) / 2, y0, 1, 0], [x1, (y0 + y1) / 2, 0, 1], [(x0 + x1) / 2, y1, -1, 0], [x0, (y0 + y1) / 2, 0, -1]].forEach(([x, y, dx, dy]) => {
            const [X, Y] = P(x, y); g.beginPath(); g.moveTo(X + dx * ch, Y + dy * ch); g.lineTo(X - dx * ch * 0.6 - dy * ch * 0.7, Y - dy * ch * 0.6 + dx * ch * 0.7); g.lineTo(X - dx * ch * 0.6 + dy * ch * 0.7, Y - dy * ch * 0.6 - dx * ch * 0.7); g.closePath(); g.fill();
          });
          g.font = Math.round(Math.max(11, s * 0.6)) + 'px ' + mono; g.textAlign = 'center'; g.textBaseline = 'middle';
          const [lx, ly] = P(x0 - 0.5, y0 - 0.5); g.fillText(MARK[sel], Math.max(8, lx), Math.max(8, ly));
          for (let y = 0; y < L1; y++) for (let x = 0; x < L1; x++) {
            const i = y * L1 + x, [X, Y] = P(x, y), hl = on.has(i);
            g.strokeStyle = g.fillStyle = hl ? C('--accent') : C('--fg'); g.lineWidth = hl ? 2 : 1.2;
            needle(g, X, Y, th[i], s * 0.36);
          }
          if (showDef) for (const [vx, vy, q] of vort1(th)) {
            const X = G.x0 + (vx + 0.5) * s, Y = G.y0 + (vy + 0.5) * s, r = s * 0.3;
            g.fillStyle = q > 0 ? C('--warn') : C('--s1'); g.strokeStyle = C('--panel'); g.lineWidth = 1.5;
            g.beginPath(); q > 0 ? g.arc(X, Y, r, 0, TAU) : g.rect(X - r, Y - r, 2 * r, 2 * r); g.fill(); g.stroke();
          }
        }
        function drawTrace() {
          const g = cvT.g, W = cvT.w, Hh = cvT.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const p = loopSites(LOOPS[sel]), acc = trace(th, p).map((r) => (r * 180) / Math.PI), n = p.length;
          const ax = h.axes(g, W, Hh, { x0: 0, x1: n, y0: -480, y1: 480, pad: { l: 46, r: 14, t: 8, b: 30 }, xTicks: [0, Math.round(n / 2), n], yTicks: [-360, 0, 360], xLabel: '沿回路走过的格数', yLabel: '累计转角 (°)' }, C);
          g.strokeStyle = C('--accent'); g.lineWidth = 2; g.beginPath();
          acc.forEach((a, i) => { const X = ax.X(i), Y = ax.Y(Math.max(-480, Math.min(480, a))); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
          g.font = '11px ' + mono; g.fillStyle = C('--accent'); g.textAlign = 'right'; g.textBaseline = 'bottom';
          g.fillText(MARK[sel] + ' ' + (acc[n] >= 0 ? '+' : '') + acc[n].toFixed(0) + '°', W - 18, ax.Y(acc[n]) - 3);
          ro.n.set(MARK[sel] + ' ' + n + ' 个');
          ro.a.set((acc[n] >= 0 ? '+' : '') + acc[n].toFixed(1) + '°');
        }
        function update() {
          draw(); drawTrace();
          const v = vort1(th);
          ro2.s.set(String(sweeps));
          ro2.v.set(v.filter((x) => x[2] > 0).length + ' / ' + v.filter((x) => x[2] < 0).length);
        }
        cv.onResize(update); cvT.onResize(update);
        const un = watchTheme(update);
        update();
        return { destroy() { if (anim) anim.stop(); cv.destroy(); cvT.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 2: energy versus entropy, then Monte Carlo ---------- */
  // ideal vortex energy on a disk of radius R (sites with |r − c| ≤ R, c = plaquette centre), J = 1
  const ER = [[4, 8.323], [6, 9.579], [8, 10.595], [11, 11.577], [16, 12.773], [23, 13.912], [32, 14.962], [45, 16.037], [64, 17.147], [91, 18.253], [128, 19.327], [181, 20.417], [256, 21.507]];
  // helicity modulus Υ/J for L = 24 (T in J/k_B): [T, Υ, standard error]
  const UPS = [[0.5, 0.857, 0.001], [0.55, 0.84, 0.001], [0.6, 0.82, 0.001], [0.65, 0.8, 0.001], [0.7, 0.778, 0.001], [0.75, 0.752, 0.001], [0.8, 0.72, 0.001], [0.85, 0.683, 0.002], [0.86, 0.675, 0.002], [0.88, 0.652, 0.002], [0.9, 0.627, 0.006], [0.92, 0.604, 0.005], [0.94, 0.567, 0.004], [0.96, 0.524, 0.007], [0.98, 0.48, 0.006], [1.0, 0.436, 0.014], [1.05, 0.287, 0.014], [1.1, 0.145, 0.014], [1.15, 0.048, 0.011], [1.2, 0.014, 0.005], [1.3, 0, 0.007], [1.4, 0.001, 0.005], [1.5, 0.001, 0.004]];
  function makeXY(L, seed) { // periodic L×L XY model, Metropolis + over-relaxation
    const N = L * L, th = new Float64Array(N), rnd = mulberry32(seed);
    const Rn = new Int32Array(N), Ln = new Int32Array(N), Dn = new Int32Array(N), Un = new Int32Array(N);
    for (let i = 0; i < N; i++) { Rn[i] = i % L === L - 1 ? i - L + 1 : i + 1; Ln[i] = i % L === 0 ? i + L - 1 : i - 1; Dn[i] = (i + L) % N; Un[i] = (i - L + N) % N; th[i] = rnd() * TAU; }
    function sweep(T) {
      const d = Math.min(Math.PI, 0.5 + T);
      for (let i = 0; i < N; i++) {
        const o = th[i], n = o + (2 * rnd() - 1) * d, a = th[Rn[i]], b = th[Ln[i]], c = th[Dn[i]], e = th[Un[i]];
        const dE = Math.cos(o - a) + Math.cos(o - b) + Math.cos(o - c) + Math.cos(o - e) - Math.cos(n - a) - Math.cos(n - b) - Math.cos(n - c) - Math.cos(n - e);
        if (dE <= 0 || rnd() < Math.exp(-dE / T)) th[i] = wrap(n);
      }
    }
    function over() {
      for (let i = 0; i < N; i++) {
        const sx = Math.cos(th[Rn[i]]) + Math.cos(th[Ln[i]]) + Math.cos(th[Dn[i]]) + Math.cos(th[Un[i]]);
        const sy = Math.sin(th[Rn[i]]) + Math.sin(th[Ln[i]]) + Math.sin(th[Dn[i]]) + Math.sin(th[Un[i]]);
        th[i] = wrap(2 * Math.atan2(sy, sx) - th[i]);
      }
    }
    function vortices() { // plaquette charges; a vortex is "bound" if an opposite one lies within 2 lattice spacings
      const v = [];
      for (let i = 0; i < N; i++) {
        const b = Rn[i], c = Dn[b], d = Dn[i];
        const q = Math.round((wrap(th[b] - th[i]) + wrap(th[c] - th[b]) + wrap(th[d] - th[c]) + wrap(th[i] - th[d])) / TAU);
        if (q) v.push({ x: (i % L) + 0.5, y: Math.floor(i / L) + 0.5, q, p: -1 });
      }
      v.forEach((a) => {
        let best = 9, bi = -1;
        v.forEach((b, j) => { if (b.q !== -a.q) return; let dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y); dx = Math.min(dx, L - dx); dy = Math.min(dy, L - dy); const r = Math.hypot(dx, dy); if (r < best) { best = r; bi = j; } });
        if (best <= 2.01) a.p = bi;
      });
      return v;
    }
    return { L, N, th, sweep, over, vortices, hot() { for (let i = 0; i < N; i++) th[i] = rnd() * TAU; }, cold() { th.fill(0); } };
  }

  function stage2(ctx) {
    return {
      title: '能量与熵',
      task: R`<p>Mermin–Wagner 定理（1966）说：二维 XY 模型在任何 $T\gt 0$ 下都没有长程序，箭头的平均方向 $\langle e^{i\theta}\rangle = 0$。可是自旋关联在低温下只按幂律衰减，在高温下按指数衰减，两者之间似乎应该有一个相变。Kosterlitz 与 Thouless 想到上一关的缺陷（<b>涡旋</b>）：它会不会在某个温度突然“自由”起来？</p>
<p>下图的点是在半径为 $R$（以格距 $a$ 为单位）的圆盘中心放一个理想涡旋 $\theta = \arg(\mathbf r)$ 时，在正方格子上算出的能量 $E(R)$（取 $J = 1$）。涡旋中心可以放在盘内约 $\pi R^2/a^2$ 个位置中的任何一个，因此它带有熵 $S = k_B\ln(\pi R^2/a^2)$。调节温度，观察自由能 $F = E - TS$ 怎样随 $R$ 变化，找出孤立涡旋开始变得有利的温度 $T^*$。</p>`,
      hints: [
        R`横轴是对数刻度。$E(R)$ 在这张图上近似是一条直线：每当 $R$ 增大 $e$ 倍，$E$ 增加多少？熵 $S/k_B = \ln\pi + 2\ln R$ 的斜率是 2。`,
        R`$|\nabla\theta| = 1/r$，所以 $E = \tfrac J2\int|\nabla\theta|^2\,d^2r = \pi J\ln(R/a) + E_c$。于是 $F = (\pi J - 2k_BT)\ln(R/a) + \text{常数}$，斜率在 $T^* = \pi J/2k_B \approx 1.57$ 处变号。`,
        R`模拟中的转变温度比 $T^*$ 低：在大尺度上起作用的不是 $J$，而是被热涨落削弱后的刚度 $\Upsilon(T)$。判据变成 $\pi\Upsilon(T) = 2k_BT$，在图上就是数据与直线 $2T/\pi$ 的交点，$L = 24$ 时约为 0.93。`,
      ],
      answer: R`理想涡旋的能量 $E = \pi J\ln(R/a) + E_c$（格点数据的斜率约 3.15，趋于 $\pi$），熵 $S = k_B\ln(\pi R^2/a^2) = 2k_B\ln(R/a) + \text{常数}$，所以 $F = (\pi J - 2k_BT)\ln(R/a) + \cdots$。$T\lt T^* = \pi J/2k_B \approx 1.57\,J/k_B$ 时 $F$ 随 $R$ 增大，孤立涡旋不会出现，涡旋只以紧束缚的正负对存在；$T\gt T^*$ 时自由涡旋大量出现。蒙特卡洛显示真实的转变更低：束缚的涡旋对和自旋波把大尺度上的有效刚度从 $J$ 降为 $\Upsilon(T)$。自洽的判据是 $\pi\Upsilon(T_{\rm KT}) = 2k_BT_{\rm KT}$，$L = 24$ 的数据交于约 0.93，无限大格子的值是 $0.893\,J/k_B$。在 $T_{\rm KT}$ 处 $\Upsilon$ 从 $2k_BT_{\rm KT}/\pi$ 跳到 0（Nelson–Kosterlitz 普适跳变；有限格子中跳变被抹圆）。`,
      build(body, api) {
        const h = H, C = (k) => ctx.color(k);
        const st = { T: 0.8, Tm: 0.8, run: false, okA: false, okQ: false, sw: 0, rv: 0, rf: 0 };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cvF = h.canvas(stg, { aspect: 0.6, minH: 230, maxH: 360 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sT = h.slider({ label: '温度 k_BT / J', min: 0.2, max: 3, step: 0.01, value: st.T, format: (v) => v.toFixed(2), onInput: (v) => { st.T = v; drawF(); } });
        ctl.append(sT.el);
        const roW = h.el('div', { class: 'lab-readout' }); body.append(roW);
        const ro = { d: h.readout('F(256a) − F(4a)'), s: h.readout('孤立涡旋') };
        roW.append(ro.d.el, ro.s.el);
        const a1 = H.answer({
          label: R`孤立涡旋开始变得有利的温度 $T^*$ = ?（单位 $J/k_B$，容差 ±6%）`, placeholder: 'T*',
          check: (v) => {
            setTimeout(() => api.typeset(a1.el), 0);
            if (Math.abs(v - Math.PI / 2) <= 0.094) return { ok: true, msg: R`对：$T^* = \pi J/2k_B \approx 1.571$。能量与熵都随 $\ln R$ 增长，系数相等时两者打平。这是 Kosterlitz 与 Thouless 的估计。下面用模拟检验它。` };
            if (Math.abs(v - Math.PI) < 0.2) return { ok: false, msg: '这是能量随 ln R 增长的斜率（πJ）。还要和熵的斜率 2k_B 比较。' };
            if (Math.abs(v - Math.PI / 4) < 0.08) return { ok: false, msg: '熵是位置数的对数，位置数 ∝ R²，所以熵的斜率是 2，不是 4。' };
            return { ok: false, msg: '不对。在图上找 F(R) 变平的温度，或者比较 E 与 TS 随 ln R 增长的速率。' };
          },
          onOk: () => { st.okA = true; sec.hidden = false; api.typeset(sec); if (!ctx.reduced) setRun(true); drawU(); },
        });
        body.append(a1.el);

        // Part B: Monte Carlo + stiffness
        const sec = h.el('div', { class: 'topo-sec', hidden: true }); body.append(sec);
        const xy = makeXY(24, 2016);
        const row = h.el('div', { class: 'topo-row' }); const c1 = h.el('div'), c2 = h.el('div'); row.append(c1, c2);
        const ctl2 = h.el('div', { class: 'lab-controls' });
        const roW2 = h.el('div', { class: 'lab-readout' });
        const ro2 = { v: h.readout('涡旋密度（每格）'), f: h.readout('自由涡旋密度'), n: h.readout('已扫描') };
        Object.values(ro2).forEach((r) => roW2.append(r.el));
        sec.append(h.el('h4', { text: '模拟' }),
          h.el('p', { class: 'topo-note', html: R`第一幅图：$24\times24$ 周期格子上的蒙特卡洛模拟（Metropolis 加过松弛更新）。圆点为 +1 涡旋，方块为 −1，短线连接相距不超过 2 格的正负对，带圈的是附近没有反涡旋的“自由”涡旋。第二幅图：预先用长时间模拟测得的自旋刚度（螺旋模量）$\Upsilon(T)$，即在边界上施加一个小的整体扭转 $\delta$ 时自由能增加 $\tfrac12\Upsilon\delta^2$ 中的系数；$T = 0$ 时 $\Upsilon = J$。` }),
          row, ctl2, roW2);
        const cvM = h.canvas(c1, { aspect: 1, minH: 230, maxH: 330 });
        const cvU = h.canvas(c2, { aspect: 1, minH: 230, maxH: 330 });
        const sTm = h.slider({ label: '模拟温度 k_BT / J', min: 0.5, max: 1.6, step: 0.01, value: st.Tm, format: (v) => v.toFixed(2), onInput: (v) => { st.Tm = v; drawU(); } });
        const bRun = h.button({ label: '运行 ▶', onClick: () => setRun(!st.run) });
        ctl2.append(sTm.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bRun, h.button({ label: '随机重启', onClick: () => { xy.hot(); st.sw = 0; drawM(); } })])]));
        const finish = () => api.done(R`<b>Kosterlitz–Thouless 相变</b>：低温下涡旋以束缚的正负对存在，系统没有长程序却有刚度，关联按幂律衰减（准长程序）；在 $T_{\rm KT}$ 处涡旋对解离，刚度从 $2k_BT_{\rm KT}/\pi$ 跳到 0，关联变为指数衰减。这是一个不破缺任何对称性、由拓扑缺陷驱动的相变。二维 XY 模型 $T_{\rm KT} = 0.893\,J/k_B$；超流氦薄膜中的普适跳变由 Bishop 与 Reppy（1978）测到。`);
        const quiz = H.quiz({
          question: R`模拟中自由涡旋大量出现、刚度消失的温度大约在 0.9 到 1.1 之间，比 $T^*\approx 1.57$ 低得多。简单的估计漏掉了什么？`,
          options: [
            { label: '熵算少了：位置数应该比 R² 增长得更快', ok: false, why: R`位置数就是面积，$\propto R^2$。要把转变降到 0.9，熵的系数得变成 3.5，没有道理。` },
            { label: R`热涨落（自旋波与更小的束缚涡旋对）把大尺度上的有效刚度从 $J$ 削弱为 $\Upsilon(T)$，应当用 $\pi\Upsilon(T) = 2k_BT$ 判断`, ok: true, why: R`对。这是 Kosterlitz（1974）重整化群的要点：大涡旋“看到”的相互作用被小涡旋对屏蔽，就像电介质中的库仑力。刚度图上已画出直线 $2T/\pi$。` },
            { label: '格子太小，是有限尺寸效应', ok: false, why: '有限尺寸会把转变抹圆，并把交点略微推高（L = 24 时约 0.93，无限大时 0.893），但解释不了从 1.57 到 0.9 的差距。' },
            { label: '蒙特卡洛还没有达到平衡', ok: false, why: '刚度图的数据来自每个温度上万次扫描的长模拟，误差棒很小。' },
          ],
          onOk: () => { st.okQ = true; drawU(); qBox.hidden = false; api.typeset(qBox); },
        });
        const qBox = h.el('div', { hidden: true });
        const a2 = H.answer({
          label: R`用这个判据从刚度图读出转变温度 $T_{\rm KT}$（$L = 24$；单位 $J/k_B$，接受 0.86–0.97）`, placeholder: 'T_KT',
          check: (v) => {
            setTimeout(() => api.typeset(a2.el), 0);
            if (v >= 0.86 && v <= 0.97) return { ok: true, msg: R`对：$L = 24$ 的数据与直线交于约 0.93；格子越大交点越低，无限大时为 0.893。` };
            if (Math.abs(v - Math.PI / 2) < 0.1) return { ok: false, msg: '这是没有修正的估计 T*。' };
            if (v >= 1.02 && v <= 1.3) return { ok: false, msg: '这是 Υ 降到接近 0 的地方。有限格子里跳变被抹圆了；按判据读数据与直线的交点。' };
            if (Math.abs(v - 2 / Math.PI) < 0.03) return { ok: false, msg: '这是直线 2T/π 在 T = 1 处的值；问的是交点的横坐标。' };
            return { ok: false, msg: '不对。找数据点与直线 2T/π 相交的温度。' };
          },
          onOk: finish,
        });
        qBox.append(a2.el);
        sec.append(quiz.el, qBox);

        let lp = null;
        function setRun(on) {
          if (on && ctx.reduced) { for (let k = 0; k < 200; k++) { xy.sweep(st.Tm); if (k % 2) xy.over(); } st.sw += 200; drawM(); return; }
          st.run = on; bRun.textContent = on ? '暂停 ❚❚' : '运行 ▶';
          if (on && !lp) lp = h.loop(tick).start();
          if (!on && lp) { lp.stop(); lp = null; }
        }
        function tick() {
          if (!body.isConnected || cvM.canvas.offsetParent === null) { setRun(false); return; } // stage hidden: stop
          for (let k = 0; k < 2; k++) xy.sweep(st.Tm);
          xy.over(); st.sw += 2; drawM();
        }
        function drawF() {
          const g = cvF.g, W = cvF.w, Hh = cvF.h, mono = C('--mono-font') || 'monospace', T = st.T;
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const Rt = [4, 8, 16, 32, 64, 128, 256];
          const ax = h.axes(g, W, Hh, { x0: Math.log(3.6), x1: Math.log(290), y0: -14, y1: 26, pad: { l: 40, r: 30, t: 10, b: 34 }, xTicks: Rt.map(Math.log), yTicks: [-10, 0, 10, 20], fmtX: (v) => String(Math.round(Math.exp(v))), xLabel: 'R / a（对数刻度）', yLabel: '能量 (J)' }, C);
          const S = (r) => T * Math.log(Math.PI * r * r);
          const line = (f, col, dash) => { g.strokeStyle = C(col); g.setLineDash(dash || []); g.lineWidth = 1.8; g.beginPath(); ER.forEach(([r], i) => { const X = ax.X(Math.log(r)), Y = ax.Y(f(r, i)); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); g.setLineDash([]); };
          line((r, i) => ER[i][1], '--s1', [4, 3]); line((r) => S(r), '--s2', [2, 3]); line((r, i) => ER[i][1] - S(r), '--accent');
          ER.forEach(([r, e]) => { g.fillStyle = C('--s1'); g.beginPath(); g.arc(ax.X(Math.log(r)), ax.Y(e), 3, 0, TAU); g.fill(); g.fillStyle = C('--accent'); g.beginPath(); g.arc(ax.X(Math.log(r)), ax.Y(e - S(r)), 3, 0, TAU); g.fill(); });
          const last = ER[ER.length - 1], xe = ax.X(Math.log(last[0])) + 4;
          g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillStyle = C('--s1'); g.fillText('E', xe, ax.Y(last[1]));
          g.fillStyle = C('--s2'); g.fillText('TS', xe, ax.Y(S(last[0])));
          g.fillStyle = C('--accent'); g.fillText('F', xe, ax.Y(last[1] - S(last[0])));
          const dF = last[1] - S(last[0]) - (ER[0][1] - S(ER[0][0]));
          ro.d.set((dF >= 0 ? '+' : '') + dF.toFixed(2) + ' J');
          ro.s.set(Math.abs(dF) < 0.3 ? '能量与熵几乎打平' : dF > 0 ? '越大越不利（被禁止）' : '越大越有利（自由出现）');
        }
        function drawM() {
          const g = cvM.g, W = cvM.w, Hh = cvM.h, L = xy.L, s = Math.min(W - 8, Hh - 8) / L, x0 = (W - s * L) / 2, y0 = (Hh - s * L) / 2;
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          g.strokeStyle = g.fillStyle = C('--muted'); g.lineWidth = 1;
          for (let i = 0; i < xy.N; i++) needle(g, x0 + ((i % L) + 0.5) * s, y0 + (Math.floor(i / L) + 0.5) * s, xy.th[i], s * 0.36);
          const v = xy.vortices(), P = (a) => [x0 + (a.x + 0.5) * s, y0 + (a.y + 0.5) * s];
          g.strokeStyle = C('--fg'); g.lineWidth = 2;
          v.forEach((a, i) => { if (a.p > i && v[a.p].p === i) { const b = v[a.p]; if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3) { const [X1, Y1] = P(a), [X2, Y2] = P(b); g.beginPath(); g.moveTo(X1, Y1); g.lineTo(X2, Y2); g.stroke(); } } });
          let nf = 0;
          v.forEach((a) => {
            const [X, Y] = P(a), r = Math.max(2.5, s * 0.32);
            g.fillStyle = a.q > 0 ? C('--warn') : C('--s1');
            g.beginPath(); a.q > 0 ? g.arc(X, Y, r, 0, TAU) : g.rect(X - r, Y - r, 2 * r, 2 * r); g.fill();
            if (a.p < 0) { nf++; g.strokeStyle = g.fillStyle; g.lineWidth = 1.5; g.beginPath(); g.arc(X, Y, r * 2.1, 0, TAU); g.stroke(); }
          });
          const k = st.sw > 40 ? 0.04 : 0.3;
          st.rv += (v.length / xy.N - st.rv) * k; st.rf += (nf / xy.N - st.rf) * k;
          ro2.v.set(st.rv.toFixed(4)); ro2.f.set(st.rf.toFixed(4)); ro2.n.set(st.sw + ' 次（T = ' + st.Tm.toFixed(2) + '）');
        }
        function drawU() {
          const g = cvU.g, W = cvU.w, Hh = cvU.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: 0.45, x1: 1.55, y0: 0, y1: 1, pad: { l: 40, r: 10, t: 10, b: 34 }, xTicks: [0.5, 0.75, 1, 1.25, 1.5], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtX: (v) => String(v), fmtY: (v) => v.toFixed(2), xLabel: 'k_BT / J', yLabel: 'Υ / J' }, C);
          if (st.okQ) {
            g.strokeStyle = C('--warn'); g.lineWidth = 1.6; g.beginPath(); g.moveTo(ax.X(0.45), ax.Y(0.9 / Math.PI)); g.lineTo(ax.X(1.55), ax.Y(3.1 / Math.PI)); g.stroke();
            g.font = '11px ' + mono; g.fillStyle = C('--warn'); g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('2T/π', ax.X(1.53), ax.Y(3.06 / Math.PI) - 4);
          }
          g.strokeStyle = C('--accent'); g.lineWidth = 1.2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(ax.X(st.Tm), ax.p.t); g.lineTo(ax.X(st.Tm), ax.p.t + ax.ih); g.stroke(); g.setLineDash([]);
          g.strokeStyle = g.fillStyle = C('--s1'); g.lineWidth = 1;
          UPS.forEach(([T, u, e]) => { const X = ax.X(T); g.beginPath(); g.moveTo(X, ax.Y(u - e)); g.lineTo(X, ax.Y(u + e)); g.stroke(); g.beginPath(); g.arc(X, ax.Y(u), 2.6, 0, TAU); g.fill(); });
          g.font = '10.5px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('L = 24 数据', ax.p.l + 6, ax.Y(0) - 4);
        }
        cvF.onResize(drawF); cvM.onResize(drawM); cvU.onResize(drawU);
        const redraw = () => { drawF(); drawM(); drawU(); };
        const un = watchTheme(redraw);
        for (let k = 0; k < 300; k++) { xy.sweep(st.Tm); if (k % 2) xy.over(); }
        redraw();
        return { destroy() { if (lp) lp.stop(); cvF.destroy(); cvM.destroy(); cvU.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 3: the SSH chain ---------- */
  function jacobi(A) { // real symmetric (array of Float64Array, destroyed) → {vals ascending, vecs[i] = i-th eigenvector}
    const n = A.length, V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let sw = 0; sw < 60; sw++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-26) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p][q]; if (Math.abs(apq) < 1e-300) continue;
        const t0 = (A[q][q] - A[p][p]) / (2 * apq), t = (t0 >= 0 ? 1 : -1) / (Math.abs(t0) + Math.sqrt(t0 * t0 + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const idx = [...Array(n).keys()].sort((a, b) => A[a][a] - A[b][b]);
    return { vals: idx.map((i) => A[i][i]), vecs: idx.map((i) => Float64Array.from(V.map((r) => r[i]))) };
  }
  const NC = 20;
  function sshMatrix(N, v, w, u) { // sites: A_n = 2n, B_n = 2n + 1
    const M = Array.from({ length: 2 * N }, () => new Float64Array(2 * N));
    for (let c = 0; c < N; c++) {
      const a = 2 * c, b = a + 1; M[a][b] = M[b][a] = v;
      if (c + 1 < N) M[b][a + 2] = M[a + 2][b] = w;
      if (c + 2 < N) M[b][a + 4] = M[a + 4][b] = u;
    }
    return M;
  }

  function stage3(ctx) {
    return {
      title: '链的两端',
      task: R`<p>1980 年代，同样的整数开始出现在量子物态里。最简单的例子是一条“二聚化”的链（Su、Schrieffer 与 Heeger 1979 年用它描述聚乙炔）：每个元胞有 A、B 两个格点，电子在元胞内跳跃的振幅为 $v$，跳到下一个元胞为 $w$。周期链的布洛赫哈密顿量是 $H(k) = \begin{pmatrix}0 & \overline{h(k)}\\ h(k) & 0\end{pmatrix}$，$h(k) = v + w\,e^{ik}$，能带为 $E = \pm|h(k)|$。图 ① 画出 $k$ 从 0 走到 $2\pi$ 时复数 $h(k)$ 的轨迹；图 ② 是 $N = 20$ 个元胞的<b>有限开链</b>的全部本征能量；图 ③ 是开链中 $|E|$ 最小的本征态。</p>
<p>改变 $v$ 与 $w$：开链什么时候会出现 $E = 0$ 的本征态？它们在链上的什么位置？与图 ① 的曲线有什么关系？</p>`,
      hints: [
        R`零能态出现时，看它的波函数：它集中在链的一端，并且只占 A 格点（另一端的那个只占 B 格点）。对只占 A 格点的态，$H\psi = 0$ 在每个 B 格点上给出一个方程。`,
        R`B 格点 $n$ 上的方程是 $v\,\psi_A(n) + w\,\psi_A(n+1) = 0$，所以 $\psi_A(n)\propto(-v/w)^n$；它能归一化当且仅当 $|v/w|\lt 1$，即多项式 $h(z) = v + wz$ 的零点 $-v/w$ 落在单位圆内，等价于曲线 $h(e^{ik})$ 绕原点一圈。`,
        R`加上更远的跳跃 $u$ 后，$h(z) = v + wz + uz^2$。由辐角原理，曲线 $h(e^{ik})$ 绕原点的圈数等于 $h$ 在单位圆内的零点个数，每个零点 $z_j$ 给出一个左端零能态 $\psi_A(n)\propto z_j^n$。$(0.4, 0.5, 1.2)$ 的两个零点模长都是 $\sqrt{0.4/1.2}\approx 0.58$。`,
      ],
      answer: R`$w\gt v$ 时开链两端各有一个零能态：左端的只占 A 格点，$\psi_A(n)\propto(-v/w)^n$，相邻元胞振幅之比为 $v/w$（$v = 0.5$、$w = 1$ 时为 0.5）；右端的只占 B 格点。这正是圆 $h(k) = v + we^{ik}$（圆心 $v$、半径 $w$）把原点圈在里面的情形，绕数 $\nu = \deg\big(h/|h|: S^1\to S^1\big) = 1$。$v\gt w$ 时 $\nu = 0$，没有边缘态。$v = w$ 时曲线经过原点，体能隙 $2\min|h|$ 闭合：整数只能在能隙闭合时改变。一般地，由辐角原理，$\nu$ 等于 $h(z)$ 在单位圆内的零点数，也等于每一端的零能态数（体–边对应）。$(v, w, u) = (0.4, 0.5, 1.2)$ 时曲线绕原点两圈，左端有 2 个零能态，整条链共 4 个。`,
      build(body, api) {
        const h = H, C = (k) => ctx.color(k);
        const st = { v: 1.0, w: 0.6, u: 0, masked: false, okQ: false, okR: false, res: null };
        const row = h.el('div', { class: 'topo-row' }); const c1 = h.el('div'), c2 = h.el('div'); row.append(c1, c2);
        const stg = h.el('div', { class: 'lab-stage' }, [row]); body.append(stg);
        const cvD = h.canvas(c1, { aspect: 0.9, minH: 220, maxH: 300 });
        const cvE = h.canvas(c2, { aspect: 0.9, minH: 220, maxH: 300 });
        const cvP = h.canvas(stg, { aspect: 0.27, minH: 118, maxH: 170 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const mk = (key, label) => h.slider({ label, min: 0, max: 1.5, step: 0.01, value: st[key], format: (x) => x.toFixed(2), onInput: (x) => { st[key] = x; solve(); } });
        const sv = mk('v', '元胞内跳跃 v'), sw = mk('w', '元胞间跳跃 w'), su = mk('u', '跨两个元胞的跳跃 u');
        su.el.hidden = true;
        ctl.append(sv.el, sw.el, su.el);
        const roW = h.el('div', { class: 'lab-readout' }); body.append(roW);
        const ro = { g: h.readout('体能隙 2 min|h(k)|'), e: h.readout('最小的几个 |E|'), p: h.readout('该态 ψ_A(1), ψ_A(2), ψ_A(3)') };
        Object.values(ro).forEach((r) => roW.append(r.el));
        const sec1 = h.el('div', { class: 'topo-sec' }); body.append(sec1);
        const quiz = H.quiz({
          question: R`开链出现 $E = 0$ 的本征态，当且仅当图 ① 的曲线：`,
          options: [
            { label: '把原点圈在里面（绕原点一圈）', ok: true, why: R`对。对 $h(k) = v + we^{ik}$，这就是 $w\gt v$。` },
            { label: '经过原点', ok: false, why: R`曲线经过原点时 $\min|h| = 0$，体能隙闭合，这是两相之间的转变点（$v = w$），不是零能态出现的条件。` },
            { label: '完全落在右半平面', ok: false, why: R`那是 $v\gt w$ 的情形，开链没有零能态。` },
            { label: '半径足够大', ok: false, why: R`同时放大 $v$ 和 $w$ 只是把整条曲线和整个谱按比例放大，什么都不改变。要紧的是曲线与原点的相对位置。` },
          ],
          onOk: () => { st.okQ = true; partA(); },
        });
        const a1 = H.answer({
          label: R`取 $v = 0.5$、$w = 1.0$，读出零能态在 A 格点上的振幅。相邻元胞的振幅之比 $|\psi_A(n+1)/\psi_A(n)|$ = ?（容差 ±0.03）`, placeholder: '比值',
          check: (x) => {
            setTimeout(() => api.typeset(a1.el), 0);
            if (Math.abs(Math.abs(x) - 0.5) <= 0.03) return { ok: true, msg: R`对：$\psi_A(n)\propto(-v/w)^n$。B 格点上的方程 $v\psi_A(n) + w\psi_A(n+1) = 0$ 逐个元胞决定振幅，只有 $|v/w|\lt 1$ 时它能归一化。注意 $-v/w$ 正是 $h(z) = v + wz$ 的零点。` };
            if (Math.abs(x - 2) < 0.1) return { ok: false, msg: '倒过来了：振幅从链端向内部衰减。' };
            if (Math.abs(x - 0.25) < 0.03) return { ok: false, msg: '这是概率 |ψ|² 之比；问的是振幅之比。' };
            return { ok: false, msg: '不对。把 v、w 设为 0.5 与 1.0，比较读数中相邻的两个 ψ_A。' };
          },
          onOk: () => { st.okR = true; partA(); },
        });
        sec1.append(h.el('h4', { text: '规律' }), quiz.el, a1.el);
        const sec2 = h.el('div', { class: 'topo-sec', hidden: true }); body.append(sec2);
        const a2 = H.answer({
          label: R`只看图 ①，预言链 $(v, w, u) = (0.4, 0.5, 1.2)$ 的左端有几个零能态？`, placeholder: '个数',
          check: (x) => {
            if (x === 2) return { ok: true, msg: '对：曲线绕原点两圈，左端有两个零能态。谱图已经揭开。' };
            if (x === 4) return { ok: false, msg: '4 是整条链上零能态的总数（两端各有几个？）。问的是左端。' };
            if (x === 1) return { ok: false, msg: '数一数曲线绕原点几圈。' };
            if (x === 0) return { ok: false, msg: '原点在曲线里面吗？' };
            return { ok: false, msg: '不对。数一数曲线绕原点的圈数。' };
          },
          onOk: () => { st.masked = false; draw(); api.done(R`<b>体–边对应</b>：有子格（手征）对称性的一维链，其体的拓扑不变量是绕数 $\nu = \deg\big(h/|h|: S^1\to S^1\big)$。它等于 $h(z)$ 在单位圆内的零点数，也等于每一端受保护的零能态数，并且只能在体能隙闭合时改变。二维的类比是陈数：Thouless 等人（1982）证明量子霍尔电导等于它，Haldane（1988）构造了不需要净磁场的陈绝缘体。`); },
        });
        sec2.append(h.el('h4', { text: '预言' }),
          h.el('p', { class: 'topo-note', html: R`再加上跨两个元胞的跳跃 $u$（$B_n$ 到 $A_{n+2}$），$h(k) = v + we^{ik} + ue^{2ik}$。按下面的按钮装入一条新链，谱图会先遮住。` }),
          h.el('div', {}, [h.button({ label: '装入 (v, w, u) = (0.4, 0.5, 1.2)，遮住谱', onClick: () => { st.v = 0.4; st.w = 0.5; st.u = 1.2; sv.set(0.4); sw.set(0.5); su.set(1.2); st.masked = !api.solved(); solve(); } })]),
          a2.el);
        function partA() { if (st.okQ && st.okR && sec2.hidden) { sec2.hidden = false; su.el.hidden = false; api.typeset(sec2); } }

        function hk(k) { return [st.v + st.w * Math.cos(k) + st.u * Math.cos(2 * k), st.w * Math.sin(k) + st.u * Math.sin(2 * k)]; }
        function solve() {
          const { vals, vecs } = jacobi(sshMatrix(NC, st.v, st.w, st.u));
          let i0 = 0; vals.forEach((e, i) => { if (Math.abs(e) < Math.abs(vals[i0])) i0 = i; });
          let gmin = 1e9; for (let i = 0; i < 400; i++) { const [x, y] = hk((TAU * i) / 400); gmin = Math.min(gmin, Math.hypot(x, y)); }
          st.res = { vals, psi: vecs[i0], gap: 2 * gmin };
          draw();
        }
        function draw() { drawD(); drawE(); drawP(); readouts(); }
        function readouts() {
          const r = st.res; if (!r) return;
          ro.g.set(r.gap.toFixed(3));
          if (st.masked) { ro.e.set('（先预言）'); ro.p.set('（先预言）'); return; }
          ro.e.set(r.vals.map(Math.abs).sort((a, b) => a - b).slice(0, 4).map((x) => (x < 1e-3 ? x.toExponential(0) : x.toFixed(3))).join(', '));
          ro.p.set([0, 1, 2].map((n) => r.psi[2 * n].toFixed(3)).join(', '));
        }
        function drawD() {
          const g = cvD.g, W = cvD.w, Hh = cvD.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const rng = Math.max(0.6, (st.v + st.w + st.u) * 1.12), s = Math.min(W, Hh - 16) / (2 * rng), cx = W / 2, cy = (Hh - 16) / 2 + 4;
          const X = (x) => cx + x * s, Y = (y) => cy - y * s;
          g.strokeStyle = C('--grid'); g.lineWidth = 1; g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.moveTo(cx, 0); g.lineTo(cx, Hh - 14); g.stroke();
          g.strokeStyle = C('--s1'); g.lineWidth = 2; g.beginPath();
          for (let i = 0; i <= 360; i++) { const [x, y] = hk((TAU * i) / 360); i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); } g.stroke();
          g.fillStyle = C('--s1');
          [0.25, 0.5, 0.75].forEach((f) => { // direction of increasing k
            const k = TAU * f, [x, y] = hk(k), [x2, y2] = hk(k + 0.02), dx = X(x2) - X(x), dy = Y(y2) - Y(y), n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n, a = 7;
            g.beginPath(); g.moveTo(X(x) + ux * a, Y(y) + uy * a); g.lineTo(X(x) - ux * a - uy * a * 0.7, Y(y) - uy * a + ux * a * 0.7); g.lineTo(X(x) - ux * a + uy * a * 0.7, Y(y) - uy * a - ux * a * 0.7); g.closePath(); g.fill();
          });
          const [x0, y0] = hk(0); g.beginPath(); g.arc(X(x0), Y(y0), 3.5, 0, TAU); g.fill();
          g.fillStyle = C('--warn'); g.beginPath(); g.arc(cx, cy, 4.5, 0, TAU); g.fill();
          g.font = '11px ' + mono; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = C('--muted');
          g.fillText('① h(k) 平面', 6, 4);
          if (X(x0) + 48 > W) { g.textAlign = 'right'; g.fillText('k = 0', X(x0) - 6, Y(y0) + 4); g.textAlign = 'left'; } else g.fillText('k = 0', X(x0) + 6, Y(y0) + 4);
          g.fillStyle = C('--warn'); g.fillText('0', cx + 6, cy + 4);
          g.textBaseline = 'bottom'; g.fillStyle = C('--muted'); g.fillText('Re h →', W - 54, Hh - 1);
        }
        function mask(g, W, Hh) { g.fillStyle = C('--muted'); g.font = '13px ' + (C('--body-font') || 'sans-serif'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('先预言，再看谱', W / 2, Hh / 2); }
        function drawE() {
          const g = cvE.g, W = cvE.w, Hh = cvE.h, r = st.res, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const em = Math.max(0.6, (st.v + st.w + st.u) * 1.08);
          const ax = h.axes(g, W, Hh, { x0: 0, x1: 2 * NC + 1, y0: -em, y1: em, pad: { l: 40, r: 8, t: 10, b: 34 }, xTicks: [1, NC, 2 * NC], yTicks: [-1, 0, 1].map((t) => +(t * em * 0.8).toFixed(2)), xLabel: '本征态序号', yLabel: '能量 E' }, C);
          g.font = '11px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('②', 4, 2);
          if (st.masked || !r) { mask(g, W, Hh); return; }
          r.vals.forEach((e, i) => { const z = Math.abs(e) < 1e-3; g.fillStyle = z ? C('--warn') : C('--fg'); g.beginPath(); g.arc(ax.X(i + 1), ax.Y(e), z ? 4 : 2.4, 0, TAU); g.fill(); });
          const nz = r.vals.filter((e) => Math.abs(e) < 1e-3).length;
          g.font = '11px ' + mono; g.fillStyle = C('--warn'); g.textAlign = 'left'; g.textBaseline = 'top';
          g.fillText('|E| < 10⁻³：' + nz + ' 个', ax.p.l + 6, ax.p.t + 4);
        }
        function drawP() {
          const g = cvP.g, W = cvP.w, Hh = cvP.h, r = st.res, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const pl = 40, pr = 10, pt = 16, pb = 22, iw = W - pl - pr, mid = pt + (Hh - pt - pb) / 2, amp = (Hh - pt - pb) / 2;
          g.strokeStyle = C('--line'); g.beginPath(); g.moveTo(pl, mid); g.lineTo(W - pr, mid); g.stroke();
          g.font = '10.5px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('③ |E| 最小的本征态', 4, 2);
          g.textBaseline = 'bottom'; g.textAlign = 'left'; g.fillText('元胞 1', pl, Hh - 2); g.textAlign = 'right'; g.fillText('元胞 ' + NC, W - pr, Hh - 2);
          if (st.masked || !r) { mask(g, W, Hh); return; }
          const m = Math.max(...r.psi.map(Math.abs)) || 1, bw = iw / (2 * NC);
          r.psi.forEach((p, i) => { g.fillStyle = i % 2 ? C('--s2') : C('--s1'); const y = (p / m) * amp; g.fillRect(pl + i * bw + 1, y > 0 ? mid - y : mid, Math.max(1, bw - 2), Math.abs(y)); });
          g.textBaseline = 'top'; g.textAlign = 'right'; g.fillStyle = C('--s1'); g.fillText('■ A', W - 44, 2); g.fillStyle = C('--s2'); g.fillText('■ B', W - pr, 2);
        }
        cvD.onResize(draw); cvE.onResize(draw); cvP.onResize(draw);
        const un = watchTheme(draw);
        solve();
        return { destroy() { cvD.destroy(); cvE.destroy(); cvP.destroy(); un(); } };
      },
    };
  }

  CHALLENGES.topo = {
    title: '平面上的旋涡与链的两端',
    _math: { field1, loopSites, trace, vort1, relax1, LOOPS, ER, UPS, makeXY, jacobi, sshMatrix },
    mount(root, ctx) {
      injectStyle();
      return H.stages(root, ctx, [stage1(ctx), stage2(ctx), stage3(ctx)]);
    },
  };
})();
