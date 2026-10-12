/* X 射线透视台 — Nobel Physics 1901 (Wilhelm Conrad Röntgen)
 * 窄束衰减（比尔–朗伯）：T = exp(−Σ (μ/ρ)_m ρ_m ℓ_m)。
 * μ/ρ：NIST XCOM（Hubbell & Seltzer 表，含相干散射，cm²/g），15–150 keV，log–log 插值；吸收边在同一能量处给两行（边下、边上）。
 *   50 keV：水 0.2269，皮质骨（ICRU-44，ρ 1.92）0.4242，铝 0.3681，铅 8.041。
 *   K 边：碘 33.17 keV 6.553 → 35.82；金 80.72 keV 2.137 → 8.904；铅 88.00 keV 1.910 → 7.683。
 * 连续谱（简化）：Kramers 能注量谱 Ψ(E) ∝ (E0 − E)，经 2.5 mm 铝过滤，1 keV 分箱，从 16 keV 起；不含钨的特征线。
 *   荧光屏信号 ∝ 透过的能注量；平均光子能量 ⟨E⟩ = ΣΨ / Σ(Ψ/E)。
 * 手（示意）：软组织 2.5 cm（手指 2.0 cm），掌骨 1.0 cm，指骨 0.8 cm，金戒指 2 mm。
 */
(() => {
  const TAB = {
    water: [[15, 1.673], [20, 0.8096], [30, 0.3756], [40, 0.2683], [50, 0.2269], [60, 0.2059], [80, 0.1837], [100, 0.1707], [150, 0.1505]],
    fat: [[15, 1.083], [20, 0.5677], [30, 0.3063], [40, 0.2396], [50, 0.2123], [60, 0.1974], [80, 0.18], [100, 0.1688], [150, 0.15]],
    bone: [[15, 9.032], [20, 4.001], [30, 1.331], [40, 0.6655], [50, 0.4242], [60, 0.3148], [80, 0.2229], [100, 0.1855], [150, 0.148]],
    al: [[15, 7.955], [20, 3.441], [30, 1.128], [40, 0.5685], [50, 0.3681], [60, 0.2778], [80, 0.2018], [100, 0.1704], [150, 0.1378]],
    cu: [[15, 74.05], [20, 33.79], [30, 10.92], [40, 4.862], [50, 2.613], [60, 1.593], [80, 0.763], [100, 0.4584], [150, 0.2217]],
    i: [[15, 55.12], [20, 25.43], [30, 8.561], [33.1694, 6.553], [33.1694, 35.82], [40, 22.1], [50, 12.32], [60, 7.579], [80, 3.51], [100, 1.942], [150, 0.6978]],
    pb: [[15.8608, 154.8], [20, 86.36], [30, 30.32], [40, 14.36], [50, 8.041], [60, 5.021], [80, 2.419], [88.0045, 1.91], [88.0045, 7.683], [100, 5.549], [150, 2.014]],
    au: [[15, 163.7], [20, 78.83], [30, 27.52], [40, 12.98], [50, 7.256], [60, 4.528], [80, 2.185], [80.7249, 2.137], [80.7249, 8.904], [100, 5.158], [150, 1.86]],
  };
  // thickness in cm internally; unit = display unit
  const MATS = [
    { k: 'water', name: '软组织（水）', rho: 1.0, unit: 'cm', max: 20, step: 0.1, def: 4 },
    { k: 'fat', name: '脂肪', rho: 0.95, unit: 'cm', max: 20, step: 0.1, def: 4 },
    { k: 'bone', name: '皮质骨', rho: 1.92, unit: 'cm', max: 5, step: 0.05, def: 1 },
    { k: 'al', name: '铝', rho: 2.699, unit: 'mm', max: 3, step: 0.01, def: 0.5 },
    { k: 'cu', name: '铜', rho: 8.96, unit: 'mm', max: 0.3, step: 0.001, def: 0.05 },
    { k: 'i', name: '碘', rho: 4.93, unit: 'mm', max: 0.2, step: 0.0005, def: 0.02 },
    { k: 'pb', name: '铅', rho: 11.35, unit: 'mm', max: 0.2, step: 0.0005, def: 0.02 },
    { k: 'au', name: '金', rho: 19.32, unit: 'mm', max: 0.1, step: 0.0005, def: 0.01 },
  ];
  const MAT = Object.fromEntries(MATS.map((m) => [m.k, m]));
  function muRho(k, E) {
    const t = TAB[k]; E = Math.min(Math.max(E, t[0][0]), t[t.length - 1][0]);
    for (let i = 0; i < t.length - 1; i++) {
      const [e0, m0] = t[i], [e1, m1] = t[i + 1];
      if (e1 > e0 && E >= e0 && E <= e1) return m0 * Math.exp((Math.log(m1 / m0) * Math.log(E / e0)) / Math.log(e1 / e0));
    }
    return t[t.length - 1][1];
  }
  const mu = (k, E) => muRho(k, E) * MAT[k].rho; // cm⁻¹
  function spectrum(U) { // [E keV, energy-fluence weight], filtered by 2.5 mm Al
    const out = []; for (let E = 16.5; E < U; E += 1) out.push([E, (U - E) * Math.exp(-mu('al', E) * 0.25)]); return out;
  }
  const meanE = (sp) => { let a = 0, b = 0; for (const [e, w] of sp) { a += w; b += w / e; } return b > 0 ? a / b : NaN; };
  function trans(paths, E, sp) { // sp == null → monoenergetic at E
    const att = (e) => Math.exp(-paths.reduce((a, [k, l]) => a + mu(k, e) * l, 0));
    if (!sp) return att(E);
    let s = 0, w = 0; for (const [e, ww] of sp) { s += ww * att(e); w += ww; } return w > 0 ? s / w : 0;
  }
  function hvl(k, E, sp) { // thickness (cm) with T = 1/2, bisection
    let a = 0, b = 50 / mu(k, sp ? 150 : E); for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (trans([[k, m]], E, sp) > 0.5) a = m; else b = m; }
    return (a + b) / 2;
  }
  const fmtX = (m, cm) => (m.unit === 'mm' ? (cm * 10 < 1 ? (cm * 10).toFixed(cm * 10 < 0.1 ? 3 : 2) : (cm * 10).toFixed(1)) + ' mm' : cm.toFixed(cm < 1 ? 2 : 1) + ' cm');
  const sci = (v) => (v >= 0.01 ? v.toFixed(3) : v.toExponential(1));
  const glow = (T) => { const a = Math.pow(Math.max(0, Math.min(1, T)), 0.6); return `rgb(${Math.round(20 + 166 * a)},${Math.round(24 + 231 * a)},${Math.round(29 + 83 * a)})`; }; // 氰亚铂酸钡的黄绿荧光（物理颜色）

  LABS.rontgen = {
    title: 'X 射线透视台',
    _m: { muRho, mu, spectrum, meanE, trans, hvl },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { mode: 'mono', E: 40, U: 80, mat: 'al', x: 0.5, view: 'T' };
      const stage = h.el('div', { class: 'lab-stage' }), controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
      const tabWrap = h.el('div', { class: 'dtable' });
      const hint = h.el('p', { class: 'lab-hint', text: '把能量从 25 keV 拖到 120 keV：骨头的影子越来越淡，金戒指却一直是黑的。选碘，在 33 keV 两侧来回拖：μ/ρ 跳了 5 倍多（K 吸收边）。切到连续谱，透射曲线在对数坐标里向上弯：厚度越大，剩下的射线越"硬"。' });
      root.append(stage, controls, readout, tabWrap, hint);
      const cvS = h.canvas(stage, { aspect: 0.5, minH: 190, maxH: 300 });
      cvS.canvas.setAttribute('aria-label', '荧光屏上的影子：一只手和所选材料的三级台阶（示意）');
      const cvP = h.canvas(stage, { aspect: 0.52, minH: 200, maxH: 300 });
      cvP.canvas.setAttribute('aria-label', '透射率对厚度，或质量衰减系数对能量');

      const show = (e, b) => { e.style.display = b ? '' : 'none'; }; // .ctl sets display:grid, so the hidden attribute alone would not hide it
      const cMode = h.choice({ label: '射线', value: S.mode, options: [{ value: 'mono', label: '单一能量（简化）' }, { value: 'spec', label: '真实管子的连续谱' }], onChange: (v) => { S.mode = v; show(sE.el, v === 'mono'); show(sU.el, v !== 'mono'); draw(); } });
      const sE = h.slider({ label: '光子能量 E', min: 16, max: 150, step: 0.5, value: S.E, format: (v) => v.toFixed(1) + ' keV', onInput: (v) => { S.E = v; draw(); } });
      const sU = h.slider({ label: '管电压 U（谱的最高能量 eU）', min: 25, max: 150, step: 1, value: S.U, format: (v) => v + ' kV', onInput: (v) => { S.U = v; draw(); } });
      show(sU.el, false);
      const cMat = h.choice({ label: '台阶的材料', value: S.mat, options: MATS.map((m) => ({ value: m.k, label: m.name })), onChange: (v) => { S.mat = v; const m = MAT[v]; S.x = m.def; Object.assign(sX.input, { max: m.max, step: m.step }); sX.set(m.def); draw(); } });
      const sX = h.slider({ label: '台阶厚度 x（三级：x、2x、3x）', min: 0, max: MAT[S.mat].max, step: MAT[S.mat].step, value: S.x, format: (v) => fmtX(MAT[S.mat], v), onInput: (v) => { S.x = v; draw(); } });
      const cView = h.choice({ label: '下图', value: S.view, options: [{ value: 'T', label: '透射率–厚度' }, { value: 'mu', label: 'μ/ρ–能量（NIST）' }], onChange: (v) => { S.view = v; drawPlot(); } });
      controls.append(cMode.el, sE.el, sU.el, cMat.el, sX.el, cView.el);
      const ro = { E: h.readout('能量'), m: h.readout('所选材料 μ/ρ'), mu: h.readout('μ = (μ/ρ)·ρ'), hv: h.readout('半值层'), T: h.readout('透射 T（厚度 x）'), c: h.readout('骨/软组织对比 1 − T骨/T软') };
      Object.values(ro).forEach((r) => readout.append(r.el));

      const spec = () => (S.mode === 'mono' ? null : spectrum(S.U));
      const Eref = (sp) => (sp ? meanE(sp) : S.E); // energy used for table / μ readouts

      function drawScreen(sp) {
        const g = cvS.g, W = cvS.w, Hh = cvS.h, m = MAT[S.mat];
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const sx = 4, sy = 4, sw = W - 8, sh = Hh - 30;
        g.fillStyle = '#07090c'; g.fillRect(sx, sy, sw, sh);
        g.fillStyle = glow(1); g.fillRect(sx + 6, sy + 6, sw - 12, sh - 12); // open field: T = 1
        // hand (left 58%)
        const hx = sx + 6, hy = sy + 6, hw = (sw - 12) * 0.58, hh = sh - 12, P = (u, v) => [hx + u * hw, hy + v * hh];
        const T = (paths) => glow(trans(paths, S.E, sp));
        const F = [[0.335, 0.27], [0.425, 0.16], [0.515, 0.12], [0.605, 0.18]];
        g.save(); g.beginPath(); g.rect(hx, hy, hw, hh); g.clip(); g.lineCap = 'round';
        g.fillStyle = T([['water', 2.5]]); g.beginPath(); const [a0, b0] = P(0.3, 0.55); g.rect(a0, b0, 0.36 * hw, 0.5 * hh); g.fill();
        g.strokeStyle = T([['water', 2.0]]); g.lineWidth = 0.08 * hw;
        F.forEach(([u, v]) => { g.beginPath(); g.moveTo(...P(u, 0.6)); g.lineTo(...P(u, v)); g.stroke(); });
        g.beginPath(); g.moveTo(...P(0.64, 0.78)); g.lineTo(...P(0.82, 0.52)); g.stroke();
        g.lineWidth = 0.032 * hw; g.strokeStyle = T([['water', 1.2], ['bone', 0.8]]);
        F.forEach(([u, v]) => [[v + 0.02, v + 0.12], [v + 0.15, v + 0.27], [v + 0.3, 0.52]].forEach(([p, q]) => { g.beginPath(); g.moveTo(...P(u, p)); g.lineTo(...P(u, q)); g.stroke(); }));
        g.beginPath(); g.moveTo(...P(0.79, 0.56)); g.lineTo(...P(0.73, 0.65)); g.stroke();
        g.strokeStyle = T([['water', 1.5], ['bone', 1.0]]);
        F.forEach(([u]) => { g.beginPath(); g.moveTo(...P(u + (0.48 - u) * 0.15, 0.58)); g.lineTo(...P(u + (0.48 - u) * 0.55, 0.9)); g.stroke(); });
        g.beginPath(); g.moveTo(...P(0.7, 0.69)); g.lineTo(...P(0.6, 0.88)); g.stroke();
        g.fillStyle = T([['au', 0.2], ['water', 1.2], ['bone', 0.8]]); const [rx, ry] = P(0.375, 0.46); g.fillRect(rx, ry, 0.1 * hw, 0.03 * hh);
        g.restore();
        // step wedge (right)
        const wx = hx + hw + 8, ww = (sw - 12) - hw - 14, st = ww / 3, wy = hy + hh * 0.12, wh = hh * 0.76;
        g.font = '10.5px ' + (C('--mono-font') || 'monospace'); g.textAlign = 'center'; g.textBaseline = 'top';
        for (let k = 1; k <= 3; k++) {
          const t = trans([[S.mat, k * S.x]], S.E, sp), x0 = wx + (k - 1) * st;
          g.fillStyle = glow(t); g.fillRect(x0, wy, st - 2, wh);
          g.fillStyle = C('--muted'); g.fillText(k === 1 ? 'x' : k + 'x', x0 + st / 2 - 1, sy + sh + 3);
          g.fillStyle = C('--fg'); g.fillText(sci(t), x0 + st / 2 - 1, sy + sh + 15);
        }
        g.textAlign = 'left'; g.fillStyle = C('--muted'); g.fillText(m.name + ' ' + fmtX(m, S.x) + '  T =', sx, sy + sh + 9);
      }

      function drawPlot(sp = spec()) {
        const g = cvP.g, W = cvP.w, Hh = cvP.h, m = MAT[S.mat];
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const lab = (t, x, y, c, al = 'left') => { g.fillStyle = c; g.font = '11px ' + (C('--mono-font') || 'monospace'); g.textAlign = al; g.textBaseline = 'middle'; g.fillText(t, x, y); };
        const sup = (e) => '10' + String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
        if (S.view === 'T') {
          const k = m.unit === 'mm' ? 10 : 1, X1 = m.max * k;
          const st0 = 10 ** Math.floor(Math.log10(X1 / 4)), stp = [1, 2, 2.5, 5, 10].map((f) => f * st0).find((v) => X1 / v <= 5);
          const xt = []; for (let v = 0; v <= X1 + 1e-9; v += stp) xt.push(+v.toPrecision(3));
          const A = h.axes(g, W, Hh, { x0: 0, x1: X1, y0: -4, y1: 0, pad: { l: 54, r: 12, t: 22, b: 34 }, xTicks: xt, yTicks: [-4, -3, -2, -1, 0], fmtY: sup, xLabel: `厚度 x (${m.unit})`, yLabel: '透射率 T' }, C);
          const curve = (f, color, dash) => { g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip(); g.strokeStyle = color; g.lineWidth = 2; g.setLineDash(dash || []); g.beginPath(); for (let i = 0; i <= 120; i++) { const xc = (m.max * i) / 120, y = A.Y(Math.log10(Math.max(1e-6, f(xc)))); i ? g.lineTo(A.X(xc * k), y) : g.moveTo(A.X(xc * k), y); } g.stroke(); g.restore(); };
          if (sp) curve((xc) => trans([[S.mat, xc]], meanE(sp)), C('--muted'), [5, 4]);
          curve((xc) => trans([[S.mat, xc]], S.E, sp), C('--s1'));
          const yh = A.Y(Math.log10(0.5)); g.save(); g.setLineDash([2, 3]); g.strokeStyle = C('--muted'); g.beginPath(); g.moveTo(A.p.l, yh); g.lineTo(A.p.l + A.iw, yh); g.stroke(); g.restore();
          const t = trans([[S.mat, S.x]], S.E, sp), px = A.X(S.x * k), py = A.Y(Math.log10(Math.max(1e-6, t)));
          g.fillStyle = C('--accent'); g.beginPath(); g.arc(px, Math.max(A.p.t, Math.min(A.p.t + A.ih, py)), 5, 0, 7); g.fill();
          lab(sp ? '实线：连续谱  虚线：单能 ⟨E⟩' : '单能：对数坐标里是直线', A.p.l, 10, C('--muted'));
          lab('T = ½', A.p.l + A.iw - 2, yh - 8, C('--muted'), 'right');
        } else {
          const L = Math.log10, A = h.axes(g, W, Hh, { x0: L(16), x1: L(150), y0: -1, y1: L(300), pad: { l: 54, r: 12, t: 22, b: 34 }, xTicks: [20, 30, 50, 80, 150].map(L), yTicks: [-1, 0, 1, 2], fmtX: (v) => String(Math.round(10 ** v)), fmtY: (v) => String(+(10 ** v).toPrecision(1)), xLabel: '光子能量 E (keV)', yLabel: 'μ/ρ (cm²/g)' }, C);
          g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
          MATS.forEach((q) => {
            const on = q.k === S.mat; g.strokeStyle = on ? C('--accent') : C('--muted'); g.globalAlpha = on ? 1 : 0.55; g.lineWidth = on ? 2.4 : 1.1; g.beginPath();
            for (let i = 0; i <= 540; i++) { const E = 16 + (134 * i) / 540, y = A.Y(L(muRho(q.k, E))); i ? g.lineTo(A.X(L(E)), y) : g.moveTo(A.X(L(E)), y); }
            g.stroke();
          });
          g.restore(); g.globalAlpha = 1;
          const xe = A.X(L(Eref(sp))); g.strokeStyle = C('--s1'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(xe, A.p.t); g.lineTo(xe, A.p.t + A.ih); g.stroke();
          lab(`金色：${m.name}　灰线：其余 7 种　竖线：${sp ? '⟨E⟩' : 'E'}`, A.p.l, 10, C('--muted'));
        }
      }

      function draw() {
        const sp = spec(), m = MAT[S.mat], E = Eref(sp);
        drawScreen(sp); drawPlot(sp);
        const mr = muRho(S.mat, E), u = mr * m.rho, t = trans([[S.mat, S.x]], S.E, sp);
        ro.E.set(sp ? `U = ${S.U} kV，⟨E⟩ = ${E.toFixed(1)} keV` : `E = ${S.E.toFixed(1)} keV`);
        ro.m.set(`${mr.toPrecision(4)} cm²/g${sp ? '（按 ⟨E⟩）' : ''}`);
        ro.mu.set(`${mr.toPrecision(3)} × ${m.rho} = ${u.toPrecision(3)} cm⁻¹`);
        ro.hv.set(sp ? `第一半值层 ${fmtX(m, hvl(S.mat, S.E, sp))}（实测）` : `ln2/μ = ${fmtX(m, Math.LN2 / u)}`);
        ro.T.set(sp ? `${sci(t)}（连续谱）` : `e^(−${(u * S.x).toPrecision(3)}) = ${sci(t)}`);
        const tb = trans([['water', 1.5], ['bone', 1.0]], S.E, sp), tt = trans([['water', 2.5]], S.E, sp);
        ro.c.set(`${(100 * (1 - tb / tt)).toFixed(0)} %（1 cm 骨）`);
        const rows = MATS.map((q) => { const a = muRho(q.k, E), b = a * q.rho; return `<tr${q.k === S.mat ? ' style="color:var(--accent)"' : ''}><td>${q.name}</td><td>${q.rho}</td><td>${a.toPrecision(4)}</td><td>${b.toPrecision(3)}</td><td>${fmtX(q, Math.LN2 / b)}</td></tr>`; }).join('');
        tabWrap.innerHTML = `<table><thead><tr><th>材料（${E.toFixed(0)} keV）</th><th>ρ (g/cm³)</th><th>μ/ρ (cm²/g)</th><th>μ (cm⁻¹)</th><th>半值层</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      cvS.onResize(() => drawScreen(spec())); cvP.onResize(() => drawPlot());
      const mo = new MutationObserver(draw); mo.observe(document.documentElement, { attributes: true });
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      if (mq && mq.addEventListener) mq.addEventListener('change', draw);
      draw();
      return { destroy() { cvS.destroy(); cvP.destroy(); mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', draw); } };
    },
  };
})();
