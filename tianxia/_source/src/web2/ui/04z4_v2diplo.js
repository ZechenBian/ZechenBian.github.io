// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 新版 · 外交页（原“外交”与“通讯”合并） =====================
 * 待处理（核心利益危机、最后通牒、危机、来函）→ 对话（公开频道、真人玩家、AI 国家；每个对话里有“首脑会晤”和“协议”）→
 * 条约与计划（逐项“退出”、退出集团、停止长期援助）→ 实时数据变更。
 * 协议：AI 国家和真人玩家用同一张表单。和 AI 国家签一份花 1 点（含同盟或臣服 2 点）；真人之间的协议不花点。
 * 打字（私信、和 AI 国家讨价还价、公开发言）都在底部的统一输入框，选“对某国”或“公开”。 */
const V2T = [
  { c: 'trade', g: 'both' }, { c: 'alliance', g: 'both' }, { c: 'nap', g: 'both' }, { c: 'access', g: 'both' }, { c: 'partner', g: 'both' }, { c: 'armsctl', g: 'both' },
  { c: 'ceasefire', g: 'both', war: 1 }, { c: 'peace', g: 'both', war: 1 },
  { c: 'aid', g: 'me', f: 'amt' }, { c: 'arms', g: 'me', f: 'amt' }, { c: 'lift_my_sanctions', g: 'me' }, { c: 'tech_share', g: 'me' }, { c: 'pledge_no_attack', g: 'me', ai: 1 }, { c: 'withdraw', g: 'me', f: 'loc' },
  { c: 'vassal', g: 'them' }, { c: 'lift_sanctions', g: 'them' }, { c: 'tribute', g: 'them', f: 'amt' }, { c: 'join_war', g: 'them', f: 'enemy' }, { c: 'break_alliance', g: 'them', f: 'with', ai: 1 },
  { c: 'drop_ultimatum', g: 'them', ai: 1 }, { c: 'send_troops', g: 'them', f: 'dest' }, { c: 'mobilize', g: 'them' }, { c: 'raise_defense', g: 'them', ai: 1 },
];
const V2T_BY = Object.fromEntries(V2T.map(z => [z.c, z]));
/* 某一项条款现在能不能谈（不能的不出现在下拉里） */
function v2TermOk(C, c) {
  const P = S.player, z = V2T_BY[c], war = W.atWar(S, P, C), human = W.isHuman(S, C); if (!z || (z.ai && human)) return false;
  if (z.g === 'both') return z.war ? war : !war && !W.hasTreaty(S, P, C, c) && !(c === 'access' && (W.canStation(S, P, C) || W.noBase(S, P, C))); // 网页版 v3：中国领土上不允许外国驻军
  switch (c) {
    case 'vassal': return W.fallen(S, P, C) && !W.isGuarded(S, C) && !S.actors[C].overlord;
    case 'lift_my_sanctions': return S.sanctions.some(s => s.from === P && s.to === C);
    case 'lift_sanctions': return S.sanctions.some(s => s.from === C && s.to === P);
    case 'drop_ultimatum': return S.ultis.some(u => u.from === C && u.status === 'open');
    case 'withdraw': return v2Locs().length > 0;
    case 'join_war': return W.enemies(S, P).some(E => E !== C);
    case 'break_alliance': return W.IDS.some(Y => Y !== P && Y !== C && W.isAlly(S, C, Y));
    case 'send_troops': return !war && W.reqDestOptions(S, C).length > 0;
    case 'mobilize': case 'raise_defense': return !war && S.actors[C].mob < 2;
    case 'aid': case 'arms': case 'tech_share': case 'pledge_no_attack': return !(c === 'pledge_no_attack' && war);
    case 'tribute': return war || W.powerRatio(S, P, C) >= 2;
  }
  return true;
}
const v2Locs = () => W.stations(S, S.player).filter(L => L !== S.player && W.share(S, S.player, L) > 0);
function v2FieldOpts(C, c) {
  const P = S.player;
  if (c === 'withdraw') return v2Locs().map(L => [L, NAME(L)]);
  if (c === 'join_war') return W.enemies(S, P).filter(E => E !== C).map(E => [E, NAME(E)]);
  if (c === 'break_alliance') return W.IDS.filter(Y => Y !== P && Y !== C && W.isAlly(S, C, Y)).map(Y => [Y, NAME(Y)]);
  if (c === 'send_troops') return W.reqDestOptions(S, C).map(v => [v, paramLabel(W.ACT.reqtroops, 'dest', v)]);
  return [];
}
/* 加一项条款（先校验、补上默认值） */
function v2PropAdd(C, c, o) {
  if (MPS.propFor !== C) { MPS.prop = []; MPS.propFor = C; }
  if (!v2TermOk(C, c) || MPS.prop.some(t => t.code === c) || MPS.prop.length >= 6) return false;
  const z = V2T_BY[c], t = { code: c };
  if (z.f === 'amt') t.amt = +(o && o.amt > 0 ? o.amt : c === 'tribute' ? v2Nice(S.actors[C].gdp * 0.01) : v2Nice(S.actors[S.player].gdp * 0.002)).toFixed(3);
  if (['loc', 'enemy', 'with', 'dest'].includes(z.f)) { const opts = v2FieldOpts(C, c).map(q => q[0]); const want = o && o[z.f]; t[z.f] = want && opts.includes(want) ? want : opts[0]; if (!t[z.f]) return false; }
  MPS.prop.push(t); return true;
}
function v2TermMsg(t) {
  const base = T('v2.deal.' + t.code), z = V2T_BY[t.code] || {};
  const x = z.f === 'amt' ? fmtB(t.amt) : z.f === 'dest' ? paramLabel(W.ACT.reqtroops, 'dest', t.dest) : z.f ? NAME(t[z.f]) : '';
  return base + (x ? paren(x) : '');
}
function v2ToAI(t) {
  switch (t.code) {
    case 'aid': case 'arms': return { type: t.code, amount: t.amt };
    case 'tribute': return { type: 'tribute', amount: +(t.amt / 4).toFixed(3) };
    case 'join_war': return { type: 'join_war', enemy: t.enemy };
    case 'break_alliance': return { type: 'break_alliance', with: t.with };
    case 'withdraw': return { type: 'withdraw', loc: t.loc };
    case 'send_troops': return String(t.dest || '').startsWith('D:') ? { type: 'send_troops', loc: t.dest.slice(2), share: 0.08 } : { type: 'send_troops', front: t.dest, share: 0.08 };
    case 'mobilize': return { type: 'mobilize', level: 2 };
    case 'raise_defense': return { type: 'raise_defense', pct: 0.8 };
    case 'pledge_no_attack': return { type: 'pledge_no_attack', turns: 8 };
  }
  return { type: t.code };
}
function v2ToH(t, P, C) {
  switch (t.code) {
    case 'aid': case 'arms': return { type: t.code, by: P, amount: t.amt };
    case 'lift_my_sanctions': return { type: 'lift_sanctions', by: P };
    case 'withdraw': return { type: 'withdraw', by: P, loc: t.loc };
    case 'vassal': return { type: 'vassal', by: C };
    case 'lift_sanctions': return { type: 'lift_sanctions', by: C };
    case 'tribute': return { type: 'aid', by: C, amount: t.amt };
    case 'join_war': return { type: 'join_war', by: C, enemy: t.enemy };
    case 'send_troops': return { type: 'send_troops', by: C, dest: t.dest || null, size: 1 };
    case 'mobilize': return { type: 'mobilize', by: C, level: 2 };
  }
  return { type: t.code };
}

/* ---------- 外交页 ---------- */
function v2DiploHTML() {
  const P = S.player; let s = '';
  if (mpNet() && !MPS.seat) return `<div class="sec"><p class="muted">${T('mp.c.watch_x')}</p></div>` + mpFeedHTML();
  if (mpNet()) mpLoadPriv();
  // 待处理
  const cores = W.coreView(S).filter(k => k.status === 'active' && (k.o === P || k.v === P));
  const ultis = S.ultis.filter(u => u.status === 'open' && !u.core), crs = S.crises.filter(c => !c.resolved), offers = S.inbox;
  if (cores.length || ultis.length || crs.length || offers.length) {
    s += `<div class="sec"><h3>${T('v2.pending')} <span class="tag red">${cores.length + ultis.length + crs.length + offers.length}</span></h3><div class="list">`;
    s += cores.map(k => { const Y = k.o === P ? k.v : k.o; return `<div class="item"><div class="row"><b class="bad">${T('u.core_crises')}${colonT()}${esc(NAME(Y))}</b><button class="mini" data-v2target="${Y}">${T('v2.core_go')}</button></div><div style="font-size:12.5px">${esc(TX(k.o === P ? { k: 'u.cs.mine_about', p: { a: k.v, x: k.interest } } : { k: 'u.core.about', p: { x: k.interest } }))}</div></div>`; }).join('');
    s += ultis.map(ultiHTML).join('');
    s += crs.map(c => `<div class="item"><div class="row"><b>${esc(TX(c.title))}</b><span class="tag">${c.deadline - S.turn > 0 ? T('u.cr_left') : T('u.cr_now')}</span></div><div class="btns"><button class="btn-primary" data-crisis="${c.id}">${T('u.decide')}</button></div></div>`).join('');
    s += offers.map(o => `<div class="item"><div class="row"><b>${esc(NAME(o.from))}</b><span class="muted" style="font-size:11.5px">${T('u.valid', { n: o.expires - S.turn + 1 })}</span></div><div style="font-size:13px;margin-top:4px">${esc(TX(o.msg))}</div>${o.deal && o.deal.text ? `<div class="muted" style="font-size:12px">“${esc(o.deal.text)}”</div>` : ''}<div class="btns"><button class="btn-primary" data-offer="${o.id}" data-ok="1">${T('u.accept')}</button><button data-offer="${o.id}" data-ok="0">${T('u.decline')}</button>${v2CanTalk(o.from) ? `<button data-mptalk="${o.from}">${T('v2.talk')}</button>` : ''}</div></div>`).join('');
    s += `</div>${ultis.length ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${T('u.ulti_help')}</p>` : ''}</div>`;
  }
  // 对话
  const hum = (S.humans || []).filter(C => C !== P);
  s += `<div class="sec"><h3>${T('v2.talks')}</h3>`;
  if (hum.length) {
    const pubCard = `<button class="mpcard mppub ${MPS.thread === 'P:*' ? 'on' : ''}" data-mpth="P:*"><span class="n">📢 ${T('mp.c.public')}${MPS.unread['P:*'] ? ' <b class="bad">●</b>' : ''}</span><small>${T('mp.c.public_s')}</small></button>`;
    s += `<div class="mplist">${pubCard}${hum.map(C => { const uid = MPS.meta && MPS.meta.seats ? MPS.meta.seats[C] : null, ext = mpAgentOf(C) === 'ext', un = MPS.unread['H:' + C], off = S.inbox.filter(o => o.from === C).length; return `<button class="mpcard ${MPS.thread === 'H:' + C ? 'on' : ''}" data-mpth="H:${C}"><span class="n"><i style="background:${polColor(C)}"></i>${esc(NAME(C))}${un ? ' <b class="bad">●</b>' : ''}${off ? ` <span class="tag red">${off}</span>` : ''}</span><small>${ext ? T('mp.ag.ext') : uid ? `<i class="mpdot ${mpOnline(uid) ? 'on' : ''}"></i>${esc(mpName(uid))}` : T('mp.c.hotseat')} · ${T(relWord(W.rel(S, P, C), W.atWar(S, P, C))[0])}</small></button>`; }).join('')}</div>`;
  }
  const rel = mpRelevant(), showAll = UI.open.v2keep_allAg, list = showAll ? rel : rel.slice(0, 10);
  if (MPS.thread && MPS.thread.startsWith('A:') && !list.includes(MPS.thread.slice(2)) && rel.includes(MPS.thread.slice(2))) list.unshift(MPS.thread.slice(2));
  s += `<p class="muted" style="font-size:12px;margin:${hum.length ? 8 : 0}px 0 6px">${T('v2.agents_x')}</p><div class="mplist">${list.map(X => { const ag = mpAgentOf(X), off = S.inbox.filter(o => o.from === X).length; return `<button class="mpcard ${MPS.thread === 'A:' + X ? 'on' : ''}" data-mpth="A:${X}"><span class="n"><i style="background:${polColor(X)}"></i>${esc(NAME(X))}${off ? ` <span class="tag red">${off}</span>` : ''}</span><small><span class="tag ${ag === 'claude' ? 'blue' : ag === 'ext' ? 'acc' : ''}">${T('mp.ag.' + ag)}</span> ${T(relWord(W.rel(S, P, X), W.atWar(S, P, X))[0])}</small></button>`; }).join('')}</div>${rel.length > 10 ? `<button class="mini" data-v2allag="1">${showAll ? T('mp.c.less') : T('mp.c.more', { n: rel.length - 10 })}</button>` : ''}</div>`;
  if (MPS.thread) s += v2ThreadHTML(MPS.thread);
  s += v2TreatyHTML();
  s += mpFeedHTML();
  return s;
}
function v2ThreadHTML(key) {
  const [k, C] = key.split(':'), P = S.player;
  if (k === 'P') {
    MPS.seen[key] = Date.now(); MPS.unread[key] = false;
    const msgs = mpPublicMsgs();
    return `<div class="sec mpthread" id="v2thread"><div class="row"><h3 style="margin:0">📢 ${T('mp.c.public')}</h3><button class="mini" data-mpth="">${T('u.close')}</button></div>
      <p class="muted" style="font-size:12px;margin:4px 0 6px">${T('mp.c.public_x')}</p>
      <div class="chat" id="mpChat">${msgs.map(m => `<div class="msg ${m.mine ? 'me' : 'them'}">${m.mine ? '' : `<span class="who"><i class="mpsw" style="background:${polColor(m.from)}"></i>${esc(NAME(m.from))}${m.ext ? ' · ' + T('mp.ag.ext') : ''}</span>`}${esc(m.text)}</div>`).join('') || `<p class="muted" style="font-size:12.5px">${T('mp.c.pub_empty')}</p>`}</div>
      <p class="muted v2hint">${T('v2.hint.pub')}</p></div>`;
  }
  if (!S.actors[C]) return '';
  const offers = S.inbox.filter(o => o.from === C), sm = W.actionStatus(S, 'summit', C, {});
  let s = `<div class="sec mpthread" id="v2thread"><div class="row"><h3 style="margin:0"><i class="mpsw" style="background:${polColor(C)}"></i>${esc(NAME(C))}</h3><span class="v2th-b"><button class="mini" data-v2one="summit" data-t="${C}" ${sm.ok ? '' : 'disabled'} title="${esc(sm.ok ? TX(sm.preview) : TX(sm.reason))}">🤝 ${T('a.summit')} · ${T('u.apn', { n: W.apCost(S, 'summit', C, {}) })}</button><button class="mini" data-v2target="${C}">${T('u.dossier')}</button><button class="mini" data-mpth="">${T('u.close')}</button></span></div>`;
  if (offers.length) s += `<div class="list" style="margin:6px 0">${offers.map(o => `<div class="item"><div style="font-size:13px">${esc(TX(o.msg))}</div>${o.deal && o.deal.text ? `<div class="muted" style="font-size:12px">“${esc(o.deal.text)}”</div>` : ''}<div class="btns"><button class="btn-primary" data-offer="${o.id}" data-ok="1">${T('u.accept')}</button><button data-offer="${o.id}" data-ok="0">${T('u.decline')}</button></div></div>`).join('')}</div>`;
  if (k === 'H') {
    MPS.seen[key] = Date.now(); MPS.unread[key] = false;
    const msgs = mpHumanMsgs(C), txt = m => (typeof m.text === 'string' ? esc(m.text) : `<span class="muted">${T(m.text === false ? 'mp.c.dm_bad' : 'mp.c.dm_dec')}</span>`);
    s += `${mpNet() && mpAgentOf(C) !== 'ext' ? `<p class="muted mplock">🔒 ${T('mp.c.dm_lock')}</p>` : ''}<div class="chat" id="mpChat">${msgs.map(m => `<div class="msg ${m.mine ? 'me' : 'them'}">${m.mine ? '' : `<span class="who">${esc(NAME(C))}${m.ext ? ' · ' + T('mp.ag.ext') : ''}</span>`}${txt(m)}</div>`).join('') || `<p class="muted" style="font-size:12.5px">${T('mp.c.dm_empty')}</p>`}</div>`;
  } else {
    const ag = mpAgentOf(C), hist = mpAgentHist(C), eng = ag === 'claude' && useLLM() ? 'claude' : ag === 'ext' ? 'ext' : 'rule';
    s += `<div class="muted" style="font-size:12px">${T('mp.c.agent_' + eng, { v: { voice: C } })}</div>
      <div class="chat" id="mpChat">${hist.map((m, i) => mpAgentMsgHTML(C, m, i, i === hist.length - 1)).join('') || `<p class="muted" style="font-size:12.5px">${T('mp.c.agent_eg')}</p>`}${MPS.chatBusy === C ? `<div class="msg them"><span class="who">${esc(NAME(C))}</span>${T('u.thinking')}</div>` : ''}</div>
      <div class="mpchips">${mpSuggest(C).map(t => `<button class="mini" data-mpsug="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  }
  s += `<p class="muted v2hint">${T(k === 'H' ? 'v2.hint.dm' : 'v2.hint.ai', { a: C })}</p>`;
  return s + v2PropHTML(C, k === 'H') + '</div>';
}
/* 协议表单（AI 国家与真人玩家共用） */
function v2PropHTML(C, human) {
  const P = S.player; if (MPS.propFor !== C) { MPS.prop = []; MPS.propFor = C; }
  const list = MPS.prop, avail = V2T.filter(z => v2TermOk(C, z.c) && !list.some(t => t.code === z.c));
  const cur = avail.some(z => z.c === UI.v2pt) ? UI.v2pt : (avail[0] || {}).c, z = V2T_BY[cur] || {};
  const og = g => { const xs = avail.filter(q => q.g === g); return xs.length ? `<optgroup label="${esc(T('v2.pg.' + g))}">${xs.map(q => `<option value="${q.c}" ${q.c === cur ? 'selected' : ''}>${esc(T('v2.deal.' + q.c))}</option>`).join('')}</optgroup>` : ''; };
  let field = '';
  if (z.f === 'amt') field = `<span class="v2amt"><input id="v2PAmt" type="number" min="0" step="any" value="${v2In(UI.v2pAmt > 0 ? UI.v2pAmt : cur === 'tribute' ? v2Nice(S.actors[C].gdp * 0.01) : v2Nice(S.actors[P].gdp * 0.002))}"><small>${T('v2.unit')}</small></span>`;
  else if (z.f) field = `<select id="v2PF">${v2FieldOpts(C, cur).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
  const need = human ? 0 : W.dealAP(list.map(v2ToAI), S), busy = MPS.chatBusy === C, open = !!UI.open.v2keep_prop || list.length > 0;
  return `<details class="mpprop v2prop" id="v2prop" ${open ? 'open' : ''}><summary>${T('v2.prop.h')} <small class="muted">${T(human ? 'v2.prop.free' : 'v2.prop.cost')}</small></summary>
    ${avail.length ? `<div class="mppropform"><select id="v2PT">${og('both')}${og('me')}${og('them')}</select>${field}<button type="button" class="mini" id="v2PAdd">${T('mp.p.add')}</button></div>` : `<p class="muted" style="font-size:12px">${T('v2.prop.none')}</p>`}
    ${list.length ? `<ul class="mpterms">${list.map((t, i) => `<li>${esc(v2TermMsg(t))} <button class="mini" data-v2pdel="${i}">×</button></li>`).join('')}</ul><button class="btn-primary" id="v2PSend" ${busy ? 'disabled' : ''}>${human ? T('v2.prop.send_h') : T('v2.prop.send_ai')}</button>${human ? '' : ` <small class="muted">${T('v2.prop.sign_cost', { n: need })}</small>`}` : `<p class="muted" style="font-size:12px">${T(human ? 'v2.prop.help_h' : 'v2.prop.help_ai')}</p>`}
  </details>`;
}
/* AI 国家回复里的协议：签署按钮写明要花几点 */
function mpAgentMsgHTML(X, m, i, last) {
  if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
  let deal = '';
  if (m.deal && m.deal.status !== 'none' && m.deal.terms && m.deal.terms.length) {
    const lbl = { accept: T('u.deal_acc'), counter: T('u.deal_counter'), reject: T('u.deal_rej') }[m.deal.status] || '';
    const warn = m.deal.terms.map(t => W.dealCheck(S, X, t)).filter(Boolean).map(TX), need = W.dealAP(m.deal.terms, S);
    deal = `<div class="deal"><b>${lbl}</b>${m.deal.summary ? `<div class="muted" style="font-size:12px">${esc(m.deal.summary)}</div>` : ''}<ul>${m.deal.terms.map(t => `<li>${esc(termText(t))}</li>`).join('')}</ul>${warn.length ? `<div class="warn" style="font-size:12px">${T('u.deal_warn', { x: { raw: warn.join(sep()) } })}</div>` : ''}${last && m.deal.status !== 'reject' && !m.signed ? `<div class="btns"><button class="btn-primary" data-mpsign="${X}" data-i="${i}" ${W.apLeft(S) < need ? 'disabled' : ''}>${T('u.sign')} · ${T('u.apn', { n: need })}</button></div>` : m.signed ? `<div class="good" style="font-size:12px">${T('u.signed')}</div>` : ''}</div>`;
  }
  return `<div class="msg them"><span class="who">${esc(NAME(X))}${m.src === 'rule' ? ' · ' + T('mp.ag.rule') : ''}</span>${esc(m.text)}${deal}</div>`;
}
function mpSign(X, i) {
  const hist = mpAgentHist(X), m = hist[i]; if (!m || !m.deal || m.signed) return;
  const need = W.dealAP(m.deal.terms, S); if (W.apLeft(S) < need) { toast(T('c.ap', { n: need })); return; }
  const done = doCmd('applyDeal', [X, m.deal.terms]); if (!done) { toast(T('mp.p.fail')); return; }
  m.signed = true; mpSavePriv();
  toast(T('u.deal_done', { x: { list: done } }), 5000); renderAll();
}
/* 条约与计划：逐项退出（行动，1 点，回合结束生效）；长期援助随时停止 */
function v2TreatyHTML() {
  const P = S.player, by = {};
  for (const t of S.treaties) if (t.a === P || t.b === P) { const o = t.a === P ? t.b : t.a; (by[o] = by[o] || []).push(t.type); }
  const qd = (o, k) => S.queue.some(q => q.type === 'break' && q.target === o && (!q.params || !q.params.kind || q.params.kind === k));
  const rows = Object.entries(by).sort((a, b) => W.power(S, b[0]) - W.power(S, a[0])).map(([o, ks]) => `<div class="item v2tr"><div class="row"><b><a href="#" data-v2target="${o}">${esc(NAME(o))}</a></b><span class="v2trks">${ks.map(k => `<span class="v2trk">${T('tr.' + k)}${qd(o, k) ? ` <span class="tag">${T('v2.leaving')}</span>` : ` <button class="mini" data-v2break="${o}|${k}">${T('v2.leave')}</button>`}</span>`).join('')}</span></div></div>`).join('');
  const blocs = Object.values(S.blocs).filter(b => b.members.includes(P));
  const bl = blocs.map(b => `<div class="item v2tr"><div class="row"><b>${esc(T('bloc.' + b.id))}${b.leader === P ? ` <span class="tag acc">${T('v2.leader')}</span>` : ''}</b>${S.queue.some(q => q.type === 'leavebloc') ? `<span class="tag">${T('v2.leaving')}</span>` : `<button class="mini" data-v2bloc="${b.id}">${T('v2.leave_bloc')}</button>`}</div><div class="muted" style="font-size:12px">${b.members.filter(m => m !== P).slice(0, 12).map(NAME).join(sep())}</div></div>`).join('');
  const progs = (S.programs || []).filter(p => p.from === P), inc = (S.programs || []).filter(p => p.to === P);
  const pr = progs.map(p => `<div class="item"><div class="row"><span style="font-size:12.5px">${T('u.prog_line', { k: T('st.k.' + p.kind), t: p.to, m: { m: p.amount }, n: p.until - S.turn + 1 })}</span><button class="mini" data-progcancel="${p.id}">${T('u.prog_cancel')}</button></div></div>`).join('') + inc.map(p => `<div class="item"><div class="row muted" style="font-size:12.5px">${T('v2.prog_in', { a: p.from, k: T('st.k.' + p.kind), m: fmtB(p.amount), n: p.until - S.turn + 1 })}</div></div>`).join('');
  return `<div class="sec"><h3>${T('v2.treaties')}</h3>${rows || bl || pr ? `<div class="list">${bl}${rows}${pr}</div>` : `<p class="muted">${T('u.notreaty')}</p>`}<p class="muted" style="font-size:12px;margin:6px 0 0">${T('v2.treaties_x')}</p></div>`;
}

/* ---------- 交互 ---------- */
document.addEventListener('click', e => {
  if (!v2On() || !S || UI.demo || !MPS.on) return;
  const t = e.target.closest && e.target.closest('#v2PAdd, [data-v2pdel], #v2PSend, [data-v2break], [data-v2bloc], [data-v2allag]'); if (!t) return;
  const d = t.dataset, C = (MPS.thread || '').split(':')[1], P = S.player;
  if (t.id === 'v2PAdd') {
    if (!C) return; const c = ($('#v2PT') || {}).value; if (!c) return; const z = V2T_BY[c] || {};
    const o = {}; if (z.f === 'amt') o.amt = v2Out(($('#v2PAmt') || {}).value); else if (z.f) o[z.f] = ($('#v2PF') || {}).value;
    if (!v2PropAdd(C, c, o)) toast(T('mp.p.fail')); UI.open.v2keep_prop = true; UI.v2pAmt = 0; renderSide(); return;
  }
  if (d.v2pdel !== undefined) { MPS.prop.splice(+d.v2pdel, 1); renderSide(); return; }
  if (t.id === 'v2PSend') { if (C) v2SendProp(C); return; }
  if (d.v2break) { const [o, k] = d.v2break.split('|'); const st = W.actionStatus(S, 'break', o, { kind: k }); if (!st.ok) { toast(TX(st.reason)); return; } mpConfirm(T('v2.break_q', { k: T('tr.' + k), t: NAME(o) }) + ' ' + TX(st.preview), () => { const r = W.queueAction(S, 'break', o, { kind: k }); if (!r.ok) toast(r.reason); else toast(T('u.queued', { x: { raw: v2QLabel(S.queue[S.queue.length - 1]) } })); renderAll(); }); return; }
  if (d.v2bloc) { const st = W.actionStatus(S, 'leavebloc', P, { bloc: d.v2bloc }); if (!st.ok) { toast(TX(st.reason)); return; } mpConfirm(T('v2.bloc_q', { x: T('bloc.' + d.v2bloc) }), () => { const r = W.queueAction(S, 'leavebloc', P, { bloc: d.v2bloc }); if (!r.ok) toast(r.reason); renderAll(); }); return; }
  if (d.v2allag) { UI.open.v2keep_allAg = !UI.open.v2keep_allAg; renderSide(); }
});
document.addEventListener('change', e => { if (v2On() && e.target && e.target.id === 'v2PT') { UI.v2pt = e.target.value; UI.v2pAmt = 0; renderSide(); } });
document.addEventListener('toggle', e => { if (v2On() && e.target && e.target.id === 'v2prop') UI.open.v2keep_prop = e.target.open; }, true); // 协议表单展开与否（重绘后保持）
document.addEventListener('input', e => { if (v2On() && e.target && e.target.id === 'v2PAmt') UI.v2pAmt = v2Out(e.target.value); });
/* 发出提议：真人 → 正式提议（免费，对方在来函里接受）；AI 国家 → 当场答复（接受、开条件或拒绝），接受后签署 */
async function v2SendProp(C) {
  const P = S.player, terms = MPS.prop.slice(); if (!terms.length) return;
  if (W.isHuman(S, C)) {
    const r = doCmd('proposeH', [C, terms.map(t => v2ToH(t, P, C)), '']);
    if (r) { toast(T('mp.p.sent', { a: C })); MPS.prop = []; } else toast(T('mp.p.fail'));
    renderSide(); return;
  }
  if (MPS.chatBusy) return;
  const text = T('v2.prop.msg', { x: { raw: terms.map(v2TermMsg).join(sep()) } });
  const ag = mpAgentOf(C), hist = mpAgentHist(C);
  hist.push({ role: 'me', text, at: Date.now() }); MPS.prop = []; MPS.chatBusy = C; renderSide();
  try {
    if (ag === 'claude' && useLLM()) { const r = await LLM.diplomacy(S, C, hist.slice(0, -1), text, { tier: UI.tier }); hist.push({ role: 'them', text: r.reply, deal: r.deal, at: Date.now() }); }
    else if (ag === 'ext' && mpNet()) { mpSendHuman(C, text); hist.push({ role: 'them', text: T('mp.c.ext_fwd'), at: Date.now(), src: 'sys' }); }
    else { const r = v2RuleRespond(S, C, terms.map(v2ToAI)); hist.push({ role: 'them', text: r.reply, deal: r.deal, at: Date.now(), src: 'rule' }); }
  } catch (e) { hist.push({ role: 'them', text: T('u.chat_err', { x: { raw: LLM.errText(e) } }), at: Date.now() }); }
  MPS.chatBusy = false; mpSavePriv(); renderSide(); renderTop();
  const c = $('#mpChat'); if (c) c.scrollTop = c.scrollHeight;
}
/* 规则智能体对结构化提议的答复（与旧版按文字解析的谈判同一套评估，多几种条款） */
function v2RuleRespond(S_, X, terms) {
  const P = S_.player, v = { voice: X }, ul = S_.ultis.find(u => u.from === X && u.status === 'open');
  const ulTxt = ul ? ' ' + T('ra.ulti', { d: { k: 'ud.' + ul.demand, p: { l: ul.loc, b: ul.with, t: ul.t } } }) : '';
  const bad = terms.map(t => [t, W.dealCheck(S_, X, t)]).filter(z => z[1]), ok = terms.filter(t => !W.dealCheck(S_, X, t));
  if (!ok.length) return { reply: T('ra.invalid', { v, r: TX(bad[0][1]) }), deal: { status: 'reject', terms: [] } };
  const base = raEval(S_, X, ok), x = S_.actors[X]; let sc = base.sc; const why = base.why.slice();
  for (const t of ok) switch (t.type) {
    case 'tribute': sc -= 0.3 + Math.min(1.5, (+t.amount || 0) * 4 / Math.max(0.1, x.gdp * 0.01) * 0.25); break;
    case 'break_alliance': sc -= 0.7 - Math.max(0, -W.rel(S_, X, String(t.with || '')) / 200); break;
    case 'pledge_no_attack': sc += 0.15 + (W.powerRatio(S_, P, X) > 1.2 ? 0.2 : 0); break;
    case 'withdraw': sc += 0.25; break;
    case 'raise_defense': sc += -0.25 + W.rel(S_, X, P) / 300 + (W.isAlly(S_, X, P) ? 0.15 : 0); break;
  }
  const noise = (Math.random() - 0.5) * 0.12, list = { list: ok.map(t => ({ raw: termText(t) })) };
  if (sc + noise > 0.05) return { reply: T('ra.accept', { v, x: list }) + ulTxt, deal: { status: 'accept', terms: ok, summary: '' } };
  if (sc > -0.75) {
    const cap = S_.actors[P].gdp * 0.03, extra = [];
    if (S_.sanctions.some(z => z.from === P && z.to === X) && !ok.some(t => t.type === 'lift_my_sanctions')) extra.push({ type: 'lift_my_sanctions' });
    const sc2 = sc + (extra.length ? 0.4 : 0);
    if (sc2 < 0.05) { const need = +Math.max(0.5, (0.12 - sc2) / 0.25 * x.gdp * 0.01).toFixed(1); if (need > cap) return { reply: T('ra.reject', { v, r: why.length ? TX(why[0]) : T('ra.why.interest') }) + ulTxt, deal: { status: 'reject', terms: [] } }; extra.push({ type: 'aid', amount: need }); }
    return { reply: T('ra.counter', { v, x: list, y: { list: extra.map(t => ({ raw: termText(t) })) } }) + ulTxt, deal: { status: 'counter', terms: ok.concat(extra), summary: '' } };
  }
  return { reply: T('ra.reject', { v, r: why.length ? TX(why[0]) : T('ra.why.interest') }) + ulTxt, deal: { status: 'reject', terms: [] } };
}
