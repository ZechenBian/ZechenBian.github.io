/* ===================== 人口、动员与战时生产（v4） =====================
 * 兵员：可动员人口（本土 + 已并入地区 + 少量占领区人口）× 历史最高动员率（mobMax）× 动员等级系数。
 * 生产：军费只有在军工产能允许的范围内才能转化为装备；产能利用率（cu）按国家的转产速度（ramp）逐季提高，
 *       平时则逐步转回民用。峰值可吸收的军费占 GDP 比例为 mcap（按二战等历史峰值设定）。
 * 石油（剧本提供 oil/oilNeed 时启用）：本土与势力范围内的产量 + 进口（受能源禁运、封锁、敌方制海权影响）+ 储备；
 *       短缺会削减产能、部队机动与经济增长。
 * 兵员与装备要匹配：装备扩充而兵员跟不上（或反之）时，陆军战斗力打折扣。
 */
const MOBF = [0.1, 0.25, 0.58, 1];
const mobMaxOf = X => DEF[X].mobMax ?? 0.12;
const mcapOf = X => DEF[X].mcap ?? (sc().mcap ?? 0.35);
const rampOf = X => DEF[X].ramp ?? (sc().ramp ?? 0.06);
function manBase(S, X) {
  let p = (DEF[X].pop + (S.actors[X].popX || 0)) * thOccK(S, X, 'pop'); // popX：精细战区回写的额外人口（联机版中共根据地）；thOccK：局部占领（单机版恒为 1）
  for (const T of IDS) { if (T === X) continue; const t = S.actors[T]; if (t.ctrl === X) p += DEF[T].pop * thOccK(S, T, 'pop') * (t.integrated ? 0.85 : 0.03); }
  p += thOccGain(S, X, 'man');
  if (S.actors[X].ctrl !== X) p *= 0.1;
  return p;
}
/* 兵员上限：可动员人口 × 最高动员率 × 动员等级系数；阵亡与重伤会耗尽适龄男性（按累计伤亡的四成扣减） */
const persCapAt = (S, X, mob) => Math.max(0, manBase(S, X) * 1000 * mobMaxOf(X) - (S.actors[X].cas || 0) * 0.4) * MOBF[clamp(mob | 0, 0, 3)] * weCapK(S, X);
/* 产能利用率：想要的军费 / 峰值可吸收军费；扩产需要时间 */
function updCapacity(S, X) {
  const x = S.actors[X], k = mcapOf(X);
  const need = clamp(x.milPct / 100 / k, 0, 1);
  if (x.cu === undefined || x.cu === null) x.cu = clamp(need * 1.15, 0.02, 1);
  const war = enemies(S, X).some(e => !(S.war[rk(X, e)] || {}).limited);
  const rate = rampOf(X) * [0.3, 0.55, 0.8, 1][x.mob] * (war ? 1 : 0.7);
  if (need > x.cu) x.cu = Math.min(need, x.cu + rate);
  else if (need < x.cu * 0.8) x.cu = Math.max(need * 1.15, x.cu - 0.03);
  x.cu = clamp(x.cu, 0.02, 1);
}
/* 本季度可以转化为战力的军费上限 */
/* 工业基础：本土 + 已并入地区；占领区的工业只能部分为占领者所用 */
function indBase(S, X) { let b = S.actors[X].gdp * thOccK(S, X, 'ind'); const oc = weOccInd(S, X); for (const T of IDS) { if (T === X) continue; const t = S.actors[T]; if (t.ctrl === X) b += t.gdp * thOccK(S, T, 'ind') * (t.integrated ? 0.9 : oc); } return b + thOccGain(S, X, 'ind'); }
function warCapQ(S, X) { const x = S.actors[X]; return indBase(S, X) * mcapOf(X) * (x.cu ?? 1) * (1 - 0.5 * (x.oilShort || 0)) / 4 * weIndK(S, X); }
/* 石油平衡（百万吨/年） */
function oilSources(S, X) {
  let dom = 0;
  for (const T of IDS) {
    const o = DEF[T].oil || 0; if (!o) continue; const t = S.actors[T];
    if (T === X && t.ctrl === X) dom += o * (1 - (t.oilHit || 0));
    else if (t.ctrl === X && T !== X) dom += o * (t.integrated ? 0.9 : weOccOil(S, X));
    else if (t.ctrl === T && t.overlord === X) dom += o * 0.6;
  }
  return dom;
}
function oilImportF(S, X) {
  let f = 1;
  for (const s of S.sanctions) if (s.to === X && s.kind === 'energy') f *= (DEF[s.from].energy ?? 0) >= 1 || (DEF[s.from].oil || 0) > (DEF[s.from].oilNeed || 0) ? 0.35 : 0.8;
  if (S.blockades.some(b => b.target === X)) f *= 0.25;
  if (!LANDLOCKED.has(X)) for (const e of enemies(S, X)) if (isGreat(S, e) && navyEff(S, e) > navyEff(S, X) * 1.5) { f *= 0.6; break; }
  return f;
}
function oilTurn(S, X) {
  const d = DEF[X], x = S.actors[X];
  if (!(d.oilNeed > 0) || !indep(S, X)) { x.oilShort = 0; return; }
  const dom = oilSources(S, X);
  const need = d.oilNeed * [0.8, 0.9, 1.05, 1.25][x.mob];
  const f = oilImportF(S, X); const imp = Math.max(0, need - dom) * f + (f >= 0.9 && dom < need ? need * 0.12 : 0); // 进口畅通时可以囤积储备
  if (x.oil === undefined || x.oil === null) x.oil = d.oilStock ?? need * 0.5;
  x.oil += (dom + imp - need) / 4;
  let short = 0;
  if (x.oil < 0) { short = clamp(-x.oil / (need / 4), 0, 1); x.oil = 0; }
  x.oil = Math.min(x.oil, Math.max(d.oilStock || 0, need * 1.5));
  x.oilShort = +short.toFixed(3); x.oilDom = +dom.toFixed(2); x.oilImp = +imp.toFixed(2); x.oilUse = +need.toFixed(2);
}
const fuelF = x => 1 - 0.3 * (x.oilShort || 0);
/* 兵员与装备的匹配度：陆军需要足够的兵员 */
function manning(S, X) { const x = S.actors[X]; if (!(x.ppl > 0) || !(x.land > 0)) return 1; return clamp((x.pers || 0) / (x.land * x.ppl * (1 + 0.12 * x.mob)), 0.3, 1.2); }
const manF = (S, X) => Math.min(sc().noIdlePeace ? 1.1 : 1, 0.55 + 0.45 * manning(S, X)); // 历史剧本：兵员充裕时步兵也能弥补部分装备不足
/* 劳动力被抽走：在军中的人口比例过高时拖累经济 */
function laborDrag(S, X) { const sh = (S.actors[X].pers || 0) / 1000 / Math.max(0.1, manBase(S, X)); return Math.max(0, sh - 0.06) * 8 * weLaborK(S, X); }
/* 估算的年产量（按本季度折算）：坦克/作战飞机/舰艇 */
/* 现代剧本没有逐国的新装备单价（kp）：军费流入大部分用于人员、维护与研发，新造装备只占一部分（procK，战时比例上升） */
function prodUnits(S, X) {
  const x = S.actors[X], kp = DEF[X].kp, k = kp ? { t: kp[0], a: kp[1], s: kp[2] } : (x.k || {}), q = x.inQ || 0;
  const pk = kp ? null : sc().procK, f = pk ? [1, 1.4, 2, 3][x.mob | 0] : 1, m = b => (pk ? (pk[b] ?? 1) * f : 1);
  return { t: q * x.mix[0] * (k.t || 0) * 4 * m('t'), a: q * x.mix[2] * (k.a || 0) * 4 * m('a'), s: (x.inN ?? q) * x.mix[1] * (k.s || 0) * 4 * m('s') };
}
/* 国力面板数据 */
function industryView(S, X) {
  const x = S.actors[X], d = DEF[X];
  const units = unitsOf(S, X);
  return {
    id: X, pop: d.pop, base: manBase(S, X), gdp: x.gdp, milPct: x.milPct, mob: x.mob,
    pers: x.pers || 0, capNow: persCapAt(S, X, x.mob), capMax: persCapAt(S, X, 3), mobMax: mobMaxOf(X), cas: x.cas || 0, manning: manning(S, X),
    steel: d.steel ?? null, oil: d.oil ?? null, oilNeed: d.oilNeed ? (x.oilUse ?? d.oilNeed) : null, oilDom: x.oilDom ?? null, oilImp: x.oilImp ?? null, oilStock: d.oilNeed ? (x.oil ?? null) : null, oilShort: x.oilShort || 0,
    cu: x.cu ?? null, capQ: x.capQ ?? warCapQ(S, X), budQ: x.budQ ?? fiscalBase(S, X) * x.milPct / 400, prodQ: x.prodQ ?? null, mcap: mcapOf(X), ramp: rampOf(X),
    made: prodUnits(S, X), units, power: power(S, X), labor: laborDrag(S, X),
  };
}
