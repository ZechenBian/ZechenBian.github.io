// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v4 · 地图上的行动动画 =====================
 * 每回合看完战报（弹窗都关掉）后，在地图上用动画表现这回合发生的事：援助与军援（物资沿弧线运过去）、贸易（双向流动）、
 * 会晤与结盟（连线）、制裁（红色虚线与封锁标记）、警告、封锁（目标周围的舰船环）、军演（波纹）、打击（弹道与爆炸）、
 * 开战与交火、占领、停战、击退、吞并与政变、独立、决裂、动员、核计划等。事件取自引擎的 S.lastEvents（单机任务一回合连算几个季度时取各季度的）。
 * 与你有关的事优先；完整动画最多 12 项，手机等“减弱”模式只播与你有关或重大的 4 项；系统要求减少动态效果或在图层面板里关掉时不播。
 * 地图右上角的 ▶ 回放。按中国标准处理的国家处在敌对行动的被动一方时，不写文字标签（只有图形）。 */
const V4F = { pending: null, last: null, turn: -1, toks: [], raf: 0, timers: [] };
const V4F_KIND = {
  aid: 'money', loan: 'money', armsaid: 'arms', troops: 'arms', deploy: 'arms',
  trade: 'trade', summit: 'talk', armsctl: 'talk', alliance: 'ally', access: 'ally', peace: 'peace', release: 'peace', lift: 'peace',
  sanction: 'sanc', tariff: 'sanc', techban: 'sanc', finsanction: 'sanc', energy: 'sanc',
  condemn: 'warn', warn: 'warn', demand: 'warn', ultimatum: 'warn', redline: 'warn',
  blockade: 'block', exercise: 'drill', strike: 'strike', nuke: 'nuke', nukethreat: 'nthreat',
  nuketest: 'atom', nukeprog: 'atom', nukeexpand: 'atom', mobilize: 'mob', buildup: 'mob', deploy_core: 'mob',
  declare: 'war', invade: 'war', clash: 'clash', conquest: 'flag', surrender: 'white', offensive_fail: 'repel',
  annex: 'crown', puppet: 'crown', vassal: 'crown', coup: 'crown', regime: 'crown', independence: 'free', break: 'split', leavebloc: 'split',
};
const V4F_PAIR = new Set(['money', 'arms', 'trade', 'talk', 'ally', 'peace', 'sanc', 'warn', 'drill', 'strike', 'nuke', 'nthreat', 'war', 'clash', 'split']); // 两国之间画弧线
const V4F_HOST = new Set(['sanc', 'warn', 'block', 'drill', 'strike', 'nuke', 'nthreat', 'war', 'clash', 'flag', 'crown', 'split', 'repel', 'white']);
const V4F_BIG = new Set(['declare', 'conquest', 'surrender', 'nuke', 'nuketest', 'annex', 'coup', 'independence', 'blockade', 'strike', 'regime', 'puppet', 'alliance']);
/* 图标（局部坐标，约 20 像素见方） */
const V4F_ICO = {
  money: '<circle r="7.5" class="f"/><circle r="4.6" class="l"/><path d="M0 -2.6V2.6M-2 0H2" class="l"/>',
  arms: `<g transform="translate(-6.5 -6.5) scale(1.3)" class="f">${ICO.tank}</g>`,
  talk: '<path d="M-7 -5h14v8h-6l-4 4v-4h-4z" class="f"/>',
  ally: '<path d="M0 -8l7 3v4c0 4.6-3 7.3-7 9c-4-1.7-7-4.4-7-9v-4z" class="f"/><path d="M-3 0l2.2 2.4L3.4 -2.4" class="l"/>',
  peace: '<path d="M-6 3c3-1 6-4 8-9c1 4-1 9-8 9z" class="f"/><path d="M6 3c-3-1-6-4-8-9c-1 4 1 9 8 9z" class="f" opacity=".75"/>',
  sanc: '<rect x="-6" y="-2" width="12" height="9" rx="1.5" class="f"/><path d="M-3.6 -2v-2.4a3.6 3.6 0 0 1 7.2 0V-2" class="l" fill="none"/>',
  warn: '<path d="M0 -8L8 6H-8z" class="f"/><path d="M0 -3V1.6M0 3.6v.4" class="l"/>',
  block: `<g transform="translate(-6.5 -6.5) scale(1.3)" class="f">${ICO.ship}</g>`,
  drill: `<g transform="translate(-6.5 -6.5) scale(1.3)" class="f">${ICO.inf}</g>`,
  strike: '<path d="M0 -9L2.4 -3L8.6 -2.8L3.8 1.2L5.6 7.4L0 3.8L-5.6 7.4L-3.8 1.2L-8.6 -2.8L-2.4 -3z" class="f"/>',
  nuke: '<circle r="3" class="f"/><path d="M0 -4L-3.5 -9.5A10 10 0 0 1 3.5 -9.5zM3.5 2L8.6 6.2A10 10 0 0 1 2.5 9.6zM-3.5 2L-2.5 9.6A10 10 0 0 1 -8.6 6.2z" class="f"/>',
  nthreat: '<path d="M0 -8L8 6H-8z" class="f"/><circle cy="1.6" r="1.6" class="l"/>',
  atom: '<circle r="2" class="f"/><ellipse rx="8" ry="3" class="l" fill="none"/><ellipse rx="8" ry="3" class="l" fill="none" transform="rotate(60)"/><ellipse rx="8" ry="3" class="l" fill="none" transform="rotate(-60)"/>',
  mob: `<g transform="translate(-6.5 -6.5) scale(1.3)" class="f">${ICO.inf}</g><path d="M6 -2l3 -3l3 3" class="l" fill="none"/>`,
  war: '<path d="M-7 -7L7 7M7 -7L-7 7" class="l w"/><path d="M-8.5 -4.5l4 4M4.5 -8.5l4 4" class="l"/>',
  clash: '<path d="M0 -9L2.4 -3L8.6 -2.8L3.8 1.2L5.6 7.4L0 3.8L-5.6 7.4L-3.8 1.2L-8.6 -2.8L-2.4 -3z" class="f"/>',
  flag: '<path d="M-5 9V-9" class="l w"/><path d="M-5 -9h12l-3 4l3 4h-12z" class="f"/>',
  white: '<path d="M-5 9V-9" class="l w"/><path d="M-5 -9h12l-3 4l3 4h-12z" class="wf"/>',
  repel: '<path d="M-8 4L-1 -3M1 -5L7 -11M7 -11v5M7 -11h-5" class="l w" fill="none"/>',
  crown: '<path d="M-8 5L-8 -5L-4 -1L0 -7L4 -1L8 -5L8 5z" class="f"/>',
  free: '<path d="M0 -9V-4M0 4V9M-9 0H-4M4 0H9M-6.4 -6.4L-3 -3M3 3L6.4 6.4M6.4 -6.4L3 -3M-3 3L-6.4 6.4" class="l w"/><circle r="2.4" class="f"/>',
  split: '<path d="M-8 -2a3 3 0 0 1 3 -3h3M8 2a3 3 0 0 1 -3 3h-3" class="l w" fill="none"/><path d="M-1 -7L1 7" class="l"/>',
  trade: '<path d="M-7 -3h11l-3 -3M7 3h-11l3 3" class="l w" fill="none"/>',
};
/* ---------- 收集与挑选 ---------- */
function v4fPick(lists) {
  const P = S.player, lite = animLevel() === 'lite', lim = lite ? 4 : 12, seen = new Set(), out = [];
  const all = []; (lists || []).forEach((l, qi) => (l || []).forEach((e, i) => all.push(Object.assign({ qi, i }, e))));
  const score = e => (e.actor === P || e.target === P ? 1000 : 0) + (V4F_BIG.has(e.type) ? 300 : 0) + Math.abs(e.sev || 0) - e.qi * 0.1 - e.i * 0.001;
  for (const e of all.sort((a, b) => score(b) - score(a))) {
    const k = V4F_KIND[e.type]; if (!k || !e.actor || !S.actors[e.actor]) continue;
    if (V4F_PAIR.has(k) && (!e.target || !S.actors[e.target] || e.target === e.actor)) continue;
    const me = e.actor === P || e.target === P; if (lite && !me && !V4F_BIG.has(e.type)) continue;
    const key = k + '|' + e.actor + '|' + (e.target || ''); if (seen.has(key)) continue; seen.add(key);
    out.push({ k, type: e.type, a: e.actor, t: e.target || null, me });
    if (out.length >= lim) break;
  }
  return out;
}
function v4FxCollect() {
  if (!S || UI.demo) return;
  const lists = typeof V4M !== 'undefined' && V4M.ev && V4M.ev.turn === S.turn ? V4M.ev.list : [S.lastEvents || []];
  const list = v4fPick(lists);
  V4F.turn = S.turn; V4F.pending = list.length ? list : null; V4F.last = V4F.pending || V4F.last;
  v4fBtn();
}
/* ---------- 绘制 ---------- */
function v4fLayer() {
  let g = $('#gFx'); if (g) return g;
  gWorld.insertAdjacentHTML('beforeend', '<g id="gFx" aria-hidden="true"></g>'); return $('#gFx');
}
const v4fPt = X => { const p = capOf(X); return p && isFinite(p[0]) && isFinite(p[1]) ? p : null; };
function v4fCtl(A, B) { const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1, h = Math.min(0.28 * d, 160); return [(A[0] + B[0]) / 2 - dy / d * h * 0.6, (A[1] + B[1]) / 2 + dx / d * h * 0.6 - h * 0.5]; }
const v4fQ = (A, C, B, t) => [(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]];
function v4fCol(z) {
  const P = S.player, host = V4F_HOST.has(z.k);
  if (z.k === 'free' || z.k === 'crown' || z.k === 'flag') return z.a === P ? css('--accent') : polColor(z.a);
  if (z.me) return host ? (z.a === P ? css('--warn') : css('--hostile')) : css('--accent');
  return host ? css('--hostile') : z.k === 'trade' || z.k === 'money' || z.k === 'arms' ? css('--neutral') : css('--friend');
}
function v4fLabel(z) {
  if (!z.me && !V4F_BIG.has(z.type)) return '';
  if (V4F_HOST.has(z.k) && z.t && z.t !== S.player && W.shielded(S, z.t)) return ''; // 按中国标准处理的国家处在被动一方：只有图形
  if ((z.k === 'white' || z.k === 'repel') && W.shielded(S, z.a)) return '';
  return T(I18N.has('v4f.t.' + z.type) ? 'v4f.t.' + z.type : 'v4f.k.' + z.k);
}
function v4fOne(z, i, lite) {
  const A = v4fPt(z.a), B = z.t ? v4fPt(z.t) : null; if (!A) return null;
  const col = v4fCol(z), d = (i * (lite ? 0.5 : 0.32)).toFixed(2), at = V4F_PAIR.has(z.k) && B ? B : z.k === 'block' && B ? B : (z.k === 'free' || z.k === 'atom' || z.k === 'mob' || z.k === 'white') ? A : B || A;
  let s = '';
  if (V4F_PAIR.has(z.k) && B) {
    const C = v4fCtl(A, B), path = `M${f1(A[0])} ${f1(A[1])} Q${f1(C[0])} ${f1(C[1])} ${f1(B[0])} ${f1(B[1])}`;
    if (z.k === 'trade') {
      const C2 = v4fCtl(B, A); s += `<path class="v4f-arc flow" d="${path}" style="stroke:${col};animation-delay:${d}s"/><path class="v4f-arc flow" d="M${f1(B[0])} ${f1(B[1])} Q${f1(C2[0])} ${f1(C2[1])} ${f1(A[0])} ${f1(A[1])}" style="stroke:${col};animation-delay:${d}s"/>`;
      V4F.toks.push({ A, C, B, d: +d, col, ico: 'money', n: 2 }, { A: B, C: C2, B: A, d: +d + 0.2, col, ico: 'money', n: 2 });
    } else {
      s += `<path class="v4f-arc${V4F_HOST.has(z.k) ? ' host' : ''}${z.k === 'sanc' || z.k === 'warn' || z.k === 'split' ? ' dash' : ''}" d="${path}" pathLength="100" style="stroke:${col};animation-delay:${d}s"/>`;
      if (z.k === 'money' || z.k === 'arms') V4F.toks.push({ A, C, B, d: +d + 0.25, col, ico: z.k, n: lite ? 1 : 3 });
      if (z.k === 'strike' || z.k === 'nuke') V4F.toks.push({ A, C, B, d: +d + 0.15, col, ico: 'dot', n: 1, fast: 1 });
    }
  }
  if (z.k === 'drill' || z.k === 'nthreat') s += mkp(A[0], A[1], 'v4f-pt', [0, 0.35, 0.7].map(x => `<circle r="22" class="v4f-ring" style="stroke:${col};animation-delay:${(+d + x).toFixed(2)}s"/>`).join(''));
  if (z.k === 'block' && B) s += mkp(B[0], B[1], 'v4f-pt', `<g class="v4f-spin" style="animation-delay:${d}s"><circle r="30" class="v4f-ringd" style="stroke:${col}"/>${[0, 120, 240].map(r => `<g transform="rotate(${r}) translate(0 -30) scale(.9)" class="v4f-ico" style="color:${col}">${V4F_ICO.block}</g>`).join('')}</g>`);
  if (['strike', 'nuke', 'war', 'clash', 'flag', 'crown', 'free', 'atom', 'mob', 'repel', 'white'].includes(z.k)) s += mkp(at[0], at[1], 'v4f-pt', [0, 0.25].map(x => `<circle r="${z.k === 'nuke' ? 40 : 20}" class="v4f-ring${z.k === 'nuke' ? ' big' : ''}" style="stroke:${col};animation-delay:${(+d + 0.5 + x).toFixed(2)}s"/>`).join(''));
  const ico = V4F_ICO[z.k], lbl = v4fLabel(z), off = z.k === 'block' ? -44 : -20;
  if (ico) s += mkp(at[0], at[1], 'v4f-pt', `<g class="v4f-pop" style="animation-delay:${(+d + (V4F_PAIR.has(z.k) ? 0.5 : 0)).toFixed(2)}s"><g class="v4f-ico" style="color:${col}"><circle r="12" class="bg"/>${ico}</g>${lbl ? `<text y="${off}" class="v4f-lbl">${esc(lbl)}</text>` : ''}</g>`);
  return s;
}
/* 物资、弹道沿弧线移动（每帧按当前缩放重算位置与大小） */
function v4fTick(t0) {
  const g = $('#gFx'); if (!g) { V4F.raf = 0; return; }
  const now = (performance.now() - t0) / 1000, pu = pxU();
  let live = false;
  for (const k of V4F.toks) {
    if (!k.el) { k.el = []; for (let j = 0; j < k.n; j++) { g.insertAdjacentHTML('beforeend', `<g class="v4f-tok" style="color:${k.col}" opacity="0">${k.ico === 'dot' ? '<circle r="4.5" class="f"/><circle r="9" class="halo"/>' : `<g transform="scale(.8)">${V4F_ICO[k.ico] || ''}</g>`}</g>`); k.el.push(g.lastElementChild); } }
    const dur = k.fast ? 0.7 : 1.5;
    k.el.forEach((el, j) => {
      const tt = (now - k.d - j * 0.28) / dur;
      if (tt < 0 || tt > 1.15) { el.setAttribute('opacity', '0'); if (tt < 0) live = true; return; }
      live = true; const p = v4fQ(k.A, k.C, k.B, Math.min(1, tt));
      el.setAttribute('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${pu.toFixed(4)})`);
      el.setAttribute('opacity', tt > 1 ? String(Math.max(0, 1 - (tt - 1) / 0.15)) : '1');
    });
  }
  V4F.raf = live ? requestAnimationFrame(() => v4fTick(t0)) : 0;
}
function v4fClear() {
  for (const t of V4F.timers) clearTimeout(t); V4F.timers = [];
  if (V4F.raf) cancelAnimationFrame(V4F.raf); V4F.raf = 0; V4F.toks = [];
  const g = $('#gFx'); if (g) g.innerHTML = '';
  const c = $('#v4fCap'); if (c) c.hidden = true;
}
function v4fPlay(list) {
  v4fClear();
  const lv = animLevel(); if (lv === 'off' || !list || !list.length || !S || UI.demo) return false;
  const g = v4fLayer(), lite = lv === 'lite';
  let h = ''; list.forEach((z, i) => { const s = v4fOne(z, i, lite); if (s) h += `<g class="v4f-one">${s}</g>`; });
  g.innerHTML = h;
  if (V4F.toks.length) { const t0 = performance.now(); V4F.raf = requestAnimationFrame(() => v4fTick(t0)); }
  // 地图下方的小字：这回合发生了什么
  const cnt = {}; for (const z of list) { const l = T(I18N.has('v4f.t.' + z.type) ? 'v4f.t.' + z.type : 'v4f.k.' + z.k); cnt[l] = (cnt[l] || 0) + 1; }
  const parts = Object.entries(cnt).map(([l, n]) => (n > 1 ? `${l} ×${n}` : l));
  let cap = $('#v4fCap'); if (!cap) { $('#mapwrap').insertAdjacentHTML('beforeend', '<div class="v4f-cap" id="v4fCap" role="status" hidden></div>'); cap = $('#v4fCap'); }
  cap.textContent = T('v4f.cap', { x: { raw: parts.slice(0, 6).join(sep()) + (parts.length > 6 ? ' ' + T('v4f.more', { n: parts.length - 6 }) : '') } }); cap.hidden = false;
  const total = (list.length * (lite ? 0.5 : 0.32) + 3.2) * 1000;
  V4F.timers.push(setTimeout(() => { const gg = $('#gFx'); if (gg) gg.innerHTML = ''; V4F.toks = []; const c = $('#v4fCap'); if (c) c.hidden = true; }, total));
  return true;
}
/* 看完战报（弹窗都关了）再播；危机卡、任务结果等弹窗接着弹出时等它们关掉 */
function v4fMaybe() {
  if (!V4F.pending || !S || UI.demo || V4F.turn !== S.turn) return;
  if (!$('#modal').hidden || !$('#busy').hidden) return;
  const list = V4F.pending; V4F.pending = null;
  setTimeout(() => { if ($('#modal').hidden) v4fPlay(list); else V4F.pending = list; }, 120);
}
const v4fClose0 = lyrOnModalClose;
lyrOnModalClose = function () { v4fClose0(); setTimeout(v4fMaybe, 40); };
/* 联网的其他玩家：收到新回合时按快照里的事件收集（本机结算的已经在 mpResolve 里收集过） */
const v4fAfter0 = mpAfterTurn;
mpAfterTurn = function () { if (S && !UI.demo && V4F.turn !== S.turn && S.report && !S.report.intro) v4FxCollect(); return v4fAfter0(); };
/* 回放按钮（地图右上角） */
function v4fBtn() {
  const z = $('#mapwrap .maptools .zoom'); if (!z) return;
  let b = $('#v4fReplay'); if (!b) { z.insertAdjacentHTML('beforeend', `<button id="v4fReplay" hidden>▶</button>`); b = $('#v4fReplay'); b.onclick = () => { if (V4F.last) v4fPlay(V4F.last); }; }
  b.title = T('v4f.replay'); b.setAttribute('aria-label', T('v4f.replay'));
  b.hidden = !(V4F.last && V4F.last.length && S && !UI.demo && animLevel() !== 'off');
}
const v4fTop0 = renderTop;
renderTop = function () { v4fTop0(); try { if (UI.demo || !MPS.on) { V4F.last = null; v4fClear(); } v4fBtn(); } catch (e) { } };
