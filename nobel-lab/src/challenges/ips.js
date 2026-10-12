/* 把细胞送回起点 — 挑战版（Nobel Medicine 2012: Gurdon & Yamanaka，成熟细胞可被重编程为多能性）
 *
 * 第一关 核移植（Gurdon 1962）：读者分配有限的移植次数给"肠上皮核 / 胚胎核"，并决定做不做
 *   无核对照与核仁标记分型。真实数据（论文表 1）：肠核 726 次 → 10 只正常进食期蝌蚪（1.4%），
 *   胚胎核 279 次 → 100 只（36%）。读者必须拿到 ≥1 只肠核蝌蚪、做足无核对照、并做核仁分型，
 *   才能回答"分化细胞核里还剩什么"。关键在于：结论不依赖效率，只依赖"一个成功 + 两个对照"。
 *
 * 第二关 24 个因子（Takahashi & Yamanaka 2006）：有限板数的组测试。真值 = {Oct3/4, Sox2, Klf4, c-Myc}
 *   （编号 14, 15, 20, 22，与论文一致）。一块板 = 一个因子集合，克隆数 ~ Poisson(λ(S))：
 *   λ = 0（缺任一必需因子）、λ = 22（含全部四个，再按集合大小略打折）。读者要在 ≤ 14 块板内
 *   找出必需集 **并** 验证充分性（单独测 {14,15,20,22}）。log2 C(24,4) = 13.4 bit 是信息下界。
 *
 * 第三关 稀有还是精英：同一个 ε 同时预测群体效率 C(t)/N0 = 1 − exp(−ε D1(t)) 与单细胞克隆阳性比例。
 *   D1(t) = 2^((t−t0)/Td) − 1。精英模型把两者都乘上 p 并在 p 处封顶。读者拟合 ε，再用模型算出
 *   要把精英模型证伪需要培养多久：t* ≈ t0 + Td·log2(3/ε)（阳性比例 > 95%）。
 *   ε = 5e−5、Td = 7 d ⇒ t* ≈ 114 d ≈ 16 周，与 Hanna 等 (2009) 的 18 周量级一致。
 *
 * 实验数值为示意性模拟（固定种子）；历史数字见条目正文与原始文献。
 */
(() => {
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const poisson = (lam, rnd) => { if (lam <= 0) return 0; if (lam > 30) { const g = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd()); return Math.max(0, Math.round(lam + Math.sqrt(lam) * g)); } let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------------- 第一关：核移植 ---------------- */
  /* 每次移植的结局概率（取自 Gurdon 1962 表 1；"正常蝌蚪"之外的细分做了合并） */
  const FATE = {
    int: { no: 0.478, abort: 0.241, part: 0.215, blast: 0.052, tad: 0.0138 },   // 肠上皮核：10/726
    emb: { no: 0.14, abort: 0.029, part: 0.19, blast: 0.283, tad: 0.358 },      // 胚胎核：100/279
  };
  const FKEY = ['no', 'abort', 'part', 'blast', 'tad'];
  const FZH = { no: '不卵裂', abort: '异常卵裂', part: '部分卵裂', blast: '完整囊胚', tad: '正常进食期蝌蚪' };
  function transplant(kind, n, seed) {
    const rnd = mul32(1962 + seed * 7919 + hashStr(kind));
    const out = { no: 0, abort: 0, part: 0, blast: 0, tad: 0 };
    const p = FATE[kind], cum = [];
    let c = 0; FKEY.forEach((k) => { c += p[k]; cum.push(c); });
    for (let i = 0; i < n; i++) { const u = rnd() * cum[cum.length - 1]; out[FKEY[cum.findIndex((x) => u <= x)]]++; }
    return out;
  }
  /* 无核对照：紫外去核后不注核。去核偶尔失败（失败率 q 很小），读者需要足够多的对照才敢下结论 */
  const Q_FAIL = 0.002;
  function blankControl(n, seed) {
    const rnd = mul32(777 + seed * 104729);
    let k = 0; for (let i = 0; i < n; i++) if (rnd() < Q_FAIL) k++;
    return k;
  }

  /* ---------------- 第二关：组测试 ---------------- */
  const FACTORS = [
    'Ecat1', 'Esg1', 'Fbx15', 'Nanog', 'ERas', 'Dnmt3l', 'Ecat8', 'Gdf3', 'Sox15', 'Dppa4',
    'Dppa5', 'Fthl17', 'Sall4', 'Oct3/4', 'Sox2', 'Rex1', 'Utf1', 'Tcl1', 'Dppa3', 'Klf4',
    'β-catenin', 'c-Myc', 'Stat3', 'Grb2',
  ];
  const TRUE_SET = [13, 14, 19, 21];        // 0-based：Oct3/4, Sox2, Klf4, c-Myc（= 论文编号 14,15,20,22）
  const LAM_FULL = 22;                       // 24 个一起时的克隆数量级（论文：22 / 29）
  function lambdaOf(set) {
    if (!TRUE_SET.every((i) => set.has(i))) return 0;
    // 冗余因子略微稀释（病毒滴度分摊），所以越精简克隆越多
    return LAM_FULL * (1 + 0.55 * (1 - (set.size - 4) / 20));
  }
  function plate(set, seed) {
    const key = [...set].sort((a, b) => a - b).join(',');
    return poisson(lambdaOf(set), mul32(2006 + hashStr(key) + seed * 31));
  }

  /* ---------------- 第三关：随机 vs 精英 ---------------- */
  const EPS_TRUE = 5e-5, TD = 7, T0 = 3;
  const D1 = (t) => Math.max(0, Math.pow(2, (t - T0) / TD) - 1);
  const popEff = (t, eps) => 1 - Math.exp(-eps * D1(t));                 // 群体：克隆数 / 起始细胞数
  const scPos = (t, eps, p) => p * (1 - Math.exp(-(eps / p) * D1(t)));   // 单细胞：精英模型（p = 1 即随机模型）
  const tStar = (eps) => T0 + TD * Math.log2(3 / eps);
  /* 观测：群体实验（克隆数，泊松）与单细胞克隆实验（阳性孔数，二项） */
  const POP_T = [7, 14, 21, 28, 35];
  const POP_N0 = 2e5;
  function popData() {
    return POP_T.map((t, i) => {
      const lam = POP_N0 * popEff(t, EPS_TRUE);
      return { t, n: poisson(lam, mul32(2009 + 131 * i)), lam };
    });
  }
  const SC_T = [14, 28, 42, 70, 98, 126];
  const SC_W = 96;
  function scData() {
    return SC_T.map((t, i) => {
      const p = scPos(t, EPS_TRUE, 1), rnd = mul32(4242 + 977 * i);
      let k = 0; for (let j = 0; j < SC_W; j++) if (rnd() < p) k++;
      return { t, k, n: SC_W, p };
    });
  }

  const CSS = `
.ips-note{font-size:12.5px;color:var(--muted);line-height:1.7;margin:0}
.ips-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ips-sec{display:grid;gap:9px;border-top:1px dashed var(--line);padding-top:10px}
.ips-sec[hidden]{display:none}
.ips-sec h4{margin:0;font-size:13.5px}
.ips-tab{overflow:auto;border:1px solid var(--line);border-radius:8px;max-height:240px}
.ips-tab table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.ips-tab th,.ips-tab td{padding:4px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.ips-tab th{background:var(--panel);color:var(--muted);font-weight:500;position:sticky;top:0;z-index:1}
.ips-tab td:first-child,.ips-tab th:first-child{text-align:left}
.ips-tab tr.on td{color:var(--accent)}
.ips-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:4px}
.ips-f{font:inherit;font-size:11.5px;font-family:var(--mono-font,monospace);text-align:left;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--muted);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ips-f[aria-pressed=true]{background:var(--s1);border-color:var(--s1);color:var(--bg);font-weight:600}
.ips-goals{display:grid;gap:5px;margin:0;padding:0;list-style:none;font-size:13px}
.ips-goals li{display:flex;gap:7px;align-items:flex-start;line-height:1.6}
.ips-goals i{font-style:normal;font-family:var(--mono-font,monospace);color:var(--muted);flex:none}
.ips-goals li.done,.ips-goals li.done i{color:var(--good)}
.ips-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.ips-leg i{display:inline-block;width:15px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.ips-budget{font-family:var(--mono-font,monospace);font-size:13px}
.ips-budget b{font-size:16px;color:var(--fg)}`;
  const injectCSS = () => { if (!document.getElementById('st-ips')) document.head.append(H.el('style', { id: 'st-ips', text: CSS })); };
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
  const legend = (items) => H.el('div', { class: 'ips-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  CHALLENGES.ips = {
    title: '把细胞送回起点',
    _m: { transplant, blankControl, FACTORS, TRUE_SET, lambdaOf, plate, popEff, scPos, tStar, D1, popData, scData, EPS_TRUE },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color;

      /* ================= 第一关：分化细胞的核里还剩什么 ================= */
      const stage1 = {
        title: '分化细胞的核里还剩什么',
        task: `<p>牛津，1958–1962 年。问题是：细胞在分化时究竟丢掉了什么。Briggs 与 King（1952）的核移植结果看起来支持
          "晚期细胞的核已经失去了发育能力"——豹蛙囊胚核能支持发育，更晚的核几乎不行。</p>
          <p>你的装置：非洲爪蟾的卵，紫外照射可灭活卵自己的核；显微注射针；供体细胞有两种，
          <b>已进食蝌蚪的肠上皮细胞</b>（带刷状缘，毫无疑问已经分化）和<b>囊胚期的胚胎细胞</b>（对照）。
          还有一个遗传标记：有一种品系每个细胞核只有 <b>1 个核仁</b>，野生型有 2 个，显微镜下数得清。</p>
          <p><b>你有 1200 次移植的配额</b>（每次都要手工操作，这是真实的限制）。分配它，并决定要不要花配额做
          <b>无核对照</b>（紫外去核后<b>不</b>注核）和<b>核仁分型</b>（取长出的蝌蚪组织数核仁）。</p>
          <p><b>任务</b>：拿到能回答这个问题的证据，然后说清楚你的结论靠的是哪几件事。</p>`,
        hints: [
          '先想清楚："分化丢失基因"这个假设预言肠核组会出现<b>多少</b>只正常蝌蚪？它预言的是 0。要否证一个"恒为 0"的预言，你需要几个成功？',
          '既然一个成功就够，剩下的配额该花在哪里？花在<b>堵住替代解释</b>上。有两种人会说你错了：(a) 卵自己的核没被紫外杀干净；(b) 你的"肠上皮细胞"里混进了未分化细胞。第一种可以用两件事堵——不注核的对照，以及核仁标记。',
          '肠核的成功率约 1.4%，所以要稳稳拿到几只蝌蚪，肠核组至少要几百次。无核对照做个一两百次（看是否 0 只）。核仁分型必须做：它直接证明蝌蚪来自供体核，而不是漏网的卵核。',
        ],
        answer: `肠上皮细胞核的 726 次移植给出 <b>10 只正常的进食期蝌蚪</b>（约 1.4%；胚胎核组 279 次给出 100 只，36%）。
          <p><b>结论不依赖那 1.4%。</b>"分化丢失基因"预言肠核组恒为 0，所以<b>一个成功就足以否证它</b>；
          25 倍的效率差只说明技术难度（细胞周期不同步、核损伤、去核不完全），不说明遗传内容的差别。</p>
          <p>真正撑住结论的是两个对照：<b>无核对照</b>（紫外去核后不注核，不发育）排除"卵自己发育"；
          <b>核仁标记</b>（供体 1 核仁品系、受体 2 核仁品系，长出的蝌蚪细胞是 1 核仁）证明个体来自供体核。
          只有阴性对照是不够的——若去核失败率为 $q$、失败卵发育概率为 $\\rho$，$m$ 枚对照全阴只给出
          $q\\rho \\le 1-0.05^{1/m}\\approx 3/m$，$m=100$ 时约 3%，仍大于 1.4%。所以必须有来源标记。</p>
          <p>Gurdon (1962)。1966 年他与 Uehlinger 进一步得到由肠细胞核发育而来、<b>能生育的成年蛙</b>。
          结论：分化没有丢掉基因，只是关上了门。</p>`,
        build(body, api) {
          const S = { nInt: 300, nEmb: 150, nBlank: 0, nuc: false, done: [], run: 0, quizOK: false };
          const BUDGET = 1200;
          const used = () => S.nInt + S.nEmb + S.nBlank + (S.nuc ? 60 : 0);

          const stg = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(stg, { aspect: 0.5, minH: 190, maxH: 270 });
          stg.append(legend([['肠上皮细胞核', col('--s1')], ['胚胎（囊胚）核', col('--s2')]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const sInt = h.slider({ label: '肠上皮核移植次数', min: 0, max: 900, step: 20, value: S.nInt, format: (v) => String(v), onInput: (v) => { S.nInt = v; bud(); } });
          const sEmb = h.slider({ label: '胚胎核移植次数（对照）', min: 0, max: 400, step: 10, value: S.nEmb, format: (v) => String(v), onInput: (v) => { S.nEmb = v; bud(); } });
          const sBlk = h.slider({ label: '无核对照：去核后不注核', min: 0, max: 300, step: 10, value: 0, format: (v) => String(v), onInput: (v) => { S.nBlank = v; bud(); } });
          const tNuc = h.toggle({ label: '对长出的蝌蚪做核仁分型（占 60 次配额的人力）', onChange: (b) => { S.nuc = b; bud(); } });
          ctl.append(sInt.el, sEmb.el, sBlk.el, tNuc.el);
          const budEl = h.el('div', { class: 'ips-budget', 'aria-live': 'polite' });
          const btns = h.el('div', { class: 'ips-row' }, [
            h.button({ label: '按这个方案做一轮实验', kind: 'primary', onClick: run }),
            h.button({ label: '清空结果', onClick: () => { S.done = []; S.run = 0; draw(); table(); } }),
          ]);
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { tad: h.readout('正常进食期蝌蚪（肠核 / 胚胎核）'), rate: h.readout('成功率'), blk: h.readout('无核对照'), nuc: h.readout('核仁分型') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabWrap = h.el('div', { class: 'ips-tab dtable' });

          function bud() {
            const u = used(), over = u > BUDGET;
            budEl.innerHTML = `已用配额 <b style="color:${over ? 'var(--warn)' : 'var(--fg)'}">${u}</b> / ${BUDGET}` + (over ? '　<span style="color:var(--warn)">超了，减一点</span>' : '');
          }
          function run() {
            if (used() > BUDGET) { api.say('配额超了。先把总数降到 1200 以内。', 'bad'); return; }
            S.run++;
            const r = {
              int: S.nInt ? transplant('int', S.nInt, S.run) : null,
              emb: S.nEmb ? transplant('emb', S.nEmb, S.run) : null,
              blank: S.nBlank ? blankControl(S.nBlank, S.run) : null,
              nInt: S.nInt, nEmb: S.nEmb, nBlank: S.nBlank, nuc: S.nuc,
            };
            S.done.push(r);
            draw(); table(); check();
          }
          const tot = () => {
            const a = { intN: 0, intT: 0, embN: 0, embT: 0, blkN: 0, blkT: 0, nuc: false };
            S.done.forEach((r) => {
              a.intN += r.nInt; a.embN += r.nEmb; a.blkN += r.nBlank;
              if (r.int) a.intT += r.int.tad; if (r.emb) a.embT += r.emb.tad;
              if (r.blank != null) a.blkT += r.blank;
              a.nuc = a.nuc || r.nuc;
            });
            return a;
          };
          function table() {
            const a = tot();
            const rowsOf = (lab, o, n) => o ? `<tr><td>${lab}（${n} 次）</td>` + FKEY.map((k) => `<td>${o[k]}</td>`).join('') + `<td>${((o.tad / n) * 100).toFixed(2)}%</td></tr>` : '';
            const agg = {};
            FKEY.forEach((k) => { agg[k] = { int: 0, emb: 0 }; });
            S.done.forEach((r) => FKEY.forEach((k) => { if (r.int) agg[k].int += r.int[k]; if (r.emb) agg[k].emb += r.emb[k]; }));
            const body2 = (a.intN ? rowsOf('肠上皮核', Object.fromEntries(FKEY.map((k) => [k, agg[k].int])), a.intN) : '')
              + (a.embN ? rowsOf('胚胎核', Object.fromEntries(FKEY.map((k) => [k, agg[k].emb])), a.embN) : '');
            tabWrap.innerHTML = `<table><thead><tr><th>供体核</th>${FKEY.map((k) => `<th>${FZH[k]}</th>`).join('')}<th>成功率</th></tr></thead><tbody>${body2 || '<tr><td>还没有数据</td>' + FKEY.map(() => '<td>—</td>').join('') + '<td>—</td></tr>'}</tbody></table>`;
            Ro.tad.set(`${a.intT} / ${a.embT}`);
            Ro.rate.set(a.intN && a.embN ? `${((a.intT / a.intN) * 100).toFixed(2)}% / ${((a.embT / a.embN) * 100).toFixed(1)}%` : '—');
            Ro.blk.set(a.blkN ? `${a.blkN} 枚中 ${a.blkT} 只发育` + (a.blkT === 0 ? `（上界 q·ρ ≤ ${(1 - Math.pow(0.05, 1 / a.blkN)).toFixed(3)}）` : '') : '没做');
            Ro.nuc.set(a.nuc ? (a.intT ? '蝌蚪细胞为 1 核仁 → 来自供体核' : '做了，但还没有蝌蚪可分型') : '没做');
          }
          function check() {
            const a = tot();
            const ok = a.intT >= 1 && a.blkN >= 100 && a.nuc && a.embN >= 50;
            if (ok && quizBox.hidden) {
              quizBox.hidden = false; api.typeset(quizBox);
              api.say(`你拿到了 ${a.intT} 只来自肠上皮核的正常蝌蚪，${a.blkN} 枚无核对照${a.blkT ? `中有 ${a.blkT} 枚发育（去核偶有失败）` : '全部不发育'}，核仁分型确认了来源。现在可以下结论了。`, 'good');
            } else if (!ok && S.done.length >= 2 && !api.solved()) {
              const miss = [];
              if (!a.intT) miss.push('还没有任何来自肠核的正常蝌蚪（成功率约 1.4%，次数要够）');
              if (a.blkN < 100) miss.push('无核对照太少（建议 ≥ 100 枚）');
              if (!a.nuc) miss.push('没做核仁分型——怎么证明蝌蚪不是漏网的卵核长的？');
              if (a.embN < 50) miss.push('胚胎核对照太少，没法比较');
              if (miss.length) api.say('还缺：' + miss.join('；') + '。', 'info');
            }
          }
          const quizBox = h.el('div', { class: 'ips-sec', hidden: true });
          quizBox.append(h.el('h4', { text: '你的结论靠什么撑着' }), H.quiz({
            question: '下面哪一条<b>最准确</b>地描述了你这组数据支持的结论和它的依据？',
            options: [
              { label: '肠核效率只有胚胎核的约 1/25，说明分化过程中确实丢失了部分基因，只是没丢完', ok: false, why: '效率差可以完全由技术因素解释（细胞周期不同步、核被注射损伤、去核不完全）。而且"丢失部分基因"预言的是<b>系统性缺陷</b>，不是随机的低成功率——若真丢了发育必需的基因，一只正常蝌蚪也不该有。' },
              { label: '分化细胞的核保留了发育所需的<b>全部</b>遗传信息；关键证据是"至少一只正常蝌蚪"加上无核对照与核仁标记这两个对照', ok: true, why: '对。"丢失基因"预言肠核组恒为 0，一个反例即可否证；低效率只是技术问题。而两个对照分别堵住了"卵自己的核"和"蝌蚪来源不明"这两条退路——缺了核仁标记，单靠阴性对照是堵不住的。' },
              { label: '要下这个结论，必须把肠核的成功率提高到与胚胎核相当', ok: false, why: '不需要。效率是技术指标，不是逻辑前提。格登本人的效率一直在百分之一量级，结论照样成立。' },
              { label: '无核对照全部不发育，这一条已经足够证明蝌蚪来自供体核', ok: false, why: '不够。设去核失败率 $q$、失败卵发育概率 $\\rho$，$m$ 枚对照全阴只给出 $q\\rho\\le 1-0.05^{1/m}\\approx 3/m$；$m=100$ 时约 3%，仍大于肠核的 1.4%。必须有来源标记（核仁数）才能把它压下去。' },
            ],
            onOk: () => { S.quizOK = true; api.done(`<b>分化不丢基因。</b>Gurdon (1962)：726 次肠上皮核移植得到 10 只正常进食期蝌蚪（1.4%），
              而"分化丢失基因"预言的是 0。1966 年他与 Uehlinger 进一步得到由肠细胞核发育而来、能生育的成年蛙。
              体内所有体细胞共用同一份基因组，细胞类型是基因组上的一种<b>可逆状态</b>——这是整个表观遗传学的前提，
              也是下一关的出发点：既然卵能把一个核"重置"，那做这件事的到底是什么？`); },
          }).el);

          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const a = tot();
            const agg = { int: {}, emb: {} };
            FKEY.forEach((k) => { agg.int[k] = 0; agg.emb[k] = 0; });
            S.done.forEach((r) => FKEY.forEach((k) => { if (r.int) agg.int[k] += r.int[k]; if (r.emb) agg.emb[k] += r.emb[k]; }));
            const A = h.axes(g, W, Hh, { x0: 0, x1: 1, y0: 0, y1: 100, pad: { l: 44, r: 10, t: 16, b: 46 },
              xTicks: [], yTicks: [0, 25, 50, 75, 100], fmtY: (v) => v + '%', yLabel: '占该组移植次数的比例' }, col);
            if (!a.intN && !a.embN) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('分配配额，按「按这个方案做一轮实验」', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            const groups = FKEY.length, gw = A.iw / groups, bw = Math.min(26, gw * 0.3);
            g.font = '10px ' + col('--mono-font');
            FKEY.forEach((k, i) => {
              const xc = A.p.l + gw * (i + 0.5);
              [['int', a.intN, '--s1', -1], ['emb', a.embN, '--s2', 1]].forEach(([src, n, cc, side]) => {
                if (!n) return;
                const v = (agg[src][k] / n) * 100, y = A.Y(v), x = xc + side * bw * 0.55 - bw / 2;
                g.fillStyle = col(cc); g.fillRect(x, y, bw, A.p.t + A.ih - y);
                if (v > 0.6 || k === 'tad') { g.fillStyle = col('--fg'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(v < 10 ? v.toFixed(1) : v.toFixed(0), x + bw / 2, y - 2); }
              });
              g.fillStyle = col('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
              const lab = FZH[k];
              g.fillText(lab.length > 5 ? lab.slice(0, 5) : lab, xc, A.p.t + A.ih + 6);
              if (lab.length > 5) g.fillText(lab.slice(5), xc, A.p.t + A.ih + 18);
            });
          }

          body.append(stg, ctl, budEl, btns, roBox, tabWrap, quizBox);
          api.typeset(body);
          bud(); table(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ================= 第二关：24 个候选因子 ================= */
      const stage2 = {
        title: '24 个候选因子',
        task: `<p>京都，2004–2006 年。既然卵能把一个细胞核重置，做这件事的多半是一组蛋白；而能改变细胞身份的蛋白
          最可能是<b>转录因子</b>（1987 年单个 MyoD 就能把成纤维细胞变成肌细胞）。</p>
          <p>你选出了 <b>24 个</b>在胚胎干细胞里高表达的候选基因，用逆转录病毒导入小鼠成纤维细胞。
          筛选用一株报告细胞：只有进入多能状态才会打开 <i>Fbx15</i>，从而获得 G418 抗性，长出像 ES 的克隆。
          一块板 = 一个因子组合，两周后数克隆（克隆数服从泊松分布，所以小数目的差别不可靠）。</p>
          <p><b>板子有限：28 块。</b>最笨的办法（从 24 个里逐一剔除）要用掉 25 块；
          而信息论下界只有 $\\log_2\\binom{24}{4}=13.4$ bit——如果答案恰是 4 个因子，每块板若能问出 1 bit，
          十几块就够。<b>看你能用多少块做完。</b></p>
          <p><b>任务</b>：找出哪些因子是<b>必需</b>的，并且<b>验证它们合在一起是否充分</b>。
          下面三个目标达成后才算完成。</p>`,
        hints: [
          '先花一块板测"24 个全给"：若它不出克隆，后面所有实验都没意义。然后想：一块板只告诉你"这个组合出不出克隆"，怎样让这一个比特最值钱？',
          '"出克隆 ⟺ 组合里含有全部必需因子"。所以<b>去掉</b>一批因子后还出克隆，说明这一批里<b>没有</b>必需因子，可以整批排除；不出克隆，说明这一批里<b>至少有一个</b>必需因子。按二分法拆，每块板排除一半。',
          '逐一剔除要 24 块板（超预算）。二分：把 24 个分两半，去掉其中 12 个——不出克隆就说明这 12 个里有必需因子，再在它里面二分。几轮下来就能定位。最后别忘了<b>单独测一次"只给你找到的这几个"</b>：必需不等于充分。',
        ],
        answer: `必需且充分的四个因子是 <b>Oct3/4、Sox2、Klf4、c-Myc</b>（论文编号 14、15、20、22）。
          <p>山中的实际路线：24 个各自<b>单独</b>导入，一个抗性克隆也没有；24 个一起给出 <b>22 个</b>克隆（重复实验 29 个）。
          从 24 个里<b>逐一剔除</b>，有 10 个因子被去掉后克隆明显减少；这 10 个一起导入，克隆数<b>比 24 个还多</b>。
          再从 10 个里逐一剔除：去掉 Oct3/4 或 Klf4 一个克隆也没有，去掉 Sox2 只剩几个，去掉 c-Myc 克隆变扁平。
          最后单独测这四个，克隆数与 10 个相当——<b>这一步才证明了充分性</b>。</p>
          <p>任何两个的组合都不出克隆；三个的组合里，Oct3/4+Klf4+Sox2 给 36 个扁平克隆、Oct3/4+Klf4+c-Myc 给 54 个
          但无多能性。这说明多能状态不是某个"开关基因"打开的结果，而是一个互相激活的转录因子网络的自持状态：
          必须同时提供足够多的分量，才能把系统推过分水岭。</p>
          <p>Takahashi &amp; Yamanaka, <i>Cell</i> 126, 663 (2006)。他们把结果命名为<b>诱导多能干细胞（iPS 细胞）</b>。</p>`,
        build(body, api) {
          const S = { set: new Set(FACTORS.map((_, i) => i)), plates: [], goals: [false, false, false], quizOK: false };
          const MAXP = 28;

          const noteTop = h.el('p', { class: 'ips-note', html: '点因子名把它加进 / 移出这块板。<b>蓝色 = 这块板上导入的因子。</b>' });
          const fbtns = FACTORS.map((nm, i) => {
            const b = h.el('button', { type: 'button', class: 'ips-f', 'aria-pressed': 'true', text: `${i + 1}. ${nm}` });
            b.addEventListener('click', () => { S.set.has(i) ? S.set.delete(i) : S.set.add(i); b.setAttribute('aria-pressed', String(S.set.has(i))); info(); });
            return b;
          });
          const grid = h.el('div', { class: 'ips-grid' }, fbtns);
          const quick = h.el('div', { class: 'ips-row' }, [
            h.button({ label: '全选 24 个', onClick: () => setSet(FACTORS.map((_, i) => i)) }),
            h.button({ label: '全不选', onClick: () => setSet([]) }),
            h.button({ label: '反选', onClick: () => setSet(FACTORS.map((_, i) => i).filter((i) => !S.set.has(i))) }),
            h.button({ label: '前 12 个', onClick: () => setSet([...Array(12).keys()]) }),
            h.button({ label: '后 12 个', onClick: () => setSet([...Array(12).keys()].map((i) => i + 12)) }),
          ]);
          function setSet(arr) { S.set = new Set(arr); fbtns.forEach((b, i) => b.setAttribute('aria-pressed', String(S.set.has(i)))); info(); }
          const infoEl = h.el('div', { class: 'ips-budget', 'aria-live': 'polite' });
          const btns = h.el('div', { class: 'ips-row' }, [
            h.button({ label: '种一块板（两周后数克隆）', kind: 'primary', onClick: runPlate }),
            h.button({ label: '清空全部板子', onClick: () => { S.plates = []; table(); draw(); info(); } }),
          ]);
          const stg = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(stg, { aspect: 0.42, minH: 160, maxH: 230 });
          const tabWrap = h.el('div', { class: 'ips-tab dtable' });

          const GOALS = [
            '证明<b>单个</b>因子不够：至少测一个单因子的板，并且测过"全部 24 个"。',
            '把必需集缩小到<b>恰好 4 个</b>因子：找到一个 4 元组合，它出克隆，而从中<b>去掉任意一个</b>都不出（至少验证其中两个的去除）。',
            '确认<b>充分性</b>：单独种一块只含这 4 个因子的板，克隆数与 24 个那块相当（不少于其一半）。',
          ];
          const goalEls = GOALS.map((g, i) => h.el('li', {}, [h.el('i', { text: '○' }), h.el('span', { html: `目标 ${i + 1}：${g}` })]));
          const goalBox = h.el('ul', { class: 'ips-goals' }, goalEls);

          function info() {
            const left = MAXP - S.plates.length;
            infoEl.innerHTML = `这块板上 <b>${S.set.size}</b> 个因子　剩余板数 <b style="color:${left <= 2 ? 'var(--warn)' : 'var(--fg)'}">${left}</b> / ${MAXP}`;
          }
          function runPlate() {
            if (S.plates.length >= MAXP) { api.say('板子用完了。清空重来，或者用已有的结果下结论。', 'bad'); return; }
            const set = new Set(S.set), n = plate(set, S.plates.length);
            S.plates.push({ set, n, k: [...set].sort((a, b) => a - b).join(',') });
            table(); draw(); info(); check();
          }
          const fmtSet = (set) => {
            const a = [...set].sort((x, y) => x - y);
            if (a.length === 24) return '全部 24 个';
            if (a.length === 0) return '（空板）';
            if (a.length <= 6) return a.map((i) => `${i + 1}.${FACTORS[i]}`).join(' + ');
            const miss = FACTORS.map((_, i) => i).filter((i) => !set.has(i));
            if (miss.length <= 4) return `24 个去掉 ${miss.map((i) => `${i + 1}.${FACTORS[i]}`).join('、')}`;
            return `${a.length} 个：${a.slice(0, 4).map((i) => i + 1).join(',')}… `;
          };
          function table() {
            const rows = S.plates.map((p, i) => `<tr class="${i === S.plates.length - 1 ? 'on' : ''}"><td>${fmtSet(p.set)}</td><td>${p.set.size}</td><td><b>${p.n}</b></td></tr>`).join('');
            tabWrap.innerHTML = `<table><thead><tr><th>这块板上的因子</th><th>个数</th><th>克隆数</th></tr></thead><tbody>${rows || '<tr><td>还没有种板</td><td>—</td><td>—</td></tr>'}</tbody></table>`;
          }
          function check() {
            const g = [...S.goals];
            const full = S.plates.find((p) => p.set.size === 24);
            // 目标 1
            g[0] = g[0] || (!!full && S.plates.some((p) => p.set.size === 1));
            // 目标 2：某个 4 元集合出克隆，且至少两个"去掉其中一个"的 3 元集合不出克隆
            if (!g[1]) {
              for (const p of S.plates) {
                if (p.set.size !== 4 || p.n === 0) continue;
                const arr = [...p.set];
                let drops = 0;
                arr.forEach((i) => {
                  const sub = new Set(arr.filter((x) => x !== i));
                  const q = S.plates.find((z) => z.set.size === 3 && [...z.set].every((x) => sub.has(x)));
                  if (q && q.n === 0) drops++;
                });
                if (drops >= 2) { g[1] = true; break; }
              }
              // 也接受"从大集合里逐一剔除"的路线：找到 4 个因子，每个单独去掉后都不出克隆
              if (!g[1] && full && full.n > 0) {
                const ess = FACTORS.map((_, i) => i).filter((i) => {
                  const q = S.plates.find((z) => z.set.size === 23 && !z.set.has(i));
                  return q && q.n === 0;
                });
                if (ess.length === 4) g[1] = true;
              }
            }
            // 目标 3：只含 4 个真因子的板，克隆数 ≥ 全集板的一半
            if (!g[2] && full) {
              const quad = S.plates.find((p) => p.set.size === 4 && TRUE_SET.every((i) => p.set.has(i)));
              if (quad && quad.n >= Math.max(3, full.n / 2)) g[2] = true;
            }
            g.forEach((v, i) => { if (v && !S.goals[i]) { goalEls[i].classList.add('done'); goalEls[i].firstChild.textContent = '●'; } });
            S.goals = g;
            if (g.every(Boolean) && quizBox.hidden) {
              quizBox.hidden = false; api.typeset(quizBox);
              api.say('三个目标都达到了。最后一问：这组结果说明多能状态是怎样被决定的？', 'good');
            }
          }
          const quizBox = h.el('div', { class: 'ips-sec', hidden: true });
          quizBox.append(h.el('h4', { text: '这组结果说明什么' }), H.quiz({
            question: '单个因子一个克隆也不给，四个一起才行。最合理的解释是：',
            options: [
              { label: '这四个因子各自负责多能性的一部分功能，缺一不可，像四块拼图', ok: false, why: '"缺一不可"对，但"各管一块"不对：后来发现去掉 c-Myc 也能重编程（效率大降），某些细胞类型只给 Oct3/4 就够。它们不是四块互不替代的拼图。' },
              { label: '多能状态是一个互相激活的转录因子网络的<b>自持状态</b>；要把系统从一个稳定态推到另一个，必须同时提供足够多的分量越过中间的分水岭', ok: true, why: '对。Oct3/4 与 Sox2 结合在彼此以及 Nanog 的调控区上形成正反馈环。这是一个多稳态动力系统：单个因子的强制表达改变不了吸引子的归属，组合才行。Klf4 与 c-Myc 更偏辅助（打开染色质、抑制衰老通路），所以去掉 c-Myc 只是变慢变少。' },
              { label: '必须用逆转录病毒把四个基因整合进基因组，整合本身是必要条件', ok: false, why: '不是。后来用游离型质粒、仙台病毒、合成 mRNA 甚至蛋白质直接导入都能成功，整合并非必需（而且整合带来致瘤风险，是要设法避免的）。' },
              { label: '因为筛选用的是 Fbx15，所以恰好需要这四个；换个筛选标记会得到完全不同的四个', ok: false, why: '筛选标记确实影响得到的细胞质量——用 Fbx15 筛的细胞无法产生生殖系嵌合体，改用 Nanog 位点才可以。但四个因子本身没变，人 iPS 细胞用的也是同一组。' },
            ],
            onOk: () => { S.quizOK = true; api.done(`<b>四因子：Oct3/4、Sox2、Klf4、c-Myc。</b>Takahashi &amp; Yamanaka (2006) 先用 24 个候选因子验证"组合可行"，
              再逐一剔除找出必需集，最后单独测这四个验证充分性——必需与充分是两次不同的实验。
              不用卵、不用胚胎，四个转录因子就能把成纤维细胞送回多能状态，他们称之为<b>诱导多能干细胞（iPS）</b>。
              2007 年同一组做出人 iPS 细胞。下一关：这件事为什么这么罕见？`); },
          }).el);

          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: MAXP, y0: 0, y1: 48, pad: { l: 44, r: 10, t: 14, b: 32 },
              xTicks: [0, 4, 8, 12, 16, 20, 24, 28], yTicks: [0, 10, 20, 30, 40], xLabel: '第几块板', yLabel: 'G418 抗性克隆数' }, col);
            if (!S.plates.length) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('选好因子，按「种一块板」', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            const bw = Math.min(28, (A.iw / MAXP) * 0.6);
            g.font = '10px ' + col('--mono-font');
            S.plates.forEach((p, i) => {
              const xc = A.X(i + 0.5), y = A.Y(Math.min(48, p.n));
              g.fillStyle = col(p.n > 0 ? '--s1' : '--line');
              g.fillRect(xc - bw / 2, p.n > 0 ? y : A.p.t + A.ih - 2, bw, p.n > 0 ? A.p.t + A.ih - y : 2);
              g.fillStyle = col(p.n > 0 ? '--fg' : '--muted'); g.textAlign = 'center'; g.textBaseline = 'bottom';
              g.fillText(String(p.n), xc, (p.n > 0 ? y : A.p.t + A.ih) - 3);
              g.fillStyle = col('--muted'); g.textBaseline = 'top';
              g.fillText(String(p.set.size), xc, A.p.t + A.ih + 4);
            });
            g.fillStyle = col('--muted'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('下排数字 = 该板上的因子个数', A.p.l + 2, A.p.t + 2);
          }

          body.append(noteTop, grid, quick, infoEl, btns, stg, tabWrap, goalBox, quizBox);
          api.typeset(body);
          info(); table(); draw();
          cv.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ================= 第三关：稀有，还是精英 ================= */
      const stage3 = {
        title: '稀有，还是精英',
        task: `<p>重编程成功了，但效率在 <b>0.01%–0.1%</b> 量级，而且克隆要两到四周才出现。两种解释都说得通：</p>
          <ul>
            <li><b>精英模型</b>：只有比例 $p$ 的细胞"有资格"（比如某种罕见的祖细胞），其余永远不可能；</li>
            <li><b>随机模型</b>：<b>每个</b>细胞每次分裂都以极小的概率 $\\varepsilon$ 成功，给足时间谁都可能。</li>
          </ul>
          <p>你有两套数据。<b>群体实验</b>：接种 $2\\times10^{5}$ 个细胞，在第 7、14、21、28、35 天数克隆。
          <b>单细胞克隆实验</b>：把单个细胞铺进 96 孔，每孔长成一个克隆群体，长期培养后数有多少孔出现了 iPS 克隆。</p>
          <p>模型：到时刻 $t$ 每个起始细胞累计分裂 $D_1(t)=2^{(t-t_0)/T_d}-1$ 次（$t_0=3$ d，$T_d=7$ d），
          未发生任何事件的概率为 $e^{-\\varepsilon D_1}$。</p>
          <p><b>任务</b>：先用群体数据定出 $\\varepsilon$（把模型曲线拟合上去），再回答：
          要证伪精英模型，这个单细胞实验大约得做多久？</p>`,
        hints: [
          '群体实验里"效率" $=C(t)/N_0=1-e^{-\\varepsilon D_1(t)}\\approx\\varepsilon D_1(t)$。注意 $D_1$ 随时间指数增长，所以<b>效率本身随培养时间增长</b>——引用"0.01%"时必须说清是第几天数的。',
          '两个模型在早期长得一模一样（都近似线性上升），差别只在后期：精英模型的单细胞阳性比例封顶在 $p$，随机模型趋于 1。所以要分开它们，必须把实验做到阳性比例接近 1。',
          '要让 $1-e^{-\\varepsilon D_1}\\gt 0.95$，需要 $\\varepsilon D_1\\gtrsim 3$，即 $2^{(t-t_0)/T_d}\\gtrsim 3/\\varepsilon$，于是 $t^\\ast\\approx t_0+T_d\\log_2(3/\\varepsilon)$。代入 $\\varepsilon\\approx5\\times10^{-5}$、$T_d=7$ d。',
        ],
        answer: `群体数据给出 $\\varepsilon\\approx 5\\times10^{-5}$（每个细胞每次分裂的成功概率）。
          <p>两个模型在早期不可区分：都近似 $\\varepsilon D_1(t)$ 线性上升。差别在后期——精英模型的单细胞阳性比例封顶在 $p$，
          随机模型趋于 1。要把阳性比例推到 95% 以上需要 $\\varepsilon D_1\\gtrsim 3$：</p>
          $$t^\\ast \\approx t_0 + T_d\\log_2\\frac{3}{\\varepsilon} = 3 + 7\\times\\log_2(6\\times10^{4}) \\approx 114\\ \\text{d} \\approx 16\\ \\text{周}.$$
          <p>Hanna 等（<i>Nature</i> 462, 595, 2009）正是这么做的：用单细胞来源的克隆群体，最长培养 <b>18 周</b>，
          结果<b>绝大多数</b>克隆群体最终都产生了 iPS 细胞——精英模型被证伪，重编程是一个每个细胞都在参与的<b>随机过程</b>。</p>
          <p>物理图景：把细胞状态看成在沃丁顿地形 $\\Phi$ 上的随机运动，越过势垒的速率 $k\\simeq\\frac{\\sqrt{|\\lambda_s|\\lambda_m}}{2\\pi}e^{-\\Delta\\Phi/\\sigma}$。
          指数依赖解释了为什么效率这么低，也解释了为什么所有降低势垒的干预（抑制 p53、抑制 Mbd3、加小分子、换起始细胞类型）
          都能把效率提高一到两个<b>数量级</b>——这与线性模型不相容，与指数律相容。</p>`,
        build(body, api) {
          const S = { logE: -3.4, p: 1, showElite: false, ansOK: false };
          const POP = popData(), SC = scData();
          const epsOf = () => Math.pow(10, S.logE);

          const plots = h.el('div', { class: 'lab-stage' });
          const boxA = h.el('div'), boxB = h.el('div');
          plots.append(boxA, boxB);
          const cvA = h.canvas(boxA, { aspect: 0.5, minH: 180, maxH: 250 });
          boxA.append(legend([['群体实验：克隆数 / 起始细胞数', col('--s1')], ['你的模型', col('--accent')]]));
          const cvB = h.canvas(boxB, { aspect: 0.5, minH: 180, maxH: 250 });
          boxB.append(legend([['单细胞克隆：阳性孔比例', col('--s2')], ['随机模型', col('--accent')], ['精英模型（p 封顶）', col('--warn'), 1]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const sE = h.slider({ label: 'lg ε（每个细胞每次分裂的成功概率）', min: -6, max: -2.5, step: 0.01, value: S.logE,
            format: (v) => Math.pow(10, v).toExponential(1), onInput: (v) => { S.logE = v; upd(); } });
          const sP = h.slider({ label: '精英比例 p（仅画对照曲线）', min: 0.01, max: 1, step: 0.01, value: 1, format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { S.p = v; draw(); } });
          const tEl = h.toggle({ label: '叠加精英模型曲线', onChange: (b) => { S.showElite = b; draw(); } });
          ctl.append(sE.el, sP.el, tEl.el);
          const roBox = h.el('div', { class: 'lab-readout' });
          const Ro = { chi: h.readout('群体数据的拟合优度 χ²/N（≤ 2 算吻合）'), e: h.readout('ε'), eff: h.readout('第 14 / 28 天的"效率"'), ts: h.readout('阳性比例达 95% 所需时间') };
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabWrap = h.el('div', { class: 'ips-tab dtable' });

          const ansBox = h.el('div', { class: 'ips-sec', hidden: true });
          const ans = H.answer({
            label: '要让单细胞克隆的阳性比例超过 95%（从而证伪精英模型），大约需要培养多少<b>周</b>？（容差 ±30%）', unit: '周', placeholder: '例如 12',
            check: (v) => {
              const t = tStar(epsOf()) / 7;
              if (Math.abs(v / 16 - 1) <= 0.3) return { ok: true, msg: `对：$t^\\ast = t_0+T_d\\log_2(3/\\varepsilon) \\approx 3+7\\times 15.9 \\approx 114$ d ≈ 16 周。Hanna 等 (2009) 实际培养到 18 周，绝大多数克隆群体最终都出了 iPS 细胞。（按你当前的 ε，模型给 ${t.toFixed(0)} 周。）` };
              if (v < 5) return { ok: false, msg: '太短了。看单细胞那张图：到第 4 周阳性比例还不到千分之一，指数增长要再翻很多倍。' };
              if (v > 60) return { ok: false, msg: '太长了。$D_1$ 是<b>指数</b>增长的，所需时间只按 $\\log_2(3/\\varepsilon)$ 增加。' };
              return { ok: false, msg: `不对。要 $\\varepsilon D_1\\gtrsim 3$，即 $t^\\ast\\approx t_0+T_d\\log_2(3/\\varepsilon)$，$T_d=7$ d。（按你的 ε 是 ${t.toFixed(0)} 周。）` };
            },
            onOk: () => { S.ansOK = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
          });
          const quizBox = h.el('div', { hidden: true });
          ansBox.append(h.el('h4', { text: '要做多久才分得清' }),
            h.el('p', { class: 'ips-note', html: '两个模型在早期重合。把"精英比例"拉到 0.1 左右并打开叠加，看它在什么时候才和随机模型分开。' }),
            ans.el, quizBox);
          quizBox.append(H.quiz({
            question: '实验做到 18 周，发现<b>绝大多数</b>单细胞克隆群体最终都产生了 iPS 细胞。这说明：',
            options: [
              { label: '只有极少数"精英"细胞有资格，它们在长期培养中被富集了', ok: false, why: '精英模型预言阳性比例封顶在精英比例 $p$ 上。实测趋近于 1，所以不存在这样一个封顶。' },
              { label: '每个细胞都在以很小的概率反复尝试；低效率反映的是单次尝试的概率，而不是资格的有无', ok: true, why: '对（Hanna 等, 2009）。这也解释了"效率"这个数字为什么不固定：它等于 $\\varepsilon$ 乘以累计分裂次数，随培养时间增长。引用 0.01% 时必须说明是第几天数的。' },
              { label: '重编程其实很容易，之前的低效率是技术问题', ok: false, why: '不是技术问题：$\\varepsilon\\approx5\\times10^{-5}$ 是每次分裂的真实概率。要在几周内看到克隆，只能靠大量细胞和大量分裂。' },
              { label: '长期培养使细胞发生了额外的基因突变，是突变让它们获得了资格', ok: false, why: '若需要特定突变，阳性比例应当由突变率决定并远低于 1；而且把 ε 提高一两个数量级的那些干预（抑制 p53、Mbd3、小分子）作用太快，不可能是靠突变。' },
            ],
            onOk: () => { S.quizOK = true; finish(); },
          }).el);
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>重编程是随机的，不是精英的。</b>同一个 $\\varepsilon\\approx5\\times10^{-5}$ 同时解释群体效率与单细胞阳性比例；
              要证伪精英模型需要把实验做到 $t^\\ast\\approx t_0+T_d\\log_2(3/\\varepsilon)\\approx16$ 周——<b>实验要做多久是可以先算出来的</b>，
              Hanna 等 (2009) 做到 18 周，绝大多数克隆最终都成功了。
              沃丁顿的地形由此被重新理解为一个可以双向走的多稳态系统：谷底是细胞状态，山脊是势垒，
              速率按 $e^{-\\Delta\\Phi/\\sigma}$ 依赖势垒高度——这就是为什么每一种降低势垒的干预都把效率提高整整一个数量级。`);
          }

          function chi2() {
            const eps = epsOf();
            let s = 0;
            POP.forEach((d) => { const lam = POP_N0 * popEff(d.t, eps); const v = Math.max(1, lam); s += ((d.n - lam) ** 2) / v; });
            return s / POP.length;
          }
          function upd() {
            const eps = epsOf(), X2 = chi2();
            Ro.chi.set(X2 > 1e4 ? '> 10⁴' : X2.toPrecision(3));
            Ro.e.set(eps.toExponential(2));
            Ro.eff.set(`${(100 * popEff(14, eps)).toFixed(3)}% / ${(100 * popEff(28, eps)).toFixed(3)}%`);
            Ro.ts.set(`${tStar(eps).toFixed(0)} d ≈ ${(tStar(eps) / 7).toFixed(0)} 周`);
            if (X2 <= 2 && ansBox.hidden) { ansBox.hidden = false; api.typeset(ansBox); api.say(`拟合上了：$\\varepsilon\\approx${eps.toExponential(1)}$。注意第 14 天和第 28 天的"效率"差了 5 倍多——它不是一个常数。`, 'good'); }
            draw(); table();
          }
          function table() {
            const eps = epsOf();
            const r1 = POP.map((d) => `<tr><td>群体 第 ${d.t} 天</td><td>${d.n}</td><td>${(100 * d.n / POP_N0).toFixed(4)}%</td><td>${(100 * popEff(d.t, eps)).toFixed(4)}%</td></tr>`).join('');
            const r2 = SC.map((d) => `<tr><td>单细胞 第 ${d.t} 天</td><td>${d.k} / ${d.n} 孔</td><td>${(100 * d.k / d.n).toFixed(1)}%</td><td>${(100 * scPos(d.t, eps, 1)).toFixed(1)}%</td></tr>`).join('');
            tabWrap.innerHTML = `<table><thead><tr><th>实验</th><th>观测</th><th>比例</th><th>模型</th></tr></thead><tbody>${r1}${r2}</tbody></table>`;
          }
          function draw() {
            const eps = epsOf();
            // 群体图（对数纵轴）
            let g = cvA.g, W = cvA.w, Hh = cvA.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            let A = h.axes(g, W, Hh, { x0: 0, x1: 40, y0: 1e-5, y1: 1e-2, logY: true, pad: { l: 54, r: 12, t: 12, b: 32 },
              xTicks: [0, 7, 14, 21, 28, 35], yTicks: [1e-5, 1e-4, 1e-3, 1e-2], fmtY: (v) => (v >= 1e-2 ? '1%' : v >= 1e-3 ? '0.1%' : v >= 1e-4 ? '0.01%' : '0.001%'),
              xLabel: '培养时间 (d)', yLabel: '克隆数 / 起始细胞数' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const ts = []; for (let i = 0; i <= 120; i++) ts.push((40 * i) / 120);
            line(g, A, ts, ts.map((t) => Math.max(1e-6, popEff(t, eps))), col('--accent'), 2);
            g.fillStyle = col('--s1');
            POP.forEach((d) => { const y = A.Y(Math.max(1e-6, d.n / POP_N0)); g.beginPath(); g.arc(A.X(d.t), y, 4, 0, 7); g.fill();
              g.strokeStyle = col('--s1'); g.lineWidth = 1.2;
              const e1 = Math.sqrt(Math.max(1, d.n));
              g.beginPath(); g.moveTo(A.X(d.t), A.Y(Math.max(1e-6, (d.n + e1) / POP_N0))); g.lineTo(A.X(d.t), A.Y(Math.max(1e-6, Math.max(0.3, d.n - e1) / POP_N0))); g.stroke(); });
            g.restore();
            // 单细胞图
            g = cvB.g; W = cvB.w; Hh = cvB.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            A = h.axes(g, W, Hh, { x0: 0, x1: 150, y0: 0, y1: 105, pad: { l: 46, r: 12, t: 12, b: 32 },
              xTicks: [0, 30, 60, 90, 120, 150], yTicks: [0, 25, 50, 75, 100], fmtY: (v) => v + '%', xLabel: '培养时间 (d)', yLabel: '阳性克隆群体比例' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const ts2 = []; for (let i = 0; i <= 150; i++) ts2.push(i);
            line(g, A, ts2, ts2.map((t) => 100 * scPos(t, eps, 1)), col('--accent'), 2);
            if (S.showElite) line(g, A, ts2, ts2.map((t) => 100 * scPos(t, eps, S.p)), col('--warn'), 2, [5, 4]);
            g.fillStyle = col('--s2');
            SC.forEach((d) => { g.beginPath(); g.arc(A.X(d.t), A.Y((100 * d.k) / d.n), 4, 0, 7); g.fill(); });
            // t* 标记
            const t95 = tStar(eps);
            if (t95 < 150) {
              g.strokeStyle = col('--good'); g.lineWidth = 1.3; g.setLineDash([4, 3]);
              g.beginPath(); g.moveTo(A.X(t95), A.p.t); g.lineTo(A.X(t95), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
              g.fillStyle = col('--good'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
              g.fillText(`t* = ${t95.toFixed(0)} d`, A.X(t95) - 3, A.p.t + 3);
            }
            g.restore();
          }

          body.append(plots, ctl, roBox, tabWrap, ansBox);
          api.typeset(body);
          upd();
          cvA.onResize(draw); cvB.onResize(draw);
          const off = watchTheme(draw);
          return { destroy() { off(); cvA.destroy(); cvB.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
