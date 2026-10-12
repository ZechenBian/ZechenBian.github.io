/* 均衡与选择 — 挑战版（经济学奖 1972：John R. Hicks · Kenneth J. Arrow）
 *
 * 第一关 埃奇沃思盒（示意经济）：u_A = x^0.6 y^0.4，u_B = x^0.3 y^0.7；ω_A = (2, 8)，ω_B = (8, 2)，总量 (10, 10)。
 *   契约曲线（MRS_A = MRS_B）：y = k_B x·10 / (k_A(10 − x) + k_B x)，k_A = 1.5，k_B = 3/7。
 *   均衡 p* = p_x/p_y = (0.6·8 + 0.3·2)/(0.4·2 + 0.7·8) = 5.4/6.4 = 27/32 = 0.84375，
 *   A 得 (6.889, 3.875)，B 得 (3.111, 6.125)；z_x(p) = 5.4/p − 6.4；瓦尔拉斯律 p z_x + z_y ≡ 0。
 * 第二关 斯卡夫型三物经济（Scarf 1960 的重标度版本，L = (3, 2, 4)）：第 i 人有 L_i 份商品 i，
 *   效用 min(x_i/L_i, x_{i+1}/L_{i+1})。t_i = L_i p_i/(L_i p_i + L_{i+1} p_{i+1})，z_i = L_i (t_i + t_{i−1} − 1)。
 *   均衡 t_i = 1/2 ⇔ L_i p_i 相等 ⇒ p ∝ (4, 6, 3)/13，p₂/p₁ = 1.5。
 *   拍卖人 ṗ = z(p) 守恒 |p|² 与 Σ ln(L_i p_i)/L_i² ⇒ 闭轨道（已数值验证，漂移 < 1e-9）。
 *   施佩纳标号：label(p) = argmin_{i: p_i > 0} z_i(p)。12 等分网格上唯一的全标号小三角形顶点
 *   (4,5,3)、(3,6,3)、(4,6,2)（÷12），重心 p₂/p₁ = 1.545；底边 1–2 门唯一。
 * 第三关 阿罗：3 位选民、3 个选项，IIA ⇒ 规则 = 每对选项上"偏好前者的联盟 S → 胜者"的表；帕累托固定 S = ∅、全体。
 *   2^18 = 262 144 种规则在 216 种严格排序组合上逐一检验，无循环的恰好 3 种：三个独裁者（已离线穷举验证）。
 *   简化：社会偏好要求严格（不允许平局）。
 */
(() => {
  const R = String.raw;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function watchTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', fn); };
  }
  const CSS = `
.arrow-sec{display:grid;gap:10px;border-top:1px dashed var(--line);padding-top:10px}
.arrow-sec[hidden]{display:none}
.arrow-sec h4{margin:0;font-size:14px}
.arrow-part{display:grid;gap:12px}
.arrow-part[hidden]{display:none}
.arrow-note{font-size:13px;color:var(--muted);margin:0;line-height:1.7}
.arrow-btns{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.arrow-rule table{border-collapse:collapse;font-size:13px}
.arrow-rule th,.arrow-rule td{padding:4px 8px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}
.arrow-rule th{color:var(--muted);font-weight:500}
.arrow-rule td:first-child,.arrow-rule th:first-child{text-align:left}
.arrow-cell{font:inherit;font-family:var(--mono-font);font-size:13px;min-width:46px;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer}
.arrow-cell[data-w="0"]{border-color:var(--s1);color:var(--s1)}
.arrow-cell[data-w="1"]{border-color:var(--s2);color:var(--s2)}
.arrow-cell:disabled{opacity:.55;cursor:default}
.arrow-out{font-size:13.5px;line-height:1.75;display:grid;gap:6px}
.arrow-out .bad{color:var(--warn)} .arrow-out .good{color:var(--good)}
.arrow-mono{font-family:var(--mono-font);font-size:13px}`;
  function injectStyle() {
    if (document.getElementById('st-arrow')) return;
    const s = document.createElement('style'); s.id = 'st-arrow'; s.textContent = CSS; document.head.append(s);
  }

  /* ===================== 第一关：埃奇沃思盒 ===================== */
  const AL = 0.6, BE = 0.3, TX = 10, TY = 10, WA = [2, 8];
  const KA = AL / (1 - AL), KB = BE / (1 - BE);
  const uA = (x, y) => Math.pow(Math.max(x, 1e-9), AL) * Math.pow(Math.max(y, 1e-9), 1 - AL);
  const uB = (x, y) => Math.pow(Math.max(TX - x, 1e-9), BE) * Math.pow(Math.max(TY - y, 1e-9), 1 - BE);
  const mrsA = (x, y) => (KA * y) / x;
  const mrsB = (x, y) => (KB * (TY - y)) / (TX - x);
  const ccY = (x) => (KB * x * TY) / (KA * (TX - x) + KB * x);
  const PSTAR = (AL * WA[1] + BE * (TY - WA[1])) / ((1 - AL) * WA[0] + (1 - BE) * (TX - WA[0]));
  function demand(p) {
    const IA = p * WA[0] + WA[1], IB = p * (TX - WA[0]) + (TY - WA[1]);
    const a = [(AL * IA) / p, (1 - AL) * IA], b = [(BE * IB) / p, (1 - BE) * IB];
    return { a, b, zx: a[0] + b[0] - TX, zy: a[1] + b[1] - TY };
  }
  function boxGeom(W, Hh) {
    const s = Math.max(140, Math.min(W - 72, Hh - 58)), bx = Math.round((W - s) / 2), by = 28;
    return { s, bx, by, X: (x) => bx + (x / TX) * s, Y: (y) => by + s - (y / TY) * s, inv: (px, py) => [((px - bx) / s) * TX, ((by + s - py) / s) * TY] };
  }
  // indifference curve x^a y^(1−a) = u in the owner's own coordinates; B's is drawn from O_B
  function drawIC(g, G, u, a, own) {
    const x0 = Math.pow(u / Math.pow(TY, 1 - a), 1 / a);
    if (!(x0 < TX)) return;
    g.beginPath();
    for (let k = 0; k <= 140; k++) {
      const xo = x0 + (TX - x0) * (k / 140) * (k / 140), yo = Math.pow(u / Math.pow(xo, a), 1 / (1 - a));
      const x = own === 'A' ? xo : TX - xo, y = own === 'A' ? yo : TY - yo;
      k ? g.lineTo(G.X(x), G.Y(y)) : g.moveTo(G.X(x), G.Y(y));
    }
    g.stroke();
  }
  function boxFrame(g, G, C) {
    const mono = C('--mono-font') || 'monospace';
    g.strokeStyle = C('--grid'); g.lineWidth = 1;
    for (let k = 2; k < 10; k += 2) {
      g.beginPath(); g.moveTo(G.X(k), G.Y(0)); g.lineTo(G.X(k), G.Y(TY)); g.stroke();
      g.beginPath(); g.moveTo(G.X(0), G.Y(k)); g.lineTo(G.X(TX), G.Y(k)); g.stroke();
    }
    g.strokeStyle = C('--line'); g.strokeRect(G.bx + 0.5, G.by + 0.5, G.s, G.s);
    g.font = '11px ' + mono; g.fillStyle = C('--muted');
    g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('O_A', G.bx - 3, G.by + G.s + 3);
    g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('O_B', G.bx + G.s + 3, G.by - 3);
    g.fillStyle = C('--s1'); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('A 的面包 x →', G.bx + G.s / 2, G.by + G.s + 6);
    g.fillStyle = C('--s2'); g.textBaseline = 'bottom'; g.fillText('← B 的面包', G.bx + G.s / 2, G.by - 6);
    g.save(); g.translate(G.bx - 12, G.by + G.s / 2); g.rotate(-Math.PI / 2); g.fillStyle = C('--s1'); g.textBaseline = 'middle'; g.fillText('A 的布 y →', 0, 0); g.restore();
    g.save(); g.translate(G.bx + G.s + 12, G.by + G.s / 2); g.rotate(Math.PI / 2); g.fillStyle = C('--s2'); g.textBaseline = 'middle'; g.fillText('B 的布 →', 0, 0); g.restore();
  }
  // lower boundary: A's indifference curve y_A(x); upper: B's, y_B(x). Lens = {y_A < y < y_B} ∩ box.
  const yIcA = (x, ua) => Math.pow(ua / Math.pow(Math.max(x, 1e-9), AL), 1 / (1 - AL));
  const yIcB = (x, ub) => TY - Math.pow(ub / Math.pow(Math.max(TX - x, 1e-9), BE), 1 / (1 - BE));
  function lens(ua, ub) {
    const top = [], bot = []; let area = 0; const n = 400;
    for (let k = 0; k <= n; k++) {
      const x = (TX * k) / n, lo = Math.max(0, yIcA(x, ua)), hi = Math.min(TY, yIcB(x, ub));
      if (hi > lo) { top.push([x, hi]); bot.push([x, lo]); area += ((hi - lo) * TX) / n; }
    }
    return { top, bot, area };
  }
  const dot = (g, x, y, r, fill, stroke) => { g.beginPath(); g.arc(x, y, r, 0, 6.2832); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };

  function stage1(ctx) {
    return {
      title: '两个人，两种货物',
      task: R`<p>先从最小的经济开始（示意数字）。A 有 2 份面包、8 份布；B 有 8 份面包、2 份布。A 偏爱面包，效用 $u_A = x^{0.6}y^{0.4}$；B 偏爱布，$u_B = x^{0.3}y^{0.7}$。盒子里的每一点都是一种分法：从左下角 $O_A$ 量 A 分到多少，从右上角 $O_B$ 反向量 B 分到多少。两条曲线是经过当前点的两人的无差异曲线；金色阴影是“两人都比现在更满意”的分法。</p>
<p><b>第一步</b>：拖动这个点（或用滑块），找一个<b>再也没有两人都愿意的交易</b>的位置，按“记录”。在盒子里不同地方找 3 个这样的点。</p>
<p><b>第二步</b>：不再讨价还价，改由一个拍卖人喊出价格比 $p = p_{\text{面包}}/p_{\text{布}}$。每人按这个价格卖掉自己的东西、买回自己最喜欢的组合。把 $p$ 调到让面包和布两个市场同时出清。</p>`,
      hints: [
        R`阴影不空，就说明还能找到两人都更满意的分法：往阴影里挪。阴影缩成一点时，两条无差异曲线<b>相切</b>；读数里的两个边际替代率 $\mathrm{MRS} = (\partial u/\partial x)/(\partial u/\partial y)$ 此时相等。`,
        R`第二步：价格比太高时面包卖不出去（$z_x \lt 0$），该降价；太低则供不应求，该提价。读数里 $p\,z_x + z_y$ 永远是 0（每人都花光自己的收入），所以只要面包市场出清，布市场自动出清。`,
        R`$z_x(p) = 5.4/p - 6.4$，均衡 $p^* = 27/32 \approx 0.844$，A 得 $(6.89,\ 3.88)$。在 $p^*$ 下两人的边际替代率都等于 $p^*$，所以彼此相等：均衡点落在你第一步找到的那条曲线上。`,
      ],
      answer: R`<p>两人无差异曲线相切 ⇔ $\mathrm{MRS}_A = \mathrm{MRS}_B$，即 $\frac{0.6}{0.4}\frac{y}{x} = \frac{0.3}{0.7}\frac{10-y}{10-x}$。这些点组成从 $O_A$ 到 $O_B$ 的<b>契约曲线</b>（帕累托集），它上面任何移动都会让至少一人受损。</p>
<p>价格比 $p$ 下，A 的收入 $I_A = 2p + 8$，需求 $x_A = 0.6 I_A/p$；B 的收入 $I_B = 8p + 2$，需求 $x_B = 0.3 I_B/p$。面包市场出清 $x_A + x_B = 10$ ⇒ $5.4/p = 6.4$ ⇒ $p^* = 27/32 = 0.844$。A 得 $(6.89, 3.88)$，B 得 $(3.11, 6.13)$；两人的效用从 3.48、3.03 升到 5.47、5.00。均衡点在契约曲线上，因为两人都把 MRS 调到同一个价格比：这就是<b>第一福利定理</b>。瓦尔拉斯律 $p z_x + z_y \equiv 0$ 保证一个市场出清时另一个也出清。</p>`,
      build(body, api) {
        const h = H, C = (n) => ctx.color(n);
        const st = { x: WA[0], y: WA[1], pts: [], part: 1, lp: Math.log(2), lens: 0, cleared: false };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 1, minH: 300, maxH: 470 });
        cv.canvas.style.touchAction = 'none'; // dragging the allocation point; released in part 2
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const sx = h.slider({ label: 'A 的面包 x', min: 0.1, max: 9.9, step: 0.05, value: st.x, format: (v) => v.toFixed(2), onInput: (v) => { st.x = v; draw(); } });
        const sy = h.slider({ label: 'A 的布 y', min: 0.1, max: 9.9, step: 0.05, value: st.y, format: (v) => v.toFixed(2), onInput: (v) => { st.y = v; draw(); } });
        const bRec = h.button({ label: '记录：这里已没有互利交易', kind: 'primary', onClick: record });
        const bHome = h.button({ label: '回到初始禀赋 ω', onClick: () => { st.x = WA[0]; st.y = WA[1]; sx.set(st.x); sy.set(st.y); draw(); } });
        ctl.append(sx.el, sy.el, h.el('div', { class: 'ctl' }, [h.el('div', { class: 'arrow-btns' }, [bRec, bHome])]));
        const roW = h.el('div', { class: 'lab-readout' }); body.append(roW);
        const ro = { u: h.readout('效用 u_A / u_B'), m: h.readout('MRS_A / MRS_B'), l: h.readout('两人都更满意的区域'), n: h.readout('已记录') };
        Object.values(ro).forEach((r) => roW.append(r.el));

        // ---- 第二步 ----
        const sec = h.el('div', { class: 'arrow-sec', hidden: true }); body.append(sec);
        const sp = h.slider({ label: '拍卖人报价 p = p面包 / p布', min: Math.log(0.25), max: Math.log(4), step: 0.002, value: st.lp, format: (v) => Math.exp(v).toFixed(3), onInput: (v) => { st.lp = v; draw(); checkClear(); } });
        const ctl2 = h.el('div', { class: 'lab-controls' }, [sp.el]);
        const ro2W = h.el('div', { class: 'lab-readout' });
        const ro2 = { a: h.readout('A 想要 (面包, 布)'), b: h.readout('B 想要 (面包, 布)'), zx: h.readout('面包超额需求 z_x'), zy: h.readout('布超额需求 z_y'), w: h.readout('p·z_x + z_y') };
        Object.values(ro2).forEach((r) => ro2W.append(r.el));
        const quizBox = h.el('div', { hidden: true });
        quizBox.append(H.quiz({
          question: '拍卖人找到的这个均衡配置，和你第一步记录的那些点是什么关系？',
          options: [
            { label: '它一般不在那条曲线上，还需要政府再调一次', ok: false, why: '看图：两个需求点重合的地方正好落在虚线上。两人在同一个价格下各自做最优，切线斜率就相同。' },
            { label: R`它就在那条曲线上：两人在同一条预算线上做最优，各自的 MRS 都等于价格比 $p$，于是彼此相等`, ok: true, why: '对。这是第一福利定理在盒子里的样子：竞争均衡自动是帕累托最优的。' },
            { label: '它就是初始禀赋 ω：价格合适时没人愿意交易', ok: false, why: 'ω 处两人的 MRS 不等（还有大片阴影）。均衡离 ω 很远，两人都通过交易变好了。' },
            { label: '它在盒子中心 (5, 5)：竞争让分配趋于平均', ok: false, why: '均衡是 (6.89, 3.88)，不是中心。均衡由禀赋和偏好决定；福利定理只保证有效率，不保证公平。' },
          ],
          onOk: () => api.done(R`<b>契约曲线与第一福利定理。</b>两人无差异曲线相切的点构成契约曲线（帕累托集）。由价格协调的竞争均衡 $p^* = 27/32$ 恰好落在它上面：每人都让 MRS 等于同一个价格比。阿罗（1951）在一般条件下证明了它：任何竞争均衡都是帕累托最优的。你还顺手发现了瓦尔拉斯律 $p\,z_x + z_y \equiv 0$：一个市场出清，另一个自动出清。`),
        }).el);
        sec.append(h.el('h4', { text: '第二步：让拍卖人报价' }),
          h.el('p', { class: 'arrow-note', html: R`盒中的直线是经过 ω、斜率为 $-p$ 的预算线。两个圆点是 A、B 在这个价格下各自最想要的分法（都画在 A 的坐标里）。两点重合时，两个市场都出清。` }),
          ctl2, ro2W, quizBox);

        function record() {
          if (st.part !== 1) return;
          const gap = Math.abs(Math.log(mrsA(st.x, st.y) / mrsB(st.x, st.y)));
          if (gap > 0.1) { api.say(`这里还有互利交易：MRS_A = ${mrsA(st.x, st.y).toFixed(2)}，MRS_B = ${mrsB(st.x, st.y).toFixed(2)}，两条无差异曲线相交而不相切，阴影里的分法让两人都更满意。`, 'bad'); return; }
          if (st.pts.some((q) => Math.abs(q[0] - st.x) < 1.2)) { api.say('这一点离已记录的点太近。到盒子的别处再找一个。', 'bad'); return; }
          st.pts.push([st.x, st.y]);
          if (st.pts.length < 3) api.say(`记下了（第 ${st.pts.length} 个）。两条曲线在这里相切，两人的 MRS 相等。`, 'info');
          else {
            st.part = 2; sec.hidden = false; api.typeset(sec); cv.canvas.style.touchAction = '';
            api.say('这些点连成一条从 O_A 到 O_B 的曲线（虚线）：沿着它的任何移动，都会让一人变好、另一人变差。下面换一种办法到达它。', 'good');
            bRec.disabled = true; checkClear();
          }
          draw();
        }
        function checkClear() {
          if (st.part !== 2) return;
          const d = demand(Math.exp(st.lp));
          if (Math.abs(d.zx) < 0.08 && !st.cleared) { st.cleared = true; quizBox.hidden = false; api.typeset(quizBox); api.say('两个市场同时出清了：两人想要的分法重合。', 'good'); }
        }
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, G = boxGeom(W, Hh), mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          boxFrame(g, G, C);
          if (st.part === 1) {
            const ua = uA(st.x, st.y), ub = uB(st.x, st.y), L = lens(ua, ub);
            st.lens = L.area / (TX * TY);
            if (L.top.length > 1) { // region above A's indifference curve and below B's
              g.fillStyle = C('--accent'); g.globalAlpha = 0.3; g.beginPath();
              L.top.forEach(([x, y], k) => (k ? g.lineTo(G.X(x), G.Y(y)) : g.moveTo(G.X(x), G.Y(y))));
              for (let k = L.bot.length - 1; k >= 0; k--) g.lineTo(G.X(L.bot[k][0]), G.Y(L.bot[k][1]));
              g.closePath(); g.fill(); g.globalAlpha = 1;
            }
            g.lineWidth = 1.8; g.strokeStyle = C('--s1'); drawIC(g, G, ua, AL, 'A');
            g.strokeStyle = C('--s2'); drawIC(g, G, ub, BE, 'B');
          }
          if (st.pts.length >= 3) {
            g.strokeStyle = C('--fg'); g.globalAlpha = 0.7; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath();
            for (let k = 0; k <= 100; k++) { const x = (TX * k) / 100, y = ccY(x); k ? g.lineTo(G.X(x), G.Y(y)) : g.moveTo(G.X(x), G.Y(y)); }
            g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
          }
          st.pts.forEach(([x, y]) => dot(g, G.X(x), G.Y(y), 4.5, C('--good')));
          dot(g, G.X(WA[0]), G.Y(WA[1]), 4, C('--fg'));
          g.font = '12px ' + mono; g.fillStyle = C('--fg'); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('ω', G.X(WA[0]) + 6, G.Y(WA[1]) - 3);
          if (st.part === 1) dot(g, G.X(st.x), G.Y(st.y), 6, null, C('--accent'));
          if (st.part === 2) {
            const p = Math.exp(st.lp), dm = demand(p), bA = dm.a, bB = [TX - dm.b[0], TY - dm.b[1]];
            g.save(); g.beginPath(); g.rect(G.bx, G.by, G.s, G.s); g.clip();
            g.strokeStyle = C('--accent'); g.lineWidth = 2; g.beginPath();
            g.moveTo(G.X(-20), G.Y(WA[1] - p * (-20 - WA[0]))); g.lineTo(G.X(30), G.Y(WA[1] - p * (30 - WA[0]))); g.stroke();
            g.globalAlpha = 0.75; g.lineWidth = 1.3;
            g.strokeStyle = C('--s1'); drawIC(g, G, uA(bA[0], bA[1]), AL, 'A');
            g.strokeStyle = C('--s2'); drawIC(g, G, uB(bB[0], bB[1]), BE, 'B');
            g.globalAlpha = 1; g.restore();
            const inA = (q) => q[0] >= 0 && q[0] <= TX && q[1] >= 0 && q[1] <= TY;
            g.font = '11px ' + mono; g.textBaseline = 'bottom';
            if (inA(bA)) { dot(g, G.X(bA[0]), G.Y(bA[1]), 5.5, C('--s1')); g.fillStyle = C('--s1'); g.textAlign = 'left'; g.fillText('A', G.X(bA[0]) + 7, G.Y(bA[1]) - 2); }
            if (inA(bB)) { dot(g, G.X(bB[0]), G.Y(bB[1]), 5.5, null, C('--s2')); g.fillStyle = C('--s2'); g.textAlign = 'right'; g.fillText('B', G.X(bB[0]) - 7, G.Y(bB[1]) - 2); }
            ro2.a.set(`(${bA[0].toFixed(2)}, ${bA[1].toFixed(2)})`);
            ro2.b.set(`(${dm.b[0].toFixed(2)}, ${dm.b[1].toFixed(2)})`);
            ro2.zx.set((dm.zx >= 0 ? '+' : '') + dm.zx.toFixed(3) + (Math.abs(dm.zx) < 0.08 ? '  出清' : dm.zx > 0 ? '  供不应求' : '  卖不出去'));
            ro2.zy.set((dm.zy >= 0 ? '+' : '') + dm.zy.toFixed(3));
            ro2.w.set((p * dm.zx + dm.zy).toFixed(6));
          }
          ro.u.set(`${uA(st.x, st.y).toFixed(2)} / ${uB(st.x, st.y).toFixed(2)}`);
          ro.m.set(`${mrsA(st.x, st.y).toFixed(2)} / ${mrsB(st.x, st.y).toFixed(2)}`);
          ro.l.set(st.part === 1 ? (100 * st.lens).toFixed(1) + '% 的盒子' : '—');
          ro.n.set(st.pts.length + ' / 3');
        }
        let drag = false;
        function ptr(e) {
          const r = cv.canvas.getBoundingClientRect(), G = boxGeom(cv.w, cv.h), [x, y] = G.inv(e.clientX - r.left, e.clientY - r.top);
          st.x = clamp(x, 0.1, 9.9); st.y = clamp(y, 0.1, 9.9); sx.set(st.x); sy.set(st.y); draw();
        }
        const down = (e) => { if (st.part !== 1) return; drag = true; try { cv.canvas.setPointerCapture(e.pointerId); } catch (_) {} ptr(e); };
        const move = (e) => { if (drag && st.part === 1) ptr(e); };
        const up = () => { drag = false; };
        cv.canvas.addEventListener('pointerdown', down); cv.canvas.addEventListener('pointermove', move);
        cv.canvas.addEventListener('pointerup', up); cv.canvas.addEventListener('pointercancel', up);
        cv.onResize(draw);
        const un = watchTheme(draw);
        draw();
        return { destroy() { cv.destroy(); un(); } };
      },
    };
  }

  /* ===================== 第二关：三种货物、价格三角形 ===================== */
  const LQ = [3, 2, 4];
  function zS(p) {
    const z = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, den = LQ[i] * p[i] + LQ[j] * p[j], t = den > 0 ? (LQ[i] * p[i]) / den : 0;
      z[i] += t * LQ[i]; z[j] += t * LQ[j]; z[i] -= LQ[i];
    }
    return z;
  }
  const PEQ = [4 / 13, 6 / 13, 3 / 13];
  function rk4S(p, dt) {
    const ad = (u, v, s) => u.map((x, i) => x + s * v[i]);
    const k1 = zS(p), k2 = zS(ad(p, k1, dt / 2)), k3 = zS(ad(p, k2, dt / 2)), k4 = zS(ad(p, k3, dt));
    return p.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  const norm1 = (p) => { const s = p[0] + p[1] + p[2]; return p.map((v) => v / s); };
  const E1 = [Math.SQRT1_2, -Math.SQRT1_2, 0], E2 = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)];
  const angOf = (q) => { const d = q.map((v, i) => v - PEQ[i]); return Math.atan2(d[0] * E2[0] + d[1] * E2[1] + d[2] * E2[2], d[0] * E1[0] + d[1] * E1[1] + d[2] * E1[2]); };
  const NG = 12;
  function labelAt(i, j) { // Sperner label: among goods with positive price, the one with the smallest excess demand
    const p = [i / NG, j / NG, (NG - i - j) / NG], z = zS(p); let b = -1;
    for (let k = 0; k < 3; k++) if (p[k] > 1e-12 && (b < 0 || z[k] < z[b])) b = k;
    return b;
  }
  const TRIS = [];
  for (let i = 0; i < NG; i++) for (let j = 0; j < NG - i; j++) {
    TRIS.push([[i, j], [i + 1, j], [i, j + 1]]);
    if (i + j <= NG - 2) TRIS.push([[i + 1, j], [i, j + 1], [i + 1, j + 1]]);
  }
  const vk = (v) => v[0] + ',' + v[1];
  const TRI_OF = new Map(TRIS.map((t, k) => [t.map(vk).sort().join('|'), k]));
  const trisWithEdge = (a, b) => TRIS.map((t, k) => k).filter((k) => { const s = TRIS[k].map(vk); return s.includes(vk(a)) && s.includes(vk(b)); });
  function triGeom(W, Hh) {
    const L = Math.max(160, Math.min(W - 56, ((Hh - 52) * 2) / Math.sqrt(3))), hg = (L * Math.sqrt(3)) / 2, cx = W / 2, top = 24;
    const V = [[cx - L / 2, top + hg], [cx + L / 2, top + hg], [cx, top]];
    const P = (p) => { const s = p[0] + p[1] + p[2]; return [(p[0] * V[0][0] + p[1] * V[1][0] + p[2] * V[2][0]) / s, (p[0] * V[0][1] + p[1] * V[1][1] + p[2] * V[2][1]) / s]; };
    const inv = (x, y) => {
      const d = (V[1][1] - V[2][1]) * (V[0][0] - V[2][0]) + (V[2][0] - V[1][0]) * (V[0][1] - V[2][1]);
      const a = ((V[1][1] - V[2][1]) * (x - V[2][0]) + (V[2][0] - V[1][0]) * (y - V[2][1])) / d;
      const b = ((V[2][1] - V[0][1]) * (x - V[2][0]) + (V[0][0] - V[2][0]) * (y - V[2][1])) / d;
      return [a, b, 1 - a - b];
    };
    return { L, V, P, inv };
  }
  const GOODS = ['小麦', '布', '煤'];
  const STARTS = [[0.45, 0.35, 0.2], [0.2, 0.5, 0.3], [0.34, 0.3, 0.36]];

  function stage2(ctx) {
    return {
      title: '三种货物的拍卖',
      task: R`<p>希克斯在《价值与资本》（1939）里追问：如果拍卖人对供不应求的商品提价、对卖不出去的商品降价，价格会不会走到让<b>所有</b>市场同时出清的地方？自瓦尔拉斯（1874）以来，人们主要靠“方程和未知数一样多”来相信这样的价格存在；1930 年代瓦尔德在很强的假设下证明了几个特例，一般情形仍是悬案。</p>
<p>一个三人三物的小经济（示意）：甲有 3 份小麦，乙有 2 份布，丙有 4 份煤。每人只要两种东西，而且必须按固定比例搭配：甲要小麦和布（3 : 2），乙要布和煤（2 : 4），丙要煤和小麦（4 : 3）。每人卖掉自己的货，按比例买回。只有相对价格有意义，所以取 $p_1+p_2+p_3=1$，画在三角形里：越靠近顶点 $k$，商品 $k$ 越贵。</p>
<p><b>先</b>选一个起点，让拍卖人按 $\dot p = z(p)$ 调价（$z$ 是三种商品的超额需求）。看它能不能找到出清价格。</p>`,
      hints: [
        R`调价只需要观察：让它多转一会儿，轨迹是越转越靠里，还是回到了起点附近？贴标签时注意：三个顶点的标签必然是 1、2、3；底边（$p_3 = 0$，煤免费）上只会出现 1 和 2。`,
        R`把两端标签为 1 和 2 的边叫作“门”。沿底边从 1 走到 2，门的个数必为奇数。从底边的门走进一个小三角形：要么它的第三个顶点是 3（找到了），要么它恰好还有另一扇门，从那扇门出去。这条路不会回头、不会分岔，也不会从别处走出大三角形。`,
        R`沿门走十来次就到了：答案在大三角形中部偏右下，$p \approx (0.31,\ 0.47,\ 0.22)$。精确的均衡满足 $3p_1 = 2p_2 = 4p_3$。`,
      ],
      answer: R`<p><b>拍卖人转圈。</b>这类经济里 $\dot p = z(p)$ 保持 $|p|^2$ 不变（瓦尔拉斯律 $p\cdot z = 0$），还保持 $\sum_i \ln(L_i p_i)/L_i^2$ 不变；两个守恒量把轨迹锁在闭曲线上，它永远绕圈，不收敛（斯卡夫 1960 年的例子，这里换了单位）。</p>
<p><b>均衡仍然存在。</b>给每个价格点贴上“价格为正的商品中超额需求最小者”的编号，这是一个施佩纳标号：顶点 $k$ 标 $k$，$p_k = 0$ 的边上不出现 $k$。施佩纳引理保证有三标签齐全的小三角形；从底边唯一的 1–2 门进入、一路穿门就能走到它（12 等分网格上它的顶点是 $(4,5,3)$、$(3,6,3)$、$(4,6,2)$，均除以 12）。网格加密时这些小三角形收缩到一点，那里 $z_1 = z_2 = z_3$；由 $p\cdot z = 0$ 知它们全为 0。</p>
<p><b>精确解。</b>出清要求每人买回的“份数”恰好是一半，等价于三人禀赋的价值相等：$3p_1 = 2p_2 = 4p_3$，$p \propto (4, 6, 3)$，$p_2/p_1 = 1.5$。</p>`,
      build(body, api) {
        const h = H, C = (n) => ctx.color(n);
        const st = { mode: 'auction', start: STARTS[0].slice(), run: null, orbits: [], loops: 0, quiz1: false,
          lab: new Map(), probes: 0, sel: -1, found: -1, walk: null, path: new Set(), last: null };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.8, minH: 290, maxH: 440 });

        // ---- part A: the auctioneer ----
        const partA = h.el('div', { class: 'arrow-part' }); body.append(partA);
        const ctlA = h.el('div', { class: 'lab-controls' }); partA.append(ctlA);
        const cStart = h.choice({ label: '起点（也可以在三角形里点一下）', value: 0, options: [{ value: 0, label: '起点 1' }, { value: 1, label: '起点 2' }, { value: 2, label: '起点 3' }], onChange: (v) => { st.start = STARTS[v].slice(); draw(); } });
        const bRun = h.button({ label: '让拍卖人开始调价', kind: 'primary', onClick: () => runFrom(st.start) });
        const tField = h.toggle({ label: '显示拍卖人的调价方向', value: false, onChange: draw });
        ctlA.append(cStart.el, h.el('div', { class: 'ctl' }, [h.el('div', { class: 'arrow-btns' }, [bRun])]), tField.el);
        const roW = h.el('div', { class: 'lab-readout' }); partA.append(roW);
        const ro = { p: h.readout('价格 (p₁, p₂, p₃)'), z: h.readout('超额需求 (z₁, z₂, z₃)'), k: h.readout('绕圈') };
        Object.values(ro).forEach((r) => roW.append(r.el));
        const q1 = h.el('div', { hidden: true }); partA.append(q1);
        q1.append(H.quiz({
          question: '拍卖人按“供不应求就提价、卖不出去就降价”调了很久。你看到了什么？',
          options: [
            { label: '价格最终收敛到让三个市场都出清的一点', ok: false, why: '看轨迹：它是闭合的，转了一圈又回到原处，并没有向里收缩。' },
            { label: '价格冲向三角形的边：某种商品最终免费', ok: false, why: '轨迹始终和三条边保持距离。' },
            { label: '价格沿着闭合的环路一直转圈，既不收敛也不发散', ok: true, why: '对。不同起点给出一族嵌套的闭曲线。拍卖人永远到不了出清价格，如果它存在的话。' },
            { label: '这说明根本不存在让三个市场同时出清的价格', ok: false, why: '调价过程不收敛，不等于均衡不存在。到底存不存在，下一步自己去找。' },
          ],
          onOk: () => { if (st.mode !== 'auction') return; st.mode = 'probe'; stopRun(); partA.hidden = true; secB.hidden = false; api.typeset(secB); api.say('换一种办法：不模拟调价，直接在价格三角形上找。', 'info'); draw(); },
        }).el);

        // ---- part B: labels ----
        const secB = h.el('div', { class: 'arrow-sec', hidden: true }); body.append(secB);
        const sTri = h.slider({ label: '选中的小三角形（键盘用）', min: 1, max: TRIS.length, step: 1, value: 1, format: (v) => '#' + v, onInput: (v) => { st.sel = v - 1; draw(); } });
        const bProbe = h.button({ label: '查看选中小三角形的三个顶点', onClick: () => { if (st.sel < 0) st.sel = 0; probeTri(st.sel); } });
        const bWalk = h.button({ label: '按“门”自动走一步', onClick: walkStep });
        const walkBox = h.el('div', { hidden: true }, [h.el('p', { class: 'arrow-note', html: '问了不少次还没找到？这个按钮从底边出发，按一条固定的规则一步一步走，每步只问一个点。看看它是怎么走的。' }), h.el('div', { class: 'arrow-btns' }, [bWalk])]);
        const bClear = h.button({ label: '清空标签重来', onClick: () => { st.lab.clear(); st.probes = 0; st.found = -1; st.walk = null; st.path.clear(); st.last = null; ansBox.hidden = true; draw(); } });
        const ctlB = h.el('div', { class: 'lab-controls' }, [sTri.el, h.el('div', { class: 'ctl' }, [h.el('div', { class: 'arrow-btns' }, [bProbe, bClear])])]);
        const roBW = h.el('div', { class: 'lab-readout' });
        const roB = { n: h.readout('已询问的价格点'), q: h.readout('最近一次询问'), f: h.readout('三标签齐全的小三角形') };
        Object.values(roB).forEach((r) => roBW.append(r.el));
        const ansBox = h.el('div', { class: 'arrow-sec', hidden: true });
        const ans = H.answer({
          label: R`从你找到的小三角形读出均衡价格比 $p_2/p_1$ ≈ ?（容差 ±5%）`, placeholder: 'p₂/p₁',
          check: (v) => {
            if (Math.abs(v - 1.5) <= 0.075) return { ok: true, msg: R`对。精确值 $p_2/p_1 = 3/2$。` };
            if (Math.abs(v - 2 / 3) < 0.04) return { ok: false, msg: R`这是 $p_1/p_2$，倒过来。` };
            if (Math.abs(v - 1) < 0.05) return { ok: false, msg: '1 是三人禀赋一样多时的答案。这里甲 3 份、乙 2 份、丙 4 份。' };
            return { ok: false, msg: '不对。用小三角形重心的价格算一下。' };
          },
          onOk: () => api.done(R`<b>均衡存在，拍卖人却找不到它。</b>你用的标签是一个<b>施佩纳标号</b>：施佩纳引理（1928）保证三标签齐全的小三角形存在，而且“沿门走”一定能走到；网格无限加密，它收缩到 $z = 0$ 的点。这正是布劳威尔不动点定理的组合核心，阿罗与德布鲁（1954）用不动点定理证明了一般均衡的存在。斯卡夫在 1960 年给出这种永远绕圈的经济，1967 年又把“沿门走”变成了计算均衡的算法。精确解 $3p_1 = 2p_2 = 4p_3$：三人禀赋价值相等。`),
        });
        const roC = h.readout('小三角形重心处', '—');
        ansBox.append(h.el('div', { class: 'lab-readout' }, [roC.el]), ans.el);
        secB.append(h.el('h4', { text: '第二步：给价格贴标签' }),
          h.el('p', { class: 'arrow-note', html: R`三角形的每边被 12 等分。在一个价格点上问市场：在价格为正的商品中，<b>哪一种的超额需求最小</b>（最卖不动）？把它的编号 1、2、3 当作这个点的标签（顶点和边上，价格为 0 的商品不参评）。点击一个小三角形就能看到它三个顶点的标签，每看一个新点算一次询问。目标：找到一个<b>三个顶点标签各不相同</b>的小三角形。` }),
          ctlB, roBW, walkBox, ansBox);

        /* --- auctioneer dynamics --- */
        function runFrom(p0) {
          stopRun();
          st.run = { p: norm1(p0), pts: [norm1(p0)], wind: 0, prev: angOf(norm1(p0)), frames: 0 };
          st.orbits.push(st.run.pts); if (st.orbits.length > 6) st.orbits.shift();
          if (ctx.reduced) { while (st.run && advance(0.02)) {} draw(); return; }
          lp.start();
        }
        function stopRun() { if (st.run) st.run = null; lp.stop(); }
        function advance(simT) { // returns false when the run should stop
          const r = st.run; if (!r) return false;
          const n = Math.max(1, Math.ceil(simT / 0.002)), dt = simT / n;
          for (let k = 0; k < n; k++) {
            r.p = rk4S(r.p, dt);
            const q = norm1(r.p), a = angOf(q); let d = a - r.prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
            r.wind += d; r.prev = a;
            const l = r.pts[r.pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.002) r.pts.push(q);
          }
          const loops = Math.abs(r.wind) / (2 * Math.PI);
          st.loops = Math.max(st.loops, loops);
          if (loops >= 1 && !st.quiz1) { st.quiz1 = true; q1.hidden = false; api.typeset(q1); api.say('价格绕着某个点转了整整一圈，又回到了出发点附近。', 'info'); }
          const q = norm1(r.p);
          if (loops >= 2.2 || Math.min(...q) < 0.004 || r.pts.length > 6000) { st.run = null; return false; }
          return true;
        }
        const lp = h.loop((dt) => {
          if (!st.run) { lp.stop(); return; }
          const going = advance(Math.max(0.004, dt * 0.45));
          draw();
          if (!going) lp.stop();
        });

        /* --- labels and the door walk --- */
        const getLab = (v) => st.lab.get(vk(v));
        function probe(v) {
          if (!st.lab.has(vk(v))) { st.lab.set(vk(v), labelAt(v[0], v[1])); st.probes++; }
          st.last = v;
        }
        function isFull(k) { const ls = TRIS[k].map(getLab); return ls.every((x) => x != null) && new Set(ls).size === 3; }
        function afterProbe() {
          if (st.found < 0) for (let k = 0; k < TRIS.length; k++) if (isFull(k)) { st.found = k; break; }
          if (st.found >= 0 && ansBox.hidden) {
            ansBox.hidden = false; api.typeset(ansBox);
            const c = TRIS[st.found].reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]).map((x) => x / (3 * NG)), pc = [c[0], c[1], 1 - c[0] - c[1]], zc = zS(pc);
            roC.set(`p = (${pc.map((x) => x.toFixed(3)).join(', ')})，z = (${zc.map((x) => (x >= 0 ? '+' : '') + x.toFixed(2)).join(', ')})`);
            api.say(`找到了：三个顶点标签是 1、2、3。你一共问了 ${st.probes} 个价格点（网格上共有 91 个）。`, 'good');
          }
          if (st.probes >= 12 && st.found < 0) walkBox.hidden = false;
          draw();
        }
        function probeTri(k) { st.sel = k; sTri.set(k + 1); TRIS[k].forEach(probe); afterProbe(); }
        function walkStep() {
          if (st.found >= 0) return;
          let w = st.walk;
          if (!w) { w = st.walk = { a: 0, b: NG, tri: -1, door: null }; } // bisection on the bottom edge: vertex (i, NG − i); i = 0 → label 2, i = NG → label 1
          if (w.tri < 0) {
            const vA = [w.a, NG - w.a], vB = [w.b, NG - w.b];
            probe(vA); probe(vB);
            if (w.b - w.a > 1) {
              const m = Math.floor((w.a + w.b) / 2), vm = [m, NG - m]; probe(vm);
              if (getLab(vm) === 0) w.b = m; else w.a = m;
              afterProbe(); return;
            }
            const k = TRI_OF.get([[w.a, NG - w.a - 1], [w.a + 1, NG - w.a - 1], [w.a, NG - w.a]].map(vk).sort().join('|'));
            w.tri = k; w.door = [vA, vB]; st.path.add(k);
          }
          const T = TRIS[w.tri], dk = w.door.map(vk), third = T.find((v) => !dk.includes(vk(v)));
          probe(third);
          const l3 = getLab(third);
          if (l3 !== 2) {
            const other = w.door.find((v) => getLab(v) !== l3), nxt = trisWithEdge(third, other).filter((k) => k !== w.tri);
            if (nxt.length) { w.tri = nxt[0]; w.door = [third, other]; st.path.add(w.tri); st.sel = w.tri; sTri.set(w.tri + 1); }
          }
          afterProbe();
        }

        /* --- drawing --- */
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, T = triGeom(W, Hh), mono = C('--mono-font') || 'monospace', S = [C('--s1'), C('--s2'), C('--s3')];
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          g.strokeStyle = C('--line'); g.lineWidth = 1.2; g.beginPath(); g.moveTo(...T.V[0]); g.lineTo(...T.V[1]); g.lineTo(...T.V[2]); g.closePath(); g.stroke();
          g.font = '11px ' + mono; g.textBaseline = 'top';
          g.fillStyle = S[0]; g.textAlign = 'left'; g.fillText('1 ' + GOODS[0], T.V[0][0] - 10, T.V[0][1] + 6);
          g.fillStyle = S[1]; g.textAlign = 'right'; g.fillText(GOODS[1] + ' 2', T.V[1][0] + 10, T.V[1][1] + 6);
          g.fillStyle = S[2]; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('3 ' + GOODS[2], T.V[2][0], T.V[2][1] - 6);
          const probeMode = st.mode === 'probe';
          if (probeMode) {
            // grid, path, found, selection
            g.strokeStyle = C('--grid'); g.lineWidth = 1;
            for (let k = 1; k < NG; k++) {
              const f = k / NG, seg = (a, b) => { g.beginPath(); g.moveTo(...T.P(a)); g.lineTo(...T.P(b)); g.stroke(); };
              seg([f, 1 - f, 0], [f, 0, 1 - f]); seg([1 - f, f, 0], [0, f, 1 - f]); seg([1 - f, 0, f], [0, 1 - f, f]);
            }
            const fillTri = (k, col, al) => { const vs = TRIS[k].map((v) => T.P([v[0], v[1], NG - v[0] - v[1]])); g.globalAlpha = al; g.fillStyle = col; g.beginPath(); g.moveTo(...vs[0]); g.lineTo(...vs[1]); g.lineTo(...vs[2]); g.closePath(); g.fill(); g.globalAlpha = 1; };
            st.path.forEach((k) => fillTri(k, C('--accent'), 0.18));
            if (st.found >= 0) fillTri(st.found, C('--good'), 0.45);
            if (st.sel >= 0) { const vs = TRIS[st.sel].map((v) => T.P([v[0], v[1], NG - v[0] - v[1]])); g.strokeStyle = C('--accent'); g.lineWidth = 2; g.beginPath(); g.moveTo(...vs[0]); g.lineTo(...vs[1]); g.lineTo(...vs[2]); g.closePath(); g.stroke(); }
            // doors: edges with labels {1,2}
            g.strokeStyle = C('--fg'); g.lineWidth = 3;
            TRIS.forEach((t) => { for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], la = getLab(a), lb = getLab(b); if (la != null && lb != null && la !== lb && la + lb === 1) { g.beginPath(); g.moveTo(...T.P([a[0], a[1], NG - a[0] - a[1]])); g.lineTo(...T.P([b[0], b[1], NG - b[0] - b[1]])); g.stroke(); } } });
          }
          // auctioneer orbits (kept faint in probe mode)
          st.orbits.forEach((pts, k) => {
            const cur = st.run && pts === st.run.pts;
            g.strokeStyle = cur ? C('--accent') : C('--muted'); g.globalAlpha = probeMode ? 0.35 : cur ? 1 : 0.55; g.lineWidth = cur ? 2 : 1.3;
            g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(...T.P(q)) : g.moveTo(...T.P(q)))); g.stroke(); g.globalAlpha = 1;
          });
          if (!probeMode) {
            if (tField.get()) { // direction field of ṗ = z(p), projected to the simplex
              g.strokeStyle = C('--muted'); g.lineWidth = 1;
              for (let a = 1; a < 10; a++) for (let b = 1; b < 10 - a; b++) {
                const p = [a / 10, b / 10, 1 - a / 10 - b / 10], z = zS(p), sz = z[0] + z[1] + z[2], d = z.map((v, i) => v - sz * p[i]);
                const [x0, y0] = T.P(p), q2 = p.map((v, i) => v + 0.03 * d[i] / Math.max(0.5, Math.hypot(...d))), [x1, y1] = T.P(q2);
                g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); dot(g, x1, y1, 1.6, C('--muted'));
              }
            }
            const cur = st.run ? norm1(st.run.p) : st.start;
            dot(g, ...T.P(st.start), 4, null, C('--fg'));
            dot(g, ...T.P(cur), 5, C('--accent'));
            const z = zS(cur);
            ro.p.set(cur.map((v) => v.toFixed(3)).join(', '));
            ro.z.set(z.map((v) => (v >= 0 ? '+' : '') + v.toFixed(2)).join(', '));
            ro.k.set(st.loops.toFixed(2) + ' 圈');
          } else {
            // probed labels
            g.font = 'bold 11px ' + mono; g.textAlign = 'center'; g.textBaseline = 'middle';
            for (const [key, l] of st.lab) {
              const [i, j] = key.split(',').map(Number), [x, y] = T.P([i, j, NG - i - j]);
              dot(g, x, y, 7, C('--panel'), S[l]); g.fillStyle = S[l]; g.fillText(String(l + 1), x, y + 0.5);
            }
            roB.n.set(st.probes + ' / 91');
            if (st.last) { const v = st.last, p = [v[0] / NG, v[1] / NG, (NG - v[0] - v[1]) / NG]; roB.q.set(`p = (${p.map((x) => x.toFixed(2)).join(', ')}) → ${getLab(v) + 1}`); } else roB.q.set('—');
            roB.f.set(st.found >= 0 ? '找到了' : '还没有');
          }
        }
        function onPtr(e) {
          const r = cv.canvas.getBoundingClientRect(), T = triGeom(cv.w, cv.h), b = T.inv(e.clientX - r.left, e.clientY - r.top);
          if (b.some((x) => x < -0.01)) return;
          if (st.mode === 'auction') {
            if (Math.min(...b) < 0.05) { api.say('起点离边太近了，选靠里一点的位置。', 'info'); return; }
            st.start = b; runFrom(b); return;
          }
          const A = clamp(b[0], 0, 1) * NG, B = clamp(b[1], 0, 1) * NG; let i = Math.min(NG - 1, Math.floor(A)), j = Math.min(NG - 1 - i, Math.floor(B));
          const up = A - i + (B - j) < 1 || i + j >= NG - 1;
          const verts = up ? [[i, j], [i + 1, j], [i, j + 1]] : [[i + 1, j], [i, j + 1], [i + 1, j + 1]];
          const k = TRI_OF.get(verts.map(vk).sort().join('|'));
          if (k != null) probeTri(k);
        }
        cv.canvas.addEventListener('pointerdown', onPtr);
        cv.onResize(draw);
        const un = watchTheme(draw);
        draw();
        return { destroy() { lp.stop(); cv.destroy(); un(); cv.canvas.removeEventListener('pointerdown', onPtr); } };
      },
    };
  }

  /* ===================== 第三关：三个人怎样投票 ===================== */
  const ORD = ['ABC', 'ACB', 'BAC', 'BCA', 'CAB', 'CBA'];
  const PAIRS = [['A', 'B'], ['B', 'C'], ['A', 'C']];
  const prefers = (o, x, y) => o.indexOf(x) < o.indexOf(y);
  const PROFILES = []; for (const a of ORD) for (const b of ORD) for (const c of ORD) PROFILES.push([a, b, c]);
  const PMASK = PROFILES.map((pr) => PAIRS.map(([x, y]) => pr.reduce((m, o, k) => m | (prefers(o, x, y) ? 1 << k : 0), 0)));
  const cyclic = (s) => (s[0] && s[1] && !s[2]) || (!s[0] && !s[1] && s[2]); // s = [A≻B, B≻C, A≻C]
  const ROWS = [0, 1, 2, 4, 3, 5, 6, 7];
  const COAL = { 0: '无人', 1: '只有 1', 2: '只有 2', 4: '只有 3', 3: '1 和 2', 5: '1 和 3', 6: '2 和 3', 7: '三人全体' };
  const popc = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
  function exhaustive() { // all 2^18 rules; returns the acyclic ones as [r0, r1, r2] (6-bit masks for coalitions 1..6)
    const out = [];
    for (let r0 = 0; r0 < 64; r0++) for (let r1 = 0; r1 < 64; r1++) for (let r2 = 0; r2 < 64; r2++) {
      const Rr = [r0, r1, r2]; let ok = true;
      for (const pm of PMASK) {
        const s = [0, 1, 2].map((q) => (pm[q] === 0 ? false : pm[q] === 7 ? true : !!((Rr[q] >> (pm[q] - 1)) & 1)));
        if (cyclic(s)) { ok = false; break; }
      }
      if (ok) out.push(Rr);
    }
    return out;
  }
  const dictatorOfBits = (Rr) => [0, 1, 2].find((k) => [0, 1, 2].every((q) => [1, 2, 3, 4, 5, 6].every((m) => !!((Rr[q] >> (m - 1)) & 1) === !!((m >> k) & 1))));

  function stage3(ctx) {
    return {
      title: '三个人怎样投票',
      task: R`<p>1948 年夏天，兰德公司。博弈论把国家当作有偏好的“玩家”，可一个国家由许多人组成。能不能把每个人对选项的排序<b>合成</b>一个社会的排序？</p>
<p>三位选民、三个选项 A、B、C，每人交一张严格排序。你来设计合成规则，要求：</p>
<ol><li>任何一种排序组合都能处理（共 $6^3 = 216$ 种）；</li><li>三人都认为 $x$ 好于 $y$ 时，社会也认为 $x$ 好于 $y$；</li><li>社会怎样比较 $x$ 与 $y$，只取决于每个人怎样比较 $x$ 与 $y$，与第三个选项无关；</li><li>不能是“某一个人说了算”。</li></ol>
<p>条件 3 让任何规则都能写成下面这张表：对每一对选项，列出“哪些人偏好前者”时谁胜出（第一行和最后一行由条件 2 锁定）。表格一开始是多数决。社会排序必须没有循环，即不能出现 A ≻ B ≻ C ≻ A（简化：社会排序也要求严格，不许平局）。点击格子修改规则，再用全部 216 种投票组合检验。</p>`,
      hints: [
        R`先看反例：三张选票 A≻B≻C、B≻C≻A、C≻A≻B 是孔多塞（1785）发现的投票悖论。多数决下每一对都是 2 : 1，却连成了环。改掉环上的某一格，看看循环搬到了哪里。`,
        R`表里每一格都在说“某个联盟能否在某一对上压过其余的人”。若联盟 $S$ 在某一对 $(x,y)$ 上能压过所有反对者，构造一张“$S$：$x\succ y\succ z$，其余：$y \succ z$ 且 $y\succ x$”的选票，再用传递性，就能证明 $S$ 在 $(x,z)$ 上也说了算。说了算的权力会从一对扩散到每一对。`,
        R`再把一个说了算的联盟拆成两半：总有一半也说了算。一直拆到只剩一个人。所以通过检验的规则只能是某一个人说了算。试着把三列都按同一个人的意见填，检验，然后让计算机穷举全部规则。`,
      ],
      answer: R`<p>多数决在孔多塞选票 (A≻B≻C, B≻C≻A, C≻A≻B) 上给出 A≻B≻C≻A。条件 1–3 下，满足无循环的规则只有三种：三个“独裁者”规则（穷举全部 $2^{18} = 262\,144$ 种表格可以验证）。这就是<b>阿罗不可能性定理</b>（1951）：选项至少 3 个时，没有规则能同时满足无限制定义域、帕累托一致性、无关选项独立性与非独裁。</p>
<p>证明梗概（决定性联盟）：(i) <i>扩散</i>：若 $S$ 在某一对 $(x,y)$ 上能压过全体反对者，则对 $z$，取选票“$S$：$x\succ y\succ z$；其余：$y\succ z$，$y\succ x$”，社会有 $x\succ y$（$S$）、$y\succ z$（一致），由传递性 $x\succ z$；而在 $(x,z)$ 上只有 $S$ 的态度是确定的，由条件 3，$S$ 在 $(x,z)$ 上说了算；同理推到所有对。(ii) <i>收缩</i>：说了算的 $S = S_1\cup S_2$，取“$S_1$：$x\succ y\succ z$；$S_2$：$z\succ x\succ y$；其余：$y\succ z\succ x$”，社会 $x\succ y$；若 $x\succ z$ 则 $S_1$ 说了算，若 $z\succ x$ 则 $z\succ y$，$S_2$ 说了算。全体是决定性的（条件 2），反复收缩得到一个人：独裁者。</p>`,
      build(body, api) {
        const h = H;
        const rule = PAIRS.map(() => Array.from({ length: 8 }, (_, m) => popc(m) >= 2)); // true: first of the pair wins
        let checks = 0, sawDict = false, exDone = false;
        const wrap = h.el('div', { class: 'dtable arrow-rule' }); body.append(wrap);
        const cells = PAIRS.map(() => []);
        const table = h.el('table');
        const thead = h.el('tr', {}, [h.el('th', { text: '谁偏好前者' }), ...PAIRS.map(([x, y]) => h.el('th', { text: `${x} 对 ${y}` }))]);
        table.append(h.el('thead', {}, [thead]));
        const tb = h.el('tbody'); table.append(tb);
        ROWS.forEach((m) => {
          const tr = h.el('tr', {}, [h.el('td', { text: COAL[m] + (m === 0 || m === 7 ? '（固定）' : '') })]);
          PAIRS.forEach(([x, y], q) => {
            const b = h.el('button', { type: 'button', class: 'arrow-cell' });
            b.addEventListener('click', () => { rule[q][m] = !rule[q][m]; paint(); });
            if (m === 0 || m === 7) b.disabled = true;
            cells[q][m] = b; tr.append(h.el('td', {}, [b]));
          });
          tb.append(tr);
        });
        wrap.append(table);
        function paint() {
          PAIRS.forEach(([x, y], q) => ROWS.forEach((m) => {
            const b = cells[q][m], w = rule[q][m] ? x : y;
            b.textContent = w; b.dataset.w = rule[q][m] ? '0' : '1';
            b.setAttribute('aria-label', `${COAL[m]}偏好 ${x} 胜过 ${y} 时，社会选 ${w}`);
          }));
        }
        const bCheck = h.button({ label: '用全部 216 种投票组合检验', kind: 'primary', onClick: check });
        const bMaj = h.button({ label: '恢复多数决', onClick: () => { PAIRS.forEach((_, q) => { for (let m = 0; m < 8; m++) rule[q][m] = popc(m) >= 2; }); paint(); } });
        body.append(h.el('div', { class: 'arrow-btns' }, [bCheck, bMaj]));
        const out = h.el('div', { class: 'arrow-out', 'aria-live': 'polite' }); body.append(out);
        const exSec = h.el('div', { class: 'arrow-sec', hidden: true }); body.append(exSec);
        const exOut = h.el('div', { class: 'arrow-out' });
        const quizBox = h.el('div', { hidden: true });
        exSec.append(h.el('h4', { text: '让计算机试遍所有规则' }),
          h.el('p', { class: 'arrow-note', html: R`表中可改的格子有 $3\times 6 = 18$ 个，所以满足条件 1–3 的规则一共 $2^{18} = 262\,144$ 种。逐一用 216 种投票组合检验。` }),
          h.el('div', { class: 'arrow-btns' }, [h.button({ label: '穷举全部 262 144 种规则', onClick: runEx })]), exOut, quizBox);
        quizBox.append(H.quiz({
          question: '从穷举结果，你得出什么结论？',
          options: [
            { label: '再多试一会儿，应该能找到满足全部四条的规则', ok: false, why: '穷举已经覆盖了满足条件 1–3 的每一种规则。' },
            { label: '多数决的毛病只是会平局，定一个打破平局的办法就好', ok: false, why: '三人对两个选项投票不会平局。循环来自选票组合本身，这是孔多塞悖论。' },
            { label: '满足条件 1–3 且不循环的规则只有独裁：四条要求不可能同时满足', ok: true, why: '对。这就是阿罗的不可能性定理。' },
            { label: '问题出在某些选民的偏好自相矛盾', ok: false, why: '每位选民交的都是传递的排序。不传递的是合成出来的社会偏好。' },
          ],
          onOk: () => api.done(R`<b>阿罗不可能性定理（1951）。</b>选项至少有 3 个时，没有任何规则能同时满足：无限制定义域、帕累托一致、无关选项独立、非独裁。你在 3×3 的情形里亲手撞上了它：多数决会循环（孔多塞悖论），堵住一处循环，它就从别处冒出来，唯一的出路是让一个人说了算。阿罗证明这对任意人数都成立。证明的骨架正是提示里的两步：决定权从一对选项扩散到所有对，再从联盟收缩到一个人。`),
        }).el);

        const fmtOrd = (o) => o.split('').join(' ≻ ');
        function check() {
          checks++;
          const bad = [];
          PMASK.forEach((pm, k) => { const s = [0, 1, 2].map((q) => rule[q][pm[q]]); if (cyclic(s)) bad.push(k); });
          const dict = [0, 1, 2].find((k) => [0, 1, 2].every((q) => [1, 2, 3, 4, 5, 6].every((m) => rule[q][m] === !!((m >> k) & 1))));
          if (bad.length) {
            const k = bad[0], pr = PROFILES[k], s = [0, 1, 2].map((q) => rule[q][PMASK[k][q]]);
            const rel = PAIRS.map(([x, y], q) => (s[q] ? `${x} ≻ ${y}` : `${y} ≻ ${x}`)).join('，');
            out.innerHTML = `<div class="bad">216 种投票组合里有 <b>${bad.length}</b> 种会产生循环。例如：</div>
<div class="arrow-mono">选民 1：${fmtOrd(pr[0])}<br>选民 2：${fmtOrd(pr[1])}<br>选民 3：${fmtOrd(pr[2])}</div>
<div>社会：${rel} <span class="bad">⟲ 循环</span></div>`;
          } else if (dict != null) {
            sawDict = true;
            out.innerHTML = `<div class="good">216 种组合全部给出不循环的社会排序！</div><div class="bad">可是看看你的表：在每一对选项上，结果都只跟着<b>选民 ${dict + 1}</b> 走。这违反了第 4 条：选民 ${dict + 1} 是独裁者。</div>`;
          } else out.innerHTML = '<div class="good">没有循环。</div>';
          if ((checks >= 3 || sawDict) && exSec.hidden) { exSec.hidden = false; api.typeset(exSec); }
        }
        function runEx() {
          if (exDone) return;
          const t0 = performance.now(), res = exhaustive(), ms = performance.now() - t0;
          exDone = true;
          exOut.innerHTML = `<div>用时 ${ms.toFixed(0)} ms。在 262 144 种规则中，对 216 种投票组合都不产生循环的有 <b>${res.length}</b> 种：</div>
<div class="arrow-mono">${res.map((Rr) => { const d = dictatorOfBits(Rr); return d != null ? `选民 ${d + 1} 说了算（每一格都照抄选民 ${d + 1}）` : '非独裁规则'; }).join('<br>')}</div>`;
          quizBox.hidden = false; api.typeset(quizBox);
        }
        paint();
        return { destroy() {} };
      },
    };
  }

  CHALLENGES.arrow = {
    title: '均衡与选择',
    _m: { demand, PSTAR, ccY, mrsA, mrsB, zS, PEQ, labelAt, TRIS, exhaustive, PMASK, cyclic },
    mount(root, ctx) {
      injectStyle();
      return H.stages(root, ctx, [stage1(ctx), stage2(ctx), stage3(ctx)]);
    },
  };
})();
