/* 四个字母的秘密 — Watson, Crick, Wilkins (Nobel Medicine 1962), rediscovery challenge.
 * Stage 2 diffraction copied from labs/dna.js (Cochran–Crick–Vand 1952): layer line l at Z = l/P carries
 * Bessel terms J_n(2πRρ), n = l − 10m (10 units/turn); two strands offset Δφ = 3/8 turn multiply term n by
 * 4cos²(nΔφ/2) — which kills n = ±4 and makes the 4th layer line (nearly) vanish. P = 34 Å, R = 10 Å.
 * Stage 3 geometry (schematic, Å): C1′–C1′ = 10.8; a base reaches 5.0 (purine) or 3.0 (pyrimidine) from its
 * C1′ toward the partner, leaving a 2.8 Å donor–acceptor gap for Pu–Py. Watson–Crick edge, top→bottom
 * (D = donor H, A = acceptor, '' = nothing):  keto/amino: A [D,A,''], G [A,D,D], C [D,A,A], T [A,D,A];
 * enol/imino (the textbook forms Watson first used): G [D,A,D], T [D,A,A].
 * Stage 4 CsCl buoyant densities (g/cm³): ¹⁵N/¹⁵N 1.724, hybrid 1.717, ¹⁴N/¹⁴N 1.710.
 */
(() => {
  const DPHI = (135 * Math.PI) / 180;
  function besselJ(n, x) {
    const K = 64; let s = 0;
    for (let k = 0; k <= K; k++) { const t = (Math.PI * k) / K, w = k === 0 || k === K ? 1 : k % 2 ? 4 : 2; s += w * Math.cos(n * t - x * Math.sin(t)); }
    return s / (3 * K);
  }
  function layerI(l, rho, R = 10) {
    let I = 0;
    for (let m = -2; m <= 2; m++) { const n = l - 10 * m; if (Math.abs(n) > 14) continue;
      const J = besselJ(Math.abs(n), 2 * Math.PI * R * Math.abs(rho)); I += J * J * 4 * Math.cos((n * DPHI) / 2) ** 2; }
    return I;
  }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- stage 1 data ----
  const ORG = [
    { n: '人', v: [30.9, 29.4, 19.9, 19.8], ds: true },
    { n: '大肠杆菌', v: [24.7, 23.6, 26.0, 25.7], ds: true },
    { n: '酵母', v: [31.3, 32.9, 18.7, 17.1], ds: true },
    { n: '海胆', v: [32.8, 32.1, 17.7, 18.4], ds: true },
    { n: '结核分枝杆菌', v: [15.1, 14.6, 34.9, 35.4], ds: true },
    { n: '噬菌体 φX174', v: [24.0, 31.2, 23.3, 21.5], ds: false },
  ];
  const TERMS = { A: [0], T: [1], G: [2], C: [3], 'A+G': [0, 2], 'T+C': [1, 3], 'A+T': [0, 1], 'G+C': [2, 3] };
  const val = (o, k) => TERMS[k].reduce((s, i) => s + o.v[i], 0);
  const ratio = (o, a, b) => val(o, a) / val(o, b);
  const RULES = [['A', 'T'], ['G', 'C'], ['A+G', 'T+C']];
  const ruleOf = (a, b) => RULES.findIndex(([p, q]) => (a === p && b === q) || (a === q && b === p));
  const nearOneDS = (a, b) => ORG.filter((o) => o.ds).every((o) => Math.abs(ratio(o, a, b) - 1) <= 0.1);

  // ---- stage 3 chemistry ----
  const C1C1 = 10.8, REACH = { pu: 5.0, py: 3.0 };
  const KIND = { A: 'pu', G: 'pu', C: 'py', T: 'py' };
  const EDGE = {
    keto: { A: ['D', 'A', ''], G: ['A', 'D', 'D'], C: ['D', 'A', 'A'], T: ['A', 'D', 'A'] },
    enol: { A: ['D', 'A', ''], G: ['D', 'A', 'D'], C: ['D', 'A', 'A'], T: ['D', 'A', 'A'] },
  };
  const ATOM = {
    keto: { A: ['N6–H', 'N1', 'C2–H'], G: ['O6', 'N1–H', 'N2–H'], C: ['N4–H', 'N3', 'O2'], T: ['O4', 'N3–H', 'O2'] },
    enol: { A: ['N6–H', 'N1', 'C2–H'], G: ['O6–H', 'N1', 'N2–H'], C: ['N4–H', 'N3', 'O2'], T: ['O4–H', 'N3', 'O2'] },
  };
  function pairEval(L, Rb, taut) {
    const gap = C1C1 - REACH[KIND[L]] - REACH[KIND[Rb]];
    const fit = gap < 2 ? 'tight' : gap > 3.6 ? 'wide' : 'ok';
    const e1 = EDGE[taut][L], e2 = EDGE[taut][Rb];
    const rows = e1.map((a, i) => { const b = e2[i]; if (!a || !b) return 'none'; return (a === 'D' && b === 'A') || (a === 'A' && b === 'D') ? 'hb' : 'clash'; });
    const hb = fit === 'ok' ? rows.filter((r) => r === 'hb').length : 0, clash = fit === 'ok' ? rows.filter((r) => r === 'clash').length : 0;
    return { gap, fit, rows, hb, clash, good: fit === 'ok' && clash === 0 && hb >= 2 };
  }

  // ---- stage 4 ----
  const RHO = { H: 1.724, M: 1.717, L: 1.710 };
  function predict(model, gen) {
    const f = 1 / 2 ** gen;
    if (gen === 0) return [[RHO.H, 1]];
    if (model === 'semi') return [[RHO.M, 2 * f], [RHO.L, 1 - 2 * f]].filter((b) => b[1] > 1e-9);
    if (model === 'cons') return [[RHO.H, f], [RHO.L, 1 - f]];
    return [[RHO.L + (RHO.H - RHO.L) * f, 1]]; // dispersive
  }

  function themeWatch(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-dna')) return;
    const s = document.createElement('style'); s.id = 'st-dna';
    s.textContent = `.dna-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.dna-box{border:1px solid var(--line);border-radius:6px;padding:10px 12px;font-size:13.5px;line-height:1.7;background:var(--bg2)}
.dna-found{font-size:13px;color:var(--muted)} .dna-found b{color:var(--good)}
.dna-tasks{display:grid;gap:10px}
.dtable td.dna-rc, .dtable th.dna-rc{color:var(--accent)}`;
    document.head.append(s);
  }

  CHALLENGES.dna = {
    title: '四个字母的秘密',
    _math: { layerI, ratio, nearOneDS, pairEval, predict, ORG },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h || H, C = (n) => ctx.color(n), mono = () => C('--mono-font') || 'monospace';

      /* ================= Stage 1 ================= */
      const s1 = {
        title: '查加夫的表',
        task: `<p>1950 年前后，人们普遍相信“四核苷酸假说”：DNA 是 A、T、G、C 按固定顺序重复的单调聚合物，太简单了，不可能携带遗传信息。哥伦比亚大学的 Erwin Chargaff 用新的纸层析法把各种生物的 DNA 水解，逐一测出四种碱基的含量（摩尔百分比）。</p>
<p>下面是他和后续实验室的数据。四种碱基显然不是各占 25 %。但这些数字里藏着某种<b>对所有生物都成立</b>的规律。用比值工具给表格加列，把它找出来——至少找到两个这样的规律。</p>`,
        hints: [
          '单个碱基的含量在物种间变化很大。试着把两种碱基的含量相除，看看哪个比值在所有物种中都差不多。',
          '嘌呤（A、G）和嘧啶（T、C）之间有没有什么对应？试试一个嘌呤除以一个嘧啶。',
          '试 A/T 和 G/C。最后一行的病毒可以先不管。',
        ],
        answer: `在所有双链 DNA 中 $A/T\\approx 1$、$G/C\\approx 1$（因此也有 $(A+G)/(T+C)\\approx 1$，嘌呤 = 嘧啶），而 $(A+T)/(G+C)$ 在物种间从约 0.4（结核菌）到约 1.8（酵母）大幅变化。φX174 的 DNA 是单链，没有配对伙伴，所以不守此规律。`,
        build(body, api) {
          const cols = [];
          const found = new Set();
          const wrap = h.el('div', { class: 'dtable' });
          body.append(wrap);
          function renderTable() {
            const head = h.el('tr', {}, [h.el('th', { text: '生物' }), ...['A', 'T', 'G', 'C'].map((t) => h.el('th', { text: t })), ...cols.map(([a, b]) => h.el('th', { class: 'dna-rc', text: `${a.includes('+') ? '(' + a + ')' : a}/${b.includes('+') ? '(' + b + ')' : b}` }))]);
            const rows = ORG.map((o) => h.el('tr', {}, [h.el('td', { text: o.n }), ...o.v.map((v) => h.el('td', { text: v.toFixed(1) })), ...cols.map(([a, b]) => h.el('td', { class: 'dna-rc', text: ratio(o, a, b).toFixed(2) }))]));
            wrap.replaceChildren(h.el('table', {}, [h.el('thead', {}, head), h.el('tbody', {}, rows)]));
          }
          renderTable();
          const opts = Object.keys(TERMS).map((k) => ({ value: k, label: k }));
          const cNum = h.choice({ label: '分子', options: opts, value: 'A' });
          const cDen = h.choice({ label: '分母', options: opts, value: 'G' });
          const addBtn = h.button({ label: '加一列', kind: 'primary', onClick: () => add(cNum.get(), cDen.get()) });
          const clrBtn = h.button({ label: '清空比值列', onClick: () => { cols.length = 0; renderTable(); } });
          const controls = h.el('div', { class: 'lab-controls' }, [cNum.el, cDen.el, h.el('div', { class: 'ctl dna-row' }, [addBtn, clrBtn])]);
          const foundEl = h.el('p', { class: 'dna-found', text: '已找到的普适规律：0 / 2' });
          body.append(controls, foundEl);
          const qBox = h.el('div', { class: 'dna-tasks' });
          body.append(qBox);
          let q1 = false, q2 = false, quizzesShown = false;

          function add(a, b) {
            if (a === b) { api.say('分子分母相同，比值恒为 1——这不算发现。', 'bad'); return; }
            if (cols.some(([x, y]) => x === a && y === b)) { api.say('这一列已经在表里了。', 'info'); return; }
            cols.push([a, b]); if (cols.length > 8) cols.shift();
            renderTable();
            const ds = ORG.filter((o) => o.ds).map((o) => ratio(o, a, b));
            const lo = Math.min(...ds), hi = Math.max(...ds);
            const r = ruleOf(a, b);
            if (nearOneDS(a, b) && r >= 0) {
              const isNew = !found.has(r); found.add(r);
              api.say(`这一列在前五种生物里都在 ${lo.toFixed(2)}–${hi.toFixed(2)} 之间——几乎正好等于 1！${isNew ? '' : '（这个规律你已经找到过。）'}${!ORG[5].ds && Math.abs(ratio(ORG[5], a, b) - 1) > 0.08 ? ' 不过最后一行的病毒不太听话。' : ''}`, 'good');
            } else if (hi / lo < 1.25) {
              api.say(`这一列在前五种生物里的范围 ${lo.toFixed(2)}–${hi.toFixed(2)}：相当稳定，但不等于 1。`, 'info');
            } else {
              api.say(`这一列在物种间从 ${lo.toFixed(2)} 变到 ${hi.toFixed(2)}，差别很大。`, 'info');
            }
            foundEl.innerHTML = `已找到的普适规律：<b>${Math.min(found.size, 2)}</b> / 2` + (found.size ? '（' + [...found].map((i) => RULES[i].map((t) => (t.includes('+') ? '(' + t + ')' : t)).join('/') + ' ≈ 1').join('，') + '）' : '');
            if (found.size >= 2 && !quizzesShown) showQuizzes();
          }
          function showQuizzes() {
            quizzesShown = true;
            const qa = h.quiz({
              question: '前五种生物都守这个规律，唯独<b>噬菌体 φX174</b> 不守（A/T ≈ 0.77）。最可能的原因是？',
              options: [
                { label: '测量误差：病毒 DNA 太少，测不准。', ok: false, why: '它的 G/C ≈ 1.08 还算接近 1，可 A/T 偏离了 23 %——远超这些实验的误差（约 ±3 %）。1959 年 Sinsheimer 用多种方法反复确认了这些数字。' },
                { label: '它的 DNA 是单链。', ok: true, why: '对。1959 年 Sinsheimer 发现 φX174 的 DNA 是单链环。规律 A = T、G = C 不是单条链的性质，而是<b>两条链放在一起</b>才成立——这本身就是一个强烈的结构线索。' },
                { label: '病毒用的是另一套碱基。', ok: false, why: '它的 DNA 用的也是 A、T、G、C，表里四个数加起来同样是 100 %。' },
                { label: '病毒没有遗传信息。', ok: false, why: '噬菌体当然有遗传信息——1952 年 Hershey–Chase 实验正是用噬菌体证明了遗传物质是 DNA。' },
              ],
              onOk: () => { q1 = true; fin(); },
            });
            const qb = h.quiz({
              question: '既然 A = T、G = C 处处成立，那物种之间<b>到底什么在变</b>？（可以继续加列来验证）',
              options: [
                { label: '$A/T$', ok: false, why: '你刚发现它处处约等于 1。' },
                { label: '$(A+G)/(T+C)$', ok: false, why: '嘌呤总量 = 嘧啶总量，处处约等于 1。' },
                { label: '$(A+T)/(G+C)$', ok: true, why: '对。结核菌约 0.42，人约 1.52，酵母约 1.80。每个物种只剩<b>一个</b>自由参数：GC 含量。四核苷酸假说（四种碱基等量、固定重复）被推翻了：DNA 的组成随物种变化，足以携带特异的信息。' },
                { label: '什么都不变，DNA 在所有生物里都一样。', ok: false, why: '看看表的前两列：人的 A 是 30.9 %，结核菌只有 15.1 %。' },
              ],
              onOk: () => { q2 = true; fin(); },
            });
            qBox.append(qa.el, qb.el); api.typeset(qBox);
          }
          function fin() {
            if (q1 && q2) api.done('<b>查加夫规则（Chargaff, 1950）。</b> 在任何双链 DNA 中 A = T、G = C（所以嘌呤 = 嘧啶），而 GC 含量随物种变化。查加夫本人没能解释这个 1 : 1——1952 年他在剑桥向 Watson 和 Crick 讲了这件事，后者才把它变成碱基配对的线索。');
          }
          return { destroy() {} };
        },
      };

      /* ================= Stage 2 ================= */
      const s2 = {
        title: '读一张 X 光照片',
        task: `<p>1952 年 5 月，伦敦国王学院。Rosalind Franklin 和研究生 Raymond Gosling 把湿润的 DNA 纤维拉直，对准 X 射线曝光了 60 多个小时，得到一张异常清晰的“B 型”衍射照片。</p>
<p>下面是这样一张纤维衍射图（倒易空间，纤维轴竖直；中心的强光被挡板遮住）。坐标已校准：<b>一小格 = 0.01 Å⁻¹</b>。拖动两条水平标尺（或用滑块）去对准衍射斑所在的水平“层线”，读出间距，再回答下面的问题。规则：倒易空间里的间距 $\\Delta Z$ 对应实空间里的周期 $1/\\Delta Z$。</p>`,
        hints: [
          '水平的条纹（层线）等距排列，间距就是 $1/P$，$P$ 是沿纤维轴的重复周期（螺距）。为了更准，可以量相隔好几条层线的距离再除以条数。',
          '最上方和最下方在中轴线上有一对孤零零的强斑（不在 X 形的臂上）。它对应沿轴每隔多少 Å 就重复一次的东西——相邻碱基的堆积间距。',
          '数一数：从中心到那对强斑之间有几个层线间距？螺距 ÷ 碱基间距 = 每圈碱基数。答案大约是 34 Å、3.4 Å、10。',
        ],
        answer: `层线间距 $\\Delta Z\\approx 0.0294$ Å⁻¹，所以螺距 $P = 1/\\Delta Z\\approx 34$ Å；子午线强反射在 $Z\\approx 0.294$ Å⁻¹，对应碱基堆积间距 $3.4$ Å；它恰好落在第 10 条层线上，所以每圈 $34/3.4 = 10$ 个碱基。X 形（从中心向外的两条斑点交叉臂）是螺旋的标志：Cochran–Crick–Vand 理论里第 $l$ 层线的强度由 $J_n(2\\pi R\\rho)$ 决定，$|n|$ 越大第一峰越远离中轴。第 4 层线缺失是因为两条链在轴向上错开约 3/8 圈，使 $n=\\pm4$ 项相消。`,
        build(body, api) {
          const PITCH = 34, RISE = 3.4, ZMAX = 0.34;
          const stage = h.el('div', { class: 'lab-stage' });
          body.append(stage);
          const cv = h.canvas(stage, { aspect: 0.95, minH: 340, maxH: 520 });
          const rz = { a: 0.06, b: -0.06 };
          const fmtZ = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(4) + ' Å⁻¹';
          const sA = h.slider({ label: '标尺 1 位置 Z₁', min: -ZMAX, max: ZMAX, step: 0.0005, value: rz.a, format: fmtZ, onInput: (v) => { rz.a = v; upd(); } });
          const sB = h.slider({ label: '标尺 2 位置 Z₂', min: -ZMAX, max: ZMAX, step: 0.0005, value: rz.b, format: fmtZ, onInput: (v) => { rz.b = v; upd(); } });
          const readout = h.el('div', { class: 'lab-readout' });
          const roD = h.readout('间距 |Z₁ − Z₂|'), roI = h.readout('对应实空间周期 1/|ΔZ|');
          readout.append(roD.el, roI.el);
          body.append(h.el('div', { class: 'lab-controls' }, [sA.el, sB.el]), readout);

          // pattern: blobs along layer lines
          const rnd = mulberry32(51);
          const NR = 44, RMAX = 0.2, LMAX = 11, B = 14;
          const blobs = []; let mx = 0;
          for (let l = -LMAX; l <= LMAX; l++) for (let j = 0; j <= NR; j++) {
            const rho = (RMAX * j) / NR, Z = l / PITCH;
            if (l === 0 && rho < 0.03) continue;
            const v = layerI(l, rho) * Math.exp(-B * (rho * rho + Z * Z)) * (1 + 0.25 * (rnd() - 0.5));
            blobs.push({ Z, rho, v, mer: Math.abs(l) === 10 && j <= 2 });
            if (!(Math.abs(l) === 10 && j <= 2)) mx = Math.max(mx, v);
          }
          const speck = Array.from({ length: 260 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, a: rnd() }));
          let geo = null;
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
            const pad = { l: 8, r: 8, t: 10, b: 22 };
            const ih = Hh - pad.t - pad.b, k = ih / (2 * ZMAX), cx = W / 2, cy = pad.t + ih / 2;
            const rVis = Math.min(RMAX, (W / 2 - 14) / k);
            geo = { k, cx, cy, pad, ih };
            const X = (r) => cx + r * k, Y = (z) => cy - z * k;
            // grid: 0.01 minor, 0.05 major
            g.lineWidth = 1;
            for (let z = -0.34; z <= 0.3401; z += 0.01) { const zz = Math.round(z * 100) / 100, major = Math.round(zz * 100) % 5 === 0; g.strokeStyle = C('--grid'); g.globalAlpha = major ? 1 : 0.45; g.beginPath(); g.moveTo(X(-rVis), Y(zz)); g.lineTo(X(rVis), Y(zz)); g.stroke(); }
            for (let r = 0; r <= rVis + 1e-9; r += 0.01) { const major = Math.round(r * 100) % 5 === 0; g.strokeStyle = C('--grid'); g.globalAlpha = major ? 1 : 0.45; [r, -r].forEach((rr) => { g.beginPath(); g.moveTo(X(rr), Y(ZMAX)); g.lineTo(X(rr), Y(-ZMAX)); g.stroke(); }); }
            g.globalAlpha = 1;
            // speckle background (film fog)
            g.fillStyle = C('--fg');
            speck.forEach((s) => { g.globalAlpha = 0.05 + 0.08 * s.a; g.fillRect(cx + s.x * rVis * k, cy + s.y * ZMAX * k, 1.2, 1.2); });
            // blobs
            const bw = Math.max(1.6, ((RMAX / NR) * k) * 0.75), bh = Math.max(1.4, 0.0035 * k);
            blobs.forEach((b) => {
              if (b.rho > rVis) return;
              const a = Math.min(1, (1.3 * b.v) / mx); if (a < 0.1) return;
              g.globalAlpha = a;
              g.beginPath(); g.ellipse(X(b.rho), Y(b.Z), bw * (0.6 + 0.6 * a), bh * (0.7 + 0.7 * a), 0, 0, 7); if (b.rho > 0) g.ellipse(X(-b.rho), Y(b.Z), bw * (0.6 + 0.6 * a), bh * (0.7 + 0.7 * a), 0, 0, 7); g.fill();
            });
            g.globalAlpha = 1;
            // beam stop
            g.fillStyle = C('--bg2'); g.strokeStyle = C('--line'); g.beginPath(); g.arc(cx, cy, Math.max(6, 0.018 * k), 0, 7); g.fill(); g.stroke();
            // axis labels
            g.font = '10px ' + mono(); g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'middle';
            [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3].forEach((z) => g.fillText((z > 0 ? '+' : '') + z.toFixed(1), X(-rVis) + 2, Y(z) - 6));
            g.textAlign = 'center'; g.textBaseline = 'bottom';
            g.fillText('Z (Å⁻¹) ↑ 纤维轴 · 一小格 = 0.01 Å⁻¹', cx, Hh - 3);
            // rulers
            [['a', '--s1', '1'], ['b', '--s2', '2']].forEach(([key, col, lab]) => {
              const y = Y(rz[key]); g.strokeStyle = C(col); g.lineWidth = 1.5; g.setLineDash([6, 3]);
              g.beginPath(); g.moveTo(X(-rVis), y); g.lineTo(X(rVis), y); g.stroke(); g.setLineDash([]);
              g.fillStyle = C(col); g.beginPath(); g.moveTo(X(rVis) - 1, y); g.lineTo(X(rVis) - 9, y - 5); g.lineTo(X(rVis) - 9, y + 5); g.fill();
              g.font = 'bold 11px ' + mono(); g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(lab, X(rVis) - 11, y - 2);
            });
          }
          function upd() {
            const d = Math.abs(rz.a - rz.b);
            roD.set(d.toFixed(4) + ' Å⁻¹'); roI.set(d > 1e-4 ? (1 / d).toFixed(2) + ' Å' : '∞');
            draw();
          }
          // drag rulers
          let drag = null;
          const toZ = (e) => { const r = cv.canvas.getBoundingClientRect(); return (geo.cy - (e.clientY - r.top)) / geo.k; };
          const pd = (e) => { const z = toZ(e); drag = Math.abs(z - rz.a) <= Math.abs(z - rz.b) ? 'a' : 'b'; cv.canvas.setPointerCapture(e.pointerId); pm(e); };
          const pm = (e) => { if (!drag) return; const z = Math.max(-ZMAX, Math.min(ZMAX, Math.round(toZ(e) / 0.0005) * 0.0005)); rz[drag] = z; (drag === 'a' ? sA : sB).set(z); upd(); };
          const pu = () => { drag = null; };
          cv.canvas.style.touchAction = 'pan-x'; cv.canvas.style.cursor = 'ns-resize';
          cv.canvas.addEventListener('pointerdown', pd); cv.canvas.addEventListener('pointermove', pm);
          cv.canvas.addEventListener('pointerup', pu); cv.canvas.addEventListener('pointercancel', pu);
          cv.onResize(() => upd()); upd();

          const done = { P: false, r: false, n: false, q: false };
          const tasks = h.el('div', { class: 'dna-tasks' });
          body.append(tasks);
          const within = (v, t, f) => Math.abs(v - t) <= f * t;
          const aP = h.answer({ label: '① 螺距（沿纤维轴的重复周期）$P$ =（±5 %）', unit: 'Å', check: (v) => within(v, PITCH, 0.05) ? { ok: true, msg: `对：层线间距 ${(1 / PITCH).toFixed(4)} Å⁻¹ ⇒ P ≈ 34 Å。` } : within(v, PITCH * 2, 0.05) || within(v, PITCH / 2, 0.05) ? { ok: false, msg: '差了一倍。你量的是相邻两条层线吗？' } : within(v, 1 / PITCH, 0.1) ? { ok: false, msg: '这是倒易空间里的间距；实空间周期要取倒数。' } : { ok: false, msg: '不对。对准两条相邻层线（或相隔 n 条再除以 n），取间距的倒数。' }, onOk: () => { done.P = true; fin(); } });
          const aR = h.answer({ label: '② 相邻碱基沿轴的间距（由中轴上下那对强斑读出）=（±5 %）', unit: 'Å', check: (v) => within(v, RISE, 0.05) ? { ok: true, msg: '对：子午线强反射在 Z ≈ 0.294 Å⁻¹，扁平的碱基每 3.4 Å 堆一层。' } : within(v, RISE * 2, 0.05) ? { ok: false, msg: '差了一倍：标尺 1 放在强斑上，标尺 2 放在中心（Z = 0），量的是它到中心的距离。' } : { ok: false, msg: '不对。把一条标尺放在中心 Z = 0，另一条放在中轴上方最远处那对强斑上。' }, onOk: () => { done.r = true; fin(); } });
          const aN = h.answer({ label: '③ 每圈多少个碱基？（±0.5）', unit: '个', check: (v) => Math.abs(v - 10) <= 0.5 ? { ok: true, msg: '对：强斑恰好落在第 10 条层线上，34 / 3.4 = 10。' } : { ok: false, msg: '不对。螺距 ÷ 碱基间距是多少？' }, onOk: () => { done.n = true; fin(); } });
          const qX = h.quiz({
            question: '这张图最醒目的是从中心向外张开的 <b>X 形</b>（每条层线上的斑点离中轴越来越远）。它说明分子是？',
            options: [
              { label: '螺旋', ok: true, why: '对。Cochran、Crick 和 Vand（1952）算过：螺旋的第 $l$ 层线强度由贝塞尔函数 $J_n(2\\pi R\\rho)$ 决定，$n$ 随 $l$ 增大，第一个峰离中轴越来越远——正好画出一个 X。' },
              { label: '直线排列的晶体', ok: false, why: '直线链给出的是规则的点阵斑点，不会沿层线逐级外移形成 X 形。' },
              { label: '随机线团', ok: false, why: '随机线团只给出弥散的圆环，没有层线。' },
              { label: '由很多平行的平板叠成', ok: false, why: '平板堆积只能解释中轴上的 3.4 Å 强斑，解释不了交叉的 X 形臂。' },
            ],
            onOk: () => { done.q = true; fin(); },
          });
          const qB = h.quiz({
            question: '（附加题）仔细看：从中心往上数，<b>第 4 条层线</b>几乎是空的。为什么？',
            options: [
              { label: '曝光不足', ok: false, why: '第 5 条层线离中心更远却清晰可见。' },
              { label: '两条链在轴向上彼此错开约 3/8 圈', ok: true, why: '对。第二条链相当于把第一条转了 $\\Delta\\varphi = 3/8$ 圈，第 $n$ 阶贝塞尔项乘上 $4\\cos^2(n\\Delta\\varphi/2)$；$n=\\pm4$ 时 $4\\cdot 135° = 540°$，两链散射正好相消。这就是大沟、小沟的来历。' },
              { label: '螺旋每圈有 4 个碱基', ok: false, why: '你刚刚量出每圈 10 个。' },
              { label: '分子是三股螺旋', ok: false, why: 'Pauling 1953 年初的三股螺旋模型恰恰与这张图不符。' },
            ],
          });
          tasks.append(aP.el, aR.el, aN.el, qX.el, qB.el);
          api.typeset(tasks);
          function fin() {
            if (done.P && done.r && done.n && done.q) api.done('<b>Franklin 与 Gosling 的“照片 51 号”。</b> 一张图读出三个数：螺距 34 Å、碱基间距 3.4 Å、每圈 10 个碱基；X 形说明是螺旋，而直径约 20 Å 与密度一起意味着是两条链。1953 年 1 月，Wilkins 把这张照片给 Watson 看了——Watson 说他“嘴巴张开、脉搏加快”。');
          }
          const unwatch = themeWatch(draw);
          return { destroy() { cv.destroy(); unwatch(); cv.canvas.removeEventListener('pointerdown', pd); cv.canvas.removeEventListener('pointermove', pm); cv.canvas.removeEventListener('pointerup', pu); cv.canvas.removeEventListener('pointercancel', pu); } };
        },
      };

      /* ================= Stage 3 ================= */
      const s3 = {
        title: '拼碱基对',
        task: `<p>1953 年 2 月底，剑桥卡文迪许实验室。Watson 和 Crick 已经确定：两条糖–磷酸骨架在外，碱基在内。两条骨架上相对的糖碳原子（C1′）之间的距离是固定的，约 <b>10.8 Å</b>。机加工车间的金属模型还没做好，Watson 用硬纸板剪出了四种碱基。</p>
<p>A、G 是双环的嘌呤（大），C、T 是单环的嘧啶（小）。氢键要在一个带 H 的“供体”（N–H、O–H）和一个有孤对电子的“受体”（O、N）之间形成，距离约 2.8–3 Å。给左链、右链各选一个碱基，看它们能不能<b>严丝合缝</b>地填满骨架之间的空隙。找到两种完美的配对。</p>`,
        hints: [
          '先只看大小：两个嘌呤放在一起会怎样？两个嘧啶呢？',
          '一大一小才能填满空隙。但这还不够——还要让每一对相对的原子都是“供体对受体”。如果怎么试都对不上，问问自己：教科书上碱基的画法一定对吗？',
          '把碱基写法切换成酮式（Donohue 的建议），然后试 A–T 和 G–C。',
        ],
        answer: `嘌呤–嘌呤太宽（重叠），嘧啶–嘧啶太窄（氢键够不着），所以一定是嘌呤配嘧啶。用正确的酮式写法（G 的 O6、T 的 O4 是羰基而不是烯醇 –OH），A 的 N6–H/N1 对上 T 的 O4/N3–H，形成 2 个氢键；G 的 O6/N1–H/N2–H 对上 C 的 N4–H/N3/O2，形成 3 个氢键。两种碱基对的外形几乎完全相同（C1′–C1′ 都是 10.8 Å），所以任何序列都能塞进同一个规整的双螺旋。`,
        build(body, api) {
          const st = { L: 'A', R: 'A', taut: 'enol' };
          const found = new Set();
          const stage = h.el('div', { class: 'lab-stage' });
          body.append(stage);
          const cv = h.canvas(stage, { aspect: 0.55, minH: 230, maxH: 340 });
          const bopts = ['A', 'G', 'C', 'T'].map((b) => ({ value: b, label: b + (KIND[b] === 'pu' ? '（嘌呤）' : '（嘧啶）') }));
          const cL = h.choice({ label: '左链碱基', options: bopts, value: st.L, onChange: (v) => { st.L = v; upd(); } });
          const cR = h.choice({ label: '右链碱基', options: bopts, value: st.R, onChange: (v) => { st.R = v; upd(); } });
          const cT = h.choice({ label: 'G、T 的写法', options: [{ value: 'enol', label: '烯醇式（当时教科书的画法）' }, { value: 'keto', label: '酮式（Jerry Donohue 的建议）' }], value: st.taut, onChange: (v) => { st.taut = v; upd(); } });
          const readout = h.el('div', { class: 'lab-readout' });
          const roG = h.readout('碱基间空隙'), roH = h.readout('氢键'), roF = h.readout('已找到的完美配对');
          readout.append(roG.el, roH.el, roF.el);
          body.append(h.el('div', { class: 'lab-controls' }, [cL.el, cR.el, cT.el]), readout);
          const qBox = h.el('div', { class: 'dna-tasks' }); body.append(qBox);
          let quizShown = false, qOk = false, ev = null;

          function upd() {
            ev = pairEval(st.L, st.R, st.taut);
            roG.set(ev.fit === 'tight' ? '重叠！（两个嘌呤太宽）' : ev.fit === 'wide' ? ev.gap.toFixed(1) + ' Å（太远，氢键够不着）' : ev.gap.toFixed(1) + ' Å（刚好）');
            roH.set(ev.fit !== 'ok' ? '—' : ev.hb + ' 个' + (ev.clash ? `，${ev.clash} 处冲突（供体对供体 / 受体对受体）` : ''));
            if (ev.good) { const key = [st.L, st.R].sort().join(''); found.add(key); }
            roF.set(found.size ? [...found].map((k) => k.split('').join('–')).join('，') : '—');
            if (ev.good) api.say(`${st.L}–${st.R}：大小正好，${ev.hb} 个氢键全部成立，没有冲突！`, 'good');
            else if (ev.fit === 'tight') api.say('两个嘌呤加起来比骨架间距还宽——硬纸板重叠了。', 'bad');
            else if (ev.fit === 'wide') api.say('两个嘧啶之间留下了大洞，氢键够不着，双螺旋会在这里凹进去。', 'bad');
            else if (ev.clash) api.say(`大小合适，但相对的原子里有 ${ev.clash} 处是供体对供体或受体对受体，不能成键。`, 'info');
            else api.say(`大小合适，但只有 ${ev.hb} 个氢键——太弱了。`, 'info');
            draw();
            if (found.has('AT') && found.has('CG') && !quizShown) showQuiz();
          }
          function showQuiz() {
            quizShown = true;
            const q = h.quiz({
              question: '回想第 1 关：<b>这和查加夫的表有什么关系？</b>',
              options: [
                { label: '没有关系，只是巧合。', ok: false, why: '五种生物、误差 ±3 % 以内都等于 1——很难是巧合。' },
                { label: '每个 A 都对着一个 T、每个 G 都对着一个 C，所以双链里 A = T、G = C。', ok: true, why: '对。查加夫的 1 : 1 正是配对的必然结果，而 A–T 与 G–C 的比例（GC 含量）不受约束，可以随物种变化。单链的 φX174 没有配对伙伴，所以不守规律。' },
                { label: '因为细胞会把四种碱基调到等量。', ok: false, why: '四种碱基并不等量：结核菌的 G 是 34.9 %，A 只有 15.1 %。相等的只是 A 与 T、G 与 C。' },
                { label: '因为 A 与 T、G 与 C 分子量相同。', ok: false, why: '它们的分子量并不相同（A 135、T 126、G 151、C 111），而且表里是摩尔百分比，与分子量无关。' },
              ],
              onOk: () => { qOk = true; api.done('<b>碱基配对。</b> 1953 年 2 月 28 日早上，Watson 在桌上摆弄硬纸板碱基，突然发现 A–T 对和 G–C 对的外形一模一样。在此之前，同办公室的晶体学家 Jerry Donohue 指出：教科书把 G 和 T 画成了烯醇式，实际上它们是酮式——没有这个纠正，配对就对不上。那天中午 Crick 在老鹰酒吧宣布：“我们发现了生命的秘密。”'); },
            });
            qBox.append(q.el); api.typeset(qBox);
          }
          function drawBase(g, b, side, x0, y0, k, ev) {
            // side = +1: attached at left C1′ pointing right; −1: attached at right pointing left
            const col = C({ A: '--s1', T: '--s2', G: '--s3', C: '--s4' }[b]);
            const reach = REACH[KIND[b]], rr = 1.4; // ring "radius" in Å
            const hexC = x0 + side * (reach - rr - 0.35) * k;
            const ring = (cx, cy, r, nv, rot) => { g.beginPath(); for (let i = 0; i <= nv; i++) { const a = rot + (i * 2 * Math.PI) / nv; const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); };
            g.lineWidth = 2; g.strokeStyle = col; g.fillStyle = col;
            g.globalAlpha = 0.18; ring(hexC, y0, rr * k, 6, 0); g.fill(); g.globalAlpha = 1; ring(hexC, y0, rr * k, 6, 0); g.stroke();
            let attachX = hexC - side * rr * k;
            if (KIND[b] === 'pu') { // five-membered ring sharing the inner edge
              const pc = hexC - side * (rr * 1.75) * k;
              g.globalAlpha = 0.18; ring(pc, y0, rr * 0.86 * k, 5, side > 0 ? 0 : Math.PI); g.fill(); g.globalAlpha = 1; ring(pc, y0, rr * 0.86 * k, 5, side > 0 ? 0 : Math.PI); g.stroke();
              attachX = pc - side * rr * 0.86 * k;
            }
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(attachX, y0); g.stroke(); // glycosidic bond
            g.font = 'bold 15px ' + mono(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(b, hexC, y0);
            // edge atoms
            const edgeX = x0 + side * reach * k, ys = [-2.2, 0, 2.2];
            const atoms = ATOM[st.taut][b], roles = EDGE[st.taut][b];
            g.font = '11px ' + mono();
            ys.forEach((dy, i) => {
              const y = y0 + dy * k, role = roles[i];
              g.fillStyle = role === 'D' ? C('--s1') : role === 'A' ? C('--warn') : C('--muted');
              g.textAlign = side > 0 ? 'right' : 'left';
              g.fillText(atoms[i], edgeX + side * 2, y);
            });
          }
          function draw() {
            if (!ev) return;
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
            const k = Math.min((W - 60) / (C1C1 + 2), (Hh - 84) / 9), cx = W / 2, y0 = Hh / 2 + 4;
            const xL = cx - (C1C1 / 2) * k, xR = cx + (C1C1 / 2) * k;
            // backbones
            g.strokeStyle = C('--fg'); g.lineWidth = 4;
            [xL, xR].forEach((x) => { g.beginPath(); g.moveTo(x - 6, 34); g.quadraticCurveTo(x + 4, Hh / 2 + 10, x - 6, Hh - 34); g.stroke(); });
            g.fillStyle = C('--fg'); [xL, xR].forEach((x) => { g.beginPath(); g.arc(x, y0, 4, 0, 7); g.fill(); });
            g.font = '10px ' + mono(); g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
            g.textBaseline = 'middle'; g.textAlign = 'right'; g.fillText('C1′', xL - 7, y0 + 12); g.textAlign = 'left'; g.fillText('C1′', xR + 7, y0 + 12);
            g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('骨架', xL, 32); g.fillText('骨架', xR, 32);
            // scale bar
            const yb = Hh - 14; g.strokeStyle = C('--muted'); g.lineWidth = 1;
            g.beginPath(); g.moveTo(xL, yb - 4); g.lineTo(xL, yb + 4); g.moveTo(xL, yb); g.lineTo(xR, yb); g.moveTo(xR, yb - 4); g.lineTo(xR, yb + 4); g.stroke();
            g.textBaseline = 'bottom'; g.fillText('10.8 Å', cx, yb - 2);
            drawBase(g, st.L, 1, xL, y0, k, ev);
            drawBase(g, st.R, -1, xR, y0, k, ev);
            // overlap / bonds
            const eL = xL + REACH[KIND[st.L]] * k, eR = xR - REACH[KIND[st.R]] * k;
            if (ev.fit === 'tight') { g.fillStyle = C('--warn'); g.globalAlpha = 0.25; g.fillRect(eR, y0 - 3.2 * k, eL - eR, 6.4 * k); g.globalAlpha = 1; g.fillStyle = C('--warn'); g.font = '12px ' + (C('--body-font') || 'sans-serif'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('重叠', cx, y0 - 3.3 * k); }
            else {
              [-2.2, 0, 2.2].forEach((dy, i) => {
                const y = y0 + dy * k, r = ev.rows[i];
                if (ev.fit === 'wide') return;
                if (r === 'hb') { g.strokeStyle = C('--good'); g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(eL + 30, y); g.lineTo(eR - 30, y); g.stroke(); g.setLineDash([]); }
                else if (r === 'clash') { g.strokeStyle = C('--warn'); g.lineWidth = 2; const m = (eL + eR) / 2; g.beginPath(); g.moveTo(m - 4, y - 4); g.lineTo(m + 4, y + 4); g.moveTo(m + 4, y - 4); g.lineTo(m - 4, y + 4); g.stroke(); }
              });
              if (ev.fit === 'wide') { g.fillStyle = C('--warn'); g.font = '12px ' + (C('--body-font') || 'sans-serif'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('空隙 ' + ev.gap.toFixed(1) + ' Å', cx, y0 - 3.4 * k); }
            }
            // legend
            g.font = '10px ' + mono(); g.textBaseline = 'top';
            g.textAlign = 'right'; g.fillStyle = C('--s1'); g.fillText('蓝 = 供体（带 H）', cx - 6, 4);
            g.textAlign = 'left'; g.fillStyle = C('--warn'); g.fillText('橙红 = 受体', cx + 6, 4);
          }
          cv.onResize(draw); upd();
          const unwatch = themeWatch(draw);
          return { destroy() { cv.destroy(); unwatch(); } };
        },
      };

      /* ================= Stage 4 ================= */
      const s4 = {
        title: '它怎么复制自己？',
        task: `<p>双螺旋立刻暗示了一种复制方式：两条链分开，各自作模板合成新链（“半保留”）。但 Delbrück 等人怀疑：缠绕了上百万圈的两条链怎么解得开？也许整条双链原样保留、另造一条全新的（“全保留”）；或者旧链被切成碎片、和新片段拼在一起（“分散”）。</p>
<p>1958 年，加州理工的 Matthew Meselson 和 Franklin Stahl 让大肠杆菌在只含重氮 ¹⁵N 的培养基里繁殖很多代，然后突然换成普通的 ¹⁴N，每过一代取样，把 DNA 放进氯化铯溶液高速离心——DNA 会停在密度与自身相等的位置。下面是紫外吸收扫描。选一个模型，比较它的预测与数据。</p>`,
        hints: [
          '先只看第 0 代和第 1 代。第 1 代只有一条带，而且正好在“重”和“轻”的正中间。哪个模型会在第 1 代给出两条带？',
          '剩下两个模型在第 1 代都给出中间带。展开第 2 代：一个模型预测两条带，另一个预测仍是一条（向轻的方向移动）。',
          '第 2 代是“中间 + 轻”各一半。',
        ],
        answer: `设第 $n$ 代。半保留：中间带占 $2/2^n$，其余为轻带——第 1 代全为中间，第 2 代中间 : 轻 = 1 : 1。全保留：重带 $1/2^n$ + 轻带——第 1 代就应有重、轻两条带，与数据不符。分散：只有一条带，密度在重、轻之间按 $1/2^n$ 移动——第 2 代应是一条位于 1/4 处的带，而不是两条。只有半保留模型与全部数据一致。`,
        build(body, api) {
          const st = { model: 'semi', gens: 1 };
          const stage = h.el('div', { class: 'lab-stage' });
          body.append(stage);
          const cv = h.canvas(stage, { aspect: 0.6, minH: 250, maxH: 360 });
          const cM = h.choice({ label: '叠加哪个模型的预测', options: [{ value: 'semi', label: '半保留' }, { value: 'cons', label: '全保留' }, { value: 'disp', label: '分散' }, { value: 'none', label: '不叠加' }], value: st.model, onChange: (v) => { st.model = v; draw(); } });
          const moreBtn = h.button({ label: '展开第 2、3 代的数据', onClick: () => { st.gens = 3; moreBtn.disabled = true; draw(); showQ2(); } });
          body.append(h.el('div', { class: 'lab-controls' }, [cM.el, h.el('div', { class: 'ctl' }, [moreBtn])]));
          const rnd = mulberry32(1958);
          const obs = [0, 1, 2, 3].map((n) => {
            const bands = predict('semi', n); const pts = [];
            for (let i = 0; i <= 160; i++) {
              const rho = 1.700 + (0.034 * i) / 160;
              let v = 0; bands.forEach(([r0, w]) => { v += w * Math.exp(-((rho - r0) ** 2) / (2 * 0.0011 ** 2)); });
              pts.push([rho, v + 0.03 * (rnd() - 0.5) + 0.01]);
            }
            return pts;
          });
          const qBox = h.el('div', { class: 'dna-tasks' }); body.append(qBox);
          let q1 = false, q2 = false, q2shown = false;
          const qa = h.quiz({
            question: '只看第 0 代和第 1 代的数据，可以<b>排除</b>哪个模型？',
            options: [
              { label: '半保留', ok: false, why: '把预测叠加上去比一比：半保留在第 1 代给出的是一条中间带。' },
              { label: '全保留', ok: true, why: '对。全保留意味着第 1 代有一半双链是原封不动的重 DNA、一半是全新的轻 DNA——应该看到两条带，而不是正中间的一条。' },
              { label: '分散', ok: false, why: '分散模型在第 1 代每条双链都是一半旧一半新，也给出一条中间带。还需要更多数据。' },
              { label: '一个也排除不了', ok: false, why: '看看全保留模型的预测与第 1 代的数据。' },
            ],
            onOk: () => { q1 = true; fin(); },
          });
          qBox.append(qa.el);
          function showQ2() {
            if (q2shown) return; q2shown = true;
            const qb = h.quiz({
              question: '加上第 2、3 代，<b>哪个模型与全部数据一致</b>？',
              options: [
                { label: '半保留', ok: true, why: '对。第 2 代：两条中间带的双链分开，各配一条新的轻链 → 2 条中间 + 2 条轻，比例 1 : 1；第 3 代 1 : 3。中间带的位置从不移动，只是越来越淡。' },
                { label: '全保留', ok: false, why: '它在第 1 代就已经失败了。' },
                { label: '分散', ok: false, why: '分散模型预测第 2 代仍是一条带，位置移到重 : 轻 = 1 : 3 处；数据却是两条带，中间带位置不变。' },
              ],
              onOk: () => { q2 = true; fin(); },
            });
            qBox.append(qb.el);
          }
          function fin() {
            if (q1 && q2) api.done('<b>半保留复制。</b> 每个子代双链都保留一条完整的亲代链、配上一条新合成的链——正是 Watson 和 Crick 在 1953 年第二篇论文里从碱基配对推出的机制：“我们注意到，我们假定的特异配对立即暗示了遗传物质可能的复制机制。” Meselson–Stahl 实验后来被称为“生物学中最美的实验”。');
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
            const pad = { l: 54, r: 12, t: 36, b: 30 }, iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
            const X = (r) => pad.l + ((r - 1.700) / 0.034) * iw;
            const rows = 4, rh = ih / rows;
            g.font = '10px ' + mono(); g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
            [['L', '轻 ¹⁴N/¹⁴N'], ['M', '中间'], ['H', '重 ¹⁵N/¹⁵N']].forEach(([k, lab]) => {
              const x = X(RHO[k]); g.strokeStyle = C('--grid'); g.lineWidth = 1; g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, pad.t + ih); g.stroke();
              g.fillText(RHO[k].toFixed(3), x, pad.t + ih + 3); g.textBaseline = 'bottom'; g.fillText(lab, x, pad.t - 3); g.textBaseline = 'top';
            });
            g.textBaseline = 'bottom'; g.fillText('密度 (g/cm³) →', pad.l + iw / 2, Hh - 1);
            for (let n = 0; n < rows; n++) {
              const y0 = pad.t + rh * n, base = y0 + rh - 6, amp = rh - 14;
              g.fillStyle = C('--fg'); g.textAlign = 'right'; g.textBaseline = 'middle'; g.font = '11px ' + (C('--body-font') || 'sans-serif');
              g.fillText('第 ' + n + ' 代', pad.l - 6, y0 + rh / 2);
              g.strokeStyle = C('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(pad.l, base + 0.5); g.lineTo(pad.l + iw, base + 0.5); g.stroke();
              if (n > st.gens) { g.fillStyle = C('--muted'); g.textAlign = 'center'; g.font = '11px ' + mono(); g.fillText('（尚未取样）', pad.l + iw / 2, y0 + rh / 2); continue; }
              // prediction
              if (st.model !== 'none') {
                predict(st.model, n).forEach(([r0, w]) => {
                  const x = X(r0); g.fillStyle = C('--accent'); g.globalAlpha = 0.18; g.fillRect(x - 5, base - amp * w, 10, amp * w); g.globalAlpha = 1;
                  g.strokeStyle = C('--accent'); g.setLineDash([4, 3]); g.strokeRect(x - 5 + 0.5, base - amp * w + 0.5, 9, amp * w); g.setLineDash([]);
                });
              }
              // observed trace
              g.strokeStyle = C('--s1'); g.lineWidth = 1.8; g.beginPath();
              obs[n].forEach(([r, v], i) => { const x = X(r), y = base - amp * Math.max(0, v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
            }
            g.font = '10px ' + mono(); g.textAlign = 'right'; g.textBaseline = 'top';
            g.textAlign = 'left'; g.fillStyle = C('--s1'); g.fillText('— 测得的紫外吸收', pad.l, 3);
            if (st.model !== 'none') { g.textAlign = 'right'; g.fillStyle = C('--accent'); g.fillText('▯ 模型预测', W - 6, 3); }
          }
          cv.onResize(draw); draw();
          const unwatch = themeWatch(draw);
          return { destroy() { cv.destroy(); unwatch(); } };
        },
      };

      return H.stages(root, ctx, [s1, s2, s3, s4]);
    },
  };
})();
