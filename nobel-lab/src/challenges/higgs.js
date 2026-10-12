/* 质量从何而来 — Englert & Higgs, Nobel Physics 2013 (challenge)
 * Stage 1: O(2) "Mexican hat" V = μ²|φ|² + λ|φ|⁴, φ ∈ R², λ = 1/2, natural units; ball φ̈ = −∇V − γφ̇.
 *   μ² < 0 ⇒ vacuum |φ| = √(−μ²/2λ) = √(−μ²); radial ω² = V''(v) = −4μ² (μ² = −1 ⇒ ω = 2, period π); tangential ω = 0.
 *   Counting: two decoupled complex scalars (U(1)×U(1), vacuum T²) ⇒ 2; Higgs doublet (SU(2)×U(1) → U(1)_em; also O(4) → O(3)) ⇒ 3.
 * Stage 2: London-limit profile B(z)/B0 = e^{−z/λ}, λ = 39 nm (lead-like, 示意), 15 depths 5–145 nm, σ = 0.008 + 0.02·B.
 *   m_γ c² = ħc/λ = 197.33 eV·nm / 39 nm ≈ 5.1 eV. Goldstone phase → longitudinal photon; massive vector: 3 polarizations.
 * Stage 3: diphoton spectrum 100–160 GeV, 1-GeV bins (示意): background 400·exp(−0.03(m−130)) per GeV (≈27 400 events),
 *   signal 230 events, Gaussian m = 126.0 GeV, σ = 1.6 GeV. Window Z = (N−B)/√B; combine with H→ZZ*→4ℓ 3.6σ (ATLAS 2012).
 */
(() => {
  const R = String.raw;
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const poisson = (rnd, m) => { if (m < 30) { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; } return Math.max(0, Math.round(m + Math.sqrt(m) * gauss(rnd))); };
  const erf = (x) => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
  const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  function watchTheme(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-higgs')) return;
    const s = document.createElement('style'); s.id = 'st-higgs';
    s.textContent = `
.higgs-sec[hidden]{display:none}
.higgs-sec{display:grid;gap:12px;border-top:1px dashed var(--line);padding-top:10px}
.higgs-sec h4{margin:0;font-size:14px}
.higgs-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}`;
    document.head.append(s);
  }
  const sec = (title, hidden) => { const d = H.el('div', { class: 'higgs-sec', hidden: !!hidden }); if (title) d.append(H.el('h4', { text: title })); return d; };

  /* ---------- Stage 1: spontaneous symmetry breaking & Goldstone counting ---------- */
  function stage1(ctx) {
    const LAM = 0.5, C = (n) => ctx.color(n), SPEED = 4, TTR = 13;
    return {
      title: '山顶上的小球',
      task: R`<p>1961 年，戈德斯通研究最简单的模型：$n$ 个实标量场 $\phi = (\phi_1,\dots,\phi_n)$，势能 $V = \mu^2|\phi|^2 + \lambda|\phi|^4$（取 $\lambda = 1/2$，自然单位），它在 $O(n)$ 转动下不变。若场在空间中取常数（简化：只看均匀的场），运动方程 $\ddot\phi = -\nabla V$ 就是一个小球在势能面上滚动；真空附近小振动的角频率 $\omega$ 就是相应粒子的质量。</p>
<p>下面是 $n = 2$。把 $\mu^2$ 调成负值，放一个小球，看它停在哪里；然后从静止处沿径向、切向各推一下，从时间曲线上量出振动的角频率。</p>
<p>最后推广到别的模型：真空附近有多少个独立方向是“推了不回来”的？</p>`,
      hints: [
        R`$\mu^2 \lt 0$ 时原点是极大值，极小点满足 $V'(r) = 2\mu^2r + 4\lambda r^3 = 0$。时间曲线上相邻两次同向穿过零点的间隔是周期 $T$，$\omega = 2\pi/T$；也可以直接算 $\omega^2 = V''(r_0)$。`,
        R`切向推，小球沿谷底的圆滑走，没有回复力：$\omega = 0$。一般地，真空是一个流形 $\mathcal M$，沿它的切方向 $V$ 不变，所以零质量方向的个数是 $\dim\mathcal M$。对称群 $G$ 把一个真空 $\phi_0$ 转到别的真空，$\mathcal M = G\cdot\phi_0\cong G/H$，$H$ 是保持 $\phi_0$ 不动的子群。`,
        R`两个独立复场：每个 $|z_i| = v$ 是一个圆，$\mathcal M = S^1\times S^1$，维数 2，不是 $4 - 1 = 3$。希格斯二重态：$V$ 只依赖 $|\Phi|^2$，$\mathcal M = S^3$，维数 3，也等于 $\dim G - \dim H = 4 - 1$。径向：$\mu^2 = -1$ 时 $\omega = 2$。`,
      ],
      answer: R`$\mu^2 \lt 0$ 时原点变成极大，真空是圆 $|\phi| = \sqrt{-\mu^2/2\lambda}$，小球随机停在圆上的某一点：对称性被自发破缺。径向 $\omega^2 = V''(r_0) = 2\mu^2 + 12\lambda r_0^2 = -4\mu^2$（$\mu^2 = -1$ 时 $\omega = 2$，周期 $\pi$）；切向 $\omega = 0$，这就是戈德斯通模式。一般地，零质量模式的个数 = 真空流形的维数 = $\dim G - \dim H$。两个独立复场：$U(1)\times U(1)$ 完全破缺，2 个；希格斯二重态 $SU(2)\times U(1)\to U(1)_{\rm em}$：$4 - 1 = 3$ 个。`,
      build(body, api) {
        const h = H, rnd = mulberry32(1961);
        const st = { mu2: 0.5, p: [0, 0], v: [0, 0], gamma: 0.9, trail: [], rest: true, tr: null, lastR: null };
        const V = (r) => st.mu2 * r * r + LAM * r ** 4;
        const grad = (p) => { const f = 2 * st.mu2 + 4 * LAM * (p[0] * p[0] + p[1] * p[1]); return [f * p[0], f * p[1]]; };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.5, minH: 190, maxH: 320 });
        const cvT = h.canvas(stg, { aspect: 0.3, minH: 150, maxH: 210 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sM = h.slider({ label: 'μ²（λ = 1/2）', min: -2, max: 1, step: 0.05, value: st.mu2, format: (v) => v.toFixed(2), onInput: (v) => { st.mu2 = v; if (st.tr && !st.tr.done) { st.tr = null; st.gamma = 0.9; } if (Math.hypot(st.p[0], st.p[1]) < 1e-3) { const a = rnd() * 2 * Math.PI; st.p = [2e-3 * Math.cos(a), 2e-3 * Math.sin(a)]; } st.rest = false; wake(); } });
        const bt = h.el('div', { class: 'ctl' }, [h.el('div', {}, [
          h.button({ label: '放一个小球', onClick: release }),
          h.button({ label: '径向推一下', onClick: () => push('r') }),
          h.button({ label: '切向推一下', onClick: () => push('t') }),
        ])]);
        ctl.append(sM.el, bt);
        const roW = h.el('div', { class: 'lab-readout' });
        const ro = { r: h.readout('小球 |φ|'), V: h.readout('势能 V'), s: h.readout('状态') };
        Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);

        function release() {
          const a = rnd() * 2 * Math.PI;
          Object.assign(st, { p: [0.03 * Math.cos(a), 0.03 * Math.sin(a)], v: [0, 0], gamma: 0.9, trail: [], rest: false, tr: null });
          api.say('', 'info'); wake();
        }
        function push(dir) {
          if (!st.rest) { api.say('先放一个小球，等它停稳再推。', 'info'); return; }
          const r0 = Math.hypot(st.p[0], st.p[1]), er = r0 > 0.05 ? [st.p[0] / r0, st.p[1] / r0] : [1, 0], et = [-er[1], er[0]], u = dir === 'r' ? er : et;
          st.v = [0.12 * u[0], 0.12 * u[1]]; st.gamma = 0; st.rest = false;
          st.tr = { dir, mu2: st.mu2, r0, p0: st.p.slice(), th0: Math.atan2(st.p[1], st.p[0]), er, et, t: 0, pts: [[0, 0, 0]], done: false };
          wake();
        }
        function sample() {
          const T = st.tr, p = st.p;
          if (T.r0 > 0.05) {
            let dth = Math.atan2(p[1], p[0]) - T.th0; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
            const prev = T.pts[T.pts.length - 1][2] / T.r0; while (dth - prev > Math.PI) dth -= 2 * Math.PI; while (dth - prev < -Math.PI) dth += 2 * Math.PI;
            T.pts.push([T.t, Math.hypot(p[0], p[1]) - T.r0, T.r0 * dth]);
          } else { const d = [p[0] - T.p0[0], p[1] - T.p0[1]]; T.pts.push([T.t, d[0] * T.er[0] + d[1] * T.er[1], d[0] * T.et[0] + d[1] * T.et[1]]); }
        }
        function advance(Tsim) { // symplectic Euler, dt ≤ 0.004
          const n = Math.max(1, Math.ceil(Tsim / 0.004)), dt = Tsim / n;
          for (let i = 0; i < n; i++) {
            const g = grad(st.p);
            st.v[0] += (-g[0] - st.gamma * st.v[0]) * dt; st.v[1] += (-g[1] - st.gamma * st.v[1]) * dt;
            st.p[0] += st.v[0] * dt; st.p[1] += st.v[1] * dt;
            if (st.tr && !st.tr.done) {
              st.tr.t += dt;
              if (st.tr.t - st.tr.pts[st.tr.pts.length - 1][0] >= 0.05) sample();
              if (st.tr.t >= TTR) { st.tr.done = true; st.gamma = 0.9; if (st.tr.dir === 'r') st.lastR = { mu2: st.tr.mu2, r0: st.tr.r0 }; }
            }
          }
          const tl = st.trail[st.trail.length - 1];
          if (!tl || Math.hypot(tl[0] - st.p[0], tl[1] - st.p[1]) > 0.01) { st.trail.push(st.p.slice()); if (st.trail.length > 800) st.trail.splice(0, 200); }
          const g = grad(st.p);
          const rr = Math.hypot(st.p[0], st.p[1]), curv = 2 * st.mu2 + 12 * LAM * rr * rr;
          if ((!st.tr || st.tr.done) && Math.hypot(st.v[0], st.v[1]) < 1e-3 && Math.hypot(g[0], g[1]) < 3e-3 && curv >= 0) st.rest = true;
        }
        function drawTop() {
          const g = cv.g, W = cv.w, Hh = cv.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const half = W / 2, RM = 1.8;
          // left: profile along the ball's direction
          const r0 = Math.hypot(st.p[0], st.p[1]);
          const ax = h.axes(g, half, Hh, { x0: -RM, x1: RM, y0: -2.2, y1: 2, pad: { l: 30, r: 8, t: 18, b: 30 }, xTicks: [-1.5, 0, 1.5], yTicks: [-2, -1, 0, 1, 2], xLabel: '沿小球方向的 φ', fmtY: (v) => String(v) }, C);
          g.save(); g.beginPath(); g.rect(ax.p.l, ax.p.t, ax.iw, ax.ih); g.clip();
          g.strokeStyle = C('--s1'); g.lineWidth = 1.8; g.beginPath();
          for (let i = 0; i <= 160; i++) { const x = -RM + (2 * RM * i) / 160, y = ax.Y(V(Math.abs(x))); i ? g.lineTo(ax.X(x), y) : g.moveTo(ax.X(x), y); }
          g.stroke();
          g.fillStyle = C('--accent'); g.beginPath(); g.arc(ax.X(r0), ax.Y(V(r0)) - 6, 6, 0, 6.283); g.fill();
          g.restore();
          g.font = '11px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('V(φ)', ax.p.l + 4, 3);
          // right: top view
          const cx = half + half / 2, cy = Hh / 2 + 4, rad = Math.min(half / 2 - 10, Hh / 2 - 14), S = rad / RM;
          const rgba = (col, al) => { g.fillStyle = col; const c = g.fillStyle; let r = 0, gg = 0, bb = 0; if (c[0] === '#') { const n = parseInt(c.slice(1, 7), 16); r = (n >> 16) & 255; gg = (n >> 8) & 255; bb = n & 255; } else { const m = c.match(/[\d.]+/g) || [0, 0, 0]; [r, gg, bb] = m; } return `rgba(${r},${gg},${bb},${al})`; };
          let lo = Infinity; const vals = []; for (let k = 0; k <= 36; k++) { const v = V((RM * k) / 36); vals.push(v); lo = Math.min(lo, v); }
          const s1 = C('--s1'), grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad); // shade = height of V (clamped)
          vals.forEach((v, k) => grd.addColorStop(k / 36, rgba(s1, (0.04 + 0.5 * Math.min(1, (v - lo) / 2.5)).toFixed(3))));
          g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, rad, 0, 6.283); g.fill();
          g.strokeStyle = C('--grid'); g.lineWidth = 1; g.stroke();
          if (st.mu2 < 0) { g.setLineDash([4, 3]); g.strokeStyle = C('--good'); g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, Math.sqrt(-st.mu2 / (2 * LAM)) * S, 0, 6.283); g.stroke(); g.setLineDash([]); }
          g.strokeStyle = C('--muted'); g.lineWidth = 1; g.beginPath();
          st.trail.forEach((q, i) => (i ? g.lineTo(cx + q[0] * S, cy - q[1] * S) : g.moveTo(cx + q[0] * S, cy - q[1] * S))); g.stroke();
          g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 1.5; g.beginPath(); g.arc(cx + st.p[0] * S, cy - st.p[1] * S, 5.5, 0, 6.283); g.fill(); g.stroke();
          g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('俯视 (φ₁, φ₂)', half + 6, 3);
        }
        function drawTrace() {
          const g = cvT.g, W = cvT.w, Hh = cvT.h, mono = C('--mono-font') || 'monospace', T = st.tr;
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          let ym = 0.02; if (T) T.pts.forEach((q) => { ym = Math.max(ym, Math.abs(q[1]), Math.abs(q[2])); }); ym *= 1.2;
          const ax = h.axes(g, W, Hh, { x0: 0, x1: TTR, y0: -ym, y1: ym, pad: { l: 46, r: 10, t: 20, b: 30 }, xTicks: Array.from({ length: TTR + 1 }, (_, i) => i), yTicks: [-ym / 1.2, 0, ym / 1.2], fmtX: (v) => (v % 2 ? '' : String(v)), fmtY: (v) => v.toFixed(Math.abs(v) < 0.1 ? 3 : 2), xLabel: '推后的时间 t' }, C);
          g.font = '11px ' + mono; g.textBaseline = 'top'; g.textAlign = 'left';
          if (!T) { g.fillStyle = C('--muted'); g.fillText('推一下静止的小球，这里画出位移随时间的变化', ax.p.l + 6, ax.p.t + 6); return; }
          [[1, '--s1', '径向 δ|φ|'], [2, '--s2', '切向弧长']].forEach(([k, col, lab], j) => {
            g.strokeStyle = C(col); g.lineWidth = 1.6; g.beginPath(); T.pts.forEach((q, i) => (i ? g.lineTo(ax.X(q[0]), ax.Y(q[k])) : g.moveTo(ax.X(q[0]), ax.Y(q[k])))); g.stroke();
            g.fillStyle = C(col); g.fillText(lab, ax.p.l + 6 + j * 92, 4);
          });
          g.fillStyle = C('--muted'); g.textAlign = 'right'; g.fillText((T.dir === 'r' ? '径向推' : '切向推') + ' · μ² = ' + T.mu2.toFixed(2), W - 10, 4);
        }
        function readouts() {
          const r = Math.hypot(st.p[0], st.p[1]);
          ro.r.set(r.toFixed(3)); ro.V.set(V(r).toFixed(3));
          ro.s.set(st.tr && !st.tr.done ? '振动中（记录 ' + st.tr.t.toFixed(1) + ' / ' + TTR + '）' : st.rest ? '静止' : '滚动中');
        }
        function draw() { drawTop(); drawTrace(); readouts(); }
        const lp = h.loop((dt) => { advance(dt * SPEED); draw(); if (st.rest) lp.stop(); });
        function wake() {
          if (ctx.reduced) { let k = 0; st.rest = false; while (!st.rest && k++ < 4000) advance(0.02); draw(); return; }
          if (!lp.running) lp.start();
        }
        cv.onResize(draw); cvT.onResize(drawTrace);
        const un = watchTheme(draw);

        const box = sec('数一数'); body.append(box);
        let okW = false, okA = false, okB = false;
        const fin = () => { if (okW && okA && okB) api.done(R`<b>戈德斯通定理</b>：连续对称性 $G$ 自发破缺到 $H$ 时，真空是一整个流形 $G/H$，沿它的每个切方向都没有回复力，于是有 $\dim G - \dim H$ 个零质量粒子；离开真空流形的方向有质量（这里 $\omega^2 = -4\mu^2$）。麻烦在于：电弱理论需要的 3 个零质量标量从未被看到。`); };
        const aW = H.answer({
          label: R`径向小振动的角频率 $\omega$（这个模式的质量）= ?（用你最近一次径向推时的 $\mu^2$；容差 ±6%）`, placeholder: 'ω',
          check: (x) => {
            const L = st.lastR;
            if (!L) return { ok: false, msg: '先让小球在 μ² < 0 时停稳，径向推一下，等曲线画完再读。' };
            if (L.mu2 >= 0) return { ok: false, msg: '你最近一次径向推时 μ² ≥ 0，小球在原点：那是对称相。把 μ² 调成负的再测。' };
            const w = Math.sqrt(-4 * L.mu2), T = 2 * Math.PI / w;
            if (Math.abs(x - w) <= 0.06 * w) return { ok: true, msg: R`对：$\omega \approx ${w.toFixed(2)}$，与 $V''(r_0) = -4\mu^2$ 一致。` };
            if (Math.abs(x - T) <= 0.06 * T) return { ok: false, msg: '这是周期 T。角频率 ω = 2π/T。' };
            if (Math.abs(x - w * w) <= 0.06 * w * w) return { ok: false, msg: '这是 ω²（势能沿径向的二阶导数），再开方。' };
            return { ok: false, msg: '不对。数一数曲线上几个完整周期占了多长时间。' };
          },
          onOk: () => { okW = true; fin(); },
        });
        const aA = H.answer({
          label: R`模型 A：两个互不耦合的复标量 $z_1, z_2$，$V = \sum_{i=1,2}(\mu^2|z_i|^2 + \lambda|z_i|^4)$，$\mu^2 \lt 0$。真空附近有几个零质量方向？`, placeholder: '个数',
          check: (x) => {
            if (x === 2) return { ok: true, msg: R`对：真空是 $|z_1| = |z_2| = v$，即环面 $S^1\times S^1$，2 维；两个径向方向有质量。注意不是 $4 - 1 = 3$。` };
            if (x === 3) return { ok: false, msg: '3 = 4 − 1 是势能只依赖 |z₁|² + |z₂|² 时的答案。这里的四次项 |z₁|⁴ + |z₂|⁴ 没有 O(4) 对称，真空不是三维球面。' };
            if (x === 1) return { ok: false, msg: '两个场各自的相位都可以单独转动。' };
            return { ok: false, msg: '数一数真空的集合是几维的。' };
          },
          onOk: () => { okA = true; fin(); },
        });
        const aB = H.answer({
          label: R`模型 B（标准模型的希格斯场）：复二重态 $\Phi\in\mathbb C^2$（4 个实分量），$V = \mu^2|\Phi|^2 + \lambda|\Phi|^4$，对称群 $SU(2)\times U(1)$，选定的真空只剩电磁 $U(1)$ 不变。几个零质量方向？`, placeholder: '个数',
          check: (x) => {
            if (x === 3) return { ok: true, msg: R`对：$\dim G - \dim H = 4 - 1 = 3$；真空 $\{|\Phi|^2 = v^2/2\}\cong S^3$ 也是 3 维。剩下 1 个径向方向有质量。` };
            if (x === 4) return { ok: false, msg: '4 是实分量的个数。径向方向是有质量的。' };
            if (x === 1) return { ok: false, msg: '1 是剩下的对称群 U(1) 的维数。' };
            return { ok: false, msg: '真空集合 {|Φ|² = v²/2} 是 R⁴ 中的什么？' };
          },
          onOk: () => { okB = true; fin(); },
        });
        box.append(aW.el, aA.el, aB.el);
        draw();
        return { destroy() { lp.stop(); cv.destroy(); cvT.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 2: light inside a superconductor; counting degrees of freedom ---------- */
  const HBARC = 197.327, LAM_TRUE = 39; // eV·nm; nm (lead-like, 示意)
  const ZS = Array.from({ length: 15 }, (_, j) => 5 + 10 * j);
  const PROF = (() => { const rnd = mulberry32(1962); return ZS.map((z) => { const b = Math.exp(-z / LAM_TRUE), s = 0.008 + 0.02 * b; return [z, b + s * gauss(rnd), s]; }); })();
  const chiProf = (lam) => PROF.reduce((a, [z, b, s]) => a + ((b - Math.exp(-z / lam)) / s) ** 2, 0);
  const LAM_FIT = (() => { let best = 0, bc = Infinity; for (let l = 20; l <= 80; l += 0.05) { const c = chiProf(l); if (c < bc) { bc = c; best = l; } } return best; })();

  function stage2(ctx) {
    const C = (n) => ctx.color(n);
    return {
      title: '超导体里的光',
      task: R`<p>1962–1963 年，安德森在想超导体。磁场进不了超导体内部（迈斯纳效应），只在表面一薄层里衰减。下面是一块超导体在弱外磁场中、表面以下不同深度 $z$ 处的磁场 $B(z)/B_0$（示意数据，量级仿照铅）。</p>
<p>调节特征长度 $\lambda$，让 $e^{-z/\lambda}$ 贴合数据。真空中的光子没有质量；质量为 $m$ 的矢量场在静态时满足 $(\nabla^2 - m^2c^2/\hbar^2)\mathbf B = 0$。在这块超导体里，光子有多“重”？</p>
<p>然后看模式图：一个复标量场（真空值 $v$，已破缺）与一个 $U(1)$ 规范场耦合，耦合常数为 $e$（简化的相对论模型，取 $v = 1$）。把 $e$ 从零调大，数一数各种模式。</p>`,
      hints: [
        R`把 $\lambda$ 调到 $\chi^2/\text{点}$ 最小处，大约 40 nm。一维静态方程 $B'' = B/\lambda^2$ 与 $B'' = (mc/\hbar)^2B$ 对比，得 $mc^2 = \hbar c/\lambda$，$\hbar c = 197.3$ eV·nm。`,
        R`拖动 $e$：$e = 0$ 时有 3 个无质量模式（2 个横向光子 + 1 个相位模式），$e \gt 0$ 时一个都不剩，可自由度总数始终是 4。无质量自旋 1 粒子只有 2 个螺旋度；有质量的自旋 1 粒子在静止系有 3 个态。`,
        R`写 $\Phi = \tfrac1{\sqrt2}(v+h)e^{i\theta/v}$，规范变换可以把 $\theta$ 整个消掉。电弱：破缺前 $4\times2 + 4 = 12$；破缺后 $3\times3 + 2 + n = 12$，解出 $n$。`,
      ],
      answer: R`拟合得 $\lambda \approx ${LAM_FIT.toFixed(0)}$ nm，$m_\gamma c^2 = \hbar c/\lambda \approx ${(HBARC / LAM_FIT).toFixed(1)}$ eV：超导体里光子获得了质量（安德森 1963）。凝聚体的相位 $\theta$ 本是戈德斯通模式，但规范变换 $A_\mu\to A_\mu + e^{-1}\partial_\mu\alpha$ 取 $\alpha = -\theta/v$ 就能把它从拉格朗日量里完全消去：它不是独立的物理粒子，它的自由度成了矢量场的纵向偏振。计数：无质量矢量 2 + 戈德斯通 1 = 有质量矢量 3。电弱理论中 $4\times2 + 4 = 12 = 3\times3 + 2 + 1$：3 个戈德斯通被 $W^\pm$、$Z$ 吃掉，剩下 <b>1</b> 个有质量的标量粒子，即希格斯玻色子。`,
      build(body, api) {
        const h = H;
        const st = { lam: 80, e: 0 };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cvP = h.canvas(stg, { aspect: 0.42, minH: 190, maxH: 280 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sL = h.slider({ label: '特征长度 λ', min: 10, max: 120, step: 0.5, value: st.lam, format: (v) => v.toFixed(1) + ' nm', onInput: (v) => { st.lam = v; drawP(); } });
        ctl.append(sL.el);
        const roW = h.el('div', { class: 'lab-readout' }); const roC = h.readout('χ² / 点（15 点）'), roL = h.readout('1/λ');
        roW.append(roC.el, roL.el); body.append(roW);
        const box1 = sec(''); body.append(box1);
        let ok1 = false, ok2 = false, ok3 = false;
        const fin = () => { if (ok1 && ok2 && ok3) api.done(R`<b>BEH 机制</b>（恩格勒–布鲁、希格斯、古拉尔尼克–哈根–基布尔，1964）：相位模式不是独立的粒子，它被规范场“吃掉”，成为纵向偏振，2 + 1 = 3。超导体里光子的质量 $\hbar c/\lambda\approx 5$ eV 是同一件事的非相对论版本。电弱理论里 3 个戈德斯通模式变成 $W^+$、$W^-$、$Z$ 的纵向偏振，戈德斯通的零质量粒子与规范场的零质量问题一起消失，只剩下 1 个可检验的有质量标量。`); };
        const a1 = H.answer({
          label: R`超导体中光子的静能 $m_\gamma c^2$ ≈ ?（容差 ±10%）`, unit: 'eV', placeholder: 'mc²',
          check: (x) => {
            const m = HBARC / LAM_FIT;
            if (Math.abs(x - m) <= 0.1 * m) return { ok: true, msg: R`对：$\hbar c/\lambda \approx ${m.toFixed(1)}$ eV，比电子质量小十万倍，但不是零。超导体里的磁场“力程有限”，正如传递短程力的粒子有质量。` };
            if (Math.abs(x - m * 1e3) <= 0.1 * m * 1e3 || Math.abs(x - m * 1e-3) <= 0.1 * m * 1e-3) return { ok: false, msg: '数量级差了 1000：λ 用 nm，ħc = 197.3 eV·nm。' };
            if (Math.abs(x - LAM_FIT) <= 6) return { ok: false, msg: '这是 λ 本身。质量与长度成反比。' };
            return { ok: false, msg: '不对。先把 λ 拟合好，再用 mc² = ħc/λ。' };
          },
          onOk: () => { ok1 = true; fin(); },
        });
        box1.append(a1.el);

        const box2 = sec('模式与自由度'); body.append(box2);
        const stg2 = h.el('div', { class: 'lab-stage' }); box2.append(stg2);
        const cvM = h.canvas(stg2, { aspect: 0.5, minH: 200, maxH: 300 });
        const ctl2 = h.el('div', { class: 'lab-controls' }); box2.append(ctl2);
        const sE = h.slider({ label: '规范耦合 e', min: 0, max: 1.5, step: 0.01, value: 0, format: (v) => v.toFixed(2), onInput: (v) => { st.e = v; drawM(); } });
        ctl2.append(sE.el);
        const roW2 = h.el('div', { class: 'lab-readout' });
        const r2 = { n0: h.readout('无质量模式数'), dof: h.readout('自由度总数'), mA: h.readout('矢量 ω(k→0)'), mh: h.readout('径向 ω(k→0)') };
        Object.values(r2).forEach((r) => roW2.append(r.el)); box2.append(roW2);
        box2.append(H.quiz({
          question: R`$e \gt 0$ 时，有质量的矢量粒子在静止系中有 3 个自旋态，而无质量的光子只有 2 个偏振。第 3 个从哪里来？`,
          options: [
            { label: '规范场获得质量后自然多出一个偏振，自由度总数加 1', ok: false, why: '看读数：自由度总数始终是 4。多出来的那一个必须从别处搬过来。' },
            { label: '来自径向（振幅）模式', ok: false, why: R`径向模式一直在，它的质量 $\sqrt{2\lambda}\,v$ 与 $e$ 无关，图中那条曲线不动。` },
            { label: '来自相位模式：它可以被规范变换整个消去，携带的自由度变成矢量场的纵向偏振', ok: true, why: R`对。写 $\Phi = \tfrac1{\sqrt2}(v+h)e^{i\theta/v}$，取规范 $\alpha = -\theta/v$，$\theta$ 从拉格朗日量里消失，剩下 $\tfrac12e^2v^2A_\mu A^\mu$：质量项出现了，相位模式不再是独立粒子。高能下纵向矢量粒子的振幅等于原来戈德斯通粒子的振幅（等价定理）。` },
            { label: '纵向偏振本来就有，只是光子没有质量时它的能量为零', ok: false, why: '无质量自旋 1 粒子只有螺旋度 ±1 两个态（维格纳小群是 ISO(2)），纵向态在规范不变的理论里不存在，而不是能量为零。' },
          ],
          onOk: () => { ok2 = true; fin(); },
        }).el);

        const box3 = sec('电弱理论'); body.append(box3);
        box3.append(H.answer({
          label: R`格拉肖–温伯格–萨拉姆模型：规范群 $SU(2)\times U(1)$ 有 4 个规范场（破缺前都无质量），希格斯场是复二重态（4 个实分量）。破缺后 $W^+$、$W^-$、$Z$ 有质量，光子仍无质量。谱里还剩几个自旋 0 的粒子？`, placeholder: '个数',
          check: (x) => {
            if (x === 1) return { ok: true, msg: R`对：$4\times2 + 4 = 12 = 3\times3 + 2 + 1$。这个剩下的有质量标量就是 BEH 机制的可检验预言。` };
            if (x === 4) return { ok: false, msg: '如果没有任何模式被吃掉，自由度总数就对不上了：有质量矢量需要第 3 个偏振。' };
            if (x === 0) return { ok: false, msg: '被吃掉的只有 3 个（每个获得质量的矢量粒子吃 1 个）。' };
            if (x === 3) return { ok: false, msg: '3 个戈德斯通模式被吃掉了，剩下的不是它们。' };
            return { ok: false, msg: '列出破缺前后的自由度：矢量粒子无质量 2 个、有质量 3 个。' };
          },
          onOk: () => { ok3 = true; fin(); },
        }).el);

        function drawP() {
          const g = cvP.g, W = cvP.w, Hh = cvP.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: 0, x1: 150, y0: 0, y1: 1.1, pad: { l: 44, r: 12, t: 14, b: 34 }, xTicks: [0, 25, 50, 75, 100, 125, 150], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => v.toFixed(2), xLabel: '表面以下深度 z (nm)', yLabel: 'B / B₀' }, C);
          g.strokeStyle = C('--s1'); g.lineWidth = 1.8; g.beginPath();
          for (let i = 0; i <= 150; i++) { const y = ax.Y(Math.exp(-i / st.lam)); i ? g.lineTo(ax.X(i), y) : g.moveTo(ax.X(i), y); } g.stroke();
          g.strokeStyle = C('--fg'); g.fillStyle = C('--fg'); g.lineWidth = 1;
          PROF.forEach(([z, b, s]) => { const x = ax.X(z); g.beginPath(); g.moveTo(x, ax.Y(b - s)); g.lineTo(x, ax.Y(b + s)); g.stroke(); g.beginPath(); g.arc(x, ax.Y(b), 2.6, 0, 6.283); g.fill(); });
          g.font = '11px ' + mono; g.fillStyle = C('--s1'); g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('e^(−z/λ), λ = ' + st.lam.toFixed(1) + ' nm', ax.p.l + ax.iw - 6, ax.p.t + 6);
          roC.set((chiProf(st.lam) / 15).toFixed(2)); roL.set((1 / st.lam).toFixed(4) + ' nm⁻¹');
        }
        function drawM() {
          const g = cvM.g, W = cvM.w, Hh = cvM.h, mono = C('--mono-font') || 'monospace', e = st.e, MH = Math.SQRT2;
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: 0, x1: 3, y0: 0, y1: 3.2, pad: { l: 40, r: 12, t: 14, b: 34 }, xTicks: [0, 1, 2, 3], yTicks: [0, 1, 2, 3], xLabel: '动量 k（单位 v）', yLabel: '能量 ω' }, C);
          const curve = (m, col, dash, w) => { g.strokeStyle = C(col); g.lineWidth = w; g.setLineDash(dash); g.beginPath(); for (let i = 0; i <= 120; i++) { const k = (3 * i) / 120, y = ax.Y(Math.min(3.2, Math.hypot(k, m))); i ? g.lineTo(ax.X(k), y) : g.moveTo(ax.X(k), y); } g.stroke(); g.setLineDash([]); };
          curve(MH, '--s3', [], 1.6);
          curve(e, '--s1', [], 3.2);
          curve(e, '--s2', [6, 5], 2);
          g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'bottom';
          const lab = (txt, col, x, y) => { g.fillStyle = C(col); g.fillText(txt, x, y); };
          lab('径向模式 ×1', '--s3', ax.X(0.08), ax.Y(MH) - 3);
          lab(e < 0.005 ? '光子（横向）×2' : '矢量（横向）×2', '--s1', ax.X(1.9), ax.Y(Math.hypot(1.9, e)) + 16);
          lab(e < 0.005 ? '相位模式 ×1（虚线）' : '第 3 个模式 ×1（虚线）', '--s2', ax.X(1.9), ax.Y(Math.hypot(1.9, e)) + 30);
          r2.n0.set(e < 0.005 ? '3' : '0'); r2.dof.set(e < 0.005 ? '2 + 1 + 1 = 4' : '3 + 1 = 4');
          r2.mA.set('e·v = ' + e.toFixed(2)); r2.mh.set('√(2λ)·v = ' + MH.toFixed(2) + '（λ = 1）');
        }
        const all = () => { drawP(); drawM(); };
        cvP.onResize(drawP); cvM.onResize(drawM);
        const un = watchTheme(all);
        all();
        return { destroy() { cvP.destroy(); cvM.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 3: the diphoton spectrum ---------- */
  const M0 = 100, NB = 60, BG_A = 400, BG_B = 0.03, SIG_N = 230, SIG_M = 126.0, SIG_W = 1.6, Z4L = 3.6, SEED = 20120714;
  const bgInt = (lo, hi) => (BG_A / BG_B) * (Math.exp(-BG_B * (lo - 130)) - Math.exp(-BG_B * (hi - 130)));
  const DATA = (() => { const rnd = mulberry32(SEED); return Array.from({ length: NB }, (_, i) => { const lo = M0 + i, hi = lo + 1; return poisson(rnd, bgInt(lo, hi) + SIG_N * (Phi((hi - SIG_M) / SIG_W) - Phi((lo - SIG_M) / SIG_W))); }); })();
  const fbin = (i, A, b) => A * Math.exp(-b * (M0 + i + 0.5 - 130));
  const inWin = (i, c, w) => Math.abs(M0 + i + 0.5 - c) <= w + 1e-9;
  function stats(A, b, c, w) {
    let chi = 0, nOut = 0, N = 0, B = 0;
    for (let i = 0; i < NB; i++) { const f = fbin(i, A, b); if (inWin(i, c, w)) { N += DATA[i]; B += f; } else { chi += (DATA[i] - f) ** 2 / f; nOut++; } }
    return { chi, ndf: nOut - 2, N, B, Z: (N - B) / Math.sqrt(B) };
  }
  let REF = null; // best sideband fit with window 124–128 GeV (computed lazily)
  const ref = () => { if (!REF) { for (let A = 360; A <= 440; A += 0.5) for (let b = 0.02; b <= 0.04; b += 0.0002) { const s = stats(A, b, 126, 2); if (!REF || s.chi < REF.chi) REF = Object.assign(s, { A, b }); } } return REF; };

  function stage3(ctx) {
    const C = (n) => ctx.color(n);
    const r0 = ref(), zc0 = Math.hypot(r0.Z, Z4L);
    return {
      title: '在本底里找峰',
      task: R`<p>2012 年 7 月，日内瓦。理论预言还剩一个自旋 0 的中性粒子，但不预言它的质量；LEP 已排除了 114.4 GeV 以下，Tevatron 排除了 160 GeV 附近。如果它在 110–150 GeV 之间，最干净的信号是衰变成两个光子：量能器测出两个光子的能量和夹角，算出不变质量 $m_{\gamma\gamma}$。量子色动力学过程产生的双光子构成一个平滑下降的本底，事例多得多。</p>
<p>下面是双光子不变质量谱（合成的示意数据：事例数的量级参考 ATLAS 2011–2012 年约 10 fb⁻¹ 的数据，信号相对本底比实际更突出一些）。用 $A\,e^{-b(m-130)}$ 描述本底：选一个窗口挡住可疑区域，只用两侧（边带）拟合 $A$、$b$，下方的残差图会帮你看清哪里有系统性的超出。点击谱图可以移动窗口。</p>
<p>超出在哪里？它的统计显著性有多大？够不够“5σ”的发现标准？</p>`,
      hints: [
        R`先粗调 $A$ 让曲线压在数据中部，再调 $b$ 让两端都贴合，直到边带 $\chi^2/\text{ndf}$ 接近 1。残差图上，连续几个 bin 都在 $+1\sigma$ 带之上的地方就是候选。`,
        R`窗口内观测 $N$ 个事例，本底估计 $B$ 个，超出 $S = N - B$。若没有信号，$N$ 服从均值 $B$ 的泊松分布，标准差 $\sqrt B$，所以局域显著性 $Z\approx S/\sqrt B$。`,
        R`对高斯峰（分辨率 $\sigma_m = 1.6$ GeV），窗口 $\pm w$ 的期望显著性 $\propto\operatorname{erf}(w/\sqrt2\sigma_m)/\sqrt w$，在 $w\approx 1.4\sigma_m\approx 2.2$ GeV 时最大；取 124–128 GeV 得 $Z\approx ${r0.Z.toFixed(1)}$。别在数据上反复挑窗口追求最大的 $Z$，那会高估显著性。独立的道在高斯近似下按平方相加：$Z^2 = Z_1^2 + Z_2^2$。`,
      ],
      answer: R`峰在约 126 GeV。取窗口 124–128 GeV，边带拟合得 $A\approx ${r0.A.toFixed(0)}$、$b\approx ${r0.b.toFixed(3)}$/GeV；窗口内 $N = ${r0.N}$，$B\approx ${r0.B.toFixed(0)}$，$S\approx ${(r0.N - r0.B).toFixed(0)}$，$Z\approx S/\sqrt B\approx ${r0.Z.toFixed(1)}$，单靠双光子道不到 5σ。与独立的 $ZZ^*\to4\ell$ 道（3.6σ）合并：$\sqrt{${r0.Z.toFixed(1)}^2 + 3.6^2}\approx ${zc0.toFixed(1)}$σ。真实情况：ATLAS 的 γγ 为 4.5σ、4ℓ 为 3.6σ，加上 WW 共 5.9σ；CMS 为 5.0σ。两个独立实验各自过线，2012 年 7 月 4 日宣布发现。`,
      build(body, api) {
        const h = H;
        const st = { A: 330, b: 0.02, c: 140, w: 3 };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.66, minH: 280, maxH: 440 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sA = h.slider({ label: '本底归一 A（130 GeV 处）', min: 300, max: 500, step: 0.5, value: st.A, format: (v) => v.toFixed(1) + ' /GeV', onInput: (v) => { st.A = v; draw(); } });
        const sb = h.slider({ label: '本底斜率 b', min: 0.01, max: 0.05, step: 0.0002, value: st.b, format: (v) => v.toFixed(4) + ' /GeV', onInput: (v) => { st.b = v; draw(); } });
        const sc = h.slider({ label: '窗口中心', min: 102, max: 158, step: 0.5, value: st.c, format: (v) => v.toFixed(1) + ' GeV', onInput: (v) => { st.c = v; draw(); } });
        const sw = h.slider({ label: '窗口半宽', min: 1, max: 6, step: 0.5, value: st.w, format: (v) => '±' + v.toFixed(1) + ' GeV', onInput: (v) => { st.w = v; draw(); } });
        ctl.append(sA.el, sb.el, sc.el, sw.el);
        const roW = h.el('div', { class: 'lab-readout' });
        const ro = { q: h.readout('边带 χ²/ndf'), N: h.readout('窗口内观测 N'), B: h.readout('窗口内本底 B'), S: h.readout('超出 N − B') };
        Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);

        const box = sec('结论'); body.append(box);
        let okM = false, okZ = false, okC = false, zg = null;
        const fin = () => { if (okM && okZ && okC) api.done(R`<b>发现</b>：2012 年 7 月 4 日，ATLAS 与 CMS 各自报告在约 125 GeV 处超过 5σ 的新粒子，主要来自 γγ 与 $ZZ^*\to4\ell$ 两个质量分辨率最好的道。显著性 $\propto\sqrt{\text{数据量}}$，单一道、单一实验都还差一点，独立的道与独立的实验合起来才越过 5σ（单侧 $p = 2.9\times10^{-7}$）。双光子衰变还说明它不是自旋 1（朗道–杨定理）。这正是 BEH 机制剩下的那个标量。`); };
        const aM = H.answer({
          label: '超出的位置 $m_{\\gamma\\gamma}$ ≈ ?（容差 ±1.5 GeV）', unit: 'GeV', placeholder: 'm',
          check: (x) => {
            if (Math.abs(x - SIG_M) <= 1.5) return { ok: true, msg: '对：超出集中在 125–127 GeV。' };
            if (x < 100 || x > 160) return { ok: false, msg: '谱图只覆盖 100–160 GeV。' };
            return { ok: false, msg: '再看残差图：哪里有连续几个 bin 一起偏高？' };
          },
          onOk: () => { okM = true; fin(); },
        });
        const aZ = H.answer({
          label: '用你的本底拟合和窗口，局域显著性 $Z\\approx S/\\sqrt B$ = ?（容差 ±10%）', unit: 'σ', placeholder: 'Z',
          check: (x) => {
            const s = stats(st.A, st.b, st.c, st.w), q = s.chi / s.ndf;
            if (q > 1.6) return { ok: false, msg: `本底还没拟合好：边带 χ²/ndf = ${q.toFixed(2)}（要求 ≤ 1.6）。` };
            if (Math.abs(st.c - SIG_M) > 2.5 || st.w > 4) return { ok: false, msg: '窗口没有对准超出（或太宽，把太多本底也算了进去）。' };
            if (Math.abs(x - s.Z) <= 0.1 * Math.abs(s.Z)) { zg = x; return { ok: true, msg: `对：$Z\\approx ${s.Z.toFixed(2)}$。局域 p 值约 ${(1 - Phi(s.Z)).toExponential(1)}，已很罕见，但还没到 5σ。` }; }
            const SB = (s.N - s.B) / s.B; if (Math.abs(x - SB) <= 0.1 * Math.abs(SB) + 1e-9) return { ok: false, msg: '这是 S/B（信本比），不是显著性。涨落的尺度是 √B。' };
            if (Math.abs(x - (s.N - s.B) / Math.sqrt(s.N)) <= 0.02) return { ok: false, msg: '接近，但零假设下的涨落是 √B 而不是 √N。' };
            return { ok: false, msg: `用读数：N = ${s.N}，B = ${s.B.toFixed(1)}。` };
          },
          onOk: () => { okZ = true; fin(); },
        });
        const aC = H.answer({
          label: '同一质量处，独立的 $ZZ^*\\to4\\ell$ 道给出 3.6σ。两道合并的显著性 ≈ ?（高斯近似；容差 ±6%）', unit: 'σ', placeholder: 'Z',
          check: (x) => {
            if (zg == null) return { ok: false, msg: '先算出双光子道的显著性。' };
            const zc = Math.hypot(zg, Z4L);
            if (Math.abs(x - zc) <= 0.06 * zc) return { ok: true, msg: `对：$\\sqrt{Z_1^2 + Z_2^2}\\approx ${zc.toFixed(1)}$σ` + (zc >= 5 ? '，越过了 5σ。' : '，接近 5σ；真实分析还加入了 WW 道，并按事例质量分类，ATLAS 合并后为 5.9σ。') };
            if (Math.abs(x - (zg + Z4L)) <= 0.06 * (zg + Z4L)) return { ok: false, msg: '显著性不能直接相加。想想 Z = S/√B：两道的 S、B 各自相加时，最优加权的结果是什么？' };
            if (Math.abs(x - Math.max(zg, Z4L)) < 0.2) return { ok: false, msg: '独立的证据应当让显著性增加。' };
            return { ok: false, msg: '高斯近似下 Z² 可加。' };
          },
          onOk: () => { okC = true; fin(); },
        });
        box.append(aM.el, aZ.el, aC.el);

        let geo = null;
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const H1 = Math.round(Hh * 0.64);
          const ax = h.axes(g, W, H1, { x0: M0, x1: M0 + NB, y0: 120, y1: 1080, pad: { l: 46, r: 10, t: 12, b: 20 }, xTicks: [100, 110, 120, 130, 140, 150, 160], yTicks: [200, 400, 600, 800, 1000], fmtX: () => '', yLabel: '事例 / GeV' }, C);
          g.save(); g.translate(0, H1);
          const ax2 = h.axes(g, W, Hh - H1, { x0: M0, x1: M0 + NB, y0: -90, y1: 110, pad: { l: 46, r: 10, t: 6, b: 32 }, xTicks: [100, 110, 120, 130, 140, 150, 160], yTicks: [-50, 0, 50, 100], xLabel: 'm_γγ (GeV)', yLabel: '数据 − 本底' }, C);
          g.restore();
          geo = { ax };
          const Y2 = (y) => H1 + ax2.Y(y);
          // window band
          g.fillStyle = C('--accent'); g.globalAlpha = 0.14;
          const xa = ax.X(Math.max(M0, st.c - st.w)), xb = ax.X(Math.min(M0 + NB, st.c + st.w));
          g.fillRect(xa, ax.p.t, xb - xa, ax.ih); g.fillRect(xa, H1 + ax2.p.t, xb - xa, ax2.ih); g.globalAlpha = 1;
          // ±1σ band in residual panel
          g.fillStyle = C('--grid'); g.globalAlpha = 0.6; g.beginPath();
          for (let i = 0; i <= NB; i++) { const m = M0 + i, f = st.A * Math.exp(-st.b * (m - 130)); i ? g.lineTo(ax.X(m), Y2(Math.sqrt(f))) : g.moveTo(ax.X(m), Y2(Math.sqrt(f))); }
          for (let i = NB; i >= 0; i--) { const m = M0 + i, f = st.A * Math.exp(-st.b * (m - 130)); g.lineTo(ax.X(m), Y2(-Math.sqrt(f))); }
          g.closePath(); g.fill(); g.globalAlpha = 1;
          g.strokeStyle = C('--muted'); g.beginPath(); g.moveTo(ax.X(M0), Y2(0)); g.lineTo(ax.X(M0 + NB), Y2(0)); g.stroke();
          // background curve
          g.strokeStyle = C('--s1'); g.lineWidth = 2; g.beginPath();
          for (let i = 0; i <= 120; i++) { const m = M0 + i / 2, y = ax.Y(st.A * Math.exp(-st.b * (m - 130))); i ? g.lineTo(ax.X(m), y) : g.moveTo(ax.X(m), y); }
          g.stroke();
          // data with √n error bars, and residuals
          g.fillStyle = C('--fg'); g.strokeStyle = C('--fg'); g.lineWidth = 1;
          for (let i = 0; i < NB; i++) {
            const x = ax.X(M0 + i + 0.5), n = DATA[i], e = Math.sqrt(n), f = fbin(i, st.A, st.b), r = n - f;
            g.beginPath(); g.moveTo(x, ax.Y(n - e)); g.lineTo(x, ax.Y(n + e)); g.stroke();
            g.beginPath(); g.arc(x, ax.Y(n), 2.2, 0, 6.283); g.fill();
            const yr = Math.max(-90, Math.min(110, r));
            g.beginPath(); g.moveTo(x, Y2(Math.max(-90, r - e))); g.lineTo(x, Y2(Math.min(110, r + e))); g.stroke();
            g.beginPath(); g.arc(x, Y2(yr), 2.2, 0, 6.283); g.fill();
          }
          g.font = '11px ' + mono; g.fillStyle = C('--muted'); g.textAlign = 'right'; g.textBaseline = 'top';
          g.fillText('合成数据（示意）', ax.p.l + ax.iw - 6, ax.p.t + 4);
          g.fillStyle = C('--s1'); g.fillText('本底 A·e^(−b(m−130))', ax.p.l + ax.iw - 6, ax.p.t + 18);
          readouts();
        }
        function readouts() {
          const s = stats(st.A, st.b, st.c, st.w);
          ro.q.set((s.chi / s.ndf).toFixed(2) + '（ndf = ' + s.ndf + '）'); ro.N.set(String(s.N)); ro.B.set(s.B.toFixed(1)); ro.S.set((s.N - s.B).toFixed(1));
        }
        function onPtr(e) {
          if (!geo) return;
          const r = cv.canvas.getBoundingClientRect(), px = e.clientX - r.left, a = geo.ax;
          const m = M0 + ((px - a.p.l) / a.iw) * NB;
          if (m < M0 || m > M0 + NB) return;
          st.c = Math.max(102, Math.min(158, Math.round(m * 2) / 2)); sc.set(st.c); draw();
        }
        cv.canvas.addEventListener('pointerdown', onPtr);
        cv.onResize(draw);
        const un = watchTheme(draw);
        draw();
        return { destroy() { cv.destroy(); un(); cv.canvas.removeEventListener('pointerdown', onPtr); } };
      },
    };
  }

  CHALLENGES.higgs = {
    title: '质量从何而来',
    mount(root, ctx) {
      injectStyle();
      return H.stages(root, ctx, [stage1(ctx), stage2(ctx), stage3(ctx)]);
    },
  };
})();
