// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===================== 精细战区 · 西线（1939–1940，可延续到 1944） =====================
 * 区格中心取真实城镇坐标（经纬度），区格形状、相邻关系、河流过境与铁路由 tools/thgeo.mjs 按真实地理生成（45_th_geo.js）。
 * 地形：plain 平原 · hills 丘陵 · forest 森林丘陵 · mount 山地 · marsh 沼泽/圩田 · urban 城市工业区
 * 工事：0 无 · 1 野战工事/轻型碉堡 · 2 坚固碉堡线 · 3 永备要塞（马奇诺主防线、列日第一环、阿尔卑斯防线）
 * 史料：research/west_geo.md、research/west_oob.md（Frieser《闪电战神话》、Jackson《法国的沦陷》、Doughty、Kaufmann《法兰西要塞》等及其引用的维基条目）。
 */
var TH_DATA = TH_DATA || {};
TH_DATA.W = {
  id: 'W', name: ['西线', 'Western Front'],
  bbox: [-5.6, 42.6, 12.6, 54.4],
  /* 兵力池：各国驻在这些地区的地面部队中有多大比例属于本战区（德国本土的空闲兵力全部算西线；意大利本土只有对法边境的部分） */
  pool: { BNL: { BNL: 1 }, FRA: { FRA: 1, BNL: 1 }, GBR: { FRA: 1, BNL: 1, GBR: 0 }, DEU: { DEU: 1, BNL: 1, FRA: 1 }, ITA: { ITA: 0.4, FRA: 1 }, USA: { FRA: 1, BNL: 1, DEU: 1 }, CAN: { FRA: 1, BNL: 1 } },
  start: '1939-09-01',
  zones: [
    // [id, 中文名, English, 地区, 经度, 纬度, 地形, 工事, VP, 标志]（dep：补给基地——荷兰、比利时军队的补给来自本国的仓库与工业区）
    // —— 荷兰 ——
    ['NHO', '荷兰要塞（阿姆斯特丹—海牙）', 'Fortress Holland (Amsterdam–The Hague)', 'BNL', 4.62, 52.24, 'marsh', 2, 7, 'port cap2 dep'],
    ['NRO', '鹿特丹—多德雷赫特', 'Rotterdam–Dordrecht', 'BNL', 4.52, 51.84, 'urban', 1, 4, 'port dep'],
    ['NUT', '乌得勒支—赫雷伯防线', 'Utrecht–Grebbe Line', 'BNL', 5.36, 52.10, 'marsh', 2, 2, ''],
    ['NGE', '海尔德兰（阿纳姆—奈梅亨）', 'Gelderland (Arnhem–Nijmegen)', 'BNL', 6.00, 52.06, 'plain', 0, 2, ''],
    ['NNE', '荷兰东北（兹沃勒—格罗宁根）', 'NE Netherlands (Zwolle–Groningen)', 'BNL', 6.30, 52.86, 'plain', 0, 1, 'port'],
    ['NBR', '北布拉班特（布雷达—斯海尔托亨博斯）', 'North Brabant (Breda–Den Bosch)', 'BNL', 5.08, 51.58, 'plain', 0, 2, ''],
    ['NLI', '荷属林堡（芬洛—马斯特里赫特）', 'Dutch Limburg (Venlo–Maastricht)', 'BNL', 5.92, 51.26, 'plain', 1, 1, ''],
    ['NZE', '泽兰（弗利辛恩）', 'Zeeland (Vlissingen)', 'BNL', 3.82, 51.50, 'marsh', 1, 1, 'port'],
    // —— 比利时、卢森堡 ——
    ['BAN', '安特卫普国家堡垒', 'Antwerp National Redoubt', 'BNL', 4.46, 51.22, 'urban', 2, 4, 'port dep'],
    ['BBR', '布鲁塞尔—鲁汶（戴尔河）', 'Brussels–Leuven (Dyle)', 'BNL', 4.52, 50.84, 'plain', 1, 6, 'cap hub dep'],
    ['BGE', '让布卢缺口—那慕尔', 'Gembloux Gap–Namur', 'BNL', 4.80, 50.52, 'plain', 1, 2, ''],
    ['BAL', '艾伯特运河（哈瑟尔特—通厄伦）', 'Albert Canal (Hasselt–Tongeren)', 'BNL', 5.32, 51.02, 'plain', 1, 1, ''],
    ['BLG', '列日要塞', 'Liège Fortified Position', 'BNL', 5.66, 50.62, 'hills', 3, 3, 'hub dep'],
    ['BFL', '佛兰德（根特—布鲁日—奥斯坦德）', 'Flanders (Ghent–Bruges–Ostend)', 'BNL', 3.32, 51.06, 'plain', 1, 3, 'port'],
    ['BHA', '埃诺（蒙斯—沙勒罗瓦）', 'Hainaut (Mons–Charleroi)', 'BNL', 4.05, 50.44, 'plain', 0, 2, 'dep'],
    ['BSM', '桑布尔—默兹河间（菲利普维尔）', 'Entre-Sambre-et-Meuse', 'BNL', 4.50, 50.17, 'forest', 0, 0, ''],
    ['BAW', '阿登西部（马尔什—迪南东岸）', 'Western Ardennes (Marche)', 'BNL', 5.27, 50.22, 'forest', 0, 0, ''],
    ['BAR', '阿登北部（圣维特—马尔梅迪）', 'Northern Ardennes (St. Vith–Malmedy)', 'BNL', 6.02, 50.36, 'forest', 0, 0, ''],
    ['BBA', '阿登中部（巴斯托涅）', 'Central Ardennes (Bastogne)', 'BNL', 5.66, 50.00, 'forest', 0, 0, ''],
    ['BNE', '阿登南部（讷沙托—布永）', 'Southern Ardennes (Neufchâteau–Bouillon)', 'BNL', 5.22, 49.83, 'forest', 0, 0, ''],
    ['LUX', '卢森堡', 'Luxembourg', 'BNL', 6.12, 49.70, 'forest', 0, 2, ''],
    // —— 法国北部与东北 ——
    ['FDK', '敦刻尔克—加来', 'Dunkirk–Calais', 'FRA', 2.24, 50.90, 'marsh', 1, 2, 'port'],
    ['FBO', '布洛涅—阿布维尔（海峡沿岸）', 'Boulogne–Abbeville (Channel coast)', 'FRA', 1.78, 50.36, 'plain', 0, 1, 'port'],
    ['FLI', '里尔—瓦朗谢讷', 'Lille–Valenciennes', 'FRA', 3.16, 50.52, 'urban', 1, 4, 'hub'],
    ['FAR', '阿拉斯—康布雷', 'Arras–Cambrai', 'FRA', 2.84, 50.17, 'plain', 0, 2, ''],
    ['FMA', '莫伯日—阿韦讷', 'Maubeuge–Avesnes', 'FRA', 3.86, 50.12, 'hills', 1, 1, ''],
    ['FRO', '法属阿登（罗克鲁瓦—蒙泰梅）', 'French Ardennes (Rocroi–Monthermé)', 'FRA', 4.46, 49.92, 'forest', 1, 0, ''],
    ['FSE', '色当—斯通', 'Sedan–Stonne', 'FRA', 4.88, 49.57, 'hills', 1, 1, ''],
    ['FRE', '勒泰勒—埃纳河', 'Rethel–Aisne', 'FRA', 4.28, 49.47, 'plain', 0, 0, ''],
    ['FLA', '拉昂—圣康坦', 'Laon–Saint-Quentin', 'FRA', 3.46, 49.72, 'plain', 0, 2, ''],
    ['FSO', '索姆河（佩罗讷—亚眠）', 'Somme (Péronne–Amiens)', 'FRA', 2.52, 49.86, 'plain', 0, 2, ''],
    ['FBE', '博韦（皮卡第南部）', 'Beauvais (southern Picardy)', 'FRA', 2.08, 49.42, 'plain', 0, 1, ''],
    ['FCO', '贡比涅—苏瓦松', 'Compiègne–Soissons', 'FRA', 3.06, 49.36, 'forest', 0, 1, ''],
    ['FPA', '巴黎', 'Paris', 'FRA', 2.40, 48.82, 'urban', 1, 20, 'cap hub dep'],
    ['FCH', '兰斯—香槟', 'Reims–Champagne', 'FRA', 4.04, 49.10, 'plain', 0, 2, ''],
    ['FVE', '阿戈讷—凡尔登', 'Argonne–Verdun', 'FRA', 5.16, 49.20, 'forest', 1, 1, ''],
    ['FMO', '隆维—蒙梅迪（马奇诺延伸段）', 'Longwy–Montmédy (Maginot extension)', 'FRA', 5.56, 49.48, 'hills', 2, 0, ''],
    ['FME', '梅斯—蒂永维尔筑垒地域', 'Fortified Region of Metz', 'FRA', 6.22, 49.22, 'plain', 3, 3, 'hub'],
    ['FSA', '萨尔缺口', 'Sarre Gap', 'FRA', 6.86, 49.00, 'plain', 1, 0, ''],
    ['FLT', '劳特筑垒地域（比奇—维桑堡）', 'Fortified Region of the Lauter', 'FRA', 7.62, 48.95, 'forest', 3, 0, ''],
    ['FAL', '下阿尔萨斯（斯特拉斯堡）', 'Lower Alsace (Strasbourg)', 'FRA', 7.58, 48.44, 'plain', 2, 3, ''],
    ['FHA', '上阿尔萨斯（科尔马—米卢斯）', 'Upper Alsace (Colmar–Mulhouse)', 'FRA', 7.30, 47.85, 'plain', 2, 2, ''],
    ['FBF', '贝尔福峡口', 'Belfort Gap', 'FRA', 6.84, 47.56, 'hills', 1, 1, ''],
    ['FNA', '南锡—吕内维尔', 'Nancy–Lunéville', 'FRA', 6.24, 48.64, 'plain', 0, 2, 'hub'],
    ['FVO', '孚日山脉（埃皮纳勒）', 'Vosges (Épinal)', 'FRA', 6.80, 48.14, 'mount', 0, 1, ''],
    ['FSD', '圣迪济耶—特鲁瓦', 'Saint-Dizier–Troyes', 'FRA', 4.60, 48.50, 'plain', 0, 1, ''],
    ['FDI', '第戎—朗格勒', 'Dijon–Langres', 'FRA', 5.14, 47.56, 'hills', 0, 2, 'dep'],
    ['FBS', '贝桑松—汝拉', 'Besançon–Jura', 'FRA', 6.22, 47.06, 'mount', 0, 1, ''],
    // —— 法国西部、中部、南部 ——
    ['FRU', '鲁昂—勒阿弗尔', 'Rouen–Le Havre', 'FRA', 1.00, 49.50, 'plain', 0, 3, 'port dep'],
    ['FNO', '诺曼底（卡昂—瑟堡）', 'Normandy (Caen–Cherbourg)', 'FRA', -0.82, 49.20, 'hills', 0, 2, 'port'],
    ['FBR', '布列塔尼（雷恩—布雷斯特）', 'Brittany (Rennes–Brest)', 'FRA', -2.90, 48.20, 'hills', 0, 2, 'port'],
    ['FMN', '勒芒—沙特尔', 'Le Mans–Chartres', 'FRA', 0.80, 48.16, 'plain', 0, 1, ''],
    ['FOR', '卢瓦尔河（奥尔良—图尔）', 'Loire (Orléans–Tours)', 'FRA', 1.40, 47.55, 'plain', 0, 2, 'dep'],
    ['FNT', '南特—普瓦捷', 'Nantes–Poitiers', 'FRA', -0.90, 46.85, 'plain', 0, 2, 'port dep'],
    ['FMC', '中央高原北部（布尔日—维希）', 'Northern Massif Central (Bourges–Vichy)', 'FRA', 2.90, 46.30, 'hills', 0, 1, ''],
    ['FLY', '里昂', 'Lyon', 'FRA', 4.90, 45.80, 'plain', 0, 5, 'hub dep'],
    ['FAP', '阿尔卑斯（萨伏依—多菲内）', 'Alps (Savoy–Dauphiné)', 'FRA', 6.30, 45.30, 'mount', 3, 1, ''],
    ['FPR', '普罗旺斯—滨海阿尔卑斯', 'Provence–Maritime Alps', 'FRA', 6.30, 43.72, 'mount', 2, 4, 'port dep'],
    ['FSW', '法国西南（波尔多—图卢兹）', 'SW France (Bordeaux–Toulouse)', 'FRA', 0.20, 44.40, 'plain', 0, 4, 'port dep'],
    ['FLG', '朗格多克（蒙彼利埃）', 'Languedoc (Montpellier)', 'FRA', 3.60, 43.90, 'hills', 0, 1, ''],
    // —— 德国西部（及后方补给区） ——
    ['DKL', '下莱茵（克莱沃—韦塞尔）', 'Lower Rhine (Kleve–Wesel)', 'DEU', 6.46, 51.70, 'plain', 1, 1, ''],
    ['DRU', '鲁尔区', 'Ruhr', 'DEU', 7.26, 51.46, 'urban', 0, 8, 'dep hub'],
    ['DAA', '亚琛—门兴格拉德巴赫', 'Aachen–Mönchengladbach', 'DEU', 6.30, 50.96, 'plain', 2, 2, ''],
    ['DKO', '科隆—波恩', 'Cologne–Bonn', 'DEU', 7.04, 50.80, 'urban', 0, 4, 'dep hub'],
    ['DEI', '艾费尔高地（普吕姆）', 'Eifel (Prüm)', 'DEU', 6.60, 50.30, 'forest', 1, 0, ''],
    ['DTR', '特里尔—摩泽尔', 'Trier–Moselle', 'DEU', 6.76, 49.82, 'forest', 1, 1, ''],
    ['DKB', '科布伦茨—洪斯吕克', 'Koblenz–Hunsrück', 'DEU', 7.50, 50.12, 'forest', 0, 1, 'dep hub'],
    ['DSA', '萨尔—普法尔茨', 'Saar–Palatinate', 'DEU', 7.20, 49.33, 'hills', 2, 2, ''],
    ['DMA', '美因茨—法兰克福—曼海姆', 'Mainz–Frankfurt–Mannheim', 'DEU', 8.50, 49.84, 'urban', 0, 5, 'dep hub'],
    ['DBA', '巴登（卡尔斯鲁厄—弗赖堡）', 'Baden (Karlsruhe–Freiburg)', 'DEU', 8.16, 48.46, 'hills', 2, 2, ''],
    ['DWE', '威斯特伐利亚（明斯特）', 'Westphalia (Münster)', 'DEU', 7.90, 52.16, 'plain', 0, 2, 'dep'],
    ['DNI', '下萨克森（汉诺威—不来梅）', 'Lower Saxony (Hanover–Bremen)', 'DEU', 9.20, 52.80, 'plain', 0, 3, 'dep'],
    ['DHE', '黑森（卡塞尔）', 'Hesse (Kassel)', 'DEU', 9.40, 50.90, 'hills', 0, 1, 'dep'],
    ['DST', '符腾堡（斯图加特）', 'Württemberg (Stuttgart)', 'DEU', 9.30, 48.70, 'hills', 0, 2, 'dep'],
    ['DBY', '巴伐利亚（纽伦堡—慕尼黑）', 'Bavaria (Nuremberg–Munich)', 'DEU', 11.10, 48.90, 'hills', 0, 4, 'dep'],
    // —— 意大利（阿尔卑斯方向） ——
    ['IPI', '皮埃蒙特（都灵）', 'Piedmont (Turin)', 'ITA', 7.60, 45.00, 'mount', 1, 3, 'dep'],
    ['ILI', '利古里亚（热那亚）', 'Liguria (Genoa)', 'ITA', 8.70, 44.40, 'mount', 1, 2, 'port dep'],
    ['ILO', '伦巴第（米兰）', 'Lombardy (Milan)', 'ITA', 9.70, 45.55, 'plain', 0, 4, 'dep'],
    // —— 英国（海上基地，不与大陆陆路相连） ——
    ['GSE', '英格兰南部', 'Southern England', 'GBR', -0.70, 51.30, 'plain', 0, 0, 'base port dep'],
  ],
  /* 手工补充或修正的相邻关系：[a, b, 类型]。sea=海上航线（运兵、撤离、两栖），dike=阿夫鲁戴克大堤，cut=去掉几何生成的相邻 */
  links: [
    ['NNE', 'NHO', 'dike'],
    ['GSE', 'FDK', 'sea'], ['GSE', 'FBO', 'sea'], ['GSE', 'FRU', 'sea'], ['GSE', 'FNO', 'sea'], ['GSE', 'FBR', 'sea'], ['GSE', 'BFL', 'sea'], ['GSE', 'NZE', 'sea'], ['GSE', 'NHO', 'sea'], ['GSE', 'NRO', 'sea'],
  ],
  /* 区格所含的主要城镇（显示与自然语言命令识别用） */
  towns: {
    NHO: '阿姆斯特丹 海牙 莱顿 哈勒姆 史基浦 伊彭堡 法尔肯堡 Amsterdam Hague Leiden Haarlem',
    NRO: '鹿特丹 多德雷赫特 穆尔代克 瓦尔港 Rotterdam Dordrecht Moerdijk',
    NUT: '乌得勒支 阿默斯福特 雷嫩 赫雷伯 赫雷伯山 Utrecht Amersfoort Grebbe Grebbeberg',
    NGE: '阿纳姆 奈梅亨 兹特芬 代芬特尔 Arnhem Nijmegen',
    NNE: '兹沃勒 格罗宁根 弗里斯兰 阿夫鲁戴克 科恩维尔德赞德 Zwolle Groningen Friesland Afsluitdijk',
    NBR: '布雷达 蒂尔堡 斯海尔托亨博斯 埃因霍温 Breda Tilburg Eindhoven',
    NLI: '芬洛 鲁尔蒙德 马斯特里赫特 亨讷普 Venlo Roermond Maastricht Gennep',
    NZE: '泽兰 弗利辛恩 瓦尔赫伦 Zeeland Vlissingen Walcheren',
    BAN: '安特卫普 梅赫伦 利尔 Antwerp Mechelen',
    BBR: '布鲁塞尔 鲁汶 瓦夫尔 戴尔河 Brussels Leuven Louvain Wavre Dyle',
    BGE: '让布卢 那慕尔 阿尼 Gembloux Namur Hannut',
    BAL: '艾伯特运河 哈瑟尔特 通厄伦 Albert Hasselt Tongeren',
    BLG: '列日 埃本埃马尔 埃本-埃马尔 维塞 韦尔维耶 Liège Liege Eben-Emael Visé',
    BFL: '根特 布鲁日 奥斯坦德 泽布吕赫 科特赖克 伊普尔 Ghent Bruges Ostend Zeebrugge Ypres',
    BHA: '蒙斯 沙勒罗瓦 图尔奈 Mons Charleroi Tournai',
    BSM: '菲利普维尔 弗拉维永 Philippeville Flavion',
    BAW: '马尔什 迪南 罗什福尔 乌 伊瓦 Marche Dinant Houx Rochefort',
    BAR: '圣维特 马尔梅迪 洛斯海姆 St. Vith Malmedy Losheim',
    BBA: '巴斯托涅 乌法利兹 Bastogne Houffalize',
    BNE: '讷沙托 布永 瑟穆瓦 利布拉蒙 Neufchâteau Bouillon Semois',
    LUX: '卢森堡 阿尔隆 埃特尔布吕克 Luxembourg Arlon',
    FDK: '敦刻尔克 加来 格拉沃利讷 圣奥梅尔 Dunkirk Dunkerque Calais',
    FBO: '布洛涅 阿布维尔 蒙特勒伊 Boulogne Abbeville',
    FLI: '里尔 杜埃 瓦朗谢讷 贝蒂讷 Lille Douai Valenciennes',
    FAR: '阿拉斯 康布雷 Arras Cambrai',
    FMA: '莫伯日 阿韦讷 勒卡托 伊尔松 Maubeuge Avesnes Hirson',
    FRO: '罗克鲁瓦 蒙泰梅 沙勒维尔 梅济耶尔 日韦 Rocroi Monthermé Charleville Mézières Givet',
    FSE: '色当 斯通 比尔松 栋什里 Sedan Stonne Bulson Donchery',
    FRE: '勒泰勒 埃纳河 武济耶 Rethel Aisne Vouziers',
    FLA: '拉昂 圣康坦 蒙科尔内 吉斯 Laon Saint-Quentin Montcornet',
    FSO: '索姆河 佩罗讷 亚眠 Somme Péronne Amiens',
    FBE: '博韦 蒙迪迪耶 Beauvais',
    FCO: '贡比涅 苏瓦松 努瓦永 Compiègne Soissons',
    FPA: '巴黎 凡尔赛 Paris Versailles',
    FCH: '兰斯 香槟 埃佩尔奈 沙隆 Reims Champagne Châlons',
    FVE: '凡尔登 阿戈讷 Verdun Argonne',
    FMO: '隆维 蒙梅迪 隆吉永 拉费尔泰 Longwy Montmédy',
    FME: '梅斯 蒂永维尔 哈肯伯格 马奇诺 Metz Thionville Maginot',
    FSA: '萨尔 圣阿沃尔德 萨尔格米纳 Saint-Avold Sarreguemines',
    FLT: '比奇 维桑堡 阿格诺 劳特 Bitche Wissembourg Haguenau Lauter',
    FAL: '斯特拉斯堡 阿尔萨斯 Strasbourg Alsace',
    FHA: '科尔马 米卢斯 Colmar Mulhouse',
    FBF: '贝尔福 蒙贝利亚尔 Belfort',
    FNA: '南锡 吕内维尔 图勒 Nancy Lunéville Toul',
    FVO: '孚日 埃皮纳勒 圣迪耶 Vosges Épinal',
    FSD: '圣迪济耶 特鲁瓦 巴勒迪克 Saint-Dizier Troyes',
    FDI: '第戎 朗格勒 肖蒙 Dijon Langres',
    FBS: '贝桑松 汝拉 Besançon Jura',
    FRU: '鲁昂 勒阿弗尔 迪耶普 圣瓦莱里 Rouen Le Havre Dieppe',
    FNO: '诺曼底 卡昂 瑟堡 巴约 圣洛 奥马哈 犹他 Normandy Caen Cherbourg Bayeux Omaha Utah',
    FBR: '布列塔尼 雷恩 布雷斯特 圣纳泽尔 Brittany Rennes Brest',
    FMN: '勒芒 沙特尔 阿朗松 Le Mans Chartres',
    FOR: '卢瓦尔 奥尔良 图尔 布卢瓦 Loire Orléans Tours',
    FNT: '南特 普瓦捷 拉罗谢尔 Nantes Poitiers',
    FMC: '布尔日 维希 克莱蒙 讷韦尔 Bourges Vichy Nevers',
    FLY: '里昂 罗讷 Lyon Rhône',
    FAP: '阿尔卑斯 格勒诺布尔 尚贝里 莫达讷 布里扬松 Alps Grenoble Chambéry Briançon',
    FPR: '普罗旺斯 马赛 尼斯 土伦 芒通 Provence Marseille Nice Toulon Menton',
    FSW: '波尔多 图卢兹 Bordeaux Toulouse',
    FLG: '朗格多克 蒙彼利埃 Languedoc Montpellier',
    DKL: '克莱沃 韦塞尔 埃默里希 Kleve Wesel Emmerich',
    DRU: '鲁尔 埃森 杜伊斯堡 杜塞尔多夫 多特蒙德 Ruhr Essen Duisburg Düsseldorf Dortmund',
    DAA: '亚琛 门兴格拉德巴赫 于利希 迪伦 Aachen Mönchengladbach',
    DKO: '科隆 波恩 Cologne Köln Bonn',
    DEI: '艾费尔 普吕姆 格罗尔施泰因 Eifel Prüm',
    DTR: '特里尔 比特堡 摩泽尔 Trier Bitburg Moselle',
    DKB: '科布伦茨 洪斯吕克 Koblenz Hunsrück',
    DSA: '萨尔布吕肯 萨尔路易 凯泽斯劳滕 茨魏布吕肯 普法尔茨 Saarbrücken Kaiserslautern Palatinate',
    DMA: '美因茨 法兰克福 曼海姆 路德维希港 Mainz Frankfurt Mannheim',
    DBA: '卡尔斯鲁厄 弗赖堡 黑森林 凯尔 Karlsruhe Freiburg Black Forest',
    DWE: '明斯特 奥斯纳布吕克 Münster',
    DNI: '汉诺威 不来梅 Hanover Bremen',
    DHE: '卡塞尔 Kassel',
    DST: '斯图加特 Stuttgart',
    DBY: '纽伦堡 慕尼黑 Nuremberg Munich',
    IPI: '都灵 皮埃蒙特 Turin Piedmont',
    ILI: '热那亚 利古里亚 圣雷莫 Genoa Liguria',
    ILO: '米兰 伦巴第 Milan Lombardy',
    GSE: '英格兰 多佛尔 南安普敦 Dover Southampton England',
  },
};
/* ---------- 历史作战计划（AI 先验；玩家不受影响） ----------
 * groups 按顺序认领部队（sel：集团军群 ag、所属集团军 ar、兵种 t、是否有迪尔计划目标 dd）。
 * role：main 主攻（沿 axis/alt 逐格突进）· sec 助攻 · flank 侧翼掩护 · hold 固守 · drop 空降夺取要点 · deploy 前出到预定阵地（to='dd' 用部队的迪尔计划目标，或映射表）· reserve 机动预备队
 * start：发动主攻的作战阶段（开战当季之前的阶段用于集结，到 1940 年 5 月的集结区格 dz）；trigger：计划生效的条件 */
TH_DATA.W.plans = {
  DEU: [
    { id: 'sichelschnitt', zh: '曼施坦因计划（“镰刀收割”）', en: 'Manstein plan (Sichelschnitt)', w: 0.7, vs: ['FRA', 'BNL'], start: 3, groups: [
      { sel: { t: ['para'] }, role: 'drop', to: ['NRO', 'NHO', 'BAL'] },
      { sel: { ar: '克莱斯特', t: ['pz', 'mot'] }, role: 'main', axis: ['LUX', 'BNE', 'FSE', 'FRE', 'FLA', 'FSO', 'FBO'], alt: [['BBA', 'BNE', 'FRO', 'FMA', 'FAR', 'FBO']] },
      { sel: { ar: '第4集团军', t: ['pz', 'mot'] }, role: 'main', axis: ['BAR', 'BAW', 'BSM', 'FMA', 'FAR', 'FLI'] },
      { sel: { ag: 'A' }, role: 'flank', axis: ['LUX', 'BNE', 'FSE', 'FRE'], alt: [['BAR', 'BAW', 'BSM'], ['BBA', 'BNE', 'FRO']] },
      { sel: { ar: '第18集团军' }, role: 'sec', axis: ['NGE', 'NUT', 'NHO'], alt: [['NBR', 'NRO'], ['NNE', 'NHO']] },
      { sel: { ag: 'B' }, role: 'sec', axis: ['NLI', 'BAL', 'BBR', 'BFL'], alt: [['BLG', 'BGE', 'BHA']] },
      { sel: { ag: 'R' }, role: 'sec', axis: ['LUX', 'BNE', 'FSE', 'FRE', 'FLA'] },
      { sel: { ag: 'C' }, role: 'hold' },
    ] },
    { id: 'schlieffen', zh: '施里芬式（主攻比利时平原）', en: 'Schlieffen-style (main effort through Belgium)', w: 0.2, vs: ['FRA', 'BNL'], start: 3, groups: [
      { sel: { t: ['para'] }, role: 'drop', to: ['NRO', 'NHO', 'BAL'] },
      { sel: { t: ['pz', 'mot'] }, role: 'main', axis: ['NLI', 'BAL', 'BGE', 'BHA', 'FLI', 'FDK'], alt: [['BLG', 'BGE', 'BHA', 'FMA', 'FAR']] },
      { sel: { ar: '第18集团军' }, role: 'sec', axis: ['NGE', 'NUT', 'NHO'], alt: [['NBR', 'NRO']] },
      { sel: { ag: 'B' }, role: 'sec', axis: ['NLI', 'BAL', 'BBR', 'BFL'] },
      { sel: { ag: 'A' }, role: 'sec', axis: ['BAR', 'BAW', 'BSM'], alt: [['LUX', 'BNE', 'FSE']] },
      { sel: { ag: 'R' }, role: 'sec', axis: ['NLI', 'BAL', 'BGE'] },
      { sel: { ag: 'C' }, role: 'hold' },
    ] },
    { id: 'broad', zh: '均衡推进', en: 'Broad-front advance', w: 0.1, vs: ['FRA', 'BNL'], start: 3, groups: [
      { sel: { t: ['para'] }, role: 'drop', to: ['NRO', 'NHO'] },
      { sel: { t: ['pz', 'mot'] }, role: 'main', axis: ['NLI', 'BAL', 'BGE', 'BHA'], alt: [['LUX', 'BNE', 'FSE', 'FRE'], ['NGE', 'NUT', 'NHO']] },
      { sel: { ag: 'B' }, role: 'sec', axis: ['NLI', 'BAL', 'BBR'], alt: [['NBR', 'NRO']] },
      { sel: { ag: 'A' }, role: 'sec', axis: ['BAR', 'BAW', 'BSM'], alt: [['LUX', 'BNE', 'FRO']] },
      { sel: { ag: 'R' }, role: 'sec', axis: ['LUX', 'BNE', 'FSE'] },
      { sel: { ag: 'C' }, role: 'hold' },
    ] },
  ],
  FRA: [
    { id: 'dyle', zh: '迪尔计划（D 计划，含布雷达变体）', en: 'Dyle Plan (Plan D, Breda variant)', w: 0.75, trigger: { war: ['DEU', 'BNL'] }, groups: [
      { sel: { dd: 1 }, role: 'deploy', to: 'dd' },
      { sel: { t: ['pz', 'lt', 'mot'], ag: 'GQG' }, role: 'reserve' },
    ] },
    { id: 'meuse', zh: '重兵守默兹河（加强阿登—色当方向）', en: 'Hold the Meuse in strength', w: 0.13, trigger: { war: ['DEU', 'BNL'] }, groups: [
      { sel: { dd: 1, t: ['lt', 'mot', 'pz'] }, role: 'deploy', to: 'dd' },
      { sel: { ag: 'GQG', t: ['inf'] }, role: 'deploy', to: ['FSE', 'FRO', 'FSE', 'BSM', 'FMO'] },
      { sel: { ag: 'GQG' }, role: 'deploy', to: ['FRE', 'FSE'] },
    ] },
    { id: 'depth', zh: '纵深防御（不前出比利时，保留强大机动预备队）', en: 'Defence in depth with strong mobile reserves', w: 0.12, trigger: { war: ['DEU', 'BNL'] }, groups: [
      { sel: { t: ['lt', 'mot', 'pz'], ag: ['G1', 'GQG'] }, role: 'reserve' },
      { sel: { ag: 'GQG' }, role: 'deploy', to: ['FSE', 'FRO', 'FSE', 'FRE', 'FCH', 'FLA'] },
      { sel: { dd: 1 }, role: 'hold' },
    ] },
  ],
  GBR: [
    { id: 'dyle', follow: 'FRA', w: 1, trigger: { war: ['DEU', 'BNL'] }, groups: [{ sel: { dd: 1 }, role: 'deploy', to: 'dd' }] },
    { id: 'meuse', follow: 'FRA', w: 0, trigger: { war: ['DEU', 'BNL'] }, groups: [{ sel: { dd: 1 }, role: 'deploy', to: 'dd' }] },
    { id: 'depth', follow: 'FRA', w: 0, trigger: { war: ['DEU', 'BNL'] }, groups: [] },
  ],
};
/* 条令偏见（意料程度）：法军认为阿登森林不利于装甲通行，低估来自这些区格的威胁 */
TH_DATA.W.bias = { FRA: { BNE: 0.5, BBA: 0.5, LUX: 0.6, BAR: 0.6, BAW: 0.6 }, GBR: { BNE: 0.6, BBA: 0.6 } };
/* 可从港口撤离的国家（制海权由战略层海军对比决定） */
TH_DATA.W.evac = ['GBR', 'FRA', 'BNL', 'CAN', 'USA'];
/* 局部投降：某些区格全部失守时，番号带指定前缀的部队放下武器。1940 年 5 月 14 日鹿特丹被炸、赫雷伯防线失守后，荷兰于 15 日投降 */
TH_DATA.W.subcap = [{ zones: ['NRO', 'NUT'], c: 'BNL', ag: 'NLD', pre: '荷', ev: 'th.e.nl_cap' }, // 1940 年 5 月 14—15 日荷兰投降
  { zones: ['BBR', 'BAN'], c: 'BNL', ag: 'BEL', pre: '比', ev: 'th.e.be_cap' }];                        // 5 月 28 日比利时投降（利奥波德三世）
/* 史料（界面“史料”页）：区格、工事、战斗序列与作战计划的主要依据（research/west_geo.md、west_oob.md 记录了逐条出处） */
TH_DATA.W.src = [
  ['K.-H. 弗里泽《闪电战神话：1940 年西线战役》（Frieser, The Blitzkrieg Legend）', '镰刀收割计划的演变、阿登通道的行军与交通拥堵、色当渡河（5 月 13 日）、装甲走廊与“停止令”'],
  ['J. 杰克逊《法国的沦陷：1940 年纳粹入侵》（Jackson, The Fall of France）', '迪尔计划与布雷达变更、法军的预备队部署与指挥迟滞、停战（6 月 22 日）'],
  ['R. 道蒂《崩溃点：色当与法国的沦陷》（Doughty, The Breaking Point）', '法军第 2、第 9 集团军在默兹河一线的防御与反击'],
  ['J.E. 考夫曼《法兰西要塞》（Kaufmann, Fortress France）', '马奇诺防线各筑垒地段、比利时列日—那慕尔要塞群、荷兰水线与赫雷伯防线'],
  ['E. 梅《奇怪的胜利》（May, Strange Victory）', '盟军情报对阿登方向的误判（本作以“条令偏见”体现）'],
  ['1940 年 5 月 10 日双方战斗序列（德军 A、B、C 集团军群；法军第 1—7 集团军；英国远征军；荷比军队）', '番号、所属与开局阵地依据维基百科相关战斗序列条目及上列专著'],
];
/* 历史作战计划的说明（“史料”页） */
(function () {
  const S = { sichelschnitt: '镰刀收割（曼施坦因计划）：A 集团军群的装甲集群穿过阿登，5 月 13 日在色当渡过默兹河，20 日到达阿布维尔与海峡', schlieffen: '1939 年 10 月的“黄色方案”初稿：主攻经比利时中部，与 1914 年施里芬计划相似', broad: '宽正面推进：各集团军群平均用力（假设性方案，用于比较）', dyle: '迪尔计划（含布雷达变更）：法军第 1、第 7 集团军与英国远征军进入比利时，沿迪尔河布防', meuse: '重兵守默兹：把预备队放在色当—迪南一线（战后讨论中的替代方案）', depth: '纵深防御：不进入比利时，在法比边境构筑纵深防线并保留机动预备队（假设性方案）' };
  for (const list of Object.values(TH_DATA.W.plans || {})) for (const p of list) if (S[p.id] && !p.src) p.src = S[p.id];
})();
/* 区格的经济权重（占领区影响国力）：[人口（百万，1936—39 年普查与估计）, 工业（占本国工业产出的百分比，按煤、钢、机械、纺织与军工的分布估计）]。
 * 法国按 1936 年省份人口归并；北部—加来海峡煤田与纺织（里尔、瓦朗谢讷）、洛林铁矿与钢铁（隆维、蒂永维尔、南锡）、巴黎地区（约四分之一的工业）
 * 是法国工业的三大中心。比利时：列日、沙勒罗瓦的钢铁与煤，安特卫普港；荷兰：兰斯塔德（阿姆斯特丹、鹿特丹）、飞利浦（埃因霍温）、林堡煤矿；
 * 卢森堡：阿尔贝德钢铁。德国、意大利、英国只有一部分在战区内（econPart），份额按全国计：鲁尔约占德国工业的两成以上。 */
TH_DATA.W.econRegs = ['FRA', 'BNL', 'DEU', 'ITA', 'GBR'];
TH_DATA.W.econPart = ['DEU', 'ITA', 'GBR'];
TH_DATA.W.econ = {
  FDK: [0.6, 2.5], FBO: [0.45, 1], FLI: [2.3, 14], FAR: [0.5, 1.5], FMA: [0.25, 1.5], FRO: [0.15, 0.8], FSE: [0.1, 0.4], FRE: [0.15, 0.2], FLA: [0.3, 1], FSO: [0.35, 0.8],
  FBE: [0.2, 0.5], FCO: [0.3, 1], FPA: [6.8, 27], FCH: [0.4, 0.8], FVE: [0.2, 0.3], FMO: [0.15, 2.5], FME: [0.55, 6], FSA: [0.2, 1.5], FLT: [0.15, 0.3], FAL: [0.55, 1.5],
  FHA: [0.5, 2], FBF: [0.2, 1.8], FNA: [0.4, 3], FVO: [0.35, 0.8], FSD: [0.45, 1.2], FDI: [1.06, 3], FBS: [0.42, 0.8], FRU: [1.2, 5], FNO: [1.1, 1.2], FBR: [2.4, 2],
  FMN: [0.9, 1.2], FOR: [1.2, 1.3], FNT: [2.9, 4], FMC: [2.4, 3.5], FLY: [1.95, 8], FAP: [1.43, 2.5], FPR: [2.4, 4], FSW: [3.9, 4.5], FLG: [1.8, 1.5],
  NHO: [2.4, 12], NRO: [1.1, 9], NUT: [0.45, 2], NGE: [1.1, 3], NNE: [1.75, 4], NBR: [1, 4.5], NLI: [0.6, 3], NZE: [0.25, 0.5],
  BAN: [1.3, 8], BBR: [1.9, 10], BGE: [0.35, 1.5], BAL: [0.35, 2], BLG: [1, 10], BFL: [2, 8], BHA: [1.25, 12], BSM: [0.1, 0.5], BAW: [0.08, 0.2], BAR: [0.08, 0.2], BBA: [0.06, 0.1], BNE: [0.06, 0.2], LUX: [0.3, 4],
  DKL: [0.7, 1], DRU: [5.5, 22], DAA: [1.3, 2.5], DKO: [2.2, 4], DEI: [0.25, 0.1], DTR: [0.5, 0.3], DKB: [0.9, 0.5], DSA: [2, 5], DMA: [3.5, 6], DBA: [2, 2.5], DWE: [3, 3], DNI: [4.5, 5], DHE: [1.5, 2], DST: [2.9, 4], DBY: [8, 6],
  IPI: [3.5, 16], ILI: [1.5, 8], ILO: [5.8, 30],
  GSE: [18, 30],
};
/* 参战时机（战区结果驱动战略）：1940 年 6 月 10 日，意大利在法国败局已定时对英法宣战。
 * 开启精细战区时，剧本时间线上第 3 回合的无条件宣战改由战区局势触发（德军对法国的推进达到 35%，或法国已被占领），
 * 每个作战阶段结束时检查，期限到 1941 年底。顺带修正联机版里这条事件的文字（原与 1943 年停战共用一个词条）。 */
TH_DATA.W.join = [{ id: 'ita40', a: 'ITA', to: ['FRA', 'GBR'], y0: 1940, q0: 2, y1: 1941, q1: 4, cond: ['any', ['front', 'DEU', 'FRA', 35], ['ctrl', 'FRA', 'DEU']], msg: 'ev39.italy_war' }];
(function () {
  const S39 = typeof SCENARIOS !== 'undefined' && SCENARIOS['1939']; if (!S39 || !S39.timeline) return;
  for (const e of S39.timeline) if (e.type === 'declare' && e.a === 'ITA' && e.t === 3 && [].concat(e.to).includes('FRA')) { e.thSkip = 1; e.msg = 'ev39.italy_war'; }
})();
