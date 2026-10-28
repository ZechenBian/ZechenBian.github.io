/* ===================== 军队建设：征兵、军工订单、盟军派兵、护航 ===================== */
const CONSCRIPT = [0.0005, 0.0015, 0.004];           // 每次征兵规模（占人口比例）
const PERS_CAP = [0.012, 0.03, 0.07, 0.12];           // 各动员等级下兵员上限（占人口比例）
const PROC_TIER = [0.1, 0.3, 0.8];                     // 军工订单规模（占 GDP 百分比）
const PROC_LEAD = { land: 1, air: 2, navy: 4 };
const TROOP_SIZE = [0.04, 0.08, 0.15];
const conscriptN = (S, X, i) => Math.max(1, Math.round((DEF[X].pop + (S.actors[X].popX || 0)) * 1000 * CONSCRIPT[i] * (sc().conscriptK || 1)));
const persCap = (S, X) => persCapAt(S, X, S.actors[X].mob); // 见 08b_industry：按历史动员率与可动员人口
const soldierCost = (S, X) => clamp(S.actors[X].gdp / Math.max(0.1, DEF[X].pop) * 0.0009 + 0.004, 0.004, 0.12);
const trainTurns = (S, X) => (S.actors[X].mob >= 2 ? 1 : 2);
const inTraining = (S, X) => (S.actors[X].train || []).reduce((s, t) => s + t.n, 0);
const procCost = (S, X, tier) => S.actors[X].gdp * (PROC_TIER[tier] ?? PROC_TIER[1]) / 100;
/* 规则 v2：征兵人数（p.n，千人）与订单金额（p.amt，十亿美元）可以自己填；没填时按三档 */
const consN = (S, X, p) => (RULES2 && p && +p.n > 0 ? clamp(Math.round(+p.n), 1, Math.max(1, Math.round((DEF[X].pop + (S.actors[X].popX || 0)) * 1000 * 0.05))) : conscriptN(S, X, +(p && p.size) || 0));
const procAmt = (S, X, p) => (RULES2 && p && +p.amt > 0 ? clamp(+p.amt, S.actors[X].gdp * 0.0001, S.actors[X].gdp * 0.03) : procCost(S, X, +(p && p.tier) || 0));
const procLead = (S, X, br) => Math.max(1, (PROC_LEAD[br] || 2) - (S.actors[X].mob >= 2 ? 1 : 0));
const procPts = (S, X, cost) => cost * DEF[X].ppp * 0.95 * (S.actors[X].mob >= 2 ? 1.1 : 1);
function procUnits(S, X, br, pts) { const k = S.actors[X].k || {}; return br === 'land' ? pts * (k.t || 0) : br === 'air' ? pts * (k.a || 0) : pts * (k.s || 0); }
const procQueued = S => S.queue.filter(q => q.type === 'procure').reduce((s, q) => s + (q.cost || 0), 0);
function conscriptPubHit(S, X, n) { const d = DEF[X]; const home = S.fronts.some(f => boss(S, f.target) === X); const k = d.gov === 'dem' ? 1 : d.gov === 'hyb' ? 0.6 : 0.35; return home ? 0 : n / (d.pop * 1000) * 1800 * k; }

/* 每回合：受训新兵入列、订单交付、盟军请求落实 */
function armyTurn(S, R) {
  for (const X of IDS) {
    const x = S.actors[X]; if (!x.train) x.train = []; if (!x.orders) x.orders = [];
    if (!indep(S, X)) { x.train = []; x.orders = []; continue; }
    for (const t of x.train.filter(t => t.eta <= S.turn)) {
      const per = x.land / Math.max(1, x.pers || 1);
      x.pers = (x.pers || 0) + t.n; x.land += t.n * per * 0.45;
      if (isHuman(S, X)) RP(S, X, R).mil.push({ msg: M('m.trained', { n: fmtK(t.n) }), tone: 'good' });
    }
    x.train = x.train.filter(t => t.eta > S.turn);
    for (const o of x.orders.filter(o => o.eta <= S.turn)) {
      x[o.br] += o.pts;
      if (isHuman(S, X)) RP(S, X, R).mil.push({ msg: M('m.delivered', { k: M('br.' + o.br), n: Math.round(procUnits(S, X, o.br, o.pts)), u: M('unit.' + o.br) }), tone: 'good' });
    }
    x.orders = x.orders.filter(o => o.eta > S.turn);
    // AI 的兵员规模随陆军实力变化（战时扩军、战后复员）；玩家的兵员由征兵决定
    if (!isHuman(S, X) && x.ppl > 0) {
      let tgt = x.land * x.ppl * (1 + 0.12 * x.mob);
      if (sc().noIdlePeace && x.mob >= 2 && enemies(S, X).length) tgt = Math.max(tgt, persCap(S, X) * (x.mob >= 3 ? 0.85 : 0.6)); // 总体战：按动员能力征召（步兵为主的军队）
      tgt = Math.min(tgt, Math.max(persCap(S, X), Math.min(x.pers || 0, persCapAt(S, X, 3))));
      const demob = sc().demob && !enemies(S, X).length; // 战后复员（如1945年后）：和平时期兵员较快地降到平时规模（动员等级越高保留越多）
      if (demob) tgt = Math.min(tgt, persCapAt(S, X, 0) * sc().demob * (1 + 0.5 * x.mob));
      x.pers = Math.max(0, (x.pers || 0) + (tgt - (x.pers || 0)) * (x.mob >= 2 || demob ? 0.25 : 0.15));
      if (demob) { const landTgt = x.pers / (x.ppl * (1 + 0.12 * x.mob)); if (x.land > landTgt * 1.1) { const cut = (x.land - landTgt) / x.land * 0.2; x.land *= 1 - cut; x.air *= 1 - cut; x.navy *= 1 - cut * 0.5; } } // 复员时装备也随之封存、报废
    }
  }
}
const fmtK = n => ({ pers: n }); // 千人（界面按语言格式化）

/* ---------- 盟友派兵 ---------- */
function reqDestOptions(S, Y) {
  const P = S.player, out = [];
  for (const f of S.fronts) if (f.att === P) out.push(f.id);
  for (const f of S.fronts) if (boss(S, f.target) === P || (f.target !== P && (isAlly(S, P, f.target) || isPartner(S, P, f.target)) && f.att !== P)) if (!out.includes('D:' + f.target)) out.push('D:' + f.target);
  const locs = new Set([P].concat(stations(S, P)).concat(controlled(S, P)));
  for (const k of (S.coreC || [])) if (k.v === P && k.status === 'active' && k.loc) locs.add(k.loc);
  for (const L of locs) if (L !== Y && S.actors[L] && !out.includes('D:' + L)) out.push('D:' + L);
  return out.filter(d => !Y || reqDestOk(S, Y, d));
}
function reqDest(S, d) { if (!d) return null; if (d.startsWith('F')) { const f = S.fronts.find(z => z.id === d && z.att === S.player); return f ? { front: f, loc: f.from, enemy: f.def } : null; } const L = d.startsWith('D:') ? d.slice(2) : d; if (!S.actors[L]) return null; const f = S.fronts.find(z => z.target === L && z.att !== S.player && (boss(S, L) === S.player || isAlly(S, S.player, L) || isPartner(S, S.player, L))); const k = (S.coreC || []).find(z => z.v === S.player && z.status === 'active' && z.loc === L); return { loc: L, enemy: f ? f.att : k && (atWar(S, k.o, S.player) || k.lvl >= 3) ? k.o : null, threat: k ? k.o : null }; }
function reqDestOk(S, Y, d) { const r = reqDest(S, d); if (!r) return false; if (r.front) return canStation(S, Y, r.front.from) || stagingOptions(S, Y, r.front.target).length > 0; return canStation(S, Y, r.loc); }
function troopScore(S, Y, r, size) {
  const P = S.player, y = S.actors[Y];
  let s = -0.25 + y.loyal * 0.6 + rel(S, Y, P) / 220 + (isAlly(S, Y, P) ? 0.35 : isPartner(S, Y, P) ? 0.1 : 0) + (y.overlord === P ? 0.5 : 0) + (S.favor[Y] || 0) / 200 - (S.grudge[Y] || 0) / 150 + (S.rep.trust - 55) / 200;
  const why = [];
  const E = r.enemy || r.threat;
  if (E) {
    const rY = rel(S, Y, E); if (rY < -40) { s += 0.25; why.push('hate'); } else if (rY > 15) { s -= 0.45; why.push('friend'); }
    const pr = (power(S, E) + 1) / (power(S, Y) + 1); s -= Math.min(0.5, pr * 0.05) * (1 - y.risk); if (pr > 3) why.push('fear');
    if (S.actors[E].nukes >= 100 && y.nukes < 100) { s -= 0.2; why.push('nuke'); }
    if (enemies(S, Y).length && !atWar(S, Y, E)) { s -= 0.2; why.push('busy'); }
    if (!r.enemy) s += 0.1;
  } else s += 0.2;
  s -= [0, 0.08, 0.2][size] || 0;
  if (threatTo(S, Y).t > 1.2) { s -= 0.25; why.push('home'); }
  if (dist(Y, r.loc) > 6000) { s -= 0.08; why.push('far'); }
  if (S.rep.trust < 40) why.push('trust');
  if (y.loyal > 0.7 || isAlly(S, Y, P)) why.unshift('loyal');
  return { s, why };
}
function troopPreview(S, Y, d, size) { const r = reqDest(S, d); if (!r) return null; const { s } = troopScore(S, Y, r, size); return clamp(sig(s * 4), 0.02, 0.97); }
/* 执行派兵：加入玩家战线（联合指挥）或协防某地 */
function sendTroops(S, Y, d, sh, R, viaDeal) {
  const P = S.player, r = reqDest(S, d); if (!r || !indep(S, Y)) return null;
  const y = S.actors[Y]; const v0 = [sh, r.front && r.front.kind !== 'amph' ? sh * 0.3 : sh, sh];
  const avail = vsub0(freeV(S, Y, Y), [0.2, 0.2, 0.2]); let v = vmin(v0, avail);
  if (vmax(v) < 0.01) return M('rq.nofree', { a: Y });
  if (r.front) {
    const f = r.front;
    if (!atWar(S, Y, f.def)) { declareWar(S, Y, f.def); logEvent(S, 'war', M('m.war', { a: Y, b: f.def }), 'warn', [Y, f.def]); }
    if (canStation(S, Y, f.from)) {
      const mv = orderMove(S, Y, Y, f.from, v); if (!(mv > 0)) return M('rq.nomove', { a: Y });
      f.co = f.co || []; const ex = f.co.find(k => k.id === Y); if (ex) ex.v = vadd(ex.v, v); else f.co.push({ id: Y, v: v.slice(), since: S.turn });
      y.mob = Math.max(y.mob, 1);
      return M('rq.front', { a: Y, t: f.target, s: mv, n: transitTurns(Y, f.from), u: unitsTxt(S, Y, v) });
    }
    const op = createOp(S, Y, f.target, v, false); if (op.op) { op.op.legit = true; return M('rq.own_op', { a: Y, t: f.target }); }
    return M('rq.nomove', { a: Y });
  }
  if (!canStation(S, Y, r.loc)) return M('rq.nostation', { a: Y, l: r.loc });
  const mv = orderMove(S, Y, Y, r.loc, v); if (!(mv > 0)) return M('rq.nomove', { a: Y });
  if (r.enemy && !atWar(S, Y, r.enemy)) { declareWar(S, Y, r.enemy); logEvent(S, 'war', M('m.war', { a: Y, b: r.enemy }), 'warn', [Y, r.enemy]); }
  (S.reqs = S.reqs || []).push({ y: Y, loc: r.loc, v, turn: S.turn });
  return M('rq.defend', { a: Y, l: r.loc, s: mv, n: transitTurns(Y, r.loc), u: unitsTxt(S, Y, v) });
}
function unitsTxt(S, X, v) { const u = unitsV(S, X, v); return M('rq.units', { p: fmtK(u.pers), t: Math.round(u.tanks), a: Math.round(u.air), s: Math.round(u.ships) }); }
function allyMobilize(S, Y, lvl, pct) {
  const y = S.actors[Y]; const L = clamp(lvl | 0, 0, 2);
  if (L > y.mob) y.mob = L;
  y.milPct = clamp(y.milPct + (pct || 0.6), 0.3, 30); y.flags.buildupTo = S.turn + 8;
  return M('rq.mob_ok', { a: Y, k: M('mob.' + y.mob), n: +y.milPct.toFixed(1) });
}

/* ---------- 玩家的部署在对手眼中 ---------- */
function deployEvent(S, to, v, R) {
  const P = S.player;
  for (const c of coreList()) {
    if (c.type !== 'forces_in' || c.o === P || !indep(S, c.o) || !coreLocs(c).includes(to) || isAlly(S, c.o, P)) continue;
    pushEv(S, { type: 'deploy_core', actor: P, target: c.o, sev: 15 + 15 * c.w, third: 4, loc: to });
  }
  for (const X of IDS) if (X !== P && indep(S, X) && rel(S, X, P) < -35 && (to === X || landAdj(to, X) || dist(to, X) <= 700) && !coreList().some(c => c.o === X && c.type === 'forces_in' && coreLocs(c).includes(to))) pushEv(S, { type: 'deploy', actor: P, target: X, sev: 10, loc: to });
}

/* ---------- 护航破封锁 ---------- */
function escortBattle(S, me, t, R) {
  const bl = S.blockades.filter(b => b.target === t && b.by !== me); if (!bl.length) return null;
  const out = [];
  for (const b of bl) {
    const X = b.by;
    const As = forcesNear(S, me, t, 1200, 'navy') + 0.5 * forcesNear(S, me, t, 1200, 'air') + 1;
    const Bs = forcesNear(S, X, t, 1200, 'navy') + 0.4 * forcesNear(S, X, t, 1200, 'air') + 1;
    const r = As / Bs * (0.8 + 0.4 * rnd(S));
    const pre = snapUnits(S, [me, X]);
    attritNear(S, me, t, 1200, [0, 0.03 + 0.05 / (1 + r), 0.02]); attritNear(S, X, t, 1200, [0, 0.03 + 0.05 * r / (1 + r), 0.02]);
    const lm = diffUnits(S, pre, [me]), lx = diffUnits(S, pre, [X]);
    addRel(S, me, X, -25); S.tension = clamp(S.tension + 6, 0, 100);
    for (const k of (S.coreC || [])) if (k.o === X && k.status === 'active' && (k.loc === t || coreTheater(S, k) === t)) k.provoked = true;
    pushEv(S, { type: 'clash', actor: me, target: X, sev: 45, third: 10 });
    if (me === S.player) grantCB(S, X, 'incident', 6);
    if (r > 1) { S.blockades = S.blockades.filter(z => z !== b); out.push(M('r.escort.ok', { b: X, t, s: Math.round(lm[3]), z: Math.round(lx[3]) })); }
    else out.push(M('r.escort.fail', { b: X, t, s: Math.round(lm[3]), z: Math.round(lx[3]) }));
  }
  return out;
}
