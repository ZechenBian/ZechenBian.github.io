// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 新版（tianxia-v2/）· 基础：六个页签、侧栏路由、队列里的行动组合、旧入口改道 =====================
 * 只在 node build.js web2 的构建里，和 src/ui、src/uimp、src/web/ui 在同一作用域，按文件名排在它们之后：
 * 这里重新声明的同名函数（renderSide、targetHTML……）覆盖旧版的实现，旧版（tianxia/）的代码一字不动。
 * 页签：目标、本国、军事、动员（原“战时经济”，加上军费与动员）、外交（原“外交”与“通讯”合并）、情报；精细战区另有一页（网页版没有）。 */
const v2On = () => !!(window.TX_V2 && W.RULES2);
UI.v2f = UI.v2f || {}; UI.ub = UI.ub || { mode: 'exec', to: null, formal: false };
UI.aiSrc = prefs().aiSrc === 'mine' ? 'mine' : 'auto';
/* 金额输入：中文按“亿美元”，英文按“十亿美元”（$bn）；引擎里一律是十亿美元 */
const v2U = () => (EN() ? 1 : 10);
const v2In = b => { const v = (+b || 0) * v2U(); return v >= 100 ? Math.round(v) : v >= 10 ? +v.toFixed(1) : +v.toFixed(2); };
const v2Out = v => Math.max(0, +v || 0) / v2U();
const v2Nice = b => { const v = (+b || 0) * v2U(); if (v <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.max(p, Math.round(v / p) * p) / v2U(); }; // 默认金额取两位有效数字
const v2Cls = (...a) => a.filter(Boolean).join(' ');

/* ---------- 页签：动员插在军事之后；外交兼做通讯（未读私信的红点也在外交上） ---------- */
function mpInjectDOM() {
  if ($('#mpbar')) return;
  const mil = $('#tabs [data-tab="mil"]'), dip = $('#tabs [data-tab="diplo"]');
  mil.insertAdjacentHTML('afterend', `<button data-tab="weco"><span data-i18n="v2.t.mob">动员</span></button>`);
  if (dip) dip.insertAdjacentHTML('beforeend', `<span class="dot" id="commsDot" hidden></span>`);
  $('#tabs').insertAdjacentHTML('beforeend', `<button data-tab="theater" id="tabTheater" hidden><span data-i18n="th.t.tab">战区</span></button>`);
  $('#tabs').insertAdjacentHTML('beforebegin', `<div class="mpbar" id="mpbar" hidden></div>`);
  $('#tabs').classList.add('v2tabs');
  v2UbInject();
  document.addEventListener('change', e => {
    const t = e.target; if (!S || !MPS.on) return;
    if (t.id === 'milPct') mpCmd('setMil', [+t.value]);
    if (t.id === 'mixSel' && t.value !== 'custom') { const x = S.actors[S.player]; mpCmd('setMix', [x.mix.slice(), t.value]); }
  });
  document.addEventListener('click', e => { const b = e.target.closest('#mpbar button, [data-mpgo]'); if (!b) return; mpBarClick(b); });
}

/* ---------- 侧栏：所有页签都按“内容没变就不重绘”处理，重绘时保留焦点、光标与聊天滚动 ---------- */
function renderSide() {
  if (!S) return;
  if (UI.tab === 'comms') UI.tab = 'diplo';
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const pend = S.inbox.length + S.ultis.filter(u => u.status === 'open').length + S.crises.filter(c => !c.resolved).length + (S.coreC || []).filter(k => k.v === S.player && k.status === 'active').length;
  $('#inboxDot').hidden = !pend;
  $('#intelDot').hidden = !S.intelLog.some(i => i.turn >= S.turn - 1);
  const body = $('#tabbody'); const key = UI.tab + '|' + UI.sel; const st = key === UI.sideKey ? body.scrollTop : 0; UI.sideKey = key;
  let html; try { html = v2TabHTML(UI.tab); } catch (e) { console.error('v2 tab', e); html = `<p class="bad">${esc(T('u.turn_err', { x: { raw: (e && e.message) || String(e) } }))}</p>`; }
  if (UI.extHTML === html && UI.extKey === key) { body.scrollTop = st; return; }
  const keep = v2KeepForm(body);
  body.innerHTML = html; UI.extHTML = html; UI.extKey = key; keep();
  if (UI.tab === 'home' || UI.tab === 'mil') drawSparks();
  const md = $('#milDot'); if (md) md.hidden = !S.fronts.some(f => f.att === S.player || W.boss(S, f.target) === S.player) && !S.blockades.some(b => b.target === S.player);
  if ((S.coreC || []).some(k => k.v === S.player && k.status === 'active')) $('#inboxDot').hidden = false;
  body.scrollTop = st;
}
function v2TabHTML(tab) {
  if (tab === 'theater') return MPS.on && typeof thTabHTML === 'function' ? thTabHTML() : `<p class="muted">${T('mp.need_game')}</p>`;
  if ((tab === 'weco' || tab === 'diplo') && (!MPS.on || UI.demo)) return `<div class="sec"><p class="muted">${T('mp.need_game')}</p></div>`;
  switch (tab) {
    case 'target': return targetHTML();
    case 'home': return homeHTML();
    case 'mil': return milHTML();
    case 'weco': return v2MobHTML();
    case 'diplo': return v2DiploHTML();
    default: return intelHTML();
  }
}
function mpTabHTML(tab) { return v2TabHTML(tab); }
function mpKeepForm(body) { return v2KeepForm(body); }
function v2KeepForm(body) {
  const ae = document.activeElement, id = ae && body.contains(ae) && ae.id ? ae.id : null;
  let sel = null; try { if (id && ae.selectionStart != null) sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { }
  const val = id && ['text', 'number', 'textarea', 'search'].includes(ae.type || ae.tagName.toLowerCase()) ? ae.value : null;
  const chat = body.querySelector('#mpChat'), atBottom = !chat || chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40, top = chat ? chat.scrollTop : 0;
  return () => {
    const c2 = body.querySelector('#mpChat'); if (c2) c2.scrollTop = atBottom ? c2.scrollHeight : top;
    if (!id) return; const el = document.getElementById(id); if (!el || el.disabled || !body.contains(el)) return;
    if (val !== null && el.value !== val) el.value = val;
    el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { }
  };
}
/* 在外交页点地图上的国家：直接打开和它的对话 */
function select(id) {
  UI.sel = id; UI.open = Object.fromEntries(Object.entries(UI.open || {}).filter(([k]) => k.startsWith('v2keep_')));
  if (UI.tab === 'diplo' && MPS.on && !UI.demo && id && v2CanTalk(id)) { MPS.thread = (W.isHuman(S, id) ? 'H:' : 'A:') + id; MPS.seen[MPS.thread] = Date.now(); v2UbSet('to', id); }
  else if (UI.tab !== 'diplo') UI.tab = 'target';
  renderMap(); renderSide();
}
const v2CanTalk = X => !!(S && X && S.actors[X] && X !== S.player && W.indep(S, X) && !W.isNeutral(S, X) && !W.provOf(S, X));
function mpRerenderComms() { if (UI.tab !== 'diplo' || !S) return; renderSide(); }
function mpMsgsChanged() {
  if (!S || !S.humans) return;
  const open = k => UI.tab === 'diplo' && MPS.thread === k;
  for (const C of S.humans) { if (C === S.player) continue; const last = mpHumanMsgs(C).filter(m => !m.mine).slice(-1)[0]; MPS.unread['H:' + C] = !!(last && last.at > (MPS.seen['H:' + C] || 0)) && !open('H:' + C); }
  if (S.humans.length > 1) { const last = mpPublicMsgs().filter(m => !m.mine).slice(-1)[0]; MPS.unread['P:*'] = !!(last && last.at > (MPS.seen['P:*'] || 0)) && !open('P:*'); }
  mpRenderBar();
  if (UI.tab === 'diplo') mpRerenderComms();
}

/* ---------- 队列：行动组合显示成一个条目（整组计点、整组撤回） ---------- */
const V2_GROUP_OF = {};
function v2PkgLabel(grp) {
  const a = grp[0], g = V2_GROUP_OF[a.type] || 'aid', self = W.ACT[a.type] && W.ACT[a.type].self;
  const parts = grp.map(q => v2ItemShort(q));
  return T('v2.g.' + g) + (self ? '' : ' → ' + NAME(a.target)) + (EN() ? ' (' + parts.join(', ') + ')' : '（' + parts.join('、') + '）');
}
function v2ItemShort(q) {
  const p = q.params || {};
  if (q.type === 'aidprog') return T('v2.i.prog_' + (p.kind === 'arms' ? 'arms' : 'aid'), { m: fmtB(W.progOf(S, S.player, p).amount), n: W.progOf(S, S.player, p).turns });
  const nm = T('v2.i.' + q.type); const m = q.cost > 0 && ['aid', 'loan', 'armsaid', 'stabilize', 'stimulus', 'research', 'intel'].includes(q.type) ? ' ' + fmtB(q.cost) : '';
  return nm + m + (q.type === 'sanction' ? ' ' + T('sl.' + (+p.level || 1)) : '');
}
function v2QLabel(q) {
  if (q.type === 'break' && q.params && q.params.kind) return T('v2.q.break1', { k: T('tr.' + q.params.kind), t: q.target });
  if (q.type === 'leavebloc') return T('a.leavebloc') + (q.params && q.params.bloc ? paren(T('bloc.' + q.params.bloc)) : '');
  if (q.type === 'conscript' && q.params && +q.params.n > 0) return T('a.conscript') + paren(persT(+q.params.n));
  if (q.type === 'procure' && q.params && +q.params.amt > 0) return T('a.procure') + paren(T('br.' + (q.params.branch || 'land')) + ' ' + fmtB(+q.params.amt));
  return qLabel(q);
}
function renderQueue() {
  const el = $('#queue'); if (!el || !S) return;
  if (window.TX_MP && typeof mpQueueChanged === 'function') mpQueueChanged();
  const chips = [], seen = new Set();
  S.queue.forEach((it, i) => {
    if (it.pkg) {
      if (seen.has(it.pkg)) return; seen.add(it.pkg);
      const grp = S.queue.filter(z => z.pkg === it.pkg), ap = grp.reduce((s, z) => s + (z.ap || 0), 0), cost = grp.reduce((s, z) => s + (z.cost || 0), 0), lab = v2PkgLabel(grp);
      chips.push(`<span class="qchip qpkg"><span class="t" title="${esc(lab)}">${esc(lab)}</span><small>${T('u.apn', { n: ap })}${cost > 0 ? ' · ' + fmtB(cost) : ''}</small><button data-unq="${i}" aria-label="${esc(T('u.remove'))}">×</button></span>`);
      return;
    }
    const lab = v2QLabel(it);
    chips.push(`<span class="qchip"><span class="t" title="${esc(lab)}">${esc(lab)}</span><small>${it.ap ? T('u.apn', { n: it.ap }) : T('u.ap0')}${it.cost > 0 ? ' · ' + fmtB(it.cost) : ''}</small>${it.type === 'done' ? '' : `<button data-unq="${i}" aria-label="${esc(T('u.remove'))}">×</button>`}</span>`);
  });
  if (typeof v3QueueExtra === 'function') chips.push(...v3QueueExtra()); // 网页版 v3：接受的来函、命令里的协议（回合结束时结算）
  el.innerHTML = `<span class="ql">${T('u.queue', { n: chips.length })}</span>` + mpPlanChip() + (chips.length ? chips.join('') : `<span class="muted" style="font-size:12.5px">${T('u.queue_empty')}</span>`);
  v2UbRender();
  if (typeof v3AfterQueue === 'function') v3AfterQueue(); // 网页版 v3：本回合的协议和行动自相矛盾时提示
}
/* 方针：统一输入框的一种发送方式；队列旁的小条目只显示有没有写，点它切到“方针” */
function mpPlanChip() {
  if (!mpPlanOn()) return '';
  const t = mpPlanGet();
  return `<button type="button" class="qchip qplan ${t ? 'on' : ''}" id="mpPlanBtn" title="${esc(t || T('mp.plan_x'))}">✎ ${T(t ? 'mp.plan_set' : 'mp.plan_add')}</button>`;
}

/* ---------- 旧的入口改道：谈判、议和、请求盟友、警告……都到新的唯一入口 ---------- */
document.addEventListener('click', e => {
  if (!v2On() || !S || UI.demo) return;
  const t = e.target.closest && e.target.closest('[data-go], [data-chat], [data-peace], [data-wpeace], [data-askfront], [data-warnq], [data-tab], [data-mpth], [data-mptalk], [data-mpsug], #mpPlanBtn, [data-v2target]');
  if (!t) return;
  const d = t.dataset; let done = true;
  if (d.go === 'chat') v2Talk(UI.sel);
  else if (d.chat) { UI.afterClose = null; if (!$('#modal').hidden) closeModal(); v2Talk(d.chat); }
  else if (d.peace) { UI.afterClose = null; if (!$('#modal').hidden) closeModal(); v2Talk(d.peace, [{ code: 'peace' }]); }
  else if (d.wpeace) { UI.afterClose = null; closeModal(); v2Talk(d.wpeace, [{ code: 'peace' }]); }
  else if (d.askfront) { UI.afterClose = null; closeModal(); v2AskFront(d.askfront); }
  else if (d.warnq) v2OpenForm(d.warnq, 'stmt', { pick: 'warn', about: d.about });
  else if (d.tab === 'comms') { UI.tab = 'diplo'; renderSide(); }
  else if (d.mpth !== undefined) { if (!MPS.on) return; MPS.thread = d.mpth || null; if (MPS.thread) { MPS.seen[MPS.thread] = Date.now(); const [k, C] = MPS.thread.split(':'); if (k === 'P') v2UbSet('pub'); else v2UbSet('to', C); } UI.tab = 'diplo'; renderSide(); const c = $('#mpChat'); if (c) c.scrollTop = c.scrollHeight; mpRenderBar(); }
  else if (d.mptalk) v2Talk(d.mptalk);
  else if (d.mpsug !== undefined) { const C = (MPS.thread || '').split(':')[1]; v2UbSet('to', C, d.mpsug); }
  else if (t.id === 'mpPlanBtn') { if (mpPlanOn()) v2UbSet('plan', null, mpPlanGet()); }
  else if (d.v2target) { UI.sel = d.v2target; UI.tab = 'target'; renderMap(); renderSide(); }
  else done = false;
  if (done) { e.preventDefault(); e.stopPropagation(); }
}, true);
/* 打开和某国的对话（外交页），可以先放好要谈的条款 */
function v2Talk(X, terms) {
  if (!MPS.on || UI.demo) return;
  if (!v2CanTalk(X)) { UI.tab = 'diplo'; renderSide(); if (X && X !== S.player && S.actors[X]) toast(W.provOf(S, X) ? TX({ k: 'u.prov_x', p: { t: X, b: { id: W.provOf(S, X) } } }) : W.isNeutral(S, X) ? T('u.neutral_x') : T('c.notindep', { t: X })); return; }
  MPS.thread = (W.isHuman(S, X) ? 'H:' : 'A:') + X; MPS.seen[MPS.thread] = Date.now();
  if (terms && terms.length) { MPS.prop = []; MPS.propFor = X; for (const z of terms) v2PropAdd(X, z.code, z); UI.open.v2keep_prop = true; }
  UI.sel = X; UI.tab = 'diplo'; v2UbSet('to', X); renderMap(); renderSide();
  const c = $('#mpChat'); if (c) c.scrollTop = c.scrollHeight;
  const pr = $('#v2prop'); if (pr && terms && terms.length) try { pr.scrollIntoView({ block: 'nearest' }); } catch (e) { }
}
/* 作战地图上的“请求支援”：选一位盟友，打开和它的对话并放好“出兵”条款 */
function v2AskFront(fid) {
  const P = S.player, f = S.fronts.find(z => z.id === fid);
  const allies = W.IDS.filter(Y => Y !== P && W.indep(S, Y) && !W.isNeutral(S, Y) && (W.isAlly(S, P, Y) || W.isPartner(S, P, Y) || S.actors[Y].overlord === P || W.rel(S, P, Y) >= 45)).sort((a, b) => W.power(S, b) - W.power(S, a)).slice(0, 12);
  if (!allies.length) { toast(T('u.no_allies')); return; }
  const dest = f && f.att === P ? f.id : f ? 'D:' + f.target : null;
  showModal(`<h2>${T('v2.ask.h')}</h2><p class="sub">${T('v2.ask.x')}</p><div class="picker" style="max-height:300px">${allies.map(Y => `<button class="pc" data-v2ask="${Y}"><span class="n"><i style="background:${polColor(Y)}"></i>${esc(NAME(Y))}${W.isAlly(S, P, Y) ? ' ★' : ''}</span><small>${T('u.power')} ${fmtN(W.power(S, Y))} · ${T(relWord(W.rel(S, P, Y), false)[0])}</small></button>`).join('')}</div><div class="foot"><button data-close="1">${T('u.cancel')}</button></div>`, 'narrow', true);
  $$('#sheet [data-v2ask]').forEach(b => (b.onclick = () => { UI.afterClose = null; closeModal(); v2Talk(b.dataset.v2ask, [{ code: 'send_troops', dest }]); }));
}
/* 打开目标页上的某个合并表单（可以预选一项） */
function v2OpenForm(X, g, pre) {
  if (X && S.actors[X]) UI.sel = X; UI.tab = X === S.player || g === 'dom' ? (g === 'dom' ? 'home' : 'target') : 'target';
  const f = v2F(g, X); if (pre) { if (pre.pick) f.pick = pre.pick; if (pre.about) f.about = pre.about; if (pre.on) for (const id of pre.on) f.on[id] = true; if (pre.amt) Object.assign(f.amt, pre.amt); if (pre.lv) f.lv = pre.lv; if (pre.freq) f.freq = pre.freq; }
  UI.open['v2keep_f_' + g] = true; renderMap(); renderSide();
  const el = $(`#tabbody [data-v2form="${g}"]`); if (el) try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { }
}

/* ---------- 设置：AI 来源（每人一个开关） ---------- */
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ tier: UI.tier, engine: UI.engine, labels: UI.labels, theme: document.documentElement.getAttribute('data-theme') || '', lang: I18N.getLang(), layers: UI.lyr, anim: UI.animPref, aiSrc: UI.aiSrc })); } catch (e) { } }
const v2AiMine = () => UI.aiSrc === 'mine';
/* 房主共享的 AI：选了“只用我自己的”就不用 */
function haWant() {
  const m = MPS.meta;
  return !!(window.TX_WEB && !v2AiMine() && UI.engine !== 'rules' && mpNet() && MPS.gid && m && m.status === 'play' && haShared() && m.host !== MPS.uid && !MPS.host && MPS.seat && !MPS.passive && MPX.mine() && mpHostPub());
}
