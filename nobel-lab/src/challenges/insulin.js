/* 胰岛素 — 挑战版（Nobel Medicine 1923: Banting & Macleod, the discovery of insulin）
 * 读者自己做三件事：
 *  (1) 第一关：用四种原料 × 溶剂组合找出"三十年提不出来"的原因，并从时间序列量出活性在冷盐水匀浆里的半衰期；
 *  (2) 第二关：用兔的血糖终点做平行线生物检定，测出未知批号相对标准品的效价 λ，并弄清终点为何要取在曲线中段；
 *  (3) 第三关：用酒精分级沉淀把比活性提上去（Collip 1922），并从溶解度直线算出有效成分开始沉淀的浓度。
 *
 * 模型（示意，用于让规律可读；真实数据见 Banting 诺奖演讲与 Collip, J. Biol. Chem. 55, 40 (1923)）：
 *  活性 A(prep, c, t) = islet(prep) · rec(c) · exp(−(kH + kdig·acinar(prep)·Eact(c))·t)
 *    Eact(c) = 1/(1+e^{(c−24)/4})  腺泡蛋白酶在酸性酒精中残留的活性比例
 *    rec(c)  静态回收率：低浓度溶出不全、高浓度有效成分自己也沉淀出来（与第三关同一个物理）
 *    kdig = 1.4 /min（E = 1 时 t½ = ln2/1.4 ≈ 0.50 min = 30 s），kH = 0.002 /min（有效成分自身降解）
 *  检定 G_min = G0 − ΔGmax·(aD)^n/(1+(aD)^n)，G0 = 0.118 %，ΔGmax = 0.095 %，n = 1.8
 *    兔间敏感性：log10 a_eff = log10 a + N(0, s)，s = 0.18（真实的兔间差异就是这个量级）
 *    终点 0.045 %（Macleod 诺奖演讲记录的抽搐阈）对应 (aD)* = 1.947
 *  沉淀 log10 S_i(c) = a_i − b_i c（S 以 mg/mL，c 为体积分数）
 * 动物实验按史实叙述：当年的效价标定确实以兔的严重低血糖为终点，现代药典已改用体外细胞法。
 */
(() => {
  /* ---------- 共用小工具 ---------- */
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gaussOf = (rnd) => () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };
  const sigm = (x) => 1 / (1 + Math.exp(-x));

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const lis = () => fn();
    if (mq) mq.addEventListener ? mq.addEventListener('change', lis) : mq.addListener(lis);
    return () => { mo.disconnect(); if (mq) (mq.removeEventListener ? mq.removeEventListener('change', lis) : mq.removeListener(lis)); };
  }
  function injectStyle() {
    if (document.getElementById('st-insulin')) return;
    const s = document.createElement('style'); s.id = 'st-insulin';
    s.textContent = `
.ins-tab{max-height:216px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.ins-tab table{width:100%}
.ins-tab th{position:sticky;top:0;background:var(--panel);z-index:1}
.ins-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.ins-leg i{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.ins-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.ins-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.ins-sec[hidden]{display:none}
.ins-sec h4{margin:0;font-size:14px}
.ins-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.ins-big{font-family:var(--mono-font,monospace);font-size:15px;color:var(--fg)}
.ins-big b{font-size:19px}
.ins-steps{display:grid;gap:4px;font-family:var(--mono-font,monospace);font-size:12.5px}
.ins-steps div{display:flex;gap:10px;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:3px}
.dtable td.ins-l,.dtable th.ins-l{text-align:left}`;
    document.head.append(s);
  }
  const line = (g, A, xs, ys, color, w = 2, dash = null) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
  };
  const legend = (items) => H.el('div', { class: 'ins-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  /* ================= 第一关的模型：提取 ================= */
  const PREP = {
    normal:  { zh: '正常成年牛胰腺', acinar: 1.0,   islet: 1.00 },
    ligated: { zh: '结扎胰管 7 周的狗胰腺', acinar: 0.012, islet: 0.90 },
    fetal:   { zh: '胎牛胰腺', acinar: 0.010, islet: 0.80 },
  };
  const KDIG = 1.4, KH = 0.002;                       // /min
  const Eact = (c) => 1 / (1 + Math.exp((c - 24) / 4)); // 蛋白酶残留活性（c = 酒精体积百分数）
  const rec = (c) => 0.9 * (1 - 0.85 * sigm((c - 78) / 7)) * (0.55 + 0.45 * sigm((c - 15) / 8));
  const kLoss = (prep, c) => KH + KDIG * PREP[prep].acinar * Eact(c);
  const activity = (prep, c, t) => PREP[prep].islet * rec(c) * Math.exp(-kLoss(prep, c) * t);
  const protease = (prep, c) => PREP[prep].acinar * Eact(c);

  /* ================= 第二关的模型：生物检定 ================= */
  const G0 = 0.118, DGMAX = 0.095, HILL = 1.8, S_RAB = 0.18, GEND = 0.045;
  const ADSTAR = ((G0 - GEND) / DGMAX / (1 - (G0 - GEND) / DGMAX)) ** (1 / HILL); // ≈ 1.947
  const nadir = (aD) => G0 - DGMAX * (aD ** HILL) / (1 + aD ** HILL);
  const dStar = (a) => ADSTAR / a;                    // 达到终点所需剂量
  const LAM = 2.6;                                    // 未知批号的真实相对效价

  /* ================= 第三关的模型：分级沉淀 ================= */
  const SPEC = {
    H:  { zh: '有效成分', a: 0.0, b: 2.0, tok: '--accent' },
    P1: { zh: '杂蛋白 A', a: 1.3, b: 4.0, tok: '--s2' },
    P2: { zh: '杂蛋白 B', a: 0.8, b: 2.6, tok: '--s4' },
    P3: { zh: '盐与小肽', a: 1.8, b: 0.6, tok: '--s3' },
  };
  const KEYS = ['H', 'P1', 'P2', 'P3'];
  const Ssol = (k, c) => 10 ** (SPEC[k].a - SPEC[k].b * c);   // mg/mL
  const CRUDE = { H: 0.05, P1: 12, P2: 4, P3: 6, V: 1 };
  const totProt = (s) => KEYS.reduce((a, k) => a + s[k], 0);
  const purity = (s) => s.H / Math.max(1e-12, totProt(s));
  const fracStep = (s, c, keep) => {
    const o = { V: s.V };
    for (const k of KEYS) { const sol = Math.min(s[k], Ssol(k, c)); o[k] = keep === 'sup' ? sol : s[k] - sol; }
    return o;
  };
  const concentrate = (s, f) => { const o = { V: s.V / f }; for (const k of KEYS) o[k] = s[k] * f; return o; };
  const CRUDE_PUR = purity(CRUDE);
  const H_PPT_C = -Math.log10(CRUDE.H) / SPEC.H.b;   // 0.651 → 65%

  CHALLENGES.insulin = {
    title: '从胰腺里取出一样东西',
    _m: { activity, protease, nadir, dStar, fracStep, purity, H_PPT_C, ADSTAR },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color;

      /* ===================== 第一关 ===================== */
      const stage1 = {
        title: '三十年都提不出来',
        task: `<p>多伦多，1921 年夏。切掉狗的胰腺会得糖尿病（von Mering 与 Minkowski，1889），把切下的一小块移植到皮下，症状又暂时缓解——所以胰腺里应该有一种进入血液、调节血糖的物质。可是从 1890 年代起，几乎所有人用同一套办法都失败了：取新鲜胰腺，研碎，用冰冷的生理盐水浸出，过滤，拿滤液去做试验，<b>几乎测不到活性</b>。到 1920 年，主流看法已经倾向于"这种物质可能并不存在"。</p>
          <p>你手上有四样东西可以变：<b>原料</b>（正常成年牛胰腺；结扎胰管 7 周后腺泡已经萎缩、胰岛存留的狗胰腺；腺泡尚未发育的胎牛胰腺）、<b>浸出溶剂</b>（冰盐水，或微酸性酒精，浓度可调 0–95%）、<b>浸出时间</b>，以及两个独立的测量：滤液的<b>活性</b>（在标准试验里测出的相对活性，正常胰腺 + 理想条件记为 1.00）和滤液的<b>蛋白酶活性</b>（酪蛋白消化试验，与活性测量完全独立）。</p>
          <p><b>任务</b>：先把这件事做成一个可以回答的问题。至少记录 6 次不同条件的结果，其中必须有"正常胰腺 + 冰盐水"的<b>一组不同浸出时间</b>（下面的时间滑块可以短到 10 秒）。从那组时间序列里量出活性在冷盐水匀浆中的<b>半衰期</b>，再判断究竟是什么在起破坏作用。</p>`,
        hints: [
          '先做一次"正常胰腺 + 冰盐水 + 30 分钟"，再做一次同样的组合但只浸 10 秒。两个数差多少？如果活性在短时间里是有的，那它不是"不存在"，而是<b>在消失</b>。',
          '固定原料和溶剂只变时间，活性应当按 $A(t)=A_0e^{-kt}$ 走。在半对数坐标里取两点：$k=\\dfrac{\\ln(A_1/A_2)}{t_2-t_1}$，$t_{1/2}=\\ln 2/k$。注意时间单位是分钟，而这个半衰期<b>小于一分钟</b>。',
          '半衰期约 0.5 分钟（30 秒）。再看蛋白酶活性那一栏：它在正常胰腺的盐水匀浆里最高，在结扎胰管或胎牛胰腺里几乎为零，在 40% 以上的酸性酒精里也几乎为零——而这三种情况下活性都保住了。',
        ],
        answer: `活性在冷盐水匀浆里的半衰期约 <b>0.5 min（30 秒）</b>，即 $k\\approx1.4\\ \\mathrm{min^{-1}}$。一次研磨–浸出–过滤要几十分钟，剩余比例 $e^{-kt}$ 早已小到测不出来——所以"几乎没有活性"是必然的，不是运气问题。
          <p>破坏者是<b>腺泡组织的消化酶</b>。胰腺把两种互不相容的功能装在同一个器官里：腺泡细胞造胰蛋白酶原等消化酶，胰岛细胞分泌这种蛋白质激素。一研碎，酶原被激活，激素作为蛋白质被自己的器官消化掉。"温和地用生理盐水浸出"恰恰是最糟的做法，因为它完整保全了酶的活性。</p>
          <p>三条绕开的路都能在表格里看到：<b>让腺泡先消失</b>（结扎胰管 7 周，或取腺泡尚未发育的胎牛胰腺——班廷 1920 年 10 月读到 Barron 的病例后写下的正是第一条）；<b>让酶失活</b>（微酸性酒精，班廷诺奖演讲记录的浓度是 40%–60%）；两者可以叠加。酒精浓度还有上限：到 80% 以上，有效成分自己也开始沉淀出来，回收率反而掉下去——这个现象在第三关会被反过来利用。</p>`,
        build(body, api) {
          const S = { prep: 'normal', solv: 'saline', c: 50, t: 30, rows: [], ansOK: false, quizOK: false };
          const curC = () => (S.solv === 'saline' ? 0 : S.c);

          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.52, minH: 200, maxH: 280 });
          plots.append(legend([['你的记录点（当前条件）', col('--fg')], ['其它条件的记录点', col('--muted')], ['同条件的拟合曲线', col('--accent'), 1], ['蛋白酶活性（右侧竖条）', col('--warn')]]));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });

          const cPrep = h.choice({ label: '原料', value: 'normal',
            options: Object.entries(PREP).map(([k, v]) => ({ value: k, label: v.zh })),
            onChange: (v) => { S.prep = v; info(); draw(); } });
          const cSolv = h.choice({ label: '浸出溶剂', value: 'saline',
            options: [{ value: 'saline', label: '冰冷生理盐水' }, { value: 'alc', label: '微酸性酒精' }],
            onChange: (v) => { S.solv = v; sC.el.style.display = v === 'alc' ? '' : 'none'; info(); draw(); } });
          const sC = h.slider({ label: '酒精浓度（体积百分数）', min: 0, max: 95, step: 5, value: 50,
            format: (v) => v + '%', onInput: (v) => { S.c = v; info(); draw(); } });
          sC.el.style.display = 'none';
          const sT = h.slider({ label: '浸出时间（对数刻度）', min: -2.2, max: 2.1, step: 0.02, value: Math.log10(30),
            format: (v) => { const m = 10 ** v; return m < 1 ? (m * 60).toFixed(0) + ' s' : m.toFixed(m < 10 ? 1 : 0) + ' min'; },
            onInput: (v) => { S.t = 10 ** v; info(); draw(); } });
          const bGo = h.button({ label: '浸出、过滤、测量', kind: 'primary', onClick: record });
          const bClr = h.button({ label: '清空表格', onClick: () => { S.rows = []; fill(); draw(); } });
          controls.append(cPrep.el, cSolv.el, sC.el, sT.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bGo, bClr])]));

          const R = {
            s: h.readout('当前条件'),
            a: h.readout('滤液活性（相对）'),
            p: h.readout('滤液蛋白酶活性'),
            n: h.readout('已记录'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));

          const tbody = h.el('tbody');
          const tab = h.el('div', { class: 'ins-tab dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, [['原料', 'ins-l'], ['溶剂', 'ins-l'], ['时间 (min)', ''], ['活性', ''], ['蛋白酶活性', '']]
              .map(([t, c]) => h.el('th', { class: c, text: t })))]), tbody])]);

          function info() {
            const c = curC();
            R.s.set(`${PREP[S.prep].zh}　${S.solv === 'saline' ? '盐水' : c + '% 酸性酒精'}　${S.t < 1 ? (S.t * 60).toFixed(0) + ' s' : S.t.toFixed(1) + ' min'}`);
            const seen = S.rows.find((r) => r.prep === S.prep && r.c === c && Math.abs(r.t - S.t) < 1e-9);
            R.a.set(seen ? `测得 ${fmtA(seen.a)}` : '按「浸出、过滤、测量」');
            R.p.set(protease(S.prep, c).toFixed(3) + '（1.00 = 正常胰腺盐水匀浆）');
          }
          const LOD = 5e-4;   // 检出限：低于此值只能说"测不出"
          const fmtA = (v) => (v < LOD ? `< ${sci(LOD, 0)}（测不出）` : v >= 0.001 ? v.toFixed(4) : sci(v));
          function record() {
            const c = curC(), tru = activity(S.prep, c, S.t);
            const rnd = mul32(Math.round(S.t * 1000) * 7919 + c * 104729 + S.prep.length * 31);
            const g = gaussOf(rnd);
            const meas = Math.max(0, tru * (1 + 0.04 * g()) + 1.2e-4 * g());  // ±4% 读数噪声 + 本底
            S.rows.push({ prep: S.prep, solv: S.solv, c, t: S.t, a: meas, p: protease(S.prep, c) });
            R.a.set(`测得 ${fmtA(meas)}`);
            fill(); draw();
          }
          function fill() {
            tbody.textContent = '';
            S.rows.forEach((r) => tbody.append(h.el('tr', {}, [
              h.el('td', { class: 'ins-l', text: PREP[r.prep].zh.replace('结扎胰管 7 周的狗胰腺', '结扎胰管 7 周') }),
              h.el('td', { class: 'ins-l', text: r.solv === 'saline' ? '盐水' : r.c + '% 酒精' }),
              h.el('td', { text: r.t < 1 ? (r.t * 60).toFixed(0) + ' s' : r.t.toFixed(1) }),
              h.el('td', { text: fmtA(r.a) }),
              h.el('td', { text: r.p.toFixed(3) }),
            ])));
            const kin = S.rows.filter((r) => r.prep === 'normal' && r.solv === 'saline');
            R.n.set(`${S.rows.length} 条（正常胰腺 + 盐水的时间点 ${kin.length} 个）`);
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h, c = curC();
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: Math.log10(1 / 60), x1: Math.log10(120), y0: 1e-5, y1: 1.4, logY: true,
              pad: { l: 52, r: 14, t: 14, b: 34 },
              xTicks: [1 / 60, 10 / 60, 1, 10, 120].map(Math.log10), yTicks: [1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1],
              fmtX: (v) => { const m = 10 ** v; return m < 1 ? (m * 60).toFixed(0) + 's' : m.toFixed(0) + 'm'; },
              fmtY: (v) => '10' + sup(Math.round(Math.log10(v))), xLabel: '浸出时间（对数）', yLabel: '活性（对数）' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 只有当前条件已经取到 ≥2 个时间点时，才把一条拟合曲线画出来（否则不剧透）
            const mine = S.rows.filter((r) => r.prep === S.prep && r.c === c);
            if (mine.length >= 2) {
              const xs = [], ys = [], LX0 = Math.log10(1 / 60), LX1 = Math.log10(120);
              for (let i = 0; i <= 160; i++) { const lt = LX0 + (LX1 - LX0) * i / 160; xs.push(lt); ys.push(Math.max(1e-9, activity(S.prep, c, 10 ** lt))); }
              line(g, A, xs, ys, col('--accent'), 2, [6, 4]);
            }
            // 记录点
            S.rows.forEach((r) => {
              const same = r.prep === S.prep && ((r.solv === 'saline' && S.solv === 'saline') || (r.solv === 'alc' && S.solv === 'alc' && r.c === S.c));
              g.fillStyle = col(same ? '--fg' : '--muted'); g.globalAlpha = same ? 1 : 0.45;
              g.beginPath(); g.arc(A.X(Math.log10(r.t)), A.Y(Math.max(1e-5, r.a)), same ? 4 : 3, 0, 7); g.fill(); g.globalAlpha = 1;
            });
            // 当前游标
            g.strokeStyle = col('--line'); g.lineWidth = 1.5; g.setLineDash([3, 3]);
            g.beginPath(); g.moveTo(A.X(Math.log10(S.t)), A.p.t); g.lineTo(A.X(Math.log10(S.t)), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            g.restore();
            // 蛋白酶活性条
            const pv = protease(S.prep, c);
            g.fillStyle = col('--warn'); g.globalAlpha = 0.8;
            const bw = Math.max(2, A.iw * 0.06);
            g.fillRect(A.p.l + A.iw - bw - 2, A.p.t + A.ih * (1 - Math.min(1, pv)), bw, A.ih * Math.min(1, pv));
            g.globalAlpha = 1;
            g.fillStyle = col('--warn'); g.font = '10px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
            g.fillText('蛋白酶 ' + pv.toFixed(2), A.p.l + A.iw - bw - 5, A.p.t + 2);
          }

          const sec = h.el('div', { class: 'ins-sec' });
          const ans = H.answer({
            label: '正常胰腺 + 冰盐水时，活性的半衰期 $t_{1/2}$ = ?（分钟，容差 ±40%）', unit: 'min', placeholder: '例如 0.5',
            check(v) {
              const kin = S.rows.filter((r) => r.prep === 'normal' && r.solv === 'saline');
              if (S.rows.length < 6) return { ok: false, msg: `先把条件扫够：目前 ${S.rows.length}/6 条记录。` };
              if (new Set(kin.map((r) => r.t.toFixed(3))).size < 3) return { ok: false, msg: `固定"正常胰腺 + 盐水"，只变时间，至少取 3 个不同时间点（现在 ${new Set(kin.map((r) => r.t.toFixed(3))).size} 个）。` };
              const tru = Math.LN2 / kLoss('normal', 0);
              if (Math.abs(v - tru * 60) / (tru * 60) < 0.4) return { ok: false, msg: '单位是<b>分钟</b>，你给的像是秒。' };
              if (Math.abs(v - tru) / tru <= 0.4) return { ok: true, msg: `对。$t_{1/2}\\approx0.5$ min，即 $k\\approx1.4\\ \\mathrm{min^{-1}}$。浸 30 分钟只剩 $e^{-42}$——这就是三十年"测不到"的来历。` };
              if (v > 5) return { ok: false, msg: '太长了。看看 10 秒和 1 分钟这两个点，活性已经掉了多少？' };
              return { ok: false, msg: '不对。取两个时间点，$k=\\ln(A_1/A_2)/(t_2-t_1)$，再 $t_{1/2}=\\ln2/k$。' };
            },
            onOk() { S.ansOK = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
          });
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '把全部记录放在一起，哪一种解释同时说得通："盐水 + 正常胰腺几乎无活性"、"盐水 + 结扎胰管或胎牛胰腺有活性"、"40%–60% 酸性酒精 + 正常胰腺也有活性"、"80% 以上酒精活性反而下降"？',
            options: [
              { label: '这种物质不耐冷，盐水温度太低', ok: false, why: '盐水和酒精实验都在同样的低温下做；而且结扎胰管的胰腺在同样的冰盐水里活性保住了。' },
              { label: '腺泡组织的消化酶把它消化掉了；去掉腺泡或让酶失活都能保住它，但酒精太浓时它自己会沉淀', ok: true,
                why: '对。这正好解释四条观察：蛋白酶活性那一栏与活性损失一一对应。班廷最初的方案是结扎胰管让腺泡萎缩，后来发现微酸性酒精可以直接让酶失活，原料才从"做过手术的狗"换成屠宰场的牛胰腺。' },
              { label: '只有胰岛细胞才产生它，而正常胰腺里胰岛太少，被稀释了', ok: false, why: '稀释是线性的，不会让活性随时间按指数掉到 $10^{-5}$ 以下；而且胎牛胰腺的胰岛比例并不比成年牛高那么多。' },
              { label: '酒精本身就是这种物质的来源，所以只有用酒精才测得到', ok: false, why: '结扎胰管的胰腺用纯盐水也测得到活性，酒精里也测不出任何不加胰腺的活性。' },
            ],
            onOk() { S.quizOK = true; finish(); },
          }).el);
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>障碍，而不是杂质。</b>胰腺把消化酶和这种激素装在同一个器官里，一研碎，激素就被自己的酶消化掉——半衰期以秒计。
              班廷 1920 年 10 月读到 Moses Barron 关于胰管结石的病例后写下的方案是<b>结扎胰管</b>（腺泡萎缩、胰岛存留）；1921 年 11 月他与 Best 又发现<b>微酸性酒精</b>（40%–60%）可以直接让酶失活，于是原料从"等七周的狗"变成了屠宰场的牛胰腺，实验才有了工业可行性。下一关的问题是：怎样保证今天这一瓶和上周那一瓶一样强。`);
          }
          sec.append(h.el('h4', { text: '读出速率' }), ans.el, quizBox);
          body.append(plots, controls, readout, tab, sec);
          api.typeset(body);
          info(); fill(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ===================== 第二关 ===================== */
      const stage2 = {
        title: '给看不见的东西定个单位',
        task: `<p>1922 年。提取物有效了，新的问题冒出来：它是什么，不知道；分子式，不知道；连能不能称出重量都不知道（结晶品要到 1926 年才做出来）。可是临床和生产都需要回答一个问题：<b>这一瓶比上一瓶强多少？</b></p>
          <p>你手里有两样东西：一瓶<b>标准品</b>（约定其效价为 1.00），一瓶<b>未知批号</b>。可用的测量只有生理效应：给禁食 24 小时、体重约 2 kg 的兔注射一定体积的制剂，测血糖的最低点。兔的正常血糖约 0.118%；剂量足够大时血糖会降到 <b>0.045%</b> 附近并出现低血糖抽搐，这是一个陡峭、可重复的终点（Macleod 在诺奖演讲中记录的就是这个数）。麻烦在于<b>兔与兔之间的敏感性差异很大</b>，同样的剂量在不同兔身上效果能差几成。</p>
          <p><b>任务</b>：两种制剂各做足试验（每种至少 6 只兔），把血糖最低点对 $\\log_{10}$ 剂量画出来，<b>测出未知批号相对标准品的效价 $\\lambda$</b>。然后回答：终点为什么要取在 0.045% 而不是"降到尽可能低"。</p>
          <p class="ins-note">史实说明：当年的效价标定确实以兔的严重低血糖为终点，一个批号要消耗大量动物。现代药典（USP &lt;121&gt;）已允许用体外细胞法替代兔血糖试验，这正是下面第三个读数要说明的事。</p>`,
        hints: [
          '先各做一只，剂量都取 2.0 mL。哪一瓶的血糖降得更深？更强的那一瓶，达到同样效应所需的<b>剂量更小</b>。',
          '把两种制剂的点画在同一张"效应 – $\\log_{10}$ 剂量"图上，它们应当是两条<b>平行</b>的曲线，只在水平方向错开。错开的距离就是 $\\log_{10}\\lambda$：因为效应只通过乘积 $aD$ 起作用，$\\Delta G(D;\\lambda a)=\\Delta G(\\lambda D;a)$。下方读数会给出每种制剂达到终点所需的剂量 $D^\\ast$。',
          '$\\lambda = D^\\ast_{\\text{标准}}/D^\\ast_{\\text{未知}}$（注意是<b>反比</b>：越强的制剂所需剂量越小）。真值在 2.5 左右；兔数少时你的估计会偏，多做几只再算。',
        ],
        answer: `$\\lambda = D^\\ast_{\\text{标准}}/D^\\ast_{\\text{未知}} \\approx 2.6$：未知批号的效价约为标准品的 2.6 倍。
          <p><b>原理（平行线检定）。</b>设效应只通过乘积 $aD$ 起作用，$\\Delta G = \\Delta G_{\\max}\\dfrac{(aD)^n}{1+(aD)^n}$，其中 $a$ 正比于制剂浓度。于是把 $a$ 乘以 $\\lambda$ 与把 $D$ 乘以 $\\lambda$ 完全等价，两条剂量–效应曲线在 $\\log D$ 坐标里平行、水平相距 $\\log\\lambda$。固定一个效应水平，读出两者所需剂量之比，就得到相对效价，而<b>不需要知道这种物质是什么</b>。</p>
          <p><b>终点为什么取在中段。</b>由效应反解剂量，误差放大因子是斜率的倒数：$\\mathrm{SE}(\\log D)=\\sigma/|d\\Delta G/d\\log D|$。对上面的 Hill 函数，斜率在半数效应处最大（本模型约 0.098 %/decade），在 0.045% 终点处仍有约 0.070，而若把终点取到"血糖降到接近零"的平台区，斜率趋于 0、误差爆炸。所以终点要取在曲线陡峭的一段。</p>
          <p>多伦多当年的定义正是这样写的（班廷诺奖演讲）：取体重约 2 kg、禁食 24 小时的兔，使其血糖在 5 小时内从正常水平 0.118% 降到 0.045% 所需材料量的<b>三分之一</b>为 1 个单位。除以 3 是安全边际——把一个用危险终点测出的标尺，缩放成一个可以安全使用的刻度。</p>`,
        build(body, api) {
          const S = { which: 'std', d: 2.0, rows: [], ansOK: false, quizOK: false, seed: 1922 };
          const aOf = (w) => (w === 'std' ? 1 : LAM);
          const NEED = 6;

          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.54, minH: 210, maxH: 300 });
          plots.append(legend([['标准品', col('--s1')], ['未知批号', col('--s2')], ['终点 0.045%', col('--warn'), 1]]));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });

          const cW = h.choice({ label: '这一只兔注射哪一瓶', value: 'std',
            options: [{ value: 'std', label: '标准品' }, { value: 'unk', label: '未知批号' }],
            onChange: (v) => { S.which = v; draw(); } });
          const sD = h.slider({ label: '剂量（对数刻度）', min: -1, max: 0.9, step: 0.01, value: Math.log10(2),
            format: (v) => (10 ** v).toFixed(2) + ' mL', onInput: (v) => { S.d = 10 ** v; draw(); } });
          const bGo = h.button({ label: '做一只兔', kind: 'primary', onClick: () => run(1) });
          const bGo6 = h.button({ label: '按当前剂量做 6 只', onClick: () => run(6) });
          const bSweep = h.button({ label: '两瓶各扫一遍剂量（12 只）', onClick: sweep });
          const bClr = h.button({ label: '清空', onClick: () => { S.rows = []; fill(); draw(); } });
          controls.append(cW.el, sD.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bGo, bGo6, bSweep, bClr])]));

          const R = {
            n: h.readout('已用兔数（标准 / 未知）'),
            ds: h.readout('标准品达到终点的剂量 D*'),
            du: h.readout('未知批号达到终点的剂量 D*'),
            se: h.readout('效价对数的标准误 / 95% 区间'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));

          const tbody = h.el('tbody');
          const tab = h.el('div', { class: 'ins-tab dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, [['制剂', 'ins-l'], ['剂量 (mL)', ''], ['log₁₀D', ''], ['血糖最低点 (%)', ''], ['到达终点', '']]
              .map(([t, c]) => h.el('th', { class: c, text: t })))]), tbody])]);

          function run(k) {
            for (let i = 0; i < k; i++) {
              const rnd = mul32(S.seed++), gs = gaussOf(rnd);
              const a = aOf(S.which) * 10 ** (S_RAB * gs());        // 这只兔的敏感性
              const gmin = Math.max(0.02, nadir(a * S.d) + 0.0015 * gs());  // 读数噪声 ±0.0015%
              S.rows.push({ w: S.which, d: S.d, g: gmin, hit: gmin <= GEND });
            }
            fill(); draw();
          }
          function sweep() {
            const ds = [0.25, 0.5, 1, 2, 4, 7];
            ['std', 'unk'].forEach((w) => ds.forEach((d) => { S.which = w; S.d = d; run(1); }));
            S.which = 'std'; cW.set('std'); S.d = 2; sD.set(Math.log10(2)); fill(); draw();
          }
          /* 由一组 (D, G) 点拟合 a：最小二乘拟合 logit 形式 */
          function fitA(rows) {
            const pts = rows.map((r) => {
              const f = Math.min(0.985, Math.max(0.015, (G0 - r.g) / DGMAX));
              return [Math.log10(r.d), Math.log10(f / (1 - f)) / HILL];   // = log10(aD)
            });
            if (!pts.length) return null;
            // log10 a = mean(log10(aD) − log10 D)
            return 10 ** (pts.reduce((s, p) => s + (p[1] - p[0]), 0) / pts.length);
          }
          const nOf = (w) => S.rows.filter((r) => r.w === w).length;
          function fill() {
            tbody.textContent = '';
            S.rows.forEach((r) => tbody.append(h.el('tr', {}, [
              h.el('td', { class: 'ins-l', text: r.w === 'std' ? '标准品' : '未知批号' }),
              h.el('td', { text: r.d.toFixed(2) }),
              h.el('td', { text: Math.log10(r.d).toFixed(3) }),
              h.el('td', { text: r.g.toFixed(4) }),
              h.el('td', { text: r.hit ? '是' : '—' }),
            ])));
            R.n.set(`${nOf('std')} / ${nOf('unk')}（每种至少 ${NEED}）`);
            const as = fitA(S.rows.filter((r) => r.w === 'std')), au = fitA(S.rows.filter((r) => r.w === 'unk'));
            R.ds.set(as ? (ADSTAR / as).toFixed(3) + ' mL' : '—');
            R.du.set(au ? (ADSTAR / au).toFixed(3) + ' mL' : '—');
            const m = Math.min(nOf('std'), nOf('unk'));
            if (m >= 1) {
              const se = S_RAB * Math.sqrt(1 / Math.max(1, nOf('std')) + 1 / Math.max(1, nOf('unk')));
              R.se.set(`SE = ${se.toFixed(3)}　→ ×/÷ ${(10 ** (1.96 * se)).toFixed(2)}`);
            } else R.se.set('—');
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const X0 = -1.1, X1 = 1.0;
            const A = h.axes(g, W, Hh, { x0: X0, x1: X1, y0: 0.02, y1: 0.125, pad: { l: 54, r: 14, t: 14, b: 34 },
              xTicks: [-1, -0.5, 0, 0.5, 1], yTicks: [0.02, 0.045, 0.06, 0.08, 0.1, 0.118],
              fmtX: (v) => v.toFixed(1), fmtY: (v) => v.toFixed(3), xLabel: 'log₁₀ 剂量 (mL)', yLabel: '血糖最低点 (%)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 终点线
            g.strokeStyle = col('--warn'); g.lineWidth = 1.4; g.setLineDash([5, 4]);
            g.beginPath(); g.moveTo(A.p.l, A.Y(GEND)); g.lineTo(A.p.l + A.iw, A.Y(GEND)); g.stroke(); g.setLineDash([]);
            // 两条理论曲线（兔群平均）
            [['std', '--s1'], ['unk', '--s2']].forEach(([w, tok]) => {
              const xs = [], ys = [];
              for (let i = 0; i <= 140; i++) { const lx = X0 + (X1 - X0) * i / 140; xs.push(lx); ys.push(nadir(aOf(w) * 10 ** lx)); }
              line(g, A, xs, ys, col(tok), 1.6, [4, 3]);
            });
            // 数据点
            S.rows.forEach((r) => {
              g.fillStyle = col(r.w === 'std' ? '--s1' : '--s2');
              g.beginPath(); g.arc(A.X(Math.log10(r.d)), A.Y(Math.min(0.1245, Math.max(0.0205, r.g))), 3.6, 0, 7); g.fill();
            });
            // 游标
            g.strokeStyle = col('--line'); g.lineWidth = 1.5; g.setLineDash([3, 3]);
            g.beginPath(); g.moveTo(A.X(Math.log10(S.d)), A.p.t); g.lineTo(A.X(Math.log10(S.d)), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            g.restore();
            g.fillStyle = col('--warn'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'bottom';
            g.fillText('终点 0.045%', A.p.l + 4, A.Y(GEND) - 3);
          }

          const sec = h.el('div', { class: 'ins-sec' });
          const ans = H.answer({
            label: '未知批号相对标准品的效价 $\\lambda$ = ?（容差 ±20%）', placeholder: '例如 2.5',
            check(v) {
              if (nOf('std') < NEED || nOf('unk') < NEED) return { ok: false, msg: `先把兔数做够：标准 ${nOf('std')}/${NEED}，未知 ${nOf('unk')}/${NEED}。` };
              const as = fitA(S.rows.filter((r) => r.w === 'std')), au = fitA(S.rows.filter((r) => r.w === 'unk'));
              const own = (ADSTAR / as) / (ADSTAR / au);    // = au/as
              if (Math.abs(v - 1 / LAM) / (1 / LAM) < 0.25) return { ok: false, msg: '反了：越强的制剂达到同一效应所需的<b>剂量更小</b>，所以 $\\lambda = D^\\ast_{\\text{标准}}/D^\\ast_{\\text{未知}}\\gt1$。' };
              if (Math.abs(v - LAM) / LAM <= 0.2 || Math.abs(v - own) / own <= 0.12) {
                return { ok: true, msg: `对。你的数据给出 $\\lambda\\approx${own.toFixed(2)}$（真值 2.6）。注意你<b>完全没有</b>用到这种物质的化学性质，只用了"效应只通过 $aD$ 起作用"这一条。` };
              }
              return { ok: false, msg: `不对。读下面两个 $D^\\ast$：${(ADSTAR / as).toFixed(2)} mL 与 ${(ADSTAR / au).toFixed(2)} mL，相除看看。` };
            },
            onOk() { S.ansOK = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
          });
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '为什么要把终点定在 0.045%，而不是"把血糖降到尽可能低"或"刚刚能看出下降"？',
            options: [
              { label: '因为 0.045% 恰好是曲线最平的地方，读数最稳', ok: false, why: '恰好相反。平台区的斜率趋于 0，同样的读数噪声换算成剂量误差会放大到无穷。' },
              { label: '因为由效应反解剂量时误差被斜率的倒数放大，终点要取在曲线陡峭的一段', ok: true,
                why: '对。$\\mathrm{SE}(\\log D)=\\sigma/|d\\Delta G/d\\log D|$。Hill 曲线的斜率在半数效应处最大，0.045% 这个终点仍在陡峭段；而"降到接近零"落在平台上，"刚能看出下降"落在另一端的平台上，两头都不可用。' },
              { label: '因为低血糖抽搐是唯一客观的终点，血糖本身测不准', ok: false, why: '血糖是能测的（表里就是测出来的）。抽搐只是让终点更容易判读，真正的理由是统计精度。' },
              { label: '因为单位必须定义在动物会出现症状的地方，才算"生物学单位"', ok: false, why: '生物学单位只要求一个可重复的效应水平，不要求危险。实际定义里还特意除以 3 作为安全边际。' },
            ],
            onOk() { S.quizOK = true; finish(); },
          }).el);
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>生物学单位与平行线检定。</b>一种你既不知道分子式、也称不出重量的物质，靠"效应只通过浓度与剂量的乘积起作用"就能被定量：两条剂量–效应曲线在半对数坐标里平行，水平位移即 $\\log\\lambda$。
              多伦多当年的定义（班廷诺奖演讲）：体重约 2 kg、禁食 24 小时的兔，血糖在 5 小时内从 0.118% 降到 0.045% 所需量的<b>三分之一</b>为 1 单位。
              代价是精度：$\\mathrm{SE}(\\log_{10}\\hat\\lambda)=s\\sqrt{2/m}$，兔间差异 $s\\approx0.18$，要测到 ±10% 需要上百只兔——每个批号。这就是后来一路发展结晶纯度、紫外吸收、放射免疫测定直到体外细胞法的动力。1926 年有了结晶品之后，这个单位才与质量对应上：1 IU ≈ 34.7 µg，约 6 nmol。`);
          }
          sec.append(h.el('h4', { text: '算效价' }), ans.el, quizBox);
          body.append(plots, controls, readout, tab, sec);
          api.typeset(body);
          fill(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ===================== 第三关 ===================== */
      const stage3 = {
        title: '把它洗干净',
        task: `<p>1922 年 1 月。班廷与 Best 的提取物已经能降血糖，但杂质太多：第一次给人注射（1 月 11 日，Leonard Thompson，14 岁）血糖只从 0.440% 降到 0.320%，酮体照旧，一处注射部位还形成了无菌性脓肿——被判为失败。生化学家 James Collip 接手纯化。1 月 19 日夜里他找到了办法。</p>
          <p>你手上是粗提液 1 mL，含<b>有效成分 0.05 mg</b> 和三类杂质共 22 mg。可用的唯一手段是<b>改变酒精浓度让东西沉淀出来</b>，然后离心，保留上清或保留沉淀。各组分在水–乙醇体系里的溶解度近似服从 $\\log_{10}S_i(c)=a_i-b_ic$（下图就是这四条直线，横虚线是各组分当前的浓度；<b>直线落到虚线以下，该组分就开始沉淀</b>）。你还可以把溶液浓缩，把各组分浓度同时提高。</p>
          <p><b>任务一</b>：从图上算出有效成分<b>开始沉淀</b>的酒精浓度。<b>任务二</b>：设计步骤，把<b>比活性</b>（有效成分占总蛋白的比例）提高到粗提液的 <b>40 倍以上</b>，同时保留至少 <b>50%</b> 的有效成分。步骤数不限，但每一步都要选浓度和"留上清 / 留沉淀"。</p>`,
        hints: [
          '先看哪条直线更陡。$b$ 越大，溶解度随酒精浓度下降得越快，也就越早沉淀。谁最早沉？谁最晚沉？',
          '两步就够：先在某个中等浓度下让<b>杂蛋白沉掉而有效成分还留在溶液里</b>（留上清），再把浓度推高让<b>有效成分自己沉下来</b>（留沉淀）。第二步会把那些根本不沉的东西（盐与小肽）整个丢掉——它们留在上清里。',
          '第一步取 55%–70% 留上清，第二步取 92% 左右留沉淀。Collip 当年发现有效成分要到<b>90% 以上</b>才沉淀；他没有把配方完整记录下来，此后一度连他自己也难以复现。',
        ],
        answer: `<b>任务一：约 65%。</b>有效成分的溶解度 $\\log_{10}S_H=0-2.0c$（$S$ 以 mg/mL，$c$ 为体积分数），当前浓度 $C_H=0.05$ mg/mL。开始沉淀的条件是 $S_H(c)=C_H$：
          $$-2.0c=\\log_{10}0.05=-1.301\\ \\Longrightarrow\\ c=0.651 .$$
          <p><b>任务二：两步分级沉淀。</b>（1）$c\\approx0.55$–0.70，留<b>上清</b>：杂蛋白 A（$b=4.0$，最陡）和 B（$b=2.6$）基本沉掉，有效成分还溶着；（2）$c\\approx0.92$，留<b>沉淀</b>：有效成分沉下来，而"盐与小肽"（$b=0.6$，几乎不沉）被整瓶丢在上清里。两步后比活性约提高 40–90 倍，回收率 50%–70%。</p>
          <p><b>为什么两步就够（命题）。</b>令 $f_i(c)=\\log_{10}C_i-\\log_{10}S_i(c)=\\log_{10}(C_i/S_i(0))+b_ic$，沉淀条件是 $f_i(c)\\gt0$。两条直线斜率不同，斜率大的先穿零。若杂质 $P$ 的零点严格小于目标物 $H$ 的零点，则存在 $c_1\\lt c_2$ 使 $c_1$ 处 $P$ 沉而 $H$ 不沉、$c_2$ 处 $H$ 沉。∎ 对"盐与小肽"这类 $b$ 很小、零点在 $c=1$ 之外的组分，第二步的上清把它们一次清掉。</p>
          <p><b>纯度与回收率此消彼长。</b>$n$ 步后纯度富集 $=\\prod_j (y_j/q_j)$、总回收率 $=\\prod_j y_j$，其中 $y_j,q_j$ 是第 $j$ 步目标物与杂质的保留比例。每多一步都在用产量换纯度，这是所有制备生化的基本张力。</p>`,
        build(body, api) {
          const S = { s: Object.assign({}, CRUDE), hist: [], c: 0.55, keep: 'sup', ansOK: false, goalOK: false };
          const H0 = CRUDE.H * CRUDE.V;

          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.56, minH: 220, maxH: 320 });
          plots.append(legend(KEYS.map((k) => [SPEC[k].zh + `（b=${SPEC[k].b}）`, col(SPEC[k].tok)])));
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });
          const steps = h.el('div', { class: 'ins-steps' });
          const meter = h.el('div', { class: 'ins-big', 'aria-live': 'polite' });

          const sC = h.slider({ label: '酒精浓度', min: 0, max: 0.98, step: 0.01, value: 0.55,
            format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { S.c = v; draw(); info(); } });
          const cK = h.choice({ label: '离心后保留', value: 'sup',
            options: [{ value: 'sup', label: '上清' }, { value: 'ppt', label: '沉淀（重新溶解）' }],
            onChange: (v) => { S.keep = v; info(); } });
          const bStep = h.button({ label: '执行这一步', kind: 'primary', onClick: () => doStep() });
          const bConc = h.button({ label: '浓缩 ×4', onClick: () => { S.s = concentrate(S.s, 4); S.hist.push({ kind: 'conc' }); upd(); } });
          const bUndo = h.button({ label: '重来', onClick: reset });
          controls.append(sC.el, cK.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bStep, bConc, bUndo])]));

          const R = {
            p: h.readout('比活性（相对粗提液）'),
            r: h.readout('有效成分回收率'),
            t: h.readout('总蛋白 / 体积'),
            n: h.readout('这一步会怎样'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));

          function reset() { S.s = Object.assign({}, CRUDE); S.hist = []; upd(); }
          function doStep() {
            const next = fracStep(S.s, S.c, S.keep);
            S.s = next; S.hist.push({ kind: 'step', c: S.c, keep: S.keep });
            upd();
          }
          function info() {
            const n = fracStep(S.s, S.c, S.keep);
            const keepH = S.s.H > 0 ? n.H / S.s.H : 0;
            const keepP = totProt(S.s) - S.s.H > 0 ? (totProt(n) - n.H) / (totProt(S.s) - S.s.H) : 0;
            R.n.set(`留下有效成分 ${(100 * keepH).toFixed(0)}%，杂质 ${(100 * keepP).toFixed(0)}%　→ 富集 ×${(keepP > 1e-9 ? keepH / keepP : 99).toFixed(1)}`);
          }
          function upd() {
            const pur = purity(S.s), enr = pur / CRUDE_PUR, recov = (S.s.H * S.s.V) / H0;
            R.p.set(`×${enr.toFixed(1)}　（${(100 * pur).toFixed(2)}% 纯度）`);
            R.r.set(`${(100 * recov).toFixed(1)}%`);
            R.t.set(`${totProt(S.s).toFixed(3)} mg/mL × ${S.s.V.toFixed(3)} mL = ${(totProt(S.s) * S.s.V).toFixed(3)} mg`);
            const ok = enr >= 40 && recov >= 0.5;
            meter.innerHTML = `比活性 <b style="color:${enr >= 40 ? 'var(--good)' : 'var(--accent)'}">×${enr.toFixed(1)}</b>（目标 ≥ 40）　回收率 <b style="color:${recov >= 0.5 ? 'var(--good)' : 'var(--warn)'}">${(100 * recov).toFixed(0)}%</b>（目标 ≥ 50%）`;
            steps.textContent = '';
            S.hist.forEach((x, i) => steps.append(h.el('div', {}, [
              h.el('span', { text: `${i + 1}. ` + (x.kind === 'conc' ? '浓缩 ×4' : `${(100 * x.c).toFixed(0)}% 酒精，留${x.keep === 'sup' ? '上清' : '沉淀'}`) }),
            ])));
            if (!S.hist.length) steps.append(h.el('div', {}, [h.el('span', { text: '（还没有步骤：粗提液）' })]));
            if (ok && !S.goalOK) { S.goalOK = true; api.say(`比活性 ×${enr.toFixed(0)}、回收率 ${(100 * recov).toFixed(0)}%——达到目标。再把上面的浓度问题答掉就过关。`, 'good'); finish(); }
            info(); draw();
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 1, y0: 1e-4, y1: 1e2, logY: true, pad: { l: 54, r: 14, t: 14, b: 34 },
              xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1], yTicks: [1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100],
              fmtX: (v) => (100 * v).toFixed(0) + '%', fmtY: (v) => '10' + sup(Math.round(Math.log10(v))),
              xLabel: '酒精浓度（体积分数）', yLabel: '溶解度 S 与浓度 C (mg/mL)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            KEYS.forEach((k) => {
              const xs = [], ys = [];
              for (let i = 0; i <= 100; i++) { const c = i / 100; xs.push(c); ys.push(Ssol(k, c)); }
              line(g, A, xs, ys, col(SPEC[k].tok), 2);
              // 当前浓度的水平虚线
              const cc = Math.max(1e-9, S.s[k]);
              g.strokeStyle = col(SPEC[k].tok); g.lineWidth = 1; g.setLineDash([2, 4]); g.globalAlpha = 0.75;
              g.beginPath(); g.moveTo(A.p.l, A.Y(cc)); g.lineTo(A.p.l + A.iw, A.Y(cc)); g.stroke();
              g.setLineDash([]); g.globalAlpha = 1;
            });
            // 当前酒精浓度游标
            g.strokeStyle = col('--fg'); g.lineWidth = 1.6; g.setLineDash([4, 3]);
            g.beginPath(); g.moveTo(A.X(S.c), A.p.t); g.lineTo(A.X(S.c), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            g.restore();
            // 标签
            g.font = '10.5px ' + col('--mono-font'); g.textBaseline = 'middle';
            KEYS.forEach((k) => {
              const yv = Ssol(k, 0.03);
              if (yv > 1e-4 && yv < 1e2) { g.fillStyle = col(SPEC[k].tok); g.textAlign = 'left'; g.fillText(k, A.p.l + 4, A.Y(yv) - 7); }
            });
            g.fillStyle = col('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
            g.fillText((100 * S.c).toFixed(0) + '%', A.X(S.c), A.p.t + 2);
          }

          const sec = h.el('div', { class: 'ins-sec' });
          const ans = H.answer({
            label: '有效成分开始沉淀的酒精浓度（体积百分数，容差 ±5 个百分点）', unit: '%', placeholder: '例如 60',
            check(v) {
              const tru = 100 * H_PPT_C;
              if (v > 0 && v < 1.2) return { ok: false, msg: '请用百分数（例如 65，不是 0.65）。' };
              if (Math.abs(v - tru) <= 5) return { ok: true, msg: `对。$-2.0c=\\log_{10}0.05=-1.301$，$c=0.651$。注意这只是<b>开始</b>沉淀；要让大部分沉下来还得推到 90% 以上——这正是 Collip 1922 年 1 月 19 日夜里发现的。` };
              if (Math.abs(v - 90) < 6) return { ok: false, msg: '90% 是让<b>大部分</b>沉下来的浓度。问的是刚刚开始沉淀的那一点：溶解度曲线与当前浓度虚线的交点。' };
              if (Math.abs(v - 32.5) < 5) return { ok: false, msg: '这像是把 $\\log_{10}0.05$ 当成了 $-0.65$。$\\log_{10}0.05=-1.301$，再除以 $b_H=2.0$。' };
              return { ok: false, msg: '不对。解 $\\log_{10}S_H(c)=\\log_{10}C_H$，即 $-b_Hc=\\log_{10}0.05$。' };
            },
            onOk() { S.ansOK = true; finish(); },
          });
          function finish() {
            if (S.ansOK && S.goalOK) api.done(`<b>分级沉淀（Collip，1922 年 1 月）。</b>溶解度对酒精浓度的斜率 $b_i$ 不同，就足以把东西分开：先在中等浓度让陡的杂蛋白沉掉而留住目标物，再在 90% 以上把目标物沉下来，顺手丢掉根本不沉的盐与小肽。
              Collip 这样做出的提取物第一次干净到可以反复给人注射：1922 年 1 月 23 日，Leonard Thompson 的血糖从 0.520% 降到 0.120%，糖尿几乎消失、酮体消失。
              代价写在公式里：$n$ 步后富集 $=\\prod y_j/q_j$、回收率 $=\\prod y_j\\lt1$，纯度与产量永远此消彼长。专利由班廷、Best、Collip 持有，以<b>每人 1 美元</b>转让给多伦多大学。`);
          }
          sec.append(h.el('h4', { text: '任务一：算出那个浓度' }), ans.el);
          body.append(plots, sec, controls, meter, readout,
            h.el('div', { class: 'ins-sec' }, [h.el('h4', { text: '任务二：你的步骤' }), steps]));
          api.typeset(body);
          upd();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
