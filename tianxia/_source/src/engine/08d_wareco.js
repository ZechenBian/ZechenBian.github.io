// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 战时经济（联机版）：以战养战与极限暴兵 =====================
 * 每个国家可以启用若干战时政策（0–3 级），每季度结算收益与代价；另有一次性的“极限暴兵”措施，立即生效。
 *  · 战争公债：筹钱、累积国债与利息        · 印钞（赤字货币化）：筹钱快，通胀高
 *  · 强制征用与配给：筹钱并提高军工产能，拖累经济与稳定
 *  · 掠夺占领区（以战养战）：从占领区抽取财富与原油、提高对其工业的利用，抵抗与国际声誉恶化
 *  · 占领区征兵（仆从军）：从占领区人口补充兵员，抵抗加剧
 *  · 强迫劳动：提高军工产能、缓解劳动力短缺，占领区抵抗与声誉代价
 *  · 总体战动员：兵员上限、军费上限、军工吸收能力都大幅提高，经济、稳定与厌战代价沉重
 * 代价倍率 S.weCfg（通胀、稳定、抵抗、声誉、利息、收益）由房主在开局时设定。
 * 只有启用过战时政策或措施的国家才有 x.we；单人版从不触发，结果逐位不变。 */
const WE_KEYS = ['bonds', 'print', 'requis', 'plunder', 'levy', 'forced', 'total'];
const WE_ACTS = ['draft', 'crash', 'seize', 'loot', 'press'];
const WE_DEF = {
  bonds: { inc: [0, 0.006, 0.012, 0.02], infl: [0, 0.6, 1.2, 2.5], credit: [0, 0.1, 0.2, 0.3] },
  print: { inc: [0, 0.01, 0.025, 0.05], infl: [0, 4, 10, 25], credit: [0, 0.15, 0.3, 0.5] },
  requis: { inc: [0, 0.008, 0.016, 0.025], ind: [1, 1.03, 1.06, 1.1], g: [0, 0.3, 0.7, 1.2], stab: [0, 0.5, 1.2, 2], weary: [0, 0.5, 1, 2], proc: [0, 0.3, 0.6, 1] },
  plunder: { inc: [0, 0.015, 0.03, 0.05], drain: [0, 0.005, 0.01, 0.02], resist: [0, 2, 4, 7], oil: [0.45, 0.6, 0.75, 0.9], ind: [0.15, 0.22, 0.3, 0.4], rep: [0, 0.5, 1, 2] },
  levy: { pers: [0, 0.0005, 0.001, 0.002], resist: [0, 2, 4, 6], rep: [0, 0.2, 0.4, 0.8] },
  forced: { ind: [1, 1.06, 1.12, 1.2], labor: [1, 0.85, 0.7, 0.55], resist: [0, 2, 4, 6], rep: [0, 0.5, 1, 1.5] },
  total: { pcap: [1, 1.12, 1.25, 1.4], mil: [0, 40, 55, 70], mcap: [1, 1.08, 1.16, 1.25], g: [0, 0.3, 0.8, 1.5], stab: [0, 0.5, 1, 2], weary: [0, 1, 2.5, 4], proc: [0, 0.5, 1, 1.5] },
};
const WE_CFG0 = { infl: 1, stab: 1, resist: 1, rep: 1, interest: 1, gain: 1 };
const weCfg = S => S.weCfg || WE_CFG0;
const weLv = (x, k) => (x && x.we && x.we.p[k]) | 0;
function weInit(x) { if (!x.we) x.we = { p: {}, debt: 0, infl: 0, weary: 0, cool: {}, levied: {}, last: null, lastCas: x.cas || 0 }; return x.we; }
const occOf = (S, X) => IDS.filter(T => T !== X && S.actors[T].ctrl === X && !S.actors[T].integrated);

/* ---------- 挂到既有模型上的修正（未启用时一律返回中性值） ---------- */
function weCapK(S, X) { const x = S.actors[X]; return x.we ? WE_DEF.total.pcap[weLv(x, 'total')] : 1; }
function weIndK(S, X) { const x = S.actors[X]; return x.we ? WE_DEF.forced.ind[weLv(x, 'forced')] * WE_DEF.requis.ind[weLv(x, 'requis')] * WE_DEF.total.mcap[weLv(x, 'total')] : 1; }
function weOccInd(S, X) { const x = S.actors[X]; return x.we ? WE_DEF.plunder.ind[weLv(x, 'plunder')] : 0.15; }
function weOccOil(S, X) { const x = S.actors[X]; return x.we ? WE_DEF.plunder.oil[weLv(x, 'plunder')] : 0.45; }
function weLaborK(S, X) { const x = S.actors[X]; return x.we ? WE_DEF.forced.labor[weLv(x, 'forced')] : 1; }
function weCredit(S, X) { const x = S.actors[X]; return x.we ? WE_DEF.bonds.credit[weLv(x, 'bonds')] + WE_DEF.print.credit[weLv(x, 'print')] : 0; }
function weMilCap(S, X) { const x = S.actors[X]; return x.we ? WE_DEF.total.mil[weLv(x, 'total')] : 0; }
function weProcK(S, X) { const x = S.actors[X]; return x.we ? 1 + WE_DEF.total.proc[weLv(x, 'total')] + WE_DEF.requis.proc[weLv(x, 'requis')] : 1; }
function weGrowthPen(S, X) { // 季度增长率损失（百分点）
  const x = S.actors[X], we = x.we; if (!we) return 0;
  return WE_DEF.requis.g[weLv(x, 'requis')] + WE_DEF.total.g[weLv(x, 'total')] + Math.max(0, we.infl) * 0.015 + (we.infl > 60 ? 1 : 0);
}
function weStabPen(S, X) {
  const x = S.actors[X], we = x.we; if (!we) return 0; const c = weCfg(S);
  return (WE_DEF.requis.stab[weLv(x, 'requis')] + WE_DEF.total.stab[weLv(x, 'total')]) * c.stab + we.weary * 0.04 + Math.max(0, we.infl - 20) * 0.04;
}

/* ---------- 声誉代价：民主国家与同情被占领者的国家疏远；真人席位信誉下降 ---------- */
function weRepHit(S, X, k, occ) {
  if (!(k > 0)) return;
  for (const D of IDS) { if (D === X || !indep(S, D)) continue; const dem = DEF[D].gov === 'dem', fr = (occ || []).some(T => rel(S, D, T) > 30); if (dem || fr) addRel(S, X, D, -k * (dem && fr ? 1 : 0.5)); }
  if (isHuman(S, X)) { const sb = seatOf(S, X); if (sb && sb.rep) { sb.rep.trust = clamp(sb.rep.trust - k * 0.5, 0, 100); sb.rep.aggr = clamp(sb.rep.aggr + k * 0.3, 0, 100); } }
}

/* ---------- 预估（界面与 Claude 共用）：某项政策在某一级别下每季度的收益与代价 ---------- */
function weEstimate(S, X, k, L) {
  const x = S.actors[X], c = weCfg(S), g = x.gdp, occ = occOf(S, X), d = WE_DEF[k]; if (!d) return null;
  const e = { k, L, money: 0, ind: 1, pers: 0, oil: 0, debt: 0, infl: 0, g: 0, stab: 0, weary: 0, resist: 0, rep: 0, pcap: 1, mil: 0 };
  switch (k) {
    case 'bonds': e.money = g * d.inc[L] * c.gain; e.debt = e.money; e.infl = d.infl[L] * c.infl; break;
    case 'print': e.money = g * d.inc[L] * c.gain; e.infl = d.infl[L] * c.infl; break;
    case 'requis': e.money = g * d.inc[L] * c.gain; e.ind = d.ind[L]; e.g = d.g[L]; e.stab = d.stab[L] * c.stab; e.weary = d.weary[L]; break;
    case 'plunder': e.money = occ.reduce((s, T) => s + S.actors[T].gdp * d.inc[L], 0) * c.gain; e.resist = d.resist[L] * c.resist; e.rep = d.rep[L] * c.rep; e.oil = occ.reduce((s, T) => s + (DEF[T].oil || 0), 0) * (d.oil[L] - d.oil[0]); e.indOcc = d.ind[L]; break;
    case 'levy': e.pers = occ.reduce((s, T) => s + DEF[T].pop * 1000 * d.pers[L], 0); e.resist = d.resist[L] * c.resist; e.rep = d.rep[L] * c.rep; break;
    case 'forced': e.ind = d.ind[L]; e.resist = d.resist[L] * c.resist; e.rep = d.rep[L] * c.rep; break;
    case 'total': e.pcap = d.pcap[L]; e.mil = d.mil[L]; e.ind = d.mcap[L]; e.g = d.g[L]; e.stab = d.stab[L] * c.stab; e.weary = d.weary[L]; break;
  }
  return e;
}
function weView(S, X) {
  const x = S.actors[X], we = x.we, occ = occOf(S, X);
  const pol = {}; for (const k of WE_KEYS) pol[k] = { L: weLv(x, k), est: [0, 1, 2, 3].map(L => weEstimate(S, X, k, L)) };
  const credit = x.gdp * (0.08 + weCredit(S, X));
  return { pol, occ, debt: we ? we.debt : 0, infl: we ? we.infl : 0, weary: we ? we.weary : 0, last: we ? we.last : null, credit, treasury: x.treasury, milCap: Math.max(playerMilMax(), weMilCap(S, X)), cool: we ? Object.assign({}, we.cool) : {}, cfg: Object.assign({}, weCfg(S)), acts: WE_ACTS.map(a => ({ id: a, ok: weActCheck(S, X, a) === null, why: weActCheck(S, X, a), est: weActEstimate(S, X, a) })) };
}

/* ---------- 设定政策（立即生效，收益与代价按季度结算） ---------- */
function setWe(S, X, k, L) {
  if (!WE_KEYS.includes(k) || !S.actors[X] || !indep(S, X)) return null;
  L = clamp(L | 0, 0, 3); const x = S.actors[X];
  if (!x.we && !L) return null;
  const we = weInit(x), a = we.p[k] | 0; if (a === L) return null;
  we.p[k] = L;
  if (k === 'total' && L === 0) { const cap = Math.max(playerMilMax(), weMilCap(S, X)); if (x.milPct > cap) x.milPct = cap; }
  if (L > a && ['plunder', 'levy', 'forced'].includes(k)) pushEv(S, { type: 'atrocity', actor: X, target: occOf(S, X)[0] || null, sev: 10 + 8 * L, third: 6 + 4 * L, hidden: !occOf(S, X).length });
  if (L >= 2 && a < 2 && k === 'total') pushEv(S, { type: 'mobilize', actor: X, target: null, sev: 15, third: 8 });
  const msg = M('we.set', { a: X, k: M('we.k.' + k), b: M('we.lv' + L) });
  logEvent(S, 'weco', msg, L > a ? 'warn' : 'info', [X]);
  return msg;
}

/* ---------- 一次性“极限暴兵”措施 ---------- */
function weActEstimate(S, X, a) {
  const x = S.actors[X], g = x.gdp, c = weCfg(S), occ = occOf(S, X);
  switch (a) {
    case 'draft': { const room = Math.max(0, persCapAt(S, X, 3) * Math.max(1.15, weCapK(S, X)) - (x.pers || 0) - inTraining(S, X)); return { pers: Math.min(room, DEF[X].pop * 1000 * 0.012), stab: 3 * c.stab, weary: 6 }; }
    case 'crash': return { money: -g * 0.03, pts: procPts(S, X, g * 0.03), infl: 2 * c.infl };
    case 'seize': return { money: g * 0.03 * c.gain, stab: 4 * c.stab, g: 0.5, weary: 3 };
    case 'loot': return { money: occ.reduce((s, T) => s + S.actors[T].gdp * 0.08, 0) * c.gain, resist: 15 * c.resist, rep: 3 * c.rep };
    case 'press': return { pers: occ.reduce((s, T) => s + DEF[T].pop * 1000 * 0.004, 0), resist: 10 * c.resist, rep: 1.5 * c.rep };
  }
  return null;
}
function weActCheck(S, X, a) {
  const x = S.actors[X]; if (!WE_ACTS.includes(a) || !indep(S, X)) return M('c.unknown');
  const cd = x.we && x.we.cool[a]; if (cd != null && cd > S.turn) return M('we.cool', { n: cd - S.turn });
  const occ = occOf(S, X);
  if ((a === 'loot' || a === 'press') && !occ.length) return M('we.noocc');
  if (a === 'draft' && weActEstimate(S, X, 'draft').pers < 1) return M('we.nomen');
  if (a === 'crash' && x.treasury - x.gdp * 0.03 < -x.gdp * (0.08 + weCredit(S, X)) - x.gdp * 0.05) return M('c.money');
  return null;
}
function weAction(S, X, a, arg) {
  const bad = weActCheck(S, X, a); if (bad) return { ok: false, reason: bad };
  const x = S.actors[X], we = weInit(x), c = weCfg(S), g = x.gdp, occ = occOf(S, X), e = weActEstimate(S, X, a); let msg;
  switch (a) {
    case 'draft': { // 紧急征召：一部分立即编入（训练不足），其余下季度入列
      const n = Math.round(e.pers), now = Math.round(n * 0.6), per = x.land / Math.max(1, x.pers || 1);
      x.pers = (x.pers || 0) + now; x.land += now * per * 0.15; x.train.push({ n: n - now, eta: S.turn + 1 });
      x.treasury -= n * soldierCost(S, X) * 0.5; x.stab = clamp(x.stab - e.stab, 0, 100); we.weary = clamp(we.weary + 6, 0, 100);
      if (isHuman(S, X)) { const sb = seatOf(S, X); if (sb && sb.pol) sb.pol.fac.pub = clamp(sb.pol.fac.pub - 4, 0, 100); }
      we.cool.draft = S.turn + 2; pushEv(S, { type: 'mobilize', actor: X, target: null, sev: 12, third: 6 });
      msg = M('we.done.draft', { n: fmtK(n), k: fmtK(now) }); break;
    }
    case 'crash': { // 突击生产：超出国库上限的额外订单，下季度交付，推高通胀
      const br = ['land', 'air', 'navy'].includes(arg) ? arg : 'land', amt = g * 0.03, pts = procPts(S, X, amt);
      x.treasury -= amt; x.orders.push({ br, pts, eta: S.turn + 1 }); we.infl += 2 * c.infl; we.cool.crash = S.turn + 1;
      msg = M('we.done.crash', { m: $m(amt), n: Math.round(procUnits(S, X, br, pts)), u: M('unit.' + br) }); break;
    }
    case 'seize': { // 紧急征发：一次性收入，打击经济与民心
      const amt = e.money; x.treasury += amt; x.stab = clamp(x.stab - e.stab, 0, 100); x.mods.push({ g: -0.5, turns: 2, src: 'seize' }); we.weary = clamp(we.weary + 3, 0, 100); we.cool.seize = S.turn + 3;
      msg = M('we.done.seize', { m: $m(amt) }); break;
    }
    case 'loot': { // 洗劫占领区
      let amt = 0; for (const T of occ) { const t = S.actors[T]; amt += t.gdp * 0.08 * c.gain; t.gdp *= 0.95; t.resist = clamp(t.resist + 15 * c.resist, 0, 100); }
      x.treasury += amt; weRepHit(S, X, 3 * c.rep, occ); we.cool.loot = S.turn + 4;
      pushEv(S, { type: 'atrocity', actor: X, target: occ[0], sev: 30, third: 15 });
      msg = M('we.done.loot', { m: $m(amt), x: { list: occ.map(T => ({ id: T })) } }); break;
    }
    case 'press': { // 占领区强征
      let n = 0; for (const T of occ) { const t = S.actors[T], k = DEF[T].pop * 1000 * 0.004; n += k; we.levied[T] = (we.levied[T] || 0) + k; t.resist = clamp(t.resist + 10 * c.resist, 0, 100); }
      const per = x.land / Math.max(1, x.pers || 1); x.pers = (x.pers || 0) + n; x.land += n * per * 0.2; weRepHit(S, X, 1.5 * c.rep, occ); we.cool.press = S.turn + 3;
      pushEv(S, { type: 'atrocity', actor: X, target: occ[0], sev: 20, third: 10 });
      msg = M('we.done.press', { n: fmtK(n) }); break;
    }
  }
  logEvent(S, 'weco', M('we.log', { a: X, x: msg }), 'warn', [X]);
  return { ok: true, msg };
}

/* ---------- 每季度结算 ---------- */
function wecoTurn(S, R) {
  if (S.weAI) weAITurn(S);
  for (const X of IDS) {
    const x = S.actors[X], we = x.we; if (!we) continue;
    if (!indep(S, X)) { we.p = {}; continue; }
    const c = weCfg(S), g = x.gdp, occ = occOf(S, X), L = k => we.p[k] | 0, det = {};
    let inc = 0;
    if (L('bonds')) { const a = g * WE_DEF.bonds.inc[L('bonds')] * c.gain; inc += a; we.debt += a; det.bonds = a; }
    if (we.debt > 0) { const i = we.debt * 0.01 * c.interest; x.treasury -= i; det.interest = -i; if (!L('bonds') && x.treasury > g * 0.02) { const pay = Math.min(we.debt, x.treasury - g * 0.02, g * 0.01); we.debt -= pay; x.treasury -= pay; det.repay = -pay; } }
    if (L('print')) { const a = g * WE_DEF.print.inc[L('print')] * c.gain; inc += a; det.print = a; }
    if (L('requis')) { const a = g * WE_DEF.requis.inc[L('requis')] * c.gain; inc += a; det.requis = a; }
    if (L('plunder') && occ.length) {
      const l = L('plunder'); let a = 0;
      for (const T of occ) { const t = S.actors[T]; a += t.gdp * WE_DEF.plunder.inc[l] * c.gain; t.gdp *= 1 - WE_DEF.plunder.drain[l]; t.resist = clamp(t.resist + WE_DEF.plunder.resist[l] * c.resist, 0, 100); }
      inc += a; det.plunder = a; weRepHit(S, X, WE_DEF.plunder.rep[l] * c.rep, occ);
    }
    if (L('levy') && occ.length) {
      const l = L('levy'); let n = 0;
      for (const T of occ) { const t = S.actors[T], room = Math.max(0, DEF[T].pop * 1000 * 0.03 - (we.levied[T] || 0)), k = Math.min(room, DEF[T].pop * 1000 * WE_DEF.levy.pers[l]); if (k <= 0) continue; n += k; we.levied[T] = (we.levied[T] || 0) + k; t.resist = clamp(t.resist + WE_DEF.levy.resist[l] * c.resist, 0, 100); }
      if (n > 0) { const per = x.land / Math.max(1, x.pers || 1); x.pers = (x.pers || 0) + n; x.land += n * per * 0.25; det.levy = n; weRepHit(S, X, WE_DEF.levy.rep[l] * c.rep, occ); }
    }
    if (L('forced')) { const l = L('forced'); for (const T of occ) S.actors[T].resist = clamp(S.actors[T].resist + WE_DEF.forced.resist[l] * c.resist, 0, 100); weRepHit(S, X, WE_DEF.forced.rep[l] * c.rep, occ); }
    x.treasury += inc; det.income = inc;
    // 通胀：向当前政策决定的目标值靠拢；正的国库被通胀侵蚀
    const tgt = (WE_DEF.bonds.infl[L('bonds')] + WE_DEF.print.infl[L('print')]) * c.infl + (x.treasury < -g * 0.1 ? 4 : 0) + (S.blockades.some(b => b.target === X) ? 3 : 0) + (x.oilShort > 0.2 ? 2 : 0);
    we.infl = clamp(we.infl + (tgt - we.infl) * 0.35, -2, 400);
    if (we.infl > 0 && x.treasury > 0) { const ero = x.treasury * we.infl / 400; x.treasury -= ero; det.erosion = -ero; }
    // 厌战：伤亡、政策与战事
    const dCas = Math.max(0, (x.cas || 0) - (we.lastCas ?? (x.cas || 0))); we.lastCas = x.cas || 0;
    const wp = WE_DEF.requis.weary[L('requis')] + WE_DEF.total.weary[L('total')] + dCas / (DEF[X].pop * 1000) * 400;
    we.weary = clamp(we.weary + wp - (enemies(S, X).length ? 0.5 : 2), 0, 100);
    if (isHuman(S, X)) { const sb = seatOf(S, X); if (sb && sb.pol && we.weary > 30) sb.pol.fac.pub = clamp(sb.pol.fac.pub - (we.weary - 30) * 0.03, 0, 100); }
    // 恶性通胀与厌战的危机
    if (we.infl > 60) { x.stab = clamp(x.stab - 2, 0, 100); if (isHuman(S, X) && (we.hyperAt ?? -9) < S.turn - 3) { we.hyperAt = S.turn; RP(S, X, R).pol.push({ msg: M('we.hyper', { n: Math.round(we.infl) }), tone: 'bad', big: true }); } }
    if (we.weary > 70 && isHuman(S, X) && (we.wearyAt ?? -9) < S.turn - 3) { we.wearyAt = S.turn; RP(S, X, R).pol.push({ msg: M('we.weary_hi', { n: Math.round(we.weary) }), tone: 'bad', big: true }); }
    we.last = det;
    if (isHuman(S, X) && inc > 0) RP(S, X, R).pol.push({ msg: M('we.turn', { m: $m(inc), d: $m(we.debt), n: +we.infl.toFixed(1) }), tone: 'info' });
  }
}
/* AI 采用战时政策（房主可选）：总体战中的大国会发行公债、掠夺占领区、实行总动员；国库见底时印钞 */
function weAITurn(S) {
  for (const X of IDS) {
    if (isHuman(S, X) || !indep(S, X)) continue; const x = S.actors[X];
    const ens = enemies(S, X).filter(E => indep(S, E) && !(S.war[rk(X, E)] || {}).limited); if (!ens.length) { if (x.we) for (const k of WE_KEYS) if (x.we.p[k]) x.we.p[k] = Math.max(0, x.we.p[k] - 1); continue; }
    const big = ens.some(E => isGreat(S, E)) && isGreat(S, X), occ = occOf(S, X), hawk = x.hawk, aut = DEF[X].gov !== 'dem';
    const want = { bonds: big ? 2 : 1, print: x.treasury < -x.gdp * 0.08 ? 1 : 0, requis: big && aut ? 1 : 0, plunder: occ.length ? (aut ? (hawk > 0.6 ? 3 : 2) : 1) : 0, levy: occ.length && aut && hawk > 0.6 ? 1 : 0, forced: occ.length && aut && hawk > 0.7 ? 2 : 0, total: big ? (hawk > 0.6 ? 2 : 1) : 0 };
    weInit(x); for (const k of WE_KEYS) x.we.p[k] = want[k] | 0;
  }
}
