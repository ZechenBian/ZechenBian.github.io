/* 氢的密码 — 挑战版（Nobel Physics 1922: Niels Bohr, structure of atoms and their radiation）
 * 时代：1885–1913。氢的谱线被量得极准，却没人知道为什么。
 * 读者自己做四件事：(1) 从 6 条巴耳末线的波长里找出只含整数的公式并拟合 R；
 * (2) 用自己的 R 预言看不见的谱线（莱曼 α、帕邢 α、巴耳末系限）；
 * (3) 搭一架 5 级能量梯子，让所有观测谱线都成为两级之差；
 * (4) 用量纲分析从 ħ、m_e、ke² 拼出原子的长度尺度（玻尔半径）。
 *
 * 常数：R_H = 1.09678e7 m⁻¹（氢，含约化质量），hc = 1239.84198 eV·nm，
 * ħ = 1.054571817e-34 J·s，m_e = 9.1093837e-31 kg，ke² = 2.307077552e-28 J·m，c = 2.99792458e8 m/s。
 * 六条线是 n = 3…8 → 2 的真空波长（nm）。
 */
(() => {
  const LINES = [656.47, 486.27, 434.17, 410.29, 397.12, 389.02];
  const RH = 1.09678;                                  // ×10⁷ m⁻¹
  const HC = 1239.84198;                               // eV·nm
  const lamOf = (R, a, n) => 1 / (R * 1e-2 * (1 / (a * a) - 1 / (n * n)));   // nm, R in 1e7 m⁻¹
  const HBAR = 1.054571817e-34, ME = 9.1093837e-31, KE2 = 2.307077552e-28, CL = 2.99792458e8;
  const SERIES = { 1: ['Ly', '莱曼', '--s1'], 2: ['H', '巴耳末', '--s2'], 3: ['Pa', '帕邢', '--s3'] };
  const GREEK = 'αβγδεζ';
  const TARGETS = [];
  for (let n1 = 1; n1 <= 3; n1++) for (let n2 = n1 + 1; n2 <= 5; n2++) {
    const lam = lamOf(RH, n1, n2);
    TARGETS.push({ n1, n2, lam, E: HC / lam, name: SERIES[n1][0] + GREEK[n2 - n1 - 1] });
  }
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sup = (k) => String(k).replace(/./g, (c) => SUP[c] || c);
  const sci = (v, d = 3) => { const [m, e] = v.toExponential(d).split('e'); return m + '×10' + sup(+e); };

  const CSS = `
.bohr-note{font-size:13.5px;line-height:1.7;padding:10px 12px;border-radius:6px;background:var(--bg2);margin:0}
.bohr-toggles{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:13px}
.bohr-toggles .ctl-lab{flex-basis:100%}
.bohr-formula{font-size:15px;padding:6px 0;overflow-x:auto}
.bohr-nudge{display:flex;flex-wrap:wrap;gap:2px;align-items:center}
.bohr-lv{display:grid;grid-template-columns:3.6em minmax(0,1fr) 6.2em;gap:8px;align-items:center;font-size:13px}
.bohr-lv input[type=range]{width:100%;accent-color:var(--accent);margin:0}
.bohr-lv input[type=number],.bohr-step input{font:inherit;font-family:var(--mono-font);font-size:12.5px;width:100%;box-sizing:border-box;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:4px 6px}
.bohr-lvs{display:grid;gap:6px}
.bohr-ok{color:var(--good);font-weight:600}
.bohr-no{color:var(--muted)}
.bohr-steps{display:flex;flex-wrap:wrap;gap:10px 18px}
.bohr-step{display:grid;gap:4px;font-size:13px}
.bohr-step .row{display:flex;align-items:center;gap:4px}
.bohr-step input{width:3.6em;text-align:center}
.bohr-dim{font-family:var(--mono-font);font-size:15px}
.bohr-dim b{color:var(--accent)}
.bohr-sub{display:grid;gap:12px;min-width:0}
.bohr-sub[hidden]{display:none}
.bohr-sub>*{min-width:0;max-width:100%}
.bohr-sep{border:0;border-top:1px dashed var(--line);margin:4px 0}`;
  function injectCSS() { if (!document.getElementById('st-bohr')) document.head.append(H.el('style', { id: 'st-bohr', text: CSS })); }
  function onTheme(fn) {
    const mo = new MutationObserver(() => fn());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const lis = () => fn();
    if (mq) mq.addEventListener ? mq.addEventListener('change', lis) : mq.addListener(lis);
    return () => { mo.disconnect(); if (mq) mq.removeEventListener ? mq.removeEventListener('change', lis) : mq.removeListener(lis); };
  }

  /* 光谱条：线性或对数 λ 轴；lines = [{lam, kind:'obs'|'pred'|'limit', label}] */
  function drawStrip(c, col, { lo, hi, log = false, lines = [], bands = false }) {
    const g = c.g, W = c.w, Hh = c.h, mono = col('--mono-font') || 'monospace';
    g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
    const padL = 12, padR = 12, top = 18, bot = Hh - 22;
    const X = log ? (l) => padL + (Math.log(l / lo) / Math.log(hi / lo)) * (W - padL - padR)
      : (l) => padL + ((l - lo) / (hi - lo)) * (W - padL - padR);
    g.fillStyle = col('--bg2'); g.fillRect(padL, top, W - padL - padR, bot - top);
    if (bands) {
      const v0 = X(380), v1 = X(780);
      g.globalAlpha = 0.18;
      for (let x = Math.floor(v0); x < v1; x++) {
        const l = log ? lo * Math.pow(hi / lo, (x - padL) / (W - padL - padR)) : lo + ((x - padL) / (W - padL - padR)) * (hi - lo);
        g.fillStyle = H.wavelengthRGB(l) || col('--muted'); g.fillRect(x, top, 1, bot - top);
      }
      g.globalAlpha = 1;
      g.font = '10.5px ' + mono; g.fillStyle = col('--muted'); g.textBaseline = 'top'; g.textAlign = 'center';
      g.fillText('紫外', (padL + v0) / 2, 3); g.fillText('可见', (v0 + v1) / 2, 3); g.fillText('红外', (v1 + W - padR) / 2, 3);
    }
    let lastLab = -1e9;
    for (const L of lines.slice().sort((a, b) => a.lam - b.lam)) {
      if (L.lam < lo || L.lam > hi) continue;
      const x = X(L.lam);
      if (L.kind === 'pred') {
        g.fillStyle = col('--accent'); g.beginPath(); g.moveTo(x, bot + 1); g.lineTo(x - 4, bot + 8); g.lineTo(x + 4, bot + 8); g.closePath(); g.fill();
        continue;
      }
      g.strokeStyle = L.kind === 'limit' ? col('--fg') : (H.wavelengthRGB(L.lam) || col('--muted'));
      g.lineWidth = L.kind === 'limit' ? 1.2 : 2.6;
      if (L.kind === 'limit') g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); g.setLineDash([]);
      if (L.label && x - lastLab > 30) {
        lastLab = x;
        g.font = '10.5px ' + mono; g.fillStyle = L.hl ? col('--accent') : col('--muted'); g.textBaseline = 'top'; g.textAlign = 'center';
        g.fillText(L.label, Math.min(W - 24, Math.max(24, x)), bot + 4);
      }
    }
    g.strokeStyle = col('--line'); g.lineWidth = 1; g.strokeRect(padL + 0.5, top + 0.5, W - padL - padR - 1, bot - top - 1);
    return X;
  }

  CHALLENGES.bohr = {
    title: '氢的密码',
    _math: { lamOf, LINES, TARGETS },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color, el = h.el;
      const shared = { R: null };          // 读者在第一关拟合出的 R（×10⁷ m⁻¹）
      const myR = () => shared.R || RH;

      /* ================= 第一关：数字里的规律 ================= */
      const stage1 = {
        title: '数字里的规律',
        task: `<p>1880 年代。氢放电管的光经过光栅，分成几条清晰的细线。埃格斯特朗、惠更斯（William Huggins）等人
          已经把它们的波长量到了万分之一的精度，下面是换算成真空波长的六条（后两条已在紫外边缘，是从恒星光谱里拍到的）。</p>
          <p>没有任何理论能说出为什么偏偏是这些数。1885 年，巴塞尔一位中学数学老师巴耳末拿到前四个数，
          觉得它们"应当"满足某个简单的规律。</p>
          <p><b>任务</b>：先用下面的计算器把数据翻来覆去地看；有了想法后，提出一个公式，让它同时吻合全部六条线，
          每条偏差都小于 <b>300 ppm</b>（万分之三，大致是当年的测量误差）。</p>`,
        hints: [
          '打开 $1/\\lambda$ 那一列：谱线越往紫外越挤，$1/\\lambda$ 好像在逼近一个上限。一个在 $n\\to\\infty$ 时趋于常数的整数表达式，最自然的是 $\\text{常数}-\\text{常数}/n^2$。',
          '在构造器里：$a$ 决定"上限"在哪里，$n_0$ 决定第一条线配哪个整数。把 $R$ 粗调到让第一条线残差接近 0，再看其余五条的残差是一起变好还是散开——散开说明 $a$ 或 $n_0$ 不对。',
          '取 $a=2$、$n_0=3$（第一条线配 $n=3$，后面依次 4, 5, …），再把 $R$ 微调到约 $1.0968\\times10^{7}\\,\\mathrm{m^{-1}}$。',
        ],
        answer: `$\\dfrac1\\lambda = R\\left(\\dfrac1{2^2}-\\dfrac1{n^2}\\right)$，$n=3,4,\\dots,8$，$R_{\\rm H}\\approx 1.09678\\times10^7\\,\\mathrm{m^{-1}}$。
          <p>由来：$1/\\lambda$ 随 $n$ 增大趋于极限 $R/4\\approx 2.742\\,\\mu\\mathrm{m^{-1}}$（对应 364.7 nm）。巴耳末原本写成
          $\\lambda = B\\,n^2/(n^2-4)$，$B=364.56$ nm；里德伯（1888–90）改写成波数之差的形式，才让"其他整数"的推广显得自然。
          用 $n=3$ 的线定 $R$：$R = (1/656.47\\,\\text{nm})/(1/4-1/9) = 1.0968\\times10^7\\,\\mathrm{m^{-1}}$，其余五条残差都在 ±20 ppm 以内。</p>`,
        build(body, api) {
          const cols = { inv: false, ratio: false, diff: false };
          const S = { open: false, a: 1, n0: 2, R: 1.1000 };
          const strip = el('div', { class: 'lab-stage' });
          body.append(strip);
          const cs = h.canvas(strip, { aspect: 0.16, minH: 74, maxH: 104 });

          const tg = el('div', { class: 'bohr-toggles' }, [el('span', { class: 'ctl-lab', text: '计算器：勾选要显示的列' })]);
          [['inv', '1/λ（µm⁻¹）'], ['ratio', 'λ / λ₁'], ['diff', '相邻 Δ(1/λ)']].forEach(([k, lab]) =>
            tg.append(h.toggle({ label: lab, value: cols[k], onChange: (b) => { cols[k] = b; table(); } }).el));
          const tbox = el('div', { class: 'dtable' });
          body.append(tg, tbox);

          const note = el('p', { class: 'bohr-note', html: '巴耳末发现了一个<b>只含整数</b>（外加一个常数）的公式，能同时给出这几条线。你能找到吗？先看数据，有了想法再按下面的按钮试一种形式。' });
          const openBtn = h.button({ label: '我想试一个形式', kind: 'primary', onClick: () => { S.open = true; builder.hidden = false; openBtn.disabled = true; api.typeset(builder); update(); } });
          body.append(note, el('div', {}, [openBtn]));

          /* ---------- 构造器 ---------- */
          const builder = el('div', { class: 'bohr-sub', hidden: true });
          const fml = el('div', { class: 'bohr-formula', html: '试一试这种形式：$\\dfrac{1}{\\lambda} = R\\left(\\dfrac{1}{a^2}-\\dfrac{1}{n^2}\\right)$，第 $k$ 条线配 $n = n_0 + k - 1$。' });
          const ca = h.choice({ label: '整数 a', value: S.a, options: [1, 2, 3, 4].map((v) => ({ value: v, label: String(v) })), onChange: (v) => { S.a = v; update(); } });
          const cn = h.choice({ label: '第一条线 (656 nm) 配的 n₀', value: S.n0, options: [2, 3, 4, 5, 6].map((v) => ({ value: v, label: String(v) })), onChange: (v) => { S.n0 = v; update(); } });
          const sR = h.slider({ label: 'R（×10⁷ m⁻¹）', min: 1.0, max: 1.2, step: 0.0001, value: S.R, format: (v) => v.toFixed(4), onInput: (v) => { S.R = v; update(); } });
          const nudge = (d) => h.button({ label: (d > 0 ? '+' : '−') + Math.abs(d), onClick: () => { S.R = Math.min(1.2, Math.max(1.0, +(S.R + d).toFixed(4))); sR.set(S.R); update(); } });
          const nud = el('div', { class: 'ctl' }, [el('span', { class: 'ctl-lab', text: '微调 R' }), el('div', { class: 'bohr-nudge' }, [nudge(-0.001), nudge(-0.0001), nudge(0.0001), nudge(0.001)])]);
          const ctl = el('div', { class: 'lab-controls' }, [ca.el, cn.el, sR.el, nud]);
          const rstage = el('div', { class: 'lab-stage' });
          const ro = el('div', { class: 'lab-readout' });
          const rMax = h.readout('最大 |残差|'), rR = h.readout('R');
          ro.append(rMax.el, rR.el);
          builder.append(fml, ctl, rstage, ro);
          body.append(builder);
          const cr = h.canvas(rstage, { aspect: 0.42, minH: 170, maxH: 260 });

          function pred() {
            return LINES.map((obs, k) => {
              const n = S.n0 + k, t = 1 / (S.a * S.a) - 1 / (n * n);
              const p = S.R * 1e-2 * t, o = 1 / obs;             // nm⁻¹
              const ppm = t <= 0 ? -1e6 : ((p - o) / o) * 1e6;
              return { n, ppm: Math.max(-1e6, Math.min(1e6, ppm)), lam: t > 0 ? 1 / p : null };
            });
          }
          function table() {
            const inv = LINES.map((l) => 1000 / l);
            const head = ['#', 'λ（nm）'].concat(cols.inv ? ['1/λ（µm⁻¹）'] : [], cols.ratio ? ['λ / λ₁'] : [], cols.diff ? ['Δ(1/λ)（µm⁻¹）'] : []);
            const rows = LINES.map((l, k) => [String(k + 1), l.toFixed(2)].concat(
              cols.inv ? [inv[k].toFixed(5)] : [], cols.ratio ? [(l / LINES[0]).toFixed(5)] : [],
              cols.diff ? [k ? (inv[k] - inv[k - 1]).toFixed(5) : '—'] : []));
            tbox.innerHTML = '';
            tbox.append(el('table', {}, [el('thead', {}, el('tr', {}, head.map((x) => el('th', { text: x })))),
              el('tbody', {}, rows.map((r) => el('tr', {}, r.map((x) => el('td', { text: x })))))]));
          }
          function drawSpec() {
            const P = S.open ? pred() : [];
            drawStrip(cs, col, { lo: 370, hi: 680, lines: LINES.map((l) => ({ lam: l, kind: 'obs', label: cs.w > 480 ? l.toFixed(0) : null }))
              .concat(P.filter((p) => p.lam).map((p) => ({ lam: p.lam, kind: 'pred' }))) });
          }
          const sy = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v) / 100);   // symlog
          function drawRes() {
            const g = cr.g, W = cr.w, Hh = cr.h, P = pred();
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const lim = sy(1e6), ticks = [-1e5, -1e3, -300, 0, 300, 1e3, 1e5];
            const A = h.axes(g, W, Hh, { x0: 0.4, x1: 6.6, y0: -lim, y1: lim, pad: { l: 52, b: 32 }, xTicks: [1, 2, 3, 4, 5, 6], yTicks: ticks.map(sy),
              fmtX: (k) => LINES[k - 1].toFixed(0), fmtY: (v) => { const r = Math.round(Math.sign(v) * (Math.pow(10, Math.abs(v)) - 1) * 100); return Math.abs(r) >= 1000 ? (r > 0 ? '+' : '−') + '10' + sup(Math.round(Math.log10(Math.abs(r)))) : String(r); },
              xLabel: '谱线 λ（nm）', yLabel: '残差 ppm（对数）' }, col);
            g.fillStyle = col('--good'); g.globalAlpha = 0.14; g.fillRect(A.p.l, A.Y(sy(300)), A.iw, A.Y(sy(-300)) - A.Y(sy(300))); g.globalAlpha = 1;
            P.forEach((p, k) => {
              const x = A.X(k + 1), y0 = A.Y(0), y = A.Y(sy(p.ppm)), ok = Math.abs(p.ppm) < 300;
              g.fillStyle = ok ? col('--good') : col('--warn');
              g.fillRect(x - 7, Math.min(y0, y), 14, Math.max(1.5, Math.abs(y - y0)));
              g.font = '10.5px ' + (col('--mono-font') || 'monospace'); g.fillStyle = col('--muted'); g.textAlign = 'center';
              g.textBaseline = p.ppm >= 0 ? 'bottom' : 'top';
              g.fillText('n=' + p.n, x, p.ppm >= 0 ? Math.min(y0, y) - 2 : Math.max(y0, y) + 2);
            });
          }
          function update() {
            drawSpec();
            if (!S.open) return;
            drawRes();
            const P = pred(), m = Math.max(...P.map((p) => Math.abs(p.ppm)));
            rMax.set(m >= 1e6 ? '> 10⁶ ppm' : Math.round(m) + ' ppm');
            rR.set(sci(S.R * 1e7, 4) + ' m⁻¹');
            if (m < 300 && !api.solved()) {
              shared.R = S.R;
              api.done(`<b>这就是巴耳末公式（1885）</b>，里德伯（1888）把它写成波数之差 $1/\\lambda = R(1/2^2-1/n^2)$，你的 $R = ${S.R.toFixed(4)}\\times10^7\\,\\mathrm{m^{-1}}$。六个十进制数被两个小整数和一个常数完全概括——这不像巧合。`);
            } else if (m < 300) shared.R = S.R;
          }
          table(); update();
          cs.onResize(drawSpec); cr.onResize(() => S.open && drawRes());
          const off = onTheme(update);
          return { destroy() { off(); cs.destroy(); cr.destroy(); } };
        },
      };

      /* ================= 第二关：预言看不见的谱线 ================= */
      const stage2 = {
        title: '预言看不见的谱线',
        task: `<p>里德伯的写法里，"2" 看起来只是一个整数。没有任何理由说它不能是别的。如果把 2 换成 1 或 3，
          公式会给出新的谱线系——但它们不在可见光里：换成 1 的那一系全在紫外，换成 3 的那一系全在红外。
          1890 年代，没人在那里找过。</p>
          <p><b>任务</b>：用<b>你自己拟合的 $R$</b>，预言下面三个波长（真空，nm），容差 ±0.5%。每答对一个，它就出现在下面的宽谱条上。</p>`,
        hints: [
          '"波长最长"的那条线，对应括号 $(1/a^2-1/n^2)$ 最小，也就是 $n$ 取它允许的最小值 $a+1$。',
          '系限：$n\\to\\infty$，括号变成 $1/a^2$。巴耳末系限就是 $\\lambda = 4/R$。',
          '莱曼 α：$1/\\lambda = R(1-1/4) = \\tfrac34 R$，$\\lambda\\approx121.6$ nm；帕邢 α：$1/\\lambda = R(1/9-1/16)=\\tfrac{7}{144}R$，$\\lambda\\approx1875$ nm；巴耳末系限 $4/R\\approx364.7$ nm。',
        ],
        answer: `莱曼 α：$\\lambda = \\dfrac{4}{3R} = 121.57$ nm；帕邢 α：$\\lambda = \\dfrac{144}{7R} = 1875.6$ nm；巴耳末系限：$\\lambda = \\dfrac4R = 364.7$ nm。
          <p>帕邢 1908 年在红外找到了 1875 nm 的线；莱曼 1906–1914 年在真空紫外找到了 121.6 nm 起的整个系列。
          预言与测量在千分之一以内相符。</p>`,
        build(body, api) {
          const got = { ly: false, pa: false, lim: false };
          const ro = el('div', { class: 'lab-readout' });
          const rR = h.readout('你的 R（来自第一关）');
          ro.append(rR.el);
          rR.set(shared.R ? sci(shared.R * 1e7, 4) + ' m⁻¹' : sci(RH * 1e7, 4) + ' m⁻¹（第一关未完成，暂用标准值）');
          const st = el('div', { class: 'lab-stage' });
          body.append(ro, st);
          const cs = h.canvas(st, { aspect: 0.2, minH: 92, maxH: 130 });
          const truth = { ly: lamOf(RH, 1, 2), pa: lamOf(RH, 3, 4), lim: 4 / (RH * 1e-2) };
          const mk = (key, label) => h.answer({ label, unit: 'nm', placeholder: 'λ',
            check: (v) => {
              const ref = truth[key], mine = key === 'lim' ? 4 / (myR() * 1e-2) : key === 'ly' ? lamOf(myR(), 1, 2) : lamOf(myR(), 3, 4);
              const ok = Math.abs(v / ref - 1) <= 0.005 || Math.abs(v / mine - 1) <= 0.005;
              if (ok) return { ok, msg: `对。实测值 ${ref.toFixed(1)} nm。` };
              const r = v / ref;
              return { ok, msg: r > 1.5 || r < 0.67 ? '差得很远——检查是哪个整数换了，n 取哪个值。' : '接近了，但超出 0.5%。' };
            },
            onOk: () => { got[key] = true; draw(); check(); } });
          const A1 = mk('ly', '(a) 把 2 换成 1：这一系中<b>波长最长</b>的线（±0.5%）');
          const A2 = mk('pa', '(b) 把 2 换成 3：这一系中<b>波长最长</b>的线（±0.5%）');
          const A3 = mk('lim', '(c) 巴耳末系本身的<b>短波极限</b>（n → ∞，±0.5%）');
          body.append(A1.el, A2.el, A3.el);
          function draw() {
            const lines = LINES.map((l) => ({ lam: l, kind: 'obs' }));
            if (got.ly) lines.push({ lam: truth.ly, kind: 'obs', label: 'Lyα 121.6', hl: true });
            if (got.lim) lines.push({ lam: truth.lim, kind: 'limit', label: '系限 364.7', hl: true });
            if (got.pa) lines.push({ lam: truth.pa, kind: 'obs', label: 'Paα 1875', hl: true });
            const X = drawStrip(cs, col, { lo: 90, hi: 2000, log: true, bands: true, lines });
            const g = cs.g; g.font = '10px ' + (col('--mono-font') || 'monospace'); g.fillStyle = col('--muted'); g.textBaseline = 'bottom'; g.textAlign = 'center';
            [100, 200, 500, 1000, 2000].forEach((t) => { if (cs.w > 420 || t !== 200) g.fillText(String(t), Math.min(cs.w - 16, X(t)), cs.h - 1); });
            if (!got.ly && !got.pa && !got.lim) { g.textBaseline = 'top'; g.fillText('巴耳末系（已知）', X(500), cs.h - 20); }
          }
          function check() {
            if (got.ly && got.pa && got.lim) api.done('<b>预言全部成立。</b>莱曼（1906）在真空紫外、帕邢（1908）在红外真的找到了这些线：$a$ 可以是任何正整数，每个 $a$ 是一个"谱线系"。整数结构是真实的。');
          }
          draw(); cs.onResize(draw);
          const off = onTheme(draw);
          return { destroy() { off(); cs.destroy(); } };
        },
      };

      /* ================= 第三关：谱线 = 两个能级之差 ================= */
      const stage3 = {
        title: '谱线 = 两个能级之差',
        task: `<p>里德伯–里兹组合原理（1908）：每条谱线的波数都是两个"项"之差。爱因斯坦（1905）说光以 $E = h\\nu = hc/\\lambda$ 的
          能量份额出现。把两句话放在一起：也许原子只能处在一组<b>能量确定</b>的状态上，一条谱线就是从一个状态跳到另一个时放出的能量。</p>
          <p>下表列出莱曼、巴耳末、帕邢三个系里上能级不超过第 5 项的全部 9 条线，已换算成光子能量（$hc = 1239.84$ eV·nm）。</p>
          <p><b>任务</b>：在左边的能量轴上摆好 5 个能级（拖动横线，或用滑块/输入框），让<b>每一条</b>观测谱线都等于某两级之差（容差 0.5%）。
          约定：电子完全脱离原子、静止在无穷远时能量为 0，所以束缚态是负的。然后从你的梯子读出氢的电离能。</p>`,
        hints: [
          '先摆最低的两级：莱曼 α（10.20 eV）是 1→2 之差。然后看莱曼 β、γ、δ：它们都从同一个最低能级出发，所以第 3、4、5 级分别比最低级高 12.09、12.75、13.06 eV。',
          '摆好后，巴耳末和帕邢的线会自动匹配——这本身就是组合原理的检验。至于整架梯子的绝对位置：能级向上越挤越密，并趋向一个极限（电离）。用 $E_n = -C/n^2$ 试试，哪个 $C$ 能让 $E_2 - E_1 = 10.20$ eV？',
          '$E_n = -13.6/n^2$ eV：$-13.60,\\ -3.40,\\ -1.51,\\ -0.85,\\ -0.54$。电离能 = 从最低能级到 0 = 13.6 eV。',
        ],
        answer: `能级 $E_n = -\\dfrac{hcR}{n^2} = -\\dfrac{13.6\\ \\text{eV}}{n^2}$：$-13.60,\\,-3.40,\\,-1.51,\\,-0.85,\\,-0.54$ eV。
          <p>因为 $\\dfrac{1}{\\lambda} = R\\left(\\dfrac1{n_1^2}-\\dfrac1{n_2^2}\\right)$，乘以 $hc$ 就是 $h\\nu = E_{n_2} - E_{n_1}$。
          10 对能级给出 10 个差值，9 条线全部落在上面。电离能 $= 0 - E_1 = hcR = 13.6$ eV，也就是莱曼系的系限 91.2 nm 对应的光子能量。</p>`,
        build(body, api) {
          const lv = [-14, -11, -8, -5, -2];
          let ladderOK = false, ansOK = false;
          const st = el('div', { class: 'lab-stage' });
          body.append(st);
          const cv = h.canvas(st, { aspect: 0.7, minH: 280, maxH: 420 });
          cv.canvas.style.touchAction = 'none';
          cv.canvas.setAttribute('aria-label', '能级图：上下拖动横线改变能级；也可以用下面的滑块');

          const rows = el('div', { class: 'bohr-lvs' });
          const ctrls = lv.map((v, i) => {
            const id = 'bohr-lv-' + i + '-' + Math.random().toString(36).slice(2, 6);
            const r = el('input', { type: 'range', min: -15, max: 0, step: 0.001, value: v, id, 'aria-label': `能级 L${i + 1}（eV）` });
            const nb = el('input', { type: 'number', min: -15, max: 0, step: 0.01, value: v.toFixed(3), 'aria-label': `能级 L${i + 1} 数值（eV）` });
            r.addEventListener('input', () => setLv(i, +r.value, 'r'));
            nb.addEventListener('change', () => { const x = parseFloat(nb.value); if (isFinite(x)) setLv(i, x, 'n'); });
            rows.append(el('div', { class: 'bohr-lv' }, [el('label', { for: id, text: `L${i + 1}` }), r, nb]));
            return { r, nb };
          });
          body.append(rows);
          const tbox = el('div', { class: 'dtable' });
          body.append(tbox);
          const ans = h.answer({ label: '从你的梯子读出：氢的<b>电离能</b>（把电子从最低能级移到无穷远，±1%）', unit: 'eV',
            check: (v) => {
              const ok = Math.abs(v / 13.6 - 1) <= 0.01;
              if (ok && !ladderOK) return { ok: false, msg: '数值对了——但先让梯子匹配全部 9 条线，这个数才有根据。' };
              return { ok, msg: ok ? '对。' : Math.abs(v / 13.6 - 1) < 0.1 ? '接近，但超出 1%。' : '想想：电离 = 从最低能级到 E = 0。' };
            },
            onOk: () => { ansOK = true; finish(); } });
          body.append(ans.el);

          function setLv(i, v, src) {
            lv[i] = Math.max(-15, Math.min(0, +v));
            if (src !== 'r') ctrls[i].r.value = lv[i];
            if (src !== 'n') ctrls[i].nb.value = lv[i].toFixed(3);
            update();
          }
          function match() {
            return TARGETS.map((t) => {
              let best = null;
              for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
                if (lv[i] <= lv[j]) continue;
                const err = Math.abs((lv[i] - lv[j]) / t.E - 1);
                if (!best || err < best.err) best = { i, j, err };
              }
              return Object.assign({}, t, { m: best && best.err < 0.005 ? best : null, best });
            });
          }
          function geo() {
            const W = cv.w, Hh = cv.h, top = 16, bot = Hh - 20, x0 = 52, x1 = Math.round(W * (W > 520 ? 0.5 : 0.56));
            const Y = (e) => top + ((0.6 - e) / 15.6) * (bot - top);
            const E = (y) => 0.6 - ((y - top) / (bot - top)) * 15.6;
            return { W, Hh, top, bot, x0, x1, Y, E };
          }
          function draw() {
            const g = cv.g, G = geo(), M = match(), mono = col('--mono-font') || 'monospace';
            g.fillStyle = col('--panel'); g.fillRect(0, 0, G.W, G.Hh);
            g.font = '11px ' + mono; g.textBaseline = 'middle'; g.textAlign = 'right';
            for (let e = 0; e >= -15; e -= 3) {
              g.strokeStyle = col('--grid'); g.lineWidth = 1; g.beginPath(); g.moveTo(G.x0, G.Y(e)); g.lineTo(G.W - 8, G.Y(e)); g.stroke();
              g.fillStyle = col('--muted'); g.fillText(String(e), G.x0 - 6, G.Y(e));
            }
            g.save(); g.translate(11, (G.top + G.bot) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('E（eV）', 0, 0); g.restore();
            g.strokeStyle = col('--muted'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(G.x0, G.Y(0)); g.lineTo(G.W - 8, G.Y(0)); g.stroke(); g.setLineDash([]);
            g.textAlign = 'left'; g.fillStyle = col('--muted'); g.fillText('E = 0（电离）', G.x0 + 4, G.Y(0) - 8);
            // levels
            lv.forEach((e, i) => {
              const y = G.Y(e);
              g.strokeStyle = drag === i ? col('--accent') : col('--fg'); g.lineWidth = drag === i ? 3 : 2;
              g.beginPath(); g.moveTo(G.x0, y); g.lineTo(G.x1, y); g.stroke();
              g.fillStyle = col('--fg'); g.textAlign = 'left'; g.fillText(`L${i + 1}`, G.x1 + 4, y);
            });
            // matched transitions: arrows at the right, coloured by series
            const done = M.filter((t) => t.m), n = TARGETS.length, xs = G.x1 + 30, dx = (G.W - 14 - xs) / n;
            M.forEach((t, k) => {
              const x = xs + dx * (k + 0.5), c = col(SERIES[t.n1][2]);
              g.font = '10px ' + mono; g.fillStyle = t.m ? c : col('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
              if (dx > 22) g.fillText(t.name, x, G.bot + 4);
              if (!t.m) { g.globalAlpha = 0.35; g.beginPath(); g.arc(x, G.bot - 4, 2, 0, 7); g.fill(); g.globalAlpha = 1; return; }
              const ya = G.Y(lv[t.m.i]), yb = G.Y(lv[t.m.j]);
              g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 2;
              g.beginPath(); g.moveTo(x, ya); g.lineTo(x, yb); g.stroke();
              g.beginPath(); g.moveTo(x, yb); g.lineTo(x - 4, yb - 7); g.lineTo(x + 4, yb - 7); g.closePath(); g.fill();
            });
            g.textBaseline = 'top'; g.textAlign = 'left'; g.font = '11px ' + mono; g.fillStyle = col('--muted');
            g.fillText(`已匹配 ${done.length}/${n}`, xs, G.top);
          }
          function table() {
            const M = match();
            tbox.innerHTML = '';
            tbox.append(el('table', {}, [
              el('thead', {}, el('tr', {}, ['谱线', 'λ（nm）', 'hc/λ（eV）', '你的梯子'].map((x) => el('th', { text: x })))),
              el('tbody', {}, M.map((t) => el('tr', {}, [
                el('td', { text: `${SERIES[t.n1][1]} ${t.name}` }), el('td', { text: t.lam.toFixed(2) }), el('td', { text: t.E.toFixed(3) }),
                el('td', { html: t.m ? `<span class="bohr-ok">✓ L${t.m.i + 1}→L${t.m.j + 1}</span>` : `<span class="bohr-no">✗${t.best ? `（最近 ${(t.best.err * 100).toFixed(1)}%）` : ''}</span>` }),
              ])))]));
            return M.every((t) => t.m);
          }
          function update() {
            draw();
            const all = table();
            if (all && !ladderOK) { ladderOK = true; api.say('9 条线全部是两级之差。现在读出电离能。', 'info'); }
            if (!all && ladderOK && !api.solved()) { ladderOK = false; api.say('', 'info'); }
            finish();
          }
          function finish() {
            if (ladderOK && ansOK) api.done('<b>玻尔的定态（1913）</b>：原子只能处在一组分立能量 $E_n = -13.6\\,\\text{eV}/n^2$ 的状态上，不辐射；跃迁时放出一个光子，$h\\nu = E_{n_2}-E_{n_1}$。三个谱线系只是同一架梯子上不同的落脚点。');
          }
          let drag = -1;
          const pos = (e) => { const r = cv.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
          function down(e) {
            const p = pos(e), G = geo();
            let best = -1, bd = 16;
            lv.forEach((v, i) => { const d = Math.abs(G.Y(v) - p.y); if (d < bd && p.x > G.x0 - 10 && p.x < G.x1 + 30) { bd = d; best = i; } });
            if (best < 0) return;
            drag = best; cv.canvas.setPointerCapture(e.pointerId); e.preventDefault(); draw();
          }
          function move(e) { if (drag < 0) return; const G = geo(); setLv(drag, Math.round(G.E(pos(e).y) * 100) / 100); }
          function up() { if (drag >= 0) { drag = -1; draw(); } }
          cv.canvas.addEventListener('pointerdown', down);
          cv.canvas.addEventListener('pointermove', move);
          cv.canvas.addEventListener('pointerup', up);
          cv.canvas.addEventListener('pointercancel', up);
          update(); cv.onResize(draw);
          const off = onTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ================= 第四关：原子有多大 ================= */
      const stage4 = {
        title: '原子有多大',
        task: `<p>1911 年卢瑟福证明原子有一个极小的核，电子在外面。可是经典力学和电磁学里，电子质量 $m_e$、电荷 $e$
          拼不出一个长度——原子凭什么是 $10^{-10}$ m 而不是别的大小？玻尔意识到：加进普朗克常数，就有了。</p>
          <p>可用的量：$\\hbar = 1.0546\\times10^{-34}$ J·s，$m_e = 9.109\\times10^{-31}$ kg，库仑耦合 $ke^2 = \\dfrac{e^2}{4\\pi\\varepsilon_0} = 2.307\\times10^{-28}$ J·m。</p>
          <p><b>任务</b>：找整数 $a, b, c$，使 $\\hbar^{a}\\, m_e^{b}\\, (ke^2)^{c}$ 的量纲是<b>长度</b>。下面的读数会实时给出量纲和数值。</p>`,
        hints: [
          '把三者写成基本量纲：$[\\hbar] = \\mathrm{kg\\,m^2\\,s^{-1}}$，$[m_e] = \\mathrm{kg}$，$[ke^2] = \\mathrm{J\\,m} = \\mathrm{kg\\,m^3\\,s^{-2}}$。',
          '要求 kg、m、s 的指数分别为 0、1、0：$a+b+c=0$，$2a+3c=1$，$-a-2c=0$。先解第三个。',
          '$a = -2c$ 代入第二式得 $c=-1$，于是 $a=2,\\ b=-1$：$\\hbar^2/(m_e\\,ke^2)$。',
        ],
        answer: `$a_0 = \\dfrac{\\hbar^2}{m_e\\,ke^2} = 0.529\\times10^{-10}$ m $= 0.529$ Å。
          <p>量纲方程 $a+b+c=0,\\ 2a+3c=1,\\ -a-2c=0$ 有唯一解 $(2,-1,-1)$。玻尔假设圆轨道角动量 $L = m_e v r = n\\hbar$，
          与库仑力提供向心力 $m_e v^2/r = ke^2/r^2$ 联立，得 $r_n = n^2\\hbar^2/(m_e ke^2) = n^2 a_0$，
          能量 $E_n = -ke^2/(2r_n) = -\\dfrac{m_e (ke^2)^2}{2\\hbar^2 n^2}$ = $-13.6$ eV$/n^2$——正是上一关的梯子，$R$ 由此从基本常数算出。
          附加题：$\\hbar c/ke^2 = 1/\\alpha \\approx 137.04$。</p>`,
        build(body, api) {
          const ex = { a: 0, b: 0, c: 0 };
          const steps = el('div', { class: 'bohr-steps' });
          const mk = (k, lab) => {
            const id = 'bohr-ex-' + k + '-' + Math.random().toString(36).slice(2, 6);
            const inp = el('input', { type: 'text', inputmode: 'numeric', id, value: '0', 'aria-label': lab });
            const set = (v) => { ex[k] = Math.max(-4, Math.min(4, v | 0)); inp.value = String(ex[k]); update(); };
            inp.addEventListener('change', () => { const v = parseInt(inp.value.replace('−', '-'), 10); set(isFinite(v) ? v : 0); });
            steps.append(el('div', { class: 'bohr-step' }, [el('label', { for: id, html: lab }),
              el('div', { class: 'row' }, [h.button({ label: '−', onClick: () => set(ex[k] - 1) }), inp, h.button({ label: '+', onClick: () => set(ex[k] + 1) })])]));
          };
          mk('a', 'ħ 的指数 a'); mk('b', 'm<sub>e</sub> 的指数 b'); mk('c', 'ke² 的指数 c');
          const dim = el('div', { class: 'bohr-dim' });
          const ro = el('div', { class: 'lab-readout' });
          const rV = h.readout('数值（SI 单位）'), rA = h.readout('换成 Å（仅当量纲是长度）');
          ro.append(rV.el, rA.el);
          body.append(steps, dim, ro);
          const bonusWrap = el('div', { class: 'bohr-sub', hidden: true });
          const bonus = h.answer({ label: '附加题（可选）：用 $ke^2$、$\\hbar$ 和光速 $c = 2.998\\times10^8$ m/s 拼出一个<b>无量纲</b>数，取大于 1 的那个组合，它约等于多少？（±0.5）',
            check: (v) => {
              const t = (HBAR * CL) / KE2, ok = Math.abs(v - t) <= 0.5;
              return { ok, msg: ok ? `对：$\\hbar c/ke^2 = ${t.toFixed(2)}$，它的倒数就是精细结构常数 $\\alpha\\approx1/137$——玻尔轨道上 $n=1$ 时电子速度正是 $\\alpha c$。` : (Math.abs(v * t - 1) < 0.02 ? '这是它的倒数 α。题目要大于 1 的那个。' : '先确认组合是无量纲的：$[\\hbar c] = \\mathrm{J\\,m}$。') };
            } });
          bonusWrap.append(el('hr', { class: 'bohr-sep' }), bonus.el);
          body.append(bonusWrap);
          const fmt = (k) => (k === 0 ? '' : k === 1 ? '' : sup(k));
          function update() {
            const kg = ex.a + ex.b + ex.c, m = 2 * ex.a + 3 * ex.c, s = -ex.a - 2 * ex.c;
            const parts = [['kg', kg], ['m', m], ['s', s]].map(([u, k]) => (k === 0 ? `<span class="bohr-no">${u}⁰</span>` : `<b>${u}${fmt(k) || ''}</b>`));
            dim.innerHTML = `[ħ<sup>${ex.a}</sup> m<sub>e</sub><sup>${ex.b}</sup> (ke²)<sup>${ex.c}</sup>] = ${parts.join(' ')}`;
            const val = Math.pow(HBAR, ex.a) * Math.pow(ME, ex.b) * Math.pow(KE2, ex.c);
            rV.set(sci(val, 3));
            const isLen = kg === 0 && m === 1 && s === 0;
            rA.set(isLen ? (val * 1e10).toFixed(4) + ' Å' : '—');
            if (isLen && !api.solved()) {
              bonusWrap.hidden = false; api.typeset(bonusWrap);
              api.done(`<b>玻尔半径</b> $a_0 = \\hbar^2/(m_e ke^2) = ${(val * 1e10).toFixed(3)}$ Å——原子的大小由 $\\hbar$ 定下。玻尔的量子化条件 $L = n\\hbar$ 恰好给出 $r_n = n^2 a_0$ 和 $E_n = -ke^2/(2a_0 n^2) = -13.6\\,\\text{eV}/n^2$，把里德伯常数从基本常数算了出来。`);
            } else if (isLen) { bonusWrap.hidden = false; }
          }
          update();
          return { destroy() {} };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3, stage4]);
    },
  };
})();
