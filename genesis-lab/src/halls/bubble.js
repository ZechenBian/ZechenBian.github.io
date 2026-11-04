// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 泡泡宇宙展区的页面逻辑：引擎在 bubble.js；这里管泡沫动画、假真空份额图、泡内宇宙、景观彩票。
(function () {
  const G = window.GENESIS, $ = G.$, chart = G.chart, fit = G.fit, sig = G.sig, CSS = G.CSS, toast = G.toast;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const st = { lam: 0.1, land: true, foam: null, playing: false, raf: 0, last: 0, N: 62, hist: [], lastFrac: null, seed: 1, lamCache: new Map(), tries: 0, flashes: [], moved: false };
  // 景观：每个泡的 Λ（相对我们的）从平坦先验 [−5, 300] 抽
  const lamSampler = (rnd) => -5 + 305 * rnd();
  // Λ 相对倍数 x → 创世台参数（物质密度和原初幅度取我们的，保持平坦）
  //   x ≥ 0："今天"取物质密度等于我们今天的那一刻：Ω_m' = 0.315/S，Ω_Λ' = 0.685x/S，H₀' = 67.4√S，S = 0.315 + 0.685x
  //   x < 0：这样的宇宙会回缩，可能根本到不了我们的物质密度，所以把参考时刻放在 ρ_m = 2|ρ_Λ|（回转之前）：Ω_m' = 2，Ω_Λ' = −1，H₀' = 67.4√(0.685|x|)；
  //         那一刻的尺度因子（以我们的为 1）a_ref = [0.315/(2·0.685|x|)]^{1/3}，辐射按 a_ref⁻⁴ 换算；判决看整个一生里扰动最高长到多少，和参考时刻无关
  function paramsFor(x, Ok) {
    const tot = 1 - Math.min(Ok || 0, 0.999);
    if (x >= 0) { const S = 0.315 + 0.685 * x; return { H0: 67.4 * Math.sqrt(S), Om: 0.315 / S * tot, OL: 0.685 * x / S * tot, Or: 9e-5 / S, w: -1, aRef: 1 }; }
    const ax = Math.cbrt(0.315 / (2 * 0.685 * Math.abs(x))), c = 0.685 * Math.abs(x);
    return { H0: 67.4 * Math.sqrt(c), Om: 2 * tot, OL: -1 * tot, Or: 9e-5 * Math.pow(ax, -4) / c, w: -1, aRef: ax };
  }
  function verdictFor(x) {
    const key = Math.round(Math.log(Math.abs(x) + 1e-3) * 10) * Math.sign(x || 1); if (st.lamCache.has(key)) return st.lamCache.get(key);
    let v;
    { try { const P = paramsFor(x, 0); const R = COSMO.solve({ H0: P.H0, Om: P.Om, OL: P.OL, Or: P.Or, w: -1 }, { lite: true }), g = R.growth;
      // 温伯格式的判决看星系尺度（10¹² M☉）：1σ 峰能坍缩 = 星系像我们这里一样常见；只有 3σ 峰能 = 星系稀有；都不能 = 没有星系
      if (R.verdict === 'dead' || !g) { const d = R.diag.find((q) => q.level === 'bad'); v = { verdict: 'dead', why: d ? d.title : '死寂' }; }
      else if (g.dGalMax >= COSMO.DELTA_C) v = { verdict: 'alive', why: '典型星系（1σ 峰）能形成，星系遍地' };
      else if (3 * g.dGalMax >= COSMO.DELTA_C) v = { verdict: 'marginal', why: '只有稀有的 3σ 峰来得及坍缩成星系，然后 Λ 把一切冻住' };
      else v = { verdict: 'dead', why: (x < 0 ? '|Λ| 太大：还没长出星系就回缩了' : 'Λ 太大：连 3σ 峰都没长到坍缩阈值') }; if (x < 0 && v.verdict !== 'dead') v.why += `（Λ < 0：这个宇宙会在 ${sig((R.tEnd + R.age) * COSMO.GYR / P.H0, 2)} Gyr 后大坍缩）`; } catch (e) { v = { verdict: 'dead', why: '解不出' }; } }
    st.lamCache.set(key, v); return v;
  }
  const VCOL = { alive: '#f2c14e', marginal: '#9a7b2e', dead: '#5a5f78' };
  function reset() { st.foam = new BUBBLE.Foam2D({ lam2: st.lam, W: 24, seed: st.seed, lamSampler: st.land ? lamSampler : null }); st.hist = []; st.lastFrac = null; st.flashes = []; st.moved = false; $('bub-move').hidden = true; $('bub-forge-note').textContent = ''; render(); }
  function labels() { $('bub-v-lam').textContent = sig(st.lam, 3) + (st.lam < 2 / Math.PI ? '（永恒）' : '（会终止）'); $('bub-v-N').textContent = st.N.toFixed(1); }
  function render() { drawFoam(); hud(); drawSurv(); inside(); landscape(); }
  function drawFoam() {
    const cv = $('c-bub-foam'), { ctx, w, h } = fit(cv), F = st.foam; ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    const sc = Math.min(w, h) / F.W, cx = w / 2, cy = h / 2;
    // 假真空底色：淡紫（de Sitter）
    ctx.fillStyle = 'rgba(176,140,255,0.10)'; ctx.fillRect(0, 0, w, h);
    const bs = F.bubbles.slice().sort((a, b) => a.tn - b.tn); // 老泡先画
    for (const b of bs) { const p = F.phys(b); const x = cx + p.x * sc, y = cy + p.y * sc, R = p.R * sc; if (R < 0.3) continue;
      const v = st.land ? verdictFor(b.lam) : null; const col = v ? VCOL[v.verdict] : '#5fe0cf';
      ctx.fillStyle = v ? (v.verdict === 'dead' ? 'rgba(10,12,24,0.95)' : 'rgba(30,26,10,0.95)') : 'rgba(8,20,24,0.95)'; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      if (st.land && R > 26 && (Math.abs(y - cy) > 18 || Math.abs(x - cx) > 60)) { ctx.fillStyle = col; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(`Λ = ${sig(b.lam, 2)}×`, x, y + 4); } } // 挨着"你"的标签就不写，免得叠在一起
    // 碰撞线（最近的）
    const now = F.t; st.flashes = st.flashes.filter((f) => now - f.t < 1.2);
    for (const f of st.flashes) { const A = F.bubbles.find((b) => b.id === f.a), B = F.bubbles.find((b) => b.id === f.b); if (!A || !B) continue; const pa = F.phys(A), pb = F.phys(B); const d = Math.hypot(pb.x - pa.x, pb.y - pa.y); if (d < 1e-9) continue; const aa = (pa.R * pa.R - pb.R * pb.R + d * d) / (2 * d), hh2 = pa.R * pa.R - aa * aa; if (hh2 <= 0) continue; const hh = Math.sqrt(hh2), ux = (pb.x - pa.x) / d, uy = (pb.y - pa.y) / d, mx = pa.x + ux * aa, my = pa.y + uy * aa;
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - (now - f.t) / 1.2)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + (mx - uy * hh) * sc, cy + (my + ux * hh) * sc); ctx.lineTo(cx + (mx + uy * hh) * sc, cy + (my - ux * hh) * sc); ctx.stroke(); }
    // 你
    ctx.fillStyle = F.engulfed ? CSS('--coral') : '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '600 12px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(F.engulfed ? '你（已在泡里）' : '你（假真空）', cx, cy - 9);
    // 哈勃半径比例尺
    ctx.strokeStyle = CSS('--gold'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, h - 14); ctx.lineTo(12 + sc, h - 14); ctx.stroke(); ctx.fillStyle = CSS('--gold'); ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('1/H（哈勃半径）', 12, h - 20);
    ctx.fillStyle = CSS('--dim'); ctx.textAlign = 'right'; ctx.fillText(st.land ? '亮金 = 星系遍地　暗金 = 只有稀有星系　灰 = 没有星系' : '青 = 真空泡（里面是开放宇宙）', w - 10, h - 8);
  }
  function hud() {
    const F = st.foam, p = BUBBLE.survival2(st.lam, F.t), e = BUBBLE.eternal2(st.lam);
    $('bub-t').textContent = `Ht = ${F.t.toFixed(2)}`;
    const filled = st.lastFrac !== null && st.lastFrac < 0.05;
    const K = [['gold', '窗口里的泡', String(F.bubbles.length), `累计成核 ${F.nNuc}，碰撞 ${F.collisions.length} 次`], ['teal', '窗口里的假真空份额', st.lastFrac === null ? '—' : (st.lastFrac * 100).toFixed(0) + '%', st.moved ? `解析 p(t) = ${(p * 100).toFixed(0)}%；换过点之后窗口是围着一个还活着的点取的，份额必然偏高，不再和 p(t) 可比` : `解析 p(t) = ${(p * 100).toFixed(0)}%；单次模拟涨落大：早成核的一个大泡就能吃掉一大片`], [e.eternal ? 'violet' : 'coral', '全空间的假真空面积', `∝ e^{${e.exponent.toFixed(2)}·Ht}`, e.eternal ? ('指数为正：暴胀永恒，泡永远填不满全空间' + (filled ? '——窗口是固定物理大小的一小块，被填满只是你这一块到头了；窗口外空间翻了 e^{2Ht} 倍，新泡还在无穷无尽地冒' : '')) : '指数为负：泡会填满空间，暴胀终止']];
    $('bub-forge').disabled = !F.engulfed; $('bub-forge').textContent = F.engulfed ? `把这个泡（Λ = ${st.land ? sig(F.engulfed.bubble.lam, 2) + '× 我们的' : '我们的'}）里的宇宙装进创世台 →` : '被吞没后：把这个泡里的宇宙装进创世台 →';
    if (F.engulfed) { const b = F.engulfed.bubble, v = st.land ? verdictFor(b.lam) : null; K.push([v ? (v.verdict === 'alive' ? 'gold' : (v.verdict === 'marginal' ? 'violet' : 'coral')) : 'teal', '你被吞没了', `Ht = ${F.engulfed.t.toFixed(2)}${st.land ? `，这个泡的 Λ = ${sig(b.lam, 2)}× 我们的` : ''}`, v ? (v.verdict === 'alive' ? '运气好：' + v.why : (v.verdict === 'marginal' ? '勉强：' + v.why : `死寂：${v.why}`)) : '这里暴胀结束，一个开放宇宙开始']); $('bub-move').hidden = false; }
    $('bub-hud').innerHTML = K.map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  function drawSurv() {
    const cv = $('c-bub-surv'), T = Math.max(6, st.foam.t + 0.5), xs = [], ys = []; for (let i = 0; i <= 100; i++) { const t = T * i / 100; xs.push(t); ys.push(BUBBLE.survival2(st.lam, t)); }
    chart(cv, { xmin: 0, xmax: T, ymin: 0, ymax: 1.05, xlabel: 'Ht', ylabel: '还在假真空的概率', padL: 44, series: [{ xs, ys, color: CSS('--gold') }], points: st.hist.length ? [{ xs: st.hist.map((h) => h[0]), ys: st.hist.map((h) => h[1]), color: CSS('--teal'), r: 2.5 }] : [], vlines: [{ x: st.foam.t, color: CSS('--dim') }] });
    { const { ctx, w, h } = fit(cv); ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('现在', 44 + (w - 44 - 14) * st.foam.t / T, h - 36); }
    const e2 = BUBBLE.eternal2(st.lam);
    $('bub-fate').innerHTML = [[e2.eternal ? 'violet' : 'coral', '二维切片', `2 − πλ/H³ = ${e2.exponent.toFixed(2)}`, `阈值 λ/H³ = 2/π = ${e2.critical.toFixed(3)}`], ['violet', '三维的同一条规则', '3 − (4π/3)λ/H⁴', `阈值 λ/H⁴ = 9/4π = ${(9 / (4 * Math.PI)).toFixed(3)}（Guth & Weinberg 1983）`]].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  function inside() {
    const F = st.foam, Ok = BUBBLE.interiorCurvature(st.N), Rc = Ok > 0 ? 1 / Math.sqrt(Ok) * 299792.458 / 67.4 / 1000 : Infinity; const K = [];
    K.push(['teal', '今天的曲率 Ω_k', Ok >= 1 ? '≈ 1（曲率主导，没长出结构）' : sig(Ok, 2), Ok >= 1 ? '泡里暴胀太短' : `开放宇宙，曲率半径 ≈ ${sig(Rc, 2)} Gpc；Planck 的上限 |Ω_k| < 0.002 ${Ok < 0.002 ? '✓' : '✗（会被测到）'}`]);
    if (F.engulfed) { const b = F.engulfed.bubble; if (st.land) { const v = verdictFor(b.lam); K.push([v.verdict === 'alive' ? 'gold' : (v.verdict === 'marginal' ? 'violet' : 'coral'), '你的泡抽到的 Λ', `${sig(b.lam, 2)} × 我们的`, v.verdict === 'alive' ? '星系遍地——第 ' + st.tries + ' 个泡才抽到' : (v.verdict === 'marginal' ? `只有稀有星系（已经试了 ${st.tries} 个泡）` : `死寂：${v.why}（已经试了 ${st.tries} 个泡）`)]); } K.push(['violet', '这个泡撞过别的泡', `${b.hit.size} 次`, b.hit.size ? 'CMB 上会有圆盘状的温度斑（AJK 2007）' : '没有碰撞印记']); }
    else K.push(['gold', '你还在假真空里', '等着被吞', '或者按播放']);
    $('bub-inside').innerHTML = K.map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  function landscape() {
    const cv = $('c-bub-land'), { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
    if (!st.land) { ctx.fillStyle = CSS('--dim'); ctx.font = '13px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('勾上①里的"景观"再看', w / 2, h / 2); $('bub-landcards').innerHTML = ''; return; }
    // 先验 [−5, 300]：按 x 分 60 格，每格判一次（缓存）
    const n = 120, padL = 40, padB = 30, pw = w - padL - 12, ph = h - 16 - padB; let alive = 0, marg = 0, firstBad = null, firstMarg = null;
    for (let i = 0; i < n; i++) { const x = -5 + 305 * (i + 0.5) / n, v = verdictFor(x); if (v.verdict === 'alive') alive++; else if (v.verdict === 'marginal') marg++; if (x > 1 && v.verdict === 'dead' && firstBad === null) firstBad = x; if (x > 1 && v.verdict !== 'alive' && firstMarg === null) firstMarg = x; ctx.fillStyle = VCOL[v.verdict]; ctx.fillRect(padL + pw * i / n, 16, pw / n + 0.5, ph); }
    ctx.fillStyle = CSS('--dim'); ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'center'; for (const x of [0, 50, 100, 150, 200, 250, 300]) ctx.fillText(String(x), padL + pw * (x + 5) / 305, h - padB + 14);
    ctx.font = '12px Space Grotesk, sans-serif'; ctx.fillText('Λ / Λ_我们（平坦先验 −5 … 300）', padL + pw / 2, h - 4);
    const xo = padL + pw * 6 / 305; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xo, 10); ctx.lineTo(xo, 16 + ph); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText('我们 (1×)', xo + 4, 12);
    // 边界标注（亮金段太窄，单靠颜色看不见）
    ctx.font = '10px JetBrains Mono, monospace'; if (firstMarg !== null) { const xm = padL + pw * (firstMarg + 5) / 305; ctx.fillStyle = VCOL.alive; ctx.textAlign = 'left'; ctx.fillText(`遍地 ≲ ${sig(firstMarg, 2)}×`, xm + 3, 44); } if (firstBad !== null) { const xb = padL + pw * (firstBad + 5) / 305; ctx.strokeStyle = '#fff'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(xb, 16); ctx.lineTo(xb, 16 + ph); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(`有星系 ≲ ${sig(firstBad, 3)}×`, xb - 3, 28); }
    // 泡的样本直方（当前窗口里的泡）
    const F = st.foam; ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (const b of F.bubbles) { const u = (b.lam + 5) / 305; ctx.fillRect(padL + pw * u, 16 + ph - 6, 2, 6); }
    $('bub-landcards').innerHTML = [['gold', '有星系的 Λ', firstBad !== null ? `Λ ≲ ${sig(firstBad, 3)} × 我们的` : '整条先验都行', `温伯格 1987 年的粗略上限是观测值的几百倍（要求 z ≈ 4 前能形成星系）；星系像我们这里一样遍地则要 Λ ≲ ${firstMarg !== null ? sig(firstMarg, 2) : '?'}×；负的 Λ 让宇宙回缩，|Λ| 不太大时星系照样形成`], ['coral', '彩票中奖率', `${(alive / n * 100).toFixed(0)}% / ${((alive + marg) / n * 100).toFixed(0)}%`, `星系遍地 / 至少有稀有星系；画面里的泡：${F.bubbles.filter((b) => verdictFor(b.lam).verdict === 'alive').length} 遍地、${F.bubbles.filter((b) => verdictFor(b.lam).verdict === 'marginal').length} 稀有、${F.bubbles.filter((b) => verdictFor(b.lam).verdict === 'dead').length} 死寂`]].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono" style="font-size:15px">${v}</b><i>${i}</i></div>`).join('');
  }
  function tick(now) {
    if (!st.playing || G.current !== 'bubble') { st.playing = false; $('bub-play').textContent = '▶ 播放'; return; }
    const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0; st.last = now; const F = st.foam, before = F.collisions.length, wasEng = !!F.engulfed;
    F.step(dt * 0.6); for (let k = before; k < F.collisions.length; k++) st.flashes.push(F.collisions[k]);
    if (!wasEng && F.engulfed) { st.tries++; toast('你被一个真空泡吞没了——这里暴胀结束'); }
    if (Math.floor(F.t * 4) !== Math.floor((F.t - dt * 0.6) * 4)) { st.lastFrac = F.falseFraction(1500); st.hist.push([F.t, st.lastFrac]); drawSurv(); inside(); landscape(); }
    drawFoam(); hud(); st.raf = requestAnimationFrame(tick);
  }
  $('bub-play').addEventListener('click', () => { st.playing = !st.playing; $('bub-play').textContent = st.playing ? '⏸ 暂停' : '▶ 播放'; if (st.playing) { st.last = 0; st.raf = requestAnimationFrame(tick); } });
  $('bub-reset').addEventListener('click', () => { st.seed = (st.seed * 13 + 5) % 1009 + 1; st.tries = 0; reset(); });
  $('bub-move').addEventListener('click', () => { if (st.foam.relocate()) { $('bub-move').hidden = true; st.moved = true; $('bub-forge-note').textContent = ''; render(); toast('换到了一个还在假真空的点'); } else toast('窗口里已经没有假真空了：按重来'); });
  $('bub-lam').addEventListener('input', () => { st.lam = Math.pow(10, +$('bub-lam').value); labels(); st.foam.lam = st.lam; drawSurv(); hud(); });
  $('bub-land').addEventListener('change', () => { st.land = $('bub-land').checked; reset(); });
  $('bub-N').addEventListener('input', () => { st.N = +$('bub-N').value; labels(); inside(); });
  $('bub-forge').addEventListener('click', () => { // 装进创世台：和④的判决用同一套换算（paramsFor），物质密度和辐射取我们的，Ω_m + Ω_Λ = 1 − Ω_k
    const Ok = BUBBLE.interiorCurvature(st.N), F = st.foam; if (!F.engulfed) { toast('还在假真空里：等被吞没，或按播放'); return; } const x = st.land ? F.engulfed.bubble.lam : 1, P = paramsFor(x, Ok);
    G.forge.setParams({ H0: +P.H0.toFixed(2), Om: +P.Om.toFixed(4), OL: +P.OL.toFixed(4), Or: +P.Or.toPrecision(3), w: -1 }); $('bub-forge-note').textContent = `已装入：H₀′ = ${P.H0.toFixed(1)}，Ω_m = ${P.Om.toFixed(4)}，Ω_Λ = ${P.OL.toFixed(3)}，Ω_k ≈ ${Ok.toExponential(1)}` + (x < 0 ? `（Λ < 0：参考时刻取 ρ_m = 2|ρ_Λ|，a_ref = ${P.aRef.toFixed(2)}）` : '（物质密度取我们的，所以 H₀′ = 67.4√(0.315+0.685x)）'); G.show('forge'); window.scrollTo({ top: 0 }); });
  window.addEventListener('resize', () => { if (G.current === 'bubble') render(); });
  function enter() { if (!st.foam) { labels(); reset(); } else render(); }
  function leave() { st.playing = false; $('bub-play').textContent = '▶ 播放'; }
  window.GENESIS_HALLS = window.GENESIS_HALLS || []; window.GENESIS_HALLS.push((hall) => { G.current = hall; if (hall === 'bubble') enter(); else leave(); });
})();
