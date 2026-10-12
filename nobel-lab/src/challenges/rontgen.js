/* 黑纸后面的光 — 挑战版（Nobel Physics 1901: Wilhelm Conrad Röntgen, discovery of X-rays）
 * 时代：维尔茨堡，1895 年 11–12 月。读者自己做三件事：
 * (1) 在暗室里比较三种光源（黑纸罩住的放电管 / 勒纳德窗管的阴极射线 / 弧光灯），测亮度–距离、挡物、磁铁，判断这是一种新射线；
 * (2) 用叠起来的铝片测出指数衰减 I = I0 e^{−μx}，再用 50 keV 的 μ 表解释骨头为什么投下影子；
 * (3) 只能从侧面透照的木桶里藏着三根铝棒：选角度拍投影、看反投影变清楚，认出摆法（CT 的雏形）。
 *
 * 模型（示意，数字可复现）：
 *   伦琴管：B = 400·(10/r)²·e^{−0.00025(r−10)}（r 以 cm 计；空气 μ ≈ 2.5×10⁻⁴ cm⁻¹ @ 50 keV）。肉眼下限约 0.5。
 *   勒纳德窗管：B = 400·e^{−(r−1)/1.4}（约 8–10 cm 后看不见），磁铁使光斑侧移 0.35·r² mm。弧光灯：B = 400·(10/r)²。
 *   挡物对伦琴管的透过率（按单一能量 50 keV 估算，示意）：黑纸 .99，千页的书（约 5 cm 纸，ρ≈0.8）.42，2.5 cm 松木 .76，
 *   1 mm 铝 .905，15 mm 铝 .225（μ_Al = 0.994 cm⁻¹），2 mm 玻璃 .83，2 mm 铅玻璃（PbO 约 40%，ρ≈3.8）.09，1.5 mm 铅 ≈ 1e−6（μ_Pb = 91 cm⁻¹），
 *   手：约 2.5 cm 软组织 .57；骨所在处（1.5 cm 软组织 + 1 cm 骨）.30。弧光灯：玻璃挡掉短波紫外，只剩约 .6。
 *   第二关（NIST XCOM，50 keV）：μ/ρ 水 0.2269、皮质骨（ICRU-44, ρ 1.92）0.4242、铝（ρ 2.699）0.3681、铅（ρ 11.35）8.041 cm²/g。
 *   铝 μ = 0.0994 mm⁻¹，半值层 6.98 mm；1 cm 骨 ≈ 0.814/0.227 = 3.59 cm 软组织。
 *   第三关：直径 12 cm 木桶（壁厚 0.6 cm，μ 0.15 cm⁻¹），3 根铝棒（半径 1 cm，μ 0.99 cm⁻¹）竖在间距 3.5 cm 的 3×3 格点上，每行每列一根。
 *   3! = 6 种摆法的 0° 与 90° 投影完全相同；一般的斜角都能区分（45° 分不开丙、丁）。探测器 141 道 × 0.1 cm，I0 = 4000 计数/道（泊松，近似正态）。
 */
(() => {
  const R = String.raw;
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gaussOf = (rnd) => () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const near = (a, b, tol) => Math.abs(a / b - 1) <= tol;
  function watchTheme(fn) {
    const mo = new MutationObserver(() => fn());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const l = () => fn();
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', l); else mq.addListener(l); }
    return () => { mo.disconnect(); if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', l); else mq.removeListener(l); } };
  }
  function lsq(xs, ys) {
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const b = sxx > 0 ? sxy / sxx : NaN;
    return { b, a: my - b * mx };
  }
  const fmtTick = (v) => { const r = +v.toPrecision(2); return r >= 1e4 ? '1e' + Math.round(Math.log10(r)) : String(r); };
  function injectStyle() {
    if (document.getElementById('st-rontgen')) return;
    const s = document.createElement('style'); s.id = 'st-rontgen';
    s.textContent = `
.rontgen-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;align-items:start}
.rontgen-row>*{min-width:0}
.rontgen-note{font-size:13px;color:var(--muted);line-height:1.65;margin:0}
.rontgen-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.rontgen-sec[hidden],.rontgen-sec>[hidden]{display:none}
.rontgen-sec h4{margin:0;font-size:14px}
.rontgen-tab{max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.rontgen-tab th{position:sticky;top:0;background:var(--panel);z-index:1}
.rontgen-ev{font-size:12.5px;color:var(--muted);margin:0;display:flex;flex-wrap:wrap;gap:2px 16px}
.rontgen-ev .on{color:var(--good)}
.rontgen-qo{display:flex;gap:10px;align-items:center}
.rontgen-qo svg{flex:none;width:46px;height:46px}
.dtable td.rontgen-l,.dtable th.rontgen-l{text-align:left}`;
    document.head.append(s);
  }
  function text(g, col, s, x, y, color, align = 'left', base = 'middle', size = 11, mono = false) {
    g.font = size + 'px ' + (col(mono ? '--mono-font' : '--body-font') || 'sans-serif');
    g.fillStyle = color; g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y);
  }
  const GLOW = (a) => `rgba(186,255,112,${a.toFixed(3)})`; // 氰亚铂酸钡荧光的黄绿色（物理颜色）
  const ROOM = '#07090c', PLATE = '#14181d';
  // 不透明版本（荧光叠在底板上），重叠绘制时不会越叠越亮
  const GLOW_S = (a) => `rgb(${Math.round(20 + 166 * a)},${Math.round(24 + 231 * a)},${Math.round(29 + 83 * a)})`;
  // 有挡物时屏上的显示亮度：相对于空场按透过率 T 变暗（γ = 0.8，示意）；低于肉眼下限则全黑
  const shadeA = (B0, T) => (B0 * T < 0.4 ? 0 : glowA(B0) * Math.pow(T, 0.8));

  /* ================= 第一关：黑屋里的微光 ================= */
  const SRC = [
    { k: 'x', name: '伦琴的放电管（黑纸罩住）', short: '伦琴管', col: '--s1' },
    { k: 'c', name: '勒纳德窗管（阴极射线）', short: '勒纳德管', col: '--s2' },
    { k: 'l', name: '弧光灯（可见光与紫外）', short: '弧光灯', col: '--s3' },
  ];
  const OBJ = [
    { k: 'none', name: '不放', x: 1, c: 1, l: 1 },
    { k: 'card', name: '一张黑纸', x: 0.99, c: 0, l: 0 },
    { k: 'book', name: '千页的书', x: 0.42, c: 0, l: 0 },
    { k: 'wood', name: '2.5 cm 松木板', x: 0.76, c: 0, l: 0 },
    { k: 'al1', name: '1 mm 铝片', x: 0.905, c: 0, l: 0 },
    { k: 'al15', name: '15 mm 铝块', x: 0.225, c: 0, l: 0 },
    { k: 'glass', name: '2 mm 玻璃', x: 0.83, c: 0, l: 0.6 },
    { k: 'pbg', name: '2 mm 铅玻璃', x: 0.09, c: 0, l: 0.55 },
    { k: 'pb', name: '1.5 mm 铅片', x: 0, c: 0, l: 0 },
    { k: 'hand', name: '手', x: 0.57, c: 0, l: 0 },
  ];
  const LIGHT_OPAQUE = new Set(['card', 'book', 'wood', 'al1', 'al15', 'hand']);
  const objOf = (k) => OBJ.find((o) => o.k === k);
  function bright(src, r, o) {
    if (src === 'x') return 400 * (10 / r) ** 2 * Math.exp(-0.00025 * (r - 10)) * o.x;
    if (src === 'c') return 400 * Math.exp(-Math.max(0, r - 1) / 1.4) * o.c;
    return 400 * (10 / r) ** 2 * o.l;
  }
  const glowA = (B) => clamp((Math.log10(Math.max(B, 1e-9)) - Math.log10(0.3)) / (Math.log10(400) - Math.log10(0.3)), 0, 1);
  const R200 = Math.log10(200), rOf = (u) => Math.pow(10, (u / 1000) * R200);
  const fmtR = (r) => (r < 10 ? r.toFixed(1) : r.toFixed(0)) + ' cm';

  // 一只手的示意剪影（单位：荧光板宽高的比例），骨头是粗线段
  const FINGERS = [[0.335, 0.27], [0.425, 0.16], [0.515, 0.12], [0.605, 0.18]];
  function drawHand(g, x, y, w, hh, flesh, bone) {
    const P = (u, v) => [x + u * w, y + v * hh];
    g.save(); g.beginPath(); g.rect(x, y, w, hh); g.clip();
    g.fillStyle = PLATE; g.lineCap = 'round';
    const fillShape = (c) => {
      g.fillStyle = c; g.strokeStyle = c;
      g.beginPath(); const [a, b] = P(0.30, 0.55); g.roundRect ? g.roundRect(a, b, 0.36 * w, 0.5 * hh, 0.06 * w) : g.rect(a, b, 0.36 * w, 0.5 * hh); g.fill();
      g.lineWidth = 0.08 * w;
      FINGERS.forEach(([u, v]) => { g.beginPath(); g.moveTo(...P(u, 0.6)); g.lineTo(...P(u, v)); g.stroke(); });
      g.beginPath(); g.moveTo(...P(0.64, 0.78)); g.lineTo(...P(0.82, 0.52)); g.stroke();
    };
    fillShape(PLATE); fillShape(flesh);
    // 骨头
    const bones = (c) => {
      g.strokeStyle = c; g.lineWidth = 0.032 * w;
      FINGERS.forEach(([u, v]) => {
        const segs = [[v + 0.02, v + 0.12], [v + 0.15, v + 0.27], [v + 0.30, 0.52]];
        segs.forEach(([a, b]) => { g.beginPath(); g.moveTo(...P(u, a)); g.lineTo(...P(u, Math.min(b, 0.52))); g.stroke(); });
        g.beginPath(); g.moveTo(...P(u + (0.48 - u) * 0.15, 0.58)); g.lineTo(...P(u + (0.48 - u) * 0.55, 0.9)); g.stroke();
      });
      g.beginPath(); g.moveTo(...P(0.79, 0.56)); g.lineTo(...P(0.73, 0.65)); g.stroke();
      g.beginPath(); g.moveTo(...P(0.70, 0.69)); g.lineTo(...P(0.60, 0.88)); g.stroke();
    };
    bones(PLATE); bones(bone);
    // 金戒指（无名指）
    g.fillStyle = PLATE; const [rx, ry] = P(0.425 - 0.05, 0.46); g.fillRect(rx, ry, 0.1 * w, 0.03 * hh);
    g.restore();
  }

  function stage1(ctx) {
    const h = ctx.h, col = ctx.color, el = h.el;
    return {
      title: '黑屋里的微光',
      task: R`<p>维尔茨堡，1895 年 11 月 8 日傍晚。你在重复勒纳德的阴极射线实验：感应线圈给一支抽成高真空的放电管加上几万伏电压。为了确认管子本身不漏光，你用黑色硬纸板把它严严实实地罩住，又把实验室弄得漆黑。这时，一米开外桌上一块涂了氰亚铂酸钡的荧光屏，随着每一次放电微微发亮。</p>
<p>当时已知能让这种屏发光的有两样东西：<b>紫外光</b>，以及从勒纳德管薄铝"窗口"射出的<b>阴极射线</b>。下面三种光源你都可以用：移动荧光屏，在屏前挡东西，在光路旁放一块磁铁；每按一次"记录"，读一次屏中央的亮度（肉眼估计，有噪声）。</p>
<p><b>任务</b>：先测出伦琴管的亮度怎样随距离 $r$ 变化，再判断让屏发光的究竟是什么。</p>`,
      hints: [
        '先只用伦琴管，不放东西、不开磁铁，在 5 cm 到 200 cm 之间测 4–5 个距离，看右边双对数图上的点排成什么样。再换勒纳德管、弧光灯各测几次，挡东西、放磁铁都试试。',
        R`双对数图上直线的斜率就是 $p$。一个点源向四周直线发射、途中不被吸收时，穿过半径 $r$ 的球面的总量不变，单位面积上的强度 $\propto 1/(4\pi r^2)$。`,
        R`$p\approx-2$。阴极射线在空气里不到 10 cm 就没了，还会被磁铁拐弯；弧光灯的光被黑纸、书和木板完全挡住。伦琴管发出的东西三样都不像。`,
      ],
      answer: R`伦琴管的亮度按 $B\propto r^{-2}$ 下降（双对数图上斜率 −2），2 m 外仍然可见：这正是点源直线发射、空气几乎不吸收时的几何稀释。对照组：勒纳德管的阴极射线约 8–10 cm 后就看不见，磁铁让光斑明显侧移；弧光灯的光被黑纸、书、木板完全挡住，却能穿过玻璃。伦琴管发出的东西穿透黑纸、千页的书、木板和 1 mm 铝，15 mm 铝后只剩约五分之一，2 mm 铅玻璃挡掉约九成，1.5 mm 铅完全挡住它；磁铁对它毫无作用。它既不是光，也不是阴极射线。伦琴把它叫作 <b>X 射线</b>，X 表示未知。他 1895 年 12 月 28 日的报告里，正是这些检验。`,
      build(body, api) {
        const S = { src: 'x', obj: 'none', u: 642, mag: false, rows: [], n: 0, last: null, okP: false };
        const mono = () => col('--mono-font') || 'monospace';

        const st = el('div', { class: 'lab-stage' });
        body.append(st);
        const cvB = h.canvas(st, { aspect: 0.34, minH: 150, maxH: 210 });
        cvB.canvas.setAttribute('aria-label', '实验台示意：光源、磁铁、挡物和荧光屏');
        const ctl = el('div', { class: 'lab-controls' });
        const cSrc = h.choice({ label: '光源', value: 'x', options: SRC.map((s) => ({ value: s.k, label: s.name })), onChange: (v) => { S.src = v; redraw(); } });
        const cObj = h.choice({ label: '挡在荧光屏前的东西', value: 'none', options: OBJ.map((o) => ({ value: o.k, label: o.name })), onChange: (v) => { S.obj = v; redraw(); } });
        const sR = h.slider({ label: '光源到荧光屏的距离 r', min: 0, max: 1000, step: 1, value: S.u, format: (u) => fmtR(rOf(u)), onInput: (u) => { S.u = u; redraw(); } });
        const tMag = h.toggle({ label: '在光路旁放一块马蹄形磁铁', value: false, onChange: (b) => { S.mag = b; redraw(); } });
        const bRec = h.button({ label: '记录这次读数', kind: 'primary', onClick: record });
        const bClr = h.button({ label: '清空记录', onClick: () => { S.rows = []; S.last = null; refresh(); } });
        ctl.append(cSrc.el, cObj.el, sR.el, tMag.el, el('div', { class: 'ctl' }, [el('div', {}, [bRec, bClr])]));
        body.append(ctl);

        const boxS = el('div', { class: 'lab-stage' }), boxP = el('div', { class: 'lab-stage' });
        body.append(el('div', { class: 'rontgen-row' }, [boxS, boxP]));
        const cvS = h.canvas(boxS, { aspect: 0.72, minH: 180, maxH: 260 });
        cvS.canvas.setAttribute('aria-label', '荧光屏上看到的图像（示意）');
        const cvP = h.canvas(boxP, { aspect: 0.72, minH: 180, maxH: 260 });
        cvP.canvas.setAttribute('aria-label', '亮度对距离的双对数图（只画不放东西、不开磁铁的记录）');

        const rd = el('div', { class: 'lab-readout' });
        const ro = { r: h.readout('距离 r'), b: h.readout('上次读数：屏中央亮度'), d: h.readout('上次读数：光斑或影子的侧移'), n: h.readout('记录条数') };
        Object.values(ro).forEach((x) => rd.append(x.el));
        const evBox = el('p', { class: 'rontgen-ev', 'aria-live': 'polite' });
        const tbody = el('tbody');
        const tab = el('div', { class: 'dtable rontgen-tab' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['#', '光源', '挡物', 'r (cm)', '磁铁', '亮度 B', '光斑或影子侧移 (mm)'].map((t, i) => el('th', { class: i === 1 || i === 2 ? 'rontgen-l' : null, text: t })))]), tbody])]);
        body.append(rd, evBox, tab);

        const ev = () => {
          const X = S.rows.filter((q) => q.src === 'x');
          const dist = X.filter((q) => q.obj === 'none' && !q.mag && q.vis), rs = dist.map((q) => q.r);
          return {
            far: dist.length >= 3 && Math.max(...rs) / Math.min(...rs) >= 4,
            mag: X.some((q) => q.mag && q.vis),
            cath: new Set(S.rows.filter((q) => q.src === 'c').map((q) => q.r.toFixed(1))).size >= 2,
            opaque: X.some((q) => LIGHT_OPAQUE.has(q.obj) && q.vis),
          };
        };
        const slopeX = () => {
          const d = S.rows.filter((q) => q.src === 'x' && q.obj === 'none' && !q.mag && q.vis);
          return d.length >= 2 ? lsq(d.map((q) => Math.log(q.r)), d.map((q) => Math.log(q.B))).b : NaN;
        };

        const ansP = h.answer({
          label: R`伦琴管（不放东西、不开磁铁）：亮度 $B\propto r^{\,p}$，$p$ = ?（容差 ±0.25）`, placeholder: '指数 p',
          check: (v) => {
            if (!ev().far) return { ok: false, msg: '先用伦琴管在至少 3 个距离上记录（不放东西、不开磁铁、屏上看得见），最远与最近相差 4 倍以上。' };
            const own = slopeX();
            if (Math.abs(v + 2) <= 0.25 || (Math.abs(own + 2) <= 0.4 && Math.abs(v - own) <= 0.1)) return { ok: true, msg: `对。你的数据给出 p ≈ ${own.toFixed(2)}：距离加倍，亮度变为四分之一。` };
            if (v > 0) return { ok: false, msg: '离得越远越暗，p 应当是负的。' };
            if (Math.abs(v + 1) <= 0.3) return { ok: false, msg: '看双对数图：距离从 10 cm 到 100 cm（一个数量级），亮度变了几个数量级？' };
            return { ok: false, msg: '不对。在双对数图上取相距最远的两个点：p = Δlg B / Δlg r。' };
          },
          onOk: () => { S.okP = true; quizBox.hidden = false; api.typeset(quizBox); },
        });
        const quizBox = el('div', { class: 'rontgen-sec', hidden: true });
        const quiz = h.quiz({
          question: '让黑纸后面的荧光屏发亮的，究竟是什么？',
          options: [
            { label: '管子漏出来的可见光或紫外光', ok: false, why: '弧光灯的光被一张黑纸、千页的书、木板完全挡住；伦琴管的东西却几乎不受影响，反倒是能透光的铅玻璃挡住了它。' },
            { label: '穿出管壁的阴极射线', ok: false, why: '勒纳德管的阴极射线在空气里不到 10 cm 就没了，磁铁让它明显拐弯；伦琴管的东西 2 m 外仍可见，磁铁对它毫无作用。' },
            { label: '一种此前未知的射线：直线传播，不被磁场偏转，能穿透对光不透明的物体', ok: true, why: '对。' },
            { label: '高压电场或热量从管子传到了屏上', ok: false, why: '电场和热不会按材料被挡住（15 mm 铝后剩约五分之一，1.5 mm 铅后完全消失），也不会让手投下骨头清晰的影子。' },
          ],
          onOk: () => {
            const e = ev(), miss = [];
            if (!e.mag) miss.push('磁铁对伦琴管的东西有没有作用');
            if (!e.cath) miss.push('阴极射线在空气里能走多远（勒纳德管至少测两个距离）');
            if (!e.opaque) miss.push('伦琴管的东西能否穿过对光不透明的物体（黑纸、书、木板、铝片或手）');
            if (miss.length) { api.say('结论对了，但证据还不全：' + miss.join('；') + '。补做这几项对照。', 'bad'); return; }
            api.done(R`<b>一种新的射线</b>：它不是光（穿透黑纸、千页的书和木板），也不是阴极射线（在空气中走得远、按 $1/r^2$ 减弱，磁铁不能使它偏转）。伦琴把它叫作 X 射线，X 表示未知。他独自在暗室里检验了七个星期，1895 年 12 月 28 日才交出第一份报告。`);
          },
        });
        quizBox.append(quiz.el);
        body.append(ansP.el, quizBox);

        function record() {
          const r = rOf(S.u), o = objOf(S.obj);
          const g = gaussOf(mulberry32(18951108 + 7919 * ++S.n));
          const B = Math.max(0, bright(S.src, r, o) * (1 + 0.05 * g()) + 0.12 * g());
          const vis = B >= 0.5;
          const dy = vis ? (S.mag && S.src === 'c' ? 0.35 * r * r : 0) + 0.25 * g() : null;
          S.last = { i: S.n, src: S.src, obj: S.obj, r, mag: S.mag, B, vis, dy };
          S.rows.push(S.last);
          refresh();
        }

        function drawBench() {
          const g = cvB.g, W = cvB.w, Hh = cvB.h, r = rOf(S.u), o = objOf(S.obj);
          g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          const yc = Math.round((Hh - 24) * 0.55), x0 = 78, x1 = W - 22;
          const X = (rr) => x0 + (Math.log10(clamp(rr, 1, 200)) / R200) * (x1 - x0);
          g.strokeStyle = col('--line'); g.lineWidth = 1;
          g.beginPath(); g.moveTo(x0, Hh - 22); g.lineTo(x1, Hh - 22); g.stroke();
          [1, 2, 5, 10, 20, 50, 100, 200].forEach((t) => { const x = X(t); g.beginPath(); g.moveTo(x, Hh - 25); g.lineTo(x, Hh - 19); g.stroke(); text(g, col, String(t), x, Hh - 16, col('--muted'), 'center', 'top', 10.5, true); });
          text(g, col, 'r / cm', 8, Hh - 16, col('--muted'), 'left', 'top', 10.5, true);
          const xs = X(r), xe = 66;
          // 射线（示意）
          if (S.src === 'c') {
            const rEnd = Math.min(r, 11), n = 40;
            g.lineWidth = 3;
            for (let i = 0; i < n; i++) {
              const ra = 1 + ((rEnd - 1) * i) / n, rb = 1 + ((rEnd - 1) * (i + 1)) / n;
              const ya = yc + (S.mag ? 0.35 * ra * ra * 0.9 : 0), yb = yc + (S.mag ? 0.35 * rb * rb * 0.9 : 0);
              g.strokeStyle = col('--s2'); g.globalAlpha = 0.9 * Math.exp(-(ra - 1) / 1.4) + 0.05;
              g.beginPath(); g.moveTo(i ? X(ra) : xe, Math.min(ya, Hh - 30)); g.lineTo(X(rb), Math.min(yb, Hh - 30)); g.stroke();
            }
            g.globalAlpha = 1;
          } else {
            const blocked = S.src === 'l' && o.l === 0 && o.k !== 'none';
            const xEnd = o.k !== 'none' ? Math.max(xe + 4, xs - 9) : xs;
            g.fillStyle = col(S.src === 'x' ? '--s1' : '--s3'); g.globalAlpha = 0.16;
            g.beginPath(); g.moveTo(xe, yc - 4); g.lineTo(xEnd, yc - 30); g.lineTo(xEnd, yc + 30); g.lineTo(xe, yc + 4); g.closePath(); g.fill();
            if (!blocked && o.k !== 'none') { g.beginPath(); g.moveTo(xEnd, yc - 30); g.lineTo(xs, yc - 32); g.lineTo(xs, yc + 32); g.lineTo(xEnd, yc + 30); g.closePath(); g.globalAlpha = 0.16 * (S.src === 'x' ? o.x : o.l); g.fill(); }
            g.globalAlpha = 1;
          }
          // 光源
          if (S.src === 'x') {
            g.fillStyle = '#121418'; g.strokeStyle = col('--line'); g.lineWidth = 1;
            g.beginPath(); if (g.roundRect) g.roundRect(8, yc - 17, 58, 34, 6); else g.rect(8, yc - 17, 58, 34); g.fill(); g.stroke();
            text(g, col, '黑纸罩', 37, yc, '#8a8f99', 'center', 'middle', 10.5);
          } else if (S.src === 'c') {
            g.fillStyle = col('--bg2'); g.strokeStyle = col('--muted'); g.lineWidth = 1.2;
            g.beginPath(); g.ellipse(36, yc, 28, 14, 0, 0, 7); g.fill(); g.stroke();
            g.fillStyle = col('--accent'); g.fillRect(62, yc - 5, 4, 10);
            text(g, col, '铝窗', 64, yc - 18, col('--muted'), 'center', 'middle', 10.5);
          } else {
            g.fillStyle = col('--s3'); g.beginPath(); g.arc(40, yc, 11, 0, 7); g.fill();
            g.strokeStyle = col('--s3'); g.lineWidth = 1.5;
            for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.beginPath(); g.moveTo(40 + 14 * Math.cos(a), yc + 14 * Math.sin(a)); g.lineTo(40 + 19 * Math.cos(a), yc + 19 * Math.sin(a)); g.stroke(); }
          }
          text(g, col, SRC.find((s) => s.k === S.src).short, 8, 10, col('--muted'), 'left', 'middle', 11);
          // 磁铁
          if (S.mag) {
            const xm = Math.min(X(2.6), xs - 30), ym = yc - 34;
            g.strokeStyle = col('--warn'); g.lineWidth = 5; g.lineCap = 'butt';
            g.beginPath(); g.moveTo(xm - 9, ym + 16); g.lineTo(xm - 9, ym); g.arc(xm, ym, 9, Math.PI, 0); g.lineTo(xm + 9, ym + 16); g.stroke();
            text(g, col, 'N', xm - 9, ym + 24, col('--warn'), 'center', 'middle', 10, true);
            text(g, col, 'S', xm + 9, ym + 24, col('--warn'), 'center', 'middle', 10, true);
          }
          // 挡物
          if (o.k !== 'none') {
            const xo = Math.max(xe + 2, xs - 10);
            g.fillStyle = col('--muted'); g.globalAlpha = 0.75; g.fillRect(xo - 3, yc - 26, 6, 52); g.globalAlpha = 1;
            text(g, col, o.name, xo, yc - 36, col('--fg'), xo > W - 70 ? 'right' : 'center', 'middle', 10.5);
          }
          // 荧光屏
          const B = bright(S.src, r, o);
          g.fillStyle = ROOM; g.fillRect(xs - 1, yc - 34, 6, 68);
          g.fillStyle = GLOW(glowA(B)); g.fillRect(xs - 1, yc - 34, 6, 68);
          g.strokeStyle = col('--line'); g.lineWidth = 1; g.strokeRect(xs - 1.5, yc - 34.5, 7, 69);
          text(g, col, 'r = ' + fmtR(r), clamp(xs, 40, W - 40), yc + 46, col('--fg'), 'center', 'middle', 11, true);
        }

        function drawScreen() {
          const g = cvS.g, W = cvS.w, Hh = cvS.h, r = rOf(S.u), o = objOf(S.obj);
          g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          text(g, col, '荧光屏上看到的（示意）', 4, 10, col('--muted'), 'left', 'middle', 11);
          const sx = 4, sy = 22, sw = W - 8, sh = Hh - 26;
          g.fillStyle = ROOM; g.fillRect(sx, sy, sw, sh);
          const px = sx + sw * 0.1, py = sy + sh * 0.08, pw = sw * 0.8, ph = sh * 0.84;
          g.fillStyle = PLATE; g.fillRect(px, py, pw, ph);
          const B0 = bright(S.src, r, objOf('none')), B1 = bright(S.src, r, o);
          if (S.src === 'c') {
            const dy = S.mag ? 0.35 * r * r : 0, k = ph / 120; // 荧光板高 120 mm
            const cx = px + pw / 2, cy = py + ph / 2 + dy * k, rad = Math.max(7, pw * 0.08);
            g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
            const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
            gr.addColorStop(0, GLOW(glowA(B1))); gr.addColorStop(1, GLOW(0));
            g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fill(); g.restore();
            if (S.mag && glowA(B1) > 0) text(g, col, '↓ 光斑被磁铁推开', px + 4, py + 12, '#c8cdd6', 'left', 'middle', 10.5);
          } else {
            g.fillStyle = GLOW(glowA(B0)); g.fillRect(px, py, pw, ph);
            if (o.k === 'hand') {
              const fl = S.src === 'x' ? GLOW_S(shadeA(B0, 0.57)) : PLATE, bo = S.src === 'x' ? GLOW_S(shadeA(B0, 0.30)) : PLATE;
              drawHand(g, px, py, pw, ph, fl, bo);
            } else if (o.k !== 'none') {
              const ox = px + pw * 0.3, oy = py + ph * 0.18, ow = pw * 0.4, oh = ph * 0.64;
              g.fillStyle = PLATE; g.fillRect(ox, oy, ow, oh);
              g.fillStyle = GLOW(B0 > 0 ? shadeA(B0, B1 / B0) : 0); g.fillRect(ox, oy, ow, oh);
            }
          }
          if (glowA(B1) <= 0 && glowA(B0) <= 0) text(g, col, '一片漆黑', px + pw / 2, py + ph / 2, '#8a8f99', 'center', 'middle', 12);
        }

        function drawPlot() {
          const g = cvP.g, W = cvP.w, Hh = cvP.h;
          g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          const A = h.axes(g, W, Hh, { x0: 0, x1: Math.log10(300), y0: -1, y1: 5, pad: { l: 50, r: 10, t: 24, b: 34 },
            xTicks: [0, 1, 2], yTicks: [-1, 0, 1, 2, 3, 4, 5], fmtX: (v) => fmtTick(10 ** v), fmtY: (v) => fmtTick(10 ** v), xLabel: '距离 r (cm)', yLabel: '亮度 B' }, col);
          const yT = A.Y(Math.log10(0.5));
          g.save(); g.setLineDash([4, 4]); g.strokeStyle = col('--muted'); g.beginPath(); g.moveTo(A.p.l, yT); g.lineTo(A.p.l + A.iw, yT); g.stroke(); g.restore();
          text(g, col, '肉眼下限', A.p.l + A.iw - 4, yT - 7, col('--muted'), 'right', 'middle', 10.5);
          let lx = A.p.l;
          SRC.forEach((s) => {
            const c = col(s.col);
            g.fillStyle = c;
            S.rows.filter((q) => q.src === s.k && q.obj === 'none' && !q.mag).forEach((q) => {
              const y = A.Y(Math.log10(Math.max(q.B, 0.1)));
              g.beginPath(); g.arc(A.X(Math.log10(q.r)), y, q.vis ? 3.6 : 2.6, 0, 7); q.vis ? g.fill() : (g.strokeStyle = c, g.stroke());
            });
            g.beginPath(); g.arc(lx + 4, 10, 3.5, 0, 7); g.fill();
            text(g, col, s.short, lx + 11, 10, col('--muted'), 'left', 'middle', 10.5);
            g.font = '10.5px ' + col('--body-font'); lx += 22 + g.measureText(s.short).width;
          });
          if (!S.rows.some((q) => q.obj === 'none' && !q.mag)) text(g, col, '不放东西、不开磁铁的记录画在这里', A.p.l + A.iw / 2, A.p.t + A.ih / 2, col('--muted'), 'center', 'middle', 11.5);
        }

        function fill() {
          tbody.replaceChildren(...S.rows.slice().reverse().map((q) => el('tr', {}, [
            el('td', { text: String(q.i) }), el('td', { class: 'rontgen-l', text: SRC.find((s) => s.k === q.src).short }), el('td', { class: 'rontgen-l', text: objOf(q.obj).name }),
            el('td', { text: q.r < 10 ? q.r.toFixed(1) : q.r.toFixed(0) }), el('td', { text: q.mag ? '开' : '—' }),
            el('td', { text: q.vis ? q.B.toPrecision(3) : '看不见' }), el('td', { text: q.dy == null ? '—' : q.dy.toFixed(1) }),
          ])));
          const e = ev();
          const item = (ok, t) => `<span class="${ok ? 'on' : ''}">${ok ? '✓' : '○'} ${t}</span>`;
          evBox.innerHTML = item(e.far, '伦琴管：远近 ≥ 3 个距离') + item(e.mag, '伦琴管：试过磁铁') + item(e.cath, '对照：阴极射线 ≥ 2 个距离') + item(e.opaque, '伦琴管：穿过不透光的东西');
          ro.r.set(fmtR(rOf(S.u)));
          ro.b.set(S.last ? (S.last.vis ? S.last.B.toPrecision(3) : '看不见（< 0.5）') : '—');
          ro.d.set(S.last && S.last.dy != null ? S.last.dy.toFixed(1) + ' mm' : '—');
          ro.n.set(String(S.rows.length));
        }
        function redraw() { drawBench(); drawScreen(); ro.r.set(fmtR(rOf(S.u))); }
        function refresh() { drawBench(); drawScreen(); drawPlot(); fill(); }
        cvB.onResize(drawBench); cvS.onResize(drawScreen); cvP.onResize(drawPlot);
        const un = watchTheme(() => { drawBench(); drawScreen(); drawPlot(); });
        refresh();
        return { destroy() { cvB.destroy(); cvS.destroy(); cvP.destroy(); un(); } };
      },
    };
  }

  /* ================= 第二关：穿透与吸收 ================= */
  const PLATE_MM = 2, I0_2 = 1000;
  const MU_AL_MM = (0.3681 * 2.699) / 10; // 50 keV：0.09935 mm⁻¹，半值厚度 6.98 mm
  // 未过滤的管子（示意宽谱）：能量 20…100 keV 的权重与铝的 μ (mm⁻¹)
  const SPEC = { mu: [9.287, 3.044, 1.534, 0.9935, 0.7498, 0.5447, 0.4599].map((m) => m / 10), w: [0.04, 0.14, 0.2, 0.2, 0.18, 0.15, 0.09] };
  const SPEC_W = SPEC.w.reduce((a, b) => a + b, 0);
  const transAl = (xmm, mode) => (mode === 'mono' ? Math.exp(-MU_AL_MM * xmm) : SPEC.w.reduce((a, w, i) => a + w * Math.exp(-SPEC.mu[i] * xmm), 0) / SPEC_W);
  const SAMPLES = [
    { k: 'none', name: '不放（测 I₀）', x: 0, mu: 0, rho: '—', Z: '—' },
    { k: 'w', name: '2 cm 水（软组织）', x: 2, mu: 0.2269 * 1.0, rho: '1.00', Z: '约 7.4（有效）' },
    { k: 'b', name: '1 cm 骨片（皮质骨）', x: 1, mu: 0.4242 * 1.92, rho: '1.92', Z: '约 14（有效；Ca 20，P 15）' },
    { k: 'a', name: '1 cm 铝', x: 1, mu: 0.3681 * 2.699, rho: '2.70', Z: '13' },
    { k: 'p', name: '0.2 mm 铅', x: 0.02, mu: 8.041 * 11.35, rho: '11.35', Z: '82' },
  ];
  const EQ_TRUE = (0.4242 * 1.92) / 0.2269; // 1 cm 骨 ≈ 3.59 cm 水
  const meter = (seed, T) => { const g = gaussOf(mulberry32(seed)); return Math.max(0, I0_2 * T * (1 + 0.012 * g()) + 0.8 * g()); };

  function stage2(ctx) {
    const h = ctx.h, col = ctx.color, el = h.el;
    return {
      title: '穿透与吸收',
      task: R`<p>1896 年初。X 射线的消息传遍世界，各地都在拍骨头的照片。可"穿透"到底服从什么定量规律？伦琴在第二份报告里注意到，X 射线能让空气导电；于是强度可以用静电计读出的<b>电离电流</b>来量，比肉眼看荧光准得多。</p>
<p>你有一叠每张 $2\ \mathrm{mm}$ 的铝片。先假设射线的"硬度"是单一的（<b>简化</b>：真实的管子发出的是连续谱，本关末尾可以试）。每次测 10 秒，读数有约 1% 的涨落。</p>
<p><b>任务</b>：一张张加铝片，找出强度 $I$ 怎样随厚度 $x$ 下降，并用一个数刻画铝的"挡光本领"。然后解释：为什么手的照片里骨头的影子那么清楚？</p>`,
      hints: [
        '算一算相邻两次读数的比值：加第 1 张铝片和加第 10 张铝片，强度各变为原来的几分之几？比值一样，还是差值一样？',
        R`若每一薄层 $dx$ 都吸收同样比例的射线，则 $dI = -\mu I\,dx$。在对数图上取相距较远的两点：$\mu = \ln(I_1/I_2)/(x_2-x_1)$；强度减半的厚度 $x_{1/2} = \ln 2/\mu$。`,
        R`$\mu \approx 0.099\ \mathrm{mm^{-1}}$，$x_{1/2}\approx 7.0$ mm。样品：2 cm 水的 $\ln(I_0/I)\approx 0.45$，1 cm 骨的约 0.81，所以 1 cm 骨相当于约 3.6 cm 水。`,
      ],
      answer: R`每加一张铝片，强度都乘上同一个因子 $e^{-2\mu}\approx 0.82$：每一薄层吸收同样的比例，$dI = -\mu I\,dx \Rightarrow I = I_0e^{-\mu x}$，对数图上是直线。斜率给出 $\mu_{\rm Al}\approx 0.099\ \mathrm{mm^{-1}}$（约 50 keV 的射线），半值厚度 $x_{1/2} = \ln2/\mu \approx 7.0$ mm。<br>样品：$\mu_{\rm 水} = \ln(I_0/I)/2\,\mathrm{cm}\approx 0.227\ \mathrm{cm^{-1}}$，$\mu_{\rm 骨}\approx 0.81\ \mathrm{cm^{-1}}$，所以 1 cm 骨相当于 $0.81/0.227\approx 3.6$ cm 软组织。其中密度只占 1.9 倍；其余约 1.9 倍来自骨中钙（$Z=20$）、磷（$Z=15$）的高原子序数：光电吸收每个原子约 $\propto Z^4/E^3$。铅（$Z = 82$）的 $\mu$ 是水的 400 倍，0.2 mm 铅就挡掉 84%。`,
      build(body, api) {
        const S = { n: 0, mode: 'mono', log: false, rows: [], k: 0, okLaw: false, okMu: false, okH: false, smp: 'none', srows: [], okEq: false, okQ: false, warnedSpec: false };
        const st = el('div', { class: 'lab-stage' }); body.append(st);
        const cv = h.canvas(st, { aspect: 0.55, minH: 220, maxH: 340 });
        cv.canvas.setAttribute('aria-label', '电离电流对铝片总厚度的图');
        const ctl = el('div', { class: 'lab-controls' });
        const sN = h.slider({ label: '铝片张数（每张 2 mm）', min: 0, max: 16, step: 1, value: 0, format: (v) => `${v} 张 = ${v * PLATE_MM} mm`, onInput: (v) => { S.n = v; } });
        const bM = h.button({ label: '测量 10 秒', kind: 'primary', onClick: measure });
        const bC = h.button({ label: '清空', onClick: () => { S.rows = []; refresh(); } });
        const cLog = h.choice({ label: '纵轴', value: 'lin', options: [{ value: 'lin', label: '线性' }, { value: 'log', label: '对数' }], onChange: (v) => { S.log = v === 'log'; draw(); } });
        const cMode = h.choice({ label: '射线', value: 'mono', options: [{ value: 'mono', label: '单一硬度（简化）' }, { value: 'spec', label: '未过滤的真实管子（连续谱）' }], onChange: (v) => { S.mode = v; } });
        ctl.append(sN.el, el('div', { class: 'ctl' }, [el('div', {}, [bM, bC])]), cLog.el, cMode.el);
        body.append(ctl);
        const tbody = el('tbody');
        body.append(el('div', { class: 'dtable rontgen-tab' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['铝片', 'x (mm)', '射线', 'I（格）'].map((t) => el('th', { text: t })))]), tbody])]));

        const monoRows = () => S.rows.filter((q) => q.mode === 'mono' && q.I > 5);
        const fitMu = () => { const d = monoRows(); return d.length >= 2 ? -lsq(d.map((q) => q.x), d.map((q) => Math.log(q.I))).b : NaN; };
        const enough = () => { const d = monoRows(), xs = d.map((q) => q.x); return new Set(xs).size >= 4 && Math.max(...xs) - Math.min(...xs) >= 10; };

        const lawQuiz = h.quiz({
          question: '你的数据（单一硬度）说明：',
          options: [
            { label: '每加一张铝片，强度减少一个固定的量', ok: false, why: '线性图上点列是向上弯的曲线，不是直线；照这样几厘米铝就能把射线完全挡死，可读数一直没到零。' },
            { label: '每加一张铝片，强度乘上一个固定的比例', ok: true, why: '对：相邻两次读数之比始终约 0.82。在对数纵轴上，这是一条直线。' },
            { label: R`强度与厚度成反比，$I\propto 1/x$`, ok: false, why: '那样 x = 0 时强度为无穷大。换成对数纵轴看看。' },
            { label: '前几张几乎不吸收，到某个厚度后突然全部挡住', ok: false, why: '第一张铝片就已经让强度明显下降，后面也没有突变。' },
          ],
          onOk: () => {
            if (!enough()) { api.say('结论对，但证据不够：用"单一硬度"至少测 4 个不同厚度，最厚与最薄相差 10 mm 以上。', 'bad'); return; }
            S.okLaw = true; secMu.hidden = false; api.typeset(secMu); draw();
          },
        });
        const ansMu = h.answer({
          label: R`把这个规律写成 $I = I_0e^{-\mu x}$。铝的衰减系数 $\mu$ = ?（单位 mm⁻¹，容差 ±8%）`, unit: 'mm⁻¹', placeholder: 'μ',
          check: (v) => {
            const own = fitMu();
            if (near(v, MU_AL_MM, 0.08) || (near(own, MU_AL_MM, 0.15) && near(v, own, 0.05))) return { ok: true, msg: `对。你的数据拟合给出 μ ≈ ${own.toFixed(4)} mm⁻¹；每 2 mm 让强度乘上 e^{−2μ} ≈ ${Math.exp(-2 * own).toFixed(3)}。` };
            if (near(v, MU_AL_MM * 10, 0.1)) return { ok: false, msg: '这是以 cm⁻¹ 为单位的数值。换算成 mm⁻¹。' };
            if (near(v, MU_AL_MM / Math.LN10, 0.1)) return { ok: false, msg: '你用的是常用对数 lg。μ 的定义用自然对数：μ = ln(I₁/I₂)/Δx。' };
            if (v < 0) return { ok: false, msg: 'μ 取正值：强度随 x 下降，指数上的负号已经写在公式里。' };
            return { ok: false, msg: '不对。在对数图上取两点：μ = ln(I₁/I₂)/(x₂ − x₁)。' };
          },
          onOk: () => { S.okMu = true; ansH.el.hidden = false; draw(); },
        });
        const ansH = h.answer({
          label: '强度减半需要多厚的铝？半值厚度 $x_{1/2}$ = ?（容差 ±8%）', unit: 'mm', placeholder: 'x½',
          check: (v) => {
            const tr = Math.LN2 / MU_AL_MM, own = Math.LN2 / fitMu();
            if (near(v, tr, 0.08) || (near(own, tr, 0.15) && near(v, own, 0.05))) return { ok: true, msg: `对：x½ = ln 2/μ ≈ ${tr.toFixed(1)} mm。每过 7 mm 铝，剩下的一半再减半：没有一个厚度能把它"完全"挡住。` };
            if (near(v, 1 / MU_AL_MM, 0.08)) return { ok: false, msg: '这是 1/μ（强度降到 1/e 的厚度）。减半要乘 ln 2。' };
            return { ok: false, msg: '不对。解 e^{−μx} = 1/2。' };
          },
          onOk: () => { S.okH = true; secB.hidden = false; api.typeset(secB); drawB(); },
        });
        ansH.el.hidden = true;
        const secMu = el('div', { class: 'rontgen-sec', hidden: true }, [ansMu.el, ansH.el]);
        body.append(el('div', { class: 'rontgen-sec' }, [lawQuiz.el]), secMu);

        /* ---- Part B：几种样品 ---- */
        const secB = el('div', { class: 'rontgen-sec', hidden: true });
        const cS = h.choice({ label: '放进射线束的样品（同样 10 秒）', value: 'none', options: SAMPLES.map((s) => ({ value: s.k, label: s.name })), onChange: (v) => { S.smp = v; } });
        const bS = h.button({ label: '测量', kind: 'primary', onClick: measureS });
        const sbody = el('tbody');
        const ansEq = h.answer({
          label: '在这种射线下，1 cm 骨挡住的射线相当于多厚的水（软组织）？（容差 ±8%）', unit: 'cm', placeholder: '厚度',
          check: (v) => {
            const hasI0 = S.srows.some((q) => q.k === 'none'), has = (k) => S.srows.some((q) => q.k === k);
            if (!(hasI0 && has('w') && has('b'))) return { ok: false, msg: '先测出 I₀（不放样品）、2 cm 水和 1 cm 骨的读数。' };
            if (near(v, EQ_TRUE, 0.08)) return { ok: true, msg: `对：μ骨/μ水 = ${EQ_TRUE.toFixed(2)}。按骨与水的密度比 1.92 只能解释一半；另一半是什么？` };
            if (near(v, 1.92, 0.06)) return { ok: false, msg: '这是只按密度之比算的结果。用测得的 ln(I₀/I) 求出两种材料各自的 μ。' };
            if (near(v, 1 / EQ_TRUE, 0.1) || near(v, 2 / EQ_TRUE, 0.1)) return { ok: false, msg: '方向反了：骨挡得更多，所以等效的水应当更厚。' };
            return { ok: false, msg: '比较的应当是 ln(I₀/I)（与厚度成正比），不是透过的强度本身。μ = ln(I₀/I)/x。' };
          },
          onOk: () => { S.okEq = true; quizZ.el.hidden = false; api.typeset(quizZ.el); },
        });
        const quizZ = h.quiz({
          question: '骨比同样厚的软组织多挡住那么多，主要原因是：',
          options: [
            { label: '骨的密度约为水的 2 倍，这就是全部原因', ok: false, why: '只靠密度，1 cm 骨只相当于 1.9 cm 水，而你测到的是 3.6 cm。每克骨的吸收本领也更大。' },
            { label: '骨里的钙（Z = 20）、磷（Z = 15）原子序数高，每克物质吸收得更多；加上密度更大', ok: true, why: R`对。在几十 keV，光电吸收每个原子的截面约 $\propto Z^4/E^3$（每克约 $\propto Z^3$），原子序数稍高，吸收就陡增；铅（$Z=82$）的 μ 是水的约 400 倍。` },
            { label: '骨头会把 X 射线反射回去', ok: false, why: '伦琴专门找过：X 射线没有可测的反射或折射（直到 1912 年用晶体衍射才看到它的波动性）。' },
            { label: '骨头里没有水', ok: false, why: '活骨含水约 10–20%，而且没水也不会让它"多挡"。真正起作用的是元素组成。' },
          ],
          onOk: () => { S.okQ = true; finish(); },
        });
        quizZ.el.hidden = true;
        secB.append(el('h4', { text: '为什么骨头投下影子' }),
          el('p', { class: 'rontgen-note', html: '同一束射线，换几种样品。ρ 是密度（g/cm³），Z 是原子序数（化合物取有效值）。' }),
          el('div', { class: 'lab-controls' }, [cS.el, el('div', { class: 'ctl' }, [el('div', {}, [bS])])]),
          el('div', { class: 'dtable rontgen-tab' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['样品', 'ρ', 'Z', 'I（格）'].map((t, i) => el('th', { class: i < 1 ? 'rontgen-l' : null, text: t })))]), sbody])]),
          ansEq.el, quizZ.el);
        body.append(secB);
        function finish() {
          if (S.okEq && S.okQ) api.done(R`<b>指数衰减，以及吸收随原子序数陡增</b>：每一薄层吸收同样的比例，$I = I_0e^{-\mu x}$，没有"刚好挡住"的厚度，只有半值厚度。$\mu$ 强烈依赖元素：骨里的钙和磷让每克骨的吸收约为每克软组织的 1.9 倍，再乘上 1.9 倍的密度，1 cm 骨挡住的射线相当于 3.6 cm 软组织。骨头的影子、铅围裙、造影剂里的碘和钡，都来自这条 $Z$ 依赖。`);
        }

        function measure() {
          const x = S.n * PLATE_MM, I = meter(1896 + 977 * ++S.k, transAl(x, S.mode));
          S.rows.push({ x, n: S.n, mode: S.mode, I });
          if (S.mode === 'spec' && !S.warnedSpec && S.rows.filter((q) => q.mode === 'spec').length >= 4) {
            S.warnedSpec = true;
            api.say('连续谱：对数图上不再是直线，前几毫米的吸收比后面陡。软的（低能）部分先被滤掉，剩下的射线越来越"硬"，这叫射束硬化。真实的管子就是这样，所以伦琴发现射线的穿透本领与管子的状态有关。', 'info');
          }
          refresh();
        }
        function measureS() {
          const s = SAMPLES.find((q) => q.k === S.smp), I = meter(1928 + 131 * ++S.k, Math.exp(-s.mu * s.x));
          S.srows.push({ k: s.k, name: s.name, rho: s.rho, Z: s.Z, I });
          drawB();
        }
        function drawB() {
          sbody.replaceChildren(...S.srows.slice().reverse().map((q) => el('tr', {}, [el('td', { class: 'rontgen-l', text: q.name }), el('td', { text: q.rho }), el('td', { class: 'rontgen-l', text: q.Z }), el('td', { text: q.I.toFixed(1) })])));
        }
        function table() {
          tbody.replaceChildren(...S.rows.slice().sort((a, b) => a.x - b.x || (a.mode > b.mode ? 1 : -1)).map((q) => el('tr', {}, [el('td', { text: String(q.n) }), el('td', { text: String(q.x) }), el('td', { text: q.mode === 'mono' ? '单一' : '连续谱' }), el('td', { text: q.I.toFixed(1) })])));
        }
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h;
          g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          const yo = S.log ? { y0: 20, y1: 1500, logY: true, yTicks: [20, 50, 100, 200, 500, 1000], fmtY: String } : { y0: 0, y1: 1100, yTicks: [0, 250, 500, 750, 1000] };
          const A = h.axes(g, W, Hh, Object.assign({ x0: 0, x1: 34, xTicks: [0, 4, 8, 12, 16, 20, 24, 28, 32], pad: { l: 46, r: 10, t: 24, b: 34 }, xLabel: '铝的总厚度 x (mm)', yLabel: 'I（格）' }, yo), col);
          const Yc = (I) => A.Y(S.log ? Math.max(I, 21) : I);
          if (S.okMu) {
            const mu = fitMu(), d = monoRows(), a = lsq(d.map((q) => q.x), d.map((q) => Math.log(q.I))).a;
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.strokeStyle = col('--s1'); g.globalAlpha = 0.55; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath();
            for (let i = 0; i <= 80; i++) { const x = (34 * i) / 80, y = Yc(Math.exp(a - mu * x)); i ? g.lineTo(A.X(x), y) : g.moveTo(A.X(x), y); }
            g.stroke(); g.restore();
          }
          S.rows.forEach((q) => {
            const x = A.X(q.x), y = Yc(q.I);
            g.fillStyle = col(q.mode === 'mono' ? '--s1' : '--s2');
            g.beginPath();
            if (q.mode === 'mono') g.arc(x, y, 3.6, 0, 7); else { g.moveTo(x, y - 4.5); g.lineTo(x + 4.5, y); g.lineTo(x, y + 4.5); g.lineTo(x - 4.5, y); g.closePath(); }
            g.fill();
          });
          let lx = A.p.l;
          [['单一硬度', '--s1'], ['连续谱', '--s2']].forEach(([t, c]) => {
            g.fillStyle = col(c); g.beginPath(); g.arc(lx + 4, 11, 3.5, 0, 7); g.fill();
            text(g, col, t, lx + 11, 11, col('--muted'), 'left', 'middle', 10.5);
            g.font = '10.5px ' + col('--body-font'); lx += 24 + g.measureText(t).width;
          });
          if (!S.rows.length) text(g, col, '选好铝片张数，按"测量 10 秒"', A.p.l + A.iw / 2, A.p.t + A.ih / 2, col('--muted'), 'center', 'middle', 12);
        }
        function refresh() { table(); draw(); }
        cv.onResize(draw);
        const un = watchTheme(draw);
        refresh();
        return { destroy() { cv.destroy(); un(); } };
      },
    };
  }

  /* ================= 第三关：藏在盒子里的东西 ================= */
  const DR = 6, DW = 0.6, MU_WOOD = 0.15, ROD = 1.0, MU_ROD = 0.99, SP = 3.5; // cm, cm⁻¹（50 keV）
  const NS = 141, DS = 0.1, T0 = -7, I0_3 = 4000; // 探测器：141 道 × 1 mm，−7 … 7 cm
  const NPX = 72, PXS = 0.2; // 重建网格 72×72，像素 2 mm，覆盖 −7.2 … 7.2 cm
  const CANDS = [
    { k: '甲', pos: [[-1, -1], [0, 0], [1, 1]] },
    { k: '乙', pos: [[-1, -1], [0, 1], [1, 0]] },
    { k: '丙', pos: [[-1, 0], [0, 1], [1, -1]] },
    { k: '丁', pos: [[-1, 1], [0, -1], [1, 0]] },
  ];
  const TRUTH = 2;
  const chord = (a, d) => (Math.abs(d) < a ? 2 * Math.sqrt(a * a - d * d) : 0);
  function lineIntegrals(cand, th) { // 每个通道的 ∫μ dl（通道内 3 点平均）
    const c = Math.cos(th), s = Math.sin(th), out = new Float64Array(NS);
    for (let i = 0; i < NS; i++) {
      let a = 0;
      for (const d of [-DS / 3, 0, DS / 3]) {
        const t = T0 + i * DS + d;
        a += MU_WOOD * (chord(DR, t) - chord(DR - DW, t));
        for (const [x, y] of cand.pos) a += MU_ROD * chord(ROD, t - SP * (x * c + y * s));
      }
      out[i] = a / 3;
    }
    return out;
  }
  function measureProj(deg, seed) { // 泊松计数（正态近似）→ p = −ln(I/I₀)
    const p = lineIntegrals(CANDS[TRUTH], (deg * Math.PI) / 180), g = gaussOf(mulberry32(seed));
    return p.map((v) => { const I = I0_3 * Math.exp(-v); return -Math.log(Math.max(1, I + Math.sqrt(I) * g()) / I0_3); });
  }
  const RAMP = (() => { const k = new Float64Array(2 * NS - 1); for (let n = -(NS - 1); n <= NS - 1; n++) k[n + NS - 1] = n === 0 ? 1 / (4 * DS * DS) : n % 2 ? -1 / (n * n * Math.PI * Math.PI * DS * DS) : 0; return k; })();
  function rampFilter(p) { const q = new Float64Array(NS); for (let i = 0; i < NS; i++) { let s = 0; for (let j = 0; j < NS; j++) s += RAMP[i - j + NS - 1] * p[j]; q[i] = s * DS; } return q; }
  function backproject(projs, filtered) {
    const img = new Float64Array(NPX * NPX);
    if (!projs.length) return img;
    for (const pr of projs) {
      const q = filtered ? pr.q : pr.p, th = (pr.deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
      for (let iy = 0; iy < NPX; iy++) {
        const y = (NPX / 2 - iy - 0.5) * PXS;
        for (let ix = 0; ix < NPX; ix++) {
          const x = (ix - NPX / 2 + 0.5) * PXS, u = (x * c + y * s - T0) / DS, i0 = Math.floor(u);
          if (i0 < 0 || i0 >= NS - 1) continue;
          const f = u - i0; img[iy * NPX + ix] += q[i0] * (1 - f) + q[i0 + 1] * f;
        }
      }
    }
    const k = filtered ? Math.PI / projs.length : 1 / projs.length;
    for (let i = 0; i < img.length; i++) img[i] *= k;
    return img;
  }
  function candSVG(c) {
    let s = '<svg viewBox="-8 -8 16 16" aria-hidden="true"><circle cx="0" cy="0" r="7.2" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width=".7"/>';
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) s += `<circle cx="${x * SP}" cy="${-y * SP}" r=".45" fill="currentColor" fill-opacity=".35"/>`;
    c.pos.forEach(([x, y]) => (s += `<circle cx="${x * SP}" cy="${-y * SP}" r="1.25" fill="currentColor"/>`));
    return s + '</svg>';
  }
  // 已拍的角度能否把真摆法与候选 c 分开：存在某个角度，两者无噪声投影的均方根差 > 0.2（噪声约 0.02–0.1）
  const TRUE_P = new Map();
  const trueProj = (deg) => { if (!TRUE_P.has(deg)) TRUE_P.set(deg, lineIntegrals(CANDS[TRUTH], (deg * Math.PI) / 180)); return TRUE_P.get(deg); };
  function separates(ci, degs) {
    return degs.some((d) => { const a = trueProj(d), b = lineIntegrals(CANDS[ci], (d * Math.PI) / 180); let s = 0; for (let i = 0; i < NS; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / NS) > 0.2; });
  }

  function stage3(ctx) {
    const h = ctx.h, col = ctx.color, el = h.el;
    return {
      title: '藏在桶里的东西',
      task: R`<p>伦琴的照片是"影子"：沿射线方向叠在一起的东西，在片子上分不开深浅。半个多世纪后，医生仍在为此头疼：一张胸片上，肿块在前面还是后面？</p>
<p>桌上是一只封死的圆木桶（直径 12 cm），里面竖着三根一样的铝棒（直径 2 cm）。寄件人说，它们是下面四种摆法之一（俯视图）。桶不能打开，但可以放在转台上转到任意角度 $\theta$，用一束平行的 X 射线照过去，一排 141 个通道的探测器记下每条射线的 $p = -\ln(I/I_0)$，也就是沿这条射线的 $\int\mu\,dl$。每拍一张，左图就把它沿原来的射线方向"抹回"平面上叠加（反投影）。</p>
<p><b>任务</b>：判断桶里是哪种摆法，并说明为什么只拍正面和侧面两张不够。</p>`,
      hints: [
        '先拍 0° 和 90°。每张投影都是 3 个一样的峰：它们只说明每一列、每一行各有一根棒。在纸上画一画，满足"每行每列各一根"的摆法有几种？',
        R`斜着拍：转到 $\theta$ 时，位于 $(x, y)$ 的棒在探测器上的位置是 $t = x\cos\theta + y\sin\theta$。拍一个 30° 或 60°，或者多拍几个角度，看左图哪里越来越亮。`,
        '只有 0° 和 90° 时，与数据一致的摆法有 3! = 6 种（3×3 的置换矩阵）。多角度重建后，三根棒在（左，中）、（中，上）、（右，下）：丙。',
      ],
      answer: R`只拍 0° 和 90° 时，两张投影只告诉你每行、每列各有一根棒，与之相符的摆法是所有 $3\times3$ 置换矩阵，共 $3! = 6$ 种，所以反投影图里出现 9 个一样亮的"鬼影"。斜着拍一张，棒的位置 $t = x\cos\theta + y\sin\theta$ 就能把它们分开（但 45° 分不开丙和丁：它们的 $x+y$ 取值相同）。拍 12 个角度后反投影清楚地显示三根棒在（左，中）、（中，上）、（右，下）：<b>丙</b>。<br>这里事先知道棒只可能在 9 个格点上，所以一个一般的斜角就能把 9 个格点的投影位置全部分开；没有这种先验时难得多：$n$ 根棒、两个方向就有 $n!$ 种可能。拉东（1917）证明了所有方向的线积分能唯一确定一个函数；而对任意有限个方向，总存在投影全为零的非零函数（Smith–Solmon–Wagner 1977），所以 CT 要从很多角度采样。`,
      build(body, api) {
        const S = { deg: 30, projs: [], filt: false, view: 'last', okQ: false, okN: false, k: 0 };
        const row = el('div', { class: 'rontgen-row' });
        const boxR = el('div', { class: 'lab-stage' }), boxP = el('div', { class: 'lab-stage' });
        row.append(boxR, boxP); body.append(row);
        const cvR = h.canvas(boxR, { aspect: 1, minH: 220, maxH: 320 });
        cvR.canvas.setAttribute('aria-label', '反投影重建图（俯视）');
        const cvP = h.canvas(boxP, { aspect: 0.9, minH: 220, maxH: 300 });
        cvP.canvas.setAttribute('aria-label', '投影数据');
        const ctl = el('div', { class: 'lab-controls' });
        const sA = h.slider({ label: '转台角度 θ', min: 0, max: 179, step: 1, value: S.deg, format: (v) => v + '°', onInput: (v) => { S.deg = v; drawR(); } });
        const add = (deg) => { S.projs = S.projs.filter((q) => q.deg !== deg); const p = measureProj(deg, 1979 + 37 * ++S.k + deg); S.projs.push({ deg, p, q: rampFilter(p) }); };
        const bRec = h.button({ label: '拍这个角度', kind: 'primary', onClick: () => { add(S.deg); recompute(); } });
        const b12 = h.button({ label: '一次拍 12 个角度（每 15°）', onClick: () => { for (let d = 0; d < 180; d += 15) add(d); recompute(); } });
        const bClr = h.button({ label: '清空', onClick: () => { S.projs = []; recompute(); } });
        const cF = h.choice({ label: '重建方法', value: 'bp', options: [{ value: 'bp', label: '直接反投影' }, { value: 'fbp', label: '先做斜坡滤波再反投影' }], onChange: (v) => { S.filt = v === 'fbp'; recompute(); } });
        const cV = h.choice({ label: '右图', value: 'last', options: [{ value: 'last', label: '最新一张投影' }, { value: 'sino', label: '全部投影（正弦图）' }], onChange: (v) => { S.view = v; drawP(); } });
        ctl.append(sA.el, el('div', { class: 'ctl' }, [el('div', {}, [bRec, b12, bClr])]), cF.el, cV.el);
        const rd = el('div', { class: 'lab-readout' });
        const roK = h.readout('已拍角度'), roL = h.readout('已拍的角度值');
        rd.append(roK.el, roL.el);
        body.append(ctl, rd);

        const quiz = h.quiz({
          question: '桶里是哪一种摆法？（俯视图，圆圈是桶壁）',
          options: CANDS.map((c, i) => ({
            label: `<span class="rontgen-qo">${candSVG(c)}<span>${c.k}</span></span>`,
            ok: i === TRUTH,
            why: i === TRUTH ? '与数据一致。' : i === 3 ? '丁和丙在 0°、90° 给出相同的投影，在 45° 也一样（两者各棒的 x + y 取值相同）。换一个斜角看看峰的位置。' : `把${c.k}的三根棒按 t = x cos θ + y sin θ 投到一个斜角度上，峰的位置和测到的对不上。`,
          })),
          onOk: () => {
            const degs = S.projs.map((q) => q.deg), left = CANDS.map((c, i) => i).filter((i) => i !== TRUTH && !separates(i, degs));
            if (left.length) { api.say(`选对了，但你现有的数据还分不开${CANDS[TRUTH].k}和${left.map((i) => CANDS[i].k).join('、')}：它们在你拍过的角度上投影几乎相同。这次算猜中。再拍一个能把它们分开的角度。`, 'bad'); return; }
            S.okQ = true; finish();
          },
        });
        const ansN = h.answer({
          label: '如果只拍 0° 和 90° 两张，三根棒（每行、每列各一根，放在 3×3 的格点上）有几种摆法与数据完全一致？', unit: '种', placeholder: '个数',
          check: (v) => {
            if (v === 6) return { ok: true, msg: '对：所有 3×3 置换矩阵，3! = 6 种。n 根棒就是 n! 种，两张正交投影远远不够。' };
            if (v === 4) return { ok: false, msg: '寄件人只列了 4 种，但满足"每行每列各一根"的不止这些。' };
            if (v === 9) return { ok: false, msg: '9 是格点数，也是反投影图里亮点的个数，不是摆法数。' };
            if (v === 84) return { ok: false, msg: 'C(9,3) = 84 数的是任意三个格点；0° 和 90° 的投影已经要求每行每列各一根。' };
            return { ok: false, msg: '不对。第一列的棒有 3 个位置可选，第二列呢？' };
          },
          onOk: () => { S.okN = true; finish(); },
        });
        body.append(el('div', { class: 'rontgen-sec' }, [quiz.el, ansN.el]));
        function finish() {
          if (S.okQ && S.okN) api.done(`<b>从很多角度的投影重建截面：计算机断层成像（CT）</b>。两张正交投影分不开 3! = 6 种摆法；你用了 ${S.projs.length} 个角度把它们分开（因为事先知道棒只在 9 个格点上，一个合适的斜角就够；对一般的物体，要从上百个方向采样）。科马克（1963–64）给出了由线积分重建吸收分布的数学方法，并用一台桌面装置验证；豪斯菲尔德在 EMI 公司独立造出第一台临床 CT（1971 年 10 月扫描第一位病人）。两人分享了 1979 年诺贝尔生理学或医学奖。`);
        }

        let img = new Float64Array(NPX * NPX);
        const off = document.createElement('canvas'); off.width = NPX; off.height = NPX;
        const og = off.getContext('2d'), id = og.createImageData(NPX, NPX);
        function recompute() {
          img = backproject(S.projs, S.filt);
          let mx = 1e-9; for (const v of img) mx = Math.max(mx, v);
          const sc = S.filt ? 1.25 : mx;
          for (let i = 0; i < img.length; i++) { const v = Math.round(255 * clamp(img[i] / sc, 0, 1)); id.data[4 * i] = v; id.data[4 * i + 1] = v; id.data[4 * i + 2] = v; id.data[4 * i + 3] = 255; }
          og.putImageData(id, 0, 0);
          roK.set(String(S.projs.length));
          roL.set(S.projs.length ? S.projs.map((q) => q.deg).sort((a, b) => a - b).join('°, ') + '°' : '—');
          drawR(); drawP();
        }
        function drawR() {
          const g = cvR.g, W = cvR.w, Hh = cvR.h;
          g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          const side = Math.min(W - 8, Hh - 26), x0 = (W - side) / 2, y0 = 22;
          text(g, col, S.filt ? '滤波反投影' : '直接反投影', 4, 10, col('--muted'), 'left', 'middle', 11);
          g.fillStyle = '#000'; g.fillRect(x0, y0, side, side);
          if (S.projs.length) { g.imageSmoothingEnabled = true; g.drawImage(off, x0, y0, side, side); }
          else text(g, col, '还没有投影', x0 + side / 2, y0 + side / 2, '#9aa1ad', 'center', 'middle', 12);
          // 射线方向箭头（当前转台角度）：射线沿 (−sin θ, cos θ)
          const th = (S.deg * Math.PI) / 180, cx = x0 + side / 2, cy = y0 + side / 2, L = side * 0.46;
          const bx = -Math.sin(th), by = Math.cos(th);
          g.strokeStyle = col('--accent'); g.fillStyle = col('--accent'); g.lineWidth = 1.5; g.setLineDash([5, 4]);
          g.beginPath(); g.moveTo(cx - bx * L, cy + by * L); g.lineTo(cx + bx * L, cy - by * L); g.stroke(); g.setLineDash([]);
          const ax = cx + bx * L, ay = cy - by * L, ang = Math.atan2(-by, bx);
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - 8 * Math.cos(ang - 0.4), ay - 8 * Math.sin(ang - 0.4)); g.lineTo(ax - 8 * Math.cos(ang + 0.4), ay - 8 * Math.sin(ang + 0.4)); g.closePath(); g.fill();
          text(g, col, '射线 θ = ' + S.deg + '°', W - 4, 10, col('--accent'), 'right', 'middle', 11, true);
        }
        function drawP() {
          const g = cvP.g, W = cvP.w, Hh = cvP.h;
          g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          if (S.view === 'last') {
            const A = h.axes(g, W, Hh, { x0: -7, x1: 7, y0: 0, y1: 5, pad: { l: 34, r: 8, t: 24, b: 34 }, xTicks: [-6, -3, 0, 3, 6], yTicks: [0, 1, 2, 3, 4, 5], xLabel: '探测器位置 t (cm)', yLabel: '−ln(I/I₀)' }, col);
            const last = S.projs[S.projs.length - 1];
            S.projs.forEach((pr) => {
              const on = pr === last;
              g.strokeStyle = col(on ? '--s1' : '--muted'); g.globalAlpha = on ? 1 : 0.25; g.lineWidth = on ? 1.6 : 1;
              g.beginPath(); pr.p.forEach((v, i) => { const x = A.X(T0 + i * DS), y = A.Y(clamp(v, 0, 5)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
            });
            g.globalAlpha = 1;
            text(g, col, last ? '最新：θ = ' + last.deg + '°' : '按"拍这个角度"', A.p.l + 2, 11, col('--muted'), 'left', 'middle', 11);
          } else {
            const pad = { l: 40, r: 8, t: 24, b: 34 }, iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
            g.fillStyle = '#000'; g.fillRect(pad.l, pad.t, iw, ih);
            const rh = ih / 180;
            S.projs.forEach((pr) => {
              const y = pad.t + pr.deg * rh, hgt = Math.max(3, rh * 2.5);
              pr.p.forEach((v, i) => { const c = Math.round(255 * clamp(v / 4.5, 0, 1)); g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(pad.l + (i / NS) * iw, y, iw / NS + 0.6, hgt); });
            });
            g.strokeStyle = col('--line'); g.strokeRect(pad.l + 0.5, pad.t + 0.5, iw, ih);
            g.font = '11px ' + col('--mono-font'); g.fillStyle = col('--muted'); g.textAlign = 'right'; g.textBaseline = 'middle';
            [0, 45, 90, 135, 180].forEach((d) => g.fillText(d + '°', pad.l - 4, pad.t + d * rh));
            g.textAlign = 'center'; g.textBaseline = 'top';
            [-6, 0, 6].forEach((t) => g.fillText(String(t), pad.l + ((t - T0) / (NS * DS)) * iw, pad.t + ih + 6));
            text(g, col, '探测器位置 t (cm)', pad.l + iw / 2, Hh - 8, col('--muted'), 'center', 'middle', 11);
            text(g, col, '每行一个角度 θ；亮 = 吸收多', pad.l, 11, col('--muted'), 'left', 'middle', 11);
          }
        }
        cvR.onResize(drawR); cvP.onResize(drawP);
        const un = watchTheme(() => { drawR(); drawP(); });
        recompute();
        return { destroy() { cvR.destroy(); cvP.destroy(); un(); } };
      },
    };
  }

  CHALLENGES.rontgen = {
    title: '黑纸后面的光',
    _m: { bright, transAl, MU_AL_MM, EQ_TRUE, lineIntegrals, measureProj, rampFilter, backproject, CANDS, TRUTH },
    mount(root, ctx) {
      injectStyle();
      return H.stages(root, ctx, [stage1(ctx), stage2(ctx), stage3(ctx)]);
    },
  };
})();
