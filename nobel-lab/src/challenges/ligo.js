/* 噪声里的啁啾 — 挑战版（Nobel Physics 2017: Weiss, Barish, Thorne — LIGO, GW150914）
 * 时代：2015-09-14 09:50:45 UTC。Hanford (H1) 与 Livingston (L1) 两台 4 km 干涉仪，相距 3002 km。
 * 读者：(1) 用带通滤波把信号从噪声里捞出来、标出两台探测器的并合时刻；(2) 用 3002 km / c 判断是否以光速传播，
 * 并解释两台的波形为何反号；(3) 用模板匹配量出啁啾质量；(4) 用开普勒第三定律求峰值时的轨道间距，判断天体类型。
 *
 * 数据（合成，种子固定）：1 s、2048 Hz。噪声 = 高斯白噪声在频域按"类 LIGO"形状着色：低频地震墙 ∝ (20/f)^4（幅度），
 * 高频散粒噪声 ∝ (f/500)^3，中间平坦——这样原始数据里看不见信号，35–350 Hz 带通后清楚可见。
 * 信号 = 领头阶（牛顿四极）旋近，公式同 labs/ligo.js：
 *   f_GW(τ) = (1/π)(5/(256τ))^{3/8}(G𝓜/c³)^{−5/8}，τ = t_c − t；振幅 ∝ f^{2/3}；ISCO 之后示意性地延续到铃宕频率，
 *   铃宕 ℓ=m=2 准正规模（Berti–Cardoso–Will 拟合，36+29 M☉ → ≈275 Hz，τ_d ≈ 3.7 ms）。
 *   模板族：质量比固定为 36:29，按 𝓜 缩放（第三关滑块）。真值 𝓜 = 28.1 M☉、M = 65 M☉。
 * L1 比 H1 早 6.9 ms 到达，且反号（两台干涉臂相对转了约 90°），幅度 ×0.85。
 * 带通：自写基 2 FFT，通带外置零，边缘 6 Hz 余弦过渡。模板匹配对相位解析取极大（cos/sin 两个正交模板）。
 */
(() => {
  const FS = 2048, N = 2048, TSUN = 4.925491e-6;
  const G = 6.674e-11, CL = 2.998e8, MSUN = 1.989e30, DIST = 3002e3;
  const MC0 = 28.1, TH = 0.62, DTL = 0.0069, TL = TH - DTL, AL = 0.85;
  const SIG = 0.1, LOWK = 0.3, HIK = 20, TW = 6;
  const MW0 = 0.32, MW1 = 0.68;                     // 匹配窗口（s）

  const mul32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  /* in-place radix-2 FFT; inv → includes 1/n */
  function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (2 * Math.PI / len) * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang), hl = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < hl; k++) {
          const a = i + k, b = a + hl, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  const fk = (k) => (k <= N / 2 ? k : N - k) * FS / N;
  const bandW = (f, lo, hi) => (f < lo - TW || f > hi + TW ? 0 : f < lo ? 0.5 * (1 - Math.cos(Math.PI * (f - lo + TW) / TW))
    : f > hi ? 0.5 * (1 + Math.cos(Math.PI * (f - hi) / TW)) : 1);
  const spec = (x) => { const re = Float64Array.from(x), im = new Float64Array(N); fft(re, im, false); return { re, im }; };
  /* band-pass from a precomputed spectrum S; quad → also the 90°-shifted (Hilbert) copy */
  function bandFrom(S, lo, hi, quad) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 0; k < N; k++) { const w = bandW(fk(k), lo, hi); re[k] = S.re[k] * w; im[k] = S.im[k] * w; }
    let q = null;
    if (quad) {
      const qr = new Float64Array(N), qi = new Float64Array(N);
      for (let k = 1; k < N; k++) { const s = k < N / 2 ? 1 : k > N / 2 ? -1 : 0; qr[k] = s * im[k]; qi[k] = -s * re[k]; }
      fft(qr, qi, true); q = qr;
    }
    fft(re, im, true);
    return quad ? [re, q] : re;
  }

  /* ---- waveform (copied & adapted from labs/ligo.js) ---- */
  const chirpMass = (m1, m2) => Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2);
  const fOfTau = (tau, Mc) => (1 / Math.PI) * Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(Mc * TSUN, -5 / 8);
  const tauOfF = (f, Mc) => (5 / 256) * Math.pow(Math.PI * f, -8 / 3) * Math.pow(Mc * TSUN, -5 / 3);
  const fISCO = (M) => 1 / (Math.pow(6, 1.5) * Math.PI * M * TSUN);
  function remnant(m1, m2) {
    const M = m1 + m2, eta = (m1 * m2) / (M * M), Mf = M * (1 - 0.0572 * eta - 0.54 * eta * eta);
    const a = 2 * Math.sqrt(3) * eta - 3.871 * eta * eta + 4.028 * eta ** 3;
    const f = (1.5251 - 1.1568 * Math.pow(1 - a, 0.1292)) / (2 * Math.PI * Mf * TSUN), Q = 0.7 + 1.4187 * Math.pow(1 - a, -0.499);
    return { Mf, a, f, tau: Q / (Math.PI * f) };
  }
  const MC_REF = chirpMass(36, 29);
  /* unit-peak waveform, amplitude peak (start of ringdown) at t = tp; f[i] = instantaneous GW frequency where A > 0 */
  function wave(Mc, tp) {
    const k = Mc / MC_REF, m1 = 36 * k, m2 = 29 * k, M = m1 + m2, rem = remnant(m1, m2), fI = fISCO(M), tR = tauOfF(rem.f, Mc);
    const sStart = Math.max(-(tauOfF(30, Mc) - tR), -0.46), AI = Math.pow(fI, 2 / 3), AP = AI * Math.cbrt(rem.f / fI);
    const h = new Float64Array(N), f = new Float64Array(N), A = new Float64Array(N);
    let p = 0;
    for (let i = 0; i < N; i++) {
      const s = i / FS - tp; if (s < sStart || s > 12 * rem.tau) continue;
      let fi, a;
      if (s < 0) { fi = fOfTau(tR - s, Mc); a = fi < fI ? Math.pow(fi, 2 / 3) : AI * Math.cbrt(fi / fI); } else { fi = rem.f; a = AP * Math.exp(-s / rem.tau); }
      const x = Math.min(1, (s - sStart) / 0.04), tap = 0.5 * (1 - Math.cos(Math.PI * x));
      p += 2 * Math.PI * fi / FS; A[i] = (a / AP) * tap; h[i] = A[i] * Math.cos(p); f[i] = fi;
    }
    return { h, f, A, rem, M };
  }
  function noise(seed) {
    const r = mul32(seed), re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 1; k < N / 2; k++) {
      const f = k * FS / N, a = Math.sqrt(LOWK * Math.pow(20 / Math.max(f, 3), 8) + 1 + HIK * Math.pow(f / 500, 6));
      re[k] = gauss(r) * a; im[k] = gauss(r) * a; re[N - k] = re[k]; im[N - k] = -im[k];
    }
    fft(re, im, true);
    const b = bandFrom(spec(re), 35, 350), sd = Math.sqrt(b.reduce((s, v) => s + v * v, 0) / N);
    return re.map((v) => (v * SIG) / sd);
  }
  let DATA = null;
  function data() {
    if (DATA) return DATA;
    const sH = wave(MC0, TH), sL = wave(MC0, TL), nH = noise(150914), nL = noise(91415);
    const H1 = sH.h.map((v, i) => v + nH[i]), L1 = sL.h.map((v, i) => -AL * v + nL[i]);
    const SH = spec(H1), SL = spec(L1);
    const peakOf = (x) => { const y = bandFrom(spec(x), 35, 350); let m = 0; for (let i = 0; i < N; i++) if (Math.abs(y[i]) > Math.abs(y[m])) m = i; return m / FS; };
    const tH = peakOf(sH.h), tL = peakOf(sL.h);               // true merger peaks as seen after band-pass
    const Hf = bandFrom(SH, 35, 350);
    DATA = { H1, L1, SH, SL, tH, tL, Hf, stft: stft(Hf) };
    return DATA;
  }
  /* short-time FFT magnitude of x for t ∈ [T0s, T1s] */
  const ST = { win: 128, pad: 256, hop: 8, T0: 0.3, T1: 0.7, fMax: 400 };
  function stft(x) {
    const cols = [], i0 = Math.round(ST.T0 * FS), i1 = Math.round(ST.T1 * FS), nb = Math.round(ST.fMax * ST.pad / FS);
    let mx = 0;
    for (let c = i0; c <= i1; c += ST.hop) {
      const re = new Float64Array(ST.pad), im = new Float64Array(ST.pad);
      for (let j = 0; j < ST.win; j++) { const i = c - ST.win / 2 + j; if (i >= 0 && i < N) re[j] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / (ST.win - 1))); }
      fft(re, im, false);
      const col = new Float64Array(nb); for (let k = 0; k < nb; k++) { col[k] = Math.hypot(re[k], im[k]); mx = Math.max(mx, col[k]); }
      cols.push({ t: c / FS, col });
    }
    return { cols, mx, df: FS / ST.pad };
  }

  const CSS = `.ligc-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.ligc-leg i{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.ligc-big{font-family:var(--mono-font,monospace);font-size:15px}
.ligc-big b{font-size:19px}
.ligc-after{display:grid;gap:12px}.ligc-after[hidden]{display:none}
.ligc-cap{font-size:12px;color:var(--muted);margin:2px 0 -4px;font-family:var(--mono-font,monospace)}`;
  const injectCSS = () => { if (!document.getElementById('st-ligo')) document.head.append(H.el('style', { id: 'st-ligo', text: CSS })); };
  function onTheme(fn) {
    const mo = new MutationObserver(() => fn());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)'), lis = () => fn();
    mq.addEventListener ? mq.addEventListener('change', lis) : mq.addListener(lis);
    return () => { mo.disconnect(); mq.removeEventListener ? mq.removeEventListener('change', lis) : mq.removeListener(lis); };
  }
  const legend = (items) => H.el('div', { class: 'ligc-leg' }, items.map(([t, c]) => H.el('span', {}, [H.el('i', { style: `background:${c}` }), t])));
  const ms = (t) => (t * 1000).toFixed(1);

  CHALLENGES.ligo = {
    title: '噪声里的啁啾',
    _m: { fft, wave, data, bandFrom, TH, TL },
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color, mono = () => col('--mono-font') || 'monospace';
      const D = data();
      const shared = { dt: null };

      /* ================= 第一关 ================= */
      const stage1 = {
        title: '把信号从噪声里捞出来',
        task: `<p>2015 年 9 月 14 日 09:50 UTC，升级后的 Advanced LIGO 还在做正式观测前的工程运行。两台干涉仪——华盛顿州
          Hanford 的 <b>H1</b> 和路易斯安那州 Livingston 的 <b>L1</b>，相距 3002 km——各自记录下臂长差的应变 $h(t)$。
          下面是两台各 1 秒、每秒 2048 个采样的原始数据（单位任意）。</p>
          <p>据说里面有东西。可原始数据看上去只是一团噪声：地面震动、热噪声、激光散粒噪声，每一种都比你要找的信号大得多。
          上面那张图是 H1 原始数据的<b>振幅谱</b>，阴影是你选的通带。</p>
          <p><b>任务</b>：调低频截止和高频截止，做一个带通滤波，直到某个东西从噪声里浮出来；然后分别在 H1 和 L1 上标出它最强的那一刻
          （点击曲线，或用"光标"滑块再按"标记"）。</p>`,
        hints: [
          '看振幅谱：噪声在低频（地面震动）和高频（散粒噪声）都猛涨，中间有一段"最安静的谷"。致密双星旋近的引力波频率从几十 Hz 扫到几百 Hz。',
          '低频截止放到 30–40 Hz，高频截止放到 300–400 Hz。滤波后两台各有一段持续约 0.2 s、越来越快越来越强的振荡，最后突然消失。',
          '把低频截止设为 35 Hz、高频截止设为 350 Hz。H1 的峰值大约在 t ≈ 0.618 s，L1 大约在 0.611 s。切到"放大"视窗后把光标对准最高的那个波峰，分别标记。',
        ],
        answer: `带通 35–350 Hz 后，两台探测器在 $t\\approx0.6\\,$s 处都出现一段约 0.2 s 的"啁啾"：频率和振幅一起上升，然后戛然而止。
          H1 的峰值在 $t_{H}\\approx${D.tH.toFixed(3)}\\,$s，L1 在 $t_{L}\\approx${D.tL.toFixed(3)}\\,$s，<b>L1 先到 ≈ 6.9 ms</b>，而且 L1 的波形与 H1 <b>反号</b>。
          理由：噪声功率集中在 $\\lesssim 30\\,$Hz（地震）和 $\\gtrsim 400\\,$Hz（散粒噪声），信号的能量在 35–350 Hz 之间。`,
        build(body, api) {
          const S = { lo: 10, hi: 1000, cur: 0.5, vc: 0.5, view: 1, mH: null, mL: null };
          let fH = D.H1, fL = D.L1;
          const boxS = h.el('div'), boxH = h.el('div'), boxL = h.el('div');
          boxS.append(h.el('div', { class: 'ligc-cap', text: 'H1 原始数据振幅谱 |H(f)|（对数坐标）' }));
          const cvS = h.canvas(boxS, { aspect: 0.32, minH: 120, maxH: 180 });
          boxH.append(h.el('div', { class: 'ligc-cap', text: 'H1 · Hanford' }));
          const cvH = h.canvas(boxH, { aspect: 0.3, minH: 120, maxH: 190 });
          boxL.append(h.el('div', { class: 'ligc-cap', text: 'L1 · Livingston' }));
          const cvL = h.canvas(boxL, { aspect: 0.3, minH: 120, maxH: 190 });
          const ctl1 = h.el('div', { class: 'lab-controls' }), ctl2 = h.el('div', { class: 'lab-controls' }), ro = h.el('div', { class: 'lab-readout' });

          const sLo = h.slider({ label: '低频截止', min: 10, max: 1000, step: 1, value: S.lo, format: (v) => v + ' Hz', onInput: (v) => { S.lo = v; refilter(); } });
          const sHi = h.slider({ label: '高频截止', min: 10, max: 1000, step: 1, value: S.hi, format: (v) => v + ' Hz', onInput: (v) => { S.hi = v; refilter(); } });
          ctl1.append(sLo.el, sHi.el);
          const sCur = h.slider({ label: '光标 t', min: 0, max: 1, step: 0.0005, value: S.cur, format: (v) => v.toFixed(4) + ' s', onInput: (v) => { S.cur = v; S.vc = v; draw(); } });
          const cView = h.choice({ label: '视窗', value: 1, options: [{ value: 1, label: '全段 1 s' }, { value: 0.2, label: '放大 200 ms' }, { value: 0.05, label: '放大 50 ms' }],
            onChange: (v) => { S.view = v; S.vc = S.cur; draw(); } });
          const bH = h.button({ label: '标记 H1 峰值', kind: 'primary', onClick: () => mark('H') });
          const bL = h.button({ label: '标记 L1 峰值', kind: 'primary', onClick: () => mark('L') });
          ctl2.append(sCur.el, h.el('div', {}, [bH, bL]), cView.el);
          const rH = h.readout('H1 标记 t_H'), rL = h.readout('L1 标记 t_L'), rD = h.readout('Δt = t_H − t_L'), rB = h.readout('通带');
          [rB, rH, rL, rD].forEach((r) => ro.append(r.el));
          body.append(boxS, ctl1, boxH, boxL, ctl2, ro);

          const win = () => { if (S.view >= 1) return [0, 1]; let a = S.vc - S.view / 2; a = Math.max(0, Math.min(1 - S.view, a)); return [a, a + S.view]; };
          function refilter() {
            if (S.lo >= S.hi - 5) { fH = new Float64Array(N); fL = new Float64Array(N); }
            else { fH = bandFrom(D.SH, S.lo, S.hi); fL = bandFrom(D.SL, S.lo, S.hi); }
            rB.set(S.lo >= S.hi - 5 ? '通带为空（低频截止 ≥ 高频截止）' : `${S.lo}–${S.hi} Hz`);
            draw(); check();
          }
          function mark(w) {
            if (w === 'H') S.mH = S.cur; else S.mL = S.cur;
            draw(); check();
          }
          function check() {
            rH.set(S.mH == null ? '—' : S.mH.toFixed(4) + ' s'); rL.set(S.mL == null ? '—' : S.mL.toFixed(4) + ' s');
            rD.set(S.mH != null && S.mL != null ? `${ms(S.mH - S.mL)} ms` : '—');
            if (S.mH == null || S.mL == null) return;
            const covers = S.lo <= 40 && S.hi >= 250, cleaned = S.lo >= 20 && S.hi <= 500, bandOk = covers && cleaned;
            const okH = Math.abs(S.mH - D.tH) <= 0.004, okL = Math.abs(S.mL - D.tL) <= 0.004;
            if (bandOk && okH && okL && !api.solved()) {
              shared.dt = S.mH - S.mL;
              api.done(`<b>捞到了。</b>35–350 Hz 附近的"安静谷"里，两台探测器都看到同一段啁啾：L1 比 H1 早 <b>${ms(shared.dt)} ms</b>，而且波形反号。这就是 GW150914。`);
            } else if (!api.solved()) {
              api.say(!covers ? '通带太窄：要确定"那个东西"真在两台里，通带至少要盖住 40–250 Hz（信号的主要频段）。' : !cleaned ? '这么宽的通带里噪声仍然盖过一切——你标的位置还说服不了任何人。先把噪声最大的频段切掉，让信号真正浮出来。'
                : `${okH ? '' : 'H1'}${!okH && !okL ? ' 和 ' : ''}${okL ? '' : 'L1'} 的标记不在信号最强处（误差超过 ±4 ms）。试试"放大"视窗。`, 'bad');
            }
          }
          function drawSpec() {
            const g = cvS.g, W = cvS.w, Hh = cvS.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: Math.log10(10), x1: Math.log10(1024), y0: -1.5, y1: 3, pad: { l: 40, t: 8, b: 30 },
              xTicks: [1, Math.log10(30), 2, Math.log10(300), 3], fmtX: (v) => String(Math.round(10 ** v)), yTicks: [-1, 0, 1, 2, 3], fmtY: (v) => '10' + ['⁻¹', '⁰', '¹', '²', '³'][v + 1],
              xLabel: 'f / Hz', yLabel: '|H(f)|' }, col);
            if (S.lo < S.hi) { const xa = A.X(Math.log10(Math.max(10, S.lo))), xb = A.X(Math.log10(Math.min(1024, S.hi))); g.fillStyle = col('--accent'); g.globalAlpha = 0.14; g.fillRect(xa, A.p.t, xb - xa, A.ih); g.globalAlpha = 1; }
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.strokeStyle = col('--s1'); g.lineWidth = 1.3; g.beginPath();
            let first = true;
            for (let lf = 1; lf <= 3.01; lf += 0.02) {          // log-binned average of |H(f)|
              const k0 = Math.max(1, Math.round(10 ** lf * N / FS)), k1 = Math.min(N / 2, Math.max(k0 + 1, Math.round(10 ** (lf + 0.02) * N / FS)));
              let s = 0; for (let k = k0; k < k1; k++) s += Math.hypot(D.SH.re[k], D.SH.im[k]); s /= (k1 - k0);
              const x = A.X(lf + 0.01), y = A.Y(Math.log10(s / Math.sqrt(N) + 1e-9));
              first ? g.moveTo(x, y) : g.lineTo(x, y); first = false;
            }
            g.stroke(); g.restore();
          }
          function drawTrace(cv, x, mk, lab) {
            const g = cv.g, W = cv.w, Hh = cv.h, [t0, t1] = win();
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            let m = 1e-9; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(x[i]));
            const step = S.view >= 1 ? 0.2 : S.view >= 0.2 ? 0.05 : 0.01, ticks = [];
            for (let t = Math.ceil(t0 / step - 1e-9) * step; t <= t1 + 1e-9; t += step) ticks.push(+t.toFixed(3));
            const A = h.axes(g, W, Hh, { x0: t0, x1: t1, y0: -m * 1.08, y1: m * 1.08, pad: { l: 14, r: 18, t: 8, b: 28 }, xTicks: ticks,
              fmtX: (v) => (step < 0.05 ? v.toFixed(2) : v.toFixed(1)), xLabel: 't / s' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.strokeStyle = col('--fg'); g.lineWidth = 1; g.beginPath();
            const i0 = Math.max(0, Math.floor(t0 * FS)), i1 = Math.min(N - 1, Math.ceil(t1 * FS));
            for (let i = i0; i <= i1; i++) { const X = A.X(i / FS), Y = A.Y(x[i]); i === i0 ? g.moveTo(X, Y) : g.lineTo(X, Y); }
            g.stroke();
            g.strokeStyle = col('--muted'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(A.X(S.cur), A.p.t); g.lineTo(A.X(S.cur), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
            if (mk != null) {
              g.strokeStyle = col('--accent'); g.lineWidth = 2; g.beginPath(); g.moveTo(A.X(mk), A.p.t); g.lineTo(A.X(mk), A.p.t + A.ih); g.stroke();
              g.font = '11px ' + mono(); g.fillStyle = col('--accent'); g.textBaseline = 'top';
              const xm = A.X(mk); g.textAlign = xm > A.p.l + A.iw - 60 ? 'right' : 'left'; g.fillText(lab + ' 标记', xm + (g.textAlign === 'left' ? 4 : -4), A.p.t + 2);
            }
            g.restore();
            cv._A = A; cv._win = [t0, t1];
          }
          function draw() { drawSpec(); drawTrace(cvH, fH, S.mH, 'H1'); drawTrace(cvL, fL, S.mL, 'L1'); }
          const click = (cv, w) => (e) => {
            const A = cv._A; if (!A) return;
            const r = cv.canvas.getBoundingClientRect(), x = e.clientX - r.left;
            if (x < A.p.l || x > A.p.l + A.iw) return;
            const [t0, t1] = cv._win; S.cur = Math.round((t0 + ((x - A.p.l) / A.iw) * (t1 - t0)) * 2000) / 2000; sCur.set(S.cur); mark(w);
          };
          const cH = click(cvH, 'H'), cL = click(cvL, 'L');
          cvH.canvas.addEventListener('click', cH); cvL.canvas.addEventListener('click', cL);
          cvH.canvas.style.cursor = cvL.canvas.style.cursor = 'crosshair';
          [cvS, cvH, cvL].forEach((c) => c.onResize(draw));
          const off = onTheme(draw);
          refilter();
          return { destroy() { off(); [cvS, cvH, cvL].forEach((c) => c.destroy()); } };
        },
      };

      /* ================= 第二关 ================= */
      const stage2 = {
        title: '是不是以光速传来？',
        task: `<p>两台探测器看到了同一个形状，但相隔几毫秒。如果这是一阵来自天上的引力波，它应当以光速 $c = 2.998\\times10^{8}$ m/s 扫过地球；
          如果是两地碰巧同时出的本地干扰（雷击、电网、地震），时间差可以是任意的。</p>
          <p>上一关量到：L1 比 H1 先到几毫秒（下面显示你的测量值）。两站相距 $d = 3002$ km。</p>
          <p><b>任务</b>：先算一个上限——一阵以光速传播的波，从天空任意方向来，两站的到达时间差最多能差多少？</p>`,
        hints: [
          '波前是平面。两站到达时间差 = 基线在传播方向上的投影 ÷ c。',
          '投影最大的情况：波正好沿着两站连线方向传来。',
          '$\\Delta t_{\\max} = d/c = 3.002\\times10^{6}\\,\\mathrm{m} / 2.998\\times10^{8}\\,\\mathrm{m/s} \\approx 10.0\\,$ms。然后比较实测的 6.9 ms。',
        ],
        answer: `$\\Delta t_{\\max} = d/c \\approx 10.0\\,$ms。实测 6.9 ms $\\lt$ 10 ms，所以完全可以是从天上来的波：
          $\\cos\\theta = c\\Delta t/d \\approx 0.69$，波来自与基线夹角约 46° 的一个圆锥上的方向（实际定位在南天）。
          两台的波形反号，是因为两台干涉仪的臂相对转了约 90°：引力波把一条臂拉长、另一条压短，转 90° 的探测器读数正好变号。`,
        build(body, api) {
          let q = false, a = false;
          const dtv = shared.dt != null ? ms(shared.dt) : '6.9';
          const rDt = h.readout('你在第一关测得的 Δt = t_H − t_L', dtv + ' ms' + (shared.dt == null ? '（LIGO 实测值）' : ''));
          const roBox = h.el('div', { class: 'lab-readout' }, [rDt.el]);
          const quizBox = h.el('div', { hidden: true });
          const ans = H.answer({ label: '以光速传播的波，两站到达时间差的最大可能值（容差 ±4%）', unit: 'ms', placeholder: '例如 12.3',
            check: (v) => {
              const vv = v > 0 && v < 0.05 ? v * 1000 : v;
              if (vv >= 9.6 && vv <= 10.4) return { ok: true, msg: `对：$d/c$ = 3002 km ÷ c ≈ 10.0 ms。` };
              return { ok: false, msg: vv > 30 ? '太大了。算一下 3002 km 走光速要几毫秒？' : '不对。想想波从哪个方向来时两站时间差最大。' };
            },
            onOk: () => { a = true; quizBox.hidden = false; api.typeset(body); fin(); } });
          const quiz = H.quiz({
            question: `实测 L1 比 H1 早约 ${dtv} ms，而且 L1 的波形和 H1 <b>反号</b>。这和"来自天空、以光速传播的引力波"相容吗？`,
            options: [
              { label: '不相容：时间差不为 0，说明不是同一个信号', ok: false, why: '时间差不为 0 恰恰是从天上斜着来的波该有的样子：只有波正好从两站连线的垂直平面里来，才同时到达。' },
              { label: '不相容：波形反号，说明两台看到的是不同的东西', ok: false, why: '反号不是不同信号，而是两台探测器的"朝向"不同。想想引力波对相互垂直的两条臂做了什么。' },
              { label: '相容：Δt 小于 10 ms；反号是因为两台干涉仪的臂相对转了约 90°', ok: true,
                why: '对。约 7 ms 落在光速允许的 ±10 ms 之内（$\\cos\\theta=c\\Delta t/d\\approx0.69$）。引力波是横向的四极形变：沿一个方向拉长、垂直方向压短。L1 的两臂相对 H1 转了约 90°（再加地球曲率的小修正），"拉长的臂"与"压短的臂"对调，读数 $h=\\Delta L_x/L-\\Delta L_y/L$ 就变号。' },
              { label: '相容，但只能说明是本地地震：地震波也会先到一站', ok: false, why: '地震波速度只有几 km/s，3002 km 要走十几分钟，不是 7 ms。' },
            ],
            onOk: () => { q = true; fin(); } });
          quizBox.append(quiz.el);
          body.append(roBox, ans.el, quizBox);
          function fin() { if (a && q && !api.solved()) api.done('<b>它以光速而来。</b>两站时间差不超过 $d/c$ ≈ 10 ms、波形按探测器朝向反号——这是来自天空的引力波，而不是本地噪声。'); }
          return null;
        },
      };

      /* ================= 第三关 ================= */
      const stage3 = {
        title: '它有多重？',
        task: `<p>引力波的频率由轨道决定：两个天体越绕越近、越绕越快，频率和振幅一起上扬（"啁啾"）。在领头阶（牛顿四极辐射）里，
          这段扫频的快慢只由一个质量组合决定——<b>啁啾质量</b> $\\mathcal M$：$\\mathcal M$ 越大，扫频越快、信号越短、最后的频率越低。</p>
          <p>做法和 LIGO 的搜索流水线一样：拿一族理论波形（<b>模板</b>）去和滤波后的 H1 数据做内积，找最像的那个。
          匹配度 = 归一化内积（已对波形的初相位自动取最优），在 0.32–0.68 s 的窗口里算；纯噪声给 ≈0，完美无噪声给 1。</p>
          <p><b>任务</b>：调啁啾质量和并合时刻，让模板贴上数据：匹配度 > 0.85。下面的时频图是数据的短时傅里叶变换，
          模板的频率轨迹画在上面。</p>`,
        hints: [
          '先对齐时间：模板的最高点要落在你上一关标的 H1 峰值（约 0.618 s）附近，误差要在 1–2 ms 以内，否则匹配度会掉得很快。',
          '再调质量：模板太"慢"（扫频持续太久、末端频率太高）说明 $\\mathcal M$ 太小；太"短"说明太大。看时频图上的轨迹是否贴着亮带。',
          '$\\mathcal M$ ≈ 28 M☉、并合时刻 ≈ 0.620 s。在 0.618–0.622 s 之间以 0.5 ms 步长微调时间。',
        ],
        answer: `$\\mathcal M \\approx 28\\,M_\\odot$（容差 ±12%），模板峰值时刻 $\\approx 0.620\\,$s，匹配度可达 ≈0.9。
          领头阶里 $f(\\tau)=\\frac1\\pi\\big(\\frac{5}{256\\tau}\\big)^{3/8}\\big(\\frac{G\\mathcal M}{c^3}\\big)^{-5/8}$，
          所以 $\\dot f \\propto \\mathcal M^{5/3} f^{11/3}$：从扫频速度就能读出 $\\mathcal M$。
          LIGO 实测 $\\mathcal M = 28.1\\,M_\\odot$，对应两颗约 36 和 29 $M_\\odot$ 的天体，总质量约 65 $M_\\odot$。`,
        build(body, api) {
          const S = { Mc: 15, tc: 0.55, view: 'all' };
          const boxW = h.el('div'), boxF = h.el('div');
          const cvW = h.canvas(boxW, { aspect: 0.36, minH: 140, maxH: 220 });
          boxW.append(legend([['H1 数据（35–350 Hz）', col('--muted')], ['模板（最优相位与幅度）', col('--accent')]]));
          boxF.append(h.el('div', { class: 'ligc-cap', text: 'H1 时频图（短时 FFT，窗 62.5 ms）+ 模板频率轨迹' }));
          const cvF = h.canvas(boxF, { aspect: 0.4, minH: 150, maxH: 230 });
          const big = h.el('div', { class: 'ligc-big' });
          const ctl = h.el('div', { class: 'lab-controls' }), ro = h.el('div', { class: 'lab-readout' });
          const sMc = h.slider({ label: '啁啾质量 𝓜', min: 5, max: 60, step: 0.1, value: S.Mc, format: (v) => v.toFixed(1) + ' M☉', onInput: (v) => { S.Mc = v; upd(); } });
          const sTc = h.slider({ label: '模板峰值时刻', min: 0.5, max: 0.7, step: 0.0005, value: S.tc, format: (v) => v.toFixed(4) + ' s', onInput: (v) => { S.tc = v; upd(); } });
          const cV = h.choice({ label: '波形视窗', value: 'all', options: [{ value: 'all', label: '0.30–0.70 s' }, { value: 'end', label: '模板末段 ±40 ms' }], onChange: (v) => { S.view = v; draw(); } });
          ctl.append(sMc.el, sTc.el, cV.el);
          const rM = h.readout('模板总质量（质量比 36:29）'), rF = h.readout('模板末端 / 铃宕频率'), rT = h.readout('30 Hz → 并合时长');
          [rM, rF, rT].forEach((r) => ro.append(r.el));
          body.append(boxW, big, ctl, boxF, ro);
          let T = null, fit = null, match = 0;
          function upd() {
            const w = wave(S.Mc, S.tc), [a, b] = bandFrom(spec(w.h), 35, 350, true);
            const i0 = Math.round(MW0 * FS), i1 = Math.round(MW1 * FS);
            let da = 0, db = 0, aa = 0, bb = 0, dd = 0;
            for (let i = i0; i < i1; i++) { const d = D.Hf[i]; da += d * a[i]; db += d * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; dd += d * d; }
            aa = aa || 1e-12; bb = bb || 1e-12;
            match = Math.sqrt((da * da) / aa + (db * db) / bb) / Math.sqrt(dd);
            fit = new Float64Array(N); const ca = da / aa, cb = db / bb;
            for (let i = 0; i < N; i++) fit[i] = ca * a[i] + cb * b[i];
            T = w;
            big.innerHTML = `匹配度 <b>${match.toFixed(3)}</b>　${match > 0.85 ? '✓ 超过 0.85' : '（目标 > 0.85）'}`;
            rM.set(`${w.M.toFixed(1)} M☉`);
            rF.set(`f_ISCO ${fISCO(w.M).toFixed(0)} Hz · 铃宕 ${w.rem.f.toFixed(0)} Hz`);
            rT.set(`${Math.min(tauOfF(30, S.Mc), 99).toFixed(3)} s${tauOfF(30, S.Mc) > 0.46 ? '（超出窗口，截断）' : ''}`);
            draw();
            if (match > 0.85 && Math.abs(S.Mc - MC0) / MC0 <= 0.12 && !api.solved()) {
              api.done(`<b>𝓜 ≈ ${S.Mc.toFixed(1)} M☉。</b>扫频速度直接给出啁啾质量：两颗各约 30 倍太阳质量的天体，总质量约 65 M☉——比任何已知的恒星级致密双星都重得多。`);
            } else if (match > 0.85 && !api.solved()) api.say('匹配度够了，但这个质量偏得比较远——再细调一下质量和时间，看看能不能更高。', 'info');
          }
          function draw() {
            let g = cvW.g, W = cvW.w, Hh = cvW.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const [t0, t1] = S.view === 'all' ? [0.3, 0.7] : [S.tc - 0.04, S.tc + 0.04];
            let m = 1e-9; for (let i = Math.round(0.3 * FS); i < Math.round(0.7 * FS); i++) m = Math.max(m, Math.abs(D.Hf[i]));
            const step = S.view === 'all' ? 0.1 : 0.02, ticks = [];
            for (let t = Math.ceil(t0 / step - 1e-9) * step; t <= t1 + 1e-9; t += step) ticks.push(+t.toFixed(3));
            let A = h.axes(g, W, Hh, { x0: t0, x1: t1, y0: -m * 1.1, y1: m * 1.1, pad: { l: 14, r: 18, t: 8, b: 28 }, xTicks: ticks, fmtX: (v) => v.toFixed(2), xLabel: 't / s' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const plot = (x, c, lw) => {
              g.strokeStyle = c; g.lineWidth = lw; g.beginPath();
              const i0 = Math.max(0, Math.floor(t0 * FS)), i1 = Math.min(N - 1, Math.ceil(t1 * FS));
              for (let i = i0; i <= i1; i++) { const X = A.X(i / FS), Y = A.Y(x[i]); i === i0 ? g.moveTo(X, Y) : g.lineTo(X, Y); }
              g.stroke();
            };
            plot(D.Hf, col('--muted'), 1); if (fit) plot(fit, col('--accent'), 1.6);
            g.restore();
            /* time–frequency */
            g = cvF.g; W = cvF.w; Hh = cvF.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            A = h.axes(g, W, Hh, { x0: ST.T0, x1: ST.T1, y0: 20, y1: ST.fMax, pad: { l: 40, t: 8, b: 28 }, xTicks: [0.3, 0.4, 0.5, 0.6, 0.7], yTicks: [50, 100, 200, 300],
              fmtX: (v) => v.toFixed(1), xLabel: 't / s', yLabel: 'f / Hz' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            const st = D.stft, cw = A.iw / (st.cols.length - 1) + 1, bh = (A.ih / (ST.fMax - 20)) * st.df + 1;
            g.fillStyle = col('--s1');
            for (const c of st.cols) {
              for (let k = 1; k < c.col.length; k++) {
                const f = k * st.df; if (f < 20) continue;
                const v = c.col[k] / st.mx; if (v < 0.12) continue;
                g.globalAlpha = Math.min(1, v * v * 1.3); g.fillRect(A.X(c.t) - cw / 2, A.Y(f) - bh / 2, cw, bh);
              }
            }
            g.globalAlpha = 1;
            if (T) {
              g.strokeStyle = col('--accent'); g.lineWidth = 2; g.beginPath(); let on = false;
              for (let i = Math.round(ST.T0 * FS); i <= Math.round(ST.T1 * FS); i++) {
                if (T.A[i] < 0.05) { on = false; continue; }
                const X = A.X(i / FS), Y = A.Y(T.f[i]); on ? g.lineTo(X, Y) : g.moveTo(X, Y); on = true;
              }
              g.stroke();
            }
            g.restore();
          }
          [cvW, cvF].forEach((c) => c.onResize(draw));
          const off = onTheme(draw);
          upd();
          return { destroy() { off(); cvW.destroy(); cvF.destroy(); } };
        },
      };

      /* ================= 第四关 ================= */
      const RS = (m) => (2 * G * m * MSUN) / (CL * CL) / 1000;          // km
      const aKep = Math.cbrt((G * 65 * MSUN) / (2 * Math.PI * 75) ** 2) / 1000;
      const stage4 = {
        title: '它们是什么？',
        task: `<p>在信号最强的那一刻，引力波频率约 <b>150 Hz</b>。四极辐射的频率是轨道频率的两倍，所以此刻两个天体每秒绕对方
          <b>75 圈</b>。上一关得到总质量 $M \\approx 65\\,M_\\odot$。</p>
          <p>常数：$G = 6.674\\times10^{-11}$ N·m²/kg²，$c = 2.998\\times10^{8}$ m/s，$M_\\odot = 1.989\\times10^{30}$ kg。</p>
          <p><b>任务</b>：此刻两个天体的中心相距多远？然后判断：什么样的天体能靠得这么近却还没撞在一起？</p>`,
        hints: [
          '两体圆轨道的开普勒第三定律：$\\omega^2 a^3 = G M$，$M$ 是总质量，$a$ 是两天体中心距离，$\\omega$ 是轨道角频率。',
          '$\\omega = 2\\pi \\times 75\\,\\mathrm{s^{-1}} \\approx 471\\,\\mathrm{s^{-1}}$，$GM \\approx 8.63\\times10^{21}\\,\\mathrm{m^3/s^2}$。',
          `$a = (GM/\\omega^2)^{1/3} \\approx (3.9\\times10^{16})^{1/3}\\,\\mathrm{m} \\approx 340\\,$km。`,
        ],
        answer: `$a=(GM/\\omega^2)^{1/3}=\\big(6.674\\times10^{-11}\\cdot 65\\cdot1.989\\times10^{30}/(2\\pi\\cdot75)^2\\big)^{1/3}\\approx ${aKep.toFixed(0)}\\,$km。
          恒星（$R_\\odot$ = 70 万 km）和白矮星（~6000 km）都远大于这个距离；中子星够小（~12 km），但单颗最多 2–3 $M_\\odot$，凑不出两个 ~30 $M_\\odot$。
          只剩<b>黑洞</b>：36 $M_\\odot$ 的史瓦西半径 $2GM/c^2 \\approx ${RS(36).toFixed(0)}\\,$km，29 $M_\\odot$ 的约 ${RS(29).toFixed(0)} km，加起来 ${(RS(36) + RS(29)).toFixed(0)} km $\\lt$ ${aKep.toFixed(0)} km。`,
        build(body, api) {
          let a = false;
          const after = h.el('div', { class: 'ligc-after', hidden: true });
          const ans = H.answer({ label: '峰值时刻的轨道间距 $a$（容差约 ±15%）', unit: 'km', placeholder: '例如 1000',
            check: (v) => {
              const km = v > 2e5 ? v / 1000 : v;
              if (km >= 290 && km <= 390) return { ok: true, msg: `对：$a \\approx ${aKep.toFixed(0)}$ km，比地球直径的 1/30 还小${v > 2e5 ? '（按米换算）' : ''}。` };
              if (km > 390 && km < 1500) return { ok: false, msg: '偏大。$\\omega$ 是角频率：$\\omega = 2\\pi f_{\\rm orb}$，别忘了 $2\\pi$。' };
              if (km > 100 && km < 290) return { ok: false, msg: '偏小。轨道频率是 75 Hz（引力波 150 Hz 的一半），总质量是 65 M☉。' };
              return { ok: false, msg: '数量级不对。注意单位：结果要换成 km。' };
            },
            onOk: () => { a = true; after.hidden = false; api.typeset(after); } });
          const rows = [
            ['太阳那样的恒星', '≈ 700 000 km', '—', '1 400 000 km'],
            ['白矮星', '≈ 6 000 km', '≈ 1.4 M☉（钱德拉塞卡极限）', '≈ 12 000 km'],
            ['中子星', '≈ 12 km', '≈ 2–3 M☉', '≈ 24 km'],
            ['黑洞（36 + 29 M☉）', `史瓦西半径 2GM/c² = ${RS(36).toFixed(0)} / ${RS(29).toFixed(0)} km`, '无上限', `${(RS(36) + RS(29)).toFixed(0)} km`],
          ];
          const tbl = h.el('div', { class: 'dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, ['天体', '半径', '单颗最大质量', '两颗相触的中心距'].map((t) => h.el('th', { text: t })))]),
            h.el('tbody', {}, rows.map((r) => h.el('tr', {}, r.map((t) => h.el('td', { text: t }))))),
          ])]);
          const cap = h.el('div', { class: 'ligc-cap', text: `对照：你算出的中心距 a ≈ ${aKep.toFixed(0)} km；每颗约 30 M☉。` });
          const quiz = H.quiz({
            question: '两颗各约 30 M☉ 的天体中心相距约 340 km、还在绕转。它们是什么？',
            options: [
              { label: '太阳那样的恒星', ok: false, why: '太阳半径 70 万 km，是 340 km 的两千倍——两颗早就合成一团了。' },
              { label: '白矮星', ok: false, why: '白矮星半径约 6000 km，远大于 340 km；而且单颗质量不能超过 ≈1.4 M☉。' },
              { label: '中子星', ok: false, why: '尺寸够小，但中子星超过 ≈2–3 M☉ 就会坍缩，凑不出 30 M☉。' },
              { label: '黑洞', ok: true, why: `对。只有黑洞既能这么重、又这么小：史瓦西半径 ${RS(36).toFixed(0)} km 与 ${RS(29).toFixed(0)} km，相加 ${(RS(36) + RS(29)).toFixed(0)} km，仍小于 ${aKep.toFixed(0)} km。` },
            ],
            onOk: () => { if (a && !api.solved()) api.done('<b>两个黑洞。</b>GW150914：13 亿光年外一对约 36 和 29 M☉ 的黑洞并合，约 3 M☉c² 的能量在 0.2 秒内以引力波辐射出去——人类第一次直接探测到引力波，也第一次"听见"双黑洞。Weiss、Barish、Thorne 因此获得 2017 年诺贝尔物理学奖。'); },
          });
          after.append(cap, tbl, quiz.el);
          body.append(ans.el, after);
          api.typeset(body);
          return null;
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3, stage4]);
    },
  };
})();
