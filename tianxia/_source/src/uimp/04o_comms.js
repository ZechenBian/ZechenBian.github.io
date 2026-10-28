// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 联机版 · 通讯：真人之间的私信与正式提议、与各国智能体谈判、实时数据变更 ===================== */
MPS.thread = null; MPS.seen = {}; MPS.chatBusy = false; MPS.prop = [];
let mpPrivT = null;
async function mpLoadPriv() {
  if (!mpNet() || !MPS.gid || MPS.privLoaded === MPS.gid) return;
  MPS.privLoaded = MPS.gid;
  try { const sn = await MPS.db.doc(P_PRIV(MPS.uid, MPS.gid)).get(); MPS.chats = mpClone((sn.exists && sn.data().chats) || {}); } catch (e) { MPS.chats = {}; }
  mpRerenderComms();
}
function mpSavePriv() { if (!mpNet()) { mpLocalSave(); return; } clearTimeout(mpPrivT); mpPrivT = setTimeout(() => { const ch = {}; for (const [k, v] of Object.entries(MPS.chats || {})) ch[k] = v.slice(-40); mpWrite(P_PRIV(MPS.uid, MPS.gid), () => ({ chats: ch, at: Date.now() })); }, 600); }
/* 与智能体的谈判记录：联网存本人私密文档；本地存席位内 */
function mpAgentHist(X) { if (mpNet()) { MPS.chats = MPS.chats || {}; return MPS.chats[X] || (MPS.chats[X] = []); } return S.chat[X] || (S.chat[X] = []); }

/* ---------- 真人消息：私信（端到端加密，只有收发双方解得开）与公开喊话（所有人可见） ---------- */
MPS.dm = MPS.dm || {}; // '发信人编号|序号' → 解开的文字（false = 解不开）
const mpDmKey = (uid, m) => uid + '|' + m.n;
/* 解开某位玩家通道里发给我的私信（我自己的通道：解开我发出去的，刷新页面后用） */
async function mpOpenMsgs(uid, d) {
  if (!d || !Array.isArray(d.msgs) || !mpNet() || !(await MPX.ready())) return false;
  let ch = false;
  for (const m of d.msgs) {
    if (!m || !m.x || typeof m.n !== 'number') continue;
    const k = mpDmKey(uid, m); if (MPS.dm[k] !== undefined) continue;
    let peer, aad;
    if (uid === MPS.uid) { peer = m.tu; aad = 'dm|' + MPS.gid + '|' + MPS.uid + '|' + m.tu + '|' + m.n; }
    else if (m.tu === MPS.uid) { peer = uid; aad = 'dm|' + MPS.gid + '|' + uid + '|' + MPS.uid + '|' + m.n; }
    else continue; // 别人之间的私信：解不开，也不显示
    try { const v = await MPX.open(mpPkOf(peer), MPS.gid, aad, m.x); MPS.dm[k] = String((v && v.text) || '').slice(0, 600); } catch (e) { MPS.dm[k] = false; }
    ch = true;
  }
  return ch;
}
const mpDmText = (uid, m) => (m.x ? MPS.dm[mpDmKey(uid, m)] : m.text);
function mpHumanMsgs(C) {
  const me = S.player, out = [];
  if (mpNet()) {
    const seats = (MPS.meta && MPS.meta.seats) || {};
    for (const m of MPS.msgs || []) if (m.to === C) out.push({ mine: true, text: mpDmText(MPS.uid, m), at: m.at, lock: !!m.x });
    const uid = seats[C]; const p = uid && MPS.players[uid];
    if (p && p.msgs) for (const m of p.msgs) if (m.to === me && (!m.x || m.tu === MPS.uid)) out.push({ mine: false, text: mpDmText(uid, m), at: m.at, lock: !!m.x });
    for (const m of (S.mp && S.mp.agentMsgs) || []) if (m.from === C && m.to === me) out.push({ mine: false, text: m.text, at: m.at, ext: true });
  } else for (const m of (S.mp && S.mp.hmsgs) || []) { if (m.from === me && m.to === C) out.push({ mine: true, text: m.text, at: m.at }); else if (m.from === C && m.to === me) out.push({ mine: false, text: m.text, at: m.at }); }
  return out.sort((a, b) => a.at - b.at).slice(-80);
}
/* 公开频道：所有玩家的公开喊话（外部智能体的广播也在这里） */
function mpPublicMsgs() {
  const out = [];
  if (mpNet()) {
    for (const m of MPS.msgs || []) if (m.to === '*' && typeof m.text === 'string') out.push({ from: S.player, mine: true, text: m.text, at: m.at });
    for (const [uid, p] of Object.entries(MPS.players)) { if (uid === MPS.uid || !p || !Array.isArray(p.msgs)) continue; const seat = mpSeatOf(uid); for (const m of p.msgs) if (m && m.to === '*' && typeof m.text === 'string') { const from = seat || m.from; if (W.DEF[from]) out.push({ from, mine: false, text: m.text, at: m.at }); } }
    for (const m of (S.mp && S.mp.agentMsgs) || []) if (m.to === '*' && W.DEF[m.from]) out.push({ from: m.from, mine: false, text: m.text, at: m.at, ext: true });
  } else for (const m of (S.mp && S.mp.hmsgs) || []) if (m.to === '*') out.push({ from: m.from, mine: m.from === S.player, text: m.text, at: m.at });
  return out.sort((a, b) => a.at - b.at).slice(-120);
}
async function mpSendHuman(C, text) {
  text = String(text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 600); if (!text) return false;
  if (mpNet()) {
    const n = (MPS.msgN = Math.max(MPS.msgN || 0, ...MPS.msgs.map(m => m.n || 0)) + 1), at = Date.now();
    let m;
    if (C === '*' || mpAgentOf(C) === 'ext') m = { n, to: C, text, at, from: S.player }; // 公开喊话；外部智能体解不开加密，发给它的照常明文
    else {
      const uid = MPS.meta && MPS.meta.seats ? MPS.meta.seats[C] : null, pk = uid && mpPkOf(uid);
      if (!pk || !(await MPX.ready())) { mpToast(T('mp.c.nokey')); return false; }
      const x = await MPX.seal(pk, MPS.gid, 'dm|' + MPS.gid + '|' + MPS.uid + '|' + uid + '|' + n, { text });
      MPS.dm[mpDmKey(MPS.uid, { n })] = text;
      m = { n, to: C, tu: uid, at, from: S.player, x };
    }
    MPS.msgs.push(m); MPS.msgs = MPS.msgs.slice(-60); mpSaveMine();
    if (MPS.rm) MPS.rm.emit('ping', { to: C, from: S.player }).catch(() => { });
  } else { S.mp.hmsgs = (S.mp.hmsgs || []).concat([{ from: S.player, to: C, text, at: Date.now(), turn: S.turn }]).slice(-200); mpLocalSave(); }
  MPS.seen[C === '*' ? 'P:*' : 'H:' + C] = Date.now();
  return true;
}
function mpMsgsChanged() {
  if (!S || !S.humans) return;
  for (const C of S.humans) { if (C === S.player) continue; const last = mpHumanMsgs(C).filter(m => !m.mine).slice(-1)[0]; MPS.unread['H:' + C] = !!(last && last.at > (MPS.seen['H:' + C] || 0)) && !(UI.tab === 'comms' && MPS.thread === 'H:' + C); }
  if (S.humans.length > 1) { const last = mpPublicMsgs().filter(m => !m.mine).slice(-1)[0]; MPS.unread['P:*'] = !!(last && last.at > (MPS.seen['P:*'] || 0)) && !(UI.tab === 'comms' && MPS.thread === 'P:*'); }
  mpRenderBar();
  if (UI.tab === 'comms') mpRerenderComms();
}
/* 通讯与战时经济页重绘时保留：正在输入的文字、提议表单的选择、展开状态、聊天滚动位置与焦点 */
function mpKeepForm(body) {
  const ids = ['mpText', 'mpPT', 'mpPBy', 'mpPAmt', 'mpPC'], vals = {};
  for (const id of ids) { const el = body.querySelector('#' + id); if (el) vals[id] = el.value; }
  const ae = document.activeElement, act = ae && body.contains(ae) && ids.includes(ae.id) ? ae.id : null;
  let sel = null; try { if (act && ae.selectionStart != null) sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { }
  const thread = MPS.thread, pOpen = !!(body.querySelector('details.mpprop') || {}).open;
  const chat = body.querySelector('#mpChat'), atBottom = !chat || chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40, top = chat ? chat.scrollTop : 0;
  return () => {
    if (thread !== MPS.thread) return;
    for (const [id, v] of Object.entries(vals)) { const el = body.querySelector('#' + id); if (!el || el.disabled) continue; if (el.tagName === 'SELECT') { if ([...el.options].some(o => o.value === v)) el.value = v; } else el.value = v; }
    const d = body.querySelector('details.mpprop'); if (d && pOpen) d.open = true;
    const c2 = body.querySelector('#mpChat'); if (c2) c2.scrollTop = atBottom ? c2.scrollHeight : top;
    if (act) { const el = body.querySelector('#' + act); if (el && !el.disabled) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { } } }
  };
}
function mpRerenderComms() { if (UI.tab !== 'comms' || !S) return; renderSide(); }

/* ---------- 通讯页 ---------- */
function mpTabHTML(tab) {
  if (!S || !MPS.on) return tab === 'comms' || tab === 'weco' || tab === 'theater' ? `<p class="muted">${T('mp.need_game')}</p>` : null;
  if (tab === 'theater') return thTabHTML();
  if (tab === 'comms') return mpCommsHTML();
  if (tab === 'weco') return mpWecoHTML();
  return null;
}
function mpRelevant() {
  const P = S.player, sc = X => (W.atWar(S, P, X) ? 1000 : 0) + (W.isAlly(S, P, X) ? 500 : 0) + (S.inbox.some(o => o.from === X) ? 800 : 0) + (W.landAdj(P, X) ? 200 : 0) + W.power(S, X) / 20 + Math.abs(W.rel(S, P, X));
  return W.IDS.filter(X => X !== P && W.indep(S, X) && !W.isHuman(S, X) && !W.isNeutral(S, X)).sort((a, b) => sc(b) - sc(a)); // 中立地区不能谈判
}
function mpCommsHTML() {
  const P = S.player; let s = '';
  if (mpNet() && !MPS.seat) return `<div class="sec"><p class="muted">${T('mp.c.watch_x')}</p></div>` + mpFeedHTML(); // 观战者不显示任何一方的私信与谈判
  if (mpNet()) mpLoadPriv();
  const hum = (S.humans || []).filter(C => C !== P);
  const pubCard = hum.length ? `<button class="mpcard mppub ${MPS.thread === 'P:*' ? 'on' : ''}" data-mpth="P:*"><span class="n">📢 ${T('mp.c.public')}${MPS.unread['P:*'] ? ' <b class="bad">●</b>' : ''}</span><small>${T('mp.c.public_s')}</small></button>` : '';
  s += `<div class="sec"><h3>${T('mp.c.players')}</h3>${hum.length ? `<div class="mplist">${pubCard}${hum.map(C => { const uid = MPS.meta && MPS.meta.seats ? MPS.meta.seats[C] : null, ext = mpAgentOf(C) === 'ext', un = MPS.unread['H:' + C], off = S.inbox.filter(o => o.from === C).length; return `<button class="mpcard ${MPS.thread === 'H:' + C ? 'on' : ''}" data-mpth="H:${C}"><span class="n"><i style="background:${polColor(C)}"></i>${esc(NAME(C))}${un ? ' <b class="bad">●</b>' : ''}${off ? ` <span class="tag red">${off}</span>` : ''}</span><small>${ext ? T('mp.ag.ext') : uid ? `<i class="mpdot ${mpOnline(uid) ? 'on' : ''}"></i>${esc(mpName(uid))}` : T('mp.c.hotseat')} · ${T(relWord(W.rel(S, P, C), W.atWar(S, P, C))[0])}</small></button>`; }).join('')}</div>` : `<p class="muted">${T('mp.c.noplayers')}</p>`}</div>`;
  const rel = mpRelevant(); const showAll = UI.open.mpAllAg;
  s += `<div class="sec"><h3>${T('mp.c.agents')}</h3><p class="muted" style="font-size:12px;margin:0 0 6px">${T('mp.c.agents_x')}</p><div class="mplist">${(showAll ? rel : rel.slice(0, 10)).map(X => { const ag = mpAgentOf(X), off = S.inbox.filter(o => o.from === X).length; return `<button class="mpcard ${MPS.thread === 'A:' + X ? 'on' : ''}" data-mpth="A:${X}"><span class="n"><i style="background:${polColor(X)}"></i>${esc(NAME(X))}${off ? ` <span class="tag red">${off}</span>` : ''}</span><small><span class="tag ${ag === 'claude' ? 'blue' : ag === 'ext' ? 'acc' : ''}">${T('mp.ag.' + ag)}</span> ${T(relWord(W.rel(S, P, X), W.atWar(S, P, X))[0])}</small></button>`; }).join('')}</div>${rel.length > 10 ? `<button class="mini" data-toggle="mpAllAg">${showAll ? T('mp.c.less') : T('mp.c.more', { n: rel.length - 10 })}</button>` : ''}</div>`;
  if (MPS.thread) s += mpThreadHTML(MPS.thread);
  s += mpFeedHTML();
  return s;
}
function mpThreadHTML(key) {
  const [k, C] = key.split(':');
  if (k === 'P') return mpPublicHTML(key);
  if (!S.actors[C]) return '';
  const P = S.player, offers = S.inbox.filter(o => o.from === C);
  let s = `<div class="sec mpthread"><div class="row"><h3 style="margin:0"><i class="mpsw" style="background:${polColor(C)}"></i>${esc(NAME(C))}</h3><button class="mini" data-mpth="">${T('u.close')}</button></div>`;
  if (offers.length) s += `<div class="list" style="margin:6px 0">${offers.map(o => `<div class="item"><div style="font-size:13px">${esc(TX(o.msg))}</div>${o.deal && o.deal.text ? `<div class="muted" style="font-size:12px">“${esc(o.deal.text)}”</div>` : ''}<div class="btns"><button class="btn-primary" data-offer="${o.id}" data-ok="1">${T('u.accept')}</button><button data-offer="${o.id}" data-ok="0">${T('u.decline')}</button></div></div>`).join('')}</div>`;
  if (k === 'H') {
    MPS.seen[key] = Date.now(); MPS.unread[key] = false;
    const msgs = mpHumanMsgs(C);
    const txt = m => (typeof m.text === 'string' ? esc(m.text) : `<span class="muted">${T(m.text === false ? 'mp.c.dm_bad' : 'mp.c.dm_dec')}</span>`);
    s += `${mpNet() && mpAgentOf(C) !== 'ext' ? `<p class="muted mplock">🔒 ${T('mp.c.dm_lock')}</p>` : ''}<div class="chat" id="mpChat">${msgs.map(m => `<div class="msg ${m.mine ? 'me' : 'them'}">${m.mine ? '' : `<span class="who">${esc(NAME(C))}${m.ext ? ' · ' + T('mp.ag.ext') : ''}</span>`}${txt(m)}</div>`).join('') || `<p class="muted" style="font-size:12.5px">${T('mp.c.dm_empty')}</p>`}</div>
      <form class="chatbox" id="mpForm"><textarea id="mpText" placeholder="${esc(T('mp.c.dm_ph'))}"></textarea><button class="btn-primary">${T('u.send')}</button></form>
      ${mpPropHTML(C)}`;
  } else {
    const ag = mpAgentOf(C), hist = mpAgentHist(C);
    const eng = ag === 'claude' && useLLM() ? 'claude' : ag === 'ext' ? 'ext' : 'rule';
    s += `<div class="muted" style="font-size:12px">${T('mp.c.agent_' + eng, { v: { voice: C } })}</div>
      <div class="chat" id="mpChat">${hist.map((m, i) => mpAgentMsgHTML(C, m, i, i === hist.length - 1)).join('') || `<p class="muted" style="font-size:12.5px">${T('mp.c.agent_eg')}</p>`}${MPS.chatBusy === C ? `<div class="msg them"><span class="who">${esc(NAME(C))}</span>${T('u.thinking')}</div>` : ''}</div>
      <div class="mpchips">${mpSuggest(C).map(t => `<button class="mini" data-mpsug="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <form class="chatbox" id="mpForm"><textarea id="mpText" placeholder="${esc(T('u.envoy_ph'))}" ${MPS.chatBusy ? 'disabled' : ''}></textarea><button class="btn-primary" ${MPS.chatBusy ? 'disabled' : ''}>${T('u.send')}</button></form>`;
  }
  return s + '</div>';
}
function mpAgentMsgHTML(X, m, i, last) {
  if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
  let deal = '';
  if (m.deal && m.deal.status !== 'none' && m.deal.terms && m.deal.terms.length) {
    const lbl = { accept: T('u.deal_acc'), counter: T('u.deal_counter'), reject: T('u.deal_rej') }[m.deal.status] || '';
    const warn = m.deal.terms.map(t => W.dealCheck(S, X, t)).filter(Boolean).map(TX);
    deal = `<div class="deal"><b>${lbl}</b>${m.deal.summary ? `<div class="muted" style="font-size:12px">${esc(m.deal.summary)}</div>` : ''}<ul>${m.deal.terms.map(t => `<li>${esc(termText(t))}</li>`).join('')}</ul>${warn.length ? `<div class="warn" style="font-size:12px">${T('u.deal_warn', { x: { raw: warn.join(sep()) } })}</div>` : ''}${last && m.deal.status !== 'reject' && !m.signed ? `<div class="btns"><button class="btn-primary" data-mpsign="${X}" data-i="${i}" ${W.apLeft(S) < 1 ? 'disabled' : ''}>${T('u.sign')}</button></div>` : m.signed ? `<div class="good" style="font-size:12px">${T('u.signed')}</div>` : ''}</div>`;
  }
  return `<div class="msg them"><span class="who">${esc(NAME(X))}${m.src === 'rule' ? ' · ' + T('mp.ag.rule') : ''}</span>${esc(m.text)}${deal}</div>`;
}
/* 公开频道：所有玩家都看得到；接入 AI 推演时，各国政府也“听得到” */
function mpPublicHTML(key) {
  MPS.seen[key] = Date.now(); MPS.unread[key] = false;
  const msgs = mpPublicMsgs();
  return `<div class="sec mpthread"><div class="row"><h3 style="margin:0">📢 ${T('mp.c.public')}</h3><button class="mini" data-mpth="">${T('u.close')}</button></div>
    <p class="muted" style="font-size:12px;margin:4px 0 6px">${T('mp.c.public_x')}</p>
    <div class="chat" id="mpChat">${msgs.map(m => `<div class="msg ${m.mine ? 'me' : 'them'}">${m.mine ? '' : `<span class="who"><i class="mpsw" style="background:${polColor(m.from)}"></i>${esc(NAME(m.from))}${m.ext ? ' · ' + T('mp.ag.ext') : ''}</span>`}${esc(m.text)}</div>`).join('') || `<p class="muted" style="font-size:12.5px">${T('mp.c.pub_empty')}</p>`}</div>
    <form class="chatbox" id="mpForm"><textarea id="mpText" placeholder="${esc(T('mp.c.public_ph'))}"></textarea><button class="btn-primary">${T('mp.c.pub_send')}</button></form></div>`;
}
/* 快捷提议（按当下最可能成交的条款排序） */
function mpSuggest(X) {
  const P = S.player, war = W.atWar(S, P, X), out = [];
  const tt = k => T('mp.sug.' + k, { a: X });
  if (war) out.push(tt('ceasefire'), tt('peace'));
  else { const sc = ['trade', 'nap', 'alliance', 'access'].map(t => [t, W.evalDeal(S, P, X, { type: t }).score]).filter(([t]) => !W.hasTreaty(S, P, X, t)).sort((a, b) => b[1] - a[1]); for (const [t] of sc.slice(0, 3)) out.push(tt(t)); }
  if (S.sanctions.some(z => z.from === X && z.to === P)) out.push(tt('lift'));
  const en = W.enemies(S, P).filter(E => E !== X && !W.atWar(S, X, E))[0]; if (en && !war) out.push(T('mp.sug.join', { b: en }));
  if (S.ultis.some(u => u.from === X && u.status === 'open')) out.push(tt('drop'));
  return out.slice(0, 5);
}

/* ---------- 真人之间的正式提议 ---------- */
const MP_PT = ['alliance', 'trade', 'nap', 'access', 'partner', 'armsctl', 'ceasefire', 'peace', 'aid', 'arms', 'join_war', 'tech_share', 'lift_sanctions', 'withdraw', 'send_troops', 'mobilize', 'vassal'];
const MP_TREATY = { alliance: 1, trade: 1, nap: 1, access: 1, partner: 1, armsctl: 1 };
const MP_PT_BY = { aid: 1, arms: 1, join_war: 1, lift_sanctions: 1, withdraw: 1, send_troops: 1, mobilize: 1, vassal: 1 };
function mpPropHTML(C) {
  const P = S.player, list = MPS.propFor === C ? MPS.prop : (MPS.prop = [], MPS.propFor = C, MPS.prop);
  const opts = W.IDS.filter(id => id !== P && id !== C && W.indep(S, id)).map(id => `<option value="${id}">${esc(NAME(id))}</option>`).join('');
  const war = W.atWar(S, P, C), voidWhy = t => (MP_TREATY[t.type] && war ? T('dl.atwar') : (t.type === 'ceasefire' || t.type === 'peace') && !war ? T('dl.notwar') : '');
  const types = war ? MP_PT.filter(t => !MP_TREATY[t]) : MP_PT.filter(t => t !== 'ceasefire' && t !== 'peace');
  return `<details class="mpprop" ${list.length ? 'open' : ''}><summary>${T('mp.p.title')}</summary>
    <div class="mppropform"><select id="mpPT">${types.map(t => `<option value="${t}">${esc(T('mp.pt.' + t))}</option>`).join('')}</select>
      <select id="mpPBy"><option value="${P}">${T('mp.p.by_me')}</option><option value="${C}">${T('mp.p.by_them', { a: { id: C } })}</option></select>
      <input id="mpPAmt" type="number" min="0" step="0.5" placeholder="${esc(T('mp.p.amt'))}" style="width:7em">
      <select id="mpPC"><option value="">${T('mp.p.country')}</option>${opts}</select>
      <button type="button" class="mini" id="mpPAdd">${T('mp.p.add')}</button></div>
    ${list.length ? `<ul class="mpterms">${list.map((t, i) => `<li>${esc(TX(W.cleanHTerms(S, P, C, [t]).map(z => ({ k: 'hd.' + z.type, p: { b: z.by || '', m: z.amount != null ? { m: z.amount } : '', t: z.enemy || z.loc || '', n: z.level || '' } }))[0] || { raw: t.type }))}${voidWhy(t) ? ` <span class="warn">${paren(esc(voidWhy(t)))}</span>` : ''} <button class="mini" data-mppdel="${i}">×</button></li>`).join('')}</ul><button class="btn-primary" id="mpPSend">${T('mp.p.send')}</button>` : `<p class="muted" style="font-size:12px">${T('mp.p.help')}</p>`}
  </details>`;
}

/* ---------- 实时数据变更（所有玩家可见的命令记录） ---------- */
function mpFeedHTML() {
  const list = ((S && S.patches) || []).slice(-8).reverse(); if (!list.length) return '';
  return `<div class="sec"><h3>${T('mp.c.feed')}</h3><div class="feed">${list.map(p => `<div class="f"><small>${dateStr(S, p.turn)} · ${esc(NAME(p.by))}</small><b>${esc(TX(p.summary) || p.text || '')}</b>${p.changes.length ? `<div class="mpchg">${p.changes.slice(0, 10).map(c => mpChgText(c)).join('')}</div>` : ''}${(p.agents || []).length ? `<div class="mpsay">${p.agents.map(a => mpSayHTML(a)).join('')}</div>` : ''}</div>`).join('')}</div></div>`;
}
const MP_STN_CLS = { we: 'friend', su: 'friend', ne: 'neutral', co: 'unknown', op: 'hostile', sh: 'hostile' };
const mpSayHTML = a => `<div><b>${esc(NAME(a.c))}</b>${a.stance && MP_STN_CLS[a.stance] ? ` <span class="tag mpstn ${MP_STN_CLS[a.stance]}">${esc(T('stn.' + a.stance))}</span>` : ''}${EN() ? ': ' : '：'}${esc(TX(a.say))}</div>`;
const mpFmtF = (f, v) => f === 'treasury' || f === 'gdp' ? fmtB(v) : f === 'pers' ? persT(v) : f === 'milPct' || f === 'infl' ? (+v).toFixed(1) + '%' : f === 'cu' ? pct(v) : ['hawk', 'risk', 'loyal'].includes(f) ? (+v).toFixed(2) : f === 'oil' ? (+v).toFixed(1) + 'Mt' : ['land', 'navy', 'air'].includes(f) ? fmtN(v) : String(Math.round(v));
/* 厌战、通胀、紧张度上升是坏事，其余数值上升是好事（按发令方视角着色） */
const MP_BAD_UP = { weary: 1, infl: 1, tension: 1, resist: 1 };
function mpChgVal(c) { const up = c.to > c.from, good = MP_BAD_UP[c.f] ? !up : up; return `<span class="mpc ${good ? 'up' : 'dn'}">${esc(mpFmtF(c.f, c.from))} → <b>${esc(mpFmtF(c.f, c.to))}</b></span>`; }
function mpChgText(c) {
  const up = c.to > c.from, good = MP_BAD_UP[c.f] ? !up : up, name = c.w ? `${NAME(c.c)}↔${NAME(c.w)}` : NAME(c.c);
  return `<span class="mpc ${good ? 'up' : 'dn'}">${esc(name)} ${esc(T('pf.' + c.f))} ${esc(mpFmtF(c.f, c.from))}→<b>${esc(mpFmtF(c.f, c.to))}</b></span>`;
}

/* ---------- 交互 ---------- */
document.addEventListener('click', e => {
  if (!window.TX_MP || !S || !MPS.on) return;
  const t = e.target.closest('[data-mpth], [data-mpsug], [data-mpsign], #mpPAdd, [data-mppdel], #mpPSend, [data-mptalk]'); if (!t) return;
  const d = t.dataset;
  if (d.mpth !== undefined) { MPS.thread = d.mpth || null; if (MPS.thread) MPS.seen[MPS.thread] = Date.now(); UI.tab = 'comms'; renderSide(); const c = $('#mpChat'); if (c) c.scrollTop = c.scrollHeight; mpRenderBar(); return; }
  if (d.mptalk) { MPS.thread = (W.isHuman(S, d.mptalk) ? 'H:' : 'A:') + d.mptalk; UI.tab = 'comms'; renderSide(); return; }
  if (d.mpsug !== undefined) { const ta = $('#mpText'); if (ta) { ta.value = d.mpsug; ta.focus(); } return; }
  if (d.mpsign) { mpSign(d.mpsign, +d.i); return; }
  if (t.id === 'mpPAdd') {
    const C = (MPS.thread || '').split(':')[1]; if (!C) return; const type = $('#mpPT').value, by = $('#mpPBy').value, amt = +$('#mpPAmt').value || 0, c2 = $('#mpPC').value;
    const term = { type }; if (MP_PT_BY[type]) term.by = by; if (type === 'aid' || type === 'arms') term.amount = amt || +(S.actors[by].gdp * 0.003).toFixed(1); if (type === 'join_war') { if (!c2) { toast(T('mp.p.need_c')); return; } term.enemy = c2; } if (type === 'withdraw') { if (!c2) { toast(T('mp.p.need_c')); return; } term.loc = c2; } if (type === 'mobilize') term.level = 2;
    MPS.prop.push(term); mpRerenderComms(); return;
  }
  if (d.mppdel !== undefined) { MPS.prop.splice(+d.mppdel, 1); mpRerenderComms(); return; }
  if (t.id === 'mpPSend') { const C = (MPS.thread || '').split(':')[1]; if (!C || !MPS.prop.length) return; const text = ($('#mpText') || {}).value || ''; const r = doCmd('proposeH', [C, MPS.prop.slice(), text]); if (r) { toast(T('mp.p.sent', { a: C })); MPS.prop = []; if (text) { mpSendHuman(C, text); $('#mpText').value = ''; } } else toast(T('mp.p.fail')); mpRerenderComms(); return; }
});
document.addEventListener('submit', e => { if (e.target.id === 'mpForm') { e.preventDefault(); mpSendChat(); } });
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'mpText' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); mpSendChat(); } });
function mpTalkHTML(X) { return `<p class="muted" style="font-size:12.5px">${T('mp.c.talk_x', { a: X })}</p><button class="btn-primary" data-mptalk="${X}">${T('mp.c.talk', { a: X })}</button>`; }

/* ---------- 发送：真人私信 / 智能体谈判 ---------- */
async function mpSendChat() {
  const key = MPS.thread; const ta = $('#mpText'); if (!key || !ta) { if (!key && UI.sel) { MPS.thread = 'A:' + UI.sel; UI.tab = 'comms'; renderSide(); } return; }
  const msg = ta.value.trim(); if (!msg) return;
  const [k, C] = key.split(':');
  if (k === 'H' || k === 'P') { ta.value = ''; const ok = await mpSendHuman(k === 'P' ? '*' : C, msg); if (!ok) ta.value = msg; mpRerenderComms(); const c = $('#mpChat'); if (c) c.scrollTop = c.scrollHeight; return; }
  if (MPS.chatBusy) return;
  const ag = mpAgentOf(C), hist = mpAgentHist(C);
  hist.push({ role: 'me', text: msg, at: Date.now() }); ta.value = ''; MPS.chatBusy = C; mpRerenderComms();
  try {
    if (ag === 'claude' && useLLM()) { const r = await LLM.diplomacy(S, C, hist.slice(0, -1), msg, { tier: UI.tier }); hist.push({ role: 'them', text: r.reply, deal: r.deal, at: Date.now() }); }
    else if (ag === 'ext' && mpNet()) { mpSendHuman(C, msg); hist.push({ role: 'them', text: T('mp.c.ext_fwd'), at: Date.now(), src: 'sys' }); }
    else { const r = mpRuleAgent(S, C, msg); hist.push({ role: 'them', text: r.reply, deal: r.deal, at: Date.now(), src: 'rule' }); }
  } catch (e) { hist.push({ role: 'them', text: T('u.chat_err', { x: { raw: LLM.errText(e) } }), at: Date.now() }); }
  MPS.chatBusy = false; mpSavePriv(); mpRerenderComms(); renderTop();
  const c = $('#mpChat'); if (c) c.scrollTop = c.scrollHeight;
}
function mpSign(X, i) {
  const hist = mpAgentHist(X), m = hist[i]; if (!m || !m.deal || m.signed) return;
  if (W.apLeft(S) < 1) { toast(T('c.ap', { n: 1 })); return; }
  const done = doCmd('applyDeal', [X, m.deal.terms]); if (!done) { toast(T('mp.p.fail')); return; }
  m.signed = true; mpSavePriv();
  toast(T('u.deal_done', { x: { list: done } }), 5000); renderAll();
}

/* ---------- 本地规则智能体：离线也能谈判（解析条款 → 按该国利益评估 → 接受、开条件或拒绝） ---------- */
const RA_KW = [
  ['ceasefire', /停火|休战|ceasefire|truce|armistice/i], ['peace', /和平|和约|媾和|停战协定|\bpeace\b/i],
  ['alliance', /同盟|结盟|盟约|\balliance\b|\bally\b/i], ['nap', /互不侵犯|non-?aggression|\bnap\b/i], ['trade', /贸易|通商|自贸|商约|\btrade\b/i],
  ['access', /通行|驻军|过境|基地|\baccess\b|basing|transit/i], ['partner', /伙伴|partner/i], ['armsctl', /军控|裁军|限制军备|arms control|disarm/i],
  ['lift_sanctions', /(解除|取消|撤销).{0,8}(对我|对我们|对我国|对本国)?.{0,4}制裁|lift (your )?sanctions/i],
  ['tech_share', /技术(共享|交流|合作)|tech(nology)? shar/i], ['drop_ultimatum', /(撤回|收回|取消).{0,4}通牒|withdraw (the |your )?ultimatum/i],
  ['join_war', /宣战|参战|一起(进攻|打)|join (the )?war|declare war/i], ['send_troops', /派兵|出兵|派遣.{0,4}(部队|军队)|send (your )?troops/i],
  ['mobilize', /动员|mobili[sz]e/i], ['vassal', /附庸|保护国|臣服|vassal|protectorate/i], ['arms', /军援|武器|军火|\barms\b/i],
];
function raParse(S_, X, text) {
  const P = S_.player, terms = [], t = String(text || '');
  const num = (() => { const m = t.match(/(\d+(?:\.\d+)?)\s*(亿|billion|bn|b\b|十亿)/i); if (!m) return null; const v = +m[1]; return /亿/.test(m[2]) && !/十亿/.test(m[2]) ? v / 10 : v; })();
  for (const [type, re] of RA_KW) if (re.test(t)) terms.push({ type });
  if (/(援助|资助|贷款|给你|给贵国|提供|支付|aid|pay you|grant)/i.test(t) && num) { const arms = terms.find(z => z.type === 'arms'); if (arms) arms.amount = num; else terms.push({ type: 'aid', amount: num }); }
  if (/我(们|国|方)?.{0,4}(解除|取消|撤销).{0,8}制裁|we (will )?lift/i.test(t) && S_.sanctions.some(z => z.from === P && z.to === X)) { const i = terms.findIndex(z => z.type === 'lift_sanctions'); if (i >= 0) terms.splice(i, 1); terms.push({ type: 'lift_my_sanctions' }); }
  const jw = terms.find(z => z.type === 'join_war'); if (jw) { const en = LLM.mentioned(S_, t).filter(c => c !== X && c !== P)[0] || W.enemies(S_, P).filter(e => e !== X)[0]; if (en) jw.enemy = en; else terms.splice(terms.indexOf(jw), 1); }
  const st = terms.find(z => z.type === 'send_troops'); if (st) st.share = 0.08;
  const mo = terms.find(z => z.type === 'mobilize'); if (mo) mo.level = 2;
  const ar = terms.find(z => z.type === 'arms'); if (ar && !ar.amount) ar.amount = +(S_.actors[P].gdp * 0.003).toFixed(1);
  if (terms.some(z => z.type === 'peace') && terms.some(z => z.type === 'ceasefire')) terms.splice(terms.findIndex(z => z.type === 'ceasefire'), 1);
  return terms.slice(0, 5);
}
function raEval(S_, X, terms) {
  const P = S_.player, x = S_.actors[X], why = []; let sc = 0;
  for (const t of terms) {
    switch (t.type) {
      case 'trade': case 'alliance': case 'nap': case 'access': case 'partner': case 'armsctl': case 'vassal': { const e = W.evalDeal(S_, P, X, { type: t.type }); sc += e.score; why.push(...e.why); break; }
      case 'ceasefire': case 'peace': { const e = W.evalDeal(S_, P, X, { type: t.type, terms: 'white' }); sc += e.score; break; }
      case 'join_war': { const e = W.evalDeal(S_, P, X, { type: 'join_war', enemy: t.enemy }); sc += e.score; break; }
      case 'aid': sc += Math.min(1.2, (t.amount || 0) / Math.max(0.1, x.gdp * 0.01) * 0.25); break;
      case 'arms': sc += Math.min(1, (t.amount || 0) / Math.max(0.1, x.gdp * 0.01) * 0.2) * (W.enemies(S_, X).length ? 1.3 : 0.6); break;
      case 'lift_my_sanctions': sc += 0.4; break;
      case 'lift_sanctions': sc -= 0.2 - W.rel(S_, X, P) / 500; break;
      case 'tech_share': sc += x.tech < S_.actors[P].tech ? 0.15 : -0.1; break;
      case 'drop_ultimatum': sc -= 0.35; break;
      case 'send_troops': sc += -0.35 + x.loyal * 0.4 + W.rel(S_, X, P) / 250 + (W.isAlly(S_, X, P) ? 0.3 : 0); break;
      case 'mobilize': sc += -0.15 + W.rel(S_, X, P) / 300 + (W.isAlly(S_, X, P) ? 0.15 : 0); break;
    }
  }
  return { sc, why };
}
function mpRuleAgent(S_, X, msg) {
  const P = S_.player, terms = raParse(S_, X, msg), v = { voice: X }, rl = W.rel(S_, X, P), war = W.atWar(S_, P, X);
  const ul = S_.ultis.find(u => u.from === X && u.status === 'open');
  const ulTxt = ul ? ' ' + T('ra.ulti', { d: { k: 'ud.' + ul.demand, p: { l: ul.loc, b: ul.with, t: ul.t } } }) : '';
  if (!terms.length) {
    const mood = war ? 'war' : rl >= 40 ? 'friend' : rl > -25 ? 'neutral' : 'hostile';
    const sug = ['trade', 'nap', 'alliance', 'access'].filter(t => !W.hasTreaty(S_, P, X, t) && !war).map(t => [t, W.evalDeal(S_, P, X, { type: t }).score]).filter(z => z[1] > -0.25).sort((a, b) => b[1] - a[1]).map(z => ({ k: 'dk.' + z[0] }));
    if (war) sug.unshift({ k: 'dk.ceasefire' });
    return { reply: T('ra.hello.' + mood, { v }) + (sug.length ? ' ' + T('ra.suggest', { x: { list: sug.slice(0, 3) } }) : '') + ulTxt, deal: { status: 'none', terms: [] } };
  }
  const bad = terms.map(t => [t, W.dealCheck(S_, X, t)]).filter(z => z[1]);
  const ok = terms.filter(t => !W.dealCheck(S_, X, t));
  if (!ok.length) return { reply: T('ra.invalid', { v, r: TX(bad[0][1]) }), deal: { status: 'reject', terms: [] } };
  const { sc, why } = raEval(S_, X, ok), noise = (Math.random() - 0.5) * 0.12, list = { list: ok.map(t => ({ raw: termText(t) })) };
  if (sc + noise > 0.05) return { reply: T('ra.accept', { v, x: list }) + ulTxt, deal: { status: 'accept', terms: ok, summary: '' } };
  if (sc > -0.75) {
    const need = +Math.max(0.5, (0.12 - sc) / 0.25 * S_.actors[X].gdp * 0.01).toFixed(1), cap = S_.actors[P].gdp * 0.03;
    const extra = [];
    if (S_.sanctions.some(z => z.from === P && z.to === X) && !ok.some(t => t.type === 'lift_my_sanctions')) extra.push({ type: 'lift_my_sanctions' });
    const sc2 = sc + (extra.length ? 0.4 : 0);
    if (sc2 < 0.05) { if (need > cap) return { reply: T('ra.reject', { v, r: why.length ? TX(why[0]) : T('ra.why.interest') }) + ulTxt, deal: { status: 'reject', terms: [] } }; extra.push({ type: 'aid', amount: +Math.max(0.5, (0.12 - sc2) / 0.25 * S_.actors[X].gdp * 0.01).toFixed(1) }); }
    const all = ok.concat(extra);
    return { reply: T('ra.counter', { v, x: list, y: { list: extra.map(t => ({ raw: termText(t) })) } }) + ulTxt, deal: { status: 'counter', terms: all, summary: '' } };
  }
  return { reply: T('ra.reject', { v, r: why.length ? TX(why[0]) : T('ra.why.interest') }) + ulTxt, deal: { status: 'reject', terms: [] } };
}

/* ---------- 多人局：本回合方针（只交给房主的推演，其他玩家看不到） ---------- */
const mpPlanOn = () => !!(MPS.on && S && S.humans && S.humans.length > 1 && !UI.demo && (!mpNet() || MPS.seat));
const mpPlanGet = () => (mpNet() ? MPS.plan || '' : ((S.mp && S.mp.hplan) || {})[S.player] || '');
function mpPlanSet(t) {
  t = String(t || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 600);
  if (mpNet()) { MPS.plan = t; mpSaveMine(); } else { S.mp.hplan = S.mp.hplan || {}; if (t) S.mp.hplan[S.player] = t; else delete S.mp.hplan[S.player]; mpLocalSave(); }
}
function mpPlanChip() {
  if (!mpPlanOn()) return '';
  const t = mpPlanGet();
  return `<button type="button" class="qchip qplan ${t ? 'on' : ''}" id="mpPlanBtn" title="${esc(t || T('mp.plan_x'))}">✎ ${T(t ? 'mp.plan_set' : 'mp.plan_add')}</button>`;
}
function mpPlanEdit() {
  showModal(`<h2>${T('mp.plan_h')}</h2><p class="sub">${T('mp.plan_x')}</p>
    <textarea id="mpPlanText" rows="5" style="width:100%" maxlength="600" placeholder="${esc(T('mp.plan_ph'))}">${esc(mpPlanGet())}</textarea>
    <div class="foot"><button data-close="1">${T('u.cancel')}</button><button class="btn-primary" id="mpPlanOk">${T('mp.plan_save')}</button></div>`, 'narrow', true);
  const ta = $('#mpPlanText'); if (ta) ta.focus();
  $('#mpPlanOk').onclick = () => { mpPlanSet(($('#mpPlanText') || {}).value || ''); closeModal(); renderQueue(); toast(T(mpPlanGet() ? 'mp.plan_saved' : 'mp.plan_cleared')); };
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#mpPlanBtn') && mpPlanOn()) mpPlanEdit(); });
