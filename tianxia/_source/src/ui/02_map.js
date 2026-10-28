// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 v2 · 地图 ===================== */
const svg = $('#map'), gWorld = $('#world'), gLand = $('#gLand'), gHatch = $('#gHatch'), gOver = $('#gOver'), labelsEl = $('#labels');
const view = { k: 1, x: 0, y: 0 };
const paths = {};
function buildMap() {
  svg.setAttribute('viewBox', `0 0 ${GEO.w} ${GEO.h}`);
  $('#sphere').setAttribute('d', GEO.sphere); $('#grat').setAttribute('d', GEO.grat);
  $('#internal').setAttribute('d', GEO.internal); $('#borders').setAttribute('d', GEO.borders); $('#coast').setAttribute('d', GEO.coast);
  const ns = 'http://www.w3.org/2000/svg';
  for (const id of IDS) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', GEO.paths[id]); p.setAttribute('class', 'land'); p.dataset.id = id; gLand.appendChild(p); paths[id] = p; }
  if (GEO.dash && !$('#cnDash')) { const d = document.createElementNS(ns, 'path'); d.id = 'cnDash'; d.setAttribute('class', 'cndash'); d.setAttribute('d', GEO.dash); $('#borders').after(d); } // 中国标准地图：南海断续线
  labelsEl.innerHTML = IDS.map(id => `<div class="lbl" data-id="${id}"></div>`).join('');
}
function svgPt(cx, cy) { return new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse()); }
function applyView() {
  const k = view.k; const minX = GEO.w - GEO.w * k, minY = GEO.h - GEO.h * k;
  view.x = clamp(view.x, minX - 200, 200); view.y = clamp(view.y, minY - 120, 120);
  gWorld.setAttribute('transform', `translate(${view.x.toFixed(2)},${view.y.toFixed(2)}) scale(${k.toFixed(4)})`);
  const inv = (1 / Math.sqrt(k)).toFixed(3), pu = typeof pxU === 'function' ? pxU().toFixed(4) : inv; for (const g of gWorld.querySelectorAll('[data-x]')) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) scale(${g.dataset.px ? pu : inv})`); // data-px：按屏幕像素定大小的标记（图层图标、开战标签）
  if (typeof lyrZoomSoon === 'function') lyrZoomSoon(); // 粗箭头按屏幕像素定粗细：缩放停下后重画
  svg.classList.toggle('z2', k >= 2.2);
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
    const pv = el.dataset.prov === '1'; // 永久领土的标注（1945 年以后的“台湾省”）始终显示
    const vis = UI.labels && el.dataset.mute !== '1' && (scr > 180 || id === S.player || id === UI.sel || (el.dataset.badge && scr > 20) || pv);
    el.hidden = !vis || lx < -40 || ly < -20 || lx > wr.width + 40 || ly > wr.height + 20;
    if (!el.hidden) { el.style.left = lx + 'px'; el.style.top = ly + 'px'; }
    el.classList.toggle('small', scr < 900);
    el._pri = (id === S.player || id === UI.sel ? 1e9 : 0) + (el.dataset.badge ? 1e8 : 0) + (pv ? 5e7 : 0) + scr; el._x = lx; el._y = ly;
  }
  const shown = [...labelsEl.children].filter(el => !el.hidden).sort((a, b) => b._pri - a._pri); const boxes = [];
  for (const el of shown) {
    const w = el._w || 40, h = el._h || 14; const bx = [el._x - w / 2, el._y - h / 2, el._x + w / 2, el._y + h / 2];
    if (el._pri < 1e8 && boxes.some(o => bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1])) { el.hidden = true; continue; }
    boxes.push(bx);
  }
}
/* 联机版的中共地区在 1939 年以外的年代（或没有精细战区时）并入中国：地图上不单独着色、不单独标注 */
const mergedInto = id => (id === 'CCP' && S.actors.CCP && S.actors.CCP.ctrl === 'CHN' && S.actors.CCP.integrated ? 'CHN' : null);
function fillFor(id) {
  const x = S.actors[id], P = S.player, boss = W.boss(S, id);
  const acc = css('--accent'), land = css('--land');
  const own = W.provOf(S, id) || mergedInto(id); if (own) return fillFor(own); // 永久领土（台湾）与并入中国的中共地区：与所属国同色
  if (W.isNeutral(S, id)) return neuFill(); // 中立地区：任何视图里都是浅色，不属于任何一方
  switch (UI.view) {
    case 'political': if (boss === P) return x.ctrl === P && id !== P ? mix(acc, land, 0.25) : id === P ? acc : mix(acc, land, 0.45); return polColor(boss);
    case 'relation': {
      if (boss === P) return acc; if (W.atWar(S, boss, P)) return css('--hostile');
      const r = W.rel(S, boss, P);
      if (r >= 0) return r >= 40 ? mix(css('--friend-soft'), css('--friend'), (r - 40) / 60) : mix(css('--neutral-soft'), css('--friend-soft'), r / 40);
      return r <= -40 ? mix(css('--hostile-soft'), css('--hostile'), (-r - 40) / 60 * 0.8) : mix(css('--neutral-soft'), css('--hostile-soft'), -r / 40);
    }
    case 'threat': { if (boss === P) return acc; const t = (S.threat[boss] || 0) / 100; return t < 0.25 ? mix(land, css('--neutral-soft'), 0.6) : mix(css('--unknown-soft'), css('--hostile'), (t - 0.25) / 0.75); }
    case 'military': { if (!W.indep(S, id)) return mix(land, polColor(boss), 0.4); const mx = Math.max(...IDS.map(i => W.power(S, i))); const t = Math.log(1 + W.power(S, id)) / Math.log(1 + mx); return mix(land, id === P ? acc : css('--hostile'), t * 0.9); }
    case 'economy': { const mx = Math.max(...IDS.map(i => S.actors[i].gdp)); const t = Math.log(1 + x.gdp) / Math.log(1 + mx); return mix(land, id === P ? acc : css('--neutral'), t * 0.9); }
    case 'alliance': {
      if (boss === P) return acc; const b = boss;
      if (W.isAlly(S, b, P)) return css('--friend');
      const [bA, bB] = mainBlocs(), [pA, pB] = poles();
      if (bA && bA.members.includes(b)) return mix(css('--friend-soft'), land, 0.2);
      if (bB && bB.members.includes(b)) return mix(css('--unknown-soft'), css('--unknown'), 0.3);
      if (pA.some(c => c !== b && W.indep(S, c) && (W.isAlly(S, b, c) || W.isPartner(S, b, c)))) return mix(css('--friend-soft'), land, 0.55);
      if (pB.some(c => b === c || (W.indep(S, c) && (W.isAlly(S, b, c) || W.isPartner(S, b, c))))) return mix(css('--unknown-soft'), land, 0.35);
      return land;
    }
    case 'war': {
      if (boss === P) return acc; const b = boss;
      if (W.atWar(S, b, P)) return css('--hostile');
      if (W.enemies(S, P).some(e => W.atWar(S, b, e))) return css('--friend');
      if (W.enemies(S, b).length) return css('--unknown-soft');
      if (S.sanctions.some(s => (s.from === P && s.to === b) || (s.to === P && s.from === b))) return mix(css('--hostile-soft'), land, 0.4);
      return land;
    }
  }
  return land;
}
const sw = c => `<i style="background:${c}"></i>`;
/* 两大阵营（按剧本）：优先显示玩家所在集团 */
function poles() {
  const p = (W.sc().poles) || [['USA'], ['CHN', 'RUS']]; let a = p[0] || [], b = p[1] || []; const P = S.player;
  const side = arr => arr.includes(P) || arr.some(c => W.isAlly(S, P, c));
  if (!side(a) && side(b)) [a, b] = [b, a]; // 以玩家所在的一方为“己方”配色
  return [a, b];
}
function mainBlocs() {
  const P = S.player, [pA] = poles();
  const arr = Object.values(S.blocs).filter(b => b.members.length > 1);
  arr.sort((a, b) => (b.members.includes(P) - a.members.includes(P)) || (pA.includes(b.leader) - pA.includes(a.leader)) || (W.power(S, b.leader) - W.power(S, a.leader)));
  return [arr[0] || null, arr[1] || null];
}
const neuFill = () => mix(css('--land'), isDark() ? '#000000' : '#ffffff', 0.55);
const neuLegend = () => (S && S.neutral && S.neutral.some(id => !W.provOf(S, id)) ? `<span>${sw(neuFill())}${T('u.lg.neu')}</span>` : '');
const LEGENDS = {
  political: () => `<span>${sw(css('--accent'))}${T('u.lg.mine')}</span><span class="muted">${T('u.lg.pol')}</span>${neuLegend()}`,
  relation: () => `<span>${sw(css('--friend'))}${T('u.lg.friendly')}</span><span>${sw(css('--neutral-soft'))}${T('u.lg.neutral')}</span><span>${sw(css('--hostile-soft'))}${T('u.lg.cool')}</span><span>${sw(css('--hostile'))}${T('u.lg.hostile')}</span>`,
  threat: () => `<span>${sw(mix(css('--land'), css('--neutral-soft'), .6))}${T('u.lg.th_low')}</span><span>${sw(css('--unknown-soft'))}${T('u.lg.th_mid')}</span><span>${sw(css('--hostile'))}${T('u.lg.th_high')}</span><span class="muted">${T('u.lg.th')}</span>`,
  military: () => `<span>${sw(mix(css('--land'), css('--hostile'), .2))}${T('u.lg.weak')}</span><span>${sw(mix(css('--land'), css('--hostile'), .9))}${T('u.lg.strong')}</span><span class="muted">${T('u.lg.mil')}</span>`,
  economy: () => `<span>${sw(mix(css('--land'), css('--neutral'), .2))}${T('u.lg.small')}</span><span>${sw(mix(css('--land'), css('--neutral'), .9))}${T('u.lg.large')}</span><span class="muted">${T('u.lg.gdp')}</span>`,
  alliance: () => { const [bA, bB] = mainBlocs(), [pA, pB] = poles(); const nm = a => a.map(c => NAME(c)).join(EN() ? '/' : '、');
    return `<span>${sw(css('--friend'))}${T('u.lg.allies')}</span>${bA ? `<span>${sw(mix(css('--friend-soft'), css('--land'), .2))}${T('bloc.' + bA.id)}</span>` : ''}${bB ? `<span>${sw(mix(css('--unknown-soft'), css('--unknown'), .3))}${T('bloc.' + bB.id)}</span>` : ''}${pA.length ? `<span>${sw(mix(css('--friend-soft'), css('--land'), .55))}${T('u.lg.polepart', { x: nm(pA) })}</span>` : ''}${pB.length ? `<span>${sw(mix(css('--unknown-soft'), css('--land'), .35))}${T('u.lg.polepart', { x: nm(pB) })}</span>` : ''}`; },
  war: () => `<span>${sw(css('--hostile'))}${T('u.lg.atwar')}</span><span>${sw(css('--friend'))}${T('u.lg.cobel')}</span><span>${sw(css('--unknown-soft'))}${T('u.lg.otherwar')}</span><span>${sw(mix(css('--hostile-soft'), css('--land'), .4))}${T('u.lg.sanc')}</span>`,
};
function arrowPath(a, b, maxL, bend) {
  const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); const L = Math.min(dd, maxL); if (dd > 0) a = [b[0] + (a[0] - b[0]) / dd * L, b[1] + (a[1] - b[1]) / dd * L];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * bend;
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}
function frontGeo(f) {
  const a = GEO.label[f.from === f.target ? f.att : f.from] || GEO.label[f.att], b = GEO.label[f.target]; if (!a || !b) return null;
  let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const hull = (typeof HULL !== 'undefined' && HULL[f.target]) || [[b[0], b[1]]];
  const ts = hull.map(p => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy);
  return { a, b, dx, dy, tmin: Math.min(...ts), tmax: Math.max(...ts) };
}
function drawFronts() {
  const P = S.player; let defs = '', occ = '', over = '', sup = '', badges = ''; const cityDone = new Set();
  const inv = (1 / Math.sqrt(view.k)).toFixed(3);
  const mk = (x, y, cls, inner, extra) => `<g class="${cls}" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${inv})" ${extra || ''}>${inner}</g>`;
  const showF = lyrOn('front'), showS = lyrOn('supply'), uu = pxU();
  // 各战线投入兵力的最大值（箭头粗细、兵力集群按相对大小）
  const ffs = S.fronts.map(frontForce), gmax = Math.max(1, ...ffs.map(z => z.g)), umax = { tanks: Math.max(0, ...ffs.map(z => z.u.tanks)), pers: Math.max(0, ...ffs.map(z => z.u.pers)), air: Math.max(0, ...ffs.map(z => z.u.air)), ships: Math.max(0, ...ffs.map(z => z.u.ships)) };
  for (const f of S.fronts) {
    const g = frontGeo(f); if (!g) continue;
    const mine = f.att === P || (f.co || []).some(k => k.id === P), vs = W.boss(S, f.target) === P;
    const col = mine ? css('--accent') : vs ? css('--hostile') : css('--unknown');
    const deg = (Math.atan2(g.dy, g.dx) * 180 / Math.PI).toFixed(2), tr = `translate(${g.a[0].toFixed(1)} ${g.a[1].toFixed(1)}) rotate(${deg})`;
    let mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2, label = '';
    if (f.phase === 'land' && f.progress > 0.5) {
      const pos = g.tmin + (g.tmax - g.tmin) * clamp(f.progress / 100, 0, 1);
      defs += `<clipPath id="fc-${f.id}"><rect x="${(g.tmin - 80).toFixed(1)}" y="-4000" width="${(pos - g.tmin + 80).toFixed(1)}" height="8000" transform="${tr}"/></clipPath>`;
      if (!defs.includes(`id="ft-${f.target}"`)) defs += `<clipPath id="ft-${f.target}"><path d="${GEO.paths[f.target]}"/></clipPath>`;
      occ += `<path d="${GEO.paths[f.target]}" clip-path="url(#fc-${f.id})" class="occfill" style="fill:${col}"/>`;
      occ += `<g clip-path="url(#ft-${f.target})"><line x1="${pos.toFixed(1)}" y1="-4000" x2="${pos.toFixed(1)}" y2="4000" transform="${tr}" class="fline" style="stroke:${col}"/></g>`;
      mx = g.a[0] + g.dx * pos; my = g.a[1] + g.dy * pos; label = Math.round(f.progress) + '%';
    } else if (f.phase === 'landing') {
      const c0 = f.obj && f.obj[0] && CITIES[f.target] ? CITIES[f.target][f.obj[0][0]] : null; if (c0) { mx = c0[2]; my = c0[3]; } label = '⚓';
    } else if (f.phase === 'sea') { label = '⚓ ' + Math.round(Math.max(0, f.sp)) + '%'; }
    if (!showF && !showS) continue;
    const A = arrowGeo(f, g, uu, gmax);
    if (showS) sup += supplyLine(f, A, col);
    if (!showF) continue;
    const fa = fatArrow(f, col, (vs ? 'vs' : mine ? 'me' : 'ot') + (f.kind === 'amph' ? ' amph' : ''), A, uu, umax);
    over += fa.svg;
    if (fa.launching) badges += mkp(A.tail[0], A.tail[1], 'fa-new' + (vs ? ' vs' : mine ? ' me' : ''), `<rect x="-21" y="-19" width="42" height="16" rx="8"/><text y="-7.5">${esc(T('u.fa.new'))}</text>`, fa.anim ? `style="${fa.anim}"` : '');
    over += mk(mx, my, 'warmk' + (vs ? ' vs' : mine ? ' me' : ''), `<circle r="10" style="stroke:${col}"/><text y="4">⚔</text>${label ? `<text class="wl" y="-14">${label}</text>` : ''}`, `data-war="${f.id}"`);
    // 城市目标
    if (!cityDone.has(f.target) && CITIES[f.target]) {
      cityDone.add(f.target);
      const next = (f.obj || []).find(([i]) => !(f.taken || []).includes(i));
      CITIES[f.target].forEach((c, i) => {
        const tk = (f.taken || []).includes(i), nx = next && next[0] === i;
        over += mk(c[2], c[3], 'city' + (tk ? ' taken' : '') + (nx ? ' next' : ''), `<circle r="${c[4] ? 4.2 : 3.2}" style="${tk ? `fill:${col};stroke:${col}` : ''}"/>${c[4] ? '<circle r="7" class="capring"/>' : ''}<text x="6" y="3.5">${esc(EN() ? c[1] : c[0])}</text>`);
      });
    }
  }
  if (showF) badges += warBadges(mkp);
  return { defs, occ, over: sup + over + badges };
}
function renderMap() {
  if (!S) return;
  for (const id of IDS) paths[id].style.fill = fillFor(id);
  $('#selPath').setAttribute('d', UI.sel ? GEO.outline[UI.sel] : ''); $('#mePath').setAttribute('d', GEO.outline[S.player]);
  renderOver();
  // 标签
  const P = S.player, en = EN();
  for (const el of labelsEl.children) {
    const id = el.dataset.id; const f = S.fronts.filter(x => x.target === id).sort((a, b) => b.progress - a.progress)[0];
    const occ = S.actors[id].ctrl !== id && !S.actors[id].integrated; // 已并入的地区（如苏联的加盟共和国）不显示占领标记
    let badge = '';
    if (f) { const col = f.att === P ? css('--accent') : W.boss(S, id) === P ? css('--hostile') : css('--unknown'); const txt = f.phase === 'land' ? `⚔ ${Math.max(0, Math.round(f.progress))}%` : `⚓ ${T('ph.' + f.phase)}`; badge = `<span class="badge" style="background:${col}">${txt}</span>`; }
    else if (occ) badge = `<span class="badge" style="background:${css('--muted')}">${T('u.lb.occ', { n: Math.round(S.actors[id].resist) })}</span>`;
    el.dataset.badge = badge ? '1' : '';
    const nm = NAME(id);
    el.innerHTML = esc(nm) + badge;
    el.classList.toggle('me', id === P);
    const pv = !!W.provOf(S, id) && (W.sc().year || 0) > 1939; el.dataset.prov = pv ? '1' : ''; el.classList.toggle('prov', pv);
    el.dataset.mute = mergedInto(id) && !badge ? '1' : '';
    el._w = Math.max(nm.length * (en ? 6.6 : 11.5) + 4, badge ? 64 : 0); el._h = badge ? 30 : 16;
  }
  $('#legend').innerHTML = LEGENDS[UI.view]();
  $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === UI.view));
  placeLabels();
}
/* 地图上叠加的内容：占领区、战线（粗箭头、兵力集群、补给线）、集结与驻军、图层（航运、铁路、资源、海峡） */
function renderOver() {
  if (!S) return;
  let hatch = '';
  for (const id of IDS) { const n = W.isNeutral(S, id) && !W.provOf(S, id); paths[id].classList.toggle('neutral', n); if (n) hatch += `<path d="${GEO.paths[id]}" class="hatch" fill="url(#neuP)"/>`; } // 中立地区加细点纹
  for (const id of IDS) if (S.actors[id].ctrl !== id && !S.actors[id].integrated) hatch += `<path d="${GEO.paths[id]}" class="hatch" fill="url(#hatchP)"/>`;
  const P = S.player; let o = '';
  // 战线：占领区、推进线、粗箭头、兵力集群、补给线、城市目标、战况标记
  const fr = drawFronts(); hatch += fr.occ; o += fr.over;
  gHatch.innerHTML = `<defs><pattern id="neuP" width="3.2" height="3.2" patternUnits="userSpaceOnUse"><circle cx="1.6" cy="1.6" r="0.55" style="fill: var(--muted); fill-opacity: .55"/></pattern></defs>` + fr.defs + hatch;
  const inv = (1 / Math.sqrt(view.k)).toFixed(3);
  if (lyrOn('units')) {
    // 集结中的行动：自己的与已察觉的
    for (const op of S.ops) {
      const mine = op.owner === P, seen = op.det.includes(P); if (!mine && !seen) continue;
      const a = GEO.label[op.from] || GEO.label[op.owner], b = GEO.label[op.target]; if (!a || !b) continue;
      const col = mine ? css('--accent') : css('--hostile');
      o += `<path class="opline" d="${arrowPath(a, b, 110, 0.22)}" stroke="${col}" marker-end="url(#arr-${mine ? 'me' : 'vs'})"/>`;
      o += `<g class="mass" data-x="${a[0].toFixed(1)}" data-y="${a[1].toFixed(1)}" transform="translate(${a[0].toFixed(1)},${a[1].toFixed(1)}) scale(${inv})"><circle r="9" stroke="${col}"/><text y="3.5">${mine ? '⚑' : '!'}</text></g>`;
    }
    // 我方驻军与在途部队
    const me = S.actors[P];
    for (const m of me.moves) { const a = GEO.label[m.from], b = GEO.label[m.to]; if (a && b) o += `<path class="transit" d="${arrowPath(a, b, 400, 0.12)}"/>`; }
    for (const L of Object.keys(me.forces)) {
      const sh = W.share(S, P, L);
      if (sh < 0.01 || (L === P && UI.view !== 'military')) continue; const c = GEO.label[L]; if (!c) continue;
      const r = 5 + Math.sqrt(sh) * 16;
      o += `<g class="station" data-x="${c[0].toFixed(1)}" data-y="${(c[1] + (L === P ? 0 : 12)).toFixed(1)}" transform="translate(${c[0].toFixed(1)},${(c[1] + (L === P ? 0 : 12)).toFixed(1)}) scale(${inv})"><circle r="${r.toFixed(1)}"/><text y="3">${Math.round(sh * 100)}</text></g>`;
    }
  }
  if (lyrOn('units') || lyrOn('sea')) for (const k of S.blockades) { const c = GEO.label[k.target]; o += `<circle class="blockade" cx="${c[0]}" cy="${c[1]}" r="26" stroke="${k.by === P ? css('--accent') : css('--hostile')}"/>`; }
  gOver.innerHTML = o;
  lyrRender();
}
(function mapInput() {
  const pts = new Map(); let drag = null, moved = 0, pinch = null;
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (pts.size === 1) drag = { x: e.clientX, y: e.clientY }; else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; } });
  svg.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) {
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (pinch.k * d / pinch.d) / view.k); moved += 10; return; }
      if (drag) { const p0 = svgPt(prev[0], prev[1]), p1 = svgPt(e.clientX, e.clientY); view.x += (p1.x - p0.x); view.y += (p1.y - p0.y); moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]); applyView(); }
      hideTip(); return;
    }
    const lt = e.target && e.target.closest ? e.target.closest('[data-lt]') : null; // 图层元素：航运线、铁路、资源、海峡
    if (lt) { if (UI.hover) { UI.hover = null; $('#hovPath').setAttribute('d', ''); } showLyrTip(lt.dataset.lt, e.clientX, e.clientY); return; }
    const id = e.target && e.target.dataset ? e.target.dataset.id : null;
    if (id !== UI.hover) { UI.hover = id; $('#hovPath').setAttribute('d', id ? GEO.outline[id] : ''); }
    if (id) showTip(id, e.clientX, e.clientY); else hideTip();
  });
  const end = e => { const wasDrag = moved > 6; pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; if (!wasDrag && e.type === 'pointerup') { const els = document.elementsFromPoint(e.clientX, e.clientY); const wm = els.map(el => el.closest && el.closest('[data-war]')).find(Boolean); if (wm && S) { openWarMap(wm.dataset.war); return; } const land = els.find(el => el.dataset && IDS.includes(el.dataset.id) && el.closest('#gLand')); if (land) select(land.dataset.id); } } };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { UI.hover = null; $('#hovPath').setAttribute('d', ''); hideTip(); });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  svg.addEventListener('dblclick', e => zoomAt(e.clientX, e.clientY, 1.8));
  $$('.zoom button').forEach(b => (b.onclick = () => { const r = svg.getBoundingClientRect(); if (b.dataset.z === 'reset') { view.k = 1; view.x = 0; view.y = 0; applyView(); } else zoomAt(r.left + r.width / 2, r.top + r.height / 2, b.dataset.z === 'in' ? 1.6 : 1 / 1.6); }));
  window.addEventListener('resize', () => placeLabels());
})();
function showTip(id, cx, cy) {
  if (!S) return;
  const tip = $('#tip'); const x = S.actors[id], P = S.player; const b = W.boss(S, id);
  const [rw, rc] = id === P ? ['u.rw.self', 'friend'] : relWord(W.rel(S, b, P), W.atWar(S, b, P));
  const sh = W.share(S, P, id);
  tip.innerHTML = `<h4><i style="width:10px;height:10px;border-radius:2px;background:${polColor(W.provOf(S, id) || id)};display:inline-block"></i>${esc(NAME(id))}<span class="stance s-${rc}">${T(rw)}</span></h4>
  <div class="row"><span class="muted">${T('u.status')}</span><span>${esc(statusText(id))}</span></div>
  <div class="row"><span class="muted">GDP</span><span class="num">${fmtB(x.gdp)}</span></div>
  <div class="row"><span class="muted">${T('u.power')}</span><span class="num">${fmtN(W.power(S, id))}${x.nukes ? ' · ☢' + fmtN(x.nukes) : ''}</span></div>
  ${id !== P && !W.isNeutral(S, id) ? `<div class="row"><span class="muted">${T('u.relto')}</span><span class="num">${Math.round(W.rel(S, b, P))}</span></div><div class="row"><span class="muted">${T('u.threatp')}</span><span class="num ${threatCls(S.threat[b] || 0)}">${Math.round(S.threat[b] || 0)}</span></div>` : ''}
  <div class="row"><span class="muted">${T('u.stab')}</span><span class="num">${Math.round(x.stab)}</span></div>
  ${sh > 0.001 ? `<div class="row"><span class="muted">${T('u.myforces')}</span><span class="num">${pct(sh)}</span></div><div class="row"><span class="muted" style="font-size:11px">${esc(unitTxt(W.unitsV(S, P, W.shareV(S, P, id))))}</span></div>` : ''}
  ${S.fronts.filter(f => f.target === id).map(f => `<div class="row"><span class="muted">⚔ ${esc(NAME(f.att))}</span><span class="num">${f.phase === 'land' ? Math.round(f.progress) + '%' : T('ph.' + f.phase)}</span></div>`).join('')}`;
  const r = $('#mapwrap').getBoundingClientRect(); tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight; let lx = cx - r.left + 16, ly = cy - r.top + 12; if (lx + w > r.width - 8) lx = cx - r.left - w - 12; if (ly + h > r.height - 8) ly = r.height - h - 8;
  tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
}
function hideTip() { $('#tip').hidden = true; }
function select(id) { UI.sel = id; UI.open = {}; if (UI.tab !== 'diplo') UI.tab = 'target'; renderMap(); renderSide(); }
