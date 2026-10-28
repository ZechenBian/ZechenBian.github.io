// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 行动库（玩家与 AI 通用） ===================== */
const TIERS = [0.05, 0.2, 0.6];
const pctG = (S, me, p) => S.actors[me].gdp * p / 100;
/* 规则 v2：金额可以自己填（p.amt，十亿美元）。援助、贷款、军援直接按所填金额（GDP 的 0.01%–2%）；国内投入按默认额度的 ¼–4 倍，效果按 (金额/默认)^0.6 增减 */
const AMT_MAX = 2;
const amtOf = (S, me, p) => (RULES2 && p && +p.amt > 0 ? clamp(+p.amt, pctG(S, me, 0.01), pctG(S, me, AMT_MAX)) : null);
const tierCost = (S, me, p) => amtOf(S, me, p) ?? pctG(S, me, TIERS[p.tier ?? 1] ?? TIERS[1]);
// 行动的 cost 以 (S, me, t, p) 调用：旧规则下第三个参数其实是目标，档位总按中档扣钱（单人版保持原样）；规则 v2 按所选档位或所填金额扣钱
const tierCostA = (S, me, t, p) => (RULES2 ? tierCost(S, me, p || {}) : tierCost(S, me, t));
function invK(S, me, p, defPct) { const d = pctG(S, me, defPct), a = RULES2 && p && +p.amt > 0 ? clamp(+p.amt, d * 0.25, d * 4) : d; return { cost: a, k: a === d ? 1 : Math.pow(a / d, 0.6) }; }
const TREATY_TYPES = ['alliance', 'partner', 'nap', 'trade', 'access', 'armsctl'];
const intelOf = (S, id) => S.actors[id].intel ?? DEF[id].intel ?? 40;
const covF = (S, me, t) => clamp(1.25 - intelOf(S, t) / 100 + intelOf(S, me) / 250, 0.3, 1.2);
function detectP(S, observer, actor, base) { return clamp(base + (intelOf(S, observer) - intelOf(S, actor)) / 250, 0.05, 0.9); }
function guard(S, me, t) { if (t === me) return M('c.self'); if (!t || !S.actors[t]) return M('c.notarget'); if (!indep(S, t)) return M('c.notindep', { t }); if (S.actors[t].overlord === me) return M('c.myvassal', { t }); return null; }
function chanceMsg(score) { const p = sig(score * 4); const w = p > 0.8 ? 0 : p > 0.55 ? 1 : p > 0.35 ? 2 : p > 0.15 ? 3 : 4; return M('pv.chance', { x: M('pv.w' + w), s: { pct: p } }); }

/* ---------- 对方是否同意 ---------- */
function commonEnemy(S, a, b) { let s = 0; for (const c of IDS) { if (c === a || c === b || !indep(S, c)) continue; if (rel(S, a, c) < -40 && rel(S, b, c) < -40) s += Math.min(1, power(S, c) / 2000) * 0.5; } return Math.min(1, s); }
function powerRatio(S, a, b) { return (blocPower(S, a) + 1) / (blocPower(S, b) + 1); }
function allyHelp(S, id, against) { let s = 0; for (const c of IDS) { if (c === id || c === against || !indep(S, c)) continue; if (isAlly(S, c, id)) s += power(S, c) * 0.35 * S.actors[c].loyal; else if (isPartner(S, c, id)) s += power(S, c) * 0.12 * S.actors[c].loyal; } return s; }
function evalDeal(S, from, to, term) {
  const x = S.actors[to], r = rel(S, from, to) / 100, inf = infl(S, from, to) / 100, why = [];
  let sc = 0; const ratio = powerRatio(S, from, to);
  const sbF = isHuman(S, from) ? seatOf(S, from) : null, trust = sbF ? (sbF.rep.trust - 50) / 150 : 0;
  switch (term.type) {
    case 'trade': sc = 0.15 + r * 0.8 + exposure(S, to, from) * 2 + inf * 0.3 + trust - (sanctionLevel(S, from, to) + sanctionLevel(S, to, from)) * 0.25; if (atWar(S, from, to)) sc -= 2; break;
    case 'alliance': {
      sc = -0.55 + r * 1.1 + commonEnemy(S, from, to) * 0.9 + inf * 0.3 + trust;
      if (enemies(S, from).length) sc -= 0.25 * (1 - x.risk);
      for (const c of IDS) if (c !== to && c !== from && isAlly(S, to, c) && rel(S, from, c) < -40) { sc -= 0.35; why.push(M('why.ally_rival', { b: c })); break; }
      if (ratio > 1.5) sc += 0.1;
      if (sbF && sbF.rep.aggr > 60) { sc -= 0.2; why.push(M('why.aggr')); }
      break;
    }
    case 'nap': sc = 0.05 + r * 0.6 + (ratio > 1.2 ? 0.2 : 0) + inf * 0.2 + trust; if (atWar(S, from, to)) sc -= 1; break;
    case 'armsctl': sc = -0.1 + r * 0.5 + (x.econ - 0.5) * 0.6 - x.hawk * 0.3 + trust + (((sbF || S).threat[to] || 0) / 200); if (atWar(S, from, to)) sc -= 1; break;
    case 'access': sc = -0.35 + r * 0.9 + (isAlly(S, from, to) ? 0.35 : 0) + inf * 0.5 + (x.flags.debtTo === from ? 0.3 : 0) + trust; break;
    case 'partner': sc = -0.2 + r * 0.9 + inf * 0.3 + commonEnemy(S, from, to) * 0.4 + trust; break;
    case 'vassal': {
      const help = allyHelp(S, to, from);
      const eff = (blocPower(S, from) + 1) / (blocPower(S, to) + help + 1);
      sc = -1.3 + Math.log(Math.max(eff, 0.01)) * 0.45 + inf * 0.9 + r * 0.3 + (x.stab < 30 ? 0.3 : 0) + (x.flags.debtTo === from ? 0.25 : 0);
      if (x.nukes > 0) { sc -= 0.8; why.push(M('why.nukes')); }
      const f = S.fronts.find(fr => fr.att === from && fr.target === to); if (f) sc += Math.max(0, f.progress) / 100 * 1.1;
      if (eff < 3) why.push(M('why.gap')); if (help > power(S, from) * 0.4) why.push(M('why.protected'));
      if (S.guard && GRD(S, to)) { sc = -9; why.push(M('why.guard', { t: to })); } // 保底：绝不屈服
      else if (RULES2 && !fallen(S, from, to)) { sc = -9; why.push(M('why.fallen', { t: to, n: FALLEN })); } // 规则 v2：对方还没有沦陷
      break;
    }
    case 'peace': case 'ceasefire': {
      const fAg = S.fronts.filter(f => f.att === from && boss(S, f.target) === to), fMe = S.fronts.filter(f => f.att === to && boss(S, f.target) === from);
      const losing = fAg.reduce((m, f) => Math.max(m, f.progress), 0) / 100, winning = fMe.reduce((m, f) => Math.max(m, f.progress), 0) / 100;
      sc = (term.type === 'ceasefire' ? 0.1 : -0.05) + losing * 0.9 - winning * 0.9 + (x.stab < 35 ? 0.35 : 0) - x.hawk * 0.35 + (1 - x.risk) * 0.15 + r * 0.2;
      if (term.terms === 'vassal') sc = evalDeal(S, from, to, { type: 'vassal' }).score + losing * 0.5;
      if (term.terms === 'reparations') sc -= 0.25;
      break;
    }
    case 'join_war': { const en = term.enemy; sc = -0.5 + r * 0.8 + (-rel(S, to, en) / 100) * 0.9 + x.hawk * 0.3 - (power(S, en) / (power(S, to) + 1) > 1.5 ? 0.4 : 0) + inf * 0.3; break; }
    default: sc = r * 0.5 - 0.2;
  }
  if (x.fear[from] && x.fear[from] > S.turn) sc += 0.15;
  return { score: sc, why };
}
/* 规则 v2：对方本土全被你（或盟友）占领，或者你（或盟友）对它本土的攻势推进到 80% 以上，才算“沦陷”，才能要求它臣服 */
const FALLEN = 80;
function fallen(S, A, T) {
  const t = S.actors[T]; if (!t || !S.actors[A]) return false;
  const side = c => c === A || isAlly(S, A, c);
  if (t.ctrl !== T && side(t.ctrl)) return true;
  return S.fronts.some(f => f.target === T && (side(f.att) || (f.co || []).some(k => side(k.id))) && f.progress >= FALLEN);
}
function decide(S, from, to, term, noise = 0.25) { const e = evalDeal(S, from, to, term); return Object.assign({ ok: e.score + rn(S) * noise > 0 }, e); }
function makeVassal(S, v, lord) {
  if (NEU(S, v) || NEU(S, lord) || GRD(S, v)) return; // 保底国家不会沦为附庸
  const x = S.actors[v]; x.overlord = lord; x.vassalSince = S.turn;
  for (const b of Object.values(S.blocs)) if (b.members.includes(v) && !b.members.includes(lord)) b.members = b.members.filter(m => m !== v);
  S.treaties = S.treaties.filter(t => !(t.type === 'alliance' && (t.a === v || t.b === v) && rel(S, lord, t.a === v ? t.b : t.a) < 0));
  setRel(S, v, lord, Math.max(rel(S, v, lord), 45));
  for (const e of enemies(S, v)) if (!atWar(S, lord, e)) makePeace(S, v, e, 'white');
}
function applyPeace(S, a, b, terms, C) {
  if (terms === 'vassal') { makePeace(S, a, b, 'white'); makeVassal(S, b, a); C.out(M('r.peace.vassal', { a, t: b }), 'good', [b]); }
  else if (terms === 'reparations') { const pay = S.actors[b].gdp * 0.05; S.actors[b].treasury -= pay; S.actors[a].treasury += pay; makePeace(S, a, b, 'white'); C.out(M('r.peace.rep', { a, t: b, m: $m(pay) }), 'good', [b]); }
  else { makePeace(S, a, b, terms === 'ceasefire' ? 'ceasefire' : 'white'); C.out(M(terms === 'ceasefire' ? 'r.peace.cf' : 'r.peace.ok', { a, t: b }), 'good', [b]); }
  pushEv(S, { type: 'peace', actor: a, target: b, sev: -15 });
}
function coupChance(S, me, t) { const x = S.actors[t]; let p = ((infl(S, me, t) - 30) / 70) * (1.1 - x.stab / 100) * 1.25; if (x.nukes > 0 || power(S, t) > 1200) p *= 0.3; if (DEF[t].gov === 'dem') p *= 0.7; return clamp(p, 0.03, 0.75); }
function armsPts(S, from, to, money) { const y = S.actors[to]; const pts = money * DEF[from].ppp * 0.9; const K = 0.3 * (y.land + y.navy + y.air) + 8; return K * (1 - Math.exp(-pts / K)); }
function armsTransfer(S, from, to, money) { const y = S.actors[to]; const e = armsPts(S, from, to, money); y.land += e * y.mix[0]; y.navy += e * y.mix[1]; y.air += e * y.mix[2]; return e; }
function sendVolunteers(S, me, t, amt) { const x = S.actors[me], y = S.actors[t]; const moved = x.land * amt; x.land -= moved; y.land += moved * DEF[me].ppp / DEF[t].ppp * 0.9; return moved; }

/* ---------- 行动定义 ---------- */
function reqCheck(S, me, t) { if (t === me) return M('c.self'); if (!t || !S.actors[t] || !indep(S, t)) return M('c.notindep', { t }); if (atWar(S, me, t)) return M('c.atwar', { t }); if (!(isAlly(S, me, t) || isPartner(S, me, t) || S.actors[t].overlord === me || rel(S, me, t) >= 45)) return M('c.notfriend', { t }); if ((S.actors[t].flags['rq_' + me] ?? -99) > S.turn - 3) return M('c.asked', { t }); return null; }
function mobScore(S, me, t) { const y = S.actors[t]; return -0.15 + y.loyal * 0.45 + rel(S, t, me) / 220 + (isAlly(S, t, me) ? 0.25 : 0) + (y.overlord === me ? 0.4 : 0) + Math.min(0.35, threatTo(S, t).t * 0.2) + Math.max(0, (S.threat[t] || 0) - 50) / -300 - (DEF[t].gov === 'dem' ? 0.08 : 0) - (y.mob >= 1 ? 0.1 : 0); }
const ACTIONS = [
 // 外交
 { id: 'summit', cat: 'dip', ap: 1, cost: (S, me) => Math.max(0.3, pctG(S, me, 0.003)),
   check: (S, me, t) => (t === me ? M('c.self') : !indep(S, t) ? M('c.notindep', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: () => M('pv.summit'),
   exec(S, me, t, p, C) { const r0 = rel(S, me, t); let g = between(S, 7, 15); if (r0 > 60) g *= clamp(1 - (r0 - 60) / 60, 0.25, 1); if (r0 < -60) g *= 0.6; addRel(S, me, t, g); addInfl(S, me, t, between(S, 2, 4)); C.out(M('r.summit', { a: me, t, d: Math.round(g) }), 'good', [t]); pushEv(S, { type: 'summit', actor: me, target: t, sev: -8 }); } },
 { id: 'trade', cat: 'dip', ap: 1, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (hasTreaty(S, me, t, 'trade') ? M('c.hastreaty', { k: M('tr.trade') }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t) => chanceMsg(evalDeal(S, me, t, { type: 'trade' }).score),
   exec(S, me, t, p, C) { const d = decide(S, me, t, { type: 'trade' }); if (d.ok) { addTreaty(S, 'trade', me, t); addRel(S, me, t, 5); if (me === S.player) S.pol.tradeUp++; C.out(M('r.trade.ok', { a: me, t }), 'good', [t], { notable: true }); pushEv(S, { type: 'trade', actor: me, target: t, sev: -10 }); } else { addRel(S, me, t, -2); C.out(M('r.trade.no', { a: me, t, x: d.why[0] }), 'bad', [t]); } } },
 { id: 'alliance', cat: 'dip', ap: 2, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (isAlly(S, me, t) ? M('c.isally', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t) => chanceMsg(evalDeal(S, me, t, { type: 'alliance' }).score),
   exec(S, me, t, p, C) { const w3 = alignBlock3(S, me, t); if (w3) { C.out(M('r.align3.no', { a: me, t, x: w3 }), 'bad', [t]); return; } const d = decide(S, me, t, { type: 'alliance' }); if (d.ok) { addTreaty(S, 'alliance', me, t); addRel(S, me, t, 10); if (me === S.player) addCommit(S, 'defend', t, null, 'alliance'); C.out(M('r.alliance.ok', { a: me, t }), 'good', [t], { notable: true }); pushEv(S, { type: 'alliance', actor: me, target: t, sev: -15, third: 22 }); } else C.out(M('r.alliance.no', { a: me, t, x: d.why[0] }), 'bad', [t]); } },
 { id: 'nap', cat: 'dip', ap: 1, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (hasTreaty(S, me, t, 'nap') ? M('c.hastreaty', { k: M('tr.nap') }) : atWar(S, me, t) ? M('c.atwar_peace', { t }) : null),
   preview: (S, me, t) => chanceMsg(evalDeal(S, me, t, { type: 'nap' }).score),
   exec(S, me, t, p, C) { const d = decide(S, me, t, { type: 'nap' }); if (d.ok) { addTreaty(S, 'nap', me, t); addRel(S, me, t, 6); if (me === S.player) addCommit(S, 'no_attack', t, null, 'nap'); C.out(M('r.nap.ok', { a: me, t }), 'good', [t]); } else C.out(M('r.nap.no', { a: me, t }), 'bad', [t]); } },
 { id: 'access', cat: 'dip', ap: 1, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (noBase(S, me, t) ? M('dl.nobase', { t: NBH(S, t) }) : hasTreaty(S, me, t, 'access') || canStation(S, me, t) ? M('c.hasaccess', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t) => chanceMsg(evalDeal(S, me, t, { type: 'access' }).score),
   exec(S, me, t, p, C) { const w3 = alignBlock3(S, me, t); if (w3) { C.out(M('r.align3.no', { a: me, t, x: w3 }), 'bad', [t]); return; } const d = decide(S, me, t, { type: 'access' }); if (d.ok) { addTreaty(S, 'access', me, t); C.out(M('r.access.ok', { a: me, t }), 'good', [t]); pushEv(S, { type: 'access', actor: me, target: t, sev: -5, third: 12 }); } else { addRel(S, me, t, -3); C.out(M('r.access.no', { a: me, t }), 'bad', [t]); } } },
 { id: 'armsctl', cat: 'dip', ap: 1, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (hasTreaty(S, me, t, 'armsctl') ? M('c.hastreaty', { k: M('tr.armsctl') }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t) => M('pv.armsctl', { x: chanceMsg(evalDeal(S, me, t, { type: 'armsctl' }).score), n: +(S.actors[me].milPct + 1).toFixed(1) }),
   exec(S, me, t, p, C) { const d = decide(S, me, t, { type: 'armsctl' }); if (d.ok) { addTreaty(S, 'armsctl', me, t); addRel(S, me, t, 6); if (me === S.player) { addCommit(S, 'armsctl', t, null, 'armsctl', { cap: S.actors[me].milPct + 1 }); S.threat[t] = Math.max(0, (S.threat[t] || 0) - 15); repAdd(S, { trust: 3 }); } C.out(M('r.armsctl.ok', { a: me, t }), 'good', [t], { notable: true }); pushEv(S, { type: 'armsctl', actor: me, target: t, sev: -12 }); } else C.out(M('r.armsctl.no', { a: me, t }), 'bad', [t]); } },
 { id: 'condemn', cat: 'dip', ap: 1, hostile: true, cost: () => 0,
   check: (S, me, t) => (t === me ? M('c.self') : null), preview: () => M('pv.condemn'),
   exec(S, me, t, p, C) { addRel(S, me, t, -10); for (const c of IDS) if (c !== me && c !== t && rel(S, c, t) < -40) addRel(S, me, c, 2); C.out(M('r.condemn', { a: me, t }), 'info', [t]); pushEv(S, { type: 'condemn', actor: me, target: t, sev: 8 }); } },
 { id: 'warn', cat: 'dip', ap: 1, hostile: true, cost: () => 0,
   params: [{ key: 'about', dyn: 'protege' }, { key: 'conseq', options: ['war', 'sanction'] }],
   check: (S, me, t, p) => guard(S, me, t) || (!p.about || !S.actors[p.about] ? M('c.pickabout') : p.about === t || p.about === me ? M('c.badabout') : S.warnings.some(w => w.by === me && w.to === t && w.about === p.about) ? M('c.warned') : null),
   preview: (S, me, t, p) => M('pv.warn', { s: { pct: clamp((me === S.player ? S.rep.cred : (S.actors[me].cred ?? 60)) / 100 * clamp(powerRatio(S, me, t), 0.3, 1.5), 0.05, 0.95) } }),
   exec(S, me, t, p, C) { const about = p.about, conseq = p.conseq || 'war'; S.warnings.push({ by: me, to: t, about, conseq, until: S.turn + 8, since: S.turn }); addRel(S, me, t, -8); addRel(S, me, about, 6); C.out(M('r.warn', { a: me, t, b: about, k: M('wc.' + conseq) }), 'info', [t, about], { notable: true }); pushEv(S, { type: 'warn', actor: me, target: t, sev: 12, about }); } },
 { id: 'vassal', cat: 'dip', ap: 2, hostile: true, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (S.actors[t].overlord ? M('c.alreadyvassal', { t, b: S.actors[t].overlord }) : RULES2 && !fallen(S, me, t) ? M('c.fallen', { t, n: FALLEN }) : powerRatio(S, me, t) < 1.5 ? M('c.weak15') : null),
   preview: (S, me, t) => M('pv.vassal', { x: chanceMsg(evalDeal(S, me, t, { type: 'vassal' }).score) }),
   exec(S, me, t, p, C) { const d = decide(S, me, t, { type: 'vassal' }, 0.2); if (d.ok) { makeVassal(S, t, me); C.out(M('r.vassal.ok', { a: me, t }), 'good', [t], { notable: true, big: true }); pushEv(S, { type: 'vassal', actor: me, target: t, sev: 30, third: 25 }); } else { addRel(S, me, t, -25); S.actors[t].hawk = clamp(S.actors[t].hawk + 0.05, 0, 1); C.out(M('r.vassal.no', { a: me, t, x: d.why.length ? { list: d.why } : '' }), 'bad', [t]); pushEv(S, { type: 'demand', actor: me, target: t, sev: 30 }); } } },
 { id: 'peace', cat: 'dip', ap: 1, cost: () => 0, params: [{ key: 'terms', options: ['ceasefire', 'white', 'reparations', 'vassal'] }],
   check: (S, me, t) => (!atWar(S, me, t) ? M('c.notwar', { t }) : null),
   preview: (S, me, t, p) => chanceMsg(evalDeal(S, me, t, { type: p.terms === 'ceasefire' ? 'ceasefire' : 'peace', terms: p.terms }).score),
   exec(S, me, t, p, C) { const terms = p.terms || 'white'; const d = decide(S, me, t, { type: terms === 'ceasefire' ? 'ceasefire' : 'peace', terms }); if (d.ok) applyPeace(S, me, t, terms, C); else C.out(M('r.peace.no', { a: me, t }), 'bad', [t]); } },
 { id: 'integrate', cat: 'dip', ap: 2, cost: (S, me, t) => S.actors[t].gdp * 0.01,
   check: (S, me, t) => (S.actors[t].overlord !== me ? M('c.notvassal', { t }) : S.turn - (S.actors[t].vassalSince ?? S.turn) < 6 ? M('c.wait', { n: 6 - (S.turn - S.actors[t].vassalSince) }) : infl(S, me, t) < 60 ? M('c.infl', { n: 60 }) : null),
   preview: (S, me, t) => M('pv.succ', { s: { pct: clamp(0.55 + infl(S, me, t) / 250 + S.actors[t].stab / 400, 0, 0.95) } }),
   exec(S, me, t, p, C) { const x = S.actors[t]; if (chance(S, clamp(0.55 + infl(S, me, t) / 250 + x.stab / 400, 0, 0.95))) { const mine = S.actors[me]; mine.land += x.land * 0.5; mine.navy += x.navy * 0.5; mine.air += x.air * 0.5; mine.pers = (mine.pers || 0) + (x.pers || 0) * 0.5; x.land = x.navy = x.air = 0; x.pers = 0; x.ctrl = me; x.overlord = null; x.integrated = true; x.resist = 8; x.forces = {}; x.moves = []; resetExposure(S); C.out(M('r.integrate.ok', { a: me, t }), 'good', [t], { big: true }); pushEv(S, { type: 'annex', actor: me, target: t, sev: 25, third: 20 }); } else { x.stab -= 10; addRel(S, me, t, -10); C.out(M('r.integrate.no', { t }), 'bad', [t]); } } },
 { id: 'release', cat: 'dip', ap: 1, cost: () => 0,
   check: (S, me, t) => (S.actors[t].overlord === me || (RULES2 && t !== me && S.actors[t].ctrl === me) ? null : M('c.notvassal', { t })), preview: (S, me, t) => (S.actors[t].overlord === me ? M('pv.release') : M('pv.release_occ')),
   exec(S, me, t, p, C) {
     if (S.actors[t].overlord === me || !RULES2) { S.actors[t].overlord = null; addRel(S, me, t, 10); C.out(M('r.release', { a: me, t }), 'info', [t]); return; }
     const x = S.actors[t]; x.ctrl = t; x.overlord = null; x.integrated = false; x.resist = 0; x.occSince = null; x.stab = 40; x.part = null; rebuildArmy(S, t, 0.15); resetExposure(S); // 规则 v2：占领区也可以释放（恢复独立）
     addRel(S, me, t, 15); for (const c of IDS) if (c !== me && c !== t && indep(S, c) && rel(S, c, t) > 30) addRel(S, me, c, 4);
     pushEv(S, { type: 'release', actor: me, target: t, sev: -15, third: 8 }); C.out(M('st.release', { t }), 'good', [t], { notable: true }); } },
 { id: 'break', cat: 'dip', ap: 1, hostile: true, cost: () => 0,
   check: (S, me, t, p) => (breakOne(p) ? (!hasTreaty(S, me, t, p.kind) ? M('c.notreaty') : null) : !treatiesOf(S, me, t).length ? M('c.notreaty') : null), preview: (S, me, t, p) => (breakOne(p) ? M('pv.break1', { k: M('tr.' + p.kind) }) : M('pv.break')),
   exec(S, me, t, p, C) {
     if (breakOne(p)) { breakTreaty1(S, me, t, p.kind, C); return; } // 规则 v2：只退出这一项条约
     const had = treatiesOf(S, me, t).map(x => M('tr.' + x.type)); S.treaties = S.treaties.filter(x => !((x.a === me && x.b === t) || (x.a === t && x.b === me))); resetExposure(S); addRel(S, me, t, -20); if (me === S.player) { for (const x of S.treaties) { const o = x.a === me ? x.b : x.b === me ? x.a : null; if (o) addRel(S, me, o, -3); } repAdd(S, { trust: -8 }); S.commits = S.commits.filter(c => !(c.with === t && ['defend', 'armsctl'].includes(c.type))); breakCommit(S, 'no_attack', t, C.R); } C.out(M('r.break', { a: me, t, x: { list: had } }), 'warn', [t], { notable: true }); pushEv(S, { type: 'break', actor: me, target: t, sev: 20 }); } },
 // 经济
 { id: 'sanction', cat: 'econ', ap: 1, hostile: true, params: [{ key: 'level', options: [1, 2, 3] }], cost: () => 0,
   check: (S, me, t, p) => guard(S, me, t) || (sanctionLevel(S, me, t, 'econ') >= (+p.level || 1) ? M('c.sanctioned') : null),
   preview: (S, me, t, p) => { const L = +p.level || 1; return M('pv.sanction', { n: +(L * 1.3 * exposure(S, t, me) * 1.4).toFixed(2), d: +(L * 0.8 * exposure(S, me, t) * 1.4).toFixed(2) }); },
   exec(S, me, t, p, C) { const L = +p.level || 1; addSanction(S, me, t, 'econ', L); addRel(S, me, t, -[0, 8, 15, 25][L]); C.out(M('r.sanction', { a: me, t, k: M('sl.' + L) }), 'info', [t], { notable: L >= 2 }); pushEv(S, { type: 'sanction', actor: me, target: t, sev: [0, 15, 25, 40][L] }); } },
 { id: 'lift', cat: 'econ', ap: 1, cost: () => 0,
   check: (S, me, t) => (!S.sanctions.some(s => s.from === me && s.to === t) ? M('c.nosanction') : null), preview: () => M('pv.lift'),
   exec(S, me, t, p, C) { removeSanctions(S, me, t); addRel(S, me, t, 8); C.out(M('r.lift', { a: me, t }), 'good', [t], { notable: true }); pushEv(S, { type: 'lift', actor: me, target: t, sev: -10 }); } },
 { id: 'tariff', cat: 'econ', ap: 1, hostile: true, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (sanctionLevel(S, me, t, 'tariff') ? M('c.sanctioned') : null), preview: () => M('pv.tariff'),
   exec(S, me, t, p, C) { addSanction(S, me, t, 'tariff', 1); addRel(S, me, t, -8); C.out(M('r.tariff', { a: me, t }), 'info', [t], { notable: true }); pushEv(S, { type: 'tariff', actor: me, target: t, sev: 12 }); } },
 { id: 'techban', cat: 'econ', ap: 1, hostile: true, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (sanctionLevel(S, me, t, 'tech') ? M('c.sanctioned') : S.actors[me].tech < S.actors[t].tech + 2 ? M('c.notech') : null), preview: () => M('pv.techban'),
   exec(S, me, t, p, C) { addSanction(S, me, t, 'tech', 1); addRel(S, me, t, -12); C.out(M('r.techban', { a: me, t }), 'info', [t], { notable: true }); pushEv(S, { type: 'techban', actor: me, target: t, sev: 20 }); } },
 { id: 'finsanction', cat: 'econ', ap: 2, hostile: true, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (DEF[me].fin < 2 ? M('c.nofin') : sanctionLevel(S, me, t, 'fin') ? M('c.sanctioned') : null),
   preview: (S, me, t) => M('pv.fin', { n: +(1.6 * Math.max(0.3, exposure(S, t, me) * 3)).toFixed(1) }),
   exec(S, me, t, p, C) { addSanction(S, me, t, 'fin', 1); addRel(S, me, t, -25); S.actors[t].treasury -= S.actors[t].gdp * 0.02 * DEF[me].fin / 3; C.out(M('r.fin', { a: me, t }), 'info', [t], { notable: true }); pushEv(S, { type: 'finsanction', actor: me, target: t, sev: 35, third: 6 }); } },
 { id: 'energy', cat: 'econ', ap: 1, hostile: true, cost: () => 0,
   check: (S, me, t) => guard(S, me, t) || (DEF[me].energy < 1 ? M('c.noenergy') : DEF[t].energy > 0 ? M('c.selfsuff') : sanctionLevel(S, me, t, 'energy') ? M('c.sanctioned') : null), preview: () => M('pv.energy'),
   exec(S, me, t, p, C) { addSanction(S, me, t, 'energy', 1); addRel(S, me, t, -18); C.out(M('r.energy', { a: me, t }), 'info', [t], { notable: true }); pushEv(S, { type: 'energy', actor: me, target: t, sev: 30 }); } },
 { id: 'aid', cat: 'econ', ap: 1, params: [{ key: 'tier', options: [0, 1, 2] }], cost: tierCostA,
   check: (S, me, t) => (t === me ? M('c.self') : !indep(S, t) ? M('c.notindep', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t, p) => { const c = tierCost(S, me, p), g = S.actors[t].gdp; return M('pv.aid', { n: Math.round(clamp(c / g * 400, 1, 20)), d: Math.round(clamp(4 + c / g * 200, 3, 15)) }); },
   exec(S, me, t, p, C) { const c = tierCost(S, me, p), x = S.actors[t]; x.gdp += Math.min(c * 0.3, x.gdp * 0.03); x.mods.push({ g: clamp(c / x.gdp * 100 * 0.4, 0.05, 1.5), turns: 4, src: 'aid' }); addInfl(S, me, t, clamp(c / x.gdp * 400, 1, 20)); addRel(S, me, t, clamp(4 + c / x.gdp * 200, 3, 15)); x.stab = clamp(x.stab + between(S, 1, 3), 0, 100); C.out(M('r.aid', { a: me, t, m: $m(c) }), 'good', [t]); pushEv(S, { type: 'aid', actor: me, target: t, sev: -12 }); } },
 { id: 'loan', cat: 'econ', ap: 1, params: [{ key: 'tier', options: [0, 1, 2] }], cost: tierCostA,
   check: (S, me, t) => (t === me ? M('c.self') : !indep(S, t) ? M('c.notindep', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t, p) => M('pv.loan', { n: Math.round(clamp(tierCost(S, me, p) / S.actors[t].gdp * 600, 2, 25)) }),
   exec(S, me, t, p, C) { const c = tierCost(S, me, p), x = S.actors[t]; x.treasury += c; addInfl(S, me, t, clamp(c / x.gdp * 600, 2, 25)); addRel(S, me, t, clamp(2 + c / x.gdp * 100, 2, 8)); S.loans.push({ from: me, to: t, pay: c * 0.11, left: 10 }); C.out(M('r.loan', { a: me, t, m: $m(c) }), 'good', [t]); pushEv(S, { type: 'loan', actor: me, target: t, sev: -6 }); } },
 { id: 'blockade', cat: 'econ', ap: 2, hostile: true, cost: (S, me) => pctG(S, me, 0.05),
   check: (S, me, t) => guard(S, me, t) || (LANDLOCKED.has(t) ? M('c.landlocked') : S.blockades.some(b => b.by === me && b.target === t) ? M('c.blockading') : blockadeStrength(S, me, t) < 1.3 * (blockadeDefense(S, t, me) + 1) ? M('c.navyweak') : null),
   preview: (S, me, t) => M('pv.blockade', { n: ISLAND.has(t) ? 3.5 : 2 }),
   exec(S, me, t, p, C) { S.blockades.push({ by: me, target: t, since: S.turn }); addRel(S, me, t, -35); C.out(M('r.blockade', { a: me, t }), 'warn', [t], { notable: true, big: true }); pushEv(S, { type: 'blockade', actor: me, target: t, sev: 50, third: 10 }); if (t === S.player) grantCB(S, me, 'attacked', 12); } },
 // 军事
 { id: 'exercise', cat: 'mil', ap: 1, hostile: true, cost: (S, me) => pctG(S, me, 0.01),
   check: (S, me, t) => (t === me ? M('c.self') : strikePower(S, me, t) < 1 && !near(me, t, 1500) ? M('c.range') : null), preview: () => M('pv.exercise'),
   exec(S, me, t, p, C) { addRel(S, me, t, -6); const x = S.actors[t]; if (powerRatio(S, me, t) > 1.5) x.fear[me] = S.turn + 4; if (t !== S.player) x.milPct = clamp(x.milPct + 0.1, 0.3, 30); C.out(M('r.exercise', { a: me, t }), 'info', [t]); pushEv(S, { type: 'exercise', actor: me, target: t, sev: 12 }); } },
 { id: 'armsaid', cat: 'mil', ap: 1, params: [{ key: 'tier', options: [0, 1, 2] }], cost: tierCostA,
   check: (S, me, t) => (t === me ? M('c.self') : !indep(S, t) ? M('c.notindep', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t, p) => M('pv.armsaid', { n: Math.round(armsPts(S, me, t, tierCost(S, me, p))) }),
   exec(S, me, t, p, C) { const c = tierCost(S, me, p), x = S.actors[t]; armsTransfer(S, me, t, c); addInfl(S, me, t, clamp(c / x.gdp * 300, 1, 15)); addRel(S, me, t, 6); C.out(M('r.armsaid', { a: me, t, m: $m(c) }), 'good', [t], { notable: enemies(S, t).length > 0 && (atWar(S, S.player, boss(S, t)) || isAlly(S, S.player, t) || ['USA', 'CHN', 'RUS'].includes(me) || c > 20) }); pushEv(S, { type: 'armsaid', actor: me, target: t, sev: -10, arms: true }); } },
 { id: 'volunteers', cat: 'mil', ap: 1, covert: true, cost: (S, me) => pctG(S, me, 0.02),
   check: (S, me, t) => (t === me ? M('c.self') : !indep(S, t) ? M('c.notindep', { t }) : noBase(S, me, t) ? M('dl.nobase', { t: NBH(S, t) }) : !enemies(S, t).filter(e => e !== me).length ? M('c.notfighting', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
   preview: (S, me, t) => M('pv.volunteers', { n: Math.round(S.actors[me].land * 0.04 * DEF[me].ppp / DEF[t].ppp * 0.9) }),
   exec(S, me, t, p, C) { const moved = sendVolunteers(S, me, t, 0.04); addRel(S, me, t, 10); addInfl(S, me, t, 6); C.out(M('r.volunteers', { a: me, t, n: Math.round(moved) }), 'info', [t]);
     for (const e of enemies(S, t)) { if (e === me) continue; const pdet = e === S.player && me !== S.player ? detectP(S, e, me, 0.5) : 0.5; if (chance(S, pdet)) { addRel(S, me, e, -15); if (me === S.player) remember(S, e, M('mem.volunteers_to', { t }), -15); if (e === S.player) { grantCB(S, me, 'covert', 8); C.R.toYou.push({ actor: me, msg: M('ai.volunteers', { a: me, t }), tone: 'bad' }); } } } } },
 { id: 'strike', cat: 'mil', ap: 2, hostile: true, cost: (S, me) => pctG(S, me, 0.05),
   check: (S, me, t) => guard(S, me, t) || (!canStrike(S, me, t) ? M('c.range') : null),
   preview: (S, me, t) => { const P = strikePower(S, me, t), D = airEff(S, t) * share(S, t, t) * 0.5 * DEF[t].terr; return M('pv.strike', { s: { pct: clamp(0.04 + 0.14 * P / (P + D + 1), 0.04, 0.18) } }); },
   exec(S, me, t, p, C) { const P = strikePower(S, me, t), D = airEff(S, t) * share(S, t, t) * 0.5 * DEF[t].terr, fr = clamp(0.04 + 0.14 * P / (P + D + 1) + rn(S) * 0.015, 0.03, 0.2), x = S.actors[t]; x.land *= 1 - fr * 0.7; x.air *= 1 - fr; x.navy *= 1 - fr * 0.6; x.gdp *= 0.994; x.stab = clamp(x.stab + (powerRatio(S, me, t) > 3 ? -3 : 3), 0, 100); S.actors[me].air *= 1 - 0.03 * D / (P + D + 1); addRel(S, me, t, -35); S.tension = clamp(S.tension + 5, 0, 100); C.out(M('r.strike', { a: me, t, s: { pct: fr } }), 'warn', [t], { notable: true, big: true }); pushEv(S, { type: 'strike', actor: me, target: t, sev: me === S.player && legitCB(S, t) ? 35 : 55, third: 12 }); if (t === S.player) grantCB(S, me, 'attacked', 12); } },
 { id: 'invade', cat: 'mil', ap: 2, hostile: true, cost: (S, me) => pctG(S, me, 0.1),
   params: [{ key: 'share', options: [0.25, 0.4, 0.6, 0.8] }, { key: 'haste', options: [0, 1] }],
   check: (S, me, t, p) => { if (t === me) return M('c.self'); if (!t || !S.actors[t]) return M('c.notarget'); if (S.actors[t].ctrl === me || boss(S, t) === me) return M('c.mine', { t }); if (S.fronts.some(f => f.att === me && f.target === t) || S.ops.some(o => o.owner === me && o.target === t)) return M('c.hasfront', { t }); const opts = stagingOptions(S, me, t); if (!opts.length) return M('c.noroute', { t }); if (+p.haste && opts[0].free < 0.03) return M('c.nohaste', { l: opts[0].L }); return null; },
   preview: (S, me, t, p) => { const o = stagingOptions(S, me, t)[0]; if (!o) return null; const sh = +p.share || 0.4; const turns = +p.haste ? 0 : (o.eta + (o.kind === 'amph' ? 2 : 1)); return M('pv.invade', { l: o.L, k: M('kind.' + o.kind), n: turns, r: +estimateOp(S, me, t, sh, o.kind).toFixed(2), s: { pct: me === S.player ? warAuth(S, t) : 1 }, d: minTurns(t) }); },
   exec(S, me, t, p, C) {
     const sh = +p.share || 0.4, haste = !!(+p.haste);
     if (me === S.player && DEF[me].gov !== 'aut' && !atWar(S, me, boss(S, t))) { const pa = warAuth(S, t); if (!chance(S, pa)) { facAdd(S, { pub: -2 }); C.out(M('r.invade.denied', { t }), 'bad', [t]); return; } }
     const r = createOp(S, me, t, sh, haste, p.from); if (r.err) { C.out(M('r.invade.err', { t, x: M('c.' + r.err, { t }) }), 'bad', [t]); return; }
     const o = r.op; o.legit = me === S.player ? !!legitCB(S, boss(S, t)) : true;
     if (p.focus !== undefined && p.focus !== null && p.focus !== '' && cityAt(t, +p.focus)) o.focus = +p.focus; // 作战地图上指定的主攻城市
     if (me === S.player) C.out(M(haste ? 'r.invade.haste' : 'r.invade.op', { t, l: o.from, n: Math.max(0, o.ready - S.turn), s: dotw(S, me, o.v) }), 'warn', [t]);
     pushEv(S, { type: 'massing', actor: me, target: t, sev: 0, hidden: true, op: o.id }); } },
 { id: 'threat', cat: 'mil', ap: 1, hostile: true, cost: () => 0,
   check: (S, me, t) => (S.actors[me].nukes <= 0 ? M('c.nonukes') : t === me ? M('c.self') : null), preview: () => M('pv.threat'),
   exec(S, me, t, p, C) { addRel(S, me, t, -15); for (const c of IDS) if (c !== me && c !== t) addRel(S, me, c, -4); const x = S.actors[t]; if (x.nukes <= 0 && !IDS.some(c => S.actors[c].nukes > 50 && isAlly(S, c, t))) x.fear[me] = S.turn + 6; S.tension = clamp(S.tension + 10, 0, 100); C.out(M('r.threat', { a: me, t }), 'warn', [t], { notable: true, big: true }); pushEv(S, { type: 'nukethreat', actor: me, target: t, sev: 35, third: 15 }); } },
 { id: 'nuke', cat: 'mil', ap: 3, danger: true, hostile: true, params: [{ key: 'scope', options: ['tactical', 'strategic'] }], cost: () => 0,
   check: (S, me, t) => (S.actors[me].nukes < 5 ? M('c.nonukes') : t === me ? M('c.self') : !(DEF[me].icbm || strikePower(S, me, t) > 1) ? M('c.range') : null),
   preview: (S, me, t) => { const ret = S.actors[t].nukes >= 5 || IDS.some(c => S.actors[c].nukes > 50 && isAlly(S, c, t)); return M(ret ? 'pv.nuke.ret' : 'pv.nuke'); },
   exec(S, me, t, p, C) { nuclearStrike(S, me, t, p.scope || 'tactical', C.R); } },
 // 隐蔽
 { id: 'cyber', cat: 'covert', ap: 1, hostile: true, covert: true, cost: (S, me) => pctG(S, me, 0.005),
   check: (S, me, t) => guard(S, me, t), preview: () => M('pv.cyber'),
   exec(S, me, t, p, C) { const x = S.actors[t], k = covF(S, me, t); const hit = between(S, 0.2, 0.5) * k * (0.7 + 0.6 * S.actors[me].tech / 100) / (0.7 + 0.6 * x.tech / 100); x.gdp *= 1 - hit / 100; x.stab = clamp(x.stab - 1.5 * k, 0, 100); x.tech -= 0.3 * k; covertOutcome(S, C, me, t, 'cyber', 0.35, -20, M('r.cyber', { a: me, t, n: +hit.toFixed(1) })); } },
 { id: 'propaganda', cat: 'covert', ap: 1, hostile: true, covert: true, cost: (S, me) => pctG(S, me, 0.003),
   check: (S, me, t) => (t === me ? M('c.self') : !indep(S, t) ? M('c.notindep', { t }) : null), preview: () => M('pv.propaganda'),
   exec(S, me, t, p, C) { const x = S.actors[t]; const s = between(S, 2, 5) * (DEF[t].gov === 'dem' ? 1.2 : 0.7) * covF(S, me, t); x.stab = clamp(x.stab - s * (t === S.player ? 0.6 : 1), 0, 100); if (t === S.player) facAdd(S, { pub: -s * 0.3 }); addInfl(S, me, t, between(S, 3, 6)); covertOutcome(S, C, me, t, 'propaganda', 0.25, -10, M('r.propaganda', { a: me, t, n: Math.round(s) })); } },
 { id: 'opposition', cat: 'covert', ap: 1, hostile: true, covert: true, cost: (S, me, t) => Math.max(1, S.actors[t].gdp * 0.004),
   check: (S, me, t) => guard(S, me, t), preview: () => M('pv.opposition'),
   exec(S, me, t, p, C) { const x = S.actors[t], k = covF(S, me, t); addInfl(S, me, t, between(S, 6, 10)); x.stab = clamp(x.stab - between(S, 3, 6) * k * (t === S.player ? 0.6 : 1), 0, 100); if (t === S.player) facAdd(S, { pub: -1.2 * k }); covertOutcome(S, C, me, t, 'opposition', 0.3, -18, M('r.opposition', { a: me, t })); } },
 { id: 'coup', cat: 'covert', ap: 2, hostile: true, covert: true, cost: (S, me, t) => Math.max(3, S.actors[t].gdp * 0.01),
   check: (S, me, t) => guard(S, me, t) || (t === S.player || isHuman(S, t) ? M('c.self') : infl(S, me, t) < 30 ? M('c.infl', { n: 30 }) : null),
   preview: (S, me, t) => M('pv.coup', { s: { pct: coupChance(S, me, t) } }),
   exec(S, me, t, p, C) { const pc = coupChance(S, me, t), x = S.actors[t]; const prevLord = x.overlord;
     if (chance(S, pc)) { makeVassal(S, t, me); if (RULES3) coupUndo3(S, me, t, C.R); x.stab = clamp(x.stab - 15, 0, 100); setRel(S, me, t, 60); addInfl(S, me, t, 15); C.out(M('r.coup.ok', { a: me, t }), 'good', [t, prevLord].filter(Boolean), { notable: true, big: true }); pushEv(S, { type: 'coup', actor: me, target: t, sev: 55, third: 20, big: true }); if (prevLord === S.player) { C.R.toYou.push({ actor: me, msg: M('ai.coup_vassal', { a: me, t }), tone: 'bad' }); grantCB(S, me, 'covert', 10); } }
     else { x.stab = clamp(x.stab + 5, 0, 100); addInfl(S, me, t, -15); covertOutcome(S, C, me, t, 'coup', 0.8, -40, M('r.coup.fail', { a: me, t }), 'bad'); } } },
 { id: 'sabotage', cat: 'covert', ap: 1, hostile: true, covert: true, cost: (S, me) => pctG(S, me, 0.01),
   check: (S, me, t) => guard(S, me, t), preview: () => M('pv.sabotage'),
   exec(S, me, t, p, C) { const x = S.actors[t], k = covF(S, me, t); x.gdp *= 1 - 0.004 * k; x.land *= 1 - 0.015 * k; x.air *= 1 - 0.015 * k; x.navy *= 1 - 0.015 * k; covertOutcome(S, C, me, t, 'sabotage', 0.4, -20, M('r.sabotage', { a: me, t })); } },
 { id: 'espionage', cat: 'covert', ap: 1, covert: true, cost: (S, me) => pctG(S, me, 0.008),
   check: (S, me, t) => (t === me ? M('c.self') : S.actors[t].tech <= S.actors[me].tech ? M('c.notahead', { t }) : null), preview: () => M('pv.espionage'),
   exec(S, me, t, p, C) { const g = (S.actors[t].tech - S.actors[me].tech) * 0.08 + 0.4; S.actors[me].tech = clamp(S.actors[me].tech + g, 0, 100); covertOutcome(S, C, me, t, 'espionage', 0.3, -12, M('r.espionage', { a: me, t, n: +g.toFixed(1) })); } },
 { id: 'fabricate', cat: 'covert', ap: 1, covert: true, cost: (S, me) => pctG(S, me, 0.004),
   check: (S, me, t) => guard(S, me, t) || (me === S.player && legitCB(S, t) ? M('c.hascb', { t }) : null), preview: () => M('pv.fabricate'),
   exec(S, me, t, p, C) { if (chance(S, 0.7)) { if (me === S.player) grantCB(S, t, 'fabricated', 6, true); addRel(S, me, t, -5); C.out(M('r.fabricate.ok', { t }), 'good', [t]); } else { if (me === S.player) { repAdd(S, { trust: -12, aggr: 8 }); facAdd(S, { pub: -4 }); remember(S, t, M('mem.fabricate'), -20); } addRel(S, me, t, -15); C.out(M('r.fabricate.no', { t }), 'bad', [t]); } } },
 { id: 'fund_resist', cat: 'covert', ap: 1, hostile: true, covert: true, cost: (S, me) => pctG(S, me, 0.005),
   check: (S, me, t) => (!S.actors[t] || S.actors[t].ctrl === t || S.actors[t].integrated ? M('c.notoccupied', { t }) : S.actors[t].ctrl === me ? M('c.mine', { t }) : null),
   preview: () => M('pv.fund_resist'),
   exec(S, me, t, p, C) { const x = S.actors[t]; x.fund = (x.fund || 0) + between(S, 4, 7); addInfl(S, me, t, 6); const O = x.ctrl; covertOutcome(S, C, me, O, 'fund_resist', 0.3, -15, M('r.fund_resist', { a: me, t, b: O })); } },
 { id: 'incite', cat: 'covert', ap: 1, hostile: true, covert: true, cost: (S, me, t) => Math.max(0.5, S.actors[t].gdp * 0.004),
   check: (S, me, t) => (!S.actors[t] || !indep(S, t) || !S.actors[t].overlord ? M('c.notvassalof', { t }) : S.actors[t].overlord === me ? M('c.myvassal', { t }) : null),
   preview: (S, me, t) => M('pv.incite', { b: S.actors[t].overlord }),
   exec(S, me, t, p, C) { const x = S.actors[t], L = x.overlord; addInfl(S, me, t, between(S, 6, 10)); addRel(S, t, L, -between(S, 6, 12)); let freed = false;
     if (rel(S, t, L) < 5 && infl(S, me, t) > infl(S, L, t)) { x.overlord = null; freed = true; addRel(S, me, t, 10); pushEv(S, { type: 'independence', actor: t, target: L, sev: 25, big: true }); }
     covertOutcome(S, C, me, L, 'incite', 0.3, -15, M(freed ? 'r.incite.free' : 'r.incite', { a: me, t, b: L }), freed ? 'good' : 'info'); } },
 // 占领区
 { id: 'pacify', cat: 'occ', ap: 1, cost: (S, me, t) => Math.max(0.5, S.actors[t].gdp * 0.01),
   check: (S, me, t) => (S.actors[t].ctrl !== me || t === me ? M('c.notocc', { t }) : S.actors[t].integrated ? M('c.integrated') : null), preview: () => M('pv.pacify'),
   exec(S, me, t, p, C) { const x = S.actors[t]; const d = between(S, 12, 20); x.resist = clamp(x.resist - d, 0, 100); x.stab = clamp(x.stab + 3, 0, 100); C.out(M('r.pacify', { t, n: Math.round(d) }), 'good', [t]); } },
 { id: 'annex', cat: 'occ', ap: 2, hostile: true, cost: () => 0,
   check: (S, me, t) => (S.actors[t].ctrl !== me || t === me ? M('c.notocc', { t }) : S.actors[t].integrated ? M('c.integrated') : S.actors[t].resist > 30 ? M('c.resist', { n: Math.round(S.actors[t].resist) }) : null), preview: () => M('pv.annex'),
   exec(S, me, t, p, C) { const x = S.actors[t]; x.integrated = true; x.resist = Math.min(x.resist, 10); for (const c of IDS) if (c !== me && indep(S, c)) addRel(S, me, c, rel(S, c, t) > 30 ? -12 : -3); if (me === S.player) repAdd(S, { aggr: 10 }); C.out(M('r.annex', { a: me, t }), 'warn', [t], { notable: true, big: true }); pushEv(S, { type: 'annex', actor: me, target: t, sev: 30, third: 15 }); } },
 { id: 'puppet', cat: 'occ', ap: 1, cost: () => 0,
   check: (S, me, t) => (S.actors[t].ctrl !== me || t === me ? M('c.notocc', { t }) : null), preview: () => M('pv.puppet'),
   exec(S, me, t, p, C) { const x = S.actors[t]; x.ctrl = t; x.resist = 0; x.integrated = false; rebuildArmy(S, t, 0.25); x.stab = 40; makeVassal(S, t, me); setRel(S, me, t, 50); resetExposure(S); C.out(M('r.puppet', { a: me, t }), 'info', [t], { notable: true }); pushEv(S, { type: 'puppet', actor: me, target: t, sev: 15 }); } },
 // 内政（无需目标）
 { id: 'mobilize', cat: 'dom', ap: 1, self: true, params: [{ key: 'level', options: [0, 1, 2, 3] }], cost: () => 0,
   check: (S, me, t, p) => (+p.level === S.actors[me].mob ? M('c.same') : null), preview: (S, me, t, p) => M('pv.mobilize', { n: MOB[+p.level || 0], d: MANP[+p.level || 0], s: [0, 0.1, 0.35, 0.8][+p.level || 0] }),
   exec(S, me, t, p, C) { S.actors[me].mob = +p.level || 0; C.out(M('r.mobilize', { k: M('mob.' + S.actors[me].mob) }), 'info'); if (S.actors[me].mob >= 2) pushEv(S, { type: 'mobilize', actor: me, target: null, sev: 15, third: 8 }); if (me === S.player && S.actors[me].mob >= 2) facAdd(S, { mil: 3, pub: -2 }); } },
 { id: 'buildup', cat: 'dom', ap: 1, self: true, params: [{ key: 'tier', options: [0, 1, 2] }, { key: 'branch', options: ['all', 'land', 'navy', 'air'] }], cost: tierCostA,
   check: () => null, preview: (S, me, t, p) => M('pv.buildup', { n: Math.round(tierCost(S, me, p) * DEF[me].ppp * 0.85) }),
   exec(S, me, t, p, C) { const x = S.actors[me], pts = tierCost(S, me, p) * DEF[me].ppp * 0.85; const b = p.branch || 'all'; if (b === 'all') { x.land += pts * x.mix[0]; x.navy += pts * x.mix[1]; x.air += pts * x.mix[2]; } else x[b] += pts; if (me === S.player) facAdd(S, { mil: 3 }); C.out(M('r.buildup', { n: Math.round(pts) }), 'good'); pushEv(S, { type: 'buildup', actor: me, target: null, sev: 6, third: 5 }); } },
 { id: 'stabilize', cat: 'dom', ap: 1, self: true, cost: (S, me, t, p) => invK(S, me, p, 0.02).cost, check: () => null, preview: () => M('pv.stabilize'),
   exec(S, me, t, p, C) { const d = between(S, 3, 6) * invK(S, me, p, 0.02).k; S.actors[me].stab = clamp(S.actors[me].stab + d, 0, 100); if (me === S.player) facAdd(S, { pub: 3 }); C.out(M('r.stabilize', { n: Math.round(d) }), 'good'); } },
 { id: 'crackdown', cat: 'dom', ap: 1, self: true, cost: () => 0, check: () => null, preview: (S, me) => M('pv.crackdown', { n: DEF[me].gov === 'dem' ? 3 : 7 }),
   exec(S, me, t, p, C) { const x = S.actors[me]; x.stab = clamp(x.stab + (DEF[me].gov === 'dem' ? 3 : 7), 0, 100); for (const id of controlled(S, me)) if (id !== me) S.actors[id].resist = clamp(S.actors[id].resist - 8, 0, 100); for (const c of IDS) if (c !== me && DEF[c].gov === 'dem' && indep(S, c)) addRel(S, me, c, -2); if (me === S.player) facAdd(S, { pub: DEF[me].gov === 'dem' ? -6 : -2, mil: 2 }); C.out(M('r.crackdown'), 'info'); } },
 { id: 'stimulus', cat: 'dom', ap: 1, self: true, cost: (S, me, t, p) => invK(S, me, p, 1.0).cost, check: () => null, preview: () => M('pv.stimulus'),
   exec(S, me, t, p, C) { S.actors[me].mods.push({ g: 0.3 * invK(S, me, p, 1.0).k, turns: 4, src: 'stimulus' }); if (me === S.player) facAdd(S, { biz: 4, pub: 2 }); C.out(M('r.stimulus'), 'good'); } },
 { id: 'research', cat: 'dom', ap: 1, self: true, cost: (S, me, t, p) => invK(S, me, p, 0.3).cost, check: (S, me) => (S.actors[me].tech >= 100 ? M('c.maxtech') : null), preview: (S, me, t, p) => M('pv.research', { n: +((1 + (100 - S.actors[me].tech) / 40) * invK(S, me, p, 0.3).k).toFixed(1) }),
   exec(S, me, t, p, C) { const g = between(S, 0.8, 1.4) * (1 + (100 - S.actors[me].tech) / 40) * invK(S, me, p, 0.3).k; S.actors[me].tech = clamp(S.actors[me].tech + g, 0, 100); C.out(M('r.research', { n: +g.toFixed(1) }), 'good'); } },
 { id: 'intel', cat: 'dom', ap: 1, self: true, cost: (S, me, t, p) => invK(S, me, p, 0.05).cost, check: (S, me) => (intelOf(S, me) >= 98 ? M('c.maxintel') : null), preview: () => M('pv.intel'),
   exec(S, me, t, p, C) { const x = S.actors[me]; const g = between(S, 3, 5) * invK(S, me, p, 0.05).k; x.intel = clamp(intelOf(S, me) + g, 0, 100); C.out(M('r.intel', { n: Math.round(x.intel) }), 'good'); } },
 { id: 'investigate', cat: 'dom', ap: 1, self: true, cost: (S, me) => pctG(S, me, 0.01), check: (S, me) => (!S.unattrib.filter(u => !u.known).length ? M('c.nounknown') : null), preview: () => M('pv.investigate'),
   exec(S, me, t, p, C) { const open = S.unattrib.filter(u => !u.known); let found = 0; for (const u of open) if (chance(S, detectP(S, me, u.culprit, 0.45))) { u.known = true; found++; grantCB(S, u.culprit, 'covert', 8); addRel(S, me, u.culprit, -10); C.out(M('r.investigate.hit', { b: u.culprit, x: M('uk.' + u.type) }), 'good', [u.culprit]); } if (!found) C.out(M('r.investigate.miss'), 'info'); } },
 { id: 'cbm', cat: 'dom', ap: 1, self: true, cost: (S, me) => pctG(S, me, 0.01), check: (S, me) => ((S.cbmUntil || -1) >= S.turn ? M('c.cbmactive') : null), preview: () => M('pv.cbm'),
   exec(S, me, t, p, C) { if (me === S.player) { S.cbmUntil = S.turn + 4; repAdd(S, { trust: 4, aggr: -3 }); for (const c of IDS) if (c !== me && dist(me, c) < 3000) S.threat[c] = Math.max(0, (S.threat[c] || 0) - 6); } C.out(M('r.cbm'), 'good'); } },
 { id: 'nukeprog', cat: 'dom', ap: 2, self: true, cost: (S, me) => pctG(S, me, 0.15), check: () => null,
   preview: (S, me) => (S.actors[me].nukes > 0 ? M('pv.nukeexp', { n: Math.max(5, Math.round(S.actors[me].nukes * 0.05)) }) : M('pv.nukeprog', { n: Math.round(S.actors[me].nukeProg) })),
   exec(S, me, t, p, C) { const x = S.actors[me]; if (x.nukes > 0) { const n = Math.max(5, Math.round(x.nukes * 0.05)); x.nukes += n; C.out(M('r.nukeexp', { n }), 'info'); pushEv(S, { type: 'nukeexpand', actor: me, target: null, sev: 12, third: 8 }); }
     else { x.nukeProg = clamp(x.nukeProg + between(S, 8, 14), 0, 100); if (x.nukeProg >= 100) { x.nukes = 10; x.nukeProg = 100; C.out(M('r.nuketest', { a: me }), 'warn', [], { notable: true, big: true }); pushEv(S, { type: 'nuketest', actor: me, target: null, sev: 45, third: 30, big: true }); } else { C.out(M('r.nukeprog', { n: Math.round(x.nukeProg) }), 'info'); if (chance(S, 0.4)) pushEv(S, { type: 'nukeprog', actor: me, target: null, sev: 30, third: 20 }); } } } },
 // 军队建设（不占行动点，花费国库）
 { id: 'conscript', cat: 'army', ap: 0, self: true, params: [{ key: 'size', options: [0, 1, 2] }], cost: (S, me, t, p) => consN(S, me, p) * soldierCost(S, me),
   check: (S, me, t, p) => ((S.actors[me].pers || 0) + inTraining(S, me) + consN(S, me, p) > persCap(S, me) ? M('c.perscap', { n: fmtK(persCap(S, me)) }) : null),
   preview: (S, me, t, p) => { const n = consN(S, me, p); return M('pv.conscript', { n: fmtK(n), t: trainTurns(S, me), d: +conscriptPubHit(S, me, n).toFixed(1), c: fmtK(persCap(S, me)) }); },
   exec(S, me, t, p, C) { const n = consN(S, me, p); const x = S.actors[me]; x.train.push({ n, eta: S.turn + trainTurns(S, me) }); const hit = conscriptPubHit(S, me, n); if (me === S.player && hit > 0) facAdd(S, { pub: -hit, mil: 1 }); x.mods.push({ g: -clamp(n / (DEF[me].pop * 1000) * 40, 0, 0.3), turns: 2, src: 'draft' }); C.out(M('r.conscript', { n: fmtK(n), t: trainTurns(S, me) }), 'info'); if (n / (DEF[me].pop * 1000) >= 0.0015) pushEv(S, { type: 'mobilize', actor: me, target: null, sev: 8, third: 5 }); } },
 { id: 'procure', cat: 'army', ap: 0, self: true, params: [{ key: 'branch', options: ['land', 'air', 'navy'] }, { key: 'tier', options: [0, 1, 2] }], cost: (S, me, t, p) => procAmt(S, me, p),
   check: () => null,
   preview: (S, me, t, p) => { const br = p.branch || 'land', c = procAmt(S, me, p), pts = procPts(S, me, c); return M('pv.procure', { n: Math.round(procUnits(S, me, br, pts)), u: M('unit.' + br), t: procLead(S, me, br), p: Math.round(pts) }); },
   exec(S, me, t, p, C) { const br = ['land', 'air', 'navy'].includes(p.branch) ? p.branch : 'land'; const c = procAmt(S, me, p); const pts = procPts(S, me, c); S.actors[me].orders.push({ br, pts, eta: S.turn + procLead(S, me, br) }); if (me === S.player) facAdd(S, { mil: 1 }); C.out(M('r.procure', { k: M('br.' + br), n: Math.round(procUnits(S, me, br, pts)), u: M('unit.' + br), t: procLead(S, me, br) }), 'info'); } },
 // 盟友：请求出兵 / 请求扩军
 { id: 'reqtroops', cat: 'dip', ap: 1, params: [{ key: 'dest', dyn: 'reqdest' }, { key: 'size', options: [0, 1, 2] }], cost: () => 0,
   check: (S, me, t, p) => reqCheck(S, me, t) || (!p.dest || !reqDestOk(S, t, p.dest) ? M('c.nodest') : null),
   preview: (S, me, t, p) => M('pv.reqtroops', { s: { pct: troopPreview(S, t, p.dest, +p.size || 0) || 0 } }),
   exec(S, me, t, p, C) {
     const r = reqDest(S, p.dest); const size = +p.size || 0; S.actors[t].flags['rq_' + me] = S.turn;
     const { s, why } = troopScore(S, t, r, size); const roll = s + rn(S) * 0.22;
     if (roll > 0.02) { const res = sendTroops(S, t, p.dest, TROOP_SIZE[size] * (roll > 0.22 ? 1 : 0.5), C.R); addRel(S, me, t, 2); C.out(M(roll > 0.22 ? 'r.req.ok' : 'r.req.part', { t, x: res || M('rq.nomove', { a: t }) }), 'good', [t]); pushEv(S, { type: 'troops', actor: t, target: r.enemy || r.threat || null, sev: r.enemy ? 20 : 8, third: 6 }); }
     else { addRel(S, me, t, -2); C.out(M('r.req.no', { t, x: M('rq.why.' + (why.find(w => w !== 'loyal') || 'busy')) }), 'bad', [t]); } } },
 { id: 'reqmob', cat: 'dip', ap: 1, cost: () => 0,
   check: (S, me, t) => reqCheck(S, me, t) || (S.actors[t].mob >= 2 ? M('c.mobbed', { t }) : null),
   preview: (S, me, t) => M('pv.reqmob', { s: { pct: clamp(sig(mobScore(S, me, t) * 4), 0.02, 0.97) } }),
   exec(S, me, t, p, C) { S.actors[t].flags['rq_' + me] = S.turn; const u = mobScore(S, me, t) + rn(S) * 0.2; if (u > 0) { const r = allyMobilize(S, t, u > 0.3 ? 2 : 1, u > 0.3 ? 1 : 0.5); addRel(S, me, t, 1); C.out(r, 'good', [t]); } else { addRel(S, me, t, -2); C.out(M('r.reqmob.no', { t }), 'bad', [t]); } } },
 { id: 'escort', cat: 'mil', ap: 1, hostile: true, cost: (S, me) => pctG(S, me, 0.02),
   check: (S, me, t) => (!S.blockades.some(b => b.target === t && b.by !== me) ? M('c.noblockade', { t }) : forcesNear(S, me, t, 1200, 'navy') < 1 ? M('c.nonavy', { t }) : null),
   preview: (S, me, t) => { const b = S.blockades.find(z => z.target === t && z.by !== me); if (!b) return null; const r = (forcesNear(S, me, t, 1200, 'navy') + 0.5 * forcesNear(S, me, t, 1200, 'air') + 1) / (forcesNear(S, b.by, t, 1200, 'navy') + 0.4 * forcesNear(S, b.by, t, 1200, 'air') + 1); return M('pv.escort', { b: b.by, r: +r.toFixed(2) }); },
   exec(S, me, t, p, C) { const res = escortBattle(S, me, t, C.R) || []; for (const m of res) C.out(m, 'warn', [t], { notable: true, big: true }); } },
 // 作战地图：对一条战线实施空中支援（进攻或防御），只在作战地图中出现
 { id: 'fsupport', cat: 'mil', ap: 1, hidden: true, cost: (S, me) => pctG(S, me, 0.03),
   check: (S, me, t, p) => { const f = S.fronts.find(z => z.id === (p || {}).front); if (!f || f.target !== t) return M('c.nofront'); const side = f.att === me ? 'a' : (boss(S, f.target) === me || (f.coD || []).includes(me)) ? 'd' : null; if (!side) return M('c.nofront'); if (side === 'd' && f.phase !== 'land') return M('c.nofront'); if (airSupportOf(S, me, t).air < 0.01) return M('c.noair'); return null; },
   preview: (S, me, t, p) => { const f = S.fronts.find(z => z.id === p.front); if (!f) return null; const a = airSupportOf(S, me, t); const base = f.att === me ? (f.A || groundV(S, me, f.v)) : (f.D || defenseAt(S, t, f.att).force); return M('pv.fsupport', { n: Math.round(a.planes), b: a.list.length, s: { pct: clamp(Math.min(a.force, base * 0.6 + 5) / Math.max(1, base), 0, 0.6) } }); },
   exec(S, me, t, p, C) { const f = S.fronts.find(z => z.id === p.front); if (!f) { C.out(M('r.fsupport.gone', { t }), 'bad', [t]); return; } const a = airSupportOf(S, me, t); if (f.att === me) { f.sup = S.turn; f.supL = a.list; } else { f.dsup = S.turn; f.dsupL = a.list; f.dsupBy = me; } C.out(M('r.fsupport', { t, n: Math.round(a.planes) }), 'info', [t]); } },
 { id: 'leavebloc', cat: 'dom', ap: 1, self: true, params: [{ key: 'bloc', dyn: 'blocs' }], cost: () => 0,
   check: (S, me) => (!Object.values(S.blocs).some(b => b.members.includes(me)) ? M('c.nobloc') : null), preview: () => M('pv.leavebloc'),
   exec(S, me, t, p, C) { const b = S.blocs[p.bloc] || Object.values(S.blocs).find(x => x.members.includes(me)); if (!b) return; b.members = b.members.filter(m => m !== me); for (const m of b.members) addRel(S, me, m, m === b.leader ? -25 : -15); if (b.leader === me && b.members.length) b.leader = b.members.slice().sort((x, y) => power(S, y) - power(S, x))[0]; C.out(M('r.leavebloc', { a: me, b: M('bloc.' + b.id) }), 'warn', [], { notable: true, big: true }); pushEv(S, { type: 'leavebloc', actor: me, target: b.leader, sev: 25, third: 10 }); } },
];
/* 规则 v2：援助表单里选“每季度”时，排成长期援助计划（像租借法案），回合结束时开始，每季度从国库拨付 */
if (RULES2) ACTIONS.push({ id: 'aidprog', cat: 'econ', ap: 1, hidden: true, params: [{ key: 'kind', options: ['aid', 'arms'] }], cost: () => 0,
  check: (S, me, t) => (t === me ? M('c.self') : !t || !S.actors[t] || !indep(S, t) ? M('c.notindep', { t }) : atWar(S, me, t) ? M('c.atwar', { t }) : null),
  preview: (S, me, t, p) => { const q = progOf(S, me, p); return M('st.program', { k: M('st.k.' + q.kind), t, m: $m(q.amount), n: q.turns }); },
  exec(S, me, t, p, C) { const q = progOf(S, me, p); S.programs = (S.programs || []).filter(z => !(z.from === me && z.to === t && z.kind === q.kind)); S.programs.push({ id: 'G' + S.seq++, from: me, to: t, kind: q.kind, amount: q.amount, until: S.turn + q.turns - 1, since: S.turn }); addRel(S, me, t, 6); C.out(M('st.program', { k: M('st.k.' + q.kind), t, m: $m(q.amount), n: q.turns }), 'good', [t], { notable: true }); pushEv(S, { type: q.kind === 'arms' ? 'armsaid' : 'aid', actor: me, target: t, sev: -10, arms: q.kind === 'arms' }); } });
function progOf(S, me, p) { const g = S.actors[me].gdp; return { kind: p && p.kind === 'arms' ? 'arms' : 'aid', amount: +clamp(+(p && p.amt) || g * 0.002, 0.01, g * 0.005).toFixed(2), turns: clamp(Math.round(+(p && p.turns) || 4), 1, 16) }; }
const breakOne = p => RULES2 && !!p && TREATY_TYPES.includes(p.kind);
/* 只退出一项条约：同盟、军控连带的承诺一起解除；退出互不侵犯条约算违背“不进攻”承诺 */
function breakTreaty1(S, me, t, kind, C) {
  S.treaties = S.treaties.filter(x => !(x.type === kind && ((x.a === me && x.b === t) || (x.a === t && x.b === me))));
  resetExposure(S); const big = kind === 'alliance' || kind === 'nap'; addRel(S, me, t, big ? -15 : -8);
  if (me === S.player) { repAdd(S, { trust: big ? -5 : -2 }); S.commits = S.commits.filter(c => !(c.with === t && ((kind === 'alliance' && c.type === 'defend') || (kind === 'armsctl' && c.type === 'armsctl')))); if (kind === 'nap') breakCommit(S, 'no_attack', t, C.R); }
  C.out(M('r.break', { a: me, t, x: { list: [M('tr.' + kind)] } }), 'warn', [t], { notable: big }); pushEv(S, { type: 'break', actor: me, target: t, sev: big ? 15 : 8 });
}
const ACT = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
/* 中立地区：凡是由它发起、以它为对象、或参数里涉及它的行动一律不可执行（玩家与 AI 都经过 check） */
const neuParam = (S, p) => !!p && ['about', 'with', 't', 'to', 'from', 'loc', 'a', 'b', 'by', 'vs'].some(k => typeof p[k] === 'string' && NEU(S, p[k]));
for (const a of ACTIONS) { const ck = a.check; a.check = (S, me, t, p) => (S.neutral && S.neutral.length && (NEU(S, me) || NEU(S, t) || neuParam(S, p)) ? neuWhy(S, NEU(S, t) ? t : NEU(S, me) ? me : ['about', 'with', 't', 'to', 'from', 'loc', 'a', 'b', 'by', 'vs'].map(k => p && p[k]).find(v => typeof v === 'string' && NEU(S, v)) || null) : ck(S, me, t, p)); }

/* 按中国标准处理的国家（S.shield，见 01_core.js）：别国不能对它舆论战、扶植反对派、策动政变；它自己不采取隐蔽行动（资助抵抗运动除外），
 * 奉行不首先使用核武器（遭到核打击后才能核反击）、不进行核威胁。有保底的国家（S.guard）不会被政变推翻：对它不能策动政变
 * （以前会判定“政变成功”却不会沦为附庸，战报与实际不符）。玩家与 AI 都经过 check；单人版没有 shield / guard，结果不变。 */
const SH_TGT = new Set(['propaganda', 'opposition', 'coup']), SH_SELF = new Set(['cyber', 'propaganda', 'opposition', 'coup', 'sabotage', 'espionage', 'fabricate', 'incite']);
for (const a of ACTIONS) {
  const ck = a.check;
  a.check = (S, me, t, p) => {
    if (S.shield && S.shield.length) {
      if (SHD(S, me) && SH_SELF.has(a.id)) return M('c.shield_self', { a: me });
      if (SHD(S, me) && a.id === 'threat') return M('c.nfu_threat', { a: me });
      if (SHD(S, me) && a.id === 'nuke' && ((S.actors[me] && S.actors[me].flags) || {}).nukedAt == null) return M('c.nfu', { a: me });
      if (t && t !== me && SHD(S, t) && SH_TGT.has(a.id)) return M('c.shield', { t });
    }
    if (a.id === 'coup' && t && S.guard && GRD(S, t)) return M('c.guardcoup', { t });
    return ck(S, me, t, p);
  };
}

/* 隐蔽行动的暴露与归因 */
function covertOutcome(S, C, me, t, type, base, relHit, msg, toneOverride) {
  const P = S.player;
  if (me === P) {
    const det = chance(S, detectP(S, t, me, base));
    if (det) { addRel(S, me, t, relHit); pushEv(S, { type, actor: me, target: t, sev: -relHit + 5 }); }
    afterPlayerAction(S, type, t, {}, C.R, det);
    C.out(det ? M('r.covert.exposed', { x: msg }) : msg, toneOverride || (det ? 'warn' : 'good'), [t]);
    return det;
  }
  if (t === P) {
    const det = chance(S, detectP(S, P, me, base + 0.1));
    if (det) { addRel(S, me, t, relHit); grantCB(S, me, 'covert', 8); C.R.toYou.push({ actor: me, msg: M('ai.' + type, { a: me, t }), tone: 'bad' }); }
    else { S.unattrib.push({ turn: S.turn, type, culprit: me, known: false }); if (S.unattrib.length > 20) S.unattrib.shift(); C.R.toYou.push({ actor: null, msg: M('uk.msg', { x: M('uk.' + type) }), tone: 'bad' }); }
    return det;
  }
  const det = chance(S, base * 0.6);
  if (det) { addRel(S, me, t, relHit * 0.7); C.R.world.push({ actor: me, msg: M('ai.exposed', { a: me, t, x: M('uk.' + type) }), tone: 'info', about: [t] }); }
  return det;
}
