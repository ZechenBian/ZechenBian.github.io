/* 期权值多少钱 — challenge for the 1997 Prize in Economic Sciences
 * (Robert C. Merton & Myron S. Scholes, "for a new method to determine the value of derivatives"; Fischer Black d. 1995)
 * Stage 1 一期二叉（示意）：S0 = 100 → 120 / 80，债券 1 → 1.05，K = 100。
 *   复制：Δ = (20 − 0)/(120 − 80) = 0.5，B = −0.5·80/1.05 = −38.095 ⇒ C0 = 11.905；q = (1.05 − 0.8)/(1.2 − 0.8) = 0.625。
 * Stage 2 CRR 树：u = e^{σ√Δt}，d = 1/u，q = (e^{rΔt} − d)/(u − d)。S0 = K = 100，T = 1，r = 5%，σ = 20% ⇒ C(n) → 10.4506。
 *   q 之下 ln(S_T/S0) 的均值 nσ√Δt(2q − 1) → (r − σ²/2)T，标准差 → σ√T。
 * Stage 3 离散 Δ 对冲：卖出一张平值看涨（10.4506），几何布朗运动（漂移 μ）上 1000 个细步，均匀调仓 N 次；
 *   终值盈亏的标准差 ≈ c/√N（此处 c ≈ 6.6），平均 ≈ 0，与 μ 无关；不对冲时标准差 ≈ 18.8。
 * Stage 4 隐含波动率（示意报价）：半年期，S0 = 100，r = 5%，价格由 σ(k) = 0.18 − 0.40k + 0.5k²（k = ln K/100）生成并取到分：
 *   K = 80…120 → 23.02, 14.00, 6.34, 1.59, 0.14 ⇒ σ_imp ≈ 29.4%, 22.8%, 18.0%, 14.7%, 12.4%（向下偏斜）。
 * N(x)：Numerical Recipes 的 erfc 近似（相对误差 < 1.2e-7）。
 */
(() => {
  const R = String.raw;

  /* ---------- numerics ---------- */
  const NC = (x) => {
    const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.5 * z);
    const e = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? 1 - e / 2 : e / 2;
  };
  const npdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const d1f = (S, K, T, r, s) => (Math.log(S / K) + (r + 0.5 * s * s) * T) / (s * Math.sqrt(T));
  function bs(S, K, T, r, s) {
    if (T <= 1e-12) return Math.max(S - K, 0);
    const d1 = d1f(S, K, T, r, s);
    return S * NC(d1) - K * Math.exp(-r * T) * NC(d1 - s * Math.sqrt(T));
  }
  const bsDelta = (S, K, T, r, s) => (T <= 1e-12 ? (S > K ? 1 : 0) : NC(d1f(S, K, T, r, s)));
  const bsVega = (S, K, T, r, s) => S * Math.sqrt(T) * npdf(d1f(S, K, T, r, s));
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  function normals(seed) { // Box–Muller with a cached partner
    const rnd = mul32(seed); let spare = null;
    return () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = rnd(); while (u <= 1e-12) u = rnd();
      const m = Math.sqrt(-2 * Math.log(u)), w = 2 * Math.PI * rnd();
      spare = m * Math.sin(w); return m * Math.cos(w);
    };
  }

  /* Cox–Ross–Rubinstein: n-step call price and the q-moments of ln(S_T/S0) */
  function crr(n, S0, K, T, r, s) {
    const dt = T / n, a = s * Math.sqrt(dt), u = Math.exp(a), d = 1 / u, q = (Math.exp(r * dt) - d) / (u - d);
    const lr = Math.log(q / (1 - q)), lK = Math.log(K / S0);
    let lp = n * Math.log(1 - q), sum = 0;
    for (let j = 0; j <= n; j++) {
      const x = (2 * j - n) * a;
      if (x > lK) sum += Math.exp(lp) * (S0 * Math.exp(x) - K);
      if (j < n) lp += Math.log((n - j) / (j + 1)) + lr;
    }
    return { price: Math.exp(-r * T) * sum, u, d, q, a, mean: n * a * (2 * q - 1), sd: 2 * a * Math.sqrt(n * q * (1 - q)) };
  }
  function tree(n, S0, K, T, r, s) { // node prices and backward-induced values (small n only)
    const { u, d, q } = crr(n, S0, K, T, r, s), disc = Math.exp((-r * T) / n), Sx = [], V = [];
    for (let i = 0; i <= n; i++) { Sx.push([]); for (let j = 0; j <= i; j++) Sx[i].push(S0 * u ** j * d ** (i - j)); }
    V[n] = Sx[n].map((x) => Math.max(x - K, 0));
    for (let i = n - 1; i >= 0; i--) { V[i] = []; for (let j = 0; j <= i; j++) V[i].push(disc * (q * V[i + 1][j + 1] + (1 - q) * V[i + 1][j])); }
    return { Sx, V };
  }

  /* Discrete delta hedge of a sold call. Fine grid M = 1000 steps per year; rebalance at N evenly spaced dates (N | M).
   * N = 0: no hedge, the premium sits in the bank. Same seed for every N at a given μ (common random numbers). */
  const HS0 = 100, HK = 100, HT = 1, HR = 0.05, HSIG = 0.2, HM = 1000, PATHS = 300;
  const C0H = bs(HS0, HK, HT, HR, HSIG);
  function hedgeRun(N, mu, keepPath) {
    const g = normals(19970 + Math.round(mu * 1000)), dt = HT / HM, a = (mu - 0.5 * HSIG * HSIG) * dt, b = HSIG * Math.sqrt(dt), gr = Math.exp(HR * dt);
    const every = N ? HM / N : 0, pnl = new Float64Array(PATHS);
    let sample = null;
    for (let p = 0; p < PATHS; p++) {
      let S = HS0, D = N ? bsDelta(S, HK, HT, HR, HSIG) : 0, cash = C0H - D * S;
      const rec = keepPath && p === 0 ? { t: [0], S: [S], V: [C0H], P: [C0H] } : null;
      for (let i = 1; i <= HM; i++) {
        S *= Math.exp(a + b * g()); cash *= gr;
        if (N && i % every === 0 && i < HM) { const Dn = bsDelta(S, HK, HT - i * dt, HR, HSIG); cash -= (Dn - D) * S; D = Dn; }
        if (rec && (i % 4 === 0 || i === HM)) { rec.t.push(i * dt); rec.S.push(S); rec.V.push(bs(S, HK, HT - i * dt, HR, HSIG)); rec.P.push(D * S + cash); }
      }
      pnl[p] = D * S + cash - Math.max(S - HK, 0);
      if (rec) sample = rec;
    }
    let m = 0; for (const v of pnl) m += v; m /= PATHS;
    let v2 = 0; for (const v of pnl) v2 += (v - m) ** 2;
    return { mean: m, sd: Math.sqrt(v2 / (PATHS - 1)), sample };
  }

  /* Stage 4 quotes (示意): 6-month calls, S0 = 100, r = 5% */
  const IVK = [80, 90, 100, 110, 120], IVP = [23.02, 14.0, 6.34, 1.59, 0.14], IVT = 0.5, IVR = 0.05;
  function ivOf(P, K) { let a = 0.005, b = 2; for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (bs(100, K, IVT, IVR, m) > P) b = m; else a = m; } return (a + b) / 2; }

  /* ---------- page helpers ---------- */
  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-options')) return;
    const s = document.createElement('style'); s.id = 'st-options';
    s.textContent = `
.options-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;align-items:start}
.options-row>*{min-width:0}
.options-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.options-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.options-sec[hidden]{display:none}
.options-sec h4{margin:0;font-size:14px}
.options-btns{display:flex;flex-wrap:wrap;gap:2px}
.options-tab{max-height:270px;overflow:auto}
.options-rd{background:var(--panel)}
.options-rd .ro{box-shadow:0 0 0 1px var(--line)}
.options-ch .stage[hidden]{display:none}`;
    document.head.append(s);
  }
  const fmt = (v, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : v.toFixed(d));
  const sgn = (v, d = 2) => (v >= 0 ? '+' : '−') + fmt(Math.abs(v), d);
  function poly(g, A, xs, ys, color, w = 2, dash = null) {
    g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
    g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath(); let first = true;
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); if (!isFinite(y)) { first = true; continue; } first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; }
    g.stroke(); g.restore();
  }
  function legend(g, col, items, x, y, xMax) {
    g.font = '11px ' + col('--body-font'); g.textBaseline = 'middle'; g.textAlign = 'left';
    const x0 = x;
    for (const [lab, c, dash] of items) {
      if (x + 20 + g.measureText(lab).width > xMax) { x = x0; y += 15; }
      g.strokeStyle = c; g.lineWidth = 2; g.setLineDash(dash ? [4, 3] : []);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = col('--muted'); g.fillText(lab, x + 18, y); x += 30 + g.measureText(lab).width;
    }
  }

  CHALLENGES.options = {
    title: '期权值多少钱',
    _m: { bs, bsDelta, bsVega, crr, tree, hedgeRun, ivOf, IVK, IVP, C0H },
    mount(root, ctx) {
      injectStyle();
      root.classList.add('options-ch'); // show one stage at a time (the shared .stage{display:grid} overrides [hidden])
      const h = ctx.h, col = ctx.color, el = h.el;

      /* ================= 第一关：只有两种明天 ================= */
      const stage1 = {
        title: '只有两种明天',
        task: R`<p>马萨诸塞州剑桥，1970 年前后。股票期权只在纽约的场外市场少量交易，价格由经纪商撮合议定，没有人知道“合理”的价格是多少。先把世界简化到极致（<b>示意</b>）：某股票今天 100 元，一期之后只可能变成 <b>120</b> 元或 <b>80</b> 元。现金可以按一期 5% 的无风险利率存入或借出：1 元债券一期后值 1.05 元。</p>
<p>一张<b>看涨期权</b>给持有人一项权利：一期后可以按 $K = 100$ 元买入一股。所以它一期后值 $(S_1 - 100)^+$，上涨时 20 元，下跌时 0 元。它今天值多少钱？</p>
<p>你是卖出这张期权的交易员，不想承担任何风险。手头只有股票和债券两样东西。<b>用滑块搭一个组合（Δ 股股票加 B 元债券），让它一期后在两种结局下都与期权的支付分毫不差。</b>然后回答：期权今天该卖多少钱？</p>`,
        hints: [
          R`组合一期后的价值：上涨时 $120\Delta + 1.05B$，下跌时 $80\Delta + 1.05B$。让它们分别等于 20 和 0，是两个未知数的两个方程。`,
          R`两式相减消去 $B$：$40\Delta = 20$。再由下跌那个式子解出 $B$（会是负的，表示借钱）。期权的价格就是这个组合今天的成本 $100\Delta + B$。`,
          R`$\Delta = 0.5$，$B = -40/1.05 = -38.10$，成本 $C_0 = 11.90$。最后一问：$q\cdot 20/1.05 = 11.90$ 解出 $q$。`,
        ],
        answer: R`$\Delta = \frac{20-0}{120-80} = 0.5$ 股，$B = -\frac{0.5\times 80}{1.05} = -38.10$ 元（借入）。这个组合在两种结局下都与期权的支付相同，所以期权今天只能值它的成本：$C_0 = 0.5\times 100 - 38.10 = 11.90$ 元。市价若高于 11.90，就卖期权、买组合，无风险地赚差价；低于则反过来。真实的上涨概率 $p$ 在推导中从未出现。把结果写成 $C_0 = \frac{1}{1.05}[\,q\cdot 20 + (1-q)\cdot 0\,]$，得 $q = 0.625 = \frac{1.05-0.8}{1.2-0.8}$。在这个"概率"下股票的期望收益恰好是无风险利率：$0.625\times 120 + 0.375\times 80 = 105$。`,
        build(body, api) {
          const S = { D: 0, B: 0, p: 0.5, rep: false, okC: false, okQ: false };
          const R1 = 1.05, SU = 120, SDn = 80, CU = 20, CD = 0, TOL = 0.06;
          const stg = el('div', { class: 'lab-stage' }); body.append(stg);
          const cv = h.canvas(stg, { aspect: 0.5, minH: 230, maxH: 300 });
          cv.canvas.setAttribute('aria-label', '一期二叉树：股价、期权支付与你的组合在两种结局下的价值');
          const ctr = el('div', { class: 'lab-controls' });
          const sD = h.slider({ label: '股票 Δ（股）', min: -1, max: 1.5, step: 0.01, value: 0, format: (v) => v.toFixed(2), onInput: (v) => { S.D = v; upd(); } });
          const sB = h.slider({ label: '债券 B（元，负数 = 借入）', min: -100, max: 100, step: 0.05, value: 0, format: (v) => v.toFixed(2), onInput: (v) => { S.B = v; upd(); } });
          const nudge = (k, d) => h.button({ label: (d > 0 ? '+' : '−') + Math.abs(d), onClick: () => { if (k === 'D') { S.D = Math.max(-1, Math.min(1.5, +(S.D + d).toFixed(2))); sD.set(S.D); } else { S.B = Math.max(-100, Math.min(100, +(S.B + d).toFixed(2))); sB.set(S.B); } upd(); } });
          ctr.append(el('div', { class: 'ctl' }, [sD.el, el('div', { class: 'options-btns' }, [nudge('D', -0.1), nudge('D', -0.01), nudge('D', 0.01), nudge('D', 0.1)])]),
            el('div', { class: 'ctl' }, [sB.el, el('div', { class: 'options-btns' }, [nudge('B', -1), nudge('B', -0.05), nudge('B', 0.05), nudge('B', 1)])]));
          body.append(ctr);
          const rd = el('div', { class: 'lab-readout options-rd' });
          const rU = h.readout('上涨时：组合 − 期权'), rDn = h.readout('下跌时：组合 − 期权'), rC = h.readout('组合今天的成本 100Δ + B');
          rd.append(rU.el, rDn.el, rC.el); body.append(rd);

          const secB = el('div', { class: 'options-sec', hidden: true });
          const ansC = h.answer({
            label: '期权今天的价格 $C_0$ = ?（元，容差 ±0.05）', unit: '元', placeholder: '例如 10',
            check: (v) => {
              if (Math.abs(v - 11.905) <= 0.05) return { ok: true, msg: '对：价格就是复制组合的成本。任何别的价格都会留下无风险套利。' };
              if (Math.abs(v - 10 / 1.05) < 0.05) return { ok: false, msg: '9.52 是"按 50% 概率求期望再折现"的结果。可你刚搭好的组合花了多少钱？' };
              if (Math.abs(v - 10) < 0.05) return { ok: false, msg: '10 是 50% 概率下的期望支付，既没折现，也没用上你的组合。' };
              if (Math.abs(v - 50) < 0.1) return { ok: false, msg: '50 只是股票部分 100Δ 的成本，债券部分（借钱）也要算进去。' };
              return { ok: false, msg: '不对。期权的价格 = 与它支付完全相同的组合今天的成本。' };
            },
            onOk: () => { S.okC = true; secC.hidden = false; api.typeset(secC); draw(); },
          });
          secB.append(el('h4', { text: '定价' }), el('p', { class: 'options-note', html: '两种结局下，你的组合与期权的支付完全相同。如果期权的市价与组合的成本不同，会发生什么？' }), ansC.el);

          const secC = el('div', { class: 'options-sec', hidden: true });
          const sP = h.slider({ label: '你相信的上涨概率 p', min: 0.05, max: 0.95, step: 0.01, value: 0.5, format: (v) => v.toFixed(2), onInput: (v) => { S.p = v; upd(); } });
          const rdC = el('div', { class: 'lab-readout options-rd' });
          const rNaive = h.readout('按 p 求期望再折现：20p / 1.05'), rRep = h.readout('复制成本（与 p 无关）');
          rdC.append(rNaive.el, rRep.el);
          const ansQ = h.answer({
            label: '存在唯一的数 $q$，使"按 $q$ 求期望、再按无风险利率折现"恰好等于 $C_0$：$q\cdot 20/1.05 = C_0$。$q$ = ?（容差 ±0.005）', placeholder: '0 到 1 之间',
            check: (v) => {
              if (Math.abs(v - 0.625) <= 0.005) return { ok: true, msg: R`对：$q = 0.625 = (1.05-0.8)/(1.2-0.8)$。在 $q$ 下股票的期望价格 $0.625\times120+0.375\times80 = 105$，恰好按无风险利率增长。` };
              if (Math.abs(v - 62.5) < 0.6) return { ok: false, msg: '请写成 0 到 1 之间的小数。' };
              if (Math.abs(v - 0.5) < 0.01) return { ok: false, msg: '0.5 给出 9.52，不是 11.90。' };
              return { ok: false, msg: '解方程 q·20/1.05 = 11.905。' };
            },
            onOk: () => {
              S.okQ = true;
              api.done(R`<b>无套利定价与风险中性概率。</b>0.5 股股票加借入 38.10 元完全复制了期权，所以它只能值 11.90 元。真实的上涨概率 $p$ 不进入价格：股票价格里已经包含了市场对 $p$ 与风险的全部判断。把 $q = \frac{R-d}{u-d}$ 当作"概率"求期望再按无风险利率折现，得到的是同一个价格。`);
            },
          });
          secC.append(el('h4', { text: '概率去哪了？' }),
            el('p', { class: 'options-note', text: '回头看：从头到尾你没有用到上涨的概率。拖动 p：按 p 求期望再折现的"直觉价格"随 p 大幅变化，复制成本却纹丝不动。' }),
            el('div', { class: 'lab-controls' }, [sP.el]), rdC, ansQ.el);
          body.append(secB, secC);

          const err = () => ({ u: SU * S.D + R1 * S.B - CU, d: SDn * S.D + R1 * S.B - CD, cost: 100 * S.D + S.B });
          function upd() {
            const e = err();
            rU.set(sgn(e.u) + ' 元' + (Math.abs(e.u) < TOL ? '　✓' : ''));
            rDn.set(sgn(e.d) + ' 元' + (Math.abs(e.d) < TOL ? '　✓' : ''));
            rC.set(fmt(e.cost) + ' 元');
            rNaive.set(fmt((20 * S.p) / 1.05) + ' 元');
            rRep.set((100 * 0.5 - 40 / 1.05).toFixed(2) + ' 元');
            if (!S.rep && Math.abs(e.u) < TOL && Math.abs(e.d) < TOL) {
              S.rep = true; secB.hidden = false; api.typeset(secB);
              api.say('两种结局都对上了：这个组合是期权的完美替身。', 'good');
            }
            draw();
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h, mono = col('--mono-font');
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const e = err();
            const x0 = Math.max(54, W * 0.15), x1 = Math.min(W * 0.55, W - 138), ym = Hh * 0.5, yu = Hh * 0.2, yd = Hh * 0.8;
            g.strokeStyle = col('--line'); g.lineWidth = 2;
            [[yu], [yd]].forEach(([y]) => { g.beginPath(); g.moveTo(x0, ym); g.lineTo(x1, y); g.stroke(); });
            g.font = '11px ' + mono; g.textAlign = 'center'; g.textBaseline = 'middle';
            const lab = (t, x, y, c) => { g.fillStyle = c; g.fillText(t, x, y); };
            if (S.okC) {
              lab('p = ' + S.p.toFixed(2), (x0 + x1) / 2, (ym + yu) / 2 - 12, col('--accent'));
              lab('1 − p', (x0 + x1) / 2, (ym + yd) / 2 + 12, col('--accent'));
            } else { lab('×1.2', (x0 + x1) / 2, (ym + yu) / 2 - 12, col('--muted')); lab('×0.8', (x0 + x1) / 2, (ym + yd) / 2 + 12, col('--muted')); }
            const dot = (x, y, ok) => { g.fillStyle = col('--panel'); g.strokeStyle = ok == null ? col('--fg') : ok ? col('--good') : col('--warn'); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.stroke(); };
            dot(x0, ym, null);
            dot(x1, yu, Math.abs(e.u) < TOL); dot(x1, yd, Math.abs(e.d) < TOL);
            g.textAlign = 'center'; g.textBaseline = 'top';
            lab('今天', x0, ym - 30, col('--muted'));
            lab('股价 100', x0, ym + 12, col('--fg'));
            lab('组合 ' + fmt(e.cost), x0, ym + 27, col('--s1'));
            g.textAlign = 'left'; g.textBaseline = 'middle';
            const right = (y, s, c, pv) => {
              lab('股价 ' + s, x1 + 12, y - 15, col('--fg'));
              lab('期权 ' + c.toFixed(2), x1 + 12, y, col('--s2'));
              lab('组合 ' + fmt(pv), x1 + 12, y + 15, Math.abs(pv - c) < TOL ? col('--good') : col('--warn'));
            };
            right(yu, 120, CU, e.u + CU); right(yd, 80, CD, e.d + CD);
            g.fillStyle = col('--muted'); g.textAlign = 'left'; g.textBaseline = 'bottom';
            g.fillText('债券：1 → 1.05', 8, Hh - 6);
          }
          cv.onResize(draw);
          const un = watchTheme(draw);
          upd();
          return { destroy() { cv.destroy(); un(); } };
        },
      };

      /* ================= 第二关：把时间切细 ================= */
      const stage2 = {
        title: '把时间切细',
        task: R`<p>真实的股价不是一步跳到两种价格，而是不停地走。Black 与 Scholes 在 1969–1970 年面对的是连续时间。这里换一条后来才铺好的路（Cox、Ross、Rubinstein，1979），它让极限一目了然：把一年切成 $n$ 步，$\Delta t = T/n$，每步股价乘以 $u = e^{\sigma\sqrt{\Delta t}}$ 或 $d = 1/u$；每一步都像上一关那样复制，从到期日一步步倒推回今天。每一步用的 $q = (e^{r\Delta t}-d)/(u-d)$，就是上一关那个 $q$。</p>
<p>标的：$S_0 = K = 100$，期限 $T = 1$ 年，年化波动率 $\sigma$，连续复利的无风险利率 $r$。拖动步数 $n$（1 到 1000），看价格 $C(n)$ 怎样变化；$n$ 小时上图画出整棵树，$n$ 大时画出到期 $\ln(S_T/S_0)$ 在 $q$ 下的分布。</p>
<p><b>问题：</b>$\sigma = 20\%$、$r = 5\%$ 时，$n\to\infty$ 的极限价格是多少？极限下 $\ln(S_T/S_0)$ 在 $q$ 之下的均值是什么？</p>`,
        hints: [
          'n 为奇数和偶数时价格交替偏高、偏低，形成锯齿，极限在锯齿的中线。选「放大：n ≥ 100」看清楚，或者取相邻两个 n 的平均。',
          R`读数里有 $q$ 之下 $\ln(S_T/S_0)$ 的均值。$r = 5\%$、$\sigma = 20\%$ 时它是 0.030；把 $\sigma$ 调到 40% 再看，它变成负的。哪个公式同时符合这些读数？`,
          R`极限约 10.45。均值是 $(r-\sigma^2/2)T$：$0.05-0.02 = 0.03$，$0.05-0.08 = -0.03$。`,
        ],
        answer: R`极限 $\approx 10.4506$。推导：$q = \frac{e^{r\Delta t}-e^{-\sigma\sqrt{\Delta t}}}{e^{\sigma\sqrt{\Delta t}}-e^{-\sigma\sqrt{\Delta t}}} = \frac12 + \frac{r-\sigma^2/2}{2\sigma}\sqrt{\Delta t} + O(\Delta t)$，所以每步 $\ln S$ 增量的均值 $(2q-1)\sigma\sqrt{\Delta t} = (r-\tfrac12\sigma^2)\Delta t + O(\Delta t^{3/2})$，方差 $\sigma^2\Delta t + O(\Delta t^2)$。对三角阵列用中心极限定理（Lindeberg 条件显然成立）：$\ln(S_T/S_0) \Rightarrow N\big((r-\tfrac12\sigma^2)T,\ \sigma^2T\big)$。支付被 $S_T$ 控制且 $E_q[S_T^2]$ 对 $n$ 一致有界，故可交换极限与期望：$C(n)\to e^{-rT}E[(S_T-K)^+] = S_0N(d_1)-Ke^{-rT}N(d_2)$。`,
        build(body, api) {
          const S = { n: 3, sig: 0.2, r: 0.05, zoom: false, norm: false, okL: false, okM: false };
          const NMAX = 1000;
          let arr = [];
          const recompute = () => { arr = [0]; for (let n = 1; n <= NMAX; n++) arr.push(crr(n, 100, 100, 1, S.r, S.sig).price); };
          const row = el('div', { class: 'options-row' });
          const bx1 = el('div', { class: 'lab-stage' }), bx2 = el('div', { class: 'lab-stage' });
          row.append(bx1, bx2); body.append(row);
          const cvT = h.canvas(bx1, { aspect: 0.72, minH: 230, maxH: 320 });
          const cvC = h.canvas(bx2, { aspect: 0.72, minH: 230, maxH: 320 });
          cvT.canvas.setAttribute('aria-label', '二叉树或到期分布');
          cvC.canvas.setAttribute('aria-label', '价格 C(n) 随步数 n 的变化');
          const ctr = el('div', { class: 'lab-controls' });
          const sN = h.slider({ label: '步数 n', min: 1, max: NMAX, step: 1, value: S.n, format: (v) => String(v), onInput: (v) => { S.n = v; draw(); } });
          const stepN = (d) => h.button({ label: (d > 0 ? '+' : '−') + Math.abs(d), onClick: () => { S.n = Math.max(1, Math.min(NMAX, S.n + d)); sN.set(S.n); draw(); } });
          const sS = h.slider({ label: '波动率 σ', min: 0.15, max: 0.5, step: 0.01, value: S.sig, format: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { S.sig = v; recompute(); draw(); } });
          const sR = h.slider({ label: '无风险利率 r', min: 0, max: 0.08, step: 0.005, value: S.r, format: (v) => (v * 100).toFixed(1) + '%', onInput: (v) => { S.r = v; recompute(); draw(); } });
          const cZ = h.choice({ label: '右图纵轴', value: 'all', options: [{ value: 'all', label: '全部 n' }, { value: 'zoom', label: '放大：n ≥ 100' }], onChange: (v) => { S.zoom = v === 'zoom'; drawC(); } });
          const tNm = h.toggle({ label: '在分布上叠加正态曲线（用树的均值与标准差）', value: false, onChange: (b) => { S.norm = b; drawT(); } });
          ctr.append(el('div', { class: 'ctl' }, [sN.el, el('div', { class: 'options-btns' }, [stepN(-10), stepN(-1), stepN(1), stepN(10)])]), sS.el, sR.el, cZ.el, tNm.el);
          body.append(ctr);
          const rd = el('div', { class: 'lab-readout options-rd' });
          const ro = { ud: h.readout('u / d'), q: h.readout('q'), c: h.readout('C(n)'), m: h.readout('q 下 ln(S_T/S₀) 的均值'), s: h.readout('q 下 ln(S_T/S₀) 的标准差') };
          Object.values(ro).forEach((x) => rd.append(x.el)); body.append(rd);

          const ansL = h.answer({
            label: '$\\sigma = 20\\%$、$r = 5\\%$ 时，$n\\to\\infty$ 的极限价格 ≈ ?（容差 ±0.03）', unit: '元', placeholder: '例如 10.3',
            check: (v) => {
              const L = bs(100, 100, 1, 0.05, 0.2);
              if (Math.abs(v - L) <= 0.03) return { ok: true, msg: `对：极限是 ${L.toFixed(4)}。锯齿的幅度按 1/n 缩小。` };
              if (Math.abs(v - 12.16) < 0.05) return { ok: false, msg: '这是 n = 1 的价格。' };
              if (Math.abs(v - L) < 0.15) return { ok: false, msg: '接近了。选「放大：n ≥ 100」，看锯齿的中线。' };
              return { ok: false, msg: '不对。把 n 拉到几百以上，读右图点列收敛到的高度（σ 与 r 要保持 20% 与 5%）。' };
            },
            onOk: () => { S.okL = true; finish(); },
          });
          const quiz = h.quiz({
            question: R`$n$ 很大时，$q$ 之下的 $\ln(S_T/S_0)$ 近似正态，标准差 $\sigma\sqrt T$。它的<b>均值</b>是什么？（改变 σ 与 r，看读数）`,
            options: [
              { label: R`$\mu T$，$\mu$ 是股票真实的期望收益率`, ok: false, why: '树里根本没有 μ：u、d、q 只用到 σ、r 和 Δt。' },
              { label: R`$rT$`, ok: false, why: 'r = 5% 时读数是 0.030 而不是 0.050；σ 调大，均值继续下降。' },
              { label: R`$(r-\tfrac12\sigma^2)T$`, ok: true, why: R`对。$q = \frac12 + \frac{r-\sigma^2/2}{2\sigma}\sqrt{\Delta t} + O(\Delta t)$。这一项 $-\sigma^2/2$ 正是伊藤引理的修正：要让 $E_q[S_T] = S_0e^{rT}$，而 $E[e^X] = e^{m+v/2}$，所以 $m = rT - \sigma^2T/2$。` },
              { label: R`$0$`, ok: false, why: 'r = 5%、σ = 20% 时读数明显不是 0。' },
            ],
            onOk: () => { S.okM = true; finish(); },
          });
          body.append(ansL.el, quiz.el);
          function finish() {
            if (!(S.okL && S.okM)) return;
            api.done(R`<b>二叉树的极限就是 Black–Scholes 公式。</b>在 $q$ 之下 $\ln(S_T/S_0)\to N\big((r-\tfrac12\sigma^2)T,\ \sigma^2T\big)$，所以 $C = e^{-rT}E_q[(S_T-K)^+] = S_0N(d_1)-Ke^{-rT}N(d_2)$，$d_{1,2} = \frac{\ln(S_0/K)+(r\pm\sigma^2/2)T}{\sigma\sqrt T}$。右图的虚线就是它。价格里只有 $\sigma$ 和 $r$，没有 $\mu$。`);
            drawC();
          }

          function drawT() {
            const g = cvT.g, W = cvT.w, Hh = cvT.h, mono = col('--mono-font');
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            if (S.n <= 6) {
              const { Sx, V } = tree(S.n, 100, 100, 1, S.r, S.sig), n = S.n;
              const pl = 30, pr = 50, pt = 26, pb = 26;
              const X = (i) => pl + ((W - pl - pr) * i) / n;
              const lo = Math.log(Sx[n][0]), hi = Math.log(Sx[n][n]);
              const Y = (s) => pt + (Hh - pt - pb) * (1 - (Math.log(s) - lo) / (hi - lo || 1));
              g.strokeStyle = col('--line'); g.lineWidth = 1.2;
              for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
                g.beginPath(); g.moveTo(X(i), Y(Sx[i][j])); g.lineTo(X(i + 1), Y(Sx[i + 1][j + 1])); g.stroke();
                g.beginPath(); g.moveTo(X(i), Y(Sx[i][j])); g.lineTo(X(i + 1), Y(Sx[i + 1][j])); g.stroke();
              }
              g.font = (n <= 4 ? 11 : 10) + 'px ' + mono; g.textAlign = 'center';
              for (let i = 0; i <= n; i++) for (let j = 0; j <= i; j++) {
                const x = X(i), y = Y(Sx[i][j]), itm = i === n && V[i][j] > 0;
                g.fillStyle = itm ? col('--s2') : col('--fg'); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
                if (n <= 5 || i === 0 || i === n) {
                  g.textBaseline = 'bottom'; g.fillStyle = col('--muted'); g.fillText(Sx[i][j].toFixed(n <= 3 ? 1 : 0), x, y - 4);
                  g.textBaseline = 'top'; g.fillStyle = col('--s2'); g.fillText(V[i][j].toFixed(2), x, y + 4);
                }
              }
              g.font = '11px ' + col('--body-font'); g.textAlign = 'left'; g.textBaseline = 'top';
              g.fillStyle = col('--muted'); g.fillText('灰：股价　', 6, 5);
              g.fillStyle = col('--s2'); g.fillText('橙：期权价值（倒推）', 6 + g.measureText('灰：股价　').width, 5);
              return;
            }
            const c = crr(S.n, 100, 100, 1, S.r, S.sig), n = S.n, a = c.a, half = Math.max(0.6, 4.5 * S.sig + 0.1);
            const lr = Math.log(c.q / (1 - c.q)), dens = []; let lp = n * Math.log(1 - c.q), dmax = 0;
            for (let j = 0; j <= n; j++) { const d = Math.exp(lp) / (2 * a); dens.push(d); dmax = Math.max(dmax, d); if (j < n) lp += Math.log((n - j) / (j + 1)) + lr; }
            const y1 = Math.max(1, dmax * 1.18), yt = y1 > 2.5 ? [0, 1, 2, 3] : [0, 0.5, 1, 1.5, 2];
            const A = h.axes(g, W, Hh, { x0: -half, x1: half, y0: 0, y1, pad: { l: 40, r: 10, t: 22, b: 34 }, xTicks: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5].filter((t) => Math.abs(t) <= half), yTicks: yt.filter((t) => t <= y1), xLabel: 'ln(S_T / S₀)', yLabel: '密度（q 之下）', fmtX: (v) => v.toFixed(1), fmtY: (v) => String(v) }, col);
            // in-the-money region
            g.fillStyle = col('--s2'); g.globalAlpha = 0.08; g.fillRect(A.X(0), A.p.t, A.p.l + A.iw - A.X(0), A.ih); g.globalAlpha = 1;
            g.fillStyle = col('--s1');
            const bw = Math.max(1, A.X(2 * a) - A.X(0) - (n < 80 ? 1 : 0));
            for (let j = 0; j <= n; j++) {
              const x = (2 * j - n) * a;
              if (Math.abs(x) <= half && dens[j] > 1e-4) { const y = A.Y(dens[j]); g.fillRect(A.X(x) - bw / 2, y, bw, A.Y(0) - y); }
            }
            if (S.norm) {
              const xs = [], ys = [];
              for (let i = 0; i <= 200; i++) { const x = -half + (2 * half * i) / 200; xs.push(x); ys.push(npdf((x - c.mean) / c.sd) / c.sd); }
              poly(g, A, xs, ys, col('--accent'), 2);
            }
            g.font = '11px ' + col('--body-font'); g.fillStyle = col('--s2'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('S_T > K：期权有支付', A.X(0) + 4, A.p.t + 4);
            g.fillStyle = col('--muted'); g.textAlign = 'left'; g.fillText('n = ' + n, A.p.l + 4, 5);
          }
          function drawC() {
            const g = cvC.g, W = cvC.w, Hh = cvC.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const n0 = S.zoom ? 100 : 1;
            let lo = Infinity, hi = -Infinity;
            for (let n = n0; n <= NMAX; n++) { lo = Math.min(lo, arr[n]); hi = Math.max(hi, arr[n]); }
            const pad = (hi - lo) * 0.08 + 1e-3; lo -= pad; hi += pad;
            const step = S.zoom ? (hi - lo > 0.06 ? 0.02 : 0.01) : hi - lo > 2.5 ? 1 : 0.5;
            const yT = []; for (let y = Math.ceil(lo / step) * step; y <= hi + 1e-9; y += step) yT.push(+y.toFixed(3));
            const A = h.axes(g, W, Hh, { x0: Math.log10(n0), x1: 3, y0: lo, y1: hi, pad: { l: 50, r: 12, t: 22, b: 34 }, xTicks: (S.zoom ? [100, 200, 500, 1000] : [1, 10, 100, 1000]).map(Math.log10), yTicks: yT, fmtX: (v) => String(Math.round(10 ** v)), fmtY: (v) => v.toFixed(S.zoom ? 2 : 1), xLabel: '步数 n（对数）', yLabel: 'C(n)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            for (let n = n0; n <= NMAX; n++) { g.fillStyle = n % 2 ? col('--s1') : col('--s4'); g.beginPath(); g.arc(A.X(Math.log10(n)), A.Y(arr[n]), n < 30 ? 2.6 : 1.4, 0, 7); g.fill(); }
            if (api.solved()) {
              const L = bs(100, 100, 1, S.r, S.sig);
              g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(A.p.l, A.Y(L)); g.lineTo(A.p.l + A.iw, A.Y(L)); g.stroke(); g.setLineDash([]);
              g.fillStyle = col('--accent'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('Black–Scholes ' + L.toFixed(4), A.p.l + A.iw - 4, A.Y(L) - 3);
            }
            if (S.n >= n0) { g.strokeStyle = col('--accent'); g.lineWidth = 2; g.beginPath(); g.arc(A.X(Math.log10(S.n)), A.Y(arr[S.n]), 6, 0, 7); g.stroke(); }
            g.restore();
            g.font = '11px ' + col('--body-font'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillStyle = col('--s1'); g.fillText('● 奇数 n', A.p.l + 2, 5); g.fillStyle = col('--s4'); g.fillText('● 偶数 n', A.p.l + 70, 5);
          }
          function draw() {
            const c = crr(S.n, 100, 100, 1, S.r, S.sig);
            ro.ud.set(c.u.toFixed(4) + ' / ' + c.d.toFixed(4)); ro.q.set(c.q.toFixed(4)); ro.c.set(c.price.toFixed(4) + ' 元');
            ro.m.set(sgn(c.mean, 4)); ro.s.set(c.sd.toFixed(4));
            drawT(); drawC();
          }
          cvT.onResize(drawT); cvC.onResize(drawC);
          const un = watchTheme(() => { drawT(); drawC(); });
          recompute(); draw();
          return { destroy() { cvT.destroy(); cvC.destroy(); un(); } };
        },
      };

      /* ================= 第三关：卖出之后 ================= */
      const NS = [0, 1, 4, 10, 50, 250, 1000];
      const stage3 = {
        title: '卖出之后',
        task: R`<p>1973 年 4 月 26 日，芝加哥期权交易所（CBOE）开张，第一天在 16 只股票上成交了 911 张看涨期权合约。做市商卖出期权以后，风险怎么办？</p>
<p>你按公式价 ${C0H.toFixed(2)} 元卖出一张一年期平值看涨期权（对应一股；$S_0 = K = 100$，$\sigma = 20\%$，$r = 5\%$）。股票真实的年期望收益率 $\mu$ 你并不知道（模拟默认 12%）。你的做法：把一年均匀分成 $N$ 段，每段开始时把持股调到 $\Delta = \partial C/\partial S$ 股（第一关里那个 Δ 在连续时间的版本），其余资金放进或借自无风险账户。到期时，组合价值减去期权的支付就是你的盈亏。</p>
<p>每种调仓频率模拟 300 条股价路径（几何布朗运动，<b>示意</b>）。<b>盈亏的标准差怎样随调仓次数 $N$ 变化？</b>写成 $\mathrm{SD}\propto N^{a}$，求 $a$。再换一个 $\mu$ 跑一遍，看平均盈亏。</p>`,
        hints: [
          '先跑「不对冲」作为基准，再跑至少三个不同的调仓次数。右边的双对数图上，各点几乎排成一条直线，它的斜率就是 a。',
          R`用两端的点估计：$a \approx \frac{\lg\mathrm{SD}(1000)-\lg\mathrm{SD}(1)}{\lg 1000-\lg 1}$。然后把 μ 调到 0% 或 30% 再跑同样的 N，比较平均盈亏。`,
          'a ≈ −0.5：调仓次数乘以 100，误差缩小到约 1/10。对冲后的平均盈亏始终在 0 附近，与 μ 无关；不对冲时则随 μ 大幅变化。',
        ],
        answer: R`$a = -\tfrac12$。在两次调仓之间，持有 $\Delta$ 股的组合与期权价值之差的变化主要来自凸性：$d(\Pi - V) \approx -\tfrac12\Gamma S^2\big[(\Delta S/S)^2 - \sigma^2\Delta t\big]$，这一项均值为零、标准差 $\propto \Gamma S^2\sigma^2\Delta t$。$N$ 个区间近似独立地相加，总方差 $\propto N\Delta t^2 = T^2/N$，故标准差 $\propto N^{-1/2}$（本例 $\mathrm{SD}\approx 6.6/\sqrt N$）。$N\to\infty$ 时误差趋于零：连续调仓的 Δ 对冲<b>完全复制</b>期权，这就是 Black–Scholes 推导的核心。平均盈亏 $\approx 0$ 且与 $\mu$ 无关，因为对冲已经消除了对股价方向的暴露。`,
        build(body, api) {
          const S = { N: 4, mu: 0.12, runs: new Map(), okA: false, okQ: false };
          const row = el('div', { class: 'options-row' });
          const bx1 = el('div', { class: 'lab-stage' }), bx2 = el('div', { class: 'lab-stage' });
          row.append(bx1, bx2); body.append(row);
          const cvP = h.canvas(bx1, { aspect: 0.7, minH: 220, maxH: 310 });
          const cvL = h.canvas(bx2, { aspect: 0.7, minH: 220, maxH: 310 });
          cvP.canvas.setAttribute('aria-label', '一条样本路径上期权价值与对冲组合价值');
          cvL.canvas.setAttribute('aria-label', '对冲盈亏标准差与调仓次数的双对数图');
          const ctr = el('div', { class: 'lab-controls' });
          const cN = h.choice({ label: '一年内调仓次数 N', value: S.N, options: NS.map((n) => ({ value: n, label: n === 0 ? '不对冲' : n === 250 ? '250（约每交易日）' : String(n) })), onChange: (v) => { S.N = v; } });
          const sMu = h.slider({ label: '股票真实期望收益 μ（你不知道）', min: 0, max: 0.3, step: 0.01, value: S.mu, format: (v) => (v * 100).toFixed(0) + '%', onInput: (v) => { S.mu = v; } });
          const bRun = h.button({ label: '模拟 300 条路径', kind: 'primary', onClick: run });
          const bAll = h.button({ label: '把所有 N 都跑一遍（当前 μ）', onClick: () => { NS.forEach((n) => { S.N = n; cN.set(n); run(true); }); refresh(); } });
          ctr.append(cN.el, sMu.el, el('div', { class: 'ctl' }, [el('div', {}, [bRun, bAll])]));
          const rdS = el('div', { class: 'lab-readout options-rd' });
          const roS = { s: h.readout('左图样本路径的 S_T'), e: h.readout('该路径的盈亏'), m: h.readout('本次 300 条：平均 / 标准差') };
          Object.values(roS).forEach((x) => rdS.append(x.el));
          body.append(ctr, rdS);
          const tbody = el('tbody');
          body.append(el('div', { class: 'dtable options-tab' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['μ', 'N', '平均盈亏 (元)', '盈亏标准差 (元)'].map((t) => el('th', { text: t })))]), tbody])]));
          let last = null;

          const quizBox = el('div', { hidden: true });
          const ans = h.answer({
            label: '盈亏标准差 $\\propto N^{a}$，$a$ = ?（容差 ±0.1）', placeholder: '指数',
            check: (v) => {
              const pts = fitPts();
              if (pts.length < 3) return { ok: false, msg: `先在同一个 μ 下跑至少三个不同的 N（对冲的，现在最多 ${pts.length} 个）。` };
              if (Math.abs(v + 0.5) <= 0.1) return { ok: true, msg: '对：SD ∝ 1/√N。调仓次数乘以 100，误差只缩小到 1/10。' };
              if (Math.abs(v + 1) < 0.1) return { ok: false, msg: '如果误差 ∝ 1/N，N 从 1 到 1000 应当缩小 1000 倍。看看表里实际缩小了多少。' };
              if (Math.abs(v - 0.5) < 0.1) return { ok: false, msg: '符号：N 越大误差越小，指数应当是负的。' };
              return { ok: false, msg: `不对。用你的点做个线性回归：lg SD 对 lg N 的斜率约为 ${slope(pts).toFixed(2)}。` };
            },
            onOk: () => { S.okA = true; finish(); },
          });
          quizBox.append(h.quiz({
            question: '比较两个不同 μ 下的结果：Δ 对冲之后的<b>平均盈亏</b>怎样随 μ 变化？',
            options: [
              { label: 'μ 越大，卖期权的人亏得越多', ok: false, why: '那是「不对冲」时的情形：股票涨得越凶，裸卖出的看涨期权亏得越多。对冲之后呢？' },
              { label: '几乎不随 μ 变化，始终在 0 附近；随 N 变小的只是标准差', ok: true, why: '对。Δ 对冲消除了对股价方向的暴露，剩下的只是离散调仓带来的、均值为零的误差。' },
              { label: 'μ 越大，对冲者赚得越多', ok: false, why: '看表：同一个 N 下，平均盈亏的差别远小于它的标准误差。' },
              { label: '没有规律，完全取决于随机数', ok: false, why: '每个 μ 都用 300 条路径；均值的标准误差约为 SD/√300，比你看到的差别还大吗？' },
            ],
            onOk: () => { S.okQ = true; finish(); },
          }).el);
          body.append(ans.el, quizBox);
          function finish() {
            if (S.okA && S.okQ) api.done(R`<b>动态复制。</b>按 $\Delta = \partial C/\partial S$ 持股并不断调仓，组合就跟住了期权的价值；误差按 $N^{-1/2}$ 收缩，连续调仓时为零。所以期权的价格只能等于复制它的成本，而这个成本与 $\mu$ 无关。把"组合与期权之差在每一瞬间都无风险"写成方程，就是 Black–Scholes 偏微分方程 $\partial_t V + \tfrac12\sigma^2S^2\partial_S^2V + rS\partial_SV - rV = 0$。`);
          }
          function fitPts() { // the μ group with the most hedged runs
            const groups = new Map();
            [...S.runs.values()].filter((r) => r.N > 0).forEach((r) => { const k = r.mu.toFixed(2); if (!groups.has(k)) groups.set(k, []); groups.get(k).push([Math.log10(r.N), Math.log10(r.sd)]); });
            return [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
          }
          function slope(pts) { const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n; let sxy = 0, sxx = 0; pts.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }); return sxy / sxx; }
          function run(batch) {
            const r = hedgeRun(S.N, S.mu, true);
            S.runs.set(S.mu.toFixed(2) + '|' + S.N, { mu: S.mu, N: S.N, mean: r.mean, sd: r.sd });
            last = { ...r, N: S.N, mu: S.mu };
            if (batch !== true) refresh();
          }
          function refresh() {
            const rows = [...S.runs.values()].sort((a, b) => a.mu - b.mu || a.N - b.N);
            tbody.replaceChildren(...rows.map((r) => el('tr', {}, [el('td', { text: (r.mu * 100).toFixed(0) + '%' }), el('td', { text: r.N ? String(r.N) : '不对冲' }), el('td', { text: sgn(r.mean) }), el('td', { text: r.sd.toFixed(3) })])));
            const mus = new Set(rows.filter((r) => r.N > 0).map((r) => r.mu));
            if (mus.size >= 2 && quizBox.hidden) { quizBox.hidden = false; api.typeset(quizBox); }
            drawP(); drawL();
          }
          function drawP() {
            const g = cvP.g, W = cvP.w, Hh = cvP.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            if (!last) {
              h.axes(g, W, Hh, { x0: 0, x1: 1, y0: 0, y1: 30, pad: { l: 40, r: 10, t: 24, b: 34 }, xTicks: [0, 0.5, 1], yTicks: [0, 10, 20, 30], xLabel: 't (年)', yLabel: '价值 (元)' }, col);
              g.fillStyle = col('--muted'); g.font = '12px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('选好 N 后按「模拟 300 条路径」', W / 2, Hh / 2); return;
            }
            const sm = last.sample, ymax = Math.max(25, ...sm.V, ...sm.P) * 1.08, ymin = Math.min(0, ...sm.P) - 1;
            const A = h.axes(g, W, Hh, { x0: 0, x1: 1, y0: ymin, y1: ymax, pad: { l: 40, r: 10, t: 24, b: 34 }, xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 10, 20, 30, 40, 50, 60].filter((v) => v <= ymax), xLabel: 't (年)', yLabel: '价值 (元)', fmtX: (v) => String(v) }, col);
            poly(g, A, sm.t, sm.V, col('--s2'), 2.4);
            poly(g, A, sm.t, sm.P, col('--s1'), 1.6, last.N ? null : [5, 4]);
            const sT = sm.S[sm.S.length - 1], pay = Math.max(sT - HK, 0);
            g.fillStyle = col('--s2'); g.beginPath(); g.arc(A.X(1), A.Y(pay), 4, 0, 7); g.fill();
            legend(g, col, [['期权价值 C(t, S_t)', col('--s2')], [last.N ? '你的对冲组合' : '保费存银行', col('--s1'), !last.N]], A.p.l, 10, W - 4);
            roS.s.set(sT.toFixed(2) + ' 元（支付 ' + pay.toFixed(2) + '）');
            roS.e.set(sgn(sm.P[sm.P.length - 1] - pay) + ' 元');
            roS.m.set(sgn(last.mean) + ' / ' + last.sd.toFixed(3) + ' 元');
          }
          function drawL() {
            const g = cvL.g, W = cvL.w, Hh = cvL.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: -0.15, x1: 3.15, y0: 0.1, y1: 40, logY: true, pad: { l: 44, r: 12, t: 24, b: 34 }, xTicks: [0, 1, 2, 3], yTicks: [0.1, 0.3, 1, 3, 10, 30], fmtX: (v) => String(10 ** v), fmtY: (v) => String(v), xLabel: '调仓次数 N（对数）', yLabel: '盈亏标准差（对数）' }, col);
            const mus = [...new Set([...S.runs.values()].map((r) => r.mu))].sort((a, b) => a - b), cols = ['--s1', '--s2', '--s3', '--s4'];
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            mus.forEach((mu, k) => {
              const c = col(cols[k % 4]), rs = [...S.runs.values()].filter((r) => r.mu === mu);
              rs.filter((r) => r.N === 0).forEach((r) => { g.strokeStyle = c; g.setLineDash([5, 4]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(A.p.l, A.Y(r.sd)); g.lineTo(A.p.l + A.iw, A.Y(r.sd)); g.stroke(); g.setLineDash([]); });
              g.fillStyle = c; rs.filter((r) => r.N > 0).forEach((r) => { g.beginPath(); g.arc(A.X(Math.log10(r.N)), A.Y(r.sd), 4.5, 0, 7); g.fill(); });
            });
            g.restore();
            g.font = '11px ' + col('--body-font'); g.textAlign = 'left'; g.textBaseline = 'top';
            let x = A.p.l + 2;
            mus.forEach((mu, k) => { const t = 'μ=' + (mu * 100).toFixed(0) + '%'; g.fillStyle = col(cols[k % 4]); g.fillText(t, x, 5); x += g.measureText(t).width + 10; });
            if (mus.length) { g.fillStyle = col('--muted'); g.fillText('虚线 = 不对冲', x, 5); }
          }
          cvP.onResize(drawP); cvL.onResize(drawL);
          const un = watchTheme(() => { drawP(); drawL(); });
          drawP(); drawL();
          return { destroy() { cvP.destroy(); cvL.destroy(); un(); } };
        },
      };

      /* ================= 第四关：从价格反推 ================= */
      const stage4 = {
        title: '从价格反推',
        task: R`<p>公式有了以后，交易员很快开始反过来用它。$S_0, K, T, r$ 都写在合约和报纸上，唯一看不见的输入是 $\sigma$。<b>把市价代回公式解出 $\sigma$</b>，就得到这张期权的"隐含波动率"。</p>
<p>下面是某股指半年期看涨期权的一组报价（<b>示意数据</b>；$S_0 = 100$，$r = 5\%$，$T = 0.5$ 年）。选一个行权价，调 $\sigma$ 让公式价等于市价：拖动滑块，或者用「牛顿一步」。价格对得上（差 &lt; 0.005）时，表格会记下这个 σ。</p>
<p>先求 $K = 100$ 的隐含波动率；再把五个行权价都解出来，看它们说明了什么。</p>`,
        hints: [
          R`Black–Scholes 价格对 $\sigma$ 严格递增：$\partial C/\partial\sigma = S\sqrt T\,\varphi(d_1)\gt 0$（vega），所以每个市价恰好对应一个 $\sigma$。让曲线穿过所选的那个点。`,
          R`牛顿法：$\sigma \leftarrow \sigma - \frac{C(\sigma)-P}{\mathrm{vega}(\sigma)}$，两三步就收敛。五个都解完后看右图：隐含波动率怎样随行权价变化？`,
          'K = 100 时 σ ≈ 18.0%；五个值约为 29%、23%、18%、15%、12%：行权价越低，隐含波动率越高。',
        ],
        answer: R`$K = 100$ 的隐含波动率 $\approx 18.0\%$。五个行权价依次约 29.4%、22.8%、18.0%、14.7%、12.4%。如果市场完全按 Black–Scholes 的假设定价（对数正态、$\sigma$ 为常数），这五个数应当相同。实际的"偏斜"说明市场为大跌情景付出的价格高于对数正态所给，也就是风险中性分布的左尾更厚。股指期权的这种形状在 1987 年 10 月股灾之后变得普遍而显著，之前的曲线平坦得多（Rubinstein 1994）。`,
        build(body, api) {
          const S = { k: 2, sig: 0.25, iv: [null, null, null, null, null], okA: false, okQ: false };
          const row = el('div', { class: 'options-row' });
          const bx1 = el('div', { class: 'lab-stage' }), bx2 = el('div', { class: 'lab-stage' });
          row.append(bx1, bx2); body.append(row);
          const cvP = h.canvas(bx1, { aspect: 0.72, minH: 220, maxH: 320 });
          const cvS = h.canvas(bx2, { aspect: 0.72, minH: 220, maxH: 320 });
          cvP.canvas.setAttribute('aria-label', '市价与公式价随行权价');
          cvS.canvas.setAttribute('aria-label', '隐含波动率随行权价');
          const ctr = el('div', { class: 'lab-controls' });
          const cK = h.choice({ label: '行权价 K', value: S.k, options: IVK.map((K, i) => ({ value: i, label: String(K) })), onChange: (v) => { S.k = v; upd(); } });
          const sSig = h.slider({ label: '波动率 σ', min: 0.05, max: 0.6, step: 0.0001, value: S.sig, format: (v) => (v * 100).toFixed(2) + '%', onInput: (v) => { S.sig = v; upd(); } });
          const setSig = (v) => { S.sig = Math.max(0.05, Math.min(0.6, v)); sSig.set(S.sig); upd(); };
          const bNewton = h.button({ label: '牛顿一步', kind: 'primary', onClick: () => {
            const K = IVK[S.k], P = IVP[S.k], c = bs(100, K, IVT, IVR, S.sig), vg = bsVega(100, K, IVT, IVR, S.sig);
            let nx = vg > 1e-9 ? S.sig - (c - P) / vg : NaN;
            // safeguard: if vega is tiny or the step leaves [5%, 60%], bisect toward the side that contains the root
            if (!isFinite(nx) || nx <= 0.05 || nx >= 0.6) nx = c < P ? (S.sig + 0.6) / 2 : (S.sig + 0.05) / 2;
            setSig(nx);
          } });
          const nud = (d) => h.button({ label: (d > 0 ? '+' : '−') + Math.abs(d * 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + '%', onClick: () => setSig(S.sig + d) });
          ctr.append(cK.el, el('div', { class: 'ctl' }, [sSig.el, el('div', { class: 'options-btns' }, [nud(-0.01), nud(-0.001), nud(0.001), nud(0.01), bNewton])]));
          body.append(ctr);
          const rd = el('div', { class: 'lab-readout options-rd' });
          const ro = { m: h.readout('市价 P'), c: h.readout('公式价 C(σ)'), d: h.readout('C(σ) − P'), v: h.readout('vega ∂C/∂σ（每 1% σ）') };
          Object.values(ro).forEach((x) => rd.append(x.el)); body.append(rd);
          const tbody = el('tbody');
          body.append(el('div', { class: 'dtable' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['K', '市价', '隐含波动率'].map((t) => el('th', { text: t })))]), tbody])]));
          const quizBox = el('div', { hidden: true });
          const ans = h.answer({
            label: '$K = 100$ 的隐含波动率 = ?（%，容差 ±0.3）', unit: '%', placeholder: '例如 25',
            check: (v) => {
              const x = v < 1 ? v * 100 : v, t = ivOf(IVP[2], 100) * 100;
              if (Math.abs(x - t) <= 0.3) return { ok: true, msg: `对：约 ${t.toFixed(1)}%。` + (v < 1 ? '（你写成了小数，也算对。）' : '') };
              return { ok: false, msg: '不对。选 K = 100，按几次「牛顿一步」，看公式价何时等于 6.34。' };
            },
            onOk: () => { S.okA = true; finish(); },
          });
          quizBox.append(h.quiz({
            question: R`如果市场完全按 Black–Scholes 的假设定价（对数正态、$\sigma$ 为常数），这五个隐含波动率应当怎样？实际数据说明了什么？`,
            options: [
              { label: '应当相同；实际是行权价越低越高，说明市场给大跌定的价格高于对数正态所给', ok: true, why: '对。低行权价的看涨期权（以及由平价关系对应的虚值看跌期权）主要为下跌情景定价；它们"贵"，说明风险中性分布的左尾比对数正态厚。这就是 1987 年后股指期权的波动率偏斜。' },
              { label: '应当相同；实际也基本相同，差别只是报价噪声', ok: false, why: '29% 与 12% 的差别远大于价格取到分所造成的误差（K = 120 时 0.005 元只对应约 0.1% 的 σ）。' },
              { label: '行权价越高，隐含波动率本来就该越高', ok: false, why: '模型里 σ 是股票的性质，与你选哪张合约无关。而且数据的方向恰好相反。' },
              { label: '隐含波动率不同，所以这些报价之间一定存在无风险套利', ok: false, why: '不一定。偏斜只说明市场的风险中性分布不是对数正态；只要价格对行权价单调递减且是凸的，就没有静态套利。' },
            ],
            onOk: () => { S.okQ = true; finish(); },
          }).el);
          body.append(ans.el, quizBox);
          function finish() {
            if (S.okA && S.okQ) api.done(R`<b>隐含波动率与"微笑"。</b>公式被倒过来用，变成了报价的语言：交易员报的是 σ 而不是价格。同一标的、不同行权价的 σ 不相同，正是市场在告诉你模型的哪条假设不成立：收益分布有厚尾，波动率本身也在变。后来的局部波动率（Dupire 1994）与随机波动率（Heston 1993）模型都是为了拟合这条曲线。`);
          }
          function upd() {
            const K = IVK[S.k], P = IVP[S.k], c = bs(100, K, IVT, IVR, S.sig), vg = bsVega(100, K, IVT, IVR, S.sig);
            ro.m.set(P.toFixed(2) + ' 元'); ro.c.set(c.toFixed(4) + ' 元'); ro.d.set(sgn(c - P, 4)); ro.v.set((vg / 100).toFixed(4) + ' 元');
            if (Math.abs(c - P) < 0.005 && S.iv[S.k] == null) {
              S.iv[S.k] = S.sig;
              api.say(`K = ${K}：隐含波动率 ${(S.sig * 100).toFixed(2)}%，已记入表格（${S.iv.filter((x) => x != null).length}/5）。`, 'info');
              if (S.iv.every((x) => x != null) && quizBox.hidden) { quizBox.hidden = false; api.typeset(quizBox); }
            }
            tbody.replaceChildren(...IVK.map((K, i) => el('tr', {}, [el('td', { text: String(K) }), el('td', { text: IVP[i].toFixed(2) }), el('td', { text: S.iv[i] == null ? '—' : (S.iv[i] * 100).toFixed(2) + '%' })])));
            drawP(); drawS();
          }
          function drawP() {
            const g = cvP.g, W = cvP.w, Hh = cvP.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 75, x1: 125, y0: 0, y1: 27, pad: { l: 40, r: 10, t: 24, b: 34 }, xTicks: [80, 90, 100, 110, 120], yTicks: [0, 5, 10, 15, 20, 25], xLabel: '行权价 K', yLabel: '看涨期权价格 (元)' }, col);
            const xs = [], ys = []; for (let K = 75; K <= 125; K += 0.5) { xs.push(K); ys.push(bs(100, K, IVT, IVR, S.sig)); }
            poly(g, A, xs, ys, col('--s1'), 2);
            IVK.forEach((K, i) => {
              const on = i === S.k; g.fillStyle = on ? col('--accent') : col('--fg');
              g.beginPath(); g.arc(A.X(K), A.Y(IVP[i]), on ? 5.5 : 4, 0, 7); g.fill();
            });
            legend(g, col, [['公式价 C(K; σ = ' + (S.sig * 100).toFixed(2) + '%)', col('--s1')]], A.p.l, 10, W - 4);
          }
          function drawS() {
            const g = cvS.g, W = cvS.w, Hh = cvS.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 75, x1: 125, y0: 0.05, y1: 0.35, pad: { l: 44, r: 10, t: 24, b: 34 }, xTicks: [80, 90, 100, 110, 120], yTicks: [0.1, 0.15, 0.2, 0.25, 0.3], fmtY: (v) => (v * 100).toFixed(0) + '%', xLabel: '行权价 K', yLabel: '隐含波动率' }, col);
            const pts = IVK.map((K, i) => [K, S.iv[i]]).filter((p) => p[1] != null);
            if (!pts.length) { g.fillStyle = col('--muted'); g.font = '12px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('解出的 σ 会画在这里', A.p.l + A.iw / 2, A.p.t + A.ih / 2); return; }
            if (pts.length > 1) poly(g, A, pts.map((p) => p[0]), pts.map((p) => p[1]), col('--s4'), 1.5, [4, 3]);
            g.fillStyle = col('--s4'); pts.forEach(([K, v]) => { g.beginPath(); g.arc(A.X(K), A.Y(v), 4.5, 0, 7); g.fill(); });
          }
          cvP.onResize(drawP); cvS.onResize(drawS);
          const un = watchTheme(() => { drawP(); drawS(); });
          upd();
          return { destroy() { cvP.destroy(); cvS.destroy(); un(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3, stage4]);
    },
  };
})();
