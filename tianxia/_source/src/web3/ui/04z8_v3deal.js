// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 网页版 v3 · 和 AI 国家签的协议回合结束时统一结算 =====================
 * 签署 = 排进本回合队列（占行动力，结算前可以撤回）。回合结束时，同一个 AI 国家收到的协议一起结算：
 * 互相排斥的（例如同时和互为对手的两国结盟、要它对其中一方参战、同时臣服两国）由它按自己的评估选一份，
 * 其余作废、所占行动力下回合退还；和当时局面冲突的条款也作废。规则在 src/engine/06_turn.js（queueDeal / resolveDeals）。
 * 对话里的协议卡片显示：待结算（可撤回）→ 结算结果（从本人的战报里按协议编号找）。
 * 接受的来函、命令里对方同意的结盟和入集团也在队列里（S.pend3），同样回合结束时结算；本回合的协议和自己排的行动冲突时提示。 */
const v3DealAt = did => (did ? S.queue.findIndex(q => q.type === 'deal' && q.params && q.params.did === did) : -1);
const v3DealTerms = terms => (Array.isArray(terms) ? terms : []).map(termText).join(sep());

/* 队列里的协议写明和谁、哪几项；旧版外交行动照行动写（其余同 v2）；和本回合自己的协议冲突的，前面加 ⚠ */
function v3ItemLabel(q) {
  if (q.type === 'deal') { const p = q.params || {}; return p.act && W.ACT[p.act] ? qLabel({ type: p.act, target: q.target, params: p.aparams || {} }) : T('v3.q.deal', { a: q.target, x: { raw: v3DealTerms(p.terms) } }); }
  if (q.type === 'break' && q.params && q.params.kind) return T('v2.q.break1', { k: T('tr.' + q.params.kind), t: q.target });
  if (q.type === 'leavebloc') return T('a.leavebloc') + (q.params && q.params.bloc ? paren(T('bloc.' + q.params.bloc)) : '');
  if (q.type === 'conscript' && q.params && +q.params.n > 0) return T('a.conscript') + paren(persT(+q.params.n));
  if (q.type === 'procure' && q.params && +q.params.amt > 0) return T('a.procure') + paren(T('br.' + (q.params.branch || 'land')) + ' ' + fmtB(+q.params.amt));
  return qLabel(q);
}
const v3Conf = () => (v3On() && S ? W.selfConflicts3(S) : []);
const v3ConfOf = x => v3Conf().find(c => c.item === x || c.deal === x);
function v2QLabel(q) { return (v3ConfOf(q) ? '⚠ ' : '') + v3ItemLabel(q); }

/* 队列里另外显示：已接受的来函（可以撤回）、命令里对方已同意的协议——都在回合结束时和签署的协议一起结算 */
function v3QueueExtra() {
  if (!v3On() || !S) return [];
  return (S.pend3 || []).filter(z => z && z.P === S.player).map(z => {
    const lab = (v3ConfOf(z) ? '⚠ ' : '') + T(z.kind === 'offer' ? 'v3.q.offer' : 'v3.q.cmd', { a: z.X, x: { raw: v3DealTerms(z.terms) } });
    return `<span class="qchip v3pend"><span class="t" title="${esc(lab + ' · ' + T('v3.q.pend_t'))}">${esc(lab)}</span><small>${T('u.ap0')}</small>${z.kind === 'offer' ? `<button data-v3unacc="${esc(z.did)}" aria-label="${esc(T('u.remove'))}">×</button>` : ''}</span>`;
  });
}

/* 自己和自己矛盾：本回合的协议在结算一开始生效，行动随后执行。新出现冲突时提示一次（有别的窗口开着就只提示一句） */
const v3ConfKey = c => [c.X, c.why, c.item.type, c.item.target || '', c.item.to || '', (c.deal.params && c.deal.params.did) || c.deal.did || ''].join('|');
function v3AfterQueue() {
  if (!v3On() || !S || UI.demo || !S.queue) return;
  const cs = v3Conf(), keys = cs.map(v3ConfKey), items = new Set(S.queue);
  const fresh0 = !UI.v3conf || UI.v3confTurn !== S.turn || UI.v3confP !== S.player;
  const prevQ = UI.v3prevQ || new Set(), fresh = fresh0 ? [] : cs.filter((c, i) => !UI.v3conf.has(keys[i]));
  UI.v3conf = new Set(keys); UI.v3confTurn = S.turn; UI.v3confP = S.player; UI.v3prevQ = items;
  if (!fresh.length) return;
  const c = fresh[0], actNew = !prevQ.has(c.item), x = v3ItemLabel(c.item), y = termText({ type: c.term });
  const msg = T('v3.self.' + c.why, { x: { raw: x }, a: c.X, y: { raw: y } });
  if (!$('#modal').hidden) { toast(T('v3.self_toast', { x: { raw: x }, a: c.X }), 6000); return; }
  const canDrop = actNew || c.deal.type === 'deal' || c.deal.kind === 'offer';
  showModal(`<h2>⚠ ${T('v3.self_h')}</h2><p style="font-size:14px">${esc(msg)}</p><div class="foot"><button data-close="1">${T(canDrop ? 'v3.self.keep' : 'v3.self.ok')}</button>${canDrop ? `<button class="btn-primary" id="v3cDrop">${T(actNew ? 'v3.self.drop_act' : 'v3.self.drop_deal')}</button>` : ''}</div>`, 'narrow', true);
  const b = $('#v3cDrop'); if (b) b.onclick = () => {
    UI.afterClose = null; closeModal();
    if (actNew) { const k = S.queue.indexOf(c.item); if (k >= 0) W.unqueue(S, k); }
    else if (c.deal.type === 'deal') { const k = S.queue.indexOf(c.deal); if (k >= 0) W.unqueue(S, k); }
    else if (c.deal.kind === 'offer') doCmd('unacceptOffer', [c.deal.did]);
    renderAll();
  };
}

/* 签署：v3 排进队列；回合结束时统一结算 */
function mpSign(X, i) {
  const hist = mpAgentHist(X), m = hist[i]; if (!m || !m.deal) return;
  if (!v3On()) { // 同 v2：立即生效
    if (m.signed) return;
    const need = W.dealAP(m.deal.terms, S); if (W.apLeft(S) < need) { toast(T('c.ap', { n: need })); return; }
    const done = doCmd('applyDeal', [X, m.deal.terms]); if (!done) { toast(T('mp.p.fail')); return; }
    m.signed = true; mpSavePriv(); toast(T('u.deal_done', { x: { list: done } }), 5000); renderAll(); return;
  }
  if (m.signed && (v3DealAt(m.did) >= 0 || m.st !== S.turn)) return; // 已在队列里，或已经结算
  const did = [X, S.turn, i, Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)].join('.');
  const r = W.queueDeal(S, X, m.deal.terms, did);
  if (!r.ok) { toast(TX(r.reason)); return; }
  Object.assign(m, { signed: true, did, st: S.turn }); delete m.res; mpSavePriv();
  toast(T('v3.deal_queued', { a: X, n: r.ap }), 6000); renderAll();
}

/* 结算结果：本人的战报里按协议编号找，找到后记在这条消息上（以后的回合战报换了也还在） */
let v3ResSave = 0;
function v3DealRes(m) {
  if (m.res || !m.did || !S.report || S.report.turn !== m.st) return m.res || null;
  const e = [].concat(S.report.actions || []).find(z => z && z.did === m.did); if (!e) return null;
  m.res = { msg: e.msg, tone: e.tone };
  clearTimeout(v3ResSave); v3ResSave = setTimeout(() => { try { mpSavePriv(); } catch (err) { /* 存不了就下次再存 */ } }, 50);
  return m.res;
}
function v3DealState(m, X, i, last, need) {
  const pend = v3DealAt(m.did);
  if (pend >= 0) return `<div class="v3deal pend"><span>${T('v3.deal_pend', { n: S.queue[pend].ap || 0 })}</span><button class="mini" data-v3unsign="${X}|${i}">${T('v3.deal_unsign')}</button></div>`;
  if (m.st === S.turn) return last && m.deal.status !== 'reject' ? v3SignBtn(X, i, need) : `<div class="muted" style="font-size:12px">${T('v3.deal_wd')}</div>`; // 本回合撤回了：可以再签
  const r = v3DealRes(m);
  if (r) return `<div class="v3deal ${r.tone === 'good' ? 'good' : 'bad'}">${r.tone === 'good' ? '✓' : '✕'} ${esc(TX(r.msg))}</div>`;
  return `<div class="good" style="font-size:12px">${T('u.signed')}</div>`;
}
const v3SignBtn = (X, i, need) => `<div class="btns"><button class="btn-primary" data-mpsign="${X}" data-i="${i}" ${W.apLeft(S) < need ? 'disabled' : ''} title="${esc(T('v3.deal_sign_t'))}">${T('u.sign')} · ${T('u.apn', { n: need })}</button></div>`;

/* AI 国家回复里的协议卡片（同 v2；签署后显示待结算或结果） */
function mpAgentMsgHTML(X, m, i, last) {
  if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
  let deal = '';
  if (m.deal && m.deal.status !== 'none' && m.deal.terms && m.deal.terms.length) {
    const lbl = { accept: T('u.deal_acc'), counter: T('u.deal_counter'), reject: T('u.deal_rej') }[m.deal.status] || '';
    const warn = m.deal.terms.map(t => W.dealCheck(S, X, t)).filter(Boolean).map(TX), need = W.dealAP(m.deal.terms, S);
    const tail = !v3On() ? (last && m.deal.status !== 'reject' && !m.signed ? v3SignBtn(X, i, need) : m.signed ? `<div class="good" style="font-size:12px">${T('u.signed')}</div>` : '')
      : m.signed ? v3DealState(m, X, i, last, need) : last && m.deal.status !== 'reject' ? v3SignBtn(X, i, need) : '';
    deal = `<div class="deal"><b>${lbl}</b>${m.deal.summary ? `<div class="muted" style="font-size:12px">${esc(m.deal.summary)}</div>` : ''}<ul>${m.deal.terms.map(t => `<li>${esc(termText(t))}</li>`).join('')}</ul>${warn.length ? `<div class="warn" style="font-size:12px">${T('u.deal_warn', { x: { raw: warn.join(sep()) } })}</div>` : ''}${tail}</div>`;
  }
  return `<div class="msg them"><span class="who">${esc(NAME(X))}${m.src === 'rule' ? ' · ' + T('mp.ag.rule') : ''}</span>${esc(m.text)}${deal}</div>`;
}

/* 卡片上的“撤回”：和队列里点 × 一样；队列里已接受的来函点 ×：撤回接受，提议回到待处理 */
document.addEventListener('click', e => {
  if (!v3On() || !S || UI.demo || !MPS.on) return;
  const u = e.target.closest && e.target.closest('[data-v3unacc]');
  if (u) { const r = doCmd('unacceptOffer', [u.dataset.v3unacc]); toast(r ? TX(r) : T('mp.p.fail')); renderAll(); return; }
  const t = e.target.closest && e.target.closest('[data-v3unsign]'); if (!t) return;
  const [X, i] = String(t.dataset.v3unsign).split('|'), m = mpAgentHist(X)[+i]; if (!m) return;
  const k = v3DealAt(m.did); if (k < 0) return;
  W.unqueue(S, k); toast(T('v3.deal_back', { a: X })); renderAll();
});
