/* ===================== 目标与计分（联机版的排行榜） =====================
 * 每个年代的主要国家有几条历史目标；其余国家用通用目标。三类：
 *   reach：在期限（[年, 季]，可省）之前做到一次即达成；过了期限还没做到算失败
 *   keep ：直到期限都要一直保持，中途被打破就失败；撑过期限即达成
 *   hold ：看当前局势，满足时计分（对局结束时的状态为准）
 * 记录写在 S.mp.goals（只在联机版的状态里，单机推演不受影响）：回合数 ≥ 0 = 达成于该回合，负数 = 失败。
 * 得分 = 主权（0–20）+ 经济（0–20，按占世界 GDP 的份额相对开局的变化）+ 军力（0–20，按军力份额）+ 稳定（0–10）+ 达成的目标分。
 * 份额按相对开局的变化算：小国与大国站在同一起跑线上。 */
const gFree = (S, X) => !!S.actors[X] && S.actors[X].ctrl === X && !S.actors[X].overlord;
const gDown = (S, X) => !S.actors[X] || S.actors[X].ctrl !== X || !!S.actors[X].overlord;
const gCtl = (S, me, T) => !!S.actors[T] && T !== me && boss(S, T) === me;
const gWar = (S, a, b) => !!S.actors[a] && !!S.actors[b] && atWar(S, a, b);
const gAlly = (S, a, b) => !!S.actors[a] && !!S.actors[b] && isAlly(S, a, b);
const gShareG = (S, X) => S.actors[X].gdp / worldGDP(S);
const gPowTot = S => IDS.filter(id => indep(S, id)).reduce((s, id) => s + power(S, id), 0) || 1;
const gShareP = (S, X) => power(S, X) / gPowTot(S);
const gTop = (S, X, f) => IDS.filter(id => id !== X && S.actors[id] && indep(S, id)).every(id => f(S, id) <= f(S, X));
const gGdp0 = (S, X) => (S.mp && S.mp.g0 && S.mp.g0[X] && S.mp.g0[X].gdp) || S.actors[X].gdp;
const gGrew = (S, X, k) => S.actors[X].gdp >= gGdp0(S, X) * k;
const gG = (id, w, kind, test, zh, en, until) => ({ id, w, kind, test, t: [zh, en], until: until || null });
const GOALS = {
  1939: {
    GBR: [gG('home', 15, 'hold', S => gFree(S, 'GBR'), '英国本土不被占领', 'Keep the British Isles unoccupied'),
      gG('france', 15, 'keep', S => gFree(S, 'FRA') && gAlly(S, 'GBR', 'FRA'), '法国坚持到 1941 年底，英法同盟不破', 'France holds out with the Anglo-French alliance intact until the end of 1941', [1941, 4]),
      gG('usa', 10, 'reach', S => gWar(S, 'USA', 'DEU') || gAlly(S, 'GBR', 'USA'), '1943 年底前把美国拉到自己一边（美德开战或英美结盟）', 'Bring America in by the end of 1943 (US–German war or an Anglo-American alliance)', [1943, 4]),
      gG('beat', 20, 'reach', S => gDown(S, 'DEU'), '击败德国（德国被占领或沦为附庸）', 'Defeat Germany (occupied or reduced to a vassal)')],
    FRA: [gG('home', 25, 'keep', S => gFree(S, 'FRA'), '法国本土坚持到 1942 年底不被占领', 'Keep France unoccupied until the end of 1942', [1942, 4]),
      gG('ally', 10, 'hold', S => gAlly(S, 'FRA', 'GBR'), '保持英法同盟', 'Keep the Anglo-French alliance'),
      gG('beat', 20, 'reach', S => gDown(S, 'DEU'), '击败德国', 'Defeat Germany')],
    DEU: [gG('poland', 10, 'reach', S => gCtl(S, 'DEU', 'POL'), '1940 年底前控制波兰', 'Control Poland by the end of 1940', [1940, 4]),
      gG('france', 20, 'reach', S => gDown(S, 'FRA'), '1941 年底前击败法国', 'Defeat France by the end of 1941', [1941, 4]),
      gG('east', 10, 'keep', S => !gWar(S, 'DEU', 'RUS'), '1941 年年中之前不与苏联开战（避免两线作战）', 'No war with the Soviet Union before mid-1941 (avoid a two-front war)', [1941, 2]),
      gG('home', 15, 'hold', S => gFree(S, 'DEU'), '德国本土不被占领', 'Keep Germany unoccupied')],
    ITA: [gG('home', 20, 'hold', S => gFree(S, 'ITA'), '意大利本土不被占领', 'Keep Italy unoccupied'),
      gG('balkans', 15, 'reach', S => gCtl(S, 'ITA', 'BAL'), '控制巴尔干', 'Control the Balkans'),
      gG('usa', 10, 'hold', S => !gWar(S, 'ITA', 'USA'), '不与美国交战', 'Stay out of war with the United States')],
    RUS: [gG('home', 25, 'hold', S => gFree(S, 'RUS'), '苏联本土不被占领', 'Keep the Soviet homeland unoccupied'),
      gG('buffer', 10, 'reach', S => gCtl(S, 'RUS', 'BLT'), '取得西部缓冲区（控制波罗的海三国）', 'Gain a western buffer (control the Baltic states)'),
      gG('beat', 20, 'reach', S => gDown(S, 'DEU'), '击败德国', 'Defeat Germany')],
    JPN: [gG('home', 20, 'hold', S => gFree(S, 'JPN'), '日本本土不被占领', 'Keep the Japanese home islands unoccupied'),
      gG('china', 15, 'reach', S => !gWar(S, 'JPN', 'CHN'), '结束对华战争（与中国停战或议和）', 'End the war in China (armistice or peace)'),
      gG('usa', 10, 'keep', S => !gWar(S, 'JPN', 'USA'), '1941 年底前不与美国开战', 'No war with the United States before the end of 1941', [1941, 4])],
    USA: [gG('econ', 15, 'hold', S => gTop(S, 'USA', (S2, id) => S2.actors[id].gdp), '保持世界第一经济体', 'Remain the world\'s largest economy'),
      gG('deu', 20, 'reach', S => gDown(S, 'DEU'), '1945 年底前击败德国', 'Defeat Germany by the end of 1945', [1945, 4]),
      gG('jpn', 15, 'reach', S => gDown(S, 'JPN'), '1946 年底前击败日本', 'Defeat Japan by the end of 1946', [1946, 4])],
    CHN: [gG('hold', 15, 'hold', S => gFree(S, 'CHN'), '坚持抗战，绝不屈服', 'Fight on and never submit'),
      gG('allies', 15, 'reach', S => gAlly(S, 'CHN', 'USA') || gAlly(S, 'CHN', 'GBR'), '争取美国或英国结盟', 'Win an alliance with America or Britain'),
      gG('peace', 20, 'reach', S => !gWar(S, 'CHN', 'JPN') && gFree(S, 'CHN'), '打赢或体面结束对日战争', 'Win or honourably end the war with Japan')],
    POL: [gG('free', 30, 'hold', S => gFree(S, 'POL'), '战争结束时波兰独立', 'An independent Poland when the war ends'),
      gG('allies', 15, 'hold', S => gAlly(S, 'POL', 'GBR') || gAlly(S, 'POL', 'FRA'), '保持与英国或法国的同盟', 'Keep the alliance with Britain or France')],
  },
  1945: {
    USA: [gG('econ', 15, 'hold', S => gTop(S, 'USA', (S2, id) => S2.actors[id].gdp), '保持世界第一经济体', 'Remain the world\'s largest economy'),
      gG('west', 15, 'reach', S => gAlly(S, 'USA', 'GBR') && gAlly(S, 'USA', 'FRA'), '组建西方同盟（与英国、法国结盟）', 'Build a Western alliance (allied with Britain and France)'),
      gG('contain', 20, 'hold', S => ['FRA', 'BNL', 'ITA'].every(X => !S.actors[X] || boss(S, X) !== 'RUS'), '遏制苏联：西欧（法国、比荷卢、意大利）不落入苏联之手', 'Contain the Soviets: Western Europe (France, Benelux, Italy) stays out of their hands')],
    RUS: [gG('buffer', 20, 'hold', S => gCtl(S, 'RUS', 'CEU'), '控制东欧缓冲区（中欧诸国）', 'Hold the East European buffer (Central Europe)'),
      gG('bomb', 15, 'reach', S => S.actors.RUS.nukes > 0, '1950 年底前打破美国的核垄断', 'Break the American nuclear monopoly by the end of 1950', [1950, 4]),
      gG('home', 15, 'hold', S => gFree(S, 'RUS'), '苏联本土安全', 'Keep the Soviet homeland secure')],
    GBR: [gG('home', 15, 'hold', S => gFree(S, 'GBR'), '英国本土安全', 'Keep Britain secure'),
      gG('usa', 15, 'hold', S => gAlly(S, 'GBR', 'USA'), '与美国结盟', 'Stay allied with America'),
      gG('great', 15, 'hold', S => IDS.filter(id => S.actors[id] && indep(S, id) && power(S, id) > power(S, 'GBR')).length <= 2, '保持世界前三的军力', 'Keep a top-three military')],
    FRA: [gG('home', 15, 'hold', S => gFree(S, 'FRA'), '法国本土安全', 'Keep France secure'),
      gG('rise', 15, 'reach', S => gShareP(S, 'FRA') >= ((S.mp && S.mp.g0 && S.mp.g0.FRA && S.mp.g0.FRA.p) || 0) * 1.5, '恢复大国地位（军力份额比开局增长一半）', 'Restore great-power status (military share up by half)'),
      gG('ally', 10, 'hold', S => gAlly(S, 'FRA', 'GBR') || gAlly(S, 'FRA', 'USA'), '与英国或美国结盟', 'Stay allied with Britain or America')],
    CHN: [gG('hold', 20, 'hold', S => gFree(S, 'CHN'), '国家独立，本土不被占领', 'Stay independent, the homeland unoccupied'),
      gG('grow', 15, 'reach', S => gGrew(S, 'CHN', 2), '经济总量翻一番', 'Double the economy'),
      gG('peace', 10, 'hold', S => !IDS.some(id => S.actors[id] && gWar(S, 'CHN', id)), '实现和平（不与任何国家交战）', 'Be at peace with everyone')],
  },
  1979: {
    USA: [gG('edge', 20, 'hold', S => power(S, 'USA') > power(S, 'RUS'), '军力保持对苏优势', 'Keep a military edge over the Soviet Union'),
      gG('nato', 15, 'hold', S => ['DEU', 'GBR', 'FRA'].every(X => gAlly(S, 'USA', X)), '北约完整（与联邦德国、英国、法国结盟）', 'Keep NATO whole (allied with West Germany, Britain and France)'),
      gG('china', 10, 'reach', S => gAlly(S, 'USA', 'CHN') || isPartner(S, 'USA', 'CHN') || hasTreaty(S, 'USA', 'CHN', 'trade'), '巩固中美关系（结盟、伙伴或贸易协定）', 'Cement ties with China (alliance, partnership or trade pact)')],
    RUS: [gG('bloc', 20, 'hold', S => gCtl(S, 'RUS', 'POL') && gCtl(S, 'RUS', 'CEU'), '华约完整（控制波兰与中欧诸国）', 'Keep the Warsaw Pact whole (control Poland and Central Europe)'),
      gG('parity', 15, 'hold', S => power(S, 'RUS') >= power(S, 'USA') * 0.9, '保持与美国的军力均势', 'Keep military parity with America'),
      gG('home', 15, 'hold', S => gFree(S, 'RUS'), '苏联本土安全', 'Keep the Soviet homeland secure')],
    CHN: [gG('grow', 20, 'reach', S => gGrew(S, 'CHN', 2), '经济腾飞：GDP 翻一番', 'Economic take-off: double GDP'),
      gG('home', 15, 'hold', S => gFree(S, 'CHN'), '本土不被占领', 'Keep the homeland unoccupied'),
      gG('peace', 10, 'hold', S => !gWar(S, 'CHN', 'RUS'), '不与苏联开战', 'Avoid war with the Soviet Union')],
    JPN: [gG('grow', 15, 'reach', S => gGrew(S, 'JPN', 1.5), 'GDP 增长 50%', 'Grow GDP by half'),
      gG('usa', 15, 'hold', S => gAlly(S, 'JPN', 'USA'), '保持日美同盟', 'Keep the US–Japan alliance'),
      gG('home', 15, 'hold', S => gFree(S, 'JPN'), '本土安全', 'Keep the homeland secure')],
    DEU: [gG('home', 15, 'hold', S => gFree(S, 'DEU'), '联邦德国本土安全', 'Keep West Germany secure'),
      gG('nato', 15, 'hold', S => gAlly(S, 'DEU', 'USA'), '保持与美国的同盟', 'Stay allied with America'),
      gG('grow', 10, 'reach', S => gGrew(S, 'DEU', 1.4), 'GDP 增长 40%', 'Grow GDP by 40%')],
    IND: [gG('grow', 15, 'reach', S => gGrew(S, 'IND', 1.5), 'GDP 增长 50%', 'Grow GDP by half'),
      gG('home', 15, 'hold', S => gFree(S, 'IND'), '本土不被占领', 'Keep the homeland unoccupied'),
      gG('nonal', 10, 'hold', S => !gAlly(S, 'IND', 'USA') && !gAlly(S, 'IND', 'RUS'), '坚持不结盟', 'Stay non-aligned')],
    IRN: [gG('home', 15, 'hold', S => gFree(S, 'IRN'), '国家独立', 'Stay independent'),
      gG('stab', 15, 'hold', S => S.actors.IRN.stab >= 50, '新政权站稳脚跟（稳定度不低于 50）', 'Consolidate the new regime (stability at least 50)')],
    ISR: [gG('home', 25, 'hold', S => gFree(S, 'ISR'), '国家生存', 'Survive as a state'),
      gG('egypt', 15, 'hold', S => !gWar(S, 'ISR', 'EGY'), '与埃及保持和平', 'Keep the peace with Egypt')],
  },
  2026: {
    USA: [gG('top', 20, 'hold', S => gTop(S, 'USA', (S2, id) => power(S2, id)) && gTop(S, 'USA', (S2, id) => S2.actors[id].gdp), '保持经济与军力双第一', 'Stay first in both economy and military power'),
      gG('allies', 15, 'hold', S => gAlly(S, 'USA', 'JPN') && gAlly(S, 'USA', 'GBR'), '维系同盟体系（与日本、英国结盟）', 'Keep the alliance system (allied with Japan and Britain)')],
    CHN: [gG('gdp', 20, 'reach', S => S.actors.CHN.gdp > S.actors.USA.gdp, '经济总量超过美国', 'Overtake America in GDP'),
      gG('stab', 10, 'hold', S => S.actors.CHN.stab >= 60, '保持社会稳定（稳定度不低于 60）', 'Keep society stable (stability at least 60)'),
      gG('peace', 15, 'hold', S => !IDS.some(id => S.actors[id] && isGreat(S, id) && gWar(S, 'CHN', id)), '不与任何大国交战', 'Avoid war with any great power')],
    RUS: [gG('ukr', 15, 'reach', S => !gWar(S, 'RUS', 'UKR'), '结束对乌克兰的战争', 'End the war with Ukraine'),
      gG('home', 15, 'hold', S => gFree(S, 'RUS'), '本土不被占领', 'Keep the homeland unoccupied'),
      gG('stab', 10, 'hold', S => S.actors.RUS.stab >= 50, '国内稳定（稳定度不低于 50）', 'Domestic stability (at least 50)')],
    UKR: [gG('free', 30, 'hold', S => gFree(S, 'UKR'), '保持独立', 'Stay independent'),
      gG('peace', 15, 'reach', S => !gWar(S, 'UKR', 'RUS') && gFree(S, 'UKR'), '以独立国家身份实现停战或和平', 'Reach a ceasefire or peace as an independent state')],
    IND: [gG('grow', 15, 'reach', S => S.actors.IND.gdp > S.actors.JPN.gdp && S.actors.IND.gdp > S.actors.DEU.gdp, '经济总量超过日本和德国', 'Out-grow Japan and Germany'),
      gG('home', 15, 'hold', S => gFree(S, 'IND'), '本土不被占领', 'Keep the homeland unoccupied')],
    JPN: [gG('usa', 15, 'hold', S => gAlly(S, 'JPN', 'USA'), '保持日美同盟', 'Keep the US–Japan alliance'),
      gG('home', 15, 'hold', S => gFree(S, 'JPN'), '本土安全', 'Keep the homeland secure'),
      gG('grow', 10, 'reach', S => gGrew(S, 'JPN', 1.1), 'GDP 增长 10%', 'Grow GDP by 10%')],
    DEU: [gG('grow', 15, 'reach', S => gGrew(S, 'DEU', 1.1), 'GDP 增长 10%', 'Grow GDP by 10%'),
      gG('home', 15, 'hold', S => gFree(S, 'DEU'), '本土安全', 'Keep the homeland secure'),
      gG('ukr', 10, 'hold', S => !S.actors.UKR || gFree(S, 'UKR'), '乌克兰保持独立', 'Ukraine stays independent')],
    GBR: [gG('home', 15, 'hold', S => gFree(S, 'GBR'), '本土安全', 'Keep the homeland secure'),
      gG('usa', 15, 'hold', S => gAlly(S, 'GBR', 'USA'), '保持英美同盟', 'Keep the Anglo-American alliance'),
      gG('grow', 10, 'reach', S => gGrew(S, 'GBR', 1.1), 'GDP 增长 10%', 'Grow GDP by 10%')],
    FRA: [gG('home', 15, 'hold', S => gFree(S, 'FRA'), '本土安全', 'Keep the homeland secure'),
      gG('eu', 15, 'hold', S => gAlly(S, 'FRA', 'DEU'), '保持法德轴心（与德国结盟）', 'Keep the Franco-German axis (allied with Germany)'),
      gG('grow', 10, 'reach', S => gGrew(S, 'FRA', 1.1), 'GDP 增长 10%', 'Grow GDP by 10%')],
    ISR: [gG('home', 25, 'hold', S => gFree(S, 'ISR'), '国家安全', 'Keep the state secure'),
      gG('peace', 15, 'reach', S => !IDS.some(id => S.actors[id] && gWar(S, 'ISR', id)), '结束所有战事', 'End every war')],
    IRN: [gG('home', 20, 'hold', S => gFree(S, 'IRN'), '国家独立', 'Stay independent'),
      gG('stab', 15, 'hold', S => S.actors.IRN.stab >= 50, '政权稳定（稳定度不低于 50）', 'Regime stability (at least 50)')],
  },
};
const GOALS_GEN = [
  gG('sov', 20, 'hold', (S, X) => gFree(S, X), '保持独立，本土不被占领', 'Stay independent with the homeland unoccupied'),
  gG('grow', 15, 'reach', (S, X) => gGrew(S, X, 1.25), 'GDP 比开局增长 25%', 'Grow GDP 25% above the start'),
  gG('friend', 10, 'hold', (S, X) => IDS.some(Y => Y !== X && S.actors[Y] && isGreat(S, Y) && isAlly(S, X, Y)), '至少有一个大国盟友', 'Have at least one great-power ally'),
];
function goalsOf(S, X) { const g = (GOALS[S.scen] || {})[X]; return g || GOALS_GEN; }
/* 开局：记下各国的起点（份额与 GDP） */
function goalsInit(S) {
  if (!S.mp) return;
  S.mp.g0 = {}; const tp = gPowTot(S), wg = worldGDP(S);
  for (const X of IDS) if (S.actors[X]) S.mp.g0[X] = { g: S.actors[X].gdp / wg, p: power(S, X) / tp, gdp: S.actors[X].gdp };
  S.mp.goals = {};
}
const gBy = (d, u) => !u || d.y < u[0] || (d.y === u[0] && d.q <= u[1]);
/* 每回合结算后（联机版）：判定各位真人的 reach / keep 目标 */
function goalsTurn(S) {
  if (!S.mp) return;
  if (!S.mp.g0) goalsInit(S);
  const rec = (S.mp.goals = S.mp.goals || {}), d = dateOf(S, S.turn - 1); // 刚结算的那个季度
  const own = GOALS[S.scen] || {};
  for (const X of IDS) {
    if (!S.actors[X] || !(isHuman(S, X) || own[X])) continue; // 真人，以及有历史目标的 AI 大国（排行榜对照用）
    const r = (rec[X] = rec[X] || {});
    for (const g of goalsOf(S, X)) {
      if (g.kind === 'hold' || r[g.id] !== undefined) continue;
      let ok = false; try { ok = !!g.test(S, X); } catch (e) { ok = false; }
      const inTime = gBy(d, g.until);
      if (g.kind === 'reach') { if (ok && inTime) r[g.id] = S.turn; else if (!inTime) r[g.id] = -1 - S.turn; }
      else if (g.kind === 'keep') { if (!ok) r[g.id] = -1 - S.turn; else if (g.until && !gBy(dateOf(S), g.until)) r[g.id] = S.turn; }
    }
  }
}
/* 一条目标现在的状态：done 达成 | fail 失败 | on 正满足 | off 未满足 */
function goalState(S, X, g) {
  const r = S.mp && S.mp.goals && S.mp.goals[X] ? S.mp.goals[X][g.id] : undefined;
  if (g.kind !== 'hold' && r !== undefined) return r >= 0 ? 'done' : 'fail';
  let ok = false; try { ok = !!g.test(S, X); } catch (e) { ok = false; }
  return ok ? 'on' : 'off';
}
function goalsView(S, X) { return goalsOf(S, X).map(g => ({ id: g.id, w: g.w, kind: g.kind, t: g.t, until: g.until, st: goalState(S, X, g) })); }
function scoreOf(S, X) {
  const x = S.actors[X]; if (!x) return null;
  const g0 = (S.mp && S.mp.g0 && S.mp.g0[X]) || { g: gShareG(S, X), p: gShareP(S, X) };
  const lg = v => Math.log(Math.max(1e-6, v)) / Math.LN2;
  const sov = x.ctrl !== X ? 0 : x.overlord ? 8 : 20;
  const econ = clamp(10 + 10 * lg(gShareG(S, X) / Math.max(1e-6, g0.g)), 0, 20);
  const mil = clamp(10 + 10 * lg(gShareP(S, X) / Math.max(1e-6, g0.p)), 0, 20);
  const stab = clamp(x.stab / 10, 0, 10);
  let obj = 0, objMax = 0;
  for (const g of goalsOf(S, X)) { objMax += g.w; const st = goalState(S, X, g); if (st === 'done' || (g.kind === 'hold' && st === 'on')) obj += g.w; }
  return { total: Math.round(sov + econ + mil + stab + obj), sov: Math.round(sov), econ: Math.round(econ), mil: Math.round(mil), stab: Math.round(stab), obj, objMax };
}
/* 排行榜：真人在前（多人局），也可以带上几个 AI 大国作对照 */
function standings(S, list) { return (list || humansOf(S)).filter(X => S.actors[X]).map(X => Object.assign({ id: X, human: isHuman(S, X) }, scoreOf(S, X))).sort((a, b) => b.total - a.total); }
