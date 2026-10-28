// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 v4 · 作战地图 =====================
 * 战区地图：双方控制区、占领区、推进线、城市目标与我方驻军；点击战线或城市下达命令。
 * 进攻方：设定主攻城市、调整投入兵力、空中支援、增援出发阵地、停止进攻。
 * 防守方：死守某城、空中支援、增援、反攻、请求盟友。
 * 新攻势：在地图上点选敌方城市 → 选择出发阵地、兵力与方式 → 下达进攻命令（主攻该城）。
 * 状态：UI.wm = { mode: 'front'|'new', f, T, focus, from, share, haste, sel: 'T:i', rf, rfFrom }
 */
function wmFrontsList() {
  const P = S.player;
  return S.fronts.filter(f => f.att === P || W.boss(S, f.target) === P || (f.co || []).some(k => k.id === P) || (f.coD || []).includes(P))
    .sort((a, b) => ((b.att === P) - (a.att === P)) || ((W.boss(S, b.target) === P) - (W.boss(S, a.target) === P)));
}
const wmIsOpen = () => !$('#modal').hidden && !!$('#sheet .wmap');
function openWarMap(arg) {
  const w = UI.wm = UI.wm || { share: 0.4, haste: 0, rf: 0.25 };
  if (arg === 'new') { w.mode = 'new'; w.sel = null; }
  else if (arg && String(arg).startsWith('T:')) { w.mode = 'new'; w.T = String(arg).slice(2); w.focus = null; w.sel = null; }
  else if (arg && arg !== '1') { w.mode = 'front'; w.f = arg; w.sel = null; }
  const fl = wmFrontsList();
  if (w.mode === 'front' && !S.fronts.some(f => f.id === w.f)) { if (fl.length) w.f = fl[0].id; else w.mode = 'new'; }
  if (!w.mode) { if (fl.length) { w.mode = 'front'; w.f = fl[0].id; } else w.mode = 'new'; }
  renderWarMap();
}
function renderWarMap() {
  const html = warMapHTML();
  if (wmIsOpen()) {
    const sh = $('#sheet'), top = sh.scrollTop, sd = $('#sheet .wside'), ss = sd ? sd.scrollTop : 0;
    sh.innerHTML = html; sh.scrollTop = top; const s2 = $('#sheet .wside'); if (s2) s2.scrollTop = ss;
  } else showModal(html, 'wide wm', true);
}
/* 战区范围：目标与出发阵地（过远的出发地只画方向） */
const wmNarrow = () => (window.innerWidth || 1400) < 780;
/* 地图在屏幕上的大致宽度（像素）：用于让文字与标记保持固定的屏幕大小 */
const wmRW = () => (wmNarrow() ? Math.max(260, (window.innerWidth || 400) - 60) : Math.min(1260, window.innerWidth || 1260) * 0.57);
function wmBox(ids, pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const id of ids) {
    const b = GEO.bbox[id], l = GEO.label[id];
    if (b && b[2] - b[0] <= 220 && b[3] - b[1] <= 140) { add(b[0], b[1]); add(b[2], b[3]); }
    else if (l) { add(l[0] - 50, l[1] - 34); add(l[0] + 50, l[1] + 34); }
  }
  for (const p of pts) add(p[0], p[1]);
  if (x0 > x1) { x0 = 0; y0 = 0; x1 = GEO.w; y1 = GEO.h; }
  let w = x1 - x0, h = y1 - y0; const pad = Math.max(w, h) * 0.1 + 12; x0 -= pad; y0 -= pad; w += pad * 2; h += pad * 2;
  const AR = wmNarrow() ? 1.1 : 1.45; if (w / h < AR) { const nw = h * AR; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / AR; y0 -= (nh - h) / 2; h = nh; }
  if (w < 130) { const s = 130 / w; x0 -= (w * s - w) / 2; y0 -= (h * s - h) / 2; w *= s; h *= s; }
  return [x0, y0, w, h];
}
const wmCities = (id, maxD = 260) => { const l = GEO.label[id]; return (CITIES[id] || []).map((c, i) => ({ c, i })).filter(z => !l || Math.hypot(z.c[2] - l[0], z.c[3] - l[1]) <= maxD); };
function wmSideOf(id) {
  const P = S.player, b = W.boss(S, id);
  if (b === P) return 'me';
  if (W.atWar(S, b, P)) return 'en';
  if (W.isAlly(S, b, P) || W.enemies(S, P).some(e => W.atWar(S, b, e))) return 'al';
  return 'ne';
}
function wmColOf(g) {
  const P = S.player;
  if (g.att === P || (g.co || []).some(k => k.id === P)) return css('--accent');
  if (W.boss(S, g.target) === P || W.atWar(S, g.att, P)) return css('--hostile');
  if (W.enemies(S, P).some(e => W.atWar(S, g.att, e) || W.boss(S, g.target) === e)) return css('--friend');
  return css('--unknown');
}
function wmFrontPos(g) {
  const geo = frontGeo(g); if (!geo) return null;
  let mx = geo.b[0], my = geo.b[1], pos = null;
  if (g.phase === 'land' && g.progress > 0.5) { pos = geo.tmin + (geo.tmax - geo.tmin) * clamp(g.progress / 100, 0, 1); mx = geo.a[0] + geo.dx * pos; my = geo.a[1] + geo.dy * pos; }
  else if (g.phase === 'landing') { const c0 = g.obj && g.obj[0] && CITIES[g.target] ? CITIES[g.target][g.obj[0][0]] : null; if (c0) { mx = c0[2]; my = c0[3]; } }
  else if (g.phase === 'sea') { mx = (geo.a[0] + geo.b[0]) / 2; my = (geo.a[1] + geo.b[1]) / 2; }
  return { geo, pos, mx, my };
}
function wmSVG(f, tg) {
  const P = S.player, w = UI.wm;
  const ids = [], pts = [];
  const far = (a, b) => !a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) > 420;
  if (f) {
    ids.push(f.target); const src = f.from === f.target ? f.att : f.from;
    if (!far(GEO.label[src], GEO.label[f.target])) pts.push(GEO.label[src]);
  } else if (tg) {
    ids.push(tg); const so = W.stagingOptions(S, P, tg).find(o => o.L === w.from) || W.stagingOptions(S, P, tg)[0];
    if (so && !far(GEO.label[so.L], GEO.label[tg])) pts.push(GEO.label[so.L]);
  } else ids.push(P);
  for (const id of ids) for (const z of wmCities(id)) pts.push([z.c[2], z.c[3]]);
  const [x0, y0, bw, bh] = wmBox(ids, pts), k = bw / wmRW();
  const inBox = b => b && b[2] >= x0 && b[0] <= x0 + bw && b[3] >= y0 && b[1] <= y0 + bh;
  const inPt = p => p && p[0] >= x0 && p[0] <= x0 + bw && p[1] >= y0 && p[1] <= y0 + bh;
  const vis = IDS.filter(id => inBox(GEO.bbox[id]));
  const land = css('--land');
  const fill = { me: mix(css('--accent'), land, 0.42), al: mix(css('--friend'), land, 0.62), en: mix(css('--hostile'), land, 0.6), ne: land };
  const focusT = f ? f.target : tg;
  const op0 = !f && tg ? S.ops.find(o => o.owner === P && o.target === tg) : null, nf = op0 ? op0.focus : w.focus; // 新攻势（或集结中的行动）的主攻城市
  let defs = `<pattern id="wmHatch" width="${(5 * k).toFixed(2)}" height="${(5 * k).toFixed(2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${(1.6 * k).toFixed(2)}" height="${(5 * k).toFixed(2)}" style="fill:var(--ink);fill-opacity:.3"/></pattern>`;
  for (const [n, c] of [['me', css('--accent')], ['vs', css('--hostile')], ['al', css('--friend')], ['ot', css('--unknown')]]) defs += `<marker id="wmA-${n}" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="${(9 * k).toFixed(2)}" markerHeight="${(9 * k).toFixed(2)}" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:${c}"/></marker>`;
  let land0 = '', occ = '', over = '', names = '', cities = '';
  for (const id of vis) {
    const sd = wmSideOf(id);
    land0 += `<path class="rg ${sd}${id === focusT ? ' tgt' : ''}" data-wreg="${id}" d="${GEO.paths[id]}" style="fill:${fill[sd]}"><title>${esc(NAME(id))}</title></path>`;
    if (S.actors[id].ctrl !== id && !S.actors[id].integrated) occ += `<path d="${GEO.paths[id]}" fill="url(#wmHatch)" class="nohit"/>`;
    const l = GEO.label[id];
    if (inPt(l) && ((GEO.areaPx[id] || 0) / (bw * bh) > 0.006 || id === focusT)) names += `<g transform="translate(${l[0].toFixed(1)},${l[1].toFixed(1)}) scale(${k.toFixed(4)})"><text class="wrn${id === focusT ? ' tgt' : ''}" y="4">${esc(NAME(id))}</text></g>`;
  }
  // 战线：占领区、推进线、方向箭头、战况标记
  const fronts = S.fronts.filter(g => inBox(GEO.bbox[g.target]) || g === f);
  const cityT = new Set([focusT]);
  for (const g of fronts) {
    const fp = wmFrontPos(g); if (!fp) continue; const { geo } = fp; const col = wmColOf(g);
    const mk = col === css('--accent') ? 'me' : col === css('--hostile') ? 'vs' : col === css('--friend') ? 'al' : 'ot';
    cityT.add(g.target);
    if (fp.pos !== null) {
      const deg = (Math.atan2(geo.dy, geo.dx) * 180 / Math.PI).toFixed(2), tr = `translate(${geo.a[0].toFixed(1)} ${geo.a[1].toFixed(1)}) rotate(${deg})`;
      defs += `<clipPath id="wfc-${g.id}"><rect x="${(geo.tmin - 80).toFixed(1)}" y="-4000" width="${(fp.pos - geo.tmin + 80).toFixed(1)}" height="8000" transform="${tr}"/></clipPath>`;
      if (!defs.includes(`id="wft-${g.target}"`)) defs += `<clipPath id="wft-${g.target}"><path d="${GEO.paths[g.target]}"/></clipPath>`;
      occ += `<path d="${GEO.paths[g.target]}" clip-path="url(#wfc-${g.id})" class="wocc nohit" style="fill:${col}"/>`;
      occ += `<g clip-path="url(#wft-${g.target})" class="nohit"><line x1="${fp.pos.toFixed(1)}" y1="-4000" x2="${fp.pos.toFixed(1)}" y2="4000" transform="${tr}" class="wline" style="stroke:${col}"/></g>`;
    }
    over += `<path class="warr${g.kind === 'amph' ? ' amph' : ''}${g === f ? ' cur' : ''}" d="${arrowPath(geo.a, [fp.mx, fp.my], Math.min(150, bw * 0.4), 0.16)}" style="stroke:${col}" marker-end="url(#wmA-${mk})"/>`;
    const lab = g.phase === 'land' ? Math.round(g.progress) + '%' : g.phase === 'sea' ? '⚓' + Math.round(Math.max(0, g.sp)) + '%' : '⚓';
    over += `<g class="wfm${g === f ? ' cur' : ''}" data-wfront="${g.id}" transform="translate(${fp.mx.toFixed(1)},${fp.my.toFixed(1)}) scale(${k.toFixed(4)})"><circle r="11" style="stroke:${col}"/><text y="4">⚔</text><text class="wl" y="-15">${lab}</text><title>${esc(NAME(g.att))} → ${esc(NAME(g.target))}</title></g>`;
  }
  // 我方集结中的行动与察觉到的敌方集结
  for (const op of S.ops) {
    const mine = op.owner === P; if (!mine && !op.det.includes(P)) continue;
    const a = GEO.label[op.from], b = GEO.label[op.target]; if (!a || !b || (!inPt(a) && !inPt(b))) continue;
    over += `<path class="wop" d="${arrowPath(a, b, Math.min(140, bw * 0.4), 0.22)}" style="stroke:${mine ? css('--accent') : css('--hostile')}" marker-end="url(#wmA-${mine ? 'me' : 'vs'})"/>`;
  }
  // 城市：焦点地区与各战线目标标出名称；其他敌我地区只画小点
  const sel = w.sel || '';
  for (const id of vis) {
    const sd = wmSideOf(id); const labeled = cityT.has(id); if (!labeled && sd === 'ne') continue;
    const g = (f && f.target === id) ? f : S.fronts.find(z => z.target === id && (z.att === P || W.boss(S, id) === P)) || S.fronts.find(z => z.target === id);
    const hold = W.holdOf(S, id);
    const objs = g ? (g.obj || []) : [];
    const nextI = g ? (objs.filter(([i]) => !g.taken.includes(i)).map(([i, t]) => [i, W.objThr(S, g, i, t)]).sort((a, b) => a[1] - b[1])[0] || [])[0] : undefined;
    for (const z of wmCities(id)) {
      const { c, i } = z; if (!inPt([c[2], c[3]])) continue;
      const tk = g && g.taken.includes(i), cls = ['wc', labeled ? 'lab' : 'dot', tk ? 'taken' : '', nextI === i ? 'next' : '', g && g.focus === i ? 'focus' : '', hold === i ? 'hold' : '', c[4] ? 'cap' : '', sel === id + ':' + i ? 'sel' : '', (UI.wm.mode === 'new' && id === tg && nf === i) ? 'focus' : ''].filter(Boolean).join(' ');
      const r = labeled ? (c[4] ? 4.6 : 3.6) : 2.4;
      cities += `<g class="${cls}" data-wcity="${id}:${i}" transform="translate(${c[2].toFixed(1)},${c[3].toFixed(1)}) scale(${k.toFixed(4)})"><circle class="hit" r="9"/>${(g && g.focus === i) || (UI.wm.mode === 'new' && id === tg && nf === i) ? '<circle class="ring f" r="8.5"/>' : ''}${hold === i ? '<circle class="ring h" r="8.5"/>' : ''}<circle class="dotc" r="${r}" ${tk ? `style="fill:${wmColOf(g)};stroke:${wmColOf(g)}"` : ''}/>${c[4] ? '<circle class="capr" r="6.6"/>' : ''}${labeled ? `<text x="7" y="3.8">${esc(EN() ? c[1] : c[0])}</text>` : ''}<title>${esc(EN() ? c[1] : c[0])} · ${esc(NAME(id))}</title></g>`;
    }
  }
  // 我方驻军
  let st = '';
  for (const L of W.stations(S, P)) {
    const l = GEO.label[L]; if (!inPt(l)) continue; const sh = W.share(S, P, L); if (sh < 0.01) continue;
    const r = 6 + Math.sqrt(sh) * 14, y = l[1] + (cityT.has(L) ? 14 * k : 0);
    st += `<g class="wst" transform="translate(${l[0].toFixed(1)},${y.toFixed(1)}) scale(${k.toFixed(4)})"><circle r="${r.toFixed(1)}"/><text y="3.5">${Math.round(sh * 100)}</text><title>${esc(T('u.myforces'))} ${pct(sh)} · ${esc(unitTxt(W.unitsV(S, P, W.shareV(S, P, L))))}</title></g>`;
  }
  return `<svg viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${bw.toFixed(1)} ${bh.toFixed(1)}" role="img" aria-label="${esc(T('u.wm.title'))}"><defs>${defs}</defs><rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" class="wsea"/>${land0}${GEO.dash ? `<path class="wdash nohit" d="${GEO.dash}"/>` : ''}${occ}${names}${over}${st}${cities}</svg>`;
}
function wmLegend() {
  const land = css('--land');
  const sw = (c, extra) => `<i style="background:${c}${extra || ''}"></i>`;
  return `<div class="wlegend"><span>${sw(mix(css('--accent'), land, 0.42))}${T('u.wm.lg.me')}</span><span>${sw(mix(css('--friend'), land, 0.62))}${T('u.wm.lg.al')}</span><span>${sw(mix(css('--hostile'), land, 0.6))}${T('u.wm.lg.en')}</span><span>${sw(land, ';background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.25) 0 2px,transparent 2px 5px)')}${T('u.wm.lg.occ')}</span><span><b class="lgl" style="border-color:${css('--accent')}"></b>${T('u.wm.lg.line')}</span><span>★ ${T('u.wm.lg.cap')}</span><span class="lgf">◎ ${T('u.wm.lg.focus')}</span><span class="lgh">◎ ${T('u.wm.lg.hold')}</span></div>`;
}
/* 双方兵力（具体单位） */
function wmSides(f) {
  const X = f.att, tg = f.target;
  const A = W.unitsV(S, X, f.v), coU = (f.co || []).map(k => W.unitsV(S, k.id, k.v));
  const def = W.defenseAt(S, tg, X); const dU = [];
  for (const c of def.who) { let v = [0, 0, 0]; for (const [cc, L, kk] of def.src) if (cc === c) v = W.vadd(v, W.vmul(W.freeV(S, c, L), kk)); dU.push(W.unitsV(S, c, v)); }
  const sum = arr => arr.reduce((z, u) => ({ pers: z.pers + u.pers, tanks: z.tanks + u.tanks, air: z.air + u.air, ships: z.ships + u.ships }), { pers: 0, tanks: 0, air: 0, ships: 0 });
  return { A: sum([A].concat(coU)), D: sum(dU), aF: f.A || W.groundV(S, X, f.v), dF: f.D || def.force, def };
}
function wmVsTable(a, d, aF, dF, la, ld, amph, rev) {
  const bar = (x, y) => { const t = x + y || 1; return `<div class="vs"><i style="width:${(x / t * 100).toFixed(1)}%"></i></div>`; };
  const row = (l, x, y, fmt) => `<tr><td>${l}</td><td class="num">${fmt(x)}</td><td>${bar(x, y)}</td><td class="num">${fmt(y)}</td></tr>`;
  return `<table class="rank vstab${rev ? ' rev' : ''}"><tr><th></th><th>${esc(la)}</th><th></th><th>${esc(ld)}</th></tr>${row(T('u.u.pers'), a.pers, d.pers, persT)}${row(T('u.u.tanks'), a.tanks, d.tanks, fmtN)}${row(T('u.u.air'), a.air, d.air, fmtN)}${amph ? row(T('u.u.ships'), a.ships, d.ships, fmtN) : ''}${row(T('u.combat'), aF, dF, fmtN)}</table>`;
}
/* 增援：从有空闲兵力的驻地调往目的地 */
function wmReinfHTML(dest) {
  const P = S.player, w = UI.wm;
  if (!W.canStation(S, P, dest)) return '';
  const srcs = W.stations(S, P).filter(L => L !== dest && W.vmax(W.freeQV(S, L)) > 0.01).sort((a, b) => W.dist(a, dest) - W.dist(b, dest));
  if (!srcs.length) return `<div class="muted" style="font-size:12px">${T('u.wm.noreinf')}</div>`;
  if (!srcs.includes(w.rfFrom)) w.rfFrom = srcs[0];
  const free = W.freeQV(S, w.rfFrom), v = [free[0] * w.rf, 0, free[2] * w.rf], st = W.deployStatus(S, w.rfFrom, dest, v);
  return `<div class="movebox"><b>${T('u.wm.reinf', { l: dest })}</b><div class="mvrow"><label>${T('u.from')}<select id="wmRfFrom">${srcs.map(L => `<option value="${L}" ${L === w.rfFrom ? 'selected' : ''}>${esc(NAME(L))} · ${T('u.freeat', { s: pct(W.dotw(S, P, W.freeQV(S, L))) })}</option>`).join('')}</select></label><label>${T('u.wm.rfamt')}<select id="wmRf">${[0.1, 0.25, 0.5, 1].map(x => `<option value="${x}" ${x === w.rf ? 'selected' : ''}>${x === 1 ? T('u.all') : pct(x)}</option>`).join('')}</select></label></div>
    <div class="muted" style="font-size:12px">${W.vmax(v) > 0.004 ? T('u.mv_units', { x: { raw: unitTxt(W.unitsV(S, P, v)) } }) + ' · ' : ''}${st.ok ? T('u.eta', { n: st.eta }) : esc(TX(st.reason))}</div><button data-wreinf="${dest}" ${st.ok ? '' : 'disabled'}>${T('u.wm.reinf_go')}</button></div>`;
}
function wmSupHTML(f) {
  const st = W.actionStatus(S, 'fsupport', f.target, { front: f.id });
  const q = S.queue.some(z => z.type === 'fsupport' && z.params && z.params.front === f.id);
  return `<div class="wcmd"><button class="${q ? 'on' : ''}" data-wsup="${f.id}" ${st.ok && !q ? '' : 'disabled'}>✈ ${T('a.fsupport')} · ${T('u.apn', { n: W.apCost(S, 'fsupport', f.target, { front: f.id }) })}${st.cost ? ' · ' + fmtB(st.cost) : ''}</button><div class="p ${st.ok || q ? '' : 'no'}">${q ? T('u.wm.sup_q') : esc(st.ok ? (st.preview ? TX(st.preview) : '') : TX(st.reason))}</div></div>`;
}
function wmFrontSide(f) {
  const P = S.player, X = f.att, tg = f.target, D = W.boss(S, tg), mine = X === P, defend = !mine && (D === P || (f.coD || []).includes(P));
  const co = (f.co || []).some(k => k.id === P), ph = f.phase || 'land', sd = wmSides(f), ratio = (ph === 'sea' ? f.seaRatio : f.ratio) || sd.aF / Math.max(1, sd.dF * W.DEF[tg].terr);
  const hold = W.holdOf(S, tg);
  let h = `<div class="whd"><b>${esc(NAME(X))} → ${esc(NAME(tg))}</b><span class="tag ${mine || co ? 'blue' : defend ? 'red' : ''}">${T(mine ? 'u.wm.att' : defend ? 'u.wm.def' : co ? 'u.wm.co' : 'u.wm.ally')}</span></div>`;
  h += `<div class="muted" style="font-size:12px">${T('kind.' + f.kind)} · ${T('ph.' + ph)} · ${T('u.turnN', { n: f.turns })} · ${T('u.fratio')} <b class="${ratio >= 1.2 ? (mine ? 'good' : 'bad') : ratio < 0.9 ? (mine ? 'bad' : 'good') : ''}">${ratio ? ratio.toFixed(2) : '—'}</b> · ${T('u.wm.min', { n: W.minTurns(tg) })}</div>`;
  h += `<div class="prog ${mine || co ? 'mine' : ''} ph-${ph}"><div style="width:${ph === 'land' ? Math.max(0, f.progress) : ph === 'sea' ? Math.max(0, f.sp) * 0.15 : 18}%"></div><span>${ph === 'land' ? Math.round(f.progress) + '%' : ph === 'sea' ? T('ph.sea') + ' ' + Math.round(Math.max(0, f.sp)) + '%' : T('ph.landing')}</span></div>`;
  h += `<h4>${T('u.balance')}</h4>${wmVsTable(sd.A, sd.D, sd.aF, sd.dF, NAME(X) + ((f.co || []).length ? '+' : ''), NAME(D) + (sd.def.who.length > 1 ? '+' : ''), f.kind === 'amph', !mine && !co && (D === P || (f.coD || []).includes(P)))}`;
  const last = (f.log || [])[(f.log || []).length - 1];
  if (last) h += `<div class="muted" style="font-size:12px">${T('u.wm.last', { d: dateStr(S, last.t) })}${esc(warLine(f, last))}${last.sup ? ' · ' + T('u.wm.sup_used', { n: fmtN(last.sup) }) : ''}${last.dsup ? ' · ' + T('u.wm.dsup_used', { n: fmtN(last.dsup) }) : ''}</div>`;
  // 城市目标
  const objs = (f.obj || []).map(([i, thr]) => ({ i, thr, eff: W.objThr(S, f, i, thr), c: CITIES[tg][i], tk: (f.taken || []).includes(i) }));
  if (objs.length) {
    const nx = objs.filter(o => !o.tk).sort((a, b) => a.eff - b.eff)[0];
    h += `<h4>${T(mine ? 'u.wm.obj_att' : D === P ? 'u.wm.obj_def' : 'u.wm.obj')}</h4><ul class="wobj">${objs.map(o => {
      let btn = '';
      if (mine && !o.tk) btn = f.focus === o.i ? `<button class="mini on" data-wfocus="${f.id}:">${T('u.wm.clearfocus')}</button>` : `<button class="mini" data-wfocus="${f.id}:${o.i}">${T('u.wm.setfocus')}</button>`;
      else if (D === P && !o.tk) btn = hold === o.i ? `<button class="mini on" data-whold="${tg}:">${T('u.wm.clearhold')}</button>` : `<button class="mini" data-whold="${tg}:${o.i}">${T('u.wm.sethold')}</button>`;
      const cls = [o.tk ? (mine || co ? 'taken good' : 'taken bad') : '', nx && nx.i === o.i ? 'next' : '', f.focus === o.i ? 'focus' : '', hold === o.i ? 'hold' : '', UI.wm.sel === tg + ':' + o.i ? 'sel' : ''].filter(Boolean).join(' ');
      const thr = o.tk ? T(mine || co ? 'u.wm.taken' : 'u.wm.lost') : o.eff !== o.thr ? `${o.thr}% → <b>${o.eff}%</b>` : `${o.thr}%`;
      return `<li class="${cls}" data-wcity="${tg}:${o.i}"><span class="nm">${o.c[4] ? '★' : ''}${esc(EN() ? o.c[1] : o.c[0])}${f.focus === o.i ? ` <em>${T('u.wm.focus')}</em>` : ''}${hold === o.i ? ` <em class="h">${T('u.wm.hold')}</em>` : ''}</span><small>${thr}</small>${btn}</li>`;
    }).join('')}</ul><div class="muted" style="font-size:11.5px;margin-top:4px">${T(mine ? 'u.wm.obj_help_att' : D === P ? 'u.wm.obj_help_def' : 'u.wm.obj_help')}</div>`;
    if (f.focus != null && CITIES[tg][f.focus]) { const o = objs.find(z => z.i === f.focus); if (o) h += `<div class="alert" style="margin-top:6px">${T('u.wm.focus_x', { x: W.cityName(tg, o.i), a: o.thr, b: o.eff })}</div>`; }
    if (hold != null && D === P) { const o = objs.find(z => z.i === hold); if (o) h += `<div class="alert" style="margin-top:6px">${T('u.wm.hold_x', { x: W.cityName(tg, o.i), a: o.thr, b: o.eff })}</div>`; }
  }
  // 命令
  if (mine) {
    const free = W.freeV(S, P, f.from); const opts = b => { const cur = f.tv ? f.tv[b] : f.v[b]; const max = f.v[b] + free[b]; const vals = [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8].filter(v => v <= max + 1e-6).concat([cur]).sort((a, c) => a - c).filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 0.004); return vals.map(v => `<option value="${v}" ${Math.abs(v - cur) < 0.004 ? 'selected' : ''}>${pct(v)}</option>`).join(''); };
    h += `<h4>${T('u.commit')}</h4><div class="mvrow">${[0, 1, 2].filter(b => b !== 1 || f.kind === 'amph').map(b => `<label>${T('br.' + ['land', 'navy', 'air'][b])}<select data-fv="${f.id}" data-b="${b}">${opts(b)}</select></label>`).join('')}</div><div class="muted" style="font-size:12px">${T('u.commit_help', { l: f.from })}</div>`;
    h += `<h4>${T('u.wm.orders')}</h4>${wmSupHTML(f)}${wmReinfHTML(f.from)}`;
    h += `<div class="btns wbtns"><button data-askfront="${f.id}">${T('u.ask_help')}</button><button data-wpeace="${D}">${T('u.peace')}</button><button data-whalt="${f.id}">${T('u.halt')}</button><button data-war="${f.id}">${T('u.wm.detail')}</button></div>`;
  } else if (defend) {
    h += `<h4>${T('u.wm.orders')}</h4>`;
    if (ph === 'land') h += wmSupHTML(f);
    h += wmReinfHTML(tg === P || !W.canStation(S, P, tg) ? P : tg);
    const src = f.from === f.target ? f.att : f.from;
    const canCounter = W.boss(S, src) !== P && W.atWar(S, P, W.boss(S, src)) && W.stagingOptions(S, P, src).length && !S.fronts.some(g => g.att === P && g.target === src);
    h += `<div class="btns wbtns">${canCounter ? `<button data-wmap="T:${src}">${T('u.wm.counter', { t: src })}</button>` : ''}<button data-askfront="${f.id}">${T('u.ask_help')}</button><button data-wpeace="${X}">${T('u.peace_with', { a: X })}</button><button data-war="${f.id}">${T('u.wm.detail')}</button></div>`;
  } else h += `<div class="btns wbtns"><button data-war="${f.id}">${T('u.wm.detail')}</button></div>`;
  return h;
}
function wmNewSide(tgts) {
  const P = S.player, w = UI.wm, tg = w.T;
  if (!tg) return `<div class="whd"><b>${T('u.wm.newoff')}</b></div><p class="muted">${T('u.wm.notgt')}</p>`;
  const so = W.stagingOptions(S, P, tg); if (!so.some(o => o.L === w.from)) w.from = so[0] ? so[0].L : undefined;
  const cs = CITIES[tg] || []; if (w.focus != null && !cs[w.focus]) w.focus = null;
  const params = { share: w.share, haste: w.haste, from: w.from }; if (w.focus != null) params.focus = w.focus;
  const st = W.actionStatus(S, 'invade', tg, params), war = W.atWar(S, P, W.boss(S, tg));
  let h = `<div class="whd"><b>${T('u.wm.newoff')}</b><span class="tag ${war ? 'red' : ''}">${war ? T('u.wm.atwar') : T('u.wm.peace_now')}</span></div>`;
  h += `<div class="mvrow"><label>${T('u.wm.tgt')}<select id="wmT">${tgts.map(z => `<option value="${z.T}" ${z.T === tg ? 'selected' : ''}>${esc(NAME(z.T))}${z.war ? ' · ' + T('u.wm.atwar') : ''}${z.busy ? ' · ' + T('u.wm.busy') : ''}</option>`).join('')}</select></label></div>`;
  // 已在集结或已排入本回合的攻势：显示状态，可改主攻城市或取消
  const op = S.ops.find(o => o.owner === P && o.target === tg), qd = S.queue.find(q => q.type === 'invade' && q.target === tg);
  const fr = S.fronts.find(g => g.att === P && g.target === tg);
  if (fr) return h + `<div class="alert">${T('u.wm.has_front')}</div><div class="btns wbtns"><button data-wfront="${fr.id}">${T('u.wm.goto_front')}</button></div>`;
  if (op) return h + `<div class="movebox"><b>${T('u.wm.op_now', { l: op.from, k: T('kind.' + op.kind), n: Math.max(0, op.ready - S.turn) })}</b><div class="mvrow"><label>${T('u.wm.op_city')}<select id="wmOpCity" data-op="${op.id}"><option value="">${T('u.wm.nofocus')}</option>${cs.map((c, i) => `<option value="${i}" ${op.focus === i ? 'selected' : ''}>${c[4] ? '★ ' : ''}${esc(EN() ? c[1] : c[0])}</option>`).join('')}</select></label></div><div class="btns"><button data-wcancel="${op.id}">${T('u.cancel_op')}</button></div></div>`;
  if (qd) return h + `<div class="alert">${T('u.wm.queued_inv', { t: tg, x: qd.params && qd.params.focus != null && qd.params.focus !== '' ? { k: 'u.wm.qfocus', p: { x: W.cityName(tg, +qd.params.focus) } } : '' })}</div>`;
  h += `<div class="mvrow"><label>${T('u.wm.city')}<select id="wmCity"><option value="">${T('u.wm.nofocus')}</option>${cs.map((c, i) => `<option value="${i}" ${w.focus === i ? 'selected' : ''}>${c[4] ? '★ ' : ''}${esc(EN() ? c[1] : c[0])}</option>`).join('')}</select></label><label>${T('u.wm.from')}<select id="wmFrom">${so.map(o => `<option value="${o.L}" ${o.L === w.from ? 'selected' : ''}>${esc(NAME(o.L))} · ${T('kind.' + o.kind)} · ${T('u.freeat', { s: pct(o.free) })}</option>`).join('')}</select></label></div>`;
  h += `<div class="mvrow"><label>${T('pk.share')}<select id="wmShare">${[0.25, 0.4, 0.6, 0.8].map(v => `<option value="${v}" ${v === w.share ? 'selected' : ''}>${pct(v)}</option>`).join('')}</select></label><label>${T('pk.haste')}<select id="wmHaste">${[0, 1].map(v => `<option value="${v}" ${v === w.haste ? 'selected' : ''}>${T('haste.' + v)}</option>`).join('')}</select></label></div>`;
  // 守军与目标城市
  if (w.from) {
    const D = W.boss(S, tg), def = W.defenseAt(S, tg, P); const dU = { pers: 0, tanks: 0, air: 0, ships: 0 };
    for (const c of def.who) { let v = [0, 0, 0]; for (const [cc, L, kk] of def.src) if (cc === c) v = W.vadd(v, W.vmul(W.freeV(S, c, L), kk)); const u = W.unitsV(S, c, v); for (const kk of ['pers', 'tanks', 'air', 'ships']) dU[kk] += u[kk]; }
    const o = so.find(z => z.L === w.from); const v = W.isV(w.share) ? w.share : (o && o.kind === 'amph' ? [w.share, w.share, w.share] : [w.share, 0, w.share]);
    h += `<h4>${T('u.wm.est')}</h4>${wmVsTable(W.unitsV(S, P, v), dU, W.groundV(S, P, v), def.force, NAME(P), NAME(D) + (def.who.length > 1 ? '+' : ''), o && o.kind === 'amph')}`;
    if (w.focus != null && cs[w.focus]) {
      const ob = W.frontObjectives(S, { from: w.from, att: P, target: tg }); const e = ob.find(z => z[0] === w.focus);
      if (e) h += `<div class="alert" style="margin-top:6px">${T('u.wm.focus_x', { x: W.cityName(tg, w.focus), a: e[1], b: W.objThr(S, { focus: w.focus, target: tg }, w.focus, e[1]) })}</div>`;
    }
  }
  h += `<div class="p ${st.ok ? '' : 'no'}">${esc(st.ok ? (st.preview ? TX(st.preview) : T('u.can')) : TX(st.reason))}</div>`;
  if (!war) h += `<div class="alert bad">${T('u.wm.newwar', { t: W.boss(S, tg) })}</div>`;
  h += `<button class="btn-primary ${war ? '' : 'danger'}" data-wgo="1" ${st.ok ? '' : 'disabled'}>${T('u.wm.go')} · ${T('u.apn', { n: W.apCost(S, 'invade', tg, params) })}${st.cost ? ' · ' + fmtB(st.cost) : ''}</button>`;
  h += `<p class="muted" style="font-size:11.5px;margin:8px 0 0">${T('u.wm.new_help')}</p>`;
  return h;
}
function warMapHTML() {
  const P = S.player, w = UI.wm, fl = wmFrontsList();
  const f = w.mode === 'front' ? S.fronts.find(z => z.id === w.f) || null : null;
  let tgts = [];
  if (w.mode === 'new') { tgts = W.frontTargets(S); if (!tgts.some(z => z.T === w.T)) { w.T = (tgts[0] || {}).T || null; w.focus = null; } }
  const tg = f ? f.target : w.T;
  const tabs = fl.map(g => `<button class="${f && g.id === f.id ? 'on' : ''} ${g.att === P ? 'att' : W.boss(S, g.target) === P ? 'def' : 'co'}" data-wfront="${g.id}">${esc(NAME(g.att))} → ${esc(NAME(g.target))}<small>${g.phase === 'land' ? Math.round(g.progress) + '%' : T('ph.' + g.phase)}</small></button>`).join('') + `<button class="new ${w.mode === 'new' ? 'on' : ''}" data-wnew="1">+ ${T('u.wm.new')}</button>`;
  const side = f ? wmFrontSide(f) : wmNewSide(tgts);
  const title = f ? T('u.wm.t_front', { a: f.att, t: f.target }) : tg ? T('u.wm.t_new', { t: tg }) : T('u.wm.title');
  return `<div class="wmap"><div class="kicker">${T('u.wm.title')} · ${esc(dateStr(S))}</div><h2>${esc(title)}</h2><p class="sub">${T('u.wm.sub')}</p>
    <div class="wtabs">${tabs}</div>
    <div class="wbody"><div class="wsvg">${wmSVG(f, tg)}${wmLegend()}</div><div class="wside">${side}</div></div>
    <div class="foot"><button class="btn-primary" data-close="1">${T('u.close')}</button></div></div>`;
}
/* ---------- 交互 ---------- */
function wmClick(d) {
  const P = S.player, w = UI.wm || (UI.wm = { share: 0.4, haste: 0, rf: 0.25 });
  if (d.wfront) { w.mode = 'front'; w.f = d.wfront; w.sel = null; renderWarMap(); return true; }
  if (d.wnew) { w.mode = 'new'; w.sel = null; renderWarMap(); return true; }
  if (d.wcity) {
    const [id, si] = d.wcity.split(':'), i = +si; w.sel = d.wcity;
    const mineF = S.fronts.find(g => g.target === id && g.att === P), defF = S.fronts.find(g => g.target === id && W.boss(S, id) === P);
    if (mineF) { w.mode = 'front'; w.f = mineF.id; }
    else if (defF) { w.mode = 'front'; w.f = defF.id; }
    else if (W.boss(S, id) !== P && W.stagingOptions(S, P, id).length) { w.mode = 'new'; w.T = id; w.focus = i; }
    else { const c = CITIES[id] && CITIES[id][i]; toast(T('u.wm.city_info', { x: { raw: c ? (EN() ? c[1] : c[0]) : '?' }, t: id })); }
    renderWarMap(); return true;
  }
  if (d.wreg) {
    const id = d.wreg; const fr = S.fronts.find(g => g.target === id && (g.att === P || W.boss(S, id) === P));
    if (fr) { w.mode = 'front'; w.f = fr.id; w.sel = null; }
    else if (W.boss(S, id) !== P && W.stagingOptions(S, P, id).length) { w.mode = 'new'; w.T = id; const cs = CITIES[id] || []; const ci = cs.findIndex(c => c[4]); w.focus = ci >= 0 ? ci : null; w.sel = null; }
    else { toast(T('u.wm.reg_info', { t: id, x: { raw: statusText(id) } })); return true; }
    renderWarMap(); return true;
  }
  if (d.wfocus !== undefined) { const [fid, si] = d.wfocus.split(':'); const ok = doCmd('setFrontFocus', [fid, si === '' ? null : +si]); if (ok) { const f = S.fronts.find(z => z.id === fid); toast(si === '' ? T('u.wm.focus_clr') : T('u.wm.focus_set', { x: W.cityName(f.target, +si) })); } renderWarMap(); autosave(); return true; }
  if (d.whold !== undefined) { const [id, si] = d.whold.split(':'); const ok = doCmd('setHold', [id, si === '' ? null : +si]); if (ok) toast(si === '' ? T('u.wm.hold_clr') : T('u.wm.hold_set', { x: W.cityName(id, +si) })); else toast(T('u.wm.hold_no')); renderWarMap(); autosave(); return true; }
  if (d.wsup) { const f = S.fronts.find(z => z.id === d.wsup); if (!f) return true; const r = W.queueAction(S, 'fsupport', f.target, { front: f.id }); toast(r.ok ? T('u.queued', { x: { raw: T('a.fsupport') + ' → ' + NAME(f.target) } }) : TX(r.reason)); renderTop(); renderQueue(); renderWarMap(); return true; }
  if (d.wreinf) { const free = W.freeQV(S, w.rfFrom); const v = [free[0] * w.rf, 0, free[2] * w.rf]; const r = W.queueDeploy(S, w.rfFrom, d.wreinf, v); toast(r.ok ? T('u.deploy_q', { f: w.rfFrom, l: d.wreinf }) : TX(r.reason)); renderQueue(); renderWarMap(); return true; }
  if (d.wcancel) { if (doCmd('cancelOp', [d.wcancel])) toast(T('u.op_cancelled')); renderSide(); renderMap(); renderWarMap(); return true; }
  if (d.whalt) { if (doCmd('haltFront', [d.whalt])) toast(T('u.halted')); w.mode = null; renderSide(); renderMap(); openWarMap(); return true; }
  if (d.wpeace) { UI.afterClose = null; closeModal(); UI.sel = d.wpeace; UI.tab = 'target'; UI.cat = 'dip'; UI.open = { peace: true }; renderMap(); renderSide(); return true; }
  if (d.wgo) {
    const tg = w.T; if (!tg) return true; const p = { share: w.share, haste: w.haste, from: w.from }; if (w.focus != null) p.focus = w.focus;
    const r = W.queueAction(S, 'invade', tg, p);
    if (!r.ok) { toast(TX(r.reason)); return true; }
    toast(w.focus != null ? T('u.wm.go_q', { t: tg, x: W.cityName(tg, w.focus) }) : T('u.wm.go_q0', { t: tg }), 4000);
    renderTop(); renderQueue(); renderMap(); renderWarMap(); return true;
  }
  return false;
}
function wmChange(t) {
  const w = UI.wm; if (!w) return false;
  if (t.id === 'wmT') { w.T = t.value; w.focus = null; w.sel = null; const cs = CITIES[w.T] || []; const ci = cs.findIndex(c => c[4]); if (ci >= 0) w.focus = ci; renderWarMap(); return true; }
  if (t.id === 'wmCity') { w.focus = t.value === '' ? null : +t.value; w.sel = w.focus == null ? null : w.T + ':' + w.focus; renderWarMap(); return true; }
  if (t.id === 'wmFrom') { w.from = t.value; renderWarMap(); return true; }
  if (t.id === 'wmShare') { w.share = +t.value; renderWarMap(); return true; }
  if (t.id === 'wmHaste') { w.haste = +t.value; renderWarMap(); return true; }
  if (t.id === 'wmOpCity') { if (doCmd('setOpFocus', [t.dataset.op, t.value === '' ? null : +t.value])) toast(t.value === '' ? T('u.wm.focus_clr') : T('u.wm.focus_set', { x: W.cityName(w.T, +t.value) })); renderWarMap(); return true; }
  if (t.id === 'wmRf') { w.rf = +t.value; renderWarMap(); return true; }
  if (t.id === 'wmRfFrom') { w.rfFrom = t.value; renderWarMap(); return true; }
  return false;
}
