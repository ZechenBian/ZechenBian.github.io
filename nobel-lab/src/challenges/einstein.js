/* 光照出电子 — challenge for Nobel Physics 1921 (Einstein, law of the photoelectric effect)
 * The reader runs a retarding-voltage phototube: finds stopping voltages, sees they don't depend on
 * intensity, finds V₀ linear in ν with slope h/e, and predicts V₀ for an unknown metal.
 * Constants: hc = 1239.84 eV·nm, e = 1.602176634e-19 C, c = 2.99792458e8 m/s, h = 6.62607015e-34 J·s.
 * Tube model: I = I_sat(intensity) · f(eV_r / E_max), f(u) = 1 − u for u < 1 (KE uniform on 0…E_max),
 * E_max = hc/λ − W;  plus a ±0.02 nA noise floor on the meter.
 */
(() => {
  const HC = 1239.84, QE = 1.602176634e-19, CL = 2.99792458e8;
  const H_TRUE = 6.62607015; // ×10⁻³⁴ J·s
  const NA = { id: 'Na', name: '钠 Na', W: 2.28 };
  const MX = { id: 'X', name: '金属 X', W: 3.6 };
  const ISAT = 0.4; // nA per % intensity
  const nu14 = (nm) => CL / (nm * 1e-9) / 1e14;
  const emax = (nm, W) => HC / nm - W;
  const iTrue = (nm, I, Vr, W) => { const E = emax(nm, W); if (E <= 0 || I <= 0) return 0; const u = Vr / E; return u >= 1 ? 0 : ISAT * I * (1 - u); };
  const v0True = (nm, W) => Math.max(0, emax(nm, W));
  function fit(pts) {
    const n = pts.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const d = n * sxx - sx * sx; if (n < 2 || Math.abs(d) < 1e-12) return null;
    const b = (n * sxy - sx * sy) / d; return { a: (sy - b * sx) / n, b };
  }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const lamColor = (nm, a = 1) => H.wavelengthRGB(nm, a) || (nm < 380 ? `rgba(170,120,255,${a})` : `rgba(160,60,40,${a})`);

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-einstein')) return;
    const s = document.createElement('style'); s.id = 'st-einstein';
    s.textContent = `
.einstein-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; align-items: start; }
.einstein-row > * { min-width: 0; }
.einstein-meter { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
.einstein-meter .einstein-big { font-family: var(--mono-font); font-size: 26px; font-variant-numeric: tabular-nums; color: var(--fg); }
.einstein-meter small { color: var(--muted); font-size: 12px; }
.einstein-nudge { display: flex; flex-wrap: wrap; gap: 2px; }
.einstein-note { font-size: 13px; color: var(--muted); margin: 0; line-height: 1.65; }
.einstein-hidden { display: none !important; }
.einstein-x { font: inherit; font-size: 12px; color: var(--muted); background: none; border: 0; cursor: pointer; padding: 0 4px; }`;
    document.head.append(s);
  }

  /* ---------- the shared apparatus ---------- */
  function apparatus(ctx, body, api, o) {
    const h = ctx.h, col = ctx.color, el = h.el;
    const rnd = mulberry32(o.seed || 7);
    const gauss = () => { const a = rnd() || 1e-12, b = rnd(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
    const S = { nm: o.nm || 400, I: o.I || 50, Vr: 0, metal: o.metal, trace: [], key: '', shown: 0 };
    const photons = [], electrons = []; let acc = 0;

    const row = el('div', { class: 'einstein-row' });
    const left = el('div', { class: 'lab-stage' }), right = el('div', { class: 'lab-stage' });
    row.append(left, right);
    body.append(row);
    const cvA = h.canvas(left, { aspect: 0.62, minH: 190, maxH: 280 });
    cvA.canvas.setAttribute('aria-label', '光电管示意图');
    const cvI = h.canvas(right, { aspect: 0.62, minH: 190, maxH: 280 });
    cvI.canvas.setAttribute('aria-label', '本组设置下扫描得到的电流–反向电压曲线');

    const big = el('span', { class: 'einstein-big', text: '0.00' });
    const meter = el('div', { class: 'einstein-meter', role: 'status' }, [el('small', { text: '光电流' }), big, el('small', { text: 'nA（噪声约 ±0.02 nA）' })]);
    body.append(meter);

    const ctrls = el('div', { class: 'lab-controls' });
    const p = o.prefix;
    const sL = h.slider({ id: p + '-lam', label: '单色仪波长 λ', min: 200, max: 650, step: 1, value: S.nm, format: (v) => `${v} nm（ν = ${nu14(v).toFixed(3)}×10¹⁴ Hz）`,
      onInput: (v) => {
        if (o.lock && o.lock() && v >= o.lockBand[0] && v <= o.lockBand[1]) {
          v = S.nm < o.lockBand[0] ? o.lockBand[0] - 1 : o.lockBand[1] + 1; sL.set(v);
          o.onLocked && o.onLocked();
        }
        S.nm = v; changed();
      } });
    const sI = h.slider({ id: p + '-int', label: '光强', min: 0, max: 100, step: 1, value: S.I, format: (v) => v + ' %', onInput: (v) => { S.I = v; changed(); } });
    const sV = h.slider({ id: p + '-vr', label: '反向（遏止）电压 V_r', min: 0, max: 5, step: 0.01, value: 0, format: (v) => v.toFixed(2) + ' V', onInput: (v) => { S.Vr = v; changed(); } });
    const setV = (v) => { S.Vr = Math.round(Math.max(0, Math.min(5, v)) * 100) / 100; sV.set(S.Vr); changed(); };
    const nudge = el('div', { class: 'einstein-nudge' }, [[-0.1, '−0.1'], [-0.01, '−0.01'], [0.01, '+0.01'], [0.1, '+0.1']].map(([d, t]) => h.button({ label: t, onClick: () => setV(S.Vr + d) })));
    const bZero = h.button({ label: 'V_r 归零', onClick: () => setV(0) });
    const bRec = h.button({ label: '记录 V₀', kind: 'primary', onClick: record });
    bRec.id = p + '-rec';
    ctrls.append(sL.el, sI.el, el('div', { class: 'ctl' }, [sV.el, nudge]), el('div', {}, [bRec, bZero]));
    body.append(ctrls);

    function current() { return iTrue(S.nm, S.I, S.Vr, S.metal.W); }
    function reading() { return current() + 0.012 * gauss(); }
    function changed() {
      const key = `${S.metal.id}|${S.nm}|${S.I}`;
      if (key !== S.key) { S.key = key; S.trace = []; }
      const r = reading();
      S.trace.push([S.Vr, r]); if (S.trace.length > 600) S.trace.shift();
      big.textContent = r.toFixed(2);
      drawIV(); if (ctx.reduced || !lp.running) drawA();
      if (o.onChange) o.onChange();
    }
    function record() {
      const iNow = current();
      const E = emax(S.nm, S.metal.W);
      if (S.I <= 0) { api.say('光强为 0，什么也测不到。先把灯打开。', 'bad'); return; }
      if (E <= 0) {
        o.onRecord({ nm: S.nm, nu: nu14(S.nm), I: S.I, V: 0, metal: S.metal.id });
        api.say(`λ = ${S.nm} nm：即使 V_r = 0、光强 ${S.I}% 也测不到电流——记作 V₀ = 0。`, 'info');
        return;
      }
      if (iNow > 0.05) { api.say(`电流还没降到零（约 ${iNow.toFixed(2)} nA）。继续增大 V_r，直到电流刚好归零再记录。`, 'bad'); return; }
      const over = S.Vr - E; // how far past the true stopping point
      if (over > 0.06) { api.say('电流在更低的电压就已经归零了。遏止电压是电流<b>刚好</b>降到零的那一点——往回调一调，找到它开始归零的位置。', 'bad'); return; }
      api.say(`已记录：${S.metal.name}，λ = ${S.nm} nm，光强 ${S.I}%，V₀ = ${S.Vr.toFixed(2)} V。`, 'info');
      o.onRecord({ nm: S.nm, nu: nu14(S.nm), I: S.I, V: S.Vr, metal: S.metal.id });
    }

    /* ---- drawing ---- */
    const geo = () => {
      const W = cvA.w, Hh = cvA.h;
      return { W, Hh, ex: W * 0.2, cx: W * 0.78, y0: Hh * 0.3, y1: Hh * 0.8, lamp: { x: W * 0.07, y: Hh * 0.12 } };
    };
    function spawn(G) {
      const ty = G.y0 + rnd() * (G.y1 - G.y0);
      const tx = G.ex + 3, dx = tx - G.lamp.x, dy = ty - G.lamp.y, L = Math.hypot(dx, dy) || 1;
      photons.push({ x: G.lamp.x, y: G.lamp.y, vx: (dx / L) * 220, vy: (dy / L) * 220, tx, ty });
    }
    function step(dt) {
      const G = geo(), D = G.cx - G.ex - 6, E = emax(S.nm, S.metal.W);
      acc += dt * 30 * (S.I / 100);
      while (acc >= 1) { acc -= 1; spawn(G); }
      for (let i = photons.length - 1; i >= 0; i--) {
        const q = photons[i]; q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.x >= q.tx) {
          photons.splice(i, 1);
          if (E > 0) electrons.push({ x: 0, y: q.ty, ke: E * rnd(), dir: 1, life: 0 });
        }
      }
      for (let i = electrons.length - 1; i >= 0; i--) {
        const e = electrons[i]; e.life += dt;
        const rem = e.ke - S.Vr * (e.x / D);
        const sp = Math.max(18, 95 * Math.sqrt(Math.max(rem, 0)));
        if (rem <= 0 && e.dir > 0) e.dir = -1;
        e.x += e.dir * sp * dt;
        if (e.x >= D || e.x < 0 || e.life > 6) electrons.splice(i, 1);
      }
    }
    function drawA() {
      const g = cvA.g, G = geo(), { W, Hh } = G;
      g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
      // tube envelope
      g.strokeStyle = col('--line'); g.lineWidth = 1.5;
      const bx = G.ex - 18, bw = G.cx - G.ex + 36, by = G.y0 - 14, bh = G.y1 - G.y0 + 28;
      g.beginPath(); if (g.roundRect) g.roundRect(bx, by, bw, bh, 18); else g.rect(bx, by, bw, bh); g.stroke();
      // beam
      if (S.I > 0) {
        g.fillStyle = lamColor(S.nm, 0.05 + 0.15 * (S.I / 100));
        g.beginPath(); g.moveTo(G.lamp.x, G.lamp.y); g.lineTo(G.ex + 3, G.y0); g.lineTo(G.ex + 3, G.y1); g.closePath(); g.fill();
      }
      g.fillStyle = col('--line'); g.beginPath(); g.arc(G.lamp.x, G.lamp.y, 10, 0, 7); g.fill();
      g.fillStyle = lamColor(S.nm, 1); g.globalAlpha = S.I > 0 ? 0.35 + 0.65 * (S.I / 100) : 0.15; g.beginPath(); g.arc(G.lamp.x, G.lamp.y, 6, 0, 7); g.fill(); g.globalAlpha = 1;
      // electrodes
      g.fillStyle = col('--muted'); g.fillRect(G.ex - 5, G.y0, 8, G.y1 - G.y0);
      g.fillStyle = col('--fg'); g.fillRect(G.cx - 2, G.y0, 5, G.y1 - G.y0);
      // labels
      g.font = '11px ' + col('--body-font'); g.fillStyle = col('--muted'); g.textBaseline = 'top'; g.textAlign = 'center';
      g.fillText(S.metal.name, G.ex, G.y1 + 18);
      g.fillText('收集极', G.cx, G.y1 + 18);
      g.textAlign = 'right'; g.fillText(`V_r = ${S.Vr.toFixed(2)} V`, W - 6, 6);
      // field arrows hint (retarding: collector negative)
      g.textAlign = 'center'; g.fillText('−', G.cx + 12, G.y0 - 2); g.fillText('+', G.ex - 14, G.y0 - 2);
      const D = G.cx - G.ex - 6;
      if (ctx.reduced) {
        const E = emax(S.nm, S.metal.W);
        g.fillStyle = col('--accent'); g.strokeStyle = col('--accent'); g.lineWidth = 1.5;
        if (E > 0 && S.I > 0) {
          for (let k = 0; k < 4; k++) {
            const ke = E * (0.2 + 0.25 * k), stop = S.Vr > 0 ? Math.min(1, ke / S.Vr) : 1, y = G.y0 + (G.y1 - G.y0) * (0.15 + 0.23 * k);
            g.beginPath(); g.moveTo(G.ex + 6, y); g.lineTo(G.ex + 6 + D * stop, y); g.stroke();
            g.beginPath(); g.arc(G.ex + 6 + D * stop, y, 3, 0, 7); g.fill();
          }
        }
      } else {
        for (const q of photons) { g.fillStyle = lamColor(S.nm, 1); g.beginPath(); g.arc(q.x, q.y, 2, 0, 7); g.fill(); }
        g.fillStyle = col('--accent');
        for (const e of electrons) { g.beginPath(); g.arc(G.ex + 6 + e.x, e.y, 2.6, 0, 7); g.fill(); }
      }
    }
    function drawIV() {
      const g = cvI.g, W = cvI.w, Hh = cvI.h;
      g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
      const isat = Math.max(1, ISAT * S.I);
      const top = Math.ceil((isat * 1.1) / 5) * 5 || 5, st = top / 5;
      const yt = []; for (let v = 0; v <= top + 1e-9; v += st) yt.push(+v.toFixed(2));
      const A = h.axes(g, W, Hh, { x0: 0, x1: 5, y0: -0.05 * top, y1: top, pad: { l: 40, r: 10, t: 22, b: 34 },
        xTicks: [0, 1, 2, 3, 4, 5], yTicks: yt, xLabel: '反向电压 V_r (V)', yLabel: '电流 (nA)' }, col);
      g.fillStyle = col('--muted'); g.font = '11px ' + col('--body-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`本组设置的扫描记录（λ ${S.nm} nm，光强 ${S.I}%）`, A.p.l, 10);
      g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
      g.strokeStyle = col('--line'); g.beginPath(); g.moveTo(A.p.l, A.Y(0)); g.lineTo(A.p.l + A.iw, A.Y(0)); g.stroke();
      g.fillStyle = col('--s1');
      for (const [v, i] of S.trace) { g.beginPath(); g.arc(A.X(v), A.Y(i), 2.2, 0, 7); g.fill(); }
      g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(A.X(S.Vr), A.p.t); g.lineTo(A.X(S.Vr), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
      g.restore();
    }

    const lp = h.loop((dt) => { step(dt); drawA(); });
    if (!ctx.reduced) lp.start();
    // meter jitter: a live instrument (not ambient animation), but static under reduced motion
    const timer = ctx.reduced ? 0 : setInterval(() => { big.textContent = reading().toFixed(2); }, 350);
    cvA.onResize(drawA); cvI.onResize(drawIV);
    const unwatch = watchTheme(() => { drawA(); drawIV(); });
    changed();
    return {
      S, setLam(v) { S.nm = v; sL.set(v); changed(); }, setMetal(m) { S.metal = m; changed(); },
      destroy() { lp.stop(); clearInterval(timer); cvA.destroy(); cvI.destroy(); unwatch(); },
    };
  }

  // Data table with remove buttons
  function recTable(h, recs, onChange, showI) {
    const el = h.el, tbody = el('tbody');
    const wrap = el('div', { class: 'dtable' }, [el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: '#' }), el('th', { text: 'λ (nm)' }), el('th', { text: 'ν (10¹⁴ Hz)' }), showI ? el('th', { text: '光强' }) : null, el('th', { text: 'V₀ (V)' }), el('th', { text: '' })])]), tbody])]);
    function render() {
      if (!recs.length) { tbody.replaceChildren(el('tr', {}, [el('td', { colspan: showI ? 6 : 5, text: '还没有记录' })])); return; }
      tbody.replaceChildren(...recs.map((r, i) => el('tr', {}, [el('td', { text: String(i + 1) }), el('td', { text: String(r.nm) }), el('td', { text: r.nu.toFixed(3) }), showI ? el('td', { text: r.I + ' %' }) : null, el('td', { text: r.V.toFixed(2) }),
        el('td', {}, [el('button', { type: 'button', class: 'einstein-x', 'aria-label': '删除第 ' + (i + 1) + ' 行', text: '✕', onclick: () => { recs.splice(i, 1); render(); onChange(); } })])])));
    }
    render();
    return { el: wrap, render };
  }

  // V₀–ν plot. sets = [{pts, color, label, faint}]
  function drawMillikan(cv, h, col, sets, nuNow) {
    const g = cv.g, W = cv.w, Hh = cv.h;
    g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
    const A = h.axes(g, W, Hh, { x0: 4, x1: 16, y0: 0, y1: 4.5, pad: { l: 40, r: 10, t: 12, b: 34 }, xTicks: [4, 6, 8, 10, 12, 14, 16], yTicks: [0, 1, 2, 3, 4],
      xLabel: '频率 ν (10¹⁴ Hz)', yLabel: '遏止电压 V₀ (V)' }, col);
    g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
    if (nuNow) { g.strokeStyle = col('--grid'); g.lineWidth = 2; g.beginPath(); g.moveTo(A.X(nuNow), A.p.t); g.lineTo(A.X(nuNow), A.p.t + A.ih); g.stroke(); }
    const fits = [];
    for (const s of sets) {
      const c = col(s.color); g.globalAlpha = s.faint ? 0.45 : 1;
      const pos = s.pts.filter((r) => r.V > 0).map((r) => [r.nu, r.V]);
      const f = pos.length >= 3 ? fit(pos) : null; fits.push(f);
      if (f) { g.strokeStyle = c; g.lineWidth = s.faint ? 1.5 : 2; g.beginPath(); g.moveTo(A.X(4), A.Y(f.a + f.b * 4)); g.lineTo(A.X(16), A.Y(f.a + f.b * 16)); g.stroke(); }
      g.fillStyle = c;
      for (const r of s.pts) { g.beginPath(); g.arc(A.X(r.nu), A.Y(r.V), 4, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    g.restore();
    g.font = '11px ' + col('--body-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
    let y = A.p.t + 10;
    for (const s of sets) { g.globalAlpha = s.faint ? 0.6 : 1; g.fillStyle = col(s.color); g.beginPath(); g.arc(A.p.l + 10, y, 4, 0, 7); g.fill(); g.fillStyle = col('--fg'); g.fillText(s.label, A.p.l + 18, y); y += 15; g.globalAlpha = 1; }
    return fits;
  }

  CHALLENGES.einstein = {
    title: '光照出电子',
    _m: { iTrue, v0True, emax, nu14, fit, HC },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color, el = h.el;
      const shared = { na: [] }; // sodium records from stage 2, shown for comparison in stage 3

      /* ================= Stage 1 ================= */
      const stage1 = {
        title: '强度之谜',
        task: `<p>1902 年，基尔的 Philipp Lenard 用紫外光照射真空管里的金属板，发现板会放出带负电的粒子（电子）。他在收集极上加一个<b>反向电压</b> $V_r$ 来“拦”电子：$V_r$ 越大，能到达收集极的电子越少；当 $V_r$ 达到某个值 $V_0$（遏止电压）时，电流恰好归零——此时连最快的电子也被挡回，$eV_0$ 就是逸出电子的最大动能。</p>
<p>按照麦克斯韦的光的波动理论，光强越大，电场振幅越大，电子被“摇”出来时应当越快。先预测，再测量。</p>`,
        hints: [
          '测量方法：固定 λ 与光强，从 0 开始增大 $V_r$（细调按钮 ±0.01 V），看电流读数刚好落到噪声水平（约 0.00±0.02 nA）时按「记录 V₀」。',
          '把光强改成另一个值（例如 20% 和 80%），在同一 λ = 400 nm 重复。注意：电流的大小变了，但归零的位置呢？',
          '两次的 $V_0$ 都约为 0.82 V。光强加倍，电流加倍，遏止电压不变。',
        ],
        answer: '在 400 nm 照射钠时，无论光强多少，$V_0\\approx0.82$ V；光强只改变饱和电流（即单位时间逸出的电子数）。这与波动理论的预言相反：最大动能与光强无关。',
        build(body, api) {
          const recs = [];
          let predicted = false, rev = false;
          const intro = el('div', { class: 'lab-stage' });
          const q1 = h.quiz({ question: '<b>先预测：</b>同一波长下把光强加倍，遏止电压 $V_0$ 会？', options: [
            { label: '加倍', ok: true, why: '记下你的预测。现在去测。' },
            { label: '变为 √2 倍', ok: true, why: '（按波动理论：能量 ∝ 振幅²，这是一个合理的猜测。）记下你的预测，现在去测。' },
            { label: '不变', ok: true, why: '记下你的预测。现在去测。' },
            { label: '减半', ok: true, why: '记下你的预测。现在去测。' },
          ], onOk: () => { if (!predicted) { predicted = true; reveal(); } } });
          intro.append(q1.el);
          body.append(intro);
          const main = el('div', { class: 'lab-stage einstein-hidden' });
          body.append(main);
          const instr = el('p', { class: 'einstein-note', html: '金属：<b>钠 Na</b>。任务：在 <b>λ = 400 nm</b> 下，用两个相差至少 2 倍的光强各测一次 $V_0$。' });
          main.append(instr);
          let app = null;
          const tbl = recTable(h, recs, check, true);
          const q2wrap = el('div', { class: 'einstein-hidden' });
          const q2 = h.quiz({ question: '那么，光强改变的是……', options: [
            { label: '单个电子的最大能量', ok: false, why: '$V_0$ 没变，最大动能也就没变。' },
            { label: '电子的数目，而不是单个电子的能量', ok: true, why: '对：饱和电流 ∝ 光强，而 $V_0$ 不变。' },
            { label: '什么都没改变', ok: false, why: '看饱和电流（V_r = 0 时的读数）：它随光强变化。' },
            { label: '电子的电荷', ok: false, why: '电子电荷是常数。' },
          ], onOk: () => api.done('<b>Lenard 的观察（1902）：</b>光电子的最大能量与光强无关，光强只决定电子的数目——与波动理论的预言正相反。') });
          q2wrap.append(q2.el);
          function reveal() {
            main.classList.remove('einstein-hidden');
            app = apparatus(ctx, main, api, { prefix: 'ein1', metal: NA, nm: 400, I: 30, seed: 11, onRecord: (r) => { recs.push(r); tbl.render(); check(); } });
            main.append(tbl.el, q2wrap);
            api.typeset(main);
          }
          function check() {
            const at = recs.filter((r) => r.nm === 400 && r.V > 0);
            let pair = false;
            for (const a of at) for (const b of at) if (b.I >= 2 * a.I && Math.abs(a.V - b.V) <= 0.1) pair = true;
            if (pair && !rev) { rev = true; q2wrap.classList.remove('einstein-hidden'); api.say('两个光强、同一 λ 都测到了。比较两次的 $V_0$ 和 $V_r=0$ 时的电流。', 'info'); api.typeset(q2wrap); }
            else if (!pair && at.length >= 2 && !rev) {
              const Is = at.map((r) => r.I); const ratio = Math.max(...Is) / Math.max(1, Math.min(...Is));
              if (ratio < 2) api.say('两次的光强至少要相差 2 倍（例如 20% 与 60%）。', 'info');
            }
          }
          return { destroy() { app && app.destroy(); } };
        },
      };

      /* ================= Stage 2 ================= */
      const stage2 = {
        title: '频率的规律',
        task: `<p>强度不决定电子能量，那什么决定？换个旋钮：<b>波长</b>。金属仍是钠。</p>
<p>在至少 <b>4 个不同波长</b>下测出遏止电压（其中也试试长于 550 nm 的光）。下方图中按频率 $\\nu = c/\\lambda$ 画出你的数据；有 3 个以上 $V_0>0$ 的点时会显示最小二乘直线。</p>`,
        hints: [
          '取分散的波长，例如 250、300、350、400、450、500 nm，再试一个 600 nm。长波那一端：即使很亮也没有电流——这是一个阈值。',
          '$V_0$ 与 $\\nu$ 成直线关系 $V_0 = k\\nu - b$。若电子吸收的能量是 $h\\nu$，那么 $eV_0 = h\\nu - W$，斜率 $k = h/e$，所以 $h = e\\cdot k$。注意 ν 的单位是 $10^{14}$ Hz。',
          '斜率约 0.414 V/(10¹⁴ Hz)，$h = 1.602\\times10^{-19}\\times0.414\\times10^{-14}\\approx 6.63\\times10^{-34}$ J·s；直线与横轴交于 $\\nu_0\\approx5.5\\times10^{14}$ Hz。',
        ],
        answer: '$eV_0 = h\\nu - W$。钠的数据落在斜率 $h/e\\approx4.14\\times10^{-15}$ V·s 的直线上，故 $h\\approx6.63\\times10^{-34}$ J·s；截距给出逸出功 $W\\approx2.28$ eV，阈值频率 $\\nu_0 = W/h\\approx5.51\\times10^{14}$ Hz（λ₀ ≈ 544 nm）。低于 $\\nu_0$ 的光再亮也打不出电子。',
        build(body, api) {
          const recs = shared.na;
          let live = false;
          const app = apparatus(ctx, body, api, { prefix: 'ein2', onChange: () => { if (live) refresh(); }, metal: NA, nm: 450, I: 50, seed: 22, onRecord: (r) => { recs.push(r); refresh(); } });
          const tbl = recTable(h, recs, () => refresh(), false);
          const st = el('div', { class: 'lab-stage' });
          body.append(el('div', { class: 'einstein-row' }, [tbl.el, st]));
          const cv = h.canvas(st, { aspect: 0.7, minH: 220, maxH: 320 });
          const rd = el('div', { class: 'lab-readout' });
          const rS = h.readout('拟合斜率'), rN = h.readout('拟合直线与横轴交点'), rC = h.readout('不同波长数');
          rd.append(rS.el, rN.el, rC.el);
          body.append(rd);
          let f = null, okH = false, okN = false;
          const distinct = () => new Set(recs.map((r) => r.nm)).size;
          function refresh() {
            tbl.render();
            f = drawMillikan(cv, h, col, [{ pts: recs, color: '--s2', label: '钠 Na（你的数据）' }], nu14(app.S.nm))[0];
            rC.set(`${distinct()}（需 ≥ 4）`);
            if (f && f.b > 0) { rS.set(`${f.b.toFixed(4)} V/(10¹⁴ Hz)`); rN.set(`${(-f.a / f.b).toFixed(2)}×10¹⁴ Hz`); }
            else { rS.set('需 ≥ 3 个 V₀ > 0 的点'); rN.set('—'); }
          }
          const ready = () => distinct() >= 4 && f && f.b > 0;
          const notReady = { ok: false, msg: '先在至少 4 个不同波长下测量（其中 ≥3 个 V₀ > 0），让图上出现拟合直线。' };
          const aH = h.answer({ label: '由斜率求 $h$（容差 ±6%）', unit: '×10⁻³⁴ J·s', placeholder: '例如 5.0',
            check: (v) => {
              if (!ready()) return notReady;
              const own = (f.b * QE * 1e-14) / 1e-34;
              const ok = Math.abs(v / H_TRUE - 1) <= 0.06 || (Math.abs(own / H_TRUE - 1) <= 0.15 && Math.abs(v / own - 1) <= 0.03);
              if (ok) return { ok, msg: `对。你的直线给出 h ≈ ${own.toFixed(2)}×10⁻³⁴ J·s。` };
              if (Math.abs(v / (f.b * 1e-14 / 1e-34) - 1) < 0.1 || Math.abs(v / f.b - 1) < 0.1) return { ok, msg: '斜率的单位是 V/(10¹⁴ Hz)；$h = e\\times$斜率，别忘了乘 e 并换算 10¹⁴。' };
              return { ok, msg: '不对。$eV_0$ 是能量，$\\nu$ 是频率：能量/频率 的比例系数是什么？' };
            }, onOk: () => { okH = true; fin(); } });
          const aN = h.answer({ label: '阈值频率 $\\nu_0$（低于它没有电子；容差 ±5%）', unit: '×10¹⁴ Hz', placeholder: '例如 6.0',
            check: (v) => {
              if (!ready()) return notReady;
              const own = -f.a / f.b;
              const ok = Math.abs(v / 5.513 - 1) <= 0.05 || (Math.abs(own / 5.513 - 1) <= 0.1 && Math.abs(v / own - 1) <= 0.03);
              return ok ? { ok, msg: `对：对应阈值波长约 ${(CL / (v * 1e14) * 1e9).toFixed(0)} nm。` } : { ok, msg: '把拟合直线延长到 V₀ = 0，读出与横轴的交点。' };
            }, onOk: () => { okN = true; fin(); } });
          body.append(aH.el, aN.el);
          function fin() { if (okH && okN) api.done('<b>爱因斯坦光电方程 $E_{k,\\max} = h\\nu - W$：</b>光以 $h\\nu$ 的整份被单个电子吸收；斜率就是普朗克常数 $h/e$，截距是金属的逸出功。'); }
          const unwatch = watchTheme(refresh);
          cv.onResize(refresh);
          live = true; refresh();
          return { destroy() { app.destroy(); cv.destroy(); unwatch(); } };
        },
      };

      /* ================= Stage 3 ================= */
      const stage3 = {
        title: '未知金属 X',
        task: `<p>实验室送来一块成分不明的金属 X。<b>预言</b>：用 <b>220 nm</b> 的紫外光照射它，遏止电压是多少？</p>
<p>你可以在其他波长下随意测量。但为了让这是一个真正的预言，单色仪的 <b>215–225 nm</b> 档位在你提交预言之前是锁住的。</p>`,
        hints: [
          '不必重新测斜率：若上一关的规律普适，X 的直线斜率也是 $h/e$。只要在任一波长测一个 $V_0$，就能定出 X 的逸出功 $W = h\\nu - eV_0$。',
          '例如在 250 nm 测得 $V_0$，则 $W = 1239.84/250 - V_0$（eV），再算 $V_0(220) = 1239.84/220 - W$。阈值波长 $\\lambda_0 = 1239.84/W$ nm。',
          'X 的逸出功约 3.6 eV：$V_0(220\\,\\text{nm})\\approx 5.64 - 3.60 = 2.04$ V，$\\lambda_0\\approx 344$ nm。',
        ],
        answer: '$hc = 1239.84$ eV·nm。测得 X 的数据给出 $W\\approx3.60$ eV，于是 $V_0(220\\,\\text{nm}) = 1239.84/220 - 3.60\\approx2.04$ V，阈值 $\\lambda_0 = 1239.84/3.60\\approx344$ nm。X 的数据点与钠平行：斜率同为 $h/e$，只是截距（逸出功）不同。',
        build(body, api) {
          const recs = [];
          let predicted = false, okL = false;
          let live = false;
          const app = apparatus(ctx, body, api, { prefix: 'ein3', onChange: () => { if (live) refresh(); }, metal: MX, nm: 260, I: 50, seed: 33, lock: () => !predicted, lockBand: [215, 225],
            onLocked: () => api.say('215–225 nm 档位已锁定：先在下方提交你对 220 nm 的预言。', 'info'),
            onRecord: (r) => {
              recs.push(r); refresh();
              if (predicted && r.nm === 220) api.say(`验证：220 nm 处测得 V₀ = ${r.V.toFixed(2)} V，你的预言是 ${predV.toFixed(2)} V。`, 'good');
            } });
          const tbl = recTable(h, recs, () => refresh(), false);
          const st = el('div', { class: 'lab-stage' });
          body.append(el('div', { class: 'einstein-row' }, [tbl.el, st]));
          const cv = h.canvas(st, { aspect: 0.7, minH: 220, maxH: 320 });
          function refresh() {
            tbl.render();
            const sets = [{ pts: recs, color: '--s4', label: '金属 X' }];
            if (shared.na.length) sets.push({ pts: shared.na, color: '--s2', label: '钠 Na（上一关）', faint: true });
            drawMillikan(cv, h, col, sets, nu14(app.S.nm));
          }
          let predV = NaN;
          const lockNote = el('p', { class: 'einstein-note', html: '🔒 220 nm 档位：提交预言后解锁。' });
          const aP = h.answer({ label: '预言：220 nm 照射 X 时的遏止电压（容差 ±0.08 V）', unit: 'V', placeholder: '例如 1.50',
            check: (v) => {
              const ok = Math.abs(v - (HC / 220 - MX.W)) <= 0.08;
              return ok ? { ok, msg: '预言已记录，220 nm 档位解锁——去测一下验证它。' } : { ok, msg: recs.some((r) => r.V > 0) ? '不对。用你的数据定出 X 的逸出功，再用 $h\\nu - W$。' : '先在别的波长测一测 X（比如 250–300 nm）。' };
            }, onOk: (v) => { if (!predicted) { predicted = true; predV = v; lockNote.innerHTML = '220 nm 档位已解锁：把波长调到 220 nm，测量并「记录 V₀」来验证你的预言。'; } fin(); } });
          const aL = h.answer({ label: 'X 的阈值波长 $\\lambda_0$（更长的光打不出电子；容差 ±2%）', unit: 'nm', placeholder: '例如 400',
            check: (v) => { const ok = Math.abs(v / (HC / MX.W) - 1) <= 0.02; return ok ? { ok, msg: '对。' } : { ok, msg: v > 0 && v < 200 ? '这是频率还是波长？' : '阈值处 $h\\nu_0 = W$，即 $\\lambda_0 = hc/W$。' }; },
            onOk: () => { okL = true; fin(); } });
          body.append(lockNote, aP.el, aL.el);
          function fin() { if (predicted && okL) api.done('<b>斜率对所有金属都一样：</b>不同金属只差一个逸出功 $W$，而 $V_0$–$\\nu$ 直线的斜率永远是 $h/e$——光的能量子 $h\\nu$ 是光自身的属性，与金属无关。'); }
          const unwatch = watchTheme(refresh);
          cv.onResize(refresh);
          live = true; refresh(); api.typeset(body);
          return { destroy() { app.destroy(); cv.destroy(); unwatch(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
