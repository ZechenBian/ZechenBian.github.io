/* 煮坏了的药 — 挑战版（Nobel Medicine 2015: 屠呦呦；坎贝尔与大村智）
 *
 * 第一关 不可重复的抑制率：读者用鼠疟模型测青蒿提取物，可改产地/部位/采收期/提取方法。
 *   模型：有效成分含量 w = w0(产地)×f_part×f_season；提取回收率 Y = exp(−k(T)·t)，
 *   k = A·exp(−Ea/RT)，Ea = 110 kJ/mol；剂量 D ∝ w·Y·(酸性部分去除与否)；
 *   抑制率按希尔曲线 I = D^n/(ED50^n + D^n)，n_H = 2。水煎（100 ℃，时间有批次波动）落在陡峭段，
 *   于是抑制率方差极大（68% / 12%…）；低温乙醚把 D 推进饱和段，抑制率锁定在接近 100%。
 *   读者要发现：方差大 ≠ 没活性，而是有一个没控制住的变量（温度）。
 *
 * 第二关 191 号：读者自己设计提取（溶剂、温度、时长、是否碱洗去酸性部分），目标把抑制率做到 ≥ 95%
 *   且可重复（连续三批 SD 小）。真值 = 低温（≤ 40 ℃）乙醚 + 去酸性部分，对应 1971-10-04 的 191 号样品。
 *
 * 第三关 清除曲线与 ACT：双药 PK/PD 模型。P(t) 按 exp(−κ(c)) 衰减，κ 为 S 形浓度依赖；
 *   c_A = 短效（t½ = 2 h）、c_B = 长效（t½ = 150 h）。耐药突变的选择窗 = 使"敏感被杀、耐药存活"的浓度区间。
 *   读者要做到：三天疗程后 42 天不复燃，并且耐药株未被选出。单用青蒿素必然复燃（残余 ~1e6）。
 *
 * 实验数值为示意性模拟（固定种子）；历史数字见条目正文与原始文献。
 */
(() => {
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gaussOf = (rnd) => { const a = rnd() || 1e-9, b = rnd(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------------- 第一、二关：提取与鼠疟 ---------------- */
  const RGAS = 8.314, EA = 110e3;                 // 过氧键热降解的活化能（量级）
  /* 标定：100 ℃ 下 k·30 min = 0.9（水煎 30 min 只剩约 41%）。k(100)/k(60) = 71。 */
  const KREF = 0.9 / 30, A0 = KREF / Math.exp(-EA / (RGAS * 373.15));
  const kT = (T) => A0 * Math.exp(-EA / (RGAS * (T + 273.15)));   // 1/min
  const ORIGIN = { sc: { zh: '四川（黄花蒿）', w: 1.0 }, bj: { zh: '北京本地', w: 0.45 } };
  const PART = { leaf: { zh: '叶', f: 1.0 }, stem: { zh: '茎', f: 0.05 }, whole: { zh: '全草（叶+茎）', f: 0.40 } };
  const SEASON = { bud: { zh: '花蕾期', f: 1.0 }, flower: { zh: '盛花期', f: 0.55 }, late: { zh: '枯萎期', f: 0.20 } };
  const SOLVENT = { water: { zh: '水', e: 0.45 }, etoh: { zh: '乙醇', e: 0.62 }, ether: { zh: '乙醚', e: 1.0 } };
  const RATIO = 6.5, NH = 2, DEAC = 0.75;        // r = D/ED50；NH 为希尔系数

  /* 一次提取 + 一次鼠疟测试。p = {origin,part,season,solvent,temp,minutes,deacid}
   * 两处批次波动：材料（±8%）与火候/时长（±40%）。后者经 exp(−kt) 在高温下被放大成巨大的方差。 */
  function assay(p, rep) {
    const rnd = mul32(1971 + hashStr(JSON.stringify(p)) + rep * 7919);
    const w = ORIGIN[p.origin].w * PART[p.part].f * SEASON[p.season].f * (1 + 0.08 * gaussOf(rnd));
    const tEff = p.minutes * (1 + 0.40 * gaussOf(rnd));
    const Y = Math.exp(-kT(p.temp) * Math.max(0, tEff));
    const r = RATIO * Math.max(0, w) * Y * SOLVENT[p.solvent].e * (p.deacid ? 1 : DEAC);
    const I = Math.pow(r, NH) / (1 + Math.pow(r, NH));
    const tox = !p.deacid && r > 2.5;              // 酸性部分带来的毒性（高剂量时显现）
    const obs = Math.max(0, Math.min(1, I + 0.025 * gaussOf(rnd)));   // 计数噪声（1e4 个红细胞）
    return { I: obs, D: r, Y, w, tox, tEff };
  }
  const meanSD = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1); return [m, Math.sqrt(v)]; };

  /* ---------------- 第三关：PK/PD 与耐药 ---------------- */
  /* 四个亚群：S 敏感、A' 只对 A 耐药、B' 只对 B 耐药、AB 双耐药。
   * 初始频率：rA = rB = 1e−9，rAB = 1e−18（两个独立位点的突变概率相乘）。
   * 浓度以各自的 EC50 为单位；耐药株的 EC50 高 RFAC 倍。杀灭率 κ(c) = κmax·x³/(1+x³)。
   * 虫量低于 1 个即视为灭绝（取整到 0）——这正是"概率相乘"在确定性模型里的体现。 */
  const PK = { A: { t12: 2.0, dose: 300 }, B: { t12: 150, dose: 25 } };   // A 青蒿素类（短效）、B 伙伴药（长效）
  const KMAX_A = 0.30, KMAX_B = 0.065, GAM = 3, RFAC = 80;                 // κ 单位 1/h
  const GROWTH = Math.log(10) / 48, COST = 0.88;                           // 无药时每 48 h 的红内期周期增长 10 倍；耐药株有适应度代价
  const conc = (drug, t, doses) => doses.reduce((c, td) => (t >= td ? c + PK[drug].dose * Math.exp(-Math.LN2 * (t - td) / PK[drug].t12) : c), 0);
  const kill = (c, kmax, res) => { const x = c / (res ? RFAC : 1); return (kmax * Math.pow(x, GAM)) / (1 + Math.pow(x, GAM)); };
  /* 模拟 42 天。opts: {useA, useB, days, t12A} */
  function treat({ useA = true, useB = true, days = 3, t12A = 2.0 } = {}) {
    const old = PK.A.t12; PK.A.t12 = t12A;
    const dosesA = useA ? Array.from({ length: days }, (_, i) => i * 24) : [];
    const dosesB = useB ? Array.from({ length: days }, (_, i) => i * 24) : [];
    const dt = 0.5, T = 42 * 24;
    const P = { S: 1e12, A: 1e12 * 1e-9, B: 1e12 * 1e-9, AB: 1e12 * 1e-18 };
    const out = { t: [], Ps: [], Pr: [], cA: [], cB: [], winA: 0, winB: 0 };
    for (let i = 0; i <= T / dt; i++) {
      const t = i * dt, cA = conc('A', t, dosesA), cB = conc('B', t, dosesB);
      const kAs = kill(cA, KMAX_A, false), kAr = kill(cA, KMAX_A, true);
      const kBs = kill(cB, KMAX_B, false), kBr = kill(cB, KMAX_B, true);
      const g = GROWTH;
      const rate = { S: g - (kAs + kBs), A: g * COST - (kAr + kBs), B: g * COST - (kAs + kBr), AB: g * COST * COST - (kAr + kBr) };
      // 选择窗：耐药株的净增长超过敏感株，且药物确实在杀敏感株
      if (rate.A > rate.S + 1e-12 && kAs > 1e-4) out.winA += dt;
      if (rate.B > rate.S + 1e-12 && kBs > 1e-4) out.winB += dt;
      ['S', 'A', 'B', 'AB'].forEach((k) => { P[k] = Math.min(1e13, P[k] * Math.exp(rate[k] * dt)); if (P[k] < 1) P[k] = 0; });
      if (i % 4 === 0) { out.t.push(t / 24); out.Ps.push(P.S); out.Pr.push(P.A + P.B + P.AB); out.cA.push(cA); out.cB.push(cB); }
    }
    PK.A.t12 = old;
    const res = P.A + P.B + P.AB, tot = P.S + res;
    out.P = P; out.final = tot; out.finalR = res;
    out.cure = tot < 1;
    out.recrud = !out.cure;
    out.resWins = res > P.S && tot >= 1;
    out.inWin = Math.max(out.winA, out.winB);
    const i48 = out.t.findIndex((x) => x >= 2);
    const P0 = out.Ps[0] + out.Pr[0], P48 = out.Ps[i48] + out.Pr[i48];
    out.t12clear = P48 < P0 ? (Math.LN2 * 48) / Math.log(P0 / P48) : Infinity;
    return out;
  }

  const CSS = `
.art-note{font-size:12.5px;color:var(--muted);line-height:1.7;margin:0}
.art-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.art-sec{display:grid;gap:9px;border-top:1px dashed var(--line);padding-top:10px}
.art-sec[hidden]{display:none}
.art-sec h4{margin:0;font-size:13.5px}
.art-tab{overflow:auto;border:1px solid var(--line);border-radius:8px;max-height:240px}
.art-tab table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.art-tab th,.art-tab td{padding:4px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.art-tab th{background:var(--panel);color:var(--muted);font-weight:500;position:sticky;top:0;z-index:1}
.art-tab td:first-child,.art-tab th:first-child{text-align:left}
.art-tab tr.on td{color:var(--accent)}
.art-tab tr.tox td{color:var(--warn)}
.art-goals{display:grid;gap:5px;margin:0;padding:0;list-style:none;font-size:13px}
.art-goals li{display:flex;gap:7px;align-items:flex-start;line-height:1.6}
.art-goals i{font-style:normal;font-family:var(--mono-font,monospace);color:var(--muted);flex:none}
.art-goals li.done,.art-goals li.done i{color:var(--good)}
.art-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.art-leg i{display:inline-block;width:15px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.art-quote{margin:0;padding:8px 12px;border-left:3px solid var(--accent);background:var(--bg2);border-radius:0 6px 6px 0;font-size:13.5px;line-height:1.8}
.art-big{font-family:var(--mono-font,monospace);font-size:13px}
.art-big b{font-size:16px;color:var(--fg)}`;
  const injectCSS = () => { if (!document.getElementById('st-artemisinin')) document.head.append(H.el('style', { id: 'st-artemisinin', text: CSS })); };
  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  const line = (g, A, xs, ys, color, w = 2, dash = null) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath(); xs.forEach((x, i) => { const px = A.X(x), py = A.Y(ys[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke(); g.restore();
  };
  const legend = (items) => H.el('div', { class: 'art-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  CHALLENGES.artemisinin = {
    title: '煮坏了的药',
    _m: { assay, kT, treat, conc, kill, RATIO, NH },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color;

      /* ================= 第一关：为什么重复不出来 ================= */
      const stage1 = {
        title: '为什么重复不出来',
        task: `<p>1969–1971 年。你是 523 任务一个课题组的组长。几个月里收集了 2000 多个方药、整理出 640 个，
          又从 200 多种中药做出 380 多个提取物，在<b>鼠疟模型</b>上一个个试：小鼠感染伯氏疟原虫，给药后数血涂片里的原虫，
          算抑制率 $I = 1 - P_{\\text{给药}}/P_{\\text{对照}}$（每张片子数 $10^4$ 个红细胞）。</p>
          <p>青蒿（黄花蒿）某一次测出了约 68% 的抑制率，可是<b>重复不出来</b>：同样的草、同样的办法，有时六十多，有时只有一二十。
          按常规判断，这种数据通常意味着假阳性，候选药就在这一步被放弃了。</p>
          <p>你手上能改的变量：<b>产地</b>、<b>药用部位</b>、<b>采收期</b>，以及<b>提取方法</b>（溶剂、温度、时长）。
          当时的常规做法是<b>水煎</b>：100 ℃ 煮 30 分钟。</p>
          <p><b>任务</b>：别急着下结论。每个条件多测几批，看<b>平均值</b>，也看<b>批次间的离散</b>。
          找出哪一个变量能让"忽高忽低"变成"稳定的高"。</p>`,
        hints: [
          '先问一个统计问题：每张片子数 $10^4$ 个红细胞、感染率 5%，计数本身的相对误差只有约 4%。那么"68% vs 20%"这种差别<b>不可能</b>是数片子数出来的。一定有个没控制住的变量。',
          '产地、部位、采收期都会改变草里的含量，但它们在同一批草里是固定的——换句话说，它们解释不了<b>同一批草重复测却忽高忽低</b>。还有什么在每次实验中都不完全一样？',
          '提取。水煎是 100 ℃ 煮 30 分钟，而"煮多久、火多大"每次都有出入。如果有效成分<b>怕热</b>，那么回收率按 $e^{-k(T)t}$ 走，火候的小波动在指数上被放大。把温度降下来试试。',
        ],
        answer: `变量是<b>提取温度</b>。有效成分热不稳定，降解近似一级反应，回收率 $Y=e^{-k(T)t}$，$k$ 按 Arrhenius 随温度急剧上升：
          取 $E_a\\approx110$ kJ/mol，从 60 ℃ 升到 100 ℃，$k$ 增大约 <b>71 倍</b>。
          <p>这解释的不只是"低"，更是"<b>方差大</b>"：水煎后的剂量恰好落在剂量–反应曲线的陡峭段，
          而煮的时间与火候每批都有出入，$\\ln Y$ 的波动被原样传到抑制率上（$d\\ln I/d\\ln Y|_{I=1/2}=n_H/2\\approx1$）。
          把温度降下去，剂量进入饱和段，抑制率就"锁定"在接近 100%，重复性随之变好。</p>
          <p>计数噪声不是原因：$10^4$ 个红细胞、感染率 5% 时相对误差只有 $\\sqrt{(1-p)/(Np)}\\approx4\\%$。
          产地（四川 &gt; 北京）、部位（<b>叶</b>，茎几乎没有）、采收期（花蕾期最高）都确实影响含量，
          但它们在同一批草里是固定的，解释不了同一批草重复测的离散。</p>`,
        build(body, api) {
          const S = { origin: 'sc', part: 'leaf', season: 'bud', solvent: 'water', temp: 100, minutes: 30, deacid: false, rows: [], ansOK: false, quizOK: false };
          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.5, minH: 190, maxH: 270 });
          plots.append(legend([['每批的抑制率', col('--s1')], ['该条件的均值 ± SD', col('--accent')]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const cOri = h.choice({ label: '产地', value: 'sc', options: Object.entries(ORIGIN).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.origin = v; info(); } });
          const cPart = h.choice({ label: '部位', value: 'leaf', options: Object.entries(PART).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.part = v; info(); } });
          const cSea = h.choice({ label: '采收期', value: 'bud', options: Object.entries(SEASON).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.season = v; info(); } });
          const cSol = h.choice({ label: '溶剂', value: 'water', options: Object.entries(SOLVENT).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.solvent = v; info(); } });
          const sT = h.slider({ label: '提取温度', min: 20, max: 100, step: 5, value: 100, format: (v) => v + ' ℃', onInput: (v) => { S.temp = v; info(); } });
          const sM = h.slider({ label: '提取时长', min: 10, max: 120, step: 5, value: 30, format: (v) => v + ' min', onInput: (v) => { S.minutes = v; info(); } });
          ctl.append(cOri.el, cPart.el, cSea.el, cSol.el, sT.el, sM.el);
          const btns = h.el('div', { class: 'art-row' }, [
            h.button({ label: '按这个条件做 1 批', kind: 'primary', onClick: () => batch(1) }),
            h.button({ label: '做 5 批（看离散）', onClick: () => batch(5) }),
            h.button({ label: '清空', onClick: () => { S.rows = []; draw(); table(); } }),
          ]);
          const noteEl = h.el('p', { class: 'art-note' });
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { last: h.readout('最近一批'), ms: h.readout('该条件：均值 ± SD'), n: h.readout('已测条件'), cv: h.readout('离散最大的条件') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabWrap = h.el('div', { class: 'art-tab dtable' });

          const key = () => `${S.origin}|${S.part}|${S.season}|${S.solvent}|${S.temp}|${S.minutes}`;
          const label = () => `${ORIGIN[S.origin].zh.slice(0, 2)}·${PART[S.part].zh}·${SEASON[S.season].zh}·${SOLVENT[S.solvent].zh} ${S.temp}℃ ${S.minutes}min`;
          function info() {
            const Y = Math.exp(-kT(S.temp) * S.minutes);
            noteEl.innerHTML = `这个条件下，若有效成分怕热，提取过程中还剩多少是未知的——你只能从抑制率反推。当前：${label()}`;
            void Y;
          }
          function batch(n) {
            const k = key(), row = S.rows.find((r) => r.k === k) || { k, lab: label(), v: [] };
            if (!S.rows.includes(row)) S.rows.push(row);
            for (let i = 0; i < n; i++) { const r = assay({ ...S }, row.v.length); row.v.push(r.I); row.tox = row.tox || r.tox; }
            const [m, sd] = meanSD(row.v);
            Ro.last.set(`${(100 * row.v[row.v.length - 1]).toFixed(1)}%`);
            Ro.ms.set(`${(100 * m).toFixed(1)}% ± ${(100 * sd).toFixed(1)}%（${row.v.length} 批）`);
            draw(); table(); check();
          }
          function table() {
            const rows = S.rows.map((r, i) => {
              const [m, sd] = meanSD(r.v);
              return `<tr class="${i === S.rows.length - 1 ? 'on' : ''}"><td>${r.lab}</td><td>${r.v.length}</td><td>${(100 * m).toFixed(1)}%</td><td>${r.v.length > 1 ? (100 * sd).toFixed(1) + '%' : '—'}</td></tr>`;
            }).join('');
            tabWrap.innerHTML = `<table><thead><tr><th>条件</th><th>批数</th><th>平均抑制率</th><th>SD</th></tr></thead><tbody>${rows || '<tr><td>还没有数据</td><td>—</td><td>—</td><td>—</td></tr>'}</tbody></table>`;
            Ro.n.set(`${S.rows.length} 种条件，共 ${S.rows.reduce((a, r) => a + r.v.length, 0)} 批`);
            const multi = S.rows.filter((r) => r.v.length >= 3);
            if (multi.length) {
              const worst = multi.reduce((a, r) => (meanSD(r.v)[1] > meanSD(a.v)[1] ? r : a));
              Ro.cv.set(`${worst.lab}：SD ${(100 * meanSD(worst.v)[1]).toFixed(1)}%`);
            } else Ro.cv.set('—（同一条件至少测 3 批才看得出）');
          }
          function check() {
            // 条件：做过高温多批（看到离散）、也做过低温多批（看到稳定）
            const hot = S.rows.find((r) => r.k.includes('|100|') && r.v.length >= 3);
            const cold = S.rows.find((r) => /\|(2[05]|3[05]|40|45|50)\|/.test(r.k) && r.v.length >= 3);
            if (hot && cold && ansBox.hidden) {
              ansBox.hidden = false; api.typeset(ansBox);
              const [mh, sh] = meanSD(hot.v), [mc, sc] = meanSD(cold.v);
              api.say(`高温条件：${(100 * mh).toFixed(0)}% ± ${(100 * sh).toFixed(0)}%；低温条件：${(100 * mc).toFixed(0)}% ± ${(100 * sc).toFixed(0)}%。<b>不只是平均值高了，离散也小了。</b>`, 'good');
            }
          }
          const ansBox = h.el('div', { class: 'art-sec', hidden: true });
          const ans = H.answer({
            label: '若有效成分按一级反应热降解、$E_a\\approx110$ kJ/mol，从 60 ℃ 升到 100 ℃，降解速率常数 $k$ 增大约几倍？（容差 ±40%）', placeholder: '倍数',
            check: (v) => {
              const truth = Math.exp((EA / RGAS) * (1 / 333.15 - 1 / 373.15));
              if (Math.abs(v / truth - 1) <= 0.4) return { ok: true, msg: `对：$k(373)/k(333)=\\exp[\\frac{E_a}{R}(\\frac1{333}-\\frac1{373})]=e^{4.26}\\approx 71$。所以 100 ℃ 煮 30 min 若只剩 5%，60 ℃ 同样时长能剩 96%。` };
              if (v > 1 && v < 10) return { ok: false, msg: '太小了。注意指数里是 $E_a/R \\approx 1.3\\times10^4$ K，乘上 $\\Delta(1/T)=3.2\\times10^{-4}$。' };
              if (v > 1e4) return { ok: false, msg: '太大了。再算一次指数：$1.3\\times10^4\\times3.2\\times10^{-4}\\approx4.3$。' };
              return { ok: false, msg: '不对。$k(T)=A e^{-E_a/RT}$，取比值时 $A$ 消掉。' };
            },
            onOk: () => { S.ansOK = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
          });
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '"同一批草、同样的方法，抑制率忽高忽低"——最可能的原因是：',
            options: [
              { label: '数血涂片的计数误差太大', ok: false, why: '算一下：每张片子数 $10^4$ 个红细胞、感染率 5%，相对误差 $\\sqrt{(1-p)/(Np)}\\approx4\\%$。差几十个百分点不可能是计数噪声。' },
              { label: '提取时的加热破坏了有效成分，而火候与时间每批都有出入，在 $e^{-kt}$ 上被放大', ok: true, why: '对。这同时解释了"低"和"离散大"：剂量落在剂量–反应曲线的陡峭段时，$d\\ln I/d\\ln Y\\approx n_H/2\\approx1$，提取波动被原样传到抑制率上。把温度降下来，剂量进入饱和段，抑制率就锁定在接近 100%。' },
              { label: '青蒿里根本没有抗疟成分，高的那几次是假阳性', ok: false, why: '假阳性应当是随机分布在所有候选药上的，而青蒿反复给出偏高的值；而且下一关你会看到，换个提取方法就稳定在 100%。' },
              { label: '不同批次的草产地和采收期不同', ok: false, why: '它们确实影响含量（四川 > 北京，叶 > 茎，花蕾期最高），但在<b>同一批草</b>里是固定的，解释不了同一批草重复测的离散。' },
            ],
            onOk: () => { S.quizOK = true; finish(); },
          }).el);
          ansBox.append(h.el('h4', { text: '把温度的影响算出来' }), ans.el, quizBox);
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>不是没有活性，是提取方法在破坏它。</b>当一个天然产物的活性数据不可重复时，
              不要只做更多重复——要<b>系统地改变提取条件</b>，看活性是否随某个物理量单调变化。
              这里是温度：$E_a\\approx110$ kJ/mol 时 60 ℃ → 100 ℃ 让降解快 71 倍，而火候的小波动在指数上被放大成巨大的方差。
              下一关：怎样把它完整地取出来？`);
          }

          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const n = Math.max(1, S.rows.length);
            const A = h.axes(g, W, Hh, { x0: 0, x1: n, y0: 0, y1: 105, pad: { l: 46, r: 10, t: 14, b: 52 },
              xTicks: [], yTicks: [0, 25, 50, 75, 100], fmtY: (v) => v + '%', yLabel: '抑制率' }, col);
            if (!S.rows.length) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('选好条件，按「按这个条件做 1 批」', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            g.font = '9.5px ' + col('--mono-font');
            S.rows.forEach((r, i) => {
              const xc = A.p.l + (A.iw * (i + 0.5)) / n, [m, sd] = meanSD(r.v);
              // 单批散点
              g.fillStyle = col('--s1');
              r.v.forEach((v, k2) => { g.beginPath(); g.arc(xc + ((k2 % 5) - 2) * 3.2, A.Y(100 * v), 2.3, 0, 7); g.fill(); });
              // 均值 ± SD
              if (r.v.length > 1) {
                g.strokeStyle = col('--accent'); g.lineWidth = 2;
                g.beginPath(); g.moveTo(xc, A.Y(100 * Math.max(0, m - sd))); g.lineTo(xc, A.Y(100 * Math.min(1, m + sd))); g.stroke();
                [m - sd, m + sd].forEach((y) => { g.beginPath(); g.moveTo(xc - 5, A.Y(100 * Math.max(0, Math.min(1, y)))); g.lineTo(xc + 5, A.Y(100 * Math.max(0, Math.min(1, y)))); g.stroke(); });
              }
              g.fillStyle = col('--accent'); g.beginPath(); g.arc(xc, A.Y(100 * m), 3.6, 0, 7); g.fill();
              // 标签（两行）
              g.fillStyle = col('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
              const parts = r.lab.split(' ');
              g.fillText(parts[0].length > 9 ? parts[0].slice(0, 9) : parts[0], xc, A.p.t + A.ih + 5);
              g.fillText(parts.slice(1).join(' '), xc, A.p.t + A.ih + 17);
            });
          }

          body.append(plots, ctl, noteEl, btns, roBox, tabWrap, ansBox);
          api.typeset(body);
          info(); table(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ================= 第二关：191 号 ================= */
      const stage2 = {
        title: '191 号',
        task: `<p>1971 年 9 月。你重新去读东晋葛洪《肘后备急方》里关于青蒿的那一条。它说的是（大意）：</p>
          <p class="art-quote">取一把青蒿，用二升水浸泡，<b>绞取汁液</b>，全部服下。</p>
          <p>注意它<b>没有说"煎"</b>。中药的常规做法是水煎；而这里是浸、绞汁。如果古人的用法不加热而有效，
          而你加热后忽高忽低——那么有效成分很可能怕热。这是一个可以直接检验的化学假设。</p>
          <p>你可以换溶剂（水 / 乙醇 / 乙醚，乙醚沸点只有 35 ℃，适合低温操作）、调温度和时长，
          还可以用<b>碱处理把酸性部分去掉</b>（前面的毒性试验提示酸性部分对小鼠有毒且无效）。</p>
          <p><b>目标</b>：做出一个<b>平均抑制率 ≥ 95%、连续 3 批 SD &lt; 5%、且对小鼠无毒性</b>的提取物。
          下面三个目标全部达成即过关。</p>`,
        hints: [
          '先把温度降到乙醚能用的范围（沸点 35 ℃）。只降温度可能还不够——水和乙醇对这种成分的提取效率不如乙醚。',
          '还有一件事没做：去掉酸性部分。它既稀释有效成分，又带来毒性，在高剂量下小鼠会出问题。',
          '低温（30–40 ℃）、乙醚、去酸性部分、四川产黄花蒿的<b>叶</b>、花蕾期采收。这就是 1971 年 10 月 4 日那个编号 191 的中性提取物。',
        ],
        answer: `<b>低温乙醚提取 + 碱洗去掉酸性部分、保留中性部分。</b>
          <p>1971 年 9 月改用低沸点乙醚在低温下提取，10 月 4 日编号 <b>191 号</b>的中性提取物在鼠疟模型上给出
          <b>100% 的抑制率</b>（1.0 g/kg 口服，连续三天），随后在猴疟（食蟹猴疟原虫）上重复成功；
          1972 年 3 月 8 日在全国会议上报告。酸性部分无效且有毒，必须去掉。</p>
          <p>随后：研究组三人（含屠呦呦本人）先自己试服确认安全；1972 年 8–10 月在海南昌江临床观察 21 例
          （间日疟 11 例、恶性疟 9 例、混合感染 1 例），退热与原虫清除均快于氯喹对照。
          1972 年 11 月分离出无色晶体，命名<b>青蒿素</b>；1973 年 4 月元素分析显示<b>不含氮</b>
          （当时的抗疟药几乎都是含氮杂环）；分子式 $\\mathrm{C_{15}H_{22}O_5}$，$m/z\\ 282.1472$，熔点 156–157 ℃；
          1975 年用 X 射线衍射定出立体结构：一个带<b>过氧桥</b>的倍半萜内酯，1977 年发表。
          把过氧基还原掉，活性消失——过氧桥是活性必需的。</p>`,
        build(body, api) {
          const S = { origin: 'sc', part: 'leaf', season: 'bud', solvent: 'water', temp: 100, minutes: 30, deacid: false, rows: [], goals: [false, false, false], quizOK: false };
          const plots = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(plots, { aspect: 0.46, minH: 175, maxH: 240 });
          plots.append(legend([['回收率 Y = e^(−k(T)·t)', col('--s1')], ['你当前的温度', col('--accent')]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const cOri = h.choice({ label: '产地', value: 'sc', options: Object.entries(ORIGIN).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.origin = v; draw(); } });
          const cPart = h.choice({ label: '部位', value: 'leaf', options: Object.entries(PART).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.part = v; draw(); } });
          const cSea = h.choice({ label: '采收期', value: 'bud', options: Object.entries(SEASON).map(([k, v]) => ({ value: k, label: v.zh })), onChange: (v) => { S.season = v; draw(); } });
          const cSol = h.choice({ label: '溶剂', value: 'water', options: Object.entries(SOLVENT).map(([k, v]) => ({ value: k, label: v.zh + (k === 'ether' ? '（沸点 35 ℃）' : '') })), onChange: (v) => { S.solvent = v; draw(); } });
          const sT = h.slider({ label: '提取温度', min: 20, max: 100, step: 5, value: 100, format: (v) => v + ' ℃', onInput: (v) => { S.temp = v; draw(); } });
          const sM = h.slider({ label: '提取时长', min: 10, max: 120, step: 5, value: 30, format: (v) => v + ' min', onInput: (v) => { S.minutes = v; draw(); } });
          const tDe = h.toggle({ label: '碱处理去掉酸性部分（保留中性部分）', onChange: (b) => { S.deacid = b; draw(); } });
          ctl.append(cOri.el, cPart.el, cSea.el, cSol.el, sT.el, sM.el, tDe.el);
          const btns = h.el('div', { class: 'art-row' }, [
            h.button({ label: '做 3 批并测鼠疟', kind: 'primary', onClick: () => batch(3) }),
            h.button({ label: '清空', onClick: () => { S.rows = []; draw(); table(); } }),
          ]);
          const warn = h.el('p', { class: 'art-note' });
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { ms: h.readout('这个条件：均值 ± SD'), tox: h.readout('毒性'), best: h.readout('目前最好的条件') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabWrap = h.el('div', { class: 'art-tab dtable' });

          const GOALS = [
            '把<b>平均抑制率</b>做到 ≥ 95%。',
            '把<b>批次间的 SD</b> 压到 &lt; 5%（同一条件连续 3 批）。',
            '同时<b>没有毒性</b>（小鼠能耐受）。',
          ];
          const goalEls = GOALS.map((g, i) => h.el('li', {}, [h.el('i', { text: '○' }), h.el('span', { html: `目标 ${i + 1}：${g}` })]));
          const goalBox = h.el('ul', { class: 'art-goals' }, goalEls);

          const label = () => `${ORIGIN[S.origin].zh.slice(0, 2)}·${PART[S.part].zh}·${SOLVENT[S.solvent].zh} ${S.temp}℃ ${S.minutes}min${S.deacid ? ' 去酸' : ''}`;
          const key = () => `${S.origin}|${S.part}|${S.season}|${S.solvent}|${S.temp}|${S.minutes}|${S.deacid}`;
          function batch(n) {
            if (S.solvent === 'ether' && S.temp > 35) { api.say('乙醚沸点只有 35 ℃——温度再高它就跑光了。把温度降到 35 ℃ 以下。', 'bad'); return; }
            const k = key(), row = S.rows.find((r) => r.k === k) || { k, lab: label(), v: [], tox: false };
            if (!S.rows.includes(row)) S.rows.push(row);
            for (let i = 0; i < n; i++) { const r = assay({ ...S }, row.v.length); row.v.push(r.I); row.tox = row.tox || r.tox; }
            const [m, sd] = meanSD(row.v);
            Ro.ms.set(`${(100 * m).toFixed(1)}% ± ${(100 * sd).toFixed(1)}%（${row.v.length} 批）`);
            Ro.tox.set(row.tox ? '有：高剂量下小鼠出现毒性反应' : '无');
            table(); draw(); check();
          }
          function table() {
            const rows = S.rows.map((r, i) => {
              const [m, sd] = meanSD(r.v);
              return `<tr class="${r.tox ? 'tox' : i === S.rows.length - 1 ? 'on' : ''}"><td>${r.lab}</td><td>${r.v.length}</td><td>${(100 * m).toFixed(1)}%</td><td>${r.v.length > 1 ? (100 * sd).toFixed(1) + '%' : '—'}</td><td>${r.tox ? '有毒' : '—'}</td></tr>`;
            }).join('');
            tabWrap.innerHTML = `<table><thead><tr><th>条件</th><th>批数</th><th>平均</th><th>SD</th><th>毒性</th></tr></thead><tbody>${rows || '<tr><td>还没有数据</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>'}</tbody></table>`;
            const good = S.rows.filter((r) => r.v.length >= 3).sort((a, b) => meanSD(b.v)[0] - meanSD(a.v)[0])[0];
            Ro.best.set(good ? `${good.lab}：${(100 * meanSD(good.v)[0]).toFixed(0)}% ± ${(100 * meanSD(good.v)[1]).toFixed(0)}%` : '—');
          }
          function check() {
            const g = [...S.goals];
            S.rows.forEach((r) => {
              if (r.v.length < 3) return;
              const [m, sd] = meanSD(r.v);
              if (m >= 0.95) g[0] = true;
              if (sd < 0.05) g[1] = true;
              if (m >= 0.95 && sd < 0.05 && !r.tox) g[2] = true;
            });
            g.forEach((v, i) => { if (v && !S.goals[i]) { goalEls[i].classList.add('done'); goalEls[i].firstChild.textContent = '●'; } });
            S.goals = g;
            if (g.every(Boolean) && quizBox.hidden) {
              quizBox.hidden = false; api.typeset(quizBox);
              api.say('这就是 1971 年 10 月 4 日那个编号 191 的中性提取物：鼠疟抑制率 100%，随后在猴疟上重复成功。最后一问。', 'good');
            }
          }
          const quizBox = h.el('div', { class: 'art-sec', hidden: true });
          quizBox.append(h.el('h4', { text: '从古方里真正取到的是什么' }), H.quiz({
            question: '葛洪那一条在这项工作中起的作用是：',
            options: [
              { label: '它指出了该用哪一味药——没有它就不会想到青蒿', ok: false, why: '青蒿本来就在 640 个候选方里，而且已经测过、结果忽高忽低、几近被放弃。古方提供的不是"用哪味药"。' },
              { label: '它提供了一个<b>操作细节</b>（浸、绞汁，不煎），由此可以提出一个关于分子性质的可检验假设：有效成分怕热', ok: true, why: '对。这是整件事的方法论要点：把古文献当作<b>实验条件的提示</b>，而不是当作结论。假设提出后，检验它只需要换一种溶剂和温度——这是现代药理学的工作。' },
              { label: '它证明了传统医学的理论是正确的', ok: false, why: '这项工作验证的是一条具体的化学假设，用的是鼠疟模型、剂量–反应、提取条件对照、结构测定。同一轮筛选里 2000 多个方药绝大多数没有效果；它既不验证也不否定任何理论体系。' },
              { label: '它说明直接喝青蒿汁就能治疟疾', ok: false, why: '不能。药用的是黄花蒿的<b>叶</b>、花蕾期含量才高，而且剂量不可控。WHO 明确不推荐用植物材料直接治疗疟疾——达不到治疗浓度，还会加速耐药。' },
            ],
            onOk: () => { S.quizOK = true; api.done(`<b>191 号：低温乙醚 + 去酸性部分。</b>1971 年 10 月 4 日，中性提取物在鼠疟上给出 100% 抑制率，猴疟重复成功。
              1972 年研究组三人先自己试服，8–10 月在海南临床观察 21 例；11 月分离出晶体，命名<b>青蒿素</b>。
              1973 年元素分析显示它<b>不含氮</b>——当时的抗疟药几乎都是含氮杂环；1975 年 X 射线定出结构：
              $\\mathrm{C_{15}H_{22}O_5}$，一个带<b>过氧桥</b>的倍半萜内酯。把过氧基还原掉，活性就消失了。
              下一关：这么好的药，为什么不能单独用？`); },
          }).el);

          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 20, x1: 100, y0: 1e-3, y1: 1.2, logY: true, pad: { l: 50, r: 12, t: 14, b: 34 },
              xTicks: [20, 40, 60, 80, 100], yTicks: [1e-3, 1e-2, 1e-1, 1], fmtY: (v) => (v >= 1 ? '100%' : v >= 0.1 ? '10%' : v >= 0.01 ? '1%' : '0.1%'),
              xLabel: '提取温度 (℃)', yLabel: '回收率 Y（对数）' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const Ts = []; for (let T = 20; T <= 100; T += 0.5) Ts.push(T);
            line(g, A, Ts, Ts.map((T) => Math.max(1e-4, Math.exp(-kT(T) * S.minutes))), col('--s1'), 2);
            // 其它时长作为参照
            [10, 120].forEach((mn) => line(g, A, Ts, Ts.map((T) => Math.max(1e-4, Math.exp(-kT(T) * mn))), col('--muted'), 1.2, [4, 3]));
            const Ycur = Math.exp(-kT(S.temp) * S.minutes);
            g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.setLineDash([4, 3]);
            g.beginPath(); g.moveTo(A.X(S.temp), A.p.t); g.lineTo(A.X(S.temp), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            g.fillStyle = col('--accent'); g.beginPath(); g.arc(A.X(S.temp), A.Y(Math.max(1e-4, Ycur)), 5, 0, 7); g.fill();
            g.restore();
            g.font = '10.5px ' + col('--mono-font'); g.fillStyle = col('--muted'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText(`t = ${S.minutes} min（虚线：10 与 120 min）`, A.p.l + 4, A.p.t + 3);
            g.fillStyle = col('--accent'); g.textAlign = 'right';
            g.fillText(`Y = ${(100 * Ycur).toFixed(Ycur < 0.1 ? 2 : 1)}%`, A.p.l + A.iw - 4, A.p.t + 3);
            warn.innerHTML = S.solvent === 'ether' && S.temp > 35
              ? '<b style="color:var(--warn)">乙醚沸点 35 ℃，这个温度下它早就跑光了。</b>'
              : `当前：${label()}　提取回收率 ${(100 * Ycur).toFixed(1)}%（这条曲线是模型给出的，实验里你只能通过抑制率间接看到它）`;
          }

          body.append(plots, ctl, warn, btns, roBox, tabWrap, goalBox, quizBox);
          api.typeset(body);
          table(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ================= 第三关：为什么不能单用 ================= */
      const stage3 = {
        title: '为什么不能单用',
        task: `<p>青蒿素杀虫极快：清除半衰期只有 2–3 小时，一个 48 小时的红内期周期能把虫量压低 $10^{3}$–$10^{4}$ 倍。
          可它在人体内的<b>消除</b>半衰期同样只有 1–3 小时。</p>
          <p>病人体内初始约 $10^{12}$ 个原虫，其中约 $10^{-9}$ 的比例天生带有对某种药的耐药突变（耐药株有一点适应度代价）。
          你有两种药：<b>A（青蒿素类）</b>起效快、半衰期 2 h；<b>B（伙伴药）</b>起效慢一些、半衰期 150 h。
          疗程 3 天，每天一次。下面画出 42 天里敏感株与耐药株的虫量，以及两种药的血药浓度。</p>
          <p><b>任务</b>：找到一个方案，使 42 天后<b>既不复燃、也没有选出耐药株</b>。
          然后回答：为什么把两种药<b>同时</b>给，耐药的概率是相乘而不是相加？</p>`,
        hints: [
          '先只用 A 试试。看虫量曲线：三天内掉得非常快，但 42 天的尺度上发生了什么？再看耐药株那条线。',
          '只用 B 呢？它半衰期很长，但起效慢——浓度在"能杀敏感株、杀不死耐药株"的区间里<b>停留很久</b>。这个区间就是<b>选择窗</b>，耐药株正是在这里被富集的。',
          '两个一起给：A 在三天内把虫量压低 $10^{6}$ 倍，剩下的交给还在体内的 B 清扫。关键是两药的有效暴露要<b>在时间上重叠</b>——一个原虫要活下来，必须同时对两种机制耐药。',
        ],
        answer: `<b>只用 A</b>：三天把虫量压低约 $10^{6}$ 倍，但 $10^{12}\\times10^{-6}=10^{6}$ 个残余原虫在药物消失后重新长起来——复燃。
          <b>只用 B</b>：半衰期 150 h，浓度缓慢扫过"杀敏感、不杀耐药"的<b>选择窗</b>并长时间停留，耐药株被强烈富集。
          <b>A + B 同时</b>：A 迅速把虫量压到 $10^{6}$ 量级，残余交给仍在体内的 B 清扫；既不复燃，也没有给耐药株单独面对一种药的机会。
          <p><b>为什么相乘。</b>设对 A、B 的耐药由独立位点的突变产生，概率 $\\mu_A,\\mu_B\\approx10^{-9}$。两药同时存在时，
          一个原虫要存活必须<b>同时</b>携带两种突变，$\\mu_{AB}\\approx\\mu_A\\mu_B=10^{-18}$。病人体内约 $10^{12}$ 个原虫：
          单药时体内几乎必然已有抗性个体（$10^{12}\\times10^{-9}=10^{3}$ 个），双药时几乎必然没有（$10^{12}\\times10^{-18}=10^{-6}$）。</p>
          <p><b>前提是时间上重叠。</b>若 A 的半衰期远短于 B，那么 A 衰减到无效之后，残余原虫只面对 B 一种药——
          这等价于一段 B 的单药治疗，耐药概率退回 $\\mu_B$。所以 ACT 的设计要求：A 必须在三天内把虫量压到
          "$P\\cdot\\mu_B\\ll1$"的水平，即 $10^{12}e^{-3\\lambda}\\cdot10^{-9}\\ll1$，要求三天至少降低 $10^{3}$ 倍。
          实际每 48 h 降低 $10^{4}$ 倍（$\\lambda=4.6\\ \\mathrm{d^{-1}}$），三天降 $10^{6}$ 倍，残余 $10^{6}$——
          对伙伴药而言已经安全，<b>这就是三天疗程的由来</b>。</p>
          <p>WHO 自 2001 年起推荐青蒿素联合疗法（ACT），2005 年后成为全球一线方案。
          2008 年前后在柬埔寨–泰国边境出现清除变慢，2014 年确认分子标志为 <i>Pfkelch13</i> 突变；
          这被称为"部分耐药"——延缓的是清除速度，而不是完全失效。</p>`,
        build(body, api) {
          const S = { useA: true, useB: false, days: 3, t12A: 2.0, res: null, tried: {}, ansOK: false, quizOK: false };
          const plots = h.el('div', { class: 'lab-stage' });
          const boxP = h.el('div'), boxC = h.el('div');
          plots.append(boxP, boxC);
          const cvP = h.canvas(boxP, { aspect: 0.5, minH: 190, maxH: 270 });
          boxP.append(legend([['敏感株', col('--s1')], ['耐药株', col('--warn')], ['治愈线（总虫量 = 1）', col('--good'), 1]]));
          const cvC = h.canvas(boxC, { aspect: 0.4, minH: 150, maxH: 210 });
          boxC.append(legend([['A 青蒿素类（t½ = 2 h）', col('--s1')], ['B 伙伴药（t½ = 150 h）', col('--s2')], ['选择窗', col('--warn')]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const tA = h.toggle({ label: '给药 A：青蒿素类（快、短效）', value: true, onChange: (b) => { S.useA = b; run(); } });
          const tB = h.toggle({ label: '给药 B：伙伴药（慢、长效）', value: false, onChange: (b) => { S.useB = b; run(); } });
          const sD = h.slider({ label: '疗程天数', min: 1, max: 7, step: 1, value: 3, format: (v) => v + ' 天', onInput: (v) => { S.days = v; run(); } });
          const sH = h.slider({ label: 'A 的消除半衰期（假想：如果它更长会怎样）', min: 2, max: 48, step: 1, value: 2, format: (v) => v + ' h', onInput: (v) => { S.t12A = v; run(); } });
          ctl.append(tA.el, tB.el, sD.el, sH.el);
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { out: h.readout('42 天后的结局'), fin: h.readout('最终虫量（总 / 耐药）'), cl: h.readout('清除半衰期（前 48 h）'), win: h.readout('在选择窗里停留') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabWrap = h.el('div', { class: 'art-tab dtable' });
          const logRows = [];

          function run() {
            const r = treat({ useA: S.useA, useB: S.useB, days: S.days, t12A: S.t12A });
            S.res = r;
            const name = `${S.useA ? 'A' : ''}${S.useA && S.useB ? '+' : ''}${S.useB ? 'B' : ''}${S.useA || S.useB ? '' : '不给药'}，${S.days} 天${S.t12A !== 2 ? `，A t½=${S.t12A}h` : ''}`;
            const verdict = r.cure ? '治愈' : r.resWins ? '复燃（以耐药株为主）' : '复燃';
            Ro.out.set(verdict);
            Ro.fin.set(`${r.final.toExponential(1)} / ${r.finalR.toExponential(1)}`);
            Ro.cl.set(isFinite(r.t12clear) ? r.t12clear.toFixed(1) + ' h' : '—（未下降）');
            Ro.win.set(r.inWin.toFixed(0) + ' h');
            if (!logRows.some((x) => x.name === name)) { logRows.push({ name, verdict, fin: r.final, finR: r.finalR, win: r.inWin }); if (logRows.length > 12) logRows.shift(); }
            S.tried[(S.useA ? 'A' : '') + (S.useB ? 'B' : '')] = verdict;
            table(); draw(); check();
          }
          function table() {
            const rows = logRows.map((r, i) => `<tr class="${i === logRows.length - 1 ? 'on' : ''}"><td>${r.name}</td><td>${r.verdict}</td><td>${r.fin.toExponential(1)}</td><td>${r.finR.toExponential(1)}</td><td>${r.win.toFixed(0)} h</td></tr>`).join('');
            tabWrap.innerHTML = `<table><thead><tr><th>方案</th><th>结局</th><th>最终虫量</th><th>其中耐药株</th><th>选择窗停留</th></tr></thead><tbody>${rows || '<tr><td>还没有数据</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>'}</tbody></table>`;
          }
          function check() {
            const t = S.tried;
            if (t.A && t.B && t.AB && t.AB === '治愈' && ansBox.hidden) {
              ansBox.hidden = false; api.typeset(ansBox);
              api.say('三种方案都试过了：单用 A 复燃，单用 B 选出耐药株，A+B 治愈。最后把概率算出来。', 'good');
            }
          }
          const ansBox = h.el('div', { class: 'art-sec', hidden: true });
          const ans = H.answer({
            label: '病人体内约 $10^{12}$ 个原虫，对单药耐药的突变概率各约 $10^{-9}$。若两药<b>同时</b>给，体内预期有多少个同时耐两种药的原虫？（数量级即可，容差 100 倍）', placeholder: '例如 1e-6',
            check: (v) => {
              if (v > 1e-9 && v < 1e-3) return { ok: true, msg: `对：$10^{12}\\times10^{-9}\\times10^{-9}=10^{-6}$，几乎必然<b>一个也没有</b>。而单药时是 $10^{12}\\times10^{-9}=10^{3}$ 个——几乎必然已经存在。这就是联合用药的全部道理。` };
              if (Math.abs(Math.log10(Math.max(v, 1e-30)) - 3) < 1) return { ok: false, msg: '$10^{3}$ 是<b>单药</b>时体内已有的抗性个体数。问的是同时耐两种药的。' };
              if (v >= 1) return { ok: false, msg: '太多了。两个独立突变的概率是相乘的：$10^{-9}\\times10^{-9}=10^{-18}$。' };
              return { ok: false, msg: '不对。$N\\cdot\\mu_A\\mu_B$，其中 $N=10^{12}$、$\\mu_A=\\mu_B=10^{-9}$。' };
            },
            onOk: () => { S.ansOK = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
          });
          ansBox.append(h.el('h4', { text: '把概率算出来' }), ans.el);
          const quizBox = h.el('div', { hidden: true });
          quizBox.append(H.quiz({
            question: '"两种药一起给，耐药概率相乘"——这个结论成立的<b>前提</b>是什么？',
            options: [
              { label: '两种药的作用机制不同', ok: false, why: '必要但不充分。机制不同保证了两个突变位点独立，但如果两药的有效暴露在时间上不重叠，原虫仍然是一种一种地面对它们。' },
              { label: '两种药的<b>有效暴露在时间上重叠</b>；否则短效药消失后，残余原虫只面对长效药一种，等价于一段单药治疗', ok: true, why: '对。这正是 ACT 设计的核心约束：A 必须在三天内把虫量压到 $P\\cdot\\mu_B\\ll1$ 的水平（$10^{12}\\to10^{6}$，而 $10^{6}\\times10^{-9}=10^{-3}$），剩下的才能安全地交给 B。这也是三天疗程的由来。' },
              { label: '两种药的剂量都要足够大', ok: false, why: '剂量当然要够，但再大的剂量也抵不过"先后给药"的问题：浓度总会衰减，关键是衰减时另一种药还在不在。' },
              { label: '病人必须严格完成全部疗程', ok: false, why: '依从性确实重要（中断疗程会把浓度留在选择窗里），但这是执行问题。即使完全依从，先后给两种药也不等于同时给。' },
            ],
            onOk: () => { S.quizOK = true; finish(); },
          }).el);
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>青蒿素联合疗法（ACT）。</b>青蒿素类杀虫极快但消除也极快：单用三天把虫量压低 $10^{6}$ 倍，
              残余仍有 $10^{6}$ 个，必然复燃；而任何单药都会让浓度扫过"杀敏感、不杀耐药"的<b>选择窗</b>，把耐药株筛出来。
              把快速短效的青蒿素与长效伙伴药<b>同时</b>给，原虫要存活必须同时对两种机制耐药，概率近似相乘（$10^{-18}$）。
              WHO 自 2001 年推荐 ACT、2005 年后成为全球一线方案。2008 年前后柬埔寨–泰国边境出现清除变慢，
              2014 年确认分子标志为 <i>Pfkelch13</i> 突变——这是"部分耐药"，延缓的是清除速度，不是完全失效。`);
          }

          function draw() {
            const r = S.res; if (!r) return;
            // 虫量
            let g = cvP.g, W = cvP.w, Hh = cvP.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            let A = h.axes(g, W, Hh, { x0: 0, x1: 42, y0: 1e-4, y1: 1e13, logY: true, pad: { l: 54, r: 12, t: 14, b: 32 },
              xTicks: [0, 7, 14, 21, 28, 35, 42], yTicks: [1e-4, 1, 1e4, 1e8, 1e12], fmtY: (v) => (v === 1 ? '1' : '10' + String(Math.round(Math.log10(v))).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])),
              xLabel: '时间 (d)', yLabel: '体内原虫数' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.strokeStyle = col('--good'); g.lineWidth = 1.3; g.setLineDash([5, 4]);
            g.beginPath(); g.moveTo(A.p.l, A.Y(1)); g.lineTo(A.p.l + A.iw, A.Y(1)); g.stroke(); g.setLineDash([]);
            // 给药期底色
            g.fillStyle = col('--accent'); g.globalAlpha = 0.12; g.fillRect(A.X(0), A.p.t, A.X(S.days) - A.X(0), A.ih); g.globalAlpha = 1;
            line(g, A, r.t, r.Ps.map((v) => Math.max(1e-5, v)), col('--s1'), 2.2);
            line(g, A, r.t, r.Pr.map((v) => Math.max(1e-5, v)), col('--warn'), 2);
            g.restore();
            g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillStyle = col(r.cure ? '--good' : '--warn');
            g.fillText(r.cure ? '治愈' : r.resWins ? '复燃：耐药株占优' : '复燃', A.p.l + 4, A.p.t + 3);
            g.fillStyle = col('--muted'); g.textAlign = 'right';
            g.fillText(`疗程 ${S.days} 天`, A.X(S.days) - 3, A.p.t + 3);
            // 浓度
            g = cvC.g; W = cvC.w; Hh = cvC.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            A = h.axes(g, W, Hh, { x0: 0, x1: 21, y0: 1e-3, y1: 1e3, logY: true, pad: { l: 54, r: 12, t: 12, b: 32 },
              xTicks: [0, 3, 7, 14, 21], yTicks: [1e-3, 1e-1, 10, 1e3], fmtY: (v) => (v >= 1 ? String(v) : String(v)),
              xLabel: '时间 (d)', yLabel: '浓度 / EC₅₀' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 选择窗：1 .. RFAC（敏感被杀、耐药不被杀）
            g.fillStyle = col('--warn'); g.globalAlpha = 0.13;
            g.fillRect(A.p.l, A.Y(RFAC), A.iw, A.Y(1) - A.Y(RFAC)); g.globalAlpha = 1;
            const ts = r.t.filter((x) => x <= 21), m = ts.length;
            line(g, A, ts, r.cA.slice(0, m).map((v) => Math.max(1e-4, v)), col('--s1'), 2);
            line(g, A, ts, r.cB.slice(0, m).map((v) => Math.max(1e-4, v)), col('--s2'), 2);
            g.restore();
            g.font = '10.5px ' + col('--mono-font'); g.fillStyle = col('--warn'); g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillText('选择窗', A.p.l + 4, (A.Y(RFAC) + A.Y(1)) / 2);
            g.textBaseline = 'top'; g.textAlign = 'right'; g.fillStyle = col('--muted');
            g.fillText(`停留 ${r.inWin.toFixed(0)} h`, A.p.l + A.iw - 4, A.p.t + 3);
          }

          body.append(plots, ctl, roBox, tabWrap, ansBox, quizBox);
          api.typeset(body);
          run();
          cvP.onResize(draw); cvC.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cvP.destroy(); cvC.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
