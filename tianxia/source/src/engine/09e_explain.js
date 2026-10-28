/* ===================== 局势说明用的分解（只读，不改局面，不用随机数） =====================
 * 网页版 v4 每回合的“局势说明”用：把一个国家这个季度的增长、稳定、国库、军力按引擎的公式拆成各项来源。
 * 与 economy()（06_turn.js）里的算式一一对应；这里只计算、不写回，单人版与 v1–v3 不调用，结果完全不变。 */
function growthBreak(S, X) {
  const x = S.actors[X], d = DEF[X]; if (!x || !d) return null;
  const pen = [], P = (k, v, o) => { if (Math.abs(v) > 1e-9) pen.push(Object.assign({ k, v }, o || {})); };
  for (const s of S.sanctions) { if (s.to === X) P('sanc_in', sanctionHit(S, s)[0], { by: s.from, kind: s.kind }); if (s.from === X) P('sanc_out', sanctionHit(S, s)[1], { on: s.to, kind: s.kind }); }
  for (const t of S.treaties) if (t.type === 'trade' && !t.econ && (t.a === X || t.b === X)) { const o = t.a === X ? t.b : t.a; P('trade', -0.36 * exposure(S, X, o), { with: o }); }
  for (const f of S.fronts) { if (f.target === X) P('front_def', 1.0 + Math.max(0, f.progress) / 100 * 2, { vs: f.att }); if (f.att === X) P('front_att', 0.12 + 0.45 * dotw(S, X, f.v), { on: f.target }); }
  if (enemies(S, X).length) P('war', 0.08);
  for (const b of S.blockades) if (b.target === X) P('blockade', ISLAND.has(X) ? 3.5 : 2.0, { by: b.by });
  if (x.milPct > 3) P('milpct', (x.milPct - 3) * 0.06 * (sc().milDrag ?? 1));
  P('mob', [0, 0.1, 0.35, 0.8][x.mob] * (sc().mobDrag ?? 1));
  if (x.treasury < -x.gdp * 0.06) P('debt', 0.25);
  if (x.ctrl !== X) P('occupied', x.resist / 100 * 0.8);
  P('oil', 0.8 * (x.oilShort || 0)); P('labor', laborDrag(S, X));
  if (x.we) P('weco', weGrowthPen(S, X));
  const g0 = x.g0 || 0, pSum = pen.reduce((s, z) => s + z.v, 0), raw = g0 - pSum;
  const gd = raw > 0 ? Math.min(0.8, raw * 0.5) : raw, k = raw > 0 ? gd / raw : 1; // 正的部分减半、最多 0.8：各项按同一比例折算
  const parts = [];
  const add = (k2, v, o) => { if (Math.abs(v) > 1e-9) parts.push(Object.assign({ k: k2, v }, o || {})); };
  add('base', d.growth / 4);
  add('global', S.globalMod.reduce((s, m) => s + m.g, 0));
  if (g0) add('g0', g0 * k);
  for (const z of pen) { const { k: k1, v: v1, ...o } = z; add(k1, -v1 * k, o); }
  add('tech', (x.tech - d.tech) * 0.01);
  if (x.stab < 40) add('lowstab', -(40 - x.stab) * 0.02);
  for (const m of x.mods) add('mod_' + (m.src || 'other'), m.g, { turns: m.turns });
  const total = parts.reduce((s, z) => s + z.v, 0);
  return { parts, total, clamped: total > 6 || total < -12, avg: d.growth / 4 };
}
function stabBreak(S, X, growth) {
  const x = S.actors[X], d = DEF[X]; if (!x || !d) return null;
  const gw = GOVW[d.gov], pr = [], P = (k, v, o) => { if (Math.abs(v) > 1e-9) pr.push(Object.assign({ k, v }, o || {})); };
  for (const f of S.fronts) {
    if (f.att === X) P('war_att', (0.5 + dotw(S, X, f.v) * 1.5) * gw * (f.last < 0 ? 1.4 : 1), { on: f.target });
    if (f.target === X) P(f.turns <= 2 ? 'rally' : 'war_def', f.turns <= 2 ? -1.5 : (1 + Math.max(0, f.progress) / 50) * gw, { vs: f.att });
  }
  P('sanc', Math.min(1.2, 0.12 * S.sanctions.filter(s => s.to === X && s.level >= 2).length));
  for (const T of controlled(S, X)) if (T !== X && !S.actors[T].integrated) P('occ', S.actors[T].resist / 100 * 1.1 * (d.gov === 'dem' ? 1.3 : 0.8), { t: T });
  if (x.treasury < -x.gdp * 0.06) P('debt', 1.2);
  P('mob', [0, 0.3, 1, 2][x.mob] * gw);
  if (x.we) P('weco', weStabPen(S, X));
  const p0 = x.p0 || 0, pSum = pr.reduce((s, z) => s + z.v, 0), raw = (p0 - pSum) * 6, sd = raw > 0 ? Math.min(12, raw * 0.5) : raw, k = raw !== 0 ? sd / raw : 0;
  let fac = 0; if (isHuman(S, X)) { const pol = seatOf(S, X).pol; if (pol) fac = ((pol.fac.mil + pol.fac.biz + pol.fac.pub) / 3 - 50) * 0.15; }
  const target = d.stab + sd + fac, g = growth == null ? x.lastG || 0 : growth;
  const parts = [];
  const add = (k2, v, o) => { if (Math.abs(v) > 1e-9) parts.push(Object.assign({ k: k2, v }, o || {})); };
  add('norm', (d.stab - x.stab) * 0.12); // 向常态回归
  for (const z of pr) { const { k: k1, v: v1, ...o } = z; add(k1, -v1 * 6 * k * 0.12, o); }
  if (p0) add('p0', p0 * 6 * k * 0.12);
  if (fac) add('fac', fac * 0.12);
  add('growth', clamp((g - d.growth / 4) * 1.5, -3, 3));
  return { parts, total: parts.reduce((s, z) => s + z.v, 0), target };
}
function fiscalBreak(S, X) {
  const x = S.actors[X], d = DEF[X]; if (!x || !d || !indep(S, X)) return null;
  const fb = fiscalBase(S, X); let income = fb * 0.005 * (d.gov === 'aut' ? 1.1 : 1) * (x.stab < 30 ? 0.8 : 1);
  const parts = [], add = (k, v, o) => { if (Math.abs(v) > 1e-9) parts.push(Object.assign({ k, v }, o || {})); };
  let war = 0, def = 0, gar = 0;
  for (const f of S.fronts) { if (f.att === X) war += (f.v[0] * x.land + f.v[2] * x.air) * 0.012; if (f.def === X) def += (x.land + x.air) * 0.002; }
  for (const L in x.forces) if (L !== X) { const v = x.forces[L]; gar += (v[0] * x.land + v[1] * x.navy + v[2] * x.air) * 0.0015; }
  const trib = x.overlord && indep(S, x.overlord) ? income * 0.15 : 0;
  let tariff = 0; for (const s of S.sanctions) if (s.kind === 'tariff' && s.from === X) tariff += exposure(S, X, s.to) * x.gdp * 0.0004;
  let tribIn = 0; for (const V of IDS) { const v = S.actors[V]; if (v.overlord === X && indep(S, V) && V !== X) tribIn += fiscalBase(S, V) * 0.005 * (DEF[V].gov === 'aut' ? 1.1 : 1) * (v.stab < 30 ? 0.8 : 1) * 0.15; }
  let loanIn = 0, loanOut = 0; for (const l of S.loans) { if (l.from === X) loanIn += l.pay; if (l.to === X) loanOut += l.pay; }
  const blk = S.blockades.filter(b => b.by === X).length * x.gdp * 0.0005;
  add('tax', income); if (trib) add('tribute_out', -trib); if (tribIn) add('tribute_in', tribIn); if (tariff) add('tariff', tariff);
  add('war', -war); add('defense', -def); add('garrison', -gar); add('mob', -x.gdp * [0, 0.0005, 0.0015, 0.003][x.mob]);
  if (x.treasury < 0) add('interest', x.treasury * 0.012);
  add('loan_in', loanIn); add('loan_out', -loanOut); add('blockade', -blk);
  return { parts, total: parts.reduce((s, z) => s + z.v, 0) };
}
/* 军力：本季度按预算与产能生产、折旧（按当前的战力系数换算成军力指数） */
function milBreak(S, X) {
  const x = S.actors[X], d = DEF[X]; if (!x || !d || !indep(S, X)) return null;
  const mL = x.land > 1e-6 ? landEff(S, X) / x.land : 0, mA = x.air > 1e-6 ? airEff(S, X) / x.air : 0, mN = x.navy > 1e-6 ? navyEff(S, X) / x.navy : 0;
  const fb = fiscalBase(S, X), budget = fb * x.milPct / 100 / 4, capQ = warCapQ(S, X), eff = Math.min(budget, capQ);
  const tempo = sc().tempo || 1, tn = Math.max(1, tempo / 2.5), nd = tn / 16 * (sc().navyDecay ?? 1), b0 = eff * d.ppp * [1, 1.1, 1.25, 1.45][x.mob];
  const prod = b0 * tempo * x.mix[0] * mL + b0 * tn * x.mix[1] * mN + b0 * tempo * x.mix[2] * mA;
  const depr = x.land * (tempo / 16) * mL + x.navy * nd * mN + x.air * (tempo / 16) * mA;
  return { prod, depr, budget, capQ, capped: capQ < budget, milPct: x.milPct, mob: x.mob };
}
