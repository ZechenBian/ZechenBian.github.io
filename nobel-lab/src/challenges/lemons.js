/* 看不见的质量 — challenge for Economic Sciences 2001 (Akerlof, Spence, Stiglitz: markets with asymmetric information)
 * Stage 1 (Akerlof 1970): 200 cars, θ evenly spaced on [0,1] ((i + ½)/200); seller values θ, buyers value vθ (v = 1.5).
 *   At price p the cars offered are {θ ≤ p}; E[θ | θ ≤ p] = p/2, so buyers will pay v·p/2 = 0.75p < p: unravels.
 *   Cobweb p_{k+1} = v·E[θ | θ ≤ p_k] → 0. The market survives (p = 1 sustainable) iff v ≥ 2.
 * Stage 2 (Spence 1973): productivity y_L = 1, y_H = 2; education cost c_L(e) = e, c_H(e) = e/2; no effect on output.
 *   Belief "e ≥ e* ⇒ H": L stays at e = 0 iff 1 ≥ 2 − e* (e* ≥ 1); H goes to e* iff 2 − (e*)/2 ≥ 1 (e* ≤ 2).
 *   Least-cost e* = 1 gives H 1.5; with no signal everyone earns 1 + λ ⇒ H prefers a ban iff λ > 1/2.
 * Stage 3 (Rothschild–Stiglitz 1976): W = 100, loss d = 80, p_H = 0.5, p_L = 0.25, u = ln c, half of each type.
 *   H: full cover at fair premium 40 → (60, 60). L on its fair line P = q/4: IC binds where
 *   (100 − q/4)(20 + 3q/4) = 3600 ⇒ q* = (70 − √3700)/0.375 = 24.46. Pooled full cover at P = 30 → (70, 70) is
 *   broken by cream skimming (e.g. q = 60, P = 20: L switches, H does not, profit 5 per policy).
 */
(() => {
  const R = String.raw;
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- Stage 1: cars ---------- */
  const CARS = (() => { const rnd = mulberry32(1970), N = 200, a = []; for (let i = 0; i < N; i++) a.push({ t: (i + 0.5) / N, y: rnd() }); return a; })();
  const offered = (p) => CARS.filter((c) => c.t <= p);
  const avgQ = (p) => { const o = offered(p); return o.length ? o.reduce((s, c) => s + c.t, 0) / o.length : 0; };
  function cobweb(p0, v, n = 30) { const out = [p0]; let p = p0; for (let k = 0; k < n; k++) { const q = v * avgQ(p); out.push(q); if (q < 0.008 || Math.abs(q - p) < 1e-6) break; p = q; } return out; }

  /* ---------- Stage 3: insurance ---------- */
  const W = 100, D = 80, PH = 0.5, PL = 0.25;
  const EU = (p, q, P) => (1 - p) * Math.log(W - P) + p * Math.log(W - D + q - P);
  const QSTAR = (70 - Math.sqrt(3700)) / 0.375;
  const POOL = { q: 80, P: 30 };

  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-lemons')) return;
    const s = document.createElement('style'); s.id = 'st-lemons';
    s.textContent = `
.lemons-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.lemons-sec[hidden]{display:none}
.lemons-sec h4{margin:0;font-size:14px}
.lemons-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.lemons-hide{display:none !important}`;
    document.head.append(s);
  }
  function legend(g, col, items, x, y, xMax) {
    g.font = '11px ' + (col('--body-font') || 'sans-serif'); g.textBaseline = 'middle'; g.textAlign = 'left'; const x0 = x;
    for (const [lab, c, kind] of items) {
      if (x + 22 + g.measureText(lab).width > xMax) { x = x0; y += 15; }
      g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 2;
      if (kind === 'dot') { g.beginPath(); g.arc(x + 7, y, 3.2, 0, 7); g.fill(); }
      else { g.setLineDash(kind === 'dash' ? [4, 3] : []); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]); }
      g.fillStyle = col('--muted'); g.fillText(lab, x + 18, y); x += 30 + g.measureText(lab).width;
    }
  }
  function fcurve(g, A, x0, x1, f, color, w = 2, dash = null) {
    g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
    g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash); g.beginPath(); let first = true;
    for (let i = 0; i <= 240; i++) { const x = x0 + ((x1 - x0) * i) / 240, y = f(x); if (!isFinite(y)) { first = true; continue; } const Y = Math.max(A.p.t - 50, Math.min(A.p.t + A.ih + 50, A.Y(y))); first ? g.moveTo(A.X(x), Y) : g.lineTo(A.X(x), Y); first = false; }
    g.stroke(); g.restore();
  }
  function dot(g, x, y, r, fill, stroke) { g.beginPath(); g.arc(x, y, r, 0, 7); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } }
  function tag(g, col, text, x, y, color, align = 'left') {
    g.font = '11px ' + (col('--mono-font') || 'monospace'); const w = g.measureText(text).width + 6;
    const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    g.fillStyle = col('--panel'); g.globalAlpha = 0.85; g.fillRect(x0, y - 8, w, 16); g.globalAlpha = 1;
    g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x0 + 3, y);
  }

  CHALLENGES.lemons = {
    title: '看不见的质量',
    _m: { CARS, avgQ, cobweb, EU, QSTAR, POOL },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h, col = ctx.color, el = h.el;

      /* ================= Stage 1: used cars ================= */
      const stage1 = {
        title: '旧车市场',
        task: R`<p>伯克利，1966 年。美国新车卖出去才几个月，转手价就大幅下跌，教科书只能归因于"新车光环"。你想换个解释：卖旧车的人知道自己的车好不好，买车的人不知道。</p>
<p>一个简化的市场（示意）：200 辆旧车，质量 $\theta$ 在 $[0,1]$ 上均匀分布（单位：万元）。卖家知道自己车的 $\theta$，留着自用值 $\theta$；买家多得很，一辆质量为 $\theta$ 的车对他们值 $1.5\,\theta$。所以<b>每一辆车</b>从卖家转到买家手里都会产生价值。可是买家看不出单辆车的 $\theta$，只知道市场上在卖的车整体是什么样。</p>
<p>你来定一个统一的成交价 $p$，看哪些车会被拿出来卖、买家愿意出多少。然后放开价格，让买家每一轮都按上一轮在售车的平均质量出价。</p>`,
        hints: [
          R`价格为 $p$ 时，只有 $\theta \le p$ 的卖家愿意卖。在售车的质量在 $[0,p]$ 上仍是均匀的，平均是多少？`,
          R`$E[\theta \mid \theta\le p] = p/2$，买家愿付 $1.5\times p/2 = 0.75\,p$，永远低于 $p$。价格一降，好车又退出一批，平均质量再降……`,
          R`若买家估值是 $v\theta$，愿付 $v\,p/2$；要在 $p = 1$（所有车都卖）时成立需要 $v/2 \ge 1$。`,
        ],
        answer: R`价格为 $p$ 时在售车是 $\theta\le p$ 的那些，平均质量 $p/2$，买家愿付 $1.5\cdot p/2 = 0.75p\lt p$：<b>比值是 0.75</b>，与 $p$ 无关。买家把价格压到 $0.75p$，质量最好的那部分车退出，平均质量又降，价格按 $0.75^k$ 收敛到 0：没有一辆车成交，尽管每笔交易都本可以创造价值。一般地，买家估值为 $v\theta$ 时愿付 $vp/2$，价格 $p=1$ 维持的条件是 $v\ge 2$：<b>买家必须把车看得比卖家贵一倍以上</b>，市场才不会崩溃。`,
        build(body, api) {
          const S = { p: 0.8, v: 1.5, web: null, k: 0, ran: false, ok1: false, ok2: false };
          const stg = el('div', { class: 'lab-stage' }); body.append(stg);
          const cvA = h.canvas(stg, { aspect: 0.2, minH: 96, maxH: 130 });
          const cvB = h.canvas(stg, { aspect: 0.55, minH: 220, maxH: 340 });
          cvA.canvas.setAttribute('aria-label', '200 辆车按质量排开：在售的高亮，退出的变灰');
          cvB.canvas.setAttribute('aria-label', '价格与买家愿付价格的关系，以及逐轮调价的轨迹');
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const sP = h.slider({ label: '统一成交价 p（万元）', min: 0.02, max: 1, step: 0.01, value: S.p, format: (v) => v.toFixed(2), onInput: (v) => { S.p = v; S.web = null; lp.stop(); draw(); } });
          const sV = h.slider({ label: '买家估值倍数 v', min: 1, max: 3, step: 0.05, value: S.v, format: (v) => v.toFixed(2), onInput: (v) => { S.v = v; S.web = null; lp.stop(); draw(); } });
          sV.el.classList.add('lemons-hide');
          const bRun = h.button({ label: '放开价格：逐轮按平均质量出价', kind: 'primary', onClick: () => run() });
          ctl.append(sP.el, sV.el, el('div', { class: 'ctl' }, [el('div', {}, [bRun])]));
          const roW = el('div', { class: 'lab-readout' });
          const ro = { n: h.readout('拿出来卖的车'), e: h.readout('在售车平均质量'), w: h.readout('买家愿付 = v × 平均质量'), r: h.readout('结果') };
          Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);

          const a1 = H.answer({
            label: R`任取几个价格：买家愿付的价格是你所开价格 $p$ 的几倍？（容差 0.72–0.78）`, placeholder: '倍数',
            check: (v) => {
              if (v >= 0.72 && v <= 0.78) return { ok: true, msg: '对：不论 p 是多少，都是 0.75 倍。' };
              if (Math.abs(v - 1.5) < 0.05) return { ok: false, msg: '1.5 是买家对<b>单辆</b>车的估值倍数；问的是对在售的这一批车平均愿付多少。' };
              if (Math.abs(v - 0.5) < 0.04) return { ok: false, msg: '0.5 是在售平均质量与价格之比；买家还要乘以 1.5。' };
              return { ok: false, msg: '读出"买家愿付"，除以你的价格 p。' };
            },
            onOk: () => { if (!S.ok1) { S.ok1 = true; sV.el.classList.remove('lemons-hide'); sec2.hidden = false; api.typeset(sec2); } },
          });
          body.append(a1.el);
          const sec2 = el('div', { class: 'lemons-sec', hidden: true });
          const a2 = H.answer({
            label: R`现在可以调买家的估值倍数 $v$。$v$ 至少多大，价格 $p = 1$ 才能维持、所有车都成交？（容差 ±0.05）`, placeholder: 'v',
            check: (v) => {
              if (!S.ran) return { ok: false, msg: '先按「放开价格」看看：价格会怎样一轮轮变化？' };
              if (Math.abs(v - 2) <= 0.05) return { ok: true, msg: R`对：$v\,p/2 \ge p \iff v\ge 2$。` };
              if (Math.abs(v - 1.5) < 0.03) return { ok: false, msg: '1.5 正是刚才崩溃的情形。' };
              if (v > 2.05) return { ok: false, msg: '这样当然可以，但不是最小值。把 v 往下调，看价格从哪里开始一轮轮下滑。' };
              return { ok: false, msg: '把 p 拨到 1.00，换不同的 v 放开价格，看哪一个 v 起价格不再下滑。' };
            },
            onOk: () => { S.ok2 = true; api.done(R`<b>柠檬市场（Akerlof 1970）。</b>卖家知道质量而买家不知道时，价格只能反映在售车的<b>平均</b>质量；价格一低，最好的车先退出，平均质量随之下降，价格再降……市场可以一路瓦解到没有交易，即使每一笔潜在交易都对双方有利。这就是<b>逆向选择</b>。`); },
          });
          sec2.append(el('h4', { text: '市场还能救吗' }), el('p', { class: 'lemons-note', html: R`买家越看重车（$v$ 越大），他们为"平均车"愿付的就越多。` }), a2.el);
          body.append(sec2);

          function run() {
            S.ran = true; S.web = cobweb(S.p, S.v); S.k = ctx.reduced ? S.web.length - 1 : 0;
            if (!ctx.reduced) { acc = 0; lp.start(); } else draw();
          }
          let acc = 0;
          const lp = h.loop((dt) => { acc += dt; if (acc > 0.22) { acc = 0; S.k++; draw(); if (!S.web || S.k >= S.web.length - 1) lp.stop(); } });
          const curP = () => (S.web ? S.web[Math.min(S.k, S.web.length - 1)] : S.p);
          function draw() { drawA(); drawB(); readouts(); }
          function readouts() {
            const p = curP(), o = offered(p), E = avgQ(p), w = S.v * E;
            ro.n.set(`${o.length} / 200`);
            ro.e.set(o.length ? E.toFixed(3) + ' 万元' : '—');
            ro.w.set(o.length ? `${w.toFixed(3)} 万元` : '—');
            const fin = S.web && S.k >= S.web.length - 1;
            const settled = S.web && Math.abs(S.web[S.web.length - 1] - S.web[S.web.length - 2]) < 1e-6;
            if (S.web) ro.r.set(fin ? (p < 0.01 ? `第 ${S.web.length - 1} 轮：价格 ≈ 0，几乎没有车成交` : settled ? `价格停在 ${p.toFixed(2)}，${o.length} 辆成交` : `${S.web.length - 1} 轮后 p = ${p.toFixed(3)}，仍在下滑`) : `第 ${S.k} 轮：p = ${p.toFixed(3)}`);
            else ro.r.set(w >= p - 1e-9 ? '买家接受：成交' : '买家拒绝：在售的平均车不值这个价');
          }
          function drawA() {
            const g = cvA.g, Wd = cvA.w, Hh = cvA.h, p = curP(), E = avgQ(p);
            g.fillStyle = col('--panel'); g.fillRect(0, 0, Wd, Hh);
            const l = 14, r = Wd - 14, X = (t) => l + (r - l) * t, top = 22, bot = Hh - 22;
            CARS.forEach((c) => { const on = c.t <= p; g.globalAlpha = on ? 0.95 : 0.28; dot(g, X(c.t), top + (bot - top) * c.y, 2.6, on ? col('--s1') : col('--muted')); });
            g.globalAlpha = 1;
            g.strokeStyle = col('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(l, bot + 6); g.lineTo(r, bot + 6); g.stroke();
            g.font = '10.5px ' + (col('--mono-font') || 'monospace'); g.fillStyle = col('--muted'); g.textAlign = 'center'; g.textBaseline = 'top';
            [0, 0.25, 0.5, 0.75, 1].forEach((t) => g.fillText(String(t), X(t), bot + 8));
            const vline = (t, c, lab, yy) => { if (t > 1.02) return; g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(X(Math.min(t, 1)), top - 4); g.lineTo(X(Math.min(t, 1)), bot + 4); g.stroke(); tag(g, col, lab, X(Math.min(t, 1)), 9, c, t > 0.8 ? 'right' : 'left'); };
            if (offered(p).length) vline(E, col('--s2'), '平均质量', 0);
            vline(p, col('--accent'), '价格 p', 0);
          }
          function drawB() {
            const g = cvB.g, Wd = cvB.w, Hh = cvB.h, v = S.v;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, Wd, Hh);
            const m = Math.max(1.05, v * 0.52);
            const A = h.axes(g, Wd, Hh, { x0: 0, x1: m, y0: 0, y1: m, pad: { l: 44, r: 12, t: Wd < 520 ? 40 : 26, b: 34 }, xTicks: [0, 0.25, 0.5, 0.75, 1], yTicks: [0, 0.25, 0.5, 0.75, 1], fmtX: (x) => String(x), fmtY: (x) => String(x), xLabel: '开价 p（万元）', yLabel: '买家愿付（万元）' }, col);
            fcurve(g, A, 0, m, (x) => x, col('--muted'), 1.4, [5, 4]);
            fcurve(g, A, 0, m, (x) => v * avgQ(x), col('--s1'), 2.2);
            if (S.web) {
              g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
              g.strokeStyle = col('--accent'); g.lineWidth = 1.8; g.beginPath();
              const n = Math.min(S.k, S.web.length - 1);
              g.moveTo(A.X(S.web[0]), A.Y(0));
              for (let i = 0; i < n; i++) { g.lineTo(A.X(S.web[i]), A.Y(S.web[i + 1])); g.lineTo(A.X(S.web[i + 1]), A.Y(S.web[i + 1])); }
              g.stroke(); g.restore();
            }
            const p = curP();
            dot(g, A.X(Math.min(p, m)), A.Y(Math.min(v * avgQ(p), m)), 5, col('--accent'), col('--panel'));
            legend(g, col, [['45°', col('--muted'), 'dash'], [`买家愿付（v = ${v.toFixed(2)}）`, col('--s1'), 'line'], ['逐轮调价', col('--accent'), 'line']], A.p.l, 11, Wd - 6);
          }
          cvA.onResize(drawA); cvB.onResize(drawB);
          const un = watchTheme(draw);
          draw();
          return { destroy() { lp.stop(); cvA.destroy(); cvB.destroy(); un(); } };
        },
      };

      /* ================= Stage 2: education ================= */
      const stage2 = {
        title: '一纸文凭',
        task: R`<p>哈佛，1972 年。雇主面临同样的问题：看不出求职者的能力。能力高的人（产出 2）和能力低的人（产出 1）在面试时看起来差不多，于是所有人只能拿平均工资。能力高的人想证明自己，可光凭嘴说没有用，低能力的人也会这么说。</p>
<p>雇主看得见的只有学历 $e$（读书年数）。在这个极端的模型里<b>读书完全不提高产出</b>。但读书的代价因人而异：低能力者每读 1 年付出代价 1，高能力者只付出 1/2（学得轻松）。雇主之间竞争，按"信念中的产出"付工资。</p>
<p>假设雇主相信：学历达到门槛 $e^*$ 的是高能力者（付 2），否则是低能力者（付 1）。每个人比较"不读书拿 1"和"读到 $e^*$ 拿 2 再扣掉读书代价"，选划算的。门槛定在哪里，雇主的信念才会被现实证实？</p>`,
        hints: [
          R`低能力者读到 $e^*$ 的净收益是 $2 - e^*$，不读是 1；高能力者是 $2 - e^*/2$ 对 1。信念要被证实，需要低能力者<b>不</b>读、高能力者读。`,
          R`低能力者不读 $\iff 1 \ge 2 - e^*$；高能力者读 $\iff 2 - e^*/2 \ge 1$。两个不等式各给出一个端点。`,
          R`$e^*\in[1,2]$。在 $e^* = 1$ 时高能力者净得 1.5；而如果没有任何信号，所有人都拿平均工资 $1 + \lambda$（$\lambda$ 为高能力者占比）。`,
        ],
        answer: R`信念 "$e\ge e^*$ 即高能力" 被证实，当且仅当低能力者不模仿（$1\ge 2-e^*$，即 $e^*\ge 1$）且高能力者愿意读（$2-e^*/2\ge 1$，即 $e^*\le 2$）。所以<b>分离均衡是一整个区间 $e^*\in[1,2]$</b>：信念自我实现，而具体哪一个由信念决定。读书在这里不产生任何东西，只是把人分开；信号之所以可信，是因为它对低能力者<b>更贵</b>（单交叉条件）。最省钱的 $e^* = 1$ 让高能力者净得 $2 - 0.5 = 1.5$；若没有信号，所有人得 $1+\lambda$。<b>$\lambda\gt 1/2$ 时</b>，连高能力者也宁愿这种文凭不存在：信号是社会净浪费。`,
        build(body, api) {
          const S = { e: 0.5, lam: 0.3, okMin: false, okMax: false };
          const stg = el('div', { class: 'lab-stage' }); body.append(stg);
          const cv = h.canvas(stg, { aspect: 0.58, minH: 230, maxH: 360 });
          cv.canvas.setAttribute('aria-label', '工资与学历：雇主的工资阶梯与两类人的无差异线');
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const sE = h.slider({ label: '雇主的门槛 e*（年）', min: 0, max: 3, step: 0.05, value: S.e, format: (v) => v.toFixed(2), onInput: (v) => { S.e = v; draw(); } });
          const sL = h.slider({ label: '高能力者占比 λ', min: 0.05, max: 0.95, step: 0.01, value: S.lam, format: (v) => v.toFixed(2), onInput: (v) => { S.lam = v; draw(); } });
          sL.el.classList.add('lemons-hide');
          ctl.append(sE.el, sL.el);
          const roW = el('div', { class: 'lab-readout' });
          const ro = { L: h.readout('低能力者：不读 / 读到 e*'), H: h.readout('高能力者：不读 / 读到 e*'), b: h.readout('雇主的信念'), w: h.readout('高能力者：最省钱的分离 vs 无信号') };
          roW.append(ro.L.el, ro.H.el, ro.b.el); body.append(roW);
          const finish = () => { if (S.okMin && S.okMax && secB.hidden) { secB.hidden = false; sL.el.classList.remove('lemons-hide'); roW.append(ro.w.el); api.typeset(secB); draw(); } };
          const aMin = H.answer({
            label: R`使分离均衡成立的门槛 $e^*$ <b>最小</b>是多少？（容差 ±0.05）`, placeholder: 'e* 下限',
            check: (v) => {
              if (Math.abs(v - 1) <= 0.05) return { ok: true, msg: R`对：$e^*\lt 1$ 时低能力者读书也划算，信念被推翻。` };
              if (Math.abs(v - 2) <= 0.05) return { ok: false, msg: '2 是另一个端点。' };
              if (Math.abs(v - 0.5) <= 0.05) return { ok: false, msg: '想想低能力者：他读 0.5 年付 0.5，换来工资 +1，划算吗？' };
              return { ok: false, msg: '把门槛往下拉，看从哪里开始低能力者也去读。' };
            },
            onOk: () => { S.okMin = true; finish(); },
          });
          const aMax = H.answer({
            label: R`<b>最大</b>是多少？（容差 ±0.05）`, placeholder: 'e* 上限',
            check: (v) => {
              if (Math.abs(v - 2) <= 0.05) return { ok: true, msg: R`对：$e^*\gt 2$ 时高能力者也不读了。` };
              if (Math.abs(v - 1) <= 0.05) return { ok: false, msg: '1 是另一个端点。' };
              if (Math.abs(v - 4) <= 0.1) return { ok: false, msg: '高能力者每年代价是 1/2，工资差是 1。' };
              return { ok: false, msg: '把门槛往上推，看从哪里开始高能力者觉得不值。' };
            },
            onOk: () => { S.okMax = true; finish(); },
          });
          body.append(aMin.el, aMax.el);
          const secB = el('div', { class: 'lemons-sec', hidden: true });
          const aLam = H.answer({
            label: R`取最省钱的分离均衡。高能力者占比 $\lambda$ 超过多少时，连高能力者自己都宁愿这种文凭不存在（所有人拿平均工资）？（容差 ±0.03）`, placeholder: 'λ',
            check: (v) => {
              if (Math.abs(v - 0.5) <= 0.03) return { ok: true, msg: R`对：$1 + \lambda \gt 1.5 \iff \lambda\gt 1/2$。` };
              if (Math.abs(v - 1 / 3) <= 0.03) return { ok: false, msg: '算一下：λ = 1/3 时平均工资 1.33，低于 1.5。' };
              return { ok: false, msg: '比较 1 + λ 与最省钱分离均衡里高能力者的净所得。' };
            },
            onOk: () => api.done(R`<b>信号（Spence 1973）。</b>即使教育完全不提高生产率，只要它对高能力者更便宜，它就能把人分开：分离均衡构成一个区间 $e^*\in[1,2]$，由自我实现的信念维持。信号的成本是社会的净损失，当高能力者占多数时，所有人（包括高能力者）在没有信号的混同结果下反而更好。`),
          });
          secB.append(el('h4', { text: '谁从文凭里得益' }), el('p', { class: 'lemons-note', html: R`现在可以调高能力者的占比 $\lambda$。没有任何信号时，雇主只能付平均产出 $1+\lambda$。` }), aLam.el);
          body.append(secB);

          function status(e) {
            const L0 = 1, Le = 2 - e, H0 = 1, He = 2 - e / 2;
            const Lgo = Le > L0 + 1e-9, Hgo = He >= H0 - 1e-9;
            if (!Lgo && Hgo) return { ok: true, t: '被证实：只有高能力者读到 e*（分离均衡）' };
            if (Lgo && Hgo) return { ok: false, t: '被推翻：低能力者也来读，读到 e* 的人平均产出只有 1 + λ' };
            return { ok: false, t: '被推翻：高能力者也不读，"没读"的人里有高能力者' };
          }
          function draw() {
            const g = cv.g, Wd = cv.w, Hh = cv.h, e = S.e;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, Wd, Hh);
            const A = h.axes(g, Wd, Hh, { x0: 0, x1: 3, y0: 0, y1: 2.6, pad: { l: 44, r: 12, t: Wd < 520 ? 40 : 26, b: 34 }, xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], yTicks: [0, 0.5, 1, 1.5, 2, 2.5], fmtX: (x) => String(x), fmtY: (x) => String(x), xLabel: '学历 e（年）', yLabel: '工资' }, col);
            // indifference lines through (0, 1): w = 1 + c·e
            fcurve(g, A, 0, 3, (x) => 1 + x, col('--s1'), 1.6, [5, 4]);
            fcurve(g, A, 0, 3, (x) => 1 + x / 2, col('--s2'), 1.6, [5, 4]);
            if (!sL.el.classList.contains('lemons-hide')) fcurve(g, A, 0, 3, () => 1 + S.lam, col('--muted'), 1.2, [2, 3]);
            // wage schedule
            g.strokeStyle = col('--fg'); g.lineWidth = 2.6; g.beginPath(); g.moveTo(A.X(0), A.Y(1)); g.lineTo(A.X(e), A.Y(1)); g.stroke();
            g.beginPath(); g.moveTo(A.X(e), A.Y(2)); g.lineTo(A.X(3), A.Y(2)); g.stroke();
            g.setLineDash([2, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(A.X(e), A.Y(1)); g.lineTo(A.X(e), A.Y(2)); g.stroke(); g.setLineDash([]);
            dot(g, A.X(e), A.Y(2), 5, col('--accent'), col('--panel')); dot(g, A.X(0), A.Y(1), 4.5, col('--fg'));
            const st = status(e);
            tag(g, col, st.ok ? '分离均衡' : '信念被推翻', A.p.l + A.iw - 4, A.p.t + 12, st.ok ? col('--good') : col('--warn'), 'right');
            legend(g, col, [['工资阶梯', col('--fg'), 'line'], ['低能力者无差异线 w = 1 + e', col('--s1'), 'dash'], ['高能力者 w = 1 + e/2', col('--s2'), 'dash']], A.p.l, 11, Wd - 6);
            ro.L.set(`1.00 / ${(2 - e).toFixed(2)} → ${2 - e > 1 + 1e-9 ? '读' : '不读'}`);
            ro.H.set(`1.00 / ${(2 - e / 2).toFixed(2)} → ${2 - e / 2 >= 1 - 1e-9 ? '读' : '不读'}`);
            ro.b.set(st.t);
            ro.w.set(`1.50 vs ${(1 + S.lam).toFixed(2)} → ${1 + S.lam > 1.5 + 1e-9 ? '宁愿没有文凭' : '要文凭'}`);
          }
          cv.onResize(draw);
          const un = watchTheme(draw);
          draw();
          return { destroy() { cv.destroy(); un(); } };
        },
      };

      /* ================= Stage 3: insurance menu ================= */
      const stage3 = {
        title: '保险菜单',
        task: R`<p>1970 年代中期。现在换到看不见风险的一方：保险公司。每位客户财富 $W = 100$，可能遭受损失 $d = 80$；高风险者出险概率 $0.5$，低风险者 $0.25$，各占一半。客户都厌恶风险，效用 $u(c) = \ln c$。保险公司分不出谁是谁，但可以摆出一份<b>菜单</b>，每份合同写明保额 $q$ 和保费 $P$，让客户自己挑。保险业竞争充分：任何能赚钱的新合同都会有人推出。</p>
<p>下图横轴是不出险时的消费 $c_1 = W - P$，纵轴是出险时的消费 $c_2 = W - d + q - P$。你已经给高风险者准备了足额保险，按他们的公平保费 $0.5\times80 = 40$ 定价。现在给低风险者设计合同，同样按他们的公平费率 $P = 0.25\,q$ 收费。保额能给多少？</p>`,
        hints: [
          R`低风险者当然想要足额保险 $q = 80$、保费 20。可这份合同对高风险者也太便宜了。看高风险者的选择：他们会不会挑你给低风险者的那一份？`,
          R`高风险者不冒充的条件是 $0.5\ln(100 - 0.25q) + 0.5\ln(20 + 0.75q) \le \ln 60$。在图上：低风险者的合同必须落在高风险者经过 $(60,60)$ 的无差异曲线之下。`,
          R`等号两边取指数：$(100 - q/4)(20 + 3q/4) = 3600$，即 $0.1875\,q^2 - 70q + 1600 = 0$，较小的根 $q^* = (70-\sqrt{3700})/0.375 \approx 24.5$。`,
        ],
        answer: R`高风险者拿足额公平保险 $(60, 60)$。低风险者的合同必须让高风险者不愿冒充：$0.5\ln(100 - q/4) + 0.5\ln(20 + 3q/4)\le\ln 60$，得 <b>$q\le q^*\approx 24.5$</b>，只保了损失的约 30%。低风险者明明愿意按自己的公平费率买足额保险，却只能买到一小部分：这就是<b>筛选的代价</b>，信息不对称的负担全落在"好"客户身上。混同（两类人买同一份合同）不可能是均衡：在混同点处低风险者的无差异曲线比高风险者的更陡，总能找到一份保额略少、保费更低的合同，只吸引低风险者而且赚钱（例如 $q = 60$、$P = 20$：低风险者效用 $4.310\gt\ln 70 = 4.248$，高风险者 $4.238\lt 4.248$，每单利润 $20 - 0.25\times 60 = 5$）。`,
        build(body, api) {
          const S = { q: 60, mode: 'sep', dq: 60, dP: 25, okQ: false };
          const stg = el('div', { class: 'lab-stage' }); body.append(stg);
          const cv = h.canvas(stg, { aspect: 0.72, minH: 260, maxH: 420 });
          cv.canvas.setAttribute('aria-label', '两种状态下的消费：公平线、无差异曲线与合同');
          const ctl = el('div', { class: 'lab-controls' }); body.append(ctl);
          const sQ = h.slider({ label: '低风险合同的保额 q（保费 0.25q）', min: 0, max: 80, step: 0.1, value: S.q, format: (v) => v.toFixed(1), onInput: (v) => { S.q = v; draw(); } });
          ctl.append(sQ.el);
          const roW = el('div', { class: 'lab-readout' });
          const ro = { H: h.readout('高风险者：足额 / 低风险合同的效用'), c: h.readout('谁买低风险合同'), pr: h.readout('低风险合同每单利润'), x: h.readout('低风险者实际保了多少') };
          const relabel = (k, t) => { ro[k].el.querySelector('.ro-lab').textContent = t; };
          Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);
          const aQ = H.answer({
            label: R`低风险合同最多能给多少保额 $q$，高风险者才不来冒充？（容差 ±1）`, placeholder: 'q',
            check: (v) => {
              if (Math.abs(v - QSTAR) <= 1) return { ok: true, msg: `对：q* ≈ ${QSTAR.toFixed(2)}，只保了 80 的 ${(100 * QSTAR / 80).toFixed(0)}%。` };
              if (Math.abs(v - 80) <= 1) return { ok: false, msg: '足额保险给低风险者？高风险者会全部涌来买，公司每单亏 20。' };
              if (Math.abs(v - 40) <= 1) return { ok: false, msg: '40 是高风险合同的保费。' };
              if (v > QSTAR + 1) return { ok: false, msg: '这个保额下高风险者会来冒充（看读数）。' };
              return { ok: false, msg: '还可以再多给一些：在高风险者开始冒充之前，保额越高低风险者越满意。' };
            },
            onOk: () => { if (!S.okQ) { S.okQ = true; secB.hidden = false; api.typeset(secB); S.mode = 'pool'; sQ.el.classList.add('lemons-hide'); ctlB.classList.remove('lemons-hide'); relabel('H', '高风险者效用：混同 / 新合同'); relabel('c', '谁买新合同'); relabel('pr', '新合同每单利润'); relabel('x', '低风险者效用：混同 / 新合同'); draw(); } },
          });
          body.append(aQ.el);

          const secB = el('div', { class: 'lemons-sec', hidden: true });
          const ctlB = el('div', { class: 'lab-controls lemons-hide' });
          const sDQ = h.slider({ label: '新合同保额 q′', min: 0, max: 80, step: 0.5, value: S.dq, format: (v) => v.toFixed(1), onInput: (v) => { S.dq = v; draw(); } });
          const sDP = h.slider({ label: '新合同保费 P′', min: 0, max: 40, step: 0.25, value: S.dP, format: (v) => v.toFixed(2), onInput: (v) => { S.dP = v; draw(); } });
          ctlB.append(sDQ.el, sDP.el, el('div', { class: 'ctl' }, [el('div', {}, [h.button({ label: '推出新合同', kind: 'primary', onClick: () => launch() })])]));
          secB.append(el('h4', { text: '摘奶油' }), el('p', { class: 'lemons-note', html: R`换个思路：假如所有公司都只卖一份<b>混同</b>合同：足额保险，保费按平均风险 $0.375\times 80 = 30$，两类人都买，公司不赔不赚（图中 $(70,70)$）。你开一家新公司：设计一份合同 $(q', P')$，<b>只吸引低风险者</b>并且赚钱。` }));
          stg.after(ctlB);
          body.append(secB);
          function judge(q, P) {
            const uL = EU(PL, q, P), uH = EU(PH, q, P), uLp = EU(PL, 80, 30), uHp = EU(PH, 80, 30);
            const L = uL > uLp + 1e-9, Hh = uH > uHp + 1e-9;
            const buyers = L && Hh ? '两类都买' : L ? '只有低风险者' : Hh ? '只有高风险者' : '没人买';
            const pb = L && Hh ? 0.375 : L ? PL : Hh ? PH : 0;
            return { L, H: Hh, buyers, profit: L || Hh ? P - pb * q : 0, uL, uH, uLp, uHp };
          }
          function launch() {
            const j = judge(S.dq, S.dP);
            if (j.L && !j.H && j.profit > 1e-9) api.done(R`<b>筛选（Rothschild–Stiglitz 1976）。</b>你刚刚"摘走了奶油"：混同合同失去低风险客户，只剩高风险者，必然亏损，所以混同不可能是均衡。唯一可能的均衡是分离菜单：高风险者足额，低风险者被<b>扭曲</b>到部分保险（$q^*\approx 24.5$），让菜单本身完成信息甄别。当低风险者占比很高时（这里约超过 70%），连分离菜单也会被一份混同合同打破，均衡可能根本不存在。`);
            else if (j.H) api.say('高风险者也会来买这份合同：它对他们也有吸引力。保额再少一点或者保费再高一点。', 'bad');
            else if (!j.L) api.say('低风险者不会换：相比足额、保费 30 的混同合同，这份对他们不划算。', 'bad');
            else api.say(`只有低风险者会买，但每单利润 ${j.profit.toFixed(2)} ≤ 0。保费还可以再高一点。`, 'bad');
          }

          const X0 = 40, X1 = 102, Y0 = 10, Y1 = 90;
          function draw() {
            const g = cv.g, Wd = cv.w, Hh = cv.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, Wd, Hh);
            const A = h.axes(g, Wd, Hh, { x0: X0, x1: X1, y0: Y0, y1: Y1, pad: { l: 44, r: 12, t: Wd < 520 ? 40 : 26, b: 34 }, xTicks: [40, 50, 60, 70, 80, 90, 100], yTicks: [20, 40, 60, 80], xLabel: '不出险时的消费 c₁', yLabel: '出险时的消费 c₂' }, col);
            fcurve(g, A, X0, X1, (x) => x, col('--grid'), 1.2);
            fcurve(g, A, X0, X1, (x) => 20 + (100 - x), col('--s2'), 1.4, [5, 4]);
            fcurve(g, A, X0, X1, (x) => 20 + 3 * (100 - x), col('--s1'), 1.4, [5, 4]);
            dot(g, A.X(100), A.Y(20), 4, col('--fg'));
            tag(g, col, '不保险', A.X(100) - 4, A.Y(20) + 12, col('--muted'), 'right');
            const icH = (U) => (x) => Math.exp((U - 0.5 * Math.log(x)) / 0.5);
            const icL = (U) => (x) => Math.exp((U - 0.75 * Math.log(x)) / 0.25);
            if (S.mode === 'sep') {
              const q = S.q, B = [100 - 0.25 * q, 20 + 0.75 * q];
              fcurve(g, A, X0, X1, icH(Math.log(60)), col('--s2'), 2);
              fcurve(g, A, X0, X1, icL(EU(PL, q, 0.25 * q)), col('--s1'), 1.6);
              dot(g, A.X(80), A.Y(80), 4, null, col('--muted'));
              tag(g, col, '低风险者的理想', A.X(80) + 6, A.Y(80) - 10, col('--muted'));
              dot(g, A.X(60), A.Y(60), 5.5, col('--s2'), col('--panel'));
              tag(g, col, '高风险合同', A.X(60) + 7, A.Y(60) + 12, col('--s2'));
              const mimic = EU(PH, q, 0.25 * q) > Math.log(60) + 1e-9;
              dot(g, A.X(B[0]), A.Y(B[1]), 6, mimic ? col('--warn') : col('--accent'), col('--panel'));
              legend(g, col, [['高风险公平线', col('--s2'), 'dash'], ['低风险公平线', col('--s1'), 'dash'], ['高风险者无差异线', col('--s2'), 'line'], ['低风险者无差异线', col('--s1'), 'line']], A.p.l, 11, Wd - 6);
              const uA = Math.log(60), uB = EU(PH, q, 0.25 * q);
              ro.H.set(`${uA.toFixed(4)} / ${uB.toFixed(4)}`);
              ro.c.set(mimic ? '两类人都买（高风险者冒充）' : '只有低风险者');
              const pr = mimic ? 0.25 * q - 0.375 * q : 0;
              ro.pr.set(mimic ? `${pr.toFixed(2)}（亏损）` : '0（公平定价）');
              ro.x.set(`${q.toFixed(1)} / 80（${(100 * q / 80).toFixed(0)}%）`);
            } else {
              const j = judge(S.dq, S.dP), N = [100 - S.dP, 20 + S.dq - S.dP];
              fcurve(g, A, X0, X1, (x) => 20 + (5 / 3) * (100 - x), col('--muted'), 1.4, [5, 4]);
              fcurve(g, A, X0, X1, icH(Math.log(70)), col('--s2'), 2);
              fcurve(g, A, X0, X1, icL(Math.log(70)), col('--s1'), 2);
              dot(g, A.X(70), A.Y(70), 5.5, col('--fg'), col('--panel'));
              tag(g, col, '混同合同', A.X(70) - 7, A.Y(70) - 12, col('--fg'), 'right');
              dot(g, A.X(N[0]), A.Y(N[1]), 6, j.L && !j.H && j.profit > 0 ? col('--good') : col('--accent'), col('--panel'));
              legend(g, col, [['平均风险公平线', col('--muted'), 'dash'], ['低风险公平线', col('--s1'), 'dash'], ['高风险者经过混同点', col('--s2'), 'line'], ['低风险者经过混同点', col('--s1'), 'line']], A.p.l, 11, Wd - 6);
              ro.H.set(`${j.uHp.toFixed(4)} / ${j.uH.toFixed(4)}`);
              ro.c.set(j.buyers);
              ro.pr.set(j.L || j.H ? j.profit.toFixed(2) : '—');
              ro.x.set(`${j.uLp.toFixed(4)} / ${j.uL.toFixed(4)}`);
            }
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
