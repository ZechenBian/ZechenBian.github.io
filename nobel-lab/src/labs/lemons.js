/* 信息不对称的三个市场 — Economic Sciences 2001 (Akerlof, Spence, Stiglitz)
 * 柠檬：θ ~ U[a, 1]，卖家估值 θ，买家 vθ。m(p) = (a + p)/2 (a ≤ p ≤ 1)。v < 2 时最大不动点
 *   p* = va/(2 − v)（若 ≥ 1 则全部成交，条件 v ≥ 2/(1 + a)）。a = 0 ⇒ 完全瓦解。逐轮调价 p ← v·m(p) 从 p = 1 出发。
 * 信号：y_L = 1, y_H = 2，c_L(e) = e，c_H(e) = k·e (0 < k < 1)。分离区间 e* ∈ [1, 1/k]；直觉准则选 e* = 1，
 *   H 净得 2 − k；无信号混同工资 1 + λ。
 * 保险：W = 100, d = 80, p_H = 0.5, u = ln。L 的激励相容保额 q* 解 p_L(1−p_L)q² − (100 − 120 p_L)q + 1600 = 0（小根）。
 *   平均公平线 p̄ = λp_L + (1−λ)p_H 上 L 最优保额 q_pool = [100 p_L(1−p̄) − 20(1−p_L)p̄]/[p̄(1−p̄)]；
 *   若 U_L(q_pool) > U_L(q*) 则分离菜单被打破，RS 均衡不存在（p_L = 0.25 时 λ > 0.705）。
 */
(() => {
  const W = 100, D = 80, PH = 0.5;
  const EU = (p, q, P) => (1 - p) * Math.log(W - P) + p * Math.log(W - D + q - P);
  const qStar = (pl) => { const A = pl * (1 - pl), B = 100 - 120 * pl; return (B - Math.sqrt(B * B - 6400 * A)) / (2 * A); };
  const qPool = (pl, pb) => Math.max(0, Math.min(D, (100 * pl * (1 - pb) - 20 * (1 - pl) * pb) / (pb * (1 - pb))));
  function rs(pl, lam) {
    const qs = qStar(pl), pb = lam * pl + (1 - lam) * PH, qp = qPool(pl, pb);
    const uSep = EU(pl, qs, pl * qs), uPool = EU(pl, qp, pb * qp);
    return { qs, pb, qp, uSep, uPool, exists: uPool <= uSep + 1e-12 };
  }
  function lemonEq(v, a) { // largest fixed point of p = v·m(p) on [a, 1] (p = 1 means everything trades)
    if (v >= 2 / (1 + a) - 1e-12) return 1;
    return a > 0 ? (v * a) / (2 - v) : 0;
  }

  LABS.lemons = {
    title: '信息不对称的三个市场',
    _m: { qStar, qPool, rs, lemonEq, EU },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { view: 'lemon', v: 1.5, a: 0, k: 0.5, lam: 0.3, e: 1.5, pl: 0.25, ls: 0.5 };
      const stage = h.el('div', { class: 'lab-stage' }), controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint' });
      root.append(stage, controls, readout, hint);
      const cv = h.canvas(stage, { aspect: 0.66, minH: 250, maxH: 400 });
      const HINTS = {
        lemon: '均匀分布、v = 1.5：曲线 v·E[θ | θ ≤ p] 整条落在 45° 线下方，价格逐轮跌到 0。把 v 拖过 2，或抬高最差车的质量 a，看市场在哪里部分恢复。',
        signal: '粗实线是工资阶梯。分离均衡要求门槛 e* 落在两条无差异线与 w = 2 的交点之间（绿色区间）。把成本比 k 拖近 1，区间缩成一点：信号不再能把两类人分开。',
        ins: '高风险者足额（左边的灰点），低风险者被压在高风险者的无差异曲线以下，只能部分投保（金色点）。把低风险者占比 λ 拖过约 0.7：平均风险公平线上出现一份低风险者更喜欢的合同，菜单被打破。',
      };
      const cView = h.choice({ label: '场景', value: S.view, options: [{ value: 'lemon', label: '柠檬（Akerlof）' }, { value: 'signal', label: '信号（Spence）' }, { value: 'ins', label: '筛选（Rothschild–Stiglitz）' }], onChange: (v) => { S.view = v; sync(); draw(); } });
      const sV = h.slider({ label: '买家估值倍数 v', min: 1, max: 3, step: 0.01, value: S.v, format: (x) => x.toFixed(2), onInput: (x) => { S.v = x; draw(); } });
      const sA = h.slider({ label: '最差车的质量 a（θ ~ U[a, 1]）', min: 0, max: 0.8, step: 0.01, value: S.a, format: (x) => x.toFixed(2), onInput: (x) => { S.a = x; draw(); } });
      const sK = h.slider({ label: '成本比 k = c_H / c_L', min: 0.2, max: 1, step: 0.01, value: S.k, format: (x) => x.toFixed(2), onInput: (x) => { S.k = x; draw(); } });
      const sE = h.slider({ label: '雇主门槛 e*', min: 0, max: 5, step: 0.05, value: S.e, format: (x) => x.toFixed(2), onInput: (x) => { S.e = x; draw(); } });
      const sL = h.slider({ label: '高能力者占比 λ', min: 0.05, max: 0.95, step: 0.01, value: S.lam, format: (x) => x.toFixed(2), onInput: (x) => { S.lam = x; draw(); } });
      const sPL = h.slider({ label: '低风险者出险概率 p_L', min: 0.05, max: 0.45, step: 0.01, value: S.pl, format: (x) => x.toFixed(2), onInput: (x) => { S.pl = x; draw(); } });
      const sLS = h.slider({ label: '低风险者占比 λ', min: 0.02, max: 0.98, step: 0.01, value: S.ls, format: (x) => x.toFixed(2), onInput: (x) => { S.ls = x; draw(); } });
      controls.append(cView.el, sV.el, sA.el, sK.el, sE.el, sL.el, sPL.el, sLS.el);
      const ro = [h.readout(''), h.readout(''), h.readout(''), h.readout('')];
      ro.forEach((r) => readout.append(r.el));
      const setRo = (pairs) => pairs.forEach(([lab, val], i) => { ro[i].el.querySelector('.ro-lab').textContent = lab; ro[i].set(val); });
      function sync() {
        const vis = { lemon: [sV, sA], signal: [sK, sE, sL], ins: [sPL, sLS] }[S.view];
        [sV, sA, sK, sE, sL, sPL, sLS].forEach((c) => { c.el.style.display = vis.includes(c) ? '' : 'none'; });
        hint.textContent = HINTS[S.view];
      }

      function curve(g, A, x0, x1, f, color, w, dash) {
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.strokeStyle = color; g.lineWidth = w || 2; g.setLineDash(dash || []); g.beginPath(); let first = true;
        for (let i = 0; i <= 240; i++) { const x = x0 + ((x1 - x0) * i) / 240, y = f(x); if (!isFinite(y)) { first = true; continue; } const Y = Math.max(A.p.t - 40, Math.min(A.p.t + A.ih + 40, A.Y(y))); first ? g.moveTo(A.X(x), Y) : g.lineTo(A.X(x), Y); first = false; }
        g.stroke(); g.restore();
      }
      const dot = (g, x, y, r, fill) => { g.fillStyle = fill; g.strokeStyle = C('--panel'); g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); };
      function legend(g, items, x, y, xMax) {
        g.font = '11px ' + (C('--body-font') || 'sans-serif'); g.textBaseline = 'middle'; g.textAlign = 'left'; const x0 = x;
        for (const [lab, c, dash] of items) {
          if (x + 22 + g.measureText(lab).width > xMax) { x = x0; y += 15; }
          g.strokeStyle = c; g.lineWidth = 2; g.setLineDash(dash ? [4, 3] : []); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]);
          g.fillStyle = C('--muted'); g.fillText(lab, x + 18, y); x += 30 + g.measureText(lab).width;
        }
      }
      const top = (Wd) => (Wd < 520 ? 42 : 28);

      function drawLemon(g, Wd, Hh) {
        const v = S.v, a = S.a, m = (p) => (p <= a ? NaN : (a + Math.min(p, 1)) / 2);
        const A = h.axes(g, Wd, Hh, { x0: 0, x1: 1.2, y0: 0, y1: 1.2, pad: { l: 44, r: 12, t: top(Wd), b: 34 }, xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2], yTicks: [0, 0.4, 0.8, 1.2], fmtX: (x) => String(x), fmtY: (x) => String(x), xLabel: '价格 p', yLabel: '买家愿付' }, C);
        curve(g, A, 0, 1.2, (x) => x, C('--muted'), 1.3, [5, 4]);
        curve(g, A, 0, 1.2, (x) => v * m(x), C('--s1'), 2.4);
        // cobweb from p = 1
        let p = 1; g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.strokeStyle = C('--accent'); g.lineWidth = 1.6; g.beginPath(); g.moveTo(A.X(1), A.Y(0));
        for (let k = 0; k < 40; k++) { const q = Math.min(1.2, v * ((a + Math.min(p, 1)) / 2)); g.lineTo(A.X(p), A.Y(q)); g.lineTo(A.X(q), A.Y(q)); if (Math.abs(q - p) < 1e-4) break; p = q; if (p <= a + 1e-6) break; }
        g.stroke(); g.restore();
        const pe = lemonEq(v, a);
        dot(g, A.X(pe), A.Y(pe), 5.5, C('--accent'));
        legend(g, [['45° 线', C('--muted'), 1], ['v·E[θ | θ ≤ p]', C('--s1')], ['从 p = 1 逐轮调价', C('--accent')]], A.p.l, 11, Wd - 6);
        const share = a >= 1 ? 1 : Math.max(0, Math.min(1, (pe - a) / (1 - a)));
        const full = (v - 1) * (a + 1) / 2, got = (v - 1) * ((a + Math.max(a, Math.min(1, pe))) / 2) * share;
        setRo([['均衡价格 p*', pe >= 1 ? '≥ 1（全部成交）' : pe.toFixed(3)], ['成交的车', (100 * share).toFixed(1) + ' %'], ['实现的交易剩余 / 完全信息', `${got.toFixed(3)} / ${full.toFixed(3)}`], ['全部成交需要 v ≥ 2/(1+a)', (2 / (1 + a)).toFixed(3)]]);
      }
      function drawSignal(g, Wd, Hh) {
        const k = S.k, e = S.e, eMax = 1 / k;
        const A = h.axes(g, Wd, Hh, { x0: 0, x1: 5, y0: 0, y1: 3, pad: { l: 44, r: 12, t: top(Wd), b: 34 }, xTicks: [0, 1, 2, 3, 4, 5], yTicks: [0, 1, 2, 3], fmtX: String, fmtY: String, xLabel: '学历 e', yLabel: '工资 w' }, C);
        g.fillStyle = C('--good'); g.globalAlpha = 0.2; g.fillRect(A.X(1), A.Y(2) - 6, A.X(Math.min(5, eMax)) - A.X(1), 12); g.globalAlpha = 1;
        curve(g, A, 0, 5, (x) => 1 + x, C('--s1'), 1.6, [5, 4]);
        curve(g, A, 0, 5, (x) => 1 + k * x, C('--s2'), 1.6, [5, 4]);
        curve(g, A, 0, 5, () => 1 + S.lam, C('--muted'), 1.2, [2, 3]);
        g.strokeStyle = C('--fg'); g.lineWidth = 2.6; g.beginPath(); g.moveTo(A.X(0), A.Y(1)); g.lineTo(A.X(e), A.Y(1)); g.moveTo(A.X(e), A.Y(2)); g.lineTo(A.X(5), A.Y(2)); g.stroke();
        dot(g, A.X(e), A.Y(2), 5.5, C('--accent')); dot(g, A.X(1), A.Y(2), 4, C('--good'));
        legend(g, [['工资阶梯', C('--fg')], ['L 无差异线', C('--s1'), 1], ['H 无差异线', C('--s2'), 1], ['无信号工资 1+λ', C('--muted'), 1]], A.p.l, 11, Wd - 6);
        const Lgo = 2 - e > 1 + 1e-9, Hgo = 2 - k * e >= 1 - 1e-9;
        setRo([['分离均衡区间', k >= 0.999 ? '退化为一点（k = 1：成本相同，无法严格分离）' : `e* ∈ [1, ${eMax.toFixed(2)}]`], ['当前门槛', !Lgo && Hgo ? '信念被证实（分离）' : Lgo ? '被推翻：L 也来读' : '被推翻：H 也不读'], ['H：最省钱分离 / 无信号', `${(2 - k).toFixed(2)} / ${(1 + S.lam).toFixed(2)}`], ['H 宁愿没有文凭？', 1 + S.lam > 2 - k ? '是（λ > 1 − k）' : '否']]);
      }
      function drawIns(g, Wd, Hh) {
        const pl = S.pl, r = rs(pl, S.ls), qs = r.qs;
        const A = h.axes(g, Wd, Hh, { x0: 40, x1: 102, y0: 10, y1: 92, pad: { l: 44, r: 12, t: top(Wd), b: 34 }, xTicks: [40, 50, 60, 70, 80, 90, 100], yTicks: [20, 40, 60, 80], xLabel: '不出险时消费 c₁', yLabel: '出险时消费 c₂' }, C);
        const fair = (p) => (x) => 20 + ((1 - p) / p) * (100 - x);
        const ic = (p, U) => (x) => Math.exp((U - (1 - p) * Math.log(x)) / p);
        curve(g, A, 40, 102, (x) => x, C('--grid'), 1.1);
        curve(g, A, 40, 102, fair(PH), C('--s2'), 1.3, [5, 4]);
        curve(g, A, 40, 102, fair(pl), C('--s1'), 1.3, [5, 4]);
        curve(g, A, 40, 102, fair(r.pb), C('--muted'), 1.3, [2, 3]);
        curve(g, A, 40, 102, ic(PH, Math.log(60)), C('--s2'), 1.8);
        curve(g, A, 40, 102, ic(pl, r.uSep), C('--s1'), 1.8);
        dot(g, A.X(60), A.Y(60), 5, C('--muted'));
        dot(g, A.X(100 - pl * qs), A.Y(20 + (1 - pl) * qs), 5.5, C('--accent'));
        dot(g, A.X(100 - r.pb * r.qp), A.Y(20 + (1 - r.pb) * r.qp), 5, r.exists ? C('--muted') : C('--warn'));
        legend(g, [['H/L 公平线', C('--s2'), 1], ['平均风险公平线', C('--muted'), 1], ['H 无差异线', C('--s2')], ['L 经过其合同', C('--s1')]], A.p.l, 11, Wd - 6);
        // threshold λ for this p_L
        let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; rs(pl, m).exists ? (lo = m) : (hi = m); }
        setRo([['L 的保额 q*（损失 80）', `${qs.toFixed(1)}（${(100 * qs / D).toFixed(0)}%）`], ['平均风险 p̄', r.pb.toFixed(3)], ['RS 均衡', r.exists ? '存在（分离菜单）' : '不存在：混同合同打破菜单'], ['均衡存在需 λ ≤', lo.toFixed(3)]]);
      }
      function draw() {
        const g = cv.g, Wd = cv.w, Hh = cv.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, Wd, Hh);
        ({ lemon: drawLemon, signal: drawSignal, ins: drawIns })[S.view](g, Wd, Hh);
      }
      cv.onResize(draw);
      const mo = new MutationObserver(draw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      if (mq && mq.addEventListener) mq.addEventListener('change', draw);
      sync(); draw();
      return { destroy() { cv.destroy(); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', draw); } };
    },
  };
})();
