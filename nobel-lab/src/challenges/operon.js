/* 看不见的锁 — 挑战版（Nobel Medicine 1965: Jacob, Lwoff, Monod，酶与病毒合成的遗传控制）
 *
 * 第一关 诱导的性质：读者在不同碳源 / 添加物下测 β-半乳糖苷酶比活力（Miller 单位，带噪声），
 *   并可跑生长曲线。关键事实：IPTG 不被酶水解却是强诱导剂；苯基-β-D-半乳糖苷是好底物却几乎不诱导；
 *   葡萄糖存在时即使有乳糖也不诱导（诱导物排除 + cAMP-CRP），生长曲线出现二次生长平台。
 *   模型：p_on = 1/(1 + A/(1+s)^4)，A = 1000，s = (IPTG + 0.6·苯基 + 120·乳糖·e)/(1+G/0.12)，
 *   激活项 1/(1+G/0.3)；U = 1 + 1000·e。诱导比 ρ = U_max/U_min ≈ 10³。
 *
 * 第二关 顺式与反式：读者自己搭 F′ 部分二倍体（每条 DNA 选 I ∈ {I⁺,I⁻,Iˢ}、O ∈ {O⁺,O^c}、Z ∈ {Z⁺,Z⁻}），
 *   测 ±IPTG 的活力并记录表型。模型：阻遏蛋白池由两条 DNA 的 I 共同决定（Iˢ 始终有活性，I⁺ 加 IPTG 失活，
 *   I⁻ 无产物）；操纵子 j 开启 ⟺ O_j = O^c 或池中无有效阻遏蛋白。三个目标分别迫使读者发现
 *   I 反式作用、O^c 顺式显性、Iˢ 反式显性造成不可诱导。
 *
 * 第三关 溶源性开关：对称双稳模型 ẋ = α/(1+yⁿ) − δx，ẏ = α/(1+xⁿ) − y（x = CI, y = Cro）。
 *   对称不动点 s(1+sⁿ) = α 不稳定 ⟺ b = n sⁿ/(1+sⁿ) > 1 ⟺ sⁿ > 1/(n−1)；
 *   故双稳需 n > 1 且 α > α_c(n) = s*(1+s*ⁿ)，s* = (n−1)^(−1/n)。n = 2 时 α_c = 2。
 *   紫外 = 把 CI 的降解率提到 δ > 1（RecA 促使 CI 自切割），越过鞍–结分岔后不可逆翻向裂解。
 *
 * 所有实验数值为示意性模拟（固定种子）；真实数值见条目中的原始文献。
 */
(() => {
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gaussOf = (rnd) => { const a = rnd() || 1e-9, b = rnd(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------------- 第一关：lac 开关 + 生长 ---------------- */
  const A_REP = 1000, M_SITE = 4, UMAX = 1000;
  const ponOf = (s) => 1 / (1 + A_REP / Math.pow(1 + Math.max(0, s), M_SITE));
  /* 碳源配方：G 葡萄糖、L 乳糖、Gy 甘油（任意单位 ≈ mM） */
  const MEDIA = {
    gly: { zh: '甘油', G: 0, L: 0, Gy: 10 },
    glu: { zh: '葡萄糖', G: 3, L: 0, Gy: 0 },
    lac: { zh: '乳糖', G: 0, L: 9, Gy: 0 },
    both: { zh: '葡萄糖 + 乳糖', G: 3, L: 9, Gy: 0 },
  };
  const ADDS = {
    none: { zh: '不加', iptg: 0, phe: 0, note: '' },
    iptg: { zh: 'IPTG', iptg: 60, phe: 0, note: '异丙基-β-D-硫代半乳糖苷：硫代糖苷键，不被 β-半乳糖苷酶水解' },
    phe: { zh: '苯基-β-D-半乳糖苷', iptg: 0, phe: 100, note: '很好的底物，水解速率比乳糖还快' },
    tmg: { zh: 'TMG', iptg: 25, phe: 0, note: '甲基-β-D-硫代半乳糖苷：同样不被水解' },
  };
  /* 培养 T 小时后的酶比活力与生长曲线（欧拉积分） */
  function culture(med, add, T = 6, N = 240) {
    const m = MEDIA[med], a = ADDS[add], dt = T / N;
    const muG = 0.92, muL = 0.62, muY = 0.55, KG = 0.05, KL = 0.4, KY = 0.1, Y = 0.30;
    const KEXC = 0.12, KACT = 0.3, CL = 120, KE = 0.7;
    let X = 0.02, G = m.G, L = m.L, Gy = m.Gy, e = 1 / (1 + A_REP);
    const out = { t: [0], X: [X], U: [1 + UMAX * e], G: [G], L: [L] };
    for (let i = 0; i < N; i++) {
      const excl = 1 / (1 + G / KEXC), act = 1 / (1 + G / KACT);
      const s = (a.iptg + 0.006 * a.phe + CL * L * e) * excl;   // 苯基半乳糖苷：好底物，极弱的诱导剂
      e += dt * KE * (act * ponOf(s) - e);
      const vG = (muG * G) / (KG + G), vY = G < 0.02 ? (muY * Gy) / (KY + Gy) : 0;
      const vL = ((muL * L) / (KL + L)) * (e / (e + 0.35));
      G = Math.max(0, G - dt * ((vG * X) / Y)); L = Math.max(0, L - dt * ((vL * X) / Y)); Gy = Math.max(0, Gy - dt * ((vY * X) / Y));
      X *= Math.exp((vG + vL + vY) * dt);
      out.t.push((i + 1) * dt); out.X.push(X); out.U.push(1 + UMAX * e); out.G.push(G); out.L.push(L);
    }
    out.Uend = out.U[out.U.length - 1]; out.Umax = Math.max(...out.U);
    return out;
  }
  /* 稳态（恒化器式）比活力：诱导 3 h 后读数，用于柱状图 */
  function assayU(med, add, rep) {
    const c = culture(med, add, 3, 150);
    const rnd = mul32(1961 + 7919 * hashStr(med + '|' + add) + 131 * rep);
    return Math.max(0.4, c.Uend * (1 + 0.1 * gaussOf(rnd)));
  }

  /* ---------------- 第二关：部分二倍体遗传学 ---------------- */
  const IAL = { 'I+': '野生型调节基因', 'I-': '调节基因失活', 'Is': '调节基因的另一类突变' };
  const OAL = { 'O+': '野生型', 'Oc': '算符区突变' };
  const ZAL = { 'Z+': 'β-半乳糖苷酶基因完好', 'Z-': '酶基因失活（无活性蛋白）' };
  /* 有效阻遏蛋白：Is 始终有效；I+ 在 IPTG 下失效；I- 无产物 */
  function repressorActive(chrs, iptg) {
    return chrs.some((c) => c.I === 'Is') || (chrs.some((c) => c.I === 'I+') && !iptg);
  }
  function activity(chrs, iptg) {
    const R = repressorActive(chrs, iptg);
    let U = 0;
    chrs.forEach((c) => { if (c.Z !== 'Z+') return; const on = c.O === 'Oc' || !R; U += on ? UMAX : UMAX / A_REP; });
    return 1 + U;
  }
  function measure(chrs, iptg, rep = 0) {
    const key = chrs.map((c) => c.I + c.O + c.Z).join('/') + (iptg ? '+' : '-') + rep;
    const rnd = mul32(1959 + hashStr(key));
    return Math.max(0.4, activity(chrs, iptg) * (1 + 0.12 * gaussOf(rnd)));
  }
  function phenotype(chrs) {
    const lo = activity(chrs, false), hi = activity(chrs, true);
    if (lo > 100) return 'con';            // 组成型
    if (hi > 100) return 'ind';            // 可诱导
    return 'non';                          // 不可诱导（含 Z⁻ 导致的无酶）
  }
  const PHZ = { con: '组成型（不加诱导物就大量产酶）', ind: '可诱导（只有加诱导物才产酶）', non: '不可诱导（怎样都不产酶）' };
  const sortedAlleles = (chrs) => ['I', 'O', 'Z'].map((k) => chrs.map((c) => c[k]).sort().join(',')).join(' | ');

  /* ---------------- 第三关：双稳开关 ---------------- */
  const steadySym = (a, n) => { let lo = 1e-9, hi = 1e4; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; m * (1 + Math.pow(m, n)) > a ? (hi = m) : (lo = m); } return (lo + hi) / 2; };
  const alphaC = (n) => { if (n <= 1) return Infinity; const s = Math.pow(n - 1, -1 / n); return s * (1 + Math.pow(s, n)); };
  function relax(a, n, x0, y0, d = 1, T = 60, dt = 0.01) {
    let x = x0, y = y0;
    for (let i = 0; i < Math.round(T / dt); i++) {
      const dx = a / (1 + Math.pow(y, n)) - d * x, dy = a / (1 + Math.pow(x, n)) - y;
      x = Math.max(0, x + dt * dx); y = Math.max(0, y + dt * dy);
    }
    return [x, y];
  }
  function isBistable(a, n) {
    const p = relax(a, n, 4 * a, 0), q = relax(a, n, 0, 4 * a);
    return Math.abs(p[0] - q[0]) > 0.15 * Math.max(a, 0.2);
  }

  const CSS = `
.op-note{font-size:12.5px;color:var(--muted);line-height:1.7;margin:0}
.op-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.op-sec{display:grid;gap:9px;border-top:1px dashed var(--line);padding-top:10px}
.op-sec[hidden]{display:none}
.op-sec h4{margin:0;font-size:13.5px}
.op-tab{overflow-x:auto;border:1px solid var(--line);border-radius:8px;max-height:260px}
.op-tab table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.op-tab th,.op-tab td{padding:4px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.op-tab th{background:var(--panel);color:var(--muted);font-weight:500;position:sticky;top:0;z-index:1}
.op-tab td:first-child,.op-tab th:first-child{text-align:left;font-family:var(--mono-font,monospace)}
.op-tab tr.on td{color:var(--accent)}
.op-chr{display:grid;gap:8px}
.op-chr-box{border:1px solid var(--line);border-radius:8px;padding:8px 10px;display:grid;gap:7px;background:var(--bg)}
.op-chr-box h5{margin:0;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace);letter-spacing:.08em}
.op-pick{display:flex;flex-wrap:wrap;gap:10px}
.op-pick > div{display:grid;gap:3px}
.op-pick span{font-size:11.5px;color:var(--muted)}
.op-goals{display:grid;gap:5px;margin:0;padding:0;list-style:none;font-size:13px}
.op-goals li{display:flex;gap:7px;align-items:flex-start;line-height:1.6}
.op-goals i{font-style:normal;font-family:var(--mono-font,monospace);color:var(--muted);flex:none}
.op-goals li.done i{color:var(--good)}
.op-goals li.done{color:var(--good)}
.op-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.op-leg i{display:inline-block;width:15px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.op-big{font-family:var(--mono-font,monospace);font-size:13.5px;line-height:1.9}
.op-big b{font-size:17px;color:var(--fg)}`;
  const injectCSS = () => { if (!document.getElementById('st-operon')) document.head.append(H.el('style', { id: 'st-operon', text: CSS })); };
  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  const line = (g, A, xs, ys, color, w = 2, dash = null) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
  };
  const legend = (items) => H.el('div', { class: 'op-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  CHALLENGES.operon = {
    title: '看不见的锁',
    _m: { ponOf, culture, assayU, activity, phenotype, alphaC, steadySym, isBistable, relax },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color;

      /* ================= 第一关：诱导到底是什么 ================= */
      const stage1 = {
        title: '诱导到底是什么',
        task: `<p>巴斯德研究所，1950 年代。在只有甘油的培养液里，大肠杆菌几乎不含 β-半乳糖苷酶；加乳糖，几分钟后酶就出现。
          当时流行的解释是<b>底物进入细胞后"指导"蛋白折叠成能分解它的形状</b>——信息从小分子流向蛋白。</p>
          <p>你有 ONPG 显色法（比活力以 Miller 单位计，读数有实验噪声），四种碳源，以及三种半乳糖苷类似物：
          <b>IPTG</b> 和 <b>TMG</b> 带硫代糖苷键，<b>不会被 β-半乳糖苷酶水解</b>；
          <b>苯基-β-D-半乳糖苷</b> 则是很好的底物，水解得比乳糖还快。</p>
          <p><b>任务</b>：设计几组培养，把"是底物"和"能让酶出现"这两件事分开。至少测 6 组不同条件，
          其中要包括"甘油 + IPTG"和"甘油 + 苯基半乳糖苷"。然后量出这个系统的<b>诱导比</b>（最高/最低比活力），
          再回答这些数据能排除什么。顺便跑一条"葡萄糖 + 乳糖"的生长曲线。</p>`,
        hints: [
          '先把"甘油 + 不加"当基线。然后问两个独立的问题：(a) 一个<b>不能被酶作用</b>的分子能不能让酶出现？(b) 一个<b>很好的底物</b>能不能？',
          '如果酶的特异性由底物"塑造"出来，那么 IPTG 既然不被这个酶碰，就不该让它出现；而苯基半乳糖苷既然是好底物，就该让它大量出现。你的读数是反过来的。',
          '诱导比 $\\rho = U_{\\max}/U_{\\min}$ 约 $10^3$：无诱导时每个细胞只有几个酶分子，饱和诱导下上千倍。还要注意"葡萄糖 + 乳糖"一组：乳糖明明在那里，酶却没出来——所以乳糖本身不是开关的全部。',
        ],
        answer: `<b>IPTG 和 TMG 不被 β-半乳糖苷酶水解，却是强诱导剂（莫诺称之为"无偿诱导物"）；苯基-β-D-半乳糖苷是很好的底物，却几乎不诱导。</b>
          这一对事实直接排除了"底物指导酶的形状"：诱导物只是一个<b>信号</b>，被识别的对象不是酶而是别的东西。
          <p>诱导比 $\\rho = U_{\\max}/U_{\\min}\\approx 10^3$。另外"葡萄糖 + 乳糖"里酶不出现，生长曲线分成两段、中间一段几乎不长
          （莫诺 1941 年前后发现的<b>二次生长</b>）：细菌先吃完葡萄糖，停一会儿，再开始用乳糖。
          这说明乳糖系统的合成是<b>可以被关掉的</b>，而关它的信号来自另一种糖。</p>
          <p>（细胞内真正的生理诱导物是乳糖的异构体<b>异乳糖</b>，由 β-半乳糖苷酶的转糖基副反应生成；实验里用不被水解的 IPTG 更干净。）</p>`,
        build(body, api) {
          const S = { med: 'gly', add: 'none', rows: [], grew: false, ansOK: false, quizOK: false };
          const plots = h.el('div', { class: 'lab-stage' });
          const boxB = h.el('div'), boxG = h.el('div');
          plots.append(boxB, boxG);
          const cvB = h.canvas(boxB, { aspect: 0.56, minH: 210, maxH: 300 });
          const cvG = h.canvas(boxG, { aspect: 0.5, minH: 190, maxH: 260 });
          boxG.append(legend([['菌量 OD（对数轴）', col('--fg')], ['β-半乳糖苷酶比活力', col('--s1')], ['葡萄糖', col('--s2'), 1], ['乳糖', col('--s3'), 1]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const cMed = h.choice({ label: '碳源', value: 'gly', options: Object.entries(MEDIA).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.med = v; info(); } });
          const cAdd = h.choice({ label: '额外加入（饱和浓度）', value: 'none', options: Object.entries(ADDS).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.add = v; info(); } });
          ctl.append(cMed.el, cAdd.el);
          const btns = h.el('div', { class: 'op-row' }, [
            h.button({ label: '培养 3 h 后测酶活', kind: 'primary', onClick: () => assay() }),
            h.button({ label: '跑生长曲线（6 h）', onClick: () => { S.grew = true; drawG(); check(); } }),
            h.button({ label: '清空记录', onClick: () => { S.rows = []; drawB(); } }),
          ]);
          const noteEl = h.el('p', { class: 'op-note' });
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { last: h.readout('最近一次读数'), n: h.readout('已测条件'), rng: h.readout('最高 / 最低') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabWrap = h.el('div', { class: 'op-tab dtable' });

          function info() {
            const a = ADDS[S.add];
            noteEl.innerHTML = a.note ? `<b>${a.zh}</b>：${a.note}` : '基线条件：不加任何半乳糖苷类似物。';
          }
          function assay() {
            const key = S.med + '|' + S.add;
            const row = S.rows.find((r) => r.key === key);
            const rep = row ? row.v.length : 0;
            const v = assayU(S.med, S.add, rep);
            if (row) row.v.push(v); else S.rows.push({ key, med: S.med, add: S.add, v: [v] });
            Ro.last.set(`${MEDIA[S.med].zh} + ${ADDS[S.add].zh}：${v.toFixed(1)} Miller`);
            drawB(); table(); check();
          }
          const mean = (r) => r.v.reduce((a, b) => a + b, 0) / r.v.length;
          function table() {
            const rows = S.rows.map((r) => `<tr><td>${MEDIA[r.med].zh} + ${ADDS[r.add].zh}</td><td>${r.v.length}</td><td>${mean(r).toFixed(1)}</td></tr>`).join('');
            tabWrap.innerHTML = `<table><thead><tr><th>条件</th><th>重复</th><th>比活力 (Miller)</th></tr></thead><tbody>${rows || '<tr><td>还没有数据</td><td>—</td><td>—</td></tr>'}</tbody></table>`;
            const ms = S.rows.map(mean);
            Ro.n.set(`${S.rows.length} 种条件，共 ${S.rows.reduce((a, r) => a + r.v.length, 0)} 次`);
            Ro.rng.set(ms.length >= 2 ? `${Math.max(...ms).toFixed(1)} / ${Math.min(...ms).toFixed(2)}（约 ${(Math.max(...ms) / Math.min(...ms)).toFixed(0)} 倍）` : '—');
          }
          const need = () => {
            const has = (m, a) => S.rows.some((r) => r.med === m && r.add === a);
            return { n: S.rows.length, iptg: has('gly', 'iptg'), phe: has('gly', 'phe') };
          };
          function check() {
            const q = need();
            if (q.n >= 6 && q.iptg && q.phe && S.grew && ansBox.hidden) { ansBox.hidden = false; api.typeset(ansBox); api.say('数据够了。先量诱导比，再想想这些读数排除了什么。', 'info'); }
          }
          function drawB() {
            const g = cvB.g, W = cvB.w, Hh = cvB.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 1, y0: 0.4, y1: 2000, logY: true, pad: { l: 50, r: 10, t: 14, b: 58 },
              xTicks: [], yTicks: [1, 10, 100, 1000], fmtY: (v) => String(v), yLabel: '比活力 (Miller, 对数)' }, col);
            if (!S.rows.length) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('选一组条件，按「培养 3 h 后测酶活」', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            const n = S.rows.length, bw = Math.min(46, (A.iw / n) * 0.62);
            g.font = '10px ' + col('--mono-font'); g.textBaseline = 'top';
            S.rows.forEach((r, i) => {
              const xc = A.p.l + (A.iw * (i + 0.5)) / n, m = mean(r);
              const cur = r.med === S.med && r.add === S.add;
              g.fillStyle = col(cur ? '--accent' : '--s1'); g.globalAlpha = cur ? 1 : 0.8;
              const y = A.Y(Math.max(0.45, m));
              g.fillRect(xc - bw / 2, y, bw, A.p.t + A.ih - y); g.globalAlpha = 1;
              // 单次读数的散点
              g.fillStyle = col('--fg');
              r.v.forEach((v, k) => { g.beginPath(); g.arc(xc - bw / 4 + ((k % 3) * bw) / 4, A.Y(Math.max(0.45, v)), 1.9, 0, 7); g.fill(); });
              g.fillStyle = col('--muted'); g.textAlign = 'center';
              const l1 = MEDIA[r.med].zh.replace(' + ', '+'), l2 = ADDS[r.add].zh === '不加' ? '—' : ADDS[r.add].zh.replace('苯基-β-D-半乳糖苷', '苯基半乳糖苷');
              g.fillText(l1.length > 6 ? l1.slice(0, 6) : l1, xc, A.p.t + A.ih + 5);
              g.fillText(l2.length > 7 ? l2.slice(0, 7) : l2, xc, A.p.t + A.ih + 18);
              g.fillStyle = col('--fg'); g.textBaseline = 'bottom';
              g.fillText(m.toFixed(m < 10 ? 1 : 0), xc, y - 2); g.textBaseline = 'top';
            });
          }
          function drawG() {
            const g = cvG.g, W = cvG.w, Hh = cvG.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 8, y0: 0.015, y1: 6, logY: true, pad: { l: 46, r: 12, t: 26, b: 32 },
              xTicks: [0, 2, 4, 6, 8], yTicks: [0.02, 0.1, 0.5, 2], fmtY: (v) => String(v), xLabel: '时间 (h)', yLabel: 'OD（对数）' }, col);
            if (!S.grew) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('按「跑生长曲线」看菌量随时间', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            const c = culture('both', 'none', 8, 400);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            line(g, A, c.t, c.G.map((v) => Math.max(0.016, (v / 3) * 0.5)), col('--s2'), 1.4, [5, 4]);
            line(g, A, c.t, c.L.map((v) => Math.max(0.016, (v / 9) * 0.5)), col('--s3'), 1.4, [5, 4]);
            line(g, A, c.t, c.U.map((v) => Math.max(0.016, (v / UMAX) * 3)), col('--s1'), 1.8);
            line(g, A, c.t, c.X, col('--fg'), 2.4);
            g.restore();
            // 平台期标注
            const mu = c.t.map((_, i) => (i > 0 && i < c.t.length - 1 ? (Math.log(c.X[i + 1]) - Math.log(c.X[i - 1])) / (c.t[i + 1] - c.t[i - 1]) : 0));
            let i0 = -1, i1 = -1;
            for (let i = 5; i < mu.length - 5; i++) { if (mu[i] < 0.3 && c.G[i] < 0.02 && i0 < 0) i0 = i; if (i0 > 0 && mu[i] > 0.3) { i1 = i; break; } }
            if (i0 > 0 && i1 > i0) {
              g.strokeStyle = col('--accent'); g.fillStyle = col('--accent'); g.lineWidth = 1.2; g.setLineDash([3, 3]);
              [i0, i1].forEach((i) => { g.beginPath(); g.moveTo(A.X(c.t[i]), A.p.t); g.lineTo(A.X(c.t[i]), A.p.t + A.ih); g.stroke(); });
              g.setLineDash([]);
              g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'top';
              g.fillText(`平台 ${(c.t[i1] - c.t[i0]).toFixed(1)} h`, (A.X(c.t[i0]) + A.X(c.t[i1])) / 2, A.p.t + 2);
            }
            g.fillStyle = col('--muted'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'bottom';
            g.fillText('葡萄糖 + 乳糖（酶活与糖浓度按比例缩放后叠加）', A.p.l, A.p.t - 5);
          }

          const ansBox = h.el('div', { class: 'op-sec', hidden: true });
          const ans = H.answer({
            label: '这个系统的诱导比 $\\rho = U_{\\max}/U_{\\min}$ ≈ ?（容差：0.4–2.5 倍，用你表里的最大/最小值）', placeholder: '例如 800',
            check: (v) => {
              const ms = S.rows.map(mean); if (ms.length < 2) return { ok: false, msg: '先多测几组。' };
              const own = Math.max(...ms) / Math.min(...ms);
              if (v >= 400 && v <= 2500) return { ok: true, msg: `对：约 $10^3$。无诱导时每个细胞只有几个酶分子，饱和诱导下上千倍。（你表里的比值是 ${own.toFixed(0)}。）` };
              if (v > 2 && v < 50) return { ok: false, msg: '太小了——比一比"甘油+不加"和"甘油+IPTG"这两格。' };
              if (v > 1e4) return { ok: false, msg: '太大了。最低读数是 1 Miller 量级，不是 0。' };
              return { ok: false, msg: `不对。用表里的最大值除以最小值（你的数据给 ${own.toFixed(0)}）。` };
            },
            onOk: () => { S.ansOK = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
          });
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '哪一条与你<b>全部</b>读数相容？',
            options: [
              { label: '底物进入细胞后指导酶折叠成合适的形状', ok: false, why: '那么不被水解的 IPTG 不该诱导，而很好的底物苯基半乳糖苷应该强烈诱导。你的数据正好相反。' },
              { label: '诱导物只是一个信号；酶由基因决定，而这个基因本来被某种东西按住，信号的作用是解除它', ok: true, why: '对。"是不是底物"与"能不能诱导"完全脱钩，说明被识别的对象不是酶。再加上葡萄糖能把它关掉、以及二次生长的平台期，整个系统更像一个<b>可以被按住的开关</b>而不是一条被塑造的生产线。' },
              { label: '乳糖是唯一的开关：有乳糖就有酶，没乳糖就没有', ok: false, why: '"葡萄糖 + 乳糖"一组里乳糖明明在，酶却没有出来。乳糖不是开关的全部。' },
              { label: '酶一直都在，乳糖只是把它激活', ok: false, why: '比活力测的就是水解 ONPG 的能力，无诱导时它低到 $10^{-3}$；而且诱导需要几分钟到几十分钟，是新合成而不是激活。' },
            ],
            onOk: () => { S.quizOK = true; finish(); },
          }).el);
          ansBox.append(h.el('h4', { text: '对账' }), ans.el, quizBox);
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>诱导是解除阻遏，不是指导合成。</b>"无偿诱导物"（IPTG、TMG）不被酶碰却能诱导，
              好底物苯基半乳糖苷却几乎不诱导——信息不可能从底物流向蛋白。加上葡萄糖能关掉它、二次生长出现平台期，
              莫诺由此主张诱导物只是信号，系统默认被某种东西按住。下一关用遗传学把"按住它的东西"找出来。`);
          }

          body.append(plots, ctl, noteEl, btns, roBox, tabWrap, ansBox);
          api.typeset(body);
          info(); table(); drawB(); drawG();
          cvB.onResize(drawB); cvG.onResize(drawG);
          const off = watchTheme(() => { drawB(); drawG(); });
          return { destroy() { off(); cvB.destroy(); cvG.destroy(); } };
        },
      };

      /* ================= 第二关：谁在控制谁 ================= */
      const stage2 = {
        title: '谁在控制谁',
        task: `<p>1957–1960 年。诱导既然是解除某种阻碍，那就该能用遗传学把它拆开。你手里有三类突变：
          调节区的 <b>$I^{-}$</b> 与 <b>$I^{s}$</b>（同一个调节基因的两类不同突变），结构基因旁边的 <b>$O^{c}$</b>，
          以及酶基因本身的失活突变 <b>$Z^{-}$</b>。$I^{-}$ 和 $O^{c}$ 的单倍体表型<b>一模一样</b>：都是组成型。
          $I^{s}$ 则相反：加了诱导物也不产酶。</p>
          <p>决定性的工具是 <b>F′ 接合</b>：把一段带 lac 区的 DNA 送进另一个细胞，做成<b>部分二倍体</b>——
          同一个细胞质里有两套 $(I,O,Z)$，而你可以自由决定哪个等位基因放在哪一条 DNA 上。
          下面两个盒子就是两条 DNA；按一次就测 ±IPTG 的比活力（读数有噪声），结果记进表里。</p>
          <p><b>任务</b>：完成下面三个目标。它们合起来会告诉你每个元件是<b>做出了一种能扩散的东西</b>，
          还是<b>只是 DNA 上的一个位置</b>。</p>`,
        hints: [
          '先把每个突变做成单倍体看一遍（关掉第二条 DNA）。然后问最关键的一句：把一个野生型拷贝放在<b>另一条</b> DNA 上，能不能纠正这个突变？能纠正，说明被破坏的是一种可扩散的产物；不能，说明被破坏的东西<b>只在自己这条分子上起作用</b>。',
          '目标 2 是整个问题的核心。考虑这两个部分二倍体：$I^{+}O^{c}Z^{+}/I^{+}O^{+}Z^{-}$ 与 $I^{+}O^{c}Z^{-}/I^{+}O^{+}Z^{+}$。它们用到的等位基因完全相同，只是 $Z^{-}$ 换到了另一条上。测一测，两者的表型一样吗？',
          '目标 1 用 $O^{c}$（两条 DNA 都是 $I^{+}$ 却仍组成型）；目标 2 用上面那一对（$O^{c}$ 只能"救"与它同一条 DNA 上的 $Z^{+}$，所以第一个组成型、第二个可诱导）；目标 3 用 $I^{s}$ 配一条完好的 $I^{+}O^{+}Z^{+}$（$I^{s}$ 反式显性地造成不可诱导）。',
        ],
        answer: `<b>$I$ 是基因，$O$ 是位点。</b>
          <p>$I^{-}$ 能被反式的 $I^{+}$ 纠正（$I^{-}/I^{+}$ 可诱导），说明 $I^{+}$ 做出一种<b>可扩散的产物</b>，而且这个产物是<b>负的</b>（没有它就一直产酶）——阻遏蛋白。
          $I^{s}$ 在二倍体中<b>反式显性</b>地造成不可诱导：产物还在，只是不再认识诱导物。</p>
          <p>$O^{c}$ 则是<b>顺式显性</b>：$I^{+}O^{c}Z^{+}/I^{+}O^{+}Z^{-}$ 组成型，而把 $Z^{-}$ 换到另一条上的
          $I^{+}O^{c}Z^{-}/I^{+}O^{+}Z^{+}$ 仍然可诱导。两者等位基因清单完全相同，表型却不同，唯一的差别是<b>排列</b>。
          所以 $O$ 不编码任何产物，它是 DNA 上阻遏蛋白结合的那个位置——<b>算符</b>。</p>
          <p>由此得到判据：<i>能被反式的野生型拷贝补偿的是基因，不能的是顺式作用位点。</i>
          受同一个算符控制、协同表达的一串结构基因（$lacZ$、$lacY$、$lacA$）就是一个<b>操纵子</b>
          （Jacob、Perrin、Sánchez、Monod，1960）。PaJaMo 实验（1959）进一步说明 $I$ 的产物是阻遏物而非激活物：
          把 $Z^{+}$ 送进一个没有 $I$ 产物的细胞质，酶<b>立刻</b>以最大速率合成，不需要任何诱导物。</p>`,
        build(body, api) {
          const S = { dip: true, c: [{ I: 'I+', O: 'O+', Z: 'Z+' }, { I: 'I+', O: 'O+', Z: 'Z+' }], rows: [], goals: [false, false, false], quizOK: false };
          const chrs = () => (S.dip ? S.c : [S.c[0]]);
          const stg = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(stg, { aspect: 0.26, minH: 120, maxH: 170 });

          const picks = [0, 1].map((k) => {
            const sup = (v) => ({ 'I+': 'I⁺', 'I-': 'I⁻', Is: 'Iˢ', 'O+': 'O⁺', Oc: 'Oᶜ', 'Z+': 'Z⁺', 'Z-': 'Z⁻' })[v] || v;
            const mk = (key, dict) => h.choice({ label: key, value: S.c[k][key], options: Object.keys(dict).map((v) => ({ value: v, label: sup(v) })), onChange: (v) => { S.c[k][key] = v; draw(); } });
            const cI = mk('I', IAL), cO = mk('O', OAL), cZ = mk('Z', ZAL);
            const boxes = h.el('div', { class: 'op-pick' }, [cI.el, cO.el, cZ.el]);
            return { el: h.el('div', { class: 'op-chr-box' }, [h.el('h5', { text: k === 0 ? 'DNA 1（染色体）' : 'DNA 2（F′ 带来的）' }), boxes]), set: (c) => { cI.set(c.I); cO.set(c.O); cZ.set(c.Z); } };
          });
          const tDip = h.toggle({ label: '部分二倍体（关掉则只剩 DNA 1，即单倍体）', value: true, onChange: (b) => { S.dip = b; picks[1].el.hidden = !b; draw(); } });
          const chrBox = h.el('div', { class: 'op-chr' }, [picks[0].el, picks[1].el]);

          const btns = h.el('div', { class: 'op-row' }, [
            h.button({ label: '测这个菌株（±IPTG）', kind: 'primary', onClick: run }),
            h.button({ label: '清空记录', onClick: () => { S.rows = []; table(); } }),
          ]);
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { lo: h.readout('不加 IPTG'), hi: h.readout('加饱和 IPTG'), ph: h.readout('表型判定') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabWrap = h.el('div', { class: 'op-tab dtable' });

          const GOALS = [
            '做出一个<b>组成型</b>菌株，但它<b>两条 DNA 上的 $I$ 都是 $I^{+}$</b>（也就是：阻遏蛋白完好，酶却照样大量合成）。',
            '做出<b>两个</b>菌株，它们用到的 $I$、$O$、$Z$ 等位基因<b>清单完全相同</b>（只是哪个放在哪一条 DNA 上不同），表型却<b>不同</b>。',
            '做出一个<b>加了饱和 IPTG 也不产酶</b>的菌株，而它的两条 DNA 里至少有一条是完好的 $I^{+}O^{+}Z^{+}$。',
          ];
          const goalEls = GOALS.map((g, i) => h.el('li', {}, [h.el('i', { text: '○' }), h.el('span', { html: `目标 ${i + 1}：${g}` })]));
          const goalBox = h.el('ul', { class: 'op-goals' }, goalEls);

          function run() {
            const cs = chrs().map((c) => ({ ...c }));
            const key = cs.map((c) => c.I + ' ' + c.O + ' ' + c.Z).join(' / ');
            const rep = S.rows.filter((r) => r.key === key).length;
            const lo = measure(cs, false, rep), hi = measure(cs, true, rep), ph = phenotype(cs);
            S.rows.push({ key, cs, lo, hi, ph });
            Ro.lo.set(lo.toFixed(1) + ' Miller'); Ro.hi.set(hi.toFixed(1) + ' Miller'); Ro.ph.set(PHZ[ph]);
            table(); checkGoals();
          }
          const fmtG = (cs) => cs.map((c) => `${c.I} ${c.O} ${c.Z}`.replace(/\+/g, '⁺').replace(/I-/, 'I⁻').replace(/Z-/, 'Z⁻').replace(/Is/, 'Iˢ').replace(/Oc/, 'Oᶜ')).join(' / ');
          function table() {
            const rows = S.rows.map((r, i) => `<tr class="${i === S.rows.length - 1 ? 'on' : ''}"><td>${fmtG(r.cs)}</td><td>${r.lo.toFixed(1)}</td><td>${r.hi.toFixed(1)}</td><td>${{ con: '组成型', ind: '可诱导', non: '不可诱导' }[r.ph]}</td></tr>`).join('');
            tabWrap.innerHTML = `<table><thead><tr><th>基因型</th><th>−IPTG</th><th>+IPTG</th><th>表型</th></tr></thead><tbody>${rows || '<tr><td>还没有数据</td><td>—</td><td>—</td><td>—</td></tr>'}</tbody></table>`;
          }
          function checkGoals() {
            const g = [...S.goals];
            // 目标 1：组成型 + 两条 DNA 都是 I+（必须是二倍体）
            g[0] = g[0] || S.rows.some((r) => r.ph === 'con' && r.cs.length === 2 && r.cs.every((c) => c.I === 'I+'));
            // 目标 2：等位基因清单相同、表型不同的两个二倍体
            if (!g[1]) {
              for (let i = 0; i < S.rows.length && !g[1]; i++) for (let j = i + 1; j < S.rows.length; j++) {
                const a = S.rows[i], b = S.rows[j];
                if (a.cs.length === 2 && b.cs.length === 2 && sortedAlleles(a.cs) === sortedAlleles(b.cs) && a.ph !== b.ph) { g[1] = true; break; }
              }
            }
            // 目标 3：不可诱导，且至少一条 DNA 是完好的 I+ O+ Z+
            g[2] = g[2] || S.rows.some((r) => r.ph === 'non' && r.cs.some((c) => c.I === 'I+' && c.O === 'O+' && c.Z === 'Z+'));
            g.forEach((v, i) => { if (v && !S.goals[i]) { goalEls[i].classList.add('done'); goalEls[i].firstChild.textContent = '●'; } });
            S.goals = g;
            if (g.every(Boolean) && quizBox.hidden) {
              quizBox.hidden = false; api.typeset(quizBox);
              api.say('三个目标都达到了。注意目标 2 的那一对：等位基因一样，只是排列不同，表型却不同。最后一问。', 'good');
            }
          }
          const quizBox = h.el('div', { class: 'op-sec', hidden: true });
          quizBox.append(h.el('h4', { text: '它们各是什么' }), H.quiz({
            question: '把三个目标的结果放在一起，最合理的结论是：',
            options: [
              { label: '$I$ 和 $O$ 都是基因，各编码一个蛋白，一个正调控一个负调控', ok: false, why: '如果 $O$ 编码一个可扩散的产物，那么目标 2 的那一对菌株（等位基因清单完全相同）就该有相同的表型。它们没有。' },
              { label: '$I$ 编码一个可扩散的<b>阻遏</b>产物；$O$ 不编码产物，只是同一条 DNA 上阻遏蛋白结合的<b>位置</b>', ok: true, why: '对。$I^{-}$ 能被反式的 $I^{+}$ 纠正（可扩散），$I^{s}$ 反式显性地造成不可诱导（产物还在但不认诱导物）；而 $O^{c}$ 只"救"与它共线的 $Z^{+}$，是<b>顺式显性</b>。这就是算符与操纵子。' },
              { label: '$I$ 编码一个激活因子，诱导物帮它结合 DNA', ok: false, why: '若 $I$ 的产物是激活因子，$I^{-}$ 就该不产酶，而 $I^{-}$ 的单倍体是<b>组成型</b>。PaJaMo 实验更直接：把 $Z^{+}$ 送进没有 $I$ 产物的细胞质，酶立刻全速合成。' },
              { label: '$O^{c}$ 是 $Z$ 基因的一个启动突变，使酶的活性变高', ok: false, why: '$O^{c}$ 改变的是"要不要合成"，不是酶本身：在 $O^{c}Z^{-}/O^{+}Z^{+}$ 里它什么也救不了，而换个排列就组成型。而且诱导比变化的是酶的<b>量</b>。' },
            ],
            onOk: () => { S.quizOK = true; api.done(`<b>算符与操纵子。</b>能被反式的野生型拷贝补偿的是<b>基因</b>（$I$ → 阻遏蛋白），
              不能的是<b>顺式作用位点</b>（$O$ → 阻遏蛋白的结合位置）。受同一个算符控制、被转录成一条信使 RNA 的那一串结构基因
              就是一个操纵子（Jacob、Perrin、Sánchez、Monod，1960）。这把"基因"和"调控元件"分成了两类不同的东西，
              今天的启动子、增强子、cis-eQTL 都沿用这一刀。`); },
          }).el);

          /* DNA 示意图 */
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h, cs = chrs();
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const R = repressorActive(cs, false);
            const nrow = cs.length, pad = 12, gapR = 8;
            const rowH = Math.min(44, (Hh - 30 - (nrow - 1) * gapR) / nrow), y0 = 10;
            g.font = '11px ' + col('--mono-font');
            cs.forEach((c, k) => {
              const y = y0 + k * (rowH + gapR), x0 = pad + 34, x1 = W - pad - 76, w = x1 - x0;
              const on = c.O === 'Oc' || !R;
              g.fillStyle = col('--muted'); g.textAlign = 'left'; g.textBaseline = 'middle';
              g.fillText('DNA' + (k + 1), pad, y + rowH / 2);
              // 骨架
              g.strokeStyle = col('--line'); g.lineWidth = 2;
              g.beginPath(); g.moveTo(x0, y + rowH / 2); g.lineTo(x1, y + rowH / 2); g.stroke();
              const SUP = { 'I+': 'I⁺', 'I-': 'I⁻', Is: 'Iˢ', 'O+': 'O⁺', Oc: 'Oᶜ', 'Z+': 'Z⁺', 'Z-': 'Z⁻' };
              const segs = [[0, 0.2, c.I, '--s4'], [0.22, 0.34, c.O, '--s2'], [0.36, 1, c.Z, on && c.Z === 'Z+' ? '--good' : '--s1']];
              const top = y + 6, hh = rowH - 12;
              segs.forEach(([a, b, lab, cc]) => {
                const xa = x0 + w * a, xb = x0 + w * b;
                g.fillStyle = col(cc); g.globalAlpha = lab.includes('-') ? 0.28 : 0.7;
                g.fillRect(xa, top, xb - xa, hh); g.globalAlpha = 1;
                g.strokeStyle = col(cc); g.lineWidth = 1.4; g.strokeRect(xa + 0.5, top + 0.5, xb - xa - 1, hh - 1);
                g.fillStyle = col('--fg'); g.textAlign = 'center'; g.textBaseline = 'middle';
                g.fillText(SUP[lab] + (b === 1 ? '  Y  A' : ''), (xa + xb) / 2, top + hh / 2);
              });
              // 阻遏蛋白：坐在算符上
              if (R && c.O !== 'Oc') {
                const xo = x0 + w * 0.28;
                g.fillStyle = col('--warn');
                g.beginPath(); g.arc(xo, top - 1, 4.5, Math.PI, 0); g.fill();
              }
              g.fillStyle = col(on && c.Z === 'Z+' ? '--good' : '--muted'); g.textAlign = 'left'; g.textBaseline = 'middle';
              g.fillText(on ? (c.Z === 'Z+' ? '→ 有酶' : '→ 无活性蛋白') : '被按住', x1 + 6, top + hh / 2);
            });
            g.fillStyle = col('--muted'); g.textAlign = 'left'; g.textBaseline = 'bottom';
            g.fillText(R ? '细胞质：有有效阻遏蛋白（图示 −IPTG 时）' : '细胞质：无有效阻遏蛋白（图示 −IPTG 时）', pad, Hh - 3);
          }

          body.append(stg, tDip.el, chrBox, btns, roBox, goalBox, tabWrap, quizBox);
          api.typeset(body);
          table(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ================= 第三关：溶源性的开关 ================= */
      const stage3 = {
        title: '溶源性的开关',
        task: `<p>莱沃夫那一侧的问题：有些细菌携带 λ 噬菌体却不裂解，这份病毒基因组安静地传给后代几十代；
          用紫外灯照一下，整批细菌在一个多小时后同时裂解。什么东西能把一份完整的病毒基因组按住这么久，
          又能被一个外部信号一次性解除？</p>
          <p>假设答案是同一类东西：两个阻遏蛋白<b>互相</b>压制。记 $x$ 为溶源蛋白 CI 的浓度、$y$ 为裂解蛋白 Cro 的浓度，
          以降解率为时间单位：</p>
          $$\\dot x=\\frac{\\alpha}{1+y^{n}}-\\delta\\,x,\\qquad \\dot y=\\frac{\\alpha}{1+x^{n}}-y .$$
          <p>$\\alpha$ 是合成强度，$n$ 是阻遏的协同性（一个阻遏蛋白要几聚体才管用），$\\delta$ 是 CI 的降解率，平时为 1。</p>
          <p><b>任务（两步）</b>：第一步，调 $\\alpha$ 与 $n$，让系统<b>真的有两个稳定态</b>——
          右图从两个不同初值各放一条轨迹，两条必须落到<b>不同</b>的终点（这才叫"记得住自己是溶源还是裂解"）。
          第二步，在双稳状态下从溶源态出发，按「紫外照射」把 $\\delta$ 临时抬高，让系统<b>不可逆地</b>翻到裂解态
          （紫外停了也回不去）。</p>`,
        hints: [
          '先固定 $n=1$，把 $\\alpha$ 从小到大拉满，看两条轨迹会不会分开。再把 $n$ 加到 2、3 试试。这件事本身就是答案的一半。',
          '$n=1$ 时无论 $\\alpha$ 多大都只有一个稳定态。把对称解 $x=y=s$ 代入可以看出为什么：$s(1+s^{n})=\\alpha$ 唯一确定 $s$，而它失稳的条件只和 $n s^{n}/(1+s^{n})$ 有关，与 $\\alpha$ 的关系只通过 $s$。',
          '取 $n=2$、$\\alpha\\gtrsim 2.2$ 就双稳了。然后把紫外强度（$\\delta$）调到 1.5 左右、照射时间给够：CI 被降解得比合成快，$y$ 趁机爬起来压住 $x$，等紫外停下来系统已经在另一个吸引域里了。',
        ],
        answer: `<b>双稳需要协同性。</b>对称不动点 $x=y=s$ 由 $s(1+s^{n})=\\alpha$ 唯一确定（左端严格递增）。
          雅可比矩阵为 $\\begin{pmatrix}-1&-b\\\\-b&-1\\end{pmatrix}$，其中（利用 $\\alpha/(1+s^{n})=s$）
          $$b=\\frac{\\alpha n s^{\\,n-1}}{(1+s^{n})^{2}}=\\frac{n s^{n}}{1+s^{n}} ,$$
          特征值 $-1\\pm b$。故对称解失稳 $\\iff b\\gt1\\iff s^{n}\\gt\\dfrac{1}{n-1}$，这要求 $n\\gt1$；
          代回 $s_*=(n-1)^{-1/n}$ 得阈值 $\\alpha_c(n)=s_*\\big(1+s_*^{\\,n}\\big)$，特别地 $n=2$ 时 $s_*=1$、$\\alpha_c=2$。
          $n=1$ 时 $b=s/(1+s)\\lt1$ 恒成立：<b>没有协同性就没有记忆</b>，无论合成多强。
          <p><b>紫外 = 把 $\\delta$ 抬上去。</b>紫外造成 DNA 损伤 → 激活 RecA → 促使 CI 自切割。
          随 $\\delta$ 增大，溶源态与鞍点相遇并消失（鞍–结分岔），系统落入裂解态；紫外停止后 $\\delta$ 回到 1，
          但状态已在另一个吸引域里，于裂解态稳定——这就是莱沃夫 1950 年看到的诱导，也是开关"不可逆"的含义。</p>
          <p>λ 的真实线路与此同构：CI 结合 $O_L$、$O_R$ 关掉裂解基因并正向维持自身转录，Cro 反过来压住 $cI$。
          2000 年 Gardner、Cantor 与 Collins 在大肠杆菌里用两个互相阻遏的基因造出人工双稳开关，用的就是这组方程。</p>`,
        build(body, api) {
          const S = { a: 1.2, n: 1, d: 1, uv: 0, t: 0, x: 0, y: 0, traj: [], bi: false, uvDone: false, ansOK: false };
          const plots = h.el('div', { class: 'lab-stage' });
          const boxP = h.el('div'), boxT = h.el('div');
          plots.append(boxP, boxT);
          const cvP = h.canvas(boxP, { aspect: 0.72, minH: 230, maxH: 330 });
          boxP.append(legend([['轨迹 A（CI 略占优）', col('--s1')], ['轨迹 B（Cro 略占优）', col('--s2')], ['紫外轨迹', col('--warn')], ['零斜线', col('--muted'), 1]]));
          const cvT = h.canvas(boxT, { aspect: 0.42, minH: 170, maxH: 230 });
          boxT.append(legend([['CI（溶源）', col('--s1')], ['Cro（裂解）', col('--s2')], ['紫外', col('--warn')]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const sA = h.slider({ label: '合成强度 α', min: 0.4, max: 12, step: 0.05, value: S.a, format: (v) => v.toFixed(2), onInput: (v) => { S.a = v; upd(); } });
          const sN = h.slider({ label: '协同性 n', min: 1, max: 4, step: 0.1, value: S.n, format: (v) => v.toFixed(1), onInput: (v) => { S.n = v; upd(); } });
          const sU = h.slider({ label: '紫外强度（照射时 CI 的降解率 δ）', min: 1, max: 4, step: 0.05, value: 1.5, format: (v) => v.toFixed(2), onInput: () => { } });
          ctl.append(sA.el, sN.el, sU.el);
          const btns = h.el('div', { class: 'op-row' }, [
            h.button({ label: '从溶源态开始（CI 高）', onClick: () => { setState('lys'); } }),
            h.button({ label: '紫外照射 20 个时间单位', kind: 'primary', onClick: uvShot }),
            h.button({ label: '重来', onClick: () => { S.traj = []; setState('lys'); } }),
          ]);
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { st: h.readout('两条轨迹的终点'), bi: h.readout('双稳 / 单稳'), cur: h.readout('当前状态 (CI, Cro)'), fate: h.readout('紫外之后') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));

          const ansBox = h.el('div', { class: 'op-sec', hidden: true });
          const ans = H.answer({
            label: '$n=2$ 时双稳所需的阈值 $\\alpha_c$ = ?（容差 ±0.15）', placeholder: 'α_c',
            check: (v) => {
              if (Math.abs(v - 2) <= 0.15) return { ok: true, msg: '对：$n=2$ 时 $s_*=(n-1)^{-1/n}=1$，$\\alpha_c=s_*(1+s_*^{n})=2$。失稳条件 $b=n s^{n}/(1+s^{n})\\gt1$ 在 $n=1$ 时永远不成立，所以没有协同性就没有记忆。' };
              if (Math.abs(v - 1) < 0.1) return { ok: false, msg: '$s_*=1$ 是对称不动点的位置，不是 $\\alpha_c$。把它代回 $s(1+s^{n})=\\alpha$。' };
              if (Math.abs(v - 4) < 0.2) return { ok: false, msg: '再算一次：$s_*=1$，$1+s_*^{2}=2$，所以 $\\alpha_c=1\\times2$。' };
              return { ok: false, msg: '不对。失稳条件 $n s^{n}/(1+s^{n})\\gt1$ 给 $s_*=(n-1)^{-1/n}$，再代回 $\\alpha=s(1+s^{n})$。' };
            },
            onOk: () => { S.ansOK = true; finish(); },
          });
          ansBox.append(h.el('h4', { text: '把阈值算出来' }),
            h.el('p', { class: 'op-note', html: '对称不动点 $x=y=s$ 满足 $s(1+s^{n})=\\alpha$。把雅可比矩阵写出来会发现它的非对角元 $b$ 可以只用 $n$ 和 $s$ 表示。' }),
            ans.el);

          function setState(which) {
            const s = steadySym(S.a, S.n);
            if (which === 'lys') { const p = relax(S.a, S.n, 4 * S.a, 0); S.x = p[0]; S.y = p[1]; }
            else { S.x = s; S.y = s; }
            S.uv = 0; S.traj = [[S.x, S.y]];
            upd();
          }
          function uvShot() {
            const d = +sU.input.value, dt = 0.01;
            let x = S.x, y = S.y;
            for (let i = 0; i < 2000; i++) {
              const dx = S.a / (1 + Math.pow(y, S.n)) - d * x, dy = S.a / (1 + Math.pow(x, S.n)) - y;
              x = Math.max(0, x + dt * dx); y = Math.max(0, y + dt * dy);
              if (i % 8 === 0) S.traj.push([x, y]);
            }
            const mid = [x, y];
            for (let i = 0; i < 8000; i++) {
              const dx = S.a / (1 + Math.pow(y, S.n)) - x, dy = S.a / (1 + Math.pow(x, S.n)) - y;
              x = Math.max(0, x + dt * dx); y = Math.max(0, y + dt * dy);
              if (i % 8 === 0) S.traj.push([x, y]);
            }
            S.x = x; S.y = y; S.uv = d;
            const flipped = y > x * 1.5;
            Ro.fate.set(flipped ? `翻到裂解态：CI ${x.toFixed(2)} ≪ Cro ${y.toFixed(2)}` : `又回到溶源态：CI ${x.toFixed(2)} ＞ Cro ${y.toFixed(2)}`);
            if (flipped && S.bi && !S.uvDone) {
              S.uvDone = true; ansBox.hidden = false; api.typeset(ansBox);
              api.say(`紫外停了，系统<b>没有</b>回到溶源态——开关翻过去就不回头了（鞍–结分岔）。紫外照射时的中途状态是 (${mid[0].toFixed(2)}, ${mid[1].toFixed(2)})。最后把阈值算出来。`, 'good');
            } else if (flipped && !S.bi) api.say('翻过去了，但现在系统不是双稳的：它只有一个稳定态，所谓"翻转"只是被拖到同一个终点。先把双稳做出来。', 'bad');
            else if (!flipped) api.say('紫外一停就回去了：δ 还不够大，或者照射时间不够，没有越过鞍点。', 'info');
            upd();
          }
          function upd() {
            const p = relax(S.a, S.n, 4 * S.a, 0), q = relax(S.a, S.n, 0, 4 * S.a);
            S.bi = isBistable(S.a, S.n);
            S.pq = [p, q];
            Ro.st.set(`(${p[0].toFixed(2)}, ${p[1].toFixed(2)}) 与 (${q[0].toFixed(2)}, ${q[1].toFixed(2)})`);
            const ac = alphaC(S.n);
            Ro.bi.set((S.bi ? '双稳' : '单稳') + `　α_c(n) ${isFinite(ac) ? '= ' + ac.toFixed(2) : '= ∞（n ≤ 1）'}`);
            Ro.cur.set(`(${S.x.toFixed(2)}, ${S.y.toFixed(2)})` + (S.uv ? `　上次 δ = ${S.uv.toFixed(2)}` : ''));
            if (S.bi && !S.uvDone && !api.solved()) api.say('双稳了：两条轨迹落到不同终点，系统"记得"自己在哪一边。接下来从溶源态出发，用紫外把它推过去。', 'good');
            draw();
          }
          function finish() { if (S.ansOK) api.done(`<b>原噬菌体被一个阻遏蛋白按住，紫外解除了它。</b>两个互相阻遏的基因只要有协同性（$n\\gt1$）
            且合成够强（$\\alpha\\gt\\alpha_c$）就构成双稳开关，这就是溶源态能稳定遗传几十代的原因；
            紫外经 RecA 促使 CI 自切割（等于把 $\\delta$ 抬高），越过鞍–结分岔后不可逆地落入裂解——莱沃夫 1950 年的诱导现象。
            lac 的阻遏蛋白和 λ 的 CI 是同一类分子：1965 年的颁奖词把"酶的合成"和"病毒的合成"并列，因为答案是同一个。`); }

          function draw() {
            // 相图
            let g = cvP.g, W = cvP.w, Hh = cvP.h;
            const M = Math.max(1.2, S.a * 1.15);
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const tk = (m) => { const st = m <= 2 ? 0.5 : m <= 6 ? 1 : 3; const o = []; for (let v = 0; v <= m + 1e-9; v += st) o.push(+v.toFixed(2)); return o; };
            let A = h.axes(g, W, Hh, { x0: 0, x1: M, y0: 0, y1: M, pad: { l: 44, r: 12, t: 12, b: 34 }, xTicks: tk(M), yTicks: tk(M), fmtX: (v) => String(v), fmtY: (v) => String(v), xLabel: 'CI（溶源蛋白）x', yLabel: 'Cro y' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 零斜线
            const NY = 120;
            const nx = [], ny = [], mx = [], my = [];
            for (let i = 0; i <= NY; i++) { const y = (M * i) / NY; nx.push(S.a / (1 + Math.pow(y, S.n))); ny.push(y); }
            for (let i = 0; i <= NY; i++) { const x = (M * i) / NY; mx.push(x); my.push(S.a / (1 + Math.pow(x, S.n))); }
            line(g, A, nx, ny, col('--muted'), 1.4, [5, 4]);
            line(g, A, mx, my, col('--muted'), 1.4, [2, 3]);
            // 两条参照轨迹：从对称点附近略偏两侧出发，走出整条分离线
            const s0 = steadySym(S.a, S.n), eps = Math.max(0.03, 0.05 * s0);
            [[s0 + eps, s0 - eps, '--s1'], [s0 - eps, s0 + eps, '--s2']].forEach(([x0, y0, cc]) => {
              let x = x0, y = y0; const xs = [x], ys = [y], dt = 0.01;
              for (let i = 0; i < 8000; i++) {
                const dx = S.a / (1 + Math.pow(y, S.n)) - x, dy = S.a / (1 + Math.pow(x, S.n)) - y;
                x = Math.max(0, x + dt * dx); y = Math.max(0, y + dt * dy);
                if (i % 8 === 0) { xs.push(x); ys.push(y); }
              }
              line(g, A, xs, ys, col(cc), 1.8);
              g.fillStyle = col(cc); g.beginPath(); g.arc(A.X(x), A.Y(y), 4.5, 0, 7); g.fill();
            });
            // 对称不动点（双稳时是鞍点）
            g.strokeStyle = col('--muted'); g.lineWidth = 1.4;
            g.beginPath(); g.arc(A.X(s0), A.Y(s0), 3.5, 0, 7); g.stroke();
            // 紫外轨迹
            if (S.traj.length > 1) line(g, A, S.traj.map((p) => p[0]), S.traj.map((p) => p[1]), col('--warn'), 2);
            g.fillStyle = col('--accent'); g.strokeStyle = col('--panel'); g.lineWidth = 2;
            g.beginPath(); g.arc(A.X(S.x), A.Y(S.y), 5.5, 0, 7); g.fill(); g.stroke();
            g.restore();
            g.fillStyle = col('--muted'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
            g.fillText(S.bi ? '双稳' : '单稳', A.p.l + A.iw - 4, A.p.t + 3);
            g.textBaseline = 'bottom';
            g.fillStyle = col('--s1'); g.textAlign = 'left'; g.fillText('溶源', A.p.l + 4, A.p.t + A.ih - 4);
            g.fillStyle = col('--s2'); g.fillText('裂解', A.p.l + 4, A.p.t + 16);
            // 时间进程（最后一次紫外）
            g = cvT.g; W = cvT.w; Hh = cvT.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            A = h.axes(g, W, Hh, { x0: 0, x1: 100, y0: 0, y1: M, pad: { l: 44, r: 12, t: 12, b: 32 }, xTicks: [0, 20, 40, 60, 80, 100], yTicks: tk(M), fmtY: (v) => String(v), xLabel: '时间（以降解率为单位）', yLabel: '浓度' }, col);
            if (S.traj.length < 3) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('按「紫外照射」看时间进程', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
            } else {
              const dtS = 0.08, ts = S.traj.map((_, i) => i * dtS);
              g.fillStyle = col('--warn'); g.globalAlpha = 0.14; g.fillRect(A.X(0), A.p.t, A.X(20) - A.X(0), A.ih); g.globalAlpha = 1;
              g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
              line(g, A, ts, S.traj.map((p) => p[0]), col('--s1'), 2);
              line(g, A, ts, S.traj.map((p) => p[1]), col('--s2'), 2);
              g.restore();
              g.fillStyle = col('--warn'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
              g.fillText('紫外 δ = ' + S.uv.toFixed(2), A.X(1), A.p.t + 3);
            }
          }

          body.append(plots, ctl, btns, roBox, ansBox);
          api.typeset(body);
          setState('lys');
          cvP.onResize(draw); cvT.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cvP.destroy(); cvT.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
