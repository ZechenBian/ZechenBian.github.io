/* 沃丁顿地形与重编程的随机性 — Gurdon & Yamanaka, Nobel Medicine 2012（答案演示）
 *
 * 左：多能网络的最简双稳模型（Oct3/4 = u, Sox2 = v 互相激活，各自被分化态压住）：
 *     u̇ = a·vⁿ/(1+vⁿ) + b_u − u,   v̇ = a·uⁿ/(1+uⁿ) + b_v − v
 *   b_u, b_v 是外源表达量（逆转录病毒导入的四因子）。b = 0 时有"双低"（分化）与"双高"（多能）
 *   两个稳定态，中间一个鞍点；b 超过阈值后双低态经鞍–结分岔消失，系统只能流向双高态。
 *   单独抬高 b_u（单因子）在对称破缺后仍可能保留低态 —— 这就是"单因子无克隆、组合才行"。
 *   画的是沿对称线 u = v = w 的有效势 Φ(w) = −∫f，f(w) = a wⁿ/(1+wⁿ) + b̄ − w（示意，只在对称方向上严格）。
 *
 * 右：重编程的随机模型。每个细胞每次分裂以概率 ε 成功；到时刻 t 每个起始细胞累计分裂
 *     D₁(t) = 2^((t−t₀)/T_d) − 1,  t₀ = 3 d, T_d = 7 d。
 *   群体效率 C(t)/N₀ = 1 − exp(−ε D₁)，单细胞克隆阳性比例（精英模型，精英比例 p）
 *     = p·(1 − exp(−(ε/p) D₁))，p = 1 即随机模型。
 *   阳性比例达 95% 的时间 t* = t₀ + T_d·log₂(3/ε)；ε = 5e−5、T_d = 7 d ⇒ t* ≈ 114 d ≈ 16 周
 *   （Hanna 等 2009 实际做到 18 周）。
 */
(() => {
  const T0 = 3, TD = 7;
  const D1 = (t) => Math.max(0, Math.pow(2, (t - T0) / TD) - 1);
  const popEff = (t, eps) => 1 - Math.exp(-eps * D1(t));
  const scPos = (t, eps, p) => p * (1 - Math.exp(-(eps / p) * D1(t)));
  const tStar = (eps) => T0 + TD * Math.log2(3 / eps);

  /* 双稳网络 */
  const hill = (x, a, n) => (a * Math.pow(x, n)) / (1 + Math.pow(x, n));
  const fsym = (w, a, n, b) => hill(w, a, n) + b - w;              // 沿对称线的速度场
  /* 对称线上的不动点：f(w) = 0 的全部根（扫描 + 二分） */
  function roots(a, n, b, wmax) {
    const out = []; const N = 600;
    let prev = fsym(0, a, n, b), pw = 0;
    for (let i = 1; i <= N; i++) {
      const w = (wmax * i) / N, cur = fsym(w, a, n, b);
      if (prev === 0) out.push(pw);
      else if (prev * cur < 0) { let lo = pw, hi = w; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; (fsym(lo, a, n, b) * fsym(m, a, n, b) <= 0) ? (hi = m) : (lo = m); } out.push((lo + hi) / 2); }
      prev = cur; pw = w;
    }
    return out;
  }
  /* 有效势 Φ(w) = −∫₀^w f  （梯形积分） */
  function potential(a, n, b, wmax, N = 400) {
    const ws = [], ph = []; let s = 0, prev = fsym(0, a, n, b);
    for (let i = 0; i <= N; i++) {
      const w = (wmax * i) / N, cur = fsym(w, a, n, b);
      if (i) s += (-(prev + cur) / 2) * (wmax / N);
      ws.push(w); ph.push(s); prev = cur;
    }
    return { ws, ph };
  }
  /* 二维积分，用于小球轨迹 */
  function step2(u, v, a, n, bu, bv, dt) {
    const du = hill(v, a, n) + bu - u, dv = hill(u, a, n) + bv - v;
    return [Math.max(0, u + dt * du), Math.max(0, v + dt * dv)];
  }

  LABS.ips = {
    title: '沃丁顿地形与重编程的随机性',
    _math: { D1, popEff, scPos, tStar, fsym, roots, potential },
    mount(root, ctx) {
      const h = ctx.h, C = (n) => ctx.color(n);
      const S = { a: 2.0, n: 4, bu: 0, bv: 0, u: 0.05, v: 0.05, traj: [[0.05, 0.05]], run: false,
        logE: Math.log10(5e-5), p: 0.05, showElite: true };

      const stage = h.el('div', { class: 'lab-stage' });
      const controls = h.el('div', { class: 'lab-controls' });
      const readout = h.el('div', { class: 'lab-readout' });
      const hint = h.el('p', { class: 'lab-hint', html: '上图：小球停在"双低"谷（分化态）。单独把 Oct3/4 拉大，谷会变浅但常常还在；<b>两个一起拉</b>越过阈值后谷消失（鞍–结分岔），小球只能滑向"双高"谷（多能态）。撤掉外源表达，小球留在新谷里——状态被记住了。下图：同一个 $\\varepsilon$ 同时给出群体效率与单细胞阳性比例；把精英比例 $p$ 拉到 5%，看两条曲线在什么时候才分开。' });
      root.append(stage, controls, readout, hint);
      const cvP = h.canvas(stage, { aspect: 0.46, minH: 170, maxH: 240 });   // 势能
      const cvU = h.canvas(stage, { aspect: 0.46, minH: 170, maxH: 240 });   // 相平面
      const cvS = h.canvas(stage, { aspect: 0.46, minH: 170, maxH: 240 });   // 随机模型

      const sBu = h.slider({ label: '外源 Oct3/4（b_u）', min: 0, max: 0.6, step: 0.01, value: 0, format: (v) => v.toFixed(2), onInput: (v) => { S.bu = v; wake(); } });
      const sBv = h.slider({ label: '外源 Sox2（b_v）', min: 0, max: 0.6, step: 0.01, value: 0, format: (v) => v.toFixed(2), onInput: (v) => { S.bv = v; wake(); } });
      const sA = h.slider({ label: '网络自激活强度 a', min: 1.7, max: 3.2, step: 0.05, value: S.a, format: (v) => v.toFixed(2), onInput: (v) => { S.a = v; wake(); } });
      const sN = h.slider({ label: '协同性 n', min: 2, max: 5, step: 0.1, value: S.n, format: (v) => v.toFixed(1), onInput: (v) => { S.n = v; wake(); } });
      const bReset = h.button({ label: '放回分化态', onClick: () => { S.u = 0.05; S.v = 0.05; S.traj = [[S.u, S.v]]; wake(); } });
      const bOff = h.button({ label: '撤掉外源表达', onClick: () => { S.bu = 0; S.bv = 0; sBu.set(0); sBv.set(0); wake(); } });
      const sE = h.slider({ label: 'lg ε', min: -6, max: -3, step: 0.02, value: S.logE, format: (v) => Math.pow(10, v).toExponential(1), onInput: (v) => { S.logE = v; redraw(); } });
      const sP = h.slider({ label: '精英比例 p', min: 0.01, max: 1, step: 0.01, value: S.p, format: (v) => (100 * v).toFixed(0) + '%', onInput: (v) => { S.p = v; redraw(); } });
      const tEl = h.toggle({ label: '叠加精英模型', value: true, onChange: (b) => { S.showElite = b; redraw(); } });
      controls.append(sBu.el, sBv.el, sA.el, sN.el, h.el('div', { class: 'ctl' }, [h.el('div', {}, [bReset, bOff])]), sE.el, sP.el, tEl.el);

      const Ro = {
        st: h.readout('细胞状态 (Oct3/4, Sox2)'), fix: h.readout('对称线上的不动点'),
        bar: h.readout('分化谷是否还在'), e: h.readout('ε'), eff: h.readout('群体效率：第 14 / 28 天'),
        ts: h.readout('阳性比例达 95% 的时间'),
      };
      Object.values(Ro).forEach((r) => readout.append(r.el));

      const WMAX = () => Math.max(2.4, S.a * 1.25 + Math.max(S.bu, S.bv));

      /* ---- 势能曲线（沿对称线，用两个外源量的平均） ---- */
      function drawPot() {
        const g = cvP.g, W = cvP.w, Hh = cvP.h, wm = WMAX(), bbar = (S.bu + S.bv) / 2;
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const { ws, ph } = potential(S.a, S.n, bbar, wm);
        const lo = Math.min(...ph), hi = Math.max(...ph), pad = 0.12 * (hi - lo + 1e-9);
        const A = h.axes(g, W, Hh, { x0: 0, x1: wm, y0: lo - pad, y1: hi + pad, pad: { l: 44, r: 12, t: 14, b: 32 },
          xTicks: [0, 1, 2, 3, 4, 5].filter((v) => v <= wm), yTicks: [], xLabel: '细胞状态 w（沿 Oct3/4 = Sox2 方向）', yLabel: '有效势 Φ' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        g.strokeStyle = C('--fg'); g.lineWidth = 2; g.beginPath();
        ws.forEach((w, i) => { const x = A.X(w), y = A.Y(ph[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
        // 不动点
        const rs = roots(S.a, S.n, bbar, wm);
        rs.forEach((w, i) => {
          const eps = 1e-3, slope = (fsym(w + eps, S.a, S.n, bbar) - fsym(w - eps, S.a, S.n, bbar)) / (2 * eps);
          const stable = slope < 0, idx = Math.round((w / wm) * (ph.length - 1));
          g.fillStyle = C(stable ? '--good' : '--warn');
          g.beginPath(); g.arc(A.X(w), A.Y(ph[Math.max(0, Math.min(ph.length - 1, idx))]), stable ? 5 : 3.5, 0, 7); stable ? g.fill() : (g.lineWidth = 2, g.strokeStyle = C('--warn'), g.stroke());
        });
        // 小球（用 (u+v)/2 投影）
        const wb = (S.u + S.v) / 2, ib = Math.max(0, Math.min(ph.length - 1, Math.round((wb / wm) * (ph.length - 1))));
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(A.X(wb), A.Y(ph[ib]), 6, 0, 7); g.fill(); g.stroke();
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.fillStyle = C('--muted'); g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('● 稳定态　○ 鞍点（势垒）', A.p.l + 4, A.p.t + 3);
        g.textAlign = 'right'; g.fillText(rs.length >= 3 ? '两个谷' : '只剩一个谷', A.p.l + A.iw - 4, A.p.t + 3);
      }

      /* ---- 相平面 + 轨迹 ---- */
      function drawPhase() {
        const g = cvU.g, W = cvU.w, Hh = cvU.h, M = WMAX();
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const tk = (m) => { const st = m <= 2.5 ? 0.5 : 1; const o = []; for (let v = 0; v <= m + 1e-9; v += st) o.push(+v.toFixed(1)); return o; };
        const A = h.axes(g, W, Hh, { x0: 0, x1: M, y0: 0, y1: M, pad: { l: 44, r: 12, t: 12, b: 32 }, xTicks: tk(M), yTicks: tk(M),
          fmtX: (v) => String(v), fmtY: (v) => String(v), xLabel: 'Oct3/4  u', yLabel: 'Sox2  v' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const ln = (xs, ys, c, w, dash) => { g.strokeStyle = c; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); xs.forEach((x, i) => { const px = A.X(x), py = A.Y(ys[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); g.setLineDash([]); };
        // 零斜线：u̇ = 0 → u = hill(v)+bu ; v̇ = 0 → v = hill(u)+bv
        const N = 140, xs1 = [], ys1 = [], xs2 = [], ys2 = [];
        for (let i = 0; i <= N; i++) { const v = (M * i) / N; xs1.push(hill(v, S.a, S.n) + S.bu); ys1.push(v); const u = (M * i) / N; xs2.push(u); ys2.push(hill(u, S.a, S.n) + S.bv); }
        ln(xs1, ys1, C('--s1'), 1.6, [5, 4]);
        ln(xs2, ys2, C('--s2'), 1.6, [2, 3]);
        if (S.traj.length > 1) ln(S.traj.map((p) => p[0]), S.traj.map((p) => p[1]), C('--accent'), 2);
        g.fillStyle = C('--accent'); g.strokeStyle = C('--panel'); g.lineWidth = 2;
        g.beginPath(); g.arc(A.X(S.u), A.Y(S.v), 5.5, 0, 7); g.fill(); g.stroke();
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillStyle = C('--muted'); g.fillText('分化', A.p.l + 5, A.p.t + A.ih - 4);
        g.textBaseline = 'top'; g.textAlign = 'right'; g.fillStyle = C('--good'); g.fillText('多能', A.p.l + A.iw - 5, A.p.t + 3);
      }

      /* ---- 随机模型 ---- */
      function drawStoch() {
        const g = cvS.g, W = cvS.w, Hh = cvS.h, eps = Math.pow(10, S.logE);
        g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
        const A = h.axes(g, W, Hh, { x0: 0, x1: 160, y0: 0, y1: 105, pad: { l: 46, r: 12, t: 12, b: 32 },
          xTicks: [0, 30, 60, 90, 120, 150], yTicks: [0, 25, 50, 75, 100], fmtY: (v) => v + '%',
          xLabel: '培养时间 (d)', yLabel: '阳性克隆群体比例' }, C);
        g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
        const ts = []; for (let i = 0; i <= 160; i++) ts.push(i);
        const ln = (ys, c, w, dash) => { g.strokeStyle = c; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); ts.forEach((t, i) => { const x = A.X(t), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); };
        // 常规实验只看前 4 周：两个模型在这一段完全重合，分不开
        g.fillStyle = C('--s3'); g.globalAlpha = 0.16; g.fillRect(A.X(0), A.p.t, A.X(28) - A.X(0), A.ih); g.globalAlpha = 1;
        ln(ts.map((t) => 100 * scPos(t, eps, 1)), C('--s1'), 2.2);
        if (S.showElite) ln(ts.map((t) => 100 * scPos(t, eps, S.p)), C('--warn'), 2, [5, 4]);
        const t95 = tStar(eps);
        if (t95 < 160) {
          g.strokeStyle = C('--good'); g.lineWidth = 1.3; g.setLineDash([4, 3]);
          g.beginPath(); g.moveTo(A.X(t95), A.p.t); g.lineTo(A.X(t95), A.p.t + A.ih); g.stroke(); g.setLineDash([]);
        }
        g.restore();
        g.font = '10.5px ' + C('--mono-font'); g.textBaseline = 'top';
        g.fillStyle = C('--s1'); g.textAlign = 'left'; g.fillText('随机模型（单细胞）', A.p.l + 4, A.p.t + 3);
        if (S.showElite) { g.fillStyle = C('--warn'); g.fillText(`精英模型 p = ${(100 * S.p).toFixed(0)}%`, A.p.l + 4, A.p.t + 17); }
        g.fillStyle = C('--s3'); g.textBaseline = 'bottom'; g.fillText('常规实验只看到这一段', A.p.l + 4, A.p.t + A.ih - 4); g.textBaseline = 'top';
        if (t95 < 160) { g.fillStyle = C('--good'); g.textAlign = 'right'; g.fillText(`t* = ${t95.toFixed(0)} d`, A.X(t95) - 3, A.p.t + 3); }
      }

      function readouts() {
        const eps = Math.pow(10, S.logE), bbar = (S.bu + S.bv) / 2, rs = roots(S.a, S.n, bbar, WMAX());
        Ro.st.set(`(${S.u.toFixed(2)}, ${S.v.toFixed(2)})` + (S.u > 1 && S.v > 1 ? '　多能' : S.u < 0.6 && S.v < 0.6 ? '　分化' : ''));
        Ro.fix.set(rs.map((w) => w.toFixed(2)).join('、') || '—');
        Ro.bar.set(rs.length >= 3 ? `在（势垒高 ${(() => { const { ws, ph } = potential(S.a, S.n, bbar, WMAX()); const i1 = Math.round((rs[1] / WMAX()) * (ph.length - 1)), i0 = Math.round((rs[0] / WMAX()) * (ph.length - 1)); return (ph[i1] - ph[i0]).toFixed(2); })()}）` : '已消失（鞍–结分岔）');
        Ro.e.set(eps.toExponential(2));
        Ro.eff.set(`${(100 * popEff(14, eps)).toFixed(3)}% / ${(100 * popEff(28, eps)).toFixed(3)}%`);
        Ro.ts.set(`${tStar(eps).toFixed(0)} d ≈ ${(tStar(eps) / 7).toFixed(0)} 周`);
      }
      function redraw() { drawPot(); drawPhase(); drawStoch(); readouts(); }

      let idle = 0;
      const lp = h.loop((dt) => {
        let moved = false;
        for (let k = 0; k < 6; k++) {
          const [nu, nv] = step2(S.u, S.v, S.a, S.n, S.bu, S.bv, 0.03);
          if (Math.abs(nu - S.u) > 1e-5 || Math.abs(nv - S.v) > 1e-5) moved = true;
          S.u = nu; S.v = nv;
        }
        if (moved) {
          const last = S.traj[S.traj.length - 1];
          if (Math.hypot(last[0] - S.u, last[1] - S.v) > 0.01) S.traj.push([S.u, S.v]);
          if (S.traj.length > 1200) S.traj.splice(0, 400);
          redraw(); idle = 0;
        } else { idle += dt; if (idle > 0.5) lp.stop(); }
      });
      function wake() { idle = 0; redraw(); if (!lp.running) lp.start(); }

      cvP.onResize(drawPot); cvU.onResize(drawPhase); cvS.onResize(drawStoch);
      const mo = new MutationObserver(redraw);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onMq = () => redraw();
      mq.addEventListener && mq.addEventListener('change', onMq);
      // 打开时：停在分化谷，两个谷都在，随机模型已画好
      redraw();
      if (!ctx.reduced) lp.start();
      return { destroy() { lp.stop(); cvP.destroy(); cvU.destroy(); cvS.destroy(); mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', onMq); } };
    },
  };
})();
