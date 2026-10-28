// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 精细战区（联机版）：区格、师级部队、按天结算 =====================
 * 只有 S.th 存在时才工作（联机版 1939 开局的“精细战区”开关）；单人版构建里没有 TH_DATA，这里的代码永远不会运行。
 * 战略层不变：季度回合。结算时在 prepareTurn 之后、finishTurn 之前插入 thBegin → thPhase ×6（每段 15 天，逐日结算）→ thEnd。
 * 战区接管目标地区在战区内的战线（f.th），回写战线进度、攻克城市、伤亡；达到投降条件时调用原有的 conquer。
 * 兵力与战略层双向同步：战区部队的数量来自战略层驻军份额 × 兵员（每“师当量”的兵员 slice 按开局历史序列标定）；战区损失即时扣减战略层兵力。
 */
const TH_ON = typeof TH_DATA !== 'undefined' && typeof TH_GEO !== 'undefined';
const TH_DAYS = 15, TH_PHASES = 6;
/* 部队类型：w 战略权重（师当量）a 攻击 d 防御 v 行军速度（公里/天）s 每日补给需求 men 兵员（千人）arm 装甲比重 */
const TT = {
  inf: { w: 1, a: 1, d: 1, v: 24, s: 1, men: 15, arm: 0 },
  mot: { w: 1.25, a: 1.15, d: 1.05, v: 46, s: 1.6, men: 15, arm: 0.1 },
  pz: { w: 2.2, a: 2.6, d: 1.3, v: 50, s: 2.6, men: 13, arm: 1 },
  lt: { w: 1.4, a: 1.5, d: 0.95, v: 50, s: 1.8, men: 11, arm: 0.6 },
  cav: { w: 0.7, a: 0.6, d: 0.65, v: 34, s: 0.8, men: 9, arm: 0 },
  mtn: { w: 1, a: 0.95, d: 1.05, v: 20, s: 0.9, men: 13, arm: 0, mtn: 1 },
  fort: { w: 0.6, a: 0.25, d: 1.5, v: 0, s: 0.6, men: 12, arm: 0, fix: 1 },
  para: { w: 0.6, a: 0.9, d: 0.7, v: 20, s: 0.8, men: 5, arm: 0, air: 1 },
  gar: { w: 0.4, a: 0.35, d: 0.6, v: 18, s: 0.5, men: 6, arm: 0 },
  army: { w: 1, a: 1, d: 1, v: 22, s: 0.5, men: 20, arm: 0 },
  jdiv: { w: 1, a: 2.3, d: 2.1, v: 22, s: 1.2, men: 20, arm: 0.1 },
  imb: { w: 0.4, a: 0.7, d: 0.9, v: 20, s: 0.5, men: 6, arm: 0 },
  jtk: { w: 0.5, a: 1.3, d: 0.6, v: 32, s: 1.2, men: 4, arm: 0.8 },
  pup: { w: 0.3, a: 0.3, d: 0.45, v: 20, s: 0.3, men: 10, arm: 0 },
  gue: { w: 1, a: 0.55, d: 0.55, v: 28, s: 0.2, men: 6, arm: 0, gue: 1 },
  mil: { w: 0.3, a: 0.15, d: 0.25, v: 20, s: 0.05, men: 4, arm: 0, gue: 1 },
  kgu: { w: 0.5, a: 0.3, d: 0.4, v: 24, s: 0.2, men: 8, arm: 0, gue: 1 },
};
/* 国家条令：a/d 攻防系数 rec 组织度日恢复 lag 命令迟滞（天）v 机动系数 om 组织度上限 */
const DOC = {
  DEU: { a: 1.12, d: 1, rec: 0.07, lag: 0, v: 1.12, om: 1 },
  FRA: { a: 0.92, d: 1, rec: 0.05, lag: 2, v: 0.9, om: 0.9 },
  GBR: { a: 0.98, d: 1.05, rec: 0.06, lag: 1, v: 1, om: 0.95 },
  BNL: { a: 0.8, d: 0.95, rec: 0.05, lag: 1, v: 0.9, om: 0.85 },
  ITA: { a: 0.78, d: 0.92, rec: 0.05, lag: 1, v: 0.9, om: 0.8 },
  USA: { a: 1.05, d: 1, rec: 0.07, lag: 0, v: 1.1, om: 1 },
  CAN: { a: 1, d: 1, rec: 0.06, lag: 1, v: 1, om: 0.95 },
  JPN: { a: 1.08, d: 1.05, rec: 0.06, lag: 0, v: 1, om: 1 },
  CHN: { a: 0.9, d: 1, rec: 0.05, lag: 1, v: 0.95, om: 0.85 },
  CCP: { a: 0.95, d: 0.9, rec: 0.08, lag: 0, v: 1.15, om: 0.95 },
  RUS: { a: 1, d: 1.05, rec: 0.06, lag: 1, v: 1, om: 0.95 },
};
const docOf = c => DOC[c] || { a: 0.9, d: 0.95, rec: 0.05, lag: 1, v: 0.95, om: 0.85 };
/* 地形：mv 机动 def 防御 cap 道路容量 front 正面宽度（师当量）arm 装甲效能 */
const TER = {
  plain: { mv: 1, def: 1, cap: 1, front: 10, arm: 1.2 },
  hills: { mv: 0.8, def: 1.25, cap: 0.8, front: 7, arm: 0.9 },
  forest: { mv: 0.68, def: 1.35, cap: 0.55, front: 5, arm: 0.7 },
  mount: { mv: 0.45, def: 1.8, cap: 0.4, front: 3.5, arm: 0.5 },
  marsh: { mv: 0.55, def: 1.4, cap: 0.5, front: 4, arm: 0.55 },
  urban: { mv: 0.85, def: 1.5, cap: 0.9, front: 6, arm: 0.6 },
};
const terOf = t => TER[t] || TER.plain;
const uw = u => TT[u.t].w * (u.sz || 1);
const thAux = u => u.ag === 'PP'; // 伪军等附属部队：不计入兵力池，不随战略层同步
const ustr = u => uw(u) * u.s;

/* ---------- 静态数据（区格、边、邻接） ---------- */
const THX = {};
function thStatic(T) {
  if (THX[T]) return THX[T];
  if (!TH_ON) return null;
  const D = TH_DATA[T], G = TH_GEO[T]; if (!D || !G) return null;
  const zones = D.zones.map((z, i) => {
    const fl = ' ' + (z[9] || '') + ' ';
    return { i, id: z[0], zh: z[1], en: z[2], r: z[3], lon: z[4], lat: z[5], t: z[6], f0: z[7], vp: z[8], port: fl.includes(' port '), cap: fl.includes(' cap '), cap2: fl.includes(' cap2 '), dep: fl.includes(' dep '), hub: fl.includes(' hub '), base: fl.includes(' base '), imp: fl.includes(' x '), x: G.z[i][0], y: G.z[i][1], area: G.z[i][2], coast: !!G.z[i][3], towns: (D.towns && D.towns[z[0]]) || '', ct: G.city[z[0]] || [], pop: z[10] || 0 };
  });
  const idx = {}; zones.forEach(z => { idx[z.id] = z.i; });
  const edges = G.e.map(([a, b, km, river, rname, rail, kind, len], k) => ({ k, a, b, km: Math.max(20, km || 60), river: river || 0, rname: rname || '', rail: rail || 0, kind: kind || 'land', len: len || 1 }));
  const adj = zones.map(() => []);
  for (const e of edges) { adj[e.a].push([e.b, e.k]); adj[e.b].push([e.a, e.k]); }
  const eIdx = new Map(); for (const e of edges) { eIdx.set(e.a * 1000 + e.b, e.k); eIdx.set(e.b * 1000 + e.a, e.k); }
  const regs = [...new Set(zones.map(z => z.r))];
  return (THX[T] = { T, D, G, zones, idx, edges, adj, eIdx, regs });
}
const thEdge = (ST, a, b) => { const k = ST.eIdx.get(a * 1000 + b); return k == null ? null : ST.edges[k]; };
const thTheaters = S => (S.th ? Object.keys(S.th.T) : []);
/* 区格的工事：修筑的工事（TS.fort）；中国战场上日军控制区另按治安度计入据点、碉堡与伪警备队（治安 100 相当于 1.6 级工事）——
 * 史实：国军缺乏重火器，几乎攻不下日军据守的城市（1939–40 年冬季攻势对开封、信阳、九江等地的进攻都被击退） */
const thFortAt = (TS, z) => Math.max(TS.fort[z] || 0, TS.base && TS.zc[z] === 'JPN' ? 1.6 * (TS.jc[z] || 0) / 100 : 0);
function thOfRegion(S, R) { for (const T of thTheaters(S)) { const ST = thStatic(T); if (ST.zones.some(z => z.r === R && !z.base)) return T; } return null; }

/* ---------- 敌友 ---------- */
function thCommonEnemy(S, a, b) { for (const e of IDS) if (e !== a && e !== b && atWar(S, a, e) && atWar(S, b, e)) return true; return false; }
/* 战区的临时缓存（不放进 S，避免进入存档与联机同步）：敌友关系、海上联系、路径；每个作战阶段开始、每天开始、区格易手时清空 */
const THC = new WeakMap();
const thC = S => { let c = THC.get(S); if (!c) THC.set(S, c = { fr: {}, ho: {}, sl: {}, pc: {} }); return c; };
function thFr(S, a, b) {
  if (!a || !b) return false; if (a === b) return true;
  const c = thC(S).fr, ca = c[a] || (c[a] = {}); if (ca[b] != null) return ca[b];
  const v = !thHostile(S, a, b) && (isAlly(S, a, b) || hasTreaty(S, a, b, 'access') || boss(S, a) === boss(S, b) || thCommonEnemy(S, a, b));
  (c[b] || (c[b] = {}))[a] = v; return (ca[b] = v);
}
const thCivil = (S, a, b) => !!(S.th && S.th.uf && S.th.uf.civil) && ((a === 'CHN' && b === 'CCP') || (a === 'CCP' && b === 'CHN')); // 国共内战只在精细战区里进行（战略层不宣战，避免把中共部队“驱逐”出中国）
function thHostile(S, a, b) { if (!a || !b || a === b) return false; const c = thC(S).ho, ca = c[a] || (c[a] = {}); if (ca[b] != null) return ca[b]; const v = atWar(S, a, b) || thCivil(S, a, b); (c[b] || (c[b] = {}))[a] = v; return (ca[b] = v); }
const thEnemyIn = (S, TS, z, C) => TS.units.some(v => v.z === z && !TT[v.t].gue && thHostile(S, v.c, C)); // 区格里有成建制的敌军（游击队不阻挡行军、不妨碍占领）
const thResetCache = S => { THC.delete(S); };
const thPathReset = S => { const c = THC.get(S); if (c) c.pc = {}; };

/* ---------- 兵力池 ---------- */
function thInT(T, R) { const ST = thStatic(T); return !!ST && ST.zones.some(z => z.r === R && !z.base); }
function thPoolV(S, T, C) {
  const D = TH_DATA[T], ST = thStatic(T), cfg = (D.pool && D.pool[C]) || null;
  const regs = cfg ? Object.keys(cfg) : ST.regs; let v = V0(); const anchors = [];
  const x = S.actors[C]; if (!x || !indep(S, C)) return { v, anchors };
  for (const L of regs) {
    const sh = cfg ? cfg[L] : 1; if (!(sh > 0) || !S.actors[L]) continue;
    const s = x.forces[L]; if (!s || vsum(s) < 1e-5) continue;
    let out = V0();
    for (const f of S.fronts) if (f.from === L && !thInT(T, f.target)) { if (f.att === C) out = vadd(out, f.v); if (f.co) for (const k of f.co) if (k.id === C) out = vadd(out, k.v); }
    for (const o of S.ops) if (o.owner === C && o.from === L && !thInT(T, o.target)) out = vadd(out, o.v);
    const vv = vmul(vsub0(s, out), sh);
    if (vsum(vv) > 1e-5) { v = vadd(v, vv); anchors.push([L, vv]); }
  }
  // 战略层对战区内地区发动的两栖作战：在出发地（如英国本土）集结、投入这次作战的兵力也进入战区（在出发地的港口编成，开战后渡海登陆）
  for (const f of S.fronts) {
    if (f.th !== T || f.kind !== 'amph') continue;
    const fv = f.att === C ? f.v : ((f.co || []).find(k => k.id === C) || {}).v, L = f.from; if (!fv || !L || !S.actors[L]) continue;
    if ((cfg ? cfg[L] || 0 : ST.regs.includes(L) ? 1 : 0) > 0) continue; // 出发地的兵力已经计入
    const s = x.forces[L]; if (!s) continue; const vv = vmin(fv, s);
    if (vsum(vv) > 1e-5) { v = vadd(v, vv); anchors.push([L, vv]); }
  }
  return { v, anchors };
}
const SLICE0 = { DEU: 25, FRA: 18, GBR: 30, BNL: 16, ITA: 12, USA: 35, CAN: 30, JPN: 24, CHN: 20, CCP: 9, RUS: 25 }; // 每师当量（含军、集团军直属部队）的地面兵员，千人
const thSliceDef = C => SLICE0[C] || 25;
const thGP = x => (x.pers || 0) * landPers(x); // 地面部队兵员
function thWant(S, TS, C, p) { const x = S.actors[C]; return p.v[0] * thGP(x) / (TS.slice[C] || thSliceDef(C)); }

/* ---------- 初始化 ---------- */
function thNewUnit(S, TS, C, r, z, k) {
  const u = { id: S.th.seq++, c: C, n: [r[0], r[1]], t: TT[r[2]] ? r[2] : 'inf', q: r[3] || 1, sz: r[4] || 1, ar: r[5] || '', z, s: 1, o: docOf(C).om * 0.9, x: 0.45, ord: { k: 'hold' }, mv: 0, sp: 1, en: 0.3, b: S.turn };
  if (r[7]) u.dz = r[7]; if (r[8]) u.dd = r[8]; if (r[9]) u.ag = r[9]; if (k != null) u.k = k;
  TS.units.push(u); return u;
}
function thInit(S) {
  if (!TH_ON) return;
  S.th = { v: 1, seq: 1, T: {}, phase: 0, day: 0, q0: 0 };
  for (const T of Object.keys(TH_DATA)) {
    const D = TH_DATA[T]; if ((D.scen || '1939') !== S.scen) continue;
    const ST = thStatic(T); if (!ST) continue;
    const TS = { id: T, zc: [], fort: [], dmg: {}, units: [], air: {}, staff: {}, slice: {}, used: {}, gen: {}, fr: [], log: [], lossQ: {}, st: {} };
    ST.zones.forEach(z => { TS.zc[z.i] = (D.occ && D.occ[z.id]) || (S.actors[z.r] ? boss(S, z.r) : null); TS.fort[z.i] = z.f0; });
    S.th.T[T] = TS;
    for (const [C, list] of Object.entries(D.oob || {})) {
      if (!S.actors[C]) continue; TS.used[C] = list.map(() => 0);
      list.forEach((r, k) => { if (!r[6] || ST.idx[r[6]] == null) return; thNewUnit(S, TS, C, r, ST.idx[r[6]], k); TS.used[C][k] = 1; });
    }
    if (D.china) thChinaInit(S, TS, ST, D); // 中国战场：治安度、根据地、敌后游击、伪军、统一战线
    if (D.warLock) S.warLockX = (S.warLockX || []).concat(D.warLock);
    // 按开局历史序列标定每师当量的兵员（伪军不占日本的兵力池）
    for (const C of [...new Set(TS.units.map(u => u.c))]) {
      const p = thPoolV(S, T, C), N = TS.units.filter(u => u.c === C && !thAux(u)).reduce((s, u) => s + uw(u), 0), x = S.actors[C];
      TS.slice[C] = N >= 12 && p.v[0] > 0.002 ? clamp(p.v[0] * thGP(x) / N, 3, 60) : thSliceDef(C); // 开局部队太少时（如英国远征军只有 4 个师）用默认值
    }
  }
  for (const f of S.fronts) thOnFront(S, f); // 剧本开局已有的战线（如 1939 年的中日战争）由战区接管
  thOccUpdate(S); // 占领区基线（开局已有的占领不影响国力）
}

/* ---------- 每季度同步：补员、新建、撤出 ---------- */
function thSpawnZone(S, T, TS, C, pref) {
  const ST = thStatic(T), ok = i => TS.zc[i] && thFr(S, C, TS.zc[i]) && !ST.zones[i].imp && !thEnemyIn(S, TS, i, C);
  if (TS.base && C === 'CCP') { const z = thCcpSpawnZone(S, T, TS, ST); if (z != null) return z; } // 中共：在根据地就地扩军
  if (pref != null && ok(pref)) return pref;
  const fz = thFrontZones(S, T, TS, C);
  let best = -1, bs = -1e9;
  for (const z of ST.zones) {
    if (!ok(z.i)) continue;
    const own = boss(S, z.r) === C, dep = z.dep && own, port = z.port && thSeaLink(S, T, C), base = z.base && own;
    if (!(dep || port || base)) continue;
    let d = 99; for (const f of fz) d = Math.min(d, Math.hypot(ST.zones[f].x - z.x, ST.zones[f].y - z.y));
    const sc = (dep ? 2 : 0) + (port ? 1 : 0) - (base ? 3 : 0) - d * 0.3 + (z.hub ? 0.5 : 0);
    if (sc > bs) { bs = sc; best = z.i; }
  }
  if (best < 0) { const own = TS.units.find(v => v.c === C); if (own) return own.z; }
  return best;
}
function thFrontZones(S, T, TS, C) {
  const ST = thStatic(T), out = [];
  for (const z of ST.zones) { if (!thFr(S, C, TS.zc[z.i])) continue; if (ST.adj[z.i].some(([o]) => thHostile(S, C, TS.zc[o]))) out.push(z.i); }
  return out;
}
function thGenName(S, TS, C, t) {
  const g = TS.gen[C] = TS.gen[C] || {}; g[t] = (g[t] || (C === 'DEU' ? 300 : C === 'CHN' ? 100 : C === 'JPN' ? 60 : 80)) + 1; const n = g[t];
  const P = { DEU: '', FRA: '法', GBR: '英', BNL: '比', ITA: '意', USA: '美', CAN: '加', JPN: '日', CHN: '', CCP: '', RUS: '苏' }[C] ?? '';
  const ZH = { inf: '步兵师', mot: '摩托化步兵师', pz: '装甲师', lt: '轻装甲师', cav: '骑兵师', mtn: '山地师', fort: '要塞师', para: '空降师', gar: '守备旅', army: '军', jdiv: '师团', imb: '独立混成旅团', jtk: '战车联队', pup: '伪军师', gue: '纵队', mil: '地方支队', kgu: '游击纵队' }[t] || '师';
  const EN = { inf: 'Infantry Division', mot: 'Motorized Division', pz: 'Armored Division', lt: 'Light Armored Division', cav: 'Cavalry Division', mtn: 'Mountain Division', fort: 'Fortress Division', para: 'Airborne Division', gar: 'Garrison Brigade', army: 'Corps', jdiv: 'Division', imb: 'Independent Mixed Brigade', jtk: 'Tank Regiment', pup: 'Puppet Division', gue: 'Column', mil: 'Local Detachment', kgu: 'Guerrilla Column' }[t] || 'Division';
  const nat = { DEU: 'German', FRA: 'French', GBR: 'British', BNL: 'Belgian', ITA: 'Italian', USA: 'US', CAN: 'Canadian', JPN: 'IJA', CHN: 'NRA', CCP: '', RUS: 'Soviet' }[C] || C;
  if (C === 'CCP') { const k = n - 80; return t === 'mil' ? [`第${k}地方支队`, `${thOrd(k)} Local Detachment`] : [`独立第${k}旅`, `${thOrd(k)} Independent Brigade`]; } // 八路军、新四军新组建的部队多称“独立旅”
  return [`${P}新编第${n}${ZH}`, `${nat} ${thOrd(n)} ${EN} (new)`.replace(/^ /, '')];
}
const thOrd = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function thGenType(S, C, i) { // 没有历史番号可用时按国家兵种结构轮换
  const mix = { DEU: ['inf', 'inf', 'inf', 'inf', 'pz', 'inf', 'mot', 'inf'], FRA: ['inf', 'inf', 'inf', 'mot', 'inf', 'pz'], GBR: ['mot', 'mot', 'pz', 'mot'], USA: ['mot', 'mot', 'pz', 'mot', 'para'], ITA: ['inf', 'inf', 'mtn'], BNL: ['inf'], JPN: ['jdiv', 'imb', 'jdiv', 'imb', 'jdiv'], CHN: ['army'], CCP: ['gue', 'gue', 'mil'], RUS: ['inf', 'inf', 'pz'] }[C] || ['inf'];
  return mix[i % mix.length];
}
function thSync(S, T, R) {
  const TS = S.th.T[T], ST = thStatic(T), D = TH_DATA[T];
  const cs = new Set(TS.units.map(u => u.c));
  const gone = C => !indep(S, C) || !!(S.actors[C].flags && S.actors[C].flags.surrendered); // 已投降的国家不再向战区派兵
  for (const C of IDS) if (!gone(C) && (D.pool ? !!D.pool[C] : true) && thPoolV(S, T, C).v[0] > 0.003) cs.add(C);
  for (const C of cs) {
    const own = TS.units.filter(u => u.c === C && !thAux(u));
    if (gone(C)) { TS.units = TS.units.filter(u => u.c !== C); continue; }
    const p = thPoolV(S, T, C); TS.st[C] = { anc: p.anchors, pool: p.v };
    if (!TS.slice[C]) TS.slice[C] = thSliceDef(C);
    let want = thWant(S, TS, C, p), have = own.reduce((s, u) => s + ustr(u), 0);
    if (want > have + 0.3) {
      // 1) 补员：有补给、未被合围的部队补到满员
      let need = want - have;
      for (const u of own.slice().sort((a, b) => a.s - b.s)) {
        if (need <= 0.05) break; if (u.s >= 0.98 || u.sp < 0.5) continue;
        const add = Math.min(1 - u.s, need / uw(u)); u.s += add; u.x = Math.max(0.1, u.x - add * 0.25); need -= add * uw(u);
      }
      // 2) 新建：先用历史番号（按序列顺序），再用新编番号
      const list = (D.oob && D.oob[C]) || [], used = TS.used[C] = TS.used[C] || list.map(() => 0);
      let guard = 0;
      while (need > 0.4 && guard++ < 80) {
        let k = used.findIndex((x, j) => !x && list[j]);
        let r = null;
        if (k >= 0) { r = list[k]; used[k] = 1; } else { const t = thGenType(S, C, guard + own.length); r = [...thGenName(S, TS, C, t), t, 0.85, 1, '', null, null, null, null]; k = null; }
        const z = thSpawnZone(S, T, TS, C, r[7] != null ? ST.idx[r[7]] : null); if (z < 0 || z == null) break;
        const u = thNewUnit(S, TS, C, r, z, k); u.o = docOf(C).om * 0.7; u.x = 0.25;
        const w = uw(u); if (w > need * 1.4 && w > 0.6) u.s = clamp(need / w, 0.35, 1);
        need -= ustr(u);
      }
    } else if (want < have - 0.6) {
      // 撤出：后方、未接敌的部队优先
      let ex = have - want;
      const fz = new Set(thFrontZones(S, T, TS, C));
      const cand = own.filter(u => !TT[u.t].fix).sort((a, b) => (fz.has(a.z) - fz.has(b.z)) || (a.s - b.s));
      for (const u of cand) { if (ex <= 0.3) break; if (fz.has(u.z) && ex < uw(u) * u.s * 0.5) continue; TS.units = TS.units.filter(v => v !== u); ex -= ustr(u); if (u.k != null && TS.used[C]) TS.used[C][u.k] = 0; }
      if (ex > 0.3) { const left = TS.units.filter(u => u.c === C && !thAux(u)), tot = left.reduce((s, u) => s + ustr(u), 0) || 1, k = clamp(1 - ex / tot, 0.3, 1); for (const u of left) u.s *= k; }
    }
  }
}

/* ---------- 海上联系、补给 ---------- */
function thSeaLink(S, T, C) {
  const cs = thC(S).sl, k = T + C; if (cs[k] != null) return cs[k];
  return (cs[k] = thSeaLink0(S, T, C));
}
function thSeaLink0(S, T, C) {
  const ST = thStatic(T);
  if (!ST.zones.some(z => z.base && (z.r === C || boss(S, z.r) === C || thFr(S, C, boss(S, z.r))))) return false;
  let mine = 0, foe = 0;
  for (const X of IDS) { if (!indep(S, X)) continue; const n = navyEff(S, X); if (thFr(S, C, X)) mine += n; else if (thHostile(S, C, X)) foe += n; }
  return mine > foe * 1.3 + 1;
}
function thSupply(S, T, TS, ST, only) { // only：只算某一国（界面显示用）
  const nz = ST.zones.length, cs = only ? [only] : [...new Set(TS.units.map(u => u.c))], out = {};
  const dem = {}; for (const u of TS.units) { const d = dem[u.c] = dem[u.c] || new Float64Array(nz); d[u.z] += TT[u.t].s * (u.sz || 1) * (u.eng ? 1.4 : 1); }
  const intF = thAirInt(S, T, TS);
  for (const C of cs) {
    const pass = i => { const c = TS.zc[i]; return !!c && thFr(S, C, c); };
    const sea = thSeaLink(S, T, C), seaAlly = !sea && cs.some(A => A !== C && thFr(S, C, A) && thSeaLink(S, T, A));
    const dist = new Float64Array(nz).fill(1e9), cap = new Float64Array(nz).fill(0), done = new Uint8Array(nz);
    for (const z of ST.zones) {
      if (!pass(z.i)) continue; const owner = boss(S, z.r); let c0 = 0;
      if (z.dep && thFr(S, C, owner) && TS.zc[z.i] === owner) c0 = (owner === C ? 60 : 30) * thBombK(S, owner); // 战略轰炸削弱补给基地
      if (z.base && thFr(S, C, owner)) c0 = Math.max(c0, 80);
      if (z.port && (sea || seaAlly)) c0 = Math.max(c0, sea ? 14 : 7);
      if (TS.base && C === 'CCP' && TS.base[z.i] > 25) c0 = Math.max(c0, TS.base[z.i] / 8);
      if (c0 > 0) { dist[z.i] = 0; cap[z.i] = c0; }
    }
    for (let it = 0; it < nz; it++) {
      let a = -1, bd = 1e9; for (let i = 0; i < nz; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; a = i; }
      if (a < 0) break; done[a] = 1;
      for (const [b, k] of ST.adj[a]) {
        if (done[b] || !pass(b)) continue; const e = ST.edges[k], tz = terOf(ST.zones[b].t);
        if (e.kind === 'sea' && !(sea || seaAlly)) continue;
        const dmg = TS.dmg[k] || 0, railOk = e.rail > 0 && dmg <= 0 && !(TS.sab && TS.sab[b] > 0.85);
        let cost = e.kind === 'sea' ? 160 : railOk ? e.km / 6 : e.km / tz.mv;
        let ec = e.kind === 'sea' ? 10 : railOk ? (e.rail > 1 ? 45 : 25) * (1 - (TS.sab ? TS.sab[b] || 0 : 0) * 0.7) : 12 * tz.cap;
        if (e.kind === 'dike') { cost = e.km * 2; ec = 4; }
        const f = intF[C] ? intF[C][b] || 0 : 0; if (f > 0) { cost *= 1 + f; ec *= 1 - 0.5 * f; }
        const nd = dist[a] + cost;
        if (nd < dist[b] - 1e-9) { dist[b] = nd; cap[b] = Math.min(cap[a], ec); }
      }
    }
    const sig = new Float64Array(nz), d = dem[C] || new Float64Array(nz);
    for (let i = 0; i < nz; i++) {
      if (dist[i] >= 1e9) { sig[i] = 0; continue; }
      const df = dist[i] <= 100 ? 1 : 1 / (1 + (dist[i] - 100) / 260);
      sig[i] = df * Math.min(1, cap[i] / Math.max(0.6, d[i]));
    }
    out[C] = { sig, dist };
  }
  return out;
}

/* ---------- 空军 ---------- */
function thAirShares(S, T, TS) {
  const cs = [...new Set(TS.units.map(u => u.c))], ap = {}; let tot = 0;
  for (const C of cs) { const st = TS.st[C], a = (st ? st.pool[2] : 0) + thAirBoost(S, T, C); ap[C] = airEff(S, C) * a; tot += ap[C]; } // thAirBoost：战略层本回合的“空中支援”
  const sh = {}; for (const C of cs) sh[C] = tot > 0 ? ap[C] / tot : 0;
  return sh;
}
const thAirOrd = (TS, C) => TS.air[C] || { sup: 0.45, cas: 0.45, int: 0.1, z: [] };
function thAirCtl(S, T, TS, C, wx) { // 制空程度 0..1
  const sh = TS._ash || {}; let mine = 0, foe = 0;
  for (const X of Object.keys(sh)) { const o = thAirOrd(TS, X); if (thFr(S, C, X)) mine += sh[X] * o.sup; else if (thHostile(S, C, X)) foe += sh[X] * o.sup; }
  return mine + foe > 0 ? (mine + 0.02) / (mine + foe + 0.04) : 0.5;
}
function thAirInt(S, T, TS) { // 敌方空中封锁对各国补给线的削弱：out[受害国][区格]
  const out = {}, sh = TS._ash || {};
  for (const X of Object.keys(sh)) {
    const o = thAirOrd(TS, X); if (!(o.int > 0) || !sh[X]) continue;
    const zs = (o.iz && o.iz.length ? o.iz : []); if (!zs.length) continue;
    for (const C of Object.keys(sh)) { if (!thHostile(S, X, C)) continue; const m = out[C] = out[C] || {}; const ctl = thAirCtl(S, T, TS, X); for (const z of zs) m[z] = clamp((m[z] || 0) + o.int * sh[X] * 4 * ctl / zs.length, 0, 0.8); }
  }
  return out;
}

/* ---------- 日期与天气 ---------- */
function thDate(S, d) { const m0 = (S.q - 1) * 3; const m = m0 + Math.floor(d / 30); return { y: S.year, m: m + 1, d: (d % 30) + 1 }; }
function thWx(S, T, d) {
  const { m } = thDate(S, d); const r = (S.th._wx = S.th._wx || {}), k = T + ':' + S.turn + ':' + d;
  if (r.k === k) return r.v;
  let mv = 1, air = 1, atk = 1;
  if (T === 'W') { if (m === 12 || m <= 2) { mv = 0.72; air = 0.5; atk = 0.85; } else if (m === 3) { mv = 0.85; air = 0.75; } else if (m >= 10 && m <= 11) { mv = 0.8; air = 0.65; atk = 0.92; } else if (m === 9) { air = 0.9; } }
  else { if (m === 12 || m <= 2) { mv = 0.8; air = 0.65; atk = 0.88; } else if (m >= 6 && m <= 8) { mv = 0.78; air = 0.7; atk = 0.92; } else if (m === 5 || m === 9) { mv = 0.9; air = 0.85; } }
  const bad = rnd(S) < (T === 'W' ? (m >= 10 || m <= 3 ? 0.35 : 0.15) : 0.25); if (bad) { air *= 0.45; mv *= 0.92; }
  r.k = k; r.v = { mv, air, atk, bad, m };
  return r.v;
}

/* ---------- 路径 ---------- */
function thPath(S, T, C, from, to, mode) { // mode: 'move' 只走己方/友方区格；'push' 允许穿过敌占区（逐格进攻）；'rail' 只走铁路；'inf' 游击队渗透；'evac' 撤离
  const ST = thStatic(T), TS = S.th.T[T]; if (from === to) return [];
  const pc = thC(S).pc, key = T + C + (mode || '') + (from * 1000 + to);
  if (key in pc) { const r = pc[key]; return r ? r.slice() : null; }
  const r = thPath0(S, T, C, from, to, mode, ST, TS); pc[key] = r; return r ? r.slice() : null;
}
function thPath0(S, T, C, from, to, mode, ST, TS) {
  const nz = ST.zones.length, dist = new Float64Array(nz).fill(1e9), prev = new Int16Array(nz).fill(-1), done = new Uint8Array(nz);
  const rel = {}, relOf = c => rel[c] || (rel[c] = [thFr(S, C, c), thHostile(S, C, c)]), seaOk = mode === 'inf' ? false : mode === 'evac' || thSeaLink(S, T, C);
  dist[from] = 0;
  for (let it = 0; it < nz; it++) {
    let a = -1, bd = 1e9; for (let i = 0; i < nz; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; a = i; }
    if (a < 0 || a === to) break; done[a] = 1;
    for (const [b, k] of ST.adj[a]) {
      if (done[b]) continue; const e = ST.edges[k], z = ST.zones[b];
      if (z.imp) continue;
      if (e.kind === 'sea' && !seaOk) continue;
      const ctl = TS.zc[b], rr = relOf(ctl), fr = rr[0], hos = rr[1];
      if (!fr && !hos) continue; // 中立国
      if (mode === 'move' && !fr && b !== to) continue;
      if (mode === 'move' && !fr && b === to && thEnemyIn(S, TS, b, C)) continue;
      if (mode === 'rail' && (!fr || !(e.rail > 0) || (TS.dmg[k] || 0) > 0)) continue;
      let c = mode === 'rail' ? e.km / 8 : e.km / terOf(z.t).mv;
      if (hos) c *= mode === 'inf' ? 1.3 * (1 + (TS.bh ? TS.bh[b] || 0 : 0)) : 2.5 * (1 + 0.8 * thFortAt(TS, b)); if (e.river) c *= 1 + e.river * 0.3; if (e.kind === 'sea') c = 400; // inf：游击队渗透
      if (dist[a] + c < dist[b]) { dist[b] = dist[a] + c; prev[b] = a; }
    }
  }
  if (prev[to] < 0) return null;
  const p = []; for (let z = to; z !== from && z >= 0; z = prev[z]) p.unshift(z);
  return p;
}

/* ---------- 下令 ---------- */
function thOrdObj(ord, by) {
  const o = { k: ord.k || 'hold' }; if (ord.to != null) o.to = ord.to; if (ord.p) o.p = ord.p.slice(0, 24); if (by) o.by = by; if (ord.d) o.d = ord.d; if (ord.back) o.back = 1;
  if (ord.op) { o.op = String(ord.op).slice(0, 20); if (ord.r) o.r = String(ord.r).slice(0, 2); if (ord.g != null) o.g = ord.g; if (ord.ro) o.ro = 1; } // 参谋作业的作战编号（界面据此跟踪进展）；作战里的角色（突击 sp、跟进 fl、留守 gd）、留守的区格、打通补给线或突围
  return o;
}
function thSetOrder(S, T, u, ord, by, absDay) {
  const TS = S.th.T[T]; if (!u || !ord) return false;
  const o = thOrdObj(ord, by);
  const lag = docOf(u.c).lag; const now = absDay ?? (S.th.day || 0);
  if (lag > 0 && S.th.phase > 0 && by !== 'auto' && by !== 'op') { u.nx = Object.assign(o, { t0: now + lag }); } // 'op'：作战执行中的调整（作战命令本身已经计过迟滞）
  else { u.ord = o; delete u.nx; u.mv = 0; }
  return true;
}

/* ---------- 一天的结算 ---------- */
let TH_HOOK = null;
function thDay(S, T, R, absDay) {
  const TS = S.th.T[T], ST = thStatic(T), wx = thWx(S, T, absDay % 90), nz = ST.zones.length;
  thPathReset(S);
  TS._ash = thAirShares(S, T, TS);
  for (const u of TS.units) { if (u.nx && absDay >= u.nx.t0) { u.ord = u.nx; delete u.ord.t0; delete u.nx; u.mv = 0; } u.eng = 0; }
  const sup = thSupply(S, T, TS, ST);
  // 补给状态（游击队就地取给：根据地越巩固越充足）
  const landing = u => u.ld === S.turn && absDay - (u.ldD ?? -9) <= 1; // 登陆当天与次日：滩头还没拿下，不算断补给与被围
  for (const u of TS.units) { if (landing(u)) continue; const g = sup[u.c] ? sup[u.c].sig[u.z] : 0; const tgt = TT[u.t].gue ? Math.max(g, TS.base ? thGueSup(S, TS, u) : 0.5) : TS.base ? thCnSupFloor(S, TS, u, g) : g; u.sp += (tgt - u.sp) * 0.3; }
  if (S.th.ops) thOpDay(S, T, TS, ST, absDay, sup); // 玩家的作战：补给线被切断、目标刚拿下、久攻不下时当天重新部署（10h）
  // 预备队自动增援：昨天遭到进攻的相邻己方区格
  const hit = TS._hit || {};
  for (const u of TS.units) {
    if (u.ord.k !== 'reserve' || TT[u.t].fix) continue;
    let best = -1, bw = 0; for (const [o] of ST.adj[u.z]) { const w = hit[o] || 0; if (w > bw && thFr(S, u.c, TS.zc[o]) && !thEnemyIn(S, TS, o, u.c)) { bw = w; best = o; } }
    if (best >= 0 && bw > 0.5) { const lag = docOf(u.c).lag; if (lag > 0) { if (!u.nx) u.nx = { k: 'move', p: [best], by: 'auto', back: 1, t0: absDay + lag }; } else { u.ord = { k: 'move', p: [best], by: 'auto', back: 1 }; u.mv = 0; } }
  }
  // 意图：每个部队下一步要去的区格
  const atk = {}; // 目标区格 → [部队]
  const movers = [];
  for (const u of TS.units) {
    const k = u.ord.k; if (TT[u.t].fix || u.s < 0.05) continue;
    if (!TT[u.t].gue && thHostile(S, u.c, TS.zc[u.z])) { // 身处敌占区格（空降、被包围后仍坚守）：组织度耗尽就突围到相邻的友方区格，无路可走则投降
      if (u.o < 0.1) { const out = ST.adj[u.z].find(([o, k]) => ST.edges[k].kind !== 'sea' && thFr(S, u.c, TS.zc[o]) && !thEnemyIn(S, TS, o, u.c)); if (out) { u.z = out[0]; u.mv = 0; u.s *= 0.9; u.ord = thOpHold(u.ord); thOpFlag(S, u); continue; } thPOW(S, T, TS, u, u.z); u.s = 0; continue; }
      (atk[u.z] = atk[u.z] || []).push(u); continue; }
    if (u.ord.op && thOpGate(S, T, TS, ST, u, absDay, sup)) continue; // 作战部队：休整、全军暂停、等待集结（10h）
    if (k === 'attack') { const tz = u.ord.to, inZ = tz === u.z && TT[u.t].gue, ea = tz == null ? null : thEdge(ST, u.z, tz); if ((!ea || ea.kind === 'sea') && !inZ) { u.ord = thOpHold(u.ord); continue; } if (thHostile(S, u.c, TS.zc[tz]) || thEnemyIn(S, TS, tz, u.c)) (atk[tz] = atk[tz] || []).push(u); else { u.ord = thOpHold(u.ord); thOpFlag(S, u); } continue; } // inZ：游击队就地拔除据点
    if (TT[u.t].gue && (k === 'move' || k === 'raid' || k === 'guer')) { // 游击队渗透：昼伏夜行，穿过敌占区而不与敌军正面交战，也不占领区格
      const p = u.ord.p; if (!p || !p.length) { if (k === 'move') u.ord = { k: TS.base ? 'guer' : 'hold' }; continue; }
      const e = thEdge(ST, u.z, p[0]), c2 = TS.zc[p[0]];
      if (!e || e.kind === 'sea' || ST.zones[p[0]].imp || !(thFr(S, u.c, c2) || thHostile(S, u.c, c2))) { u.ord = { k: TS.base ? 'guer' : 'hold' }; continue; }
      movers.push(u); continue;
    }
    if (k === 'move' || k === 'push' || k === 'rail' || k === 'evac' || k === 'sweep') {
      let p = u.ord.p; if (!p || !p.length) { if (k !== 'evac' && k !== 'sweep') { u.ord = thOpHold(u.ord); thOpFlag(S, u); } continue; }
      let nzn = p[0], e = thEdge(ST, u.z, nzn);
      if (!e && u.ord.op) { // 作战部队的路线断了（被迫后撤之后）：重新求路，当天照常行动
        const p2 = thPath(S, T, u.c, u.z, u.ord.to ?? p[p.length - 1], k === 'move' ? 'move' : 'push');
        if (p2 && p2.length) { u.ord.p = p = p2.slice(0, 24); thOpFlag(S, u); nzn = p[0]; e = thEdge(ST, u.z, nzn); if (e && thOpGate(S, T, TS, ST, u, absDay, sup)) continue; }
      }
      if (!e) { u.ord = thOpHold(u.ord); continue; }
      const ctl = TS.zc[nzn], enemyIn = thEnemyIn(S, TS, nzn, u.c);
      if (e.kind === 'sea' && (thHostile(S, u.c, ctl) || enemyIn || !(thSeaLink(S, T, u.c) || k === 'evac'))) { u.ord = thOpHold(u.ord); continue; } // 海上航线只用于运兵与撤离，两栖登陆由战略层决定
      if (thHostile(S, u.c, ctl) || enemyIn) {
        if (k === 'push' || k === 'sweep' || (k === 'move' && p.length === 1 && !enemyIn)) { if (enemyIn) (atk[nzn] = atk[nzn] || []).push(u); else movers.push(u); }
        else { u.ord = thOpHold(u.ord); thOpFlag(S, u); }
      } else if (!thFr(S, u.c, ctl)) { u.ord = thOpHold(u.ord); thOpFlag(S, u); }
      else movers.push(u);
    }
  }
  // 战斗（先统计各进攻国当天的战斗数，用于分配近距空中支援）
  const hitNow = {}, events = [];
  TS._nb = {}; TS._nbD = {}; for (const tzs of Object.keys(atk)) { const c = atk[tzs][0] && atk[tzs][0].c; if (c) TS._nb[c] = (TS._nb[c] || 0) + 1; const dc = TS.zc[+tzs]; if (dc) TS._nbD[dc] = (TS._nbD[dc] || 0) + 1; }
  for (const tzs of Object.keys(atk)) {
    const tz = +tzs, A = atk[tz].filter(u => u.s > 0.05);
    const D0 = TS.units.filter(v => v.z === tz && A.some(a => thHostile(S, a.c, v.c)));
    if (!D0.length) {
      for (const u of A) {
        if (u.z === tz) { if (thHostile(S, u.c, TS.zc[tz]) && !TT[u.t].gue && (TS.base || TT[u.t].air || (u.ld != null && S.turn - u.ld <= 2))) thCapture(S, T, TS, ST, tz, u.c, absDay, R, events); continue; } // 空降兵、本季度两栖登陆的部队（或中国战场上扫荡、登陆的部队）身处无人防守的敌占区格：直接占领；投降国领土上残留的盟军不算
        if (!movers.includes(u)) { if (u.ord.k === 'attack') u.ord = thOpKeep(u.ord, { k: 'move', p: [tz], to: tz, by: u.ord.by }); movers.push(u); }
      }
      continue;
    }
    const res = thBattle(S, T, TS, ST, tz, A, D0, wx, absDay, R);
    hitNow[tz] = res.press; if (res.ev) events.push(res.ev);
  }
  TS._hit = hitNow;
  // 移动（含进入无人的敌占区格 = 占领）
  const load = {}, loadM = {}, intAll = thAirInt(S, T, TS); // 道路占用：机动部队优先，步兵用剩余运力
  for (const u of movers) { if (!u.ord.p || !u.ord.p.length) continue; const e = thEdge(ST, u.z, u.ord.p[0]); if (!e) continue; if (TT[u.t].v >= 40) loadM[e.k] = (loadM[e.k] || 0) + uw(u); else load[e.k] = (load[e.k] || 0) + uw(u); }
  for (const u of movers) {
    if (!u.ord.p || !u.ord.p.length) continue;
    const nzn = u.ord.p[0], e = thEdge(ST, u.z, nzn); if (!e) { u.ord = { k: 'hold' }; continue; }
    const z2 = ST.zones[nzn], tz = terOf(z2.t), d = docOf(u.c);
    let v;
    if (u.ord.k === 'rail') v = 380;
    else if (e.kind === 'sea') v = 260;
    else {
      v = TT[u.t].v * d.v * tz.mv * wx.mv * (0.45 + 0.55 * u.sp) * (0.6 + 0.4 * u.o);
      if (TT[u.t].arm > 0.5 && !thHostile(S, u.c, TS.zc[nzn])) v *= 1.1;
      const capE = (e.rail ? 14 : 10) * tz.cap * (e.kind === 'dike' ? 0.3 : 1), lm = loadM[e.k] || 0, li = load[e.k] || 0;
      if (TT[u.t].v >= 40) { if (lm > capE) v *= Math.max(0.25, capE / lm); }
      else { const rest = Math.max(capE * 0.25, capE - lm); if (li > rest) v *= Math.max(0.2, rest / li); }
      if (e.river && (TS.dmg[e.k] || 0) > 0 && thHostile(S, u.c, TS.zc[nzn])) v *= 0.5;
      const intf = intAll[u.c]; if (intf && intf[nzn]) v *= 1 - 0.35 * intf[nzn];
      if (TT[u.t].gue && TS.bh) v *= 1 - 0.5 * (TS.bh[nzn] || 0); // 碉堡、封锁沟阻碍游击队转移
    }
    u.mv += v;
    if (u.mv >= e.km) {
      const ctl = TS.zc[nzn], gue = !!TT[u.t].gue, enemyIn = !gue && thEnemyIn(S, TS, nzn, u.c);
      if (enemyIn) { u.mv = e.km; continue; }
      const left = Math.min(u.mv - e.km, e.km * 0.6); u.z = nzn; u.mv = 0; u.ord.p.shift(); u.en = 0;
      if (thHostile(S, u.c, ctl) && !gue) { thCapture(S, T, TS, ST, nzn, u.c, absDay, R, events); if (u.ord.op) thOpFlag(S, u); } // 作战部队拿下一格：当天重新部署（留兵守住刚拿下的区格）
      if (u.ord.p.length && left > 0 && e.kind !== 'sea') { const e2 = thEdge(ST, nzn, u.ord.p[0]); if (e2 && thFr(S, u.c, TS.zc[u.ord.p[0]]) && !thEnemyIn(S, TS, u.ord.p[0], u.c)) u.mv = left; }
      if (!u.ord.p.length) { const k2 = u.ord.k; if (k2 === 'evac' || k2 === 'sweep' || k2 === 'raid' || k2 === 'guer') { } else if (u.ord.back) u.ord = { k: 'reserve' }; else if (u.ord.op) { const o0 = u.ord; u.ord = thOpKeep(o0, { k: gue && TS.base ? 'guer' : 'hold' }); thOpFlag(S, u); } else u.ord = { k: gue && TS.base ? 'guer' : 'hold' }; }
    }
  }
  // 海上撤离
  thEvacDay(S, T, TS, ST, absDay, R, events);
  // 合围、断补给
  thSupplyAttrition(S, T, TS, ST, sup, absDay, R, events);
  // 恢复与工事
  for (const u of TS.units) {
    const d = docOf(u.c);
    if (!u.eng) { u.o = Math.min(d.om * (0.55 + 0.45 * u.sp), u.o + d.rec * (0.4 + 0.6 * u.sp)); if (u.ord.k === 'hold' || u.ord.k === 'reserve' || u.ord.k === 'dig') u.en = Math.min(1, u.en + 0.04); }
    if (u.ord.k === 'dig' && u.sp > 0.4) { const z = u.z; TS.fort[z] = Math.min(Math.max(ST.zones[z].f0, 2), TS.fort[z] + 0.012 * (u.sz || 1)); }
  }
  // 桥梁与铁路修复
  for (const k of Object.keys(TS.dmg)) { TS.dmg[k] -= 1; if (TS.dmg[k] <= 0) delete TS.dmg[k]; }
  TS.units = TS.units.filter(u => u.s > 0.04);
  if (events.length) for (const ev of events) TS._pev.push(ev);
  if (TH_DATA[T].subcap) thSubcap(S, T, TS, ST);
  if (TH_HOOK) TH_HOOK(S, T, absDay, TS); // 测试用的逐日观察钩子（正常运行时为空）
}

/* ---------- 一场（一天的）战斗 ---------- */
function thBattle(S, T, TS, ST, tz, A, D0, wx, absDay, R) {
  const zt = ST.zones[tz], ter = terOf(zt.t), fort = thFortAt(TS, tz);
  // 进攻方：按正面宽度取最强的部队
  const srcs = new Set(A.map(u => u.z)); const front = ter.front * Math.min(2, 0.6 + 0.4 * srcs.size);
  const As = A.slice().sort((a, b) => ustr(b) * TT[b.t].a - ustr(a) * TT[a.t].a);
  let used = 0, Aval = 0, armA = 0, infA = 0;
  const attC = As[0].c, ctlA = thAirCtl(S, T, TS, attC), ctlD = 1 - ctlA;
  const aOrd = thAirOrd(TS, attC), focusN = aOrd.z && aOrd.z.length ? aOrd.z.length : 0, casFocus = focusN ? aOrd.z.includes(tz) : true;
  const nb = Math.max(1, (TS._nb && TS._nb[attC]) || 1);
  const sh = TS._ash || {};
  // 近距支援：集中到重点区格时那里得到更多支援，其他战斗只剩一半（重点不是白给的）
  const cas = 0.45 * ctlA * wx.air * Math.min(1, (aOrd.cas || 0) * (sh[attC] || 0) * 4 / Math.sqrt(focusN && casFocus ? focusN : nb)) * (focusN && !casFocus ? 0.5 : 1);
  for (const u of As) {
    const w = ustr(u); let f = 1; if (used >= front) f = 0.15; else if (used + w > front) f = (front - used) / w; used += w;
    const e = thEdge(ST, u.z, tz); let rv = 1;
    if (e && e.river && u.z !== tz) { rv = e.river > 1 ? 0.55 : 0.75; if ((TS.dmg[e.k] || 0) > 0) rv *= 0.75; if (TS._bh && TS._bh[tz] === u.c) rv = Math.sqrt(rv); }
    if (e && e.kind === 'dike') rv = 0.3;
    const t = TT[u.t], d = docOf(u.c);
    let a = t.a * w * (0.25 + 0.75 * u.o) * u.q * d.a * thNat(S, u.c) * (0.4 + 0.6 * u.sp) * (0.8 + 0.4 * u.x) * rv * wx.atk;
    if (t.arm > 0) a *= 1 + (ter.arm - 1) * t.arm; if (t.mtn && (zt.t === 'mount' || zt.t === 'hills')) a *= 1.25;
    Aval += a * f; if (t.arm >= 0.5) armA += w * f; else infA += w * f;
    u.eng = 1; u._f = f;
  }
  if (armA > 0 && infA > 0) Aval *= 1.08;
  const foc = thFocusZ(S, T, attC).has(tz); if (foc) Aval *= 1.08; // 战略层指定的主攻方向：集中炮兵与补给
  Aval *= 1 + cas;
  let Dval = 0; const defC = D0[0].c, dOrd = thAirOrd(TS, defC);
  const nbD = Math.max(1, (TS._nbD && TS._nbD[defC]) || 1), dFocus = dOrd.z && dOrd.z.length ? dOrd.z.includes(tz) : null;
  const dcas = 0.3 * ctlD * wx.air * Math.min(1, (dOrd.cas || 0) * (sh[defC] || 0) * 3 / Math.sqrt(dFocus ? dOrd.z.length : nbD)) * (dFocus === false ? 0.5 : 1);
  for (const v of D0) {
    const t = TT[v.t], d = docOf(v.c), w = ustr(v);
    let dv = t.d * w * (0.25 + 0.75 * v.o) * v.q * d.d * thNat(S, v.c) * (0.4 + 0.6 * v.sp) * (0.8 + 0.4 * v.x);
    dv *= ter.def * (t.gue ? 1 : (1 + (t.fix ? 0.6 : 0.4) * fort) * (1 + 0.3 * v.en)); // 游击队不死守阵地
    if (t.mtn && (zt.t === 'mount' || zt.t === 'hills')) dv *= 1.2;
    if (v.hd) dv *= 1.1;
    Dval += dv; v.eng = 1;
  }
  const hold = thHoldZ(S, T, defC).has(tz); if (hold) Dval *= 1.06; // 战略层的“死守”
  Dval *= 1 + dcas;
  const r = clamp(Aval / Math.max(0.05, Dval) * Math.exp(rn(S) * 0.15), 0.05, 20);
  // 伤亡与组织度
  const panic = q => (q < 0.75 && r > 1.8 ? 1.6 : q < 0.9 && r > 3 ? 1.25 : 1);
  const doD = Math.min(0.45, 0.06 * Math.pow(r, 0.9)) * (1 + cas * 0.8), doA = Math.min(0.3, 0.05 * Math.pow(1 / r, 0.6) + 0.018);
  // 伤亡：各方造成的伤亡与自身火力成正比（守方受地形、工事、堑壕保护），按参战程度分摊；机动战中的大部分损失来自崩溃与合围
  const prot = ter.def * (1 + 0.4 * fort);
  let LD = Math.min(0.05 * wD0(D0), 0.0045 * Aval / prot * Math.pow(Math.min(r, 6), 0.15)), LA = Math.min(0.05 * As.reduce((s2, u) => s2 + ustr(u) * (u._f || 0), 0) + 0.01, 0.004 * Dval * Math.pow(Math.min(1 / r, 6), 0.2));
  if (foc) LA *= 1.15; if (hold) LD *= 1.15; // 主攻与死守的代价：伤亡 +15%
  const lost = {};
  const lc = TS._lc = TS._lc || {};
  const wd = wD0(D0) || 1, wa = As.reduce((s2, u) => s2 + ustr(u) * (u._f || 0.05), 0) || 1;
  let la = 0, ld = 0; // 本场（当天）双方的损失（师当量），记入战斗账
  for (const v of D0) { const g = TT[v.t].gue, k = v.hd ? 0.75 : g ? 1.3 : 1; v.o = Math.max(0, v.o - doD * k * panic(v.q)); const dsW = LD * ustr(v) / wd * (v.hd ? 1.2 : 1) * (g ? 0.55 : 1); const ds = Math.min(v.s * 0.2, dsW / uw(v)); v.s -= ds; ld += ds * uw(v); if (!thAux(v)) lost[v.c] = (lost[v.c] || 0) + ds * uw(v); (lc[v.c] = lc[v.c] || {}).def = (lc[v.c].def || 0) + ds * uw(v); }
  for (const u of As) { u.o = Math.max(0, u.o - doA * (0.3 + 0.7 * (u._f || 0))); const dsW = LA * ustr(u) * (u._f || 0.05) / wa; const ds = Math.min(u.s * 0.2, dsW / uw(u)); u.s -= ds; la += ds * uw(u); if (!thAux(u)) lost[u.c] = (lost[u.c] || 0) + ds * uw(u); u.x = Math.min(1, u.x + 0.004); (lc[u.c] = lc[u.c] || {}).att = (lc[u.c].att || 0) + ds * uw(u); const lz = TS._lz = TS._lz || {}; lz[u.c + ':' + zt.id] = (lz[u.c + ':' + zt.id] || 0) + ds * uw(u); }
  thLoss(S, T, TS, lost, tz, attC, defC);
  // 战斗账（按目标区格 × 进攻国，一个作战阶段内合并）：界面“战果”页逐阶段显示
  const BL = TS._bl = TS._bl || {}, bk0 = tz + ':' + attC, B = BL[bk0] = BL[bk0] || { z: tz, a: attC, d: defC, d0: absDay, d1: absDay, n: 0, as: 0, ds: 0, lr: 0, la: 0, ld: 0, from: [], riv: 0, air: 0, res: null };
  B.n++; B.d1 = absDay; B.as = Math.max(B.as, wa); B.ds = Math.max(B.ds, wd); B.lr += Math.log(r); B.la += la; B.ld += ld; B.air = Math.max(B.air, cas);
  for (const z0 of srcs) if (z0 !== tz && !B.from.includes(z0) && B.from.length < 4) B.from.push(z0);
  if (A.some(u => { const e1 = thEdge(ST, u.z, tz); return e1 && e1.river; })) B.riv = 1;
  // 战役记账（按目标地区）
  const bk = TS._bt = TS._bt || {}; const rk2 = zt.r; const b = bk[rk2] = bk[rk2] || { n: 0, r: 0, a: attC, d: defC }; b.n++; b.r += Math.log(r);
  // 进攻方疲惫：组织度过低的停止进攻
  for (const u of As) if (u.o < 0.18 && u.ord.k !== 'hold') { if (u.ord.op) { u.ord.rs = 1; continue; } u.ord = { k: 'hold' }; u.mv = 0; } // 作战部队：原地休整，恢复后继续原来的命令（10h）
  // 守方崩溃 → 撤退或被歼
  const wsum = D0.reduce((s, v) => s + ustr(v), 0) || 1, orgAvg = D0.reduce((s, v) => s + v.o * ustr(v), 0) / wsum;
  const thr = D0.every(v => v.hd) ? 0.07 : D0.every(v => TT[v.t].gue) ? 0.32 : 0.15; // 游击队一触即走
  let ev = null;
  if (orgAvg < thr || D0.every(v => v.s < 0.12)) {
    const nRet = thRetreat(S, T, TS, ST, tz, D0, absDay, R);
    // 进攻方进入
    const enter = As.filter(u => u.s > 0.05 && u.o > 0.12 && (u.ord.k === 'attack' || u.ord.k === 'push' || u.ord.k === 'move'));
    const ctl0 = TS.zc[tz];
    if (!thEnemyIn(S, TS, tz, attC)) {
      const go = enter.length ? enter : []; const from0 = go.length ? go[0].z : null;
      for (const u of go) {
        if (!thEdge(ST, u.z, tz) && u.z !== tz) continue;
        u.z = tz; u.mv = 0; u.en = 0; u.o = Math.max(0.1, u.o - 0.04);
        if (u.ord.k === 'push' && u.ord.p && u.ord.p[0] === tz) u.ord.p.shift(); else if (u.ord.k !== 'push') { u.ord = thOpHold(u.ord); thOpFlag(S, u); }
        if (u.ord.k === 'push' && (!u.ord.p || !u.ord.p.length)) { u.ord = thOpHold(u.ord); thOpFlag(S, u); }
        if (u.ord.op) thOpFlag(S, u);
      }
      if (go.length) {
        const e0 = from0 != null ? thEdge(ST, from0, tz) : null;
        if (thHostile(S, attC, ctl0)) thCapture(S, T, TS, ST, tz, attC, absDay, R, TS._pev, { brk: 1, ret: nRet.ret, lost: nRet.lost });
        if (e0 && e0.river && thHostile(S, attC, ctl0)) TS._pev.push({ k: 'cross', z: tz, c: attC, d: absDay, rn: e0.rname });
      }
    }
    ev = { k: 'brk', z: tz, c: attC, d: absDay };
    B.res = TS.zc[tz] === attC || thFr(S, attC, TS.zc[tz]) ? 'cap' : 'brk'; // 守军崩溃：攻占，或击溃但未能进入
    if (armA > 0) for (const [o] of ST.adj[tz]) for (const v of TS.units) if (v.z === o && thHostile(S, v.c, attC) && !TT[v.t].fix) v.o = Math.max(0, v.o - 0.08 * (1.2 - v.q)); // 突破的冲击波
  }
  return { press: r, ev };
}
const wD0 = D0 => D0.reduce((s, v) => s + ustr(v), 0);
/* 国家层面的质量修正：技术、稳定、装备/兵员比相对开局的变化 */
function thNat(S, C) {
  const x = S.actors[C]; if (!x) return 1;
  const c = S._thNat || (S._thNat = {}); const k = C + S.turn; if (c[k]) return c[k];
  const t0 = (S.th && S.th.t0 && S.th.t0[C]) || null;
  let f = stabF(x) / 0.88 * fuelF(x);
  if (t0) f *= clamp(techF(x) / t0[0], 0.8, 1.35) * clamp(Math.sqrt((x.land / Math.max(1, x.pers)) / t0[1]), 0.7, 1.4);
  return (c[k] = clamp(f, 0.45, 1.6));
}
function thRetreat(S, T, TS, ST, tz, D0, absDay, R) {
  let ret = 0, lost = 0;
  for (const v of D0) {
    if (TT[v.t].gue && TS.base && thGueRoot(TS, v, tz) >= 30) { v.o = Math.max(0.12, v.o); v.s *= 0.95; v.mv = 0; v.ord = thOpKeep(v.ord, { k: 'guer' }); delete v.nx; ret++; continue; } // 根据地群众掩护：化整为零，就地坚持
    if (TT[v.t].fix || v.hd && v.s > 0.15) { if (TT[v.t].fix || v.s <= 0.15) { lost += ustr(v); thPOW(S, T, TS, v, tz); v.s = 0; } continue; }
    let best = -1, bs = -1e9;
    for (const [o, k] of ST.adj[tz]) {
      const e = ST.edges[k]; if (e.kind === 'sea') continue;
      const ctl = TS.zc[o]; if (!thFr(S, v.c, ctl) || ST.zones[o].imp) continue;
      if (thEnemyIn(S, TS, o, v.c)) continue;
      const enAdj = ST.adj[o].filter(([p]) => thHostile(S, v.c, TS.zc[p])).length;
      const own = TS.units.filter(w => w.z === o && w.c === v.c).length;
      const sc = (ST.zones[o].dep ? 1 : 0) + own * 0.3 - enAdj * 0.8 + (ctl === v.c ? 0.5 : 0) + rnd(S) * 0.2;
      if (sc > bs) { bs = sc; best = o; }
    }
    if (best < 0 && TT[v.t].gue) { v.s *= 0.7; v.o = Math.max(0.1, v.o); v.ord = thOpKeep(v.ord, { k: TS.base ? 'guer' : 'hold' }); delete v.nx; continue; } // 游击队无路可退时分散突围
    if (best < 0) { lost += ustr(v); thPOW(S, T, TS, v, tz); v.s = 0; continue; }
    { const lc = TS._lc = TS._lc || {}; (lc[v.c] = lc[v.c] || {}).ret = (lc[v.c].ret || 0) + 0.08 * ustr(v); }
    v.z = best; v.s *= 0.92; v.o = Math.max(0.05, v.o); v.mv = 0; v.en = 0; v.ord = thOpHold(v.ord); thOpFlag(S, v); delete v.nx; ret++;
  }
  return { ret, lost };
}
function thPOW(S, T, TS, v, tz) { const l = {}; l[v.c] = thAux(v) ? 0 : ustr(v); const lc = TS._lc = TS._lc || {}; (lc[v.c] = lc[v.c] || {}).pow = (lc[v.c].pow || 0) + ustr(v); thLoss(S, T, TS, l, tz, null, v.c, true); (TS._pow = TS._pow || {})[v.c] = ((TS._pow || {})[v.c] || 0) + ustr(v); }
function thCapture(S, T, TS, ST, z, C, absDay, R, events, extra) {
  const zz = ST.zones[z], owner = boss(S, zz.r);
  const newC = owner && owner !== C && thFr(S, C, owner) && !(TS.base && C === 'CCP') ? owner : C; // 解放盟友的领土 → 交还原主（中共收复的地方由抗日民主政府管理）
  const old = TS.zc[z]; TS.zc[z] = newC; thPathReset(S);
  (TS._bh = TS._bh || {})[z] = C;
  if (TS.base) thChinaCapture(S, T, TS, ST, z, newC, old);
  if (events) events.push(Object.assign({ k: 'cap', z, c: C, o: old, d: absDay }, extra || {}));
}

/* ---------- 损失回写战略层 ---------- */
function thLoss(S, T, TS, lost, tz, attC, defC, pow) {
  for (const [C, w] of Object.entries(lost)) { if (!(w > 0)) continue; const q = TS.lossQ[C] = TS.lossQ[C] || { w: 0, men: 0 }; q.w += w; q.men += w * (TS.slice[C] || thSliceDef(C)); if (pow) q.pow = (q.pow || 0) + w * (TS.slice[C] || thSliceDef(C)); }
  const zt = thStatic(T).zones[tz]; if (!zt) return;
  for (const f of S.fronts) {
    if (f.th !== T || f.target !== zt.r) continue;
    if (!f.cas) f.cas = { a: [0, 0, 0, 0], d: [0, 0, 0, 0] };
    for (const [C, w] of Object.entries(lost)) { const men = w * (TS.slice[C] || thSliceDef(C)) * 1000 / 1000; if (C === f.att || (f.co || []).some(k => k.id === C) || (attC && thFr(S, C, f.att) && C === attC)) f.cas.a[0] += men; else f.cas.d[0] += men; }
  }
}
function thFlushLoss(S, T, TS) { // 把累积的损失按锚点地区扣减战略兵力
  const pl = TS._phLoss = TS._phLoss || {}; for (const [C, q] of Object.entries(TS.lossQ)) { const o = pl[C] = pl[C] || { men: 0, pow: 0 }; o.men += q.men || 0; o.pow += q.pow || 0; } // 本阶段各国的伤亡与被俘（千人）
  for (const [C, q] of Object.entries(TS.lossQ)) {
    const x = S.actors[C]; if (!x || !(q.w > 0)) continue;
    const st = TS.st[C]; const anc = st && st.anc && st.anc.length ? st.anc : [[C, x.forces[C] || V0()]];
    const total = Math.max(1, thGP(x)) / (TS.slice[C] || thSliceDef(C)); // 全军（地面部队）师当量
    const frac = clamp(q.w / Math.max(1, total), 0, 0.6); // 占全军的比例
    const sum = anc.reduce((s, a) => s + a[1][0], 0) || 1;
    for (const [L, v] of anc) {
      if (!x.forces[L]) continue; const part = frac * v[0] / sum;
      const base = Math.min(v[0], x.forces[L][0]); if (!(base > 1e-6)) continue;
      attrit(S, C, L, [clamp(part / base, 0, 0.95), 0, clamp(part / base, 0, 0.95) * 0.3], { v: [base, 0, Math.min(v[2], x.forces[L][2])] });
    }
    TS.lossT = TS.lossT || {}; const lt = TS.lossT[C] = TS.lossT[C] || { men: 0, pow: 0 }; lt.men += q.men; lt.pow += q.pow || 0;
  }
  TS.lossQ = {};
}

/* ---------- 断补给与合围 ---------- */
function thSupplyAttrition(S, T, TS, ST, sup, absDay, R, events) {
  const lost = {}, lostR = {}, repZ = {}; // 损失按所在地区计入相应战线的伤亡统计
  const enc = {};
  const book = (u, w) => { lost[u.c] = (lost[u.c] || 0) + w; const r = ST.zones[u.z].r; if (repZ[r] == null) repZ[r] = u.z; const lr = lostR[r] = lostR[r] || {}; lr[u.c] = (lr[u.c] || 0) + w; };
  for (const u of TS.units) {
    if (TT[u.t].gue || (u.ld === S.turn && absDay - (u.ldD ?? -9) <= 1)) continue; // 刚登陆的部队不算被围
    if (TS.base && u.c === 'CHN' && TS.zc[u.z] === 'CHN') { u.enc = 0; continue; } // 敌后国统区：就地筹粮，不算被围
    const g = sup[u.c] ? sup[u.c].sig[u.z] : 0;
    if (u.sp < 0.35) { const d = (0.35 - u.sp) * 0.012 * u.s; u.s -= d; u.o = Math.max(0, u.o - (0.35 - u.sp) * 0.06); if (!thAux(u)) book(u, d * uw(u)); const lc = TS._lc = TS._lc || {}; (lc[u.c] = lc[u.c] || {}).sup = (lc[u.c].sup || 0) + d * uw(u); }
    if (g === 0) {
      // 完全被围：周围没有可去的友方区格
      const out = ST.adj[u.z].some(([o, k]) => ST.edges[k].kind !== 'sea' && thFr(S, u.c, TS.zc[o]) && !thEnemyIn(S, TS, o, u.c));
      if (!out) { u.enc = (u.enc || 0) + 1; enc[u.z] = (enc[u.z] || 0) + 1; if (u.sp < 0.15 && u.enc > 4 && rnd(S) < 0.12 + (1 - u.o) * 0.1) { thPOW(S, T, TS, u, u.z); u.s = 0; events.push({ k: 'sur', z: u.z, c: u.c, d: absDay, n: u.n }); } } // 被围部队投降：按被俘计（伤亡构成、被俘人数）
      else u.enc = 0;
    } else u.enc = 0;
  }
  for (const r of Object.keys(lostR)) thLoss(S, T, TS, lostR[r], repZ[r], null, null);
  for (const z of Object.keys(enc)) if (enc[z] >= 2 && !(TS._encSeen || {})[z + ':' + S.turn]) { (TS._encSeen = TS._encSeen || {})[z + ':' + S.turn] = 1; events.push({ k: 'enc', z: +z, n: enc[z], d: absDay, c: (TS.units.find(u => u.z === +z) || {}).c }); }
}

/* ---------- 海上撤离（敦刻尔克） ---------- */
function thEvacDay(S, T, TS, ST, absDay, R, events) {
  const byZ = {};
  for (const u of TS.units) if (u.ord.k === 'evac') { const z = ST.zones[u.z]; if (z.port && (!u.ord.p || !u.ord.p.length)) (byZ[u.z] = byZ[u.z] || []).push(u); else if (!u.ord.p || !u.ord.p.length) { const pz = thNearestPort(S, T, TS, ST, u); if (pz != null && pz !== u.z) { const p = thPath(S, T, u.c, u.z, pz, 'move'); if (p) u.ord.p = p; else u.ord = { k: 'hold' }; } else u.ord = { k: 'hold' }; } }
  for (const zs of Object.keys(byZ)) {
    const z = +zs, list = byZ[z];
    const link = list.some(u => thSeaLink(S, T, u.c)) || list.some(u => IDS.some(A => thFr(S, u.c, A) && A !== u.c && thSeaLink(S, T, A)));
    if (!link) { for (const u of list) u.ord = { k: 'hold' }; continue; }
    const foeAir = 1 - thAirCtl(S, T, TS, list[0].c);
    let capW = (ST.zones[z].vp >= 2 ? 2.4 : 1.2) * (1 - 0.5 * foeAir) * (thWx(S, T, absDay % 90).bad ? 0.6 : 1);
    for (const u of list.sort((a, b) => (b.c === 'GBR') - (a.c === 'GBR') || b.s - a.s)) {
      if (capW <= 0.05) break; const w = ustr(u), take = Math.min(1, capW / w);
      capW -= w * take; thEvacUnit(S, T, TS, u, take); events.push({ k: 'evac', z, c: u.c, d: absDay, w: +(w * take).toFixed(2), n: u.n });
    }
  }
  TS.units = TS.units.filter(u => u.s > 0.04);
}
function thNearestPort(S, T, TS, ST, u) {
  let best = null, bd = 1e9;
  for (const z of ST.zones) { if (!z.port || !thFr(S, u.c, TS.zc[z.i]) || z.base) continue; const p = thPath(S, T, u.c, u.z, z.i, 'move'); if (p == null) continue; const d = p.length; if (d < bd) { bd = d; best = z.i; } }
  return u.z != null && ST.zones[u.z].port ? u.z : best;
}
function thEvacUnit(S, T, TS, u, frac) { // 人员撤回本土，重装备损失六成
  const C = u.c, x = S.actors[C], w = ustr(u) * frac; u.s *= 1 - frac;
  const st = TS.st[C], anc = st && st.anc && st.anc.length ? st.anc : null; if (!anc || !x) return;
  const total = Math.max(1, thGP(x)) / (TS.slice[C] || thSliceDef(C)), part = w / Math.max(1, total);
  const home = indep(S, C) && canStation(S, C, C) ? C : null; if (!home) return;
  for (const [L, v] of anc) {
    if (!x.forces[L]) continue;
    const amt = Math.min(x.forces[L][0], part * v[0] / (anc.reduce((s, a) => s + a[1][0], 0) || 1)); if (!(amt > 1e-6)) continue;
    const p0 = x.pers, c0 = x.cas; attrit(S, C, L, [0.6, 0, 0], { v: [amt, 0, 0] }); x.pers = p0; x.cas = c0; // attrit 按 grp.v 计：撤出部分丢掉六成装备（人员保留）
    if (L === home) continue; // 在本国作战的军队（如法军）撤离同样丢掉六成重装备；人员留在本国编制内（史实：敦刻尔克撤出的法军多数经瑟堡、布雷斯特返回法国）
    const keep = amt * 0.4 / (1 - amt * 0.6 || 1);
    if (x.forces[L] && x.forces[L][0] > keep) { x.forces[L][0] -= keep; x.forces[home] = x.forces[home] || V0(); x.forces[home][0] += keep; }
  }
  (TS._evac = TS._evac || {})[C] = ((TS._evac || {})[C] || 0) + w * (TS.slice[C] || thSliceDef(C));
}

/* ---------- 季度开始、阶段、结束 ---------- */
function thBegin(S, R) {
  if (!S.th) return;
  thResetCache(S); S._thNat = null;
  S.th.t0 = S.th.t0 || {}; for (const C of IDS) if (!S.th.t0[C] && S.actors[C] && S.actors[C].pers > 0) S.th.t0[C] = [techF(S.actors[C]), S.actors[C].land / Math.max(1, S.actors[C].pers)];
  S.th.phase = 0; S.th.day = 0; S.th.R = null;
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T]; const ST = thStatic(T);
    TS.fr = []; TS._pev = []; TS.qev = []; TS._bt = {}; TS._hit = {}; TS._pow = {}; TS._evac = {}; TS.lossT = {}; TS._bh = {};
    TS.phr = []; TS.phq = [S.year, S.q]; TS._bl = {}; TS._phLoss = {}; TS.fp0 = {}; for (const f of S.fronts) if (f.th === T) TS.fp0[f.id] = Math.round(f.progress || 0); // 各阶段战果（本季度）
    if (!S.th.noSync) thSync(S, T, R);
    if (TS.base && typeof thCcpBegin === 'function') thCcpBegin(S, T, TS, ST, R);
    TS.fr.push(thFrame(S, T, TS, 0));
    TS.pre = {}; for (const C of [...new Set(TS.units.map(u => u.c))]) TS.pre[C] = TS.units.filter(u => u.c === C).reduce((s, u) => s + ustr(u), 0);
  }
}
function thActive(S, T) { // 本季度是否有战事（有交战双方的部队相邻）
  const TS = S.th.T[T], ST = thStatic(T);
  for (const u of TS.units) for (const [o] of ST.adj[u.z]) { const c = TS.zc[o]; if (c && thHostile(S, u.c, c)) return true; }
  return false;
}
function thPhase(S, R) {
  if (!S.th) return null;
  const ph = ++S.th.phase; const out = { ph, hum: [], hot: [], why: {}, ev: [] };
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T], ST = thStatic(T), d0 = (ph - 1) * TH_DAYS;
    thResetCache(S);
    S.th.day = d0; TS._pev = []; // AI 的命令从本阶段第一天算起（有命令迟滞的国家 t0 = d0 + lag）；AI 产生的事件（空降、登陆、作战开始）也记入本阶段
    const hum0 = humansOf(S).filter(H => TS.units.some(u => u.c === H)), pre = {}; for (const H of hum0) pre[H] = thContacts(S, TS, ST, H);
    const zc0 = TS.zc.slice(), lc0 = JSON.parse(JSON.stringify(TS._lc || {})); TS._bl = {}; TS._phLoss = {};
    if (ph === 1) thAmphLand(S, T, TS, ST); // 战略层的两栖作战：本季度第一阶段开始时登陆
    if (typeof thAI === 'function') thAI(S, T, R, ph);
    if (S.th.ops) thOpCtl(S, T, TS, ST); // 玩家按参谋方案发动的作战：分路、守走廊、集中突击（10h）
    for (let d = 0; d < TH_DAYS; d++) { S.th.day = d0 + d; thDay(S, T, R, d0 + d); if (TS.base && typeof thCcpDay === 'function') thCcpDay(S, T, TS, ST, R, d0 + d); }
    thFlushLoss(S, T, TS);
    TS.fr.push(thFrame(S, T, TS, d0 + TH_DAYS));
    const evs = TS._pev; TS.qev = (TS.qev || []).concat(evs.map(e => Object.assign({ ph }, e))).slice(-160);
    thFrontsUpdate(S, T, TS, ST, R, ph);
    (TS.phr = TS.phr || [])[ph - 1] = thPhaseRecord(S, T, TS, ST, ph, d0, evs, zc0, lc0);
    if (S.th.ops) thOpTick(S, T, TS, ST, ph); // 玩家按参谋方案发动的作战：记录推进到哪一格
    thPhaseReport(S, T, TS, ST, R, ph, evs);
    for (const H of humansOf(S)) if (TS.units.some(u => u.c === H) && thActiveFor(S, T, H)) out.hum.push(H);
    thResetCache(S);
    for (const H of hum0) { if (out.why[H] || !TS.units.some(u => u.c === H)) continue; const w = thHotFor(S, TS, ST, H, pre[H], evs); if (w) { out.hot.push(H); out.why[H] = Object.assign({ T }, w); } }
    out.ev = out.ev.concat(evs);
  }
  thStratOut(S, R); // 战区局势触发的战略决策（如意大利在法国败局已定时参战）
  out.hum = [...new Set(out.hum)];
  return out;
}
/* 一个作战阶段的战果记录（只读汇总，不改变局面）：
 *   bt   战斗：[目标区格, 进攻国, 防守国, 首日, 末日（相对本阶段）, 战斗天数, 进攻兵力, 防守兵力, 平均战力比, 进攻方损失, 防守方损失, 结果 cap/brk/hold, 渡河, 出发区格[], 近距支援]
 *   cap  区格易手：[区格, 新控制方, 原控制方, 第几天, 突破所得, 中共收复]
 *   loss 各国伤亡与被俘（千人）；lc 伤亡构成（师当量：进攻/防守/退却/断补给/被俘/破袭/扫荡/袭扰）
 *   str  阶段末兵力；oos 断补给的部队数；enc 被围的部队数；fr 战线进度；ev 其他事件计数与位置 */
function thPhaseRecord(S, T, TS, ST, ph, d0, evs, zc0, lc0) {
  const r2 = x => +(+x).toFixed(2), r1 = x => +(+x).toFixed(1);
  const bt = Object.values(TS._bl || {}).map(b => [b.z, b.a, b.d, b.d0 - d0, b.d1 - d0, b.n, r2(b.as), r2(b.ds), r2(Math.exp(b.lr / Math.max(1, b.n))), +b.la.toFixed(3), +b.ld.toFixed(3),
    b.res || (TS.zc[b.z] !== zc0[b.z] && (TS.zc[b.z] === b.a || thFr(S, b.a, TS.zc[b.z])) ? 'cap' : 'hold'), b.riv, b.from, r2(b.air)])
    .sort((x, y) => (y[9] + y[10]) - (x[9] + x[10])).slice(0, 48);
  TS._bl = {};
  const loss = {}; for (const [C, q] of Object.entries(TS._phLoss || {})) if (q.men > 0.05) loss[C] = [r1(q.men), r1(q.pow || 0)]; TS._phLoss = {};
  const lc = {}; for (const [C, o] of Object.entries(TS._lc || {})) { const p = lc0[C] || {}; const d = {}; for (const [k, v] of Object.entries(o)) { const x = v - (p[k] || 0); if (x > 0.005) d[k] = r2(x); } if (Object.keys(d).length) lc[C] = d; }
  const str = {}, oos = {}, enc = {}; for (const u of TS.units) { if (thAux(u)) continue; str[u.c] = (str[u.c] || 0) + ustr(u); if (u.sp < 0.35 && !TT[u.t].gue) oos[u.c] = (oos[u.c] || 0) + 1; if (u.enc) enc[u.c] = (enc[u.c] || 0) + 1; }
  for (const C of Object.keys(str)) str[C] = r1(str[C]);
  const cap = []; for (const e of evs) if (e.k === 'cap') cap.push([e.z, e.c, e.o || null, e.d - d0, e.brk ? 1 : 0, e.lib ? 1 : 0]);
  for (let i = 0; i < TS.zc.length; i++) if (TS.zc[i] !== zc0[i] && !cap.some(c => c[0] === i)) cap.push([i, TS.zc[i], zc0[i], TH_DAYS - 1, 0, 0]); // 投降、受降、停火造成的易手
  const ev = {}; for (const e of evs) { if (e.k === 'cap' || e.k === 'brk') continue; const o = ev[e.k] = ev[e.k] || { n: 0, z: [] }; o.n++; if (o.z.length < 6 && !o.z.some(q => q[0] === e.z)) o.z.push([e.z, e.c || null]); }
  const fr = S.fronts.filter(f => f.th === T).map(f => [f.id, f.att, f.target, Math.round(f.progress || 0)]);
  return { ph, d0, bt, cap, loss, lc, str, oos, enc, ev, fr };
}
/* “战况变化时暂停”：本阶段敌军在玩家部队附近（或其控制区）夺地、突破、登陆、空降、渡河、发动作战，扫荡玩家部队所在的区格，
 * 玩家的部队被围或投降，玩家（或盟友在其附近）取得突破、夺地、合围，国共摩擦，或敌方正规部队出现在原先没有敌军的相邻区格、
 * 或在某个相邻区格明显增兵（如德军装甲部队进入阿登）。破袭、撤离、换防等日常行动不算。
 * 返回第一个原因 { k, z }（k 为事件种类或 'contact'），没有则返回 null。只读，不改变局面。 */
function thContacts(S, TS, ST, H) {
  const own = new Set(), zs = new Set(); for (const u of TS.units) if (u.c === H) { own.add(u.z); zs.add(u.z); for (const [o] of ST.adj[u.z]) zs.add(o); }
  const str = new Map(); for (const v of TS.units) if (zs.has(v.z) && !TT[v.t].gue && thHostile(S, v.c, H)) str.set(v.z, (str.get(v.z) || 0) + ustr(v));
  return { own, zs, str };
}
function thHotFor(S, TS, ST, H, pre, evs) {
  const now = thContacts(S, TS, ST, H), near = z => now.zs.has(z) || (pre && pre.zs.has(z)), at = z => now.own.has(z) || (pre && pre.own.has(z));
  for (const e of evs) {
    if (e.k === 'raid' || e.k === 'evac') continue;
    if (e.k === 'fric') { if (e.c === H || e.o === H) return { k: 'fric', z: e.z }; continue; }
    if (e.k === 'subcap') { if (near(e.z)) return { k: 'subcap', z: e.z }; continue; }
    if (e.k === 'sweep') { if (thHostile(S, e.c, H) && at(e.z) && (e.q || 0) >= 0.5) return { k: 'sweep', z: e.z }; continue; } // 只有压倒当地游击队的大扫荡才暂停
    const mine = e.c === H || thFr(S, e.c, H);
    if (mine) { if (['cap', 'brk', 'enc', 'sur', 'land', 'drop'].includes(e.k) && (e.c === H || near(e.z))) return { k: e.k, z: e.z, own: 1 }; continue; }
    if (e.o === H || TS.zc[e.z] === H || near(e.z)) return { k: e.k, z: e.z };
  }
  if (pre) for (const [z, v] of now.str) { const v0 = pre.str.get(z) || 0; if ((v0 < 0.3 && v >= 2) || (v0 >= 0.3 && v >= v0 * 1.6 && v - v0 >= 3)) return { k: 'contact', z }; } // 至少两个师当量的新敌军，或增兵六成且多出三个师当量
  return null;
}
function thActiveFor(S, T, C) { const TS = S.th.T[T], ST = thStatic(T); return TS.units.some(u => u.c === C && ST.adj[u.z].some(([o]) => thHostile(S, C, TS.zc[o]) || TS.units.some(v => v.z === o && thHostile(S, v.c, C)))); }
function thEnd(S, R) {
  if (!S.th) return;
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T];
    for (const u of TS.units) if (u.nx) { u.ord = u.nx; delete u.ord.t0; delete u.nx; u.mv = 0; } // 季度末还没生效的命令下季度开始时生效（否则 t0 超出下季度的日期永远不会到）
    thFlushLoss(S, T, TS);
    for (const f of S.fronts) if (f.th === T) { f.hist = f.hist || []; f.hist.push(Math.round(f.progress)); if (f.hist.length > 16) f.hist.shift(); }
    TS.log = (TS.log || []).concat((TS.qev || []).filter(e => ['cap', 'enc', 'evac', 'sur', 'cross', 'sweep', 'fric', 'land', 'op'].includes(e.k)).map(e => ({ t: S.turn, d: e.d, k: e.k, z: e.z, c: e.c, w: e.w, lib: e.lib }))).slice(-160);
    if (TS.base) thChinaEnd(S, T, TS, thStatic(T), R);
    delete TS._pev; delete TS._hit; delete TS._ash; delete TS._bh; delete TS._nb; delete TS._nbD; delete TS._encSeen; delete TS._bt; delete TS._pow; delete TS._evac; delete TS._bl; delete TS._phLoss;
  }
  thAirSupLoss(S); thResetCache(S); thOccUpdate(S, R); thMorale(S, R); // 占领区影响国力：季度末的区格控制决定下一步战略结算的财政、产能与兵源；战局影响民心士气
  S.th.phase = 0; S.th.day = 0;
  thResetCache(S);
}
function thRunQuarter(S, R) { thBegin(S, R); for (let i = 0; i < TH_PHASES; i++) thPhase(S, R); thEnd(S, R); }

/* ---------- 回放帧 ---------- */
function thFrame(S, T, TS, d) {
  const cl = TS.cl = TS.cl || []; const ci = c => { let i = cl.indexOf(c); if (i < 0) { cl.push(c); i = cl.length - 1; } return i; };
  return { d, zc: TS.zc.map(c => (c ? ci(c) : -1)), u: TS.units.map(u => [u.id, u.z, Math.round(u.s * 100)]) };
}

/* ---------- 战线回写与投降 ---------- */
function thRegionVP(S, T, R) { const ST = thStatic(T); return ST.zones.filter(z => z.r === R); }
function thSubcap(S, T, TS, ST) {
  for (const sc of (TH_DATA[T].subcap || [])) {
    TS.subDone = TS.subDone || {}; const key = sc.zones.join(); if (TS.subDone[key]) continue;
    if (!sc.zones.every(id => thHostile(S, sc.c, TS.zc[ST.idx[id]]))) continue;
    TS.subDone[key] = 1; let n = 0;
    for (const u of TS.units) if (u.c === sc.c && (sc.ag ? u.ag === sc.ag : u.n[0].startsWith(sc.pre))) { thPOW(S, T, TS, u, u.z); u.s = 0; n++; } // 按所属（荷兰 NLD、比利时 BEL）识别，守备部队的番号不一定带国名
    TS.units = TS.units.filter(u => u.s > 0.04);
    if (TS._pev) TS._pev.push({ k: 'subcap', z: ST.idx[sc.zones[0]], c: sc.c, d: S.th.day, n, ev: sc.ev });
  }
}
function thFrontsUpdate(S, T, TS, ST, R, ph) {
  thSubcap(S, T, TS, ST);
  // 交战国在战区里互相进攻却没有战略层战线：补建（记账用，不再重复宣战）
  for (const z of ST.zones) {
    const ctl = TS.zc[z.i], owner = boss(S, z.r); if (!ctl || !owner || ctl === owner || !atWar(S, ctl, owner)) continue; // 战线是战略层的对象：只为真正交战的国家补建
    if (!S.fronts.some(f => f.th === T && f.target === z.r && (f.att === ctl || thFr(S, f.att, ctl))) && !thHalted(S, ctl, z.r)) thAutoFront(S, T, ctl, z.r);
  }
  for (const f of S.fronts.slice()) {
    if (f.th !== T || !S.fronts.includes(f)) continue;
    const Rg = f.target, zs = ST.zones.filter(z => z.r === Rg); if (!zs.length) continue;
    const att = z => { const c = TS.zc[z.i]; return c && c !== boss(S, Rg) && (c === f.att || thFr(S, c, f.att)) && thHostile(S, c, boss(S, Rg)); };
    const vpT = zs.reduce((s, z) => s + Math.max(0.5, z.vp), 0), vpC = zs.filter(att).reduce((s, z) => s + Math.max(0.5, z.vp), 0);
    const D = boss(S, Rg), human = isHuman(S, D), thr = (TH_DATA[T].capThr && TH_DATA[T].capThr[Rg]) || (human ? 0.85 : 0.62);
    let prog = 100 * vpC / (vpT * thr);
    const capZ = zs.filter(z => z.cap || z.cap2); const capLost = capZ.length && capZ.every(att);
    const defNow = TS.units.filter(u => u.c === D).reduce((s, u) => s + ustr(u), 0), def0 = Math.max((TS.pk && TS.pk[D]) || 0, defNow);
    TS.pk = TS.pk || {}; TS.pk[D] = def0;
    const cr = (TH_DATA[T].capRule && TH_DATA[T].capRule[Rg]) || { vp: 0.5, vpWeak: 0.33 }; // 剧本可以调整（如中国：重庆失守且失地八成才会屈服）
    if (!human && capLost && (vpC >= vpT * cr.vp || (vpC >= vpT * cr.vpWeak && defNow < 0.62 * def0))) prog = Math.max(prog, 100); // AI：首都失守且（失地过半，或失地三成以上且野战军折损近四成）时求和
    if (capLost && defNow < (human ? 0.15 : 0.3) * Math.max(def0, 1)) prog = Math.max(prog, 100);
    if (!TS.units.some(u => u.c === D || thFr(S, u.c, D) && zs.some(z => z.i === u.z)) && vpC > 0) prog = Math.max(prog, 100);
    if (TS.base && thChinaNoConquer(S, T, TS, ST, Rg)) prog = Math.min(prog, 99); // 中共：延安失守但敌后根据地仍在
    const p0 = f.progress || 0; f.progress = clamp(prog, -40, 100); f.last = f.progress - p0;
    f.taken = []; for (const z of zs) if (att(z)) for (const [Rr, ci] of z.ct) if (Rr === Rg) f.taken.push(ci);
    const bt = TS._bt && TS._bt[Rg]; if (bt && bt.n) f.ratio = Math.exp(bt.r / bt.n);
    f.turns = f.turns || 0; f.phase = 'land'; f.thPh = ph;
    if (f.progress >= 100 && !GRD(S, Rg)) { thConquer(S, T, TS, f, R); }
  }
}
function thAutoFront(S, T, X, Rg) {
  const anc = (S.th.T[T].st[X] && S.th.T[T].st[X].anc) || []; const from = anc.length ? anc[0][0] : X;
  const D = boss(S, Rg);
  const f = { id: 'F' + S.seq++, att: X, target: Rg, def: D, from, v: [0.02, 0, 0.02], kind: 'land', phase: 'land', sp: 0, tries: 0, progress: 0, turns: 0, phaseTurns: 0, last: 0, hist: [], surprise: false, haste: 0, co: [], log: [], cas: { a: [0, 0, 0, 0], d: [0, 0, 0, 0] }, taken: [], core: null, start: S.turn, tv: [0.02, 0, 0.02], focus: null, th: T, auto: 1 };
  f.obj = frontObjectives(S, f); S.fronts.push(f);
  return f;
}
function thConquer(S, T, TS, f, R) {
  const Rg = f.target; if (!S.actors[Rg]) return;
  const RR = R || S._R || newReport(S);
  conquer(S, f, RR);
  thAfterConquer(S, Rg);
}
function thAfterConquer(S, Rg) { // 某地区被征服：区格易手，守军投降或撤离
  if (!S.th) return;
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T], ST = thStatic(T); if (!ST.regs.includes(Rg)) continue;
    const X = S.actors[Rg].ctrl; thResetCache(S);
    for (const z of ST.zones) if (z.r === Rg) { const c = TS.zc[z.i]; if (TS.base && c === 'CCP' && indep(S, 'CCP')) continue; if (!c || c === Rg || !thFr(S, c, X)) TS.zc[z.i] = X; } // 中国战场：国民政府投降后，中共的根据地与部队继续抗战
    const lost = {};
    for (const u of TS.units) {
      if (TS.base && u.c === 'CCP' && indep(S, 'CCP')) continue;
      if (!thHostile(S, u.c, X) && indep(S, u.c)) continue;
      if (ST.zones[u.z].r !== Rg && indep(S, u.c)) continue;
      if (!indep(S, u.c) || u.c === Rg) { lost[u.c] = (lost[u.c] || 0) + 0; u.s = 0; continue; }
      // 第三国部队：战略层 conquer 已处理撤离/被俘，这里移出战区
      u.s = 0;
    }
    TS.units = TS.units.filter(u => u.s > 0.04);
    (TS.log = TS.log || []).push({ t: S.turn, d: S.th.day, k: 'fall', r: Rg, c: X });
  }
}

/* ---------- 报告 ---------- */
function thZoneName(T, i) { const z = thStatic(T).zones[i]; return z ? { c: [z.zh.replace(/（.*$/, ''), z.en.replace(/\s*\(.*$/, '')] } : { raw: '?' }; }
const TH_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function thDateMsg(dt) { return { c: [`${dt.m}月${dt.d}日`, `${TH_MON[(dt.m - 1) % 12]} ${dt.d}`] }; }
function thPhaseReport(S, T, TS, ST, R, ph, evs) {
  if (!R) return;
  const d0 = thDateMsg(thDate(S, (ph - 1) * TH_DAYS)), d1 = thDateMsg(thDate(S, ph * TH_DAYS - 1));
  for (const H of humansOf(S)) {
    if (!TS.units.some(u => u.c === H) && !evs.some(e => e.o === H || e.c === H)) continue;
    const mine = evs.filter(e => e.c === H || thFr(S, e.c, H)), theirs = evs.filter(e => thHostile(S, e.c, H));
    const capM = [...new Set(mine.filter(e => e.k === 'cap' && e.c === H).map(e => e.z))], capA = [...new Set(mine.filter(e => e.k === 'cap' && e.c !== H).map(e => e.z))].filter(z => !capM.includes(z)), capT = [...new Set(theirs.filter(e => e.k === 'cap').map(e => e.z))];
    const lines = [];
    if (capM.length) lines.push({ msg: M('th.r.cap', { n: ph, a: d0, b: d1, x: { list: capM.slice(0, 6).map(z => thZoneName(T, z)) } }), tone: 'good' });
    if (capA.length) lines.push({ msg: M('th.r.cap_al', { n: ph, a: d0, b: d1, x: { list: capA.slice(0, 6).map(z => thZoneName(T, z)) } }), tone: 'good' });
    if (capT.length) lines.push({ msg: M('th.r.lost', { n: ph, a: d0, b: d1, x: { list: capT.slice(0, 6).map(z => thZoneName(T, z)) } }), tone: 'bad' });
    for (const e of evs.filter(e => e.k === 'enc')) lines.push({ msg: M(thFr(S, e.c, H) ? 'th.r.enc_us' : 'th.r.enc_them', { x: thZoneName(T, e.z), n: e.n }), tone: thFr(S, e.c, H) ? 'bad' : 'good' });
    const ev = evs.filter(e => e.k === 'evac' && thFr(S, e.c, H)); if (ev.length) lines.push({ msg: M('th.r.evac', { x: thZoneName(T, ev[0].z), n: { pers: Math.round(ev.reduce((s, e) => s + e.w, 0) * (TS.slice[ev[0].c] || 20)) } }), tone: 'info' });
    for (const l of lines.slice(0, 5)) RP(S, H, R).mil.push(Object.assign({ th: T }, l)); // 中国战场的扫荡、破袭、摩擦在季度末汇总（thChinaEnd）
  }
}

/* ---------- 战略层挂钩 ---------- */
function thOnFront(S, f) { if (!S.th) return; const T = thOfRegion(S, f.target); if (!T) return; const ST = thStatic(T); if (!ST.regs.includes(f.from) && !S.th.T[T].units.some(u => u.c === f.att)) return; f.th = T; }
function thOnConquer(S, T0, X) { if (S.th) thAfterConquer(S, T0); }
function thOnPeace(S, a, b) {
  if (!S.th) return; thResetCache(S);
  for (const T of thTheaters(S)) {
    const TS = S.th.T[T], ST = thStatic(T);
    if (!TS.base) for (const z of ST.zones) { const own = boss(S, z.r), c = TS.zc[z.i]; if ((own === a && c === b) || (own === b && c === a)) TS.zc[z.i] = own; } // 中国战场停火：双方就地停止（如塘沽协定），不归还占领区
    for (const u of TS.units) {
      if (u.c !== a && u.c !== b) continue;
      if (u.ord.k === 'attack' || u.ord.k === 'push') { u.ord = { k: 'hold' }; delete u.nx; }
      if (!thFr(S, u.c, TS.zc[u.z])) { const home = ST.zones.filter(z => thFr(S, u.c, TS.zc[z.i]) && !z.base).sort((p, q) => Math.hypot(p.x - ST.zones[u.z].x, p.y - ST.zones[u.z].y) - Math.hypot(q.x - ST.zones[u.z].x, q.y - ST.zones[u.z].y))[0]; if (home) { u.z = home.i; u.mv = 0; u.ord = { k: 'hold' }; } else u.s = 0; }
    }
    TS.units = TS.units.filter(u => u.s > 0.04);
  }
}
function thFrontTurn(S, f, R) { f.turns = (f.turns || 0) + 1; f.phaseTurns = (f.phaseTurns || 0) + 1; if (!f.log) f.log = []; f.log.push({ t: S.turn, ph: 'land', p: f.progress, r: f.ratio || 1, cap: [], lost: [], th: 1 }); if (f.log.length > 12) f.log.shift(); }

/* ---------- 玩家接口 ---------- */
function thUnitsOf(S, T, C) { return S.th && S.th.T[T] ? S.th.T[T].units.filter(u => u.c === C) : []; }
function thOrderUnits(S, T, ids, ord) { // 玩家（S.player）给自己的部队下令
  if (!S.th || !S.th.T[T]) return 0; const TS = S.th.T[T], ST = thStatic(T), P = S.player; let n = 0;
  const k = String(ord && ord.k || 'hold');
  if (!['hold', 'move', 'attack', 'push', 'reserve', 'rail', 'evac', 'dig', 'guer', 'raid', 'sweep'].includes(k)) return 0;
  if (k === 'evac' && !(TH_DATA[T].evac || []).includes(P)) return 0; // 只有有海上撤离能力的国家（英法比加美）
  let to = ord.to != null ? (typeof ord.to === 'string' ? ST.idx[ord.to] : +ord.to) : null;
  if (to != null && !(Number.isInteger(to) && to >= 0 && to < ST.zones.length)) to = null;
  let via = ord.via == null ? null : (Array.isArray(ord.via) ? ord.via : [ord.via]).map(z => (typeof z === 'string' ? ST.idx[z] : +z)).filter(z => Number.isInteger(z) && z >= 0 && z < ST.zones.length).slice(0, 12); if (via && !via.length) via = null; // 经由：一个区格或一组区格（地区，如“阿登”）
  // 突进：交给参谋部，按推荐方案发动一次作战（分路前进、集中突击、守住走廊，见 10h），不再各自沿最短路线逐格硬冲
  if (k === 'push' && to != null) { const n0 = thOpQuick(S, T, ids, to, via, ord); if (n0 && ord.hd != null) thSetHold(S, T, ids, !!ord.hd); return n0; }
  for (const id of (Array.isArray(ids) ? ids : [ids]).slice(0, 200)) {
    const u = TS.units.find(v => v.id === +id && v.c === P); if (!u || TT[u.t].fix) continue;
    let o = { k };
    const g = !!TT[u.t].gue;
    if ((k === 'guer' || k === 'raid') && !g) continue; // 游击、破袭只限游击部队
    if (k === 'sweep' && g) continue;                    // 扫荡只限正规部队
    if (k === 'attack') { if (to == null || !thEdge(ST, u.z, to)) continue; o.to = to; }
    if (k === 'move' || k === 'push' || k === 'rail') {
      if (to == null) continue; const mode = k === 'push' ? 'push' : g && k === 'move' ? 'inf' : k;
      let p = null; if (via) for (const w of via) { if (w === u.z || w === to) continue; const p1 = thPath(S, T, P, u.z, w, mode), p2 = p1 ? thPath(S, T, P, w, to, mode) : null; if (p1 && p2 && (!p || p1.length + p2.length < p.length)) p = p1.concat(p2); } // 经由指定区格（地区取最短的那条）
      if (!p) p = thPath(S, T, P, u.z, to, mode); if (!p || !p.length) continue; o.p = p; o.to = to;
    }
    if ((k === 'guer' || k === 'raid') && to != null && to !== u.z) { const p = thPath(S, T, P, u.z, to, 'inf'); if (!p || !p.length) continue; o.p = p; o.to = to; }
    if (k === 'sweep') { const tz = to == null ? u.z : to; if (tz !== u.z) { const p = thPath(S, T, P, u.z, tz, 'push'); if (!p || !p.length || p.length > 3) continue; o.p = p; } o.to = tz; o.d = 15; }
    if (k === 'evac') { const pz = thNearestPort(S, T, TS, ST, u); if (pz == null) continue; o.p = pz === u.z ? [] : thPath(S, T, P, u.z, pz, 'move') || []; }
    if (ord.hd != null) u.hd = !!ord.hd;
    u.lk = 1; thSetOrder(S, T, u, o, 'p'); n++;
  }
  return n;
}
function thOpQuick(S, T, ids, to, via, ord) { // 普通“突进”命令（自然语言命令等）：按参谋部推荐的方案发动一次作战；机动部队为主时默认调步兵跟进
  const P = S.player, r = thPlanOps(S, T, P, (Array.isArray(ids) ? ids : [ids]).slice(0, 200), to, via ? { via: [via] } : null);
  if (!r || !r.ok || !r.plans.length) return 0;
  const pl = r.plans.find(p => p.rec) || r.plans[0];
  return thOpStart(S, T, ids, { to, p: pl.p, k: pl.k, st: pl.st, lab: [pl.brk, pl.via].filter(z => z != null), fol: ord.fol == null ? (pl.fol > 0 ? 1 : 0) : ord.fol ? 1 : 0, md: ord.md === 'f' ? 'f' : 's' });
}
function thSetAir(S, T, a) { if (!S.th || !S.th.T[T]) return false; const ST = thStatic(T); const sup = clamp(+a.sup || 0, 0, 1), cas = clamp(+a.cas || 0, 0, 1), int = clamp(+a.int || 0, 0, 1), t = sup + cas + int || 1; const zf = v => (Array.isArray(v) ? v : []).map(z => (typeof z === 'string' ? ST.idx[z] : +z)).filter(z => z >= 0 && z < ST.zones.length).slice(0, 6); S.th.T[T].air[S.player] = { sup: +(sup / t).toFixed(2), cas: +(cas / t).toFixed(2), int: +(int / t).toFixed(2), z: zf(a.z), iz: zf(a.iz) }; return true; }
function thSetSkip(S, on) { if (!S.th) return false; S.th.skip = S.th.skip || {}; S.th.skip[S.player] = on ? S.turn : null; return true; } // 本季度剩下的作战阶段不再暂停
function thSetStaff(S, T, on) { if (!S.th || !S.th.T[T]) return false; S.th.T[T].staff[S.player] = !!on; if (on) for (const u of S.th.T[T].units) if (u.c === S.player && !thOpLive(S, T, u)) delete u.lk; return true; } // 正在执行作战的部队仍归作战管，参谋代管只接手其余部队
function thSetHold(S, T, ids, on) { if (!S.th || !S.th.T[T]) return 0; let n = 0; for (const id of [].concat(ids)) { const u = S.th.T[T].units.find(v => v.id === +id && v.c === S.player); if (u) { u.hd = !!on; n++; } } return n; }
function thDemolish(S, T, a, b) { // 炸毁两区格之间的桥梁（守方在 a 一侧）
  if (!S.th || !S.th.T[T]) return false; const TS = S.th.T[T], ST = thStatic(T); if (!(a >= 0 && a < ST.zones.length && b >= 0 && b < ST.zones.length)) return false; const e = thEdge(ST, a, b); if (!e || !e.river) return false;
  if (TS.zc[a] !== S.player && !thFr(S, S.player, TS.zc[a])) return false; if (!TS.units.some(u => u.c === S.player && u.z === a)) return false;
  TS.dmg[e.k] = 12; return true;
}
