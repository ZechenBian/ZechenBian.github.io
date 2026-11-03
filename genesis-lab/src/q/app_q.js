// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 量子版的页面逻辑：创世台的量子旋钮和派生卡片，以及"最初三分钟"慢放展区。只在量子版构建里包含。
(function () {
  'use strict';
  const G = window.GENESIS, $ = G.$, sig = G.sig, gyr = G.gyr, CSS = G.CSS, chart = G.chart, fit = G.fit, toast = G.toast, store = G.store, forge = G.forge;
  const KB = THERMAL.KB, MSUN = 1.989e30, YR = 3.15576e7;
  const DEF = { T0: 2.7255, Neff: 3.044, Ob: 0.0493, As: 2.1e-9, ns: 0.965, r: 0.01, alpha: 1, me: 1, Q: 1.29333, GF: 1, lqc: false, rhoC: 122.4 };
  const QS = Object.assign({}, DEF, store.get('q', {}));
  // 滑杆映射：log 的存 log10
  const LOG = { T0: 1, Ob: 1, As: 1, r: 1, alpha: 1, me: 1, GF: 1 };
  const KEYS = ['T0', 'Neff', 'Ob', 'As', 'ns', 'r', 'alpha', 'me', 'Q', 'GF', 'rhoC'];
  function syncQ() {
    for (const k of KEYS) { const el = $('qs-' + k); if (!el) continue; const v = QS[k]; el.value = LOG[k] ? (v > 0 ? Math.log10(v) : +el.min) : v; }
    $('qs-lqc').checked = !!QS.lqc; labelsQ();
  }
  function labelsQ() {
    $('qv-T0').textContent = QS.T0 > 0 ? sig(QS.T0, 4) + ' K' : '0（没有辐射）';
    $('qv-Neff').textContent = QS.Neff.toFixed(2); { const Om = forge.S.Om; $('qv-Ob').textContent = QS.Ob > Om ? sig(Om, 3) + '（夹到 Ω_m）' : sig(QS.Ob, 3); } $('qv-As').textContent = QS.As.toExponential(2); $('qv-ns').textContent = QS.ns.toFixed(3); $('qv-r').textContent = sig(QS.r, 2);
    $('qv-alpha').textContent = QS.alpha.toFixed(3) + '（1/' + sig(137.036 / QS.alpha, 5) + '）'; $('qv-me').textContent = QS.me.toFixed(3); $('qv-Q').textContent = QS.Q.toFixed(3) + ' MeV'; $('qv-GF').textContent = QS.GF.toFixed(3);
    $('qv-rhoC').textContent = 'ρ_c = 10^' + QS.rhoC.toFixed(1) + ' ρ_crit' + (QS.rhoC > 121 ? '（普朗克密度量级）' : '') + (QS.lqc ? '' : ' · 未启用'); $('qs-rhoC').disabled = !QS.lqc; $('qs-rhoC').style.opacity = QS.lqc ? '' : '0.4';
  }
  for (const k of KEYS) { const el = $('qs-' + k); if (!el) continue; el.addEventListener('input', () => { const v = +el.value; QS[k] = LOG[k] ? Math.pow(10, v) : v; if (k === 'T0' && v <= +el.min + 1e-9) QS.T0 = 0; labelsQ(); forge.solve(); }); }
  $('qs-lqc').addEventListener('change', () => { QS.lqc = $('qs-lqc').checked; labelsQ(); forge.solve(); });
  $('qb-reset').addEventListener('click', () => { Object.assign(QS, DEF); syncQ(); forge.solve(); toast('量子旋钮已复位'); });
  window.addEventListener('beforeunload', () => store.set('q', QS));
  // 经典版的 Ω_r 滑杆在量子版里由 T₀ 取代
  { const or = $('s-Or'); if (or) or.closest('.ctl').hidden = true; }
  forge.hooks.preset.push((p, S) => { QS.T0 = p.p.Or > 0 ? COSMO.temperatureOf(p.p.Or, p.p.H0, QS.Neff) : 0; syncQ(); });
  forge.hooks.dice.push((S) => { QS.T0 = COSMO.temperatureOf(S.Or, S.H0, QS.Neff); syncQ(); });

  // ---------- 缓存的引擎结果 ----------
  const cache = { thermalBBN: new Map(), thermalFull: new Map(), bbn: new Map() };
  function thermalBBN(Neff) { const k = Neff.toFixed(2); if (!cache.thermalBBN.has(k)) cache.thermalBBN.set(k, THERMAL.build({ Neff })); return cache.thermalBBN.get(k); }
  function thermalFull(m) { const k = [m.Neff.toFixed(2), m.T0.toPrecision(4), m.H0, m.Om.toPrecision(4), m.OL.toPrecision(4)].join('|'); if (!cache.thermalFull.has(k)) { if (cache.thermalFull.size > 12) cache.thermalFull.clear(); cache.thermalFull.set(k, THERMAL.build({ Neff: m.Neff, T0: m.T0, H0: m.H0, Om: m.Om, OL: m.OL })); } return cache.thermalFull.get(k); }
  function bbnFor(m, eta) { const k = [m.Neff.toFixed(2), QS.Q.toFixed(3), QS.GF.toFixed(3), eta.toPrecision(3)].join('|'); if (!cache.bbn.has(k)) { if (cache.bbn.size > 40) cache.bbn.clear(); cache.bbn.set(k, BBN.run(thermalBBN(m.Neff), { Q: QS.Q * 1e-3, GF: QS.GF, eta })); } return cache.bbn.get(k); }
  let CUR = null; // 本次求解的量子结果

  // ---------- 输入钩子：把量子旋钮翻译成弗里德曼方程的输入 ----------
  forge.hooks.input.push((input, S) => {
    input.T0 = QS.T0; input.Neff = QS.Neff; delete input.Or;
    if (QS.lqc) input.rhoC = Math.pow(10, QS.rhoC);
    input.sigScale = INFLATION.sigScale(QS.As, QS.ns);
    const m = COSMO.norm(input), Ob = Math.min(QS.Ob, Math.max(1e-6, S.Om));
    S.Or = m.Or; // 让经典滑杆的状态和派生的 Ω_r 一致（保存、骰子都用它）
    CUR = { m, Ob, eta: Infinity, bb: null, rc: null, inf: INFLATION.derive(QS.As, QS.ns, QS.r) };
    CUR.Tbounce = null;
    if (m.T0 > 0) {
      CUR.eta = RECOMB.eta(m, Ob); CUR.bb = bbnFor(m, CUR.eta);
      CUR.rc = RECOMB.run(m, { Ob, Yp: CUR.bb.Yp, alpha: QS.alpha, me: QS.me });
      if (CUR.rc.neverDecoupled) input.aRec = Infinity; else if (isFinite(CUR.rc.zDec)) input.aRec = 1 / (1 + CUR.rc.zDec); else input.aRec = 1e-9; // 1e-9：从一开始就透明
    }
    return input;
  });
  // ---------- 求解后：派生卡片与诊断 ----------
  forge.hooks.solved.push((R, S) => {
    if (R.quantumBounce) { CUR.Tbounce = R.T0 / R.aMin * KB; if (CUR.Tbounce < 10e-3) CUR.bb = null; if (R.T0 / R.aMin < COSMO.T_REC) { R.aRec = R.aMin * 1.0001; R.coldBounce = true; } } // 反弹温度不到 10 MeV：没有核合成；不到复合温度：从没有过等离子体
    forge.labels();
    $('qv-Or').textContent = R.m.Or > 0 ? R.m.Or.toExponential(2) : '0'; $('qv-eta').textContent = isFinite(CUR.eta) ? CUR.eta.toExponential(2) : '—';
    $('qv-tau').textContent = CUR.bb ? sig(CUR.bb.tauN, 3) + ' s' : sig(BBN.TAU0 / (QS.GF * QS.GF), 3) + ' s';
    const cards = [], bb = CUR.bb, rc = CUR.rc, inf = CUR.inf;
    if (bb) {
      cards.push(['gold', '原初氦丰度 Y_p', (bb.Yp * 100).toFixed(1) + ' %' + (bb.etaLow ? '（上限）' : ''), `核合成在大爆炸后 ${sig(bb.tNuc, 3)} s（T = ${sig(bb.Tnuc * 1e3, 3)} MeV）；n/p 在 T ≈ ${sig(bb.Tfreeze * 1e3, 2)} MeV 开始冻结，中子寿命 ${isFinite(bb.tauN) ? sig(bb.tauN, 3) + ' s' : '∞（中子稳定）'}。半解析，阈值按标准模型校准` + (bb.etaLow ? '；η 太小，真实的核反应会跟不上膨胀' : '')]);
      cards.push(['teal', '氘 D/H', bb.DHvalid ? bb.DH.toExponential(2) : '—', bb.DHvalid ? '经验标度律 ∝ η⁻¹·⁶（拟合）；η = ' + CUR.eta.toExponential(2) : 'η = ' + CUR.eta.toExponential(2) + '，超出拟合的可信范围（η₁₀ ≈ 0.5–30）']);
    } else cards.push(['coral', '核合成', '没有', CUR.Tbounce ? `量子反弹时温度只有 ${sig(CUR.Tbounce / KB, 2)} K，从没热到 10 MeV` : '没有辐射就没有热的早期']);
    if (R.coldBounce) cards.push(['violet', '复合', '从没有过等离子体', `反弹时温度 ${sig(R.T0 / R.aMin, 2)} K，低于氢的复合温度：氢（如果有）从一开始就是中性的`]);
    else if (rc && rc.transparentEarly) cards.push(['violet', '光子退耦', isFinite(rc.zDec) ? 'z = ' + sig(rc.zDec, 3) + '，在复合之前' : '一直透明', `重子太稀（η = ${rc.eta.toExponential(1)}）：电子还全在时散射率就已低于膨胀率，光子早早自由${rc.pairPlasma ? '——退耦定在正负电子湮灭时（T ≈ 0.17 MeV），再早的散射来自 e± 对等离子体' : ''}；复合（Saha 50%）在 z ≈ ${isFinite(rc.zHalf) ? sig(rc.zHalf, 3) : '?'}`]);
    else if (rc && isFinite(rc.zDec)) cards.push(['violet', '光子退耦 z_dec', sig(rc.zDec, 4), `Saha 平衡近似（比完整计算早约 4%）；那时电离度 x_e = ${rc.xeDec.toExponential(1)}，温度 ${sig(R.T0 * (1 + rc.zDec), 3)} K，电离能 ${rc.B_eV.toFixed(2)} eV`]);
    else if (rc) cards.push(['coral', '光子退耦', '至今没有', '汤姆孙散射率到今天仍高于膨胀率：宇宙一直不透明']);
    if (rc && isFinite(rc.rs)) cards.push(['teal', '声学视界 r_s', sig(rc.rs, 4) + ' Mpc', '反推台用的那把"标准尺"，这里是算出来的（我们的宇宙 147 Mpc；Saha 近似略小）']);
    cards.push(['gold', '暴胀能标 V^{1/4}', sig(inf.V4, 3) + ' GeV', `由 A_s = ${QS.As.toExponential(2)}、r = ${sig(QS.r, 2)}：H_inf = ${sig(inf.H, 3)} GeV，ε = ${sig(inf.eps, 2)}，慢滚 η = ${sig(inf.eta, 2)}（大统一能标量级 10¹⁶ GeV）`]);
    cards.push(['violet', '暴胀的量子涨落', 'δφ = ' + sig(inf.dphi, 3) + ' GeV', `每个哈勃时间 H/2π；德西特温度 T_GH = ${sig(inf.TGH, 3)} K；${inf.N} 个 e-fold 用时 ${sig(inf.tInf, 2)} s`]);
    if (R.fate === 'eternal' && R.accelerating && R.m.w === -1 && R.m.OL > 0) { const Hinf = R.m.H0 * 1e5 / 3.0857e24 * Math.sqrt(R.m.OL); cards.push(['teal', '终态的德西特温度', sig(INFLATION.deSitterT(Hinf), 3) + ' K', '永远加速的宇宙最终只剩这个温度的热辐射（Gibbons–Hawking）']); }
    if (R.quantumBounce) cards.push(['coral', '量子反弹', 'a_min = ' + R.aMin.toExponential(2), `反弹在 ${gyr(-R.tBounce * COSMO.GYR / R.m.H0)}前；那时密度 ρ_c = 10^${QS.rhoC.toFixed(1)} ρ_crit，温度 ${sig(R.T0 / R.aMin, 3)} K`]);
    const QG = { '原初氦丰度 Y_p': 'Yp', '核合成': 'Yp', '氘 D/H': 'DH', '光子退耦 z_dec': 'zdec', '光子退耦': 'zdec', '复合': 'zdec', '声学视界 r_s': 'rs', '暴胀能标 V^{1/4}': 'Vinf', '暴胀的量子涨落': 'dphi', '终态的德西特温度': 'TdS', '量子反弹': 'lqc' };
    $('q-cards').innerHTML = cards.map(([c, k, v, i]) => `<div class="k ${c}"><small${QG[k] ? ` data-g="${QG[k]}"` : ''}>${k.replace('Y_p', '$Y_p$').replace('z_dec', '$z_{dec}$').replace('r_s', '$r_s$').replace('V^{1/4}', '$V^{1/4}$')}</small><b class="mono" style="font-size:16px">${v}</b><i>${i}</i></div>`).join('');
    if (G.decorate) { G.decorate($('q-cards')); G.tex($('q-cards')); }
    // 诊断加两关
    const items = R.diag;
    if (bb) {
      if (bb.Yp > 0.6) items.push({ level: 'dead', key: 'helium', title: `原初氦 ${(bb.Yp * 100).toFixed(0)}%：几乎没有氢`, detail: '没有氢就没有水、没有有机化学；恒星从氦直接烧起，寿命短得多。' });
      else if (bb.Yp > 0.4) items.push({ level: 'warn', key: 'helium', title: `原初氦 ${(bb.Yp * 100).toFixed(0)}%：偏多`, detail: '氢还够用，但类太阳恒星更亮、寿命更短。' });
      else items.push({ level: 'ok', key: 'helium', title: `原初氦 ${(bb.Yp * 100).toFixed(1)}%`, detail: bb.Yp < 0.05 ? '几乎没有原初氦——恒星照常，氦由恒星自己造。' : '和我们的宇宙一样，四分之一的重子进了氦。' });
    }
    if (QS.Q < 0.511) items.push({ level: 'dead', key: 'hydrogen', title: '氢原子不稳定', detail: `Q = ${QS.Q.toFixed(2)} MeV 小于电子质量 0.511 MeV：中子不再衰变，反而是质子俘获电子变成中子（p + e⁻ → n + ν）。没有稳定的氢，也就没有化学。` });
    if (rc && !R.coldBounce) {
      if (rc.neverDecoupled) items.push({ level: 'dead', key: 'recomb', title: '光子从未退耦', detail: '电子一直自由，光子一直被散射：没有 CMB，重子也被辐射压拖着无法坍缩。' });
      else if (rc.transparentEarly) items.push({ level: 'ok', key: 'recomb', title: '宇宙早早就透明了', detail: '重子太稀，光子在复合之前就已经自由飞行；复合本身照常发生。' });
      else if (R.growth && isFinite(R.growth.aFirst) && 1 / (1 + rc.zDec) > R.growth.aFirst) items.push({ level: 'warn', key: 'recomb', title: '复合晚于第一批星系的坍缩时刻', detail: '重子在那之前还和光子绑在一起，星系形成要等到复合之后才真正开始。' });
      else items.push({ level: 'ok', key: 'recomb', title: `复合在 z ≈ ${sig(rc.zDec, 3)}`, detail: `之后光子自由飞行，重子可以落进暗物质的势阱。` });
    }
    const dead = items.some((i) => i.level === 'dead'), warn = items.some((i) => i.level === 'warn'); R.verdict = dead ? 'dead' : (warn ? 'marginal' : 'alive');
    early.invalidate();
  });

  // ======================================================================
  // 最初三分钟 · 慢放
  // ======================================================================
  const early = (function () {
    const ET = { logt: 0, playing: false, raf: 0, last: 0, data: null, dirty: true, dots: new Map(), nuc: null, lastT: null };
    const TPL = 5.39e-44;
    function unitT(TGeV) { const T = TGeV; if (T >= 1) return sig(T, 3) + ' GeV'; if (T >= 1e-3) return sig(T * 1e3, 3) + ' MeV'; if (T >= 1e-6) return sig(T * 1e6, 3) + ' keV'; return sig(T * 1e9, 3) + ' eV'; }
    function unitTime(t) { if (t < 1e-3) return t.toExponential(1) + ' s'; if (t < 60) return sig(t, 3) + ' s'; if (t < 3600) return sig(t / 60, 3) + ' 分钟'; if (t < 86400 * 365 * 2) return sig(t / 3600, 3) + ' 小时'; if (t < YR * 1e6) return sig(t / YR, 3) + ' 年'; return sig(t / YR / 1e6, 3) + ' 百万年'; }
    function unitLen(cm) { if (cm < 1e-10) return sig(cm * 1e13, 3) + ' 费米'; if (cm < 1) return sig(cm * 1e4, 3) + ' μm'; if (cm < 1e5) return sig(cm / 100, 3) + ' m'; if (cm < 3.0857e18) return sig(cm / 1e5, 3) + ' km'; if (cm < 3.0857e24) return sig(cm / 3.0857e18, 3) + ' pc'; return sig(cm / 3.0857e24, 3) + ' Mpc'; }
    function unitMass(kg) { if (kg < 1e-3) return sig(kg * 1e3, 3) + ' g'; if (kg < 1e24) return sig(kg, 3) + ' kg'; if (kg < 1e3 * MSUN) return sig(kg / 5.972e24, 3) + ' 个地球'; return sig(kg / MSUN, 3) + ' M☉'; }
    // 本次参数下的早期数据
    function prepare() {
      if (!ET.dirty && ET.data) return ET.data;
      const R = forge.R, m = R.m, inf = CUR.inf, D = { m, inf, R, noRad: !(m.T0 > 0) };
      D.Tbounce = CUR.Tbounce; D.coldBounce = !!(D.Tbounce && D.Tbounce < 1e-8);
      if (D.coldBounce) { ET.data = D; ET.dirty = false; $('e-timeline').innerHTML = ''; $('es-t').min = -43; return D; }
      if (!D.noRad) {
        D.tab = thermalFull(m); D.bb = CUR.bb; D.rc = CUR.rc;
        D.tI = 1 / inf.Hs; D.tE = D.tI * (inf.N + 1); D.Treh = Math.min(inf.Treh, 1e15); D.tRehTab = D.tab.atT(D.Treh).t;
        if (D.Tbounce) { D.tE = 0; D.tRehTab = 0; D.Treh = D.Tbounce; } // 量子反弹：没有暴胀，时间从反弹算
        D.tOfT = (T) => D.tE + (D.tab.atT(T).t - D.tRehTab);           // 热时期：时间 = 暴胀结束 + 辐射时钟
        D.TofT = (t) => D.tab.TofT(t - D.tE + D.tRehTab);
        const ev = [];
        if (!D.Tbounce) { ev.push({ t: D.tI, l: '暴胀开始' }); ev.push({ t: D.tE, l: '暴胀结束 · 再加热' }); } else ev.push({ t: D.tab.atT(D.Tbounce * 0.999).t, l: '量子反弹' });
        const tT = (T, l) => { if (T < D.Treh && T > m.T0 * KB) ev.push({ t: D.tOfT(T), l }); };
        tT(160, '电弱相变'); tT(THERMAL.T_QCD, '夸克禁闭'); tT(THERMAL.T_NUDEC, '中微子退耦'); if (D.bb && D.bb.Tfreeze) tT(D.bb.Tfreeze, 'n/p 冻结'); tT(0.17e-3, 'e⁺e⁻ 湮灭'); if (D.bb) tT(D.bb.Tnuc, '核合成');
        if (isFinite(R.aEq) && R.aEq < 1) tT(m.T0 * KB / R.aEq, '物质 = 辐射'); if (D.rc && isFinite(D.rc.zDec)) tT(m.T0 * KB * (1 + D.rc.zDec), '复合 · CMB');
        D.events = ev.sort((a, b) => a.t - b.t);
        D.tEnd = Math.min(Math.pow(10, 13.2), D.rc && isFinite(D.rc.zDec) ? D.tOfT(m.T0 * KB * (1 + D.rc.zDec)) * 3 : Math.pow(10, 13.2));
        D.lo = D.Tbounce ? Math.log10(D.tab.atT(D.Tbounce * 0.999).t) - 0.3 : -43; D.startLog = D.Tbounce ? D.lo + 0.3 : Math.log10(D.tI) + 0.2;
        $('es-t').min = D.lo;
      }
      ET.data = D; ET.dirty = false; drawTimeline(D); drawCharts(D); return D;
    }
    // 某时刻的状态
    function stateAt(D, t) {
      if (D.noRad) return { mode: 'norad' };
      if (D.coldBounce) return { mode: 'coldbounce' };
      if (D.Tbounce) { const T = D.TofT(t); if (T > D.Tbounce) return { mode: 'prebounce' }; }
      else { if (t < TPL) return { mode: 'planck' }; if (t < D.tI) return { mode: 'pre' }; }
      if (t < D.tE) { const N = D.inf.Hs * (t - D.tI); return { mode: 'inflation', N, aRel: Math.exp(N - D.inf.N), T: D.inf.TGH * KB, TK: D.inf.TGH, H: D.inf.Hs, t }; }
      const T = D.TofT(t), st = D.tab.atT(T), s = { mode: 'thermal', T, TK: st.TK, a: st.a, H: st.H, t, gR: st.gR, gS: st.gS, TnuRatio: st.Tnu / T, rho: st.rho };
      const hb = THERMAL.hubble(st); s.Rh = hb.Rh_cm; s.Mh = hb.M_kg;
      s.species = D.tab.species(T);
      // n/p
      const bb = D.bb; if (bb) { if (T >= bb.Ts[0]) s.Xn = 1 / (1 + Math.exp(Math.min(700, (QS.Q * 1e-3) / T))); else if (T <= bb.Tnuc) s.Xn = bb.Xnuc; else { let i = 0; while (i < bb.Ts.length - 1 && bb.Ts[i + 1] > T) i++; const u = (Math.log(bb.Ts[i]) - Math.log(T)) / (Math.log(bb.Ts[i]) - Math.log(bb.Ts[i + 1])); s.Xn = bb.Xn[i] + (bb.Xn[i + 1] - bb.Xn[i]) * u; } s.He = T <= bb.Tnuc ? bb.Yp : 0; s.bbnDone = T <= bb.Tnuc; }
      // x_e
      const rc = D.rc; s.z = 1 / st.a - 1; s.xe = 1;
      if (rc && rc.zs.length) { if (s.z < rc.zs[0]) { let i = 0; while (i < rc.zs.length - 1 && rc.zs[i + 1] > s.z) i++; s.xe = rc.xe[Math.min(i, rc.xe.length - 1)]; } s.decoupled = isFinite(rc.zDec) && s.z < rc.zDec; }
      return s;
    }
    function epochText(D, s) {
      if (s.mode === 'norad') return ['这个宇宙没有辐射', '创世台上 T₀ = 0：没有热的早期，这个展区没什么可放的。把 T₀ 拨上去。'];
      if (s.mode === 'coldbounce') return ['反弹太冷，没有热的早期', `圈量子宇宙学的反弹密度被拉得太低：反弹时温度只有 ${sig(D.Tbounce / KB, 2)} K，连氢的复合温度都不到，更没有核合成和粒子汤。把创世台上的 ρ_c 拉高（真实理论值在最右端），这里才有东西可放。`];
      if (s.mode === 'prebounce') return ['反弹之前', `这是圈量子宇宙学的宇宙：没有奇点，也没有暴胀。在这之前是一个收缩中的前宇宙，密度在反弹时达到 ρ_c，温度 ${sig(D.Tbounce / KB, 2)} K。`];
      if (s.mode === 'planck') return ['普朗克时间之前', '量子引力的领地：这里没有可信的方程。经典时空、甚至"时间"本身都未必有意义。'];
      if (s.mode === 'pre') return ['暴胀之前', '不知道。标准模型只从暴胀开始讲起；更早的事（量子引力、暴胀子怎么来的）是开放问题。'];
      if (s.mode === 'inflation') return ['暴胀：空间指数膨胀', `暴胀子的势能像宇宙学常数一样驱动 a ∝ e^{Ht}，H = ${sig(D.inf.H, 2)} GeV。已经膨胀了 ${s.N.toFixed(1)} 个 e-fold（共 ${D.inf.N}）。德西特温度 ${sig(D.inf.TGH, 2)} K 下，场每个哈勃时间长出 δφ = H/2π 的量子涨落，被拉出视界后冻结——这些就是将来星系的种子，功率 A_s = ${QS.As.toExponential(2)}。`];
      const T = s.T, bb = D.bb, rc = D.rc;
      if (T > 1e14) return [D.Tbounce ? '反弹后的粒子汤' : '再加热后的粒子汤', `${D.Tbounce ? '反弹把收缩的能量全部交给辐射' : '暴胀子衰变成辐射'}，温度 ${unitT(T)}。所有标准模型粒子都是相对论性的，g* = ${s.gR.toFixed(1)}。希格斯场还没凝结，一切粒子无质量。`];
      if (T > 1e4) return ['辐射时期：等待电弱相变', `温度 ${unitT(T)}，a ∝ t^{1/2}，哈勃半径 ${unitLen(s.Rh)}，里面只有 ${unitMass(s.Mh)}。粒子汤的成分在这 ${Math.round(Math.log10(T / 160))} 个数量级里几乎不变（g* = ${s.gR.toFixed(1)}）。重子不对称（每十亿对正反粒子多出一个重子）在这段的某处产生，机制未知——标准模型的 CP 破坏不够。`];
      if (T > 160) return ['电弱相变前夜', `温度 ${unitT(T)}，离希格斯场凝结（T ≈ 160 GeV）不远。顶夸克、W、Z 还都是无质量的相对论性粒子，g* = ${s.gR.toFixed(1)}。`];
      if (T > THERMAL.T_QCD) return ['电弱相变之后', `希格斯场凝结（T ≈ 160 GeV），W、Z、顶夸克获得质量并陆续湮灭。夸克和胶子仍是自由的等离子体，g* = ${s.gR.toFixed(1)}。`];
      if (T > 5e-3) return ['强子时期', `夸克在 T ≈ 150 MeV 被禁闭进质子、中子和介子；介子、μ 子随温度下降湮灭。g* = ${s.gR.toFixed(1)}。n/p 还在弱作用平衡：${sig(s.Xn / (1 - s.Xn), 2)}。`];
      if (T > 0.17e-3) return ['中微子退耦、中子冻结', `弱作用率 ∝ G_F²T⁵ 追不上膨胀。中微子在 T ≈ ${sig(THERMAL.T_NUDEC * 1e3, 2)} MeV 退耦，n/p 在 T ≈ ${bb ? sig(bb.Tfreeze * 1e3, 2) : '?'} MeV 离开平衡、冻在 ${sig(s.Xn / (1 - s.Xn), 2)}，之后只能靠衰变（τ_n = ${bb ? sig(bb.tauN, 3) : '?'} s）慢慢减少。`];
      if (bb && !s.bbnDone) return ['氘瓶颈', `e⁺e⁻ 湮灭把光子加热到比中微子高 (11/4)^{1/3}。氘的结合能 ${sig(BBN.BD * 1e3, 3)} MeV，但每个重子配 ${sig(1 / CUR.eta, 2)} 个光子，高能尾巴不断把氘打碎；中子在等待中衰变：X_n = ${sig(s.Xn, 2)}。`];
      if (bb && s.bbnDone && s.z > (rc && isFinite(rc.zDec) ? rc.zDec * 1.5 : 0) && T > 1e-9) return ['核合成完成', `T ≈ ${sig(bb.Tnuc * 1e3, 2)} MeV 时氘存活，几分钟内几乎所有中子进了 ⁴He：Y_p = ${(bb.Yp * 100).toFixed(1)}%，D/H ≈ ${bb.DH.toExponential(1)}。此后几十万年是光子和等离子体的世界。`];
      if (rc && !s.decoupled) return ['等离子体时期', `温度 ${sig(s.TK, 3)} K。光子被自由电子不断散射，重子被辐射压拖住。电离度 x_e = ${sig(s.xe, 2)}；电离能 ${rc.B_eV.toFixed(1)} eV，但复合要等到 T ≈ ${sig(rc.B_eV / 50, 2)} eV 量级——光子太多了。`];
      return ['复合之后：光子自由飞行', `电子被束缚进氢原子，汤姆孙散射率掉到膨胀率以下：这一刻的光就是今天的 CMB。重子开始落进暗物质的势阱，黑暗时代开始。`];
    }
    // ---------- 渲染 ----------
    function cards(D, s) {
      const K = [];
      if (s.mode === 'thermal') {
        K.push(['gold', '温度', unitT(s.T), sig(s.TK, 3) + ' K']); K.push(['teal', '尺度因子 a', s.a.toExponential(2), `宇宙是今天的 ${s.a.toExponential(1)} 倍大`]); K.push(['violet', '膨胀率 H', sig(s.H, 3) + ' s⁻¹', '哈勃时间 ' + unitTime(1 / s.H)]);
        K.push(['gold', '哈勃半径 c/H', unitLen(s.Rh), '其中的质量 ' + unitMass(s.Mh)]); if (s.T > 1e-6) K.push(['teal', '有效自由度 g*', s.gR.toFixed(2), `T_ν/T_γ = ${s.TnuRatio.toFixed(3)}`]); else K.push(['teal', 'T_ν/T_γ', s.TnuRatio.toFixed(3), '中微子比光子冷：e⁺e⁻ 只加热了光子']);
        if (s.Xn !== undefined) K.push(['coral', '中子 / 质子', sig(s.Xn / (1 - s.Xn), 3), s.bbnDone ? `已进 ⁴He：Y_p = ${(s.He * 100).toFixed(1)}%` : `X_n = ${sig(s.Xn, 3)}`]);
        if (s.xe !== undefined && s.T < 1e-6) K.push([s.decoupled ? 'teal' : 'coral', '电离度 x_e', sig(s.xe, 3), s.decoupled ? '光子已退耦' : '光子仍被散射']);
      } else if (s.mode === 'inflation') { K.push(['gold', 'e-fold 数', s.N.toFixed(2) + ' / ' + D.inf.N, '相对暴胀结束 a = ' + s.aRel.toExponential(2)]); K.push(['violet', 'H_inf', sig(D.inf.H, 3) + ' GeV', '哈勃时间 ' + sig(1 / D.inf.Hs, 2) + ' s']); K.push(['teal', '德西特温度', sig(D.inf.TGH, 3) + ' K', 'δφ = ' + sig(D.inf.dphi, 3) + ' GeV']); }
      const EG = { '尺度因子 a': 'scale', '膨胀率 H': 'H0', '哈勃半径 c/H': 'hubble', '有效自由度 g*': 'gstar', 'T_ν/T_γ': 'annihilation', '中子 / 质子': 'Xn', '电离度 x_e': 'xe', 'e-fold 数': 'inflation', 'H_inf': 'Vinf', '德西特温度': 'dphi' };
      const html = K.map(([c, k, v, i]) => `<div class="k ${c}"><small${EG[k] ? ` data-g="${EG[k]}"` : ''}>${k}</small><b class="mono" style="font-size:17px">${v}</b><i>${i}</i></div>`).join('');
      if (html !== ET.lastCards) { $('e-cards').innerHTML = html; ET.lastCards = html; if (G.decorate) G.decorate($('e-cards')); } // 只在内容变了才重画，不然 ? 按钮点不到
      const chips = s.species ? s.species.filter((p) => p.frac > 0.004).map((p) => `<span class="pill" style="border-color:${p.color};color:${p.color}">${p.name} ${(p.frac * 100).toFixed(1)}%</span>`).join('') : '';
      if (chips !== ET.lastChips) { $('e-chips').innerHTML = chips; ET.lastChips = chips; }
    }
    function drawTimeline(D) {
      const tl = $('e-timeline'); if (D.noRad) { tl.innerHTML = ''; return; }
      const lo = D.lo, hi = 13.2, narrow = tl.clientWidth < 600, rows = narrow ? 4 : 3; const ev = D.events.filter((e) => e.t > 0);
      tl.style.height = (rows * 17 + 6) + 'px';
      tl.innerHTML = ev.map((e, k) => { const x = (Math.log10(e.t) - lo) / (hi - lo) * 100; return `<div class="mk" style="left:${x.toFixed(2)}%;top:${(k % rows) * 17}px;font-size:${narrow ? 9 : 10}px">${e.l}</div>`; }).join('');
    }
    function drawCharts(D) {
      if (D.noRad || D.coldBounce) return;
      const tab = D.tab, xs = [], ys = []; for (let i = 0; i <= tab.N; i += 2) { const T = Math.exp(tab.lnT[i]); if (T < 1e-5 || T > 1e5) continue; xs.push(T); ys.push(tab.gR[i]); }
      D.gChart = { xs, ys };
      const bb = D.bb; if (bb) D.xnChart = { ts: bb.Ts.map((T) => D.tOfT(T)), Xn: bb.Xn, Xeq: bb.Xeq, tNuc: D.tOfT(bb.Tnuc) };
      const rc = D.rc; if (rc && rc.zs.length) D.xeChart = { zs: rc.zs, xe: rc.xe };
    }
    function charts(D, s) {
      if (D.noRad || D.coldBounce) { for (const id of ['c-gstar', 'c-xn', 'c-xe']) { const { ctx, w, h } = fit($(id)); ctx.clearRect(0, 0, w, h); } $('ev-bbn').textContent = ''; $('ev-rec').textContent = ''; return; }
      const mk = (x, y) => (isFinite(x) && isFinite(y)) ? [{ x, y, color: CSS('--gold') }] : [];
      chart($('c-gstar'), { xmin: 1e-5, xmax: 1e5, xlog: true, ymin: 1, ymax: 120, xlabel: 'T（GeV）', ylabel: 'g*', padL: 40, series: [{ xs: D.gChart.xs, ys: D.gChart.ys, color: CSS('--teal') }], marks: s.mode === 'thermal' && s.T > 1e-5 && s.T < 1e5 ? mk(s.T, s.gR) : [] });
      if (D.xnChart) { const X = D.xnChart; chart($('c-xn'), { xmin: 0.01, xmax: 2000, xlog: true, ymin: 0, ymax: 0.5, xlabel: 't（s）', ylabel: 'X_n', padL: 40, series: [{ xs: X.ts, ys: X.Xeq, color: CSS('--faint'), dash: [4, 4] }, { xs: X.ts, ys: X.Xn, color: CSS('--coral') }], vlines: [{ x: X.tNuc, color: CSS('--gold'), label: '氘瓶颈打开' }], marks: s.mode === 'thermal' && s.Xn !== undefined ? mk(s.t, s.Xn) : [] }); $('ev-bbn').textContent = `虚线是弱作用平衡 e^{−Q/T}/(1+e^{−Q/T})；实线离开它就是冻结。Y_p = 2X_n(氘瓶颈) = ${(D.bb.Yp * 100).toFixed(1)}%。`; }
      if (D.xeChart) { const X = D.xeChart, zmax = Math.max(...X.zs); chart($('c-xe'), { xmin: Math.max(50, Math.min(...X.zs)), xmax: zmax, xlog: true, ymin: 1e-4, ymax: 1.2, ylog: true, xlabel: '红移 z', ylabel: 'x_e', padL: 44, series: [{ xs: X.zs, ys: X.xe, color: CSS('--violet') }], vlines: isFinite(D.rc.zDec) ? [{ x: D.rc.zDec, color: CSS('--gold'), label: '光子退耦' }] : [], marks: s.mode === 'thermal' && s.z < zmax ? mk(s.z, Math.max(1e-4, s.xe)) : [] }); $('ev-rec').textContent = isFinite(D.rc.zDec) ? `退耦在 z = ${sig(D.rc.zDec, 4)}（Saha 近似）；电离能 ${D.rc.B_eV.toFixed(2)} eV，η = ${D.rc.eta.toExponential(2)}。` : '汤姆孙散射率至今高于膨胀率：没有退耦。'; }
    }
    // 粒子汤画布
    function soup(D, s, now) {
      const cv = $('c-soup'), { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
      const rnd = Math.random;
      if (s.mode !== 'thermal') {
        if (s.mode === 'inflation') { // 视界圆 + 被拉长的量子涨落
          const cx = w / 2, cy = h / 2, Rh = Math.min(w, h) * 0.3; ctx.strokeStyle = CSS('--gold'); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, Rh, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = CSS('--gold'); ctx.font = '11px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('哈勃视界 1/H（不变）', cx, cy + Rh + 16);
          const phase = (now / 1000) % 1; for (let k = 0; k < 4; k++) { const lam = Rh * 0.35 * Math.exp(((s.N + k * 1.3 + phase) % 5.2)); const amp = 9, y0 = cy - 66 + k * 44; const frozen = lam > 2 * Rh; ctx.strokeStyle = frozen ? CSS('--coral') : CSS('--teal'); ctx.lineWidth = 1.5; ctx.beginPath(); for (let x = 0; x <= w; x += 3) { const y = y0 + amp * Math.sin(2 * Math.PI * (x - cx) / lam + k); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.fillStyle = frozen ? CSS('--coral') : CSS('--teal'); ctx.textAlign = 'right'; ctx.fillText(frozen ? '波长 > 视界：冻结成经典扰动' : '波长 < 视界：还是量子涨落', w - 10, y0 - 12); }
          ctx.fillStyle = CSS('--dim'); ctx.textAlign = 'left'; ctx.fillText('量子涨落 δφ = H/2π 的模式，每个哈勃时间被拉长 e 倍', 10, h - 10);
        } else { ctx.fillStyle = CSS('--faint'); ctx.font = '14px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText(s.mode === 'planck' ? '普朗克时期：没有可信的图像' : (s.mode === 'pre' ? '暴胀之前：未知' : (s.mode === 'prebounce' ? '反弹之前：收缩中的前宇宙' : (s.mode === 'coldbounce' ? '反弹太冷：没有粒子汤' : '没有辐射'))), w / 2, h / 2); }
        return;
      }
      // 相对论性粒子：每种 ∝ 份额
      const total = 230, wantMap = new Map(); for (const p of s.species) if (p.frac > 0.004) wantMap.set(p.name, { n: Math.round(p.frac * total), color: p.color });
      for (const [name, info] of wantMap) { if (!ET.dots.has(name)) ET.dots.set(name, []); const arr = ET.dots.get(name); while (arr.length < info.n) arr.push({ x: rnd() * w, y: rnd() * h, vx: (rnd() - .5) * 2, vy: (rnd() - .5) * 2, c: info.color, life: 1 }); while (arr.length > info.n) arr.pop(); }
      for (const [name, arr] of ET.dots) if (!wantMap.has(name)) { arr.length = Math.max(0, arr.length - 6); if (!arr.length) ET.dots.delete(name); }
      for (const [name, arr] of ET.dots) for (const d of arr) { if (s.decoupled && name.startsWith('γ')) { d.x += d.vx * 2.2; d.y += d.vy * 2.2; } else { d.x += d.vx + (rnd() - .5) * 2.5; d.y += d.vy + (rnd() - .5) * 2.5; } if (d.x < 0) d.x += w; if (d.x > w) d.x -= w; if (d.y < 0) d.y += h; if (d.y > h) d.y -= h; ctx.fillStyle = d.c; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      // 核子（T < 1 GeV 出现）：40 个，中子份额 X_n；核合成后四个一组成 ⁴He；复合后电子绕质子
      if (s.T < THERMAL.T_QCD && s.Xn !== undefined) {
        if (!ET.nuc) { ET.nuc = []; for (let i = 0; i < 40; i++) ET.nuc.push({ x: rnd() * w, y: rnd() * h, vx: (rnd() - .5) * .6, vy: (rnd() - .5) * .6 }); }
        const nN = Math.round(40 * s.Xn), heGroups = s.bbnDone ? Math.floor(40 * s.He / 4) : 0;
        for (let i = 0; i < ET.nuc.length; i++) { const d = ET.nuc[i]; d.x += d.vx + (rnd() - .5) * .6; d.y += d.vy + (rnd() - .5) * .6; if (d.x < 0) d.x += w; if (d.x > w) d.x -= w; if (d.y < 0) d.y += h; if (d.y > h) d.y -= h; }
        let drawn = 0;
        for (let gI = 0; gI < heGroups; gI++) { const d = ET.nuc[gI]; for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; ctx.fillStyle = k < 2 ? '#e9edf9' : '#98a4c7'; ctx.beginPath(); ctx.arc(d.x + 4 * Math.cos(a), d.y + 4 * Math.sin(a), 3.2, 0, Math.PI * 2); ctx.fill(); } ctx.strokeStyle = CSS('--gold'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, Math.PI * 2); ctx.stroke(); drawn += 4; }
        for (let i = heGroups; i < ET.nuc.length; i++) { if (drawn >= 40) break; const d = ET.nuc[i], isN = !s.bbnDone && (i < heGroups + nN); ctx.fillStyle = isN ? '#98a4c7' : '#e9edf9'; ctx.beginPath(); ctx.arc(d.x, d.y, 3.2, 0, Math.PI * 2); ctx.fill(); drawn++;
          if (s.decoupled && !isN) { const a = now / 300 + i; ctx.fillStyle = CSS('--teal'); ctx.beginPath(); ctx.arc(d.x + 8 * Math.cos(a), d.y + 8 * Math.sin(a), 1.6, 0, Math.PI * 2); ctx.fill(); } }
        label(ctx, s.bbnDone ? (s.decoupled ? '白：质子（氢原子核）；青：束缚电子；金圈：⁴He' : '白：质子；金圈：⁴He（2p2n）') : '白：质子；灰：中子', 10, h - 10, 'left');
      }
      label(ctx, s.decoupled ? '光子直线飞行：退耦了' : '彩点：相对论性粒子，按能量份额', w - 10, h - 10, 'right');
    }
    function label(ctx, text, x, y, align) { ctx.font = '11px Space Grotesk'; const tw = ctx.measureText(text).width; ctx.fillStyle = 'rgba(6,9,19,0.75)'; ctx.fillRect(align === 'right' ? x - tw - 6 : x - 4, y - 12, tw + 10, 16); ctx.fillStyle = CSS('--dim'); ctx.textAlign = align; ctx.fillText(text, x, y); }
    function render(now) {
      const D = prepare(); const t = Math.pow(10, ET.logt); const s = stateAt(D, t);
      $('ev-t').textContent = 't = ' + (ET.logt < -3 ? t.toExponential(2) + ' s' : unitTime(t)); $('es-t').value = ET.logt;
      const [title, body] = epochText(D, s); $('ev-epoch').textContent = title; $('ev-story').textContent = body; if (D.coldBounce || D.noRad) { $('e-cards').innerHTML = ''; $('e-chips').innerHTML = ''; }
      if (!(D.coldBounce || D.noRad)) cards(D, s); soup(D, s, now || 0); if (!ET.lastT || Math.abs(ET.logt - ET.lastT) > 0.05 || !ET.chartsDrawn) { charts(D, s); ET.lastT = ET.logt; ET.chartsDrawn = true; }
    }
    function tick(now) {
      if (!ET.playing) return; const dt = ET.last ? (now - ET.last) / 1000 : 0; ET.last = now;
      ET.logt += dt / (+$('es-speed').value); if (ET.logt >= 13.2) { ET.logt = 13.2; ET.playing = false; $('eb-play').textContent = '▶ 慢放'; }
      render(now); if (ET.playing) ET.raf = requestAnimationFrame(tick);
    }
    $('eb-play').addEventListener('click', () => { ET.playing = !ET.playing; $('eb-play').textContent = ET.playing ? '⏸ 暂停' : '▶ 慢放'; if (ET.playing) { const D = prepare(); if (ET.logt >= 13.2 || ET.logt < (D.startLog || -43)) ET.logt = D.startLog || -43; ET.last = 0; ET.raf = requestAnimationFrame(tick); } });
    $('eb-next').addEventListener('click', () => { const D = prepare(); if (D.noRad || D.coldBounce) return; const cur = ET.logt + 1e-6; const nx = D.events.map((e) => Math.log10(e.t)).find((l) => l > cur); ET.logt = nx === undefined ? D.startLog : nx; ET.playing = false; $('eb-play').textContent = '▶ 慢放'; render(performance.now()); });
    $('es-t').addEventListener('input', () => { ET.logt = +$('es-t').value; ET.playing = false; $('eb-play').textContent = '▶ 慢放'; render(performance.now()); });
    let idleRaf = 0; function idle(now) { if (!ET.playing && G.current === 'early') render(now); idleRaf = requestAnimationFrame(idle); }
    function enter() { const D = prepare(); if (!ET.logt || ET.logt < (D.lo || -43) || ET.logt >= 13.2) ET.logt = D.startLog || -37; render(performance.now()); if (!idleRaf) idleRaf = requestAnimationFrame(idle); }
    function leave() { ET.playing = false; $('eb-play').textContent = '▶ 慢放'; }
    window.addEventListener('resize', () => { if (G.current === 'early') { ET.chartsDrawn = false; render(performance.now()); } });
    return { enter, leave, invalidate: () => { ET.dirty = true; ET.chartsDrawn = false; ET.dots.clear(); ET.nuc = null; } };
  })();
  window.GENESIS_Q_HALL = (hall) => { G.current = hall; if (hall === 'early') { if (!forge.R) forge.solve(); early.enter(); } else early.leave(); };

  window.GENESIS_QSTATE = () => ({ T0_K: QS.T0, Neff: QS.Neff, Ob: QS.Ob, As: QS.As, ns: QS.ns, r: QS.r, alpha_rel: QS.alpha, me_rel: QS.me, Q_MeV: QS.Q, GF_rel: QS.GF, LQC: QS.lqc ? 'ρ_c = 10^' + QS.rhoC + ' ρ_crit' : 'off' });
  syncQ();
  G.start();
})();
