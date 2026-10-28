/* ===================== 自然语言指令的实时数据修订（联机版） =====================
 * Claude 把一条自然语言命令换算成对各国数据的具体修订（patch）：发令国自身的投入与收益，以及对其他国家的连锁影响。
 * 引擎逐项校验——字段白名单与幅度上限；内政设定（军费、动员、产能、核计划）只有发令国能改自己的；
 * 免费午餐检测（发令国的收益明显超过代价时按比例缩减）；行动点消耗——确认后立即写入游戏状态，
 * 联机时由房主执行并同步给所有玩家；其他国家的智能体在回合结算时据此作出反应。 */
const PF = {
  gdp: { u: 'pct', self: [-8, 3], other: [-6, 2] },
  treasury: { u: 'gdp', self: [-0.1, 0.05], other: [-0.05, 0.05] },
  stab: { u: 'abs', self: [-12, 8], other: [-10, 6] },
  tech: { u: 'abs', self: [-2, 2], other: [-1.5, 1.5] },
  milPct: { u: 'set', selfOnly: true },
  mob: { u: 'set', selfOnly: true },
  land: { u: 'pct', self: [-15, 10], other: [-12, 8] },
  navy: { u: 'pct', self: [-15, 10], other: [-12, 8] },
  air: { u: 'pct', self: [-15, 10], other: [-12, 8] },
  pers: { u: 'pop', self: [-0.01, 0.01], other: [-0.006, 0.004] },
  resist: { u: 'abs', self: [-20, 20], other: [-20, 20], occ: true },
  oil: { u: 'need', self: [-0.5, 0.5], other: [-0.4, 0.3] },
  cu: { u: 'abs', self: [-0.1, 0.15], selfOnly: true },
  nukeProg: { u: 'abs', self: [0, 8], selfOnly: true },
  intel: { u: 'abs', self: [-5, 5], other: [-5, 3] },
  hawk: { u: 'abs', other: [-0.1, 0.1], aiOnly: true }, risk: { u: 'abs', other: [-0.1, 0.1], aiOnly: true }, loyal: { u: 'abs', other: [-0.1, 0.1], aiOnly: true },
  weary: { u: 'abs', self: [-10, 10], other: [-8, 8] },
  infl: { u: 'abs', self: [-8, 10], other: [-5, 8] },
  rel: { u: 'pair', self: [-25, 20], other: [-10, 10] },
  influence: { u: 'infl', self: [-10, 15] },
  tension: { u: 'pair', self: [-20, 20], other: [-15, 15] },
};
const PATCH_FIELDS = Object.keys(PF);
function pfGet(S, c, f, w) {
  const x = S.actors[c];
  switch (f) {
    case 'rel': return rel(S, c, w);
    case 'influence': return infl(S, w, c);
    case 'tension': return S.tension2[rk(c, w)] || 0;
    case 'weary': return x.we ? x.we.weary : 0;
    case 'infl': return x.we ? x.we.infl : 0;
    case 'intel': return intelOf(S, c);
    case 'oil': return x.oil ?? 0;
    case 'cu': return x.cu ?? 1;
    case 'pers': return x.pers || 0;
  }
  return x[f];
}
/* 把一项修订换算到可比较的“价值单位”（正 = 对该国有利） */
function pfValue(S, c, f, d) {
  const x = S.actors[c], g = x.gdp;
  switch (f) {
    case 'treasury': return d / (g * 0.01);
    case 'gdp': return d / 0.5;
    case 'stab': return d / 3;
    case 'tech': return d / 0.5;
    case 'land': case 'navy': case 'air': return d / 3;
    case 'pers': return d / (DEF[c].pop * 1000 * 0.003);
    case 'cu': return d / 0.03;
    case 'oil': return DEF[c].oilNeed ? d / (DEF[c].oilNeed * 0.1) : 0;
    case 'weary': return -d / 5;
    case 'infl': return -d / 3;
    case 'intel': return d / 2;
    case 'nukeProg': return d / 3;
  }
  return 0;
}
const PSTANCE = { welcomes: 'we', welcome: 'we', supports: 'su', support: 'su', neutral: 'ne', concerned: 'co', opposes: 'op', oppose: 'op', 'strongly opposes': 'sh', 'strongly oppose': 'sh' };
function normalizePatch(S, P, raw) {
  const o = raw && typeof raw === 'object' ? raw : {}, warn = [];
  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const pt = { ok: true, summary: ltxt(o.summary, 120), narrative: String(o.narrative || '').slice(0, 600), text: String(o.text || '').slice(0, 300), ap: RULES3 ? apAI(S, o) : clamp(num(o.ap, 1) | 0, 1, 3), changes: [], effects: [], settings: [], we: [], agents: [], warn };
  if (o.feasible === false) { pt.ok = false; pt.reason = String(o.reason || '').slice(0, 300); pt.alternative = String(o.alternative || '').slice(0, 300); return pt; }
  const seen = new Set();
  for (const ch of (Array.isArray(o.changes) ? o.changes : []).slice(0, 30)) {
    if (!ch || typeof ch !== 'object') continue;
    const c = String(ch.c || ch.country || '').toUpperCase(), f = String(ch.f || ch.field || ''), w = ch.w ? String(ch.w).toUpperCase() : null, spec = PF[f];
    if (!S.actors[c] || !spec) continue;
    if (NEU(S, c) || NEU(S, w)) { warn.push(neuWhy(S, NEU(S, c) ? c : w)); continue; } // 中立地区与永久领土的数据不能改
    const self = c === P || (spec.u === 'pair' && w === P) || (spec.u === 'infl' && w === P);
    if (spec.u === 'pair' || spec.u === 'infl') { if (!w || !S.actors[w] || w === c) continue; }
    if (spec.selfOnly && c !== P) { warn.push(M('pt.w.notself', { t: c, k: M('pf.' + f) })); continue; }
    if (spec.aiOnly && isHuman(S, c)) continue;
    if (spec.occ && (S.actors[c].ctrl === c || S.actors[c].integrated)) continue;
    if (spec.u === 'infl' && w !== P) continue; // 只能改变发令国对他国的影响力
    if (!indep(S, c) && !['resist', 'rel'].includes(f)) continue;
    const key = c + ':' + f + ':' + (w || ''); if (seen.has(key)) continue; seen.add(key);
    const from = pfGet(S, c, f, w), why = String(ch.why || '').slice(0, 140);
    let d = 0, to;
    if (spec.u === 'set') {
      if (f === 'milPct') to = +clamp(num(ch.set ?? ch.to, from), 0.5, Math.max(playerMilMax(), weMilCap(S, c))).toFixed(1);
      else to = clamp(Math.round(num(ch.set ?? ch.to, from)), 0, 3);
      d = to - from; if (Math.abs(d) < 1e-6) continue;
    } else {
      const lim = self ? spec.self : spec.other; if (!lim) continue;
      let v = num(ch.d ?? ch.delta, NaN); if (!Number.isFinite(v)) { const t = num(ch.to ?? ch.set, NaN); if (!Number.isFinite(t)) continue; v = spec.u === 'pct' ? (t / Math.max(1e-9, from) - 1) * 100 : t - from; }
      let lo = lim[0], hi = lim[1];
      if (spec.u === 'gdp') { lo *= S.actors[c].gdp; hi *= S.actors[c].gdp; }
      if (spec.u === 'pop') { lo *= DEF[c].pop * 1000; hi *= DEF[c].pop * 1000; }
      if (spec.u === 'need') { const n = DEF[c].oilNeed || 0; if (!n) continue; lo *= n; hi *= n; }
      if (spec.u === 'pair' && !self) { const l2 = spec.other; lo = l2[0]; hi = l2[1]; }
      const v0 = v; v = clamp(v, lo, hi); if (Math.abs(v - v0) > 1e-9) warn.push(M('pt.w.clamped', { t: c, k: M('pf.' + f) }));
      if (Math.abs(v) < 1e-6) continue;
      d = spec.u === 'pct' || spec.u === 'gdp' || spec.u === 'pop' || spec.u === 'need' ? v : Math.round(v * 100) / 100;
      to = spec.u === 'pct' ? from * (1 + d / 100) : from + d;
    }
    pt.changes.push({ c, f, w, d, from, to, why });
  }
  // 发令国的投入与收益是否相称（防止“一句话凭空变出资源”）
  let B = 0, C = 0;
  for (const ch of pt.changes) if (ch.c === P && PF[ch.f].u !== 'set') { const v = pfValue(S, P, ch.f, ch.d); if (v > 0) B += v; else C -= v; }
  const allow = C * 1.25 + 1.5;
  if (B > allow) { const k = allow / B; for (const ch of pt.changes) if (ch.c === P && PF[ch.f].u !== 'set' && pfValue(S, P, ch.f, ch.d) > 0) { ch.d *= k; ch.to = PF[ch.f].u === 'pct' ? ch.from * (1 + ch.d / 100) : ch.from + ch.d; } warn.push(M('pt.w.scaled', { s: { pct: k } })); pt.scaled = +k.toFixed(2); }
  pt.balance = { gain: +B.toFixed(2), cost: +C.toFixed(2) };
  pt.effects = (Array.isArray(o.effects) ? o.effects : []).filter(e => e && typeof e === 'object' && !SET_TYPES.has(e.type)).slice(0, 6).map(e => normalizeEffect(S, e));
  pt.settings = (Array.isArray(o.settings) ? o.settings : []).filter(e => e && SET_TYPES.has(e.type)).slice(0, 8).map(e => normalizeEffect(S, e));
  pt.we = (Array.isArray(o.we) ? o.we : []).filter(z => z && WE_KEYS.includes(z.k)).slice(0, 7).map(z => ({ k: z.k, lv: clamp(num(z.lv ?? z.level, 0) | 0, 0, 3) }));
  pt.agents = (Array.isArray(o.agents) ? o.agents : []).filter(a => a && S.actors[String(a.c || '').toUpperCase()]).slice(0, 6).map(a => ({ c: String(a.c).toUpperCase(), say: ltxt(a.say, 200), stance: PSTANCE[String(a.stance || '').toLowerCase().trim()] || STANCE_KEY[String(a.stance || '').trim()] || '' }));
  if (!pt.changes.length && !pt.effects.length && !pt.settings.length && !pt.we.length) { pt.ok = false; pt.reason = pt.reason || ''; pt.empty = true; }
  return pt;
}
function applyChange(S, ch) {
  const x = S.actors[ch.c];
  switch (ch.f) {
    case 'rel': addRel(S, ch.c, ch.w, ch.d); return;
    case 'influence': addInfl(S, ch.w, ch.c, ch.d); return;
    case 'tension': { const k = rk(ch.c, ch.w); S.tension2[k] = clamp((S.tension2[k] || 0) + ch.d, 0, 100); return; }
    case 'weary': weInit(x).weary = clamp(x.we.weary + ch.d, 0, 100); return;
    case 'infl': weInit(x).infl = clamp(x.we.infl + ch.d, -2, 400); return;
    case 'intel': x.intel = clamp(intelOf(S, ch.c) + ch.d, 0, 100); return;
    case 'gdp': x.gdp = Math.max(1, x.gdp * (1 + ch.d / 100)); return;
    case 'land': case 'navy': case 'air': x[ch.f] = Math.max(0, x[ch.f] * (1 + ch.d / 100)); return;
    case 'pers': { const per = x.land / Math.max(1, x.pers || 1); x.pers = Math.max(0, (x.pers || 0) + ch.d); if (ch.d > 0) x.land += ch.d * per * 0.2; return; }
    case 'treasury': x.treasury += ch.d; return;
    case 'stab': x.stab = clamp(x.stab + ch.d, 0, 100); return;
    case 'tech': x.tech = clamp(x.tech + ch.d, 0, 100); return;
    case 'resist': x.resist = clamp(x.resist + ch.d, 0, 100); return;
    case 'oil': x.oil = Math.max(0, (x.oil ?? 0) + ch.d); return;
    case 'cu': x.cu = clamp((x.cu ?? 1) + ch.d, 0.02, 1); return;
    case 'nukeProg': x.nukeProg = clamp(x.nukeProg + ch.d, 0, 100); if (x.nukeProg >= 100 && !x.nukes) x.nukes = 5; return;
    case 'milPct': x.milPct = ch.to; return;
    case 'mob': x.mob = ch.to; return;
    case 'hawk': case 'risk': case 'loyal': x[ch.f] = clamp(x[ch.f] + ch.d, 0.02, 0.98); return;
  }
}
/* 在当前席位执行一条修订（发令国 = S.player）。返回 {ok, rec} 或 {ok:false, reason} */
function applyPatch(S, raw) {
  const P = S.player, pt = normalizePatch(S, P, raw);
  if (!pt.ok) return { ok: false, reason: pt.empty ? M('pt.empty') : M('pt.infeasible', { x: { raw: pt.reason || '' } }), pt };
  if (pt.ap > apLeft(S)) return { ok: false, reason: M('c.ap', { n: pt.ap }), pt };
  S.apUsed = (S.apUsed || 0) + pt.ap;
  const R = scratchReport(S), done = [];
  for (const ch of pt.changes) { try { applyChange(S, ch); } catch (e) { if (typeof console !== 'undefined') console.error('patch', ch, e); } }
  done.push(...applySettings(S, pt.settings, R));
  for (const e of pt.effects) {
    try {
      if ((e.type === 'war' || e.type === 'declare') && e.target && S.actors[e.target] && !atWar(S, P, boss(S, e.target)) && DEF[P].gov !== 'aut' && !chance(S, warAuth(S, e.target))) { facAdd(S, { pub: -2 }); done.push(M('r.invade.denied', { t: e.target })); continue; }
      const r = applyEffect(S, e, R); if (r) done.push(r);
    } catch (err) { if (typeof console !== 'undefined') console.error('patch fx', e, err); }
  }
  for (const z of pt.we) { const r = setWe(S, P, z.k, z.lv); if (r) done.push(r); }
  // 对他国的不利修订：作为事件交给各国在回合结算时反应
  const hurt = {};
  for (const ch of pt.changes) if (ch.c !== P && ch.f !== 'rel' && pfValue(S, ch.c, ch.f, ch.d) < 0) hurt[ch.c] = (hurt[ch.c] || 0) - pfValue(S, ch.c, ch.f, ch.d);
  for (const ch of pt.changes) if (ch.f === 'rel' && ch.w === P && ch.d < 0) hurt[ch.c] = (hurt[ch.c] || 0) + (-ch.d) / 10;
  for (const [T, v] of Object.entries(hurt)) { pushEv(S, { type: 'custom', actor: P, target: T, sev: clamp(Math.round(v * 8), 5, 60) }); if (v >= 1.5) remember(S, T, M('mem.custom', { x: lraw(pt.summary, 40) }), -clamp(v * 3, 3, 25)); }
  const rec = { id: 'PT' + S.seq++, turn: S.turn, by: P, text: pt.text, summary: pt.summary, narrative: pt.narrative, changes: pt.changes.map(ch => ({ c: ch.c, f: ch.f, w: ch.w, d: +(+ch.d).toFixed(3), from: +(+ch.from).toFixed(3), to: +(+ch.to).toFixed(3), why: ch.why })), done, agents: pt.agents, scaled: pt.scaled || null, ap: pt.ap };
  S.patches = (S.patches || []).concat([rec]).slice(-40);
  const tg = [...new Set(pt.changes.map(ch => ch.c).filter(c => c !== P))].slice(0, 6);
  logEvent(S, 'patch', M('pt.log', { a: P, x: pt.summary ? lraw(pt.summary, 120) : { raw: pt.text.slice(0, 60) } }), 'warn', [P].concat(tg));
  carryOver(S, R);
  resetExposure(S);
  return { ok: true, rec, pt };
}
/* 给 Claude 的世界数据（英文，紧凑）：主要国家的可修订字段当前值 */
function patchBrief(S, P, extra) {
  const ids = IDS.filter(id => indep(S, id) && (id === P || isGreat(S, id) || S.actors[id].gdp > 150 * (sc().gdpScale || 1) || (extra || []).includes(id) || atWar(S, P, id) || isAlly(S, P, id)));
  const rows = ids.map(id => { const x = S.actors[id]; return `${id} ${DEF[id].en}${isHuman(S, id) && id !== P ? ' [HUMAN PLAYER]' : ''}: gdp ${x.gdp.toFixed(0)}B, treasury ${x.treasury.toFixed(1)}B, stab ${Math.round(x.stab)}, tech ${Math.round(x.tech)}, milPct ${x.milPct.toFixed(1)}%, mob ${x.mob}, land ${x.land.toFixed(0)}, navy ${x.navy.toFixed(0)}, air ${x.air.toFixed(0)}, pers ${Math.round(x.pers || 0)}k${DEF[id].oilNeed ? `, oil ${(x.oil ?? 0).toFixed(1)}Mt (need ${DEF[id].oilNeed}/yr)` : ''}${x.we ? `, inflation ${x.we.infl.toFixed(1)}%, war-weariness ${Math.round(x.we.weary)}, debt ${x.we.debt.toFixed(0)}B` : ''}; rel with ${P} ${Math.round(rel(S, id, P))}${atWar(S, P, id) ? ' (AT WAR)' : ''}`; });
  const occ = IDS.filter(T => S.actors[T].ctrl !== T && indep(S, S.actors[T].ctrl)).map(T => `${T} occupied by ${S.actors[T].ctrl} (resistance ${Math.round(S.actors[T].resist)})`);
  return rows.join('\n') + (occ.length ? '\nOccupied: ' + occ.join('; ') : '');
}
