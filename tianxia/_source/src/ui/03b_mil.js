// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 v3 · 军事标签页、战况、核心利益危机 ===================== */
function milHTML() {
  const P = S.player, x = S.actors[P], u = W.unitsOf(S, P);
  const crisisTop = W.coreView(S).some(k => k.status === 'active') ? coreSecHTML() : '';
  const h = S.history, prev = h.length >= 2 ? h[h.length - 2] : null;
  const d = (k, now, fmt) => (prev && prev[k] !== undefined ? delta(prev[k], now, fmt) : '');
  const orders = x.orders || [], training = W.inTraining(S, P);
  const oSum = br => orders.filter(o => o.br === br).reduce((s, o) => s + W.procUnits(S, P, br, o.pts), 0);
  const card = (label, val, dl, note) => `<div class="stat oobc"><span>${label}</span><b>${val} ${dl}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  let s = crisisTop + `<div class="sec"><h3>${T('u.oob')} <span class="tag">${T('mob.' + x.mob)}</span></h3><div class="grid2 oob">
    ${card(T('u.u.pers'), persT(u.pers), d('pers', u.pers, v => persT(v)), training ? T('u.u.training', { n: { pers: training } }) : x.mob ? T('u.u.reserve', { n: { pers: u.pers * (W.MANP[x.mob] - 1) } }) : '')}
    ${card(T('u.u.tanks'), fmtN(u.tanks), d('tanks', u.tanks, fmtN), oSum('land') >= 1 ? T('u.u.ordered', { n: Math.round(oSum('land')) }) : '')}
    ${card(T('u.u.air'), fmtN(u.air), d('air', u.air, fmtN), oSum('air') >= 1 ? T('u.u.ordered', { n: Math.round(oSum('air')) }) : '')}
    ${card(T('u.u.ships'), fmtN(u.ships), d('ships', u.ships, fmtN), oSum('navy') >= 0.5 ? T('u.u.ordered', { n: Math.round(oSum('navy')) }) : '')}
    ${card(T('u.k.nukes'), fmtN(x.nukes), '', !x.nukes && x.nukeProg ? T('u.nukeprog', { n: Math.round(x.nukeProg) }) : '')}
    ${card(T('u.power'), fmtN(W.power(S, P)), d('mil', W.power(S, P), fmtN), T('u.u.eff', { l: fmtN(W.landEff(S, P)), n: fmtN(W.navyEff(S, P)), a: fmtN(W.airEff(S, P)) }))}
  </div><div class="grid2" style="margin-top:6px"><div><small class="muted">${T('u.u.pers')}</small>${spark('pers', '--accent')}</div><div><small class="muted">${T('u.power')}</small>${spark('mil', '--hostile')}</div></div></div>`;
  // 扩军
  s += `<div class="sec"><h3>${T('u.build')}</h3><div class="acts">${actionsHTML(W.ACTIONS.filter(a => a.cat === 'army' || a.id === 'mobilize'), P)}</div>`;
  if ((x.train || []).length || orders.length) s += `<div class="list pipe">${(x.train || []).map(t => `<div class="item"><div class="row"><span>${T('u.pipe.train', { n: { pers: t.n } })}</span><b class="num">${T('u.inN', { n: Math.max(1, t.eta - S.turn) })}</b></div></div>`).join('')}${orders.map(o => `<div class="item"><div class="row"><span>${T('u.pipe.order', { k: T('br.' + o.br), n: Math.round(W.procUnits(S, P, o.br, o.pts)), u: T('unit.' + o.br) })}</span><b class="num">${T('u.inN', { n: Math.max(1, o.eta - S.turn) })}</b></div></div>`).join('')}</div>`;
  s += `<p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.build_help')}</p></div>`;
  // 战线与行动
  const fr = S.fronts.filter(f => f.att === P || W.boss(S, f.target) === P || (f.co || []).some(k => k.id === P) || (f.coD || []).includes(P));
  s += `<div class="sec"><h3>${T('u.fronts')} <button class="mini" data-wmap="1">🗺 ${T('u.wm.open')}</button></h3>${fr.length ? '<div class="list">' + fr.map(f => frontHTML(f, true)).join('') + '</div>' : `<p class="muted">${T('u.nofronts')}</p>`}${W.enemies(S, P).length ? `<p style="font-size:12.5px;margin:6px 0 0">${T('u.enemies')}${W.enemies(S, P).map(e => `<a href="#" data-sel="${e}">${esc(NAME(e))}</a>`).join(sep())}</p>` : ''}</div>`;
  s += opsHTML();
  // 封锁
  const bl = S.blockades.filter(b => b.by !== P && (b.target === P || W.isAlly(S, P, b.target) || W.isPartner(S, P, b.target) || S.actors[P].forces[b.target]));
  if (bl.length) s += `<div class="sec"><h3>${T('u.blockades')}</h3><div class="list">${bl.map(b => { const st = W.actionStatus(S, 'escort', b.target, {}); return `<div class="item"><div class="row"><b>${T('u.blk_line', { a: b.by, t: b.target })}</b></div><div class="muted" style="font-size:12px">${esc(st.ok && st.preview ? TX(st.preview) : st.reason ? TX(st.reason) : '')}</div><div class="btns"><button data-queue="escort" data-t="${b.target}" ${st.ok ? '' : 'disabled'}>${T('a.escort')}</button></div></div>`; }).join('')}</div></div>`;
  s += deployHTML();
  s += alliedHTML();
  return s;
}
/* ---------- 部署与调动（按兵种） ---------- */
function deployHTML() {
  const P = S.player, x = S.actors[P];
  const rows = W.stations(S, P).sort((a, b) => (a === P ? -1 : b === P ? 1 : W.share(S, P, b) - W.share(S, P, a)));
  let s = `<div class="sec"><h3>${T('u.forces')}</h3>`;
  const home = W.shareV(S, P, P); if (home[0] < 0.3) s += `<div class="alert bad">${T('u.homeweak', { s: pct(home[0]) })}</div>`;
  s += `<div style="overflow-x:auto"><table class="rank ftab"><tr><th>${T('u.loc')}</th><th>${T('br.land')}</th><th>${T('br.navy')}</th><th>${T('br.air')}</th><th>${T('u.committed')}</th><th></th></tr>${rows.map(L => { const v = W.shareV(S, P, L), c = W.committedV(S, P, L), uu = W.unitsV(S, P, v); const fq = W.freeQV(S, L); return `<tr class="${L === P ? 'me' : ''}"><td data-sel="${L}">${esc(NAME(L))}</td><td>${pct(v[0])}<small>${persT(uu.pers)}</small></td><td>${pct(v[1])}<small>${fmtN(uu.ships)}</small></td><td>${pct(v[2])}<small>${fmtN(uu.air)}</small></td><td>${W.vmax(c) > 0.004 ? pct(W.dotw(S, P, c)) : '—'}</td><td>${L !== P && W.vmax(fq) > 0.004 ? `<button class="mini" data-recall="${L}">${T('u.recall')}</button>` : ''}</td></tr>`; }).join('')}</table></div>`;
  if (x.moves.length) s += `<div style="font-size:12.5px;margin-top:6px">${T('u.transit')}${x.moves.map(m => T('u.mv', { f: m.from, l: m.to, s: pct(W.dotw(S, P, m.v)), n: Math.max(1, m.eta - S.turn) })).join(sep())}</div>`;
  // 调兵表单：按兵种选择比例
  const mv = UI.move; const froms = rows.filter(L => W.vmax(W.freeQV(S, L)) > 0.004);
  if (!froms.includes(mv.from)) mv.from = froms[0];
  const dests = IDS.filter(L => L !== mv.from && W.canStation(S, P, L)).sort((a, b) => W.dist(mv.from || P, a) - W.dist(mv.from || P, b));
  if (!dests.includes(mv.to)) mv.to = dests.find(L => L !== P) || dests[0];
  if (!Array.isArray(mv.f)) mv.f = [0.25, 0, 0.25];
  if (froms.length && dests.length) {
    const free = W.freeQV(S, mv.from); const v = free.map((z, b) => z * (mv.f[b] || 0));
    const st = W.deployStatus(S, mv.from, mv.to, v); const uu = W.unitsV(S, P, v);
    const fr = [0, 0.1, 0.25, 0.5, 0.75, 1];
    const sel = b => `<label>${T('br.' + ['land', 'navy', 'air'][b])}<select data-mvf="${b}">${fr.map(f => `<option value="${f}" ${Math.abs(f - (mv.f[b] || 0)) < 1e-6 ? 'selected' : ''}>${f === 1 ? T('u.all') : pct(f)}</option>`).join('')}</select><small class="muted">${T('u.of_free', { s: pct(free[b], 1) })}</small></label>`;
    s += `<div class="movebox"><b>${T('u.deploy')}</b><div class="mvrow"><label>${T('u.from')}<select id="mvFrom">${froms.map(L => `<option value="${L}" ${L === mv.from ? 'selected' : ''}>${esc(NAME(L))}</option>`).join('')}</select></label>
      <label>${T('u.to')}<select id="mvTo">${dests.map(L => `<option value="${L}" ${L === mv.to ? 'selected' : ''}>${esc(NAME(L))}${L === P ? ' ★' : ''}</option>`).join('')}</select></label></div>
      <div class="mvrow">${sel(0)}${sel(1)}${sel(2)}</div>
      <div class="muted" style="font-size:12px">${W.vmax(v) > 0.004 ? T('u.mv_units', { x: { raw: unitTxt(uu) } }) + ' · ' : ''}${st.ok ? T('u.eta', { n: st.eta }) : esc(TX(st.reason))}${coreWarnFor(mv.to)}</div><button class="btn-primary" id="mvGo" ${st.ok ? '' : 'disabled'}>${T('u.deploy_go')}</button></div>`;
  }
  s += `<p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.forces_help')}</p>`;
  return s + '</div>';
}
function coreWarnFor(L) { const P = S.player; const who = W.coreList().filter(c => c.type === 'forces_in' && c.o !== P && W.indep(S, c.o) && !W.isAlly(S, c.o, P) && [].concat(c.loc).includes(L)).map(c => c.o); return who.length ? `<br><b class="bad">${T('u.core_warn', { x: { list: who.map(id => ({ id })) }, l: L })}</b>` : ''; }
/* ---------- 盟军 ---------- */
function alliedHTML() {
  const P = S.player; const rows = [];
  for (const c of IDS) {
    if (c === P || !W.indep(S, c)) continue;
    for (const L of W.stations(S, c)) { if (L === c) continue; if (L === P || W.boss(S, L) === P || (S.actors[P].forces[L] && (W.isAlly(S, c, P) || W.isPartner(S, c, P)))) rows.push({ c, L, u: W.unitsV(S, c, W.shareV(S, c, L)) }); }
  }
  const co = []; for (const f of S.fronts) if (f.att === P) for (const k of (f.co || [])) co.push({ f, k, u: W.unitsV(S, k.id, k.v) });
  const allies = IDS.filter(Y => Y !== P && W.indep(S, Y) && (W.isAlly(S, P, Y) || W.isPartner(S, P, Y) || S.actors[Y].overlord === P || W.rel(S, P, Y) >= 45)).sort((a, b) => W.power(S, b) - W.power(S, a));
  let s = `<div class="sec"><h3>${T('u.allied')}</h3>`;
  if (co.length) s += `<div class="list">${co.map(z => `<div class="item"><div class="row"><b>${esc(NAME(z.k.id))}</b><span class="tag blue">${T('u.co_front', { t: z.f.target })}</span></div><div class="muted" style="font-size:12px">${esc(unitTxt(z.u))}</div></div>`).join('')}</div>`;
  if (rows.length) s += `<div class="list" style="margin-top:6px">${rows.map(r => `<div class="item"><div class="row"><b>${esc(NAME(r.c))}</b><span class="muted">${T('u.at_loc', { l: r.L })}</span></div><div class="muted" style="font-size:12px">${esc(unitTxt(r.u))}</div></div>`).join('')}</div>`;
  if (!co.length && !rows.length) s += `<p class="muted" style="font-size:12.5px">${T('u.no_allied')}</p>`;
  const progs = (S.programs || []).filter(p => p.from === P);
  if (progs.length) s += `<div style="margin-top:8px"><b style="font-size:12.5px">${T('u.programs')}</b><div class="list" style="margin-top:4px">${progs.map(p => `<div class="item"><div class="row"><span style="font-size:12.5px">${T('u.prog_line', { k: T('st.k.' + p.kind), t: p.to, m: { m: p.amount }, n: p.until - S.turn + 1 })}</span><button class="mini" data-progcancel="${p.id}">${T('u.prog_cancel')}</button></div></div>`).join('')}</div></div>`;
  if (allies.length) {
    if (!allies.includes(UI.rqAlly)) UI.rqAlly = allies[0];
    s += `<div class="movebox"><b>${T('u.ask_allies')}</b><div class="mvrow"><label>${T('u.ally')}<select id="rqAlly">${allies.map(Y => `<option value="${Y}" ${Y === UI.rqAlly ? 'selected' : ''}>${esc(NAME(Y))}${W.isAlly(S, P, Y) ? ' ★' : ''}</option>`).join('')}</select></label></div><div class="acts">${actionsHTML([W.ACT.reqtroops, W.ACT.reqmob], UI.rqAlly)}</div></div>`;
  } else s += `<p class="muted" style="font-size:12px">${T('u.no_allies')}</p>`;
  return s + '</div>';
}

/* ---------- 战况详情 ---------- */
function openWar(id, snap) {
  const f = S.fronts.find(z => z.id === id) || snap; if (!f) { toast(T('u.war_over')); return; }
  showModal(warHTML(f, !S.fronts.includes(f)), 'war', true);
}
function warHTML(f, ended) {
  const P = S.player, X = f.att, Tg = f.target, D = W.boss(S, Tg), mine = X === P;
  const phases = f.kind === 'amph' ? ['sea', 'landing', 'land'] : ['land'];
  const pi = phases.indexOf(f.phase);
  const A = W.unitsV(S, X, f.v); const coU = (f.co || []).map(k => ({ id: k.id, u: W.unitsV(S, k.id, k.v) }));
  const def = ended ? { who: [], src: [], force: f.D || 0 } : W.defenseAt(S, Tg, X);
  const dRows = []; for (const c of def.who) { let v = [0, 0, 0]; for (const [cc, L, k] of def.src) if (cc === c) v = W.vadd(v, W.vmul(W.freeV(S, c, L), k)); dRows.push({ id: c, u: W.unitsV(S, c, v) }); }
  const sum = arr => arr.reduce((z, r) => ({ pers: z.pers + r.u.pers, tanks: z.tanks + r.u.tanks, air: z.air + r.u.air, ships: z.ships + r.u.ships }), { pers: 0, tanks: 0, air: 0, ships: 0 });
  const At = sum([{ u: A }].concat(coU)), Dt = sum(dRows);
  const bar = (a, b) => { const t = a + b || 1; return `<div class="vs"><i style="width:${(a / t * 100).toFixed(1)}%"></i></div>`; };
  const row = (lbl, a, b, fmt) => `<tr><td>${lbl}</td><td class="num">${fmt(a)}</td><td>${bar(a, b)}</td><td class="num">${fmt(b)}</td></tr>`;
  const ratio = f.phase === 'sea' ? f.seaRatio : f.ratio;
  let h = `<div class="warroom"><div class="kicker">${T('u.warroom')}${ended ? ' · ' + T('u.war_over') : ''}</div><h2>${esc(NAME(X))} → ${esc(NAME(Tg))}</h2>
    <p class="sub">${T('kind.' + f.kind)} · ${T('u.turnN', { n: f.turns })} · ${T('u.war_def', { a: D })}${(f.co || []).length ? ' · ' + T('u.with_co', { x: { list: f.co.map(k => ({ id: k.id })) } }) : ''}${(f.coD || []).length ? ' · ' + T('u.co_def', { x: { list: f.coD.map(c => ({ id: c })) } }) : ''}</p>
    <div class="phases">${phases.map((p, i) => `<span class="${i < pi ? 'done' : i === pi ? 'cur' : ''}">${T('ph.' + p)}${i === pi ? (p === 'sea' ? ' ' + Math.round(Math.max(0, f.sp)) + '%' : p === 'land' ? ' ' + Math.round(f.progress) + '%' : '') : ''}</span>`).join('<b>›</b>')}</div>
    <div class="prog ${mine ? 'mine' : ''} ph-${f.phase}" style="margin:8px 0"><div style="width:${f.phase === 'land' ? Math.max(0, f.progress) : f.phase === 'sea' ? Math.max(0, f.sp) * 0.15 : 18}%"></div></div>
    <h3>${T('u.balance')} <span class="tag ${ratio >= 1.2 ? 'blue' : ratio < 0.9 ? 'red' : ''}">${T('u.ratio_is', { r: ratio ? ratio.toFixed(2) : '—' })}</span></h3>
    <table class="rank vstab"><tr><th></th><th>${esc(NAME(X))}${coU.length ? '+' : ''}</th><th></th><th>${esc(NAME(D))}${dRows.length > 1 ? '+' : ''}</th></tr>
      ${row(T('u.u.pers'), At.pers, Dt.pers, persT)}${row(T('u.u.tanks'), At.tanks, Dt.tanks, fmtN)}${row(T('u.u.air'), At.air, Dt.air, fmtN)}${f.kind === 'amph' ? row(T('u.u.ships'), At.ships, Dt.ships, fmtN) : ''}
      ${row(T('u.combat'), f.A || W.groundV(S, X, f.v), f.D || def.force, fmtN)}</table>
    <div class="muted" style="font-size:12px">${T('u.war_mods', { t: +W.DEF[Tg].terr.toFixed(2), n: W.minTurns(Tg) })}${!ended && W.indep(S, Tg) ? ' · ' + T('u.war_guard', { n: fmtN(W.homeGuard(S, Tg)) }) : ''}</div>`;
  const ca = f.cas ? f.cas.a : [0, 0, 0, 0], cd = f.cas ? f.cas.d : [0, 0, 0, 0];
  h += `<h3>${T('u.casualties')}</h3><table class="rank vstab"><tr><th></th><th>${esc(NAME(X))}</th><th></th><th>${esc(NAME(D))}</th></tr>${row(T('u.u.pers'), ca[0], cd[0], persT)}${row(T('u.u.tanks'), ca[1], cd[1], fmtN)}${row(T('u.u.air'), ca[2], cd[2], fmtN)}${ca[3] + cd[3] >= 1 ? row(T('u.u.ships'), ca[3], cd[3], fmtN) : ''}</table>`;
  if ((f.obj || []).length) {
    const next = f.obj.find(([i]) => !(f.taken || []).includes(i));
    h += `<h3>${T('u.objectives')}</h3><div class="objs">${f.obj.map(([i, thr]) => { const c = CITIES[Tg][i]; const tk = (f.taken || []).includes(i); return `<span class="obj ${tk ? 'taken' : next && next[0] === i ? 'next' : ''}">${c[4] ? '★' : ''}${esc(EN() ? c[1] : c[0])}<small>${thr}%</small></span>`; }).join('')}</div>`;
  }
  if ((f.log || []).length) h += `<h3>${T('u.warlog')}</h3><div class="feed wlog">${f.log.slice().reverse().map(e => `<div class="f"><small>${dateStr(S, e.t)}</small>${esc(warLine(f, e))}</div>`).join('')}</div>`;
  if (mine && !ended) {
    const free = W.freeV(S, P, f.from); const opts = b => { const cur = f.tv ? f.tv[b] : f.v[b]; const max = f.v[b] + free[b]; const vals = [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8].filter(v => v <= max + 1e-6).concat([cur]).sort((a, c) => a - c).filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 0.004); return vals.map(v => `<option value="${v}" ${Math.abs(v - cur) < 0.004 ? 'selected' : ''}>${pct(v)}</option>`).join(''); };
    h += `<h3>${T('u.commit')}</h3><div class="mvrow">${[0, 1, 2].filter(b => b !== 1 || f.kind === 'amph').map(b => `<label>${T('br.' + ['land', 'navy', 'air'][b])}<select data-fv="${f.id}" data-b="${b}">${opts(b)}</select></label>`).join('')}</div><div class="muted" style="font-size:12px">${T('u.commit_help', { l: f.from })}</div>`;
  }
  h += `<div class="foot">${!ended ? `<button data-wmap="${f.id}">🗺 ${T('u.wm.open')}</button>` : ''}${mine && !ended ? `<button data-halt="${f.id}">${T('u.halt')}</button>` : ''}${!ended && (mine || D === P) ? `<button data-askfront="${f.id}">${T('u.ask_help')}</button>` : ''}<button class="btn-primary" data-close="1">${T('u.close')}</button></div></div>`;
  return h;
}
function warLine(f, e) {
  const parts = [];
  if (e.ph === 'sea') parts.push(T('u.wl.sea', { d: e.d >= 0 ? '+' + Math.round(e.d) : Math.round(e.d), p: Math.round(Math.max(0, e.p)), r: (e.r || 0).toFixed(2) }));
  else if (e.ph === 'landing') parts.push(T(e.ev === 'beach_ok' ? 'u.wl.beach_ok' : e.ev === 'beach_fail' ? 'u.wl.beach_fail' : 'u.wl.beach_rep', { r: (e.r || 0).toFixed(2) }));
  else parts.push(T('u.wl.land', { d: (e.d >= 0 ? '+' : '') + (e.d || 0).toFixed(1), p: Math.round(e.p || 0), r: (e.r || 0).toFixed(2) }));
  if (e.cap && e.cap.length) parts.push(T('u.fr_cap', { x: { list: e.cap.map(i => W.cityName(f.target, i)) } }));
  if (e.lost && e.lost.length) parts.push(T('u.fr_lost', { x: { list: e.lost.map(i => W.cityName(f.target, i)) } }));
  if (e.la) parts.push(T('u.wl.loss', { a: { pers: e.la[0] }, t: e.la[1], f: e.la[2], s: e.la[3], b: { pers: e.ld[0] }, u: e.ld[1], g: e.ld[2], h: e.ld[3] }));
  return parts.join(' · ');
}

/* ---------- 核心利益 ---------- */
function knowsMind(X) { return W.intelOf(S, S.player) >= W.intelOf(S, X) - 15; }
function coreDossierHTML(X) {
  const list = W.coreOfActor(S, X); if (!list.length) return '';
  return `<div style="margin-top:8px"><b style="font-size:12.5px">${T('u.core')}</b><ul class="rl core">${list.map(c => `<li class="${c.active ? 'bad' : ''}"><span class="stars">${'★'.repeat(c.w)}</span>${esc(TX(W.coreInterest(c)))}${c.active ? ` · ${T('u.core.lv', { k: T('lv.' + W.CORE_LV[c.active.lvl]) })}` : ''}</li>`).join('')}</ul></div>`;
}
const cstepLab = (side, lvl) => T(side === 'own' ? (lvl ? 'lv.s' + lvl : 'u.cs.standdown') : 'lv.r' + lvl);
function coreCardHTML(k) {
  const P = S.player, side = k.o === P ? 'own' : k.v === P ? 'resp' : null, act = k.status === 'active';
  const q = S.queue.find(z => z.type === 'core' && z.k === k.id);
  const seg = (i, lab, click, dis, extra) => click ? `<button class="${extra || ''}" data-cstep="${k.id}" data-lv="${i}" ${dis ? 'disabled' : ''}>${lab}</button>` : `<span class="${extra || ''}">${lab}</span>`;
  const steps = [1, 2, 3, 4].map(i => seg(i, T('lv.s' + i), side === 'own' && act, i < k.lvl, `${k.lvl >= i ? 'on' : ''} ${k.lvl === i && act ? 'cur' : ''} ${q && side === 'own' && q.lvl === i ? 'q' : ''}`)).join('');
  const last = k.hist[k.hist.length - 1]; const ulti = S.ultis.find(u => u.core === k.id && u.status === 'open');
  const why = last && last.why && last.why.length && side !== 'own' ? (knowsMind(k.o) || last.src !== 'llm' ? last.why.map(TX).join(EN() ? '; ' : '；') : T('u.core.noint')) : '';
  const c = k.calc;
  const head = side === 'own' ? `<b><a href="#" data-sel="${k.v}">${esc(NAME(k.v))}</a></b>` : `<b><a href="#" data-sel="${k.o}">${esc(NAME(k.o))}</a></b>`;
  let h = `<div class="item corecard ${k.status} ${side || ''}"><div class="row">${head}<span class="tag ${act ? 'red' : ''}">${T('u.core.st.' + k.status)}</span></div>
    <div style="font-size:12.5px;margin-top:2px">${side === 'own' ? T('u.cs.mine_about', { a: k.v, x: k.interest }) : T('u.core.about', { x: k.interest })}</div>
    <div class="lrow"><small class="muted">${T(side === 'own' && act ? 'u.cs.your_ladder' : 'u.cs.their_ladder')}</small><div class="ladder ${side === 'own' && act ? 'click' : ''}">${steps}</div></div>`;
  if (side === 'resp' && act) {
    const pl = k.plv || 0;
    h += `<div class="lrow"><small class="muted">${T('u.cs.your_resp')}</small><div class="ladder click resp">${[0, 1, 2, 3, 4].map(i => seg(i, T('lv.r' + i), true, false, `${i === 0 ? 'yield' : ''} ${i > 0 && pl >= i ? 'on' : ''} ${q && q.lvl === i ? 'q' : ''}`)).join('')}</div></div>`;
  }
  if (last && last.st && side !== 'own') h += `<q>${esc(TX(last.st))}</q>`;
  if (last && last.ops && last.ops.length) h += `<div class="muted" style="font-size:12px">${side === 'own' ? T('u.cs.last_you', { x: { raw: last.ops.map(TX).join(sep()) } }) : esc(last.ops.map(TX).join(sep()))}</div>`;
  if (side === 'resp' && k.phist && k.phist.length) { const z = k.phist[k.phist.length - 1]; h += `<div class="muted" style="font-size:12px">${T('u.cs.last_you', { x: { raw: z.ops.map(TX).join(sep()) || T('lv.r' + z.lvl) } })}</div>`; }
  if (why) h += `<div class="why">${last.src === 'llm' ? '<b>CLAUDE</b> ' : ''}${T('u.core.why')}${esc(why)}</div>`;
  if (act && side === 'resp') h += `<div class="muted" style="font-size:12px">${T('u.core.next', { n: Math.max(0, k.due - S.turn) })}${c ? ' · ' + T('u.core.calc', { r: c.ratio.toFixed(1), n: Math.round(c.nukeRisk * 100) }) : ''}</div>`;
  if (act && side === 'own' && k.dl && k.dl >= S.turn) h += `<div class="muted" style="font-size:12px">${T('u.cs.dl', { n: k.dl - S.turn })}</div>`;
  if (q) h += `<div class="qnote">${T('u.cs.queued', { k: cstepLab(side, q.lvl) })}</div>`;
  if (act && side === 'resp') h += `<div class="btns">${ulti ? `<button data-ulti="${ulti.id}" data-ans="accept">${T('u.comply')}${colonT()}${esc(TX({ k: 'ud.' + ulti.demand, p: { l: ulti.loc, b: ulti.with, t: ulti.t } }))}</button>` : ''}<button data-chat="${k.o}">${T('u.negotiate')}</button></div>`;
  if (act && side === 'own') h += `<div class="btns"><button data-cstep="${k.id}" data-lv="0">${T('u.cs.standdown')}</button><button data-chat="${k.v}">${T('u.negotiate')}</button></div>`;
  return h + '</div>';
}
function coreSecHTML() {
  const list = W.coreView(S).filter(k => k.status === 'active' || k.end >= S.turn - 2);
  if (!list.length) return '';
  return `<div class="sec"><h3>${T('u.core_crises')} <span class="tag red">${list.filter(k => k.status === 'active').length}</span></h3><div class="list">${list.map(coreCardHTML).join('')}</div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.core_help')} ${T('u.core_help2')}</p></div>`;
}

/* ---------- 核心利益阶梯：确认面板 ---------- */
function openCoreStep(id, lvl) {
  const p = W.corePlan(S, id, lvl); if (!p.ok) { toast(TX(p.reason)); return; }
  const lab = cstepLab(p.side, p.lvl);
  const title = p.side === 'own' && p.lvl === 0 ? T('u.cs.standdown') : T(p.side === 'own' ? 'u.cs.own_title' : 'u.cs.resp_title', { t: p.Y, k: lab });
  showModal(`<div class="corestep"><div class="kicker">${T('u.core_crises')}</div><h2>${esc(title)}</h2><p class="sub">${esc(TX(p.interest))}</p>
    <h3>${T('u.cs.ops')}</h3><ul class="lines-ul">${p.ops.map(m => `<li>${esc(TX(m))}</li>`).join('')}</ul>
    ${p.risk.length ? `<h3>${T('u.cs.risk')}</h3><ul class="lines-ul risk">${p.risk.map(m => `<li>${esc(TX(m))}</li>`).join('')}</ul>` : ''}
    <div class="foot"><span class="muted" style="font-size:12px;margin-right:auto">${p.instant ? T('u.cs.free') : T('u.cs.ap', { n: p.ap })}</span><button data-close="1">${T('u.cancel')}</button><button class="btn-primary ${p.lvl >= 3 ? 'danger' : ''}" id="csGo">${p.instant ? T('u.cs.now') : p.queued !== null ? T('u.cs.replace') : T('u.cs.go')}</button></div></div>`, 'narrow', true);
  $('#csGo').onclick = () => {
    if (p.instant) { const m = doCmd('coreBackDown', [id]); closeModal(); if (m) toast(TX(m), 4000); renderAll(); autosave(); return; }
    const r = W.queueCore(S, id, p.lvl); if (!r.ok) { toast(TX(r.reason)); return; }
    closeModal(); toast(T('u.cs.queued_ok', { k: lab })); renderTop(); renderSide(); renderQueue();
  };
}
