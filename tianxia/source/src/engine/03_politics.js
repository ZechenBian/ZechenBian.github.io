/* ===================== 政治：派系、选举、开战理由、信誉、记忆、承诺、威胁感知、红线 ===================== */
function initPolitics(S) {
  const P = S.player, d = DEF[P];
  const base = { dem: [52, 55, 50], hyb: [58, 55, 52], aut: [62, 52, 55] }[d.gov];
  S.pol = { fac: { mil: base[0] + rn(S) * 3, biz: base[1] + rn(S) * 3, pub: base[2] + rn(S) * 3 }, next: null, every: 16, results: [], apPen: 0, authCool: 0, coupRisk: 0, recentWin: 0, recentLoss: 0, failed: 0, tradeUp: 0 };
  if (d.gov === 'dem') S.pol.next = (sc().elections || {})[P] ?? (3 + Math.floor(rnd(S) * 12));
  else if (d.gov === 'hyb') { S.pol.every = 20; S.pol.next = 5 + Math.floor(rnd(S) * 14); }
  if (P === 'USA') S.pol.fac.pub = 48;
  if (P === 'UKR') { S.pol.fac.pub = 62; S.pol.fac.mil = 64; }
  if (P === 'RUS') S.pol.fac.mil = 58;
  S.rep = { trust: 60, aggr: (sc().aggr0 || {})[P] ?? 20, cred: 60, nuke: false };
  S.pol.facBase = Object.assign({}, S.pol.fac);
  S.pol.base = { pain: sanctionPain(S), off: S.fronts.filter(f => f.att === P).length, def: S.fronts.filter(f => boss(S, f.target) === P).length, mob: S.actors[P].mob };
}
function sanctionPain(S) { const P = S.player; let pain = 0; for (const s of S.sanctions) { if (s.to === P) pain += s.level * exposure(S, P, s.from) * 10; if (s.from === P && s.kind !== 'tech') pain += s.level * exposure(S, P, s.to) * 4; } return pain; }
function facAdd(S, d) { if (!S.pol) return; for (const k in d) if (k in S.pol.fac) S.pol.fac[k] = clamp(S.pol.fac[k] + d[k], 0, 100); }
function repAdd(S, d) { for (const k in d) if (k in S.rep && k !== 'nuke') S.rep[k] = clamp(S.rep[k] + d[k], 0, 100); }
function voteShare(S) {
  const F = S.pol.fac, x = S.actors[S.player], d = DEF[S.player];
  const g = (x.gAvg ?? x.lastG) * 4 - d.growth;
  let v = 52 + (F.pub - 50) * 0.6 + (F.biz - 50) * 0.2 + clamp(g * 2, -6, 5) + (x.stab - 50) * 0.08;
  if (d.gov === 'hyb') v += 12;
  return v;
}
const electionOdds = S => sig((voteShare(S) - 50) / 3);
function coupRisk(S) { const F = S.pol.fac, x = S.actors[S.player]; if (DEF[S.player].gov === 'dem' || SHD(S, S.player) || F.mil >= 35 || x.stab >= 45) return 0; return clamp(((35 - F.mil) / 35) * ((45 - x.stab) / 45) * 0.35 + (DEF[S.player].gov === 'aut' ? 0.01 : 0), 0, 0.3); }
function politicsTurn(S, R) {
  const P = S.player, x = S.actors[P], d = DEF[P], F = S.pol.fac;
  const g = (x.gAvg ?? x.lastG) * 4 - d.growth;
  const off = S.fronts.filter(f => f.att === P), losing = off.filter(f => f.last < 0).length;
  const defF = S.fronts.filter(f => boss(S, f.target) === P);
  const fresh = defF.some(f => f.turns <= 2);
  const unrest = controlled(S, P).filter(T => T !== P && !S.actors[T].integrated).reduce((s, T) => s + S.actors[T].resist / 100, 0);
  const B = S.pol.base || { pain: 0, off: 0, def: 0, mob: 0 };
  const pain = Math.max(0, sanctionPain(S) - B.pain);
  const offX = Math.max(0, off.length - B.off), defX = Math.max(0, defF.length - B.def);
  const T0 = S.pol.facBase || { mil: 50, biz: 50, pub: 50 };
  const baseMil = d.milex / d.gdp * 100;
  const tgPub = T0.pub + clamp(g * 5, -15, 8) - 8 * offX - 2.5 * Math.min(off.length, B.off) - 6 * losing - 4 * Math.max(0, x.mob - B.mob) - 10 * unrest + (fresh ? 10 : 0) - (defF.length && !fresh ? 3 : 0) + clamp((x.stab - d.stab) * 0.2, -8, 5);
  const tgMil = T0.mil + clamp((x.milPct - baseMil) * 4, -15, 15) + (x.mob >= 2 ? 3 : 0);
  const tgBiz = T0.biz + clamp(g * 6, -15, 10) - clamp(pain * 4, 0, 25) - 4 * (offX + defX) + (x.treasury < -x.gdp * 0.06 ? -6 : 0);
  F.pub += (tgPub - F.pub) * 0.15 + rn(S) * 0.8;
  F.mil += (tgMil - F.mil) * 0.15 + 5 * S.pol.recentWin - 7 * S.pol.recentLoss - 4 * S.pol.failed + rn(S) * 0.6;
  F.biz += (tgBiz - F.biz) * 0.15 + S.pol.tradeUp * 3 + rn(S) * 0.6;
  for (const k in F) F[k] = clamp(F[k], 0, 100);
  S.pol.recentWin = 0; S.pol.recentLoss = 0; S.pol.failed = 0; S.pol.tradeUp = 0;
  for (const [X, c] of Object.entries(S.cb)) {
    if (c.until < S.turn) { delete S.cb[X]; continue; }
    if (c.fab && chance(S, 0.06)) { delete S.cb[X]; repAdd(S, { trust: -20, aggr: 15 }); facAdd(S, { pub: -8 }); for (const Y of IDS) if (Y !== P) addRel(S, P, Y, -5); remember(S, X, M('mem.fabricate'), -25); const msg = M('pol.fab_exposed', { t: X }); R.pol.push({ msg, tone: 'bad', big: true }); logEvent(S, 'politics', msg, 'bad', [P, X]); }
  }
  if (S.pol.next !== null) {
    const left = S.pol.next - S.turn;
    if (left === 2 || left === 1) R.pol.push({ msg: M('pol.elect_soon', { n: left, s: { pct: electionOdds(S) } }), tone: 'warn' });
    if (left <= 0) runElection(S, R);
  }
  if (d.gov !== 'dem') {
    const risk = coupRisk(S); S.pol.coupRisk = risk;
    if (risk > 0.04) R.pol.push({ msg: M('pol.coup_warn', { s: { pct: risk } }), tone: 'bad' });
    if (risk > 0 && chance(S, risk)) runCoup(S, R);
  }
  if (S.pol.apPen > 0) S.pol.apPen--;
  if (S.pol.authCool > 0) S.pol.authCool--;
  // 信誉漂移
  const a0 = (sc().aggr0 || {})[P] ?? 20;
  S.rep.trust += (65 - S.rep.trust) * (S.rep.trust < 65 ? 0.02 : 0);
  S.rep.aggr += (a0 - S.rep.aggr) * 0.04; S.rep.cred += (60 - S.rep.cred) * 0.02;
  // 军控承诺检查
  for (const c of S.commits.filter(c => c.type === 'armsctl')) if (x.milPct > c.cap + 0.05) { breakCommit(S, 'armsctl', c.with, R); removeTreaty(S, 'armsctl', P, c.with); }
  S.commits = S.commits.filter(c => (c.until === null || c.until >= S.turn) && (c.type !== 'no_attack' || c.src !== 'nap' || hasTreaty(S, P, c.with, 'nap')));
}
function runElection(S, R) {
  const v = voteShare(S) + rn(S) * 4, win = v > 50;
  S.pol.results.push({ turn: S.turn, v: +v.toFixed(1), win });
  S.pol.next = S.turn + S.pol.every;
  const msg = M(win ? 'pol.elect_win' : 'pol.elect_lose', { n: +v.toFixed(1) });
  logEvent(S, 'politics', msg, win ? 'good' : 'bad', [S.player]);
  if (win) { facAdd(S, { pub: 5 }); S.actors[S.player].stab = clamp(S.actors[S.player].stab + 3, 0, 100); R.pol.push({ msg, tone: 'good', big: true }); }
  else if (S.strict) S.over = { result: 'lose', reason: M('over.election', { n: +v.toFixed(1) }) };
  else govChange(S, R, 'election', msg);
}
function runCoup(S, R) {
  if (S.strict) { S.over = { result: 'lose', reason: M('over.coup') }; return; }
  govChange(S, R, 'coup', M('pol.coup_std'));
}
function govChange(S, R, kind, msg) {
  const P = S.player, x = S.actors[P];
  x.stab = clamp(x.stab - 8, 0, 100);
  if (kind === 'election') {
    S.pol.fac = { mil: 50, biz: 55, pub: 60 }; S.pol.authCool = 4;
    const halted = S.fronts.filter(f => f.att === P && f.progress < 40);
    S.fronts = S.fronts.filter(f => !halted.includes(f));
    S.ops = S.ops.filter(o => o.owner !== P);
    S.pol.apPen = 2;
  } else {
    S.pol.fac.mil = 70; S.pol.fac.pub = clamp(S.pol.fac.pub - 10, 0, 100); x.mob = Math.max(x.mob, 1); S.pol.apPen = 3;
    repAdd(S, { trust: -5 });
    for (const Y of IDS) if (Y !== P && DEF[Y].gov === 'dem') addRel(S, P, Y, -6);
  }
  R.pol.push({ msg, tone: 'bad', big: true });
  logEvent(S, 'politics', msg, 'bad', [P]);
}
function warAuth(S, T) {
  const d = DEF[S.player]; if (d.gov === 'aut') return 1;
  const F = S.pol.fac, D = boss(S, T), P = S.player;
  if (atWar(S, P, D)) return 1;
  let z = (F.pub - 45) / 12 + (F.mil - 50) / 40 + (legitCB(S, D) ? 2.2 : 0) - 0.6 * S.fronts.filter(f => f.att === P).length - (S.pol.authCool > 0 ? 1.2 : 0);
  if (S.ops.some(o => o.owner === D && boss(S, o.target) === P && o.det.includes(P))) z += 1.5;
  if (d.gov === 'hyb') z += 1.0;
  return clamp(sig(z), 0.02, 0.99);
}

/* ---------- 开战理由 ---------- */
function grantCB(S, X, kind, turns, fab) { if (!X || X === S.player || !S.actors[X]) return; const c = S.cb[X]; if (c && !c.fab && c.until >= S.turn + turns) return; S.cb[X] = { kind, until: S.turn + turns, fab: !!fab, since: S.turn }; }
function legitCB(S, X) { const c = S.cb[X]; return c && c.until >= S.turn ? c : null; }

/* ---------- 记忆与承诺 ---------- */
function remember(S, X, msg, w) {
  if (!S.actors[X] || X === S.player) return;
  const m = S.mem[X] || (S.mem[X] = []);
  m.push({ t: S.turn, msg, w });
  if (m.length > 12) m.shift();
  if (w < 0) S.grudge[X] = clamp((S.grudge[X] || 0) - w, 0, 150); else S.favor[X] = clamp((S.favor[X] || 0) + w, 0, 100);
}
function addCommit(S, type, X, turns, src, extra) {
  if (!X || X === S.player) return;
  S.commits = S.commits.filter(c => !(c.type === type && c.with === X));
  S.commits.push(Object.assign({ id: 'C' + S.seq++, type, with: X, until: turns ? S.turn + turns : null, since: S.turn, src }, extra || {}));
}
function activeCommit(S, type, X) { return S.commits.find(c => c.type === type && c.with === X && (c.until === null || c.until >= S.turn)); }
function breakCommit(S, type, X, R) {
  const c = activeCommit(S, type, X); if (!c) return false;
  S.commits = S.commits.filter(z => z !== c);
  const heavy = type === 'no_attack';
  repAdd(S, { trust: heavy ? -25 : -10, aggr: heavy ? 8 : 0 });
  for (const Y of IDS) if (Y !== S.player && indep(S, Y)) addRel(S, S.player, Y, heavy ? -4 : -1);
  remember(S, X, M('mem.betray'), heavy ? -40 : -15);
  const msg = M('r.commit_broken', { t: X, k: M('cm.' + type) });
  (R.actions || R.pol).push({ msg, tone: 'bad' });
  logEvent(S, 'politics', msg, 'bad', [S.player, X]);
  return true;
}
// 玩家行动对各国记忆、信誉、承诺的影响
const MEMW = { summit: 5, trade: 8, alliance: 15, nap: 6, access: 3, armsctl: 8, condemn: -6, warn: -8, vassal: -15, peace: 10, break: -20, lift: 8, tariff: -6, techban: -10, finsanction: -15, energy: -12, aid: 10, loan: 6, blockade: -30, exercise: -5, armsaid: 10, strike: -30, threat: -12, nuke: -60, volunteers_to: -15 };
function afterPlayerAction(S, id, t, p, R, detected) {
  const P = S.player; if (!t || t === P || !S.actors[t]) return;
  let w = MEMW[id];
  if (id === 'sanction') w = -8 * (+p.level || 1);
  if (['cyber', 'propaganda', 'opposition', 'coup', 'sabotage', 'espionage', 'fund_resist', 'incite'].includes(id)) { if (!detected) return; w = { cyber: -12, propaganda: -8, opposition: -15, coup: -35, sabotage: -15, espionage: -10, fund_resist: -12, incite: -15 }[id]; }
  if (w === undefined) return;
  remember(S, t, M('mem.' + id), w);
  if (['sanction', 'tariff', 'techban', 'finsanction', 'energy'].includes(id)) breakCommit(S, 'no_sanction', t, R);
  if (['strike', 'blockade'].includes(id)) afterPlayerHostile(S, boss(S, t), id, legitCB(S, boss(S, t)), R);
}
function afterPlayerHostile(S, D, kind, legit, R) {
  const P = S.player;
  breakCommit(S, 'no_attack', D, R);
  const g = { invade: legit ? 5 : 15, strike: legit ? 2 : 6, blockade: legit ? 3 : 8 }[kind] || 4;
  repAdd(S, { aggr: g });
  if (kind === 'invade') { remember(S, D, M('mem.invade'), -50); for (const c of IDS) if (c !== D && c !== P && (isAlly(S, c, D) || isPartner(S, c, D))) remember(S, c, M('mem.attack_ally', { t: D }), -18); }
  if (!legit) for (const c of IDS) if (c !== P && c !== D && indep(S, c) && DEF[c].gov === 'dem') addRel(S, P, c, -2);
}

/* ---------- 威胁感知 ---------- */
function allyShield(S, X, P) { let s = 0; for (const c of IDS) if (c !== X && c !== P && indep(S, c) && isAlly(S, c, X)) s += power(S, c) * 0.4 * S.actors[c].loyal; return s; }
function threatTarget(S, X) {
  const P = S.player, pp = blocPower(S, P), xp = S.actors[P];
  const h = S.history; const growth = h.length > 8 ? h[h.length - 1].mil / Math.max(1, h[h.length - 9].mil) - 1 : 0;
  const cap = clamp(Math.log2(Math.max(0.05, pp / Math.max(1, blocPower(S, X) + allyShield(S, X, P)))) * 12 + 30, 0, 60);
  let fn = 0; for (const L in xp.forces) if (L !== P && (L === X || dist(L, X) <= 1500)) fn += share(S, P, L);
  const prox = landAdj(P, X) ? 1 : dist(P, X) < 1500 ? 0.85 : fn > 0.03 ? 0.75 : dist(P, X) < 4000 ? 0.55 : 0.35;
  const r = rel(S, X, P), hostility = clamp(0.5 - r / 100, 0.08, 1.2);
  const recent = (S.mem[X] || []).filter(m => m.t >= S.turn - 8 && m.w < 0).reduce((s, m) => s - m.w, 0);
  const massing = S.ops.some(o => o.owner === P && o.det.includes(X) && (boss(S, o.target) === X || isAlly(S, X, boss(S, o.target)))) ? 15 : 0;
  const intent = S.rep.aggr * 0.35 * (0.4 + hostility * 0.6) + Math.min(40, recent * 0.5) + clamp(growth * 60, 0, 12) + (xp.nukeProg > 30 && !xp.nukes ? 8 : 0) + Math.min(15, fn * 60) + (S.rep.nuke ? 25 : 0) + massing + (xp.mob >= 2 && prox >= 0.85 ? 5 : 0);
  let reduce = Math.max(0, r - 20) * 0.3 + exposure(S, X, P) * 30 + (hasTreaty(S, X, P, 'armsctl') ? 15 : 0) + ((S.cbmUntil || -1) >= S.turn && dist(P, X) < 3000 ? 8 : 0) + (hasTreaty(S, X, P, 'nap') ? 6 : 0);
  if (isAlly(S, X, P)) reduce += 25;
  if (atWar(S, X, P)) reduce -= 30;
  return clamp(cap * prox * hostility + intent - reduce, 0, 100);
}
function threatTurn(S, R, init) {
  for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X)) { delete S.threat[X]; continue; }
    const tg = threatTarget(S, X); const cur = S.threat[X] ?? tg;
    const nv = init ? tg : cur + (tg - cur) * 0.35;
    if (!init && R && cur < 60 && nv >= 60) R.intel.push({ msg: M('in.threat_hi', { a: X }), tone: 'warn', about: [X] });
    S.threat[X] = nv;
  }
}

/* ---------- 红线 ---------- */
function redLinesOf(S, X) { const AG = sc().agenda || {}; const base = (AG[X] && AG[X].red) || []; const pl = S.actors[X].plan; const extra = (pl && pl.until >= S.turn && pl.red) || []; const seen = new Set(); return base.concat(extra).filter(r => { if (!r || r.t === S.player || r.loc === S.player) return false; const k = r.type + ':' + (r.t || r.loc || ''); if (seen.has(k)) return false; seen.add(k); return true; }); }
function redLineCrossed(S, X, r) {
  const P = S.player, evs = S.turnEvents || [];
  const hit = t => evs.some(e => e.actor === P && ['strike', 'invade', 'blockade', 'nuke'].includes(e.type) && (e.target === t || boss(S, e.target) === t));
  switch (r.type) {
    case 'attack': return !!r.t && (hit(r.t) || S.fronts.some(f => f.att === P && (f.target === r.t || boss(S, f.target) === r.t)));
    case 'attack_ally': return S.fronts.some(f => f.att === P && (isAlly(S, X, f.def) || isAlly(S, X, f.target)));
    case 'forces_in': return !!r.loc && share(S, P, r.loc) >= 0.02;
    case 'alliance_with': return !!r.t && hasTreaty(S, P, r.t, 'alliance');
    case 'nuke_use': return !!S.rep.nuke;
    case 'nuke_program': return S.actors[P].nukeProg >= 70 || (S.actors[P].nukes > 0 && DEF[P].nukes === 0);
    case 'blockade': return !!r.t && S.blockades.some(b => b.by === P && b.target === r.t);
    case 'annex': return !!r.t && S.actors[r.t].ctrl === P;
  }
  return false;
}
function redLineTurn(S, R) {
  for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X)) continue;
    for (const r of redLinesOf(S, X)) {
      const key = X + ':' + r.type + ':' + (r.t || r.loc || '');
      const crossed = redLineCrossed(S, X, r);
      if (crossed && S.crossed[key] === undefined) {
        S.crossed[key] = S.turn;
        addRel(S, X, S.player, -20); S.threat[X] = clamp((S.threat[X] || 0) + 25, 0, 100);
        S.actors[X].flags.redline = { turn: S.turn, r };
        remember(S, X, M('mem.redline', { x: M('rl.' + r.type, { t: r.t, l: r.loc }) }), -25);
        R.intel.push({ msg: M('in.redline', { a: X, x: M('rl.' + r.type, { t: r.t, l: r.loc }) }), tone: 'bad', about: [X] });
        pushEv(S, { type: 'redline', actor: S.player, target: X, sev: 60, rl: r });
      } else if (!crossed && S.crossed[key] !== undefined) delete S.crossed[key];
    }
  }
}

/* ---------- 公开警告的兑现 ---------- */
function warningsTurn(S, R) {
  for (const w of S.warnings.slice()) {
    const attacked = S.fronts.some(f => f.att === w.to && (f.target === w.about || boss(S, f.target) === w.about)) || (S.turnEvents || []).some(e => e.actor === w.to && (e.target === w.about) && ['invade', 'strike', 'blockade'].includes(e.type));
    if (attacked && w.triggered === undefined) { w.triggered = S.turn; if (isHuman(S, w.by)) RP(S, w.by, R).intel.push({ msg: M('in.warn_trig', { a: w.to, t: w.about, n: 2 }), tone: 'bad', about: [w.to] }); }
    if (w.triggered !== undefined && S.turn - w.triggered >= 2) {
      const kept = w.conseq === 'sanction' ? sanctionLevel(S, w.by, w.to) >= 2 : atWar(S, w.by, w.to);
      if (isHuman(S, w.by)) withSeat(S, w.by, () => { repAdd(S, kept ? { cred: 10, trust: 3 } : { cred: -20, trust: -8 }); RP(S, w.by, R).pol.push({ msg: M(kept ? 'pol.warn_kept' : 'pol.warn_broken', { a: w.to, t: w.about }), tone: kept ? 'good' : 'bad' }); });
      else S.actors[w.by].cred = clamp((S.actors[w.by].cred ?? 60) + (kept ? 10 : -20), 0, 100);
      S.warnings = S.warnings.filter(z => z !== w);
    } else if (w.triggered === undefined && w.until < S.turn) S.warnings = S.warnings.filter(z => z !== w);
  }
}
