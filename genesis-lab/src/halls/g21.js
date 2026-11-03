// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 2+1 维引力展区的页面逻辑：引擎在 gravity21.js；这里管锥的双像（剪开/粘上两张图）、BTZ 轨道与有效势、2+1 维宇宙学曲线。
(function () {
  const G = window.GENESIS, $ = G.$, chart = G.chart, fit = G.fit, sig = G.sig, CSS = G.CSS;
  const st = { delta: 0.6, src: [5.5, 0.9], O: [-3, 0], drag: false, M: 1, ell: 1, E: 5, L: 1.5, kind: 'massive', orbit: null, anim: 0, raf: 0, flrw: null };
  function labels() { $('g21-v-delta').textContent = st.delta.toFixed(2) + ' rad = ' + (st.delta * 180 / Math.PI).toFixed(0) + '°'; $('g21-v-M').textContent = st.M.toFixed(2); $('g21-v-E').textContent = st.E.toFixed(2); $('g21-v-L').textContent = st.L.toFixed(2); }
  // ---- ① 锥 ----
  function cone() {
    const d = st.delta, O = st.O; let S = st.src; // 光源必须在图上：不在就推到最近的边外一点
    if (!GRAVITY21.inChart(S[0], S[1], d)) { const r = Math.hypot(S[0], S[1]); let ph = Math.atan2(S[1], S[0]); if (ph < 0) ph += 2 * Math.PI; ph = ph < Math.PI ? d / 2 + 0.01 : 2 * Math.PI - d / 2 - 0.01; S = [r * Math.cos(ph), r * Math.sin(ph)]; st.src = S; }
    const im = GRAVITY21.images(O, S, d); drawCut(im); drawGlue(im);
    const sep = im.length === 2 ? Math.abs(im[0].dir - im[1].dir) : 0;
    $('g21-cone-cards').innerHTML = [[im.length === 2 ? 'gold' : 'teal', '你看到几个像', String(im.length), im.length === 2 ? `两像夹角 ${(sep * 180 / Math.PI).toFixed(1)}°（远处光源 → δ = ${(d * 180 / Math.PI).toFixed(0)}°）` : '光源不在质点背后：只有一个像'], ['violet', '质量', `m = δ/8πG = ${(d / (8 * Math.PI)).toFixed(3)} /G`, `这样的质点 ${(2 * Math.PI / d).toFixed(1)} 个就把空间闭合成球`]].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  function drawCut(im) {
    const cv = $('c-g21-cut'), { ctx, w, h } = fit(cv), d = st.delta, sc = Math.min(w, h) / 14, cx = w / 2, cy = h / 2, X = (p) => cx + p[0] * sc, Y = (p) => cy - p[1] * sc;
    ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    // 楔（去掉的部分）
    ctx.fillStyle = 'rgba(255,111,135,0.18)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, w, -d / 2, d / 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = CSS('--coral'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1; for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + w * Math.cos(s * d / 2), cy - w * Math.sin(s * d / 2)); ctx.stroke(); } ctx.setLineDash([]);
    // 光线：直线 O→像的目标
    for (const q of im) { ctx.strokeStyle = q.copy === 0 ? CSS('--gold') : CSS('--teal'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(st.O), Y(st.O)); ctx.lineTo(X(q.target), Y(q.target)); ctx.stroke(); if (q.copy !== 0) { ctx.fillStyle = CSS('--teal'); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(X(q.target), Y(q.target), 5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; } }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CSS('--gold'); ctx.beginPath(); ctx.arc(X(st.src), Y(st.src), 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CSS('--violet'); ctx.beginPath(); ctx.arc(X(st.O), Y(st.O), 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('剪开的平面：红楔去掉，两条虚线粘在一起；光是直线', 6, 14); ctx.fillText('紫 = 你　金 = 光源（拖）　青 = 光源的副本', 6, h - 8);
  }
  function drawGlue(im) {
    const cv = $('c-g21-glue'), { ctx, w, h } = fit(cv), d = st.delta, sc = Math.min(w, h) / 14, cx = w / 2, cy = h / 2, P = (p) => { const g = GRAVITY21.glue(p[0], p[1], d); return [cx + g[0] * sc, cy - g[1] * sc]; };
    ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    // 网格圆 + 径向线，显示"粘合"后的样子
    ctx.strokeStyle = 'rgba(152,164,199,0.2)'; ctx.lineWidth = 1; for (let r = 2; r <= 8; r += 2) { ctx.beginPath(); ctx.arc(cx, cy, r * sc, 0, Math.PI * 2); ctx.stroke(); }
    for (const q of im) { ctx.strokeStyle = q.copy === 0 ? CSS('--gold') : CSS('--teal'); ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i <= 120; i++) { const u = i / 120; const x = st.O[0] + (q.target[0] - st.O[0]) * u, y = st.O[1] + (q.target[1] - st.O[1]) * u; // 副本的点折回图上：旋回 −kδ
        const r = GRAVITY21.rot([x, y], -q.copy * d * (GRAVITY21.inChart(x, y, d) ? 0 : 1)); const p = P(r); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
    const s = P(st.src), o = P(st.O); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CSS('--gold'); ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CSS('--violet'); ctx.beginPath(); ctx.arc(o[0], o[1], 5, 0, Math.PI * 2); ctx.fill();
    // 观察者看到的方向
    for (const q of im) { const a = P([st.O[0] + 1.2 * Math.cos(q.dir), st.O[1] + 1.2 * Math.sin(q.dir)]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); }
    ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('粘起来的锥（从上面看）：同样的光线看起来弯了', 6, 14); ctx.fillText(im.length === 2 ? '两条光线、两个像' : '一条光线、一个像', 6, h - 8);
  }
  const cut = $('c-g21-cut');
  const toWorld = (ev) => { const r = cut.getBoundingClientRect(), sc = Math.min(r.width, r.height) / 14; return [(ev.clientX - r.left - r.width / 2) / sc, -(ev.clientY - r.top - r.height / 2) / sc]; };
  cut.addEventListener('pointerdown', (ev) => { st.drag = true; cut.setPointerCapture(ev.pointerId); st.src = toWorld(ev); cone(); });
  cut.addEventListener('pointermove', (ev) => { if (!st.drag) return; const p = toWorld(ev); if (Math.hypot(p[0], p[1]) < 0.4) return; st.src = p; cone(); });
  cut.addEventListener('pointerup', () => { st.drag = false; }); cut.addEventListener('pointercancel', () => { st.drag = false; });
  $('g21-delta').addEventListener('input', () => { st.delta = +$('g21-delta').value; labels(); cone(); });
  // ---- ② BTZ ----
  function shoot() {
    const B = GRAVITY21.btz(st.M, st.ell), kap = st.kind === 'massive'; const r0 = 2 * B.ell + B.rp;
    st.orbit = GRAVITY21.geodesic(B, { E: st.E, L: st.L, massive: kap, r0, phi0: 0, outward: true, lambdaMax: kap ? 40 : 60, dl: 0.005 }); st.anim = 0; cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(orbitTick); drawPot();
    if (!st.orbit.ok) { $('g21-fate').textContent = '这组 E、L 在出发点不允许（E² < V）：把 E 调大'; drawOrbit(); return; }
    const o = st.orbit; $('g21-fate').textContent = o.fate === 'horizon' ? (o.bounces ? `到 AdS 边界反射 ${o.bounces} 次后掉进视界` : '掉进视界') : (o.fate === 'bounce' ? `在 AdS 边界反射了 ${o.bounces} 次（AdS 是一口井）` : '绕着');
  }
  function orbitTick() { if (!st.orbit || !st.orbit.ok) return; st.anim = Math.min(st.orbit.r.length - 1, st.anim + Math.max(2, Math.round(st.orbit.r.length / 240))); drawOrbit(); if (st.anim < st.orbit.r.length - 1 && G.current === 'g21') st.raf = requestAnimationFrame(orbitTick); }
  function drawOrbit() {
    const cv = $('c-g21-orbit'), { ctx, w, h } = fit(cv), B = GRAVITY21.btz(st.M, st.ell); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    // 共形压缩：画面半径 ρ = (2/π) arctan(r/ℓ)，AdS 的无穷远（边界）就是外圈
    const R0 = Math.min(w, h) * 0.47, cx = w / 2, cy = h / 2, P = (r, ph) => { const rho = R0 * 2 / Math.PI * Math.atan(r / B.ell); return [cx + rho * Math.cos(ph), cy - rho * Math.sin(ph)]; };
    ctx.fillStyle = 'rgba(176,140,255,0.06)'; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = CSS('--violet'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(152,164,199,0.2)'; ctx.lineWidth = 1; for (const r of [1, 2, 4, 8]) { const rho = R0 * 2 / Math.PI * Math.atan(r * B.ell / B.ell); ctx.beginPath(); ctx.arc(cx, cy, rho, 0, Math.PI * 2); ctx.stroke(); }
    const rh = R0 * 2 / Math.PI * Math.atan(B.rp / B.ell); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, rh, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = CSS('--coral'); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = CSS('--coral'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`视界 r₊ = ${B.rp.toFixed(2)}`, cx, cy - rh - 6); ctx.fillStyle = CSS('--violet'); ctx.fillText('AdS 边界（r = ∞）', cx, cy - R0 + 14);
    if (st.orbit && st.orbit.ok) { const o = st.orbit, n = st.anim; ctx.strokeStyle = st.kind === 'massive' ? CSS('--gold') : CSS('--teal'); ctx.lineWidth = 1.8; ctx.beginPath(); for (let i = 0; i <= n; i++) { const p = P(o.r[i], o.phi[i]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke(); const p = P(o.r[n], o.phi[n]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = CSS('--dim'); ctx.textAlign = 'left'; ctx.fillText(`AdS 半径 ℓ = ${st.ell}；画面按 (2/π)arctan(r/ℓ) 压缩，灰圈 r = 1, 2, 4, 8`, 8, h - 8);
  }
  function drawPot() {
    const cv = $('c-g21-pot'), B = GRAVITY21.btz(st.M, st.ell), kap = st.kind === 'massive' ? 1 : 0, xs = [], ys = []; const rmax = 8 * B.ell;
    for (let i = 0; i <= 200; i++) { const r = B.rp + (rmax - B.rp) * i / 200; xs.push(r); ys.push(B.f(r) * (kap + st.L * st.L / (r * r))); }
    chart(cv, { xmin: 0, xmax: rmax, ymin: Math.min(0, ...ys) - 1, ymax: Math.max(st.E * st.E * 1.3, ...ys.slice(0, 150)), xlabel: 'r', ylabel: 'V(r) 与 E²', padL: 44, series: [{ xs, ys, color: CSS('--violet') }], hlines: [{ y: st.E * st.E, color: CSS('--gold'), label: 'E²' }], vlines: [{ x: B.rp, color: CSS('--coral'), label: 'r₊' }] });
    $('g21-btz-cards').innerHTML = [['coral', '霍金温度', `T = r₊/2πℓ² = ${sig(B.T, 3)}`, 'ℏ = k_B = 1'], ['gold', '熵', `S = 2πr₊/4G = ${sig(B.S, 3)}`, '"面积"在 2+1 维里是周长'], ['violet', '边界中心荷', `c = 3ℓ/2G = ${sig(B.centralCharge, 3)}`, 'Brown–Henneaux 1986；Cardy 公式给出同一个 S']].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  for (const r of document.querySelectorAll('input[name=g21-kind]')) r.addEventListener('change', () => { if (r.checked) { st.kind = r.value; shoot(); } });
  $('g21-shoot').addEventListener('click', shoot);
  for (const [id, k] of [['g21-M', 'M'], ['g21-E', 'E'], ['g21-L', 'L']]) $(id).addEventListener('input', () => { st[k] = +$(id).value; labels(); drawPot(); drawOrbit(); });
  // ---- ③ 2+1 维 FLRW ----
  function drawFlrw() {
    const cv = $('c-g21-flrw'); if (!st.flrw) { const d = GRAVITY21.flrw21({ dust: 1 }), r = GRAVITY21.flrw21({ rad: 1 }), L = GRAVITY21.flrw21({ lambda: 1 }); const R = COSMO.solve({ H0: 67.4, Om: 1, OL: 0, Or: 0, w: -1 }); const ts = [], as = []; for (let i = R.past.ts.length - 1; i >= 0; i--) { ts.push(R.past.ts[i]); as.push(R.past.as[i]); } for (let i = 1; i < R.fut.ts.length; i++) { ts.push(R.fut.ts[i]); as.push(R.fut.as[i]); } st.flrw = { d, r, L, eds: { ts, as } }; }
    const F = st.flrw; chart(cv, { xmin: -1.2, xmax: 3, ymin: 0, ymax: 5, xlabel: '时间（1/H₀，今天 = 0）', ylabel: '尺度因子 a', padL: 44, series: [{ xs: F.d.ts, ys: F.d.as, color: CSS('--gold') }, { xs: F.r.ts, ys: F.r.as, color: CSS('--teal') }, { xs: F.L.ts, ys: F.L.as, color: CSS('--violet') }, { xs: F.eds.ts, ys: F.eds.as, color: CSS('--coral'), dash: [4, 4] }], vlines: [{ x: 0, color: CSS('--dim'), label: '今天' }] });
  }
  window.addEventListener('resize', () => { if (G.current === 'g21') { cone(); drawOrbit(); drawPot(); drawFlrw(); } });
  let entered = false;
  function enter() { if (!entered) { labels(); cone(); shoot(); drawFlrw(); entered = true; } else { cone(); drawOrbit(); drawPot(); drawFlrw(); } }
  window.GENESIS_HALLS = window.GENESIS_HALLS || []; window.GENESIS_HALLS.push((hall) => { G.current = hall; if (hall === 'g21') enter(); });
})();
