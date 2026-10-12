/* 胰岛素提取台 — Nobel Medicine 1923 (Banting & Macleod)
 * 两块（示意模型，用于让规律可读）：
 *  A「提取」：活性 A = islet(prep)·rec(c)·exp(−(kH + kdig·acinar(prep)·Eact(c))·t)
 *     Eact(c) = 1/(1+e^{(c−24)/4})；kdig = 1.4 /min（E=1 → t½ = ln2/1.4 ≈ 0.50 min）；kH = 0.002 /min
 *     正常胰腺 + 冰盐水：30 min 后剩 e^{−42}；结扎胰管（腺泡 1.2%）或 40–60% 酸性酒精都能保住活性；
 *     80% 以上酒精回收率反而下降（有效成分自己沉淀）——与 B 块是同一个物理。
 *  B「分级沉淀」：log10 S_i(c) = a_i − b_i c（mg/mL）。有效成分 b=2.0，杂蛋白 A b=4.0、B b=2.6，盐与小肽 b=0.6。
 *     C_H = 0.05 mg/mL ⇒ 开始沉淀于 c = −log10(0.05)/2.0 = 0.651；Collip 实际发现要 90% 以上才大量沉淀。
 * 史实数字：班廷诺奖演讲记录最初酒精浓度 40%–60%；单位 = 使 2 kg 禁食 24 h 的兔血糖 5 h 内
 *   从 0.118% 降到 0.045% 所需量的 1/3；1 IU ≈ 34.7 µg 结晶胰岛素 ≈ 6.0 nmol（M = 5808 g/mol）。
 */
(() => {
  const sigm = (x) => 1 / (1 + Math.exp(-x));
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };

  /* ---- A: 提取 ---- */
  const PREP = {
    normal:  { zh: '正常胰腺', acinar: 1.0,   islet: 1.00 },
    ligated: { zh: '结扎胰管 7 周', acinar: 0.012, islet: 0.90 },
    fetal:   { zh: '胎牛胰腺', acinar: 0.010, islet: 0.80 },
  };
  const KDIG = 1.4, KH = 0.002;
  const Eact = (c) => 1 / (1 + Math.exp((c - 24) / 4));
  const rec = (c) => 0.9 * (1 - 0.85 * sigm((c - 78) / 7)) * (0.55 + 0.45 * sigm((c - 15) / 8));
  const kLoss = (p, c) => KH + KDIG * PREP[p].acinar * Eact(c);
  const activity = (p, c, t) => PREP[p].islet * rec(c) * Math.exp(-kLoss(p, c) * t);
  const halfLife = (p, c) => Math.LN2 / kLoss(p, c);

  /* ---- B: 分级沉淀 ---- */
  const SPEC = {
    H:  { zh: '有效成分', a: 0.0, b: 2.0, tok: '--accent' },
    P1: { zh: '杂蛋白 A', a: 1.3, b: 4.0, tok: '--s2' },
    P2: { zh: '杂蛋白 B', a: 0.8, b: 2.6, tok: '--s4' },
    P3: { zh: '盐与小肽', a: 1.8, b: 0.6, tok: '--s3' },
  };
  const KEYS = ['H', 'P1', 'P2', 'P3'];
  const Ssol = (k, c) => 10 ** (SPEC[k].a - SPEC[k].b * c);
  const CRUDE = { H: 0.05, P1: 12, P2: 4, P3: 6, V: 1 };
  const totP = (s) => KEYS.reduce((a, k) => a + s[k], 0);
  const purity = (s) => s.H / Math.max(1e-12, totP(s));
  const PUR0 = purity(CRUDE);
  const fracStep = (s, c, keep) => { const o = { V: s.V }; for (const k of KEYS) { const sol = Math.min(s[k], Ssol(k, c)); o[k] = keep === 'sup' ? sol : s[k] - sol; } return o; };
  /* Collip 的两步，作为"答案"预置 */
  const COLLIP = [[0.62, 'sup'], [0.92, 'ppt']];

  LABS.insulin = {
    title: '胰岛素提取台',
    _m: { activity, halfLife, fracStep, purity, PUR0, Ssol },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { view: 'extract', prep: 'normal', c: 0, t: 30, fc: 0.62, keep: 'sup', s: Object.assign({}, CRUDE), hist: [] };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '「提取」：原料留在正常胰腺、溶剂拨到 0%（冰盐水），看活性在几十秒里掉光——半衰期约 0.5 min。再把酒精推到 40%–60%，或把原料换成结扎胰管的胰腺，活性就回来了；推到 85% 以上回收率又掉，因为有效成分自己开始沉淀。「纯化」：按 Collip 的两步（62% 留上清 → 92% 留沉淀）点一遍，看比活性跳到几十倍；再从粗提液开始只做第一步，会发现单独一步只有 ×3.5——分离靠的是两条溶解度直线斜率不同。' });
      root.append(stage, controls, readout, hint);
      const cv = h.canvas(stage, { aspect: 0.56, minH: 200, maxH: 320 });

      const cView = h.choice({ label: '看哪一块', value: 'extract',
        options: [{ value: 'extract', label: '提取' }, { value: 'purify', label: '纯化' }],
        onChange: (v) => { S.view = v; sync(); draw(); } });
      const cPrep = h.choice({ label: '原料', value: 'normal',
        options: Object.entries(PREP).map(([k, v]) => ({ value: k, label: v.zh })),
        onChange: (v) => { S.prep = v; draw(); } });
      const sC = h.slider({ label: '酒精浓度（0 = 冰盐水）', min: 0, max: 95, step: 1, value: 0,
        format: (v) => (v === 0 ? '冰盐水' : v + '%'), onInput: (v) => { S.c = v; draw(); } });
      const sT = h.slider({ label: '浸出时间', min: -2.2, max: 2.1, step: 0.02, value: Math.log10(30),
        format: (v) => { const m = 10 ** v; return m < 1 ? (m * 60).toFixed(0) + ' s' : m.toFixed(m < 10 ? 1 : 0) + ' min'; },
        onInput: (v) => { S.t = 10 ** v; draw(); } });
      const sFC = h.slider({ label: '沉淀用的酒精浓度', min: 0, max: 0.98, step: 0.01, value: 0.62,
        format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { S.fc = v; draw(); } });
      const cKeep = h.choice({ label: '离心后保留', value: 'sup',
        options: [{ value: 'sup', label: '上清' }, { value: 'ppt', label: '沉淀' }],
        onChange: (v) => { S.keep = v; draw(); } });
      const bStep = h.button({ label: '执行这一步', onClick: () => { S.s = fracStep(S.s, S.fc, S.keep); S.hist.push([S.fc, S.keep]); draw(); } });
      const bCollip = h.button({ label: 'Collip 的两步', kind: 'primary',
        onClick: () => { S.s = Object.assign({}, CRUDE); S.hist = []; COLLIP.forEach(([c, k]) => { S.s = fracStep(S.s, c, k); S.hist.push([c, k]); }); draw(); } });
      const bReset = h.button({ label: '回到粗提液', onClick: () => { S.s = Object.assign({}, CRUDE); S.hist = []; draw(); } });
      const btns = h.el('div', { class: 'ctl' }, [h.el('div', {}, [bStep, bCollip, bReset])]);
      controls.append(cView.el, cPrep.el, sC.el, sT.el, sFC.el, cKeep.el, btns);

      const R = {
        a: h.readout('滤液活性（相对）'), b: h.readout('半衰期 t½'), c: h.readout('蛋白酶残留活性'),
        d: h.readout('比活性（相对粗提液）'), e: h.readout('有效成分回收率'), f: h.readout('步骤'),
      };
      Object.values(R).forEach((x) => readout.append(x.el));

      function sync() {
        const ex = S.view === 'extract';
        [cPrep, sC, sT].forEach((x) => (x.el.style.display = ex ? '' : 'none'));
        [sFC, cKeep].forEach((x) => (x.el.style.display = ex ? 'none' : ''));
        btns.style.display = ex ? 'none' : '';
        [R.a, R.b, R.c].forEach((x) => (x.el.style.display = ex ? '' : 'none'));
        [R.d, R.e, R.f].forEach((x) => (x.el.style.display = ex ? 'none' : ''));
      }

      const line = (g, A, xs, ys, color, w = 2, dash = null) => {
        g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
        g.beginPath();
        for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.restore();
      };

      /* ---------- A ---------- */
      function drawExtract() {
        const g = cv.g, W = cv.w, Hh = cv.h, X0 = Math.log10(1 / 60), X1 = Math.log10(120);
        const A = h.axes(g, W, Hh, { x0: X0, x1: X1, y0: 1e-5, y1: 1.4, logY: true, pad: { l: 52, r: 14, t: 14, b: 34 },
          xTicks: [1 / 60, 10 / 60, 1, 10, 120].map(Math.log10), yTicks: [1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1],
          fmtX: (v) => { const m = 10 ** v; return m < 1 ? (m * 60).toFixed(0) + 's' : m.toFixed(0) + 'm'; },
          fmtY: (v) => '10' + sup(Math.round(Math.log10(v))), xLabel: '浸出时间（对数）', yLabel: '活性（对数）' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        // 三种原料的曲线，当前那条加粗
        const toks = { normal: '--s1', ligated: '--s3', fetal: '--s4' };
        Object.keys(PREP).forEach((p) => {
          const xs = [], ys = [];
          for (let i = 0; i <= 150; i++) { const lt = X0 + (X1 - X0) * i / 150; xs.push(lt); ys.push(Math.max(1e-9, activity(p, S.c, 10 ** lt))); }
          line(g, A, xs, ys, C(toks[p]), p === S.prep ? 2.6 : 1.2, p === S.prep ? null : [4, 3]);
        });
        // 半衰期标记
        const th = halfLife(S.prep, S.c);
        if (th > 1 / 60 && th < 120) {
          g.strokeStyle = C('--warn'); g.lineWidth = 1.2; g.setLineDash([2, 3]);
          g.beginPath(); g.moveTo(A.X(Math.log10(th)), A.p.t); g.lineTo(A.X(Math.log10(th)), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        }
        // 当前点
        const av = Math.max(1e-9, activity(S.prep, S.c, S.t));
        g.strokeStyle = C('--line'); g.lineWidth = 1.4; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(A.X(Math.log10(S.t)), A.p.t); g.lineTo(A.X(Math.log10(S.t)), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(A.X(Math.log10(S.t)), A.Y(Math.max(1e-5, av)), 5, 0, 6.283); g.fill(); g.stroke();
        g.restore();
        // 图例文字
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'top';
        Object.keys(PREP).forEach((p, i) => {
          g.fillStyle = C(toks[p]); g.textAlign = 'left';
          g.fillText((p === S.prep ? '● ' : '○ ') + PREP[p].zh, A.p.l + 5, A.p.t + 3 + i * 13);
        });
        if (th > 1 / 60 && th < 120) { g.fillStyle = C('--warn'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('t½', A.X(Math.log10(th)), A.p.t + A.ih - 2); }
        R.a.set(av >= 1e-3 ? av.toFixed(4) : sci(av));
        R.b.set(th < 1 ? (60 * th).toFixed(1) + ' s' : th < 1e3 ? th.toFixed(1) + ' min' : sci(th) + ' min');
        R.c.set((PREP[S.prep].acinar * Eact(S.c)).toFixed(4) + '　回收率因子 ' + rec(S.c).toFixed(2));
      }

      /* ---------- B ---------- */
      function drawPurify() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const A = h.axes(g, W, Hh, { x0: 0, x1: 1, y0: 1e-4, y1: 1e2, logY: true, pad: { l: 54, r: 14, t: 14, b: 34 },
          xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1], yTicks: [1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100],
          fmtX: (v) => (100 * v).toFixed(0) + '%', fmtY: (v) => '10' + sup(Math.round(Math.log10(v))),
          xLabel: '酒精浓度', yLabel: 'S 与 C (mg/mL)' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        KEYS.forEach((k) => {
          const xs = [], ys = [];
          for (let i = 0; i <= 100; i++) { const c = i / 100; xs.push(c); ys.push(Ssol(k, c)); }
          line(g, A, xs, ys, C(SPEC[k].tok), 2);
          const cc = Math.max(1e-9, S.s[k]);
          g.strokeStyle = C(SPEC[k].tok); g.lineWidth = 1; g.setLineDash([2, 4]); g.globalAlpha = 0.75;
          g.beginPath(); g.moveTo(A.p.l, A.Y(cc)); g.lineTo(A.p.l + A.iw, A.Y(cc)); g.stroke();
          g.setLineDash([]); g.globalAlpha = 1;
        });
        g.strokeStyle = C('--fg'); g.lineWidth = 1.6; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(A.X(S.fc), A.p.t); g.lineTo(A.X(S.fc), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'middle'; g.textAlign = 'left';
        KEYS.forEach((k) => { const yv = Ssol(k, 0.03); if (yv > 1e-4 && yv < 1e2) { g.fillStyle = C(SPEC[k].tok); g.fillText(k, A.p.l + 4, A.Y(yv) - 7); } });
        g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText((100 * S.fc).toFixed(0) + '%', A.X(S.fc), A.p.t + 2);
        const enr = purity(S.s) / PUR0, recov = (S.s.H * S.s.V) / (CRUDE.H * CRUDE.V);
        R.d.set(`×${enr.toFixed(1)}　（${(100 * purity(S.s)).toFixed(2)}% 纯度）`);
        R.e.set(`${(100 * recov).toFixed(1)}%`);
        R.f.set(S.hist.length ? S.hist.map(([c, k]) => `${(100 * c).toFixed(0)}%${k === 'sup' ? '上' : '沉'}`).join(' → ') : '粗提液');
      }

      function draw() {
        const g = cv.g;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, cv.w, cv.h);
        if (S.view === 'extract') drawExtract(); else drawPurify();
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
