/* ===================== 界面层 ===================== */
(() => {
'use strict';
const W = WG, NAME = W.NAME, IDS = W.IDS, DEF = W.DEF;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let S = null;
const UI = { sel: null, hover: null, view: 'political', tab: 'target', cat: 'dip', params: {}, open: {}, busy: false, tier: 'default', engine: 'auto', labels: true, feedFilter: 'all', rankSort: 'power', pending: null, abort: null, chatBusy: false, adj: null, homeOpen: {} };
const SAVE_KEY = 'tianxia.save.v3', PREF_KEY = 'tianxia.prefs';
function prefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; } }
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ tier: UI.tier, engine: UI.engine, labels: UI.labels, theme: document.documentElement.getAttribute('data-theme') || '' })); } catch (e) { } }
{ const p = prefs(); if (p.tier) UI.tier = p.tier; if (p.engine) UI.engine = p.engine; if (p.labels === false) UI.labels = false; if (p.theme) document.documentElement.setAttribute('data-theme', p.theme); }

/* ---------- 颜色 ---------- */
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); t = clamp(t, 0, 1); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); if (t) return t === 'dark'; return matchMedia('(prefers-color-scheme: dark)').matches; };
let HUE = {};
function assignHues() { // 贪心着色，使相邻国家颜色不同
  const pal = [205, 25, 140, 280, 50, 330, 175, 95, 245, 0, 115, 305, 160, 70];
  const order = IDS.slice().sort((a, b) => (GEO.land[b] || []).length - (GEO.land[a] || []).length);
  for (const id of order) {
    const nb = new Set(); for (const o of IDS) if (o !== id && (W.landAdj(id, o) || W.dist(id, o) < 600) && HUE[o] !== undefined) nb.add(HUE[o]);
    HUE[id] = pal.find(h => !nb.has(h)) ?? pal[IDS.indexOf(id) % pal.length];
  }
}
assignHues();
function hsl2hex(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); }
const polColor = id => isDark() ? hsl2hex(HUE[id], 24, 31) : hsl2hex(HUE[id], 34, 77);

/* ---------- 地图 ---------- */
const svg = $('#map'), gWorld = $('#world'), gLand = $('#gLand'), gHatch = $('#gHatch'), gOver = $('#gOver'), labelsEl = $('#labels');
const view = { k: 1, x: 0, y: 0 };
const paths = {};
function buildMap() {
  svg.setAttribute('viewBox', `0 0 ${GEO.w} ${GEO.h}`);
  $('#sphere').setAttribute('d', GEO.sphere); $('#grat').setAttribute('d', GEO.grat);
  $('#internal').setAttribute('d', GEO.internal); $('#borders').setAttribute('d', GEO.borders); $('#coast').setAttribute('d', GEO.coast);
  const ns = 'http://www.w3.org/2000/svg';
  for (const id of IDS) {
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', GEO.paths[id]); p.setAttribute('class', 'land'); p.dataset.id = id; gLand.appendChild(p); paths[id] = p;
  }
  labelsEl.innerHTML = IDS.map(id => `<div class="lbl" data-id="${id}"></div>`).join('');
}
function svgPt(cx, cy) { const pt = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse()); return pt; }
function applyView() {
  const k = view.k; const maxX = 0, minX = GEO.w - GEO.w * k, maxY = 0, minY = GEO.h - GEO.h * k;
  view.x = clamp(view.x, minX - 200, maxX + 200); view.y = clamp(view.y, minY - 120, maxY + 120);
  gWorld.setAttribute('transform', `translate(${view.x.toFixed(2)},${view.y.toFixed(2)}) scale(${k.toFixed(4)})`);
  if (!UI.raf) UI.raf = requestAnimationFrame(() => { UI.raf = 0; placeLabels(); });
}
function zoomAt(cx, cy, f) { const p = svgPt(cx, cy); const k2 = clamp(view.k * f, 1, 14); view.x = p.x - (p.x - view.x) * (k2 / view.k); view.y = p.y - (p.y - view.y) * (k2 / view.k); view.k = k2; applyView(); }
function zoomTo(id) {
  const b = GEO.bbox[id]; if (!b) return; const w = Math.max(b[2] - b[0], 60), h = Math.max(b[3] - b[1], 40);
  const k = clamp(Math.min(GEO.w / (w * 2.6), GEO.h / (h * 2.6)), 1, 5.5);
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; view.k = k; view.x = GEO.w / 2 - cx * k; view.y = GEO.h / 2 - cy * k; applyView();
}
function placeLabels() {
  if (!S) return;
  const rect = svg.getBoundingClientRect(); const ctm = gWorld.getScreenCTM(); if (!ctm) return;
  const wr = labelsEl.getBoundingClientRect();
  for (const el of labelsEl.children) {
    const id = el.dataset.id; const [x, y] = GEO.label[id]; const p = new DOMPoint(x, y).matrixTransform(ctm);
    const lx = p.x - wr.left, ly = p.y - wr.top;
    const area = GEO.areaPx[id] || 100; const scr = area * view.k * view.k * (rect.width / GEO.w) ** 2;
    const vis = UI.labels && (scr > 180 || id === S.player || id === UI.sel || (el.dataset.badge && scr > 20));
    el.hidden = !vis || lx < -40 || ly < -20 || lx > wr.width + 40 || ly > wr.height + 20;
    if (!el.hidden) { el.style.left = lx + 'px'; el.style.top = ly + 'px'; }
    el.classList.toggle('small', scr < 900);
    el._pri = (id === S.player || id === UI.sel ? 1e9 : 0) + (el.dataset.badge ? 1e8 : 0) + scr; el._x = lx; el._y = ly;
  }
  // 简单避让：按优先级放置，重叠的低优先级标签隐藏
  const shown = [...labelsEl.children].filter(el => !el.hidden).sort((a, b) => b._pri - a._pri); const boxes = [];
  for (const el of shown) {
    const w = el._w || 40, h = el._h || 14; const bx = [el._x - w / 2, el._y - h / 2, el._x + w / 2, el._y + h / 2];
    if (el._pri < 1e8 && boxes.some(o => bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1])) { el.hidden = true; continue; }
    boxes.push(bx);
  }
}
function fillFor(id) {
  const x = S.actors[id], P = S.player, boss = W.boss(S, id);
  const acc = css('--accent'), land = css('--land');
  if (UI.view === 'political') { if (boss === P) return x.ctrl === P && id !== P ? mix(acc, land, 0.25) : id === P ? acc : mix(acc, land, 0.45); return polColor(boss); }
  if (UI.view === 'relation') {
    if (boss === P) return acc;
    const b = boss; if (W.atWar(S, b, P)) return css('--hostile');
    const r = W.rel(S, b, P);
    if (r >= 0) return r >= 40 ? mix(css('--friend-soft'), css('--friend'), (r - 40) / 60) : mix(css('--neutral-soft'), css('--friend-soft'), r / 40);
    return r <= -40 ? mix(css('--hostile-soft'), css('--hostile'), (-r - 40) / 60 * 0.8) : mix(css('--neutral-soft'), css('--hostile-soft'), -r / 40);
  }
  if (UI.view === 'military') { if (!W.indep(S, id)) return mix(land, polColor(boss), 0.4); const mx = Math.max(...IDS.map(i => W.power(S, i))); const t = Math.log(1 + W.power(S, id)) / Math.log(1 + mx); return mix(land, id === P ? acc : css('--hostile'), t * 0.9); }
  if (UI.view === 'economy') { const mx = Math.max(...IDS.map(i => S.actors[i].gdp)); const t = Math.log(1 + x.gdp) / Math.log(1 + mx); return mix(land, id === P ? acc : css('--neutral'), t * 0.9); }
  if (UI.view === 'alliance') {
    if (boss === P) return acc; const b = boss;
    if (W.isAlly(S, b, P)) return css('--friend');
    if (S.blocs.NATO && S.blocs.NATO.members.includes(b)) return mix(css('--friend-soft'), land, 0.2);
    if (S.blocs.CSTO && S.blocs.CSTO.members.includes(b)) return mix(css('--unknown-soft'), css('--unknown'), 0.3);
    if (W.isAlly(S, b, 'USA') || W.isPartner(S, b, 'USA')) return mix(css('--friend-soft'), land, 0.55);
    if (['CHN', 'RUS'].some(c => b === c || W.isAlly(S, b, c) || W.isPartner(S, b, c))) return mix(css('--unknown-soft'), land, 0.35);
    return land;
  }
  if (UI.view === 'war') {
    if (boss === P) return acc; const b = boss;
    if (W.atWar(S, b, P)) return css('--hostile');
    if (W.enemies(S, P).some(e => W.atWar(S, b, e))) return css('--friend');
    if (W.enemies(S, b).length) return css('--unknown-soft');
    if (S.sanctions.some(s => (s.from === P && s.to === b) || (s.to === P && s.from === b))) return mix(css('--hostile-soft'), land, 0.4);
    return land;
  }
  return land;
}
const LEGENDS = {
  political: () => `<span><i style="background:${css('--accent')}"></i>你的势力范围</span><span class="muted">其余按国家/大区着色；斜线=被占领</span>`,
  relation: () => `<span><i style="background:${css('--friend')}"></i>友好</span><span><i style="background:${css('--neutral-soft')}"></i>中立</span><span><i style="background:${css('--hostile-soft')}"></i>冷淡</span><span><i style="background:${css('--hostile')}"></i>敌对/交战</span><span class="muted">APP-6 敌我标识色</span>`,
  military: () => `<span><i style="background:${mix(css('--land'), css('--hostile'), .2)}"></i>弱</span><span><i style="background:${mix(css('--land'), css('--hostile'), .9)}"></i>强</span><span class="muted">军力指数（对数）</span>`,
  economy: () => `<span><i style="background:${mix(css('--land'), css('--neutral'), .2)}"></i>小</span><span><i style="background:${mix(css('--land'), css('--neutral'), .9)}"></i>大</span><span class="muted">GDP（对数）</span>`,
  alliance: () => `<span><i style="background:${css('--friend')}"></i>你的盟友</span><span><i style="background:${mix(css('--friend-soft'), css('--land'), .2)}"></i>北约</span><span><i style="background:${mix(css('--unknown-soft'), css('--unknown'), .3)}"></i>集安组织</span><span><i style="background:${mix(css('--friend-soft'), css('--land'), .55)}"></i>美系伙伴</span><span><i style="background:${mix(css('--unknown-soft'), css('--land'), .35)}"></i>中俄伙伴</span>`,
  war: () => `<span><i style="background:${css('--hostile')}"></i>与你交战</span><span><i style="background:${css('--friend')}"></i>与你共同作战</span><span><i style="background:${css('--unknown-soft')}"></i>其他战争</span><span><i style="background:${mix(css('--hostile-soft'), css('--land'), .4)}"></i>制裁往来</span>`,
};
function renderMap() {
  if (!S) return;
  for (const id of IDS) paths[id].style.fill = fillFor(id);
  // 占领斜线
  const ns = 'http://www.w3.org/2000/svg'; gHatch.innerHTML = '';
  for (const id of IDS) if (S.actors[id].ctrl !== id) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', GEO.paths[id]); p.setAttribute('class', 'hatch'); p.setAttribute('fill', 'url(#hatchP)'); gHatch.appendChild(p); }
  // 选中与本国轮廓
  $('#selPath').setAttribute('d', UI.sel ? GEO.outline[UI.sel] : ''); $('#mePath').setAttribute('d', GEO.outline[S.player]);
  // 战线箭头与封锁
  let o = '';
  const P = S.player;
  for (const f of S.fronts) {
    const rt = W.route(S, f.att, f.target); const src = rt && rt.via && GEO.label[rt.via] ? rt.via : f.att;
    const b = GEO.label[f.target]; let a = GEO.label[src]; const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); const L = Math.min(dd, 110); if (dd > 0) a = [b[0] + (a[0] - b[0]) / dd * L, b[1] + (a[1] - b[1]) / dd * L];
    const mine = f.att === P, vs = W.boss(S, f.target) === P;
    const col = mine ? css('--accent') : vs ? css('--hostile') : css('--unknown');
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.18;
    o += `<path class="front${vs ? ' pulse' : ''}" d="M${a[0]} ${a[1]} Q${mx} ${my} ${b[0]} ${b[1]}" stroke="${col}" marker-end="url(#arr-${mine ? 'me' : vs ? 'vs' : 'ot'})"/>`;
  }
  for (const k of S.blockades) { const c = GEO.label[k.target]; o += `<circle class="blockade" cx="${c[0]}" cy="${c[1]}" r="26" stroke="${k.by === P ? css('--accent') : css('--hostile')}"/>`; }
  gOver.innerHTML = o;
  // 标签
  for (const el of labelsEl.children) {
    const id = el.dataset.id; const f = S.fronts.filter(x => x.target === id).sort((a, b) => b.progress - a.progress)[0];
    const occ = S.actors[id].ctrl !== id;
    let badge = '';
    if (f) { const col = f.att === P ? css('--accent') : W.boss(S, id) === P ? css('--hostile') : css('--unknown'); badge = `<span class="badge" style="background:${col}">⚔ ${Math.max(0, Math.round(f.progress))}%</span>`; }
    else if (occ) badge = `<span class="badge" style="background:${css('--muted')}">占领 · 抵抗${Math.round(S.actors[id].resist)}</span>`;
    el.dataset.badge = badge ? '1' : '';
    el.innerHTML = esc(NAME(id)) + badge;
    el.classList.toggle('me', id === P);
    el._w = Math.max(NAME(id).length * 11.5 + 4, badge ? 64 : 0); el._h = badge ? 30 : 16;
  }
  $('#legend').innerHTML = LEGENDS[UI.view]();
  document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.view));
  placeLabels();
}
// 交互：拖拽、缩放、点击、悬停
(function mapInput() {
  const pts = new Map(); let drag = null, moved = 0, pinch = null;
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (pts.size === 1) drag = { x: e.clientX, y: e.clientY }; else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; } });
  svg.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) {
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2; zoomAt(cx, cy, (pinch.k * d / pinch.d) / view.k); moved += 10; return; }
      if (drag) { const p0 = svgPt(prev[0], prev[1]), p1 = svgPt(e.clientX, e.clientY); view.x += (p1.x - p0.x); view.y += (p1.y - p0.y); moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]); applyView(); }
      hideTip(); return;
    }
    const id = e.target && e.target.dataset ? e.target.dataset.id : null;
    if (id !== UI.hover) { UI.hover = id; $('#hovPath').setAttribute('d', id ? GEO.outline[id] : ''); }
    if (id) showTip(id, e.clientX, e.clientY); else hideTip();
  });
  const end = e => { const wasDrag = moved > 6; pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; if (!wasDrag && e.type === 'pointerup') { const el = document.elementFromPoint(e.clientX, e.clientY); const id = el && el.dataset ? el.dataset.id : null; if (id && IDS.includes(id)) select(id); } } };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { UI.hover = null; $('#hovPath').setAttribute('d', ''); hideTip(); });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  svg.addEventListener('dblclick', e => zoomAt(e.clientX, e.clientY, 1.8));
  document.querySelectorAll('.zoom button').forEach(b => b.onclick = () => { const r = svg.getBoundingClientRect(); if (b.dataset.z === 'reset') { view.k = 1; view.x = 0; view.y = 0; applyView(); } else zoomAt(r.left + r.width / 2, r.top + r.height / 2, b.dataset.z === 'in' ? 1.6 : 1 / 1.6); });
  window.addEventListener('resize', () => placeLabels());
})();
function relWord(r, war) { if (war) return ['交战', 'hostile']; if (r >= 60) return ['亲密', 'friend']; if (r >= 25) return ['友好', 'friend']; if (r > -25) return ['中立', 'neutral']; if (r > -60) return ['冷淡', 'unknown']; return ['敌对', 'hostile']; }
function statusText(id) { const x = S.actors[id]; if (x.ctrl !== id) return `被${NAME(x.ctrl)}占领`; if (x.overlord) return `${NAME(x.overlord)}的附庸`; return '独立'; }
function showTip(id, cx, cy) {
  const tip = $('#tip'); const x = S.actors[id], P = S.player; const b = W.boss(S, id);
  const [rw, rc] = id === P ? ['本国', 'friend'] : relWord(W.rel(S, b, P), W.atWar(S, b, P));
  tip.innerHTML = `<h4><i style="width:10px;height:10px;border-radius:2px;background:${polColor(id)};display:inline-block"></i>${esc(NAME(id))}<span class="stance s-${rc}">${rw}</span></h4>
  <div class="row"><span class="muted">状态</span><span>${statusText(id)}</span></div>
  <div class="row"><span class="muted">GDP</span><span class="num">${W.fmtB(x.gdp)}</span></div>
  <div class="row"><span class="muted">军力指数</span><span class="num">${W.fmtN(W.power(S, id))}${x.nukes ? ' · 核' + x.nukes : ''}</span></div>
  ${id !== P ? `<div class="row"><span class="muted">对你关系</span><span class="num">${Math.round(W.rel(S, b, P))}</span></div>` : ''}
  <div class="row"><span class="muted">稳定</span><span class="num">${Math.round(x.stab)}</span></div>`;
  const r = $('#mapwrap').getBoundingClientRect(); tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight; let lx = cx - r.left + 16, ly = cy - r.top + 12; if (lx + w > r.width - 8) lx = cx - r.left - w - 12; if (ly + h > r.height - 8) ly = r.height - h - 8;
  tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
}
function hideTip() { $('#tip').hidden = true; }
function select(id) { UI.sel = id; UI.open = {}; if (UI.tab !== 'diplo') UI.tab = 'target'; renderMap(); renderSide(); }

/* ---------- 顶栏 ---------- */
function delta(a, b, fmt = v => v.toFixed(1)) { const d = b - a; if (Math.abs(d) < 1e-9) return ''; return `<i class="${d > 0 ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d))}</i>`; }
function renderTop() {
  if (!S) return;
  const P = S.player, x = S.actors[P], h = W.hegemony(S); const prev = S.history[S.history.length - 2];
  $('#dateLine').textContent = `${W.dateStr(S)} · 第${S.turn + 1}回合`;
  $('#meChip').innerHTML = `<i class="sw" style="background:${css('--accent')}"></i><b>${esc(NAME(P))}</b>`;
  const goal = S.goal === 'unify' ? `<div class="kpi heg"><span>统一进度</span><b>${h.units}/${IDS.length}</b><div class="meter"><div style="width:${h.unify * 100}%"></div></div></div>`
    : `<div class="kpi heg"><span>霸权进度${S.heg ? ' · 维持' + S.heg + '/4' : ''}</span><b>${Math.round(h.prog * 100)}%</b><div class="meter"><div style="width:${h.prog * 100}%"></div></div></div>`;
  $('#kpis').innerHTML = `
    <div class="kpi"><span>GDP</span><b>${W.fmtB(x.gdp)}${prev ? delta(prev.gdp, x.gdp, v => W.fmtB(v)) : ''}</b></div>
    <div class="kpi"><span>年增长</span><b class="${x.lastG < 0 ? 'bad' : ''}">${(x.lastG * 4).toFixed(1)}%</b></div>
    <div class="kpi"><span>军力指数</span><b>${W.fmtN(W.power(S, P))}</b></div>
    <div class="kpi"><span>稳定</span><b class="${x.stab < 30 ? 'bad' : ''}">${Math.round(x.stab)}</b></div>
    <div class="kpi"><span>国库</span><b class="${x.treasury < 0 ? 'bad' : ''}">${W.fmtB(x.treasury - W.moneyQueued(S))}</b></div>
    <div class="kpi"><span>科技</span><b>${x.tech.toFixed(0)}</b></div>
    ${x.nukes ? `<div class="kpi"><span>核弹头</span><b>${W.fmtN(x.nukes)}</b></div>` : ''}
    ${goal}`;
  const mx = W.apMax(S), left = W.apLeft(S);
  $('#apBox').innerHTML = `<span class="aplbl">行动点 ${left}/${mx}</span><span class="pips">` + Array.from({ length: mx }, (_, i) => `<i class="pip${i < left ? ' on' : ''}"></i>`).join('') + '</span>';
  const eng = $('#engineBadge'); const on = useLLM();
  eng.className = 'engine ' + (on ? 'on' : 'off'); eng.textContent = on ? '● Claude 推演' : LLM.state === 'pending' ? '… 连接推演引擎' : '○ 规则 AI';
  eng.title = on ? '各国反应、自由指令和外交谈判由 Claude 实时推演' : '当前使用带随机性的规则 AI（点击打开设置）';
}
const useLLM = () => UI.engine !== 'rules' && LLM.available();

/* ---------- 侧栏 ---------- */
function renderSide() {
  if (!S) return;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  $('#inboxDot').hidden = !S.inbox.length;
  const body = $('#tabbody'); const key = UI.tab + '|' + UI.sel; const st = key === UI.sideKey ? body.scrollTop : 0; UI.sideKey = key;
  body.innerHTML = UI.tab === 'target' ? targetHTML() : UI.tab === 'home' ? homeHTML() : UI.tab === 'diplo' ? diploHTML() : intelHTML();
  if (UI.tab === 'home') drawSparks();
  if (UI.tab === 'diplo') { const c = $('#chatlog'); if (c) c.scrollTop = c.scrollHeight; }
  body.scrollTop = st;
}
function spark(key, color) { return `<svg class="spark" data-k="${key}" data-c="${color}" viewBox="0 0 200 34" preserveAspectRatio="none"></svg>`; }
function drawSparks() {
  document.querySelectorAll('svg.spark').forEach(s => {
    const k = s.dataset.k, col = css(s.dataset.c); const v = S.history.map(h => h[k]); if (v.length < 2) { s.innerHTML = `<text x="0" y="22" font-size="11" fill="${css('--muted')}">回合推进后显示趋势</text>`; return; }
    const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1; const pts = v.map((y, i) => [i / (v.length - 1) * 196 + 2, 30 - (y - mn) / rg * 26]);
    const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    s.innerHTML = `<path d="${d}L198 32L2 32Z" fill="${col}" fill-opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.4" fill="${col}"/>`;
  });
}
const CAT_NAMES = { dip: '外交', econ: '经济', mil: '军事', covert: '隐蔽', occ: '占领区' };
function tagsFor(id) {
  const x = S.actors[id], d = DEF[id], t = [];
  t.push(`<span class="tag">${{ dem: '民主政体', hyb: '混合政体', aut: '威权政体' }[d.gov]}</span>`);
  if (x.nukes > 0) t.push(`<span class="tag red">有核国家</span>`);
  for (const b of Object.values(S.blocs)) if (b.members.includes(id)) t.push(`<span class="tag blue">${esc(b.name)}</span>`);
  for (const e of W.econBlocs(id)) t.push(`<span class="tag">${W.ECON_NAMES[e]}</span>`);
  if (x.ctrl !== id) t.push(`<span class="tag red">被${esc(NAME(x.ctrl))}占领 · 抵抗${Math.round(x.resist)}</span>`);
  if (x.overlord) t.push(`<span class="tag acc">${esc(NAME(x.overlord))}的附庸</span>`);
  if (W.enemies(S, id).length) t.push(`<span class="tag red">交战：${W.enemies(S, id).map(NAME).join('、')}</span>`);
  return t.join('');
}
function dossierStats(id) {
  const x = S.actors[id], d = DEF[id];
  return `<div class="grid2">
    <div class="stat"><span>GDP</span><b>${W.fmtB(x.gdp)}</b></div><div class="stat"><span>年增长</span><b class="${x.lastG < 0 ? 'bad' : ''}">${(x.lastG * 4).toFixed(1)}%</b></div>
    <div class="stat"><span>人口</span><b>${d.pop >= 100 ? Math.round(d.pop) : d.pop}百万</b></div><div class="stat"><span>稳定</span><b>${Math.round(x.stab)}</b></div>
    <div class="stat"><span>军力指数</span><b>${W.fmtN(W.power(S, id))}</b></div><div class="stat"><span>核弹头</span><b>${W.fmtN(x.nukes)}${!x.nukes && x.nukeProg ? ` <small class="warn">研发${Math.round(x.nukeProg)}%</small>` : ''}</b></div>
    <div class="stat"><span>陆军</span><b>${W.fmtN(W.landEff(S, id))}</b></div><div class="stat"><span>海军</span><b>${W.fmtN(W.navyEff(S, id))}</b></div>
    <div class="stat"><span>空天/导弹</span><b>${W.fmtN(W.airEff(S, id))}</b></div><div class="stat"><span>科技</span><b>${x.tech.toFixed(0)}</b></div>
    <div class="stat"><span>军费/GDP</span><b>${x.milPct.toFixed(1)}%</b></div><div class="stat"><span>投送半径</span><b>${W.fmtN(W.reach(S, id))}km</b></div>
  </div>`;
}
function targetHTML() {
  const P = S.player; const id = UI.sel;
  if (!id) return `<div class="sec"><p class="muted">在地图上点击任意国家或大区查看档案，并对其采取外交、经济、军事或隐蔽行动。</p><p class="muted">也可以在底部的“自由指令”中用自然语言下达任何命令，由推演引擎裁定。</p></div>` + homeSummary();
  const x = S.actors[id], d = DEF[id], b = W.boss(S, id);
  let h = `<div class="dossier-h"><div class="sw" style="background:${polColor(id)}">${id}</div><div style="min-width:0"><h2>${esc(d.name)}</h2><div class="tags">${tagsFor(id)}</div></div></div>`;
  if (id === P) return h + `<div class="sec">${dossierStats(id)}</div><div class="sec"><p class="muted">这是你的国家。内政、军费、动员与战线管理在「本国」面板；选择其他国家以对其采取行动。</p><button class="btn-primary" data-go="home">打开本国面板</button></div>`;
  const r = W.rel(S, b, P), [rw, rc] = relWord(r, W.atWar(S, b, P));
  const tr = W.treatiesOf(S, P, id).map(t => W.TREATY_NAME[t.type]);
  const sanc = S.sanctions.filter(s => (s.from === P && s.to === id) || (s.to === P && s.from === id)).map(s => `${s.from === P ? '你→对方' : '对方→你'}：${{ econ: ['', '定向制裁', '全面制裁', '贸易禁运'][s.level], tech: '科技管制', tariff: '关税', fin: '金融制裁', energy: '能源禁运' }[s.kind]}`);
  const allies = IDS.filter(c => c !== id && W.isAlly(S, id, c)).map(NAME);
  const partners = IDS.filter(c => c !== id && W.isPartner(S, id, c)).map(NAME);
  const ratio = (W.power(S, P) + 1) / (W.power(S, id) + 1);
  h += `<div class="sec"><h3>与你的关系 <span class="stance s-${rc}">${rw} ${Math.round(r)}</span></h3>
    <div class="relbar"><i style="left:${(r + 100) / 2}%"></i></div>
    <div class="grid2" style="margin-top:8px">
      <div class="stat"><span>你的影响力</span><b>${Math.round(W.infl(S, P, id))}</b></div><div class="stat"><span>对方对你影响力</span><b>${Math.round(W.infl(S, id, P))}</b></div>
      <div class="stat"><span>对方对你贸易依赖</span><b>${(W.exposure(S, id, P) * 100).toFixed(0)}%</b></div><div class="stat"><span>你对对方依赖</span><b>${(W.exposure(S, P, id) * 100).toFixed(0)}%</b></div>
      <div class="stat"><span>军力对比（你:对方）</span><b>${ratio >= 1 ? ratio.toFixed(1) + ':1' : '1:' + (1 / ratio).toFixed(1)}</b></div><div class="stat"><span>距离</span><b>${W.fmtN(W.minDistFrom(S, P, id))}km</b></div>
    </div>
    <div style="margin-top:8px;font-size:12.5px">条约：${tr.length ? tr.join('、') : '<span class="muted">无</span>'}${sanc.length ? `<br>制裁：${sanc.join('；')}` : ''}</div>
  </div>`;
  h += `<div class="sec"><h3>国情</h3>${dossierStats(id)}<div style="margin-top:8px;font-size:12.5px">同盟：${allies.join('、') || '<span class="muted">无</span>'}${partners.length ? `<br>安全伙伴：${partners.join('、')}` : ''}</div></div>`;
  h += `<div class="sec"><h3>战略画像</h3><div class="doctrine">${esc(d.doctrine)}<br><span style="font-size:11.5px">本局性格：鹰派 ${(x.hawk * 100).toFixed(0)} · 冒险 ${(x.risk * 100).toFixed(0)} · 盟约忠诚 ${(x.loyal * 100).toFixed(0)}</span></div></div>`;
  const occ = x.ctrl === P && id !== P;
  const cats = occ ? ['occ', 'dip'] : ['dip', 'econ', 'mil', 'covert'];
  if (!cats.includes(UI.cat)) UI.cat = cats[0];
  h += `<div class="sec"><h3>可采取的行动 <button data-go="chat" style="font-size:12px;padding:.15em .6em">与其政府对话 ›</button></h3><div class="cats">${cats.map(c => `<button data-cat="${c}" class="${UI.cat === c ? 'on' : ''}">${CAT_NAMES[c]}</button>`).join('')}</div><div class="acts">${actionsHTML(W.ACTIONS.filter(a => a.cat === UI.cat && !a.self), id)}</div></div>`;
  return h;
}
function paramsFor(a) { const p = UI.params[a.id] || (UI.params[a.id] = {}); for (const pp of a.params || []) { if (a.id === 'leavebloc') pp.options = Object.values(S.blocs).filter(b => b.members.includes(S.player)).map(b => ({ v: b.id, l: b.name })); if (p[pp.key] === undefined && pp.options.length) p[pp.key] = pp.options[a.id === 'invade' || a.id === 'aid' || a.id === 'armsaid' || a.id === 'loan' || a.id === 'buildup' ? Math.min(1, pp.options.length - 1) : 0].v; } return p; }
function actionsHTML(list, target) {
  return list.map(a => {
    const p = paramsFor(a); const st = W.actionStatus(S, a.id, target, p); const open = UI.open[a.id];
    const costTxt = st.cost > 0 ? `$${W.fmtB(st.cost)}` : '';
    let body = '';
    if (open) {
      body = `<div class="act-b"><div class="d">${esc(a.desc)}</div>` +
        (a.params || []).map(pp => `<label class="prm">${pp.label}<select data-act="${a.id}" data-key="${pp.key}">${pp.options.map(o => `<option value="${o.v}" ${String(p[pp.key]) === String(o.v) ? 'selected' : ''}>${o.l}</option>`).join('')}</select></label>`).join('') +
        `<div class="p ${st.ok ? '' : 'no'}">${esc(st.ok ? (st.preview || '可执行') : st.reason)}</div>` +
        `<button class="go ${a.danger ? '' : 'btn-primary'}" data-queue="${a.id}" data-t="${target}" ${st.ok ? '' : 'disabled'}>${a.danger ? '⚠ ' : ''}加入本回合行动</button></div>`;
    }
    return `<div class="act ${st.ok ? '' : 'dis'} ${a.danger ? 'danger' : ''}"><div class="act-h" data-toggle="${a.id}"><span class="nm">${esc(a.name)}</span><span class="cost">${costTxt}</span><span class="apc">${'<i></i>'.repeat(a.ap)}</span><span class="muted">${open ? '▾' : '▸'}</span></div>${body}</div>`;
  }).join('');
}
function homeSummary() { return ''; }
function homeHTML() {
  const P = S.player, x = S.actors[P], h = W.hegemony(S);
  let s = '';
  s += `<div class="sec"><h3>${S.goal === 'unify' ? '统一世界' : '全球霸权'}目标</h3>`;
  if (S.goal === 'unify') s += `<div class="stat"><span>已纳入统治/保护的地区</span><b>${h.units} / ${IDS.length}</b></div><div class="bar" style="margin-top:6px"><div style="width:${h.unify * 100}%"></div></div>`;
  else s += `<div class="stat"><span>势力范围GDP占世界（目标50%）</span><b>${(h.gdpShare * 100).toFixed(1)}%</b></div><div class="bar" style="margin:4px 0 8px"><div style="width:${Math.min(100, h.gdpShare / 0.5 * 100)}%"></div></div><div class="stat"><span>军力占世界（目标45%）</span><b>${(h.milShare * 100).toFixed(1)}%</b></div><div class="bar" style="margin-top:4px"><div style="width:${Math.min(100, h.milShare / 0.45 * 100)}%"></div></div><p class="muted" style="font-size:12px;margin:6px 0 0">两项同时达标并维持4个回合即确立霸权。${S.heg ? `已维持 ${S.heg}/4。` : ''}</p>`;
  s += `</div>`;
  s += `<div class="sec"><h3>国力走势</h3><div class="grid2"><div><div class="stat"><span>GDP</span><b>${W.fmtB(x.gdp)}</b></div>${spark('gdp', '--neutral')}</div><div><div class="stat"><span>军力</span><b>${W.fmtN(W.power(S, P))}</b></div>${spark('mil', '--hostile')}</div><div><div class="stat"><span>稳定</span><b>${Math.round(x.stab)}</b></div>${spark('stab', '--friend')}</div><div><div class="stat"><span>霸权进度</span><b>${Math.round(h.prog * 100)}%</b></div>${spark('heg', '--accent')}</div></div></div>`;
  const annual = x.gdp * x.milPct / 100;
  s += `<div class="sec"><h3>国防预算（即时生效，不耗行动点）</h3>
    <div class="slider"><span>军费占GDP</span><input type="range" id="milPct" min="0.3" max="25" step="0.1" value="${x.milPct.toFixed(1)}"><b class="num" id="milPctV">${x.milPct.toFixed(1)}%</b></div>
    <div class="muted" style="font-size:12px" id="milPctN">年度军费约 $${W.fmtB(annual)}；超过3%会拖累经济增长${x.milPct > 3 ? `（当前约 -${((x.milPct - 3) * 0.24).toFixed(1)}%/年）` : ''}</div>
    <div class="slider" style="margin-top:8px"><span>投入方向</span><select id="mixSel">${[['bal', '维持现有比例'], ['land', '陆军优先'], ['navy', '海军优先'], ['air', '空天与导弹优先']].map(([v, l]) => `<option value="${v}" ${x.mixMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="muted" style="font-size:12px">陆 ${Math.round(x.mix[0] * 100)}% · 海 ${Math.round(x.mix[1] * 100)}% · 空天 ${Math.round(x.mix[2] * 100)}% · 动员：${['和平状态', '局部动员', '总动员', '全面战争'][x.mob]}</div></div>`;
  s += `<div class="sec"><h3>内政行动</h3><div class="acts">${actionsHTML(W.ACTIONS.filter(a => a.self), P)}</div></div>`;
  const fr = S.fronts.filter(f => f.att === P || W.boss(S, f.target) === P);
  s += `<div class="sec"><h3>战线</h3>${fr.length ? '<div class="list">' + fr.map(f => frontHTML(f, true)).join('') + '</div>' : '<p class="muted">当前没有战线。</p>'}${W.enemies(S, P).length ? `<p style="font-size:12.5px;margin:6px 0 0">交战国：${W.enemies(S, P).map(e => `<a href="#" data-sel="${e}">${esc(NAME(e))}</a>`).join('、')}</p>` : ''}</div>`;
  const realm = W.realm(S, P).filter(v => v !== P);
  s += `<div class="sec"><h3>占领区与附庸</h3>${realm.length ? '<div class="list">' + realm.map(v => { const y = S.actors[v]; const occ = y.ctrl === P; return `<div class="item"><div class="row"><b><a href="#" data-sel="${v}">${esc(NAME(v))}</a></b><span class="tag ${occ ? 'red' : 'acc'}">${occ ? (y.integrated ? '已并入' : '占领中') : '附庸'}</span></div>${occ && !y.integrated ? `<div class="row" style="font-size:12px"><span class="muted">抵抗</span><div class="bar" style="flex:1"><div style="width:${y.resist}%;background:var(--hostile)"></div></div><b class="num">${Math.round(y.resist)}</b></div>` : ''}<div class="row muted" style="font-size:12px"><span>GDP ${W.fmtB(y.gdp)}</span><span>${occ ? '' : '影响力 ' + Math.round(W.infl(S, P, v))}</span></div><div class="btns">${(occ ? ['pacify', 'annex', 'puppet'] : ['integrate', 'release']).map(aid => { const a = W.ACT[aid]; const st = W.actionStatus(S, aid, v, {}); return `<button data-queue="${aid}" data-t="${v}" ${st.ok ? '' : 'disabled'} title="${esc(st.ok ? st.preview || '' : st.reason)}">${a.name}</button>`; }).join('')}</div></div>`; }).join('') + '</div>' : '<p class="muted">暂无。征服、政变或胁迫可让其他地区成为你的占领区或附庸。</p>'}</div>`;
  const trs = S.treaties.filter(t => t.a === P || t.b === P);
  const grouped = {}; for (const t of trs) { const o = t.a === P ? t.b : t.a; (grouped[t.type] = grouped[t.type] || []).push(o); }
  const blocs = Object.values(S.blocs).filter(b => b.members.includes(P)).map(b => b.name);
  s += `<div class="sec"><h3>条约与集团</h3><div style="font-size:12.5px;display:grid;gap:4px">${blocs.length ? `<div>集团：${blocs.join('、')}</div>` : ''}${Object.entries(grouped).map(([k, v]) => `<div>${W.TREATY_NAME[k]}：${v.map(o => `<a href="#" data-sel="${o}">${esc(NAME(o))}</a>`).join('、')}</div>`).join('') || '<span class="muted">暂无双边条约</span>'}</div></div>`;
  return s;
}
function frontHTML(f, ctl) {
  const P = S.player, mine = f.att === P; const p = Math.max(0, f.progress);
  const kind = { land: '陆路', amphib: '跨海登陆', exped: '远征', none: '无补给线' }[f.kind] || '';
  return `<div class="fr"><div><b>${esc(NAME(f.att))} → ${esc(NAME(f.target))}</b> <span class="muted" style="font-size:12px">${kind} · 第${f.turns}回合 · 力量比 ${(f.ratio || 0).toFixed(2)}${f.navalRatio && f.kind !== 'land' ? ' · 海上 ' + f.navalRatio.toFixed(2) : ''}</span></div><b class="num">${Math.round(f.progress)}%</b>
    <div class="prog ${mine ? 'mine' : ''}"><div style="width:${p}%"></div></div>
    ${ctl && mine ? `<div style="grid-column:1/-1;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12.5px">投入兵力<select data-commit="${f.id}">${[0.2, 0.3, 0.45, 0.55, 0.7, 0.8].map(v => `<option value="${v}" ${Math.abs(v - f.commit) < 0.01 ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select><button data-halt="${f.id}">停止进攻</button><button data-peace="${W.boss(S, f.target)}">和谈…</button></div>` : ''}
    ${ctl && !mine ? `<div style="grid-column:1/-1;font-size:12.5px"><button data-peace="${f.att}">向${esc(NAME(f.att))}提议和谈…</button> <span class="muted">提高动员、扩军或寻求盟友援助可守住战线</span></div>` : ''}</div>`;
}
function diploHTML() {
  const P = S.player; let s = '';
  s += `<div class="sec"><h3>来函 ${S.inbox.length ? `<span class="tag red">${S.inbox.length}</span>` : ''}</h3>${S.inbox.length ? '<div class="list">' + S.inbox.map(o => `<div class="item"><div class="row"><b>${esc(NAME(o.from))}</b><span class="muted" style="font-size:11.5px">${W.dateStr(S, o.turn)} · ${o.expires - S.turn + 1}回合内有效</span></div><div style="font-size:13px;margin-top:4px">${esc(o.text)}</div><div class="btns"><button class="btn-primary" data-offer="${o.id}" data-ok="1">接受</button><button data-offer="${o.id}" data-ok="0">拒绝</button><button data-sel="${o.from}">查看档案</button></div></div>`).join('') + '</div>' : '<p class="muted">暂无来函。各国可能主动向你提出结盟、停火、贸易或要求。</p>'}</div>`;
  const X = UI.sel && UI.sel !== P && W.indep(S, UI.sel) ? UI.sel : null;
  s += `<div class="sec"><h3>外交磋商${X ? '：' + esc(NAME(X)) : ''}</h3>`;
  if (!X) s += `<p class="muted">在地图上选择一个独立国家，即可与其政府直接对话、讨价还价。</p>`;
  else if (!useLLM()) s += `<p class="muted">自由谈判需要 Claude 推演引擎（${LLM.state === 'pending' ? '连接中' : '当前为规则 AI 模式'}）。你仍可在「目标」面板中使用结构化外交行动（结盟、自贸、和谈、要求附庸等）。</p><button data-go="settings">打开设置</button>`;
  else {
    const hist = S.chat[X] || [];
    s += `<div class="muted" style="font-size:12px">你在与${esc(DEF[X].voice)}磋商。可以提条件、威胁、利诱或试探；达成的协议需签署（1行动点）后生效。</div>
      <div class="chat" id="chatlog">${hist.map((m, i) => msgHTML(X, m, i, i === hist.length - 1)).join('') || `<p class="muted" style="font-size:12.5px">示例：“我们愿意取消对你们的科技管制，换取你们在联合国对某议案投弃权票并允许我方舰艇停靠。”</p>`}${UI.chatBusy ? `<div class="msg them"><span class="who">${esc(NAME(X))}</span>正在斟酌答复…</div>` : ''}</div>
      <form class="chatbox" id="chatForm"><textarea id="chatText" placeholder="以特使身份发言…" ${UI.chatBusy ? 'disabled' : ''}></textarea><button class="btn-primary" ${UI.chatBusy ? 'disabled' : ''}>发送</button></form>`;
  }
  return s + '</div>';
}
function termText(t) { const base = W.DEAL_TYPES[t.type] || t.type; const extra = t.amount ? `（${W.fmtB(+t.amount)}美元）` : t.enemy ? `（${NAME(String(t.enemy).toUpperCase())}）` : t.with ? `（${NAME(String(t.with).toUpperCase())}）` : ''; return base + extra; }
function msgHTML(X, m, i, last) {
  if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
  let deal = '';
  if (m.deal && m.deal.status !== 'none' && m.deal.terms && m.deal.terms.length) {
    const lbl = { accept: '对方同意以下条款', counter: '对方提出以下条件', reject: '对方拒绝' }[m.deal.status] || '';
    const warn = m.deal.terms.map(t => W.dealCheck(S, X, t)).filter(Boolean);
    deal = `<div class="deal"><b>${lbl}</b>${m.deal.summary ? `<div class="muted" style="font-size:12px">${esc(m.deal.summary)}</div>` : ''}<ul>${m.deal.terms.map(t => `<li>${esc(termText(t))}</li>`).join('')}</ul>${warn.length ? `<div class="warn" style="font-size:12px">注意：${esc(warn.join('；'))}（该条款不会生效）</div>` : ''}${last && m.deal.status !== 'reject' && !m.signed ? `<div class="btns" style="display:flex;gap:6px"><button class="btn-primary" data-sign="${X}" data-i="${i}" ${W.apLeft(S) < 1 ? 'disabled' : ''}>签署协议（1行动点）</button></div>` : m.signed ? '<div class="good" style="font-size:12px">✓ 已签署</div>' : ''}</div>`;
  }
  return `<div class="msg them"><span class="who">${esc(DEF[X].voice)}</span>${esc(m.text)}</div>${deal}`;
}
function intelHTML() {
  let s = '';
  s += `<div class="sec"><h3>全球紧张度</h3><div class="bar"><div style="width:${S.tension}%;background:${S.tension > 70 ? 'var(--hostile)' : S.tension > 45 ? 'var(--warn)' : 'var(--neutral)'}"></div></div><div class="muted" style="font-size:12px;margin-top:3px">${Math.round(S.tension)}/100 · 进行中的战线 ${S.fronts.length} 条</div></div>`;
  const cols = [['gdp', 'GDP'], ['power', '军力'], ['nukes', '核'], ['stab', '稳定']];
  const rows = W.rankings(S).sort((a, b) => b[UI.rankSort] - a[UI.rankSort]).slice(0, 25);
  s += `<div class="sec"><h3>世界排名（点击表头排序）</h3><div style="overflow-x:auto"><table class="rank"><tr><th>国家/地区</th>${cols.map(([k, l]) => `<th data-sort="${k}">${l}${UI.rankSort === k ? ' ▾' : ''}</th>`).join('')}</tr>${rows.map(r => `<tr class="${r.id === S.player ? 'me' : ''}"><td data-sel="${r.id}">${esc(NAME(r.id))}</td><td>${W.fmtB(r.gdp)}</td><td>${W.fmtN(r.power)}</td><td>${r.nukes || '—'}</td><td>${Math.round(r.stab)}</td></tr>`).join('')}</table></div></div>`;
  const P = S.player; const filt = { all: () => true, me: e => (e.actors || []).includes(P), war: e => ['war', 'conquest', 'uprising', 'nuke', 'peace'].includes(e.type), dip: e => ['reaction', 'deal', 'offer', 'ai'].includes(e.type) };
  const logs = S.log.filter(filt[UI.feedFilter] || filt.all).slice(-80).reverse();
  s += `<div class="sec"><h3>情报与新闻</h3><div class="cats">${[['all', '全部'], ['me', '与我相关'], ['war', '战争'], ['dip', '外交']].map(([k, l]) => `<button data-feed="${k}" class="${UI.feedFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="feed">${logs.map(e => `<div class="f ${e.tone || ''}"><small>${W.dateStr(S, e.turn)}</small>${esc(e.text)}</div>`).join('') || '<p class="muted">暂无记录。</p>'}</div></div>`;
  return s;
}

/* ---------- 队列与指令台 ---------- */
function renderQueue() {
  const q = $('#queue');
  q.innerHTML = `<span class="ql">本回合行动</span>` + (S.queue.length ? S.queue.map((it, i) => `<span class="qchip"><span class="t" title="${esc(it.label)}">${esc(it.label)}</span><small>${it.ap}点${it.cost > 0 ? ' · $' + W.fmtB(it.cost) : ''}</small>${it.type === 'done' ? '' : `<button data-unq="${i}" aria-label="移除">×</button>`}</span>`).join('') : '<span class="muted" style="font-size:12.5px">尚未安排行动——在右侧面板选择行动，或在右侧输入自由指令。</span>');
}
function renderAll() { renderTop(); renderMap(); renderSide(); renderQueue(); renderTicker(); }
function renderTicker() {
  const R = S.report; const heads = (R && R.headlines && R.headlines.length) ? R.headlines : S.log.slice(-4).map(e => e.text).reverse();
  let i = 0; const el = $('#ticker');
  el.innerHTML = `<span class="tag">快讯</span><span class="txt" id="tickTxt">${esc(heads[0] || '')}</span>`;
  clearInterval(UI.tickT); if (heads.length > 1) UI.tickT = setInterval(() => { i = (i + 1) % heads.length; const t = $('#tickTxt'); if (t) t.textContent = heads[i]; }, 6000);
}
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(UI.toastT); UI.toastT = setTimeout(() => t.hidden = true, ms); }

/* ---------- 事件委托 ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, a, [data-toggle], [data-sel], th[data-sort], td[data-sel]');
  if (!t || !S) return;
  const d = t.dataset;
  if (t.tagName === 'A') e.preventDefault();
  if (d.tab) { UI.tab = d.tab; renderSide(); return; }
  if (d.toggle) { UI.open[d.toggle] = !UI.open[d.toggle]; renderSide(); return; }
  if (d.cat) { UI.cat = d.cat; renderSide(); return; }
  if (d.queue) {
    const a = W.ACT[d.queue]; const p = paramsFor(a);
    if (a.danger) { confirmNuke(d.queue, d.t, p); return; }
    const r = W.queueAction(S, d.queue, d.t, { ...p }); if (!r.ok) toast(r.reason); else { toast(`已加入：${a.name}${a.self ? '' : ' → ' + NAME(d.t)}`); UI.open[d.queue] = false; }
    renderTop(); renderSide(); renderQueue(); return;
  }
  if (d.unq !== undefined) { S.queue.splice(+d.unq, 1); renderTop(); renderSide(); renderQueue(); return; }
  if (d.sel) { select(d.sel); zoomTo(d.sel); return; }
  if (d.v) { UI.view = d.v; renderMap(); return; }
  if (d.go === 'home') { UI.tab = 'home'; renderSide(); return; }
  if (d.go === 'chat') { UI.tab = 'diplo'; renderSide(); return; }
  if (d.go === 'settings') { openSettings(); return; }
  if (d.offer) { const msg = W.answerOffer(S, d.offer, d.ok === '1'); toast(msg || '已处理'); renderAll(); autosave(); return; }
  if (d.halt) { S.fronts = S.fronts.filter(f => f.id !== d.halt); toast('已停止该方向的攻势（仍处于战争状态）'); renderAll(); return; }
  if (d.peace) { UI.sel = d.peace; UI.tab = 'target'; UI.cat = 'dip'; UI.open = { peace: true }; renderMap(); renderSide(); return; }
  if (d.sign) { signDeal(d.sign, +d.i); return; }
  if (d.feed) { UI.feedFilter = d.feed; renderSide(); return; }
  if (d.sort) { UI.rankSort = d.sort; renderSide(); return; }
});
document.addEventListener('change', e => {
  const t = e.target; if (!S) return;
  if (t.dataset.act) { UI.params[t.dataset.act][t.dataset.key] = isNaN(+t.value) || t.value === '' ? t.value : +t.value; renderSide(); return; }
  if (t.dataset.commit) { const f = S.fronts.find(x => x.id === t.dataset.commit); if (f) { f.commit = +t.value; toast(`投入兵力调整为${Math.round(f.commit * 100)}%`); } return; }
  if (t.id === 'mixSel') { const x = S.actors[S.player]; const base = DEF[S.player].mix; const m = { bal: base, land: [0.6, 0.15, 0.25], navy: [0.25, 0.5, 0.25], air: [0.25, 0.2, 0.55] }[t.value]; x.mix = m.slice(); x.mixMode = t.value; renderSide(); return; }
});
document.addEventListener('input', e => {
  const t = e.target; if (!S) return;
  if (t.id === 'milPct') { const x = S.actors[S.player]; x.milPct = +t.value; $('#milPctV').textContent = x.milPct.toFixed(1) + '%'; $('#milPctN').textContent = `年度军费约 $${W.fmtB(x.gdp * x.milPct / 100)}；超过3%会拖累经济增长${x.milPct > 3 ? `（当前约 -${((x.milPct - 3) * 0.24).toFixed(1)}%/年）` : ''}`; }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'chatForm') sendChat();
  if (e.target.id === 'cmdForm') adjudicate();
});
$('#search').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const q = e.target.value.trim(); if (!q) return; const id = IDS.find(i => NAME(i).includes(q) || i === q.toUpperCase() || (DEF[i].voice || '').includes(q)); if (id) { select(id); zoomTo(id); e.target.blur(); } else toast('没有找到：' + q); });
$('#cmdText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); adjudicate(); } });
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'chatText' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });
$('#btnEnd').onclick = () => endTurn();
$('#btnMenu').onclick = () => openSettings();
$('#engineBadge').onclick = () => openSettings();
$('#meChip').onclick = () => { if (!S) return; select(S.player); zoomTo(S.player); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden && UI.modalClosable) closeModal(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S) renderAll(); });

/* ---------- 自由指令 ---------- */
const EFF_NAMES = { rel: '关系', infl: '影响力', stab: '稳定', gdp: 'GDP冲击', growth: '增长', mil: '军力', tech: '科技', treasury: '国库', sanction: '制裁', treaty: '条约', war: '开战', vassal: '附庸', event: '事件' };
function effText(e) {
  const n = id => id && S.actors[id] ? NAME(id) : '?';
  switch (e.type) {
    case 'rel': return `${n(e.a || S.player)}—${n(e.b || e.target)}关系 ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'infl': return `在${n(e.target)}的影响力 ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'stab': return `${n(e.target)}稳定 ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'gdp': return `${n(e.target)} GDP ${e.pct > 0 ? '+' : ''}${e.pct}%`;
    case 'growth': return `${n(e.target)}年增长 ${e.pct > 0 ? '+' : ''}${e.pct}%（${e.turns || 4}季）`;
    case 'mil': return `${n(e.target)}${{ land: '陆军', navy: '海军', air: '空天' }[e.branch] || '军力'} ${e.pct > 0 ? '+' : ''}${e.pct}%`;
    case 'tech': return `${n(e.target)}科技 ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'treasury': return `国库 ${e.delta > 0 ? '+' : ''}$${W.fmtB(+e.delta || 0)}`;
    case 'sanction': return `对${n(e.target)}制裁（${e.level || 1}级）`;
    case 'treaty': return `与${n(e.target)}建立${W.TREATY_NAME[e.treaty] || e.treaty}（需对方同意）`;
    case 'war': return `对${n(e.target)}开辟战线（投入${Math.round((e.commit || 0.5) * 100)}%）`;
    case 'vassal': return `要求${n(e.target)}臣服（需对方同意）`;
    case 'event': return String(e.text || '').slice(0, 60);
  }
  return e.type;
}
async function adjudicate() {
  const text = $('#cmdText').value.trim(); if (!text || !S) return;
  if (!useLLM()) { showModal(`<h2>自由指令需要 Claude 推演引擎</h2><p class="sub">当前为规则 AI 模式。开启 Claude 推演后，你可以用自然语言下达任意指令，由 Claude 评估可行性、成本和成功率，再转化为游戏效果。</p><div class="foot"><button data-close="1">知道了</button><button class="btn-primary" id="goSet">打开设置</button></div>`, 'narrow', true); $('#goSet').onclick = openSettings; return; }
  const ctl = new AbortController(); UI.abort = ctl;
  showModal(`<h2>裁定中……</h2><p class="sub">Claude 正在评估这条指令的可行性、代价与后果。</p><div class="preview"><div>“${esc(text)}”</div></div><div class="foot"><div class="spinner"></div><button id="adjStop">取消</button></div>`, 'narrow', false);
  $('#adjStop').onclick = () => ctl.abort();
  try {
    const o = await LLM.adjudicate(S, text, { tier: UI.tier, signal: ctl.signal });
    UI.adj = o;
    const apOk = (o.ap || 1) <= W.apLeft(S);
    const cost = clamp(+o.cost || 0, 0, S.actors[S.player].gdp * 0.03);
    showModal(`<h2>${o.feasible === false ? '指令无法执行' : '裁定结果'}</h2>
      <div class="preview"><div class="muted">原指令</div><div>“${esc(text)}”</div></div>
      ${o.feasible === false ? `<div class="adj"><b class="bad">不可行：</b>${esc(o.reason || '')}${o.alternative ? `<div><b>建议替代：</b>${esc(o.alternative)}</div>` : ''}</div>` : `
      <div class="adj"><div><b>${esc(o.summary || '特别行动')}</b></div>
        <div class="grid2"><div class="stat"><span>行动点</span><b>${o.ap || 1}</b></div><div class="stat"><span>成本</span><b>$${W.fmtB(cost)}</b></div><div class="stat"><span>成功率</span><b>${Math.round(clamp(+o.successChance || 0.6, 0.05, 0.95) * 100)}%</b></div><div class="stat"><span>暴露风险</span><b>${Math.round((+o.detectionRisk || 0) * 100)}%</b></div></div>
        <div><span class="muted">成功时：</span><ul>${o.effects.map(e => `<li>${esc(effText(e))}</li>`).join('') || '<li>无直接数值效果</li>'}</ul></div>
        ${o.onFailure.length ? `<div><span class="muted">失败时：</span><ul>${o.onFailure.map(e => `<li>${esc(effText(e))}</li>`).join('')}</ul></div>` : ''}
        ${o.narrative ? `<div class="muted" style="font-size:12.5px">预期：${esc(o.narrative)}</div>` : ''}
      </div>`}
      <div class="foot"><button data-close="1">${o.feasible === false ? '返回修改' : '放弃'}</button>${o.feasible === false ? '' : `<button class="btn-primary" id="adjOk" ${apOk ? '' : 'disabled'}>${apOk ? '加入本回合行动' : '行动点不足'}</button>`}</div>`, 'narrow', true);
    const ok = $('#adjOk'); if (ok) ok.onclick = () => { W.queueCustom(S, { ...o, cost }); $('#cmdText').value = ''; closeModal(); renderTop(); renderQueue(); toast('自由指令已加入本回合行动'); };
  } catch (e) {
    if (e && e.code === 'cancelled') { closeModal(); return; }
    showModal(`<h2>裁定失败</h2><p class="sub">${esc(LLM.errText(e))}</p><div class="foot"><button data-close="1">关闭</button></div>`, 'narrow', true); renderTop();
  }
}

/* ---------- 外交谈判 ---------- */
async function sendChat() {
  const X = UI.sel; const ta = $('#chatText'); if (!ta) return; const msg = ta.value.trim(); if (!msg || UI.chatBusy) return;
  const hist = S.chat[X] || (S.chat[X] = []);
  hist.push({ role: 'me', text: msg }); UI.chatBusy = true; renderSide();
  try {
    const r = await LLM.diplomacy(S, X, hist.slice(0, -1), msg, { tier: UI.tier });
    hist.push({ role: 'them', text: r.reply, deal: r.deal });
  } catch (e) { hist.push({ role: 'them', text: `（通讯中断：${LLM.errText(e)}）` }); }
  UI.chatBusy = false; renderSide(); renderTop(); autosave();
}
function signDeal(X, i) {
  const m = (S.chat[X] || [])[i]; if (!m || !m.deal || m.signed) return;
  if (W.apLeft(S) < 1) { toast('行动点不足'); return; }
  const done = W.applyDeal(S, X, m.deal.terms); m.signed = true;
  S.queue.push({ type: 'done', ap: 1, cost: 0, label: `签署：与${NAME(X)}的协议` });
  toast('协议已生效：' + done.join('；'), 5000); renderAll(); autosave();
}

/* ---------- 核打击确认 ---------- */
function confirmNuke(id, t, p) {
  const st = W.actionStatus(S, id, t, p); if (!st.ok) { toast(st.reason); return; }
  showModal(`<h2 class="bad">确认使用核武器？</h2><p class="sub">目标：${esc(NAME(t))}（${p.scope === 'strategic' ? '战略核打击' : '战术核打击'}）。${esc(st.preview || '')}</p><div class="preview"><div>后果：全球几乎所有国家将与你为敌并实施禁运；国内稳定大幅下降；若对方或其盟友拥有核武器，极可能遭到核报复，甚至失控为全面核战争——那将是所有人的失败。</div></div><div class="foot"><button class="btn-primary" data-close="1">取消</button><button id="nukeOk" style="border-color:var(--bad);color:var(--bad)">确认下达命令</button></div>`, 'narrow', true);
  $('#nukeOk').onclick = () => { const r = W.queueAction(S, id, t, { ...p }); closeModal(); if (!r.ok) toast(r.reason); renderAll(); };
}

/* ---------- 回合结算 ---------- */
function busy(stepIdx, extra, stopFn) {
  const steps = ['执行本回合行动', useLLM() ? '各国研判局势（Claude 推演）' : '各国研判局势（规则 AI）', '战场与经济结算', '生成情报简报'];
  const b = $('#busy'); b.hidden = false;
  b.innerHTML = `<div class="card"><div style="display:flex;gap:10px;align-items:center"><div class="spinner"></div><b>${W.dateStr(S)} 回合结算中</b></div><div class="steps">${steps.map((s, i) => `<div class="${i < stepIdx ? 'done' : i === stepIdx ? 'on' : ''}">${i < stepIdx ? '✓' : i === stepIdx ? '›' : '·'} ${s}</div>`).join('')}</div>${extra ? `<div class="muted" style="font-size:12.5px" id="busyExtra">${extra}</div>` : ''}${stopFn ? '<div><button id="busyStop">不等了，改用规则 AI</button></div>' : ''}</div>`;
  if (stopFn) $('#busyStop').onclick = stopFn;
}
async function endTurn() {
  if (!S || UI.demo) { showStart(); return; }
  if (UI.busy || S.over) { if (S.over) showGameOver(); return; }
  UI.busy = true; $('#btnEnd').disabled = true;
  try {
    busy(0); await new Promise(r => setTimeout(r, 30));
    const R = W.prepareTurn(S);
    let handled = new Set();
    const cands = W.reactionCandidates(S, 10);
    if (useLLM() && cands.length) {
      const ctl = new AbortController(); UI.abort = ctl; let chars = 0;
      busy(1, `正在推演 ${cands.map(c => NAME(c.id)).join('、')} 的反应……（通常需要 20–90 秒）`, () => ctl.abort());
      try {
        const data = await LLM.reactions(S, cands, { tier: UI.tier, signal: ctl.signal, onText: ({ text }) => { chars = text.length; const el = $('#busyExtra'); if (el) el.textContent = `Claude 正在撰写各国反应……已生成 ${chars} 字`; } });
        handled = W.applyLLMReactions(S, R, data); R.llmNote = 'Claude 推演';
      } catch (e) { R.llmNote = e && e.code === 'cancelled' ? '规则 AI（已跳过 Claude 推演）' : `规则 AI（${LLM.errText(e)}）`; }
    } else { busy(1); R.llmNote = useLLM() ? '本回合无需推演' : '规则 AI'; await new Promise(r => setTimeout(r, 120)); }
    W.ruleReactions(S, R, handled);
    busy(2); await new Promise(r => setTimeout(r, 60));
    const rep = W.finishTurn(S);
    busy(3);
    autosave();
    $('#busy').hidden = true;
    renderAll();
    showReport(rep);
  } catch (err) {
    console.error(err); $('#busy').hidden = true; toast('结算出错：' + (err && err.message || err), 6000);
  } finally { UI.busy = false; $('#btnEnd').disabled = false; }
}
const STANCE_CLS = { '强烈反对': 'hostile', '反对': 'hostile', '关切': 'unknown', '中立': 'neutral', '支持': 'friend', '欢迎': 'friend' };
function showReport(R) {
  const P = S.player; const e = R.econ;
  const lines = arr => `<div class="lines">${arr.map(a => `<div class="${a.tone || 'info'}">${esc(a.text)}</div>`).join('')}</div>`;
  let h = `<h1>${R.date} 战略简报</h1><p class="sub">推演引擎：${esc(R.llmNote || '规则 AI')}</p>`;
  if (e) h += `<div class="rep-kpis">
    <div><span>GDP</span><b>${W.fmtB(e.gdp[1])}</b> ${delta(e.gdp[0], e.gdp[1], v => W.fmtB(v))}</div>
    <div><span>年化增长</span><b>${(e.growth * 4).toFixed(1)}%</b></div>
    <div><span>军力指数</span><b>${W.fmtN(e.mil[1])}</b> ${delta(e.mil[0], e.mil[1], v => W.fmtN(v))}</div>
    <div><span>稳定</span><b>${Math.round(e.stab[1])}</b> ${delta(e.stab[0], e.stab[1], v => v.toFixed(0))}</div>
    <div><span>国库</span><b>${W.fmtB(e.treasury[1])}</b></div></div>`;
  if (R.actions.length) h += `<div class="rep-sec"><h3>本回合行动</h3>${lines(R.actions)}</div>`;
  if (R.custom.length) h += `<div class="rep-sec"><h3>自由指令</h3><div class="list">${R.custom.map(c => `<div class="item"><div class="row"><b>${esc(c.text)}</b><span class="tag ${c.success ? 'blue' : 'red'}">${c.success ? '成功' : '失败'}${c.detected === true ? ' · 已曝光' : c.detected === false ? ' · 未暴露' : ''}</span></div><div style="font-size:13px;margin-top:4px">${esc(c.narrative || '')}</div>${c.effects.length ? `<div class="muted" style="font-size:12px;margin-top:3px">${esc(c.effects.join('；'))}</div>` : ''}</div>`).join('')}</div></div>`;
  if (R.reactions.length) h += `<div class="rep-sec"><h3>各国反应</h3><div class="rx">${R.reactions.map(r => { const c = STANCE_CLS[r.stance] || 'unknown'; return `<div class="rcard s-${c}"><div class="hd"><i style="width:10px;height:10px;border-radius:2px;background:${polColor(r.actor)};display:inline-block"></i><b>${esc(NAME(r.actor))}</b><span class="stance s-${c}">${esc(r.stance)}</span></div><q>${esc(r.statement)}</q>${r.actions.length ? `<div class="ra">${r.actions.map(a => `<span>${esc(a)}</span>`).join('')}</div>` : ''}${r.reason ? `<div class="why">研判：${esc(r.reason)}</div>` : ''}<div class="src">${r.src === 'llm' ? 'CLAUDE' : 'RULE-AI'}</div></div>`; }).join('')}</div></div>`;
  const fr = (R.fronts || []);
  if (fr.length || R.war.length) h += `<div class="rep-sec"><h3>战况</h3>${R.war.length ? lines(R.war) : ''}<div class="list" style="margin-top:8px">${fr.map(f => frontHTML(f, false)).join('')}</div></div>`;
  const world = [...R.ai.map(a => ({ text: a.text, tone: a.tone || 'info' })), ...R.events];
  if (world.length || (R.headlines || []).length) h += `<div class="rep-sec"><h3>世界动态</h3>${lines(world)}${(R.headlines || []).length ? `<div class="list" style="margin-top:8px">${R.headlines.map(x => `<div class="item" style="font-family:var(--f-display);font-weight:600">${esc(x)}</div>`).join('')}</div>` : ''}</div>`;
  if (S.inbox.length) h += `<div class="rep-sec"><h3>来函</h3><p>你有 ${S.inbox.length} 封待处理的外交来函。<button id="toInbox">前往外交面板</button></p></div>`;
  if (S.over) h += `<div class="rep-sec"><h3>${S.over.result === 'win' ? '胜利' : '终局'}</h3><p><b>${esc(S.over.reason)}</b></p></div>`;
  h += `<div class="foot"><button class="btn-primary" data-close="1">${S.over ? '查看结局' : '继续'}</button></div>`;
  showModal(h, '', true);
  const ib = $('#toInbox'); if (ib) ib.onclick = () => { closeModal(); UI.tab = 'diplo'; renderSide(); };
  UI.afterClose = () => { if (S.over) showGameOver(); };
}
function showGameOver() {
  const o = S.over; if (!o) return; const h = W.hegemony(S);
  const title = o.result === 'win' ? '胜利' : o.result === 'apocalypse' ? '全面核战争' : '失败';
  showModal(`<h1 class="${o.result === 'win' ? 'good' : 'bad'}">${title}</h1><p class="sub">${esc(o.reason)}</p><div class="rep-kpis"><div><span>历时</span><b>${S.turn}回合</b></div><div><span>势力GDP占比</span><b>${(h.gdpShare * 100).toFixed(1)}%</b></div><div><span>军力占比</span><b>${(h.milShare * 100).toFixed(1)}%</b></div><div><span>统治地区</span><b>${h.units}</b></div></div><div class="foot"><button data-close="1">继续观察地图</button><button class="btn-primary" id="goNew">开始新的推演</button></div>`, 'narrow', true);
  $('#goNew').onclick = () => showStart();
}

/* ---------- 弹窗 ---------- */
function showModal(html, cls = '', closable = true) { const m = $('#modal'); $('#sheet').className = 'sheet ' + cls; $('#sheet').innerHTML = html; m.hidden = false; UI.modalClosable = closable; }
function closeModal() { $('#modal').hidden = true; const f = UI.afterClose; UI.afterClose = null; if (f) f(); }
$('#modal').addEventListener('click', e => { if (e.target.dataset.close) closeModal(); else if (e.target.id === 'modal' && UI.modalClosable) closeModal(); });

/* ---------- 开局 ---------- */
function startHTML(sel) {
  const tmp = W.newGame({ player: sel || 'CHN', seed: 1 });
  const list = IDS.map(id => ({ id, p: W.power(tmp, id), g: tmp.actors[id].gdp, n: tmp.actors[id].nukes })).sort((a, b) => b.p - a.p);
  const diffOf = id => { tmp.player = id; const h = W.hegemony(tmp); return h.prog > 0.4 ? ['较易', 'good'] : h.prog > 0.22 ? ['中等', 'warn'] : h.prog > 0.06 ? ['困难', 'bad'] : ['极难', 'bad']; };
  const cur = sel || UI.pick || 'CHN'; const d = DEF[cur]; const [dl, dc] = diffOf(cur);
  return `<h1>天下棋局</h1><p class="sub">以 ${new Date().getFullYear()} 年公开的军力与经济数据为起点的全球战略推演。选择一个国家，以外交、经济、军事与隐蔽手段角逐霸权——各国会依据自身利益作出不可预测的反应。</p>
  <div class="opts" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
    <div class="opt"><h4>选择你的国家（按军力排序）</h4><div class="picker">${list.map(r => `<button class="pc ${r.id === cur ? 'on' : ''}" data-pick="${r.id}"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}</span><small>GDP ${W.fmtB(r.g)} · 军力 ${W.fmtN(r.p)}${r.n ? ' · 核' + W.fmtN(r.n) : ''}</small></button>`).join('')}</div></div>
    <div class="opt"><h4>${esc(d.name)}</h4><div class="doctrine">${esc(d.doctrine)}</div>
      <div class="preview"><div class="stat"><span>GDP</span><b>${W.fmtB(d.gdp)}</b></div><div class="stat"><span>军费（2025）</span><b>$${W.fmtB(d.milex)}</b></div><div class="stat"><span>现役兵力</span><b>${W.fmtN(d.pers)}千人</b></div><div class="stat"><span>核弹头</span><b>${W.fmtN(d.nukes)}</b></div><div class="stat"><span>争霸难度</span><b class="${dc}">${dl}</b></div></div>
    </div>
  </div>
  <div class="opts">
    <div class="opt"><h4>胜利目标</h4><div class="radio"><label><input type="radio" name="goal" value="hegemony" checked><span>全球霸权<small>势力范围占世界GDP 50%、军力 45%，并维持一年</small></span></label><label><input type="radio" name="goal" value="unify"><span>统一世界<small>让全部46个国家/大区成为你的领土或附庸</small></span></label></div></div>
    <div class="opt"><h4>各国反应强度</h4><div class="radio"><label><input type="radio" name="diff" value="easy"><span>温和<small>AI 决策更随机、较少联合制衡</small></span></label><label><input type="radio" name="diff" value="normal" checked><span>标准</span></label><label><input type="radio" name="diff" value="hard"><span>强硬<small>AI 更理性，更积极地抱团对抗你</small></span></label></div></div>
    <div class="opt"><h4>推演引擎</h4><div class="radio"><label><input type="radio" name="eng" value="auto" ${UI.engine !== 'rules' ? 'checked' : ''}><span>Claude 实时推演<small><b id="engStat">${engStat()}</b>各国反应、自由指令、外交谈判由 Claude 生成，每次都不一样；每回合约需 20–90 秒，并消耗你的 Claude 用量</small></span></label><label><input type="radio" name="eng" value="rules" ${UI.engine === 'rules' ? 'checked' : ''}><span>规则 AI<small>离线、秒级结算；带随机性，但无法使用自由指令与自由谈判</small></span></label></div></div>
  </div>
  <div class="foot">${hasSave() ? '<button id="loadSave">继续上次的推演</button>' : ''}<button id="importSave">导入存档</button><button class="btn-primary" id="startGo">开始推演 ▸</button></div>`;
}
function engStat() { return LLM.available() ? '已就绪。' : LLM.state === 'pending' ? '正在连接…' : '当前不可用，将自动使用规则 AI。'; }
function showStart(sel) {
  showModal(startHTML(sel), '', !!S && !UI.demo);
  UI.afterClose = null;
  $('#sheet').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { UI.pick = b.dataset.pick; const st = $('#sheet').scrollTop; const goal = ($('#sheet').querySelector('input[name=goal]:checked') || {}).value; const diff = ($('#sheet').querySelector('input[name=diff]:checked') || {}).value; const eng = ($('#sheet').querySelector('input[name=eng]:checked') || {}).value; const pk = $('#sheet').querySelector('.picker').scrollTop; showStart(UI.pick); $('#sheet').scrollTop = st; $('#sheet').querySelector('.picker').scrollTop = pk; if (goal) $(`input[name=goal][value=${goal}]`).checked = true; if (diff) $(`input[name=diff][value=${diff}]`).checked = true; if (eng) $(`input[name=eng][value=${eng}]`).checked = true; });
  $('#startGo').onclick = () => {
    const goal = $('#sheet').querySelector('input[name=goal]:checked').value, diff = $('#sheet').querySelector('input[name=diff]:checked').value, eng = $('#sheet').querySelector('input[name=eng]:checked').value;
    UI.engine = eng; savePrefs();
    S = W.newGame({ player: UI.pick || sel || 'CHN', goal, diff, llm: eng !== 'rules' }); UI.demo = false;
    UI.sel = null; UI.tab = 'home'; UI.params = {}; UI.open = {}; closeModal(); renderAll(); zoomTo(S.player); autosave();
    toast(`${W.dateStr(S)}：你已接掌${NAME(S.player)}。点击地图选择目标，或在底部下达自由指令。`, 5500);
  };
  const ls = $('#loadSave'); if (ls) ls.onclick = () => { const s = loadLocal(); if (s) { S = s; UI.demo = false; closeModal(); renderAll(); zoomTo(S.player); } };
  $('#importSave').onclick = importSave;
}

/* ---------- 设置与存档 ---------- */
function serialize(s) { const c = { ...s }; delete c._exp; delete c._R; return JSON.stringify(c); }
function deserialize(txt) { const o = typeof txt === 'string' ? JSON.parse(txt) : txt; if (!o || !o.actors || !o.player || !o.actors[o.player]) throw new Error('存档格式不正确'); o.queue = o.queue || []; o.inbox = o.inbox || []; o.chat = o.chat || {}; return o; }
function autosave() { if (!S || UI.demo) return; try { localStorage.setItem(SAVE_KEY, serialize(S)); } catch (e) { } }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadLocal() { try { return deserialize(localStorage.getItem(SAVE_KEY)); } catch (e) { toast('读取存档失败'); return null; } }
async function exportSave() {
  const data = serialize(S); const name = `天下棋局-${NAME(S.player)}-${W.dateStr(S)}.json`;
  try { const dl = await window.claude?.use?.('downloads'); if (dl) { await dl.save({ filename: name, data }); toast('存档已导出'); return; } } catch (e) { if (e && e.code === 'declined') return; }
  showModal(`<h2>导出存档</h2><p class="sub">当前环境无法直接下载文件。请复制下面的全部内容，保存为 .json 文件；以后可用“导入存档”恢复。</p><textarea readonly style="width:100%;height:220px;font-family:var(--f-mono);font-size:11px" id="saveTxt">${esc(data)}</textarea><div class="foot"><button id="copySave">复制</button><button class="btn-primary" data-close="1">完成</button></div>`, 'narrow', true);
  $('#copySave').onclick = async () => { const ta = $('#saveTxt'); try { await navigator.clipboard.writeText(ta.value); toast('已复制'); } catch (e) { ta.select(); toast('请按 Ctrl/Cmd+C 复制'); } };
}
function importSave() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { S = deserialize(r.result); UI.demo = false; closeModal(); renderAll(); zoomTo(S.player); autosave(); toast('存档已导入'); } catch (e) { toast('导入失败：' + e.message); } }; r.readAsText(f); };
  inp.click();
}
function openSettings() {
  const theme = document.documentElement.getAttribute('data-theme') || '';
  showModal(`<h2>设置</h2>
  <div class="opts">
    <div class="opt"><h4>推演引擎</h4><div class="radio"><label><input type="radio" name="se" value="auto" ${UI.engine !== 'rules' ? 'checked' : ''}><span>Claude 实时推演<small>状态：${LLM.available() ? '已就绪' : LLM.state === 'pending' ? '连接中' : '不可用'}</small></span></label><label><input type="radio" name="se" value="rules" ${UI.engine === 'rules' ? 'checked' : ''}><span>规则 AI</span></label></div></div>
    <div class="opt"><h4>推演深度</h4><div class="radio"><label><input type="radio" name="st" value="quick" ${UI.tier === 'quick' ? 'checked' : ''}><span>快速<small>数秒出结果，反应较简单</small></span></label><label><input type="radio" name="st" value="default" ${UI.tier === 'default' ? 'checked' : ''}><span>标准（推荐）</span></label><label><input type="radio" name="st" value="complex" ${UI.tier === 'complex' ? 'checked' : ''}><span>深度<small>更缜密，每回合可能需要1–2分钟</small></span></label></div></div>
    <div class="opt"><h4>显示</h4><div class="radio"><label><input type="radio" name="th" value="" ${!theme ? 'checked' : ''}><span>跟随系统</span></label><label><input type="radio" name="th" value="light" ${theme === 'light' ? 'checked' : ''}><span>参谋图（浅色）</span></label><label><input type="radio" name="th" value="dark" ${theme === 'dark' ? 'checked' : ''}><span>作战室（深色）</span></label></div><label style="display:flex;gap:8px;margin-top:8px;font-size:13px"><input type="checkbox" id="lblChk" ${UI.labels ? 'checked' : ''}>显示地图标签</label></div>
  </div>
  <div class="opts"><div class="opt"><h4>存档</h4><div style="display:flex;gap:6px;flex-wrap:wrap"><button id="sExport" ${S ? '' : 'disabled'}>导出存档</button><button id="sImport">导入存档</button><button id="sNew">新的推演</button><button id="sHelp">玩法说明</button></div><p class="muted" style="font-size:12px">每回合结束时会自动保存在本浏览器中。</p></div></div>
  <div class="foot"><button class="btn-primary" data-close="1">完成</button></div>`, 'narrow', true);
  const sh = $('#sheet');
  sh.querySelectorAll('input[name=se]').forEach(r => r.onchange = () => { UI.engine = r.value; if (r.value === 'auto' && LLM.state === 'off') LLM.init().then(() => renderTop()); savePrefs(); renderTop(); });
  sh.querySelectorAll('input[name=st]').forEach(r => r.onchange = () => { UI.tier = r.value; savePrefs(); });
  sh.querySelectorAll('input[name=th]').forEach(r => r.onchange = () => { if (r.value) document.documentElement.setAttribute('data-theme', r.value); else document.documentElement.removeAttribute('data-theme'); savePrefs(); if (S) renderAll(); });
  $('#lblChk').onchange = e => { UI.labels = e.target.checked; savePrefs(); placeLabels(); };
  $('#sExport').onclick = exportSave; $('#sImport').onclick = importSave; $('#sNew').onclick = () => showStart(S && S.player); $('#sHelp').onclick = showHelp;
}
function showHelp() {
  showModal(`<h2>玩法说明</h2><div style="font-size:13.5px;display:grid;gap:8px;margin-top:10px">
  <p><b>回合</b>：每回合代表一个季度。你有有限的行动点（随经济规模与稳定度变化），在右侧面板安排外交、经济、军事、隐蔽与内政行动，或用底部“自由指令”下达任何自然语言命令，然后点击“结束回合”。</p>
  <p><b>各国反应</b>：受你行动影响的国家会根据自身利益、实力对比、同盟义务、经济依赖和本局随机性格作出反应。开启 Claude 推演时，最相关的约10个国家由 Claude 实时推演，其余由规则 AI 处理——同样的行动在不同局面、不同游戏中会得到不同回应。</p>
  <p><b>战争</b>：入侵需要进攻路线——陆地接壤、邻近海域或投送范围内的基地（盟友驻军权可以延伸路线）。跨海登陆受海军运力与制海权限制。每回合根据双方投入兵力、科技、稳定、地形和盟友援助计算推进；推进到100%即占领全境。占领区会产生抵抗，可治理、正式吞并或扶植傀儡政府。</p>
  <p><b>经济</b>：制裁、关税、科技管制、金融制裁、能源禁运都会同时伤害双方，伤害大小取决于双方贸易依赖。援助、贷款和自贸协定能提升影响力与好感。军费超过GDP的3%会拖累增长。</p>
  <p><b>政治</b>：影响力高、对方不稳定时，可以策动政变扶植附庸；实力悬殊时可胁迫对方接受附庸地位；长期附庸可和平并入。遭受全球孤立、战争疲劳或占领区抵抗会降低稳定度——稳定度长期过低会导致政权崩溃。</p>
  <p><b>核武器</b>：核威慑可以吓退弱国；核打击会让你陷入全球孤立，并可能招致核报复，甚至导致全面核战争（所有人失败）。有核国家本土濒临沦陷时也可能动用核武。</p>
  <p><b>数据</b>：GDP 为 IMF 2026 年估算；军费为 SIPRI 2025 年数据；核弹头为 SIPRI 2026 年鉴；兵力参考 IISS。部分地区打包为一个行为体（如东盟、北欧、西非），数值为成员合计或估算。</p></div>
  <div class="foot"><button class="btn-primary" data-close="1">明白了</button></div>`, 'narrow', true);
}

/* ---------- 启动 ---------- */
function boot(data) {
  buildMap(); applyView();
  // 未开局时也渲染一个示意世界
  S = null;
  let restored = null;
  try { if (data && data.save) restored = deserialize(data.save); } catch (e) { }
  if (restored) { S = restored; renderAll(); }
  else { S = W.newGame({ player: 'CHN', seed: 7 }); UI.demo = true; renderMap(); renderTop(); renderQueue(); showStart(); }
  LLM.onState(() => { if (S) renderTop(); const es = $('#engStat'); if (es) es.textContent = engStat(); });
  LLM.init();
  try { window.claude?.hot?.snapshot?.(() => ({ save: S ? serialize(S) : null })); } catch (e) { }
}
try { if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot(window.claude?.hot?.data ?? {}); } catch (e) { boot({}); }
})();
