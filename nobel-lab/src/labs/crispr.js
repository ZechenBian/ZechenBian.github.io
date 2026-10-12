/* CRISPR-Cas9 靶向切割 — Nobel Chemistry 2020 (Charpentier & Doudna, a method for genome editing)
 * SpCas9 rules used here (Jinek et al. 2012, Science 337:816):
 *   - PAM = 5′-NGG-3′ on the non-target (top) strand, immediately 3′ of the 20-nt protospacer.
 *   - sgRNA = 20-nt spacer (crRNA part, same sequence as protospacer with U for T) + scaffold (tracrRNA part).
 *   - HNH + RuvC make a blunt DSB 3 bp upstream of the PAM: between protospacer positions 17 and 18.
 *   - R-loop forms from the PAM-proximal end; mismatches in the ~10–12-nt seed block it, distal ones are tolerated.
 * Toy cleavage model: P = 0.95 · Π f(i), f = 0.08 (seed, i = 9–20), 0.55 (i = 4–8), 0.8 (i = 1–3); no PAM → 0.
 * Target: a made-up 78-bp GFP-like ORF (Kozak GCCACC + ATG…), codons chosen so every ±1/±2 frameshift hits a stop.
 */
(() => {
  const SEQ = 'GCCACCATGGTTTCCAAAGGGGAGGAGCTTTTCACCGGGGTAGTCCCAATCCTTGTAGAGTTAGACGGTGATGTAAAC';
  const ORF = 6, TAG = 'GGATCC'; // ORF starts at 0-based 6; HDR tag = BamHI site (Gly-Ser)
  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const CODE = {}; { const b = 'TCAG', aa = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG'; let k = 0;
    for (const x of b) for (const y of b) for (const z of b) CODE[x + y + z] = aa[k++]; }
  // p = 1-based coordinate of the PAM's N; protospacer = 1-based p−20 … p−1
  const isPAM = (s, p) => p >= 21 && s[p] === 'G' && s[p + 1] === 'G';
  const pams = (s) => { const r = []; for (let p = 21; p + 2 <= s.length; p++) if (isPAM(s, p)) r.push(p); return r; };
  const proto = (s, p) => s.slice(p - 21, p - 1);
  const guideOf = (s, p) => proto(s, p).replace(/T/g, 'U').split('');
  const mism = (g, s, p) => { const t = proto(s, p); const r = []; for (let i = 1; i <= 20; i++) if (g[i - 1] !== t[i - 1].replace('T', 'U')) r.push(i); return r; };
  const fac = (i) => (i >= 9 ? 0.08 : i >= 4 ? 0.55 : 0.8);
  const prob = (g, s, p) => (isPAM(s, p) ? mism(g, s, p).reduce((P, i) => P * fac(i), 0.95) : 0);
  const cutIdx = (p) => p - 4; // 0-based index of first base 3′ of the cut (= 1-based p−3)
  function translate(s) { let o = ''; for (let i = ORF; i + 3 <= s.length; i += 3) { const a = CODE[s.slice(i, i + 3)]; o += a; if (a === '*') break; } return o; }
  function nhej(s, c, rnd = Math.random) { // NHEJ: small indel at the blunt end
    const opts = [[1, 0.35], [-1, 0.2], [-2, 0.15], [2, 0.1], [-3, 0.1], [3, 0.1]]; let u = rnd(), d = 1;
    for (const [k, w] of opts) { if ((u -= w) <= 0) { d = k; break; } }
    if (d > 0) { // +1 is usually a templated duplication of position 17; longer insertions random
      const ins = d === 1 ? s[c - 1] : Array.from({ length: d }, () => 'ACGT'[(rnd() * 4) | 0]).join('');
      return { seq: s.slice(0, c) + ins + s.slice(c), d, pos: c, ins };
    }
    const a = c - Math.ceil(-d / 2); return { seq: s.slice(0, a) + s.slice(a - d), d, pos: a, del: s.slice(a, a - d) };
  }
  function hdr(s, c) { const b = ORF + Math.round((c - ORF) / 3) * 3; return { seq: s.slice(0, b) + TAG + s.slice(b), d: 6, pos: b, ins: TAG, hdr: true }; }

  const CSS = `.crx-wrap{overflow-x:auto;overflow-y:hidden;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.crx-track{position:relative;height:106px;font-family:var(--mono-font,monospace);font-size:12px}
.crx-c{position:absolute;width:13px;height:18px;line-height:18px;text-align:center;color:var(--fg);padding:0;border:0;background:none;font:inherit;border-radius:2px}
.crx-odd{background:color-mix(in srgb,var(--fg) 8%,transparent)}
.crx-pam{color:var(--accent);font-weight:700;cursor:pointer;text-decoration:underline}
.crx-psel{background:color-mix(in srgb,var(--accent) 32%,transparent)}
.crx-proto{background:color-mix(in srgb,var(--s1) 22%,transparent)}
.crx-zip{background:color-mix(in srgb,var(--good) 40%,transparent)}
.crx-mm{background:color-mix(in srgb,var(--warn) 50%,transparent)}
.crx-new{background:color-mix(in srgb,var(--accent) 50%,transparent)}
.crx-aa{color:var(--muted)}.crx-aach{color:var(--warn)}.crx-stop{color:var(--warn);font-weight:700}
.crx-blob{position:absolute;top:14px;height:68px;border-radius:16px;background:color-mix(in srgb,var(--s3) 20%,transparent);border:1.5px solid color-mix(in srgb,var(--s3) 75%,transparent)}
.crx-g{color:var(--s2);font-weight:700;cursor:pointer}.crx-g:disabled{cursor:default}
.crx-sm{position:absolute;font-size:10px;color:var(--muted);white-space:nowrap;line-height:14px}
.crx-cut{position:absolute;top:36px;width:2px;height:44px;background:var(--warn)}
.crx-meter{height:10px;border-radius:5px;background:color-mix(in srgb,var(--fg) 10%,transparent);overflow:hidden;margin:4px 0}
.crx-meter>i{display:block;height:100%}.crx-status{font-size:12px;color:var(--muted);min-height:1.3em;margin:6px 0 2px}`;

  LABS.crispr = {
    title: 'CRISPR-Cas9 靶向切割',
    _m: { SEQ, CODE, pams, proto, guideOf, mism, prob, cutIdx, translate, nhej, hdr, ORF },
    mount(root, ctx) {
      const h = ctx.h, CW = 13, L0 = 22, GAP = 12;
      const P0 = translate(SEQ), first = pams(SEQ)[0];
      const S = { seq: SEQ, p: first, g: guideOf(SEQ, first), phase: 'design', cutAt: null, edit: null, x: first - 21, zip: new Map(), status: '' };
      let tasks = [], cells = { top: [], bot: [] };

      const style = h.el('style', { text: CSS });
      const stage = h.el('div', { class: 'lab-stage' }), controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', text: '点向导 RNA 的碱基可改写它：PAM 远端（左侧）错配几乎无碍，PAM 近端 12 nt 的“种子区”一个错配就让切割概率骤降；没有 NGG 的地方 Cas9 根本不停留。切开后比较 NHEJ（随机小插入/缺失 → 移码、提前终止）与 HDR（按模板精确插入）。' });
      root.append(style, stage, controls, readout, hint);
      const wrap = h.el('div', { class: 'crx-wrap' }), track = h.el('div', { class: 'crx-track' });
      wrap.append(track);
      const status = h.el('div', { class: 'crx-status', 'aria-live': 'polite' });
      const bar = h.el('i'), meter = h.el('div', { class: 'crx-meter', role: 'img', 'aria-label': '切割概率' }, [bar]);
      stage.append(wrap, status, h.el('div', { class: 'crx-sm', style: 'position:static', text: '预测切割概率（位置加权错配模型）' }), meter);

      const X = (i) => L0 + i * CW + (S.cutAt != null && i >= S.cutAt ? GAP : 0);
      const cell = (txt, x, y, cls = '', tag = 'span', attrs = {}) => { const e = h.el(tag, Object.assign({ class: 'crx-c ' + cls, text: txt, style: `left:${x}px;top:${y}px` }, attrs)); track.append(e); return e; };
      const sm = (txt, x, y, extra = '') => track.append(h.el('span', { class: 'crx-sm', text: txt, style: `left:${x}px;top:${y}px;${extra}` }));
      const editable = () => S.phase === 'design' || S.phase === 'scan';
      const sitePs = () => (S.phase === 'done' ? pams(S.seq) : pams(SEQ)); // display list; only clickable while designing

      /* ---- Build the DNA view (rows: ruler 2, guide 18, top 40, bottom 60, protein 82) ---- */
      function build() {
        track.textContent = ''; cells = { top: [], bot: [] };
        const s = S.seq, n = s.length, P = sitePs(), showG = S.phase !== 'done';
        track.style.width = X(n) + 150 + 'px';
        const pamCell = new Map(); P.forEach((p) => [p - 1, p, p + 1].forEach((i) => { if (!pamCell.has(i)) pamCell.set(i, p); }));
        S.blob = null; S.gEl = null; S.gCells = null;
        if (showG) { S.blob = h.el('div', { class: 'crx-blob' }); track.append(S.blob); }
        sm("5′", 2, 40); sm("3′", 2, 60); sm("3′", X(n) + 3, 40); sm("5′", X(n) + 3, 60); sm('蛋白', -1, 84, 'font-size:9px');
        for (let i = 9; i < n; i += 10) sm(String(i + 1), X(i) - 2, 2);
        for (let i = 0; i < n; i++) {
          let cls = i >= ORF && Math.floor((i - ORF) / 3) % 2 === 1 ? 'crx-odd' : '';
          const inProto = S.phase !== 'done' && i >= S.p - 21 && i <= S.p - 2;
          if (inProto) cls = 'crx-proto';
          if (pamCell.has(i)) cls += ' crx-pam' + (pamCell.get(i) === S.p ? ' crx-psel' : '');
          if (S.edit && S.edit.ins && i >= S.edit.pos && i < S.edit.pos + S.edit.ins.length) cls = 'crx-new';
          const t = pamCell.has(i) && editable()
            ? cell(s[i], X(i), 40, cls, 'button', { 'aria-label': `PAM ${s.slice(pamCell.get(i) - 1, pamCell.get(i) + 2)} 位置 ${pamCell.get(i)}`, onclick: () => selectPAM(pamCell.get(i)) })
            : cell(s[i], X(i), 40, cls);
          cells.top.push(t); cells.bot.push(cell(COMP[s[i]], X(i), 60, inProto ? 'crx-proto' : ''));
        }
        // protein row: one letter per codon, changed residues and the stop highlighted
        const pr = translate(s);
        for (let k = 0; k < pr.length; k++) {
          const a = pr[k], c = a === '*' ? 'crx-stop' : a !== P0[k] ? 'crx-aach' : 'crx-aa';
          cell(a === '*' ? '■' : a, X(ORF + 3 * k + 1), 82, c, 'span', { title: a === '*' ? '终止密码子' : a });
        }
        if (S.cutAt != null) { const e = h.el('div', { class: 'crx-cut', style: `left:${X(S.cutAt) - GAP / 2 - 1}px` }); track.append(e); sm('✂ 平末端双链断裂', X(S.cutAt) - 40, 2, 'color:var(--warn)'); }
        if (S.edit && S.edit.del) { sm('▼', X(S.edit.pos) - 6, 22, 'color:var(--warn)'); sm(`−${S.edit.del.length} (${S.edit.del})`, X(S.edit.pos) - 6, 2, 'color:var(--warn)'); }
        if (S.edit && S.edit.ins) sm(`+${S.edit.ins.length}${S.edit.hdr ? ' HDR' : ''}`, X(S.edit.pos), 22, 'color:var(--accent)');
        // guide RNA (moves with Cas9)
        if (showG) {
          S.gEl = h.el('div', { style: 'position:absolute;top:18px;height:18px' }); track.append(S.gEl);
          S.gCells = S.g.map((b, i) => { const e = h.el('button', { class: 'crx-c crx-g', text: b, style: `left:${i * CW}px;top:0`, 'aria-label': `向导第 ${i + 1} 位 ${b}，点击改写`, onclick: () => cycle(i) }); S.gEl.append(e); return e; });
          S.gEl.append(h.el('span', { class: 'crx-sm', text: '5′', style: 'left:-12px;top:2px' }), h.el('span', { class: 'crx-sm', text: '— 骨架（tracrRNA 部分）', style: `left:${20 * CW + 2}px;top:2px;color:var(--s2)` }));
        }
        place(S.x); paintZip(); refresh();
      }
      function place(x) { // Cas9 + guide at fractional protospacer-start x
        if (!S.blob) return; const L = X(Math.floor(x)) + (x % 1) * CW;
        S.blob.style.left = L - 6 + 'px'; S.blob.style.width = 23 * CW + 12 + (S.cutAt != null ? GAP : 0) + 'px';
        S.gEl.style.left = L + 'px';
        const site = Math.round(x) + 21, parked = Math.abs(x - Math.round(x)) < 1e-6 && site + 1 < S.seq.length;
        const mm = parked ? mism(S.g, S.seq, site) : [];
        S.gCells.forEach((e, i) => { e.className = 'crx-c crx-g' + (mm.includes(i + 1) ? ' crx-mm' : ''); e.disabled = S.phase !== 'design'; });
        const vw = wrap.clientWidth; if (vw && (L < wrap.scrollLeft + 10 || L + 23 * CW > wrap.scrollLeft + vw - 10)) wrap.scrollLeft = Math.max(0, L - vw / 2 + 12 * CW);
      }
      function paintZip() { cells.top.forEach((e, i) => { e.classList.remove('crx-zip', 'crx-mm'); cells.bot[i].classList.remove('crx-zip', 'crx-mm'); });
        for (const [i, c] of S.zip) { cells.top[i] && cells.top[i].classList.add(c); cells.bot[i] && cells.bot[i].classList.add(c); } }

      /* ---- Readouts ---- */
      const R = Object.fromEntries([['pam', 'PAM'], ['pro', '原间隔序列 (5′→3′)'], ['gc', '向导 GC 含量'], ['mm', '错配数（种子区）'], ['P', '预测切割概率'], ['cut', '切割位点'], ['rep', '修复结果'], ['prot', '蛋白']].map(([k, l]) => [k, h.readout(l)]));
      Object.values(R).forEach((r) => readout.append(r.el));
      function refresh() {
        const s = S.seq, p = S.p, mm = mism(S.g, SEQ, p), P = prob(S.g, SEQ, p);
        R.pam.set(`${SEQ.slice(p - 1, p + 2)} @ 位置 ${p}（上游 20 nt 为原间隔序列）`);
        R.pro.set(`${proto(S.phase === 'done' ? SEQ : s, p)} + ${SEQ.slice(p - 1, p + 2)}`);
        const gc = S.g.filter((b) => b === 'G' || b === 'C').length; R.gc.set(`${gc}/20 = ${(gc * 5)}%`);
        R.mm.set(`${mm.length}（${mm.filter((i) => i >= 9).length}）` + (mm.length ? '  位置 ' + mm.join(',') : ''));
        R.P.set(`0.95${mm.map((i) => ' × ' + fac(i)).join('')} = ${(P * 100).toFixed(P < 0.01 ? 2 : 1)}%`);
        bar.style.width = (P * 100).toFixed(1) + '%'; bar.style.background = P > 0.5 ? 'var(--good)' : P > 0.1 ? 'var(--accent)' : 'var(--warn)';
        R.cut.set(`${cutIdx(p)} | ${cutIdx(p) + 1} 之间（第 17|18 位，PAM 上游 3 bp）` + (S.cutAt != null && S.phase === 'cut' ? ' ✂ 已切' : ''));
        const e = S.edit, pr = translate(s);
        if (!e) R.rep.set(S.phase === 'cut' ? '待修复：选 NHEJ 或 HDR' : '—');
        else if (e.hdr) R.rep.set(`+6 bp 精确插入 ${TAG}（BamHI 位点，+Gly-Ser，读码框不变）`);
        else { const d = e.d, fs = d % 3 !== 0, stop = pr.endsWith('*');
          R.rep.set(`${d > 0 ? '+' : '−'}${Math.abs(d)} bp ${d > 0 ? '插入 ' + e.ins : '缺失 ' + e.del} → ` + (fs ? `移码${stop ? ' → 第 ' + pr.length + ' 个密码子提前终止' : ''}` : `框内（${d > 0 ? '多' : '少'} 1 个氨基酸，不移码）`)); }
        R.prot.set(pr + (pr.endsWith('*') ? `（${pr.length} aa 后终止，野生型 ${P0.length} aa）` : pr === P0 ? '（同野生型）' : ''));
        bRun.disabled = S.phase !== 'design'; bNH.disabled = bHD.disabled = S.phase !== 'cut';
        S.gCells && S.gCells.forEach((e) => (e.disabled = S.phase !== 'design'));
      }

      /* ---- Interactions ---- */
      const RNA = ['A', 'C', 'G', 'U'];
      function selectPAM(p) {
        if (S.phase !== 'design') softReset();
        S.p = p; S.g = guideOf(SEQ, p); S.x = p - 21; S.zip.clear(); cPam.set(String(p)); build();
        status.textContent = `已选 PAM ${SEQ.slice(p - 1, p + 2)} @ 位置 ${p}；向导取其上游 20 nt（完全匹配）。`;
      }
      function cycle(i) { if (S.phase !== 'design') return; S.g[i] = RNA[(RNA.indexOf(S.g[i]) + 1) % 4]; S.gCells[i].textContent = S.g[i]; place(S.x); refresh(); }
      function addMM(pos) { // force a mismatch at 1-based position pos (1 = PAM-distal, 20 = PAM-proximal)
        if (S.phase !== 'design') return;
        const t = proto(SEQ, S.p)[pos - 1].replace('T', 'U');
        S.g[pos - 1] = RNA[(RNA.indexOf(t) + 1 + ((Math.random() * 3) | 0)) % 4];
        S.gCells[pos - 1].textContent = S.g[pos - 1]; place(S.x); refresh();
        status.textContent = `第 ${pos} 位错配（${pos >= 9 ? '种子区，×' + fac(pos) : 'PAM 远端，×' + fac(pos)}）。`;
      }

      /* ---- Scan + cut animation: a queue of timed steps ---- */
      const Q = []; let qi = 0, qt = 0;
      const lp = h.loop((dt) => {
        if (qi >= Q.length) { lp.stop(); Q.length = 0; if (S.phase === 'scan') { S.phase = 'design'; status.textContent = '扫描完毕：没有一个位点通过检验（概率太低），DNA 未被切开。'; refresh(); } return; }
        qt += dt; const s = Q[qi], u = Math.min(1, qt / s.dur); s.f && s.f(u);
        if (u >= 1) { const r = s.end && s.end(); qi++; qt = 0; if (r === 'stop') { Q.length = 0; lp.stop(); } }
      });
      function runQueue() {
        qi = 0; qt = 0;
        if (ctx.reduced) { while (qi < Q.length) { const s = Q[qi]; s.f && s.f(1); if ((s.end && s.end()) === 'stop') break; qi++; } Q.length = 0; if (S.phase === 'scan') { S.phase = 'design'; status.textContent = '扫描完毕：没有位点通过检验，DNA 未被切开。'; } build(); }
        else lp.start();
      }
      function scan() {
        if (S.phase !== 'design') return;
        S.phase = 'scan'; S.zip.clear(); Q.length = 0;
        let from = S.x;
        for (const p of pams(SEQ)) {
          const to = p - 21, mm = mism(S.g, SEQ, p), P = prob(S.g, SEQ, p);
          Q.push({ dur: 0.2 + 0.02 * Math.abs(to - from), f: (u) => place(from + (to - from) * u),
            end: () => { from = to; S.x = to; S.zip.clear(); paintZip(); status.textContent = `停在 PAM ${SEQ.slice(p - 1, p + 2)} @ ${p}：从 PAM 近端开始解链、逐位检验配对（R-loop 拉链）…`; } });
          Q.push({ dur: 0.9, f: (u) => { // zipper runs PAM-proximal (i = 20) → distal (i = 1)
              const k = Math.floor(u * 20); S.zip.clear();
              for (let j = 0; j < k; j++) { const i = 20 - j; S.zip.set(p - 21 + (i - 1), mm.includes(i) ? 'crx-mm' : 'crx-zip'); if (mm.includes(i) && i >= 9) break; }
              paintZip();
            },
            end: () => {
              if (Math.random() < P) {
                S.p = p; S.cutAt = cutIdx(p); S.phase = 'cut'; S.zip.clear(); build();
                status.textContent = `R-loop 完整 → HNH/RuvC 协同在 PAM 上游 3 bp 切出平末端双链断裂（P = ${(P * 100).toFixed(1)}%）。`;
                return 'stop';
              }
              const seed = mm.filter((i) => i >= 9);
              status.textContent = seed.length ? `第 ${seed.join(',')} 位（种子区）错配 → 拉链卡住，Cas9 松开继续巡查（P = ${(P * 100).toFixed(2)}%）。`
                : `配对不足（P = ${(P * 100).toFixed(1)}%），未切割，继续巡查。`;
              S.zip.clear(); paintZip();
            } });
        }
        runQueue();
      }
      function repair(kind) {
        if (S.phase !== 'cut') return;
        const e = kind === 'hdr' ? hdr(S.seq, S.cutAt) : nhej(S.seq, S.cutAt);
        S.seq = e.seq; S.edit = e; S.phase = 'done'; S.cutAt = null; build();
        status.textContent = kind === 'hdr' ? 'HDR：以含 6 bp 标签的同源模板精确修复 —— 读码框不变，只多了 Gly-Ser。'
          : 'NHEJ：断端被直接连上，留下随机小插入/缺失；若不是 3 的倍数就移码，下游很快出现终止密码子。';
      }
      function softReset() { lp.stop(); Q.length = 0; S.seq = SEQ; S.edit = null; S.cutAt = null; S.phase = 'design'; S.zip.clear(); }
      function reset() { softReset(); S.p = pams(SEQ)[0]; S.g = guideOf(SEQ, S.p); S.x = S.p - 21; cPam.set(String(S.p)); sPos.set(14); build(); status.textContent = '已重置为原始序列与完全匹配的向导。'; }

      /* ---- Controls ---- */
      const cPam = h.choice({ label: '选 PAM', value: String(S.p), options: pams(SEQ).map((p) => ({ value: String(p), label: `${SEQ.slice(p - 1, p + 2)}@${p}` })), onChange: (v) => selectPAM(+v) });
      const sPos = h.slider({ label: '错配位置（1=PAM 远端）', min: 1, max: 20, step: 1, value: 14, format: (v) => `${v}${v >= 9 ? ' 种子区' : ' 远端'}` });
      const bMM = h.button({ label: '引入错配', onClick: () => addMM(sPos.get()) });
      const bPerf = h.button({ label: '恢复完全匹配', onClick: () => selectPAM(S.p) });
      const bRun = h.button({ label: 'Cas9 扫描并切割', kind: 'primary', onClick: scan });
      const bNH = h.button({ label: '非同源末端连接 NHEJ', onClick: () => repair('nhej') });
      const bHD = h.button({ label: '同源定向修复 HDR', onClick: () => repair('hdr') });
      controls.append(bRun, cPam.el, sPos.el, bMM, bPerf, bNH, bHD, h.button({ label: '重置', onClick: reset }));

      build();
      status.textContent = `已选 PAM ${SEQ.slice(S.p - 1, S.p + 2)} @ 位置 ${S.p}，向导完全匹配 —— 直接点“Cas9 扫描并切割”。`;
      return { destroy() { lp.stop(); Q.length = 0; style.remove(); } };
    },
  };
})();
