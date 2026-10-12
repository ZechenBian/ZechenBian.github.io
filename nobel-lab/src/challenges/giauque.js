/* 通往绝对零度 — Giauque, Nobel Chemistry 1949 (challenge version)
 * Stage 1: CO calorimetric entropy vs spectroscopic entropy → residual entropy (Clayton & Giauque 1932).
 *   Cp model (illustrative, J K⁻¹ mol⁻¹): solid I = Debye(θ=90 K) + 2·Einstein(θ=64 K) + pre-transition tail;
 *   solid II, liquid linear. Transition 61.6 K (ΔH 633 J/mol), melting 68.1 K (836), boiling 81.6 K (6043).
 *   Calorimetric sum ≈ 155.2; statistical: Sackur–Tetrode (M = 28.01) 123.4 + rotation (θ_rot = 2.77 K, σ = 1) 36.4 = 159.8.
 * Stage 2: square-ice puzzle on a 4×4 torus + Pauling counting W = 2²·(6/16) = 3/2, R ln 1.5 = 3.37 vs 3.43 (Giauque & Stout 1936).
 *   (Exact 4×4 torus count = 2970 → 2970^(1/16) = 1.65; Lieb's square ice (4/3)^{3/2} = 1.540; Nagle 3D ice ≈ 1.507.)
 * Stage 3: adiabatic demagnetization. Ideal Gd³⁺ paramagnet J = 7/2, g = 2, internal field b = 0.13 T (模型参数);
 *   S/R = ln Z − x dlnZ/dx with x = gμ_B√(B²+b²)/kT ⇒ adiabat: √(B²+b²)/T const. 1.5 K, 0.8 T → 0.24 K.
 * Constants: μ_B = 9.274e-24 J/T, k = 1.380649e-23 J/K, R = 8.314 J K⁻¹ mol⁻¹.
 */
(() => {
  const R = 8.314;
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function watchTheme(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-giauque')) return;
    const s = document.createElement('style'); s.id = 'st-giauque';
    s.textContent = `
.giauque-tiles{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px;max-width:560px}
@media (max-width:520px){.giauque-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
.giauque-tile{font:inherit;padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer;display:grid;place-items:center;gap:2px}
.giauque-tile svg{width:100%;max-width:58px;height:auto;display:block}
.giauque-tile span{font-family:var(--mono-font);font-size:10.5px;color:var(--muted)}
.giauque-tile[aria-pressed="true"]{border-color:var(--good);box-shadow:inset 0 0 0 1px var(--good)}
.giauque-tile[aria-pressed="true"] span{color:var(--good)}
.giauque-sec[hidden]{display:none}
.giauque-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.giauque-sec h4{margin:0;font-size:14px}
.giauque-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.giauque-row-dim td{color:var(--muted)}
.giauque-row-tot td{font-weight:600}
.giauque-row-stat td{color:var(--accent)}
.dtable td.giauque-l,.dtable th.giauque-l{text-align:left}`;
    document.head.append(s);
  }

  /* ---------- Stage 1: CO heat capacity ---------- */
  function debyeC(T, th) { const xD = th / T; let s = 0; const n = 120; for (let i = 1; i <= n; i++) { const x = (xD * (i - 0.5)) / n; s += (x ** 4 * Math.exp(x)) / (Math.exp(x) - 1) ** 2; } return (9 * R * (s * xD / n)) / xD ** 3; }
  const einC = (T, th) => { const x = th / T; return x > 200 ? 0 : (R * x * x * Math.exp(x)) / (Math.exp(x) - 1) ** 2; };
  const T_TR = 61.6, T_M = 68.1, T_B = 81.6, T_LO = 14;
  const cpCO = (T) => T < T_TR ? debyeC(T, 90) + 2 * einC(T, 64) + 8 * Math.exp((T - T_TR) / 4) : T < T_M ? 52 + 0.4 * (T - T_TR) : 60.0 + 0.05 * (T - T_M);
  const intCpT = (a, b) => { if (b <= a) return 0; const n = Math.max(20, Math.ceil((b - a) * 8)); let s = 0; for (let i = 0; i < n; i++) { const t = a + ((b - a) * (i + 0.5)) / n; s += cpCO(t) / t; } return (s * (b - a)) / n; };
  const S_DEB = cpCO(T_LO) / 3; // ∫0^T (aT³)/T dT = Cp(T)/3
  const S_STAT = 159.8;
  function coSteps(Tu) { // running calorimetric entropy rows up to Tu
    const rows = [
      { k: '0 → 14 K', how: 'Debye T³ 外推：Cp(14)/3', v: S_DEB, on: true },
      { k: '14 → 61.6 K', how: '固体 I：∫Cp dlnT', v: intCpT(T_LO, Math.min(Tu, T_TR)), on: Tu > T_LO, part: Tu < T_TR },
      { k: '61.6 K', how: '固–固相变 633/61.6', v: 633 / T_TR, on: Tu >= T_TR },
      { k: '61.6 → 68.1 K', how: '固体 II：∫Cp dlnT', v: intCpT(T_TR, Math.min(Tu, T_M)), on: Tu > T_TR, part: Tu < T_M },
      { k: '68.1 K', how: '熔化 836/68.1', v: 836 / T_M, on: Tu >= T_M },
      { k: '68.1 → 81.6 K', how: '液体：∫Cp dlnT', v: intCpT(T_M, Math.min(Tu, T_B)), on: Tu > T_M, part: Tu < T_B },
      { k: '81.6 K', how: '汽化 6043/81.6', v: 6043 / T_B, on: Tu >= T_B - 1e-9 },
    ];
    return { rows, tot: rows.reduce((a, r) => a + (r.on ? r.v : 0), 0) };
  }

  function stage1() {
    return {
      title: '熵的两本账',
      task: `<p>1932 年，伯克利。Clayton 和 Giauque 把一氧化碳 CO 从 14 K 一路加热到沸点，用量热计逐点测出定压热容 $C_p(T)$，并记下两次固态相变/熔化和汽化的潜热。按 $dS = \\delta Q_{\\rm rev}/T$，把它们全部加起来，就得到“量热熵” $S(81.6\\,{\\rm K}) - S(0)$。</p>
<p>另一本账来自光谱：从 CO 的分子质量、转动常数和振动频率，用统计力学直接算出理想气体在沸点、1 atm 下的熵。</p>
<p>拖动积分上限，把量热熵算到 81.6 K，再与光谱熵对账。热力学第三定律说<b>完美晶体在 0 K 时 $S = 0$</b>。两本账对得上吗？如果对不上，多出来的熵是什么？</p>`,
      hints: [
        '差值来自 0 K 附近：量热法只测到了从 0 K 的晶体出发“增加了多少”熵，若晶体在 0 K 时还剩下熵 $S_0$，量热法看不见它。',
        '玻尔兹曼：$S_0 = R\\ln W$，W 是每个分子在晶体里冻结下来的、等概率的构型数。由 $R\\ln W \\approx 4.6$ 解出 W。',
        '$W = e^{4.6/8.314} \\approx 1.74$，接近 2。CO 分子两端（C 与 O）大小和电性都相近：每个格点上分子可以是 CO 也可以是 OC。',
      ],
      answer: `量热熵 ≈ 155.2 J K⁻¹ mol⁻¹，光谱（统计）熵 ≈ 159.8，差 ≈ 4.6。把它解释为 0 K 时残留的熵 $S_0 = R\\ln W$，得 $W = e^{4.6/R} \\approx 1.7$，接近 2：每个 CO 在晶格中可取 CO / OC 两种几乎等能的朝向，冷却时分子来不及转过来排好，无序被“冻结”下来（完全无序给 $R\\ln 2 = 5.76$；实测略小，说明有部分排序）。这就是<b>残余熵</b>，Clayton & Giauque (1932)。第三定律并未失效：它只对处于内部平衡的完美晶体成立。`,
      build(body, api) {
        const h = H, C = (n) => api._ctx.color(n);
        const st = { Tu: 40, mode: 'cpT' };
        const rnd = mulberry32(1932);
        const pts = []; for (let T = T_LO; T < T_B; T += 1.3 + rnd() * 1.4) { if (Math.abs(T - T_TR) < 0.5 || Math.abs(T - T_M) < 0.5) continue; pts.push([T, cpCO(T) * (1 + 0.012 * (rnd() * 2 - 1))]); }
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.56, minH: 220, maxH: 360 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sT = h.slider({ label: '积分上限 T', min: T_LO, max: T_B, step: 0.1, value: st.Tu, format: (v) => v.toFixed(1) + ' K', onInput: (v) => { st.Tu = v; draw(); } });
        const cM = h.choice({ label: '纵轴', value: st.mode, options: [{ value: 'cp', label: 'Cp' }, { value: 'cpT', label: 'Cp / T（面积 = 熵）' }], onChange: (v) => { st.mode = v; draw(); } });
        const go = h.el('div', { class: 'ctl' }, [h.button({ label: '一路积分到沸点 81.6 K', onClick: () => { st.Tu = T_B; sT.set(T_B); draw(); } })]);
        ctl.append(sT.el, go, cM.el);
        const tbWrap = h.el('div', { class: 'dtable' }); body.append(tbWrap);
        const roW = h.el('div', { class: 'lab-readout' }); const roS = h.readout('量热熵 S(T) − S(0 K)'), roG = h.readout('光谱熵 − 量热熵');
        roW.append(roS.el, roG.el); body.append(roW);

        const sec = h.el('div', { class: 'giauque-sec' }); body.append(sec);
        let okW = false, okQ = false;
        const finish = () => { if (okW && okQ) api.done('<b>残余熵（Clayton &amp; Giauque, 1932）</b>：CO 晶体在 0 K 仍保留约 $R\\ln 2$ 量级的熵——每个分子 CO/OC 两种朝向的无序在冷却中被冻结。第三定律只适用于真正处于平衡的完美晶体，而 Giauque 用“两本账”的差把这种冻结无序测了出来。'); };
        const ans = H.answer({
          label: '若多出的熵来自 0 K 时冻结的构型数，$R\\ln W \\approx 4.6$ J K⁻¹ mol⁻¹ ⇒ 每个分子 W ≈ ?（容差 1.7–2.1）', placeholder: 'W',
          check: (v) => {
            if (v >= 1.7 && v <= 2.1) return { ok: true, msg: `对：$W = e^{4.6/R} \\approx 1.74$，接近 2。下面想想：每个 CO 为什么会有“约两种”状态？` };
            if (Math.abs(v - 4.6) < 0.3) return { ok: false, msg: '4.6 是 R ln W 本身，不是 W。' };
            if (Math.abs(v - 0.553) < 0.06) return { ok: false, msg: '这是 ln W；再取指数。' };
            if (v > 50) return { ok: false, msg: '记得 R ≈ 8.314 J K⁻¹ mol⁻¹ 是每摩尔的，W 是每个分子的。' };
            return { ok: false, msg: '不对。S₀ = R ln W，解出 W。' };
          },
          onOk: () => { okW = true; quizBox.hidden = false; api.typeset(quizBox); finish(); },
        });
        const quizBox = h.el('div', { hidden: true });
        quizBox.append(H.quiz({
          question: '对于同样测量的 N₂、HCl，两本账在误差内吻合，唯独 CO（以及后来的 N₂O、NO、冰）对不上。最合理的物理原因是：',
          options: [
            { label: '量热计在低温漏热，系统地少测了熵', ok: false, why: '同一台量热计测 N₂、HCl 时两本账吻合；而且漏热会让测到的熵变“多”而非少。' },
            { label: 'CO 与 OC 两种朝向能量几乎相同，冷却时分子来不及排好，无序被冻结在晶体里', ok: true, why: '对。C 与 O 大小相近、偶极矩只有 0.1 D，“头尾”反向的能量代价极小；温度降低后分子转动被冻住，平衡排序根本来不及发生。' },
            { label: '热力学第三定律对 CO 不成立', ok: false, why: '第三定律说的是<b>处于内部平衡的完美晶体</b>。CO 晶体不是平衡态——它被困在一种无序构型里。' },
            { label: '统计熵公式漏除了对称数 σ = 2', ok: false, why: 'CO 是异核分子，σ = 1；同核的 N₂ 才需 σ = 2，而 N₂ 两本账是吻合的。' },
          ],
          onOk: () => { okQ = true; finish(); },
        }).el);
        sec.append(h.el('h4', { text: '对账' }), ans.el, quizBox);

        function table() {
          const { rows, tot } = coSteps(st.Tu);
          const tr = rows.map((r) => `<tr class="${r.on ? '' : 'giauque-row-dim'}"><td class="giauque-l">${r.k}</td><td class="giauque-l">${r.how}</td><td>${r.on ? r.v.toFixed(2) + (r.part ? '…' : '') : '—'}</td></tr>`).join('');
          const done = st.Tu >= T_B - 1e-9;
          tbWrap.innerHTML = `<table><thead><tr><th class="giauque-l">温区 / 温度</th><th class="giauque-l">来源</th><th>ΔS (J K⁻¹ mol⁻¹)</th></tr></thead><tbody>${tr}
<tr class="giauque-row-tot"><td class="giauque-l">合计</td><td class="giauque-l">量热熵</td><td>${tot.toFixed(1)}</td></tr>
<tr class="giauque-row-stat"><td class="giauque-l">81.6 K, 1 atm</td><td class="giauque-l">光谱熵（平动 123.4 + 转动 36.4）</td><td>${done ? S_STAT.toFixed(1) : '（先积分到沸点）'}</td></tr></tbody></table>`;
          roS.set(tot.toFixed(1) + ' J K⁻¹ mol⁻¹ @ ' + st.Tu.toFixed(1) + ' K');
          roG.set(done ? (S_STAT - tot).toFixed(1) + ' J K⁻¹ mol⁻¹' : '—');
        }
        function plot() {
          const g = cv.g, W = cv.w, Hh = cv.h, mono = C('--mono-font') || 'monospace', cpT = st.mode === 'cpT';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const f = (T) => (cpT ? cpCO(T) / T : cpCO(T));
          const ax = h.axes(g, W, Hh, { x0: 0, x1: 90, y0: 0, y1: cpT ? 1.2 : 72, pad: { l: 44, r: 10, t: 22, b: 34 }, xTicks: [0, 15, 30, 45, 60, 75, 90], yTicks: cpT ? [0, 0.3, 0.6, 0.9, 1.2] : [0, 20, 40, 60], fmtY: (v) => (cpT ? v.toFixed(1) : String(v)), xLabel: 'T (K)', yLabel: cpT ? 'Cp/T (J K⁻² mol⁻¹)' : 'Cp (J K⁻¹ mol⁻¹)' }, C);
          // phase bands
          const bands = [[0, T_TR, '固 I'], [T_TR, T_M, '固 II'], [T_M, T_B, '液'], [T_B, 90, '气']];
          g.font = '10.5px ' + mono; g.textAlign = 'center'; g.textBaseline = 'top';
          bands.forEach(([a, b, lab], i) => { if (i % 2) { g.fillStyle = C('--grid'); g.globalAlpha = 0.35; g.fillRect(ax.X(a), ax.p.t, ax.X(b) - ax.X(a), ax.ih); g.globalAlpha = 1; } g.fillStyle = C('--muted'); g.fillText(lab, (ax.X(a) + ax.X(b)) / 2, 5); });
          // shaded area to Tu (Cp/T mode)
          const segs = [[0.3, T_TR - 0.01], [T_TR, T_M - 0.01], [T_M, T_B]];
          if (cpT) {
            g.fillStyle = C('--accent'); g.globalAlpha = 0.22;
            segs.forEach(([a, b]) => { b = Math.min(b, st.Tu); if (b <= a) return; g.beginPath(); g.moveTo(ax.X(a), ax.Y(0)); for (let i = 0; i <= 60; i++) { const T = a + ((b - a) * i) / 60; g.lineTo(ax.X(T), ax.Y(f(T))); } g.lineTo(ax.X(b), ax.Y(0)); g.closePath(); g.fill(); });
            g.globalAlpha = 1;
          }
          // model curve: dashed Debye extrapolation below 14 K, solid elsewhere
          g.strokeStyle = C('--s1'); g.lineWidth = 1.5;
          segs.forEach(([a, b]) => { g.beginPath(); let first = true; for (let i = 0; i <= 120; i++) { const T = a + ((b - a) * i) / 120; if (T < T_LO) continue; const y = ax.Y(f(T)); first ? g.moveTo(ax.X(T), y) : g.lineTo(ax.X(T), y); first = false; } g.stroke(); });
          g.setLineDash([4, 3]); g.beginPath();
          const a3 = cpCO(T_LO) / T_LO ** 3;
          for (let i = 0; i <= 40; i++) { const T = (T_LO * i) / 40, y = cpT ? a3 * T * T : a3 * T ** 3; i ? g.lineTo(ax.X(T), ax.Y(y)) : g.moveTo(ax.X(T), ax.Y(y)); } g.stroke(); g.setLineDash([]);
          // data points
          g.fillStyle = C('--fg');
          pts.forEach(([T, c]) => { g.beginPath(); g.arc(ax.X(T), ax.Y(cpT ? c / T : c), 2.2, 0, 6.283); g.fill(); });
          // latent heats as arrows
          g.strokeStyle = C('--warn'); g.fillStyle = C('--warn'); g.lineWidth = 1.5; g.textAlign = 'center'; g.textBaseline = 'bottom';
          [[T_TR, '633'], [T_M, '836'], [T_B, '6043']].forEach(([T, q], i) => {
            const x = ax.X(T), y0 = ax.Y(cpT ? 1.0 : 60) - i * 0; g.beginPath(); g.moveTo(x, ax.Y(0)); g.lineTo(x, y0); g.stroke();
            g.beginPath(); g.moveTo(x, y0 - 6); g.lineTo(x - 4, y0); g.lineTo(x + 4, y0); g.closePath(); g.fill();
            g.textAlign = i === 0 ? 'right' : 'left'; g.fillText(q, x + (i === 0 ? -3 : 3), y0 - 7 - (i === 1 ? 12 : 0));
          });
          g.fillStyle = C('--warn'); g.textAlign = 'right'; g.textBaseline = 'bottom';
          g.fillText('潜热 ΔH (J/mol) →', ax.X(T_TR) - 5, ax.Y(0) - 4);
          g.textAlign = 'left'; g.fillText('T³ 外推', ax.X(1), ax.Y(cpT ? 0.2 : 12));
          // cursor
          g.strokeStyle = C('--accent'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax.X(st.Tu), ax.p.t); g.lineTo(ax.X(st.Tu), ax.p.t + ax.ih); g.stroke();
        }
        function draw() { plot(); table(); }
        cv.onResize(plot);
        const un = watchTheme(plot);
        draw();
        return { destroy() { cv.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 2: square ice ---------- */
  const L = 4, N = L * L; // bonds: 0..N-1 horizontal (v → right), N..2N-1 vertical (v → down); value 0 = H near v, 1 = H near the other end
  const left = (v) => Math.floor(v / L) * L + ((v % L) + L - 1) % L;
  const up = (v) => (((Math.floor(v / L) + L - 1) % L) * L) + (v % L);
  const near = (b, v) => (b[v] === 0) + (b[N + v] === 0) + (b[left(v)] === 1) + (b[N + up(v)] === 1);
  const viols = (b) => { const out = []; for (let v = 0; v < N; v++) { const n = near(b, v); if (n !== 2) out.push([v, n]); } return out; };
  let scrN = 0;
  function scrambled() {
    const rnd = mulberry32(1936 + 101 * scrN++); let b;
    do {
      b = new Array(2 * N).fill(0);
      for (let k = 0; k < 300; k++) { // plaquette loop flips keep the ice rule
        const v = Math.floor(rnd() * N), r = (v % L === L - 1) ? v - L + 1 : v + 1, dn = (v + L) % N;
        const ids = [v, N + v, N + r, dn];
        ids.forEach((i) => (b[i] ^= 1));
        if (viols(b).length) ids.forEach((i) => (b[i] ^= 1));
      }
      for (let k = 0; k < 3; k++) b[Math.floor(rnd() * 2 * N)] ^= 1;
    } while (viols(b).length < 4);
    return b;
  }
  // 16 local arrangements of one O's 4 neighbouring H (bits: 1 = near)
  const TILE_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function tileSVG(mask) {
    let s = '<svg viewBox="-24 -24 48 48" aria-hidden="true">';
    TILE_DIRS.forEach(([dx, dy], k) => {
      const r = (mask >> k) & 1 ? 8.5 : 17;
      s += `<line x1="0" y1="0" x2="${dx * 22}" y2="${dy * 22}" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/>`;
      s += `<circle cx="${dx * r}" cy="${dy * r}" r="3.3" fill="currentColor"/>`;
    });
    return s + '<circle cx="0" cy="0" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  }
  const popcount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

  function stage2() {
    return {
      title: '冰的冻结无序',
      task: `<p>1936 年，Giauque 和 Stout 用同样的“两本账”测了冰：量热熵比光谱熵少了 <b>$3.43 \\pm 0.2$ J K⁻¹ mol⁻¹</b>。冰里的分子可没有 CO/OC 那样的“头尾”对称。</p>
<p>Bernal–Fowler (1933) 的冰结构：每个 O 周围有 4 个 O，每条 O···O 键上恰好一个 H，靠近其中一端（共价 O–H）或另一端（氢键 H···O）。<b>冰规则</b>：每个 O 恰好有 2 个 H 靠近它——这样才是 H₂O 分子。下面是一张“方形冰”（二维、周期边界的 4×4 格子，模型简化）：点击一条键把它上面的 H 推到另一端。</p>
<p>先修好它：让每个 O 都满足冰规则。然后数一数：满足冰规则的构型到底有多少？</p>`,
      hints: [
        '每次翻转一条键，两端 O 的“近 H 数”一个 +1、一个 −1。所以违规点成对出现：把“H 太多”的 O 和“H 太少”的 O 沿着一条路径连起来，把路径上的键依次翻转。',
        'Pauling 的数法：N 个 O、2N 个 H，每个 H 有 2 个位置 → 总共 $2^{2N}$。对一个 O 来说，周围 4 个 H 的 16 种排法里只有一部分满足冰规则——把它当作每个 O 独立地“通过筛选”的概率。',
        '16 种里恰好 2 个近的有 $\\binom{4}{2} = 6$ 种，所以 $W^N \\approx 2^{2N}(6/16)^N$，$W = 4 \\times 6/16 = 3/2$，$R\\ln 1.5 = 3.37$。',
      ],
      answer: `冰规则约束下 H 仍有大量排法。Pauling (1935)：$2N$ 个 H 各有 2 个位置给出 $2^{2N}$；每个 O 的 16 种局部排法中 6 种合规，近似把这些约束当作独立，$W_{\\rm tot} \\approx 2^{2N}(6/16)^N = (3/2)^N$，所以每个分子 $W = 1.5$，残余熵 $R\\ln\\frac32 = 3.37$ J K⁻¹ mol⁻¹，与 Giauque & Stout (1936) 的 $3.43 \\pm 0.2$ 吻合。（更精确：Nagle 对三维冰得 1.507；二维方形冰 Lieb 精确解 $(4/3)^{3/2} = 1.540$。）`,
      build(body, api) {
        const h = H, C = (n) => api._ctx.color(n);
        let b = scrambled(), sel = 0, solved = false;
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.72, minH: 250, maxH: 340 });
        cv.canvas._giauqueIce = { get: () => b.slice() }; // test hook (read-only copy)
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sS = h.slider({ label: '选中的键', min: 1, max: 2 * N, step: 1, value: 1, format: (v) => '#' + v + (v <= N ? ' 横' : ' 竖'), onInput: (v) => { sel = v - 1; draw(); } });
        const bt = h.el('div', { class: 'ctl' }, [h.el('div', {}, [
          h.button({ label: '翻转选中键', onClick: () => flip(sel) }),
          h.button({ label: '重新打乱', onClick: () => { b = scrambled(); update(); } }),
        ])]);
        ctl.append(sS.el, bt);
        const roW = h.el('div', { class: 'lab-readout' }); const roV = h.readout('违规的 O'), roH = h.readout('H 太多 / 太少');
        roW.append(roV.el, roH.el); body.append(roW);

        const sec = h.el('div', { class: 'giauque-sec', hidden: true }); body.append(sec);
        const marked = new Set();
        const tiles = Array.from({ length: 16 }, (_, m) => {
          const t = h.el('button', { type: 'button', class: 'giauque-tile', 'aria-pressed': 'false', 'aria-label': `排法 ${m + 1}：${popcount(m)} 个 H 靠近`, html: tileSVG(m) + `<span>${m + 1}</span>` });
          t.addEventListener('click', () => { marked.has(m) ? marked.delete(m) : marked.add(m); t.setAttribute('aria-pressed', String(marked.has(m))); });
          return t;
        });
        const tileFb = h.el('p', { class: 'giauque-note', 'aria-live': 'polite' });
        const ans = H.answer({
          label: '据此估计每个 H₂O 分子的冻结构型数 W（Pauling 近似；容差 ±0.02）', placeholder: 'W',
          check: (v) => {
            if (Math.abs(v - 1.5) <= 0.02) return { ok: true, msg: `对：$W = 3/2$，$R\\ln W = ${(R * Math.log(1.5)).toFixed(2)}$ J K⁻¹ mol⁻¹，而测得 $3.43 \\pm 0.2$。` };
            if (Math.abs(v - 4) < 0.05) return { ok: false, msg: '这是没有冰规则时每个分子的排法（2 个 H × 2 个位置）。约束还没用上。' };
            if (Math.abs(v - 0.375) < 0.01) return { ok: false, msg: '6/16 是一个 O “合规”的概率；还要乘上每个分子贡献的无约束排法数。' };
            if (Math.abs(v - 6) < 0.05) return { ok: false, msg: '6 是一个 O 周围合规的局部排法数，但相邻 O 共享 H，不能直接把 6 当成每个分子的自由度。' };
            if (Math.abs(v - 1.65) < 0.03) return { ok: false, msg: '这是 4×4 小格子的精确值（有限尺寸），Pauling 的估计用的是独立约束近似。' };
            return { ok: false, msg: '不对。总数 $2^{2N}$ 乘以每个 O 的合规概率的 N 次方，再开 N 次方。' };
          },
          onOk: () => api.done('<b>冰的残余熵 = 质子无序</b>：Pauling (1935) 用“冰规则”数出 $W = 3/2$，$R\\ln\\frac32 = 3.37$ J K⁻¹ mol⁻¹；Giauque &amp; Stout (1936) 量热测得 $3.43 \\pm 0.2$。冰在 0 K 也不是唯一的基态——宏观简并，是第三定律的一个精彩“例外”。'),
        });
        sec.append(
          h.el('h4', { text: '数一数' }),
          h.el('p', { class: 'giauque-note', html: '单个 O 周围 4 条键上的 H，每个可近可远，共 16 种排法。点击把<b>满足冰规则</b>的排法标出来，再核对。' }),
          h.el('div', { class: 'giauque-tiles' }, tiles),
          h.el('div', {}, [h.button({ label: '核对标记', onClick: () => {
            const good = [...Array(16).keys()].filter((m) => popcount(m) === 2), wrong = [...marked].filter((m) => popcount(m) !== 2).length, miss = good.filter((m) => !marked.has(m)).length;
            tileFb.innerHTML = !wrong && !miss ? '对：16 种里有 <b>6</b> 种合规。' : `还不对：${wrong} 个标错，${miss} 个漏标。`;
          } })]),
          tileFb,
          h.el('p', { class: 'giauque-note', html: '想一想：N 个分子共有几个 H？每个 H 几个位置？每个 O 的合规比例是多少？若把各 O 的约束看作独立……' }),
          ans.el,
        );

        function flip(i) { b[i] ^= 1; sel = i; sS.set(i + 1); update(); }
        function update() {
          const vs = viols(b);
          roV.set(vs.length + ' / ' + N);
          roH.set(vs.filter((x) => x[1] > 2).length + ' / ' + vs.filter((x) => x[1] < 2).length);
          if (!vs.length && !solved) { solved = true; sec.hidden = false; api.typeset(sec); api.say('冰规则全部满足！注意：满足规则的构型远不止一个——你随手就能再翻出别的。下面来数。', 'good'); }
          draw();
        }
        let geo = null;
        function layout() {
          const W = cv.w, Hh = cv.h, s = Math.min((W - 24) / L, (Hh - 24) / L);
          return { s, x0: (W - s * L) / 2, y0: (Hh - s * L) / 2 };
        }
        const P = (v) => [geo.x0 + geo.s * ((v % L) + 0.5), geo.y0 + geo.s * (Math.floor(v / L) + 0.5)];
        // segments for bond i: list of [ax,ay,bx,by]; H position
        function bondGeo(i) {
          const horiz = i < N, v = i % N, [x, y] = P(v), s = geo.s, dx = horiz ? 1 : 0, dy = horiz ? 0 : 1;
          const wrap = horiz ? v % L === L - 1 : Math.floor(v / L) === L - 1;
          const segs = wrap ? [[x, y, x + dx * s / 2, y + dy * s / 2], [x - dx * s * (L - 0.5), y - dy * s * (L - 0.5), x - dx * s * (L - 1), y - dy * s * (L - 1)]] : [[x, y, x + dx * s, y + dy * s]];
          const d = 0.28 * s;
          const hp = b[i] === 0 ? [x + dx * d, y + dy * d] : wrap ? [x - dx * (s * (L - 1) + d), y - dy * (s * (L - 1) + d)] : [x + dx * (s - d), y + dy * (s - d)];
          return { segs, hp };
        }
        function draw() {
          geo = layout();
          const g = cv.g, W = cv.w, Hh = cv.h, vs = new Map(viols(b));
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          g.strokeStyle = C('--grid'); g.setLineDash([3, 3]); g.strokeRect(geo.x0, geo.y0, geo.s * L, geo.s * L); g.setLineDash([]);
          for (let i = 0; i < 2 * N; i++) {
            const { segs, hp } = bondGeo(i);
            g.strokeStyle = i === sel ? C('--accent') : C('--line'); g.lineWidth = i === sel ? 3 : 1.5;
            segs.forEach(([a, c, e, f]) => { g.beginPath(); g.moveTo(a, c); g.lineTo(e, f); g.stroke(); });
            g.fillStyle = C('--s2'); g.beginPath(); g.arc(hp[0], hp[1], Math.max(3, geo.s * 0.07), 0, 6.283); g.fill();
          }
          for (let v = 0; v < N; v++) {
            const [x, y] = P(v), r = geo.s * 0.14, n = vs.get(v);
            g.fillStyle = C('--panel'); g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
            g.lineWidth = n == null ? 1.8 : 3.2; g.strokeStyle = n == null ? C('--fg') : n > 2 ? C('--warn') : C('--s1'); g.stroke();
            if (n != null) { g.fillStyle = g.strokeStyle; g.font = '11px ' + (C('--mono-font') || 'monospace'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n > 2 ? '+' + (n - 2) : String(n - 2), x, y); }
          }
        }
        function onPtr(e) {
          const r = cv.canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
          let best = -1, bd = 1e9;
          for (let i = 0; i < 2 * N; i++) bondGeo(i).segs.forEach(([a, c, e2, f]) => {
            const vx = e2 - a, vy = f - c, t = Math.max(0, Math.min(1, ((px - a) * vx + (py - c) * vy) / (vx * vx + vy * vy))), d = Math.hypot(a + t * vx - px, c + t * vy - py);
            if (d < bd) { bd = d; best = i; }
          });
          if (best >= 0 && bd < geo.s * 0.3) flip(best);
        }
        cv.canvas.addEventListener('pointerdown', onPtr);
        cv.onResize(draw);
        const un = watchTheme(draw);
        update();
        return { destroy() { cv.destroy(); un(); cv.canvas.removeEventListener('pointerdown', onPtr); } };
      },
    };
  }

  /* ---------- Stage 3: adiabatic demagnetization ---------- */
  const MUB = 9.274e-24, KB = 1.380649e-23, J = 3.5, BINT = 0.13, CX = (2 * MUB) / KB;
  const lnsinh = (a) => (a > 20 ? a - Math.LN2 : Math.log(Math.sinh(a)));
  const coth = (a) => (a > 20 ? 1 : 1 / Math.tanh(a));
  const Jz = (x) => { x = Math.max(x, 1e-9); return ((2 * J + 1) / 2) * coth(((2 * J + 1) * x) / 2) - 0.5 * coth(x / 2); };
  const Sx = (x) => { x = Math.max(x, 1e-9); return lnsinh(((2 * J + 1) * x) / 2) - lnsinh(x / 2) - x * Jz(x); };
  const Beff = (B) => Math.hypot(B, BINT);
  const Sm = (T, B) => Sx((CX * Beff(B)) / T);
  const xOfS = (s) => { let a = Math.log(1e-6), c = Math.log(400); for (let i = 0; i < 60; i++) { const m = (a + c) / 2; if (Sx(Math.exp(m)) > s) a = m; else c = m; } return Math.exp((a + c) / 2); };
  const TofS = (s, B) => (CX * Beff(B)) / xOfS(s);
  const SMAX = Math.log(8), TBATH = 1.5;

  function stage3() {
    return {
      title: '低于 1 K',
      task: `<p>1926 年，Giauque（与 Debye 独立地）提出：液氦抽气最多降到 ~1 K，可顺磁盐里的电子自旋在 1 K 时几乎完全无序，熵还很大。能不能用磁场<b>把自旋的熵挤出来</b>，借此再降一个数量级？</p>
<p>你的装置：一块硫酸钆 Gd₂(SO₄)₃·8H₂O，经一个<b>热开关</b>（氦交换气）与 1.5 K 的液氦浴相连；外加一个可缓慢升降的磁体（≤ 1 T）。低于 2 K 晶格熵可忽略，只剩 Gd³⁺ 自旋的熵。系统有微弱漏热。</p>
<p><b>目标：让盐的温度降到 0.3 K 以下。</b>开关和磁场的操作顺序由你决定。</p>`,
      hints: [
        '看 S–T 图：每条曲线是一个固定场。热开关闭合时，盐的温度被钉在浴温（竖直走）；开关断开时，熵不变（水平走）。要到左边去，只能水平走。',
        '要水平向左走到低温，起点必须在一条“低熵”的曲线上——高场下的熵小。在 1.5 K 下怎样把熵降下来，而又不让盐升温？',
        '顺序：开关闭合 → 缓慢升场到 ~0.8 T（磁化放出的热 Q = TΔS 被浴带走）→ 断开开关 → 缓慢降场到 0。',
      ],
      answer: `Carnot 式的两步：(1) <b>等温磁化</b>：热开关闭合，在 1.5 K 下升场至 0.8 T，自旋排齐、熵从 $S/R \\approx 2.04$ 降到 1.32，放出 $Q = T\\Delta S \\approx 9$ J/mol 给氦浴；(2) <b>绝热去磁</b>：断开热开关，再降场。熵只依赖 $x = g\\mu_B B_{\\rm eff}/kT$，所以 $B_{\\rm eff}/T$ 不变：$T_f = 1.5\\,{\\rm K} \\times 0.13/\\sqrt{0.8^2 + 0.13^2} \\approx 0.24$ K。Giauque & MacDougall 1933 年 3 月首次实现，约 0.25 K。`,
      build(body, api) {
        const h = H, ctx = api._ctx, C = (n) => ctx.color(n);
        const SIM = 10, RAMP = 0.02, TAU = 1, LEAK = 0.3e-3; // sim-s per wall-s; T/s; s; W/mol
        const st = { T: TBATH, B: 0, Bt: 0, sw: true, s: Sm(TBATH, 0), Q: 0, Bmax: 0, minT: TBATH, path: [[TBATH, Sm(TBATH, 0)]], last: '' };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.6, minH: 230, maxH: 370 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const tSw = h.toggle({ label: '热开关闭合（接触 1.5 K 氦浴）', value: true, onChange: (v) => { st.sw = v; wake(); } });
        const sB = h.slider({ label: '目标磁场（磁体缓慢跟随）', min: 0, max: 1, step: 0.01, value: 0, format: (v) => v.toFixed(2) + ' T', onInput: (v) => { st.Bt = v; wake(); } });
        const setB = (v) => { st.Bt = v; sB.set(v); wake(); };
        const bt = h.el('div', { class: 'ctl' }, [h.el('div', {}, [
          h.button({ label: '缓慢升场 → 0.8 T', onClick: () => setB(0.8) }),
          h.button({ label: '缓慢降场 → 0', onClick: () => setB(0) }),
          h.button({ label: '重来', onClick: reset }),
        ])]);
        ctl.append(tSw.el, sB.el, bt);
        const roW = h.el('div', { class: 'lab-readout' });
        const ro = { T: h.readout('盐温 T'), S: h.readout('自旋熵 S/R'), B: h.readout('磁场 B'), Q: h.readout('累计交给浴的热'), m: h.readout('最低温度') };
        Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);

        const bonus = h.el('div', { class: 'giauque-sec' });
        bonus.append(h.el('h4', { text: '附加题（不影响过关）' }),
          h.el('p', { class: 'giauque-note', html: '模型：Gd³⁺ 当作理想顺磁体，$J = 7/2,\\ g = 2$，外加一个小的有效内场 $b = 0.13$ T（模型参数，代表离子间相互作用），$B_{\\rm eff} = \\sqrt{B^2 + b^2}$。配分函数只通过 $x = g\\mu_B B_{\\rm eff}/kT$ 依赖 B 与 T。' }),
          H.answer({
            label: '从 1.5 K、0.8 T 出发理想绝热去磁到 B = 0，终温 $T_f$ ≈ ?（容差 ±0.02 K）', unit: 'K', placeholder: 'T_f',
            check: (v) => {
              if (Math.abs(v - 0.2406) <= 0.02) return { ok: true, msg: '对：S 只依赖 x，绝热 ⇒ $B_{\\rm eff}/T$ 守恒，$T_f = 1.5 \\times 0.13/\\sqrt{0.8^2 + 0.13^2} = 0.241$ K。内场 b 决定了能降到多低：b → 0 时理论上可到 0 K，现实中自旋间相互作用设定了极限。' };
              if (Math.abs(v - 0.244) < 0.003) return { ok: true, msg: '对（忽略了 b² 在分母中的小修正）：$T_f \\approx 1.5 \\times 0.13/0.8$。' };
              if (v < 0.01) return { ok: false, msg: '没有内场时才会到 0 K。b 在 B = 0 时还在。' };
              return { ok: false, msg: '不对。绝热 ⇒ S 不变 ⇒ x 不变。' };
            },
          }).el);
        body.append(bonus);

        function reset() { Object.assign(st, { T: TBATH, B: 0, Bt: 0, sw: true, s: Sm(TBATH, 0), Q: 0, Bmax: 0, minT: TBATH, path: [[TBATH, Sm(TBATH, 0)]], last: '' }); tSw.set(true); sB.set(0); wake(); }
        function say(key, html, kind) { if (st.last === key || api.solved()) return; st.last = key; api.say(html, kind); }
        function step(dtw) {
          const dt = dtw * SIM; let moved = false; const dir = Math.sign(st.Bt - st.B);
          if (dir) { st.B += dir * Math.min(Math.abs(st.Bt - st.B), RAMP * dt); moved = true; }
          let T = TofS(st.s, st.B);
          if (st.sw) {
            const Tn = T + (TBATH - T) * (1 - Math.exp(-dt / TAU)), sn = Sm(Tn, st.B);
            if (Math.abs(sn - st.s) > 1e-7) moved = true;
            st.Q += -R * 0.5 * (T + Tn) * (sn - st.s); st.s = sn; T = Tn;
          } else { st.s = Math.min(SMAX - 1e-6, st.s + (LEAK * dt) / (R * T)); T = TofS(st.s, st.B); moved = moved || dt > 0; }
          st.T = T; st.minT = Math.min(st.minT, T); st.Bmax = st.sw ? Math.max(st.Bmax, st.B) : st.Bmax;
          if (moved) {
            const l = st.path[st.path.length - 1];
            if (Math.abs(Math.log(l[0] / T)) > 0.004 || Math.abs(l[1] - st.s) > 0.004) st.path.push([T, st.s]);
            if (st.path.length > 3000) st.path.splice(0, 1000);
          }
          // feedback
          if (T < 0.3 && !api.solved()) api.done(`<b>绝热去磁（Giauque &amp; MacDougall, 1933）</b>：先在浴温下用磁场把自旋排齐，把它们的熵 $T\\Delta S$ 作为热交给氦浴；再隔热降场，自旋只能从晶格“借”热重新变乱，温度骤降——你到了 ${T.toFixed(2)} K。1933 年 3 月他们用硫酸钆实际达到约 0.25 K，首次突破 1 K。所有能降低熵的“开关”参数（磁场、压力……）都可这样制冷，而第三定律说：每次循环能挤出的熵在 T → 0 时也趋于 0，所以 0 K 只能逼近，到不了。`);
          else if (!st.sw && dir > 0 && T > TBATH + 0.08) say('heatup', '盐在升温：开关断开时磁化放出的热无处可去，熵不变，自旋排齐的“代价”全变成了盐的温度。', 'bad');
          else if (st.sw && dir < 0 && st.B < st.Bmax - 0.15) say('pulled', '盐被浴拉回 1.5 K：开关闭着降场，自旋重新变乱所需的热直接从氦浴流进来——熵又回去了，温度纹丝不动。', 'bad');
          else if (!st.sw && dir < 0 && st.s > Sm(TBATH, 0) - 0.03 && T > 0.5) say('noent', '开关断开降场：但盐的熵从来没被减少过，绝热降场只能把它带回原来的温度。熵得先交出去。', 'bad');
          else if (st.sw && !dir && st.B > 0.5 && Math.abs(T - TBATH) < 0.01) say('iso', `等温磁化完成：S/R 从 ${Sm(TBATH, 0).toFixed(2)} 降到 ${st.s.toFixed(2)}，放给浴 Q ≈ ${st.Q.toFixed(1)} J/mol。`, 'info');
          else if (!dir && st.B < 0.01 && !st.sw && T >= 0.3 && T < 1.2) say('notcold', `降到了 ${T.toFixed(2)} K，还不够冷。起点的熵还不够低。`, 'info');
          return moved;
        }
        const LT0 = Math.log10(0.05), LT1 = Math.log10(5), lg = (T) => Math.log10(Math.min(5, Math.max(0.05, T)));
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: LT0, x1: LT1, y0: 0, y1: 2.15, pad: { l: 44, r: 12, t: 12, b: 34 }, xTicks: [0.05, 0.1, 0.2, 0.5, 1, 2, 5].map(Math.log10), yTicks: [0, 0.5, 1, 1.5, 2], fmtX: (v) => String(+(10 ** v).toPrecision(2)), fmtY: (v) => v.toFixed(1), xLabel: 'T (K, 对数)', yLabel: 'S / R' }, C);
          // goal zone
          g.fillStyle = C('--good'); g.globalAlpha = 0.12; g.fillRect(ax.X(LT0), ax.p.t, ax.X(lg(0.3)) - ax.X(LT0), ax.ih); g.globalAlpha = 1;
          g.font = '10.5px ' + mono; g.fillStyle = C('--good'); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('目标 T < 0.3 K', ax.X(LT0) + 4, ax.p.t + 14);
          g.setLineDash([4, 4]); g.strokeStyle = C('--muted'); g.beginPath(); g.moveTo(ax.X(LT0), ax.Y(SMAX)); g.lineTo(ax.X(LT1), ax.Y(SMAX)); g.stroke();
          g.setLineDash([2, 3]); g.beginPath(); g.moveTo(ax.X(lg(TBATH)), ax.p.t); g.lineTo(ax.X(lg(TBATH)), ax.p.t + ax.ih); g.stroke(); g.setLineDash([]);
          g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('ln 8', ax.X(LT1) - 34, ax.Y(SMAX) - 2);
          g.textAlign = 'center'; g.fillText('氦浴', ax.X(lg(TBATH)), ax.Y(0) - 2);
          [[0, '--s1'], [0.2, '--s2'], [0.4, '--s3'], [0.8, '--s4']].forEach(([B, col]) => {
            g.strokeStyle = C(col); g.lineWidth = 1.5; g.beginPath();
            for (let i = 0; i <= 160; i++) { const lt = LT0 + ((LT1 - LT0) * i) / 160, s = Sm(10 ** lt, B); i ? g.lineTo(ax.X(lt), ax.Y(s)) : g.moveTo(ax.X(lt), ax.Y(s)); }
            g.stroke();
            const sl = { 0: 1.6, 0.2: 1.2, 0.4: 0.8, 0.8: 0.4 }[B]; let lt = LT0; for (let i = 0; i <= 160; i++) { lt = LT0 + ((LT1 - LT0) * i) / 160; if (Sm(10 ** lt, B) > sl) break; }
            g.fillStyle = C(col); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(B.toFixed(1) + ' T', ax.X(lt) + 5, ax.Y(sl) + 2);
          });
          g.strokeStyle = C('--accent'); g.lineWidth = 2; g.beginPath();
          st.path.forEach(([T, s], i) => (i ? g.lineTo(ax.X(lg(T)), ax.Y(s)) : g.moveTo(ax.X(lg(T)), ax.Y(s)))); g.stroke();
          g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.beginPath(); g.arc(ax.X(lg(st.T)), ax.Y(st.s), 5.5, 0, 6.283); g.fill(); g.stroke();
        }
        function readouts() {
          ro.T.set(st.T.toFixed(3) + ' K'); ro.S.set(st.s.toFixed(3));
          ro.B.set(st.B.toFixed(2) + ' T' + (st.B !== st.Bt ? (st.Bt > st.B ? ' ↑' : ' ↓') : ''));
          ro.Q.set(st.Q.toFixed(2) + ' J/mol'); ro.m.set(st.minT.toFixed(3) + ' K');
        }
        let dirty = true, idle = 0;
        const lp = h.loop((dt) => {
          const moved = step(dt);
          if (moved || dirty) { draw(); readouts(); dirty = false; idle = 0; } else idle += dt;
          if (idle > 0.5 && st.sw) lp.stop(); // nothing changes until the next input
        });
        function wake() { dirty = true; if (!lp.running) lp.start(); }
        cv.onResize(() => { draw(); });
        const un = watchTheme(draw);
        draw(); readouts(); lp.start();
        return { destroy() { lp.stop(); cv.destroy(); un(); } };
      },
    };
  }

  CHALLENGES.giauque = {
    title: '通往绝对零度',
    mount(root, ctx) {
      injectStyle();
      const stages = [stage1(), stage2(), stage3()];
      stages.forEach((s) => { const b = s.build; s.build = (body, api) => { api._ctx = ctx; return b(body, api); }; });
      return H.stages(root, ctx, stages);
    },
  };
})();
