/* 神经冲动的电池 — 挑战版（Nobel Medicine 1963: Hodgkin & Huxley, ionic mechanisms of nerve excitation）
 * 时代：Plymouth / Cambridge 1939–1952，枪乌贼巨轴突。
 * 读者自己做三件事：(1) 改胞外离子浓度，从峰值/静息随 log 浓度的斜率认出是哪种离子；
 * (2) 用电压钳把总电流拆成早期内向 + 晚期外向，量出早期电流的反转电位；
 * (3) 调门控速率与最大电导，把方程的解拟合到"记录"到的动作电位上。
 *
 * 物理同 labs/hh.js（复制并改写）：C dV/dt = I − ḡNa m³h (V−E_Na) − ḡK n⁴ (V−E_K) − ḡL (V−E_L)，RK4，dt = 0.01 ms。
 * 这里 E_Na、E_K 由 Nernst 给出（18 °C，58 mV/decade）：E_Na = 58·log10([Na]o/[Na]i)，[Na]i = 50 mM；
 * E_K = 58·log10([K]o/[K]i)，[K]i = 400 mM。海水 [Na]o = 440、[K]o = 10 mM → E_Na ≈ +54.8、E_K ≈ −92.9 mV。
 * 每个门控的 α/β 另乘一个读者可调的速率因子 sm/sh/sn（第三关）。
 */
(() => {
  const DT = 0.01, NAO = 440, NAI = 50, KI = 400, NERNST = 58;
  const BASE = { C: 1, gNa: 120, gK: 36, gL: 0.3, ENa: 54.8, EK: -92.9, EL: -54.387, sm: 1, sh: 1, sn: 1 };
  const ST = { amp: 40, dur: 1, t0: 1, T: 25 }; // 刺激：1 ms、40 µA/cm²，t0 = 1 ms；记录到 25 ms
  const ENaOf = (f) => NERNST * Math.log10((NAO * f) / NAI);
  const EKOf = (ko) => NERNST * Math.log10(ko / KI);

  const vtrap = (x, k) => (Math.abs(x / k) < 1e-6 ? k + x / 2 : x / (1 - Math.exp(-x / k)));
  const rates = (V) => ({
    am: 0.1 * vtrap(V + 40, 10), bm: 4 * Math.exp(-(V + 65) / 18),
    ah: 0.07 * Math.exp(-(V + 65) / 20), bh: 1 / (1 + Math.exp(-(V + 35) / 10)),
    an: 0.01 * vtrap(V + 55, 10), bn: 0.125 * Math.exp(-(V + 65) / 80),
  });
  const xinf = (V) => { const r = rates(V); return [r.am / (r.am + r.bm), r.ah / (r.ah + r.bh), r.an / (r.an + r.bn)]; };
  const currents = ([V, m, h, n], p) => ({ INa: p.gNa * m * m * m * h * (V - p.ENa), IK: p.gK * n ** 4 * (V - p.EK), IL: p.gL * (V - p.EL) });
  function deriv(y, I, p) {
    const r = rates(y[0]), c = currents(y, p);
    return [(I - c.INa - c.IK - c.IL) / p.C, p.sm * (r.am * (1 - y[1]) - r.bm * y[1]),
      p.sh * (r.ah * (1 - y[2]) - r.bh * y[2]), p.sn * (r.an * (1 - y[3]) - r.bn * y[3])];
  }
  function rk4(y, I, p, dt) {
    const k1 = deriv(y, I, p), a = (k, s) => y.map((v, i) => v + s * k[i]);
    const k2 = deriv(a(k1, dt / 2), I, p), k3 = deriv(a(k2, dt / 2), I, p), k4 = deriv(a(k3, dt), I, p);
    return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  /* 稳态（静息）电位：稳态 I–V 曲线的零点，二分法 */
  function restV(p) {
    const f = (V) => { const [m, h, n] = xinf(V), c = currents([V, m, h, n], p); return c.INa + c.IK + c.IL; };
    let a = -120, b = 60;
    for (let i = 0; i < 90; i++) { const c = (a + b) / 2; f(a) * f(c) <= 0 ? (b = c) : (a = c); }
    return (a + b) / 2;
  }
  /* 自由运行（电流钳）：一次方脉冲，返回采样后的 V(t) 与电导 */
  function simAP(p, o = {}) {
    const q = Object.assign({}, ST, o), V0 = restV(p);
    let y = [V0, ...xinf(V0)];
    const out = { V0, t: [], V: [], gNa: [], gK: [] };
    const N = Math.round(q.T / DT), every = 4;
    for (let i = 0; i < N; i++) {
      const t = i * DT, I = t >= q.t0 && t < q.t0 + q.dur ? q.amp : 0;
      y = rk4(y, I, p, DT);
      if (i % every === 0) { out.t.push(t + DT); out.V.push(y[0]); out.gNa.push(p.gNa * y[1] ** 3 * y[2]); out.gK.push(p.gK * y[3] ** 4); }
    }
    out.peak = Math.max(...out.V);
    return out;
  }
  /* 电压钳：V 被钳住，门控照常演化，电流 = 各离子电流之和（内流为负） */
  function simClamp(p, Vstep, { hold = -65, T = 10, noNa = false } = {}) {
    let [m, h, n] = xinf(hold);
    const out = { t: [], I: [], INa: [] }, N = Math.round(T / DT), every = 2;
    const gNa = noNa ? 0 : p.gNa;
    for (let i = 0; i < N; i++) {
      const r = rates(Vstep);
      m += DT * p.sm * (r.am * (1 - m) - r.bm * m);
      h += DT * p.sh * (r.ah * (1 - h) - r.bh * h);
      n += DT * p.sn * (r.an * (1 - n) - r.bn * n);
      const INa = gNa * m ** 3 * h * (Vstep - p.ENa), IK = p.gK * n ** 4 * (Vstep - p.EK), IL = p.gL * (Vstep - p.EL);
      if (i % every === 0) { out.t.push(i * DT + DT); out.I.push(INa + IK + IL); out.INa.push(INa); }
    }
    return out;
  }
  const mul32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const CSS = `.hhc-plots{display:grid;gap:10px}
.hhc-tab{max-height:208px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.hhc-tab table{width:100%}
.hhc-tab th{position:sticky;top:0;background:var(--panel);z-index:1}
.hhc-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--muted);font-family:var(--mono-font,monospace)}
.hhc-leg i{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
.hhc-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.hhc-rms{font-family:var(--mono-font,monospace);font-size:15px;color:var(--fg)}
.hhc-rms b{font-size:19px}`;

  function injectCSS() { if (!document.getElementById('st-hh')) document.head.append(H.el('style', { id: 'st-hh', text: CSS })); }
  /* 主题变化时重画 */
  function onTheme(fn) {
    const mo = new MutationObserver(fn);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const lis = () => fn();
    mq.addEventListener ? mq.addEventListener('change', lis) : mq.addListener(lis);
    return () => { mo.disconnect(); mq.removeEventListener ? mq.removeEventListener('change', lis) : mq.removeListener(lis); };
  }
  const line = (g, A, xs, ys, color, w = 2, dash = null) => {
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.restore();
  };
  const legend = (items) => H.el('div', { class: 'hhc-leg' }, items.map(([t, c, d]) =>
    H.el('span', {}, [H.el('i', { style: `background:${d ? `repeating-linear-gradient(90deg,${c} 0 4px,transparent 4px 7px)` : c}` }), t])));

  CHALLENGES.hh = {
    title: '神经冲动的电池',
    mount(root, ctx) {
      injectCSS();
      const h = ctx.h, col = ctx.color;

      /* ================= 第一关：哪种离子在推动？ ================= */
      const stage1 = {
        title: '哪种离子在推动？',
        task: `1939 年，普利茅斯。你把一根玻璃微电极插进枪乌贼的巨轴突（直径近 1 mm，世上最粗的神经纤维），
          另一根放在海水里，于是第一次能直接读出<b>膜内相对膜外</b>的电位。给一个短电刺激，膜电位会猛地
          翻转、冲过 0 mV（"超射"），再掉回来。
          <p>当时的教科书（Bernstein 1902）说：静息时膜只对某一种离子通透，兴奋时膜"短路"，电位应当趋向 0 mV
          而<b>不该冲过去</b>。可它明明冲过去了。所以超射的那部分电位，必定来自某种有自己电池的离子。</p>
          <p>你手里能改的只有<b>外液配方</b>：把海水的 Na⁺ 用等渗的葡萄糖稀释（保留 $f$ 倍），或往外液里加 KCl。
          如果某种离子是某段电位的来源，按 Nernst 这段电位应当随 $\\log_{10}$ 它的<b>胞外浓度</b>线性移动，
          18 °C 时斜率 $58\\,$mV/decade。</p>
          <p><b>任务</b>：改外液、刺激、记录。至少取 3 个只变 Na⁺ 的点、3 个只变 K⁺ 的点（表格会自动记下静息电位和峰值）。
          然后在右边的图上分别看<b>峰值</b>和<b>静息电位</b>各自跟着谁走，量出那条直线的斜率。</p>`,
        hints: [
          '两个量、两个离子，一共四种组合。先问：把外液 Na⁺ 稀释到 1/10，<b>静息</b>电位动了吗？峰值动了吗？再把 [K⁺]o 加到 10 倍，问同样两句。',
          '数据点画在半对数轴上（横轴已经是 $\\log_{10}$ 浓度），所以"斜率"就是：浓度每变 10 倍，那个电位变几 mV。取横轴跨度最大的两点，用 $\\Delta V/\\Delta\\log_{10}c$ 就够了。',
          '峰值对 $\\log_{10}[\\mathrm{Na}^+]_o$ 的斜率接近理想的 58 mV/decade（模型里约 56–57）。静息电位几乎不随 Na⁺ 动，却随 $\\log_{10}[\\mathrm{K}^+]_o$ 以约 43 mV/decade 上移——它由 K⁺ 主导，只是被漏电流拉得比 58 浅一些。',
        ],
        answer: `峰值跟着 <b>Na⁺</b>：$V_{\\rm peak}$ 对 $\\log_{10}[\\mathrm{Na}^+]_o$ 的斜率约 <b>56 mV/decade</b>，与 Nernst 的
          $58\\,$mV/decade 几乎一致，而静息电位对 Na⁺ 几乎无反应。静息跟着 <b>K⁺</b>：$V_{\\rm rest}$ 随
          $\\log_{10}[\\mathrm{K}^+]_o$ 以约 43 mV/decade 上移（低于 58，因为还有一份不随 K⁺ 变的漏电导在分压）。
          <p>推导：峰值时膜几乎只对 Na⁺ 通透，$V_{\\rm peak}\\to E_{\\rm Na}=58\\log_{10}([\\mathrm{Na}]_o/[\\mathrm{Na}]_i)$，
          所以 $dV_{\\rm peak}/d\\log_{10}[\\mathrm{Na}]_o=58$；稀释到 $f$ 倍即把 $E_{\\rm Na}$ 下移 $58\\log_{10}f$。
          静息时膜几乎只对 K⁺ 通透，$V_{\\rm rest}\\to E_{\\rm K}$，斜率同理为 58，被漏电导稀释后实测 40–45。</p>`,
        build(body, api) {
          const S = { f: 1, ko: 10, rows: [], mode: 'na', ansOK: false, quizOK: false };
          const par = () => ({ ...BASE, ENa: ENaOf(S.f), EK: EKOf(S.ko) });
          let last = null;

          const plots = h.el('div', { class: 'hhc-plots' });
          const boxV = h.el('div'), boxD = h.el('div');
          plots.append(boxV, boxD);
          const cvV = h.canvas(boxV, { aspect: 0.52, minH: 190, maxH: 260 });
          boxV.append(legend([['V(t) 记录', col('--fg')], ['E_Na', col('--s1'), 1], ['E_K', col('--s2'), 1]]));
          const cvD = h.canvas(boxD, { aspect: 0.52, minH: 190, maxH: 260 });
          const controls = h.el('div', { class: 'lab-controls' });
          const readout = h.el('div', { class: 'lab-readout' });

          const sNa = h.slider({ label: '外液 Na⁺（海水的几分之几）', min: 0.1, max: 1, step: 0.05, value: 1,
            format: (v) => `${v.toFixed(2)} × → ${Math.round(NAO * v)} mM`, onInput: (v) => { S.f = v; info(); } });
          const sK = h.slider({ label: '外液 [K⁺]o（海水 10 mM）', min: 10, max: 100, step: 5, value: 10,
            format: (v) => `${v} mM`, onInput: (v) => { S.ko = v; info(); } });
          const cMode = h.choice({ label: '下图画什么', value: 'na',
            options: [{ value: 'na', label: '峰值 vs log[Na⁺]o' }, { value: 'k', label: '静息 vs log[K⁺]o' }],
            onChange: (v) => { S.mode = v; drawD(); } });
          const bGo = h.button({ label: '刺激并记录', kind: 'primary', onClick: record });
          const bClr = h.button({ label: '清空表格', onClick: () => { S.rows = []; fill(); drawD(); } });
          controls.append(sNa.el, sK.el, bGo, bClr, cMode.el);

          const R = {
            e: h.readout('本次外液的 Nernst 电位'),
            r: h.readout('静息电位 V_rest'),
            p: h.readout('峰值 V_peak'),
            n: h.readout('已记录'),
          };
          Object.values(R).forEach((x) => readout.append(x.el));

          const tbody = h.el('tbody');
          const tab = h.el('div', { class: 'hhc-tab dtable' }, [h.el('table', {}, [
            h.el('thead', {}, [h.el('tr', {}, ['[Na⁺]o (mM)', '[K⁺]o (mM)', 'log₁₀[Na]o', 'log₁₀[K]o', 'V_rest (mV)', 'V_peak (mV)']
              .map((t) => h.el('th', { text: t })))]), tbody])]);

          function info() {
            R.e.set(`E_Na = ${ENaOf(S.f).toFixed(1)} mV　E_K = ${EKOf(S.ko).toFixed(1)} mV`);
          }
          function record() {
            const p = par(), r = simAP(p);
            const rnd = mul32(Math.round(S.f * 1000) * 7919 + S.ko * 104729);
            const nz = () => (rnd() * 2 - 1) * 0.7; // 记录噪声 ±0.7 mV
            const row = { na: NAO * S.f, ko: S.ko, rest: r.V0 + nz(), peak: r.peak + nz() };
            S.rows.push(row); last = { r, p };
            R.r.set(`${row.rest.toFixed(1)} mV`);
            R.p.set(`${row.peak >= 0 ? '+' : ''}${row.peak.toFixed(1)} mV` + (row.peak < 0 ? '（没有超射：峰值还在 0 mV 以下）' : ''));
            fill(); drawV(); drawD();
          }
          function fill() {
            tbody.textContent = '';
            S.rows.forEach((r) => tbody.append(h.el('tr', {}, [
              h.el('td', { text: r.na.toFixed(0) }), h.el('td', { text: String(r.ko) }),
              h.el('td', { text: Math.log10(r.na).toFixed(3) }), h.el('td', { text: Math.log10(r.ko).toFixed(3) }),
              h.el('td', { text: r.rest.toFixed(1) }), h.el('td', { text: r.peak.toFixed(1) }),
            ])));
            const nNa = S.rows.filter((r) => r.ko === 10).length, nK = S.rows.filter((r) => Math.abs(r.na - NAO) < 1).length;
            R.n.set(`${S.rows.length} 条（变 Na⁺ 的 ${nNa} 条，变 K⁺ 的 ${nK} 条）`);
          }
          function drawV() {
            const g = cvV.g, W = cvV.w, Hh = cvV.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: ST.T, y0: -105, y1: 70, pad: { l: 46, r: 40, t: 12, b: 32 },
              xTicks: [0, 5, 10, 15, 20, 25], yTicks: [-100, -50, 0, 50], xLabel: 't (ms)', yLabel: 'V (mV)' }, col);
            if (!last) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center';
              g.fillText('按「刺激并记录」', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            [[last.p.ENa, '--s1'], [last.p.EK, '--s2']].forEach(([E, c]) => {
              g.strokeStyle = col(c); g.lineWidth = 1; g.setLineDash([5, 4]);
              g.beginPath(); g.moveTo(A.p.l, A.Y(E)); g.lineTo(A.p.l + A.iw, A.Y(E)); g.stroke(); g.setLineDash([]);
            });
            g.strokeStyle = col('--grid'); g.lineWidth = 1;
            g.beginPath(); g.moveTo(A.p.l, A.Y(0)); g.lineTo(A.p.l + A.iw, A.Y(0)); g.stroke();
            line(g, A, last.r.t, last.r.V, col('--fg'), 2);
            g.restore();
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillText('0 mV', A.p.l + A.iw + 3, A.Y(0));
            g.fillStyle = col('--s1'); g.fillText('E_Na', A.p.l + A.iw + 3, A.Y(Math.min(last.p.ENa, 66)));
            g.fillStyle = col('--s2'); g.fillText('E_K', A.p.l + A.iw + 3, A.Y(last.p.EK));
          }
          function drawD() {
            const g = cvD.g, W = cvD.w, Hh = cvD.h, na = S.mode === 'na';
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const pts = na
              ? S.rows.filter((r) => r.ko === 10).map((r) => [Math.log10(r.na), r.peak])
              : S.rows.filter((r) => Math.abs(r.na - NAO) < 1).map((r) => [Math.log10(r.ko), r.rest]);
            const A = h.axes(g, W, Hh, na
              ? { x0: 1.5, x1: 2.72, y0: -40, y1: 70, pad: { l: 46, r: 14, t: 12, b: 34 }, xTicks: [1.6, 1.8, 2, 2.2, 2.4, 2.6],
                yTicks: [-40, -20, 0, 20, 40, 60], xLabel: 'log₁₀[Na⁺]o', yLabel: 'V_peak (mV)', fmtX: (v) => v.toFixed(1) }
              : { x0: 0.9, x1: 2.1, y0: -80, y1: -20, pad: { l: 46, r: 14, t: 12, b: 34 }, xTicks: [1, 1.2, 1.4, 1.6, 1.8, 2],
                yTicks: [-80, -70, -60, -50, -40, -30, -20], xLabel: 'log₁₀[K⁺]o', yLabel: 'V_rest (mV)', fmtX: (v) => v.toFixed(1) }, col);
            if (!pts.length) {
              g.fillStyle = col('--muted'); g.font = '13px ' + col('--body-font'); g.textAlign = 'center';
              g.fillText(na ? '记录几个不同 Na⁺ 的点（[K⁺]o 留在 10）' : '记录几个不同 K⁺ 的点（Na⁺ 留在 1.00×）', A.p.l + A.iw / 2, A.p.t + A.ih / 2);
              return;
            }
            // 参考：58 mV/decade 的斜率尺（画在角上，只给斜率感觉，不给拟合结果）
            g.save(); g.strokeStyle = col('--line'); g.lineWidth = 1.5; g.setLineDash([4, 3]);
            const x1 = A.p.l + 12;
            const dx = A.X(2) - A.X(1), dy = A.Y(0) - A.Y(58);
            g.beginPath(); g.moveTo(x1, A.p.t + A.ih - 14); g.lineTo(x1 + dx * 0.35, A.p.t + A.ih - 14 - dy * 0.35); g.stroke();
            g.setLineDash([]); g.fillStyle = col('--muted'); g.font = '10px ' + col('--mono-font');
            g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('58 mV/decade', x1 + 2, A.p.t + A.ih - 16 - dy * 0.35);
            g.restore();
            g.fillStyle = col(na ? '--s1' : '--s2');
            pts.forEach(([x, y]) => { g.beginPath(); g.arc(A.X(x), A.Y(y), 4, 0, 7); g.fill(); });
          }

          const ans = H.answer({
            label: '峰值对 $\\log_{10}[\\mathrm{Na}^+]_o$ 的斜率（mV/decade，容差较宽）',
            unit: 'mV/decade', placeholder: '例如 56',
            check(v) {
              const nNa = S.rows.filter((r) => r.ko === 10).length, nK = S.rows.filter((r) => Math.abs(r.na - NAO) < 1).length;
              if (nNa < 3 || nK < 3) return { ok: false, msg: `先把数据取够：只变 Na⁺ 的点 ${nNa}/3，只变 K⁺ 的点 ${nK}/3。` };
              if (v > 0 && v < 1.2) return { ok: false, msg: '单位是 mV/decade（浓度每变 10 倍电位变几 mV），不是 V 或每倍浓度。' };
              if (Math.abs(v + 56) < 12) return { ok: false, msg: '符号反了：稀释外液 Na⁺ 会让峰值<b>下降</b>，所以峰值随 log₁₀[Na⁺]o <b>上升</b>。' };
              if (v >= 38 && v < 46) return { ok: false, msg: '约 43 mV/decade 是<b>静息电位对 K⁺</b>的斜率。峰值对 Na⁺ 的那条更陡。' };
              if (v >= 46 && v <= 66) return { ok: true, msg: '对。约 56 mV/decade，几乎就是 18 °C 的 Nernst 斜率 58 —— 峰值时膜几乎是一个纯 Na⁺ 电极。' };
              return { ok: false, msg: '不在范围内。取横轴跨度最大的两点算 ΔV/Δlog₁₀c 看看。' };
            },
            onOk() { S.ansOK = true; finish(); },
          });
          const quiz = H.quiz({
            question: '动作电位的<b>峰值</b>由哪种离子决定？<b>静息电位</b>呢？',
            options: [
              { label: '峰值跟着 Na⁺，静息跟着 K⁺', ok: true, why: '对。峰值随 log₁₀[Na⁺]o 以近 Nernst 的斜率移动而几乎不理 K⁺；静息随 log₁₀[K⁺]o 移动而几乎不理 Na⁺。' },
              { label: '峰值跟着 K⁺，静息跟着 Na⁺', ok: false, why: '反了。加 K⁺ 抬高的是静息电位；稀释 Na⁺ 压低的是峰值。' },
              { label: '两者都由 K⁺ 决定，Na⁺ 只管膜的渗透压', ok: false, why: '那就无法解释稀释 Na⁺ 时峰值成比例下降，也无法解释超射。' },
              { label: '两者都由 Cl⁻ 决定', ok: false, why: '实验里你没动 Cl⁻，两个电位却都变了。' },
            ],
            onOk() { S.quizOK = true; finish(); },
          });
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>钠假说。</b>超射来自 Na⁺ 自己的电池：兴奋时膜短暂地变成一个 Na⁺ 电极，
              把膜电位拉向 $E_{\\rm Na}$（为正），所以必然冲过 0 mV —— Hodgkin 与 Katz 1949 年正是这样用稀释海水证明的，
              而 Bernstein 的"膜短路"理论预言电位最多到 0 mV、不该有超射。静息电位则由 K⁺ 把守。`);
          }

          body.append(plots, controls, readout, tab,
            h.el('div', { class: 'hhc-row' }, [ans.el]), quiz.el);
          api.typeset(body);
          info(); fill(); drawV(); drawD();
          cvV.onResize(drawV); cvD.onResize(drawD);
          const off = onTheme(() => { drawV(); drawD(); });
          return { destroy() { off(); cvV.destroy(); cvD.destroy(); } };
        },
      };

      /* ================= 第二关：电压钳 ================= */
      const stage2 = {
        title: '电压钳',
        task: `麻烦在于：膜电位、离子电流、膜电导三者互相喂养，电位一动电导就动，没法分开看。
          1947–49 年 Cole 与 Marmont 想出一个办法：用负反馈把膜电位<b>强行按住</b>在你指定的值上，
          再去量为了按住它、电路必须灌进来多少电流。电位被钳死了，剩下的电流就直接读出膜电导的时间过程。
          <p>现在轴突在钳下。保持电位 −65 mV，你一按就把它跳到 $V_{\\rm step}$ 并维持 10 ms，记下膜电流
          （<b>约定：内向电流为负、向下</b>）。你还有一瓶等渗<b>氯化胆碱</b>——把外液的 Na⁺ 整个换掉而保持渗透压，
          那份属于 Na⁺ 的电流就该消失；两条迹相减，剩下的就是它。</p>
          <p><b>任务</b>：扫 $V_{\\rm step}$，找出<b>早期那股电流由内向翻成外向</b>的那个电位（它的反转电位），填进下面。
          再回答这两股电流的动力学。</p>`,
        hints: [
          '先在 0 mV 左右看一眼：电流先急速向下（内向）再翻上来变成持续外向。换上胆碱外液，向下那一支没了——所以早期是 Na⁺ 的。',
          '"反转电位"就是驱动力 $V-E$ 变号的地方：把 $V_{\\rm step}$ 一格一格往正推，早期那个向下的尖峰越来越浅，某个电位上它<b>翻成向上的尖峰</b>。开着"相减得到 I_Na"看最清楚。',
          '它就在 +55 mV 附近，正是海水里 $E_{\\rm Na}=58\\log_{10}(440/50)\\approx+54.8$ mV。这正好印证第一关：早期内向电流是 Na⁺ 流。',
        ],
        answer: `早期电流在约 <b>+55 mV</b> 反转，等于 $E_{\\rm Na}=58\\log_{10}([\\mathrm{Na}]_o/[\\mathrm{Na}]_i)=58\\log_{10}(440/50)\\approx+54.8$ mV。
          <p>因为早期电流 $I_{\\rm Na}=\\bar g_{\\rm Na}m^3h\\,(V-E_{\\rm Na})$：电导因子恒正，电流的符号只由 $V-E_{\\rm Na}$ 决定，
          所以 $V\\lt E_{\\rm Na}$ 时内向、$V\\gt E_{\\rm Na}$ 时外向，恰在 $V=E_{\\rm Na}$ 处为零。用胆碱替换 Na⁺ 后它整支消失，
          直接证明载流离子是 Na⁺。晚期电流则在 $E_{\\rm K}\\approx-93$ mV 反转，是 K⁺ 流。</p>`,
        build(body, api) {
          const S = { v: 0, na0: false, sub: false, ansOK: false, quizOK: false };
          const p = { ...BASE };
          const plots = h.el('div', { class: 'hhc-plots' });
          const cv = h.canvas(plots, { aspect: 0.55, minH: 200, maxH: 300 });
          const leg = legend([["总电流", col("--fg")], ["胆碱外液（无 Na⁺）", col("--s2"), 1], ["相减 = I_Na", col("--s1")]]);
          const controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });

          const sV = h.slider({ label: '阶跃到 V_step（保持 −65 mV）', min: -100, max: 60, step: 5, value: 0,
            format: (v) => `${v > 0 ? '+' : ''}${v} mV`, onInput: (v) => { S.v = v; draw(); } });
          const tNa = h.toggle({ label: '用胆碱替换外液 Na⁺', onChange: (b) => { S.na0 = b; draw(); } });
          const tSub = h.toggle({ label: '相减得到 I_Na（叠加显示）', onChange: (b) => { S.sub = b; draw(); } });
          const bSub = h.button({ label: '相减得到 I_Na', onClick: () => { S.sub = !S.sub; tSub.set(S.sub); draw(); } });
          controls.append(sV.el, bSub, tNa.el, tSub.el);
          const R = { e: h.readout('早期电流（前 3 ms 的极值）'), l: h.readout('晚期电流（第 10 ms）'), d: h.readout('驱动力') };
          Object.values(R).forEach((x) => readout.append(x.el));

          function draw() {
            const g = cv.g, W = cv.w, Hh = cv.h;
            const tot = simClamp(p, S.v, { noNa: S.na0 }), free = simClamp(p, S.v, { noNa: true });
            const diff = tot.I.map((v, i) => v - free.I[i]);
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            const A = h.axes(g, W, Hh, { x0: 0, x1: 10, y0: -1900, y1: 1200, pad: { l: 58, r: 14, t: 12, b: 34 },
              xTicks: [0, 2, 4, 6, 8, 10], yTicks: [-1500, -1000, -500, 0, 500, 1000],
              xLabel: 't (ms)　内向为负', yLabel: 'I (µA/cm²)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            g.strokeStyle = col('--line'); g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(A.p.l, A.Y(0)); g.lineTo(A.p.l + A.iw, A.Y(0)); g.stroke();
            if (!S.na0) line(g, A, free.t, free.I, col('--s2'), 1.6, [5, 4]);
            line(g, A, tot.t, tot.I, col('--fg'), 2.2);
            if (S.sub) line(g, A, tot.t, diff, col('--s1'), 2);
            g.restore();
            // 读数
            let ex = 0, exi = 0;
            const src = S.sub ? diff : tot.I;
            for (let i = 0; i < src.length; i++) if (tot.t[i] <= 3 && Math.abs(src[i]) > Math.abs(ex)) { ex = src[i]; exi = i; }
            R.e.set(`${ex > 0 ? '+' : ''}${ex.toFixed(0)} µA/cm²（${ex < 0 ? '内向 ↓' : '外向 ↑'}，t ≈ ${tot.t[exi].toFixed(2)} ms）`);
            R.l.set(`${src[src.length - 1] > 0 ? '+' : ''}${src[src.length - 1].toFixed(0)} µA/cm²（持续${src[src.length - 1] > 0 ? '外向' : '内向'}）`);
            R.d.set(`V_step − E_Na = ${(S.v - p.ENa).toFixed(1)} mV　V_step − E_K = ${(S.v - p.EK).toFixed(1)} mV`);
            g.fillStyle = col('--muted'); g.font = '11px ' + col('--mono-font'); g.textAlign = 'right';
            g.fillText(`V_step = ${S.v > 0 ? '+' : ''}${S.v} mV`, A.p.l + A.iw - 4, A.p.t + 12);
          }
          const ans = H.answer({
            label: '早期电流的反转电位（mV，容差 ±7）', unit: 'mV', placeholder: '例如 55',
            check(v) {
              if (Math.abs(v + 93) < 12) return { ok: false, msg: '约 −93 mV 是<b>晚期</b>外向电流的反转电位（那支是 K⁺）。问的是早期那股。' };
              if (Math.abs(v - 54.8) <= 7) return { ok: true, msg: '对。≈ +55 mV，正是 $E_{\\rm Na}=58\\log_{10}(440/50)$ —— 早期内向电流就是 Na⁺ 流。' };
              if (v > -10 && v < 20) return { ok: false, msg: '再往正推：在 0 mV 附近早期电流还是明显内向（向下），还没翻。' };
              return { ok: false, msg: '不对。把 V_step 一格格往正推，看那个向下的早期尖峰什么时候变成向上的。' };
            },
            onOk() { S.ansOK = true; finish(); },
          });
          const quiz = H.quiz({
            question: '从这些钳位迹看，两股电流的<b>时间过程</b>分别是什么样？',
            options: [
              { label: '早期内向电流：快开启然后自行关闭；晚期外向电流：慢开启且不关闭', ok: true,
                why: '对。这正是 HH 要造的两套门：Na⁺ 电导有"开"和"关"两个独立过程（$m$ 快开、$h$ 慢关），K⁺ 电导只有一个慢的开启（$n$），维持住不衰减。' },
              { label: '两股都是快开启然后自行关闭，只是极性相反', ok: false, why: '不对。把 V_step 维持 10 ms，外向那支一直不衰减。' },
              { label: '早期慢开启不关闭；晚期快开启后关闭', ok: false, why: '恰好说反了：向下的尖峰在 1 ms 内就到顶并衰减，向上那支要几 ms 才爬上来。' },
              { label: '两股都是慢开启且都不关闭', ok: false, why: '那内向那支就不会在维持钳位的过程中自己消失了——但它确实消失了。' },
            ],
            onOk() { S.quizOK = true; finish(); },
          });
          function finish() {
            if (S.ansOK && S.quizOK) api.done(`<b>电压钳。</b>把电位按住（Cole 与 Marmont 的反馈电路），
              膜电流就被拆成两份可分别测量的离子流：一份快开快关的 Na⁺ 内流、一份慢开不关的 K⁺ 外流。
              Hodgkin、Huxley 与 Katz 1952 年用它系统测遍每个电位下两种电导的时间过程，才有了下一关要拟合的那组方程。`);
          }
          body.append(plots, leg, controls, readout, h.el('div', { class: 'hhc-row' }, [ans.el]), quiz.el);
          api.typeset(body);
          draw(); cv.onResize(draw);
          const off = onTheme(draw);
          return { destroy() { off(); cv.destroy(); } };
        },
      };

      /* ================= 第三关：用方程重建动作电位 ================= */
      const stage3 = {
        title: '用方程重建动作电位',
        task: `你来当赫胥黎。1952 年夏，手里只有钳位数据和一台机械计算机。
          <p>骨架已经搭好：膜是电容并上三条支路，$C\\,dV/dt = I - \\bar g_{\\rm Na}m^3h\\,(V-E_{\\rm Na}) - \\bar g_{\\rm K}n^4\\,(V-E_{\\rm K}) - \\bar g_{\\rm L}(V-E_{\\rm L})$，
          三个门控变量各自服从 $dx/dt=\\alpha_x(V)(1-x)-\\beta_x(V)\\,x$，$\\alpha,\\beta$ 的电压依赖取自钳位实验。</p>
          <p>缺的是<b>标度</b>：每个门有多快、两种通道各有多大的最大电导。下面五个旋钮分别把 $m$、$h$、$n$ 的
          $\\alpha,\\beta$ 整体乘上一个倍率（1× = 钳位数据给出的值），以及 $\\bar g_{\\rm Na}$、$\\bar g_{\\rm K}$。
          现在的设置是故意调坏的：$m$ 被调得和 $n$ 一样慢、$h$ 被调得飞快，于是<b>根本不发放</b>。</p>
          <p><b>任务</b>：让模型的 $V(t)$ 贴上灰色那条"实测"动作电位，把 0–20 ms 窗口里的 RMS 误差压到 <b>6 mV 以下</b>。
          下面一栏同时画出模型给出的三条电导迹，可以对照着调。</p>`,
        hints: [
          '先看现在为什么不发放：下面 $g_{\\rm Na}$ 那条几乎没有起来。$m$ 是"开"、$h$ 是"关"；$h$ 太快，等于 Na⁺ 通道刚开就被掐掉。先把 $h$ 的倍率往小推，再把 $m$ 的往大推。',
          '三个门的<b>相对</b>快慢才是关键：要先有一个远快于其它的上升（$m$），再有慢得多的关闭（$h$）与外向开启（$n$）。量级上 $m$ 要比 $n$ 快十倍左右。把 $m$ 调到 1× 附近、$h$ 和 $n$ 都在 1× 附近时，RMS 就会掉到个位数。',
          '真值就是全部 1×（钳位数据原本给出的速率），$\\bar g_{\\rm Na}=120$、$\\bar g_{\\rm K}=36$ mS/cm²。RMS 对 $m$、$h$ 的倍率最敏感：$m$ 在 0.7–1.5×、$h$ 在 0.7–1× 之间才有可能压到 6 mV 以下。',
        ],
        answer: `真值：三个门的速率倍率都是 <b>1×</b>（即钳位实验直接给出的 $\\alpha,\\beta$），
          $\\bar g_{\\rm Na}=120$、$\\bar g_{\\rm K}=36$ mS/cm²，此时 RMS ≈ 0.4 mV（只剩记录噪声）。
          <p>为什么只有这种相对快慢能成峰：动作电位要求 $m^3$ 的上升远快于 $h$ 的下降和 $n$ 的上升，
          否则 Na⁺ 电导还没把 $V$ 拉到 $E_{\\rm Na}$ 附近就被失活和 K⁺ 外流抵消（$m$ 慢、$h$ 快 → 不发放）；
          反过来若 $h$、$n$ 太慢，复极就拖长、峰后出现长平台。$m^3h$ 与 $n^4$ 的幂次本身也是 HH 从钳位电导
          的 S 形上升沿拟合出来的。</p>`,
        build(body, api) {
          const S = { lm: -1, lh: 1, ln: 0, gNa: 120, gK: 36 }; // log10 倍率；起始为故意调坏的设置
          const par = () => ({ ...BASE, sm: 10 ** S.lm, sh: 10 ** S.lh, sn: 10 ** S.ln, gNa: S.gNa, gK: S.gK });
          const truth = simAP({ ...BASE });
          const rnd = mul32(12345);
          const tgtV = truth.V.map((v) => v + (rnd() * 2 - 1) * 0.6); // "实测"迹：真值 + 噪声
          let model = null, rms = 0, done = false;

          const plots = h.el('div', { class: 'hhc-plots' });
          const boxV = h.el('div'), boxG = h.el('div');
          plots.append(boxV, boxG);
          const cvV = h.canvas(boxV, { aspect: 0.5, minH: 190, maxH: 260 });
          boxV.append(legend([['实测（目标）', col('--muted')], ['你的模型', col('--accent')]]));
          const cvG = h.canvas(boxG, { aspect: 0.5, minH: 180, maxH: 250 });
          boxG.append(legend([['g_Na', col('--s1')], ['g_K', col('--s2')], ['g_L', col('--s3')], ['实测的 g_Na / g_K', col('--muted'), 1]]));
          const controls = h.el('div', { class: 'lab-controls' }), readout = h.el('div', { class: 'lab-readout' });
          const rmsEl = h.el('div', { class: 'hhc-rms', 'aria-live': 'polite' });

          const fmtX = (v) => `${(10 ** v).toFixed(10 ** v < 1 ? 2 : 10 ** v < 10 ? 2 : 1)} ×`;
          const sm = h.slider({ label: 'm 门速率（对数）', min: -1, max: 1, step: 0.02, value: S.lm, format: fmtX, onInput: (v) => { S.lm = v; upd(); } });
          const sh = h.slider({ label: 'h 门速率（对数）', min: -1, max: 1, step: 0.02, value: S.lh, format: fmtX, onInput: (v) => { S.lh = v; upd(); } });
          const sn = h.slider({ label: 'n 门速率（对数）', min: -1, max: 1, step: 0.02, value: S.ln, format: fmtX, onInput: (v) => { S.ln = v; upd(); } });
          const sgN = h.slider({ label: 'ḡ_Na', min: 40, max: 200, step: 1, value: S.gNa, format: (v) => `${v} mS/cm²`, onInput: (v) => { S.gNa = v; upd(); } });
          const sgK = h.slider({ label: 'ḡ_K', min: 10, max: 80, step: 1, value: S.gK, format: (v) => `${v} mS/cm²`, onInput: (v) => { S.gK = v; upd(); } });
          controls.append(sm.el, sh.el, sn.el, sgN.el, sgK.el);
          const R = { pk: h.readout('模型峰值 / 实测峰值'), g: h.readout('峰时 g_Na / g_K') };
          Object.values(R).forEach((x) => readout.append(x.el));

          function upd() {
            model = simAP(par());
            let s = 0, n = 0;
            for (let i = 0; i < tgtV.length; i++) {
              if (truth.t[i] < ST.t0) continue;              // 0–20 ms 窗口 = 刺激之后
              if (truth.t[i] > ST.t0 + 20) break;
              const d = model.V[i] - tgtV[i]; s += d * d; n++;
            }
            rms = Math.sqrt(s / Math.max(1, n));
            const ok = rms < 6;
            rmsEl.innerHTML = `0–20 ms 窗口 RMS 误差　<b style="color:${ok ? 'var(--good)' : rms < 12 ? 'var(--accent)' : 'var(--warn)'}">${rms.toFixed(2)}</b> mV　<span style="color:var(--muted)">（目标 &lt; 6）</span>`;
            let pk = -Infinity, gi = 0;
            model.V.forEach((v, i) => { if (v > pk) { pk = v; gi = i; } });
            R.pk.set(`${pk > 0 ? '+' : ''}${pk.toFixed(1)} / ${truth.peak.toFixed(1)} mV` + (pk < -20 ? '（没有发放）' : ''));
            R.g.set(`${model.gNa[gi].toFixed(1)} / ${model.gK[gi].toFixed(1)} mS/cm²`);
            draw();
            if (ok && !done) {
              done = true;
              api.done(`<b>赫胥黎的三周。</b>一组由钳位数据定下的 $\\alpha,\\beta$，加上 $m^3h$ 与 $n^4$ 两套门，
                就能从零算出整条动作电位的形状、幅度和时程。1952 年没有电子计算机可用，Huxley 在一台手摇机械
                计算机上逐步积分，算一条<b>传导</b>的动作电位花了约三周；由此预言的传导速度 18.8 m/s，
                与实测的 21.2 m/s 相差不到 15%。`);
            }
          }
          function draw() {
            // V 面板
            let g = cvV.g, W = cvV.w, Hh = cvV.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            let A = h.axes(g, W, Hh, { x0: 0, x1: ST.T, y0: -100, y1: 70, pad: { l: 46, r: 14, t: 12, b: 32 },
              xTicks: [0, 5, 10, 15, 20, 25], yTicks: [-100, -50, 0, 50], xLabel: 't (ms)', yLabel: 'V (mV)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            line(g, A, truth.t, tgtV, col('--muted'), 3.2);
            if (model) line(g, A, model.t, model.V, col('--accent'), 1.8);
            g.restore();
            // 电导面板
            g = cvG.g; W = cvG.w; Hh = cvG.h;
            g.fillStyle = col('--panel'); g.fillRect(0, 0, W, Hh);
            A = h.axes(g, W, Hh, { x0: 0, x1: ST.T, y0: 0, y1: 42, pad: { l: 46, r: 14, t: 12, b: 32 },
              xTicks: [0, 5, 10, 15, 20, 25], yTicks: [0, 10, 20, 30, 40], xLabel: 't (ms)', yLabel: 'g (mS/cm²)' }, col);
            g.save(); g.beginPath(); g.rect(A.p.l, A.p.t, A.iw, A.ih); g.clip();
            line(g, A, truth.t, truth.gNa, col('--muted'), 1.2, [4, 3]);
            line(g, A, truth.t, truth.gK, col('--muted'), 1.2, [4, 3]);
            if (model) {
              line(g, A, model.t, model.gNa, col('--s1'), 2);
              line(g, A, model.t, model.gK, col('--s2'), 2);
              line(g, A, model.t, model.t.map(() => BASE.gL), col('--s3'), 1.6);
            }
            g.restore();
          }
          body.append(plots, rmsEl, controls, readout);
          api.typeset(body);
          upd();
          cvV.onResize(draw); cvG.onResize(draw);
          const off = onTheme(draw);
          return { destroy() { off(); cvV.destroy(); cvG.destroy(); } };
        },
      };

      return H.stages(root, ctx, [stage1, stage2, stage3]);
    },
  };
})();
