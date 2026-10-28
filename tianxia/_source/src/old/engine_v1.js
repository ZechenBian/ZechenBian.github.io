// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 规则引擎（纯逻辑，可在 Node 中测试） ===================== */
const WG = (() => {
'use strict';
const DEF = Object.fromEntries(ACTORS.map(a => [a.id, a]));
const IDS = ACTORS.map(a => a.id);
const NAME = id => (DEF[id] ? DEF[id].name : id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rk = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const LANDLOCKED = new Set(['CEU', 'BLR', 'MNG', 'CAS']);
const ISLAND = new Set(['JPN', 'TWN', 'GBR', 'AUS', 'OCE']);
const GOVW = { dem: 1.35, hyb: 1.0, aut: 0.7 };
const DIST = new Map();
for (const [k, v] of Object.entries(GEO.dist)) { const [a, b] = k.split('|'); DIST.set(rk(a, b), v); }
const dist = (a, b) => (a === b ? 0 : (DIST.get(rk(a, b)) ?? 20000));
const landAdj = (a, b) => GEO.land[a] && GEO.land[a].includes(b);

/* ---------- 随机数（可复现） ---------- */
function rnd(S) { S.rng = (S.rng + 0x6D2B79F5) | 0; let t = S.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function rn(S) { let u = 0; while (u === 0) u = rnd(S); const v = rnd(S); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const chance = (S, p) => rnd(S) < p;
const pick = (S, arr) => arr[Math.floor(rnd(S) * arr.length)];
const between = (S, a, b) => a + (b - a) * rnd(S);

/* ---------- 基础访问 ---------- */
const A = (S, id) => S.actors[id];
const rel = (S, a, b) => (a === b ? 100 : (S.rel[rk(a, b)] ?? 0));
function addRel(S, a, b, d) { if (a === b || !d) return; const k = rk(a, b); S.rel[k] = clamp((S.rel[k] ?? 0) + d, -100, 100); }
function setRel(S, a, b, v) { if (a !== b) S.rel[rk(a, b)] = clamp(v, -100, 100); }
const infl = (S, a, b) => S.infl[a + '>' + b] || 0;
function addInfl(S, a, b, d) { if (a === b) return; const k = a + '>' + b; S.infl[k] = clamp((S.infl[k] || 0) + d, 0, 100); }
const indep = (S, id) => S.actors[id].ctrl === id;
const alive = (S, id) => indep(S, id);
function boss(S, id) { const x = S.actors[id]; if (x.ctrl !== id) return x.ctrl; return x.overlord || id; }
function realm(S, p) { return IDS.filter(id => { const x = S.actors[id]; return x.ctrl === p || (x.ctrl === id && x.overlord === p); }); }
const controlled = (S, p) => IDS.filter(id => S.actors[id].ctrl === p);
const atWar = (S, a, b) => !!S.war[rk(a, b)];
const enemies = (S, a) => IDS.filter(b => b !== a && atWar(S, a, b));
function hasTreaty(S, a, b, type) { return S.treaties.some(t => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a))); }
function treatiesOf(S, a, b) { return S.treaties.filter(t => (t.a === a && t.b === b) || (t.a === b && t.b === a)); }
function blocMates(S, a) { const out = new Set(); for (const b of Object.values(S.blocs)) if (b.members.includes(a)) b.members.forEach(m => m !== a && out.add(m)); return [...out]; }
function sameBloc(S, a, b) { return Object.values(S.blocs).some(x => x.members.includes(a) && x.members.includes(b)); }
function isAlly(S, a, b) { if (!S.actors[a] || !S.actors[b]) return false; return hasTreaty(S, a, b, 'alliance') || sameBloc(S, a, b) || S.actors[a].overlord === b || S.actors[b].overlord === a; }
function isPartner(S, a, b) { return !!S.actors[a] && !!S.actors[b] && hasTreaty(S, a, b, 'partner'); }
function econBlocs(id) { return Object.entries(ECON).filter(([, m]) => m.includes(id)).map(([k]) => k); }
function sameEcon(a, b) { return Object.values(ECON).some(m => m.includes(a) && m.includes(b)); }
const worldGDP = S => IDS.reduce((s, id) => s + S.actors[id].gdp, 0);

/* ---------- 军力 ---------- */
const techF = x => 0.6 + 0.4 * x.tech / 100;
const stabF = x => 0.7 + 0.3 * x.stab / 100;
const MOB = [1, 1.12, 1.3, 1.5];
const MANP = [1, 1.3, 1.8, 2.5];
function landEff(S, id) { const x = S.actors[id]; if (!indep(S, id)) return 0; return (x.land * techF(x) * stabF(x) * MOB[x.mob] + DEF[id].pers * 0.04 * MANP[x.mob] * stabF(x)); }
function airEff(S, id) { const x = S.actors[id]; if (!indep(S, id)) return 0; return x.air * techF(x) * stabF(x) * MOB[x.mob]; }
function navyEff(S, id) { const x = S.actors[id]; if (!indep(S, id)) return 0; return x.navy * techF(x) * stabF(x); }
function power(S, id) { return landEff(S, id) + airEff(S, id) + navyEff(S, id); }
function blocPower(S, id) { return realm(S, id).reduce((s, v) => s + (v === id ? power(S, v) : power(S, v) * 0.5), 0); }
function reach(S, id) { return DEF[id].proj + navyEff(S, id) * 4 + airEff(S, id) * 1; }
function bases(S, X) { // 可作为出发地的领土
  const out = new Set([X]);
  for (const id of IDS) {
    const y = S.actors[id];
    if (y.ctrl === X || (y.ctrl === id && y.overlord === X)) out.add(id);
    else if (y.ctrl === id && hasTreaty(S, X, id, 'access')) out.add(id);
  }
  return [...out];
}
function minDistFrom(S, X, T) { let m = Infinity; for (const b of bases(S, X)) m = Math.min(m, dist(b, T)); return m; }
function route(S, X, T, allyStaging = true) {
  const bs = bases(S, X);
  if (allyStaging) for (const id of IDS) if (indep(S, id) && id !== T && atWar(S, id, boss(S, T)) && isAlly(S, X, id)) bs.push(id);
  let best = null;
  for (const b of bs) { if (b === T) continue; if (landAdj(b, T)) return { kind: 'land', via: b, d: 0 }; }
  let md = Infinity, via = null; for (const b of bs) { if (b === T) continue; const d = dist(b, T); if (d < md) { md = d; via = b; } }
  if (md <= 450 && !LANDLOCKED.has(T)) best = { kind: 'amphib', via, d: md };
  else if (md <= reach(S, X) && !LANDLOCKED.has(T)) best = { kind: 'exped', via, d: md };
  return best;
}
function canStrike(S, X, T) { return minDistFrom(S, X, T) <= reach(S, X) * 1.3 + 300; }
function nukeReach(S, X, T) { return DEF[X].icbm || minDistFrom(S, X, T) <= Math.max(reach(S, X) * 1.5, DEF[X].proj); }

/* ---------- 贸易暴露度 ---------- */
function exposure(S, a, b) { // a 对 b 的贸易依赖（0..1，按伙伴求和约为1）
  if (a === b) return 0;
  const k = a + '>' + b; if (S._exp && S._exp[k] !== undefined) return S._exp[k];
  if (!S._exp) S._exp = {};
  const W = worldGDP(S);
  let tot = 0; const row = {};
  for (const c of IDS) {
    if (c === a) continue;
    const d = dist(a, c);
    let p = 1 + (sameEcon(a, c) ? 0.8 : 0) + (landAdj(a, c) ? 0.6 : 0) + (d < 2500 ? 0.4 : 0) - (d > 9000 ? 0.35 : 0);
    if (hasTreaty(S, a, c, 'trade')) p += 0.6;
    p = Math.max(0.2, p);
    row[c] = S.actors[c].gdp / W * p; tot += row[c];
  }
  for (const c in row) S._exp[a + '>' + c] = row[c] / tot;
  return S._exp[k];
}
function resetExposure(S) { S._exp = null; }

/* ---------- 新游戏 ---------- */
function newGame(opt) {
  const seed = (opt.seed >>> 0) || (Math.floor(Math.random() * 2 ** 31) >>> 0);
  const S = {
    v: 3, seed, rng: seed | 0, turn: 0, year: 2026, q: 4, player: opt.player, goal: opt.goal || 'hegemony',
    diff: opt.diff || 'normal', llm: !!opt.llm, actors: {}, rel: {}, rel0: {}, infl: {}, treaties: [], blocs: {},
    sanctions: [], war: {}, fronts: [], blockades: [], loans: [], queue: [], inbox: [], log: [], history: [], chat: {},
    heg: 0, over: null, apUsed: 0, report: null, globalMod: [], seq: 1, tension: 30, lastEvents: [],
  };
  for (const d of ACTORS) {
    const stock = d.milex * d.ppp * 4;
    const pm = d.id === S.player ? 0 : 0.15;
    S.actors[d.id] = {
      id: d.id, gdp: d.gdp, tech: d.tech, stab: d.stab, ctrl: d.id, overlord: null, vassalSince: null, integrated: false, resist: 0,
      land: stock * d.mix[0], navy: stock * d.mix[1], air: stock * d.mix[2], mix: d.mix.slice(), nukes: d.nukes, nukeProg: d.nukeProg || 0,
      milPct: +(d.milex / d.gdp * 100).toFixed(2), mob: 0, treasury: d.gdp * 0.01, mods: [], stabMods: [],
      hawk: clamp(d.hawk + (rnd(S) - 0.5) * 2 * pm, 0.02, 0.98), risk: clamp(d.risk + (rnd(S) - 0.5) * 2 * pm, 0.02, 0.98),
      econ: d.econ, loyal: clamp(d.loyal + (rnd(S) - 0.5) * 2 * pm, 0.05, 0.98), lastG: d.growth / 4, fear: {}, flags: {},
    };
  }
  S.actors.RUS.mob = 1; S.actors.UKR.mob = 2;
  for (const b of BLOCS) S.blocs[b.id] = { id: b.id, name: b.name, type: b.type, leader: b.leader, members: b.members.slice() };
  for (const [type, a, b] of TREATIES) S.treaties.push({ type, a, b, since: 0 });
  for (const [bloc, m] of Object.entries(ECON)) if (bloc === 'EU' || bloc === 'USMCA') for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) S.treaties.push({ type: 'trade', a: m[i], b: m[j], since: 0, econ: bloc });
  // 关系：基线由集团推算，再叠加显式值与随机扰动
  for (let i = 0; i < IDS.length; i++) for (let j = i + 1; j < IDS.length; j++) {
    const a = IDS[i], b = IDS[j]; let v = 0;
    if (sameBloc(S, a, b)) v += 25;
    for (const m of Object.values(ECON)) if (m.includes(a) && m.includes(b)) v += 8;
    if (dist(a, b) < 1500) v += 3;
    S.rel[rk(a, b)] = v;
  }
  for (const line of REL.split('\n')) for (const item of line.split('|')) { const p = item.trim().split(/\s+/); if (p.length === 3) S.rel[rk(p[0], p[1])] = +p[2]; }
  for (const k in S.rel) { S.rel[k] = clamp(S.rel[k] + Math.round(rn(S) * 4), -100, 100); S.rel0[k] = S.rel[k]; }
  // 影响力初值：大国在盟友/伙伴中的存在
  for (const t of S.treaties) {
    const big = x => DEF[x].gdp > 2000;
    if (t.type === 'alliance' || t.type === 'partner' || t.type === 'access') { if (big(t.a)) addInfl(S, t.a, t.b, 12); if (big(t.b)) addInfl(S, t.b, t.a, 12); }
  }
  const seedInfl = [['USA', 'CAM', 30], ['USA', 'MEX', 25], ['CHN', 'ASN', 20], ['CHN', 'CAF', 18], ['CHN', 'SAS', 18], ['CHN', 'CAS', 20], ['RUS', 'CAS', 30], ['RUS', 'BLR', 60], ['RUS', 'CAU', 15], ['FRA', 'WAF', 10], ['RUS', 'WAF', 15], ['GLF', 'EGY', 20], ['IND', 'SAS', 25], ['USA', 'TWN', 35], ['IRN', 'LEV', 25], ['TUR', 'CAU', 18], ['CHN', 'PRK', 35], ['USA', 'ISR', 30], ['USA', 'SCO', 15], ['CHN', 'AND', 12], ['CHN', 'EAF', 15], ['CHN', 'SAF', 15], ['AUS', 'OCE', 25]];
  for (const [a, b, v] of seedInfl) addInfl(S, a, b, v);
  // 初始制裁
  const west = ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'IBE', 'POL', 'NOR', 'BNL', 'CEU', 'BAL', 'BLT', 'JPN', 'AUS', 'OCE'];
  for (const w of west) { addSanction(S, w, 'RUS', 'econ', ['USA', 'GBR', 'CAN', 'DEU', 'FRA', 'POL', 'BLT', 'NOR'].includes(w) ? 3 : 2); addSanction(S, w, 'BLR', 'econ', 2); }
  addSanction(S, 'USA', 'RUS', 'fin', 1); addSanction(S, 'KOR', 'RUS', 'econ', 1);
  addSanction(S, 'USA', 'IRN', 'econ', 3); addSanction(S, 'USA', 'IRN', 'fin', 1);
  for (const w of ['GBR', 'FRA', 'DEU', 'ITA', 'IBE', 'BNL', 'NOR', 'POL', 'CEU', 'BAL', 'BLT']) addSanction(S, w, 'IRN', 'econ', 2);
  for (const w of ['USA', 'JPN', 'KOR', 'AUS']) addSanction(S, w, 'PRK', 'econ', 3);
  addSanction(S, 'USA', 'CHN', 'tech', 1); addSanction(S, 'USA', 'CHN', 'tariff', 1); addSanction(S, 'CHN', 'USA', 'tariff', 1); addSanction(S, 'CHN', 'USA', 'tech', 1);
  addSanction(S, 'NOR', 'CHN', 'tech', 1); addSanction(S, 'BNL', 'CHN', 'tech', 1); addSanction(S, 'JPN', 'CHN', 'tech', 1);
  // 初始战争：俄乌
  S.war[rk('RUS', 'UKR')] = { since: -15, a: 'RUS', b: 'UKR' };
  S.fronts.push({ id: 'F' + S.seq++, att: 'RUS', target: 'UKR', def: 'UKR', kind: 'land', commit: 0.55, progress: 19, turns: 15, last: 0.4, hist: [] });
  resetExposure(S);
  for (const id of IDS) { S.actors[id].g0 = growthPenalty(S, id); S.actors[id].p0 = stabPressure(S, id); }
  snapshotHistory(S);
  S.report = { turn: 0, intro: true };
  logEvent(S, { type: 'start', text: `${S.year}年第${S.q}季度：你接掌了${NAME(S.player)}的最高决策权。`, tone: 'info', actors: [S.player] });
  return S;
}

function addSanction(S, from, to, kind, level) {
  const s = S.sanctions.find(x => x.from === from && x.to === to && x.kind === kind);
  if (s) s.level = level; else S.sanctions.push({ from, to, kind, level, since: S.turn });
}
function sanctionLevel(S, from, to, kind) { const s = S.sanctions.find(x => x.from === from && x.to === to && (!kind || x.kind === kind)); return s ? s.level : 0; }
function removeSanctions(S, from, to) { S.sanctions = S.sanctions.filter(x => !(x.from === from && x.to === to)); }

/* ---------- 日志与事件 ---------- */
function logEvent(S, e) { e.turn = S.turn; S.log.push(e); if (S.log.length > 600) S.log.splice(0, S.log.length - 600); return e; }
function pushEv(S, ev) { // 本回合发生、可能引起反应的事件
  ev.id = 'E' + S.seq++; ev.turn = S.turn; S.turnEvents = S.turnEvents || []; S.turnEvents.push(ev); return ev;
}

/* ---------- 显示辅助 ---------- */
function fmtB(b) { const s = b < 0 ? '-' : ''; b = Math.abs(b); if (b >= 1000) return s + (b / 1000).toFixed(b >= 10000 ? 1 : 2) + '万亿'; if (b >= 1) return s + Math.round(b * 10) + '亿'; return s + (b * 10).toFixed(1) + '亿'; }
const fmtN = n => Math.round(n).toLocaleString('en-US');
function dateStr(S, turn = S.turn) { const t = (S.q - 1) + (turn - S.turn); const y = S.year + Math.floor(t / 4); const q = ((t % 4) + 4) % 4 + 1; return `${y}年Q${q}`; }

/* ---------- 行动点 ---------- */
function apMax(S) { const x = S.actors[S.player]; return 3 + (x.gdp >= 2000 ? 1 : 0) + (x.gdp >= 10000 ? 1 : 0) + (x.stab >= 70 ? 1 : 0) - (x.stab < 30 ? 1 : 0); }
function apLeft(S) { return apMax(S) - S.queue.reduce((s, q) => s + (q.ap || 0), 0); }
function moneyQueued(S) { return S.queue.reduce((s, q) => s + (q.cost || 0), 0); }

/* ---------- 提案评估（AI 是否同意） ---------- */
function commonEnemyScore(S, a, b) {
  let s = 0;
  for (const c of IDS) { if (c === a || c === b || !indep(S, c)) continue; const ra = rel(S, a, c), rb = rel(S, b, c); if (ra < -40 && rb < -40) s += Math.min(1, power(S, c) / 2000) * 0.5; }
  return Math.min(1, s);
}
function powerRatio(S, a, b) { return (blocPower(S, a) + 1) / (blocPower(S, b) + 1); }
function allyHelp(S, id, against) { // 盟友可能提供的援助（军力折算）
  let s = 0; for (const c of IDS) { if (c === id || c === against || !indep(S, c)) continue; if (isAlly(S, c, id)) s += power(S, c) * 0.35 * S.actors[c].loyal; else if (isPartner(S, c, id)) s += power(S, c) * 0.12 * S.actors[c].loyal; }
  return s;
}
function evalDeal(S, from, to, term) { // 返回 {score, why}
  const x = S.actors[to], r = rel(S, from, to) / 100, inf = infl(S, from, to) / 100;
  const why = [];
  let sc = 0;
  const ratio = powerRatio(S, from, to);
  switch (term.type) {
    case 'trade': sc = 0.15 + r * 0.8 + exposure(S, to, from) * 2 + inf * 0.3 - (sanctionLevel(S, from, to) + sanctionLevel(S, to, from)) * 0.25; if (atWar(S, from, to)) sc -= 2; break;
    case 'alliance': {
      sc = -0.55 + r * 1.1 + commonEnemyScore(S, from, to) * 0.9 + inf * 0.3;
      const enemiesOfFrom = enemies(S, from); if (enemiesOfFrom.length) sc -= 0.25 * (1 - x.risk);
      for (const c of IDS) if (c !== to && c !== from && isAlly(S, to, c) && rel(S, from, c) < -40) { sc -= 0.35; why.push(`与其盟友${NAME(c)}对立`); break; }
      if (ratio > 1.5) sc += 0.1;
      break;
    }
    case 'nap': sc = 0.05 + r * 0.6 + (ratio > 1.2 ? 0.2 : 0) + inf * 0.2; if (atWar(S, from, to)) sc -= 1; break;
    case 'access': sc = -0.35 + r * 0.9 + (isAlly(S, from, to) ? 0.35 : 0) + inf * 0.5 + (x.flags.debtTo === from ? 0.3 : 0); break;
    case 'partner': sc = -0.2 + r * 0.9 + inf * 0.3 + commonEnemyScore(S, from, to) * 0.4; break;
    case 'vassal': {
      const help = allyHelp(S, to, from);
      const eff = (blocPower(S, from) + 1) / (blocPower(S, to) + help + 1);
      sc = -1.3 + Math.log(Math.max(eff, 0.01)) * 0.45 + inf * 0.9 + r * 0.3 + (x.stab < 30 ? 0.3 : 0) + (x.flags.debtTo === from ? 0.25 : 0);
      if (x.nukes > 0) { sc -= 0.8; why.push('拥有核威慑'); }
      const f = S.fronts.find(fr => fr.att === from && fr.target === to); if (f) sc += f.progress / 100 * 1.1;
      if (eff < 3) why.push('实力差距不够悬殊'); if (help > power(S, from) * 0.4) why.push('相信盟友会提供保护');
      break;
    }
    case 'peace': case 'ceasefire': {
      const fAg = S.fronts.filter(f => f.att === from && boss(S, f.target) === to), fMe = S.fronts.filter(f => f.att === to && boss(S, f.target) === from);
      const losing = fAg.reduce((m, f) => Math.max(m, f.progress), 0) / 100, winning = fMe.reduce((m, f) => Math.max(m, f.progress), 0) / 100;
      sc = (term.type === 'ceasefire' ? 0.1 : -0.05) + losing * 0.9 - winning * 0.9 + (x.stab < 35 ? 0.35 : 0) - x.hawk * 0.35 + (1 - x.risk) * 0.15 + r * 0.2;
      if (term.terms === 'vassal') sc = evalDeal(S, from, to, { type: 'vassal' }).score + losing * 0.5;
      if (term.terms === 'annex') sc = losing > 0.9 ? 0.2 : -2;
      if (term.terms === 'reparations') sc -= 0.25;
      break;
    }
    case 'lift': sc = r * 0.5 + 0.1; break;
    case 'join_war': { const en = term.enemy; sc = -0.5 + r * 0.8 + (-rel(S, to, en) / 100) * 0.9 + x.hawk * 0.3 - (power(S, en) / (power(S, to) + 1) > 1.5 ? 0.4 : 0) + inf * 0.3; break; }
    case 'break_alliance': sc = -0.6 + r * 0.7 + inf * 0.6 - rel(S, to, term.with) / 150; break;
    case 'tribute': sc = evalDeal(S, from, to, { type: 'vassal' }).score + 0.4; break;
    default: sc = r * 0.5 - 0.2;
  }
  if (x.fear[from] && x.fear[from] > S.turn) sc += 0.15;
  return { score: sc, why };
}
function decide(S, from, to, term, noise = 0.25) { const e = evalDeal(S, from, to, term); return { ok: e.score + rn(S) * noise > 0, ...e }; }

/* ---------- 条约操作 ---------- */
function addTreaty(S, type, a, b) { if (!hasTreaty(S, a, b, type)) S.treaties.push({ type, a, b, since: S.turn }); if (type === 'trade') resetExposure(S); }
function removeTreaty(S, type, a, b) { S.treaties = S.treaties.filter(t => !(t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a)))); if (type === 'trade') resetExposure(S); }
function makeVassal(S, v, lord) {
  const x = S.actors[v]; x.overlord = lord; x.vassalSince = S.turn;
  for (const b of Object.values(S.blocs)) if (b.members.includes(v) && !b.members.includes(lord)) b.members = b.members.filter(m => m !== v);
  S.treaties = S.treaties.filter(t => !(t.type === 'alliance' && (t.a === v || t.b === v) && rel(S, lord, t.a === v ? t.b : t.a) < 0));
  setRel(S, v, lord, Math.max(rel(S, v, lord), 45));
  for (const e of enemies(S, v)) if (!atWar(S, lord, e)) makePeace(S, v, e, 'white', true);
}

/* ---------- 战争 ---------- */
function declareWar(S, a, b, reason) {
  if (a === b || atWar(S, a, b)) return;
  S.war[rk(a, b)] = { since: S.turn, a, b };
  setRel(S, a, b, Math.min(rel(S, a, b), -60));
  for (const h of treatiesOf(S, a, b)) if (h.type !== 'access') removeTreaty(S, h.type, a, b);
  S.tension = clamp(S.tension + 6, 0, 100);
  return reason;
}
function openFront(S, att, target, commit, kind) {
  const def = boss(S, target);
  if (!atWar(S, att, def)) declareWar(S, att, def);
  let f = S.fronts.find(x => x.att === att && x.target === target);
  if (f) { f.commit = commit; return f; }
  f = { id: 'F' + S.seq++, att, target, def, kind, commit, progress: 0, turns: 0, last: 0, hist: [] };
  S.fronts.push(f);
  return f;
}
function makePeace(S, a, b, terms = 'white', silent = false) {
  if (!atWar(S, a, b)) return;
  delete S.war[rk(a, b)];
  S.fronts = S.fronts.filter(f => !((f.att === a && boss(S, f.target) === b) || (f.att === b && boss(S, f.target) === a)));
  S.blockades = S.blockades.filter(k => !((k.by === a && k.target === b) || (k.by === b && k.target === a)));
  setRel(S, a, b, Math.max(rel(S, a, b), -45));
  if (!silent) logEvent(S, { type: 'peace', text: `${NAME(a)}与${NAME(b)}${terms === 'ceasefire' ? '达成停火' : '签署和平协议'}。`, tone: 'info', actors: [a, b] });
}
function frontShares(S, id) { // 各防御战线的兵力分配
  const atk = S.fronts.filter(f => f.att === id && indep(S, id));
  const used = atk.reduce((s, f) => s + f.commit, 0);
  const defs = S.fronts.filter(f => f.def === id);
  const free = Math.max(0.25, 1 - used);
  const w = defs.reduce((s, f) => s + (f.target === id ? 2 : 1), 0) || 1;
  const out = {}; for (const f of defs) out[f.id] = free * (f.target === id ? 2 : 1) / w;
  return out;
}
function resolveFronts(S, R) {
  const shares = {};
  for (const f of S.fronts.slice()) {
    // 目标易手时更新防守方
    f.def = boss(S, f.target);
    if (f.def === f.att || boss(S, f.target) === boss(S, f.att) || !indep(S, f.att)) { S.fronts = S.fronts.filter(x => x !== f); continue; }
    if (!atWar(S, f.att, f.def)) declareWar(S, f.att, f.def);
    const att = S.actors[f.att], T = S.actors[f.target];
    if (!shares[f.def]) shares[f.def] = frontShares(S, f.def);
    const dShare = shares[f.def][f.id] ?? 0.5;
    const tgtD = DEF[f.target];
    let Aforce = (landEff(S, f.att) + 0.6 * airEff(S, f.att)) * f.commit;
    let Dforce = (landEff(S, f.def) + 0.6 * airEff(S, f.def)) * dShare;
    if (f.def !== f.target) Dforce *= 0.8; // 占领区防守
    let aNavy = navyEff(S, f.att) * f.commit, dNavy = navyEff(S, f.def) * 0.8;
    const coA = [], coD = [];
    for (const c of IDS) {
      if (c === f.att || c === f.def || !indep(S, c)) continue;
      const rf = cid => { const d = minDistFrom(S, c, f.target); const rr = reach(S, c); return d <= 450 || landAdj(c, f.target) ? 1 : d <= rr ? 0.7 : d <= rr * 1.6 ? 0.3 : 0; };
      if (atWar(S, c, f.att) && (isAlly(S, c, f.def) || isPartner(S, c, f.def) || c === f.target || rel(S, c, f.def) >= 40)) {
        const r = rf(c); if (r > 0) { Dforce += (landEff(S, c) + 0.6 * airEff(S, c)) * 0.3 * r; dNavy += navyEff(S, c) * 0.5 * r; coD.push(c); }
      } else if (atWar(S, c, f.def) && (isAlly(S, c, f.att) || rel(S, c, f.att) >= 40)) {
        const r = rf(c); if (r > 0) { Aforce += (landEff(S, c) + 0.6 * airEff(S, c)) * 0.25 * r; aNavy += navyEff(S, c) * 0.3 * r; coA.push(c); }
      }
    }
    const rt = route(S, f.att, f.target);
    if (!rt) { f.kind = 'none'; Aforce *= 0.1; } else f.kind = rt.kind;
    let navalRatio = 1;
    if (f.kind === 'amphib' || f.kind === 'exped') {
      navalRatio = (aNavy + 1) / (dNavy + 1);
      const lift = aNavy * (f.kind === 'amphib' ? 0.55 : 0.35) + 5; // 运力上限：投送规模受海军/运输力量限制
      Aforce = Math.min(Aforce, lift) * clamp(navalRatio / 1.5, 0.05, 1) * (f.kind === 'amphib' ? 0.75 : 0.55);
      Dforce *= f.kind === 'amphib' ? 1.6 : 1.4;
      f.lift = lift;
    }
    Dforce *= tgtD.terr * (1 + Math.min(0.25, f.turns * 0.0)) ;
    if (f.def !== f.target && T.resist > 0 && boss(S, f.target) !== f.target) Aforce *= 1 + T.resist / 300; // 占领区民众支持解放者
    Dforce = Math.max(Dforce, 1);
    const ratio = Aforce / Dforce;
    const size = clamp(Math.sqrt(DEF[f.target].pop / 40) * clamp(Math.sqrt((GEO.areaPx[f.target] || 3000) / 6000), 0.75, 1.8), 0.6, 3.6);
    const cap = 40 / size;
    let eff = ratio - 1; eff = Math.abs(eff) < 0.2 ? eff * 0.3 : Math.sign(eff) * (Math.abs(eff) - 0.14);
    let delta = 22 * eff / size + rn(S) * 2.4;
    delta = clamp(delta, -18, cap);
    f.progress = clamp(f.progress + delta, -40, 100);
    f.turns++; f.last = delta; f.ratio = ratio; f.navalRatio = navalRatio; f.coA = coA; f.coD = coD;
    f.hist.push(Math.round(f.progress)); if (f.hist.length > 16) f.hist.shift();
    // 损耗
    const inten = 0.5 + 0.5 * f.commit;
    const lossA = (0.022 + 0.05 * Dforce / (Aforce + Dforce)) * inten;
    const lossD = (0.02 + 0.065 * Aforce / (Aforce + Dforce));
    att.land -= att.land * f.commit * lossA * 0.9; att.air -= att.air * f.commit * lossA * 0.5;
    if (f.kind === 'amphib' || f.kind === 'exped') att.navy -= att.navy * f.commit * lossA * 0.6;
    const D = S.actors[f.def]; D.land -= D.land * dShare * lossD; D.air -= D.air * dShare * lossD * 0.5;
    for (const c of coD) { const x = S.actors[c]; x.land *= 1 - 0.3 * lossD * 0.4; x.air *= 1 - 0.3 * lossD * 0.3; }
    for (const c of coA) { const x = S.actors[c]; x.land *= 1 - 0.25 * lossA * 0.4; }
    f.lossA = lossA * f.commit; f.lossD = lossD * dShare;
    // 结果
    if (f.progress >= 100) conquer(S, f, R);
    else if (f.progress <= -25) {
      S.fronts = S.fronts.filter(x => x !== f);
      att.land *= 0.93;
      R.war.push({ tone: 'bad', text: `${NAME(f.att)}对${NAME(f.target)}的攻势崩溃，部队被迫后撤。`, actors: [f.att, f.target] });
      logEvent(S, { type: 'war', text: `${NAME(f.att)}对${NAME(f.target)}的攻势失败。`, tone: 'bad', actors: [f.att, f.target] });
    }
  }
}
function conquer(S, f, R) {
  const T = S.actors[f.target], wasHome = f.def === f.target, oldDef = f.def;
  S.fronts = S.fronts.filter(x => x !== f && x.target !== f.target);
  const liberate = T.ctrl !== f.target && (rel(S, f.att, f.target) >= 30 || isAlly(S, f.att, f.target)) && f.att !== S.player;
  T.land *= 0.12; T.air *= 0.12; T.navy *= 0.2; T.mob = 0;
  T.gdp *= 0.88;
  if (liberate) { T.ctrl = f.target; T.overlord = null; T.resist = 0; T.integrated = false; T.stab = 35; }
  else {
    T.ctrl = f.att; T.overlord = null; T.integrated = false; T.occSince = S.turn;
    T.resist = clamp(55 + (DEF[f.target].gov === 'dem' ? 10 : 0) + T.stab / 5 - infl(S, f.att, f.target) / 2, 20, 95);
    // 被征服者的附庸与占领地获得自由
    for (const id of IDS) { const y = S.actors[id]; if (id === f.target) continue; if (y.overlord === f.target) y.overlord = null; if (wasHome && y.ctrl === f.target) { y.ctrl = id; y.resist = 0; y.stab = 40; } }
    for (const b of Object.values(S.blocs)) b.members = b.members.filter(m => m !== f.target);
    S.treaties = S.treaties.filter(t => t.a !== f.target && t.b !== f.target);
    S.sanctions = S.sanctions.filter(s => s.from !== f.target && s.to !== f.target);
    if (wasHome) for (const e of enemies(S, f.target)) delete S.war[rk(f.target, e)];
  }
  if (!wasHome && liberate && atWar(S, f.att, oldDef)) { /* 战争继续 */ }
  resetExposure(S);
  const txt = liberate ? `${NAME(f.att)}解放了${NAME(f.target)}。` : `${NAME(f.att)}军队攻占了${NAME(f.target)}全境${wasHome ? '，原政府垮台' : ''}。`;
  R.war.push({ tone: f.att === S.player ? 'good' : (f.target === S.player ? 'bad' : 'info'), text: txt, actors: [f.att, f.target], big: true });
  logEvent(S, { type: 'conquest', text: txt, tone: 'warn', actors: [f.att, f.target] });
  pushEv(S, { type: 'conquest', actor: f.att, target: f.target, sev: 70, text: txt });
  S.tension = clamp(S.tension + 10, 0, 100);
}

/* ---------- 行动定义 ---------- */
const pctG = (S, me, p) => S.actors[me].gdp * p / 100;
const TIERS = [{ v: 0.05, l: '小规模' }, { v: 0.2, l: '中等' }, { v: 0.6, l: '大规模' }];
const tierCost = (S, me, p) => pctG(S, me, (TIERS[p.tier ?? 1] || TIERS[1]).v);
function hostileGuard(S, me, t) { if (t === me) return '不能以自己为目标'; if (!indep(S, t)) return `${NAME(t)}目前不是独立行为体`; if (S.actors[t].overlord === me) return '对方是你的附庸'; return null; }
const ACTIONS = [
 // ---------- 外交 ----------
 { id: 'summit', cat: 'dip', name: '高层访问', ap: 1, desc: '派出高级代表团，改善关系并扩大影响力。', cost: (S, me) => Math.max(0.3, pctG(S, me, 0.003)),
   check: (S, me, t) => (t === me ? '不能以自己为目标' : !indep(S, t) ? '对方已不是独立国家' : atWar(S, me, t) ? '交战中无法访问' : null),
   preview: (S, me, t) => `关系约 +8~+15，影响力 +2~+4`,
   exec(S, me, t, p, R) { const r0 = rel(S, me, t); let g = between(S, 7, 15); if (r0 > 60) g *= clamp(1 - (r0 - 60) / 60, 0.25, 1); if (r0 < -60) g *= 0.6; addRel(S, me, t, g); addInfl(S, me, t, between(S, 2, 4)); R.act(`对${NAME(t)}的高层访问取得成果，关系 +${g.toFixed(0)}。`, 'good'); pushEv(S, { type: 'summit', actor: me, target: t, sev: -8, text: `${NAME(me)}代表团访问${NAME(t)}` }); } },
 { id: 'trade', cat: 'dip', name: '提议自贸协定', ap: 1, desc: '提议签署自由贸易协定：双方增长加快，互相依赖加深。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (hasTreaty(S, me, t, 'trade') ? '已有自贸协定' : atWar(S, me, t) ? '交战中' : null),
   preview: (S, me, t) => chanceText(evalDeal(S, me, t, { type: 'trade' }).score),
   exec(S, me, t, p, R) { const d = decide(S, me, t, { type: 'trade' }); if (d.ok) { addTreaty(S, 'trade', me, t); addRel(S, me, t, 5); R.act(`${NAME(t)}同意与你签署自贸协定。`, 'good'); pushEv(S, { type: 'trade', actor: me, target: t, sev: -10, text: `${NAME(me)}与${NAME(t)}签署自贸协定` }); } else { addRel(S, me, t, -2); R.act(`${NAME(t)}拒绝了自贸协定提议${d.why.length ? '（' + d.why[0] + '）' : ''}。`, 'bad'); } } },
 { id: 'alliance', cat: 'dip', name: '提议军事同盟', ap: 2, desc: '共同防御条约：任一方遭到攻击时另一方有义务参战。会刺激对手。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (hasTreaty(S, me, t, 'alliance') || sameBloc(S, me, t) ? '已是盟友' : atWar(S, me, t) ? '交战中' : null),
   preview: (S, me, t) => chanceText(evalDeal(S, me, t, { type: 'alliance' }).score),
   exec(S, me, t, p, R) { const d = decide(S, me, t, { type: 'alliance' }); if (d.ok) { addTreaty(S, 'alliance', me, t); addRel(S, me, t, 10); R.act(`${NAME(t)}同意与你结成军事同盟！`, 'good'); pushEv(S, { type: 'alliance', actor: me, target: t, sev: -15, text: `${NAME(me)}与${NAME(t)}结成军事同盟`, third: 22 }); } else { R.act(`${NAME(t)}婉拒了结盟提议${d.why.length ? '（' + d.why[0] + '）' : ''}。`, 'bad'); } } },
 { id: 'nap', cat: 'dip', name: '互不侵犯条约', ap: 1, desc: '承诺互不攻击，降低对方的敌意与警惕。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (hasTreaty(S, me, t, 'nap') ? '已有条约' : atWar(S, me, t) ? '交战中，请用和谈' : null),
   preview: (S, me, t) => chanceText(evalDeal(S, me, t, { type: 'nap' }).score),
   exec(S, me, t, p, R) { const d = decide(S, me, t, { type: 'nap' }); if (d.ok) { addTreaty(S, 'nap', me, t); addRel(S, me, t, 6); R.act(`${NAME(t)}签署了互不侵犯条约。`, 'good'); } else R.act(`${NAME(t)}拒绝签署互不侵犯条约。`, 'bad'); } },
 { id: 'access', cat: 'dip', name: '请求驻军/通行权', ap: 1, desc: '获得在对方领土驻军与通行的权利，可从该地发起军事行动、延伸投送范围。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (hasTreaty(S, me, t, 'access') ? '已拥有通行权' : atWar(S, me, t) ? '交战中' : null),
   preview: (S, me, t) => chanceText(evalDeal(S, me, t, { type: 'access' }).score),
   exec(S, me, t, p, R) { const d = decide(S, me, t, { type: 'access' }); if (d.ok) { addTreaty(S, 'access', me, t); R.act(`${NAME(t)}同意你在其境内驻军。`, 'good'); pushEv(S, { type: 'access', actor: me, target: t, sev: -5, text: `${NAME(me)}获得在${NAME(t)}的驻军权`, third: 12 }); } else { addRel(S, me, t, -3); R.act(`${NAME(t)}拒绝了驻军请求。`, 'bad'); } } },
 { id: 'condemn', cat: 'dip', name: '公开谴责', ap: 1, desc: '在国际场合谴责对方，恶化关系，但能拉近与其对手的距离。', cost: () => 0,
   check: (S, me, t) => (t === me ? '不能以自己为目标' : null),
   preview: () => '关系 -10；其对手对你好感略增',
   exec(S, me, t, p, R) { addRel(S, me, t, -10); for (const c of IDS) if (c !== me && c !== t && rel(S, c, t) < -40) addRel(S, me, c, 2); R.act(`你公开谴责了${NAME(t)}。`, 'info'); pushEv(S, { type: 'condemn', actor: me, target: t, sev: 8, text: `${NAME(me)}公开谴责${NAME(t)}` }); } },
 { id: 'vassal', cat: 'dip', name: '要求成为附庸', ap: 2, desc: '以实力为后盾要求对方接受保护国地位：外交从属、缴纳贡金。拒绝会大幅恶化关系。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (S.actors[t].overlord ? `${NAME(t)}已是${NAME(S.actors[t].overlord)}的附庸` : powerRatio(S, me, t) < 1.5 ? '实力不足（需至少1.5倍）' : null),
   preview: (S, me, t) => chanceText(evalDeal(S, me, t, { type: 'vassal' }).score) + '；拒绝则关系 -25',
   exec(S, me, t, p, R) { const d = decide(S, me, t, { type: 'vassal' }, 0.2); if (d.ok) { makeVassal(S, t, me); R.act(`${NAME(t)}屈服于你的压力，成为你的附庸！`, 'good'); pushEv(S, { type: 'vassal', actor: me, target: t, sev: 30, text: `${NAME(t)}成为${NAME(me)}的附庸`, third: 25 }); } else { addRel(S, me, t, -25); S.actors[t].hawk = clamp(S.actors[t].hawk + 0.05, 0, 1); R.act(`${NAME(t)}断然拒绝了你的要求${d.why.length ? '（' + d.why.join('，') + '）' : ''}。`, 'bad'); pushEv(S, { type: 'demand', actor: me, target: t, sev: 30, text: `${NAME(me)}要求${NAME(t)}臣服遭拒` }); } } },
 { id: 'peace', cat: 'dip', name: '提议和谈', ap: 1, desc: '向交战国提出和平条件。', params: [{ key: 'terms', label: '条件', options: [{ v: 'ceasefire', l: '停火（维持现状）' }, { v: 'white', l: '白色和平' }, { v: 'reparations', l: '对方支付赔款' }, { v: 'vassal', l: '对方成为你的附庸' }] }], cost: () => 0,
   check: (S, me, t) => (!atWar(S, me, t) ? '双方并未交战' : null),
   preview: (S, me, t, p) => chanceText(evalDeal(S, me, t, { type: p.terms === 'ceasefire' ? 'ceasefire' : 'peace', terms: p.terms }).score),
   exec(S, me, t, p, R) { const terms = p.terms || 'white'; const d = decide(S, me, t, { type: terms === 'ceasefire' ? 'ceasefire' : 'peace', terms }); if (d.ok) { applyPeace(S, me, t, terms, R); } else { R.act(`${NAME(t)}拒绝了你的和谈条件。`, 'bad'); } } },
 { id: 'integrate', cat: 'dip', name: '和平合并', ap: 2, desc: '将长期附庸正式并入本国（需附庸满6回合、影响力≥60）。', cost: (S, me, t) => S.actors[t].gdp * 0.01,
   check: (S, me, t) => (S.actors[t].overlord !== me ? '对方不是你的附庸' : S.turn - (S.actors[t].vassalSince ?? S.turn) < 6 ? `还需${6 - (S.turn - S.actors[t].vassalSince)}回合` : infl(S, me, t) < 60 ? '影响力不足60' : null),
   preview: (S, me, t) => `成功率约 ${Math.round(clamp(0.55 + infl(S, me, t) / 250 + S.actors[t].stab / 400, 0, 0.95) * 100)}%`,
   exec(S, me, t, p, R) { const x = S.actors[t]; if (chance(S, clamp(0.55 + infl(S, me, t) / 250 + x.stab / 400, 0, 0.95))) { x.ctrl = me; x.overlord = null; x.integrated = true; x.resist = 8; x.land *= 0.5; x.navy *= 0.5; x.air *= 0.5; const mine = S.actors[me]; mine.land += x.land; mine.navy += x.navy; mine.air += x.air; x.land = x.navy = x.air = 0; resetExposure(S); R.act(`${NAME(t)}经由协议正式并入${NAME(me)}。`, 'good'); pushEv(S, { type: 'annex', actor: me, target: t, sev: 25, text: `${NAME(t)}并入${NAME(me)}`, third: 20 }); } else { x.stab -= 10; addRel(S, me, t, -10); R.act(`${NAME(t)}国内爆发抗议，合并计划受挫。`, 'bad'); } } },
 { id: 'release', cat: 'dip', name: '解除附庸关系', ap: 1, desc: '给予附庸完全独立。', cost: () => 0,
   check: (S, me, t) => (S.actors[t].overlord !== me ? '对方不是你的附庸' : null), preview: () => '关系 +10',
   exec(S, me, t, p, R) { S.actors[t].overlord = null; addRel(S, me, t, 10); R.act(`你给予了${NAME(t)}完全独立。`, 'info'); } },
 { id: 'break', cat: 'dip', name: '退出双边条约', ap: 1, desc: '撕毁与对方的所有双边条约（同盟、自贸、互不侵犯、驻军）。会损害你的信誉。', cost: () => 0,
   check: (S, me, t) => (!treatiesOf(S, me, t).length ? '与对方没有双边条约' : null), preview: () => '关系 -20，所有条约伙伴对你的信任下降',
   exec(S, me, t, p, R) { const had = treatiesOf(S, me, t).map(x => TREATY_NAME[x.type]); S.treaties = S.treaties.filter(x => !((x.a === me && x.b === t) || (x.a === t && x.b === me))); resetExposure(S); addRel(S, me, t, enemies(S, t).length ? -35 : -20); for (const x of S.treaties) { const o = x.a === me ? x.b : x.b === me ? x.a : null; if (o) addRel(S, me, o, -3); } R.act(`你退出了与${NAME(t)}的${had.join('、')}。`, 'warn'); pushEv(S, { type: 'break', actor: me, target: t, sev: 20, text: `${NAME(me)}撕毁与${NAME(t)}的条约` }); } },
 // ---------- 经济 ----------
 { id: 'sanction', cat: 'econ', name: '经济制裁', ap: 1, desc: '限制贸易与投资。等级越高，双方损失越大（对方损失通常更大）。', params: [{ key: 'level', label: '力度', options: [{ v: 1, l: '定向制裁' }, { v: 2, l: '全面制裁' }, { v: 3, l: '贸易禁运' }] }], cost: () => 0,
   check: (S, me, t, p) => hostileGuard(S, me, t) || (sanctionLevel(S, me, t, 'econ') >= (p.level || 1) ? '已处于同等或更高制裁' : null),
   preview: (S, me, t, p) => { const L = p.level || 1; return `对方年增长约 -${(L * 1.3 * exposure(S, t, me) * 1.4).toFixed(2)}%，你约 -${(L * 0.8 * exposure(S, me, t) * 1.4).toFixed(2)}%`; },
   exec(S, me, t, p, R) { const L = +p.level || 1; addSanction(S, me, t, 'econ', L); addRel(S, me, t, -[0, 8, 15, 25][L]); R.act(`你对${NAME(t)}实施${['', '定向制裁', '全面制裁', '贸易禁运'][L]}。`, 'info'); pushEv(S, { type: 'sanction', actor: me, target: t, sev: [0, 15, 25, 40][L], text: `${NAME(me)}对${NAME(t)}实施${['', '定向制裁', '全面制裁', '贸易禁运'][L]}` }); } },
 { id: 'lift', cat: 'econ', name: '解除制裁/关税', ap: 1, desc: '解除你对该国的全部制裁、关税与管制。', cost: () => 0,
   check: (S, me, t) => (!S.sanctions.some(s => s.from === me && s.to === t) ? '你没有对其实施制裁' : null), preview: () => '关系 +8',
   exec(S, me, t, p, R) { removeSanctions(S, me, t); addRel(S, me, t, 8); R.act(`你解除了对${NAME(t)}的全部经济限制措施。`, 'good'); pushEv(S, { type: 'lift', actor: me, target: t, sev: -10, text: `${NAME(me)}解除对${NAME(t)}的制裁` }); } },
 { id: 'tariff', cat: 'econ', name: '加征关税', ap: 1, desc: '较温和的贸易施压，带来少量关税收入。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (sanctionLevel(S, me, t, 'tariff') ? '已加征关税' : null), preview: () => '关系 -8；双方增长小幅受损',
   exec(S, me, t, p, R) { addSanction(S, me, t, 'tariff', 1); addRel(S, me, t, -8); R.act(`你对${NAME(t)}商品加征关税。`, 'info'); pushEv(S, { type: 'tariff', actor: me, target: t, sev: 12, text: `${NAME(me)}对${NAME(t)}加征关税` }); } },
 { id: 'techban', cat: 'econ', name: '科技出口管制', ap: 1, desc: '限制芯片等关键技术出口，拖慢对方科技进步（需你的科技水平领先）。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (sanctionLevel(S, me, t, 'tech') ? '已实施管制' : S.actors[me].tech < S.actors[t].tech + 2 ? '你的科技并不领先对方' : null), preview: () => '对方科技增长放缓；关系 -12',
   exec(S, me, t, p, R) { addSanction(S, me, t, 'tech', 1); addRel(S, me, t, -12); R.act(`你对${NAME(t)}实施科技出口管制。`, 'info'); pushEv(S, { type: 'techban', actor: me, target: t, sev: 20, text: `${NAME(me)}对${NAME(t)}实施科技管制` }); } },
 { id: 'finsanction', cat: 'econ', name: '金融制裁', ap: 2, desc: '冻结资产、切断跨境结算（需你是金融中心）。打击巨大，但会加速他国“去依赖”。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (DEF[me].fin < 2 ? '你不具备全球金融中心地位' : sanctionLevel(S, me, t, 'fin') ? '已实施' : null), preview: (S, me, t) => `对方年增长约 -${(1.6 * Math.max(0.3, exposure(S, t, me) * 3)).toFixed(1)}%，关系 -25`,
   exec(S, me, t, p, R) { addSanction(S, me, t, 'fin', 1); addRel(S, me, t, -25); S.actors[t].treasury -= S.actors[t].gdp * 0.02 * DEF[me].fin / 3; R.act(`你对${NAME(t)}实施金融制裁，冻结其部分海外资产。`, 'info'); pushEv(S, { type: 'finsanction', actor: me, target: t, sev: 35, text: `${NAME(me)}对${NAME(t)}实施金融制裁`, third: 6 }); } },
 { id: 'energy', cat: 'econ', name: '能源禁运', ap: 1, desc: '停止对其能源出口（需你是能源出口国且对方依赖进口）。', cost: () => 0,
   check: (S, me, t) => hostileGuard(S, me, t) || (DEF[me].energy < 1 ? '你不是主要能源出口国' : DEF[t].energy > 0 ? '对方能源自给' : sanctionLevel(S, me, t, 'energy') ? '已实施' : null), preview: () => '对方增长受挫，你损失部分出口收入',
   exec(S, me, t, p, R) { addSanction(S, me, t, 'energy', 1); addRel(S, me, t, -18); R.act(`你停止了对${NAME(t)}的能源供应。`, 'info'); pushEv(S, { type: 'energy', actor: me, target: t, sev: 30, text: `${NAME(me)}对${NAME(t)}实施能源禁运` }); } },
 { id: 'aid', cat: 'econ', name: '经济援助/投资', ap: 1, desc: '提供援助与基建投资：提升好感与影响力，促进对方增长。', params: [{ key: 'tier', label: '规模', options: TIERS.map((x, i) => ({ v: i, l: x.l })) }], cost: tierCost,
   check: (S, me, t) => (t === me ? '不能以自己为目标' : !indep(S, t) ? '对方已不是独立国家' : atWar(S, me, t) ? '交战中' : null),
   preview: (S, me, t, p) => { const c = tierCost(S, me, p), g = S.actors[t].gdp; return `影响力 +${clamp(c / g * 400, 1, 20).toFixed(0)}，关系 +${clamp(4 + c / g * 200, 3, 15).toFixed(0)}`; },
   exec(S, me, t, p, R) { const c = tierCost(S, me, p), x = S.actors[t]; x.gdp += Math.min(c * 0.3, x.gdp * 0.03); x.mods.push({ g: clamp(c / x.gdp * 100 * 0.4, 0.05, 1.5), turns: 4, src: 'aid' }); addInfl(S, me, t, clamp(c / x.gdp * 400, 1, 20)); addRel(S, me, t, clamp(4 + c / x.gdp * 200, 3, 15)); x.stab = clamp(x.stab + between(S, 1, 3), 0, 100); R.act(`向${NAME(t)}提供了${fmtB(c)}美元援助与投资。`, 'good'); pushEv(S, { type: 'aid', actor: me, target: t, sev: -12, text: `${NAME(me)}向${NAME(t)}提供援助` }); } },
 { id: 'loan', cat: 'econ', name: '战略贷款', ap: 1, desc: '提供长期贷款：影响力增长更快、会连本带息分期偿还；对方若违约，你将获得更多筹码。', params: [{ key: 'tier', label: '规模', options: TIERS.map((x, i) => ({ v: i, l: x.l })) }], cost: tierCost,
   check: (S, me, t) => (t === me ? '不能以自己为目标' : !indep(S, t) ? '对方已不是独立国家' : atWar(S, me, t) ? '交战中' : null),
   preview: (S, me, t, p) => `影响力 +${clamp(tierCost(S, me, p) / S.actors[t].gdp * 600, 2, 25).toFixed(0)}，分10回合偿还`,
   exec(S, me, t, p, R) { const c = tierCost(S, me, p), x = S.actors[t]; x.treasury += c; addInfl(S, me, t, clamp(c / x.gdp * 600, 2, 25)); addRel(S, me, t, clamp(2 + c / x.gdp * 100, 2, 8)); S.loans.push({ from: me, to: t, pay: c * 0.11, left: 10 }); R.act(`向${NAME(t)}发放${fmtB(c)}美元贷款。`, 'good'); pushEv(S, { type: 'loan', actor: me, target: t, sev: -6, text: `${NAME(me)}向${NAME(t)}提供贷款` }); } },
 { id: 'blockade', cat: 'econ', name: '海上封锁', ap: 2, desc: '以海军切断对方海上贸易（需海军优势与投送能力）。多数国家视之为战争行为。', cost: (S, me) => pctG(S, me, 0.05),
   check: (S, me, t) => hostileGuard(S, me, t) || (LANDLOCKED.has(t) ? '对方是内陆国家' : S.blockades.some(b => b.by === me && b.target === t) ? '已在封锁' : minDistFrom(S, me, t) > reach(S, me) ? '超出你的海空投送范围' : navyEff(S, me) < 1.3 * (navyEff(S, t) + 1) ? '海军优势不足（需1.3倍）' : null),
   preview: (S, me, t) => `对方每季度GDP约 -${(ISLAND.has(t) ? 3.5 : 2).toFixed(1)}%；对方可能宣战`,
   exec(S, me, t, p, R) { S.blockades.push({ by: me, target: t, since: S.turn }); addRel(S, me, t, -35); R.act(`你的海军开始封锁${NAME(t)}。`, 'warn'); pushEv(S, { type: 'blockade', actor: me, target: t, sev: 50, text: `${NAME(me)}海军封锁${NAME(t)}`, third: 10 }); } },
 // ---------- 军事 ----------
 { id: 'exercise', cat: 'mil', name: '军事演习', ap: 1, desc: '在对方周边举行演习，展示武力、施加压力。', cost: (S, me) => pctG(S, me, 0.01),
   check: (S, me, t) => (t === me ? '不能以自己为目标' : minDistFrom(S, me, t) > reach(S, me) ? '超出投送范围' : null), preview: () => '关系 -6；对方畏惧度上升，但可能扩军',
   exec(S, me, t, p, R) { addRel(S, me, t, -6); const x = S.actors[t]; if (powerRatio(S, me, t) > 1.5) x.fear[me] = S.turn + 4; x.milPct = clamp(x.milPct + 0.1, 0.3, 30); R.act(`你在${NAME(t)}周边举行大规模军事演习。`, 'info'); pushEv(S, { type: 'exercise', actor: me, target: t, sev: 12, text: `${NAME(me)}在${NAME(t)}周边演习` }); } },
 { id: 'armsaid', cat: 'mil', name: '军事援助', ap: 1, desc: '提供武器装备与训练，提升对方军力与你的影响力。', params: [{ key: 'tier', label: '规模', options: TIERS.map((x, i) => ({ v: i, l: x.l })) }], cost: tierCost,
   check: (S, me, t) => (t === me ? '不能以自己为目标' : !indep(S, t) ? '对方已不是独立国家' : atWar(S, me, t) ? '交战中' : null),
   preview: (S, me, t, p) => `对方军力 +${fmtN(tierCost(S, me, p) * DEF[t].ppp * 0.9)}`,
   exec(S, me, t, p, R) { const c = tierCost(S, me, p), x = S.actors[t], pts = c * DEF[t].ppp * 0.9; x.land += pts * x.mix[0]; x.navy += pts * x.mix[1]; x.air += pts * x.mix[2]; addInfl(S, me, t, clamp(c / x.gdp * 300, 1, 15)); addRel(S, me, t, 6); R.act(`向${NAME(t)}提供${fmtB(c)}美元军事援助。`, 'good'); pushEv(S, { type: 'armsaid', actor: me, target: t, sev: -10, text: `${NAME(me)}向${NAME(t)}提供军援`, arms: true }); } },
 { id: 'strike', cat: 'mil', name: '有限打击', ap: 2, desc: '以空袭与导弹打击对方军事目标，削弱其军力，不占领领土。极可能招致报复。', cost: (S, me) => pctG(S, me, 0.05),
   check: (S, me, t) => hostileGuard(S, me, t) || (!canStrike(S, me, t) ? '目标超出打击范围' : null),
   preview: (S, me, t) => { const P = airEff(S, me) * 0.3, D = airEff(S, t) * 0.5 * DEF[t].terr; return `预计毁伤对方军力 ${Math.round(clamp(0.04 + 0.14 * P / (P + D + 1), 0.04, 0.18) * 100)}%；关系 -35`; },
   exec(S, me, t, p, R) { const P = airEff(S, me) * 0.3, D = airEff(S, t) * 0.5 * DEF[t].terr, fr = clamp(0.04 + 0.14 * P / (P + D + 1) + rn(S) * 0.015, 0.03, 0.2), x = S.actors[t]; x.land *= 1 - fr * 0.7; x.air *= 1 - fr; x.navy *= 1 - fr * 0.6; x.gdp *= 0.994; x.stab = clamp(x.stab + (powerRatio(S, me, t) > 3 ? -3 : 3), 0, 100); S.actors[me].air *= 1 - 0.03 * D / (P + D + 1); addRel(S, me, t, -35); S.tension = clamp(S.tension + 5, 0, 100); R.act(`对${NAME(t)}的有限打击摧毁其约${Math.round(fr * 100)}%的军事力量。`, 'warn'); pushEv(S, { type: 'strike', actor: me, target: t, sev: 55, text: `${NAME(me)}对${NAME(t)}实施空袭与导弹打击`, third: 12 }); } },
 { id: 'invade', cat: 'mil', name: '全面入侵', ap: 3, desc: '宣战并开辟战线，逐回合推进；推进达100%即占领全境。', params: [{ key: 'commit', label: '投入兵力', options: [{ v: 0.3, l: '30%' }, { v: 0.55, l: '55%' }, { v: 0.8, l: '80%' }] }], cost: (S, me) => pctG(S, me, 0.1),
   check: (S, me, t) => { const g = hostileGuard(S, me, t); if (g && !(g.includes('独立') && S.actors[t].ctrl !== me)) return g; if (S.actors[t].ctrl === me) return '已在你控制之下'; if (S.fronts.some(f => f.att === me && f.target === t)) return '已有该方向战线'; if (!route(S, me, t)) return '没有可用进攻路线（需陆地接壤、邻近海域或投送范围内的基地）'; return null; },
   preview: (S, me, t, p) => { const r = route(S, me, t); const k = r ? { land: '陆路进攻', amphib: '跨海登陆', exped: '远征作战' }[r.kind] : '无路线'; return `${k}${r && r.via !== me ? '（经' + NAME(r.via) + '）' : ''}；预估首回合力量比 ${estimateRatio(S, me, t, p.commit || 0.55).toFixed(2)}`; },
   exec(S, me, t, p, R) { const r = route(S, me, t); const c = +p.commit || 0.55; const f = openFront(S, me, t, c, r.kind); S.actors[me].mob = Math.max(S.actors[me].mob, 1); R.act(`你对${NAME(t)}发动全面进攻（${{ land: '陆路', amphib: '跨海登陆', exped: '远征' }[r.kind]}，投入${Math.round(c * 100)}%兵力）。`, 'warn'); pushEv(S, { type: 'invade', actor: me, target: t, sev: 85, text: `${NAME(me)}对${NAME(t)}发动全面入侵`, third: 25, front: f.id }); S.tension = clamp(S.tension + 12, 0, 100); } },
 { id: 'cyber', cat: 'covert', name: '网络攻击', ap: 1, desc: '攻击对方金融与基础设施网络；有一定概率被溯源。', cost: (S, me) => pctG(S, me, 0.005),
   check: (S, me, t) => hostileGuard(S, me, t), preview: () => '对方GDP -0.6%~-1.4%，稳定度下降；35%被溯源',
   exec(S, me, t, p, R) { const x = S.actors[t]; const hit = between(S, 0.6, 1.4) * (0.7 + 0.6 * S.actors[me].tech / 100) / (0.7 + 0.6 * x.tech / 100); x.gdp *= 1 - hit / 100; x.stab = clamp(x.stab - 1.5, 0, 100); x.tech -= 0.3; const det = chance(S, 0.35); if (det) { addRel(S, me, t, -20); pushEv(S, { type: 'cyber', actor: me, target: t, sev: 22, text: `${NAME(t)}指控${NAME(me)}发动网络攻击` }); } R.act(`对${NAME(t)}的网络攻击造成约${hit.toFixed(1)}%的GDP损失${det ? '，但行动被溯源曝光' : '，未被发现'}。`, det ? 'warn' : 'good'); } },
 { id: 'threat', cat: 'mil', name: '核威慑', ap: 1, desc: '公开发出核威慑信号。可能迫使弱国退让，但会引发全球恐慌与反感。', cost: () => 0,
   check: (S, me, t) => (S.actors[me].nukes <= 0 ? '你没有核武器' : t === me ? '不能以自己为目标' : null), preview: () => '对方畏惧；全球关系普遍下降',
   exec(S, me, t, p, R) { addRel(S, me, t, -15); for (const c of IDS) if (c !== me && c !== t) addRel(S, me, c, -4); const x = S.actors[t]; if (x.nukes <= 0 && !IDS.some(c => S.actors[c].nukes > 50 && isAlly(S, c, t))) x.fear[me] = S.turn + 6; S.tension = clamp(S.tension + 10, 0, 100); R.act(`你向${NAME(t)}发出核威慑信号。`, 'warn'); pushEv(S, { type: 'nukethreat', actor: me, target: t, sev: 35, text: `${NAME(me)}对${NAME(t)}发出核威慑`, third: 15 }); } },
 { id: 'nuke', cat: 'mil', name: '核打击', ap: 3, desc: '使用核武器。后果极其严重：全球孤立、可能遭到核报复，甚至引发全面核战争导致所有人失败。', danger: true, params: [{ key: 'scope', label: '规模', options: [{ v: 'tactical', l: '战术核打击（军事目标）' }, { v: 'strategic', l: '战略核打击' }] }], cost: () => 0,
   check: (S, me, t) => (S.actors[me].nukes < 5 ? '核弹头不足' : t === me ? '不能以自己为目标' : !nukeReach(S, me, t) ? '超出投射能力' : null),
   preview: (S, me, t) => { const ret = S.actors[t].nukes >= 5 || IDS.some(c => S.actors[c].nukes > 50 && isAlly(S, c, t)); return ret ? '⚠ 对方或其盟友拥有核武器，极可能遭到核报复' : '全球将与你为敌'; },
   exec(S, me, t, p, R) { nuclearStrike(S, me, t, p.scope || 'tactical', R); } },
 // ---------- 隐蔽 ----------
 { id: 'propaganda', cat: 'covert', name: '舆论战', ap: 1, desc: '在对方社会投放信息与叙事，削弱其稳定并扩大你的影响力。', cost: (S, me) => pctG(S, me, 0.003),
   check: (S, me, t) => (t === me ? '不能以自己为目标' : !indep(S, t) ? '对方已不是独立国家' : null), preview: () => '对方稳定 -2~-5，影响力 +3~+6；25%被发现',
   exec(S, me, t, p, R) { const x = S.actors[t]; const s = between(S, 2, 5) * (DEF[t].gov === 'dem' ? 1.2 : 0.7); x.stab = clamp(x.stab - s, 0, 100); addInfl(S, me, t, between(S, 3, 6)); const det = chance(S, 0.25); if (det) { addRel(S, me, t, -10); pushEv(S, { type: 'propaganda', actor: me, target: t, sev: 10, text: `${NAME(t)}指责${NAME(me)}干预其舆论` }); } R.act(`对${NAME(t)}的舆论行动使其稳定下降${s.toFixed(0)}点${det ? '（被对方察觉）' : ''}。`, det ? 'warn' : 'good'); } },
 { id: 'opposition', cat: 'covert', name: '资助反对派', ap: 1, desc: '秘密资助对方政治反对力量，为政变或政权更迭铺路。', cost: (S, me, t) => Math.max(1, S.actors[t].gdp * 0.004),
   check: (S, me, t) => hostileGuard(S, me, t), preview: () => '影响力 +6~+10，对方稳定 -3~-6；30%被发现',
   exec(S, me, t, p, R) { const x = S.actors[t]; addInfl(S, me, t, between(S, 6, 10)); x.stab = clamp(x.stab - between(S, 3, 6), 0, 100); const det = chance(S, 0.3); if (det) { addRel(S, me, t, -18); pushEv(S, { type: 'opposition', actor: me, target: t, sev: 20, text: `${NAME(t)}指控${NAME(me)}资助反政府势力` }); } R.act(`你在${NAME(t)}培植的反对力量正在壮大${det ? '（行动曝光）' : ''}。`, det ? 'warn' : 'good'); } },
 { id: 'coup', cat: 'covert', name: '策动政变', ap: 2, desc: '扶植亲你的政权：成功则对方成为你的附庸。需要影响力≥30；对方越不稳定越容易成功。', cost: (S, me, t) => Math.max(3, S.actors[t].gdp * 0.01),
   check: (S, me, t) => hostileGuard(S, me, t) || (infl(S, me, t) < 30 ? `影响力不足（${Math.round(infl(S, me, t))}/30）` : null),
   preview: (S, me, t) => `成功率约 ${Math.round(coupChance(S, me, t) * 100)}%；失败极可能曝光`,
   exec(S, me, t, p, R) { const pc = coupChance(S, me, t), x = S.actors[t]; if (chance(S, pc)) { makeVassal(S, t, me); x.stab = clamp(x.stab - 15, 0, 100); setRel(S, me, t, 60); addInfl(S, me, t, 15); R.act(`政变成功！${NAME(t)}新政权宣布与你结盟，成为你的附庸。`, 'good'); pushEv(S, { type: 'coup', actor: chance(S, 0.5) ? me : null, target: t, sev: 55, text: `${NAME(t)}发生政变，新政权倒向${NAME(me)}`, third: 20 }); } else { x.stab = clamp(x.stab + 5, 0, 100); addInfl(S, me, t, -15); if (chance(S, 0.8)) { addRel(S, me, t, -40); pushEv(S, { type: 'coup_fail', actor: me, target: t, sev: 50, text: `${NAME(t)}挫败一起由${NAME(me)}支持的政变图谋` }); R.act(`政变失败，${NAME(t)}公开指控你幕后策划。`, 'bad'); } else R.act(`政变失败，所幸未暴露你的角色。`, 'bad'); } } },
 { id: 'sabotage', cat: 'covert', name: '破坏行动', ap: 1, desc: '破坏对方关键基础设施与军工设施。', cost: (S, me) => pctG(S, me, 0.01),
   check: (S, me, t) => hostileGuard(S, me, t), preview: () => '对方GDP -0.8%、军力 -3%；40%被发现',
   exec(S, me, t, p, R) { const x = S.actors[t]; x.gdp *= 0.992; x.land *= 0.97; x.air *= 0.97; x.navy *= 0.97; const det = chance(S, 0.4); if (det) { addRel(S, me, t, -20); pushEv(S, { type: 'sabotage', actor: me, target: t, sev: 25, text: `${NAME(t)}指控${NAME(me)}实施破坏活动` }); } R.act(`对${NAME(t)}的破坏行动得手${det ? '，但被对方锁定' : ''}。`, det ? 'warn' : 'good'); } },
 { id: 'espionage', cat: 'covert', name: '技术窃取', ap: 1, desc: '获取对方先进技术（对方科技需领先于你）。', cost: (S, me) => pctG(S, me, 0.008),
   check: (S, me, t) => (t === me ? '不能以自己为目标' : S.actors[t].tech <= S.actors[me].tech ? '对方科技并不领先' : null), preview: () => '科技 +1~+3；30%被发现',
   exec(S, me, t, p, R) { const g = (S.actors[t].tech - S.actors[me].tech) * 0.08 + 0.4; S.actors[me].tech = clamp(S.actors[me].tech + g, 0, 100); const det = chance(S, 0.3); if (det) { addRel(S, me, t, -12); pushEv(S, { type: 'espionage', actor: me, target: t, sev: 15, text: `${NAME(t)}破获${NAME(me)}间谍网` }); } R.act(`从${NAME(t)}获得关键技术，科技 +${g.toFixed(1)}${det ? '（间谍网暴露）' : ''}。`, det ? 'warn' : 'good'); } },
 // ---------- 占领区 ----------
 { id: 'pacify', cat: 'occ', name: '占领区治理', ap: 1, desc: '投入治安与重建资源，降低当地抵抗。', cost: (S, me, t) => Math.max(0.5, S.actors[t].gdp * 0.01),
   check: (S, me, t) => (S.actors[t].ctrl !== me || t === me ? '该地区不在你的占领之下' : S.actors[t].integrated ? '已完成整合' : null), preview: () => '抵抗 -12~-20',
   exec(S, me, t, p, R) { const x = S.actors[t]; const d = between(S, 12, 20); x.resist = clamp(x.resist - d, 0, 100); x.stab = clamp(x.stab + 3, 0, 100); R.act(`${NAME(t)}的抵抗运动减弱（-${d.toFixed(0)}）。`, 'good'); } },
 { id: 'annex', cat: 'occ', name: '正式吞并', ap: 2, desc: '将占领区正式并入本国（需抵抗≤30），国际社会将强烈反对。', cost: () => 0,
   check: (S, me, t) => (S.actors[t].ctrl !== me || t === me ? '该地区不在你的占领之下' : S.actors[t].integrated ? '已完成整合' : S.actors[t].resist > 30 ? `抵抗过强（${Math.round(S.actors[t].resist)}>30）` : null), preview: () => 'GDP全额计入；全球关系下降',
   exec(S, me, t, p, R) { const x = S.actors[t]; x.integrated = true; x.resist = Math.min(x.resist, 10); for (const c of IDS) if (c !== me && indep(S, c)) addRel(S, me, c, rel(S, c, t) > 30 ? -12 : -3); R.act(`你宣布正式吞并${NAME(t)}。`, 'warn'); pushEv(S, { type: 'annex', actor: me, target: t, sev: 30, text: `${NAME(me)}宣布吞并${NAME(t)}`, third: 15 }); } },
 { id: 'puppet', cat: 'occ', name: '扶植傀儡政府', ap: 1, desc: '让占领区“独立”并成为你的附庸：抵抗消失，但只获得部分收益。', cost: () => 0,
   check: (S, me, t) => (S.actors[t].ctrl !== me || t === me ? '该地区不在你的占领之下' : null), preview: () => '抵抗清零，对方成为附庸',
   exec(S, me, t, p, R) { const x = S.actors[t]; x.ctrl = t; x.resist = 0; x.integrated = false; const st = DEF[t].milex * DEF[t].ppp * 4 * 0.25; x.land = st * x.mix[0]; x.navy = st * x.mix[1]; x.air = st * x.mix[2]; x.stab = 40; makeVassal(S, t, me); setRel(S, me, t, 50); resetExposure(S); R.act(`你在${NAME(t)}扶植了新政府，其成为你的附庸。`, 'info'); pushEv(S, { type: 'puppet', actor: me, target: t, sev: 15, text: `${NAME(me)}在${NAME(t)}扶植新政府` }); } },
 // ---------- 内政（无需目标） ----------
 { id: 'mobilize', cat: 'dom', name: '调整动员等级', ap: 1, desc: '提高动员可增强战力与兵员，但拖累经济与民心。', self: true, params: [{ key: 'level', label: '等级', options: [{ v: 0, l: '和平状态' }, { v: 1, l: '局部动员' }, { v: 2, l: '总动员' }, { v: 3, l: '全面战争' }] }], cost: () => 0,
   check: (S, me, t, p) => (+p.level === S.actors[me].mob ? '已是该等级' : null), preview: (S, me, t, p) => `战力×${MOB[+p.level || 0]}，兵员×${MANP[+p.level || 0]}，季度增长 -${[0, 0.1, 0.35, 0.8][+p.level || 0]}%`,
   exec(S, me, t, p, R) { S.actors[me].mob = +p.level || 0; R.act(`动员等级调整为「${['和平状态', '局部动员', '总动员', '全面战争'][S.actors[me].mob]}」。`, 'info'); if (S.actors[me].mob >= 2) pushEv(S, { type: 'mobilize', actor: me, target: null, sev: 15, text: `${NAME(me)}宣布进入${['和平状态', '局部动员', '总动员', '全面战争'][S.actors[me].mob]}` }); } },
 { id: 'buildup', cat: 'dom', name: '紧急扩军', ap: 1, desc: '动用国库一次性采购装备、扩充部队。', self: true, params: [{ key: 'tier', label: '规模', options: TIERS.map((x, i) => ({ v: i, l: x.l })) }, { key: 'branch', label: '方向', options: [{ v: 'all', l: '均衡' }, { v: 'land', l: '陆军' }, { v: 'navy', l: '海军' }, { v: 'air', l: '空军与导弹' }] }], cost: tierCost,
   check: () => null, preview: (S, me, t, p) => `军力 +${fmtN(tierCost(S, me, p) * DEF[me].ppp * 0.85)}`,
   exec(S, me, t, p, R) { const x = S.actors[me], pts = tierCost(S, me, p) * DEF[me].ppp * 0.85; const b = p.branch || 'all'; if (b === 'all') { x.land += pts * x.mix[0]; x.navy += pts * x.mix[1]; x.air += pts * x.mix[2]; } else x[b] += pts; R.act(`完成紧急扩军，军力 +${fmtN(pts)}。`, 'good'); pushEv(S, { type: 'buildup', actor: me, target: null, sev: 6, text: `${NAME(me)}大规模扩军` }); } },
 { id: 'stabilize', cat: 'dom', name: '国内宣传维稳', ap: 1, desc: '加强宣传与社会动员，提升稳定度。', self: true, cost: (S, me) => pctG(S, me, 0.02),
   check: () => null, preview: () => '稳定 +3~+6',
   exec(S, me, t, p, R) { const d = between(S, 3, 6); S.actors[me].stab = clamp(S.actors[me].stab + d, 0, 100); R.act(`国内舆论得到引导，稳定度 +${d.toFixed(0)}。`, 'good'); } },
 { id: 'crackdown', cat: 'dom', name: '强力维稳', ap: 1, desc: '强力管控社会与占领区。稳定显著提升，但民主国家会批评你。', self: true, cost: () => 0,
   check: () => null, preview: (S, me) => `稳定 +${DEF[me].gov === 'dem' ? 3 : 7}；占领区抵抗 -8`,
   exec(S, me, t, p, R) { const x = S.actors[me]; x.stab = clamp(x.stab + (DEF[me].gov === 'dem' ? 3 : 7), 0, 100); for (const id of controlled(S, me)) if (id !== me) S.actors[id].resist = clamp(S.actors[id].resist - 8, 0, 100); for (const c of IDS) if (c !== me && DEF[c].gov === 'dem' && indep(S, c)) addRel(S, me, c, -2); R.act('实施强力维稳措施。', 'info'); } },
 { id: 'stimulus', cat: 'dom', name: '经济刺激', ap: 1, desc: '财政刺激计划：未来4个季度增长提速。', self: true, cost: (S, me) => pctG(S, me, 1.0),
   check: () => null, preview: () => '4个季度内年化增长 +1.2%',
   exec(S, me, t, p, R) { S.actors[me].mods.push({ g: 0.3, turns: 4, src: 'stimulus' }); R.act('推出大规模经济刺激计划。', 'good'); } },
 { id: 'research', cat: 'dom', name: '科技攻关', ap: 1, desc: '集中资源攻关关键技术，提升科技水平（影响战力与增长）。', self: true, cost: (S, me) => pctG(S, me, 0.3),
   check: (S, me) => (S.actors[me].tech >= 100 ? '已达顶尖水平' : null), preview: (S, me) => `科技 +${(1 + (100 - S.actors[me].tech) / 40).toFixed(1)}左右`,
   exec(S, me, t, p, R) { const g = between(S, 0.8, 1.4) * (1 + (100 - S.actors[me].tech) / 40); S.actors[me].tech = clamp(S.actors[me].tech + g, 0, 100); R.act(`科技攻关取得进展，科技 +${g.toFixed(1)}。`, 'good'); } },
 { id: 'nukeprog', cat: 'dom', name: '核武计划', ap: 2, desc: '无核国家：推进核武研发（进度满100获得首批核弹头）；有核国家：扩充核武库。会引发强烈国际反应。', self: true, cost: (S, me) => pctG(S, me, 0.15),
   check: () => null, preview: (S, me) => (S.actors[me].nukes > 0 ? `核弹头 +${Math.max(5, Math.round(S.actors[me].nukes * 0.05))}` : `研发进度 ${Math.round(S.actors[me].nukeProg)}% → +8~14%；可能被发现`),
   exec(S, me, t, p, R) { const x = S.actors[me]; if (x.nukes > 0) { const n = Math.max(5, Math.round(x.nukes * 0.05)); x.nukes += n; R.act(`核武库扩充 ${n} 枚弹头。`, 'info'); pushEv(S, { type: 'nukeexpand', actor: me, target: null, sev: 12, text: `${NAME(me)}扩充核武库` }); } else { x.nukeProg = clamp(x.nukeProg + between(S, 8, 14), 0, 100); if (x.nukeProg >= 100) { x.nukes = 10; x.nukeProg = 100; R.act('核试验成功！你已成为有核国家。', 'warn'); pushEv(S, { type: 'nuketest', actor: me, target: null, sev: 45, text: `${NAME(me)}进行核试验`, third: 30 }); } else { R.act(`核武研发进度达到 ${Math.round(x.nukeProg)}%。`, 'info'); if (chance(S, 0.4)) pushEv(S, { type: 'nukeprog', actor: me, target: null, sev: 30, text: `情报显示${NAME(me)}正秘密推进核武计划`, third: 20 }); } } } },
 { id: 'leavebloc', cat: 'dom', name: '退出集团', ap: 1, desc: '退出所在的军事集团（如北约、集安组织）。', self: true, params: [{ key: 'bloc', label: '集团', options: [] }], cost: () => 0,
   check: (S, me, t, p) => (!Object.values(S.blocs).some(b => b.members.includes(me)) ? '你不属于任何军事集团' : null), preview: () => '集团成员对你的关系下降',
   exec(S, me, t, p, R) { const b = S.blocs[p.bloc] || Object.values(S.blocs).find(x => x.members.includes(me)); if (!b) return; b.members = b.members.filter(m => m !== me); for (const m of b.members) addRel(S, me, m, m === b.leader ? -25 : -15); if (b.leader === me && b.members.length) b.leader = b.members.slice().sort((x, y) => power(S, y) - power(S, x))[0]; R.act(`你宣布退出${b.name}。`, 'warn'); pushEv(S, { type: 'leavebloc', actor: me, target: b.leader, sev: 25, text: `${NAME(me)}退出${b.name}`, third: 10 }); } },
];
const ACT = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
const TREATY_NAME = { alliance: '军事同盟', partner: '安全伙伴关系', nap: '互不侵犯条约', trade: '自贸协定', access: '驻军协定' };
function chanceText(score) { const p = 1 / (1 + Math.exp(-score * 4)); const w = p > 0.8 ? '很可能同意' : p > 0.55 ? '可能同意' : p > 0.35 ? '难以判断' : p > 0.15 ? '不太可能同意' : '几乎不可能同意'; return `对方${w}（约${Math.round(p * 100)}%）`; }
function coupChance(S, me, t) { const x = S.actors[t]; let p = ((infl(S, me, t) - 30) / 70) * (1.1 - x.stab / 100) * 1.25; if (x.nukes > 0 || power(S, t) > 1200) p *= 0.3; if (DEF[t].gov === 'dem') p *= 0.7; return clamp(p, 0.03, 0.75); }
function estimateRatio(S, me, t, commit) {
  const def = boss(S, t); const r = route(S, me, t); if (!r) return 0;
  let a = (landEff(S, me) + 0.6 * airEff(S, me)) * commit;
  let d = (landEff(S, def) + 0.6 * airEff(S, def)) * (def === t ? 0.75 : 0.35) + allyHelp(S, def, me) * 0.5;
  if (r.kind !== 'land') { const nav = navyEff(S, me) * commit; const nr = (nav + 1) / (navyEff(S, def) * 0.8 + 1); a = Math.min(a, nav * (r.kind === 'amphib' ? 0.55 : 0.35) + 5) * clamp(nr / 1.5, 0.05, 1) * (r.kind === 'amphib' ? 0.75 : 0.55); d *= r.kind === 'amphib' ? 1.6 : 1.4; }
  return a / Math.max(1, d * DEF[t].terr);
}
function applyPeace(S, a, b, terms, R) {
  // a 提议，b 接受
  if (terms === 'vassal') { makePeace(S, a, b, 'white', true); makeVassal(S, b, a); R && R.act(`${NAME(b)}接受和平条件，成为${NAME(a)}的附庸。`, 'good'); pushEv(S, { type: 'vassal', actor: a, target: b, sev: 20, text: `${NAME(b)}战败，成为${NAME(a)}的附庸` }); }
  else if (terms === 'reparations') { const pay = S.actors[b].gdp * 0.05; S.actors[b].treasury -= pay; S.actors[a].treasury += pay; makePeace(S, a, b, 'white'); R && R.act(`${NAME(b)}同意支付${fmtB(pay)}美元赔款，双方签署和约。`, 'good'); }
  else { makePeace(S, a, b, terms === 'ceasefire' ? 'ceasefire' : 'white'); R && R.act(`你与${NAME(b)}${terms === 'ceasefire' ? '达成停火' : '签署和平协议'}。`, 'good'); }
  pushEv(S, { type: 'peace', actor: a, target: b, sev: -15, text: `${NAME(a)}与${NAME(b)}${terms === 'ceasefire' ? '停火' : '媾和'}` });
}
function nuclearStrike(S, me, t, scope, R) {
  const x = S.actors[t], mine = S.actors[me]; const strat = scope === 'strategic';
  const n = strat ? Math.min(mine.nukes, Math.max(20, Math.round(mine.nukes * 0.1))) : Math.min(mine.nukes, 5);
  mine.nukes -= n;
  x.land *= strat ? 0.7 : 0.62; x.air *= strat ? 0.7 : 0.7; x.navy *= 0.8; x.gdp *= strat ? 0.68 : 0.95; x.stab = clamp(x.stab - (strat ? 35 : 15), 0, 100);
  for (const c of IDS) if (c !== me) addRel(S, me, c, strat ? -70 : -40);
  mine.stab = clamp(mine.stab - (strat ? 20 : 10), 0, 100);
  S.globalMod.push({ g: strat ? -0.8 : -0.3, turns: 4 }); S.tension = 100;
  if (!atWar(S, me, boss(S, t))) declareWar(S, me, boss(S, t));
  const txt = `${NAME(me)}对${NAME(t)}实施了${strat ? '战略' : '战术'}核打击`;
  const isP = me === S.player;
  const say = (a, b) => (R.act && isP ? R.act(a, 'bad') : R.ai.push({ text: b, tone: 'bad', actors: [me, t], big: true }));
  say(`你下令对${NAME(t)}实施${strat ? '战略' : '战术'}核打击。世界陷入震惊与恐慌。`, txt + '！世界陷入震惊与恐慌。');
  logEvent(S, { type: 'nuke', text: txt + '。', tone: 'bad', actors: [me, t] });
  pushEv(S, { type: 'nuke', actor: me, target: t, sev: 100, text: txt, third: 60 });
  for (const c of IDS) if (c !== me && indep(S, c) && S.actors[c].ctrl === c && DEF[c].gov !== 'aut' && !isAlly(S, c, me)) addSanction(S, c, me, 'econ', 3);
  // 报复
  const retaliators = [];
  if (x.nukes >= 5 && indep(S, t)) retaliators.push([t, 0.85]);
  for (const c of IDS) if (c !== t && c !== me && S.actors[c].nukes > 50 && indep(S, c) && isAlly(S, c, t)) retaliators.push([c, (strat ? 0.8 : 0.45) * S.actors[c].loyal + 0.1]);
  let bigExchange = false;
  for (const [c, p] of retaliators) {
    if (!chance(S, p)) continue;
    const y = S.actors[c]; const m = Math.min(y.nukes, strat ? Math.max(20, Math.round(y.nukes * 0.12)) : 5); y.nukes -= m;
    mine.land *= strat ? 0.7 : 0.65; mine.air *= 0.7; mine.navy *= 0.8; mine.gdp *= strat ? 0.65 : 0.94; mine.stab = clamp(mine.stab - (strat ? 30 : 12), 0, 100);
    if (!atWar(S, c, me)) declareWar(S, c, me);
    say(`${NAME(c)}实施核报复，你遭受重创。`, `${NAME(c)}对${NAME(me)}实施核报复。`);
    logEvent(S, { type: 'nuke', text: `${NAME(c)}对${NAME(me)}实施核报复。`, tone: 'bad', actors: [c, me] });
    if (strat && (DEF[c].nukes >= 1000 || y.nukes >= 1000) && (DEF[me].nukes >= 1000)) bigExchange = true;
    if (strat && chance(S, 0.35) && y.nukes > 200 && mine.nukes > 200) bigExchange = true;
  }
  if (bigExchange) { S.over = { result: 'apocalypse', reason: '核报复链失控，演变为大国之间的全面核战争。文明遭受毁灭性打击——没有赢家。' }; }
}

/* ---------- 玩家排队 ---------- */
function actionStatus(S, id, target, params = {}) {
  const def = ACT[id]; const me = S.player;
  if (!def) return { ok: false, reason: '未知行动' };
  const t = def.self ? me : target;
  const reason = def.check(S, me, t, params);
  const cost = def.cost(S, me, t, params);
  if (reason) return { ok: false, reason, cost };
  if (def.ap > apLeft(S)) return { ok: false, reason: `行动点不足（需${def.ap}）`, cost };
  if (cost > 0 && S.actors[me].treasury - moneyQueued(S) < cost - S.actors[me].gdp * 0.08) return { ok: false, reason: '国库资金不足（债务已达上限）', cost };
  if (S.queue.some(q => q.type === id && q.target === t && !['aid', 'armsaid', 'loan'].includes(id))) return { ok: false, reason: '本回合已安排同一行动', cost };
  let preview = ''; try { preview = def.preview ? def.preview(S, me, t, params) : ''; } catch (e) { preview = ''; }
  return { ok: true, cost, preview };
}
function queueAction(S, id, target, params = {}) {
  const st = actionStatus(S, id, target, params);
  if (!st.ok) return st;
  const def = ACT[id];
  S.queue.push({ type: id, target: def.self ? S.player : target, params: { ...params }, ap: def.ap, cost: st.cost, label: def.name + (def.self ? '' : ' → ' + NAME(target)) + paramLabel(def, params) });
  return { ok: true };
}
function paramLabel(def, p) { if (!def.params) return ''; return def.params.map(pp => { const o = pp.options.find(o => String(o.v) === String(p[pp.key])); return o ? '（' + o.l + '）' : ''; }).join(''); }
function queueCustom(S, order) { // 来自自由指令裁定
  S.queue.push({ type: 'custom', target: order.target || null, ap: clamp(order.ap | 0 || 1, 1, 3), cost: clamp(+order.cost || 0, 0, S.actors[S.player].gdp * 0.03), order, label: '自由指令：' + (order.summary || order.text || '').slice(0, 26) });
}

/* ---------- 自由指令效果（带上下限） ---------- */
function applyEffect(S, e, R, src) {
  const me = S.player; const ok = id => id && S.actors[id];
  const T = e.target || e.b || e.actor;
  switch (e.type) {
    case 'rel': { const a = ok(e.a) ? e.a : me, b = ok(e.b) ? e.b : T; if (ok(b) && a !== b) { const d = clamp(+e.delta || 0, -30, 30); addRel(S, a, b, d); return `${NAME(a)}—${NAME(b)}关系${d >= 0 ? '+' : ''}${Math.round(d)}`; } break; }
    case 'infl': if (ok(T) && T !== me) { const d = clamp(+e.delta || 0, -20, 25); addInfl(S, me, T, d); return `在${NAME(T)}的影响力${d >= 0 ? '+' : ''}${Math.round(d)}`; } break;
    case 'stab': if (ok(T)) { const d = clamp(+e.delta || 0, -15, 10); S.actors[T].stab = clamp(S.actors[T].stab + d, 0, 100); return `${NAME(T)}稳定${d >= 0 ? '+' : ''}${Math.round(d)}`; } break;
    case 'gdp': if (ok(T)) { const d = clamp(+e.pct || 0, -6, 4); S.actors[T].gdp *= 1 + d / 100; return `${NAME(T)} GDP ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`; } break;
    case 'growth': if (ok(T)) { const d = clamp(+e.pct || 0, -2, 2); S.actors[T].mods.push({ g: d / 4, turns: clamp(e.turns | 0 || 4, 1, 8), src: 'order' }); return `${NAME(T)}年增长${d >= 0 ? '+' : ''}${d.toFixed(1)}%（${clamp(e.turns | 0 || 4, 1, 8)}季）`; } break;
    case 'mil': if (ok(T)) { const d = clamp(+e.pct || 0, -20, 15) / 100; const br = ['land', 'navy', 'air'].includes(e.branch) ? [e.branch] : ['land', 'navy', 'air']; for (const b of br) S.actors[T][b] *= 1 + d; return `${NAME(T)}军力${d >= 0 ? '+' : ''}${Math.round(d * 100)}%`; } break;
    case 'tech': if (ok(T)) { const d = clamp(+e.delta || 0, -5, 5); S.actors[T].tech = clamp(S.actors[T].tech + d, 0, 100); return `${NAME(T)}科技${d >= 0 ? '+' : ''}${d.toFixed(1)}`; } break;
    case 'treasury': { const d = clamp(+e.delta || 0, -S.actors[me].gdp * 0.03, S.actors[me].gdp * 0.01); S.actors[me].treasury += d; return `国库${d >= 0 ? '+' : ''}${fmtB(d)}`; }
    case 'sanction': if (ok(T) && T !== me) { const L = clamp(e.level | 0 || 1, 1, 3); addSanction(S, me, T, ['econ', 'tech', 'tariff', 'fin', 'energy'].includes(e.kind) ? e.kind : 'econ', L); addRel(S, me, T, -8 * L); return `对${NAME(T)}实施制裁（${L}级）`; } break;
    case 'treaty': if (ok(T) && T !== me && TREATY_NAME[e.treaty]) { const d = decide(S, me, T, { type: e.treaty === 'partner' ? 'partner' : e.treaty }); if (d.ok) { addTreaty(S, e.treaty, me, T); return `${NAME(T)}同意建立${TREATY_NAME[e.treaty]}`; } return `${NAME(T)}拒绝了${TREATY_NAME[e.treaty]}`; } break;
    case 'war': if (ok(T) && T !== me) { const r = route(S, me, T); if (r && S.actors[T].ctrl !== me) { const f = openFront(S, me, T, clamp(+e.commit || 0.5, 0.2, 0.85), r.kind); pushEv(S, { type: 'invade', actor: me, target: T, sev: 85, text: `${NAME(me)}对${NAME(T)}发动进攻`, third: 25, front: f.id }); return `对${NAME(T)}开辟战线`; } return `无法对${NAME(T)}发动进攻（无路线）`; } break;
    case 'vassal': if (ok(T) && T !== me && indep(S, T)) { const d = decide(S, me, T, { type: 'vassal' }, 0.2); if (d.ok) { makeVassal(S, T, me); return `${NAME(T)}成为你的附庸`; } return `${NAME(T)}拒绝臣服`; } break;
    case 'event': return String(e.text || '').slice(0, 80);
  }
  return null;
}
function normalizeEffect(S, e) { // 把 LLM 给出的效果限制在允许范围内（用于展示与执行一致）
  const o = { ...e }; const num = (v, a, b, d = 0) => clamp(Number.isFinite(+v) ? +v : d, a, b);
  switch (o.type) {
    case 'rel': o.delta = Math.round(num(o.delta, -30, 30)); break;
    case 'infl': o.delta = Math.round(num(o.delta, -20, 25)); break;
    case 'stab': o.delta = Math.round(num(o.delta, -15, 10)); break;
    case 'gdp': o.pct = +num(o.pct, -6, 4).toFixed(1); break;
    case 'growth': o.pct = +num(o.pct, -2, 2).toFixed(1); o.turns = Math.round(num(o.turns, 1, 8, 4)); break;
    case 'mil': o.pct = Math.round(num(o.pct, -20, 15)); break;
    case 'tech': o.delta = +num(o.delta, -5, 5).toFixed(1); break;
    case 'treasury': o.delta = +num(o.delta, -S.actors[S.player].gdp * 0.03, S.actors[S.player].gdp * 0.01).toFixed(1); break;
    case 'sanction': o.level = Math.round(num(o.level, 1, 3, 1)); break;
    case 'war': o.commit = +num(o.commit, 0.2, 0.85, 0.5).toFixed(2); break;
  }
  return o;
}
function execCustom(S, q, R) {
  const o = q.order; const me = S.player;
  const p = clamp(+o.successChance || 0.6, 0.05, 0.95);
  const success = chance(S, p);
  const effs = (success ? o.effects : o.onFailure) || [];
  const done = [];
  for (const e of effs.slice(0, 8)) { const r = applyEffect(S, e, R, 'order'); if (r) done.push(r); }
  const detected = chance(S, clamp(+o.detectionRisk || 0, 0, 1));
  let sev = 0; const tgts = new Set();
  for (const e of (o.effects || [])) { const T = e.target || e.b; if (T && T !== me && S.actors[T]) { tgts.add(T); if (e.type === 'rel' && e.delta < 0) sev += -e.delta; if (['stab', 'gdp', 'mil', 'tech'].includes(e.type) && ((e.delta || e.pct || 0) < 0)) sev += 12; if (e.type === 'war') sev += 85; if (e.type === 'sanction') sev += 15 * (e.level || 1); } }
  const covert = (+o.detectionRisk || 0) > 0;
  if (!covert || detected) for (const T of tgts) pushEv(S, { type: 'custom', actor: me, target: T, sev: clamp(sev || (o.hostility | 0) || 10, 0, 90), text: `${NAME(me)}：${o.summary || '特别行动'}${covert ? '（被曝光）' : ''}` });
  R.custom.push({ text: o.summary || o.text, success, p, detected: covert ? detected : null, narrative: success ? o.narrative : (o.failNarrative || '行动未能达成预期目标。'), effects: done });
}

/* ---------- 回合结算：执行玩家行动 ---------- */
function newReport(S) {
  const R = { turn: S.turn, date: dateStr(S), actions: [], custom: [], reactions: [], war: [], events: [], ai: [], headlines: [], inbox: [], econ: null, llmNote: null };
  R.act = (text, tone) => R.actions.push({ text, tone });
  return R;
}
function prepareTurn(S) {
  if (S.over) return null;
  S.turnEvents = [];
  const R = newReport(S); S._R = R;
  const me = S.player;
  S.pre = { gdp: S.actors[me].gdp, stab: S.actors[me].stab, mil: power(S, me), treasury: S.actors[me].treasury, tech: S.actors[me].tech };
  for (const q of S.queue) {
    try {
      if (q.type === 'done') continue;
      if (q.type === 'custom') { S.actors[me].treasury -= q.cost || 0; execCustom(S, q, R); continue; }
      const def = ACT[q.type]; const t = q.target;
      const reason = def.check(S, me, t, q.params || {});
      if (reason) { R.act(`「${def.name}${def.self ? '' : ' → ' + NAME(t)}」未能执行：${reason}`, 'bad'); continue; }
      S.actors[me].treasury -= q.cost || 0;
      def.exec(S, me, t, q.params || {}, R);
    } catch (err) { R.act(`行动执行出错：${q.label}`, 'bad'); if (typeof console !== 'undefined') console.error(err); }
  }
  S.queue = [];
  return R;
}

/* ---------- 反应：选择相关国家 ---------- */
function relevance(S, X, ev) { // 带符号：正=受损/不满，负=支持行动方
  const sev = ev.sev || 0, Ac = ev.actor, T = ev.target;
  if ((!Ac && !T) || Ac === X) return 0;
  if (T === X) return sev;
  let s = 0;
  if (T) {
    if (sev > 0) {
      const aff = (isAlly(S, X, T) ? 0.6 : isPartner(S, X, T) ? 0.4 : 0) + rel(S, X, T) / 200 - (Ac ? rel(S, X, Ac) / 200 + (isAlly(S, X, Ac) ? 0.3 : 0) : 0);
      s += sev * clamp(aff, -0.5, 1);
    } else if (rel(S, X, T) < -40) s += -sev * 0.35 + (ev.arms ? 10 : 0);
  }
  if (ev.third) s += ev.third * clamp(0.5 - (Ac ? rel(S, X, Ac) : 0) / 120, 0, 1.2) * (dist(X, Ac || T) < 2500 ? 1.2 : 0.8);
  if (Ac && sev >= 40 && (landAdj(X, Ac) || dist(X, Ac) < 800)) s += sev * 0.2 * clamp(0.5 - rel(S, X, Ac) / 100, 0, 1);
  if (['USA', 'CHN', 'RUS'].includes(X) && sev >= 40 && Ac) s += sev * 0.2 * clamp(0.5 - rel(S, X, Ac) / 100, -0.3, 1);
  return s;
}
function reactionCandidates(S, limit = 10) {
  const evs = (S.turnEvents || []).filter(e => e.actor === S.player || e.target === S.player);
  const out = [];
  for (const X of IDS) {
    if (X === S.player || !indep(S, X) || S.actors[X].overlord === S.player) continue;
    let pos = 0, neg = 0; for (const e of evs) { const r = relevance(S, X, e); if (r > 0) pos += r; else neg -= r; }
    const sc = pos + neg * 0.7;
    if (sc >= 7) out.push({ id: X, score: sc, g: pos, f: neg });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function aiOffensive(S, X, E, commit, minRatio = 1.2) { // 选择敌方领土中最有利的进攻方向
  let best = null, bs = 0;
  for (const T of realm(S, E)) {
    if (S.actors[T].ctrl === T && T !== E) continue; // 敌方附庸暂不作为目标
    const r = route(S, X, T); if (!r) continue;
    const er = estimateRatio(S, X, T, commit) * (T !== E && (rel(S, X, T) > 20 || isAlly(S, X, T)) ? 1.5 : 1) * (T === E ? 0.85 : 1);
    if (er > bs) { bs = er; best = [T, r]; }
  }
  if (!best || bs < minRatio) return null;
  openFront(S, X, best[0], commit, best[1].kind);
  return best[0];
}
/* ---------- 反应：通用执行原语 ---------- */
const STANCES = ['强烈反对', '反对', '关切', '中立', '支持', '欢迎'];
function aiDo(S, X, act, R, src = 'rule') {
  const P = S.player; const t = act.target && S.actors[act.target] ? act.target : null; const x = S.actors[X];
  const out = s => s;
  try {
    switch (act.type) {
      case 'none': return null;
      case 'condemn': if (t) { addRel(S, X, t, -8); return out(`谴责${NAME(t)}`); } break;
      case 'expel': if (t) { addRel(S, X, t, -12); return out(`驱逐${NAME(t)}外交官`); } break;
      case 'recall': if (t) { addRel(S, X, t, -6); return out(`召回驻${NAME(t)}大使`); } break;
      case 'sanction': if (t && t !== X) { const L = clamp(act.level | 0 || 1, 1, 3); const kind = ['econ', 'tech', 'tariff', 'fin', 'energy'].includes(act.kind) ? act.kind : 'econ'; if (kind === 'fin' && DEF[X].fin < 2) return aiDo(S, X, { type: 'sanction', target: t, level: L }, R, src); if (kind === 'energy' && DEF[X].energy < 1) return null; addSanction(S, X, t, kind, kind === 'econ' ? Math.max(L, sanctionLevel(S, X, t, 'econ')) : 1); addRel(S, X, t, -6 * L); return out(`对${NAME(t)}${{ econ: ['', '定向制裁', '全面制裁', '贸易禁运'][L], tech: '科技管制', tariff: '加征关税', fin: '金融制裁', energy: '能源禁运' }[kind]}`); } break;
      case 'lift': if (t) { removeSanctions(S, X, t); addRel(S, X, t, 6); return out(`解除对${NAME(t)}的制裁`); } break;
      case 'buildup': { const pct = clamp(+act.pct || 0.3, 0.1, 1.5); x.milPct = clamp(x.milPct + pct, 0.3, 30); x.flags.buildupTo = S.turn + 6; return out(`军费提高至GDP的${x.milPct.toFixed(1)}%`); }
      case 'mobilize': { const L = clamp(act.level | 0 || 1, 0, 3); if (L > x.mob) { x.mob = L; return out(`进入${['和平', '局部动员', '总动员', '全面战争'][L]}状态`); } break; }
      case 'arms_aid': if (t && t !== X && indep(S, t)) { const c = x.gdp * clamp(+act.pct || 0.1, 0.02, 0.5) / 100; const y = S.actors[t], pts = c * DEF[t].ppp * 0.9; y.land += pts * y.mix[0]; y.air += pts * y.mix[2]; y.navy += pts * y.mix[1]; addRel(S, X, t, 5); addInfl(S, X, t, 3); x.treasury -= c; return out(`向${NAME(t)}提供${fmtB(c)}美元军援`); } break;
      case 'aid': if (t && t !== X && indep(S, t)) { const c = x.gdp * clamp(+act.pct || 0.1, 0.02, 0.5) / 100; const y = S.actors[t]; y.treasury += c; y.mods.push({ g: clamp(c / y.gdp * 40, 0.05, 1), turns: 3, src: 'aid' }); addRel(S, X, t, 5); addInfl(S, X, t, clamp(c / y.gdp * 300, 1, 10)); x.treasury -= c; return out(`向${NAME(t)}提供${fmtB(c)}美元经济援助`); } break;
      case 'improve': if (t) { addRel(S, X, t, clamp(+act.delta || 8, 2, 15)); return out(`向${NAME(t)}释放善意`); } break;
      case 'alliance': if (t && t !== X && indep(S, t) && !isAlly(S, X, t) && !atWar(S, X, t)) { if (t === P) { pushOffer(S, mkOffer(S, X, { type: 'alliance' }, act.text || `${NAME(X)}希望与你缔结军事同盟。`)); return out('向你提议结盟'); } const d = decide(S, X, t, { type: 'alliance' }); if (d.ok) { addTreaty(S, 'alliance', X, t); addRel(S, X, t, 8); return out(`与${NAME(t)}结成同盟`); } return out(`寻求与${NAME(t)}结盟（未果）`); } break;
      case 'partner': if (t && t !== X && indep(S, t) && !isAlly(S, X, t)) { addTreaty(S, 'partner', X, t); addRel(S, X, t, 6); return out(`与${NAME(t)}建立安全伙伴关系`); } break;
      case 'trade': if (t && t !== X && indep(S, t) && !hasTreaty(S, X, t, 'trade')) { if (t === P) { pushOffer(S, mkOffer(S, X, { type: 'trade' }, act.text || `${NAME(X)}提议与你签署自贸协定。`)); return out('向你提议自贸协定'); } addTreaty(S, 'trade', X, t); return out(`与${NAME(t)}签署自贸协定`); } break;
      case 'cancel_treaty': if (t) { const had = treatiesOf(S, X, t).filter(h => h.type !== 'access' || true); if (had.length) { S.treaties = S.treaties.filter(h => !had.includes(h)); resetExposure(S); addRel(S, X, t, -15); return out(`终止与${NAME(t)}的${had.map(h => TREATY_NAME[h.type]).join('、')}`); } } break;
      case 'exercise': if (t) { addRel(S, X, t, -5); if (t === P) S.actors[P].fear[X] = S.turn + 2; return out(`在${NAME(t)}周边举行军演`); } break;
      case 'cyber': if (t && t !== X) { const y = S.actors[t]; y.gdp *= 1 - between(S, 0.4, 1.0) / 100; y.stab = clamp(y.stab - 1, 0, 100); addRel(S, X, t, -10); return out(`对${NAME(t)}发动网络攻击`); } break;
      case 'strike': if (t && t !== X && indep(S, t) && canStrike(S, X, t)) { const P_ = airEff(S, X) * 0.3, D_ = airEff(S, t) * 0.5 * DEF[t].terr, fr = clamp(0.04 + 0.12 * P_ / (P_ + D_ + 1), 0.03, 0.16); const y = S.actors[t]; y.land *= 1 - fr * 0.7; y.air *= 1 - fr; y.navy *= 1 - fr * 0.6; y.gdp *= 0.995; addRel(S, X, t, -30); S.tension = clamp(S.tension + 4, 0, 100); return out(`对${NAME(t)}实施报复性打击（毁伤约${Math.round(fr * 100)}%军力）`); } break;
      case 'join_war': { const en = act.enemy && S.actors[act.enemy] ? boss(S, act.enemy) : (t || null); if (!en || en === X || atWar(S, X, en) || !indep(S, en)) break; declareWar(S, X, en); x.mob = Math.max(x.mob, 1); logEvent(S, { type: 'war', text: `${NAME(X)}对${NAME(en)}宣战。`, tone: 'warn', actors: [X, en] }); let msg = `对${NAME(en)}宣战`; if (act.offensive) { const T = aiOffensive(S, X, en, 0.4); if (T) msg += `并向${NAME(T)}发起进攻`; } return out(msg); }
      case 'declare_war': case 'invade': if (t && t !== X && indep(S, X)) { const T = t; if (S.actors[T].ctrl === X) break; const r = route(S, X, T); if (!r) { if (!atWar(S, X, boss(S, T))) { declareWar(S, X, boss(S, T)); return out(`对${NAME(boss(S, T))}宣战`); } break; } const f = openFront(S, X, T, clamp(+act.commit || 0.45, 0.2, 0.8), r.kind); x.mob = Math.max(x.mob, 1); logEvent(S, { type: 'war', text: `${NAME(X)}对${NAME(T)}发动进攻。`, tone: 'warn', actors: [X, T] }); return out(`对${NAME(T)}发动进攻`); } break;
      case 'blockade': if (t && !LANDLOCKED.has(t) && navyEff(S, X) > 1.3 * (navyEff(S, t) + 1) && minDistFrom(S, X, t) <= reach(S, X) && !S.blockades.some(b => b.by === X && b.target === t)) { S.blockades.push({ by: X, target: t, since: S.turn }); addRel(S, X, t, -30); return out(`海军封锁${NAME(t)}`); } break;
      case 'nuke_threat': if (x.nukes > 0 && t) { addRel(S, X, t, -12); S.tension = clamp(S.tension + 8, 0, 100); return out(`对${NAME(t)}发出核威慑警告`); } break;
      case 'ceasefire': case 'peace': if (t && atWar(S, X, t)) { if (t === P) { pushOffer(S, mkOffer(S, X, { type: act.type === 'ceasefire' ? 'ceasefire' : 'peace', terms: act.terms || (act.type === 'ceasefire' ? 'ceasefire' : 'white') }, act.text || `${NAME(X)}提议${act.type === 'ceasefire' ? '停火' : '和谈'}。`)); return out(`向你提出${act.type === 'ceasefire' ? '停火' : '和谈'}`); } const d = decide(S, X, t, { type: act.type, terms: act.terms || 'white' }); if (d.ok) { makePeace(S, X, t, act.type === 'ceasefire' ? 'ceasefire' : 'white'); return out(`与${NAME(t)}${act.type === 'ceasefire' ? '停火' : '媾和'}`); } return out(`向${NAME(t)}提议和谈（被拒）`); } break;
      case 'demand': if (t === P) { pushOffer(S, mkOffer(S, X, { type: 'demand', demand: act.demand || 'lift' }, act.text || `${NAME(X)}要求你${DEMAND_TEXT[act.demand] || '改变政策'}。`)); return out('向你提出要求'); } break;
      case 'offer_vassal': if (t === P && !S.actors[X].overlord) { pushOffer(S, mkOffer(S, X, { type: 'protectorate' }, act.text || `${NAME(X)}希望接受你的保护，成为你的附庸。`)); return out('请求成为你的附庸'); } break;
      case 'energy_embargo': return aiDo(S, X, { type: 'sanction', target: t, kind: 'energy' }, R, src);
      case 'tech_ban': return aiDo(S, X, { type: 'sanction', target: t, kind: 'tech' }, R, src);
      case 'tariff': return aiDo(S, X, { type: 'sanction', target: t, kind: 'tariff' }, R, src);
    }
  } catch (e) { if (typeof console !== 'undefined') console.error('aiDo', X, act, e); }
  return null;
}
const DEMAND_TEXT = { lift: '解除对其的制裁', withdraw: '停止军事行动并撤军', break_alliance: '终止与其对手的同盟', pay: '支付赔偿', stop_nuke: '停止核武计划' };
function pushOffer(S, o) { if (S.inbox.some(x => x.from === o.from && x.deal.type === o.deal.type)) return; S.inbox.push(o); }
function mkOffer(S, from, deal, text) { return { id: 'O' + S.seq++, from, deal, text, turn: S.turn, expires: S.turn + 2 }; }

/* ---------- 规则 AI：对玩家行动的反应 ---------- */
const TEMPL = {
  '强烈反对': ['{v}强烈谴责{p}的行径，称其“严重践踏国际关系基本准则”，将采取一切必要措施。', '{v}表示，{p}的挑衅不会得逞，“任何后果将由其自行承担”。', '{v}宣布将作出坚决回应，并呼吁国际社会共同施压{p}。'],
  '反对': ['{v}对{p}的做法表示强烈不满，已提出严正交涉。', '{v}称{p}的行动“危险且不负责任”，要求其立即纠正。', '{v}批评{p}加剧地区紧张，敦促其悬崖勒马。'],
  '关切': ['{v}对事态发展表示关切，呼吁各方保持克制、通过对话解决分歧。', '{v}表示正密切关注局势，希望有关各方避免采取升级行动。', '{v}称将与伙伴协商应对，暂不表明立场。'],
  '中立': ['{v}表示不选边站队，将根据自身利益审慎评估局势。', '{v}拒绝就此事公开表态，称“一切以国家利益为重”。', '{v}呼吁通过外交途径解决问题。'],
  '支持': ['{v}表示理解{p}的立场，愿就共同关心的问题加强合作。', '{v}称{p}的行动“事出有因”，反对外部势力借机施压。', '{v}表示愿与{p}保持密切沟通与协调。'],
  '欢迎': ['{v}欢迎{p}的积极姿态，称双方合作前景广阔。', '{v}对{p}的举措表示赞赏，期待进一步深化关系。'],
};
function addReaction(R, r) { const o = R.reactions.find(z => z.actor === r.actor); if (o) { o.actions.push(...r.actions); if (r.src === 'llm' && o.src !== 'llm') { o.statement = r.statement; o.stance = r.stance; o.reason = r.reason; o.src = 'llm'; } return o; } R.reactions.push(r); return r; }
function statement(S, X, stance) { const arr = TEMPL[stance] || TEMPL['关切']; return pick(S, arr).replace('{v}', DEF[X].voice).replace(/\{p\}/g, NAME(S.player)); }
function softPick(S, opts, temp) {
  const m = Math.max(...opts.map(o => o.u));
  const w = opts.map(o => Math.exp((o.u - m) / temp)); const tot = w.reduce((a, b) => a + b, 0);
  let r = rnd(S) * tot; for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
  return opts[opts.length - 1];
}
function ruleReact(S, X, R) {
  const P = S.player, x = S.actors[X], d = DEF[X];
  const evs = (S.turnEvents || []).filter(e => e.actor === P || e.target === P);
  let G = 0, F = 0, good = 0, victim = null, victimSev = 0, war = false, nuke = false, direct = false, invadedMe = false, cyberHit = false, invadedFriend = null;
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
  const rP = rel(S, X, P) / 100;
  const ratio = (power(S, P) + 1) / (power(S, X) + 1);
  const dep = exposure(S, X, P);
  const temp = S.diff === 'hard' ? 0.3 : S.diff === 'easy' ? 0.6 : 0.4;
  const fearF = x.fear[P] > S.turn ? 0.35 : 0;
  const nearP = minDistFrom(S, P, X) < 1500;
  const opts = [];
  if (G < 8 && (good > 0 || F > 0)) { // 受惠方或支持者
    opts.push({ k: 'none', u: 0.45 });
    if (good > 0) opts.push({ k: 'welcome', u: 0.4 + good / 30 + rP * 0.3 });
    if (F > 0) opts.push({ k: 'back', u: 0.35 + F / 40 + rP * 0.4 });
    if (good > 0 && !hasTreaty(S, X, P, 'trade') && rP > 0.2) opts.push({ k: 'offer_trade', u: 0.2 + rP * 0.6 });
    if (F > 25 && atWar(S, P, victim || 'none') && rP > 0.5 && x.hawk > 0.5) opts.push({ k: 'arms_p', u: 0.2 + F / 100 });
  } else if (invadedMe) { // 遭到入侵
    opts.push({ k: 'mobilize', u: 1.2 });
    opts.push({ k: 'seek_help', u: 0.9 + (1 - x.risk) * 0.2 });
    opts.push({ k: 'sanction', u: 0.5 * x.econ + 0.2 });
    if (canStrike(S, X, P)) opts.push({ k: 'strike', u: x.hawk * 0.9 });
    if (x.nukes > 0) opts.push({ k: 'nuke_threat', u: 0.3 + x.hawk * 0.5 });
  } else {
    opts.push({ k: 'none', u: 0.45 - G / 80 + fearF + (dep > 0.12 ? 0.2 : 0) + (rP > 0.4 ? 0.2 : 0) });
    opts.push({ k: 'condemn', u: 0.25 + Math.min(G, 40) / 70 - Math.max(0, rP) * 0.4 });
    if (G >= 15) opts.push({ k: 'sanction', u: (G / 60) * x.econ * (1 - Math.min(0.8, dep * 3)) - Math.max(0, rP) * 0.6 + (war ? 0.2 : 0) - fearF });
    opts.push({ k: 'buildup', u: (Math.min(3, ratio) / 3) * x.hawk * 0.6 + G / 140 - (x.flags.buildupTo > S.turn ? 0.4 : 0) });
    if (victim && rel(S, X, victim) >= 25) opts.push({ k: 'arms', u: x.loyal * 0.45 + victimSev / 150 + rel(S, X, victim) / 250 - Math.max(0, rP) * 0.3 });
    if (war && invadedFriend && !atWar(S, X, P)) {
      const base = isAlly(S, X, invadedFriend) ? 1.4 : isPartner(S, X, invadedFriend) ? 0.75 : 0.35;
      const far = minDistFrom(S, X, invadedFriend) > reach(S, X) * 1.3 ? 0.4 : 0;
      opts.push({ k: 'join', u: base * (0.5 + x.loyal * 0.7) + x.hawk * 0.3 + G / 150 - Math.min(1.2, ratio * 0.18) * (1 - x.risk) - far - Math.max(0, rP) * 0.5 });
    }
    if (direct && G >= 40 && canStrike(S, X, P) && !atWar(S, X, P)) opts.push({ k: 'strike', u: x.hawk * 0.7 + G / 150 - Math.min(1, ratio * 0.2) - 0.2 });
    if (direct && atWar(S, X, P) && canStrike(S, X, P)) opts.push({ k: 'strike', u: x.hawk * 0.6 + 0.1 });
    if (cyberHit) opts.push({ k: 'cyber', u: x.hawk * 0.5 });
    if (x.nukes > 0 && G >= 60) opts.push({ k: 'nuke_threat', u: x.hawk * 0.35 + (nuke ? 0.5 : 0) - 0.15 });
    if (G >= 20 && ratio > 4 && nearP && !isAlly(S, X, victim || 'none') && !invadedFriend) opts.push({ k: 'appease', u: (1 - x.hawk) * 0.5 + Math.min(0.4, (ratio - 4) * 0.04) - x.risk * 0.2 + fearF });
    if (G >= 25) { const partner = IDS.find(c => c !== X && c !== P && indep(S, c) && rel(S, c, P) < -30 && rel(S, c, X) > 30 && !isAlly(S, c, X) && power(S, c) > power(S, X) * 0.5); if (partner) opts.push({ k: 'ally', u: x.hawk * 0.2 + G / 150 + 0.1, with: partner }); }
    if (d.energy >= 1 && DEF[P].energy <= 0 && G >= 30) opts.push({ k: 'energy', u: G / 100 - dep - 0.1 - Math.max(0, rP) * 0.5 });
    if (S.actors[X].tech - 3 > S.actors[P].tech && G >= 25) opts.push({ k: 'techban', u: G / 100 * x.econ - 0.05 - Math.max(0, rP) * 0.5 });
  }
  const acts = [];
  const chosen = [softPick(S, opts, temp)];
  if ((G >= 30 || invadedMe) && chance(S, invadedMe ? 0.8 : 0.45)) { const rest = opts.filter(o => o.k !== chosen[0].k && o.k !== 'none'); if (rest.length) chosen.push(softPick(S, rest, temp)); }
  for (const c of chosen) {
    let r = null;
    switch (c.k) {
      case 'none': break;
      case 'welcome': r = aiDo(S, X, { type: 'improve', target: P, delta: 4 }, R); break;
      case 'back': r = aiDo(S, X, { type: 'improve', target: P, delta: 3 }, R); if (r) r = `公开声援${NAME(P)}`; break;
      case 'arms_p': r = aiDo(S, X, { type: 'arms_aid', target: P, pct: 0.05 }, R); break;
      case 'offer_trade': r = aiDo(S, X, { type: 'trade', target: P }, R); break;
      case 'condemn': r = aiDo(S, X, { type: G > 45 ? 'expel' : 'condemn', target: P }, R); break;
      case 'sanction': r = aiDo(S, X, { type: 'sanction', target: P, level: G >= 60 || invadedMe ? 3 : G >= 30 ? 2 : 1, kind: DEF[X].fin >= 2 && G >= 60 && chance(S, 0.4) ? 'fin' : 'econ' }, R); break;
      case 'buildup': r = aiDo(S, X, { type: 'buildup', pct: clamp(0.15 + G / 150, 0.15, 1.2) }, R); break;
      case 'mobilize': r = aiDo(S, X, { type: 'mobilize', level: 2 + (x.hawk > 0.5 ? 1 : 0) }, R); break;
      case 'seek_help': { const Y = IDS.filter(c => c !== X && c !== P && indep(S, c) && !atWar(S, c, P) && rel(S, c, X) >= 30 && rel(S, c, P) < 20).sort((a, b) => power(S, b) * (rel(S, b, X) + 50) - power(S, a) * (rel(S, a, X) + 50))[0]; if (Y) { const dd = decide(S, X, Y, { type: 'alliance' }, 0.3); if (dd.ok) { if (!isAlly(S, X, Y)) addTreaty(S, 'alliance', X, Y); r = `与${NAME(Y)}结成同盟`; const yy = S.actors[Y]; if (chance(S, clamp(0.25 + yy.loyal * 0.25 + yy.hawk * 0.2 - Math.min(0.3, (power(S, P) + 1) / (power(S, Y) + 1) * 0.05), 0.05, 0.8))) { const r2 = aiDo(S, Y, { type: 'join_war', enemy: P, offensive: chance(S, S.actors[Y].hawk * 0.5) }, R); if (r2) addReaction(R, { actor: Y, stance: '强烈反对', statement: `${DEF[Y].voice}宣布将与${NAME(X)}并肩作战。`, reason: '应盟友请求参战', actions: [r2], src: 'rule' }); } } else r = `向${NAME(Y)}求援（未获承诺）`; } break; }
      case 'arms': r = aiDo(S, X, { type: 'arms_aid', target: victim, pct: clamp(0.03 + victimSev / 1500, 0.03, 0.2) }, R); break;
      case 'join': r = aiDo(S, X, { type: 'join_war', enemy: P, offensive: chance(S, x.hawk * 0.6) }, R); break;
      case 'strike': r = aiDo(S, X, { type: 'strike', target: P }, R); break;
      case 'cyber': r = aiDo(S, X, { type: 'cyber', target: P }, R); break;
      case 'nuke_threat': r = aiDo(S, X, { type: 'nuke_threat', target: P }, R); break;
      case 'appease': r = (ratio > 6 && x.stab < 50 && chance(S, 0.25)) ? aiDo(S, X, { type: 'offer_vassal', target: P }, R) : aiDo(S, X, { type: 'improve', target: P, delta: 6 }, R); break;
      case 'ally': r = aiDo(S, X, { type: 'alliance', target: c.with }, R); break;
      case 'energy': r = aiDo(S, X, { type: 'sanction', target: P, kind: 'energy' }, R); break;
      case 'techban': r = aiDo(S, X, { type: 'sanction', target: P, kind: 'tech' }, R); break;
    }
    if (r) acts.push(r);
  }
  const k0 = chosen[0].k;
  let stance;
  if (G < 8 && (good > 0 || F > 0)) stance = k0 === 'none' ? (F > 15 ? '支持' : '中立') : good > 0 ? '欢迎' : '支持';
  else if (invadedMe || ['join', 'strike', 'nuke_threat', 'energy'].includes(k0) || (k0 === 'sanction' && G > 30) || G > 70) stance = '强烈反对';
  else if (['condemn', 'techban', 'arms', 'ally', 'cyber', 'sanction'].includes(k0)) stance = '反对';
  else if (k0 === 'appease') stance = '中立';
  else if (k0 === 'buildup') stance = '关切';
  else stance = rP > 0.4 && G < 25 ? '中立' : G > 20 ? '关切' : '中立';
  addReaction(R, { actor: X, stance, statement: statement(S, X, stance), reason: ruleReason(S, X, k0, G, ratio, dep), actions: acts, src: 'rule' });
}
function ruleReason(S, X, k, G, ratio, dep) {
  const x = S.actors[X];
  if (k === 'none') return dep > 0.12 ? '与你经济联系紧密，不愿付出代价' : x.fear[S.player] > S.turn ? '慑于你的实力保持沉默' : '事不关己，观望为主';
  if (k === 'appease') return '实力悬殊，选择顺势而为';
  if (k === 'back' || k === 'arms_p') return '与你立场相近，乐见其成';
  if (k === 'mobilize' || k === 'seek_help') return '国家生存受到威胁';
  if (k === 'join') return '履行同盟义务/维护自身安全';
  if (k === 'sanction') return '以经济手段表达强硬立场';
  if (k === 'buildup') return ratio > 1.5 ? '感受到你的军事威胁' : '加强自身防备';
  if (k === 'strike') return '认为必须以牙还牙';
  if (k === 'arms') return '支持受害方，间接对抗';
  if (k === 'welcome' || k === 'offer_trade') return '看好与你合作的收益';
  if (k === 'ally') return '寻求抱团制衡你';
  return G > 40 ? '利益受到严重损害' : '需要表明立场';
}

/* ---------- 盟约自动触发（未被 LLM 覆盖的国家） ---------- */
function allianceCalls(S, R, handled) {
  for (const ev of (S.turnEvents || [])) {
    if (ev.type !== 'invade' && ev.type !== 'nuke' && ev.type !== 'strike') continue;
    if (ev.called) continue; ev.called = true;
    const att = ev.actor, T = ev.target; if (!att || !T) continue;
    const def = boss(S, T);
    for (const c of IDS) {
      if (c === att || c === def || handled.has(c) || !indep(S, c) || atWar(S, c, att)) continue;
      const bound = isAlly(S, c, def) || S.actors[def].overlord === c;
      if (!bound || (ev.type === 'strike' && !isAlly(S, c, T))) continue;
      const x = S.actors[c];
      const ratio = (power(S, att) + 1) / (power(S, c) + allyHelp(S, c, att) + 1);
      let p = ev.type === 'strike' ? 0.15 + x.hawk * 0.2 : 0.45 + x.loyal * 0.5 - Math.min(0.35, ratio * 0.06) * (1 - x.risk) + (rel(S, c, att) < -40 ? 0.1 : 0);
      if (S.actors[def].overlord === c) p += 0.3;
      if (chance(S, clamp(p, 0.05, 0.97))) {
        const r = aiDo(S, c, { type: 'join_war', enemy: att, offensive: chance(S, x.hawk * 0.5) }, R);
        if (r) { const who = R.reactions.find(z => z.actor === c); if (who) who.actions.push(r); else addReaction(R, { actor: c, stance: '强烈反对', statement: `${DEF[c].voice}宣布：根据${sameBloc(S, c, def) ? '集体防御条款' : '同盟条约'}，对${NAME(def)}的攻击即是对我们的攻击。`, reason: '履行同盟义务', actions: [r], src: 'rule' }); handled.add(c); }
      }
    }
  }
}
function ruleReactions(S, R, skip = new Set()) {
  const cands = reactionCandidates(S, 12);
  for (const c of cands) if (!skip.has(c.id)) { ruleReact(S, c.id, R); skip.add(c.id); }
  allianceCalls(S, R, skip);
}

/* ---------- 应用 LLM 给出的反应 ---------- */
const LLM_TYPES = ['none', 'condemn', 'expel', 'recall', 'sanction', 'lift', 'tariff', 'tech_ban', 'energy_embargo', 'buildup', 'mobilize', 'arms_aid', 'aid', 'improve', 'alliance', 'partner', 'trade', 'cancel_treaty', 'exercise', 'cyber', 'strike', 'join_war', 'invade', 'blockade', 'nuke_threat', 'ceasefire', 'peace', 'demand', 'offer_vassal'];
function applyLLMReactions(S, R, data) {
  const handled = new Set();
  const list = Array.isArray(data && data.reactions) ? data.reactions : [];
  for (const r of list.slice(0, 12)) {
    const X = String(r.actor || '').toUpperCase();
    if (!S.actors[X] || X === S.player || !indep(S, X) || handled.has(X)) continue;
    handled.add(X);
    const acts = [];
    for (const a of (Array.isArray(r.actions) ? r.actions : []).slice(0, 3)) {
      if (!a || !LLM_TYPES.includes(a.type)) continue;
      const act = { ...a, target: a.target ? String(a.target).toUpperCase() : (['join_war'].includes(a.type) ? undefined : S.player), enemy: a.enemy ? String(a.enemy).toUpperCase() : undefined };
      const provoked = (S.turnEvents || []).some(e => e.actor === S.player && e.sev >= 50 && (e.target === X || isAlly(S, X, e.target) || isPartner(S, X, e.target) || rel(S, X, e.target) >= 50)) || atWar(S, X, S.player);
      const hotP = provoked || (S.turnEvents || []).some(e => e.actor === S.player && ['invade', 'strike', 'nuke', 'blockade'].includes(e.type));
      if ((act.type === 'invade' || act.type === 'strike' || act.type === 'blockade') && act.target === S.player && !provoked) continue; // 不允许无端动武
      if (act.type === 'join_war' && act.enemy === S.player && !hotP) continue;
      if (act.type === 'join_war' && !act.enemy) act.enemy = S.player;
      const res = aiDo(S, X, act, R, 'llm'); if (res) acts.push(res);
    }
    addReaction(R, { actor: X, stance: STANCES.includes(r.stance) ? r.stance : '关切', statement: String(r.statement || '').slice(0, 140) || statement(S, X, '关切'), reason: String(r.reason || '').slice(0, 60), actions: acts, src: 'llm' });
  }
  if (Array.isArray(data && data.headlines)) R.headlines = data.headlines.slice(0, 5).map(h => String(h).slice(0, 60));
  if (data && data.worldEvent && data.worldEvent.type) { try { const ev = WORLD_EVENTS.find(w => w.id === data.worldEvent.type); const X = String(data.worldEvent.actor || '').toUpperCase(); if (ev && S.actors[X] && (!ev.cond || ev.cond(S, X))) { const txt = ev.apply(S, X); R.events.push({ text: String(data.worldEvent.text || txt).slice(0, 120), tone: 'info', actors: [X] }); logEvent(S, { type: 'event', text: String(data.worldEvent.text || txt).slice(0, 120), tone: 'info', actors: [X] }); S._llmWorldEvent = true; } } catch (e) { } }
  return handled;
}

/* ---------- 规则 AI：背景行为 ---------- */
function threatTo(S, X) {
  let t = 0, who = null;
  for (const Y of IDS) {
    if (Y === X || !indep(S, Y)) continue; const r = rel(S, X, Y); if (r > -30 && !atWar(S, X, Y)) continue;
    const prox = landAdj(X, Y) ? 1 : dist(X, Y) < 1500 ? 0.7 : minDistFrom(S, Y, X) <= reach(S, Y) ? 0.4 : 0.1;
    const v = (power(S, Y) * prox) / (power(S, X) + allyHelp(S, X, Y) * 0.6 + 1) * (atWar(S, X, Y) ? 1.5 : (-r / 100));
    if (v > t) { t = v; who = Y; }
  }
  return { t: Math.min(t, 3), who };
}
function aiBackground(S, R) {
  const P = S.player;
  const aiWars = S.fronts.filter(f => f.att !== P && boss(S, f.target) !== P).length;
  for (const X of IDS) {
    if (X === P || !indep(S, X)) continue;
    const x = S.actors[X], d = DEF[X];
    // 军费
    const th = threatTo(S, X);
    const base = enemies(S, X).length ? d.milex / d.gdp * 100 : Math.min(d.milex / d.gdp * 100, 6);
    let target = base * (1 + th.t * 0.35) + (enemies(S, X).length ? 1.5 : 0);
    if (x.flags.buildupTo > S.turn) target = Math.max(target, x.milPct);
    x.milPct = clamp(x.milPct + (target - x.milPct) * 0.2, 0.3, 30);
    // 动员
    const homeFront = S.fronts.find(f => f.target === X);
    const wantMob = homeFront ? (homeFront.progress > 40 ? 3 : 2) : enemies(S, X).length ? 1 : (th.t > 1.5 ? 1 : 0);
    if (wantMob > x.mob) x.mob = wantMob; else if (wantMob < x.mob && chance(S, 0.3)) x.mob--;
    // 战争决策
    for (const f of S.fronts.filter(f => f.att === X)) {
      const T = boss(S, f.target);
      if (T === P) continue; // 与玩家的战争由反应阶段处理，这里只做简单调整
      const sl = f.hist.length >= 3 ? f.hist[f.hist.length - 1] - f.hist[f.hist.length - 3] : 5;
      if ((sl < 1 && f.turns > 6 && chance(S, 0.12)) || x.stab < 25) { const d2 = decide(S, X, T, { type: 'ceasefire' }); if (d2.ok) { makePeace(S, X, T, 'ceasefire'); R.ai.push({ text: `${NAME(X)}与${NAME(T)}达成停火。`, actors: [X, T] }); } }
    }
    for (const f of S.fronts.filter(f => f.att === P && boss(S, f.target) === X)) {
      if (f.progress > 65 && chance(S, 0.35) && !S.inbox.some(o => o.from === X)) {
        const terms = f.progress > 85 && chance(S, 0.5) ? 'vassal' : 'white';
        pushOffer(S, mkOffer(S, X, { type: 'peace', terms: terms === 'vassal' ? 'vassal_self' : 'white' }, terms === 'vassal' ? `${NAME(X)}表示愿意接受你的保护国地位以换取停战。` : `${NAME(X)}提议立即停火并恢复战前状态。`));
      }
    }
    for (const f of S.fronts.filter(f => boss(S, f.target) === P && f.att === X)) {
      if (f.progress < -10 && chance(S, 0.3) && !S.inbox.some(o => o.from === X)) pushOffer(S, mkOffer(S, X, { type: 'ceasefire', terms: 'ceasefire' }, `${NAME(X)}的攻势受挫，提议停火。`));
    }
    // 与盟友/伙伴共同支持被侵略者
    for (const f of S.fronts) {
      const V = f.def; if (V === X || f.att === X) continue;
      if ((isPartner(S, X, V) || isAlly(S, X, V) || rel(S, X, V) > 55) && rel(S, X, f.att) < -30 && !atWar(S, X, f.att) && chance(S, x.loyal * 0.35)) {
        const pct = clamp(0.02 + x.loyal * 0.05, 0.02, 0.08);
        const r = aiDo(S, X, { type: 'arms_aid', target: V, pct }, R);
        if (r && (f.att === P || V === P || chance(S, 0.25))) R.ai.push({ text: `${NAME(X)}${r}`, actors: [X, V] });
      }
    }
    // 关系漂移
    // 贸易协定与同盟
    if (chance(S, 0.04)) {
      const cand = IDS.filter(Y => Y !== X && Y !== P && indep(S, Y) && rel(S, X, Y) > 50 && !hasTreaty(S, X, Y, 'trade'));
      if (cand.length) { const Y = pick(S, cand); if (decide(S, X, Y, { type: 'trade' }).ok) { addTreaty(S, 'trade', X, Y); if (chance(S, 0.5)) R.ai.push({ text: `${NAME(X)}与${NAME(Y)}签署自贸协定。`, actors: [X, Y] }); } }
    }
    // 制衡联盟：玩家过强时
    const pShare = power(S, P) / (IDS.reduce((s, id) => s + power(S, id), 0) + 1);
    if (pShare > 0.3 && rel(S, X, P) < -20 && chance(S, 0.06 + (pShare - 0.3))) {
      const Y = IDS.find(Y => Y !== X && Y !== P && indep(S, Y) && rel(S, Y, P) < -20 && rel(S, X, Y) > 20 && !isAlly(S, X, Y));
      if (Y && decide(S, X, Y, { type: 'alliance' }).ok) { addTreaty(S, 'alliance', X, Y); R.ai.push({ text: `为制衡${NAME(P)}，${NAME(X)}与${NAME(Y)}结成军事同盟。`, actors: [X, Y], tone: 'warn' }); }
    }
    // 投机性战争（罕见）
    if (aiWars < 2 && x.hawk > 0.55 && chance(S, 0.004 * x.hawk * (S.diff === 'hard' ? 2 : 1))) {
      const cands = IDS.filter(T => T !== X && T !== P && indep(S, T) && !S.actors[T].overlord && rel(S, X, T) < -55 && route(S, X, T) && estimateRatio(S, X, T, 0.5) > 1.8 && !IDS.some(c => c !== X && indep(S, c) && isAlly(S, c, T) && power(S, c) > power(S, X) * 0.6));
      if (cands.length) { const T = pick(S, cands); aiDo(S, X, { type: 'invade', target: T, commit: 0.5 }, R); R.ai.push({ text: `${NAME(X)}对${NAME(T)}发动军事行动！`, actors: [X, T], tone: 'warn', big: true }); pushEv(S, { type: 'invade', actor: X, target: T, sev: 60, text: `${NAME(X)}进攻${NAME(T)}`, big: true }); }
    }
    // 小概率：敌视玩家且实力悬殊时主动进攻玩家
    if (!atWar(S, X, P) && x.hawk > 0.4 && rel(S, X, P) < -60 && chance(S, 0.003 * x.hawk * (S.diff === 'hard' ? 2 : S.diff === 'easy' ? 0.3 : 1)) && route(S, X, P) && estimateRatio(S, X, P, 0.5) > 2 && !IDS.some(c => c !== X && c !== P && indep(S, c) && isAlly(S, c, P) && power(S, c) > power(S, X) * 0.6)) {
      aiDo(S, X, { type: 'invade', target: P, commit: 0.5 }, R); R.ai.push({ text: `${NAME(X)}对你发动全面进攻！`, actors: [X, P], tone: 'bad', big: true }); pushEv(S, { type: 'invade', actor: X, target: P, sev: 85, text: `${NAME(X)}进攻${NAME(P)}`, big: true });
    }
    // 已处于战争状态但没有战线：视情况开辟战线
    for (const E of enemies(S, X)) {
      if (S.fronts.some(f => f.att === X && boss(S, f.target) === E)) continue;
      const used = S.fronts.filter(f => f.att === X).reduce((s, f) => s + f.commit, 0); if (used > 0.6) continue;
      if (!chance(S, 0.12 + x.hawk * 0.2)) continue;
      const T = aiOffensive(S, X, E, 0.4, 1.25);
      if (T) R.ai.push({ text: `${NAME(X)}对${NAME(T)}${T !== E ? '（' + NAME(E) + '占领区）' : ''}发起攻势。`, actors: [X, T], tone: E === P ? 'bad' : 'warn', big: E === P || T === P });
    }
    // 伊朗核计划等
    if (x.nukeProg > 0 && x.nukes === 0 && x.hawk > 0.6 && chance(S, 0.25)) { x.nukeProg = clamp(x.nukeProg + between(S, 1, 4), 0, 100); if (x.nukeProg >= 100) { x.nukes = 5; R.ai.push({ text: `${NAME(X)}宣布核试验成功！`, actors: [X], tone: 'warn' }); pushEv(S, { type: 'nuketest', actor: X, target: null, sev: 45, text: `${NAME(X)}核试验`, third: 30, big: true }); } }
    // 占领区治理
    for (const T of controlled(S, X)) if (T !== X && S.actors[T].resist > 40 && chance(S, 0.5)) S.actors[T].resist -= between(S, 5, 12);
    // 债务违约
  }
  // 预防性打击：有核门槛国家
  for (const X of IDS) {
    const x = S.actors[X]; if (!indep(S, X) || x.nukes > 0 || x.nukeProg < 75 || X === P) continue;
    for (const Y of ['ISR', 'USA']) if (Y !== P && Y !== X && indep(S, Y) && rel(S, X, Y) < -60 && canStrike(S, Y, X) && chance(S, 0.18 * S.actors[Y].hawk)) { aiDo(S, Y, { type: 'strike', target: X }, R); x.nukeProg = Math.max(20, x.nukeProg - 35); R.ai.push({ text: `${NAME(Y)}空袭${NAME(X)}核设施，其核计划严重受挫。`, actors: [Y, X], tone: 'warn' }); break; }
  }
  // 俄乌等既有战争的停火可能
  for (const f of S.fronts.filter(f => f.att !== P && boss(S, f.target) !== P)) {
    const T = boss(S, f.target); const x = S.actors[f.att], y = S.actors[T];
    const stale = f.hist.length >= 4 && Math.abs(f.hist[f.hist.length - 1] - f.hist[f.hist.length - 4]) < 4;
    const p = 0.025 + (stale ? 0.04 : 0) + (x.stab < 35 ? 0.05 : 0) + (y.stab < 30 ? 0.04 : 0) + (S.actors.USA && rel(S, 'USA', f.att) > 0 ? 0.01 : 0);
    if (chance(S, p) && atWar(S, f.att, T)) { makePeace(S, f.att, T, 'ceasefire'); R.ai.push({ text: `经多方斡旋，${NAME(f.att)}与${NAME(T)}宣布停火。`, actors: [f.att, T], tone: 'info', big: true }); }
  }
  // 核门槛：本土即将沦陷时可能动用核武
  const DOCT = { RUS: 0.55, PRK: 0.75, PAK: 0.6, ISR: 0.6, IND: 0.25, CHN: 0.3, USA: 0.35, GBR: 0.3, FRA: 0.4 };
  for (const X of IDS) {
    const x = S.actors[X]; if (X === P || !indep(S, X) || x.nukes < 5) continue;
    const hf = S.fronts.filter(f => f.target === X).sort((a, b) => b.progress - a.progress)[0];
    if (!hf || hf.progress < 55 || !nukeReach(S, X, hf.att)) continue;
    const pr = (DOCT[X] ?? 0.4) * (hf.progress - 50) / 50 * (0.5 + x.risk);
    if (chance(S, pr)) nuclearStrike(S, X, hf.att, hf.progress > 85 && x.hawk > 0.6 ? 'strategic' : 'tactical', R);
  }
  // 附庸跟随宗主国参战
  for (const X of IDS) { const x = S.actors[X]; if (!indep(S, X) || !x.overlord) continue; for (const e of enemies(S, x.overlord)) if (!atWar(S, X, e) && chance(S, 0.5)) { declareWar(S, X, e); } }
}

/* ---------- 随机世界事件 ---------- */
const WORLD_EVENTS = [
  { id: 'election', w: 3, cond: (S, X) => DEF[X].gov === 'dem', apply(S, X) { const x = S.actors[X]; const hard = chance(S, 0.5); x.hawk = clamp(x.hawk + (hard ? 0.15 : -0.15), 0.05, 0.95); x.stab = clamp(x.stab + between(S, -3, 5), 0, 100); const P = S.player; if (X !== P) addRel(S, X, P, (hard === (rel(S, X, P) < 0) ? -1 : 1) * between(S, 4, 10)); return `${NAME(X)}举行大选，新政府对外政策${hard ? '趋于强硬' : '趋于温和'}。`; } },
  { id: 'recession', w: 2, apply(S, X) { const x = S.actors[X]; x.gdp *= 1 - between(S, 0.02, 0.04); x.stab = clamp(x.stab - 6, 0, 100); return `${NAME(X)}陷入经济衰退，失业率攀升。`; } },
  { id: 'boom', w: 2, apply(S, X) { S.actors[X].mods.push({ g: 0.4, turns: 4, src: 'boom' }); return `${NAME(X)}经济出现强劲复苏。`; } },
  { id: 'disaster', w: 1.8, apply(S, X) { const x = S.actors[X]; x.gdp *= 0.99; x.stab = clamp(x.stab - 3, 0, 100); return `${NAME(X)}遭遇严重自然灾害。`; } },
  { id: 'protests', w: 1.8, cond: (S, X) => S.actors[X].stab < 60, apply(S, X) { S.actors[X].stab = clamp(S.actors[X].stab - 8, 0, 100); return `${NAME(X)}爆发大规模抗议活动。`; } },
  { id: 'coup', w: 0.8, cond: (S, X) => S.actors[X].stab < 32 && DEF[X].gov !== 'dem', apply(S, X) { const x = S.actors[X]; x.hawk = between(S, 0.2, 0.9); x.stab = 40; const P = S.player; if (X !== P) setRel(S, X, P, rel(S, X, P) * 0.4 + between(S, -25, 25)); x.overlord = null; return `${NAME(X)}发生军事政变，新政权上台，外交走向难以预测。`; } },
  { id: 'energy_shock', w: 0.8, apply(S, X) { for (const Y of IDS) S.actors[Y].mods.push({ g: DEF[Y].energy >= 1 ? 0.35 : -0.2, turns: 3, src: 'energy' }); return '国际油气价格暴涨，能源进口国承压，出口国获益。'; } },
  { id: 'tech', w: 1.5, cond: (S, X) => S.actors[X].tech > 70, apply(S, X) { S.actors[X].tech = clamp(S.actors[X].tech + 2.5, 0, 100); return `${NAME(X)}在人工智能与半导体领域取得重大突破。`; } },
  { id: 'terror', w: 1.2, apply(S, X) { const x = S.actors[X]; x.stab = clamp(x.stab - 4, 0, 100); x.hawk = clamp(x.hawk + 0.08, 0, 1); return `${NAME(X)}发生严重恐怖袭击。`; } },
  { id: 'clash', w: 1.3, apply(S, X) { const fp = FLASHPOINTS.filter(p => p.includes(X) && indep(S, p[0]) && indep(S, p[1])); const pr = fp.length ? pick(S, fp) : pick(S, FLASHPOINTS); if (!indep(S, pr[0]) || !indep(S, pr[1])) return `${NAME(X)}边境局势紧张。`; addRel(S, pr[0], pr[1], -8); S.actors[pr[0]].land *= 0.995; S.actors[pr[1]].land *= 0.995; S.tension = clamp(S.tension + 3, 0, 100); return `${NAME(pr[0])}与${NAME(pr[1])}发生边境/海上摩擦。`; } },
  { id: 'pandemic', w: 0.25, apply(S) { S.globalMod.push({ g: -0.35, turns: 3 }); for (const Y of IDS) S.actors[Y].stab = clamp(S.actors[Y].stab - 3, 0, 100); return '一种新型传染病在全球蔓延，世界经济受到冲击。'; } },
];
function randomEvents(S, R) {
  const n = chance(S, 0.6) ? (chance(S, 0.25) ? 2 : 1) : 0;
  for (let i = 0; i < n; i++) {
    if (S._llmWorldEvent && i === 0) continue;
    const X = pick(S, IDS.filter(id => indep(S, id)));
    const cand = WORLD_EVENTS.filter(e => !e.cond || e.cond(S, X));
    const tot = cand.reduce((s, e) => s + e.w, 0); let r = rnd(S) * tot; let ev = cand[0];
    for (const e of cand) { r -= e.w; if (r <= 0) { ev = e; break; } }
    const txt = ev.apply(S, X);
    R.events.push({ text: txt, tone: 'info', actors: [X] }); logEvent(S, { type: 'event', text: txt, tone: 'info', actors: [X] });
  }
  S._llmWorldEvent = false;
}

/* ---------- 经济 / 军力 / 稳定更新 ---------- */
function sanctionHit(S, s) { // 返回 [对目标, 对发起者] 的季度增长损失（百分点）
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
function growthPenalty(S, X) { // 相对初始局面的增长拖累（季度百分点）
  const x = S.actors[X]; let p = 0;
  for (const s of S.sanctions) { if (s.to === X) p += sanctionHit(S, s)[0]; if (s.from === X) p += sanctionHit(S, s)[1]; }
  for (const t of S.treaties) if (t.type === 'trade' && !t.econ && (t.a === X || t.b === X)) p -= 0.36 * exposure(S, X, t.a === X ? t.b : t.a);
  for (const f of S.fronts) { if (f.target === X) p += 1.0 + Math.max(0, f.progress) / 100 * 2; if (f.att === X) p += 0.12 + 0.45 * f.commit; }
  if (enemies(S, X).length) p += 0.08;
  for (const b of S.blockades) if (b.target === X) p += ISLAND.has(X) ? 3.5 : 2.0;
  if (x.milPct > 3) p += (x.milPct - 3) * 0.06;
  p += [0, 0.1, 0.35, 0.8][x.mob];
  if (x.treasury < -x.gdp * 0.06) p += 0.25;
  if (x.ctrl !== X) p += x.resist / 100 * 0.8;
  return p;
}
function stabPressure(S, X) { // 相对初始局面的稳定压力
  const x = S.actors[X], d = DEF[X], gw = GOVW[d.gov]; let p = 0;
  for (const f of S.fronts) {
    if (f.att === X) p += (0.5 + f.commit * 1.5) * gw * (f.last < 0 ? 1.4 : 1);
    if (f.target === X) p += f.turns <= 2 ? -1.5 : (1 + Math.max(0, f.progress) / 50) * gw;
  }
  p += Math.min(1.2, 0.12 * S.sanctions.filter(s => s.to === X && s.level >= 2).length);
  for (const T of controlled(S, X)) if (T !== X && !S.actors[T].integrated) p += S.actors[T].resist / 100 * 1.1 * (d.gov === 'dem' ? 1.3 : 0.8);
  if (x.treasury < -x.gdp * 0.06) p += 1.2;
  p += [0, 0.3, 1, 2][x.mob] * gw;
  return p;
}
function fiscalBase(S, X) { let b = S.actors[X].gdp; for (const T of controlled(S, X)) if (T !== X) b += S.actors[T].gdp * (S.actors[T].integrated ? 0.9 : 0.4); return b; }
function economy(S, R) {
  const P = S.player;
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
    x.gdp = Math.max(1, x.gdp * (1 + g / 100)); x.lastG = g; growth[X] = g;
    x.mods = x.mods.filter(m => --m.turns > 0);
  }
  S.globalMod = S.globalMod.filter(m => --m.turns > 0);
  // 封锁维持检查
  S.blockades = S.blockades.filter(b => { const ok = indep(S, b.by) && indep(S, b.target) && navyEff(S, b.by) > 1.1 * (navyEff(S, b.target) + 1); if (!ok) R.war.push({ text: `${NAME(b.by)}对${NAME(b.target)}的海上封锁被打破。`, tone: 'info', actors: [b.by, b.target] }); return ok; });
  // 财政、军力、科技、稳定
  for (const X of IDS) {
    const x = S.actors[X], d = DEF[X];
    if (!indep(S, X)) { x.land *= 0.9; x.air *= 0.9; x.navy *= 0.9; x.stab = clamp(x.stab + (35 - x.stab) * 0.1, 0, 100); continue; }
    const fb = fiscalBase(S, X);
    let income = fb * 0.005 * (d.gov === 'aut' ? 1.1 : 1) * (x.stab < 30 ? 0.8 : 1);
    let spend = 0;
    for (const f of S.fronts) { if (f.att === X) spend += f.commit * (x.land + x.air) * 0.012; if (f.def === X) spend += (x.land + x.air) * 0.002; }
    spend += x.gdp * [0, 0.0005, 0.0015, 0.003][x.mob];
    if (x.treasury < 0) spend += -x.treasury * 0.012;
    if (x.overlord && indep(S, x.overlord)) { const trib = income * 0.15; income -= trib; S.actors[x.overlord].treasury += trib; }
    for (const s of S.sanctions) if (s.kind === 'tariff' && s.from === X) income += exposure(S, X, s.to) * x.gdp * 0.0004;
    x.treasury += income - spend;
    // 军力
    const budget = fb * x.milPct / 100 / 4;
    const inflow = budget * d.ppp * [1, 1.1, 1.25, 1.45][x.mob];
    const decay = 1 / 16;
    x.land += inflow * x.mix[0] - x.land * decay; x.navy += inflow * x.mix[1] - x.navy * decay; x.air += inflow * x.mix[2] - x.air * decay;
    x.land = Math.max(0, x.land); x.navy = Math.max(0, x.navy); x.air = Math.max(0, x.air);
    // 科技
    let ban = 0;
    for (const s of S.sanctions) if (s.to === X && s.kind === 'tech' && S.actors[s.from].tech > x.tech) ban += 0.25 * Math.min(1, S.actors[s.from].gdp / 5000);
    const tg = (0.1 + Math.max(0, 75 - x.tech) * 0.006) * (1 - Math.min(0.75, ban));
    x.tech = clamp(x.tech + tg, 0, 100);
    // 稳定：向“当前局面下的目标值”回归
    let sd = ((x.p0 || 0) - stabPressure(S, X)) * 6; if (sd > 0) sd = Math.min(12, sd * 0.5);
    const target = d.stab + sd;
    const ds = (target - x.stab) * 0.12 + clamp((growth[X] - d.growth / 4) * 1.5, -3, 3);
    x.stab = clamp(x.stab + ds, 0, 100);
  }
  // 贷款偿还
  S.loans = S.loans.filter(l => { if (!indep(S, l.to) || !indep(S, l.from)) return false; const deb = S.actors[l.to]; if (deb.stab < 28 && chance(S, 0.1)) { deb.flags.debtTo = l.from; addInfl(S, l.from, l.to, 10); R.ai.push({ text: `${NAME(l.to)}无力偿还${NAME(l.from)}的贷款，宣布债务重组。`, actors: [l.to, l.from] }); return false; } deb.treasury -= l.pay; S.actors[l.from].treasury += l.pay; return --l.left > 0; });
  // 占领区抵抗
  for (const T of IDS) {
    const t = S.actors[T]; if (t.ctrl === T || t.integrated) continue;
    const occ = t.ctrl; const need = DEF[T].pop * 2.5 + 10;
    const garrison = Math.min(1.5, landEff(S, occ) * 0.15 / need);
    let dr = 2.5 - garrison * 3 + rn(S) * 1.5 - infl(S, occ, T) / 50;
    if (enemies(S, occ).some(e => rel(S, e, T) > 30)) dr += 1.2;
    t.resist = clamp(t.resist + dr, 0, 100);
    if (t.resist >= 90 && chance(S, 0.22)) {
      t.ctrl = T; t.resist = 0; t.stab = 35; const st = DEF[T].milex * DEF[T].ppp * 4 * 0.2; t.land = st * t.mix[0]; t.air = st * t.mix[2]; t.navy = st * t.mix[1];
      declareWar(S, T, occ); setRel(S, T, occ, -80); resetExposure(S);
      const txt = `${NAME(T)}爆发大规模起义，推翻了${NAME(occ)}的占领！`;
      R.war.push({ text: txt, tone: occ === S.player ? 'bad' : 'info', actors: [T, occ], big: true }); logEvent(S, { type: 'uprising', text: txt, tone: 'warn', actors: [T, occ] });
    }
  }
  // 附庸：关系维持
  for (const X of IDS) { const x = S.actors[X]; if (x.overlord) { if (!indep(S, x.overlord)) x.overlord = null; else { addInfl(S, x.overlord, X, 0.8); if (rel(S, X, x.overlord) < 30) addRel(S, X, x.overlord, 3); } } }
  // 关系回归与影响力衰减
  for (const k in S.rel) { const [a, b] = k.split('|'); if (atWar(S, a, b)) { S.rel[k] = Math.min(S.rel[k], -60); continue; } const base = S.rel0[k] ?? 0; S.rel[k] += (base - S.rel[k]) * 0.025; }
  for (const k in S.infl) { S.infl[k] *= 0.985; if (S.infl[k] < 0.5) delete S.infl[k]; }
  S.tension = clamp(S.tension + (30 - S.tension) * 0.08 + S.fronts.length * 0.8, 0, 100);
  resetExposure(S);
}

/* ---------- 霸权与胜负 ---------- */
function hegemony(S) {
  const P = S.player; const W = worldGDP(S);
  const mine = realm(S, P).reduce((s, id) => s + S.actors[id].gdp, 0);
  const worldMil = IDS.reduce((s, id) => s + power(S, id), 0) || 1;
  const milMine = power(S, P) + realm(S, P).filter(v => v !== P).reduce((s, v) => s + power(S, v) * 0.5, 0);
  const gdpShare = mine / W, milShare = milMine / worldMil;
  const units = realm(S, P).length;
  return { gdpShare, milShare, units, prog: Math.min(gdpShare / 0.5, milShare / 0.45, 1), unify: units / IDS.length };
}
function checkEnd(S) {
  if (S.over) return;
  const P = S.player, x = S.actors[P];
  if (x.ctrl !== P) { S.over = { result: 'lose', reason: `${NAME(x.ctrl)}占领了你的本土，政府流亡。` }; return; }
  if (x.overlord) { S.over = { result: 'lose', reason: `你已沦为${NAME(x.overlord)}的附庸，失去了独立地位。` }; return; }
  if (x.stab < 3) { S.lowStab = (S.lowStab || 0) + 1; if (S.lowStab >= 3) { S.over = { result: 'lose', reason: '国内秩序全面崩溃，政权倒台。' }; return; } } else S.lowStab = 0;
  const h = hegemony(S);
  if (S.goal === 'unify') { if (h.units >= IDS.length) S.over = { result: 'win', reason: '全世界所有国家与地区都已纳入你的统治或保护之下——世界统一。' }; }
  else { if (h.gdpShare >= 0.5 && h.milShare >= 0.45) { S.heg++; if (S.heg >= 4) S.over = { result: 'win', reason: `你的集团掌握了全球${Math.round(h.gdpShare * 100)}%的经济与${Math.round(h.milShare * 100)}%的军事力量，并持续一年——全球霸权确立。` }; } else S.heg = 0; }
}

/* ---------- 回合收尾 ---------- */
function finishTurn(S) {
  const R = S._R || newReport(S);
  aiBackground(S, R);
  allianceCalls(S, R, new Set([S.player]));
  resolveFronts(S, R);
  // AI 攻击玩家的新战线由 aiDo 已创建；玩家的反攻可能性由玩家自行决定
  economy(S, R);
  randomEvents(S, R);
  // 过期或失效来函
  S.inbox = S.inbox.filter(o => o.expires >= S.turn + 1 && indep(S, o.from) && !(['peace', 'ceasefire'].includes(o.deal.type) && !atWar(S, o.from, S.player)));
  const P = S.player, x = S.actors[P];
  R.econ = { gdp: [S.pre.gdp, x.gdp], stab: [S.pre.stab, x.stab], mil: [S.pre.mil, power(S, P)], treasury: [S.pre.treasury, x.treasury], tech: [S.pre.tech, x.tech], growth: x.lastG };
  R.fronts = S.fronts.filter(f => f.att === P || boss(S, f.target) === P || f.coA?.includes(P) || f.coD?.includes(P)).map(f => ({ ...f, hist: f.hist.slice() }));
  R.inbox = S.inbox.filter(o => o.turn === S.turn).map(o => o.id);
  for (const r of R.reactions) logEvent(S, { type: 'reaction', text: `${NAME(r.actor)}：${r.statement}`, tone: ['强烈反对', '反对'].includes(r.stance) ? 'bad' : ['支持', '欢迎'].includes(r.stance) ? 'good' : 'info', actors: [r.actor, P] });
  for (const a of R.ai) logEvent(S, { type: 'ai', text: a.text, tone: a.tone || 'info', actors: a.actors || [] });
  checkEnd(S);
  S.turn++; S.q++; if (S.q > 4) { S.q = 1; S.year++; }
  S.apUsed = 0;
  snapshotHistory(S);
  delete R.act; S.report = R; S._R = null; S.lastEvents = (S.turnEvents || []).map(e => ({ type: e.type, actor: e.actor, target: e.target, text: e.text, sev: e.sev }));
  S.turnEvents = [];
  return R;
}
function snapshotHistory(S) {
  const P = S.player, x = S.actors[P], h = hegemony(S);
  S.history.push({ t: S.turn, d: dateStr(S), gdp: Math.round(x.gdp), mil: Math.round(power(S, P)), stab: Math.round(x.stab), heg: +(h.prog * 100).toFixed(1), gs: +(h.gdpShare * 100).toFixed(1), ms: +(h.milShare * 100).toFixed(1) });
  if (S.history.length > 200) S.history.shift();
}

/* ---------- 来函（AI 提议）处理 ---------- */
function answerOffer(S, id, accept) {
  const o = S.inbox.find(x => x.id === id); if (!o) return null;
  S.inbox = S.inbox.filter(x => x !== o);
  const P = S.player, X = o.from, d = o.deal; let msg = '';
  if (!indep(S, X)) return `${NAME(X)}已不复存在。`;
  if (!accept) {
    addRel(S, P, X, d.type === 'demand' ? -6 : -3);
    if (d.type === 'demand' && S.actors[X].hawk > 0.5 && chance(S, 0.5)) { aiDo(S, X, { type: 'sanction', target: P, level: 1 }, { reactions: [] }); msg = `你拒绝了${NAME(X)}的要求，对方宣布对你实施制裁。`; }
    else msg = `你拒绝了${NAME(X)}的提议。`;
    logEvent(S, { type: 'offer', text: msg, tone: 'info', actors: [X, P] }); return msg;
  }
  switch (d.type) {
    case 'alliance': addTreaty(S, 'alliance', P, X); addRel(S, P, X, 10); msg = `你与${NAME(X)}结成军事同盟。`; break;
    case 'trade': addTreaty(S, 'trade', P, X); addRel(S, P, X, 5); msg = `你与${NAME(X)}签署自贸协定。`; break;
    case 'ceasefire': makePeace(S, P, X, 'ceasefire'); msg = `你接受了与${NAME(X)}停火。`; break;
    case 'peace': if (d.terms === 'vassal_self') { makePeace(S, P, X, 'white', true); makeVassal(S, X, P); msg = `${NAME(X)}停战并成为你的附庸。`; } else { makePeace(S, P, X, 'white'); msg = `你与${NAME(X)}签署和平协议。`; } break;
    case 'protectorate': makeVassal(S, X, P); msg = `${NAME(X)}成为你的保护国。`; break;
    case 'demand': if (d.demand === 'lift') removeSanctions(S, P, X); else if (d.demand === 'withdraw') { S.fronts = S.fronts.filter(f => !(f.att === P && (boss(S, f.target) === X || isAlly(S, X, boss(S, f.target))))); } else if (d.demand === 'pay') { const p = S.actors[P].gdp * 0.005; S.actors[P].treasury -= p; S.actors[X].treasury += p; } else if (d.demand === 'break_alliance') { S.treaties = S.treaties.filter(t => !(t.type === 'alliance' && (t.a === P || t.b === P) && rel(S, X, t.a === P ? t.b : t.a) < -30)); } else if (d.demand === 'stop_nuke') S.actors[P].nukeProg = Math.max(0, S.actors[P].nukeProg - 20);
      addRel(S, P, X, 10); msg = `你接受了${NAME(X)}的要求。`; break;
    default: msg = '已处理。';
  }
  logEvent(S, { type: 'offer', text: msg, tone: 'good', actors: [X, P] });
  return msg;
}

/* ---------- 外交谈判：条款可行性与执行 ---------- */
const DEAL_TYPES = { trade: '自贸协定', alliance: '军事同盟', nap: '互不侵犯', access: '驻军/通行权', partner: '安全伙伴', ceasefire: '停火', peace: '和平协议', vassal: '对方成为你的附庸', lift_sanctions: '对方解除对你的制裁', lift_my_sanctions: '你解除对对方的制裁', aid: '你向对方提供援助', tribute: '对方每季向你进贡', join_war: '对方加入你的战争', break_alliance: '对方终止与第三国的同盟', tech_share: '技术合作', arms: '你向对方提供军援' };
function dealCheck(S, X, term) {
  const P = S.player; const x = S.actors[X];
  switch (term.type) {
    case 'vassal': { const e = (blocPower(S, P) + 1) / (blocPower(S, X) + allyHelp(S, X, P) + 1); const losing = S.fronts.some(f => f.att === P && boss(S, f.target) === X && f.progress > 60); if (e < 2.5 && !losing && x.stab > 25) return '实力差距不足以让对方接受附庸地位'; if (x.nukes > 50 && !losing) return '核大国不会接受附庸地位'; return null; }
    case 'tribute': return (blocPower(S, P) + 1) / (blocPower(S, X) + 1) < 2 ? '实力不足以索取贡金' : null;
    case 'ceasefire': case 'peace': return atWar(S, P, X) ? null : '双方并未交战';
    case 'join_war': { const en = String(term.enemy || '').toUpperCase(); if (!S.actors[en] || !atWar(S, P, en)) return '你并未与该国交战'; return null; }
    case 'alliance': return atWar(S, P, X) ? '交战中' : null;
    case 'aid': case 'arms': return null;
  }
  return null;
}
function applyDeal(S, X, terms) {
  const P = S.player; const done = [];
  for (const t of terms) {
    const bad = dealCheck(S, X, t); if (bad) { done.push(`（${DEAL_TYPES[t.type] || t.type}未生效：${bad}）`); continue; }
    switch (t.type) {
      case 'trade': case 'alliance': case 'nap': case 'access': case 'partner': addTreaty(S, t.type, P, X); done.push(`建立${TREATY_NAME[t.type]}`); break;
      case 'ceasefire': makePeace(S, P, X, 'ceasefire'); done.push('停火'); break;
      case 'peace': makePeace(S, P, X, 'white'); done.push('签署和约'); break;
      case 'vassal': makePeace(S, P, X, 'white', true); makeVassal(S, X, P); done.push(`${NAME(X)}成为你的附庸`); break;
      case 'lift_sanctions': removeSanctions(S, X, P); done.push('对方解除制裁'); break;
      case 'lift_my_sanctions': removeSanctions(S, P, X); done.push('你解除制裁'); break;
      case 'aid': { const amt = clamp(+t.amount || S.actors[P].gdp * 0.002, 0, S.actors[P].gdp * 0.02); S.actors[P].treasury -= amt; S.actors[X].treasury += amt; addInfl(S, P, X, clamp(amt / S.actors[X].gdp * 300, 1, 15)); done.push(`你提供${fmtB(amt)}美元援助`); break; }
      case 'arms': { const amt = clamp(+t.amount || S.actors[P].gdp * 0.002, 0, S.actors[P].gdp * 0.02); S.actors[P].treasury -= amt; const y = S.actors[X], pts = amt * DEF[X].ppp * 0.9; y.land += pts * y.mix[0]; y.air += pts * y.mix[2]; y.navy += pts * y.mix[1]; done.push(`你提供${fmtB(amt)}美元军援`); break; }
      case 'tribute': { const amt = clamp(+t.amount || S.actors[X].gdp * 0.002, 0, S.actors[X].gdp * 0.01); S.actors[X].treasury -= amt * 4; S.actors[P].treasury += amt * 4; done.push(`对方一次性支付一年贡金 ${fmtB(amt * 4)}美元`); break; }
      case 'join_war': { const en = String(t.enemy).toUpperCase(); if (S.actors[en]) { declareWar(S, X, en); done.push(`${NAME(X)}对${NAME(en)}宣战`); } break; }
      case 'break_alliance': { const w = String(t.with || '').toUpperCase(); if (S.actors[w]) { removeTreaty(S, 'alliance', X, w); removeTreaty(S, 'partner', X, w); done.push(`${NAME(X)}终止与${NAME(w)}的同盟`); } break; }
      case 'tech_share': S.actors[P].tech = clamp(S.actors[P].tech + 0.8, 0, 100); S.actors[X].tech = clamp(S.actors[X].tech + 0.8, 0, 100); done.push('开展技术合作'); break;
    }
  }
  addRel(S, P, X, 6);
  logEvent(S, { type: 'deal', text: `与${NAME(X)}达成协议：${done.join('；')}`, tone: 'good', actors: [P, X] });
  return done;
}

/* ---------- 统计视图 ---------- */
function stats(S, id) {
  const x = S.actors[id], d = DEF[id];
  return {
    id, name: d.name, gdp: x.gdp, pop: d.pop, growth: x.lastG * 4, power: power(S, id), land: landEff(S, id), navy: navyEff(S, id), air: airEff(S, id),
    nukes: x.nukes, tech: x.tech, stab: x.stab, milPct: x.milPct, mob: x.mob, treasury: x.treasury, ctrl: x.ctrl, overlord: x.overlord, resist: x.resist, integrated: x.integrated,
    reach: reach(S, id), gov: d.gov,
  };
}
function rankings(S) { return IDS.filter(id => indep(S, id)).map(id => ({ id, gdp: S.actors[id].gdp, power: power(S, id), nukes: S.actors[id].nukes, stab: S.actors[id].stab })); }

return {
  DEF, IDS, NAME, ACTIONS, ACT, TREATY_NAME, DEAL_TYPES, STANCES, LLM_TYPES, ECON_NAMES,
  newGame, rel, infl, indep, boss, realm, controlled, atWar, enemies, hasTreaty, treatiesOf, isAlly, isPartner, sameBloc, blocMates, econBlocs,
  power, landEff, navyEff, airEff, reach, route, canStrike, exposure, powerRatio, evalDeal, dealCheck, applyDeal, answerOffer,
  actionStatus, queueAction, queueCustom, apLeft, apMax, moneyQueued, prepareTurn, reactionCandidates, ruleReactions, applyLLMReactions, finishTurn,
  hegemony, stats, rankings, fmtB, fmtN, dateStr, normalizeEffect, dist, landAdj, sanctionLevel, worldGDP, minDistFrom, chanceText, estimateRatio, threatTo, clamp, rk,
};
})();
if (typeof module !== 'undefined') module.exports = WG;
