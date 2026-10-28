// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 新版 · 军事页、设置（AI 来源）、建局（AI 用量）、大厅、帮助、新手教学 ===================== */
/* ---------- 军事页：兵力、战线、作战地图、部署；征兵与订单移到动员页，请求盟友变成协议，核心利益阶梯移到目标页 ---------- */
function milHTML() {
  const P = S.player, x = S.actors[P], u = W.unitsOf(S, P);
  const h = S.history, prev = h.length >= 2 ? h[h.length - 2] : null;
  const d = (k, now, fmt) => (prev && prev[k] !== undefined ? delta(prev[k], now, fmt) : '');
  const orders = x.orders || [], training = W.inTraining(S, P);
  const oSum = br => orders.filter(o => o.br === br).reduce((s, o) => s + W.procUnits(S, P, br, o.pts), 0);
  const card = (label, val, dl, note) => `<div class="stat oobc"><span>${label}</span><b>${val} ${dl}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const cores = W.coreView(S).filter(k => k.status === 'active' && (k.o === P || k.v === P));
  let s = cores.length ? `<div class="sec"><div class="alert bad">${cores.map(k => { const Y = k.o === P ? k.v : k.o; return `${T('u.core_crises')}${colonT()}${esc(NAME(Y))} <button class="mini" data-v2target="${Y}">${T('v2.core_go')}</button>`; }).join('<br>')}</div></div>` : '';
  s += `<div class="sec"><h3>${T('u.oob')} <span class="tag">${T('mob6.' + W.mobIdx(x))}</span></h3><div class="grid2 oob">
    ${card(T('u.u.pers'), persT(u.pers), d('pers', u.pers, v => persT(v)), training ? T('u.u.training', { n: { pers: training } }) : x.mob ? T('u.u.reserve', { n: { pers: u.pers * (W.MANP[x.mob] - 1) } }) : '')}
    ${card(T('u.u.tanks'), fmtN(u.tanks), d('tanks', u.tanks, fmtN), oSum('land') >= 1 ? T('u.u.ordered', { n: Math.round(oSum('land')) }) : '')}
    ${card(T('u.u.air'), fmtN(u.air), d('air', u.air, fmtN), oSum('air') >= 1 ? T('u.u.ordered', { n: Math.round(oSum('air')) }) : '')}
    ${card(T('u.u.ships'), fmtN(u.ships), d('ships', u.ships, fmtN), oSum('navy') >= 0.5 ? T('u.u.ordered', { n: Math.round(oSum('navy')) }) : '')}
    ${card(T('u.k.nukes'), fmtN(x.nukes), '', !x.nukes && x.nukeProg ? T('u.nukeprog', { n: Math.round(x.nukeProg) }) : '')}
    ${card(T('u.power'), fmtN(W.power(S, P)), d('mil', W.power(S, P), fmtN), T('u.u.eff', { l: fmtN(W.landEff(S, P)), n: fmtN(W.navyEff(S, P)), a: fmtN(W.airEff(S, P)) }))}
  </div><div class="grid2" style="margin-top:6px"><div><small class="muted">${T('u.u.pers')}</small>${spark('pers', '--accent')}</div><div><small class="muted">${T('u.power')}</small>${spark('mil', '--hostile')}</div></div>
  <div class="alert v2ptr">${T('v2.ptr.build', { a: (x.train || []).length, b: orders.length })} <button data-tab="weco">${T('v2.t.mob')}</button></div></div>`;
  const fr = S.fronts.filter(f => f.att === P || W.boss(S, f.target) === P || (f.co || []).some(k => k.id === P) || (f.coD || []).includes(P));
  s += `<div class="sec"><h3>${T('u.fronts')} <button class="mini" data-wmap="1">🗺 ${T('u.wm.open')}</button></h3>${fr.length ? '<div class="list">' + fr.map(f => frontHTML(f, true)).join('') + '</div>' : `<p class="muted">${T('u.nofronts')}</p>`}${W.enemies(S, P).length ? `<p style="font-size:12.5px;margin:6px 0 0">${T('u.enemies')}${W.enemies(S, P).map(e => `<a href="#" data-sel="${e}">${esc(NAME(e))}</a>`).join(sep())}</p>` : ''}<p class="muted" style="font-size:12px;margin:6px 0 0">${T('v2.wm_x')}</p></div>`;
  s += opsHTML();
  const bl = S.blockades.filter(b => b.by !== P && (b.target === P || W.isAlly(S, P, b.target) || W.isPartner(S, P, b.target) || S.actors[P].forces[b.target]));
  if (bl.length) s += `<div class="sec"><h3>${T('u.blockades')}</h3><div class="list">${bl.map(b => { const st = W.actionStatus(S, 'escort', b.target, {}); return `<div class="item"><div class="row"><b>${T('u.blk_line', { a: b.by, t: b.target })}</b></div><div class="muted" style="font-size:12px">${esc(st.ok && st.preview ? TX(st.preview) : st.reason ? TX(st.reason) : '')}</div><div class="btns"><button data-v2esc="${b.target}" ${st.ok ? '' : 'disabled'}>${T('a.escort')} →</button></div></div>`; }).join('')}</div></div>`;
  s += deployHTML();
  s += alliedHTML();
  return s;
}
function alliedHTML() {
  const P = S.player; const rows = [];
  for (const c of IDS) {
    if (c === P || !W.indep(S, c)) continue;
    for (const L of W.stations(S, c)) { if (L === c) continue; if (L === P || W.boss(S, L) === P || (S.actors[P].forces[L] && (W.isAlly(S, c, P) || W.isPartner(S, c, P)))) rows.push({ c, L, u: W.unitsV(S, c, W.shareV(S, c, L)) }); }
  }
  const co = []; for (const f of S.fronts) if (f.att === P) for (const k of (f.co || [])) co.push({ f, k, u: W.unitsV(S, k.id, k.v) });
  const allies = IDS.filter(Y => Y !== P && W.indep(S, Y) && !W.isNeutral(S, Y) && (W.isAlly(S, P, Y) || W.isPartner(S, P, Y) || S.actors[Y].overlord === P || W.rel(S, P, Y) >= 45)).sort((a, b) => W.power(S, b) - W.power(S, a));
  let s = `<div class="sec"><h3>${T('u.allied')}</h3>`;
  if (co.length) s += `<div class="list">${co.map(z => `<div class="item"><div class="row"><b>${esc(NAME(z.k.id))}</b><span class="tag blue">${T('u.co_front', { t: z.f.target })}</span></div><div class="muted" style="font-size:12px">${esc(unitTxt(z.u))}</div></div>`).join('')}</div>`;
  if (rows.length) s += `<div class="list" style="margin-top:6px">${rows.map(r => `<div class="item"><div class="row"><b>${esc(NAME(r.c))}</b><span class="muted">${T('u.at_loc', { l: r.L })}</span></div><div class="muted" style="font-size:12px">${esc(unitTxt(r.u))}</div></div>`).join('')}</div>`;
  if (!co.length && !rows.length) s += `<p class="muted" style="font-size:12.5px">${T('u.no_allied')}</p>`;
  if (allies.length) {
    if (!allies.includes(UI.rqAlly)) UI.rqAlly = allies[0];
    s += `<div class="movebox"><b>${T('u.ask_allies')}</b><div class="mvrow"><label>${T('u.ally')}<select id="rqAlly">${allies.map(Y => `<option value="${Y}" ${Y === UI.rqAlly ? 'selected' : ''}>${esc(NAME(Y))}${W.isAlly(S, P, Y) ? ' ★' : ''}</option>`).join('')}</select></label></div><div class="btns"><button data-v2deal="send_troops" data-t="${UI.rqAlly}">${T('v2.deal.send_troops')}</button>${W.isHuman(S, UI.rqAlly) ? '' : `<button data-v2deal="mobilize" data-t="${UI.rqAlly}">${T('v2.deal.mobilize')}</button>`}</div><p class="muted" style="font-size:12px;margin:4px 0 0">${T('v2.ask_x2')}</p></div>`;
  } else s += `<p class="muted" style="font-size:12px">${T('u.no_allies')}</p>`;
  return s + '</div>';
}
function diploHTML() { return v2DiploHTML(); }
document.addEventListener('click', e => {
  if (!v2On() || !S || UI.demo) return;
  const b = e.target.closest && e.target.closest('[data-v2esc]'); if (!b) return;
  v2OpenForm(b.dataset.v2esc, 'press', { on: ['escort'] });
});

/* ---------- 设置：每人一个“AI 来源” ---------- */
function v2OpenSettings() { // 05_boot.js 的 openSettings 开头转到这里（05_boot.js 在作用域的最后，同名声明盖不过它）
  const theme = document.documentElement.getAttribute('data-theme') || '';
  const r = (name, v, cur, label, small) => `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}><span>${label}${small ? `<small>${small}</small>` : ''}</span></label>`;
  const src = UI.engine === 'rules' ? 'off' : UI.aiSrc;
  const shared = typeof HA !== 'undefined' && HA.mode === 'remote' ? T('v2.src.now_host', { x: { raw: esc(haName()) } }) : LLM.available() ? T('v2.src.now_mine') : T('v2.src.now_none');
  showModal(`<h2>${T('u.settings')}</h2>
  <div class="opts">
    <div class="opt"><h4>${T('u.lang')}</h4><div class="radio">${r('sl', 'zh', I18N.getLang(), '中文')}${r('sl', 'en', I18N.getLang(), 'English')}</div><p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.lang_x')}</p></div>
    <div class="opt"><h4>${T('v2.src.h')}</h4><div class="radio">${r('v2src', 'auto', src, T('v2.src.auto'), T('v2.src.auto_x'))}${r('v2src', 'mine', src, T('v2.src.mine'), T('v2.src.mine_x'))}${r('v2src', 'off', src, T('v2.src.off'), T('v2.src.off_x'))}</div><p class="muted" style="font-size:12px;margin:6px 0 0">${shared}</p></div>
    <div class="opt"><h4>${T('u.depth')}</h4><div class="radio">${r('st', 'quick', UI.tier, T('u.quick'), T('u.quick_x'))}${r('st', 'default', UI.tier, T('u.std'))}${r('st', 'complex', UI.tier, T('u.deep'), T('u.deep_x'))}</div></div>
    <div class="opt"><h4>${T('u.display')}</h4><div class="radio">${r('th', '', theme, T('u.th_sys'))}${r('th', 'light', theme, T('u.th_light'))}${r('th', 'dark', theme, T('u.th_dark'))}</div><label style="display:flex;gap:8px;margin-top:8px;font-size:13px"><input type="checkbox" id="lblChk" ${UI.labels ? 'checked' : ''}>${T('u.labels')}</label></div>
  </div>
  ${typeof aiSettingsHTML === 'function' ? aiSettingsHTML() : ''}
  <div class="opts"><div class="opt"><h4>${T('u.saves')}</h4><div style="display:flex;gap:6px;flex-wrap:wrap"><button id="sExport" ${S && !UI.demo ? '' : 'disabled'}>${T('u.export')}</button><button id="sImport">${T('u.import')}</button><button id="sNew">${T('u.newgame')}</button><button id="sHelp">${T('u.help')}</button></div><p class="muted" style="font-size:12px">${T('u.autosave')}</p></div>
  <div class="foot"><button class="btn-primary" data-close="1">${T('u.done')}</button></div>`, 'narrow', true);
  const sh = $('#sheet');
  sh.querySelectorAll('input[name=sl]').forEach(x => (x.onchange = () => { setLang(x.value); openSettings(); }));
  sh.querySelectorAll('input[name=v2src]').forEach(x => (x.onchange = () => {
    if (x.value === 'off') UI.engine = 'rules'; else { UI.engine = 'auto'; UI.aiSrc = x.value; if (LLM.state === 'off') LLM.init().then(() => renderTop()); }
    savePrefs(); if (typeof haSync === 'function') haSync(); renderTop(); renderSide();
  }));
  sh.querySelectorAll('input[name=st]').forEach(x => (x.onchange = () => { UI.tier = x.value; savePrefs(); }));
  sh.querySelectorAll('input[name=th]').forEach(x => (x.onchange = () => { if (x.value) document.documentElement.setAttribute('data-theme', x.value); else document.documentElement.removeAttribute('data-theme'); savePrefs(); if (S) renderAll(); }));
  $('#lblChk').onchange = e => { UI.labels = e.target.checked; savePrefs(); placeLabels(); const lp = $('#lyrPanel'); if (lp && !lp.hidden) lp.innerHTML = lyrPanelHTML(); };
  $('#sExport').onclick = exportSave; $('#sImport').onclick = importSave; $('#sNew').onclick = () => showStart(S && S.player); $('#sHelp').onclick = mpShowHelp;
  if (typeof aiSettingsBind === 'function') aiSettingsBind();
}

/* ---------- 建局：AI 用量（省 / 标准 / 充分）；大国默认由 AI 扮演，逐国设定放进大厅的“高级设置” ---------- */
const V2_USE = ['save', 'std', 'full'];
const v2Use = c => (V2_USE.includes(c && c.aiUse) ? c.aiUse : 'std');
function mpCfgForm(c, scen) {
  c.aiUse = v2Use(c);
  const sl = (k, v) => `<label class="mpsl"><span>${T('mp.cost.' + k)}</span><input type="range" min="0.5" max="2" step="0.25" value="${v}" data-mpcost="${k}"><b>${v}×</b></label>`;
  return `<div class="opts">
    <div class="opt"><h4>${T('mp.cfg.costs')}</h4><p class="muted" style="font-size:12px;margin:0 0 6px">${T('mp.cfg.costs_x')}</p>${['infl', 'stab', 'resist', 'rep', 'interest', 'gain'].map(k => sl(k, c.we[k])).join('')}</div>
    <div class="opt"><h4>${T('mp.cfg.ai')}</h4>
      <label class="chk"><input type="checkbox" id="mpWeAI" ${c.weAI ? 'checked' : ''}> ${T('mp.cfg.weai')}</label>
      ${mpNoAI() ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${T('v2.use.noai')}</p>` : `<h4 style="margin-top:10px">${T('v2.use.h')}</h4><div class="radio">${V2_USE.map(v => `<label><input type="radio" name="v2use" value="${v}" ${c.aiUse === v ? 'checked' : ''}><span>${T('v2.use.' + v)}<small>${T('v2.use.' + v + '_x')}</small></span></label>`).join('')}</div>`}
      ${typeof haCfgHTML === 'function' ? haCfgHTML(c) : ''}
      <h4 style="margin-top:10px">${T('mp.cfg.timer')}</h4><select id="mpTimer">${[0, 180, 300, 600].map(v => `<option value="${v}" ${c.turnSec === v ? 'selected' : ''}>${v ? T('mp.min', { n: v / 60 }) : T('mp.notimer')}</option>`).join('')}</select>
      <h4 style="margin-top:10px">${T('u.ai_int')}</h4><select id="mpDiff">${['easy', 'normal', 'hard'].map(v => `<option value="${v}" ${c.diff === v ? 'selected' : ''}>${T('u.' + v)}</option>`).join('')}</select>
    </div></div>`;
}
function mpReadCfg(c) {
  const sh = $('#sheet');
  sh.querySelectorAll('[data-mpcost]').forEach(r => { c.we[r.dataset.mpcost] = +r.value; });
  const g = id => sh.querySelector(id); if (g('#mpHostAI')) c.hostAI = g('#mpHostAI').checked; if (g('#mpWeAI')) c.weAI = g('#mpWeAI').checked; if (g('#mpTimer')) c.turnSec = +g('#mpTimer').value; if (g('#mpDiff')) c.diff = g('#mpDiff').value;
  const u = sh.querySelector('input[name=v2use]:checked'); if (u) c.aiUse = u.value;
  c.aiUse = v2Use(c); c.llmWorld = c.aiUse !== 'save'; c.agentDef = 'claude'; c.th = false;
  return c;
}
const v2Agents = (list, skip) => { const a = {}; for (const r of list) if (!skip.includes(r.id)) a[r.id] = r.maj ? 'claude' : 'rule'; return a; }; // 先让几个大国由 AI 扮演
function mpShowCreate() {
  MPS.view = 'create';
  const scen = MPS.newScen = mpScenOf(MPS.newScen), c = MPS.newCfg || (MPS.newCfg = Object.assign(mpCfg0(), { aiUse: 'std', llmWorld: true, th: false })), list = mpPlayable(false, scen); if (!list.some(r => r.id === MPS.newPick)) MPS.newPick = mpDefPick(scen, list);
  mpBackdrop(scen);
  showModal(`<h2>${T('mp.create')}</h2>
    <label class="mpfield"><span>${T('mp.gname')}</span><input id="mpTitle" maxlength="40" value="${esc(MPS.newTitle || mpTitleDef(scen))}"></label>
    ${mpScenPickHTML(scen)}
    <h4>${T('mp.mycountry')}</h4><div class="picker" style="max-height:220px">${list.map(r => `<button class="pc ${r.id === MPS.newPick ? 'on' : ''}" data-npick="${r.id}"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}</span><small>GDP ${fmtB(r.g)} · ${T('u.power')} ${fmtN(r.p)}</small></button>`).join('')}</div>
    ${mpCfgForm(c, scen)}
    <div class="foot"><button data-mpgo="games">${T('u.back')}</button><button class="btn-primary" id="mpCreateGo">${T('mp.create_go')}</button></div>`, 'start', false);
  mpBindCostSliders();
  $$('#sheet [data-npick]').forEach(b => (b.onclick = () => { MPS.newTitle = $('#mpTitle').value; mpReadCfg(c); MPS.newPick = b.dataset.npick; mpShowCreate(); }));
  $$('#sheet [data-mpscen]').forEach(b => (b.onclick = () => { const t = $('#mpTitle').value; if (t !== mpTitleDef(scen)) MPS.newTitle = t; else MPS.newTitle = ''; mpReadCfg(c); MPS.newScen = b.dataset.mpscen; MPS.newPick = null; mpShowCreate(); }));
  $('#mpCreateGo').onclick = async () => {
    mpReadCfg(c); const title = String($('#mpTitle').value || '').trim().slice(0, 40) || 'Tianxia ' + ((W.SCENARIOS[scen] || {}).year || scen);
    const tdef = MPS.meName && title === mpTitleDef(scen) ? { n: String(MPS.meName).slice(0, 24), y: String((W.SCENARIOS[scen] || {}).year || scen) } : null;
    const gid = ('g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toLowerCase();
    const agents = v2Agents(list, [MPS.newPick]);
    const meta = { v: MP_VER, id: gid, title, ...(tdef ? { tdef } : {}), scen, created: Date.now(), status: 'lobby', host: MPS.uid, hostAt: Date.now(), hpk: MPX.mine() || null, turn: 0, phase: 'lobby', ver: 0, seats: { [MPS.newPick]: MPS.uid }, agents, cfg: { we: c.we, weAI: !!c.weAI, llmWorld: c.aiUse !== 'save', aiUse: c.aiUse, turnSec: c.turnSec | 0, diff: c.diff, th: false, thSec: 90, thPz: 'ev', hostAI: c.hostAI !== false },
      ...(window.TX_WEB && typeof haMetaAI === 'function' ? { ai: haMetaAI(c.hostAI !== false) } : {}) };
    try {
      await MPS.db.doc(P_META(gid)).set(meta);
      await MPS.db.doc(P_JOIN(gid) + '/' + MPS.uid).set({ seat: MPS.newPick, at: Date.now(), lang: mpMyLang(), pk: MPX.mine() || null });
      await MPS.db.doc(P_LEASE(gid)).acquire({ holder: mpHolder(), ttlMs: 60000 });
    } catch (e) { toast(T('mp.e.create', { x: { raw: (e && (e.message || e.code)) || '?' } }), 6000); return; }
    MPS.host = true; await mpOpenGame(gid); MPS.host = true; mpLobbyOrPlay();
  };
}
function mpRenderLobby(force) {
  if (!mpNet() || !MPS.meta || MPS.meta.status !== 'lobby') return;
  if (!force && !$('#sheet .mplobby')) return;
  const m = MPS.meta, scen = mpScenOf(m.scen), seats = m.seats || {}, list = mpPlayable(false, scen), mine = mpSeatOf(MPS.uid), host = m.host === MPS.uid;
  mpBackdrop(scen);
  const row = r => {
    const u = seats[r.id], ag = mpAg((m.agents || {})[r.id]);
    const who = u ? `<span class="mpwho"><i class="mpdot ${mpOnline(u) ? 'on' : ''}"></i>${esc(mpName(u))}${u === m.host ? ' 👑' : ''}</span>` : `<span class="muted mpwho">${T('mp.ag.' + ag)}</span>`;
    const act = u === MPS.uid ? `<button data-mp="leave">${T('mp.leave_seat')}</button>` : !u ? `<button data-mpseat="${r.id}">${T('mp.take')}</button>` : '';
    return `<div class="mpseat ${u === MPS.uid ? 'me' : ''}"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}</span>${who}<span class="mpact">${act}</span></div>`;
  };
  const majors = list.filter(r => r.maj), others = list.filter(r => !r.maj);
  const c = m.cfg || {}, cost = mpCostCfg(c.we), tsec = mpTurnSec(c.turnSec), use = v2Use(c);
  const adv = host && !mpNoAI() ? `<details class="v2adv"><summary>${T('v2.adv.h')}</summary><p class="muted" style="font-size:12px;margin:4px 0">${T('v2.adv.x')}</p><div class="mpseats">${majors.filter(r => !seats[r.id]).map(r => `<div class="mpseat"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}</span><select data-mpag="${r.id}">${['rule', 'claude'].map(v => `<option value="${v}" ${mpAg((m.agents || {})[r.id]) === v ? 'selected' : ''}>${T('mp.ag.' + v)}</option>`).join('')}</select><span class="mpact"></span></div>`).join('')}</div></details>` : '';
  showModal(`<div class="mplobby"><h2>${esc(mpTitleOf(m))}</h2><p class="sub"><b>${esc(mpScenTitle(scen))}</b> · ${T('mp.lobby_x')}</p>
    <div class="alert">${T('mp.share_hint')}${window.TX_WEB ? ` <button class="mini" id="mpInvite">${T('mp.web.invite')}</button>` : ''}</div>
    <h4>${T('mp.majors')}</h4><div class="mpseats">${majors.map(row).join('')}</div>
    <details${others.some(r => seats[r.id]) ? ' open' : ''}><summary>${T('mp.others', { n: others.length })}</summary><div class="mpseats">${others.map(row).join('')}</div></details>
    ${adv}
    <p class="muted" style="font-size:12px">${T('v2.cfg_sum', { a: Object.entries(cost).map(([k, v]) => T('mp.cost.' + k) + ' ' + v + '×').join(sep()), b: c.weAI ? T('mp.on') : T('mp.off'), c: mpNoAI() ? T('v2.use.rules') : T('v2.use.' + use), d: tsec ? T('mp.min', { n: tsec / 60 }) : T('mp.notimer') })}${typeof haSumTxt === 'function' ? haSumTxt(m) : ''}${host && window.TX_WEB && typeof haToggle === 'function' ? ` <button class="mini" id="haLobbyTog">${T(haCfgOn() ? 'ha.lobby_off' : 'ha.lobby_on')}</button>` : ''}</p>
    ${typeof haLobbyNote === 'function' ? haLobbyNote(m) : ''}
    ${!mine ? `<p class="warn" style="font-size:12.5px">${T('mp.pick_seat')}</p>` : ''}
    <div class="foot"><button data-mpgo="games">${T('mp.back_games')}</button>${host ? `<button class="btn-primary" id="mpStart" ${mine ? '' : 'disabled'}>${T('mp.start')}</button>` : `<span class="muted">${T('mp.wait_host')}</span>`}</div></div>`, 'start', false);
  $$('#sheet [data-mpseat]').forEach(b => (b.onclick = () => mpTakeSeat(b.dataset.mpseat)));
  $$('#sheet [data-mpag]').forEach(sl => (sl.onchange = () => mpMeta({ agents: { [sl.dataset.mpag]: mpAg(sl.value) } })));
  const d = $('#sheet details.v2adv'); if (d) { if (UI.v2adv) d.open = true; d.ontoggle = () => { UI.v2adv = d.open; }; }
  const st = $('#mpStart'); if (st) st.onclick = mpStartGame;
  const inv = $('#mpInvite'); if (inv) inv.onclick = () => mpWebInvite(MPS.gid);
  const hat = $('#haLobbyTog'); if (hat) hat.onclick = () => { haToggle(); mpRenderLobby(true); };
}
function mpStartGame() {
  const m = MPS.meta; if (!MPS.host || !m) return;
  const seats = m.seats || {}, hostSeat = mpSeatOf(MPS.uid); if (!hostSeat) return;
  const c0 = m.cfg || mpCfg0(), use = v2Use(c0);
  const c = { we: mpCostCfg(c0.we), weAI: !!c0.weAI, llmWorld: use !== 'save', aiUse: use, turnSec: mpTurnSec(c0.turnSec), diff: ['easy', 'normal', 'hard'].includes(c0.diff) ? c0.diff : 'normal', th: false, thSec: 90, thPz: 'ev', hostAI: c0.hostAI !== false };
  const ag0 = {}; for (const [C, a] of Object.entries(m.agents || {})) if (W.DEF[C]) ag0[C] = mpAg(a);
  const scen = mpScenOf(m.scen);
  const humans = [hostSeat].concat(Object.keys(seats).filter(C => seats[C] && C !== hostSeat));
  W.useScenario(scen);
  const seed = (Math.random() * 2 ** 31) >>> 0;
  S = W.newGame({ player: hostSeat, scen, seed, diff: c.diff, humans: humans.filter(C => W.DEF[C]), th: false });
  S.weCfg = c.we; S.weAI = c.weAI;
  const agents = Object.assign({}, ag0); for (const H of humans) delete agents[H];
  S.mp = { gid: MPS.gid, mode: 'net', agents, cfg: c, phase: 'plan', phaseAt: Date.now(), ver: 0, cmdDone: {}, cmdRes: {}, title: m.title, pks: {} };
  for (const u of Object.values(seats)) if (u) { const pk = mpPkOf(u); if (pk) S.mp.pks[u] = pk; }
  W.goalsInit(S);
  UI.demo = false; I18N.setPlayer(hostSeat); MPS.seat = hostSeat; MPS.queue = S.queue; MPS.ready = false; mpNoteLangs();
  closeModal(); UI.tab = 'home'; renderAll(); zoomTo(hostSeat);
  mpMeta({ status: 'play', phase: 'plan', turn: 0 });
  mpPublish(true).then(() => { mpExtDigests(); toast(T('mp.started'), 5000); });
}
function mpShowLocalSetup(mode) {
  MPS.view = 'local';
  MPS.localCfg = MPS.localCfg || {}; const c = MPS.localCfg[mode] || (MPS.localCfg[mode] = Object.assign(mpCfg0(), { aiUse: 'std', llmWorld: true, th: false }));
  const scen = MPS.localScen = mpScenOf(MPS.localScen), list = mpPlayable(false, scen);
  mpBackdrop(scen);
  if (MPS.localPick) MPS.localPick = MPS.localPick.filter(id => list.some(r => r.id === id));
  if (MPS.localPick && !MPS.localPick.length) MPS.localPick = null;
  const d0 = mpDefPick(scen, list), d1 = (list.find(r => r.maj && r.id !== d0) || list.find(r => r.id !== d0) || {}).id;
  const sel = MPS.localPick || (MPS.localPick = mode === 'hot' ? (scen === '1939' ? ['GBR', 'DEU'] : [d0, d1].filter(Boolean)) : [d0]);
  if (mode === 'solo' && sel.length > 1) sel.splice(1);
  showModal(`<h2>${T('mp.m.' + mode)}</h2><p class="sub">${T(mode === 'hot' ? 'mp.hot_x' : 'mp.solo_x')}</p>
    ${mpScenPickHTML(scen)}
    <h4>${T(mode === 'hot' ? 'mp.pick_many' : 'mp.mycountry')}</h4><div class="picker" style="max-height:230px">${list.map(r => `<button class="pc ${sel.includes(r.id) ? 'on' : ''}" data-lpick="${r.id}"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}${sel.includes(r.id) && mode === 'hot' ? ' · ' + (sel.indexOf(r.id) + 1) : ''}</span><small>GDP ${fmtB(r.g)} · ${T('u.power')} ${fmtN(r.p)}</small></button>`).join('')}</div>
    ${mpCfgForm(c, scen)}
    <div class="foot"><button data-mpgo="start">${T('u.back')}</button><button class="btn-primary" id="mpLocalGo" ${sel.length >= (mode === 'hot' ? 2 : 1) ? '' : 'disabled'}>${T('u.start')}</button></div>`, 'start', false);
  mpBindCostSliders();
  $$('#sheet [data-lpick]').forEach(b => (b.onclick = () => { mpReadCfg(c); const id = b.dataset.lpick; if (mode === 'solo') { sel.splice(0, sel.length, id); } else { const i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else if (sel.length < 8) sel.push(id); } mpShowLocalSetup(mode); }));
  $$('#sheet [data-mpscen]').forEach(b => (b.onclick = () => { mpReadCfg(c); MPS.localScen = b.dataset.mpscen; MPS.localPick = null; mpShowLocalSetup(mode); }));
  $('#mpLocalGo').onclick = () => {
    mpReadCfg(c); W.useScenario(scen);
    S = W.newGame({ player: sel[0], scen, seed: (Math.random() * 2 ** 31) >>> 0, diff: c.diff || 'normal', humans: sel.slice(), th: false });
    S.weCfg = mpCostCfg(c.we); S.weAI = !!c.weAI;
    S.mp = { mode, agents: v2Agents(list, sel), cfg: c, phase: 'plan', phaseAt: Date.now(), ver: 0 }; W.goalsInit(S);
    mpAdoptLocal(S, true); closeModal();
    toast(T('u.welcome', { x: { raw: dateStr(S) }, a: S.player }), 5000);
    if (mode === 'hot') mpHandoff(S.player, true);
  };
}
/* AI 用量为“充分”时，AI 扮演的大国才每年修订战略（房主付费，每回合最多两国） */
async function mpRefreshPlans() {
  if (v2Use(mpCfg()) !== 'full' || !useLLM() || MPS.planBusy || !S || S.over || (mpNet() && !MPS.host)) return;
  const S0 = S; const ags = (S0.mp && S0.mp.agents) || {};
  const list = W.IDS.filter(X => ags[X] === 'claude' && !W.isHuman(S0, X) && W.indep(S0, X) && !W.isNeutral(S0, X) && (!S0.actors[X].plan || S0.actors[X].plan.until <= S0.turn)).sort((a, b) => W.power(S0, b) - W.power(S0, a)).slice(0, 2);
  if (!list.length) return; MPS.planBusy = true;
  try {
    for (const X of list) {
      const H = S0.humans.slice().sort((a, b) => Math.abs(W.rel(S0, X, b)) + (W.atWar(S0, X, b) ? 100 : 0) - Math.abs(W.rel(S0, X, a)) - (W.atWar(S0, X, a) ? 100 : 0))[0];
      const langs = [...mpLangs()];
      try { const p = await W.withSeat(S0, H, () => LLM.plan(S0, X, { tier: 'default', lang: langs.length === 1 ? langs[0] : mpMyLang(), both: langs.length > 1 })); if (S === S0 && !MPS.busy && W.applyPlan(S0, X, p)) { if (mpNet()) mpPublishSoon(); else mpLocalSave(); } } catch (e) { if (e && ['not_granted', 'sampling_disabled', 'unavailable'].includes(e.code)) break; }
    }
  } finally { MPS.planBusy = false; }
}

/* ---------- 帮助 ---------- */
function mpShowHelp() {
  showModal(`<h2>${T('mp.help')}</h2><div class="help">${['flow', 'tabs', 'acts', 'pkg', 'deals', 'cmd', 'mob', 'ai', 'net', 'map', 'limits'].map(k => { const p = ['flow', 'net', 'map', 'limits'].includes(k) ? 'mp.h.' : 'v2.h.'; return `<p><b>${T(p + k)}</b>${T(p + k + '_x')}</p>`; }).join('')}${I18N.has('web.disc') ? `<p class="disc">${T('web.disc')}</p>` : ''}</div><div class="foot">${S && S.mp && S.mp.tut ? '' : `<button data-mpgo="tut">🎓 ${T('tut.menu')}</button>`}<button class="btn-primary" data-close="1">${T('u.gotit')}</button></div>`, 'narrow', true);
}

/* ---------- 新手教学：排行动那一步改成“援助法国”（多选表单），其余跟着新界面改说明 ---------- */
if (v2On()) {
  const i = TUT_STEPS.findIndex(z => z.k === 'summit');
  if (i >= 0) TUT_STEPS[i] = {
    k: 'v2aid', el: () => $('#tabbody [data-v2form="aid"]'),
    go: () => { tutTarget(); UI.open.v2keep_f_aid = true; renderSide(); },
    wait: () => S.queue.some(q => V2_GROUP_OF[q.type] === 'aid'),
    help: () => { tutTarget(); UI.open.v2keep_f_aid = true; const f = v2F('aid', UI.sel); f.on = { aid: true }; renderSide(); v2QueuePkg('aid', UI.sel); },
  };
}
