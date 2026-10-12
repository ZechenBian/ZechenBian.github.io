/* 把一段 DNA 变多 — 挑战版（Nobel Chemistry 1993: Mullis, PCR；Smith, 定点突变）
 *
 * 第一关 设计引物：120 bp 虚构模板（双链），目标区 41–80。读者选正向引物（上链，18–24 nt）
 *   与反向引物（下链右端的反向互补）。检查：方向、Tm 55–65 ℃、两条 Tm 差 ≤ 3 ℃、3′ 端互补 < 4。
 *   Tm 用 Wallace 规则 2(A+T)+4(G+C)（14–25 nt 适用）。
 *   模板与"显而易见的 20/20 选法"已离线验证：F=21–40 的 Tm 54 ℃（偏低）→ 必须挪位置或加长。
 *   已知可行解之一：F = 2..20 (19 nt, Tm 56)，R 位点 = 82..100 (19 nt, Tm 56)，产物 99 bp。
 *
 * 第二关 循环：热循环仪。链计数的精确递推（每条链每轮被复制一次，E = 1）：
 *   L_{n+1} = L_n + 2，S_{n+1} = 2 S_n + L_n，L_0 = S_0 = 0 ⇒ L_n = 2n，S_n = 2^{n+1} − 2n − 2，
 *   总链数 = 2^{n+1}。以"初始双链 = 1 分子"为单位（除以 2）：总量 2^n，短产物 2^n − n − 1。
 *   题目接受文献常用的混合写法 2^30 − 60 = 1 073 741 764（与 2^30 − 31 相差 29，相对差 2.7e−8）。
 *   Klenow 片段 37 ℃ 工作、94 ℃ 失活（每轮须补加）；Taq 来自 Thermus aquaticus，95 ℃ 可存活。
 *
 * 第三关 定量：qPCR。F = x/(1+x)，x = N0 (1+E)^n / Nmax，Nmax = 1e12（任意单位），E = 0.92。
 *   阈值 F_t ⇒ N_t = Nmax·F_t/(1−F_t)；Ct = log10(N_t/N0)/log10(1+E)，
 *   斜率 = −1/log10(1+E)（E = 0.92 → −3.530；E = 1 → −3.322）。阈值只平移截距，不改斜率。
 *   未知样 N0 = 4.3e4 拷贝 → Ct ≈ 22.63。
 *
 * 所有 DNA 序列均为虚构的随机序列（固定种子生成后写死），不取自任何真实生物或病原体。
 */
(() => {
  const TMPL = 'TAAATATCGCCAAGGCTACCATTACAACCTCGAGTGTTTAGGAACACCCAGCACACAAGTATACATTCAGTACCTGTACTGTGGAGAATTGTCTCGTTCGGGAGTTGTAAAGTACCAGGC';
  const T0 = 41, T1 = 80;           // 目标区（1 基，含两端）
  const LMIN = 18, LMAX = 24, TMLO = 55, TMHI = 65, DTM = 3, DIMER = 4;
  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const comp = (s) => s.split('').map((c) => COMP[c]).join('');
  const rc = (s) => comp(s).split('').reverse().join('');
  const tmOf = (p) => { let at = 0, gc = 0; for (const c of p) (c === 'G' || c === 'C') ? gc++ : at++; return 2 * at + 4 * gc; };
  const gcPct = (p) => (100 * [...p].filter((c) => c === 'G' || c === 'C').length) / p.length;

  /* 3′ 端互补：在小范围错位下，从某条引物的 3′ 末端起连续互补的碱基数 */
  function dimer3(a, b, maxShift = 6) {
    let best = 0;
    for (let d = 0; d <= maxShift; d++) {
      let run = 0;
      for (let i = 0; i < Math.min(a.length, b.length - d); i++) { if (COMP[a[a.length - 1 - i]] === b[b.length - 1 - i - d]) run++; else break; }
      if (run > best) best = run;
      run = 0;
      for (let i = 0; i < Math.min(a.length - d, b.length); i++) { if (COMP[a[a.length - 1 - i - d]] === b[b.length - 1 - i]) run++; else break; }
      if (run > best) best = run;
    }
    return best;
  }
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---- 第二关：链计数（每条链每轮复制一次，E = 1） ---- */
  function cycleCounts(n) {
    let L = 0, S = 0; const rows = [];
    for (let k = 1; k <= n; k++) { const Lp = L; S = 2 * S + Lp; L = Lp + 2; rows.push({ n: k, orig: 2, L, S, tot: 2 + L + S }); }
    return rows;
  }
  /* ---- 第三关：qPCR ---- */
  const NMAX = 1e12, EFF = 0.92;
  const STD = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7];
  const UNKNOWN = 4.3e4;
  const fluor = (N0, n, e) => { const x = (N0 * Math.pow(1 + e, n)) / NMAX; return x / (1 + x); };
  const ctOf = (N0, Ft, e) => Math.log10((NMAX * Ft) / (1 - Ft) / N0) / Math.log10(1 + e);

  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };
  const grp = (v) => v.toLocaleString('en-US');

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  const CSS = `
.pcr-scroll{overflow-x:auto;overflow-y:hidden;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:8px 10px}
.pcr-dna{font-family:var(--mono-font,monospace);font-size:13px;line-height:1.85;white-space:pre}
.pcr-dna > div{display:flex;align-items:center}
.pcr-end{color:var(--muted);flex:none}
.pcr-b{padding:0 .5px;border:0;background:none;font:inherit;color:var(--fg);cursor:pointer;border-radius:2px}
.pcr-b:disabled{cursor:default;opacity:.85}
.pcr-tgt{background:color-mix(in srgb,var(--accent) 20%,transparent)}
.pcr-fsel{background:color-mix(in srgb,var(--s1) 42%,transparent);font-weight:700}
.pcr-rsel{background:color-mix(in srgb,var(--s2) 42%,transparent);font-weight:700}
.pcr-ruler{font-family:var(--mono-font,monospace);font-size:13px;color:var(--muted);white-space:pre;line-height:1.3;display:flex;align-items:flex-end}
.pcr-tick{padding:0 .5px;width:1ch;flex:none;text-align:center;position:relative}
.pcr-tick.pcr-num{color:var(--muted)}
.pcr-tick.pcr-num > span{position:absolute;left:50%;bottom:0;transform:translateX(-50%);font-size:10px;line-height:1.3}
.pcr-note{font-size:12.5px;color:var(--muted);line-height:1.7;margin:0}
.pcr-card{border:1px solid var(--line);border-radius:8px;padding:9px 11px;background:var(--bg);display:grid;gap:7px}
.pcr-card h4{margin:0;font-size:13.5px;font-weight:600}
.pcr-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pcr-chk{display:grid;gap:3px;font-size:13px;margin:0;padding:0;list-style:none}
.pcr-chk li{display:flex;gap:7px;align-items:baseline}
.pcr-chk i{font-style:normal;flex:none;width:1.1em;font-weight:700}
.pcr-chk li.ok i{color:var(--good)} .pcr-chk li.no i{color:var(--warn)}
.pcr-chk li.no{color:var(--warn)}
.pcr-chk small{color:var(--muted)}
.pcr-mono{font-family:var(--mono-font,monospace);font-size:12.5px;overflow-wrap:anywhere}
.pcr-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.pcr-tab{max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.pcr-tab table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.pcr-tab th,.pcr-tab td{padding:4px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.pcr-tab th{position:sticky;top:0;background:var(--panel);color:var(--muted);font-weight:500;z-index:1}
.pcr-tab td:first-child,.pcr-tab th:first-child{text-align:left}
.pcr-dead td{color:var(--warn)}
.pcr-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.pcr-leg i{display:inline-block;width:15px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.pcr-big{font-family:var(--mono-font,monospace);font-size:15px}
.pcr-big b{font-size:18px}
.pcr-sec[hidden]{display:none}
.pcr-sec{display:grid;gap:9px;border-top:1px dashed var(--line);padding-top:10px}`;
  function injectCSS() { if (!document.getElementById('st-pcr')) document.head.append(H.el('style', { id: 'st-pcr', text: CSS })); }
  const line = (g, A, xs, ys, color, w = 2, dash = null) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
  };
  const legend = (items) => H.el('div', { class: 'pcr-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  CHALLENGES.pcr = {
    title: '把一段 DNA 变多',
    _m: { tmOf, dimer3, rc, cycleCounts, ctOf, fluor, TMPL },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color;

      /* ===================== 第一关：设计引物 ===================== */
      const stage1 = {
        title: '设计引物',
        task: `<p>1983 年。你想只把下面这段 120 bp 双链 DNA 里<b>高亮的那一段（上链第 41–80 位）</b>变多。
          手里有一台寡核苷酸合成仪：你写下任意 18–24 个字母，它就给你一条相应的单链 DNA。</p>
          <p>聚合酶的规矩只有两条：它必须先有一段<b>已经和模板配对好</b>的短链（引物），才能接着往下合成；
          而且只能沿 5′→3′ 方向加碱基，也就是从引物的 3′ 端往外长。</p>
          <p><b>任务</b>：造两条引物，让聚合酶从两边朝内合成，把目标区段夹在中间。
          在下面的序列上拖选或用滑块各取一段：<b>正向引物</b>取自上链、在目标区左侧；<b>反向引物</b>取自右侧。
          注意第二条的写法——它要结合在哪条链上，你就得写成什么。</p>
          <p>合成仪还会自动报三项参数，都必须合格：熔解温度 $T_m$（Wallace 经验式
          $T_m \\approx 2(n_A+n_T)+4(n_G+n_C)\\ ^\\circ$C，适用于 14–25 nt）要落在 <b>55–65 ℃</b>、
          两条相差 <b>不超过 3 ℃</b>；两条引物的 <b>3′ 端连续互补碱基少于 4 个</b>。</p>`,
        hints: [
          '先想清楚两条引物各自结合在<b>哪一条链</b>上。正向引物要和下链配对，所以它和上链同序；反向引物要和<b>上链</b>配对，所以它不能照抄上链。',
          '把右侧那一段拿出来：反向引物是这一段的<b>反向互补</b>（倒过来写，再逐个取互补碱基）。检查的办法是看它的 3′ 端指向哪里——两条引物的 3′ 端必须<b>相向</b>，指着目标区，这样延伸才会朝内。',
          `参数卡住时：$T_m$ 偏低就把引物加长或往 G·C 多的地方挪；两条差太多就调整长度让它们靠拢。
            一个可行的选法是正向取上链第 2–20 位（19 nt，$T_m$ = 56 ℃），反向引物的结合位点取上链第 82–100 位（19 nt，$T_m$ = 56 ℃），产物 99 bp。`,
        ],
        answer: `两条引物必须<b>相向</b>：正向引物与上链同序（因而与下链配对），反向引物是上链右侧那段的<b>反向互补</b>（因而与上链配对）。
          这样两个 3′ 端都指向目标区，延伸朝内，目标被夹在中间。
          <p>一个合格解：正向 <span class="pcr-mono">5′-AAATATCGCCAAGGCTACC-3′</span>（上链 2–20，19 nt，$T_m$ = 56 ℃）；
          反向 <span class="pcr-mono">5′-CGAACGAGACAATTCTCCA-3′</span>（上链 82–100 的反向互补，19 nt，$T_m$ = 56 ℃）；产物 99 bp。</p>
          <p>三项检查的道理：$T_m$ 决定退火温度窗口——太低则引物在错配位点也能结合，出现非特异产物；太高则结合不上。两条 $T_m$ 必须接近，因为同一次反应只有一个退火温度。
          3′ 端互补之所以致命，是因为聚合酶<b>只从 3′ 端延伸</b>：两条引物 3′ 端配上了就会互相延伸，生成与模板无关的"引物二聚体"，把 dNTP 和酶都消耗掉。</p>`,
        build(body, api) {
          const S = { fs: 21, fl: 20, rs: 81, rl: 20, orient: 'rc', done: false };
          /* fs: 正向引物在上链的起点（1 基）；rs: 反向引物结合位点在上链的起点 */
          const fseq = () => TMPL.slice(S.fs - 1, S.fs - 1 + S.fl);
          const rsite = () => TMPL.slice(S.rs - 1, S.rs - 1 + S.rl);
          const rseq = () => (S.orient === 'rc' ? rc(rsite()) : rsite());

          const dnaBox = h.el('div', { class: 'pcr-dna' });
          const topB = [], botB = [];
          function buildDNA() {
            /* 刻度与碱基逐格对齐：每个位置一个等宽格子，与下面的碱基按钮同宽 */
            const rowN = h.el('div', { class: 'pcr-ruler', 'aria-hidden': 'true' });
            const rowR = h.el('div', { class: 'pcr-ruler', 'aria-hidden': 'true' });
            rowN.append(h.el('span', { class: 'pcr-end', text: '   ' }));
            rowR.append(h.el('span', { class: 'pcr-end', text: '   ' }));
            for (let i = 1; i <= TMPL.length; i++) {
              rowR.append(h.el('span', { class: 'pcr-tick', text: i % 10 === 0 ? '|' : i % 5 === 0 ? '+' : '·' }));
              rowN.append(i % 10 === 0
                ? h.el('span', { class: 'pcr-tick pcr-num' }, [h.el('span', { text: String(i) })])
                : h.el('span', { class: 'pcr-tick', text: ' ' }));
            }
            const rowT = h.el('div'), rowB = h.el('div');
            rowT.append(h.el('span', { class: 'pcr-end', text: "5′ " }));
            rowB.append(h.el('span', { class: 'pcr-end', text: "3′ " }));
            for (let i = 0; i < TMPL.length; i++) {
              const bt = h.el('button', { type: 'button', class: 'pcr-b', text: TMPL[i],
                'aria-label': `上链第 ${i + 1} 位 ${TMPL[i]}，点击设为正向引物 5′ 端`,
                onclick: () => { S.fs = Math.min(i + 1, TMPL.length - S.fl + 1); sFs.set(S.fs); upd(); } });
              const bb = h.el('button', { type: 'button', class: 'pcr-b', text: COMP[TMPL[i]],
                'aria-label': `下链第 ${i + 1} 位 ${COMP[TMPL[i]]}，点击设为反向引物结合位点的起点`,
                onclick: () => { S.rs = Math.min(i + 1, TMPL.length - S.rl + 1); sRs.set(S.rs); upd(); } });
              topB.push(bt); botB.push(bb); rowT.append(bt); rowB.append(bb);
            }
            rowT.append(h.el('span', { class: 'pcr-end', text: " 3′　上链" }));
            rowB.append(h.el('span', { class: 'pcr-end', text: " 5′　下链" }));
            dnaBox.append(rowN, rowR, rowT, rowB);
          }
          function paint() {
            for (let i = 0; i < TMPL.length; i++) {
              const p = i + 1, inT = p >= T0 && p <= T1;
              const inF = p >= S.fs && p < S.fs + S.fl, inR = p >= S.rs && p < S.rs + S.rl;
              topB[i].className = 'pcr-b' + (inT ? ' pcr-tgt' : '') + (inF ? ' pcr-fsel' : '');
              botB[i].className = 'pcr-b' + (inT ? ' pcr-tgt' : '') + (inR ? ' pcr-rsel' : '');
            }
          }

          const ctl = h.el('div', { class: 'lab-controls' });
          const sFs = h.slider({ label: '正向引物 5′ 起点（上链位置）', min: 1, max: T0 - 1, step: 1, value: S.fs,
            format: (v) => `第 ${v} 位`, onInput: (v) => { S.fs = v; upd(); } });
          const sFl = h.slider({ label: '正向引物长度', min: LMIN, max: LMAX, step: 1, value: S.fl,
            format: (v) => `${v} nt`, onInput: (v) => { S.fl = v; sFs.input.max = Math.min(T0 - 1, TMPL.length - v + 1); if (S.fs > +sFs.input.max) { S.fs = +sFs.input.max; sFs.set(S.fs); } upd(); } });
          const sRs = h.slider({ label: '反向引物结合位点起点（上链位置）', min: T1 + 1, max: TMPL.length - LMIN + 1, step: 1, value: S.rs,
            format: (v) => `第 ${v} 位`, onInput: (v) => { S.rs = v; upd(); } });
          const sRl = h.slider({ label: '反向引物长度', min: LMIN, max: LMAX, step: 1, value: S.rl,
            format: (v) => `${v} nt`, onInput: (v) => { S.rl = v; sRs.input.max = TMPL.length - v + 1; if (S.rs > +sRs.input.max) { S.rs = +sRs.input.max; sRs.set(S.rs); } upd(); } });
          const cOr = h.choice({ label: '反向引物怎么写', value: 'rc',
            options: [{ value: 'same', label: '照抄上链这一段' }, { value: 'rc', label: '取它的反向互补' }],
            onChange: (v) => { S.orient = v; upd(); } });
          ctl.append(sFs.el, sFl.el, sRs.el, sRl.el, cOr.el);

          const Ro = { f: h.readout('正向引物（5′→3′）'), r: h.readout('反向引物（5′→3′）'), tm: h.readout('Tm（Wallace）'), prod: h.readout('预期产物') };
          const roBox = h.el('div', { class: 'lab-readout' });
          Object.values(Ro).forEach((x) => roBox.append(x.el));

          const chk = h.el('ul', { class: 'pcr-chk' });
          const bGo = h.button({ label: '送去合成并检查', kind: 'primary', onClick: check });
          const fb = h.el('div', { class: 'pcr-note', 'aria-live': 'polite' });

          function params() {
            const F = fseq(), Rp = rseq();
            return { F, Rp, ftm: tmOf(F), rtm: tmOf(Rp), dim: dimer3(F, Rp), ok3: S.orient === 'rc' };
          }
          function upd() {
            paint();
            const p = params();
            Ro.f.set(`${p.F}　${S.fl} nt`);
            Ro.r.set(`${p.Rp}　${S.rl} nt`);
            Ro.tm.set(`正向 ${p.ftm} ℃　反向 ${p.rtm} ℃　差 ${Math.abs(p.ftm - p.rtm)} ℃`);
            Ro.prod.set(p.ok3 ? `${S.rs + S.rl - S.fs} bp（第 ${S.fs}–${S.rs + S.rl - 1} 位）` : '两条引物不相向，无产物');
            renderChk(p, false);
          }
          function renderChk(p, strict) {
            const items = [
              ['方向', p.ok3, p.ok3
                ? '两个 3′ 端相向，延伸朝内'
                : '反向引物与上链<b>同序</b>——它只会去结合下链，3′ 端朝外。目标不会被夹住。'],
              ['覆盖目标', S.fs + S.fl - 1 < T0 && S.rs > T1, '引物不能压进目标区（这里要求完整扩增 41–80）'],
              [`正向 Tm ${p.ftm} ℃`, p.ftm >= TMLO && p.ftm <= TMHI, `需落在 ${TMLO}–${TMHI} ℃`],
              [`反向 Tm ${p.rtm} ℃`, p.rtm >= TMLO && p.rtm <= TMHI, `需落在 ${TMLO}–${TMHI} ℃`],
              [`两条 Tm 差 ${Math.abs(p.ftm - p.rtm)} ℃`, Math.abs(p.ftm - p.rtm) <= DTM, `需 ≤ ${DTM} ℃（同一个退火温度要同时适合两条）`],
              [`3′ 端连续互补 ${p.dim} 个碱基`, p.dim < DIMER, p.dim >= DIMER ? '两条引物会互相延伸，生成引物二聚体，吃掉 dNTP 和酶' : `需 < ${DIMER} 个`],
            ];
            chk.textContent = '';
            items.forEach(([lab, ok, why]) => chk.append(h.el('li', { class: ok ? 'ok' : 'no' }, [
              h.el('i', { text: ok ? '✓' : '✕' }),
              h.el('span', {}, [h.el('span', { html: lab }), ok ? null : h.el('small', { html: '　' + why })]),
            ])));
            return items.every(([, ok]) => ok);
          }
          function check() {
            const p = params(), ok = renderChk(p, true);
            if (!ok) {
              const bad = [];
              if (!p.ok3) bad.push('方向错了');
              if (p.ftm < TMLO || p.ftm > TMHI || p.rtm < TMLO || p.rtm > TMHI) bad.push('Tm 超出窗口');
              if (Math.abs(p.ftm - p.rtm) > DTM) bad.push('两条 Tm 相差太多');
              if (p.dim >= DIMER) bad.push('会形成引物二聚体');
              api.say(`这一对不能用：${bad.join('；')}。看下面逐条的说明。`, 'bad');
              return;
            }
            S.done = true;
            api.done(`<b>一对朝内的引物就是一个地址。</b>正向引物与上链同序、反向引物是另一端的反向互补，
              两个 3′ 端相向，聚合酶从两边朝内合成，于是<b>只有被它们夹住的那一段</b>会被复制。
              你选的产物 ${S.rs + S.rl - S.fs} bp。1983 年穆利斯想到的正是这一步；
              在此之前，人们用引物做的是测序和延伸，没有人让<b>两条</b>引物相向、把产物再当模板。`);
          }

          buildDNA();
          body.append(
            h.el('p', { class: 'pcr-note', html: '模板为虚构序列（随机生成，不取自任何真实生物）。金色底 = 目标区（上链 41–80）。点击碱基可直接设引物起点；下链一行点击设的是反向引物的<b>结合位点</b>。' }),
            h.el('div', { class: 'pcr-scroll' }, [dnaBox]),
            ctl, roBox,
            h.el('div', { class: 'pcr-card' }, [h.el('h4', { text: '合成仪的检查单' }), chk, h.el('div', { class: 'pcr-row' }, [bGo])]),
            fb);
          api.typeset(body);
          upd();
          return { destroy() {} };
        },
      };

      /* ===================== 第二关：循环 ===================== */
      const stage2 = {
        title: '循环',
        task: `<p>引物有了，现在要让它转起来。一个循环三步：<b>变性</b>（高温把双链拆开）、
          <b>退火</b>（降温让引物找到自己的位置）、<b>延伸</b>（聚合酶从引物 3′ 端合成）。</p>
          <p>你现在用的酶是大肠杆菌 DNA 聚合酶 I 的 <b>Klenow 片段</b>：37 ℃ 工作，而且<b>在 90 ℃ 以上会变性失活</b>。
          下面的仪器可以设三步的温度与时间、设循环数，然后跑。表格逐循环记下三类分子：
          原始长链、<b>长产物</b>（一端是引物、另一端一直延伸到模板尽头）、
          <b>短产物</b>（两端都由引物定义，长度恰好等于你要的那一段）。</p>
          <p><b>任务</b>：先想办法让它真的跑起来（酶被烤死了可以补加），弄清楚两类产物各自怎样增长；
          再换上 1988 年引入的那种酶，看操作如何简化。最后回答下面两道题。</p>
          <p class="pcr-note">计数约定：以单链计，一条初始双链记作 2 条链；理想情形下每个循环中每一条链恰好被复制一次。</p>`,
        hints: [
          '先看变性那一步：Klenow 在 94 ℃ 会失活，可它必须在 94 ℃ 之后才有链可以退火。每个循环都得补酶——这正是 1983–1987 年真实的做法，手工在三个水浴之间搬管子。',
          '看表：长产物每个循环只<b>加 2</b>（只有那 2 条原始长链能生成它），而短产物每轮<b>翻倍再加上长产物</b>。写成递推：$L_{n+1}=L_n+2$，$S_{n+1}=2S_n+L_n$。',
          '由递推得 $L_n = 2n$、总链数 $2^{n+1}$。以"初始双链 = 1 个分子"计（即链数除以 2），$n = 30$ 时总量 $2^{30}$，其中非目标长度的只有 $n+1 = 31$ 个。文献常写成 $2^n - 2n$，$n=30$ 即 $1\\,073\\,741\\,764$。',
        ],
        answer: `<b>数目。</b>设第 $n$ 轮后长产物 $L_n$、短产物 $S_n$（按单链计，初始双链 = 2 条链）。
          原始长链只能生成长产物，所以 $L_{n+1}=L_n+2$；长产物与短产物作模板时，合成都停在另一条引物处，生成短产物，所以 $S_{n+1}=2S_n+L_n$。
          由 $L_0=S_0=0$ 解得 $L_n = 2n$，$S_n = 2^{n+1}-2n-2$，总链数 $2^{n+1}$。
          换成以初始双链为 1 个分子的单位（除以 2）：总量 $2^n$，目标长度的 $2^n-n-1$。
          $n = 30$：总量 $1\\,073\\,741\\,824$，文献常用的写法 $2^{30}-2\\cdot30 = \\mathbf{1\\,073\\,741\\,764}$（两种记法相差 29 个分子，相对差 $2.7\\times10^{-8}$）。
          <p><b>比例。</b>非目标长度的分子只随 $n$ <b>线性</b>增加，所以短产物占比
          $1-\\frac{2n+2}{2^{n+1}}$，$n=30$ 时 $=1-2.9\\times10^{-8}$，即 99.999997%。这就是 30 个循环后电泳上只看到一条带的原因。</p>
          <p><b>Taq。</b>1969 年 Brock 与 Freeze 从黄石公园热泉分离出嗜热菌 <i>Thermus aquaticus</i>；它的聚合酶在 75 ℃ 左右活性最高、95 ℃ 下仍能存活。
          1988 年 Saiki 等把它用进 PCR：酶不再需要每轮补加，三个温度可以交给一台会升降温的金属块——热循环仪，以及自动化。</p>`,
        build(body, api) {
          /* 开局即为 1983 年的真实配置：Klenow、37 ℃ 延伸、94 ℃ 变性——每轮都会把酶烤死 */
          const S = { tD: 94, tA: 58, tE: 37, sD: 30, sA: 30, sE: 60, n: 30, enz: 'klenow', adds: 0 };
          const stg = h.el('div', { class: 'lab-stage' });
          const cv = h.canvas(stg, { aspect: 0.5, minH: 190, maxH: 270 });
          stg.append(legend([['短产物（目标长度）', col('--s1')], ['长产物', col('--s2')], ['总量', col('--muted'), 1]]));

          const ctl = h.el('div', { class: 'lab-controls' });
          const sD = h.slider({ label: '变性温度', min: 80, max: 99, step: 1, value: S.tD, format: (v) => v + ' ℃', onInput: (v) => { S.tD = v; run(); } });
          const sA = h.slider({ label: '退火温度', min: 40, max: 72, step: 1, value: S.tA, format: (v) => v + ' ℃', onInput: (v) => { S.tA = v; run(); } });
          const sE = h.slider({ label: '延伸温度', min: 30, max: 80, step: 1, value: S.tE, format: (v) => v + ' ℃', onInput: (v) => { S.tE = v; run(); } });
          const sN = h.slider({ label: '循环数 n', min: 1, max: 40, step: 1, value: S.n, format: (v) => String(v), onInput: (v) => { S.n = v; S.adds = Math.min(S.adds, v); run(); } });
          const sTd = h.slider({ label: '变性时间', min: 10, max: 120, step: 5, value: S.sD, format: (v) => v + ' s', onInput: (v) => { S.sD = v; run(); } });
          const sTe = h.slider({ label: '延伸时间', min: 15, max: 180, step: 5, value: S.sE, format: (v) => v + ' s', onInput: (v) => { S.sE = v; run(); } });
          const cEnz = h.choice({ label: '聚合酶', value: 'klenow',
            options: [{ value: 'klenow', label: 'Klenow 片段（37 ℃）' }, { value: 'taq', label: 'Taq（来自嗜热菌）' }],
            onChange: (v) => { S.enz = v; S.tE = v === 'taq' ? 72 : 37; sE.set(S.tE); run(); } });
          const bAdd = h.button({ label: '每轮都补一次酶（手工）', onClick: () => { S.adds = S.n; run(); } });
          const bRun = h.button({ label: '跑', kind: 'primary', onClick: run });
          ctl.append(sN.el, sD.el, sA.el, sE.el, sTd.el, sTe.el, cEnz.el);

          const Ro = { st: h.readout('这一轮发生了什么'), tot: h.readout('总量（分子，初始双链 = 1）'), sh: h.readout('目标长度的分子'), lg: h.readout('长产物'), op: h.readout('人工操作') };
          const roBox = h.el('div', { class: 'lab-readout' });
          Object.values(Ro).forEach((x) => roBox.append(x.el));
          const tabBox = h.el('div', { class: 'pcr-tab' });

          /* 酶能否工作：Klenow 在 ≥ 90 ℃ 失活；退火温度要在合理窗口；延伸温度要适合该酶 */
          function simulate() {
            const taq = S.enz === 'taq';
            const denat = S.tD >= 90 && S.sD >= 15;                 // 能否把双链拆开
            const killed = !taq && S.tD >= 90;                      // Klenow 每轮在变性步被烤死
            const extOK = taq ? (S.tE >= 65 && S.tE <= 80) : (S.tE >= 30 && S.tE <= 45);
            const annealOK = S.tA >= 50 && S.tA <= 65;
            return { taq, denat, killed, extOK, annealOK };
          }
          function run() {
            const q = simulate();
            const rows = cycleCounts(S.n);
            let eff = 1, msg = '';
            if (!q.denat) { eff = 0; msg = `变性温度 ${S.tD} ℃ 不足以把双链拆开（需 ≥ 90 ℃ 并保持十几秒以上），引物无处可去。`; }
            else if (!q.annealOK) { eff = 0; msg = S.tA > 65 ? `退火温度 ${S.tA} ℃ 高过引物的 Tm，引物结合不上。` : `退火温度 ${S.tA} ℃ 太低，引物会在错配位点结合，产物杂乱。`; }
            else if (!q.extOK) { eff = 0; msg = q.taq ? `Taq 在 ${S.tE} ℃ 下活性很低，它的最适温度在 75 ℃ 附近。` : `Klenow 的工作温度是 37 ℃ 左右，${S.tE} ℃ 不行。`; }
            else if (q.killed && S.adds < S.n) { eff = 0; msg = `Klenow 片段在 ${S.tD} ℃ 下变性失活，这一轮之后管子里就没有酶了。它每个循环都得重新加——你补了 ${S.adds} 次，需要 ${S.n} 次。`; }
            else msg = q.taq ? 'Taq 在 95 ℃ 下存活，且最适温度 ~75 ℃（延伸温度已自动设为 72 ℃）：酶不必补加，三个温度可以交给一台会升降温的金属块自动循环。' : `跑通了，代价是每一轮都要在 94 ℃ 之后开盖重新补酶（共 ${S.adds} 次），手工在三个水浴之间搬管子——这正是 1983–1987 年的做法。`;

            const shown = eff ? rows : [];
            Ro.st.set(msg.length > 60 ? msg.slice(0, 58) + '…' : msg);
            api.say(msg, eff ? 'info' : 'bad');
            if (eff) {
              const last = rows[rows.length - 1];
              Ro.tot.set(`${sci(last.tot / 2)}　(2^${S.n} = ${grp(Math.pow(2, S.n))})`);
              Ro.sh.set(`${sci(last.S / 2)}　占 ${(100 * last.S / last.tot).toFixed(6)}%`);
              Ro.lg.set(`${last.L / 2 + 1} 个（原始 1 + 长产物 ${last.L / 2}）`);
            } else { Ro.tot.set('—'); Ro.sh.set('—'); Ro.lg.set('—'); }
            Ro.op.set(q.taq ? '0 次开盖（全自动）' : `${S.adds} / ${S.n} 次补酶`);
            bAdd.disabled = q.taq;

            const body2 = shown.slice(-14).map((r) => `<tr><td>${r.n}</td><td>${grp(r.tot / 2)}</td><td>${grp(r.S / 2)}</td><td>${r.L / 2 + 1}</td><td>${(100 * r.S / r.tot).toFixed(r.n > 12 ? 5 : 2)}%</td></tr>`).join('');
            tabBox.innerHTML = `<table><thead><tr><th>循环</th><th>总量</th><th>目标长度</th><th>非目标长度</th><th>目标占比</th></tr></thead><tbody>${
              eff ? body2 : '<tr class="pcr-dead"><td colspan="5">这一轮没有产物</td></tr>'}</tbody></table>`;
            draw(eff ? rows : []);
          }
          function draw(rows) {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: Math.max(10, S.n), y0: 1, y1: 1e10, logY: true,
              pad: { l: 52, r: 12, t: 12, b: 34 },
              xTicks: Array.from({ length: 5 }, (_, i) => Math.round((i * Math.max(10, S.n)) / 4)),
              yTicks: [1, 1e2, 1e4, 1e6, 1e8, 1e10], fmtY: (v) => (v === 1 ? '1' : '10' + sup(Math.round(Math.log10(v)))),
              xLabel: '循环数 n', yLabel: '分子数（对数）' }, col);
            if (!rows.length) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center';
              g.fillText('这一组参数跑不出产物', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const xs = rows.map((r) => r.n);
            line(g, A, xs, rows.map((r) => Math.max(1, r.tot / 2)), col('--muted'), 1.6, [5, 4]);
            line(g, A, xs, rows.map((r) => Math.max(0.6, r.S / 2)), col('--s1'), 2.2);
            line(g, A, xs, rows.map((r) => r.L / 2 + 1), col('--s2'), 2.2);
            g.restore();
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
            g.fillText('长产物只随 n 线性增加', A.p.l + A.iw - 4, A.p.t + 4);
          }

          /* --- 两道题 --- */
          let okN = false, okFrac = false;
          const finish = () => { if (okN && okFrac) api.done(`<b>产物即模板。</b>每一轮合成出的链又成为下一轮的模板，于是被两条引物夹住的那一段按 $2^n$ 增长，
            而非目标长度的分子只随 $n$ 线性增加——30 轮后目标占到 99.999997%。
            1988 年换上 <i>Thermus aquaticus</i> 的耐热聚合酶（Taq，Brock &amp; Freeze 1969 年从黄石公园热泉分离）之后，酶不必每轮补加，
            整个过程就只剩"反复升降温"，可以交给一台热循环仪。PCR 由此从一门手艺变成一台机器上的例行操作。`); };
          const ansN = H.answer({
            label: '从<b>一条</b>双链模板出发，30 个理想循环后目标长度的分子有多少个？（容差 ±2%，科学计数法可写成 1.07e9）',
            placeholder: '例如 1.07e9',
            check: (v) => {
              const truth = Math.pow(2, 30) - 60;
              if (v === Math.pow(2, 30)) return { ok: false, msg: `$2^{30} = ${grp(2 ** 30)}$ 是管子里的<b>总量</b>。要减掉非目标长度的那 $2n$（或精确地说 $n+1$）个。` };
              if (Math.abs(v - truth) / truth <= 0.02) return { ok: true, msg: `对：$2^{30}-2\\cdot30 = ${grp(truth)} \\approx 1.07\\times10^9$。（精确递推给 $2^{30}-31$，两者相差 29 个分子，相对差 $2.7\\times10^{-8}$——在这个量级上两种记法等价。）` };
              if (Math.abs(v - 30) < 0.5 || Math.abs(v - 60) < 0.5) return { ok: false, msg: '这是长产物的个数，不是短产物。' };
              if (v > 1e15) return { ok: false, msg: '量级太大。每轮翻一倍，30 轮是 $2^{30}\\approx10^9$，不是 $10^{30}$。' };
              if (v < 1e6) return { ok: false, msg: '量级太小。看表格最后一行。' };
              return { ok: false, msg: '不对。总量 $2^n$，再减去非目标长度的分子数。' };
            },
            onOk: () => { okN = true; qBox.hidden = false; api.typeset(qBox); finish(); },
          });
          const qBox = h.el('div', { hidden: true });
          qBox.append(H.quiz({
            question: '那么这 $2^{30}$ 个分子里，<b>目标长度</b>的占多大比例？为什么电泳上只看到一条带？',
            options: [
              { label: '约 50%：长短产物各一半', ok: false, why: '不对。长产物每轮只增加固定的 2 条链，30 轮后一共才 60 条；短产物却在翻倍。' },
              { label: '超过 99.9999%：非目标长度的分子只随 n 线性增加，被指数增长淹没', ok: true,
                why: '对。$1-\\frac{2n+2}{2^{n+1}}$，$n=30$ 时 $=1-2.9\\times10^{-8}$。指数压线性，所以 30 轮后管子里几乎只剩两条引物之间的那一段——基因组其余部分相对被压低了约 $2^n/n$ 倍。' },
              { label: '约 97%：剩下 3% 是基因组其他片段', ok: false, why: '基因组其他片段根本没有引物结合，连线性复制都谈不上；非目标长度的只有那些"一端到头"的长产物。' },
              { label: '无法确定，取决于退火温度', ok: false, why: '退火温度影响特异性（会不会在错配位点结合），但在理想情形下长短产物的比例由递推式唯一确定。' },
            ],
            onOk: () => { okFrac = true; finish(); },
          }).el);

          body.append(stg, ctl, h.el('div', { class: 'pcr-row' }, [bRun, bAdd]), roBox, tabBox,
            h.el('div', { class: 'pcr-sec' }, [ansN.el, qBox]));
          api.typeset(body);
          run();
          cv.onResize(() => run());
          const off = watchTheme(() => run());
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ===================== 第三关：定量 ===================== */
      const stage3 = {
        title: '定量：从 Ct 回推',
        task: `<p>1992 年，Higuchi 等人往反应里加了一种只在双链 DNA 存在时才发荧光的染料，用摄像机<b>逐循环</b>记录亮度。
          于是每一管都不再只给一个终点亮度，而是一整条曲线。</p>
          <p>问题是：终点亮度没有用。dNTP 耗尽后反应进入平台期，终点高度由试剂量决定，<b>与起始拷贝数无关</b>——
          下面六条标准曲线最后都爬到同一个高度。信息全在曲线<b>什么时候起飞</b>。</p>
          <p><b>任务</b>：（a）拖动阈值线，读出六个已知浓度（$10^2$ 到 $10^7$ 拷贝）各自越过阈值的循环数 $C_t$；
          （b）把 $C_t$ 对 $\\log_{10}N_0$ 作图，量出斜率，并由它算出扩增效率 $E$；
          （c）用这条直线，定出那个未知样品（黑色曲线）里有多少拷贝。</p>
          <p class="pcr-note">数据含模拟噪声。$C_t$ 由线性内插给出，不必取整。</p>`,
        hints: [
          '先试着把阈值上下拖一拖：六个 $C_t$ 全体平移，但它们<b>彼此的间距不变</b>。所以斜率与阈值无关——这正是这个方法能用的原因。',
          '在指数段 $N_n = N_0(1+E)^n$。令 $N_{C_t}$ 等于阈值对应的那个固定分子数 $N_t$，两边取 $\\log_{10}$，就得到 $C_t$ 关于 $\\log_{10}N_0$ 的一次函数。斜率里只剩 $E$。',
          '$C_t = -\\frac{1}{\\log_{10}(1+E)}\\log_{10}N_0 + \\text{常数}$。所以 $E = 10^{-1/s}-1$。理想的 $E=1$ 给 $s=-3.32$（"10 倍浓度差 3.32 个循环"）；这里的数据给 $s\\approx-3.53$。未知样的 $N_0$ 由 $\\log_{10}N_0=(b-C_t)/(-s)$ 反解。',
        ],
        answer: `<b>(a)(b)</b> 在指数段 $N_n=N_0(1+E)^n$，阈值对应一个固定的分子数 $N_t$，故 $N_0(1+E)^{C_t}=N_t$，取对数：
          $$C_t=-\\frac{1}{\\log_{10}(1+E)}\\log_{10}N_0+\\frac{\\log_{10}N_t}{\\log_{10}(1+E)} .$$
          改变阈值只改变截距，不改变斜率。本题数据的斜率 $s\\approx-3.53$，于是 $E=10^{-1/s}-1=10^{0.283}-1\\approx0.92$，即每轮扩增 1.92 倍。
          （$E=1$ 对应 $s=-1/\\log_{10}2=-3.322$；实验上 $s\\in[-3.6,-3.1]$ 算可接受。）
          <p><b>(c)</b> 未知样的 $C_t\\approx22.6$，由 $\\log_{10}N_0=(b-C_t)/(-s)$ 得 $N_0\\approx4.3\\times10^4$ 拷贝。</p>
          <p>这正是 2020 年起新冠核酸检测报告上那个 $C_t$ 值的含义：病毒是 RNA，先逆转录成 cDNA 再做 qPCR，称 <b>RT-qPCR</b>。
          $C_t$ 小说明进入反应管的目标分子多。但它受采样部位与质量、提取效率、引物与仪器设定影响，不同实验室之间不可直接比较。</p>`,
        build(body, api) {
          const S = { Ft: 0.10, sel: -1 };
          const NC = 40;
          /* 带噪声的荧光曲线（固定种子） */
          const curves = STD.map((N0, i) => {
            const rnd = mul32(1992 + 7 * i);
            const y = []; for (let n = 0; n <= NC; n++) y.push(Math.max(0, fluor(N0, n, EFF) + 0.004 * (rnd() * 2 - 1) + 0.006 * rnd()));
            return { N0, y, lab: '10' + sup(Math.round(Math.log10(N0))) };
          });
          const unk = (() => { const rnd = mul32(777); const y = []; for (let n = 0; n <= NC; n++) y.push(Math.max(0, fluor(UNKNOWN, n, EFF) + 0.004 * (rnd() * 2 - 1) + 0.006 * rnd())); return { N0: UNKNOWN, y, lab: '未知' }; })();
          const ctFrom = (y, Ft) => { for (let n = 1; n <= NC; n++) if (y[n] >= Ft && y[n - 1] < Ft) return n - 1 + (Ft - y[n - 1]) / (y[n] - y[n - 1]); return NaN; };

          const stg = h.el('div', { class: 'lab-stage' });
          const cvF = h.canvas(stg, { aspect: 0.52, minH: 195, maxH: 275 });
          stg.append(legend([['10² … 10⁷ 标准品', col('--s1')], ['未知样品', col('--fg')], ['阈值', col('--accent'), 1]]));
          const cvS = h.canvas(stg, { aspect: 0.5, minH: 185, maxH: 255 });

          const ctl = h.el('div', { class: 'lab-controls' });
          const sFt = h.slider({ label: '荧光阈值', min: 0.02, max: 0.5, step: 0.005, value: S.Ft, format: (v) => v.toFixed(3), onInput: (v) => { S.Ft = v; upd(); } });
          const cSel = h.choice({ label: '高亮哪一条', value: -1,
            options: [{ value: -1, label: '全部' }, ...STD.map((n, i) => ({ value: i, label: '10' + sup(Math.round(Math.log10(n))) })), { value: 9, label: '未知' }],
            onChange: (v) => { S.sel = +v; upd(); } });
          ctl.append(sFt.el, cSel.el);

          const Ro = { ct: h.readout('各标准品的 Ct'), fit: h.readout('最小二乘拟合'), e: h.readout('由斜率算出的效率'), u: h.readout('未知样品的 Ct') };
          const roBox = h.el('div', { class: 'lab-readout' });
          Object.values(Ro).forEach((x) => roBox.append(x.el));

          let fit = { s: 0, b: 0 };
          function recompute() {
            const cts = curves.map((c) => ctFrom(c.y, S.Ft));
            const xs = curves.map((c) => Math.log10(c.N0));
            const ok = cts.every(isFinite);
            if (ok) {
              const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = cts.reduce((a, b) => a + b) / n;
              let sxy = 0, sxx = 0;
              for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (cts[i] - my); sxx += (xs[i] - mx) ** 2; }
              fit = { s: sxy / sxx, b: my - (sxy / sxx) * mx };
            }
            return { cts, xs, ok, uct: ctFrom(unk.y, S.Ft) };
          }
          function upd() {
            const r = recompute();
            Ro.ct.set(r.ok ? r.cts.map((c) => c.toFixed(1)).join(' · ') : '阈值在噪声里或高过平台，读不出');
            Ro.fit.set(r.ok ? `Ct = ${fit.s.toFixed(3)}·log₁₀N₀ + ${fit.b.toFixed(2)}` : '—');
            Ro.e.set(r.ok ? `E = 10^(−1/s) − 1 = ${(Math.pow(10, -1 / fit.s) - 1).toFixed(3)}` : '—');
            Ro.u.set(isFinite(r.uct) ? r.uct.toFixed(2) : '—');
            drawF(r); drawS(r);
          }
          function drawF(r) {
            const g = cvF.g, W = cvF.w, Hh = cvF.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: NC, y0: 0, y1: 1.02, pad: { l: 46, r: 12, t: 12, b: 32 },
              xTicks: [0, 10, 20, 30, 40], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => v.toFixed(2),
              xLabel: '循环数 n', yLabel: '荧光（归一）' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const xs = Array.from({ length: NC + 1 }, (_, i) => i);
            curves.forEach((c, i) => {
              const hl = S.sel === -1 || S.sel === i;
              g.globalAlpha = hl ? 1 : 0.25;
              line(g, A, xs, c.y, col('--s1'), hl ? 2 : 1.2);
              g.globalAlpha = 1;
            });
            g.globalAlpha = S.sel === -1 || S.sel === 9 ? 1 : 0.25;
            line(g, A, xs, unk.y, col('--fg'), 2.4);
            g.globalAlpha = 1;
            g.strokeStyle = col('--accent'); g.lineWidth = 1.6; g.setLineDash([6, 4]);
            g.beginPath(); g.moveTo(A.p.l, A.Y(S.Ft)); g.lineTo(A.p.l + A.iw, A.Y(S.Ft)); g.stroke(); g.setLineDash([]);
            if (r.ok) r.cts.forEach((c) => { const x = A.X(c); g.strokeStyle = col('--s1'); g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, A.Y(S.Ft)); g.lineTo(x, A.p.t + A.ih); g.stroke(); g.setLineDash([]); });
            g.restore();
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'bottom';
            g.fillText('阈值 ' + S.Ft.toFixed(3), A.p.l + 4, A.Y(S.Ft) - 3);
            g.textAlign = 'right'; g.textBaseline = 'top';
            g.fillText('平台高度与 N₀ 无关 →', A.p.l + A.iw - 4, A.p.t + 4);
            curves.forEach((c, i) => { const y = A.Y(c.y[NC]); g.fillStyle = col('--muted'); g.textAlign = 'left'; g.textBaseline = 'middle'; if (i % 2 === 0) g.fillText(c.lab, A.p.l + 6, A.p.t + 16 + i * 6); });
          }
          function drawS(r) {
            const g = cvS.g, W = cvS.w, Hh = cvS.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 1.6, x1: 7.4, y0: 8, y1: 36, pad: { l: 46, r: 12, t: 12, b: 34 },
              xTicks: [2, 3, 4, 5, 6, 7], yTicks: [10, 15, 20, 25, 30, 35],
              xLabel: 'log₁₀ N₀（起始拷贝数）', yLabel: 'Ct' }, col);
            if (!r.ok) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center';
              g.fillText('先把阈值放到能读出 Ct 的位置', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.strokeStyle = col('--s1'); g.lineWidth = 1.8;
            g.beginPath(); g.moveTo(A.X(1.6), A.Y(fit.s * 1.6 + fit.b)); g.lineTo(A.X(7.4), A.Y(fit.s * 7.4 + fit.b)); g.stroke();
            g.fillStyle = col('--s1');
            r.xs.forEach((x, i) => { g.beginPath(); g.arc(A.X(x), A.Y(r.cts[i]), 4, 0, 7); g.fill(); });
            if (isFinite(r.uct)) {
              const xu = (fit.b - r.uct) / -fit.s;
              g.strokeStyle = col('--fg'); g.lineWidth = 1.4; g.setLineDash([4, 3]);
              g.beginPath(); g.moveTo(A.p.l, A.Y(r.uct)); g.lineTo(A.X(xu), A.Y(r.uct)); g.lineTo(A.X(xu), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
              g.fillStyle = col('--fg'); g.beginPath(); g.arc(A.X(xu), A.Y(r.uct), 4.5, 0, 7); g.fill();
            }
            g.restore();
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
            g.fillText(`斜率 ${fit.s.toFixed(3)}`, A.p.l + A.iw - 4, A.p.t + 4);
          }

          let okS = false, okU = false;
          const finish = () => { if (okS && okU) api.done(`<b>Ct 与起始拷贝数的对数成线性。</b>在指数段 $N_n=N_0(1+E)^n$，
            取固定阈值即固定 $N_t$，于是 $C_t=-\\frac{1}{\\log_{10}(1+E)}\\log_{10}N_0+$ 常数：阈值只平移截距，斜率只含效率。
            Higuchi 等（1992–1993）把染料和摄像机加进反应，PCR 从"有没有"变成"有多少"。
            把 RNA 先逆转录成 cDNA 再做这件事，就是 <b>RT-qPCR</b>——2020 年起新冠核酸检测报告上的那个 $C_t$ 值，正是这条直线上的读数。`); };
          const ansS = H.answer({
            label: '把 $C_t$ 对 $\\log_{10}N_0$ 作图，斜率是多少？（容差 ±0.15；也可直接填效率 E，容差 ±0.06）',
            placeholder: '例如 −3.53',
            check: (v) => {
              const s = fit.s, e = Math.pow(10, -1 / s) - 1;
              if (Math.abs(v - s) <= 0.15) return { ok: true, msg: `对：斜率 ${s.toFixed(3)}，于是 $E = 10^{-1/s}-1 = ${e.toFixed(2)}$，每轮扩增 ${(1 + e).toFixed(2)} 倍。理想的 $E=1$ 对应 $-3.322$。` };
              if (Math.abs(v - e) <= 0.06) return { ok: true, msg: `对：效率 $E \\approx ${e.toFixed(2)}$（斜率 ${s.toFixed(2)}）。理想的 $E=1$ 对应斜率 $-3.322$。` };
              if (Math.abs(v + s) <= 0.15) return { ok: false, msg: '符号反了：浓度越高 $C_t$ 越<b>小</b>，所以斜率为负。' };
              if (Math.abs(v - 3.322) <= 0.1 || Math.abs(v + 3.322) <= 0.1) return { ok: false, msg: '$-3.322$ 是<b>理想</b>效率 $E=1$ 的斜率。这组数据的效率略低一些，自己从两点量。' };
              if (Math.abs(v - 10) < 2) return { ok: false, msg: '每 10 倍浓度差的不是 10 个循环。从图上取相距最远的两点算 $\\Delta C_t/\\Delta\\log_{10}N_0$。' };
              return { ok: false, msg: '不对。取 $10^2$ 和 $10^7$ 两点：$(C_t^{(7)}-C_t^{(2)})/(7-2)$。' };
            },
            onOk: () => { okS = true; uBox.hidden = false; api.typeset(uBox); finish(); },
          });
          const uBox = h.el('div', { hidden: true });
          const ansU = H.answer({
            label: '用这条直线，未知样品里有多少拷贝？（容差 ±25%）', unit: '拷贝', placeholder: '例如 4.3e4',
            check: (v) => {
              if (v > 0 && Math.abs(Math.log10(v / UNKNOWN)) <= Math.log10(1.25)) return { ok: true, msg: `对：$C_t \\approx ${ctFrom(unk.y, S.Ft).toFixed(1)}$，代入 $\\log_{10}N_0=(b-C_t)/(-s)$ 得 $\\approx ${sci(UNKNOWN)}$ 拷贝。` };
              if (v > 0 && Math.abs(Math.log10(v / UNKNOWN)) <= 1.1) return { ok: false, msg: '量级对了但还不够准。用拟合出的斜率和截距算，别只看最近的那条标准品。' };
              if (v > 0 && v < 100) return { ok: false, msg: '太小。未知样的曲线明显早于 $10^3$ 那条起飞。' };
              return { ok: false, msg: '不对。$\\log_{10}N_0=(b-C_t)/(-s)$，$b$ 与 $s$ 在读数栏里。' };
            },
            onOk: () => { okU = true; finish(); },
          });
          uBox.append(ansU.el);

          body.append(stg, ctl, roBox, h.el('div', { class: 'pcr-sec' }, [ansS.el, uBox]));
          api.typeset(body);
          upd();
          cvF.onResize(upd); cvS.onResize(upd);
          const off = watchTheme(upd);
          return { destroy() { off(); cvF.destroy(); cvS.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
