// 城市坐标 → 与地图相同的 Natural Earth 投影；并计算各地区凸包（用于战线显示）。输出 ../src/cities.js
import fs from 'fs';
const M = '/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules';
const d3 = await import(M + '/d3-geo/src/index.js');
const ne = JSON.parse(fs.readFileSync('./ne/geojson/ne_50m_admin_0_countries.geojson', 'utf8'));
const feats = ne.features.filter(f => f.properties.ADM0_A3 !== 'ATA');
const W = 2000; const proj = d3.geoNaturalEarth1(); proj.fitWidth(W - 20, { type: 'FeatureCollection', features: feats });
const pathGen = d3.geoPath(proj); const b = pathGen.bounds({ type: 'FeatureCollection', features: feats }); const [tx, ty] = proj.translate(); proj.translate([tx - b[0][0] + 10, ty - b[0][1] + 10]);
// [中文, English, 经度, 纬度, 首都]
const C = {
 USA: [['华盛顿','Washington',-77.04,38.9,1],['纽约','New York',-74.0,40.71],['芝加哥','Chicago',-87.63,41.88],['洛杉矶','Los Angeles',-118.24,34.05],['休斯敦','Houston',-95.37,29.76],['西雅图','Seattle',-122.33,47.6],['檀香山','Honolulu',-157.86,21.31]],
 CAN: [['渥太华','Ottawa',-75.7,45.42,1],['多伦多','Toronto',-79.38,43.65],['蒙特利尔','Montreal',-73.57,45.5],['温哥华','Vancouver',-123.12,49.28],['卡尔加里','Calgary',-114.07,51.05],['哈利法克斯','Halifax',-63.57,44.65]],
 MEX: [['墨西哥城','Mexico City',-99.13,19.43,1],['蒙特雷','Monterrey',-100.32,25.69],['瓜达拉哈拉','Guadalajara',-103.35,20.67],['蒂华纳','Tijuana',-117.04,32.51],['韦拉克鲁斯','Veracruz',-96.13,19.19]],
 CAM: [['哈瓦那','Havana',-82.37,23.11,1],['危地马拉城','Guatemala City',-90.51,14.63],['马那瓜','Managua',-86.25,12.13],['巴拿马城','Panama City',-79.52,8.98],['圣多明各','Santo Domingo',-69.93,18.49],['圣何塞','San José',-84.09,9.93]],
 BRA: [['巴西利亚','Brasília',-47.88,-15.79,1],['圣保罗','São Paulo',-46.63,-23.55],['里约热内卢','Rio de Janeiro',-43.17,-22.91],['萨尔瓦多','Salvador',-38.5,-12.97],['马瑙斯','Manaus',-60.02,-3.12],['阿雷格里港','Porto Alegre',-51.23,-30.03],['累西腓','Recife',-34.88,-8.05]],
 SCO: [['布宜诺斯艾利斯','Buenos Aires',-58.38,-34.6,1],['圣地亚哥','Santiago',-70.67,-33.45],['蒙得维的亚','Montevideo',-56.16,-34.9],['亚松森','Asunción',-57.58,-25.26],['科尔多瓦','Córdoba',-64.18,-31.42]],
 AND: [['波哥大','Bogotá',-74.07,4.71,1],['加拉加斯','Caracas',-66.9,10.48],['利马','Lima',-77.04,-12.05],['基多','Quito',-78.47,-0.18],['拉巴斯','La Paz',-68.15,-16.5],['麦德林','Medellín',-75.56,6.25]],
 GBR: [['伦敦','London',-0.13,51.51,1],['伯明翰','Birmingham',-1.9,52.49],['曼彻斯特','Manchester',-2.24,53.48],['格拉斯哥','Glasgow',-4.25,55.86],['贝尔法斯特','Belfast',-5.93,54.6],['普利茅斯','Plymouth',-4.14,50.37]],
 FRA: [['巴黎','Paris',2.35,48.86,1],['里尔','Lille',3.06,50.63],['斯特拉斯堡','Strasbourg',7.75,48.57],['里昂','Lyon',4.84,45.76],['马赛','Marseille',5.37,43.3],['波尔多','Bordeaux',-0.58,44.84],['布雷斯特','Brest',-4.49,48.39]],
 DEU: [['柏林','Berlin',13.4,52.52,1],['汉堡','Hamburg',9.99,53.55],['慕尼黑','Munich',11.58,48.14],['科隆','Cologne',6.96,50.94],['法兰克福','Frankfurt',8.68,50.11],['德累斯顿','Dresden',13.74,51.05]],
 ITA: [['罗马','Rome',12.5,41.9,1],['米兰','Milan',9.19,45.46],['那不勒斯','Naples',14.27,40.85],['都灵','Turin',7.69,45.07],['巴勒莫','Palermo',13.36,38.12],['威尼斯','Venice',12.33,45.44]],
 IBE: [['马德里','Madrid',-3.7,40.42,1],['巴塞罗那','Barcelona',2.17,41.39],['里斯本','Lisbon',-9.14,38.72],['塞维利亚','Seville',-5.98,37.39],['瓦伦西亚','Valencia',-0.38,39.47],['毕尔巴鄂','Bilbao',-2.93,43.26]],
 POL: [['华沙','Warsaw',21.01,52.23,1],['克拉科夫','Kraków',19.94,50.06],['格但斯克','Gdańsk',18.65,54.35],['弗罗茨瓦夫','Wrocław',17.04,51.11],['波兹南','Poznań',16.93,52.41],['卢布林','Lublin',22.57,51.25]],
 NOR: [['斯德哥尔摩','Stockholm',18.07,59.33,1],['奥斯陆','Oslo',10.75,59.91],['哥本哈根','Copenhagen',12.57,55.68],['赫尔辛基','Helsinki',24.94,60.17],['都柏林','Dublin',-6.26,53.35],['雷克雅未克','Reykjavík',-21.94,64.15],['哥德堡','Gothenburg',11.97,57.71]],
 BNL: [['布鲁塞尔','Brussels',4.35,50.85,1],['阿姆斯特丹','Amsterdam',4.9,52.37],['鹿特丹','Rotterdam',4.48,51.92],['安特卫普','Antwerp',4.4,51.22],['卢森堡','Luxembourg',6.13,49.61]],
 CEU: [['维也纳','Vienna',16.37,48.21,1],['布拉格','Prague',14.42,50.08],['布达佩斯','Budapest',19.04,47.5],['布拉迪斯拉发','Bratislava',17.11,48.15],['苏黎世','Zurich',8.54,47.37],['卢布尔雅那','Ljubljana',14.51,46.06]],
 BAL: [['布加勒斯特','Bucharest',26.1,44.43,1],['贝尔格莱德','Belgrade',20.46,44.79],['索非亚','Sofia',23.32,42.7],['雅典','Athens',23.73,37.98],['萨格勒布','Zagreb',15.98,45.81],['基希讷乌','Chișinău',28.86,47.01],['塞萨洛尼基','Thessaloniki',22.94,40.64]],
 BLT: [['里加','Riga',24.1,56.95,1],['塔林','Tallinn',24.75,59.44],['维尔纽斯','Vilnius',25.28,54.69],['考纳斯','Kaunas',23.9,54.9]],
 UKR: [['基辅','Kyiv',30.52,50.45,1],['哈尔科夫','Kharkiv',36.23,49.99],['顿涅茨克','Donetsk',37.8,48.0],['扎波罗热','Zaporizhzhia',35.14,47.84],['第聂伯','Dnipro',35.05,48.46],['敖德萨','Odesa',30.73,46.48],['利沃夫','Lviv',24.03,49.84],['塞瓦斯托波尔','Sevastopol',33.52,44.62]],
 BLR: [['明斯克','Minsk',27.56,53.9,1],['布列斯特','Brest',23.69,52.1],['戈梅利','Gomel',30.98,52.43],['维捷布斯克','Vitebsk',30.2,55.19],['格罗德诺','Grodno',23.83,53.68]],
 RUS: [['莫斯科','Moscow',37.62,55.76,1],['圣彼得堡','St Petersburg',30.34,59.93],['斯摩棱斯克','Smolensk',32.04,54.78],['加里宁格勒','Kaliningrad',20.45,54.71],['罗斯托夫','Rostov',39.72,47.23],['伏尔加格勒','Volgograd',44.52,48.71],['喀山','Kazan',49.11,55.8],['叶卡捷琳堡','Yekaterinburg',60.6,56.84],['新西伯利亚','Novosibirsk',82.92,55.03],['摩尔曼斯克','Murmansk',33.08,68.97],['符拉迪沃斯托克','Vladivostok',131.89,43.12]],
 TUR: [['安卡拉','Ankara',32.85,39.93,1],['伊斯坦布尔','Istanbul',28.98,41.01],['伊兹密尔','Izmir',27.14,38.42],['阿达纳','Adana',35.33,37.0],['特拉布宗','Trabzon',39.72,41.0],['迪亚巴克尔','Diyarbakır',40.23,37.91]],
 CAU: [['巴库','Baku',49.87,40.41,1],['第比利斯','Tbilisi',44.79,41.72],['埃里温','Yerevan',44.51,40.18],['巴统','Batumi',41.64,41.65]],
 CAS: [['塔什干','Tashkent',69.24,41.3,1],['阿拉木图','Almaty',76.95,43.24],['阿斯塔纳','Astana',71.45,51.17],['喀布尔','Kabul',69.17,34.53],['阿什哈巴德','Ashgabat',58.38,37.95],['比什凯克','Bishkek',74.59,42.87],['杜尚别','Dushanbe',68.78,38.56]],
 MNG: [['乌兰巴托','Ulaanbaatar',106.92,47.92,1],['达尔汗','Darkhan',105.95,49.49],['乔巴山','Choibalsan',114.5,48.07]],
 IRN: [['德黑兰','Tehran',51.39,35.69,1],['伊斯法罕','Isfahan',51.67,32.65],['大不里士','Tabriz',46.29,38.08],['马什哈德','Mashhad',59.6,36.3],['设拉子','Shiraz',52.53,29.59],['阿巴斯港','Bandar Abbas',56.27,27.18],['阿瓦士','Ahvaz',48.67,31.32]],
 ISR: [['耶路撒冷','Jerusalem',35.21,31.77,1],['特拉维夫','Tel Aviv',34.78,32.09],['海法','Haifa',34.99,32.79],['贝尔谢巴','Beersheba',34.79,31.25],['埃拉特','Eilat',34.95,29.56]],
 LEV: [['巴格达','Baghdad',44.37,33.31,1],['大马士革','Damascus',36.29,33.51],['贝鲁特','Beirut',35.5,33.89],['安曼','Amman',35.93,31.95],['巴士拉','Basra',47.78,30.51],['摩苏尔','Mosul',43.13,36.34],['阿勒颇','Aleppo',37.16,36.2]],
 GLF: [['利雅得','Riyadh',46.68,24.71,1],['吉达','Jeddah',39.19,21.49],['达曼','Dammam',50.1,26.43],['迪拜','Dubai',55.27,25.2],['多哈','Doha',51.53,25.29],['科威特城','Kuwait City',47.98,29.38],['马斯喀特','Muscat',58.41,23.59],['萨那','Sanaa',44.21,15.37]],
 EGY: [['开罗','Cairo',31.24,30.04,1],['亚历山大','Alexandria',29.92,31.2],['塞得港','Port Said',32.3,31.26],['苏伊士','Suez',32.55,29.97],['阿斯旺','Aswan',32.9,24.09]],
 MAG: [['阿尔及尔','Algiers',3.06,36.75,1],['卡萨布兰卡','Casablanca',-7.59,33.57],['拉巴特','Rabat',-6.84,34.02],['奥兰','Oran',-0.64,35.7],['突尼斯','Tunis',10.18,36.81],['的黎波里','Tripoli',13.19,32.89],['班加西','Benghazi',20.07,32.12],['托布鲁克','Tobruk',23.96,32.08]],
 IND: [['新德里','New Delhi',77.21,28.61,1],['孟买','Mumbai',72.88,19.08],['加尔各答','Kolkata',88.36,22.57],['金奈','Chennai',80.27,13.08],['班加罗尔','Bengaluru',77.59,12.97],['海得拉巴','Hyderabad',78.49,17.39],['斯利那加','Srinagar',74.8,34.08],['艾哈迈达巴德','Ahmedabad',72.57,23.02]],
 PAK: [['伊斯兰堡','Islamabad',73.05,33.68,1],['卡拉奇','Karachi',67.0,24.86],['拉合尔','Lahore',74.36,31.52],['白沙瓦','Peshawar',71.58,34.01],['奎达','Quetta',67.01,30.18],['木尔坦','Multan',71.52,30.16]],
 SAS: [['达卡','Dhaka',90.41,23.81,1],['吉大港','Chittagong',91.83,22.36],['科伦坡','Colombo',79.86,6.93],['加德满都','Kathmandu',85.32,27.72],['廷布','Thimphu',89.64,27.47]],
 CHN: [['北京','Beijing',116.4,39.9,1],['上海','Shanghai',121.47,31.23],['广州','Guangzhou',113.26,23.13],['武汉','Wuhan',114.31,30.59],['南京','Nanjing',118.8,32.06],['沈阳','Shenyang',123.43,41.8],['西安','Xi’an',108.94,34.34],['重庆','Chongqing',106.55,29.56],['成都','Chengdu',104.07,30.67],['福州','Fuzhou',119.3,26.07],['哈尔滨','Harbin',126.63,45.75],['昆明','Kunming',102.83,25.04],['乌鲁木齐','Ürümqi',87.62,43.83],['拉萨','Lhasa',91.11,29.65]],
 TWN: [['台北','Taipei',121.56,25.03,1],['桃园','Taoyuan',121.3,24.99],['台中','Taichung',120.68,24.15],['台南','Tainan',120.2,22.99],['高雄','Kaohsiung',120.3,22.63],['花莲','Hualien',121.6,23.99],['澎湖','Penghu',119.58,23.57]],
 JPN: [['东京','Tokyo',139.69,35.69,1],['大阪','Osaka',135.5,34.69],['名古屋','Nagoya',136.91,35.18],['福冈','Fukuoka',130.4,33.59],['广岛','Hiroshima',132.46,34.39],['札幌','Sapporo',141.35,43.06],['仙台','Sendai',140.87,38.27],['那霸','Naha',127.68,26.21]],
 KOR: [['首尔','Seoul',126.98,37.57,1],['仁川','Incheon',126.71,37.46],['大田','Daejeon',127.38,36.35],['大邱','Daegu',128.6,35.87],['光州','Gwangju',126.85,35.16],['釜山','Busan',129.08,35.18]],
 PRK: [['平壤','Pyongyang',125.75,39.03,1],['开城','Kaesong',126.55,37.97],['元山','Wonsan',127.44,39.15],['咸兴','Hamhung',127.54,39.92],['新义州','Sinuiju',124.4,40.1],['清津','Chongjin',129.78,41.8]],
 ASN: [['雅加达','Jakarta',106.85,-6.21,1],['曼谷','Bangkok',100.5,13.76],['马尼拉','Manila',120.98,14.6],['河内','Hanoi',105.85,21.03],['胡志明市','Ho Chi Minh City',106.66,10.76],['新加坡','Singapore',103.82,1.35],['吉隆坡','Kuala Lumpur',101.69,3.14],['仰光','Yangon',96.2,16.87],['金边','Phnom Penh',104.92,11.56],['泗水','Surabaya',112.75,-7.25]],
 AUS: [['堪培拉','Canberra',149.13,-35.28,1],['悉尼','Sydney',151.21,-33.87],['墨尔本','Melbourne',144.96,-37.81],['布里斯班','Brisbane',153.03,-27.47],['珀斯','Perth',115.86,-31.95],['达尔文','Darwin',130.84,-12.46],['阿德莱德','Adelaide',138.6,-34.93]],
 OCE: [['惠灵顿','Wellington',174.78,-41.29,1],['奥克兰','Auckland',174.76,-36.85],['基督城','Christchurch',172.64,-43.53],['莫尔兹比港','Port Moresby',147.18,-9.44],['苏瓦','Suva',178.44,-18.14],['霍尼亚拉','Honiara',159.95,-9.43]],
 WAF: [['阿布贾','Abuja',7.4,9.08,1],['拉各斯','Lagos',3.38,6.52],['阿克拉','Accra',-0.19,5.6],['达喀尔','Dakar',-17.47,14.72],['阿比让','Abidjan',-4.01,5.36],['巴马科','Bamako',-8.0,12.64],['尼亚美','Niamey',2.11,13.51],['卡诺','Kano',8.52,12.0]],
 CAF: [['金沙萨','Kinshasa',15.27,-4.44,1],['布拉柴维尔','Brazzaville',15.28,-4.26],['杜阿拉','Douala',9.7,4.05],['雅温得','Yaoundé',11.52,3.85],['恩贾梅纳','N’Djamena',15.04,12.13],['班吉','Bangui',18.56,4.39],['卢本巴希','Lubumbashi',27.48,-11.66]],
 EAF: [['亚的斯亚贝巴','Addis Ababa',38.74,9.03,1],['内罗毕','Nairobi',36.82,-1.29],['喀土穆','Khartoum',32.53,15.5],['达累斯萨拉姆','Dar es Salaam',39.21,-6.79],['摩加迪沙','Mogadishu',45.32,2.05],['坎帕拉','Kampala',32.58,0.35],['吉布提','Djibouti',43.15,11.59],['阿斯马拉','Asmara',38.93,15.32]],
 SAF: [['比勒陀利亚','Pretoria',28.19,-25.75,1],['约翰内斯堡','Johannesburg',28.05,-26.2],['开普敦','Cape Town',18.42,-33.92],['德班','Durban',31.02,-29.86],['罗安达','Luanda',13.23,-8.84],['哈拉雷','Harare',31.05,-17.83],['卢萨卡','Lusaka',28.32,-15.39],['马普托','Maputo',32.57,-25.97]],
};
const out = {};
for (const [id, list] of Object.entries(C)) out[id] = list.map(([zh, en, lon, lat, cap]) => { const p = proj([lon, lat]); return [zh, en, Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, cap ? 1 : 0]; });
// 各地区凸包（取自 geo.js 的投影路径）
const geoSrc = fs.readFileSync('../src/geo.js', 'utf8'); const GEO = (new Function(geoSrc + ';return GEO;'))();
function hull(pts) { pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); }
const HULL = {};
for (const [id, d] of Object.entries(GEO.paths)) {
  // 只取面积较大的环，避免远离本土的小岛把凸包拉得过大
  const rings = d.split('Z').filter(Boolean).map(r => { const nums = r.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number); const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]); return pts; });
  const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); };
  const withA = rings.map(r => ({ r, a: area(r) })).sort((p, q) => q.a - p.a); const big = withA[0] ? withA[0].a : 0;
  const keep = withA.filter(z => z.a >= big * 0.04 || z.a > 60).flatMap(z => z.r);
  const cityPts = (out[id] || []).map(c => [c[2], c[3]]);
  HULL[id] = hull(keep.concat(cityPts)).map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
}
fs.writeFileSync('../src/cities.js', '/* 城市（投影坐标）与地区凸包：由 build/cities_build.mjs 生成 */\nconst CITIES=' + JSON.stringify(out) + ';\nconst HULL=' + JSON.stringify(HULL) + ';\n');
console.log('cities', Object.values(out).reduce((s, l) => s + l.length, 0), 'hull pts', Object.values(HULL).reduce((s, h) => s + h.length, 0));
