// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 · 地图图层、战线箭头与动画 =====================
 * 图层：战线箭头与兵力集群、补给线、航运线与封锁、铁路干线、油田与煤田、海峡要冲、驻军与在途部队、国名标注；
 * 预设：简洁 / 作战 / 经济 / 全部（记在本浏览器的偏好里）。
 * 动画默认打开、可以关闭；“自动”时手机上减弱（只播一次开战动画），系统设置“减少动态效果”时关闭。
 * 数据见 src/layers.js（tools/layers.mjs 生成）：航运线按年代的相对运量，铁路按年代的通车情况，资源点按年代的规模。 */
const LYR_ALL = ['front', 'supply', 'sea', 'rail', 'res', 'choke', 'units', 'labels'];
const LYR_PRE = { simple: ['front', 'labels'], ops: ['front', 'supply', 'rail', 'choke', 'units', 'labels'], econ: ['sea', 'res', 'choke', 'rail', 'labels'], all: LYR_ALL.slice() };
const LYD = typeof LAYERS !== 'undefined' ? LAYERS : { lanes: [], rails: [], res: [], choke: [] };
UI.lyr = Array.isArray(UI.lyr) ? UI.lyr.filter(k => LYR_ALL.includes(k) && k !== 'labels') : LYR_PRE.ops.filter(k => k !== 'labels');
const lyrOn = k => (k === 'labels' ? !!UI.labels : UI.lyr.includes(k));
const lyrSet = list => { UI.lyr = LYR_ALL.filter(k => k !== 'labels' && list.includes(k)); UI.labels = list.includes('labels'); };
const lyrPreOf = () => Object.keys(LYR_PRE).find(p => LYR_PRE[p].length === UI.lyr.length + (UI.labels ? 1 : 0) && LYR_PRE[p].every(lyrOn)) || null;
/* ---------- 动画 ---------- */
const mqReduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return null; } })();
const mqPhone = (() => { try { return matchMedia('(max-width: 700px), (pointer: coarse)'); } catch (e) { return null; } })();
function animLevel() { const p = UI.animPref || 'auto'; if (p === 'off') return 'off'; if (p === 'on') return 'full'; if (mqReduce && mqReduce.matches) return 'off'; if (mqPhone && mqPhone.matches) return 'lite'; return 'full'; }
function lyrApplyAnim() { const m = $('#mapwrap'); if (!m) return; const a = animLevel(); for (const k of ['full', 'lite', 'off']) m.classList.toggle('anim-' + k, a === k); }
const phase = ms => `animation-delay:-${Math.round(performance.now() % ms)}ms`; // 重绘时动画接着播，不从头开始
/* ---------- 几何 ---------- */
const lyrEra = () => ({ 1939: 0, 1945: 1, 1979: 2 }[W.sc().id] ?? 3);
const lyrYear = () => W.sc().year || 2026;
/* 按屏幕像素定大小的标记：内部单位就是屏幕像素，缩放时 applyView 更新比例 */
const mkp = (x, y, cls, inner, extra) => `<g class="${cls}" data-px="1" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${pxU().toFixed(4)})" ${extra || ''}>${inner}</g>`;
const smallMap = () => svg.getBoundingClientRect().width < 600; // 手机：图标与箭头画小一些
function pxU() { const r = svg.getBoundingClientRect(); const s = Math.min(r.width / GEO.w, r.height / GEO.h) || 0.5; return 1 / (s * view.k); } // 屏幕上 1 像素等于多少地图单位
const capOf = X => { const c = (typeof CITIES !== 'undefined' && CITIES[X] || []).find(z => z[4]); return c ? [c[2], c[3]] : GEO.label[X]; };
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const ptsD = pp => pp.map(p => 'M' + p.map(q => q[0] + ' ' + q[1]).join('L')).join('');
/* 各战线投入的兵力（地面战力）与兵员装备：箭头粗细与兵力集群按它画 */
function frontForce(f) {
  const v = f.v || [0, 0, 0], g = W.groundV(S, f.att, v) + (f.co || []).reduce((s, k) => s + W.groundV(S, k.id, k.v || [0, 0, 0]), 0);
  const u = W.unitsV(S, f.att, v); for (const k of f.co || []) { const z = W.unitsV(S, k.id, k.v || [0, 0, 0]); u.pers += z.pers; u.tanks += z.tanks; u.air += z.air; u.ships += z.ships; }
  return { g: Math.max(0, g || 0), u };
}
/* 箭头几何：从出发阵地指向当前战线（陆上推进）或登陆点；长度与粗细按屏幕像素换算，缩放时重算 */
function arrowGeo(f, g, uu, gmax) {
  const pos = f.phase === 'land' ? g.tmin + (g.tmax - g.tmin) * clamp(f.progress / 100, 0, 1) : g.tmin + 2 * uu;
  const t = Math.max(pos, 6 * uu), head = [g.a[0] + g.dx * t, g.a[1] + g.dy * t];
  const L = clamp(t, 34 * uu, 165 * uu), tail = [head[0] - g.dx * L, head[1] - g.dy * L];
  const ff = frontForce(f), rel = gmax > 0 ? Math.sqrt(ff.g / gmax) : 0.5;
  const bw = (9 + 15 * clamp(rel, 0, 1)) * Math.pow(view.k, 0.2) * (smallMap() ? 0.7 : 1) * uu; // 箭身 9–24 像素，按投入兵力
  return { head, tail, L, bw, ang: Math.atan2(g.dy, g.dx) * 180 / Math.PI, ff };
}
/* 粗箭头（局部坐标：尾部在原点，沿 +x 指向目标，略带弧度），尾部燕尾 */
function arrowShape(L, bw) {
  const hl = Math.min(L * 0.42, 2.0 * bw), hw = 2.3 * bw, tw = 0.5 * bw, bend = 0.1, n = 10, xs = L - hl;
  const cy = x => -bend * L * 4 * (x / L) * (1 - x / L), wd = x => tw + (bw - tw) * (x / xs);
  const up = [], lo = [];
  for (let i = 0; i <= n; i++) { const x = xs * i / n; up.push([x, cy(x) - wd(x) / 2]); lo.push([x, cy(x) + wd(x) / 2]); }
  const p = [[tw * 0.7, cy(0)], ...up, [xs, cy(xs) - hw / 2], [L, cy(L)], [xs, cy(xs) + hw / 2], ...lo.reverse()];
  return { d: 'M' + p.map(q => f1(q[0]) + ' ' + f1(q[1])).join('L') + 'Z', cx: xs * 0.5, cyv: cy(xs * 0.5) };
}
/* 兵力集群的图标（10×10 的框）：坦克、步兵、飞机、舰艇 */
const ICO = {
  tank: '<path d="M1 6.6h8.4a1.4 1.4 0 0 1-1.2 2.2H2.2A1.4 1.4 0 0 1 1 6.6z"/><path d="M1.8 4.6h6.6l1 1.6H1.2z"/><path d="M3.4 3h3.2v1.8H3.4z"/><path d="M6.4 3.6h3.8v.7H6.4z"/>',
  inf: '<circle cx="5" cy="2.2" r="1.35"/><path d="M3.4 4h3.2l.7 3.2-.9.2-.5-1.9V9.4H5.4V7.2h-.8v2.2H3.5V5.5l-.5 1.9-.9-.2z"/><path d="M7.2 3.1l1.9-1.6.4.4-1.9 1.7z"/>',
  air: '<path d="M5.6 .6l.8 3.4 3.4 1.6v.9L6.4 5.6 6.2 8.2l1.3.8v.6L5.6 9.2 3.7 9.6V9l1.3-.8-.2-2.6-3.4.9v-.9L4.8 4z" transform="rotate(90 5 5)"/>',
  ship: '<path d="M.6 6.2h8.8L8 8.8H2z"/><path d="M3 4h3.4v2.2H3z"/><path d="M4.4 2.2h1v1.8h-1z"/>',
};
function unitIcons(ff, gmax0) {
  const u = ff.u, out = [];
  const tk = u.tanks, mx = Math.max(1, gmax0.tanks);
  const nT = tk < 1 ? 0 : 1 + (tk > 0.35 * mx ? 1 : 0) + (tk > 0.7 * mx ? 1 : 0);
  for (let i = 0; i < nT; i++) out.push('tank');
  if (u.pers > 0 && (nT < 2 || u.pers > 0.5 * gmax0.pers)) out.push('inf');
  if (u.air > 0.15 * Math.max(1, gmax0.air)) out.push('air');
  if (u.ships > 0.2 * Math.max(1, gmax0.ships)) out.push('ship');
  return out.slice(0, 4);
}
/* 一条战线的粗箭头（含兵力集群与开战动画）；launching：本回合刚发动的攻势 */
function fatArrow(f, col, cls, A, uu, mx) {
  const sh = arrowShape(A.L, A.bw), flip = Math.abs(A.ang) > 90;
  const icons = unitIcons(A.ff, mx), isz = 14 * Math.pow(view.k, 0.12) * (smallMap() ? 0.8 : 1) * uu, gap = 1.15, capW = icons.length * isz * gap + isz * 0.5, capH = isz * 1.3;
  const launching = S.turn - (f.start ?? -99) <= 1;
  let anim = '';
  if (launching) {
    const key = S.seed + ':' + S.scen + ':' + f.id + ':' + S.turn, LA = UI.launchAt || (UI.launchAt = {}); // 按对局区分（开局画面背后的示意地图也有同号战线）
    if (!LA[key] && !UI.demo && $('#modal').hidden && $('#busy').hidden) LA[key] = performance.now(); // 战报等弹窗开着：等它关掉再播（开局画面背后的示意地图不播）
    if (!LA[key]) UI.launchPending = true;
    const el = LA[key] ? performance.now() - LA[key] : Infinity;
    if (el < 1500) anim = `animation-delay:-${Math.round(el)}ms`;
  }
  const un = icons.length ? `<g class="fa-slide${anim ? ' fa-anim' : ''}" style="--fx:${f1(-sh.cx)}px;${anim}"><g transform="translate(${f1(sh.cx)} ${f1(sh.cyv)}) scale(1 ${flip ? -1 : 1})"><rect x="${f1(-capW / 2)}" y="${f1(-capH / 2)}" width="${f1(capW)}" height="${f1(capH)}" rx="${f1(capH / 2)}" class="fa-cap" style="stroke:${col}"/>${icons.map((k, i) => `<g transform="translate(${f1(-capW / 2 + isz * 0.25 + i * isz * gap)} ${f1(-isz / 2)}) scale(${(isz / 10).toFixed(4)})" class="fa-ic" style="fill:${col}">${ICO[k]}</g>`).join('')}</g></g>` : '';
  return { svg: `<g class="farrow ${cls}${launching ? ' new' : ''}" transform="translate(${f1(A.tail[0])} ${f1(A.tail[1])}) rotate(${A.ang.toFixed(2)})"><g class="fa-grow${anim ? ' fa-anim' : ''}" style="${anim}"><path class="fa-body" d="${sh.d}" style="fill:${col}"/></g>${un}</g>`, launching, anim };
}
/* 补给线：从首都经出发阵地到箭头尾部 */
function supplyLine(f, A, col) {
  const c = capOf(f.att), st = GEO.label[f.from]; if (!c) return '';
  const pts = [c]; if (st && f.from !== f.att && Math.hypot(st[0] - c[0], st[1] - c[1]) > 8) pts.push(st); pts.push(A.tail);
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.08; d += `Q${f1(mx)} ${f1(my)} ${f1(b[0])} ${f1(b[1])}`; }
  const sea = f.kind === 'amph' || f.phase !== 'land' || (f.from !== f.att && !W.landAdj(f.att, f.from)); // 隔海的补给线画成虚线
  return `<path class="supply${sea ? ' sea' : ''}" d="${d}" style="stroke:${col};${phase(900)}"/>`;
}
/* 新开战的国家之间（本回合宣战、还没有战线）：在两国首都之间标“宣战” */
function newWars() {
  const T = S.turn, keys = Object.keys(S.war), g = S.seed + ':' + S.scen, memo = UI.warMemo || (UI.warMemo = {});
  if (!memo[g]) memo[g] = {}; if (!memo[g][T]) memo[g][T] = keys.slice();
  const prev = memo[g][T - 1];
  return Object.entries(S.war).filter(([k, w]) => (prev ? !prev.includes(k) : T === 0 ? (w.since ?? -9) >= -1 : w.since === T - 1)).map(([, w]) => w);
}
function warBadges(mk) {
  let o = ''; const P = S.player;
  for (const w of newWars()) {
    if (S.fronts.some(f => (f.att === w.a && W.boss(S, f.target) === w.b) || (f.att === w.b && W.boss(S, f.target) === w.a))) continue;
    if (!(w.a === P || w.b === P || (W.isGreat(S, w.a) && W.isGreat(S, w.b)))) continue; // 只标与你有关的、或大国之间的宣战（免得满屏连线）
    const A = capOf(w.a), B = capOf(w.b); if (!A || !B) continue;
    const mine = w.a === P || w.b === P;
    o += `<path class="decl${mine ? ' me' : ''}" d="M${f1(A[0])} ${f1(A[1])}L${f1(B[0])} ${f1(B[1])}" style="${phase(1400)}"/>`;
    o += mk((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, 'fa-decl' + (mine ? ' me' : ''), `<rect x="-23" y="-8.5" width="46" height="17" rx="8.5"/><text y="3.8">⚔ ${esc(T('u.fa.decl'))}</text>`);
  }
  return o;
}
/* ---------- 航运线、铁路、资源与海峡（静态部分按年代缓存） ---------- */
let LST = '';
function lyrInit() {
  if (!$('#gSeaB')) { $('#gSea').innerHTML = '<g id="gSeaB"></g><g id="gSeaH"></g>'; }
  if (!$('#lyrBtn')) {
    const z = $('.maptools .zoom');
    z.insertAdjacentHTML('afterend', `<div class="lyrwrap"><button id="lyrBtn" class="lyrbtn" aria-haspopup="true" aria-expanded="false"><span aria-hidden="true">◫</span> <span data-i18n="u.ly.btn">${T('u.ly.btn')}</span></button><div class="lyrpanel" id="lyrPanel" hidden></div></div>`);
  }
  lyrApplyAnim();
  try { if (mqReduce) mqReduce.addEventListener('change', () => { lyrApplyAnim(); }); if (mqPhone) mqPhone.addEventListener('change', () => { lyrApplyAnim(); }); } catch (e) { }
}
function lyrStatic() {
  const key = W.sc().id + '|' + UI.lyr.join(',');
  if (LST === key) return; LST = key;
  const era = lyrEra(), yr = lyrYear();
  let sea = '';
  if (lyrOn('sea')) for (const L of LYD.lanes) { const w = L.w[era] || 0; if (w <= 0) continue; const d = ptsD(L.pp); sea += `<path class="lane" d="${d}" style="stroke-width:${(0.6 + w * 0.48).toFixed(2)}px"/><path class="lhit" d="${d}" data-lt="lane:${L.id}"/>`; }
  $('#gSeaB').innerHTML = sea;
  let rail = '';
  if (lyrOn('rail')) for (const R of LYD.rails) { if (yr < R.yr[0] || yr > R.yr[1]) continue; const d = ptsD(R.pp); rail += R.road ? `<path class="road" d="${d}"/>` : `<path class="rail" d="${d}"/><path class="rail2" d="${d}"/>`; rail += `<path class="lhit" d="${d}" data-lt="rail:${R.id}"/>`; }
  $('#gRail').innerHTML = rail;
}
/* 航段附近的国家之间正在交战、或者附近的国家被封锁、遭到海上进攻：标为战区（红色虚线） */
function laneHot(ids) {
  if (!ids || !ids.length) return false;
  if (S.blockades.some(b => ids.includes(b.target))) return true;
  if (S.fronts.some(f => (f.kind === 'amph' || f.phase !== 'land') && ids.includes(f.target))) return true;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = W.boss(S, ids[i]), b = W.boss(S, ids[j]); if (a !== b && W.atWar(S, a, b)) return true; }
  return false;
}
const laneHotSegs = L => { const out = []; L.pp.forEach((p, k) => { let cur = null; for (let i = 0; i < p.length - 1; i++) { if (laneHot(L.seg[k][i])) { if (!cur) { cur = [p[i]]; out.push(cur); } cur.push(p[i + 1]); } else cur = null; } }); return out; };
function resCtrl(t) { const x = S.actors[t]; if (!x) return null; return W.boss(S, t); }
function chokeCtrl(c) { const yr = W.sc().id, who = c.who && c.who[yr]; const t = S.actors[c.t]; if (t && t.ctrl !== c.t) return t.ctrl; return who ? W.boss(S, who) : c.t && S.actors[c.t] ? W.boss(S, c.t) : who || null; }
function lyrDynamic() {
  const era = lyrEra(), pu = pxU().toFixed(4);
  let hot = '';
  if (lyrOn('sea')) for (const L of LYD.lanes) { if (!(L.w[era] > 0)) continue; const segs = laneHotSegs(L); if (segs.length) hot += `<path class="lane hot" d="${ptsD(segs)}" style="${phase(1600)}"/>`; }
  $('#gSeaH').innerHTML = hot;
  let o = ''; const P = S.player, sm = smallMap() && view.k < 2 ? 0.7 : 1;
  const tint = X => (X === P ? css('--accent') : X ? polColor(X) : css('--muted'));
  if (lyrOn('res')) for (const r of LYD.res) {
    const s = r.s[era] || 0; if (!s) continue; const X = resCtrl(r.t), war = X && W.enemies(S, X).length > 0;
    const sz = (0.75 + s * 0.22) * sm;
    o += `<g class="res ${r.k}${war ? ' war' : ''}" data-px="1" data-x="${r.x}" data-y="${r.y}" transform="translate(${r.x},${r.y}) scale(${pu})" data-lt="res:${r.id}"><g transform="scale(${sz.toFixed(2)})"><circle r="7" class="rbg" style="stroke:${tint(X)}"/>${r.k === 'coal' ? '<path class="rico" d="M-3.6 -1.6L-1.4 -3.8L2.2 -3.4L4.1 -0.6L3.1 2.9L-0.6 4L-3.7 2.2Z"/>' : r.k === 'gas' ? '<path class="rico" d="M0 -4.6C2.8 -1.6 3.6 0.4 3.2 2.1C2.8 3.7 1.4 4.6 0 4.6C-1.4 4.6-2.9 3.7-3.2 2.1C-3.5 0.5-2.3-1.4-0.6-2.6C-0.6-1.2 0-.4.8-.1C.9-1.6.6-3 0-4.6Z"/>' : '<path class="rico" d="M0 -4.8C2.4 -1.6 3.6 0.4 3.6 1.8A3.6 3.6 0 0 1-3.6 1.8C-3.6 0.4-2.4-1.6 0-4.8Z"/>'}</g></g>`;
  }
  if (lyrOn('choke')) for (const c of LYD.choke) {
    const X = chokeCtrl(c), war = X && W.enemies(S, X).length > 0;
    o += `<g class="choke${war ? ' war' : ''}" data-px="1" data-x="${c.x}" data-y="${c.y}" transform="translate(${c.x},${c.y}) scale(${pu})" data-lt="choke:${c.id}"><g transform="scale(${sm})"><rect x="-5.2" y="-5.2" width="10.4" height="10.4" transform="rotate(45)" style="fill:${tint(X)}"/><path d="M-2.6 0H2.6M0 -2.6V2.6" class="cx"/></g><text x="9" y="3.5">${esc(c.n[EN() ? 1 : 0])}</text></g>`;
  }
  $('#gRes').innerHTML = o;
}
function lyrRender() { if (!S) return; lyrInit(); lyrStatic(); lyrDynamic(); }
/* 缩放后重画箭头（箭头与图标按屏幕像素定粗细） */
let lyrZT = 0, lyrK = 1;
function lyrZoomSoon() { if (Math.abs(view.k / lyrK - 1) < 0.12) return; clearTimeout(lyrZT); lyrZT = setTimeout(() => { lyrK = view.k; if (S && typeof renderOver === 'function') renderOver(); }, 160); }
/* 弹窗关掉后补播开战动画 */
function lyrOnModalClose() { if (UI.launchPending && S && !UI.demo) { UI.launchPending = false; setTimeout(() => { if ($('#modal').hidden && typeof renderOver === 'function') renderOver(); }, 30); } }
/* ---------- 悬停说明 ---------- */
const VOL = v => T(v >= 4 ? 'u.ly.v4' : v >= 3 ? 'u.ly.v3' : v >= 2 ? 'u.ly.v2' : 'u.ly.v1');
function lyrTipHTML(key) {
  const [k, id] = String(key).split(':'), era = lyrEra(), row = (a, b) => `<div class="row"><span class="muted">${a}</span><span>${b}</span></div>`;
  const who = X => (X ? esc(NAME(X)) : '—');
  if (k === 'lane') { const L = LYD.lanes.find(z => z.id === id); if (!L) return ''; const hot = laneHotSegs(L).length > 0; return `<h4>⛴ ${esc(L.n[EN() ? 1 : 0])}</h4>${row(T('u.ly.vol'), VOL(L.w[era] || 0))}${hot ? `<div class="row bad">${T('u.ly.hot')}</div>` : ''}`; }
  if (k === 'rail') { const R = LYD.rails.find(z => z.id === id); if (!R) return ''; return `<h4>${R.road ? '🛣' : '🚂'} ${esc(R.n[EN() ? 1 : 0])}</h4>${row(T('u.ly.kind'), T(R.road ? 'u.ly.road' : 'u.ly.railway'))}`; }
  if (k === 'res') { const r = LYD.res.find(z => z.id === id); if (!r) return ''; const X = resCtrl(r.t); return `<h4>${r.k === 'coal' ? '⛏' : r.k === 'gas' ? '🔥' : '🛢'} ${esc(r.n[EN() ? 1 : 0])}</h4>${row(T('u.ly.ctrl'), who(X))}${row(T('u.ly.size'), T('u.ly.s' + (r.s[era] || 1)))}${X && W.enemies(S, X).length ? `<div class="row warn">${T('u.ly.res_war')}</div>` : ''}`; }
  if (k === 'choke') { const c = LYD.choke.find(z => z.id === id); if (!c) return ''; const X = chokeCtrl(c), ens = X ? W.enemies(S, X) : []; return `<h4>⚓ ${esc(c.n[EN() ? 1 : 0])}</h4>${row(T('u.ly.ctrl'), who(X))}${ens.length ? `<div class="row warn">${T('u.ly.choke_war', { x: { list: ens.slice(0, 4).map(e => ({ id: e })) } })}</div>` : `<div class="row muted">${T('u.ly.choke_ok')}</div>`}`; }
  return '';
}
function showLyrTip(key, cx, cy) {
  const h = lyrTipHTML(key); if (!h) { hideTip(); return; }
  const tip = $('#tip'); tip.innerHTML = h; tip.hidden = false;
  const r = $('#mapwrap').getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight; let lx = cx - r.left + 16, ly = cy - r.top + 12; if (lx + w > r.width - 8) lx = cx - r.left - w - 12; if (ly + hh > r.height - 8) ly = r.height - hh - 8;
  tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
}
/* ---------- 图层面板 ---------- */
function lyrPanelHTML() {
  const pre = lyrPreOf(), sw = { front: '<i class="lsw lsw-front"></i>', supply: '<i class="lsw lsw-supply"></i>', sea: '<i class="lsw lsw-sea"></i>', rail: '<i class="lsw lsw-rail"></i>', res: '<i class="lsw lsw-res"></i>', choke: '<i class="lsw lsw-choke"></i>', units: '<i class="lsw lsw-units"></i>', labels: '<i class="lsw lsw-labels">A</i>' };
  return `<div class="lyrh"><b>${T('u.ly.title')}</b><button class="mini" data-lyrx="1" aria-label="${esc(T('u.close'))}">✕</button></div>
    <div class="lyrpre" role="group">${Object.keys(LYR_PRE).map(p => `<button data-lpre="${p}" class="${pre === p ? 'on' : ''}">${T('u.ly.p.' + p)}</button>`).join('')}</div>
    <div class="lyrlist">${LYR_ALL.map(k => `<label><input type="checkbox" data-lyr="${k}" ${lyrOn(k) ? 'checked' : ''}>${sw[k]}<span>${T('u.ly.' + k)}</span></label>`).join('')}</div>
    <div class="lyranim"><span>${T('u.ly.anim')}</span><div class="seg">${['auto', 'on', 'off'].map(v => `<button data-lanim="${v}" class="${(UI.animPref || 'auto') === v ? 'on' : ''}">${T('u.ly.a.' + v)}</button>`).join('')}</div></div>
    <p class="muted">${T('u.ly.anim_x')}</p>`;
}
function lyrPanel(open) {
  const p = $('#lyrPanel'), b = $('#lyrBtn'); if (!p || !b) return;
  if (open === undefined) open = p.hidden;
  p.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.classList.toggle('on', open);
  if (open) p.innerHTML = lyrPanelHTML();
}
function lyrChanged() { savePrefs(); LST = ''; if (S) { renderMap(); } const p = $('#lyrPanel'); if (p && !p.hidden) p.innerHTML = lyrPanelHTML(); }
document.addEventListener('click', e => {
  const t = e.target; if (!t || !t.closest) return;
  if (t.closest('#lyrBtn')) { lyrPanel(); return; }
  const pr = t.closest('[data-lpre]'); if (pr) { lyrSet(LYR_PRE[pr.dataset.lpre]); lyrChanged(); return; }
  const an = t.closest('[data-lanim]'); if (an) { UI.animPref = an.dataset.lanim; lyrApplyAnim(); lyrChanged(); return; }
  if (t.closest('[data-lyrx]')) { lyrPanel(false); return; }
  const p = $('#lyrPanel'); if (p && !p.hidden && !t.closest('.lyrwrap')) lyrPanel(false);
});
document.addEventListener('change', e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.lyr) return;
  const k = t.dataset.lyr;
  if (k === 'labels') UI.labels = t.checked; else if (t.checked) { if (!UI.lyr.includes(k)) UI.lyr.push(k); } else UI.lyr = UI.lyr.filter(z => z !== k);
  UI.lyr = LYR_ALL.filter(z => UI.lyr.includes(z));
  const lc = $('#lblChk'); if (lc) lc.checked = !!UI.labels;
  lyrChanged();
});
