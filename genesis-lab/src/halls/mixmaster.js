// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// Mixmaster 展区的页面逻辑：引擎在 mixmaster.js；这里只管旋钮、椭球动画、乐谱图、Kasner 圆和时代表。
(function () {
  const G = window.GENESIS, $ = G.$, chart = G.chart, fit = G.fit, sig = G.sig, CSS = G.CSS, toast = G.toast;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = { mode: 'kasner', u: 3.7, shear: 0.9, chi: 0.7, a0: 0.02, M: 0, L: 0 };
  const st = { R: null, i: 0, playing: false, raf: 0, last: 0, yaw: 0.7, pitch: 0.45, drag: null, end: 'bang', chaos: null, timer: null, bounds: [] };
  const PRESETS = [
    { id: 'pure', name: '纯 Mixmaster', sub: '真空，u = 3.7', p: { mode: 'kasner', u: 3.7, a0: 0.02, M: 0, L: 0 } },
    { id: 'long', name: '长纪元', sub: 'u = 5.5：先连跳四次', p: { mode: 'kasner', u: 5.5, a0: 0.02, M: 0, L: 0 } },
    { id: 'golden', name: '黄金比', sub: 'u = 1.618…：永远同一种跳法', p: { mode: 'kasner', u: (1 + Math.sqrt(5)) / 2, a0: 0.02, M: 0, L: 0 } },
    { id: 'dust', name: '装上尘埃', sub: 'M = 1：先膨胀再坍缩', p: { mode: 'general', shear: 0.9, chi: 0.7, a0: 0.3, M: 1, L: 0 } },
    { id: 'lambda', name: '加上 Λ', sub: 'Λ = 0.4：被抹平，永远膨胀', p: { mode: 'general', shear: 0.9, chi: 0.7, a0: 0.3, M: 1, L: 0.4 } },
    { id: 'iso', name: '各向同性', sub: '剪切 0：就是封闭 FLRW', p: { mode: 'general', shear: 0, chi: 0, a0: 0.3, M: 1, L: 0 } },
  ];
  function params() { return P.mode === 'kasner' ? { u: P.u, a0: P.a0, lambda: 1, M: P.M, L: P.L } : { a0: P.a0, shear: P.shear, chi: P.chi, M: P.M, L: P.L }; }
  function labels() {
    $('mix-v-u').textContent = P.u.toFixed(3); $('mix-v-shear').textContent = P.shear.toFixed(2); $('mix-v-chi').textContent = P.chi.toFixed(2); $('mix-v-a0').textContent = sig(P.a0, 3); $('mix-v-M').textContent = P.M.toFixed(2); $('mix-v-L').textContent = P.L.toFixed(2);
    $('mix-ctl-u').hidden = P.mode !== 'kasner'; $('mix-ctl-shear').hidden = P.mode === 'kasner'; $('mix-ctl-chi').hidden = P.mode === 'kasner';
    for (const b of document.querySelectorAll('#mix-presets .chip')) { const pr = PRESETS.find((x) => x.id === b.dataset.id); b.classList.toggle('on', !!pr && Object.keys(pr.p).every((k) => (k === 'mode' ? pr.p[k] === P[k] : Math.abs(pr.p[k] - P[k]) < 1e-9))); }
  }
  function sync() { $('mix-u').value = P.u; $('mix-shear').value = P.shear; $('mix-chi').value = P.chi; $('mix-a0').value = Math.log10(P.a0); $('mix-M').value = P.M; $('mix-L').value = P.L; for (const r of document.querySelectorAll('input[name=mix-mode]')) r.checked = r.value === P.mode; labels(); }
  // ---- 求解 ----
  function solveNow() {
    const t0 = performance.now(); const R = MIXMASTER.solve(params());
    if (!R) { toast('这组初始条件不允许：曲率太强，连静止都不行——把 a₀ 调小'); return; }
    st.R = R; st.chaos = null; $('mix-chaos-out').textContent = '';
    // 反弹的位置：时代的边界（两端的都算），供"下一次反弹"用
    const b = new Set(); for (const e of R.epochs.concat(R.epochsCrunch)) { b.add(e.iStart); b.add(e.iEnd); } st.bounds = Array.from(b).sort((x, y) => x - y);
    $('mix-s').max = R.y.length - 1; let i0 = 0; for (let i = 0; i < R.tau.length; i++) if (R.tau[i] <= 0) i0 = i; st.i = i0; $('mix-s').value = i0;
    let cm = 0; for (const c of R.cerr) if (c > cm) cm = c; $('mix-cerr').textContent = `约束相对误差最大 ${cm.toExponential(1)} · ${R.y.length} 个采样点 · ${Math.round(performance.now() - t0)} ms`;
    render();
  }
  function solveSoon() { clearTimeout(st.timer); st.timer = setTimeout(solveNow, 250); }
  // ---- 渲染 ----
  function render() { if (!st.R) return; drawShape(); hud(); drawLog(); drawKasner(); epochTable(); cards(); }
  function cur() { const R = st.R, i = clamp(st.i, 0, R.y.length - 1), y = R.y[i]; const lnV = y[0] + y[1] + y[2], p = MIXMASTER.velocityExponents(y), s2 = p ? p[0] * p[0] + p[1] * p[1] + p[2] * p[2] : NaN;
    // 撞墙 = 曲率势的各向异性部分在起作用（各向同性的曲率、尘埃和 Λ 对三根轴一视同仁，不算墙）
    const r0 = MIXMASTER.rhs(y, 0, 0), mean = (r0[3] + r0[4] + r0[5]) / 3, an = [Math.abs(r0[3] - mean), Math.abs(r0[4] - mean), Math.abs(r0[5] - mean)], rf = MIXMASTER.rhs(y, R.M, R.L), iso = Math.max(Math.abs(mean), Math.abs(rf[3] - r0[3]));
    const vel = Math.max(1e-9, Math.abs(y[3]), Math.abs(y[4]), Math.abs(y[5])); const wall = Math.max(...an) > 1e-4 * vel * vel ? an.indexOf(Math.max(...an)) : -1, isoActs = iso > 1e-4 * vel * vel;
    return { i, y, lnV, p, s2, wall, isoActs, Tb: R.Tbang ? R.Tbang[i] : NaN, Tc: R.Tcrunch ? R.Tcrunch[i] : NaN }; }
  function hud() {
    const R = st.R, c = cur(), y = c.y, names = ['a', 'b', 'c'];
    $('mix-tau').textContent = `τ = ${sig(R.tau[c.i], 3)}`;
    const K = [];
    K.push(['gold', '宇宙时 t', isFinite(c.Tb) ? `${sig(c.Tb, 3)}` : sig(y[6], 3), isFinite(c.Tb) ? `从大爆炸算起${isFinite(c.Tc) ? `；离大坍缩还有 ${sig(c.Tc, 3)}` : ''}` : '以 τ = 0 为零点']);
    K.push(['teal', '三根轴 ln a, ln b, ln c', `${y[0].toFixed(1)}, ${y[1].toFixed(1)}, ${y[2].toFixed(1)}`, `体积 ln V = ${c.lnV.toFixed(1)}`]);
    if (c.p) K.push([Math.abs(c.s2 - 1) < 0.03 ? 'violet' : 'coral', '指数 p₁, p₂, p₃', c.p.map((v) => v.toFixed(3)).join(', '), Math.abs(c.s2 - 1) < 0.03 ? `Kasner 时代：Σp² = ${c.s2.toFixed(3)}，u = ${sig(MIXMASTER.uFromKasner(c.p), 3)}；${names[c.p.indexOf(Math.min(...c.p))]} 轴在往最近的奇点方向变长，另外两根在缩` : (c.wall >= 0 ? `反弹中（Σp² = ${c.s2.toFixed(2)} ≠ 1）：${names[c.wall]} 轴撞墙` : `不是 Kasner（Σp² = ${c.s2.toFixed(2)} ≠ 1）：${R.M > 0 && R.L > 0 ? '尘埃和 Λ' : (R.M > 0 ? '尘埃' : (R.L > 0 ? 'Λ' : '各向同性的曲率'))} 在均匀地${R.L > 0 && R.M === 0 ? '加速' : '减速'}三根轴，离奇点还远`)]);
    $('mix-hud').innerHTML = K.map(([cl, k, v, i]) => `<div class="k ${cl}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  function drawShape() {
    const cv = $('c-mix-shape'), { ctx, w, h } = fit(cv), c = cur(), y = c.y; ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    const sh = [0, 1, 2].map((k) => y[k] - c.lnV / 3), L = sh.map((s) => Math.exp(1.3 * Math.sign(s) * Math.log(1 + Math.abs(s)) / Math.log(301))); // 对数压缩的形状：轴长指数差 300 也只画成 1 : 13
    const R = Math.min(Math.min(w, h) * 0.3, Math.min(w, h) * 0.4 / Math.max(...L)), cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    const proj = (x, y3, z) => { const x1 = x * cy - y3 * sy, y1 = x * sy + y3 * cy; const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp; return [w / 2 + x1 * R, h / 2 + y2 * R, z2]; };
    const COL = [CSS('--coral'), CSS('--teal'), CSS('--violet')];
    // 网格线
    ctx.lineWidth = 1; const N1 = 12, N2 = 8;
    for (let m = 0; m < N1; m++) { const ph = m / N1 * Math.PI * 2; ctx.beginPath(); for (let k = 0; k <= 32; k++) { const th = k / 32 * Math.PI; const q = proj(L[0] * Math.sin(th) * Math.cos(ph), L[1] * Math.sin(th) * Math.sin(ph), L[2] * Math.cos(th)); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.strokeStyle = 'rgba(242,193,78,0.35)'; ctx.stroke(); }
    for (let m = 1; m < N2; m++) { const th = m / N2 * Math.PI; ctx.beginPath(); for (let k = 0; k <= 48; k++) { const ph = k / 48 * Math.PI * 2; const q = proj(L[0] * Math.sin(th) * Math.cos(ph), L[1] * Math.sin(th) * Math.sin(ph), L[2] * Math.cos(th)); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.strokeStyle = 'rgba(242,193,78,0.35)'; ctx.stroke(); }
    // 三根轴
    const names = ['a', 'b', 'c'];
    for (let k = 0; k < 3; k++) { const v = [0, 0, 0]; v[k] = L[k] * 1.15; const q0 = proj(-v[0], -v[1], -v[2]), q1 = proj(v[0], v[1], v[2]); ctx.strokeStyle = COL[k]; ctx.lineWidth = c.wall === k ? 3 : 1.6; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke(); ctx.fillStyle = COL[k]; ctx.font = '600 13px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(names[k] + (c.p ? ` (p=${c.p[k].toFixed(2)})` : ''), clamp(q1[0] + (q1[0] > w / 2 ? 28 : -28), 34, w - 34), clamp(q1[1] + 4, 14, h - 44)); }
    // 体积条和读数
    const vmin = -200, vmax = 10, u = clamp((c.lnV - vmin) / (vmax - vmin), 0, 1);
    ctx.fillStyle = 'rgba(152,164,199,0.25)'; ctx.fillRect(14, h - 22, w - 28, 8); ctx.fillStyle = CSS('--gold'); ctx.fillRect(14, h - 22, (w - 28) * u, 8);
    ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; const big = Math.max(...sh.map(Math.abs)) > 0.05; ctx.fillText(big ? `体积 ln V = ${c.lnV.toFixed(1)}；各轴偏离平均的对数 ${sh.map((s) => (s > 0 ? '+' : '') + s.toFixed(1)).join(' / ')}（画时压缩）` : `体积 ln V = ${c.lnV.toFixed(1)}；三根轴等长（各向同性）`, 14, h - 28);
    if (c.wall >= 0) { ctx.fillStyle = COL[c.wall]; ctx.font = '600 13px Space Grotesk, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${names[c.wall]} 轴撞墙：反弹！`, w - 14, 20); }
  }
  function series(end) { // 乐谱：x = ln T（离奇点的时间），三条 ln a_i
    const R = st.R, T = end === 'crunch' ? R.Tcrunch : R.Tbang; if (!T) return null; const xs = [], ya = [], yb = [], yc = [];
    for (let i = 0; i < R.y.length; i += 2) { const t = T[i]; if (!(t > 0)) continue; const x = Math.log(t); xs.push(x); ya.push(R.y[i][0]); yb.push(R.y[i][1]); yc.push(R.y[i][2]); }
    return { xs, ya, yb, yc, T };
  }
  function drawLog() {
    const cv = $('c-mix-log'), S = series(st.end); if (!S) { const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h); ctx.fillStyle = CSS('--dim'); ctx.font = '13px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText(st.end === 'crunch' ? (st.R.L > 0 ? '这一端没有大坍缩（Λ 把它抹平了，永远膨胀）' : '这一端在算到的范围里没到奇点') : '这一端在算到的范围里没到奇点', w / 2, h / 2); return; }
    const c = cur(), xcur = Math.log(st.end === 'crunch' ? c.Tc : c.Tb);
    let xmin = Math.min(...S.xs), xmax = Math.max(...S.xs), ymin = Math.min(...S.ya, ...S.yb, ...S.yc), ymax = Math.max(...S.ya, ...S.yb, ...S.yc);
    xmin = Math.max(xmin, xmax - 320); ymin = Math.max(ymin, -260);
    const ep = st.end === 'crunch' ? st.R.epochsCrunch : st.R.epochs;
    chart(cv, { xmin, xmax, ymin: ymin - 5, ymax: ymax + 5, xlabel: st.end === 'crunch' ? 'ln T（离大坍缩还有多久；往左是未来）' : 'ln T（从大爆炸算起）', ylabel: 'ln a, ln b, ln c', padL: 48,
      series: [{ xs: S.xs, ys: S.ya, color: CSS('--coral') }, { xs: S.xs, ys: S.yb, color: CSS('--teal') }, { xs: S.xs, ys: S.yc, color: CSS('--violet') }],
      vlines: ep.map((e, k) => ({ x: e.lnt0, color: 'rgba(152,164,199,0.35)', label: `u=${sig(e.u, 3)}` })),
      marks: isFinite(xcur) ? [{ x: xcur, y: c.y[0], color: CSS('--gold') }, { x: xcur, y: c.y[1], color: CSS('--gold') }, { x: xcur, y: c.y[2], color: CSS('--gold') }] : [] });
  }
  // Kasner 圆：p 在 Σp = 1 平面上的坐标
  const E1 = [2 / Math.sqrt(6), -1 / Math.sqrt(6), -1 / Math.sqrt(6)], E2 = [0, 1 / Math.sqrt(2), -1 / Math.sqrt(2)];
  function drawKasner() {
    const cv = $('c-mix-kasner'), { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    const R0 = Math.min(w, h) * 0.36, cx = w / 2, cy = h / 2 + 6, sc = R0 / Math.sqrt(2 / 3), X = (p) => cx + sc * (p[0] * E1[0] + p[1] * E1[1] + p[2] * E1[2]), Y = (p) => cy - sc * (p[0] * E2[0] + p[1] * E2[1] + p[2] * E2[2]);
    ctx.strokeStyle = 'rgba(233,237,249,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '11px Space Grotesk, sans-serif'; ctx.fillStyle = CSS('--dim'); ctx.textAlign = 'center';
    for (const [p, lab] of [[[1, 0, 0], w < 420 ? '(1,0,0)' : 'p = (1,0,0)：只有 a 在变'], [[0, 1, 0], '(0,1,0)'], [[0, 0, 1], '(0,0,1)']]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(p), Y(p), 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CSS('--dim'); ctx.fillText(lab, X(p), Y(p) + (p[2] ? -8 : 14)); }
    ctx.fillText('圆上 = Kasner 时代；圆内 = 反弹中', cx, h - 6);
    // 轨迹：按时代上色（靠奇点一端）
    const R = st.R, ep = st.end === 'crunch' ? R.epochsCrunch : R.epochs, end = st.end; const COLS = [CSS('--coral'), CSS('--teal'), CSS('--violet'), CSS('--gold'), '#ff9f6f', '#8fd65a', '#6fb5ff', '#ffd1dc'];
    ep.forEach((e, k) => { ctx.strokeStyle = COLS[k % COLS.length]; ctx.lineWidth = 2; ctx.beginPath(); let pen = false; for (let i = e.iStart; i <= e.iEnd; i += 3) { const p = MIXMASTER.exponents(R, i, end); if (!p) continue; if (!pen) { ctx.moveTo(X(p), Y(p)); pen = true; } else ctx.lineTo(X(p), Y(p)); } ctx.stroke(); const pm = e.p; ctx.fillStyle = COLS[k % COLS.length]; ctx.beginPath(); ctx.arc(X(pm), Y(pm), 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '10px JetBrains Mono, monospace'; ctx.fillText(String(k + 1), X(pm) + 8, Y(pm) - 6); });
    // 当前点（速度指数）
    const c = cur(); if (c.p) { ctx.fillStyle = CSS('--gold'); ctx.beginPath(); ctx.arc(X(c.p), Y(c.p), 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#1a1200'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function epochTable() {
    const R = st.R, end = st.end, ep = (end === 'crunch' ? R.epochsCrunch : R.epochs).slice().reverse(); // 从起点往奇点方向
    if (!ep.length) { $('mix-epochs').innerHTML = '这一端没有找到 Kasner 时代。'; return; }
    const truncated = end === 'crunch' ? R.futStop === 'singularity' : R.pastStop === 'singularity'; let bad = 0, sens = false;
    let html = `<div style="color:var(--ink);font-weight:600;margin-bottom:4px">${end === 'crunch' ? '往大坍缩走' : '往大爆炸走'}，一个时代接一个（圆上的编号 ${ep.length} → 1）：</div><div class="mix-tbl"><table style="border-collapse:collapse;width:100%"><tr style="color:var(--dim)"><td>#</td><td>方程算出的 u</td><td>BKL 规则预言</td><td>p₁, p₂, p₃</td><td>跨 ln T</td></tr>`;
    let prev = null;
    ep.forEach((e, k) => { const last = k === ep.length - 1; let okk = '', pred = '—'; if (prev !== null) { const pr = MIXMASTER.bklMap(prev), tol = 0.05 + (prev < 2 ? 0.01 / (prev - 1) : 0); pred = sig(pr, 3); const ok = Math.abs(pr - e.u) / e.u < tol; okk = ok ? ' ✓' : ' ✗'; if (!ok) bad++; if (prev < 1.2) sens = true; } html += `<tr><td class="mono">${ep.length - k}</td><td class="mono" style="color:var(--ink)">${sig(e.u, 3)}</td><td class="mono">${pred}${okk}</td><td class="mono">${e.p.map((v) => v.toFixed(2)).join(', ')}</td><td class="mono">${last && truncated ? '≥ ' : ''}${(e.lnt1 - e.lnt0).toFixed(0)}</td></tr>`; prev = e.u; });
    html += '</table></div>';
    const notes = []; if (truncated) notes.push('最后一行的时代还没结束：算到体积 e⁻⁶⁵⁰ 就停了，所以写 ≥'); if (sens) notes.push('u 接近 1 时规则 1/(u−1) 对 u 的小误差极敏感，预言的容差相应放宽'); if (bad) notes.push(`✗ 是方程和规则差得超过容差的地方：${R.M > 0 || R.L > 0 ? '离奇点还不够近时尘埃或 Λ 还在起作用，' : ''}反弹之间的过渡段也可能混进来`);
    if (notes.length) html += `<div class="note" style="margin-top:4px">${notes.join('；')}。</div>`;
    if (st.chaos) html += st.chaos;
    $('mix-epochs').innerHTML = html;
  }
  function cards() {
    const R = st.R, K = [], life = R.tCrunch - R.tBang; let vmax = -Infinity; for (const y of R.y) vmax = Math.max(vmax, y[0] + y[1] + y[2]);
    K.push(['gold', '一生', isFinite(life) ? sig(life, 3) + '（G = c = 1 的单位）' : (R.Tbang ? '永远膨胀' : '—'), R.Tcrunch ? '从大爆炸到大坍缩' + (R.pastApprox || R.futApprox ? '（各向同性的尘埃在 τ 上走不到奇点：体积缩到 e⁻¹⁵ 以下就按剩余时间可忽略截断）' : '') : (R.L > 0 ? 'Λ 赢了：各向异性被抹平，走向 de Sitter' : '算到的范围里没到奇点')]);
    K.push(['teal', '最大体积 ln V', vmax.toFixed(2), R.M > 0 ? '尘埃越多，膨胀得越大' : '真空：曲率自己把它拉回来']);
    K.push(['violet', 'Kasner 时代数', `${R.epochs.length} / ${R.epochsCrunch.length}`, R.epochs.length + R.epochsCrunch.length ? '大爆炸一端 / 大坍缩一端（算到体积 e⁻⁶⁵⁰；只数跨 ln T > 5 的）' : (R.M > 0 && (R.pastApprox || R.futApprox) ? '各向同性：没有剪切就没有 Kasner 时代，直接压回奇点' : '算到的范围里没有找到')]);
    $('mix-cards').innerHTML = K.map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  // ---- 交互 ----
  const chips = $('mix-presets'); for (const p of PRESETS) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = p.id; b.innerHTML = `${p.name}<small>${p.sub}</small>`; b.addEventListener('click', () => { Object.assign(P, p.p); sync(); solveNow(); }); chips.appendChild(b); }
  for (const r of document.querySelectorAll('input[name=mix-mode]')) r.addEventListener('change', () => { if (r.checked) { P.mode = r.value; labels(); solveSoon(); } });
  const bind = (id, fn) => $(id).addEventListener('input', () => { fn(+$(id).value); labels(); solveSoon(); });
  bind('mix-u', (v) => { P.u = v; }); bind('mix-shear', (v) => { P.shear = v; }); bind('mix-chi', (v) => { P.chi = v; }); bind('mix-a0', (v) => { P.a0 = Math.pow(10, v); }); bind('mix-M', (v) => { P.M = v; }); bind('mix-L', (v) => { P.L = v; });
  $('mix-s').addEventListener('input', () => { st.i = +$('mix-s').value; st.playing = false; $('mix-play').textContent = '▶ 播放'; render(); });
  $('mix-end').addEventListener('change', () => { st.end = $('mix-end').value; render(); });
  $('mix-play').addEventListener('click', () => { st.playing = !st.playing; $('mix-play').textContent = st.playing ? '⏸ 暂停' : '▶ 播放'; if (st.playing) { if (st.i >= st.R.y.length - 1) st.i = 0; st.last = 0; st.raf = requestAnimationFrame(tick); } });
  function tick(now) { if (!st.playing || G.current !== 'mix') { st.playing = false; $('mix-play').textContent = '▶ 播放'; return; } const dt = st.last ? (now - st.last) / 1000 : 0; st.last = now; st.i += Math.round(dt * st.R.y.length / 12); if (st.i >= st.R.y.length - 1) { st.i = st.R.y.length - 1; st.playing = false; $('mix-play').textContent = '▶ 播放'; } $('mix-s').value = st.i; drawShape(); hud(); if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) { drawLog(); drawKasner(); } if (st.playing) st.raf = requestAnimationFrame(tick); }
  $('mix-next').addEventListener('click', () => { const nx = st.bounds.find((b) => b > st.i + 5); if (nx === undefined) { toast('往后没有反弹了：这一端已经算到头'); return; } st.i = nx; $('mix-s').value = st.i; st.playing = false; $('mix-play').textContent = '▶ 播放'; render(); });
  $('mix-chaos').addEventListener('click', () => {
    const q = params(); if (P.mode === 'kasner') q.u = P.u * (1 + 1e-6); else q.chi = P.chi + 1e-6; const R2 = MIXMASTER.solve(q); if (!R2) return;
    const a = st.R.epochs.slice().reverse().map((e) => e.u), b = R2.epochs.slice().reverse().map((e) => e.u); let k = 0; while (k < a.length && k < b.length && Math.abs(a[k] - b[k]) / a[k] < 0.03) k++;
    const fmt = (arr, k) => arr.map((u, i) => (i >= k ? `<b style="color:var(--coral)">${sig(u, 4)}</b>` : sig(u, 4))).join(' → ');
    // 方程只能算到体积 e⁻⁶⁵⁰；再往下按 BKL 规则外推，看两条序列什么时候分开
    const ext = (u0, n) => { const out = []; let u = u0; for (let i = 0; i < n; i++) { out.push(u); u = MIXMASTER.bklMap(u); if (!isFinite(u) || u > 1e6) break; } return out; };
    const ea = ext(a.length ? a[0] : P.u, 14), eb = ext(b.length ? b[0] : q.u, 14); let m = 0; while (m < ea.length && m < eb.length && Math.abs(ea[m] - eb[m]) / ea[m] < 0.03) m++;
    st.chaos = `<div style="margin-top:8px;color:var(--ink)">混沌检验（往大爆炸走的 u 序列）：</div><div class="mono">方程 · 原来：${fmt(a, k)}</div><div class="mono">方程 · u×(1+10⁻⁶)：${fmt(b, k)}</div><div>${k < Math.min(a.length, b.length) ? `第 ${k + 1} 个时代起分道扬镳。` : '方程算到的这几个时代还没分开（体积已缩到 e⁻⁶⁵⁰）；按 BKL 规则继续跳：'}</div><div class="mono">规则 · 原来：${fmt(ea, m)}</div><div class="mono">规则 · 微扰：${fmt(eb, m)}</div><div>${m < Math.min(ea.length, eb.length) ? `第 ${m + 1} 个时代起分道扬镳：10⁻⁶ 的差别，${m} 次反弹后就放大成完全不同的宇宙。` : '连分数的前十几位一样，再往后才分开。'}</div>`;
    $('mix-chaos-out').innerHTML = '结果写在下面 ③ 的时代表底下 ↓'; epochTable(); const tb = $('mix-epochs'); if (tb && tb.scrollIntoView) tb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  const cv = $('c-mix-shape');
  cv.addEventListener('pointerdown', (e) => { st.drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (!st.drag) return; st.yaw = st.drag.yaw + (e.clientX - st.drag.x) * 0.01; st.pitch = clamp(st.drag.pitch + (e.clientY - st.drag.y) * 0.01, -1.4, 1.4); drawShape(); });
  cv.addEventListener('pointerup', () => { st.drag = null; }); cv.addEventListener('pointercancel', () => { st.drag = null; }); cv.style.touchAction = 'none';
  window.addEventListener('resize', () => { if (G.current === 'mix') render(); });
  function enter() { if (!st.R) { sync(); solveNow(); } else render(); }
  function leave() { st.playing = false; $('mix-play').textContent = '▶ 播放'; }
  window.GENESIS_HALLS = window.GENESIS_HALLS || []; window.GENESIS_HALLS.push((hall) => { G.current = hall; if (hall === 'mix') enter(); else leave(); });
})();
