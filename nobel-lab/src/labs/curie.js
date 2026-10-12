/* 测量放射性：寻找隐藏元素 — Nobel Chemistry 1911 (Marie Curie: radium & polonium, isolation of radium)
 * Part A — Curie 1898 (C. R. 126, 1101): ionisation current between condenser plates, balanced with the Curie
 *   brothers' piezoelectric quartz. Her table (units 10⁻¹¹ A): U metal 2.3, U₃O₈ 1.8, uranyl nitrate 0.7,
 *   ThO₂ (0.25 mm layer) 2.2, natural chalcolite 5.2, synthetic chalcolite 0.9, pitchblende 6.5–8.3.
 *   Uranium mass fractions from formulas: U₃O₈ 714/842 = 0.848, UO₂(NO₃)₂·6H₂O 238/502 = 0.474,
 *   Cu(UO₂)₂(PO₄)₂·~10H₂O ≈ 0.49, pitchblende ~0.65 (variable). Activities below are rounded/illustrative,
 *   nitrate & U₃O₈ placed on the proportional line as Curie concluded (her nitrate was a thin layer).
 * Part B — fractional crystallisation of (Ba,Ra)Cl₂: RaCl₂ is less soluble, so crystals are enriched.
 *   Specific activities: ²²⁶Ra 3.66e10 Bq/g, ²³⁸U 1.24e4 Bq/g → Ra/U ≈ 2.95e6 per gram;
 *   RaCl₂ (M = 226 + 70.9 = 296.9) → ×226/296.9 ≈ 2.25e6. (Daughters and ²³⁴U ignored: order-of-magnitude.)
 *   Apparent atomic weight from AgCl titration: Ā = Σ nᵢAᵢ / Σ nᵢ (Ba 137.33, Ra 226); Curie 1902: 225.
 *   Ra II lines (Demarçay 1898): 381.44, 434.06, 468.23 nm; Ba II 455.40, 493.41, 614.17 nm, Ba I 553.55 nm.
 */
(() => {
  const I_U = 23;                                  // pA for U metal (Curie's 2.3×10⁻¹¹ A; geometry-specific)
  const SAMPLES = [
    { id: 'U', name: '金属铀 U', short: 'U', fu: 1.0, act: 1.0 },
    { id: 'U3O8', name: '氧化铀 U₃O₈', short: 'U₃O₈', fu: 0.848, act: 0.83 },
    { id: 'nit', name: '硝酸铀酰', short: '硝酸铀酰', fu: 0.474, act: 0.46 },
    { id: 'syn', name: '人工铜铀云母', short: '人工铜铀云母', fu: 0.49, act: 0.39 },
    { id: 'chal', name: '天然铜铀云母', short: '天然铜铀云母', fu: 0.49, act: 2.26, ore: true },
    { id: 'pb', name: '沥青铀矿', short: '沥青铀矿', fu: 0.65, act: 3.6, ore: true },
    { id: 'Th', name: '钍化合物 ThO₂', short: 'ThO₂：钍也有放射性', fu: 0.0, act: 0.96, th: true },
  ];
  const RA_U = 3.66e10 / 1.24e4, MRA = 226, MBA = 137.33, MCL2 = 70.9;
  const A_RACL2 = RA_U * MRA / (MRA + MCL2);
  const RA_LINES = [381.44, 434.06, 468.23], BA_LINES = [455.40, 493.41, 553.55, 614.17];
  const BA0 = 2e6, RA0 = 0.5, KEEP_BA = 0.5;      // start: ~2 t of residue holding ~0.5 g Ra (illustrative; Ra/U ≈ 3.4e-7 by mass)
  /* one step: crystals keep half the bulk (treated as BaCl₂ carrier) and a fraction k·KEEP_BA of the RaCl₂ (k = enrichment/step) */
  const step = (s, k) => ({ ba: s.ba * KEEP_BA, ra: s.ra * Math.min(1, k * KEEP_BA), n: s.n + 1 });
  const actPerGram = (s) => (A_RACL2 * s.ra) / (s.ra + s.ba);                // relative to U metal
  const raMole = (s) => (s.ra / (MRA + MCL2)) / (s.ra / (MRA + MCL2) + s.ba / (MBA + MCL2));
  const atomicWeight = (s) => { const y = raMole(s); return y * MRA + (1 - y) * MBA; };

  LABS.curie = {
    title: '测量放射性：寻找隐藏元素',
    _m: { SAMPLES, RA_U, A_RACL2, step, actPerGram, raMole, atomicWeight, BA0, RA0 },
    mount(root, ctx) {
      const h = ctx.h, col = ctx.color, mono = () => col('--mono-font') || 'monospace';
      let part = 'A', sel = 'pb', meas = 0, needle = 0, target = 0;   // meas: measurement animation time left (s)
      const measured = new Map();                                       // id -> activity reading
      let ions = [];
      let k = 1.9, hist = [{ ba: BA0, ra: RA0, n: 0 }], auto = 0;

      const stage = h.el('div', { class: 'lab-stage' });
      const wA = h.el('div'), wB = h.el('div');
      stage.append(wA, wB);
      const cvBench = h.canvas(wA, { aspect: 0.4, minH: 160, maxH: 230 });
      const cvSc = h.canvas(wA, { aspect: 0.55, minH: 210, maxH: 340 });
      const cvLog = h.canvas(wB, { aspect: 0.58, minH: 220, maxH: 360 });
      const cvSp = h.canvas(wB, { aspect: 0.18, minH: 92, maxH: 120 });
      const controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint' });
      root.append(stage, controls, readout, hint);

      /* ---------- controls ---------- */
      const cPart = h.choice({ label: '实验', value: 'A', options: [{ value: 'A', label: 'A 静电计测量' }, { value: 'B', label: 'B 分离与富集' }],
        onChange: (v) => { part = v; show(); } });
      const cSam = h.choice({ label: '样品', value: sel, options: SAMPLES.map((s) => ({ value: s.id, label: s.name })),
        onChange: (v) => { sel = v; needle = target = measured.get(v) || 0; drawA(); } });
      const bMeas = h.button({ label: '测量', kind: 'primary', onClick: measure });
      const bClr = h.button({ label: '清空图', onClick: () => { measured.clear(); drawA(); } });
      const sK = h.slider({ label: '每步富集倍数', min: 1.5, max: 1.98, step: 0.02, value: k, format: (v) => '×' + v.toFixed(2),
        onInput: (v) => { k = v; } });
      const b1 = h.button({ label: '再结晶一次', kind: 'primary', onClick: () => recryst(1) });
      const b10 = h.button({ label: '自动 ×10', onClick: () => recryst(10) });
      const bR = h.button({ label: '重来', onClick: () => { hist = [hist[0]]; auto = 0; lpAuto.stop(); drawB(); } });
      const ctlA = h.el('div', { style: 'display:contents' }, [cSam.el, bMeas, bClr]);
      const ctlB = h.el('div', { style: 'display:contents' }, [sK.el, b1, b10, bR]);
      controls.append(cPart.el, ctlA, ctlB);

      const rI = h.readout('电离电流（示意，金属铀 ≈ 23 pA）'), rAct = h.readout('相对活度 A/A_U'), rExp = h.readout('按含铀量预期 A = w_U');
      const rStep = h.readout('结晶次数'), rMass = h.readout('剩余富集物质量'), rAB = h.readout('每克活度 / 铀'),
        rRa = h.readout('其中 RaCl₂ / 纯度'), rAw = h.readout('表观原子量（AgCl 法）');
      const roA = h.el('div', { style: 'display:contents' }, [rI.el, rAct.el, rExp.el]);
      const roB = h.el('div', { style: 'display:contents' }, [rStep.el, rMass.el, rAB.el, rRa.el, rAw.el]);
      readout.append(roA, roB);

      function show() {
        const a = part === 'A';
        ctlA.style.display = roA.style.display = a ? 'contents' : 'none';
        ctlB.style.display = roB.style.display = a ? 'none' : 'contents';
        wA.style.display = a ? '' : 'none'; wB.style.display = a ? 'none' : '';
        hint.textContent = a
          ? '依次测量各样品：铀的化合物都落在“活度 ∝ 含铀量”的直线上，与化学形态无关——放射性是原子的性质。但天然沥青铀矿、铜铀云母远高于直线，人工合成的同成分晶体却不会：矿里藏着比铀强得多的新元素。'
          : '每次再结晶，RaCl₂ 比 BaCl₂ 更难溶、优先析出：晶体质量减半，镭却大多留下。约 30 次后每克活度从 ~1 升到 ~2×10⁶ 倍铀，镭谱线出现、原子量升向 226。把富集倍数调低，镭会在母液里大量流失。居里 1902 年从数吨残渣得到约 0.1 g RaCl₂。';
        if (a) drawA(); else drawB();
      }

      /* ---------- Part A ---------- */
      const S = (id) => SAMPLES.find((s) => s.id === id);
      function measure() {
        const s = S(sel);
        target = s.act * (1 + 0.04 * (Math.random() - 0.5));            // small reading scatter
        if (ctx.reduced) { needle = target; measured.set(sel, target); drawA(); return; }
        meas = 1.4; ions = []; lpA.start();
      }
      const lpA = h.loop((dt) => {
        const s = S(sel);
        needle += (target - needle) * Math.min(1, dt * 4);
        if (meas > 0) {
          meas -= dt;
          for (let r = s.act * 60 * dt; r > 0; r--) if (Math.random() < r) ions.push({ x: Math.random(), y: 0, v: 0.8 + Math.random(), life: 0 });
          if (meas <= 0) measured.set(sel, target);
        }
        ions.forEach((p) => { p.y += p.v * dt * 1.4; p.life += dt; });
        ions = ions.filter((p) => p.y < 1);
        drawA();
        if (meas <= 0 && !ions.length && Math.abs(target - needle) < 1e-3) lpA.stop();
      });

      function drawBench() {
        const g = cvBench.g, W = cvBench.w, Hh = cvBench.h, s = S(sel);
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const px = 16, pw = Math.min(W * 0.5, 280), top = Hh * 0.25, bot = Hh * 0.72;
        g.font = '11px ' + mono(); g.textBaseline = 'middle';
        // plates
        g.fillStyle = col('--line'); g.fillRect(px, top - 6, pw, 6); g.fillRect(px, bot, pw, 6);
        g.fillStyle = col('--muted'); g.textAlign = 'left';
        g.fillText('接静电计 + 压电石英', px, top - 16); g.fillText('+100 V 电池', px, bot + 18);
        // sample layer
        g.fillStyle = s.ore ? col('--warn') : s.th ? col('--s3') : col('--s2'); g.globalAlpha = 0.8;
        g.fillRect(px + pw * 0.12, bot - 5, pw * 0.76, 5); g.globalAlpha = 1;
        // ionisation tracks (sparks) in the air gap
        g.strokeStyle = col('--accent'); g.lineWidth = 1.5;
        const tracks = ctx.reduced && measured.has(sel) ? Array.from({ length: Math.round(6 * s.act) }, (_, i) => ({ x: (i * 0.618) % 1, y: 0.3 + 0.6 * ((i * 0.37) % 1), life: 0.1 })) : ions;
        for (const p of tracks) {
          const x = px + pw * (0.12 + 0.76 * p.x), y = bot - 5 - (bot - top - 5) * p.y;
          g.globalAlpha = Math.max(0, 1 - p.life * 1.2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 9); g.stroke();
          g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fillStyle = col('--accent'); g.fill();
        }
        g.globalAlpha = 1; g.fillStyle = col('--fg'); g.textAlign = 'center';
        g.fillText(s.name, px + pw / 2, (top + bot) / 2 - 2);
        // electrometer dial
        const cx = Math.min(W - 70, px + pw + (W - px - pw) / 2), cy = bot + 4, R = Math.min(62, (W - px - pw) / 2 - 12, Hh * 0.55);
        const amax = 4.4, ang = (a) => Math.PI + (Math.min(a, amax) / amax) * Math.PI;
        g.strokeStyle = col('--line'); g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, Math.PI, 2 * Math.PI); g.stroke();
        g.font = '10px ' + mono(); g.fillStyle = col('--muted');
        for (let a = 0; a <= 4; a++) {
          const t = ang(a); g.beginPath(); g.moveTo(cx + R * Math.cos(t), cy + R * Math.sin(t)); g.lineTo(cx + (R - 6) * Math.cos(t), cy + (R - 6) * Math.sin(t)); g.stroke();
          g.fillText(String(Math.round(a * I_U)), cx + (R - 16) * Math.cos(t), cy + (R - 16) * Math.sin(t));
        }
        const t = ang(needle); g.strokeStyle = col('--s1'); g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (R - 4) * Math.cos(t), cy + (R - 4) * Math.sin(t)); g.stroke();
        g.fillStyle = col('--fg'); g.fillText(`${(needle * I_U).toFixed(1)} pA`, cx, cy + 14);
        g.fillStyle = col('--muted'); g.fillText('电离电流', cx, cy - R - 10);
      }
      function drawScatter() {
        const g = cvSc.g, W = cvSc.w, Hh = cvSc.h;
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: 0, x1: 1.05, y0: 0, y1: 4.2, pad: { l: 40, r: 12, t: 12 }, xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 1, 2, 3, 4],
          fmtX: (v) => v.toFixed(2), xLabel: '含铀质量分数 w_U', yLabel: '活度 / 金属铀' }, col);
        g.strokeStyle = col('--s1'); g.setLineDash([5, 4]); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(A.X(0), A.Y(0)); g.lineTo(A.X(1.05), A.Y(1.05)); g.stroke(); g.setLineDash([]);
        g.font = '11px ' + col('--body-font'); g.fillStyle = col('--s1'); g.textAlign = 'right'; g.textBaseline = 'bottom';
        g.fillText('A ∝ 含铀量', A.X(1.03), A.Y(1.05) - 4);
        let oreSeen = false;
        for (const s of SAMPLES) {
          if (!measured.has(s.id)) continue;
          const a = measured.get(s.id), x = A.X(s.fu), y = A.Y(a);
          oreSeen = oreSeen || s.ore;
          g.fillStyle = s.ore ? col('--warn') : s.th ? col('--s3') : col('--s2');
          g.beginPath(); g.arc(x, y, s.id === sel ? 6 : 4.5, 0, 7); g.fill();
          if (s.ore) { g.strokeStyle = col('--warn'); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x, A.Y(s.fu)); g.stroke(); g.setLineDash([]); }
          g.fillStyle = col('--fg'); g.font = '11px ' + col('--body-font'); g.textBaseline = 'middle';
          const right = x > A.p.l + A.iw * 0.6;
          g.textAlign = right ? 'right' : 'left';
          const dy = s.id === 'syn' ? 10 : s.id === 'nit' ? -10 : 0;
          g.fillText(s.short, x + (right ? -9 : 9), y + dy);
        }
        if (oreSeen) {
          g.fillStyle = col('--warn'); g.font = '12px ' + col('--body-font'); g.textAlign = 'left'; g.textBaseline = 'top';
          g.fillText('矿里藏着比铀更强的东西！', A.p.l + 8, A.p.t + 6);
        }
      }
      function drawA() {
        drawBench(); drawScatter();
        const s = S(sel), m = measured.get(sel);
        rI.set(m != null || meas > 0 ? `${(needle * I_U).toFixed(1)} pA` : '— 按“测量”');
        rAct.set(m != null ? `${m.toFixed(2)}` : '—');
        rExp.set(s.th ? '0（不含铀）' : `${s.fu.toFixed(2)}${m != null ? `  → 实测/预期 = ${(m / s.fu).toFixed(1)}` : ''}`);
      }

      /* ---------- Part B ---------- */
      const fmtMass = (g) => (g >= 1e6 ? `${(g / 1e6).toFixed(2)} t` : g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : g >= 1 ? `${g.toFixed(1)} g` : `${(g * 1000).toFixed(0)} mg`);
      let tick = 0;
      const lpAuto = h.loop((dt) => {                  // auto mode: ~8 recrystallisations per second
        if (auto <= 0) { lpAuto.stop(); return; }
        tick += dt; if (tick >= 0.12) { tick = 0; hist.push(step(hist[hist.length - 1], k)); auto--; drawB(); }
      });
      function recryst(n) {
        if (ctx.reduced || n === 1) { for (let i = 0; i < n; i++) hist.push(step(hist[hist.length - 1], k)); drawB(); return; }
        auto += n; tick = 0.12; lpAuto.start();
      }
      function drawLog() {
        const g = cvLog.g, W = cvLog.w, Hh = cvLog.h, cur = hist[hist.length - 1];
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const nMax = Math.max(30, Math.ceil(cur.n / 10) * 10);
        const A = h.axes(g, W, Hh, { x0: 0, x1: nMax, y0: 0, y1: 7, pad: { l: 40, r: 44, t: 14 }, xTicks: Array.from({ length: nMax / 10 + 1 }, (_, i) => i * 10),
          yTicks: [0, 1, 2, 3, 4, 5, 6, 7], fmtY: (v) => '10' + '⁰¹²³⁴⁵⁶⁷'[v], xLabel: '再结晶次数', yLabel: '每克活度 / 铀' }, col);
        // right axis: mass in g, log 10⁻²…10⁷ g on the same height
        const YM = (m) => A.p.t + A.ih * (1 - (Math.log10(m) + 2) / 9);
        g.font = '10px ' + mono(); g.fillStyle = col('--s2'); g.textAlign = 'left'; g.textBaseline = 'middle';
        [[0.01, '10mg'], [1, '1g'], [1e3, '1kg'], [1e6, '1t']].forEach(([m, t]) => g.fillText(t, A.p.l + A.iw + 4, YM(m)));
        // pure RaCl₂ ceiling
        const yc = A.Y(Math.log10(A_RACL2));
        g.strokeStyle = col('--accent'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(A.p.l, yc); g.lineTo(A.p.l + A.iw, yc); g.stroke(); g.setLineDash([]);
        g.fillStyle = col('--accent'); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.font = '11px ' + col('--body-font');
        g.fillText(`纯 RaCl₂ ≈ ${(A_RACL2 / 1e6).toFixed(1)}×10⁶`, A.p.l + 6, yc - 2);
        const line = (fy, c, dash) => {
          g.strokeStyle = c; g.lineWidth = 2; g.setLineDash(dash ? [5, 3] : []); g.beginPath();
          hist.forEach((s, i) => { const x = A.X(s.n), y = fy(s); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
          g.fillStyle = c; const s = cur; g.beginPath(); g.arc(A.X(s.n), fy(s), 4, 0, 7); g.fill();
        };
        line((s) => YM(s.ba + s.ra), col('--s2'), true);
        line((s) => A.Y(Math.log10(actPerGram(s))), col('--s1'), false);
        g.font = '11px ' + col('--body-font'); g.textBaseline = 'top'; g.textAlign = 'right';
        g.fillStyle = col('--s1'); g.fillText('— 每克活度', A.p.l + A.iw - 6, A.p.t + A.ih - 32);
        g.fillStyle = col('--s2'); g.fillText('-- 晶体质量（右轴）', A.p.l + A.iw - 6, A.p.t + A.ih - 18);
      }
      function drawSpec() {
        const g = cvSp.g, W = cvSp.w, Hh = cvSp.h, y = raMole(hist[hist.length - 1]);
        g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
        const l = 12, r = W - 12, t = 30, b = Hh - 18, X = (nm) => l + ((nm - 370) / (630 - 370)) * (r - l);
        g.fillStyle = '#000'; g.fillRect(l, t, r - l, b - t);
        const ln = (nm, a) => { if (a <= 0.01) return; g.fillStyle = h.wavelengthRGB(nm, Math.min(1, a)); g.fillRect(X(nm) - 1.5, t, 3, b - t); };
        BA_LINES.forEach((nm) => ln(nm, 0.9 * (1 - y) + 0.15));
        const iRa = Math.max(0, Math.min(1, (Math.log10(y) + 4.2) / 3.5));    // weak line visible from y ~ 10⁻⁴
        RA_LINES.forEach((nm, i) => ln(nm, iRa * (i === 0 ? 1.4 : 1)));
        g.font = '10px ' + mono(); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = col('--muted');
        [400, 450, 500, 550, 600].forEach((nm) => g.fillText(String(nm), X(nm), b + 3));
        g.textBaseline = 'bottom'; g.textAlign = 'left';
        g.fillText('德马塞的光谱确认 · 火花光谱 / nm', l, 14);
        if (iRa > 0.05) { g.fillStyle = col('--accent'); g.textAlign = 'center'; g.fillText('Ra 381.4 · 434 · 468', Math.max(l + 58, X(410)), t - 3); }
        g.textAlign = 'right'; g.fillStyle = col('--muted'); if (W > 420) g.fillText('Ba 455 · 493 · 554 · 614', r, t - 3);
      }
      function drawB() {
        drawLog(); drawSpec();
        const s = hist[hist.length - 1], pur = s.ra / (s.ra + s.ba);
        rStep.set(`${s.n}${s.n === 0 ? '（起点：约 2 t 沥青铀矿残渣，含镭约 0.5 g，示意）' : ''}`);
        rMass.set(fmtMass(s.ra + s.ba));
        const a = actPerGram(s);
        rAB.set(`${a >= 1e4 ? a.toExponential(2).replace('e+', '×10^') : a >= 100 ? a.toFixed(0) : a.toPrecision(2)} 倍（log₁₀ = ${Math.log10(a).toFixed(2)}）`);
        rRa.set(`${fmtMass(s.ra)} · ${(pur * 100).toPrecision(pur > 0.01 ? 3 : 2)} %`);
        rAw.set(`${atomicWeight(s).toFixed(1)}（Ba 137.3 → Ra 226；居里 1902 测得 225）`);
      }

      /* ---------- init ---------- */
      for (const id of ['U', 'U3O8', 'nit']) measured.set(id, S(id).act);
      cvBench.onResize(drawA); cvSc.onResize(drawA); cvLog.onResize(drawB); cvSp.onResize(drawB);
      const redraw = () => (part === 'A' ? drawA() : drawB());
      const mo = new MutationObserver(redraw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', redraw);
      show();
      measure();                                        // open by measuring pitchblende: it lands far above the line
      return { destroy() {
        lpA.stop(); lpAuto.stop();
        [cvBench, cvSc, cvLog, cvSp].forEach((c) => c.destroy()); mo.disconnect(); mq.removeEventListener('change', redraw);
      } };
    },
  };
})();
