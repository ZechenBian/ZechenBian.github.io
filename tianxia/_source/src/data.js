/* ===================== 数据层 / Data =====================
 * GDP = IMF WEO 2026 estimates (US$ bn); milex = SIPRI 2025 (US$ bn; bundled regions = member totals/estimates);
 * nukes = SIPRI Yearbook 2026 military stockpiles; pers = active personnel (thousands, ≈IISS).
 * ppp: combat value per dollar; mix: land/navy/air share of spending; terr: defensive terrain factor; intel: intelligence capability.
 */
const ACTORS = [
 {id:'USA',name:'美国',en:'United States',gov:'dem',pop:350,gdp:32510,growth:1.9,milex:954,pers:1316,nukes:3700,tech:100,stab:58,ppp:1.0,mix:[.30,.36,.34],terr:1.3,energy:1,fin:3,proj:9000,icbm:1,intel:95,hawk:.55,econ:.85,risk:.5,loyal:.6,
  voice:'美国白宫与国务院',voiceEn:'The White House and State Department',
  doctrine:'全球性大国，维护同盟体系与海上主导地位；国内政治高度分化，对长期海外战争和本国伤亡敏感；偏好用关税、制裁与联盟协同施压，对西半球事务尤其敏感；也可能出于交易考虑与对手做交易。',
  doctrineEn:'Global superpower that maintains its alliance network and maritime dominance; deeply polarized at home and sensitive to long wars abroad and casualties; prefers tariffs, sanctions and coordinated alliance pressure; especially sensitive about the Western Hemisphere; may cut transactional deals with rivals.'},
 {id:'CHN',name:'中国',en:'China',gov:'aut',pop:1417,gdp:21356,growth:4.2,milex:336,pers:2035,nukes:620,tech:86,stab:72,ppp:1.7,mix:[.38,.31,.31],terr:1.35,energy:-2,fin:2,proj:1500,icbm:1,intel:82,hawk:.45,econ:.75,risk:.35,loyal:.5,
  voice:'中国外交部',voiceEn:"China's Foreign Ministry",
  doctrine:'将主权与领土完整（台湾问题）视为核心利益，主张不干涉内政；偏好经济手段与长期布局，军事上总体谨慎但对周边主权争端强硬；高度重视经济稳定、供应链与能源安全，反感被围堵。',
  doctrineEn:'Treats sovereignty and territorial integrity (Taiwan) as core interests and rejects interference in internal affairs; prefers economic tools and long-term positioning; cautious militarily overall but firm on nearby sovereignty disputes; prizes economic stability, supply chains and energy security; resents containment.'},
 {id:'RUS',name:'俄罗斯',en:'Russia',gov:'aut',pop:144,gdp:2656,growth:0.8,milex:190,pers:1150,nukes:4400,tech:72,stab:60,ppp:2.3,mix:[.55,.12,.33],terr:1.5,energy:2,fin:1,proj:1500,icbm:1,intel:82,hawk:.8,econ:.4,risk:.7,loyal:.55,
  voice:'克里姆林宫与俄罗斯外交部',voiceEn:"The Kremlin and Russia's Foreign Ministry",
  doctrine:'视北约东扩为根本威胁，追求在前苏联空间的势力范围；愿意承担高风险与长期消耗，核威慑是底牌；对西方制裁有较强韧性，依赖能源出口，重视与中国、全球南方的合作。',
  doctrineEn:'Sees NATO enlargement as a fundamental threat and seeks a sphere of influence in the former Soviet space; accepts high risk and long attrition, with nuclear deterrence as the backstop; resilient to Western sanctions, dependent on energy exports, values ties with China and the Global South.'},
 {id:'IND',name:'印度',en:'India',gov:'dem',pop:1464,gdp:4153,growth:6.3,milex:92.1,pers:1475,nukes:190,tech:64,stab:64,ppp:2.1,mix:[.56,.19,.25],terr:1.3,energy:-2,fin:1,proj:800,icbm:1,intel:62,hawk:.5,econ:.5,risk:.4,loyal:.35,
  voice:'印度外交部',voiceEn:"India's Ministry of External Affairs",
  doctrine:'坚持战略自主、多方下注；对巴基斯坦和中国边境问题强硬，谋求南亚主导与大国地位；在美俄之间保持平衡，重视经济增长与能源进口多元化。',
  doctrineEn:'Pursues strategic autonomy and hedges between powers; firm on the Pakistan and China border disputes; seeks primacy in South Asia and great-power status; balances between the US and Russia; prioritizes growth and diversified energy imports.'},
 {id:'JPN',name:'日本',en:'Japan',gov:'dem',pop:123,gdp:4379,growth:0.6,milex:62.2,pers:247,nukes:0,tech:90,stab:76,ppp:1.1,mix:[.28,.40,.32],terr:1.4,energy:-2,fin:2,proj:600,intel:66,hawk:.35,econ:.65,risk:.3,loyal:.8,
  voice:'日本首相官邸与外务省',voiceEn:"Japan's Prime Minister's Office and Foreign Ministry",
  doctrine:'依托日美同盟，正加速提升防卫能力；对中国军力增长、台海与朝鲜导弹高度警惕；和平宪法与国内舆论限制海外用兵，偏好经济与外交手段。',
  doctrineEn:"Anchored in the US alliance and rapidly strengthening its defenses; highly wary of China's military rise, the Taiwan Strait and North Korean missiles; its pacifist constitution and public opinion limit operations abroad; prefers economic and diplomatic tools."},
 {id:'DEU',name:'德国',en:'Germany',gov:'dem',pop:84,gdp:5453,growth:0.9,milex:114,pers:182,nukes:0,tech:88,stab:66,ppp:1.1,mix:[.45,.13,.42],terr:1.1,energy:-2,fin:2,proj:300,intel:66,hawk:.25,econ:.7,risk:.25,loyal:.6,
  voice:'德国联邦政府',voiceEn:'The German Federal Government',
  doctrine:'欧洲经济核心，正在大幅重整军备；决策依赖欧盟与北约框架，偏好法律、经济与多边手段；出口导向经济对贸易摩擦敏感，对动武高度谨慎。',
  doctrineEn:"Europe's economic core, now rearming heavily; acts through the EU and NATO and prefers legal, economic and multilateral tools; its export-driven economy is sensitive to trade friction; very cautious about using force."},
 {id:'GBR',name:'英国',en:'UK',gov:'dem',pop:69,gdp:4265,growth:1.2,milex:89,pers:141,nukes:225,tech:87,stab:60,ppp:1.1,mix:[.28,.38,.34],terr:1.35,energy:-1,fin:3,proj:2000,icbm:1,intel:88,hawk:.55,econ:.7,risk:.45,loyal:.85,
  voice:'英国首相府与外交部',voiceEn:'Downing Street and the Foreign Office',
  doctrine:'美国最紧密的盟友之一，全球金融中心；在对俄问题上强硬，支持乌克兰；重视海上力量与情报合作，通常与美国、北约协调行动。',
  doctrineEn:"One of America's closest allies and a global financial center; hawkish on Russia and a firm backer of Ukraine; values sea power and intelligence cooperation; usually acts in concert with the US and NATO."},
 {id:'FRA',name:'法国',en:'France',gov:'dem',pop:66,gdp:3600,growth:0.9,milex:68,pers:203,nukes:290,tech:86,stab:52,ppp:1.1,mix:[.36,.30,.34],terr:1.15,energy:-1,fin:2,proj:2000,icbm:1,intel:78,hawk:.5,econ:.6,risk:.45,loyal:.6,
  voice:'法国爱丽舍宫与外交部',voiceEn:"The Élysée and France's Foreign Ministry",
  doctrine:'追求欧洲战略自主，拥有独立核威慑与海外领地；外交上常在大国之间斡旋，愿意军事介入非洲与地中海事务，国内政治分裂影响决断。',
  doctrineEn:'Pursues European strategic autonomy with an independent nuclear deterrent and overseas territories; often mediates between great powers; willing to intervene in Africa and the Mediterranean; domestic divisions can hamper decisiveness.'},
 {id:'ITA',name:'意大利',en:'Italy',gov:'dem',pop:59,gdp:2738,growth:.6,milex:48.1,pers:161,nukes:0,tech:80,stab:58,ppp:1.1,mix:[.40,.30,.30],terr:1.2,energy:-2,fin:1,proj:500,intel:60,hawk:.3,econ:.55,risk:.3,loyal:.55,
  voice:'意大利政府',voiceEn:'The Italian government',
  doctrine:'重视地中海稳定与移民问题，依赖欧盟与北约；经济负债较高，对制裁的成本敏感，外交风格务实。',
  doctrineEn:'Focused on Mediterranean stability and migration; relies on the EU and NATO; high public debt makes it sensitive to the cost of sanctions; pragmatic diplomacy.'},
 {id:'IBE',name:'西班牙与葡萄牙',en:'Iberia',gov:'dem',pop:58.5,gdp:2472,growth:2.0,milex:45.2,pers:146,nukes:0,tech:78,stab:62,ppp:1.1,mix:[.40,.30,.30],terr:1.2,energy:-1,fin:1,proj:500,intel:55,hawk:.25,econ:.5,risk:.3,loyal:.5,
  voice:'西班牙与葡萄牙政府',voiceEn:'The governments of Spain and Portugal',
  doctrine:'伊比利亚半岛国家，关注地中海、北非与拉美；军费偏低、倾向多边主义与外交解决，在中东问题上相对独立。',
  doctrineEn:'Focused on the Mediterranean, North Africa and Latin America; low defense spending, prefers multilateralism and diplomacy; relatively independent on the Middle East.'},
 {id:'BRA',name:'巴西',en:'Brazil',gov:'dem',pop:213,gdp:2636,growth:2.0,milex:23.9,pers:367,nukes:0,tech:58,stab:54,ppp:1.5,mix:[.55,.22,.23],terr:1.25,energy:1,fin:1,proj:300,intel:45,hawk:.2,econ:.45,risk:.3,loyal:.3,
  voice:'巴西外交部',voiceEn:"Brazil's Foreign Ministry",
  doctrine:'南美最大国家与金砖成员，奉行不结盟与多边主义；反对单边制裁，重视与中美两方的贸易，对区域外军事干涉极为反感。',
  doctrineEn:"South America's largest country and a BRICS member; non-aligned and multilateralist; opposes unilateral sanctions, values trade with both China and the US, strongly averse to outside military intervention in the region."},
 {id:'CAN',name:'加拿大',en:'Canada',gov:'dem',pop:40,gdp:2507,growth:1.3,milex:37.5,pers:63,nukes:0,tech:84,stab:74,ppp:1.1,mix:[.35,.30,.35],terr:1.35,energy:2,fin:2,proj:500,intel:62,hawk:.3,econ:.55,risk:.3,loyal:.7,
  voice:'加拿大总理府与全球事务部',voiceEn:"The Prime Minister's Office and Global Affairs Canada",
  doctrine:'高度依赖对美贸易，同时寻求贸易多元化；北约与五眼成员，重视北极主权；倾向外交与多边手段。',
  doctrineEn:'Highly dependent on trade with the US while seeking to diversify; NATO and Five Eyes member; protective of Arctic sovereignty; prefers diplomacy and multilateral tools.'},
 {id:'AUS',name:'澳大利亚',en:'Australia',gov:'dem',pop:27,gdp:2124,growth:2.1,milex:35.3,pers:58,nukes:0,tech:84,stab:76,ppp:1.15,mix:[.30,.36,.34],terr:1.4,energy:2,fin:1,proj:1500,intel:68,hawk:.45,econ:.5,risk:.35,loyal:.8,
  voice:'澳大利亚政府',voiceEn:'The Australian government',
  doctrine:'美国在印太的核心盟友（澳英美联盟），对华经济依赖与安全担忧并存；重视南太平洋岛国，资源出口大国。',
  doctrineEn:"America's key Indo-Pacific ally (AUKUS); balances economic dependence on China with security concerns; focused on the South Pacific; a major resource exporter."},
 {id:'MEX',name:'墨西哥',en:'Mexico',gov:'dem',pop:132,gdp:2121,growth:1.2,milex:13.6,pers:300,nukes:0,tech:56,stab:42,ppp:1.5,mix:[.65,.15,.20],terr:1.1,energy:1,fin:1,proj:200,intel:40,hawk:.15,econ:.35,risk:.2,loyal:.3,
  voice:'墨西哥政府',voiceEn:'The Mexican government',
  doctrine:'经济深度绑定美国（美墨加协定），国内安全压力大；坚持不干涉原则，避免卷入大国冲突。',
  doctrineEn:'Economically bound to the US through USMCA and under heavy domestic security pressure; upholds non-intervention and avoids great-power conflicts.'},
 {id:'KOR',name:'韩国',en:'South Korea',gov:'dem',pop:51.6,gdp:1931,growth:1.8,milex:47.8,pers:450,nukes:0,tech:88,stab:58,ppp:1.35,mix:[.50,.20,.30],terr:1.4,energy:-2,fin:1,proj:400,intel:62,hawk:.4,econ:.55,risk:.3,loyal:.75,
  voice:'韩国总统府与外交部',voiceEn:"South Korea's Presidential Office and Foreign Ministry",
  doctrine:'核心威胁来自朝鲜，依托韩美同盟；经济上与中国联系紧密，力图在中美之间保持平衡；半导体与制造业强国。',
  doctrineEn:'Its core threat is North Korea and it relies on the US alliance; closely tied to China economically and tries to balance between the two; a semiconductor and manufacturing powerhouse.'},
 {id:'TUR',name:'土耳其',en:'Turkey',gov:'hyb',pop:87,gdp:1640,growth:3.0,milex:30,pers:355,nukes:0,tech:66,stab:50,ppp:1.7,mix:[.52,.23,.25],terr:1.35,energy:-2,fin:1,proj:800,intel:60,hawk:.6,econ:.45,risk:.55,loyal:.35,
  voice:'土耳其总统府与外交部',voiceEn:"Turkey's Presidency and Foreign Ministry",
  doctrine:'北约成员但奉行高度自主的交易型外交，在俄乌、中东、高加索多方下注；控制黑海海峡，军工发展迅速，对库尔德武装问题强硬。',
  doctrineEn:'A NATO member with a highly autonomous, transactional foreign policy that hedges across Ukraine, the Middle East and the Caucasus; controls the Turkish Straits; fast-growing defense industry; hardline on Kurdish armed groups.'},
 {id:'ASN',name:'东盟',en:'ASEAN',gov:'hyb',pop:690,gdp:4509,growth:4.6,milex:63.3,pers:1735,nukes:0,tech:64,stab:60,ppp:1.6,mix:[.48,.28,.24],terr:1.35,energy:0,fin:1,proj:600,intel:48,hawk:.25,econ:.45,risk:.25,loyal:.3,
  voice:'东盟轮值主席国与东盟秘书处',voiceEn:'The ASEAN chair and the ASEAN Secretariat',
  doctrine:'（简化为一个行为体）坚持东盟中心地位与大国平衡，不愿选边；与中国经贸紧密但在南海存在争端，与美日保持安全合作；内部意见常不一致，行动偏谨慎。',
  doctrineEn:'(Played as one actor) insists on ASEAN centrality and balancing among great powers without taking sides; close economic ties with China but disputes in the South China Sea; security cooperation with the US and Japan; members often disagree, so it acts cautiously.'},
 {id:'BNL',name:'比荷卢',en:'Benelux',gov:'dem',pop:30.5,gdp:2337,growth:1.2,milex:44.1,pers:58,nukes:0,tech:88,stab:70,ppp:1.1,mix:[.40,.25,.35],terr:1.0,energy:-1,fin:2,proj:400,intel:60,hawk:.3,econ:.65,risk:.25,loyal:.7,
  voice:'荷兰、比利时、卢森堡政府',voiceEn:'The Dutch, Belgian and Luxembourg governments',
  doctrine:'欧盟与北约的核心成员（布鲁塞尔、鹿特丹、光刻机产业链），重视规则与多边体系；贸易枢纽，对供应链与出口管制议题影响力大。',
  doctrineEn:'Core EU and NATO members (Brussels, Rotterdam, the lithography supply chain) that value rules and multilateralism; a trade hub with outsized influence on supply chains and export controls.'},
 {id:'GLF',name:'海湾国家',en:'Gulf States',gov:'aut',pop:101,gdp:2574,growth:3.5,milex:131,pers:410,nukes:0,tech:62,stab:66,ppp:0.9,mix:[.40,.20,.40],terr:1.2,energy:2,fin:2,proj:800,intel:55,hawk:.4,econ:.6,risk:.35,loyal:.45,
  voice:'沙特王室与海湾合作委员会',voiceEn:'The Saudi royal court and the Gulf Cooperation Council',
  doctrine:'（沙特主导，含阿联酋、卡塔尔、科威特、阿曼、巴林、也门）石油美元与主权财富基金大户；安全上依赖美国，同时与中俄发展关系；警惕伊朗，与巴基斯坦签有共同防御协定。',
  doctrineEn:'(Led by Saudi Arabia; includes the UAE, Qatar, Kuwait, Oman, Bahrain and Yemen) major holders of petrodollars and sovereign wealth; rely on the US for security while deepening ties with China and Russia; wary of Iran; Saudi Arabia has a mutual defense pact with Pakistan.'},
 {id:'POL',name:'波兰',en:'Poland',gov:'dem',pop:38,gdp:1134,growth:3.0,milex:46.8,pers:200,nukes:0,tech:74,stab:66,ppp:1.25,mix:[.58,.07,.35],terr:1.05,energy:-1,fin:1,proj:300,intel:58,hawk:.6,econ:.45,risk:.45,loyal:.85,
  voice:'波兰政府',voiceEn:'The Polish government',
  doctrine:'北约东翼前线国家，军费占GDP比例居北约前列；视俄罗斯为生存威胁，坚定支持乌克兰，高度依赖美国安全承诺。',
  doctrineEn:"NATO's eastern frontline state and one of the alliance's top spenders relative to GDP; sees Russia as an existential threat, firmly backs Ukraine and relies heavily on US security guarantees."},
 {id:'CEU',name:'中欧诸国',en:'Central Europe',gov:'dem',pop:46,gdp:2740,growth:1.3,milex:29.2,pers:125,nukes:0,tech:82,stab:70,ppp:1.15,mix:[.56,.02,.42],terr:1.3,energy:-2,fin:2,proj:200,intel:50,hawk:.2,econ:.5,risk:.2,loyal:.45,
  voice:'捷克、奥地利、匈牙利、瑞士等中欧国家',voiceEn:'Central European governments (Czechia, Austria, Hungary, Switzerland and others)',
  doctrine:'（含北约成员与中立国）内陆国家群，经济与德国高度融合；对俄态度分歧较大（匈牙利、斯洛伐克较温和），整体倾向谨慎与中立。',
  doctrineEn:'(A mix of NATO members and neutral states) landlocked economies closely integrated with Germany; divided on Russia (Hungary and Slovakia are softer); generally cautious and neutral-leaning.'},
 {id:'TWN',name:'台湾',en:'Taiwan',gov:'dem',pop:23.3,gdp:977,growth:3.0,milex:18.2,pers:169,nukes:0,tech:90,stab:64,ppp:1.2,mix:[.40,.25,.35],terr:1.5,energy:-2,fin:1,proj:300,intel:60,hawk:.35,econ:.5,risk:.3,loyal:.6,
  voice:'台北方面',voiceEn:'Taipei',
  doctrine:'全球先进半导体制造中心，安全上高度依赖美国支持；两岸关系是一切决策的核心，岛内政治分歧明显；力求维持现状，避免被迫表态。',
  doctrineEn:'The global center of advanced chipmaking, heavily reliant on US support for its security; cross-strait relations drive every decision and domestic politics is divided; seeks to preserve the status quo and avoid being forced to choose.'},
 {id:'NOR',name:'北欧与爱尔兰',en:'Nordics & Ireland',gov:'dem',pop:33.5,gdp:3027,growth:1.8,milex:58,pers:85,nukes:0,tech:88,stab:80,ppp:1.1,mix:[.40,.25,.35],terr:1.35,energy:1,fin:2,proj:500,intel:66,hawk:.4,econ:.55,risk:.35,loyal:.8,
  voice:'瑞典、挪威、芬兰、丹麦、冰岛与爱尔兰政府',voiceEn:'The Nordic and Irish governments',
  doctrine:'（含格陵兰）芬兰与瑞典已加入北约，北欧整体对俄强硬、支持乌克兰；爱尔兰保持中立；重视北极、波罗的海安全与规则秩序。',
  doctrineEn:'(Includes Greenland) Finland and Sweden have joined NATO; the Nordics are hawkish on Russia and back Ukraine, while Ireland stays neutral; focused on Arctic and Baltic security and a rules-based order.'},
 {id:'ISR',name:'以色列',en:'Israel',gov:'dem',pop:10,gdp:720,growth:3.5,milex:48.3,pers:170,nukes:90,tech:88,stab:48,ppp:1.1,mix:[.45,.10,.45],terr:1.1,energy:0,fin:1,proj:1500,icbm:1,intel:90,hawk:.85,econ:.3,risk:.7,loyal:.5,
  voice:'以色列总理府与外交部',voiceEn:"Israel's Prime Minister's Office and Foreign Ministry",
  doctrine:'视伊朗及其地区代理力量为头号威胁，奉行先发制人与绝对安全理念；高度依赖美国支持，情报与空中打击能力强，国内政治分裂。',
  doctrineEn:'Views Iran and its regional proxies as the top threat and follows a doctrine of preemption and absolute security; heavily reliant on US support; strong intelligence and air-strike capabilities; divided domestic politics.'},
 {id:'SCO',name:'南锥体国家',en:'Southern Cone',gov:'dem',pop:76,gdp:1253,growth:3.2,milex:10.3,pers:176,nukes:0,tech:60,stab:52,ppp:1.4,mix:[.50,.25,.25],terr:1.3,energy:1,fin:1,proj:300,intel:42,hawk:.2,econ:.35,risk:.25,loyal:.35,
  voice:'阿根廷、智利、乌拉圭、巴拉圭政府',voiceEn:'The governments of Argentina, Chile, Uruguay and Paraguay',
  doctrine:'资源与农产品出口经济体，阿根廷当前亲美；关注马岛（福克兰群岛）主权问题；整体远离大国冲突。',
  doctrineEn:'Resource and farm exporters; Argentina currently leans pro-US; the Falklands sovereignty dispute persists; broadly distant from great-power conflicts.'},
 {id:'AND',name:'安第斯国家',en:'Andean States',gov:'hyb',pop:148,gdp:1291,growth:2.6,milex:22.2,pers:570,nukes:0,tech:50,stab:38,ppp:1.5,mix:[.66,.14,.20],terr:1.45,energy:2,fin:1,proj:200,intel:38,hawk:.25,econ:.3,risk:.3,loyal:.25,
  voice:'哥伦比亚、秘鲁、委内瑞拉等安第斯国家',voiceEn:'The Andean governments (Colombia, Peru, Venezuela and others)',
  doctrine:'（含委内瑞拉、圭亚那等）油气与矿产丰富，国内安全与政治动荡问题突出；与美国关系复杂，对外部军事干涉高度敏感。',
  doctrineEn:'(Includes Venezuela and Guyana) rich in oil, gas and minerals, with serious internal security and political instability; complicated relations with the US; highly sensitive to outside military intervention.'},
 {id:'SAS',name:'孟加拉与南亚诸国',en:'Bangladesh & South Asia',gov:'hyb',pop:229,gdp:668,growth:5.2,milex:6.4,pers:420,nukes:0,tech:42,stab:42,ppp:2.1,mix:[.70,.15,.15],terr:1.2,energy:-2,fin:1,proj:100,intel:35,hawk:.15,econ:.3,risk:.2,loyal:.25,
  voice:'孟加拉国、斯里兰卡、尼泊尔等国政府',voiceEn:'The governments of Bangladesh, Sri Lanka, Nepal and neighbors',
  doctrine:'夹在印度与中国之间，依赖外来投资与援助；力求在大国之间保持平衡，避免被卷入冲突。',
  doctrineEn:'Squeezed between India and China and reliant on outside investment and aid; tries to balance among great powers and avoid being drawn into conflict.'},
 {id:'BAL',name:'巴尔干与东南欧',en:'Balkans & SE Europe',gov:'dem',pop:60,gdp:1349,growth:2.5,milex:27.4,pers:330,nukes:0,tech:64,stab:56,ppp:1.35,mix:[.55,.18,.27],terr:1.3,energy:-1,fin:1,proj:300,intel:45,hawk:.3,econ:.35,risk:.3,loyal:.5,
  voice:'罗马尼亚、希腊、塞尔维亚等东南欧国家',voiceEn:'Southeast European governments (Romania, Greece, Serbia and others)',
  doctrine:'（多数为北约与欧盟成员，塞尔维亚等除外）黑海与东地中海门户，与土耳其存在历史矛盾；对俄态度内部不一。',
  doctrineEn:'(Mostly NATO and EU members, Serbia excepted) the gateway to the Black Sea and eastern Mediterranean; historic tensions with Turkey; divided views on Russia.'},
 {id:'SAF',name:'南部非洲',en:'Southern Africa',gov:'hyb',pop:240,gdp:857,growth:2.2,milex:6.5,pers:280,nukes:0,tech:45,stab:46,ppp:1.9,mix:[.65,.10,.25],terr:1.3,energy:1,fin:1,proj:200,intel:40,hawk:.15,econ:.3,risk:.2,loyal:.3,
  voice:'南非与南部非洲发展共同体',voiceEn:'South Africa and the Southern African Development Community',
  doctrine:'（南非主导，含安哥拉、津巴布韦、莫桑比克等）金砖成员，奉行不结盟；关键矿产产地，重视发展与债务问题。',
  doctrineEn:'(Led by South Africa; includes Angola, Zimbabwe and Mozambique) a BRICS member and non-aligned; home to critical minerals; focused on development and debt.'},
 {id:'PAK',name:'巴基斯坦',en:'Pakistan',gov:'hyb',pop:255,gdp:452,growth:3.2,milex:11.9,pers:660,nukes:170,tech:48,stab:36,ppp:2.4,mix:[.62,.13,.25],terr:1.35,energy:-2,fin:1,proj:2750,intel:55,hawk:.6,econ:.2,risk:.6,loyal:.6,
  voice:'巴基斯坦外交部与军方',voiceEn:"Pakistan's Foreign Office and military",
  doctrine:'与印度长期敌对，核威慑是安全支柱；与中国“全天候”伙伴关系，与沙特签有共同防御协定；经济脆弱依赖外援，军方在决策中影响巨大。',
  doctrineEn:"A long-standing rival of India with nuclear deterrence as the pillar of its security; an 'all-weather' partnership with China and a mutual defense pact with Saudi Arabia; a fragile economy dependent on outside aid; the military dominates decision-making."},
 {id:'EGY',name:'埃及',en:'Egypt',gov:'aut',pop:118,gdp:430,growth:4.0,milex:7.5,pers:438,nukes:0,tech:48,stab:44,ppp:2.4,mix:[.55,.18,.27],terr:1.25,energy:0,fin:1,proj:300,intel:50,hawk:.3,econ:.3,risk:.25,loyal:.4,
  voice:'埃及总统府与外交部',voiceEn:"Egypt's Presidency and Foreign Ministry",
  doctrine:'掌控苏伊士运河，阿拉伯世界人口大国；经济困难依赖海湾与国际援助，与以色列维持和平条约，对尼罗河水源问题（埃塞俄比亚大坝）强硬。',
  doctrineEn:"Controls the Suez Canal and is the Arab world's most populous state; economically strained and reliant on Gulf and international support; keeps its peace treaty with Israel; hardline on Nile water (Ethiopia's dam)."},
 {id:'WAF',name:'西非',en:'West Africa',gov:'hyb',pop:464,gdp:847,growth:4.2,milex:7.5,pers:320,nukes:0,tech:34,stab:32,ppp:2.2,mix:[.75,.10,.15],terr:1.25,energy:1,fin:1,proj:150,intel:30,hawk:.25,econ:.25,risk:.35,loyal:.25,
  voice:'尼日利亚、西共体与萨赫勒国家',voiceEn:'Nigeria, ECOWAS and the Sahel states',
  doctrine:'（尼日利亚为主，含萨赫勒军政府国家）安全危机与政变频发，萨赫勒国家已转向俄罗斯；资源丰富、人口年轻，对前殖民宗主国态度复杂。',
  doctrineEn:'(Led by Nigeria; includes the Sahel juntas) frequent security crises and coups, with the Sahel states having turned toward Russia; resource-rich with a young population; complicated feelings toward former colonial powers.'},
 {id:'CAS',name:'中亚与阿富汗',en:'Central Asia & Afghanistan',gov:'aut',pop:126,gdp:689,growth:5.0,milex:5.9,pers:310,nukes:0,tech:44,stab:50,ppp:2.3,mix:[.72,.03,.25],terr:1.5,energy:2,fin:1,proj:150,intel:40,hawk:.2,econ:.3,risk:.2,loyal:.4,
  voice:'哈萨克斯坦、乌兹别克斯坦等中亚国家',voiceEn:'Central Asian governments (Kazakhstan, Uzbekistan and others)',
  doctrine:'（含阿富汗）传统上属于俄罗斯势力范围，同时深度参与中国“一带一路”；奉行多向平衡外交，能源丰富，内陆国家依赖过境通道。',
  doctrineEn:"(Includes Afghanistan) traditionally within Russia's sphere while deeply engaged in China's Belt and Road; multi-vector diplomacy; energy-rich, landlocked and dependent on transit routes."},
 {id:'MAG',name:'马格里布',en:'Maghreb',gov:'aut',pop:106,gdp:624,growth:3.0,milex:36.6,pers:400,nukes:0,tech:46,stab:48,ppp:1.6,mix:[.55,.15,.30],terr:1.3,energy:2,fin:1,proj:300,intel:42,hawk:.3,econ:.3,risk:.3,loyal:.3,
  voice:'阿尔及利亚、摩洛哥等马格里布国家',voiceEn:'The Maghreb governments (Algeria, Morocco and others)',
  doctrine:'（含利比亚、突尼斯）欧洲的油气供应者之一，内部有西撒哈拉等分歧；与法国关系复杂，对外干涉敏感。',
  doctrineEn:"(Includes Libya and Tunisia) one of Europe's oil and gas suppliers; internal disputes such as Western Sahara; complicated relations with France; sensitive to outside interference."},
 {id:'IRN',name:'伊朗',en:'Iran',gov:'aut',pop:92,gdp:300,growth:.3,milex:7.4,pers:610,nukes:0,nukeProg:40,tech:55,stab:38,ppp:2.6,mix:[.55,.13,.32],terr:1.55,energy:2,fin:1,proj:2000,intel:58,hawk:.7,econ:.25,risk:.6,loyal:.5,
  voice:'伊朗外交部与伊斯兰革命卫队',voiceEn:"Iran's Foreign Ministry and the Revolutionary Guards",
  doctrine:'视美国与以色列为主要敌人，依靠导弹、无人机与地区代理网络实施非对称威慑；长期受制裁，经济困难，核计划是与西方博弈的筹码。',
  doctrineEn:'Sees the US and Israel as its main enemies and relies on missiles, drones and a regional proxy network for asymmetric deterrence; long under sanctions with a struggling economy; its nuclear program is its main bargaining chip with the West.'},
 {id:'LEV',name:'伊拉克与黎凡特',en:'Iraq & Levant',gov:'hyb',pop:95,gdp:405,growth:2.0,milex:11,pers:450,nukes:0,tech:38,stab:30,ppp:1.9,mix:[.72,.05,.23],terr:1.3,energy:2,fin:1,proj:150,intel:35,hawk:.3,econ:.2,risk:.3,loyal:.25,
  voice:'伊拉克、叙利亚、约旦、黎巴嫩等',voiceEn:'Iraq, Syria, Jordan, Lebanon and others',
  doctrine:'（含巴勒斯坦地区）长期战乱后处于重建与派系博弈中，受伊朗、土耳其、海湾与美国多方影响；石油资源丰富但国家能力较弱。',
  doctrineEn:'(Includes the Palestinian territories) rebuilding after long wars amid factional rivalry; influenced by Iran, Turkey, the Gulf states and the US; oil-rich but with weak state capacity.'},
 {id:'UKR',name:'乌克兰',en:'Ukraine',gov:'dem',pop:36,gdp:225,growth:2.0,milex:84.1,pers:880,nukes:0,tech:64,stab:48,ppp:1.9,mix:[.66,.04,.30],terr:1.2,energy:-1,fin:1,proj:300,intel:62,hawk:.6,econ:.3,risk:.6,loyal:.6,
  voice:'乌克兰总统办公室与外交部',voiceEn:"Ukraine's Presidential Office and Foreign Ministry",
  doctrine:'正抵御俄罗斯的全面入侵，军费占GDP约四成；高度依赖西方援助，无人机与远程打击能力发展迅速；寻求安全保证与加入欧盟。',
  doctrineEn:"Defending against Russia's full-scale invasion with defense spending near 40% of GDP; heavily reliant on Western aid; fast-growing drone and long-range strike capabilities; seeks security guarantees and EU membership."},
 {id:'EAF',name:'东非与非洲之角',en:'East Africa & Horn',gov:'hyb',pop:429,gdp:534,growth:5.0,milex:7.7,pers:650,nukes:0,tech:32,stab:30,ppp:2.2,mix:[.78,.07,.15],terr:1.35,energy:0,fin:1,proj:150,intel:32,hawk:.3,econ:.2,risk:.35,loyal:.25,
  voice:'埃塞俄比亚、肯尼亚等东非国家',voiceEn:'East African governments (Ethiopia, Kenya and others)',
  doctrine:'（含苏丹、索马里、红海沿岸）人口增长快、冲突多发，红海航道战略地位突出；多国在此驻军，大国竞争激烈。',
  doctrineEn:'(Includes Sudan, Somalia and the Red Sea coast) fast population growth and frequent conflict; the Red Sea route is strategically vital; many foreign powers keep bases here and competition is intense.'},
 {id:'CAF',name:'中部非洲',en:'Central Africa',gov:'aut',pop:179,gdp:272,growth:4.0,milex:3.7,pers:220,nukes:0,tech:26,stab:24,ppp:2.2,mix:[.80,.05,.15],terr:1.45,energy:1,fin:1,proj:100,intel:25,hawk:.25,econ:.15,risk:.35,loyal:.2,
  voice:'刚果（金）、喀麦隆、乍得等中部非洲国家',voiceEn:'Central African governments (DR Congo, Cameroon, Chad and others)',
  doctrine:'关键矿产（钴、铜等）储量巨大但国家治理薄弱，东部冲突持续；对外依赖矿业投资，易受外部势力影响。',
  doctrineEn:'Huge reserves of critical minerals (cobalt, copper) but weak governance and persistent conflict in the east; dependent on mining investment and vulnerable to outside influence.'},
 {id:'CAM',name:'中美洲与加勒比',en:'Central America & Caribbean',gov:'hyb',pop:92.4,gdp:786,growth:3.0,milex:5.1,pers:190,nukes:0,tech:42,stab:40,ppp:1.5,mix:[.65,.20,.15],terr:1.25,energy:-1,fin:1,proj:100,intel:30,hawk:.1,econ:.2,risk:.15,loyal:.3,
  voice:'中美洲与加勒比诸国',voiceEn:'Central American and Caribbean governments',
  doctrine:'（含古巴、巴拿马运河区）处于美国后院，经济依赖侨汇与对美贸易；古巴、尼加拉瓜等与美国关系紧张，整体军力薄弱。',
  doctrineEn:"(Includes Cuba and the Panama Canal) America's backyard, economically dependent on remittances and trade with the US; Cuba and Nicaragua are at odds with Washington; militarily weak overall."},
 {id:'BLR',name:'白俄罗斯',en:'Belarus',gov:'aut',pop:9,gdp:102,growth:2.0,milex:1.5,pers:60,nukes:0,tech:55,stab:58,ppp:2.2,mix:[.70,0,.30],terr:1.15,energy:-1,fin:1,proj:100,intel:45,hawk:.45,econ:.2,risk:.4,loyal:.85,
  voice:'白俄罗斯总统办公室',voiceEn:'The Belarusian Presidential Office',
  doctrine:'与俄罗斯组成联盟国家，境内部署俄方战术核武器；经济高度依赖俄罗斯，外交上几乎完全与莫斯科保持一致。',
  doctrineEn:'Forms a Union State with Russia and hosts Russian tactical nuclear weapons; economically dependent on Russia and almost fully aligned with Moscow.'},
 {id:'CAU',name:'高加索三国',en:'Caucasus',gov:'hyb',pop:17.2,gdp:153,growth:4.0,milex:7.8,pers:126,nukes:0,tech:48,stab:50,ppp:1.9,mix:[.70,.05,.25],terr:1.5,energy:1,fin:1,proj:100,intel:42,hawk:.4,econ:.25,risk:.4,loyal:.3,
  voice:'阿塞拜疆、格鲁吉亚、亚美尼亚政府',voiceEn:'The governments of Azerbaijan, Georgia and Armenia',
  doctrine:'（简化为一体）处于俄罗斯、土耳其、伊朗交汇处，内部矛盾深；阿塞拜疆与土耳其结盟，亚美尼亚正疏远俄罗斯；能源过境通道。',
  doctrineEn:'(Played as one actor) at the crossroads of Russia, Turkey and Iran with deep internal divisions; Azerbaijan is allied with Turkey and Armenia is drifting from Russia; an energy transit corridor.'},
 {id:'OCE',name:'新西兰与太平洋',en:'NZ & Pacific',gov:'dem',pop:17.8,gdp:322,growth:2.0,milex:3.2,pers:17,nukes:0,tech:72,stab:70,ppp:1.2,mix:[.35,.35,.30],terr:1.4,energy:0,fin:1,proj:300,intel:50,hawk:.15,econ:.35,risk:.15,loyal:.5,
  voice:'新西兰与太平洋岛国论坛',voiceEn:'New Zealand and the Pacific Islands Forum',
  doctrine:'（含巴布亚新几内亚、斐济等）小国外交，重视无核化与气候议题；是中美在南太平洋竞争的焦点。',
  doctrineEn:'(Includes Papua New Guinea and Fiji) small-state diplomacy focused on a nuclear-free Pacific and climate; a focal point of US–China competition in the South Pacific.'},
 {id:'BLT',name:'波罗的海三国',en:'Baltic States',gov:'dem',pop:6,gdp:212,growth:2.5,milex:6.9,pers:37,nukes:0,tech:76,stab:70,ppp:1.2,mix:[.62,.08,.30],terr:1.05,energy:-1,fin:1,proj:100,intel:55,hawk:.6,econ:.4,risk:.4,loyal:.9,
  voice:'爱沙尼亚、拉脱维亚、立陶宛政府',voiceEn:'The governments of Estonia, Latvia and Lithuania',
  doctrine:'北约最前沿的小国，视俄罗斯为直接威胁；高度依赖北约集体防御承诺，对俄立场最为强硬。',
  doctrineEn:"NATO's most exposed frontline states, seeing Russia as a direct threat; heavily reliant on NATO's collective defense and the most hawkish on Russia."},
 {id:'MNG',name:'蒙古',en:'Mongolia',gov:'dem',pop:3.5,gdp:28,growth:5.5,milex:.2,pers:10,nukes:0,tech:38,stab:58,ppp:2.2,mix:[.75,0,.25],terr:1.35,energy:1,fin:1,proj:50,intel:30,hawk:.1,econ:.2,risk:.15,loyal:.3,
  voice:'蒙古国政府',voiceEn:'The Mongolian government',
  doctrine:'夹在中俄之间的内陆民主国家，奉行“第三邻国”政策，与美日韩发展关系，同时经济依赖中国。',
  doctrineEn:"A landlocked democracy between China and Russia pursuing a 'third neighbor' policy with the US, Japan and South Korea while depending economically on China."},
 {id:'PRK',name:'朝鲜',en:'North Korea',gov:'aut',pop:26.5,gdp:20,growth:1.5,milex:4,pers:1280,nukes:50,tech:40,stab:72,ppp:3.2,mix:[.68,.10,.22],terr:1.5,energy:-1,fin:0,proj:12000,icbm:1,intel:52,hawk:.9,econ:.05,risk:.8,loyal:.5,
  voice:'朝鲜外务省与朝中社',voiceEn:"North Korea's Foreign Ministry and KCNA",
  doctrine:'以核武与导弹为政权生存保障，对美韩高度敌视；与俄罗斯签有互助条约并向其提供军援，依赖中国经济输血；惯用边缘政策施压。',
  doctrineEn:'Relies on nuclear weapons and missiles for regime survival and is deeply hostile to the US and South Korea; has a mutual assistance treaty with Russia and supplies it with arms; dependent on China economically; habitually uses brinkmanship.'},
];

// 同盟集团（集体防御） / Defensive blocs
const BLOCS = [
 {id:'NATO',name:'北约',en:'NATO',type:'defense',leader:'USA',members:['USA','CAN','GBR','FRA','DEU','ITA','IBE','POL','NOR','BNL','CEU','BAL','BLT','TUR']},
 {id:'CSTO',name:'集安组织',en:'CSTO',type:'defense',leader:'RUS',members:['RUS','BLR','CAS']},
];
// 经济集团 / Economic blocs
const ECON = {
 EU:['FRA','DEU','ITA','IBE','POL','NOR','BNL','CEU','BAL','BLT'],
 USMCA:['USA','CAN','MEX'],
 RCEP:['CHN','JPN','KOR','ASN','AUS','OCE'],
 CPTPP:['JPN','CAN','MEX','AUS','OCE','ASN','GBR','SCO','AND'],
 EAEU:['RUS','BLR','CAS','CAU'],
 BRICS:['BRA','RUS','IND','CHN','SAF','EGY','IRN','GLF','EAF','ASN'],
 SCO:['CHN','RUS','IND','PAK','IRN','CAS','BLR'],
 MERCOSUR:['BRA','SCO'],
 AfCFTA:['EGY','MAG','WAF','CAF','EAF','SAF'],
};
const ECON_NAMES = {EU:['欧盟','EU'],USMCA:['美墨加协定','USMCA'],RCEP:['RCEP','RCEP'],CPTPP:['CPTPP','CPTPP'],EAEU:['欧亚经济联盟','EAEU'],BRICS:['金砖国家','BRICS'],SCO:['上合组织','SCO'],MERCOSUR:['南方共同市场','Mercosur'],AfCFTA:['非洲自贸区','AfCFTA']};

// 双边条约 / Bilateral treaties: alliance, partner, nap, trade, access
const TREATIES = [
 ['alliance','USA','JPN'],['alliance','USA','KOR'],['alliance','USA','AUS'],['alliance','CHN','PRK'],['alliance','RUS','PRK'],
 ['alliance','RUS','BLR'],['alliance','GLF','PAK'],
 ['partner','USA','TWN'],['partner','USA','ISR'],['partner','USA','GLF'],['partner','USA','ASN'],['partner','USA','UKR'],['partner','USA','EGY'],
 ['partner','GBR','UKR'],['partner','FRA','UKR'],['partner','DEU','UKR'],['partner','POL','UKR'],['partner','NOR','UKR'],['partner','BLT','UKR'],
 ['partner','GBR','AUS'],['partner','JPN','AUS'],['partner','CHN','RUS'],['partner','CHN','PAK'],['partner','RUS','IRN'],['partner','IND','RUS'],
 ['partner','TUR','CAU'],['partner','FRA','IND'],['partner','USA','IND'],['partner','CHN','CAF'],['partner','RUS','WAF'],['partner','GLF','EGY'],
 ['nap','ISR','EGY'],
 ['access','USA','JPN'],['access','USA','KOR'],['access','USA','AUS'],['access','USA','GLF'],['access','USA','DEU'],['access','USA','ITA'],['access','USA','POL'],['access','USA','GBR'],
 ['access','USA','IBE'],['access','USA','TUR'],['access','USA','EAF'],['access','USA','ASN'],['access','USA','NOR'],['access','USA','BLT'],['access','USA','BAL'],
 ['access','RUS','BLR'],['access','RUS','CAS'],['access','RUS','CAU'],['access','CHN','EAF'],['access','FRA','WAF'],['access','FRA','EAF'],['access','FRA','GLF'],['access','GBR','GLF'],['access','GBR','LEV'],
 ['access','TUR','LEV'],['access','CHN','ASN'],['access','IRN','LEV'],
];

// 初始驻军（占总兵力比例） / Initial force deployments (share of total forces)
const FORCES0 = {
 USA:{USA:.80,JPN:.06,KOR:.03,DEU:.03,GLF:.03,POL:.02,ITA:.01,GBR:.01,IBE:.01},
 RUS:{RUS:.97,BLR:.01,CAS:.01,CAU:.01},
 CHN:{CHN:.99,EAF:.01},
 FRA:{FRA:.94,EAF:.02,GLF:.01,BAL:.02,WAF:.01},
 GBR:{GBR:.95,BLT:.02,GLF:.01,BAL:.02},
 DEU:{DEU:.97,BLT:.03},
 TUR:{TUR:.95,LEV:.03,BAL:.02},
};

// 初始双边关系 / Initial relations (-100..100)
const REL = `USA CAN 45|USA MEX 30|USA GBR 75|USA FRA 50|USA DEU 50|USA ITA 55|USA IBE 42|USA POL 70|USA NOR 52|USA BNL 50|USA CEU 40|USA BAL 50|USA BLT 65|USA UKR 45|USA BLR -45|USA RUS -35|USA TUR 25|USA ISR 80|USA GLF 50|USA EGY 35|USA IRN -85|USA LEV 5|USA IND 28|USA PAK 15|USA CHN -40|USA TWN 60|USA JPN 75|USA KOR 65|USA PRK -80|USA ASN 30|USA AUS 70|USA OCE 45|USA BRA -10|USA SCO 35|USA AND -15|USA CAM 0|USA MAG 20|USA CAS 10|USA CAU 20|USA MNG 25|USA SAS 15|USA WAF 5|USA CAF 0|USA EAF 10|USA SAF -10
CHN RUS 65|CHN PRK 45|CHN PAK 75|CHN IRN 45|CHN IND -15|CHN JPN -45|CHN KOR 5|CHN TWN -65|CHN ASN 15|CHN AUS -10|CHN GBR -15|CHN FRA 5|CHN DEU 5|CHN ITA 5|CHN BRA 35|CHN SAF 35|CHN EGY 30|CHN GLF 30|CHN MAG 20|CHN WAF 30|CHN CAF 35|CHN EAF 30|CHN CAS 45|CHN MNG 20|CHN SAS 30|CHN BLR 45|CHN UKR -5|CHN TUR 15|CHN LEV 15|CHN ISR -10|CHN CAM 10|CHN AND 20|CHN SCO 15|CHN MEX 0|CHN CAN -15|CHN OCE 0|CHN NOR -5|CHN POL -10|CHN BLT -30|CHN CEU 5|CHN BAL 10|CHN IBE 10|CHN BNL 0
RUS UKR -95|RUS BLR 90|RUS POL -75|RUS BLT -80|RUS NOR -60|RUS DEU -55|RUS FRA -55|RUS GBR -70|RUS ITA -40|RUS IBE -40|RUS BNL -55|RUS CEU -25|RUS BAL -20|RUS TUR 10|RUS CAU -5|RUS CAS 45|RUS MNG 30|RUS IRN 50|RUS PRK 65|RUS IND 45|RUS PAK 5|RUS JPN -45|RUS KOR -30|RUS CAN -55|RUS AUS -45|RUS ISR 0|RUS GLF 25|RUS EGY 25|RUS LEV -5|RUS MAG 25|RUS WAF 20|RUS CAF 15|RUS EAF 15|RUS SAF 15|RUS BRA 20|RUS AND 5|RUS CAM 15|RUS SCO -10|RUS ASN 10|RUS TWN -30|RUS OCE -20|RUS SAS 10
IND PAK -75|IND JPN 50|IND AUS 45|IND FRA 50|IND GBR 35|IND DEU 35|IND ISR 50|IND IRN 20|IND GLF 45|IND SAS 15|IND ASN 35|IND CAS 25|IND KOR 30|IND TWN 10|IND EGY 25|IND TUR -15|IND BRA 25|IND SAF 30|IND EAF 25|IND MNG 20
PAK GLF 60|PAK TUR 55|PAK IRN 10|PAK CAS -25|PAK SAS 10
JPN KOR 25|JPN PRK -75|JPN TWN 50|JPN ASN 45|JPN GBR 45|JPN FRA 40|JPN DEU 40|JPN ITA 40|JPN OCE 35|JPN AUS 60|JPN MNG 35
KOR PRK -70|KOR MNG 30|KOR AUS 40|KOR ASN 40
TWN ASN 15
ISR IRN -95|ISR LEV -45|ISR EGY 10|ISR GLF 5|ISR TUR -40|ISR GBR 20|ISR FRA 5|ISR DEU 45|ISR IBE -20|ISR MAG -10|ISR BAL 20
IRN GLF -15|IRN LEV 15|IRN TUR 0|IRN CAS 5|IRN CAU -5|IRN EGY 5|IRN GBR -50|IRN FRA -45|IRN DEU -45
TUR BAL 5|TUR LEV 10|TUR CAU 30|TUR UKR 25|TUR GLF 25|TUR EGY 10|TUR DEU 30|TUR FRA 10
GLF EGY 45|GLF EAF 10|GLF LEV 20|GLF MAG 20|GLF GBR 35|GLF FRA 35
EGY EAF -15|EGY MAG 15|EGY LEV 20
UKR BLR -60|UKR POL 60|UKR BLT 75|UKR NOR 70|UKR GBR 75|UKR FRA 65|UKR DEU 65|UKR CEU 20|UKR BAL 35|UKR ITA 55|UKR BNL 65|UKR IBE 55|UKR CAN 70|UKR JPN 45
FRA DEU 70|DEU POL 50|POL BLT 80|NOR BLT 70|GBR FRA 60|GBR DEU 60|GBR NOR 65|GBR POL 60|FRA ITA 55|CEU POL 45|BAL CEU 45|GBR CAN 65|FRA CAN 55|GBR BNL 60
BLR POL -60|BLR BLT -65
CAS TUR 25|CAU IRN -5|MNG CHN 20
ASN AUS 45|ASN RUS 10
AUS OCE 60|AUS GBR 70|OCE GBR 45|OCE FRA 20|AUS FRA 25
BRA SCO 30|BRA AND 25|BRA MEX 25|MEX CAM 30|SCO GBR -10
WAF FRA -25|MAG FRA 5|MAG IBE 20|SAF EAF 15|CAF EAF 10|WAF MAG 10`;

// 热点对 / Flashpoint pairs
const FLASHPOINTS = [['CHN','TWN'],['RUS','UKR'],['IND','PAK'],['KOR','PRK'],['ISR','IRN'],['CHN','JPN'],['USA','IRN'],['RUS','BLT'],['GLF','IRN'],['EGY','EAF'],['TUR','BAL'],['CHN','ASN'],['RUS','POL'],['CHN','IND']];

/* 战略议程 / Strategic agendas
 * goals: 目标键（见 i18n goal.*）；stance: 对其他国家的基本方针 contain 遏制 / coerce 施压 / attack 进攻 / court 拉拢 / support 支持 / hedge 两面下注
 * red: 公开红线（仅针对玩家触发） type: attack / attack_ally / forces_in / alliance_with / nuke_use / nuke_program / blockade / annex
 */
const AGENDA = {
 USA:{goals:['contain_rival','protect_allies','hemisphere'],stance:{CHN:'contain',RUS:'contain',IRN:'contain',PRK:'contain',UKR:'support',TWN:'support',ISR:'support',IND:'court',CAM:'coerce'},red:[{type:'attack_ally'},{type:'nuke_use'},{type:'attack',t:'TWN'},{type:'blockade',t:'TWN'},{type:'forces_in',loc:'CAM'}]},
 CHN:{goals:['reunify','break_containment','tech_self'],stance:{TWN:'coerce',USA:'hedge',JPN:'contain',RUS:'support',PAK:'support',PRK:'support',ASN:'court',CAF:'court',SAS:'court',IND:'hedge'},red:[{type:'forces_in',loc:'TWN'},{type:'alliance_with',t:'TWN'},{type:'attack',t:'PRK'},{type:'attack',t:'PAK'}]},
 RUS:{goals:['ukraine','weaken_nato','near_abroad'],stance:{UKR:'attack',POL:'contain',BLT:'coerce',USA:'contain',GBR:'contain',NOR:'contain',BLR:'support',CAS:'court',IRN:'support',PRK:'support',CHN:'court',CAU:'coerce'},red:[{type:'forces_in',loc:'UKR'},{type:'forces_in',loc:'BLR'},{type:'attack',t:'BLR'},{type:'alliance_with',t:'UKR'}]},
 IND:{goals:['south_asia','deter_pak','autonomy'],stance:{PAK:'contain',CHN:'hedge',SAS:'court',USA:'court',RUS:'court',JPN:'court'},red:[{type:'forces_in',loc:'SAS'},{type:'attack',t:'SAS'}]},
 JPN:{goals:['alliance_core','deter_china','economy'],stance:{CHN:'hedge',PRK:'contain',USA:'support',TWN:'support',AUS:'court',KOR:'court'},red:[{type:'attack',t:'TWN'},{type:'blockade',t:'TWN'},{type:'attack_ally'}]},
 DEU:{goals:['europe_security','economy'],stance:{RUS:'contain',UKR:'support',POL:'support'},red:[{type:'attack_ally'}]},
 GBR:{goals:['europe_security','atlantic'],stance:{RUS:'contain',UKR:'support',IRN:'contain',USA:'support'},red:[{type:'attack_ally'}]},
 FRA:{goals:['autonomy_eu','africa'],stance:{RUS:'contain',UKR:'support',WAF:'court',MAG:'court'},red:[{type:'attack_ally'}]},
 TUR:{goals:['regional_power','straits'],stance:{CAU:'support',LEV:'coerce',BAL:'hedge',RUS:'hedge',GLF:'court',ISR:'contain'},red:[{type:'attack',t:'CAU'},{type:'forces_in',loc:'LEV'}]},
 IRN:{goals:['nuclear','axis','expel_us'],stance:{ISR:'contain',USA:'contain',GLF:'hedge',LEV:'support',RUS:'court',CHN:'court'},red:[{type:'attack',t:'LEV'},{type:'forces_in',loc:'LEV'}]},
 ISR:{goals:['stop_iran','security'],stance:{IRN:'contain',LEV:'contain',USA:'support'},red:[{type:'nuke_program'},{type:'attack',t:'ISR'}]},
 PAK:{goals:['deter_india','survival'],stance:{IND:'contain',CHN:'support',GLF:'court'},red:[{type:'forces_in',loc:'CAS'}]},
 PRK:{goals:['regime','nuclear'],stance:{KOR:'coerce',USA:'contain',JPN:'contain',RUS:'support',CHN:'court'},red:[{type:'forces_in',loc:'KOR'},{type:'attack',t:'PRK'}]},
 GLF:{goals:['energy','counter_iran'],stance:{IRN:'contain',USA:'court',CHN:'court',EGY:'support',PAK:'support'},red:[{type:'blockade',t:'GLF'},{type:'attack',t:'EGY'}]},
 KOR:{goals:['deter_north','economy'],stance:{PRK:'contain',CHN:'hedge',USA:'support',JPN:'court'},red:[{type:'attack',t:'KOR'}]},
 AUS:{goals:['indo_pacific','pacific_islands'],stance:{CHN:'hedge',OCE:'court',USA:'support',ASN:'court'},red:[{type:'forces_in',loc:'OCE'}]},
 POL:{goals:['europe_security'],stance:{RUS:'contain',BLR:'contain',UKR:'support'},red:[{type:'attack',t:'BLT'},{type:'attack',t:'UKR'}]},
 BLT:{goals:['europe_security'],stance:{RUS:'contain',BLR:'contain',UKR:'support'},red:[{type:'attack',t:'POL'}]},
 NOR:{goals:['europe_security','arctic'],stance:{RUS:'contain',UKR:'support'},red:[{type:'attack',t:'BLT'}]},
 UKR:{goals:['survive','west_integration'],stance:{RUS:'contain',BLR:'contain',POL:'court',USA:'court',GBR:'court'},red:[]},
 TWN:{goals:['status_quo'],stance:{CHN:'hedge',USA:'court',JPN:'court'},red:[]},
 EGY:{goals:['nile','economy'],stance:{EAF:'coerce',GLF:'court',ISR:'hedge'},red:[{type:'attack',t:'LEV'}]},
 ASN:{goals:['centrality','economy'],stance:{CHN:'hedge',USA:'hedge',JPN:'court',AUS:'court'},red:[{type:'blockade',t:'ASN'}]},
 BRA:{goals:['autonomy','economy'],stance:{SCO:'court',AND:'court'},red:[{type:'forces_in',loc:'AND'}]},
 VOID:{},
};

// 大选周期（民主/混合政体）：下一次选举所在回合（第0回合=2026年第4季度） / Next election turn
const ELECTIONS = { USA:8 };

/* 具体装备存量（约数，用于把抽象战力换算成坦克/作战飞机/主要舰艇数）：[主战坦克, 作战飞机, 主要作战舰艇含潜艇] */
const INV = {
 USA:[2640,3300,190], CHN:[4800,2500,160], RUS:[2000,1100,80], IND:[3700,750,77], JPN:[400,330,60], DEU:[300,230,25], GBR:[210,230,35], FRA:[215,250,40],
 ITA:[150,200,40], IBE:[400,230,45], BRA:[300,100,20], CAN:[80,80,12], AUS:[60,110,20], MEX:[30,20,30], KOR:[2200,560,60], TUR:[2300,300,45], ASN:[1200,500,120],
 BNL:[20,100,20], GLF:[1800,650,40], POL:[800,90,8], CEU:[250,90,0], TWN:[800,400,30], NOR:[300,250,40], ISR:[1300,340,15], SCO:[350,100,25], AND:[200,150,35],
 SAS:[300,80,30], BAL:[800,200,40], SAF:[200,100,10], PAK:[2500,400,25], EGY:[2500,500,40], WAF:[300,60,20], CAS:[1200,200,0], MAG:[1500,300,25], IRN:[1500,250,25],
 LEV:[800,150,5], UKR:[1000,70,2], EAF:[900,80,5], CAF:[200,20,2], CAM:[300,40,10], BLR:[500,60,0], CAU:[500,60,5], OCE:[0,10,10], BLT:[0,0,5], MNG:[400,10,0], PRK:[3500,550,70],
};
