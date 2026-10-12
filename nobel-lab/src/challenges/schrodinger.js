/* 为什么能量是分立的 — 挑战版（Nobel Physics 1933: Schrödinger & Dirac）
 * 时代：1924–26。读者自己做三件事：
 * (1) 戴维孙–革末式电子衍射：扫探测器角度找峰，用晶面行距 d 换成 λ，发现 λ·p = h（德布罗意）；
 * (2) 打靶法：给定 −½ψ'' + ½x²ψ = Eψ（ħ = m = ω = 1），调 E 让解在远处不发散，找到最低三个能量；
 * (3) 换无限深方阱再打靶，数节点，找出 E = (n+½)ħω 与 E ∝ n² 的规律。
 *
 * 电子衍射模型：λ = h/√(2 m e V)（非相对论），Ni 表面行距 d = 2.15 Å，正入射，峰在 d·sinθ = λ。
 * 强度 = 背景 + 峰（sinθ 上高斯，宽 0.04）+ 3% 噪声（按 (V, θ) 取种子的 mulberry32，可复现）。
 * 打靶：RK4，ψ'' = 2(V − E)ψ。谐振子 x ∈ [−6, 6]，1200 步；方阱 x ∈ [0, 1]，400 步。
 * "尾巴偏离"：谐振子取 x_c = 经典拐点 √(2E) + 1.5，r = |ψ(x_c)| / max_{x≤x_c}|ψ|，r < 8% 可记录；
 * 方阱 r = |ψ(1)| / max|ψ|，r < 1.5% 可记录。这两个阈值保证记录到的能量离本征值 < 0.01（谐振子）/ 1%（方阱）。
 */
(() => {
  const HP = 6.62607015e-34, ME = 9.1093837e-31, QE = 1.602176634e-19, D = 2.15; // Å
  const lamV = (V) => (HP / Math.sqrt(2 * ME * QE * V)) * 1e10;                  // Å
  const pV = (V) => Math.sqrt(2 * ME * QE * V);                                    // kg·m/s
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const bg = (th) => 0.32 * (1 - 0.45 * th / 90) + 0.1 * Math.exp(-th / 12);
  const peakAmp = (V) => 0.55 + 0.45 * Math.exp(-(((V - 54) / 28) ** 2));
  function intensity(V, th) {
    const s = Math.sin((th * Math.PI) / 180), s0 = lamV(V) / D;
    const pk = s0 < 1.02 ? peakAmp(V) * Math.exp(-0.5 * ((s - s0) / 0.04) ** 2) : 0;
    const rnd = mulberry32(Math.round(V) * 7919 + Math.round(th * 10) * 104729 + 17);
    const nz = (rnd() + rnd() + rnd() - 1.5) * 0.06;
    return Math.max(0, (bg(th) + pk) * (1 + nz));
  }
  const peakTheta = (V) => { const s0 = lamV(V) / D; return s0 < 1 ? (Math.asin(s0) * 180) / Math.PI : null; };

  /* ---------- 打靶 ---------- */
  const POT = {
    ho: { name: '谐振子', x0: -6, x1: 6, N: 1200, f: (x, E) => x * x - 2 * E, th: 0.08, Emax: 6, step: 0.01, fine: 0.05, fstep: 0.0005, nud: [0.01, 0.001], E0: 1.0, dup: 0.02 },
    box: { name: '无限深方阱', x0: 0, x1: 1, N: 400, f: (x, E) => -2 * E, th: 0.015, Emax: 200, step: 0.1, fine: 1, fstep: 0.005, nud: [0.1, 0.01], E0: 10, dup: 0.01 },
  };
  function shoot(key, E) {
    const P = POT[key], h = (P.x1 - P.x0) / P.N;
    const xs = new Float64Array(P.N + 1), ys = new Float64Array(P.N + 1);
    let y = 0, p = key === 'ho' ? 1e-6 : 1; xs[0] = P.x0;
    for (let i = 0; i < P.N; i++) {
      const x = P.x0 + i * h, a = (xx, yy) => P.f(xx, E) * yy;
      const k1y = p, k1p = a(x, y), k2y = p + (h / 2) * k1p, k2p = a(x + h / 2, y + (h / 2) * k1y);
      const k3y = p + (h / 2) * k2p, k3p = a(x + h / 2, y + (h / 2) * k2y), k4y = p + h * k3p, k4p = a(x + h, y + h * k3y);
      y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y); p += (h / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
      xs[i + 1] = x + h; ys[i + 1] = y;
    }
    const xc = key === 'ho' ? Math.min(P.x1 - 0.5, Math.sqrt(2 * Math.max(E, 0)) + 1.5) : P.x1;
    let ic = 0, m = 0;
    for (let i = 0; i <= P.N; i++) { if (xs[i] <= xc + 1e-9) { ic = i; m = Math.max(m, Math.abs(ys[i])); } }
    const ratio = m > 0 ? Math.abs(ys[ic]) / m : 1;
    // 节点：x_c 之前（方阱：内部）符号改变的次数，忽略极小振幅
    let nodes = 0, last = 0;
    const xEnd = key === 'ho' ? xc - 0.6 : P.x1 - 0.03;
    for (let i = 1; i <= P.N && xs[i] <= xEnd; i++) {
      if (Math.abs(ys[i]) < 1e-3 * m) continue;
      const s = Math.sign(ys[i]); if (last && s !== last) nodes++; last = s;
    }
    let tail = 0; for (let i = P.N; i >= 0; i--) if (Math.abs(ys[i]) > 0) { tail = Math.sign(ys[i]); break; }
    return { xs, ys, xc, ic, m, ratio, nodes, tail };
  }

  const CSS = `
.schc-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.schc-nudge{display:flex;flex-wrap:wrap;gap:2px;align-items:center}
.schc-msg{font-size:13px}
.schc-msg.good{color:var(--good)} .schc-msg.bad{color:var(--warn)}
.schc-chips{display:flex;flex-wrap:wrap;gap:6px;font-family:var(--mono-font);font-size:12.5px}
.schc-chips span{border:1px solid var(--line);border-radius:999px;padding:2px 9px;background:var(--bg)}
.schc-chips span.ok{border-color:var(--good);color:var(--good)}
.schc-sep{border:0;border-top:1px dashed var(--line);margin:4px 0}`;
  function injectCSS() { if (!document.getElementById('st-schrodinger')) document.head.append(H.el('style', { id: 'st-schrodinger', text: CSS })); }
  function onTheme(fn) {
    const mo = new MutationObserver(() => fn());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const lis = () => fn();
    if (mq) mq.addEventListener ? mq.addEventListener('change', lis) : mq.addListener(lis);
    return () => { mo.disconnect(); if (mq) mq.removeEventListener ? mq.removeEventListener('change', lis) : mq.removeListener(lis); };
  }

  CHALLENGES.schrodinger = {
    title: '为什么能量是分立的',
    _math: { lamV, pV, intensity, peakTheta, shoot, POT },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color, el = h.el;
      const rec = { ho: [], box: [] };     // 读者记录到的允许能量 [{E, nodes, ratio}]

      /* ---------- 打靶工具（第二、三关共用） ---------- */
      function shooter(body, { pots, onRecord }) {
        let key = pots[0], coarse = POT[key].E0, fine = 0;
        const E = () => Math.max(0.001, coarse + fine);
        const ctl = el('div', { class: 'lab-controls' });
        const cp = pots.length > 1 ? h.choice({ label: '势', value: key, options: pots.map((k) => ({ value: k, label: POT[k].name })), onChange: (v) => setPot(v) }) : null;
        let sC, sF, nud;
        function mkSliders() {
          const P = POT[key];
          sC = h.slider({ label: '能量 E（粗调）', min: 0, max: P.Emax, step: P.step, value: coarse, format: (v) => v.toFixed(2), onInput: (v) => { coarse = v; update(); } });
          sF = h.slider({ label: '细调 ΔE', min: -P.fine, max: P.fine, step: P.fstep, value: fine, format: (v) => (v >= 0 ? '+' : '') + v.toFixed(key === 'ho' ? 4 : 3), onInput: (v) => { fine = v; update(); } });
          const b = (d) => h.button({ label: (d > 0 ? '+' : '−') + Math.abs(d), onClick: () => {
            let f = fine + d;
            if (Math.abs(f) > P.fine) { coarse = Math.min(P.Emax, Math.max(0, +(coarse + f).toFixed(4))); f = 0; sC.set(coarse); }
            fine = +f.toFixed(5); sF.set(fine); update(); } });
          nud = el('div', { class: 'ctl' }, [el('span', { class: 'ctl-lab', text: '微调按钮' }), el('div', { class: 'schc-nudge' }, [b(-P.nud[0]), b(-P.nud[1]), b(P.nud[1]), b(P.nud[0])])]);
          ctl.innerHTML = ''; if (cp) ctl.append(cp.el); ctl.append(sC.el, sF.el, nud);
        }
        const st = el('div', { class: 'lab-stage' });
        const cv = h.canvas(st, { aspect: 0.56, minH: 230, maxH: 380 });
        const ro = el('div', { class: 'lab-readout' });
        const rE = h.readout('E'), rT = h.readout('尾巴偏离'), rD = h.readout('尾巴方向'), rN = h.readout('节点数（拐点以内）');
        ro.append(rE.el, rT.el, rD.el, rN.el);
        const msg = el('span', { class: 'schc-msg', 'aria-live': 'polite' });
        const recBtn = h.button({ label: '记录这个能量', kind: 'primary', onClick: () => record() });
        const chips = el('div', { class: 'schc-chips' });
        const crit = el('p', { class: 'lab-hint' });
        body.append(st, ctl, ro, crit, el('div', { class: 'schc-row' }, [recBtn, msg]), chips);
        let S = null;
        function setPot(k) { key = k; coarse = POT[k].E0; fine = 0; mkSliders(); msg.textContent = ''; update(); }
        function record() {
          const P = POT[key];
          if (S.ratio >= P.th) { msg.className = 'schc-msg bad'; msg.textContent = `尾巴偏离 ${(S.ratio * 100).toFixed(1)}% ≥ ${+(P.th * 100).toFixed(1)}%：解在远处发散，这不是允许的能量。`; return; }
          const e = E(), list = rec[key];
          const i = list.findIndex((r) => (key === 'ho' ? Math.abs(r.E - e) < P.dup : Math.abs(r.E / e - 1) < P.dup));
          const item = { E: e, nodes: S.nodes, ratio: S.ratio };
          if (i >= 0) { if (S.ratio < list[i].ratio) list[i] = item; } else list.push(item);
          list.sort((a, b) => a.E - b.E);
          msg.className = 'schc-msg good'; msg.textContent = `记录 E = ${e.toFixed(key === 'ho' ? 4 : 3)}（${S.nodes} 个节点）`;
          chipsDraw(); draw(); onRecord && onRecord(key);
        }
        function chipsDraw() {
          chips.innerHTML = '';
          const list = rec[key];
          chips.append(el('span', { text: `${POT[key].name}已记录：` }));
          if (!list.length) chips.append(el('span', { text: '（暂无）' }));
          list.forEach((r) => chips.append(el('span', { class: 'ok', text: `E=${r.E.toFixed(key === 'ho' ? 3 : 2)} · ${r.nodes}节点` })));
        }
        function draw() {
          if (!S) return;
          const g = cv.g, W = cv.w, Hh = cv.h, e = E(), mono = col('--mono-font') || 'monospace';
          g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
          if (key === 'ho') {
            const y1 = Math.max(7, Math.ceil(e + 1.5));
            const A = h.axes(g, W, Hh, { x0: -6, x1: 6, y0: 0, y1, xTicks: [-6, -4, -2, 0, 2, 4, 6], yTicks: Array.from({ length: y1 + 1 }, (_, i) => i).filter((v) => y1 < 10 || v % 2 === 0),
              xLabel: 'x', yLabel: 'V(x), E', pad: { l: 40 } }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            // potential
            g.strokeStyle = col('--muted'); g.lineWidth = 1.5; g.beginPath();
            for (let x = -6; x <= 6.001; x += 0.05) { const X = A.X(x), Y = A.Y(0.5 * x * x); x === -6 ? g.moveTo(X, Y) : g.lineTo(X, Y); } g.stroke();
            // recorded
            rec.ho.forEach((r) => { g.strokeStyle = col('--good'); g.globalAlpha = 0.5; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(A.p.l, A.Y(r.E)); g.lineTo(A.p.l + A.iw, A.Y(r.E)); g.stroke(); });
            g.globalAlpha = 1; g.setLineDash([]);
            // energy line
            g.strokeStyle = col('--accent'); g.setLineDash([5, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(A.p.l, A.Y(e)); g.lineTo(A.p.l + A.iw, A.Y(e)); g.stroke(); g.setLineDash([]);
            // check point
            g.strokeStyle = col('--fg'); g.globalAlpha = 0.45; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(A.X(S.xc), A.p.t); g.lineTo(A.X(S.xc), A.p.t + A.ih); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
            // ψ around E
            const amp = 0.9;
            g.strokeStyle = col('--s1'); g.lineWidth = 2; g.beginPath();
            for (let i = 0; i < S.xs.length; i += 2) {
              const v = Math.max(-40, Math.min(40, S.ys[i] / S.m)); const X = A.X(S.xs[i]), Y = A.Y(e + amp * v);
              i ? g.lineTo(X, Y) : g.moveTo(X, Y);
            }
            g.stroke(); g.restore();
            g.font = '11px ' + mono; g.fillStyle = col('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
            g.fillText('x_c', A.X(S.xc), A.p.t + 2);
            g.fillStyle = col('--accent'); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('E = ' + e.toFixed(4), A.p.l + 4, A.Y(e) - 3);
          } else {
            const A = h.axes(g, W, Hh, { x0: -0.08, x1: 1.08, y0: -1.7, y1: 1.7, xTicks: [0, 0.5, 1], yTicks: [-1, 0, 1], xLabel: 'x', yLabel: 'ψ / max|ψ|', pad: { l: 40 } }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.fillStyle = col('--muted'); g.globalAlpha = 0.25;
            g.fillRect(A.p.l, A.p.t, A.X(0) - A.p.l, A.ih); g.fillRect(A.X(1), A.p.t, A.p.l + A.iw - A.X(1), A.ih); g.globalAlpha = 1;
            g.strokeStyle = col('--fg'); g.lineWidth = 2; [0, 1].forEach((x) => { g.beginPath(); g.moveTo(A.X(x), A.p.t); g.lineTo(A.X(x), A.p.t + A.ih); g.stroke(); });
            g.strokeStyle = col('--grid'); g.beginPath(); g.moveTo(A.X(0), A.Y(0)); g.lineTo(A.X(1), A.Y(0)); g.stroke();
            g.strokeStyle = col('--s1'); g.lineWidth = 2; g.beginPath();
            for (let i = 0; i < S.xs.length; i++) { const X = A.X(S.xs[i]), Y = A.Y(S.ys[i] / S.m); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
            g.stroke();
            const yEnd = A.Y(S.ys[S.ys.length - 1] / S.m);
            g.fillStyle = S.ratio < POT.box.th ? col('--good') : col('--warn'); g.beginPath(); g.arc(A.X(1), yEnd, 4.5, 0, 7); g.fill();
            g.restore();
            g.font = '11px ' + mono; g.fillStyle = col('--accent'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('E = ' + e.toFixed(3) + (rec.box.length ? '   已记录: ' + rec.box.map((r) => r.E.toFixed(1)).join(', ') : ''), A.p.l + 4, A.p.t + 4);
          }
        }
        function update() {
          S = shoot(key, E());
          const P = POT[key];
          rE.set(E().toFixed(key === 'ho' ? 4 : 3));
          rT.set(`${(S.ratio * 100).toFixed(1)}%  (${S.ratio < P.th ? '可以记录' : '发散'})`);
          rD.set(S.ratio < P.th ? '贴近 0' : S.tail > 0 ? '↑ 向 +∞' : '↓ 向 −∞');
          rN.set(String(S.nodes));
          crit.innerHTML = key === 'ho'
            ? `尾巴偏离 = |ψ(x_c)| / max|ψ|，检查点 x_c = 经典拐点 √(2E) + 1.5（图中竖虚线）。小于 ${+(P.th * 100).toFixed(1)}% 才能记录：真正的束缚态在那里早已衰减到接近 0。`
            : `尾巴偏离 = |ψ(1)| / max|ψ|：右墙处必须 ψ = 0（墙外 ψ ≡ 0，波函数要连续）。小于 ${+(P.th * 100).toFixed(1)}% 才能记录。`;
          draw();
        }
        mkSliders(); chipsDraw(); update();
        cv.onResize(draw);
        const off = onTheme(draw);
        return { destroy() { off(); cv.destroy(); }, refresh() { chipsDraw(); draw(); }, get key() { return key; } };
      }

      /* ================= 第一关：电子也会衍射 ================= */
      const stage1 = {
        title: '电子也会衍射',
        task: `<p>1924 年，德布罗意在博士论文里大胆猜测：既然光既是波又是粒子，电子也许也一样。可电子明明是粒子——
          阴极射线在磁场里偏转、在云室里留下径迹。如果它是波，它的波长该是多少？由什么决定？</p>
          <p>1927 年，贝尔实验室。戴维孙和革末用电压 $V$ 加速一束慢电子，垂直打在镍单晶表面上，用一个可以绕晶体转动的探测器
          数各个方向弹回的电子。镍表面的原子排成间距 $d = 2.15$ Å 的平行行列——和 X 射线衍射里的晶体一样，它就是一块现成的反射光栅：
          如果电子是波长为 $\\lambda$ 的波，相邻两行反射的波在角度 $\\theta$（从表面法线量起）同相叠加的条件是 $d\\sin\\theta = \\lambda$。</p>
          <p><b>任务</b>：选电压、转探测器，找出强度峰的角度，按"记录峰位"。至少在 <b>3 个不同电压</b>下记录。
          表里会算出每次的 $\\lambda = d\\sin\\theta$ 和电子动量 $p = \\sqrt{2m_e eV}$。然后找出 $\\lambda$ 与 $p$ 的关系。</p>`,
        hints: [
          '先用"扫一遍"看整条曲线：背景随角度慢慢下降，某个角度上会鼓出一个包。电压太低时包会消失——想想 $\\sin\\theta$ 不能超过 1。',
          '看右边 $\\lambda$ 对 $1/p$ 的图：点几乎落在一条过原点的直线上。直线过原点意味着 $\\lambda\\cdot p$ 是个常数。用表里任何一行算 $\\lambda\\,[\\text{m}]\\times p\\,[\\text{kg·m/s}]$。',
          '例如 54 V：$p = \\sqrt{2\\cdot9.109\\times10^{-31}\\cdot1.602\\times10^{-19}\\cdot54} = 3.97\\times10^{-24}$ kg·m/s，峰在约 51°，$\\lambda = 2.15\\sin51^\\circ = 1.67$ Å，乘积 $\\approx 6.6\\times10^{-34}$ J·s——普朗克常数。',
        ],
        answer: `$\\lambda\\, p = h = 6.63\\times10^{-34}$ J·s，即 $\\lambda = h/p$（德布罗意关系）。
          <p>以 54 V 为例：$p = \\sqrt{2m_e eV} = 3.97\\times10^{-24}$ kg·m/s，$h/p = 1.67$ Å；峰角 $\\theta = \\arcsin(1.67/2.15) \\approx 50.9^\\circ$，正是戴维孙–革末 1927 年报告的 50°。
          电压低于约 33 V 时 $\\lambda > d$，一级峰不存在。</p>`,
        build(body, api) {
          const S = { V: 54, th: 20, pts: [], rows: [], sweep: null };
          const st = el('div', { class: 'lab-stage' });
          body.append(st);
          const cs = h.canvas(st, { aspect: 0.42, minH: 170, maxH: 240 });
          const cp = h.canvas(st, { aspect: 0.42, minH: 180, maxH: 260 });
          const sV = h.slider({ label: '加速电压 V', min: 20, max: 100, step: 1, value: S.V, format: (v) => v + ' V', onInput: (v) => { S.V = v; S.pts = []; stopSweep(); sample(); } });
          const sT = h.slider({ label: '探测器角度 θ', min: 0, max: 90, step: 0.5, value: S.th, format: (v) => v.toFixed(1) + '°', onInput: (v) => { S.th = v; stopSweep(); sample(); } });
          const nb = (d) => h.button({ label: (d > 0 ? '+' : '−') + Math.abs(d) + '°', onClick: () => { S.th = Math.max(0, Math.min(90, S.th + d)); sT.set(S.th); stopSweep(); sample(); } });
          const bSweep = h.button({ label: '扫一遍 0→90°', onClick: () => sweep() });
          const bRec = h.button({ label: '记录峰位', kind: 'primary', onClick: () => recordPeak() });
          const ctl = el('div', { class: 'lab-controls' }, [sV.el, sT.el,
            el('div', { class: 'ctl' }, [el('span', { class: 'ctl-lab', text: '转动探测器' }), el('div', { class: 'schc-nudge' }, [nb(-1), nb(-0.5), nb(0.5), nb(1)])]),
            el('div', { class: 'ctl' }, [el('div', { class: 'schc-row' }, [bSweep, bRec])])]);
          const ro = el('div', { class: 'lab-readout' });
          const rI = h.readout('探测器计数（相对）');
          ro.append(rI.el);
          const msg = el('span', { class: 'schc-msg', 'aria-live': 'polite' });
          const tbox = el('div', { class: 'dtable' });
          const pst = el('div', { class: 'lab-stage' });
          body.append(ctl, ro, msg, tbox, pst);
          const cf = h.canvas(pst, { aspect: 0.5, minH: 190, maxH: 280 });
          const ans = h.answer({ label: '$\\lambda\\cdot p$ = ?（单位 $10^{-34}$ J·s；±5%）', unit: '×10⁻³⁴ J·s',
            check: (v) => {
              if (S.rows.length < 3) return { ok: false, msg: '先在至少 3 个不同电压下记录峰位。' };
              const fit = slope(), ok = Math.abs(v / 6.626 - 1) <= 0.05 || Math.abs(v / fit - 1) <= 0.03;
              return { ok, msg: ok ? '对。' : Math.abs(v / 6.626 - 1) < 0.3 ? '接近，但超出容差——注意单位（λ 用 m）。' : '不对。λ 用米、p 用 kg·m/s 再相乘。' };
            },
            onOk: () => api.done('<b>德布罗意关系 $\\lambda = h/p$。</b>电子的波长等于普朗克常数除以动量——1924 年的猜想被 1927 年的电子衍射直接证实。物质也是波。') });
          body.append(ans.el);

          function slope() { let a = 0, b = 0; S.rows.forEach((r) => { const x = 1 / r.p; a += r.lam * 1e-10 * x; b += x * x; }); return (a / b) * 1e34; }
          function sample() {
            const I = intensity(S.V, S.th);
            S.pts = S.pts.filter((q) => Math.abs(q.th - S.th) > 0.01); S.pts.push({ th: S.th, I });
            rI.set(I.toFixed(3)); drawAll();
          }
          let raf = 0;
          function stopSweep() { if (raf) cancelAnimationFrame(raf); raf = 0; }
          function sweep() {
            stopSweep();
            if (ctx.reduced) { for (let t = 0; t <= 90; t += 0.5) { S.th = t; S.pts.push({ th: t, I: intensity(S.V, t) }); } sT.set(S.th); sample(); return; }
            S.th = 0; let last = 0;
            const step = (ts) => {
              if (!last) last = ts;
              const n = Math.max(1, Math.round((ts - last) / 12)); last = ts;
              for (let k = 0; k < n && S.th < 90; k++) { S.th = Math.min(90, S.th + 0.5); S.pts.push({ th: S.th, I: intensity(S.V, S.th) }); }
              sT.set(S.th); rI.set(intensity(S.V, S.th).toFixed(3)); drawAll();
              raf = S.th < 90 ? requestAnimationFrame(step) : 0;
            };
            raf = requestAnimationFrame(step);
          }
          function recordPeak() {
            const tp = peakTheta(S.V);
            if (tp == null || Math.abs(S.th - tp) > 4) {
              msg.className = 'schc-msg bad';
              msg.textContent = tp == null ? '在这个电压下找不到明显的峰（整条曲线只有背景）。换个电压。' : '这里还不是峰顶——峰顶处计数应当最高。先扫一遍看看。';
              return;
            }
            const lam = D * Math.sin((S.th * Math.PI) / 180), row = { V: S.V, th: S.th, lam, p: pV(S.V) };
            const i = S.rows.findIndex((r) => r.V === S.V);
            if (i >= 0) S.rows[i] = row; else S.rows.push(row);
            S.rows.sort((a, b) => a.V - b.V);
            msg.className = 'schc-msg good'; msg.textContent = `记录：V = ${S.V} V，θ = ${S.th.toFixed(1)}°。` + (S.rows.length < 3 ? `还需 ${3 - S.rows.length} 个电压。` : '');
            table(); drawFit();
          }
          function table() {
            tbox.innerHTML = '';
            if (!S.rows.length) return;
            tbox.append(el('table', {}, [el('thead', {}, el('tr', {}, ['V（V）', 'θ 峰', 'λ = d sinθ（Å）', 'p（10⁻²⁴ kg·m/s）', '1/p（10²³ s/(kg·m)）'].map((x) => el('th', { text: x })))),
              el('tbody', {}, S.rows.map((r) => el('tr', {}, [String(r.V), r.th.toFixed(1) + '°', r.lam.toFixed(3), (r.p * 1e24).toFixed(3), (1e-23 / r.p).toFixed(3)].map((x) => el('td', { text: x })))))]));
          }
          function drawSchem() {
            const g = cs.g, W = cs.w, Hh = cs.h, cx = W / 2, cy = Hh - 36, R = Math.min(Hh - 56, W / 2 - 40);
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            // crystal
            g.fillStyle = col('--muted');
            for (let i = -6; i <= 6; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(cx + i * 9, cy + 6 + j * 9, 2.2, 0, 7); g.fill(); }
            g.font = '11px ' + (col('--mono-font') || 'monospace'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('Ni 晶体  d = 2.15 Å', 8, Hh - 13);
            // arc
            g.strokeStyle = col('--grid'); g.beginPath(); g.arc(cx, cy, R, -Math.PI, 0); g.stroke();
            // gun (along normal)
            g.fillStyle = col('--fg'); g.fillRect(cx - 7, cy - R - 14, 14, 18);
            g.strokeStyle = col('--s1'); g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(cx, cy - R + 4); g.lineTo(cx, cy); g.stroke();
            // scattered
            const a = (S.th * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
            const I = intensity(S.V, S.th);
            g.strokeStyle = col('--accent'); g.globalAlpha = Math.min(1, 0.25 + I); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * (R - 8), cy + dy * (R - 8)); g.stroke();
            g.setLineDash([]); g.globalAlpha = 1;
            g.save(); g.translate(cx + dx * R, cy + dy * R); g.rotate(a); g.fillStyle = col('--accent'); g.fillRect(-8, -10, 16, 12); g.restore();
            g.strokeStyle = col('--muted'); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + a); g.stroke();
            g.fillStyle = col('--fg'); g.textAlign = 'left'; g.fillText('θ', cx + 8 + 26 * Math.sin(a / 2), cy - 34 * Math.cos(a / 2));
            g.textAlign = 'right'; g.fillText(`电子枪 ${S.V} V`, cx - 12, cy - R - 6);
          }
          function drawPlot() {
            const g = cp.g, W = cp.w, Hh = cp.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 90, y0: 0, y1: 1.6, xTicks: [0, 15, 30, 45, 60, 75, 90], yTicks: [0, 0.5, 1, 1.5], xLabel: '探测器角度 θ（°）', yLabel: '计数', pad: { l: 40 } }, col);
            const pts = S.pts.slice().sort((a, b) => a.th - b.th);
            g.fillStyle = col('--s1');
            pts.forEach((q) => { g.beginPath(); g.arc(A.X(q.th), A.Y(Math.min(1.6, q.I)), 2.2, 0, 7); g.fill(); });
            g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(A.X(S.th), A.p.t); g.lineTo(A.X(S.th), A.p.t + A.ih); g.stroke();
            S.rows.filter((r) => r.V === S.V).forEach((r) => { g.strokeStyle = col('--good'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(A.X(r.th), A.p.t); g.lineTo(A.X(r.th), A.p.t + A.ih); g.stroke(); g.setLineDash([]); });
          }
          function drawFit() {
            const g = cf.g, W = cf.w, Hh = cf.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 4, y0: 0, y1: 2.5, xTicks: [0, 1, 2, 3, 4], yTicks: [0, 0.5, 1, 1.5, 2, 2.5], xLabel: '1/p（10²³ s/(kg·m)）', yLabel: 'λ（Å）', pad: { l: 40 } }, col);
            if (S.rows.length >= 2) {
              const k = slope() * 1e-34 / 1e-10 * 1e23;   // Å per (1e23 unit)
              g.strokeStyle = col('--muted'); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(A.X(0), A.Y(0)); g.lineTo(A.X(4), A.Y(4 * k)); g.stroke(); g.setLineDash([]);
            }
            g.fillStyle = col('--accent');
            S.rows.forEach((r) => { g.beginPath(); g.arc(A.X(1e-23 / r.p), A.Y(r.lam), 4, 0, 7); g.fill(); });
            if (!S.rows.length) { g.fillStyle = col('--muted'); g.font = '12px ' + (col('--body-font') || 'sans-serif'); g.textAlign = 'center'; g.fillText('记录的峰会出现在这里', A.p.l + A.iw / 2, A.p.t + A.ih / 2); }
          }
          function drawAll() { drawSchem(); drawPlot(); }
          sample(); table(); drawFit();
          cs.onResize(drawSchem); cp.onResize(drawPlot); cf.onResize(drawFit);
          const off = onTheme(() => { drawAll(); drawFit(); });
          return { destroy() { stopSweep(); off(); cs.destroy(); cp.destroy(); cf.destroy(); } };
        },
      };

      /* ================= 第二关：打靶 ================= */
      const stage2 = {
        title: '打靶：哪些能量允许存在？',
        task: `<p>1926 年初，薛定谔把德布罗意的波写成了一个方程。对一维谐振子（取 $\\hbar = m = \\omega = 1$）：</p>
          <p style="text-align:center">$-\\tfrac12\\psi''(x) + \\tfrac12 x^2\\,\\psi(x) = E\\,\\psi(x)$</p>
          <p>对<b>任何</b> $E$ 这都是一个普通的二阶线性 ODE，都有解。那为什么原子只取某些能量？
          试一试：从左边远处 $x=-6$ 出发，令 $\\psi\\approx0$、$\\psi'$ 很小，用 RK4 一路积分到 $x=+6$。
          大部分能量下解会在远处<b>发散</b>到 $\\pm\\infty$——$|\\psi|^2$ 是找到粒子的概率密度，这在物理上不允许。</p>
          <p><b>任务</b>：调 $E$，找出解在右边远处<b>不发散</b>的能量，按"记录这个能量"。找到<b>最低的三个</b>。</p>`,
        hints: [
          '从 $E=0$ 往上慢慢加。盯住右边的尾巴：它先往一个方向翻，跨过某个能量后突然改向另一边。允许的能量就夹在翻转处——尾巴方向变号的地方。',
          '找到变号区间后用细调滑块二分：每次把区间减半，尾巴偏离会越来越小。第一个在 0.4–0.6 之间。',
          '三个能量是 $E = 0.5,\\ 1.5,\\ 2.5$（粗调放到这里、细调归零即可）。注意它们的节点数分别是 0、1、2。',
        ],
        answer: `最低三个允许能量 $E_0 = 0.5$，$E_1 = 1.5$，$E_2 = 2.5$（单位 $\\hbar\\omega$）。
          <p>原因：在经典禁区 $|x| > \\sqrt{2E}$ 里，方程的两个独立解一个指数增长、一个指数衰减（$\\sim e^{\\pm x^2/2}$）。从左边出发时我们已经选了衰减解；
          一般的 $E$ 下，到了右边它会混进增长解。只有离散的一组 $E$ 能让右侧增长解的系数恰好为 0——这就是本征值问题。
          精确解 $\\psi_n \\propto H_n(x) e^{-x^2/2}$，$E_n = n + \\tfrac12$。</p>`,
        build(body, api) {
          const check = () => {
            const ok = [0.5, 1.5, 2.5].every((t) => rec.ho.some((r) => Math.abs(r.E - t) <= 0.01));
            if (ok) api.done('<b>本征值问题。</b>方程对每个 $E$ 都有解，但只有离散的几个 $E$ 让解保持有限（可归一化）。能量的分立不是额外的假设——它来自"在无穷远处 $\\psi\\to0$"这条边界条件。');
            else if (rec.ho.length) api.say(`已记录 ${rec.ho.length} 个。` + (rec.ho.length >= 3 ? '最低的三个都齐了吗？从 E = 0 往上找，别漏掉。' : ''), 'info');
          };
          const sh = shooter(body, { pots: ['ho'], onRecord: check });
          return { destroy() { sh.destroy(); } };
        },
      };

      /* ================= 第三关：找规律 ================= */
      const stage3 = {
        title: '找规律',
        task: `<p>允许的能量找到了。它们有规律吗？换一个势再试：<b>无限深方阱</b>——粒子关在 $[0,1]$ 里，墙外 $\\psi\\equiv0$，所以
          $\\psi(0) = \\psi(1) = 0$，阱内 $-\\tfrac12\\psi'' = E\\psi$。从 $x=0$ 出发（$\\psi=0,\\ \\psi'=1$），积分到 $x=1$，要求 $\\psi(1)=0$。</p>
          <p><b>任务</b>：(1) 用同样的打靶法找出方阱的<b>最低三个</b>能量（能量可能到几十）；(2) 看下表里的能量和节点数，然后预言：
          谐振子的第 6 个能级（从 $E_0$ 数起的 $E_6$），以及方阱的 $E_{10}/E_1$。</p>`,
        hints: [
          '方阱里 $\\psi = \\sin(kx)$，$k = \\sqrt{2E}$。$\\psi(1)=0$ 要求 $k$ 是什么的整数倍？第一个能量在 4–6 之间。',
          '看节点数：谐振子第 $n$ 个态（$n$ 个节点）能量是 $n+\\tfrac12$，等间距；方阱第 $n$ 个态（$n-1$ 个节点）能量与 $n^2$ 成正比：4.93, 19.7, 44.4 之比为 1 : 4 : 9。',
          '谐振子 $E_6 = 6.5$；方阱 $E_{10}/E_1 = 10^2 = 100$。方阱能量 $E_n = n^2\\pi^2/2$。',
        ],
        answer: `谐振子 $E_n = n + \\tfrac12$（即 $(n+\\tfrac12)\\hbar\\omega$），$E_6 = 6.5$；方阱 $E_n = \\dfrac{n^2\\pi^2}{2}$（$4.935,\\ 19.74,\\ 44.41,\\dots$），$E_{10}/E_1 = 100$。
          <p>整数从哪来：第 $n$ 个本征函数恰有 $n$ 个（方阱：$n-1$ 个）节点（Sturm 振荡定理）。方阱里 $\\psi=\\sin(\\sqrt{2E}\\,x)$ 在 $[0,1]$ 内要放下整数个半波长，$\\sqrt{2E} = n\\pi$。
          谐振子里，能量每升高 $\\hbar\\omega$，波函数就多一个节点。</p>`,
        build(body, api) {
          const st = { e6: false, r10: false };
          const tbox = el('div', { class: 'dtable' });
          const finish = () => {
            const boxOK = [1, 2, 3].every((n) => rec.box.some((r) => Math.abs(r.E / (n * n * Math.PI * Math.PI / 2) - 1) <= 0.01));
            if (boxOK && st.e6 && st.r10) api.done('<b>两种规律：</b>谐振子 $E = (n+\\tfrac12)\\hbar\\omega$，等间距；方阱 $E \\propto n^2$。量子数 $n$ 不是贴上去的标签，而是<b>数节点</b>数出来的：每多一个节点，就是下一个允许的能量。');
            else if (st.e6 && st.r10 && !boxOK) api.say('预言都对了——还差在方阱里亲手打靶找到最低三个能量。', 'info');
          };
          const sh = shooter(body, { pots: ['ho', 'box'], onRecord: () => { table(); finish(); } });
          body.append(el('p', { class: 'lab-hint', text: '你记录的所有允许能量（含第二关）：' }), tbox);
          function table() {
            tbox.innerHTML = '';
            const rows = [];
            rec.ho.forEach((r) => rows.push(['谐振子', r.E.toFixed(3), String(r.nodes), r.E > 0 ? '—' : '']));
            const b1 = rec.box.length ? rec.box[0].E : null;
            rec.box.forEach((r) => rows.push(['方阱', r.E.toFixed(2), String(r.nodes), b1 ? (r.E / b1).toFixed(2) + ' × 最低' : '']));
            tbox.append(el('table', {}, [el('thead', {}, el('tr', {}, ['势', 'E', '节点数', '方阱 E/E_低'].map((x) => el('th', { text: x })))),
              el('tbody', {}, rows.length ? rows.map((r) => el('tr', {}, r.map((x) => el('td', { text: x })))) : [el('tr', {}, [el('td', { text: '（暂无记录）' }), el('td'), el('td'), el('td')])])]));
          }
          const a1 = h.answer({ label: '预言：谐振子的 $E_6$（基态是 $E_0$；±0.02）', check: (v) => { const ok = Math.abs(v - 6.5) <= 0.02; return { ok, msg: ok ? '对。' : Math.abs(v - 7.5) <= 0.02 ? '差了一个——基态是 $E_0$，不是 $E_1$。' : '看表里相邻能级的间距。' }; }, onOk: () => { st.e6 = true; finish(); } });
          const a2 = h.answer({ label: '预言：方阱 $E_{10}/E_1$（±1）', check: (v) => { const ok = Math.abs(v - 100) <= 1; return { ok, msg: ok ? '对。' : Math.abs(v - 10) < 1 ? '能量不是正比于 n。看 E₂/E₁、E₃/E₁。' : '看表里 E/E_低 那一列是什么数列。' }; }, onOk: () => { st.r10 = true; finish(); } });
          body.append(el('hr', { class: 'schc-sep' }), a1.el, a2.el);
          table();
          return { destroy() { sh.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
