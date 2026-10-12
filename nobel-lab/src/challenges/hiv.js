/* HIV 与 HPV — 挑战版（Nobel Medicine 2008: zur Hausen; Barré-Sinoussi & Montagnier）
 * 三关：
 *  (1) 巴黎 1983：淋巴结培养的逆转录酶活性升起又塌掉。读者做判别性实验（补充健康淋巴细胞），
 *      从"塌→补→再升"认出这是一种杀死宿主细胞的逆转录病毒，与 HTLV-I 方向相反。
 *  (2) 1995–96：给蛋白酶抑制剂后密集采血。读者拟合 δ（晚期斜率）与 c（早期"肩"的形状），
 *      发现稀疏采样根本定不出 c；再用 N、μ 算出需要几种药 → 联合治疗。
 *  (3) 楚尔·豪森：低严格度杂交在活检样本里找未知型别；读者从 2×2 表算 OR 与归因分数，
 *      再用 R_e = R_0(1 − f·VE) 算消除所需覆盖率。
 *
 * 模型（示意，用于让规律可读）：
 *  (1) 体外靶细胞受限模型 dT/dt = −d_n T − kVT; d(T*)/dt = kVT − δ·T*; dV/dt = p·T* − cV
 *      k = 7e-9 /(粒子·天), δ = 0.55 /d, c = 3.0 /d, p = 900 /细胞/天, d_n = 0.02 /d, T0 = 2e6, V0 = 3
 *      → 峰在第 12 天，第 20 天掉到峰值的 1/60；第 20 天补 2e6 细胞 → 第 24 天回到 1.2e8。
 *  (2) Perelson 1996 式 (6)：V(t)/V0 = e^{−cs} + c/(c−δ)·[c/(c−δ)(e^{−δs}−e^{−cs}) − δs·e^{−cs}]，s = t − 延迟
 *      真值 c = 3.07 /d（t½ ≈ 5.4 h）、δ = 0.49 /d（t½ ≈ 1.4 d）、延迟 0.25 d；测定噪声 0.04（log10）
 *  (3) 2×2 表由真实量级构造：高危型 HPV 在宫颈癌中约 95%，在对照中约 10–15%。
 * 所有数字标注来源；真实文献见 content/hiv.js 的 papers。
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
    if (document.getElementById('st-hiv')) return;
    const s = document.createElement('style'); s.id = 'st-hiv';
    s.textContent = `
.hiv-tab{max-height:208px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.hiv-tab table{width:100%}
.hiv-tab th{position:sticky;top:0;background:var(--panel);z-index:1}
.hiv-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.hiv-leg i{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.hiv-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.hiv-sec[hidden]{display:none}
.hiv-sec h4{margin:0;font-size:14px}
.hiv-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.hiv-big{font-family:var(--mono-font,monospace);font-size:15px;color:var(--fg)}
.hiv-big b{font-size:19px}
.hiv-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.dtable td.hiv-l,.dtable th.hiv-l{text-align:left}
.hiv-2x2 td.hiv-hi{color:var(--accent);font-weight:600}`;
    document.head.append(s);
  }
  const line = (g, A, xs, ys, color, w = 2, dash = null) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
  };
  const legend = (items) => H.el('div', { class: 'hiv-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  /* ============ 第一关模型：1983 年的培养 ============ */
  const CK = 7e-9, CDELTA = 0.55, CC = 3.0, CP = 900, CDN = 0.02, CT0 = 2.0e6, CV0 = 3;
  function culture(adds, days) {
    const dt = 0.004; let T = CT0, Ts = 0, V = CV0;
    const out = { t: [], V: [], T: [], Ts: [] };
    const addS = adds.map((a) => a.day).sort((x, y) => x - y);
    for (let i = 0; i <= Math.round(days / dt); i++) {
      const t = i * dt;
      for (const a of adds) if (Math.abs(t - a.day) < dt / 2) T += a.cells;
      const f = (T, Ts, V) => [-CDN * T - CK * V * T, CK * V * T - CDELTA * Ts, CP * Ts - CC * V];
      const k1 = f(T, Ts, V);
      const k2 = f(T + dt / 2 * k1[0], Ts + dt / 2 * k1[1], V + dt / 2 * k1[2]);
      const k3 = f(T + dt / 2 * k2[0], Ts + dt / 2 * k2[1], V + dt / 2 * k2[2]);
      const k4 = f(T + dt * k3[0], Ts + dt * k3[1], V + dt * k3[2]);
      T = Math.max(0, T + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]));
      Ts = Math.max(0, Ts + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]));
      V = Math.max(0, V + dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]));
      if (i % Math.round(0.25 / dt) === 0) { out.t.push(+t.toFixed(2)); out.V.push(V); out.T.push(T); out.Ts.push(Ts); }
    }
    return out;
  }
  const RTOF = (V) => 0.5 * V;    // 逆转录酶活性读数（cpm，示意标度）

  /* ============ 第二关模型：给药后的病毒载量 ============ */
  const PC = 3.07, PD = 0.49, PV0 = 1.2e5, PLAG = 0.25, PSIG = 0.04;
  function Vload(t, c = PC, d = PD) {
    const s = t - PLAG; if (s <= 0) return PV0;
    const a = Math.exp(-c * s), b = Math.exp(-d * s);
    return PV0 * (a + (c / (c - d)) * ((c / (c - d)) * (b - a) - d * s * a));
  }
  const MU = 3.4e-5, NREP = 1e10;

  /* ============ 第三关：活检数据 ============ */
  const BIOPSY = { caPos: 171, caNeg: 9, ctPos: 23, ctNeg: 157 };   // 病例 180、对照 180（示意数据，量级取自文献）

  CHALLENGES.hiv = {
    title: '两种病毒的因果链',
    _m: { culture, Vload, BIOPSY, MU, NREP },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color;

      /* ===================== 第一关 ===================== */
      const stage1 = {
        title: '升起来又塌下去',
        task: `<p>巴黎，巴斯德研究所，1983 年 1 月。你拿到一份淋巴结活检：病人淋巴结肿大，但免疫系统尚未崩溃——临床医生建议从病程<b>早期</b>找，因为那时病毒应该还在复制。你分离出淋巴细胞，加植物血凝素和白细胞介素-2 培养起来。</p>
          <p>唯一的探针是<b>逆转录酶活性</b>（cpm）：逆转录酶把 RNA 抄成 DNA，是逆转录病毒特有的酶，细胞自己基本不做这件事。你每隔一两天取一点培养上清测一次。你还可以在显微镜下<b>数活细胞</b>，也可以往培养里<b>加入健康献血者的淋巴细胞</b>。</p>
          <p>当时已知的人类逆转录病毒只有 HTLV-I 和 HTLV-II，它们使 T 细胞<b>增殖</b>、导致白血病。而这个综合征的定义性特征恰恰相反：CD4 阳性 T 细胞在持续减少。</p>
          <p><b>任务</b>：把培养做下去，至少测 8 个时间点。你会看到一件按常规该判为"实验失败"的事。设计一个实验把"培养条件退化"和"另一种解释"分开，然后回答这种病毒在做什么。</p>`,
        hints: [
          '先一路测到第 20 天左右。活性升到顶之后掉了一两个数量级——同时去看"活细胞数"那一栏，它在同一段时间里发生了什么？',
          '如果是培养液耗竭、条件退化，补充新鲜靶细胞不会让病毒重新长起来；如果是病毒把靶细胞杀光了，补充靶细胞就会让活性重新指数上升。这两个假说给出相反的预言——做这个实验。',
          '在活性已经塌下去之后（第 18–22 天）点「补充健康淋巴细胞」，再继续测几天。活性会重新爬升到比第一次还高。这说明培养基没问题，<b>被耗尽的是靶细胞</b>。',
        ],
        answer: `这是一种<b>杀死它所感染的细胞</b>的逆转录病毒（细胞病变性），不是培养失败。
          <p><b>判别性实验。</b>在活性塌下去之后补充健康献血者的淋巴细胞，活性重新指数上升。培养条件退化的假说预言"补了也不涨"，靶细胞耗竭的假说预言"补了就涨"——数据选择了后者。</p>
          <p><b>模型。</b>$\\dot T=-d_nT-kVT$、$\\dot T^*=kVT-\\delta T^*$、$\\dot V=pT^*-cV$。早期 $T$ 充足，$T^*$ 与 $V$ 按特征方程 $(r+\\delta)(r+c)=kpT_0$ 的正根指数增长；$T$ 被耗尽后 $kVT\\to0$，系统退化为纯衰减，活性按 $\\delta$ 与 $c$ 中较慢者下落。注入新的 $T$ 使 $kVT$ 项复活，于是重新上升。</p>
          <p><b>为什么这与 HTLV 不同。</b>HTLV-I 使 T 细胞永生化、增殖；这种病毒杀死 T 细胞。方向相反正是关键——艾滋病的定义性特征就是 CD4 细胞的消失。巴黎组把它命名为 LAV，1983 年 5 月 20 日发表于《科学》；论文还指出它的逆转录酶偏好 Mg²⁺（HTLV 偏好 Mn²⁺）、浮力密度约 1.16 g/mL、血清学上与 HTLV 不同。1986 年统一改称 HIV。</p>`,
        build(body, api) {
          const S = { day: 2, rows: [], adds: [], quizOK: false, sawCrash: false, sawRescue: false };
          const sim = () => culture(S.adds, 46);
          let cur = sim();

          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.52, minH: 200, maxH: 290 });
          plots.append(legend([['逆转录酶活性（你的测量）', col('--s1')], ['活细胞数', col('--s3'), 1], ['补充淋巴细胞', col('--accent')]]));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });

          const sD = h.slider({ label: '培养天数', min: 1, max: 44, step: 1, value: 2,
            format: (v) => '第 ' + v + ' 天', onInput: (v) => { S.day = v; draw(); } });
          const bGo = h.button({ label: '取样测逆转录酶', kind: 'primary', onClick: measure });
          const bAdd = h.button({ label: '补充健康淋巴细胞', onClick: addCells });
          const bClr = h.button({ label: '重开一瓶', onClick: () => { S.rows = []; S.adds = []; S.sawCrash = S.sawRescue = false; cur = sim(); draw(); } });
          controls.append(sD.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bGo, bAdd, bClr])]));

          const R = {
            v: h.readout('逆转录酶活性 (cpm)'),
            t: h.readout('活细胞数 (每 mL)'),
            n: h.readout('已测时间点'),
            a: h.readout('补充记录'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));

          const tbody = h.el('tbody');
          const tab = h.el('div', { class: 'hiv-tab dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, [['第几天', 'hiv-l'], ['逆转录酶 (cpm)', ''], ['活细胞 (×10⁶/mL)', ''], ['备注', 'hiv-l']]
              .map(([t, c]) => h.el('th', { class: c, text: t })))]), tbody])]);

          const idxOf = (d) => Math.min(cur.t.length - 1, Math.round(d * 4));
          function measure() {
            const i = idxOf(S.day);
            const rnd = mul32(S.day * 7919 + S.adds.length * 104729), g = gaussOf(rnd);
            const v = Math.max(0, RTOF(cur.V[i]) * (1 + 0.08 * g()) + 12 + 6 * g());
            const tc = Math.max(0, cur.T[i] * (1 + 0.05 * g()));
            const after = S.adds.filter((a) => a.day <= S.day).length;
            S.rows.push({ d: S.day, v, tc, note: after ? `已补充 ${after} 次` : '' });
            S.rows.sort((a, b) => a.d - b.d);
            // 观察到"塌"：峰后掉一个数量级以上
            const mx = Math.max(...S.rows.map((r) => r.v));
            const late = S.rows.filter((r) => r.d > S.rows.find((q) => q.v === mx).d);
            if (late.some((r) => r.v < mx / 10)) S.sawCrash = true;
            if (S.adds.length && S.sawCrash) {
              const a0 = Math.min(...S.adds.map((a) => a.day));
              const lo = Math.min(...S.rows.filter((r) => r.d <= a0 && r.d > 14).map((r) => r.v), Infinity);
              if (S.rows.some((r) => r.d > a0 && r.v > 10 * lo)) S.sawRescue = true;
            }
            R.v.set(v.toFixed(0) + ' cpm');
            R.t.set(sci(tc) + ' /mL');
            fill(); draw();
            if (S.sawRescue && quizBox.hidden) { quizBox.hidden = false; api.typeset(quizBox); api.say('活性回来了——而且比第一次更高。培养基没问题，被耗尽的是别的东西。', 'good'); }
            else if (S.sawCrash && !S.adds.length) api.say('活性掉下去了。按常规这该判为"培养失败"。但在下结论之前：有没有一个实验能把"培养条件退化"和别的解释分开？', 'info');
          }
          function addCells() {
            S.adds.push({ day: S.day, cells: 2.0e6 });
            cur = sim();
            R.a.set(S.adds.map((a) => '第 ' + a.day + ' 天').join('、'));
            api.say(`第 ${S.day} 天向培养中加入 2×10⁶ 健康献血者淋巴细胞。继续取样看会发生什么。`, 'info');
            draw();
          }
          function fill() {
            tbody.textContent = '';
            S.rows.forEach((r) => tbody.append(h.el('tr', {}, [
              h.el('td', { class: 'hiv-l', text: String(r.d) }),
              h.el('td', { text: r.v.toFixed(0) }),
              h.el('td', { text: (r.tc / 1e6).toFixed(3) }),
              h.el('td', { class: 'hiv-l', text: r.note }),
            ])));
            R.n.set(`${S.rows.length} 个（至少 8 个）`);
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 44, y0: 10, y1: 3e8, logY: true, pad: { l: 56, r: 42, t: 14, b: 34 },
              xTicks: [0, 10, 20, 30, 40], yTicks: [10, 1e3, 1e5, 1e7, 3e8],
              fmtY: (v) => (v >= 1e3 ? '10' + sup(Math.round(Math.log10(v))) : String(v)),
              xLabel: '培养天数', yLabel: '逆转录酶活性 (cpm，对数)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 补充事件
            S.adds.forEach((a) => {
              g.strokeStyle = col('--accent'); g.lineWidth = 1.6; g.setLineDash([4, 3]);
              g.beginPath(); g.moveTo(A.X(a.day), A.p.t); g.lineTo(A.X(a.day), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            });
            // 活细胞数（右轴，归一到 0–2.4e6 映射到画面高度）
            const Ty = (c) => A.p.t + A.ih - (Math.min(1, c / 2.4e6)) * A.ih;
            const measured = S.rows.map((r) => r.d);
            if (measured.length >= 2) {
              g.save(); g.strokeStyle = col('--s3'); g.lineWidth = 1.4; g.setLineDash([5, 4]); g.beginPath();
              S.rows.forEach((r, i) => { const x = A.X(r.d), y = Ty(r.tc); i ? g.lineTo(x, y) : g.moveTo(x, y); });
              g.stroke(); g.restore();
            }
            // 测量点与折线
            if (S.rows.length >= 2) line(g, A, S.rows.map((r) => r.d), S.rows.map((r) => Math.max(10, r.v)), col('--s1'), 1.8);
            g.fillStyle = col('--s1');
            S.rows.forEach((r) => { g.beginPath(); g.arc(A.X(r.d), A.Y(Math.max(10, r.v)), 3.6, 0, 7); g.fill(); });
            g.fillStyle = col('--s3');
            S.rows.forEach((r) => { g.beginPath(); g.arc(A.X(r.d), Ty(r.tc), 2.6, 0, 7); g.fill(); });
            // 游标
            g.strokeStyle = col('--line'); g.lineWidth = 1.4; g.setLineDash([3, 3]);
            g.beginPath(); g.moveTo(A.X(S.day), A.p.t); g.lineTo(A.X(S.day), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            g.restore();
            g.fillStyle = col('--s3'); g.font = '10px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillText('2.4', A.p.l + A.iw + 4, Ty(2.4e6)); g.fillText('0', A.p.l + A.iw + 4, Ty(0));
            g.fillText('活细胞', A.p.l + A.iw + 4, Ty(1.2e6));
            g.fillText('×10⁶', A.p.l + A.iw + 4, Ty(1.2e6) + 12);
            if (!S.rows.length) { g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.fillText('按「取样测逆转录酶」', A.p.l + A.iw / 2, A.p.t + A.ih / 2); }
          }

          const sec = h.el('div', { class: 'hiv-sec' });
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '活性塌下去、补充健康淋巴细胞后又升回来。最合理的结论是：',
            options: [
              { label: '培养基耗竭，换新细胞时顺带换了培养基', ok: false, why: '补充的是细胞悬液，培养基条件没有本质改变；而且如果是培养基问题，补细胞前单纯换液就该让活性回升。' },
              { label: '培养里有一种逆转录病毒，它<b>杀死</b>被它感染的 T 细胞；靶细胞耗尽则产毒停止，补充靶细胞则重新开始', ok: true,
                why: '对。活细胞数那一栏与活性的塌落同步。这把它与 HTLV-I 区分开来——HTLV-I 使 T 细胞增殖、永生化，而这种病毒杀死它们，正好对应艾滋病患者 CD4 细胞的持续减少。巴黎组命名为 LAV，1983 年 5 月发表。' },
              { label: '逆转录酶不稳定，几天后自己失活了', ok: false, why: '那么补充细胞不会让读数回升，而且每次测的是新取的上清，不是同一份酶。' },
              { label: '这是 HTLV-I，只是培养条件不同', ok: false, why: 'HTLV-I 使 T 细胞增殖而非死亡。培养里细胞在消失，方向相反。后来还发现这种病毒的逆转录酶偏好 Mg²⁺，而 HTLV 偏好 Mn²⁺。' },
            ],
            onOk() { S.quizOK = true; finish(); },
          }).el);
          function finish() {
            if (S.quizOK && S.rows.length >= 8) {
              api.done(`<b>一种会杀死 T 细胞的逆转录病毒。</b>"活性塌掉"不是实验失败，而是结论本身：靶细胞被耗尽了。
                判别性实验（补充健康淋巴细胞后活性重新上升）把"培养条件退化"排除掉。
                巴尔-西诺西、Chermann、蒙塔尼耶等 1983 年 5 月 20 日在《科学》发表，命名 LAV；1986 年统一称 HIV。
                1984 年美国 Gallo 实验室报告 HTLV-III 并建立了可持续产毒的细胞系（使血液筛查成为可能），随后发现两者序列几乎相同，优先权争议持续多年，1987 年由两国政府达成协议。下一关：这种病毒在人体内到底跑得多快。`);
            } else if (S.quizOK) {
              api.say(`判断对了，但数据还不够扎实：目前只有 ${S.rows.length} 个时间点，至少测 8 个。`, 'info');
            }
          }
          sec.append(h.el('h4', { text: '下结论' }), quizBox);
          body.append(plots, controls, readout, tab, sec);
          api.typeset(body);
          fill(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ===================== 第二关 ===================== */
      const stage2 = {
        title: '潜伏期里在发生什么',
        task: `<p>1995 年。从感染到发病常常要很多年，这段"临床潜伏期"里病人没有症状，血里的病毒也不多。主流图景是：这是一种慢病毒，大部分时间处于低水平的静止状态。</p>
          <p>现在有了两样新东西：能定量测<b>血浆病毒载量</b>（copies/mL）的核酸方法，以及一种强效<b>蛋白酶抑制剂</b>——它使新产生的病毒粒子不具感染性，相当于一瞬间把"产生"这一项关掉。于是你可以做一次阶跃响应实验：给药，然后密集采血。</p>
          <p>模型是三个池子：被感染细胞 $T^*$ 以速率 $\\delta$ 死亡，每个细胞产生病毒，游离病毒粒子以速率 $c$ 被清除。给药后（延迟约 0.25 天起效）</p>
          <p>$$\\frac{V(t)}{V_0}=e^{-cs}+\\frac{c}{c-\\delta}\\left[\\frac{c}{c-\\delta}\\big(e^{-\\delta s}-e^{-cs}\\big)-\\delta s\\,e^{-cs}\\right],\\quad s=t-0.25 .$$</p>
          <p><b>任务</b>：自己安排采血时间表（每次采血都要花钱和扎针，但这里不限次数），把 $c$ 和 $\\delta$ 都测出来。先试试只在第 1、2、…、7 天各采一次，看你能定出哪个、定不出哪个。两个都定出来之后，在下面读出每天的病毒产生量。</p>`,
        hints: [
          '先看半对数图上的<b>直线段</b>（第 2 天以后）。它的斜率给的是 $\\delta$ 还是 $c$？把拟合曲线的两个旋钮分别动一动，看哪一个改变了这段直线的斜率。',
          '因为 $c\\gg\\delta$，$t$ 较大时 $e^{-cs}$ 早已可以忽略，$\\ln V$ 的渐近斜率是 $-\\delta$。$c$ 只影响曲线最开头那段<b>"肩"</b>的形状——下落前那一小段平缓。要定出 $c$，必须在给药后头一天里密集采样（每 1–2 小时一次）。',
          '真值 $c\\approx3.1\\ \\mathrm{d^{-1}}$（半衰期约 5.4 小时）、$\\delta\\approx0.49\\ \\mathrm{d^{-1}}$（半衰期约 1.4 天）。只有"头 2 天每 2 小时"那套采样才把 $c$ 的区间收到 2 倍以内——Perelson 等 1996 年用的正是这个密度。',
        ],
        answer: `$c\\approx3.07\\ \\mathrm{d^{-1}}$（游离病毒半衰期 $\\ln2/c\\approx0.23$ 天 ≈ 5.4 小时），$\\delta\\approx0.49\\ \\mathrm{d^{-1}}$（被感染细胞半衰期 ≈ 1.4 天）。Perelson 等，<i>Science</i> 271, 1582 (1996)。
          <p><b>为什么稀疏采样只能给出 $\\delta$。</b>$c\\gg\\delta$，所以 $e^{-cs}$ 在一天之内就衰减殆尽，之后 $\\ln V$ 的渐近斜率是 $-\\delta$。半对数图上那条漂亮的直线测的是<b>被感染细胞的寿命</b>，不是病毒粒子的寿命。$c$ 的全部信息都在给药后头十几个小时的"肩"里：$c$ 越大，肩越短、下落得越早。每天采一次的方案里根本没有那段信息，拟合出的 $c$ 在 2–7 之间乱跳；切到每 2 小时一次，$c$ 的离散度就收缩到 ±0.3 左右。</p>
          <p><b>由速率反推通量。</b>稳态下产生 = 清除：$P=c\\,V_{\\rm ss}\\,V_{\\rm blood}$。取 $V_{\\rm ss}=1.2\\times10^{5}$ copies/mL、有效分布体积 15 L：$P\\approx3.07\\times1.2\\times10^{5}\\times1.5\\times10^{4}\\approx5.5\\times10^{9}$ 粒子/天。Perelson 等对 5 名患者给出的平均值是 $1.03\\times10^{10}$ 粒子/天。</p>
          <p>所以"潜伏期"是个误称：那些年里每天都有上百亿病毒粒子产生又被清除，被感染细胞每天换一大批。看起来安静，是因为产生与清除打成了高速的动态平衡。</p>`,
        build(body, api) {
          const S = { scheme: 'daily', cFit: 1.0, dFit: 0.25, pts: [], ci: null, ansC: false, ansD: false, seed: 1996 };
          const SCHEMES = {
            daily:  { zh: '每天 1 次（第 1–7 天）', ts: [1, 2, 3, 4, 5, 6, 7] },
            half:   { zh: '每 12 小时（头 2 天）+ 每天', ts: [0.25, 0.75, 1.25, 1.75, 2, 3, 4, 5, 6, 7] },
            six:    { zh: '每 6 小时（头 1 天）+ 每天', ts: [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7] },
            two:    { zh: '每 2 小时（头 1 天）+ 每天', ts: (() => { const o = []; for (let t = 0.25; t <= 1.0001; t += 1 / 12) o.push(+t.toFixed(4)); return o.concat([2, 3, 4, 5, 6, 7]); })() },
            dense:  { zh: '每 2 小时（头 2 天）+ 每天 ← Perelson 1996 用的', ts: (() => { const o = []; for (let t = 0.25; t <= 2.0001; t += 1 / 12) o.push(+t.toFixed(4)); return o.concat([3, 4, 5, 6, 7]); })() },
          };
          /* 剖面似然：对每个 c 在 δ 上取最小残差，给出 c 的 95% 区间（判别这套采样能不能定出 c） */
          function profileCI() {
            const sse = (c, d) => S.pts.reduce((s, [t, v]) => s + (Math.log10(Vload(t, c, d)) - Math.log10(v)) ** 2, 0);
            const prof = (c) => { let b = Infinity; for (let d = 0.2; d <= 1.2; d *= 1.01) b = Math.min(b, sse(c, d)); return b; };
            const cs = []; let bs = Infinity;
            for (let c = 0.6; c <= 24; c *= 1.03) { const s = prof(c); cs.push([c, s]); if (s < bs) bs = s; }
            const thr = bs + PSIG * PSIG * 3.84;
            const inR = cs.filter(([, s]) => s <= thr).map(([c]) => c);
            return inR.length ? [Math.min(...inR), Math.max(...inR)] : [0.6, 24];
          }
          function sample() {
            const rnd = mul32(S.seed), g = gaussOf(rnd);
            S.pts = SCHEMES[S.scheme].ts.map((t) => [t, Vload(t) * 10 ** (PSIG * g())]);
            S.ci = profileCI();
            draw(); upd();
          }

          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.54, minH: 210, maxH: 300 });
          plots.append(legend([['你的采血点', col('--s1')], ['你的拟合曲线', col('--accent')], ['只有 δ 的纯指数（参考）', col('--muted'), 1]]));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });

          const cS = h.choice({ label: '采血时间表', value: 'daily',
            options: Object.entries(SCHEMES).map(([k, v]) => ({ value: k, label: v.zh })),
            onChange: (v) => { S.scheme = v; sample(); } });
          const sC = h.slider({ label: '拟合用的 c（病毒清除速率）', min: -0.3, max: 1.2, step: 0.01, value: 0,
            format: (v) => (10 ** v).toFixed(2) + ' /d　(t½ ' + (24 * Math.LN2 / 10 ** v).toFixed(1) + ' h)',
            onInput: (v) => { S.cFit = 10 ** v; draw(); upd(); } });
          const sD = h.slider({ label: '拟合用的 δ（被感染细胞死亡速率）', min: -1, max: 0.3, step: 0.005, value: Math.log10(0.25),
            format: (v) => (10 ** v).toFixed(3) + ' /d　(t½ ' + (Math.LN2 / 10 ** v).toFixed(2) + ' d)',
            onInput: (v) => { S.dFit = 10 ** v; draw(); upd(); } });
          const bRe = h.button({ label: '换一个病人（重新采样）', onClick: () => { S.seed += 7; sample(); } });
          controls.append(cS.el, sC.el, sD.el, h.el('div', { class: 'ctl' }, [bRe]));

          const R = {
            r: h.readout('拟合残差 RMS（log₁₀ 单位）'),
            s: h.readout('对 c 的敏感度'),
            p: h.readout('每天产生的病毒粒子'),
            n: h.readout('采血次数'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));
          const meter = h.el('div', { class: 'hiv-big', 'aria-live': 'polite' });

          const rms = (c, d) => Math.sqrt(S.pts.reduce((s, [t, v]) => s + (Math.log10(Vload(t, c, d)) - Math.log10(v)) ** 2, 0) / Math.max(1, S.pts.length));
          function upd() {
            const r0 = rms(S.cFit, S.dFit);
            R.r.set(r0.toFixed(4));
            // 这套采样表能把 c 框在多窄：剖面似然的 95% 区间（与当前旋钮位置无关）
            const [lo, hi] = S.ci || [0.6, 24];
            const wide = hi / lo > 2.2;
            R.s.set(`c 的 95% 区间 [${lo.toFixed(1)}, ${hi >= 23 ? '∞' : hi.toFixed(1)}]　` +
              (wide ? '跨度超过 2.2 倍——这套采样定不出 c' : '已经够窄'));
            const P = S.cFit * PV0 * 1.5e4;
            R.p.set(sci(P) + ' 粒子/天');
            R.n.set(String(S.pts.length));
            const good = r0 < 0.055;
            meter.innerHTML = `拟合残差 <b style="color:${good ? 'var(--good)' : 'var(--accent)'}">${r0.toFixed(4)}</b>　（噪声水平 0.040，残差 &lt; 0.055 即为吻合）`;
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 7.4, y0: 3e3, y1: 2e5, logY: true, pad: { l: 58, r: 14, t: 14, b: 34 },
              xTicks: [0, 1, 2, 3, 4, 5, 6, 7], yTicks: [3e3, 1e4, 3e4, 1e5],
              fmtY: (v) => sci(v, 0), xLabel: '给药后天数', yLabel: '血浆病毒载量 (copies/mL)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 纯指数参考（只有 delta）
            const xs0 = [], ys0 = [];
            for (let i = 0; i <= 150; i++) { const t = 7.4 * i / 150; xs0.push(t); ys0.push(PV0 * Math.exp(-S.dFit * Math.max(0, t - PLAG))); }
            line(g, A, xs0, ys0, col('--muted'), 1.3, [4, 3]);
            // 拟合曲线
            const xs = [], ys = [];
            for (let i = 0; i <= 300; i++) { const t = 7.4 * i / 300; xs.push(t); ys.push(Vload(t, S.cFit, S.dFit)); }
            line(g, A, xs, ys, col('--accent'), 2.2);
            // 数据点
            g.fillStyle = col('--s1');
            S.pts.forEach(([t, v]) => { g.beginPath(); g.arc(A.X(t), A.Y(v), 3.4, 0, 7); g.fill(); });
            g.restore();
            // 放大的"肩"插图（放在左下角：数据从左上走到右下，这一块始终是空的）
            const iw = Math.min(150, A.iw * 0.34), ih = A.ih * 0.40;
            const ix = A.p.l + 6, iy = A.p.t + A.ih - ih - 18;
            g.save();
            g.fillStyle = col('--bg'); g.globalAlpha = 0.92; g.fillRect(ix, iy, iw, ih); g.globalAlpha = 1;
            g.strokeStyle = col('--line'); g.lineWidth = 1; g.strokeRect(ix + 0.5, iy + 0.5, iw, ih);
            const IX = (t) => ix + (t / 1.25) * iw, IY = (v) => iy + ih - ((Math.log10(v) - Math.log10(0.55 * PV0)) / (Math.log10(1.15 * PV0) - Math.log10(0.55 * PV0))) * ih;
            g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
            g.strokeStyle = col('--accent'); g.lineWidth = 1.8; g.beginPath();
            for (let i = 0; i <= 120; i++) { const t = 1.25 * i / 120, y = IY(Vload(t, S.cFit, S.dFit)); i ? g.lineTo(IX(t), y) : g.moveTo(IX(t), y); }
            g.stroke();
            g.fillStyle = col('--s1');
            S.pts.filter(([t]) => t <= 1.25).forEach(([t, v]) => { g.beginPath(); g.arc(IX(t), IY(v), 2.4, 0, 7); g.fill(); });
            g.restore();
            g.fillStyle = col('--muted'); g.font = '9.5px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('放大：头 30 小时（"肩"）', ix + 2, iy + ih + 2);
          }

          const sec = h.el('div', { class: 'hiv-sec' });
          const ansD = H.answer({
            label: '被感染细胞的半衰期（天，容差 ±25%）', unit: 'd', placeholder: '例如 1.4',
            check(v) {
              const tru = Math.LN2 / PD;
              if (Math.abs(v - 0.23) < 0.08) return { ok: false, msg: '约 0.23 天是<b>游离病毒粒子</b>的半衰期，那是 $c$。这里问的是被感染细胞，即 $\\delta$ 对应的那个。' };
              if (Math.abs(v - tru) / tru <= 0.25) return { ok: true, msg: `对。$\\ln2/\\delta\\approx1.4$ 天：半对数图上第 2 天以后那条直线测的就是它。` };
              return { ok: false, msg: '不对。看半对数图上第 2 天之后的直线段斜率，$t_{1/2}=\\ln2/\\delta$。' };
            },
            onOk() { S.ansD = true; part2.hidden = false; api.typeset(part2); finish(); },
          });
          const part2 = h.el('div', { hidden: true });
          const ansC = H.answer({
            label: '游离病毒粒子的半衰期（小时，容差 ±40%）', unit: 'h', placeholder: '例如 6',
            check(v) {
              const tru = 24 * Math.LN2 / PC;
              const [clo, chi] = S.ci || [0.6, 24];
              if (chi / clo > 2.2) return { ok: false, msg: `先看"对 c 的敏感度"那一栏：这套采样给出的 $c$ 的 95% 区间是 $[${clo.toFixed(1)}, ${chi >= 23 ? '\\infty' : chi.toFixed(1)}]$，跨度超过 2.2 倍——数据还不足以回答这个问题。换一个在给药后头<b>两天</b>都密集采样的时间表。` };
              if (Math.abs(v - 34) < 8) return { ok: false, msg: '约 34 小时（1.4 天）是<b>被感染细胞</b>的半衰期。游离病毒快得多。' };
              if (Math.abs(v - tru) / tru <= 0.4) return { ok: true, msg: `对。$\\ln2/c\\approx5.4$ 小时。注意这个数只能从给药后头十几个小时的"肩"里读出来——每天采一次的方案里根本没有这段信息。` };
              return { ok: false, msg: '不对。把 c 的旋钮调到让"肩"的形状贴上头一天的那些点，再换算 $t_{1/2}=\\ln2/c$（记得乘 24）。' };
            },
            onOk() { S.ansC = true; finish(); },
          });
          part2.append(h.el('p', { class: 'hiv-note', html: '现在把 $\\delta$ 固定住，只调 $c$，并换用更密的采样表，让曲线开头那段"肩"也贴上。' }), ansC.el);
          function finish() {
            if (S.ansC && S.ansD) api.done(`<b>病毒动力学（Ho 等 1995；Perelson 等 1996）。</b>游离病毒粒子半衰期约 <b>5.4 小时</b>，被感染细胞半衰期约 <b>1.4 天</b>，每天产生并清除约 $10^{10}$ 个病毒粒子。
              所谓"临床潜伏期"里，病毒与免疫系统打的是一场高速消耗战，CD4 细胞在其中缓慢输掉。
              方法上的要点是：<b>稳态看不出周转速度，必须用扰动去测</b>——蛋白酶抑制剂把"产生"项瞬间关掉，剩下的纯衰减曲线才把速率暴露出来；而两个速率相差六倍，各自的信息藏在曲线的不同段里。下一关：这个每天 $10^{10}$ 的数字，决定了治疗必须长什么样。`);
          }
          sec.append(h.el('h4', { text: '读出两个速率' }), ansD.el, part2);
          body.append(plots, controls, meter, readout, sec);
          api.typeset(body);
          sample();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ===================== 第三关 ===================== */
      const stage3 = {
        title: '算出治疗与疫苗的形状',
        task: `<p>这一关把两侧的数字各算一遍。</p>
          <p><b>A. 为什么单药必然失败。</b>上一关的结论：体内每天约 $N=10^{10}$ 次复制事件。HIV-1 逆转录酶的体内突变率（Mansky 与 Temin，1995）约 $\\mu=3.4\\times10^{-5}$ 每碱基每复制周期。先算：针对某一个特定位点的耐药突变体，<b>每天</b>新产生多少个？</p>
          <p><b>B. 宫颈癌这一侧。</b>楚尔·豪森的实验室改用<b>低严格度杂交</b>（允许探针与只有部分同源的 DNA 结合），1983 年从宫颈癌样本里克隆出 HPV16，1984 年克隆出 HPV18。下面是一组活检数据（示意数据，量级取自文献）：病例为浸润性宫颈癌，对照为同年龄的非癌宫颈组织，检测高危型 HPV DNA。从表里算出<b>比值比 OR</b> 与<b>病例中的归因分数</b>。</p>
          <p><b>C. 疫苗要覆盖多少人。</b>$R_e=R_0(1-f\\cdot\\mathrm{VE})$。取 $R_0=3$、$\\mathrm{VE}=0.95$，算出阻断传播所需的最低覆盖率 $f$。</p>`,
        hints: [
          'A：每天产生某个特定点突变体的期望个数就是 $N\\mu$。把 $10^{10}$ 乘以 $3.4\\times10^{-5}$。',
          'B：$\\mathrm{OR}=\\dfrac{a/b}{c/d}=\\dfrac{ad}{bc}$，其中 $a,b$ 是病例中的阳性/阴性，$c,d$ 是对照中的阳性/阴性。归因分数 $\\mathrm{AF}=p_e\\left(1-\\dfrac1{\\mathrm{OR}}\\right)$，$p_e$ 是<b>病例中</b>的阳性比例。',
          'C：$R_e\\lt1$ 要求 $f\\gt\\dfrac1{\\mathrm{VE}}\\left(1-\\dfrac1{R_0}\\right)$。$R_0=3$ 给 $1-1/3=2/3$，再除以 0.95。',
        ],
        answer: `<b>A.</b> $N\\mu = 10^{10}\\times3.4\\times10^{-5}=3.4\\times10^{5}$：任何单个耐药位点的突变体<b>每天都会新产生几十万个</b>。所以单药治疗不是"会不会耐药"的问题，而是几周之内的问题——药物只是把本已存在的耐药变异体选出来。
          <p>三药联合：三重突变体每天的期望个数 $N\\mu^3\\approx10^{10}\\times3.9\\times10^{-14}\\approx4\\times10^{-4}$，约每 2500 天才自发出现一次。一般地，要使治疗前已存在耐药株的概率 $P_{\\ge1}\\approx N\\mu^m\\le\\epsilon$，所需药物数 $m\\ge\\dfrac{\\ln N-\\ln\\epsilon}{\\ln(1/\\mu)}$；代入 $N=10^{10}$、$\\mu=3.4\\times10^{-5}$、$\\epsilon=10^{-2}$ 得 $m\\ge2.7$，即<b>至少三种</b>。这正是 1996 年起 HAART 的形状。注意 $m$ 对 $N$ 只有对数依赖，但对"每种药需要几个突变才失效"（遗传屏障）很敏感。</p>
          <b>B.</b> $\\mathrm{OR}=\\dfrac{171\\times157}{9\\times23}=\\dfrac{26\\,847}{207}\\approx130$。病例中阳性比例 $p_e=171/180=0.950$，故 $\\mathrm{AF}=0.950\\times(1-1/130)\\approx0.943$：<b>约 94% 的宫颈癌可归因于高危型 HPV 感染</b>。这是人类癌症中归因分数最高的病因之一。
          <p>完整的因果链还需要：整合破坏 <i>E2</i> → <i>E6</i>/<i>E7</i> 持续表达 → E6 促 p53 降解、E7 灭活 Rb；前瞻性队列中持续感染先于癌变；以及最终的判决性证据——接种疫苗降低了癌症发生率（瑞典约 170 万人队列，17 岁前接种者风险下降约 88%，Lei 等 <i>NEJM</i> 2020）。</p>
          <b>C.</b> $f\\gt\\dfrac{1}{0.95}\\left(1-\\dfrac13\\right)=\\dfrac{0.667}{0.95}=0.702$，即约 <b>70%</b>。WHO 2020 年的消除战略定为 90–70–90（15 岁前女孩接种 90%、35 与 45 岁各筛查一次覆盖 70%、病变与癌症治疗覆盖 90%），"消除"阈值为发病率低于每 10 万女性-年 4 例。`,
        build(body, api) {
          const S = { a: false, b: false, c: false, N: 10, mu: Math.log10(MU) };
          const B = BIOPSY;

          /* --- A --- */
          const secA = h.el('div', { class: 'hiv-sec' });
          const roA = h.el('div', { class: 'lab-readout' });
          const rA = { e1: h.readout('每天的单点突变体'), e3: h.readout('每天的三重突变体'), m: h.readout('所需药物数 m') };
          Object.values(rA).forEach((x) => roA.append(x.el));
          const sN = h.slider({ label: '每天复制次数 N', min: 6, max: 12, step: 0.1, value: 10,
            format: (v) => sci(10 ** v, 1), onInput: (v) => { S.N = v; updA(); } });
          const sMu = h.slider({ label: '突变率 μ（每碱基每周期）', min: -7, max: -3.5, step: 0.05, value: Math.log10(MU),
            format: (v) => sci(10 ** v, 1), onInput: (v) => { S.mu = v; updA(); } });
          function updA() {
            const N = 10 ** S.N, mu = 10 ** S.mu;
            rA.e1.set(sci(N * mu) + ' 个/天');
            const e3 = N * mu ** 3;
            rA.e3.set(sci(e3) + ' 个/天' + (e3 < 1 ? `（约每 ${(1 / e3).toFixed(0)} 天一次）` : ''));
            const m = (Math.log(N) - Math.log(1e-2)) / Math.log(1 / mu);
            rA.m.set(`${m.toFixed(2)} → 取整 ${Math.ceil(m)} 种`);
          }
          const ansA = H.answer({
            label: '$N=10^{10}$、$\\mu=3.4\\times10^{-5}$ 时，每天新产生的某一特定位点耐药突变体个数（容差 ±30%）',
            placeholder: '例如 3.4e5',
            check(v) {
              const tru = NREP * MU;
              if (Math.abs(v - MU) / MU < 0.3) return { ok: false, msg: '这是 $\\mu$ 本身。要乘以每天的复制次数 $N$。' };
              if (Math.abs(v - tru) / tru <= 0.3) return { ok: true, msg: `对：$10^{10}\\times3.4\\times10^{-5}=3.4\\times10^{5}$。每天几十万个——<b>任何</b>单点耐药突变每天都在产生。单药治疗必然失败。` };
              if (v > 1e8) return { ok: false, msg: '太大了。$N\\mu$，不是 $N$。' };
              return { ok: false, msg: '不对。期望个数 = 每天复制次数 × 每次复制该位点出错的概率。' };
            },
            onOk() { S.a = true; finish(); },
          });
          secA.append(h.el('h4', { text: 'A. 耐药的日产量' }),
            h.el('p', { class: 'hiv-note', html: '两个旋钮先留在真实值上。算出答案之后再去拨它们，看 $m$ 对 $N$ 和 $\\mu$ 分别有多敏感。' }),
            h.el('div', { class: 'lab-controls' }, [sN.el, sMu.el]), roA, ansA.el);

          /* --- B --- */
          const secB = h.el('div', { class: 'hiv-sec' });
          const tbl = h.el('div', { class: 'dtable hiv-2x2' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, [h.el('th', { class: 'hiv-l', text: '' }), h.el('th', { text: '高危型 HPV DNA 阳性' }), h.el('th', { text: '阴性' }), h.el('th', { text: '合计' })])]),
            h.el('tbody', {}, [
              h.el('tr', {}, [h.el('td', { class: 'hiv-l', text: '浸润性宫颈癌（病例）' }), h.el('td', { class: 'hiv-hi', text: String(B.caPos) }), h.el('td', { text: String(B.caNeg) }), h.el('td', { text: String(B.caPos + B.caNeg) })]),
              h.el('tr', {}, [h.el('td', { class: 'hiv-l', text: '非癌宫颈组织（对照）' }), h.el('td', { text: String(B.ctPos) }), h.el('td', { text: String(B.ctNeg) }), h.el('td', { text: String(B.ctPos + B.ctNeg) })]),
            ]),
          ])]);
          const OR_T = (B.caPos * B.ctNeg) / (B.caNeg * B.ctPos);
          const AF_T = (B.caPos / (B.caPos + B.caNeg)) * (1 - 1 / OR_T);
          const ansB1 = H.answer({
            label: '比值比 OR（容差 ±15%）', placeholder: '例如 100',
            check(v) {
              if (Math.abs(v - (B.caPos / (B.caPos + B.caNeg)) / (B.ctPos / (B.ctPos + B.ctNeg))) < 0.6) return { ok: false, msg: '这是<b>率比</b>（阳性比例之比）。OR 用的是<b>比值</b>之比：$\\dfrac{a/b}{c/d}$。' };
              if (Math.abs(v - OR_T) / OR_T <= 0.15) return { ok: true, msg: `对：$\\mathrm{OR}=\\dfrac{171\\times157}{9\\times23}\\approx${OR_T.toFixed(0)}$。` };
              return { ok: false, msg: '不对。$\\mathrm{OR}=ad/(bc)$，把四个格子代进去。' };
            },
            onOk() { b1 = true; maybeB(); },
          });
          const ansB2 = H.answer({
            label: '病例中的归因分数 AF（0–1，容差 ±0.05）', placeholder: '例如 0.9',
            check(v) {
              if (v > 1.5) return { ok: false, msg: '请用 0–1 的小数（或写成百分数再除以 100）。' };
              const w = v > 1 ? v / 100 : v;
              if (Math.abs(w - AF_T) <= 0.03) return { ok: true, msg: `对：$\\mathrm{AF}=p_e(1-1/\\mathrm{OR})=0.950\\times(1-1/${OR_T.toFixed(0)})\\approx${AF_T.toFixed(3)}$。
                注意 $1-1/\\mathrm{OR}=0.992$ 已经非常接近 1，所以 $\\mathrm{AF}$ 几乎就等于病例中的阳性比例 $p_e$——<b>关联强到这个程度时，修正项可以忽略</b>。
                反过来说，如果 OR 只有 3，修正项就是 $1-1/3=0.67$，不能省。宫颈癌是归因分数最高的人类癌症之一。` };
              if (Math.abs(w - (1 - 1 / OR_T)) < 0.02) return { ok: false, msg: '这是修正因子 $1-1/\\mathrm{OR}$ 本身，还要乘上病例中的阳性比例 $p_e=171/180$。' };
              if (Math.abs(w - B.ctPos / (B.ctPos + B.ctNeg)) < 0.03) return { ok: false, msg: '这是<b>对照</b>中的阳性比例。归因分数问的是病例。' };
              return { ok: false, msg: '不对。$\\mathrm{AF}=p_e\\left(1-1/\\mathrm{OR}\\right)$，$p_e$ 是病例中的阳性比例。' };
            },
            onOk() { b2 = true; maybeB(); },
          });
          let b1 = false, b2 = false;
          function maybeB() { if (b1 && b2) { S.b = true; finish(); } }
          secB.append(h.el('h4', { text: 'B. 活检数据' }), tbl,
            h.el('p', { class: 'hiv-note', html: '示意数据，量级取自文献（高危型 HPV 在宫颈癌中的检出率约 95%，在同年龄非癌宫颈中约 10%–15%）。' }),
            ansB1.el, ansB2.el);

          /* --- C --- */
          const secC = h.el('div', { class: 'hiv-sec' });
          const roC = h.el('div', { class: 'lab-readout' });
          const rC = { re: h.readout('有效再生数 R_e'), f: h.readout('阻断传播所需覆盖率') };
          Object.values(rC).forEach((x) => roC.append(x.el));
          const st = { R0: 3, VE: 0.95, f: 0.5 };
          const sR0 = h.slider({ label: '基本再生数 R₀', min: 1.2, max: 6, step: 0.1, value: 3, format: (v) => v.toFixed(1), onInput: (v) => { st.R0 = v; updC(); } });
          const sVE = h.slider({ label: '疫苗对获得感染的有效性 VE', min: 0.3, max: 1, step: 0.01, value: 0.95, format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { st.VE = v; updC(); } });
          const sF = h.slider({ label: '接种覆盖率 f', min: 0, max: 1, step: 0.01, value: 0.5, format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { st.f = v; updC(); } });
          function updC() {
            const Re = st.R0 * (1 - st.f * st.VE);
            rC.re.set(Re.toFixed(3) + (Re < 1 ? '　< 1：传播被阻断' : '　≥ 1：仍可持续传播'));
            const need = (1 - 1 / st.R0) / st.VE;
            rC.f.set(need > 1 ? `${(100 * need).toFixed(0)}% → 无解（单靠接种做不到）` : (100 * need).toFixed(1) + '%');
          }
          const ansC = H.answer({
            label: '$R_0=3$、$\\mathrm{VE}=0.95$ 时阻断传播所需的最低覆盖率（百分数，容差 ±4 个百分点）', unit: '%', placeholder: '例如 70',
            check(v) {
              const tru = 100 * (1 - 1 / 3) / 0.95;
              if (v > 0 && v < 1.2) return { ok: false, msg: '请用百分数（例如 70，不是 0.70）。' };
              if (Math.abs(v - 66.7) < 2.5) return { ok: false, msg: '66.7% 是 $1-1/R_0$，还要除以 VE（疫苗不是 100% 有效）。' };
              if (Math.abs(v - tru) <= 4) return { ok: true, msg: `对：$f\\gt\\frac{1}{0.95}(1-\\frac13)=70.2\\%$。把 VE 拨到 0.5 看看会发生什么——$f$ 超过 1，<b>无解</b>：单靠接种无法阻断传播。` };
              return { ok: false, msg: '不对。$R_e=R_0(1-f\\,\\mathrm{VE})\\lt1$ 解出 $f$。' };
            },
            onOk() { S.c = true; finish(); },
          });
          secC.append(h.el('h4', { text: 'C. 覆盖率' }), h.el('div', { class: 'lab-controls' }, [sR0.el, sVE.el, sF.el]), roC, ansC.el);

          function finish() {
            if (S.a && S.b && S.c) api.done(`<b>从数字到方案。</b>每天 $10^{10}$ 次复制 × 每碱基 $3.4\\times10^{-5}$ 的突变率，意味着任何单个耐药位点每天产生几十万个突变体——<b>三药联合不是经验堆砌，是概率乘积算出来的</b>（$m\\ge(\\ln N-\\ln\\epsilon)/\\ln(1/\\mu)\\approx2.7$）。1996 年起 HAART 成为标准，艾滋病死亡率在一年内下降一半以上。
              另一侧：归因分数约 94% 的因果强度，加上整合破坏 <i>E2</i>、E6 降解 p53、E7 灭活 Rb 的机制，使<b>靠疫苗预防一种癌症</b>成为可能。2006 年 HPV 疫苗获批（L1 衣壳蛋白自组装的病毒样颗粒，不含病毒 DNA）；瑞典约 170 万人的队列显示 17 岁前接种者宫颈癌风险下降约 88%。WHO 2020 年定下 90–70–90 的消除目标。
              2022 年全球仍有约 66 万宫颈癌新发、约 35 万死亡，绝大多数在筛查与接种覆盖不足的地区——这已经是一个分配问题，不是科学问题。`);
          }
          body.append(secA, secB, secC);
          api.typeset(body);
          updA(); updC();
          return { destroy() {} };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
