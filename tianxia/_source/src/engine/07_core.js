// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 核心利益：侵犯检测与升级阶梯 =====================
 * 阶梯：0 预警 → 1 严正警告（划红线、限期、动员） → 2 强制施压（大规模演习、制裁、网络战、集结） → 3 有限军事行动（封锁、精确打击驻军） → 4 战争
 * 决策：有 Claude 时由其扮演该国安全决策层，结合兵力对比、核风险、经济代价、国内政治给出具体行动与理由；否则由规则计算。
 */
const CORE_LV = ['warn0', 'warn', 'coerce', 'limited', 'war'];
function coreList() { return (sc().core || []).filter(c => DEF[c.o]); }
const coreLocs = c => (c.loc ? (Array.isArray(c.loc) ? c.loc : [c.loc]) : []);
const coreTs = c => (Array.isArray(c.t) ? c.t : c.t ? [c.t] : []);
const coreKey = (c, v) => c.id + ':' + v;
function coreRivalOk(S, c, V) { return !c.rival || rel(S, c.o, V) < 20 || isGreat(S, V) || atWar(S, c.o, V); }
// 当前侵犯者：[{v, loc, sev}]；pre=true 时返回“即将侵犯”（部队在途、正在集结）
function coreViol(S, c, pre) {
  const o = c.o, out = [];
  const bad = V => V && V !== o && S.actors[V] && indep(S, V) && !isAlly(S, o, V) && S.actors[V].overlord !== o && coreRivalOk(S, c, V) && (!c.vs || c.vs.includes(V));
  switch (c.type) {
    case 'forces_in':
      for (const L of coreLocs(c)) for (const V of IDS) {
        if (V === L || !bad(V)) continue;
        if (!pre && share(S, V, L) >= 0.008) out.push({ v: V, loc: L, sev: share(S, V, L) });
        if (pre && S.actors[V].moves.some(m => m.to === L) && share(S, V, L) < 0.008) out.push({ v: V, loc: L, sev: dotw(S, V, S.actors[V].moves.filter(m => m.to === L).reduce((s, m) => vadd(s, m.v), V0())) });
      }
      break;
    case 'pact_with':
      if (!pre) for (const V of IDS) if (bad(V) && V !== c.t && (hasTreaty(S, V, c.t, 'alliance') || hasTreaty(S, V, c.t, 'access'))) out.push({ v: V, loc: c.t, sev: 1 });
      break;
    case 'attack':
      for (const t of coreTs(c)) for (const V of IDS) {
        if (!bad(V) || V === t || !S.actors[t]) continue;
        const hit = S.fronts.some(f => f.att === V && (f.target === t || boss(S, f.target) === t)) || (S.turnEvents || []).some(e => e.actor === V && ['strike', 'blockade', 'invade'].includes(e.type) && (e.target === t || (S.actors[e.target] && boss(S, e.target) === t)));
        if (!pre && hit) out.push({ v: V, loc: t, sev: 1 });
        if (pre && !hit && S.ops.some(op => op.owner === V && (op.target === t || boss(S, op.target) === t) && op.det.includes(o))) out.push({ v: V, loc: t, sev: 0.6 });
      }
      break;
    case 'blockade':
      if (!pre) for (const t of coreTs(c)) for (const b of S.blockades) if (b.target === t && bad(b.by)) out.push({ v: b.by, loc: t, sev: 1 });
      break;
    case 'nuke_program': { const y = S.actors[c.t]; if (!pre && bad(c.t) && (y.nukeProg >= 80 || (y.nukes > 0 && !DEF[c.t].nukes))) out.push({ v: c.t, loc: c.t, sev: 1 }); break; }
    case 'arms_to':
      if (!pre) for (const e of (S.turnEvents || [])) if (e.type === 'armsaid' && e.target === c.t && bad(e.actor) && !out.some(z => z.v === e.actor)) out.push({ v: e.actor, loc: c.t, sev: 0.5 });
      break;
    case 'embargo':
      if (!pre) for (const V of IDS) if (bad(V) && (sanctionLevel(S, V, o, 'energy') >= 1 || sanctionLevel(S, V, o, 'econ') >= 3)) out.push({ v: V, loc: o, sev: 1 });
      break;
  }
  return out;
}
// 只追究玩家及其盟友/附庸（AI 之间的冲突由热点机制处理）
function coreParty(S, V, c) { if (c && c.ai) return true; return humansOf(S).some(P => V === P || (indep(S, P) && (S.actors[V].overlord === P || isAlly(S, V, P)))); }
// 保护型核心利益：他国攻击或封锁的是所有者要保护的第三方（而不是所有者本身）
const coreProt = k => (k.type === 'attack' || k.type === 'blockade') && !!(k.t || k.loc) && (k.t || k.loc) !== k.o;
function coreBaseline(S) { S.coreSeen = S.coreSeen || {}; for (const c of coreList()) for (const z of coreViol(S, c, false)) S.coreSeen[coreKey(c, z.v)] = true; }
function coreHold(S, X, L) { return (S.coreC || []).some(k => k.o === X && k.status === 'active' && k.lvl >= 1 && dist(L, k.loc) <= 1500); }
const coreOf = (S, id) => (S.coreC || []).find(k => k.id === id);
function coreTheater(S, k) { return k.theater || (k.type === 'embargo' ? null : k.loc); }
function coreInterest(k) { return M('ci.' + k.type, { l: k.loc, t: (Array.isArray(k.t) && k.loc ? k.loc : k.t) || k.loc }); }

/* ---------- 扫描：新的侵犯、在途预警、已化解的危机 ---------- */
function coreScan(S, R) {
  S.coreC = S.coreC || []; S.coreSeen = S.coreSeen || {}; S.coreWarned = S.coreWarned || {};
  for (const c of coreList()) {
    const o = c.o; if (!indep(S, o) || S.actors[o].overlord) continue; // 附庸（如投降后的日本）没有独立的核心利益危机
    const cur = coreViol(S, c, false); const curKeys = new Set(cur.map(z => coreKey(c, z.v)));
    for (const key of Object.keys(S.coreSeen)) if (key.startsWith(c.id + ':') && !curKeys.has(key)) delete S.coreSeen[key];
    if (isHuman(S, o)) { // 玩家自己的核心利益被侵犯：情报提示，并建立危机——是否沿阶梯升级由玩家亲自决定
      for (const z of cur) {
        const key = coreKey(c, z.v); if (S.coreSeen[key]) continue; S.coreSeen[key] = true;
        RP(S, o, R).intel.push({ msg: M('in.core_mine', { a: z.v, x: coreInterest(Object.assign({}, c, { loc: z.loc })) }), tone: 'bad', about: [z.v], big: true });
        if (atWar(S, o, z.v)) continue;
        withSeat(S, o, () => grantCB(S, z.v, 'core', 12)); // 对方侵犯你的核心利益：你获得正当的反制理由
        const act = S.coreC.find(k => k.status === 'active' && k.o === o && k.v === z.v);
        if (act) { if (!act.parts.some(q => q.key === key)) act.parts.push({ cid: c.id, key }); act.sev = Math.max(act.sev || 0, z.sev); act.w = Math.max(act.w, c.w); continue; }
        S.coreC.push({ id: 'C' + S.seq++, key, cid: c.id, parts: [{ cid: c.id, key }], o, v: z.v, type: c.type, t: Array.isArray(c.t) ? z.loc : (c.t || null), loc: z.loc, w: c.w, theater: c.theater || null, lvl: 0, since: S.turn, due: 1e9, status: 'active', hist: [], holds: 0, sev: z.sev, noise: 0, fresh: true, ai: false, mine: true });
      }
      continue;
    }
    for (const z of cur) {
      const key = coreKey(c, z.v);
      if (S.coreSeen[key] || !coreParty(S, z.v, c)) continue;
      if (atWar(S, o, z.v) && !S.coreC.some(k => k.status === 'active' && k.o === o && k.v === z.v)) continue; // 已在交战：由战争本身处理
      if (S.coreC.some(k => k.key === key && k.status === 'noted' && (k.end ?? -99) >= S.turn - 4)) continue;
      const act = S.coreC.find(k => k.status === 'active' && (k.parts || []).some(q => q.key === key));
      if (act) { act.sev = Math.max(act.sev || 0, z.sev); continue; }
      const same = S.coreC.find(k => k.status === 'active' && k.o === o && k.v === z.v && (k.loc === z.loc || coreTheater(S, k) === z.loc));
      if (same) { // 同一战区的新侵犯并入原危机：视为无视警告、继续加码
        same.parts.push({ cid: c.id, key }); same.w = Math.max(same.w, c.w); same.provoked = true; same.sev = Math.max(same.sev || 0, z.sev);
        if (c.type === 'forces_in' || c.w > same.w) { same.cid = c.id; same.type = c.type; same.loc = z.loc; same.t = Array.isArray(c.t) ? z.loc : (c.t || null); }
        if (same.lvl >= 1) same.due = Math.min(same.due, S.turn + 1);
        pushEv(S, { type: 'core', actor: z.v, target: o, sev: 20 + 15 * c.w, third: 6, core: same.id });
        continue;
      }
      const k = { id: 'C' + S.seq++, key, cid: c.id, parts: [{ cid: c.id, key }], o, v: z.v, type: c.type, t: Array.isArray(c.t) ? z.loc : (c.t || null), loc: z.loc, w: c.w, theater: c.theater || null, lvl: 0, since: S.turn, due: S.turn, status: 'active', hist: [], holds: 0, sev: z.sev, noise: +(rn(S) * 0.15).toFixed(3), fresh: true, ai: !!c.ai };
      S.coreC.push(k);
      pushEv(S, { type: 'core', actor: z.v, target: o, sev: 20 + 20 * c.w, third: 6, core: k.id });
    }
    for (const z of coreViol(S, c, true)) {
      const key = coreKey(c, z.v); if (!coreParty(S, z.v, c) || S.coreSeen[key] || S.coreC.some(k => k.status === 'active' && k.o === o && k.v === z.v)) continue;
      if ((S.coreWarned[key] ?? -99) >= S.turn - 4) continue;
      S.coreWarned[key] = S.turn;
      const msg = M('cs.pre', { v: { voice: o }, t: z.v, x: coreInterest(Object.assign({}, c, { loc: z.loc })) });
      if (isHuman(S, z.v)) { RP(S, z.v, R).toYou.push({ actor: o, msg, tone: 'bad', big: true }); withSeat(S, z.v, () => { remember(S, o, M('mem.core_pre', { x: coreInterest(Object.assign({}, c, { loc: z.loc })) }), -8); S.threat[o] = clamp((S.threat[o] || 0) + 10, 0, 100); }); }
      else R.world.push({ actor: o, msg, tone: 'warn', about: [z.v] });
    }
  }
  // 已化解
  for (const k of S.coreC) {
    if (k.status !== 'active') continue;
    if (!k.parts) k.parts = [{ cid: k.cid, key: k.key }];
    const alive = indep(S, k.o) && indep(S, k.v);
    k.parts = k.parts.filter(q => { const c = coreList().find(z => z.id === q.cid); return alive && c && coreViol(S, c, false).some(z => z.v === k.v); });
    if (k.parts.length) {
      if (!k.parts.some(q => q.cid === k.cid)) { const c = coreList().find(z => z.id === k.parts[0].cid); k.cid = c.id; k.type = c.type; k.t = Array.isArray(c.t) ? k.loc : (c.t || null); k.loc = c.loc && !Array.isArray(c.loc) ? c.loc : k.loc; k.key = k.parts[0].key; forSeats(S, sb => { for (const u of sb.ultis) if (u.core === k.id && u.status === 'open') u.status = 'complied'; }); k.due = Math.min(k.due, S.turn + 1); }
      continue;
    }
    k.status = indep(S, k.o) ? 'resolved' : 'void'; k.end = S.turn;
    forSeats(S, sb => { for (const u of sb.ultis) if (u.core === k.id && u.status === 'open') { u.status = 'complied'; S.ops = S.ops.filter(op => op.ulti !== u.id); } });
    S.ops = S.ops.filter(op => op.core !== k.id || S.fronts.some(f => f.core === k.id));
    if (k.status === 'resolved' && isHuman(S, k.o)) { // 玩家的核心利益：对方撤退或停止
      const P = k.o; withSeat(S, P, () => { repAdd(S, { cred: k.lvl >= 1 ? 5 : 2 }); facAdd(S, { pub: k.lvl >= 1 ? 2 : 0 }); });
      const msg = M('cs.ok_mine', { a: k.v, x: coreInterest(k) });
      RP(S, P, R).toYou.push({ actor: k.v, msg, tone: 'good', big: true }); logEvent(S, 'core', msg, 'good', [P, k.v]);
    } else if (k.status === 'resolved') {
      const x = S.actors[k.o]; x.cred = clamp((x.cred ?? 60) + 6, 0, 100); addRel(S, k.o, k.v, 6);
      const msg = M('cs.ok', { v: { voice: k.o }, t: k.v });
      (isHuman(S, k.v) ? RP(S, k.v, R).toYou : R.world).push({ actor: k.o, msg, tone: 'info', about: [k.v] });
      logEvent(S, 'core', msg, 'info', [k.o, k.v]);
      if (isHuman(S, k.v)) withSeat(S, k.v, () => remember(S, k.o, M('mem.core_back'), 8));
    }
  }
}

/* ---------- 局势评估（规则与 Claude 共用） ---------- */
function coreLocal(S, X, T) { // X 能投送到 T 附近的地面+空中力量
  let v = V0();
  for (const L of Object.keys(S.actors[X].forces)) { if (L === T) v = vadd(v, freeV(S, X, L)); else if (landAdj(L, T) || dist(L, T) <= 900) v = vadd(v, vmul(freeV(S, X, L), L === X ? 0.7 : 0.9)); }
  return groundV(S, X, v);
}
function coreCalc(S, k) {
  const o = k.o, V = k.v, x = S.actors[o], T = coreTheater(S, k) || V;
  const mine = coreLocal(S, o, T) + 1;
  const def = T === V ? (power(S, V) * 0.5) : (defenseAt(S, T, o).force + groundV(S, V, shareV(S, V, T)) * (atWar(S, V, o) ? 0 : 1) + likelyHelp(S, T, o) * 0.6);
  const ratio = mine / (def + 1);
  const seaMine = forcesNear(S, o, T, 1200, 'navy') + 0.5 * forcesNear(S, o, T, 1200, 'air') + 1;
  let seaThem = 0; for (const c of IDS) if (c !== o && indep(S, c) && (c === V || c === T || c === boss(S, T) || isAlly(S, c, V))) seaThem += forcesNear(S, c, T, 1200, 'navy');
  const seaRatio = seaMine / (seaThem + 1);
  const vn = S.actors[V].nukes + IDS.filter(c => c !== o && S.actors[c].nukes >= 200 && indep(S, c) && isAlly(S, c, V)).reduce((s, c) => s + S.actors[c].nukes, 0);
  const nukeRisk = vn >= 100 ? (k.w >= 3 ? 0.32 : 0.6) : vn > 0 ? 0.25 : 0;
  const econ = k.econ0 ?? (k.econ0 = exposure(S, o, V));
  const facePts = k.hist.filter(h => h.lvl >= 1).length;
  const pl = k.plv || 0; // 玩家（侵犯方）的回应强度：威慑使对方犹豫，动武则激怒对方
  const provoked = !!k.provoked || pl >= 2;
  const cdef = coreList().find(c => c.id === k.cid);
  const deter = pl >= 3 ? -0.15 : pl * 0.035 * clamp((power(S, V) + 1) / (power(S, o) + 1), 0.4, 2);
  const oilDesp = k.type === 'embargo' && DEF[o].oilNeed ? 0.3 * clamp(1 - (x.oil || 0) / (DEF[o].oilNeed * 0.9), 0, 1) : 0; // 石油储备见底：“现在不打就再也打不了”
  const resolve = 0.3 + 0.15 * (k.w - 1) + 0.3 * x.hawk + 0.15 * x.risk + 0.04 * Math.min(3, facePts) + (provoked ? 0.06 : 0) + (k.noise || 0) + (DEF[o].gov === 'aut' ? 0.03 : 0) + (S.diff === 'hard' ? 0.05 : S.diff === 'easy' ? -0.05 : 0) + ((cdef && cdef.bonus) || 0) - deter + oilDesp;
  const prot = coreProt(k);
  const inv = prot ? coreCounter(S, k) : T; // 保护型：反击侵犯者的出发阵地；否则进攻争议地区
  const Tb = prot ? V : T; // 保护型：封锁侵犯者本身
  const est = k.lvl >= 2 && inv && inv !== V && stagingOptions(S, o, inv).length ? estimateOp(S, o, inv, 0.5, stagingOptions(S, o, inv)[0].kind) : prot && inv === V && k.lvl >= 2 && stagingOptions(S, o, V).length ? estimateOp(S, o, V, 0.5, stagingOptions(S, o, V)[0].kind) : 0;
  const canBlock = !!Tb && !LANDLOCKED.has(Tb) && Tb !== o && blockadeStrength(S, o, Tb) >= 1.3 * (blockadeDefense(S, Tb, o) + 1) && !S.blockades.some(b => b.by === o && b.target === Tb);
  const hitAt = coreHitLoc(S, k);
  const canHit = !!(hitAt && strikePower(S, o, hitAt) > 1);
  const canInvade = !!(inv && inv !== o && boss(S, inv) !== o && (prot ? boss(S, inv) === V : inv !== V) && stagingOptions(S, o, inv).length > 0 && !S.fronts.some(f => f.att === o && f.target === inv) && !S.ops.some(op => op.owner === o && op.target === inv && op.core && !op.hold));
  const canJoin = prot && !atWar(S, o, V);
  return { ratio, seaRatio, nukeRisk, econ, resolve, est, canBlock, canHit, canInvade, canJoin, prot, inv, Tb, hitAt, T, facePts, provoked, deter, vShare: T ? share(S, V, T) : 0 };
}

/* 该核心利益的升级上限（剧本可设 cap） */
function coreCap(k) { const c = coreList().find(z => z.id === k.cid); return clamp((c && c.cap) || 4, 1, 4); }
/* 保护型危机的反击目标：侵犯者用来进攻受保护方的出发阵地（须为侵犯者控制），必要时为其本土（非大国） */
function coreCounter(S, k) {
  const V = k.v, o = k.o, T = coreTheater(S, k) || k.loc, c = [];
  for (const f of S.fronts) if (f.att === V && (f.target === T || boss(S, f.target) === T)) c.push(f.from);
  for (const b of S.blockades) if (b.by === V && b.target === T) for (const L of Object.keys(S.actors[V].forces)) if (L !== V && dist(L, T) <= 1200) c.push(L);
  const ok = [...new Set(c)].filter(L => L !== o && L !== V && boss(S, L) === V && stagingOptions(S, o, L).length);
  ok.sort((a, b) => dist(o, a) - dist(o, b));
  if (ok[0]) return ok[0];
  return !isGreat(S, V) && stagingOptions(S, o, V).length ? V : null;
}
/* 精确打击的位置：侵犯者在战区（或附近）的部队；禁运型危机还可打击其本土（如珍珠港） */
function coreHitLoc(S, k) {
  const V = k.v, o = k.o, T = coreTheater(S, k); const y = S.actors[V];
  if (T && y.forces[T] && vsum(shareV(S, V, T)) > 0.002 && strikePower(S, o, T) > 1) return T;
  const near = Object.keys(y.forces).filter(L => L !== V && T && dist(L, T) <= 1500 && vsum(shareV(S, V, L)) > 0.002 && strikePower(S, o, L) > 1).sort((p, q) => dist(p, T) - dist(q, T));
  if (near[0]) return near[0];
  if (k.type === 'embargo' && strikePower(S, o, V) > 1) return V;
  return null;
}
/* 侵犯者（AI）在压力下让步的概率 */
function coreYieldP(S, k) {
  const c = coreList().find(z => z.id === k.cid); if (c && c.yield != null) return c.yield;
  const y = S.actors[k.v];
  return clamp(0.2 - y.hawk * 0.22 + (k.lvl - 2) * 0.07 + clamp((power(S, k.o) + 1) / (power(S, k.v) + 1) - 1, -1, 2) * 0.05, 0.02, 0.35);
}
function coreComply(S, k) {
  const V = k.v, o = k.o;
  for (const q of (k.parts || [{ cid: k.cid }])) {
    const c = coreList().find(z => z.id === q.cid); if (!c) continue;
    switch (c.type) {
      case 'forces_in': for (const L of coreLocs(c)) { if (!S.actors[V].forces[L] && !S.actors[V].moves.some(m => m.to === L)) continue; S.fronts = S.fronts.filter(f => !(f.att === V && f.from === L)); S.ops = S.ops.filter(op => !(op.owner === V && op.from === L)); S.actors[V].moves = S.actors[V].moves.filter(m => m.to !== L); if (S.actors[V].forces[L]) orderMove(S, V, L, V, shareV(S, V, L).slice()); } break;
      case 'pact_with': removeTreaty(S, 'alliance', V, c.t); removeTreaty(S, 'access', V, c.t); break;
      case 'attack': for (const t of coreTs(c)) { const D = boss(S, t); if (atWar(S, V, D)) makePeace(S, V, D, 'ceasefire'); S.ops = S.ops.filter(op => !(op.owner === V && boss(S, op.target) === D)); } break;
      case 'blockade': S.blockades = S.blockades.filter(b => !(b.by === V && coreTs(c).includes(b.target))); break;
      case 'nuke_program': { const y = S.actors[V]; if (!y.nukes) y.nukeProg = Math.max(0, y.nukeProg - 25); break; }
      case 'embargo': S.sanctions = S.sanctions.filter(z => !(z.from === V && z.to === o && (z.kind === 'energy' || z.kind === 'econ'))); break;
    }
  }
}
/* 开局即已存在的危机（剧本 coreStart） */
function coreOpen(S, z) {
  const c = coreList().find(q => q.id === z.cid); if (!c || !S.actors[z.v] || !indep(S, c.o) || !indep(S, z.v) || isHuman(S, c.o)) return null; // 玩家自己的核心利益由玩家决定
  const vi = coreViol(S, c, false).find(q => q.v === z.v); const loc = vi ? vi.loc : (coreLocs(c)[0] || coreTs(c)[0] || c.o);
  const key = coreKey(c, z.v), lvl = clamp(z.lvl || 1, 1, 3);
  const k = { id: 'C' + S.seq++, key, cid: c.id, parts: [{ cid: c.id, key }], o: c.o, v: z.v, type: c.type, t: Array.isArray(c.t) ? loc : (c.t || null), loc, w: c.w, theater: c.theater || null, lvl, since: -(z.age || 2), due: z.due ?? 1, status: 'active', hist: [], holds: 0, sev: 1, noise: 0, fresh: false, ai: !!c.ai };
  k.hist.push({ t: -1, lvl, ops: z.ops ? z.ops.map(o => M(o)) : [], st: M('cs.L' + lvl, { v: { voice: c.o }, t: z.v, x: coreInterest(k) }), why: [], src: 'rule' });
  S.coreC.push(k); S.coreSeen[key] = true;
  if (isHuman(S, z.v)) { const d = coreDemand(S, k); if (d) { const u = Object.assign({ id: 'U' + S.seq++, from: c.o, conseq: 'war', resolve: 0.9, turn: 0, deadline: k.due, status: 'open', base: S.actors[z.v].nukeProg, core: k.id }, d); seatOf(S, z.v).ultis.push(u); k.ulti = u.id; } }
  return k;
}

/* ---------- 规则决策 ---------- */
function coreRule(S, k) {
  const m = coreCalc(S, k), x = S.actors[k.o], ops = [], why = [];
  const struck = (k.plv || 0) >= 3 && k.lvl < 3; // 侵犯方已先动武：直接进入对等报复
  const next = struck ? 3 : Math.min(4, k.lvl + 1);
  if (m.ratio >= 1.3) why.push(M('cw.balance_good', { r: +m.ratio.toFixed(1) })); else if (m.ratio < 0.8) why.push(M('cw.balance_bad', { r: +m.ratio.toFixed(1) }));
  if (m.nukeRisk >= 0.5) why.push(M('cw.nuke_high')); else if (m.nukeRisk > 0) why.push(M('cw.nuke_low'));
  if (m.econ > 0.12) why.push(M('cw.econ'));
  if (m.facePts) why.push(M('cw.face'));
  if (m.provoked) why.push(M('cw.defy'));
  // 首次：严正警告
  if (k.lvl === 0 && !struck) {
    ops.push({ op: 'demand', wait: 2 });
    if (k.w >= 2) { ops.push({ op: 'mobilize', level: 1 }); if (m.T && m.T !== k.o) ops.push({ op: 'deploy', share: 0.08 }); ops.push({ op: 'exercise' }); }
    ops.push({ op: 'sanction', kind: k.w >= 3 && m.econ < 0.15 ? 'econ' : 'tech', level: k.w >= 3 ? 2 : 1 });
    return { lvl: 1, ops, wait: k.w >= 2 ? 2 : 3, why, src: 'rule' };
  }
  const capL = coreCap(k);
  if (k.lvl >= capL && !struck) { // 该利益只值得有限度的施压：维持压力，久拖不决则接受现状
    k.holds = (k.holds || 0) + 1;
    if (k.holds >= 4 || (k.holds >= 2 && chance(S, 0.3))) return { lvl: k.lvl, ops: [{ op: 'accept' }], why: why.concat([M('cw.accept')]), src: 'rule' };
    return { lvl: k.lvl, ops: [{ op: 'exercise' }, { op: 'sanction', kind: 'econ', level: 2 }], wait: 2, why: why.concat([M('cw.limited')]), src: 'rule' };
  }
  if ((k.type === 'arms_to' || k.w <= 1) && !struck) { // 低权重：只做一次性回应
    return { lvl: k.lvl, ops: [{ op: 'sanction', kind: 'tech', level: 1 }], wait: 4, why: why.concat([M('cw.limited')]), src: 'rule', done: true };
  }
  const cost = { 2: 0.45 + m.econ * 0.5, 3: 0.72 + m.nukeRisk * 0.5 + m.econ * 0.4 - clamp((m.ratio - 1) * 0.08, -0.1, 0.15), 4: 0.95 + m.nukeRisk * 0.6 + m.econ * 0.3 - clamp((m.est - 0.9) * 0.3, -0.25, 0.25) + (S.blockades.some(b => b.by === k.o && b.target === m.T && S.turn - b.since < 4) ? 0.08 : 0) }[next];
  // 与另一大国直接交火可能演变为全面战争（冷战时期的超级大国谨慎）
  const gp = next >= 3 && sc().gpWar && isGreat(S, k.v) && !atWar(S, k.o, k.v) ? sc().gpWar * (k.w >= 3 ? 0.5 : 1) : 0;
  const u = m.resolve - cost - gp; k.u = +u.toFixed(3);
  const go = struck || chance(S, sig(u / 0.15)); // 遭到先发打击：以牙还牙几乎是必然的
  if (!go) {
    k.holds = (k.holds || 0) + 1;
    if (((k.holds >= 2 && chance(S, 0.4)) || k.holds >= 4) && (k.plv || 0) < 3) return { lvl: k.lvl, ops: [{ op: 'accept' }], why: why.concat([M('cw.accept')]), src: 'rule' };
    const hold = [{ op: 'exercise' }]; if (k.lvl >= 2 && x.hawk > 0.5 && isHuman(S, k.v)) hold.push({ op: 'cyber' });
    return { lvl: k.lvl, ops: hold, wait: 2, why: why.concat([M('cw.hold')]), src: 'rule' };
  }
  k.holds = 0;
  if (next === 2) {
    ops.push({ op: 'exercise' }, { op: 'mobilize', level: 2 }, { op: 'sanction', kind: m.econ > 0.15 ? 'tech' : 'econ', level: m.econ > 0.15 ? 1 : 3 });
    if (x.hawk > 0.35) ops.push({ op: 'cyber' });
    if (m.T && m.T !== k.o) ops.push({ op: 'deploy', share: 0.12 });
    if (m.prot) ops.push({ op: 'arms' });
    if (m.canInvade && k.w >= 3) ops.push({ op: 'mass', share: clamp(0.35 + (1 - Math.min(1, m.ratio)) * 0.2, 0.3, 0.6) });
    return { lvl: 2, ops, wait: 2, why, src: 'rule' };
  }
  if (next === 3) {
    if (m.canBlock) ops.push({ op: 'blockade' });
    if (m.canHit) ops.push({ op: 'strike' });
    if (m.prot) { ops.push({ op: 'arms' }); if (m.T && m.T !== k.o) ops.push({ op: 'deploy', share: 0.15 }); }
    if (!m.canBlock && !m.canHit) { if (x.nukes > 0) ops.push({ op: 'nuke_threat' }); ops.push({ op: 'cyber' }, { op: 'sanction', kind: 'econ', level: 3 }); }
    else if (x.nukes > 0 && m.nukeRisk > 0) ops.push({ op: 'nuke_threat' });
    return { lvl: 3, ops, wait: 2, why, src: 'rule' };
  }
  // 战争
  if (m.canJoin) ops.push({ op: 'join', share: clamp(0.12 + x.hawk * 0.1, 0.1, 0.25) });
  if (m.canHit) ops.push({ op: 'strike' }); // 先以空中力量打击，再投入地面进攻
  if (m.canInvade) ops.push({ op: 'invade', share: clamp(0.45 + (1.2 - Math.min(1.2, m.est)) * 0.25, 0.4, 0.75) });
  if ((atWar(S, k.o, k.v) || m.canJoin) && x.hawk > 0.55) ops.push({ op: 'strike_bases' });
  if (!ops.length) ops.push({ op: 'sanction', kind: 'econ', level: 3 }, { op: 'cyber' });
  return { lvl: 4, ops, wait: 3, why, src: 'rule' };
}

/* ---------- 执行 ---------- */
const CORE_OPS = ['demand', 'mobilize', 'deploy', 'exercise', 'sanction', 'cyber', 'arms', 'mass', 'blockade', 'strike', 'strike_bases', 'join', 'invade', 'declare', 'nuke_threat', 'accept', 'hold'];
function coreDemand(S, k) {
  switch (k.type) { case 'forces_in': return { demand: 'withdraw', loc: k.loc }; case 'pact_with': return { demand: 'break_pact', with: k.loc }; case 'attack': return { demand: 'end_war', t: k.loc }; case 'blockade': return { demand: 'lift_blockade', t: k.loc }; case 'nuke_program': return { demand: 'stop_nuke' }; case 'embargo': return { demand: 'lift' }; }
  return null;
}
function coreStage(S, k, dec, R) {
  const P = S.player, o = k.o, V = k.v, x = S.actors[o], T = coreTheater(S, k);
  const prot = coreProt(k), TI = prot ? coreCounter(S, k) : T, TB = prot ? V : T;
  const done = []; const out = (m, big) => { done.push(m); };
  const lvl = clamp(dec.lvl | 0, 0, 4);
  let stood = false;
  for (const a of (dec.ops || []).slice(0, 6)) {
    if (S.shield && SHD(S, o) && (a.op === 'cyber' || a.op === 'nuke_threat')) continue; // 按中国标准处理的国家：不发动网络攻击，不进行核威胁
    try {
      switch (a.op) {
        case 'demand': {
          const d = coreDemand(S, k); if (!d) break;
          if (o === P) { // 玩家向 AI 侵犯方提出要求：限期满足，否则继续升级
            const wait = clamp(a.wait | 0 || 2, 1, 3); k.dl = S.turn + wait; addRel(S, o, V, -3);
            pushEv(S, { type: 'warn', actor: o, target: V, sev: 14, about: k.loc });
            out(M('co.demand_ai', { t: V, x: M('udt.' + d.demand, { l: d.loc, b: d.with, t: d.t }), n: wait })); break;
          }
          if (V !== P) break;
          const open = S.ultis.find(u => u.core === k.id && u.status === 'open');
          const wait = clamp(a.wait | 0 || 2, 1, 3);
          if (open) { open.deadline = S.turn + wait; break; }
          const u = Object.assign({ id: 'U' + S.seq++, from: o, conseq: 'war', resolve: 0.9, turn: S.turn, deadline: S.turn + wait, status: 'open', base: S.actors[P].nukeProg, core: k.id }, d);
          S.ultis.push(u); k.ulti = u.id; x.flags.ultiCool = S.turn + 8; S.ultiAt = S.turn;
          out(M('co.demand', { x: M('ud.' + u.demand, { l: u.loc, b: u.with, t: u.t }), n: wait })); break;
        }
        case 'mobilize': { const L = clamp(a.level | 0 || 1, 1, 3); if (L > x.mob) { x.mob = L; out(M('co.mobilize', { k: M('mob.' + L) })); } break; }
        case 'deploy': {
          if (!T || T === o) break;
          const dest = [T].concat(IDS.filter(L => L !== T && (landAdj(L, T) || dist(L, T) <= 900))).filter(L => canStation(S, o, L)).sort((p, q) => dist(p, T) - dist(q, T))[0];
          if (!dest || dest === o) { x.flags.alert = { turn: S.turn }; out(M('co.alert', { l: T })); break; }
          const mv = orderMove(S, o, o, dest, clamp(+a.share || 0.1, 0.03, 0.3)); if (mv > 0) out(M('co.deploy', { l: dest, s: mv })); break;
        }
        case 'exercise': {
          const tgt = T && T !== o && S.actors[T] ? T : V;
          const kk = rk(o, tgt); S.tension2[kk] = clamp((S.tension2[kk] || 0) + 15, 0, 100); if (tgt !== V) { const k2 = rk(o, V); S.tension2[k2] = clamp((S.tension2[k2] || 0) + 10, 0, 100); }
          addRel(S, o, V, -4); if (indep(S, tgt) && tgt !== V) addRel(S, o, tgt, -4);
          if (S.actors[tgt]) S.actors[tgt].fear[o] = S.turn + 3;
          out(M('co.exercise', { l: tgt })); pushEv(S, { type: 'exercise', actor: o, target: tgt, sev: 18 }); break;
        }
        case 'sanction': {
          const kind = ['econ', 'tech', 'energy', 'fin', 'tariff'].includes(a.kind) ? a.kind : 'econ';
          if (kind === 'energy' && DEF[o].energy < 1) break; if (kind === 'fin' && DEF[o].fin < 2) break;
          const L = clamp(a.level | 0 || 1, 1, 3); addSanction(S, o, V, kind, kind === 'econ' ? L : 1); addRel(S, o, V, -5 * L);
          out(M('co.sanction', { k: M(kind === 'econ' ? 'sl.' + L : 'sk.' + kind) })); break;
        }
        case 'cyber': { const y = S.actors[V]; const hit = between(S, 0.3, 0.8); y.gdp *= 1 - hit / 100; y.stab = clamp(y.stab - 1.5, 0, 100); addRel(S, o, V, -6); out(M('co.cyber', { n: +hit.toFixed(1) })); if (V === P) facAdd(S, { pub: -1 }); break; }
        case 'mass': {
          if (!TI || TI === o || (prot ? boss(S, TI) !== V : TI === V) || S.ops.some(op => op.owner === o && op.target === TI)) break;
          const r = createOp(S, o, TI, clamp(+a.share || 0.45, 0.25, 0.8), false); if (!r.op) break;
          r.op.core = k.id; r.op.legit = true; r.op.ready = Math.max(r.op.ready, S.turn + 4); r.op.hold = true; r.op.det.push(o === P ? V : P);
          out(M('co.mass', { l: r.op.from, t: TI })); break;
        }
        case 'blockade': {
          if (!TB || LANDLOCKED.has(TB) || TB === o || S.blockades.some(b => b.by === o && b.target === TB)) break;
          if (blockadeStrength(S, o, TB) < 1.1 * (blockadeDefense(S, TB, o) + 1)) { out(M('co.noblock', { t: TB })); break; }
          S.blockades.push({ by: o, target: TB, since: S.turn, core: k.id }); addRel(S, o, TB, -25); addRel(S, o, V, -10);
          if (prot && !atWar(S, o, V)) declareWar(S, o, V, true);
          if (o === P) afterPlayerHostile(S, boss(S, TB), 'blockade', legitCB(S, boss(S, TB)), R);
          out(M('co.blockade', { t: TB })); pushEv(S, { type: 'blockade', actor: o, target: TB, sev: 50, third: 12 }); break;
        }
        case 'arms': {
          const Y = prot ? (k.t || k.loc) : null; if (!Y || !indep(S, Y) || Y === o || atWar(S, o, Y)) break;
          const c = x.gdp * 0.15 / 100; armsTransfer(S, o, Y, c); x.treasury -= c; addRel(S, o, Y, 5); addInfl(S, o, Y, 3);
          out(M('co.arms', { t: Y })); break;
        }
        case 'join': {
          if (!atWar(S, o, V)) { declareWar(S, o, V); logEvent(S, 'war', M('m.war', { a: o, b: V }), 'warn', [o, V]); }
          x.mob = Math.max(x.mob, 2);
          const D = T && T !== o ? [T].concat(IDS.filter(L => L !== T && (landAdj(L, T) || dist(L, T) <= 900))).filter(L => canStation(S, o, L)).sort((p, q) => dist(p, T) - dist(q, T))[0] : null;
          const mv = D && D !== o ? orderMove(S, o, o, D, clamp(+a.share || 0.15, 0.05, 0.35)) : 0;
          out(M(mv > 0 ? 'co.join_dep' : 'co.join', { t: V, l: D || T, s: mv }));
          pushEv(S, { type: 'declare', actor: o, target: V, sev: 40, third: 10, big: true }); break;
        }
        case 'strike': {
          const L = coreHitLoc(S, k);
          if (!L) break;
          if (strikePower(S, o, L) < 1) { out(M('co.norange', { l: L })); break; }
          const r = strikeForcesAt(S, o, V, L, L === V ? 0.8 : 1, R); if (!r) break;
          if (!atWar(S, o, V)) { declareWar(S, o, V, lvl < 4); logEvent(S, 'war', M('m.war', { a: o, b: V }), 'warn', [o, V]); } else if (lvl >= 4 && S.war[rk(o, V)]) S.war[rk(o, V)].limited = false;
          addRel(S, o, V, -30); grantCB(S, o, 'attacked', 12);
          if (o === P) afterPlayerHostile(S, V, 'strike', legitCB(S, V), R);
          out(M(L === V ? 'co.strike_home' : 'co.strike', { l: L, t: V, p: { pers: r.lost[0] }, a: Math.round(r.lost[2]), s: Math.round(r.lost[3]) }));
          // 禁运型危机：同时突袭对方本土的舰队与机场（珍珠港式）
          if (k.type === 'embargo' && L !== V && x.hawk >= 0.7 && strikePower(S, o, V) > 1) { const r2 = strikeForcesAt(S, o, V, V, 0.8, R, [0.02, 0.9, 0.45]); if (r2) out(M('co.strike_home', { t: V, p: { pers: r2.lost[0] }, a: Math.round(r2.lost[2]), s: Math.round(r2.lost[3]) })); }
          pushEv(S, { type: 'strike', actor: o, target: V, sev: 70, third: 20, big: true }); break;
        }
        case 'strike_bases': {
          const bases = Object.keys(S.actors[V].forces).filter(L => L !== V && T && dist(L, T) <= 2600 && L !== T && vsum(shareV(S, V, L)) > 0.004 && strikePower(S, o, L) > 1).slice(0, 3);
          for (const L of bases) { const r = strikeForcesAt(S, o, V, L, 0.6, R); if (!r) continue; out(M('co.strike_base', { l: L, t: V })); if (L !== V && indep(S, L)) { addRel(S, o, L, -25); S.actors[L].fear[o] = S.turn + 3; pushEv(S, { type: 'strike', actor: o, target: L, sev: 55, third: 8 }); } }
          if (bases.length && !atWar(S, o, V)) declareWar(S, o, V, lvl < 4); else if (bases.length && lvl >= 4 && S.war[rk(o, V)]) S.war[rk(o, V)].limited = false; break;
        }
        case 'invade': {
          if (!TI || TI === o || (TI === V && isGreat(S, V)) || (prot && boss(S, TI) !== V)) break;
          const ex = S.ops.find(op => op.owner === o && op.target === TI && op.core === k.id);
          if (ex) { ex.hold = false; ex.ready = Math.min(ex.ready, S.turn + 1); ex.v = vadd(ex.v, vmin(vmul(freeV(S, o, ex.from), 0.3), [0.15, 0.15, 0.15])); out(M('co.invade', { t: TI })); break; }
          const r = createOp(S, o, TI, clamp(+a.share || 0.5, 0.25, 0.85), false); if (!r.op) { out(M('co.noroute', { t: TI })); break; }
          r.op.core = k.id; r.op.legit = true; r.op.ready = Math.min(r.op.ready, S.turn + 1); // 危机中早有准备：下回合即发动（在途部队随后跟进）
          out(M('co.invade', { t: TI })); break;
        }
        case 'declare': {
          if (!atWar(S, o, V)) { declareWar(S, o, V); logEvent(S, 'war', M('m.war', { a: o, b: V }), 'warn', [o, V]); pushEv(S, { type: 'declare', actor: o, target: V, sev: 60, third: 18, big: true }); if (o === P) afterPlayerHostile(S, V, 'declare', legitCB(S, V), R); }
          else if (S.war[rk(o, V)]) S.war[rk(o, V)].limited = false;
          x.mob = Math.max(x.mob, 2); out(M('co.declare', { t: V })); break;
        }
        case 'nuke_threat': if (x.nukes > 0) { addRel(S, o, V, -10); S.tension = clamp(S.tension + 8, 0, 100); out(M('co.nuke')); pushEv(S, { type: 'nukethreat', actor: o, target: V, sev: 35, third: 15 }); } break;
        case 'accept': stood = true; break;
      }
    } catch (e) { if (typeof console !== 'undefined') console.error('core op', a, e); }
  }
  const entry = { t: S.turn, lvl: stood ? k.lvl : Math.max(k.lvl, lvl), ops: done, st: dec.statement ? { raw: String(dec.statement).slice(0, 220) } : null, why: dec.reasoning ? [{ raw: String(dec.reasoning).slice(0, 320) }] : (dec.why || []), src: dec.src || 'rule' };
  if (!entry.st) entry.st = M('cs.L' + (stood ? 'x' : entry.lvl), { v: { voice: o }, t: V, x: coreInterest(k) });
  k.hist.push(entry); if (k.hist.length > 10) k.hist.shift();
  if (stood) {
    k.status = 'accepted'; k.end = S.turn; S.coreSeen[k.key] = true; x.cred = clamp((x.cred ?? 60) - 15, 0, 100); x.hawk = clamp(x.hawk + 0.05, 0, 0.98);
    if (o === P) { repAdd(S, { cred: -6 - 2 * k.lvl }); facAdd(S, { mil: -3, pub: -2 }); addRel(S, o, V, 4); }
    forSeats(S, sb => { for (const u of sb.ultis) if (u.core === k.id && u.status === 'open') u.status = 'withdrawn'; });
    S.ops = S.ops.filter(op => op.core !== k.id); remember(S, o, M('mem.core_forced', { x: coreInterest(k) }), -20);
    const T0 = coreTheater(S, k); S.blockades = S.blockades.filter(b => !(b.by === o && b.core === k.id));
    const w0 = S.war[rk(o, V)]; if (w0 && w0.limited && !S.fronts.some(f => (f.att === o && boss(S, f.target) === V) || (f.att === V && boss(S, f.target) === o))) makePeace(S, o, V, 'ceasefire', R); void T0;
  } else { k.lvl = entry.lvl; k.due = S.turn + clamp(dec.wait | 0 || 2, 1, 4); if (dec.done) { k.status = 'noted'; k.end = S.turn; } else if (k.lvl >= 4 && atWar(S, o, V) && !(S.war[rk(o, V)] || {}).limited) { k.status = 'war'; k.end = S.turn; } }
  k.fresh = false; k.last = S.turn;
  // AI 侵犯者在升级压力下可能让步（下回合扫描时危机化解）；玩家亲自施压时，警告阶段也可能奏效
  const lim = (S.war[rk(o, V)] || {}).limited;
  const yf = o === P ? [0, 0.55, 1, 1.15, 0.5][entry.lvl] : entry.lvl >= 2 ? 1 : 0;
  let yielded = false;
  if (!stood && !isHuman(S, V) && k.status === 'active' && yf > 0 && (!atWar(S, o, V) || (o === P && lim)) && chance(S, coreYieldP(S, k) * yf)) {
    coreComply(S, k); yielded = true; if (o === P && lim) makePeace(S, o, V, 'ceasefire', R);
    const ym = M('co.yield', { a: V, b: o });
    (o === P ? R.toYou : R.world).push({ actor: V, msg: ym, tone: o === P ? 'good' : 'info', about: [o], big: true }); logEvent(S, 'core', ym, 'info', [V, o]);
  }
  // 报告
  const tone = V === P ? 'bad' : 'warn';
  const head = M('co.head', { a: o, x: coreInterest(k), k: M('lv.' + (stood ? 'x' : CORE_LV[entry.lvl])) });
  const line = { actor: o, msg: M('co.line', { h: head, x: { list: done } }), tone: stood ? 'good' : tone, big: entry.lvl >= 2, core: k.id };
  if (o === P) R.actions.push(Object.assign({}, line, { tone: stood ? 'info' : entry.lvl >= 3 ? 'warn' : 'info' }));
  else if (V === P) R.toYou.push(line); else R.world.push(Object.assign({ about: [V] }, line));
  logEvent(S, 'core', line.msg, stood ? 'good' : 'bad', [o, V]);
  if (V === P && entry.lvl >= 1 && !stood) { remember(S, o, M('mem.core', { x: coreInterest(k) }), -15 - 5 * entry.lvl); S.threat[o] = clamp((S.threat[o] || 0) + 6 * entry.lvl, 0, 100); addRel(S, o, V, -6); }
  if (o === P && entry.lvl >= 1 && !stood && !yielded) { remember(S, V, M('mem.core_pressed', { x: coreInterest(k) }), -4 - 4 * entry.lvl); addRel(S, o, V, -3); }
  return entry;
}
function coreDue(S) { return (S.coreC || []).filter(k => k.status === 'active' && k.due <= S.turn && !isHuman(S, k.o) && indep(S, k.o) && indep(S, k.v) && !S.actors[k.o].overlord); }
function coreTurn(S, R) {
  for (const k of (S.coreC || [])) if (k.status === 'active' && !isHuman(S, k.o) && atWar(S, k.o, k.v) && !(S.war[rk(k.o, k.v)] || {}).limited) { k.status = 'war'; k.end = S.turn; } // 已全面开战：危机让位于战争
  for (const k of coreDue(S)) {
    let dec = S.coreLLM && S.coreLLM[k.id];
    dec = dec ? coreClean(S, k, dec) : null;
    if (!dec) dec = coreRule(S, k);
    if (S.shield && SHD(S, k.o)) dec = Object.assign({}, dec, { ops: shOps(S, k.o, dec.ops || []) }); // 按中国标准处理的国家：不发动网络攻击，不进行核威胁
    if (isHuman(S, k.v)) withSeat(S, k.v, () => coreStage(S, k, dec, RP(S, k.v, R))); else coreStage(S, k, dec, R);
  }
  S.coreLLM = {};
  // 玩家施加的持续压力（制裁、集结、封锁）也可能迫使 AI 侵犯方事后让步
  for (const k of (S.coreC || [])) {
    const P = k.o;
    if (!isHuman(S, P) || isHuman(S, k.v) || k.status !== 'active' || k.lvl < 1 || k.last === S.turn || !indep(S, k.v)) continue;
    const lim = (S.war[rk(P, k.v)] || {}).limited;
    if (atWar(S, P, k.v) && !lim) continue;
    if (!chance(S, coreYieldP(S, k) * 0.3 * (k.lvl >= 3 ? 1.3 : 1))) continue;
    coreComply(S, k); if (lim) makePeace(S, P, k.v, 'ceasefire', R);
    const ym = M('co.yield', { a: k.v, b: P }); RP(S, P, R).toYou.push({ actor: k.v, msg: ym, tone: 'good', about: [P], big: true }); logEvent(S, 'core', ym, 'info', [k.v, P]);
  }
  // 集结中的核心行动：到期即发动（由阶梯决定何时解除 hold）
  for (const op of S.ops) if (op.core && op.hold) { const k = coreOf(S, op.core); if (!k || k.status !== 'active') op.hold = false; else op.ready = Math.max(op.ready, S.turn + 1); }
  S.coreC = S.coreC.filter(k => k.status === 'active' || (k.end ?? S.turn) >= S.turn - 12);
}
/* 校验 Claude 给出的决策 */
function coreClean(S, k, d) {
  if (!d || typeof d !== 'object') return null;
  const ops = (Array.isArray(d.ops) ? d.ops : []).filter(a => a && CORE_OPS.includes(a.op)).slice(0, 6).map(a => ({ op: a.op, level: a.level, share: a.share, kind: a.kind, wait: a.wait }));
  if (!ops.length) return null;
  let lvl = clamp(+d.level | 0, 0, 4);
  if (lvl > k.lvl + 2) lvl = k.lvl + 2;
  const heavy = { blockade: 3, strike: 3, strike_bases: 4, invade: 4, join: 4, declare: 4 };
  const capL = coreCap(k); if (capL < 4) { lvl = Math.min(lvl, capL); for (let i = ops.length - 1; i >= 0; i--) if ((heavy[ops[i].op] || 0) > capL) ops.splice(i, 1); if (!ops.length) return null; }
  const top = Math.max(0, ...ops.map(a => heavy[a.op] || 0));
  if (top > lvl) lvl = top;
  if (k.lvl === 0) { const cap = k.w >= 3 ? 2 : 1; const keep = ops.filter(a => (heavy[a.op] || 0) <= cap); if (!keep.some(a => a.op === 'demand')) keep.unshift({ op: 'demand', wait: 2 }); return { lvl: Math.min(Math.max(lvl, 1), cap), ops: keep, wait: clamp(+d.wait | 0 || 2, 1, 3), statement: d.statement, reasoning: d.reasoning, src: 'llm' }; }
  return { lvl, ops, wait: clamp(+d.wait | 0 || 2, 1, 4), statement: d.statement, reasoning: d.reasoning, src: 'llm' };
}
/* 核心利益行动的发动门槛与核威慑折扣（利害不对称：为核心利益更愿冒险） */
function coreDeter(S, op) { const k = coreOf(S, op.core); const base = nukeDeter(S, op.owner, op.target); if (!k) return base; return 1 - (1 - base) * (k.w >= 3 ? 0.35 : 0.7); }
function coreNeed(S, op) { const k = coreOf(S, op.core); const x = S.actors[op.owner]; if (!k) return 1.25 - x.risk * 0.35; return (k.w >= 3 ? 0.85 : 1.0) - x.risk * 0.2; }
/* 玩家可见的危机概况 */
function coreView(S) {
  const P = S.player;
  return (S.coreC || []).filter(k => k.v === P || k.o === P).map(k => { const m = k.status === 'active' ? coreCalc(S, k) : null; return Object.assign({}, k, { calc: m ? { ratio: m.ratio, seaRatio: m.seaRatio, nukeRisk: m.nukeRisk, econ: m.econ } : null, interest: coreInterest(k) }); });
}
function coreOfActor(S, X) { return coreList().filter(c => c.o === X).map(c => Object.assign({}, c, { active: (S.coreC || []).find(k => k.cid === c.id && k.status === 'active') || null })); }

/* ===================== 玩家亲自掌控的升级阶梯 =====================
 * own ：玩家是被侵犯方——点选“警告/施压/有限打击/战争”，执行与 AI 相同的行动包；AI 侵犯方可能让步、硬顶或还击。
 * resp：玩家是侵犯方——可以让步，或以“威慑/反制/先发打击/全面战争”回应；AI 所有者据此重新评估（威慑使其犹豫，动武则激怒它）。
 */
const CP_AP = [1, 1, 1, 2, 2];
/* 规则 v2：阶梯的每一级就是一组标准行动，行动点按包含的行动算（与行动组合同一规则：各项之和 − 每两项优惠 1 点）；接受现状、让步不花点 */
const CORE_OP_AP = { demand: 1, mobilize: 1, sanction: 1, exercise: 1, cyber: 1, arms: 1, blockade: 2, r_blockade: 2, strike: 2, r_strike: 2, strike_bases: 2, r_bases: 2, invade: 2, r_invade: 2, nuke_threat: 1, r_warn: 1 };
function coreAP2(ops, S) {
  if (RULES3 && S) { // 规则 v3：按包含的行动的基础比例相加，和行动组合一样打折，再乘本国系数
    let base = 0, n = 0; for (const a of ops || []) { const v = CORE_OP_PCT3[a.op] || 0; base += v; if (v) n++; }
    return base ? pctOf(S, base * (1 - PKG_DISC3[Math.min(n, 4)])) : 0;
  }
  let base = 0, n = 0; for (const a of ops || []) { const v = CORE_OP_AP[a.op] || 0; base += v; if (v) n++; } return base ? Math.max(1, base - Math.floor(n / 2)) : 0;
}
const CORE_OP_PCT3 = { demand: 5, mobilize: 6, sanction: 7, exercise: 5, cyber: 6, arms: 5, blockade: 12, r_blockade: 12, strike: 12, r_strike: 12, strike_bases: 12, r_bases: 12, invade: 15, r_invade: 15, nuke_threat: 6, r_warn: 5 };
function coreSide(S, k) { return !k ? null : k.o === S.player ? 'own' : k.v === S.player ? 'resp' : null; }
function respTheater(S, k) { const T = coreTheater(S, k); return T && S.actors[T] ? T : (k.loc && S.actors[k.loc] ? k.loc : k.o); }
/* 回应时可打击的对方部队：战区及周边（对方本土仅在其邻近战区时） */
function respHitLoc(S, k) {
  const P = S.player, Y = k.o, T = respTheater(S, k), y = S.actors[Y];
  const c = Object.keys(y.forces).filter(L => vsum(shareV(S, Y, L)) > 0.002 && (L === T || dist(L, T) <= 1500) && strikePower(S, P, L) > 1);
  c.sort((a, b) => (a === Y) - (b === Y) || dist(a, T) - dist(b, T));
  return c[0] || null;
}
/* 全面战争时可以进攻的对方控制区（不直接进攻大国本土） */
function respInvade(S, k) {
  const P = S.player, Y = k.o, T = respTheater(S, k);
  const c = IDS.filter(L => L !== P && S.actors[L].ctrl !== P && boss(S, L) === Y && !(L === Y && isGreat(S, Y)) && stagingOptions(S, P, L).length && !S.ops.some(o => o.owner === P && o.target === L) && !S.fronts.some(f => f.att === P && f.target === L));
  c.sort((a, b) => dist(a, T) - dist(b, T));
  return c[0] || null;
}
const shOps = (S, X, ops) => (S.shield && SHD(S, X) ? ops.filter(o => o.op !== 'cyber' && o.op !== 'nuke_threat') : ops); // 按中国标准处理的国家：阶梯里没有网络攻击与核威胁
function corePlayerOps(S, k, lvl) {
  const side = coreSide(S, k), P = S.player, x = S.actors[P], ops = [];
  if (!side) return ops;
  if (side === 'own') {
    if (lvl === 0) return [{ op: 'accept' }];
    const m = coreCalc(S, k);
    if (lvl === 1) { ops.push({ op: 'demand', wait: 2 }); if (k.w >= 2) ops.push({ op: 'mobilize', level: 1 }); if (m.T && m.T !== P) ops.push({ op: 'deploy', share: 0.08 }); ops.push({ op: 'sanction', kind: k.w >= 3 && m.econ < 0.15 ? 'econ' : 'tech', level: k.w >= 3 ? 2 : 1 }); }
    if (lvl === 2) { ops.push({ op: 'demand', wait: 2 }, { op: 'exercise' }, { op: 'mobilize', level: 2 }, { op: 'sanction', kind: m.econ > 0.15 ? 'tech' : 'econ', level: m.econ > 0.15 ? 1 : 3 }, { op: 'cyber' }); if (m.T && m.T !== P) ops.push({ op: 'deploy', share: 0.12 }); if (m.prot) ops.push({ op: 'arms' }); if (m.canInvade) ops.push({ op: 'mass', share: 0.4 }); }
    if (lvl === 3) { if (m.canBlock) ops.push({ op: 'blockade' }); if (m.canHit) ops.push({ op: 'strike' }); if (m.prot) ops.push({ op: 'arms' }); if (!m.canBlock && !m.canHit) ops.push({ op: 'cyber' }, { op: 'sanction', kind: 'econ', level: 3 }); if (x.nukes > 0 && m.nukeRisk > 0) ops.push({ op: 'nuke_threat' }); }
    if (lvl === 4) { ops.push({ op: 'declare' }); if (m.canJoin) ops.push({ op: 'join', share: 0.15 }); if (m.canHit) ops.push({ op: 'strike' }); if (m.canInvade) ops.push({ op: 'invade', share: 0.5 }); ops.push({ op: 'strike_bases' }); }
    return shOps(S, P, ops).slice(0, 6);
  }
  const Y = k.o, T = respTheater(S, k);
  if (lvl === 0) return [{ op: 'comply' }];
  ops.push({ op: 'r_warn' });
  if (lvl === 1) { ops.push({ op: 'mobilize', level: 1 }); if (T !== Y) ops.push({ op: 'reinforce', share: 0.08 }); }
  if (lvl === 2) { ops.push({ op: 'exercise' }, { op: 'mobilize', level: 2 }, { op: 'sanction', kind: exposure(S, P, Y) > 0.15 ? 'tech' : 'econ', level: 2 }); if (T !== Y) ops.push({ op: 'reinforce', share: 0.12 }); if (T !== Y && T !== P && indep(S, T) && !atWar(S, P, T)) ops.push({ op: 'arms' }); }
  if (lvl === 3) { ops.push({ op: 'mobilize', level: 2 }); if (respHitLoc(S, k)) ops.push({ op: 'r_strike' }); if (!LANDLOCKED.has(Y) && blockadeStrength(S, P, Y) >= 1.3 * (blockadeDefense(S, Y, P) + 1)) ops.push({ op: 'r_blockade' }); if (ops.length === 2) ops.push({ op: 'cyber' }); }
  if (lvl === 4) { ops.push({ op: 'declare' }, { op: 'mobilize', level: 3 }); if (respHitLoc(S, k)) ops.push({ op: 'r_strike' }); ops.push({ op: 'r_bases' }); if (respInvade(S, k)) ops.push({ op: 'r_invade', share: 0.5 }); }
  return shOps(S, P, ops).slice(0, 6);
}
/* 预览（供确认面板显示）：具体行动、行动点、风险提示 */
function corePlan(S, id, lvl) {
  const k = coreOf(S, id), P = S.player, side = coreSide(S, k);
  if (!k || k.status !== 'active' || !side) return { ok: false, reason: M('c.core_gone') };
  lvl = clamp(lvl | 0, 0, 4);
  if (side === 'own' && lvl > 0 && lvl < k.lvl) return { ok: false, reason: M('c.core_low', { k: M('lv.s' + k.lvl) }) };
  const Y = side === 'own' ? k.v : k.o, T = side === 'own' ? (coreTheater(S, k) || k.loc) : respTheater(S, k);
  const ops = corePlayerOps(S, k, lvl);
  const pv = ops.map(a => coreOpPreview(S, k, a, side, Y, T));
  const risk = [];
  const yv = S.actors[Y];
  if (side === 'own' && lvl > 0) {
    const m = coreCalc(S, k);
    risk.push(M('cp.k.balance', { r: +m.ratio.toFixed(1) }));
    const yp = coreYieldP(S, Object.assign({}, k, { lvl })) * [0, 0.55, 1, 1.15, 0.5][lvl];
    if (lvl < 4) risk.push(M('cp.k.yield', { s: { pct: clamp(yp, 0, 0.95) } }));
  }
  if (lvl >= 3 && !atWar(S, P, Y)) risk.push(M(lvl >= 4 ? 'cp.k.war' : 'cp.k.limited', { t: Y }));
  if (lvl >= 3 && yv.nukes > 0) risk.push(M('cp.k.nuke', { t: Y, n: fmtK0(yv.nukes) }));
  if (lvl >= 3) { const al = IDS.filter(c => c !== P && c !== Y && indep(S, c) && isAlly(S, c, Y) && power(S, c) > power(S, Y) * 0.15).slice(0, 4); if (al.length) risk.push(M('cp.k.allies', { t: Y, x: { list: al.map(c => ({ id: c })) } })); }
  if (lvl >= 4 && !atWar(S, P, Y) && DEF[P].gov !== 'aut') risk.push(M('cp.k.auth', { s: { pct: warAuth(S, Y) } }));
  if (side === 'resp' && lvl >= 1 && lvl <= 2) risk.push(M('cp.k.deter', { t: Y }));
  if (side === 'resp' && lvl >= 3) risk.push(M('cp.k.provoke', { t: Y }));
  if (side === 'own' && lvl === 0) risk.push(M('cp.k.cred'));
  const cur = S.queue.find(q => q.type === 'core' && q.k === id);
  const ap = side === 'resp' && lvl === 0 ? 0 : RULES2 ? coreAP2(ops, S) : CP_AP[lvl];
  return { ok: true, id, lvl, side, Y, T, ops: pv, risk, ap, queued: cur ? cur.lvl : null, instant: side === 'resp' && lvl === 0, interest: coreInterest(k) };
}
const fmtK0 = n => Math.round(n);
function coreOpPreview(S, k, a, side, Y, T) {
  const P = S.player, d = coreDemand(S, k);
  switch (a.op) {
    case 'demand': return M('cp.demand', { t: Y, x: d ? M('udt.' + d.demand, { l: d.loc, b: d.with, t: d.t }) : '', n: a.wait || 2 });
    case 'mobilize': return M('cp.mobilize', { k: M('mob.' + (a.level || 1)) });
    case 'deploy': case 'reinforce': return M('cp.deploy', { l: T, s: { pct: a.share || 0.1 } });
    case 'sanction': return M('cp.sanction', { t: Y, k: M(a.kind === 'econ' ? 'sl.' + (a.level || 1) : 'sk.' + a.kind) });
    case 'exercise': return M('cp.exercise', { l: T && T !== P ? T : Y });
    case 'cyber': return M('cp.cyber', { t: Y });
    case 'arms': return M('cp.arms', { t: side === 'own' ? (k.t || k.loc) : T });
    case 'mass': return M('cp.mass', { t: coreProt(k) ? (coreCounter(S, k) || Y) : T });
    case 'blockade': return M('cp.blockade', { t: coreProt(k) ? Y : T });
    case 'r_blockade': return M('cp.blockade', { t: Y });
    case 'strike': { const L = coreHitLoc(S, k); return L ? M('cp.strike', { t: Y, l: L }) : M('cp.strike_none'); }
    case 'r_strike': { const L = respHitLoc(S, k); return L === Y ? M('cp.strike_home', { t: Y }) : L ? M('cp.strike', { t: Y, l: L }) : M('cp.strike_none'); }
    case 'strike_bases': case 'r_bases': return M('cp.bases', { t: Y });
    case 'join': return M('cp.join', { t: Y, l: T });
    case 'invade': { const L = coreProt(k) ? coreCounter(S, k) : T; return M('cp.invade', { l: L || T }); }
    case 'r_invade': { const L = respInvade(S, k); return M('cp.invade', { l: L || Y }); }
    case 'declare': return M('cp.declare', { t: Y });
    case 'nuke_threat': return M('cp.nuke');
    case 'accept': return M('cp.accept');
    case 'comply': return M('cp.comply', { x: d ? M('ud.' + d.demand, { l: d.loc, b: d.with, t: d.t }) : coreInterest(k) });
    case 'r_warn': return M('cp.r_warn', { t: Y, l: T });
  }
  return { raw: a.op };
}
function queueCore(S, id, lvl) {
  const st = corePlan(S, id, lvl); if (!st.ok) return st;
  if (st.instant) return { ok: false, reason: M('c.unknown') };
  const cur = S.queue.find(q => q.type === 'core' && q.k === id);
  if (st.ap > apLeft(S) + (cur ? cur.ap : 0)) return { ok: false, reason: M('c.ap', { n: st.ap }) };
  S.queue = S.queue.filter(q => q !== cur);
  S.queue.push({ type: 'core', k: id, lvl: st.lvl, side: st.side, target: st.Y, ap: st.ap, cost: 0 });
  return { ok: true };
}
/* 玩家（侵犯方）立即让步 */
function coreBackDown(S, id) {
  const k = coreOf(S, id), P = S.player; if (!k || k.status !== 'active' || k.v !== P) return null;
  const R = scratchReport(S);
  const u = S.ultis.find(z => z.core === k.id && z.status === 'open'); if (u) complyUltimatum(S, u, R);
  coreComply(S, k); k.yielded = S.turn;
  remember(S, k.o, M('mem.complied'), 4); addRel(S, k.o, P, 5); facAdd(S, { pub: -2, mil: -2 }); repAdd(S, { cred: -3 });
  S.queue = S.queue.filter(q => !(q.type === 'core' && q.k === id));
  carryOver(S, R);
  const msg = M('cr.backdown', { t: k.o, x: coreInterest(k) }); logEvent(S, 'core', msg, 'info', [P, k.o]);
  return msg;
}
/* 回合结算中执行玩家的阶梯命令 */
function corePlayerExec(S, q, R) {
  const k = coreOf(S, q.k), P = S.player;
  if (!k || k.status !== 'active' || !coreSide(S, k)) { R.actions.push({ msg: M('r.core_gone'), tone: 'info' }); return; }
  const side = coreSide(S, k), lvl = clamp(q.lvl | 0, 0, 4), Y = side === 'own' ? k.v : k.o;
  if (lvl >= 4 && !atWar(S, P, Y) && DEF[P].gov !== 'aut' && !chance(S, warAuth(S, Y))) { facAdd(S, { pub: -2 }); S.pol.authCool = 2; R.actions.push({ msg: M('r.invade.denied', { t: Y }), tone: 'bad' }); return; }
  if (side === 'own') { coreStage(S, k, { lvl: lvl || k.lvl, ops: corePlayerOps(S, k, lvl), wait: 2, src: 'player', why: [] }, R); return; }
  respStage(S, k, lvl, R);
}
function respStage(S, k, lvl, R) {
  const P = S.player, Y = k.o, T = respTheater(S, k), x = S.actors[P], done = [];
  for (const a of corePlayerOps(S, k, lvl)) {
    try {
      switch (a.op) {
        case 'r_warn': {
          if (T !== Y && T !== P && S.actors[T] && !S.warnings.some(w => w.by === P && w.to === Y && w.about === T)) S.warnings.push({ by: P, to: Y, about: T, conseq: 'war', until: S.turn + 8, since: S.turn });
          addRel(S, P, Y, -4); pushEv(S, { type: 'warn', actor: P, target: Y, sev: 12, about: T });
          done.push(M('cr.r_warn', { t: Y, l: T })); break;
        }
        case 'mobilize': { const L = clamp(a.level | 0 || 1, 1, 3); if (L > x.mob) { x.mob = L; done.push(M('co.mobilize', { k: M('mob.' + L) })); if (L >= 2) { facAdd(S, { mil: 3, pub: -2 }); pushEv(S, { type: 'mobilize', actor: P, target: null, sev: 15, third: 8 }); } } break; }
        case 'reinforce': {
          const dest = [T].concat(IDS.filter(L => L !== T && (landAdj(L, T) || dist(L, T) <= 900))).filter(L => L !== P && canStation(S, P, L)).sort((p, q) => dist(p, T) - dist(q, T))[0];
          if (!dest) { done.push(M('cr.noreinf', { l: T })); break; }
          const mv = orderMove(S, P, P, dest, clamp(+a.share || 0.1, 0.03, 0.3)); if (mv > 0) done.push(M('co.deploy', { l: dest, s: mv })); break;
        }
        case 'exercise': { const kk = rk(P, Y); S.tension2[kk] = clamp((S.tension2[kk] || 0) + 12, 0, 100); addRel(S, P, Y, -4); S.actors[Y].fear[P] = S.turn + 2; pushEv(S, { type: 'exercise', actor: P, target: Y, sev: 15 }); done.push(M('co.exercise', { l: T !== P ? T : Y })); break; }
        case 'sanction': { const L = clamp(a.level | 0 || 1, 1, 3); addSanction(S, P, Y, a.kind, a.kind === 'econ' ? L : 1); afterPlayerAction(S, 'sanction', Y, { level: L }, R, true); done.push(M('co.sanction', { k: M(a.kind === 'econ' ? 'sl.' + L : 'sk.' + a.kind) })); break; }
        case 'arms': { const c = x.gdp * 0.15 / 100; armsTransfer(S, P, T, c); x.treasury -= c; addRel(S, P, T, 5); addInfl(S, P, T, 3); pushEv(S, { type: 'armsaid', actor: P, target: T, sev: -10, arms: true }); done.push(M('co.arms', { t: T })); break; }
        case 'cyber': { const y = S.actors[Y]; const hit = between(S, 0.2, 0.6); y.gdp *= 1 - hit / 100; addRel(S, P, Y, -6); done.push(M('co.cyber', { n: +hit.toFixed(1) })); break; }
        case 'r_strike': {
          const L = respHitLoc(S, k); if (!L) break;
          const r = strikeForcesAt(S, P, Y, L, L === Y ? 0.7 : 1, R, L === Y ? [0.03, 0.8, 0.5] : null); if (!r) break;
          if (!atWar(S, P, Y)) { declareWar(S, P, Y, lvl < 4); logEvent(S, 'war', M('m.war', { a: P, b: Y }), 'warn', [P, Y]); } else if (lvl >= 4 && S.war[rk(P, Y)]) S.war[rk(P, Y)].limited = false;
          addRel(S, P, Y, -30); afterPlayerHostile(S, Y, 'strike', legitCB(S, Y), R);
          done.push(M(L === Y ? 'co.strike_home' : 'co.strike', { l: L, t: Y, p: { pers: r.lost[0] }, a: Math.round(r.lost[2]), s: Math.round(r.lost[3]) }));
          pushEv(S, { type: 'strike', actor: P, target: Y, sev: 70, third: 20, big: true }); break;
        }
        case 'r_blockade': {
          if (S.blockades.some(b => b.by === P && b.target === Y)) break;
          S.blockades.push({ by: P, target: Y, since: S.turn, core: k.id }); addRel(S, P, Y, -25); if (!atWar(S, P, Y)) declareWar(S, P, Y, lvl < 4);
          afterPlayerHostile(S, Y, 'blockade', legitCB(S, Y), R); done.push(M('co.blockade', { t: Y })); pushEv(S, { type: 'blockade', actor: P, target: Y, sev: 50, third: 12 }); break;
        }
        case 'declare': {
          if (!atWar(S, P, Y)) { declareWar(S, P, Y); logEvent(S, 'war', M('m.war', { a: P, b: Y }), 'warn', [P, Y]); pushEv(S, { type: 'declare', actor: P, target: Y, sev: 60, third: 18, big: true }); afterPlayerHostile(S, Y, 'declare', legitCB(S, Y), R); }
          else if (S.war[rk(P, Y)]) S.war[rk(P, Y)].limited = false;
          done.push(M('co.declare', { t: Y })); break;
        }
        case 'r_bases': {
          const bases = Object.keys(S.actors[Y].forces).filter(L => L !== Y && dist(L, T) <= 2600 && vsum(shareV(S, Y, L)) > 0.004 && strikePower(S, P, L) > 1).slice(0, 3);
          for (const L of bases) { const r = strikeForcesAt(S, P, Y, L, 0.6, R); if (r) done.push(M('co.strike_base', { l: L, t: Y })); }
          break;
        }
        case 'r_invade': {
          const L = respInvade(S, k); if (!L) break;
          const r = createOp(S, P, L, clamp(+a.share || 0.5, 0.25, 0.8), false); if (!r.op) { done.push(M('co.noroute', { t: L })); break; }
          r.op.core = k.id; r.op.legit = true; r.op.ready = Math.min(r.op.ready, S.turn + 1); done.push(M('co.invade', { t: L })); break;
        }
      }
    } catch (e) { if (typeof console !== 'undefined') console.error('core resp', a, e); }
  }
  k.plv = Math.max(k.plv || 0, lvl); k.plast = S.turn;
  k.phist = (k.phist || []).concat([{ t: S.turn, lvl, ops: done }]).slice(-6);
  if (lvl >= 3) { k.provoked = true; k.due = Math.min(k.due, S.turn + 1); } else k.deter = (k.deter || 0) + 1;
  remember(S, Y, M('mem.core_defy', { x: coreInterest(k) }), -6 - 6 * lvl);
  S.threat[Y] = clamp((S.threat[Y] || 0) + 5 * lvl, 0, 100);
  if (lvl >= 4 && atWar(S, P, Y) && !(S.war[rk(P, Y)] || {}).limited) { k.status = 'war'; k.end = S.turn; }
  const msg = M('cr.head', { k: M('lv.r' + lvl), t: Y, x: { list: done } });
  R.actions.push({ msg, tone: lvl >= 3 ? 'warn' : 'info', big: lvl >= 3 }); logEvent(S, 'core', msg, lvl >= 3 ? 'bad' : 'info', [P, Y]);
}
