/* 强磁场里的二维电子 — Klaus von Klitzing, Nobel Physics 1985 (challenge)
 * Stage 1 霍尔电压: Si-MOSFET Hall bar, 4.2 K, B ≤ 1 T (Drude): V_H = IB/(ne), I = 1 μA → n at V_g = 10 V.
 *   Gate = capacitor: n = C'(V_g − V_t)/e, C'/e = ε0·3.9/(e·100 nm) = 2.155e15 m⁻² V⁻¹, V_t = 0.62 V ⇒ n(10 V) = 2.022e16 m⁻².
 * Stage 2 18 T, 1.5 K gate sweep: R_xy plateaus at h/(ie²) while R_xx → 0 (A: i = 4 at 8.70 V, i = 8 at 16.78 V;
 *   B: i = 4 at 10.59 V). The reader finds R_0 = h/e² = 25 812.807 Ω and that it does not depend on the sample.
 * Stage 3 Landau counting: one sublevel holds eB/h per m² (2.418e14 m⁻² T⁻¹, mass-independent);
 *   GaAs (one valley), n = 3.0e15 m⁻² ⇒ the i = 2 plateau is centred at B = nh/(2e) = 6.20 T.
 * Transport model (示意, phenomenological, not a microscopic calculation): sublevels E = ħω_c(N+½) ± gμ_B B/2 ± Δ_v/2,
 *   each a Gaussian of width G = G1·√B in the DOS (this fixes E_F); only a core of width γ = fx·G is extended.
 *   S(E) = Σ_j Φ((E−E_j)/γ) counts extended states below E; m(E) is their density relative to the average.
 *   Both are smeared over the Fermi window (Gaussian of variance π²(kT)²/3 added to γ²), then σ_xx = m·σ_D, σ_xy = S·e²/h − σ_xx/(μB), σ_D = neμ/(1+μ²B²).
 *   S → ν, m → 1 gives Drude exactly at low field; in a mobility gap σ_xx → 0 and σ_xy → i·e²/h (exponentially accurate).
 * Constants (exact since 2019): h = 6.62607015e-34 J s, e = 1.602176634e-19 C; ħe/m_e = 0.115768 meV/T;
 *   μ_B = 0.0578838 meV/T; k_B = 0.0861733 meV/K; ε0 = 8.8541878128e-12 F/m.
 */
(() => {
  const R = String.raw;
  const HP = 6.62607015e-34, EC = 1.602176634e-19, RK = HP / (EC * EC), EH = EC / HP;
  const HWC = 0.1157676, MUB = 0.0578838, KBM = 0.08617333;
  const CE = (8.8541878128e-12 * 3.9) / (EC * 100e-9); // C'/e, 100 nm SiO₂
  const GEO = 2.6; // probe spacing / width = 130 μm / 50 μm (1980 Hall bar): R_xx = 2.6 ρ_xx
  // model samples: m* (m_e), effective g (exchange-enhanced), valley splitting (meV/T), valleys, mobility (m²/Vs), DOS width (meV/√T), extended fraction
  const SA = { m: 0.19, g: 4, dv: 0.1, nv: 2, mu: 1.6, G1: 0.16, fx: 0.3, ce: CE, vt: 0.62 };
  const SB = { m: 0.19, g: 4, dv: 0.09, nv: 2, mu: 1.0, G1: 0.2, fx: 0.3, ce: CE / 1.2, vt: 0.9 }; // 120 nm oxide
  const VG0 = 2.5, VG1 = 25, NG = 900;

  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  const Phi = (z) => (z > 8 ? 1 : z < -8 ? 0 : 0.5 * (1 + erf(z / Math.SQRT2)));
  function levels(B, S, Emax) { // sorted sublevel energies (meV) with their Landau index
    const hw = (HWC * B) / S.m, ds = S.g * MUB * B, dv = S.nv === 2 ? S.dv * B : 0, out = [];
    for (let N = 0; N < 4000; N++) {
      const b = hw * (N + 0.5); if (b - ds / 2 - dv / 2 > Emax) break;
      for (const s of [-1, 1]) { if (S.nv === 2) out.push({ E: b + (s * ds) / 2 - dv / 2, N }, { E: b + (s * ds) / 2 + dv / 2, N }); else out.push({ E: b + (s * ds) / 2, N }); }
    }
    return out.sort((a, b) => a.E - b.E);
  }
  function cnt(L, E, w) { let c = 0; for (const l of L) { const z = (E - l.E) / w; if (z > 8) c += 1; else if (z < -8) break; else c += Phi(z); } return c; }
  function ext(L, E, w) { let c = 0; for (const l of L) { const z = (E - l.E) / w; if (z < -9) break; if (z < 9) c += Math.exp(-0.5 * z * z); } return c / (2.5066282746 * w); }
  function transport(B, n, T, S) { // B (T), n (m⁻²), T (K) → ρ_xx, ρ_xy (Ω), E_F (meV)
    B = Math.max(B, 1e-3);
    const nu = n / (EH * B), hw = (HWC * B) / S.m, x = S.mu * B, sD = (n * EC * S.mu) / (1 + x * x);
    const G = S.G1 * Math.sqrt(B), gam = S.fx * G, kT = KBM * Math.max(T, 0.05), per = 2 * S.nv;
    const X = (2 * Math.PI * Math.PI * kT) / hw; // skip the level sums when the oscillations are negligible
    const damp = Math.exp((-2 * Math.PI * Math.PI * G * G) / (hw * hw)) * (X > 50 ? 0 : X / Math.sinh(Math.max(X, 1e-9)));
    let Sx = nu, m = 1, EF = NaN;
    if (damp > 1e-6) {
      const GD = Math.sqrt(G * G + 3.29 * kT * kT), Emax = hw * (nu / per + 2) + 12 * GD + 12 * kT, L = levels(B, S, Emax);
      let a = L[0].E - 10 * GD, b = Emax;
      for (let i = 0; i < 46; i++) { const c = 0.5 * (a + b); if (cnt(L, c, GD) < nu) a = c; else b = c; }
      EF = 0.5 * (a + b);
      const wT = Math.sqrt(gam * gam + 3.29 * kT * kT); // thermal smearing: −∂f/∂E has variance π²(kT)²/3 (Gaussian approximation)
      Sx = cnt(L, EF, wT); m = (ext(L, EF, wT) * hw) / per;
    }
    const sxx = sD * m, sxy = Sx / RK - sxx / x, den = sxx * sxx + sxy * sxy;
    return { nu, EF, hw, G, gam, rxy: sxy / den, rxx: sxx / den };
  }

  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (k) => { const r = mulberry32(Math.imul(k | 0, 2654435761) ^ 0x5bd1e995); const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * r()); };
  const fmt = (v, d) => v.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function watchTheme(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-qhe')) return;
    const s = document.createElement('style'); s.id = 'st-qhe';
    s.textContent = `
.qhe-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px;margin-top:4px}
.qhe-sec[hidden]{display:none}
.qhe-sec h4{margin:0;font-size:14px}
.qhe-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.qhe-tbl{max-height:240px;overflow:auto}
.dtable td.qhe-l,.dtable th.qhe-l{text-align:left}`;
    document.head.append(s);
  }

  /* ---------- Stage 1: classical Hall effect ---------- */
  function stage1(ctx) {
    const nOf = (vg) => SA.ce * (vg - SA.vt);
    return {
      title: '霍尔电压',
      task: R`<p>1980 年初。你手里是一只硅 MOSFET 做成的霍尔条（Dorda 在西门子、Pepper 在 Plessey 制备的那一类样品）：正的栅压 $V_g$ 把电子吸到 Si/SiO₂ 界面，形成一层只有几纳米厚的<b>二维电子气</b>。沿条通 $I = 1\ \mu\mathrm{A}$ 的电流，加垂直磁场 $B$，测横向的霍尔电压 $V_H$。</p>
<p>先在 4.2 K、弱磁场（$B \le 1$ T）下热身：在几个磁场下记录 $V_H$，求出 $V_g = 10$ V 时界面上每平方米有多少个电子。</p>`,
      hints: [
        R`稳态时电子受的洛伦兹力 $evB$ 被横向电场 $eE_y$ 抵消。电流 $I = n e v W$（$W$ 是条宽，$n$ 是每平方米的电子数），横向电压 $V_H = E_y W$。`,
        R`消去 $v$：$V_H = IB/(ne)$，条宽 $W$ 消掉了。所以从 $V_H/B$ 的斜率就能读出 $n$。`,
        R`读得斜率 $V_H/B \approx 309\ \mu\mathrm{V/T}$，于是 $n = I/(e\cdot\text{斜率}) = 10^{-6}/(1.602\times10^{-19}\times3.09\times10^{-4}) \approx 2.02\times10^{16}\ \mathrm{m^{-2}}$。`,
      ],
      answer: R`力平衡 $eE_y = evB$ 与 $I = nevW$ 给出 $V_H = E_yW = IB/(ne)$，即 $R_{xy} = V_H/I = B/(ne)$。$V_g = 10$ V 时斜率约 $309\ \mu\mathrm{V/T}$，所以 $n = I/(e\cdot 3.09\times10^{-4}\ \mathrm{V/T}) \approx 2.02\times10^{16}\ \mathrm{m^{-2}}$（$=2.02\times10^{12}\ \mathrm{cm^{-2}}$）。换其他栅压可见 $n$ 与 $V_g - V_t$ 成正比：栅极和电子层构成一个平行板电容器。`,
      build(body, api) {
        const h = H, C = (k) => ctx.color(k);
        const COL = { 6: '--s3', 10: '--s1', 14: '--s4' };
        const st = { vg: 10, B: 0.5, pts: [] };
        const vh = (vg, B) => B / (nOf(vg) * EC) + 1.5 * gauss(Math.round(B * 100) * 41 + vg); // μV; voltmeter noise σ = 1.5 μV
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.58, minH: 220, maxH: 340 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const cG = h.choice({ label: '栅压 V_g', value: 10, options: [6, 10, 14].map((v) => ({ value: v, label: v + ' V' })), onChange: (v) => { st.vg = v; draw(); } });
        const sB = h.slider({ label: '磁场 B', min: 0, max: 1, step: 0.01, value: st.B, format: (v) => v.toFixed(2) + ' T', onInput: (v) => { st.B = v; draw(); } });
        const bt = h.el('div', { class: 'ctl' }, [h.el('div', {}, [
          h.button({ label: '记录这一点', onClick: () => { st.pts.push([st.vg, st.B, vh(st.vg, st.B)]); if (st.pts.length > 40) st.pts.shift(); draw(); } }),
          h.button({ label: '清空', onClick: () => { st.pts = []; draw(); } }),
        ])]);
        ctl.append(cG.el, sB.el, bt);
        const roW = h.el('div', { class: 'lab-readout' }); body.append(roW);
        const ro = { V: h.readout('霍尔电压 V_H'), R: h.readout('R_xy = V_H / I'), N: h.readout('已记录') };
        roW.append(ro.V.el, ro.R.el, ro.N.el);
        const a = H.answer({
          label: R`$V_g = 10$ V 时的电子面密度 $n$ = ?（单位 $10^{16}\ \mathrm{m^{-2}}$，容差 ±4%）`, placeholder: 'n', unit: '×10¹⁶ m⁻²',
          check: (v) => {
            setTimeout(() => api.typeset(a.el), 0);
            const nt = nOf(10) / 1e16, near = (x, y, tol = 0.05) => Math.abs(x / y - 1) <= tol;
            if (near(v, nt, 0.04)) return { ok: true, msg: `对：$n \\approx ${nt.toFixed(2)}\\times10^{16}\\ \\mathrm{m^{-2}}$，即每平方微米约两万个电子。` };
            if (near(v, nOf(6) / 1e16) || near(v, nOf(14) / 1e16)) return { ok: false, msg: '这是另一个栅压下的密度，题目问的是 V_g = 10 V。' };
            if (near(v, 0.3087) || near(v, 308.7) || near(v, 3.087e-4)) return { ok: false, msg: '这是斜率 V_H/B，还要换算成 n = I/(e·斜率)。' };
            if (near(v, nt * 1e16)) return { ok: false, msg: '单位里已经有 10¹⁶ m⁻²，只填系数。' };
            if (near(v, nt * 1e12) || near(v, nt * 1e-4)) return { ok: false, msg: '这是按 cm⁻² 计的数值：1 cm⁻² = 10⁴ m⁻²。' };
            if (near(v, nt * 1e3) || near(v, nt * 1e-3) || near(v, nt * 1e6) || near(v, nt * 1e-6)) return { ok: false, msg: '数量级不对：检查 μV、mV 与 V 的换算。' };
            return { ok: false, msg: '不对。想想洛伦兹力和横向电场怎样平衡，电流又怎样由 n 决定。' };
          },
          onOk: () => api.done(R`<b>经典霍尔效应</b>：$R_{xy} = V_H/I = B/(ne)$，随 $B$ 线性增长，斜率只由电子的面密度决定。对二维导体，它与霍尔条的长度、宽度都无关。栅压就是电容器的电压，$n = C'(V_g - V_t)/e$，可以连续调节电子数。`),
        });
        body.append(a.el);
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: 0, x1: 1, y0: 0, y1: 600, pad: { l: 46, r: 12, t: 14, b: 34 }, xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1], yTicks: [0, 200, 400, 600], fmtX: (v) => v.toFixed(1), xLabel: 'B (T)', yLabel: 'V_H (μV)' }, C);
          st.pts.forEach(([vg, B, v]) => { g.fillStyle = C(COL[vg]); g.beginPath(); g.arc(ax.X(B), ax.Y(Math.max(0, Math.min(600, v))), 3.2, 0, 6.283); g.fill(); });
          const cur = vh(st.vg, st.B);
          g.strokeStyle = C(COL[st.vg]); g.lineWidth = 2; g.beginPath(); g.arc(ax.X(st.B), ax.Y(Math.max(0, Math.min(600, cur))), 6, 0, 6.283); g.stroke();
          g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'top';
          [6, 10, 14].forEach((v, i) => { g.fillStyle = C(COL[v]); g.fillText('● V_g = ' + v + ' V', ax.p.l + 8, ax.p.t + 6 + 15 * i); });
          ro.V.set(cur.toFixed(1) + ' μV');
          ro.R.set(cur.toFixed(1) + ' Ω');
          ro.N.set(st.pts.length + ' 个点');
        }
        cv.onResize(draw);
        const un = watchTheme(draw);
        draw();
        return { destroy() { cv.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 2: the gate sweep at 18 T ---------- */
  function stage2(ctx) {
    return {
      title: '18 特斯拉，1.5 开',
      task: R`<p>1980 年 2 月 4 日夜，格勒诺布尔强磁场实验室。磁体给出 $B = 18$ T，样品泡在减压到 1.5 K 的液氦里，电流仍是 $1\ \mu\mathrm{A}$。按经典的结果 $R_{xy} = B/(ne)$，霍尔电阻应随栅压（也就是随 $n$）平滑地下降。</p>
<p>拖动栅压滑块（或按“自动扫描”），记录霍尔电阻 $R_{xy} = U_H/I$ 和纵向电阻 $R_{xx} = U_{xx}/I$。有两块样品可测，它们的氧化层厚度和迁移率都不同。找出曲线里最反常的地方，把滑块停在那里精确读数，并记下来。</p>`,
      hints: [
        R`看 $R_{xx}$ 掉到零的那些区间：那里的 $R_{xy}$ 还随栅压变化吗？把滑块停在区间中央，读到 0.01 Ω。`,
        R`把不同平台上的读数两两相除；再换样品 B，测一个平台比一比。`,
        R`样品 A 最宽的两个平台读数约为 6453.20 Ω 和 3226.60 Ω，比值正好是 2；窄一些的 12 906.5 Ω 约是 6453.20 Ω 的 2 倍。它们都等于 25 812.8 Ω 除以 4、8、2。再用 $h = 6.626\times10^{-34}$ J s、$e = 1.602\times10^{-19}$ C 算一算 $h/e^2$。`,
      ],
      answer: R`扫描后可见：在 $R_{xx}$ 降到零的区间里，$R_{xy}$ 完全平直。样品 A 在 $V_g \approx 8.7$ V 读得 6453.20 Ω，在 16.8 V 读得 3226.60 Ω，在 4.66 V 读得约 12 906.5 Ω（这个平台窄，只准到约 $10^{-5}$）。它们都等于 $R_0/i$，$R_0 = 25\,812.8\ \Omega$，$i = 4, 8, 2$。样品 B 的平台出现在别的栅压（如 10.6 V），数值却相同。$R_0 = h/e^2$：平台的值只由基本常数决定。冯·克利青、Dorda 与 Pepper 1980 年报告 $h/4e^2 = 6453.17 \pm 0.02\ \Omega$，并据此给出精细结构常数 $\alpha^{-1} = 137.0353(4)$。`,
      build(body, api) {
        const h = H, C = (k) => ctx.color(k);
        const SAM = { A: SA, B: SB };
        const nOf = (S, vg) => S.ce * (vg - S.vt);
        const grid = {};
        for (const k of ['A', 'B']) { // precomputed sweep for the chart recorder
          const xy = new Float64Array(NG + 1), xx = new Float64Array(NG + 1); let mx = 0;
          for (let i = 0; i <= NG; i++) { const r = transport(18, nOf(SAM[k], VG0 + ((VG1 - VG0) * i) / NG), 1.5, SAM[k]); xy[i] = r.rxy; xx[i] = GEO * r.rxx; mx = Math.max(mx, xx[i]); }
          const ym = Math.ceil(mx / 1000 + 0.3);
          grid[k] = { xy, xx, ym, vis: new Uint8Array(NG + 1) };
        }
        const idx = (v) => Math.max(0, Math.min(NG, Math.round(((v - VG0) / (VG1 - VG0)) * NG)));
        const st = { s: 'A', vg: 4, rows: [] };
        const meas = (k, vg) => { // reproducible voltmeter noise
          const r = transport(18, nOf(SAM[k], vg), 1.5, SAM[k]), q = Math.round(vg * 100) * 2 + (k === 'B' ? 1 : 0);
          return { rxy: r.rxy * (1 + 4e-6 * gauss(q)), rxx: GEO * r.rxx + 0.03 * gauss(q + 99991) };
        };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.8, minH: 300, maxH: 460 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const cS = h.choice({ label: '样品', value: 'A', options: [{ value: 'A', label: 'A（100 nm 氧化层）' }, { value: 'B', label: 'B（120 nm）' }], onChange: (v) => { st.s = v; grid[v].vis[idx(st.vg)] = 1; update(); } });
        const sV = h.slider({ label: '栅压 V_g', min: VG0, max: VG1, step: 0.01, value: st.vg, format: (v) => v.toFixed(2) + ' V', onInput: (v) => moveTo(v) });
        let anim = null;
        const bScan = h.button({ label: '自动扫描 →', onClick: scan });
        const bt = h.el('div', { class: 'ctl' }, [h.el('div', {}, [bScan, h.button({ label: '记录这一点', onClick: record }), h.button({ label: '清除曲线', onClick: () => { grid.A.vis.fill(0); grid.B.vis.fill(0); grid[st.s].vis[idx(st.vg)] = 1; draw(); } })])]);
        ctl.append(cS.el, sV.el, bt);
        const roW = h.el('div', { class: 'lab-readout' }); body.append(roW);
        const ro = { U: h.readout('霍尔电压 U_H'), xy: h.readout('R_xy = U_H / I'), xx: h.readout('R_xx = U_xx / I') };
        Object.values(ro).forEach((r) => roW.append(r.el));
        body.append(h.el('p', { class: 'qhe-note', text: '曲线由一个唯象输运模型生成（示意，不是原始数据）；读数含微小的仪表噪声。' }));
        const tb = h.el('div', { class: 'dtable qhe-tbl' }); body.append(tb);
        const sec = h.el('div', { class: 'qhe-sec' }); body.append(sec);
        let okR = false, okQ = false;
        const finish = () => { if (okR && okQ) api.done(R`<b>量子化霍尔电阻</b>：在 $R_{xx} = 0$ 的区间，$R_{xy}$ 锁定在 $h/(ie^2)$，$i$ 为整数。它与样品的氧化层、迁移率、电子密度、几何形状都无关，只由普朗克常数和电子电荷决定。经典的 $B/(ne)$ 只在每个平台的中点附近与它相交。`); };
        const a = H.answer({
          label: R`你测到的几个特殊值都可以写成同一个电阻 $R_0$ 除以一个正整数。$R_0$ = ?（容差 ±0.02%）`, unit: 'Ω', placeholder: 'R₀',
          check: (v) => {
            setTimeout(() => api.typeset(a.el), 0);
            if (Math.abs(v / RK - 1) <= 2e-4) return { ok: true, msg: `对：$R_0 \\approx ${fmt(v, 1)}\\ \\Omega$。下面看看它是什么。` };
            for (const i of [2, 3, 4, 6, 8, 10, 12]) if (Math.abs((v * i) / RK - 1) < 2e-3) return { ok: false, msg: `这是 $R_0/${i}$ 那个平台本身。找出所有平台共同的那个“单位”。` };
            if (Math.abs(v / (2 * RK) - 1) < 2e-3) return { ok: false, msg: '大了一倍：最大的那个整数比是多少？' };
            return { ok: false, msg: '不对。先在 R_xx ≈ 0 的区间读准几个 R_xy，再看它们的比值。' };
          },
          onOk: () => { okR = true; qBox.hidden = false; api.typeset(qBox); finish(); },
        });
        const qBox = h.el('div', { hidden: true });
        qBox.append(H.quiz({
          question: R`$R_0$ 等于下面哪个组合？（自己代入常数算一算）`,
          options: [
            { label: R`$\hbar/e^2$`, ok: false, why: R`$\hbar/e^2 = 4108.2\ \Omega$，差了 $2\pi$ 倍。` },
            { label: R`$h/e^2$`, ok: true, why: R`对：$h/e^2 = 25\,812.807\ \Omega$。它又等于 $\mu_0 c/(2\alpha)$，所以测量平台就是在测精细结构常数 $\alpha$，这正是 1980 年论文标题的意思。今天 $h$ 与 $e$ 都是定义值，$R_K = h/e^2$ 是精确数。` },
            { label: R`$h/(2e^2)$`, ok: false, why: R`$h/2e^2 = 12\,906.4\ \Omega$，这是 $R_0/2$，对应 $i = 2$ 的平台。` },
            { label: R`$\mu_0 c/2$`, ok: false, why: R`$\mu_0 c/2 \approx 188.4\ \Omega$（真空阻抗的一半）。有趣的是 $R_0$ 恰好是它的 $1/\alpha \approx 137.04$ 倍。` },
            { label: R`$m^*/(n e^2\tau)$（零场电阻率）`, ok: false, why: R`这个量依赖电子密度和散射时间，每块样品都不一样；可两块样品给出同一个 $R_0$。` },
          ],
          onOk: () => { okQ = true; finish(); },
        }).el);
        sec.append(h.el('h4', { text: '读数与对账' }), a.el, qBox);

        function moveTo(v, silent) {
          v = Math.max(VG0, Math.min(VG1, v));
          const vis = grid[st.s].vis, i0 = idx(st.vg), i1 = idx(v);
          for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) vis[i] = 1;
          st.vg = v; if (!silent) sV.set(v);
          update();
        }
        function scan() {
          if (anim) { anim.stop(); anim = null; bScan.textContent = '自动扫描 →'; return; }
          if (st.vg >= VG1 - 1e-9) { st.vg = VG0; sV.set(VG0); }
          if (ctx.reduced) { moveTo(VG1); return; }
          bScan.textContent = '暂停';
          anim = h.loop((dt) => {
            moveTo(st.vg + 3 * dt);
            if (st.vg >= VG1 - 1e-9) { anim.stop(); anim = null; bScan.textContent = '自动扫描 →'; }
          }).start();
        }
        function record() {
          const m = meas(st.s, st.vg); st.rows.push([st.s, st.vg, m.rxy, m.rxx]); if (st.rows.length > 12) st.rows.shift();
          tb.innerHTML = '<table><thead><tr><th class="qhe-l">样品</th><th>V_g (V)</th><th>R_xy (Ω)</th><th>R_xx (Ω)</th></tr></thead><tbody>' +
            st.rows.map((r) => `<tr><td class="qhe-l">${r[0]}</td><td>${r[1].toFixed(2)}</td><td>${fmt(r[2], 2)}</td><td>${fmt(r[3], 2)}</td></tr>`).join('') + '</tbody></table>';
        }
        function update() {
          const m = meas(st.s, st.vg);
          ro.U.set((m.rxy * 1e-3).toFixed(5) + ' mV');
          ro.xy.set(fmt(m.rxy, 2) + ' Ω'); ro.xx.set(fmt(m.rxx, 2) + ' Ω');
          draw();
        }
        function trace(g, ax, arr, vis, scale, y1) {
          let on = false; g.beginPath();
          for (let i = 0; i <= NG; i++) {
            if (!vis[i]) { on = false; continue; }
            const x = ax.X(VG0 + ((VG1 - VG0) * i) / NG), y = ax.Y(Math.max(0, Math.min(y1, arr[i] * scale)));
            on ? g.lineTo(x, y) : g.moveTo(x, y); on = true;
          }
          g.stroke();
        }
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, split = Math.round(Hh * 0.56), mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const xT = [5, 10, 15, 20, 25], ym = grid[st.s].ym, other = st.s === 'A' ? 'B' : 'A';
          const top = h.axes(g, W, Hh, { x0: VG0, x1: VG1, y0: 0, y1: 30, pad: { l: 46, r: 10, t: 10, b: Hh - split + 6 }, xTicks: xT, yTicks: [0, 10, 20, 30], fmtX: () => '', yLabel: 'R_xy (kΩ)' }, C);
          const bot = h.axes(g, W, Hh, { x0: VG0, x1: VG1, y0: 0, y1: ym, pad: { l: 46, r: 10, t: split + 6, b: 34 }, xTicks: xT, yTicks: ym > 6 ? [0, 2, 4, 6, 8, 10].filter((t) => t <= ym) : [...Array(ym + 1).keys()], xLabel: 'V_g (V)', yLabel: 'R_xx (kΩ)' }, C);
          g.lineWidth = 1.6;
          g.globalAlpha = 0.35; g.strokeStyle = C('--s3'); trace(g, top, grid[other].xy, grid[other].vis, 1e-3, 30); g.globalAlpha = 1;
          g.strokeStyle = C('--s1'); trace(g, top, grid[st.s].xy, grid[st.s].vis, 1e-3, 30);
          g.strokeStyle = C('--s2'); trace(g, bot, grid[st.s].xx, grid[st.s].vis, 1e-3, ym);
          const x = top.X(st.vg), m = meas(st.s, st.vg);
          g.strokeStyle = C('--accent'); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, top.p.t); g.lineTo(x, Hh - 34); g.stroke();
          g.fillStyle = C('--accent');
          g.beginPath(); g.arc(x, top.Y(Math.min(30, m.rxy * 1e-3)), 4.5, 0, 6.283); g.fill();
          g.beginPath(); g.arc(x, bot.Y(Math.max(0, Math.min(ym, m.rxx * 1e-3))), 4.5, 0, 6.283); g.fill();
          g.font = '11px ' + mono; g.textAlign = 'right'; g.textBaseline = 'top';
          g.fillStyle = C('--muted'); g.fillText(`样品 ${st.s} · B = 18 T · 1.5 K`, W - 14, top.p.t + 4);
          if (grid[other].vis.some((v) => v)) { g.fillStyle = C('--s3'); g.fillText(`浅色：样品 ${other}`, W - 14, top.p.t + 19); }
        }
        cv.onResize(draw);
        const un = watchTheme(draw);
        grid.A.vis[idx(st.vg)] = 1;
        update();
        return { destroy() { if (anim) anim.stop(); cv.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 3: counting Landau levels ---------- */
  function stage3(ctx) {
    const nOf = (vg) => SA.ce * (vg - SA.vt);
    return {
      title: '数一数朗道能级',
      task: R`<p>朗道（1930）：磁场中二维电子的动能只能取 $E_N = \hbar\omega_c(N + \tfrac12)$，$\omega_c = eB/m^*$。在 Si(100) 反型层里，每个朗道能级又按自旋（2 个）和能谷（2 个）分成 4 个子能级；杂质把每个子能级展宽成一个峰。</p>
<p>下图是样品 A 在 1.5 K 的态密度示意，金色是被电子占据的部分。$n = C'(V_g - V_t)/e$，$C'/e = 2.155\times10^{15}\ \mathrm{m^{-2}\,V^{-1}}$，$V_t = 0.62$ V。改变 $B$ 与 $V_g$，对照 $R_{xy}$。问题是：一个子能级到底能装多少个电子？</p>`,
      hints: [
        R`零场时，二维电子（固定自旋和能谷）的态密度是常数 $g_0 = m^*/(2\pi\hbar^2)$。加磁场后，原来能量落在宽度为 $\hbar\omega_c$ 的一段里的态，全部并入同一个朗道能级。也可以直接测：在平台中央读 $n$，除以 $iB$。`,
        R`$g_0\cdot\hbar\omega_c = \dfrac{m^*}{2\pi\hbar^2}\cdot\dfrac{\hbar eB}{m^*} = \dfrac{eB}{h}$：有效质量消掉了。`,
        R`每个子能级每特斯拉 $e/h = 2.418\times10^{14}\ \mathrm{m^{-2}}$。GaAs 只有一个能谷，$i = 2$ 表示最低朗道能级的两个自旋子能级都填满：$n = 2eB/h$，$B = nh/(2e) \approx 6.2$ T。`,
      ],
      answer: R`每个子能级每单位面积的态数 $= g_0\hbar\omega_c = eB/h$，即每个磁通量子 $\Phi_0 = h/e$ 一个态（$e/h = 2.418\times10^{14}\ \mathrm{m^{-2}T^{-1}}$，18 T 时 $4.35\times10^{15}\ \mathrm{m^{-2}}$）。所以填满 $i$ 个子能级需要 $n = ieB/h$，即<b>填充因子</b> $\nu = nh/(eB) = i$。样品 A 在 18 T 下 $i = 4$ 的平台中心在 $V_g = 0.62 + 4\times4.35/2.155 \approx 8.70$ V，与第二关吻合。GaAs：$B = nh/(2e) = 3.0\times10^{15}/(2\times2.418\times10^{14}) \approx 6.20$ T，与 $m^*$ 无关。`,
      build(body, api) {
        const h = H, C = (k) => ctx.color(k);
        const st = { B: 18, vg: 8.7 };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.55, minH: 220, maxH: 330 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sB = h.slider({ label: '磁场 B', min: 2, max: 20, step: 0.1, value: st.B, format: (v) => v.toFixed(1) + ' T', onInput: (v) => { st.B = v; draw(); } });
        const sV = h.slider({ label: '栅压 V_g', min: VG0, max: VG1, step: 0.01, value: st.vg, format: (v) => v.toFixed(2) + ' V', onInput: (v) => { st.vg = v; draw(); } });
        ctl.append(sB.el, sV.el);
        const roW = h.el('div', { class: 'lab-readout' }); body.append(roW);
        const ro = { n: h.readout('电子面密度 n'), E: h.readout('费米能 E_F'), xy: h.readout('R_xy'), xx: h.readout('R_xx') };
        Object.values(ro).forEach((r) => roW.append(r.el));
        const sec = h.el('div', { class: 'qhe-sec' }); body.append(sec);
        let ok1 = false, ok2 = false;
        const finish = () => { if (ok1 && ok2) api.done(R`<b>朗道能级计数与填充因子</b>：每个子能级每单位面积恰好容纳 $eB/h$ 个电子，也就是每个磁通量子 $h/e$ 一个态，与有效质量和材料无关。平台出现在填充因子 $\nu = nh/(eB)$ 接近整数 $i$ 的区间，此时 $R_{xy} = h/(ie^2)$：$i$ 就是被填满的子能级数。费米能落在两组能级之间的局域态里时，多加的电子不导电，$R_{xy}$ 便保持不变。`); };
        const a1 = H.answer({
          label: R`一个子能级（固定自旋、固定能谷）每平方米、每特斯拉能容纳多少个电子？（容差 ±2%）`, unit: '×10¹⁴ m⁻² T⁻¹', placeholder: '?',
          check: (v) => {
            setTimeout(() => api.typeset(a1.el), 0);
            const t = EH / 1e14, near = (x, y, tol = 0.03) => Math.abs(x / y - 1) <= tol;
            if (near(v, t, 0.02)) return { ok: true, msg: `对：$e/h = ${t.toFixed(3)}\\times10^{14}\\ \\mathrm{m^{-2}T^{-1}}$，与有效质量无关。` };
            if (near(v, 2 * t)) return { ok: false, msg: '这是两个子能级（两个自旋方向）加起来的。' };
            if (near(v, 4 * t)) return { ok: false, msg: '这是整个朗道能级（4 个子能级）的。' };
            if (near(v, 2 * Math.PI * t)) return { ok: false, msg: 'eB/ħ 多了 2π：零场态密度是 m*/(2πħ²)。' };
            if (near(v, t * 1e14) || near(v, t * 1e-14)) return { ok: false, msg: '单位里已经有 10¹⁴，只填系数。' };
            return { ok: false, msg: '不对。零场态密度乘以朗道能级的间距 ħω_c 试试。' };
          },
          onOk: () => { ok1 = true; finish(); },
        });
        const a2 = H.answer({
          label: R`预言：一块 GaAs/AlGaAs 异质结（$m^* = 0.067\,m_e$，只有一个能谷，自旋分裂可分辨），$n = 3.0\times10^{15}\ \mathrm{m^{-2}}$。$i = 2$ 平台的中心在多大磁场？（容差 ±3%）`, unit: 'T', placeholder: 'B',
          check: (v) => {
            setTimeout(() => api.typeset(a2.el), 0);
            const t = 3.0e15 / (2 * EH), near = (x, y, tol = 0.03) => Math.abs(x / y - 1) <= tol;
            if (near(v, t)) return { ok: true, msg: `对：$B = nh/(2e) = ${t.toFixed(2)}$ T。电子比硅里轻三倍，能级间距大三倍，但每个子能级的容量完全一样。` };
            if (near(v, t / 2)) return { ok: false, msg: '你按硅的 4 重简并算了：GaAs 只有一个能谷。' };
            if (near(v, 2 * t)) return { ok: false, msg: '这是 i = 1 的平台（只填满一个自旋子能级）。' };
            if (near(v, (t * 0.19) / 0.067) || near(v, (t * 0.067) / 0.19)) return { ok: false, msg: '有效质量不进入子能级的容量。' };
            return { ok: false, msg: '不对。i = 2 意味着恰好填满两个子能级：n = 2 × (每个子能级的容量)。' };
          },
          onOk: () => { ok2 = true; finish(); },
        });
        sec.append(h.el('h4', { text: '计数' }), a1.el, a2.el);

        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const n = nOf(st.vg), r = transport(st.B, n, 1.5, SA), hw = r.hw, G = r.G, gam = r.gam;
          const E1 = Math.max(r.EF + 1.3 * hw, 2.3 * hw), L = levels(st.B, SA, E1 + 6 * G);
          const NS = 420, ys = new Float64Array(NS + 1), core = new Uint8Array(NS + 1); let ymax = 0;
          for (let i = 0; i <= NS; i++) {
            const E = (E1 * i) / NS; let s = 0;
            for (const l of L) { const z = (E - l.E) / G; if (z > -7 && z < 7) s += Math.exp(-0.5 * z * z); if (Math.abs(E - l.E) < gam) core[i] = 1; }
            ys[i] = s; ymax = Math.max(ymax, s);
          }
          const step = [0.5, 1, 2, 5, 10, 20].find((s) => E1 / s <= 7) || 20, xT = [];
          for (let t = 0; t <= E1 + 1e-9; t += step) xT.push(t);
          const ax = h.axes(g, W, Hh, { x0: 0, x1: E1, y0: 0, y1: ymax * 1.25, pad: { l: 24, r: 12, t: 22, b: 34 }, xTicks: xT, yTicks: [], fmtX: (v) => String(+v.toFixed(1)), xLabel: '能量 E (meV)', yLabel: '态密度' }, C);
          const X = (i) => ax.X((E1 * i) / NS), Y = (i) => ax.Y(ys[i]);
          const fillWhere = (pred, col, alpha) => {
            g.fillStyle = C(col); g.globalAlpha = alpha;
            for (let i = 0; i < NS; i++) if (pred(i)) { g.beginPath(); g.moveTo(X(i), ax.Y(0)); g.lineTo(X(i), Y(i)); g.lineTo(X(i + 1), Y(i + 1)); g.lineTo(X(i + 1), ax.Y(0)); g.closePath(); g.fill(); }
            g.globalAlpha = 1;
          };
          fillWhere((i) => (E1 * (i + 0.5)) / NS < r.EF, '--accent', 0.4);
          fillWhere((i) => core[i], '--s1', 0.55);
          g.strokeStyle = C('--fg'); g.lineWidth = 1.4; g.beginPath();
          for (let i = 0; i <= NS; i++) (i ? g.lineTo(X(i), Y(i)) : g.moveTo(X(i), Y(i))); g.stroke();
          g.font = '10.5px ' + mono; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = C('--muted');
          const every = Math.max(1, Math.ceil(36 / Math.max(1, ax.X(hw) - ax.X(0))));
          for (let N = 0; hw * (N + 0.5) < E1; N += every) g.fillText('N=' + N, ax.X(hw * (N + 0.5)), 6);
          const xf = ax.X(Math.min(E1, r.EF));
          g.strokeStyle = C('--warn'); g.lineWidth = 2; g.beginPath(); g.moveTo(xf, ax.p.t); g.lineTo(xf, ax.Y(0)); g.stroke();
          g.fillStyle = C('--warn'); g.textAlign = xf > W - 60 ? 'right' : 'left'; g.fillText('E_F', xf + (xf > W - 60 ? -4 : 4), ax.p.t + 4);
          g.textAlign = 'left'; g.textBaseline = 'middle';
          [['--accent', 0.4, '已占据'], ['--s1', 0.55, '扩展态（示意）']].forEach(([c, al, t], k) => {
            const lx = ax.p.l + 8, ly = ax.p.t + 12 + 15 * k; g.fillStyle = C(c); g.globalAlpha = al; g.fillRect(lx, ly - 5, 10, 10); g.globalAlpha = 1;
            g.fillStyle = C('--muted'); g.fillText(t, lx + 14, ly);
          });
          ro.n.set((n / 1e16).toFixed(3) + ' ×10¹⁶ m⁻²');
          ro.E.set(r.EF.toFixed(2) + ' meV');
          ro.xy.set(fmt(r.rxy, 2) + ' Ω'); ro.xx.set(fmt(GEO * r.rxx, 2) + ' Ω');
        }
        cv.onResize(draw);
        const un = watchTheme(draw);
        draw();
        return { destroy() { cv.destroy(); un(); } };
      },
    };
  }

  CHALLENGES.qhe = {
    title: '强磁场里的二维电子',
    _math: { transport, levels, RK, EH, SA, SB, CE, GEO },
    mount(root, ctx) {
      injectStyle();
      return H.stages(root, ctx, [stage1(ctx), stage2(ctx), stage3(ctx)]);
    },
  };
})();
