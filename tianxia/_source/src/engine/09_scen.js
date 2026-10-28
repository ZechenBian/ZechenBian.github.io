// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 剧本：切换、开局、存档迁移 ===================== */
let CURS = null;
/* ---------- 中立地区：剧本副本里去掉一切涉及它的设定（并入/占领/附庸、条约、集团、经济圈、制裁、战争、战线、驻军、关系、
 * 热点、核心利益、AI 议程与红线、时间线事件），并把它的名字标成“中立” ---------- */
const NEU_SC = {};
/* 永久领土的名字（按中国标准）：1939 年开局叫“台湾”；之后的年代在地图上标“台湾省”，注明是中国领土 */
const PROV_NAMES = {
  TWN: (s, o) => Object.assign(s.year > 1939 ? { name: '台湾省', en: 'Taiwan Province, China', voice: '台湾省', voiceEn: 'Taiwan Province, China' } : { name: '台湾', en: 'Taiwan', voice: '台湾', voiceEn: 'Taiwan' },
    { doctrine: '中国领土的一部分：本局中不能单独操作，任何国家都不能单独对它采取行动，它也不会独立。', doctrineEn: 'Part of China: in this game it cannot be controlled or targeted on its own, and it cannot become independent.' }),
};
const PROV_GOALS = { TWN: ['reunify'] }; // 永久领土已经归属所属国：去掉以它为目标的议程（中国的“实现两岸统一”）
/* 所属国的战略画像与时间线里把它当作单独一方的说法（[原文, 替换]） */
const PROV_TXT = { TWN: [['（台湾问题）', ''], [' (Taiwan)', ''], ['；坚持台湾问题是内政，要求美国断交、撤军、废约。', '。'], [' It insists Taiwan is an internal affair and has made America cut diplomatic ties, withdraw troops and end its defense treaty with Taipei.', ''],
  ['；视退守台湾的国民党政权为未完成的内战，', '；'], [', regards the Nationalist regime on Taiwan as unfinished civil war,', ',']] };
const provTxt = (id, t) => { if (typeof t !== 'string') return t; for (const [a, b] of PROV_TXT[id] || []) t = t.split(a).join(b); return t; };
const NEU_NAMES = { TWN: { name: '台湾（中立）', en: 'Taiwan (neutral)', voice: '台湾', voiceEn: 'Taiwan', doctrine: '中立地区：本局中任何国家都不能对其采取行动，它也不参与任何国际事务，玩家不能操作。', doctrineEn: 'A neutral zone: in this game no country may take any action toward it, it takes no part in world affairs, and no player may control it.' } };
function neutralScen(s, ids) {
  const N = new Set(ids), has = v => typeof v === 'string' && N.has(v), any = a => Array.isArray(a) && a.some(has);
  const o = Object.assign({}, s), objNo = (obj, val) => { if (!obj) return obj; const c = {}; for (const [k, v] of Object.entries(obj)) if (!has(k) && !(val && (has(v) || (Array.isArray(v) && has(v[0]))))) c[k] = v; return c; };
  o.part = objNo(s.part, true); o.vassal = objNo(s.vassal, true); o.occ = objNo(s.occ, true);
  for (const k of ['treaties', 'wars', 'sanctions', 'infl', 'tension2', 'flash', 'warLock', 'lend']) if (Array.isArray(s[k])) o[k] = s[k].filter(t => !any(t));
  if (s.blocs) o.blocs = s.blocs.filter(b => !has(b.leader)).map(b => Object.assign({}, b, { members: (b.members || []).filter(m => !has(m)) }));
  if (s.econ) { o.econ = {}; for (const [k, m] of Object.entries(s.econ)) o.econ[k] = m.filter(x => !has(x)); }
  if (s.fronts) o.fronts = s.fronts.filter(z => !has(z.att) && !has(z.target) && !has(z.from));
  if (s.forces) { o.forces = {}; for (const [X, f] of Object.entries(s.forces)) o.forces[X] = has(X) ? { [X]: 1 } : objNo(f, false); }
  if (typeof s.rel === 'string') o.rel = s.rel.split('\n').map(line => line.split('|').filter(it => !it.trim().split(/\s+/).slice(0, 2).some(has)).join('|')).join('\n');
  if (s.agenda) { o.agenda = {}; for (const [X, a] of Object.entries(s.agenda)) { if (has(X)) continue; const c = Object.assign({}, a); if (a.stance) c.stance = objNo(a.stance, false); if (Array.isArray(a.goals)) c.goals = a.goals.filter(g => !ids.some(id => PROV[id] && (PROV_GOALS[id] || []).includes(g))); if (a.red) c.red = a.red.map(r => (Array.isArray(r.t) ? Object.assign({}, r, { t: r.t.filter(x => !has(x)) }) : r)).filter(r => !has(r.t) && !has(r.loc) && !(Array.isArray(r.t) && !r.t.length)); o.agenda[X] = c; } }
  if (s.core) { o.core = s.core.map(k => (Array.isArray(k.t) ? Object.assign({}, k, { t: k.t.filter(x => !has(x)) }) : k)).filter(k => !has(k.o) && !has(k.loc) && !has(k.t) && !has(k.theater) && !has(k.vs) && !(Array.isArray(k.t) && !k.t.length)); const ok = new Set(o.core.map(k => k.id)); if (s.coreStart) o.coreStart = s.coreStart.filter(z => ok.has(z.cid) && !has(z.v)); }
  if (s.timeline) o.timeline = s.timeline.map(e => (has(e.split) ? Object.assign({}, e, { split: undefined }, PROV[e.split] && Array.isArray(e.doc) ? { doc: e.doc.map(t => provTxt(e.split, t)) } : {}) : e)).filter(e => !['who', 'about', 'a', 'b', 'to', 'id', 'by', 'lord', 'from', 'leader', 'with', 'v'].some(k => has(e[k])))
    .map(e => (any(e.members) || any(e.ids) ? Object.assign({}, e, e.members ? { members: e.members.filter(m => !has(m)) } : {}, e.ids ? { ids: e.ids.filter(m => !has(m)) } : {}) : e));
  if (s.noAmphTo) o.noAmphTo = objNo(s.noAmphTo, false);
  o.actors = Object.assign({}, s.actors); for (const id of ids) o.actors[id] = Object.assign({}, (s.actors || {})[id], PROV[id] ? (PROV_NAMES[id] ? PROV_NAMES[id](s, PROV[id]) : {}) : NEU_NAMES[id] || {});
  for (const id of ids) if (PROV[id]) o.part = Object.assign({}, o.part || {}, { [id]: PROV[id] }); // 永久领土：开局就是所属国的领土
  for (const id of ids) if (PROV[id] && PROV_TXT[id]) { // 所属国的战略画像里不再把它当作单独一方
    const own = PROV[id], base = PRIS.find(a => a.id === own) || {}, ov = Object.assign({}, o.actors[own] || {});
    for (const k of ['doctrine', 'doctrineEn']) { const t0 = ov[k] !== undefined ? ov[k] : base[k], t1 = provTxt(id, t0); if (t1 !== t0) ov[k] = t1; }
    o.actors[own] = ov;
  }
  delete o.noLandSet;
  return o;
}
/* 对局状态里强制中立：独立、撤出外国驻军，去掉条约、制裁、影响力、战争、战线、作战、封锁、通牒、核心利益与集团成员，关系归零 */
function neutralize(S, ids) {
  S.neutral = ids.filter(id => S.actors[id]);
  for (const N of S.neutral) {
    const y = S.actors[N];
    for (const id of IDS) { const z = S.actors[id]; if (z.ctrl === N && id !== N) { z.ctrl = id; z.part = null; z.integrated = false; } if (z.overlord === N) z.overlord = null; }
    Object.assign(y, { ctrl: N, part: null, overlord: null, vassalSince: null, integrated: false, resist: 0, occSince: null, moves: [] });
    y.forces = normForces({ [N]: 1 }, N);
    for (const X of IDS) {
      if (X === N) continue; const x = S.actors[X];
      if (x.forces && x.forces[N]) { const v = x.forces[N]; delete x.forces[N]; const h = x.forces[X] || (x.forces[X] = V0()); for (let b = 0; b < 3; b++) h[b] += v[b] || 0; }
      x.moves = (x.moves || []).filter(m => m.to !== N && m.from !== N);
      S.rel[rk(X, N)] = 0; S.rel0[rk(X, N)] = 0;
    }
    S.treaties = S.treaties.filter(t => t.a !== N && t.b !== N);
    S.sanctions = S.sanctions.filter(z => z.from !== N && z.to !== N);
    for (const k of Object.keys(S.infl)) { const [a, b] = k.split('>'); if (a === N || b === N) delete S.infl[k]; }
    for (const k of Object.keys(S.war)) if (k.split('|').includes(N)) delete S.war[k];
    for (const k of Object.keys(S.tension2)) if (k.split('|').includes(N)) delete S.tension2[k];
    S.fronts = S.fronts.filter(f => f.att !== N && f.target !== N && f.def !== N && f.from !== N);
    S.ops = S.ops.filter(z => z.owner !== N && z.target !== N);
    S.blockades = S.blockades.filter(z => z.by !== N && z.target !== N);
    S.ultis = S.ultis.filter(u => u.from !== N && u.loc !== N && u.with !== N && u.t !== N);
    S.crises = S.crises.filter(c => c.from !== N);
    S.commits = S.commits.filter(c => c.with !== N);
    S.loans = S.loans.filter(l => l.from !== N && l.to !== N);
    S.coreC = (S.coreC || []).filter(k => k.o !== N && k.v !== N && k.T !== N && k.loc !== N && k.t !== N);
    for (const id of Object.keys(S.blocs)) { const b = S.blocs[id]; b.members = b.members.filter(m => m !== N); if (b.leader === N || !b.members.length) delete S.blocs[id]; }
    delete S.cb[N]; S.threat[N] = 0;
    if (S.humans) S.humans = S.humans.filter(h => h !== N);
  }
  resetExposure(S);
  return S;
}
/* 永久领土：并入所属国（领土的一部分，没有自己的驻军，不会独立）；在 neutralize 之后调用 */
function provincialize(S) {
  S.prov = {};
  for (const [N, owner] of Object.entries(PROV)) {
    const y = S.actors[N]; if (!y || !S.actors[owner]) continue; S.prov[N] = owner;
    Object.assign(y, { ctrl: owner, part: owner, integrated: true, overlord: null, vassalSince: null, resist: 0, occSince: null, moves: [] }); y.forces = {};
    for (const id of IDS) { const z = S.actors[id]; if (id !== N && z.forces && z.forces[N]) { const v = z.forces[N]; delete z.forces[N]; const h = z.forces[id] || (z.forces[id] = V0()); for (let b = 0; b < 3; b++) h[b] += v[b] || 0; } }
  }
  resetExposure(S);
  return S;
}
/* 不得有外国驻军（网页版 v3：中国）：开局时（或载入旧存档时）外国在它领土上的驻军和正在开进的部队撤回本国，
 * 以它为驻在国的驻军协定（[驻军方, 驻在国]）作废，从它领土出发的外国战线、行动取消。之后由 canStation 挡住 */
function nobaseize(S) {
  S.nobase = NOBASE.filter(id => S.actors[id]);
  const home = (x, X, v) => { const h = x.forces[X] || (x.forces[X] = V0()); for (let b = 0; b < 3; b++) h[b] += (v && v[b]) || 0; };
  for (const X of IDS) {
    const x = S.actors[X]; if (!x || !x.forces) continue;
    for (const L of Object.keys(x.forces)) if (noBase(S, X, L) && S.actors[L].ctrl !== X) { const v = x.forces[L]; delete x.forces[L]; home(x, X, v); }
    if (Array.isArray(x.moves)) x.moves = x.moves.filter(m => { if (!noBase(S, X, m.to)) return true; home(x, X, m.v); return false; });
  }
  S.treaties = S.treaties.filter(t => !(t.type === 'access' && noBase(S, t.a, t.b)));
  S.fronts = S.fronts.filter(f => !noBase(S, f.att, f.from));
  for (const f of S.fronts) if (f.co) f.co = f.co.filter(k => !noBase(S, k.id, f.from));
  S.ops = S.ops.filter(o => !noBase(S, o.owner, o.from));
  resetExposure(S);
  return S;
}
/* 每回合结束时守住两条底线：永久领土始终归所属国；保底国家始终独立（以防其他途径改动了控制权） */
function holdTerritory(S) {
  for (const [N, owner] of Object.entries(S.prov || {})) {
    const y = S.actors[N]; if (!y || !S.actors[owner]) continue;
    if (y.ctrl !== owner || !y.integrated || y.overlord || y.part !== owner) { Object.assign(y, { ctrl: owner, part: owner, integrated: true, overlord: null, vassalSince: null, resist: 0, occSince: null, moves: [] }); y.forces = {}; }
  }
  for (const X of S.guard || []) {
    const x = S.actors[X]; if (!x) continue;
    if (x.ctrl !== X) { x.ctrl = X; x.integrated = false; x.resist = 0; x.occSince = null; x.stab = Math.max(x.stab, 30); if (!(x.land > 0)) rebuildArmy(S, X, 0.2); if (!x.forces || !x.forces[X]) x.forces = Object.assign({}, x.forces, { [X]: [1, 1, 1] }); }
    if (x.overlord) { x.overlord = null; x.vassalSince = null; }
    for (const f of S.fronts) if (f.target === X && f.progress > GCAP) f.progress = GCAP;
  }
}
const PRIS = ACTORS.map(a => JSON.parse(JSON.stringify(a)));
function useScenario(id, force) {
  let s = SCENARIOS[id] || SCENARIOS['2026'];
  if (NEUTRAL.length) s = NEU_SC[s.id] || (NEU_SC[s.id] = neutralScen(s, NEUTRAL)); // 联机网页版：台湾等中立地区
  if (CURS === s && !force) return s;
  if (force) i18nOvReset();
  ACTORS.forEach((a, i) => {
    for (const k of Object.keys(a)) delete a[k];
    Object.assign(a, JSON.parse(JSON.stringify(PRIS[i])));
    const o = s.actors && s.actors[a.id]; if (o) Object.assign(a, JSON.parse(JSON.stringify(o)));
    const iv = s.ind && s.ind[a.id]; if (iv) { a.steel = iv[0]; a.oil = iv[1]; if (iv[2] != null) a.mobMax = iv[2]; if (iv[3] != null) a.mcap = iv[3]; } // 工业与人口数据表
  });
  if (typeof I18N !== 'undefined') I18N.registerNames(ACTORS);
  if (!s.noLandSet) s.noLandSet = new Set((s.noLand || []).map(([a, b]) => (a < b ? a + '|' + b : b + '|' + a)));
  CURS = s;
  scenI18n(s);
  return s;
}
/* 剧本相关的文字：集团与经济圈名称、年代用语（如二战与冷战时期没有“网络攻击”） */
const ERA_I18N = {
  ww2: {
    'a.cyber': ['破坏活动', 'Sabotage'], 'a.cyber.d': ['派特工破坏对方的工厂、铁路和电站', 'Send agents to wreck their factories, railways and power plants'],
    'r.cyber': ['{a}对{t}实施破坏活动，其GDP约-{n}%', '{a:C} ran sabotage operations against {t}; its GDP fell about {n}%'], 'ra.cyber': ['对{t}实施破坏报复', 'retaliated against {t} with sabotage'],
    'co.cyber': ['派特工实施破坏活动（经济损失约{n}%）', 'ran sabotage operations (about {n}% of output lost)'], 'uk.cyber': ['破坏活动', 'a sabotage campaign'], 'mem.cyber': ['破坏活动（已查明）', 'sabotage (traced)'],
    'ai.cyber': ['调查确认：{a}在你国境内实施了破坏活动', 'Traced: {a} ran sabotage operations inside your country'],
    'cr.cyber_unknown.t': ['大规模破坏事件', 'Wave of sabotage'], 'cr.cyber_unknown.x': ['你国多处工厂、铁路与电站遭到破坏。初步迹象指向{a}，但尚无确证。', 'Factories, railways and power plants across your country have been sabotaged. Early signs point to {a}, but there is no proof yet.'],
    'gz.drone': ['侦察机越界', 'a reconnaissance overflight'], 'uk.propaganda': ['宣传攻势', 'a propaganda campaign'], 'a.propaganda': ['宣传战', 'Propaganda'],
    'a.strike.d': ['对对方军事目标实施有限空袭', 'Limited air raids on military targets'], 'u.air': ['空军', 'Air force'], 'u.mix.air': ['空军优先', 'Air force first'],
  },
  cold: {
    'a.cyber': ['破坏活动', 'Sabotage'], 'a.cyber.d': ['派特工破坏对方的关键设施', 'Send agents to sabotage their key installations'],
    'r.cyber': ['{a}对{t}实施破坏活动，其GDP约-{n}%', '{a:C} ran sabotage operations against {t}; its GDP fell about {n}%'], 'ra.cyber': ['对{t}实施破坏报复', 'retaliated against {t} with sabotage'],
    'co.cyber': ['派特工实施破坏活动（经济损失约{n}%）', 'ran sabotage operations (about {n}% of output lost)'], 'uk.cyber': ['破坏活动', 'a sabotage campaign'], 'mem.cyber': ['破坏活动（已查明）', 'sabotage (traced)'],
    'ai.cyber': ['调查确认：{a}在你国境内实施了破坏活动', 'Traced: {a} ran sabotage operations inside your country'],
    'cr.cyber_unknown.t': ['大规模破坏事件', 'Wave of sabotage'], 'cr.cyber_unknown.x': ['你国多处关键设施遭到破坏。初步迹象指向{a}，但尚无确证。', 'Key installations across your country have been sabotaged. Early signs point to {a}, but there is no proof yet.'],
    'gz.drone': ['侦察机越界', 'a reconnaissance overflight'],
  },
};
let I18N_BAK = null;
function scenI18n(s) {
  if (typeof I18N === 'undefined' || !I18N.dict) return;
  if (I18N_BAK) { for (const [k, v] of Object.entries(I18N_BAK)) { if (v === null) delete I18N.dict[k]; else I18N.dict[k] = v; } I18N_BAK = null; }
  const add = {};
  for (const b of (s.blocs || [])) if (b.name) add['bloc.' + b.id] = [b.name, b.en || b.name];
  for (const e of (s.timeline || [])) if (e.type === 'bloc' && e.name) add['bloc.' + e.id] = [e.name, e.en || e.name];
  for (const [k, v] of Object.entries(s.econNames || {})) add['econ.' + k] = v;
  Object.assign(add, ERA_I18N[s.era] || {}, s.i18n || {});
  I18N_BAK = {}; for (const k of Object.keys(add)) I18N_BAK[k] = I18N.dict[k] ?? null;
  I18N.add(add);
}
function sc() { return CURS || useScenario('2026'); }
const scenarioList = () => Object.values(SCENARIOS).sort((a, b) => (a.order ?? 9) - (b.order ?? 9)).map(s => ({ id: s.id, year: s.year, q: s.q, title: s.title, blurb: s.blurb }));
/* 抽象战力 → 具体装备的换算系数 */
function initUnits(S, id) {
  const x = S.actors[id], inv = (sc().inv || {})[id], g = sc().unitK || { t: 2.2, a: 1.4, s: 0.1 };
  const t = inv ? inv[0] : x.land * g.t, a = inv ? inv[1] : x.air * g.a, s = inv ? inv[2] : x.navy * g.s;
  x.k = { t: x.land > 0 ? t / x.land : g.t, a: x.air > 0 ? a / x.air : g.a, s: x.navy > 0 ? s / x.navy : g.s };
}
function normForces(src, id) {
  const f0 = {}, tot = [0, 0, 0];
  for (const k in src) { const v = isV(src[k]) ? src[k].slice() : [src[k], src[k], src[k]]; f0[k] = v; for (let b = 0; b < 3; b++) tot[b] += v[b]; }
  if (!f0[id]) f0[id] = V0();
  for (const k in f0) for (let b = 0; b < 3; b++) f0[k][b] = tot[b] > 0 ? f0[k][b] / tot[b] : (k === id ? 1 : 0);
  return f0;
}

/* ---------- 新游戏 ---------- */
function newGame(opt) {
  let SC = useScenario(opt.scen || '2026', true); // 重置国名等可能被上一局改动的定义
  if (SC.thOnly && !(opt.th && TH_ON)) SC = thStripScen(SC); // 联机版：只在精细战区中独立的势力（中共）在关闭时（或构建里没有战区数据时）并入原政府
  const seed = (opt.seed >>> 0) || (Math.floor(Math.random() * 2 ** 31) >>> 0);
  const P = opt.player;
  const S = {
    v: 5, scen: SC.id, seed, rng: seed | 0, turn: 0, year: SC.year, q: SC.q, player: P, goal: opt.goal || 'hegemony', diff: opt.diff || 'normal', strict: !!opt.strict, llm: !!opt.llm,
    actors: {}, rel: {}, rel0: {}, infl: {}, treaties: [], blocs: {}, sanctions: [], war: {}, fronts: [], ops: [], blockades: [], loans: [],
    queue: [], inbox: [], log: [], history: [], chat: {}, heg: 0, over: null, report: null, globalMod: [], seq: 1, tension: SC.tension ?? 30, lastEvents: [], turnEvents: [],
    warnings: [], ultis: [], crises: [], commits: [], cb: {}, mem: {}, grudge: {}, favor: {}, threat: {}, tension2: {}, unattrib: [], crossed: {}, intelLog: [], carry: [], cbmUntil: -1, lowStab: 0,
    coreC: [], coreSeen: {}, coreLLM: {}, reqs: [],
  };
  if (NEUTRAL.length) S.neutral = NEUTRAL.slice(); // 单人版没有这个字段（结果与以前逐位相同）
  const FO = SC.forces || {};
  for (const d of ACTORS) {
    const stock = d.milex * d.ppp * 4 * (d.stock || 1), pm = d.id === P ? 0 : 0.15;
    S.actors[d.id] = {
      id: d.id, gdp: d.gdp, tech: d.tech, stab: d.stab, ctrl: d.id, overlord: null, vassalSince: null, integrated: false, resist: 0, occSince: null, fund: 0, part: null,
      land: stock * d.mix[0], navy: stock * d.mix[1], air: stock * d.mix[2], mix: d.mix.slice(), nukes: d.nukes, nukeProg: d.nukeProg || 0,
      milPct: d.gdp > 0 ? +(d.milex / d.gdp * 100).toFixed(2) : 0, mob: 0, treasury: d.gdp * 0.01, mods: [],
      hawk: clamp(d.hawk + (rnd(S) - 0.5) * 2 * pm, 0.02, 0.98), risk: clamp(d.risk + (rnd(S) - 0.5) * 2 * pm, 0.02, 0.98),
      econ: d.econ, loyal: clamp(d.loyal + (rnd(S) - 0.5) * 2 * pm, 0.05, 0.98), lastG: d.growth / 4, fear: {}, flags: {},
      intel: d.intel ?? 40, cred: 60, forces: normForces(FO[d.id] || { [d.id]: 1 }, d.id), moves: [], plan: null,
      pers: d.pers, train: [], orders: [],
    };
    { const x0 = S.actors[d.id]; x0.cu = clamp(x0.milPct / 100 / mcapOf(d.id) * 1.1, 0.02, 1); }
    initUnits(S, d.id);
  }
  for (const [id, lv] of Object.entries(SC.mob || {})) if (S.actors[id]) S.actors[id].mob = lv;
  for (const d of ACTORS) { const x0 = S.actors[d.id]; x0.ppl = x0.land > 0 ? d.pers / (x0.land * (1 + 0.12 * x0.mob)) : 0; } // 每单位陆军战力对应的兵员（千人）
  // 并入、占领、附庸
  for (const [id, owner] of Object.entries(SC.part || {})) { const y = S.actors[id]; if (!y || !S.actors[owner]) continue; y.ctrl = owner; y.part = owner; y.integrated = true; y.forces = {}; y.moves = []; }
  for (const [id, v] of Object.entries(SC.occ || {})) { const y = S.actors[id]; const [occ, res] = v; if (!y || !S.actors[occ]) continue; y.ctrl = occ; y.integrated = false; y.resist = res; y.occSince = -4; y.forces = {}; y.moves = []; if (v[2]) y.part = v[2]; }
  for (const [id, lord] of Object.entries(SC.vassal || {})) { const y = S.actors[id]; if (!y || !S.actors[lord]) continue; y.overlord = lord; y.vassalSince = -8; }
  for (const b of (SC.blocs || [])) S.blocs[b.id] = { id: b.id, type: b.type, leader: b.leader, members: b.members.slice() };
  for (const [type, a, b] of (SC.treaties || [])) if (S.actors[a] && S.actors[b]) S.treaties.push({ type, a, b, since: 0 });
  for (const [bloc, m] of Object.entries(SC.econ || {})) if ((SC.tradeBlocs || []).includes(bloc)) for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) S.treaties.push({ type: 'trade', a: m[i], b: m[j], since: 0, econ: bloc });
  for (let i = 0; i < IDS.length; i++) for (let j = i + 1; j < IDS.length; j++) {
    const a = IDS[i], b = IDS[j]; let v = 0;
    if (sameBloc(S, a, b)) v += 25;
    for (const m of Object.values(SC.econ || {})) if (m.includes(a) && m.includes(b)) v += 8;
    if (dist(a, b) < 1500) v += 3;
    S.rel[rk(a, b)] = v;
  }
  for (const line of String(SC.rel || '').split('\n')) for (const item of line.split('|')) { const p = item.trim().split(/\s+/); if (p.length === 3 && DEF[p[0]] && DEF[p[1]]) S.rel[rk(p[0], p[1])] = +p[2]; }
  for (const k in S.rel) { S.rel[k] = clamp(S.rel[k] + Math.round(rn(S) * 4), -100, 100); S.rel0[k] = S.rel[k]; }
  for (const t of S.treaties) { const big = x => DEF[x].gdp > 2000 * (SC.gdpScale || 1); if (t.type === 'alliance' || t.type === 'partner' || t.type === 'access') { if (big(t.a)) addInfl(S, t.a, t.b, 12); if (big(t.b)) addInfl(S, t.b, t.a, 12); } }
  for (const [a, b, v] of (SC.infl || [])) addInfl(S, a, b, v);
  for (const [from, to, kind, level] of (SC.sanctions || [])) if (S.actors[from] && S.actors[to]) addSanction(S, from, to, kind, level);
  for (const [a, b, since, limited] of (SC.wars || [])) { S.war[rk(a, b)] = { since: since ?? -1, a, b, limited: !!limited }; setRel(S, a, b, Math.min(rel(S, a, b), -70)); S.rel0[rk(a, b)] = S.rel[rk(a, b)]; }
  for (const z of (SC.fronts || [])) {
    if (!S.actors[z.att] || !S.actors[z.target]) continue;
    const v = z.v ? z.v.slice() : vecOf(z.kind === 'amph' ? 'all' : 'land', z.share || 0.4);
    const f = { id: 'F' + S.seq++, att: z.att, target: z.target, def: boss(S, z.target), from: z.from || z.att, v, kind: z.kind || 'land', phase: z.phase || 'land', sp: z.sp || 0, tries: 0, progress: z.progress || 0, turns: z.turns || 1, phaseTurns: z.turns || 1, last: z.last ?? 0, hist: (z.hist || [z.progress || 0]).slice(), surprise: false, haste: 0, co: [], log: [], cas: { a: [0, 0, 0, 0], d: [0, 0, 0, 0] }, taken: [], core: null, start: -(z.turns || 1), tv: v.slice() };
    if (z.shock) { f.shock = z.shock[0]; f.shockUntil = z.shock[1]; } // 开局的突击优势（如闪电战）：[倍数, 持续到第几回合]
    f.obj = frontObjectives(S, f); f.taken = f.obj.filter(([, thr]) => f.progress >= thr).map(([i]) => i);
    S.fronts.push(f);
  }
  for (const [a, b, v] of (SC.tension2 || [])) S.tension2[rk(a, b)] = v;
  if (NEUTRAL.length) neutralize(S, NEUTRAL);
  if (Object.keys(PROV).length) provincialize(S); // 联机网页版：台湾是中国领土
  if (NOBASE.length) nobaseize(S); // 网页版 v3：中国领土上不允许外国驻军
  if (GUARD[SC.id] && GUARD[SC.id].length) S.guard = GUARD[SC.id].filter(id => S.actors[id]); // 联机网页版：1939 年开局的中国不会战败
  if (SHIELD.length) S.shield = SHIELD.filter(id => S.actors[id]); // 联机网页版：中国按中国标准处理（见 01_core.js 的 SHIELD）
  for (const e of enemies(S, P)) grantCB(S, e, 'attacked', 400, false);
  resetExposure(S);
  for (const id of IDS) { S.actors[id].g0 = growthPenalty(S, id); S.actors[id].p0 = stabPressure(S, id); }
  initPolitics(S);
  threatTurn(S, null, true);
  coreBaseline(S);
  for (const z of (SC.coreStart || [])) coreOpen(S, z);
  snapshotHistory(S);
  S.report = { turn: 0, intro: true };
  logEvent(S, 'start', M('log.start', { a: P }), 'info', [P]);
  if (opt.th && TH_ON) thInit(S); // 联机版：精细战区
  if (opt.humans) setupHumans(S, opt.humans); // 联机版：多个真人席位
  return S;
}
function thStripScen(SC) {
  const out = Object.assign({}, SC), ids = new Set(SC.thOnly), has = arr => arr.some(v => ids.has(v));
  out.part = Object.assign({}, SC.part || {}); for (const id of ids) out.part[id] = (SC.thOwner || {})[id];
  out.treaties = (SC.treaties || []).filter(t => !has(t)); out.wars = (SC.wars || []).filter(w => !has(w));
  out.forces = Object.assign({}, SC.forces || {}); for (const id of ids) delete out.forces[id];
  return out;
}
/* ---------- 剧本时间线：历史节点事件 ----------
 * 只改变 AI 国家；涉及玩家时只提示“历史上此时……”，由玩家自己决定。
 */
function scenEvents(S, R) {
  const P = S.player, isH = z => isHuman(S, z); S.evDone = S.evDone || {};
  const TL = sc().timeline || [];
  for (let i = 0; i < TL.length; i++) {
    const e = TL[i]; if (e.t !== S.turn || S.evDone[i]) continue; S.evDone[i] = true;
    if (e.cond && !evCond(S, e.cond)) continue; // 条件不满足（历史已经改变）就不发生
    if (e.thSkip && S.th) continue; // 联机版精细战区：改由战区局势触发（见 TH_DATA.*.join）
    const msg = e.msg ? M(e.msg) : null;
    const push = (about, tone) => { if (!msg) return; const ab = (about || []).filter(z => z && S.actors[z]); const hh = ab.filter(isH); const it = { actor: ab[0] || P, msg, tone: tone || 'info', big: true, about: ab.slice(1) }; for (const H of hh) RP(S, H, R).toYou.push(it); if (!hh.length) R.world.push(it); logEvent(S, 'event', msg, 'info', ab); };
    const toP = (H, about) => { if (msg) { RP(S, H, R).toYou.push({ actor: about || H, msg: M('ev.hist_you', { x: msg }), tone: 'info', big: true }); logEvent(S, 'event', M('ev.hist_you', { x: msg }), 'info', [H]); } };
    try {
      switch (e.type) {
        case 'note': push([e.who].concat(e.about || [])); break;
        case 'free': { const y = S.actors[e.id]; if (!y || y.overlord !== e.lord || !indep(S, e.id)) break; if (isH(e.lord)) { toP(e.lord, e.id); break; } y.overlord = null; y.vassalSince = null; y.stab = Math.max(y.stab, e.stab ?? 45); setRel(S, e.id, e.lord, e.rel ?? Math.max(rel(S, e.id, e.lord), 10)); if (e.with) addTreaty(S, e.with, e.id, e.lord); push([e.id, e.lord]); pushEv(S, { type: 'independence', actor: e.id, target: e.lord, sev: 10, hidden: true }); break; }
        case 'release': {
          const y = S.actors[e.id]; if (!y || y.ctrl !== e.from || e.id === e.from) break; if (isH(e.from)) { toP(e.from, e.id); break; }
          y.ctrl = e.id; y.resist = 0; y.occSince = null; y.integrated = false; y.part = null; y.stab = e.stab ?? 45; rebuildArmy(S, e.id, e.army ?? 0.25);
          if (e.loyal != null) y.loyal = e.loyal; if (e.hawk != null) y.hawk = e.hawk; if (e.milPct != null) y.milPct = e.milPct;
          if (e.as === 'vassal') { y.overlord = e.from; y.vassalSince = S.turn; } else if (e.as) addTreaty(S, e.as, e.id, e.from);
          for (const a of (e.access || [e.from])) if (S.actors[a] && a !== e.id && !noBase(S, a, e.id)) addTreaty(S, 'access', a, e.id);
          setRel(S, e.id, e.from, e.rel ?? Math.max(rel(S, e.id, e.from), 30)); resetExposure(S); push([e.id, e.from]); break;
        }
        case 'bloc': {
          if (S.blocs[e.id]) break; const L = e.leader; if (!indep(S, L)) break; if (isH(L)) { toP(L, L); break; }
          const mem = e.members.filter(m => !isH(m) && S.actors[m] && indep(S, m) && !S.actors[m].overlord && !atWar(S, m, L) && (m === L || rel(S, m, L) >= 10));
          if (mem.filter(m => m !== L).length < 1) break;
          S.blocs[e.id] = { id: e.id, type: 'defense', leader: L, members: mem.includes(L) ? mem : [L].concat(mem), noCall: !!e.noCall };
          push([L].concat(mem.filter(m => m !== L)));
          for (const H of e.members.filter(isH)) if (H !== L && indep(S, H) && !atWar(S, H, L)) withSeat(S, H, () => pushOffer(S, mkOffer(S, L, { type: 'alliance' }, M('ev.join_bloc', { a: L, b: M('bloc.' + e.id) }))));
          break;
        }
        case 'vassal': { const y = S.actors[e.id]; if (!y || !indep(S, e.id) || y.overlord || !indep(S, e.lord)) break; if (isH(e.id) || isH(e.lord)) { if (isH(e.id)) toP(e.id, e.lord); if (isH(e.lord)) toP(e.lord, e.id); break; } makeVassal(S, e.id, e.lord); push([e.lord, e.id], 'warn'); break; }
        case 'treaty': if (S.actors[e.a] && S.actors[e.b] && !isH(e.a) && !isH(e.b) && indep(S, e.a) && indep(S, e.b) && !atWar(S, e.a, e.b)) { addTreaty(S, e.kind, e.a, e.b); push([e.a, e.b]); } break;
        case 'boom': { const ok = (e.ids || []).filter(id => S.actors[id] && indep(S, id) && (!e.with || (!atWar(S, id, e.with) && (id === e.with || rel(S, id, e.with) >= (e.rel ?? 15))))); for (const id of ok) { S.actors[id].mods.push({ g: e.g || 0.5, turns: e.turns || 8, src: 'boom' }); if (e.with && id !== e.with) { addRel(S, id, e.with, 6); addInfl(S, e.with, id, 8); } } if (ok.length) push([e.with || ok[0]].concat(ok)); break; }
        case 'war': {
          const A = e.a, T = e.to; if (isH(A)) { toP(A, T); break; }
          if (!indep(S, A) || !S.actors[T] || boss(S, T) === A || S.actors[T].ctrl === A || S.ops.some(o => o.owner === A && o.target === T) || S.fronts.some(f => f.att === A && f.target === T)) break;
          if (atWar(S, A, boss(S, T)) && !e.even) break;
          let r = createOp(S, A, T, e.share || 0.45, false, e.from);
          if (!r.op && r.err === 'noforce') { S.ops = S.ops.filter(o => !(o.owner === A && !o.script && !o.core)); r = createOp(S, A, T, e.share || 0.45, false, e.from); } // 历史节点优先：取消其他尚未发动的行动，腾出兵力
          if (!r.op) break; r.op.legit = true; r.op.script = true; r.op.ready = Math.min(r.op.ready, S.turn + 1); push([A, T], 'warn'); break;
        }
        case 'declare': { // 宣战（不一定立即发动地面进攻），如 1940 年意大利参战
          const A = e.a; if (isH(A)) { toP(A, [].concat(e.to)[0]); break; } if (!indep(S, A)) break;
          const tg = [].concat(e.to).filter(T => S.actors[T] && indep(S, T) && T !== A && !atWar(S, A, T) && !isAlly(S, A, T) && !(S.actors[T].overlord && S.actors[T].overlord !== A && !atWar(S, A, S.actors[T].overlord)));
          for (const T of tg) { declareWar(S, A, T); logEvent(S, 'war', M('m.war', { a: A, b: T }), 'warn', [A, T]); pushEv(S, { type: 'declare', actor: A, target: T, sev: 50, third: 15, big: true }); if (isH(T)) withSeat(S, T, () => grantCB(S, A, 'attacked', 20)); }
          S.actors[A].mob = Math.max(S.actors[A].mob, 2);
          if (tg.length) push([A].concat(tg), 'warn'); break;
        }
        case 'annex': { // 和平吞并（如 1940 年苏联吞并波罗的海三国）
          const y = S.actors[e.id], B = e.by; if (!y || !indep(S, e.id) || !indep(S, B) || atWar(S, e.id, B) || y.overlord && y.overlord !== B) break;
          if (isH(e.id) || isH(B)) { if (isH(e.id)) toP(e.id, B); if (isH(B)) toP(B, e.id); break; }
          y.ctrl = B; y.part = B; y.integrated = true; y.overlord = null; y.resist = 0; y.forces = {}; y.moves = [];
          for (const b of Object.values(S.blocs)) b.members = b.members.filter(m => m !== e.id);
          S.treaties = S.treaties.filter(z => z.a !== e.id && z.b !== e.id); S.sanctions = S.sanctions.filter(z => z.from !== e.id && z.to !== e.id);
          for (const E of enemies(S, e.id)) delete S.war[rk(e.id, E)];
          S.fronts = S.fronts.filter(f => f.att !== e.id); S.ops = S.ops.filter(o => o.owner !== e.id);
          resetExposure(S); push([B, e.id], 'warn'); pushEv(S, { type: 'conquest', actor: B, target: e.id, sev: 40, third: 12, big: true }); break;
        }
        case 'core': { // 开启一场核心利益危机（如 1941 年日本对美国石油禁运的反应）
          const ex = S.coreC.find(k => k.cid === e.cid && k.status === 'active');
          if (ex) { if (ex.v === e.v && !isH(ex.o) && (e.lvl || 2) > ex.lvl) { ex.lvl = e.lvl || 2; ex.due = Math.min(ex.due, S.turn + (e.due ?? 1)); } break; } // 已因玩家的行动自然触发：按历史节奏提升到相应等级
          const c = coreList().find(z => z.id === e.cid); if (!c || !S.actors[e.v]) break;
          if (isH(c.o)) { toP(c.o, e.v); break; }
          const k = coreOpen(S, { cid: e.cid, v: e.v, lvl: e.lvl || 2, due: S.turn + (e.due ?? 1), age: 1 }); if (k) push([k.o, k.v], 'warn'); break;
        }
        case 'revolution': {
          const X = e.id, x = S.actors[X]; if (!x || !indep(S, X)) break; if (isH(X)) { toP(X, X); break; }
          if (x.stab >= (e.stab ?? 55) || infl(S, e.to, X) + 12 < infl(S, e.from, X)) { if (e.fail) { R.world.push({ actor: X, msg: M(e.fail), tone: 'info', big: true }); logEvent(S, 'event', M(e.fail), 'info', [X]); } break; }
          for (const h of treatiesOf(S, X, e.from)) removeTreaty(S, h.type, X, e.from);
          setRel(S, X, e.from, -40); setRel(S, X, e.to, 60); addTreaty(S, 'alliance', X, e.to); addInfl(S, e.to, X, 20); S.infl[e.from + '>' + X] = 0;
          x.hawk = e.hawk ?? 0.7; x.stab = 48; x.overlord = null; if (e.doc) x.doc = e.doc;
          for (const f of S.fronts) if (f.att === X) f.v = vmul(f.v, 0.5);
          const T = e.split; if (T && S.actors[T] && S.actors[T].ctrl === X && !PRV(S, T)) { const t = S.actors[T]; t.ctrl = T; t.part = null; t.integrated = false; t.resist = 0; t.stab = 50; rebuildArmy(S, T, e.army ?? 0.3); addTreaty(S, 'partner', T, e.from); setRel(S, T, X, -85); setRel(S, T, e.from, 55); if (e.splitDoc) t.doc = e.splitDoc; }
          resetExposure(S); push([X, e.to, e.from].concat(T ? [T] : []), 'warn'); break;
        }
        case 'surrender': { // 战败投降（如1943年意大利、1945年德国与日本），只对 AI 国家生效
          const X = e.id; if (!S.actors[X] || !indep(S, X) || S.actors[X].overlord || GRD(S, X)) break; if (isH(X)) { toP(X, X); break; }
          const ens = enemies(S, X).filter(E => indep(S, E)); if (!ens.length) break;
          surrender(S, X, ens, R, e.to); push([X].concat(ens.slice(0, 3)), 'warn'); break;
        }
        case 'nukehit': { // 摧毁核设施（如1981年以色列空袭伊拉克核反应堆）
          const x = S.actors[e.id]; if (!x || !indep(S, e.id) || x.nukes > 0 || isH(e.id)) break; if (e.by && (isH(e.by) || !indep(S, e.by))) break;
          x.nukeProg = Math.max(0, (x.nukeProg || 0) - (e.d || 40)); if (e.by) addRel(S, e.by, e.id, -20); push([e.by || e.id, e.id], 'warn'); break;
        }
        case 'nuke': { // 历史上的核打击（1945年广岛、长崎），只由 AI 执行
          const A = e.by, X = e.to; if (isH(A) || !indep(S, A) || !S.actors[X] || !indep(S, X) || !(S.actors[A].nukes > 0) || !atWar(S, A, X) || S.actors[X].flags.nukedAt != null) break;
          nuclearStrike(S, A, X, 'tactical', R); S.actors[X].flags.nukedAt = S.turn; break;
        }
        case 'peace': { // 停战（如1949年阿以停战、1953年朝鲜停战）
          const done = []; for (const a of [].concat(e.a)) for (const b of [].concat(e.b)) { if (isH(a) || isH(b) || !atWar(S, a, b)) continue; makePeace(S, a, b, 'ceasefire', R); done.push(a, b); }
          if (done.length) push([...new Set(done)]); break;
        }
        case 'deploy': { // AI 按历史调动部队（如1949年美军撤出朝鲜、1950年美军驰援）
          const X = e.id, x = S.actors[X]; if (!x || isH(X) || !indep(S, X) || !S.actors[e.to] || !canStation(S, X, e.to)) break;
          const from = e.from || X; const v = vmin(e.v || [0.05, 0.05, 0.05], freeV(S, X, from)); if (vmax(v) < 0.003) break;
          if (e.now) { x.forces[from] = vsub0(x.forces[from], v); if (vsum(x.forces[from]) < 1e-4 && from !== X) delete x.forces[from]; x.forces[e.to] = vadd(x.forces[e.to] || V0(), v); } else orderMove(S, X, from, e.to, v);
          push([X, e.to]); break;
        }
        case 'sanction': if (!isH(e.from) && indep(S, e.from) && indep(S, e.to)) { addSanction(S, e.from, e.to, e.kind || 'econ', e.level || 1); push([e.from, e.to]); } break;
        case 'rel': if (S.actors[e.a] && S.actors[e.b]) { addRel(S, e.a, e.b, e.d || 0); push([e.a, e.b]); } break;
        case 'nukeprog': { const x = S.actors[e.id]; if (!x || !indep(S, e.id) || x.nukes > 0) break; if (isH(e.id)) { toP(e.id, e.id); break; } x.nukeProg = Math.max(x.nukeProg || 0, e.prog || 10); push([e.id]); break; }
        case 'stab': if (S.actors[e.id] && indep(S, e.id)) { S.actors[e.id].stab = clamp(S.actors[e.id].stab + (e.d || 0), 0, 100); push([e.id]); } break;
        case 'hawk': if (S.actors[e.id] && !isH(e.id)) { S.actors[e.id].hawk = clamp(S.actors[e.id].hawk + (e.d || 0), 0.02, 0.98); push([e.id]); } break;
        case 'buildup': if (!isH(e.id) && indep(S, e.id)) { const x = S.actors[e.id]; x.milPct = clamp(x.milPct + (e.pct || 1), 0.3, 30); x.flags.buildupTo = S.turn + (e.turns || 8); if (e.pers) { const per = x.land / Math.max(1, x.pers || 1); x.pers = (x.pers || 0) + e.pers; x.land += e.pers * per * 0.45; } if (e.landK) { x.land *= e.landK; x.air *= e.airK ?? 1; } if (e.mob) x.mob = Math.max(x.mob, e.mob); push([e.id]); } else if (isH(e.id)) toP(e.id, e.id); break;
        case 'tension': if (S.actors[e.a] && S.actors[e.b]) { S.tension2[rk(e.a, e.b)] = clamp((S.tension2[rk(e.a, e.b)] || 0) + (e.d || 20), 0, 100); S.tension = clamp(S.tension + (e.g || 0), 0, 100); push([e.a, e.b], 'warn'); } break;
      }
    } catch (err) { if (typeof console !== 'undefined') console.error('scenEvent', e, err); }
  }
}
/* 时间线条件：['ctrl', 地区, 控制者] | ['indep', 国家] | ['war', a, b] | ['nowar', a, b] */
function evCond(S, c) {
  const [k, a, b] = c; if (k === 'any') return c.slice(1).some(z => evCond(S, z)); if (k === 'all') return c.slice(1).every(z => evCond(S, z));
  if (k === 'nuked') return !!S.actors[a] && S.actors[a].flags.nukedAt != null;
  if (k === 'nukes') return !!S.actors[a] && S.actors[a].nukes > 0;
  switch (k) {
    case 'ctrl': return !!S.actors[a] && S.actors[a].ctrl === b;
    case 'indep': return indep(S, a);
    case 'war': return atWar(S, a, b);
    case 'nowar': return !atWar(S, a, b);
    case 'front': return S.fronts.some(f => (f.att === a || (f.co || []).some(k => k.id === a)) && f.target === b && f.phase === 'land' && f.progress >= (c[3] ?? 10)); // ['front', 进攻方, 目标, 最低推进%]
    case 'any': return c.slice(1).some(z => evCond(S, z));
    case 'sanc': return (S.sanctions || []).some(s => s.from === a && s.to === b && (!c[3] || s.kind === c[3])); // ['sanc', 发起方, 对象, 种类]
  }
  return true;
}
/* 可选的国家：独立且非附庸 */
function playable(S) { return IDS.filter(id => S.actors[id].ctrl === id && !S.actors[id].overlord && !NEU(S, id)); }

/* 存档里有、当前构建里没有的势力（网页版不再单列中共）：删掉它和指向它的记录，驻在那里的兵力回到本国 */
function dropGone(o) {
  const gone = Object.keys(o.actors).filter(id => !DEF[id]); if (!gone.length) return;
  const g = new Set(gone), hit = k => String(k).split(/[|>]/).some(p => g.has(p)), any = (...v) => v.some(x => g.has(x));
  for (const id of gone) delete o.actors[id];
  for (const k of ['rel', 'rel0', 'infl', 'war', 'tension2', 'threat', 'mem', 'grudge', 'favor', 'cb', 'crossed', 'coreSeen', 'coreLLM']) { const m = o[k]; if (m && typeof m === 'object' && !Array.isArray(m)) for (const q of Object.keys(m)) if (hit(q)) delete m[q]; }
  o.treaties = (o.treaties || []).filter(t => !any(t.a, t.b));
  o.fronts = (o.fronts || []).filter(f => !any(f.att, f.target, f.def));
  o.ops = (o.ops || []).filter(op => !any(op.owner, op.target));
  if (Array.isArray(o.neutral)) o.neutral = o.neutral.filter(id => !g.has(id));
  for (const b of Object.values(o.blocs || {})) if (Array.isArray(b.members)) b.members = b.members.filter(id => !g.has(id));
  for (const x of Object.values(o.actors)) {
    if (x.forces) for (const L of Object.keys(x.forces)) if (g.has(L)) { x.forces[x.id] = vadd(x.forces[x.id] || V0(), x.forces[L]); delete x.forces[L]; }
    for (const m of (x.moves || [])) { if (g.has(m.to)) m.to = x.id; if (g.has(m.from)) m.from = x.id; }
    if (g.has(x.ctrl)) x.ctrl = x.id; if (g.has(x.part)) x.part = null; if (g.has(x.overlord)) { x.overlord = null; x.vassalSince = null; }
  }
  o._exp = null;
}
/* ---------- 存档迁移（v4 → v5） ---------- */
function migrate(o) {
  if (!o || !o.actors) throw new Error('bad');
  if (o.v === 5) { useScenario(o.scen || '2026', true); dropGone(o); applyDefOv(o); o.coreLLM = {}; if (NEUTRAL.length && !(o.neutral && o.neutral.length)) neutralize(o, NEUTRAL); if (Object.keys(PROV).length && !o.prov) { o.neutral = (o.neutral || []).concat(Object.keys(PROV).filter(k => !(o.neutral || []).includes(k))); provincialize(o); } if (GUARD[o.scen] && GUARD[o.scen].length) { const g = new Set(o.guard || []); for (const id of GUARD[o.scen]) if (o.actors[id]) g.add(id); o.guard = [...g]; } if (NOBASE.length && !o.nobase) nobaseize(o); if (SHIELD.length && !o.shield) o.shield = SHIELD.filter(id => o.actors[id]); return o; } // 网页版载入以前的存档：补上中立地区、永久领土、保底与“不得有外国驻军”
  if (o.v !== 4) throw new Error('old');
  useScenario('2026'); o.scen = '2026';
  for (const id of Object.keys(o.actors)) {
    const x = o.actors[id];
    for (const L in x.forces) { const s = x.forces[L]; x.forces[L] = isV(s) ? s : [s, s, s]; }
    x.moves = (x.moves || []).map(m => ({ from: m.from, to: m.to, v: isV(m.v) ? m.v : [m.share, m.share, m.share], eta: m.eta }));
    x.pers = x.pers ?? DEF[id].pers; x.train = x.train || []; x.orders = x.orders || []; x.part = x.part || null;
    if (!x.k) initUnits(o, id);
  }
  for (const f of o.fronts) { if (!f.v) f.v = f.kind === 'amph' ? [f.share, f.share, f.share] : [f.share, 0, f.share]; delete f.share; f.co = f.co || []; f.log = f.log || []; f.cas = f.cas || { a: [0, 0, 0, 0], d: [0, 0, 0, 0] }; f.taken = f.taken || []; }
  for (const op of o.ops) { if (!op.v) op.v = op.kind === 'amph' ? [op.share, op.share, op.share] : [op.share, 0, op.share]; delete op.share; }
  for (const q of (o.queue || [])) if (q.type === 'deploy' && !q.v) { q.v = [q.share, q.share, q.share]; delete q.share; }
  for (const k in o.war) o.war[k].limited = !!o.war[k].limited;
  o.coreC = o.coreC || []; o.coreSeen = o.coreSeen || {}; o.coreLLM = {}; o.reqs = o.reqs || [];
  for (const id of IDS) if (o.actors[id].ctrl === id) renorm(o, id);
  coreBaseline(o);
  o.v = 5;
  return o;
}
