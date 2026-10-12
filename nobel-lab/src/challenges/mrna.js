/* 换掉一个字母 — 挑战版（Nobel Medicine 2023: Karikó & Weissman, 核苷碱基修饰与 mRNA 疫苗）
 *
 * 第一关 实验台：树突状细胞 + 五种来源的 RNA，读 TNF-α（ELISA，带噪声）。
 *   刺激性与修饰密度反向相关（Karikó et al., Immunity 23, 165 (2005)）。
 *   每种来源的"修饰核苷占比"面板为示意值，量级参考文献（tRNA 最高，IVT mRNA 为 0）。
 * 第二关 换核苷：U → Ψ / m1Ψ / m5U / s2U，以及 m5C、m6A（可组合）。
 *   读 TNF-α 与荧光素酶。模型：抑制因子按修饰"强度"相乘；表达 = 递送 × (1 − PKR 关停) × 稳定性。
 *   真值排序：m1Ψ > Ψ > m5U ≈ s2U > m5C > m6A > 无修饰（表达）；炎症反向。
 * 第三关 试验分析：VE = 1 − (r_v/r_p)。2020 年报告的近似分组人数 18 198 / 18 325，8 例 / 162 例 → 95.0%。
 *   CI 用条件二项：给定总病例数 C，c_v ~ Bin(C, θ)，θ = λ_v T_v/(λ_v T_v + λ_p T_p)；
 *   VE = 1 − θ/((1−θ)r)，对 θ 严格递减，故把 θ 的 Wilson 区间端点互换代入。
 *   C = 170 → 约 [90.0%, 97.5%]（报告为 [90.3%, 97.6%]，用的是贝叶斯方法并校正了中期分析）。
 *   SE(logit θ) = 1/√(C θ(1−θ)) ∝ C^(−1/2)：病例数少一半，区间宽约 √2 倍。
 *
 * 所有数值为示意性模拟（固定种子），用于让规律可读；真实数据见条目中的原始文献。
 */
(() => {
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gaussOf = (rnd) => { const a = rnd() || 1e-9, b = rnd(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };

  /* ---------- 第一关：五种 RNA 来源 ---------- */
  /* mod = 修饰核苷占全部核苷的百分比（示意值）；tnf = 平均 TNF-α (pg/mL) */
  const SOURCES = [
    { k: 'ivt', zh: '体外转录 mRNA（IVT）', mod: 0, tnf: 1180, note: 'T7 聚合酶只用四种标准核苷三磷酸，完全没有修饰' },
    { k: 'bact', zh: '细菌总 RNA', mod: 2.1, tnf: 980, note: '细菌 RNA 也有修饰，但密度远低于哺乳动物胞质 RNA' },
    { k: 'mito', zh: '线粒体 RNA', mod: 3.4, tnf: 720, note: '线粒体有自己的修饰酶系统，修饰少于胞质 RNA' },
    { k: 'total', zh: '哺乳动物总 RNA', mod: 9.6, tnf: 210, note: '以 rRNA 为主，修饰较多' },
    { k: 'trna', zh: '哺乳动物 tRNA', mod: 21.5, tnf: 48, note: '细胞里修饰最密集的 RNA：每条约 80 nt 上有十几个修饰核苷' },
  ];
  const MODKINDS = ['Ψ 假尿苷', 'm⁵C', 'm⁶A', 'm⁵U', '其他（m¹A、二氢尿苷…）'];
  /* 每种来源各类修饰的占比（示意，合计 = mod） */
  const MODMIX = { ivt: [0, 0, 0, 0, 0], bact: [0.7, 0.2, 0.3, 0.4, 0.5], mito: [1.1, 0.5, 0.6, 0.5, 0.7],
    total: [3.4, 1.8, 1.2, 1.5, 1.7], trna: [6.2, 3.1, 1.4, 4.0, 6.8] };
  function measureTNF(k, rep) {
    const s = SOURCES.find((x) => x.k === k);
    const rnd = mul32(2005 + 131 * SOURCES.indexOf(s) + 17 * rep);
    return Math.max(2, s.tnf * (1 + 0.11 * gaussOf(rnd)) + 14 * rnd());
  }

  /* ---------- 第二关：修饰组合 ---------- */
  /* u: 尿苷位置的替代；c5/a6: 是否另加 m5C / m6A
   * supp = 对先天免疫激活的抑制（0 = 不抑制，1 = 完全抑制）
   * pkr  = 对 PKR 激活的抑制（决定翻译是否被关停）
   * dstab = 对 mRNA 本身稳定性/可读性的影响（m6A 略降翻译，s2U 明显降） */
  const UMODS = {
    U: { zh: 'U（不替换）', supp: 0, pkr: 0, dstab: 1.0 },
    psi: { zh: 'Ψ 假尿苷', supp: 0.93, pkr: 0.80, dstab: 1.0 },
    m1psi: { zh: 'm¹Ψ（N1-甲基假尿苷）', supp: 0.96, pkr: 0.88, dstab: 1.12 },
    m5u: { zh: 'm⁵U', supp: 0.72, pkr: 0.42, dstab: 0.92 },
    s2u: { zh: 's²U', supp: 0.80, pkr: 0.45, dstab: 0.55 },
  };
  const C5 = { supp: 0.55, pkr: 0.30, dstab: 0.88 };   // m5C
  const A6 = { supp: 0.48, pkr: 0.22, dstab: 0.70 };   // m6A
  function assay(u, c5, a6, lnp) {
    const parts = [UMODS[u], c5 ? C5 : null, a6 ? A6 : null].filter(Boolean);
    // 抑制作用：未被抑制的比例相乘
    let resid = 1, residP = 1, stab = 1;
    parts.forEach((p) => { resid *= (1 - p.supp); residP *= (1 - p.pkr); stab *= p.dstab; });
    const tnf = 1180 * resid + 22;
    const pkrOn = residP;                                  // PKR 激活程度（0–1）
    const deliv = lnp ? 1 : 0.14;                          // 裸 RNA 的递送效率低得多
    const luc = 1.0e6 * deliv * stab * (1 - 0.92 * pkrOn); // 相对发光单位
    return { tnf, luc, pkrOn };
  }
  const noisy = (v, seed, rel = 0.09) => Math.max(0, v * (1 + rel * gaussOf(mul32(seed))));

  /* ---------- 第三关：试验统计 ---------- */
  const TRIAL = { cv: 8, cp: 162, Nv: 18198, Np: 18325 };
  const veOf = (cv, cp, Tv, Tp) => { const th = cv / (cv + cp), r = Tv / Tp; return 1 - th / ((1 - th) * r); };
  function wilson(k, n, z = 1.96) {
    if (n === 0) return [0, 1];
    const p = k / n, d = 1 + (z * z) / n;
    const c = (p + (z * z) / (2 * n)) / d;
    const hw = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [Math.max(0, c - hw), Math.min(1, c + hw)];
  }
  function veCI(cv, cp, Tv, Tp) {
    const C = cv + cp, r = Tv / Tp;
    const [lo, hi] = wilson(cv, C);
    const f = (th) => 1 - th / ((1 - th) * r);
    return [f(hi), f(lo)];   // VE 对 θ 递减，端点互换
  }

  const pct = (v) => (100 * v).toFixed(1) + '%';
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  const CSS = `
.mrna-note{font-size:12.5px;color:var(--muted);line-height:1.7;margin:0}
.mrna-card{border:1px solid var(--line);border-radius:8px;padding:9px 11px;background:var(--bg);display:grid;gap:8px}
.mrna-card h4{margin:0;font-size:13.5px;font-weight:600}
.mrna-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.mrna-tab{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
.mrna-tab table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.mrna-tab th,.mrna-tab td{padding:4px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.mrna-tab th{background:var(--panel);color:var(--muted);font-weight:500}
.mrna-tab td:first-child,.mrna-tab th:first-child{text-align:left}
.mrna-tab tr.on td{color:var(--accent)}
.mrna-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px}
.mrna-src{font:inherit;font-size:13px;text-align:left;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px 9px;cursor:pointer;line-height:1.5;display:grid;gap:3px}
.mrna-src:hover{border-color:var(--muted)}
.mrna-src[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.mrna-src small{color:var(--muted);font-size:11.5px;font-family:var(--mono-font,monospace)}
.mrna-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.mrna-leg i{display:inline-block;width:15px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.mrna-sec[hidden]{display:none}
.mrna-sec{display:grid;gap:9px;border-top:1px dashed var(--line);padding-top:10px}
.mrna-big{font-family:var(--mono-font,monospace);font-size:14px;line-height:1.9}
.mrna-big b{font-size:18px;color:var(--fg)}
.mrna-ci{position:relative;height:30px;border:1px solid var(--line);border-radius:6px;background:var(--bg);overflow:hidden}
.mrna-ci > .bar{position:absolute;top:9px;height:10px;background:color-mix(in srgb,var(--s1) 55%,transparent);border-radius:5px}
.mrna-ci > .pt{position:absolute;top:6px;width:2px;height:16px;background:var(--accent)}
.mrna-ci > .tick{position:absolute;top:0;bottom:0;width:1px;background:var(--line)}
.mrna-ci > .lab{position:absolute;bottom:0;font-size:10px;color:var(--muted);font-family:var(--mono-font,monospace);transform:translateX(-50%)}`;
  function injectCSS() { if (!document.getElementById('st-mrna')) document.head.append(H.el('style', { id: 'st-mrna', text: CSS })); }

  CHALLENGES.mrna = {
    title: '换掉一个字母',
    _m: { assay, veOf, veCI, wilson, measureTNF, TRIAL },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color;

      /* ============ 第一关：为什么 mRNA 会引起炎症 ============ */
      const stage1 = {
        title: '为什么 mRNA 会引起炎症',
        task: `<p>2000 年前后，费城。用 mRNA 当药的设想很干净：把编码某个蛋白的 mRNA 送进细胞，细胞自己造，
          用完即降解，不进核，不改基因组。体外转录（IVT）做 mRNA 已是常规——一段 DNA 模板加 T7 聚合酶和四种核苷三磷酸，几小时就有。</p>
          <p>可只要把它加到人树突状细胞上，细胞就被强烈激活，大量分泌 TNF-α 等炎症因子。当时流行的解释是"RNA 不稳定"或"递送没做好"。
          但有一件事没人解释：细胞自己胞质里全是 RNA，<b>把哺乳动物的总 RNA 加上去却几乎不激活</b>；细菌的 RNA 则激活得很厉害。</p>
          <p><b>任务</b>：你有五种来源的 RNA 和一套 TNF-α ELISA。每种各测几次（读数有实验噪声），
          把它们按刺激性排出来。然后打开右边那张"修饰核苷占比"面板，看看能不能找到一个<b>能解释全部五种</b>的共同变量。</p>`,
        hints: [
          '先把五种都测一遍，注意读数跨了一个多数量级：IVT mRNA 最高，tRNA 最低，差约 25 倍。这不是噪声能解释的。',
          '这五种 RNA 的序列、长度、二级结构都不一样，可它们排出来的顺序很整齐。想想它们在化学上还差什么——哪一种 RNA 在细胞里被"加工"得最多？',
          'tRNA 是细胞里修饰最密集的 RNA（每条约 80 nt 上十几个修饰核苷），它几乎不激活；IVT mRNA 一个修饰都没有，激活最强。打开修饰面板，把 TNF-α 对修饰占比画出来看。',
        ],
        answer: `刺激性由强到弱：<b>IVT mRNA &gt; 细菌 RNA &gt; 线粒体 RNA &gt; 哺乳动物总 RNA &gt; 哺乳动物 tRNA</b>，
          与它们的<b>修饰核苷密度恰好反向</b>。
          <p>结论：先天免疫受体（TLR3/7/8、RIG-I）并不是在识别"RNA"这个分子类别——否则细胞自己的 RNA 也会报警——
          而是在识别<b>没有经过修饰的核苷</b>。自身 RNA 在转录后被一整套酶密集修饰（Ψ、m⁵C、m⁶A、m⁵U、m¹A……），
          这些修饰相当于一枚难以伪造的"自体标记"；病毒 RNA 和体外转录的 mRNA 没有经过这套系统，于是被当成外来物。</p>
          <p>这正是 Karikó、Buckstein、Ni 与 Weissman 在 <i>Immunity</i> 23, 165 (2005) 中提出并用实验证实的假说。</p>`,
        build(body, api) {
          const S = { sel: 'ivt', rows: [], showMod: false };
          const stg = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(stg, { aspect: 0.52, minH: 200, maxH: 290 });
          stg.append(h.el('div', { class: 'mrna-leg' }, [
            h.el('span', {}, [h.el('i', { style: 'background:var(--s1)' }), 'TNF-α（已测）']),
            h.el('span', {}, [h.el('i', { style: 'background:var(--s3)' }), '修饰核苷占比（打开面板后）']),
          ]));

          const btns = SOURCES.map((s) => h.el('button', { type: 'button', class: 'mrna-src', 'aria-pressed': String(s.k === S.sel),
            onclick: () => { S.sel = s.k; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(SOURCES[i].k === s.k))); } },
            [h.el('span', { text: s.zh }), h.el('small', { text: '来源 ' + (SOURCES.indexOf(s) + 1) })]));
          const grid = h.el('div', { class: 'mrna-grid' }, btns);

          const ctl = h.el('div', { class: 'mrna-row' }, [
            h.button({ label: '对选中的来源做一次 ELISA', kind: 'primary', onClick: () => measure(S.sel) }),
            h.button({ label: '五种各测一次', onClick: () => SOURCES.forEach((s) => measure(s.k)) }),
            h.button({ label: '清空', onClick: () => { S.rows = []; redraw(); } }),
          ]);
          const tMod = h.toggle({ label: '显示每种来源的修饰核苷占比（示意数据）', onChange: (b) => { S.showMod = b; modBox.hidden = !b; redraw(); } });

          const Ro = { last: h.readout('最近一次读数'), n: h.readout('已测次数'), rng: h.readout('最高 / 最低') };
          const roBox = h.el('div', { class: 'lab-readout' });
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const modBox = h.el('div', { class: 'mrna-tab', hidden: true });
          modBox.innerHTML = `<table><thead><tr><th>RNA 来源</th>${MODKINDS.map((m) => `<th>${m}</th>`).join('')}<th>合计</th></tr></thead><tbody>${
            SOURCES.map((s) => `<tr><td>${s.zh}</td>${MODMIX[s.k].map((v) => `<td>${v ? v.toFixed(1) + '%' : '—'}</td>`).join('')}<td><b>${s.mod ? s.mod.toFixed(1) + '%' : '0'}</b></td></tr>`).join('')}</tbody></table>`;

          function measure(k) {
            const rep = S.rows.filter((r) => r.k === k).length;
            const v = measureTNF(k, rep);
            S.rows.push({ k, v });
            const s = SOURCES.find((x) => x.k === k);
            Ro.last.set(`${s.zh}：${v.toFixed(0)} pg/mL`);
            redraw();
          }
          function stats() {
            const m = {};
            SOURCES.forEach((s) => { const vs = S.rows.filter((r) => r.k === s.k).map((r) => r.v); m[s.k] = vs.length ? vs.reduce((a, b) => a + b) / vs.length : null; });
            return m;
          }
          function redraw() {
            const m = stats(), got = Object.values(m).filter((x) => x != null);
            Ro.n.set(`${S.rows.length} 次（${Object.values(m).filter((x) => x != null).length}/5 种已测）`);
            Ro.rng.set(got.length >= 2 ? `${Math.max(...got).toFixed(0)} / ${Math.min(...got).toFixed(0)} pg/mL（约 ${(Math.max(...got) / Math.min(...got)).toFixed(0)} 倍）` : '—');
            draw(m);
          }
          function draw(m) {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const none = Object.values(m).every((x) => x == null);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 5, y0: 0, y1: 1400, pad: { l: 50, r: S.showMod ? 42 : 12, t: 14, b: 52 },
              xTicks: [], yTicks: [0, 350, 700, 1050, 1400], xLabel: '', yLabel: 'TNF-α (pg/mL)' }, col);
            const bw = A.iw / 5;
            SOURCES.forEach((s, i) => {
              const x = A.p.l + bw * (i + 0.5), v = m[s.k];
              if (v != null) {
                const y = A.Y(v);
                g.fillStyle = col('--s1'); g.globalAlpha = s.k === S.sel ? 1 : 0.75;
                g.fillRect(x - bw * 0.3, y, bw * 0.6, A.p.t + A.ih - y); g.globalAlpha = 1;
                // 单次测量点
                g.fillStyle = col('--fg');
                S.rows.filter((r) => r.k === s.k).forEach((r, j) => { g.beginPath(); g.arc(x - bw * 0.14 + (j % 5) * bw * 0.07, A.Y(r.v), 2, 0, 7); g.fill(); });
                g.fillStyle = col('--muted'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'bottom';
                g.fillText(v.toFixed(0), x, y - 3);
              } else {
                g.strokeStyle = col('--line'); g.setLineDash([3, 3]);
                g.strokeRect(x - bw * 0.3, A.p.t + A.ih - 14, bw * 0.6, 14); g.setLineDash([]);
                g.fillStyle = col('--muted'); g.font = '10px ' + col('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'bottom';
                g.fillText('未测', x, A.p.t + A.ih - 18);
              }
              g.fillStyle = s.k === S.sel ? col('--accent') : col('--muted');
              g.font = (s.k === S.sel ? '600 ' : '') + (W < 460 ? '10px ' : '11px ') + col('--body-font');
              g.textAlign = 'center'; g.textBaseline = 'top';
              /* 窄屏用短名，并分两行，避免相邻标签相撞 */
              const SHORT = { ivt: ['IVT', 'mRNA'], bact: ['细菌', 'RNA'], mito: ['线粒体', 'RNA'], total: ['哺乳', '总 RNA'], trna: ['哺乳', 'tRNA'] };
              SHORT[s.k].forEach((ln, j) => g.fillText(ln, x, A.p.t + A.ih + 6 + j * 13));
            });
            if (none) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('选一种 RNA，按「做一次 ELISA」', A.p.l + A.iw / 2, A.p.t + A.ih / 2 - 10);
            }
            if (S.showMod) {
              const Y2 = (v) => A.p.t + A.ih - (v / 24) * A.ih;
              g.strokeStyle = col('--s3'); g.lineWidth = 2; g.beginPath();
              SOURCES.forEach((s, i) => { const x = A.p.l + bw * (i + 0.5); i ? g.lineTo(x, Y2(s.mod)) : g.moveTo(x, Y2(s.mod)); });
              g.stroke();
              g.fillStyle = col('--s3');
              SOURCES.forEach((s, i) => { const x = A.p.l + bw * (i + 0.5); g.beginPath(); g.arc(x, Y2(s.mod), 3.5, 0, 7); g.fill(); });
              g.font = '10px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
              [0, 8, 16, 24].forEach((v) => g.fillText(v + '%', A.p.l + A.iw + 4, Y2(v)));
            }
          }

          let okQ = false;
          const quiz = H.quiz({
            question: '五种 RNA 的刺激性相差约 25 倍。<b>哪一个变量能同时解释这五个数</b>？',
            options: [
              { label: 'RNA 的长度：越长越容易被受体抓住', ok: false, why: '不对。tRNA（约 80 nt）最短却最不激活，而更长的哺乳动物总 RNA 比细菌 RNA 还弱。长度与顺序对不上。' },
              { label: '修饰核苷的密度：修饰越多越不激活', ok: true,
                why: '对。顺序与修饰密度严格反向：IVT mRNA（0%）最强，tRNA（约 21%）最弱。受体识别的不是"RNA"，而是<b>未经修饰的核苷</b>——修饰是细胞给自身 RNA 盖的"自体"印章。这正是 Karikó 与 Weissman 2005 年的结论。' },
              { label: '是不是单链：双链 RNA 才激活 TLR3', ok: false, why: '双链确实能激活 TLR3，但这五种都以单链为主，且 IVT mRNA 与 tRNA 都有大量二级结构。这解释不了 25 倍的差距。' },
              { label: '来源是否为原核生物', ok: false, why: '那只能把细菌 RNA 分出来。线粒体 RNA（真核细胞器）比哺乳动物总 RNA 强得多，IVT mRNA 根本没有生物来源却最强。' },
            ],
            onOk: () => { okQ = true; finish(); },
          });
          function finish() {
            const m = stats(), n = Object.values(m).filter((x) => x != null).length;
            if (!okQ) return;
            if (n < 5) { api.say('结论对了，但先把五种都测一遍，让数据支持它。', 'info'); return; }
            api.done(`<b>免疫系统认的是"未修饰的核苷"。</b>刺激性与修饰密度严格反向：
              IVT mRNA（无修饰）最强，哺乳动物 tRNA（修饰最密）几乎不激活。
              自身 RNA 转录后被一整套酶密集修饰，这些修饰成为难以伪造的"自体标记"；
              病毒和体外转录的 RNA 没经过这套系统，于是被 TLR3/7/8 与 RIG-I 当作外来物。
              Karikó、Buckstein、Ni 与 Weissman，<i>Immunity</i> 23, 165 (2005)。`);
          }
          const chk = h.button({ label: '检查我的数据是否齐全', onClick: () => {
            const m = stats(), n = Object.values(m).filter((x) => x != null).length;
            api.say(n < 5 ? `还差 ${5 - n} 种没测。` : '五种都测过了。', n < 5 ? 'bad' : 'good');
            finish();
          } });

          body.append(stg, grid, ctl, h.el('div', { class: 'ctl' }, [tMod.el]), roBox, modBox,
            h.el('div', { class: 'mrna-sec' }, [quiz.el, h.el('div', { class: 'mrna-row' }, [chk])]));
          api.typeset(body);
          redraw();
          cv.onResize(redraw);
          const off = watchTheme(redraw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ============ 第二关：换掉一个字母 ============ */
      const stage2 = {
        title: '换掉一个字母',
        task: `<p>假说有了：细胞认的是<b>未修饰的核苷</b>。那就反过来用它——在体外转录的时候，
          把某一种核苷三磷酸整个换成化学修饰过的类似物。序列一个字母都不改，只改化学。</p>
          <p>下面你可以把<b>所有尿苷 U</b> 换成 Ψ（假尿苷）、m¹Ψ、m⁵U 或 s²U，也可以另外把 C 换成 m⁵C、把 A 换成 m⁶A（可叠加）。
          每一批测两个量：树突状细胞的 <b>TNF-α</b>（炎症），以及同一条 mRNA 编码的<b>荧光素酶</b>活性（蛋白产量）。</p>
          <p><b>任务</b>：找到一种修饰，让<b>炎症尽可能低、同时表达尽可能高</b>（目标：TNF-α &lt; 150 pg/mL 且荧光素酶 &gt; $7\\times10^5$ RLU）。
          然后回答：表达为什么会跟着一起上去？</p>
          <p class="mrna-note">数值为示意性模拟，用于让规律可读；真实数据见 Karikó 等 2005、2008。</p>`,
        hints: [
          '先把四种尿苷替代各试一遍，只看 TNF-α：都降，但降的程度不同。再看荧光素酶那一栏——有两种修饰把表达也抬了上去，有一种反而把表达压下去了。',
          's²U 虽然也压炎症，但它让 mRNA 本身难读，表达反而掉；m⁶A 也拖累表达。把注意力放在 Ψ 和它的甲基化衍生物上。',
          'm¹Ψ（N1-甲基假尿苷）两项都最好，这正是 BNT162b2 与 mRNA-1273 实际采用的修饰。至于表达为什么升：看读数里的"PKR 激活程度"这一栏随修饰怎么变。',
        ],
        answer: `<b>最优：m¹Ψ</b>（N1-甲基假尿苷），其次是 Ψ。两者都把 TNF-α 压到几十 pg/mL，同时把荧光素酶抬高约一个数量级。
          s²U 与 m⁵U 压炎症的效果稍弱；m⁶A、m⁵C 不但抑制有限，还拖累翻译。
          <p><b>表达为什么跟着升。</b>未修饰的 IVT mRNA 激活 <b>PKR</b>（蛋白激酶 R）；PKR 磷酸化翻译起始因子 eIF2α，
          使三元复合物无法再生，<b>整个细胞的翻译起始被关停</b>——这是细胞对付病毒的通用手段。
          Ψ/m¹Ψ 大幅削弱 PKR 的激活，eIF2α 不被磷酸化，翻译机器照常工作；再加上炎症介导的降解减少，
          两个因子相乘，表达可以提高一个数量级以上（Karikó 等，<i>Mol. Ther.</i> 16, 1833, 2008）。</p>
          <p>所以"炎症下降"与"表达上升"不是两件好事碰巧同时发生，而是<b>同一个开关的两端</b>。
          另外，裸 RNA 的递送效率很低；把 mRNA 包进脂质纳米颗粒（LNP）是独立的、叠加的一步。</p>`,
        build(body, api) {
          const S = { u: 'U', c5: false, a6: false, lnp: true, runs: [] };
          const stg = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(stg, { aspect: 0.5, minH: 195, maxH: 275 });
          stg.append(h.el('div', { class: 'mrna-leg' }, [
            h.el('span', {}, [h.el('i', { style: 'background:var(--warn)' }), 'TNF-α（炎症，越低越好）']),
            h.el('span', {}, [h.el('i', { style: 'background:var(--good)' }), '荧光素酶（表达，越高越好）']),
          ]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const cU = h.choice({ label: '把所有 U 换成', value: 'U',
            options: Object.entries(UMODS).map(([k, v]) => ({ value: k, label: v.zh.split('（')[0] })),
            onChange: (v) => { S.u = v; upd(); } });
          const tC = h.toggle({ label: 'C → m⁵C', onChange: (b) => { S.c5 = b; upd(); } });
          const tA = h.toggle({ label: 'A → m⁶A', onChange: (b) => { S.a6 = b; upd(); } });
          const tL = h.toggle({ label: '用 LNP 递送（关掉 = 裸 RNA）', value: true, onChange: (b) => { S.lnp = b; upd(); } });
          ctl.append(cU.el, tC.el, tA.el, tL.el);

          const Ro = { t: h.readout('TNF-α'), l: h.readout('荧光素酶'), p: h.readout('PKR 激活程度'), v: h.readout('是否达标') };
          const roBox = h.el('div', { class: 'lab-readout' });
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabBox = h.el('div', { class: 'mrna-tab' });

          const key = () => `${S.u}|${S.c5 ? 1 : 0}|${S.a6 ? 1 : 0}|${S.lnp ? 1 : 0}`;
          const label = () => [UMODS[S.u].zh.split('（')[0], S.c5 ? 'm⁵C' : null, S.a6 ? 'm⁶A' : null].filter(Boolean).join(' + ') + (S.lnp ? '' : '（裸）');
          function cur() {
            const a = assay(S.u, S.c5, S.a6, S.lnp);
            let seed = 0; const k = key(); for (let i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) | 0;
            return { tnf: noisy(a.tnf, 4000 + seed), luc: noisy(a.luc, 9000 + seed), pkr: a.pkrOn, lab: label(), k };
          }
          let okQ = false, okTarget = false;
          function upd() {
            const r = cur();
            Ro.t.set(`${r.tnf.toFixed(0)} pg/mL`);
            Ro.l.set(`${sci(r.luc)} RLU`);
            Ro.p.set(`${(100 * r.pkr).toFixed(0)}%　→ 翻译被关停 ${(92 * r.pkr).toFixed(0)}%`);
            const hit = r.tnf < 150 && r.luc > 7e5;
            okTarget = okTarget || hit;
            Ro.v.set(hit ? '两项都达标 ✓' : `${r.tnf < 150 ? '炎症达标' : '炎症偏高'} / ${r.luc > 7e5 ? '表达达标' : '表达偏低'}`);
            if (!S.runs.some((x) => x.k === r.k)) S.runs.push(r);
            if (hit && !okQ) { qBox.hidden = false; api.typeset(qBox); api.say('两项同时达标了。那么下面这个问题：表达为什么会跟着炎症一起变好？', 'good'); }
            table(); draw();
          }
          function table() {
            const rows = S.runs.slice().sort((a, b) => a.tnf - b.tnf);
            tabBox.innerHTML = `<table><thead><tr><th>这一批的修饰</th><th>TNF-α (pg/mL)</th><th>荧光素酶 (RLU)</th><th>PKR 激活</th></tr></thead><tbody>${
              rows.map((r) => `<tr class="${r.k === key() ? 'on' : ''}"><td>${r.lab}</td><td>${r.tnf.toFixed(0)}</td><td>${sci(r.luc)}</td><td>${(100 * r.pkr).toFixed(0)}%</td></tr>`).join('')}</tbody></table>`;
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 10, x1: 1600, y0: 1e4, y1: 3e6, logY: true, pad: { l: 56, r: 14, t: 14, b: 36 },
              xTicks: [250, 500, 750, 1000, 1250, 1500], yTicks: [1e4, 1e5, 1e6],
              fmtY: (v) => '10' + sup(Math.round(Math.log10(v))), xLabel: 'TNF-α (pg/mL) →  炎症', yLabel: '荧光素酶 (RLU)' }, col);
            // 目标区
            g.fillStyle = col('--good'); g.globalAlpha = 0.12;
            g.fillRect(A.X(10), A.p.t, A.X(150) - A.X(10), A.Y(7e5) - A.p.t); g.globalAlpha = 1;
            g.fillStyle = col('--good'); g.font = '10.5px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('目标区', A.X(12), A.p.t + 4);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const k = key();
            S.runs.forEach((r) => {
              const on = r.k === k;
              g.fillStyle = on ? col('--accent') : col('--muted');
              g.beginPath(); g.arc(A.X(Math.min(1590, r.tnf)), A.Y(r.luc), on ? 5.5 : 3.5, 0, 7); g.fill();
              if (on) { g.font = '11px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(r.lab, A.X(Math.min(1590, r.tnf)) - 7, A.Y(r.luc) - 3); }
            });
            g.restore();
          }
          const qBox = h.el('div', { class: 'mrna-sec', hidden: true });
          qBox.append(H.quiz({
            question: '把 U 换成 Ψ/m¹Ψ 之后，炎症下降是意料之中的。可<b>蛋白产量也上去了一个数量级</b>——为什么？',
            options: [
              { label: '修饰让 mRNA 和核糖体结合得更紧，翻译起始更快', ok: false,
                why: '修饰确实略微改变堆积与局部结构，但这不是主要原因：读数里 PKR 激活程度随修饰一起掉了下去，量级上对得多。' },
              { label: '未修饰 mRNA 激活 PKR，PKR 磷酸化 eIF2α 把翻译关停；修饰后 PKR 不被激活，翻译机器照常工作', ok: true,
                why: '对。PKR 是细胞对付病毒的通用开关：一旦被双链/外来 RNA 激活，就磷酸化 eIF2α，使翻译起始停摆。Ψ/m¹Ψ 大幅削弱这个激活，于是 mRNA 既不报警、也不被"连坐"关停；加上炎症介导的降解减少，两个因子相乘。Karikó 等，<i>Mol. Ther.</i> 16, 1833 (2008)。' },
              { label: '修饰核苷让 mRNA 完全不被降解，所以越积越多', ok: false,
                why: '修饰提高了稳定性，但 mRNA 仍会在数小时到数天内降解——否则它就不再是"用完即走"的药了。主要机制是翻译没有被关停。' },
              { label: '修饰改变了密码子，让蛋白合成得更快', ok: false,
                why: 'Ψ 与 U 一样和 A 配对，m¹Ψ 也是；序列与编码的蛋白完全没变。改的只是化学，不是信息。' },
            ],
            onOk: () => { okQ = true; finish(); },
          }).el);
          function finish() {
            if (okQ && okTarget) api.done(`<b>一个开关的两端。</b>把尿苷换成 Ψ、特别是 <b>m¹Ψ</b>（N1-甲基假尿苷），
              既让 TLR 不再把这条 mRNA 当外来物，又让 PKR 不被激活、eIF2α 不被磷酸化，于是翻译不被关停——
              炎症下降与表达上升是同一处化学改动的两个后果。
              BNT162b2 与 mRNA-1273 都用 m¹Ψ 完全替代尿苷。
              另外两块拼图不属于这个奖但缺一不可：LNP 递送（你关掉 LNP 时看到的落差），以及前融合构象稳定的刺突抗原设计。`);
          }

          body.append(stg, ctl, roBox, tabBox, qBox);
          api.typeset(body);
          upd();
          cv.onResize(draw);
          const off = watchTheme(() => { draw(); });
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ============ 第三关：疫苗是否有效 ============ */
      const stage3 = {
        title: '疫苗是否有效',
        task: `<p>2020 年秋。修饰 mRNA、LNP 递送、前融合稳定的刺突抗原——三样都就位了，疫苗做了出来。
          但"做出来"和"有用"是两回事，这只能靠随机对照试验回答。</p>
          <p>约 43 000 名受试者按 1:1 随机分到疫苗组或安慰剂组，双盲。从第二剂后 7 天开始统计有症状的 COVID-19：</p>
          <ul>
            <li>疫苗组：<b>8</b> 例 / 约 <b>18 198</b> 人</li>
            <li>安慰剂组：<b>162</b> 例 / 约 <b>18 325</b> 人</li>
          </ul>
          <p><b>任务</b>：（a）算出疫苗有效性 VE，定义为 $\\mathrm{VE} = 1 - \\dfrac{\\text{疫苗组发病率}}{\\text{安慰剂组发病率}}$（以百分数填写，容差 ±1）。
          （b）再用下面的滑块把总病例数缩小，看可信区间怎么变，并回答它由什么决定。</p>
          <p class="mrna-note">分组人数为报告中的近似值。可信区间用条件二项法（给定总病例数时病例在两组间的分配服从二项分布），与原报告的贝叶斯方法略有差异。</p>`,
        hints: [
          '发病率就是病例数除以人数。两组人数几乎相等（18 198 与 18 325），所以 VE 也几乎就是 $1 - 8/162$。',
          '$r_v = 8/18\\,198 = 4.40\\times10^{-4}$，$r_p = 162/18\\,325 = 8.84\\times10^{-3}$，比值 $0.0497$。',
          'VE $= 1 - 0.0497 = 0.950$，即 <b>95%</b>。注意它的含义是"接种者的发病风险降为未接种者的 1/20"，不是"95% 的人受到保护"。',
        ],
        answer: `<b>(a)</b> $r_v = 8/18\\,198 = 4.40\\times10^{-4}$，$r_p = 162/18\\,325 = 8.84\\times10^{-3}$，
          $\\mathrm{VE} = 1 - r_v/r_p = 1 - 0.0497 = \\mathbf{95.0\\%}$。与报告一致（95% 可信区间 90.3%–97.6%）。
          <p><b>(b) 区间宽度由<u>总病例数</u>决定，而不是由受试者人数决定。</b>
          在泊松模型下，给定总病例数 $C = c_v + c_p$ 时 $c_v \\sim \\mathrm{Bin}(C, \\theta)$，其中
          $\\theta = \\frac{\\lambda_v T_v}{\\lambda_v T_v + \\lambda_p T_p}$，而 $\\mathrm{VE} = 1 - \\frac{\\theta}{(1-\\theta)r}$（$r = T_v/T_p$）。
          $\\mathrm{VE}$ 是 $\\theta$ 的严格减函数，所以把 $\\theta$ 的区间端点互换代入即可。
          令 $\\phi = \\ln\\frac{\\theta}{1-\\theta}$，其渐近标准误 $\\mathrm{SE}(\\phi) = 1/\\sqrt{C\\,\\hat\\theta(1-\\hat\\theta)} \\propto C^{-1/2}$。</p>
          <p>所以把病例数从 170 降到 42（同样的比例），区间从约 $[90\\%, 97\\%]$ 展宽到约 $[81\\%, 99\\%]$：
          点估计不动，不确定性翻倍。三期试验的规模正是由"要攒够多少病例"倒推的，
          也因此必须在流行强度足够高的地区做——$C$ 由发病率而非入组人数直接决定。</p>`,
        build(body, api) {
          const S = { scale: 1, ansOK: false, quizOK: false };
          const stg = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(stg, { aspect: 0.46, minH: 180, maxH: 250 });

          const ctl = h.el('div', { class: 'lab-controls' });
          const sSc = h.slider({ label: '把总病例数按比例缩小（点估计不变）', min: 1, max: 20, step: 1, value: 1,
            format: (v) => `1/${v} → 共 ${Math.max(2, Math.round(TRIAL.cv / v) + Math.round(TRIAL.cp / v))} 例`,
            onInput: (v) => { S.scale = v; upd(); } });
          ctl.append(sSc.el);

          const Ro = { rv: h.readout('疫苗组发病率'), rp: h.readout('安慰剂组发病率'), ve: h.readout('VE = 1 − 发病率之比'), ci: h.readout('95% 可信区间（条件二项）'), w: h.readout('区间宽度') };
          const roBox = h.el('div', { class: 'lab-readout' });
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const ciBar = h.el('div', { class: 'mrna-ci' });

          function counts() {
            const cv_ = Math.max(1, Math.round(TRIAL.cv / S.scale)), cp_ = Math.max(1, Math.round(TRIAL.cp / S.scale));
            return { cv: cv_, cp: cp_, Nv: TRIAL.Nv, Np: TRIAL.Np };
          }
          function upd() {
            const c = counts();
            const rv = c.cv / c.Nv, rp = c.cp / c.Np;
            const ve = veOf(c.cv, c.cp, c.Nv, c.Np), [lo, hi] = veCI(c.cv, c.cp, c.Nv, c.Np);
            Ro.rv.set(`${c.cv} / ${c.Nv} = ${sci(rv)}`);
            Ro.rp.set(`${c.cp} / ${c.Np} = ${sci(rp)}`);
            Ro.ve.set(`1 − ${(rv / rp).toFixed(4)} = ${pct(ve)}`);
            Ro.ci.set(`[${pct(lo)}, ${pct(hi)}]　共 ${c.cv + c.cp} 例`);
            Ro.w.set(`${(100 * (hi - lo)).toFixed(1)} 个百分点`);
            // CI 条
            ciBar.textContent = '';
            const X = (v) => `${Math.max(0, Math.min(100, (v - 0.3) / 0.7 * 100))}%`;
            [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((t) => {
              ciBar.append(h.el('div', { class: 'tick', style: `left:${X(t)}` }));
              ciBar.append(h.el('div', { class: 'lab', style: `left:${X(t)}`, text: (100 * t).toFixed(0) }));
            });
            ciBar.append(h.el('div', { class: 'bar', style: `left:${X(lo)};width:${Math.max(0.5, (hi - lo) / 0.7 * 100)}%` }));
            ciBar.append(h.el('div', { class: 'pt', style: `left:${X(ve)}` }));
            draw(c, ve, lo, hi);
          }
          function draw(c, ve, lo, hi) {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 180, y0: 0.3, y1: 1.02, pad: { l: 52, r: 14, t: 14, b: 36 },
              xTicks: [0, 45, 90, 135, 180], yTicks: [0.4, 0.6, 0.8, 1], fmtY: (v) => (100 * v).toFixed(0) + '%',
              xLabel: '总病例数 C', yLabel: 'VE 的 95% 区间' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // 同样点估计、不同 C 时的区间带
            const band = [];
            for (let Cc = 6; Cc <= 180; Cc += 2) {
              const cvv = Math.max(1, Math.round((TRIAL.cv / (TRIAL.cv + TRIAL.cp)) * Cc));
              const [l, hgh] = veCI(cvv, Cc - cvv, TRIAL.Nv, TRIAL.Np);
              band.push([Cc, l, hgh]);
            }
            g.fillStyle = col('--s1'); g.globalAlpha = 0.22; g.beginPath();
            band.forEach(([x, l], i) => (i ? g.lineTo(A.X(x), A.Y(l)) : g.moveTo(A.X(x), A.Y(l))));
            for (let i = band.length - 1; i >= 0; i--) g.lineTo(A.X(band[i][0]), A.Y(band[i][2]));
            g.closePath(); g.fill(); g.globalAlpha = 1;
            g.strokeStyle = col('--s1'); g.lineWidth = 1.5;
            [1, 2].forEach((j) => { g.beginPath(); band.forEach(([x, l, hgh], i) => { const y = A.Y(j === 1 ? l : hgh); i ? g.lineTo(A.X(x), y) : g.moveTo(A.X(x), y); }); g.stroke(); });
            // 点估计水平线
            g.strokeStyle = col('--muted'); g.setLineDash([4, 4]); g.lineWidth = 1;
            g.beginPath(); g.moveTo(A.p.l, A.Y(ve)); g.lineTo(A.p.l + A.iw, A.Y(ve)); g.stroke(); g.setLineDash([]);
            // 当前点
            const C = Math.max(2, Math.round(TRIAL.cv / S.scale) + Math.round(TRIAL.cp / S.scale));
            g.strokeStyle = col('--accent'); g.lineWidth = 2.4;
            g.beginPath(); g.moveTo(A.X(C), A.Y(lo)); g.lineTo(A.X(C), A.Y(hi)); g.stroke();
            g.fillStyle = col('--accent'); g.beginPath(); g.arc(A.X(C), A.Y(ve), 4.5, 0, 7); g.fill();
            g.restore();
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
            g.fillText('宽度 ∝ C^(−1/2)', A.p.l + A.iw - 4, A.p.t + 4);
          }

          const finish = () => { if (S.ansOK && S.quizOK) api.done(`<b>VE = 95%（95% CI 90.3–97.6），Polack 等，<i>NEJM</i> 383, 2603（2020 年 12 月）。</b>
            疫苗是 <b>BNT162b2</b>（辉瑞/BioNTech）；Moderna 的 <b>mRNA-1273</b> 随后给出几乎相同的结果。
            两者都用 m¹Ψ 完全替代尿苷、用脂质纳米颗粒递送、编码前融合构象稳定的刺突蛋白。
            注意 VE 的含义是风险比：接种者的发病风险降为约 1/20，而不是"95% 的人完全免疫"。
            区间宽度由<b>总病例数</b>按 $C^{-1/2}$ 决定——这也是为什么三期试验的规模是由"要攒够多少病例"倒推的。`); };
          const ans = H.answer({
            label: '疫苗有效性 VE = ?（以百分数填写，容差 ±1）', unit: '%', placeholder: '例如 95',
            check: (v) => {
              const truth = 100 * veOf(TRIAL.cv, TRIAL.cp, TRIAL.Nv, TRIAL.Np);
              if (Math.abs(v - truth) <= 1) return { ok: true, msg: `对：$r_v = ${sci(TRIAL.cv / TRIAL.Nv)}$，$r_p = ${sci(TRIAL.cp / TRIAL.Np)}$，$\\mathrm{VE} = 1 - ${(TRIAL.cv / TRIAL.Nv / (TRIAL.cp / TRIAL.Np)).toFixed(4)} = ${truth.toFixed(1)}\\%$。` };
              if (Math.abs(v - 0.95) < 0.02) return { ok: false, msg: '请以<b>百分数</b>填写（95 而不是 0.95）。' };
              if (Math.abs(v - 4.97) < 0.5) return { ok: false, msg: '这是发病率之比（约 5%），VE 是 $1-$ 它。' };
              if (Math.abs(v - 5) < 0.6) return { ok: false, msg: '这是"相对风险"的百分数。VE $= 1 - r_v/r_p$。' };
              if (Math.abs(v - 99.96) < 0.05 || Math.abs(v - 99.9) < 0.3) return { ok: false, msg: '这是"没发病的人占比"，不是有效性。VE 比较的是<b>两组的发病率</b>。' };
              return { ok: false, msg: '不对。先各算发病率：$8/18198$ 与 $162/18325$，再取 $1 - $ 两者之比。' };
            },
            onOk: () => { S.ansOK = true; qBox.hidden = false; api.typeset(qBox); finish(); },
          });
          const qBox = h.el('div', { class: 'mrna-sec', hidden: true });
          qBox.append(
            h.el('p', { class: 'mrna-note', html: '现在拖动上面的滑块，把总病例数缩小，盯住可信区间。' }),
            H.quiz({
              question: '点估计一直是 95%，可信区间却越缩越宽。它的宽度主要由什么决定？',
              options: [
                { label: '受试者人数：入组的人越多，区间越窄', ok: false,
                  why: '不对。滑块没有动人数，只动了病例数，区间就变了。人数只是通过影响<b>能攒到多少病例</b>间接起作用。' },
                { label: '总病例数 C：宽度按 $C^{-1/2}$ 收缩', ok: true,
                  why: '对。给定 $C$ 时 $c_v\\sim\\mathrm{Bin}(C,\\theta)$，$\\mathrm{SE}(\\ln\\frac{\\theta}{1-\\theta}) = 1/\\sqrt{C\\hat\\theta(1-\\hat\\theta)}$。所以三期试验的规模由"要攒够多少病例"倒推，而且必须在流行强度足够高的地区做。' },
                { label: '两组人数是否严格相等', ok: false,
                  why: '人数比 $r = T_v/T_p$ 只进入点估计的一个接近 1 的因子（这里 0.993）。把它设成严格相等，区间几乎不变。' },
                { label: '随访时间的长短，与病例数无关', ok: false,
                  why: '随访时间确实重要，但它同样是通过"攒到多少病例"起作用的。统计精度直接挂在 $C$ 上。' },
              ],
              onOk: () => { S.quizOK = true; finish(); },
            }).el);

          body.append(stg, ctl, roBox,
            h.el('div', { class: 'mrna-card' }, [h.el('h4', { text: 'VE 的 95% 可信区间' }), ciBar]),
            h.el('div', { class: 'mrna-sec' }, [ans.el]), qBox);
          api.typeset(body);
          upd();
          cv.onResize(upd);
          const off = watchTheme(upd);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
