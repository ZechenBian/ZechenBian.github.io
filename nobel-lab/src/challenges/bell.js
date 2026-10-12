/* 局域实在论的检验 — Aspect, Clauser, Zeilinger, Nobel Physics 2022 (challenge)
 * Stage 1: CHSH game, win iff a⊕b = x·y. 16 deterministic local strategies, each wins ≤ 3 of 4 inputs (parity);
 *   mixtures average ⇒ p ≤ 3/4. With ±1 outcomes P(win|xy) = (1 ± E_xy)/2 ⇒ p = 1/2 + S/8, S = E00+E01+E10−E11 ≤ 2.
 * Stage 2: polarization-entangled pair |Φ+⟩ = (|HH⟩+|VV⟩)/√2, two-channel polarizers (±1), ideal (简化):
 *   P(same) = cos²(a−b) ⇒ E(a,b) = cos 2(a−b). Optimum a=0, a′=45°, b=22.5°, b′=157.5° ⇒ S = 2√2 (Tsirelson).
 *   Bell's 1964 local toy model for comparison: E_loc(θ) = 1 − 4|θ|/π for |θ| ≤ 90°.
 * Stage 3: detection loophole: "card" model (λ = (x₀,y₀) + pre-agreed answers; a side fires only if its setting matches)
 *   ⇒ coincidence-only S = 4; no-click → +1 ⇒ S = 1.5. Entangled pairs with per-side efficiency η, no-click → +1:
 *   E = η² cos2Δ + (1−η)² ⇒ S(η) = 2√2 η² + 2(1−η)² > 2 ⇔ η > 2/(1+√2) ≈ 0.828 (Garg–Mermin 1987).
 *   Locality: stations at ±6 m (Aspect 1982: 12 m), c = 0.2998 m/ns; a setting choice must be spacelike to the other
 *   detection (t > 20 − 40 ns) and to the emission (|t| < 20 ns) ⇒ window 40 ns.
 */
(() => {
  const R = String.raw;
  const D2R = Math.PI / 180, C_MNS = 0.299792458, SQ8 = 2 * Math.SQRT2;
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = (rnd) => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const binom = (rnd, n, p) => Math.max(0, Math.min(n, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss(rnd))));
  function watchTheme(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', fn);
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-bell')) return;
    const s = document.createElement('style'); s.id = 'st-bell';
    s.textContent = `
.bell-sec[hidden]{display:none}
.bell-sec{display:grid;gap:12px;border-top:1px dashed var(--line);padding-top:10px}
.bell-sec h4{margin:0;font-size:14px}
.bell-note{font-size:13px;color:var(--muted);margin:0;line-height:1.65}
.bell-row{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:flex-start}
.bell-row>*{min-width:0;max-width:100%}
.bell-bit,.bell-cell{font:inherit;font-family:var(--mono-font);font-size:12.5px;min-width:3em;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer}
.bell-bit[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}
.bell-cell[data-w="3"]{border-color:var(--good);color:var(--good)}
.bell-cell[data-cur="true"]{box-shadow:inset 0 0 0 1.5px var(--accent)}
.dtable td.bell-win{color:var(--good)}
.dtable td.bell-lose{color:var(--warn)}
.dtable .bell-c td,.dtable .bell-c th{text-align:center}
.dtable .bell-g td,.dtable .bell-g th{padding:4px 5px}
.dtable th.bell-wrap{white-space:normal;max-width:5.5em;line-height:1.3}`;
    document.head.append(s);
  }
  const sec = (title, hidden) => { const d = H.el('div', { class: 'bell-sec', hidden: !!hidden }); if (title) d.append(H.el('h4', { text: title })); return d; };

  /* ---------- Stage 1: the CHSH game with local strategies ---------- */
  function stage1() {
    return {
      title: '相隔两地的默契',
      task: R`<p>1964 年，贝尔把 EPR 的争论变成了一个可以计算的问题。用今天的语言，它是一个游戏。爱丽丝和鲍勃分处两个房间，不能通信。每一轮，裁判给爱丽丝一个随机比特 $x$，给鲍勃一个随机比特 $y$，四种组合等可能；两人各答一个比特 $a$、$b$。<b>获胜条件</b>：$a\oplus b = x\cdot y$，即两人都收到 1 时答案必须不同，其余三种情况答案必须相同。</p>
<p>开局前两人可以商量任何策略，也可以共享任意多的随机数；开局后每人的答案只能依赖自己收到的比特和事先共享的东西。这就是“局域隐变量”：事先共享的一切记作 $\lambda$。</p>
<p>在下面设定一种确定性策略（点按钮切换 0/1），看它在四种输入下的输赢；下方 16 格是全部确定性策略，点一格即载入。最多能赢多少？</p>`,
      hints: [
        R`一种确定性策略就是 4 个比特 $(a_0, a_1, b_0, b_1)$。能不能让四个条件 $a_x\oplus b_y = xy$ 同时成立？试着把四个等式加起来（模 2）。`,
        R`左边每个变量恰好出现两次，和为 0；右边是 $0+0+0+1 = 1$。矛盾，所以每种确定性策略最多赢 3 种输入。共享随机数等于按某个概率分布挑选确定性策略，胜率是加权平均。`,
        R`胜率最大是 $3/4$。换成 $\pm1$：$P(\text{赢}\mid x,y) = \tfrac12(1 + E_{xy})$（$xy = 0$），$\tfrac12(1 - E_{11})$（$xy = 1$），所以 $p = \tfrac12 + S/8$。`,
      ],
      answer: R`确定性策略由 $(a_0,a_1,b_0,b_1)$ 决定，共 16 种。四个获胜条件 $a_x\oplus b_y = xy$ 不能同时成立：把它们模 2 相加，左边每个变量出现两次，和为 0，右边为 1。所以每种确定性策略至多赢 3 种输入，例如两人永远答 0。共享随机数只是按概率在确定性策略之间挑选，胜率是加权平均，仍不超过 $3/4$。写成 $\pm1$ 的相关函数，$p = \tfrac12 + \tfrac S8$，所以 $p\le\tfrac34$ 等价于 $S = E_{00}+E_{01}+E_{10}-E_{11}\le 2$。这就是 CHSH 不等式（Clauser、Horne、Shimony、Holt 1969）。`,
      build(body, api) {
        const h = H, s = [0, 0, 0, 0], tested = new Map(), IN = [[0, 0], [0, 1], [1, 0], [1, 1]], LB = ['00', '01', '10', '11'];
        let seed = 1969;
        const keyOf = (q) => (q[0] << 3) | (q[1] << 2) | (q[2] << 1) | q[3];
        const winOf = (q, x, y) => ((x ? q[1] : q[0]) ^ (y ? q[3] : q[2])) === (x & y);
        const winsOf = (q) => IN.reduce((w, [x, y]) => w + (winOf(q, x, y) ? 1 : 0), 0);
        const bits = [];
        const bitBtn = (i) => (bits[i] = h.el('button', { type: 'button', class: 'bell-bit', onclick: () => { s[i] ^= 1; update(); } }));
        const ed = h.el('div', { class: 'dtable' }, h.el('table', { class: 'bell-c' }, [
          h.el('thead', {}, h.el('tr', {}, [h.el('th', { text: '策略' }), h.el('th', { text: '收到 0 时' }), h.el('th', { text: '收到 1 时' })])),
          h.el('tbody', {}, [
            h.el('tr', {}, [h.el('td', { text: '爱丽丝' }), h.el('td', {}, bitBtn(0)), h.el('td', {}, bitBtn(1))]),
            h.el('tr', {}, [h.el('td', { text: '鲍勃' }), h.el('td', {}, bitBtn(2)), h.el('td', {}, bitBtn(3))]),
          ]),
        ]));
        const truth = h.el('div', { class: 'dtable' });
        body.append(h.el('div', { class: 'bell-row' }, [ed, truth]));
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        ctl.append(h.el('div', { class: 'ctl' }, h.el('div', {}, [h.button({ label: '用当前策略随机玩 1000 轮', onClick: () => {
          const r = mulberry32(seed++); let w = 0;
          for (let i = 0; i < 1000; i++) if (winOf(s, r() < 0.5 ? 1 : 0, r() < 0.5 ? 1 : 0)) w++;
          api.say(`1000 轮赢了 ${w} 轮（${(w / 10).toFixed(1)}%）。`, 'info');
        } })])));
        const cells = [];
        const gt = h.el('table', { class: 'bell-c bell-g' }, h.el('thead', {}, h.el('tr', {}, [h.el('th', { class: 'bell-wrap', text: '爱丽丝 ＼ 鲍勃' }), ...LB.map((t) => h.el('th', { text: t }))])));
        const tb = h.el('tbody'); gt.append(tb);
        for (let r = 0; r < 4; r++) {
          const tr = h.el('tr', {}, h.el('td', { text: LB[r] }));
          for (let c = 0; c < 4; c++) {
            const k = (r << 2) | c;
            cells[k] = h.el('button', { type: 'button', class: 'bell-cell', 'aria-label': `爱丽丝 ${LB[r]}，鲍勃 ${LB[c]}`, text: '?', onclick: () => { s[0] = r >> 1; s[1] = r & 1; s[2] = c >> 1; s[3] = c & 1; update(); } });
            tr.append(h.el('td', {}, cells[k]));
          }
          tb.append(tr);
        }
        body.append(h.el('p', { class: 'bell-note', text: '全部 16 种确定性策略：行是爱丽丝（收到 0 时答、收到 1 时答），列是鲍勃。格中是这种策略在 4 种输入中赢几种（未检验为 ?）。' }), h.el('div', { class: 'dtable' }, gt));
        const roW = h.el('div', { class: 'lab-readout' });
        const ro = { w: h.readout('当前策略：4 种输入赢'), n: h.readout('已检验的确定性策略'), b: h.readout('目前最好') };
        Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);

        const box = sec('结论'); body.append(box);
        const qBox = h.el('div', { hidden: true }), sBox = h.el('div', { hidden: true });
        let okP = false, okQ = false, okS = false;
        const fin = () => { if (okP && okQ && okS) api.done(R`<b>CHSH 不等式</b>（Clauser、Horne、Shimony、Holt 1969；贝尔 1964 年最先证明了这类不等式）：任何局域隐变量模型都满足 $|S|\le 2$，等价地，这个游戏的胜率不超过 3/4。证明只用了两件事：每一侧的结果只依赖本地设置和 $\lambda$；$\lambda$ 的分布与设置的选择无关。接下来的问题是：量子力学的预言会不会越过这条线？`); };
        const aP = H.answer({
          label: '任何局域策略（含共享随机数）的最大获胜概率 = ?（小数，如 0.6）', placeholder: 'p',
          check: (v) => {
            const p = v > 1 && v <= 100 ? v / 100 : v;
            if (Math.abs(p - 0.75) <= 0.005) return { ok: true, msg: '对：3/4。每种确定性策略至多赢 3 种输入。' };
            if (p >= 0.99) return { ok: false, msg: '找到一种 4 种输入全赢的策略了吗？把四个获胜条件模 2 相加看看。' };
            if (Math.abs(p - 0.5) < 0.01) return { ok: false, msg: '随便乱答就有 1/2。试试“两人永远答 0”。' };
            if (Math.abs(p - 0.854) < 0.01) return { ok: false, msg: '这个数会在后面出现，但它不属于局域策略。' };
            return { ok: false, msg: '不对。看看 16 格里的最好成绩。' };
          },
          onOk: () => { okP = true; qBox.hidden = false; api.typeset(qBox); fin(); },
        });
        qBox.append(H.quiz({
          question: '事先共享随机数（例如掷同一枚硬币决定这一轮用哪种确定性策略）能不能超过这个成绩？',
          options: [
            { label: '能：随机性让两人每轮都能临时协调', ok: false, why: '随机数在开局前就已共享，它不知道裁判这一轮给的 x、y，起不到临时协调的作用。' },
            { label: '不能：随机策略的胜率是确定性策略胜率的加权平均，不超过其中最大的', ok: true, why: R`对。对固定的 $\lambda$，策略是确定性的；$p = \int p(\lambda)\,d\rho(\lambda)\le\max_\lambda p(\lambda) = 3/4$。局域模型构成的集合是这 16 个确定性策略的凸包。` },
            { label: '只有共享无穷多个随机比特才能', ok: false, why: '多少随机数都一样：平均值不会超过最大值。' },
          ],
          onOk: () => { okQ = true; sBox.hidden = false; api.typeset(sBox); fin(); },
        }).el);
        sBox.append(H.answer({
          label: R`把答案写成 $\pm1$：$A_x = (-1)^{a}$，$B_y = (-1)^{b}$，相关函数 $E_{xy} = \langle A_xB_y\rangle$。局域策略能达到的 $S = E_{00}+E_{01}+E_{10}-E_{11}$ 最大值 = ?`, placeholder: 'S',
          check: (v) => {
            if (Math.abs(v - 2) <= 0.01) return { ok: true, msg: R`对：$p = \tfrac12 + S/8 \le \tfrac34$，即 $S\le 2$。` };
            if (Math.abs(v - 4) <= 0.01) return { ok: false, msg: '4 要求四项同时取到 ±1 的最好值，那正是不可能同时满足的四个条件。' };
            if (Math.abs(v - 0.75) <= 0.01) return { ok: false, msg: '这是胜率。每种输入下 P(赢) = (1 ± E)/2，把 p 换算成 S。' };
            return { ok: false, msg: '不对。由 P(赢 | x,y) = (1 ± E_xy)/2 算出 p 与 S 的关系。' };
          },
          onOk: () => { okS = true; fin(); },
        }).el);
        box.append(aP.el, qBox, sBox);

        function update() {
          bits.forEach((b, i) => { b.textContent = '答 ' + s[i]; b.setAttribute('aria-pressed', String(!!s[i])); });
          const k = keyOf(s), w = winsOf(s); tested.set(k, w);
          truth.innerHTML = `<table class="bell-c"><thead><tr><th>x</th><th>y</th><th>a</th><th>b</th><th>a⊕b</th><th>x·y</th><th>结果</th></tr></thead><tbody>${IN.map(([x, y]) => {
            const a = x ? s[1] : s[0], b = y ? s[3] : s[2], ok = (a ^ b) === (x & y);
            return `<tr><td>${x}</td><td>${y}</td><td>${a}</td><td>${b}</td><td>${a ^ b}</td><td>${x & y}</td><td class="${ok ? 'bell-win' : 'bell-lose'}">${ok ? '赢' : '输'}</td></tr>`;
          }).join('')}</tbody></table>`;
          cells.forEach((c, j) => { const t = tested.get(j); c.textContent = t == null ? '?' : t + '/4'; c.dataset.cur = String(j === k); if (t != null) c.dataset.w = String(t); });
          ro.w.set(w + ' / 4'); ro.n.set(tested.size + ' / 16'); ro.b.set(Math.max(...tested.values()) + ' / 4');
        }
        update();
        return { destroy() {} };
      },
    };
  }

  /* ---------- Stage 2: entangled photons ---------- */
  const wrap90 = (d) => { const t = ((d % 180) + 180) % 180; return t >= 90 ? t - 180 : t; }; // polarizer difference in [−90°, 90°)
  const Eqm = (d) => Math.cos(2 * d * D2R);
  const Eloc = (d) => 1 - (4 * Math.abs(wrap90(d))) / 180; // Bell's 1964 local toy model (straight lines)
  function runPairs(rnd, d, N) { // ideal two-channel polarizers on (|HH⟩+|VV⟩)/√2: P(same) = cos²Δ
    const same = binom(rnd, N, Math.cos(d * D2R) ** 2), diff = N - same;
    const pp = binom(rnd, same, 0.5), pm = binom(rnd, diff, 0.5);
    return { pp, mm: same - pp, pm, mp: diff - pm, N, E: (same - diff) / N };
  }
  const PAIRS = [[0, 0], [0, 1], [1, 0], [1, 1]];

  function stage2(ctx) {
    const C = (n) => ctx.color(n);
    return {
      title: '纠缠光子',
      task: R`<p>1972 年，伯克利的 Freedman 与 Clauser 用钙原子的级联辐射产生光子对，两个光子背向飞出，各自穿过一个偏振片。1982 年，奥赛的阿斯佩用激光激发同一种级联，并换上双通道的偏振分束器：每个光子要么从平行于偏振片方向的出口出来（记 $+1$），要么从垂直方向的出口出来（记 $-1$）。</p>
<p>先测关联函数：选定两边偏振片的方向 $a$、$b$，每次测 2000 对，统计 $E = (N_{++} + N_{--} - N_{+-} - N_{-+})/N$。它怎样依赖于两个角度？（这里假设偏振片和探测器都是理想的，属于简化。）</p>
<p>然后让爱丽丝在 $a$、$a'$ 之间、鲍勃在 $b$、$b'$ 之间选择，这就是第 1 关的游戏。能不能让 $S = E(a,b) + E(a,b') + E(a',b) - E(a',b')$ 越过 2？最多能到多少？</p>`,
      hints: [
        R`固定 $a = 0$，把 $b$ 从 0 扫到 90°，再换一个 $a$ 重复，看 $E$ 是否只依赖 $b - a$。注意 0°、45°、90° 这三个角度差分辨不出几种候选函数，要测中间的角度。`,
        R`$E(\theta) = \cos2\theta$，$\theta$ 是两个偏振片的夹角。四个夹角满足 $\theta_4 = \theta_2 + \theta_3 - \theta_1$（$\theta_1 = a-b$，$\theta_2 = a-b'$，$\theta_3 = a'-b$，$\theta_4 = a'-b'$）。试试让 $|\theta_1| = |\theta_2| = |\theta_3| = \theta$、$|\theta_4| = 3\theta$：$S = 3\cos2\theta - \cos6\theta$。`,
        R`$\theta = 22.5°$：$a = 0°$，$a' = 45°$，$b = 22.5°$，$b' = 157.5°$（即 $-22.5°$）。此时 $S = 4\cos45° = 2\sqrt2\approx 2.83$。`,
      ],
      answer: R`实验给出 $E(a,b) = \cos2(a-b)$，与量子力学对 $(|HH\rangle + |VV\rangle)/\sqrt2$ 的预言一致：偏振片 $a$ 对应可观测量 $A(a) = \cos2a\,\sigma_z + \sin2a\,\sigma_x$，$\langle A(a)\otimes A(b)\rangle = \cos2a\cos2b + \sin2a\sin2b$。取 $a = 0°$，$a' = 45°$，$b = 22.5°$，$b' = -22.5°$，三项各为 $\cos45°$，第四项为 $\cos135°$，$S = 2\sqrt2\approx 2.83 \gt 2$。这是量子力学能达到的最大值（齐雷尔松 1980）：令 $\mathcal S = A_0(B_0+B_1) + A_1(B_0-B_1)$，由 $A_x^2 = B_y^2 = 1$ 得 $\mathcal S^2 = 4 - [A_0,A_1][B_0,B_1]$，而 $\|[A_0,A_1]\|\le 2$，所以 $\|\mathcal S\|\le 2\sqrt2$。游戏的胜率因此可达 $\cos^2(\pi/8)\approx 0.854$。阿斯佩、Grangier 与 Roger 1982 年测得 $S = 2.697\pm0.015$，与考虑了仪器不完美后的量子预言 $2.70\pm0.05$ 一致。`,
      build(body, api) {
        const h = H, rnd = mulberry32(1982), pts = [];
        const st = { a: 0, b: 30, ang: [0, 60, 30, 90], part2: false, run: null };
        const stg = h.el('div', { class: 'lab-stage' }); body.append(stg);
        const cv = h.canvas(stg, { aspect: 0.46, minH: 210, maxH: 320 });
        const ctl = h.el('div', { class: 'lab-controls' }); body.append(ctl);
        const deg = (v) => v.toFixed(1) + '°';
        const sa = h.slider({ label: '爱丽丝的偏振片 a', min: 0, max: 180, step: 0.5, value: st.a, format: deg, onInput: (v) => { st.a = v; readouts(); } });
        const sb = h.slider({ label: '鲍勃的偏振片 b', min: 0, max: 180, step: 0.5, value: st.b, format: deg, onInput: (v) => { st.b = v; readouts(); } });
        ctl.append(sa.el, sb.el, h.el('div', { class: 'ctl' }, h.el('div', {}, [h.button({ label: '测 2000 对', onClick: measure }), h.button({ label: '清空', onClick: () => { pts.length = 0; draw(); } })])));
        const roW = h.el('div', { class: 'lab-readout' });
        const ro = { d: h.readout('夹角 b − a'), c: h.readout('N++ / N+− / N−+ / N−−'), E: h.readout('E（最近一次）'), n: h.readout('已测的不同夹角') };
        Object.values(ro).forEach((r) => roW.append(r.el)); body.append(roW);

        let okQ = false, okS = false, okT = false;
        const fin = () => { if (okQ && okS && okT) api.done(R`<b>量子力学越过了贝尔的界</b>：纠缠光子的关联 $E = \cos2(a-b)$ 给出 $S = 2\sqrt2$，这是齐雷尔松界（1980），任何量子策略都不能更高；第 1 关已证明任何局域隐变量模型都不超过 2。1972 年 Freedman 与 Clauser 首先在实验上看到了违反，1982 年阿斯佩的双通道实验测得 $S = 2.697\pm0.015$。但实验与定理之间还隔着几条假设。`); };
        const qBox = sec('关联函数', true); body.append(qBox);
        qBox.append(H.quiz({
          question: '你的数据最符合哪个函数？（θ 为两偏振片的夹角）',
          options: [
            { label: '$E = \\cos\\theta$', ok: false, why: '在 θ = 90° 处它给 0，而测得的是 −1：偏振片相互垂直时，两边结果总是相反。' },
            { label: '$E = 1 - 4|\\theta|/\\pi$（折线）', ok: false, why: R`这是贝尔 1964 年给出的一个局域隐变量模型的预言。它在 0°、45°、90° 与数据一致，但在 22.5° 处给 0.5，而测得约 0.71。两者的差别正是下一步要利用的。` },
            { label: '$E = \\cos2\\theta$', ok: true, why: R`对。量子力学：$\langle A(a)\otimes A(b)\rangle = \cos2(a-b)$。注意关联只依赖夹角，与 $a$ 本身无关：单独看一边，结果总是一半 $+1$、一半 $-1$。` },
            { label: '$E = \\cos^2\\theta$', ok: false, why: '它永远不为负，而偏振片垂直时测得 E ≈ −1。cos²θ 是“两边结果相同”的概率，E = 2cos²θ − 1。' },
          ],
          onOk: () => { okQ = true; st.part2 = true; p2.hidden = false; api.typeset(p2); draw(); drawPol(); fin(); },
        }).el);

        const p2 = sec('CHSH 实验', true); body.append(p2);
        const stg2 = h.el('div', { class: 'lab-stage' }); p2.append(stg2);
        const cvP = h.canvas(stg2, { aspect: 0.3, minH: 130, maxH: 190 });
        const ctl2 = h.el('div', { class: 'lab-controls' }); p2.append(ctl2);
        const names = ['a', "a′", 'b', "b′"];
        const sl4 = names.map((n, k) => h.slider({ label: (k < 2 ? '爱丽丝 ' : '鲍勃 ') + n, min: 0, max: 180, step: 0.5, value: st.ang[k], format: deg, onInput: (v) => { st.ang[k] = v; st.run = null; table(); draw(); drawPol(); } }));
        sl4.forEach((s) => ctl2.append(s.el));
        ctl2.append(h.el('div', { class: 'ctl' }, h.el('div', {}, [h.button({ label: '运行 CHSH 实验（每组 5000 对）', kind: 'primary', onClick: runCHSH })])));
        const tbW = h.el('div', { class: 'dtable' }); p2.append(tbW);
        const roW2 = h.el('div', { class: 'lab-readout' }); const roS = h.readout('S = E(a,b) + E(a,b′) + E(a′,b) − E(a′,b′)'), roZ = h.readout('超过 2 的标准差数');
        roW2.append(roS.el, roZ.el); p2.append(roW2);
        const aT = H.answer({
          label: '调整角度，你能得到的最大 S ≈ ?（理论值，容差 ±1%）', placeholder: 'S',
          check: (v) => {
            if (Math.abs(v - SQ8) <= 0.028) return { ok: true, msg: R`对：$2\sqrt2\approx 2.828$，齐雷尔松界。` };
            if (Math.abs(v - 4) < 0.05) return { ok: false, msg: '4 是代数上的最大值（四项都取 ±1 的最好值），量子关联达不到。' };
            if (Math.abs(v - 2) < 0.05) return { ok: false, msg: '这是局域模型的上界。量子关联能超过它。' };
            if (Math.abs(v - 0.854) < 0.01) return { ok: false, msg: '这是对应的游戏胜率；问的是 S。' };
            return { ok: false, msg: '不对。试试让三个夹角为 θ、第四个为 3θ，再对 θ 求最大。' };
          },
          onOk: () => { okT = true; fin(); },
        });
        p2.append(aT.el);

        function measure() {
          const d = wrap90(st.b - st.a), r = runPairs(rnd, d, 2000);
          pts.push([d, r.E, Math.sqrt(Math.max(1e-6, 1 - r.E * r.E) / r.N)]);
          ro.c.set(`${r.pp} / ${r.pm} / ${r.mp} / ${r.mm}`); ro.E.set(r.E.toFixed(3));
          const ds = new Set(pts.map((p) => Math.round(p[0])));
          const mid = pts.some((p) => { const m = Math.abs(p[0]) % 45; return m >= 8 && m <= 37; });
          if (!okQ) {
            if (ds.size >= 4 && mid) { qBox.hidden = false; api.typeset(qBox); api.say('数据够了，可以判断函数形式。', 'info'); }
            else if (ds.size >= 4) api.say('0°、45°、90° 的整数倍分辨不出候选函数，再测几个中间的夹角，例如 20° 或 30°。', 'info');
          }
          readouts(); draw();
        }
        function runCHSH() {
          const res = PAIRS.map(([x, y]) => { const d = wrap90(st.ang[x] - st.ang[2 + y]); return Object.assign(runPairs(rnd, d, 5000), { d }); });
          const S = res[0].E + res[1].E + res[2].E - res[3].E, sig = Math.sqrt(res.reduce((s, r) => s + Math.max(1e-6, 1 - r.E * r.E) / r.N, 0));
          st.run = { res, S, sig }; table(); draw();
          if (Math.abs(S) >= 2.7 && !okS) { okS = true; api.say(`测得 S = ${S.toFixed(3)} ± ${sig.toFixed(3)}，比 2 高出 ${((Math.abs(S) - 2) / sig).toFixed(0)} 个标准差。`, 'good'); fin(); }
          else if (Math.abs(S) > 2) api.say(`S = ${S.toFixed(3)} ± ${sig.toFixed(3)}：已经越过 2。再调角度，让它至少到 2.7。`, 'info');
          else api.say(`S = ${S.toFixed(3)} ± ${sig.toFixed(3)}，还在局域模型允许的范围内。`, 'info');
        }
        function table() {
          const r = st.run;
          const rows = PAIRS.map(([x, y], k) => {
            const d = wrap90(st.ang[2 + y] - st.ang[x]), q = r && r.res[k];
            return `<tr><td>(${names[x]}, ${names[2 + y]})${k === 3 ? '　减' : ''}</td><td>${d.toFixed(1)}°</td><td>${q ? `${q.pp} / ${q.pm} / ${q.mp} / ${q.mm}` : '—'}</td><td>${q ? q.E.toFixed(3) : '—'}</td></tr>`;
          }).join('');
          tbW.innerHTML = `<table><thead><tr><th>设置</th><th>夹角 b − a</th><th>N++ / N+− / N−+ / N−−</th><th>E</th></tr></thead><tbody>${rows}</tbody></table>`;
          roS.set(r ? `${r.S.toFixed(3)} ± ${r.sig.toFixed(3)}` : '（运行实验）');
          roZ.set(r ? ((Math.abs(r.S) - 2) / r.sig).toFixed(1) : '—');
        }
        function readouts() {
          ro.d.set(wrap90(st.b - st.a).toFixed(1) + '°');
          ro.n.set(String(new Set(pts.map((p) => Math.round(p[0]))).size));
        }
        function draw() {
          const g = cv.g, W = cv.w, Hh = cv.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: -90, x1: 90, y0: -1.15, y1: 1.15, pad: { l: 40, r: 10, t: 14, b: 32 }, xTicks: [-90, -67.5, -45, -22.5, 0, 22.5, 45, 67.5, 90], yTicks: [-1, -0.5, 0, 0.5, 1], fmtX: (v) => (Math.abs(v) % 45 ? '' : v + '°'), fmtY: (v) => String(v), xLabel: '夹角 θ = b − a', yLabel: 'E' }, C);
          const curve = (f, col, dash, w) => { g.strokeStyle = C(col); g.lineWidth = w; g.setLineDash(dash); g.beginPath(); for (let i = 0; i <= 180; i++) { const t = -90 + i; i ? g.lineTo(ax.X(t), ax.Y(f(t))) : g.moveTo(ax.X(t), ax.Y(f(t))); } g.stroke(); g.setLineDash([]); };
          g.font = '11px ' + mono; g.textBaseline = 'top'; g.textAlign = 'left';
          if (okQ) {
            curve(Eloc, '--muted', [5, 4], 1.4); curve(Eqm, '--s1', [], 2);
            g.fillStyle = C('--s1'); g.fillText('量子 cos 2θ', ax.p.l + 6, ax.p.t + 4); g.fillStyle = C('--muted'); g.fillText('局域模型（贝尔 1964）', ax.p.l + 6, ax.p.t + 18);
            PAIRS.forEach(([x, y], k) => { const d = wrap90(st.ang[2 + y] - st.ang[x]); g.strokeStyle = C(k === 3 ? '--warn' : '--s2'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax.X(d), ax.Y(-1.15)); g.lineTo(ax.X(d), ax.Y(1.15)); g.stroke(); g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(ax.X(d), ax.Y(Eqm(d)), 4, 0, 6.283); g.fill(); });
          }
          g.strokeStyle = C('--fg'); g.fillStyle = C('--fg'); g.lineWidth = 1;
          pts.forEach(([d, e, s]) => { const x = ax.X(d); g.beginPath(); g.moveTo(x, ax.Y(e - s)); g.lineTo(x, ax.Y(e + s)); g.stroke(); g.beginPath(); g.arc(x, ax.Y(e), 3, 0, 6.283); g.fill(); });
          if (!pts.length && !okQ) { g.fillStyle = C('--muted'); g.fillText('选两个角度，点“测 2000 对”', ax.p.l + 6, ax.p.t + 4); }
        }
        function drawPol() {
          if (!st.part2) return;
          const g = cvP.g, W = cvP.w, Hh = cvP.h, mono = C('--mono-font') || 'monospace', r = Math.min(W / 4 - 16, Hh / 2 - 18);
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          g.font = '11px ' + mono; g.textAlign = 'center'; g.textBaseline = 'top';
          [[W / 4, '爱丽丝', 0], [(3 * W) / 4, '鲍勃', 2]].forEach(([cx, who, k0]) => {
            const cy = Hh / 2 + 8;
            g.strokeStyle = C('--grid'); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke();
            g.fillStyle = C('--muted'); g.fillText(who, cx, 3);
            [0, 1].forEach((j) => {
              const ang = st.ang[k0 + j] * D2R, col = C(['--s1', '--s3', '--s2', '--s4'][k0 + j]), dx = Math.cos(ang) * r, dy = -Math.sin(ang) * r;
              g.strokeStyle = col; g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke();
              g.fillStyle = col; g.textAlign = dx >= 0 ? 'left' : 'right'; g.textBaseline = 'middle'; g.fillText(names[k0 + j], cx + dx * 1.12 + (dx >= 0 ? 2 : -2), cy + dy * 1.12); g.textAlign = 'center'; g.textBaseline = 'top';
            });
          });
        }
        cv.onResize(draw); cvP.onResize(drawPol);
        const un = watchTheme(() => { draw(); drawPol(); });
        readouts(); table(); draw();
        return { destroy() { cv.destroy(); cvP.destroy(); un(); } };
      },
    };
  }

  /* ---------- Stage 3: loopholes ---------- */
  const OPT = [0, 45, 22.5, 157.5]; // a, a′, b, b′
  function cardRun(rnd, N) { // the magician's local "card" model
    const c = PAIRS.map(() => ({ n: 0, co: 0, sum: 0, fair: 0 })); let clickA = 0;
    for (let i = 0; i < N; i++) {
      const x = rnd() < 0.5 ? 0 : 1, y = rnd() < 0.5 ? 0 : 1, x0 = rnd() < 0.5 ? 0 : 1, y0 = rnd() < 0.5 ? 0 : 1, a = rnd() < 0.5 ? 0 : 1, b = a ^ (x0 & y0);
      const cA = x === x0, cB = y === y0, A = cA ? 1 - 2 * a : 1, B = cB ? 1 - 2 * b : 1, q = c[2 * x + y];
      q.n++; q.fair += A * B; if (cA) clickA++; if (cA && cB) { q.co++; q.sum += A * B; }
    }
    const Ec = c.map((q) => q.sum / Math.max(1, q.co)), Ef = c.map((q) => q.fair / q.n);
    return { c, Ec, Ef, clickA: clickA / N, Sco: Ec[0] + Ec[1] + Ec[2] - Ec[3], Sfair: Ef[0] + Ef[1] + Ef[2] - Ef[3] };
  }
  const bern = (rnd, n, p) => { if (n < 60) { let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; } return binom(rnd, n, p); };
  function qRun(rnd, eta, N) { // entangled pairs, per-side efficiency η, no click → +1, optimal angles
    let S = 0, v = 0;
    PAIRS.forEach(([x, y], k) => {
      const d = wrap90(OPT[x] - OPT[2 + y]), nBoth = bern(rnd, N, eta * eta);
      const nA = eta < 1 ? bern(rnd, N - nBoth, eta / (1 + eta)) : 0, nB = eta < 1 ? bern(rnd, N - nBoth - nA, eta) : 0, nN = N - nBoth - nA - nB;
      const same = bern(rnd, nBoth, Math.cos(d * D2R) ** 2);
      const sum = 2 * same - nBoth + (2 * bern(rnd, nA, 0.5) - nA) + (2 * bern(rnd, nB, 0.5) - nB) + nN, E = sum / N;
      S += k === 3 ? -E : E; v += Math.max(1e-6, 1 - E * E) / N;
    });
    return { S, sig: Math.sqrt(v) };
  }
  const SEP = 6, TDET = SEP / C_MNS, TCUT = TDET - (2 * SEP) / C_MNS; // 20.0 ns, −20.0 ns

  function stage3(ctx) {
    const C = (n) => ctx.color(n);
    return {
      title: '魔术师的把戏',
      task: R`<p>实验数据会不会另有局域解释？第 1 关的证明用到了几条前提：每一对都被计入；每一侧的结果只依赖本地的设置和 $\lambda$；设置的选择与 $\lambda$ 无关。真实的实验未必满足它们。一位“魔术师”声称能用纯局域的模型骗过你。</p>
<p><b>第一招。</b>1970–80 年代的光电倍增管只能记录到很少一部分光子，实验只统计两边都响的“符合”事例，并假定它们是全体的公平样本。魔术师给每对光子发一张卡片 $\lambda$：卡片上写着它“预期”的一组设置和事先约好的答案，若到达时设置与卡片不符，光子就假装没被探测到。运行它，用两种方式计算 $S$。</p>
<p><b>第二招。</b>如果设置在光子飞行前很早就选定，一个不超过光速的信号就可能把它告诉另一边或光源。在时空图上找出选定设置必须落在的时间窗。</p>`,
      hints: [
        R`卡片模型中每一侧只有一半的光子“响”，符合事例只占 1/4，而且只有设置恰好与卡片相符的那些对被保留：被丢掉的事例依赖于设置，剩下的不是公平样本。公平计数（未响应记作 $+1$）下 $S$ 回到 2 以内。`,
        R`真实光子对、每侧效率 $\eta$、未响应记 $+1$：两边都响（概率 $\eta^2$）贡献 $\cos2\Delta$；只有一边响时另一边的 $\pm1$ 各半，贡献 0；两边都不响贡献 $+1$。于是 $E = \eta^2\cos2\Delta + (1-\eta)^2$，$S(\eta) = 2\sqrt2\,\eta^2 + 2(1-\eta)^2$。令它等于 2。`,
        R`$\eta \gt 2/(1+\sqrt2) = 2(\sqrt2-1)\approx 0.828$。时空图：两站相距 12 m，光走 $12/c\approx 40$ ns。爱丽丝的选择必须在鲍勃探测事件的过去光锥之外，即晚于发射前 20 ns；这同时也保证了光源在发射时不可能知道它。`,
      ],
      answer: R`<b>探测漏洞</b>：卡片模型只保留设置与卡片相符的事例，符合事例给出 $S = 4$（甚至超过 $2\sqrt2$），公平计数则只有 $1.5$。对真实纠缠光子，未响应记 $+1$ 时 $S(\eta) = 2\sqrt2\eta^2 + 2(1-\eta)^2$，要求 $\eta \gt 2(\sqrt2-1)\approx 82.8\%$（Garg 与 Mermin 1987；Eberhard 1993 证明用非最大纠缠态可降到 2/3）。<b>定域性漏洞</b>：两站相距 12 m，光子各飞 20 ns；设置必须在本侧探测前 $12\ {\rm m}/c\approx 40$ ns 之内选定，才能与另一侧的探测类空分隔。阿斯佩 1982 年用声光开关约每 10 ns 切换一次（准周期，不是真随机）；1998 年 Weihs、Zeilinger 等在因斯布鲁克用随机数发生器在 400 m 距离上做到了。<b>2015 年</b>，代尔夫特、维也纳和 NIST 的实验第一次在同一个实验里同时堵住两个漏洞。`,
      build(body, api) {
        const h = H, rnd = mulberry32(2015), ptsE = [];
        const st = { eta: 0.75, tA: -45, tB: -45, card: null };
        let okCard = false, okEta = false, okWin = false, okFin = false;
        const fin = () => { if (okCard && okEta && okWin && okFin) api.done(R`<b>无漏洞的贝尔检验</b>：局域隐变量模型只能借助未计入的事例（探测效率漏洞）或设置信息的传递（定域性漏洞）来模仿量子关联。阿斯佩 1982 年让设置在光子飞行途中切换，1998 年因斯布鲁克用真随机的快速切换，2001 年离子阱实验与 2013 年高效率光子实验先后单独堵住了探测漏洞，2015 年三个实验把两者合在了一起。剩下的“测量独立性”无法被实验彻底证明，只能把可能的共同原因推向越来越远的过去。`); };

        // part A: the card model
        const pa = sec('第一招：卡片'); body.append(pa);
        pa.append(h.el('div', { class: 'lab-controls' }, h.el('div', { class: 'ctl' }, h.el('div', {}, [h.button({ label: '运行魔术师的模型（40000 对，设置随机）', onClick: runCard })]))));
        const tbA = h.el('div', { class: 'dtable' }); pa.append(tbA);
        const roA = h.el('div', { class: 'lab-readout' }); const rA = { c: h.readout('单侧响应率'), s1: h.readout('S（只统计符合）'), s2: h.readout('S（未响应记 +1）') };
        Object.values(rA).forEach((r) => roA.append(r.el)); pa.append(roA);
        const qA = h.el('div', { hidden: true }); pa.append(qA);
        qA.append(H.quiz({
          question: '魔术师的符合事例给出 S ≈ 4，连量子力学的上限 2√2 都超过了。破绽在哪里？',
          options: [
            { label: '量子力学低估了关联，S 本来就能到 4', ok: false, why: '可以证明任何量子策略都满足 |S| ≤ 2√2（齐雷尔松）。超过它本身就说明样本有问题。' },
            { label: '只有设置与卡片相符的事例被保留：丢弃与设置有关，剩下的符合事例不是公平样本', ok: true, why: R`对。公平计数时它只有 1.5。贝尔定理要求对每一对都给出 $\pm1$；若允许“不响”且只统计符合事例，局域模型可以伪造任意的关联。这就是探测效率漏洞（Pearle 1970）。` },
            { label: '40000 对太少，统计涨落造成的', ok: false, why: '误差约 0.03，远小于 4 − 2√2 ≈ 1.2。' },
            { label: '卡片模型偷偷用了超光速通信', ok: false, why: '每一侧的响应只依赖本地设置和卡片，模型完全是局域的。' },
          ],
          onOk: () => { okCard = true; pe.hidden = false; api.typeset(pe); drawE(); fin(); },
        }).el);

        // part A2: efficiency threshold
        const pe = sec('真实光子：效率要多高', true); body.append(pe);
        pe.append(h.el('p', { class: 'bell-note', html: R`现在换成真正的纠缠光子对，取第 2 关的最优角度，并且公平计数：未响应一律记作 $+1$（简化：两侧效率相同、没有暗计数）。改变每侧的探测效率 $\eta$，看 $S$ 何时跌回 2 以下。` }));
        const stgE = h.el('div', { class: 'lab-stage' }); pe.append(stgE);
        const cvE = h.canvas(stgE, { aspect: 0.42, minH: 190, maxH: 280 });
        const sEta = h.slider({ label: '每侧探测效率 η', min: 0.5, max: 1, step: 0.005, value: st.eta, format: (v) => (100 * v).toFixed(1) + '%', onInput: (v) => { st.eta = v; } });
        pe.append(h.el('div', { class: 'lab-controls' }, [sEta.el, h.el('div', { class: 'ctl' }, h.el('div', {}, [h.button({ label: '测 4 × 20000 对', onClick: () => { const r = qRun(rnd, st.eta, 20000); ptsE.push([st.eta, r.S, r.sig]); rS.set(`${r.S.toFixed(3)} ± ${r.sig.toFixed(3)}（η = ${(100 * st.eta).toFixed(1)}%）`); drawE(); } })]))]));
        const roE = h.el('div', { class: 'lab-readout' }); const rS = h.readout('S（最近一次）'); roE.append(rS.el); pe.append(roE);
        pe.append(H.answer({
          label: '公平计数下要违反 CHSH 不等式，每侧探测效率至少要多高？（容差 ±2%）', placeholder: 'η（如 0.7 或 70）',
          check: (v) => {
            const e = v > 1 ? v / 100 : v;
            if (Math.abs(e - 0.8284) <= 0.017) return { ok: true, msg: R`对：$2\sqrt2\eta^2 + 2(1-\eta)^2 \gt 2 \iff \eta \gt 2(\sqrt2 - 1)\approx 82.8\%$。1982 年的光电倍增管远达不到，2013 年超导纳米线和过渡边沿探测器才超过它。` };
            if (Math.abs(e - 0.5) < 0.02) return { ok: false, msg: '卡片模型的效率是 50%：那是局域模型能伪装成功的效率，不是量子光源的门槛。' };
            if (Math.abs(e - 2 / 3) < 0.01) return { ok: false, msg: '2/3 是 Eberhard 用非最大纠缠态得到的门槛；这里用的是最大纠缠态。' };
            return { ok: false, msg: '多测几个 η，找 S 穿过 2 的位置，或者写出 E 对 η 的依赖。' };
          },
          onOk: () => { okEta = true; pb.hidden = false; api.typeset(pb); drawST(); fin(); },
        }).el);

        // part B: locality
        const pb = sec('第二招：提前知道设置', true); body.append(pb);
        pb.append(h.el('p', { class: 'bell-note', html: R`仿照阿斯佩 1982 年的布局：光源在中间，两个偏振分析站各距 6 m（示意）。$t = 0$ 发射，光子 $t \approx 20$ ns 到达。拖动两人选定设置的时刻：若某个选择落在对方探测事件的过去光锥之内，魔术师就能用不超过光速的信号把它送过去，模仿任何关联。` }));
        const stgB = h.el('div', { class: 'lab-stage' }); pb.append(stgB);
        const cvB = h.canvas(stgB, { aspect: 0.6, minH: 240, maxH: 380 });
        const sTA = h.slider({ label: '爱丽丝选定设置的时刻', min: -60, max: 18, step: 1, value: st.tA, format: (v) => v + ' ns', onInput: (v) => { st.tA = v; drawST(); } });
        const sTB = h.slider({ label: '鲍勃选定设置的时刻', min: -60, max: 18, step: 1, value: st.tB, format: (v) => v + ' ns', onInput: (v) => { st.tB = v; drawST(); } });
        pb.append(h.el('div', { class: 'lab-controls' }, [sTA.el, sTB.el]));
        const roB = h.el('div', { class: 'lab-readout' }); const rB = { a: h.readout('爱丽丝的选择'), b: h.readout('鲍勃的选择'), m: h.readout('魔术师能伪造的 S') };
        Object.values(rB).forEach((r) => roB.append(r.el)); pb.append(roB);
        const fBox = h.el('div', { hidden: true });
        pb.append(H.answer({
          label: '为堵住这个漏洞，设置必须在本侧探测之前多长时间之内才选定？（容差 ±2 ns）', unit: 'ns', placeholder: 'Δt',
          check: (v) => {
            const w = TDET - TCUT;
            if (Math.abs(v - w) <= 2) return { ok: true, msg: R`对：$12\ {\rm m}/c\approx 40$ ns。阿斯佩的声光开关约每 10 ns 切换一次，满足这个要求；但切换是准周期的，不是真随机。` };
            if (Math.abs(v - 20) <= 2) return { ok: false, msg: '20 ns 是光子从源飞到分析站的时间。设置甚至可以在发射之前选定，只要光源和对方都来不及知道。' };
            if (Math.abs(v - 80) <= 3) return { ok: false, msg: '太宽了：看时空图，比这更早的选择落在对方探测事件的过去光锥里。' };
            return { ok: false, msg: '看时空图：选择事件必须在对方探测事件的过去光锥之外。' };
          },
          onOk: () => { okWin = true; fBox.hidden = false; api.typeset(fBox); fin(); },
        }).el, fBox);
        fBox.append(H.quiz({
          question: '2015 年代尔夫特、维也纳和 NIST 的三个实验被称为“无漏洞”贝尔检验。它们新在哪里？',
          options: [
            { label: '第一次测到 S > 2', ok: false, why: '1972 年 Freedman 与 Clauser、1982 年阿斯佩早已测到违反。' },
            { label: '第一次在同一个实验中同时满足高探测效率和类空分隔的随机设置', ok: true, why: R`对。代尔夫特（Hensen 等）用相距 1.3 km 的两个金刚石氮–空位色心电子自旋，以“预告”保证每次试验都有结果，245 次试验得 $S = 2.42\pm0.20$；维也纳（Giustina 等）与 NIST（Shalm 等）用高效率超导探测器测纠缠光子，检验 Eberhard 不等式，显著性分别约 $11\sigma$ 与 $5\sigma$。` },
            { label: '排除了一切局域模型，包括设置与 λ 有共同原因的“超决定论”模型', ok: false, why: '测量独立性无法被实验彻底证明。后来的“宇宙贝尔实验”用数百年前的星光（2017）乃至数十亿年前的类星体光（2018）来选设置，把可能的共同原因推到很远的过去。' },
            { label: '证明了纠缠可以超光速传递信息', ok: false, why: '不能。单独看一边，结果总是随机的，与另一边的设置无关（无信号定理）。关联只有在把两边记录放在一起比较时才看得到。' },
          ],
          onOk: () => { okFin = true; fin(); },
        }).el);

        function runCard() {
          const r = cardRun(rnd, 40000); st.card = r;
          const nm = ['(a, b)', "(a, b′)", "(a′, b)", "(a′, b′)　减"];
          tbA.innerHTML = `<table><thead><tr><th>设置</th><th>对数</th><th>符合数</th><th>E（只统计符合）</th><th>E（未响应记 +1）</th></tr></thead><tbody>${r.c.map((q, k) => `<tr><td>${nm[k]}</td><td>${q.n}</td><td>${q.co}</td><td>${r.Ec[k].toFixed(3)}</td><td>${r.Ef[k].toFixed(3)}</td></tr>`).join('')}</tbody></table>`;
          rA.c.set((100 * r.clickA).toFixed(1) + '%'); rA.s1.set(r.Sco.toFixed(3)); rA.s2.set(r.Sfair.toFixed(3));
          qA.hidden = false; api.typeset(qA);
        }
        function drawE() {
          if (pe.hidden) return;
          const g = cvE.g, W = cvE.w, Hh = cvE.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: 0.5, x1: 1, y0: 1.4, y1: 3, pad: { l: 40, r: 10, t: 12, b: 32 }, xTicks: [0.5, 0.6, 0.7, 0.8, 0.9, 1], yTicks: [1.5, 2, 2.5, 3], fmtX: (v) => Math.round(100 * v) + '%', fmtY: (v) => v.toFixed(1), xLabel: '每侧探测效率 η', yLabel: 'S（公平计数）' }, C);
          g.font = '11px ' + mono; g.textAlign = 'left'; g.textBaseline = 'bottom';
          [[2, '--warn', '局域上界 2'], [SQ8, '--muted', '2√2']].forEach(([y, col, t]) => { g.strokeStyle = C(col); g.setLineDash([5, 4]); g.lineWidth = 1.3; g.beginPath(); g.moveTo(ax.X(0.5), ax.Y(y)); g.lineTo(ax.X(1), ax.Y(y)); g.stroke(); g.setLineDash([]); g.fillStyle = C(col); g.fillText(t, ax.X(0.5) + 4, ax.Y(y) - 2); });
          if (okEta) { g.strokeStyle = C('--s1'); g.lineWidth = 1.6; g.beginPath(); for (let i = 0; i <= 100; i++) { const e = 0.5 + i / 200, y = SQ8 * e * e + 2 * (1 - e) ** 2; i ? g.lineTo(ax.X(e), ax.Y(y)) : g.moveTo(ax.X(e), ax.Y(y)); } g.stroke(); }
          g.strokeStyle = C('--fg'); g.fillStyle = C('--fg'); g.lineWidth = 1;
          ptsE.forEach(([e, s, sg]) => { const x = ax.X(e); g.beginPath(); g.moveTo(x, ax.Y(s - sg)); g.lineTo(x, ax.Y(s + sg)); g.stroke(); g.beginPath(); g.arc(x, ax.Y(s), 3, 0, 6.283); g.fill(); });
        }
        function drawST() {
          if (pb.hidden) return;
          const g = cvB.g, W = cvB.w, Hh = cvB.h, mono = C('--mono-font') || 'monospace';
          g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
          const ax = h.axes(g, W, Hh, { x0: -9, x1: 9, y0: -65, y1: 30, pad: { l: 42, r: 10, t: 12, b: 32 }, xTicks: [-6, -3, 0, 3, 6], yTicks: [-60, -40, -20, 0, 20], fmtX: (v) => v + ' m', fmtY: (v) => String(v), xLabel: '位置 x', yLabel: '时间 t (ns)' }, C);
          const P = (x, t) => [ax.X(x), ax.Y(t)];
          const line = (x1, t1, x2, t2, col, w, dash) => { const a = P(x1, t1), b = P(x2, t2); g.strokeStyle = C(col); g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]); };
          const dt = (d) => d / C_MNS; // ns for distance d (m)
          // past light cones of the two detection events and of the emission (shaded wedges, clipped to the plot)
          g.save(); g.beginPath(); g.rect(ax.p.l, ax.p.t, ax.iw, ax.ih); g.clip();
          const cone = (x0, t0, col) => { const tb = -65, a = P(x0, t0), l = P(x0 - C_MNS * (t0 - tb), tb), r = P(x0 + C_MNS * (t0 - tb), tb); g.fillStyle = C(col); g.globalAlpha = 0.1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(l[0], l[1]); g.lineTo(r[0], r[1]); g.closePath(); g.fill(); g.globalAlpha = 1; line(x0, t0, x0 - C_MNS * (t0 - tb), tb, col, 1, [4, 4]); line(x0, t0, x0 + C_MNS * (t0 - tb), tb, col, 1, [4, 4]); };
          cone(-SEP, TDET, '--s1'); cone(SEP, TDET, '--s2'); cone(0, 0, '--muted');
          g.restore();
          line(-SEP, -65, -SEP, 30, '--grid', 1); line(SEP, -65, SEP, 30, '--grid', 1);
          line(0, 0, -SEP, TDET, '--accent', 2); line(0, 0, SEP, TDET, '--accent', 2);
          const dot = (x, t, col, r) => { const p = P(x, t); g.fillStyle = C(col); g.beginPath(); g.arc(p[0], p[1], r, 0, 6.283); g.fill(); };
          dot(0, 0, '--accent', 4.5); dot(-SEP, TDET, '--s1', 4.5); dot(SEP, TDET, '--s2', 4.5);
          const badA = st.tA <= TCUT + 1e-9, badB = st.tB <= TCUT + 1e-9;
          // light signal from each choice toward the other station
          const sig = (x0, t0, dir, bad) => { const t1 = t0 + dt(2 * SEP); line(x0, t0, x0 + dir * 2 * SEP, t1, bad ? '--warn' : '--muted', bad ? 1.8 : 1, bad ? [] : [2, 3]); };
          sig(-SEP, st.tA, 1, badA); sig(SEP, st.tB, -1, badB);
          dot(-SEP, st.tA, badA ? '--warn' : '--good', 5.5); dot(SEP, st.tB, badB ? '--warn' : '--good', 5.5);
          g.font = '11px ' + mono; g.fillStyle = C('--muted'); g.textBaseline = 'bottom';
          g.textAlign = 'left'; g.fillText('爱丽丝', ax.X(-SEP) + 4, ax.Y(28));
          g.textAlign = 'right'; g.fillText('鲍勃', ax.X(SEP) - 4, ax.Y(28));
          g.textAlign = 'center'; g.fillText('发射', ax.X(0), ax.Y(0) - 6);
          const cheat = badA || badB;
          rB.a.set(st.tA + ' ns · ' + (badA ? '鲍勃来得及知道' : '类空分隔'));
          rB.b.set(st.tB + ' ns · ' + (badB ? '爱丽丝来得及知道' : '类空分隔'));
          rB.m.set(cheat ? '可达 4（能伪造任何关联）' : '≤ 2（局域上界）');
        }
        cvE.onResize(drawE); cvB.onResize(drawST);
        const un = watchTheme(() => { drawE(); drawST(); });
        return { destroy() { cvE.destroy(); cvB.destroy(); un(); } };
      },
    };
  }

  CHALLENGES.bell = {
    title: '局域实在论的检验',
    mount(root, ctx) {
      injectStyle();
      return H.stages(root, ctx, [stage1(), stage2(ctx), stage3(ctx)]);
    },
  };
})();
