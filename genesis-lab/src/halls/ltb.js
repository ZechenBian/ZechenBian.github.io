// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// LTB 空洞展区的页面逻辑：引擎在 ltb.js；这里管旋钮、剖面图、哈勃图与 FLRW 拟合、戳穿它的几张卡。
(function () {
  const G = window.GENESIS, $ = G.$, chart = G.chart, fit = G.fit, sig = G.sig, CSS = G.CSS, gyr = G.gyr;
  const P = { Oin: 0.13, Oout: 1, r0: 2500, dr: 600, Hout: 50 };
  const st = { m: null, ry: null, fitR: null, lcdm: null, timer: null, d: 10, seed: 3 };
  const PRESETS = [
    { id: 'gbh', name: 'GBH 2008', sub: 'Ω_in = 0.13，r₀ = 2.5 Gpc：骗过超新星', p: { Oin: 0.13, Oout: 1, r0: 2500, dr: 600, Hout: 50 } },
    { id: 'shallow', name: '浅空洞', sub: 'Ω_in = 0.5：只骗一半', p: { Oin: 0.5, Oout: 1, r0: 2500, dr: 600, Hout: 55 } },
    { id: 'local', name: '小空洞', sub: 'r₀ = 300 Mpc：哈勃张力的候选', p: { Oin: 0.8, Oout: 1, r0: 300, dr: 100, Hout: 67 } },
    { id: 'none', name: '没有空洞', sub: 'Ω_in = Ω_out = 1：就是 EdS', p: { Oin: 1, Oout: 1, r0: 2500, dr: 600, Hout: 67.4 } },
    { id: 'open', name: '均匀开放', sub: 'Ω = 0.3 处处一样：减速但不加速', p: { Oin: 0.3, Oout: 0.3, r0: 2500, dr: 600, Hout: 67.4 } },
  ];
  function labels() { $('ltb-v-Oin').textContent = P.Oin.toFixed(2); $('ltb-v-Oout').textContent = P.Oout.toFixed(2); $('ltb-v-r0').textContent = P.r0 + ' Mpc'; $('ltb-v-dr').textContent = P.dr + ' Mpc'; $('ltb-v-Hout').textContent = P.Hout.toFixed(1) + ' km/s/Mpc'; $('ltb-v-d').textContent = sig(st.d, 3) + ' Mpc';
    for (const b of document.querySelectorAll('#ltb-presets .chip')) { const pr = PRESETS.find((x) => x.id === b.dataset.id); b.classList.toggle('on', !!pr && Object.keys(pr.p).every((k) => Math.abs(pr.p[k] - P[k]) < 1e-9)); } }
  function sync() { $('ltb-Oin').value = P.Oin; $('ltb-Oout').value = P.Oout; $('ltb-r0').value = P.r0; $('ltb-dr').value = P.dr; $('ltb-Hout').value = P.Hout; $('ltb-d').value = Math.log10(st.d); labels(); }
  function lcdm() { // 对照：Planck ΛCDM 的 μ(z)
    if (st.lcdm) return st.lcdm; const m = COSMO.norm(COSMO.FIDUCIAL), T = COSMO.chiTable(m, 3.5, 3500); const zs = [], mu = []; for (let i = 1; i <= 120; i++) { const z = 0.01 * Math.pow(300, i / 120); zs.push(z); mu.push(COSMO.distances(m, T, z).mu); } return (st.lcdm = { zs, mu, H0: m.H0 });
  }
  function solveNow() {
    st.m = LTB.model(P); st.ry = LTB.ray(st.m, { dr: 2, zMax: 3.2 }); st.fitR = LTB.fitFLRW(st.ry); render();
  }
  function solveSoon() { clearTimeout(st.timer); st.timer = setTimeout(solveNow, 200); }
  function render() { if (!st.m) return; drawMap(); drawProf(); drawHub(); fitCards(); tests(); cards(); }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function drawMap() {
    const cv = $('c-ltb-map'), { ctx, w, h } = fit(cv), m = st.m; ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    const Rmax = Math.max(1.6 * P.r0 + 2 * P.dr, 1200), sc = Math.min(w, h) * 0.46 / Rmax, cx = w / 2, cy = h / 2;
    // 密度底色：按 ρ(r) 画同心环
    for (let k = 60; k >= 1; k--) { const r = Rmax * k / 60, rho = Math.min(1.3, m.rhoRel(r)); const v = 18 + 60 * rho; ctx.fillStyle = `rgb(${Math.round(v * 0.55)},${Math.round(v * 0.6)},${Math.round(v * 1.1)})`; ctx.beginPath(); ctx.arc(cx, cy, r * sc, 0, Math.PI * 2); ctx.fill(); }
    // 星系：按 ρ(r) 撒点（拒绝采样）
    const rnd = mulberry32(st.seed); const rhoMax = 1.3; let placed = 0, tries = 0;
    while (placed < 1400 && tries++ < 40000) { const x = (rnd() * 2 - 1) * Rmax, y = (rnd() * 2 - 1) * Rmax, r = Math.hypot(x, y); if (r > Rmax) continue; if (rnd() * rhoMax > m.rhoRel(r)) continue; ctx.fillStyle = `rgba(233,237,249,${0.45 + 0.4 * rnd()})`; ctx.beginPath(); ctx.arc(cx + x * sc, cy + y * sc, 1.1 + rnd(), 0, Math.PI * 2); ctx.fill(); placed++; }
    // r₀ 圈、你
    ctx.strokeStyle = CSS('--gold'); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, P.r0 * sc, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = CSS('--gold'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`r₀ = ${(P.r0 / 1000).toFixed(2)} Gpc`, cx + P.r0 * sc * 0.72 + 4, cy - P.r0 * sc * 0.72);
    ctx.fillStyle = CSS('--coral'); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '600 12px Space Grotesk, sans-serif'; ctx.fillText('你', cx, cy - 9);
    ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; const l1 = `中心密度是远处的 ${(m.rhoRel(1) * 100).toFixed(0)}%　·　H₀：中心 ${m.Hkms(0).toFixed(1)}，远处 ${P.Hout.toFixed(1)} km/s/Mpc`, l2 = `方框半宽 ${(Rmax / 1000).toFixed(1)} Gpc`;
    if (ctx.measureText(l1).width + ctx.measureText(l2).width + 30 > w) { ctx.fillText(l1, 10, h - 24); ctx.fillText(l2, 10, h - 10); } else { ctx.fillText(l1, 10, h - 10); ctx.textAlign = 'right'; ctx.fillText(l2, w - 10, h - 10); } // 窄屏分两行
  }
  function drawProf() {
    const cv = $('c-ltb-prof'), m = st.m, Rmax = Math.max(1.6 * P.r0 + 2 * P.dr, 1200), xs = [], om = [], hp = [], hr = [];
    for (let i = 0; i <= 120; i++) { const r = Math.max(2, Rmax * i / 120); xs.push(r / 1000); om.push(m.OmegaM(r)); hp.push(m.Hperp(r)); hr.push(m.Hpar(r)); }
    const hmax = Math.max(...hp, ...hr) * 1.1, hmin = Math.min(...hp, ...hr) * 0.9;
    chart(cv, { xmin: 0, xmax: Rmax / 1000, ymin: 0, ymax: 1.1, xlabel: 'r（Gpc，今天的共动半径）', ylabel: 'Ω_M（左）', padL: 44,
      series: [{ xs, ys: om, color: CSS('--gold') }, { xs, ys: hp.map((v) => (v - hmin) / (hmax - hmin)), color: CSS('--teal') }, { xs, ys: hr.map((v) => (v - hmin) / (hmax - hmin)), color: CSS('--coral') }],
      vlines: [{ x: P.r0 / 1000, color: CSS('--faint'), label: 'r₀' }] });
    const { ctx, w } = fit(cv); ctx.fillStyle = CSS('--dim'); ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'right'; ctx.fillText(`H 刻度：${hmin.toFixed(0)}–${hmax.toFixed(0)} km/s/Mpc`, w - 16, 14);
  }
  function drawHub() {
    const cv = $('c-ltb-hub'), ry = st.ry, Hc = st.m.Hkms(0), L = lcdm(), fr = st.fitR;
    const muEdS = (z, H0) => 5 * Math.log10(2 * LTB.CKMS / H0 * (1 + z) * (1 - 1 / Math.sqrt(1 + z))) + 25;
    const zs = [], dv = [], dl = [], df = []; for (let i = 1; i <= 120; i++) { const z = 0.01 * Math.pow(300, i / 120); if (z > ry.z[ry.z.length - 1]) break; zs.push(z); dv.push(5 * Math.log10(LTB.interp(ry.z, ry.DL, z)) + 25 - muEdS(z, Hc)); dl.push(LTB.interp(L.zs, L.mu, z) - muEdS(z, L.H0)); df.push(5 * Math.log10(LTB.dlFlat(fr.H0, fr.OL, z)) + 25 - muEdS(z, Hc)); }
    chart(cv, { xmin: 0.01, xmax: 3, xlog: true, ymin: -0.3, ymax: 1.2, xlabel: '红移 z', ylabel: 'Δμ = μ − μ_EdS（星等）', padL: 48,
      series: [{ xs: zs, ys: dv, color: CSS('--gold'), width: 2.5 }, { xs: zs, ys: dl, color: CSS('--teal') }, { xs: zs, ys: df, color: CSS('--violet'), dash: [5, 4] }],
      hlines: [{ y: 0, color: CSS('--dim'), label: 'EdS（无空洞、无 Λ，取中心的 H₀）' }], vlines: [{ x: 0.02, color: CSS('--faint') }, { x: 1.2, color: CSS('--faint'), label: '拟合区间' }] });
  }
  function fitCards() {
    const fr = st.fitR, m = st.m, trap = fr.OL > 0.3, uniform = Math.abs(P.Oin - P.Oout) < 1e-9;
    $('ltb-fit').innerHTML = [
      [trap ? 'coral' : 'teal', '按平坦 FLRW 拟合这条哈勃图', `Ω_Λ = ${fr.OL.toFixed(2)}，H₀ = ${fr.H0.toFixed(1)}`, `z ∈ [0.02, 1.2]，残差 rms ${fr.rms.toFixed(3)} 星等（超新星本身的散布约 0.15）${trap ? (uniform ? '——处处一样的开放宇宙也减速得比 EdS 慢（曲率顶了一部分 Λ 的位置）：硬按平坦模型拟合就会"测"出一些 Ω_Λ，但 Ω_Λ ≈ 0.7 的加速它给不出' : '——没有一点暗能量，却"测"出了 Ω_Λ') : (uniform ? '——处处一样，没有空洞可言' : '——这个空洞骗不了人')}`],
      ['gold', '真相', `Ω_Λ = 0，Ω_M：中心 ${P.Oin.toFixed(2)} → 远处 ${P.Oout.toFixed(2)}`, `中心 H₀ = ${m.Hkms(0).toFixed(1)}，远处 ${P.Hout.toFixed(1)} km/s/Mpc；年龄 ${m.t0Gyr.toFixed(2)} Gyr（处处一样）`],
    ].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  function tests() {
    const m = st.m, K = [];
    const Hfar = P.Hout, cmbH0 = 67.4, badH = Math.abs(Hfar - cmbH0) > 5;
    K.push([badH ? 'teal' : 'coral', '远处的 H₀ 对 CMB', `${Hfar.toFixed(1)} vs 67.4 km/s/Mpc`, badH ? 'CMB 和 BAO 看到的是远处的宇宙：这个空洞要求远处的 H₀ 离 Planck 值太远 ✗' : '远处的 H₀ 和 CMB 的值差不多：这一关它过了']);
    const dH = m.Hpar(P.r0) - m.Hperp(P.r0), aniso = Math.abs(dH) > 1;
    K.push([aniso ? 'teal' : 'coral', '空洞边缘的各向异性膨胀', `H_∥ − H_⊥ = ${dH.toFixed(1)} km/s/Mpc`, aniso ? '径向和横向膨胀率不同：BAO 的 Alcock–Paczyński 检验能量出来 ✗' : '几乎各向同性：BAO 看不出']);
    K.push(['teal', '年龄', `${m.t0Gyr.toFixed(2)} Gyr，处处一样`, '同时大爆炸是假设进去的（只留增长模）；放开它就多一个自由函数，但早期宇宙会不均匀得离谱']);
    K.push(['teal', '动力学 SZ 效应', '文献：预言比观测大约 10 倍', '空洞里的星系团相对 CMB 有径向速度，散射出 kSZ 信号（Zhang & Stebbins 2011；Zibin & Moss 2011）✗——本页未算']);
    $('ltb-tests').innerHTML = K.map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:14px">${v}</b><i>${i}</i></div>`).join('');
    dipole();
  }
  function dipole() {
    const m = st.m, d = st.d, dt = LTB.dipole(m, d), obs = 1.23e-3, vkms = dt * LTB.CKMS;
    const noVoid = Math.abs(P.Oin - P.Oout) < 1e-9, frac = Math.pow(d / P.r0, 3), size = P.r0 >= 1000 ? `${(P.r0 / 1000).toFixed(1)} Gpc（${(P.r0 * 3.26 / 1000).toFixed(0)} 亿光年）` : `${P.r0} Mpc（${(P.r0 * 3.26 / 100).toFixed(1)} 亿光年）`;
    $('ltb-dipole').innerHTML = noVoid ? `这组参数处处一样（没有空洞），偏离"中心"没有意义：速度 = 0，偶极 = 0。` : `偏离中心 ${sig(d, 3)} Mpc：相对远处 CMB 的速度 ≈ (H(d) − H_out)·d = <b class="mono">${sig(vkms, 3)} km/s</b>，偶极 ΔT/T ≈ <b class="mono">${dt.toExponential(2)}</b>（观测到的整个偶极 1.23×10⁻³，通常全归给太阳系的运动）。${dt > 0.3 * obs ? '<b style="color:var(--coral)">这么大的额外偶极藏不住：你必须离中心更近。</b>' : `藏在太阳系运动的偶极里还不会露馅——但这要求我们离这个半径 ${size} 的空洞的中心不到 ${sig(d, 2)} Mpc：按体积算是 (d/r₀)³ ≈ ${frac.toExponential(0)} 的巧合（哥白尼原理）。`}`;
  }
  function cards() {
    const m = st.m, ry = st.ry;
    $('ltb-cards').innerHTML = [
      ['gold', '中心的 H₀', `${m.Hkms(0).toFixed(1)} km/s/Mpc`, '由同时大爆炸定出：Ω 越小的壳层，同样的年龄要求越大的 H'],
      Math.abs(P.Oin - P.Oout) < 1e-9 ? ['teal', '空洞边缘', '—', '处处一样：没有边缘'] : ['teal', '空洞边缘的红移', `z(r₀) = ${LTB.interp(ry.r, ry.z, P.r0).toFixed(3)}`, '超新星样本里最远的 z ≈ 1–2：空洞必须大到这个尺度才骗得过'],
      ['violet', '中心密度', `远处的 ${(m.rhoRel(1) * 100).toFixed(0)}%`, '8πGρ = 2M′/(R²R′)'],
    ].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  // ---- 交互 ----
  const chips = $('ltb-presets'); for (const p of PRESETS) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = p.id; b.innerHTML = `${p.name}<small>${p.sub}</small>`; b.addEventListener('click', () => { Object.assign(P, p.p); sync(); solveNow(); }); chips.appendChild(b); }
  const bind = (id, fn) => $(id).addEventListener('input', () => { fn(+$(id).value); labels(); solveSoon(); });
  bind('ltb-Oin', (v) => { P.Oin = v; }); bind('ltb-Oout', (v) => { P.Oout = v; }); bind('ltb-r0', (v) => { P.r0 = v; }); bind('ltb-dr', (v) => { P.dr = v; }); bind('ltb-Hout', (v) => { P.Hout = v; });
  $('ltb-d').addEventListener('input', () => { st.d = Math.pow(10, +$('ltb-d').value); labels(); if (st.m) dipole(); });
  window.addEventListener('resize', () => { if (G.current === 'ltb') render(); });
  function enter() { if (!st.m) { sync(); solveNow(); } else render(); }
  window.GENESIS_HALLS = window.GENESIS_HALLS || []; window.GENESIS_HALLS.push((hall) => { G.current = hall; if (hall === 'ltb') enter(); });
})();
