// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 界面层 v2 · 顶栏与侧栏 ===================== */
function renderTop() {
  if (!S) return;
  const P = S.player, x = S.actors[P], h = W.hegemony(S); const prev = S.history[S.history.length - 2];
  $('#dateLine').textContent = `${dateStr(S)} · ${T('u.turn', { n: S.turn + 1 })}`;
  $('#meChip').innerHTML = `<i class="sw" style="background:${css('--accent')}"></i><b>${esc(NAME(P))}</b>`;
  const goal = S.goal === 'unify' ? `<div class="kpi heg"><span>${T('u.k.unify')}</span><b>${h.units}/${IDS.length}</b><div class="meter"><div style="width:${h.unify * 100}%"></div></div></div>`
    : `<div class="kpi heg"><span>${T('u.k.heg')}${S.heg ? ' · ' + S.heg + '/4' : ''}</span><b>${Math.round(h.prog * 100)}%</b><div class="meter"><div style="width:${h.prog * 100}%"></div></div></div>`;
  $('#kpis').innerHTML = `
    <div class="kpi"><span>GDP</span><b>${fmtB(x.gdp)}${prev ? delta(prev.gdp, x.gdp, v => fmtB(v)) : ''}</b></div>
    <div class="kpi"><span>${T('u.k.growth')}</span><b class="${x.lastG < 0 ? 'bad' : ''}">${(x.lastG * 4).toFixed(1)}%</b></div>
    <div class="kpi"><span>${T('u.power')}</span><b>${fmtN(W.power(S, P))}</b></div>
    <div class="kpi"><span>${T('u.stab')}</span><b class="${x.stab < 30 ? 'bad' : ''}">${Math.round(x.stab)}</b></div>
    <div class="kpi"><span>${T('u.k.pub')}</span><b class="${S.pol.fac.pub < 35 ? 'bad' : ''}">${Math.round(S.pol.fac.pub)}</b></div>
    <div class="kpi"><span>${T('u.k.treasury')}</span><b class="${x.treasury < 0 ? 'bad' : ''}">${fmtB(x.treasury - W.moneyQueued(S))}</b></div>
    ${x.nukes ? `<div class="kpi"><span>${T('u.k.nukes')}</span><b>${fmtN(x.nukes)}</b></div>` : ''}
    ${goal}`;
  const mx = W.apMax(S), left = W.apLeft(S);
  $('#apBox').innerHTML = apBoxHTML(left, mx);
  const eng = $('#engineBadge'); const on = useLLM();
  eng.className = 'engine ' + (on ? 'on' : 'off'); eng.textContent = on ? T('u.eng.on') : LLM.state === 'pending' ? T('u.eng.pending') : T('u.eng.off');
  eng.title = on ? T('u.eng.on_t') : T('u.eng.off_t');
  if (window.TX_MP && typeof mpRenderBar === 'function') mpRenderBar();
}

/* 顶栏的行动点：圆点（网页版 v3 换成百分比的行动力条，见 src/web3） */
function apBoxHTML(left, mx) { return `<span class="aplbl">${T('u.ap', { n: left, d: mx })}</span><span class="pips">` + Array.from({ length: mx }, (_, i) => `<i class="pip${i < left ? ' on' : ''}"></i>`).join('') + '</span>'; }
/* ---------- 侧栏 ---------- */
function renderSide() {
  if (!S) return;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const pend = S.inbox.length + S.ultis.filter(u => u.status === 'open').length + S.crises.filter(c => !c.resolved).length + (S.coreC || []).filter(k => k.v === S.player && k.status === 'active').length;
  $('#inboxDot').hidden = !pend;
  const intelNew = S.intelLog.some(i => i.turn >= S.turn - 1);
  $('#intelDot').hidden = !intelNew;
  const body = $('#tabbody'); const key = UI.tab + '|' + UI.sel; const st = key === UI.sideKey ? body.scrollTop : 0; UI.sideKey = key;
  const ext = window.TX_MP && typeof mpTabHTML === 'function' ? mpTabHTML(UI.tab) : null;
  if (ext !== null && UI.extHTML === ext && UI.extKey === key) { body.scrollTop = st; return; } // 联机版：内容没变就不重绘（保留正在填写的表单与焦点）
  const keep = ext !== null && typeof mpKeepForm === 'function' ? mpKeepForm(body) : null;
  body.innerHTML = ext !== null ? ext : UI.tab === 'target' ? targetHTML() : UI.tab === 'home' ? homeHTML() : UI.tab === 'mil' ? milHTML() : UI.tab === 'diplo' ? diploHTML() : intelHTML();
  UI.extHTML = ext; UI.extKey = key; if (keep) keep();
  if (UI.tab === 'home' || UI.tab === 'mil') drawSparks();
  const md = $('#milDot'); if (md) md.hidden = !S.fronts.some(f => f.att === S.player || W.boss(S, f.target) === S.player) && !S.blockades.some(b => b.target === S.player);
  const cd = (S.coreC || []).some(k => k.v === S.player && k.status === 'active'); if (cd) $('#inboxDot').hidden = false;
  if (UI.tab === 'diplo') { const c = $('#chatlog'); if (c) c.scrollTop = c.scrollHeight; }
  body.scrollTop = st;
}
function spark(key, color) { return `<svg class="spark" data-k="${key}" data-c="${color}" viewBox="0 0 200 34" preserveAspectRatio="none"></svg>`; }
function drawSparks() {
  $$('svg.spark').forEach(s => {
    const k = s.dataset.k, col = css(s.dataset.c); const v = S.history.map(h => h[k]).filter(v => v !== undefined); if (v.length < 2) { s.innerHTML = `<text x="0" y="22" font-size="11" fill="${css('--muted')}">${esc(T('u.spark_wait'))}</text>`; return; }
    const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1; const pts = v.map((y, i) => [i / (v.length - 1) * 196 + 2, 30 - (y - mn) / rg * 26]);
    const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    s.innerHTML = `<path d="${d}L198 32L2 32Z" fill="${col}" fill-opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.4" fill="${col}"/>`;
  });
}
function tagsFor(id) {
  const x = S.actors[id], d = DEF[id], t = [];
  if (!W.provOf(S, id) && !W.shielded(S, id)) t.push(`<span class="tag">${T('gov.' + d.gov)}</span>`); // 永久领土没有自己的政体；按中国标准处理的国家不显示政体标签
  if (x.nukes > 0) t.push(`<span class="tag red">${T('u.tag.nuclear')}</span>`);
  for (const b of Object.values(S.blocs)) if (b.members.includes(id)) t.push(`<span class="tag blue">${T('bloc.' + b.id)}</span>`);
  for (const e of W.econBlocs(id)) t.push(`<span class="tag">${esc(I18N.has('econ.' + e) ? T('econ.' + e) : e)}</span>`);
  if (x.ctrl !== id) t.push(x.integrated ? `<span class="tag">${T('u.st.part', { b: x.ctrl })}</span>` : `<span class="tag red">${T('u.st.occ', { b: x.ctrl })} · ${T('u.resist')} ${Math.round(x.resist)}</span>`);
  if (x.overlord) t.push(`<span class="tag acc">${T('u.st.vassal', { b: x.overlord })}</span>`);
  if (W.isGuarded(S, id)) t.push(`<span class="tag acc">${T('u.tag.guard')}</span>`);
  if (W.enemies(S, id).length) t.push(`<span class="tag red">${T('u.tag.war')}${W.enemies(S, id).map(NAME).join(sep())}</span>`);
  return t.join('');
}
function dossierStats(id) {
  const x = S.actors[id], d = DEF[id];
  return `<div class="grid2">
    <div class="stat"><span>GDP</span><b>${fmtB(x.gdp)}</b></div><div class="stat"><span>${T('u.k.growth')}</span><b class="${x.lastG < 0 ? 'bad' : ''}">${(x.lastG * 4).toFixed(1)}%</b></div>
    <div class="stat"><span>${T('u.pop')}</span><b>${T('u.popv', { n: d.pop >= 100 ? Math.round(d.pop) : d.pop })}</b></div><div class="stat"><span>${T('u.stab')}</span><b>${Math.round(x.stab)}</b></div>
    <div class="stat"><span>${T('u.power')}</span><b>${fmtN(W.power(S, id))}</b></div><div class="stat"><span>${T('u.k.nukes')}</span><b>${fmtN(x.nukes)}${!x.nukes && x.nukeProg ? ` <small class="warn">${T('u.nukeprog', { n: Math.round(x.nukeProg) })}</small>` : ''}</b></div>
    <div class="stat"><span>${T('u.land')}</span><b>${fmtN(W.landEff(S, id))}</b></div><div class="stat"><span>${T('u.navy')}</span><b>${fmtN(W.navyEff(S, id))}</b></div>
    <div class="stat"><span>${T('u.air')}</span><b>${fmtN(W.airEff(S, id))}</b></div><div class="stat"><span>${T('u.tech')}</span><b>${x.tech.toFixed(0)}</b></div>
    <div class="stat"><span>${T('u.milpct')}</span><b>${x.milPct.toFixed(1)}%</b></div><div class="stat"><span>${T('u.intel')}</span><b>${Math.round(W.intelOf(S, id))}</b></div>
  </div>`;
}
function memHTML(list) {
  if (!list.length) return `<p class="muted" style="font-size:12.5px">${T('u.mem.none')}</p>`;
  return `<div class="mem">${list.slice(0, 8).map(m => `<div class="${m.w < 0 ? 'bad' : 'good'}"><small>${dateStr(S, m.t)}</small>${esc(TX(m.msg))}<b class="num">${m.w > 0 ? '+' : ''}${Math.round(m.w)}</b></div>`).join('')}</div>`;
}
function targetHTML() {
  const P = S.player; const id = UI.sel;
  if (!id) return `<div class="sec"><p class="muted">${T('u.hint.select')}</p><p class="muted">${T('u.hint.cmd')}</p></div>` + threatTop();
  const x = S.actors[id], d = DEF[id], b = W.boss(S, id);
  let h = `<div class="dossier-h"><div class="sw" style="background:${polColor(W.provOf(S, id) || id)}">${id}</div><div style="min-width:0"><h2>${esc(NAME(id))}</h2><div class="tags">${tagsFor(id)}</div></div></div>`;
  if (W.isGuarded(S, id)) h += `<div class="sec"><div class="alert">${T('u.guard_x', { t: id, n: W.GCAP })}</div></div>`; // 联机网页版：1939 年开局的中国不会战败
  if (id === P) return h + `<div class="sec">${dossierStats(id)}</div><div class="sec"><p class="muted">${T('u.hint.self')}</p><button class="btn-primary" data-go="home">${T('u.open_home')}</button></div>`;
  if (W.provOf(S, id)) { const o = W.provOf(S, id); return h + `<div class="sec"><div class="alert">${T('u.prov_x', { t: id, b: { id: o } })}</div><div style="margin-top:8px"><button class="btn-primary" data-sel="${o}">${T('u.prov_go', { b: { id: o } })}</button></div></div><div class="sec"><div class="grid2"><div class="stat"><span>GDP</span><b>${fmtB(x.gdp)}</b></div><div class="stat"><span>${T('u.k.growth')}</span><b>${(x.lastG * 4).toFixed(1)}%</b></div><div class="stat"><span>${T('u.pop')}</span><b>${T('u.popv', { n: d.pop >= 100 ? Math.round(d.pop) : d.pop })}</b></div></div></div>`; } // 永久领土（台湾）：属于中国，只看不动
  if (W.isNeutral(S, id)) return h + `<div class="sec"><div class="alert">${T('u.neutral_x', { t: id })}</div></div><div class="sec">${dossierStats(id)}</div>`; // 中立地区：只看不动
  const r = W.rel(S, b, P), [rw, rc] = relWord(r, W.atWar(S, b, P)), ds = W.dossier(S, b);
  const tr = W.treatiesOf(S, P, id).map(t => T('tr.' + t.type));
  const sanc = S.sanctions.filter(s => (s.from === P && s.to === id) || (s.to === P && s.from === id)).map(s => `${s.from === P ? T('u.san.out') : T('u.san.in')}${s.kind === 'econ' ? T('sl.' + s.level) : T('sk.' + s.kind)}`);
  const ratio = (W.power(S, P) + 1) / (W.power(S, id) + 1);
  h += `<div class="sec"><h3>${T('u.relation')} <span class="stance s-${rc}">${T(rw)} ${Math.round(r)}</span></h3>
    <div class="relbar"><i style="left:${(r + 100) / 2}%"></i></div>
    <div class="grid2" style="margin-top:8px">
      <div class="stat"><span>${T('u.threatp')}</span><b class="${threatCls(ds.threat)}">${Math.round(ds.threat)}</b></div><div class="stat"><span>${T('u.grudge')}</span><b>${Math.round(ds.grudge)} / ${Math.round(ds.favor)}</b></div>
      <div class="stat"><span>${T('u.myinfl')}</span><b>${Math.round(W.infl(S, P, id))}</b></div><div class="stat"><span>${T('u.theirinfl')}</span><b>${Math.round(W.infl(S, id, P))}</b></div>
      <div class="stat"><span>${T('u.theirdep')}</span><b>${pct(W.exposure(S, id, P))}</b></div><div class="stat"><span>${T('u.mydep')}</span><b>${pct(W.exposure(S, P, id))}</b></div>
      <div class="stat"><span>${T('u.ratio')}</span><b>${ratio >= 1 ? ratio.toFixed(1) + ':1' : '1:' + (1 / ratio).toFixed(1)}</b></div><div class="stat"><span>${T('u.dist')}</span><b>${W.landAdj(P, id) ? T('u.border') : fmtN(W.dist(P, id)) + ' km'}</b></div>
    </div>
    <div style="margin-top:8px;font-size:12.5px">${T('u.treaties')}${tr.length ? tr.join(sep()) : `<span class="muted">${T('u.none')}</span>`}${sanc.length ? `<br>${T('u.sanctions')}${sanc.join(sep())}` : ''}
    ${ds.commits.length ? `<br>${T('u.mycommits')}${ds.commits.map(c => TX({ k: 'cm.' + c.type }) + (c.until !== null ? T('u.until', { n: c.until + 1 }) : '')).join(sep())}` : ''}
    ${ds.cb ? `<br><span class="good">${ds.cb.until - S.turn > 60 ? T('u.hascb_long') : T('u.hascb', { n: ds.cb.until - S.turn + 1 })}</span>` : ''}
    ${ds.warnings.filter(w => w.by === b).map(w => `<br><span class="warn">${T('u.theywarn', { t: w.to, b: w.about })}</span>`).join('')}</div>
  </div>`;
  // 对方的战略姿态、红线与记忆
  const knowGoals = W.intelOf(S, P) >= W.intelOf(S, b) - 8;
  h += `<div class="sec"><h3>${T('u.posture')}</h3>
    <div style="font-size:12.5px">${T('u.stance_to_you')}<b>${ds.stance ? T('stance.' + ds.stance, { a: b }) : T('u.stance_none')}</b>${ds.tension >= 10 ? ` · ${T('u.tension')} <b class="${ds.tension > 50 ? 'bad' : 'warn'}">${Math.round(ds.tension)}</b>` : ''}</div>
    ${ds.plan ? `<div class="doctrine" style="margin-top:6px">${ds.plan.public ? `<div><b>${T('u.public')}</b>${esc(TX(ds.plan.public))}</div>` : ''}${ds.plan.assessment ? `<div><b>${T('u.assess')}</b>${esc(TX(ds.plan.assessment))}</div>` : ''}${knowGoals && ds.plan.goals ? `<div><b>${T('u.goals_intel')}</b>${esc(TX(ds.plan.goals))}</div>` : ''}<div class="muted" style="font-size:11px">${T('u.plan_src', { n: ds.plan.until - S.turn + 1 })}</div></div>` : ''}
    ${coreDossierHTML(b)}
    <div style="margin-top:8px"><b style="font-size:12.5px">${T('u.redlines')}</b>${ds.red.length ? `<ul class="rl">${ds.red.map(rl => `<li class="${rl.crossed ? 'bad' : ''}">${esc(TX({ k: 'rl.' + rl.type, p: { t: rl.t, l: rl.loc } }))}${rl.crossed ? ' · ' + T('u.crossed') : ''}</li>`).join('')}</ul>` : ` <span class="muted" style="font-size:12.5px">${T('u.none')}</span>`}</div>
    <div style="margin-top:8px"><b style="font-size:12.5px">${T('u.memory')}</b>${memHTML(ds.mem)}</div>
    ${ds.ops.length ? `<div class="alert bad">${ds.ops.map(o => T('u.massing', { a: o.owner, t: o.target, l: o.from, n: Math.max(1, o.ready - S.turn) })).join('<br>')}</div>` : ''}
  </div>`;
  const allies = IDS.filter(c => c !== id && W.isAlly(S, id, c)).map(NAME), partners = IDS.filter(c => c !== id && W.isPartner(S, id, c)).map(NAME);
  h += `<div class="sec"><h3>${T('u.profile')}</h3>${dossierStats(id)}${indDossierHTML(id)}<div style="margin-top:8px;font-size:12.5px">${T('u.allies')}${allies.join(sep()) || `<span class="muted">${T('u.none')}</span>`}${partners.length ? `<br>${T('u.partners')}${partners.join(sep())}` : ''}</div></div>`;
  h += `<div class="sec"><h3>${T('u.doctrine')}</h3><div class="doctrine">${esc((x.doc && x.doc[EN() ? 1 : 0]) || (EN() ? d.doctrineEn : d.doctrine))}<br><span style="font-size:11.5px">${T('u.persona', { a: Math.round(x.hawk * 100), b: Math.round(x.risk * 100), c: Math.round(x.loyal * 100) })}</span></div></div>`;
  const occ = x.ctrl === P && id !== P;
  const cats = occ ? ['occ', 'dip'] : ['dip', 'econ', 'mil', 'covert'];
  if (!cats.includes(UI.cat)) UI.cat = cats[0];
  const wmBtn = id !== P && (W.atWar(S, P, W.boss(S, id)) || S.fronts.some(f => f.target === id && (f.att === P || W.boss(S, id) === P))) ? ` <button data-wmap="${S.fronts.some(f => f.target === id && (f.att === P || W.boss(S, id) === P)) ? S.fronts.find(f => f.target === id && (f.att === P || W.boss(S, id) === P)).id : 'T:' + id}" style="font-size:12px;padding:.15em .6em">🗺 ${T('u.wm.open')}</button>` : '';
  h += `<div class="sec"><h3>${T('u.actions')} <button data-go="chat" style="font-size:12px;padding:.15em .6em">${T('u.talk')}</button>${wmBtn}</h3><div class="cats">${cats.map(c => `<button data-cat="${c}" class="${UI.cat === c ? 'on' : ''}">${T('cat.' + c)}</button>`).join('')}</div><div class="acts">${actionsHTML(W.ACTIONS.filter(a => a.cat === UI.cat && !a.self && !a.hidden), id)}</div></div>`;
  return h;
}
function threatTop() {
  const P = S.player;
  const rows = Object.entries(S.threat).filter(([X]) => W.indep(S, X) && X !== P).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return `<div class="sec"><h3>${T('u.threat_top')}</h3><div class="list">${rows.map(([X, v]) => `<div class="item"><div class="row"><a href="#" data-sel="${X}">${esc(NAME(X))}</a><b class="num ${threatCls(v)}">${Math.round(v)}</b></div><div class="bar"><div style="width:${v}%;background:var(--${v >= 60 ? 'hostile' : v >= 35 ? 'warn' : 'neutral'})"></div></div></div>`).join('')}</div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.threat_help')}</p></div>`;
}
/* ---------- 行动参数 ---------- */
function paramOptions(a, pp, target) { return pp.dyn ? W.dynOptions(S, a.id, pp.key, target) : pp.options; }
function paramLabel(a, key, v) {
  switch (key) {
    case 'about': return NAME(v);
    case 'conseq': return T('wc.' + v);
    case 'terms': return T('pt.' + v);
    case 'level': return a.id === 'mobilize' ? T('mob.' + v) : T('sl.' + v);
    case 'tier': { if (a.id === 'procure') return `${T('tier.' + v)}${paren(fmtB(W.procCost(S, S.player, +v)))}`; const p = [0.05, 0.2, 0.6][+v]; return `${T('tier.' + v)}${paren(fmtB(S.actors[S.player].gdp * p / 100))}`; }
    case 'size': return a.id === 'conscript' ? `${T('tier.' + v)}${paren(persT(W.conscriptN(S, S.player, +v)))}` : T('rqsize.' + v);
    case 'dest': { if (String(v).startsWith('F')) { const f = S.fronts.find(z => z.id === v); return f ? T('u.dest.front', { t: f.target }) : v; } return T('u.dest.def', { l: String(v).slice(2) }); }
    case 'share': return pct(+v);
    case 'haste': return T('haste.' + v);
    case 'scope': return T('scope.' + v);
    case 'branch': return T('br.' + v);
    case 'bloc': return T('bloc.' + v);
  }
  return String(v);
}
function paramsFor(a, target) {
  const p = UI.params[a.id] || (UI.params[a.id] = {});
  for (const pp of a.params || []) {
    const opts = paramOptions(a, pp, target);
    if (p[pp.key] === undefined || (pp.dyn && !opts.includes(p[pp.key]))) { if (opts.length) p[pp.key] = opts[['share', 'tier'].includes(pp.key) && opts.length > 1 ? 1 : 0]; else delete p[pp.key]; }
  }
  if (a.id === 'invade') { const so = W.stagingOptions(S, S.player, target); if (!so.some(o => o.L === p.from)) p.from = so[0] ? so[0].L : undefined; }
  return p;
}
function actionsHTML(list, target) {
  return list.map(a => {
    const p = paramsFor(a, target); const st = W.actionStatus(S, a.id, target, p); const open = UI.open[a.id];
    const costTxt = st.cost > 0 ? fmtB(st.cost) : '';
    let body = '';
    if (open) {
      let prm = (a.params || []).map(pp => { const opts = paramOptions(a, pp, target); return `<label class="prm">${T('pk.' + pp.key)}<select data-act="${a.id}" data-key="${pp.key}">${opts.map(o => `<option value="${esc(o)}" ${String(p[pp.key]) === String(o) ? 'selected' : ''}>${esc(paramLabel(a, pp.key, o))}</option>`).join('')}</select></label>`; }).join('');
      if (a.id === 'invade') { const so = W.stagingOptions(S, S.player, target); if (so.length > 1) prm += `<label class="prm">${T('pk.from')}<select data-act="invade" data-key="from">${so.map(o => `<option value="${o.L}" ${p.from === o.L ? 'selected' : ''}>${esc(NAME(o.L))} · ${T('kind.' + o.kind)} · ${T('u.freeat', { s: pct(o.free) })}</option>`).join('')}</select></label>`; }
      body = `<div class="act-b"><div class="d">${esc(T('a.' + a.id + '.d'))}</div>${prm}` +
        `<div class="p ${st.ok ? '' : 'no'}">${esc(st.ok ? (st.preview ? TX(st.preview) : T('u.can')) : TX(st.reason))}</div>` +
        `<button class="go ${a.danger ? '' : 'btn-primary'}" data-queue="${a.id}" data-t="${target}" ${st.ok ? '' : 'disabled'}>${a.danger ? '⚠ ' : ''}${T('u.addq')}</button></div>`;
    }
    return `<div class="act ${st.ok ? '' : 'dis'} ${a.danger ? 'danger' : ''}"><div class="act-h" data-toggle="${a.id}"><span class="nm">${esc(T('a.' + a.id))}</span><span class="cost">${costTxt}</span><span class="apc">${'<i></i>'.repeat(a.ap)}</span><span class="muted">${open ? '▾' : '▸'}</span></div>${body}</div>`;
  }).join('');
}
/* ---------- 本国 ---------- */
function facBar(k, v) { return `<div class="fac"><span>${T('fac.' + k)}</span><div class="bar"><div style="width:${v}%;background:var(--${v < 35 ? 'hostile' : v < 50 ? 'warn' : 'neutral'})"></div></div><b class="num">${Math.round(v)}</b></div>`; }
function politicsHTML() {
  const pv = W.politicsView(S), P = S.player;
  let s = `<div class="sec"><h3>${T('u.politics')}${pv.gov ? ` <span class="tag">${T('gov.' + pv.gov)}</span>` : ''}${pv.strict ? ` <span class="tag red">${T('u.strict')}</span>` : ''}</h3>`;
  s += `<div class="facs">${['mil', 'biz', 'pub'].map(k => facBar(k, pv.fac[k])).join('')}</div>`;
  if (pv.left !== null) s += `<div class="alert ${pv.odds < 0.5 ? 'bad' : ''}">${T('u.election', { n: pv.left, s: pct(pv.odds) })}</div>`;
  if (pv.gov && pv.gov !== 'dem') s += `<div class="muted" style="font-size:12.5px;margin-top:6px">${T('u.couprisk')}<b class="${pv.coup > 0.04 ? 'bad' : ''}">${pct(pv.coup, 1)}</b>${T('u.couprisk_h')}</div>`;
  if ((pv.govM || pv.gov) !== 'aut') s += `<div class="muted" style="font-size:12px;margin-top:6px">${T('u.warauth_h')}</div>`;
  if (pv.apPen > 0) s += `<div class="alert bad">${T('u.appen', { n: pv.apPen })}</div>`;
  s += `<div class="grid3" style="margin-top:8px">${['trust', 'aggr', 'cred'].map(k => `<div class="stat"><span>${T('rep.' + k)}</span><b class="${k === 'aggr' ? (pv.rep[k] > 60 ? 'bad' : '') : pv.rep[k] < 40 ? 'bad' : ''}">${Math.round(pv.rep[k])}</b></div>`).join('')}</div>`;
  if (pv.rep.nuke) s += `<div class="alert bad">${T('u.nukeused')}</div>`;
  if (pv.cb.length) s += `<div style="font-size:12.5px;margin-top:6px">${T('u.cbs')}${pv.cb.map(c => `<a href="#" data-sel="${c.t}">${esc(NAME(c.t))}</a>${c.fab ? '<small class="warn">' + T('u.fab') + '</small>' : ''}${paren(c.until - S.turn > 60 ? T('u.cb_long') : T('u.turns_left', { n: c.until - S.turn + 1 }))}`).join(sep())}</div>`;
  if (pv.commits.length) s += `<div style="font-size:12.5px;margin-top:6px">${T('u.commits')}${pv.commits.map(c => `${esc(NAME(c.with))}·${TX({ k: 'cm.' + c.type })}${c.until !== null ? T('u.until', { n: c.until + 1 }) : ''}`).join(sep())}</div>`;
  if (pv.results.length) s += `<div class="muted" style="font-size:12px;margin-top:6px">${T('u.pastelec')}${pv.results.map(r => `${dateStr(S, r.turn)} ${r.v}% ${r.win ? '✓' : '✗'}`).join(sep())}</div>`;
  return s + '</div>';
}
function opsHTML() {
  const P = S.player; const mine = S.ops.filter(o => o.owner === P);
  if (!mine.length) return '';
  return `<div class="sec"><h3>${T('u.ops')}</h3><div class="list">${mine.map(o => { const left = o.ready - S.turn; const seen = o.det.includes(W.boss(S, o.target)); return `<div class="item"><div class="row"><b>→ <a href="#" data-sel="${o.target}">${esc(NAME(o.target))}</a></b><span class="tag ${seen ? 'red' : ''}">${seen ? T('u.op_seen') : T('u.op_hidden')}</span></div><div class="row muted" style="font-size:12px"><span>${T('u.op_info', { l: o.from, k: T('kind.' + o.kind), s: pct(W.dotw(S, P, o.v)) })}</span><span>${left > 0 ? T('u.op_in', { n: left }) : T('u.op_now')}</span></div><div class="btns"><button data-cancelop="${o.id}">${T('u.cancel_op')}</button></div></div>`; }).join('')}</div></div>`;
}
function frontHTML(f, ctl) {
  const P = S.player, mine = f.att === P, co = (f.co || []).some(k => k.id === P); const p = Math.max(0, f.progress);
  const ph = f.phase || 'land';
  const phTxt = ph === 'land' ? `${Math.round(f.progress)}%` : ph === 'sea' ? `${T('ph.sea')} ${Math.round(Math.max(0, f.sp))}%` : T('ph.landing');
  const bar = ph === 'land' ? p : ph === 'sea' ? Math.max(0, f.sp) * 0.15 : 18;
  const nObj = (f.obj || []).length, last = (f.log || [])[(f.log || []).length - 1];
  return `<div class="fr"><div><b>${esc(NAME(f.att))} → ${esc(NAME(f.target))}</b> <span class="muted" style="font-size:12px">${T('kind.' + f.kind)} · ${T('ph.' + ph)} · ${T('u.turnN', { n: f.turns })} · ${T('u.fratio')} ${f.ratio ? f.ratio.toFixed(2) : '—'}${nObj ? ' · ' + T('u.cities', { a: (f.taken || []).length, b: nObj }) : ''}${(f.co || []).length ? ' · ' + T('u.with_co', { x: { list: f.co.map(k => ({ id: k.id })) } }) : ''}</span></div><b class="num">${phTxt}</b>
    <div class="prog ${mine || co ? 'mine' : ''} ph-${ph}"><div style="width:${bar}%"></div></div>
    ${last && last.la ? `<div class="muted fr-last">${T('u.fr_last', { a: { pers: last.la[0] }, b: { pers: last.ld[0] } })}${last.cap && last.cap.length ? ' · ' + T('u.fr_cap', { x: { list: last.cap.map(i => W.cityName(f.target, i)) } }) : ''}</div>` : ''}
    <div class="frbtns">${ctl ? `<button data-wmap="${f.id}">🗺 ${T('u.wm.open')}</button>` : ''}<button data-war="${f.id}">${T('u.warroom')}</button>${ctl && mine ? `<button data-halt="${f.id}">${T('u.halt')}</button><button data-peace="${W.boss(S, f.target)}">${T('u.peace')}</button>` : ''}${ctl && !mine && W.boss(S, f.target) === P ? `<button data-peace="${f.att}">${T('u.peace_with', { a: f.att })}</button>` : ''}</div></div>`;
}
function homeHTML() {
  const P = S.player, x = S.actors[P], h = W.hegemony(S);
  let s = (typeof goalsSecHTML === 'function' ? goalsSecHTML() : '') + `<div class="sec"><h3>${T(S.goal === 'unify' ? 'u.goal_unify' : 'u.goal_heg')}</h3>`;
  if (S.goal === 'unify') s += `<div class="stat"><span>${T('u.units')}</span><b>${h.units} / ${IDS.length}</b></div><div class="bar" style="margin-top:6px"><div style="width:${h.unify * 100}%"></div></div>`;
  else s += `<div class="stat"><span>${T('u.gshare')}</span><b>${pct(h.gdpShare, 1)}</b></div><div class="bar" style="margin:4px 0 8px"><div style="width:${Math.min(100, h.gdpShare / 0.5 * 100)}%"></div></div><div class="stat"><span>${T('u.mshare')}</span><b>${pct(h.milShare, 1)}</b></div><div class="bar" style="margin-top:4px"><div style="width:${Math.min(100, h.milShare / 0.45 * 100)}%"></div></div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.heg_help')}${S.heg ? T('u.heg_kept', { n: S.heg }) : ''}</p>`;
  s += `</div>`;
  s += politicsHTML();
  const nf = S.fronts.filter(f => f.att === P || W.boss(S, f.target) === P).length;
  if (nf || S.ops.some(o => o.owner === P)) s += `<div class="sec"><div class="alert">${T('u.see_mil', { n: nf })} <button data-tab="mil">${T('u.t.mil')}</button> <button data-wmap="1">🗺 ${T('u.wm.open')}</button></div></div>`;
  s += `<div class="sec"><h3>${T('u.trend')}</h3><div class="grid2"><div><div class="stat"><span>GDP</span><b>${fmtB(x.gdp)}</b></div>${spark('gdp', '--neutral')}</div><div><div class="stat"><span>${T('u.power')}</span><b>${fmtN(W.power(S, P))}</b></div>${spark('mil', '--hostile')}</div><div><div class="stat"><span>${T('u.stab')}</span><b>${Math.round(x.stab)}</b></div>${spark('stab', '--friend')}</div><div><div class="stat"><span>${T('fac.pub')}</span><b>${Math.round(S.pol.fac.pub)}</b></div>${spark('pub', '--accent')}</div></div></div>`;
  s += indHomeHTML();
  const annual = x.gdp * x.milPct / 100; const cap = S.commits.filter(c => c.type === 'armsctl').reduce((m, c) => Math.min(m, c.cap), Infinity);
  s += `<div class="sec"><h3>${T('u.budget')}</h3>
    <div class="slider"><span>${T('u.milpct')}</span><input type="range" id="milPct" min="0.5" max="${Math.max(25, W.weMilCap(S, P))}" step="0.1" value="${x.milPct.toFixed(1)}"><b class="num" id="milPctV">${x.milPct.toFixed(1)}%</b></div>
    <div class="muted" style="font-size:12px" id="milPctN">${budgetNote(x, annual, cap)}</div>
    <div class="slider" style="margin-top:8px"><span>${T('u.mix')}</span><select id="mixSel">${(x.mixMode === 'custom' ? ['custom'] : []).concat(['bal', 'land', 'navy', 'air']).map(v => `<option value="${v}" ${(x.mixMode || 'bal') === v ? 'selected' : ''}>${T('u.mix.' + v)}</option>`).join('')}</select></div>
    <div class="muted" style="font-size:12px">${T('u.mixnow', { a: Math.round(x.mix[0] * 100), b: Math.round(x.mix[1] * 100), c: Math.round(x.mix[2] * 100), k: T('mob.' + x.mob) })}</div></div>`;
  s += `<div class="sec"><h3>${T('u.dom_actions')}</h3><div class="acts">${actionsHTML(W.ACTIONS.filter(a => a.self && a.cat !== 'army' && !['buildup', 'mobilize'].includes(a.id)), P)}</div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.dom_help')}</p></div>`;
  const realm = W.realm(S, P).filter(v => v !== P);
  s += `<div class="sec"><h3>${T('u.realm')}</h3>${realm.length ? '<div class="list">' + realm.map(v => { const y = S.actors[v]; const occ = y.ctrl === P; return `<div class="item"><div class="row"><b><a href="#" data-sel="${v}">${esc(NAME(v))}</a></b><span class="tag ${occ ? 'red' : 'acc'}">${occ ? (y.integrated ? T('u.integrated') : T('u.occupying')) : T('u.vassal')}</span></div>${occ && !y.integrated ? `<div class="row" style="font-size:12px"><span class="muted">${T('u.resist')}</span><div class="bar" style="flex:1"><div style="width:${y.resist}%;background:var(--hostile)"></div></div><b class="num">${Math.round(y.resist)}</b></div>` : ''}<div class="row muted" style="font-size:12px"><span>GDP ${fmtB(y.gdp)}</span><span>${occ ? T('u.garrison', { s: pct(S.actors[P].forces[v] || 0) }) : T('u.infl', { n: Math.round(W.infl(S, P, v)) })}</span></div><div class="btns">${(occ ? ['pacify', 'annex', 'puppet'] : ['integrate', 'release']).map(aid => { const st = W.actionStatus(S, aid, v, {}); return `<button data-queue="${aid}" data-t="${v}" ${st.ok ? '' : 'disabled'} title="${esc(st.ok ? (st.preview ? TX(st.preview) : '') : TX(st.reason))}">${T('a.' + aid)}</button>`; }).join('')}</div></div>`; }).join('') + '</div>' : `<p class="muted">${T('u.norealm')}</p>`}</div>`;
  const trs = S.treaties.filter(t => t.a === P || t.b === P); const grouped = {}; for (const t of trs) { const o = t.a === P ? t.b : t.a; (grouped[t.type] = grouped[t.type] || []).push(o); }
  const blocs = Object.values(S.blocs).filter(b => b.members.includes(P)).map(b => T('bloc.' + b.id));
  s += `<div class="sec"><h3>${T('u.treaty_sec')}</h3><div style="font-size:12.5px;display:grid;gap:4px">${blocs.length ? `<div>${T('u.blocs')}${blocs.join(sep())}</div>` : ''}${Object.entries(grouped).map(([k, v]) => `<div>${T('tr.' + k)}${colonT()}${v.map(o => `<a href="#" data-sel="${o}">${esc(NAME(o))}</a>`).join(sep())}</div>`).join('') || `<span class="muted">${T('u.notreaty')}</span>`}</div></div>`;
  return s;
}
function budgetNote(x, annual, cap) { const cq = x.capQ ?? W.warCapQ(S, S.player); const over = annual / 4 > cq * 1.02; return T('u.budget_note', { m: fmtB(annual) }) + (x.milPct > 3 ? T('u.budget_drag', { n: ((x.milPct - 3) * 0.24 * (W.sc().milDrag ?? 1)).toFixed(1) }) : '') + (isFinite(cap) ? ' ' + T('u.budget_cap', { n: cap.toFixed(1) }) : '') + (over ? ' ' + T('u.i.budget_over', { m: fmtB(cq * 4) }) : ''); }
/* ---------- 外交 ---------- */
function ultiHTML(u) {
  const left = u.deadline - S.turn;
  return `<div class="item ulti"><div class="row"><b><a href="#" data-sel="${u.from}">${esc(NAME(u.from))}</a></b><span class="tag red">${left > 0 ? T('u.ulti_left', { n: left }) : T('u.ulti_now')}</span></div>
    <div style="font-size:13px;margin-top:4px">${T('u.ulti_demand')}<b>${esc(TX({ k: 'ud.' + u.demand, p: { l: u.loc, b: u.with, t: u.t } }))}</b></div>
    <div style="font-size:13px">${T('u.ulti_conseq')}<b class="bad">${esc(TX({ k: 'uc.' + u.conseq }))}</b>${u.rejected ? ` <span class="tag">${T('u.rejected')}</span>` : ''}</div>
    <div class="btns"><button data-ulti="${u.id}" data-ans="accept">${T('u.comply')}</button>${u.rejected ? '' : `<button data-ulti="${u.id}" data-ans="reject">${T('u.reject_pub')}</button>`}<button data-chat="${u.from}">${T('u.negotiate')}</button></div></div>`;
}
function diploHTML() {
  const P = S.player; let s = '';
  s += coreSecHTML();
  const ultis = S.ultis.filter(u => u.status === 'open' && !u.core);
  if (ultis.length) s += `<div class="sec"><h3>${T('u.ultis')} <span class="tag red">${ultis.length}</span></h3><div class="list">${ultis.map(ultiHTML).join('')}</div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.ulti_help')}</p></div>`;
  const crs = S.crises.filter(c => !c.resolved);
  if (crs.length) s += `<div class="sec"><h3>${T('u.crises')} <span class="tag red">${crs.length}</span></h3><div class="list">${crs.map(c => `<div class="item"><div class="row"><b>${esc(TX(c.title))}</b><span class="tag">${c.deadline - S.turn > 0 ? T('u.cr_left') : T('u.cr_now')}</span></div><div class="btns"><button class="btn-primary" data-crisis="${c.id}">${T('u.decide')}</button></div></div>`).join('')}</div></div>`;
  s += `<div class="sec"><h3>${T('u.inbox')} ${S.inbox.length ? `<span class="tag red">${S.inbox.length}</span>` : ''}</h3>${S.inbox.length ? '<div class="list">' + S.inbox.map(o => `<div class="item"><div class="row"><b>${esc(NAME(o.from))}</b><span class="muted" style="font-size:11.5px">${T('u.valid', { n: o.expires - S.turn + 1 })}</span></div><div style="font-size:13px;margin-top:4px">${esc(TX(o.msg))}</div><div class="btns"><button class="btn-primary" data-offer="${o.id}" data-ok="1">${T('u.accept')}</button><button data-offer="${o.id}" data-ok="0">${T('u.decline')}</button><button data-sel="${o.from}">${T('u.dossier')}</button></div></div>`).join('') + '</div>' : `<p class="muted">${T('u.noinbox')}</p>`}</div>`;
  const X = UI.sel && UI.sel !== P && W.indep(S, UI.sel) && !W.isNeutral(S, UI.sel) ? UI.sel : null;
  s += `<div class="sec"><h3>${T('u.talks')}${X ? colonT() + esc(NAME(X)) : ''}</h3>`;
  if (!X) s += W.provOf(S, UI.sel) ? `<div class="alert">${T('u.prov_x', { t: UI.sel, b: { id: W.provOf(S, UI.sel) } })}</div>` : W.isNeutral(S, UI.sel) ? `<div class="alert">${T('u.neutral_x')}</div>` : `<p class="muted">${T('u.talks_pick')}</p>`;
  else if (window.TX_MP && typeof mpTalkHTML === 'function') s += mpTalkHTML(X);
  else if (!useLLM()) s += `<p class="muted">${T('u.talks_nollm')}</p><button data-go="settings">${T('u.settings')}</button>`;
  else {
    const hist = S.chat[X] || [];
    s += `<div class="muted" style="font-size:12px">${T('u.talks_help', { v: { voice: X } })}</div>
      <div class="chat" id="chatlog">${hist.map((m, i) => msgHTML(X, m, i, i === hist.length - 1)).join('') || `<p class="muted" style="font-size:12.5px">${T('u.talks_eg')}</p>`}${UI.chatBusy ? `<div class="msg them"><span class="who">${esc(NAME(X))}</span>${T('u.thinking')}</div>` : ''}</div>
      <form class="chatbox" id="chatForm"><textarea id="chatText" placeholder="${esc(T('u.envoy_ph'))}" ${UI.chatBusy ? 'disabled' : ''}></textarea><button class="btn-primary" ${UI.chatBusy ? 'disabled' : ''}>${T('u.send')}</button></form>`;
  }
  return s + '</div>';
}
function termText(t) { const base = T('dk.' + t.type); const extra = t.amount ? paren(fmtB(+t.amount)) : t.enemy ? paren(NAME(String(t.enemy).toUpperCase())) : t.with ? paren(NAME(String(t.with).toUpperCase())) : t.loc ? paren(NAME(String(t.loc).toUpperCase())) : t.turns ? paren(t.turns) : ''; return base + extra; }
function msgHTML(X, m, i, last) {
  if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
  let deal = '';
  if (m.deal && m.deal.status !== 'none' && m.deal.terms && m.deal.terms.length) {
    const lbl = { accept: T('u.deal_acc'), counter: T('u.deal_counter'), reject: T('u.deal_rej') }[m.deal.status] || '';
    const warn = m.deal.terms.map(t => W.dealCheck(S, X, t)).filter(Boolean).map(TX);
    deal = `<div class="deal"><b>${lbl}</b>${m.deal.summary ? `<div class="muted" style="font-size:12px">${esc(m.deal.summary)}</div>` : ''}<ul>${m.deal.terms.map(t => `<li>${esc(termText(t))}</li>`).join('')}</ul>${warn.length ? `<div class="warn" style="font-size:12px">${T('u.deal_warn', { x: { raw: warn.join(sep()) } })}</div>` : ''}${last && m.deal.status !== 'reject' && !m.signed ? `<div class="btns" style="display:flex;gap:6px"><button class="btn-primary" data-sign="${X}" data-i="${i}" ${W.apLeft(S) < 1 ? 'disabled' : ''}>${T('u.sign')}</button></div>` : m.signed ? `<div class="good" style="font-size:12px">${T('u.signed')}</div>` : ''}</div>`;
  }
  return `<div class="msg them"><span class="who">${esc(I18N.voice(X))}</span>${esc(m.text)}</div>${deal}`;
}
/* ---------- 情报 ---------- */
function intelHTML() {
  const P = S.player; let s = '';
  const seen = S.ops.filter(o => o.owner !== P && o.det.includes(P));
  s += `<div class="sec"><h3>${T('u.alerts')}</h3>${seen.length ? `<div class="list">${seen.map(o => `<div class="item alert-item"><b class="bad">${T('u.massing', { a: o.owner, t: o.target, l: o.from, n: Math.max(1, o.ready - S.turn) })}</b><div class="btns"><button data-sel="${o.owner}">${T('u.dossier')}</button>${o.target !== P && W.indep(S, o.target) ? `<button data-warnq="${o.owner}" data-about="${o.target}">${T('u.warn_them')}</button>` : ''}</div></div>`).join('')}</div>` : ''}
    <div class="feed">${S.intelLog.slice(-14).reverse().map(i => `<div class="f ${i.tone === 'bad' ? 'bad' : ''}"><small>${dateStr(S, i.turn)}</small>${esc(TX(i.msg))}</div>`).join('') || `<p class="muted">${T('u.noalerts')}</p>`}</div></div>`;
  s += threatTop();
  s += `<div class="sec"><h3>${T('u.tension_g')}</h3><div class="bar"><div style="width:${S.tension}%;background:${S.tension > 70 ? 'var(--hostile)' : S.tension > 45 ? 'var(--warn)' : 'var(--neutral)'}"></div></div><div class="muted" style="font-size:12px;margin-top:3px">${T('u.tension_n', { n: Math.round(S.tension), d: S.fronts.length })}</div></div>`;
  s += `<div class="sec"><div class="row"><b>${T('u.i.title')}</b><button class="mini" data-indpanel="1">${T('u.i.open')}</button></div></div>`;
  const cols = [['gdp', 'GDP'], ['power', T('u.power')], ['nukes', T('u.k.nukes')], ['stab', T('u.stab')]];
  const rows = W.rankings(S).sort((a, b) => b[UI.rankSort] - a[UI.rankSort]).slice(0, 25);
  s += `<div class="sec"><h3>${T('u.rank')}</h3><div style="overflow-x:auto"><table class="rank"><tr><th>${T('u.country')}</th>${cols.map(([k, l]) => `<th data-sort="${k}">${esc(l)}${UI.rankSort === k ? ' ▾' : ''}</th>`).join('')}</tr>${rows.map(r => `<tr class="${r.id === P ? 'me' : ''}"><td data-sel="${r.id}">${esc(NAME(r.id))}</td><td>${fmtB(r.gdp)}</td><td>${fmtN(r.power)}</td><td>${r.nukes ? fmtN(r.nukes) : '—'}</td><td>${Math.round(r.stab)}</td></tr>`).join('')}</table></div></div>`;
  const filt = { all: () => true, me: e => (e.actors || []).includes(P), war: e => ['war', 'conquest', 'uprising', 'nuke', 'peace'].includes(e.type), dip: e => ['reaction', 'deal', 'offer', 'hprop', 'ai', 'ultimatum', 'crisis', 'politics'].includes(e.type) };
  const logs = S.log.filter(e => e.type !== 'secret' || S.over).filter(filt[UI.feedFilter] || filt.all).slice(-80).reverse();
  s += `<div class="sec"><h3>${T('u.chron')}</h3><div class="cats">${[['all', 'u.f.all'], ['me', 'u.f.me'], ['war', 'u.f.war'], ['dip', 'u.f.dip']].map(([k, l]) => `<button data-feed="${k}" class="${UI.feedFilter === k ? 'on' : ''}">${T(l)}</button>`).join('')}</div><div class="feed">${logs.map(e => `<div class="f ${e.tone || ''}"><small>${dateStr(S, e.turn)}</small>${esc(TX(e.msg))}</div>`).join('') || `<p class="muted">${T('u.nolog')}</p>`}</div></div>`;
  return s;
}
/* ---------- 队列与底栏 ---------- */
function qLabel(q) {
  if (q.type === 'deploy') return T('u.q.deploy', { f: q.from, l: q.to, s: pct(W.dotw(S, S.player, q.v)) });
  if (q.type === 'custom') return T('u.q.custom', { x: { raw: String(q.order.summary || q.order.text || '').slice(0, 30) } });
  if (q.type === 'core') return T('u.q.core', { k: cstepLab(q.side, q.lvl), t: q.target });
  if (q.type === 'done') return TX(q.label);
  const a = W.ACT[q.type]; if (!a) return q.type;
  const ps = (a.params || []).filter(pp => q.params[pp.key] !== undefined).map(pp => paramLabel(a, pp.key, q.params[pp.key]));
  if (q.type === 'invade' && q.params && q.params.focus != null && q.params.focus !== '') ps.push(T('u.q.focus', { x: W.cityName(q.target, +q.params.focus) }));
  if (q.type === 'fsupport') return T('a.fsupport') + ' → ' + NAME(q.target);
  return T('a.' + a.id) + (a.self ? '' : ' → ' + NAME(q.target)) + (ps.length ? (EN() ? ' (' + ps.join(', ') + ')' : '（' + ps.join(sep()) + '）') : '');
}
function renderQueue() {
  const q = $('#queue');
  if (window.TX_MP && typeof mpQueueChanged === 'function') mpQueueChanged();
  q.innerHTML = `<span class="ql">${T('u.queue')}</span>` + (typeof mpPlanChip === 'function' ? mpPlanChip() : '') + (S.queue.length ? S.queue.map((it, i) => `<span class="qchip"><span class="t" title="${esc(qLabel(it))}">${esc(qLabel(it))}</span><small>${it.ap ? T('u.apn', { n: it.ap }) : T('u.ap0')}${it.cost > 0 ? ' · ' + fmtB(it.cost) : ''}</small>${it.type === 'done' ? '' : `<button data-unq="${i}" aria-label="${esc(T('u.remove'))}">×</button>`}</span>`).join('') : `<span class="muted" style="font-size:12.5px">${T('u.queue_empty')}</span>`);
}
function renderTicker() {
  const R = S.report; const heads = (R && R.headlines && R.headlines.length) ? R.headlines.map(TX) : S.log.filter(e => e.type !== 'secret').slice(-4).map(e => TX(e.msg)).reverse();
  let i = 0; const el = $('#ticker');
  el.innerHTML = `<span class="tag">${T('u.news')}</span><span class="txt" id="tickTxt">${esc(heads[0] || '')}</span>`;
  clearInterval(UI.tickT); if (heads.length > 1) UI.tickT = setInterval(() => { i = (i + 1) % heads.length; const t = $('#tickTxt'); if (t) t.textContent = heads[i]; }, 6000);
}
function renderAll() { renderTop(); renderMap(); renderSide(); renderQueue(); renderTicker(); }
