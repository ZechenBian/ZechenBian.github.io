/* HIV 动力学台 — Nobel Medicine 2008 (Barré-Sinoussi & Montagnier; zur Hausen)
 * 三块：
 *  A「1983 年的培养」：体外靶细胞受限模型。dT/dt = −d_n·T − k·V·T; d(T*)/dt = k·V·T − δ·T*; dV/dt = p·T* − c·V
 *     k = 7e-9, δ = 0.55 /d, c = 3.0 /d, p = 900 /细胞/天, d_n = 0.02 /d, T0 = 2e6, V0 = 3
 *     峰在第 12 天；不补细胞则一路衰减，补细胞则重新指数上升——这正是 1983 年的判别性实验。
 *  B「给药后的衰减」：Perelson 1996 式 (6)。真值 c = 3.07 /d（t½ 5.4 h）、δ = 0.49 /d（t½ 1.4 d）。
 *     拖 c 看"肩"，拖 δ 看直线段斜率——两个速率的信息藏在曲线的不同段。
 *  C「耐药与联合用药」：E_m = N·μ^m；所需药物数 m ≥ (ln N − ln ε)/ln(1/μ)。
 *     N = 1e10 /天，μ = 3.4e-5（Mansky & Temin 1995）→ m ≥ 2.69，即至少三种。
 */
(() => {
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };

  /* A: 培养 */
  const CK = 7e-9, CD = 0.55, CC = 3.0, CP = 900, CDN = 0.02, CT0 = 2.0e6, CV0 = 3;
  function culture(addDay, days = 44) {
    const dt = 0.005; let T = CT0, Ts = 0, V = CV0;
    const o = { t: [], V: [], T: [] };
    for (let i = 0; i <= Math.round(days / dt); i++) {
      const t = i * dt;
      if (addDay != null && Math.abs(t - addDay) < dt / 2) T += 2.0e6;
      const f = (T, Ts, V) => [-CDN * T - CK * V * T, CK * V * T - CD * Ts, CP * Ts - CC * V];
      const k1 = f(T, Ts, V);
      const k2 = f(T + dt / 2 * k1[0], Ts + dt / 2 * k1[1], V + dt / 2 * k1[2]);
      const k3 = f(T + dt / 2 * k2[0], Ts + dt / 2 * k2[1], V + dt / 2 * k2[2]);
      const k4 = f(T + dt * k3[0], Ts + dt * k3[1], V + dt * k3[2]);
      T = Math.max(0, T + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]));
      Ts = Math.max(0, Ts + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]));
      V = Math.max(0, V + dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]));
      if (i % Math.round(0.2 / dt) === 0) { o.t.push(t); o.V.push(V); o.T.push(T); }
    }
    return o;
  }
  /* B: 给药后 */
  const PC = 3.07, PD = 0.49, PV0 = 1.2e5, PLAG = 0.25;
  function Vload(t, c, d) {
    const s = t - PLAG; if (s <= 0) return PV0;
    const a = Math.exp(-c * s), b = Math.exp(-d * s);
    return PV0 * (a + (c / (c - d)) * ((c / (c - d)) * (b - a) - d * s * a));
  }
  /* C: 耐药 */
  const MU0 = 3.4e-5, N0 = 1e10;

  LABS.hiv = {
    title: 'HIV 动力学台',
    _m: { culture, Vload, PC, PD },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { view: 'culture', add: 20, noAdd: false, c: PC, d: PD, N: 10, mu: Math.log10(MU0), m: 3 };
      let cul = culture(S.add);

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '「培养」：勾上"不补充细胞"，活性升到第 12 天就一路塌下去；取消勾选、拖动补充时间，看它在哪一天都能把病毒重新救活——1983 年正是这个实验把"培养失败"排除掉的。「衰减」：拖 $c$ 只动曲线开头那段"肩"，拖 $\\delta$ 只动后面的直线——两个速率的信息在不同的段里。「耐药」：把药物数从 1 拨到 3，看治疗前已存在耐药株的概率掉几个数量级。' });
      root.append(stage, controls, readout, hint);
      const cv = h.canvas(stage, { aspect: 0.56, minH: 200, maxH: 320 });

      const cView = h.choice({ label: '看哪一块', value: 'culture',
        options: [{ value: 'culture', label: '1983 的培养' }, { value: 'decay', label: '给药后的衰减' }, { value: 'res', label: '耐药与联合' }],
        onChange: (v) => { S.view = v; sync(); draw(); } });
      const sAdd = h.slider({ label: '补充健康淋巴细胞的时间', min: 6, max: 38, step: 1, value: 20,
        format: (v) => '第 ' + v + ' 天', onInput: (v) => { S.add = v; cul = culture(S.noAdd ? null : v); draw(); } });
      const tNo = h.toggle({ label: '不补充细胞', onChange: (b) => { S.noAdd = b; cul = culture(b ? null : S.add); draw(); } });
      const sC = h.slider({ label: 'c（病毒清除速率）', min: -0.3, max: 1.2, step: 0.01, value: Math.log10(PC),
        format: (v) => (10 ** v).toFixed(2) + ' /d (t½ ' + (24 * Math.LN2 / 10 ** v).toFixed(1) + ' h)',
        onInput: (v) => { S.c = 10 ** v; draw(); } });
      const sD = h.slider({ label: 'δ（被感染细胞死亡速率）', min: -1, max: 0.3, step: 0.005, value: Math.log10(PD),
        format: (v) => (10 ** v).toFixed(2) + ' /d (t½ ' + (Math.LN2 / 10 ** v).toFixed(2) + ' d)',
        onInput: (v) => { S.d = 10 ** v; draw(); } });
      const sN = h.slider({ label: '每天复制次数 N', min: 6, max: 12, step: 0.1, value: 10, format: (v) => sci(10 ** v, 1), onInput: (v) => { S.N = v; draw(); } });
      const sMu = h.slider({ label: '突变率 μ', min: -7, max: -3.5, step: 0.05, value: Math.log10(MU0), format: (v) => sci(10 ** v, 1), onInput: (v) => { S.mu = v; draw(); } });
      const sM = h.slider({ label: '联合用药的药物数 m', min: 1, max: 5, step: 1, value: 3, format: (v) => v + ' 种', onInput: (v) => { S.m = v; draw(); } });
      const bTrue = h.button({ label: '回到实测值', onClick: () => { S.c = PC; S.d = PD; sC.set(Math.log10(PC)); sD.set(Math.log10(PD)); draw(); } });
      controls.append(cView.el, sAdd.el, tNo.el, sC.el, sD.el, h.el('div', { class: 'ctl' }, [bTrue]), sN.el, sMu.el, sM.el);

      const R = {
        a: h.readout('峰值活性 / 出现时间'), b: h.readout('峰后第 8 天的活性'), c: h.readout('当前活细胞数'),
        d: h.readout('游离病毒半衰期'), e: h.readout('被感染细胞半衰期'), f: h.readout('每天产生的病毒粒子'),
        g: h.readout('m 重突变体的日产量'), i: h.readout('治疗前已存在耐药株的概率'), j: h.readout('所需药物数下限'),
      };
      Object.values(R).forEach((x) => readout.append(x.el));

      function sync() {
        const v = S.view;
        [sAdd, tNo].forEach((x) => (x.el.style.display = v === 'culture' ? '' : 'none'));
        [sC, sD].forEach((x) => (x.el.style.display = v === 'decay' ? '' : 'none'));
        bTrue.parentElement.style.display = v === 'decay' ? '' : 'none';
        [sN, sMu, sM].forEach((x) => (x.el.style.display = v === 'res' ? '' : 'none'));
        [R.a, R.b, R.c].forEach((x) => (x.el.style.display = v === 'culture' ? '' : 'none'));
        [R.d, R.e, R.f].forEach((x) => (x.el.style.display = v === 'decay' ? '' : 'none'));
        [R.g, R.i, R.j].forEach((x) => (x.el.style.display = v === 'res' ? '' : 'none'));
      }
      const line = (g, A, xs, ys, color, w = 2, dash = null) => {
        g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
        g.beginPath();
        for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.restore();
      };

      function drawCulture() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const A = h.axes(g, W, Hh, { x0: 0, x1: 44, y0: 10, y1: 3e8, logY: true, pad: { l: 56, r: 44, t: 14, b: 34 },
          xTicks: [0, 10, 20, 30, 40], yTicks: [10, 1e3, 1e5, 1e7, 3e8],
          fmtY: (v) => (v >= 1e3 ? '10' + sup(Math.round(Math.log10(v))) : String(v)),
          xLabel: '培养天数', yLabel: '逆转录酶活性 (cpm，对数)' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        if (!S.noAdd) {
          g.strokeStyle = C('--accent'); g.lineWidth = 1.6; g.setLineDash([4, 3]);
          g.beginPath(); g.moveTo(A.X(S.add), A.p.t); g.lineTo(A.X(S.add), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        }
        // 对照：从不补充
        const ref = culture(null);
        line(g, A, ref.t, ref.V.map((v) => Math.max(10, 0.5 * v)), C('--muted'), 1.3, [4, 3]);
        line(g, A, cul.t, cul.V.map((v) => Math.max(10, 0.5 * v)), C('--s1'), 2.2);
        // 活细胞（右轴）
        const Ty = (c) => A.p.t + A.ih - Math.min(1, c / 4.2e6) * A.ih;
        g.save(); g.strokeStyle = C('--s3'); g.lineWidth = 1.5; g.setLineDash([2, 3]); g.beginPath();
        cul.t.forEach((t, i) => { const x = A.X(t), y = Ty(cul.T[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke(); g.restore();
        g.restore();
        g.font = '10px ' + C('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillStyle = C('--s3'); g.fillText('活细胞', A.p.l + A.iw + 4, Ty(2.1e6)); g.fillText('4.2→0', A.p.l + A.iw + 4, Ty(2.1e6) + 12);
        if (!S.noAdd) { g.fillStyle = C('--accent'); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('补充', A.X(S.add), A.p.t + 2); }
        let mx = 0, mi = 0; cul.V.forEach((v, i) => { if (v > mx) { mx = v; mi = i; } });
        R.a.set(sci(0.5 * mx) + ' cpm @ 第 ' + cul.t[mi].toFixed(1) + ' 天');
        const j = Math.min(cul.t.length - 1, mi + Math.round(8 / 0.2));
        R.b.set(sci(0.5 * cul.V[j]) + ' cpm（峰值的 1/' + (mx / Math.max(1e-9, cul.V[j])).toFixed(0) + '）');
        R.c.set(sci(cul.T[cul.T.length - 1]) + ' /mL（起始 2.0×10⁶）');
      }

      function drawDecay() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const A = h.axes(g, W, Hh, { x0: 0, x1: 7.4, y0: 3e3, y1: 2e5, logY: true, pad: { l: 58, r: 14, t: 14, b: 34 },
          xTicks: [0, 1, 2, 3, 4, 5, 6, 7], yTicks: [3e3, 1e4, 3e4, 1e5], fmtY: (v) => sci(v, 0),
          xLabel: '给药后天数', yLabel: '血浆病毒载量 (copies/mL)' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        // 实测参数的参考曲线
        const xr = [], yr = [];
        for (let i = 0; i <= 240; i++) { const t = 7.4 * i / 240; xr.push(t); yr.push(Vload(t, PC, PD)); }
        line(g, A, xr, yr, C('--muted'), 1.4, [4, 3]);
        const xs = [], ys = [];
        for (let i = 0; i <= 240; i++) { const t = 7.4 * i / 240; xs.push(t); ys.push(Vload(t, S.c, S.d)); }
        line(g, A, xs, ys, C('--accent'), 2.2);
        g.restore();
        // 肩的放大
        const iw = Math.min(160, A.iw * 0.36), ih = A.ih * 0.42, ix = A.p.l + 6, iy = A.p.t + A.ih - ih - 18;
        g.save(); g.fillStyle = C('--bg'); g.globalAlpha = 0.92; g.fillRect(ix, iy, iw, ih); g.globalAlpha = 1;
        g.strokeStyle = C('--line'); g.strokeRect(ix + 0.5, iy + 0.5, iw, ih);
        const IX = (t) => ix + (t / 1.25) * iw, IY = (v) => iy + ih - ((Math.log10(v) - Math.log10(0.6 * PV0)) / (Math.log10(1.1 * PV0) - Math.log10(0.6 * PV0))) * ih;
        g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
        g.strokeStyle = C('--muted'); g.lineWidth = 1.2; g.setLineDash([3, 3]); g.beginPath();
        for (let i = 0; i <= 90; i++) { const t = 1.25 * i / 90, y = IY(Vload(t, PC, PD)); i ? g.lineTo(IX(t), y) : g.moveTo(IX(t), y); } g.stroke(); g.setLineDash([]);
        g.strokeStyle = C('--accent'); g.lineWidth = 1.8; g.beginPath();
        for (let i = 0; i <= 90; i++) { const t = 1.25 * i / 90, y = IY(Vload(t, S.c, S.d)); i ? g.lineTo(IX(t), y) : g.moveTo(IX(t), y); } g.stroke();
        g.restore();
        g.fillStyle = C('--muted'); g.font = '9.5px ' + C('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('放大：头 30 小时的"肩"', ix + 2, iy + ih + 2);
        R.d.set((24 * Math.LN2 / S.c).toFixed(1) + ' h（实测 5.4 h）');
        R.e.set((Math.LN2 / S.d).toFixed(2) + ' d（实测 1.41 d）');
        R.f.set(sci(S.c * PV0 * 1.5e4) + ' 粒子/天');
      }

      function drawRes() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const N = 10 ** S.N, mu = 10 ** S.mu;
        const A = h.axes(g, W, Hh, { x0: 0.6, x1: 5.4, y0: 1e-14, y1: 1e8, logY: true, pad: { l: 64, r: 14, t: 16, b: 36 },
          xTicks: [1, 2, 3, 4, 5], yTicks: [1e-14, 1e-10, 1e-6, 1e-2, 1e2, 1e6],
          fmtY: (v) => '10' + sup(Math.round(Math.log10(v))), fmtX: (v) => String(v),
          xLabel: '需要同时发生的突变数 m', yLabel: '每天新产生的 m 重突变体' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        // y = 1 的参考线
        g.strokeStyle = C('--warn'); g.lineWidth = 1.3; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(A.p.l, A.Y(1)); g.lineTo(A.p.l + A.iw, A.Y(1)); g.stroke(); g.setLineDash([]);
        const xs = [], ys = [];
        for (let m = 1; m <= 5; m++) { xs.push(m); ys.push(Math.max(1e-15, N * mu ** m)); }
        line(g, A, xs, ys, C('--s1'), 2);
        xs.forEach((m, i) => {
          const on = m === S.m;
          g.fillStyle = C(on ? '--accent' : '--s1');
          g.beginPath(); g.arc(A.X(m), A.Y(ys[i]), on ? 6 : 3.6, 0, 7); g.fill();
        });
        g.restore();
        g.fillStyle = C('--warn'); g.font = '10.5px ' + C('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillText('= 1 个/天', A.p.l + 4, A.Y(1) - 3);
        const Em = N * mu ** S.m;
        R.g.set(sci(Em) + ' 个/天' + (Em < 1 ? `（约每 ${(1 / Em).toExponential(1)} 天一次）` : ''));
        R.i.set((1 - Math.exp(-Em)).toExponential(2));
        const need = (Math.log(N) - Math.log(1e-2)) / Math.log(1 / mu);
        R.j.set(`m ≥ ${need.toFixed(2)} → ${Math.ceil(need)} 种（取 ε = 1%）`);
      }

      function draw() {
        const g = cv.g;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, cv.w, cv.h);
        if (S.view === 'culture') drawCulture(); else if (S.view === 'decay') drawDecay(); else drawRes();
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
