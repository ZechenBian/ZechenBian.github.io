/* 增长从哪里来 — challenge for Economic Sciences 1987 (Robert M. Solow)
 * Stage 1: growth accounting on Solow's own series (US private non-farm, 1909–1949; q = GNP per man-hour
 *   (1939 $), k = employed capital per man-hour (constant $); as tabulated in Greene, Econometric Analysis, Table F6.4).
 *   Δln q = α Δln k + Δln A with α = capital's income share ≈ 0.35.
 *   ln(1.275/0.623) = 0.7162, ln(2.70/2.06) = 0.2705 → capital 0.095 (13 %), residual 0.622 (87 %), 1.55 %/yr.
 *   Solow (levels, yearly shares): 87.5 %, A(1949)/A(1909) = 1.809 (1.48 %/yr).
 * Stage 2: k̇ = s k^α − (n+δ)k, α = 1/3, n+δ = 0.06. k* = (s/(n+δ))^{1/(1−α)} = (0.2/0.06)^{1.5} = 6.086;
 *   s 0.20 → 0.30: y* × 1.5^{α/(1−α)} = 1.2247 (+22.5 %); growth returns to 0. Golden rule: c* max at s = α.
 * Stage 3: synthetic cross-section (示意), 90 countries, T = 25 yr, α = 0.67 (broad capital), g + δ = 0.05:
 *   exact Cobb–Douglas transition in z = k^{1−α}. Unconditional OLS slope ≈ +0.0055; controlling for ln s and
 *   ln(n + g + δ): b ≈ −0.0174 ⇒ λ = −ln(1 + bT)/T ≈ 2.3 %/yr (true mean (1−α)(n+g+δ) = 2.30 %/yr).
 */
(() => {
  const R = String.raw;
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- Stage 1 data ---------- */
  const SD = [[1909, .623, 2.06], [1910, .616, 2.10], [1911, .647, 2.17], [1912, .652, 2.21], [1913, .680, 2.23], [1914, .682, 2.20], [1915, .669, 2.26], [1916, .700, 2.34], [1917, .679, 2.21], [1918, .729, 2.22], [1919, .767, 2.47], [1920, .721, 2.58], [1921, .770, 2.55], [1922, .788, 2.49], [1923, .809, 2.61], [1924, .836, 2.74], [1925, .872, 2.81], [1926, .869, 2.87], [1927, .871, 2.93], [1928, .874, 3.02], [1929, .895, 3.06], [1930, .880, 3.30], [1931, .904, 3.33], [1932, .879, 3.28], [1933, .869, 3.10], [1934, .921, 3.00], [1935, .943, 2.87], [1936, .982, 2.72], [1937, .971, 2.71], [1938, 1.000, 2.78], [1939, 1.034, 2.66], [1940, 1.082, 2.63], [1941, 1.122, 2.58], [1942, 1.136, 2.64], [1943, 1.180, 2.62], [1944, 1.265, 2.63], [1945, 1.296, 2.66], [1946, 1.215, 2.50], [1947, 1.194, 2.50], [1948, 1.221, 2.55], [1949, 1.275, 2.70]];
  const LQ = (i) => Math.log(SD[i][1] / SD[0][1]);
  const LK = (i) => Math.log(SD[i][2] / SD[0][2]);
  const DLQ = LQ(SD.length - 1), DLK = LK(SD.length - 1);

  /* ---------- Stage 2 model ---------- */
  const ND = 0.06; // n + δ
  const kStar = (s, a) => Math.pow(s / ND, 1 / (1 - a));
  const cStar = (s, a) => (1 - s) * Math.pow(kStar(s, a), a);

  /* ---------- Stage 3 synthetic cross-section (示意) ---------- */
  const T3 = 25;
  const COUNTRIES = (() => {
    const rnd = mulberry32(1985);
    const gauss = () => { const a = rnd() || 1e-12, b = rnd(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
    const N = 90, AL = 0.67, GD = 0.05, g = 0.016, out = [];
    for (let i = 0; i < N; i++) {
      const z = gauss();
      const s = Math.min(0.36, Math.max(0.04, 0.17 + 0.07 * z + 0.03 * gauss()));
      const n = Math.min(0.035, Math.max(0.002, 0.020 - 0.007 * z + 0.004 * gauss()));
      out.push({ s, n, lnyst: (AL / (1 - AL)) * Math.log(s / (n + GD)) });
    }
    const m = out.reduce((a, c) => a + c.lnyst, 0) / N;
    out.forEach((c) => {
      const lny0 = c.lnyst - (0.25 * (c.lnyst - m) + 0.25 * gauss() + 0.5); // below own steady state in 1960
      const k0 = Math.exp(lny0 / AL), kst = Math.exp(c.lnyst / AL), lam = (1 - AL) * (c.n + GD);
      const kT = Math.pow(Math.pow(kst, 1 - AL) + (Math.pow(k0, 1 - AL) - Math.pow(kst, 1 - AL)) * Math.exp(-lam * T3), 1 / (1 - AL));
      const lnyT = AL * Math.log(kT) + g * T3 + 0.18 * gauss();
      c.x = lny0 + 7.4; c.y = (100 * (lnyT - lny0)) / T3; // y in %/yr
    });
    const ss = out.map((c) => c.s).sort((a, b) => a - b);
    const q1 = ss[Math.floor(N / 3)], q2 = ss[Math.floor((2 * N) / 3)];
    out.forEach((c) => { c.grp = c.s < q1 ? 0 : c.s < q2 ? 1 : 2; });
    return out;
  })();
  function lsq(X, y) { // OLS via normal equations; X rows include the intercept
    const p = X[0].length, M = Array.from({ length: p }, () => Array(p + 1).fill(0));
    X.forEach((r, i) => { for (let a = 0; a < p; a++) { M[a][p] += r[a] * y[i]; for (let b = 0; b < p; b++) M[a][b] += r[a] * r[b]; } });
    for (let c = 0; c < p; c++) {
      let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < p; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= p; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[p] / r[i]);
  }
  /* Frisch–Waugh: residualise x and y on [1, controls]; slope of ỹ on x̃ equals the multiple-regression coefficient */
  function partial(cs, useS, useN) {
    const Z = cs.map((c) => [1].concat(useS ? [Math.log(c.s)] : [], useN ? [Math.log(c.n + 0.05)] : []));
    const res = (v) => { const b = lsq(Z, v); return v.map((vi, i) => vi - Z[i].reduce((a, z, j) => a + z * b[j], 0)); };
    const xs = cs.map((c) => c.x), ys = cs.map((c) => c.y), mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    const rx = res(xs), ry = res(ys);
    let sxy = 0, sxx = 0, syy = 0; rx.forEach((x, i) => { sxy += x * ry[i]; sxx += x * x; syy += ry[i] * ry[i]; });
    const b = sxy / sxx;
    return { px: rx.map((v) => v + mx), py: ry.map((v) => v + my), b, r2: (sxy * sxy) / (sxx * syy), mx, my };
  }

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-solow')) return;
    const s = document.createElement('style'); s.id = 'st-solow';
    s.textContent = `
.solow-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.solow-sec[hidden]{display:none}
.solow-sec h4{margin:0;font-size:14px}
.solow-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.solow-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}`;
    document.head.append(s);
  }
  const niceStep = (span, n = 5) => { const r = span / n, e = Math.pow(10, Math.floor(Math.log10(r))), m = r / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };
  const ticks = (a, b, n = 5) => { const st = niceStep(b - a, n), out = []; for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(10)); return out; };
  function polyline(g, A, xs, ys, color, w = 2, dash = null) {
    g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
    g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath(); xs.forEach((x, i) => { const X = A.X(x), Y = A.Y(ys[i]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); g.restore();
  }
  function legend(g, col, items, x, y, xMax) {
    g.font = '11px ' + (col('--body-font') || 'sans-serif'); g.textBaseline = 'middle'; g.textAlign = 'left';
    const x0 = x;
    for (const [lab, c, kind] of items) {
      if (x + 22 + g.measureText(lab).width > xMax) { x = x0; y += 15; }
      g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 2;
      if (kind === 'dot') { g.beginPath(); g.arc(x + 7, y, 3, 0, 7); g.fill(); }
      else if (kind === 'box') { g.globalAlpha = 0.3; g.fillRect(x, y - 5, 14, 10); g.globalAlpha = 1; }
      else { g.setLineDash(kind === 'dash' ? [4, 3] : []); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]); }
      g.fillStyle = col('--muted'); g.fillText(lab, x + 18, y); x += 30 + g.measureText(lab).width;
    }
    return y;
  }
  const pctIn = (v) => (v > 0 && v <= 1 ? v * 100 : v);

  CHALLENGES.solow = {
    title: '增长从哪里来',
    _m: { SD, DLQ, DLK, kStar, cStar, COUNTRIES, partial },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color, el = h.el;

      /* ================= Stage 1: growth accounting ================= */
      const stage1 = {
        title: '增长从哪里来',
        task: R`<p>1956 年，麻省理工学院。美国私人非农部门每工时的产出，从 1909 年到 1949 年翻了一番多。最自然的解释是：每个工人手里的机器和厂房更多了。可是多出来的资本到底贡献了多少？</p>
<p>下面是这 40 年的序列：每工时产出 $q = Y/L$ 与每工时资本 $k = K/L$（不变价格美元；产出按 1939 年价格）。设总量生产函数规模报酬不变，$Y = A(t)\,F(K,L)$，$A(t)$ 代表一切"同样的投入能多产出多少"的变化。竞争性市场里资本按边际产出取得报酬，所以国民收入中资本所得的份额等于产出对资本的弹性 $\alpha = \partial\ln F/\partial\ln K$；这 40 年里这个份额平均约 <b>0.35</b>。</p>
<p>用滑块画出"资本加深"能解释的那一部分，然后回答：剩下的有多大？</p>`,
        hints: [
          R`对 $Y = A\,F(K,L)$ 取对数再对时间求导，利用规模报酬不变改写成人均形式：$\dot q/q = \dot A/A + \alpha\,\dot k/k$。40 年的累计量就是对数差。`,
          R`$\Delta\ln q = \ln(1.275/0.623) \approx 0.716$，$\Delta\ln k = \ln(2.70/2.06) \approx 0.271$。资本加深的贡献是 $\alpha\,\Delta\ln k$，其余就是 $\Delta\ln A$。`,
          R`$0.35\times 0.271 \approx 0.095$，只占 $0.716$ 的约 13%；残差 $\Delta\ln A \approx 0.62$，约占 87%，平均每年约 $0.62/40 \approx 1.55\%$。`,
        ],
        answer: R`由 $\dot q/q = \dot A/A + \alpha\,\dot k/k$：$\Delta\ln q = 0.716$，资本加深 $0.35\times0.271 = 0.095$（约 13%），残差 $\Delta\ln A \approx 0.622$（约 <b>87%</b>），合每年约 <b>1.55%</b>。索洛本人用逐年的资本份额、按水平值累计：若没有技术变化，1949 年每工时产出只会是 $0.705$ 美元而不是 $1.275$，即增长的 <b>87.5%（约 7/8）</b>来自技术变化，其技术指数 $A(1949)/A(1909) = 1.809$（约 1.5%/年）。要让资本解释全部增长，需要 $\alpha = 0.716/0.271 \approx 2.6$，而份额不可能超过 1。`,
        build(body, api) {
          const S = { a: 0.35, ok1: false, ok2: false, okQ: false };
          const stg = el('div', { class: 'lab-stage' }); body.append(stg);
          const cv = h.canvas(stg, { aspect: 0.56, minH: 230, maxH: 360 });
          cv.canvas.setAttribute('aria-label', '1909–1949 年每工时产出与每工时资本的对数增长，以及 α 倍的资本增长');
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const sA = h.slider({ label: '产出对资本的弹性 α', min: 0, max: 1, step: 0.01, value: S.a, format: (v) => v.toFixed(2), onInput: (v) => { S.a = v; draw(); } });
          const bR = el('div', { class: 'ctl' }, [el('div', {}, [h.button({ label: 'α 设回资本份额 0.35', onClick: () => { S.a = 0.35; sA.set(0.35); draw(); } })])]);
          ctl.append(sA.el, bR);
          const rows = SD.filter((r) => (r[0] - 1909) % 5 === 0);
          body.append(el('div', { class: 'dtable', html: `<table><thead><tr><th>年份</th><th>q 产出/工时</th><th>k 资本/工时</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1].toFixed(3)}</td><td>${r[2].toFixed(2)}</td></tr>`).join('')}</tbody></table>` }));
          body.append(el('p', { class: 'solow-note', text: '数据：Solow (1957) 原表，美国私人非农部门，不变价格美元；图中画出全部 41 年。' }));

          const finish = () => { if (S.ok1 && S.ok2 && S.okQ) api.done(R`<b>索洛残差（1957）。</b>每工时产出增长中只有约 1/8 能由每工时资本的增加解释，约 7/8 来自生产函数本身的移动 $A(t)$，平均每年约 1.5%。资本积累不是长期增长的主要来源；"技术变化"这个当时理论里的外生量，才是。`); };
          const a1 = H.answer({
            label: R`1909→1949 年，$\ln q$ 的增长中有百分之几<b>不能</b>由 $k$ 的增长解释？（容差 80–92%）`, unit: '%', placeholder: '例如 50',
            check: (v) => {
              v = pctIn(v);
              if (v >= 80 && v <= 92) return { ok: true, msg: `对。资本加深只贡献了约 ${(100 * 0.35 * DLK / DLQ).toFixed(0)}%（α = 0.35 时）。` };
              if (v >= 8 && v <= 20) return { ok: false, msg: '这是资本加深能解释的那一份；问的是剩下的部分。' };
              if (Math.abs(v - 35) <= 2) return { ok: false, msg: '0.35 是资本份额 α 本身。' };
              if (Math.abs(v - 62) <= 3) return { ok: false, msg: '0.62 是残差的对数增长量，还要除以 Δln q。' };
              return { ok: false, msg: '先算 Δln q 和 Δln k，再看 α·Δln k 占 Δln q 的多少。' };
            },
            onOk: () => { S.ok1 = true; finish(); },
          });
          const a2 = H.answer({
            label: R`这个"残差" $A(t)$ 平均每年增长百分之几？（容差 1.35–1.70）`, unit: '% / 年', placeholder: '例如 0.5',
            check: (v) => {
              if (v > 0 && v < 0.05) v *= 100;
              if (v >= 1.35 && v <= 1.7) return { ok: true, msg: '对：每年约 1.5%。' };
              if (Math.abs(v - 1.79) <= 0.06) return { ok: false, msg: '这是每工时产出本身的年均增长；要先扣掉资本加深。' };
              if (Math.abs(v - 0.24) <= 0.05) return { ok: false, msg: '这是资本加深每年的贡献。' };
              if (v > 40) return { ok: false, msg: '是 40 年里平均每年的对数增长率（%/年）。' };
              return { ok: false, msg: '残差的对数增长量除以 40 年。' };
            },
            onOk: () => { S.ok2 = true; finish(); },
          });
          const quiz = H.quiz({
            question: '能不能把 α 调大，让资本加深解释掉全部增长？',
            options: [
              { label: '可以，α 是一个自由参数，选使拟合最好的值', ok: false, why: 'α 不是拟合参数：在竞争性要素市场里它由资本的收入份额直接测出，约 0.35。' },
              { label: R`不行：α 由资本收入份额测得；要解释全部增长需要 $\alpha = \Delta\ln q/\Delta\ln k \approx 2.6$，而份额不可能超过 1`, ok: true, why: R`对。哪怕 $\alpha = 1$（资本拿走全部收入），资本加深也只能解释 $0.271/0.716 \approx 38\%$。` },
              { label: '可以，只要去掉大萧条和战争年份', ok: false, why: '去掉哪些年份都改变不了两端：1949 年的 q 是 1909 年的两倍多，k 只多了约 31%。' },
              { label: '不行，因为 α 必须等于 1/2', ok: false, why: '没有这样的要求；α 由收入份额决定。' },
            ],
            onOk: () => { S.okQ = true; finish(); },
          });
          body.append(a1.el, a2.el, quiz.el);

          const yrs = SD.map((r) => r[0]);
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const top = W < 520 ? 42 : 28;
            const A = h.axes(g, W, Hh, { x0: 1909, x1: 1949, y0: -0.05, y1: 0.8, pad: { l: 44, r: 12, t: top, b: 34 }, xTicks: [1909, 1919, 1929, 1939, 1949], yTicks: [0, 0.2, 0.4, 0.6, 0.8], fmtY: (v) => v.toFixed(1), xLabel: '年份', yLabel: '相对 1909 年的对数增长' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.fillStyle = col('--accent'); g.globalAlpha = 0.18; g.beginPath();
            SD.forEach((r, i) => { const x = A.X(r[0]), y = A.Y(LQ(i)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
            for (let i = SD.length - 1; i >= 0; i--) g.lineTo(A.X(SD[i][0]), A.Y(S.a * LK(i)));
            g.closePath(); g.fill(); g.globalAlpha = 1; g.restore();
            polyline(g, A, yrs, SD.map((_, i) => LK(i)), col('--s2'), 1.5, [5, 4]);
            polyline(g, A, yrs, SD.map((_, i) => S.a * LK(i)), col('--s1'), 2.4);
            polyline(g, A, yrs, SD.map((_, i) => LQ(i)), col('--fg'), 1);
            g.fillStyle = col('--fg'); SD.forEach((r, i) => { g.beginPath(); g.arc(A.X(r[0]), A.Y(LQ(i)), 2.4, 0, 7); g.fill(); });
            legend(g, col, [['Δln q 产出', col('--fg'), 'dot'], ['Δln k 资本', col('--s2'), 'dash'], [`α·Δln k（α = ${S.a.toFixed(2)}）`, col('--s1'), 'line'], ['两者之差', col('--accent'), 'box']], A.p.l, 11, W - 6);
          }
          cv.onResize(draw);
          const un = watchTheme(draw);
          draw();
          return { destroy() { cv.destroy(); un(); } };
        },
      };

      /* ================= Stage 2: the model ================= */
      const stage2 = {
        title: '储蓄能带你走多远',
        task: R`<p>同一年。流行的哈罗德–多马模型假定资本–产出比固定，于是增长率等于储蓄率除以资本–产出比：多储蓄就能永远长得更快。可如果资本和劳动可以互相替代、资本的边际产出递减呢？</p>
<p>设人均生产函数 $y = f(k) = k^{\alpha}$（先不考虑技术进步），储蓄率 $s$，人口增长率 $n$，折旧率 $\delta$，取 $n + \delta = 0.06$。每个工人的资本按</p>
$$\dot k = s\,f(k) - (n+\delta)\,k$$
<p>变化：新增投资减去被新人口"摊薄"和被磨损的部分。下图画出这两项。三个问题依次解锁：资本最终停在哪里？把储蓄率从 0.20 提到 0.30 会怎样？储蓄率多高时，人们长期能<b>消费</b>的最多？</p>`,
        hints: [
          R`$\dot k = 0$ 时 $s\,k^{\alpha} = (n+\delta)\,k$，解出 $k^* = \big(s/(n+\delta)\big)^{1/(1-\alpha)}$。$k\lt k^*$ 时 $\dot k\gt 0$，$k\gt k^*$ 时 $\dot k\lt 0$，所以 $k^*$ 是吸引子。`,
          R`$y^* = (k^*)^{\alpha} = \big(s/(n+\delta)\big)^{\alpha/(1-\alpha)}$。$s$ 从 0.20 到 0.30，$y^*$ 乘以 $1.5^{\alpha/(1-\alpha)} = 1.5^{1/2}$。到达新稳态后 $k$ 不再变，$y$ 也不再增长。`,
          R`稳态消费 $c^* = (1-s)\,y^* = f(k^*) - (n+\delta)k^*$。对 $s$ 求导：$\frac{d\ln c^*}{ds} = -\frac{1}{1-s} + \frac{\alpha}{(1-\alpha)s} = 0 \Rightarrow s = \alpha$。`,
        ],
        answer: R`(1) $k^* = (0.20/0.06)^{3/2} \approx 6.09$，$y^* \approx 1.83$。(2) $y^*$ 提高 $1.5^{1/2} - 1 \approx 22.5\%$；过渡期人均增长率先跳到约 $\alpha\cdot 0.1\cdot 0.06/0.2 = 1\%$/年，再按 $e^{-\lambda t}$ 衰减（$\lambda = (1-\alpha)(n+\delta) = 4\%$/年），长期增长率回到 0：储蓄率只有<b>水平效应</b>，没有增长效应。(3) $c^* = f(k^*) - (n+\delta)k^*$ 在 $f'(k_G) = n+\delta$ 处最大；柯布–道格拉斯情形 $f'(k)k/f(k) = \alpha$，而稳态 $(n+\delta)k/f(k) = s$，所以<b>黄金律储蓄率 $s_G = \alpha$</b>；$\alpha = 0.40$ 时 $s_G = 0.40$。`,
        build(body, api) {
          const S = { s: 0.2, a: 1 / 3, step: 0, run: null, p: 0, okLvl: false, okGr: false, okSG: false, okRule: false, visited: new Map() };
          const stg = el('div', { class: 'lab-stage' }); body.append(stg);
          const cv = h.canvas(stg, { aspect: 0.6, minH: 230, maxH: 360 });
          cv.canvas.setAttribute('aria-label', '相图：储蓄曲线 s·f(k) 与持平线 (n+δ)k');
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const sS = h.slider({ label: '储蓄率 s', min: 0.02, max: 0.8, step: 0.01, value: S.s, format: (v) => v.toFixed(2), onInput: (v) => { S.s = v; visit(); draw(); } });
          const cA = h.choice({ label: '资本份额 α', value: S.a, options: [{ value: 0.25, label: '0.25' }, { value: 1 / 3, label: '1/3' }, { value: 0.4, label: '0.40' }, { value: 0.5, label: '0.50' }], onChange: (v) => { S.a = v; visit(); draw(); } });
          ctl.append(sS.el);
          const roW = el('div', { class: 'lab-readout' });
          const ro = { a: h.readout('参数'), k: h.readout('稳态 k*'), c: h.readout('稳态消费 c* = (1−s) f(k*)') };
          roW.append(ro.a.el); body.append(roW);

          // Step A
          const aK = H.answer({
            label: R`$s = 0.20$、$\alpha = 1/3$、$n+\delta = 0.06$ 时，资本最终停在 $k^* = $ ?（容差 ±4%）`, placeholder: 'k*',
            check: (v) => {
              const t = kStar(0.2, 1 / 3);
              if (Math.abs(v / t - 1) <= 0.04) return { ok: true, msg: R`对：$k^* = (0.2/0.06)^{3/2} \approx 6.09$。` };
              if (Math.abs(v - 1.826) < 0.08) return { ok: false, msg: '这是稳态的人均产出 y*，问的是 k*。' };
              if (Math.abs(v - 3.333) < 0.1) return { ok: false, msg: '这是 s/(n+δ)，还要取 1/(1−α) 次方。' };
              return { ok: false, msg: '在交点处 s·f(k) = (n+δ)k。' };
            },
            onOk: () => { if (S.step < 1) { S.step = 1; roW.append(ro.k.el); secB.hidden = false; api.typeset(secB); draw(); } },
          });
          body.append(aK.el);

          // Step B: saving experiment
          const secB = el('div', { class: 'solow-sec', hidden: true });
          secB.append(el('h4', { text: '实验：提高储蓄率' }), el('p', { class: 'solow-note', html: R`经济原本停在 $s = 0.20$ 的稳态。第 50 年起储蓄率永久提高到 0.30（$\alpha = 1/3$，$n+\delta = 0.06$）。看人均产出和它的增长率在 200 年里怎么走。` }));
          const bRun = h.button({ label: '运行：第 50 年 s 0.20 → 0.30', kind: 'primary', onClick: () => runExp() });
          secB.append(el('div', { class: 'solow-row' }, [bRun]));
          const tStage = el('div', { class: 'lab-stage' }); secB.append(tStage);
          const cvT = h.canvas(tStage, { aspect: 0.62, minH: 240, maxH: 360 });
          cvT.canvas.setAttribute('aria-label', '人均产出对数与增长率的时间路径');
          const expBox = el('div', { class: 'solow-sec', hidden: true });
          const aL = H.answer({
            label: '新稳态的人均产出 y* 比原来高百分之几？（容差 20–24.5%）', unit: '%', placeholder: '例如 10',
            check: (v) => {
              if (v > 0 && v < 1) v *= 100;
              if (v >= 20 && v <= 24.5) return { ok: true, msg: R`对：$1.5^{1/2} - 1 \approx 22.5\%$（对数差 0.203）。储蓄率提高 50%，产出只高 22%：弹性是 $\alpha/(1-\alpha) = 1/2$。` };
              if (Math.abs(v - 50) <= 3) return { ok: false, msg: '这是储蓄率本身提高的比例；y* 对 s 的弹性小于 1。' };
              if (Math.abs(v - 83.7) <= 4) return { ok: false, msg: '这是 k* 的变化（1.5^{3/2}），问的是 y*。' };
              return { ok: false, msg: '比较 y* = (s/(n+δ))^{α/(1−α)} 在两个 s 下的比值。' };
            },
            onOk: () => { S.okLvl = true; finishB(); },
          });
          const qG = H.quiz({
            question: '几百年后，人均产出的<b>增长率</b>与提高储蓄之前相比：',
            options: [
              { label: '永久更高：多储蓄就多增长', ok: false, why: '看下面那条增长率曲线：跳起之后一路衰减回到 0。' },
              { label: '回到原来的水平（这里是 0）；被永久抬高的只是人均产出的<b>水平</b>', ok: true, why: '对。资本边际产出递减：k 越大，同样的储蓄率带来的新增资本越不够弥补摊薄与折旧，最终停下。' },
              { label: '永久更低，因为消费减少了', ok: false, why: '增长率最终回到原值，不会更低。' },
              { label: '一直振荡，不收敛', ok: false, why: '一维的 k 动力学单调地趋向 k*，不会振荡。' },
            ],
            onOk: () => { S.okGr = true; finishB(); },
          });
          expBox.append(aL.el, qG.el); secB.append(expBox);
          body.append(secB);
          function finishB() {
            if (S.okLvl && S.okGr && S.step < 2) {
              S.step = 2; roW.append(ro.c.el); ctl.append(cA.el); secC.hidden = false; api.typeset(secC); visit(); draw();
              api.say('储蓄率只有水平效应。最后一个问题：储蓄当然不是越多越好——储下来的就不能吃掉。', 'info');
            }
          }

          // Step C: golden rule
          const secC = el('div', { class: 'solow-sec', hidden: true });
          secC.append(el('h4', { text: '为消费而储蓄' }), el('p', { class: 'solow-note', html: R`储蓄只是手段，长期能消费的是 $c^* = (1-s)\,f(k^*)$，即相图中 $k^*$ 处 $f$ 与持平线之间的竖直距离。现在可以换 $\alpha$。拖动 $s$，你扫过的每个点都会记在下图里。` }));
          const cStg = el('div', { class: 'lab-stage' }); secC.append(cStg);
          const cvC = h.canvas(cStg, { aspect: 0.42, minH: 170, maxH: 240 });
          cvC.canvas.setAttribute('aria-label', '你扫过的储蓄率与稳态消费');
          const aSG = H.answer({
            label: R`$\alpha = 0.40$ 时，让稳态消费 $c^*$ 最大的储蓄率 $s_G = $ ?（容差 ±0.02）`, placeholder: 's',
            check: (v) => {
              if (Math.abs(v - 0.4) <= 0.02) return { ok: true, msg: '对。' };
              if (Math.abs(v - 1 / 3) <= 0.02) return { ok: false, msg: '这是 α = 1/3 时的答案；把 α 换成 0.40 再扫一遍。' };
              if (v > 0.6) return { ok: false, msg: '储得太多：稳态资本很大，但大部分产出被用来维持它。' };
              return { ok: false, msg: '把 α 设为 0.40，拖动 s，盯着 c* 的读数找最大。' };
            },
            onOk: () => { S.okSG = true; finishC(); },
          });
          const qR = H.quiz({
            question: R`对 $f(k) = k^{\alpha}$，你猜一般地黄金律储蓄率 $s_G$ 是多少？（换几个 α 验证）`,
            options: [
              { label: R`$s_G = \alpha$`, ok: true, why: R`对：$c^* = f(k) - (n+\delta)k$ 在 $f'(k_G) = n+\delta$ 处最大；而稳态 $s = (n+\delta)k/f(k) = f'(k)k/f(k) = \alpha$。` },
              { label: R`$s_G = 1 - \alpha$`, ok: false, why: '把 α 换成 0.25 试试：峰在 0.25，不在 0.75。' },
              { label: R`$s_G = n + \delta$`, ok: false, why: 'n + δ 决定的是黄金律资本的边际产出 f′(k_G)，不是储蓄率。' },
              { label: R`$s_G = 1/2$，与 α 无关`, ok: false, why: '换 α，峰的位置跟着移动。' },
            ],
            onOk: () => { S.okRule = true; finishC(); },
          });
          secC.append(aSG.el, qR.el); body.append(secC);
          function finishC() {
            if (S.okSG && S.okRule) api.done(R`<b>索洛模型（1956）与黄金律（Phelps 1961）。</b>资本边际产出递减使经济收敛到唯一的稳态 $k^*$：储蓄率决定人均产出的<b>水平</b>，长期人均增长只能来自技术进步。储蓄也不是越多越好：使稳态消费最大的储蓄率满足 $f'(k_G) = n+\delta$，柯布–道格拉斯情形即 $s_G = \alpha$；储蓄超过它的经济"动态无效率"。`);
          }

          function visit() {
            if (S.step < 2) return;
            const key = S.a.toFixed(4); if (!S.visited.has(key)) S.visited.set(key, new Map());
            S.visited.get(key).set(S.s.toFixed(2), cStar(S.s, S.a));
          }
          function runExp() {
            S.run = (() => { // RK4 on k with s(t), α = 1/3
              const a = 1 / 3, dt = 0.25, out = { t: [], ly: [], gy: [] }, f = (k, s) => s * Math.pow(k, a) - ND * k;
              let k = kStar(0.2, a); const ly0 = a * Math.log(k);
              for (let t = 0; t <= 200 + 1e-9; t += dt) {
                const s = t < 50 ? 0.2 : 0.3, kd = f(k, s);
                out.t.push(t); out.ly.push(a * Math.log(k) - ly0); out.gy.push((100 * a * kd) / k);
                const k1 = f(k, s), k2 = f(k + (dt / 2) * k1, s), k3 = f(k + (dt / 2) * k2, s), k4 = f(k + dt * k3, s);
                k += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
              }
              return out;
            })();
            S.p = ctx.reduced ? 1 : 0;
            if (!ctx.reduced) lp.start(); else drawT();
            expBox.hidden = false; api.typeset(expBox);
          }
          const lp = h.loop((dt) => { S.p = Math.min(1, S.p + dt / 2.2); drawT(); if (S.p >= 1) lp.stop(); });

          function draw() { drawPhase(); drawC(); readouts(); }
          function readouts() {
            const a = S.step >= 2 ? S.a : 1 / 3;
            ro.a.set(`α = ${a === 1 / 3 ? '1/3' : a.toFixed(2)}，n + δ = 0.06`);
            ro.k.set(`${kStar(S.s, a).toFixed(3)}（s = ${S.s.toFixed(2)}）`);
            ro.c.set(cStar(S.s, a).toFixed(4));
          }
          function drawPhase() {
            const g = cv.g, W = cv.w, Hh = cv.h, gold = S.step >= 2, a = gold ? S.a : 1 / 3, s = S.s, ks = kStar(s, a);
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            // fixed axes (so moving s visibly moves k*), widened only when k* would leave the frame
            const kmax = gold ? Math.max(2 * kStar(a, a), 1.2 * ks) : Math.max(18, 1.25 * ks);
            const ymax = 1.08 * (gold ? Math.max(Math.pow(kmax, a), ND * kmax) : Math.max(s * Math.pow(kmax, a), ND * kmax));
            const A = h.axes(g, W, Hh, { x0: 0, x1: kmax, y0: 0, y1: ymax, pad: { l: 44, r: 12, t: W < 520 ? 40 : 26, b: 34 }, xTicks: ticks(0, kmax), yTicks: ticks(0, ymax, 4), fmtX: (v) => String(+v.toFixed(2)), fmtY: (v) => String(+v.toFixed(2)), xLabel: '每个工人的资本 k', yLabel: '每个工人' }, col);
            const N = 200, ks_ = Array.from({ length: N + 1 }, (_, i) => (kmax * i) / N);
            if (gold) polyline(g, A, ks_, ks_.map((k) => Math.pow(k, a)), col('--muted'), 1.3, [4, 3]);
            polyline(g, A, ks_, ks_.map((k) => s * Math.pow(k, a)), col('--s1'), 2.4);
            polyline(g, A, ks_, ks_.map((k) => ND * k), col('--s2'), 2);
            const ys = Math.pow(ks, a);
            if (S.step >= 2) { // consumption gap at k*
              g.strokeStyle = col('--good'); g.lineWidth = 3; g.beginPath(); g.moveTo(A.X(ks), A.Y(ND * ks)); g.lineTo(A.X(ks), A.Y(ys)); g.stroke();
              g.fillStyle = col('--good'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'middle';
              g.fillText('c*', A.X(ks) - 5, A.Y((ys + ND * ks) / 2));
            }
            g.strokeStyle = col('--muted'); g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(A.X(ks), A.Y(ND * ks)); g.lineTo(A.X(ks), A.Y(0)); g.stroke(); g.setLineDash([]);
            g.fillStyle = col('--accent'); g.strokeStyle = col('--panel'); g.lineWidth = 2; g.beginPath(); g.arc(A.X(ks), A.Y(ND * ks), 5, 0, 7); g.fill(); g.stroke();
            // direction arrows on the k axis
            g.fillStyle = col('--accent'); const yA = A.Y(0) - 7;
            [0.35, 0.7, 1.25, 1.5].forEach((m) => { const k = ks * m; if (k > kmax * 0.97) return; const x = A.X(k), d = m < 1 ? 1 : -1; g.beginPath(); g.moveTo(x + 6 * d, yA); g.lineTo(x - 3 * d, yA - 4); g.lineTo(x - 3 * d, yA + 4); g.closePath(); g.fill(); });
            g.font = '11px ' + col('--mono-font'); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = col('--accent');
            g.fillText(S.step >= 1 ? `k* = ${ks.toFixed(2)}` : 'k*', A.X(ks), A.Y(0) - 13);
            legend(g, col, [gold ? ['f(k)', col('--muted'), 'dash'] : null, [`s·f(k)  (s = ${s.toFixed(2)})`, col('--s1'), 'line'], ['(n+δ)·k', col('--s2'), 'line']].filter(Boolean), A.p.l, 11, W - 6);
          }
          function drawT() {
            const g = cvT.g, W = cvT.w, Hh = cvT.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const half = Math.floor(Hh * 0.55), pad = { l: 46, r: 12, t: 12, b: 26 };
            const A1 = h.axes(g, W, half, { x0: 0, x1: 200, y0: -0.02, y1: 0.25, pad, xTicks: [0, 50, 100, 150, 200], yTicks: [0, 0.1, 0.2], fmtY: (v) => v.toFixed(1), yLabel: 'ln(y/y₀*)' }, col);
            g.save(); g.translate(0, half);
            const A2 = h.axes(g, W, Hh - half, { x0: 0, x1: 200, y0: -0.1, y1: 1.2, pad: { l: 46, r: 12, t: 8, b: 32 }, xTicks: [0, 50, 100, 150, 200], yTicks: [0, 0.5, 1], fmtY: (v) => v.toFixed(1), xLabel: '年', yLabel: '增长率 %/年' }, col);
            g.restore();
            if (!S.run) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('按上面的按钮运行实验', A1.p.l + A1.iw / 2, A1.p.t + A1.ih / 2); return;
            }
            const n = Math.max(2, Math.floor(S.run.t.length * S.p));
            const ts = S.run.t.slice(0, n);
            g.strokeStyle = col('--muted'); g.setLineDash([3, 3]); g.lineWidth = 1;
            g.beginPath(); g.moveTo(A1.X(50), A1.p.t); g.lineTo(A1.X(50), A1.p.t + A1.ih); g.stroke(); g.setLineDash([]);
            polyline(g, A1, ts, S.run.ly.slice(0, n), col('--s1'), 2.2);
            g.save(); g.translate(0, half); polyline(g, A2, ts, S.run.gy.slice(0, n), col('--s3'), 2.2); g.restore();
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('s → 0.30', A1.X(50) + 4, A1.p.t + 2);
          }
          function drawC() {
            if (S.step < 2) return;
            const g = cvC.g, W = cvC.w, Hh = cvC.h, a = S.a, cG = cStar(a, a);
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 0.8, y0: 0, y1: cG * 1.2, pad: { l: 44, r: 12, t: 12, b: 32 }, xTicks: [0, 0.2, 0.4, 0.6, 0.8], yTicks: ticks(0, cG * 1.2, 3), fmtX: (v) => v.toFixed(1), fmtY: (v) => String(+v.toFixed(2)), xLabel: '储蓄率 s', yLabel: 'c*' }, col);
            const pts = S.visited.get(a.toFixed(4)) || new Map();
            g.fillStyle = col('--good');
            pts.forEach((c, sk) => { g.beginPath(); g.arc(A.X(+sk), A.Y(c), 2.6, 0, 7); g.fill(); });
            g.strokeStyle = col('--accent'); g.lineWidth = 2; g.beginPath(); g.arc(A.X(S.s), A.Y(cStar(S.s, a)), 5.5, 0, 7); g.stroke();
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'right'; g.textBaseline = 'top';
            g.fillText(`α = ${a === 1 / 3 ? '1/3' : a.toFixed(2)}`, A.p.l + A.iw - 4, A.p.t + 4);
          }
          cv.onResize(drawPhase); cvT.onResize(drawT); cvC.onResize(drawC);
          const un = watchTheme(() => { draw(); drawT(); });
          draw(); drawT();
          return { destroy() { lp.stop(); cv.destroy(); cvT.destroy(); cvC.destroy(); un(); } };
        },
      };

      /* ================= Stage 3: convergence ================= */
      const stage3 = {
        title: '穷国追得上吗',
        task: R`<p>1990 年前后。Summers 与 Heston 把一百多个国家的收入换算成可比的购买力，增长理论第一次能在世界范围内检验。上一关的模型说：资本越少，资本的边际产出越高，所以穷国似乎应该长得更快。</p>
<p>下面是 90 个国家 1960–1985 年的数据（<b>模拟数据，示意</b>，按 Mankiw–Romer–Weil 1992 的结构生成）：横轴是 1960 年人均产出的对数，纵轴是之后 25 年人均产出的年均增长率；每个国家还有自己的投资率 $s$ 和人口增长率 $n$。颜色按投资率分为三档。</p>
<p>穷国真的长得更快吗？如果不是，是模型错了，还是问题问错了？</p>`,
        hints: [
          '先看原始散点和斜率：几乎没有负相关。再看颜色：投资率低的国家集中在左边。它们的"终点"（稳态）本来就低。',
          R`打开两个"控制"开关。横纵轴都换成扣掉 $\ln s$ 与 $\ln(n+g+\delta)$ 的线性影响之后的残差（Frisch–Waugh 定理：这时的斜率就是多元回归里 $\ln y_{1960}$ 的系数）。它回答的是：稳态相同的条件下，起点穷一些会多长多少。`,
          R`在稳态附近 $\ln y(T) - \ln y^* = e^{-\lambda T}\big(\ln y(0) - \ln y^*\big)$，所以 $T$ 年平均增长率对 $\ln y(0)$ 的系数为 $b = -(1-e^{-\lambda T})/T$。注意斜率读数的单位是 %/年，即 $b = $ 读数/100；$\lambda = -\ln(1+bT)/T$。`,
        ],
        answer: R`未加控制时斜率约 $+0.55$（%/年 每单位 $\ln y$），穷国并不更快：这就是"绝对收敛"在全球数据里的失败。控制 $\ln s$ 与 $\ln(n+g+\delta)$ 后斜率变为约 $-1.74$，即 $b \approx -0.0174$。由 $b = -(1-e^{-\lambda T})/T$、$T = 25$：$1 + bT \approx 0.565$，$\lambda = -\ln 0.565/25 \approx 2.3\%$/年，半衰期 $\ln 2/\lambda \approx 30$ 年。这是<b>条件收敛</b>：各国收敛到<b>各自</b>的稳态。注意教科书模型取 $\alpha = 1/3$ 会预言 $\lambda = (1-\alpha)(n+g+\delta) \approx 4.7\%$；实际约 2% 要求更大的"广义资本"份额（约 2/3），这正是 MRW 加入人力资本的理由。`,
        build(body, api) {
          const S = { cs: false, cn: false, seen: false, okQ: false, okL: false };
          const stg = el('div', { class: 'lab-stage' }); body.append(stg);
          const cv = h.canvas(stg, { aspect: 0.62, minH: 240, maxH: 380 });
          cv.canvas.setAttribute('aria-label', '各国 1960 年人均产出对数与 1960–1985 年均增长率的散点图');
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const tS = h.toggle({ label: R`控制投资率 ln s`, onChange: (b) => { S.cs = b; draw(); } });
          const tN = h.toggle({ label: '控制 ln(n + g + δ)', onChange: (b) => { S.cn = b; draw(); } });
          ctl.append(tS.el, tN.el);
          const roW = el('div', { class: 'lab-readout' });
          const ro = { m: h.readout('当前横纵轴'), b: h.readout('OLS 斜率（%/年 每单位 ln y）'), r: h.readout('R²') };
          Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);
          const finish = () => { if (S.okQ && S.okL) api.done(R`<b>条件收敛（Barro 1991；Mankiw–Romer–Weil 1992）。</b>索洛模型并不预言穷国一定追上富国：每个国家收敛到由自己的 $s$、$n$、技术决定的稳态。控制了这些之后，离稳态越远长得越快，速度约每年 2%（半衰期约 30 年）。`); };
          const quiz = H.quiz({
            question: '不加任何控制时，数据说明了什么？',
            options: [
              { label: '穷国明显长得更快，世界正在收敛', ok: false, why: '看斜率：不加控制时它是正的，穷国并不更快。' },
              { label: '穷国并不比富国长得快（斜率略为正）；这本身还不能否定模型', ok: true, why: '对。模型只说"离自己的稳态越远长得越快"，而穷国的稳态（低投资、高人口增长）本来就低。' },
              { label: '富国长得更快，所以资本边际产出递减的假设被否定了', ok: false, why: '结论跳得太快：原始数据把"稳态不同"和"离稳态远近"混在一起了。' },
              { label: '增长率与收入无关，增长纯属随机', ok: false, why: '颜色已经提示了：投资率高的国家系统地长得更快。' },
            ],
            onOk: () => { S.okQ = true; finish(); },
          });
          const aL = H.answer({
            label: R`控制 $s$ 与 $n$ 之后，由斜率推出各国向自身稳态收敛的速度 $\lambda$（离稳态的对数距离按 $e^{-\lambda t}$ 衰减；$T = 25$ 年；容差 1.9–2.8）`, unit: '% / 年', placeholder: '例如 1',
            check: (v) => {
              if (!S.seen) return { ok: false, msg: '先把两个控制开关都打开，读出那时的斜率。' };
              if (v > 0 && v < 0.1) v *= 100;
              if (v >= 1.9 && v <= 2.8) return { ok: true, msg: `对：λ ≈ ${(100 * -Math.log(1 + (partial(COUNTRIES, true, true).b / 100) * T3) / T3).toFixed(2)}%/年，半衰期约 30 年。` };
              if (v < 0) return { ok: false, msg: '负的 λ 意味着发散：你用的是未加控制的斜率吗？' };
              if (Math.abs(v - 1.74) <= 0.12) return { ok: false, msg: '这是 −b 本身。b 与 λ 的关系是非线性的：b = −(1 − e^{−λT})/T。' };
              if (v > 2.8 && v < 6) return { ok: false, msg: '偏大。检查两个控制都打开了，并注意 b = 读数/100。' };
              return { ok: false, msg: '两个控制都打开后读出斜率 b，再解 b = −(1 − e^{−λT})/T。' };
            },
            onOk: () => { S.okL = true; finish(); },
          });
          body.append(quiz.el, aL.el);

          const GC = ['--s3', '--s2', '--s1'];
          function draw() {
            if (S.cs && S.cn) S.seen = true;
            const P = partial(COUNTRIES, S.cs, S.cn);
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const xs = P.px, ys = P.py;
            const x0 = Math.floor(Math.min(...xs) - 0.2), x1 = Math.ceil(Math.max(...xs) + 0.2), y0 = Math.floor(Math.min(...ys) - 0.4), y1 = Math.ceil(Math.max(...ys) + 0.4);
            const ctrl = S.cs || S.cn;
            const A = h.axes(g, W, Hh, { x0, x1, y0, y1, pad: { l: 44, r: 12, t: W < 520 ? 40 : 26, b: 34 }, xTicks: ticks(x0, x1), yTicks: ticks(y0, y1), fmtX: (v) => String(+v.toFixed(1)), fmtY: (v) => String(+v.toFixed(1)), xLabel: ctrl ? 'ln y₁₉₆₀（扣除控制变量后 + 均值）' : 'ln y₁₉₆₀', yLabel: ctrl ? '增长率残差 + 均值 (%/年)' : '1960–85 年均增长 (%/年)' }, col);
            COUNTRIES.forEach((c, i) => { g.fillStyle = col(GC[c.grp]); g.globalAlpha = 0.85; g.beginPath(); g.arc(A.X(xs[i]), A.Y(ys[i]), 3.4, 0, 7); g.fill(); });
            g.globalAlpha = 1;
            const lineY = (x) => P.my + P.b * (x - P.mx);
            polyline(g, A, [x0, x1], [lineY(x0), lineY(x1)], col('--fg'), 2);
            legend(g, col, [['投资率低', col(GC[0]), 'dot'], ['中', col(GC[1]), 'dot'], ['高', col(GC[2]), 'dot'], ['OLS', col('--fg'), 'line']], A.p.l, 11, W - 6);
            ro.m.set(ctrl ? `控制：${[S.cs ? 'ln s' : null, S.cn ? 'ln(n+g+δ)' : null].filter(Boolean).join(' + ')}` : '原始数据');
            ro.b.set((P.b >= 0 ? '+' : '') + P.b.toFixed(3));
            ro.r.set((ctrl ? '偏 R² ' : '') + P.r2.toFixed(2));
          }
          cv.onResize(draw);
          const un = watchTheme(draw);
          draw();
          return { destroy() { cv.destroy(); un(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
