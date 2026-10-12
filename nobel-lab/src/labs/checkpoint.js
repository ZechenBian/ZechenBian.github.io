/* 免疫检查点台 — Nobel Medicine 2018 (Allison & Honjo)
 * 三块（示意模型，参数不来自实测；真实数据见 content/checkpoint.js 的 papers）：
 *  A「刹车的分子形式」：CTLA-4 与 CD28 竞争同一配体 B7。
 *     θ28 = ([B]/K28) / (1 + [B]/K28 + ([B]/K4)·(R4/R28))，K4 = K28/15（CTLA-4 亲和力高 10–20 倍）
 *     激活后 R4 上调 → θ28 被压低；阻断 CTLA-4 使 R4→0，θ28 回升。[B]=0 时阻断无效（冷肿瘤的分子版本）。
 *  B「油门与刹车」：dx/dt = r·x(1−x/K) − β·x·y/(g+x)；dy/dt = s₀ + σ·x/(h+x) − μ·y − φ·x·y/(q+x)
 *     r=0.30, K=1e9, β=6, g=h=q=1e7, s₀=2e5, σ=1.5e6, μ=0.20
 *     y*(x) 随 x 下降（正反馈逃逸）⟺ φ > φ_c = μσ/s₀ = 1.5
 *     φ=4（未治疗）逃逸阈值 1.7e6；φ=0.5 阈值 3.1e7；冷瘤 σ=6e4 时 φ→0 阈值仍只有 1.2e7。
 *  C「生存曲线的平台」：混合治愈 S(t) = π + (1−π)e^(−λt)；π>1/2 时中位生存期无解。
 *     RMST(τ) = ∫₀^τ S = πτ + (1−π)(1−e^(−λτ))/λ。
 *     CheckMate 067 五年数据（Larkin 等, NEJM 381, 1535, 2019）：5 年 OS 52%/44%/26%，3–4 级 AE 59%/21%/28%。
 */
(() => {
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };

  /* A: 竞争结合 */
  const K28 = 1.0, KRATIO = 15;            // K4 = K28/15
  const occ28 = (B, R4, block) => {
    const r4 = block ? 0 : R4;
    return (B / K28) / (1 + B / K28 + (B * KRATIO / K28) * r4);
  };
  /* B: ODE */
  const Q = { r: 0.30, K: 1e9, beta: 6, g: 1e7, s0: 2e5, sigma: 1.5e6, mu: 0.20, h: 1e7, phi: 4.0, q: 1e7 };
  const ystar = (x, p) => (p.s0 + (p.sigma * x) / (p.h + x)) / (p.mu + (p.phi * x) / (p.q + x));
  function runODE(o, x0, days = 500) {
    const p = Object.assign({}, Q, o);
    const dt = 0.05; let x = x0, y = p.s0 / p.mu;
    const tr = { t: [], x: [], y: [] };
    for (let i = 0; i <= days / dt; i++) {
      const f = (x, y) => [p.r * x * (1 - x / p.K) - (p.beta * x * y) / (p.g + x),
        p.s0 + (p.sigma * x) / (p.h + x) - p.mu * y - (p.phi * x * y) / (p.q + x)];
      const k1 = f(x, y), k2 = f(x + dt / 2 * k1[0], y + dt / 2 * k1[1]);
      const k3 = f(x + dt / 2 * k2[0], y + dt / 2 * k2[1]), k4 = f(x + dt * k3[0], y + dt * k3[1]);
      x = Math.max(0, x + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]));
      y = Math.max(0, y + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]));
      if (x < 1) x = 0;
      if (i % 20 === 0) { tr.t.push(i * dt); tr.x.push(x); tr.y.push(y); }
      if (x === 0) break;
    }
    tr.cleared = x === 0; tr.xend = x;
    return tr;
  }
  function threshold(o) {
    let lo = 1e3, hi = 8e8;
    if (runODE(o, hi).cleared) return Infinity;
    if (!runODE(o, lo).cleared) return 0;
    for (let i = 0; i < 30; i++) { const m = Math.sqrt(lo * hi); if (runODE(o, m).cleared) lo = m; else hi = m; }
    return Math.sqrt(lo * hi);
  }
  /* C: 混合治愈 */
  const Sv = (t, pi, lam) => pi + (1 - pi) * Math.exp(-lam * t);
  const rmst = (tau, pi, lam) => pi * tau + (1 - pi) * (1 - Math.exp(-lam * tau)) / lam;

  LABS.checkpoint = {
    title: '免疫检查点台',
    _m: { occ28, runODE, threshold, ystar, Sv, rmst },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { view: 'brake', B: 1.0, R4: 1.0, block: false, phi: 4.0, sigma: Q.sigma, x0: 3e7, pi: 0.3, lam: 0.55, tau: 5 };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '「竞争」：把 CTLA-4 的表面量 R₄ 拉高（T 细胞激活后就是这样），CD28 的占据率被压下去；勾上"阻断 CTLA-4"它立刻回升。再把配体 B7 拨到 0——阻断就完全失效，这是"冷肿瘤"的分子版本。「动力学」：拖 φ 往下，看逃逸阈值越过瘤负荷的那一刻；再把 φ 放回 4.0 改拖 σ，要 5.5 倍才追得上，而且 φ_c 跟着一起涨。「生存」：把 π 拖过 50%，中位生存期直接失去定义。' });
      root.append(stage, controls, readout, hint);
      const cv = h.canvas(stage, { aspect: 0.54, minH: 200, maxH: 310 });

      const cView = h.choice({ label: '看哪一块', value: 'brake',
        options: [{ value: 'brake', label: '竞争结合' }, { value: 'ode', label: '动力学' }, { value: 'surv', label: '生存曲线' }],
        onChange: (v) => { S.view = v; sync(); draw(); } });
      const sB = h.slider({ label: '配体 B7 的量（肿瘤的免疫原性）', min: 0, max: 3, step: 0.02, value: 1,
        format: (v) => v.toFixed(2), onInput: (v) => { S.B = v; draw(); } });
      const sR4 = h.slider({ label: 'CTLA-4 表面量 R₄（激活后上调）', min: 0, max: 3, step: 0.02, value: 1,
        format: (v) => v.toFixed(2), onInput: (v) => { S.R4 = v; draw(); } });
      const tBlk = h.toggle({ label: '阻断 CTLA-4（抗体）', onChange: (b) => { S.block = b; draw(); } });
      const sPhi = h.slider({ label: 'φ（刹车）', min: -1.4, max: 0.9, step: 0.01, value: Math.log10(4),
        format: (v) => (10 ** v).toFixed(2), onInput: (v) => { S.phi = 10 ** v; draw(); } });
      const sSig = h.slider({ label: 'σ（油门）', min: 4.5, max: 8.5, step: 0.02, value: Math.log10(Q.sigma),
        format: (v) => sci(10 ** v, 1), onInput: (v) => { S.sigma = 10 ** v; draw(); } });
      const sX0 = h.slider({ label: '起始瘤负荷 x₀', min: 5, max: 8.5, step: 0.05, value: Math.log10(3e7),
        format: (v) => sci(10 ** v, 1), onInput: (v) => { S.x0 = 10 ** v; draw(); } });
      const sPi = h.slider({ label: '长期无复发比例 π', min: 0, max: 0.8, step: 0.01, value: 0.3,
        format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { S.pi = v; draw(); } });
      const sLam = h.slider({ label: '未治愈者的风险 λ', min: 0.15, max: 1.6, step: 0.01, value: 0.55,
        format: (v) => v.toFixed(2) + ' /y', onInput: (v) => { S.lam = v; draw(); } });
      const sTau = h.slider({ label: 'RMST 的窗口 τ', min: 1, max: 10, step: 0.5, value: 5,
        format: (v) => v.toFixed(1) + ' y', onInput: (v) => { S.tau = v; draw(); } });
      controls.append(cView.el, sB.el, sR4.el, tBlk.el, sPhi.el, sSig.el, sX0.el, sPi.el, sLam.el, sTau.el);

      const R = {
        a: h.readout('CD28 占据率 θ₂₈'), b: h.readout('阻断带来的增益'), c: h.readout('CTLA-4 占据 B7 的份额'),
        d: h.readout('逃逸阈值 x*'), e: h.readout('x₀ 的结局'), f: h.readout('φ_c = μσ/s₀ 与反馈方向'),
        g: h.readout('中位生存期'), i: h.readout('5 年生存率'), j: h.readout('RMST(τ) 与对 π=0 的增益'),
      };
      Object.values(R).forEach((x) => readout.append(x.el));

      function sync() {
        const v = S.view;
        [sB, sR4].forEach((x) => (x.el.style.display = v === 'brake' ? '' : 'none'));
        tBlk.el.style.display = v === 'brake' ? '' : 'none';
        [sPhi, sSig, sX0].forEach((x) => (x.el.style.display = v === 'ode' ? '' : 'none'));
        [sPi, sLam, sTau].forEach((x) => (x.el.style.display = v === 'surv' ? '' : 'none'));
        [R.a, R.b, R.c].forEach((x) => (x.el.style.display = v === 'brake' ? '' : 'none'));
        [R.d, R.e, R.f].forEach((x) => (x.el.style.display = v === 'ode' ? '' : 'none'));
        [R.g, R.i, R.j].forEach((x) => (x.el.style.display = v === 'surv' ? '' : 'none'));
      }
      const line = (g, A, xs, ys, color, w = 2, dash = null) => {
        g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
        g.beginPath();
        for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.restore();
      };

      /* ---------- A ---------- */
      function drawBrake() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const A = h.axes(g, W, Hh, { x0: 0, x1: 3, y0: 0, y1: 1.02, pad: { l: 52, r: 14, t: 14, b: 34 },
          xTicks: [0, 1, 2, 3], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => (100 * v).toFixed(0) + '%',
          xLabel: 'CTLA-4 表面量 R₄', yLabel: 'CD28 的占据率 θ₂₈（= 信号二）' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const xs = [], y1 = [], y2 = [];
        for (let i = 0; i <= 150; i++) { const r = 3 * i / 150; xs.push(r); y1.push(occ28(S.B, r, false)); y2.push(occ28(S.B, r, true)); }
        line(g, A, xs, y2, C('--good'), 1.8, [5, 4]);       // 阻断后（与 R4 无关，水平线）
        line(g, A, xs, y1, C('--s2'), 2.4);                  // 未阻断
        const cur = occ28(S.B, S.R4, S.block);
        g.strokeStyle = C('--line'); g.lineWidth = 1.3; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(A.X(S.R4), A.p.t); g.lineTo(A.X(S.R4), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(A.X(S.R4), A.Y(cur), 5.5, 0, 6.283); g.fill(); g.stroke();
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'bottom';
        g.fillStyle = C('--good'); g.textAlign = 'left'; g.fillText('阻断 CTLA-4 后', A.p.l + 4, A.Y(occ28(S.B, 0, true)) - 4);
        g.fillStyle = C('--s2'); g.textAlign = 'right'; g.fillText('未阻断', A.p.l + A.iw - 4, A.Y(occ28(S.B, 3, false)) - 4);
        const base = occ28(S.B, S.R4, false), blk = occ28(S.B, S.R4, true);
        R.a.set((100 * cur).toFixed(1) + '%' + (S.block ? '（已阻断）' : ''));
        R.b.set(base > 1e-9 ? '×' + (blk / base).toFixed(2) + `　（${(100 * base).toFixed(1)}% → ${(100 * blk).toFixed(1)}%）` : '无配体，阻断无效');
        const f4 = S.B > 0 ? (S.B * KRATIO / K28) * S.R4 / (1 + S.B / K28 + (S.B * KRATIO / K28) * S.R4) : 0;
        R.c.set((100 * f4).toFixed(1) + '%' + (S.B === 0 ? '　（没有 B7，谁都结合不上）' : ''));
      }

      /* ---------- B ---------- */
      function drawODE() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const o = { phi: S.phi, sigma: S.sigma };
        const tr = runODE(o, S.x0), thr = threshold(o), p = Object.assign({}, Q, o);
        const A = h.axes(g, W, Hh, { x0: 0, x1: 500, y0: 1e4, y1: 2e9, logY: true, pad: { l: 58, r: 14, t: 14, b: 34 },
          xTicks: [0, 100, 200, 300, 400, 500], yTicks: [1e4, 1e5, 1e6, 1e7, 1e8, 1e9],
          fmtY: (v) => '10' + sup(Math.round(Math.log10(v))), xLabel: '时间（天）', yLabel: '细胞数（对数）' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        if (thr > 0 && thr !== Infinity) {
          g.strokeStyle = C('--warn'); g.lineWidth = 1.4; g.setLineDash([5, 4]);
          g.beginPath(); g.moveTo(A.p.l, A.Y(thr)); g.lineTo(A.p.l + A.iw, A.Y(thr)); g.stroke(); g.setLineDash([]);
        }
        line(g, A, tr.t, tr.x.map((v) => Math.max(1e4, v)), C('--s2'), 2.4);
        line(g, A, tr.t, tr.y.map((v) => Math.max(1e4, v)), C('--s1'), 1.8);
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'bottom';
        if (thr > 0 && thr !== Infinity) { g.fillStyle = C('--warn'); g.textAlign = 'right'; g.fillText('逃逸阈值', A.p.l + A.iw - 4, A.Y(thr) - 3); }
        g.fillStyle = C('--s2'); g.textAlign = 'left'; g.fillText('肿瘤 x', A.p.l + 4, A.p.t + 14);
        g.fillStyle = C('--s1'); g.fillText('T 细胞 y', A.p.l + 4, A.p.t + 27);
        R.d.set(thr === Infinity ? '∞（任何大小都被清除）' : thr === 0 ? '0（任何大小都逃逸）' : sci(thr));
        R.e.set(tr.cleared ? '清除' : '逃逸到 ' + sci(tr.xend));
        const pc = (Q.mu * S.sigma) / Q.s0, falls = ystar(1e9, p) < ystar(1e5, p);
        R.f.set(`φ_c = ${pc.toFixed(2)}　φ = ${S.phi.toFixed(2)}　→ y*(x) ${falls ? '下降（正反馈逃逸）' : '上升（负反馈清除）'}`);
      }

      /* ---------- C ---------- */
      function drawSurv() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const A = h.axes(g, W, Hh, { x0: 0, x1: 10, y0: 0, y1: 1.02, pad: { l: 52, r: 14, t: 14, b: 34 },
          xTicks: [0, 2, 4, 6, 8, 10], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => (100 * v).toFixed(0) + '%',
          xLabel: '时间（年）', yLabel: '生存率 S(t)' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.fillStyle = C('--s1'); g.globalAlpha = 0.16;
        g.beginPath(); g.moveTo(A.X(0), A.Y(0));
        for (let i = 0; i <= 120; i++) { const t = S.tau * i / 120; g.lineTo(A.X(t), A.Y(Sv(t, S.pi, S.lam))); }
        g.lineTo(A.X(S.tau), A.Y(0)); g.closePath(); g.fill(); g.globalAlpha = 1;
        [[0.5, '--warn'], [S.pi, '--accent']].forEach(([v, tok]) => {
          g.strokeStyle = C(tok); g.lineWidth = 1.3; g.setLineDash([5, 4]);
          g.beginPath(); g.moveTo(A.p.l, A.Y(v)); g.lineTo(A.p.l + A.iw, A.Y(v)); g.stroke(); g.setLineDash([]);
        });
        const xs = [], ys = [];
        for (let i = 0; i <= 240; i++) { const t = 10 * i / 240; xs.push(t); ys.push(Sv(t, S.pi, S.lam)); }
        line(g, A, xs, ys, C('--s1'), 2.4);
        const med = S.pi >= 0.5 ? null : -Math.log((0.5 - S.pi) / (1 - S.pi)) / S.lam;
        if (med != null && med <= 10) { g.strokeStyle = C('--warn'); g.lineWidth = 1.6; g.beginPath(); g.moveTo(A.X(med), A.Y(0.5)); g.lineTo(A.X(med), A.p.t + A.ih); g.stroke(); }
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'bottom';
        g.fillStyle = C('--accent'); g.textAlign = 'right'; g.fillText('π = ' + (100 * S.pi).toFixed(0) + '%', A.p.l + A.iw - 4, A.Y(S.pi) - 3);
        g.fillStyle = C('--warn'); g.textAlign = 'left';
        g.fillText(med == null ? '曲线永远不下穿 50% → 中位数无解' : '50%', A.p.l + 4, A.Y(0.5) - 3);
        R.g.set(med == null ? '未达到（方程无解）' : med.toFixed(2) + ' 年');
        R.i.set((100 * Sv(5, S.pi, S.lam)).toFixed(1) + '%');
        R.j.set(rmst(S.tau, S.pi, S.lam).toFixed(2) + ' 年　(+' + (rmst(S.tau, S.pi, S.lam) - rmst(S.tau, 0, S.lam)).toFixed(2) + ')');
      }

      function draw() {
        const g = cv.g;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, cv.w, cv.h);
        if (S.view === 'brake') drawBrake(); else if (S.view === 'ode') drawODE(); else drawSurv();
      }
      sync(); draw();
      cv.onResize(draw);
      const mo = new MutationObserver(draw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener && mq.addEventListener('change', draw);
      return { destroy() { cv.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', draw); } };
    },
  };
})();
