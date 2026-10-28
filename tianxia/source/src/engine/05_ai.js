/* ===================== AI：战略规划、主动行动、通牒、危机、反应 ===================== */
function aiAP(S, X) { const g = S.actors[X].gdp; return 1 + (g >= 1500 ? 1 : 0) + (g >= 8000 ? 1 : 0); }
function stanceOf(S, X, Y) { const pl = S.actors[X].plan; if (pl && pl.until >= S.turn && pl.stance && pl.stance[Y]) return pl.stance[Y]; const a = (sc().agenda || {})[X]; return (a && a.stance && a.stance[Y]) || null; }
const SB = { contain: [0.25, -0.3], coerce: [0.3, -0.3], attack: [0.4, -0.5], court: [-0.4, 0.3], support: [-0.5, 0.35], hedge: [-0.05, 0.05] };
const hostB = (S, X, Y) => (SB[stanceOf(S, X, Y)] || [0, 0])[0];
const friendB = (S, X, Y) => (SB[stanceOf(S, X, Y)] || [0, 0])[1];
function planBoost(S, X, type, target) { const pl = S.actors[X].plan; if (!pl || pl.until < S.turn || !pl.moves) return 0; const m = pl.moves.find(m => m.type === type && (!m.target || m.target === target) && !m.done); return m ? 0.25 + 0.12 * (m.priority || 1) : 0; }
function markPlanDone(S, X, type, target) { const pl = S.actors[X].plan; if (!pl || !pl.moves) return; const m = pl.moves.find(m => m.type === type && (!m.target || m.target === target) && !m.done); if (m) m.done = true; }
const diffMult = S => (S.diff === 'hard' ? 1.2 : S.diff === 'easy' ? 0.75 : 1);

/* ---------- 对玩家的最后通牒 ---------- */
function demandOptions(S, X) {
  const P = S.player, out = [];
  const sl = Math.max(sanctionLevel(S, P, X, 'econ'), sanctionLevel(S, P, X, 'fin') ? 3 : 0, sanctionLevel(S, P, X, 'energy') ? 2 : 0, sanctionLevel(S, P, X, 'tech') ? 2 : 0);
  if (sl >= 2) out.push({ demand: 'lift', g: (30 + 10 * sl) * clamp(exposure(S, X, P) * 8, 0.2, 1) });
  for (const L of stations(S, P)) { if (L === P) continue; const sh = share(S, P, L); if (sh >= 0.03 && (near(L, X, 600) || isAlly(S, X, L) || redLinesOf(S, X).some(r => r.type === 'forces_in' && r.loc === L))) out.push({ demand: 'withdraw', loc: L, g: Math.min(60, 25 + sh * 150) }); }
  for (const t of S.treaties) if (t.type === 'alliance' && (t.a === P || t.b === P)) { const Y = t.a === P ? t.b : t.a; if (rel(S, X, Y) < -40 && dist(X, Y) < 3000) out.push({ demand: 'break_alliance', with: Y, g: 35 }); }
  const x = S.actors[P];
  if (x.nukeProg > 30 && !x.nukes && ((x.flags.nukeUp ?? -99) >= S.turn - 8 || x.nukeProg >= 60)) out.push({ demand: 'stop_nuke', g: 40 });
  for (const Y of realm(S, P)) if (Y !== P && !PRV(S, Y) && (rel(S, X, Y) > 40 || isAlly(S, X, Y))) out.push({ demand: 'release', t: Y, g: 45 });
  for (const Y of enemies(S, P)) if (isAlly(S, X, Y) || isPartner(S, X, Y) || rel(S, X, Y) >= 50) out.push({ demand: 'end_war', t: Y, g: 45 });
  if (S.actors[X].hawk > 0.6 && powerRatio(S, X, P) >= 2.5 && near(X, P, 1500)) out.push({ demand: 'pay', g: 30 });
  return out;
}
function pickConseq(S, X) {
  const P = S.player, x = S.actors[X];
  const opts = stagingOptions(S, X, P);
  if (x.hawk > 0.55 && opts.length && powerRatio(S, X, P) >= 1.2 && estimateOp(S, X, P, 0.45, opts[0].kind) >= 1.15) return 'war';
  if (x.hawk > 0.45 && canStrike(S, X, P) && S.actors[P].nukes <= 0 && powerRatio(S, X, P) >= 1.2 && !IDS.some(c => S.actors[c].nukes > 50 && isAlly(S, c, P))) return 'strike';
  if (DEF[X].energy >= 1 && DEF[P].energy <= 0 && exposure(S, X, P) < 0.1) return 'energy';
  return 'sanction';
}
function createUltimatum(S, X, d, R, conseq) {
  const P = S.player, x = S.actors[X];
  conseq = conseq || pickConseq(S, X);
  const resolve = clamp(0.25 + x.hawk * 0.45 + x.risk * 0.2 + (powerRatio(S, X, P) >= 1.5 ? 0.1 : 0) - exposure(S, X, P) * 1.5, 0.1, 0.95);
  const u = { id: 'U' + S.seq++, from: X, demand: d.demand, loc: d.loc, with: d.with, t: d.t, conseq, resolve, turn: S.turn, deadline: S.turn + 2, status: 'open', base: S.actors[P].nukeProg };
  if (conseq === 'war') { const r = createOp(S, X, P, 0.45, false); if (r.op) { r.op.ulti = u.id; r.op.ready = Math.max(r.op.ready, u.deadline); u.op = r.op.id; } else u.conseq = 'sanction'; }
  S.ultis.push(u);
  x.flags.ultiCool = S.turn + 8; x.flags['ud_' + u.demand] = S.turn; S.ultiAt = S.turn;
  const msg = M('ul.new', { a: X, x: M('ud.' + u.demand, { l: u.loc, b: u.with, t: u.t }), k: M('uc.' + u.conseq), n: 2 });
  R.toYou.push({ actor: X, msg, tone: 'bad', big: true });
  logEvent(S, 'ultimatum', msg, 'bad', [X, P]);
  pushEv(S, { type: 'ultimatum', actor: X, target: P, sev: 0 });
  return u;
}
function ultiComplied(S, u) {
  const P = S.player;
  switch (u.demand) {
    case 'lift': return !S.sanctions.some(s => s.from === P && s.to === u.from);
    case 'withdraw': return share(S, P, u.loc) < 0.01 && !S.actors[P].moves.some(m => m.to === u.loc);
    case 'break_alliance': return !hasTreaty(S, P, u.with, 'alliance');
    case 'stop_nuke': return S.actors[P].nukeProg <= u.base - 15 && !S.actors[P].nukes;
    case 'release': return S.actors[u.t].ctrl !== P && S.actors[u.t].overlord !== P;
    case 'end_war': return !atWar(S, P, boss(S, u.t)) && !atWar(S, P, u.t);
    case 'pay': return !!u.paid;
    case 'break_pact': return !hasTreaty(S, P, u.with, 'alliance') && !hasTreaty(S, P, u.with, 'access');
    case 'lift_blockade': return !S.blockades.some(b => b.by === P && b.target === u.t);
  }
  return false;
}
function complyUltimatum(S, u, R) {
  const P = S.player, X = u.from;
  switch (u.demand) {
    case 'lift': removeSanctions(S, P, X); addCommit(S, 'no_sanction', X, 8, 'ultimatum'); break;
    case 'withdraw': { const sh = freeAt(S, P, u.loc); S.fronts = S.fronts.filter(f => !(f.att === P && f.from === u.loc)); S.ops = S.ops.filter(o => !(o.owner === P && o.from === u.loc)); orderMove(S, P, u.loc, P, shareV(S, P, u.loc).slice()); void sh; S.actors[P].moves = S.actors[P].moves.filter(m => !(m.to === u.loc)); break; }
    case 'break_alliance': removeTreaty(S, 'alliance', P, u.with); S.commits = S.commits.filter(c => !(c.type === 'defend' && c.with === u.with)); addRel(S, P, u.with, -25); repAdd(S, { trust: -6 }); break;
    case 'stop_nuke': S.actors[P].nukeProg = Math.max(0, S.actors[P].nukeProg - 25); addCommit(S, 'no_nuke', X, 12, 'ultimatum'); break;
    case 'release': { const y = S.actors[u.t]; if (y.ctrl === P && !PRV(S, u.t)) { y.ctrl = u.t; y.resist = 0; y.stab = 35; rebuildArmy(S, u.t, 0.25); resetExposure(S); } y.overlord = null; break; }
    case 'end_war': { const D = boss(S, u.t); makePeace(S, P, D, 'ceasefire', R); addCommit(S, 'no_attack', D, 6, 'ultimatum'); break; }
    case 'pay': { const amt = S.actors[P].gdp * 0.004; S.actors[P].treasury -= amt; S.actors[X].treasury += amt; u.paid = true; break; }
    case 'break_pact': removeTreaty(S, 'alliance', P, u.with); removeTreaty(S, 'access', P, u.with); S.commits = S.commits.filter(c => !(c.type === 'defend' && c.with === u.with)); addRel(S, P, u.with, -20); repAdd(S, { trust: -5 }); break;
    case 'lift_blockade': S.blockades = S.blockades.filter(b => !(b.by === P && b.target === u.t)); break;
  }
  u.status = 'complied';
  addRel(S, X, P, 10); S.actors[X].cred = clamp((S.actors[X].cred ?? 60) + 5, 0, 100);
  facAdd(S, { pub: -3, mil: -2 });
  if (S.ops.some(o => o.ulti === u.id)) S.ops = S.ops.filter(o => o.ulti !== u.id);
  const msg = M('ul.complied', { a: X });
  logEvent(S, 'ultimatum', msg, 'info', [X, P]);
  if (R) R.pol.push({ msg, tone: 'info' });
}
function ultimatumTurn(S, R) {
  const P = S.player;
  for (const u of S.ultis) {
    if (u.status !== 'open') continue;
    if (!indep(S, u.from)) { u.status = 'void'; continue; }
    if (ultiComplied(S, u)) { if (u.status === 'open') { u.status = 'complied'; addRel(S, u.from, P, 8); S.ops = S.ops.filter(o => o.ulti !== u.id); R.pol.push({ msg: M('ul.satisfied', { a: u.from }), tone: 'info' }); } continue; }
    if (u.core) { if (S.turn > u.deadline + 8) u.status = 'void'; continue; }
    if (S.turn < u.deadline) continue;
    const X = u.from;
    if (chance(S, clamp(u.resolve + (u.rejected ? 0.1 : 0), 0, 0.97))) {
      u.status = 'executed';
      const res = executeConseq(S, X, u, R);
      const msg = M('ul.executed', { a: X, x: res || M('uc.' + u.conseq) });
      R.toYou.push({ actor: X, msg, tone: 'bad', big: true });
      logEvent(S, 'ultimatum', msg, 'bad', [X, P]);
      grantCB(S, X, 'ultimatum', 10);
      S.actors[X].cred = clamp((S.actors[X].cred ?? 60) + 5, 0, 100);
    } else {
      u.status = 'bluffed';
      S.ops = S.ops.filter(o => o.ulti !== u.id);
      S.actors[X].cred = clamp((S.actors[X].cred ?? 60) - 20, 0, 100);
      facAdd(S, { pub: 3, mil: 2 });
      const msg = M('ul.bluffed', { a: X });
      R.toYou.push({ actor: X, msg, tone: 'good' });
      logEvent(S, 'ultimatum', msg, 'good', [X, P]);
    }
  }
  S.ultis = S.ultis.filter(u => u.status === 'open' || u.turn >= S.turn - 6);
}
function executeConseq(S, X, u, R) {
  const P = S.player;
  switch (u.conseq) {
    case 'sanction': addSanction(S, X, P, 'econ', Math.min(3, Math.max(2, sanctionLevel(S, X, P, 'econ') + 1))); addRel(S, X, P, -15); return M('uc.sanction');
    case 'energy': addSanction(S, X, P, 'energy', 1); addRel(S, X, P, -15); return M('uc.energy');
    case 'strike': if (canStrike(S, X, P)) { execAI(S, X, 'strike', P, {}, R); return M('uc.strike'); } addSanction(S, X, P, 'econ', 2); return M('uc.sanction');
    case 'war': { const o = S.ops.find(z => z.ulti === u.id); if (o) { o.ulti = null; o.ready = S.turn; launchOp(S, o, R); return M('uc.war'); } declareWar(S, X, P); return M('uc.war'); }
  }
  return null;
}

/* ---------- 灰色地带摩擦 ---------- */
const GZ = ['sea', 'air', 'border', 'drone'];
function grayZone(S, X, T, R) {
  if (NEU(S, X) || NEU(S, T)) return;
  const key = rk(X, T); const tv = clamp((S.tension2[key] || 0) + between(S, 8, 15), 0, 100); S.tension2[key] = tv;
  addRel(S, X, T, -4);
  const k = ISLAND.has(T) || !landAdj(X, T) ? pick(S, ['sea', 'air', 'drone']) : pick(S, GZ);
  const msg = M('ai.gray', { a: X, t: T, k: M('gz.' + k) });
  pushEv(S, { type: 'gray', actor: X, target: T, sev: 10 });
  if (T === S.player) { R.toYou.push({ actor: X, msg, tone: 'warn' }); S.actors[T].stab = clamp(S.actors[T].stab - 0.5, 0, 100); facAdd(S, { pub: -1 }); grantCB(S, X, 'incident', 6); }
  else if (tv >= 40) R.world.push({ actor: X, msg, tone: 'info', about: [T] });
  if (chance(S, tv / 400)) {
    loss(S, X, 0.02, 0.05); loss(S, T, 0.02, 0.05); addRel(S, X, T, -10); S.tension = clamp(S.tension + 5, 0, 100);
    const cm = M('ai.clash', { a: X, t: T });
    logEvent(S, 'war', cm, 'warn', [X, T]);
    if (T === S.player) { R.toYou.push({ actor: X, msg: cm, tone: 'bad', big: true }); queueCrisis(S, ISLAND.has(T) || !landAdj(X, T) ? 'collision' : 'border_clash', { X }); }
    else R.world.push({ actor: X, msg: cm, tone: 'warn', about: [T], big: true });
  }
}

/* ---------- 候选行动 ---------- */
function candidates(S, X) {
  const x = S.actors[X], out = [];
  const add = (c) => { if (S.neutral && (NEU(S, c.target) || NEU(S, c.other) || (c.deal && NEU(S, c.deal.with)))) return; if (c.u > 0.05 && isFinite(c.u)) out.push(c); };
  const act = (id, target, params, u) => { const d = ACT[id]; if (!d) return; const tt = d.self ? X : target; if (d.check(S, X, tt, params || {})) return; add({ kind: 'act', id, target: tt, params: params || {}, u }); };
  // ===== 对真人玩家（多人局中逐个真人席位评估）=====
  forHumans(S, () => candP(S, X, x, add, act));
  // ===== 对其他 AI =====
  const AG = sc().agenda || {};
  candAI(S, X, x, add, act, AG);
  return out;
}
function candP(S, X, x, add, act) {
  const P = S.player;
  const th = (S.threat[X] || 0) / 100, rP = rel(S, X, P) / 100, dep = exposure(S, X, P), dm = diffMult(S);
  const warP = atWar(S, X, P), allyP = isAlly(S, X, P);
  const pIndep = indep(S, P);
  if (pIndep && !allyP) {
    const pr = powerRatio(S, X, P), big = isGreat(S, X) || x.gdp >= 1500, weak = pr < 0.12 && !big;
    const hostile = Math.max(0, th - 0.3) + Math.max(0, -rP) * 0.5;
    const hp = hostB(S, X, P);
    // 最后通牒
    if (!warP && !S.ultis.some(u => u.from === X && u.status === 'open') && (x.flags.ultiCool || 0) <= S.turn && (S.ultiAt ?? -9) < S.turn - 3 && pr >= 0.35 && (rP < -0.15 || th > 0.55)) {
      for (const d of demandOptions(S, X)) if (S.turn - (x.flags['ud_' + d.demand] ?? -99) >= 16) add({ kind: 'ulti', target: P, demand: d, u: ((d.g / 100) * (0.45 + x.hawk * 0.7) * (pr >= 0.7 ? 1 : 0.6) + th * 0.2 - 0.34 - rP * 0.25 + hp * 0.3) * dm + planBoost(S, X, 'ultimatum', P) });
    }
    // 经济战
    if (!sanctionLevel(S, X, P, 'econ')) act('sanction', P, { level: th > 0.7 ? 2 : 1 }, ((th - 0.4) * 0.9 - rP * 0.4 - dep * 2 + x.econ * 0.1 + hp * 0.8 - (weak ? 0.1 : 0)) * dm + planBoost(S, X, 'sanction', P));
    if (x.gdp >= 2000 && S.actors[P].gdp >= 0.25 * x.gdp && !sanctionLevel(S, X, P, 'tariff') && sanctionLevel(S, X, P, 'econ') < 2) act('tariff', P, {}, (0.05 + (th - 0.3) * 0.5 - rP * 0.4 - dep + (X === 'USA' ? 0.12 : 0) + hp * 0.8) * dm + planBoost(S, X, 'tariff', P));
    const gap = x.tech - S.actors[P].tech;
    if (x.tech >= 84 && gap >= 2 && gap < 9 && S.actors[P].gdp > 0.2 * x.gdp && sanctionLevel(S, X, P, 'econ') < 3) act('techban', P, {}, (0.1 + (9 - gap) / 30 + th * 0.3 - rP * 0.5 + hp * 0.8 - dep * 1.5) * dm + planBoost(S, X, 'techban', P));
    if (DEF[X].fin >= 2 && th > 0.6) act('finsanction', P, {}, ((th - 0.55) + x.hawk * 0.2 - dep * 2 - rP * 0.5 + hp * 0.5) * dm + planBoost(S, X, 'finsanction', P));
    if (DEF[X].energy >= 1 && DEF[P].energy <= 0 && th > 0.55) act('energy', P, {}, ((th - 0.5) * 0.8 - dep * 1.5 - rP * 0.4 + hp * 0.5) * dm + planBoost(S, X, 'energy', P));
    // 制衡联盟
    if (th > 0.45) for (const Y of IDS) { if (Y === X || isHuman(S, Y) || !indep(S, Y) || isAlly(S, X, Y) || (S.threat[Y] || 0) < 45 || rel(S, X, Y) < 15) continue; act('alliance', Y, {}, ((th - 0.45) * 1.1 + ((S.threat[Y] || 0) / 100 - 0.45) * 0.5 + x.hawk * 0.1 - 0.05) * dm); }
    // 代理人战争
    if (!warP) for (const E of enemies(S, P)) { if (E === X || !indep(S, E) || rel(S, X, E) <= 10 || (rP > -0.2 && th < 0.5)) continue; const u = (0.12 + (-rP) * 0.35 + th * 0.25 + x.hawk * 0.15 + hp * 0.6) * dm + planBoost(S, X, 'armsaid', E); if (big && x.hawk > 0.7 && th > 0.6) act('volunteers', E, {}, u - 0.15); act('armsaid', E, { tier: 0 }, u); }
    // 隐蔽行动
    if (hostile > 0.1 && (x.flags.covertCool || 0) <= S.turn) {
      const base = ((th - 0.35) * 0.6 + (-rP) * 0.25 + x.hawk * 0.12 + (intelOf(S, X) - 50) / 300 - 0.2 + hp * 0.6 + (DEF[X].gov === 'aut' ? 0.03 : 0) - (weak ? 0.12 : 0)) * dm;
      act('propaganda', P, {}, base + (DEF[P].gov === 'dem' ? 0.04 : -0.06) + planBoost(S, X, 'propaganda', P));
      act('cyber', P, {}, base + (x.tech > 60 ? 0.03 : -0.1) + planBoost(S, X, 'cyber', P));
      act('opposition', P, {}, base - 0.05 + planBoost(S, X, 'opposition', P));
      act('sabotage', P, {}, base - 0.1 + planBoost(S, X, 'sabotage', P));
      if (S.actors[P].tech > x.tech + 3) act('espionage', P, {}, base + 0.03);
      for (const T of controlled(S, P)) if (T !== P && !S.actors[T].integrated && rel(S, X, T) > 20) act('fund_resist', T, {}, base + 0.15);
      for (const V of IDS) if (S.actors[V].overlord === P && indep(S, V)) { if (infl(S, X, V) >= 30) act('coup', V, {}, base + 0.15); else act('incite', V, {}, base + 0.05); }
    }
    // 挖墙脚：拉拢玩家的盟友与附庸
    if (big && (th > 0.4 || rP < -0.2)) for (const Y of IDS) { if (Y === X || isHuman(S, Y) || !indep(S, Y) || rel(S, X, Y) < 0) continue; if (!(isAlly(S, P, Y) || isPartner(S, P, Y) || S.actors[Y].overlord === P)) continue; const u = (th * 0.25 + (-rP) * 0.15 + hp * 0.4 - (rel(S, Y, P) - 40) / 250 - 0.06) * dm + planBoost(S, X, 'aid', Y); act('aid', Y, { tier: 0 }, u); if (rel(S, X, Y) > 30 && !isAlly(S, X, Y)) act('alliance', Y, {}, u - 0.12); }
    // 灰色地带
    const prox = near(X, P, 1500) || forcesNear(S, X, P, 1500) > 0.02 || forcesNear(S, P, X, 1500) > 0.02;
    if (prox && !warP && rP < -0.3 && x.hawk > 0.35 && (x.flags.grayCool || 0) <= S.turn && (S.tension2[rk(X, P)] || 0) < 70) add({ kind: 'gray', target: P, u: (x.hawk * 0.4 + (-rP) * 0.25 + th * 0.2 - 0.4 + hp * 0.6) * dm + planBoost(S, X, 'gray', P) });
    // 前沿部署
    if (isGreat(S, X) && th > 0.45) for (const Y of IDS) { if (Y === X || isHuman(S, Y) || !canStation(S, X, Y) || dist(Y, P) > 1500 || share(S, X, Y) > 0.12) continue; add({ kind: 'deploy', target: Y, amt: 0.08, u: ((th - 0.45) * 1.2 + x.hawk * 0.2 - 0.05) * dm + planBoost(S, X, 'deploy', Y) }); }
    // 预防性战争
    if (!warP && !S.ops.some(o => o.owner === X) && x.hawk >= 0.45 && rP < -0.5 && (th >= 0.65 || hp >= 0.4 || planBoost(S, X, 'attack', P) > 0)) {
      const so = stagingOptions(S, X, P)[0];
      if (so) { const est = estimateOp(S, X, P, 0.45, so.kind) * nukeDeter(S, X, P) * aiReach(S, X, P); if (est >= 1.25) add({ kind: 'op', target: P, amt: 0.45, u: ((th - 0.55) + x.hawk * 0.4 + x.risk * 0.2 - 0.38 + hp * 0.5) * dm + planBoost(S, X, 'attack', P) }); }
    }
    // 友好提议（同类提议有冷却）
    const fp = friendB(S, X, P);
    const ofOk = type => (x.flags['of_' + type] || 0) <= S.turn && !S.inbox.some(o => o.from === X && o.deal.type === type);
    if (!warP && rP > 0.35 && !isAlly(S, X, P) && commonEnemy(S, X, P) > 0.1 && ofOk('alliance') && !alignBlock3(S, X, P)) add({ kind: 'offer', target: P, deal: { type: 'alliance' }, u: 0.05 + rP * 0.4 + commonEnemy(S, X, P) * 0.5 + fp });
    if (!warP && rP > 0.25 && !hasTreaty(S, X, P, 'trade') && ofOk('trade')) add({ kind: 'offer', target: P, deal: { type: 'trade' }, u: -0.1 + rP * 0.3 + dep * 0.8 + fp });
    if (!warP && th > 0.6 && powerRatio(S, P, X) > 4 && near(X, P, 2000) && x.hawk < 0.5 && !x.overlord && x.stab < 45 && rP > -0.2 && !GRD(S, X) && ofOk('protectorate') && !alignBlock3(S, X, P)) add({ kind: 'offer', target: P, deal: { type: 'protectorate' }, u: Math.min(0.5, 0.05 + (Math.min(powerRatio(S, P, X), 20) - 4) * 0.02 + (0.5 - x.hawk) * 0.3 - (x.stab - 30) / 100) });
    if (!warP && th > 0.5 && rP > -0.6 && x.hawk < 0.55 && !hasTreaty(S, X, P, 'nap') && ofOk('nap')) add({ kind: 'offer', target: P, deal: { type: 'nap' }, u: th * 0.4 + (0.5 - x.hawk) * 0.3 - 0.05 });
    if (!warP && th > 0.55 && x.econ > 0.45 && x.hawk < 0.5 && !hasTreaty(S, X, P, 'armsctl') && ofOk('armsctl')) add({ kind: 'offer', target: P, deal: { type: 'armsctl' }, u: th * 0.35 + x.econ * 0.15 - 0.05 });
  }
  if (pIndep && (allyP || isPartner(S, X, P)) && rel(S, X, P) > 20) {
    const threatened = S.ops.some(o => boss(S, o.target) === X && o.owner !== P && o.det.includes(X)) || S.fronts.some(f => boss(S, f.target) === X && f.att !== P) || Object.entries(S.tension2).some(([k, v]) => v > 45 && k.split('|').includes(X));
    if (threatened && !S.crises.some(c => c.from === X) && (x.flags.askCool || 0) <= S.turn) add({ kind: 'crisis', crisis: 'ally_help', target: P, u: 0.5 + x.loyal * 0.3 });
  }
  if (pIndep && enemies(S, X).length && !enemies(S, X).includes(P) && isGreat(S, P) && rel(S, X, P) > 0 && S.rep.trust > 50 && (x.flags.askCool || 0) <= S.turn) {
    const Y = enemies(S, X).find(e => rel(S, e, P) > -20 && e !== P);
    if (Y && !S.crises.some(c => c.kind === 'mediation')) add({ kind: 'crisis', crisis: 'mediation', target: P, other: Y, u: 0.12 + (1 - x.hawk) * 0.2 });
  }
}
function candAI(S, X, x, add, act, AG) {
  const stances = Object.assign({}, (AG[X] && AG[X].stance) || {}, (x.plan && x.plan.until >= S.turn && x.plan.stance) || {});
  for (const [Y, st] of Object.entries(stances)) {
    if (isHuman(S, Y) || !S.actors[Y] || !indep(S, Y) || Y === X) continue;
    const rY = rel(S, X, Y) / 100;
    if (st === 'contain' || st === 'coerce' || st === 'attack') {
      if (!sanctionLevel(S, X, Y) && rY < -0.3) act('sanction', Y, { level: 1 }, x.hawk * 0.12 - exposure(S, X, Y) * 2 + planBoost(S, X, 'sanction', Y));
      if (near(X, Y, 1500) && rY < -0.3 && !atWar(S, X, Y) && (x.flags.grayCool || 0) <= S.turn) add({ kind: 'gray', target: Y, u: x.hawk * 0.3 - 0.2 + (st === 'coerce' ? 0.08 : 0) + planBoost(S, X, 'gray', Y) });
      if (rY < -0.4 && (x.flags.covertCool || 0) <= S.turn) act('propaganda', Y, {}, x.hawk * 0.1 - 0.02 + planBoost(S, X, 'propaganda', Y));
      for (const E of enemies(S, Y)) if (E !== X && !isHuman(S, E) && rel(S, X, E) > 10) act('armsaid', E, { tier: 0 }, 0.1 + x.hawk * 0.1 + x.loyal * 0.05 + planBoost(S, X, 'armsaid', E));
      if (st === 'attack' && !atWar(S, X, Y) && !S.ops.some(o => o.owner === X) && x.hawk >= 0.5 && aiReach(S, X, Y)) { const so = aiStaging(S, X, Y); if (so && estimateOp(S, X, Y, 0.45, so.kind) * nukeDeter(S, X, Y) * aiReach(S, X, Y) >= 1.5) add({ kind: 'op', target: Y, amt: 0.45, u: 0.05 + x.hawk * 0.3 + x.risk * 0.15 - 0.25 + planBoost(S, X, 'attack', Y) }); }
    } else if (st === 'court' || st === 'support') {
      if (rY < 0.7) act('summit', Y, {}, 0.05 + (0.7 - rY) * 0.15 + planBoost(S, X, 'summit', Y));
      if (!hasTreaty(S, X, Y, 'trade') && rY > 0.2) act('trade', Y, {}, 0.08 + planBoost(S, X, 'trade', Y));
      if (st === 'support' && enemies(S, Y).length) act('armsaid', Y, { tier: 0 }, 0.15 + x.loyal * 0.15 + (enemies(S, Y).some(E => rel(S, X, E) < -40) ? 0.1 : 0) + planBoost(S, X, 'armsaid', Y));
      act('aid', Y, { tier: 0 }, 0.04 + planBoost(S, X, 'aid', Y));
    }
  }
  const tg = threatTo(S, X);
  if (tg.t > 1.2 && (x.flags.buildupTo || 0) <= S.turn && (x.flags.buildupAt ?? -9) < S.turn - 3) act('buildup', X, { tier: 0, branch: 'all' }, (tg.t - 1) * 0.25);
  if (x.nukeProg > 0 && !x.nukes && AG[X] && (AG[X].goals || []).includes('nuclear')) act('nukeprog', X, {}, 0.1 + x.hawk * 0.25);
}
function threatTo(S, X) {
  let t = 0, who = null;
  for (const Y of IDS) {
    if (Y === X || !indep(S, Y)) continue; const r = rel(S, X, Y); if (r > -30 && !atWar(S, X, Y)) continue;
    const prox = landAdj(X, Y) ? 1 : dist(X, Y) < 1500 ? 0.7 : strikePower(S, Y, X) > 1 ? 0.4 : 0.1;
    const v = (power(S, Y) * prox) / (power(S, X) + allyHelp(S, X, Y) * 0.6 + 1) * (atWar(S, X, Y) ? 1.5 : (-r / 100));
    if (v > t) { t = v; who = Y; }
  }
  return { t: Math.min(t, 3), who };
}
function aiPlan(S) {
  const plans = []; const temp = S.diff === 'hard' ? 0.12 : S.diff === 'easy' ? 0.2 : 0.15;
  const bar0 = S.diff === 'hard' ? 0.22 : S.diff === 'easy' ? 0.3 : 0.26;
  for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X) || NEU(S, X)) continue;
    const x = S.actors[X];
    const cands = candidates(S, X).filter(c => c.u > 0.05); if (!cands.length) continue;
    const n = x.overlord ? 1 : aiAP(S, X); const chosen = [];
    for (let i = 0; i < n; i++) {
      const pool = cands.filter(c => !chosen.some(o => o.kind === c.kind && o.target === c.target && o.id === c.id)).sort((a, b) => b.u - a.u).slice(0, 6);
      if (!pool.length) break;
      const c = softPick(S, pool, temp);
      if (!chance(S, sig((c.u - bar0 - i * 0.12) / 0.08))) break;
      chosen.push(c);
    }
    for (const c of chosen) plans.push(Object.assign({ actor: X }, c));
  }
  return plans;
}
function execAI(S, X, id, t, p, R) {
  const d = ACT[id]; if (!d) return false;
  const tt = d.self ? X : t; if (d.check(S, X, tt, p || {})) return false;
  const cost = d.cost(S, X, tt, p || {}); S.actors[X].treasury -= cost || 0;
  d.exec(S, X, tt, p || {}, mkCtx(S, R, X, d));
  return true;
}
function mkCtx(S, R, me, def) {
  const isP = me === S.player;
  return {
    R, isP,
    out(msg, tone, about, opts) {
      opts = opts || {};
      if (isP) { R.actions.push({ msg, tone }); return; }
      if ((about || []).includes(S.player)) { const tn = def && def.hostile ? 'bad' : tone === 'bad' ? 'info' : 'good'; R.toYou.push({ actor: me, msg, tone: tn, big: opts.big }); return; }
      if (opts.notable || opts.big) R.world.push({ actor: me, msg, tone: 'info', about, big: opts.big });
      if (opts.big) logEvent(S, 'ai', msg, 'info', [me].concat(about || []));
    },
  };
}
function execPlan(S, c, R) {
  const X = c.actor, P = S.player;
  if (!indep(S, X)) return;
  switch (c.kind) {
    case 'act': if (execAI(S, X, c.id, c.target, c.params, R)) { markPlanDone(S, X, c.id, c.target); const d = ACT[c.id]; if (d.covert) S.actors[X].flags.covertCool = S.turn + 2 + (chance(S, 0.5) ? 1 : 0); if (c.id === 'buildup') S.actors[X].flags.buildupAt = S.turn; } break;
    case 'ulti': if (indep(S, P) && !S.ultis.some(u => u.from === X && u.status === 'open')) { createUltimatum(S, X, c.demand, R); markPlanDone(S, X, 'ultimatum', P); } break;
    case 'gray': grayZone(S, X, c.target, R); markPlanDone(S, X, 'gray', c.target); S.actors[X].flags.grayCool = S.turn + 3; break;
    case 'deploy': { const mv = orderMove(S, X, X, c.target, c.amt); if (mv > 0) { markPlanDone(S, X, 'deploy', c.target); for (const H of humansOf(S)) if (dist(c.target, H) <= 1500 && chance(S, detectP(S, H, X, 0.55))) RP(S, H, R).intel.push({ msg: M('in.deploy', { a: X, l: c.target }), tone: 'warn', about: [X] }); } break; }
    case 'op': { if (S.ops.some(o => o.owner === X)) break; const r = createOp(S, X, c.target, c.amt, false); if (r.op) { r.op.legit = true; markPlanDone(S, X, 'attack', c.target); logEvent(S, 'secret', M('m.op.secret', { a: X, t: c.target }), 'info', [X]); } break; }
    case 'offer': { const d = c.deal; S.actors[X].flags['of_' + d.type] = S.turn + 8; if (pushOffer(S, mkOffer(S, X, d, M('of.' + d.type, { a: X })))) R.toYou.push({ actor: X, msg: M('ai.offer', { a: X, x: M('dt.' + d.type) }), tone: 'good' }); break; }
    case 'crisis': { S.actors[X].flags.askCool = S.turn + 6; if (c.crisis === 'ally_help') { const Z = threatSource(S, X); if (Z) queueCrisis(S, 'ally_help', { Y: X, X: Z }); } else if (c.crisis === 'mediation') queueCrisis(S, 'mediation', { A: X, B: c.other }); break; }
  }
}
function threatSource(S, X) {
  const o = S.ops.find(o => boss(S, o.target) === X && o.det.includes(X)); if (o) return o.owner;
  const f = S.fronts.find(f => boss(S, f.target) === X); if (f) return f.att;
  let best = null, bv = 45; for (const [k, v] of Object.entries(S.tension2)) { const [a, b] = k.split('|'); if (v > bv && (a === X || b === X)) { bv = v; best = a === X ? b : a; } }
  return best;
}

/* ---------- 同时结算中的“竞价”冲突 ---------- */
const EXCL = new Set(['alliance', 'vassal', 'access', 'coup']);
function resolveConflicts(S, items) {
  const groups = {};
  for (const it of items) { const id = it.kind === 'act' ? it.id : it.type; if (!EXCL.has(id)) continue; const T = it.target; (groups[T] = groups[T] || []).push(it); }
  const losers = new Set(); const notes = [];
  for (const [T, arr] of Object.entries(groups)) {
    if (arr.length < 2) continue;
    const actors = [...new Set(arr.map(a => a.actor))]; if (actors.length < 2) continue;
    let rivals = false; for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) if (rel(S, actors[i], actors[j]) < -20 || atWar(S, actors[i], actors[j])) rivals = true;
    if (!rivals) continue;
    const scored = arr.map(a => ({ a, s: evalDeal(S, a.actor, T, { type: (a.id || a.type) === 'coup' ? 'vassal' : (a.id || a.type) }).score + infl(S, a.actor, T) / 100 + rn(S) * 0.15 }));
    scored.sort((p, q) => q.s - p.s);
    for (const z of scored.slice(1)) { losers.add(z.a); notes.push({ loser: z.a.actor, winner: scored[0].a.actor, target: T }); }
  }
  return { losers, notes };
}

/* ---------- AI 背景行为（不耗行动点） ---------- */
function aiBackground(S, R) {
  for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X)) continue;
    const x = S.actors[X], d = DEF[X];
    const th = threatTo(S, X);
    const SC = sc(), nat = d.milex / d.gdp * 100, ens = enemies(S, X);
    let base = ens.length ? nat : Math.min(nat, SC.milCap ?? 6);
    // 总体战（历史剧本）：与大国交战时转入战时经济，工业化程度越高，能动员的比例越大
    const wp = d.war ?? (SC.warPct ? SC.warPct * clamp((x.tech - 20) / 60, 0.3, 1) : 0);
    const bigWar = !!wp && ens.some(e => !(S.war[rk(X, e)] || {}).limited && (isGreat(S, e) || S.fronts.some(f => f.att === e && boss(S, f.target) === X && f.progress > 5)));
    if (bigWar) base = Math.max(base, wp);
    let target = base * (1 + th.t * 0.35) + (ens.length ? 1.5 : 0) + Math.max(0, (S.threat[X] || 0) - 50) / 25;
    if (x.flags.buildupTo > S.turn) target = Math.max(target, x.milPct);
    if (target > 8) { const capPct = mcapOf(X) * Math.min(1, (x.cu ?? 1) + rampOf(X)) * fiscalBase(S, X) / Math.max(1, x.gdp) * 100; target = Math.min(target, Math.max(8, capPct * 1.25 + 2)); } // 军工产能跟不上时，预算也不会无限制地扩张
    x.milPct = clamp(x.milPct + (target - x.milPct) * 0.2, 0.3, Math.max(d.war != null ? Math.max(d.war, nat) : wp ? Math.max(wp, base, 30) : 30, weMilCap(S, X))); // 剧本给出的战时动员上限
    const homeFront = S.fronts.find(f => f.target === X);
    const alert = S.ops.some(o => boss(S, o.target) === X && o.det.includes(X));
    const myOff = S.fronts.filter(f => f.att === X);
    let wantMob = homeFront ? (homeFront.progress > 40 ? 3 : 2) : myOff.some(f => f.progress < 0 && x.hawk > 0.6) ? 2 : enemies(S, X).length ? 1 : (alert || th.t > 1.5 ? 1 : 0);
    if (bigWar && (isGreat(S, X) || sc().noIdlePeace)) wantMob = 3; // 总体战：全面动员（历史剧本中参战的小国也全面动员）
    if (sc().noIdlePeace && myOff.length) wantMob = Math.max(wantMob, 2); // 历史剧本：正在进攻的一方保持战时动员
    // 增援不利的攻势
    for (const f of myOff) { if ((f.ratio || 1) < 1.0 && dotw(S, X, f.v) < 0.65 && !isHuman(S, boss(S, f.target))) { const r0 = f.from === X ? 0.25 : 0; const fv = vsub0(freeV(S, X, f.from), [r0, r0, r0]); const add = vmin(vmul(fv, 0.5), [0.05, f.kind === 'amph' ? 0.05 : 0, 0.05]); if (vmax(add) > 0.01) { f.v = vadd(f.v, add); f.tv = vadd(f.tv || f.v, add); } } }
    if (wantMob > x.mob) x.mob = wantMob; else if (wantMob < x.mob && chance(S, 0.3)) x.mob--;
    if (d.wmix) { const tm = bigWar ? d.wmix : d.mix; x.mix = x.mix.map((v, i) => v + (tm[i] - v) * 0.15); } // 战时生产结构（如美国转向飞机与坦克）
    // 增援受攻击的控制区（如苏联增援乌克兰）：从本土抽调预备队
    for (const f of S.fronts) {
      const T = f.target; if (T === X || boss(S, T) !== X || S.actors[T].ctrl !== X) continue;
      if ((f.ratio || 1.2) < 1.05 || !canStation(S, X, T)) continue;
      const fr = vsub0(freeV(S, X, X), [0.3, 0.3, 0.3]); const add = vmin(vmul(fr, 0.4), [0.12, LANDLOCKED.has(T) ? 0 : 0.04, 0.1]);
      if (vmax(add) > 0.015 && !x.moves.some(m => m.to === T && m.eta > S.turn)) orderMove(S, X, X, T, add);
    }
    // 反攻：敌方攻势崩溃后，趁势夺回其出发阵地
    const cf = x.flags.counter; if (cf && cf.until >= S.turn && !S.ops.some(o => o.owner === X) && atWar(S, X, boss(S, cf.t)) && S.actors[cf.t].ctrl !== X) {
      const so = aiStaging(S, X, cf.t); if (so && estimateOp(S, X, cf.t, 0.4, so.kind) * (S.actors[cf.t].part === X ? 1.4 : 1) >= 0.95) { const r = createOp(S, X, cf.t, 0.45, false, so.L); if (r.op) { r.op.legit = true; x.flags.counter = null; } }
    }
    // 防御性调兵：本土受威胁时撤回海外兵力
    if ((alert || homeFront) && share(S, X, X) < 0.85) for (const L of stations(S, X)) if (L !== X && freeAt(S, X, L) > 0.01 && !enemies(S, X).some(e => near(L, e, 450)) && !coreHold(S, X, L)) orderMove(S, X, L, X, vmul(freeV(S, X, L), 0.6));
    // 支援受威胁的盟友：前沿部署 + 公开警告
    for (const o of S.ops) {
      const T = o.target, Dd = boss(S, T); if (o.owner === X || Dd === X || !o.det.includes(X)) continue;
      if (!(isAlly(S, X, Dd) || isAlly(S, X, T) || isPartner(S, X, T))) continue;
      if (labelKm(X, T) > Math.max(2500, (DEF[X].proj || 1500) * 1.2) && !isGreat(S, X)) continue; // 鞭长莫及
      if (sc().noIdlePeace && labelKm(X, T) > (DEF[X].proj || 1500) * 1.2) continue;
      if (x.flags['sup_' + o.id]) continue; x.flags['sup_' + o.id] = true;
      if (!chance(S, 0.35 + x.loyal * 0.55)) continue;
      const dest = canStation(S, X, T) ? T : IDS.find(L => canStation(S, X, L) && near(L, T, 450));
      const amt = isGreat(S, X) ? clamp(0.06 + x.loyal * 0.14, 0.05, 0.22) : 0.08;
      if (dest && freeAt(S, X, X) > amt + 0.2) { orderMove(S, X, X, dest, amt); for (const H of humansOf(S)) if (o.owner === H || T === H) RP(S, H, R).intel.push({ msg: M('in.reinforce', { a: X, l: dest, t: T }), tone: o.owner === H ? 'bad' : 'good', about: [X] }); }
      if (isGreat(S, X) && !S.warnings.some(w => w.by === X && w.to === o.owner && w.about === T)) { S.warnings.push({ by: X, to: o.owner, about: T, conseq: 'war', until: S.turn + 8, since: S.turn }); if (isHuman(S, o.owner)) RP(S, o.owner, R).toYou.push({ actor: X, msg: M('ai.warn', { a: X, t: T }), tone: 'bad', big: true }); }
    }
    // 战争管理：与玩家以外的战争
    for (const f of S.fronts.filter(f => f.att === X)) {
      const T = boss(S, f.target); if (isHuman(S, T)) continue;
      const sl = f.hist.length >= 3 ? f.hist[f.hist.length - 1] - f.hist[f.hist.length - 3] : 5;
      const tw = sc().noIdlePeace && isGreat(S, T) && isGreat(S, X); // 总体战：大国之间不轻易停火
      if (warLocked(S, X, T)) continue;
      if ((!tw && sl < 1 && f.turns > 6 && chance(S, stanceOf(S, X, T) === 'attack' ? 0.015 : 0.05)) || (x.stab < (tw ? 12 : 25) && chance(S, 0.3))) { const d2 = decide(S, X, T, { type: 'ceasefire' }); if (d2.ok) { makePeace(S, X, T, 'ceasefire'); R.world.push({ actor: X, msg: M('m.ceasefire', { a: X, b: T }), tone: 'info', about: [T] }); } }
    }
    for (const f of S.fronts.filter(f => isHuman(S, f.att) && boss(S, f.target) === X)) withSeat(S, f.att, () => {
      if (f.progress > 65 && chance(S, 0.35) && !S.inbox.some(o => o.from === X)) {
        const vas = f.progress > 85 && chance(S, 0.5);
        pushOffer(S, mkOffer(S, X, { type: 'peace', terms: vas ? 'vassal_self' : 'white' }, M(vas ? 'of.peace_vassal' : 'of.peace', { a: X })));
      }
    });
    for (const f of S.fronts.filter(f => isHuman(S, boss(S, f.target)) && f.att === X)) withSeat(S, boss(S, f.target), () => { if ((f.progress < -10 || (f.phase !== 'land' && f.last < 0)) && chance(S, 0.3) && !S.inbox.some(o => o.from === X)) pushOffer(S, mkOffer(S, X, { type: 'ceasefire', terms: 'ceasefire' }, M('of.ceasefire', { a: X }))); });
    // 已交战但没有攻势：择机进攻（总体战中的大国更积极，可同时开辟两条战线）
    const TW = !!sc().noIdlePeace && isGreat(S, X);
    for (const E of enemies(S, X).sort((a, b) => blocPower(S, b) - blocPower(S, a))) { // 先打主要敌人（如“先欧后亚”）
      const busy = S.fronts.filter(f => f.att === X && boss(S, f.target) === E).length + S.ops.filter(o => o.owner === X && boss(S, o.target) === E).length;
      if (busy >= (TW ? 2 : 1)) continue;
      if (!chance(S, TW ? 0.6 : 0.12 + x.hawk * 0.2)) continue;
      const sh = TW ? 0.5 : 0.4;
      let best = null, bs = 0;
      let bFrom = null;
      // 总体战中先收复本国被占领土（如苏联 1943–44 年先收复乌克兰、白俄罗斯，再向中欧推进），而不是越过敌军主力去打防守薄弱的远方地区
      const ownLost = TW ? realm(S, E).filter(T => S.actors[T].part === X && S.actors[T].ctrl !== X) : [];
      for (const T of (ownLost.length ? ownLost : realm(S, E))) { if (S.actors[T].ctrl === T && T !== E) continue; if (S.fronts.some(f => f.att === X && f.target === T) || S.ops.some(o => o.owner === X && o.target === T)) continue; const rf = TW ? 1 : aiReach(S, X, T); if (!rf) continue; const so = aiStaging(S, X, T); if (!so) continue; const est = estimateOp(S, X, T, sh, so.kind) * (S.actors[T].part === X ? 2 : T !== E && (rel(S, X, T) > 20 || isAlly(S, X, T)) ? 1.5 : 1) * nukeDeter(S, X, T) * rf; if (est > bs) { bs = est; best = T; bFrom = so.L; } }
      const edge = TW && blocPower(S, X) + allyHelp(S, X, E) > 1.5 * (blocPower(S, E) + 1); // 总体实力占优的一方愿意打消耗战
      if (best && bs > (TW ? (edge ? 0.9 : 1.05) : 1.25)) { const r = createOp(S, X, best, edge ? 0.6 : sh, false, bFrom); if (r.op) r.op.legit = true; }
    }
    // 总体战：向前进基地集结（如美军集结英国、准备登陆欧洲）——主要敌人优先，基地兵力不足三成时持续增兵
    if (TW && !landAdj(X, enemies(S, X)[0] || X)) {
      const ens2 = enemies(S, X).filter(E => isGreat(S, E) && !(S.war[rk(X, E)] || {}).limited).sort((a, b) => blocPower(S, b) - blocPower(S, a));
      for (const [i, E] of ens2.slice(0, 2).entries()) {
        const tg = realm(S, E).filter(T => S.actors[T].ctrl !== T || T === E);
        if (tg.some(T => landAdj(X, T))) continue;
        let best = null, bd = 1e9;
        for (const L of IDS) { if (L === X || !canStation(S, X, L) || !indep(S, boss(S, L)) || atWar(S, boss(S, L), X) || S.fronts.some(f => f.target === L)) continue; if (!tg.some(T => landAdj(L, T) || (!LANDLOCKED.has(T) && dist(L, T) <= 450 && labelKm(L, T) <= 5200))) continue; const d0 = labelKm(X, L); if (d0 < bd) { bd = d0; best = L; } }
        if (best && share(S, X, best) < (i ? 0.18 : 0.3) && !x.moves.some(m => m.to === best && m.eta > S.turn)) { const v = vmin(vmul(vsub0(freeV(S, X, X), [0.15, 0.15, 0.15]), 0.5), i ? [0.12, 0.12, 0.12] : [0.2, 0.15, 0.2]); if (vmax(v) > 0.02) orderMove(S, X, X, best, v); }
      }
    }
    // 支援被入侵者（军援）
    for (const f of S.fronts) {
      const V = f.def; if (V === X || f.att === X || !indep(S, V)) continue;
      if ((isPartner(S, X, V) || isAlly(S, X, V) || rel(S, X, V) > 55) && rel(S, X, f.att) < -30 && !atWar(S, X, f.att) && chance(S, x.loyal * 0.25)) {
        execAI(S, X, 'armsaid', V, { tier: 0 }, R);
      }
    }
    for (const T of controlled(S, X)) if (T !== X && S.actors[T].resist > 40 && chance(S, 0.5)) S.actors[T].resist -= between(S, 4, 9);
  }
  // 无条件投降（历史剧本·总体战）：本土遭到进攻、兵力悬殊、兵源枯竭的大国会投降；拥核的一方可能用原子弹逼降
  if (sc().noIdlePeace) for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X) || !isGreat(S, X) || GRD(S, X)) continue; // 保底国家不投降
    const ens = enemies(S, X).filter(E => indep(S, E) && !(S.war[rk(X, E)] || {}).limited); if (!ens.length) continue;
    const x = S.actors[X];
    const homeF = S.fronts.filter(f => f.target === X).reduce((m, f) => Math.max(m, f.progress), 0);
    const mine = power(S, X) + IDS.filter(c => c !== X && indep(S, c) && isAlly(S, c, X) && ens.some(E => atWar(S, c, E))).reduce((s2, c) => s2 + power(S, c) * 0.5, 0);
    const theirs = ens.reduce((s2, E) => s2 + power(S, E), 0);
    const pr = mine / (theirs + 1);
    const exhausted = persCapAt(S, X, 3) < 0.3 * manBase(S, X) * 1000 * mobMaxOf(X);
    const nuked = (x.flags.nukedAt ?? -99) >= S.turn - 2;
    let p = 0;
    const lostParts = IDS.some(T => T !== X && S.actors[T].part === X && S.actors[T].ctrl !== X);
    if (homeF >= 45 && pr < 0.4) p = 0.35 + (homeF - 45) / 100;
    else if (pr < 0.25 && (exhausted || homeF > 0 || lostParts)) p = 0.3;
    if (nuked && pr < 0.5) p = Math.max(p, 0.6);
    if (x.stab < 15 && pr < 0.5) p = Math.max(p, 0.3);
    // 原子弹：对拒不投降、本土尚未被攻入的大国（如1945年的日本）
    if (!p && pr < 0.35 && !homeF && !SHD(S, X)) { const N = ens.find(E => !isHuman(S, E) && S.actors[E].nukes > 0 && !x.nukes && S.actors[E].hawk >= 0.2 && !SHD(S, E)); if (N && !x.flags.nukedAt && chance(S, 0.35)) { nuclearStrike(S, N, X, 'tactical', R); x.flags.nukedAt = S.turn; } }
    if (p && chance(S, p)) surrender(S, X, ens, R);
  }
  // 战略轰炸（历史剧本·总体战）：空中优势一方持续轰炸敌国本土工业，削弱其产能与经济，并在空战中消耗双方空军
  if (sc().noIdlePeace) for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X) || !isGreat(S, X)) continue; const x = S.actors[X];
    for (const E of enemies(S, X)) {
      if (!indep(S, E) || !isGreat(S, E) || (S.war[rk(X, E)] || {}).limited) continue;
      const sp = strikePower(S, X, E); if (sp < 20) continue;
      const def = airEff(S, E) * 0.35 + 1, r = clamp(sp / def, 0, 3);
      const y = S.actors[E];
      y.gdp *= 1 - 0.009 * r; if (y.cu != null) y.cu = Math.max(0.05, y.cu - 0.02 * r);
      if (DEF[E].oil) y.oilHit = clamp((y.oilHit || 0) + 0.03 * r, 0, 0.8); // 轰炸炼油厂与合成燃料厂
      y.air *= 1 - 0.01 * Math.min(r, 2); x.air *= 1 - 0.008 / Math.max(0.5, r);
      if (!x.flags['bomb_' + E]) { x.flags['bomb_' + E] = true; const msg = M('m.bombing', { a: X, t: E }); R.world.push({ actor: X, msg, tone: 'warn', about: [E], big: true }); logEvent(S, 'war', msg, 'warn', [X, E]); }
    }
  }
  // 租借/军援（历史剧本）：AI 援助国按 GDP 比例持续向正在作战的受援国输送装备
  for (const [A, B, pct, from, to] of (sc().lend || [])) {
    if (from != null && S.turn < from) continue; if (to != null && S.turn > to) continue;
    if (isHuman(S, A) || !indep(S, A) || !indep(S, B) || atWar(S, A, B)) continue;
    if (!enemies(S, B).some(e => rel(S, A, e) < -30 || atWar(S, A, e))) continue;
    const c = S.actors[A].gdp * pct / 100 / 4; armsTransfer(S, A, B, c); S.actors[A].treasury -= c * 0.3; addRel(S, A, B, 1); addInfl(S, A, B, 0.5);
  }
  // 核门槛国家的预防性打击
  for (const X of IDS) {
    const x = S.actors[X]; if (!indep(S, X) || x.nukes > 0 || x.nukeProg < 75 || isHuman(S, X)) continue;
    for (const Y of ['ISR', 'USA']) if (!isHuman(S, Y) && Y !== X && indep(S, Y) && rel(S, X, Y) < -60 && canStrike(S, Y, X) && chance(S, 0.18 * S.actors[Y].hawk)) { execAI(S, Y, 'strike', X, {}, R); x.nukeProg = Math.max(20, x.nukeProg - 35); R.world.push({ actor: Y, msg: M('ai.nukestrike', { a: Y, t: X }), tone: 'warn', about: [X], big: true }); break; }
  }
  const NP = sc().nukePace || {}; // 历史剧本：已知的核计划按历史节奏推进（AI）
  for (const [X, pace] of Object.entries(NP)) { const x = S.actors[X]; if (!x || isHuman(S, X) || !indep(S, X) || x.nukes > 0 || !(x.nukeProg > 0)) continue; x.nukeProg = clamp(x.nukeProg + pace * between(S, 0.6, 1.4), 0, 100); if (x.nukeProg >= 100) { x.nukes = 5; R.world.push({ actor: X, msg: M('r.nuketest', { a: X }), tone: 'warn', big: true }); logEvent(S, 'nuke', M('r.nuketest', { a: X }), 'warn', [X]); pushEv(S, { type: 'nuketest', actor: X, target: null, sev: 45, third: 30, big: true }); } }
  const NG = sc().nukeGrow; // 历史剧本：核大国的 AI 会持续扩充核武库
  if (NG) for (const X of IDS) { const x = S.actors[X]; if (!isHuman(S, X) && indep(S, X) && x.nukes > 0 && x.nukes < (NG.cap || 2000) && chance(S, 0.6)) x.nukes = Math.round(x.nukes + Math.max(1, x.nukes * (NG.rate || 0.12))); }
  for (const X of IDS) { const x = S.actors[X]; if (!isHuman(S, X) && indep(S, X) && x.nukeProg > 0 && !x.nukes && x.hawk > 0.6 && chance(S, 0.25)) { x.nukeProg = clamp(x.nukeProg + between(S, 1, 3), 0, 100); if (x.nukeProg >= 100) { x.nukes = 5; R.world.push({ actor: X, msg: M('r.nuketest', { a: X }), tone: 'warn', big: true }); pushEv(S, { type: 'nuketest', actor: X, target: null, sev: 45, third: 30, big: true }); } } }
  // 既有战争的停火可能
  for (const f of S.fronts.filter(f => !isHuman(S, f.att) && !isHuman(S, boss(S, f.target)))) {
    const T = boss(S, f.target); const x = S.actors[f.att], y = S.actors[T];
    const stale = f.hist.length >= 4 && Math.abs(f.hist[f.hist.length - 1] - f.hist[f.hist.length - 4]) < 4;
    const tw = sc().noIdlePeace && isGreat(S, T) && isGreat(S, f.att);
    const p = tw ? (x.stab < 15 || y.stab < 12 ? 0.05 : 0) : (0.008 + (stale ? 0.015 : 0)) * (stanceOf(S, f.att, T) === 'attack' ? 0.4 : 1) + (x.stab < 35 ? 0.04 : 0) + (y.stab < 30 ? 0.03 : 0);
    if (!warLocked(S, f.att, T) && chance(S, p) && atWar(S, f.att, T)) { makePeace(S, f.att, T, 'ceasefire'); R.world.push({ actor: f.att, msg: M('ai.mediated', { a: f.att, b: T }), tone: 'info', big: true, about: [T] }); }
  }
  // 核门槛：本土即将沦陷时可能动用核武
  const DOCT = sc().doct || {};
  for (const X of IDS) {
    const x = S.actors[X]; if (isHuman(S, X) || !indep(S, X) || x.nukes < 5) continue;
    if (S.shield && SHD(S, X) && x.flags.nukedAt == null) continue; // 不首先使用核武器：只有遭到核打击后才会核反击
    const hf = S.fronts.filter(f => f.target === X).sort((a, b) => b.progress - a.progress)[0];
    if (!hf || hf.progress < 55) continue;
    const pr = (DOCT[X] ?? 0.4) * (hf.progress - 50) / 50 * (0.5 + x.risk);
    if (chance(S, pr)) nuclearStrike(S, X, hf.att, hf.progress > 85 && x.hawk > 0.6 ? 'strategic' : 'tactical', R);
  }
  // 集团团结（历史剧本）：好战的集团成员会向盟友的大国敌人宣战（如 1941 年德国对美宣战）
  if (sc().blocWar) for (const b of Object.values(S.blocs)) for (const X of b.members) {
    const x = S.actors[X]; if (isHuman(S, X) || !indep(S, X) || x.hawk < 0.7) continue;
    for (const Y of b.members) { if (Y === X || !indep(S, Y)) continue; for (const E of enemies(S, Y)) { if (E === X || atWar(S, X, E) || !indep(S, E) || !isGreat(S, E) || rel(S, X, E) > -40 || hasTreaty(S, X, E, 'nap') || S.actors[E].overlord || (sc().blocWarNo || []).some(([a, b]) => a === X && b === E)) continue; if (chance(S, sc().blocWarP ?? 0.2)) { declareWar(S, X, E); logEvent(S, 'war', M('m.war', { a: X, b: E }), 'warn', [X, E]); if (isHuman(S, E)) { RP(S, E, R).toYou.push({ actor: X, msg: M('ai.blocwar', { a: X, t: E, b: Y }), tone: 'bad', about: [E], big: true }); withSeat(S, E, () => grantCB(S, X, 'attacked', 20)); } else R.world.push({ actor: X, msg: M('ai.blocwar', { a: X, t: E, b: Y }), tone: 'warn', about: [E], big: true }); } } }
  }
  // 附庸随宗主国参战：只对主要交战国（非附庸），忠诚度低的附庸（如维希政权）不会自动参战
  for (const X of IDS) { const x = S.actors[X]; if (!indep(S, X) || !x.overlord || isHuman(S, X) || x.loyal < 0.45 || (sc().noJoin || []).includes(X)) continue; for (const e of enemies(S, x.overlord)) { const y = S.actors[e]; if (atWar(S, X, e) || !indep(S, e) || y.overlord || hasTreaty(S, X, e, 'nap')) continue; if (chance(S, 0.2 + 0.4 * x.loyal)) declareWar(S, X, e); } }
}

/* ---------- 行动的集结与发动（每回合） ---------- */
/* 剧本：某些历史上旷日持久的战争在指定回合前不会因 AI 调停而停火（如两伊战争、朝鲜战争） */
const warLocked = (S, a, b) => (sc().warLock || []).some(([x, y, t]) => ((x === a && y === b) || (x === b && y === a)) && S.turn < t) || (!!S.warLockX && S.warLockX.some(([x, y, t]) => ((x === a && y === b) || (x === b && y === a)) && S.turn < t)); // warLockX：精细战区（联机版）附加的锁定
function opsTurn(S, R) {
  for (const o of S.ops.slice()) {
    if (!S.ops.includes(o)) continue;
    if (!indep(S, o.owner) || S.actors[o.target].ctrl === o.owner || boss(S, o.target) === o.owner) { S.ops = S.ops.filter(z => z !== o); continue; }
    if (o.hold || (o.ulti && S.ultis.some(u => u.id === o.ulti && u.status === 'open'))) { detectOp(S, o, R); continue; }
    if (S.turn < o.ready) { detectOp(S, o, R); continue; }
    if (!isHuman(S, o.owner)) {
      const x = S.actors[o.owner];
      const avail = vmin(o.v, shareV(S, o.owner, o.from));
      const est = estimateOp(S, o.owner, o.target, avail, o.kind) * (o.core ? coreDeter(S, o) : nukeDeter(S, o.owner, o.target));
      const need = o.script ? 0 : o.core ? coreNeed(S, o) : 1.25 - x.risk * 0.35; // 历史事件脚本中的战争照常发动
      if (groundV(S, o.owner, avail) < groundV(S, o.owner, o.v) * 0.6 && o.delays < 2) { o.delays++; o.ready = S.turn + 1; continue; }
      if (est < need) {
        if (o.delays < 1 && est >= need * 0.8) { o.delays++; o.ready = S.turn + 1; continue; }
        S.ops = S.ops.filter(z => z !== o);
        for (const H of humansOf(S)) if (o.det.includes(H)) RP(S, H, R).intel.push({ msg: M('in.cancel', { a: o.owner, t: o.target }), tone: 'good', about: [o.owner] });
        continue;
      }
    }
    launchOp(S, o, R);
  }
}
function detectOp(S, o, R) {
  for (const O of IDS) {
    if (O === o.owner || !indep(S, O) || o.det.includes(O)) continue;
    const T = o.target, Dd = boss(S, T);
    let rel_ = 0.3;
    if (O === T || O === Dd) rel_ = 1.3; else if (isAlly(S, O, Dd) || isAlly(S, O, T) || isPartner(S, O, T)) rel_ = 1.0; else if (dist(O, T) < 3000) rel_ = 0.8; else if (intelOf(S, O) >= 80) rel_ = 0.9;
    const p = clamp((0.2 + intelOf(S, O) / 200 + dotw(S, o.owner, o.v) * 0.6 - intelOf(S, o.owner) / 400) * rel_, 0.03, 0.95);
    if (!chance(S, p)) continue;
    o.det.push(O);
    if (isHuman(S, O)) RP(S, O, R).intel.push({ msg: M('in.massing', { a: o.owner, t: o.target, l: o.from, n: Math.max(1, o.ready - S.turn) }), tone: 'bad', about: [o.owner, o.target], big: true });
    if (O === o.target || O === Dd) { S.actors[O].flags.alert = { op: o.id, turn: S.turn }; if (isHuman(S, o.owner)) withSeat(S, o.owner, () => remember(S, O, M('mem.massing'), -12)); }
  }
}

/* ---------- 来函 ---------- */
function mkOffer(S, from, deal, msg) { return { id: 'O' + S.seq++, from, deal, msg, turn: S.turn, expires: S.turn + 2 }; }
function pushOffer(S, o) { if (S.inbox.some(x => x.from === o.from && x.deal.type === o.deal.type)) return false; S.inbox.push(o); return true; }

/* ---------- 危机事件 ---------- */
/* 按中国标准处理的国家（S.shield）：危机里不出现它的负面内容——玩家是它时没有国内罢工抗议、恐怖袭击、金融动荡；
 * 它不作为相撞、扣船、间谍、使馆示威、难民、叛逃、网络攻击嫌疑、威胁别国、“转移矛头”的对象 */
const CR_SELF_NEG = new Set(['strike_home', 'terror', 'market']);
const CR_P_NEG = { collision: ['a'], seizure: ['a'], spy: ['a'], embassy: ['a'], defector: ['a'], cyber_unknown: ['a'], refugees: ['a'], ally_help: ['b'], strike_home: ['b'], terror: ['b'] };
function crShieldCtx(S, kind, ctx) {
  if (!S.shield || !S.shield.length) return false;
  if (CR_SELF_NEG.has(kind) && SHD(S, S.player)) return true;
  if (!ctx) return false;
  if ((CR_P_NEG[kind] || []).includes('a') && (SHD(S, ctx.X) || SHD(S, ctx.N))) return true;
  return kind === 'ally_help' && SHD(S, ctx.X);
}
const crShieldP = (S, kind, p) => !!(S.shield && S.shield.length && p && (CR_P_NEG[kind] || []).some(k => SHD(S, typeof p[k] === 'string' ? p[k] : p[k] && p[k].id)));
function queueCrisis(S, kind, ctx) {
  if (S.neutral && ctx && Object.values(ctx).some(v => typeof v === 'string' && NEU(S, v))) return null;
  if (crShieldCtx(S, kind, ctx)) return null;
  if (S.crises.filter(c => !c.resolved).length >= 3 || S.crises.some(c => c.kind === kind && !c.resolved)) return null;
  const def = CRISES.find(c => c.id === kind); if (!def) return null;
  const b = def.build(S, ctx); if (!b || crShieldP(S, kind, b.p)) return null;
  const c = Object.assign({ id: 'K' + S.seq++, kind, src: 'rule', turn: S.turn, deadline: S.turn + 1, title: M('cr.' + kind + '.t', b.p), text: M('cr.' + kind + '.x', b.p) }, b);
  c.options = b.options.map((o, i) => Object.assign({ label: M('cr.' + kind + '.o' + (i + 1), b.p) }, o));
  c.from = ctx.Y || ctx.A || ctx.X || null;
  S.crises.push(c);
  return c;
}
function pickRival(S, filter) {
  const P = S.player; const c = IDS.filter(X => !isHuman(S, X) && indep(S, X) && !NEU(S, X) && filter(X)); if (!c.length) return null;
  return c.sort((a, b) => rel(S, a, P) - rel(S, b, P))[0];
}
const pctGDP = (S, p) => S.actors[S.player].gdp * p / 100;
const CRISES = [
 { id: 'collision', w: 1, cond: S => { const X = pickRival(S, X => (near(X, S.player, 1500) || forcesNear(S, X, S.player, 1500) > 0.02) && (rel(S, X, S.player) < -30 || (S.tension2[rk(X, S.player)] || 0) > 20)); return X && { X }; },
   build: (S, c) => ({ p: { a: c.X }, actors: [c.X], def: 1, options: [
     { effects: [{ type: 'rel', b: c.X, delta: -8 }, { type: 'fac', pub: 4 }, { type: 'tension', target: c.X, delta: 10 }, { type: 'chance', p: 0.4, then: [{ type: 'rep', cred: 4 }, { type: 'rel', b: c.X, delta: 6 }] }] },
     { effects: [{ type: 'tension', target: c.X, delta: -10 }, { type: 'fac', pub: -3, mil: -3 }, { type: 'rel', b: c.X, delta: 3 }] },
     { effects: [{ type: 'tension', target: c.X, delta: 15 }, { type: 'fac', mil: 4 }, { type: 'threat', target: c.X, delta: 8 }, { type: 'cb', target: c.X, turns: 6 }] }] }) },
 { id: 'seizure', w: 1, cond: S => { const X = pickRival(S, X => !LANDLOCKED.has(X) && rel(S, X, S.player) < -20 && navyEff(S, X) > 5); return X && { X }; },
   build: (S, c) => { const P = S.player; const nr = navyEff(S, P) / Math.max(1, navyEff(S, c.X)); const ps = clamp(0.3 + nr * 0.25, 0.1, 0.9); return { p: { a: c.X }, actors: [c.X], def: 0, options: [
     { effects: [{ type: 'rel', b: c.X, delta: -5 }, { type: 'chance', p: 0.5, then: [{ type: 'fac', pub: 2 }], else: [{ type: 'fac', pub: -3 }] }] },
     { effects: [{ type: 'chance', p: +ps.toFixed(2), then: [{ type: 'fac', pub: 6, mil: 4 }, { type: 'rel', b: c.X, delta: -15 }, { type: 'tension', target: c.X, delta: 20 }, { type: 'cb', target: c.X, turns: 6 }], else: [{ type: 'fac', pub: -6 }, { type: 'mil', target: P, branch: 'navy', pct: -3 }, { type: 'rel', b: c.X, delta: -10 }] }] },
     { effects: [{ type: 'sanction', target: c.X, level: 1, kind: 'econ' }, { type: 'rel', b: c.X, delta: -10 }, { type: 'fac', biz: -2 }] }] }; } },
 { id: 'spy', w: 1, cond: S => { const X = pickRival(S, X => rel(S, X, S.player) < 0 && intelOf(S, X) >= 50); return X && { X }; },
   build: (S, c) => ({ p: { a: c.X }, actors: [c.X], def: 0, options: [
     { effects: [{ type: 'rel', b: c.X, delta: -8 }, { type: 'fac', pub: 2 }, { type: 'intel', delta: 1 }] },
     { effects: [{ type: 'rel', b: c.X, delta: 2 }, { type: 'intel', delta: 2 }] },
     { effects: [{ type: 'intel', delta: 5 }, { type: 'chance', p: 0.3, then: [{ type: 'rel', b: c.X, delta: -10 }] }] }] }) },
 { id: 'embassy', w: 0.8, cond: S => { const X = pickRival(S, X => S.actors[X].stab < 45 && rel(S, X, S.player) < 10); return X && { X }; },
   build: (S, c) => ({ p: { a: c.X }, actors: [c.X], def: 0, options: [
     { effects: [{ type: 'chance', p: 0.6, then: [{ type: 'treasury', delta: +(pctGDP(S, 0.002)).toFixed(2) }, { type: 'rel', b: c.X, delta: -4 }], else: [{ type: 'rel', b: c.X, delta: -10 }] }] },
     { effects: [{ type: 'sanction', target: c.X, level: 1, kind: 'econ' }, { type: 'rel', b: c.X, delta: -15 }, { type: 'fac', pub: 3 }] },
     { effects: [{ type: 'chance', p: 0.8, then: [{ type: 'fac', pub: 5, mil: 3 }, { type: 'rel', b: c.X, delta: -8 }], else: [{ type: 'fac', pub: -6 }, { type: 'rel', b: c.X, delta: -15 }] }] }] }) },
 { id: 'ally_help', w: 0, cond: () => null,
   build: (S, c) => { const P = S.player; const dest = canStation(S, P, c.Y) ? c.Y : IDS.find(L => canStation(S, P, L) && near(L, c.Y, 450)); return { p: { a: c.Y, b: c.X }, actors: [c.Y, c.X], def: 2, options: [
     { effects: (dest ? [{ type: 'deploy', to: dest, share: 0.08 }] : []).concat([{ type: 'threat', target: c.X, delta: 10 }, { type: 'rep', trust: 5, cred: 5 }, { type: 'rel', b: c.Y, delta: 10 }, { type: 'warn', target: c.X, about: c.Y }]) },
     { effects: [{ type: 'armsto', target: c.Y, amount: +(pctGDP(S, 0.1)).toFixed(1) }, { type: 'rel', b: c.Y, delta: 6 }, { type: 'rep', trust: 2 }] },
     { effects: [{ type: 'rel', b: c.Y, delta: -15 }, { type: 'rep', trust: -8 }] }] }; } },
 { id: 'ally_attacked', w: 0, cond: () => null,
   build: (S, c) => { const P = S.player; const dest = canStation(S, P, c.Y) ? c.Y : IDS.find(L => canStation(S, P, L) && near(L, c.Y, 450)); return { p: { a: c.Y, b: c.X }, actors: [c.Y, c.X], def: 1, options: [
     { effects: [{ type: 'declare', target: c.X }].concat(dest ? [{ type: 'deploy', to: dest, share: 0.12 }] : []).concat([{ type: 'rep', trust: 8, cred: 8 }, { type: 'rel', b: c.Y, delta: 15 }]) },
     { effects: [{ type: 'armsto', target: c.Y, amount: +(pctGDP(S, 0.2)).toFixed(1) }, { type: 'rep', trust: -5 }, { type: 'rel', b: c.Y, delta: -8 }] },
     { effects: [{ type: 'rep', trust: -15, cred: -10 }, { type: 'rel', b: c.Y, delta: -30 }, { type: 'untreaty', target: c.Y, treaty: 'alliance' }] }] }; } },
 { id: 'strike_home', w: 1, cond: S => (S.pol.fac.pub < 45 || S.actors[S.player].lastG < 0.2) ? {} : null,
   build: (S, c) => { const R_ = pickRival(S, X => rel(S, X, S.player) < -20); return { p: { b: R_ || S.player }, actors: [], def: 0, options: [
     { effects: [{ type: 'treasury', delta: -(pctGDP(S, 0.3)).toFixed(1) }, { type: 'fac', pub: 8, biz: -4 }] },
     { effects: [{ type: 'stab', target: S.player, delta: 3 }, { type: 'fac', pub: DEF[S.player].gov === 'dem' ? -12 : -8 }, { type: 'rep', trust: -2 }] },
     R_ ? { effects: [{ type: 'fac', pub: 4 }, { type: 'rel', b: R_, delta: -10 }, { type: 'tension', target: R_, delta: 10 }] } : { effects: [{ type: 'fac', pub: 2, mil: 2 }] }] }; } },
 { id: 'market', w: 1, cond: S => (S.actors[S.player].lastG < 0 || S.sanctions.filter(s => s.to === S.player && s.level >= 2).length >= 3) ? {} : null,
   build: (S) => { const P = S.player; const A_ = IDS.filter(X => X !== P && indep(S, X) && rel(S, X, P) > 40).sort((a, b) => S.actors[b].gdp - S.actors[a].gdp)[0]; return { p: { b: A_ || P }, actors: A_ ? [A_] : [], def: 0, options: [
     { effects: [{ type: 'treasury', delta: -(pctGDP(S, 0.5)).toFixed(1) }, { type: 'gdp', target: P, pct: 1 }, { type: 'fac', biz: 4 }] },
     A_ ? { effects: [{ type: 'chance', p: clamp(rel(S, A_, P) / 100, 0.2, 0.9), then: [{ type: 'treasury', delta: +(pctGDP(S, 0.3)).toFixed(1) }, { type: 'infl_on_me', target: A_, delta: 5 }], else: [{ type: 'fac', pub: -2 }] }] } : { effects: [{ type: 'fac', pub: -2 }] },
     { effects: [{ type: 'stab', target: P, delta: 2 }, { type: 'fac', biz: -8 }, { type: 'growth', target: P, pct: -0.8, turns: 4 }] }] }; } },
 { id: 'refugees', w: 0.8, cond: S => { const N = IDS.find(X => X !== S.player && (landAdj(X, S.player) || dist(X, S.player) < 800) && (enemies(S, X).length || S.actors[X].stab < 30)); return N && { N }; },
   build: (S, c) => ({ p: { a: c.N }, actors: [c.N], def: 1, options: [
     { effects: [{ type: 'fac', pub: -4 }, { type: 'rep', trust: 3 }, { type: 'rel', b: c.N, delta: 8 }] },
     { effects: [{ type: 'fac', pub: 2 }, { type: 'rel', b: c.N, delta: -6 }, { type: 'rep', trust: -2 }] },
     { effects: [{ type: 'treasury', delta: -(pctGDP(S, 0.1)).toFixed(1) }, { type: 'infl', target: c.N, delta: 8 }, { type: 'rel', b: c.N, delta: 10 }] }] }) },
 { id: 'border_clash', w: 1, cond: S => { const X = pickRival(S, X => landAdj(X, S.player) && (rel(S, X, S.player) < -20 || (S.tension2[rk(X, S.player)] || 0) >= 30)); return X && { X }; },
   build: (S, c) => ({ p: { a: c.X }, actors: [c.X], def: 0, options: [
     { effects: [{ type: 'tension', target: c.X, delta: -10 }, { type: 'fac', mil: -4, pub: -2 }] },
     { effects: [{ type: 'mil', target: c.X, branch: 'land', pct: -2 }, { type: 'mil', target: S.player, branch: 'land', pct: -1 }, { type: 'tension', target: c.X, delta: 15 }, { type: 'rel', b: c.X, delta: -12 }, { type: 'fac', mil: 4, pub: 3 }, { type: 'cb', target: c.X, turns: 4 }] },
     { effects: [{ type: 'mobilize', level: 2 }, { type: 'fac', mil: 6 }, { type: 'threat', target: c.X, delta: 10 }] }] }) },
 { id: 'defector', w: 0.7, cond: S => { const X = pickRival(S, X => S.actors[X].tech > S.actors[S.player].tech + 2); return X && { X }; },
   build: (S, c) => ({ p: { a: c.X }, actors: [c.X], def: 1, options: [
     { effects: [{ type: 'tech', target: S.player, delta: 1.5 }, { type: 'rel', b: c.X, delta: -12 }] },
     { effects: [{ type: 'rel', b: c.X, delta: 8 }, { type: 'fac', pub: -2 }] },
     { effects: [{ type: 'tech', target: S.player, delta: 1 }, { type: 'chance', p: 0.3, then: [{ type: 'rel', b: c.X, delta: -15 }] }] }] }) },
 { id: 'mediation', w: 0, cond: () => null,
   build: (S, c) => { const P = S.player; const pm = clamp(0.25 + (infl(S, P, c.A) + infl(S, P, c.B)) / 200 + (isGreat(S, P) ? 0.15 : 0) + (S.rep.trust - 50) / 200, 0.1, 0.8); return { p: { a: c.A, b: c.B }, actors: [c.A, c.B], def: 2, options: [
     { effects: [{ type: 'chance', p: +pm.toFixed(2), then: [{ type: 'peace', a: c.A, b: c.B }, { type: 'infl', target: c.A, delta: 10 }, { type: 'infl', target: c.B, delta: 10 }, { type: 'rep', trust: 5 }], else: [{ type: 'rel', b: c.A, delta: -2 }] }] },
     { effects: [{ type: 'rel', b: c.A, delta: 12 }, { type: 'rel', b: c.B, delta: -15 }, { type: 'infl', target: c.A, delta: 8 }] },
     { effects: [{ type: 'rel', b: c.A, delta: -2 }] }] }; } },
 { id: 'cyber_unknown', w: 0.8, cond: S => { const u = S.unattrib.filter(u => !u.known && u.turn >= S.turn - 2).slice(-1)[0]; const X = u ? (chance(S, 0.6) ? u.culprit : pickRival(S, X => X !== u.culprit && rel(S, X, S.player) < -10) || u.culprit) : pickRival(S, X => rel(S, X, S.player) < -30 && intelOf(S, X) > 50); return X && { X, real: u ? u.culprit : null, u }; },
   build: (S, c) => { const guilty = c.real === c.X; return { p: { a: c.X }, actors: [c.X], def: 1, options: [
     { effects: guilty ? [{ type: 'rel', b: c.X, delta: -15 }, { type: 'cb', target: c.X, turns: 8 }, { type: 'fac', pub: 3 }] : [{ type: 'rel', b: c.X, delta: -20 }, { type: 'rep', trust: -5 }] },
     { effects: [{ type: 'intel', delta: 2 }, { type: 'chance', p: 0.5, then: [{ type: 'reveal' }] }] },
     { effects: [{ type: 'gdp', target: c.X, pct: -0.6 }, { type: 'chance', p: 0.3, then: [{ type: 'rel', b: c.X, delta: -10 }] }] }] }; } },
 { id: 'terror', w: 0.8, cond: () => ({}),
   build: (S) => { const H = IDS.filter(X => ['LEV', 'EAF', 'CAS', 'WAF', 'SAS', 'CAF'].includes(X) && indep(S, X) && X !== S.player).sort((a, b) => S.actors[a].stab - S.actors[b].stab)[0] || 'LEV'; return { p: { b: H }, actors: [H], def: 0, options: [
     { effects: [{ type: 'stab', target: S.player, delta: 3 }, { type: 'fac', pub: DEF[S.player].gov === 'dem' ? -1 : 2 }] },
     { effects: [{ type: 'rel', b: H, delta: -8 }, { type: 'fac', mil: 3, pub: 4 }] },
     { effects: [{ type: 'relgreat', delta: 3 }, { type: 'intel', delta: 2 }] }] }; } },
 { id: 'disaster', w: 0.8, cond: () => ({}),
   build: (S) => ({ p: {}, actors: [], def: 0, options: [
     { effects: [{ type: 'treasury', delta: -(pctGDP(S, 0.2)).toFixed(1) }, { type: 'fac', pub: 5 }, { type: 'stab', target: S.player, delta: 2 }] },
     { effects: [{ type: 'treasury', delta: +(pctGDP(S, 0.08)).toFixed(1) }, { type: 'fac', pub: -1 }] },
     { effects: [{ type: 'fac', pub: -6 }, { type: 'gdp', target: S.player, pct: 0.3 }] }] }) },
];
function crisisTurn(S, R, haveLLM) {
  const P = S.player;
  // 盟友遭到进攻 → 盟约义务
  for (const ev of (S.turnEvents || [])) {
    if (ev.type !== 'invade' || !ev.actor || ev.actor === P) continue;
    const Y = boss(S, ev.target);
    if (Y !== P && (activeCommit(S, 'defend', Y) || hasTreaty(S, P, Y, 'alliance')) && !atWar(S, P, ev.actor)) queueCrisis(S, 'ally_attacked', { Y, X: ev.actor });
  }
  if (haveLLM) return;
  if (S.crises.some(c => !c.resolved && c.turn === S.turn)) return;
  if (!chance(S, 0.3)) return;
  const pool = CRISES.filter(c => c.w > 0).map(c => ({ c, ctx: c.cond(S) })).filter(z => z.ctx && !crShieldCtx(S, z.c.id, z.ctx));
  if (!pool.length) return;
  const tot = pool.reduce((s, z) => s + z.c.w, 0); let r = rnd(S) * tot; let pickd = pool[0];
  for (const z of pool) { r -= z.c.w; if (r <= 0) { pickd = z; break; } }
  queueCrisis(S, pickd.c.id, pickd.ctx);
}

/* ---------- 效果（危机选项、自由指令、LLM 裁定共用） ---------- */
function normalizeEffect(S, e) {
  const o = Object.assign({}, e); const num = (v, a, b, d = 0) => clamp(Number.isFinite(+v) ? +v : d, a, b);
  const g = S.actors[S.player].gdp;
  for (const k of ['target', 'a', 'b', 'to', 'about']) if (o[k]) o[k] = String(o[k]).toUpperCase();
  if (SET_TYPES.has(o.type)) return normSetting(S, o); // 设定变更（见 08c_settings）
  switch (o.type) {
    case 'rel': o.delta = Math.round(num(o.delta, -30, 30)); break;
    case 'infl': case 'infl_on_me': o.delta = Math.round(num(o.delta, -20, 25)); break;
    case 'stab': o.delta = Math.round(num(o.delta, -15, 10)); break;
    case 'gdp': o.pct = +num(o.pct, -6, 4).toFixed(1); break;
    case 'growth': o.pct = +num(o.pct, -2, 2).toFixed(1); o.turns = Math.round(num(o.turns, 1, 8, 4)); break;
    case 'mil': o.pct = Math.round(num(o.pct, -20, 15)); break;
    case 'tech': o.delta = +num(o.delta, -5, 5).toFixed(1); break;
    case 'treasury': o.delta = +num(o.delta, -g * 0.03, g * 0.01).toFixed(1); break;
    case 'sanction': o.level = Math.round(num(o.level, 1, 3, 1)); break;
    case 'war': o.commit = +num(o.commit, 0.2, 0.8, 0.45).toFixed(2); break;
    case 'fac': for (const k of ['mil', 'biz', 'pub']) if (k in o) o[k] = Math.round(num(o[k], -15, 15)); break;
    case 'threat': case 'tension': o.delta = Math.round(num(o.delta, -25, 25)); break;
    case 'rep': for (const k of ['trust', 'aggr', 'cred']) if (k in o) o[k] = Math.round(num(o[k], -25, 15)); break;
    case 'cb': o.turns = Math.round(num(o.turns, 1, 10, 6)); break;
    case 'deploy': o.share = +num(o.share, 0.01, 0.3, 0.08).toFixed(2); break;
    case 'aidto': case 'armsto': o.amount = +num(o.amount, 0, g * 0.02).toFixed(1); break;
    case 'mobilize': o.level = Math.round(num(o.level, 0, 3, 1)); break;
    case 'intel': o.delta = Math.round(num(o.delta, -5, 6)); break;
    case 'resist': o.delta = Math.round(num(o.delta, -20, 20)); break;
    case 'relgreat': o.delta = Math.round(num(o.delta, -10, 10)); break;
    case 'chance': o.p = +num(o.p, 0.05, 0.95, 0.5).toFixed(2); o.then = (Array.isArray(o.then) ? o.then : []).slice(0, 6).map(z => normalizeEffect(S, z)); o.else = (Array.isArray(o.else) ? o.else : []).slice(0, 6).map(z => normalizeEffect(S, z)); break;
  }
  return o;
}
function applyEffect(S, e, R, depth = 0) {
  if (S.neutral && e && ['target', 'a', 'b', 'to', 'about', 't', 'loc', 'with', 'from'].some(k => typeof e[k] === 'string' && NEU(S, String(e[k]).toUpperCase()))) return null; // 涉及中立地区的效果不生效
  const P = S.player; const ok = id => id && S.actors[id];
  const T = e.target || e.b;
  if (SET_TYPES.has(e.type)) return applySetting(S, e, R);
  switch (e.type) {
    case 'rel': { const a = ok(e.a) ? e.a : P, b = ok(e.b) ? e.b : T; if (ok(b) && a !== b) { addRel(S, a, b, e.delta); return M('fx.rel', { a, b, d: e.delta }); } break; }
    case 'infl': if (ok(T) && T !== P) { addInfl(S, P, T, e.delta); return M('fx.infl', { t: T, d: e.delta }); } break;
    case 'infl_on_me': if (ok(T)) { addInfl(S, T, P, e.delta); return M('fx.inflme', { t: T, d: e.delta }); } break;
    case 'stab': if (ok(T)) { S.actors[T].stab = clamp(S.actors[T].stab + e.delta, 0, 100); return M('fx.stab', { t: T, d: e.delta }); } break;
    case 'gdp': if (ok(T)) { S.actors[T].gdp *= 1 + e.pct / 100; return M('fx.gdp', { t: T, d: e.pct }); } break;
    case 'growth': if (ok(T)) { S.actors[T].mods.push({ g: e.pct / 4, turns: e.turns || 4, src: 'order' }); return M('fx.growth', { t: T, d: e.pct, n: e.turns || 4 }); } break;
    case 'mil': if (ok(T)) { const d = e.pct / 100; const br = ['land', 'navy', 'air'].includes(e.branch) ? [e.branch] : ['land', 'navy', 'air']; for (const b of br) S.actors[T][b] *= 1 + d; return M('fx.mil', { t: T, d: e.pct }); } break;
    case 'tech': if (ok(T)) { S.actors[T].tech = clamp(S.actors[T].tech + e.delta, 0, 100); return M('fx.tech', { t: T, d: e.delta }); } break;
    case 'treasury': S.actors[P].treasury += e.delta; return M('fx.treasury', { m: $m(e.delta) });
    case 'sanction': if (ok(T) && T !== P) { const kind = ['econ', 'tech', 'tariff', 'fin', 'energy'].includes(e.kind) ? e.kind : 'econ'; addSanction(S, P, T, kind, e.level || 1); addRel(S, P, T, -8 * (e.level || 1)); afterPlayerAction(S, 'sanction', T, { level: e.level }, R); return M('fx.sanction', { t: T, n: e.level || 1 }); } break;
    case 'treaty': if (ok(T) && T !== P && TREATY_TYPES.includes(e.treaty)) { if (RULES3 && isHuman(S, T)) return M('fx.treaty.human', { t: T }); if (e.treaty === 'access' && noBase(S, P, T)) return M('fx.treaty.no3', { t: T, k: M('tr.access'), x: M('dl.nobase', { t: NBH(S, T) }) }); const d = decide(S, P, T, { type: e.treaty }); if (d.ok) { if (RULES3) { if (!S._res3) { pendCmd3(S, T, [{ type: e.treaty }]); return M('fx.treaty.q', { t: T, k: M('tr.' + e.treaty) }); } const w = ['alliance', 'partner', 'access'].includes(e.treaty) ? alignBlock3(S, P, T) : null; if (w) return M('fx.treaty.no3', { t: T, k: M('tr.' + e.treaty), x: w }); } addTreaty(S, e.treaty, P, T); if (e.treaty === 'alliance') addCommit(S, 'defend', T, null, 'alliance'); if (e.treaty === 'nap') addCommit(S, 'no_attack', T, null, 'nap'); return M('fx.treaty.ok', { t: T, k: M('tr.' + e.treaty) }); } return M('fx.treaty.no', { t: T, k: M('tr.' + e.treaty) }); } break;
    case 'untreaty': if (ok(T)) { removeTreaty(S, e.treaty || 'alliance', P, T); S.commits = S.commits.filter(c => !(c.with === T && c.type === 'defend')); return M('fx.untreaty', { t: T, k: M('tr.' + (e.treaty || 'alliance')) }); } break;
    case 'war': if (ok(T) && T !== P) { if (S.actors[T].ctrl === P) break; const r = createOp(S, P, T, e.commit || 0.45, false); if (r.op) { r.op.legit = !!legitCB(S, boss(S, T)); return M('fx.war', { t: T, n: Math.max(0, r.op.ready - S.turn) }); } return M('fx.noroute', { t: T }); } break;
    case 'declare': if (ok(T) && T !== P) { const D = boss(S, T); if (!atWar(S, P, D)) { declareWar(S, P, D); logEvent(S, 'war', M('m.war', { a: P, b: D }), 'warn', [P, D]); pushEv(S, { type: 'declare', actor: P, target: D, sev: 40, legit: true }); } return M('fx.declare', { t: D }); } break;
    case 'vassal': if (ok(T) && T !== P && indep(S, T)) { if (RULES3 && isHuman(S, T)) return M('fx.treaty.human', { t: T }); const d = decide(S, P, T, { type: 'vassal' }, 0.2); if (d.ok) { if (RULES3) { const w = dealClash3(S, P, T, { type: 'vassal' }); if (w) return M('fx.vassal.no3', { t: T, x: w }); if (!S._res3) { pendCmd3(S, T, [{ type: 'vassal' }]); return M('fx.vassal.q', { t: T }); } } makeVassal(S, T, P); return M('fx.vassal.ok', { t: T }); } return M('fx.vassal.no', { t: T }); } break;
    case 'fac': { const d = {}; for (const k of ['mil', 'biz', 'pub']) if (e[k]) d[k] = e[k]; facAdd(S, d); return M('fx.fac', { x: { list: Object.entries(d).map(([k, v]) => M('fx.fac1', { k: M('fac.' + k), d: v })) } }); }
    case 'threat': if (ok(T) && T !== P) { S.threat[T] = clamp((S.threat[T] || 0) + e.delta, 0, 100); return M('fx.threat', { t: T, d: e.delta }); } break;
    case 'tension': if (ok(T) && T !== P) { const k = rk(P, T); S.tension2[k] = clamp((S.tension2[k] || 0) + e.delta, 0, 100); return M('fx.tension', { t: T, d: e.delta }); } break;
    case 'rep': { const d = {}; for (const k of ['trust', 'aggr', 'cred']) if (e[k]) d[k] = e[k]; repAdd(S, d); return M('fx.rep', { x: { list: Object.entries(d).map(([k, v]) => M('fx.rep1', { k: M('rep.' + k), d: v })) } }); }
    case 'cb': if (ok(T) && T !== P) { grantCB(S, T, 'incident', e.turns || 6); return M('fx.cb', { t: T, n: e.turns || 6 }); } break;
    case 'deploy': { const to = e.to || T; if (ok(to) && canStation(S, P, to)) { const mv = orderMove(S, P, P, to, e.share || 0.08); if (mv > 0) return M('fx.deploy', { l: to, s: { pct: mv } }); } return M('fx.nodeploy', { l: to || '?' }); }
    case 'aidto': case 'armsto': if (ok(T) && T !== P && indep(S, T)) { const amt = e.amount || 0; S.actors[P].treasury -= amt; const y = S.actors[T]; if (e.type === 'armsto') armsTransfer(S, P, T, amt); else y.treasury += amt; addInfl(S, P, T, clamp(amt / y.gdp * 300, 1, 12)); addRel(S, P, T, 5); return M(e.type === 'armsto' ? 'fx.armsto' : 'fx.aidto', { t: T, m: $m(amt) }); } break;
    case 'mobilize': S.actors[P].mob = Math.max(S.actors[P].mob, e.level || 1); return M('fx.mobilize', { k: M('mob.' + S.actors[P].mob) });
    case 'intel': { const x = S.actors[P]; x.intel = clamp(intelOf(S, P) + e.delta, 0, 100); return M('fx.intel', { d: e.delta }); }
    case 'resist': if (ok(T)) { S.actors[T].resist = clamp(S.actors[T].resist + e.delta, 0, 100); return M('fx.resist', { t: T, d: e.delta }); } break;
    case 'peace': if (ok(e.a) && ok(e.b) && atWar(S, e.a, e.b)) { makePeace(S, e.a, e.b, 'ceasefire', R); return M('fx.peace', { a: e.a, b: e.b }); } break;
    case 'warn': if (ok(T) && ok(e.about)) { if (!S.warnings.some(w => w.by === P && w.to === T && w.about === e.about)) S.warnings.push({ by: P, to: T, about: e.about, conseq: 'war', until: S.turn + 8, since: S.turn }); return M('fx.warn', { t: T, b: e.about }); } break;
    case 'relgreat': { for (const X of IDS) if (X !== P && isGreat(S, X)) addRel(S, P, X, e.delta); return M('fx.relgreat', { d: e.delta }); }
    case 'reveal': { const u = S.unattrib.filter(u => !u.known).slice(-1)[0]; if (u) { u.known = true; grantCB(S, u.culprit, 'covert', 8); return M('fx.reveal', { t: u.culprit, x: M('uk.' + u.type) }); } return M('fx.noreveal'); }
    case 'chance': { if (depth > 2) break; const hit = chance(S, e.p); const res = (hit ? e.then : e.else) || []; const done = res.map(z => applyEffect(S, z, R, depth + 1)).filter(Boolean); return M(hit ? 'fx.chance_hit' : 'fx.chance_miss', { x: { list: done } }); }
    case 'event': return String(e.text || '').slice(0, 100);
  }
  return null;
}
function resolveCrisis(S, id, choice, R) {
  const c = S.crises.find(z => z.id === id && !z.resolved); if (!c) return null;
  let effects = [], label = '';
  if (typeof choice === 'number') { const o = c.options[choice] || c.options[c.def || 0]; effects = o.effects || []; label = o.label; }
  else if (choice && Array.isArray(choice.effects)) { effects = choice.effects.map(e => normalizeEffect(S, e)); label = ltxt(choice.summary, 60); }
  const done = effects.slice(0, 10).map(e => applyEffect(S, e, R)).filter(Boolean);
  c.resolved = true; c.choice = label;
  const msg = M('cr.resolved', { x: c.title, k: label });
  logEvent(S, 'crisis', msg, 'info', [S.player].concat(c.actors || []));
  return { label, done };
}

/* ---------- 规则 AI：对玩家行动的即时反应 ---------- */
const STANCES = ['强烈反对', '反对', '关切', '中立', '支持', '欢迎'];
const STANCE_KEY = { '强烈反对': 'sh', '反对': 'op', '关切': 'co', '中立': 'ne', '支持': 'su', '欢迎': 'we' };
const STANCE_EN = { 'strongly opposes': '强烈反对', opposes: '反对', concerned: '关切', neutral: '中立', supports: '支持', welcomes: '欢迎' };
function relevance(S, X, ev) {
  const sev = ev.sev || 0, Ac = ev.actor, T = ev.target;
  if ((!Ac && !T) || Ac === X || ev.hidden) return 0;
  if (T === X) return sev;
  let s = 0;
  if (T) {
    if (sev > 0) { const aff = (isAlly(S, X, T) ? 0.6 : isPartner(S, X, T) ? 0.4 : 0) + rel(S, X, T) / 200 - (Ac ? rel(S, X, Ac) / 200 + (isAlly(S, X, Ac) ? 0.3 : 0) : 0); s += sev * clamp(aff, -0.5, 1); }
    else if (rel(S, X, T) < -40) s += -sev * 0.35 + (ev.arms ? 10 : 0);
  }
  if (ev.third) s += ev.third * clamp(0.5 - (Ac ? rel(S, X, Ac) : 0) / 120, 0, 1.2) * (dist(X, Ac || T) < 2500 ? 1.2 : 0.8);
  if (Ac && sev >= 40 && (landAdj(X, Ac) || dist(X, Ac) < 800)) s += sev * 0.2 * clamp(0.5 - rel(S, X, Ac) / 100, 0, 1);
  if (['USA', 'CHN', 'RUS'].includes(X) && sev >= 40 && Ac) s += sev * 0.2 * clamp(0.5 - rel(S, X, Ac) / 100, -0.3, 1);
  return s;
}
function reactionCandidates(S, limit = 10) {
  const evs = (S.turnEvents || []).filter(e => e.actor === S.player);
  const out = [];
  for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X) || S.actors[X].overlord === S.player || NEU(S, X)) continue;
    let pos = 0, neg = 0; for (const e of evs) { const r = relevance(S, X, e); if (r > 0) pos += r; else neg -= r; }
    const sc = pos + neg * 0.7;
    if (sc >= 7) out.push({ id: X, score: sc, g: pos, f: neg });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
function addReaction(R, r) { const o = R.reactions.find(z => z.actor === r.actor); if (o) { o.actions.push(...r.actions); if (r.src === 'llm' && o.src !== 'llm') { o.statement = r.statement; o.stance = r.stance; o.reason = r.reason; o.src = 'llm'; } return o; } R.reactions.push(r); return r; }
function aiDo(S, X, act, R) {
  const t = act.target && S.actors[act.target] ? act.target : null; const x = S.actors[X];
  if (S.neutral && (NEU(S, X) || NEU(S, t) || ['enemy', 'with', 'about', 'to'].some(k => typeof act[k] === 'string' && NEU(S, String(act[k]).toUpperCase())))) return null; // 中立地区不行动，也不能被当作对象
  if (S.shield && SHD(S, X) && (act.type === 'cyber' || act.type === 'nuke_threat')) return null; // 按中国标准处理的国家：不发动网络攻击，不进行核威胁
  try {
    switch (act.type) {
      case 'none': return null;
      case 'condemn': if (t) { addRel(S, X, t, -8); return M('ra.condemn', { t }); } break;
      case 'expel': if (t) { addRel(S, X, t, -12); return M('ra.expel', { t }); } break;
      case 'recall': if (t) { addRel(S, X, t, -6); return M('ra.recall', { t }); } break;
      case 'sanction': case 'tariff': case 'tech_ban': case 'energy_embargo': {
        if (!t || t === X) break;
        const kind = act.type === 'tariff' ? 'tariff' : act.type === 'tech_ban' ? 'tech' : act.type === 'energy_embargo' ? 'energy' : (['econ', 'fin', 'tech', 'tariff', 'energy'].includes(act.kind) ? act.kind : 'econ');
        if (kind === 'fin' && DEF[X].fin < 2) return aiDo(S, X, { type: 'sanction', target: t, level: act.level }, R);
        if (kind === 'energy' && DEF[X].energy < 1) break;
        const L = clamp(act.level | 0 || 1, 1, 3); addSanction(S, X, t, kind, kind === 'econ' ? L : 1); addRel(S, X, t, -6 * L);
        return M('ra.sanction', { t, k: M(kind === 'econ' ? 'sl.' + L : 'sk.' + kind) }); }
      case 'lift': if (t) { removeSanctions(S, X, t); addRel(S, X, t, 6); return M('ra.lift', { t }); } break;
      case 'buildup': { const pct = clamp(+act.pct || 0.3, 0.1, 1.5); x.milPct = clamp(x.milPct + pct, 0.3, 30); x.flags.buildupTo = S.turn + 6; return M('ra.buildup', { n: +x.milPct.toFixed(1) }); }
      case 'mobilize': { const L = clamp(act.level | 0 || 1, 0, 3); if (L > x.mob) { x.mob = L; return M('ra.mobilize', { k: M('mob.' + L) }); } break; }
      case 'arms_aid': case 'aid': if (t && t !== X && indep(S, t)) { const c = x.gdp * clamp(+act.pct || 0.1, 0.02, 0.5) / 100; const y = S.actors[t]; if (act.type === 'arms_aid') armsTransfer(S, X, t, c); else { y.treasury += c; y.mods.push({ g: clamp(c / y.gdp * 40, 0.05, 1), turns: 3, src: 'aid' }); } addRel(S, X, t, 5); addInfl(S, X, t, 3); x.treasury -= c; return M(act.type === 'arms_aid' ? 'ra.armsaid' : 'ra.aid', { t, m: $m(c) }); } break;
      case 'improve': if (t) { addRel(S, X, t, clamp(+act.delta || 8, 2, 15)); return M('ra.improve', { t }); } break;
      case 'alliance': if (t && t !== X && indep(S, t) && !isAlly(S, X, t) && !atWar(S, X, t) && !alignBlock3(S, X, t)) { if (isHuman(S, t)) { withSeat(S, t, () => pushOffer(S, mkOffer(S, X, { type: 'alliance' }, act.text || M('of.alliance', { a: X })))); return M('ra.offer_alliance'); } const d = decide(S, X, t, { type: 'alliance' }); if (d.ok) { addTreaty(S, 'alliance', X, t); addRel(S, X, t, 8); return M('ra.allied', { t }); } return M('ra.ally_try', { t }); } break;
      case 'partner': if (t && t !== X && indep(S, t) && !isAlly(S, X, t) && !alignBlock3(S, X, t)) { addTreaty(S, 'partner', X, t); addRel(S, X, t, 6); return M('ra.partner', { t }); } break;
      case 'trade': if (t && t !== X && indep(S, t) && !hasTreaty(S, X, t, 'trade')) { if (isHuman(S, t)) { withSeat(S, t, () => pushOffer(S, mkOffer(S, X, { type: 'trade' }, act.text || M('of.trade', { a: X })))); return M('ra.offer_trade'); } addTreaty(S, 'trade', X, t); return M('ra.trade', { t }); } break;
      case 'cancel_treaty': if (t) { const had = treatiesOf(S, X, t); if (had.length) { S.treaties = S.treaties.filter(h => !had.includes(h)); resetExposure(S); addRel(S, X, t, -15); return M('ra.cancel', { t, x: { list: had.map(h => M('tr.' + h.type)) } }); } } break;
      case 'exercise': if (t) { addRel(S, X, t, -5); if (isHuman(S, t)) S.actors[t].fear[X] = S.turn + 2; return M('ra.exercise', { t }); } break;
      case 'cyber': if (t && t !== X) { const y = S.actors[t]; y.gdp *= 1 - between(S, 0.4, 1.0) / 100; y.stab = clamp(y.stab - 1, 0, 100); addRel(S, X, t, -10); return M('ra.cyber', { t }); } break;
      case 'strike': if (t && t !== X && indep(S, t) && canStrike(S, X, t)) { const P_ = strikePower(S, X, t), D_ = airEff(S, t) * share(S, t, t) * 0.5 * DEF[t].terr, fr = clamp(0.04 + 0.12 * P_ / (P_ + D_ + 1), 0.03, 0.16); const y = S.actors[t]; y.land *= 1 - fr * 0.7; y.air *= 1 - fr; y.navy *= 1 - fr * 0.6; y.gdp *= 0.995; addRel(S, X, t, -30); S.tension = clamp(S.tension + 4, 0, 100); if (isHuman(S, t)) withSeat(S, t, () => grantCB(S, X, 'attacked', 12)); return M('ra.strike', { t, s: { pct: fr } }); } break;
      case 'join_war': { const en = act.enemy && S.actors[act.enemy] ? boss(S, act.enemy) : (t || null); if (!en || en === X || atWar(S, X, en) || !indep(S, en) || (RULES3 && aligned(S, X, en))) break; declareWar(S, X, en); x.mob = Math.max(x.mob, 1); logEvent(S, 'war', M('m.war', { a: X, b: en }), 'warn', [X, en]); if (isHuman(S, en)) withSeat(S, en, () => grantCB(S, X, 'attacked', 20)); let msg = M('ra.join', { t: en }); if (act.offensive) { let best = null, bs = 0, bFrom = null; for (const T of realm(S, en)) { if (S.actors[T].ctrl === T && T !== en) continue; if (!aiReach(S, X, T)) continue; const so = aiStaging(S, X, T); if (!so) continue; const est = estimateOp(S, X, T, 0.4, so.kind) * aiReach(S, X, T); if (est > bs) { bs = est; best = T; bFrom = so.L; } } if (best && bs > 1.1) { const r = createOp(S, X, best, 0.4, false, bFrom); if (r.op) msg = M('ra.join_off', { t: en, b: best }); } } const d0 = S.fronts.find(f => f.att === en)?.target; if (d0) { const dest = canStation(S, X, d0) ? d0 : IDS.find(L => canStation(S, X, L) && near(L, d0, 450)); if (dest && freeAt(S, X, X) > 0.3) orderMove(S, X, X, dest, isGreat(S, X) ? 0.15 : 0.1); } return msg; }
      case 'declare_war': case 'invade': if (t && t !== X && indep(S, X)) { if (S.actors[t].ctrl === X) break; const r = createOp(S, X, t, clamp(+act.commit || 0.45, 0.2, 0.8), false); if (r.op) { r.op.legit = true; return M('ra.invade', { t }); } if (!atWar(S, X, boss(S, t))) { declareWar(S, X, boss(S, t)); if (isHuman(S, boss(S, t))) withSeat(S, boss(S, t), () => grantCB(S, X, 'attacked', 20)); return M('ra.declare', { t: boss(S, t) }); } } break;
      case 'deploy': { const to = act.to || t; if (to && S.actors[to] && canStation(S, X, to)) { const mv = orderMove(S, X, X, to, clamp(+act.share || 0.1, 0.03, 0.3)); if (mv > 0) return M('ra.deploy', { l: to }); } break; }
      case 'warn': if (t && act.about && S.actors[act.about]) { if (!S.warnings.some(w => w.by === X && w.to === t && w.about === act.about)) S.warnings.push({ by: X, to: t, about: act.about, conseq: 'war', until: S.turn + 8, since: S.turn }); return M('ra.warn', { t, b: act.about }); } break;
      case 'blockade': if (t && !LANDLOCKED.has(t) && blockadeStrength(S, X, t) > 1.3 * (blockadeDefense(S, t, X) + 1) && !S.blockades.some(b => b.by === X && b.target === t)) { S.blockades.push({ by: X, target: t, since: S.turn }); addRel(S, X, t, -30); if (isHuman(S, t)) withSeat(S, t, () => grantCB(S, X, 'attacked', 12)); return M('ra.blockade', { t }); } break;
      case 'nuke_threat': if (x.nukes > 0 && t) { addRel(S, X, t, -12); S.tension = clamp(S.tension + 8, 0, 100); return M('ra.nukethreat', { t }); } break;
      case 'ceasefire': case 'peace': if (t && atWar(S, X, t) && !warLocked(S, X, t)) { if (isHuman(S, t)) { withSeat(S, t, () => pushOffer(S, mkOffer(S, X, { type: act.type, terms: act.terms || (act.type === 'ceasefire' ? 'ceasefire' : 'white') }, act.text || M(act.type === 'ceasefire' ? 'of.ceasefire' : 'of.peace', { a: X })))); return M('ra.offer_peace'); } const d = decide(S, X, t, { type: act.type, terms: act.terms || 'white' }); if (d.ok) { makePeace(S, X, t, act.type === 'ceasefire' ? 'ceasefire' : 'white'); return M('ra.peace', { t }); } return M('ra.peace_try', { t }); } break;
      case 'ultimatum': case 'demand': if (isHuman(S, t)) { const r = withSeat(S, t, () => { if (S.ultis.some(u => u.from === X && u.status === 'open')) return null; const opts = demandOptions(S, X); const want = act.demand; const d = opts.find(o => o.demand === want) || opts[0]; if (d) { createUltimatum(S, X, d, RP(S, t, R), ['sanction', 'energy', 'strike', 'war'].includes(act.conseq) ? act.conseq : null); return M('ra.ultimatum'); } return null; }); if (r) return r; } break;
      case 'offer_vassal': if (isHuman(S, t) && !x.overlord && !GRD(S, X)) { withSeat(S, t, () => pushOffer(S, mkOffer(S, X, { type: 'protectorate' }, act.text || M('of.protectorate', { a: X })))); return M('ra.offer_vassal'); } break;
    }
  } catch (e) { if (typeof console !== 'undefined') console.error('aiDo', X, act, e); }
  return null;
}
function statementMsg(S, X, stance) { const k = STANCE_KEY[stance] || 'co'; const n = { sh: 3, op: 3, co: 3, ne: 3, su: 3, we: 2 }[k]; return M('st.' + k + (1 + Math.floor(rnd(S) * n)), { v: { voice: X }, p: nm(S.player) }); }
function ruleReact(S, X, R) {
  const P = S.player, x = S.actors[X], d = DEF[X];
  const evs = (S.turnEvents || []).filter(e => e.actor === P);
  let G = 0, F = 0, good = 0, victim = null, victimSev = 0, war = false, direct = false, invadedMe = false, cyberHit = false, invadedFriend = null, nuke = false;
  for (const e of evs) {
    const r = relevance(S, X, e); if (!r) continue;
    if (e.target === X && e.sev < 0) { good += -e.sev; continue; }
    if (r < 0) { F += -r; continue; }
    G += r;
    if (e.target === X) { direct = true; if (e.type === 'invade') invadedMe = true; if (e.type === 'cyber') cyberHit = true; }
    if (e.target && e.target !== X && e.target !== P && e.sev > victimSev) { victim = e.target; victimSev = e.sev; }
    if (e.type === 'invade' || e.type === 'conquest') { war = true; if (e.target !== X && e.target !== P && (isAlly(S, X, e.target) || isPartner(S, X, e.target) || rel(S, X, e.target) >= 55)) invadedFriend = e.target; }
    if (e.type === 'nuke') nuke = true;
  }
  const rP = rel(S, X, P) / 100, ratio = (power(S, P) + 1) / (power(S, X) + 1), dep = exposure(S, X, P);
  const temp = S.diff === 'hard' ? 0.3 : S.diff === 'easy' ? 0.6 : 0.4;
  const fearF = x.fear[P] > S.turn ? 0.35 : 0, nearP = near(P, X, 1500);
  const opts = [];
  if (G < 8 && (good > 0 || F > 0)) {
    opts.push({ k: 'none', u: 0.45 });
    if (good > 0) opts.push({ k: 'welcome', u: 0.4 + good / 30 + rP * 0.3 });
    if (F > 0) opts.push({ k: 'back', u: 0.35 + F / 40 + rP * 0.4 });
    if (good > 0 && !hasTreaty(S, X, P, 'trade') && rP > 0.2) opts.push({ k: 'offer_trade', u: 0.2 + rP * 0.6 });
  } else if (invadedMe) {
    opts.push({ k: 'mobilize', u: 1.2 }); opts.push({ k: 'seek_help', u: 0.9 + (1 - x.risk) * 0.2 }); opts.push({ k: 'sanction', u: 0.5 * x.econ + 0.2 });
    if (canStrike(S, X, P)) opts.push({ k: 'strike', u: x.hawk * 0.9 });
    if (x.nukes > 0) opts.push({ k: 'nuke_threat', u: 0.3 + x.hawk * 0.5 });
  } else {
    opts.push({ k: 'none', u: 0.45 - G / 80 + fearF + (dep > 0.12 ? 0.2 : 0) + (rP > 0.4 ? 0.2 : 0) });
    opts.push({ k: 'condemn', u: 0.25 + Math.min(G, 40) / 70 - Math.max(0, rP) * 0.4 });
    if (G >= 15) opts.push({ k: 'sanction', u: (G / 60) * x.econ * (1 - Math.min(0.8, dep * 3)) - Math.max(0, rP) * 0.6 + (war ? 0.2 : 0) - fearF });
    opts.push({ k: 'buildup', u: (Math.min(3, ratio) / 3) * x.hawk * 0.6 + G / 140 - (x.flags.buildupTo > S.turn ? 0.4 : 0) });
    if (victim && rel(S, X, victim) >= 25) opts.push({ k: 'arms', u: x.loyal * 0.45 + victimSev / 150 + rel(S, X, victim) / 250 - Math.max(0, rP) * 0.3 });
    if (war && invadedFriend && !atWar(S, X, P)) { const base = isAlly(S, X, invadedFriend) ? 1.4 : isPartner(S, X, invadedFriend) ? 0.75 : 0.35; const nukePen = S.actors[P].nukes >= 100 ? (x.nukes >= 100 ? 0.9 : 0.6) : S.actors[P].nukes >= 5 ? 0.3 : 0; opts.push({ k: 'join', u: base * (0.5 + x.loyal * 0.7) + x.hawk * 0.3 + G / 150 - Math.min(1.2, ratio * 0.18) * (1 - x.risk) - Math.max(0, rP) * 0.5 - nukePen }); opts.push({ k: 'deploy', u: 0.3 + x.loyal * 0.3 }); }
    if (direct && G >= 40 && canStrike(S, X, P) && !atWar(S, X, P)) opts.push({ k: 'strike', u: x.hawk * 0.7 + G / 150 - Math.min(1, ratio * 0.2) - 0.2 });
    if (direct && atWar(S, X, P) && canStrike(S, X, P)) opts.push({ k: 'strike', u: x.hawk * 0.6 + 0.1 });
    if (cyberHit) opts.push({ k: 'cyber', u: x.hawk * 0.5 });
    if (x.nukes > 0 && G >= 60) opts.push({ k: 'nuke_threat', u: x.hawk * 0.35 + (nuke ? 0.5 : 0) - 0.15 });
    if (G >= 20 && ratio > 4 && nearP && !invadedFriend) opts.push({ k: 'appease', u: (1 - x.hawk) * 0.5 + Math.min(0.4, (ratio - 4) * 0.04) - x.risk * 0.2 + fearF });
    if (G >= 30 && !atWar(S, X, P) && powerRatio(S, X, P) >= 0.5 && demandOptions(S, X).length) opts.push({ k: 'ultimatum', u: x.hawk * 0.4 + G / 150 - 0.2 });
    if (G >= 25) { const partner = IDS.find(c => c !== X && c !== P && indep(S, c) && rel(S, c, P) < -30 && rel(S, c, X) > 30 && !isAlly(S, c, X) && power(S, c) > power(S, X) * 0.5); if (partner) opts.push({ k: 'ally', u: x.hawk * 0.2 + G / 150 + 0.1, with: partner }); }
    if (d.energy >= 1 && DEF[P].energy <= 0 && G >= 30) opts.push({ k: 'energy', u: G / 100 - dep - 0.1 - Math.max(0, rP) * 0.5 });
    if (x.tech - 3 > S.actors[P].tech && G >= 25) opts.push({ k: 'techban', u: G / 100 * x.econ - 0.05 - Math.max(0, rP) * 0.5 });
  }
  if ((S.coreC || []).some(k => k.o === X && k.v === P && k.status === 'active')) { for (let i = opts.length - 1; i >= 0; i--) if (['strike', 'join', 'ultimatum', 'nuke_threat', 'energy'].includes(opts[i].k)) opts.splice(i, 1); if (!opts.length) opts.push({ k: 'condemn', u: 0.5 }); }
  const acts = []; const chosen = [softPick(S, opts, temp)];
  if ((G >= 30 || invadedMe) && chance(S, invadedMe ? 0.8 : 0.45)) { const rest = opts.filter(o => o.k !== chosen[0].k && o.k !== 'none'); if (rest.length) chosen.push(softPick(S, rest, temp)); }
  for (const c of chosen) {
    let r = null;
    switch (c.k) {
      case 'none': break;
      case 'welcome': r = aiDo(S, X, { type: 'improve', target: P, delta: 4 }, R); break;
      case 'back': if (aiDo(S, X, { type: 'improve', target: P, delta: 3 }, R)) r = M('ra.back', { t: P }); break;
      case 'offer_trade': r = aiDo(S, X, { type: 'trade', target: P }, R); break;
      case 'condemn': r = aiDo(S, X, { type: G > 45 ? 'expel' : 'condemn', target: P }, R); break;
      case 'sanction': r = aiDo(S, X, { type: 'sanction', target: P, level: G >= 60 || invadedMe ? 3 : G >= 30 ? 2 : 1, kind: DEF[X].fin >= 2 && G >= 60 && chance(S, 0.4) ? 'fin' : 'econ' }, R); break;
      case 'buildup': r = aiDo(S, X, { type: 'buildup', pct: clamp(0.15 + G / 150, 0.15, 1.2) }, R); break;
      case 'mobilize': r = aiDo(S, X, { type: 'mobilize', level: 2 + (x.hawk > 0.5 ? 1 : 0) }, R); break;
      case 'seek_help': { const Y = IDS.filter(c => c !== X && c !== P && indep(S, c) && !atWar(S, c, P) && rel(S, c, X) >= 30 && rel(S, c, P) < 20).sort((a, b) => power(S, b) * (rel(S, b, X) + 50) - power(S, a) * (rel(S, a, X) + 50))[0]; if (Y) { const dd = decide(S, X, Y, { type: 'alliance' }, 0.3); if (dd.ok) { if (!isAlly(S, X, Y)) addTreaty(S, 'alliance', X, Y); r = M('ra.allied', { t: Y }); const yy = S.actors[Y]; if (chance(S, clamp(0.25 + yy.loyal * 0.25 + yy.hawk * 0.2 - Math.min(0.3, (power(S, P) + 1) / (power(S, Y) + 1) * 0.05) - (S.actors[P].nukes >= 100 ? 0.3 : 0), 0.03, 0.8))) { const r2 = aiDo(S, Y, { type: 'join_war', enemy: P, offensive: chance(S, yy.hawk * 0.5) }, R); if (r2) addReaction(R, { actor: Y, stance: '强烈反对', statement: M('st.joinhelp', { v: { voice: Y }, a: X }), reason: M('rs.help'), actions: [r2], src: 'rule' }); } } else r = M('ra.ask_help', { t: Y }); } break; }
      case 'arms': r = aiDo(S, X, { type: 'arms_aid', target: victim, pct: clamp(0.03 + victimSev / 1500, 0.03, 0.2) }, R); break;
      case 'join': r = aiDo(S, X, { type: 'join_war', enemy: P, offensive: chance(S, x.hawk * 0.6) }, R); break;
      case 'deploy': { const dest = canStation(S, X, invadedFriend) ? invadedFriend : IDS.find(L => canStation(S, X, L) && near(L, invadedFriend, 450)); if (dest) r = aiDo(S, X, { type: 'deploy', to: dest, share: 0.1 }, R); break; }
      case 'strike': r = aiDo(S, X, { type: 'strike', target: P }, R); break;
      case 'cyber': r = aiDo(S, X, { type: 'cyber', target: P }, R); break;
      case 'nuke_threat': r = aiDo(S, X, { type: 'nuke_threat', target: P }, R); break;
      case 'appease': r = (ratio > 6 && x.stab < 50 && chance(S, 0.25)) ? aiDo(S, X, { type: 'offer_vassal', target: P }, R) : aiDo(S, X, { type: 'improve', target: P, delta: 6 }, R); break;
      case 'ultimatum': r = aiDo(S, X, { type: 'ultimatum', target: P }, R); break;
      case 'ally': r = aiDo(S, X, { type: 'alliance', target: c.with }, R); break;
      case 'energy': r = aiDo(S, X, { type: 'energy_embargo', target: P }, R); break;
      case 'techban': r = aiDo(S, X, { type: 'tech_ban', target: P }, R); break;
    }
    if (r) acts.push(r);
  }
  const k0 = chosen[0].k; let stance;
  if (G < 8 && (good > 0 || F > 0)) stance = k0 === 'none' ? (F > 15 ? '支持' : '中立') : good > 0 ? '欢迎' : '支持';
  else if (invadedMe || ['join', 'strike', 'nuke_threat', 'energy', 'ultimatum'].includes(k0) || (k0 === 'sanction' && G > 30) || G > 70) stance = '强烈反对';
  else if (['condemn', 'techban', 'arms', 'ally', 'cyber', 'sanction', 'deploy'].includes(k0)) stance = '反对';
  else if (k0 === 'appease') stance = '中立';
  else if (k0 === 'buildup') stance = '关切';
  else stance = rP > 0.4 && G < 25 ? '中立' : G > 20 ? '关切' : '中立';
  addReaction(R, { actor: X, stance, statement: statementMsg(S, X, stance), reason: M('rs.' + ruleReason(S, X, k0, G, ratio, dep)), actions: acts, src: 'rule' });
}
function ruleReason(S, X, k, G, ratio, dep) {
  const x = S.actors[X];
  if (k === 'none') return dep > 0.12 ? 'dep' : x.fear[S.player] > S.turn ? 'fear' : 'idle';
  if (k === 'appease') return 'appease';
  if (k === 'back' || k === 'offer_trade' || k === 'welcome') return 'friendly';
  if (k === 'mobilize' || k === 'seek_help') return 'survival';
  if (k === 'join' || k === 'deploy') return 'ally';
  if (k === 'sanction' || k === 'energy' || k === 'techban') return 'econ';
  if (k === 'buildup') return ratio > 1.5 ? 'threat' : 'guard';
  if (k === 'strike') return 'retaliate';
  if (k === 'arms') return 'proxy';
  if (k === 'ally') return 'balance';
  if (k === 'ultimatum') return 'coerce';
  return G > 40 ? 'hurt' : 'stand';
}
function allianceCalls(S, R, handled) {
  for (const ev of (S.turnEvents || [])) {
    if (!['invade', 'nuke'].includes(ev.type) || ev.called) continue; ev.called = true;
    const att = ev.actor, T = ev.target; if (!att || !T) continue;
    const def = boss(S, T);
    for (const c of IDS) {
      if (c === att || c === def || isHuman(S, c) || handled.has(c) || !indep(S, c) || atWar(S, c, att)) continue;
      const bound = hasTreaty(S, c, def, 'alliance') || S.actors[def].overlord === c || S.actors[c].overlord === def || Object.values(S.blocs).some(b => !b.noCall && b.members.includes(c) && b.members.includes(def)); // 松散的条约集团（如1940年三国同盟）不自动参战
      if (!bound || (ev.type === 'strike' && !isAlly(S, c, T))) continue;
      const x = S.actors[c];
      const ratio = (power(S, att) + 1) / (power(S, c) + allyHelp(S, c, att) + 1);
      let p = ev.type === 'strike' ? 0.15 + x.hawk * 0.2 : 0.45 + x.loyal * 0.5 - Math.min(0.35, ratio * 0.06) * (1 - x.risk) + (rel(S, c, att) < -40 ? 0.1 : 0);
      if (S.actors[def].overlord === c) p += 0.3;
      if (x.overlord === def && x.loyal < 0.45) p *= 0.2; // 忠诚度低的附庸不愿为宗主国作战
      if (hasTreaty(S, c, att, 'nap') && rel(S, c, att) > -80) continue; // 互不侵犯条约（如日苏中立条约）
      if (chance(S, clamp(p, 0.05, 0.97))) {
        const r = aiDo(S, c, { type: 'join_war', enemy: att, offensive: chance(S, x.hawk * 0.5) }, R);
        if (r) { if (isHuman(S, att)) addReaction(RP(S, att, R), { actor: c, stance: '强烈反对', statement: M(sameBloc(S, c, def) ? 'st.art5' : 'st.treaty', { v: { voice: c }, t: nm(def) }), reason: M('rs.ally'), actions: [r], src: 'rule' }); if (isHuman(S, def)) RP(S, def, R).toYou.push({ actor: c, msg: M('ai.joinwar', { a: c, t: att, b: def }), tone: 'good', big: true }); if (!isHuman(S, att) && !isHuman(S, def)) R.world.push({ actor: c, msg: M('ai.joinwar', { a: c, t: att, b: def }), tone: 'warn', about: [att], big: true }); handled.add(c); }
      }
    }
  }
}
/* 规则 AI 的反应：所有真人本回合的行动放在一起看（联合推演）。每个国家先回应对它影响最大的那位真人；
 * 多人局里，另一位真人对它的影响也很大时（不少于最大者的一半），对他也作出回应。单人局与原来完全相同。 */
function ruleReactions(S, R, skip = new Set()) {
  const hs = humansOf(S).slice();
  if (hs.length > 1) { const k = S.turn % hs.length; hs.push(...hs.splice(0, k)); } // 并列时轮流优先，不固定照顾房主
  const cand = new Map();
  for (const H of hs) withSeat(S, H, () => { for (const c of reactionCandidates(S, 12)) { if (!cand.has(c.id)) cand.set(c.id, []); cand.get(c.id).push({ H, score: c.score }); } });
  const order = [...cand.entries()].map(([X, l]) => [X, l.slice().sort((a, b) => b.score - a.score)]).sort((a, b) => b[1][0].score - a[1][0].score);
  for (const [X, l] of order) {
    if (skip.has(X)) continue;
    withSeat(S, l[0].H, () => ruleReact(S, X, RP(S, l[0].H, R)));
    if (l[1] && l[1].score >= Math.max(10, l[0].score * 0.5) && indep(S, X)) withSeat(S, l[1].H, () => ruleReact(S, X, RP(S, l[1].H, R)));
    skip.add(X);
  }
  allianceCalls(S, R, skip);
}
/* 联合推演的候选：每个国家受各位真人影响的程度 */
function jointCandidates(S, hs, limit = 10) {
  const m = new Map();
  for (const H of hs) withSeat(S, H, () => { for (const c of reactionCandidates(S, 12)) { const o = m.get(c.id) || { id: c.id, score: 0, by: {} }; o.by[H] = Math.round(c.score); o.score = Math.max(o.score, c.score); m.set(c.id, o); } });
  return [...m.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
const LLM_TYPES = ['none', 'condemn', 'expel', 'recall', 'sanction', 'lift', 'tariff', 'tech_ban', 'energy_embargo', 'buildup', 'mobilize', 'arms_aid', 'aid', 'improve', 'alliance', 'partner', 'trade', 'cancel_treaty', 'exercise', 'cyber', 'strike', 'join_war', 'invade', 'blockade', 'nuke_threat', 'ceasefire', 'peace', 'ultimatum', 'offer_vassal', 'deploy', 'warn'];
function applyLLMReactions(S, R, data) {
  const handled = new Set(); const P = S.player;
  const list = Array.isArray(data && data.reactions) ? data.reactions : [];
  for (const r of list.slice(0, 12)) {
    const X = String(r.actor || '').toUpperCase();
    if (!S.actors[X] || isHuman(S, X) || !indep(S, X) || handled.has(X) || NEU(S, X)) continue;
    handled.add(X);
    const acts = [];
    for (const a of (Array.isArray(r.actions) ? r.actions : []).slice(0, 3)) {
      if (!a || !LLM_TYPES.includes(a.type)) continue;
      const act = Object.assign({}, a, { target: a.target ? String(a.target).toUpperCase() : (a.type === 'join_war' ? undefined : P), enemy: a.enemy ? String(a.enemy).toUpperCase() : undefined, about: a.about ? String(a.about).toUpperCase() : undefined, to: a.to ? String(a.to).toUpperCase() : undefined });
      const provoked = (S.turnEvents || []).some(e => e.actor === P && e.sev >= 50 && (e.target === X || isAlly(S, X, e.target) || isPartner(S, X, e.target) || rel(S, X, e.target) >= 50)) || atWar(S, X, P);
      const hot = provoked || (S.turnEvents || []).some(e => e.actor === P && ['invade', 'strike', 'nuke', 'blockade'].includes(e.type));
      if (['invade', 'strike', 'blockade'].includes(act.type) && act.target === P && !provoked) continue;
      if ((S.coreC || []).some(k => k.o === X && k.v === P && k.status === 'active') && ['invade', 'strike', 'blockade', 'ultimatum', 'join_war', 'nuke_threat'].includes(act.type)) continue;
      if (act.type === 'join_war' && (act.enemy || P) === P && !hot) continue;
      if (act.type === 'join_war' && !act.enemy) act.enemy = P;
      const res = aiDo(S, X, act, R); if (res) acts.push(res);
    }
    let stance = STANCES.includes(r.stance) ? r.stance : STANCE_EN[String(r.stance || '').toLowerCase()] || '关切';
    addReaction(R, { actor: X, stance, statement: ltxt(r.statement, 160) || statementMsg(S, X, stance), reason: ltxt(r.reason, 80), actions: acts, src: 'llm' });
  }
  if (Array.isArray(data && data.headlines)) R.headlines = data.headlines.slice(0, 5).map(h => ltxt(h, 80)).filter(Boolean);
  if (data && data.worldEvent && data.worldEvent.type) llmWorldEvent(S, R, data.worldEvent);
  if (data && data.crisis) llmCrisis(S, data.crisis);
  return handled;
}
function llmWorldEvent(S, R, we) {
  try { const ev = WORLD_EVENTS.find(w => w.id === we.type); const X = String(we.actor || '').toUpperCase(); if (ev && S.actors[X] && indep(S, X) && !NEU(S, X) && !(SHD(S, X) && WE_NEG.has(ev.id)) && (!ev.cond || ev.cond(S, X))) { ev.apply(S, X); const txt = ltxt(we.text, 140); R.events.push({ msg: txt || M('we.' + ev.id, { a: X }), tone: 'info', actors: [X] }); logEvent(S, 'event', txt || M('we.' + ev.id, { a: X }), 'info', [X]); S._llmWorldEvent = true; return true; } } catch (e) { }
  return false;
}
function llmCrisis(S, c) { // 给当前席位（S.player）的危机卡
  if (!c || !c.title || !Array.isArray(c.options) || c.options.length < 2 || S.crises.filter(z => !z.resolved).length >= 3) return false;
  S.crises.push({ id: 'K' + S.seq++, kind: 'llm', src: 'llm', turn: S.turn, deadline: S.turn + 1, def: 0, title: ltxt(c.title, 60), text: ltxt(c.text, 400), actors: (Array.isArray(c.actors) ? c.actors : []).map(a => String(a).toUpperCase()).filter(a => S.actors[a] && !NEU(S, a)).slice(0, 4), options: c.options.slice(0, 3).map(o => ({ label: ltxt(o.label, 40), effects: (Array.isArray(o.effects) ? o.effects : []).slice(0, 6).map(e => normalizeEffect(S, e)) })) });
  S._llmCrisis = true; if (S.humans) (S._llmCrisisFor = S._llmCrisisFor || {})[S.player] = true;
  return true;
}
/* 多人局的联合推演（一次 AI 调用看所有真人的行动）：反应按“对谁”分给各席位，世界新闻各席位共用，世界事件全局一次，
 * 交叉影响写进有关各方的战报，危机卡各给各的 */
function applyWorldReactions(S, R0, data) {
  const hs = humansOf(S), handled = new Set(), by = {}, per = {};
  for (const r of (Array.isArray(data && data.reactions) ? data.reactions : []).slice(0, 18)) {
    if (!r || typeof r !== 'object') continue;
    const X = String(r.actor || '').toUpperCase(); if (!S.actors[X]) continue;
    if ((per[X] = (per[X] || 0) + 1) > 2) continue; // 每国最多回应两位真人
    let t = String(r.toward || '').toUpperCase(); if (!hs.includes(t)) t = hs[0];
    (by[t] = by[t] || []).push(r);
  }
  for (const H of hs) if (by[H]) withSeat(S, H, () => { for (const x of applyLLMReactions(S, RP(S, H, R0), { reactions: by[H] })) handled.add(x); });
  const heads = Array.isArray(data && data.headlines) ? data.headlines.slice(0, 5).map(h => ltxt(h, 80)).filter(Boolean) : [];
  if (heads.length) for (const H of hs) RP(S, H, R0).headlines = heads;
  if (data && data.worldEvent && data.worldEvent.type) llmWorldEvent(S, R0, data.worldEvent);
  for (const c of (Array.isArray(data && data.cross) ? data.cross : []).slice(0, 4)) {
    const txt = ltxt(c && c.text, 220); if (!txt) continue;
    const ps = (Array.isArray(c.players) ? c.players : []).map(p => String(p).toUpperCase()).filter(p => hs.includes(p));
    for (const H of ps.length ? ps : hs) { const RR = RP(S, H, R0); (RR.cross = RR.cross || []).push({ msg: txt, tone: 'info', src: 'llm' }); }
  }
  const got = new Set();
  for (const c of (Array.isArray(data && data.crises) ? data.crises : []).slice(0, hs.length * 2)) {
    const f = String((c && c.for) || '').toUpperCase(); if (!hs.includes(f) || got.has(f)) continue;
    if (withSeat(S, f, () => llmCrisis(S, c))) got.add(f);
  }
  return handled;
}

/* ---------- 随机世界事件 ---------- */
const WORLD_EVENTS = [
  { id: 'election', w: 3, cond: (S, X) => DEF[X].gov === 'dem', apply(S, X) { const x = S.actors[X]; const hard = chance(S, 0.5); x.hawk = clamp(x.hawk + (hard ? 0.15 : -0.15), 0.05, 0.95); x.stab = clamp(x.stab + between(S, -3, 5), 0, 100); for (const H of humansOf(S)) if (X !== H) addRel(S, X, H, (hard === (rel(S, X, H) < 0) ? -1 : 1) * between(S, 4, 10)); return hard ? 'hard' : 'soft'; } },
  { id: 'recession', w: 2, apply(S, X) { const x = S.actors[X]; x.gdp *= 1 - between(S, 0.02, 0.04); x.stab = clamp(x.stab - 6, 0, 100); } },
  { id: 'boom', w: 2, apply(S, X) { S.actors[X].mods.push({ g: 0.4, turns: 4, src: 'boom' }); } },
  { id: 'disaster', w: 1.8, apply(S, X) { const x = S.actors[X]; x.gdp *= 0.99; x.stab = clamp(x.stab - 3, 0, 100); } },
  { id: 'protests', w: 1.8, cond: (S, X) => S.actors[X].stab < 60, apply(S, X) { S.actors[X].stab = clamp(S.actors[X].stab - 8, 0, 100); } },
  { id: 'coup', w: 0.8, cond: (S, X) => S.actors[X].stab < 32 && DEF[X].gov !== 'dem' && !isHuman(S, X), apply(S, X) { const x = S.actors[X]; x.hawk = between(S, 0.2, 0.9); x.stab = 40; for (const H of humansOf(S)) setRel(S, X, H, rel(S, X, H) * 0.4 + between(S, -25, 25)); x.overlord = null; } },
  { id: 'energy_shock', w: 0.8, apply(S) { for (const Y of IDS) S.actors[Y].mods.push({ g: DEF[Y].energy >= 1 ? 0.35 : -0.2, turns: 3, src: 'energy' }); } },
  { id: 'tech', w: 1.5, cond: (S, X) => S.actors[X].tech > 70, apply(S, X) { S.actors[X].tech = clamp(S.actors[X].tech + 2.5, 0, 100); } },
  { id: 'terror', w: 1.2, apply(S, X) { const x = S.actors[X]; x.stab = clamp(x.stab - 4, 0, 100); x.hawk = clamp(x.hawk + 0.08, 0, 1); } },
  { id: 'pandemic', w: 0.25, apply(S) { S.globalMod.push({ g: -0.35, turns: 3 }); for (const Y of IDS) S.actors[Y].stab = clamp(S.actors[Y].stab - 3, 0, 100); } },
];
const WE_NEG = new Set(['protests', 'coup', 'terror', 'recession']); // 按中国标准处理的国家不会出现的随机事件
function randomEvents(S, R) {
  const n = chance(S, 0.6) ? (chance(S, 0.25) ? 2 : 1) : 0;
  for (let i = 0; i < n; i++) {
    if (S._llmWorldEvent && i === 0) continue;
    const X = pick(S, IDS.filter(id => indep(S, id) && !NEU(S, id)));
    const cand = WORLD_EVENTS.filter(e => (!e.cond || e.cond(S, X)) && !(SHD(S, X) && WE_NEG.has(e.id)));
    const tot = cand.reduce((s, e) => s + e.w, 0); let r = rnd(S) * tot; let ev = cand[0];
    for (const e of cand) { r -= e.w; if (r <= 0) { ev = e; break; } }
    const v = ev.apply(S, X);
    const msg = M('we.' + ev.id + (v ? '.' + v : ''), { a: X });
    R.events.push({ msg, tone: 'info', actors: [X] }); logEvent(S, 'event', msg, 'info', [X]);
  }
  S._llmWorldEvent = false;
}

/* 无条件投降：与所有敌国停战；占领区与吞并地区获得解放或归还原主；投降国由主要战胜国占领管制（附庸），军队大部遣散 */
function surrender(S, X, ens, R, prefer) {
  const P = S.player, x = S.actors[X]; prefer = prefer || (sc().victor || {})[X];
  const victor = prefer && ens.includes(prefer) ? prefer : ens.slice().sort((a, b) => S.fronts.filter(f => f.att === b && f.target === X).length - S.fronts.filter(f => f.att === a && f.target === X).length || power(S, b) - power(S, a))[0];
  for (const T of IDS) {
    if (T === X || PRV(S, T)) continue; const t = S.actors[T]; if (t.ctrl !== X && t.overlord !== X) continue; // 永久领土仍归所属国
    if (t.overlord === X && t.ctrl === T) { t.overlord = null; continue; }
    const owner = t.part && t.part !== X && S.actors[t.part] && indep(S, t.part) ? t.part : null;
    for (const c of IDS) if (S.actors[c].forces[T] && c === X) delete x.forces[T];
    if (owner) { t.ctrl = owner; t.integrated = true; t.resist = 0; t.occSince = null; }
    else { t.ctrl = T; t.part = null; t.integrated = false; t.resist = 0; t.occSince = null; t.stab = 40; rebuildArmy(S, T, 0.15); for (const E of ens) if (indep(S, E)) addTreaty(S, 'access', E, T); }
  }
  x.moves = []; for (const L of Object.keys(x.forces)) if (L !== X) delete x.forces[L]; x.forces[X] = [1, 1, 1];
  for (const E of enemies(S, X)) makePeace(S, X, E, 'peace', R);
  S.fronts = S.fronts.filter(f => f.att !== X && f.target !== X); S.ops = S.ops.filter(o => o.owner !== X && o.target !== X);
  // 投降后由占领当局管制：解除与各方之间的制裁和封锁，原有的核心利益危机随之结束
  S.sanctions = S.sanctions.filter(s => s.from !== X && s.to !== X); S.blockades = S.blockades.filter(b => b.by !== X && b.target !== X);
  for (const k of S.coreC || []) if (k.status === 'active' && (k.o === X || k.v === X)) { k.status = 'void'; k.end = S.turn; }
  forSeats(S, sb => { for (const u of sb.ultis || []) if (u.status === 'open' && (u.from === X || u.to === X)) u.status = 'withdrawn'; });
  x.flags.surrendered = S.turn;
  for (const b of Object.values(S.blocs)) b.members = b.members.filter(m => m !== X);
  x.land *= 0.15; x.air *= 0.1; x.navy *= 0.2; x.pers = (x.pers || 0) * 0.1; x.mob = 0; x.milPct = 1; x.stab = 30; x.cu = 0.05;
  if (victor && !isHuman(S, victor) && indep(S, victor)) makeVassal(S, X, victor);
  resetExposure(S);
  const msg = M('m.surrender', { a: X, b: victor });
  logEvent(S, 'peace', msg, 'warn', [X, victor]);
  const hh = [X, victor].filter(v => isHuman(S, v)); for (const H of hh) RP(S, H, R).mil.push({ actor: X, msg, tone: 'warn', big: true, about: [victor] }); if (!hh.length) R.world.push({ actor: X, msg, tone: 'warn', big: true, about: [victor] });
  pushEv(S, { type: 'surrender', actor: X, target: victor, sev: 10, big: true });
}
