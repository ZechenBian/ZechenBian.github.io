// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 精细战区 · 中国战场（1939 年 10 月起） =====================
 * 区格中心取真实城镇坐标；控制关系按 1939 年 10 月的接触线（research/china_geo.md：front_1939_10）。
 * 第 11 列为人口（百万，约数），用于根据地、征兵与征粮。
 * 史料：research/china_geo.md、china_nra.md、ccp.md（Hsu & Chang《中日战争史》、van de Ven、Mitter、Peattie/Drea/van de Ven《中国之战》、
 *       《中国共产党历史》、Van Slyke《剑桥中华民国史》、Benton《新四军》及其引用的维基条目）。
 */
var TH_DATA = TH_DATA || {};
TH_DATA.C = {
  id: 'C', name: ['中国战场', 'China theater'],
  bbox: [73.5, 17.5, 136.5, 53.8],
  pool: { CHN: { CHN: 1 }, CCP: { CCP: 1, CHN: 1 }, JPN: { PRK: 1, KOR: 1, CHN: 1, TWN: 0.3, JPN: 0.3 }, RUS: { RUS: 0.1, MNG: 1 }, MNG: { MNG: 1 }, USA: { CHN: 1 }, GBR: { CHN: 1 } },
  start: '1939-10-01',
  china: true, // 启用敌后根据地、游击、扫荡、伪军、统一战线（engine/10c_th_china.js）
  warLock: [['JPN', 'CHN', 99], ['JPN', 'CCP', 99]], // 精细战区打开时，AI 不会让中日战争在僵持中“调停停火”（历史上重庆始终拒绝议和）
  /* 战线进度：日军占领的“胜利点”÷ 总数 ÷ 1.45（开局约 36，与战略层一致）；重庆失守且失地八成才会屈服 */
  capThr: { CHN: 1.45 }, capRule: { CHN: { vp: 0.8, vpWeak: 0.65 } },
  /* 历史上的作战（AI 的先验，玩家不受约束）：y/q 年季，ph 作战阶段（每段 15 天），ag 参战集团（KW 关东军 NC 华北 CC 华中 SC 华南），n 师团数，
   * axis 突进轴线，obj 目标，hold 打下后坚守（1=目标本身，或区格列表；0=打了就撤），land 两栖登陆区格（from 出发港）。 */
  ops: {
    JPN: [
      { id: 'nanning', y: 1939, q: 4, ph: [3, 6], ag: ['SC'], n: 4, from: 'GHN', land: 'GZJ', axis: ['GZJ', 'GNN'], obj: 'GNN', hold: 1, src: '桂南会战：1939 年 11 月第 5 师团等在钦州湾登陆，24 日占南宁，切断桂越国际交通线；随后昆仑关激战' },
      { id: 'nanning_out', y: 1940, q: 4, ph: [1, 3], leave: ['GNN', 'GZJ'], to: 'GHN', src: '1940 年 9 月日军进驻越北后，10—11 月撤出南宁、钦州' },
      { id: 'zaoyi', y: 1940, q: 2, ph: [2, 6], ag: ['CC'], n: 8, axis: ['CJM', 'CYC'], obj: 'CYC', hold: ['CYC', 'CJM'], src: '枣宜会战：1940 年 5—6 月第 11 军进攻枣阳、宜昌，张自忠殉国；6 月 12 日宜昌失守，日军据以轰炸重庆' },
      { id: 'yunan', y: 1941, q: 1, ph: [2, 3], ag: ['CC'], n: 5, axis: ['CXY', 'WNY'], obj: 'WNY', hold: 0, src: '豫南会战：1941 年 1—2 月，日军攻入豫南后撤回' },
      { id: 'shanggao', y: 1941, q: 1, ph: [5, 6], ag: ['CC'], n: 4, axis: ['CNC', 'CXS'], obj: 'CXS', hold: 0, src: '上高会战：1941 年 3 月，日军第 33、34 师团等进攻赣西北受挫' },
      { id: 'zhongyuan', y: 1941, q: 2, ph: [2, 4], ag: ['NC'], n: 8, axis: ['STL', 'SZT'], obj: 'SZT', hold: 1, src: '中原会战（中条山战役）：1941 年 5 月，日军围攻中条山，国军损失七万余人，晋南根据地丧失' },
      { id: 'changsha2', y: 1941, q: 3, ph: [5, 6], ag: ['CC'], n: 6, axis: ['CYY', 'CCS'], obj: 'CCS', hold: 0, src: '第二次长沙会战：1941 年 9—10 月，日军一度攻入长沙后撤回' },
      { id: 'changsha3', y: 1941, q: 4, ph: [6, 6], ag: ['CC'], n: 5, axis: ['CYY', 'CCS'], obj: 'CCS', hold: 0, src: '第三次长沙会战：1941 年 12 月—1942 年 1 月，薛岳“天炉战法”击退日军' },
      { id: 'zhegan', y: 1942, q: 2, ph: [2, 6], ag: ['CC', 'SC', 'NC'], n: 8, axis: ['JHZ', 'CJH', 'CSR'], obj: 'CSR', hold: 0, src: '浙赣会战：1942 年 5—9 月，杜立特空袭后日军破坏浙赣线机场，屠杀报复，然后撤回' },
      { id: 'exi', y: 1943, q: 2, ph: [2, 4], ag: ['CC'], n: 5, axis: ['CJZ', 'CYC', 'CES'], obj: 'CES', hold: 0, src: '鄂西会战：1943 年 5—6 月，石牌保卫战' },
      { id: 'changde', y: 1943, q: 4, ph: [3, 6], ag: ['CC'], n: 6, axis: ['CYY', 'CCD'], obj: 'CCD', hold: 0, src: '常德会战：1943 年 11—12 月，第 57 师死守常德' },
      { id: 'ichigo1', y: 1944, q: 2, ph: [1, 5], ag: ['NC', 'CC'], n: 11, axis: ['HKF', 'WZZ', 'WLY'], obj: 'WLY', hold: ['WZZ', 'WLY'], src: '一号作战·河南会战：1944 年 4—5 月，汤恩伯部溃败，洛阳失守' },
      { id: 'ichigo2', y: 1944, q: 2, ph: [3, 6], ag: ['CC'], n: 11, axis: ['CYY', 'CCS', 'CHY'], obj: 'CHY', hold: ['CCS', 'CHY'], src: '一号作战·长衡会战：1944 年 6—8 月，长沙失守，衡阳守军苦战 47 天' },
      { id: 'ichigo_out', y: 1945, q: 2, ph: [2, 6], leave: ['GNN', 'GLZ', 'GGL', 'XDS'], to: 'CHY', src: '1945 年 5 月起日军收缩兵力，撤出广西' },
      { id: 'ichigo3', y: 1944, q: 4, ph: [1, 6], ag: ['CC', 'SC'], n: 11, axis: ['CHY', 'GGL', 'GLZ', 'XDS'], obj: 'GLZ', hold: ['GGL', 'GLZ'], src: '一号作战·桂柳会战：1944 年 9—12 月，桂林、柳州失守，日军前锋到达贵州独山' },
    ],
    CHN: [
      { id: 'winter', y: 1939, q: 4, ph: [5, 6], r: 0.7, targets: ['STL', 'HKF', 'CXY', 'CJM', 'CYY', 'CJJ', 'CAQ', 'GGZ', 'GNN'], src: '冬季攻势：1939 年 12 月起，国军在各战区发动的全面反攻，持续到次年 3 月，收效有限' },
      { id: 'winter2', y: 1940, q: 1, ph: [1, 3], r: 0.75, targets: ['STL', 'CXY', 'CJM', 'CYY', 'CJJ', 'GNN'], src: '冬季攻势（续）与昆仑关战役' },
      { id: 'counter45', y: 1945, q: 2, ph: [2, 6], r: 0.9, targets: ['GNN', 'GLZ', 'GGL', 'CZJ', 'XDS'], src: '1945 年夏国军反攻桂柳' },
    ],
  },
  zones: [
    // [id, 中文名, English, 地区, 经度, 纬度, 地形, 工事, VP, 标志, 人口(百万)]
    // —— 东北（伪满洲国） ——
    ['MHB', '哈尔滨（北满）', 'Harbin (N. Manchuria)', 'CHN', 126.6, 45.8, 'plain', 0, 3, 'hub', 9],
    ['MQQ', '齐齐哈尔—黑龙江', 'Qiqihar–Heilongjiang', 'CHN', 124.0, 47.6, 'plain', 0, 1, '', 5],
    ['MMD', '牡丹江—东满', 'Mudanjiang (E. Manchuria)', 'CHN', 129.8, 44.6, 'forest', 1, 1, '', 4],
    ['MCC', '长春（新京）', 'Changchun (Hsinking)', 'CHN', 125.3, 43.9, 'plain', 0, 3, 'hub', 8],
    ['MSY', '沈阳（奉天）', 'Shenyang (Mukden)', 'CHN', 123.4, 41.8, 'urban', 0, 4, 'hub', 12],
    ['MDL', '大连—旅顺（关东州）', 'Dalian–Port Arthur', 'CHN', 121.6, 39.0, 'urban', 1, 2, 'port', 2],
    ['MRH', '热河（承德）', 'Jehol (Chengde)', 'CHN', 118.0, 41.2, 'mount', 0, 1, '', 4],
    ['MJZ', '锦州—辽西', 'Jinzhou (W. Liaoning)', 'CHN', 121.1, 41.1, 'plain', 0, 1, '', 4],
    ['MXA', '兴安—呼伦贝尔（海拉尔）', 'Xing’an–Hulunbuir (Hailar)', 'CHN', 119.7, 49.0, 'plain', 1, 0, '', 1],
    // —— 内蒙古（“蒙疆”） ——
    ['NZJ', '张家口（察南）', 'Kalgan (S. Chahar)', 'CHN', 114.9, 40.8, 'hills', 0, 2, '', 3],
    ['NDT', '大同—晋北', 'Datong (N. Shanxi)', 'CHN', 113.3, 40.0, 'hills', 0, 1, '', 3],
    ['NSY', '归绥—包头（绥远）', 'Guisui–Baotou (Suiyuan)', 'CHN', 110.9, 40.7, 'plain', 0, 1, '', 2],
    ['NXL', '锡林郭勒—察北', 'Xilingol (N. Chahar)', 'CHN', 115.5, 43.2, 'plain', 0, 0, '', 0.5],
    ['NHT', '河套（五原—陕坝）', 'Hetao (Wuyuan–Shanba)', 'CHN', 107.6, 40.8, 'plain', 0, 0, '', 1],
    // —— 华北 ——
    ['HPJ', '北平—天津', 'Peiping–Tientsin', 'CHN', 116.8, 39.5, 'urban', 0, 8, 'port hub', 12],
    ['HJD', '冀东（唐山—遵化）', 'E. Hebei (Tangshan)', 'CHN', 118.6, 40.0, 'plain', 0, 1, '', 6],
    ['HBD', '保定—冀中', 'Baoding–Central Hebei', 'CHN', 115.8, 38.6, 'plain', 0, 2, '', 10],
    ['HSJ', '石家庄—正定', 'Shijiazhuang', 'CHN', 114.6, 38.0, 'plain', 0, 2, 'hub', 6],
    ['HFP', '阜平—五台山（北岳）', 'Fuping–Wutai (Beiyue)', 'CHN', 114.0, 39.0, 'mount', 0, 0, '', 3],
    ['HXT', '冀南（邢台—邯郸）', 'S. Hebei (Xingtai–Handan)', 'CHN', 115.0, 36.9, 'plain', 0, 1, '', 9],
    ['HCZ', '沧州—冀鲁边', 'Cangzhou (Hebei–Shandong border)', 'CHN', 116.9, 38.1, 'plain', 0, 1, '', 6],
    ['HDZ', '德州—鲁西北', 'Dezhou (NW Shandong)', 'CHN', 116.2, 37.1, 'plain', 0, 1, '', 7],
    ['SJN', '济南', 'Jinan', 'CHN', 117.2, 36.6, 'urban', 0, 3, 'hub', 6],
    ['SQD', '青岛—胶东', 'Tsingtao–Jiaodong', 'CHN', 120.4, 36.7, 'hills', 0, 3, 'port', 9],
    ['SYM', '沂蒙山区（鲁中）', 'Yimeng Mountains (C. Shandong)', 'CHN', 118.2, 35.8, 'mount', 0, 0, '', 7],
    ['SLN', '鲁南（临沂—台儿庄）', 'S. Shandong (Linyi)', 'CHN', 117.8, 34.9, 'hills', 0, 1, '', 7],
    ['SXZ', '徐州', 'Xuzhou', 'CHN', 117.2, 34.2, 'plain', 0, 3, 'hub', 6],
    ['HKF', '开封—豫东', 'Kaifeng (E. Henan)', 'CHN', 115.0, 34.6, 'plain', 0, 2, '', 8],
    ['HHF', '黄泛区', 'Yellow River flood zone', 'CHN', 114.6, 33.7, 'marsh', 0, 0, '', 3],
    ['HXX', '新乡—安阳（豫北）', 'Xinxiang–Anyang (N. Henan)', 'CHN', 114.1, 35.6, 'plain', 0, 1, '', 7],
    ['STY', '太原—晋中', 'Taiyuan (C. Shanxi)', 'CHN', 112.6, 37.6, 'hills', 0, 3, 'hub', 5],
    ['SXB', '晋西北（兴县）', 'NW Shanxi (Xingxian)', 'CHN', 111.3, 38.7, 'mount', 0, 0, '', 2],
    ['SLL', '吕梁—晋西（隰县—吉县）', 'Lüliang (W. Shanxi)', 'CHN', 111.0, 36.7, 'mount', 0, 0, '', 2],
    ['SCZ', '晋东南（长治—太行）', 'SE Shanxi (Changzhi–Taihang)', 'CHN', 113.3, 36.5, 'mount', 0, 1, '', 5],
    ['STL', '晋南（临汾—运城）', 'S. Shanxi (Linfen–Yuncheng)', 'CHN', 111.3, 35.5, 'plain', 0, 1, '', 5],
    ['SZT', '中条山（垣曲）', 'Zhongtiao Mountains', 'CHN', 112.0, 35.15, 'mount', 1, 0, '', 2],
    // —— 西北 ——
    ['WXA', '西安—关中', 'Xi’an (Guanzhong)', 'CHN', 108.9, 34.3, 'plain', 1, 5, 'hub dep', 8],
    ['WTG', '潼关—灵宝', 'Tongguan–Lingbao', 'CHN', 110.6, 34.5, 'hills', 1, 0, '', 2],
    ['WLY', '洛阳—豫西', 'Luoyang (W. Henan)', 'CHN', 112.4, 34.6, 'hills', 0, 2, 'hub', 6],
    ['WZZ', '郑州—许昌（豫中）', 'Zhengzhou–Xuchang', 'CHN', 113.6, 34.3, 'plain', 0, 2, 'hub', 9],
    ['WNY', '南阳—豫西南', 'Nanyang (SW Henan)', 'CHN', 112.5, 33.0, 'plain', 0, 1, '', 7],
    ['WHZ', '汉中—陕南', 'Hanzhong (S. Shaanxi)', 'CHN', 107.4, 33.0, 'mount', 0, 1, '', 4],
    ['WBJ', '宝鸡—天水', 'Baoji–Tianshui', 'CHN', 106.4, 34.5, 'mount', 0, 1, '', 4],
    ['WPL', '平凉—陇东', 'Pingliang (E. Gansu)', 'CHN', 106.6, 35.4, 'hills', 0, 0, '', 3],
    ['WYL', '榆林—陕北北部', 'Yulin (N. Shaanxi)', 'CHN', 109.7, 38.4, 'hills', 0, 0, '', 1],
    ['WLZ', '兰州—甘肃', 'Lanzhou (Gansu)', 'CHN', 103.8, 36.1, 'hills', 0, 2, 'dep', 5],
    ['WNX', '宁夏（银川）', 'Ningxia (Yinchuan)', 'CHN', 106.3, 38.5, 'plain', 0, 1, '', 1],
    ['WQH', '青海（西宁）', 'Qinghai (Xining)', 'CHN', 100.5, 36.2, 'mount', 0, 0, '', 1.5],
    ['WHX', '河西走廊（酒泉）', 'Hexi Corridor (Jiuquan)', 'CHN', 98.0, 39.8, 'plain', 0, 0, '', 1],
    ['WXJ', '新疆（迪化）', 'Xinjiang (Dihua)', 'CHN', 87.6, 43.8, 'plain', 0, 1, '', 4],
    ['WTB', '西藏（拉萨）', 'Tibet (Lhasa)', 'CHN', 90.0, 31.5, 'mount', 0, 0, 'x', 1],
    ['WXK', '西康（康定）', 'Xikang (Kangding)', 'CHN', 100.5, 30.5, 'mount', 0, 0, '', 2],
    // —— 陕甘宁边区（中共） ——
    ['YYA', '延安（陕甘宁边区首府）', 'Yan’an (Border Region capital)', 'CCP', 109.5, 36.6, 'hills', 1, 3, 'cap dep', 0.6],
    ['YQY', '陇东（庆阳）—三边', 'Longdong (Qingyang)–Sanbian', 'CCP', 107.5, 36.9, 'hills', 0, 0, '', 0.5],
    ['YSD', '绥德—米脂', 'Suide–Mizhi', 'CCP', 110.2, 37.5, 'hills', 0, 0, '', 0.4],
    // —— 华中 ——
    ['CWH', '武汉', 'Wuhan', 'CHN', 114.3, 30.6, 'urban', 0, 8, 'hub port', 6],
    ['CXY', '信阳—豫南', 'Xinyang (S. Henan)', 'CHN', 114.1, 32.1, 'hills', 0, 1, '', 5],
    ['CXF', '襄樊—老河口（鄂北）', 'Xiangfan–Laohekou (N. Hubei)', 'CHN', 112.0, 32.2, 'plain', 0, 2, '', 5],
    ['CSZ', '随县—枣阳（大洪山）', 'Suixian–Zaoyang (Dahong Shan)', 'CHN', 113.0, 31.8, 'hills', 0, 0, '', 4],
    ['CYC', '宜昌（三峡门户）', 'Yichang (Gorges gateway)', 'CHN', 111.2, 30.8, 'hills', 1, 3, 'port', 3],
    ['CJZ', '沙市—荆州（江陵）', 'Shashi–Jingzhou', 'CHN', 112.2, 30.3, 'plain', 0, 1, '', 5],
    ['CJM', '荆门—钟祥', 'Jingmen–Zhongxiang', 'CHN', 112.6, 31.1, 'plain', 0, 0, '', 3],
    ['CDB', '大别山（立煌）', 'Dabie Mountains', 'CHN', 115.8, 31.3, 'mount', 0, 0, '', 6],
    ['CHF', '合肥—皖中', 'Hefei (C. Anhui)', 'CHN', 117.3, 31.9, 'plain', 0, 1, '', 7],
    ['CBB', '蚌埠—淮北', 'Bengbu (Huaibei)', 'CHN', 117.3, 33.1, 'plain', 0, 1, '', 8],
    ['CAQ', '安庆—皖西南', 'Anqing (SW Anhui)', 'CHN', 116.9, 30.5, 'hills', 0, 1, 'port', 4],
    ['CJJ', '九江—赣北', 'Jiujiang (N. Jiangxi)', 'CHN', 116.0, 29.7, 'hills', 0, 1, 'port', 3],
    ['CNC', '南昌', 'Nanchang', 'CHN', 115.9, 28.6, 'plain', 0, 2, '', 5],
    ['CXS', '修水—幕阜山（赣西北）', 'Xiushui–Mufu Mountains', 'CHN', 114.5, 28.9, 'mount', 0, 0, '', 3],
    ['CYY', '岳阳—湘北', 'Yueyang (N. Hunan)', 'CHN', 113.2, 29.4, 'hills', 0, 1, '', 4],
    ['CCS', '长沙', 'Changsha', 'CHN', 113.0, 28.2, 'plain', 1, 4, 'hub', 6],
    ['CCD', '常德—洞庭湖区', 'Changde (Dongting Lake)', 'CHN', 111.7, 29.0, 'marsh', 0, 1, '', 6],
    ['CHY', '衡阳', 'Hengyang', 'CHN', 112.6, 26.9, 'hills', 0, 3, 'hub dep', 6],
    ['CZJ', '芷江—湘西（雪峰山）', 'Zhijiang (W. Hunan)', 'CHN', 110.0, 27.4, 'mount', 0, 1, '', 4],
    ['CES', '恩施—鄂西', 'Enshi (W. Hubei)', 'CHN', 109.6, 30.3, 'mount', 0, 0, '', 3],
    ['CGZ', '赣州—赣南', 'Ganzhou (S. Jiangxi)', 'CHN', 115.0, 25.9, 'mount', 0, 1, '', 4],
    ['CSR', '上饶—赣东北', 'Shangrao (NE Jiangxi)', 'CHN', 117.8, 28.5, 'hills', 0, 1, '', 4],
    ['CJH', '金华—衢州（浙赣路）', 'Jinhua–Quzhou', 'CHN', 119.4, 29.1, 'hills', 0, 1, '', 5],
    ['CWN', '皖南（屯溪—泾县）', 'S. Anhui (Tunxi–Jingxian)', 'CHN', 118.2, 30.2, 'mount', 0, 0, '', 3],
    // —— 华东 ——
    ['JNJ', '南京—芜湖', 'Nanking–Wuhu', 'CHN', 118.6, 31.8, 'urban', 0, 5, 'hub port', 5],
    ['JSH', '上海—苏南（苏州—无锡）', 'Shanghai–S. Jiangsu', 'CHN', 121.0, 31.3, 'urban', 0, 8, 'port hub', 10],
    ['JHZ', '杭州—嘉兴（浙北）', 'Hangzhou–Jiaxing (N. Zhejiang)', 'CHN', 120.2, 30.5, 'plain', 0, 2, '', 6],
    ['JSZ', '苏中（扬州—泰州—南通）', 'C. Jiangsu (Yangzhou–Taizhou)', 'CHN', 120.0, 32.5, 'marsh', 0, 1, '', 8],
    ['JSB', '苏北（盐城—淮安）', 'N. Jiangsu (Yancheng–Huai’an)', 'CHN', 119.6, 33.7, 'marsh', 0, 1, '', 9],
    ['JND', '浙东（宁波—绍兴）', 'E. Zhejiang (Ningbo–Shaoxing)', 'CHN', 121.0, 29.8, 'hills', 0, 1, 'port', 6],
    ['JWZ', '温州—浙南', 'Wenzhou (S. Zhejiang)', 'CHN', 120.4, 28.0, 'mount', 0, 1, 'port', 4],
    // —— 华南 ——
    ['FFZ', '福州—闽北', 'Foochow (N. Fujian)', 'CHN', 119.0, 26.3, 'mount', 0, 2, 'port', 5],
    ['FXM', '厦门—闽南（漳州—泉州）', 'Amoy–S. Fujian', 'CHN', 117.8, 24.9, 'hills', 0, 1, 'port', 6],
    ['GGZ', '广州—珠江三角洲', 'Canton (Pearl River Delta)', 'CHN', 113.3, 23.0, 'urban', 0, 6, 'port hub', 10],
    ['GSG', '韶关—粤北', 'Shaoguan (N. Guangdong)', 'CHN', 113.6, 24.9, 'mount', 0, 1, '', 4],
    ['GST', '汕头—潮汕', 'Swatow (Chaoshan)', 'CHN', 116.5, 23.6, 'hills', 0, 1, 'port', 5],
    ['GZJ', '粤西—雷州', 'W. Guangdong (Leizhou)', 'CHN', 110.6, 21.9, 'plain', 0, 0, 'port', 4],
    ['GHN', '海南', 'Hainan', 'CHN', 109.8, 19.2, 'hills', 0, 1, 'port', 2.5],
    ['GNN', '南宁—桂南（昆仑关）', 'Nanning (S. Guangxi)', 'CHN', 108.4, 22.9, 'hills', 0, 2, '', 4],
    ['GGL', '桂林—桂北', 'Kweilin (N. Guangxi)', 'CHN', 110.3, 25.3, 'mount', 0, 3, 'dep', 4],
    ['GLZ', '柳州—桂中', 'Liuzhou (C. Guangxi)', 'CHN', 109.4, 24.3, 'hills', 0, 2, 'hub', 4],
    ['GBS', '百色—桂西', 'Baise (W. Guangxi)', 'CHN', 106.6, 23.9, 'mount', 0, 0, '', 2],
    // —— 西南（大后方） ——
    ['XCQ', '重庆—川东（陪都）', 'Chungking (wartime capital)', 'CHN', 106.6, 29.6, 'hills', 1, 12, 'cap dep hub', 15],
    ['XCD', '成都—川西', 'Chengtu (W. Sichuan)', 'CHN', 104.1, 30.7, 'plain', 0, 5, 'dep', 15],
    ['XWX', '万县—川东北（夔门）', 'Wanxian (Kuimen gorge)', 'CHN', 108.4, 30.9, 'mount', 1, 1, '', 6],
    ['XYB', '宜宾—泸州（川南）', 'Yibin–Luzhou (S. Sichuan)', 'CHN', 105.1, 28.9, 'hills', 0, 1, '', 8],
    ['XGZ', '广元—川北', 'Guangyuan (N. Sichuan)', 'CHN', 105.8, 32.3, 'mount', 0, 0, '', 4],
    ['XGY', '贵阳—黔中', 'Kweiyang (C. Guizhou)', 'CHN', 106.7, 26.6, 'mount', 0, 2, '', 5],
    ['XZY', '遵义—黔北', 'Zunyi (N. Guizhou)', 'CHN', 106.9, 27.8, 'mount', 0, 0, '', 3],
    ['XDS', '独山—黔南', 'Dushan (S. Guizhou)', 'CHN', 107.5, 25.8, 'mount', 0, 0, '', 2],
    ['XKM', '昆明—滇中', 'Kunming (C. Yunnan)', 'CHN', 102.7, 25.0, 'hills', 0, 4, 'dep hub', 5],
    ['XDL', '大理—滇西（保山）', 'Dali–Baoshan (W. Yunnan)', 'CHN', 100.0, 25.3, 'mount', 0, 0, '', 3],
    ['XMZ', '蒙自—滇南（河口）', 'Mengzi (S. Yunnan)', 'CHN', 103.4, 23.4, 'mount', 0, 0, '', 2],
    // —— 周边 ——
    ['AHN', '法属印度支那北部（河内—海防）', 'N. French Indochina (Hanoi–Haiphong)', 'ASN', 105.8, 21.0, 'plain', 0, 0, 'port', 0],
    ['ABM', '缅甸（腊戍—曼德勒）', 'Burma (Lashio–Mandalay)', 'ASN', 97.0, 22.6, 'hills', 0, 0, '', 0],
    ['KNK', '朝鲜北部（平壤—新义州）', 'N. Korea (Pyongyang)', 'PRK', 125.8, 39.6, 'hills', 0, 1, 'port', 0],
    ['KSK', '朝鲜南部（汉城—釜山）', 'S. Korea (Keijo–Pusan)', 'KOR', 127.5, 36.4, 'hills', 0, 1, 'port', 0],
    ['TTW', '台湾', 'Taiwan', 'TWN', 120.9, 23.8, 'hills', 0, 1, 'port', 0],
    ['OMG', '外蒙古（乌兰巴托）', 'Outer Mongolia (Ulan Bator)', 'MNG', 108.0, 47.0, 'plain', 0, 0, '', 0],
    ['RFE', '苏联远东（伯力—海参崴）', 'Soviet Far East (Khabarovsk)', 'RUS', 133.5, 47.0, 'forest', 1, 0, 'base', 0],
    ['RCA', '苏联中亚（阿拉木图）', 'Soviet Central Asia (Alma-Ata)', 'CAS', 76.9, 44.0, 'plain', 0, 0, 'base', 0],
    ['JBA', '日本本土', 'Japanese home islands', 'JPN', 136.0, 35.5, 'hills', 0, 0, 'base port dep', 0],
  ],
  /* 1939 年 10 月的实际控制（未列出的区格归所在地区的政府） */
  occ: {
    MHB: 'JPN', MQQ: 'JPN', MMD: 'JPN', MCC: 'JPN', MSY: 'JPN', MDL: 'JPN', MRH: 'JPN', MJZ: 'JPN', MXA: 'JPN',
    NZJ: 'JPN', NDT: 'JPN', NSY: 'JPN', NXL: 'JPN',
    HPJ: 'JPN', HJD: 'JPN', HBD: 'JPN', HSJ: 'JPN', HXT: 'JPN', HCZ: 'JPN', HDZ: 'JPN', SJN: 'JPN', SQD: 'JPN', SLN: 'JPN', SXZ: 'JPN', HKF: 'JPN', HXX: 'JPN', STY: 'JPN', STL: 'JPN',
    HFP: 'CCP', SXB: 'CCP', SCZ: 'CCP',
    CWH: 'JPN', CXY: 'JPN', CJM: 'JPN', CHF: 'JPN', CBB: 'JPN', CAQ: 'JPN', CJJ: 'JPN', CNC: 'JPN', CYY: 'JPN',
    JNJ: 'JPN', JSH: 'JPN', JHZ: 'JPN', JSZ: 'JPN', GGZ: 'JPN', GST: 'JPN', GHN: 'JPN',
  },
  /* 日军治安度（0–100，日占区格）与中共根据地（0–100）的初值：1939 年秋“点线”占领，根据地在华北山区与平原敌后迅速扩大 */
  jc0: { MHB: 85, MQQ: 80, MMD: 70, MCC: 90, MSY: 90, MDL: 95, MRH: 60, MJZ: 80, MXA: 70, NZJ: 65, NDT: 55, NSY: 50, NXL: 50, HPJ: 80, HJD: 45, HBD: 35, HSJ: 55, HXT: 35, HCZ: 35, HDZ: 40, SJN: 70, SQD: 55, SLN: 35, SXZ: 60, HKF: 55, HXX: 45, STY: 55, STL: 50, CWH: 75, CXY: 45, CJM: 40, CHF: 45, CBB: 45, CAQ: 45, CJJ: 50, CNC: 55, CYY: 50, JNJ: 75, JSH: 85, JHZ: 60, JSZ: 40, GGZ: 70, GST: 50, GHN: 40 },
  base0: { HFP: 70, SXB: 55, SCZ: 55, HBD: 45, HXT: 35, HJD: 20, SYM: 25, SLN: 15, HDZ: 15, HCZ: 20, STY: 15, SLL: 10, NZJ: 5, NSY: 10, JSZ: 5, CHF: 10, CBB: 10, CXY: 5, GGZ: 5, GHN: 10, YYA: 95, YQY: 85, YSD: 70 },
  /* 碉堡、封锁线的初值：东北的“集团部落”与警备网（1934—1940 年围剿抗联时建立）、各大城市周围的据点 */
  bh0: { MHB: 0.6, MQQ: 0.5, MMD: 0.7, MCC: 0.7, MSY: 0.7, MDL: 0.6, MRH: 0.5, MJZ: 0.6, MXA: 0.4, HPJ: 0.35, JSH: 0.35, JNJ: 0.3, CWH: 0.3, GGZ: 0.2, NZJ: 0.2 },
  /* 国民党敌后游击力量（冀察战区、鲁苏战区等） */
  kg0: { SYM: 40, JSB: 50, HXT: 20, HBD: 10, SLN: 25, CHF: 20, CDB: 30, JSZ: 25 },
  /* 战前已被中国军队破坏的铁路（日军需要时间修复） */
  rail0: [['CYY', 'CCS', 40], ['HKF', 'WZZ', 60], ['CJJ', 'CNC', 10]],
  /* 历史参照（research/ccp.md，中共数字）：年末八路军与新四军正规军（万人）、根据地人口（百万，含游击区）。界面上与本局对照。 */
  hist: { ccp: { 1939: [32, null], 1940: [50, 100], 1941: [44, null], 1942: [45, 50], 1943: [47, null], 1944: [78, 86], 1945: [120, 100] } },
  /* 史料（界面“史料”页） */
  src: [
    ['徐龙轩、张明凯编著《中日战争史》（Hsu Long-hsuen & Chang Ming-kai, History of the Sino-Japanese War, 1971）', '1939 年 10 月的接触线、各战区序列、历次会战（桂南、枣宜、中原、长沙、浙赣、一号作战）'],
    ['Peattie, Drea, van de Ven 编《中国之战：1937—1945 年中日战争军事史》（The Battle for China）', '日军的作战与“治安战”，国军的战力与补给'],
    ['R. 米特《被遗忘的盟友》（Mitter, Forgotten Ally）', '统一战线的摩擦与皖南事变，重庆国民政府的处境'],
    ['中共中央党史研究室《中国共产党历史》第一卷', '八路军、新四军历年兵力，百团大战，减租减息、“三三制”、精兵简政、大生产运动、整风'],
    ['L. 范斯莱克《剑桥中华民国史》第 13 卷“共产党运动”（Van Slyke）', '根据地的类型与扩张、1941—1942 年的危机与恢复（根据地人口大幅收缩，中共自己的数字是由约 1 亿降到 5000 万以下）'],
    ['G. 本顿《新四军》（Benton, New Fourth Army）', '江南与江北的新四军、北移令与皖南事变（1941 年 1 月）'],
    ['防衛研究所 戦史叢書『北支の治安戦』及 谷拓弥、岩谷將的研究', '日军对中共兵力的估计、扫荡与“囚笼政策”'],
    ['C. 约翰逊《农民民族主义与共产党政权》（Johnson, Peasant Nationalism）', '百团大战参战兵力（约翰逊统计约 115 个团，中共官方为 105 个团）与日方损失的不同估计'],
  ],
  links: [
    ['STY', 'STL', 'rail'], // 同蒲铁路经汾河谷地（介休—霍州）连接太原与临汾
    ['JBA', 'MDL', 'sea'], ['JBA', 'HPJ', 'sea'], ['JBA', 'SQD', 'sea'], ['JBA', 'JSH', 'sea'], ['JBA', 'GGZ', 'sea'], ['JBA', 'KSK', 'sea'], ['JBA', 'TTW', 'sea'], ['JBA', 'GHN', 'sea'], ['JBA', 'GST', 'sea'],
    ['TTW', 'FXM', 'sea'], ['TTW', 'FFZ', 'sea'], ['TTW', 'GGZ', 'sea'], ['TTW', 'JSH', 'sea'], ['GHN', 'GZJ', 'sea'], ['GHN', 'GGZ', 'sea'], ['GHN', 'AHN', 'sea'], ['GGZ', 'GZJ', 'sea'],
    ['JSH', 'JND', 'sea'], ['JSH', 'JWZ', 'sea'], ['SQD', 'MDL', 'sea'], ['HPJ', 'MDL', 'sea'], ['KSK', 'MDL', 'sea'], ['JSH', 'SQD', 'sea'],
  ],
  towns: {
    MHB: '哈尔滨 北满 Harbin', MQQ: '齐齐哈尔 黑龙江 嫩江 Qiqihar', MMD: '牡丹江 东宁 虎林 绥阳 Mudanjiang', MCC: '长春 新京 Changchun Hsinking', MSY: '沈阳 奉天 鞍山 本溪 Shenyang Mukden', MDL: '大连 旅顺 关东州 Dalian Port Arthur', MRH: '热河 承德 Jehol Chengde', MJZ: '锦州 山海关 辽西 Jinzhou', MXA: '海拉尔 呼伦贝尔 诺门罕 Hailar Nomonhan',
    NZJ: '张家口 宣化 察哈尔 Kalgan', NDT: '大同 雁门关 Datong', NSY: '归绥 包头 绥远 大青山 Baotou Suiyuan', NXL: '锡林郭勒 多伦 Xilingol', NHT: '河套 五原 陕坝 临河 Hetao',
    HPJ: '北平 北京 天津 塘沽 卢沟桥 丰台 Peiping Beijing Tientsin Tianjin', HJD: '冀东 唐山 遵化 滦县 Tangshan', HBD: '保定 冀中 河间 任丘 定县 Baoding', HSJ: '石家庄 正定 井陉 Shijiazhuang', HFP: '阜平 五台山 北岳 晋察冀 平型关 涞源 Fuping Wutai',
    HXT: '冀南 邢台 邯郸 南宫 Xingtai Handan', HCZ: '沧州 冀鲁边 Cangzhou', HDZ: '德州 聊城 鲁西北 Dezhou', SJN: '济南 泰安 Jinan', SQD: '青岛 胶东 烟台 潍县 Tsingtao Qingdao', SYM: '沂蒙 鲁中 沂水 Yimeng', SLN: '临沂 台儿庄 鲁南 枣庄 抱犊崮 Linyi Taierzhuang', SXZ: '徐州 Xuzhou',
    HKF: '开封 商丘 兰封 豫东 Kaifeng', HHF: '黄泛区 花园口 周口 Huayuankou', HXX: '新乡 安阳 焦作 豫北 Xinxiang Anyang', STY: '太原 榆次 阳泉 娘子关 忻口 Taiyuan', SXB: '晋西北 兴县 岢岚 晋绥 Xingxian', SLL: '吕梁 隰县 吉县 离石 克难坡 Lüliang', SCZ: '长治 武乡 辽县 黎城 太行 晋东南 涉县 Changzhi Taihang', STL: '临汾 运城 侯马 Linfen Yuncheng', SZT: '中条山 垣曲 平陆 Zhongtiao',
    WXA: '西安 关中 咸阳 Xi\'an Xian', WTG: '潼关 灵宝 风陵渡 Tongguan', WLY: '洛阳 巩县 豫西 Luoyang', WZZ: '郑州 许昌 漯河 Zhengzhou', WNY: '南阳 Nanyang', WHZ: '汉中 安康 Hanzhong', WBJ: '宝鸡 天水 Baoji', WPL: '平凉 Pingliang', WYL: '榆林 Yulin', WLZ: '兰州 甘肃 武威 Lanzhou', WNX: '宁夏 银川 Ningxia', WQH: '青海 西宁 Xining', WHX: '河西 酒泉 张掖 Jiuquan', WXJ: '新疆 迪化 乌鲁木齐 哈密 Xinjiang Urumqi', WTB: '西藏 拉萨 Tibet Lhasa', WXK: '西康 康定 雅安 Kangding',
    YYA: '延安 陕甘宁 Yan\'an Yenan', YQY: '庆阳 陇东 环县 三边 定边 靖边 Qingyang', YSD: '绥德 米脂 清涧 Suide',
    CWH: '武汉 汉口 武昌 汉阳 Wuhan Hankow', CXY: '信阳 武胜关 Xinyang', CXF: '襄樊 襄阳 樊城 老河口 Xiangyang Laohekou', CSZ: '随县 枣阳 大洪山 应山 Suixian Zaoyang', CYC: '宜昌 石牌 三斗坪 Yichang', CJZ: '沙市 荆州 江陵 Shashi', CJM: '荆门 钟祥 京山 Jingmen', CDB: '大别山 立煌 六安 Dabie', CHF: '合肥 巢县 Hefei', CBB: '蚌埠 淮南 宿县 Bengbu', CAQ: '安庆 贵池 Anqing', CJJ: '九江 湖口 德安 万家岭 Jiujiang', CNC: '南昌 奉新 Nanchang', CXS: '修水 幕阜山 高安 上高 Xiushui', CYY: '岳阳 新墙河 汨罗 临湘 Yueyang', CCS: '长沙 株洲 湘潭 浏阳 Changsha', CCD: '常德 益阳 洞庭湖 Changde', CHY: '衡阳 耒阳 Hengyang', CZJ: '芷江 雪峰山 邵阳 Zhijiang', CES: '恩施 巴东 鄂西 Enshi', CGZ: '赣州 吉安 赣南 Ganzhou', CSR: '上饶 鹰潭 景德镇 Shangrao', CJH: '金华 衢州 兰溪 Jinhua Quzhou', CWN: '皖南 屯溪 泾县 云岭 茂林 Tunxi Jingxian',
    JNJ: '南京 芜湖 浦口 镇江 Nanking Nanjing Wuhu', JSH: '上海 苏州 无锡 常州 吴淞 Shanghai Suzhou', JHZ: '杭州 嘉兴 湖州 Hangzhou', JSZ: '苏中 扬州 泰州 南通 黄桥 Yangzhou Taizhou', JSB: '苏北 盐城 淮安 淮阴 阜宁 Yancheng', JND: '浙东 宁波 绍兴 四明山 Ningbo', JWZ: '温州 丽水 Wenzhou',
    FFZ: '福州 南平 闽北 Foochow Fuzhou', FXM: '厦门 漳州 泉州 Amoy Xiamen', GGZ: '广州 佛山 虎门 珠江 Canton Guangzhou', GSG: '韶关 曲江 粤北 Shaoguan', GST: '汕头 潮州 Swatow Shantou', GZJ: '雷州 湛江 广州湾 钦州 北海 Leizhou', GHN: '海南 海口 三亚 Hainan', GNN: '南宁 昆仑关 宾阳 镇南关 Nanning Kunlun Pass', GGL: '桂林 全州 Kweilin Guilin', GLZ: '柳州 宜山 Liuzhou', GBS: '百色 Baise',
    XCQ: '重庆 陪都 Chungking Chongqing', XCD: '成都 Chengtu Chengdu', XWX: '万县 奉节 夔门 Wanxian', XYB: '宜宾 泸州 Yibin Luzhou', XGZ: '广元 绵阳 Guangyuan', XGY: '贵阳 安顺 Kweiyang Guiyang', XZY: '遵义 Zunyi', XDS: '独山 都匀 Dushan', XKM: '昆明 曲靖 Kunming', XDL: '大理 保山 下关 滇缅公路 腾冲 Dali Baoshan', XMZ: '蒙自 河口 个旧 Mengzi',
    AHN: '河内 海防 谅山 印度支那 Hanoi Haiphong', ABM: '缅甸 腊戍 曼德勒 仰光 Burma Lashio', KNK: '朝鲜 平壤 新义州 Pyongyang', KSK: '汉城 釜山 Seoul Pusan', TTW: '台湾 台北 Taiwan', OMG: '外蒙 乌兰巴托 Mongolia', RFE: '苏联远东 伯力 海参崴 Khabarovsk Vladivostok', RCA: '苏联中亚 阿拉木图 Alma-Ata', JBA: '日本 东京 Japan Tokyo',
  },
};

/* 区格的经济权重（占领区影响国力）：人口取各区格的 pop（百万）；工业为占全国近代工业产出的百分比（1936—37 年）。
 * 依据：上海约占关内近代工业的一半；东北（伪满）的鞍山钢铁、抚顺煤矿约占全国重工业的大部分；天津、青岛、武汉、广州次之；
 * 1938 年后内迁的工厂集中在重庆（兵工署各厂）、昆明与宝鸡。1939 年日占区已拥有约九成的近代工业——开局的占领状况计入基线，
 * 只有相对开局的变化才影响国力（econ 中没有列出的区格按人口给一点手工业权重）。 */
TH_DATA.C.econRegs = ['CHN'];
TH_DATA.C.econ = {
  JSH: [null, 32], HPJ: [null, 7], MSY: [null, 11], MDL: [null, 4], MCC: [null, 1.5], MHB: [null, 2], MMD: [null, 0.5], MQQ: [null, 0.5], MJZ: [null, 1], MRH: [null, 0.3],
  SQD: [null, 3], GGZ: [null, 4], CWH: [null, 4], JNJ: [null, 2], JHZ: [null, 1.5], HJD: [null, 2], STY: [null, 1.5], SJN: [null, 1], HSJ: [null, 0.8], HXX: [null, 0.7], CBB: [null, 0.7],
  JSZ: [null, 0.5], JSB: [null, 0.5], XCQ: [null, 3], XCD: [null, 0.8], XKM: [null, 1], XMZ: [null, 0.5], CCS: [null, 0.7], CHY: [null, 0.4], WXA: [null, 0.6], WZZ: [null, 0.5], WLY: [null, 0.6],
  FXM: [null, 0.5], FFZ: [null, 0.5], JND: [null, 0.8], GST: [null, 0.5], WLZ: [null, 0.3], XGY: [null, 0.3], GLZ: [null, 0.3], GGL: [null, 0.3], CYC: [null, 0.3], CXF: [null, 0.2], WBJ: [null, 0.3],
};
