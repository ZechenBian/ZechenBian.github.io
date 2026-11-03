// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 多连通宇宙展区的页面逻辑：引擎在 topo.js；这里管胞腔与鬼像、CMB 天图与匹配圆、低阶多极扫描。
(function () {
  const G = window.GENESIS, $ = G.$, chart = G.chart, fit = G.fit, sig = G.sig, CSS = G.CSS, gyr = G.gyr, toast = G.toast;
  const W = 360, H = 180, BIG = 60; // 天图分辨率；非周期方向的"无限"胞腔边长
  const st = { L: 1.2, shape: 't3', seed: 7, F: null, sky: null, circles: [], hoverC: -1, hoverG: null, gal: null, img: null, timer: null, scan: null, zchi: null };
  const PAL = ['#f2c14e', '#5fe0cf', '#ff6f87', '#b08cff', '#8fd65a', '#ff9f6f', '#6fb5ff', '#ffd1dc', '#d9a066', '#7fffd4'];
  const PRESETS = [{ id: 'small', name: '小环面', sub: 'L = 0.7χ：鬼像满天、大圆对', L: 0.7, shape: 't3' }, { id: 'mid', name: '中等', sub: 'L = 1.2χ：九对圆', L: 1.2, shape: 't3' }, { id: 'planck', name: 'Planck 的边界', sub: 'L = 1.9χ：圆只剩 18°', L: 1.9, shape: 't3' }, { id: 'big', name: '比视界大', sub: 'L = 2.4χ：什么都看不出', L: 2.4, shape: 't3' }, { id: 'slab', name: '板', sub: '只有一个方向周期', L: 0.9, shape: 'slab' }];
  function Lvec() { return st.shape === 't3' ? [st.L, st.L, st.L] : (st.shape === 'chimney' ? [st.L, st.L, BIG] : [st.L, BIG, BIG]); }
  // χ(z) 表：把以 χ_LSS 为单位的共动距离换成红移和回看时间（Planck 宇宙）
  function zchi() {
    if (st.zchi) return st.zchi; const m = COSMO.norm(COSMO.FIDUCIAL), T = COSMO.chiTable(m, 1100, 6000), R = COSMO.solve(COSMO.FIDUCIAL), chiLSS = COSMO.chiAt(T, 1090); const zs = [], cs = [], tl = [];
    for (let i = 0; i <= 400; i++) { const z = Math.pow(1090, i / 400) - 1; const c = COSMO.chiAt(T, z) / chiLSS; zs.push(z); cs.push(c); tl.push(-COSMO.tOfA(R, 1 / (1 + z)) * COSMO.GYR / m.H0); }
    return (st.zchi = { zs, cs, tl, chiGpc: chiLSS * COSMO.CKMS / m.H0 / 1000, age: R.age * COSMO.GYR / m.H0 });
  }
  function lookback(d) { const Z = zchi(); if (d >= 1) return { z: 1090, t: Z.age }; let i = 0; while (i < Z.cs.length - 1 && Z.cs[i + 1] < d) i++; const u = (d - Z.cs[i]) / (Z.cs[i + 1] - Z.cs[i] || 1); return { z: Z.zs[i] + (Z.zs[i + 1] - Z.zs[i]) * u, t: Z.tl[i] + (Z.tl[i + 1] - Z.tl[i]) * u }; }
  function galaxies() { if (st.gal) return st.gal; const r = TOPO.mulberry32(11); st.gal = []; for (let i = 0; i < 9; i++) st.gal.push({ x: (r() - 0.5) * 0.9, y: (r() - 0.5) * 0.9, c: PAL[i % PAL.length], name: '星系 ' + String.fromCharCode(65 + i) }); return st.gal; }
  function build() { st.F = TOPO.field(Lvec(), 64, st.seed); st.sky = TOPO.sky(st.F, W, H); st.circles = TOPO.circles(Lvec(), 2); st.img = null; render(); }
  function labels() { $('topo-v-L').textContent = st.L.toFixed(2) + ' χ'; for (const b of document.querySelectorAll('#topo-presets .chip')) { const p = PRESETS.find((q) => q.id === b.dataset.id); b.classList.toggle('on', !!p && Math.abs(p.L - st.L) < 1e-9 && p.shape === st.shape); } }
  function render() { drawCell(); drawSky(); drawMatch(); drawCl(); cards(); }
  // ① 胞腔与鬼像（二维：用 x、y 的周期）
  function drawCell() {
    const cv = $('c-topo-cell'), { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    const Lx = st.L, Ly = st.shape === 'slab' ? BIG : st.L, sc = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2, X = (x) => cx + x * sc, Y = (y) => cy - y * sc;
    const gal = galaxies(), gh = TOPO.ghosts(gal, [Lx, Ly], 1); st.ghosts = gh;
    // 胞腔网格
    ctx.strokeStyle = 'rgba(152,164,199,0.35)'; ctx.lineWidth = 1; const imax = Math.ceil(1.2 / Lx) + 1;
    for (let i = -imax; i <= imax; i++) { const x = (i + 0.5) * Lx; if (Math.abs(x) > 1.25) continue; ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke(); }
    if (st.shape !== 'slab') for (let j = -imax; j <= imax; j++) { const y = (j + 0.5) * Ly; if (Math.abs(y) > 1.25) continue; ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(w, Y(y)); ctx.stroke(); }
    ctx.strokeStyle = CSS('--gold'); ctx.lineWidth = 2; ctx.strokeRect(X(-Lx / 2), Y(Ly / 2), Lx * sc, Math.min(Ly, 3) * sc);
    ctx.strokeStyle = 'rgba(233,237,249,0.6)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, sc, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // 像
    const hovName = st.hoverG;
    for (const q of gh) { const on = hovName === q.g.name; ctx.globalAlpha = hovName && !on ? 0.25 : 1; ctx.fillStyle = q.g.c; ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), q.direct ? 6 : 4, 0, Math.PI * 2); ctx.fill(); if (!q.direct) { ctx.strokeStyle = '#060913'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), 2, 0, Math.PI * 2); ctx.stroke(); } if (on) { ctx.strokeStyle = q.g.c; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(q.x), Y(q.y)); ctx.stroke(); ctx.setLineDash([]); } }
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.font = '600 12px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('你', cx, cy - 9);
    ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(w < 420 ? `金框 = 胞腔 L = ${st.L.toFixed(2)}χ　大点本尊，小点鬼像` : `金框 = 基本胞腔 L = ${st.L.toFixed(2)}χ　虚线圆 = 最后散射面（χ）　大点 = 本尊，小点 = 鬼像`, 10, h - 10);
    ctx.textAlign = 'right'; ctx.fillText(`圆内共 ${gh.length} 个像 / ${gal.length} 个星系`, w - 10, 12);
  }
  // ② 天图
  function drawSky() {
    const cv = $('c-topo-sky'), { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    if (!st.img) { st.img = document.createElement('canvas'); st.img.width = W; st.img.height = H; const ic = st.img.getContext('2d'), im = ic.createImageData(W, H), d = im.data; for (let p = 0; p < W * H; p++) { const v = Math.max(-1, Math.min(1, st.sky[p] / 2.2)); const o = p * 4; if (v < 0) { d[o] = 40 + 40 * (1 + v); d[o + 1] = 80 + 120 * (1 + v); d[o + 2] = 220; } else { d[o] = 220; d[o + 1] = 200 - 160 * v; d[o + 2] = 200 - 180 * v; } d[o + 3] = 255; } ic.putImageData(im, 0, 0); }
    ctx.imageSmoothingEnabled = true; ctx.drawImage(st.img, 0, 0, w, h);
    // 匹配圆
    const X = (ps) => (ps + Math.PI) / (2 * Math.PI) * w, Y = (th) => th / Math.PI * h;
    st.circles.forEach((c, k) => { const col = PAL[k % PAL.length], on = st.hoverC === k; ctx.strokeStyle = col; ctx.lineWidth = on ? 3 : 1.5; ctx.globalAlpha = st.hoverC >= 0 && !on ? 0.35 : 0.95; const cp = TOPO.circlePoints(c, 120);
      for (const arr of [cp.A, cp.B]) { ctx.beginPath(); let prev = null; for (const p of arr) { const th = Math.acos(Math.max(-1, Math.min(1, p[2]))), ps = Math.atan2(p[1], p[0]); const x = X(ps), y = Y(th); if (prev && Math.abs(x - prev) > w / 2) ctx.moveTo(x, y); else if (prev === null) ctx.moveTo(x, y); else ctx.lineTo(x, y); prev = x; } ctx.stroke(); } });
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(233,237,249,0.85)'; ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('ψ = −180°', 4, h - 6); ctx.textAlign = 'right'; ctx.fillText('+180°', w - 4, h - 6); ctx.textAlign = 'left'; ctx.fillText(st.circles.length ? `${st.circles.length} 对匹配圆（同色一对）` : '没有匹配圆：胞腔比最后散射面的直径还大', 4, 12);
  }
  function drawMatch() {
    const cv = $('c-topo-match'), k = st.hoverC; if (k < 0 || !st.circles[k]) { const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h); ctx.fillStyle = CSS('--dim'); ctx.font = '12px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText(st.circles.length ? '指到（或点一下）一对圆：画出沿两个圆的温度' : '', w / 2, h / 2); return; }
    const c = st.circles[k], cp = TOPO.circlePoints(c, 180), xs = [], a = [], b = []; for (let i = 0; i < 180; i++) { xs.push(i * 2); a.push(TOPO.sample(st.F, cp.A[i][0], cp.A[i][1], cp.A[i][2])); b.push(TOPO.sample(st.F, cp.B[i][0], cp.B[i][1], cp.B[i][2])); }
    const ymax = Math.max(1, ...a.map(Math.abs));
    chart(cv, { xmin: 0, xmax: 360, ymin: -ymax, ymax, xlabel: `沿圆的角度 φ（圆对 ${k + 1}：平移 ${c.n.join(',')}，角半径 ${(c.alpha * 180 / Math.PI).toFixed(1)}°）`, ylabel: 'ΔT', padL: 40, series: [{ xs, ys: a, color: PAL[k % PAL.length], width: 3 }, { xs, ys: b, color: '#fff', width: 1, dash: [4, 3] }] });
  }
  function drawCl() {
    const cv = $('c-topo-cl'); if (!st.scan) { const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h); ctx.fillStyle = CSS('--dim'); ctx.font = '13px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('按"扫一遍"', w / 2, h / 2); return; }
    const S = st.scan; chart(cv, { xmin: 0.3, xmax: 4.2, ymin: 1e-3, ymax: 2, ylog: true, xlabel: 'L / χ', ylabel: 'C_ℓ（相对 L = 4）', padL: 48, series: [{ xs: S.Ls, ys: S.C2, color: CSS('--gold') }, { xs: S.Ls, ys: S.C3, color: CSS('--teal') }], vlines: [{ x: st.L, color: CSS('--coral'), label: '当前 L' }] });
  }
  function cards() {
    const cs = st.circles, amax = cs.length ? cs[0].alpha * 180 / Math.PI : 0, amin = cs.length ? cs[cs.length - 1].alpha * 180 / Math.PI : 0, Z = zchi();
    const excluded = cs.length && amax > 15;
    $('topo-sky-cards').innerHTML = [[excluded ? 'coral' : 'teal', 'Planck 的匹配圆搜索', cs.length ? `最大的圆对半径 ${amax.toFixed(1)}°` : '没有圆', excluded ? '半径 > 15° 的圆对 Planck 2015 都没找到：这个胞腔被排除 ✗' : (cs.length ? '圆太小，搜索看不到：还活着' : '胞腔比最后散射面直径大：拓扑看不出来')]].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
    $('topo-cards').innerHTML = [['gold', '胞腔的实际大小', `${(st.L * Z.chiGpc).toFixed(1)} Gpc`, `χ_LSS ≈ ${Z.chiGpc.toFixed(1)} Gpc（Planck 宇宙的共动距离）`], ['teal', '匹配圆对', String(cs.length), cs.length ? `角半径 ${amin.toFixed(0)}°–${amax.toFixed(0)}°` : 'L ≥ 2χ 时为零'], ['violet', '切片里的鬼像', String(st.ghosts ? st.ghosts.length : 0), '最后散射面之内，每个星系的像数 ≈ πχ²/L²']].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  // ---- 交互 ----
  const cell = $('c-topo-cell');
  const onCell = (ev) => { const r = cell.getBoundingClientRect(), w = r.width, h = r.height, sc = Math.min(w, h) * 0.46; const x = (ev.clientX - r.left - w / 2) / sc, y = -(ev.clientY - r.top - h / 2) / sc; let best = null; for (const q of (st.ghosts || [])) { const d = Math.hypot(q.x - x, q.y - y); if (d < 0.05 && (!best || d < best.d)) best = { q, d }; }
    const name = best ? best.q.g.name : null; if (name !== st.hoverG) { st.hoverG = name; drawCell(); if (best) { const q = best.q, all = st.ghosts.filter((z) => z.g.name === name).sort((p, s) => p.d - s.d); $('topo-ghost').innerHTML = `<b style="color:${q.g.c}">${name}</b>：圆内 ${all.length} 个像。` + all.slice(0, 6).map((z) => { const lb = lookback(z.d); return `距离 ${z.d.toFixed(2)}χ = ${(z.d * zchi().chiGpc).toFixed(1)} Gpc（z ≈ ${sig(lb.z, 2)}，${gyr(lb.t)} 前的样子）${z.direct ? '【本尊】' : ''}`; }).join('；') + (all.length > 6 ? '…' : ''); } else $('topo-ghost').textContent = ''; } };
  cell.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'touch') onCell(ev); }); cell.addEventListener('pointerdown', onCell); // 触屏点一下
  cell.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'touch') return; st.hoverG = null; drawCell(); $('topo-ghost').textContent = ''; });
  const skyc = $('c-topo-sky');
  const onSky = (ev) => { const r = skyc.getBoundingClientRect(); const ps = -Math.PI + (ev.clientX - r.left) / r.width * 2 * Math.PI, th = (ev.clientY - r.top) / r.height * Math.PI; const n = [Math.sin(th) * Math.cos(ps), Math.sin(th) * Math.sin(ps), Math.cos(th)]; let best = -1, bd = 0.06;
    st.circles.forEach((c, k) => { for (const s of [1, -1]) { const cosang = s * (n[0] * c.dir[0] + n[1] * c.dir[1] + n[2] * c.dir[2]); const d = Math.abs(Math.acos(Math.max(-1, Math.min(1, cosang))) - c.alpha); if (d < bd) { bd = d; best = k; } } });
    if (best !== st.hoverC) { st.hoverC = best; drawSky(); drawMatch(); } };
  skyc.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'touch') onSky(ev); }); skyc.addEventListener('pointerdown', onSky);
  skyc.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'touch') return; st.hoverC = -1; drawSky(); drawMatch(); });
  const chips = $('topo-presets'); for (const p of PRESETS) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = p.id; b.innerHTML = `${p.name}<small>${p.sub}</small>`; b.addEventListener('click', () => { st.L = p.L; st.shape = p.shape; $('topo-L').value = p.L; $('topo-shape').value = p.shape; labels(); build(); }); chips.appendChild(b); }
  $('topo-L').addEventListener('input', () => { st.L = +$('topo-L').value; labels(); clearTimeout(st.timer); st.timer = setTimeout(build, 200); drawCell(); });
  $('topo-shape').addEventListener('change', () => { st.shape = $('topo-shape').value; labels(); build(); });
  $('topo-reseed').addEventListener('click', () => { st.seed = (st.seed * 7 + 3) % 1000 + 1; build(); });
  $('topo-scan').addEventListener('click', () => { $('topo-scan-note').textContent = '计算中…'; setTimeout(() => { const Ls = [0.4, 0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3, 4], C2 = [], C3 = []; for (const L of Ls) { let c2 = 0, c3 = 0; for (const seed of [1, 2, 3]) { const S = TOPO.sky(TOPO.field([L, L, L], 64, seed), 180, 90), m = TOPO.lowMultipoles(S, 180, 90); c2 += m.C2 / 3; c3 += m.C3 / 3; } C2.push(c2); C3.push(c3); } const n2 = C2[C2.length - 1], n3 = C3[C3.length - 1]; st.scan = { Ls, C2: C2.map((v) => v / n2), C3: C3.map((v) => v / n3) }; $('topo-scan-note').textContent = `每个 L 三个随机场平均；L = 0.6χ 时 C₂ 只剩 ${(st.scan.C2[1] * 100).toFixed(0)}%`; drawCl(); }, 30); });
  window.addEventListener('resize', () => { if (G.current === 'topo') render(); });
  function enter() { if (!st.F) { labels(); build(); } else render(); }
  window.GENESIS_HALLS = window.GENESIS_HALLS || []; window.GENESIS_HALLS.push((hall) => { G.current = hall; if (hall === 'topo') enter(); });
})();
