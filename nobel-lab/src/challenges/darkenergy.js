/* 宇宙的减速参数 — challenge for Nobel Physics 2011 (Perlmutter; Schmidt & Riess: accelerating expansion, distant SNe Ia)
 * Stage 1: 14 nearby SNe Ia (synthetic, seeded 164). Peak absolute magnitudes scatter σ ≈ 0.29 mag. The reader measures
 *   Δm15(B) on one light curve, finds which observable predicts the peak brightness, calibrates M_corr = M − b(Δm15 − 1.1)
 *   (data generated with b = 0.8 and 0.12 mag intrinsic scatter; Hamuy et al. 1996 B-band slope 0.78 ± 0.18):
 *   σ → 0.11 mag at b ≈ 0.8, i.e. distances to (ln10/5)·0.11 ≈ 5 %.
 * Stage 2: Hubble diagram of 18 low-z + 42 high-z SNe (z ≤ 0.87; seeded 7) drawn from a flat (Ω_m, Ω_Λ) = (0.28, 0.72)
 *   universe with 0.13 mag intrinsic scatter + measurement errors. χ² is minimised analytically over the offset ℳ
 *   (absolute magnitude and H0 are degenerate). For these data: Ω_Λ = 0 ⇒ best Ω_m < 0; flat ⇒ Ω_m = 0.275 (+0.07/−0.06).
 * Stage 3: q0 = Ω_m/2 − Ω_Λ from the acceleration equation; a(t) from ä = H0²(−Ω_m/(2a²) + Ω_Λ a); H0 = 70 km/s/Mpc
 *   (1/H0 = 13.97 Gyr): (0.28, 0.72) ⇒ t0 = 13.7 Gyr, z_t = (2Ω_Λ/Ω_m)^{1/3} − 1 = 0.73.
 * Distances: D_L = H0 d_L/c = (1+z) S_k(χ), χ = ∫0^z dz'/E(z'), E² = Ω_m(1+z)³ + Ω_k(1+z)² + Ω_Λ; μ = 5 log10(d_L/Mpc) + 25.
 */
(() => {
  const R = String.raw;
  const C_KMS = 299792.458, H0 = 70, TH = 977.792 / H0; // 1/H0 in Gyr
  const MU0 = 5 * Math.log10(C_KMS / H0) + 25;          // μ = MU0 + 5 log10 D_L
  const DLN = Math.LN10 / 5;                             // δd/d = (ln10/5)·δμ
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gaussR = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  // Schematic B-band template: magnitudes below peak at τ = t/s (days), s = stretch
  const tmpl = (tau) => { if (tau < 0) return 0.0062 * tau * tau; const F = 0.82 * Math.exp(-tau * tau / (2 * 9.6 * 9.6)) + 0.18 * Math.exp(-tau / 55); return -2.5 * Math.log10(F); };
  function sOfDm(dm) { let a = 0.4, b = 2.0; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (tmpl(15 / m) > dm) a = m; else b = m; } return (a + b) / 2; }

  /* ---------- FLRW distances ---------- */
  const E2 = (z, Om, OL) => { const x = 1 + z, Ok = 1 - Om - OL; return Om * x * x * x + Ok * x * x + OL; };
  function bigBang(Om, OL) { const Ok = 1 - Om - OL; for (let lx = 0; lx <= 4; lx += 0.005) { const x = 10 ** lx; if (Om * x * x * x + Ok * x * x + OL <= 0) return false; } return true; }
  const ZMAX = 1.0, DZ = 0.005, NZ = Math.round(ZMAX / DZ);
  function chiTable(Om, OL) { // comoving distance χ(z) (units c/H0) on a grid, Simpson per cell; null if E² ≤ 0 below ZMAX
    const chi = new Float64Array(NZ + 1); let prev = 1 / Math.sqrt(E2(0, Om, OL));
    for (let i = 1; i <= NZ; i++) {
      const z = i * DZ, e = E2(z, Om, OL), em = E2(z - DZ / 2, Om, OL);
      if (e <= 0 || em <= 0) return null;
      const cur = 1 / Math.sqrt(e), mid = 1 / Math.sqrt(em);
      chi[i] = chi[i - 1] + (DZ * (prev + 4 * mid + cur)) / 6; prev = cur;
    }
    return chi;
  }
  function DL(z, Om, OL, chi) {
    chi = chi || chiTable(Om, OL); if (!chi) return NaN;
    const f = Math.min(NZ - 1e-9, z / DZ), i = Math.floor(f), c = chi[i] + (chi[i + 1] - chi[i]) * (f - i);
    const Ok = 1 - Om - OL, sk = Math.sqrt(Math.abs(Ok)); let S;
    if (Math.abs(Ok) < 1e-9) S = c; else if (Ok > 0) S = Math.sinh(sk * c) / sk; else { const a = sk * c; if (a >= Math.PI) return NaN; S = Math.sin(a) / sk; }
    return (1 + z) * S;
  }
  const muEmpty = (z) => MU0 + 5 * Math.log10(z * (1 + z / 2)); // Ω_m = Ω_Λ = 0 (Milne)

  /* ---------- Stage 1 data: nearby SNe Ia ---------- */
  const SN1 = (() => {
    const r = mulberry32(164), out = [];
    for (let k = 0; k < 14; k++) {
      const dm = 0.82 + 0.98 * r(); const s = sOfDm(dm);
      const M = -19.30 + 0.8 * (dm - 1.1) + 0.12 * gaussR(r);
      const t0 = -11 + 5 * r(); const pts = [];
      for (let t = t0; t <= 40; t += 2.2 + 2.4 * r()) { const e = 0.025 + 0.025 * r(); pts.push([+t.toFixed(2), M + tmpl(t / s) + e * gaussR(r), e]); }
      out.push({ pts });
    }
    const rz = mulberry32(2011);
    for (const sn of out) { // "pipeline": least-squares template fit (stretch on a grid, peak magnitude analytic)
      let best = null;
      for (let s = 0.55; s <= 1.45; s += 0.002) {
        let sw = 0, swr = 0; for (const [t, m, e] of sn.pts) { const w = 1 / (e * e); sw += w; swr += w * (m - tmpl(t / s)); }
        const Mp = swr / sw; let c2 = 0; for (const [t, m, e] of sn.pts) c2 += ((m - Mp - tmpl(t / s)) / e) ** 2;
        if (!best || c2 < best.c2) best = { s, Mp, c2 };
      }
      sn.s = best.s; sn.M = best.Mp; sn.dm = tmpl(15 / best.s); sn.z = +(0.012 + 0.07 * rz()).toFixed(4); sn.t1 = sn.pts[0][0];
    }
    return out;
  })();
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  const sigCorr = (b) => sd(SN1.map((d) => d.M - b * (d.dm - 1.1)));
  const SIG_OK = 0.14;

  /* ---------- Stage 2 data: Hubble diagram ---------- */
  const SN2 = (() => {
    const r = mulberry32(7), out = [], chi = chiTable(0.28, 0.72), SI = 0.13;
    for (let k = 0; k < 18; k++) { const z = 0.012 + 0.09 * Math.pow(r(), 0.9); const vp = ((300 / (C_KMS * z)) * 5) / Math.LN10; const sm = 0.05 + 0.05 * r(); out.push({ z: +z.toFixed(4), e: +Math.sqrt(SI * SI + vp * vp + sm * sm).toFixed(3) }); }
    for (let k = 0; k < 42; k++) { const z = 0.17 + 0.72 * Math.pow(r(), 0.8); const sm = 0.05 + 0.2 * z + 0.06 * r(); out.push({ z: +z.toFixed(3), e: +Math.sqrt(SI * SI + sm * sm).toFixed(3) }); }
    for (const d of out) d.mu = +(MU0 + 5 * Math.log10(DL(d.z, 0.28, 0.72, chi)) + d.e * gaussR(r)).toFixed(3);
    return out.sort((a, b) => a.z - b.z);
  })();
  function fit(Om, OL) { // χ² minimised over the common offset ℳ (absolute magnitude + log H0)
    const chi = chiTable(Om, OL); if (!chi) return null;
    let sw = 0, swr = 0, swr2 = 0;
    for (const d of SN2) { const dl = DL(d.z, Om, OL, chi); if (!(dl > 0)) return null; const x = d.mu - MU0 - 5 * Math.log10(dl), w = 1 / (d.e * d.e); sw += w; swr += w * x; swr2 += w * x * x; }
    return { chi2: swr2 - (swr * swr) / sw, off: swr / sw, chi };
  }
  const OFF_LOW = (() => { let sw = 0, swr = 0; for (const d of SN2) if (d.z < 0.1) { const w = 1 / (d.e * d.e); sw += w; swr += w * (d.mu - muEmpty(d.z)); } return swr / sw; })();
  let BEST = null;
  function best() { // global minimum over physical models (Ω_m ≥ 0, with a Big Bang)
    if (BEST) return BEST;
    let b = { chi2: Infinity };
    const scan = (a0, a1, l0, l1, st) => { for (let Om = a0; Om <= a1 + 1e-9; Om += st) for (let OL = l0; OL <= l1 + 1e-9; OL += st) { if (Om < 0 || !bigBang(Om, OL)) continue; const f = fit(Om, OL); if (f && f.chi2 < b.chi2) b = { chi2: f.chi2, Om, OL }; } };
    scan(0, 1.5, -0.5, 1.5, 0.05);
    scan(Math.max(0, b.Om - 0.06), b.Om + 0.06, b.OL - 0.06, b.OL + 0.06, 0.005);
    return (BEST = b);
  }

  /* ---------- Stage 3: a(t) from ä = −Ω_m/(2a²) + Ω_Λ a (units H0 = 1), a(0) = 1, ȧ(0) = 1 ---------- */
  function history(Om, OL) {
    const acc = (a) => -Om / (2 * a * a) + OL * a;
    const run = (dir) => {
      const out = []; let t = 0, a = 1, v = 1, end = null;
      for (let i = 0; i < 6000; i++) {
        const h = dir * Math.min(0.004, (0.02 * a) / Math.max(1e-6, Math.abs(v)));
        const k1a = v, k1v = acc(a), k2a = v + 0.5 * h * k1v, k2v = acc(a + 0.5 * h * k1a);
        const k3a = v + 0.5 * h * k2v, k3v = acc(a + 0.5 * h * k2a), k4a = v + h * k3v, k4v = acc(a + h * k3a);
        a += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a); v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v); t += h;
        if (a < 0.012) { const rem = (Om > 0 ? 2 / 3 : 1) * (a / Math.max(1e-9, Math.abs(v))); t += dir * rem; out.push([t, 0, v]); end = dir < 0 ? 'bang' : 'crunch'; break; }
        out.push([t, a, v]);
        if (dir < 0 && v <= 0) { end = 'bounce'; break; }
        if (dir < 0 && t < -2.6) break;
        if (dir > 0 && (t > 1.3 || a > 4)) break;
      }
      return { pts: out, end };
    };
    const p = run(-1), f = run(1);
    const pts = p.pts.reverse().concat([[0, 1, 1]], f.pts);
    return { pts, end: p.end, fate: f.end, age: p.end === 'bang' ? -p.pts[0][0] : null, acc };
  }
  const interp = (pts, t) => { // linear interpolation of [t, a, v] at time t (units 1/H0)
    if (t <= pts[0][0]) return pts[0]; if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1];
    let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= t) lo = m; else hi = m; }
    const A = pts[lo], B = pts[hi], u = (t - A[0]) / (B[0] - A[0] || 1);
    return [t, A[1] + u * (B[1] - A[1]), A[2] + u * (B[2] - A[2])];
  };

  /* ---------- drawing helpers ---------- */
  function watchTheme(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; if (mq && mq.addEventListener) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-darkenergy')) return;
    const s = document.createElement('style'); s.id = 'st-darkenergy';
    s.textContent = `
.de-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px;margin-top:4px}
.de-sec[hidden]{display:none}
.de-sec h4{margin:0;font-size:14px}
.de-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.de-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font)}
.de-leg i{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.de-leg i.d{height:0;border-top:2px dashed currentColor;background:none}`;
    document.head.append(s);
  }
  function curve(g, A, x0, x1, f, color, width = 2, dash = [], n = 240) {
    g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath(); let first = true;
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = f(x); if (!isFinite(y)) { first = true; continue; } const Y = Math.max(A.p.t - 40, Math.min(A.p.t + A.ih + 40, A.Y(y))); if (first) { g.moveTo(A.X(x), Y); first = false; } else g.lineTo(A.X(x), Y); }
    g.stroke(); g.restore();
  }
  function dotErr(g, A, x, y, e, color, r = 2.6) {
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1;
    if (e) { g.beginPath(); g.moveTo(A.X(x), A.Y(y - e)); g.lineTo(A.X(x), A.Y(y + e)); g.stroke(); }
    g.beginPath(); g.arc(A.X(x), A.Y(y), r, 0, 6.2832); g.fill();
  }
  function label(g, col, text, x, y, color, align = 'left') {
    g.font = '11px ' + col('--mono-font'); g.textAlign = align; g.textBaseline = 'middle';
    const w = g.measureText(text).width, x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    g.fillStyle = col('--panel'); g.globalAlpha = 0.85; g.fillRect(x0 - 3, y - 8, w + 6, 16); g.globalAlpha = 1;
    g.fillStyle = color; g.fillText(text, x, y);
  }
  const leg = (h, items) => h.el('div', { class: 'de-leg', 'aria-hidden': 'true' }, items.map(([t, c, dash]) => h.el('span', {}, [h.el('i', { class: dash ? 'd' : '', style: dash ? `color:var(${c})` : `background:var(${c})` }), t])));
  const fmt = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

  CHALLENGES.darkenergy = {
    title: '宇宙的减速参数',
    _m: { SN1, SN2, sigCorr, fit, best, history, interp, DL, chiTable, bigBang, tmpl, MU0, TH, OFF_LOW, muEmpty },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color, el = h.el;

      /* ================= Stage 1: standard candles ================= */
      const stage1 = {
        title: '标准烛光',
        task: R`<p>1990 年代初。要测宇宙膨胀的历史，需要一种在几十亿光年外还看得见、而且<b>本身亮度已知</b>的天体：只要知道真实亮度 $M$，测到视亮度 $m$，距离就由距离模数 $\mu = m - M = 5\log_{10}(d/10\ \mathrm{pc})$ 给出。Ia 型超新星峰值时和整个星系一样亮，是最好的候选。</p>
<p>智利 Calán/Tololo 巡天给了你 14 颗近邻 Ia 型超新星的 B 波段光变曲线。它们足够近，距离可以直接由红移和哈勃定律算出，所以纵轴已经换算成绝对星等 $M_B$（星等越小越亮，所以向上为亮）。问题是：峰值亮度并不统一，弥散约 0.29 星等，相当于距离误差约 13%。这样的“烛光”还不够标准。（数据为模拟，光变曲线模板为示意。）</p>
<p><b>先亲手量一颗</b>：选一颗超新星，用游标读出它峰值时的星等，以及峰后 15 天的星等，二者之差记作 $\Delta m_{15}$。然后找找看，峰值亮度和什么有关。</p>`,
        hints: [
          '游标读出的是拟合光变曲线在该时刻的星等。t = 0 是峰值，再把游标移到 t = 15 天，两个读数相减。',
          '在散点图里换不同的横轴。红移只告诉你它有多远（已经换算掉了）；首次观测的时间只取决于运气。哪一个量和峰值星等排成一条斜带？',
          '下降得慢（$\\Delta m_{15}$ 小）的超新星更亮。用 $M_{\\rm corr} = M - b\\,(\\Delta m_{15} - 1.1)$ 校正，$b \\approx 0.8$ 时弥散最小，约 0.11 星等；距离误差 ≈ (ln10/5)·0.11 ≈ 5%。',
        ],
        answer: R`峰值亮度与光变曲线的宽度相关：亮的超新星衰减得慢（$\Delta m_{15}$ 小），暗的衰减得快。这就是<b>菲利普斯关系</b>（Phillips 1993；更早有 Pskovskii 1977 的提示）。线性校正 $M_{\rm corr} = M - b(\Delta m_{15} - 1.1)$ 在 $b \approx 0.8$ 时把弥散从 0.29 降到 0.11 星等（Hamuy 等 1996 的 B 波段斜率为 0.78 ± 0.18）。由 $\mu = 5\log_{10} d + \text{常数}$，$\delta d/d = (\ln 10/5)\,\delta\mu \approx 0.46\,\delta\mu$，所以距离误差从约 13% 降到约 5%。`,
        build(body, api) {
          const S = { sel: 1, tc: 0, xv: 'z', b: 0, stepB: false, stepC: false };
          const st = el('div', { class: 'lab-stage' }); body.append(st);
          const cv = h.canvas(st, { aspect: 0.58, minH: 230, maxH: 360 });
          cv.canvas.setAttribute('aria-label', '14 颗近邻 Ia 型超新星的光变曲线，选中的一颗带数据点');
          body.append(leg(h, [['所选超新星的拟合曲线', '--accent'], ['其余 13 颗', '--muted'], ['游标', '--s2']]));
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const sSel = h.slider({ label: '选择超新星', min: 1, max: SN1.length, step: 1, value: S.sel + 1, format: (v) => '#' + v, onInput: (v) => { S.sel = v - 1; draw(); ro(); } });
          const sT = h.slider({ label: '游标时间 t（相对峰值）', min: -10, max: 40, step: 0.5, value: 0, format: (v) => fmt(v, 1) + ' 天', onInput: (v) => { S.tc = v; draw(); ro(); } });
          ctl.append(sSel.el, sT.el);
          const rw = el('div', { class: 'lab-readout' }); body.append(rw);
          const rT = h.readout('游标处 M_B(t)'), rN = h.readout('数据点数 / 首次观测');
          rw.append(rT.el, rN.el);
          const Mfit = (d, t) => d.M + tmpl(t / d.s);
          function ro() {
            const d = SN1[S.sel];
            rT.set(`${fmt(Mfit(d, S.tc), 2)} mag @ t = ${fmt(S.tc, 1)} d`);
            rN.set(`${d.pts.length} 点 / t = ${fmt(d.t1, 1)} d`);
          }
          const ansA = h.answer({
            label: R`所选超新星的 $\Delta m_{15}$（峰后 15 天比峰值暗多少星等；容差 ±0.06）`, unit: 'mag', placeholder: '例如 1.2',
            check: (v) => {
              const d = SN1[S.sel];
              if (Math.abs(v - d.dm) <= 0.06) return { ok: true, msg: `对：#${S.sel + 1} 的 Δm₁₅ = ${d.dm.toFixed(2)} mag。其余 13 颗已用同样方法量好，见下方。` };
              if (Math.abs(v + d.dm) <= 0.06) return { ok: false, msg: '符号反了：峰后变暗，星等变大，所以 Δm₁₅ 为正。' };
              const other = SN1.findIndex((x) => Math.abs(v - x.dm) <= 0.03);
              if (other >= 0 && other !== S.sel) return { ok: false, msg: `这接近 #${other + 1} 的值；检查一下滑块选中的是哪一颗（现在是 #${S.sel + 1}）。` };
              return { ok: false, msg: '把游标放在 t = 0 读一次，再放在 t = 15 天读一次，二者相减。' };
            },
            onOk: () => { if (!S.stepB) { S.stepB = true; secB.hidden = false; api.typeset(secB); drawS(); } },
          });
          body.append(ansA.el);

          /* --- B: correlations --- */
          const secB = el('div', { class: 'de-sec', hidden: true }); body.append(secB);
          const xc = h.choice({ label: '散点图横轴', value: S.xv, options: [{ value: 'z', label: '红移 z' }, { value: 't1', label: '首次观测时刻' }, { value: 'dm', label: 'Δm₁₅（衰减速度）' }], onChange: (v) => { S.xv = v; drawS(); } });
          const st2 = el('div', { class: 'lab-stage' });
          secB.append(el('h4', { text: '峰值亮度和什么有关？' }), el('p', { class: 'de-note', text: '纵轴是 14 颗超新星各自的峰值绝对星等。换横轴看看。' }), xc.el, st2);
          const cvS = h.canvas(st2, { aspect: 0.55, minH: 210, maxH: 320 });
          const quiz = h.quiz({
            question: '数据说明了什么？',
            options: [
              { label: '离得越远（红移越大）的超新星越亮', ok: false, why: '纵轴已经是绝对星等，距离已经换算掉了。红移与峰值亮度之间看不出相关。' },
              { label: '衰减越慢（$\\Delta m_{15}$ 越小）的超新星越亮', ok: true, why: '对。光变曲线越宽，峰值越亮：宽–亮关系。' },
              { label: '衰减越快的超新星越亮', ok: false, why: '方向反了：看 Δm₁₅ 大的那一端，点在下方（星等大，暗）。' },
              { label: '峰值亮度与任何可观测量都无关，只能接受 0.3 星等的弥散', ok: false, why: '换成 Δm₁₅ 作横轴再看看：点排成了一条斜带。' },
            ],
            onOk: () => { if (!S.stepC) { S.stepC = true; S.xv = 'dm'; xc.set('dm'); secC.hidden = false; api.typeset(secC); drawS(); roC(); } },
          });
          secB.append(quiz.el);

          /* --- C: calibrate --- */
          const secC = el('div', { class: 'de-sec', hidden: true }); body.append(secC);
          const sB = h.slider({ label: R`校正系数 b（M_corr = M − b·(Δm₁₅ − 1.1)）`, min: 0, max: 2, step: 0.01, value: 0, format: (v) => v.toFixed(2) + ' mag/mag', onInput: (v) => { S.b = v; drawS(); roC(); } });
          const rwC = el('div', { class: 'lab-readout' });
          const rRaw = h.readout('校正前弥散 σ'), rCor = h.readout('校正后弥散 σ'), rLim = h.readout('目标');
          rwC.append(rRaw.el, rCor.el, rLim.el);
          const ansD = h.answer({
            label: R`校正后的弥散对应多大的距离误差 $\delta d/d$？（%，容差 ±1）`, unit: '%', placeholder: '例如 10',
            check: (v) => {
              const sg = sigCorr(S.b);
              if (sg > SIG_OK) return { ok: false, msg: `先把弥散校正到 ${SIG_OK} 星等以下。` };
              const want = 100 * DLN * sg;
              if (Math.abs(v - want) <= 1) return { ok: true, msg: `对：$\\delta d/d = (\\ln 10/5)\\,\\sigma = ${(DLN).toFixed(3)}\\times${sg.toFixed(3)} \\approx ${want.toFixed(1)}\\%$。` };
              if (Math.abs(v - 100 * DLN * sigCorr(0)) <= 1.5) return { ok: false, msg: '这是校正前的距离误差。' };
              if (Math.abs(v - 100 * sg) <= 1.5) return { ok: false, msg: '星等不是距离的百分比：$\\mu = 5\\log_{10}d + $ 常数，对它求微分。' };
              return { ok: false, msg: '$\\mu = 5\\log_{10} d + $ 常数 ⇒ $\\delta\\mu = \\frac{5}{\\ln 10}\\,\\frac{\\delta d}{d}$。' };
            },
            onOk: () => api.done('<b>菲利普斯关系（宽–亮关系）：</b>Ia 型超新星峰值越亮，光变曲线衰减越慢。用光变曲线的形状校正之后，它们成了误差约 5% 的“标准烛光”，可以拿去量几十亿光年的距离。'),
          });
          secC.append(el('h4', { text: '把烛光校准' }), el('p', { class: 'de-note', text: '用衰减速度预言每颗超新星的真实亮度，把弥散压下去。目标：σ ≤ 0.14 星等。' }), sB.el, rwC, ansD.el);
          function roC() {
            const s0 = sigCorr(0), s1 = sigCorr(S.b);
            rRaw.set(`${s0.toFixed(3)} mag（距离 ±${(100 * DLN * s0).toFixed(0)}%）`);
            rCor.set(`${s1.toFixed(3)} mag`);
            rLim.set(s1 <= SIG_OK ? '已达到 ✓' : `σ ≤ ${SIG_OK} mag`);
          }

          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: -12, x1: 42, y0: -15.5, y1: -19.9, pad: { l: 46, r: 10, t: 12, b: 34 }, xTicks: [-10, 0, 10, 20, 30, 40], yTicks: [-16, -17, -18, -19], xLabel: '距峰值的天数 t', yLabel: '绝对星等 M_B' }, col);
            SN1.forEach((d, i) => { if (i !== S.sel) { g.globalAlpha = 0.45; curve(g, A, -11, 41, (t) => Mfit(d, t), col('--muted'), 1); g.globalAlpha = 1; } });
            const d = SN1[S.sel];
            curve(g, A, -11, 41, (t) => Mfit(d, t), col('--accent'), 2.2);
            d.pts.forEach(([t, m, e]) => dotErr(g, A, t, m, e, col('--fg'), 2.4));
            const x = A.X(S.tc), y = A.Y(Mfit(d, S.tc));
            g.strokeStyle = col('--s2'); g.lineWidth = 1.5; g.setLineDash([4, 3]);
            g.beginPath(); g.moveTo(x, A.p.t); g.lineTo(x, A.p.t + A.ih); g.moveTo(A.p.l, y); g.lineTo(A.p.l + A.iw, y); g.stroke(); g.setLineDash([]);
            g.fillStyle = col('--s2'); g.beginPath(); g.arc(x, y, 4, 0, 6.2832); g.fill();
            label(g, col, `#${S.sel + 1}`, A.p.l + A.iw - 6, A.p.t + 12, col('--accent'), 'right');
          }
          const XV = {
            z: { x0: 0, x1: 0.09, ticks: [0, 0.02, 0.04, 0.06, 0.08], lab: '红移 z', f: (v) => v.toFixed(2) },
            t1: { x0: -12, x1: -5, ticks: [-12, -10, -8, -6], lab: '首次观测时刻（距峰值天数）', f: String },
            dm: { x0: 0.8, x1: 1.9, ticks: [0.8, 1.0, 1.2, 1.4, 1.6, 1.8], lab: 'Δm₁₅ (mag)', f: (v) => v.toFixed(1) },
          };
          function drawS() {
            if (secB.hidden) return;
            const g = cvS.g, W = cvS.w, Hh = cvS.h, X = XV[S.xv];
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: X.x0, x1: X.x1, y0: -18.5, y1: -19.8, pad: { l: 50, r: 10, t: 12, b: 34 }, xTicks: X.ticks, yTicks: [-18.6, -18.9, -19.2, -19.5, -19.8], fmtX: X.f, fmtY: (v) => v.toFixed(1), xLabel: X.lab, yLabel: '峰值 M_B' }, col);
            const corr = !secC.hidden && S.xv === 'dm';
            if (corr) {
              const m0 = mean(SN1.map((d) => d.M - S.b * (d.dm - 1.1))), sg = sigCorr(S.b);
              g.fillStyle = col('--good'); g.globalAlpha = 0.12; g.fillRect(A.p.l, A.Y(m0 - sg), A.iw, A.Y(m0 + sg) - A.Y(m0 - sg)); g.globalAlpha = 1;
              curve(g, A, X.x0, X.x1, (x) => m0 + S.b * (x - 1.1), col('--s2'), 1.5, [5, 4], 20);
              SN1.forEach((d) => { g.strokeStyle = col('--muted'); g.lineWidth = 1; g.beginPath(); g.arc(A.X(d.dm), A.Y(d.M), 3, 0, 6.2832); g.stroke(); });
              SN1.forEach((d) => dotErr(g, A, d.dm, d.M - S.b * (d.dm - 1.1), 0, col('--accent'), 3.2));
              label(g, col, '空心 = 原始，实心 = 校正后', A.p.l + 6, A.p.t + 12, col('--muted'));
            } else {
              SN1.forEach((d, i) => dotErr(g, A, d[S.xv], d.M, 0, i === S.sel ? col('--accent') : col('--fg'), 3.2));
            }
          }
          cv.onResize(draw); cvS.onResize(drawS);
          const un = watchTheme(() => { draw(); drawS(); });
          draw(); ro();
          return { destroy() { cv.destroy(); cvS.destroy(); un(); } };
        },
      };

      /* ================= Stage 2: Hubble diagram ================= */
      const stage2 = {
        title: '哈勃图',
        task: R`<p>1998 年初。两支队伍（伯克利的超新星宇宙学计划，以及高红移超新星搜索队）各自用新月前后的“定时搜索”在几周内发现一批 $z\approx 0.2$–0.9 的超新星，再用大望远镜和哈勃空间望远镜跟踪光变曲线、用上一关的方法校准。你手里是 42 颗高红移和 18 颗近邻超新星的距离模数 $\mu$（含误差；模拟数据，样本规模与误差仿照 1998 年的两篇论文）。</p>
<p>在弗里德曼–勒梅特宇宙中，光度距离由物质密度 $\Omega_m$ 和宇宙学常数项 $\Omega_\Lambda$ 决定（$\Omega_k = 1-\Omega_m-\Omega_\Lambda$ 是曲率）：</p>
$$d_L = \frac{c\,(1+z)}{H_0\sqrt{|\Omega_k|}}\;S_k\!\left(\sqrt{|\Omega_k|}\int_0^z\frac{dz'}{\sqrt{\Omega_m(1+z')^3+\Omega_k(1+z')^2+\Omega_\Lambda}}\right),$$
<p>$S_k = \sinh$（开放）、$\sin$（闭合），平直时取极限 $d_L = \frac{c(1+z)}{H_0}\int_0^z dz'/E$。超新星的绝对星等与 $H_0$ 只作为一个整体常数出现，程序会自动把它拟合掉，所以只有曲线的<b>形状</b>重要。大多数理论家当时相信 $\Omega_\Lambda = 0$，并希望测出物质让膨胀减速了多少。</p>
<p>任务：先只用物质（$\Omega_\Lambda = 0$）去拟合；再放开 $\Omega_\Lambda$。最后在平直宇宙（暴胀理论的预言）中定出 $\Omega_\Lambda$。</p>`,
        hints: [
          '在「Ω_Λ = 0」约束下把 Ω_m 从 1 往 0 拖，盯着 χ²。物质越多，引力减速越强，同一红移处的距离越短、超新星越亮。可数据里远处的超新星偏暗。',
          '放开 Ω_Λ 后，χ² 的谷底是一条斜线（大致 $0.8\\Omega_m - 0.6\\Omega_\\Lambda \\approx -0.2$）：超新星主要约束这个组合。再加一个独立条件（平直）就能把两个量分开。',
          '选「平直」，拖 Ω_m 让 χ² 最小：Ω_m ≈ 0.27，所以 Ω_Λ ≈ 0.73。',
        ],
        answer: R`只含物质时，χ² 随 $\Omega_m$ 减小而单调下降，在 $\Omega_m = 0$ 处仍比最佳拟合差 $\Delta\chi^2 \approx 5.7$（数据甚至想要负的 $\Omega_m$，物理上不可能）；$\Omega_m = 0.3$、$\Omega_\Lambda = 0$ 差 $\Delta\chi^2\approx 16$，爱因斯坦–德西特宇宙（$\Omega_m = 1$）差约 58。z ≈ 0.5 的超新星比低密度、无 Λ 的宇宙预言的暗约 0.1–0.2 星等。放开 $\Omega_\Lambda$ 后最佳区域是一条 $0.8\Omega_m - 0.6\Omega_\Lambda\approx -0.2$ 的斜带；加上平直条件得 $\Omega_m \approx 0.275$（1σ 范围 0.22–0.34），$\Omega_\Lambda \approx 0.72$。这与 Perlmutter 等（1999）的结果 $\Omega_m = 0.28^{+0.09}_{-0.08}$（平直）一致。`,
        build(body, api) {
          const S = { Om: 1, OL: 0, cons: 'zero', view: 'res' };
          const bst = best();
          const vC = h.choice({ label: '显示', value: S.view, options: [{ value: 'res', label: '相对空宇宙的残差 Δμ' }, { value: 'mu', label: '距离模数 μ – lg z' }], onChange: (v) => { S.view = v; draw(); } });
          const st = el('div', { class: 'lab-stage' });
          body.append(vC.el, st);
          const cv = h.canvas(st, { aspect: 0.6, minH: 240, maxH: 380 });
          cv.canvas.setAttribute('aria-label', '超新星哈勃图与模型曲线');
          body.append(leg(h, [['你的模型', '--accent'], ['爱因斯坦–德西特 (1, 0)', '--s2', 1], ['空宇宙 (0, 0)', '--muted', 1]]));
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const cC = h.choice({ label: '约束', value: S.cons, options: [{ value: 'zero', label: 'Ω_Λ = 0（只有物质）' }, { value: 'free', label: '两者都自由' }, { value: 'flat', label: '平直 Ω_m + Ω_Λ = 1' }], onChange: (v) => { S.cons = v; apply(); } });
          const sM = h.slider({ label: '物质密度 Ω_m', min: 0, max: 1.5, step: 0.005, value: S.Om, format: (v) => v.toFixed(3), onInput: (v) => { S.Om = v; apply(); } });
          const sL = h.slider({ label: '宇宙学常数 Ω_Λ', min: -0.5, max: 1.5, step: 0.005, value: S.OL, format: (v) => fmt(v, 3), onInput: (v) => { S.OL = v; apply(); } });
          ctl.append(cC.el, sM.el, sL.el);
          const rw = el('div', { class: 'lab-readout' }); body.append(rw);
          const rX = h.readout(`χ²（N = ${SN2.length}）`), rD = h.readout('Δχ²（与最佳拟合比）'), rK = h.readout('曲率 Ω_k'), rU = h.readout('这个宇宙');
          rw.append(rX.el, rD.el, rK.el, rU.el);
          let cur = null;
          function apply() {
            if (S.cons === 'zero') { S.OL = 0; } else if (S.cons === 'flat') { S.OL = +(1 - S.Om).toFixed(3); }
            sL.input.disabled = S.cons !== 'free'; sL.set(S.OL);
            cur = fit(S.Om, S.OL);
            const bb = bigBang(S.Om, S.OL), Ok = 1 - S.Om - S.OL;
            rX.set(cur ? cur.chi2.toFixed(1) : '—（模型在 z ≤ 1 内无定义）');
            rD.set(cur ? (cur.chi2 - bst.chi2 < 0.05 ? '≈ 0（最佳）' : '+' + (cur.chi2 - bst.chi2).toFixed(1)) : '—');
            rK.set(fmt(Ok, 3) + (Math.abs(Ok) < 0.005 ? '（平直）' : Ok > 0 ? '（开放）' : '（闭合）'));
            rU.set(!bb ? '没有大爆炸（过去曾经反弹），排除' : cur && cur.chi2 - bst.chi2 <= 2.3 ? '与数据吻合（1σ 内）' : cur && cur.chi2 - bst.chi2 <= 6.2 ? '勉强（2σ 内）' : '被数据排除');
            draw();
          }
          const quiz = h.quiz({
            question: R`在 $\Omega_\Lambda = 0$ 的约束下，哪个 $\Omega_m$ 拟合得最好？`,
            options: [
              { label: '$\\Omega_m \\approx 1$：平直、只含物质的宇宙', ok: false, why: '把 Ω_m 设为 1 看看 χ²：差了五十多，远处的超新星比这个模型预言的暗得多。' },
              { label: '$\\Omega_m \\approx 0.3$：与星系团测得的物质密度一致', ok: false, why: '比 Ω_m = 0 还差约 10 个 χ²。' },
              { label: '$\\Omega_m$ 越小越好，到 0 还在下降：远处的超新星比任何只含物质的宇宙预言的都暗', ok: true, why: '对。即使宇宙完全空无一物、膨胀毫不减速，远处的超新星仍然偏暗。数据想要的是比“不减速”还远的距离。' },
              { label: '数据对 $\\Omega_m$ 不敏感', ok: false, why: '在 Ω_m = 0 与 1 之间 χ² 变化了五十多。' },
            ],
            onOk: () => { okQ = true; finish(); },
          });
          let okQ = false, okA = false;
          const ans = h.answer({
            label: R`平直宇宙中拟合最好的 $\Omega_\Lambda$ = ?（容差 ±0.1）`, placeholder: '例如 0.5',
            check: (v) => {
              if (Math.abs(v - 0.725) <= 0.1) return { ok: true, msg: `对：平直时最佳 Ω_m ≈ 0.275，Ω_Λ ≈ 0.725。真空能约占宇宙能量的四分之三。` };
              if (Math.abs(v - 0.275) <= 0.06) return { ok: false, msg: '这是 Ω_m。问的是 Ω_Λ = 1 − Ω_m。' };
              if (v <= 0.05) return { ok: false, msg: '平直且没有 Λ 就是 Ω_m = 1 的宇宙，看看它的 χ²。' };
              return { ok: false, msg: '选「平直」约束，拖 Ω_m 找 χ² 的最小值。' };
            },
            onOk: () => { okA = true; finish(); },
          });
          body.append(quiz.el, ans.el);
          function finish() { if (okQ && okA) api.done('<b>远处的超新星比只含物质的宇宙预言的暗 0.1–0.2 星等：</b>只靠物质无法解释，需要一个正的宇宙学常数，平直时 $\\Omega_\\Lambda \\approx 0.7$。宇宙的大部分能量是一种不聚集、压强为负的“暗能量”。'); }

          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const eds = fit(1, 0), mine = cur;
            const shift = (f) => (f ? f.off : 0);
            if (S.view === 'res') {
              const A = h.axes(g, W, Hh, { x0: 0, x1: 0.95, y0: -1.0, y1: 0.9, pad: { l: 46, r: 10, t: 12, b: 34 }, xTicks: [0, 0.2, 0.4, 0.6, 0.8], yTicks: [-0.8, -0.4, 0, 0.4, 0.8], fmtX: (v) => v.toFixed(1), fmtY: (v) => v.toFixed(1), xLabel: '红移 z', yLabel: 'Δμ = μ − μ(空宇宙)' }, col);
              const resid = (f, Om, OL) => (z) => MU0 + 5 * Math.log10(DL(z, Om, OL, f.chi)) + f.off - muEmpty(z) - OFF_LOW;
              curve(g, A, 0.004, 0.95, () => 0, col('--muted'), 1.2, [3, 3], 2);
              if (eds) curve(g, A, 0.004, 0.95, resid(eds, 1, 0), col('--s2'), 1.5, [6, 4]);
              SN2.forEach((d) => dotErr(g, A, d.z, d.mu - muEmpty(d.z) - OFF_LOW, d.e, col('--fg'), 2.4));
              if (mine) curve(g, A, 0.004, 0.95, resid(mine, S.Om, S.OL), col('--accent'), 2.6);
              label(g, col, '远处更暗 ↑', A.p.l + 6, A.p.t + 12, col('--muted'));
            } else {
              const lz0 = -1.95, A = h.axes(g, W, Hh, { x0: lz0, x1: 0, y0: 33, y1: 45, pad: { l: 46, r: 10, t: 12, b: 34 }, xTicks: [0.01, 0.03, 0.1, 0.3, 1].map(Math.log10), yTicks: [34, 37, 40, 43], fmtX: (v) => String(+(10 ** v).toPrecision(1)), xLabel: '红移 z（对数）', yLabel: '距离模数 μ' }, col);
              const mu = (f, Om, OL) => (lz) => MU0 + 5 * Math.log10(DL(10 ** lz, Om, OL, f.chi)) + f.off;
              curve(g, A, lz0, 0, (lz) => muEmpty(10 ** lz) + OFF_LOW, col('--muted'), 1.2, [3, 3]);
              if (eds) curve(g, A, lz0, 0, mu(eds, 1, 0), col('--s2'), 1.5, [6, 4]);
              SN2.forEach((d) => dotErr(g, A, Math.log10(d.z), d.mu, d.e, col('--fg'), 2.2));
              if (mine) curve(g, A, lz0, 0, mu(mine, S.Om, S.OL), col('--accent'), 2.4);
              label(g, col, '曲线几乎重合：换到残差图看差别', A.p.l + 6, A.p.t + 12, col('--muted'));
            }
          }
          cv.onResize(draw);
          const un = watchTheme(draw);
          apply();
          return { destroy() { cv.destroy(); un(); } };
        },
      };

      /* ================= Stage 3: deceleration parameter ================= */
      const stage3 = {
        title: '减速参数 q₀',
        task: R`<p>这些搜索最初的目标是测量<b>减速参数</b> $q_0 \equiv -\ddot a\,a/\dot a^{2}\big|_{\text{今天}}$。物质的引力应当让膨胀减速，$q_0\gt 0$。广义相对论给出加速度方程（$a$ 为尺度因子）：</p>
$$\frac{\ddot a}{a} = -\frac{4\pi G}{3}\sum_i\Big(\rho_i + \frac{3p_i}{c^2}\Big),\qquad H^2 = \Big(\frac{\dot a}{a}\Big)^2 = \frac{8\pi G}{3}\sum_i\rho_i - \frac{kc^2}{a^2}.$$
<p>物质（尘埃）的压强 $p = 0$；宇宙学常数相当于一种能量密度不随膨胀稀释的成分，压强 $p_\Lambda = -\rho_\Lambda c^2$。定义 $\Omega_i = 8\pi G\rho_{i}/3H_0^2$（今天的值）。</p>
<p>任务：用这两条方程把 $q_0$ 写成 $\Omega_m, \Omega_\Lambda$ 的函数，代入上一关的拟合值。再看下图中由弗里德曼方程积分出的 $a(t)$，读出宇宙的年龄（取 $H_0 = 70$ km/s/Mpc）。</p>`,
        hints: [
          '加速度方程除以 $H_0^2$：$\\ddot a/(aH_0^2) = -\\tfrac12\\sum_i \\Omega_i(1 + 3p_i/\\rho_i c^2)$（今天）。今天 $\\dot a/a = H_0$。',
          '物质贡献 $\\Omega_m(1+0)$，宇宙学常数贡献 $\\Omega_\\Lambda(1-3) = -2\\Omega_\\Lambda$。所以 $q_0 = \\Omega_m/2 - \\Omega_\\Lambda$。',
          '$q_0 \\approx 0.28/2 - 0.72 \\approx -0.58$：负的，膨胀在加速。年龄：把游标往过去拖到曲线碰到 a = 0，约 13.7 Gyr。',
        ],
        answer: R`令 $w_i = p_i/\rho_i c^2$，加速度方程给 $q_0 = \tfrac12\sum_i\Omega_i(1+3w_i)$。物质 $w=0$，宇宙学常数 $w=-1$，所以 $q_0 = \Omega_m/2 - \Omega_\Lambda \approx 0.14 - 0.72 = -0.58\lt 0$：今天的膨胀在<b>加速</b>。积分弗里德曼方程，$t_0 = H_0^{-1}\int_0^1 \frac{da}{a\,E(a)} \approx 0.98/H_0 \approx 13.7$ Gyr（平直时有闭式 $t_0 = \frac{2}{3H_0\sqrt{\Omega_\Lambda}}\operatorname{arsinh}\sqrt{\Omega_\Lambda/\Omega_m}$）。只含物质的平直宇宙只有 $2/(3H_0) \approx 9.3$ Gyr，比最老的球状星团还年轻；加速宇宙解决了这个“年龄危机”。减速转为加速发生在 $(1+z_t)^3 = 2\Omega_\Lambda/\Omega_m$，$z_t\approx 0.7$。`,
        build(body, api) {
          const S = { Om: 0.28, OL: 0.72, dt: -5 };
          const st = el('div', { class: 'lab-stage' }); body.append(st);
          const cv = h.canvas(st, { aspect: 0.6, minH: 240, maxH: 370 });
          cv.canvas.setAttribute('aria-label', '尺度因子 a 随时间的演化');
          body.append(leg(h, [['你的模型', '--accent'], ['爱因斯坦–德西特 (1, 0)', '--s2', 1], ['空宇宙 (0, 0)', '--muted', 1]]));
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const sM = h.slider({ label: 'Ω_m', min: 0, max: 1.2, step: 0.01, value: S.Om, format: (v) => v.toFixed(2), onInput: (v) => { S.Om = v; recompute(); } });
          const sL = h.slider({ label: 'Ω_Λ', min: -0.3, max: 1.2, step: 0.01, value: S.OL, format: (v) => fmt(v, 2), onInput: (v) => { S.OL = v; recompute(); } });
          const sT = h.slider({ label: '游标：距今时间', min: -16, max: 8, step: 0.05, value: S.dt, format: (v) => fmt(v, 2) + ' Gyr', onInput: (v) => { S.dt = v; draw(); ro(); } });
          ctl.append(sM.el, sL.el, sT.el);
          const rw = el('div', { class: 'lab-readout' }); body.append(rw);
          const rA = h.readout('游标处 a'), rZ = h.readout('对应红移 z'), rV = h.readout('膨胀速率 ȧ / H₀'), rQ = h.readout('该时刻 q');
          rw.append(rA.el, rZ.el, rV.el, rQ.el);
          let hist = null; const ref = { eds: history(1, 0), emp: history(0, 0) };
          function recompute() { hist = history(S.Om, S.OL); draw(); ro(); }
          function ro() {
            const [, a, v] = interp(hist.pts, S.dt / TH);
            const atStart = S.dt / TH <= hist.pts[0][0] + 1e-9;
            rA.set(atStart && hist.end === 'bang' ? '0（大爆炸之前，无定义）' : a.toFixed(3));
            rZ.set(a > 1e-3 ? (a < 1 ? (1 / a - 1).toFixed(2) : '（未来）') : '∞');
            rV.set(a > 1e-3 ? v.toFixed(3) : '—');
            if (a > 1e-3) { const q = -(a * hist.acc(a)) / (v * v); rQ.set(fmt(q, 2) + (q < 0 ? '（加速）' : '（减速）')); } else rQ.set('—');
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: -16, x1: 8, y0: 0, y1: 2, pad: { l: 40, r: 10, t: 12, b: 34 }, xTicks: [-15, -10, -5, 0, 5], yTicks: [0, 0.5, 1, 1.5, 2], fmtY: (v) => v.toFixed(1), xLabel: '距今时间 t − t₀ (Gyr)', yLabel: '尺度因子 a' }, col);
            const line = (H, color, w, dash) => { g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip(); g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); H.pts.forEach(([t, a], i) => { const x = A.X(t * TH), y = A.Y(a); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore(); };
            g.strokeStyle = col('--grid'); g.lineWidth = 1; g.beginPath(); g.moveTo(A.X(0), A.p.t); g.lineTo(A.X(0), A.p.t + A.ih); g.stroke();
            line(ref.emp, col('--muted'), 1.3, [3, 3]); line(ref.eds, col('--s2'), 1.6, [6, 4]); line(hist, col('--accent'), 2.6, []);
            const [, a] = interp(hist.pts, S.dt / TH);
            const x = A.X(S.dt);
            g.strokeStyle = col('--s1'); g.lineWidth = 1.3; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, A.p.t); g.lineTo(x, A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            g.fillStyle = col('--s1'); g.beginPath(); g.arc(x, A.Y(a), 4, 0, 6.2832); g.fill();
            label(g, col, '今天', A.X(0) + 4, A.p.t + 12, col('--muted'));
            if (hist.end === 'bounce') label(g, col, '没有大爆炸：过去曾经反弹', A.p.l + 6, A.p.t + 30, col('--warn'));
            if (hist.fate === 'crunch') label(g, col, '未来再坍缩', A.p.l + A.iw - 6, A.p.t + 30, col('--warn'), 'right');
          }
          let okQ = false, okT = false;
          const finish = () => { if (okQ && okT) api.done('<b>宇宙在加速膨胀：</b>$q_0 = \\Omega_m/2 - \\Omega_\\Lambda \\approx -0.6$。物质的引力在早期让膨胀减速，约 60 亿年前（$z \\approx 0.7$）负压强的暗能量开始占上风，膨胀转为加速。这就是 1998 年两支队伍几乎同时得到、2011 年获诺贝尔奖的结论。'); };
          const aQ = h.answer({
            label: R`$q_0$ = ?（用上一关的 $\Omega_m\approx 0.28,\ \Omega_\Lambda\approx 0.72$；容差 ±0.1）`, placeholder: '例如 0.5',
            check: (v) => {
              if (v >= -0.68 && v <= -0.48) return { ok: true, msg: '对：$q_0 = \\Omega_m/2 - \\Omega_\\Lambda \\approx -0.58$。负号意味着 $\\ddot a\\gt 0$。' };
              if (Math.abs(v - 0.58) <= 0.1) return { ok: false, msg: '数值对，符号反了：$q_0$ 的定义里有一个负号，而 Λ 项让 $\\ddot a$ 为正。' };
              if (Math.abs(v - 0.5) <= 0.05) return { ok: false, msg: '这是只含物质的平直宇宙（Ω_m = 1）的值。Λ 呢？' };
              if (Math.abs(v + 0.86) <= 0.08 || Math.abs(v + 1.3) <= 0.1) return { ok: false, msg: 'Λ 项的系数不对：$\\rho + 3p/c^2 = \\rho_\\Lambda(1 - 3) = -2\\rho_\\Lambda$。' };
              return { ok: false, msg: '把加速度方程除以 $H_0^2$，用 $\\Omega_i$ 表示，物质与 Λ 分别算。' };
            },
            onOk: () => { okQ = true; finish(); },
          });
          const aT = h.answer({
            label: '宇宙的年龄 $t_0$（a 从 0 长到 1 用了多久；容差 ±0.6 Gyr）', unit: 'Gyr', placeholder: '例如 10',
            check: (v) => {
              if (Math.abs(v - 13.73) <= 0.6) return { ok: true, msg: `对：t₀ ≈ 13.7 Gyr，约 0.98/H₀。只含物质的平直宇宙只有 9.3 Gyr。巧的是它几乎等于空宇宙的 1/H₀ = ${TH.toFixed(1)} Gyr：早期的减速和晚期的加速大致抵消了。` };
              if (Math.abs(v - 9.31) <= 0.4) return { ok: false, msg: '这是爱因斯坦–德西特宇宙（Ω_m = 1）的年龄 2/(3H₀)。要读的是你的模型（粗实线）。' };
              return { ok: false, msg: '把 Ω_m、Ω_Λ 设为 0.28、0.72，把游标往左拖，直到实线落到 a = 0。' };
            },
            onOk: () => { okT = true; finish(); },
          });
          const bonus = el('div', { class: 'de-sec' });
          bonus.append(el('h4', { text: '附加题（不影响过关）' }), h.answer({
            label: '减速何时转为加速？找到 q 变号处的红移 $z_t$（容差 ±0.08）', placeholder: '例如 1.5',
            check: (v) => (Math.abs(v - 0.726) <= 0.08 ? { ok: true, msg: '对：平直时 $q = 0 \\Leftrightarrow \\Omega_m(1+z)^3 = 2\\Omega_\\Lambda$，$z_t = (2\\Omega_\\Lambda/\\Omega_m)^{1/3} - 1 \\approx 0.73$，约 60 亿年前。2001 年 Riess 等用 z ≈ 1.7 的 SN 1997ff 看到了更早的减速阶段。' } : { ok: false, msg: '拖游标看「该时刻 q」何时由正变负，读出对应的红移。' }),
          }).el);
          body.append(aQ.el, aT.el, bonus);
          cv.onResize(draw);
          const un = watchTheme(draw);
          recompute();
          return { destroy() { cv.destroy(); un(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
