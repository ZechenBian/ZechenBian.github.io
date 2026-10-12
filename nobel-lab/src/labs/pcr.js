/* PCR 扩增 — Nobel Chemistry 1993 (Mullis)
 * 沙盒：循环数 n、效率 E、起始拷贝数 N0 → 扩增曲线与产物构成。
 *
 * 理想链计数（每条链每轮复制一次，E = 1；以单链计，初始双链 = 2 条链）：
 *   L_{n+1} = L_n + 2,  S_{n+1} = 2 S_n + L_n,  L_0 = S_0 = 0
 *   ⇒ L_n = 2n,  S_n = 2^{n+1} − 2n − 2,  总链数 = 2^{n+1}
 *   以"初始双链 = 1 分子"为单位（除以 2）：总量 2^n，短产物 2^n − n − 1，长产物 n（加原始 1 个）。
 *   文献常用的混合写法 2^n − 2n，n = 30 时 1 073 741 764（与 2^30 − 31 相差 29）。
 * 一般效率 E 与平台期（logistic 版本，用于曲线）：
 *   N_{n+1} = N_n (1 + E(1 − N_n/Nmax))，Nmax 由 dNTP 总量定，与 N0 无关。
 * qPCR：荧光 F = x/(1+x)，x = N/Nmax；阈值 F_t ⇒ N_t = Nmax F_t/(1−F_t)；
 *   指数段 Ct = log10(N_t/N0)/log10(1+E)，斜率 = −1/log10(1+E)（E=1 → −3.3219）。
 */
(() => {
  const NMAX = 1e12;                    // 平台期分子数（任意单位，由 dNTP 总量决定）
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v)) return '∞'; if (v === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };
  const grp = (v) => (v < 1e15 ? Math.round(v).toLocaleString('en-US') : sci(v));

  /* 理想计数（E = 1），返回以"初始双链 = 1 分子"为单位的数列 */
  function idealCounts(n) {
    let L = 0, S = 0; const out = [];
    for (let k = 1; k <= n; k++) { const Lp = L; S = 2 * S + Lp; L = Lp + 2; out.push({ n: k, S: S / 2, L: L / 2, tot: (2 + L + S) / 2 }); }
    return out;
  }
  /* 带效率与平台期的扩增轨迹（以分子计，N0 为起始拷贝数） */
  function trajectory(N0, E, n) {
    let N = N0; const out = [{ n: 0, N: N0 }];
    for (let k = 1; k <= n; k++) { N = N * (1 + E * (1 - N / NMAX)); out.push({ n: k, N }); }
    return out;
  }
  const fluorOf = (N) => { const x = N / NMAX; return x / (1 + x); };
  const ctIdeal = (N0, Ft, E) => Math.log10((NMAX * Ft) / (1 - Ft) / N0) / Math.log10(1 + E);
  const ctFromCurve = (tr, Ft) => { for (let i = 1; i < tr.length; i++) { const a = fluorOf(tr[i - 1].N), b = fluorOf(tr[i].N); if (b >= Ft && a < Ft) return i - 1 + (Ft - a) / (b - a); } return NaN; };

  LABS.pcr = {
    title: 'PCR 扩增',
    _m: { idealCounts, trajectory, ctIdeal, ctFromCurve, fluorOf, NMAX },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { n: 30, E: 1.0, logN0: 3, Ft: 0.10, view: 'amp', plateau: true };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '把起始拷贝数拖 10 倍，曲线整体左右平移约 3.3 个循环——这就是 qPCR 的全部道理。把效率从 1.00 降到 0.80，标准曲线的斜率从 −3.32 变到 −3.92。右边一栏：长产物始终只有 n 个，无论跑多少轮。' });
      root.append(stage, controls, readout, hint);
      const cv = h.canvas(stage, { aspect: 0.56, minH: 210, maxH: 330 });
      const legend = h.el('div', { class: 'pcrlab-leg' });
      stage.append(legend);

      if (!document.getElementById('st-pcrlab')) {
        document.head.append(h.el('style', { id: 'st-pcrlab', text:
          `.pcrlab-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.pcrlab-leg i{display:inline-block;width:15px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}` }));
      }

      const sN = h.slider({ label: '循环数 n', min: 1, max: 45, step: 1, value: S.n, format: (v) => String(v), onInput: (v) => { S.n = v; draw(); } });
      const sE = h.slider({ label: '扩增效率 E', min: 0.5, max: 1, step: 0.01, value: S.E, format: (v) => v.toFixed(2) + '（每轮 ×' + (1 + v).toFixed(2) + '）', onInput: (v) => { S.E = v; draw(); } });
      const sN0 = h.slider({ label: '起始拷贝数 N₀', min: 0, max: 8, step: 0.25, value: S.logN0, format: (v) => sci(Math.pow(10, v), 1) + ' 拷贝', onInput: (v) => { S.logN0 = v; draw(); } });
      const sFt = h.slider({ label: '荧光阈值（定 Ct）', min: 0.02, max: 0.5, step: 0.005, value: S.Ft, format: (v) => v.toFixed(3), onInput: (v) => { S.Ft = v; draw(); } });
      const cV = h.choice({ label: '看什么', value: 'amp',
        options: [{ value: 'amp', label: '扩增曲线' }, { value: 'std', label: '标准曲线 Ct–log N₀' }, { value: 'comp', label: '产物构成' }],
        onChange: (v) => { S.view = v; sync(); draw(); } });
      const tP = h.toggle({ label: '允许平台期（dNTP 耗尽）', value: true, onChange: (b) => { S.plateau = b; draw(); } });
      controls.append(sN.el, sE.el, sN0.el, sFt.el, tP.el, cV.el);

      const R = {
        tot: h.readout('n 轮后总量'),
        sh: h.readout('目标长度 / 非目标长度'),
        ct: h.readout('Ct（当前阈值）'),
        sl: h.readout('标准曲线斜率 −1/log₁₀(1+E)'),
        fold: h.readout('扩增倍数 (1+E)ⁿ'),
      };
      Object.values(R).forEach((x) => readout.append(x.el));

      function sync() {
        sFt.el.style.display = S.view === 'comp' ? 'none' : '';
        sN0.el.style.display = S.view === 'std' ? 'none' : '';
        tP.el.style.display = S.view === 'comp' ? 'none' : '';
      }
      const setLegend = (items) => {
        legend.textContent = '';
        items.forEach(([t, c, d]) => legend.append(h.el('span', {}, [h.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));
      };

      function numbers() {
        const N0 = Math.pow(10, S.logN0);
        const ideal = idealCounts(S.n), last = ideal[ideal.length - 1];
        const tr = trajectory(N0, S.E, S.n);
        const Ncap = S.plateau ? tr[tr.length - 1].N : N0 * Math.pow(1 + S.E, S.n);
        R.tot.set(`${sci(Ncap)} 拷贝${S.plateau && Ncap > 0.5 * NMAX ? '（已进平台期）' : ''}`);
        R.sh.set(`${grp(last.S)} / ${grp(last.L + 1)}（理想 E = 1，初始 1 个双链）`);
        R.fold.set(`${sci(Math.pow(1 + S.E, S.n))}`);
        const ct = ctIdeal(N0, S.Ft, S.E);
        R.ct.set(isFinite(ct) && ct > 0 && ct < 60 ? ct.toFixed(2) + ' 个循环' : '超出范围');
        R.sl.set((-1 / Math.log10(1 + S.E)).toFixed(3) + ' 个循环 / 10 倍浓度');
      }

      function drawAmp() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const N0 = Math.pow(10, S.logN0);
        const A = h.axes(g, W, Hh, { x0: 0, x1: Math.max(10, S.n), y0: 0, y1: 1.02, pad: { l: 48, r: 12, t: 12, b: 32 },
          xTicks: Array.from({ length: 5 }, (_, i) => Math.round((i * Math.max(10, S.n)) / 4)),
          yTicks: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => v.toFixed(2), xLabel: '循环数 n', yLabel: '荧光（归一）' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        // 相邻十倍浓度的淡参考曲线
        [-2, -1, 1, 2].forEach((d) => {
          const tr = trajectory(Math.pow(10, S.logN0 + d), S.E, S.n);
          g.strokeStyle = C('--line'); g.lineWidth = 1.2; g.beginPath();
          tr.forEach((p, i) => { const x = A.X(p.n), y = A.Y(fluorOf(S.plateau ? p.N : Math.min(NMAX * 50, Math.pow(10, S.logN0 + d) * Math.pow(1 + S.E, p.n)))); i ? g.lineTo(x, y) : g.moveTo(x, y); });
          g.stroke();
        });
        const tr = trajectory(N0, S.E, S.n);
        g.strokeStyle = C('--s1'); g.lineWidth = 2.4; g.beginPath();
        tr.forEach((p, i) => { const N = S.plateau ? p.N : N0 * Math.pow(1 + S.E, p.n); const x = A.X(p.n), y = A.Y(fluorOf(N)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
        g.strokeStyle = C('--accent'); g.lineWidth = 1.6; g.setLineDash([6, 4]);
        g.beginPath(); g.moveTo(A.p.l, A.Y(S.Ft)); g.lineTo(A.p.l + A.iw, A.Y(S.Ft)); g.stroke(); g.setLineDash([]);
        const ct = ctFromCurve(tr, S.Ft);
        if (isFinite(ct)) {
          g.strokeStyle = C('--accent'); g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(A.X(ct), A.Y(S.Ft)); g.lineTo(A.X(ct), A.p.t + A.ih); g.stroke();
          g.fillStyle = C('--accent'); g.beginPath(); g.arc(A.X(ct), A.Y(S.Ft), 4.5, 0, 7); g.fill();
        }
        g.restore();
        g.font = '11px ' + C('--mono-font'); g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillText('阈值 ' + S.Ft.toFixed(3), A.p.l + 4, A.Y(S.Ft) - 3);
        if (isFinite(ct)) { g.fillStyle = C('--accent'); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('Ct ' + ct.toFixed(1), A.X(ct), A.p.t + A.ih - 16); }
        g.fillStyle = C('--muted'); g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillText('灰线 = N₀ 的 ±10、±100 倍', A.p.l + A.iw - 4, A.p.t + 4);
        setLegend([['当前 N₀', C('--s1')], ['±10×、±100×', C('--line')], ['阈值 / Ct', C('--accent'), 1]]);
      }
      function drawStd() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const A = h.axes(g, W, Hh, { x0: 0, x1: 8, y0: 0, y1: 48, pad: { l: 46, r: 12, t: 12, b: 34 },
          xTicks: [0, 2, 4, 6, 8], yTicks: [0, 10, 20, 30, 40], xLabel: 'log₁₀ N₀', yLabel: 'Ct' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        // 三条效率下的直线
        [[1.0, '--s1'], [0.9, '--s2'], [0.8, '--s3']].forEach(([e, c]) => {
          g.strokeStyle = C(c); g.lineWidth = Math.abs(e - S.E) < 0.005 ? 2.6 : 1.3;
          g.beginPath();
          for (let i = 0; i <= 2; i++) { const x = i * 4, y = ctIdeal(Math.pow(10, x), S.Ft, e); i ? g.lineTo(A.X(x), A.Y(y)) : g.moveTo(A.X(x), A.Y(y)); }
          g.stroke();
          g.fillStyle = C(c); g.font = '10.5px ' + C('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText(`E=${e.toFixed(1)}  s=${(-1 / Math.log10(1 + e)).toFixed(2)}`, A.X(0.2), A.Y(ctIdeal(Math.pow(10, 0.2), S.Ft, e)) - 9);
        });
        // 当前 E 的那条（若不是 1.0/0.9/0.8）
        if (![1, 0.9, 0.8].some((e) => Math.abs(e - S.E) < 0.005)) {
          g.strokeStyle = C('--accent'); g.lineWidth = 2.6; g.beginPath();
          for (let i = 0; i <= 2; i++) { const x = i * 4, y = ctIdeal(Math.pow(10, x), S.Ft, S.E); i ? g.lineTo(A.X(x), A.Y(y)) : g.moveTo(A.X(x), A.Y(y)); }
          g.stroke();
        }
        // 当前 N0 的点
        const ct = ctIdeal(Math.pow(10, S.logN0), S.Ft, S.E);
        g.fillStyle = C('--fg'); g.beginPath(); g.arc(A.X(S.logN0), A.Y(ct), 5, 0, 7); g.fill();
        g.restore();
        g.fillStyle = C('--muted'); g.font = '11px ' + C('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillText('阈值只上下平移直线，不改斜率', A.p.l + A.iw - 4, A.p.t + 4);
        setLegend([['E = 1.00', C('--s1')], ['E = 0.90', C('--s2')], ['E = 0.80', C('--s3')], ['当前 N₀', C('--fg')]]);
      }
      function drawComp() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const ideal = idealCounts(Math.max(2, S.n));
        const A = h.axes(g, W, Hh, { x0: 0, x1: Math.max(10, S.n), y0: 0.5, y1: 1e11, logY: true, pad: { l: 54, r: 12, t: 12, b: 34 },
          xTicks: Array.from({ length: 5 }, (_, i) => Math.round((i * Math.max(10, S.n)) / 4)),
          yTicks: [1, 1e2, 1e4, 1e6, 1e8, 1e10], fmtY: (v) => (v === 1 ? '1' : '10' + sup(Math.round(Math.log10(v)))),
          xLabel: '循环数 n', yLabel: '分子数（对数，初始双链 = 1）' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const draw1 = (key, c, w, dash) => {
          g.strokeStyle = c; g.lineWidth = w; if (dash) g.setLineDash(dash);
          g.beginPath();
          ideal.forEach((r, i) => { const y = A.Y(Math.max(0.6, key(r))); i ? g.lineTo(A.X(r.n), y) : g.moveTo(A.X(r.n), y); });
          g.stroke(); g.setLineDash([]);
        };
        draw1((r) => r.tot, C('--muted'), 1.6, [5, 4]);
        draw1((r) => r.S, C('--s1'), 2.4);
        draw1((r) => r.L + 1, C('--s2'), 2.4);
        g.restore();
        const last = ideal[ideal.length - 1];
        g.font = '11px ' + C('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillStyle = C('--s2'); g.fillText(`长产物 = n + 1 = ${last.L + 1}`, A.p.l + A.iw - 4, A.p.t + 4);
        g.fillStyle = C('--s1'); g.fillText(`目标占 ${(100 * last.S / last.tot).toFixed(5)}%`, A.p.l + A.iw - 4, A.p.t + 20);
        setLegend([['目标长度（短产物）', C('--s1')], ['非目标长度（长产物 + 原始）', C('--s2')], ['总量 2ⁿ', C('--muted'), 1]]);
      }

      function draw() {
        const g = cv.g;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, cv.w, cv.h);
        if (S.view === 'amp') drawAmp(); else if (S.view === 'std') drawStd(); else drawComp();
        numbers();
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
