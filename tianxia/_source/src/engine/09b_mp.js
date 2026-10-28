/* ===================== 多人局：席位的加入、退出与界面辅助 ===================== */
function seatDefaults(S) {
  return { goal: S.goal || 'hegemony', queue: [], inbox: [], ultis: [], crises: [], commits: [], cb: {}, mem: {}, grudge: {}, favor: {}, threat: {}, unattrib: [], crossed: {}, intelLog: [], carry: [], cbmUntil: -1, lowStab: 0, chat: {}, heg: 0, holds: {}, pre: null, history: [], pol: null, rep: null, report: null, apUsed: 0 };
}
/* 让 H 成为真人席位（开局或中途接管 AI 国家） */
function addHuman(S, H) {
  if (!S.actors[H] || isHuman(S, H) && S.humans) return false;
  if (!S.humans) S.humans = [S.player];
  if (S.humans.includes(H)) return false;
  S.seats = S.seats || {};
  S.humans.push(H); S.seats[H] = seatDefaults(S);
  withSeat(S, H, () => {
    initPolitics(S); threatTurn(S, null, true); snapshotHistory(S);
    S.report = { turn: S.turn, intro: true };
    for (const e of enemies(S, H)) grantCB(S, e, 'attacked', 400, false);
    for (const k of S.coreC || []) if (k.status === 'active' && k.v === H && !S.ultis.some(u => u.core === k.id)) { const d = coreDemand(S, k); if (d) { const u = Object.assign({ id: 'U' + S.seq++, from: k.o, conseq: 'war', resolve: 0.9, turn: S.turn, deadline: Math.max(k.due, S.turn + 1), status: 'open', base: S.actors[H].nukeProg, core: k.id }, d); S.ultis.push(u); } }
  });
  logEvent(S, 'mp', M('mp.join', { a: H }), 'info', [H]);
  return true;
}
/* 真人退出（主动离开或战败出局）：国家交还 AI 托管；最后一位真人出局则全局结束 */
function dropHuman(S, H, over) {
  if (!S.humans || !S.humans.includes(H)) return false;
  if (over) (S.out = S.out || {})[H] = Object.assign({ turn: S.turn }, over);
  if (S.humans.length <= 1) { if (over) S.over = over; return false; }
  if (S.player === H) swapSeat(S, S.humans.find(z => z !== H));
  delete S.seats[H];
  S.humans = S.humans.filter(z => z !== H);
  logEvent(S, 'mp', M(over ? 'mp.out' : 'mp.leave', { a: H }), 'warn', [H]);
  return true;
}
/* 多人局开局：S.player 为第一个真人，其余依次加入 */
function setupHumans(S, list) {
  S.humans = S.humans || [S.player]; S.strict = false;
  for (const H of list || []) if (H !== S.player) addHuman(S, H);
  return S;
}
/* 每个真人席位的待处理事项数（联机界面的“就绪”提示用） */
function seatPending(S, H) { const sb = seatOf(S, H); if (!sb) return 0; return sb.inbox.length + sb.ultis.filter(u => u.status === 'open').length + sb.crises.filter(c => !c.resolved).length; }

/* ---------- 真人之间的正式提议与协议 ----------
 * 条款 {type, by?, ...}：by 为履行该条款的一方（出钱、出兵、宣战、成为附庸……），省略表示双方共同（条约、停火）。 */
const H_TERMS = ['alliance', 'trade', 'nap', 'access', 'partner', 'armsctl', 'ceasefire', 'peace', 'aid', 'arms', 'join_war', 'tech_share', 'lift_sanctions', 'withdraw', 'vassal', 'send_troops', 'mobilize'];
const HCONSENT = {
  trade: () => [{ type: 'trade' }], alliance: () => [{ type: 'alliance' }], nap: () => [{ type: 'nap' }], access: () => [{ type: 'access' }], armsctl: () => [{ type: 'armsctl' }],
  vassal: (S, A, B) => [{ type: 'vassal', by: B }],
  peace: (S, A, B, p) => p.terms === 'ceasefire' ? [{ type: 'ceasefire' }] : p.terms === 'vassal' ? [{ type: 'peace' }, { type: 'vassal', by: B }] : p.terms === 'reparations' ? [{ type: 'peace' }, { type: 'aid', by: B, amount: +(S.actors[B].gdp * 0.05).toFixed(1) }] : [{ type: 'peace' }],
  reqtroops: (S, A, B, p) => [{ type: 'send_troops', by: B, dest: p.dest || null, size: clamp(+p.size || 0, 0, 2) }],
  reqmob: (S, A, B) => [{ type: 'mobilize', by: B, level: 1 }],
};
function cleanHTerms(S, A, B, terms) {
  const out = [];
  for (const t of (Array.isArray(terms) ? terms : []).slice(0, 6)) {
    if (!t || !H_TERMS.includes(t.type)) continue;
    const o = { type: t.type }; if (t.by === A || t.by === B) o.by = t.by;
    if (['aid', 'arms'].includes(t.type)) { o.by = o.by || A; o.amount = +clamp(+t.amount || S.actors[o.by].gdp * 0.003, 0.01, S.actors[o.by].gdp * 0.05).toFixed(2); }
    if (t.type === 'join_war') { o.by = o.by || B; o.enemy = String(t.enemy || '').toUpperCase(); if (!S.actors[o.enemy]) continue; }
    if (t.type === 'withdraw') { o.by = o.by || B; o.loc = String(t.loc || '').toUpperCase(); if (!S.actors[o.loc]) continue; }
    if (['lift_sanctions', 'vassal', 'send_troops', 'mobilize'].includes(t.type)) o.by = o.by || B;
    if (t.type === 'vassal') { const lord = o.by === A ? B : A; if (GRD(S, o.by) || (RULES2 && !fallen(S, lord, o.by))) continue; } // 保底国家不会臣服；规则 v2：对方几乎沦陷时才能要求
    if (t.type === 'send_troops') { o.dest = t.dest || null; o.size = clamp(+t.size || 0, 0, 2) | 0; }
    if (t.type === 'mobilize') o.level = clamp(+t.level || 1, 1, 3) | 0;
    out.push(o);
  }
  return out;
}
const hTermMsg = t => M('hd.' + t.type, { b: t.by || '', m: t.amount != null ? $m(t.amount) : '', t: t.enemy || t.loc || '', n: t.level || '' });
function proposeH(S, A, B, terms, R, text) {
  if (!isHuman(S, A) || !isHuman(S, B) || A === B) return null;
  terms = cleanHTerms(S, A, B, terms); if (!terms.length) return null;
  const deal = { type: 'h', terms, text: text ? String(text).replace(/[\u0000-\u001f]/g, ' ').slice(0, 300) : '' };
  const msg = M('of.h', { a: A, x: { list: terms.map(hTermMsg) } });
  withSeat(S, B, () => { const o = mkOffer(S, A, deal, msg); o.expires = S.turn + 3; S.inbox = S.inbox.filter(z => !(z.from === A && z.deal.type === 'h' && JSON.stringify(z.deal.terms) === JSON.stringify(terms))); S.inbox.push(o); if (S.inbox.filter(z => z.from === A).length > 6) S.inbox.splice(S.inbox.findIndex(z => z.from === A), 1); });
  if (R) { R.actions.push({ msg: M('mp.h_sent', { t: B, x: { list: terms.map(hTermMsg) } }), tone: 'info' }); RP(S, B, R).toYou.push({ actor: A, msg, tone: 'good' }); }
  logEvent(S, 'hprop', M('mp.h_log', { a: A, b: B }), 'info', [A, B]); // 只记在双方各自的日志里（联网时不进公开快照）
  return terms;
}
function hNote(S, H, msg, tone) { const sb = seatOf(S, H); if (sb) sb.carry.push({ msg, tone: tone || 'info' }); }
function answerH(S, o, accept) {
  const P = S.player, X = o.from, d = o.deal;
  if (!accept) {
    addRel(S, P, X, -2);
    const msg = M('mp.h_rej', { a: P, x: { list: d.terms.map(hTermMsg) } });
    hNote(S, X, msg, 'bad'); logEvent(S, 'offer', msg, 'info', [X, P]);
    return M('of.rejected', { a: X, x: M('mp.h_short') });
  }
  const done = applyHDeal(S, X, P, d.terms);
  const msg = M('mp.h_acc', { a: P, x: { list: done } });
  hNote(S, X, msg, 'good'); logEvent(S, 'deal', M('dl.log', { a: X, x: { list: done } }), 'good', [P, X]);
  return M('of.accepted', { a: X, x: { list: done } });
}
/* 双方都是真人：条款逐项执行（A 为提议方，B 为接受方） */
function applyHDeal(S, A, B, terms) {
  const done = [], R = scratchReport(S), other = z => (z === A ? B : A);
  const commit = (H, type, X, turns, src, extra) => withSeat(S, H, () => addCommit(S, type, X, turns, src, extra));
  for (const t of cleanHTerms(S, A, B, terms)) {
    const by = t.by, ob = by ? other(by) : null;
    try {
      switch (t.type) {
        case 'alliance': case 'trade': case 'nap': case 'access': case 'partner': case 'armsctl': {
          if (atWar(S, A, B)) { done.push(M('dl.void', { x: M('dk.' + t.type), r: M('dl.atwar') })); break; }
          const w3 = RULES3 && ['alliance', 'partner', 'access'].includes(t.type) ? dealClash3(S, A, B, t) || dealClash3(S, B, A, t) : null; // 规则 v3：一方已和另一方的交战国结盟
          if (w3) { done.push(M('dl.void', { x: M('dk.' + t.type), r: w3 })); break; }
          addTreaty(S, t.type, A, B);
          if (t.type === 'alliance') { commit(A, 'defend', B, null, 'alliance'); commit(B, 'defend', A, null, 'alliance'); }
          if (t.type === 'nap') { commit(A, 'no_attack', B, null, 'nap'); commit(B, 'no_attack', A, null, 'nap'); }
          if (t.type === 'armsctl') { commit(A, 'armsctl', B, null, 'armsctl', { cap: S.actors[A].milPct + 1 }); commit(B, 'armsctl', A, null, 'armsctl', { cap: S.actors[B].milPct + 1 }); }
          addRel(S, A, B, 8); done.push(M('dl.treaty', { k: M('tr.' + t.type) })); break; }
        case 'ceasefire': case 'peace': if (!atWar(S, A, B)) { done.push(M('dl.void', { x: M('dk.' + t.type), r: M('dl.notwar') })); break; } makePeace(S, A, B, t.type === 'ceasefire' ? 'ceasefire' : 'white', R); done.push(M(t.type === 'ceasefire' ? 'dl.ceasefire' : 'dl.peace')); break;
        case 'aid': S.actors[by].treasury -= t.amount; S.actors[ob].treasury += t.amount; addInfl(S, by, ob, clamp(t.amount / S.actors[ob].gdp * 300, 1, 15)); done.push(M('hd.aid', { b: by, m: $m(t.amount) })); break;
        case 'arms': S.actors[by].treasury -= t.amount; armsTransfer(S, by, ob, t.amount); done.push(M('hd.arms', { b: by, m: $m(t.amount) })); break;
        case 'join_war': { const E = boss(S, t.enemy); if (E === by || E === ob || atWar(S, by, E) || !indep(S, E)) break; if (RULES3 && aligned(S, by, E)) { done.push(M('dl.void', { x: M('dk.join_war'), r: M('dl.war_ally', { t: by, b: E }) })); break; } /* 规则 v3：不会对自己的盟友开战 */ declareWar(S, by, E); logEvent(S, 'war', M('m.war', { a: by, b: E }), 'warn', [by, E]); pushEv(S, { type: 'declare', actor: by, target: E, sev: 50, third: 15, big: true }); done.push(M('dl.join', { t: by, b: E })); break; }
        case 'tech_share': S.actors[A].tech = clamp(S.actors[A].tech + 0.8, 0, 100); S.actors[B].tech = clamp(S.actors[B].tech + 0.8, 0, 100); done.push(M('dl.tech')); break;
        case 'lift_sanctions': removeSanctions(S, by, ob); done.push(M('hd.lift_sanctions', { b: by })); break;
        case 'withdraw': { const L = t.loc; if (share(S, by, L) <= 0) break; S.fronts = S.fronts.filter(f => !(f.att === by && f.from === L)); S.ops = S.ops.filter(o => !(o.owner === by && o.from === L)); orderMove(S, by, L, by, shareV(S, by, L).slice()); done.push(M('dl.withdraw', { l: L })); break; }
        case 'vassal': if (indep(S, by) && !S.actors[by].overlord) { if (atWar(S, A, B)) makePeace(S, A, B, 'white', R); makeVassal(S, by, ob); done.push(M('dl.vassal', { t: by })); } break;
        case 'send_troops': { const r = withSeat(S, ob, () => sendTroops(S, by, t.dest || dealDest(S, {}), TROOP_SIZE[t.size || 0], R, true)); if (r) done.push(r); break; }
        case 'mobilize': { const y = S.actors[by]; if (t.level > y.mob) { y.mob = t.level; done.push(M('rq.mob_ok', { a: by, k: M('mob.' + y.mob), n: +y.milPct.toFixed(1) })); } break; }
      }
    } catch (e) { if (typeof console !== 'undefined') console.error('hdeal', t, e); }
  }
  const seen = new Set(), uniq = []; for (const k of ['actions', 'toYou', 'world', 'mil', 'pol', 'intel', 'events']) for (const m of R[k]) { const j = JSON.stringify(m.msg); if (!seen.has(j)) { seen.add(j); uniq.push(m); } } // 双方都是真人时同一消息只记一次
  for (const H of [A, B]) { const sb = seatOf(S, H); if (sb) for (const m of uniq) sb.carry.push(m); }
  addRel(S, A, B, 4);
  return done;
}

/* ---------- 即时命令（联机时客户端发给房主执行；单机直接执行） ----------
 * 只允许白名单里的操作，全部在发令者的席位中执行，参数逐项清洗。 */
const sid = v => String(v ?? '').slice(0, 40);
function setMil(S, pct) { const x = S.actors[S.player]; const v = +clamp(+pct || x.milPct, 0.5, Math.max(playerMilMax(), weMilCap(S, S.player))).toFixed(1); x.milPct = v; return v; }
/* 规则 v2：一份协议花 1 行动点，含同盟或臣服条款花 2 点。
 * 规则 v3（要传 S）：6% + 每多一项条款 2%，含同盟或臣服再加 8%，我方出的援助、军援按金额另算（同一行动力公式），再乘本国系数 */
function dealAP(terms, S) {
  const L = (Array.isArray(terms) ? terms : []).filter(t => t && typeof t === 'object'), big = L.some(t => t.type === 'alliance' || t.type === 'vassal');
  if (RULES3 && S && S.actors[S.player]) {
    const g = S.actors[S.player].gdp; let money = 0;
    for (const t of L) if (t.type === 'aid' || t.type === 'arms') money += clamp(+t.amount || g * 0.002, 0, g * 0.02);
    return pctOf(S, 6 + 2 * Math.max(0, L.length - 1) + (big ? 8 : 0) + moneyPct(S, S.player, money));
  }
  return RULES2 && big ? 2 : 1;
}
/* 规则 v2：调整动员等级即时生效——提高花 1 行动点，降低免费 */
/* 动员等级 0–5：0 平时、1 部分动员、2 全面动员、3–5 总体战（战时政策里的“总体战动员”一到三级并入这里） */
const mobIdx = x => (!x ? 0 : x.mob < 3 ? x.mob | 0 : 2 + Math.max(1, weLv(x, 'total')));
function setMob(S, lv) {
  const P = S.player, x = S.actors[P]; lv = clamp(lv | 0, 0, 5);
  if (!RULES2 || !x || !indep(S, P)) return null;
  const cur = mobIdx(x); if (lv === cur) return null;
  if (lv > cur) { const need = mobAP(S, cur, lv); if (apLeft(S) < need) return null; S.apUsed = (S.apUsed || 0) + need; } // 规则 v3：每提高一级 6%（乘本国系数）
  const was = x.mob, tot = Math.max(0, lv - 2);
  x.mob = Math.min(3, lv); S.queue = S.queue.filter(q => q.type !== 'mobilize');
  if (weLv(x, 'total') !== tot) { const we = weInit(x); we.p.total = tot; if (!tot) { const cap = Math.max(playerMilMax(), weMilCap(S, P)); if (x.milPct > cap) x.milPct = cap; } }
  logEvent(S, 'mob', M('m.mob_set', { a: P, k: M('mob6.' + lv) }), lv >= 2 ? 'warn' : 'info', [P]);
  if (lv > cur && x.mob >= 2 && (was < 2 || lv >= 4)) { pushEv(S, { type: 'mobilize', actor: P, target: null, sev: lv >= 4 ? 20 : 15, third: 8 }); facAdd(S, { mil: 3, pub: -2 }); }
  return lv;
}
function setMix(S, mix, mode) { const x = S.actors[S.player]; let a = (Array.isArray(mix) ? mix : []).slice(0, 3).map(v => clamp(+v || 0, 0, 1)); const t = a.reduce((s, v) => s + v, 0); if (a.length !== 3 || !(t > 0)) return false; a = a.map(v => Math.max(0.05, v / t)); const t2 = a[0] + a[1] + a[2]; x.mix = a.map(v => +(v / t2).toFixed(3)); x.mixMode = ['bal', 'land', 'navy', 'air', 'custom'].includes(mode) ? mode : 'custom'; return true; }
const CMD = {
  answerOffer: (S, a) => answerOffer(S, sid(a[0]), !!a[1]),
  unacceptOffer: (S, a) => unacceptOffer(S, sid(a[0])), // 规则 v3：撤回对来函的接受（回合结束前）
  answerUltimatum: (S, a) => answerUltimatum(S, sid(a[0]), a[1] === 'accept' ? 'accept' : 'reject'),
  answerCrisis: (S, a) => answerCrisis(S, sid(a[0]), typeof a[1] === 'number' ? clamp(a[1] | 0, 0, 5) : (a[1] && Array.isArray(a[1].effects) ? { effects: a[1].effects.slice(0, 10), summary: String(a[1].summary || '').slice(0, 60) } : 0)),
  cancelOp: (S, a) => cancelOp(S, sid(a[0])),
  haltFront: (S, a) => haltFront(S, sid(a[0])),
  setFrontV: (S, a) => setFrontV(S, sid(a[0]), clamp(a[1] | 0, 0, 2), +a[2] || 0),
  setFrontFocus: (S, a) => setFrontFocus(S, sid(a[0]), a[1] == null || a[1] === '' ? null : +a[1]),
  setOpFocus: (S, a) => setOpFocus(S, sid(a[0]), a[1] == null || a[1] === '' ? null : +a[1]),
  setHold: (S, a) => setHold(S, sid(a[0]).toUpperCase(), a[1] == null || a[1] === '' ? null : +a[1]),
  cancelProgram: (S, a) => cancelProgram(S, sid(a[0])),
  coreBackDown: (S, a) => coreBackDown(S, sid(a[0])),
  applyDeal: (S, a) => { const X = sid(a[0]).toUpperCase(); if (RULES3 || !S.actors[X] || isHuman(S, X) || !indep(S, X)) return null; /* 规则 v3：和 AI 国家的协议排进队列，回合结束统一生效（见 queueDeal） */ const terms = Array.isArray(a[1]) ? a[1].slice(0, 6) : [], need = dealAP(terms, S); if (apLeft(S) < need) return null; S.apUsed = (S.apUsed || 0) + need; return applyDeal(S, X, terms); },
  setMob: (S, a) => setMob(S, a[0]),
  proposeH: (S, a) => proposeH(S, S.player, sid(a[0]).toUpperCase(), a[1], null, a[2]),
  setMil: (S, a) => setMil(S, a[0]),
  setMix: (S, a) => setMix(S, a[0], a[1]),
  patch: (S, a) => applyPatch(S, a[0]),
  we: (S, a) => setWe(S, S.player, sid(a[0]), a[1] | 0),
  weAct: (S, a) => weAction(S, S.player, sid(a[0]), sid(a[1])),
  // 精细战区（联机版 1939 开局）：部队命令、空军、参谋代管、死守、炸桥、统一战线、中国战场政策、本季度不再暂停
  thOrder: (S, a) => thOrderUnits(S, sid(a[0]), Array.isArray(a[1]) ? a[1].slice(0, 200).map(Number) : [], a[2] && typeof a[2] === 'object' ? { k: sid(a[2].k), to: a[2].to == null ? null : typeof a[2].to === 'string' ? sid(a[2].to) : +a[2].to, via: a[2].via == null ? null : Array.isArray(a[2].via) ? a[2].via.slice(0, 12).map(Number) : typeof a[2].via === 'string' ? sid(a[2].via) : +a[2].via, hd: a[2].hd == null ? null : !!a[2].hd, fol: a[2].fol == null ? null : a[2].fol ? 1 : 0, md: a[2].md === 'f' ? 'f' : 's' } : { k: 'hold' }),
  thAir: (S, a) => thSetAir(S, sid(a[0]), a[1] && typeof a[1] === 'object' ? a[1] : {}),
  thStaff: (S, a) => thSetStaff(S, sid(a[0]), !!a[1]),
  thHold: (S, a) => thSetHold(S, sid(a[0]), Array.isArray(a[1]) ? a[1].slice(0, 200).map(Number) : [], !!a[2]),
  thBlow: (S, a) => thDemolish(S, sid(a[0]), a[1] | 0, a[2] | 0),
  thUf: (S, a) => thUfAct(S, sid(a[0]), typeof a[1] === 'number' || typeof a[1] === 'boolean' ? a[1] : null),
  thPol: (S, a) => thCnPolicy(S, sid(a[0]), !!a[1]),
  thSkip: (S, a) => thSetSkip(S, !!a[0]),
  thOp: (S, a) => thOpStart(S, sid(a[0]), Array.isArray(a[1]) ? a[1].slice(0, 200).map(Number) : [], a[2] && typeof a[2] === 'object' ? { to: +a[2].to, p: Array.isArray(a[2].p) ? a[2].p.slice(0, 30).map(Number) : [], k: sid(a[2].k), st: sid(a[2].st), lab: Array.isArray(a[2].lab) ? a[2].lab.slice(0, 3).map(Number) : [], fol: a[2].fol ? 1 : 0, md: a[2].md === 'f' ? 'f' : 's' } : null), // 按参谋方案发动作战
};
function execCmd(S, seat, op, args) {
  if (!isHuman(S, seat) || !Object.prototype.hasOwnProperty.call(CMD, op)) return { ok: false, err: 'bad_cmd' };
  return withSeat(S, seat, () => { try { return { ok: true, r: CMD[op](S, Array.isArray(args) ? args : []) }; } catch (e) { if (typeof console !== 'undefined') console.error('cmd', op, e); return { ok: false, err: String((e && e.message) || e) }; } });
}
