// Build-time geometry: Natural Earth 50m admin-0 -> projected SVG paths grouped by game actor,
// plus land adjacency, inter-actor distances, label anchors. Output: ../src/geo.js
import fs from 'fs';
const d3 = await import('d3-geo'); // tianxia/_source/package.json 里固定版本的 d3-geo（先在 tianxia/_source 里 npm install）

const MEMBERS = {
  USA: 'USA PRI VIR GUM MNP ASM',
  CAN: 'CAN',
  MEX: 'MEX',
  CAM: 'GTM BLZ HND SLV NIC CRI PAN CUB JAM HTI DOM BHS TTO BRB GRD VCT LCA KNA ATG DMA',
  BRA: 'BRA',
  SCO: 'ARG CHL URY PRY',
  ANd: 'COL VEN ECU PER BOL GUY SUR',
  GBR: 'GBR JEY GGY IMN FLK SGS IOT SHN PCN BMU AIA CYM VGB TCA MSR',
  FRA: 'FRA MCO SPM WLF MAF BLM PYF NCL ATF',
  DEU: 'DEU',
  ITA: 'ITA VAT SMR MLT',
  IBE: 'ESP PRT AND',
  POL: 'POL',
  NOR: 'SWE NOR FIN ALD DNK FRO GRL ISL IRL',
  BNL: 'NLD BEL LUX ABW CUW SXM',
  CEU: 'CZE SVK AUT HUN CHE SVN LIE',
  BAL: 'ROU BGR GRC SRB HRV BIH MNE ALB MKD KOS MDA CYP CYN',
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
  EGY: 'EGY',
  MAG: 'MAR SAH DZA TUN LBY',
  IND: 'IND KAS',
  PAK: 'PAK',
  SAS: 'BGD LKA NPL BTN MDV',
  CHN: 'CHN HKG MAC',
  TWN: 'TWN',
  JPN: 'JPN',
  KOR: 'KOR',
  PRK: 'PRK',
  ASN: 'IDN VNM THA MYS PHL SGP MMR KHM LAO BRN TLS',
  AUS: 'AUS IOA HMD NFK ATC',
  OCE: 'NZL NIU COK PNG FJI SLB VUT WSM TON FSM MHL PLW KIR NRU TUV',
  WAF: 'NGA GHA CIV SEN MLI BFA NER GIN SLE LBR TGO BEN MRT GMB GNB CPV',
  CAF: 'TCD CAF CMR GAB COG COD GNQ STP',
  EAF: 'ETH KEN TZA UGA RWA BDI SOM SOL DJI ERI SDN SDS SYC COM',
  SAF: 'ZAF NAM BWA ZWE ZMB MOZ AGO MWI LSO SWZ MDG MUS',
};
// Andorra's code collides with our Andean key, so the Andean actor is 'ANd' above; rename below.
const RENAME = { ANd: 'AND' };
const LABEL = { // lon, lat of label anchor
  USA: [-99, 39.5], CAN: [-104, 58], MEX: [-102.5, 23.5], CAM: [-84.5, 15.5], BRA: [-52, -10],
  SCO: [-65, -35], AND: [-72.5, 0.5], GBR: [-2.2, 53.8], FRA: [2.5, 46.6], DEU: [10.3, 51.1],
  ITA: [12.8, 42.6], IBE: [-4.2, 40], POL: [19.3, 52.1], NOR: [17.5, 63.5], BNL: [5.2, 51.5],
  CEU: [16.8, 48.3], BAL: [23.2, 43.2], BLT: [24.5, 56.6], UKR: [31.5, 49], BLR: [28, 53.5],
  RUS: [96, 62], TUR: [34.5, 39], CAU: [45, 41.5], CAS: [66, 44], MNG: [103.5, 46.8],
  IRN: [54, 32.5], ISR: [34.9, 31.3], LEV: [40.5, 33.5], GLF: [46, 23], EGY: [30, 26.5],
  MAG: [5, 29], IND: [78.5, 22.5], PAK: [69.5, 29.8], SAS: [90, 24], CHN: [103, 34.5],
  TWN: [121, 23.7], JPN: [138.5, 36.5], KOR: [128, 36.3], PRK: [127, 40.2], ASN: [113, 1.5],
  AUS: [134, -25], OCE: [172, -40.5], WAF: [0, 13.5], CAF: [20, 0], EAF: [36, 5], SAF: [25, -20],
};

const ne = JSON.parse(fs.readFileSync('./ne/geojson/ne_50m_admin_0_countries.geojson', 'utf8'));
const code2actor = {};
for (const [a, list] of Object.entries(MEMBERS)) for (const c of list.split(' ')) code2actor[c] = RENAME[a] || a;
const feats = ne.features.filter(f => f.properties.ADM0_A3 !== 'ATA');
const unmapped = feats.filter(f => !code2actor[f.properties.ADM0_A3]).map(f => f.properties.ADM0_A3);
if (unmapped.length) console.log('UNMAPPED', unmapped.join(' '));
const W = 2000;
const proj = d3.geoNaturalEarth1();
proj.fitWidth(W - 20, { type: 'FeatureCollection', features: feats });
// translate so that minimal y = 10
const pathGen = d3.geoPath(proj);
const b = pathGen.bounds({ type: 'FeatureCollection', features: feats });
const [tx, ty] = proj.translate();
proj.translate([tx - b[0][0] + 10, ty - b[0][1] + 10]);
const b2 = pathGen.bounds({ type: 'FeatureCollection', features: feats });
const H = Math.ceil(b2[1][1] + 10);
console.log('viewBox', W, H);

// --- topology: vertices, rings, edges
const vKey = new Map(); const vLL = []; // id -> [lon,lat]
const vid = p => { const k = Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5); let i = vKey.get(k); if (i === undefined) { i = vLL.length; vKey.set(k, i); vLL.push(p); } return i; };
const rings = []; // {fi, poly, ids:[...], hole}
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
// junctions & arcs
const arcs = []; const arcIndex = new Map(); // key -> arc id
const ringArcs = []; // per ring: list of [arcId, reversed]
rings.forEach((r, ri) => {
  const n = r.ids.length; const ids = r.ids;
  const isJ = new Array(n).fill(false);
  for (let i = 0; i < n; i++) { const prev = ids[(i - 1 + n) % n], cur = ids[i], next = ids[(i + 1) % n]; if (ownersSig(prev, cur) !== ownersSig(cur, next)) isJ[i] = true; }
  let start = isJ.indexOf(true);
  const list = [];
  if (start < 0) { // whole ring is one closed arc
    const seq = ids.concat([ids[0]]);
    // canonical: rotate to min id for dedupe
    let m = 0; for (let i = 1; i < n; i++) if (ids[i] < ids[m]) m = i;
    const rot = ids.slice(m).concat(ids.slice(0, m)); const fwd = rot.concat([rot[0]]);
    const rev = [rot[0]].concat(rot.slice(1).reverse()).concat([rot[0]]);
    const kf = 'C' + fwd.join(','), kr = 'C' + rev.join(',');
    let id = arcIndex.get(kf), reversed = false;
    if (id === undefined) { id = arcIndex.get(kr); reversed = id !== undefined; }
    if (id === undefined) { id = arcs.length; arcs.push({ ids: fwd, owners: new Set() }); arcIndex.set(kf, id); }
    arcs[id].owners.add(ri); list.push([id, reversed]);
    void seq;
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

// --- project & simplify arcs (Douglas-Peucker in projected space, endpoints fixed)
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
const TOL = 0.55;
const arcPts = arcs.map(a => {
  const pts = a.ids.map(i => P[i]);
  if (a.ids[0] === a.ids[a.ids.length - 1] && pts.length > 4) { // closed ring: split in half to keep shape
    const h = Math.floor(pts.length / 2);
    return dp(pts.slice(0, h + 1), TOL).concat(dp(pts.slice(h), TOL).slice(1));
  }
  return dp(pts, TOL);
});
const fmt = v => (Math.round(v * 10) / 10).toString();
// ring -> projected point list
function ringPoints(ri) {
  const out = [];
  for (const [id, rev] of ringArcs[ri]) { let pts = arcPts[id]; if (rev) pts = pts.slice().reverse(); if (out.length) pts = pts.slice(1); for (const p of pts) out.push(p); }
  return out;
}
function ringArea(pts) { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return a / 2; }
const actorOf = ri => code2actor[feats[rings[ri].fi].properties.ADM0_A3];
const actorIds = [...new Set(Object.values(code2actor))];
const actorPath = Object.fromEntries(actorIds.map(a => [a, []]));
const actorBBox = Object.fromEntries(actorIds.map(a => [a, [1e9, 1e9, -1e9, -1e9]]));
const actorArea = Object.fromEntries(actorIds.map(a => [a, 0]));
rings.forEach((r, ri) => {
  const a = actorOf(ri); const pts = ringPoints(ri);
  if (pts.length < 3) return;
  const area = Math.abs(ringArea(pts));
  if (area < 0.35 && r.ri === 0) return; // drop specks smaller than ~half a pixel
  if (r.ri === 0) actorArea[a] += area;
  let s = 'M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L') + 'Z';
  actorPath[a].push(s);
  const bb = actorBBox[a]; for (const [x, y] of pts) { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }
});
// classify arcs
let internal = [], borders = [], coast = []; const outline = Object.fromEntries(actorIds.map(a => [a, []]));
const land = Object.fromEntries(actorIds.map(a => [a, new Set()]));
arcs.forEach((a, id) => {
  const pts = arcPts[id]; if (pts.length < 2) return;
  const s = 'M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L');
  const owners = [...a.owners]; const acts = [...new Set(owners.map(actorOf))];
  const fis = new Set(owners.map(ri => rings[ri].fi));
  if (owners.length === 1) { coast.push(s); outline[acts[0]].push(s); }
  else if (acts.length === 1) { if (fis.size > 1) internal.push(s); else coast.push(s); }
  else { borders.push(s); for (const x of acts) { outline[x].push(s); for (const y of acts) if (x !== y) land[x].add(y); } }
});
// --- distances (km) between actors, sampled vertices
const R = 6371;
const toRad = d => d * Math.PI / 180;
function hav(a, b) { const [l1, p1] = a.map(toRad), [l2, p2] = b.map(toRad); const dl = l2 - l1, dp_ = p2 - p1; const h = Math.sin(dp_ / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }
const samples = Object.fromEntries(actorIds.map(a => [a, []]));
rings.forEach((r, ri) => { if (r.ri !== 0) return; const a = actorOf(ri); const ids = r.ids; const step = Math.max(1, Math.floor(ids.length / 60)); for (let i = 0; i < ids.length; i += step) samples[a].push(vLL[ids[i]]); });
const dist = {};
for (let i = 0; i < actorIds.length; i++) for (let j = i + 1; j < actorIds.length; j++) {
  const A = actorIds[i], B = actorIds[j];
  let m = Infinity;
  if (land[A].has(B)) m = 0; else {
    const sa = samples[A], sb = samples[B];
    for (const p of sa) for (const q of sb) { const dd = hav(p, q); if (dd < m) m = dd; }
  }
  dist[A + '|' + B] = Math.round(m);
}
const label = Object.fromEntries(actorIds.map(a => { const p = proj(LABEL[a]); return [a, [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]]; }));
const bbox = Object.fromEntries(actorIds.map(a => [a, actorBBox[a].map(v => Math.round(v))]));
const areaPx = Object.fromEntries(actorIds.map(a => [a, Math.round(actorArea[a])]));
// graticule for background texture
const grat = pathGen(d3.geoGraticule10());
const sphere = pathGen({ type: 'Sphere' });
const out = {
  w: W, h: H,
  paths: Object.fromEntries(actorIds.map(a => [a, actorPath[a].join('')])),
  outline: Object.fromEntries(actorIds.map(a => [a, outline[a].join('')])),
  internal: internal.join(''), borders: borders.join(''), coast: coast.join(''),
  land: Object.fromEntries(actorIds.map(a => [a, [...land[a]].sort()])),
  dist, label, bbox, areaPx,
  grat: grat.replace(/(\d+\.\d)\d+/g, '$1'), sphere: sphere.replace(/(\d+\.\d)\d+/g, '$1'),
};
const js = 'const GEO=' + JSON.stringify(out) + ';\n';
fs.mkdirSync('../src', { recursive: true });
fs.writeFileSync('../src/geo.js', js);
console.log('geo.js bytes', js.length);
for (const a of actorIds) console.log(a, 'land:', out.land[a].join(','), '| near(<=450km):', actorIds.filter(b => b !== a && !land[a].has(b) && (dist[a + '|' + b] ?? dist[b + '|' + a]) <= 450).join(','));
