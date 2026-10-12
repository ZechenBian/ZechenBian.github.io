/* 从空气里造面包 — Haber (Nobel Chemistry 1918), rediscovery challenge.
 * Thermodynamics copied from labs/haber.js: N₂ + 3H₂ ⇌ 2NH₃, ΔH° = −91.8 kJ, ΔS° = −198.1 J/K,
 * ΔCp = −45.3 J/K (per 2 mol NH₃); Kp = exp(−ΔG°(T)/RT) atm⁻²; ξ_eq by bisection on ln Q(ξ).
 * Kinetics (illustrative): first-order approach to equilibrium, ξ(t) = ξ_eq (1 − 10^(−t/t₉₀)),
 * t₉₀ = t_ref · exp(Ea/R (1/T − 1/T_ref)).
 *   uncatalysed: Ea 230 kJ, t₉₀ = 10 min at 900 °C  → nothing measurable below ~800 °C
 *   Os:          Ea 150 kJ, t₉₀ = 25 min at 450 °C  → active from ~450 °C
 *   raw Fe:      Ea 150 kJ, t₉₀ ≈ 11 h at 450 °C    → only useful hot, where equilibrium is poor
 *   promoted Fe (Mittasch, stage 3): Ea 160 kJ, t₉₀ = 10 min at 450 °C
 * Stage 2 loop: fresh feed = 1 mol N₂ + 3 mol H₂ + 0.04 mol inert (Ar, CH₄; 1 %). Purge fraction p of
 * the loop gas after the condenser. Steady state: n = 1/(1 − (1−p)(1−x_e)), inert in loop I = 0.04/p,
 * y_I = I/(4n + I), x_e = x(1 − y_I)^1.5, overall X = x_e·n  (≈ x/(x + p(1−x)) when inerts are negligible).
 * Stage 3 cost (relative units per tonne NH₃, tuned so promoted Fe, ~450 °C, ~150–300 atm is the basin):
 *   compression 7·ln P + recycle 20/x + heating (T−25)/100 + catalyst (Os 60, Fe 3) + reactor capital 0.1·P.
 */
(() => {
  const R = 8.314, DH = -91800, DS = -198.1, DCP = -45.3, T0 = 298.15;
  const dG = (T) => (DH + DCP * (T - T0)) - T * (DS + DCP * Math.log(T / T0));
  const Kp = (T) => Math.exp(-dG(T) / (R * T));
  function xiEq(T, P) {
    const target = Math.log(Kp(T) * P * P);
    let a = 1e-12, b = 1 - 1e-12;
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2;
      const q = Math.log(4 * m * m * (4 - 2 * m) ** 2 / (27 * (1 - m) ** 4));
      if (q < target) a = m; else b = m;
    }
    return (a + b) / 2;
  }
  const yNH3 = (xi) => (2 * xi) / (4 - 2 * xi);
  const xiOfY = (y) => (2 * y) / (1 + y);
  const CATS = {
    none: { Ea: 230e3, Tr: 1173.15, tr: 600, name: '无' },
    fe0: { Ea: 150e3, Tr: 723.15, tr: 4e4, name: '铁粉（未活化）' },
    os: { Ea: 150e3, Tr: 723.15, tr: 1500, name: '锇 Os', cost: 60 },
    fe: { Ea: 160e3, Tr: 723.15, tr: 600, name: '促进铁', cost: 3 },
  };
  const t90 = (T, c) => CATS[c].tr * Math.exp((CATS[c].Ea / R) * (1 / T - 1 / CATS[c].Tr));
  const xiAt = (Tc, P, c, ts) => { const T = Tc + 273.15; return xiEq(T, P) * (1 - Math.pow(10, -ts / t90(T, c))); };

  // ---- stage 2 loop model ----
  const INERT = 0.04;
  function loop(cfg, x, Tc, P) {
    const p = cfg.purge / 100;
    const r = { valid: true, note: '', n: 1, xe: x, X: x, yI: 0 };
    if (cfg.rec && !cfg.cond) { r.valid = false; r.note = '循环气里的氨没有出口：它被送回反应器，入口气中氨越来越多，反应器离平衡越来越近、不再净生成氨。'; r.X = 0; }
    else if (cfg.rec && p <= 0) { r.valid = false; r.note = '原料气里约 1 % 的氩和甲烷既不反应也不冷凝。没有放空，它们在回路中无限累积，最终把 N₂/H₂ 挤出反应器。'; r.X = 0; }
    else if (cfg.rec) {
      let n = 1, xe = x, yI = 0;
      for (let k = 0; k < 400; k++) { const I = INERT / p; yI = I / (4 * n + I); xe = x * Math.pow(1 - yI, 1.5); n = 1 / (1 - (1 - p) * (1 - xe)); }
      Object.assign(r, { n, xe, yI, X: xe * n });
    } else if (!cfg.cond) r.note = '没有冷凝器：产品是含少量氨的混合气，未反应的气体连同氨一起排走。';
    else r.note = '单程：分离出氨后，剩下的 N₂/H₂ 直接放空。';
    // energy per mol fresh N₂ (kJ)
    const comp = (4 * R * 298 * Math.log(Math.max(P, 1))) / 0.7 / 1000;
    const recomp = cfg.rec ? (4 * r.n * R * 298 * Math.log(1.05)) / 0.7 / 1000 : 0;
    const Q = (4 * 29 * (Tc - 25)) / 1000;
    const heat = cfg.hx ? Math.max(0, r.n * Q * 0.15 - 0.5 * 92 * r.X) : r.n * Q;
    const kg = (2 * 34.06 * r.X) / 1000;
    r.E = { comp, recomp, heat, tot: comp + recomp + heat, perKg: kg > 0 ? (comp + recomp + heat) / kg / 1000 : Infinity };
    return r;
  }

  // ---- stage 3 cost model ----
  const TAU3 = 600;
  function cost(Tc, P, c) {
    const x = xiAt(Tc, P, c, TAU3);
    const parts = { comp: 7 * Math.log(P), rec: 20 / Math.max(x, 1e-4), heat: (Tc - 25) / 100, cat: CATS[c].cost, cap: 0.1 * P };
    return { x, parts, tot: Object.values(parts).reduce((a, b) => a + b, 0) };
  }
  const TARGET = 130;

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const fmtPct = (v) => (v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v >= 0.001 ? v.toFixed(3) : v > 0 ? v.toExponential(1) : '0') + ' %';

  function themeWatch(fn) {
    const mo = new MutationObserver(fn); mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq) mq.addEventListener('change', fn);
    return () => { mo.disconnect(); if (mq) mq.removeEventListener('change', fn); };
  }
  function injectStyle() {
    if (document.getElementById('st-haber')) return;
    const s = document.createElement('style'); s.id = 'st-haber';
    s.textContent = `.haber-log{max-height:220px;overflow:auto}
.haber-log tr.haber-hit td{color:var(--good)}
.haber-box{border:1px solid var(--line);border-radius:6px;padding:10px 12px;font-size:13.5px;line-height:1.7;background:var(--bg2)}
.haber-box b{color:var(--accent)}
.haber-status{font-size:13px;line-height:1.6}
.haber-status.bad{color:var(--warn)} .haber-status.ok{color:var(--good)} .haber-status.info{color:var(--muted)}`;
    document.head.append(s);
  }

  CHALLENGES.haber = {
    title: '从空气里造面包',
    _math: { Kp, xiEq, yNH3, t90, xiAt, loop, cost, TARGET },
    mount(root, ctx) {
      injectStyle();
      const h = ctx.h || H, C = (n) => ctx.color(n), mono = () => C('--mono-font') || 'monospace';
      const shared = { best: null }; // best stage-1 run {Tc,P,cat,y}

      /* ================= Stage 1 ================= */
      const s1 = {
        title: '热力学的坏消息',
        task: `<p>1898 年，英国科学促进会主席 William Crookes 发出警告：世界的小麦依赖智利硝石里的“固定氮”，而硝石矿再过几十年就会挖空——“饥荒不可避免，除非化学家能从空气里把氮固定下来”。空气中 78 % 是 N₂，可它几乎什么都不反应。</p>
<p>1904 年，卡尔斯鲁厄的 Fritz Haber 让 N₂ 和 H₂（1 : 3）在 1 atm、1000 °C 下通过铁催化剂，测得平衡时出口气中 NH₃ 只有 <b>约 0.012 %</b>。他的结论是：这条路在工业上没有希望。</p>
<p>你手里有一台台式高压反应器：调温度、压力、催化剂，然后让气体反应 10 分钟，看出口的 NH₃ 含量。先回答下面的问题，再完成目标：<b>在 200 atm 的材料极限以内，10 分钟内让出口 NH₃ ≥ 8 %</b>。</p>`,
        hints: [
          '看反应式两边各有多少“摩尔气体”。如果把容器压缩，系统会倾向于往哪边走？',
          '没有催化剂时，10 分钟里几乎什么都不会发生——除非温度高到平衡本身已经很差。先选一个催化剂，找到它开始“动起来”的温度；再看 10 分钟曲线最后是“还在爬”（太慢）还是“已经平了”（被平衡卡住）。',
          '选锇，把压力拉到 200 atm，温度在 450–550 °C 之间扫一遍：低于这个范围反应跟不上，高于它平衡变差。',
        ],
        answer: `反应 N₂ + 3H₂ ⇌ 2NH₃ 放热（ΔH ≈ −92 kJ），且 4 mol 气体变 2 mol。平衡常数 $K_p=\\dfrac{x_{NH_3}^2}{x_{N_2}x_{H_2}^3}\\cdot\\dfrac{1}{P^2}$，所以在给定温度下产率随 $P^2$ 上升（勒夏特列原理）；降温让 $K_p$ 变大，但反应速率按 Arrhenius 指数下降，300 °C 下 10 分钟几乎什么都不生成。折中：锇催化剂、200 atm、约 500 °C，10 分钟出口约 15 % NH₃。`,
        build(body, api) {
          let quizOk = false, hit = null;
          const quiz = h.quiz({
            question: '1 atm、1000 °C 下平衡时只有约 0.012 % 的氨。这个反应是放热的。<b>如果把温度降到 300 °C，问题解决了吗？</b>',
            options: [
              { label: '解决了：低温下平衡大幅移向氨，产率提高上百倍。', ok: false, why: '平衡确实更有利（1 atm、300 °C 下平衡约 2 %），但你可以在反应器里试一试：300 °C 时 10 分钟后出口是多少？' },
              { label: '没有：平衡更有利，但反应几乎不发生。', ok: true, why: '对。放热反应降温确实把平衡推向氨，可 N≡N 键极难打开，速率随温度指数下降——在 300 °C 等到平衡要几天甚至几年。热力学和动力学在拉扯。' },
              { label: '没有：放热反应在低温下平衡更不利。', ok: false, why: '方向反了：放热反应降温时 $K_p$ 增大，平衡移向产物。' },
              { label: '温度不影响平衡，只影响速率。', ok: false, why: '温度会改变平衡常数 $K_p(T)$——这正是 1904 年测量的意义。' },
            ],
            onOk: () => { quizOk = true; check(); },
          });
          body.append(quiz.el);

          const stage = h.el('div', { class: 'lab-stage' });
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });
          body.append(stage, controls, readout);
          const cv = h.canvas(stage, { aspect: 0.5, minH: 200, maxH: 320 });
          const st = { Tc: 600, P: 1, cat: 'none' };
          const pNote = h.el('span', { class: 'ctl-lab', style: 'font-size:12px', text: '1909 年的材料极限约 200 atm' });
          const sT = h.slider({ label: '温度', min: 200, max: 1000, step: 10, value: st.Tc, format: (v) => v + ' °C', onInput: (v) => { st.Tc = v; } });
          const sP = h.slider({ label: '压力', min: 1, max: 300, step: 1, value: st.P, format: (v) => v + ' atm', onInput: (v) => {
            if (v > 200) { sP.set(200); v = 200; pNote.style.color = C('--warn'); pNote.textContent = '锁定：1909 年的钢管在 200 atm 以上会破裂'; }
            else { pNote.style.color = ''; pNote.textContent = '1909 年的材料极限约 200 atm'; }
            st.P = v;
          } });
          const pWrap = h.el('div', { class: 'ctl' }, [sP.el, pNote]);
          const cCat = h.choice({ label: '催化剂', value: st.cat, options: [{ value: 'none', label: '无' }, { value: 'fe0', label: '铁粉（未活化）' }, { value: 'os', label: '锇 Os' }], onChange: (v) => { st.cat = v; } });
          const runBtn = h.button({ label: '反应 10 分钟', kind: 'primary', onClick: () => run() });
          controls.append(sT.el, pWrap, cCat.el, h.el('div', { class: 'ctl' }, [runBtn]));
          const roY = h.readout('出口 NH₃（10 分钟）'), roC = h.readout('条件');
          readout.append(roY.el, roC.el);
          const logWrap = h.el('div', { class: 'dtable haber-log' });
          const tbody = h.el('tbody');
          logWrap.append(h.el('table', {}, [h.el('thead', {}, h.el('tr', {}, ['#', 'T (°C)', 'P (atm)', '催化剂', '出口 NH₃'].map((t) => h.el('th', { text: t })))), tbody]));
          body.append(logWrap);

          const rnd = mulberry32(1909);
          const runs = []; let anim = null, animT = 1;
          function run() {
            const { Tc, P, cat } = st, T = Tc + 273.15, xe = xiEq(T, P), t9 = t90(T, cat);
            const noise = 1 + 0.03 * (rnd() + rnd() + rnd() - 1.5);
            const curve = (tmin) => 100 * yNH3(xe * (1 - Math.pow(10, -(tmin * 60) / t9)));
            const y = Math.max(0, curve(10) * noise + 0.0004 * (rnd() - 0.5));
            const r = { Tc, P, cat, y, curve, k: runs.length + 1 };
            runs.push(r);
            roY.set(fmtPct(y)); roC.set(`${Tc} °C · ${P} atm · ${CATS[cat].name}`);
            const tr = h.el('tr', { class: y >= 8 && P <= 200 ? 'haber-hit' : null }, [r.k, Tc, P, CATS[cat].name, fmtPct(y)].map((t) => h.el('td', { text: String(t) })));
            tbody.prepend(tr);
            if (!shared.best || y > shared.best.y) shared.best = { Tc, P, cat, y: y / 100 };
            if (y >= 8 && P <= 200) { hit = r; check(); }
            else if (cat === 'none') api.say('10 分钟过去，出口几乎没有氨。', 'info');
            else api.say('出口 NH₃ = ' + fmtPct(y) + '，还不到 8 %。看看曲线在 10 分钟时是还在上升，还是早已走平？', 'info');
            if (ctx.reduced) { animT = 1; draw(); }
            else { animT = 0; if (anim) anim.stop(); anim = h.loop((dt) => { animT = Math.min(1, animT + dt / 0.9); draw(); if (animT >= 1) anim.stop(); }).start(); }
          }
          function check() {
            if (!hit) return;
            if (!quizOk) { api.say('出口达到 ' + fmtPct(hit.y) + '！再回答上面的问题就完成本关。', 'info'); return; }
            api.done(`<b>勒夏特列 + 温度折中。</b> 4 mol 气体 → 2 mol，加压把平衡推向 NH₃（产率约 ∝ P²）；放热反应低温平衡好但慢、高温快但平衡差——必须在催化剂刚好够快的最低温度工作。你在 ${hit.Tc} °C、${hit.P} atm、${CATS[hit.cat].name} 下得到 ${fmtPct(hit.y)}。1909 年哈伯正是用锇在约 175 atm、550 °C 下做到了约 8 %。`);
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
            const ymax = Math.max(10, ...runs.map((r) => Math.ceil(r.y / 5) * 5 + 2));
            const ax = h.axes(g, W, Hh, { x0: 0, x1: 10, y0: 0, y1: ymax, xTicks: [0, 2, 4, 6, 8, 10], yTicks: ymax > 20 ? [0, 10, 20, 30, 40] : [0, 2, 4, 6, 8, 10, 15, 20].filter((v) => v <= ymax), xLabel: '时间 (min)', yLabel: 'NH₃ (%)' }, C);
            g.save(); g.setLineDash([4, 4]); g.strokeStyle = C('--accent'); g.lineWidth = 1;
            g.beginPath(); g.moveTo(ax.X(0), ax.Y(8)); g.lineTo(ax.X(10), ax.Y(8)); g.stroke(); g.restore();
            g.fillStyle = C('--accent'); g.font = '11px ' + mono(); g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('目标 8 %', ax.X(0) + 4, ax.Y(8) - 2);
            runs.slice(-6).forEach((r, idx, arr) => {
              const last = idx === arr.length - 1, tEnd = last ? 10 * animT : 10;
              g.strokeStyle = C(last ? '--s1' : '--muted'); g.globalAlpha = last ? 1 : 0.35 + 0.1 * idx; g.lineWidth = last ? 2.2 : 1.2;
              g.beginPath();
              for (let i = 0; i <= 80; i++) { const t = (tEnd * i) / 80, v = (r.curve(t) * r.y) / Math.max(r.curve(10), 1e-12); i ? g.lineTo(ax.X(t), ax.Y(Math.min(v, ymax))) : g.moveTo(ax.X(t), ax.Y(Math.min(v, ymax))); }
              g.stroke(); g.globalAlpha = 1;
              if (last && animT >= 1) { g.fillStyle = C('--s1'); g.beginPath(); g.arc(ax.X(10), ax.Y(Math.min(r.y, ymax)), 4, 0, 7); g.fill(); }
            });
            if (!runs.length) { g.fillStyle = C('--muted'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('按“反应 10 分钟”开始', ax.p.l + ax.iw / 2, ax.p.t + ax.ih / 2); }
          }
          cv.onResize(draw); draw();
          const unwatch = themeWatch(draw);
          return { destroy() { if (anim) anim.stop(); cv.destroy(); unwatch(); } };
        },
      };

      /* ================= Stage 2 ================= */
      const s2 = {
        title: '只有 8% 怎么办？',
        task: `<p>即便条件最好，气体通过反应器一次也只有约 8 % 变成氨，其余 90 % 以上的 N₂ 和 H₂ 原封不动地出来。BASF 的工程师说：每生产 1 kg 氨，你要把十几 kg 的气体压到 200 atm、加热到 500 °C，再白白排掉——这不是工厂，是锅炉。</p>
<p>下面是一张流程图。反应器固定不动；你可以加装 <b>冷凝器</b>（把氨冷成液体分离出来）、<b>循环压缩机</b>（把未反应的气体送回反应器入口）、<b>热交换器</b>（用反应器出口的热气预热进口的冷气），并设定 <b>放空比例</b>（原料气中约 1 % 是不反应的氩和甲烷）。</p>
<p>目标：<b>N₂ 总转化率 ≥ 90 %</b>，同时回路能耗（压缩 + 加热，不含制氢）<b>≤ 3 MJ / kg NH₃</b>。也可以点击流程图里的设备来开关。</p>`,
        hints: [
          '单程转化率是热力学定死的，你改变不了它。但“没反应的气体”并没有消失——它们去哪了？',
          '只把气体送回去还不够：如果氨不先被取出来，送回去的气体里已经有氨，反应器离平衡更近。另外不反应的惰性气体总得有个出口。',
          '四个设备全开（冷凝器 + 循环 + 热交换器），放空调到 0.5–1.5 % 左右。放空太大浪费原料，太小惰性气体积累。',
        ],
        answer: `设单程转化率为 $x$，放空比例为 $p$。循环稳态时进入反应器的 N₂ 流量 $n$ 满足 $n = 1 + (1-p)(1-x)n$，于是总转化率 $X = xn = \\dfrac{x}{x+p(1-x)}$。$x=0.148$（出口 8 % NH₃）、$p=1\\%$ 时 $X\\approx 94\\%$（惰性气体累积使实际略低）。冷凝器必须有（否则氨无处可去），放空必须 >0（否则惰性气体无限累积），热交换器把加热能耗降低一个数量级。`,
        build(body, api) {
          const cfg = { cond: false, rec: false, hx: false, purge: 5 };
          const b = shared.best && shared.best.y >= 0.05 ? shared.best : null;
          let src = b ? 'mine' : 'def';
          const getX = () => (src === 'mine' && b ? { x: xiOfY(b.y), Tc: b.Tc, P: b.P, y: b.y } : { x: xiOfY(0.08), Tc: 500, P: 200, y: 0.08 });
          const stage = h.el('div', { class: 'lab-stage' });
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });
          const status = h.el('p', { class: 'haber-status info' });
          body.append(stage, controls, status, readout);
          const cv = h.canvas(stage, { aspect: 0.42, minH: 190, maxH: 280 });
          const tCond = h.toggle({ label: '冷凝分离氨', value: cfg.cond, onChange: (v) => { cfg.cond = v; update(); } });
          const tRec = h.toggle({ label: '循环压缩机（未反应气体送回）', value: cfg.rec, onChange: (v) => { cfg.rec = v; update(); } });
          const tHx = h.toggle({ label: '热交换器（出口热气预热进口气）', value: cfg.hx, onChange: (v) => { cfg.hx = v; update(); } });
          const sPurge = h.slider({ label: '放空比例 p', min: 0, max: 10, step: 0.25, value: cfg.purge, format: (v) => v.toFixed(2) + ' %', onInput: (v) => { cfg.purge = v; update(); } });
          controls.append(tCond.el, tRec.el, tHx.el, sPurge.el);
          if (b) controls.append(h.choice({ label: '单程转化率来自', value: src, options: [{ value: 'mine', label: `你第 1 关的最佳（${(100 * b.y).toFixed(1)} % NH₃）` }, { value: 'def', label: '典型值 8 % NH₃' }], onChange: (v) => { src = v; update(); } }).el);
          const ro = { x: h.readout('单程 N₂ 转化率'), n: h.readout('反应器进气量 / 新鲜气'), yI: h.readout('回路惰性气体'), X: h.readout('N₂ 总转化率'), E: h.readout('回路能耗'), Eb: h.readout('其中 压缩 / 再压缩 / 加热') };
          Object.values(ro).forEach((r) => readout.append(r.el));
          let res = null, hits = [];

          function update() {
            const s = getX();
            res = loop(cfg, s.x, s.Tc, s.P);
            ro.x.set((100 * s.x).toFixed(1) + ' %（出口 ' + (100 * s.y).toFixed(1) + ' % NH₃）');
            ro.n.set(res.valid ? '×' + res.n.toFixed(1) : '—');
            ro.yI.set(cfg.rec ? (res.valid ? (100 * res.yI).toFixed(1) + ' %' : '→ 100 %') : '—（随废气排走）');
            ro.X.set(res.valid ? (100 * res.X).toFixed(1) + ' %' : '无稳态');
            ro.E.set(res.valid && isFinite(res.E.perKg) ? res.E.perKg.toFixed(1) + ' MJ/kg' : '—');
            const kg = (2 * 34.06 * res.X) / 1000;
            ro.Eb.set(res.valid && kg > 0 ? [res.E.comp, res.E.recomp, res.E.heat].map((v) => (v / kg / 1000).toFixed(1)).join(' / ') : '—');
            const ok = res.valid && res.X >= 0.9 && res.E.perKg <= 3;
            status.className = 'haber-status ' + (!res.valid ? 'bad' : ok ? 'ok' : 'info');
            const msgs = [];
            if (!res.valid) msgs.push('⚠ ' + res.note);
            else {
              if (res.note) msgs.push(res.note);
              msgs.push(res.X >= 0.9 ? '总转化率达标。' : '总转化率 ' + (100 * res.X).toFixed(0) + ' % < 90 %。');
              msgs.push(res.E.perKg <= 3 ? '能耗达标。' : '能耗 ' + res.E.perKg.toFixed(1) + ' MJ/kg > 3。');
            }
            status.textContent = msgs.join(' ');
            draw();
            if (ok) api.done('<b>循环原理（Kreislauf）。</b> 热力学把单程转化率限制在百分之十几，但只要把氨冷凝取出、把没反应的气体压回反应器、再用出口的热气预热进口气，几乎每个 N₂ 分子最终都会变成氨，而能量只花在补压和补热上。少量放空排掉惰性气体。1909 年 7 月 2 日，哈伯和助手 Robert Le Rossignol 的台式循环装置在约 200 atm 下连续运转，每小时产出约 80 g 液氨——BASF 当场决定投资。');
          }

          // flowsheet geometry
          function geo() {
            const W = cv.w, Hh = cv.h, bw = Math.min(64, Math.max(40, W * 0.11)), bh = Math.min(42, Hh * 0.18);
            const yM = Hh * 0.62, yT = Hh * 0.2;
            const X = (f) => 8 + f * (W - 16);
            return { W, Hh, bw, bh, yM, yT, feed: X(0.04), comp: X(0.19), mix: X(0.34), reac: X(0.5), hx: X(0.68), cond: X(0.88), circ: X(0.56), purge: X(0.76) };
          }
          function units(G) {
            return [
              { k: 'comp', x: G.comp, y: G.yM, label: '压缩机', on: true, fixed: true },
              { k: 'reac', x: G.reac, y: G.yM, label: '反应器', on: true, fixed: true },
              { k: 'hx', x: G.hx, y: G.yM, label: '换热器', on: cfg.hx },
              { k: 'cond', x: G.cond, y: G.yM, label: '冷凝器', on: cfg.cond },
              { k: 'rec', x: G.circ, y: G.yT, label: '循环机', on: cfg.rec },
            ];
          }
          function arrow(g, x1, y1, x2, y2, col, dash, w = 1.6) {
            g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w; g.setLineDash(dash ? [4, 4] : []);
            g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
            const a = Math.atan2(y2 - y1, x2 - x1), s = 6;
            g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45)); g.lineTo(x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45)); g.closePath(); g.fill();
          }
          function draw() {
            const g = cv.g, G = geo();
            g.fillStyle = C('--panel'); g.fillRect(0, 0, G.W, G.Hh);
            const fg = C('--fg'), mu = C('--muted'), ac = C('--accent'), hw = G.bw / 2, hh = G.bh / 2;
            g.font = '11px ' + mono(); g.textAlign = 'center'; g.textBaseline = 'middle';
            // main line
            g.fillStyle = mu; g.fillText('N₂+3H₂', G.feed + 6, G.yM - hh - 10);
            arrow(g, G.feed - 4, G.yM, G.comp - hw, G.yM, fg);
            arrow(g, G.comp + hw, G.yM, G.reac - hw, G.yM, fg);
            arrow(g, G.reac + hw, G.yM, G.hx - hw, G.yM, fg);
            arrow(g, G.hx + hw, G.yM, G.cond - hw, G.yM, fg);
            // product / exit
            if (cfg.cond) { arrow(g, G.cond, G.yM + hh, G.cond, G.Hh - 22, C('--s1'), false, 2.2); g.fillStyle = C('--s1'); g.fillText('液氨', G.cond, G.Hh - 12); }
            else if (!cfg.rec) { g.fillStyle = mu; g.textAlign = 'right'; g.fillText('混合气排出', G.W - 4, G.yM + hh + 14); g.textAlign = 'center'; }
            // recycle loop
            const recCol = cfg.rec ? C('--s3') : mu;
            g.globalAlpha = cfg.rec ? 1 : 0.35;
            g.strokeStyle = recCol; g.lineWidth = 1.6; g.setLineDash(cfg.rec ? [] : [4, 4]);
            g.beginPath(); g.moveTo(G.cond, G.yM - hh); g.lineTo(G.cond, G.yT); g.lineTo(G.circ + hw, G.yT); g.stroke();
            g.beginPath(); g.moveTo(G.circ - hw, G.yT); g.lineTo(G.mix, G.yT); g.stroke(); g.setLineDash([]);
            arrow(g, G.mix, G.yT, G.mix, G.yM - 3, recCol, !cfg.rec);
            g.globalAlpha = 1;
            // purge
            if (cfg.rec) { arrow(g, G.purge, G.yT, G.purge, G.yT - Math.min(22, G.yT - 6), C('--warn'), false, 1.2); g.fillStyle = C('--warn'); g.textAlign = 'left'; g.fillText('放空 ' + cfg.purge.toFixed(2) + '%', G.purge + 4, Math.max(8, G.yT - 16)); g.textAlign = 'center'; }
            else if (!cfg.rec && cfg.cond) { g.fillStyle = mu; g.textAlign = 'right'; g.fillText('未反应气体排空', G.W - 4, G.yT - 4); g.textAlign = 'center'; }
            // heat-exchange arrow
            if (cfg.hx) { g.save(); g.strokeStyle = C('--s2'); g.setLineDash([3, 3]); g.lineWidth = 1.3; g.beginPath(); g.moveTo(G.hx, G.yM + hh); g.quadraticCurveTo((G.hx + G.reac) / 2 - hw, G.yM + hh + 34, G.reac - hw - 6, G.yM + 4); g.stroke(); g.restore(); g.fillStyle = C('--s2'); g.fillText('预热', (G.hx + G.reac) / 2 - hw * 0.6, G.yM + hh + 26); }
            // mix node
            g.fillStyle = fg; g.beginPath(); g.arc(G.mix, G.yM, 3, 0, 7); g.fill();
            // units
            units(G).forEach((u) => {
              g.globalAlpha = u.on ? 1 : 0.45;
              g.fillStyle = C('--bg2'); g.fillRect(u.x - hw, u.y - hh, G.bw, G.bh);
              g.strokeStyle = u.on ? (u.fixed ? fg : ac) : mu; g.lineWidth = u.on ? 1.8 : 1; g.setLineDash(u.on ? [] : [3, 3]);
              g.strokeRect(u.x - hw + 0.5, u.y - hh + 0.5, G.bw - 1, G.bh - 1); g.setLineDash([]);
              g.fillStyle = u.on ? fg : mu; g.fillText(u.label, u.x, u.y);
              g.globalAlpha = 1;
            });
            // flow numbers
            if (res && res.valid && cfg.rec) { g.fillStyle = C('--s3'); g.fillText('×' + res.n.toFixed(1), (G.mix + G.reac) / 2 + 4, G.yM - hh - 8); }
          }
          cv.canvas.style.cursor = 'pointer';
          const onClick = (e) => {
            const r = cv.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, G = geo();
            const u = units(G).find((u) => !u.fixed && Math.abs(x - u.x) <= G.bw / 2 + 4 && Math.abs(y - u.y) <= G.bh / 2 + 4);
            if (!u) return;
            cfg[u.k] = !cfg[u.k]; ({ hx: tHx, cond: tCond, rec: tRec })[u.k].set(cfg[u.k]); update();
          };
          cv.canvas.addEventListener('click', onClick);
          cv.onResize(draw); update();
          const unwatch = themeWatch(draw);
          return { destroy() { cv.destroy(); unwatch(); cv.canvas.removeEventListener('click', onClick); } };
        },
      };

      /* ================= Stage 3 ================= */
      const s3 = {
        title: '为工厂选条件',
        task: `<p>1910 年起，BASF 的 Carl Bosch 负责把台式装置放大成工厂。材料不再是瓶颈（双层壁反应器能承受上千 atm），锇则太稀有——全世界的储量也不够一座工厂用。Alwin Mittasch 的团队于是系统地筛选催化剂，找到了一种掺少量 K₂O 和 Al₂O₃ 的“促进铁”。</p>
<p>现在由你定工况。每吨氨的成本包括：<b>压缩</b>（随 ln P 增长）、<b>循环</b>（单程转化率越低，要循环的气体越多，∝ 1/x）、<b>加热</b>、<b>催化剂</b>（锇极贵）、<b>反应器投资</b>（壁厚 ∝ P）。目标：<b>总成本 ≤ ${TARGET}</b>（相对单位）。</p>`,
        hints: [
          '先比较两种催化剂：锇那一栏的成本是不是已经吃掉了大部分预算？',
          '压力越高，单程转化率越高、循环越省，但压缩和设备投资越贵——两头都会把总成本拉高，最低点在中间。温度也一样。',
          '促进铁，温度 440–480 °C，压力 150–300 atm 附近找最低点。',
        ],
        answer: `成本 ≈ $7\\ln P + 20/x(T,P) + (T-25)/100 + c_{\\rm cat} + 0.1P$。促进铁在约 455 °C、约 210 atm 处取得最低值 ≈ 122（< ${TARGET}）；锇单催化剂一项就要 60，最低约 200；1000 atm 时设备投资就要 100，同样不划算。真实的哈伯-博施工厂至今仍在 400–500 °C、150–300 atm 下用铁催化剂运行。`,
        build(body, api) {
          const st = { Tc: 550, lp: Math.log10(100), cat: 'os' };
          const stage = h.el('div', { class: 'lab-stage' });
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });
          body.append(stage, controls, readout);
          const cv = h.canvas(stage, { aspect: 0.5, minH: 220, maxH: 320 });
          const P = () => Math.round(10 ** st.lp);
          const sT = h.slider({ label: '温度', min: 300, max: 700, step: 5, value: st.Tc, format: (v) => v + ' °C', onInput: (v) => { st.Tc = v; update(); } });
          const sP = h.slider({ label: '压力', min: 1, max: 3, step: 0.005, value: st.lp, format: (v) => Math.round(10 ** v) + ' atm', onInput: (v) => { st.lp = v; update(); } });
          const cCat = h.choice({ label: '催化剂', value: st.cat, options: [{ value: 'os', label: '锇 Os（稀有）' }, { value: 'fe', label: '促进铁 Fe–K₂O–Al₂O₃（Mittasch）' }], onChange: (v) => { st.cat = v; update(); } });
          controls.append(sT.el, sP.el, cCat.el);
          const ro = { x: h.readout('单程出口 NH₃'), c: h.readout('总成本 / 目标') };
          Object.values(ro).forEach((r) => readout.append(r.el));
          const LAB = [['comp', '压缩', '--s1'], ['rec', '循环', '--s3'], ['heat', '加热', '--s2'], ['cat', '催化剂', '--s4'], ['cap', '设备投资', '--muted']];
          let cur = null, bestSeen = Infinity;
          function update() {
            cur = cost(st.Tc, P(), st.cat);
            bestSeen = Math.min(bestSeen, cur.tot);
            ro.x.set((100 * yNH3(cur.x)).toFixed(1) + ' %');
            ro.c.set(cur.tot.toFixed(0) + ' / ' + TARGET);
            draw();
            if (cur.tot <= TARGET) api.done(`<b>博施与米塔施：把化学变成化工。</b> 你在 ${st.Tc} °C、${P()} atm、促进铁下把成本压到 ${cur.tot.toFixed(0)}：压力高到让单程转化率足够、又不至于让压缩和厚壁反应器吃掉利润；温度刚够铁催化剂快速工作。Mittasch 的团队为找到促进铁做了上万次试验；Bosch 解决了氢脆钢管与高压循环的工程难题。1913 年 9 月，BASF 奥堡（Oppau）工厂投产——空气中的氮第一次被大规模变成肥料。`);
          }
          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            g.fillStyle = C('--panel'); g.fillRect(0, 0, W, Hh);
            const max = 260;
            const pad = { l: 64, r: 14, t: 14, b: 30 };
            const ax = h.axes(g, W, Hh, { x0: 0, x1: max, y0: 0, y1: 6, pad, xTicks: [0, 50, 100, 150, 200, 250], yTicks: [], xLabel: '相对成本 / 吨 NH₃' }, C);
            const rh = ax.ih / 6;
            g.font = '12px ' + (C('--body-font') || 'sans-serif'); g.textBaseline = 'middle';
            LAB.forEach(([k, lab, col], i) => {
              const v = cur.parts[k], y = ax.p.t + rh * i + rh * 0.2;
              g.fillStyle = C(col); g.fillRect(ax.X(0), y, Math.max(1, ax.X(Math.min(v, max)) - ax.X(0)), rh * 0.6);
              g.fillStyle = C('--fg'); g.textAlign = 'right'; g.fillText(lab, ax.p.l - 6, y + rh * 0.3);
              g.textAlign = 'left'; g.font = '11px ' + mono(); g.fillText(v.toFixed(0), Math.min(ax.X(Math.min(v, max)) + 4, W - 40), y + rh * 0.3); g.font = '12px ' + (C('--body-font') || 'sans-serif');
            });
            // stacked total
            const y = ax.p.t + rh * 5 + rh * 0.15; let acc = 0;
            LAB.forEach(([k, , col]) => { const v = cur.parts[k]; const a = Math.min(acc, max), b = Math.min(acc + v, max); g.fillStyle = C(col); g.fillRect(ax.X(a), y, Math.max(0, ax.X(b) - ax.X(a)), rh * 0.7); acc += v; });
            g.fillStyle = C('--fg'); g.textAlign = 'right'; g.font = 'bold 12px ' + (C('--body-font') || 'sans-serif'); g.fillText('合计', ax.p.l - 6, y + rh * 0.35);
            g.textAlign = 'left'; g.font = '11px ' + mono(); g.fillText(cur.tot.toFixed(0), Math.min(ax.X(Math.min(cur.tot, max)) + 4, W - 40), y + rh * 0.35);
            // target line
            const xt = ax.X(TARGET);
            g.strokeStyle = C(cur.tot <= TARGET ? '--good' : '--accent'); g.lineWidth = 1.5; g.setLineDash([5, 4]);
            g.beginPath(); g.moveTo(xt, ax.p.t); g.lineTo(xt, ax.p.t + ax.ih); g.stroke(); g.setLineDash([]);
            g.fillStyle = g.strokeStyle; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('目标 ' + TARGET, xt + 4, ax.p.t + 2);
            if (isFinite(bestSeen)) { const xb = ax.X(Math.min(bestSeen, max)); g.fillStyle = C('--muted'); g.beginPath(); g.moveTo(xb, ax.p.t + ax.ih); g.lineTo(xb - 4, ax.p.t + ax.ih + 6); g.lineTo(xb + 4, ax.p.t + ax.ih + 6); g.fill(); }
          }
          cv.onResize(() => cur && draw()); update();
          const unwatch = themeWatch(draw);
          return { destroy() { cv.destroy(); unwatch(); } };
        },
      };

      return H.stages(root, ctx, [s1, s2, s3]);
    },
  };
})();
