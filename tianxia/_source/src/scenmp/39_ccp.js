// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 中国共产党（联机版） =====================
 * 精细战区打开时，中共是独立势力：以陕甘宁边区为本土（延安），八路军、新四军在敌后建立根据地；
 * 名义上隶属国民政府（第十八集团军、新四军），与国民党结成统一战线（同盟 + 通行权），实际独立指挥。
 * 精细战区关闭时，中共并入中华民国（与原版一致）。其他剧本中中共一律并入中国。
 * 网页版（window.TX_NOCCP）完全不加入这一方：四个年代都只有一个中国。
 * 地区轮廓：1940 年前后的陕甘宁边区（延属、绥德、三边、陇东、关中分区），经纬度近似；投影后的像素数据由 tools/ccp_geo.mjs 生成。
 */
var GEO_EXTRA = GEO_EXTRA || {};
/*GEO_EXTRA_BEGIN*/GEO_EXTRA.CCP = [[[107.0, 37.95], [107.7, 38.05], [108.6, 38.0], [109.3, 37.85], [109.85, 37.75], [110.55, 37.45], [110.5, 36.95], [110.35, 36.45], [109.95, 36.05], [109.3, 35.75], [108.75, 35.3], [108.3, 35.15], [107.85, 35.4], [107.45, 35.75], [107.0, 36.15], [106.75, 36.7], [106.75, 37.3], [106.85, 37.7]]];/*GEO_EXTRA_END*/
/*GEO_CCP_BEGIN*/var GEO_CCP = {"path":"M1550.9 269L1554.3 268.4L1559 268.7L1563 269.7L1566.1 270.3L1570.4 272.2L1571.3 275.5L1571.6 278.7L1570.4 281.3L1567.7 283.2L1565.8 286.1L1563.7 287.1L1560.9 285.5L1558 283.2L1554.8 280.6L1552.3 277.1L1551 273.2L1550.7 270.6Z","label":[1561.4,276.6],"bbox":[1550,268,1572,288],"area":265,"cities":[["延安","Yan’an",1566.8,277.7,1],["庆阳","Qingyang",1559.7,281.6,0],["绥德","Suide",1568.8,271.9,0]]};/*GEO_CCP_END*/
(function () {
  if (typeof ACTORS === 'undefined' || typeof SCENARIOS === 'undefined') return;
  // 法国—中欧（经瑞士）的陆上接壤不是可行的进攻路线
  if (SCENARIOS['1939']) { SCENARIOS['1939'].noLand = (SCENARIOS['1939'].noLand || []).concat([['FRA', 'CEU']]); SCENARIOS['1939'].noLandSet = null; }
  if (typeof window !== 'undefined' && window.TX_NOCCP) return; // 网页版：任何年代都不单列中共（见 src/web/03_world.js）
  // 地区：加入 ACTORS（2026 等剧本中并入中国）
  if (!ACTORS.some(a => a.id === 'CCP')) ACTORS.push({
    id: 'CCP', name: '中国共产党', en: 'Chinese Communist Party', gov: 'aut', pop: 1.5, gdp: 4, growth: 2, milex: 0.3, pers: 20, nukes: 0, tech: 40, stab: 70, ppp: 2, mix: [.98, 0, .02], terr: 1.4, energy: 0, fin: 0, proj: 600, icbm: 0, intel: 60, hawk: .5, econ: .3, risk: .4, loyal: .5,
    voice: '中共中央', voiceEn: 'CCP Central Committee', doctrine: '中国共产党。', doctrineEn: 'The Chinese Communist Party.',
  });
  if (typeof GEO !== 'undefined' && GEO_CCP && !GEO.paths.CCP) {
    GEO.paths.CCP = GEO_CCP.path; GEO.label.CCP = GEO_CCP.label; GEO.bbox.CCP = GEO_CCP.bbox; GEO.areaPx.CCP = GEO_CCP.area;
    if (GEO.outline && !GEO.outline.CCP) GEO.outline.CCP = GEO_CCP.path; // 地图上的高亮轮廓（选中、悬停、玩家本国）
    GEO.land.CCP = ['CHN']; if (GEO.land.CHN && !GEO.land.CHN.includes('CCP')) GEO.land.CHN.push('CCP');
    for (const [k, v] of Object.entries(GEO.dist)) { const [a, b] = k.split('|'); if (a === 'CHN' && b !== 'CCP') GEO.dist['CCP|' + b] = v; else if (b === 'CHN' && a !== 'CCP') GEO.dist[a + '|CCP'] = v; }
    GEO.dist['CHN|CCP'] = 0;
  }
  if (typeof CITIES !== 'undefined' && GEO_CCP && !CITIES.CCP) CITIES.CCP = GEO_CCP.cities;
  for (const [id, s] of Object.entries(SCENARIOS)) { if (id === '1939') continue; s.part = Object.assign({}, s.part || {}, { CCP: 'CHN' }); }
  const S39 = SCENARIOS['1939']; if (!S39) return;
  const A = (name, en, gov, pop, gdp, growth, milex, pers, tech, stab, x) => Object.assign({ name, en, gov, pop, gdp, growth, milex, pers, tech, stab, nukes: 0, nukeProg: 0, icbm: 0 }, x || {});
  S39.actors.CCP = A('中国共产党（陕甘宁边区）', 'Chinese Communist Party (Shaan-Gan-Ning)', 'aut', 1.5, 8, 2, 1.0, 300, 15, 78, {
    war: 25, ppp: 3.2, stock: 1.0, mix: [.99, 0, .01], terr: 1.4, energy: 0, fin: 0, proj: 700, intel: 75, hawk: .55, econ: .25, risk: .45, loyal: .45,
    mobMax: .015, mcap: .3, ramp: .03, // 正规军约为根据地人口的 1.5%（民兵另计） steel: 0, oil: .01, oilNeed: .05, oilStock: .02,
    voice: '中共中央与第十八集团军（八路军）总部', voiceEn: 'The CCP Central Committee and Eighth Route Army headquarters',
    doctrine: '以延安为中心的陕甘宁边区只有一百多万人口，但八路军、新四军已深入敌后，在华北山区与平原、华中水网建立抗日根据地，实行减租减息、“三三制”政权与群众动员，打游击战和运动战。名义上是国民革命军第十八集团军与新四军，接受国民政府领导，实际由中共中央军委独立指挥；与国民党既合作又摩擦，国民党正在加紧限制与封锁。毛泽东的《论持久战》主张：战略防御、相持、反攻三阶段，敌进我退，积小胜为大胜。依靠苏联的道义支持，物质援助很少。',
    doctrineEn: 'The Yan’an-centred Shaan-Gan-Ning Border Region has little over a million people, but the Eighth Route Army and New Fourth Army have pushed deep behind Japanese lines, building base areas in the mountains and plains of North China and the waterways of Central China through rent reduction, the "three-thirds" councils and mass mobilization, and fighting guerrilla and mobile war. Nominally the NRA’s 18th Group Army and New Fourth Army under the Nationalist government, they answer in fact to the CCP Military Commission; cooperation with the Kuomintang is laced with friction, and Chongqing is tightening restrictions and a blockade. Mao’s "On Protracted War" foresees strategic defence, stalemate and counter-offensive: retreat when the enemy advances, and add small victories into a big one. Moscow offers moral support but little material aid.' });
  S39.thOnly = ['CCP']; S39.thOwner = { CCP: 'CHN' }; // 精细战区关闭时并入中华民国
  S39.treaties = S39.treaties.concat([['alliance', 'CHN', 'CCP'], ['access', 'CHN', 'CCP']]);
  S39.wars = S39.wars.concat([['JPN', 'CCP', -9]]);
  S39.forces = Object.assign({}, S39.forces, { CCP: { CCP: [.25, 0, 1], CHN: [.75, 0, 0] } });
  S39.mob = Object.assign({}, S39.mob, { CCP: 3 });
  S39.rel += '\nCCP CHN 20|CCP JPN -100|CCP RUS 60|CCP USA 5|CCP GBR -5|CCP DEU -40|CCP ITA -30|CCP MNG 40|CCP FRA 0';
  S39.agenda.CCP = { goals: ['resist_japan', 'expand_bases', 'survive'], stance: { JPN: 'attack', CHN: 'hedge', RUS: 'court', USA: 'court', GBR: 'hedge' }, red: [{ type: 'attack', t: 'CCP' }] };
  S39.startNote = Object.assign({}, S39.startNote, { CCP: 's39.ccp' });
  S39.aggr0 = Object.assign({}, S39.aggr0, { CCP: 30 });
  if (S39.inv) S39.inv.CCP = [0, 0, 0];
  S39.noOps = (S39.noOps || []).concat(['CCP']);                 // 中共的战争在精细战区里进行，战略层 AI 不替它发动行动
})();
