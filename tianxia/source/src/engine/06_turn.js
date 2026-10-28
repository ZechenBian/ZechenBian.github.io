/* ===================== 回合流程：新游戏、经济、同时结算、来函、通牒、协议、自由指令、胜负 ===================== */

/* ---------- 经济 ---------- */
function sanctionHit(S, s) { // [对目标, 对发起者] 的季度增长损失（百分点）
  const eT = exposure(S, s.to, s.from), eF = exposure(S, s.from, s.to);
  switch (s.kind) {
    case 'econ': return [s.level * 1.3 * eT * 1.4 / 4, s.level * 0.8 * eF * 1.4 / 4];
    case 'tariff': return [0.5 * eT * 1.4 / 4, 0.35 * eF * 1.4 / 4];
    case 'tech': return [0.3 * eT * 1.4 / 4, 0.15 * eF * 1.4 / 4];
    case 'fin': return [Math.max(0.3, eT * 3) * 1.6 / 4 * DEF[s.from].fin / 3, 0.02];
    case 'energy': return [Math.max(0, -DEF[s.to].energy) * 0.12 * Math.max(0.3, eT * 4), 0.3 * eF * 1.4 / 4];
  }
  return [0, 0];
}
function growthPenalty(S, X) {
  const x = S.actors[X]; let p = 0;
  for (const s of S.sanctions) { if (s.to === X) p += sanctionHit(S, s)[0]; if (s.from === X) p += sanctionHit(S, s)[1]; }
  for (const t of S.treaties) if (t.type === 'trade' && !t.econ && (t.a === X || t.b === X)) p -= 0.36 * exposure(S, X, t.a === X ? t.b : t.a);
  for (const f of S.fronts) { if (f.target === X) p += 1.0 + Math.max(0, f.progress) / 100 * 2; if (f.att === X) p += 0.12 + 0.45 * dotw(S, X, f.v); }
  if (enemies(S, X).length) p += 0.08;
  for (const b of S.blockades) if (b.target === X) p += ISLAND.has(X) ? 3.5 : 2.0;
  if (x.milPct > 3) p += (x.milPct - 3) * 0.06 * (sc().milDrag ?? 1);
  p += [0, 0.1, 0.35, 0.8][x.mob] * (sc().mobDrag ?? 1);
  if (x.treasury < -x.gdp * 0.06) p += 0.25;
  if (x.ctrl !== X) p += x.resist / 100 * 0.8;
  p += 0.8 * (x.oilShort || 0) + laborDrag(S, X);
  if (x.we) p += weGrowthPen(S, X);
  return p;
}
function stabPressure(S, X) {
  const x = S.actors[X], d = DEF[X], gw = GOVW[d.gov]; let p = 0;
  for (const f of S.fronts) {
    if (f.att === X) p += (0.5 + dotw(S, X, f.v) * 1.5) * gw * (f.last < 0 ? 1.4 : 1);
    if (f.target === X) p += f.turns <= 2 ? -1.5 : (1 + Math.max(0, f.progress) / 50) * gw;
  }
  p += Math.min(1.2, 0.12 * S.sanctions.filter(s => s.to === X && s.level >= 2).length);
  for (const T of controlled(S, X)) if (T !== X && !S.actors[T].integrated) p += S.actors[T].resist / 100 * 1.1 * (d.gov === 'dem' ? 1.3 : 0.8);
  if (x.treasury < -x.gdp * 0.06) p += 1.2;
  p += [0, 0.3, 1, 2][x.mob] * gw;
  if (x.we) p += weStabPen(S, X);
  return p;
}
function fiscalBase(S, X) { let b = S.actors[X].gdp * thOccK(S, X, 'eco'); for (const T of controlled(S, X)) if (T !== X) b += S.actors[T].gdp * thOccK(S, T, 'eco') * (S.actors[T].integrated ? 0.9 : 0.4); return b + thOccGain(S, X, 'fis'); } // thOcc*：联机版精细战区的局部占领（单机版恒为 1 与 0）
function economy(S, R) {
  const gMods = S.globalMod.reduce((s, m) => s + m.g, 0);
  const growth = {};
  for (const X of IDS) {
    const x = S.actors[X], d = DEF[X];
    let gd = (x.g0 || 0) - growthPenalty(S, X); if (gd > 0) gd = Math.min(0.8, gd * 0.5);
    let g = d.growth / 4 + gMods + gd;
    g += (x.tech - d.tech) * 0.01;
    if (x.stab < 40) g -= (40 - x.stab) * 0.02;
    for (const m of x.mods) g += m.g;
    g += rn(S) * 0.28;
    g = clamp(g, -12, 6);
    x.gdp = Math.max(1, x.gdp * (1 + g / 100)); x.lastG = g; x.gAvg = (x.gAvg ?? g) * 0.7 + g * 0.3; growth[X] = g;
    x.mods = x.mods.filter(m => --m.turns > 0);
  }
  S.globalMod = S.globalMod.filter(m => --m.turns > 0);
  // 封锁能否维持
  S.blockades = S.blockades.filter(b => {
    const ok = indep(S, b.by) && indep(S, b.target) && blockadeStrength(S, b.by, b.target) >= 1.0 * (blockadeDefense(S, b.target, b.by) + 1);
    if (!ok) { const msg = M('m.blockade_broken', { a: b.by, t: b.target }); const hh = [b.by, b.target].filter(v => isHuman(S, v)); for (const H of hh) RP(S, H, R).mil.push({ actor: b.by, msg, tone: H === b.by ? 'bad' : 'good', about: [b.target] }); if (!hh.length) R.world.push({ actor: b.by, msg, tone: 'info', about: [b.target] }); logEvent(S, 'war', msg, 'info', [b.by, b.target]); }
    else S.actors[b.by].treasury -= S.actors[b.by].gdp * 0.0005;
    return ok;
  });
  const avgFacOf = H => { const pol = seatOf(S, H).pol; return pol ? (pol.fac.mil + pol.fac.biz + pol.fac.pub) / 3 : 50; };
  for (const X of IDS) {
    const x = S.actors[X], d = DEF[X];
    if (!indep(S, X)) { x.land *= 0.9; x.air *= 0.9; x.navy *= 0.9; x.stab = clamp(x.stab + (35 - x.stab) * 0.1, 0, 100); continue; }
    const fb = fiscalBase(S, X);
    let income = fb * 0.005 * (d.gov === 'aut' ? 1.1 : 1) * (x.stab < 30 ? 0.8 : 1);
    let spend = 0;
    for (const f of S.fronts) { if (f.att === X) spend += (f.v[0] * x.land + f.v[2] * x.air) * 0.012; if (f.def === X) spend += (x.land + x.air) * 0.002; }
    for (const L in x.forces) if (L !== X) { const v = x.forces[L]; spend += (v[0] * x.land + v[1] * x.navy + v[2] * x.air) * 0.0015; }
    spend += x.gdp * [0, 0.0005, 0.0015, 0.003][x.mob];
    if (x.treasury < 0) spend += -x.treasury * 0.012;
    if (x.overlord && indep(S, x.overlord)) { const trib = income * 0.15; income -= trib; S.actors[x.overlord].treasury += trib; }
    for (const s of S.sanctions) if (s.kind === 'tariff' && s.from === X) income += exposure(S, X, s.to) * x.gdp * 0.0004;
    x.treasury += income - spend;
    // 军力：预算流入（受战时工业产能与石油约束）与折旧；tempo 为剧本的战争节奏（二战时生产与损耗都快得多）
    oilTurn(S, X); updCapacity(S, X);
    const budget = fb * x.milPct / 100 / 4, capQ = warCapQ(S, X), eff = Math.min(budget, capQ);
    const tempo = sc().tempo || 1, tn = Math.max(1, tempo / 2.5); // 舰艇寿命长：海军的生产与折旧节奏较慢
    const base = eff * d.ppp * [1, 1.1, 1.25, 1.45][x.mob];
    x.budQ = budget; x.capQ = capQ; x.prodQ = eff; x.inQ = base * tempo; x.inN = base * tn;
    const nd = tn / 16 * (sc().navyDecay ?? 1), add = [base * tempo * x.mix[0], base * tn * x.mix[1], base * tempo * x.mix[2]];
    const kept = [x.land * (1 - tempo / 16), x.navy * (1 - nd), x.air * (1 - tempo / 16)];
    if (d.kp && x.k) { const kk = ['t', 's', 'a']; for (let b = 0; b < 3; b++) { const tot = kept[b] + add[b]; if (tot > 1e-6) x.k[kk[b]] = ((x.k[kk[b]] || 0) * kept[b] + d.kp[[0, 2, 1][b]] * add[b]) / tot; } } // 新装备逐步取代旧装备：折算系数向新生产的单位成本靠拢
    x.land = kept[0] + add[0]; x.navy = kept[1] + add[1]; x.air = kept[2] + add[2];
    x.land = Math.max(0, x.land); x.navy = Math.max(0, x.navy); x.air = Math.max(0, x.air);
    // 科技
    let ban = 0;
    for (const s of S.sanctions) if (s.to === X && s.kind === 'tech' && S.actors[s.from].tech > x.tech) ban += 0.25 * Math.min(1, S.actors[s.from].gdp / 5000);
    let tg = (0.1 + Math.max(0, 75 - x.tech) * 0.006) * (1 - Math.min(0.75, ban));
    if (sc().warLearn && enemies(S, X).some(e => S.actors[e].tech > x.tech + 5 && S.fronts.some(f => (f.att === e && boss(S, f.target) === X) || (f.att === X && boss(S, f.target) === e)))) tg += sc().warLearn; // 战争中向更强的对手学习
    x.tech = clamp(x.tech + tg, 0, 100);
    // 稳定：向当前局面下的目标值回归
    let sd = ((x.p0 || 0) - stabPressure(S, X)) * 6; if (sd > 0) sd = Math.min(12, sd * 0.5);
    let target = d.stab + sd;
    if (isHuman(S, X)) target += (avgFacOf(X) - 50) * 0.15;
    const ds = (target - x.stab) * 0.12 + clamp((growth[X] - d.growth / 4) * 1.5, -3, 3);
    x.stab = clamp(x.stab + ds, 0, 100);
  }
  // 贷款
  S.loans = S.loans.filter(l => {
    if (!indep(S, l.to) || !indep(S, l.from)) return false;
    const deb = S.actors[l.to];
    if (deb.stab < 28 && chance(S, 0.1)) { deb.flags.debtTo = l.from; addInfl(S, l.from, l.to, 10); const msg = M('m.default', { a: l.to, b: l.from }); const hh = [l.from, l.to].filter(v => isHuman(S, v)); for (const H of hh) RP(S, H, R).pol.push({ actor: l.to, msg, tone: 'info', about: [l.from] }); if (!hh.length) R.world.push({ actor: l.to, msg, tone: 'info', about: [l.from] }); return false; }
    deb.treasury -= l.pay; S.actors[l.from].treasury += l.pay; return --l.left > 0;
  });
  // 附庸维系
  for (const X of IDS) { const x = S.actors[X]; if (x.overlord) { if (!indep(S, x.overlord)) x.overlord = null; else { addInfl(S, x.overlord, X, 0.8); if (rel(S, X, x.overlord) < 30) addRel(S, X, x.overlord, 3); } } }
  // 关系回归（对玩家的关系叠加恩怨账）
  for (const k in S.rel) {
    const [a, b] = k.split('|');
    if (S.neutral && (NEU(S, a) || NEU(S, b))) { S.rel[k] = 0; continue; } // 中立地区与各国的关系恒为 0
    if (atWar(S, a, b)) { S.rel[k] = Math.min(S.rel[k], -60); continue; }
    let base = S.rel0[k] ?? 0;
    if (isHuman(S, a) || isHuman(S, b)) { const H = isHuman(S, a) ? a : b, o = H === a ? b : a, sb = seatOf(S, H); if (!isHuman(S, o)) base = clamp(base + ((sb.favor[o] || 0) - (sb.grudge[o] || 0)) * 0.4, -100, 100); }
    S.rel[k] += (base - S.rel[k]) * 0.025;
  }
  for (const k in S.infl) { S.infl[k] *= 0.985; if (S.infl[k] < 0.5) delete S.infl[k]; }
  S.tension = clamp(S.tension + (30 - S.tension) * 0.08 + S.fronts.length * 0.8, 0, 100);
  resetExposure(S);
}

/* ---------- 热点地区：AI 之间的危机与冲突 ---------- */
function flashpoints(S, R) {
  for (const [A, B] of (sc().flash || [])) {
    if (isHuman(S, A) || isHuman(S, B) || !indep(S, A) || !indep(S, B) || atWar(S, A, B)) continue;
    const k = rk(A, B); let tv = S.tension2[k] || 0;
    if (chance(S, 0.012 + (rel(S, A, B) < -60 ? 0.008 : 0))) {
      tv = clamp(tv + between(S, 25, 40), 0, 100); S.tension2[k] = tv; addRel(S, A, B, -8);
      const msg = M('we.flare', { a: A, b: B }); R.world.push({ actor: A, msg, tone: 'warn', about: [B], big: tv >= 60 }); logEvent(S, 'event', msg, 'warn', [A, B]);
      pushEv(S, { type: 'gray', actor: A, target: B, sev: 15 });
    }
    if (tv < 60) continue;
    // 高度紧张：可能擦枪走火，或由更强硬的一方发动有限战争
    const [X, Y] = S.actors[A].hawk * (power(S, A) / (power(S, B) + 1)) >= S.actors[B].hawk * (power(S, B) / (power(S, A) + 1)) ? [A, B] : [B, A];
    const x = S.actors[X];
    if (chance(S, 0.12)) {
      loss(S, X, 0.02, 0.05); loss(S, Y, 0.02, 0.05); addRel(S, X, Y, -10); S.tension2[k] = clamp(tv + 8, 0, 100);
      const msg = M('ai.clash', { a: X, t: Y }); R.world.push({ actor: X, msg, tone: 'warn', about: [Y], big: true }); logEvent(S, 'war', msg, 'warn', [X, Y]);
    }
    if (tv >= 70 && x.hawk >= 0.55 && canStrike(S, X, Y) && chance(S, 0.08)) {
      if (execAI(S, X, 'strike', Y, {}, R)) {
        R.world.push({ actor: X, msg: M('ai.fp_strike', { a: X, t: Y }), tone: 'warn', about: [Y], big: true });
        if (canStrike(S, Y, X) && chance(S, 0.6)) { execAI(S, Y, 'strike', X, {}, R); R.world.push({ actor: Y, msg: M('ai.fp_retal', { a: Y, t: X }), tone: 'warn', about: [X], big: true }); }
      }
    }
    if (!S.ops.some(o => o.owner === X) && x.hawk >= 0.6 && chance(S, 0.04 + (tv - 60) / 500)) {
      const so = stagingOptions(S, X, Y)[0];
      if (so && estimateOp(S, X, Y, 0.4, so.kind) * nukeDeter(S, X, Y) * aiReach(S, X, Y) >= 1.15) { const r = createOp(S, X, Y, 0.4, false); if (r.op) { r.op.legit = true; logEvent(S, 'secret', M('m.op.secret', { a: X, t: Y }), 'info', [X]); } }
    }
  }
  // 没有战线的“冷战争”：逐渐停火
  for (const [k, w] of Object.entries(S.war)) {
    const a = w.a, b = w.b; if (!S.actors[a] || !S.actors[b]) continue;
    const active = S.fronts.some(f => (f.att === a && boss(S, f.target) === b) || (f.att === b && boss(S, f.target) === a)) || S.ops.some(o => (o.owner === a && boss(S, o.target) === b) || (o.owner === b && boss(S, o.target) === a));
    w.idle = active ? 0 : (w.idle || 0) + 1;
    if (w.idle < 4 || !indep(S, a) || !indep(S, b)) continue;
    if (!isHuman(S, a) && !isHuman(S, b)) { if (sc().noIdlePeace && (isGreat(S, a) || isGreat(S, b))) continue; if (warLocked(S, a, b)) continue; if (chance(S, 0.2)) { makePeace(S, a, b, 'ceasefire'); R.world.push({ actor: a, msg: M('m.ceasefire', { a, b }), tone: 'info', about: [b] }); } }
    else if (!(isHuman(S, a) && isHuman(S, b))) { const H = isHuman(S, a) ? a : b, X = H === a ? b : a; withSeat(S, H, () => { if (chance(S, 0.25) && !S.inbox.some(o => o.from === X)) pushOffer(S, mkOffer(S, X, { type: 'ceasefire', terms: 'ceasefire' }, M('of.ceasefire', { a: X }))); }); }
  }
  // AI 之间的制裁逐步松动
  S.sanctions = S.sanctions.filter(z => { if (isHuman(S, z.from) || isHuman(S, z.to) || z.since <= 0) return true; if (!indep(S, z.from) || !indep(S, z.to)) return false; const r = rel(S, z.from, z.to); return !(r > -15 && chance(S, 0.15)) && !(S.turn - z.since > 16 && r > -50 && chance(S, 0.05)); });
}

/* ---------- 衰减 ---------- */
function decays(S) {
  forSeats(S, sb => {
    for (const X in sb.grudge) { sb.grudge[X] *= 0.975; if (sb.grudge[X] < 0.5) delete sb.grudge[X]; }
    for (const X in sb.favor) { sb.favor[X] *= 0.96; if (sb.favor[X] < 0.5) delete sb.favor[X]; }
    for (const X in sb.mem) sb.mem[X] = sb.mem[X].filter(m => m.t >= S.turn - 40);
  });
  for (const k in S.tension2) { S.tension2[k] *= 0.95; if (S.tension2[k] < 1) delete S.tension2[k]; }
  for (const X of IDS) { const x = S.actors[X]; for (const k in x.fear) if (x.fear[k] < S.turn) delete x.fear[k]; }
  S.warnings = S.warnings.filter(w => indep(S, w.by) && S.actors[w.to] && S.actors[w.about]);
}

/* ---------- 行动点与排队 ---------- */
function apMax(S) { if (RULES3) return CAP3; const x = S.actors[S.player]; return Math.max(1, 3 + (x.gdp >= 2000 ? 1 : 0) + (x.gdp >= 10000 ? 1 : 0) + (x.stab >= 70 ? 1 : 0) - (x.stab < 30 ? 1 : 0) - (S.pol ? S.pol.apPen : 0)); }
function apLeft(S) { return apMax(S) - S.queue.reduce((s, q) => s + (q.ap || 0), 0) - (S.apUsed || 0); }
function moneyQueued(S) { return S.queue.reduce((s, q) => s + (q.cost || 0), 0); }
/* ---------- 规则 v3：行动力（百分比） ----------
 * 每回合 100% 的行动力；排进队列或立即执行的事都占一部分：
 *   占用 =（这项行动的基础比例 + 花钱的部分）× 本国系数，四舍五入到整数，至少 1%。
 *   · 花钱的部分按金额占本国 GDP 的比例：25 ×（金额 ÷ GDP 的 1%）^0.7，最多 45%——GDP 的 0.1% 约 5%，0.5% 约 15%，1% 约 25%，2% 约 41%。
 *     越大越多，但增速放缓，所以拆成几笔不会更省（每笔还要算基础比例）。只算“钱就是这件事本身”的行动（见 MONEY3）；征兵与军工订单只算花钱的部分，按一半计；
 *     军费、投入方向、调兵、战时政策与一次性加码、回应来函与危机、真人之间的协议不占行动力。
 *   · 本国系数 = 4 ÷ 国力档，限在 0.7–1.35：国力档与 v1、v2 的行动点同一算法（3 档起，经济体量、政局稳定加档，动荡、政权过渡减档），
 *     只是 GDP 门槛改成占世界 GDP 的比例（2%、9%），四个年代一致。大国、稳定的国家做同样的事更省力。
 *   · 行动组合（多选表单）：各项之和打折（两项九折、三项八折、四项以上七折）；接了 AI 时由 AI 在 [估计的 85%, 各项之和] 之间判断。
 *   · 协议（和 AI 国家签署）：6% + 每多一项条款 2%，含同盟或臣服再加 8%，我方出的援助、军援按金额另算；提高动员每级 6%；
 *     交给 AI 换算的一句话命令由 AI 定，在 5%–40%（乘本国系数）之间；核心利益阶梯的一级按包含的行动算，同样打折。 */
const CAP3 = 100;
const AP3 = { summit: 6, trade: 8, alliance: 15, nap: 8, access: 8, armsctl: 8, condemn: 3, warn: 5, vassal: 15, peace: 8, integrate: 12, release: 4, break: 8, reqtroops: 8, reqmob: 8,
  sanction: 5, lift: 3, tariff: 5, techban: 6, finsanction: 10, energy: 6, aid: 3, loan: 3, blockade: 12, aidprog: 4,
  exercise: 5, armsaid: 3, volunteers: 8, strike: 12, invade: 15, threat: 6, nuke: 25, escort: 6, fsupport: 6,
  cyber: 6, propaganda: 4, opposition: 6, coup: 14, sabotage: 7, espionage: 6, fabricate: 6, fund_resist: 6, incite: 7,
  pacify: 4, annex: 12, puppet: 8,
  mobilize: 6, buildup: 3, stabilize: 3, crackdown: 6, stimulus: 3, research: 3, intel: 3, investigate: 4, cbm: 5, nukeprog: 14, leavebloc: 8,
  conscript: 0, procure: 0 };
const MONEY_HALF3 = new Set(['conscript', 'procure']);
/* 按金额多占行动力的行动：钱就是这件事本身（援助、贷款、军援、长期计划、国内投入、征兵与订单、按对方体量花钱的扶植、煽动、政变、安抚、吞并附庸、核计划）。
 * 其余行动的花费是附带的（会晤的差旅、演习与打击的消耗），已经算在基础比例里。花钱部分最多算 45%。 */
const MONEY3 = new Set(['aid', 'loan', 'armsaid', 'aidprog', 'stabilize', 'stimulus', 'research', 'intel', 'buildup', 'conscript', 'procure', 'opposition', 'incite', 'coup', 'fund_resist', 'pacify', 'integrate', 'nukeprog', 'volunteers']);
const MONEY_CAP3 = 45;
const PKG_DISC3 = [0, 0, 0.1, 0.2, 0.3];
const AI_PCT3 = [5, 40], MOB_PCT3 = 6;
function capLevel(S, X) {
  const x = S.actors[X]; if (!x) return 3;
  let wg = 0; for (const c of IDS) if (S.actors[c]) wg += S.actors[c].gdp;
  const sh = wg > 0 ? x.gdp / wg : 0;
  return 3 + (sh >= 0.02 ? 1 : 0) + (sh >= 0.09 ? 1 : 0) + (x.stab >= 70 ? 1 : 0) - (x.stab < 30 ? 1 : 0) - (X === S.player && S.pol && S.pol.apPen > 0 ? 1 : 0);
}
const capEff = (S, X) => clamp(4 / Math.max(1, capLevel(S, X || S.player)), 0.7, 1.35);
const moneyPct = (S, X, amt) => { const g = S.actors[X] ? S.actors[X].gdp : 0, s = g > 0 ? Math.max(0, +amt || 0) / g * 100 : 0; return s > 0 ? Math.min(MONEY_CAP3, 25 * Math.pow(s, 0.7)) : 0; };
const pctOf = (S, v) => (v > 0 ? Math.max(1, Math.round(v * capEff(S, S.player))) : 0);
function actMoney(S, id, t, p) {
  const P = S.player, d = ACT[id];
  try { if (id === 'aidprog') { const q = progOf(S, P, p || {}); return q.amount * Math.min(4, q.turns); } return d.cost(S, P, t, p || {}) || 0; } catch (e) { return 0; }
}
/* 一项行动占的行动力（规则 v3：百分比；之前的版本：行动点） */
function apCost(S, id, target, params) {
  const d = ACT[id]; if (!d) return 0;
  if (!RULES3) return d.ap;
  const p = params || {}, t = d.self ? S.player : target;
  let base = AP3[id] ?? d.ap * 8;
  if (id === 'sanction') base += 2 * (clamp(+p.level || 1, 1, 3) - 1);
  return pctOf(S, base + (MONEY3.has(id) ? moneyPct(S, S.player, actMoney(S, id, t, p)) * (MONEY_HALF3.has(id) ? 0.5 : 1) : 0));
}
/* 交给 AI 的事（一句话命令）：AI 给出百分比（没有就把 1–3 档换算成 12、25、40%），限在本国系数调整后的 5%–40% */
function apAI(S, o) {
  const k = capEff(S, S.player), lo = Math.round(AI_PCT3[0] * k), hi = Math.round(AI_PCT3[1] * k);
  const v = +o.pct > 0 ? +o.pct : [0, 12, 25, 40][clamp(o.ap | 0 || 1, 1, 3)] * k;
  return clamp(Math.round(v), lo, hi);
}
const apAIRange = S => { const k = capEff(S, S.player); return [Math.round(AI_PCT3[0] * k), Math.round(AI_PCT3[1] * k)]; };
/* 提高动员等级占的行动力：规则 v3 每级 6%（乘本国系数），之前的版本一次 1 点；降低不占 */
const mobAP = (S, cur, lv) => (lv <= cur ? 0 : RULES3 ? pctOf(S, MOB_PCT3 * (lv - cur)) : 1);
const MULTI = new Set(['aid', 'armsaid', 'loan', 'buildup', 'procure', 'conscript', 'aidprog']); // aidprog：规则 v2 的长期援助计划（经济、军援各一个）
function actionStatus(S, id, target, params = {}, o) { // o.noAP：行动组合里的一项（行动点按组合计，见 queuePackage）
  const def = ACT[id], me = S.player;
  if (!def) return { ok: false, reason: M('c.unknown') };
  const t = def.self ? me : target;
  let reason = null, cost = 0;
  try { reason = def.check(S, me, t, params); cost = def.cost(S, me, t, params) || 0; } catch (e) { if (typeof console !== 'undefined') console.error(e); return { ok: false, reason: M('c.error') }; }
  if (reason) return { ok: false, reason, cost };
  const ap = apCost(S, id, t, params);
  if (!(o && o.noAP) && ap > apLeft(S)) return { ok: false, reason: M('c.ap', { n: ap }), cost, ap };
  if (id === 'procure' && procQueued(S) + cost > S.actors[me].gdp * 0.016 * weProcK(S, me)) return { ok: false, reason: M('c.capacity'), cost };
  if (id === 'conscript') { const q = S.queue.filter(z => z.type === 'conscript').reduce((s2, z) => s2 + consN(S, me, z.params || {}), 0); if ((S.actors[me].pers || 0) + inTraining(S, me) + q + consN(S, me, params) > persCap(S, me)) return { ok: false, reason: M('c.perscap', { n: fmtK(persCap(S, me)) }), cost }; }
  if (cost > 0 && S.actors[me].treasury - moneyQueued(S) < cost - S.actors[me].gdp * (0.08 + weCredit(S, me))) return { ok: false, reason: M('c.money'), cost };
  if (S.queue.some(q => (q.type === id || (RULES3 && q.type === 'deal' && q.params && q.params.act === id)) && q.target === t) && !MULTI.has(id)) return { ok: false, reason: M('c.queued'), cost };
  let preview = null; try { preview = def.preview ? def.preview(S, me, t, params) : null; } catch (e) { preview = null; }
  return { ok: true, cost, preview, ap };
}
function queueAction(S, id, target, params = {}) {
  const st = actionStatus(S, id, target, params); if (!st.ok) return st;
  const def = ACT[id];
  if (RULES3 && ASK3.has(id) && !def.self) { S.queue.push({ type: 'deal', target, params: { terms: askTerms3(id, params), did: 'A' + S.turn + '.' + id + '.' + target, act: id, aparams: Object.assign({}, params) }, ap: st.ap, cost: st.cost }); return { ok: true }; } // 规则 v3：需要对方同意的旧外交行动，回合结束时和协议一起结算
  S.queue.push({ type: id, target: def.self ? S.player : target, params: Object.assign({}, params), ap: st.ap, cost: st.cost });
  return { ok: true };
}
function unqueue(S, i) {
  if (!(i >= 0 && i < S.queue.length) || S.queue[i].type === 'done') return;
  const k = S.queue[i].pkg; if (!k) { S.queue.splice(i, 1); return; }
  for (let j = S.queue.length - 1; j >= 0; j--) if (S.queue[j].pkg === k) S.queue.splice(j, 1); // 行动组合：整组撤回
}
/* ---------- 规则 v2：多选的行动组合 ----------
 * 援助、制裁、军事施压、隐蔽行动、国内措施在界面上各是一个多选表单：勾选几项、填好金额，一起排进队列。每一项在回合结束时照常结算，
 * 行动点按整组计：规则估计 = 各项行动点之和 − 每两项优惠 1 点 + 金额很大时加点（超过 GDP 的 0.6% 加 1，超过 2% 再加 1）。
 * 接入 AI 时由 AI 在 [估计 − 1, 各项之和 + 加点] 之间判断（只有一项时就是这一项的行动点）。联机时房主按同样的规则复核。 */
const PKG_OK = new Set(['sanction', 'tariff', 'techban', 'finsanction', 'energy', 'lift', 'aid', 'loan', 'armsaid', 'volunteers', 'aidprog', 'exercise', 'blockade', 'escort', 'cyber', 'propaganda', 'opposition', 'coup', 'sabotage', 'espionage', 'fabricate', 'fund_resist', 'incite', 'stabilize', 'crackdown', 'stimulus', 'research', 'intel', 'investigate', 'cbm', 'nukeprog']);
const PKG_MAX = 9;
let PKG_SEQ = 0;
function pkgItems(items) {
  const out = [], seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || !PKG_OK.has(it.id) || !ACT[it.id]) continue;
    const p = {}; for (const [k, v] of Object.entries(it.p && typeof it.p === 'object' ? it.p : {})) if (/^[a-z]{1,8}$/.test(k) && (typeof v === 'number' ? isFinite(v) : typeof v === 'string' && v.length < 24)) p[k] = v;
    const key = it.id + '|' + (p.kind || ''); if (seen.has(key)) continue; seen.add(key);
    out.push({ id: it.id, p }); if (out.length >= PKG_MAX) break;
  }
  return out;
}
function pkgRange(S, items, target) {
  const P = S.player, g = Math.max(1, S.actors[P].gdp); let base = 0, n = 0, money = 0;
  if (RULES3) { // 规则 v3：各项占用之和打折；AI 在 [估计的 85%, 各项之和] 之间判断
    for (const it of pkgItems(items)) { const d = ACT[it.id], t = d.self ? P : target, c = apCost(S, it.id, t, it.p); base += c; if (c > 0) n++; money += actMoney(S, it.id, t, it.p); }
    const est = base ? Math.max(1, Math.round(base * (1 - PKG_DISC3[Math.min(n, 4)]))) : 0;
    return { base, n, big: 0, money, est, lo: n > 1 ? Math.max(1, Math.round(est * 0.85)) : est, hi: n > 1 ? base : est };
  }
  for (const it of pkgItems(items)) {
    const d = ACT[it.id], t = d.self ? P : target; base += d.ap; if (d.ap > 0) n++;
    try { money += it.id === 'aidprog' ? progOf(S, P, it.p).amount * Math.min(4, progOf(S, P, it.p).turns) : (d.cost(S, P, t, it.p) || 0); } catch (e) { }
  }
  const big = (money > g * 0.006 ? 1 : 0) + (money > g * 0.02 ? 1 : 0);
  const est = base ? Math.max(1, base - Math.floor(n / 2) + big) : 0;
  return { base, n, big, money, est, lo: n > 1 ? Math.max(1, est - 1) : est, hi: n > 1 ? Math.max(est, base + big) : est };
}
function queuePackage(S, target, items, ap) {
  if (!RULES2) return { ok: false, reason: M('c.unknown') };
  const list = pkgItems(items); if (!list.length) return { ok: false, reason: M('c.pkg_empty') };
  const r = pkgRange(S, list, target), need = clamp(Math.round(+ap || r.est), r.lo, r.hi);
  if (need > apLeft(S)) return { ok: false, reason: M('c.ap', { n: need }) };
  const k = 'k' + Date.now().toString(36) + (++PKG_SEQ), added = [];
  for (const it of list) {
    const d = ACT[it.id], t = d.self ? S.player : target, st = actionStatus(S, it.id, t, it.p, { noAP: true });
    if (!st.ok) { for (const q of added) S.queue.splice(S.queue.indexOf(q), 1); return { ok: false, reason: M('c.pkg_item', { x: M('a.' + it.id), r: st.reason }), id: it.id }; }
    const q = { type: it.id, target: t, params: Object.assign({}, it.p), ap: added.length ? 0 : need, cost: st.cost, pkg: k };
    S.queue.push(q); added.push(q);
  }
  return { ok: true, ap: need, n: added.length, pkg: k };
}
function dynOptions(S, id, key, target) {
  const P = S.player;
  if (key === 'protege') return IDS.filter(Y => Y !== P && Y !== target && indep(S, Y) && (isAlly(S, P, Y) || isPartner(S, P, Y) || rel(S, P, Y) >= 30 || S.actors[Y].overlord === P))
    .sort((a, b) => (target ? dist(a, target) - dist(b, target) : 0));
  if (key === 'blocs') return Object.values(S.blocs).filter(b => b.members.includes(P)).map(b => b.id);
  if (key === 'reqdest') return reqDestOptions(S, target);
  return [];
}
/* 调兵命令（不占行动点） */
function queuedOutV(S, L) { return S.queue.filter(q => q.type === 'deploy' && q.from === L).reduce((s, q) => vadd(s, q.v), V0()); }
function queuedOut(S, L) { return dotw(S, S.player, queuedOutV(S, L)); }
const freeQV = (S, L) => vsub0(freeV(S, S.player, L), queuedOutV(S, L));
function deployStatus(S, from, to, amt) {
  const P = S.player;
  if (!S.actors[from] || !S.actors[to] || from === to) return { ok: false, reason: M('c.badmove') };
  if (!canStation(S, P, to)) return { ok: false, reason: noBase(S, P, to) ? M('dl.nobase', { t: NBH(S, to) }) : M('c.nostation', { l: to }) };
  const v = isV(amt) ? amt : [amt, amt, amt]; const free = freeQV(S, from);
  if (!(vmax(v) >= 0.004) || v.some((z, b) => z > free[b] + 1e-6)) return { ok: false, reason: M('c.nofree', { l: from, s: { pct: Math.max(0, dotw(S, P, free)) } }) };
  return { ok: true, eta: transitTurns(from, to) };
}
function queueDeploy(S, from, to, amt) {
  const st = deployStatus(S, from, to, amt); if (!st.ok) return st;
  const v = isV(amt) ? amt.slice() : [amt, amt, amt];
  S.queue.push({ type: 'deploy', from, to, v, ap: 0, cost: 0 });
  return { ok: true };
}
function queueDone(S, label, ap) { S.queue.push({ type: 'done', label, ap: ap || 0, cost: 0 }); }

/* ---------- 自由指令（Claude 裁定） ---------- */
function queueCustom(S, order) {
  const P = S.player, g = S.actors[P].gdp;
  const o = Object.assign({}, order);
  o.effects = (Array.isArray(o.effects) ? o.effects : []).slice(0, 8).map(e => normalizeEffect(S, e));
  o.onFailure = (Array.isArray(o.onFailure) ? o.onFailure : []).slice(0, 6).map(e => normalizeEffect(S, e));
  o.settings = (Array.isArray(o.settings) ? o.settings : []).filter(e => e && SET_TYPES.has(e.type)).slice(0, 10).map(e => normalizeEffect(S, e));
  o.successChance = clamp(+o.successChance || 0.6, 0.05, 0.95); o.detectionRisk = clamp(+o.detectionRisk || 0, 0, 1);
  if (o.target) o.target = String(o.target).toUpperCase();
  const ap = RULES3 ? apAI(S, order) : clamp(order.ap | 0 || 1, 1, 3), cost = clamp(+order.cost || 0, 0, g * 0.03);
  if (ap > apLeft(S)) return { ok: false, reason: M('c.ap', { n: ap }) };
  if (RULES3) o.pct = ap; // 联机时房主复核用同一个百分比
  S.queue.push({ type: 'custom', target: S.actors[o.target] ? o.target : null, ap, cost, order: o });
  return { ok: true };
}
function execCustom(S, q, R) {
  const o = q.order, P = S.player;
  const setDone = applySettings(S, o.settings || [], R); // 设定变更：玩家权限之内的决定，执行即生效
  const success = (o.effects || []).length || (o.onFailure || []).length ? chance(S, o.successChance) : true; // 只有设定变更的指令不存在失败
  let effs = (success ? o.effects : o.onFailure) || [];
  const done = [];
  for (const e of effs.slice(0, 8)) {
    try {
      if ((e.type === 'war' || e.type === 'declare') && e.target && S.actors[e.target] && !atWar(S, P, boss(S, e.target)) && DEF[P].gov !== 'aut') {
        if (!chance(S, warAuth(S, e.target))) { facAdd(S, { pub: -2 }); done.push(M('r.invade.denied', { t: e.target })); continue; }
      }
      const r = applyEffect(S, e, R); if (r) done.push(r);
    } catch (err) { if (typeof console !== 'undefined') console.error(err); }
  }
  const covert = o.detectionRisk > 0; const detected = covert ? chance(S, o.detectionRisk) : null;
  let sev = 0, good = 0; const tg = new Set();
  for (const e of (o.effects || [])) {
    const T = e.target || e.b; if (!T || T === P || !S.actors[T]) continue; tg.add(T);
    if (e.type === 'rel') { if (e.delta < 0) sev += -e.delta; else good += e.delta; }
    if (['stab', 'gdp', 'mil', 'tech'].includes(e.type) && ((e.delta || e.pct || 0) < 0)) sev += 12;
    if (e.type === 'war' || e.type === 'declare') sev += 85;
    if (e.type === 'sanction') sev += 15 * (e.level || 1);
    if (['aidto', 'armsto', 'infl'].includes(e.type)) good += 6;
  }
  if (!covert || detected) for (const T of tg) {
    const s = sev > 0 ? clamp(sev || (o.hostility | 0), 5, 90) : -clamp(good, 3, 20);
    pushEv(S, { type: 'custom', actor: P, target: T, sev: s });
    if (s >= 10) remember(S, T, M('mem.custom', { x: { raw: String(o.summary || '').slice(0, 40) } }), -clamp(s / 3, 3, 30));
    else if (s < 0) remember(S, T, M('mem.custom_good', { x: { raw: String(o.summary || '').slice(0, 40) } }), clamp(-s / 2, 2, 10));
  }
  R.custom.push({ text: o.summary || o.text, success, p: o.successChance, detected, narrative: success ? (o.narrative || null) : (o.failNarrative || null), effects: done, settings: setDone });
}

/* ---------- 回合报告 ---------- */
function newReport(S) {
  const d = dateOf(S);
  return { turn: S.turn, y: d.y, q: d.q, actions: [], custom: [], reactions: [], toYou: [], world: [], mil: [], pol: [], intel: [], events: [], headlines: [], notes: (S.carry || []).splice(0), econ: null, fronts: [], ops: [], llmNote: null };
}
function scratchReport(S) { return newReport(Object.assign({}, S, { carry: [] })); }
function carryOver(S, R) { for (const k of ['actions', 'toYou', 'world', 'mil', 'pol', 'intel', 'events']) for (const m of R[k]) S.carry.push(m); }

/* ---------- 同时结算 ---------- */
const PHASE = { dip: 0, econ: 1, covert: 2, occ: 3, mil0: 4, mil: 5, dom: 6 };
function phaseOf(it) {
  if (it.kind === 'deploy') return 'mil0';
  if (it.kind === 'custom') return 'covert';
  if (it.kind === 'core') return it.q.lvl >= 3 ? 'mil' : 'dip';
  if (it.kind === 'act') return (ACT[it.id] && ACT[it.id].cat) || 'dom';
  if (it.kind === 'ulti' || it.kind === 'offer' || it.kind === 'crisis') return 'dip';
  if (it.kind === 'deploy_ai') return 'mil0';
  return 'mil';
}
/* AI 计划所针对的真人（目标本身或其宗主），用于把执行切换到该真人的席位 */
function humanCtx(S, it) { const t = it.target; if (!t || !S.actors[t]) return null; if (isHuman(S, t)) return t; const b = boss(S, t); return b !== t && isHuman(S, b) ? b : null; }
function prepareTurn(S) {
  if (S.over) return null;
  S.turnEvents = S.humans ? (S.turnEvents || []) : []; // 联机版：规划阶段即时生效的行动（自然语言修订、协议……）留给各国在结算时反应
  const R = newReport(S); S._R = R;
  if (S.humans) { S._RH = { [S.player]: R }; for (const H of S.humans) if (H !== S.player) withSeat(S, H, () => { const r = newReport(S); r.world = R.world; r.events = R.events; r.headlines = R.headlines; S._RH[H] = r; }); } // 世界新闻各真人共享
  forHumans(S, H => {
    const P = H, x = S.actors[P], RR = RP(S, H, R);
    S.pre = { gdp: x.gdp, stab: x.stab, mil: power(S, P), treasury: x.treasury, tech: x.tech, fac: Object.assign({}, S.pol.fac), rep: Object.assign({}, S.rep) };
    // 未回应的危机按默认处理
    for (const c of S.crises) if (!c.resolved && c.deadline <= S.turn) { const r = resolveCrisis(S, c.id, c.def || 0, RR); if (r) RR.pol.push({ msg: M('cr.default', { x: c.title, k: r.label }), tone: 'warn' }); }
    S.crises = S.crises.filter(c => !c.resolved || c.turn >= S.turn - 8);
  });
  // 0) 规则 v3：和 AI 国家的协议统一生效（签署的、接受的来函、命令里的结盟和入集团、旧版外交行动；有冲突时由对方选择）
  if (RULES3) {
    S._res3 = 1; const ds = [];
    forHumans(S, P => { for (const q of S.queue) if (q.type === 'deal' && q.target) ds.push({ P, X: q.target, q, kind: q.params && q.params.act ? 'ask' : 'sign' }); S.queue = S.queue.filter(q => q.type !== 'deal'); });
    for (const z of S.pend3 || []) if (z && isHuman(S, z.P) && S.actors[z.X]) ds.push({ P: z.P, X: z.X, q: { ap: 0, params: { terms: z.terms, did: z.did } }, kind: z.kind === 'offer' && z.offer ? 'offer' : 'cmd', offer: z.offer });
    S.pend3 = []; S.dealt3 = { turn: S.turn, list: [] };
    if (ds.length) resolveDeals(S, ds, R);
  }
  // 1) 各国秘密决策（同一回合针对每个真人的动作数量有上限，避免信息轰炸）
  let plans = aiPlan(S);
  forHumans(S, () => { plans = limitPlans(S, plans); });
  // 2) 真人命令
  const items = [];
  forHumans(S, P => {
    for (const q of S.queue) {
      if (q.type === 'done') continue;
      if (q.type === 'custom') items.push({ actor: P, kind: 'custom', q });
      else if (q.type === 'deploy') items.push({ actor: P, kind: 'deploy', q });
      else if (q.type === 'core') items.push({ actor: P, kind: 'core', q, target: q.target });
      else if (ACT[q.type]) items.push({ actor: P, kind: 'act', id: q.type, target: q.target, params: q.params, q });
    }
  });
  for (const c of plans) items.push(c.kind === 'deploy' ? Object.assign({}, c, { kind: 'deploy_ai' }) : c);
  for (const it of items) it.phase = phaseOf(it);
  // 3) 冲突（竞相拉拢同一国家）
  const { losers, notes } = resolveConflicts(S, items);
  for (const n of notes) {
    if (isHuman(S, n.winner)) RP(S, n.winner, R).intel.push({ msg: M('m.outbid_them', { a: n.loser, t: n.target }), tone: 'good', about: [n.loser] });
    else if (!isHuman(S, n.loser) && (isHuman(S, n.target) || rel(S, S.player, n.target) > 30)) R.world.push({ actor: n.winner, msg: M('m.outbid_ai', { a: n.winner, b: n.loser, t: n.target }), tone: 'info', about: [n.target] });
  }
  // 4) 按阶段同时执行
  shuffle(S, items);
  items.sort((a, b) => (PHASE[a.phase] ?? 5) - (PHASE[b.phase] ?? 5));
  for (const it of items) {
    const hA = isHuman(S, it.actor);
    try {
      if (losers.has(it)) { if (hA) { const n = notes.find(z => z.loser === it.actor && z.target === it.target); RP(S, it.actor, R).actions.push({ msg: M('m.outbid', { x: M('a.' + it.id), t: it.target, b: n ? n.winner : null }), tone: 'bad' }); } continue; }
      if (hA) withSeat(S, it.actor, () => execPlayerItem(S, it, RP(S, it.actor, R)));
      else { const c = it.kind === 'deploy_ai' ? Object.assign({}, it, { kind: 'deploy' }) : it, H = humanCtx(S, it); if (H) withSeat(S, H, () => execPlan(S, c, RP(S, H, R))); else execPlan(S, c, R); }
    } catch (err) { if (typeof console !== 'undefined') console.error('exec', it, err); if (hA) RP(S, it.actor, R).actions.push({ msg: M('r.error'), tone: 'bad' }); }
  }
  forHumans(S, () => { S.queue = []; });
  // 5) 最后通牒到期、部队抵达、集结中的行动发动
  forHumans(S, H => ultimatumTurn(S, RP(S, H, R)));
  processMoves(S, R);
  validateStations(S, R);
  opsTurn(S, R);
  coreScan(S, R);
  if (S.humans && S.humans.length > 1) crossEffects(S, R);
  if (RULES3) delete S._res3;
  return R;
}
/* 多人局：本回合各位真人的行动之间的交叉影响（同一目标上的叠加或抵消、对盟友或对手的行动），写进有关各方的战报 */
const XE_LBL = { conquest: 1, custom: 1 };
function crossEffects(S, R) {
  const hs = humansOf(S); if (hs.length < 2) return;
  const lbl = t => (ACT[t] ? M('a.' + t) : M('xe.' + t));
  const agg = {}; // 真人 → 目标 → { h: 最敌对的事件, f: 最友好的事件 }
  for (const e of S.turnEvents || []) {
    if (!e || e.hidden || !hs.includes(e.actor) || !e.target || e.target === e.actor || !S.actors[e.target] || !(ACT[e.type] || XE_LBL[e.type])) continue;
    const a = (agg[e.actor] = agg[e.actor] || {}), o = (a[e.target] = a[e.target] || {});
    if ((e.sev || 0) > 0 && (!o.h || e.sev > o.h.sev)) o.h = e;
    if ((e.sev || 0) < 0 && (!o.f || e.sev < o.f.sev)) o.f = e;
  }
  for (const A of hs) {
    const out = [], seen = new Set(), RR = RP(S, A, R);
    const add = (key, B, T, x, y, tone) => { const k = key + B + T; if (seen.has(k) || out.length >= 6) return; seen.add(k); out.push({ msg: M(key, { b: B, t: T, x, y }), tone }); };
    for (const B of hs) {
      if (B === A || !agg[B]) continue;
      for (const [T, ob] of Object.entries(agg[B])) {
        if (T === A || hs.includes(T)) continue; // 直接针对你的行动已列在“各国针对你的行动”
        const oa = (agg[A] || {})[T];
        if (oa && oa.h && ob.h) add('x.same_hostile', B, T, lbl(oa.h.type), lbl(ob.h.type), 'info');
        else if (oa && oa.f && ob.f) add('x.same_friendly', B, T, lbl(oa.f.type), lbl(ob.f.type), 'warn');
        else if (oa && oa.h && ob.f) add('x.offset', B, T, lbl(oa.h.type), lbl(ob.f.type), 'warn');
        else if (oa && oa.f && ob.h) add('x.offset2', B, T, lbl(oa.f.type), lbl(ob.h.type), 'warn');
        else if (ob.h && isAlly(S, A, T)) add('x.ally_hit', B, T, null, lbl(ob.h.type), 'bad');
        else if (ob.h && atWar(S, A, T)) add('x.enemy_hit', B, T, null, lbl(ob.h.type), 'good');
        else if (ob.f && atWar(S, A, T)) add('x.enemy_help', B, T, null, lbl(ob.f.type), 'bad');
      }
    }
    if (out.length) RR.cross = (RR.cross || []).concat(out);
  }
}
function limitPlans(S, plans) {
  const P = S.player, hostileCap = S.diff === 'hard' ? 4 : S.diff === 'easy' ? 2 : 3;
  const atP = c => c.target === P || (c.target && S.actors[c.target] && boss(S, c.target) === P && c.target !== P);
  const isHostile = c => c.kind === 'ulti' || c.kind === 'gray' || c.kind === 'op' || (c.kind === 'act' && ACT[c.id] && (ACT[c.id].hostile || ACT[c.id].covert));
  const hostile = plans.filter(c => atP(c) && isHostile(c) && !atWar(S, c.actor, P)).sort((a, b) => b.u - a.u);
  const offers = plans.filter(c => c.kind === 'offer' && c.target === P).sort((a, b) => b.u - a.u);
  const keep = []; let cov = 0;
  for (const c of hostile) { const cv = c.kind === 'act' && ACT[c.id].covert; if (keep.length >= hostileCap || (cv && cov >= 2)) continue; if (cv) cov++; keep.push(c); }
  const offerKeep = S.turn - (S.offerAt ?? -9) >= 2 && offers.length ? 1 : 0; if (offerKeep) S.offerAt = S.turn;
  const drop = new Set(hostile.filter(c => !keep.includes(c)).concat(offers.slice(offerKeep)));
  return plans.filter(c => !drop.has(c));
}
function execPlayerItem(S, it, R) {
  const P = S.player, q = it.q;
  if (it.kind === 'custom') { S.actors[P].treasury -= q.cost || 0; execCustom(S, q, R); return; }
  if (it.kind === 'core') { corePlayerExec(S, q, R); return; }
  if (it.kind === 'deploy') {
    const mv = orderMove(S, P, q.from, q.to, q.v);
    R.actions.push({ msg: M(mv > 0 ? 'r.deploy' : 'r.deploy.fail', { l: q.to, f: q.from, s: { pct: mv || dotw(S, P, q.v) }, n: transitTurns(q.from, q.to) }), tone: mv > 0 ? 'info' : 'bad' });
    if (mv > 0) deployEvent(S, q.to, q.v, R);
    return;
  }
  const def = ACT[q.type], t = def.self ? P : q.target, p = q.params || {};
  const reason = def.check(S, P, t, p);
  if (reason) { R.actions.push({ msg: M('r.failed', { x: M('a.' + def.id), t: def.self ? '' : t, r: reason }), tone: 'bad' }); return; }
  if (t !== P && isHuman(S, t) && HCONSENT[def.id]) { proposeH(S, P, t, HCONSENT[def.id](S, P, t, p), R); return; } // 对另一位真人：需要对方同意的行动变成正式提议
  S.actors[P].treasury -= def.cost(S, P, t, p) || 0;
  const C = mkCtx(S, R, P, def); const out0 = C.out; let last = null;
  C.out = (msg, tone, about, opts) => { last = tone; out0(msg, tone, about, opts); };
  const ev0 = (S.turnEvents || []).length;
  def.exec(S, P, t, p, C);
  if (S.humans) for (const e of (S.turnEvents || []).slice(ev0)) if (e.actor === P && !e.hidden && e.target && e.target !== P && isHuman(S, e.target)) RP(S, e.target, R).toYou.push({ actor: P, msg: M('mp.acted', { a: P, x: M('a.' + def.id) }), tone: (e.sev || 0) > 0 ? 'bad' : 'good' });
  if (!def.covert && def.id !== 'invade' && last !== 'bad') afterPlayerAction(S, def.id, t, p, R, true);
  if (def.id === 'nukeprog') { S.actors[P].flags.nukeUp = S.turn; for (const c of S.commits.filter(c => c.type === 'no_nuke')) breakCommit(S, 'no_nuke', c.with, R); }
}

/* ---------- 回合收尾 ---------- */
function commitsTurn(S, R) {
  const P = S.player;
  for (const c of S.commits.filter(c => c.type === 'no_forces')) if (share(S, P, c.loc) >= 0.02 || S.actors[P].moves.some(m => m.to === c.loc)) breakCommit(S, 'no_forces', c.with, R);
  S.commits = S.commits.filter(c => (c.until === null || c.until >= S.turn) && S.actors[c.with] && indep(S, c.with));
}
function finishTurn(S, opts = {}) {
  const R = S._R || newReport(S);
  aiBackground(S, R);
  flashpoints(S, R);
  allianceCalls(S, R, new Set());
  resolveFronts(S, R);
  forHumans(S, H => { S.pol.failed += (S.turnEvents || []).filter(e => e.type === 'offensive_fail' && e.actor === H).length; });
  occupationTurn(S, R);
  economy(S, R);
  programsTurn(S, R);
  armyTurn(S, R);
  wecoTurn(S, R);
  forHumans(S, H => politicsTurn(S, RP(S, H, R)));
  forHumans(S, H => commitsTurn(S, RP(S, H, R)));
  forHumans(S, H => threatTurn(S, RP(S, H, R)));
  forHumans(S, H => redLineTurn(S, RP(S, H, R)));
  coreTurn(S, R);
  warningsTurn(S, R);
  const llmCr = !!S._llmCrisis || !!opts.llmCrisis, crFor = S._llmCrisisFor; forHumans(S, H => crisisTurn(S, RP(S, H, R), crFor ? !!crFor[H] || !!opts.llmCrisis : llmCr)); S._llmCrisis = false; if (crFor) delete S._llmCrisisFor; // 多人局：AI 危机卡按席位算
  scenEvents(S, R);
  randomEvents(S, R);
  decays(S);
  if (S.prov || S.guard) holdTerritory(S); // 联机网页版：台湾始终是中国领土；1939 年开局的中国始终独立
  const out = [];
  forHumans(S, P => {
    const RR = RP(S, P, R);
    S.inbox = S.inbox.filter(o => o.expires >= S.turn + 1 && indep(S, o.from) && !(['peace', 'ceasefire'].includes(o.deal.type) && !atWar(S, o.from, P)));
    const x = S.actors[P];
    RR.econ = { gdp: [S.pre.gdp, x.gdp], stab: [S.pre.stab, x.stab], mil: [S.pre.mil, power(S, P)], treasury: [S.pre.treasury, x.treasury], tech: [S.pre.tech, x.tech], growth: x.lastG, fac: [S.pre.fac, Object.assign({}, S.pol.fac)], rep: [S.pre.rep, Object.assign({}, S.rep)] };
    RR.fronts = S.fronts.filter(f => f.att === P || boss(S, f.target) === P || (f.coD || []).includes(P) || (f.co || []).some(k => k.id === P)).map(f => JSON.parse(JSON.stringify(f)));
    RR.ops = S.ops.filter(o => o.owner === P || o.det.includes(P)).map(o => JSON.parse(JSON.stringify(o)));
    RR.inbox = S.inbox.filter(o => o.turn === S.turn).map(o => o.id);
    RR.crises = S.crises.filter(c => !c.resolved).map(c => c.id);
    for (const r of RR.reactions) logEvent(S, 'reaction', M('log.reaction', { a: r.actor, x: r.statement }), ['强烈反对', '反对'].includes(r.stance) ? 'bad' : ['支持', '欢迎'].includes(r.stance) ? 'good' : 'info', [r.actor, P]);
    for (const a of RR.toYou) logEvent(S, 'ai', a.msg, a.tone === 'good' ? 'good' : a.tone === 'bad' ? 'bad' : 'warn', a.actor ? [a.actor, P] : [P]);
    for (const i of RR.intel) S.intelLog.push({ turn: S.turn, msg: i.msg, tone: i.tone, about: i.about || [] });
    if (S.intelLog.length > 60) S.intelLog.splice(0, S.intelLog.length - 60);
    if (S.humans) { S.apUsed = 0; if (RULES3 && S.apRefund && S.apRefund[P]) { S.apUsed = -S.apRefund[P]; delete S.apRefund[P]; } } // 规则 v3：上回合作废的协议退还行动力
    checkEnd(S);
    if (S.humans && S.over && S.over.result === 'lose') { out.push([P, S.over]); S.over = null; } // 多人局：某位真人出局，不影响其他人
  });
  S.turn++; S.q++; if (S.q > 4) { S.q = 1; S.year++; }
  forHumans(S, H => { snapshotHistory(S); S.report = RP(S, H, R); });
  S._R = null; delete S._RH;
  for (const [H, o] of out) dropHuman(S, H, o);
  S.lastEvents = (S.turnEvents || []).filter(e => !e.hidden).map(e => ({ type: e.type, actor: e.actor, target: e.target, sev: e.sev }));
  S.turnEvents = [];
  return R;
}

/* ---------- 霸权与胜负 ---------- */
function hegemony(S) {
  const P = S.player, W = worldGDP(S);
  const mine = realm(S, P).reduce((s, id) => s + S.actors[id].gdp, 0);
  const worldMil = IDS.reduce((s, id) => s + power(S, id), 0) || 1;
  const milMine = power(S, P) + realm(S, P).filter(v => v !== P).reduce((s, v) => s + power(S, v) * 0.5, 0);
  const gdpShare = mine / W, milShare = milMine / worldMil, units = realm(S, P).length;
  return { gdpShare, milShare, units, prog: Math.min(gdpShare / 0.5, milShare / 0.45, 1), unify: units / IDS.length };
}
function checkEnd(S) {
  if (S.over) return;
  const P = S.player, x = S.actors[P];
  if (x.ctrl !== P) { S.over = { result: 'lose', reason: M('over.occupied', { b: x.ctrl }) }; return; }
  if (x.overlord) { S.over = { result: 'lose', reason: M('over.vassal', { b: x.overlord }) }; return; }
  if (x.stab < 3) { S.lowStab = (S.lowStab || 0) + 1; if (S.lowStab >= 3) { S.over = { result: 'lose', reason: M('over.collapse') }; return; } } else S.lowStab = 0;
  const h = hegemony(S);
  if (S.goal === 'unify') { if (h.units >= IDS.length) S.over = { result: 'win', reason: M('over.unify') }; }
  else if (h.gdpShare >= 0.5 && h.milShare >= 0.45) { S.heg++; if (S.heg >= 4) S.over = { result: 'win', reason: M('over.hegemony', { s: { pct: h.gdpShare }, d: { pct: h.milShare } }) }; }
  else S.heg = 0;
}
function snapshotHistory(S) {
  const P = S.player, x = S.actors[P], h = hegemony(S);
  const u = unitsOf(S, P);
  const mk = prodUnits(S, P);
  S.history.push({ t: S.turn, y: S.year, q: S.q, gdp: Math.round(x.gdp), mil: Math.round(power(S, P)), stab: Math.round(x.stab), heg: +(h.prog * 100).toFixed(1), gs: +(h.gdpShare * 100).toFixed(1), ms: +(h.milShare * 100).toFixed(1), pub: S.pol ? Math.round(S.pol.fac.pub) : 50, trust: S.rep ? Math.round(S.rep.trust) : 60, pers: Math.round(u.pers), tanks: Math.round(u.tanks), air: Math.round(u.air), ships: Math.round(u.ships), land: Math.round(landEff(S, P)), navy: Math.round(navyEff(S, P)), airp: Math.round(airEff(S, P)), prod: +((x.prodQ || 0) * 4).toFixed(1), cu: Math.round((x.cu ?? 1) * 100), mkT: Math.round(mk.t), mkA: Math.round(mk.a), mkS: Math.round(mk.s) });
  if (S.history.length > 200) S.history.shift();
}

/* ---------- 来函（AI 提议） ---------- */
function answerOffer(S, id, accept) {
  const o = S.inbox.find(z => z.id === id); if (!o) return null;
  S.inbox = S.inbox.filter(z => z !== o);
  const P = S.player, X = o.from, d = o.deal;
  if (!indep(S, X)) return M('of.gone', { a: X });
  if (d.type === 'h') return answerH(S, o, accept); // 另一位真人的提议
  if (RULES3 && accept) return acceptOffer3(S, o); // 规则 v3：接受后回合结束时和其他协议一起结算
  const R = scratchReport(S); let msg;
  if (!accept) {
    addRel(S, P, X, -3);
    if (['alliance', 'protectorate', 'peace', 'ceasefire', 'nap', 'armsctl'].includes(d.type)) remember(S, X, M('mem.rejected', { x: M('dt.' + d.type) }), -4);
    msg = M('of.rejected', { a: X, x: M('dt.' + d.type) });
    logEvent(S, 'offer', msg, 'info', [X, P]); return msg;
  }
  switch (d.type) {
    case 'alliance': if (atWar(S, P, X)) return M('of.invalid'); addTreaty(S, 'alliance', P, X); addRel(S, P, X, 10); addCommit(S, 'defend', X, null, 'alliance'); break;
    case 'trade': addTreaty(S, 'trade', P, X); addRel(S, P, X, 5); S.pol.tradeUp++; break;
    case 'nap': addTreaty(S, 'nap', P, X); addRel(S, P, X, 6); addCommit(S, 'no_attack', X, null, 'nap'); break;
    case 'armsctl': addTreaty(S, 'armsctl', P, X); addRel(S, P, X, 6); addCommit(S, 'armsctl', X, null, 'armsctl', { cap: S.actors[P].milPct + 1 }); S.threat[X] = Math.max(0, (S.threat[X] || 0) - 15); repAdd(S, { trust: 3 }); break;
    case 'partner': case 'access': addTreaty(S, d.type, P, X); addRel(S, P, X, 5); break;
    case 'ceasefire': makePeace(S, P, X, 'ceasefire', R); break;
    case 'peace': makePeace(S, P, X, 'white', R); if (d.terms === 'vassal_self') makeVassal(S, X, P); break;
    case 'protectorate': makeVassal(S, X, P); break;
    default: return M('of.invalid');
  }
  carryOver(S, R);
  remember(S, X, M('mem.accepted', { x: M('dt.' + d.type) }), 6);
  msg = M('of.accepted', { a: X, x: M(d.type === 'peace' && d.terms === 'vassal_self' ? 'dt.peace_vassal' : 'dt.' + d.type) });
  logEvent(S, 'offer', msg, 'good', [X, P]);
  return msg;
}

/* ---------- 回应最后通牒 ---------- */
function answerUltimatum(S, id, choice) {
  const u = S.ultis.find(z => z.id === id && z.status === 'open'); if (!u) return null;
  const P = S.player, X = u.from;
  if (choice === 'accept') {
    const R = scratchReport(S); complyUltimatum(S, u, R); carryOver(S, R);
    remember(S, X, M('mem.complied'), 4);
    return M('ul.you_accept', { a: X, x: M('ud.' + u.demand, { l: u.loc, b: u.with, t: u.t }) });
  }
  if (u.rejected) return M('ul.you_reject', { a: X });
  u.rejected = true; addRel(S, P, X, -5); facAdd(S, { pub: 2, mil: 2 });
  const msg = M('ul.you_reject', { a: X });
  logEvent(S, 'ultimatum', msg, 'warn', [P, X]);
  return msg;
}

/* ---------- 危机回应 ---------- */
function answerCrisis(S, id, choice) {
  const R = scratchReport(S);
  const r = resolveCrisis(S, id, choice, R);
  carryOver(S, R);
  return r;
}

/* ---------- 取消/停止军事行动 ---------- */
function cancelOp(S, id) { const o = S.ops.find(z => z.id === id && z.owner === S.player); if (!o) return false; S.ops = S.ops.filter(z => z !== o); for (const O of o.det) if (O !== S.player) addRel(S, S.player, O, 2); logEvent(S, 'war', M('m.op.cancel', { t: o.target }), 'info', [S.player, o.target]); return true; }
function setFrontV(S, id, b, val) {
  const f = S.fronts.find(z => z.id === id && z.att === S.player); if (!f) return false;
  const max = f.v[b] + freeV(S, S.player, f.from)[b];
  if (!f.tv) f.tv = f.v.slice();
  f.tv[b] = clamp(+val, 0, 1); f.v[b] = Math.min(f.tv[b], max); if (b !== 1 && f.v[0] + f.v[2] < 0.01) { f.v[b] = Math.min(0.02, max); f.tv[b] = Math.max(f.tv[b], f.v[b]); }
  return f.v[b];
}
function haltFront(S, id) { const f = S.fronts.find(z => z.id === id && z.att === S.player); if (!f) return false; if (S.th && f.th) (S.th.halt = S.th.halt || {})[f.att + '>' + f.target] = S.turn; S.fronts = S.fronts.filter(z => z !== f); /* S.th：联机版精细战区，叫停后不再自动补建这条战线 */ logEvent(S, 'war', M('m.front.halt', { t: f.target }), 'info', [S.player, f.target]); return true; }

/* ---------- 外交谈判（Claude 对话中达成的协议） ---------- */
const DEAL_TYPES = ['trade', 'alliance', 'nap', 'access', 'partner', 'armsctl', 'ceasefire', 'peace', 'vassal', 'lift_sanctions', 'lift_my_sanctions', 'aid', 'arms', 'tribute', 'join_war', 'break_alliance', 'tech_share', 'drop_ultimatum', 'pledge_no_attack', 'withdraw', 'send_troops', 'mobilize', 'raise_defense'];
function dealCheck(S, X, term) {
  const P = S.player, x = S.actors[X];
  if (!DEAL_TYPES.includes(term.type)) return M('dl.unknown');
  if (RULES3) { const w = dealClash3(S, P, X, term); if (w) return w; } // 规则 v3：和已有局面冲突的条款（它已和你的交战国结盟、要它打自己的盟友、已有宗主国）
  if (term.type === 'access' && noBase(S, P, X)) return M('dl.nobase', { t: NBH(S, X) }); // 网页版 v3：中国领土上不允许外国驻军（驻军权是你在对方境内驻军）
  if (term.type === 'send_troops' && S.nobase) { const d = dealDest(S, term), r = d && reqDest(S, d), L = r ? (r.front ? r.front.from : r.loc) : null; if (L && noBase(S, X, L) && !(r.front && stagingOptions(S, X, r.front.target).length)) return M('dl.nobase', { t: NBH(S, L) }); }
  switch (term.type) {
    case 'vassal': { if (GRD(S, X)) return M('why.guard', { t: X }); if (RULES2 && !fallen(S, P, X)) return M('dl.fallen', { t: X, n: FALLEN }); const e = (blocPower(S, P) + 1) / (blocPower(S, X) + allyHelp(S, X, P) + 1); const losing = S.fronts.some(f => f.att === P && boss(S, f.target) === X && f.progress > 60); if (e < 2.5 && !losing && x.stab > 25) return M('dl.vassal_gap'); if (x.nukes > 50 && !losing) return M('dl.vassal_nuke'); return null; }
    case 'tribute': return (blocPower(S, P) + 1) / (blocPower(S, X) + 1) < 2 ? M('dl.tribute') : null;
    case 'ceasefire': case 'peace': return atWar(S, P, X) ? null : M('dl.notwar');
    case 'join_war': { const en = String(term.enemy || '').toUpperCase(); if (!S.actors[en] || !atWar(S, P, en)) return M('dl.notwar_en'); return null; }
    case 'alliance': case 'nap': case 'trade': case 'access': case 'partner': case 'armsctl': return atWar(S, P, X) ? M('dl.atwar') : null;
    case 'drop_ultimatum': return S.ultis.some(u => u.from === X && u.status === 'open') ? null : M('dl.noulti');
    case 'withdraw': { const L = String(term.loc || '').toUpperCase(); return S.actors[L] && share(S, P, L) > 0 ? null : M('dl.noforces'); }
    case 'lift_my_sanctions': return S.sanctions.some(s => s.from === P && s.to === X) ? null : M('dl.nosanction');
    case 'lift_sanctions': return S.sanctions.some(s => s.from === X && s.to === P) ? null : M('dl.nosanction');
    case 'send_troops': { const d = dealDest(S, term); return d && reqDestOk(S, X, d) ? null : M('dl.nodest'); }
    case 'mobilize': return x.mob >= 2 ? M('dl.mobbed') : null;
  }
  return null;
}
function applyDeal(S, X, terms, R0) { // R0：回合结算中统一生效时（规则 v3）直接写进这一回合的战报
  const P = S.player, done = [], R = R0 || scratchReport(S);
  let list = (Array.isArray(terms) ? terms : []).filter(z => z && typeof z === 'object').slice(0, 6);
  if (RULES3) list = list.filter(z => z.type === 'break_alliance').concat(list.filter(z => z.type !== 'break_alliance')); // 先断盟，再谈别的
  for (const t of list) {
    const bad = dealCheck(S, X, t); if (bad) { done.push(M('dl.void', { x: M('dk.' + t.type), r: bad })); continue; }
    switch (t.type) {
      case 'trade': case 'alliance': case 'nap': case 'access': case 'partner': case 'armsctl':
        addTreaty(S, t.type, P, X);
        if (t.type === 'alliance') addCommit(S, 'defend', X, null, 'alliance');
        if (t.type === 'nap') addCommit(S, 'no_attack', X, null, 'nap');
        if (t.type === 'armsctl') { addCommit(S, 'armsctl', X, null, 'armsctl', { cap: S.actors[P].milPct + 1 }); S.threat[X] = Math.max(0, (S.threat[X] || 0) - 15); }
        if (t.type === 'trade') S.pol.tradeUp++;
        done.push(M('dl.treaty', { k: M('tr.' + t.type) })); break;
      case 'ceasefire': makePeace(S, P, X, 'ceasefire', R); done.push(M('dl.ceasefire')); break;
      case 'peace': makePeace(S, P, X, 'white', R); done.push(M('dl.peace')); break;
      case 'vassal': makePeace(S, P, X, 'white', R); makeVassal(S, X, P); done.push(M('dl.vassal', { t: X })); break;
      case 'lift_sanctions': removeSanctions(S, X, P); done.push(M('dl.lift_them')); break;
      case 'lift_my_sanctions': removeSanctions(S, P, X); addCommit(S, 'no_sanction', X, 8, 'deal'); done.push(M('dl.lift_me')); break;
      case 'aid': { const amt = clamp(+t.amount || S.actors[P].gdp * 0.002, 0, S.actors[P].gdp * 0.02); S.actors[P].treasury -= amt; S.actors[X].treasury += amt; addInfl(S, P, X, clamp(amt / S.actors[X].gdp * 300, 1, 15)); done.push(M('dl.aid', { m: $m(amt) })); break; }
      case 'arms': { const amt = clamp(+t.amount || S.actors[P].gdp * 0.002, 0, S.actors[P].gdp * 0.02); S.actors[P].treasury -= amt; armsTransfer(S, P, X, amt); done.push(M('dl.arms', { m: $m(amt) })); break; }
      case 'tribute': { const amt = clamp(+t.amount || S.actors[X].gdp * 0.002, 0, S.actors[X].gdp * 0.01); S.actors[X].treasury -= amt * 4; S.actors[P].treasury += amt * 4; done.push(M('dl.tribute_ok', { m: $m(amt * 4) })); break; }
      case 'join_war': { const en = String(t.enemy).toUpperCase(); if (S.actors[en] && !atWar(S, X, en)) { declareWar(S, X, en); logEvent(S, 'war', M('m.war', { a: X, b: en }), 'warn', [X, en]); done.push(M('dl.join', { t: X, b: en })); } break; }
      case 'break_alliance': { const w = String(t.with || '').toUpperCase(); if (S.actors[w]) { removeTreaty(S, 'alliance', X, w); removeTreaty(S, 'partner', X, w); done.push(M('dl.break', { t: X, b: w })); } break; }
      case 'tech_share': S.actors[P].tech = clamp(S.actors[P].tech + 0.8, 0, 100); S.actors[X].tech = clamp(S.actors[X].tech + 0.8, 0, 100); done.push(M('dl.tech')); break;
      case 'drop_ultimatum': for (const u of S.ultis) if (u.from === X && u.status === 'open') { u.status = 'withdrawn'; S.ops = S.ops.filter(o => o.ulti !== u.id); } done.push(M('dl.drop_ulti', { t: X })); break;
      case 'pledge_no_attack': addCommit(S, 'no_attack', X, clamp(+t.turns || 8, 2, 16), 'deal'); done.push(M('dl.pledge', { n: clamp(+t.turns || 8, 2, 16) })); break;
      case 'send_troops': { const r = sendTroops(S, X, dealDest(S, t), clamp(+t.share || 0.08, 0.02, 0.25), R, true); if (r) done.push(r); break; }
      case 'mobilize': done.push(allyMobilize(S, X, clamp(+t.level || 1, 1, 2), 0.5)); break;
      case 'raise_defense': done.push(allyMobilize(S, X, 0, clamp(+t.pct || 0.8, 0.2, 3))); break;
      case 'withdraw': { const L = String(t.loc).toUpperCase(); S.fronts = S.fronts.filter(f => !(f.att === P && f.from === L)); S.ops = S.ops.filter(o => !(o.owner === P && o.from === L)); orderMove(S, P, L, P, shareV(S, P, L).slice()); addCommit(S, 'no_forces', X, 8, 'deal', { loc: L }); done.push(M('dl.withdraw', { l: L })); break; }
    }
  }
  if (!R0) carryOver(S, R);
  addRel(S, P, X, 6); remember(S, X, M('mem.deal'), 10);
  logEvent(S, 'deal', M('dl.log', { a: X, x: { list: done } }), 'good', [P, X]);
  return done;
}
/* ---------- 规则 v3：和 AI 国家的协议回合结束时统一结算 ----------
 * 来源：签署的协议（队列里的 'deal'）；接受的来函、命令里的结盟和臣服、建集团时同意加入的国家（S.pend3，房主保存）；
 *   旧版外交行动（结盟、臣服、驻军、议和、请求出兵等，队列里带 act 的 'deal'，结算时由对方当场决定）。
 * 结算一开始（各国决策之前）集中处理：
 *   1) 同一个 AI 国家这一回合收到的协议里互相排斥的：同时和互为对手（交战，或关系低于 −20）的两方站边（结盟、伙伴、驻军、臣服、入集团、参战或出兵）；
 *      答应对某国参战或出兵打它，同时又和它签别的；同时臣服两国；一方要它和某国断盟，那个国家同时要它站到自己这边。
 *   2) 有冲突时由这个国家按自己的利益选（关系、影响力、各项条款对它的好处——和谈判时同一套评估；它自己发出的来函优先），选中的生效，其余作废；
 *      作废的协议下回合退还所占的行动力，双方都在战报里看到结果。
 *   3) 每一份协议生效时再按当时的局势逐项复查（它已和你的交战国站在一起、它正和你的盟友交战、要它打自己的盟友、它已有宗主国、它已在对立的集团里），不成立的条款作废。
 *   4) 生效之后，同一回合对手在它那里的政变成功了：协议作废并退还（coupUndo3）。AI 国家自己同一回合结盟、建立伙伴关系也做同样的检查（alignBlock3）。
 * 处理顺序固定（按评估从高到低，同分按国家代码），联机时每台机器结果一致。真人之间的协议仍在对方接受时生效，但同样逐项复查。 */
const aligned = (S, a, b) => isAlly(S, a, b) || isPartner(S, a, b);
const rivals3 = (S, a, b) => atWar(S, a, b) || rel(S, a, b) < -20;
/* X 已在一个和 P 对立的集团里（集团的领导国是 P 的对手，或有成员正和 P 交战） */
function rivalBloc3(S, P, X, keep) {
  for (const b of Object.values(S.blocs || {})) if (b.id !== keep && b.members.includes(X) && !b.members.includes(P) && (rivals3(S, P, b.leader) || b.members.some(m => atWar(S, m, P)))) return b;
  return null;
}
function dealClash3(S, P, X, t) {
  if (['alliance', 'partner', 'access', 'vassal', 'bloc'].includes(t.type)) { const Q = IDS.find(c => c !== P && c !== X && S.actors[c] && atWar(S, c, P) && aligned(S, X, c)); if (Q) return M('dl.ally_enemy', { t: X, b: Q, p: P }); }
  if (['alliance', 'partner', 'access', 'bloc'].includes(t.type)) { const Q = IDS.find(c => c !== P && c !== X && S.actors[c] && atWar(S, c, X) && aligned(S, P, c)); if (Q) return M('dl.war_friend', { t: X, b: Q, p: P }); } // 反方向：它正和你的盟友交战（臣服会让它和你的盟友停战，不在此列）
  if (t.type === 'bloc') { const b = rivalBloc3(S, P, X, t.bloc); if (b) return M('dl.rival_bloc', { t: X, b: M('bloc.' + b.id) }); }
  if (t.type === 'join_war') { const E = boss(S, String(t.enemy || '').toUpperCase()); if (S.actors[E] && E !== X && aligned(S, X, E)) return M('dl.war_ally', { t: X, b: E }); }
  if (t.type === 'send_troops') { const d = dealDest(S, t), f = d && S.fronts.find(z => z.id === d), E = f ? boss(S, f.target) : null; if (E && E !== X && aligned(S, X, E)) return M('dl.war_ally', { t: X, b: E }); }
  if (t.type === 'vassal') { const o = S.actors[X] && S.actors[X].overlord; if (o && o !== P) return M('dl.has_lord', { t: X, b: o }); }
  return null;
}
/* AI 国家自己站边（结盟、伙伴，AI 之间或对真人的来函）前的检查：不和交战双方同时站在一起，不在同一回合刚和对手站到一边之后又倒向另一边 */
function alignBlock3(S, a, b) {
  if (!RULES3 || !S.actors[a] || !S.actors[b]) return null;
  if (atWar(S, a, b)) return M('dl.atwar');
  for (const Q of IDS) {
    if (Q === a || Q === b || !S.actors[Q]) continue;
    if (atWar(S, Q, b) && aligned(S, a, Q)) return M('dl.ally_enemy', { t: a, b: Q, p: b });
    if (atWar(S, Q, a) && aligned(S, b, Q)) return M('dl.ally_enemy', { t: b, b: Q, p: a });
  }
  const D = S.dealt3;
  if (D && D.turn === S.turn) for (const z of D.list) {
    if (z.undone) continue;
    if (z.X === a && z.P !== b && rivals3(S, z.P, b)) return M('dl.just_sided', { t: a, b: z.P });
    if (z.X === b && z.P !== a && rivals3(S, z.P, a)) return M('dl.just_sided', { t: b, b: z.P });
  }
  return null;
}
const DEAL_KEY = /^[a-z]{1,8}$/;
const DEAL_INT3 = ['protectorate', 'bloc']; // 只在房主生成的待结算项里出现（来函、建集团）
function cleanDealTerms(terms, internal) {
  const out = [];
  for (const t of (Array.isArray(terms) ? terms : []).slice(0, 6)) {
    if (!t || typeof t !== 'object' || !(DEAL_TYPES.includes(t.type) || (internal && DEAL_INT3.includes(t.type)))) continue;
    const o = {}; for (const [k, v] of Object.entries(t)) if (DEAL_KEY.test(k) && (typeof v === 'number' ? isFinite(v) : typeof v === 'string' && v.length <= 40)) o[k] = v;
    out.push(o);
  }
  return out;
}
const dealMoney = (S, terms) => { const g = S.actors[S.player].gdp; return terms.reduce((s, t) => s + (t.type === 'aid' || t.type === 'arms' ? clamp(+t.amount || g * 0.002, 0, g * 0.02) : 0), 0); };
/* 签署：排进队列，回合结束统一结算 */
function queueDeal(S, X, terms, did) {
  if (!RULES3) return { ok: false, reason: M('c.unknown') };
  const P = S.player; X = String(X || '').toUpperCase();
  if (!S.actors[X] || X === P || isHuman(S, X) || !indep(S, X) || NEU(S, X)) return { ok: false, reason: M('c.unknown') };
  const L = cleanDealTerms(terms); if (!L.length) return { ok: false, reason: M('c.pkg_empty') };
  const bad = L.map(t => dealCheck(S, X, t)).filter(Boolean); if (bad.length === L.length) return { ok: false, reason: bad[0] };
  const need = dealAP(L, S); if (need > apLeft(S)) return { ok: false, reason: M('c.ap', { n: need }) };
  const cost = dealMoney(S, L), x = S.actors[P];
  if (cost > 0 && x.treasury - moneyQueued(S) < cost - x.gdp * (0.08 + weCredit(S, P))) return { ok: false, reason: M('c.money') };
  S.queue.push({ type: 'deal', target: X, params: { terms: L, did: String(did || '').slice(0, 60) }, ap: need, cost });
  return { ok: true, ap: need };
}
/* 旧版外交行动（需要对方同意的）：规则 v3 里排成一份待结算的协议，结算时由对方当场决定（行动本身照旧执行） */
const ASK3 = new Set(['trade', 'alliance', 'nap', 'access', 'armsctl', 'vassal', 'peace', 'reqtroops', 'reqmob']);
function askTerms3(id, p) {
  p = p || {};
  if (id === 'peace') return [{ type: p.terms === 'ceasefire' ? 'ceasefire' : p.terms === 'vassal' ? 'vassal' : 'peace' }];
  if (id === 'reqtroops') { const d = String(p.dest || ''); return [Object.assign({ type: 'send_troops', size: clamp(+p.size || 0, 0, 2) | 0 }, d.startsWith('D:') ? { loc: d.slice(2) } : d ? { front: d } : {})]; }
  if (id === 'reqmob') return [{ type: 'mobilize' }];
  return [{ type: id }];
}
/* 接受的来函：结算时按条款判断互斥与复查 */
function offerTerms3(d) {
  if (d.type === 'protectorate') return [{ type: 'vassal' }];
  if (d.type === 'peace' && d.terms === 'vassal_self') return [{ type: 'peace' }, { type: 'vassal' }];
  return [{ type: d.type }];
}
function offerApply3(S, X, d, R) {
  const P = S.player;
  for (const t of offerTerms3(d)) { const w = dealClash3(S, P, X, t); if (w) return { why: w }; }
  if (['peace', 'ceasefire'].includes(d.type) && !atWar(S, P, X)) return { why: M('dl.notwar') };
  if (['alliance', 'trade', 'nap', 'armsctl', 'partner', 'access'].includes(d.type) && atWar(S, P, X)) return { why: M('dl.atwar') };
  if (d.type === 'access' && noBase(S, P, X)) return { why: M('dl.nobase', { t: NBH(S, X) }) };
  switch (d.type) {
    case 'alliance': addTreaty(S, 'alliance', P, X); addRel(S, P, X, 10); addCommit(S, 'defend', X, null, 'alliance'); break;
    case 'trade': addTreaty(S, 'trade', P, X); addRel(S, P, X, 5); S.pol.tradeUp++; break;
    case 'nap': addTreaty(S, 'nap', P, X); addRel(S, P, X, 6); addCommit(S, 'no_attack', X, null, 'nap'); break;
    case 'armsctl': addTreaty(S, 'armsctl', P, X); addRel(S, P, X, 6); addCommit(S, 'armsctl', X, null, 'armsctl', { cap: S.actors[P].milPct + 1 }); S.threat[X] = Math.max(0, (S.threat[X] || 0) - 15); repAdd(S, { trust: 3 }); break;
    case 'partner': case 'access': addTreaty(S, d.type, P, X); addRel(S, P, X, 5); break;
    case 'ceasefire': makePeace(S, P, X, 'ceasefire', R); break;
    case 'peace': makePeace(S, P, X, 'white', R); if (d.terms === 'vassal_self') makeVassal(S, X, P); break;
    case 'protectorate': makeVassal(S, X, P); break;
    default: return { why: M('of.invalid') };
  }
  const k = M(d.type === 'peace' && d.terms === 'vassal_self' ? 'dt.peace_vassal' : 'dt.' + d.type);
  remember(S, X, M('mem.accepted', { x: k }), 6);
  logEvent(S, 'offer', M('of.accepted', { a: X, x: k }), 'good', [X, P]);
  return { done: [k] };
}
/* 接受 AI 国家的来函：规则 v3 里不当场生效，留到回合结束和其他协议一起结算；结算前可以撤回 */
function acceptOffer3(S, o) {
  const k = M(o.deal.type === 'peace' && o.deal.terms === 'vassal_self' ? 'dt.peace_vassal' : 'dt.' + o.deal.type);
  S.pend3 = S.pend3 || []; S.pend3.push({ P: S.player, X: o.from, kind: 'offer', did: o.id, offer: o, terms: offerTerms3(o.deal) });
  return M('of.accepted_q', { a: o.from, x: k });
}
function unacceptOffer(S, id) {
  if (!RULES3) return null;
  const i = (S.pend3 || []).findIndex(z => z.kind === 'offer' && z.did === id && z.P === S.player); if (i < 0) return null;
  const z = S.pend3.splice(i, 1)[0];
  if (z.offer && !S.inbox.some(o => o.id === z.offer.id)) S.inbox.push(z.offer);
  return M('of.unaccepted', { a: z.X });
}
/* 命令里的结盟、臣服（自然语言修订的效果）：对方同意后排成待结算的协议 */
function pendCmd3(S, X, terms, did) { S.pend3 = S.pend3 || []; S.pend3.push({ P: S.player, X, kind: 'cmd', did: did || ('K' + S.seq++), terms }); }
/* 入集团 */
function blocCheck3(S, X, t) {
  const P = S.player, b = S.blocs && S.blocs[t.bloc];
  if (!b || !b.members.includes(P)) return M('dl.nobloc');
  if (b.members.includes(X)) return M('dl.inbloc', { t: X });
  if (atWar(S, P, X)) return M('dl.atwar');
  return dealClash3(S, P, X, t);
}
function blocJoin3(S, X, t) {
  const w = blocCheck3(S, X, t); if (w) return M('dl.void', { x: M('dk.bloc'), r: w });
  const b = S.blocs[t.bloc]; for (const m of b.members) addRel(S, m, X, 5); b.members.push(X);
  return M('dl.bloc_join', { t: X, x: M('bloc.' + b.id) });
}
const dealCheck3 = (S, X, t) => (t.type === 'bloc' ? blocCheck3(S, X, t) : dealCheck(S, X, t));
function dealApply3(S, X, terms, R) {
  const ok = terms.filter(t => !dealCheck3(S, X, t));
  if (!ok.length) return { why: dealCheck3(S, X, terms[0]) || M('dl.unknown') };
  const rest = terms.filter(t => t.type !== 'bloc'), done = rest.length ? applyDeal(S, X, rest, R) : [];
  for (const t of terms) if (t.type === 'bloc') done.push(blocJoin3(S, X, t));
  return { done };
}
/* 旧版外交行动：复查之后照旧执行（对方在行动里当场决定，报告也由行动写）；对方拒绝时不算选中，别人的协议还能生效 */
function askApply3(S, X, d, R) {
  const P = S.player, p = d.q.params || {}, id = p.act;
  if (!ACT[id] || !ASK3.has(id)) return { why: M('dl.unknown') };
  for (const t of d.terms) { const w = dealClash3(S, P, X, t); if (w) return { why: w }; }
  const ap = Object.assign({}, p.aparams || {});
  execPlayerItem(S, { actor: P, kind: 'act', id, target: X, params: ap, q: { type: id, target: X, params: ap } }, R);
  const held = id === 'vassal' || (id === 'peace' && ap.terms === 'vassal') ? S.actors[X].overlord === P : id === 'peace' ? !atWar(S, P, X) : ['trade', 'alliance', 'nap', 'access', 'armsctl'].includes(id) ? hasTreaty(S, P, X, id) : true;
  return held ? { act: true } : { no: true };
}
/* 协议在 AI 国家眼里值多少（同一套评估：关系、影响力、各项条款的好处） */
function dealValue(S, P, X, terms) {
  const x = S.actors[X]; let v = rel(S, X, P) / 200 + infl(S, P, X) / 300;
  for (const t of terms) {
    if (['trade', 'alliance', 'nap', 'access', 'partner', 'armsctl', 'vassal', 'peace', 'ceasefire', 'join_war'].includes(t.type)) { v += evalDeal(S, P, X, t).score; continue; }
    const amt = +t.amount || S.actors[P].gdp * 0.002, base = Math.max(0.1, x.gdp * 0.01);
    switch (t.type) {
      case 'bloc': v += evalDeal(S, P, X, { type: 'alliance' }).score; break;
      case 'aid': v += Math.min(1.2, amt / base * 0.25); break;
      case 'arms': v += Math.min(1, amt / base * 0.2) * (enemies(S, X).length ? 1.3 : 0.6); break;
      case 'lift_my_sanctions': v += 0.4; break;
      case 'tech_share': v += x.tech < S.actors[P].tech ? 0.15 : -0.1; break;
      case 'withdraw': case 'pledge_no_attack': v += 0.2; break;
      case 'tribute': v -= 0.5; break;
      case 'lift_sanctions': v -= 0.1; break;
      case 'drop_ultimatum': case 'break_alliance': v -= 0.3; break;
      case 'send_troops': v -= 0.2; break;
      case 'mobilize': case 'raise_defense': v -= 0.1; break;
    }
  }
  return v;
}
/* 一份协议对第三方的牵连：站到哪一边、要打谁、要和谁断盟（在签约国的席位里算，出兵的目的地按签约国的战线） */
function dealSides(S, terms) {
  const s = { align: false, vassal: false, ally: false, hostile: new Set(), breakw: new Set() };
  for (const t of terms) {
    if (['alliance', 'partner', 'access', 'vassal', 'bloc', 'join_war', 'send_troops'].includes(t.type)) s.align = true;
    if (t.type === 'vassal') s.vassal = true;
    if (['alliance', 'partner', 'bloc'].includes(t.type)) s.ally = true;
    if (t.type === 'join_war') { const E = boss(S, String(t.enemy || '').toUpperCase()); if (S.actors[E]) s.hostile.add(E); }
    if (t.type === 'send_troops') { const d = dealDest(S, t), f = d && S.fronts.find(z => z.id === d); if (f) s.hostile.add(boss(S, f.target)); }
    if (t.type === 'break_alliance') { const w = String(t.with || '').toUpperCase(); if (S.actors[w]) s.breakw.add(w); }
  }
  return s;
}
function dealsClash(S, a, b) {
  if (a.P === b.P) return false;
  const A = a.s, B = b.s, pa = a.P, pb = b.P;
  if (A.hostile.has(pb) || A.hostile.has(boss(S, pb)) || B.hostile.has(pa) || B.hostile.has(boss(S, pa))) return true; // 要它打其中一方
  if (A.align && B.align && rivals3(S, pa, pb)) return true; // 同时站到互为对手的两边
  if (A.vassal && B.vassal) return true; // 不能同时臣服两国
  if ((A.breakw.has(pb) && B.align) || (B.breakw.has(pa) && A.align)) return true; // 一方要它和另一方断盟，另一方要它站到自己这边
  return false;
}
function dealRefund(S, P, n) { if (!(n > 0)) return; S.apRefund = S.apRefund || {}; S.apRefund[P] = (S.apRefund[P] || 0) + n; }
function resolveDeals(S, ds, R) {
  const byX = {}; for (const d of ds) (byX[d.X] = byX[d.X] || []).push(d);
  const D3 = S.dealt3 && S.dealt3.turn === S.turn ? S.dealt3 : (S.dealt3 = { turn: S.turn, list: [] });
  const voidIt = (d, why) => { RP(S, d.P, R).actions.push({ msg: M(d.ap ? 'dl.res_void' : 'dl.res_void0', { a: d.X, x: why || M('dl.unknown'), n: d.ap }), tone: 'bad', did: d.did }); dealRefund(S, d.P, d.ap); };
  for (const X of Object.keys(byX).sort()) {
    const list = byX[X];
    for (const d of list) { const p = d.q.params || {}; d.kind = d.kind || 'sign'; d.terms = cleanDealTerms(p.terms, d.kind === 'offer' || d.kind === 'cmd'); d.did = p.did || ''; d.ap = d.q.ap || 0; }
    if (!S.actors[X] || !indep(S, X) || isHuman(S, X)) { for (const d of list) voidIt(d, M('of.gone', { a: X })); continue; }
    for (const d of list) withSeat(S, d.P, () => { d.v = dealValue(S, d.P, X, d.terms) + (d.kind === 'offer' ? 2 : 0); d.s = dealSides(S, d.terms); }); // 它自己发出的来函优先
    list.sort((a, b) => b.v - a.v || (a.P < b.P ? -1 : a.P > b.P ? 1 : 0));
    const won = [];
    for (const d of list) {
      const RR = RP(S, d.P, R), w = won.find(z => dealsClash(S, z, d));
      if (w) {
        RR.actions.push({ msg: M(d.ap ? 'dl.res_lost' : 'dl.res_lost0', { a: X, b: w.P, n: d.ap }), tone: 'bad', did: d.did, about: [X, w.P] });
        RP(S, w.P, R).intel.push({ msg: M('dl.res_won', { a: X, b: d.P }), tone: 'good', about: [X, d.P] });
        dealRefund(S, d.P, d.ap); continue;
      }
      if (!d.terms.length) { voidIt(d, M('dl.unknown')); continue; }
      const res = withSeat(S, d.P, () => (d.kind === 'offer' ? offerApply3(S, X, d.offer.deal, RR) : d.kind === 'ask' ? askApply3(S, X, d, RR) : dealApply3(S, X, d.terms, RR)));
      if (res.why) { voidIt(d, res.why); continue; }
      if (res.no) continue; // 旧版行动：对方拒绝了（行动自己写了战报，行动力不退）
      if (res.done) RR.actions.push({ msg: M('dl.res_ok', { a: X, x: { list: res.done } }), tone: 'good', did: d.did, about: [X] });
      won.push(d);
      if (d.s.align) D3.list.push({ P: d.P, X, did: d.did, ap: d.ap, kind: d.kind, types: d.terms.map(t => t.type) });
    }
  }
}
/* 政变成功：同一回合刚和它签了站边协议、又是政变方对手的玩家，协议被推翻（同盟、伙伴、驻军、入集团撤销），行动力退还 */
function coupUndo3(S, me, X, R) {
  const D = S.dealt3; if (!RULES3 || !D || D.turn !== S.turn) return;
  for (const z of D.list) {
    if (z.X !== X || z.P === me || z.undone) continue;
    const lostVassal = z.types.includes('vassal') && S.actors[X].overlord !== z.P;
    if (!lostVassal && !rivals3(S, z.P, me)) continue;
    z.undone = true;
    for (const k of ['alliance', 'partner', 'access']) removeTreaty(S, k, z.P, X);
    for (const b of Object.values(S.blocs || {})) if (b.members.includes(z.P) && b.members.includes(X) && z.types.includes('bloc')) b.members = b.members.filter(m => m !== X);
    if (isHuman(S, z.P)) withSeat(S, z.P, () => { S.commits = S.commits.filter(c => !(c.with === X && c.type === 'defend' && c.since === S.turn)); });
    dealRefund(S, z.P, z.ap);
    RP(S, z.P, R).actions.push({ msg: M(z.ap ? 'dl.res_coup' : 'dl.res_coup0', { a: X, b: me, n: z.ap }), tone: 'bad', did: z.did, about: [X, me] });
  }
}
/* 自己和自己矛盾：本回合的协议（结算一开始生效）和本回合排的行动（随后执行）冲突。界面据此提示，不禁止 */
const SELF3 = { atk: ['strike', 'invade', 'blockade', 'nuke'], sanc: ['sanction', 'tariff', 'techban', 'finsanction', 'energy'], arms: ['buildup', 'mobilize'] };
function selfConflicts3(S) {
  if (!RULES3) return [];
  const P = S.player, deals = [], out = [];
  for (const q of S.queue) if (q.type === 'deal' && q.target) deals.push({ X: q.target, terms: (q.params && q.params.terms) || [], ref: q });
  for (const z of S.pend3 || []) if (z.P === P) deals.push({ X: z.X, terms: z.terms || [], ref: z });
  for (const d of deals) {
    const ty = new Set(d.terms.map(t => t.type)), calm = ['nap', 'peace', 'ceasefire', 'alliance', 'partner', 'vassal', 'access', 'bloc'].filter(k => ty.has(k));
    const wl = d.terms.filter(t => t.type === 'withdraw').map(t => String(t.loc || '').toUpperCase());
    for (const q of S.queue) {
      if (q.type === 'deal') continue;
      const hit = q.target && S.actors[q.target] && (q.target === d.X || boss(S, q.target) === d.X);
      let why = null, term = null;
      if (calm.length && hit && SELF3.atk.includes(q.type)) { why = 'atk'; term = calm[0]; }
      else if (ty.has('lift_my_sanctions') && hit && SELF3.sanc.includes(q.type)) { why = 'sanc'; term = 'lift_my_sanctions'; }
      else if (ty.has('armsctl') && SELF3.arms.includes(q.type)) { why = 'arms'; term = 'armsctl'; }
      else if (q.type === 'deploy' && wl.includes(q.to)) { why = 'forces'; term = 'withdraw'; }
      if (why) out.push({ deal: d.ref, item: q, X: d.X, why, term });
    }
  }
  return out;
}

function dealDest(S, t) { const f = t.front && S.fronts.find(z => z.id === String(t.front)); if (f && f.att === S.player) return f.id; const L = String(t.loc || '').toUpperCase(); if (S.actors[L]) return 'D:' + L; const g = S.fronts.find(z => z.att === S.player); return g ? g.id : null; }
/* ---------- Claude 战略规划 ---------- */
const RL_TYPES = ['attack', 'attack_ally', 'forces_in', 'alliance_with', 'nuke_use', 'nuke_program', 'blockade', 'annex'];
function planTargets(S, n = 2) {
  const P = S.player;
  return IDS.filter(X => !isHuman(S, X) && indep(S, X) && !NEU(S, X) && (isGreat(S, X) || (sc().agenda[X] && sc().agenda[X].goals && S.actors[X].gdp > 700 * (sc().gdpScale || 1)) || (S.threat[X] || 0) > 55) && (!S.actors[X].plan || S.actors[X].plan.until <= S.turn))
    .sort((a, b) => ((S.threat[b] || 0) + power(S, b) / 60) - ((S.threat[a] || 0) + power(S, a) / 60)).slice(0, n);
}
function applyPlan(S, X, p) {
  if (!S.actors[X] || isHuman(S, X) || !p || typeof p !== 'object' || NEU(S, X)) return false;
  const moveTypes = new Set(ACTIONS.map(a => a.id).concat(['ultimatum', 'gray', 'deploy', 'attack']));
  const st = {}; for (const [Y, v] of Object.entries(p.stance && typeof p.stance === 'object' ? p.stance : {})) { const k = String(Y).toUpperCase(); if (S.actors[k] && k !== X && SB[v] && !NEU(S, k)) st[k] = v; }
  const red = (Array.isArray(p.red) ? p.red : []).filter(r => r && typeof r === 'object').slice(0, 4).map(r => ({ type: String(r.type || ''), t: r.t ? String(r.t).toUpperCase() : undefined, loc: r.loc ? String(r.loc).toUpperCase() : undefined, why: String(r.why || '').slice(0, 80) })).filter(r => RL_TYPES.includes(r.type) && (!r.t || S.actors[r.t]) && (!r.loc || S.actors[r.loc]));
  const moves = (Array.isArray(p.moves) ? p.moves : []).filter(m => m && typeof m === 'object').slice(0, 6).map(m => ({ type: String(m.type || ''), target: m.target ? String(m.target).toUpperCase() : null, priority: clamp(+m.priority || 1, 1, 3) })).filter(m => moveTypes.has(m.type) && (!m.target || S.actors[m.target]));
  if (S.neutral) { for (let i = red.length - 1; i >= 0; i--) if (NEU(S, red[i].t) || NEU(S, red[i].loc)) red.splice(i, 1); for (let i = moves.length - 1; i >= 0; i--) if (NEU(S, moves[i].target)) moves.splice(i, 1); }
  S.actors[X].plan = { turn: S.turn, until: S.turn + 4, assessment: ltxt(p.assessment, 300), goals: ltxt(p.goals, 200), public: ltxt(p.public, 200), stance: st, red, moves };
  return true;
}

/* ---------- 视图 ---------- */
function stats(S, id) {
  const x = S.actors[id], d = DEF[id];
  return { id, gdp: x.gdp, pop: d.pop, growth: x.lastG * 4, power: power(S, id), land: landEff(S, id), navy: navyEff(S, id), air: airEff(S, id), guard: homeGuard(S, id),
    nukes: x.nukes, nukeProg: x.nukeProg, tech: x.tech, stab: x.stab, milPct: x.milPct, mob: x.mob, treasury: x.treasury, ctrl: x.ctrl, overlord: x.overlord, resist: x.resist, integrated: x.integrated,
    reach: reach(S, id), gov: d.gov, intel: intelOf(S, id), forces: JSON.parse(JSON.stringify(x.forces)), moves: JSON.parse(JSON.stringify(x.moves)), units: unitsOf(S, id), pers: x.pers };
}
function rankings(S) { return IDS.filter(id => indep(S, id)).map(id => ({ id, gdp: S.actors[id].gdp, power: power(S, id), nukes: S.actors[id].nukes, stab: S.actors[id].stab })); }
function politicsView(S) {
  const P = S.player, d = DEF[P];
  return { gov: SHD(S, P) ? null : d.gov, govM: d.gov, fac: Object.assign({}, S.pol.fac), next: S.pol.next, left: S.pol.next === null ? null : S.pol.next - S.turn, odds: S.pol.next === null ? null : electionOdds(S), coup: d.gov === 'dem' || SHD(S, P) ? 0 : coupRisk(S), apPen: S.pol.apPen, results: S.pol.results.slice(), rep: Object.assign({}, S.rep), cb: Object.entries(S.cb).filter(([, c]) => c.until >= S.turn).map(([X, c]) => Object.assign({ t: X }, c)), commits: S.commits.slice(), strict: S.strict };
}
function dossier(S, X) {
  const P = S.player, x = S.actors[X];
  const reds = redLinesOf(S, X).map(r => Object.assign({}, r, { crossed: S.crossed[X + ':' + r.type + ':' + (r.t || r.loc || '')] !== undefined }));
  return { id: X, rel: rel(S, X, P), threat: S.threat[X] || 0, grudge: S.grudge[X] || 0, favor: S.favor[X] || 0, mem: (S.mem[X] || []).slice().reverse(), red: reds, plan: x.plan && x.plan.until >= S.turn ? x.plan : null,
    stance: stanceOf(S, X, P), cred: x.cred ?? 60, hawk: x.hawk, cb: legitCB(S, X), commits: S.commits.filter(c => c.with === X), warnings: S.warnings.filter(w => w.by === X || w.to === X), tension: S.tension2[rk(X, P)] || 0,
    ops: S.ops.filter(o => o.owner === X && o.det.includes(P)).map(o => Object.assign({}, o)), ultis: S.ultis.filter(u => u.from === X && u.status === 'open') };
}
function estimateInvade(S, T, amount, from) { const P = S.player; const opts = stagingOptions(S, P, T); const o = (from && opts.find(z => z.L === from)) || opts[0]; if (!o) return null; return { L: o.L, kind: o.kind, eta: o.eta, ratio: estimateOp(S, P, T, amount, o.kind), min: minTurns(T), opts }; }
