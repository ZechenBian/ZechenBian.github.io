// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 界面：开局方式、大厅、席位、就绪与回合 ===================== */
const MP_LOCAL = (window.TX_LSP || 'tianxia') + '.mp.local';
const MP_SCEN = '1939'; // 默认的开局年代
const MP_SCENS = ['1939', '1945', '1979', '2026']; // 联机版可选的四条时间线（按年代排列）
const MAJ39 = ['GBR', 'FRA', 'DEU', 'ITA', 'RUS', 'JPN', 'USA', 'CHN', 'CCP'];
const mpScenOk = id => MP_SCENS.includes(id) && !!W.SCENARIOS[id];
const mpScenOf = id => (mpScenOk(id) ? id : MP_SCEN);
// 对局名称：没改过的默认名称（“某某的 1939”）按各自的界面语言显示
const mpTitleDef = scen => T('mp.gname_def', { x: { raw: MPS.meName || T('mp.you') }, y: { raw: (W.SCENARIOS[scen] || {}).year || scen } });
const mpTitleOf = m => (m && m.tdef && typeof m.tdef === 'object' && typeof m.tdef.n === 'string' && m.tdef.n ? T('mp.gname_def', { x: { raw: m.tdef.n.slice(0, 24) }, y: { raw: String(m.tdef.y || '').slice(0, 8) } }) : String((m && (m.title || m.id)) || ''));
const mpScenTitle = id => { const s = W.SCENARIOS[mpScenOf(id)]; return s && s.title ? s.title[EN() ? 1 : 0] : String(id); };
/* 开局年代的选择（建局与本地开局共用） */
function mpScenPickHTML(cur) {
  return `<h4 style="margin:10px 0 0">${T('mp.scen')}</h4><div class="scenpick">${MP_SCENS.filter(mpScenOk).map(id => { const s = W.SCENARIOS[id]; return `<button data-mpscen="${id}" class="${id === cur ? 'on' : ''}"><b>${esc(s.title[EN() ? 1 : 0])}</b><small>${esc(s.blurb[EN() ? 1 : 0])}</small></button>`; }).join('')}</div>`;
}
/* 某个年代能入座的国家（按大国、实力排序）；大国：1939 年用历史上的列强，其余年代取实力前八 */
const MP_PLAY = {};
function mpPlayable(th, scen) {
  scen = mpScenOf(scen); th = th !== false && scen === '1939' && !!W.TH_ON;
  const k = scen + '|' + (th ? 1 : 0), SC = W.useScenario(scen);
  if (!MP_PLAY[k]) {
    const t = W.newGame({ player: SC.defPick || (scen === '1939' ? 'GBR' : 'USA'), seed: 1, scen, th });
    const rows = W.playable(t).map(id => ({ id, p: W.power(t, id), g: t.actors[id].gdp }));
    const maj = scen === '1939' ? MAJ39 : rows.slice().sort((a, b) => b.p - a.p).slice(0, 8).map(r => r.id);
    for (const r of rows) r.maj = maj.includes(r.id);
    MP_PLAY[k] = rows.sort((a, b) => (b.maj - a.maj) || b.p - a.p);
  }
  return MP_PLAY[k];
}
const mpDefPick = (scen, list) => { const d = (W.SCENARIOS[mpScenOf(scen)] || {}).defPick; return list.some(r => r.id === d) ? d : (list[0] || {}).id; };
const mpAgentOf = X => mpAg((S && S.mp && S.mp.agents && S.mp.agents[X]) || (MPS.meta && MPS.meta.agents && MPS.meta.agents[X]) || 'rule');
function mpInjectDOM() {
  if ($('#mpbar')) return;
  $('#tabs').insertAdjacentHTML('beforeend', `<button data-tab="comms"><span data-i18n="mp.t.comms">通讯</span><span class="dot" id="commsDot" hidden></span></button><button data-tab="weco"><span data-i18n="mp.t.weco">战时经济</span></button><button data-tab="theater" id="tabTheater" hidden><span data-i18n="th.t.tab">战区</span></button>`);
  $('#tabs').insertAdjacentHTML('beforebegin', `<div class="mpbar" id="mpbar" hidden></div>`);
  $('#cmdText').setAttribute('data-i18n-ph', 'mp.cmd_ph'); $('#cmdBtn').setAttribute('data-i18n', 'mp.cmd_btn');
  document.addEventListener('change', e => {
    const t = e.target; if (!S || !MPS.on) return;
    if (t.id === 'milPct') mpCmd('setMil', [+t.value]);
    if (t.id === 'mixSel' && t.value !== 'custom') { const x = S.actors[S.player]; mpCmd('setMix', [x.mix.slice(), t.value]); }
  });
  document.addEventListener('click', e => { const b = e.target.closest('#mpbar button, [data-mpgo]'); if (!b) return; mpBarClick(b); });
}
function mpBackdrop(scen) { if (!UI.demo || !S || S.scen === mpScenOf(scen)) return; const on = MPS.on; mpDemo(scen); MPS.on = on; } // 大厅与开局设置背后的地图换成所选年代（不改联网状态）
function mpDemo(scen) { scen = mpScenOf(scen); const SC = W.useScenario(scen); S = W.newGame({ player: SC.defPick || (scen === '1939' ? 'GBR' : 'USA'), seed: 7, scen }); I18N.setPlayer(null); UI.demo = true; MPS.on = false; renderMap(); renderTop(); renderQueue(); } // 开局画面背后的地图：所选年代的世界
function mpBoot(data) {
  mpInjectDOM(); applyStatic();
  let restored = null;
  try { if (data && data.save) restored = deserialize(data.save); } catch (e) { }
  if (!restored) try { const t = localStorage.getItem(MP_LOCAL); if (t) restored = deserialize(t); } catch (e) { }
  mpDemo();
  MPS.capsP = mpCaps().then(ok => { MPS.netOk = ok; const el = $('#mpNetStat'); if (el) el.innerHTML = mpNetStat(); return ok; });
  let last = null; try { last = localStorage.getItem(MP_LAST); } catch (e) { }
  if (restored && restored.mp && restored.mp.mode && restored.mp.mode !== 'net') { mpAdoptLocal(restored); return; }
  if (last) { MPS.capsP.then(ok => { if (ok) mpResume(last); else mpShowStart(); }); showModal(`<h2>${T('mp.connecting')}</h2><div class="foot"><div class="spinner"></div><button data-mpgo="start">${T('mp.back_start')}</button></div>`, 'narrow', false); return; }
  mpShowStart();
}
async function mpResume(gid) {
  try { const sn = await MPS.db.doc(P_META(gid)).get(); if (!sn.exists || (sn.data() || {}).status === 'over') { try { localStorage.removeItem(MP_LAST); } catch (e) { } mpShowStart(); return; } } catch (e) { mpShowStart(); return; }
  await mpOpenGame(gid); closeModal(); mpLobbyOrPlay();
}
if (window.TX_WEB && window.__txWeb) window.__txWeb.onStatus(() => { const el = document.querySelector('#mpNetStat'); if (el && MPS.netOk) el.innerHTML = mpNetStat(); }); // 中继陆续连上：开局画面的连接数跟着更新
const mpNetStat = () => (MPS.netOk ? `<span class="good">${T('mp.net_ok')}${mpRelayTxt()}</span>` : MPS.netOk === false ? `<span class="bad">${T('mp.net_no')}</span>` : T('mp.net_wait'));
const mpNoAI = () => !!window.TX_WEB && !LLM.available(); // 网页版没有接入 AI 推演时，不提供 AI 智能体与 AI 推演反应的选项
const mpRelayTxt = () => { const w = window.TX_WEB && window.__txWeb; if (!w) return ''; const r = w.relays(); return T('mp.web.relay', { n: r.filter(x => x.up).length, m: r.length }); };
/* 网页版：联网昵称（写在中继上，别的玩家在席位表里看到） */
function mpWebNickHTML() { const w = window.TX_WEB && window.__txWeb; if (!w) return ''; return `<label class="mpfield mpnick"><span>${T('mp.web.nick')}</span><input id="mpNick" maxlength="20" placeholder="${esc(T('mp.web.nick_ph'))}" value="${esc(w.name())}"></label>${typeof aiStartHTML === 'function' ? aiStartHTML() : ''}<p class="muted" style="font-size:12px;margin:4px 0 0">${T('mp.web.note')}</p>`; }
function mpWebNickBind() { if (typeof aiStartBind === 'function') aiStartBind(); const ni = $('#mpNick'); if (!ni || !window.__txWeb) return; ni.onchange = () => { const v = window.__txWeb.setName(ni.value); ni.value = v; MPS.meName = v; if (MPS.uid) MPS.names[MPS.uid] = { id: MPS.uid, name: v }; }; }
function mpShowStart() {
  mpUnsubAll(); MPS.on = false; MPS.view = 'start';
  const card = (k, ico, extra) => `<button class="mpmode" data-mpgo="${k}"><b>${ico} ${T('mp.m.' + k)}</b><small>${T('mp.m.' + k + '_x')}</small>${extra || ''}</button>`;
  let local = null; try { const t = localStorage.getItem(MP_LOCAL); if (t) { const o = JSON.parse(t); local = o && o.mp ? o : null; } } catch (e) { }
  showModal(`<div class="start-h"><h1>${T('mp.title')}</h1><div class="langpick"><button data-slang="zh" class="${EN() ? '' : 'on'}">中文</button><button data-slang="en" class="${EN() ? 'on' : ''}">English</button></div></div>
    <p class="sub">${T('mp.intro')}</p>
    <ul class="mpfeat"><li>${T('mp.f1')}</li><li>${T('mp.f2')}</li><li>${T('mp.f3')}</li><li>${T('mp.f4')}</li></ul>
    ${tutDone() ? '' : tutCTA(true)}
    <div class="mpmodes">${card('net', '🌐', `<em id="mpNetStat">${mpNetStat()}</em>`)}${card('hot', '🪑')}${card('solo', '🤖')}</div>
    ${tutDone() ? tutCTA(false) : ''}
    ${mpWebNickHTML()}
    ${local ? `<div class="alert" style="margin-top:12px">${T('mp.local_save', { x: { raw: T('mp.m.' + local.mp.mode) }, d: { raw: dateStr(local) } })} <button data-mpgo="resume_local">${T('u.continue_save')}</button></div>` : ''}
    <p class="muted" style="font-size:12px;margin-top:10px">${T('mp.scen_note')}</p>${I18N.has('web.disc') ? `<p class="muted disc">${T('web.disc')}</p>` : ''}`, 'start', false);
  $$('#sheet [data-slang]').forEach(b => (b.onclick = () => { setLang(b.dataset.slang); mpShowStart(); }));
  mpWebNickBind();
}
function mpBarClick(b) {
  const g = b.dataset.mpgo || b.dataset.mp;
  switch (g) {
    case 'start': mpShowStart(); break;
    case 'net': { if (MPS.netOk === false) MPS.capsP = mpCaps().then(ok => { MPS.netOk = ok; const el = $('#mpNetStat'); if (el) el.innerHTML = mpNetStat(); return ok; }); MPS.capsP.then(ok => (ok ? mpShowGames() : toast(T('mp.net_no'), 5000))); break; } // 上次没连上：再试一次
    case 'hot': mpShowLocalSetup('hot'); break;
    case 'solo': mpShowLocalSetup('solo'); break;
    case 'tut': tutStart(); break; // 新手教学
    case 'resume_local': { try { const o = deserialize(localStorage.getItem(MP_LOCAL)); mpAdoptLocal(o); closeModal(); } catch (e) { toast(T('u.load_fail', { x: { raw: e.message } })); } break; }
    case 'create': mpShowCreate(); break;
    case 'lobby': mpRenderLobby(true); break;
    case 'ready': mpEndTurn(); break;
    case 'force': if (MPS.host) mpConfirm(T('mp.force_q'), () => mpResolve()); break;
    case 'leave': mpLeaveSeat(); break;
    case 'games': mpShowGames(); break;
    case 'menu': mpShowMenu(); break;
  }
}

/* ---------- 联网：对局列表 ---------- */
function mpShowGames() {
  mpUnsubAll(); MPS.on = false; MPS.view = 'games';
  const render = list => {
    if (MPS.view !== 'games') return;
    const rows = list.map(g => { const st = MP_STATUS.includes(g.status) ? g.status : 'lobby', n = Object.values(g.seats || {}).filter(Boolean).length, mine = Object.entries(g.seats || {}).find(([c, u]) => u === MPS.uid && W.DEF[c]); const live = +g.hostAt && Date.now() - g.hostAt < 120000;
      return `<div class="item"><div class="row"><b>${esc(mpTitleOf(g))}</b><span class="tag ${st === 'play' ? 'blue' : st === 'over' ? '' : 'acc'}">${T('mp.st.' + st)}</span></div><div class="row muted" style="font-size:12px"><span>${esc(g.date || mpScenTitle(g.scen))} · ${T('mp.seated', { n })}${mine ? ' · ' + T('mp.mine', { a: mine[0] }) : ''}</span><span class="${live ? 'good' : 'muted'}">${live ? T('mp.host_on') : T('mp.host_off')}</span></div><div class="btns"><button class="btn-primary" data-mpopen="${esc(g.id)}">${T(st === 'lobby' ? 'mp.enter' : 'mp.enter_play')}</button></div></div>`; }).join('');
    showModal(`<h2>${T('mp.games')}</h2><p class="sub">${T('mp.games_x')}</p><div class="list">${rows || `<p class="muted">${T('mp.no_games')}</p>`}</div>
      <div class="foot"><button data-mpgo="start">${T('mp.back_start')}</button><button class="btn-primary" data-mpgo="create">${T('mp.create')}</button></div>`, 'narrow', false);
    $$('#sheet [data-mpopen]').forEach(b => (b.onclick = async () => { const gid = b.dataset.mpopen; await mpOpenGame(gid); mpLobbyOrPlay(); }));
  };
  render([]);
  try {
    const u = MPS.db.collection('txs').orderBy('created', 'desc').limit(30).onSnapshot(q => { if (MPS.on || MPS.view !== 'games') return; render(q.docs.map(d => Object.assign({}, d.data(), { id: d.id })).filter(g => g.v === MP_VER && mpScenOk(g.scen) && g.status !== 'over' && /^[a-z0-9]{4,40}$/.test(g.id) && (!window.TX_WEB || (+g.hostAt && Date.now() - g.hostAt < 3 * 864e5)))); }, e => console.warn('games', e)); // 网页版：房主三天没来过的对局不再列出
    MPS.unsub.push(u);
  } catch (e) { console.warn(e); }
}
function mpLobbyOrPlay() {
  const gid = MPS.gid;
  const wait = () => { if (gid !== MPS.gid || !mpNet()) return; if (!MPS.meta) return setTimeout(wait, 200); if (MPS.meta.status === 'lobby') mpRenderLobby(true); else { closeModal(); if (!mpLive()) showModal(`<h2>${T('mp.loading')}</h2><div class="foot"><div class="spinner"></div><button data-mpgo="games">${T('mp.back_games')}</button></div>`, 'narrow', false); const w2 = () => { if (gid !== MPS.gid || !mpNet()) return; if (mpLive()) { if ($('#sheet h2') && $('#sheet h2').textContent === T('mp.loading')) closeModal(); renderAll(); zoomTo(MPS.seat || S.player); if (!MPS.seat) mpOfferSeat(); } else setTimeout(w2, 300); }; w2(); } };
  wait();
}

/* ---------- 联网：新建对局 ---------- */
function mpCfgForm(c, scen) {
  const sl = (k, v) => `<label class="mpsl"><span>${T('mp.cost.' + k)}</span><input type="range" min="0.5" max="2" step="0.25" value="${v}" data-mpcost="${k}"><b>${v}×</b></label>`;
  return `<div class="opts">
    <div class="opt"><h4>${T('mp.cfg.costs')}</h4><p class="muted" style="font-size:12px;margin:0 0 6px">${T('mp.cfg.costs_x')}</p>${['infl', 'stab', 'resist', 'rep', 'interest', 'gain'].map(k => sl(k, c.we[k])).join('')}</div>
    <div class="opt"><h4>${T('mp.cfg.ai')}</h4>
      <label class="chk"><input type="checkbox" id="mpWeAI" ${c.weAI ? 'checked' : ''}> ${T('mp.cfg.weai')}</label>
      ${mpNoAI() ? '' : `<label class="chk"><input type="checkbox" id="mpLLMW" ${c.llmWorld ? 'checked' : ''}> ${T('mp.cfg.llmw')}</label>
      <div class="radio" style="margin-top:6px">${['rule', 'claude'].map(v => `<label><input type="radio" name="mpAgDef" value="${v}" ${c.agentDef === v ? 'checked' : ''}><span>${T('mp.ag.' + v)}<small>${T('mp.ag.' + v + '_x')}</small></span></label>`).join('')}</div>`}
      ${typeof haCfgHTML === 'function' ? haCfgHTML(c) : ''}
      <h4 style="margin-top:10px">${T('mp.cfg.timer')}</h4><select id="mpTimer">${[0, 180, 300, 600].map(v => `<option value="${v}" ${c.turnSec === v ? 'selected' : ''}>${v ? T('mp.min', { n: v / 60 }) : T('mp.notimer')}</option>`).join('')}</select>
      ${W.TH_ON && mpScenOf(scen) === '1939' ? `<h4 style="margin-top:10px">${T('th.cfg.t')}</h4><label class="chk"><input type="checkbox" id="mpTh" ${c.th !== false ? 'checked' : ''}> ${T('th.cfg.on')}</label><p class="muted" style="font-size:11.5px;margin:2px 0 4px">${T('th.cfg.x')}</p><select id="mpThSec">${TH_SECS.map(v => `<option value="${v}" ${(c.thSec ?? 90) === v ? 'selected' : ''}>${v ? T('th.cfg.sec', { n: v }) : T('th.cfg.nopause')}</option>`).join('')}</select> <select id="mpThPz">${['ev', 'all'].map(v => `<option value="${v}" ${(c.thPz || 'ev') === v ? 'selected' : ''}>${T('th.cfg.pz_' + v)}</option>`).join('')}</select>` : ''}
      <h4 style="margin-top:10px">${T('u.ai_int')}</h4><select id="mpDiff">${['easy', 'normal', 'hard'].map(v => `<option value="${v}" ${c.diff === v ? 'selected' : ''}>${T('u.' + v)}</option>`).join('')}</select>
    </div></div>`;
}
function mpReadCfg(c) {
  const sh = $('#sheet');
  sh.querySelectorAll('[data-mpcost]').forEach(r => { c.we[r.dataset.mpcost] = +r.value; });
  const g = id => sh.querySelector(id); if (g('#mpHostAI')) c.hostAI = g('#mpHostAI').checked; if (g('#mpWeAI')) c.weAI = g('#mpWeAI').checked; if (g('#mpLLMW')) c.llmWorld = g('#mpLLMW').checked; if (g('#mpTimer')) c.turnSec = +g('#mpTimer').value; if (g('#mpDiff')) c.diff = g('#mpDiff').value; if (g('#mpTh')) c.th = g('#mpTh').checked; if (g('#mpThSec')) c.thSec = +g('#mpThSec').value; if (g('#mpThPz')) c.thPz = g('#mpThPz').value === 'all' ? 'all' : 'ev';
  const ag = sh.querySelector('input[name=mpAgDef]:checked'); if (ag) c.agentDef = ag.value;
  return c;
}
const mpCfg0 = () => ({ we: { infl: 1, stab: 1, resist: 1, rep: 1, interest: 1, gain: 1 }, weAI: false, llmWorld: false, agentDef: 'rule', turnSec: 0, diff: 'normal', th: !!W.TH_ON, thSec: 90, thPz: 'ev', hostAI: true }); // 构建里没有精细战区的数据时默认关闭；hostAI：网页版房主把自己的 AI 共享给所有玩家
function mpBindCostSliders() { $$('#sheet [data-mpcost]').forEach(r => (r.oninput = () => { r.nextElementSibling.textContent = r.value + '×'; })); }
function mpShowCreate() {
  MPS.view = 'create';
  const scen = MPS.newScen = mpScenOf(MPS.newScen), c = MPS.newCfg || (MPS.newCfg = mpCfg0()), list = mpPlayable(c.th, scen); if (!list.some(r => r.id === MPS.newPick)) MPS.newPick = mpDefPick(scen, list);
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
    const tdef = MPS.meName && title === mpTitleDef(scen) ? { n: String(MPS.meName).slice(0, 24), y: String((W.SCENARIOS[scen] || {}).year || scen) } : null; // 没改过的默认名称：别的玩家按各自的语言显示
    const gid = ('g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toLowerCase();
    const agents = {}; for (const r of list) if (r.id !== MPS.newPick) agents[r.id] = c.agentDef;
    const meta = { v: MP_VER, id: gid, title, ...(tdef ? { tdef } : {}), scen, created: Date.now(), status: 'lobby', host: MPS.uid, hostAt: Date.now(), hpk: MPX.mine() || null, turn: 0, phase: 'lobby', ver: 0, seats: { [MPS.newPick]: MPS.uid }, agents, cfg: { we: c.we, weAI: !!c.weAI, llmWorld: !!c.llmWorld, turnSec: c.turnSec | 0, diff: c.diff, th: c.th !== false && scen === '1939', thSec: TH_SECS.includes(+c.thSec) ? +c.thSec : 90, thPz: c.thPz === 'all' ? 'all' : 'ev', hostAI: c.hostAI !== false },
      ...(window.TX_WEB && typeof haMetaAI === 'function' ? { ai: haMetaAI(c.hostAI !== false) } : {}) }; // 网页版：房主能否把自己的 AI 共享给所有玩家
    try {
      await MPS.db.doc(P_META(gid)).set(meta);
      await MPS.db.doc(P_JOIN(gid) + '/' + MPS.uid).set({ seat: MPS.newPick, at: Date.now(), lang: mpMyLang(), pk: MPX.mine() || null });
      await MPS.db.doc(P_LEASE(gid)).acquire({ holder: mpHolder(), ttlMs: 60000 });
    } catch (e) { toast(T('mp.e.create', { x: { raw: (e && (e.message || e.code)) || '?' } }), 6000); return; }
    MPS.host = true; await mpOpenGame(gid); MPS.host = true; mpLobbyOrPlay();
  };
}

/* ---------- 联网：大厅（入座、智能体模式、开始） ---------- */
function mpRenderLobby(force) {
  if (!mpNet() || !MPS.meta || MPS.meta.status !== 'lobby') return;
  if (!force && !$('#sheet .mplobby')) return;
  const m = MPS.meta, scen = mpScenOf(m.scen), seats = m.seats || {}, list = mpPlayable(!(m.cfg && m.cfg.th === false), scen), mine = mpSeatOf(MPS.uid), host = m.host === MPS.uid;
  mpBackdrop(scen);
  const row = r => {
    const u = seats[r.id], ag = mpAg((m.agents || {})[r.id]);
    const agSel = mpNoAI() ? `<span class="muted mpwho">${T('mp.ag.' + ag)}</span>` : `<select data-mpag="${r.id}" title="${esc(T('mp.cfg.ai'))}">${(window.TX_WEB ? ['rule', 'claude'] : ['rule', 'claude', 'ext']).map(v => `<option value="${v}" ${ag === v ? 'selected' : ''}>${T('mp.ag.' + v)}</option>`).join('')}</select>`; // 网页版：房主接入了 AI 才能选 AI 智能体；没有外部智能体
    const who = u ? `<span class="mpwho"><i class="mpdot ${mpOnline(u) ? 'on' : ''}"></i>${esc(mpName(u))}${u === m.host ? ' 👑' : ''}</span>` : host ? agSel : `<span class="muted mpwho">${T('mp.ag.' + ag)}</span>`;
    const act = u === MPS.uid ? `<button data-mp="leave">${T('mp.leave_seat')}</button>` : !u ? `<button data-mpseat="${r.id}">${T('mp.take')}</button>` : '';
    return `<div class="mpseat ${u === MPS.uid ? 'me' : ''}"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}</span>${who}<span class="mpact">${act}</span></div>`;
  };
  const majors = list.filter(r => r.maj), others = list.filter(r => !r.maj);
  const c = m.cfg || {}, cost = mpCostCfg(c.we), tsec = mpTurnSec(c.turnSec);
  showModal(`<div class="mplobby"><h2>${esc(mpTitleOf(m))}</h2><p class="sub"><b>${esc(mpScenTitle(scen))}</b> · ${T('mp.lobby_x')}</p>
    <div class="alert">${T('mp.share_hint')}${window.TX_WEB ? ` <button class="mini" id="mpInvite">${T('mp.web.invite')}</button>` : ''}</div>
    <h4>${T('mp.majors')}</h4><div class="mpseats">${majors.map(row).join('')}</div>
    <details${others.some(r => seats[r.id]) ? ' open' : ''}><summary>${T('mp.others', { n: others.length })}</summary><div class="mpseats">${others.map(row).join('')}</div></details>
    <p class="muted" style="font-size:12px">${T('mp.cfg_sum', { a: Object.entries(cost).map(([k, v]) => T('mp.cost.' + k) + ' ' + v + '×').join(sep()), b: c.weAI ? T('mp.on') : T('mp.off'), c: c.llmWorld ? T('mp.on') : T('mp.off'), d: tsec ? T('mp.min', { n: tsec / 60 }) : T('mp.notimer') })}${W.TH_ON && scen === '1939' ? ` · ${T('th.cfg.t')} ${c.th === false ? T('mp.off') : T('mp.on')}` : ''}${typeof haSumTxt === 'function' ? haSumTxt(m) : ''}${host && window.TX_WEB && typeof haToggle === 'function' ? ` <button class="mini" id="haLobbyTog">${T(haCfgOn() ? 'ha.lobby_off' : 'ha.lobby_on')}</button>` : ''}</p>
    ${typeof haLobbyNote === 'function' ? haLobbyNote(m) : ''}
    ${!mine ? `<p class="warn" style="font-size:12.5px">${T('mp.pick_seat')}</p>` : ''}
    <div class="foot"><button data-mpgo="games">${T('mp.back_games')}</button>${host ? `<button class="btn-primary" id="mpStart" ${mine ? '' : 'disabled'}>${T('mp.start')}</button>` : `<span class="muted">${T('mp.wait_host')}</span>`}</div></div>`, 'start', false);
  $$('#sheet [data-mpseat]').forEach(b => (b.onclick = () => mpTakeSeat(b.dataset.mpseat)));
  $$('#sheet [data-mpag]').forEach(sl => (sl.onchange = () => mpMeta({ agents: { [sl.dataset.mpag]: mpAg(sl.value) } })));
  const st = $('#mpStart'); if (st) st.onclick = mpStartGame;
  const inv = $('#mpInvite'); if (inv) inv.onclick = () => mpWebInvite(MPS.gid);
  const hat = $('#haLobbyTog'); if (hat) hat.onclick = () => { haToggle(); mpRenderLobby(true); };
}
/* 网页版：邀请链接（网址后加 ?g=对局编号，点开直接进入这局） */
function mpWebInvite(gid) {
  const link = location.origin + location.pathname + '?g=' + encodeURIComponent(gid);
  const show = () => { showModal(`<h2>${T('mp.web.link')}</h2><input id="mpLink" readonly style="width:100%;font-family:var(--f-mono);font-size:12px" value="${esc(link)}"><div class="foot"><button class="btn-primary" data-close="1">${T('u.done')}</button></div>`, 'narrow', true); const el = $('#mpLink'); if (el) { el.focus(); el.select(); } UI.afterClose = () => mpRenderLobby(true); };
  try { navigator.clipboard.writeText(link).then(() => toast(T('mp.web.copied'), 5000), show); } catch (e) { show(); }
}
async function mpTakeSeat(C) {
  if (!MPS.canWrite && MPS.canWrite !== null && MPS.canWrite !== undefined) { toast(T('mp.e.nowrite'), 6000); return; }
  try { await MPS.db.doc(P_JOIN(MPS.gid) + '/' + MPS.uid).set({ seat: C, at: Date.now(), lang: mpMyLang(), pk: MPX.mine() || null }); mpEmit('tick', { j: 1 }); toast(T('mp.seat_req', { a: C })); } catch (e) { toast(T('mp.e.nowrite'), 6000); }
}
function mpLeaveSeat() {
  mpConfirm(T('mp.leave_q'), async () => { try { await MPS.db.doc(P_JOIN(MPS.gid) + '/' + MPS.uid).set({ seat: null, at: Date.now(), lang: mpMyLang(), pk: MPX.mine() || null }); mpEmit('tick', { j: 1 }); } catch (e) { } });
}
function mpConfirm(text, yes) {
  showModal(`<p style="font-size:14px">${esc(text)}</p><div class="foot"><button data-close="1">${T('u.cancel')}</button><button class="btn-primary" id="mpYes">${T('u.confirm')}</button></div>`, 'narrow', true);
  $('#mpYes').onclick = () => { UI.afterClose = null; closeModal(); yes(); };
}
function mpOfferSeat() {
  if (!S || !S.mp || MPS.seat) return;
  const free = W.playable(S).filter(id => !W.isHuman(S, id) && mpAgentOf(id) !== 'ext');
  showModal(`<h2>${T('mp.join_play')}</h2><p class="sub">${T('mp.join_play_x')}</p><div class="picker" style="max-height:300px">${free.map(id => `<button class="pc" data-jseat="${id}"><span class="n"><i style="background:${polColor(id)}"></i>${esc(NAME(id))}</span><small>${T('u.power')} ${fmtN(W.power(S, id))} · ${T('mp.ag.' + mpAgentOf(id))}</small></button>`).join('')}</div>
    <div class="foot"><button data-close="1">${T('mp.watch')}</button></div>`, 'narrow', true);
  $$('#sheet [data-jseat]').forEach(b => (b.onclick = () => { mpTakeSeat(b.dataset.jseat); closeModal(); }));
}
function mpStartGame() {
  const m = MPS.meta; if (!MPS.host || !m) return;
  const seats = m.seats || {}, hostSeat = mpSeatOf(MPS.uid); if (!hostSeat) return;
  const c0 = m.cfg || mpCfg0(), c = { we: mpCostCfg(c0.we), weAI: !!c0.weAI, llmWorld: !!c0.llmWorld, turnSec: mpTurnSec(c0.turnSec), diff: ['easy', 'normal', 'hard'].includes(c0.diff) ? c0.diff : 'normal', th: c0.th !== false, thSec: TH_SECS.includes(+c0.thSec) ? +c0.thSec : 90, thPz: c0.thPz === 'all' ? 'all' : 'ev' };
  if (window.TX_WEB) c.hostAI = c0.hostAI !== false; // 网页版：房主的 AI 统一推演（src/web/ui/04y_hostai.js）
  const ag0 = {}; for (const [C, a] of Object.entries(m.agents || {})) if (W.DEF[C]) ag0[C] = mpAg(a);
  const scen = mpScenOf(m.scen); if (scen !== '1939') c.th = false;
  const play = new Set(mpPlayable(c.th, scen).map(r => r.id)), ext = Object.entries(ag0).filter(([C, a]) => a === 'ext' && !seats[C] && play.has(C)).map(([C]) => C);
  const humans = [hostSeat].concat(Object.keys(seats).filter(C => seats[C] && C !== hostSeat)).concat(ext);
  W.useScenario(scen);
  const seed = (Math.random() * 2 ** 31) >>> 0;
  S = W.newGame({ player: hostSeat, scen, seed, diff: c.diff, humans: humans.filter(C => W.DEF[C]), th: c.th });
  S.weCfg = c.we; S.weAI = c.weAI;
  const agents = Object.assign({}, ag0); for (const H of humans) if (!ext.includes(H)) delete agents[H];
  S.mp = { gid: MPS.gid, mode: 'net', agents, cfg: c, phase: 'plan', phaseAt: Date.now(), ver: 0, cmdDone: {}, cmdRes: {}, title: m.title, pks: {} };
  for (const u of Object.values(seats)) if (u) { const pk = mpPkOf(u); if (pk) S.mp.pks[u] = pk; } // 记下各玩家开局时的公钥
  W.goalsInit(S); // 目标与计分的起点
  if (S.th) for (const C of ext) for (const Tt of W.thTheaters(S)) S.th.T[Tt].staff[C] = true; // 外部智能体的战区部队默认由参谋（AI）指挥；它也可以用 thStaff/thOrder 自己指挥
  UI.demo = false; I18N.setPlayer(hostSeat); MPS.seat = hostSeat; MPS.queue = S.queue; MPS.ready = false; mpNoteLangs();
  closeModal(); UI.tab = 'home'; renderAll(); zoomTo(hostSeat);
  mpMeta({ status: 'play', phase: 'plan', turn: 0 });
  mpPublish(true).then(() => { mpExtDigests(); toast(T('mp.started'), 5000); });
}

/* ---------- 本地：热座 / 单人+智能体 ---------- */
function mpShowLocalSetup(mode) {
  MPS.view = 'local';
  MPS.localCfg = MPS.localCfg || {}; const c = MPS.localCfg[mode] || (MPS.localCfg[mode] = Object.assign(mpCfg0(), { llmWorld: mode === 'solo' && LLM.available() }));
  const scen = MPS.localScen = mpScenOf(MPS.localScen), list = mpPlayable(c.th, scen);
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
    S = W.newGame({ player: sel[0], scen, seed: (Math.random() * 2 ** 31) >>> 0, diff: c.diff || 'normal', humans: sel.slice(), th: c.th !== false && scen === '1939' });
    S.weCfg = mpCostCfg(c.we); S.weAI = !!c.weAI;
    const agents = {}; for (const r of list) if (!sel.includes(r.id)) agents[r.id] = mpAg(c.agentDef);
    S.mp = { mode, agents, cfg: c, phase: 'plan', phaseAt: Date.now(), ver: 0 }; W.goalsInit(S);
    mpAdoptLocal(S, true); closeModal();
    toast(T('u.welcome', { x: { raw: dateStr(S) }, a: S.player }), 5000);
    if (mode === 'hot') mpHandoff(S.player, true);
  };
}
function mpAdoptLocal(s, fresh) {
  mpUnsubAll(); S = s; W.useScenario(S.scen || MP_SCEN); UI.demo = false;
  Object.assign(MPS, { on: true, mode: S.mp.mode, gid: null, seat: S.player, host: true, queue: S.queue, ready: false, hotDone: S.mp.hotDone || {}, hotReports: S.mp.hotReports || {} });
  I18N.setPlayer(S.player); UI.sel = null; UI.tab = 'home'; UI.params = {}; UI.open = {}; UI.move = {}; UI.crisisSeen = {};
  renderAll(); zoomTo(S.player);
  if (S.mp.mode === 'hot' && !fresh && !S.over) { const H = S.mp.hotTurn && W.isHuman(S, S.mp.hotTurn) ? S.mp.hotTurn : S.humans.find(h => !MPS.hotDone[h]) || S.player; mpHandoff(H); } // 继续热座：先交接，避免看到别人的信息
}
/* 导入存档：联机版只按本地模式（热座 / 单人）载入；单人版存档视为单人 + 智能体 */
function mpAdoptImported(s) {
  if (!s || !s.actors) throw new Error('bad save');
  if (!s.mp || s.mp.mode === 'net') { s.mp = { mode: s.humans && s.humans.length > 1 ? 'hot' : 'solo', agents: {}, cfg: mpCfg0(), phase: 'plan', phaseAt: Date.now(), ver: 0 }; delete s.mp.gid; if (s.humans && s.humans.length > 1) s.humans = s.humans.filter(h => h === s.player || (s.seats && s.seats[h])); }
  mpAdoptLocal(s); mpLocalSave();
}
function mpLocalSave() { if (!S || UI.demo || !MPS.on || MPS.mode === 'net' || (S.mp && S.mp.tut)) return; // 教学局不存档（不覆盖玩家的本地存档）
  S.mp.hotDone = MPS.hotDone; S.mp.hotReports = MPS.hotReports || {}; try { localStorage.setItem(MP_LOCAL, serialize(S)); } catch (e) { } }
/* 热座：轮到下一位时遮住上一位的信息 */
function mpHandoff(H, first) {
  showModal(`<div class="mphand"><div class="kicker">${T('mp.m.hot')}</div><h1><i style="background:${polColor(H)}"></i>${esc(I18N.countryName(H))}</h1><p class="sub">${T(first ? 'mp.hand_first' : 'mp.hand_x', { a: { id: H } })}</p><div class="foot"><button class="btn-primary" id="mpHandGo">${T('mp.hand_go')}</button></div></div>`, 'narrow', false);
  $('#modal').classList.add('opaque'); // 交接时遮住上一位玩家的信息
  if (S && S.mp) { S.mp.hotTurn = H; mpLocalSave(); }
  $('#mpHandGo').onclick = () => {
    $('#modal').classList.remove('opaque'); W.adoptSeat(S, H); MPS.seat = H; I18N.setPlayer(H); closeModal(); UI.sel = null; renderAll(); zoomTo(H);
    const R = S.report; if (MPS.hotReports && MPS.hotReports[H] && R && !R.intro) { delete MPS.hotReports[H]; mpLocalSave(); showReport(R); if (typeof thRepInject === 'function') thRepInject(R); UI.afterClose = () => (S.over ? showGameOver() : nextCrisis()); }
  };
}

/* ---------- 结束回合 / 就绪 ---------- */
function mpEndTurn() {
  if (!S || UI.demo || !MPS.on) { mpShowStart(); return; }
  if (UI.busy || MPS.busy) return;
  if (S.over) { showGameOver(); return; }
  if (MPS.mode === 'net') {
    if (!MPS.seat) { toast(T('mp.e.spectator')); return; }
    if (mpResolving()) return;
    if (MPS.passive) { toast(T('mp.e.passive')); return; }
    MPS.ready = !MPS.ready; MPS.queue = S.queue; mpSaveMine(); mpPresence(); renderTop();
    toast(T(MPS.ready ? 'mp.ready_on' : 'mp.ready_off'));
    if (MPS.host) mpMaybeResolve();
    return;
  }
  if (MPS.mode === 'hot') {
    MPS.hotDone[S.player] = true;
    const nx = S.humans.find(H => !MPS.hotDone[H]);
    if (nx) { mpLocalSave(); mpHandoff(nx); return; }
    // 所有人都规划完毕：结算，再依次交给每位玩家看报告
    const order = S.humans.slice();
    mpResolve().then(() => { if (S.over) { closeModal(); showGameOver(); return; } MPS.hotReports = {}; for (const H of order) if (W.isHuman(S, H)) MPS.hotReports[H] = true; mpLocalSave(); closeModal(); const first = S.humans.find(H => MPS.hotReports[H]); if (first) mpHandoff(first); });
    return;
  }
  mpResolve();
}

/* ---------- 顶部联机状态栏 ---------- */
const mpBoardBtn = () => { if (typeof glOn !== 'function' || !glOn()) return ''; const sc = W.scoreOf(S, S.player); return sc ? `<button data-gl="board" class="mini" title="${esc(T('gl.board'))}">🏆 ${sc.total}</button>` : ''; };
function mpRenderBar() {
  const bar = $('#mpbar'); if (!bar) return;
  if (!MPS.on || !S || UI.demo) { bar.hidden = true; const be = $('#btnEnd'); if (be && !UI.demo) be.textContent = T('u.end'); return; }
  bar.hidden = false;
  const be = $('#btnEnd');
  if (MPS.mode === 'net') {
    const rm = mpReadyMap(), res = mpResolving();
    const chips = (S.humans || []).map(H => { const uid = MPS.meta && MPS.meta.seats ? MPS.meta.seats[H] : null, ext = mpAgentOf(H) === 'ext'; return `<span class="mpchip ${rm[H] ? 'ok' : ''} ${H === MPS.seat ? 'me' : ''}" title="${esc(ext ? T('mp.ag.ext') : uid ? mpName(uid) : '')}"><i class="mpdot ${ext || (uid && mpOnline(uid)) ? 'on' : ''}"></i>${esc(I18N.countryName(H))}${MPS.meta && uid === MPS.meta.host ? '👑' : ''}${rm[H] ? ' ✓' : ''}</span>`; }).join('');
    const all = Object.values(rm).every(Boolean);
    const sec = mpCfg().turnSec || 0, left = sec ? Math.max(0, Math.round(sec - (Date.now() - ((S.mp && S.mp.phaseAt) || Date.now())) / 1000)) : null;
    const extLeft = MPS.host && MPS.extWaitAt && !res ? Math.max(0, Math.round(MP_EXT_WAIT - (Date.now() - MPS.extWaitAt) / 1000)) : null;
    bar.innerHTML = `<span class="mplbl">${T('mp.m.net')}${res ? ' · ' + T('mp.resolving') : ''}${left !== null ? ' · ⏱' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : ''}${extLeft !== null ? ' · ' + T('mp.ext_wait', { n: extLeft }) : ''}</span>${chips}${MPS.host && !all && !res ? `<button data-mp="force" class="mini">${T('mp.force')}</button>` : ''}${mpBoardBtn()}<button data-mp="menu" class="mini">⋯</button>`;
    if (be) { be.textContent = !MPS.seat ? T('mp.watching') : res ? T('mp.resolving') : MPS.ready ? T('mp.unready') : T('mp.ready'); be.classList.toggle('on', !!MPS.ready); be.disabled = !MPS.seat || res; }
  } else if (MPS.mode === 'hot') {
    const done = MPS.hotDone || {};
    bar.innerHTML = `<span class="mplbl">${T('mp.m.hot')}</span>${S.humans.map(H => `<span class="mpchip ${done[H] ? 'ok' : ''} ${H === S.player ? 'me' : ''}">${esc(I18N.countryName(H))}${done[H] ? ' ✓' : ''}</span>`).join('')}${mpBoardBtn()}<button data-mp="menu" class="mini">⋯</button>`;
    if (be) { const last = S.humans.filter(H => !done[H]).length <= 1; be.textContent = last ? T('u.end') : T('mp.next_seat'); be.disabled = false; }
  } else {
    bar.innerHTML = `<span class="mplbl">${T('mp.m.solo')}</span>${mpBoardBtn()}<button data-mp="menu" class="mini">⋯</button>`;
    if (be) { be.textContent = T('u.end'); be.disabled = false; }
  }
  const cd = $('#commsDot'); if (cd) cd.hidden = !Object.values(MPS.unread || {}).some(Boolean) && !(S.inbox || []).some(o => W.isHuman(S, o.from));
  const tb = $('#tabTheater'); if (tb) tb.hidden = !S.th; // 精细战区
}
function mpShowMenu() {
  const net = MPS.mode === 'net', m = MPS.meta || {};
  showModal(`<h2>${T('mp.menu')}</h2>
    ${net ? `<p class="sub">${esc(mpTitleOf(m))} · ${T('mp.seated', { n: Object.values(m.seats || {}).filter(Boolean).length })}${MPS.host ? ' · ' + T('mp.you_host') : ''}</p>` : `<p class="sub">${T('mp.m.' + MPS.mode)}</p>`}
    <div class="mpmenu">
      ${net ? `<button data-mpm="share">${T('mp.share')}</button>` : ''}
      ${net && !MPS.seat ? `<button data-mpm="join">${T('mp.join_play')}</button>` : ''}
      ${net && MPS.seat ? `<button data-mpm="leave">${T('mp.leave_seat')}</button>` : ''}
      ${net && !window.TX_WEB ? `<button data-mpm="ext">${T('mp.ext_help')}</button>` : ''}
      ${net && typeof haMenuHTML === 'function' ? haMenuHTML() : ''}
      <button data-mpm="settings">${T('u.settings')}</button>
      <button data-mpm="help">${T('mp.help')}</button>
      ${S && S.mp && S.mp.tut ? '' : `<button data-mpm="tut">🎓 ${T('tut.menu')}</button>`}
      <button data-mpm="quit">${T('mp.quit')}</button>
    </div><div class="foot"><button class="btn-primary" data-close="1">${T('u.done')}</button></div>`, 'narrow', true);
  $$('#sheet [data-mpm]').forEach(b => (b.onclick = () => {
    const k = b.dataset.mpm;
    if (k === 'share') { showModal(`<h2>${T('mp.share')}</h2><p>${T('mp.share_hint')}</p><p class="muted" style="font-size:12px">${T('mp.share_x')}</p><div class="foot"><button class="btn-primary" data-close="1">${T('u.ok')}</button></div>`, 'narrow', true); }
    if (k === 'join') mpOfferSeat();
    if (k === 'leave') { closeModal(); mpLeaveSeat(); }
    if (k === 'ext') mpShowExtHelp();
    if (k === 'hostai') { haToggle(); mpShowMenu(); }
    if (k === 'settings') openSettings();
    if (k === 'help') mpShowHelp();
    if (k === 'tut') { UI.afterClose = null; closeModal(); tutStart(); }
    if (k === 'quit') { if (net) { try { localStorage.removeItem(MP_LAST); } catch (e) { } } mpShowStart(); mpDemo(); }
  }));
}
function mpShowExtHelp() {
  const C = Object.entries((S && S.mp && S.mp.agents) || {}).filter(([, a]) => a === 'ext').map(([c]) => c);
  showModal(`<h2>${T('mp.ext_help')}</h2><p class="sub">${T('mp.ext_x')}</p>
    <div class="preview" style="font-family:var(--f-mono);font-size:11.5px;white-space:pre-wrap">${esc(`game id: ${MPS.gid}\nexternal countries: ${C.join(', ') || '—'}\nread : txs/${MPS.gid}/dig/<COUNTRY>\nwrite: txs/${MPS.gid}/ext/<COUNTRY>\n\n${MP_EXT_DOC}`)}</div>
    <p class="muted" style="font-size:12px">${T('mp.ext_x2')}</p><div class="foot"><button class="btn-primary" data-close="1">${T('u.ok')}</button></div>`, 'narrow', true);
}
function mpShowHelp() {
  showModal(`<h2>${T('mp.help')}</h2><div class="help">${['flow', 'agents', 'cmd', 'weco', 'net', 'map', 'limits'].map(k => `<p><b>${T('mp.h.' + k)}</b>${T('mp.h.' + k + '_x')}</p>`).join('')}${I18N.has('web.disc') ? `<p class="disc">${T('web.disc')}</p>` : ''}</div><div class="foot">${S && S.mp && S.mp.tut ? '' : `<button data-mpgo="tut">🎓 ${T('tut.menu')}</button>`}<button class="btn-primary" data-close="1">${T('u.gotit')}</button></div>`, 'narrow', true);
}
function mpAfterCmd(op, r) { if (MPS.mode !== 'net') mpLocalSave(); }
