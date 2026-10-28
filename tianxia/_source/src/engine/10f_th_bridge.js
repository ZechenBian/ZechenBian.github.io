// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 精细战区 ↔ 国家战略：衔接层 =====================
 * 一、占领区影响国力：按区格的人口与工业权重（剧本数据 econ），计算每个地区被其宗主国的敌人控制的份额。
 *     与基线相比，本国的财政、工业产能与兵源按仍在手中的份额折算；占领者按新占的份额得到一部分
 *     （财政 25%，工业按战略层对占领区的同一系数 weOccInd，兵源 3%）。基线按剧本数据推算（thOccBase）：
 *     开局已有的占领（如 1939 年日本占领的华北、华东）计入基线；地区被征服、宗主换人后基线归零。
 * 所有函数在没有精细战区（单机版、S.th 不存在）时返回 1 或 0，不改变任何结果。
 */
const TH_ECO_W = [0.4, 0.6]; // 经济份额 = 0.4 × 人口份额 + 0.6 × 工业份额
function thEconZ(T) { // 各区格的 [人口, 工业] 与参与地区的合计（静态，缓存在 thStatic 上）
  const ST = thStatic(T); if (!ST) return null; if (ST._eco) return ST._eco;
  const D = TH_DATA[T], regs = (D.econRegs || []).slice(), E = D.econ || {}, part = new Set(D.econPart || []);
  const z = ST.zones.map(zz => { if (!regs.includes(zz.r)) return null; const e = E[zz.id]; return [e && e[0] != null ? e[0] : zz.pop || 0, e ? e[1] : zz.pop >= 3 ? 0.1 : zz.pop > 0 ? 0.05 : 0]; });
  const tot = {};
  for (const R of regs) { let p = 0, i = 0; ST.zones.forEach((zz, k) => { if (zz.r === R && z[k]) { p += z[k][0]; i += z[k][1]; } }); tot[R] = part.has(R) ? [Math.max(p, (DEF[R] && DEF[R].pop) || p, 0.1), Math.max(i, 100)] : [Math.max(p, 0.1), Math.max(i, 0.1)]; }
  return (ST._eco = { z, tot, regs });
}
/* 当前的占领份额：{ 地区: { pop, ind, eco, by: { 占领者: [pop, ind, eco] }, z: [被占区格...] } } */
function thOccNow(S) {
  const out = {};
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T], ST = thStatic(T), E = thEconZ(T); if (!E) continue;
    for (const R of E.regs) {
      if (!S.actors[R]) continue; const B = boss(S, R), [pT, iT] = E.tot[R];
      const o = out[R] = out[R] || { pop: 0, ind: 0, eco: 0, by: {}, z: [] };
      ST.zones.forEach((z, k) => {
        if (z.r !== R || !E.z[k]) return; const c = TS.zc[k]; if (!c || c === B || !thHostile(S, B, c)) return;
        const p = E.z[k][0] / pT, i = E.z[k][1] / iT, e = TH_ECO_W[0] * p + TH_ECO_W[1] * i;
        o.pop += p; o.ind += i; o.eco += e; const b = o.by[c] = o.by[c] || [0, 0, 0]; b[0] += p; b[1] += i; b[2] += e; o.z.push(k);
      });
    }
  }
  return out;
}
/* 基线：宗主是地区本身时，为剧本开局的占领（TH_DATA.*.occ）中仍与之敌对的部分；被征服、成为他国控制区（宗主换人）后为 0
 * （征服时全境易手，此后被新宗主的敌人夺去的区格才算损失）。由静态数据推算，与存档的年代无关。 */
function thOccBase(S) {
  const out = {};
  for (const T of thTheaters(S)) {
    const D = TH_DATA[T], ST = thStatic(T), E = thEconZ(T); if (!E) continue;
    for (const R of E.regs) {
      if (!S.actors[R]) continue; const B = boss(S, R), [pT, iT] = E.tot[R];
      const o = out[R] = out[R] || { b: B, pop: 0, ind: 0, eco: 0, by: {} }; if (B !== R || !D.occ) continue;
      ST.zones.forEach((z, k) => {
        const c = D.occ[z.id]; if (z.r !== R || !E.z[k] || !c || c === R || !S.actors[c] || !thHostile(S, R, c)) return;
        const p = E.z[k][0] / pT, i = E.z[k][1] / iT, e = TH_ECO_W[0] * p + TH_ECO_W[1] * i;
        o.pop += p; o.ind += i; o.eco += e; const b = o.by[c] = o.by[c] || [0, 0, 0]; b[0] += p; b[1] += i; b[2] += e;
      });
    }
  }
  return out;
}
/* 季度末（thEnd）与开局时调用：S.th.occ 为当前的占领，S.th.occB 为基线；R 给出时向真人玩家报告明显的变化 */
function thOccUpdate(S, R) {
  if (!S.th) return;
  const r4 = x => Math.round(Math.min(1, Math.max(0, x)) * 1e4) / 1e4, pack = o => { const q = { pop: r4(o.pop), ind: r4(o.ind), eco: r4(o.eco), by: {} }; for (const [c, b] of Object.entries(o.by)) q.by[c] = b.map(r4); return q; };
  const occ = {}, occB = {};
  for (const [Rg, o] of Object.entries(thOccNow(S))) { occ[Rg] = pack(o); occ[Rg].n = o.z.length; }
  for (const [Rg, o] of Object.entries(thOccBase(S))) { occB[Rg] = pack(o); occB[Rg].b = o.b; }
  const prev = S.th.occ; S.th.occ = occ; S.th.occB = occB; delete S.th.occ0;
  if (!S.th.occP) S.th.occP = JSON.parse(JSON.stringify(occ)); // 民心士气按季度比较的起点
  if (R && prev) for (const H of humansOf(S)) { // 本国工业或兵源因占领变化 ≥3 个百分点、或占领收益明显变化时报告
    const q0 = prev[H], q1 = occ[H], dI = (q1 ? q1.ind : 0) - (q0 ? q0.ind : 0), dP = (q1 ? q1.pop : 0) - (q0 ? q0.pop : 0), lost = dI + dP > 0;
    if (Math.abs(dI) >= 0.03 || Math.abs(dP) >= 0.03) RP(S, H, R).mil.push({ msg: M(lost ? 'th.occ.r_lost' : 'th.occ.r_back', { a: { pct: Math.max(0, lost ? dI : -dI) }, b: { pct: Math.max(0, lost ? dP : -dP) }, x: { pct: Math.max(0, 1 - thOccK(S, H, 'ind')) } }), tone: lost ? 'bad' : 'good' });
    let dg = 0; for (const [Rg, q] of Object.entries(occ)) { if (Rg === H) continue; const b = q.by[H], p0 = prev[Rg] && prev[Rg].by[H]; dg += ((b ? b[1] : 0) - (p0 ? p0[1] : 0)) * (S.actors[Rg] ? S.actors[Rg].gdp : 0); }
    if (Math.abs(dg) >= S.actors[H].gdp * 0.02) RP(S, H, R).mil.push({ msg: M(dg > 0 ? 'th.occ.r_gain' : 'th.occ.r_gloss', { m: { m: Math.abs(dg) * weOccInd(S, H) } }), tone: dg > 0 ? 'good' : 'bad' });
  }
}
/* 地区 R 自身的经济（eco）、工业（ind）或人口（pop）相对基线还能用多少；没有精细战区时恒为 1 */
function thOccK(S, R, k) {
  const th = S.th; if (!th || !th.occ) return 1; const o = th.occ[R]; if (!o) return 1;
  const o0 = th.occB && th.occB[R]; if (o0 && o0.b != null && o0.b !== boss(S, R)) return 1; // 宗主刚换人（季度中途的媾和、征服）：等下一次更新
  const a = o[k] || 0, a0 = o0 ? o0[k] || 0 : 0; if (a === a0) return 1;
  return clamp((1 - a) / Math.max(0.05, 1 - a0), 0.05, 1.6);
}
/* 占领者 X 从（相对开局）新占领的区格得到的财政（fis）、工业（ind，按 GDP 计）与兵源（man，百万人）；失去开局占有的区格时为负；没有精细战区时恒为 0 */
function thOccGain(S, X, k) {
  const th = S.th; if (!th || !th.occ) return 0; let g = 0;
  for (const [R, o] of Object.entries(th.occ)) {
    if (R === X || boss(S, R) === X) continue; const t = S.actors[R]; if (!t) continue;
    const b = o.by[X], b0 = th.occB && th.occB[R] && th.occB[R].by[X]; if (!b && !b0) continue;
    const d = i => (b ? b[i] : 0) - (b0 ? b0[i] : 0);
    if (k === 'fis') g += t.gdp * d(2) * 0.25; else if (k === 'ind') g += t.gdp * d(1) * weOccInd(S, X); else if (k === 'man') g += (DEF[R].pop + (t.popX || 0)) * d(0) * 0.03;
  }
  if (g < 0) { const x = S.actors[X], cap = k === 'man' ? (DEF[X].pop + (x.popX || 0)) * 0.2 : x.gdp * 0.3; g = Math.max(g, -cap); }
  return g;
}
/* 界面：某国因占领区得失的国力变化 */
function thOccInfo(S, X) {
  if (!S.th || !S.th.occ) return null;
  const own = { pop: thOccK(S, X, 'pop'), ind: thOccK(S, X, 'ind'), eco: thOccK(S, X, 'eco') }, o = S.th.occ[X], o0 = S.th.occB && S.th.occB[X];
  const lost = [];
  if (o) for (const T of thTheaters(S)) { const TS = S.th.T[T], ST = thStatic(T), E = thEconZ(T); if (!E || !E.regs.includes(X)) continue; const B = boss(S, X); ST.zones.forEach((z, k) => { if (z.r === X && E.z[k] && TS.zc[k] && TS.zc[k] !== B && thHostile(S, B, TS.zc[k])) lost.push({ T, z: k, c: TS.zc[k], ind: +(E.z[k][1] / E.tot[X][1]).toFixed(3), pop: +E.z[k][0].toFixed(2) }); }); }
  lost.sort((a, b) => b.ind - a.ind);
  const gain = { fis: thOccGain(S, X, 'fis'), ind: thOccGain(S, X, 'ind'), man: thOccGain(S, X, 'man') }, gz = [];
  for (const [R, q] of Object.entries(S.th.occ)) { const b = q.by[X], b0 = S.th.occB && S.th.occB[R] && S.th.occB[R].by[X]; const d = (b ? b[2] : 0) - (b0 ? b0[2] : 0); if (Math.abs(d) >= 0.002 && R !== X && boss(S, R) !== X) gz.push({ R, eco: +d.toFixed(3), ind: +((b ? b[1] : 0) - (b0 ? b0[1] : 0)).toFixed(3) }); }
  return { own, occ: o ? { pop: o.pop, ind: o.ind, eco: o.eco } : null, occ0: o0 ? { pop: o0.pop, ind: o0.ind, eco: o0.eco } : null, lost: lost.slice(0, 12), nLost: lost.length, gain, gz };
}

/* ===================== 二、战略决策落到战区 =====================
 * 主攻方向：战略层给战线指定的主攻城市（setFrontFocus）所在的区格成为战区 AI 的首要目标；在那里作战的进攻方战力 +8%、伤亡 +15%（与战略层的规则一致）。
 * 死守：守方玩家指定死守的城市（setHold）所在区格的守军战力 +6%、伤亡 +15%，参谋 AI 向那里多派守军。
 * 空中支援：战略层“空中支援”本回合投入的空中力量计入该国在战区的空中份额（制空、近距支援、空中封锁）。
 * 两栖登陆：战略层对战区内地区发动的两栖作战，在季度第一阶段开始时由战区实施——有制海权才能上岸，从出发地区（或沿海港口）抽调部队在防守最弱的海岸区格登陆。
 * 停止进攻：玩家叫停的攻势在 4 个季度内不会被战区自动补建（不再让参谋 AI 继续进攻）。
 * 战略轰炸：历史剧本中对敌国本土的战略轰炸同时削弱其在战区内补给基地的吞吐量。 */
function thCityZones(T, R, i) { const ST = thStatic(T), out = []; for (const z of ST.zones) if (z.ct.some(([r, j]) => r === R && j === i)) out.push(z.i); return out; }
function thFocusZ(S, T, C) { // 不缓存：玩家在规划阶段随时可能改动主攻方向
  const out = new Set(); for (const f of S.fronts) { if (f.th !== T || f.focus == null || (f.taken || []).includes(f.focus)) continue; if (f.att !== C && !(f.co || []).some(q => q.id === C)) continue; for (const z of thCityZones(T, f.target, f.focus)) out.add(z); }
  return out;
}
function thHoldZ(S, T, C) {
  const out = new Set(), ST = thStatic(T);
  for (const R of ST.regs) { if (!S.actors[R]) continue; const B = boss(S, R); if (B !== C && !thFr(S, C, B)) continue; const i = holdOf(S, R); if (i != null) for (const z of thCityZones(T, R, i)) out.add(z); }
  return out;
}
const thPoolShare = (T, C, L) => { const cfg = TH_DATA[T].pool && TH_DATA[T].pool[C]; return cfg ? cfg[L] || 0 : thStatic(T).regs.includes(L) ? 1 : 0; }; // 某地的兵力有多少已经算在战区里
function thAirBoost(S, T, C) { // 只计入原本不在战区里的那部分空军（本土与战区之外的基地）
  let a = 0;
  for (const f of S.fronts) { if (f.th !== T) continue; if (f.att === C && f.sup === S.turn) for (const q of f.supL || []) a += (+q[1] || 0) * (1 - thPoolShare(T, C, q[0])); if (f.dsupBy === C && f.dsup === S.turn) for (const q of f.dsupL || []) a += (+q[1] || 0) * (1 - thPoolShare(T, C, q[0])); }
  return a;
}
function thAirSupLoss(S) { // 季度末：战区里的空中支援与战略层一样有飞机损失（战区战线不经过战略层的 supportStrike）
  const tk = sc().tempo || 1;
  for (const f of S.fronts) {
    if (!f.th) continue;
    for (const [X, list] of [[f.att, f.sup === S.turn ? f.supL : null], [f.dsupBy, f.dsup === S.turn ? f.dsupL : null]]) {
      if (!X || !list || !S.actors[X]) continue;
      for (const [L, a] of list) { const v = Math.min(+a || 0, freeV(S, X, L)[2]); if (v > 0.002) attrit(S, X, L, [0, 0, 0.03 * tk], { v: [0, 0, v] }); }
    }
  }
}
function thBombK(S, C) {
  if (!sc().noIdlePeace || !S.actors[C] || !indep(S, C) || !isGreat(S, C)) return 1;
  const c = thC(S), k = 'bk' + C; if (c[k] != null) return c[k];
  let m = 1; for (const E of enemies(S, C)) { if (isHuman(S, E) || !indep(S, E) || !isGreat(S, E) || (S.war[rk(C, E)] || {}).limited) continue; /* 与战略层一致：只有 AI 国家实施战略轰炸 */ const sp = strikePower(S, E, C); if (sp < 20) continue; m *= 1 - 0.07 * clamp(sp / (airEff(S, C) * 0.35 + 1), 0, 3); }
  return (c[k] = clamp(m, 0.6, 1));
}
function thAmphLand(S, T, TS, ST) {
  for (const f of S.fronts) {
    if (f.th !== T || f.kind !== 'amph') continue;
    const C = f.att, Rg = f.target, D = boss(S, Rg); if (!S.actors[C] || !indep(S, C) || !D || D === C || !atWar(S, C, D)) continue;
    const zs = ST.zones.filter(z => z.r === Rg); if (!zs.length) continue;
    if (zs.some(z => { const c = TS.zc[z.i]; return c && c !== D && thFr(S, C, c); }) || TS.units.some(u => thFr(S, C, u.c) && zs.some(z => z.i === u.z))) continue; // 已有滩头或部队已经上岸
    if (f.thLand != null && S.turn - f.thLand < 2) continue; // 登陆失败后隔一个季度再试
    if (!thSeaLink(S, T, C)) { f.thNoSea = S.turn; continue; } // 没有制海权
    const quiet = u => !ST.adj[u.z].some(([o, k]) => ST.edges[k].kind !== 'sea' && thHostile(S, C, TS.zc[o]));
    const pick = TS.units.filter(u => u.c === C && !TT[u.t].fix && !TT[u.t].gue && !thAux(u) && !u.lk && u.ord.k !== 'evac' && u.s >= 0.45 && u.o >= 0.45 && thFr(S, C, TS.zc[u.z]) && (ST.zones[u.z].r === f.from || ST.zones[u.z].port) && quiet(u))
      .sort((a, b) => (ST.zones[b.z].r === f.from) - (ST.zones[a.z].r === f.from) || ustr(b) - ustr(a));
    const go = pick.slice(0, clamp(Math.round(3 + 14 * ((f.v && f.v[0]) || 0.3)), 3, 12)); if (!go.length) continue;
    const cx = go.reduce((s, u) => s + ST.zones[u.z].x, 0) / go.length, cy = go.reduce((s, u) => s + ST.zones[u.z].y, 0) / go.length, foc = thFocusZ(S, T, C);
    let best = null, bs = -1e9;
    for (const z of zs) {
      if (!z.coast || z.imp || !thHostile(S, C, TS.zc[z.i])) continue;
      const d = thEst(S, T, TS, C, z.i).d * terOf(z.t).def * (1 + 0.4 * thFortAt(TS, z.i));
      const seaIn = ST.adj[z.i].some(([o, k]) => ST.edges[k].kind === 'sea' && thFr(S, C, TS.zc[o])); // 与己方港口有直达航线：后续兵力可以直接海运上岸（安特卫普要经斯海尔德河口，不算）
      const sc0 = (z.port ? 1.5 : 0) + (seaIn ? 2 : 0) + Math.max(0.5, z.vp) * 0.3 + (foc.has(z.i) ? 3 : 0) - d * 0.5 - Math.hypot(z.x - cx, z.y - cy) * 0.04;
      if (sc0 > bs) { bs = sc0; best = z.i; }
    }
    if (best == null) continue;
    for (const u of go) { u.z = best; u.mv = 0; u.o = Math.min(Math.max(u.o, docOf(C).om * 0.85), 0.8); u.en = 0; u.ld = S.turn; u.ldD = S.th.day; u.ord = { k: 'hold' }; delete u.nx; } // 登陆部队经过集结整训；ld：本季度登陆（无人防守时直接占领滩头）
    f.thLand = S.turn; (TS._bh = TS._bh || {})[best] = C;
    if (TS._pev) TS._pev.push({ k: 'land', z: best, c: C, d: S.th.day, n: go.length });
  }
}
const thBeachhead = (S, T, C, Rg) => S.fronts.some(f => f.th === T && f.kind === 'amph' && f.target === Rg && (f.att === C || (f.co || []).some(k => k.id === C)) && f.thLand != null && S.turn - f.thLand <= 6);
const thHalted = (S, A, Rg) => { const h = S.th && S.th.halt && S.th.halt[A + '>' + Rg]; return h != null && S.turn - h <= 4; };

/* ===================== 三、战区结果驱动战略 =====================
 * 参战的时机：剧本数据 join 列出的国家（如意大利）在战区局势达到条件时才宣战（1940 年 6 月 10 日，法国战败已成定局时），
 *   每个作战阶段结束时检查，季度内即可参战；条件不满足就一直观望到期限。
 * 民心士气：每个季度末按战区里的伤亡（相对人口）、本土失地或收复、首都失守、成建制投降与重大胜利调整稳定度（每季度 −10…+4）。
 * Claude 智能体：世界简报里加入上一季度各战区的战果摘要（thWorldBrief）。 */
function thStratOut(S, R) {
  for (const T of thTheaters(S)) for (const j of (TH_DATA[T].join || [])) {
    const done = S.th.joined = S.th.joined || {}; if (done[j.id]) continue;
    const t = S.year * 4 + S.q; if (t < j.y0 * 4 + j.q0 || t > j.y1 * 4 + j.q1) continue;
    const A = j.a; if (!S.actors[A] || !indep(S, A)) { done[j.id] = S.turn; continue; }
    if (j.cond && !evCond(S, j.cond)) continue;
    done[j.id] = S.turn;
    const msg = j.msg ? M(j.msg) : null;
    if (isHuman(S, A)) { if (msg && R) RP(S, A, R).toYou.push({ actor: A, msg: M('ev.hist_you', { x: msg }), tone: 'info', big: true }); continue; } // 玩家扮演的国家：只提示历史上此时的选择
    const tg = [].concat(j.to).filter(X => S.actors[X] && indep(S, X) && X !== A && !atWar(S, A, X) && !isAlly(S, A, X));
    for (const X of tg) { declareWar(S, A, X); logEvent(S, 'war', M('m.war', { a: A, b: X }), 'warn', [A, X]); pushEv(S, { type: 'declare', actor: A, target: X, sev: 50, third: 15, big: true }); if (isHuman(S, X)) withSeat(S, X, () => grantCB(S, A, 'attacked', 20)); }
    if (tg.length) { S.actors[A].mob = Math.max(S.actors[A].mob, 2); thResetCache(S); if (msg && R) { const it = { actor: A, msg, tone: 'warn', big: true, about: tg }; const hh = tg.filter(X => isHuman(S, X)); for (const H of hh) RP(S, H, R).toYou.push(it); if (!hh.length) R.world.push(it); } logEvent(S, 'event', msg || M('m.war', { a: A, b: tg[0] }), 'warn', [A].concat(tg)); }
  }
}
function thMorale(S, R) {
  const occ = S.th.occ || {}, d = {};
  const add = (C, v, why) => { if (!S.actors[C] || !indep(S, C) || !v) return; const o = d[C] = d[C] || { v: 0, why: [] }; o.v += v; if (why && !o.why.includes(why)) o.why.push(why); };
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T], ST = thStatic(T), E = thEconZ(T);
    for (const [C, l] of Object.entries(TS.lossT || {})) { const p = DEF[C] ? (DEF[C].pop + (S.actors[C].popX || 0)) * 1000 : 0; if (p > 0 && l.men > 0) add(C, -Math.min(6, 120 * l.men / p) * GOVW[DEF[C].gov], 'cas'); }
    const sur = {}; for (const e of TS.qev || []) if (e.k === 'sur' && e.c) sur[e.c] = (sur[e.c] || 0) + 1;
    for (const [C, n] of Object.entries(sur)) if (n >= 5) add(C, -Math.min(3, n / 5), 'sur');
    for (const z of ST.zones) { if (!z.cap) continue; const R0 = z.r, B = S.actors[R0] ? boss(S, R0) : null; if (!B || B !== R0) continue; const c = TS.zc[z.i]; if (c && c !== B && thHostile(S, B, c) && (TS.qev || []).some(e => e.k === 'cap' && e.z === z.i)) add(R0, -5, 'cap'); }
  }
  const prev = S.th.occP || {};
  for (const [R0, q] of Object.entries(occ)) { const p = prev[R0], dE = q.eco - (p ? p.eco : q.eco); if (Math.abs(dE) < 0.01) continue; add(R0, dE > 0 ? -10 * dE : 6 * -dE, dE > 0 ? 'lost' : 'back'); for (const [X, b] of Object.entries(q.by)) { const b0 = p && p.by[X], g = b[2] - (b0 ? b0[2] : 0); if (g > 0.01) add(X, Math.min(3, 6 * g), 'win'); } }
  S.th.occP = JSON.parse(JSON.stringify(occ));
  for (const [C, o] of Object.entries(d)) {
    const v = clamp(o.v, -10, 4); if (Math.abs(v) < 0.3) continue; const x = S.actors[C]; x.stab = clamp(x.stab + v, 0, 100);
    if (R && isHuman(S, C)) RP(S, C, R).pol.push({ msg: M(v < 0 ? 'th.mor.down' : 'th.mor.up', { n: Math.abs(v).toFixed(1), x: { list: o.why.map(w => M('th.mor.' + w)) } }), tone: v < 0 ? 'bad' : 'good' });
  }
}
function thWorldBrief(S) {
  if (!S.th) return '';
  const out = [], nm = C => (DEF[C] ? DEF[C].en : C);
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T], ST = thStatic(T), L = (TS.phr || []).filter(Boolean); if (!L.length) continue;
    const caps = []; for (const r of L) for (const c of r.cap) { const z = ST.zones[c[0]]; if (z && (z.vp >= 3 || z.cap) && caps.length < 8) caps.push(`${nm(c[1])} took ${z.en.replace(/\s*\(.*$/, '')}`); }
    const loss = {}; for (const r of L) for (const [C, v] of Object.entries(r.loss || {})) loss[C] = (loss[C] || 0) + v[0];
    const enc = {}; for (const r of L) for (const q of ((r.ev.enc || {}).z || [])) if (q[1]) enc[q[1]] = (enc[q[1]] || 0) + 1;
    const fr = S.fronts.filter(f => f.th === T).map(f => `${nm(f.att)}→${nm(f.target)} ${Math.round(f.progress)}%`);
    const lz = Object.entries(loss).filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([C, v]) => `${nm(C)} ~${Math.round(v)}k`);
    out.push(`${TH_DATA[T].name[1]} (${L.length} phases): ${caps.join('; ') || 'no major towns changed hands'}${lz.length ? '; losses ' + lz.join(', ') : ''}${Object.keys(enc).length ? '; encircled: ' + Object.keys(enc).map(nm).join(', ') : ''}${fr.length ? '; fronts ' + fr.join(', ') : ''}`);
  }
  return out.join(' | ');
}
