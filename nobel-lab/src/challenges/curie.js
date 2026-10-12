/* 比铀还亮的石头 — 挑战版（Nobel Physics 1903 / Chemistry 1911: Marie & Pierre Curie — radioactivity, polonium, radium）
 * 时代：1898 年巴黎，ESPCI（市立工业物理化学学校）的一间棚屋。仪器：平行板电离室 + Curie 兄弟的压电石英静电计——
 *   往石英片上挂砝码，压电电荷恰好抵消电离电流，静电计指针保持在零；所需砝码重量 ∝ 电流。
 * 第一关数据（相对金属铀的活度 / 铀质量分数）：U 1.00/1.00，U₃O₈ 0.83/0.85，硝酸铀酰 0.46/0.47，
 *   人工合成铜铀云母 0.39/0.48，天然铜铀云母 2.26/0.48，沥青铀矿 3.6/0.70，ThO₂ 0.96/0。
 *   标定：金属铀 2.3×10⁻¹¹ A（Curie 1898, C. R. 126, 1101）；本页约定 I = 砝码 × 10⁻¹² A/g，故金属铀需约 23 g。
 * 第二关：溶解后的沥青铀矿（质量单位 g，示意）：U 600, Pb 30, Bi 15, Cu 15, Ba 40, Ca 50, Fe 80（共 830 g）。
 *   活度单位 = 1 g 金属铀的活度。U 自身 600；"镭族" 1500（跟钡走）；"钋" 400（跟铋走）；其它（锕等，跟铁/氢氧化物走）488。
 *   起始每克活度 ≈ 3.6 × 铀。各操作中每种成分进入"甲"（沉淀/升华物/晶体）的比例见 OPS（简化化学）。
 * 第三关：久期平衡 λ_Ra N_Ra = λ_U N_U → N_Ra/N_U = T_Ra/T_U；质量比再乘 226/238。
 *   1600 / 4.47e9 × 226/238 = 3.40e-7 → 0.34 g Ra / t U。
 */
(() => {
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- stage 1 data ---------- */
  const IU = 2.3, GPERUNIT = 23;  // U metal: 2.3e-11 A ↔ 23 g on the quartz
  const SAMPLES = [
    { id: 'U', name: '金属铀', fu: 1.0, act: 1.0, kind: 'u' },
    { id: 'U3O8', name: 'U₃O₈', fu: 0.85, act: 0.83, kind: 'u' },
    { id: 'nit', name: '硝酸铀酰', fu: 0.47, act: 0.46, kind: 'u' },
    { id: 'syn', name: '人工合成铜铀云母', fu: 0.48, act: 0.39, kind: 'u' },
    { id: 'chal', name: '天然铜铀云母', fu: 0.48, act: 2.26, kind: 'ore' },
    { id: 'pb', name: '沥青铀矿', fu: 0.70, act: 3.6, kind: 'ore' },
    { id: 'Th', name: 'ThO₂', fu: 0, act: 0.96, kind: 'th' },
  ];
  const rnd1 = mul32(1898);
  SAMPLES.forEach((s) => { s.w = +(s.act * GPERUNIT * (1 + 0.03 * (rnd1() - 0.5))).toFixed(2); });

  /* ---------- stage 2 chemistry (simplified) ---------- */
  const EL = ['U', 'Pb', 'Bi', 'Cu', 'Ba', 'Ca', 'Fe'];
  const ELN = { U: '铀', Pb: '铅', Bi: '铋', Cu: '铜', Ba: '钡', Ca: '钙', Fe: '铁' };
  const START = { U: 600, Pb: 30, Bi: 15, Cu: 15, Ba: 40, Ca: 50, Fe: 80, Po: 400, Ra: 1500, X: 488 };
  const OPS = {
    h2s: { name: '通入 H₂S（酸性溶液）', a: '硫化物沉淀', b: '滤液', af: 'sulf', bf: 'sol',
      k: { Pb: 0.97, Bi: 0.98, Cu: 0.98, Po: 0.97 }, d: 0.01 },
    so4: { name: '加稀硫酸', a: '硫酸盐沉淀', b: '滤液', af: 'sulfate', bf: 'sol',
      k: { Ba: 0.98, Ra: 0.98, Pb: 0.95, Ca: 0.3, X: 0.05 }, d: 0.01 },
    sub: { name: '真空加热升华', a: '升华物', b: '残渣', af: 'sulf', bf: 'sulf', need: 'sulf',
      k: { Po: 0.4, Bi: 0.04, Pb: 0.01, Cu: 0.005 }, d: 0 },
    cry: { name: '分级结晶（氯化物）', a: '晶体', b: '母液', af: 'chl', bf: 'chl',
      k: { Ba: 0.5, Ra: 0.95, Ca: 0.05, Pb: 0.2 }, d: 0.1 },
    nh3: { name: '加氨水', a: '氢氧化物沉淀', b: '滤液', af: 'hyd', bf: 'sol',
      k: { Fe: 0.98, U: 0.95, Bi: 0.95, Po: 0.95, X: 0.9, Pb: 0.5, Cu: 0.05, Ba: 0.01, Ca: 0.02, Ra: 0.01 }, d: 0.02 },
  };
  const mass = (c) => EL.reduce((s, e) => s + c[e], 0);
  const actTot = (c) => c.U + c.Po + c.Ra + c.X;
  const spAct = (c) => actTot(c) / Math.max(mass(c), 1e-9);
  const split = (c, op) => {
    const A = {}, B = {};
    for (const k of Object.keys(START)) { const f = op.k[k] ?? op.d; A[k] = c[k] * f; B[k] = c[k] * (1 - f); }
    return [A, B];
  };
  /* stage 3 */
  const T_RA = 1600, T_U = 4.47e9, RA_PER_T = (T_RA / T_U) * (226 / 238) * 1e6;  // g Ra per tonne U ≈ 0.340

  const CSS = `.curc-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.curc-leg i{display:inline-block;width:9px;height:9px;vertical-align:middle;margin-right:5px;border-radius:50%}
.curc-tab{max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.curc-tab table{width:100%}
.curc-tab th{position:sticky;top:0;background:var(--panel);z-index:1}
.curc-q{display:grid;gap:12px}.curc-q[hidden]{display:none}
.curc-tree{display:grid;gap:4px;max-height:430px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px;background:var(--bg)}
.curc-node{display:grid;gap:3px;border:1px solid var(--line);border-radius:6px;padding:5px 7px;background:var(--panel);font-size:12.5px;cursor:pointer;min-width:0}
.curc-node[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
.curc-node[data-used="1"]{opacity:.62}
.curc-nh{display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline;min-width:0}
.curc-nh b{font-family:var(--mono-font,monospace);font-size:11.5px;color:var(--accent)}
.curc-nh span{min-width:0;overflow-wrap:anywhere}
.curc-nm{font-family:var(--mono-font,monospace);color:var(--muted);font-size:11.5px}
.curc-act{font-family:var(--mono-font,monospace);font-size:12px}
.curc-act.hot{color:var(--warn);font-weight:600}
.curc-row{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.curc-row .btn{font-size:12px;padding:2px 8px}
.curc-id{font-size:12px;color:var(--fg);font-family:var(--mono-font,monospace)}
.curc-ops{display:flex;flex-wrap:wrap;gap:4px}
.curc-sel{font-size:13px;color:var(--muted)}
.curc-sel b{color:var(--fg)}
.curc-goal{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px}
.curc-goal span[data-ok="1"]{color:var(--good)}
.curc-note{font-size:12px;color:var(--muted);margin:0;line-height:1.6}`;
  const injectCSS = () => { if (!document.getElementById('st-curie')) document.head.append(H.el('style', { id: 'st-curie', text: CSS })); };
  function onTheme(fn) {
    const mo = new MutationObserver(() => fn());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)'), lis = () => fn();
    mq.addEventListener ? mq.addEventListener('change', lis) : mq.addListener(lis);
    return () => { mo.disconnect(); mq.removeEventListener ? mq.removeEventListener('change', lis) : mq.removeListener(lis); };
  }

  CHALLENGES.curie = {
    title: '比铀还亮的石头',
    _m: { SAMPLES, START, OPS, split, spAct, RA_PER_T },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color, mono = () => col('--mono-font') || 'monospace';

      /* ================= 第一关 ================= */
      const stage1 = {
        title: '用静电计量放射性',
        task: `<p>1898 年初，巴黎。两年前贝克勒尔发现铀盐会自发放出一种能穿透黑纸、让空气导电的"射线"，之后便没人再认真追。
          你决定把它变成<b>可以测量的量</b>：把样品研成粉，铺成同样面积的一层放在电离室的下极板上，加 100 V；
          射线电离空气，两板之间流过一股极弱的电流（$10^{-11}$ A 量级）。</p>
          <p>Pierre 和他哥哥 Jacques 发明的压电石英静电计正好量这种电流：往石英片上挂砝码，石英产生的电荷与电离电流相抵，
          静电计指针就停在零。<b>所需砝码重量 ∝ 电流</b>（本台仪器：$I = $ 砝码 × $10^{-12}$ A/g）。</p>
          <p><b>任务</b>：逐个测量手头的样品（含铀质量分数由化学分析给出），找出决定"射线强度"的到底是什么。
          你还可以把样品加热、或放在强光下照，看看会不会改变读数。</p>`,
        hints: [
          '每测一个样品：调砝码，让指针回到中央，再按"记录读数"。点会画在 电流–含铀量 图上。先测几种纯铀化合物，看它们是不是落在一条过原点的直线上。',
          '加热和强光都不改变读数；化合物形式不同（金属、氧化物、硝酸盐、合成矿物）也没关系——电流只跟样品里有多少铀成正比。接着测天然矿物。',
          '沥青铀矿和天然铜铀云母远远高出那条直线（是"按含铀量该有的"好几倍），而成分完全相同的人工合成铜铀云母却乖乖落在线上。差别只能来自天然矿里混着的别的东西。',
        ],
        answer: `铀化合物的电流严格正比于含铀量，与化学形态、温度、光照无关：放射性是<b>铀原子本身</b>的性质。
          但沥青铀矿（含铀 0.70，电流却是金属铀的 3.6 倍）和天然铜铀云母（含铀 0.48，电流 2.3 倍）远超比例，而人工合成的铜铀云母（同样 0.48）
          只有 0.39——所以天然矿石里含有一种<b>比铀放射性强得多的未知物质</b>。（ThO₂ 也有放射性：钍是第二种放射性元素，Schmidt 与 Curie 同年独立发现。）`,
        build(body, api) {
          const S = { sel: 'U', w: 0, heat: false, light: false, rec: new Map(), q1: false, q2: false };
          const smp = () => SAMPLES.find((s) => s.id === S.sel);
          const cvB = h.canvas(body, { aspect: 0.42, minH: 170, maxH: 240 });
          const ctl = h.el('div', { class: 'lab-controls' });
          const cS = h.choice({ label: '样品', value: S.sel, options: SAMPLES.map((s) => ({ value: s.id, label: s.name })), onChange: (v) => { S.sel = v; info(); drawB(); } });
          const sW = h.slider({ label: '石英上的砝码', min: 0, max: 100, step: 0.1, value: 0, format: (v) => v.toFixed(1) + ' g', onInput: (v) => { S.w = v; drawB(); } });
          const tH = h.toggle({ label: '加热样品（约 200 °C）', onChange: (b) => { S.heat = b; drawB(); } });
          const tL = h.toggle({ label: '强光照射', onChange: (b) => { S.light = b; drawB(); } });
          const bR = h.button({ label: '记录读数', kind: 'primary', onClick: record });
          ctl.append(cS.el, sW.el, h.el('div', {}, [tH.el, tL.el]), h.el('div', {}, [bR]));
          const ro = h.el('div', { class: 'lab-readout' });
          const rF = h.readout('含铀质量分数 w_U（化学分析）'), rN = h.readout('静电计指针');
          ro.append(rF.el, rN.el);
          const tbody = h.el('tbody');
          const tab = h.el('div', { class: 'curc-tab dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, ['样品', 'w_U', '砝码 (g)', 'I (10⁻¹¹ A)', '条件'].map((t) => h.el('th', { text: t })))]), tbody])]);
          const cvP = h.el('div');
          const plot = h.canvas(cvP, { aspect: 0.6, minH: 200, maxH: 320 });
          const leg = h.el('div', { class: 'curc-leg' }, [['铀化合物', '--s1'], ['天然矿物', '--warn'], ['钍化合物', '--s3']].map(([t, c]) => h.el('span', {}, [h.el('i', { style: `background:var(${c})` }), t])));
          const q1box = h.el('div', { class: 'curc-q', hidden: true }), q2box = h.el('div', { class: 'curc-q', hidden: true });
          body.append(ctl, ro, tab, cvP, leg, q1box, q2box);

          const q1 = H.quiz({
            question: '看你测到的铀化合物：电流（放射性的强弱）取决于什么？',
            options: [
              { label: '样品的质量', ok: false, why: '每个样品铺成同样面积的薄层，质量差不多；而且 U₃O₈ 和硝酸铀酰同样一层，读数差近一倍——跟它们的含铀量之比一样。' },
              { label: '铀的含量', ok: true, why: '对。不论金属、氧化物、硝酸盐还是合成矿物，电流都 ∝ 含铀量：射线来自铀<b>原子</b>本身，与它处在什么化合物里无关。' },
              { label: '化合物的形式', ok: false, why: '金属铀、氧化物、硝酸盐的化学键完全不同，点却落在同一条过原点的直线上——化学形态不重要。' },
              { label: '温度和光照', ok: false, why: '你可以试：加热、强光照射，读数都纹丝不动。这跟磷光（需要先照光）完全不同。' },
            ],
            onOk: () => { S.q1 = true; gate(); },
          });
          const q2 = H.quiz({
            question: '沥青铀矿和天然铜铀云母的读数远高于"按含铀量该有的"值，而成分相同的人工合成铜铀云母却没有。这说明什么？',
            options: [
              { label: '矿石里的铀原子比提纯的铀更活跃', ok: false, why: '人工合成铜铀云母里的铀就是普通提纯铀，它乖乖落在直线上；放射性是原子性质，同一种原子不会因为"出身"不同而变强。' },
              { label: '测量误差：矿物颗粒粗、铺层不均匀', ok: false, why: '误差不会大到 3–5 倍，更不会只在天然矿上出现、在同成分的合成矿上消失。' },
              { label: '矿石里含有一种比铀放射性强得多的未知物质', ok: true, why: '对。天然矿与合成矿的唯一区别是天然矿里混着别的东西；既然放射性是原子性质、又已知的元素（除钍外）都没有放射性，那一定是一种<b>未知的新元素</b>，量很少但极其活泼。' },
              { label: '矿石里含有钍', ok: false, why: '钍的活度和铀差不多（ThO₂ ≈ 0.96），而且分析表明这些矿里几乎没有钍——解释不了高出 3–5 倍。' },
            ],
            onOk: () => { S.q2 = true; api.done('<b>放射性是原子的性质</b>（"radioactivité" 这个词正是居里夫人在 1898 年创造的）：铀化合物的强度只取决于含铀量。而天然铀矿"太亮了"——里面藏着比铀强得多的新元素。'); },
          });
          q1box.append(q1.el); q2box.append(q2.el);

          function info() {
            const s = smp(); rF.set(s.kind === 'th' ? '0（钍化合物，不含铀）' : s.fu.toFixed(2));
          }
          const defl = () => { const s = smp(); return Math.max(-1, Math.min(1, (s.w - S.w) / (0.25 * GPERUNIT))); };
          const balanced = () => { const s = smp(); return Math.abs(S.w - s.w) <= Math.max(0.3, 0.03 * s.w); };
          function record() {
            const s = smp();
            if (!balanced()) { api.say(`指针还没回零（${defl() > 0 ? '砝码不够，电离电流还在给静电计充电' : '砝码太多，压电电荷反超'}）。调好砝码再记录。`, 'bad'); return; }
            const cond = [S.heat ? '加热' : '', S.light ? '强光' : ''].filter(Boolean).join('+') || '常温暗处';
            S.rec.set(s.id + '|' + cond, { s, w: S.w, I: S.w / 10, cond });
            if (!api.solved()) api.say(`记下：${s.name}，${cond}，I = ${(S.w / 10).toFixed(2)}×10⁻¹¹ A。`, 'info');
            fill(); drawP(); gate();
          }
          function gate() {
            const ids = new Set([...S.rec.values()].map((r) => r.s.id));
            const nU = ['U', 'U3O8', 'nit', 'syn'].filter((x) => ids.has(x)).length;
            if (nU >= 3 && q1box.hidden) { q1box.hidden = false; api.typeset(q1box); }
            if (S.q1 && ids.has('pb') && ids.has('chal') && q2box.hidden) { q2box.hidden = false; api.typeset(q2box); }
            else if (S.q1 && q2box.hidden && !api.solved()) api.say('现在去测天然矿物：沥青铀矿和天然铜铀云母。', 'info');
          }
          function fill() {
            tbody.textContent = '';
            for (const r of S.rec.values()) tbody.append(h.el('tr', {}, [r.s.name, r.s.kind === 'th' ? '0' : r.s.fu.toFixed(2), r.w.toFixed(1), r.I.toFixed(2), r.cond].map((t) => h.el('td', { text: t }))));
          }
          function drawB() {
            const g = cvB.g, W = cvB.w, Hh = cvB.h, s = smp();
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            g.font = '11px ' + mono(); g.textBaseline = 'middle';
            /* ionisation chamber */
            const px = 10, pw = Math.min(W * 0.46, 260), top = Hh * 0.26, bot = Hh * 0.7;
            g.fillStyle = col('--line'); g.fillRect(px, top - 5, pw, 5); g.fillRect(px, bot, pw, 5);
            g.fillStyle = s.kind === 'ore' ? col('--warn') : s.kind === 'th' ? col('--s3') : col('--s1'); g.globalAlpha = 0.85;
            g.fillRect(px + pw * 0.1, bot - 5, pw * 0.8, 5); g.globalAlpha = 1;
            g.strokeStyle = col('--accent'); g.globalAlpha = 0.6; g.lineWidth = 1;
            const nTr = Math.round(5 * s.act), rr = mul32(s.id.length * 77 + 3);
            for (let i = 0; i < nTr; i++) { const x = px + pw * (0.12 + 0.76 * rr()), y = bot - 8 - (bot - top - 14) * rr(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 8); g.stroke(); }
            g.globalAlpha = 1; g.fillStyle = col('--muted'); g.textAlign = 'left';
            g.fillText('电离室 · 至静电计', px, top - 14); g.fillText('+100 V', px, bot + 16);
            g.fillStyle = col('--fg'); g.textAlign = 'center';
            g.fillText(s.name + (S.heat ? ' · 加热' : '') + (S.light ? ' · 强光' : ''), px + pw / 2, (top + bot) / 2 - 4);
            if (S.heat) { g.fillStyle = col('--warn'); g.fillText('〰〰〰', px + pw / 2, bot + 16); }
            if (S.light) { g.strokeStyle = col('--accent'); g.globalAlpha = 0.5; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(px + pw * 0.2 + i * pw * 0.18, 4); g.lineTo(px + pw * 0.25 + i * pw * 0.18, top - 20); g.stroke(); } g.globalAlpha = 1; }
            /* quartz + weight pan + needle */
            const qx = px + pw + Math.max(30, (W - px - pw) * 0.22), qTop = 14;
            const wh = 10 + Math.min(1, S.w / 100) * 30;
            g.fillStyle = col('--s4'); g.globalAlpha = 0.35; g.fillRect(qx - 4, qTop, 8, Hh * 0.42); g.globalAlpha = 1;
            g.strokeStyle = col('--muted'); g.beginPath(); g.moveTo(qx, qTop + Hh * 0.42); g.lineTo(qx, qTop + Hh * 0.42 + 10); g.stroke();
            g.fillStyle = col('--fg'); g.fillRect(qx - 10, qTop + Hh * 0.42 + 10, 20, Math.max(2, wh * 0.35));
            g.fillStyle = col('--muted'); g.textAlign = 'center';
            g.fillText('石英', qx, qTop + Hh * 0.42 + wh * 0.35 + 22); g.fillText(S.w.toFixed(1) + ' g', qx, qTop + Hh * 0.42 + wh * 0.35 + 36);
            const R = Math.max(30, Math.min(64, (W - qx) / 2 - 14, Hh * 0.45)), cx = Math.min(W - R - 8, qx + 20 + R + (W - qx - 20 - 2 * R) / 2), cy = Hh * 0.7;
            g.strokeStyle = col('--line'); g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
            g.strokeStyle = col('--good'); g.beginPath(); g.moveTo(cx, cy - R - 4); g.lineTo(cx, cy - R + 6); g.stroke();
            const ang = -Math.PI / 2 + defl() * 0.6 * Math.PI / 2 * 1.0;
            const ok = balanced();
            g.strokeStyle = ok ? col('--good') : col('--s1'); g.lineWidth = 2;
            g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (R - 4) * Math.cos(ang), cy + (R - 4) * Math.sin(ang)); g.stroke();
            g.fillStyle = col('--muted'); g.fillText('静电计', cx, cy + 14);
            rN.set(ok ? '在零点 ✓ 可以记录' : defl() > 0 ? '偏转 →（砝码不够）' : '偏转 ←（砝码太多）');
          }
          function drawP() {
            const g = plot.g, W = plot.w, Hh = plot.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 1.05, y0: 0, y1: 9, pad: { l: 40, r: 12, t: 12 }, xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 2, 4, 6, 8],
              fmtX: (v) => v.toFixed(2), xLabel: '含铀质量分数 w_U', yLabel: 'I / 10⁻¹¹ A' }, col);
            g.font = '11px ' + col('--body-font');
            for (const r of S.rec.values()) {
              const x = A.X(r.s.fu), y = A.Y(r.I);
              g.fillStyle = col(r.s.kind === 'ore' ? '--warn' : r.s.kind === 'th' ? '--s3' : '--s1');
              g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
              g.fillStyle = col('--fg'); g.textBaseline = 'middle';
              const right = x > A.p.l + A.iw * 0.6; g.textAlign = right ? 'right' : 'left';
              const dy = r.s.id === 'syn' ? 11 : r.s.id === 'nit' ? -10 : r.s.id === 'U3O8' ? 13 : r.s.id === 'U' ? -11 : 0;
              g.fillText(r.s.name, x + (right ? -8 : 8), y + dy);
            }
          }
          const draw = () => { drawB(); drawP(); };
          cvB.onResize(drawB); plot.onResize(drawP);
          const off = onTheme(draw);
          info(); draw();
          return { destroy() { off(); cvB.destroy(); plot.destroy(); } };
        },
      };

      /* ================= 第二关 ================= */
      const stage2 = {
        title: '跟着放射性走',
        task: `<p>假设没错的话，这种新物质在沥青铀矿里的量极少（化学分析连 1% 的未知成分都没发现），但放射性极强。那就把放射性本身当作
          <b>"示踪剂"</b>：把矿溶解，用经典的分析化学把它一分为二；每份都拿去静电计上测一下，<b>每克</b>的活度是升高了还是降低了，
          就知道新元素跑进了哪一份。</p>
          <p>手头这份溶解好的沥青铀矿（"F1"）每克活度约为金属铀的 3.6 倍。你能用的操作：通 H₂S、加稀硫酸、加氨水、
          真空加热升华（仅对硫化物）、氯化物的分级结晶。</p>
          <p><b>任务</b>：做出一份每克活度 <b>> 100 倍铀</b>、且主要伴随元素是<b>铋</b>的样品，再做出一份 <b>> 100 倍铀</b>、伴随元素是<b>钡</b>的样品。
          某份超过 100 倍后可以"鉴定伴随元素"。</p>`,
        hints: [
          '先做大的分组：通 H₂S 把铜族（Pb、Bi、Cu 的硫化物）沉下来，测两份。两份都比原矿"亮"或都"暗"吗？——放射性可能不止一种，分成了两路。',
          '硫化物那一路：钋的硫化物比铋的更容易挥发，真空加热时它优先升华。滤液那一路：加稀硫酸，钡的硫酸盐沉淀下来；之后把它转成氯化物做分级结晶，每次晶体里的活性物质更浓。',
          '一条最短路线：F1 → 通 H₂S → 硫化物沉淀 → 真空升华 → 升华物（> 100 倍，伴铋）。另一条：F1 → 通 H₂S → 滤液 → 加稀硫酸 → 沉淀 → 分级结晶 → 晶体 → 再结晶一次 → 晶体（> 100 倍，伴钡）。',
        ],
        answer: `硫化物沉淀（含 Pb/Bi/Cu）带走一种放射性，真空升华后集中在一小撮升华物里，每克数百倍于铀、主要成分是<b>铋</b>——但纯铋没有放射性，所以活性的是一种化学上像铋的新元素：<b>钋</b>。
          H₂S 滤液中，稀硫酸沉淀出钡的硫酸盐，带走另一种放射性；氯化物分级结晶两次后每克 > 100 倍、主要成分是<b>钡</b>——纯钡没有放射性，活性的是一种化学上像钡的新元素：<b>镭</b>。`,
        build(body, api) {
          let nodes, sel, foundPo, foundRa, nid, qShown = false;
          const rnd = mul32(1211);
          function reset() {
            nodes = [{ id: 1, parent: null, depth: 0, label: '溶解的沥青铀矿', c: { ...START }, form: 'sol', used: false, measured: false, idd: false, noise: 1 }];
            sel = 1; nid = 2; foundPo = foundRa = false; render();
          }
          const goal = h.el('div', { class: 'curc-goal' });
          const gPo = h.el('span', { text: '○ 伴铋的强放射性样品' }), gRa = h.el('span', { text: '○ 伴钡的强放射性样品' });
          goal.append(gPo, gRa);
          const selInfo = h.el('div', { class: 'curc-sel' });
          const ops = h.el('div', { class: 'curc-ops' }, Object.entries(OPS).map(([k, op]) => h.button({ label: op.name, onClick: () => apply(k) })));
          const tree = h.el('div', { class: 'curc-tree', role: 'list' });
          const bReset = h.button({ label: '全部重来', kind: 'ghost', onClick: () => reset() });
          const note = h.el('p', { class: 'curc-note', text: '化学是简化的：每步只给主要去向（如 H₂S 沉淀铜族硫化物、硫酸沉淀钡/铅、氨水沉淀铁/铀/铋的氢氧化物、钙大多留在母液），省略了洗涤、再溶解与转化（硫酸盐 → 碳酸盐 → 氯化物）等步骤。真实流程处理的是数吨矿渣。' });
          const qbox = h.el('div', { class: 'curc-q', hidden: true });
          body.append(goal, selInfo, ops, tree, h.el('div', {}, [bReset]), note, qbox);
          const quiz = H.quiz({
            question: '两份强放射性样品，一份跟着铋走、一份跟着钡走。它们是同一种新元素吗？',
            options: [
              { label: '是：都是"放射性"，只是浓度不同', ok: false, why: '放射性是原子的性质，但化学行为由元素决定。同一种元素不可能在 H₂S 一步既进沉淀（像铋）又留在滤液（像钡）。' },
              { label: '不是：一个跟铋走、一个跟钡走——是两种化学性质不同的新元素', ok: true, why: '对。一种的硫化物不溶于酸、比铋的更易升华：钋（Po）。另一种的硫酸盐难溶、氯化物比氯化钡更难溶：镭（Ra）。' },
              { label: '其实就是铋和钡本身变得有放射性了', ok: false, why: '纯铋、纯钡（从别的矿来的）一点放射性都没有；而且富集样品的每克活度会随结晶次数一直升高，说明活性来自其中越来越浓的少量杂质。' },
            ],
            onOk: () => api.done('<b>两种新元素。</b>1898 年 7 月，居里夫妇宣布与铋同行的新元素，以玛丽的祖国波兰命名为<b>钋</b>（polonium）；12 月，与贝蒙（Bémont）一起宣布与钡同行的<b>镭</b>（radium），光谱学家德马塞（Demarçay）在其光谱里看到一条不属于任何已知元素的新谱线（381.4 nm），确认了它。'),
          });
          qbox.append(quiz.el);
          const N = (id) => nodes.find((n) => n.id === id);
          function apply(k) {
            const n = N(sel), op = OPS[k];
            if (!n) return;
            if (n.used) { api.say(`F${n.id} 已经分开了。选一份还没处理过的（在树里点它）。`, 'bad'); return; }
            if (op.need && n.form !== op.need) { api.say('只有硫化物沉淀才能真空加热升华——先用 H₂S 把它们沉淀出来。', 'bad'); return; }
            if (mass(n.c) < 0.05) { api.say(`F${n.id} 太少了（不到 0.05 g），没法再分。`, 'bad'); return; }
            if (nodes.length > 60) { api.say('树太大了，按"全部重来"清空再试。', 'bad'); return; }
            const [A, B] = split(n.c, op);
            n.used = true;
            const mk = (c, lab, form) => ({ id: nid++, parent: n.id, depth: n.depth + 1, label: lab, op: op.name, c, form, used: false, measured: false, idd: false, noise: 1 + 0.06 * (rnd() - 0.5) });
            const a = mk(A, op.a, op.af), b = mk(B, op.b, op.bf);
            const i = nodes.indexOf(n);
            nodes.splice(i + 1, 0, a, b);
            sel = a.id; api.say(`F${n.id} → ${op.name}：F${a.id}（${op.a}）与 F${b.id}（${op.b}）。`, 'info');
            render();
          }
          const fmtM = (m) => (m >= 10 ? m.toFixed(0) : m >= 1 ? m.toFixed(1) : m.toFixed(2)) + ' g';
          const ida = (c) => EL.map((e) => [e, c[e] / mass(c)]).sort((x, y) => y[1] - x[1]);
          function measure(n) { n.measured = true; render(); }
          function identify(n) {
            n.idd = true;
            const top = ida(n.c)[0][0], act = spAct(n.c);
            if (act > 100 && top === 'Bi' && n.c.Po > n.c.Ra) foundPo = true;
            if (act > 100 && top === 'Ba' && n.c.Ra > n.c.Po) foundRa = true;
            render();
          }
          function render() {
            tree.textContent = '';
            for (const n of nodes) {
              const a = spAct(n.c) * n.noise;
              const row = h.el('div', { class: 'curc-row' });
              if (!n.measured) row.append(h.button({ label: '测量', onClick: (e) => { e.stopPropagation(); measure(n); } }));
              else row.append(h.el('span', { class: 'curc-act' + (a > 100 ? ' hot' : ''), text: `每克活度 ${a >= 100 ? a.toFixed(0) : a.toFixed(a >= 10 ? 1 : 2)} × 铀` }));
              if (n.measured && a > 100 && !n.idd) row.append(h.button({ label: '鉴定伴随元素', kind: 'primary', onClick: (e) => { e.stopPropagation(); identify(n); } }));
              if (n.idd) row.append(h.el('span', { class: 'curc-id', text: '主要成分：' + ida(n.c).slice(0, 3).filter((x) => x[1] > 0.02).map(([e, f]) => `${ELN[e]} ${(f * 100).toFixed(0)}%`).join('，') }));
              const card = h.el('div', { class: 'curc-node', role: 'listitem', tabindex: 0, 'aria-pressed': String(n.id === sel), 'data-used': n.used ? '1' : '0',
                style: `margin-left:${Math.min(n.depth, 6) * 12}px`, onclick: () => { sel = n.id; render(); },
                onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel = n.id; render(); } } }, [
                h.el('div', { class: 'curc-nh' }, [h.el('b', { text: 'F' + n.id }), h.el('span', { text: n.label + (n.used ? '（已分开）' : '') }), h.el('span', { class: 'curc-nm', text: fmtM(mass(n.c)) })]),
                row,
              ]);
              tree.append(card);
            }
            const s = N(sel);
            selInfo.innerHTML = s ? `当前选中：<b>F${s.id} ${s.label}</b>${s.used ? '（已分开，换一份）' : ''} —— 对它做：` : '';
            gPo.textContent = (foundPo ? '● ' : '○ ') + '伴铋的强放射性样品（> 100×）'; gPo.dataset.ok = foundPo ? '1' : '0';
            gRa.textContent = (foundRa ? '● ' : '○ ') + '伴钡的强放射性样品（> 100×）'; gRa.dataset.ok = foundRa ? '1' : '0';
            if (foundPo && foundRa && !qShown) { qShown = true; qbox.hidden = false; api.say('两份都找到了。最后一个问题：', 'good'); }
          }
          reset();
          return null;
        },
      };

      /* ================= 第三关 ================= */
      const stage3 = {
        title: '一吨矿里有多少镭？',
        task: `<p>镭的每克活度是铀的几百万倍，所以矿里的镭一定少得可怜。能不能不做化学、直接<b>算</b>出来有多少？</p>
          <p>已知：$^{226}$Ra 的半衰期 $T_{\\rm Ra}=1600$ 年，$^{238}$U 的半衰期 $T_{\\rm U}=4.47\\times10^{9}$ 年。镭是铀衰变链上的一员；
          在一块足够古老的矿里，衰变链的每一员每秒衰变的原子数都与 $^{238}$U 相同（这叫<b>久期平衡</b>）。原子量：Ra 226，U 238。</p>
          <p><b>任务</b>：每吨铀伴有多少克镭？</p>`,
        hints: [
          '每秒衰变数 = 原子数 × 衰变常数 $\\lambda$，而 $\\lambda = \\ln 2 / T_{1/2}$。"每一员衰变速率相同"写成等式是什么？',
          '$\\lambda_{\\rm Ra}N_{\\rm Ra}=\\lambda_{\\rm U}N_{\\rm U}$ ⇒ $N_{\\rm Ra}/N_{\\rm U}=T_{\\rm Ra}/T_{\\rm U}$。这是原子数之比；质量比还要乘原子量之比。',
          '$\\dfrac{m_{\\rm Ra}}{m_{\\rm U}}=\\dfrac{1600}{4.47\\times10^{9}}\\times\\dfrac{226}{238}\\approx3.4\\times10^{-7}$，再乘 $10^{6}$ g。',
        ],
        answer: `$\\lambda_{\\rm Ra}N_{\\rm Ra}=\\lambda_{\\rm U}N_{\\rm U}$，$\\lambda=\\ln2/T$ ⇒ $N_{\\rm Ra}/N_{\\rm U}=T_{\\rm Ra}/T_{\\rm U}=3.58\\times10^{-7}$；
          质量比 $\\times226/238$ 得 $3.40\\times10^{-7}$，即每吨铀约 <b>${RA_PER_T.toFixed(2)} g</b> 镭。沥青铀矿含铀不到一半，所以每吨矿只有零点一几克镭。`,
        build(body, api) {
          const ans = H.answer({ label: '每吨铀（$10^6$ g）伴有的镭（容差 ±10%）', unit: 'g', placeholder: '例如 2.5',
            check: (v) => {
              if (v >= 0.30 && v <= 0.38) return { ok: true, msg: `对：约 ${RA_PER_T.toFixed(2)} g——一吨铀里只有三分之一克镭。` };
              if (v > 0.38 && v <= 0.4) return { ok: false, msg: '接近了——原子数比算对了，别忘了换成质量比（× 226/238）。' };
              if (v > 0.2 && v < 0.6) return { ok: false, msg: '数量级对了，检查一下原子量之比和半衰期之比的方向。' };
              if (v > 2e2 && v < 5e2) return { ok: false, msg: '这像是毫克数。题目要的是克。' };
              return { ok: false, msg: '数量级不对。先写出"衰变速率相等"的等式。' };
            },
            onOk: () => !api.solved() && api.done(`<b>每吨铀约 ${RA_PER_T.toFixed(2)} g 镭。</b>这就是为什么居里夫妇要在棚屋里用大锅搅拌、处理好几吨奥地利约阿希姆斯塔尔的铀矿残渣，到 1902 年才得到约 0.1 g 纯氯化镭，测出镭的原子量 ≈ 225。玛丽·居里因此在 1903 年（与 Pierre、贝克勒尔）获诺贝尔物理学奖，1911 年独自获诺贝尔化学奖。`),
          });
          body.append(ans.el);
          api.typeset(body);
          return null;
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
