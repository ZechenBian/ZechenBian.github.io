// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
// 页面逻辑：三个展区的交互与绘制。引擎在 cosmo.js / godel.js，数据在 presets.js / puzzles.js。
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const store = { get(k, d) { try { const v = localStorage.getItem('genesis.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('genesis.' + k, JSON.stringify(v)); } catch (e) { /* 无妨 */ } } };
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CSS = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let toastT = null;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }
  // 数字格式
  function sig(v, n) { if (!isFinite(v)) return v > 0 ? '∞' : (v < 0 ? '−∞' : '—'); const a = Math.abs(v); if (a === 0) return '0'; if (a >= 1e5 || a < 1e-3) return v.toExponential(n - 1).replace('e+', 'e'); return String(+v.toPrecision(n)); }
  function gyr(v) { // 以 Gyr 计的时间，自动选单位
    if (!isFinite(v)) return '∞'; const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a < 1e-6) return s + sig(a * 1e9, 3) + ' 年'; if (a < 1e-3) return s + sig(a * 1e6, 3) + ' 千年'; if (a < 1) return s + sig(a * 1e3, 3) + ' Myr';
    if (a < 1e4) return s + sig(a, 3) + ' Gyr'; return s + sig(a / 1e3, 3) + ' Tyr';
  }
  // 画布：按 CSS 宽度和 DPR 设置后备存储，返回 ctx 和逻辑尺寸
  function fit(cv) {
    const w = cv.clientWidth || +cv.getAttribute('width'), ratio = +cv.getAttribute('height') / +cv.getAttribute('width'), minH = +(cv.dataset.minh || 0);
    const h = Math.round(Math.max(w * ratio, minH)); if (minH && w * ratio < minH) cv.style.height = h + 'px'; else cv.style.height = '';
    const bw = Math.round(w * DPR), bh = Math.round(h * DPR);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const ctx = cv.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); return { ctx, w, h };
  }
  // ---------- 通用图表 ----------
  function chart(cv, o) {
    const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h);
    const padL = o.padL || 52, padR = 14, padT = 12, padB = o.xlabel ? 34 : 22, pw = w - padL - padR, ph = h - padT - padB;
    const xl = o.xlog, yl = o.ylog;
    const fx = (x) => xl ? Math.log10(x) : x, fy = (y) => yl ? Math.log10(y) : y;
    let xmin = o.xmin, xmax = o.xmax, ymin = o.ymin, ymax = o.ymax;
    const X = (x) => padL + (fx(x) - fx(xmin)) / (fx(xmax) - fx(xmin)) * pw, Y = (y) => padT + ph - (fy(y) - fy(ymin)) / (fy(ymax) - fy(ymin)) * ph;
    ctx.font = '11px JetBrains Mono, monospace'; ctx.fillStyle = CSS('--dim'); ctx.strokeStyle = CSS('--line'); ctx.lineWidth = 1;
    // 刻度
    const ticks = (lo, hi, log) => {
      if (log) { const out = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) { const v = Math.pow(10, e); if (v >= lo / 1.0001 && v <= hi * 1.0001) out.push(v); } if (out.length < 3) { const extra = []; for (const v of out) for (const m of [2, 5]) if (v * m >= lo && v * m <= hi) extra.push(v * m); return out.concat(extra).sort((a, b) => a - b); } return out; }
      const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 4))), cand = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 7) || step * 10; const out = [];
      for (let v = Math.ceil(lo / cand) * cand; v <= hi + 1e-9; v += cand) out.push(+v.toFixed(10)); return out;
    };
    const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', logLabel = (v) => { const e = Math.round(Math.log10(v)); if (Math.abs(v / Math.pow(10, e) - 1) > 1e-6) return sig(v, 2); if (e >= -2 && e <= 3) return sig(v, 3); return '10' + String(e).replace('-', '⁻').replace(/\d/g, (d) => SUP[+d]); };
    for (const v of ticks(xmin, xmax, xl)) { const x = X(v); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText(xl ? logLabel(v) : sig(v, 3), x, padT + ph + 14); }
    for (const v of ticks(ymin, ymax, yl)) { const y = Y(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(yl ? logLabel(v) : sig(v, 3), padL - 6, y + 4); }
    if (o.xlabel) { ctx.textAlign = 'center'; ctx.fillStyle = CSS('--dim'); ctx.font = '12px Space Grotesk, sans-serif'; ctx.fillText(o.xlabel, padL + pw / 2, h - 6); }
    if (o.ylabel) { ctx.save(); ctx.translate(12, padT + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = '12px Space Grotesk, sans-serif'; ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
    ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, pw, ph); ctx.clip();
    for (const hl of (o.hlines || [])) { ctx.strokeStyle = hl.color; ctx.setLineDash(hl.dash || [5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(padL, Y(hl.y)); ctx.lineTo(padL + pw, Y(hl.y)); ctx.stroke(); ctx.setLineDash([]); if (hl.label) { ctx.fillStyle = hl.color; ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(hl.label, padL + 4, Y(hl.y) - 4); } }
    for (const vl of (o.vlines || [])) { if (!isFinite(vl.x) || vl.x <= 0 && xl) continue; ctx.strokeStyle = vl.color; ctx.setLineDash(vl.dash || [3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(vl.x), padT); ctx.lineTo(X(vl.x), padT + ph); ctx.stroke(); ctx.setLineDash([]); if (vl.label) { ctx.save(); ctx.fillStyle = vl.color; ctx.font = '11px Space Grotesk, sans-serif'; ctx.translate(X(vl.x) + 3, padT + 4); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left'; ctx.fillText(vl.label, 0, 0); ctx.restore(); } }
    for (const s of (o.series || [])) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []); ctx.beginPath(); let pen = false;
      for (let i = 0; i < s.xs.length; i++) { const x = s.xs[i], y = s.ys[i]; if (!isFinite(x) || !isFinite(y) || (xl && x <= 0) || (yl && y <= 0)) { pen = false; continue; } const px = X(x), py = Y(y); if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    for (const p of (o.points || [])) {
      ctx.strokeStyle = p.color; ctx.fillStyle = p.color; ctx.lineWidth = 1;
      for (let i = 0; i < p.xs.length; i++) { const x = X(p.xs[i]), y = Y(p.ys[i]); if (p.es) { const e = p.es[i]; ctx.beginPath(); ctx.moveTo(x, Y(p.ys[i] - e)); ctx.lineTo(x, Y(p.ys[i] + e)); ctx.stroke(); } ctx.beginPath(); ctx.arc(x, y, p.r || 2.5, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const mk of (o.marks || [])) { if (!isFinite(mk.x) || !isFinite(mk.y)) continue; ctx.fillStyle = mk.color; ctx.beginPath(); ctx.arc(X(mk.x), Y(mk.y), 4, 0, Math.PI * 2); ctx.fill(); if (mk.label) { ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(mk.label, X(mk.x) + 6, Y(mk.y) - 6); } }
    ctx.restore();
    return { X, Y, padL, padT, pw, ph };
  }

  // ---------- 导航 ----------
  const halls = ['overview', 'forge', 'godel', 'inverse'];
  let current = null;
  function show(hall) {
    if (!halls.includes(hall)) hall = 'overview';
    for (const h of halls) $('hall-' + h).hidden = h !== hall;
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.hall === hall);
    current = hall; store.set('hall', hall); try { if (location.hash !== '#' + hall) history.replaceState(null, '', '#' + hall); } catch (e) { /* 无妨 */ }
    if (hall === 'forge') forge.render(); if (hall === 'godel') godel.enter(); else godel.leave(); if (hall === 'inverse') inverse.render();
  }
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { show(b.dataset.hall); window.scrollTo({ top: 0 }); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { e.preventDefault(); show(b.dataset.go); window.scrollTo({ top: 0 }); } });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (halls.includes(h) && h !== current) show(h); });

  // ======================================================================
  // 创世台
  // ======================================================================
  const forge = (function () {
    const S = Object.assign({}, PRESETS[0].p);
    const TODAY = 299; let R = null, frames = [], frame = TODAY, playing = false, alog = false, presetId = 'planck', galaxies = null, lastDraw = 0;
    const ids = ['H0', 'Om', 'Or', 'OL', 'w'];
    function toSlider(k, v) { return k === 'Or' ? (v <= 0 ? -7 : Math.max(-7, Math.log10(v))) : v; }
    function fromSlider(k, v) { return k === 'Or' ? (v <= -7 ? 0 : Math.pow(10, v)) : v; }
    function syncSliders() { for (const k of ids) $('s-' + k).value = toSlider(k, S[k]); labels(); }
    function labels() {
      $('v-H0').textContent = S.H0.toFixed(1) + ' km/s/Mpc'; $('v-Om').textContent = S.Om.toFixed(3); $('v-Or').textContent = S.Or === 0 ? '0' : S.Or.toExponential(2);
      $('v-OL').textContent = S.OL.toFixed(3); $('v-w').textContent = S.w.toFixed(2);
      const Ok = 1 - S.Om - S.Or - S.OL; $('v-Ok').textContent = (Ok >= 0 ? '+' : '') + Ok.toFixed(3);
      $('v-Okword').textContent = Math.abs(Ok) < 1e-3 ? '平坦（欧几里得空间）' : (Ok > 0 ? '开放（双曲空间，负曲率）' : '封闭（三维球面，正曲率）');
    }
    for (const k of ids) $('s-' + k).addEventListener('input', () => { S[k] = fromSlider(k, +$('s-' + k).value); presetId = null; markPreset(); labels(); solve(); });
    function markPreset() { for (const b of document.querySelectorAll('#presets .chip')) b.classList.toggle('on', b.dataset.id === presetId); const pr = PRESETS.find((p) => p.id === presetId); $('preset-blurb').innerHTML = pr ? `<b style="color:var(--ink)">${pr.name}</b>${pr.real ? ' <span class="tag real">真实</span>' : ' <span class="tag sim">理想化</span>'} — ${pr.blurb}${pr.source ? `<br><span style="color:var(--faint)">来源：${pr.source}</span>` : ''}` : '（自定义参数）'; }
    const chips = $('presets');
    for (const p of PRESETS) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = p.id; b.innerHTML = `${p.name}<small>${p.sub}</small>`; b.addEventListener('click', () => applyPreset(p.id)); chips.appendChild(b); }
    function applyPreset(id) { const p = PRESETS.find((x) => x.id === id); if (!p) return; Object.assign(S, p.p); presetId = id; markPreset(); syncSliders(); frame = TODAY; solve(); }
    $('b-planck').addEventListener('click', () => applyPreset('planck'));
    $('b-dice').addEventListener('click', () => {
      const r = Math.random; S.H0 = +(30 + 80 * r()).toFixed(1); S.Om = +(Math.pow(10, -2.5 + 3.5 * r())).toFixed(3); S.Or = +Math.pow(10, -6 + 5.5 * r()).toExponential(2);
      S.OL = +((r() < 0.75 ? 1 : -1) * Math.pow(10, -2 + 3.3 * r())).toFixed(3); S.OL = Math.max(-3, Math.min(3, S.OL)); S.w = +(-1.7 + 1.5 * r()).toFixed(2);
      presetId = null; markPreset(); syncSliders(); frame = TODAY; solve(); toast('掷出了一个宇宙——看看它活不活得了');
    });
    // ---- 求解与帧 ----
    function solve() {
      R = COSMO.solve(S);
      buildFrames(); render();
    }
    function buildFrames() {
      frames = []; const N = 300;
      // 过去：有大爆炸 → ln a 均匀；否则按时间均匀
      if (R.origin === 'bigbang') { const l0 = Math.log(1e-6); for (let i = 0; i < N; i++) { const a = Math.exp(l0 + (0 - l0) * i / (N - 1)); frames.push({ t: COSMO.tOfA(R, a), a }); } }
      else { const tMin = Math.max(R.past.ts[R.past.ts.length - 1], -12); for (let i = 0; i < N; i++) { const t = tMin + (0 - tMin) * i / (N - 1); frames.push({ t, a: aAt(R.past, t) }); } }
      // 未来
      if (R.fate === 'crunch') { for (let i = 1; i <= N; i++) { const t = R.tEnd * i / N; frames.push({ t, a: aAt(R.fut, t) }); } }
      else { const aMax = R.fate === 'rip' ? 1e3 : 30; for (let i = 1; i <= N; i++) { const a = Math.exp(Math.log(aMax) * i / N); const t = COSMO.tFutOfA(R, a); frames.push({ t: isFinite(t) ? t : R.fut.ts[R.fut.ts.length - 1], a }); } }
      if (frame > frames.length - 1) frame = TODAY;
    }
    function aAt(branch, t) { // 在一条分支里按 t 插值 a
      const { ts, as } = branch; const dir = ts[ts.length - 1] >= ts[0] ? 1 : -1; let lo = 0, hi = ts.length - 1;
      if (dir > 0) { if (t <= ts[0]) return as[0]; if (t >= ts[hi]) return as[hi]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; } }
      else { if (t >= ts[0]) return as[0]; if (t <= ts[hi]) return as[hi]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] >= t) lo = m; else hi = m; } }
      const f = (t - ts[lo]) / (ts[hi] - ts[lo]); return as[lo] + (as[hi] - as[lo]) * f;
    }
    // ---- 绘制 ----
    function render() { if (!R) return; drawMovie(); fateCards(); drawA(); drawGrowth(); diag(); eqs(); timeline(); }
    function GYR() { return COSMO.GYR / S.H0; }
    function fateCards() {
      const g = GYR(), m = R.m, cards = [];
      const age = R.origin === 'bigbang' ? gyr(R.age * g) : (R.origin === 'bounce' ? '无大爆炸' : '无限');
      cards.push({ c: 'gold', k: '年龄', v: age, i: R.origin === 'bigbang' ? '从奇点到今天' : (R.origin === 'bounce' ? `在 a = ${sig(R.aMin, 2)} 反弹，${gyr(R.tBounce * g)}前` : '密度不发散，没有奇点') });
      let fate, fi;
      if (R.fate === 'crunch') { fate = '大坍缩'; fi = `${gyr(R.tEnd * g)}后压回奇点；先膨胀到 a = ${sig(R.aMax, 3)}（${gyr(R.tTurn * g)}后回转）`; }
      else if (R.fate === 'rip') { fate = '大撕裂'; fi = `${gyr(R.tEnd * g)}后 a → ∞`; }
      else { fate = R.accelerating ? '永远膨胀（加速）' : '永远膨胀（减速或匀速）'; fi = R.accelerating ? '暗能量主导，走向 de Sitter 式的空寂' : '没有事件视界'; }
      cards.push({ c: R.fate === 'eternal' ? 'teal' : 'coral', k: '命运', v: fate, i: fi });
      const Rc = R.curvRadius * COSMO.CKMS / S.H0 / 1000;
      cards.push({ c: 'violet', k: '几何', v: R.geometry === 'flat' ? '平坦' : (R.geometry === 'open' ? '开放' : '封闭'), i: R.geometry === 'flat' ? (isFinite(Rc) ? `|Ω_k| < 0.002，曲率半径 > ${sig(Rc, 2)} Gpc` : '曲率半径无穷大') : `曲率半径 ${sig(Rc, 3)} Gpc` });
      cards.push({ c: R.q0 < 0 ? 'teal' : 'coral', k: '减速参数 q₀', v: sig(R.q0, 3), i: R.q0 < 0 ? '现在正在加速' : '现在正在减速' });
      const ph = R.particleHorizon * COSMO.CKMS / S.H0 / 306.6, eh = R.eventHorizon * COSMO.CKMS / S.H0 / 306.6;
      cards.push({ c: 'gold', k: '视界', v: `${isFinite(ph) ? sig(ph, 3) + ' Gly' : '无'} / ${isFinite(eh) ? sig(eh, 3) + ' Gly' : '无'}`, i: '粒子视界 / 事件视界（共动，今天）' });
      let ep = '';
      if (R.origin === 'bigbang') { const tRec = COSMO.tOfA(R, R.aRec) + R.age, tEq = isFinite(R.aEq) && R.aEq < 1 ? COSMO.tOfA(R, R.aEq) + R.age : NaN; ep = `复合 ${gyr(tRec * g)}；物质-辐射相等 ${isFinite(tEq) ? gyr(tEq * g) : '从未'}；物质-暗能量相等 ${isFinite(R.aLambda) ? (R.aLambda <= 1 ? gyr((COSMO.tOfA(R, R.aLambda) + R.age) * g) : '还没发生') : '从未'}`; }
      else ep = '没有热的早期，纪元不适用';
      cards.push({ c: 'teal', k: '关键纪元（大爆炸后）', v: R.origin === 'bigbang' ? `T₀ = ${COSMO.T_CMB} K` : '—', i: ep });
      $('fate-cards').innerHTML = cards.map((c) => `<div class="k ${c.c}"><small>${c.k}</small><b>${c.v}</b><i>${c.i}</i></div>`).join('');
    }
    function drawA() {
      const g = GYR(), cv = $('c-a'); const ts = [], as = [];
      for (let i = R.past.ts.length - 1; i >= 0; i--) { ts.push(R.past.ts[i] * g); as.push(R.past.as[i]); }
      for (let i = 1; i < R.fut.ts.length; i++) { ts.push(R.fut.ts[i] * g); as.push(R.fut.as[i]); }
      let tmin = ts[0], tmax = ts[ts.length - 1];
      if (R.fate === 'eternal') tmax = Math.min(tmax, Math.max(3 * Math.abs(tmin) + 10, 40)); if (R.origin !== 'bigbang') tmin = Math.max(tmin, -6 * Math.max(10, Math.abs(tmax) / 2));
      tmin = Math.max(tmin, -100000); const amax = alog ? Math.min(1e3, Math.max(...as.filter((a, i) => ts[i] <= tmax))) : Math.min(8, Math.max(1.5, ...as.filter((a, i) => ts[i] <= tmax)));
      const f = frames[frame];
      chart(cv, { xmin: tmin, xmax: tmax, ymin: alog ? 1e-6 : 0, ymax: amax, ylog: alog, xlabel: '时间（Gyr，今天 = 0）', ylabel: '尺度因子 a',
        series: [{ xs: ts, ys: as, color: CSS('--gold') }],
        vlines: [{ x: 0, color: CSS('--dim'), label: '今天' }],
        marks: f ? [{ x: f.t * g, y: f.a, color: CSS('--teal'), label: '影片' }] : [] });
    }
    function drawGrowth() {
      const cv = $('c-growth'), G = R.growth;
      if (!G) { const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h); ctx.fillStyle = CSS('--dim'); ctx.font = '13px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('没有热大爆炸，线性增长不适用', w / 2, h / 2); return; }
      const amax = Math.max(2, Math.min(1e4, G.as[G.as.length - 1]));
      chart(cv, { xmin: 1e-5, xmax: amax, xlog: true, ymin: 1e-4, ymax: 100, ylog: true, xlabel: '尺度因子 a（今天 = 1）', ylabel: 'δ（线性）',
        series: [{ xs: G.as, ys: G.dFirst, color: CSS('--coral') }, { xs: G.as, ys: G.dGal, color: CSS('--teal') }, { xs: G.as, ys: G.d8, color: CSS('--violet') }],
        hlines: [{ y: COSMO.DELTA_C, color: CSS('--gold'), label: '坍缩 δ = 1.686' }],
        vlines: [{ x: 1, color: CSS('--dim'), label: '今天' }, { x: R.aEq, color: CSS('--faint'), label: '物质-辐射相等' }, { x: isFinite(R.aLambda) && R.aLambda < amax ? R.aLambda : NaN, color: CSS('--faint'), label: '暗能量接管' }] });
    }
    function diag() {
      const lv = { alive: '可能宜居', marginal: '勉强', dead: '死寂' }; $('verdict').innerHTML = `<span class="verdict ${R.verdict}">${lv[R.verdict]}</span>`;
      $('diag').innerHTML = R.diag.map((d) => `<li><div class="lv ${d.level}"></div><div><b>${d.title}</b><span>${d.detail}</span></div></li>`).join('');
    }
    function eqs() {
      const m = R.m, n = (v) => `<span class="n">${sig(v, 4)}</span>`;
      $('eqs').innerHTML = `<div class="eq">H²/H₀² = ${n(m.Or)}·a⁻⁴ + ${n(m.Om)}·a⁻³ + (${n(m.Ok)})·a⁻² + (${n(m.OL)})·a^(${sig(-3 * (1 + m.w), 3)})</div>
        <div class="eq" style="margin-top:6px">ä/a = −H₀²[ ${n(m.Or)}·a⁻⁴ + ½·${n(m.Om)}·a⁻³ + ½(1+3·${sig(m.w, 3)})·(${n(m.OL)})·a^(${sig(-3 * (1 + m.w), 3)}) ]</div>
        <p class="note" style="margin-top:6px">H₀ = ${S.H0} km/s/Mpc → 1/H₀ = ${sig(GYR(), 4)} Gyr，c/H₀ = ${sig(COSMO.CKMS / S.H0, 4)} Mpc。页面从今天（a = 1，ȧ = H₀）出发，用四阶龙格–库塔向过去和未来各积一遍加速度方程，并和 ∫da/(aE) 的数值积分互相核对。</p>`;
    }
    function timeline() {
      const tl = $('timeline'), g = GYR(), marks = [];
      const at = (a) => { let best = 0; for (let i = 0; i < frames.length; i++) if (Math.abs(Math.log(frames[i].a) - Math.log(a)) < Math.abs(Math.log(frames[best].a) - Math.log(a))) best = i; return best; };
      const atT = (t) => { let best = 0; for (let i = 0; i < frames.length; i++) if (Math.abs(frames[i].t - t) < Math.abs(frames[best].t - t)) best = i; return best; };
      if (R.origin === 'bigbang') { marks.push([0, '大爆炸']); marks.push([at(R.aRec), '复合']); if (R.growth && isFinite(R.growth.aFirst) && R.growth.aFirst < 1) marks.push([at(R.growth.aFirst), '第一批星系']); }
      else if (R.origin === 'bounce') marks.push([atT(R.tBounce), '反弹']);
      marks.push([TODAY, '今天']);
      if (R.fate === 'crunch') { marks.push([atT(R.tTurn), '回转']); marks.push([599, '大坍缩']); } else if (R.fate === 'rip') marks.push([599, '大撕裂']); else marks.push([599, 'a = 30']);
      marks.sort((a, b) => a[0] - b[0]);
      tl.innerHTML = marks.map(([i, l], k) => `<div class="mk${k % 2 ? ' alt' : ''}" style="left:${(i / 599 * 100).toFixed(1)}%">${l}</div>`).join('');
    }
    // ---- 影片 ----
    function makeGalaxies() { const r = mulberry32(7), out = []; for (let i = 0; i < 480; i++) out.push({ x: r() * 2 - 1, y: r() * 2 - 1, z: r() * 2 - 1, s: 0.6 + r() }); return out; }
    function bbColor(T) { // 粗略黑体色
      if (T > 10000) return [190, 210, 255]; if (T > 6000) return [255, 244, 235]; if (T > 4000) return [255, 215, 160]; return [255, 150, 70];
    }
    function drawMovie() {
      if (!galaxies) galaxies = makeGalaxies();
      const cv = $('c-movie'), { ctx, w, h } = fit(cv), f = frames[frame]; if (!f) return;
      const a = f.a, g = GYR(), T = R.origin === 'bigbang' || true ? COSMO.T_CMB / a : NaN;
      ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
      // 背景辐射：复合之前是不透明的火球
      const glow = clamp((T - 1500) / 3000, 0, 1);
      if (glow > 0) { const c = bbColor(T); const grd = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7); grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.95 * glow})`); grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},${0.55 * glow})`); ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h); }
      else if (T > 100) { const c = bbColor(3000); ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${clamp((T - 100) / 1400, 0, 0.3)})`; ctx.fillRect(0, 0, w, h); }
      // 星系：共动坐标 × a；透视
      const scale = Math.min(w, h) * 1.15, cam = 3.2, formed = R.growth && isFinite(R.growth.aFirst) && a >= R.growth.aFirst;
      const proj = (x, y, z) => { const zz = cam - z * a * 0.9; if (zz <= 0.15) return null; const k = scale / zz; return [w / 2 + x * a * k, h / 2 + y * a * k, zz, k]; };
      // 共动立方体的框：边长今天 2 Gpc，随 a 伸缩
      ctx.strokeStyle = 'rgba(152,164,199,0.35)'; ctx.lineWidth = 1;
      const C = [-1, 1]; for (const x of C) for (const y of C) for (const z of C) { for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { if (x + dx * 2 > 1 || y + dy * 2 > 1 || z + dz * 2 > 1) continue; const p0 = proj(x, y, z), p1 = proj(x + dx * 2, y + dy * 2, z + dz * 2); if (!p0 || !p1) continue; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); } }
      const pts = galaxies.map((p) => { const q = proj(p.x, p.y, p.z); if (!q) return null; return { X: q[0], Y: q[1], d: q[2], s: p.s * q[3] * 0.012 }; }).filter(Boolean).sort((p, q) => q.d - p.d);
      for (const p of pts) {
        if (p.X < -20 || p.X > w + 20 || p.Y < -20 || p.Y > h + 20) continue;
        const r = clamp(p.s * (formed ? 1 : 0.6), 0.5, 9);
        if (formed) { ctx.fillStyle = `rgba(255,236,190,${clamp(0.35 + 0.65 * (3.5 - p.d) / 3, 0.25, 1)})`; } else ctx.fillStyle = `rgba(160,170,200,${clamp(0.25 + 0.4 * (3.5 - p.d) / 3, 0.15, 0.6)})`;
        ctx.beginPath(); ctx.arc(p.X, p.Y, r, 0, Math.PI * 2); ctx.fill();
      }
      // 读数
      const H = aAtH(f) ; const t = f.t * g;
      let epoch; const contracting = R.fate === 'crunch' && f.t > R.tTurn, acc = COSMO.accel(R.m, a) > 0;
      if (contracting) epoch = a < R.aRec ? '大坍缩：重新变成火球，压回奇点' : '收缩中：天空越来越亮，温度回升';
      else if (R.origin === 'bigbang' && a < R.aRec) epoch = '火球：不透明的等离子体，光走不出去';
      else if (R.origin === 'bigbang' && !formed && a < 1) epoch = '黑暗时代：复合之后，第一批星系之前';
      else if (R.fate === 'rip' && a > 50) epoch = '大撕裂逼近：先星系团，再星系，再原子';
      else if (isFinite(R.aLambda) && a > R.aLambda && acc) epoch = (f.t > 0 ? '未来 · ' : '') + '暗能量主导：加速膨胀，星系互相远离';
      else if (f.t > 0) epoch = '未来 · ' + (acc ? '加速膨胀' : '减速膨胀') + (formed ? '' : '（还没有星系）');
      else epoch = formed ? '物质主导：结构在生长' : '扰动还没长成星系';
      $('movie-epoch').textContent = epoch;
      // 比例尺：方框边长 = 2 Gpc × a
      const side = 2000 * a, sideTxt = side >= 1000 ? sig(side / 1000, 3) + ' Gpc' : (side >= 1 ? sig(side, 3) + ' Mpc' : sig(side * 1000, 3) + ' kpc');
      ctx.fillStyle = 'rgba(233,237,249,0.8)'; ctx.font = '12px Space Grotesk, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('方框边长 ' + sideTxt + '（今天 2 Gpc）', w - 10, h - 10);
      $('movie-hud').innerHTML = `t = <b>${gyr(t)}</b>${R.origin === 'bigbang' ? `（大爆炸后 <b>${gyr((f.t + R.age) * g)}</b>）` : ''}<br>a = <b>${sig(a, 3)}</b>　T = <b>${sig(T, 3)} K</b><br>H = <b>${isFinite(H) ? sig(H * S.H0, 3) : '—'} km/s/Mpc</b>`;
      $('v-frame').textContent = `帧 ${frame + 1}/${frames.length}`;
      $('s-frame').value = frame;
    }
    function aAtH(f) { const e2 = COSMO.E2(R.m, f.a); return e2 > 0 ? Math.sqrt(e2) * (R.fate === 'crunch' && f.t > R.tTurn ? -1 : 1) : 0; }
    $('s-frame').addEventListener('input', () => { frame = +$('s-frame').value; drawMovie(); drawA(); });
    $('b-play').addEventListener('click', () => { playing = !playing; $('b-play').textContent = playing ? '⏸ 暂停' : '▶ 播放'; if (playing) { if (frame >= frames.length - 1) frame = 0; requestAnimationFrame(tick); } });
    function tick(ts) { if (!playing || current !== 'forge') { playing = false; $('b-play').textContent = '▶ 播放'; return; } if (ts - lastDraw > 40) { lastDraw = ts; frame++; if (frame >= frames.length) { frame = frames.length - 1; playing = false; $('b-play').textContent = '▶ 播放'; } drawMovie(); if (frame % 6 === 0) drawA(); } requestAnimationFrame(tick); }
    $('b-alog').addEventListener('click', () => { alog = !alog; $('b-alog').textContent = alog ? '线性刻度' : '对数刻度'; drawA(); });
    window.addEventListener('resize', () => { if (current === 'forge') render(); });
    // 初始化
    const saved = store.get('forge', null); if (saved && typeof saved.H0 === 'number') { Object.assign(S, saved); presetId = PRESETS.find((p) => ids.every((k) => Math.abs(p.p[k] - S[k]) < 1e-9)) ? PRESETS.find((p) => ids.every((k) => Math.abs(p.p[k] - S[k]) < 1e-9)).id : null; }
    syncSliders(); markPreset();
    window.addEventListener('beforeunload', () => store.set('forge', S));
    return { render: () => { if (!R) solve(); else render(); }, S, get R() { return R; } };
  })();

  // ======================================================================
  // 哥德尔旋转宇宙
  // ======================================================================
  const godel = (function () {
    const H0SI = 67.4 * 1000 / 3.0857e22; // s⁻¹
    const OM_OURS = 0.315; // 我们宇宙今天的物质密度（临界密度的份额）
    const SEC_GYR = 3.15576e16, LY_PER_GYR = 1e9; // c·1 Gyr = 10⁹ 光年
    // 由 ρ/ρ_m,ours 算 ω（s⁻¹）：4πGρ_m,ours = (3/2) Ω_m H0²
    const omegaOf = (rhoRel) => Math.sqrt(1.5 * OM_OURS * rhoRel) * H0SI;
    function physical(rhoRel) {
      const om = omegaOf(rhoRel), P = GODEL.physical(om);
      return { omega: om, periodGyr: P.period / SEC_GYR, RctcGly: P.Rctc * 3e8 / 9.461e15 / 1e9, unitGly: P.unit * 3e8 / 9.461e15 / 1e9, Lambda: -om * om / 9e16 /* m⁻² */ };
    }
    // ④ 创世参数卡
    let rhoRel = 1;
    function cards() {
      const P = physical(rhoRel); $('v-rho').textContent = sig(rhoRel, 3) + ' ×';
      $('godel-cards').innerHTML = [
        ['gold', '转动角速度 ω = √(4πGρ)', sig(P.omega, 3) + ' s⁻¹', `星空相对陀螺仪每 ${gyr(P.periodGyr)} 转一圈`],
        ['coral', '时间机器的半径 R_c = √2·asinh(1)/ω', sig(P.RctcGly, 3) + ' Gly', `${sig(P.RctcGly * 10, 3)} 亿光年；sinh r = 1 处，比它远的圈都是闭合类时曲线`],
        ['violet', '宇宙学常数（被锁死）', 'Λ = −ω² = ' + sig(P.Lambda, 3) + ' m⁻²', '负的，且不能独立调节'],
        ['teal', '坐标单位', '1 哥德尔单位 = ' + sig(P.unitGly, 3) + ' Gly', '右边两个画面用的都是坐标单位'],
      ].map(([c, k, v, i]) => `<div class="k ${c}"><small>${k}</small><b class="mono">${v}</b><i>${i}</i></div>`).join('');
      const O = physical(1); $('godel-ours-T').textContent = gyr(O.periodGyr); $('godel-ours-R').textContent = sig(O.RctcGly, 3) + ' Gly（十亿光年）';
    }
    $('s-rho').addEventListener('input', () => { rhoRel = Math.pow(10, +$('s-rho').value); cards(); });
    // ① 星空 + 秒表 + 反推
    const sky = { stars: null, hidden: null, t0: null, watch: { on: false, start: 0, acc: 0 }, raf: 0, marker: 0 };
    const TURN_SEC = 18; // 影片里转一圈用 18 秒
    function newSky() { const r = mulberry32((Date.now() / 1000 | 0) % 100000); sky.stars = []; for (let i = 0; i < 160; i++) { const d = 0.15 + 0.85 * Math.sqrt(r()); sky.stars.push({ d, a: r() * Math.PI * 2, s: 0.7 + 1.6 * r(), b: 0.4 + 0.6 * r() }); } sky.marker = 0; sky.stars[0] = { d: 0.72, a: -Math.PI / 2, s: 2.6, b: 1 };
      sky.hidden = [0.25, 0.5, 1, 2, 4, 8][Math.floor(r() * 6)]; sky.t0 = performance.now(); sky.watch = { on: false, start: 0, acc: 0 }; $('v-sky-watch').textContent = '0.0 亿年'; $('b-sky-watch').textContent = '⏱ 秒表：开始'; $('godel-puzzle-out').innerHTML = ''; $('i-period').value = ''; }
    function skyTick(now) {
      const cv = $('c-sky'), { ctx, w, h } = fit(cv), P = physical(sky.hidden);
      const ang = (now - sky.t0) / 1000 / TURN_SEC * 2 * Math.PI; // 转过的角度
      ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
      const R0 = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2;
      // 秒表开着时，标记星系留下轨迹（起点有个小刻度）
      if (sky.watch.on || sky.watch.acc > 0) {
        const s0 = sky.stars[0], secAll = (sky.watch.on ? (now - sky.watch.start) / 1000 : 0) + sky.watch.acc, a0 = s0.a + ang - secAll / TURN_SEC * 2 * Math.PI, a1 = s0.a + ang;
        ctx.strokeStyle = 'rgba(242,193,78,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, s0.d * R0, a0, a1, false); ctx.stroke();
        ctx.strokeStyle = CSS('--gold'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx + (s0.d * R0 - 10) * Math.cos(a0), cy + (s0.d * R0 - 10) * Math.sin(a0)); ctx.lineTo(cx + (s0.d * R0 + 10) * Math.cos(a0), cy + (s0.d * R0 + 10) * Math.sin(a0)); ctx.stroke();
        ctx.fillStyle = CSS('--gold'); ctx.font = '11px Space Grotesk'; ctx.textAlign = 'left'; ctx.fillText('出发点', cx + (s0.d * R0 + 14) * Math.cos(a0), cy + (s0.d * R0 + 14) * Math.sin(a0) + 4);
      }
      for (let i = 0; i < sky.stars.length; i++) { const s = sky.stars[i]; const a = s.a + ang; const x = cx + s.d * R0 * Math.cos(a), y = cy + s.d * R0 * Math.sin(a); ctx.fillStyle = i === 0 ? CSS('--gold') : `rgba(230,236,255,${s.b})`; ctx.beginPath(); ctx.arc(x, y, s.s, 0, Math.PI * 2); ctx.fill(); if (i === 0) { ctx.strokeStyle = CSS('--gold'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke(); } }
      // 陀螺仪：固定的十字
      ctx.strokeStyle = CSS('--teal'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
      ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk'; ctx.textAlign = 'left'; ctx.fillText('陀螺仪（不转）', cx + 18, cy + 4); ctx.fillText('标记星系', 10, h - 10);
      ctx.fillStyle = CSS('--gold'); ctx.beginPath(); ctx.arc(70, h - 14, 3, 0, Math.PI * 2); ctx.fill();
      // 秒表（宇宙时间）
      if (sky.watch.on) { const sec = (now - sky.watch.start) / 1000 + sky.watch.acc; $('v-sky-watch').textContent = (sec / TURN_SEC * P.periodGyr * 10).toFixed(1) + ' 亿年'; }
      sky.raf = requestAnimationFrame(skyTick);
    }
    $('b-sky-watch').addEventListener('click', () => { const W = sky.watch; if (!W.on) { W.on = true; W.start = performance.now(); $('b-sky-watch').textContent = '⏱ 秒表：停'; } else { W.on = false; W.acc += (performance.now() - W.start) / 1000; $('b-sky-watch').textContent = '⏱ 秒表：继续'; } });
    $('b-sky-reset').addEventListener('click', () => { sky.watch = { on: false, start: 0, acc: 0 }; $('v-sky-watch').textContent = '0.0 亿年'; $('b-sky-watch').textContent = '⏱ 秒表：开始'; });
    $('b-period').addEventListener('click', () => {
      const T = parseFloat($('i-period').value); if (!(T > 0)) { toast('先填周期（亿年）'); return; }
      const Tgyr = T / 10, omega = 2 * Math.PI / (Tgyr * SEC_GYR), P = GODEL.physical(omega), truth = physical(sky.hidden);
      const Rgly = P.Rctc * 3e8 / 9.461e15 / 1e9, rhoRel = (omega / H0SI) ** 2 / (1.5 * OM_OURS);
      const err = Math.abs(Tgyr / truth.periodGyr - 1);
      $('godel-puzzle-out').innerHTML = `<div class="reveal"><div class="stars">${err < 0.08 ? '★★★' : (err < 0.25 ? '★★' : '★')}</div>
        <p>你的测量：T = ${sig(Tgyr, 3)} Gyr → ω = 2π/T = <b class="mono">${sig(omega, 3)} s⁻¹</b>。由哥德尔解：Λ = −ω² = ${sig(-omega * omega / 9e16, 3)} m⁻²，物质密度 ρ = ω²/(4πG) = 我们宇宙今天物质密度的 <b class="mono">${sig(rhoRel, 3)}</b> 倍，时间机器的圈在 <b class="mono">${sig(Rgly, 3)} Gly</b>（${sig(Rgly * 10, 3)} 亿光年）之外。</p>
        <p>真相：这个宇宙的密度是我们的 <b class="mono">${sig(sky.hidden, 3)}</b> 倍，周期 ${gyr(truth.periodGyr)}，R_c = ${sig(truth.RctcGly, 3)} Gly。${err < 0.08 ? '你凭一只陀螺仪和一块秒表，就推出了这个宇宙的全部参数——因为哥德尔宇宙只有一个参数。' : '周期量得不够准（误差 ' + (err * 100).toFixed(0) + '%）；标记星系转回出发位置时再停表。'}</p>
        <p><button class="btn small" id="b-sky-new">换一个旋转宇宙</button></p></div>`;
      $('b-sky-new').addEventListener('click', newSky);
    });
    // ② 发光
    const light = { paths: [], t0: 0, raf: 0, r0: 0 };
    $('s-r0').addEventListener('input', () => { light.r0 = +$('s-r0').value; $('v-r0').textContent = light.r0.toFixed(2); });
    function flash() {
      const r0 = light.r0, phi0 = 0, N = 36, paths = [];
      if (r0 < 1e-6) {
        const k = GODEL.nullVector(0, 0, 0), base = GODEL.geodesic([0, 0, 0, 0], k, { lambdaMax: 2.8, dl: 0.006, every: 2 });
        for (let i = 0; i < N; i++) { const th = i / N * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); paths.push(base.map((p) => ({ x: [p.x[0], c * p.x[1] - s * p.x[2], s * p.x[1] + c * p.x[2], 0], u: p.u, lambda: p.lambda }))); }
      } else {
        for (let i = 0; i < N; i++) { const th = i / N * Math.PI * 2, k = GODEL.nullVector(r0, phi0, th), x0 = GODEL.pointCart(r0, phi0, 0, 0); paths.push(GODEL.geodesic(x0, k, { lambdaMax: 3.5, dl: 0.008, every: 2, rMax: 3 })); }
      }
      light.paths = paths; light.t0 = performance.now();
      // 读数
      let rMax = 0, back = null, tPast = false, tmax = 0;
      for (const P of paths) for (const p of P) { const r = Math.hypot(p.x[1], p.x[2]); if (r > rMax) rMax = r; if (p.u[0] < 0) tPast = true; if (p.x[0] > tmax) tmax = p.x[0]; }
      if (r0 < 1e-6) { const base = paths[0]; for (const p of base) { const r = Math.hypot(p.x[1], p.x[2]); if (rMax > 0.8 && r < 0.02 && p.lambda > 1) { back = p.x[0]; break; } } }
      const Pn = physical(rhoRel);
      $('light-readout').innerHTML = r0 < 1e-6 ? `光最远到 r = ${rMax.toFixed(3)}（asinh 1 = ${GODEL.R_C.toFixed(3)}，按④的密度 = ${sig(Pn.RctcGly, 3)} Gly），然后折回${back !== null ? `，在 t = ${back.toFixed(2)} 全部回到轴上` : ''}` : `从 r₀ = ${r0.toFixed(2)} 发出：${tPast ? '<span style="color:var(--coral)">红色的光子坐标时在倒退——它们正走向你的过去</span>' : '所有光子的坐标时都在增加'}；最远到 r = ${rMax.toFixed(2)}`;
      if (!light.raf) light.raf = requestAnimationFrame(lightTick);
    }
    function lightTick(now) {
      const cv = $('c-light'), { ctx, w, h } = fit(cv), R0 = Math.min(w, h) * 0.46 / 1.75, cx = w / 2, cy = h / 2;
      ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
      // 网格：r = 0.5, 1, 1.5 和 r_c
      for (const r of [0.5, 1.0, 1.5]) { ctx.strokeStyle = CSS('--line'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r * R0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = CSS('--gold'); ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(cx, cy, GODEL.R_C * R0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = CSS('--gold'); ctx.font = '11px Space Grotesk'; ctx.textAlign = 'left'; ctx.fillText('sinh r = 1', cx + GODEL.R_C * R0 * 0.72, cy - GODEL.R_C * R0 * 0.72);
      ctx.fillStyle = CSS('--dim'); ctx.fillText('r = 1', cx + R0 + 3, cy - 3);
      // 发光点
      const ex = cx + light.r0 * R0, ey = cy; ctx.fillStyle = CSS('--teal'); ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
      if (light.paths.length) {
        const el = (now - light.t0) / 1000, lam = Math.min(el * 0.7, 4), maxT = 1.5;
        for (const P of light.paths) {
          ctx.beginPath(); let first = true, lastP = null;
          for (const p of P) { if (p.lambda > lam) break; const x = cx + p.x[1] * R0, y = cy + p.x[2] * R0; if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); lastP = p; }
          ctx.strokeStyle = 'rgba(95,224,207,0.45)'; ctx.lineWidth = 1; ctx.stroke();
          if (lastP) { const br = clamp(0.35 + 0.65 * lastP.x[0] / maxT, 0.2, 1); const past = lastP.u[0] < 0; ctx.fillStyle = past ? CSS('--coral') : `rgba(255,255,255,${br})`; ctx.beginPath(); ctx.arc(cx + lastP.x[1] * R0, cy + lastP.x[2] * R0, past ? 3.2 : 2.2, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.fillStyle = CSS('--dim'); ctx.textAlign = 'right'; ctx.fillText('仿射参数 λ = ' + lam.toFixed(2), w - 10, h - 10);
      }
      light.raf = (current === 'godel') ? requestAnimationFrame(lightTick) : 0;
    }
    $('b-flash').addEventListener('click', () => { if (light.r0 > 1e-6) { toast('正在积分 36 条零测地线…'); setTimeout(flash, 30); } else flash(); });
    $('b-light-clear').addEventListener('click', () => { light.paths = []; $('light-readout').textContent = ''; });
    $('c-light').addEventListener('click', (e) => { const cv = $('c-light'), rect = cv.getBoundingClientRect(), w = rect.width, h = rect.height, R0 = Math.min(w, h) * 0.46 / 1.75; const dx = e.clientX - rect.left - w / 2, dy = e.clientY - rect.top - h / 2; const r = clamp(Math.hypot(dx, dy) / R0, 0, 1.6); light.r0 = +r.toFixed(2); $('s-r0').value = light.r0; $('v-r0').textContent = light.r0.toFixed(2); if (light.r0 > 1e-6) { toast('正在积分 36 条零测地线…'); setTimeout(flash, 30); } else flash(); });
    // ③ 光锥
    const cone = { yaw: -0.6, pitch: 0.55, ring: 1.2, drag: null };
    function project(X, Y, T, w, h) { // 正交投影：绕竖轴 yaw，再俯仰 pitch
      const cy = Math.cos(cone.yaw), sy = Math.sin(cone.yaw), cp = Math.cos(cone.pitch), sp = Math.sin(cone.pitch);
      const x1 = X * cy - Y * sy, y1 = X * sy + Y * cy; const sc = Math.min(w, h) * 0.26;
      return [w / 2 + x1 * sc, h * 0.62 - (T * cp - y1 * sp) * sc * 0.9 + y1 * 0 ];
    }
    function drawCones() {
      const cv = $('c-cones'), { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
      const P = (X, Y, T) => project(X, Y, T, w, h);
      // 平面网格
      for (const r of [0.5, 1.0, 1.5]) { ctx.strokeStyle = CSS('--line'); ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, [x, y] = P(r * Math.cos(a), r * Math.sin(a), 0); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
      ctx.strokeStyle = CSS('--gold'); ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, [x, y] = P(GODEL.R_C * Math.cos(a), GODEL.R_C * Math.sin(a), 0); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
      // 轴
      { const [x0, y0] = P(0, 0, -0.3), [x1, y1] = P(0, 0, 1.1); ctx.strokeStyle = CSS('--dim'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk'; ctx.textAlign = 'left'; ctx.fillText('t（轴上的时间）', x1 + 4, y1); }
      // 选定半径的圈
      const r = cone.ring, sl = GODEL.coneSlopes(r), ctc = sl.minus > 0;
      ctx.strokeStyle = ctc ? CSS('--coral') : CSS('--teal'); ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i <= 90; i++) { const a = i / 90 * Math.PI * 2, [x, y] = P(r * Math.cos(a), r * Math.sin(a), 0); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
      // 这个圈上 8 个点的未来光锥
      const EPS = 0.32, NK = 28;
      for (let j = 0; j < 8; j++) {
        const phi = j / 8 * Math.PI * 2, X0 = r * Math.cos(phi), Y0 = r * Math.sin(phi), rim = [];
        for (let i = 0; i < NK; i++) { const th = i / NK * Math.PI * 2, k = GODEL.nullVector(r, phi, th), nk = Math.hypot(k[0], k[1], k[2]); rim.push([X0 + EPS * k[1] / nk, Y0 + EPS * k[2] / nk, EPS * k[0] / nk]); }
        const apex = P(X0, Y0, 0);
        ctx.beginPath(); for (let i = 0; i < NK; i++) { const [x, y] = P(...rim[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath();
        ctx.fillStyle = ctc ? 'rgba(255,111,135,0.22)' : 'rgba(95,224,207,0.2)'; ctx.fill(); ctx.strokeStyle = ctc ? CSS('--coral') : CSS('--teal'); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = ctc ? 'rgba(255,111,135,0.6)' : 'rgba(95,224,207,0.6)'; ctx.lineWidth = 0.8;
        for (let i = 0; i < NK; i += 4) { const [x, y] = P(...rim[i]); ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.fillStyle = CSS('--ink'); ctx.beginPath(); ctx.arc(apex[0], apex[1], 2.2, 0, Math.PI * 2); ctx.fill();
        // 圈的切线方向（绕轴走的方向）：落在光锥里就是类时的
        const tx = -Math.sin(phi) * 0.3, ty = Math.cos(phi) * 0.3, tip = P(X0 + tx, Y0 + ty, 0);
        ctx.strokeStyle = ctc ? CSS('--coral') : CSS('--teal'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(tip[0], tip[1], 2.5, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      }
      // 标注
      ctx.fillStyle = CSS('--dim'); ctx.font = '11px Space Grotesk'; ctx.textAlign = 'left'; ctx.fillText('拖动旋转 · 金色虚线 sinh r = 1 · 短箭头 = 沿圈走的方向', 10, h - 10);
      $('v-ring').textContent = r.toFixed(2);
      const tau = GODEL.loopProperTime(r);
      $('ring-readout').innerHTML = ctc ? `<span style="color:var(--coral)">r > r_c：绕轴一圈是闭合类时曲线，走一圈手表走 τ = ${tau.toFixed(2)}（哥德尔单位），回到出发那一刻</span>` : (Math.abs(r - GODEL.R_C) < 0.03 ? `<span style="color:var(--gold)">r = r_c：绕轴一圈恰好是光速能走的闭合路线</span>` : `<span style="color:var(--teal)">r < r_c：φ 圆还是类空的，光锥没倒到那个程度</span>`);
    }
    const cc = $('c-cones');
    const onDown = (e) => { cone.drag = { x: e.clientX, y: e.clientY, yaw: cone.yaw, pitch: cone.pitch }; };
    const onMove = (e) => { if (!cone.drag) return; const dx = e.clientX - cone.drag.x, dy = e.clientY - cone.drag.y; cone.yaw = cone.drag.yaw + dx * 0.01; cone.pitch = clamp(cone.drag.pitch + dy * 0.01, 0.05, 1.5); drawCones(); };
    cc.addEventListener('pointerdown', (e) => { onDown(e); cc.setPointerCapture(e.pointerId); }); cc.addEventListener('pointermove', onMove); cc.addEventListener('pointerup', () => { cone.drag = null; }); cc.addEventListener('pointercancel', () => { cone.drag = null; });
    cc.style.touchAction = 'none';
    $('s-ring').addEventListener('input', () => { cone.ring = +$('s-ring').value; drawCones(); });
    let entered = false;
    function enter() { if (!sky.stars) newSky(); cards(); drawCones(); if (!sky.raf) sky.raf = requestAnimationFrame(skyTick); if (!light.raf) light.raf = requestAnimationFrame(lightTick); entered = true; }
    function leave() { if (sky.raf) { cancelAnimationFrame(sky.raf); sky.raf = 0; } }
    window.addEventListener('resize', () => { if (current === 'godel') drawCones(); });
    return { enter, leave };
  })();

  // ======================================================================
  // 反推台
  // ======================================================================
  const inverse = (function () {
    const G = { H0: 70, Om: 0.5, OL: 0 }; let obs = null, locked = false, hiddenIdx = -1, nlBest = null;
    function newHidden() { hiddenIdx = Math.floor(Math.random() * PUZZLES.POOL.length); obs = PUZZLES.observe(PUZZLES.POOL[hiddenIdx], 11 + hiddenIdx); locked = false; nlBest = null; $('reveal').hidden = true; $('reveal').innerHTML = ''; $('nolambda-out').textContent = ''; $('b-lock').disabled = false; G.H0 = 70; G.Om = 0.5; G.OL = 0; sync(); render(); }
    function sync() { $('ps-H0').value = G.H0; $('ps-Om').value = G.Om; $('ps-OL').value = G.OL; $('pv-H0').textContent = G.H0.toFixed(1); $('pv-Om').textContent = G.Om.toFixed(2); $('pv-OL').textContent = G.OL.toFixed(2); }
    for (const k of ['H0', 'Om', 'OL']) $('ps-' + k).addEventListener('input', () => { G[k] = +$('ps-' + k).value; sync(); render(); });
    function render() {
      if (!obs) newHidden();
      const fit0 = PUZZLES.chi2(obs, G), m = COSMO.norm(PUZZLES.model(G)), T = COSMO.chiTable(m, 3), milne = COSMO.norm({ H0: G.H0, Om: 0, Or: 0, OL: 0, w: -1 }), Tm = COSMO.chiTable(milne, 3);
      // 超新星图
      const zs = []; for (let z = 0.01; z <= 1.9; z *= 1.04) zs.push(z);
      const mus = zs.map((z) => COSMO.distances(m, T, z).mu), muM = zs.map((z) => COSMO.distances(milne, Tm, z).mu);
      const ys = obs.sn.map((d) => d.mu); const ymin = Math.min(...ys) - 1, ymax = Math.max(...ys) + 1;
      // 锁定之后把真相叠上去（紫色虚线）
      let truthSeries = null, truthRes = null, truthTh = null;
      if (locked) { const mt = COSMO.norm(PUZZLES.model(obs.truth)), Tt = COSMO.chiTable(mt, 3); truthSeries = zs.map((z) => COSMO.distances(mt, Tt, z).mu); truthRes = zs.map((z, i) => truthSeries[i] - muM[i]); truthTh = (zr) => zr.map((z) => { const DM = COSMO.distances(mt, Tt, z).DM; return DM > 0 ? PUZZLES.RULER / DM * 180 / Math.PI : NaN; }); }
      const snSeries = [{ xs: zs, ys: muM, color: CSS('--faint'), dash: [4, 4], width: 1.5 }, { xs: zs, ys: mus, color: CSS('--gold') }]; if (truthSeries) snSeries.push({ xs: zs, ys: truthSeries, color: CSS('--violet'), dash: [6, 4] });
      chart($('c-sn'), { xmin: 0.01, xmax: 1.9, xlog: true, ymin, ymax, xlabel: '红移 z', ylabel: '距离模数 μ（mag）', series: snSeries,
        points: [{ xs: obs.sn.map((d) => d.z), ys, es: obs.sn.map((d) => d.sig), color: CSS('--teal') }] });
      // 残差图：减去空宇宙（用玩家的 H₀）
      const resData = obs.sn.map((d) => d.mu - COSMO.distances(milne, Tm, d.z).mu), resModel = zs.map((z, i) => mus[i] - muM[i]);
      const rr = Math.max(0.6, ...resData.map(Math.abs).filter(isFinite));
      const resSeries = [{ xs: zs, ys: resModel, color: CSS('--gold') }]; if (truthRes) resSeries.push({ xs: zs, ys: truthRes, color: CSS('--violet'), dash: [6, 4] });
      chart($('c-snres'), { xmin: 0.01, xmax: 1.9, xlog: true, ymin: -rr, ymax: rr, xlabel: '红移 z', ylabel: 'Δμ（mag）',
        hlines: [{ y: 0, color: CSS('--faint'), dash: [4, 4], label: '空宇宙（匀速膨胀）' }], series: resSeries,
        points: [{ xs: obs.sn.map((d) => d.z), ys: resData, es: obs.sn.map((d) => d.sig), color: CSS('--teal') }] });
      // 读图提示：高红移超新星相对你的模型偏暗还是偏亮；标准尺偏大还是偏小
      let hiZ = 0, nHi = 0; for (let i = 0; i < obs.sn.length; i++) if (obs.sn[i].z > 0.5 && isFinite(fit0.snModel[i])) { hiZ += (obs.sn[i].mu - fit0.snModel[i]) / obs.sn[i].sig; nHi++; }
      let rl = 0, nR = 0; for (let i = 0; i < obs.rulers.length; i++) if (isFinite(fit0.rulerModel[i])) { rl += (obs.rulers[i].theta - fit0.rulerModel[i]) / obs.rulers[i].sig; nR++; }
      const hz = nHi ? hiZ / nHi : 0, rz = nR ? rl / nR : 0, hints = [];
      if (Math.abs(hz) > 0.6) hints.push(hz > 0 ? 'z > 0.5 的超新星平均比你的模型暗——它们更远，膨胀比你猜的更"加速"（多些 Ω_Λ，或少些 Ω_m）' : 'z > 0.5 的超新星平均比你的模型亮——它们更近，膨胀比你猜的更"减速"（多些 Ω_m，或少些 Ω_Λ）');
      if (Math.abs(rz) > 0.8) hints.push(rz > 0 ? '标准尺看起来比你的模型大——空间比你猜的更"封闭"（Ω_m + Ω_Λ 的总和要更大）' : '标准尺看起来比你的模型小——空间比你猜的更"开放"（Ω_m + Ω_Λ 的总和要更小）');
      $('v-hints').textContent = fit0.bad ? '' : hints.join('；');
      // 标准尺图
      const zr = []; for (let z = 0.1; z <= 2.8; z += 0.05) zr.push(+z.toFixed(2));
      const th = zr.map((z) => { const DM = COSMO.distances(m, T, z).DM; return DM > 0 ? PUZZLES.RULER / DM * 180 / Math.PI : NaN; });
      const tys = obs.rulers.map((d) => d.theta);
      chart($('c-ruler'), { xmin: 0, xmax: 2.8, ymin: 0, ymax: Math.max(...tys) * 1.3, xlabel: '红移 z', ylabel: '张角 θ（度）', padL: 44,
        series: truthTh ? [{ xs: zr, ys: th, color: CSS('--gold') }, { xs: zr, ys: truthTh(zr), color: CSS('--violet'), dash: [6, 4] }] : [{ xs: zr, ys: th, color: CSS('--gold') }], points: [{ xs: obs.rulers.map((d) => d.z), ys: tys, es: obs.rulers.map((d) => d.sig), color: CSS('--teal'), r: 3 }] });
      // 年龄、χ²
      $('v-oldest').textContent = `${obs.oldest.t.toFixed(1)} ± ${obs.oldest.sig.toFixed(1)} Gyr`;
      $('v-model-age').textContent = isFinite(fit0.age) ? fit0.age.toFixed(2) + ' Gyr' : '无大爆炸';
      $('v-age-ok').innerHTML = fit0.agePen > 0 ? '<span style="color:var(--coral)">比最老的恒星还年轻！</span>' : '<span style="color:var(--ok)">够老了</span>';
      const q = fit0.bad ? 0 : clamp(1 - (fit0.perDof - 1) / 6, 0, 1);
      $('v-chi2').textContent = fit0.bad ? '模型在这些红移上没有距离（反弹/闭合过头）' : `χ²/N = ${fit0.perDof.toFixed(2)}（烛光 ${fit0.snPerDof.toFixed(2)} · 标准尺 ${fit0.rulerPerDof.toFixed(2)} · 年龄 ${fit0.agePen.toFixed(1)}）`;
      $('q-bar').style.width = (q * 100).toFixed(0) + '%';
      $('v-quality').textContent = fit0.bad ? '这个模型的过去没有这么高的红移。' : (fit0.perDof < 1.3 ? '和数据相符：可以锁定了（也可以再精调）。' : (fit0.perDof < 3 ? '大致走向对了，细节还差。' : (fit0.perDof < 20 ? '差得远：看看哪一段数据偏得最多。' : '完全不对。')));
      // 猜测的含义
      const Rp = fit0.R, Ok = 1 - G.Om - PUZZLES.OR - G.OL;
      let fate = Rp.fate === 'crunch' ? `大坍缩（${gyr(Rp.tEnd * COSMO.GYR / G.H0)}后）` : (Rp.fate === 'rip' ? '大撕裂' : (Rp.accelerating ? '永远膨胀，终将加速' : '永远膨胀，一直减速'));
      $('guess-cards').innerHTML = `<div class="k violet"><small>你猜的几何</small><b>${Math.abs(Ok) < 0.08 ? '平坦' : (Ok > 0 ? '开放' : '封闭')}</b><i>Ω_k = ${Ok.toFixed(2)}</i></div><div class="k ${Rp.fate === 'eternal' ? 'teal' : 'coral'}"><small>你猜的命运</small><b>${fate}</b><i>q₀ = ${Rp.q0.toFixed(2)}</i></div>`;
      if (nlBest) showNoLambda(fit0);
    }
    function showNoLambda(now) {
      const b = nlBest;
      $('nolambda-out').innerHTML = `Ω_Λ = 0 时最好能做到：H₀ = ${b.H0}，Ω_m = ${b.Om}，χ²/N = <b class="mono">${b.perDof.toFixed(2)}</b>${b.perDof < 1.3 ? ' —— 没有暗能量也解释得通。' : ' —— 怎么调都差，这些数据需要别的东西。'}（你现在的猜测 χ²/N = ${now.perDof.toFixed(2)}）<button class="btn small ghost" id="b-takeb">用这组参数</button>`;
      $('b-takeb').addEventListener('click', () => { G.H0 = b.H0; G.Om = b.Om; G.OL = 0; sync(); render(); });
    }
    $('b-nolambda').addEventListener('click', () => {
      toast('在 Ω_Λ = 0 的平面上搜索最佳拟合…');
      setTimeout(() => { const b = PUZZLES.bestFitNoLambda(obs), now = PUZZLES.chi2(obs, G);
        if (!b) { $('nolambda-out').textContent = '没找到'; return; }
        nlBest = b; showNoLambda(now);
      }, 30);
    });
    $('b-lock').addEventListener('click', () => {
      if (locked) return; locked = true; $('b-lock').disabled = true;
      const J = PUZZLES.judge(obs, G), t = J.truth, Rt = J.Rt, gy = COSMO.GYR / t.H0;
      const geomName = { flat: '平坦', open: '开放', closed: '封闭' };
      const fateName = (R) => R.fate === 'crunch' ? '大坍缩' : (R.fate === 'rip' ? '大撕裂' : (R.accelerating ? '永远膨胀、终将加速' : '永远膨胀、一直减速'));
      let signal = `低红移的斜率给出 H₀ ≈ ${t.H0}；`;
      if (t.OL > 0.3) signal += `高红移超新星比空宇宙的参照线暗约 ${(COSMO.distances(COSMO.norm(PUZZLES.model(t)), COSMO.chiTable(COSMO.norm(PUZZLES.model(t)), 3), 1).mu - COSMO.distances(COSMO.norm({ H0: t.H0, Om: 0, Or: 0, OL: 0, w: -1 }), COSMO.chiTable(COSMO.norm({ H0: t.H0, Om: 0, Or: 0, OL: 0, w: -1 }), 3), 1).mu).toFixed(2)} mag：它们比"匀速膨胀"该有的距离更远，宇宙加速过——只有物质做不到，必须有 Ω_Λ > 0；`;
      else if (t.Om > 0.8) signal += '高红移超新星比空宇宙的参照线亮：减速膨胀，物质在拖后腿；';
      else signal += '高红移超新星几乎贴着空宇宙的参照线：近乎匀速，物质稀薄、也没多少暗能量；';
      signal += J.geomTruth === 'closed' ? '标准尺在高红移显得偏大：封闭几何。' : (J.geomTruth === 'open' ? '标准尺在高红移显得偏小：开放几何。' : '标准尺的张角正好是平坦几何的预期。');
      $('reveal').hidden = false;
      $('reveal').innerHTML = `<div class="reveal"><div class="stars">${'★'.repeat(J.stars)}${'☆'.repeat(3 - J.stars)}</div>
        <p><b style="color:var(--ink)">真相</b>：H₀ = ${t.H0}，Ω_m = ${t.Om}，Ω_Λ = ${t.OL}（${PUZZLES.POOL[hiddenIdx].story}）年龄 ${gyr(Rt.age * gy)}。</p>
        <p><span class="pill ${J.geomOK ? 'y' : 'n'}">几何：你猜${geomName[J.geomPlayer]}，实为${geomName[J.geomTruth]}</span> <span class="pill ${J.fateOK ? 'y' : 'n'}">命运：你猜${fateName(J.Rp)}，实为${fateName(Rt)}</span> <span class="pill ${J.precise ? 'y' : 'n'}">参数${J.precise ? '精确' : '有偏差'}</span></p>
        <p><b style="color:var(--ink)">数据里的线索</b>：${signal}</p>
        <p class="note">1998 年两支团队就是这样从几十颗高红移超新星里读出加速膨胀的；本关把标准尺和恒星年龄也给了你，真实的宇宙学正是把这几类互相独立的尺子叠在一起定参数。</p>
        <p class="note">三张图上多了紫色虚线：真相的曲线。现在拖滑杆只是对照，不再计分。</p>
        <p><button class="btn small primary" id="b-again">再来一个隐藏宇宙</button></p></div>`;
      $('b-again').addEventListener('click', newHidden); render();
    });
    $('b-new').addEventListener('click', newHidden);
    $('b-csv').addEventListener('click', () => {
      if (!obs) return; let csv = '# 创世实验室 · 反推台 第一关 · 模拟数据（由隐藏参数算出并加噪声）\n# 标准烛光：z, mu(mag), sigma\n';
      for (const d of obs.sn) csv += `sn,${d.z},${d.mu},${d.sig}\n`; csv += '# 标准尺：z, theta(deg), sigma（尺长 147.09 Mpc 共动）\n';
      for (const d of obs.rulers) csv += `ruler,${d.z},${d.theta},${d.sig}\n`; csv += `# 最老恒星：age(Gyr), sigma\noldest,${obs.oldest.t},${obs.oldest.sig}\n`;
      if (window.GENESIS_ARTIFACT) { // Artifact 里不能直接下载：显示出来供复制
        let box = $('csv-box'); if (!box) { box = document.createElement('div'); box.id = 'csv-box'; box.style.marginTop = '10px'; $('b-csv').parentNode.parentNode.appendChild(box); }
        box.innerHTML = `<textarea class="num" style="width:100%;height:140px;font-size:11px" readonly></textarea><div class="bar"><button class="btn small" id="b-csv-copy">复制到剪贴板</button><span class="note">在 GitHub Pages 版本上这个按钮会直接下载 .csv 文件</span></div>`;
        box.querySelector('textarea').value = csv;
        $('b-csv-copy').addEventListener('click', () => { const ta = box.querySelector('textarea'); const done = () => toast('已复制'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(csv).then(done, () => { ta.select(); done(); }); else { ta.select(); done(); } });
        return;
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'genesis-lab-inverse-1.csv'; a.click();
    });
    window.addEventListener('resize', () => { if (current === 'inverse' && obs) render(); });
    return { render: () => { if (!obs) newHidden(); else render(); } };
  })();

  // 启动
  show(halls.includes(location.hash.slice(1)) ? location.hash.slice(1) : store.get('hall', 'overview'));
})();
