/* 免疫检查点 — 挑战版（Nobel Medicine 2018: Allison & Honjo）
 * 三关：
 *  (1) 1996 年的小鼠实验：读者选肿瘤株与处理，量生长曲线与无瘤比例，再做再攻击实验，
 *      从"抗体不碰肿瘤细胞却让肿瘤消失"推出 CTLA-4 是刹车而不是油门；
 *  (2) 肿瘤–免疫 ODE：读者在相图上找逃逸阈值，发现降低 φ 能翻转反馈符号（φ_c = μσ/s₀），
 *      而提高 σ 把门槛同比例推高；再看"冷肿瘤"为什么松刹车也没用；
 *  (3) 从 CheckMate 067 的数据表算 NNT / NNH，并从混合治愈模型理解中位生存期为何失效。
 *
 * 模型（示意，用于让规律可读；真实数据见 content/checkpoint.js 的 papers）：
 *  (1) dx/dt = r·x·(1−x/K) − BETA·y·x/(400+x)，y 由各剂抗体按滞后 LAG 累积，乘以瘤株免疫原性与个体反应性。
 *      真值排序（无瘤比例）：抗 CTLA-4 ≫ 延迟给药 > 抗 CD28 ≈ 无关抗体 = 0；B16（低免疫原性）全部无效。
 *  (2) dx/dt = r·x(1−x/K) − β·x·y/(g+x)；dy/dt = s₀ + σ·x/(h+x) − μ·y − φ·x·y/(q+x)
 *      r=0.30, K=1e9, β=6, g=h=q=1e7, s₀=2e5, σ=1.5e6, μ=0.20 ⇒ φ_c = μσ/s₀ = 1.5
 *      φ=4（未治疗）阈值 1.7e6；φ=0.5 阈值 3.1e7；冷瘤 σ=6e4 时 φ→0 阈值仍只有 1.2e7。
 *  (3) CheckMate 067 五年数据（Larkin 等, NEJM 381, 1535, 2019）：n = 314/316/315，
 *      5 年 OS 52%/44%/26%，ORR 58%/45%/19%，3–4 级治疗相关不良事件 59%/21%/28%。
 * 动物实验按史实叙述，不作渲染。
 */
(() => {
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gaussOf = (rnd) => () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const lis = () => fn();
    if (mq) mq.addEventListener ? mq.addEventListener('change', lis) : mq.addListener(lis);
    return () => { mo.disconnect(); if (mq) (mq.removeEventListener ? mq.removeEventListener('change', lis) : mq.removeListener(lis)); };
  }
  function injectStyle() {
    if (document.getElementById('st-checkpoint')) return;
    const s = document.createElement('style'); s.id = 'st-checkpoint';
    s.textContent = `
.ck-tab{max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.ck-tab table{width:100%}
.ck-tab th{position:sticky;top:0;background:var(--panel);z-index:1}
.ck-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.ck-leg i{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.ck-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.ck-sec[hidden]{display:none}
.ck-sec h4{margin:0;font-size:14px}
.ck-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.ck-big{font-family:var(--mono-font,monospace);font-size:15px;color:var(--fg)}
.ck-big b{font-size:19px}
.dtable td.ck-l,.dtable th.ck-l{text-align:left}
.ck-hi{color:var(--accent);font-weight:600}`;
    document.head.append(s);
  }
  const line = (g, A, xs, ys, color, w = 2, dash = null) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
  };
  const legend = (items) => H.el('div', { class: 'ck-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  /* ============ 第一关：小鼠实验 ============ */
  const LINES = {
    colon:   { zh: '结肠癌 51BLim10（B7 阴性）', r: 0.42, imm: 1.00 },
    sarcoma: { zh: '纤维肉瘤 SA1/N', r: 0.36, imm: 0.80 },
    b16:     { zh: '黑色素瘤 B16（低免疫原性）', r: 0.52, imm: 0.22 },
  };
  const TRTS = {
    none:  { zh: '无关仓鼠抗体（对照）', eff: 0.00, days: [0, 3, 6] },
    cd28:  { zh: '抗 CD28 抗体', eff: 0.12, days: [0, 3, 6] },
    ctla4: { zh: '抗 CTLA-4 抗体', eff: 1.00, days: [0, 3, 6] },
    late:  { zh: '抗 CTLA-4（第 7 天才开始）', eff: 1.00, days: [7, 10, 13, 16] },
  };
  const SHORT_TRT = { none: '无关抗体', cd28: '抗 CD28', ctla4: '抗 CTLA-4', late: '抗 CTLA-4（延迟）' };
  const KMAX = 3000, BETA1 = 120, LAG = 3.0;
  function grow(lineK, trtK, seed, days = 40, rechallenge = false) {
    const L = LINES[lineK], T = TRTS[trtK], rnd = mul32(seed), g = gaussOf(rnd);
    const dt = 0.05;
    const resp = Math.exp(0.42 * g());                 // 个体免疫反应性（对数正态）
    let x = 18 * (1 + 0.22 * g());
    // 再攻击：已排斥过肿瘤的小鼠带着记忆性 T 细胞，起始免疫水平高
    const memory = rechallenge ? 2.2 : 0;
    const out = { t: [], x: [] };
    for (let i = 0; i <= days / dt; i++) {
      const t = i * dt;
      let drive = memory;
      for (const d of T.days) if (t > d + LAG) drive += 1 - Math.exp(-(t - d - LAG) / 2.5);
      const y = (rechallenge ? 1 : T.eff) * L.imm * resp * drive;
      x = Math.max(0, x + dt * (L.r * x * (1 - x / KMAX) - BETA1 * y * x / (400 + x)));
      if (x < 4) x = 0;
      if (i % Math.round(1 / dt) === 0) { out.t.push(t); out.x.push(x); }
    }
    out.free = out.x[out.x.length - 1] === 0;
    return out;
  }

  /* ============ 第二关：ODE ============ */
  const Q = { r: 0.30, K: 1e9, beta: 6, g: 1e7, s0: 2e5, sigma: 1.5e6, mu: 0.20, h: 1e7, phi: 4.0, q: 1e7 };
  const phiC = (sigma, mu = Q.mu, s0 = Q.s0) => (mu * sigma) / s0;
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
  function escapeThreshold(o) {
    let lo = 1e3, hi = 8e8;
    if (runODE(o, hi).cleared) return Infinity;
    if (!runODE(o, lo).cleared) return 0;
    for (let i = 0; i < 34; i++) { const m = Math.sqrt(lo * hi); if (runODE(o, m).cleared) lo = m; else hi = m; }
    return Math.sqrt(lo * hi);
  }

  /* ============ 第三关：CheckMate 067 ============ */
  const CM = [
    { k: 'combo', zh: '纳武利尤单抗 + 伊匹木单抗', n: 314, os5: 0.52, orr: 0.58, ae: 0.59 },
    { k: 'nivo',  zh: '纳武利尤单抗单药', n: 316, os5: 0.44, orr: 0.45, ae: 0.21 },
    { k: 'ipi',   zh: '伊匹木单抗单药', n: 315, os5: 0.26, orr: 0.19, ae: 0.28 },
  ];

  CHALLENGES.checkpoint = {
    title: '刹车还是油门',
    _m: { grow, runODE, escapeThreshold, phiC, ystar, CM },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color;

      /* ===================== 第一关 ===================== */
      const stage1 = {
        title: '抗体不碰肿瘤，肿瘤却消失了',
        task: `<p>伯克利，1995–96 年。T 细胞的激活需要两个信号：信号一是 T 细胞受体识别抗原，信号二由 T 细胞上的 CD28 与抗原呈递细胞上的 B7 结合提供。T 细胞上还有一个与 CD28 高度同源、同样结合 B7 的分子 <b>CTLA-4</b>，亲和力高 10–20 倍，但只在 T 细胞<b>激活之后</b>才上到表面。它是第二个油门，还是刹车？当时两种看法都有人持。</p>
          <p>一个世纪以来，肿瘤免疫治疗的思路始终是"加大油门"：细菌毒素、白细胞介素-2、干扰素、各种肿瘤疫苗——偶有惊人的持久缓解，总体有效率很低。</p>
          <p>你的实验台：三种可移植的小鼠肿瘤细胞系、同系小鼠、几种单克隆抗体（无关仓鼠抗体、抗 CD28、抗 CTLA-4），以及游标卡尺。抗体按第 0、3、6 天各 100 µg 腹腔注射。<b>注意：这些抗体都不结合肿瘤细胞</b>，它们的靶点在 T 细胞上。每组 10 只小鼠，肿瘤体积每天量一次。</p>
          <p><b>任务</b>：把每种肿瘤 × 每种处理都做一遍（共 12 组），记下第 40 天的无瘤比例。然后回答 CTLA-4 到底是什么。</p>`,
        hints: [
          '先在结肠癌上比较"无关抗体"和"抗 CTLA-4"。如果 CTLA-4 是油门，阻断它应当让抗肿瘤反应<b>变弱</b>、肿瘤长得更快。实际是哪个方向？',
          '再做"抗 CD28"那一组作为对照：抗 CD28 也作用在同一对配体上，但它几乎没用。所以有效的不是"动了 B7 这条通路"，而是专门挡住了 CTLA-4 这一个分子。最后别忘了 B16：同样的抗体，为什么对它无效？',
          'CTLA-4 是<b>刹车</b>：阻断它，原本被按住的抗肿瘤 T 细胞被放开，肿瘤被排斥。B16 的免疫原性太低——松开刹车的前提是车上有人；延迟到第 7 天给药仍有部分有效，说明它对已经长起来的肿瘤也管用。',
        ],
        answer: `<b>CTLA-4 是刹车，不是油门。</b>抗 CTLA-4 抗体不接触肿瘤细胞，它结合的是 T 细胞上的 CTLA-4；如果 CTLA-4 提供共刺激（油门），阻断它应使抗肿瘤反应减弱，实际结果却是肿瘤被排斥。
          <p>Leach、Krummel、Allison，<i>Science</i> 271, 1734 (1996)：对 B7 阴性的结肠癌 51BLim10，抗 CTLA-4 治疗组全部排斥肿瘤；对已经长起来的肿瘤延迟到第 7 天开始治疗仍有部分无瘤；纤维肉瘤 SA1/N 组 10 只中 7 只在第 25 天无瘤。对照用的无关仓鼠抗体与抗 CD28 都无效。</p>
          <p><b>分子形式。</b>CTLA-4 与 CD28 竞争同一配体 B7，亲和力高 10–20 倍，且在激活后上调。设 B7 浓度 $[B]$，则 CD28 的占据率</p>
          $$\\theta_{28}=\\frac{[B]/K_{28}}{1+[B]/K_{28}+([B]/K_4)(R_4/R_{28})},$$
          <p>$K_4\\approx K_{28}/15$ 使分母第三项迅速增大，$\\theta_{28}$ 被压低。阻断 CTLA-4（$R_4\\to0$）使它回升。注意这是<b>解除抑制</b>而非增加刺激：$[B]=0$ 时无论怎样阻断 CTLA-4，$\\theta_{28}$ 仍为 0。</p>
          <p><b>B16 为什么无效。</b>它的免疫原性低（新抗原少、T 细胞浸润少）——松开刹车的前提是车已经上路。这个 1996 年的观察预告了二十年后的临床规律："冷"肿瘤不响应检查点抑制剂。</p>
          <p><b>免疫记忆。</b>排斥了肿瘤的小鼠在 70 天后再次接种野生型肿瘤细胞仍不长瘤，而初次接种的对照小鼠全部长瘤。这是适应性免疫的签名，也预告了临床生存曲线上的"平台"。</p>`,
        build(body, api) {
          const S = { line: 'colon', trt: 'none', runs: {}, quizOK: false, reOK: false, seed: 1996 };
          const key = (l, t) => l + '|' + t;

          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.52, minH: 200, maxH: 280 });
          plots.append(legend([['每只小鼠的肿瘤体积', col('--s1')], ['中位数', col('--accent')], ['其它已做过的组', col('--muted'), 1]]));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });

          const cL = h.choice({ label: '肿瘤细胞系', value: 'colon',
            options: Object.entries(LINES).map(([k, v]) => ({ value: k, label: v.zh })),
            onChange: (v) => { S.line = v; draw(); info(); } });
          const cT = h.choice({ label: '处理', value: 'none',
            options: Object.entries(TRTS).map(([k, v]) => ({ value: k, label: v.zh })),
            onChange: (v) => { S.trt = v; draw(); info(); } });
          const bGo = h.button({ label: '做这一组（10 只）', kind: 'primary', onClick: runGroup });
          const bAll = h.button({ label: '把 12 组都做一遍', onClick: () => { Object.keys(LINES).forEach((l) => Object.keys(TRTS).forEach((t) => { S.line = l; S.trt = t; runGroup(); })); S.line = 'colon'; S.trt = 'ctla4'; cL.set('colon'); cT.set('ctla4'); draw(); info(); } });
          controls.append(cL.el, cT.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bGo, bAll])]));

          const R = {
            f: h.readout('这一组第 40 天无瘤'),
            m: h.readout('第 25 天中位体积'),
            n: h.readout('已完成的组'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));

          const tbody = h.el('tbody');
          const tab = h.el('div', { class: 'ck-tab dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, [['肿瘤', 'ck-l'], ['处理', 'ck-l'], ['d25 中位体积 (mm³)', ''], ['d40 无瘤', '']]
              .map(([t, c]) => h.el('th', { class: c, text: t })))]), tbody])]);

          function runGroup() {
            const k = key(S.line, S.trt);
            if (!S.runs[k]) S.runs[k] = Array.from({ length: 10 }, (_, i) => grow(S.line, S.trt, S.seed + 977 * i + k.length * 31));
            fill(); draw(); info();
            if (Object.keys(S.runs).length >= 12 && quizBox.hidden) { quizBox.hidden = false; api.typeset(quizBox); }
          }
          const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
          function info() {
            const g = S.runs[key(S.line, S.trt)];
            if (!g) { R.f.set('—'); R.m.set('—'); } else {
              R.f.set(`${g.filter((o) => o.free).length} / 10`);
              R.m.set(med(g.map((o) => o.x[25])).toFixed(0) + ' mm³');
            }
            R.n.set(`${Object.keys(S.runs).length} / 12`);
          }
          function fill() {
            tbody.textContent = '';
            Object.keys(LINES).forEach((l) => Object.keys(TRTS).forEach((t) => {
              const g = S.runs[key(l, t)]; if (!g) return;
              const free = g.filter((o) => o.free).length;
              tbody.append(h.el('tr', {}, [
                h.el('td', { class: 'ck-l', text: LINES[l].zh.replace(/（.*/, '') }),
                h.el('td', { class: 'ck-l', text: SHORT_TRT[t] }),
                h.el('td', { text: med(g.map((o) => o.x[25])).toFixed(0) }),
                h.el('td', { class: free >= 5 ? 'ck-hi' : '', text: free + ' / 10' }),
              ]));
            }));
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 40, y0: 0, y1: 3100, pad: { l: 56, r: 14, t: 14, b: 34 },
              xTicks: [0, 10, 20, 30, 40], yTicks: [0, 1000, 2000, 3000],
              xLabel: '接种后天数', yLabel: '肿瘤体积 (mm³)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 其它已做组的中位线（淡）
            Object.entries(S.runs).forEach(([k, grp]) => {
              if (k === key(S.line, S.trt)) return;
              const mv = grp[0].t.map((_, i) => med(grp.map((o) => o.x[i])));
              line(g, A, grp[0].t, mv, col('--muted'), 1, [3, 3]);
            });
            const cur = S.runs[key(S.line, S.trt)];
            if (cur) {
              g.globalAlpha = 0.5;
              cur.forEach((o) => line(g, A, o.t, o.x, col('--s1'), 1.2));
              g.globalAlpha = 1;
              const mv = cur[0].t.map((_, i) => med(cur.map((o) => o.x[i])));
              line(g, A, cur[0].t, mv, col('--accent'), 2.4);
            } else {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center';
              g.fillText('按「做这一组」', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
            }
            // 给药日
            TRTS[S.trt].days.forEach((d) => {
              g.strokeStyle = col('--s3'); g.lineWidth = 1.2; g.setLineDash([2, 3]);
              g.beginPath(); g.moveTo(A.X(d), A.p.t + A.ih); g.lineTo(A.X(d), A.p.t + A.ih - 14); g.stroke(); g.setLineDash([]);
            });
            g.restore();
            g.fillStyle = col('--s3'); g.font = '10px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'bottom';
            g.fillText('↑ 给药日', A.X(TRTS[S.trt].days[0]) + 2, A.p.t + A.ih - 16);
          }

          const sec = h.el('div', { class: 'ck-sec' });
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '抗 CTLA-4 抗体<b>不结合肿瘤细胞</b>，却让肿瘤被排斥。关于 CTLA-4 的功能，这说明：',
            options: [
              { label: 'CTLA-4 是第二个共刺激分子（油门），抗体把它激活了', ok: false, why: '单克隆抗体在这里起的是<b>阻断</b>作用（对照组的抗 CD28 也不起效）。而且如果 CTLA-4 是油门，挡住它应当让抗肿瘤反应更弱才对。' },
              { label: 'CTLA-4 是 T 细胞上的<b>刹车</b>；挡住它就把原本被按住的抗肿瘤 T 细胞放开了', ok: true,
                why: '对。它与 CD28 竞争同一配体 B7，亲和力高 10–20 倍，并在 T 细胞激活后上调——是一个负反馈。这把整个领域的方向倒了过来：问题不是免疫系统不够努力，而是它被按住了。' },
              { label: '抗体通过 Fc 段招募了巨噬细胞直接吞噬肿瘤', ok: false, why: '那么同为仓鼠抗体的对照组与抗 CD28 组也该有效，但它们都无效；而且对 B16 同样无效，说明效应依赖肿瘤的免疫原性。' },
              { label: '抗体中和了肿瘤分泌的免疫抑制因子', ok: false, why: '抗体的靶点是 T 细胞表面的 CTLA-4，不是可溶性因子。B7 阴性的肿瘤株同样被排斥，说明作用点在 T 细胞一侧。' },
            ],
            onOk() { S.quizOK = true; reBox.hidden = false; api.typeset(reBox); finish(); },
          }).el);

          const reBox = h.el('div', { hidden: true, class: 'ck-sec' });
          const reOut = h.el('p', { class: 'ck-note', 'aria-live': 'polite' });
          reBox.append(h.el('h4', { text: '再攻击实验' }),
            h.el('p', { class: 'ck-note', html: '把那些排斥了肿瘤的小鼠留下来，<b>70 天后</b>再用野生型肿瘤细胞攻击一次，同时取一批从未接触过肿瘤的小鼠作对照。两组都<b>不给任何抗体</b>。' }),
            h.el('div', {}, [h.button({ label: '做再攻击实验', onClick: () => {
              const cured = Array.from({ length: 5 }, (_, i) => grow('colon', 'none', 7700 + i, 40, true));
              const naive = Array.from({ length: 5 }, (_, i) => grow('colon', 'none', 8800 + i, 40, false));
              const cf = cured.filter((o) => o.free).length, nf = naive.filter((o) => o.free).length;
              reOut.innerHTML = `曾排斥肿瘤的小鼠：<b>${cf}/5</b> 无瘤；初次接种的对照：<b>${nf}/5</b> 无瘤（第 40 天中位体积 ${med(naive.map((o) => o.x[39])).toFixed(0)} mm³）。
                <b>没有再给任何抗体</b>，保护却还在——这是适应性免疫记忆。`;
              S.reOK = cf >= 4; finish();
            } })]), reOut);

          function finish() {
            if (S.quizOK && S.reOK) api.done(`<b>刹车，不是油门（Leach、Krummel、Allison，1996）。</b>一个世纪里，肿瘤免疫治疗都在想办法踩油门；这个实验说明真正的障碍是 T 细胞上的负调控分子，而肿瘤一直靠它活着。
              抗体不接触肿瘤细胞，作用点全在 T 细胞一侧；对照的抗 CD28 无效，说明有效的不是"碰了 B7 这条通路"而是专门挡住 CTLA-4；延迟到第 7 天给药对已成瘤仍部分有效；排斥过肿瘤的小鼠 70 天后仍免疫——<b>免疫记忆</b>，这预告了临床生存曲线上的平台。
              而 B16 的全线无效预告了另一件事：松刹车的前提是车上有人。下一关把这件事做成方程。`);
            else if (S.quizOK) api.say('再做一次再攻击实验，看看保护还在不在。', 'info');
          }
          sec.append(h.el('h4', { text: '下结论（把 12 组都做完后出现）' }), quizBox, reBox);
          body.append(plots, controls, readout, tab, sec);
          api.typeset(body);
          fill(); draw(); info();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ===================== 第二关 ===================== */
      const stage2 = {
        title: '油门与刹车不是一回事',
        task: `<p>把上一关的结果做成方程。记肿瘤细胞数 $x$、效应 T 细胞数 $y$（示意模型，参数不来自实测）：</p>
          <p>$$\\frac{dx}{dt}=rx\\Big(1-\\frac{x}{K}\\Big)-\\frac{\\beta xy}{g+x},\\qquad
          \\frac{dy}{dt}=\\underbrace{s_0}_{\\text{基线}}+\\underbrace{\\frac{\\sigma x}{h+x}}_{\\text{被抗原招募}}-\\underbrace{\\mu y}_{\\text{消亡}}-\\underbrace{\\frac{\\phi xy}{q+x}}_{\\text{被肿瘤抑制}} .$$</p>
          <p>两种干预作用在不同的参数上：<b>检查点抑制剂减小 $\\phi$</b>（松刹车），<b>疫苗与细胞因子增大 $\\sigma$</b>（踩油门）。直觉上两者都该让免疫更强。下面看它们是不是一回事。</p>
          <p>系统是<b>双稳</b>的：小肿瘤被免疫监视清除，大肿瘤逃逸，中间有一个<b>逃逸阈值</b> $x^\\ast$。治疗的目标就是把 $x^\\ast$ 推到当前瘤负荷之上。</p>
          <p><b>任务</b>：现在有一个已经长到 $x_0=3\\times10^{7}$ 的肿瘤。(a) 只调 $\\phi$，找出能清除它的最大 $\\phi$；(b) 把 $\\phi$ 放回 4.0，改为只调 $\\sigma$，找出能清除它的最小 $\\sigma$；(c) 回答这两种做法的区别。</p>`,
        hints: [
          '先把 $x_0$ 留在 $3\\times10^{7}$，拖 $\\phi$ 从 4.0 往下，看右边的"逃逸阈值"什么时候超过 $3\\times10^{7}$。',
          '注意下方读出的 $y^\\ast(x)$ 那一栏：它告诉你免疫强度随肿瘤增大是升还是降。$\\phi$ 大的时候，肿瘤越大免疫越弱（正反馈逃逸）；$\\phi$ 小的时候反过来。临界值有闭式：$y^\\ast(\\infty)\\lt y^\\ast(0)$ 等价于 $\\phi\\gt\\mu\\sigma/s_0$。',
          '$\\phi\\approx0.5$ 就能清除（阈值升到 $3.1\\times10^{7}$）。而保持 $\\phi=4$ 时要把 $\\sigma$ 提到约 $8.3\\times10^{6}$（5.5 倍）才行——而且提高 $\\sigma$ 会把临界值 $\\phi_c=\\mu\\sigma/s_0$ 同比例推高，<b>永远留在正反馈那一侧</b>。',
        ],
        answer: `(a) 把 $\\phi$ 降到约 <b>0.5</b> 即可清除（逃逸阈值从 $1.7\\times10^{6}$ 升到 $3.1\\times10^{7}$）。(b) 保持 $\\phi=4$ 时需要把 $\\sigma$ 提到约 <b>$8.3\\times10^{6}$</b>，即 5.5 倍。
          <p>(c) <b>本质区别在反馈的符号。</b>$y$ 的准稳态</p>
          $$y^\\ast(x)=\\frac{s_0+\\sigma x/(h+x)}{\\mu+\\phi x/(q+x)},\\qquad y^\\ast(0)=\\frac{s_0}{\\mu},\\quad y^\\ast(\\infty)=\\frac{s_0+\\sigma}{\\mu+\\phi}.$$
          <p>$y^\\ast$ 随 $x$ 单调<b>下降</b>（肿瘤越大、免疫越弱，正反馈逃逸）当且仅当 $\\mu(s_0+\\sigma)\\lt s_0(\\mu+\\phi)$，即</p>
          $$\\phi\\gt\\phi_c:=\\frac{\\mu\\sigma}{s_0}.$$
          <p>降低 $\\phi$ 可以把系统从 $\\phi\\gt\\phi_c$ 推到 $\\phi\\lt\\phi_c$，<b>反馈由正变负</b>，系统转为自我纠正。而提高 $\\sigma$ 把 $\\phi_c$ 按同一比例推高，永远留在正反馈一侧——它只能定量地抬高 $x^\\ast$，改变不了定性行为。</p>
          <p><b>冷肿瘤。</b>把 $\\sigma$ 降到 $6\\times10^{4}$（新抗原极少）后，即使 $\\phi\\to0$（刹车完全松开），逃逸阈值也只有约 $1.2\\times10^{7}$，清除不了 $3\\times10^{7}$ 的肿瘤。<b>松开刹车的前提是车上有人</b>——这与上一关 B16 的结果、以及临床上"冷"肿瘤不响应检查点抑制剂是同一件事。</p>`,
        build(body, api) {
          const S = { phi: 4.0, sigma: Q.sigma, x0: 3e7, aOK: false, bOK: false, qOK: false };

          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.5, minH: 190, maxH: 270 });
          plots.append(legend([['肿瘤 x(t)', col('--s2')], ['效应 T 细胞 y(t)', col('--s1')], ['逃逸阈值 x*', col('--warn'), 1]]));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });
          const meter = h.el('div', { class: 'ck-big', 'aria-live': 'polite' });

          const sPhi = h.slider({ label: 'φ（肿瘤对免疫的抑制 = 刹车）', min: -1.4, max: 0.9, step: 0.01, value: Math.log10(4),
            format: (v) => (10 ** v).toFixed(2), onInput: (v) => { S.phi = 10 ** v; upd(); } });
          const sSig = h.slider({ label: 'σ（抗原招募 = 油门）', min: 4.5, max: 8.5, step: 0.02, value: Math.log10(Q.sigma),
            format: (v) => sci(10 ** v, 1), onInput: (v) => { S.sigma = 10 ** v; upd(); } });
          const sX0 = h.slider({ label: '起始瘤负荷 x₀', min: 5, max: 8.5, step: 0.05, value: Math.log10(3e7),
            format: (v) => sci(10 ** v, 1), onInput: (v) => { S.x0 = 10 ** v; upd(); } });
          const bReset = h.button({ label: '回到未治疗（φ=4.0, σ=1.5×10⁶）', onClick: () => { S.phi = 4; S.sigma = Q.sigma; sPhi.set(Math.log10(4)); sSig.set(Math.log10(Q.sigma)); upd(); } });
          const bCold = h.button({ label: '换成"冷"肿瘤（σ=6×10⁴）', onClick: () => { S.sigma = 6e4; sSig.set(Math.log10(6e4)); upd(); } });
          controls.append(sPhi.el, sSig.el, sX0.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bReset, bCold])]));

          const R = {
            t: h.readout('逃逸阈值 x*'),
            o: h.readout('x₀ 的结局'),
            f: h.readout('y*(x) 随 x'),
            c: h.readout('临界 φ_c = μσ/s₀'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));

          let tr = null, thr = 0;
          function upd() {
            const o = { phi: S.phi, sigma: S.sigma };
            tr = runODE(o, S.x0); thr = escapeThreshold(o);
            const p = Object.assign({}, Q, o);
            const y0 = ystar(1e5, p), yi = ystar(1e9, p), falls = yi < y0;
            R.t.set(thr === Infinity ? '∞（任何大小都被清除）' : thr === 0 ? '0（任何大小都逃逸）' : sci(thr));
            R.o.set(tr.cleared ? '清除' : '逃逸到 ' + sci(tr.xend));
            R.f.set(falls ? `下降（${sci(y0, 1)} → ${sci(yi, 1)}）：正反馈，逃逸` : `上升（${sci(y0, 1)} → ${sci(yi, 1)}）：负反馈，自我纠正`);
            const pc = phiC(S.sigma);
            R.c.set(pc.toFixed(2) + `　当前 φ = ${S.phi.toFixed(2)}　→ φ ${S.phi > pc ? '>' : '<'} φ_c`);
            meter.innerHTML = tr.cleared
              ? `起始 ${sci(S.x0)} 的肿瘤被 <b style="color:var(--good)">清除</b>　（逃逸阈值 ${thr === Infinity ? '∞' : sci(thr)} > x₀）`
              : `起始 ${sci(S.x0)} 的肿瘤 <b style="color:var(--warn)">逃逸</b>　（逃逸阈值 ${thr === 0 ? '0' : sci(thr)} < x₀）`;
            draw();
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 500, y0: 1e4, y1: 2e9, logY: true, pad: { l: 58, r: 14, t: 14, b: 34 },
              xTicks: [0, 100, 200, 300, 400, 500], yTicks: [1e4, 1e5, 1e6, 1e7, 1e8, 1e9],
              fmtY: (v) => '10' + sup(Math.round(Math.log10(v))), xLabel: '时间（天）', yLabel: '细胞数（对数）' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            if (thr > 0 && thr !== Infinity) {
              g.strokeStyle = col('--warn'); g.lineWidth = 1.4; g.setLineDash([5, 4]);
              g.beginPath(); g.moveTo(A.p.l, A.Y(thr)); g.lineTo(A.p.l + A.iw, A.Y(thr)); g.stroke(); g.setLineDash([]);
            }
            if (tr) {
              line(g, A, tr.t, tr.x.map((v) => Math.max(1e4, v)), col('--s2'), 2.2);
              line(g, A, tr.t, tr.y.map((v) => Math.max(1e4, v)), col('--s1'), 1.8);
              if (tr.cleared) {
                const te = tr.t[tr.t.length - 1];
                g.fillStyle = col('--good'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
                g.fillText('清除于第 ' + te.toFixed(0) + ' 天', Math.min(A.X(te) + 6, A.p.l + A.iw - 90), A.Y(2e4));
              }
            }
            g.restore();
            if (thr > 0 && thr !== Infinity) {
              g.fillStyle = col('--warn'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'bottom';
              g.fillText('逃逸阈值 x*', A.p.l + A.iw - 4, A.Y(thr) - 3);
            }
          }

          const sec = h.el('div', { class: 'ck-sec' });
          const ansA = H.answer({
            label: '(a) 只调 $\\phi$：能清除 $x_0=3\\times10^{7}$ 的最大 $\\phi$（容差 ±30%）', placeholder: '例如 0.5',
            check(v) {
              if (Math.abs(S.x0 - 3e7) / 3e7 > 0.2) return { ok: false, msg: '先把起始瘤负荷 $x_0$ 调回 $3\\times10^{7}$。' };
              const cleared = (phi) => runODE({ phi, sigma: Q.sigma }, 3e7).cleared;
              if (!cleared(v)) return { ok: false, msg: `$\\phi=${v}$ 时这个肿瘤仍然逃逸。再往下调。` };
              if (cleared(v * 1.6)) return { ok: false, msg: `$\\phi=${(1.6 * v).toFixed(2)}$ 也能清除——问的是<b>最大</b>的那个 $\\phi$，再往上找。` };
              return { ok: true, msg: `对。约 $\\phi\\approx0.5$：逃逸阈值从 $1.7\\times10^{6}$ 升到 $3.1\\times10^{7}$，刚好超过瘤负荷。` };
            },
            onOk() { S.aOK = true; partB.hidden = false; api.typeset(partB); finish(); },
          });
          const partB = h.el('div', { hidden: true });
          const ansB = H.answer({
            label: '(b) 把 $\\phi$ 放回 4.0，只调 $\\sigma$：能清除同一个肿瘤的最小 $\\sigma$（容差 ±20%）', placeholder: '例如 9e6',
            check(v) {
              const cleared = (sigma) => runODE({ phi: 4.0, sigma }, 3e7).cleared;
              if (!cleared(v)) return { ok: false, msg: `$\\sigma=${sci(v)}$ 时仍然逃逸。再往上调。` };
              if (cleared(v / 1.25)) return { ok: false, msg: `$\\sigma=${sci(v / 1.25)}$ 也能清除——问的是<b>最小</b>的那个，再往下找。` };
              return { ok: true, msg: `对。约 $8.3\\times10^{6}$，是基线 $1.5\\times10^{6}$ 的 5.5 倍。注意把 $\\sigma$ 提高的同时，临界值 $\\phi_c=\\mu\\sigma/s_0$ 也按同一比例升高了——你永远留在正反馈那一侧。` };
            },
            onOk() { S.bOK = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
          });
          partB.append(ansB.el);
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '两种做法都能清除这个肿瘤。它们的<b>本质</b>区别是什么？（把 σ 调到 6×10⁴ 的"冷"肿瘤再试一次有助于判断）',
            options: [
              { label: '没有本质区别，只是所需的参数变化幅度不同', ok: false, why: '看"$y^\\ast(x)$ 随 $x$"那一栏：降低 $\\phi$ 能把它从"下降"翻成"上升"，提高 $\\sigma$ 不能——因为 $\\phi_c=\\mu\\sigma/s_0$ 随 $\\sigma$ 同比例升高。' },
              { label: '降低 φ 能把免疫反馈的符号由正翻负（$\\phi_c=\\mu\\sigma/s_0$），提高 σ 把门槛同比例推高、永远留在正反馈一侧', ok: true,
                why: '对。$y^\\ast$ 随 $x$ 下降 $\\iff\\phi\\gt\\mu\\sigma/s_0$。松刹车改变系统的定性行为（肿瘤越大招募越多，转为自我纠正）；踩油门只是定量地抬高逃逸阈值。而且在"冷"肿瘤（$\\sigma$ 极小）上，$\\phi\\to0$ 也救不回来——松刹车的前提是车上有人。' },
              { label: '提高 σ 更好，因为它直接增加杀伤细胞数量', ok: false, why: '在这个已成瘤上它需要 5.5 倍的提升；临床上几十年的免疫刺激剂尝试（IL-2、疫苗）总体有效率很低，正对应这一点。' },
              { label: '降低 φ 更好，因为它对任何肿瘤都有效', ok: false, why: '把 $\\sigma$ 调到 $6\\times10^{4}$（冷肿瘤）再把 $\\phi$ 降到 0：逃逸阈值仍只有约 $1.2\\times10^{7}$，清除不了 $3\\times10^{7}$ 的肿瘤。' },
            ],
            onOk() { S.qOK = true; finish(); },
          }).el);
          function finish() {
            if (S.aOK && S.bOK && S.qOK) api.done(`<b>刹车与油门在动力学上不是一回事。</b>$y^\\ast(x)$ 随 $x$ 下降（正反馈逃逸）的条件是 $\\phi\\gt\\phi_c=\\mu\\sigma/s_0$。
              降低 $\\phi$ 能把系统推过这条线，反馈由正变负；提高 $\\sigma$ 把线本身同比例推高，永远跨不过去。
              这解释了为什么一个世纪的"免疫刺激"疗效有限，而解除负调控在 1996 年的小鼠身上一次就奏效。
              同时它也给出了限制：$\\sigma$ 极小的"冷"肿瘤，$\\phi\\to0$ 也无济于事——与上一关 B16 的结果、以及临床上低突变负荷肿瘤不响应完全一致。下一关看真实病人的数据。`);
          }
          sec.append(h.el('h4', { text: '找出两条路各自的代价' }), ansA.el, partB, quizBox);
          body.append(plots, controls, meter, readout, sec);
          api.typeset(body);
          upd();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ===================== 第三关 ===================== */
      const stage3 = {
        title: '读真实病人的数据',
        task: `<p>CheckMate 067：晚期黑色素瘤的三期试验，三组随机（Larkin 等，<i>NEJM</i> 381, 1535, 2019，5 年随访）。在 2011 年之前，转移性黑色素瘤的 5 年生存率不到 10%。</p>
          <p>下表是三组的 5 年总生存率、客观缓解率与 3–4 级治疗相关不良事件率。<b>任务 A</b>：联合治疗比纳武利尤单抗单药多救活一个人，要以多少人多经历一次 3–4 级不良事件为代价？<b>任务 B</b>：下面的生存曲线里，把"长期无复发比例 $\\pi$"拖过 0.5 看看中位生存期会怎样，再回答为什么这类药不能只看中位数。</p>
          <p class="ck-note">免疫相关不良事件（结肠炎、肝炎、垂体炎、甲状腺炎、肺炎等）与疗效来自同一机制：负调控本来就是防止自身免疫的。这不是可以靠改进药物消除的脱靶效应。</p>`,
        hints: [
          'A：每多救活一个人需要治疗的人数 $\\mathrm{NNT}=1/\\Delta(\\text{生存率})$；每多一次严重不良事件需要治疗的人数 $\\mathrm{NNH}=1/\\Delta(\\text{不良事件率})$。问的是两者之比，它等于 $\\Delta_{\\rm AE}/\\Delta_{\\rm OS}$。',
          'A：联合 52% vs 纳武利尤单抗 44%，生存率差 8 个百分点；不良事件 59% vs 21%，差 38 个百分点。',
          'B：混合治愈模型 $S(t)=\\pi+(1-\\pi)S_u(t)$。中位生存期由 $S(t_{1/2})=1/2$ 定义——当 $\\pi\\gt1/2$ 时，$S(t)$ 永远不低于 $\\pi\\gt1/2$，这个方程<b>无解</b>。',
        ],
        answer: `<b>A.</b> $\\Delta_{\\rm OS}=0.52-0.44=0.08\\Rightarrow\\mathrm{NNT}=12.5$；$\\Delta_{\\rm AE}=0.59-0.21=0.38\\Rightarrow\\mathrm{NNH}=2.6$。比值
          $$\\frac{\\mathrm{NNT}}{\\mathrm{NNH}}=\\frac{\\Delta_{\\rm AE}}{\\Delta_{\\rm OS}}=\\frac{0.38}{0.08}\\approx4.8 ,$$
          <p>即每多救活 1 人，约有 <b>5 人</b>多经历一次 3–4 级不良事件。顺带注意：纳武利尤单抗单药相对伊匹木单抗单药是<b>严格占优</b>的——生存率高 18 个百分点，而严重不良事件更少（21% 对 28%）。所以"联合是否值得"要分人群讨论，不是一个普适结论。</p>
          <b>B.</b> 混合治愈模型 $S(t)=\\pi+(1-\\pi)S_u(t)$，$S_u(\\infty)=0$，故 $S(\\infty)=\\pi$：曲线趋于一个正的平台。中位生存期由 $S(t_{1/2})=1/2$ 定义，若 $\\pi\\gt1/2$ 则<b>方程无解</b>，中位生存期"未达到"，这个指标完全失去分辨力。即便 $\\pi\\lt1/2$，
          $$S_u(t_{1/2})=\\frac{1/2-\\pi}{1-\\pi},$$
          <p>中位数只反映未治愈那部分人的行为。这就是为什么要报 5 年生存率，以及为什么 CheckMate 067 联合组的中位生存期只能写"超过 60 个月（未达到）"。</p>
          <p>另外，检查点抑制剂的生存曲线在早期常与对照重合甚至交叉（起效需数周到数月），违反 Cox 模型的比例风险假设，此时单一风险比缺乏清晰解释。替代指标是<b>限制平均生存时间</b> $\\mathrm{RMST}(\\tau)=\\int_0^\\tau S(t)\\,dt$，即曲线下面积，单位是时间，两组之差直接读作"平均多活了多久"；在混合治愈模型下这个差值随 $\\tau$ 按 $\\approx(\\pi_1-\\pi_0)\\tau$ 线性增长。</p>`,
        build(body, api) {
          const S = { pi: 0.3, lam: 0.55, tau: 5, aOK: false, qOK: false };

          /* --- 数据表 --- */
          const tbl = h.el('div', { class: 'dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, [['治疗组', 'ck-l'], ['n', ''], ['5 年总生存率', ''], ['客观缓解率', ''], ['3–4 级治疗相关不良事件', '']]
              .map(([t, c]) => h.el('th', { class: c, text: t })))]),
            h.el('tbody', {}, CM.map((r) => h.el('tr', {}, [
              h.el('td', { class: 'ck-l', text: r.zh }),
              h.el('td', { text: String(r.n) }),
              h.el('td', { class: r.k === 'combo' ? 'ck-hi' : '', text: (100 * r.os5).toFixed(0) + '%' }),
              h.el('td', { text: (100 * r.orr).toFixed(0) + '%' }),
              h.el('td', { class: r.k === 'combo' ? 'ck-hi' : '', text: (100 * r.ae).toFixed(0) + '%' }),
            ]))),
          ])]);

          const secA = h.el('div', { class: 'ck-sec' });
          const ansA = H.answer({
            label: '每多一个 5 年生存者，约有几人多经历一次 3–4 级不良事件？（容差 ±15%）', placeholder: '例如 5',
            check(v) {
              const tru = (CM[0].ae - CM[1].ae) / (CM[0].os5 - CM[1].os5);
              if (Math.abs(v - 12.5) < 1.5) return { ok: false, msg: '12.5 是 NNT 本身（每治疗 12.5 人多救活 1 人）。问的是 NNT 与 NNH 的<b>比值</b>。' };
              if (Math.abs(v - 2.6) < 0.4) return { ok: false, msg: '2.6 是 NNH 本身。问的是两者之比。' };
              if (Math.abs(v - tru) / tru <= 0.15) return { ok: true, msg: `对：$\\Delta_{\\rm AE}/\\Delta_{\\rm OS}=0.38/0.08\\approx4.8$。顺带看一眼纳武利尤单抗单药 vs 伊匹木单抗单药：生存率高 18 个百分点而严重不良事件<b>更少</b>（21% 对 28%），是严格占优的。` };
              return { ok: false, msg: '不对。$\\mathrm{NNT}/\\mathrm{NNH}=\\Delta_{\\rm AE}/\\Delta_{\\rm OS}$，把两个差值相除。' };
            },
            onOk() { S.aOK = true; finish(); },
          });
          secA.append(h.el('h4', { text: 'A. 疗效与毒性的交换' }), tbl, ansA.el);

          /* --- 生存曲线 --- */
          const secB = h.el('div', { class: 'ck-sec' });
          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.5, minH: 190, maxH: 260 });
          plots.append(legend([['S(t) = π + (1−π)·e^(−λt)', col('--s1')], ['平台 π', col('--accent'), 1], ['中位数所在的 50% 线', col('--warn'), 1]]));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });
          const sPi = h.slider({ label: '长期无复发比例 π', min: 0, max: 0.8, step: 0.01, value: 0.3,
            format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { S.pi = v; updB(); } });
          const sLam = h.slider({ label: '未治愈者的风险 λ', min: 0.15, max: 1.6, step: 0.01, value: 0.55,
            format: (v) => v.toFixed(2) + ' /y', onInput: (v) => { S.lam = v; updB(); } });
          const sTau = h.slider({ label: 'RMST 的时间窗 τ', min: 1, max: 10, step: 0.5, value: 5,
            format: (v) => v.toFixed(1) + ' y', onInput: (v) => { S.tau = v; updB(); } });
          controls.append(sPi.el, sLam.el, sTau.el);
          const RB = {
            m: h.readout('中位生存期'),
            s: h.readout('5 年生存率'),
            r: h.readout('RMST(τ)'),
            d: h.readout('与 π = 0 的对照相比，RMST 之差'),
          };
          Object.values(RB).forEach((x) => readout.append(x.el));

          const Sv = (t, pi = S.pi, lam = S.lam) => pi + (1 - pi) * Math.exp(-lam * t);
          const rmst = (tau, pi, lam) => pi * tau + (1 - pi) * (1 - Math.exp(-lam * tau)) / lam;
          function updB() {
            const med = S.pi >= 0.5 ? null : -Math.log((0.5 - S.pi) / (1 - S.pi)) / S.lam;
            RB.m.set(med == null ? '未达到（方程无解）' : med.toFixed(2) + ' 年');
            RB.s.set((100 * Sv(5)).toFixed(1) + '%');
            RB.r.set(rmst(S.tau, S.pi, S.lam).toFixed(2) + ' 年');
            RB.d.set((rmst(S.tau, S.pi, S.lam) - rmst(S.tau, 0, S.lam)).toFixed(2) + ' 年');
            drawB();
          }
          function drawB() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 10, y0: 0, y1: 1.02, pad: { l: 52, r: 14, t: 14, b: 34 },
              xTicks: [0, 2, 4, 6, 8, 10], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => (100 * v).toFixed(0) + '%',
              xLabel: '时间（年）', yLabel: '生存率 S(t)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // RMST 面积
            g.fillStyle = col('--s1'); g.globalAlpha = 0.16;
            g.beginPath(); g.moveTo(A.X(0), A.Y(0));
            for (let i = 0; i <= 120; i++) { const t = S.tau * i / 120; g.lineTo(A.X(t), A.Y(Sv(t))); }
            g.lineTo(A.X(S.tau), A.Y(0)); g.closePath(); g.fill(); g.globalAlpha = 1;
            // 50% 线与平台
            [[0.5, '--warn'], [S.pi, '--accent']].forEach(([v, tok]) => {
              g.strokeStyle = col(tok); g.lineWidth = 1.3; g.setLineDash([5, 4]);
              g.beginPath(); g.moveTo(A.p.l, A.Y(v)); g.lineTo(A.p.l + A.iw, A.Y(v)); g.stroke(); g.setLineDash([]);
            });
            const xs = [], ys = [];
            for (let i = 0; i <= 240; i++) { const t = 10 * i / 240; xs.push(t); ys.push(Sv(t)); }
            line(g, A, xs, ys, col('--s1'), 2.4);
            // 中位数标记
            const med = S.pi >= 0.5 ? null : -Math.log((0.5 - S.pi) / (1 - S.pi)) / S.lam;
            if (med != null && med <= 10) {
              g.strokeStyle = col('--warn'); g.lineWidth = 1.6;
              g.beginPath(); g.moveTo(A.X(med), A.Y(0.5)); g.lineTo(A.X(med), A.p.t + A.ih); g.stroke();
            }
            g.restore();
            g.font = '10.5px ' + col('--mono-font'); g.textBaseline = 'bottom';
            g.fillStyle = col('--accent'); g.textAlign = 'right'; g.fillText('π = ' + (100 * S.pi).toFixed(0) + '%', A.p.l + A.iw - 4, A.Y(S.pi) - 3);
            g.fillStyle = col('--warn'); g.textAlign = 'left';
            g.fillText(med == null ? '50% 线：曲线永远不下穿 → 中位数无解' : '50%', A.p.l + 4, A.Y(0.5) - 3);
          }
          const quizBox = h.el('div', {});
          quizBox.append(H.quiz({
            question: '把 π 拖过 0.5。为什么这类药物不能只看中位生存期？',
            options: [
              { label: '因为随访时间不够长，再等几年中位数就出来了', ok: false, why: '不是随访长度的问题。$S(t)\\ge\\pi\\gt1/2$ 对<b>所有</b> $t$ 成立，等到无穷远也不会下穿 50%。' },
              { label: '因为生存曲线趋于正的平台 π；若 $\\pi\\gt1/2$，方程 $S(t)=1/2$ 无解，中位数失去定义，即便 $\\pi\\lt1/2$ 它也只反映未治愈那部分人', ok: true,
                why: '对。$S(t)=\\pi+(1-\\pi)S_u(t)$，$S(\\infty)=\\pi$。中位数把平台的信息压缩掉了，所以要报长期生存率，或用 RMST（曲线下面积），后者的组间差在混合治愈模型下随 $\\tau$ 按 $(\\pi_1-\\pi_0)\\tau$ 线性增长。' },
              { label: '因为中位数对异常值不稳健', ok: false, why: '中位数恰恰是稳健统计量。这里的问题不是稳健性，而是它定义在一个曲线可能永远到不了的水平上。' },
              { label: '因为生存曲线不是指数形的，风险比也就无意义了', ok: false, why: '比例风险假设确实常被违反（曲线早期可能交叉），这是另一个真实问题；但本题问的是中位数为何失效，原因是平台的存在。' },
            ],
            onOk() { S.qOK = true; finish(); },
          }).el);
          secB.append(h.el('h4', { text: 'B. 生存曲线的平台' }), plots, controls, readout, quizBox);

          function finish() {
            if (S.aOK && S.qOK) api.done(`<b>解除负调控的代价与收益写在同一张表上。</b>联合治疗 5 年生存 52%（2011 年之前转移性黑色素瘤的 5 年生存率不到 10%），3–4 级治疗相关不良事件 59%：每多救活 1 人，约 5 人多经历一次严重不良事件。
              免疫相关不良事件不是脱靶效应——负调控本来就是防止自身免疫的，这是同一机制的两面。
              而生存曲线的<b>平台</b>是这类药物的签名：一部分病人停药多年后仍无进展，这来自免疫记忆（上一关小鼠 70 天后再攻击仍不长瘤）。平台也让中位生存期失效——$\\pi\\gt1/2$ 时它根本无解，必须看长期生存率或 RMST。
              2018 年的奖授予艾利森与本庶佑：前者的 CTLA-4 在淋巴结里决定 T 细胞能不能被启动，后者的 PD-1 在肿瘤组织里决定到场的 T 细胞还能不能开火。`);
          }
          body.append(secA, secB);
          api.typeset(body);
          updB();
          cv.onResize(drawB);
          const off = watchTheme(drawB);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
