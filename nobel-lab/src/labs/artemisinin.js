/* 热降解与青蒿素联合疗法 — 屠呦呦等, Nobel Medicine 2015（答案演示）
 *
 * 左：提取。有效成分按一级反应热降解，回收率 Y = exp(−k(T)·t)，k = A₀·exp(−Ea/RT)，Ea = 110 kJ/mol。
 *   标定：k(100 ℃)·30 min = 0.9。由此 k(100)/k(60) = exp[(Ea/R)(1/333 − 1/373)] = e^4.26 ≈ 71。
 *   剂量比 r = D/ED50 = RATIO·w·Y·e_solvent·(去酸 ? 1 : 0.75)，抑制率 I = r²/(1+r²)（希尔，n_H = 2）。
 *   水煎（100 ℃）落在剂量–反应的陡峭段，火候的 ±40% 波动被 e^(−kt) 放大成巨大方差；
 *   低温乙醚 + 去酸把 r 推进饱和段，抑制率锁定在接近 100%。
 *
 * 右：ACT。四个亚群 S / A′ / B′ / AB，初始频率 1 : 1e−9 : 1e−9 : 1e−18（两个独立位点的突变概率相乘）。
 *   A 青蒿素类 t½ = 2 h（快、短效），B 伙伴药 t½ = 150 h（慢、长效）。κ(c) = κmax·x³/(1+x³)，
 *   耐药株的 EC50 高 80 倍。选择窗 = 使耐药株净增长超过敏感株、且药物确实在杀敏感株的那段时间。
 *   只用 A → 复燃；只用 B → 选出 B 耐药株；A+B 三天 → 治愈。
 */
(() => {
  /* ---- 提取 ---- */
  const RGAS = 8.314, EA = 110e3;
  const KREF = 0.9 / 30, A0 = KREF / Math.exp(-EA / (RGAS * 373.15));
  const kT = (T) => A0 * Math.exp(-EA / (RGAS * (T + 273.15)));
  const SOLV = { water: { zh: '水', e: 0.45, bp: 100 }, etoh: { zh: '乙醇', e: 0.62, bp: 78 }, ether: { zh: '乙醚', e: 1.0, bp: 35 } };
  const RATIO = 6.5, NH = 2, DEAC = 0.75;
  const recov = (T, t) => Math.exp(-kT(T) * t);
  const inhib = (T, t, solv, deacid) => { const r = RATIO * recov(T, t) * SOLV[solv].e * (deacid ? 1 : DEAC); return Math.pow(r, NH) / (1 + Math.pow(r, NH)); };

  /* ---- ACT ---- */
  const PK = { A: { t12: 2.0, dose: 300 }, B: { t12: 150, dose: 25 } };
  const KMAX_A = 0.30, KMAX_B = 0.065, GAM = 3, RFAC = 80;
  const GROWTH = Math.log(10) / 48, COST = 0.88;
  const conc = (d, t, ds) => ds.reduce((c, td) => (t >= td ? c + PK[d].dose * Math.exp(-Math.LN2 * (t - td) / PK[d].t12) : c), 0);
  const kill = (c, kmax, res) => { const x = c / (res ? RFAC : 1); return (kmax * Math.pow(x, GAM)) / (1 + Math.pow(x, GAM)); };
  function treat({ useA = true, useB = true, days = 3, t12A = 2.0 } = {}) {
    const old = PK.A.t12; PK.A.t12 = t12A;
    const dA = useA ? Array.from({ length: days }, (_, i) => i * 24) : [];
    const dB = useB ? Array.from({ length: days }, (_, i) => i * 24) : [];
    const dt = 0.5, T = 42 * 24;
    const P = { S: 1e12, A: 1e12 * 1e-9, B: 1e12 * 1e-9, AB: 1e12 * 1e-18 };
    const out = { t: [], Ps: [], Pr: [], cA: [], cB: [], winA: 0, winB: 0 };
    for (let i = 0; i <= T / dt; i++) {
      const t = i * dt, cA = conc('A', t, dA), cB = conc('B', t, dB);
      const kAs = kill(cA, KMAX_A, false), kAr = kill(cA, KMAX_A, true);
      const kBs = kill(cB, KMAX_B, false), kBr = kill(cB, KMAX_B, true);
      const g = GROWTH;
      const rate = { S: g - (kAs + kBs), A: g * COST - (kAr + kBs), B: g * COST - (kAs + kBr), AB: g * COST * COST - (kAr + kBr) };
      if (rate.A > rate.S + 1e-12 && kAs > 1e-4) out.winA += dt;
      if (rate.B > rate.S + 1e-12 && kBs > 1e-4) out.winB += dt;
      ['S', 'A', 'B', 'AB'].forEach((k) => { P[k] = Math.min(1e13, P[k] * Math.exp(rate[k] * dt)); if (P[k] < 1) P[k] = 0; });
      if (i % 4 === 0) { out.t.push(t / 24); out.Ps.push(P.S); out.Pr.push(P.A + P.B + P.AB); out.cA.push(cA); out.cB.push(cB); }
    }
    PK.A.t12 = old;
    const res = P.A + P.B + P.AB;
    out.P = P; out.final = P.S + res; out.finalR = res; out.cure = P.S + res < 1;
    const i48 = out.t.findIndex((x) => x >= 2), P0 = out.Ps[0] + out.Pr[0], P48 = out.Ps[i48] + out.Pr[i48];
    out.t12clear = P48 < P0 ? (Math.LN2 * 48) / Math.log(P0 / P48) : Infinity;
    return out;
  }

  LABS.artemisinin = {
    title: '热降解与青蒿素联合疗法',
    _math: { kT, recov, inhib, treat, conc, kill },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { temp: 100, minutes: 30, solv: 'water', deacid: false, useA: true, useB: true, days: 3, res: null };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '上图：把提取温度从 100 ℃ 拉到 35 ℃，回收率从 41% 跳到 99.8%（$E_a=110$ kJ/mol，$k$ 差 71 倍）；把时长拉到 120 min，100 ℃ 处只剩 2.7%——火候的小波动在指数上被放大，这就是"忽高忽低"的来源。换乙醚、打开"去酸性部分"，抑制率锁定在接近 100%。下图：关掉伙伴药 B 看复燃；只留 B 看耐药株（橙线）被选出来；两个都开、三天疗程才治愈。' });
      root.append(stage, controls, readout, hint);
      const cvE = h.canvas(stage, { aspect: 0.5, minH: 180, maxH: 250 });
      const cvP = h.canvas(stage, { aspect: 0.5, minH: 180, maxH: 250 });
      const cvC = h.canvas(stage, { aspect: 0.36, minH: 140, maxH: 190 });

      const sT = h.slider({ label: '提取温度', min: 20, max: 100, step: 1, value: 100, format: (v) => v + ' ℃', onInput: (v) => { S.temp = v; redraw(); } });
      const sM = h.slider({ label: '提取时长', min: 10, max: 120, step: 5, value: 30, format: (v) => v + ' min', onInput: (v) => { S.minutes = v; redraw(); } });
      const cS = h.choice({ label: '溶剂', value: 'water', options: Object.entries(SOLV).map(([k, v]) => ({ value: k, label: `${v.zh}（bp ${v.bp} ℃）` })), onChange: (v) => { S.solv = v; redraw(); } });
      const tD = h.toggle({ label: '碱洗去掉酸性部分', onChange: (b) => { S.deacid = b; redraw(); } });
      const tA = h.toggle({ label: '给药 A：青蒿素类（t½ = 2 h）', value: true, onChange: (b) => { S.useA = b; run(); } });
      const tB = h.toggle({ label: '给药 B：伙伴药（t½ = 150 h）', value: true, onChange: (b) => { S.useB = b; run(); } });
      const sDay = h.slider({ label: '疗程', min: 1, max: 7, step: 1, value: 3, format: (v) => v + ' 天', onInput: (v) => { S.days = v; run(); } });
      controls.append(sT.el, sM.el, cS.el, tD.el, tA.el, tB.el, sDay.el);

      const Ro = {
        Y: h.readout('提取回收率 Y'), I: h.readout('鼠疟抑制率'), k: h.readout('k(T) 与相对 100 ℃'),
        out: h.readout('42 天后'), fin: h.readout('最终虫量（总 / 耐药）'), cl: h.readout('清除半衰期'),
      };
      Object.values(Ro).forEach((r) => readout.append(r.el));

      function run() { S.res = treat({ useA: S.useA, useB: S.useB, days: S.days }); redraw(); }

      function drawExtract() {
        const g = cvE.g, W = cvE.w, Hh = cvE.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: 20, x1: 100, y0: 0, y1: 105, pad: { l: 46, r: 12, t: 14, b: 32 },
          xTicks: [20, 40, 60, 80, 100], yTicks: [0, 25, 50, 75, 100], fmtY: (v) => v + '%',
          xLabel: '提取温度 (℃)', yLabel: '回收率 / 抑制率' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const Ts = []; for (let T = 20; T <= 100; T += 0.5) Ts.push(T);
        const ln = (ys, c, w, dash) => { g.strokeStyle = c; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); Ts.forEach((T, i) => { const x = A.X(T), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); };
        ln(Ts.map((T) => 100 * recov(T, S.minutes)), C('--s1'), 2);
        ln(Ts.map((T) => 100 * inhib(T, S.minutes, S.solv, S.deacid)), C('--s3'), 2.2);
        // 当前点
        const Yc = recov(S.temp, S.minutes), Ic = inhib(S.temp, S.minutes, S.solv, S.deacid);
        g.strokeStyle = C('--accent'); g.lineWidth = 1.4; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(A.X(S.temp), A.p.t); g.lineTo(A.X(S.temp), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        g.fillStyle = C('--accent');
        [[Yc], [Ic]].forEach(([v]) => { g.beginPath(); g.arc(A.X(S.temp), A.Y(100 * v), 5, 0, 7); g.fill(); });
        // 溶剂沸点
        const bp = SOLV[S.solv].bp;
        if (bp < 100) { g.strokeStyle = C('--warn'); g.lineWidth = 1.2; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(A.X(bp), A.p.t); g.lineTo(A.X(bp), A.p.t + A.ih); g.stroke(); g.setLineDash([]); }
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'top';
        g.fillStyle = C('--s1'); g.textAlign = 'left'; g.fillText('回收率 Y = e^(−k(T)·t)', A.p.l + 4, A.p.t + 3);
        g.fillStyle = C('--s3'); g.fillText(`抑制率（${SOLV[S.solv].zh}${S.deacid ? '、去酸' : ''}）`, A.p.l + 4, A.p.t + 17);
        if (bp < 100) { g.fillStyle = C('--warn'); g.textAlign = 'right'; g.fillText(`${SOLV[S.solv].zh}沸点 ${bp} ℃`, Math.min(A.X(bp) + 56, A.p.l + A.iw - 4), A.p.t + 3); }
      }

      function drawParasite() {
        const r = S.res; if (!r) return;
        const g = cvP.g, W = cvP.w, Hh = cvP.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const supOf = (n) => String(n).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
        const A = h.axes(g, W, Hh, { x0: 0, x1: 42, y0: 1e-1, y1: 1e13, logY: true, pad: { l: 54, r: 12, t: 14, b: 32 },
          xTicks: [0, 7, 14, 21, 28, 35, 42], yTicks: [1e-1, 1e2, 1e5, 1e8, 1e12],
          fmtY: (v) => '10' + supOf(Math.round(Math.log10(v))), xLabel: '时间 (d)', yLabel: '体内原虫数' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.fillStyle = C('--accent'); g.globalAlpha = 0.12; g.fillRect(A.X(0), A.p.t, A.X(S.days) - A.X(0), A.ih); g.globalAlpha = 1;
        g.strokeStyle = C('--good'); g.lineWidth = 1.3; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(A.p.l, A.Y(1)); g.lineTo(A.p.l + A.iw, A.Y(1)); g.stroke(); g.setLineDash([]);
        const ln = (ys, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); r.t.forEach((t, i) => { const x = A.X(t), y = A.Y(Math.max(0.12, ys[i])); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
        ln(r.Ps, C('--s1'), 2.2); ln(r.Pr, C('--warn'), 2);
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'top'; g.textAlign = 'left';
        g.fillStyle = C(r.cure ? '--good' : '--warn');
        g.fillText(r.cure ? '治愈' : r.finalR > r.P.S ? '复燃：耐药株占优' : '复燃', A.p.l + 4, A.p.t + 3);
        g.fillStyle = C('--s1'); g.fillText('敏感株', A.p.l + 4, A.p.t + 17);
        g.fillStyle = C('--warn'); g.fillText('耐药株', A.p.l + 4, A.p.t + 31);
        g.fillStyle = C('--good'); g.textAlign = 'right'; g.fillText('治愈线 = 1 个虫', A.p.l + A.iw - 4, A.Y(1) - 13);
      }

      function drawConc() {
        const r = S.res; if (!r) return;
        const g = cvC.g, W = cvC.w, Hh = cvC.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: 0, x1: 21, y0: 1e-2, y1: 1e3, logY: true, pad: { l: 54, r: 12, t: 12, b: 32 },
          xTicks: [0, 3, 7, 14, 21], yTicks: [1e-2, 1, 1e2], fmtY: (v) => (v >= 1 ? String(v) : '0.01'),
          xLabel: '时间 (d)', yLabel: '浓度 / EC₅₀' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.fillStyle = C('--warn'); g.globalAlpha = 0.13; g.fillRect(A.p.l, A.Y(RFAC), A.iw, A.Y(1) - A.Y(RFAC)); g.globalAlpha = 1;
        const m = r.t.findIndex((x) => x > 21);
        const ts = r.t.slice(0, m < 0 ? r.t.length : m);
        const ln = (ys, c) => { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); ts.forEach((t, i) => { const x = A.X(t), y = A.Y(Math.max(0.011, ys[i])); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
        ln(r.cA, C('--s1')); ln(r.cB, C('--s2'));
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.fillStyle = C('--warn'); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText('选择窗（杀敏感、不杀耐药）', A.p.l + 4, (A.Y(RFAC) + A.Y(1)) / 2);
        g.textBaseline = 'top'; g.fillStyle = C('--s1'); g.fillText('A', A.p.l + 4, A.p.t + 3);
        g.fillStyle = C('--s2'); g.fillText('B', A.p.l + 18, A.p.t + 3);
        g.fillStyle = C('--muted'); g.textAlign = 'right';
        g.fillText(`A 窗 ${r.winA.toFixed(0)} h　B 窗 ${r.winB.toFixed(0)} h`, A.p.l + A.iw - 4, A.p.t + 3);
      }

      function readouts() {
        const Yc = recov(S.temp, S.minutes), Ic = inhib(S.temp, S.minutes, S.solv, S.deacid), r = S.res;
        Ro.Y.set((100 * Yc).toFixed(Yc < 0.1 ? 2 : 1) + '%');
        Ro.I.set((100 * Ic).toFixed(1) + '%' + (S.temp > SOLV[S.solv].bp ? `（注意：${SOLV[S.solv].zh}已沸腾）` : ''));
        Ro.k.set(`${kT(S.temp).toExponential(2)} /min　= k(100℃)/${(kT(100) / kT(S.temp)).toFixed(0)}`);
        if (r) {
          Ro.out.set(r.cure ? '治愈' : r.finalR > r.P.S ? '复燃（耐药株占优）' : '复燃');
          Ro.fin.set(`${r.final.toExponential(1)} / ${r.finalR.toExponential(1)}`);
          Ro.cl.set(isFinite(r.t12clear) ? r.t12clear.toFixed(1) + ' h' : '—（未下降）');
        }
      }
      function redraw() { drawExtract(); drawParasite(); drawConc(); readouts(); }

      cvE.onResize(drawExtract); cvP.onResize(drawParasite); cvC.onResize(drawConc);
      const mo = new MutationObserver(redraw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onMq = () => redraw();
      mq.addEventListener && mq.addEventListener('change', onMq);
      // 打开时：常规水煎 + 标准 ACT（已经能看出两件事）
      run();
      return { destroy() { cvE.destroy(); cvP.destroy(); cvC.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', onMq); } };
    },
  };
})();
