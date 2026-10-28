/* ===================== 网页版 v4 · 房间：名称检查与密码 =====================
 * 建局：对局名称与昵称按 01a_v4nmcore.js 检查，不合规的不让建并写明原因；可以设密码（4–32 个字符），设了就用密码派生的密钥加密这局（01b_v4net.js）。
 * 对局列表：带锁的显示 🔒；进入带锁的对局先输密码（本机已有这局的密钥时直接进）。邀请链接打开、继续上次的对局也一样。
 * 昵称：改昵称时检查；本机存的旧昵称不合规时清掉（用默认的“玩家××××”）。 */
const v4On = () => !!window.TX_V4;
const v4NmMsg = (s, kind) => { const w = typeof TXNM !== 'undefined' ? TXNM.why(s, kind) : null; return w ? T('v4.nm.' + w) : null; };

/* ---------- 新建对局：名称检查 + 密码 ---------- */
function mpShowCreate() {
  MPS.view = 'create';
  const scen = MPS.newScen = mpScenOf(MPS.newScen), c = MPS.newCfg || (MPS.newCfg = Object.assign(mpCfg0(), { aiUse: 'std', llmWorld: true, th: false })), list = mpPlayable(false, scen); if (!list.some(r => r.id === MPS.newPick)) MPS.newPick = mpDefPick(scen, list);
  mpBackdrop(scen);
  showModal(`<h2>${T('mp.create')}</h2>
    <label class="mpfield"><span>${T('mp.gname')}</span><input id="mpTitle" maxlength="24" value="${esc(MPS.newTitle || mpTitleDef(scen))}"></label>
    <label class="mpfield v4pw"><span>${T('v4.pw')}</span><input id="mpPw" type="text" autocomplete="off" maxlength="32" placeholder="${esc(T('v4.pw_ph'))}" value="${esc(MPS.newPw || '')}"></label>
    <p class="muted v4note">${T('v4.pw_x')}</p><p class="muted v4note">${T('v4.nm.rule')}</p><p class="bad v4err" id="mpCreateErr" hidden></p>
    ${mpScenPickHTML(scen)}
    <h4>${T('mp.mycountry')}</h4><div class="picker" style="max-height:220px">${list.map(r => `<button class="pc ${r.id === MPS.newPick ? 'on' : ''}" data-npick="${r.id}"><span class="n"><i style="background:${polColor(r.id)}"></i>${esc(NAME(r.id))}</span><small>GDP ${fmtB(r.g)} · ${T('u.power')} ${fmtN(r.p)}</small></button>`).join('')}</div>
    ${mpCfgForm(c, scen)}
    <div class="foot"><button data-mpgo="games">${T('u.back')}</button><button class="btn-primary" id="mpCreateGo">${T('mp.create_go')}</button></div>`, 'start', false);
  mpBindCostSliders();
  const keep = () => { MPS.newTitle = $('#mpTitle').value; MPS.newPw = $('#mpPw').value; };
  $$('#sheet [data-npick]').forEach(b => (b.onclick = () => { keep(); mpReadCfg(c); MPS.newPick = b.dataset.npick; mpShowCreate(); }));
  $$('#sheet [data-mpscen]').forEach(b => (b.onclick = () => { const t = $('#mpTitle').value; keep(); if (t === mpTitleDef(scen)) MPS.newTitle = ''; mpReadCfg(c); MPS.newScen = b.dataset.mpscen; MPS.newPick = null; mpShowCreate(); }));
  const err = m => { const e = $('#mpCreateErr'); if (e) { e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'center' }); } };
  $('#mpCreateGo').onclick = async () => {
    mpReadCfg(c); const title = String($('#mpTitle').value || '').trim().slice(0, 24) || 'Tianxia ' + ((W.SCENARIOS[scen] || {}).year || scen), pw = String($('#mpPw').value || '').trim();
    const isDef = title === mpTitleDef(scen), why = isDef ? v4NmMsg(MPS.meName || '', 'nick') : v4NmMsg(title, 'room');
    if (why) { err(isDef ? T('v4.nm.nick_bad') + why : why); return; }
    if (pw && ([...pw].length < 4 || [...pw].length > 32)) { err(T('v4.pw_len')); return; }
    err(''); const go = $('#mpCreateGo'); go.disabled = true; go.textContent = T(pw ? 'v4.pw_making' : 'mp.create_go');
    const tdef = MPS.meName && isDef ? { n: String(MPS.meName).slice(0, 16), y: String((W.SCENARIOS[scen] || {}).year || scen) } : null;
    const gid = ('g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toLowerCase();
    const agents = v2Agents(list, [MPS.newPick]);
    try {
      if (pw) await TXLOCK.create(gid, pw); // 先有密钥：之后写进中继的这局文档都加密
      const meta = { v: MP_VER, id: gid, title, ...(tdef ? { tdef } : {}), scen, created: Date.now(), status: 'lobby', host: MPS.uid, hostAt: Date.now(), hpk: MPX.mine() || null, turn: 0, phase: 'lobby', ver: 0, seats: { [MPS.newPick]: MPS.uid }, agents, cfg: { we: c.we, weAI: !!c.weAI, llmWorld: c.aiUse !== 'save', aiUse: c.aiUse, turnSec: c.turnSec | 0, diff: c.diff, th: false, thSec: 90, thPz: 'ev', hostAI: c.hostAI !== false },
        ...(window.TX_WEB && typeof haMetaAI === 'function' ? { ai: haMetaAI(c.hostAI !== false) } : {}) };
      await MPS.db.doc(P_META(gid)).set(meta);
      await MPS.db.doc(P_JOIN(gid) + '/' + MPS.uid).set({ seat: MPS.newPick, at: Date.now(), lang: mpMyLang(), pk: MPX.mine() || null });
      await MPS.db.doc(P_LEASE(gid)).acquire({ holder: mpHolder(), ttlMs: 60000 });
    } catch (e) { go.disabled = false; go.textContent = T('mp.create_go'); toast(T('mp.e.create', { x: { raw: (e && (e.message || e.code)) || '?' } }), 6000); return; }
    MPS.newPw = ''; MPS.host = true; await mpOpenGame(gid); MPS.host = true; mpLobbyOrPlay();
  };
}

/* ---------- 对局列表：带锁的显示 🔒 ---------- */
function mpShowGames() {
  mpUnsubAll(); MPS.on = false; MPS.view = 'games';
  const render = list => {
    if (MPS.view !== 'games') return;
    const rows = list.map(g => { const st = MP_STATUS.includes(g.status) ? g.status : 'lobby', n = Object.values(g.seats || {}).filter(Boolean).length, mine = Object.entries(g.seats || {}).find(([c, u]) => u === MPS.uid && W.DEF[c]); const live = +g.hostAt && Date.now() - g.hostAt < 120000, lock = !!g.lock, key = lock && TXLOCK.has(g.id);
      return `<div class="item"><div class="row"><b>${lock ? '<span class="v4lock" title="' + esc(T('v4.locked')) + '">🔒</span> ' : ''}${esc(mpTitleOf(g))}</b><span class="tag ${st === 'play' ? 'blue' : st === 'over' ? '' : 'acc'}">${T('mp.st.' + st)}</span></div><div class="row muted" style="font-size:12px"><span>${esc(g.date || mpScenTitle(g.scen))} · ${T('mp.seated', { n })}${mine ? ' · ' + T('mp.mine', { a: mine[0] }) : ''}${lock ? ' · ' + T(key ? 'v4.lock_have' : 'v4.locked') : ''}</span><span class="${live ? 'good' : 'muted'}">${live ? T('mp.host_on') : T('mp.host_off')}</span></div><div class="btns"><button class="btn-primary" data-mpopen="${esc(g.id)}">${T(st === 'lobby' ? 'mp.enter' : 'mp.enter_play')}</button></div></div>`; }).join('');
    showModal(`<h2>${T('mp.games')}</h2><p class="sub">${T('mp.games_x')}</p><div class="list">${rows || `<p class="muted">${T('mp.no_games')}</p>`}</div>
      <div class="foot"><button data-mpgo="start">${T('mp.back_start')}</button><button class="btn-primary" data-mpgo="create">${T('mp.create')}</button></div>`, 'narrow', false);
    $$('#sheet [data-mpopen]').forEach(b => (b.onclick = async () => { const gid = b.dataset.mpopen; if (await mpOpenGame(gid) === false) return; mpLobbyOrPlay(); }));
  };
  render([]);
  try {
    const u = MPS.db.collection('txs').orderBy('created', 'desc').limit(30).onSnapshot(q => { if (MPS.on || MPS.view !== 'games') return; render(q.docs.map(d => Object.assign({}, d.data(), { id: d.id })).filter(g => g.v === MP_VER && mpScenOk(g.scen) && g.status !== 'over' && /^[a-z0-9]{4,40}$/.test(g.id) && (!window.TX_WEB || (+g.hostAt && Date.now() - g.hostAt < 3 * 864e5)))); }, e => console.warn('games', e));
    MPS.unsub.push(u);
  } catch (e) { console.warn(e); }
}

/* ---------- 进入带锁的对局：先输密码 ---------- */
function v4AskPw(gid, pv) {
  return new Promise(res => {
    const draw = (msg, bad) => {
      showModal(`<h2>🔒 ${T('v4.pw_ask_h')}</h2><p class="sub">${T('v4.pw_ask_x')}</p>
        <label class="mpfield"><span>${T('v4.pw_short')}</span><input id="v4PwIn" type="password" autocomplete="off" maxlength="32"></label>
        <p class="${bad ? 'bad' : 'muted'} v4note" id="v4PwMsg">${msg || ''}</p>
        <div class="foot"><button id="v4PwNo">${T('mp.back_games')}</button><button class="btn-primary" id="v4PwGo">${T('v4.pw_go')}</button></div>`, 'narrow', false);
      const inp = $('#v4PwIn'); setTimeout(() => inp && inp.focus(), 30);
      const go = async () => {
        const pw = String(inp.value || ''); if (!pw) return;
        $('#v4PwGo').disabled = true; $('#v4PwMsg').className = 'muted v4note'; $('#v4PwMsg').textContent = T('v4.pw_check');
        const ok = await TXLOCK.tryOpen(gid, pw, pv);
        if (ok) { $('#v4PwMsg').textContent = T('v4.pw_ok'); res(true); } else draw(T('v4.pw_wrong'), true);
      };
      $('#v4PwGo').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      $('#v4PwNo').onclick = () => { res(false); mpShowGames(); };
    };
    draw('');
  });
}
const v4OpenGame0 = mpOpenGame;
mpOpenGame = async function (gid) {
  if (v4On() && window.TXLOCK && MPS.db) {
    let m = null; try { const sn = await MPS.db.doc(P_META(gid)).get(); m = sn.exists ? sn.data() : null; } catch (e) { }
    if (m && m.lock && !TXLOCK.has(gid)) { const ok = await v4AskPw(gid, m.pv); if (!ok) return false; }
  }
  return v4OpenGame0(gid);
};

/* ---------- 大厅：带锁的对局写明已加密；房主看得到自己设的密码 ---------- */
const v4Lobby0 = mpRenderLobby;
mpRenderLobby = function (force) {
  v4Lobby0(force);
  const m = MPS.meta; if (!m || !m.lock || !$('#sheet .mplobby') || $('#sheet .v4lockbar')) return;
  const pw = window.TXLOCK ? TXLOCK.pw(MPS.gid) : '';
  const al = $('#sheet .mplobby .alert');
  const html = `<div class="alert v4lockbar">🔒 ${T('v4.lock_banner')}${pw && m.host === MPS.uid ? ' ' + T('v4.lock_pw', { x: { raw: esc(pw) } }) : ''} ${T('v4.lock_share')}</div>`;
  if (al) al.insertAdjacentHTML('afterend', html); else $('#sheet .mplobby h2').insertAdjacentHTML('afterend', html);
};

/* ---------- 昵称：改的时候检查；本机存的旧昵称不合规时清掉 ---------- */
const v4Nick0 = mpWebNickBind;
mpWebNickBind = function () {
  v4Nick0();
  const ni = $('#mpNick'); if (!ni || !window.__txWeb) return;
  const prev = window.__txWeb.name();
  ni.onchange = () => {
    const v = String(ni.value || '').trim(), why = v ? v4NmMsg(v, 'nick') : null;
    if (why) { toast(why, 5000); ni.value = prev; return; }
    const r = window.__txWeb.setName(v); ni.value = r; MPS.meName = r; if (MPS.uid) MPS.names[MPS.uid] = { id: MPS.uid, name: r };
  };
};
if (v4On() && window.__txWeb && typeof TXNM !== 'undefined') { try { const nm = (localStorage.getItem('tianxia.web.name') || '').trim(); if (nm && !TXNM.ok(nm, 'nick')) window.__txWeb.setName(''); } catch (e) { } }
