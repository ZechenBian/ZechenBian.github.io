/* ===================== 剧本注册表 / Scenarios =====================
 * 2026 年为基础数据（data.js）；其他年份在此基础上逐项覆盖。
 * 字段：actors 国家属性覆盖；inv 装备存量；part 并入某国的地区；occ 被占领地区 [占领者, 抵抗]；vassal 附庸/殖民地；
 * blocs/econ/econNames/treaties/forces/rel/flash/agenda/elections 各类表格；wars 初始战争 [a,b,开始回合]；fronts 初始战线；
 * sanctions [发起,目标,种类,等级]；infl [a,b,影响力]；mob 初始动员；core 核心利益；milDrag 军费对经济的拖累系数。
 * 核心利益 core：{id, o 所有者, type, loc/t, w 权重1-3, rival 仅对竞争对手生效, theater 必要时进攻的地区}
 *   type: forces_in 外国军队进驻 loc；pact_with 与 t 缔结同盟/驻军协定；attack 攻击 t；blockade 封锁 t；
 *         nuke_program t 拥核或接近拥核；arms_to 向 t 大规模军援；embargo 对所有者实施能源禁运或全面制裁
 */
const SCENARIOS = {};
(() => {
  const west = ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'IBE', 'POL', 'NOR', 'BNL', 'CEU', 'BAL', 'BLT', 'JPN', 'AUS', 'OCE'];
  const sanctions = [];
  for (const w of west) { sanctions.push([w, 'RUS', 'econ', ['USA', 'GBR', 'CAN', 'DEU', 'FRA', 'POL', 'BLT', 'NOR'].includes(w) ? 3 : 2]); sanctions.push([w, 'BLR', 'econ', 2]); }
  sanctions.push(['USA', 'RUS', 'fin', 1], ['KOR', 'RUS', 'econ', 1], ['USA', 'IRN', 'econ', 3], ['USA', 'IRN', 'fin', 1]);
  for (const w of ['GBR', 'FRA', 'DEU', 'ITA', 'IBE', 'BNL', 'NOR', 'POL', 'CEU', 'BAL', 'BLT']) sanctions.push([w, 'IRN', 'econ', 2]);
  for (const w of ['USA', 'JPN', 'KOR', 'AUS']) sanctions.push([w, 'PRK', 'econ', 3]);
  sanctions.push(['USA', 'CHN', 'tech', 1], ['USA', 'CHN', 'tariff', 1], ['CHN', 'USA', 'tariff', 1], ['CHN', 'USA', 'tech', 1], ['NOR', 'CHN', 'tech', 1], ['BNL', 'CHN', 'tech', 1], ['JPN', 'CHN', 'tech', 1]);
  SCENARIOS['2026'] = {
    id: '2026', year: 2026, q: 4, era: 'modern', order: 0, mcap: 0.15, procK: { t: 0.17, a: 0.18, s: 0.2 },
    ind: { USA:[79,930,.04,.25],CHN:[1005,213,.03,.3],RUS:[71,540,.03,.3],IND:[149,29,.015,.15],JPN:[84,.5,.03,.25],DEU:[37,1.6,.03,.2],GBR:[4,35,.03,.2],FRA:[10,.6,.03,.2],ITA:[20,5,.03,.2],IBE:[13,.2,.03,.15],BRA:[34,170,.02,.12],CAN:[12,280,.03,.15],AUS:[5.5,20,.03,.15],MEX:[16,90,.02,.1],KOR:[64,0,.07,.25],TUR:[37,5,.04,.2],ASN:[30,90,.02,.12],BNL:[13,.5,.03,.15],GLF:[10,1050,.03,.15],POL:[7,1,.04,.2],CEU:[15,1.5,.03,.15],TWN:[20,0,.07,.25],NOR:[9,90,.05,.15],ISR:[0,0,.08,.3],SCO:[5,45,.02,.1],AND:[2,105,.02,.1],SAS:[8,0,.01,.1],BAL:[7,4,.03,.12],SAF:[5,55,.01,.1],PAK:[5,4,.015,.15],EGY:[10,30,.02,.12],WAF:[2,85,.005,.08],CAS:[10,110,.015,.1],MAG:[6,140,.015,.12],IRN:[31,190,.04,.25],LEV:[2,230,.02,.1],UKR:[7.5,2,.045,.3],EAF:[1,5,.006,.08],CAF:[0,30,.005,.08],CAM:[2,15,.01,.08],BLR:[2.5,1.7,.04,.2],CAU:[1,33,.03,.12],OCE:[.5,1,.02,.1],BLT:[0,0,.04,.15],MNG:[0,1,.02,.08],PRK:[1,0,.12,.3] }, // 钢产量(百万吨)、原油产量(百万吨)、最高动员率、可吸收军费峰值（占GDP）
    title: ['2026 · 当今世界', '2026 · The world today'],
    blurb: ['以 2026 年公开的军力与经济数据为起点：俄乌战争仍在继续，中美竞争加剧，中东与朝鲜半岛局势紧张。', 'Starts from public 2026 military and economic data: the Russia–Ukraine war goes on, US–China rivalry sharpens, and the Middle East and Korea stay tense.'],
    actors: {}, inv: INV,
    blocs: BLOCS, econ: ECON, econNames: ECON_NAMES, tradeBlocs: ['EU', 'USMCA'], treaties: TREATIES, forces: FORCES0, rel: REL, flash: FLASHPOINTS, agenda: AGENDA, elections: ELECTIONS,
    part: {}, occ: {}, vassal: {},
    mob: { RUS: 1, UKR: 2 },
    wars: [['RUS', 'UKR', -15]],
    fronts: [{ att: 'RUS', target: 'UKR', from: 'RUS', v: [0.55, 0, 0.55], kind: 'land', phase: 'land', progress: 19, turns: 15, hist: [18, 18, 19, 19], last: 0.3 }],
    sanctions,
    infl: [['USA', 'CAM', 30], ['USA', 'MEX', 25], ['CHN', 'ASN', 20], ['CHN', 'CAF', 18], ['CHN', 'SAS', 18], ['CHN', 'CAS', 20], ['RUS', 'CAS', 30], ['RUS', 'BLR', 60], ['RUS', 'CAU', 15], ['FRA', 'WAF', 10], ['RUS', 'WAF', 15], ['GLF', 'EGY', 20], ['IND', 'SAS', 25], ['USA', 'TWN', 35], ['IRN', 'LEV', 25], ['TUR', 'CAU', 18], ['CHN', 'PRK', 35], ['USA', 'ISR', 30], ['USA', 'SCO', 15], ['CHN', 'AND', 12], ['CHN', 'EAF', 15], ['CHN', 'SAF', 15], ['AUS', 'OCE', 25]],
    aggr0: { USA: 40, RUS: 70, CHN: 35, ISR: 55, IRN: 50, PRK: 70, TUR: 40, IND: 30, PAK: 35, GLF: 30 },
    doct: { RUS: 0.55, PRK: 0.75, PAK: 0.6, ISR: 0.6, IND: 0.25, CHN: 0.3, USA: 0.35, GBR: 0.3, FRA: 0.4 },
    milDrag: 1,
    startNote: { RUS: 'u.startwar', UKR: 'u.startwar' },
    core: [
      { id: 'cn_twn_forces', o: 'CHN', type: 'forces_in', loc: 'TWN', w: 3 },
      { id: 'cn_twn_pact', o: 'CHN', type: 'pact_with', t: 'TWN', w: 3 },
      { id: 'cn_twn_arms', o: 'CHN', type: 'arms_to', t: 'TWN', w: 1 },
      { id: 'cn_prk', o: 'CHN', type: 'attack', t: 'PRK', w: 2 },
      { id: 'cn_block', o: 'CHN', type: 'blockade', t: 'CHN', w: 3 },
      { id: 'ru_ukr_forces', o: 'RUS', type: 'forces_in', loc: 'UKR', w: 3 },
      { id: 'ru_ukr_pact', o: 'RUS', type: 'pact_with', t: 'UKR', w: 3 },
      { id: 'ru_blr_forces', o: 'RUS', type: 'forces_in', loc: 'BLR', w: 3 },
      { id: 'ru_blr_attack', o: 'RUS', type: 'attack', t: 'BLR', w: 3 },
      { id: 'ru_near', o: 'RUS', type: 'forces_in', loc: ['CAS', 'CAU'], w: 2, rival: true },
      { id: 'us_hemi', o: 'USA', type: 'forces_in', loc: ['CAM', 'MEX', 'CAN', 'AND', 'SCO', 'BRA'], w: 3, rival: true },
      { id: 'us_twn', o: 'USA', type: 'attack', t: 'TWN', w: 2 },
      { id: 'us_isr', o: 'USA', type: 'attack', t: 'ISR', w: 2 },
      { id: 'us_gulf', o: 'USA', type: 'blockade', t: 'GLF', w: 2 },
      { id: 'in_sas', o: 'IND', type: 'forces_in', loc: 'SAS', w: 2, rival: true },
      { id: 'il_iran', o: 'ISR', type: 'nuke_program', t: 'IRN', w: 3 },
      { id: 'ir_lev', o: 'IRN', type: 'forces_in', loc: 'LEV', w: 2, rival: true },
      { id: 'tr_cau', o: 'TUR', type: 'attack', t: 'CAU', w: 2 },
      { id: 'jp_twn', o: 'JPN', type: 'attack', t: 'TWN', w: 2 },
      { id: 'gf_block', o: 'GLF', type: 'blockade', t: 'GLF', w: 3 },
      { id: 'au_oce', o: 'AUS', type: 'forces_in', loc: 'OCE', w: 2, rival: true },
      { id: 'pk_cas', o: 'PAK', type: 'forces_in', loc: 'CAS', w: 1, rival: true },
    ],
  };
})();
