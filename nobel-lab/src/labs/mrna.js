/* mRNA 疫苗 — Nobel Medicine 2023 (Karikó & Weissman)
 * 两块：
 *  A. 核苷修饰 + LNP → 先天免疫激活（TNF-α）与蛋白表达（荧光素酶）
 *     抑制作用相乘：未被抑制的比例 ∏(1 − supp_i)；表达 = 递送 × 稳定性 × (1 − 0.92·PKR 激活)
 *     真值排序（表达）：m1Ψ > Ψ > m5U ≈ s2U > 无修饰；炎症方向相反。
 *     （示意性模型，用于让规律可读；真实数据见 Karikó et al., Immunity 2005 / Mol Ther 2008。）
 *  B. 试验规模 ↔ 有效性计算器
 *     VE = 1 − r_v/r_p；条件二项：给定总病例数 C，c_v ~ Bin(C, θ)，θ = λ_v T_v/(λ_v T_v + λ_p T_p)，
 *     VE = 1 − θ/((1−θ)r)，对 θ 递减 ⇒ 把 θ 的 Wilson 区间端点互换代入。
 *     2020 年报告近似值：8/18 198 vs 162/18 325 → VE = 95.0%，CI ≈ [90.0%, 97.5%]
 *     （报告为 90.3–97.6%，用贝叶斯方法并校正中期分析）。SE(logit θ) = 1/√(Cθ(1−θ)) ∝ C^(−1/2)。
 */
(() => {
  const UMODS = {
    U: { zh: '不替换', supp: 0, pkr: 0, dstab: 1.0 },
    psi: { zh: 'Ψ', supp: 0.93, pkr: 0.80, dstab: 1.0 },
    m1psi: { zh: 'm¹Ψ', supp: 0.96, pkr: 0.88, dstab: 1.12 },
    m5u: { zh: 'm⁵U', supp: 0.72, pkr: 0.42, dstab: 0.92 },
    s2u: { zh: 's²U', supp: 0.80, pkr: 0.45, dstab: 0.55 },
  };
  const C5 = { supp: 0.55, pkr: 0.30, dstab: 0.88 }, A6 = { supp: 0.48, pkr: 0.22, dstab: 0.70 };
  function assay(u, c5, a6, lnp) {
    const parts = [UMODS[u], c5 ? C5 : null, a6 ? A6 : null].filter(Boolean);
    let resid = 1, residP = 1, stab = 1;
    parts.forEach((p) => { resid *= 1 - p.supp; residP *= 1 - p.pkr; stab *= p.dstab; });
    return { tnf: 1180 * resid + 22, pkrOn: residP, luc: 1.0e6 * (lnp ? 1 : 0.14) * stab * (1 - 0.92 * residP) };
  }
  const veOf = (cv, cp, Tv, Tp) => { const th = cv / (cv + cp); return 1 - th / ((1 - th) * (Tv / Tp)); };
  function wilson(k, n, z = 1.96) {
    if (n === 0) return [0, 1];
    const p = k / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d;
    const hw = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [Math.max(0, c - hw), Math.min(1, c + hw)];
  }
  function veCI(cv, cp, Tv, Tp) {
    const [lo, hi] = wilson(cv, cv + cp), r = Tv / Tp, f = (th) => 1 - th / ((1 - th) * r);
    return [f(hi), f(lo)];
  }
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => SUP[d]);
  const sci = (v, d = 2) => { if (!isFinite(v) || v === 0) return String(v); const e = Math.floor(Math.log10(Math.abs(v))); return (v / 10 ** e).toFixed(d) + '×10' + sup(e); };
  const pct = (v) => (100 * v).toFixed(1) + '%';

  LABS.mrna = {
    title: 'mRNA 疫苗',
    _m: { assay, veOf, veCI, wilson },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { u: 'm1psi', c5: false, a6: false, lnp: true, view: 'bench', cv: 8, cp: 162, Nv: 18198, Np: 18325 };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '把"U 换成"从 m¹Ψ 拨回 U：炎症跳到十几倍，表达掉一个数量级——同一处化学改动的两端。关掉 LNP 看递送的代价。切到"试验计算器"，拖病例数：点估计不动，区间按 $C^{-1/2}$ 展宽。' });
      root.append(stage, controls, readout, hint);
      const cv = h.canvas(stage, { aspect: 0.56, minH: 200, maxH: 320 });

      const cView = h.choice({ label: '看哪一块', value: 'bench',
        options: [{ value: 'bench', label: '修饰与表达' }, { value: 'trial', label: '试验计算器' }],
        onChange: (v) => { S.view = v; sync(); draw(); } });
      const cU = h.choice({ label: '所有 U 换成', value: 'm1psi',
        options: Object.entries(UMODS).map(([k, v]) => ({ value: k, label: v.zh })),
        onChange: (v) => { S.u = v; draw(); } });
      const tC = h.toggle({ label: 'C → m⁵C', onChange: (b) => { S.c5 = b; draw(); } });
      const tA = h.toggle({ label: 'A → m⁶A', onChange: (b) => { S.a6 = b; draw(); } });
      const tL = h.toggle({ label: 'LNP 递送', value: true, onChange: (b) => { S.lnp = b; draw(); } });
      const sCv = h.slider({ label: '疫苗组病例数', min: 0, max: 60, step: 1, value: S.cv, format: (v) => v + ' 例', onInput: (v) => { S.cv = v; draw(); } });
      const sCp = h.slider({ label: '安慰剂组病例数', min: 1, max: 300, step: 1, value: S.cp, format: (v) => v + ' 例', onInput: (v) => { S.cp = v; draw(); } });
      const sN = h.slider({ label: '每组人数', min: 2000, max: 25000, step: 500, value: S.Nv,
        format: (v) => v.toLocaleString('en-US'), onInput: (v) => { S.Nv = v; S.Np = v; draw(); } });
      const bReal = h.button({ label: '回到 2020 年报告的数字', onClick: () => { S.cv = 8; S.cp = 162; S.Nv = 18198; S.Np = 18325; sCv.set(8); sCp.set(162); sN.set(18198); draw(); } });
      controls.append(cView.el, cU.el, tC.el, tA.el, tL.el, sCv.el, sCp.el, sN.el, h.el('div', { class: 'ctl' }, [bReal]));

      const R = {
        a: h.readout('TNF-α（先天免疫）'), b: h.readout('荧光素酶（蛋白表达）'), c: h.readout('PKR 激活 → 翻译关停'),
        d: h.readout('VE = 1 − 发病率之比'), e: h.readout('95% 可信区间'), f: h.readout('总病例数 / 区间宽度'),
      };
      Object.values(R).forEach((x) => readout.append(x.el));

      function sync() {
        const bench = S.view === 'bench';
        [cU, tC, tA, tL].forEach((x) => (x.el.style.display = bench ? '' : 'none'));
        [sCv, sCp, sN].forEach((x) => (x.el.style.display = bench ? 'none' : ''));
        bReal.parentElement.style.display = bench ? 'none' : '';
        [R.a, R.b, R.c].forEach((x) => (x.el.style.display = bench ? '' : 'none'));
        [R.d, R.e, R.f].forEach((x) => (x.el.style.display = bench ? 'none' : ''));
      }

      /* ---------- A. 修饰与表达 ---------- */
      function drawBench() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const order = ['U', 'm5u', 's2u', 'psi', 'm1psi'];
        const A = h.axes(g, W, Hh, { x0: 0, x1: 5, y0: 1e4, y1: 3e6, logY: true, pad: { l: 56, r: 52, t: 16, b: 40 },
          xTicks: [], yTicks: [1e4, 1e5, 1e6], fmtY: (v) => '10' + sup(Math.round(Math.log10(v))),
          xLabel: '', yLabel: '荧光素酶 (RLU)' }, C);
        const bw = A.iw / 5;
        const Y2 = (t) => A.p.t + A.ih - (Math.min(t, 1400) / 1400) * A.ih;   // TNF 的右轴
        // 表达柱 + TNF 折线
        order.forEach((u, i) => {
          const a = assay(u, S.c5, S.a6, S.lnp), x = A.p.l + bw * (i + 0.5), on = u === S.u;
          const y = A.Y(Math.max(1.1e4, a.luc));
          g.fillStyle = C('--good'); g.globalAlpha = on ? 1 : 0.4;
          g.fillRect(x - bw * 0.3, y, bw * 0.6, A.p.t + A.ih - y); g.globalAlpha = 1;
          if (on) { g.fillStyle = C('--fg'); g.font = '10.5px ' + C('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(sci(a.luc), x, y - 3); }
          g.fillStyle = on ? C('--accent') : C('--muted'); g.font = (on ? '600 ' : '') + '11.5px ' + C('--body-font');
          g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(UMODS[u].zh, x, A.p.t + A.ih + 7);
        });
        g.strokeStyle = C('--warn'); g.lineWidth = 2; g.beginPath();
        order.forEach((u, i) => { const a = assay(u, S.c5, S.a6, S.lnp), x = A.p.l + bw * (i + 0.5); i ? g.lineTo(x, Y2(a.tnf)) : g.moveTo(x, Y2(a.tnf)); });
        g.stroke();
        g.fillStyle = C('--warn');
        order.forEach((u, i) => { const a = assay(u, S.c5, S.a6, S.lnp), x = A.p.l + bw * (i + 0.5); g.beginPath(); g.arc(x, Y2(a.tnf), u === S.u ? 5 : 3.2, 0, 7); g.fill(); });
        g.font = '10px ' + C('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
        [0, 350, 700, 1050, 1400].forEach((v) => g.fillText(v, A.p.l + A.iw + 5, Y2(v)));
        g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillStyle = C('--warn'); g.fillText('TNF-α (pg/mL) →', A.p.l + A.iw - 2, A.p.t + 2);
        g.fillStyle = C('--good'); g.textAlign = 'left'; g.fillText('柱 = 表达', A.p.l + 3, A.p.t + 2);
        if (!S.lnp) { g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '12px ' + C('--body-font'); g.fillText('裸 RNA：递送效率仅约 14%', A.p.l + A.iw / 2, A.p.t + 16); }
        const a = assay(S.u, S.c5, S.a6, S.lnp);
        R.a.set(`${a.tnf.toFixed(0)} pg/mL`);
        R.b.set(`${sci(a.luc)} RLU`);
        R.c.set(`${(100 * a.pkrOn).toFixed(0)}% → 翻译被关停 ${(92 * a.pkrOn).toFixed(0)}%`);
      }

      /* ---------- B. 试验计算器 ---------- */
      function drawTrial() {
        const g = cv.g, W = cv.w, Hh = cv.h;
        const A = h.axes(g, W, Hh, { x0: 0, x1: 320, y0: -0.25, y1: 1.03, pad: { l: 52, r: 14, t: 16, b: 38 },
          xTicks: [0, 80, 160, 240, 320], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtY: (v) => (100 * v).toFixed(0) + '%',
          xLabel: '总病例数 C（同样的病例分配比例）', yLabel: 'VE' }, C);
        const C_ = S.cv + S.cp, frac = C_ > 0 ? S.cv / C_ : 0;
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const band = [];
        for (let Cc = 4; Cc <= 320; Cc += 3) {
          const cvv = Math.round(frac * Cc), [l, hg] = veCI(cvv, Cc - cvv, S.Nv, S.Np);
          band.push([Cc, l, hg]);
        }
        g.fillStyle = C('--s1'); g.globalAlpha = 0.2; g.beginPath();
        band.forEach(([x, l], i) => (i ? g.lineTo(A.X(x), A.Y(l)) : g.moveTo(A.X(x), A.Y(l))));
        for (let i = band.length - 1; i >= 0; i--) g.lineTo(A.X(band[i][0]), A.Y(band[i][2]));
        g.closePath(); g.fill(); g.globalAlpha = 1;
        g.strokeStyle = C('--s1'); g.lineWidth = 1.4;
        [1, 2].forEach((j) => { g.beginPath(); band.forEach(([x, l, hg], i) => { const y = A.Y(j === 1 ? l : hg); i ? g.lineTo(A.X(x), y) : g.moveTo(A.X(x), y); }); g.stroke(); });
        // 监管常用的 50% 下限参考线
        g.strokeStyle = C('--warn'); g.setLineDash([5, 4]); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(A.p.l, A.Y(0.5)); g.lineTo(A.p.l + A.iw, A.Y(0.5)); g.stroke(); g.setLineDash([]);
        const ve = veOf(S.cv, S.cp, S.Nv, S.Np), [lo, hi] = veCI(S.cv, S.cp, S.Nv, S.Np);
        g.strokeStyle = C('--accent'); g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(A.X(C_), A.Y(lo)); g.lineTo(A.X(C_), A.Y(hi)); g.stroke();
        g.fillStyle = C('--accent'); g.beginPath(); g.arc(A.X(C_), A.Y(ve), 5, 0, 7); g.fill();
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.fillStyle = C('--warn'); g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillText('50%（监管常用的下限门槛）', A.p.l + 4, A.Y(0.5) - 3);
        g.fillStyle = C('--muted'); g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillText('宽度 ∝ C^(−1/2)', A.p.l + A.iw - 4, A.p.t + 3);
        R.d.set(`${pct(ve)}　(r_v = ${sci(S.cv / S.Nv)}, r_p = ${sci(S.cp / S.Np)})`);
        R.e.set(`[${pct(lo)}, ${pct(hi)}]`);
        R.f.set(`C = ${C_}　宽度 ${(100 * (hi - lo)).toFixed(1)} 个百分点`);
      }

      function draw() {
        const g = cv.g;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, cv.w, cv.h);
        if (S.view === 'bench') drawBench(); else drawTrial();
      }
      sync(); draw();
      cv.onResize(draw);
      const mo = new MutationObserver(draw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener && mq.addEventListener('change', draw);
      return { destroy() { cv.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', draw); } };
    },
  };
})();
