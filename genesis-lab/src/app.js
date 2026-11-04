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
  function when(tGyr) { return Math.abs(tGyr) < 1e-9 ? '<b>今天</b>' : (tGyr < 0 ? `<b>${gyr(-tGyr)}</b> 前` : `<b>${gyr(tGyr)}</b> 后`); } // 距今的时刻
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
    for (const mk of (o.marks || [])) { if (!isFinite(mk.x) || !isFinite(mk.y)) continue; const mx = X(mk.x), my = Y(mk.y); ctx.fillStyle = mk.color; ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill(); if (mk.label) { ctx.font = '11px Space Grotesk, sans-serif'; const tw = ctx.measureText(mk.label).width, right = mx + 6 + tw > padL + pw; ctx.textAlign = right ? 'right' : 'left'; ctx.fillText(mk.label, mx + (right ? -6 : 6), my - 6 < padT + 12 ? my + 15 : my - 6); } } // 标签贴顶就放到点下面，贴右就放到左边
    ctx.restore();
    return { X, Y, padL, padT, pw, ph };
  }

  // ---------- 导航 ----------
  const halls = Array.from(document.querySelectorAll('#tabs button')).map((b) => b.dataset.hall);
  let current = null;
  function show(hall) {
    if (!halls.includes(hall)) hall = 'overview';
    for (const h of halls) $('hall-' + h).hidden = h !== hall;
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.hall === hall);
    current = hall; store.set('hall', hall); { const bar = $('sticky-sum'); if (bar) bar.hidden = hall !== 'forge'; } try { if (location.hash !== '#' + hall) history.replaceState(null, '', '#' + hall); } catch (e) { /* 无妨 */ }
    if (hall === 'forge') forge.render(); if (hall === 'godel') godel.enter(); else godel.leave(); if (hall === 'inverse') inverse.render();
    if (window.GENESIS_Q_HALL) window.GENESIS_Q_HALL(hall);
    for (const f of (window.GENESIS_HALLS || [])) f(hall); // 其他展区（Mixmaster 等）各自挂的钩子
  }
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { show(b.dataset.hall); window.scrollTo({ top: 0 }); } });
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-scroll]'); if (a) { e.preventDefault(); const el = $(a.dataset.scroll); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { e.preventDefault(); show(b.dataset.go); window.scrollTo({ top: 0 }); } });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (halls.includes(h) && h !== current) show(h); });

  // ======================================================================
  // 创世台
  // ======================================================================
  const forge = (function () {
    const S = Object.assign({}, PRESETS[0].p);
    const hooks = { input: [], solved: [], preset: [], dice: [] }; // 量子版通过这些钩子改输入、加卡片
    const TODAY = 299; let R = null, frames = [], frame = TODAY, playing = false, alog = false, presetId = 'planck', galaxies = null, lastDraw = 0;
    const ids = ['H0', 'Om', 'Or', 'OL', 'w'];
    function toSlider(k, v) { return k === 'Or' ? (v <= 0 ? -7 : Math.max(-7, Math.log10(v))) : v; }
    function fromSlider(k, v) { return k === 'Or' ? (v <= -7 ? 0 : Math.pow(10, v)) : v; }
    function syncSliders() { for (const k of ids) $('s-' + k).value = toSlider(k, S[k]); labels(); }
    function labels() {
      $('v-H0').textContent = S.H0.toFixed(1) + ' km/s/Mpc'; $('v-Om').textContent = S.Om.toFixed(3); $('v-Or').textContent = (S.Or === 0 ? '0' : S.Or.toExponential(2)) + '（T₀ = ' + sig(COSMO.temperatureOf(S.Or, S.H0), 3) + ' K）';
      $('v-OL').textContent = S.OL.toFixed(3); $('v-w').textContent = S.w.toFixed(2);
      const Ok = 1 - S.Om - S.Or - S.OL; $('v-Ok').textContent = (Ok >= 0 ? '+' : '') + Ok.toFixed(3);
      $('v-Okword').textContent = Math.abs(Ok) < 1e-3 ? '平坦（欧几里得空间）' : (Ok > 0 ? '开放（双曲空间，负曲率）' : '封闭（三维球面，正曲率）');
    }
    for (const k of ids) $('s-' + k).addEventListener('input', () => { S[k] = fromSlider(k, +$('s-' + k).value); presetId = null; markPreset(); labels(); solve(); });
    function markPreset() { for (const b of document.querySelectorAll('#presets .chip')) b.classList.toggle('on', b.dataset.id === presetId); const pr = PRESETS.find((p) => p.id === presetId); $('preset-blurb').innerHTML = pr ? `<b style="color:var(--ink)">${pr.name}</b>${pr.real ? ' <span class="tag real">真实</span>' : ' <span class="tag sim">理想化</span>'} — ${pr.blurb}${pr.source ? `<br><span style="color:var(--faint)">来源：${pr.source}</span>` : ''}` : '（自定义参数）'; }
    const chips = $('presets');
    for (const p of PRESETS) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = p.id; b.innerHTML = `${p.name}<small>${p.sub}</small>`; b.addEventListener('click', () => applyPreset(p.id)); chips.appendChild(b); }
    function applyPreset(id) { const p = PRESETS.find((x) => x.id === id); if (!p) return; Object.assign(S, p.p); for (const f of hooks.preset) f(p, S); presetId = id; markPreset(); syncSliders(); frame = TODAY; solve(); }
    $('b-planck').addEventListener('click', () => applyPreset('planck'));
    $('b-dice').addEventListener('click', () => {
      const r = Math.random; S.H0 = +(30 + 80 * r()).toFixed(1); S.Om = +(Math.pow(10, -2.5 + 3.5 * r())).toFixed(3); S.Or = +Math.pow(10, -6 + 5.5 * r()).toExponential(2);
      S.OL = +((r() < 0.75 ? 1 : -1) * Math.pow(10, -2 + 3.3 * r())).toFixed(3); S.OL = Math.max(-3, Math.min(3, S.OL)); S.w = +(-1.7 + 1.5 * r()).toFixed(2);
      for (const f of hooks.dice) f(S); presetId = null; markPreset(); syncSliders(); frame = TODAY; solve(); toast('掷出了一个宇宙——看看它活不活得了');
    });
    // ---- 求解与帧 ----
    function solve() {
      let input = Object.assign({}, S); for (const f of hooks.input) input = f(input, S) || input;
      R = COSMO.solve(input);
      for (const f of hooks.solved) f(R, S, input);
      buildFrames(); NB.invalidate(); PMAP.update(input); render();
    }
    function buildFrames() {
      frames = []; const N = 300;
      // 过去：有大爆炸 → ln a 均匀；否则按时间均匀
      if (R.origin === 'bigbang' || R.quantumBounce) { const l0 = Math.log(R.quantumBounce ? Math.max(R.aMin, 1e-9) : 1e-6); for (let i = 0; i < N; i++) { const a = Math.exp(l0 + (0 - l0) * i / (N - 1)); frames.push({ t: COSMO.tOfA(R, a), a }); } }
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
    function render() { if (!R) return; drawMovie(); fateCards(); drawA(); drawGrowth(); diag(); eqs(); timeline(); PMAP.draw(); }
    function GYR() { return COSMO.GYR / S.H0; }
    function fateCards() {
      const g = GYR(), m = R.m, cards = [];
      const age = R.origin === 'bigbang' || R.quantumBounce ? gyr(R.age * g) : (R.origin === 'bounce' ? '无大爆炸' : '无限');
      cards.push({ g: 'age', c: 'gold', k: '年龄', v: age, i: R.origin === 'bigbang' ? '从奇点到今天' : (R.quantumBounce ? `从量子反弹（a = ${R.aMin.toExponential(1)}）到今天` : (R.origin === 'bounce' ? `在 a = ${sig(R.aMin, 2)} 反弹，${gyr(R.tBounce * g)}前` : '密度不发散，没有奇点')) });
      let fate, fi;
      if (R.fate === 'crunch') { fate = '大坍缩'; fi = `${gyr(R.tEnd * g)}后压回奇点；先膨胀到 a = ${sig(R.aMax, 3)}（${gyr(R.tTurn * g)}后回转）`; }
      else if (R.fate === 'rip') { fate = '大撕裂'; fi = `${gyr(R.tEnd * g)}后 a → ∞`; }
      else { fate = R.accelerating ? '永远膨胀（加速）' : '永远膨胀（减速或匀速）'; fi = R.accelerating ? '暗能量主导，走向 de Sitter 式的空寂' : '没有事件视界'; }
      cards.push({ g: 'fate', c: R.fate === 'eternal' ? 'teal' : 'coral', k: '命运', v: fate, i: fi });
      const Rc = R.curvRadius * COSMO.CKMS / S.H0 / 1000;
      cards.push({ g: 'Ok', c: 'violet', k: '几何', v: R.geometry === 'flat' ? '平坦' : (R.geometry === 'open' ? '开放' : '封闭'), i: R.geometry === 'flat' ? (isFinite(Rc) ? `|Ω_k| < 0.002，曲率半径 > ${sig(Rc, 2)} Gpc` : '曲率半径无穷大') : `曲率半径 ${sig(Rc, 3)} Gpc` });
      cards.push({ g: 'q0', c: R.q0 < 0 ? 'teal' : 'coral', k: '减速参数 $q_0$', v: sig(R.q0, 3), i: R.q0 < 0 ? '现在正在加速' : '现在正在减速' });
      const ph = R.particleHorizon * COSMO.CKMS / S.H0 / 306.6, eh = R.eventHorizon * COSMO.CKMS / S.H0 / 306.6;
      cards.push({ g: 'horizons', c: 'gold', k: '视界', v: `${isFinite(ph) ? sig(ph, 3) + ' Gly' : '无'} / ${isFinite(eh) ? sig(eh, 3) + ' Gly' : '无'}`, i: '粒子视界 / 事件视界（共动，今天）' });
      let ep = '';
      if (R.origin === 'bigbang' || R.quantumBounce) {
        const recOK = isFinite(R.aRec) && R.aRec <= 1 && R.aRec > (R.aMin || 0), tRec = recOK ? COSMO.tOfA(R, R.aRec) + R.age : NaN;
        const eqOK = isFinite(R.aEq) && R.aEq > 0 && R.aEq < 1 && R.aEq > (R.aMin || 0), tEq = eqOK ? COSMO.tOfA(R, R.aEq) + R.age : NaN;
        ep = `光子退耦 ${recOK ? gyr(tRec * g) : (R.T0 > 0 ? (R.aRec === Infinity ? '至今没有' : (R.aRec <= (R.aMin || 0) ? '从一开始就透明' : '从未')) : '没有辐射')}；物质-辐射相等 ${eqOK ? gyr(tEq * g) : (R.aEq <= (R.aMin || 0) || R.T0 === 0 ? '一直是物质主导' : '到今天还是辐射主导')}；物质-暗能量相等 ${isFinite(R.aLambda) ? (R.aLambda <= 1 ? gyr((COSMO.tOfA(R, R.aLambda) + R.age) * g) : '还没发生') : '从未'}`;
      }
      else ep = '没有热的早期，纪元不适用';
      cards.push({ g: 'epochs', c: 'teal', k: '关键纪元（' + (R.quantumBounce ? '反弹后' : '大爆炸后') + '）', v: R.origin === 'bigbang' || R.quantumBounce ? `T₀ = ${sig(R.T0, 4)} K` : '—', i: ep });
      $('fate-cards').innerHTML = cards.map((c) => `<div class="k ${c.c}"><small${c.g ? ` data-g="${c.g}"` : ''}>${c.k}</small><b>${c.v}</b><i>${c.i}</i></div>`).join('');
      if (window.GENESIS.decorate) { window.GENESIS.decorate($('fate-cards')); window.GENESIS.tex($('fate-cards')); }
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
      // 手机上旋钮和结果隔着几屏：底部贴一条摘要
      let bar = $('sticky-sum'); if (!bar) { bar = document.createElement('div'); bar.id = 'sticky-sum'; bar.className = 'sticky-sum'; document.body.appendChild(bar); }
      const fate = R.fate === 'crunch' ? '大坍缩' : (R.fate === 'rip' ? '大撕裂' : '永远膨胀'), age = R.origin === 'bigbang' || R.quantumBounce ? gyr(R.age * GYR()) : (R.origin === 'bounce' ? '无大爆炸' : '无限');
      const extra = R.diag.filter((d) => d.key === 'helium').map((d) => d.title.replace('原初氦 ', '氦 ')).join('');
      bar.innerHTML = `<span class="verdict ${R.verdict}">${lv[R.verdict]}</span><span>${fate}</span><span>年龄 ${age}</span>${extra ? `<span>${extra}</span>` : ''}<a href="#diag" data-scroll="diag">看诊断 ↓</a>`;
      bar.hidden = current !== 'forge';
      const DG = { origin: 'age', galaxies: 'growth', stars: 'diag', helium: 'Yp', recomb: 'zdec', hydrogen: 'Q' };
      $('diag').innerHTML = R.diag.map((d) => `<li><div class="lv ${d.level}"></div><div><b${DG[d.key] ? ` data-g="${DG[d.key]}"` : ''}>${d.title}</b><span>${d.detail}</span></div></li>`).join('');
      if (window.GENESIS.decorate) { window.GENESIS.decorate($('diag')); window.GENESIS.tex($('diag')); }
    }
    function eqs() {
      const m = R.m, n = (v) => `\\textcolor{#f2c14e}{${sig(v, 4).replace(/e([+-]?\d+)/, '\\times10^{$1}')}}`, pw = sig(-3 * (1 + m.w), 3);
      const lqc = m.rhoC ? `\\Big(1 - \\tfrac{\\rho}{\\rho_c}\\Big)` : '';
      $('eqs').innerHTML = `<div class="eqtex">$$\\frac{H^2}{H_0^2} = \\Big[${n(m.Or)}\\,a^{-4} + ${n(m.Om)}\\,a^{-3} + ${n(m.OL)}\\,a^{${pw}}\\Big]${lqc} + ${n(m.Ok)}\\,a^{-2}$$</div>
        <div class="eqtex">$$\\frac{\\ddot a}{a} = -\\frac{H_0^2}{2}\\Big[\\rho + 3p\\Big]${m.rhoC ? '_{\\text{LQC}}' : ''},\\qquad \\rho = ${n(m.Or)}\\,a^{-4} + ${n(m.Om)}\\,a^{-3} + ${n(m.OL)}\\,a^{${pw}},\\quad p = \\tfrac13\\,${n(m.Or)}\\,a^{-4} + (${sig(m.w, 3)})\\,${n(m.OL)}\\,a^{${pw}}$$</div>
        <p class="note" style="margin-top:6px">$H_0 = ${S.H0}$ km/s/Mpc → $1/H_0 = ${sig(GYR(), 4)}$ Gyr，$c/H_0 = ${sig(COSMO.CKMS / S.H0, 4)}$ Mpc。页面从今天（$a=1$，$\\dot a = H_0$）出发，用四阶龙格–库塔向过去和未来各积一遍加速度方程，并和 $\\int da/(aE)$ 的数值积分互相核对。黄色是你现在填的数。</p>`;
      if (window.GENESIS.tex) window.GENESIS.tex($('eqs'));
    }
    function timeline() {
      const tl = $('timeline'), g = GYR(), marks = [];
      const at = (a) => { let best = 0; for (let i = 0; i < frames.length; i++) if (Math.abs(Math.log(frames[i].a) - Math.log(a)) < Math.abs(Math.log(frames[best].a) - Math.log(a))) best = i; return best; };
      const atT = (t) => { let best = 0; for (let i = 0; i < frames.length; i++) if (Math.abs(frames[i].t - t) < Math.abs(frames[best].t - t)) best = i; return best; };
      if (R.origin === 'bigbang' || R.quantumBounce) { marks.push([0, R.quantumBounce ? '量子反弹' : '大爆炸']); if (isFinite(R.aRec) && R.aRec <= 1 && R.aRec > (R.aMin || 0)) marks.push([at(R.aRec), '复合']); if (R.growth && isFinite(R.growth.aFirst) && R.growth.aFirst < 1) marks.push([at(R.growth.aFirst), '第一批星系']); }
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
    // ---- 真引力 N 体（二维粒子-网格，nbody.js）----
    const NB = (function () {
      const phone = Math.min(window.innerWidth || 1e9, window.innerHeight || 1e9) < 700 || /Android|iPhone|iPad/i.test(navigator.userAgent || '');
      const N = phone ? 128 : 256, np = N, L = 300; // 网格 / 每边粒子数（每格一个，散粒噪声小）/ 盒长 h⁻¹Mpc
      const st = { on: false, sim: null, seed: 7, dirty: true, snaps: null, stats: null, s8: null, re: null, im: null, pending: false, loop: false, done: false, note: '', off: null, lut: null, timer: null, firstA: NaN, t0: NaN };
      function d8At(a) { const G = R.growth; if (!G) return NaN; const as = G.as, d = G.d8; if (a <= as[0]) return d[0]; let lo = 0, hi = as.length - 1; if (a >= as[hi]) return d[hi]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (as[m] <= a) lo = m; else hi = m; } const u = (Math.log(a) - Math.log(as[lo])) / (Math.log(as[hi]) - Math.log(as[lo])); return d[lo] + (d[hi] - d[lo]) * u; }
      function usable() { return !!(R && R.growth && (R.origin === 'bigbang' || R.quantumBounce)); }
      function build() { // 按当前宇宙重做初条件（代价约 0.1 s，所以参数拖动时延迟重算）
        if (!R) return; st.sim = null; st.snaps = new Array(frames.length).fill(null); st.stats = new Array(frames.length).fill(null); st.s8 = new Array(frames.length).fill(null); st.done = false; st.dirty = false; st.note = '';
        if (!usable()) return;
        let a0 = 0.02; const G = R.growth; if (R.quantumBounce && R.aMin > a0 / 2) a0 = Math.min(0.5, R.aMin * 2); // 反弹后从两倍的最小尺度开始
        let amp = d8At(a0); let guard = 0; while (amp > 0.12 && a0 > 2e-3 && guard++ < 40) { a0 *= 0.8; amp = d8At(a0); } // 涨落太大就提前开始，保证初条件是线性的
        if (!(amp > 0) || !isFinite(amp)) amp = 1e-4;
        const m = R.m, h = S.H0 / 100, q = window.GENESIS_QSTATE ? window.GENESIS_QSTATE() : null, Ob = q ? q.Ob : 0.049, ns = q ? q.ns : 0.965;
        const f0 = clamp((Math.log(d8At(a0 * 1.02)) - Math.log(d8At(a0 / 1.02))) / (2 * Math.log(1.02)), 0, 1.5); // 起点的增长率 f = dlnD/dlna（辐射期里远小于 1：Mészáros）
        st.sim = new NBODY.PM2D({ N, np, L, seed: st.seed, Om: Math.max(m.Om, 1e-4), Ob: Math.min(Ob, Math.max(m.Om, 1e-4) * 0.9), h, ns, aInit: a0, amp, f: isFinite(f0) ? f0 : 1,
          E: (a) => { const e2 = COSMO.E2(m, a); return e2 > 0 ? Math.sqrt(e2) : 1e-3; }, aOf: (t) => aAt(t <= 0 ? R.past : R.fut, t), tOf: (a) => COSMO.tOfA(R, a) });
        st.firstA = a0; st.t0 = st.sim.t; st.pending = false;
      }
      function invalidate() { st.dirty = true; if (!st.on) return; clearTimeout(st.timer); st.timer = setTimeout(() => { st.timer = null; if (st.on) { build(); drawMovie(); } }, 350); }
      function reseed() { st.seed = (st.seed * 7 + 13) % 100003 + 1; build(); drawMovie(); toast('换了一组随机相位——同样的宇宙，另一片天区'); }
      // 把模拟推进到第 k 帧的时刻；预算 ms 毫秒；沿途经过的帧都存快照。返回是否到达
      function advanceTo(k, budget) {
        const sim = st.sim; if (!sim || st.done) return true; const want = frames[k].t, t0 = performance.now(); let passed = sim.t >= want;
        while (!passed && performance.now() - t0 < budget) {
          const tPrev = sim.t; sim.step(0.05);
          for (let j = 0; j < frames.length; j++) if (!st.snaps[j] && frames[j].t > tPrev && frames[j].t <= sim.t) record(j);
          if (!isFinite(sim.a) || sim.a <= 0 || sim.a > 30 || (R.fate === 'crunch' && sim.t > R.tTurn && sim.a < st.firstA * 0.5) || sim.steps > 3000) { st.done = true; st.note = sim.a > 30 ? 'a > 30：共动结构已冻结（撕裂发生在星系内部，网格看不见）' : (R.fate === 'crunch' ? '收缩到 a < a_i：密度场已超出粒子-网格法的分辨率' : '模拟已停在这里'); return true; }
          passed = sim.t >= want;
        }
        return passed;
      }
      // 存这一帧：量化的密度场（画图用）+ 最密格子 + 真实场的 δ₈（模拟每步顺手算出，和线性理论的 δ₈ 同一定义；不从量化后的字节反推，那样会把 1+δ 的量化偏移当成涨落）
      function record(j) { const sim = st.sim, out = new Uint8Array(sim.N * sim.N); st.stats[j] = sim.snapshot(out); st.snaps[j] = out; st.s8[j] = sim.s8; }
      function lut() { // 密度色标：空洞深蓝 → 平均紫灰 → 纤维金 → 团块白
        if (st.lut) return st.lut; const stops = [[0, 8, 12, 40], [0.29, 40, 50, 120], [0.5, 120, 90, 150], [0.72, 230, 170, 80], [0.9, 255, 235, 180], [1, 255, 255, 255]]; const out = new Uint8ClampedArray(256 * 4);
        for (let i = 0; i < 256; i++) { const u = i / 255; let s = 0; while (s < stops.length - 2 && u > stops[s + 1][0]) s++; const A = stops[s], B = stops[s + 1], f = (u - A[0]) / (B[0] - A[0]); for (let c = 0; c < 3; c++) out[i * 4 + c] = A[c + 1] + (B[c + 1] - A[c + 1]) * f; out[i * 4 + 3] = 255; }
        st.lut = out; return out;
      }
      function paint(ctx, bytes, x, y, size, n) { // 把 n×n 的字节场画成 size×size 的方块
        if (!st.off || st.off.width !== n) { st.off = document.createElement('canvas'); st.off.width = st.off.height = n; }
        const octx = st.off.getContext('2d'), img = octx.createImageData(n, n), L = lut(), d = img.data;
        for (let k = 0; k < n * n; k++) { const b = bytes[k] * 4; d[k * 4] = L[b]; d[k * 4 + 1] = L[b + 1]; d[k * 4 + 2] = L[b + 2]; d[k * 4 + 3] = 255; }
        octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(st.off, x, y, size, size);
      }
      function linearBytes(factor) { // N 体开始之前：线性场 δ₀ × D(a)/D(a_i)
        const sim = st.sim, n = sim.N * sim.N, out = new Uint8Array(n), d0 = sim.delta0; let max = 0, s2 = 0;
        for (let k = 0; k < n; k++) { const r = Math.max(1e-3, 1 + d0[k] * factor); if (r > max) max = r; s2 += (r - 1) * (r - 1); out[k] = Math.max(0, Math.min(255, Math.round((Math.log10(r) + 1) / 3.5 * 255))); }
        return { out, max, rms: Math.sqrt(s2 / n) };
      }
      // 画这一帧；返回 true 表示画完了（false = 还在算，调用者应该再来）
      function draw(ctx, w, h, f, k) {
        if (!st.sim || (st.dirty && !st.timer)) build();
        const size = Math.min(w, h) - 16, wide = w - size >= 150, x0 = wide ? 8 : (w - size) / 2, y0 = (h - size) / 2; let reached = true, bytes = null, stat = null, phase = '';
        if (!usable() || !st.sim) { ctx.fillStyle = CSS('--dim'); ctx.font = '13px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('没有热大爆炸，结构形成不适用——换一组有大爆炸的参数', w / 2, h / 2); return true; }
        const sim = st.sim;
        if (f.t < st.t0) { const lb = linearBytes(d8At(f.a) / Math.max(1e-12, d8At(st.firstA))); bytes = lb.out; stat = lb; phase = '线性阶段（N 体从 a = ' + sig(st.firstA, 2) + ' 开始）'; }
        else if (st.snaps[k]) { bytes = st.snaps[k]; stat = st.stats[k]; phase = '真引力 N 体'; }
        else { reached = advanceTo(k, 28); if (st.snaps[k]) { bytes = st.snaps[k]; stat = st.stats[k]; phase = '真引力 N 体'; } else { const out = new Uint8Array(sim.N * sim.N); stat = sim.snapshot(out); bytes = out; phase = reached ? '真引力 N 体' : `计算中… 已算到 a = ${sig(sim.a, 3)}（第 ${sim.steps} 步）`; } }
        paint(ctx, bytes, x0, y0, size, sim.N);
        ctx.strokeStyle = 'rgba(152,164,199,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
        // 右侧色标（宽屏）
        if (wide) { const bx = x0 + size + 14, by = y0 + 128, bh = size - 140, Lt = lut(); for (let i = 0; i < bh; i++) { const b = Math.round((1 - i / bh) * 255) * 4; ctx.fillStyle = `rgb(${Lt[b]},${Lt[b + 1]},${Lt[b + 2]})`; ctx.fillRect(bx, by + i, 10, 1.5); }
          ctx.fillStyle = 'rgba(233,237,249,0.8)'; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'left'; for (const [v, lab] of [[2.5, '1+δ=300'], [2, '100'], [1, '10'], [0, '1'], [-1, '0.1']]) { const yy = by + bh * (1 - (v + 1) / 3.5); ctx.fillText(lab, bx + 14, yy + 4); } ctx.font = '11px Space Grotesk, sans-serif'; ctx.fillText('密度（对数）', bx, by - 8); }
        const hdr = $('movie-hud'), g = GYR(), T = R.T0 / f.a, H = aAtH(f), t = f.t * g;
        const phys = L / (S.H0 / 100) * f.a, physTxt = phys >= 1000 ? sig(phys / 1000, 3) + ' Gpc' : sig(phys, 3) + ' Mpc';
        ctx.font = '12px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; const cap = `方框 ${L} h⁻¹Mpc 共动 = 物理 ${physTxt}`; const cw = ctx.measureText(cap).width; ctx.fillStyle = 'rgba(6,9,19,0.6)'; ctx.fillRect(x0 + 6, y0 + size - 24, cw + 10, 18); ctx.fillStyle = 'rgba(233,237,249,0.85)'; ctx.fillText(cap, x0 + 11, y0 + size - 11);
        const contracting = R.fate === 'crunch' && f.t > R.tTurn, lin = d8At(f.a), s8 = st.snaps[k] && isFinite(st.s8[k]) ? st.s8[k] : null, linear = f.t < st.t0;
        // 回转之后线性增长不再是 a 的函数（收缩段里扰动继续长，不会倒回去），按 a 查表没有意义
        hdr.innerHTML = `${when(t)}${R.origin === 'bigbang' || R.quantumBounce ? `<br>（${R.quantumBounce ? '反弹' : '大爆炸'}后 <b>${gyr((f.t + R.age) * g)}</b>）` : ''}<br>a = <b>${sig(f.a, 3)}</b>　T = <b>${sig(T, 3)} K</b><br>H = <b>${isFinite(H) ? sig(H * S.H0, 3) : '—'}</b> km/s/Mpc<br>δ₈ 线性 <b>${contracting ? '不适用（回转后）' : sig(lin, 2)}</b>${s8 !== null ? `<br>δ₈ N 体实测 <b>${sig(s8, 2)}</b>` : ''}${stat && !linear ? `<br>最密格子 1+δ = <b>${sig(stat.max, 2)}</b>` : ''}`;
        let ep = phase; if (st.dirty) ep += '（参数已变，马上重算）'; else if (st.done && st.note && f.t >= sim.t) ep += ' · ' + st.note;
        else if (contracting && !linear) ep += ' · 收缩段：已经成团的结构保持物理大小，在越来越小的共动方框里显得散开';
        else if (phase.startsWith('真引力') && s8 !== null && lin > 0.3 && s8 < 0.9 * lin) ep += ' · N 体实测比线性低：非线性把 8 Mpc 尺度的功率搬去了更小的尺度（团块变密、周围掏空），线性外推在这里已不作数';
        else if (phase.startsWith('真引力') && lin > 1) ep += ' · 纤维和团块：线性理论在这里已经失效，N 体算的才是真的';
        else if (phase.startsWith('真引力') && lin < 0.05) ep += ' · 涨落太小，还看不出结构（色标是对数的）';
        if (!st.done && !st.dirty && sim.t < frames[frames.length - 1].t && !phase.startsWith('计算中')) ep += `　｜ 已算到 a = ${sig(sim.a, 3)}，再往后的帧边放边算`;
        $('movie-epoch').textContent = ep;
        return reached;
      }
      function setMode(on) {
        st.on = on; $('nb-on').classList.toggle('on', on); $('nb-off').classList.toggle('on', !on); $('nb-bar').hidden = !on; $('movie-sub').textContent = on ? `二维粒子-网格 N 体：${N}² 格、${np}² 粒子在你拨的 a(t) 背景里真的互相吸引（三维宇宙的一个薄片近似）。方框是 ${L} h⁻¹Mpc 的共动薄片（点阵画法是 2 Gpc 的立方体），帧是边放边算的` : '共动网格上的星系随尺度因子 a(t) 伸缩；颜色随背景温度变化';
        const cv = $('c-movie'); if (on) cv.dataset.minh = String(Math.min(cv.clientWidth || 600, 440)); else delete cv.dataset.minh; cv.parentElement.classList.toggle('nb', on);
        if (on && R && (st.dirty || !st.sim)) build(); if (R) { drawMovie(); if (!on) drawA(); }
      }
      $('nb-on').addEventListener('click', () => setMode(true)); $('nb-off').addEventListener('click', () => setMode(false)); $('nb-reseed').addEventListener('click', reseed);
      $('nb-run').addEventListener('click', () => { if (!st.on) setMode(true); frame = frames.findIndex((f) => f.a >= st.firstA); if (frame < 0) frame = 0; playing = true; $('b-play').textContent = '⏸ 暂停'; requestAnimationFrame(tick); });
      return { st, invalidate, draw, setMode, get on() { return st.on; }, usable };
    })();
    // ---- 参数空间地图：Ω_m–Ω_Λ 平面逐格完整求解（Worker 里算，先粗后细）----
    const PMAP = (function () {
      const X0 = -3, X1 = Math.log10(3.2), Y0 = -1.6, Y1 = 3.2, NX = 80, NY = 120, CX = 20, CY = 30; // 横轴 log10 Ω_m（10⁻³ → 3.2），纵轴 Ω_Λ
      const fx = (Om) => Math.log10(Math.max(Om, 1e-3)), ix = (u) => Math.pow(10, u), y2 = (y) => y.toFixed(2);
      const st = { fine: new Float32Array(NX * NY * 5), have: new Uint8Array(NY), coarse: new Float32Array(CX * CY * 5), coarseDone: false, key: null, job: 0, worker: null, layer: 'fate', timer: null, base: null, status: '', fallback: null, img: null, hover: null };
      // 单格：[命运码, 宜居码, 年龄(1/H0), 第一批星系的 a, 量子反弹]；命运码 0 大坍缩 1 永远膨胀(减速) 2 永远膨胀(加速) 3 大撕裂 4 没有大爆炸 5 其他
      const CELL = `function cell(C, base, Om, OL) { var R; try { R = C.solve(Object.assign({}, base, { Om: Om, OL: OL }), { lite: true }); } catch (e) { return [5, 0, NaN, NaN, 0]; }
        var bb = R.origin === 'bigbang' || R.quantumBounce, f; if (!bb) f = R.origin === 'bounce' ? 4 : 5; else if (R.fate === 'crunch') f = 0; else if (R.fate === 'rip') f = 3; else f = R.accelerating ? 2 : 1;
        var v = R.verdict === 'alive' ? 2 : (R.verdict === 'marginal' ? 1 : 0); return [f, v, bb ? R.age : NaN, R.growth && isFinite(R.growth.aFirst) ? R.growth.aFirst : NaN, R.quantumBounce ? 1 : 0]; }`;
      const WORKER = `self.onmessage = function (e) { var d = e.data, row = new Float32Array(d.nx * 5); for (var j = 0; j < d.ny; j++) { for (var i = 0; i < d.nx; i++) { var c = cell(COSMO, d.base, Math.pow(10, d.x0 + (i + 0.5) * d.dx), d.y0 + (j + 0.5) * d.dy); for (var k = 0; k < 5; k++) row[i * 5 + k] = c[k]; } self.postMessage({ job: d.job, pass: d.pass, j: j, row: row }); } };`;
      let cellFn = null; // 主线程的后备
      function cellMain(base, Om, OL) { if (!cellFn) cellFn = new Function('C', 'base', 'Om', 'OL', CELL + ' return cell(C, base, Om, OL);'); return cellFn(COSMO, base, Om, OL); }
      function baseOf(input) { const b = Object.assign({}, input); delete b.Om; delete b.OL; return b; }
      function baseOr() { const b = st.base; if (!b) return S.Or; return b.Or !== undefined ? b.Or : COSMO.omegaR(b.T0 || 0, b.H0, b.Neff); }
      function update(input) { // 每次求解后：参数底座变了就重算，否则只重画十字
        const base = baseOf(input), key = JSON.stringify(base);
        if (key !== st.key) { st.key = key; st.base = base; st.status = '参数变了，马上重算…'; clearTimeout(st.timer); st.timer = setTimeout(() => { st.timer = null; compute(); }, 400); }
        draw(); if (!st.hover) readCurrent();
      }
      function readCurrent() { const p = PRESETS.find((q) => Math.abs(q.p.Om - S.Om) < 1e-9 && Math.abs(q.p.OL - S.OL) < 1e-9) || null; readout(S.Om, S.OL, at(S.Om, S.OL), p, true); } // 没悬停时读十字所在的格
      function compute() {
        st.job++; st.have.fill(0); st.coarseDone = false; const job = st.job, base = st.base;
        const jobs = [{ pass: 'coarse', nx: CX, ny: CY }, { pass: 'fine', nx: NX, ny: NY }].map((o) => Object.assign(o, { job, base, x0: X0, y0: Y0, dx: (X1 - X0) / o.nx, dy: (Y1 - Y0) / o.ny }));
        if (st.worker) { st.worker.terminate(); st.worker = null; } if (st.fallback) { cancelAnimationFrame(st.fallback); st.fallback = null; }
        const onRow = (m) => { if (m.job !== st.job) return; if (m.pass === 'coarse') { st.coarse.set(m.row, m.j * CX * 5); if (m.j === CY - 1) st.coarseDone = true; } else { st.fine.set(m.row, m.j * NX * 5); st.have[m.j] = 1; } const done = st.have.every((h) => h); st.status = done ? `${NX}×${NY} 格 · 每格一次完整求解` : `计算中 ${m.pass === 'coarse' ? '粗' : '细'}网格 ${Math.round((m.pass === 'coarse' ? (m.j + 1) / CY * 100 * 0.1 : 10 + (m.j + 1) / NY * 90))}%`; if (m.j % 4 === 0 || done || m.pass === 'coarse') { draw(); if (!st.hover) readCurrent(); } };
        try {
          if (!window.GENESIS_COSMO_SRC || typeof Worker === 'undefined') throw new Error('no worker');
          const blob = new Blob([window.GENESIS_COSMO_SRC + '\n' + CELL + '\n' + WORKER], { type: 'text/javascript' }), url = URL.createObjectURL(blob);
          st.worker = new Worker(url); URL.revokeObjectURL(url); st.worker.onmessage = (e) => onRow(e.data); st.worker.onerror = () => { st.worker.terminate(); st.worker = null; mainThread(jobs, onRow); };
          for (const jb of jobs) st.worker.postMessage(jb);
        } catch (e) { mainThread(jobs, onRow); }
      }
      function mainThread(jobs, onRow) { // 没有 Worker 时在主线程分帧算
        let q = 0, j = 0; const step = () => { const t0 = performance.now(); while (performance.now() - t0 < 24 && q < jobs.length) { const d = jobs[q], row = new Float32Array(d.nx * 5); for (let i = 0; i < d.nx; i++) { const c = cellMain(d.base, ix(d.x0 + (i + 0.5) * d.dx), d.y0 + (j + 0.5) * d.dy); for (let k = 0; k < 5; k++) row[i * 5 + k] = c[k]; } onRow({ job: d.job, pass: d.pass, j, row }); if (++j >= d.ny) { j = 0; q++; } } if (q < jobs.length) st.fallback = requestAnimationFrame(step); else st.fallback = null; }; st.fallback = requestAnimationFrame(step); }
      function at(Om, y) { // 取 (Ω_m, Ω_Λ) 处的格值：有细格用细格，否则粗格
        const x = fx(Om), i = Math.floor((x - X0) / (X1 - X0) * NX), j = Math.floor((y - Y0) / (Y1 - Y0) * NY); if (i < 0 || i >= NX || j < 0 || j >= NY) return null;
        if (st.have[j]) return Array.from(st.fine.subarray((j * NX + i) * 5, (j * NX + i) * 5 + 5));
        if (!st.coarseDone) return null; const ci = Math.floor((x - X0) / (X1 - X0) * CX), cj = Math.floor((y - Y0) / (Y1 - Y0) * CY); return Array.from(st.coarse.subarray((cj * CX + ci) * 5, (cj * CX + ci) * 5 + 5));
      }
      // 命运色：减速用蓝、加速用青，暗下去（死寂）也分得开
      const FATE = [[232, 112, 95], [85, 125, 215], [90, 205, 190], [170, 120, 230], [110, 115, 130], [60, 60, 70]], FATE_N = ['大坍缩', '永远膨胀（减速）', '永远膨胀（加速）', '大撕裂', '没有大爆炸', '—'], VERD = ['死寂', '勉强', '可能宜居'];
      function ramp(u, stops) { u = clamp(u, 0, 1); let s = 0; while (s < stops.length - 2 && u > stops[s + 1][0]) s++; const A = stops[s], B = stops[s + 1], f = (u - A[0]) / (B[0] - A[0]); return [0, 1, 2].map((c) => A[c + 1] + (B[c + 1] - A[c + 1]) * f); }
      const AGE_STOPS = [[0, 20, 30, 70], [0.35, 70, 90, 190], [0.65, 230, 170, 80], [1, 255, 250, 230]];
      function color(c, H0) {
        if (!c) return [14, 18, 36]; const f = c[0] | 0;
        if (st.layer === 'fate') { const k = [0.36, 0.66, 1][c[1] | 0]; return FATE[f].map((v) => v * k); }
        if (f === 4 || f === 5) return [90, 92, 104];
        if (st.layer === 'age') { const gy = c[2] * COSMO.GYR / H0; if (!isFinite(gy)) return [90, 92, 104]; return ramp((Math.log10(gy) + 1) / 3.5, AGE_STOPS); }
        const aF = c[3]; if (!isFinite(aF)) return [38, 40, 60]; return ramp(1 - (Math.log10(aF) + 3) / 3, AGE_STOPS);
      }
      function draw() {
        const cv = $('c-pmap'); if (!cv || current !== 'forge') return; const { ctx, w, h } = fit(cv); ctx.clearRect(0, 0, w, h);
        const padL = 44, padB = 34, padT = 8, padR = 8, pw = w - padL - padR, ph = h - padT - padB, H0 = st.base ? st.base.H0 : S.H0;
        const X = (x) => padL + (x - X0) / (X1 - X0) * pw, Y = (y) => padT + ph - (y - Y0) / (Y1 - Y0) * ph, XO = (Om) => X(fx(Om));
        // 格子 → 图像（细格缺的行用粗格补）
        if (!st.img) { st.img = document.createElement('canvas'); st.img.width = NX; st.img.height = NY; }
        const ic = st.img.getContext('2d'), im = ic.createImageData(NX, NY), d = im.data;
        for (let j = 0; j < NY; j++) { const row = NY - 1 - j; for (let i = 0; i < NX; i++) { let c = null; if (st.have[j]) c = st.fine.subarray((j * NX + i) * 5, (j * NX + i) * 5 + 5); else if (st.coarseDone) { const ci = Math.floor(i * CX / NX), cj = Math.floor(j * CY / NY); c = st.coarse.subarray((cj * CX + ci) * 5, (cj * CX + ci) * 5 + 5); } const rgb = color(c, H0), o = (row * NX + i) * 4; d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255; } }
        ic.putImageData(im, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(st.img, padL, padT, pw, ph); ctx.imageSmoothingEnabled = true;
        // 坐标轴
        ctx.font = '11px JetBrains Mono, monospace'; ctx.fillStyle = CSS('--dim'); ctx.strokeStyle = 'rgba(152,164,199,0.25)'; ctx.lineWidth = 1;
        for (const [v, lab] of [[1e-3, '0.001'], [1e-2, '0.01'], [0.1, '0.1'], [1, '1'], [3, '3']]) { ctx.textAlign = 'center'; ctx.fillText(lab, XO(v), h - padB + 14); if (v < 3) { ctx.beginPath(); ctx.moveTo(XO(v), padT); ctx.lineTo(XO(v), padT + ph); ctx.stroke(); } }
        for (let y = -1; y <= Y1 + 1e-9; y += 1) { ctx.textAlign = 'right'; ctx.fillText(String(y), padL - 6, Y(y) + 4); ctx.beginPath(); ctx.moveTo(padL, Y(y)); ctx.lineTo(padL + pw, Y(y)); ctx.stroke(); }
        ctx.font = '12px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('物质 Ω_m（对数）', padL + pw / 2, h - 6); ctx.save(); ctx.translate(12, padT + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('暗能量 Ω_Λ', 0, 0); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, pw, ph); ctx.clip();
        // 平坦线 Ω_m + Ω_Λ + Ω_r = 1；q0 = 0 线
        const Or = baseOr(), wv = st.base ? st.base.w : S.w;
        const curve = (fn) => { ctx.beginPath(); for (let k = 0; k <= 120; k++) { const u = X0 + (X1 - X0) * k / 120, y = fn(ix(u)); if (k === 0) ctx.moveTo(X(u), Y(y)); else ctx.lineTo(X(u), Y(y)); } ctx.stroke(); };
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; curve((Om) => 1 - Om - Or);
        const cq = -0.5 * (1 + 3 * wv); if (Math.abs(cq) > 1e-6) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.setLineDash([2, 4]); curve((Om) => (Or + 0.5 * Om) / cq); }
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('平坦 Ω_k = 0', XO(1.6) + 4, Y(1 - 1.6 - Or) - 5); if (Math.abs(cq) > 1e-6) { const yq = (Or + 0.5 * 2.4) / cq; if (yq > Y0 && yq < Y1) ctx.fillText('q₀ = 0', XO(2.4) + 4, Y(yq) + 12); }
        // 区域名：按各命运类的质心
        if (st.coarseDone && st.layer === 'fate') { const acc = {}; for (let j = 0; j < NY; j++) { const src = st.have[j] ? st.fine : null; for (let i = 0; i < NX; i++) { let f; if (src) f = src[(j * NX + i) * 5] | 0; else { const ci = Math.floor(i * CX / NX), cj = Math.floor(j * CY / NY); f = st.coarse[(cj * CX + ci) * 5] | 0; } const a = acc[f] || (acc[f] = { n: 0, x: 0, y: 0 }); a.n++; a.x += X0 + (i + 0.5) * (X1 - X0) / NX; a.y += Y0 + (j + 0.5) * (Y1 - Y0) / NY; } }
          ctx.font = '600 12px Space Grotesk, sans-serif'; ctx.textAlign = 'center'; for (const f in acc) { const a = acc[f]; if (a.n < NX * NY * 0.035 || f === '5') continue; const lab = FATE_N[f], x = X(a.x / a.n), y = Y(a.y / a.n), tw = ctx.measureText(lab).width; ctx.fillStyle = 'rgba(6,9,19,0.6)'; ctx.fillRect(x - tw / 2 - 5, y - 10, tw + 10, 17); ctx.fillStyle = '#fff'; ctx.fillText(lab, x, y + 3); } }
        // 内置宇宙：实心 = Ω_r、w 和地图一致（可直接比较）；空心 = 不一致
        ctx.font = '10px Space Grotesk, sans-serif'; ctx.textAlign = 'left';
        for (const p of PRESETS) { const same = Math.abs(p.p.w - wv) < 1e-9 && Math.abs(Math.log10((p.p.Or || 1e-12) / (Or || 1e-12))) < 0.3; const x = XO(p.p.Om), y = Y(p.p.OL); if (p.p.Om > ix(X1) || p.p.OL < Y0 || p.p.OL > Y1) continue; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1a1200'; if (same) { ctx.fillStyle = CSS('--gold'); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; const right = x > padL + pw * 0.68; ctx.textAlign = right ? 'right' : 'left'; ctx.fillText(p.name, x + (right ? -6 : 6), y + 4); ctx.textAlign = 'left'; } else { ctx.strokeStyle = CSS('--gold'); ctx.stroke(); } }
        // 当前参数：十字
        const cx = X(clamp(fx(S.Om), X0, X1)), cy = Y(clamp(S.OL, Y0, Y1)); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        $('pmap-status').textContent = st.status;
        $('pmap-legend').innerHTML = st.layer === 'fate' ? FATE_N.slice(0, 5).map((n, i) => `<span><i style="background:rgb(${FATE[i].join(',')});width:12px;height:12px;border-radius:3px"></i>${n}</span>`).join('') + '<span>亮度 = 宜居诊断（亮 可能宜居 / 中 勉强 / 暗 死寂）</span>'
          : (st.layer === 'age' ? '<span>年龄：<i style="background:linear-gradient(90deg,rgb(20,30,70),rgb(70,90,190),rgb(230,170,80),rgb(255,250,230));width:80px;height:10px"></i> 0.1 → 300 Gyr（对数）；灰 = 没有大爆炸</span>' : '<span>第一批星系出现时的 a：<i style="background:linear-gradient(90deg,rgb(255,250,230),rgb(230,170,80),rgb(70,90,190),rgb(20,30,70));width:80px;height:10px"></i> 10⁻³ → 1；深色 = 永远长不出</span>');
        return { X, Y, padL, padT, pw, ph };
      }
      function readout(x, y, c, preset, cur) {
        const H0 = st.base ? st.base.H0 : S.H0, Or = baseOr(), Ok = 1 - x - y - Or, who = cur ? '十字所在（当前参数）' + (preset ? '：' + preset.name : '') : (preset ? '内置：' + preset.name : '这一格');
        if (!c) { $('pmap-read').innerHTML = `<div class="k gold"><small>${who}</small><b>Ω_m = ${sig(x, 2)}，Ω_Λ = ${y.toFixed(2)}</b><i>这一格还在算</i></div>`; return; }
        const f = c[0] | 0, age = c[2] * COSMO.GYR / H0, aF = c[3];
        $('pmap-read').innerHTML = `<div class="k gold"><small>${who}</small><b>Ω_m = ${sig(x, 2)}，Ω_Λ = ${y.toFixed(2)}</b><i>Ω_k = ${(Ok >= 0 ? '+' : '') + Ok.toFixed(2)}${c[4] ? ' · 量子反弹' : ''}</i></div>
          <div class="k ${f === 0 || f === 3 ? 'coral' : (f === 4 ? 'violet' : 'teal')}"><small>命运</small><b>${FATE_N[f]}</b><i>${f === 4 ? '没有奇点，往回追溯会反弹' : (isFinite(age) ? '年龄 ' + gyr(age) : '')}</i></div>
          <div class="k ${c[1] === 2 ? 'teal' : (c[1] === 1 ? 'gold' : 'coral')}"><small>宜居诊断</small><b>${VERD[c[1] | 0]}</b><i>${isFinite(aF) ? '第一批星系在 a = ' + sig(aF, 2) : '星系永远长不出来'}</i></div>`;
      }
      function pick(ev) { const cv = $('c-pmap'), r = cv.getBoundingClientRect(), g = draw(); if (!g) return null; const px = ev.clientX - r.left, py = ev.clientY - r.top; const u = X0 + (px - g.padL) / g.pw * (X1 - X0), y = Y0 + (g.padT + g.ph - py) / g.ph * (Y1 - Y0); if (u < X0 || u > X1 || y < Y0 || y > Y1) return null; let best = null; for (const p of PRESETS) { const dx = g.X(fx(p.p.Om)) - px, dy = g.Y(p.p.OL) - py; if (dx * dx + dy * dy < 49 && (!best || dx * dx + dy * dy < best.d)) best = { p, d: dx * dx + dy * dy }; } return { x: ix(u), y, preset: best ? best.p : null }; }
      const cv0 = $('c-pmap');
      cv0.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'touch') return; const q = pick(ev); if (!q) { st.hover = null; readCurrent(); return; } st.hover = q; readout(q.x, q.y, at(q.x, q.y), q.preset); });
      cv0.addEventListener('pointerleave', () => { st.hover = null; readCurrent(); });
      cv0.addEventListener('pointerdown', (ev) => { st.ptype = ev.pointerType; });
      cv0.addEventListener('click', (ev) => { const q = pick(ev); if (!q) return;
        if (st.ptype === 'touch') { const key = sig(q.x, 2) + ',' + y2(q.y); if (st.tapKey !== key) { st.tapKey = key; st.hover = q; readout(q.x, q.y, at(q.x, q.y), q.preset); toast('先看读数；再点同一格装进创世台'); return; } st.tapKey = null; st.hover = null; } // 触屏：第一下看读数，第二下装入
        if (q.preset) { applyPreset(q.preset.id); toast('装入内置宇宙：' + q.preset.name); return; } S.Om = +q.x.toPrecision(3); S.OL = +q.y.toFixed(3); presetId = null; markPreset(); syncSliders(); frame = TODAY; solve(); toast(`Ω_m = ${S.Om}，Ω_Λ = ${S.OL} 装进了创世台`); });
      $('pmap-layer').addEventListener('change', () => { st.layer = $('pmap-layer').value; draw(); });
      return { update, draw, at };
    })();
    function drawMovie() {
      if (!galaxies) galaxies = makeGalaxies();
      const cv = $('c-movie'), { ctx, w, h } = fit(cv), f = frames[frame]; if (!f) return;
      const a = f.a, g = GYR(), T = R.T0 / a;
      ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
      if (NB.on) { const ok = NB.draw(ctx, w, h, f, frame); $('v-frame').textContent = `帧 ${frame + 1}/${frames.length}`; $('s-frame').value = frame; if (!ok && !playing && !NB.st.loop) { NB.st.loop = true; requestAnimationFrame(() => { NB.st.loop = false; if (NB.on && !playing) drawMovie(); }); } return ok; }
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
      else if ((R.origin === 'bigbang' || R.quantumBounce) && R.T0 > 0 && a < R.aRec) epoch = R.aRec === Infinity ? '等离子体：光子至今被散射，宇宙一直不透明' : '火球：不透明的等离子体，光走不出去';
      else if ((R.origin === 'bigbang' || R.quantumBounce) && !formed && a < 1) epoch = R.T0 > 0 ? '黑暗时代：复合之后，第一批星系之前' : '冷的宇宙：没有辐射，扰动还没长成星系';
      else if (R.fate === 'rip' && a > 50) epoch = '大撕裂逼近：先星系团，再星系，再原子';
      else if (isFinite(R.aLambda) && a > R.aLambda && acc) epoch = (f.t > 0 ? '未来 · ' : '') + '暗能量主导：加速膨胀，星系互相远离';
      else if (f.t > 0) epoch = '未来 · ' + (acc ? '加速膨胀' : '减速膨胀') + (formed ? '' : '（还没有星系）');
      else epoch = formed ? '物质主导：结构在生长' : '扰动还没长成星系';
      $('movie-epoch').textContent = epoch;
      // 比例尺：方框边长 = 2 Gpc × a
      const side = 2000 * a, sideTxt = side >= 1000 ? sig(side / 1000, 3) + ' Gpc' : (side >= 1 ? sig(side, 3) + ' Mpc' : sig(side * 1000, 3) + ' kpc');
      ctx.fillStyle = 'rgba(233,237,249,0.8)'; ctx.font = '12px Space Grotesk, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('方框边长 ' + sideTxt + '（今天 2 Gpc）', w - 10, h - 10);
      $('movie-hud').innerHTML = `${when(t)}${R.origin === 'bigbang' || R.quantumBounce ? `（${R.quantumBounce ? '反弹' : '大爆炸'}后 <b>${gyr((f.t + R.age) * g)}</b>）` : ''}<br>a = <b>${sig(a, 3)}</b>　T = <b>${sig(T, 3)} K</b><br>H = <b>${isFinite(H) ? sig(H * S.H0, 3) : '—'} km/s/Mpc</b>`;
      $('v-frame').textContent = `帧 ${frame + 1}/${frames.length}`;
      $('s-frame').value = frame;
    }
    function aAtH(f) { const e2 = COSMO.E2(R.m, f.a); return e2 > 0 ? Math.sqrt(e2) * (R.fate === 'crunch' && f.t > R.tTurn ? -1 : 1) : 0; }
    $('s-frame').addEventListener('input', () => { frame = +$('s-frame').value; drawMovie(); drawA(); });
    $('b-play').addEventListener('click', () => { playing = !playing; $('b-play').textContent = playing ? '⏸ 暂停' : '▶ 播放'; if (playing) { if (frame >= frames.length - 1) frame = 0; requestAnimationFrame(tick); } });
    function tick(ts) {
      if (!playing || current !== 'forge') { playing = false; $('b-play').textContent = '▶ 播放'; return; }
      const pend = NB.on && NB.st.pending; // N 体还没算到这一帧：先把这一帧算完再往前走
      if (pend || ts - lastDraw > 40) {
        if (!pend) { lastDraw = ts; frame++; if (frame >= frames.length) { frame = frames.length - 1; playing = false; $('b-play').textContent = '▶ 播放'; } }
        const ok = drawMovie(); NB.st.pending = NB.on && ok === false; if (!pend && frame % 6 === 0) drawA();
      }
      requestAnimationFrame(tick);
    }
    $('b-alog').addEventListener('click', () => { alog = !alog; $('b-alog').textContent = alog ? '线性刻度' : '对数刻度'; drawA(); });
    window.addEventListener('resize', () => { if (current === 'forge') render(); });
    // 初始化
    const saved = store.get('forge', null); if (saved && typeof saved.H0 === 'number') { Object.assign(S, saved); presetId = PRESETS.find((p) => ids.every((k) => Math.abs(p.p[k] - S[k]) < 1e-9)) ? PRESETS.find((p) => ids.every((k) => Math.abs(p.p[k] - S[k]) < 1e-9)).id : null; }
    syncSliders(); markPreset();
    window.addEventListener('beforeunload', () => store.set('forge', S));
    function setParams(obj) { // 其他展区把一组参数装进创世台；超出滑杆范围的值把滑杆的范围撑开（例如泡泡宇宙交来 Λ 大 200 倍、H₀′ 近 1000 的宇宙）
      Object.assign(S, obj); for (const k of ids) { const el = $('s-' + k), v = toSlider(k, S[k]); if (v > +el.max) el.max = Math.ceil(v); if (v < +el.min) el.min = Math.floor(v); } presetId = null; markPreset(); syncSliders(); frame = TODAY; solve(); }
    return { render: () => { if (!R) solve(); else render(); }, S, hooks, solve, syncSliders, labels, markPreset, setParams, get R() { return R; }, get frames() { return frames; } };
  })();
  window.GENESIS = { forge, show: (h) => show(h), halls };

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
    // ⑤ 全天图：每个像素一条从轴上倒着追的零测地线（godel.js 的闭式方程 axisRay），星系按旋转尘埃的静止空间度规 dℓ² = dr² + ¼sinh²(2r)dφ² + dz² 判中
    const allsky = (function () {
      const W = 360, H = 180, RC = GODEL.R_C;
      const st = { gal: null, seed: 11, returns: 2, home: true, hit: new Int16Array(W * H), lam: new Float32Array(W * H), tt: new Float32Array(W * H), cross: new Uint8Array(W * H), shade: new Float32Array(W * H), rmax: new Float32Array(H), img: null, rendered: false, hover: null, rays: new Array(H) };
      const PAL = ['#f2c14e', '#5fe0cf', '#ff6f87', '#b08cff', '#8fd65a', '#ff9f6f', '#6fb5ff', '#e9edf9', '#d9a066', '#ffd1dc', '#7fffd4', '#c0a0ff'];
      function makeGalaxies() { const r = mulberry32(st.seed), out = []; if (st.home) out.push({ r: 0, phi: 0, z: 0, rho: 0.05, color: '#ffffff', name: '你自己的星系（轴上）', home: true });
        for (let i = 0; i < 36; i++) { const rg = 0.1 + 1.0 * Math.sqrt(r()), ph = r() * Math.PI * 2, z = (r() - 0.5) * 2.4, rho = 0.05 + 0.07 * r(); out.push({ r: rg, phi: ph, z, rho, color: PAL[i % PAL.length], name: '星系 #' + (i + 1), home: false }); } return out; }
      function render() {
        if (!st.gal) st.gal = makeGalaxies(); const gal = st.gal, t0 = performance.now();
        st.hit.fill(-1); st.shade.fill(1); let rowsDone = 0;
        for (let j = 0; j < H; j++) {
          const theta = (j + 0.5) * Math.PI / H, ray = GODEL.axisRay(theta, { dl: 0.01, lambdaMax: 3.3 * st.returns + 1, maxCross: st.returns }); st.rays[j] = ray; let rmax = 0;
          const base = j * W;
          for (let i = 0; i < ray.r.length; i++) {
            const rr = Math.abs(ray.r[i]), zz = ray.z[i]; if (rr > rmax) rmax = rr; if (ray.lam[i] < 0.2) continue; /* 刚离开自己的星系那一小段不算 */ const phiEff = ray.phi[i] + (ray.r[i] < 0 ? Math.PI : 0);
            for (let g = 0; g < gal.length; g++) {
              const G = gal[g], dz = zz - G.z; if (dz > G.rho || dz < -G.rho) continue; const dr = rr - G.r; if (dr > G.rho || dr < -G.rho) continue;
              const d2 = dr * dr + dz * dz; if (d2 >= G.rho * G.rho) continue;
              if (G.r < 1e-9) { // 轴上的星系：和方位无关，整行命中
                const sh = Math.sqrt(d2) / G.rho; for (let c = 0; c < W; c++) { const p = base + c; if (st.hit[p] < 0) { st.hit[p] = g; st.lam[p] = ray.lam[i]; st.tt[p] = ray.t[i]; st.cross[p] = ray.cross[i]; st.shade[p] = sh; } else if (st.hit[p] === g && sh < st.shade[p] && ray.lam[i] - st.lam[p] < 3 * G.rho) st.shade[p] = sh; } continue; }
              const K = 0.5 * Math.sinh(2 * G.r), dphiMax = Math.sqrt(G.rho * G.rho - d2) / K, psiC = G.phi - phiEff; // 命中的方位区间
              const c0 = Math.floor(((psiC - dphiMax + Math.PI) / (2 * Math.PI)) * W), c1 = Math.ceil(((psiC + dphiMax + Math.PI) / (2 * Math.PI)) * W);
              for (let c = c0; c <= c1; c++) { const col = ((c % W) + W) % W, psi = -Math.PI + (col + 0.5) * 2 * Math.PI / W; let dps = psi - psiC; dps -= 2 * Math.PI * Math.round(dps / (2 * Math.PI)); const dl2 = d2 + K * K * dps * dps; if (dl2 >= G.rho * G.rho) continue; const sh = Math.sqrt(dl2) / G.rho, p = base + col;
                if (st.hit[p] < 0) { st.hit[p] = g; st.lam[p] = ray.lam[i]; st.tt[p] = ray.t[i]; st.cross[p] = ray.cross[i]; st.shade[p] = sh; } else if (st.hit[p] === g && sh < st.shade[p] && ray.lam[i] - st.lam[p] < 3 * G.rho) st.shade[p] = sh; }
            }
          }
          st.rmax[j] = rmax; rowsDone++;
        }
        // 像素
        if (!st.img) { st.img = document.createElement('canvas'); st.img.width = W; st.img.height = H; }
        const ic = st.img.getContext('2d'), im = ic.createImageData(W, H), d = im.data;
        const rgb = gal.map((G) => { const m = G.color.match(/#(..)(..)(..)/); return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; });
        for (let p = 0; p < W * H; p++) { const g = st.hit[p], o = p * 4; if (g < 0) { const j = Math.floor(p / W); const v = 10 + 18 * (st.rmax[j] / RC); d[o] = v * 0.7; d[o + 1] = v * 0.8; d[o + 2] = v * 1.6 + 8; d[o + 3] = 255; continue; } const sh = st.shade[p], k = 0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - sh * sh)), c = rgb[g]; d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255; }
        ic.putImageData(im, 0, 0); st.rendered = true;
        const seen = new Set(); for (let p = 0; p < W * H; p++) if (st.hit[p] >= 0) seen.add(st.hit[p]); const beyond = gal.filter((G) => G.r - G.rho >= RC).length, graze = gal.filter((G) => G.r > RC && G.r - G.rho < RC && seen.has(gal.indexOf(G))).length; // 整个落在 r_c 之外的才是永远看不见；中心在外、边缘在内的只露一侧
        $('as-status').textContent = `${W}×${H} 条光线，${Math.round(performance.now() - t0)} ms · 看得见 ${seen.size}/${gal.length} 个星系（${beyond} 个整个落在 r_c 之外，永远看不见${graze ? `；${graze} 个中心在 r_c 外、只露出靠你的一侧` : ''}）`;
        draw();
      }
      function draw() {
        const cv = $('c-allsky'); if (!cv) return; const { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
        if (!st.rendered) return; ctx.imageSmoothingEnabled = true; ctx.drawImage(st.img, 0, 0, w, h);
        // 网格：θ = 90°（赤道，垂直转轴）、ψ 刻度
        ctx.strokeStyle = 'rgba(233,237,249,0.25)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        for (const ps of [-90, 0, 90]) { const x = (ps + 180) / 360 * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(233,237,249,0.8)'; ctx.font = '11px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('ψ = −180°', 4, h - 6); ctx.textAlign = 'center'; ctx.fillText('ψ = 0°', w / 2, h - 6); ctx.textAlign = 'right'; ctx.fillText('+180°', w - 4, h - 6);
        ctx.textAlign = 'left'; ctx.fillText('θ = 0°：转轴 +z 方向', 4, 12); ctx.fillText('θ = 90°：垂直转轴', 4, h / 2 - 4); ctx.fillText('θ = 180°：−z', 4, h - 20);
        if (st.hover) { const { i, j } = st.hover; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect((i / W) * w - 3, (j / H) * h - 3, 6, 6); }
        drawMap();
      }
      function drawMap() {
        const cv = $('c-allsky-map'); if (!cv) return; const { ctx, w, h } = fit(cv); ctx.fillStyle = '#060913'; ctx.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2, sc = Math.min(w, h) / 2 / 1.5, X = (x) => cx + x * sc, Y = (y) => cy - y * sc;
        ctx.strokeStyle = CSS('--gold'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, RC * sc, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = CSS('--gold'); ctx.font = '10px Space Grotesk, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('r_c（视界）', cx + RC * sc * 0.72, cy - RC * sc * 0.72);
        if (st.gal) for (const G of st.gal) { if (G.home) continue; const x = X(G.r * Math.cos(G.phi)), y = Y(G.r * Math.sin(G.phi)); ctx.fillStyle = G.color; ctx.globalAlpha = G.r > RC ? 0.35 : 0.9; ctx.beginPath(); ctx.arc(x, y, Math.max(2, G.rho * sc), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = CSS('--dim'); ctx.textAlign = 'center'; ctx.fillText('你（轴上）· 俯视图', cx, h - 6);
        if (st.hover && st.rays[st.hover.j]) { // 这束光走过的路（投影到平面）
          const { i, j } = st.hover, ray = st.rays[j], psi = -Math.PI + (i + 0.5) * 2 * Math.PI / W, p = j * W + i, lamHit = st.hit[p] >= 0 ? st.lam[p] : Infinity;
          ctx.lineWidth = 1.5; ctx.beginPath(); let pen = false;
          for (let k = 0; k < ray.r.length; k++) { if (ray.lam[k] > lamHit) break; const rr = Math.abs(ray.r[k]), ph = ray.phi[k] + psi + (ray.r[k] < 0 ? Math.PI : 0), x = X(rr * Math.cos(ph)), y = Y(rr * Math.sin(ph)); if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); }
          ctx.strokeStyle = st.hit[p] >= 0 ? st.gal[st.hit[p]].color : 'rgba(233,237,249,0.7)'; ctx.stroke();
          if (st.hit[p] >= 0) { const G = st.gal[st.hit[p]]; if (!G.home) { const x = X(G.r * Math.cos(G.phi)), y = Y(G.r * Math.sin(G.phi)); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, Math.max(4, G.rho * sc) + 3, 0, Math.PI * 2); ctx.stroke(); } }
        }
      }
      function readout() {
        const el = $('as-read'); if (!st.hover) { el.innerHTML = '指到（或点一下）天上任一点，这里给出那束光的去向'; return; }
        const { i, j } = st.hover, p = j * W + i, theta = (j + 0.5) * 180 / H, psi = -180 + (i + 0.5) * 360 / W, P = physical(rhoRel), unit = P.unitGly;
        let s = `方向 θ = ${theta.toFixed(0)}°，ψ = ${psi.toFixed(0)}°；这束光最远到 r = ${sig(st.rmax[j], 3)}（r_c = ${RC.toFixed(3)}）<br>`;
        if (st.hit[p] >= 0) { const G = st.gal[st.hit[p]]; s += `<b style="color:${G.color}">${G.name}</b>${G.home ? '' : `：r = ${sig(G.r, 3)}，沿轴 z = ${sig(G.z, 2)}${G.r > st.rmax[j] ? '（中心比这束光能到的更远：碰到的是它靠你的一侧）' : ''}`}<br>光走了 t = ${sig(st.tt[p], 3)} 哥德尔单位 = ${gyr(st.tt[p] * unit)}（按④的 ω）`; s += G.home ? `，第 ${st.cross[p] + 1} 次回到轴上时碰到你星系的边缘（回到轴心要 t ≈ 1.3）——你看到的是自己 ${gyr(st.tt[p] * unit)} 前的样子` : `，绕回轴 ${st.cross[p]} 次${st.cross[p] > 0 ? '——这是绕回来的像，同一个星系还有别的像' : ''}`; }
        else s += `没碰到星系（追踪了 ${st.returns} 个来回）`;
        el.innerHTML = s;
      }
      const cv = $('c-allsky');
      const pickSky = (ev) => { const r = cv.getBoundingClientRect(); const i = clamp(Math.floor((ev.clientX - r.left) / r.width * W), 0, W - 1), j = clamp(Math.floor((ev.clientY - r.top) / r.height * H), 0, H - 1); if (!st.hover || st.hover.i !== i || st.hover.j !== j) { st.hover = { i, j }; draw(); readout(); } };
      cv.addEventListener('pointermove', (ev) => { if (ev.pointerType !== 'touch') pickSky(ev); });
      cv.addEventListener('pointerdown', pickSky); // 触屏：点一下
      cv.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'touch') return; st.hover = null; draw(); readout(); });
      $('as-returns').addEventListener('change', () => { st.returns = +$('as-returns').value; render(); });
      $('as-home').addEventListener('change', () => { st.home = $('as-home').checked; st.gal = null; render(); });
      $('as-reseed').addEventListener('click', () => { st.seed = (st.seed * 31 + 7) % 10007 + 1; st.gal = null; render(); });
      return { render: () => { if (!st.rendered) render(); else draw(); }, redraw: draw, readout };
    })();
    $('s-rho').addEventListener('input', () => allsky.readout());
    let entered = false;
    function enter() { if (!sky.stars) newSky(); cards(); drawCones(); if (!sky.raf) sky.raf = requestAnimationFrame(skyTick); if (!light.raf) light.raf = requestAnimationFrame(lightTick); entered = true; allsky.render(); allsky.readout(); }
    function leave() { if (sky.raf) { cancelAnimationFrame(sky.raf); sky.raf = 0; } }
    window.addEventListener('resize', () => { if (current === 'godel') { drawCones(); allsky.redraw(); } });
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

  // 启动（量子版先让 app_q 挂好钩子再启动）
  const start = () => show(halls.includes(location.hash.slice(1)) ? location.hash.slice(1) : store.get('hall', 'overview'));
  window.GENESIS.start = start; window.GENESIS.$ = $; window.GENESIS.chart = chart; window.GENESIS.fit = fit; window.GENESIS.sig = sig; window.GENESIS.gyr = gyr; window.GENESIS.toast = toast; window.GENESIS.CSS = CSS; window.GENESIS.store = store;
  // 启动由模板最后一行 GENESIS.start() 触发（各展区模块先挂好钩子）
})();
