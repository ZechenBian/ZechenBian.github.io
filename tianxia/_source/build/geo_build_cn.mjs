// 网页版用的中国标准地图（显示用）：Natural Earth 10m “中国视角”数据（藏南、阿克赛钦归中国，台湾按省级单位），
// 投影与 geo_build.mjs 完全相同（同样用 50m 数据拟合），只重算显示用的路径：paths / outline / internal / borders / coast / bbox；
// 引擎用到的 label / land / dist / areaPx（以及 w / h / grat / sphere）原样取自 src/geo.js，结算结果不变。
// 另加：南海诸岛、钓鱼岛及其附属岛屿（画成小块，属中国 / 台湾省）与南海断续线（十段，GEO.dash）。输出 ../src/geo_cn.js
import fs from 'fs';
const d3 = await import('d3-geo'); // tianxia/_source/package.json 里固定版本的 d3-geo（先在 tianxia/_source 里 npm install）

const MEMBERS = {
  USA: 'USA PRI VIR GUM MNP ASM UMI',
  CAN: 'CAN',
  MEX: 'MEX',
  CAM: 'GTM BLZ HND SLV NIC CRI PAN CUB JAM HTI DOM BHS TTO BRB GRD VCT LCA KNA ATG DMA',
  BRA: 'BRA BRI',
  SCO: 'ARG CHL URY PRY',
  ANd: 'COL VEN ECU PER BOL GUY SUR',
  GBR: 'GBR JEY GGY IMN FLK SGS IOT SHN PCN BMU AIA CYM VGB TCA MSR GIB',
  FRA: 'FRA MCO SPM WLF MAF BLM PYF NCL ATF CLP',
  DEU: 'DEU',
  ITA: 'ITA VAT SMR MLT',
  IBE: 'ESP PRT AND',
  POL: 'POL',
  NOR: 'SWE NOR FIN ALD DNK FRO GRL ISL IRL',
  BNL: 'NLD BEL LUX ABW CUW SXM',
  CEU: 'CZE SVK AUT HUN CHE SVN LIE',
  BAL: 'ROU BGR GRC SRB HRV BIH MNE ALB MKD KOS MDA CYP CYN ESB WSB',
  BLT: 'EST LVA LTU',
  UKR: 'UKR',
  BLR: 'BLR',
  RUS: 'RUS',
  TUR: 'TUR',
  CAU: 'GEO ARM AZE',
  CAS: 'KAZ UZB TKM KGZ TJK AFG',
  MNG: 'MNG',
  IRN: 'IRN',
  ISR: 'ISR',
  LEV: 'IRQ SYR LBN JOR PSX',
  GLF: 'SAU ARE QAT KWT BHR OMN YEM',
  EGY: 'EGY BRT',
  MAG: 'MAR SAH DZA TUN LBY',
  IND: 'IND KAS',
  PAK: 'PAK',
  SAS: 'BGD LKA NPL BTN MDV',
  CHN: 'CHN HKG MAC SCR',
  TWN: 'TWN',
  JPN: 'JPN',
  KOR: 'KOR',
  PRK: 'PRK',
  ASN: 'IDN VNM THA MYS PHL SGP MMR KHM LAO BRN TLS',
  AUS: 'AUS IOA HMD NFK ATC CSI',
  OCE: 'NZL NIU COK PNG FJI SLB VUT WSM TON FSM MHL PLW KIR NRU TUV',
  WAF: 'NGA GHA CIV SEN MLI BFA NER GIN SLE LBR TGO BEN MRT GMB GNB CPV',
  CAF: 'TCD CAF CMR GAB COG COD GNQ STP',
  EAF: 'ETH KEN TZA UGA RWA BDI SOM SOL DJI ERI SDN SDS SYC COM',
  SAF: 'ZAF NAM BWA ZWE ZMB MOZ AGO MWI LSO SWZ MDG MUS',
};
const RENAME = { ANd: 'AND' };
const code2actor = {};
for (const [a, list] of Object.entries(MEMBERS)) for (const c of list.split(' ')) code2actor[c] = RENAME[a] || a;

// —— 投影：与 geo_build.mjs 相同（用 50m 默认数据拟合） ——
const ne50 = JSON.parse(fs.readFileSync('./ne/geojson/ne_50m_admin_0_countries.geojson', 'utf8'));
const f50 = ne50.features.filter(f => f.properties.ADM0_A3 !== 'ATA');
const W = 2000;
const proj = d3.geoNaturalEarth1();
proj.fitWidth(W - 20, { type: 'FeatureCollection', features: f50 });
const pathGen = d3.geoPath(proj);
const b0 = pathGen.bounds({ type: 'FeatureCollection', features: f50 });
const [tx, ty] = proj.translate();
proj.translate([tx - b0[0][0] + 10, ty - b0[0][1] + 10]);

// —— 几何：10m 中国视角数据 ——
const ne = JSON.parse(fs.readFileSync('./ne/geojson/ne_10m_admin_0_countries_chn.geojson', 'utf8'));
let feats = ne.features.filter(f => f.properties.ADM0_A3 !== 'ATA');
const unmapped = [...new Set(feats.filter(f => !code2actor[f.properties.ADM0_A3]).map(f => f.properties.ADM0_A3))];
if (unmapped.length) { console.log('UNMAPPED', unmapped.join(' ')); process.exit(1); }
// 台湾省：从中国要素里分出台湾岛、澎湖及东侧小岛（金门、马祖属福建，留在大陆一侧）
const TWP = [[119.2, 23.05], [119.85, 22.85], [120.3, 21.55], [121.95, 21.55], [122.35, 25.35], [121.3, 25.5], [120.35, 24.65], [119.25, 23.95]];
function inRing(pt, ring) { let c = false; const [x, y] = pt; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const cen = ring => { let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } return [x / ring.length, y / ring.length]; };
{
  const out = [];
  for (const f of feats) {
    if (code2actor[f.properties.ADM0_A3] !== 'CHN' || f.properties.ADM0_A3 !== 'CHN') { out.push(f); continue; }
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const tw = polys.filter(p => inRing(cen(p[0]), TWP)), cn = polys.filter(p => !inRing(cen(p[0]), TWP));
    console.log('Taiwan Province polygons split from CHN:', tw.length, '| mainland polygons:', cn.length);
    out.push({ type: 'Feature', properties: Object.assign({}, f.properties), geometry: { type: 'MultiPolygon', coordinates: cn } });
    out.push({ type: 'Feature', properties: Object.assign({}, f.properties, { ADM0_A3: 'TWN' }), geometry: { type: 'MultiPolygon', coordinates: tw } });
  }
  feats = out;
}

// —— 拓扑、简化（同 geo_build.mjs） ——
const vKey = new Map(); const vLL = [];
const vid = p => { const k = Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5); let i = vKey.get(k); if (i === undefined) { i = vLL.length; vKey.set(k, i); vLL.push(p); } return i; };
const rings = [];
feats.forEach((f, fi) => {
  const c = f.geometry.coordinates; const polys = f.geometry.type === 'Polygon' ? [c] : c;
  polys.forEach((p, pi) => p.forEach((r, ri) => {
    const ids = []; for (const pt of r) { const i = vid(pt); if (ids[ids.length - 1] !== i) ids.push(i); }
    if (ids[0] === ids[ids.length - 1]) ids.pop();
    if (ids.length >= 3) rings.push({ fi, pi, ri, ids });
  }));
});
const ek = (a, b) => a < b ? a + '|' + b : b + '|' + a;
const edgeOwners = new Map();
rings.forEach((r, ri) => { const n = r.ids.length; for (let i = 0; i < n; i++) { const k = ek(r.ids[i], r.ids[(i + 1) % n]); let s = edgeOwners.get(k); if (!s) edgeOwners.set(k, s = new Set()); s.add(ri); } });
const ownersSig = (a, b) => [...edgeOwners.get(ek(a, b))].sort((x, y) => x - y).join(',');
const arcs = []; const arcIndex = new Map(); const ringArcs = [];
rings.forEach((r, ri) => {
  const n = r.ids.length; const ids = r.ids;
  const isJ = new Array(n).fill(false);
  for (let i = 0; i < n; i++) { const prev = ids[(i - 1 + n) % n], cur = ids[i], next = ids[(i + 1) % n]; if (ownersSig(prev, cur) !== ownersSig(cur, next)) isJ[i] = true; }
  const start = isJ.indexOf(true); const list = [];
  if (start < 0) {
    let m = 0; for (let i = 1; i < n; i++) if (ids[i] < ids[m]) m = i;
    const rot = ids.slice(m).concat(ids.slice(0, m)); const fwd = rot.concat([rot[0]]);
    const rev = [rot[0]].concat(rot.slice(1).reverse()).concat([rot[0]]);
    const kf = 'C' + fwd.join(','), kr = 'C' + rev.join(',');
    let id = arcIndex.get(kf), reversed = false;
    if (id === undefined) { id = arcIndex.get(kr); reversed = id !== undefined; }
    if (id === undefined) { id = arcs.length; arcs.push({ ids: fwd, owners: new Set() }); arcIndex.set(kf, id); }
    arcs[id].owners.add(ri); list.push([id, reversed]);
  } else {
    let i = start;
    do {
      const seq = [ids[i]]; let j = i;
      do { j = (j + 1) % n; seq.push(ids[j]); } while (!isJ[j]);
      const kf = seq.join(','), kr = seq.slice().reverse().join(',');
      let id = arcIndex.get(kf), reversed = false;
      if (id === undefined) { id = arcIndex.get(kr); reversed = id !== undefined; }
      if (id === undefined) { id = arcs.length; arcs.push({ ids: seq, owners: new Set() }); arcIndex.set(kf, id); }
      arcs[id].owners.add(ri); list.push([id, reversed]);
      i = j;
    } while (i !== start);
  }
  ringArcs.push(list);
});
console.log('rings', rings.length, 'arcs', arcs.length);
const P = vLL.map(ll => proj(ll));
function dp(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let maxD = -1, idx = -1;
    const [x1, y1] = pts[s], [x2, y2] = pts[e]; const dx = x2 - x1, dy = y2 - y1; const L2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = pts[i]; let d;
      if (L2 === 0) d = Math.hypot(x - x1, y - y1); else { let t = ((x - x1) * dx + (y - y1) * dy) / L2; t = Math.max(0, Math.min(1, t)); d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const TOL = 0.55, SPECK = +(process.env.SPECK || 0.35), SPECK2 = +(process.env.SPECK2 || 0.8); // SPECK2：中国、台湾省以外的小岛门槛
const arcPts = arcs.map(a => {
  const pts = a.ids.map(i => P[i]);
  if (a.ids[0] === a.ids[a.ids.length - 1] && pts.length > 4) { const h = Math.floor(pts.length / 2); return dp(pts.slice(0, h + 1), TOL).concat(dp(pts.slice(h), TOL).slice(1)); }
  return dp(pts, TOL);
});
const fmt = v => (Math.round(v * 10) / 10).toString();
function ringPoints(ri) { const out = []; for (const [id, rev] of ringArcs[ri]) { let pts = arcPts[id]; if (rev) pts = pts.slice().reverse(); if (out.length) pts = pts.slice(1); for (const p of pts) out.push(p); } return out; }
function ringArea(pts) { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return a / 2; }
const actorOf = ri => code2actor[feats[rings[ri].fi].properties.ADM0_A3];
const actorIds = [...new Set(Object.values(code2actor))];
const actorPath = Object.fromEntries(actorIds.map(a => [a, []]));
const actorBBox = Object.fromEntries(actorIds.map(a => [a, [1e9, 1e9, -1e9, -1e9]]));
const dropped = new Set(); // 被当作小点删掉的外环（它们的边不再画海岸线）
rings.forEach((r, ri) => {
  const a = actorOf(ri); const pts = ringPoints(ri);
  if (pts.length < 3) { dropped.add(ri); return; }
  const area = Math.abs(ringArea(pts));
  if (area < (a === 'CHN' || a === 'TWN' ? SPECK : SPECK2) && r.ri === 0) { dropped.add(ri); return; }
  actorPath[a].push('M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L') + 'Z');
  const bb = actorBBox[a]; for (const [x, y] of pts) { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
});
// 洞（ri>0）跟着外环：外环删掉了，洞也不画
rings.forEach((r, ri) => { if (r.ri > 0 && rings.some((q, qi) => dropped.has(qi) && q.fi === r.fi && q.pi === r.pi && q.ri === 0)) dropped.add(ri); });
let internal = [], borders = [], coast = []; const outline = Object.fromEntries(actorIds.map(a => [a, []]));
arcs.forEach((a, id) => {
  const pts = arcPts[id]; if (pts.length < 2) return;
  const owners = [...a.owners].filter(ri => !dropped.has(ri)); if (!owners.length) return;
  const s = 'M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L');
  const acts = [...new Set(owners.map(actorOf))];
  const fis = new Set(owners.map(ri => rings[ri].fi));
  if (owners.length === 1) { coast.push(s); outline[acts[0]].push(s); }
  else if (acts.length === 1) { if (fis.size > 1) internal.push(s); else coast.push(s); }
  else { borders.push(s); for (const x of acts) outline[x].push(s); }
});

// —— 南海诸岛、钓鱼岛及其附属岛屿：太小会被简化掉，单独画成小块 ——
const ISL = [
  ['TWN', 123.476, 25.746, '钓鱼岛'], ['TWN', 123.68, 25.923, '黄尾屿'], ['TWN', 124.558, 25.923, '赤尾屿'],
  ['CHN', 116.72, 20.70, '东沙岛'],
  ['CHN', 112.335, 16.834, '永兴岛'], ['CHN', 112.73, 16.67, '东岛'], ['CHN', 111.71, 16.45, '琛航岛'], ['CHN', 111.20, 15.78, '中建岛'],
  ['CHN', 117.76, 15.15, '黄岩岛'],
  ['CHN', 114.07, 10.92, '渚碧礁'], ['CHN', 114.366, 10.377, '太平岛'], ['CHN', 115.53, 9.90, '美济礁'], ['CHN', 114.28, 9.71, '赤瓜礁'],
  ['CHN', 112.89, 9.55, '永暑礁'], ['CHN', 112.85, 8.87, '华阳礁'], ['CHN', 111.92, 8.65, '南威岛'], ['CHN', 113.84, 7.38, '弹丸礁'],
  ['CHN', 112.27, 3.97, '曾母暗沙'],
];
const ISR = 1.1; // 小块半径（地图单位）
const isl = [];
for (const [a, lon, lat, name] of ISL) {
  const [x, y] = proj([lon, lat]); isl.push([a, +x.toFixed(1), +y.toFixed(1), name]);
  const hex = [...Array(6)].map((_, i) => [x + ISR * Math.cos(Math.PI / 3 * i), y + ISR * Math.sin(Math.PI / 3 * i)]);
  const s = 'M' + hex.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L') + 'Z';
  actorPath[a].push(s); coast.push(s);
}
// —— 南海断续线：Natural Earth 的九段 + 台湾以东一段（国内标准地图为十段） ——
const mi = JSON.parse(fs.readFileSync('./ne/geojson/ne_10m_admin_0_boundary_lines_maritime_indicator_chn.geojson', 'utf8'));
const dashLL = mi.features.map(f => (f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.flat() : f.geometry.coordinates));
dashLL.push([[122.45, 23.75], [122.62, 24.65]]); // 第十段：台湾以东（中方未公布精确坐标，按台湾与与那国岛之间的位置画出）
const dash = dashLL.map(line => 'M' + dp(line.map(ll => proj(ll)), 0.2).map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L')).join('');

// —— 引擎用到的字段原样保留 ——
const G0 = eval(fs.readFileSync('../src/geo.js', 'utf8').replace(/^const GEO=/, '(').replace(/;\s*$/, ')'));
const bbox = Object.fromEntries(actorIds.map(a => [a, actorBBox[a].map(v => Math.round(v))]));
const out = Object.assign({}, G0, {
  paths: Object.fromEntries(actorIds.map(a => [a, actorPath[a].join('')])),
  outline: Object.fromEntries(actorIds.map(a => [a, outline[a].join('')])),
  internal: internal.join(''), borders: borders.join(''), coast: coast.join(''), bbox,
  dash, isl, std: 'cn',
});
for (const k of ['w', 'h', 'label', 'land', 'dist', 'areaPx', 'grat', 'sphere']) if (JSON.stringify(out[k]) !== JSON.stringify(G0[k])) throw new Error('engine field changed: ' + k);
const js = '/* 网页版的中国标准地图（显示用，build/geo_build_cn.mjs 生成）：藏南、阿克赛钦属中国，台湾按省级单位，南海诸岛与断续线、钓鱼岛及其附属岛屿；\n * 引擎用到的 label / land / dist / areaPx 与 src/geo.js 相同 */\nconst GEO=' + JSON.stringify(out) + ';\n';
fs.writeFileSync('../src/geo_cn.js', js);
console.log('geo_cn.js bytes', js.length, '| geo.js bytes', fs.statSync('../src/geo.js').size);
