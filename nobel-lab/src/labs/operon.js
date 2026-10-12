/* lac 开关与 λ 双稳开关 — Jacob, Lwoff, Monod, Nobel Medicine 1965（答案演示）
 *
 * 左：lac 操纵子的占据模型。阻遏蛋白四聚体有 m = 4 个独立的诱导物结合位点，只有完全不带诱导物
 *   的分子才能结合算符，故 R([S]) = R_tot/(1+[S]/K_S)^m，算符空闲概率
 *     p_on = 1 / (1 + A/(1+[S]/K_S)^m),   A = R_tot/K_d ≈ 10³（= 诱导比 ρ − 1）。
 *   另加 CRP–cAMP 激活项 act = 1/(1+G/K_act) 与诱导物排除 excl = 1/(1+G/K_exc)（葡萄糖的两条作用）。
 *   比活力 U = 1 + 1000·e，e 为酶量（归一化），ė = k_e(act·p_on − e)。
 *   表观希尔系数 n_app = mσ/(1+σ)，σ = A^(1/m) − 1；A = 10³、m = 4 ⇒ n_app = 3.29（位点彼此独立！）。
 *   基因型：I⁺（可诱导）、I⁻（无阻遏蛋白，组成型）、Iˢ（阻遏蛋白不认诱导物，不可诱导）、
 *   O^c（算符突变，顺式，阻遏蛋白结合不上）。
 *
 * 右：λ 的 CI / Cro 双稳开关，ẋ = α/(1+yⁿ) − δx，ẏ = α/(1+xⁿ) − y。
 *   对称不动点 s(1+sⁿ) = α；失稳 ⟺ b = n sⁿ/(1+sⁿ) > 1 ⟺ n > 1 且 α > α_c = s*(1+s*ⁿ)，s* = (n−1)^(−1/n)。
 *   n = 2 ⇒ α_c = 2。紫外 = RecA 促使 CI 自切割 = 把 δ 抬到 > 1，越过鞍–结分岔后不可逆。
 */
(() => {
  const A_REP = 1000, M_SITE = 4, UMAX = 1000, KS = 1;
  const KEXC = 0.12, KACT = 0.3, KE = 1.0;
  const pon = (s) => 1 / (1 + A_REP / Math.pow(1 + Math.max(0, s) / KS, M_SITE));
  const nApp = () => { const sg = Math.pow(A_REP, 1 / M_SITE) - 1; return (M_SITE * sg) / (1 + sg); };
  /* 基因型对占据率的作用 */
  function ponGeno(iptg, G, geno) {
    const excl = 1 / (1 + G / KEXC);
    if (geno === 'Oc') return 1;                       // 算符结合不上，与阻遏蛋白状态无关
    if (geno === 'I-') return 1;                       // 没有阻遏蛋白
    if (geno === 'Is') return 1 / (1 + A_REP);         // 阻遏蛋白不认诱导物，始终按住
    return pon(iptg * excl);
  }
  const actOf = (G) => 1 / (1 + G / KACT);
  const steadyU = (iptg, G, geno) => 1 + UMAX * actOf(G) * ponGeno(iptg, G, geno);

  /* λ 开关 */
  const steadySym = (a, n) => { let lo = 1e-9, hi = 1e4; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; m * (1 + Math.pow(m, n)) > a ? (hi = m) : (lo = m); } return (lo + hi) / 2; };
  const alphaC = (n) => { if (n <= 1) return Infinity; const s = Math.pow(n - 1, -1 / n); return s * (1 + Math.pow(s, n)); };
  function relax(a, n, x0, y0, d = 1, T = 60, dt = 0.01) {
    let x = x0, y = y0;
    for (let i = 0; i < Math.round(T / dt); i++) {
      x = Math.max(0, x + dt * (a / (1 + Math.pow(y, n)) - d * x));
      y = Math.max(0, y + dt * (a / (1 + Math.pow(x, n)) - y));
    }
    return [x, y];
  }

  LABS.operon = {
    title: 'lac 开关与 λ 双稳开关',
    _math: { pon, nApp, steadyU, alphaC, steadySym, relax },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { logI: -1, G: 0, geno: 'I+', run: false, e: 1 / (1 + A_REP), t: 0, hist: { t: [], U: [], i: [] }, phase: 0,
        a: 5, n: 2, d: 1.5, lx: 0, ly: 0, traj: [], uv: false, uvT: 0 };
      const iptgOf = () => (S.logI <= -2.01 ? 0 : Math.pow(10, S.logI));

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '上图：拖 IPTG 看算符空闲概率 $p_{\\rm on}$ 打开——曲线很陡，但四个结合位点彼此独立，陡度只来自"必须四个位点全空才能阻遏"（表观希尔系数 3.29）。换基因型：$I^{-}$ 把曲线顶到满、$I^{s}$ 压到底、$O^{c}$ 顺式打开。加葡萄糖，曲线整体右移（诱导物排除）并压低（cAMP–CRP）。下图：$n=1$ 时无论 $\\alpha$ 多大都只有一个稳定态；$n=2,\\ \\alpha\\gt2$ 才双稳，这时紫外（抬高 CI 的降解率）可以把它<b>不可逆地</b>推向裂解。' });
      root.append(stage, controls, readout, hint);
      const cvL = h.canvas(stage, { aspect: 0.52, minH: 180, maxH: 250 });
      const cvT = h.canvas(stage, { aspect: 0.4, minH: 150, maxH: 210 });
      const cvS = h.canvas(stage, { aspect: 0.52, minH: 180, maxH: 250 });

      const sI = h.slider({ label: 'IPTG 浓度 [S]/K_S', min: -2, max: 3, step: 0.02, value: S.logI,
        format: (v) => (v <= -2.01 ? '0' : Math.pow(10, v) < 1 ? Math.pow(10, v).toFixed(2) : Math.pow(10, v).toFixed(1)),
        onInput: (v) => { S.logI = v; redraw(); } });
      const sG = h.slider({ label: '葡萄糖', min: 0, max: 3, step: 0.05, value: 0, format: (v) => v.toFixed(2), onInput: (v) => { S.G = v; redraw(); } });
      const cGen = h.choice({ label: '基因型', value: 'I+',
        options: [{ value: 'I+', label: 'I⁺O⁺（野生型）' }, { value: 'I-', label: 'I⁻（组成型）' }, { value: 'Is', label: 'Iˢ（不可诱导）' }, { value: 'Oc', label: 'Oᶜ（算符突变）' }],
        onChange: (v) => { S.geno = v; redraw(); } });
      const sA = h.slider({ label: 'λ：合成强度 α', min: 0.4, max: 12, step: 0.05, value: S.a, format: (v) => v.toFixed(2), onInput: (v) => { S.a = v; resetSw(); } });
      const sN = h.slider({ label: 'λ：协同性 n', min: 1, max: 4, step: 0.1, value: S.n, format: (v) => v.toFixed(1), onInput: (v) => { S.n = v; resetSw(); } });
      const sD = h.slider({ label: 'λ：紫外时 CI 的降解率 δ', min: 1, max: 4, step: 0.05, value: S.d, format: (v) => v.toFixed(2), onInput: (v) => { S.d = v; } });
      const bRun = h.button({ label: '加 IPTG：看酶量的时间进程', kind: 'primary', onClick: () => startRun() });
      const bUV = h.button({ label: 'λ：紫外照射', onClick: () => uvShot() });
      const bRst = h.button({ label: 'λ：回到溶源态', onClick: () => resetSw() });
      controls.append(sI.el, sG.el, cGen.el, h.el('div', { class: 'ctl' }, [bRun]), sA.el, sN.el, sD.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bUV, bRst])]));

      const Ro = {
        p: h.readout('p_on（算符空闲概率）'), U: h.readout('比活力 U'), rho: h.readout('诱导比 ρ / 表观希尔系数'),
        glu: h.readout('葡萄糖的两条作用'), bi: h.readout('λ：双稳？α_c(n)'), st: h.readout('λ：当前 (CI, Cro)'),
      };
      Object.values(Ro).forEach((r) => readout.append(r.el));

      /* ---- lac：稳态曲线 ---- */
      function drawLac() {
        const g = cvL.g, W = cvL.w, Hh = cvL.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: -2, x1: 3, y0: 0.6, y1: 1600, logY: true, pad: { l: 48, r: 12, t: 12, b: 34 },
          xTicks: [-2, -1, 0, 1, 2, 3], yTicks: [1, 10, 100, 1000], fmtX: (v) => (v < 0 ? '10' + String(v).replace('-', '⁻').replace('1', '¹').replace('2', '²') : String(Math.pow(10, v))),
          fmtY: (v) => String(v), xLabel: 'IPTG [S]/K_S（对数）', yLabel: 'U (Miller, 对数)' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        // 野生型（无葡萄糖）作为参照
        const curve = (geno, G, c, w, dash) => {
          g.strokeStyle = c; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath();
          for (let px = 0; px <= A.iw; px++) {
            const lx = -2 + (px / A.iw) * 5, U = steadyU(Math.pow(10, lx), G, geno);
            const y = A.Y(U); px ? g.lineTo(A.p.l + px, y) : g.moveTo(A.p.l + px, y);
          }
          g.stroke(); g.setLineDash([]);
        };
        curve('I+', 0, C('--muted'), 1.3, [5, 4]);
        curve(S.geno, S.G, C('--s1'), 2.2);
        // 当前点
        const U = steadyU(iptgOf(), S.G, S.geno);
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(A.X(S.logI), A.Y(U), 5.5, 0, 7); g.fill(); g.stroke();
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillStyle = C('--muted'); g.fillText('虚线：野生型、无葡萄糖', A.p.l + 5, A.p.t + 3);
        g.fillStyle = C('--s1'); g.fillText(({ 'I+': 'I⁺O⁺', 'I-': 'I⁻', Is: 'Iˢ', Oc: 'Oᶜ' })[S.geno] + (S.G > 0.01 ? `　+ 葡萄糖 ${S.G.toFixed(2)}` : ''), A.p.l + 5, A.p.t + 17);
      }

      /* ---- lac：时间进程 ---- */
      function startRun() { S.run = true; S.t = 0; S.e = ponGeno(0, S.G, S.geno) * actOf(S.G); S.hist = { t: [], U: [], i: [] }; S.phase = 0; if (!lp.running) lp.start(); }
      function stepLac(dt) {
        if (!S.run) return false;
        const T = 12, step = Math.min(0.05, dt * 2);
        // 0–3 h 加诱导物，3–6 h 撤去，6–9 h 再加 + 葡萄糖，9–12 h 只剩葡萄糖
        for (let k = 0; k < 4 && S.t < T; k++) {
          const ph = S.t < 3 ? 0 : S.t < 6 ? 1 : S.t < 9 ? 2 : 3;
          const iptg = ph === 1 || ph === 3 ? 0 : Math.max(iptgOf(), 60);   // 加的时候给饱和浓度
          const G = ph >= 2 ? Math.max(S.G, 1.5) : S.G;
          const target = actOf(G) * ponGeno(iptg, G, S.geno);
          S.e += step * KE * (target - S.e);
          S.t += step; S.phase = ph;
          S.hist.t.push(S.t); S.hist.U.push(1 + UMAX * S.e); S.hist.i.push(iptg > 0 ? 1 : 0);
        }
        if (S.t >= 12) S.run = false;
        return true;
      }
      function drawTime() {
        const g = cvT.g, W = cvT.w, Hh = cvT.h;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: 0, x1: 12, y0: 0.6, y1: 1600, logY: true, pad: { l: 48, r: 12, t: 12, b: 32 },
          xTicks: [0, 3, 6, 9, 12], yTicks: [1, 10, 100, 1000], fmtY: (v) => String(v), xLabel: '时间 (h)', yLabel: 'U (对数)' }, C);
        // 分段底色
        [[0, 3, '加 IPTG'], [3, 6, '撤去'], [6, 9, '+ 葡萄糖'], [9, 12, '只剩葡萄糖']].forEach(([a, b, lab], i) => {
          if (i % 2) { g.fillStyle = C('--grid'); g.globalAlpha = 0.4; g.fillRect(A.X(a), A.p.t, A.X(b) - A.X(a), A.ih); g.globalAlpha = 1; }
          g.fillStyle = C('--muted'); g.font = '10px ' + C('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'top';
          g.fillText(lab, (A.X(a) + A.X(b)) / 2, A.p.t + 2);
        });
        if (!S.hist.t.length) {
          g.fillStyle = C('--muted'); g.font = '12.5px ' + C('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('按「加 IPTG：看酶量的时间进程」', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
          return;
        }
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.strokeStyle = C('--s1'); g.lineWidth = 2.2; g.beginPath();
        S.hist.t.forEach((t, i) => { const x = A.X(t), y = A.Y(S.hist.U[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke(); g.restore();
      }

      /* ---- λ 开关 ---- */
      function resetSw() { const p = relax(S.a, S.n, 4 * S.a, 0); S.lx = p[0]; S.ly = p[1]; S.traj = [[S.lx, S.ly]]; S.uv = false; redraw(); }
      function uvShot() {
        const dt = 0.01; let x = S.lx, y = S.ly;
        for (let i = 0; i < 2000; i++) { const nx = Math.max(0, x + dt * (S.a / (1 + Math.pow(y, S.n)) - S.d * x)); y = Math.max(0, y + dt * (S.a / (1 + Math.pow(x, S.n)) - y)); x = nx; if (i % 8 === 0) S.traj.push([x, y]); }
        for (let i = 0; i < 8000; i++) { const nx = Math.max(0, x + dt * (S.a / (1 + Math.pow(y, S.n)) - x)); y = Math.max(0, y + dt * (S.a / (1 + Math.pow(x, S.n)) - y)); x = nx; if (i % 8 === 0) S.traj.push([x, y]); }
        S.lx = x; S.ly = y; S.uv = true; redraw();
      }
      function drawSw() {
        const g = cvS.g, W = cvS.w, Hh = cvS.h, M = Math.max(1.2, S.a * 1.15);
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const tk = (m) => { const st = m <= 2 ? 0.5 : m <= 6 ? 1 : 3; const o = []; for (let v = 0; v <= m + 1e-9; v += st) o.push(+v.toFixed(2)); return o; };
        const A = h.axes(g, W, Hh, { x0: 0, x1: M, y0: 0, y1: M, pad: { l: 44, r: 12, t: 12, b: 32 }, xTicks: tk(M), yTicks: tk(M),
          fmtX: (v) => String(v), fmtY: (v) => String(v), xLabel: 'CI x（溶源）', yLabel: 'Cro y（裂解）' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const NY = 120, pts = (f) => { const xs = [], ys = []; for (let i = 0; i <= NY; i++) { const t = (M * i) / NY; const [x, y] = f(t); xs.push(x); ys.push(y); } return [xs, ys]; };
        const ln = (xs, ys, c, w, dash) => { g.strokeStyle = c; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); xs.forEach((x, i) => { const px = A.X(x), py = A.Y(ys[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); g.setLineDash([]); };
        let [xs, ys] = pts((y) => [S.a / (1 + Math.pow(y, S.n)), y]); ln(xs, ys, C('--muted'), 1.4, [5, 4]);
        [xs, ys] = pts((x) => [x, S.a / (1 + Math.pow(x, S.n))]); ln(xs, ys, C('--muted'), 1.4, [2, 3]);
        // 两条参照轨迹：从对称不动点两侧出发，走出整条分离线
        const s0 = steadySym(S.a, S.n), eps = Math.max(0.03, 0.05 * s0);
        [[s0 + eps, s0 - eps, '--s1'], [s0 - eps, s0 + eps, '--s2']].forEach(([x0, y0, cc]) => {
          let x = x0, y = y0; const ax = [x], ay = [y], dt = 0.01;
          for (let i = 0; i < 8000; i++) { const nx = Math.max(0, x + dt * (S.a / (1 + Math.pow(y, S.n)) - x)); y = Math.max(0, y + dt * (S.a / (1 + Math.pow(x, S.n)) - y)); x = nx; if (i % 8 === 0) { ax.push(x); ay.push(y); } }
          ln(ax, ay, C(cc), 1.7);
          g.fillStyle = C(cc); g.beginPath(); g.arc(A.X(x), A.Y(y), 4.2, 0, 7); g.fill();
        });
        g.strokeStyle = C('--muted'); g.lineWidth = 1.4;
        g.beginPath(); g.arc(A.X(s0), A.Y(s0), 3.5, 0, 7); g.stroke();
        if (S.traj.length > 1) ln(S.traj.map((p) => p[0]), S.traj.map((p) => p[1]), C('--warn'), 2);
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(A.X(S.lx), A.Y(S.ly), 5.5, 0, 7); g.fill(); g.stroke();
        g.restore();
        const p = relax(S.a, S.n, 4 * S.a, 0), q = relax(S.a, S.n, 0, 4 * S.a);
        const bi = Math.abs(p[0] - q[0]) > 0.15 * Math.max(S.a, 0.2);
        g.font = '10.5px ' + C('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillStyle = C(bi ? '--good' : '--warn'); g.fillText(bi ? '双稳' : '单稳（只有一个终点）', A.p.l + A.iw - 4, A.p.t + 3);
        if (S.uv) { g.fillStyle = C('--warn'); g.textAlign = 'left'; g.fillText(S.ly > S.lx ? '紫外后：裂解' : '紫外后：仍溶源', A.p.l + 5, A.p.t + 3); }
      }

      function readouts() {
        const iptg = iptgOf(), p = ponGeno(iptg, S.G, S.geno), U = steadyU(iptg, S.G, S.geno);
        Ro.p.set(p.toExponential(2) + (S.geno === 'I+' ? `　= 1/(1 + ${A_REP}/(1+[S]/K_S)⁴)` : ''));
        Ro.U.set(U.toFixed(U < 10 ? 2 : 0) + ' Miller');
        Ro.rho.set(`ρ = 1 + R_tot/K_d = ${(1 + A_REP)}　n_app = ${nApp().toFixed(2)}`);
        Ro.glu.set(`排除 ×${(1 / (1 + S.G / KEXC)).toFixed(3)}　激活 ×${actOf(S.G).toFixed(3)}`);
        const ac = alphaC(S.n), p2 = relax(S.a, S.n, 4 * S.a, 0), q2 = relax(S.a, S.n, 0, 4 * S.a);
        const bi = Math.abs(p2[0] - q2[0]) > 0.15 * Math.max(S.a, 0.2);
        Ro.bi.set((bi ? '双稳' : '单稳') + `　α_c = ${isFinite(ac) ? ac.toFixed(2) : '∞ (n ≤ 1)'}`);
        Ro.st.set(`(${S.lx.toFixed(2)}, ${S.ly.toFixed(2)})`);
      }
      function redraw() { drawLac(); drawTime(); drawSw(); readouts(); }

      let idle = 0;
      const lp = h.loop((dt) => {
        const moved = stepLac(dt);
        if (moved) { drawTime(); idle = 0; } else idle += dt;
        if (idle > 0.4) lp.stop();
      });
      cvL.onResize(drawLac); cvT.onResize(drawTime); cvS.onResize(drawSw);
      const mo = new MutationObserver(redraw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onMq = () => redraw();
      mq.addEventListener && mq.addEventListener('change', onMq);
      // 打开时就处在一个有意思的状态：野生型、半数诱导附近、λ 已在溶源态且参数双稳
      resetSw();
      if (!ctx.reduced) { S.run = true; S.t = 0; S.e = ponGeno(0, 0, 'I+'); S.hist = { t: [], U: [], i: [] }; lp.start(); }
      else { for (let i = 0; i < 400; i++) stepLac(0.05); }
      redraw();
      return { destroy() { lp.stop(); cvL.destroy(); cvT.destroy(); cvS.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', onMq); } };
    },
  };
})();
