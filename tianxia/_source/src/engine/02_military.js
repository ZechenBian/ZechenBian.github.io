// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 军事：兵种部署、调动、行动、战役、占领 =====================
 * 兵力按兵种记录：forces[驻地] = [陆, 海, 空]，每一项是该兵种总兵力在此处的比例（各兵种分别合计为 1）。
 * 调动、战线、集结中的行动也都用 [陆, 海, 空] 向量表示投入的兵力。
 */
const MOB = [1, 1.12, 1.3, 1.5];
const MANP = [1, 1.3, 1.8, 2.5];
const BR = ['land', 'navy', 'air'];
const V0 = () => [0, 0, 0];
const isV = v => Array.isArray(v) && v.length === 3;
const vsum = v => v[0] + v[1] + v[2];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub0 = (a, b) => [Math.max(0, a[0] - b[0]), Math.max(0, a[1] - b[1]), Math.max(0, a[2] - b[2])];
const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vmin = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
const vmax = v => Math.max(v[0], v[1], v[2]);
function vecOf(kind, a) { switch (kind) { case 'land': return [a, 0, a]; case 'naval': return [0, a, a * 0.5]; case 'air': return [0, 0, a]; default: return [a, a, a]; } }
const techF = x => { const k = sc().techK ?? 0.4; return 1 - k + k * x.tech / 100; }; // 历史剧本可放大质量差距
const stabF = x => 0.7 + 0.3 * x.stab / 100;
function landEff(S, id) { const x = S.actors[id]; if (!indep(S, id)) return 0; return x.land * techF(x) * stabF(x) * MOB[x.mob] * fuelF(x) * manF(S, id); }
function airEff(S, id) { const x = S.actors[id]; if (!indep(S, id)) return 0; return x.air * techF(x) * stabF(x) * MOB[x.mob] * fuelF(x); }
function navyEff(S, id) { const x = S.actors[id]; if (!indep(S, id)) return 0; return x.navy * techF(x) * stabF(x) * fuelF(x); }
function homeGuard(S, id) { const x = S.actors[id]; if (!indep(S, id)) return 0; return (x.pers ?? DEF[id].pers) * 0.04 * MANP[x.mob] * stabF(x) * (sc().noIdlePeace ? techF(x) : 1); } // 历史剧本：装备低劣的民兵战斗力打折扣
function power(S, id) { if (!indep(S, id)) return 0; return landEff(S, id) + airEff(S, id) + navyEff(S, id) + homeGuard(S, id); }
function blocPower(S, id) { return realm(S, id).reduce((s, v) => s + (v === id ? power(S, v) : power(S, v) * 0.5), 0); }
function reach(S, id) { return DEF[id].proj + navyEff(S, id) * 4 + airEff(S, id); }
const ground = (S, id) => landEff(S, id) + 0.6 * airEff(S, id);

/* ---------- 条约 ---------- */
function addTreaty(S, type, a, b) { if (a === b || hasTreaty(S, a, b, type) || NEU(S, a) || NEU(S, b)) return; S.treaties.push({ type, a, b, since: S.turn }); if (type === 'trade') resetExposure(S); }
function removeTreaty(S, type, a, b) { const n = S.treaties.length; S.treaties = S.treaties.filter(t => !(t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)))); if (type === 'trade' && n !== S.treaties.length) resetExposure(S); }

/* ---------- 驻地（按兵种） ---------- */
function wts(S, X) { const x = S.actors[X]; const a = Math.max(0, x.land), b = Math.max(0, x.navy), c = Math.max(0, x.air), t = a + b + c; return t > 0 ? [a / t, b / t, c / t] : [1 / 3, 1 / 3, 1 / 3]; }
const dotw = (S, X, v) => { const w = wts(S, X); return v[0] * w[0] + v[1] * w[1] + v[2] * w[2]; };
const shareV = (S, X, L) => S.actors[X].forces[L] || V0();
const share = (S, X, L) => { const v = S.actors[X].forces[L]; return v ? dotw(S, X, v) : 0; };
function committedV(S, X, L) {
  let c = V0();
  for (const f of S.fronts) { if (f.from !== L) continue; if (f.att === X) c = vadd(c, f.v); if (f.co) for (const k of f.co) if (k.id === X) c = vadd(c, k.v); }
  for (const o of S.ops) if (o.owner === X && o.from === L) c = vadd(c, o.v);
  return c;
}
const freeV = (S, X, L) => vsub0(shareV(S, X, L), committedV(S, X, L));
const committedAt = (S, X, L) => dotw(S, X, committedV(S, X, L));
const freeAt = (S, X, L) => dotw(S, X, freeV(S, X, L));
function stations(S, X) { const f = S.actors[X].forces; return Object.keys(f).filter(L => vsum(f[L]) > 0.0015); }
const inTransitV = (S, X) => S.actors[X].moves.reduce((s, m) => vadd(s, m.v), V0());
const inTransit = (S, X) => dotw(S, X, inTransitV(S, X));
const groundV = (S, X, v) => landEff(S, X) * v[0] + 0.6 * airEff(S, X) * v[2];
const seaV = (S, X, v) => navyEff(S, X) * v[1] + 0.5 * airEff(S, X) * v[2];
function resetForces(S, X) { const x = S.actors[X]; x.forces = { [X]: [1, 1, 1] }; x.moves = []; }
function rebuildArmy(S, X, frac) { const d = DEF[X], x = S.actors[X]; const st = d.milex * d.ppp * 4 * frac; x.land = st * x.mix[0]; x.navy = st * x.mix[1]; x.air = st * x.mix[2]; x.pers = d.pers * Math.max(0.25, frac); resetForces(S, X); }
function canStation(S, X, L) {
  const x = S.actors[X], y = S.actors[L];
  if (!x || !y) return false;
  if (L === X) return x.ctrl === X;
  if (y.ctrl === X) return true;
  if (noBase(S, X, L)) return false; // 网页版 v3：中国领土上不允许外国驻军，盟友也不行（交战中的占领见上一行）
  if (y.ctrl !== L) return false;
  if (atWar(S, X, boss(S, L))) return false;
  if (y.overlord === X) return true;
  return hasTreaty(S, X, L, 'access') || hasTreaty(S, X, L, 'alliance') || sameBloc(S, X, L);
}
function transitTurns(from, to) { if (from === to) return 0; const d = dist(from, to); if (landAdj(from, to) || d <= 1500) return 1; if (d <= 6000) return 2; return 3; }
/* 调动：amt 为标量（各兵种同比例）或 [陆,海,空] 向量；返回按战力加权的调动比例 */
function orderMove(S, X, from, to, amt) {
  if (NEU(S, X) || NEU(S, to)) return 0;
  const x = S.actors[X];
  let v = isV(amt) ? amt.slice() : (LANDLOCKED.has(to) ? [amt, 0, amt] : [amt, amt, amt]);
  v = vmin(v, freeV(S, X, from));
  if (!(vmax(v) >= 0.004) || from === to || !canStation(S, X, to)) return 0;
  x.forces[from] = vsub0(x.forces[from], v); if (vsum(x.forces[from]) < 1e-4 && from !== X) delete x.forces[from];
  const eta = S.turn + transitTurns(from, to);
  const ex = x.moves.find(m => m.to === to && m.eta === eta && m.from === from);
  if (ex) ex.v = vadd(ex.v, v); else x.moves.push({ from, to, v, eta });
  return Math.max(1e-6, dotw(S, X, v));
}
function renorm(S, X) {
  const x = S.actors[X];
  for (let b = 0; b < 3; b++) {
    let tot = 0; for (const L in x.forces) tot += x.forces[L][b]; for (const m of x.moves) tot += m.v[b];
    if (!(tot > 1e-9)) { if (indep(S, X)) { x.forces[X] = x.forces[X] || V0(); x.forces[X][b] = 1; } continue; }
    if (Math.abs(tot - 1) < 1e-6) continue;
    for (const L in x.forces) x.forces[L][b] /= tot; for (const m of x.moves) m.v[b] /= tot;
    for (const f of S.fronts) { if (f.att === X) f.v[b] /= tot; if (f.co) for (const k of f.co) if (k.id === X) k.v[b] /= tot; }
    for (const o of S.ops) if (o.owner === X) o.v[b] /= tot;
  }
}
/* 地面部队占全部兵员的比例：陆军为主的国家约八到九成，海空军比重大的国家（英、美、日）约六到七成。地面战斗的人员损失只按这一部分计算 */
const landPers = x => clamp(0.45 + 0.55 * (x.mix ? x.mix[0] : 0.5), 0.45, 0.9);
/* 在驻地 L 的定点损失：fracV 为各兵种损失比例；grp（战线/特遣队/行动）给出时只从其投入的兵力中扣除。返回损失掉的总兵力比例 */
function attrit(S, X, L, fracV, grp) {
  const x = S.actors[X]; const s = x.forces[L]; const lostV = V0(); if (!s) return lostV;
  for (let b = 0; b < 3; b++) {
    const base = grp ? Math.min(grp.v[b], s[b]) : s[b];
    const lost = Math.min(s[b], base * clamp(fracV[b] || 0, 0, 1), 0.995); if (!(lost > 1e-7)) continue;
    lostV[b] = lost;
    x[BR[b]] *= 1 - lost;
    if (b === 0) { const dp = (x.pers || 0) * lost * landPers(x); x.pers = Math.max(0, (x.pers || 0) - dp); x.cas = (x.cas || 0) + dp; }
    s[b] -= lost; if (grp) grp.v[b] = Math.max(0, grp.v[b] - lost);
    const k = 1 / (1 - lost);
    for (const K in x.forces) x.forces[K][b] *= k; for (const m of x.moves) m.v[b] *= k;
    for (const g of S.fronts) { if (g.att === X) g.v[b] *= k; if (g.co) for (const c of g.co) if (c.id === X) c.v[b] *= k; }
    for (const o of S.ops) if (o.owner === X) o.v[b] *= k;
  }
  if (vsum(s) < 1e-4 && L !== X) delete x.forces[L];
  return lostV;
}
function attritNear(S, X, T, km, fracV) { for (const L of Object.keys(S.actors[X].forces)) { if (L === T) attrit(S, X, L, fracV); else if (dist(L, T) <= km) attrit(S, X, L, vmul(fracV, 0.5)); } }
function destroyAt(S, X, L, frac) {
  if (!S.actors[X].forces[L]) return V0();
  const lost = attrit(S, X, L, [frac, frac, frac]);
  if (frac >= 0.99) S.fronts = S.fronts.filter(f => !(f.att === X && f.from === L));
  for (const f of S.fronts) if (f.att === X && f.from === L) f.v = vmin(f.v, shareV(S, X, L));
  return lost;
}
function processMoves(S, R) {
  for (const X of IDS) {
    const x = S.actors[X]; if (!x.moves.length) continue;
    const keep = [];
    for (const m of x.moves) {
      if (m.eta > S.turn) { keep.push(m); continue; }
      if (canStation(S, X, m.to)) { x.forces[m.to] = vadd(x.forces[m.to] || V0(), m.v); if (isHuman(S, X) && dotw(S, X, m.v) >= 0.015) RP(S, X, R).mil.push({ msg: M('m.arrive', { l: m.to, s: dotw(S, X, m.v) }), tone: 'info' }); }
      else if (indep(S, X)) { if (m.to !== X) keep.push({ from: m.to, to: X, v: m.v, eta: S.turn + 1 }); else x.forces[X] = vadd(x.forces[X] || V0(), m.v); }
    }
    x.moves = keep;
  }
}
function validateStations(S, R) {
  for (const X of IDS) {
    if (!indep(S, X)) continue;
    const x = S.actors[X];
    for (const L of Object.keys(x.forces)) {
      if (canStation(S, X, L)) continue;
      const y = S.actors[L];
      const hostile = atWar(S, X, boss(S, L)) || (y.ctrl !== L && y.ctrl !== X && atWar(S, X, y.ctrl));
      S.fronts = S.fronts.filter(f => !(f.att === X && f.from === L));
      for (const f of S.fronts) if (f.co) f.co = f.co.filter(k => !(k.id === X && f.from === L));
      S.ops = S.ops.filter(o => !(o.owner === X && o.from === L));
      if (hostile) { destroyAt(S, X, L, 0.6); if (isHuman(S, X)) RP(S, X, R).mil.push({ msg: M('m.trapped', { a: X, l: L }), tone: 'bad' }); else if (isHuman(S, L)) RP(S, L, R).mil.push({ msg: M('m.trapped', { a: X, l: L }), tone: 'good' }); }
      const s = x.forces[L];
      if (s && vsum(s) > 0) { delete x.forces[L]; x.moves.push({ from: L, to: X, v: s.slice(), eta: S.turn + 1 }); if (isHuman(S, X) && !hostile) RP(S, X, R).mil.push({ msg: M('m.evac', { l: L }), tone: 'warn' }); }
    }
  }
}
function forcesNear(S, X, T, km, branch) { // X 在 T 附近（未投入战线）的兵力
  let v = V0(); const x = S.actors[X];
  for (const L in x.forces) { if (L === T || dist(L, T) <= km) v = vadd(v, freeV(S, X, L)); }
  if (branch === 'navy') return navyEff(S, X) * v[1];
  if (branch === 'air') return airEff(S, X) * v[2];
  if (branch === 'vec') return v;
  return dotw(S, X, v);
}

/* ---------- 战争状态 ---------- */
function declareWar(S, a, b, limited) {
  if (a === b || atWar(S, a, b) || NEU(S, a) || NEU(S, b)) return false;
  S.war[rk(a, b)] = { since: S.turn, a, b, limited: !!limited };
  setRel(S, a, b, Math.min(rel(S, a, b), -60));
  for (const h of treatiesOf(S, a, b)) removeTreaty(S, h.type, a, b);
  for (const [H, o] of [[a, b], [b, a]]) if (isHuman(S, H)) { const sb = seatOf(S, H); sb.commits = sb.commits.filter(c => !(c.with === o && c.type === 'defend')); }
  S.tension = clamp(S.tension + 6, 0, 100);
  return true;
}
function makePeace(S, a, b, terms, R) {
  if (!atWar(S, a, b)) return;
  delete S.war[rk(a, b)];
  const involve = f => (f.att === a && boss(S, f.target) === b) || (f.att === b && boss(S, f.target) === a);
  S.fronts = S.fronts.filter(f => !involve(f));
  for (const f of S.fronts) if (f.co) f.co = f.co.filter(k => !((k.id === a && f.def === b) || (k.id === b && f.def === a)));
  S.ops = S.ops.filter(o => !((o.owner === a && boss(S, o.target) === b) || (o.owner === b && boss(S, o.target) === a)));
  S.blockades = S.blockades.filter(k => !((k.by === a && k.target === b) || (k.by === b && k.target === a)));
  setRel(S, a, b, Math.max(rel(S, a, b), -45));
  if (S.th) thOnPeace(S, a, b);
  const msg = M(terms === 'ceasefire' ? 'm.ceasefire' : 'm.peace', { a, b });
  logEvent(S, 'peace', msg, 'info', [a, b]);
  for (const [H, o] of [[a, b], [b, a]]) if (isHuman(S, H)) { if (R) RP(S, H, R).mil.push({ msg, tone: 'good' }); withSeat(S, H, () => addCommit(S, 'no_attack', o, 8, 'peace')); }
}

/* ---------- 进攻出发阵地 ---------- */
function stagingOptions(S, X, T) {
  const out = [];
  for (const L of IDS) {
    if (L === T || !canStation(S, X, L)) continue;
    let kind = null;
    if (landAdj(L, T)) kind = 'land'; else if (!LANDLOCKED.has(T) && dist(L, T) <= 450 && labelKm(L, T) <= 5200 && !((sc().noAmphTo || {})[T] || []).includes(X)) kind = 'amph'; // 剧本可排除历史上制海权不允许的登陆（如轴心国登陆巴勒斯坦）
    if (!kind) continue;
    const fv = freeV(S, X, L); const here = kind === 'amph' ? Math.min(fv[0], fv[1] + 0.03) : fv[0];
    const src = here > 0.02 ? L : X;
    const eta = here > 0.02 ? 0 : transitTurns(src, L);
    out.push({ L, kind, free: here, eta, score: (kind === 'land' ? 2 : 0) + (here > 0.05 ? 3 : here > 0.01 ? 1 : 0) - eta * 0.8 + (L === X ? 1 : 0) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
function nukeDeter(S, X, T) {
  const D = boss(S, T);
  if (T === D && S.actors[T].ctrl === T && S.actors[T].nukes >= 5 && S.actors[X].nukes < S.actors[T].nukes * 20) return 0.35;
  if (IDS.some(c => c !== X && S.actors[c].nukes >= 200 && indep(S, c) && (isAlly(S, c, D) || isAlly(S, c, T)) && !atWar(S, c, X))) return 0.55;
  return 1;
}
/* AI 的主动作战半径：离本土过远的目标后勤难以支撑，AI 不主动选择（玩家不受此限） */
function aiReach(S, X, T, m = 1) { const d = dist(X, T), p = (DEF[X].proj || 1500) * m; return d <= p ? 1 : d <= p * 1.6 ? 0.55 : 0; }
/* AI 选择出发阵地：只从本土、控制区、附庸或已有驻军处发动（不临时把大军运到盟国本土开辟新战线） */
function aiStaging(S, X, T) { return stagingOptions(S, X, T).find(o => o.L === X || boss(S, o.L) === X || o.free > 0.03) || null; }
function minTurns(T) { const d = DEF[T]; if (d.minT) return d.minT; const size = Math.sqrt(d.pop / 40) * clamp(Math.sqrt((GEO.areaPx[T] || 3000) / 6000), 0.75, 2); return clamp(Math.round(1 + 2.2 * size * d.terr), 2, 16); }
const opVec = (kind, amount) => (isV(amount) ? amount.slice() : vecOf(kind === 'amph' ? 'all' : 'land', amount));

/* 新建军事行动（集结→发动） */
function createOp(S, X, T, amount, haste, fromPref) {
  if (NEU(S, X) || NEU(S, T)) return { err: 'noroute' };
  if (!isHuman(S, X) && sc().noOps && sc().noOps.includes(X)) return { err: 'noroute' }; // 剧本：某些势力的战争只在精细战区里进行（联机版中共）
  const opts = stagingOptions(S, X, T); if (!opts.length) return { err: 'noroute' };
  const best = (fromPref && opts.find(o => o.L === fromPref)) || opts[0]; const L = best.L;
  const want = opVec(best.kind, amount);
  let need = vsub0(want, freeV(S, X, L)); let eta = S.turn;
  if (vmax(need) > 0.004 && !haste) {
    const srcs = stations(S, X).filter(s => s !== L).sort((a, b) => (a === X ? -1 : b === X ? 1 : 0) || freeAt(S, X, b) - freeAt(S, X, a));
    for (const s of srcs) {
      if (vmax(need) <= 0.004) break;
      const reserve = s === X ? (sc().noIdlePeace && !S.fronts.some(f => boss(S, f.target) === X) && !enemies(S, X).some(e => landAdj(e, X)) ? 0.12 : 0.25) : 0; // 总体战中本土无直接威胁时只留少量预备队
      const take = vmin(need, vsub0(freeV(S, X, s), [reserve, reserve, reserve]));
      if (vmax(take) < 0.003) continue;
      const mv = orderMove(S, X, s, L, take);
      if (mv > 0) { need = vsub0(need, take); eta = Math.max(eta, S.turn + transitTurns(s, L)); }
    }
  }
  const got = haste ? vmin(want, freeV(S, X, L)) : vsub0(want, need);
  if (vmax(got) < 0.03 || groundV(S, X, got) < 1) return { err: 'noforce' };
  const prep = haste ? 0 : (best.kind === 'amph' ? 2 : 1);
  const op = { id: 'O' + S.seq++, owner: X, target: T, from: L, v: got, kind: best.kind, ready: eta + prep, haste: !!haste, created: S.turn, det: [], delays: 0, def0: boss(S, T) };
  S.ops.push(op);
  return { op };
}
function estimateOp(S, X, T, amount, kind) {
  const v = opVec(kind, amount);
  const A = groundV(S, X, v);
  const d = defenseAt(S, T, X).force + likelyHelp(S, T, X);
  let r = A / Math.max(1, d * DEF[T].terr);
  if (kind === 'amph') {
    const sea = seaV(S, X, v); const sd = seaDefenseAt(S, T, X) + likelyHelp(S, T, X, 'sea');
    r = Math.min(r, (navyEff(S, X) * v[1] * 0.6 + 5) / Math.max(1, d * 0.5 * DEF[T].terr)) * clamp(sea / Math.max(1, sd) / 1.5, 0.05, 1);
  }
  return r;
}
function joinProb(S, c, T, X) {
  const D = boss(S, T), y = S.actors[c];
  let p = 0;
  if (isAlly(S, c, D) || isAlly(S, c, T)) p = 0.35 + 0.55 * y.loyal;
  else if (isPartner(S, c, T) || isPartner(S, c, D)) p = 0.12 + 0.35 * y.loyal;
  else if (rel(S, c, T) >= 60 && rel(S, c, X) < -30) p = 0.08;
  const w = S.warnings.find(w => w.by === c && w.to === X && w.about === T && w.until >= S.turn);
  if (w) p = Math.max(p, isHuman(S, c) ? seatOf(S, c).rep.cred / 100 : 0.4 + (y.cred || 60) / 250);
  let f = 0; for (const L in y.forces) { if (L === T) f += share(S, c, L); else if (near(L, T, 450)) f += share(S, c, L) * 0.35; }
  if (f > 0.02 && p > 0) p = Math.max(p, 0.85);
  if (share(S, c, T) > 0.02) p = Math.max(p, 0.9);
  return { p, f };
}
function likelyHelp(S, T, X, kind) {
  let h = 0;
  for (const c of IDS) {
    if (c === X || c === T || c === boss(S, T) || !indep(S, c) || atWar(S, c, X)) continue;
    const { p, f } = joinProb(S, c, T, X); if (p <= 0.02) continue;
    const assumed = Math.max(f, isGreat(S, c) ? 0.1 : 0.03);
    h += p * (kind === 'sea' ? navyEff(S, c) + 0.3 * airEff(S, c) : ground(S, c)) * assumed;
  }
  return h;
}

/* ---------- 防御力量 ---------- */
function defenseAt(S, T, attacker) {
  const D = boss(S, T); let force = 0; const who = [], src = [];
  const add = (id, f, L, k) => { if (f > 0.01) { force += f; if (!who.includes(id)) who.push(id); if (L) src.push([id, L, k]); } };
  add(D, groundV(S, D, freeV(S, D, T)), T, 1);
  if (T !== D && indep(S, T)) add(T, groundV(S, T, freeV(S, T, T)), T, 1);
  if (indep(S, T)) add(T, homeGuard(S, T), null, 0);
  // 守方在当地集结、准备他用的部队（战线的后方梯队）与邻近地区的机动预备队也会参与防御
  const cm = committedV(S, D, T); if (vmax(cm) > 0.01) add(D, groundV(S, D, cm) * 0.3, T, 0.3);
  if (T !== D) for (const L of Object.keys(S.actors[D].forces)) {
    if (L === T || !landAdj(L, T) || attacker === L) continue;
    const cap = L === D ? 0.12 : 0.5; add(D, groundV(S, D, vmin(freeV(S, D, L), [cap, cap, cap])) * 0.35, L, 0.35);
  }
  for (const c of IDS) {
    if (c === D || c === T || c === attacker || !indep(S, c) || !atWar(S, c, attacker)) continue;
    for (const L of Object.keys(S.actors[c].forces)) {
      if (L === T) add(c, groundV(S, c, freeV(S, c, L)), L, 1);
      else if (near(L, T, 450)) { const cap = L === c ? 0.12 : 1; add(c, groundV(S, c, vmin(freeV(S, c, L), [cap, cap, cap])) * 0.35, L, 0.35); }
    }
  }
  return { force, who, src };
}
function seaDefenseAt(S, T, attacker) {
  const D = boss(S, T); let s = 0;
  for (const c of IDS) {
    if (!indep(S, c) || c === attacker) continue;
    const onSide = c === D || c === T || atWar(S, c, attacker);
    if (!onSide) continue;
    let fn = 0, fa = 0;
    for (const L of Object.keys(S.actors[c].forces)) {
      const fv = freeV(S, c, L);
      if (L === T) { fn += fv[1]; fa += fv[2]; }
      else if (dist(L, T) <= 1200) { const capd = L === c && c !== D && c !== T; const k = dist(L, T) <= 450 ? 0.6 : 0.3; fn += (capd ? Math.min(fv[1], 0.15) : fv[1]) * k; fa += (capd ? Math.min(fv[2], 0.15) : fv[2]) * k * 0.6; }
    }
    s += navyEff(S, c) * fn + (c === D || c === T ? 0.7 : 0.3) * airEff(S, c) * fa;
  }
  return s;
}

/* ---------- 具体兵力换算（兵员/坦克/战机/舰艇） ---------- */
function unitsOf(S, X) { const x = S.actors[X], k = x.k || {}; return { pers: x.pers || 0, tanks: x.land * (k.t || 0), air: x.air * (k.a || 0), ships: x.navy * (k.s || 0) }; }
function unitsV(S, X, v) { const u = unitsOf(S, X); return { pers: u.pers * v[0], tanks: u.tanks * v[0], air: u.air * v[2], ships: u.ships * v[1] }; }
function snapUnits(S, ids) { const o = {}; for (const id of ids) if (!o[id]) o[id] = unitsOf(S, id); return o; }
function diffUnits(S, pre, ids) { const d = [0, 0, 0, 0]; const seen = new Set(); for (const id of ids) { if (seen.has(id) || !pre[id]) continue; seen.add(id); const now = unitsOf(S, id), p = pre[id]; d[0] += Math.max(0, p.pers - now.pers); d[1] += Math.max(0, p.tanks - now.tanks); d[2] += Math.max(0, p.air - now.air); d[3] += Math.max(0, p.ships - now.ships); } return d; }
const addUnits = (a, b) => { for (let i = 0; i < 4; i++) a[i] += b[i]; return a; };

/* ---------- 战役目标（城市） ---------- */
function frontObjectives(S, f) {
  const cs = (typeof CITIES !== 'undefined' && CITIES[f.target]) || []; if (!cs.length) return [];
  const a = GEO.label[f.from === f.target ? f.att : f.from] || GEO.label[f.att], b = GEO.label[f.target];
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const arr = cs.map((c, i) => ({ i, t: ((c[2] - a[0]) * dx + (c[3] - a[1]) * dy) / L2 })).sort((p, q) => p.t - q.t);
  const n = arr.length; return arr.map((o, j) => [o.i, Math.round(10 + (j + 0.6) / n * 86)]);
}
const cityName = (T, i) => { const c = (typeof CITIES !== 'undefined' && CITIES[T] && CITIES[T][i]) || null; return c ? { c: [c[0], c[1]] } : { raw: '?' }; };
const cityAt = (T, i) => (typeof CITIES !== 'undefined' && CITIES[T] && CITIES[T][i]) || null;
const isCapital = (T, i) => { const c = cityAt(T, i); return !!(c && c[4]); };
/* ---------- 前线指挥（v4）：主攻方向、死守、空中支援 ----------
 * 主攻方向（进攻方）：集中兵力突击某城，该城的攻克门槛降低（最多 25 个百分点），但进攻方伤亡 +15%。
 * 死守（守方玩家）：该城的攻克门槛 +12，守军战力 +6%，但守军伤亡 +15%。
 * 空中支援：把作战半径内各基地的空闲空中力量投入一条战线一个回合（会有额外的飞机损失）。 */
const holdOf = (S, T) => { const H = boss(S, T); if (!isHuman(S, H)) return null; const sb = seatOf(S, H), h = sb && sb.holds && sb.holds[T]; return h != null ? h : null; };
function objThr(S, f, i, thr) {
  let t = thr;
  if (f.focus === i) t -= Math.min(25, thr * 0.3);
  if (holdOf(S, f.target) === i) t += 12;
  return clamp(Math.round(t), 5, 99);
}
const supRange = () => (sc().era === 'ww2' ? 900 : 1500);
function airSupportOf(S, X, T) {
  const x = S.actors[X], list = []; let air = 0; const rng = supRange();
  for (const L in x.forces) { if (L !== T && dist(L, T) > rng) continue; const a = freeV(S, X, L)[2]; if (a > 0.004) { list.push([L, +a.toFixed(4)]); air += a; } }
  return { list, air, force: 0.6 * airEff(S, X) * air * 0.8, planes: unitsOf(S, X).air * air };
}
function setFrontFocus(S, fid, i) {
  const f = S.fronts.find(z => z.id === fid && z.att === S.player); if (!f) return false;
  if (i === null || i === undefined || i === '') { f.focus = null; return true; }
  i = +i; if (!cityAt(f.target, i) || (f.taken || []).includes(i)) return false;
  f.focus = i; return true;
}
function setOpFocus(S, oid, i) {
  const o = S.ops.find(z => z.id === oid && z.owner === S.player); if (!o) return false;
  if (i === null || i === undefined || i === '') { o.focus = null; return true; }
  if (!cityAt(o.target, +i)) return false; o.focus = +i; return true;
}
function setHold(S, T, i) {
  if (!S.actors[T] || boss(S, T) !== S.player) return false;
  S.holds = S.holds || {};
  if (i === null || i === undefined || i === '') { delete S.holds[T]; return true; }
  i = +i; if (!cityAt(T, i)) return false;
  if (S.fronts.some(f => f.target === T && (f.taken || []).includes(i))) return false;
  S.holds[T] = i; return true;
}
/* 玩家可以发动新攻势的地区：正在交战的敌方地区优先 */
function frontTargets(S) {
  const P = S.player, out = [];
  for (const T of IDS) {
    if (T === P || boss(S, T) === P || S.actors[T].ctrl === P) continue;
    const opts = stagingOptions(S, P, T); if (!opts.length) continue;
    const war = atWar(S, P, boss(S, T)), busy = S.fronts.some(f => f.att === P && f.target === T) || S.ops.some(o => o.owner === P && o.target === T);
    out.push({ T, war, busy, kind: opts[0].kind, L: opts[0].L, d: dist(opts[0].L, T) });
  }
  out.sort((a, b) => (b.war - a.war) || (a.busy - b.busy) || a.d - b.d);
  return out;
}

/* ---------- 发动行动 ---------- */
function launchOp(S, o, R) {
  S.ops = S.ops.filter(z => z !== o);
  const X = o.owner, T = o.target;
  if (!indep(S, X) || S.actors[T].ctrl === X || boss(S, T) === X || NEU(S, X) || NEU(S, T)) return;
  const D = boss(S, T);
  // 筹划时目标还在敌人手里，发动前已被盟友或中立方收复/占领：取消行动，而不是对新的控制者开战（例如 1945 年英军原本要从德军手里夺回的地区已被苏军收复）
  if (o.def0 && o.def0 !== D && !atWar(S, X, D)) { if (isHuman(S, X)) RP(S, X, R).mil.push({ msg: M('m.op.moot', { a: X, t: T, b: D }), tone: 'info' }); return; }
  const avail = vmin(o.v, freeV(S, X, o.from));
  if (vmax(avail) < 0.02 || groundV(S, X, avail) < 1 || !canStation(S, X, o.from)) { const msg = M('m.op.nopos', { a: X, t: T }); if (isHuman(S, X)) RP(S, X, R).mil.push({ msg, tone: 'bad' }); return; }
  const newWar = declareWar(S, X, D);
  const w0 = S.war[rk(X, D)]; if (w0 && w0.limited) w0.limited = false; // 地面进攻使有限冲突升级为全面战争
  // 驻军“绊线”：第三国驻在目标地区的部队遭到攻击，其所属国随之参战
  for (const c of IDS) {
    if (c === X || c === D || c === T || !indep(S, c) || atWar(S, c, X) || share(S, c, T) < 0.01) continue;
    if (!(isAlly(S, c, D) || isAlly(S, c, T) || isPartner(S, c, T) || rel(S, c, T) >= 40)) continue;
    if (!isHuman(S, c)) { const sv = shareV(S, c, T), ally = isAlly(S, c, D) || isAlly(S, c, T); if (sv[0] < (ally ? 0.01 : 0.03) && sv[2] < (ally ? 0.02 : 0.05)) continue; } // 只有地面/空中部队成规模驻扎才构成“绊线”（军舰靠港、少量顾问不算）
    declareWar(S, c, X);
    const tm = M('m.tripwire', { a: c, t: T, b: X });
    logEvent(S, 'war', tm, 'warn', [c, X, T]);
    if (isHuman(S, c) || isHuman(S, X)) { if (isHuman(S, c)) RP(S, c, R).mil.push({ actor: c, msg: tm, tone: 'bad', big: true, about: [X] }); if (isHuman(S, X)) RP(S, X, R).mil.push({ actor: c, msg: tm, tone: 'warn', big: true, about: [X] }); }
    else R.world.push({ actor: c, msg: tm, tone: 'warn', big: true, about: [X] });
  }
  const surprise = !o.haste && !o.det.includes(D) && !o.det.includes(T);
  const f = { id: 'F' + S.seq++, att: X, target: T, def: D, from: o.from, v: avail, kind: o.kind, phase: o.kind === 'amph' ? 'sea' : 'land', sp: 0, tries: 0, progress: 0, turns: 0, phaseTurns: 0, last: 0, hist: [], surprise, haste: o.haste ? 2 : 0, co: [], log: [], cas: { a: [0, 0, 0, 0], d: [0, 0, 0, 0] }, taken: [], core: o.core || null, start: S.turn, tv: avail.slice(), focus: o.focus != null && cityAt(T, o.focus) ? o.focus : null };
  f.obj = frontObjectives(S, f);
  const osh = (sc().opShock || {})[X]; if (osh && S.turn <= osh[1] && S.turn >= (osh[3] ?? 0) && !isHuman(S, X)) { f.shock = osh[0]; f.shockUntil = S.turn + (osh[2] || 2); } // 剧本：开战初期的突袭优势（如1941年日本南进）
  S.fronts.push(f);
  if (S.th) thOnFront(S, f);
  S.actors[X].mob = Math.max(S.actors[X].mob, 1);
  const hX = isHuman(S, X), legit = hX ? seatCB(S, X, D) : true;
  const msg = M('m.op.launch', { a: X, t: T, k: M('kind.' + o.kind), s: dotw(S, X, avail) }), msgMe = M('m.op.launch_me', { a: X, t: T, k: M('kind.' + o.kind), s: dotw(S, X, avail) });
  logEvent(S, 'war', hX && !S.humans ? msgMe : msg, 'warn', [X, T]);
  if (hX) RP(S, X, R).mil.push({ msg: msgMe, tone: 'warn' });
  const vic = [D, T].filter((v, i, a) => isHuman(S, v) && a.indexOf(v) === i && v !== X);
  for (const v of vic) RP(S, v, R).toYou.push({ actor: X, msg, tone: 'bad', surprise });
  if (!hX && !vic.length) R.world.push({ actor: X, msg, tone: 'warn', big: true, about: [T] });
  pushEv(S, { type: 'invade', actor: X, target: T, sev: legit && hX ? 55 : 85, third: legit && hX ? 12 : 25, front: f.id, big: true });
  if (hX) withSeat(S, X, () => afterPlayerHostile(S, D, 'invade', legit, RP(S, X, R)));
  if (newWar && isHuman(S, D)) withSeat(S, D, () => grantCB(S, X, 'attacked', 20, false));
}

/* ---------- 战役结算 ---------- */
function coOf(S, f) {
  if (!f.co || !f.co.length) return [];
  f.co = f.co.filter(k => indep(S, k.id) && atWar(S, k.id, f.def) && (S.actors[k.id].forces[f.from] || S.actors[k.id].moves.some(m => m.to === f.from)) && vmax(k.v) > 0.002);
  for (const k of f.co) k.v = vmin(k.v, shareV(S, k.id, f.from));
  return f.co;
}
function frontLog(f, e) { f.log.push(e); if (f.log.length > 12) f.log.shift(); }
function resolveFronts(S, R) {
  const byT = {};
  for (const f of S.fronts) { (byT[f.target] = byT[f.target] || []).push(f); }
  for (const f of S.fronts.slice()) {
    if (!S.fronts.includes(f)) continue;
    if (f.th && S.th && f.phase === 'land') { thFrontTurn(S, f, R); continue; } // 精细战区接管（联机版）
    const T = f.target, X = f.att, prevDef = f.def; f.def = boss(S, T);
    if (!f.log) { f.log = []; f.cas = { a: [0, 0, 0, 0], d: [0, 0, 0, 0] }; f.taken = f.taken || []; f.co = f.co || []; }
    if (!f.obj) f.obj = frontObjectives(S, f);
    if (!indep(S, X) || f.def === X || S.actors[T].ctrl === X) { S.fronts = S.fronts.filter(z => z !== f); continue; }
    if (!atWar(S, X, f.def)) { if (prevDef && prevDef !== f.def && f.def !== X) { S.fronts = S.fronts.filter(z => z !== f); continue; } declareWar(S, X, f.def); } // 目标已经易手（被解放、获释）：这场攻势随之结束，不会对新政权开战
    if (!canStation(S, X, f.from) || vsum(shareV(S, X, f.from)) < 0.004) { S.fronts = S.fronts.filter(z => z !== f); report(S, R, f, M('m.front.nostage', { a: X, t: T }), 'bad'); continue; }
    f.v = vmin(f.v, shareV(S, X, f.from));
    if (!f.tv) f.tv = f.v.slice();
    f.v = vmin(f.tv, vadd(f.v, vmul(freeV(S, X, f.from), 0.6))); // 从出发阵地的预备队补充伤亡
    const co = coOf(S, f);
    const mult = (f.surprise ? 1.3 : 1) * (f.haste > 0 ? 0.75 : 1) * stabMod(S, X) * (f.shock && S.turn <= f.shockUntil ? f.shock : 1);
    f.surprise = false; if (f.haste > 0) f.haste--;
    const gOwn = groundV(S, X, f.v), gCo = co.reduce((s, k) => s + groundV(S, k.id, k.v) * stabMod(S, k.id), 0);
    let A0 = gOwn * mult + gCo;
    const peers = byT[T] || [f]; const totA = peers.reduce((s, g) => s + groundV(S, g.att, g.v) + (g.co || []).reduce((z, k) => z + groundV(S, k.id, k.v), 0), 0) || 1;
    const split = clamp((gOwn + gCo) / totA, 0.15, 1);
    const def = defenseAt(S, T, X); let D0 = Math.max(1, def.force * split);
    f.coD = def.who.filter(c => c !== f.def && c !== T);
    f.turns++; f.phaseTurns++;
    const attackers = [X].concat(co.map(k => k.id)), defenders = def.who.slice();
    const sb = f.dsup === S.turn && f.dsupBy && indep(S, f.dsupBy) && atWar(S, f.dsupBy, X) ? f.dsupBy : null; // 守方玩家的空中支援
    if (sb && !defenders.includes(sb)) defenders.push(sb);
    const pre = snapUnits(S, attackers.concat(defenders));
    const e = { t: S.turn, ph: f.phase, cap: [], lost: [] };
    // 前线指挥：死守、空中支援
    const hold = holdOf(S, T), holding = hold !== null && !f.taken.includes(hold);
    if (holding) { D0 *= 1.06; e.hold = hold; }
    let supA = 0;
    if (f.sup === S.turn && f.supL) { supA = Math.min(supportStrike(S, X, f.supL), A0 * 0.6 + 5); A0 += supA; e.sup = Math.round(supA); }
    if (sb && f.dsupL) { const s = Math.min(supportStrike(S, sb, f.dsupL), D0 * 0.6 + 5); D0 += s; e.dsup = Math.round(s); }
    f.A = A0; f.D = D0;
    const done = () => {
      const la = diffUnits(S, pre, attackers), ld = diffUnits(S, pre, defenders);
      e.la = la.map(Math.round); e.ld = ld.map(Math.round); addUnits(f.cas.a, la); addUnits(f.cas.d, ld);
      frontLog(f, e);
    };
    if (f.phase === 'sea') {
      const As = seaV(S, X, f.v) * mult + co.reduce((s, k) => s + seaV(S, k.id, k.v), 0) + supA * 0.6; const Ds = Math.max(1, seaDefenseAt(S, T, X));
      const sr = As / Ds; f.seaRatio = sr; f.ratio = sr; f.As = As; f.Ds = Ds;
      const d = (42 * Math.tanh(1.2 * Math.log(Math.max(sr, 0.01))) + rn(S) * 6) * Math.sqrt(sc().tempo || 1) * (sr > 4 && (sc().tempo || 1) > 1 ? 1.4 : 1); // 总体战：海空争夺节奏更快；压倒性优势时一个季度即可夺取制海权
      f.sp += d; f.last = d; e.d = d; e.p = f.sp; e.r = sr;
      const fa = 0.03 + 0.06 * Ds / (As + Ds), fd = 0.02 + 0.07 * As / (As + Ds);
      attrit(S, X, f.from, [0, fa, fa * 0.3], f); for (const k of co) attrit(S, k.id, f.from, [0, fa, fa * 0.3], k);
      for (const c of [f.def, T, ...f.coD]) if (indep(S, c)) attritNear(S, c, T, 1200, [0, fd, fd * 0.3]);
      if (f.sp >= 100) { f.phase = 'landing'; f.phaseTurns = 0; e.ev = 'sea_ok'; report(S, R, f, M('m.front.sea_ok', { a: X, t: T }), H => H === X ? 'good' : 'warn'); }
      else if (f.sp <= -60 || f.phaseTurns >= 5) { e.ev = 'sea_fail'; done(); S.fronts = S.fronts.filter(z => z !== f); report(S, R, f, M('m.front.sea_fail', { a: X, t: T }), H => H === X ? 'bad' : 'good'); pushEv(S, { type: 'offensive_fail', actor: X, target: T, sev: 0 }); continue; }
      if (!(f.phase === 'landing' && sr >= 2 && (sc().tempo || 1) > 1)) { // 总体战中掌握压倒性制海权时，夺取制海权与登陆在同一季度完成（如诺曼底登陆）
        f.hist.push(Math.round(f.phase === 'sea' ? Math.min(99, Math.max(0, f.sp)) * 0.15 : 15)); if (f.hist.length > 16) f.hist.shift();
        done(); continue;
      }
    }
    if (f.phase === 'landing') {
      const lift = (navyEff(S, X) * f.v[1] * 0.6 + 5 + co.reduce((s, k) => s + navyEff(S, k.id) * k.v[1] * 0.6, 0)) * (sc().tempo || 1); // 二战：一个季度内可以多波次登陆
      const Al = Math.min(A0, lift); const Dc = Math.max(1, D0 * 0.5 * DEF[T].terr);
      const r = Al / Dc * (0.8 + 0.4 * rnd(S)) * (f.shock && S.turn <= f.shockUntil ? f.shock : 1); f.ratio = r; e.r = r;
      if (r > 1.1) { f.phase = 'land'; f.progress = 8; f.phaseTurns = 0; e.ev = 'beach_ok'; e.p = 8; attrit(S, X, f.from, [0.04, 0.01, 0.02], f); lossDef(S, def, T, 0.03); report(S, R, f, f.obj && f.obj[0] ? M('m.front.beach_at', { a: X, t: T, x: cityName(T, f.obj[0][0]) }) : M('m.front.beach_ok', { a: X, t: T }), H => H === X ? 'good' : 'warn'); }
      else {
        f.tries++; attrit(S, X, f.from, [0.12, 0.03, 0.06], f); for (const k of co) attrit(S, k.id, f.from, [0.12, 0.03, 0.06], k); lossDef(S, def, T, 0.03); e.ev = 'beach_rep';
        if (f.tries >= 2) { e.ev = 'beach_fail'; done(); S.fronts = S.fronts.filter(z => z !== f); report(S, R, f, M('m.front.beach_fail', { a: X, t: T }), H => H === X ? 'bad' : 'good'); pushEv(S, { type: 'offensive_fail', actor: X, target: T, sev: 0 }); continue; }
        report(S, R, f, M('m.front.beach_rep', { a: X, t: T }), H => H === X ? 'bad' : 'good');
      }
      f.hist.push(20); if (f.hist.length > 16) f.hist.shift();
      done(); continue;
    }
    // 陆上推进
    let A = A0;
    if (f.kind === 'amph') { const sr = Math.max(0.01, (seaV(S, X, f.v) + co.reduce((s, k) => s + seaV(S, k.id, k.v), 0)) / Math.max(1, seaDefenseAt(S, T, X))); f.seaRatio = sr; A = Math.min(A, (navyEff(S, X) * f.v[1] * 1.2 + 10 + co.reduce((s, k) => s + navyEff(S, k.id) * k.v[1] * 1.2, 0)) * (sc().tempo || 1) * clamp(sr, 0.3, 1)); }
    const ratio = A / Math.max(1, D0 * DEF[T].terr); f.ratio = ratio; e.r = ratio;
    const cap = 100 / minTurns(T); const a = Math.log(Math.max(ratio, 0.01)) - 0.15;
    let delta = a >= 0 ? cap * Math.pow(Math.tanh(0.9 * a), 1.3) : 14 * Math.tanh(1.1 * a);
    delta += rn(S) * cap * 0.15;
    const gd = S.guard && GRD(S, T); // 保底：越接近上限推进越慢，到上限就陷入僵持
    if (gd && delta > 0) delta = Math.min(delta, Math.max(0, (GCAP - f.progress) * 0.45));
    const p0 = f.progress;
    f.progress = clamp(f.progress + delta, -40, gd ? GCAP : 100); f.last = delta; e.d = f.progress - p0; e.p = f.progress;
    if (gd && f.progress >= GCAP - 2 && !f.gHold) { f.gHold = S.turn; report(S, R, f, M('m.guard_hold', { a: X, t: T }), H => H === X ? 'bad' : 'good'); }
    f.hist.push(Math.round(f.progress)); if (f.hist.length > 16) f.hist.shift();
    const tk = sc().tempo || 1; // 总体战的消耗强度：二战东线每季度的伤亡可达参战兵力的一成以上
    let lA = tk > 1 ? (0.012 + 0.055 * D0 / (A + D0)) * tk : 0.02 + 0.05 * D0 / (A + D0), lD = tk > 1 ? (0.012 + 0.065 * A / (A + D0)) * tk : 0.02 + 0.06 * A / (A + D0);
    if (f.focus != null && !f.taken.includes(f.focus)) lA *= 1.15; // 集中突击的代价
    if (holding) lD *= 1.15; // 寸土必争的代价
    attrit(S, X, f.from, [lA, 0, lA * 0.5], f); for (const k of co) attrit(S, k.id, f.from, [lA, 0, lA * 0.5], k);
    lossDef(S, def, T, lD);
    f.lossA = lA; f.lossD = lD;
    // 城市目标的得失（主攻方向与死守会改变攻克门槛）
    for (const [i, thr0] of (f.obj || [])) {
      const thr = objThr(S, f, i, thr0), has = f.taken.includes(i);
      if (!has && f.progress >= thr) { f.taken.push(i); e.cap.push(i); }
      else if (has && f.progress < thr - 4) { f.taken = f.taken.filter(z => z !== i); e.lost.push(i); }
    }
    if (e.cap.length) report(S, R, f, M('m.front.cap', { a: X, x: { list: e.cap.map(i => cityName(T, i)) } }), H => H === X ? 'good' : boss(S, T) === H ? 'bad' : 'info');
    if (e.lost.length) report(S, R, f, M('m.front.retake', { a: f.def, x: { list: e.lost.map(i => cityName(T, i)) } }), H => H === X ? 'bad' : boss(S, T) === H ? 'good' : 'info');
    for (const i of e.cap) {
      if (isCapital(T, i)) { // 首都陷落：政府威信与指挥体系受到冲击
        if (indep(S, T)) S.actors[T].stab = clamp(S.actors[T].stab - 6, 0, 100);
        f.progress = Math.min(gd ? GCAP : 100, f.progress + 4); e.p = f.progress;
        const cm = M('m.front.capital', { a: X, t: T, x: cityName(T, i) });
        logEvent(S, 'war', cm, 'warn', [X, T]);
        const hh = [X, boss(S, T)].filter((v, j, a) => isHuman(S, v) && a.indexOf(v) === j);
        for (const H of hh) RP(S, H, R).mil.push({ msg: cm, tone: H === X ? 'good' : 'bad', front: f.id });
        if (!hh.length) R.world.push({ actor: X, msg: cm, tone: 'warn', about: [T], big: true });
      }
      if (holding && i === hold) { const HD = boss(S, T), sbH = seatOf(S, HD); if (sbH && sbH.holds) delete sbH.holds[T]; if (indep(S, T)) S.actors[T].stab = clamp(S.actors[T].stab - 2, 0, 100); RP(S, HD, R).mil.push({ msg: M('m.front.hold_fail', { x: cityName(T, i) }), tone: 'bad', front: f.id }); }
      if (f.focus === i) { f.focus = null; if (isHuman(S, X)) RP(S, X, R).mil.push({ msg: M('m.front.focus_ok', { x: cityName(T, i) }), tone: 'good', front: f.id }); }
    }
    for (const i of e.lost) if (isCapital(T, i) && indep(S, T)) S.actors[T].stab = clamp(S.actors[T].stab + 3, 0, 100);
    done();
    if (f.progress >= 100) conquer(S, f, R);
    else if (f.progress <= -25 && f.turns >= 2) {
      S.fronts = S.fronts.filter(z => z !== f); attrit(S, X, f.from, [0.06, 0, 0.03], f);
      if (!isHuman(S, f.def) && S.actors[f.def] && boss(S, f.from) === X) S.actors[f.def].flags.counter = { t: f.from, until: S.turn + 3 }; // 守方可趁势反攻
      report(S, R, f, M('m.front.collapse', { a: X, t: T }), H => H === X ? 'bad' : 'good');
      pushEv(S, { type: 'offensive_fail', actor: X, target: T, sev: 0 });
    }
  }
}
function stabMod(S, X) { const x = S.actors[X]; return x.stab < 25 ? 0.85 : 1; }
/* 空中支援的出击：返回增加的地面战力，并扣除出击飞机的损失 */
function supportStrike(S, X, list) {
  const tk = sc().tempo || 1; let s = 0;
  for (const [L, a] of list) { const v = Math.min(a, freeV(S, X, L)[2]); if (!(v > 0.002)) continue; s += 0.6 * airEff(S, X) * v * 0.8; attrit(S, X, L, [0, 0, 0.03 * tk], { v: [0, 0, v] }); }
  return s;
}
// 非定点的少量损失（摩擦、零星冲突）：按比例摊到全军
function loss(S, X, sh, frac) { const x = S.actors[X]; x.land *= 1 - sh * frac; x.air *= 1 - sh * frac * 0.5; const dp = (x.pers || 0) * sh * frac * landPers(x); x.pers = Math.max(0, (x.pers || 0) - dp); x.cas = (x.cas || 0) + dp; }
function naval(S, X, sh, frac) { const x = S.actors[X]; x.navy *= 1 - sh * frac; x.air *= 1 - sh * frac * 0.3; }
function lossDef(S, def, T, frac) {
  const srcs = def.src && def.src.length ? def.src : def.who.map(c => [c, T, 1]);
  for (const [c, L, k] of srcs) if (S.actors[c].forces[L]) attrit(S, c, L, [frac * k, 0, frac * k * 0.5]);
  if (indep(S, T) && def.who.includes(T)) { const x = S.actors[T]; x.pers = Math.max(0, (x.pers || 0) * (1 - frac * 0.12)); }
}
function report(S, R, f, msg, tone) { // tone：字符串，或按收件人（真人国家）计算的函数
  const tn = H => (typeof tone === 'function' ? tone(H) : tone), t0 = tn(S.player);
  logEvent(S, 'war', msg, t0 === 'good' || t0 === 'bad' ? 'warn' : t0, [f.att, f.target]);
  const inv = humansOf(S).filter(H => f.att === H || boss(S, f.target) === H || f.target === H || (f.co || []).some(k => k.id === H) || (f.coD || []).includes(H));
  for (const H of inv) RP(S, H, R).mil.push({ msg, tone: tn(H), front: f.id });
  if (!inv.length) R.world.push({ actor: f.att, msg, tone: 'info', about: [f.target], big: false });
}

/* ---------- 占领 ---------- */
function conquer(S, f, R) {
  if (S.guard && GRD(S, f.target)) { f.progress = Math.min(f.progress, GCAP); return; } // 保底国家不会被征服
  const X = f.att, T = f.target, t = S.actors[T], wasHome = t.ctrl === T, oldCtrl = t.ctrl;
  S.fronts = S.fronts.filter(z => z !== f && z.target !== T);
  forSeats(S, sb => { if (sb.holds) delete sb.holds[T]; });
  S.ops = S.ops.filter(o => o.target !== T);
  const owner = t.part && S.actors[t.part] ? t.part : null;
  const regain = owner && (X === owner || (indep(S, owner) && isAlly(S, X, owner) && !isHuman(S, X)));
  const liberate = !regain && !wasHome && !isHuman(S, X) && (rel(S, X, T) >= 30 || isAlly(S, X, T));
  t.land *= 0.1; t.air *= 0.1; t.navy *= 0.2; t.mob = 0; t.gdp *= 0.9; t.pers = (t.pers || 0) * 0.15;
  const evac = [];
  for (const c of IDS) { if (c === X || c === T) continue; if (share(S, c, T) > 0 && atWar(S, c, X)) { const D = evacuateFrom(S, c, T, X); if (D) evac.push([c, D]); } }
  const x = S.actors[X]; const mv = vmin(f.v, shareV(S, X, f.from));
  if (vmax(mv) > 0) { x.forces[f.from] = vsub0(x.forces[f.from], mv); if (vsum(x.forces[f.from]) < 1e-4 && f.from !== X) delete x.forces[f.from]; x.forces[T] = vadd(x.forces[T] || V0(), mv); }
  let msg;
  if (regain) { t.ctrl = owner; t.overlord = null; t.integrated = true; t.resist = 0; t.occSince = null; t.stab = 45; if (owner !== X && vmax(mv) > 0) { x.forces[T] = vsub0(x.forces[T], mv); if (vsum(x.forces[T]) < 1e-4) delete x.forces[T]; x.moves.push({ from: T, to: X, v: mv, eta: S.turn + 1 }); } msg = M('m.regain', { a: X, t: T, b: owner }); }
  else if (liberate) { t.ctrl = T; t.overlord = null; t.resist = 0; t.integrated = false; t.stab = 35; rebuildArmy(S, T, 0.15); addTreaty(S, 'access', X, T); if (!isAlly(S, X, T)) addTreaty(S, 'partner', X, T); for (const e of enemies(S, X)) if (e === oldCtrl && !atWar(S, T, e)) declareWar(S, T, e); msg = M('m.liberate', { a: X, t: T }); } // 解放者获得驻军权，被解放国加入对占领者的战争
  else {
    t.ctrl = X; t.overlord = null; t.integrated = false; t.occSince = S.turn;
    const d = DEF[T];
    t.resist = clamp(40 + 10 * Math.log10(Math.max(1, d.pop)) + d.terr * 10 + (d.gov === 'dem' ? 10 : 0) - infl(S, X, T) / 2, 25, 95);
    if (wasHome) {
      for (const id of IDS) { const y = S.actors[id]; if (id === T || PRV(S, id)) continue; if (y.overlord === T) y.overlord = null; if (y.ctrl === T) { y.ctrl = id; y.resist = 0; y.stab = 40; y.integrated = false; rebuildArmy(S, id, 0.1); } }
      for (const b of Object.values(S.blocs)) b.members = b.members.filter(m => m !== T);
      S.treaties = S.treaties.filter(z => z.a !== T && z.b !== T);
      S.sanctions = S.sanctions.filter(s => s.from !== T && s.to !== T);
      for (const e of enemies(S, T)) delete S.war[rk(T, e)];
      S.ops = S.ops.filter(o => o.owner !== T); S.fronts = S.fronts.filter(z => z.att !== T);
      for (const g of S.fronts) if (g.co) g.co = g.co.filter(k => k.id !== T);
      t.forces = {}; t.moves = [];
    }
    msg = M(wasHome ? 'm.conquer_gov' : 'm.conquer', { a: X, t: T, b: oldCtrl });
  }
  resetExposure(S);
  for (const [c, D] of evac) { const em = M('m.evacuate', { a: c, t: T, l: D }); logEvent(S, 'mil', em, 'info', [c, T]); if (isHuman(S, c)) RP(S, c, R).mil.push({ actor: c, msg: em, tone: 'bad', about: [T] }); else R.world.push({ actor: c, msg: em, tone: 'info', about: [T] }); }
  logEvent(S, 'conquest', msg, 'warn', [X, T]);
  const hh = [X, T, oldCtrl].filter((v, j, a) => isHuman(S, v) && a.indexOf(v) === j);
  for (const H of hh) RP(S, H, R).mil.push({ actor: X, msg, tone: H === X ? 'good' : 'bad', big: true, about: [T] });
  if (!hh.length) R.world.push({ actor: X, msg, tone: 'info', big: true, about: [T] });
  pushEv(S, { type: 'conquest', actor: X, target: T, sev: regain ? 20 : 70, third: regain ? 5 : 20, big: true });
  S.tension = clamp(S.tension + 10, 0, 100);
  if (isHuman(S, X)) { const sb = seatOf(S, X); sb.pol.recentWin = (sb.pol.recentWin || 0) + 1; }
  if (S.th) thOnConquer(S, T, X);
  for (const H of [T, oldCtrl].filter((v, j, a) => isHuman(S, v) && a.indexOf(v) === j && v !== X)) { const sb = seatOf(S, H); sb.pol.recentLoss = (sb.pol.recentLoss || 0) + 1; }
}
/* 被攻陷地区里的第三国部队：附近有可以驻扎的己方或盟友地区、且能经陆路或海路撤出时，大部分人员撤出但丢下大部分重装备
   （1940 年敦刻尔克与挪威、1941 年希腊）；无路可退时大部被俘或歼灭（1942 年新加坡、巴丹）。返回撤往的地区 */
function evacuateFrom(S, c, T, X) {
  const y = S.actors[c];
  const ok = L => L !== T && S.actors[L].ctrl !== X && canStation(S, c, L) && (landAdj(T, L) || (!LANDLOCKED.has(T) && !LANDLOCKED.has(L) && y.navy > 0 && dist(T, L) <= 800));
  const D = IDS.filter(ok).sort((a, b) => (b === c) - (a === c) || dist(a, T) - dist(b, T))[0];
  if (!D) { destroyAt(S, c, T, 0.85); if (y.forces[T]) { const h = y.ctrl === c ? c : null; if (h) y.forces[h] = vadd(y.forces[h] || V0(), y.forces[T]); delete y.forces[T]; } return null; }
  destroyAt(S, c, T, 0.2); // 掩护撤退中的伤亡与被俘
  if (!y.forces[T]) return D;
  const p0 = y.pers, c0 = y.cas; attrit(S, c, T, [0.45, 0, 0.25]); y.pers = p0; y.cas = c0; // 丢弃的重装备与飞机：装备损失，人员撤出
  const s = y.forces[T]; y.forces[D] = vadd(y.forces[D] || V0(), s); delete y.forces[T];
  for (const f of S.fronts) if (f.att === c && f.from === T) f.from = D;
  for (const o of S.ops) if (o.owner === c && o.from === T) o.from = D;
  return D;
}
function occupationTurn(S, R) {
  for (const T of IDS) {
    const t = S.actors[T]; if (t.ctrl === T || t.integrated) continue;
    const O = t.ctrl; if (!indep(S, O)) continue;
    const d = DEF[T];
    const base = 2.4 + 2.5 * (d.terr - 1) + (d.gov === 'dem' ? 0.8 : 0) + Math.log10(Math.max(1, d.pop)) * 0.6;
    let outside = 0; const backers = [];
    for (const c of IDS) { if (c === O || c === T || !indep(S, c)) continue; if (rel(S, c, T) > 30 && (rel(S, c, O) < -10 || atWar(S, c, O))) { outside += 0.7; backers.push(c); } }
    outside = Math.min(outside, 2.5) + (t.fund || 0); t.fund = 0;
    const garrison = groundV(S, O, shareV(S, O, T));
    const gRatio = garrison / (d.pop * 2 + 20);
    const suppress = 4 * (1 - Math.exp(-gRatio));
    const accept = Math.min(2, (S.turn - (t.occSince ?? S.turn)) * 0.05) + infl(S, O, T) / 60;
    const dr = (base + outside - suppress - accept) * (sc().resistK ?? 1) + rn(S) * 1.2;
    t.resist = clamp(t.resist + dr, 0, 100);
    const drain = t.resist / 100 * 0.03;
    if (S.actors[O].forces[T]) attrit(S, O, T, [drain, 0, drain * 0.5]);
    t.gdp *= 1 - t.resist / 100 * 0.01;
    if (t.resist >= 90 && chance(S, 0.2)) {
      t.ctrl = T; t.resist = 0; t.stab = 35; t.integrated = false;
      rebuildArmy(S, T, 0.2);
      declareWar(S, T, O); setRel(S, T, O, -80); resetExposure(S);
      const msg = M('m.uprising', { a: O, t: T });
      logEvent(S, 'uprising', msg, 'warn', [T, O]);
      if (isHuman(S, O)) RP(S, O, R).mil.push({ actor: T, msg, tone: 'bad', big: true, about: [O] }); else R.world.push({ actor: T, msg, tone: 'info', big: true, about: [O] });
    }
  }
}

/* ---------- 封锁与打击 ---------- */
function blockadeStrength(S, X, T) { return forcesNear(S, X, T, 1000, 'navy'); }
function blockadeDefense(S, T, X) { let s = 0; for (const c of IDS) { if (!indep(S, c) || c === X) continue; if (c === T || c === boss(S, T) || atWar(S, c, X)) s += forcesNear(S, c, T, 1000, 'navy'); } return s; }
function strikeRange(S, X) { return Math.max(DEF[X].proj, reach(S, X) * 0.5); }
function strikePower(S, X, T) {
  let f = 0; const x = S.actors[X], rng = strikeRange(S, X);
  for (const L in x.forces) if (dist(L, T) <= rng || L === T) f += freeV(S, X, L)[2];
  return airEff(S, X) * f * 0.3 + (DEF[X].icbm ? airEff(S, X) * 0.03 : 0);
}
const canStrike = (S, X, T) => strikePower(S, X, T) > 1;
/* 对某国驻在 L 的部队实施精确打击（核心利益危机、驻军冲突用）。返回损失的具体兵力 */
function strikeForcesAt(S, X, V, L, k, R, mixV) {
  if (!S.actors[V].forces[L] || !indep(S, V)) return null;
  const P_ = strikePower(S, X, L) * (k || 1) + (near(X, L, 450) ? ground(S, X) * 0.02 : 0);
  const sv = shareV(S, V, L);
  const D_ = airEff(S, V) * sv[2] * 0.8 + seaV(S, V, sv) * 0.2 + (L === V ? airEff(S, V) * 0.25 : 0);
  const fr = clamp(0.06 + 0.24 * P_ / (P_ + D_ + 1) + rn(S) * 0.02, 0.04, 0.38);
  const pre = snapUnits(S, [V, X]);
  attrit(S, V, L, mixV ? [fr * mixV[0], fr * mixV[1], fr * mixV[2]] : [fr * 0.8, fr, fr]);
  S.actors[X].air *= 1 - clamp(0.02 * D_ / (P_ + D_ + 1), 0, 0.03);
  const lost = diffUnits(S, pre, [V]), mine = diffUnits(S, pre, [X]);
  S.tension = clamp(S.tension + 6, 0, 100);
  return { fr, lost, mine };
}

/* ---------- 核打击 ---------- */
function nuclearStrike(S, me, t, scope, R) {
  const x = S.actors[t], mine = S.actors[me]; const strat = scope === 'strategic';
  const n = strat ? Math.min(mine.nukes, Math.max(20, Math.round(mine.nukes * 0.1))) : Math.min(mine.nukes, 5);
  mine.nukes -= n;
  x.land *= strat ? 0.7 : 0.62; x.air *= 0.7; x.navy *= 0.8; x.gdp *= strat ? 0.68 : 0.95; x.stab = clamp(x.stab - (strat ? 35 : 15), 0, 100); x.pers = (x.pers || 0) * (strat ? 0.7 : 0.8);
  for (const c of IDS) if (c !== me) addRel(S, me, c, strat ? -70 : -40);
  mine.stab = clamp(mine.stab - (strat ? 20 : 10), 0, 100); x.flags.nukedAt = S.turn;
  S.globalMod.push({ g: strat ? -0.8 : -0.3, turns: 4 }); S.tension = 100;
  if (!atWar(S, me, boss(S, t))) declareWar(S, me, boss(S, t));
  const msg = M(strat ? 'm.nuke.strat' : 'm.nuke.tac', { a: me, t });
  logEvent(S, 'nuke', msg, 'bad', [me, t]);
  const hh = [me, t].filter(v => isHuman(S, v)); for (const H of hh) RP(S, H, R).mil.push({ actor: me, msg, tone: 'bad', big: true, about: [t] }); if (!hh.length) R.world.push({ actor: me, msg, tone: 'bad', big: true, about: [t] });
  pushEv(S, { type: 'nuke', actor: me, target: t, sev: 100, third: 60, big: true });
  if (isHuman(S, me)) { const rp = seatOf(S, me).rep; rp.nuke = true; rp.aggr = clamp(rp.aggr + 40, 0, 100); rp.trust = clamp(rp.trust - 25, 0, 100); }
  for (const c of IDS) if (c !== me && indep(S, c) && DEF[c].gov !== 'aut' && !isAlly(S, c, me)) addSanction(S, c, me, 'econ', 3);
  const ret = [];
  if (x.nukes >= 5 && indep(S, t)) ret.push([t, 0.85]);
  for (const c of IDS) if (c !== t && c !== me && S.actors[c].nukes > 50 && indep(S, c) && isAlly(S, c, t)) ret.push([c, (strat ? 0.8 : 0.45) * S.actors[c].loyal + 0.1]);
  let big = false;
  for (const [c, p] of ret) {
    if (!chance(S, p)) continue;
    const y = S.actors[c]; const m = Math.min(y.nukes, strat ? Math.max(20, Math.round(y.nukes * 0.12)) : 5); y.nukes -= m;
    mine.land *= strat ? 0.7 : 0.65; mine.air *= 0.7; mine.navy *= 0.8; mine.gdp *= strat ? 0.65 : 0.94; mine.stab = clamp(mine.stab - (strat ? 30 : 12), 0, 100);
    if (!atWar(S, c, me)) declareWar(S, c, me);
    const rm = M('m.nuke.ret', { a: c, t: me });
    logEvent(S, 'nuke', rm, 'bad', [c, me]);
    const h2 = [me, c].filter(v => isHuman(S, v)); for (const H of h2) RP(S, H, R).mil.push({ actor: c, msg: rm, tone: 'bad', big: true, about: [me] }); if (!h2.length) R.world.push({ actor: c, msg: rm, tone: 'bad', big: true, about: [me] });
    if (strat && DEF[c].nukes >= 1000 && DEF[me].nukes >= 1000) big = true;
    if (strat && chance(S, 0.35) && y.nukes > 200 && mine.nukes > 200) big = true;
  }
  if (big) S.over = { result: 'apocalypse', reason: M('over.apocalypse') };
}
