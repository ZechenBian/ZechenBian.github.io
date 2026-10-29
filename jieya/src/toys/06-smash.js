// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== smash ===== */
/* 砸盘子 — tap to shatter things on a counter */
(() => {
const TAU = J.TAU;
const MAXS = 400, NPART = 520, NSPLAT = 70;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const rnd = (a, b) => a + Math.random() * (b - a);
function rng(seed){ let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function polyPath(c, p){ c.beginPath(); c.moveTo(p[0], p[1]); for(let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }
function rrPath(c, x, y, w, h, r){
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/* ---------- outlines (object space: unit = R px, origin at base centre, y down) ---------- */
function circ(cx, cy, rx, ry, n){ const p = []; for(let i = 0; i < n; i++){ const a = -Math.PI / 2 + i / n * TAU; p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); } return p; }
function rrPoly(x0, y0, x1, y1, r, seg){
  const p = [], cs = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  for(const [cx, cy, a0] of cs) for(let i = 0; i <= seg; i++){ const a = a0 + Math.PI / 2 * i / seg; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return p;
}
function vaseProfile(){
  // half-profile (x, y) from lip down to foot; mirrored
  const k = [[.36, -2.1], [.3, -2.02], [.24, -1.86], [.25, -1.66], [.4, -1.42], [.62, -1.12], [.76, -.8], [.74, -.5], [.6, -.24], [.44, -.08], [.4, 0]];
  const sm = [];
  for(let i = 0; i < k.length - 1; i++){
    const a = k[Math.max(0, i - 1)], b = k[i], c = k[i + 1], d = k[Math.min(k.length - 1, i + 2)];
    for(let t = 0; t < 1; t += .25){
      const t2 = t * t, t3 = t2 * t;
      const f = (p0, p1, p2, p3) => .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      sm.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]);
    }
  }
  sm.push(k[k.length - 1]);
  const p = [];
  for(const [x, y] of sm) p.push(x, y);
  for(let i = sm.length - 1; i >= 0; i--) p.push(-sm[i][0], sm[i][1]);
  return p;
}

/* ---------- sprite painters (object space) ---------- */
function gloss(c, x, y, rx, ry, rot, a){
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.5, `rgba(255,255,255,${a * .35})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore();
}
function paintPlate(c){
  const cy = -1;
  const g = c.createRadialGradient(-.25, cy - .3, .05, 0, cy, 1.05);
  g.addColorStop(0, '#fffefa'); g.addColorStop(.7, '#f1efe8'); g.addColorStop(1, '#d6d4cc');
  c.fillStyle = g; c.beginPath(); c.arc(0, cy, 1, 0, TAU); c.fill();
  // well
  const w = c.createRadialGradient(.08, cy + .1, .3, 0, cy, .68);
  w.addColorStop(0, 'rgba(0,0,0,0)'); w.addColorStop(.85, 'rgba(120,125,140,.08)'); w.addColorStop(1, 'rgba(90,95,115,.22)');
  c.fillStyle = w; c.beginPath(); c.arc(0, cy, .68, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = .015; c.beginPath(); c.arc(0, cy, .7, Math.PI * .9, Math.PI * 1.7); c.stroke();
  // cobalt rim
  const blue = '#2a4f9e', blue2 = 'rgba(42,79,158,.55)';
  c.strokeStyle = blue; c.lineWidth = .05; c.beginPath(); c.arc(0, cy, .93, 0, TAU); c.stroke();
  c.lineWidth = .016; c.beginPath(); c.arc(0, cy, .76, 0, TAU); c.stroke();
  for(let i = 0; i < 16; i++){
    const a = i / 16 * TAU;
    c.save(); c.translate(0, cy); c.rotate(a);
    c.fillStyle = blue2; c.beginPath(); c.moveTo(.79, 0); c.quadraticCurveTo(.85, -.1, .9, 0); c.quadraticCurveTo(.85, .1, .79, 0); c.fill();
    c.fillStyle = blue; c.beginPath(); c.arc(.845, 0, .022, 0, TAU); c.fill();
    c.strokeStyle = blue2; c.lineWidth = .01; c.beginPath(); c.arc(.845, .2, .06, -2.2, -1); c.stroke();
    c.restore();
  }
  // centre motif: a fish
  c.save(); c.translate(0, cy); c.rotate(-.25);
  c.fillStyle = 'rgba(42,79,158,.75)';
  c.beginPath(); c.moveTo(-.34, 0); c.bezierCurveTo(-.18, -.2, .14, -.2, .24, 0); c.bezierCurveTo(.14, .2, -.18, .2, -.34, 0); c.fill();
  c.beginPath(); c.moveTo(.2, 0); c.lineTo(.38, -.14); c.lineTo(.34, 0); c.lineTo(.38, .14); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = .012;
  for(let i = 0; i < 4; i++){ c.beginPath(); c.arc(-.1 + i * .08, 0, .08, -1, 1); c.stroke(); }
  c.fillStyle = '#fff'; c.beginPath(); c.arc(-.24, -.03, .025, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(42,79,158,.5)'; c.lineWidth = .014;
  c.beginPath(); c.moveTo(-.45, .28); c.quadraticCurveTo(-.2, .18, 0, .3); c.quadraticCurveTo(.2, .4, .42, .28); c.stroke();
  c.beginPath(); c.moveTo(-.38, .38); c.quadraticCurveTo(-.15, .3, .05, .4); c.stroke();
  c.restore();
  gloss(c, -.42, cy - .5, .4, .13, -.7, .9);
  c.strokeStyle = 'rgba(140,140,150,.5)'; c.lineWidth = .012; c.beginPath(); c.arc(0, cy, .995, 0, TAU); c.stroke();
}
function paintGlass(c){
  const P = GLASS;
  c.save(); polyPath(c, P); c.clip();
  const g = c.createLinearGradient(-.7, 0, .7, 0);
  g.addColorStop(0, 'rgba(170,210,230,.42)'); g.addColorStop(.18, 'rgba(210,235,245,.12)'); g.addColorStop(.6, 'rgba(180,215,235,.08)'); g.addColorStop(.9, 'rgba(150,195,220,.3)'); g.addColorStop(1, 'rgba(200,230,245,.55)');
  c.fillStyle = g; c.fillRect(-1, -2.1, 2, 2.2);
  // drink
  const d = c.createLinearGradient(0, -.95, 0, -.12);
  d.addColorStop(0, 'rgba(242,170,80,.55)'); d.addColorStop(1, 'rgba(190,100,30,.7)');
  c.fillStyle = d; c.fillRect(-1, -.95, 2, .85);
  c.fillStyle = 'rgba(255,215,150,.6)'; c.fillRect(-1, -.97, 2, .03);
  // ice cube
  c.save(); c.translate(.12, -.78); c.rotate(.35);
  c.fillStyle = 'rgba(235,245,255,.35)'; c.fillRect(-.2, -.2, .4, .4);
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = .018; c.strokeRect(-.2, -.2, .4, .4);
  c.restore();
  // thick base
  c.fillStyle = 'rgba(205,232,245,.45)'; c.fillRect(-1, -.16, 2, .16);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-1, -.165, 2, .02);
  // facets
  c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = .015;
  for(let i = -4; i <= 4; i++){ c.beginPath(); c.moveTo(i * .14, -.16); c.lineTo(i * .15, -1.85); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-.5, -1.82, .07, 1.6);
  c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(-.36, -1.82, .03, 1.6);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(.5, -1.8, .04, 1.55);
  c.restore();
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(235,248,255,.85)'; c.lineWidth = .03; polyPath(c, P); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = .025; c.beginPath(); c.ellipse(0, -1.9, .64, .05, 0, 0, TAU); c.stroke();
}
function paintVase(c){
  const P = VASE;
  c.save(); polyPath(c, P); c.clip();
  const g = c.createLinearGradient(-.8, 0, .8, 0);
  g.addColorStop(0, '#2c5a55'); g.addColorStop(.28, '#7fb3a2'); g.addColorStop(.42, '#a6d0bd'); g.addColorStop(.7, '#5e9686'); g.addColorStop(1, '#22433f');
  c.fillStyle = g; c.fillRect(-1, -2.2, 2, 2.3);
  const r = rng(17);
  // crackle
  c.strokeStyle = 'rgba(30,60,55,.28)'; c.lineWidth = .008;
  for(let i = 0; i < 60; i++){
    let x = (r() - .5) * 1.6, y = -r() * 2.1;
    c.beginPath(); c.moveTo(x, y);
    for(let k = 0; k < 4; k++){ x += (r() - .5) * .18; y += (r() - .5) * .18; c.lineTo(x, y); }
    c.stroke();
  }
  // decorative bands
  c.strokeStyle = 'rgba(240,250,240,.35)'; c.lineWidth = .02;
  c.beginPath(); c.moveTo(-1, -1.5); c.quadraticCurveTo(0, -1.44, 1, -1.5); c.stroke();
  c.beginPath(); c.moveTo(-1, -.35); c.quadraticCurveTo(0, -.29, 1, -.35); c.stroke();
  c.fillStyle = 'rgba(235,248,238,.3)';
  for(let i = -3; i <= 3; i++){
    c.save(); c.translate(i * .2, -.95 + Math.abs(i) * .02); c.scale(1 - Math.abs(i) * .12, 1);
    c.beginPath(); c.moveTo(0, -.28); c.bezierCurveTo(.1, -.15, .1, .1, 0, .2); c.bezierCurveTo(-.1, .1, -.1, -.15, 0, -.28); c.fill();
    c.restore();
  }
  // foot ring (unglazed)
  c.fillStyle = '#c9a77c'; c.fillRect(-1, -.07, 2, .08);
  c.fillStyle = 'rgba(60,35,10,.25)'; c.fillRect(-1, -.075, 2, .012);
  // lip
  c.fillStyle = 'rgba(20,45,40,.5)'; c.beginPath(); c.ellipse(0, -2.08, .3, .04, 0, 0, TAU); c.fill();
  c.restore();
  gloss(c, -.32, -.95, .16, .5, 0, .75);
  gloss(c, -.14, -1.85, .05, .14, 0, .6);
  c.strokeStyle = 'rgba(10,30,28,.4)'; c.lineWidth = .012; polyPath(c, P); c.stroke();
}
function paintMelon(c){
  const cy = -.88;
  const g = c.createRadialGradient(-.3, cy - .3, .1, 0, cy, 1.1);
  g.addColorStop(0, '#6fae4c'); g.addColorStop(.6, '#3f7f2c'); g.addColorStop(1, '#22501a');
  c.fillStyle = g; c.beginPath(); c.ellipse(0, cy, 1.05, .88, 0, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.ellipse(0, cy, 1.05, .88, 0, 0, TAU); c.clip();
  const r = rng(7);
  for(let i = -5; i <= 5; i++){
    const x0 = i * .2;
    c.fillStyle = 'rgba(18,52,16,.75)'; c.beginPath();
    c.moveTo(x0 * .3, cy - .9);
    const n = 14;
    for(let k = 0; k <= n; k++){ const t = k / n, y = cy - .9 + t * 1.8, w = Math.sin(t * Math.PI), x = x0 * (.3 + .7 * w) * 1.05 + Math.sin(k * 2.1 + i) * .035; c.lineTo(x - .05 * w - (k % 2) * .03 * w, y); }
    for(let k = n; k >= 0; k--){ const t = k / n, y = cy - .9 + t * 1.8, w = Math.sin(t * Math.PI), x = x0 * (.3 + .7 * w) * 1.05 + Math.sin(k * 2.1 + i) * .035; c.lineTo(x + .05 * w + (k % 2) * .03 * w, y); }
    c.fill();
  }
  for(let i = 0; i < 200; i++){ c.fillStyle = `rgba(${r() < .5 ? '170,210,120' : '20,50,15'},${.1 + r() * .15})`; c.fillRect((r() - .5) * 2.1, cy + (r() - .5) * 1.8, .02, .02); }
  const v = c.createRadialGradient(0, cy, .6, 0, cy, 1.1);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(5,20,5,.45)');
  c.fillStyle = v; c.fillRect(-1.1, cy - 1, 2.2, 2);
  c.restore();
  gloss(c, -.42, cy - .45, .45, .16, -.5, .55);
  c.fillStyle = '#6b5a2c'; c.beginPath(); c.ellipse(.02, cy - .86, .05, .025, 0, 0, TAU); c.fill();
}
function paintFlesh(c){
  const cy = -.88;
  const g = c.createRadialGradient(0, cy, .05, 0, cy, 1.05);
  g.addColorStop(0, '#ff6b6b'); g.addColorStop(.6, '#ef3f4c'); g.addColorStop(1, '#d42a3c');
  c.fillStyle = g; c.fillRect(-1.2, cy - 1, 2.4, 2);
  const r = rng(13);
  for(let i = 0; i < 260; i++){ c.fillStyle = `rgba(255,${150 + r() * 80 | 0},${150 + r() * 60 | 0},${.12 + r() * .2})`; c.beginPath(); c.arc((r() - .5) * 2, cy + (r() - .5) * 1.7, .01 + r() * .02, 0, TAU); c.fill(); }
  for(let ring = 0; ring < 2; ring++){
    const n = ring ? 14 : 8, rr = ring ? .55 : .3;
    for(let i = 0; i < n; i++){
      const a = i / n * TAU + ring * .3 + r() * .2, x = Math.cos(a) * rr * 1.1, y = cy + Math.sin(a) * rr;
      c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2);
      c.fillStyle = '#1c1310'; c.beginPath(); c.moveTo(0, -.045); c.quadraticCurveTo(.035, .01, 0, .04); c.quadraticCurveTo(-.035, .01, 0, -.045); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(-.008, -.01, .008, 0, TAU); c.fill();
      c.restore();
    }
  }
}
function paintTV(c){
  // casing
  const g = c.createLinearGradient(0, -1.8, 0, 0);
  g.addColorStop(0, '#9a6236'); g.addColorStop(1, '#6a3d1d');
  c.fillStyle = g; rrPath(c, -1.15, -1.8, 2.3, 1.72, .14); c.fill();
  const r = rng(29);
  c.save(); rrPath(c, -1.15, -1.8, 2.3, 1.72, .14); c.clip();
  for(let i = 0; i < 40; i++){
    const y = -1.8 + r() * 1.72; c.strokeStyle = `rgba(${r() < .6 ? '60,30,10' : '200,140,90'},${.1 + r() * .15})`; c.lineWidth = .006 + r() * .015;
    c.beginPath(); c.moveTo(-1.2, y); c.bezierCurveTo(-.4, y + (r() - .5) * .1, .4, y + (r() - .5) * .1, 1.2, y); c.stroke();
  }
  c.restore();
  c.strokeStyle = 'rgba(255,210,160,.25)'; c.lineWidth = .02; rrPath(c, -1.13, -1.78, 2.26, 1.68, .13); c.stroke();
  // feet
  c.fillStyle = '#2a1a10'; c.fillRect(-.95, -.08, .22, .08); c.fillRect(.73, -.08, .22, .08);
  // bezel + screen
  c.fillStyle = '#26221f'; rrPath(c, -1.0, -1.65, 1.5, 1.38, .16); c.fill();
  const s = c.createRadialGradient(-.3, -1.05, .05, -.25, -.96, .9);
  s.addColorStop(0, '#a7d8cf'); s.addColorStop(.5, '#4f8e8a'); s.addColorStop(1, '#1d3c40');
  c.fillStyle = s; rrPath(c, -.92, -1.57, 1.34, 1.22, .22); c.fill();
  c.save(); rrPath(c, -.92, -1.57, 1.34, 1.22, .22); c.clip();
  for(let i = 0; i < 380; i++){ c.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '10,30,30'},${r() * .22})`; c.fillRect(-.92 + r() * 1.34, -1.57 + r() * 1.22, .02 + r() * .05, .012); }
  c.fillStyle = 'rgba(0,0,0,.14)';
  for(let y = -1.57; y < -.35; y += .03) c.fillRect(-1, y, 1.5, .012);
  const cols = ['#e8e3d0', '#e8d35a', '#5fc6c2', '#69b85a', '#c55ab6', '#c9474a', '#3a54b0'];
  c.globalAlpha = .38;
  for(let i = 0; i < 7; i++){ c.fillStyle = cols[i]; c.fillRect(-.7 + i * .13, -1.32, .13, .5); }
  c.globalAlpha = 1;
  c.restore();
  gloss(c, -.55, -1.32, .35, .12, -.5, .55);
  // panel
  c.fillStyle = '#3a2a1e'; rrPath(c, .58, -1.65, .48, 1.38, .08); c.fill();
  for(let i = 0; i < 2; i++){
    const y = -1.4 + i * .36;
    c.fillStyle = '#c8c0ae'; c.beginPath(); c.arc(.82, y, .12, 0, TAU); c.fill();
    c.fillStyle = '#857c6c'; c.beginPath(); c.arc(.82, y, .085, 0, TAU); c.fill();
    c.strokeStyle = '#2b241c'; c.lineWidth = .025; c.beginPath(); c.moveTo(.82, y); c.lineTo(.82 + Math.cos(i * 2 + .5) * .08, y + Math.sin(i * 2 + .5) * .08); c.stroke();
  }
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = .02;
  for(let i = 0; i < 6; i++){ c.beginPath(); c.moveTo(.66, -.62 + i * .055); c.lineTo(.98, -.62 + i * .055); c.stroke(); }
  c.fillStyle = '#e04a3a'; c.beginPath(); c.arc(.95, -.38, .02, 0, TAU); c.fill();
}

const GLASS = [-.66, -1.92, .66, -1.92, .5, 0, -.5, 0];
const VASE = vaseProfile();
const DEFS = [
  { id: 'plate', name: '盘子', out: circ(0, -1, 1, 1, 48), paint: paintPlate, seeds: [12, 17], body: '#e4e2da', thick: 3, edge: 'rgba(255,255,255,.95)', edgeW: 1.2,
    speed: 1, spin: 1, e: .32, glint: 10, dust: 'rgba(240,240,235,', snd: 'ceramic', pitch: 1.12 },
  { id: 'glass', name: '玻璃杯', out: GLASS, paint: paintGlass, seeds: [15, 20], body: null, thick: 0, edge: 'rgba(235,250,255,.9)', edgeW: 1, allEdges: true,
    speed: 1.15, spin: 1.2, e: .38, glint: 22, dust: 'rgba(220,240,255,', snd: 'glass', pitch: 1.5, drink: true },
  { id: 'vase', name: '花瓶', out: VASE, paint: paintVase, seeds: [13, 18], body: '#cdb08a', thick: 3, edge: 'rgba(238,224,200,.95)', edgeW: 1.4,
    speed: .95, spin: .9, e: .28, glint: 10, dust: 'rgba(225,205,175,', snd: 'ceramic', pitch: .85 },
  { id: 'melon', name: '西瓜', out: circ(0, -.88, 1.05, .88, 44), paint: paintMelon, inner: paintFlesh, seeds: [10, 14], body: '#9e1d2c', thick: 4,
    rind: true, edge: null, speed: .7, spin: .6, e: .12, glint: 0, dust: null, snd: 'melon', pitch: 1, juice: true },
  { id: 'tv', name: '老电视', out: rrPoly(-1.15, -1.8, 1.15, 0, .12, 3), paint: paintTV, seeds: [14, 18], body: '#3a2616', thick: 4, edge: 'rgba(255,200,150,.5)', edgeW: 1,
    speed: .85, spin: .8, e: .22, glint: 16, dust: 'rgba(200,190,170,', snd: 'tv', pitch: .9, sparks: true }
];
for(const d of DEFS){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for(let i = 0; i < d.out.length; i += 2){ x0 = Math.min(x0, d.out[i]); x1 = Math.max(x1, d.out[i]); y0 = Math.min(y0, d.out[i + 1]); y1 = Math.max(y1, d.out[i + 1]); }
  d.bb = { x0: x0 - .05, y0: y0 - .05, x1: x1 + .05, y1: y1 + .05 };
  d.cyc = (y0 + y1) / 2;
}

/* ---------- state ---------- */
let cv, ctx, W = 0, H = 0, K = 1, bg, bgx, lay, lx, blob;
const L = { R: 80, fy: 0, D: 60, cx: 0, base: 0, zObj: 0, sx0: 0, sx1: 0, sy: 0 };
const S = { total: +J.store.get('smash-total', 0) || 0, idx: (+J.store.get('smash-idx', 0) || 0) % DEFS.length, obj: null, shards: [], nextAt: 0,
  sweep: null, shake: 0, shakeT: 0, flash: null, dirty: true, sparkT: 0, sparkX: 0, sparkY: 0, fizzT: 0, clinks: 0, lastClink: 0, stand: 1 };
const parts = []; for(let i = 0; i < NPART; i++) parts.push({ on: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, fy: 0, life: 0, max: 1, s: 0, col: '' });
const splats = [];

/* ---------- geometry ---------- */
let CF = null;
function clipHalf(pts, fl, ax, ay, nx, ny){
  // keep points with (p - a)·n <= 0
  const n = pts.length / 2, op = [], of = [];
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1, xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
    const si = (xi - ax) * nx + (yi - ay) * ny, sj = (xj - ax) * nx + (yj - ay) * ny;
    const ii = si <= 0, ij = sj <= 0;
    if(ii){ op.push(xi, yi); of.push(fl[i]); }
    if(ii !== ij){
      const t = si / (si - sj), x = xi + (xj - xi) * t, y = yi + (yj - yi) * t;
      if(ii){ op.push(x, y); of.push(0); } else { op.push(x, y); of.push(fl[i]); }
    }
  }
  CF = of; return op;
}
function centroid(p){
  const n = p.length / 2; let a = 0, cx = 0, cy = 0;
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1, cr = p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
    a += cr; cx += (p[2 * i] + p[2 * j]) * cr; cy += (p[2 * i + 1] + p[2 * j + 1]) * cr;
  }
  a *= .5; if(Math.abs(a) < 1e-9) return null;
  return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
}
function inside(p, x, y){
  let c = false; const n = p.length / 2;
  for(let i = 0, j = n - 1; i < n; j = i++){
    const xi = p[2 * i], yi = p[2 * i + 1], xj = p[2 * j], yj = p[2 * j + 1];
    if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* ---------- sprites ---------- */
function mkSprite(d, painter){
  const b = d.bb, sc = L.R * K, cvs = document.createElement('canvas');
  cvs.width = Math.max(2, Math.ceil((b.x1 - b.x0) * sc)); cvs.height = Math.max(2, Math.ceil((b.y1 - b.y0) * sc));
  const c = cvs.getContext('2d');
  c.setTransform(sc, 0, 0, sc, -b.x0 * sc, -b.y0 * sc);
  c.save(); polyPath(c, d.out); c.clip();
  painter(c);
  c.restore();
  const pat = ctx.createPattern(cvs, 'no-repeat');
  try{ pat.setTransform(new DOMMatrix([1 / sc, 0, 0, 1 / sc, b.x0, b.y0])); }catch(e){}
  return { cvs, pat };
}
function buildSprites(){
  for(const d of DEFS){
    d.spr = mkSprite(d, d.paint);
    d.inSpr = d.inner ? mkSprite(d, d.inner) : d.spr;
  }
}

/* ---------- layout + background ---------- */
function layout(){
  const phone = W < 560;
  L.fy = Math.round(H * (phone ? .66 : .64));
  L.D = Math.round(H * (phone ? .12 : .13));
  L.R = Math.max(34, Math.min(W * (phone ? .2 : .17), H * .17, 125));
  L.cx = W / 2; L.zObj = L.D * .45; L.base = L.fy + L.zObj;
  L.sy = Math.round(Math.max(phone ? 118 : 120, H * .27));
  L.sx1 = W - (phone ? 14 : W * .07); L.sx0 = L.sx1 - Math.min(phone ? W * .44 : 300, W * .4);
}
function renderBg(){
  bg.width = Math.ceil(W * K); bg.height = Math.ceil(H * K);
  const c = bgx; c.setTransform(K, 0, 0, K, 0, 0);
  // wall
  const wg = c.createLinearGradient(0, 0, 0, L.fy);
  wg.addColorStop(0, '#171a26'); wg.addColorStop(1, '#232638');
  c.fillStyle = wg; c.fillRect(0, 0, W, L.fy + 2);
  const r = rng(3);
  c.fillStyle = 'rgba(255,255,255,.018)';
  for(let x = 0; x < W; x += 34) c.fillRect(x, 0, 14, L.fy);
  for(let i = 0; i < 120; i++){ c.fillStyle = `rgba(242,181,107,${r() * .025})`; c.fillRect(r() * W, r() * L.fy, 2, 2); }
  const lg = c.createRadialGradient(W * .3, L.fy * .2, 10, W * .4, L.fy * .5, Math.max(W, H) * .7);
  lg.addColorStop(0, 'rgba(242,181,107,.2)'); lg.addColorStop(.45, 'rgba(242,181,107,.06)'); lg.addColorStop(1, 'rgba(242,181,107,0)');
  c.fillStyle = lg; c.fillRect(0, 0, W, L.fy);
  // backsplash tiles
  const ty = L.fy - Math.min(70, L.R * .7);
  c.fillStyle = 'rgba(255,255,255,.025)'; c.fillRect(0, ty, W, L.fy - ty);
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1;
  const ts = (L.fy - ty) / 2;
  c.beginPath();
  for(let y = ty; y <= L.fy; y += ts){ c.moveTo(0, y + .5); c.lineTo(W, y + .5); }
  for(let row = 0; row < 2; row++) for(let x = (row ? ts / 2 : 0); x < W; x += ts * 1.5){ c.moveTo(x + .5, ty + row * ts); c.lineTo(x + .5, ty + row * ts + ts); }
  c.stroke();
  // wall shelf
  const sy = L.sy;
  c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 14; c.shadowOffsetY = 8;
  c.fillStyle = '#6b4325'; c.fillRect(L.sx0, sy, L.sx1 - L.sx0, 9); c.restore();
  c.fillStyle = '#8a5a33'; c.fillRect(L.sx0, sy, L.sx1 - L.sx0, 3);
  c.fillStyle = '#3e2512';
  c.fillRect(L.sx0 + 14, sy + 9, 5, 16); c.fillRect(L.sx1 - 19, sy + 9, 5, 16);
  // counter top
  const fy = L.fy, D = L.D;
  const tg = c.createLinearGradient(0, fy, 0, fy + D);
  tg.addColorStop(0, '#5d3b22'); tg.addColorStop(1, '#8a5a34');
  c.fillStyle = tg; c.fillRect(0, fy, W, D);
  c.save(); c.beginPath(); c.rect(0, fy, W, D); c.clip();
  for(let i = 0; i < 40; i++){
    const y0 = fy + r() * D, amp = 1 + r() * 2;
    c.strokeStyle = `rgba(${r() < .7 ? '50,28,12' : '210,160,110'},${.08 + r() * .12})`; c.lineWidth = .6 + r() * 1.2;
    c.beginPath();
    for(let x = -10; x <= W + 10; x += 20){ const y = y0 + Math.sin(x * .006 + i) * amp; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
  }
  const sp = c.createRadialGradient(W * .4, fy + D * .4, 10, W * .45, fy + D * .5, W * .6);
  sp.addColorStop(0, 'rgba(255,210,150,.18)'); sp.addColorStop(1, 'rgba(255,210,150,0)');
  c.fillStyle = sp; c.fillRect(0, fy, W, D);
  c.restore();
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, fy, W, 2);
  c.fillStyle = 'rgba(255,220,170,.28)'; c.fillRect(0, fy + D - 1, W, 1.5);
  // front face
  const fg = c.createLinearGradient(0, fy + D, 0, H);
  fg.addColorStop(0, '#4a2c16'); fg.addColorStop(.12, '#3a2210'); fg.addColorStop(1, '#1c1209');
  c.fillStyle = fg; c.fillRect(0, fy + D, W, H - fy - D);
  c.fillStyle = 'rgba(255,210,160,.06)';
  for(let x = W * .08; x < W; x += Math.max(160, W * .28)){ c.fillRect(x, fy + D + 18, 1.5, H); }
  c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2;
  for(let x = W * .08; x < W; x += Math.max(160, W * .28)){ c.beginPath(); c.moveTo(x - 1, fy + D + 18); c.lineTo(x - 1, H); c.stroke(); }
  // shadow blob sprite
  blob.width = blob.height = 64;
  const bc = blob.getContext('2d'), bgd = bc.createRadialGradient(32, 32, 0, 32, 32, 32);
  bgd.addColorStop(0, 'rgba(15,6,0,.75)'); bgd.addColorStop(.5, 'rgba(15,6,0,.35)'); bgd.addColorStop(1, 'rgba(15,6,0,0)');
  bc.fillStyle = bgd; bc.fillRect(0, 0, 64, 64);
}

/* ---------- objects ---------- */
function newObj(drop){
  const d = DEFS[S.idx];
  if(!drop) S.stand = d.id === 'plate' ? 1 : 0;
  S.obj = { d, y: drop ? -(L.base + (d.bb.y1 - d.bb.y0) * L.R + 40) : 0, vy: 0, sq: 0, sqv: 0, state: drop ? 'drop' : 'rest', landed: !drop };
  S.dirty = true;
}
function advance(){ S.idx = (S.idx + 1) % DEFS.length; J.store.set('smash-idx', S.idx); }
function landSound(d){
  const v = rnd(.95, 1.05);
  if(d.id === 'glass'){ J.sfx.tone({ f: 2600 * v, peak: .08, dec: .25, wet: .3 }); J.sfx.tone({ f: 180, f2: 90, peak: .15, dec: .06 }); }
  else if(d.id === 'melon'){ J.sfx.tone({ f: 110 * v, f2: 55, peak: .45, dec: .2 }); J.sfx.noise({ type: 'lowpass', freq: 300, peak: .2, dec: .08 }); }
  else if(d.id === 'tv'){ J.sfx.tone({ f: 80 * v, f2: 45, peak: .5, dec: .25 }); J.sfx.noise({ type: 'lowpass', freq: 500, peak: .3, dec: .12 }); J.sfx.tone({ f: 1400, peak: .03, dec: .3, delay: .03, wet: .4 }); }
  else { J.sfx.tone({ f: 1800 * v * d.pitch, peak: .05, dec: .18, wet: .2 }); J.sfx.tone({ f: 160, f2: 90, peak: .2, dec: .07 }); J.sfx.noise({ type: 'bandpass', freq: 1500, Q: 1, peak: .1, dec: .03 }); }
}

/* ---------- particles ---------- */
function part(k, x, y, vx, vy, fy, life, s, col){
  let q = null;
  for(let i = 0; i < NPART; i++) if(!parts[i].on){ q = parts[i]; break; }
  if(!q){ let m = 1e9; for(const p of parts) if(p.life < m){ m = p.life; q = p; } }
  q.on = true; q.k = k; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.fy = fy; q.life = q.max = life; q.s = s; q.col = col; q.px = x; q.py = y;
}
function splat(x, y, s, col){
  if(splats.length >= NSPLAT) splats.shift();
  splats.push({ x, y, s, col, a: 1, rot: Math.random() * TAU, sq: rnd(.3, .5) });
}

/* ---------- smash ---------- */
function smash(px, py){
  const o = S.obj; if(!o) return;
  const d = o.d, R = L.R, ox0 = L.cx, oy0 = L.base + o.y;
  let ix = (px - ox0) / R, iy = (py - oy0) / R;
  if(!inside(d.out, ix, iy)){
    const cx = 0, cy = d.cyc;
    for(let k = 1; k <= 12; k++){ const t = k / 12; const x = ix + (cx - ix) * t, y = iy + (cy - iy) * t; if(inside(d.out, x, y)){ ix = x + (cx - x) * .08; iy = y + (cy - y) * .08; break; } }
  }
  // seeds
  const n = Math.round(rnd(d.seeds[0], d.seeds[1])), sx = [], sy = [], b = d.bb;
  for(let k = 0; k < 3; k++){ const a = rnd(0, TAU), r = rnd(.04, .14); sx.push(ix + Math.cos(a) * r); sy.push(iy + Math.sin(a) * r); }
  let guard = 0;
  while(sx.length < n && guard++ < 400){
    let x, y;
    if(Math.random() < .62){ const a = rnd(0, TAU), r = Math.pow(Math.random(), 1.5) * 1.5; x = ix + Math.cos(a) * r; y = iy + Math.sin(a) * r; }
    else { x = rnd(b.x0, b.x1); y = rnd(b.y0, b.y1); }
    if(!inside(d.out, x, y)) continue;
    let ok = true; for(let j = 0; j < sx.length; j++){ const dx = sx[j] - x, dy = sy[j] - y; if(dx * dx + dy * dy < .0025){ ok = false; break; } }
    if(ok){ sx.push(x); sy.push(y); }
  }
  const of0 = new Array(d.out.length / 2).fill(1), made = [];
  for(let i = 0; i < sx.length; i++){
    let p = d.out, f = of0;
    for(let j = 0; j < sx.length && p.length >= 6; j++){
      if(j === i) continue;
      const nx = sx[j] - sx[i], ny = sy[j] - sy[i];
      p = clipHalf(p, f, (sx[i] + sx[j]) / 2, (sy[i] + sy[j]) / 2, nx, ny); f = CF;
    }
    if(p.length < 6) continue;
    const c = centroid(p); if(!c || c[2] < .002) continue;
    made.push([p, f, c]);
  }
  const vyObj = o.vy, now = performance.now(), sp = R * d.speed;
  for(const [p, f, c] of made){
    let rr = 0, i2 = 0;
    for(let k = 0; k < p.length; k += 2){ const dx = p[k] - c[0], dy = p[k + 1] - c[1], q = dx * dx + dy * dy; i2 += q; if(q > rr) rr = q; }
    rr = Math.sqrt(rr); i2 /= p.length / 2;
    let dx = c[0] - ix, dy = c[1] - iy; const dist = Math.hypot(dx, dy) + 1e-6; dx /= dist; dy /= dist;
    const fall = Math.max(.15, 1 - dist / 2.2), size = Math.sqrt(c[2]);
    const v = sp * (2.2 + 6 * fall) * rnd(.65, 1.2) / (.7 + size * .6);
    const sh = {
      d, pts: p, fl: f, n: p.length / 2, ox: c[0], oy: c[1], m: c[2], rr, I: c[2] * i2 * R * R * .5,
      x: ox0 + c[0] * R, y: oy0 + c[1] * R, a: 0,
      vx: dx * v + rnd(-.6, .6) * sp, vy: dy * v * .8 - sp * rnd(2, 4.6) * fall + vyObj,
      w: rnd(-1, 1) * (5 + 9 * fall) * d.spin / (.5 + size), z: L.zObj + rnd(-.06, .06) * L.D, vz: rnd(-1, 1) * L.D * 1.6 * fall,
      rest: 0, lie: 1, sleep: false, baked: false, fade: 1, fading: false, born: now, hit: 0
    };
    sh.lieT = Math.max(.42, Math.min(.85, .95 - size * .9)) * (d.id === 'melon' ? 1.15 : 1);
    if(d.id === 'melon'){ sh.vx *= .9; sh.vy = dy * v * .5 - sp * rnd(1.4, 3) * fall + vyObj; }
    S.shards.push(sh);
  }
  // cap
  let over = S.shards.length - MAXS;
  if(over > 0){
    let rebake = false;
    for(const s of S.shards){ if(over <= 0) break; if(!s.fading){ s.fading = true; if(s.baked){ s.baked = false; s.sleep = false; rebake = true; } over--; } }
    if(rebake) bake();
  }
  // particles
  const wx = ox0 + ix * R, wy = oy0 + iy * R;
  for(let k = 0; k < d.glint; k++){ const a = rnd(0, TAU), s = rnd(.5, 1) * R * 5; part(0, wx, wy, Math.cos(a) * s, Math.sin(a) * s - R, L.fy + L.zObj + rnd(-1, 1) * L.D * .4, rnd(.35, .8), rnd(3, 7), ''); }
  if(d.dust) for(let k = 0; k < 22; k++){ const a = rnd(0, TAU), s = rnd(.2, 1) * R * 2.2; part(1, wx, wy, Math.cos(a) * s, Math.sin(a) * s, 0, rnd(.6, 1.3), rnd(4, 12), d.dust); }
  if(d.juice){
    for(let k = 0; k < 46; k++){ const a = rnd(0, TAU), s = rnd(.3, 1.1) * R * 5; part(2, wx, wy, Math.cos(a) * s, Math.sin(a) * s - R * 3, L.fy + L.zObj + rnd(-1, 1) * L.D * .5, 3, rnd(2, 5.5), k % 4 ? '#e8394a' : '#ff6d70'); }
    for(let k = 0; k < 5; k++) splat(wx + rnd(-1, 1) * R * .6, L.fy + L.zObj + rnd(-.2, .4) * L.D, rnd(.25, .5) * R, 'rgba(200,30,50,');
  }
  if(d.drink) for(let k = 0; k < 30; k++){ const a = rnd(0, TAU), s = rnd(.3, 1) * R * 4; part(2, wx, oy0 - .6 * R, Math.cos(a) * s, Math.sin(a) * s - R * 2.5, L.fy + L.zObj + rnd(-1, 1) * L.D * .5, 3, rnd(1.8, 4), 'rgba(235,160,70,.85)'); }
  if(d.sparks){ S.sparkT = 1.1; S.sparkX = ox0 - .25 * R; S.sparkY = oy0 - .96 * R; S.fizzT = .9; spark(26); }
  S.flash = { x: wx, y: wy, t: now, r: R * (d.id === 'melon' ? 1.2 : 1.6), tv: !!d.sparks };
  if(!reduce.matches){ S.shake = d.id === 'tv' || d.id === 'melon' ? 7 : 5; S.shakeT = now; }
  crashSound(d, (ix) * .3);
  J.buzz(d.id === 'tv' ? [30, 40, 20] : 28);
  S.obj = null;
  S.total++; J.store.set('smash-total', S.total); J.stat();
  advance(); S.nextAt = now + 750; S.dirty = true;
}
function spark(n){
  for(let k = 0; k < n; k++){
    const a = rnd(0, TAU), s = rnd(.3, 1) * L.R * 6;
    part(3, S.sparkX + rnd(-.4, .4) * L.R, S.sparkY + rnd(-.3, .3) * L.R, Math.cos(a) * s, Math.sin(a) * s - L.R * 2, L.fy + L.zObj + rnd(-1, 1) * L.D * .5, rnd(.3, .7), rnd(1.2, 2.2), Math.random() < .5 ? '#fff4c8' : '#ffc46a');
  }
}

/* ---------- sound ---------- */
function crashSound(d, pan){
  const p = d.pitch * rnd(.94, 1.06);
  if(d.snd === 'ceramic' || d.snd === 'tv'){
    J.sfx.noise({ type: 'bandpass', freq: 2600 * p, freq2: 1200, Q: .7, peak: .55, dec: .22, pan });
    J.sfx.noise({ type: 'highpass', freq: 5200, peak: .2, dec: .35, att: .01, wet: .3, pan });
    J.sfx.tone({ f: 190 * p, f2: 70, peak: .38, dec: .12, pan });
    const n = d.snd === 'tv' ? 5 : 8;
    for(let i = 0; i < n; i++) J.sfx.tone({ f: rnd(2400, 5200) * p, peak: rnd(.04, .1), dec: rnd(.05, .14), delay: rnd(.01, .32), wet: .35, pan: pan + rnd(-.4, .4) });
    for(let i = 0; i < 5; i++) J.sfx.noise({ type: 'bandpass', freq: rnd(2500, 6000), Q: 3, peak: rnd(.08, .16), dec: .02, delay: rnd(.05, .45), pan: rnd(-.6, .6) });
  }
  if(d.snd === 'glass'){
    J.sfx.noise({ type: 'highpass', freq: 3800, peak: .4, dec: .18, wet: .4, pan });
    J.sfx.tone({ f: 240, f2: 120, peak: .18, dec: .05 });
    for(let i = 0; i < 13; i++) J.sfx.tone({ f: rnd(3200, 7800), peak: rnd(.05, .12), dec: rnd(.06, .22), delay: Math.pow(Math.random(), 1.6) * .55, wet: .55, pan: pan + rnd(-.6, .6) });
  }
  if(d.snd === 'melon'){
    J.sfx.tone({ f: 120 * p, f2: 48, peak: .6, dec: .26 });
    J.sfx.noise({ type: 'lowpass', freq: 900, freq2: 180, Q: 4, peak: .5, dec: .3, att: .01 });
    J.sfx.noise({ type: 'bandpass', freq: 1400, freq2: 500, Q: 1.5, peak: .2, dec: .2, delay: .02 });
    for(let i = 0; i < 5; i++) J.sfx.noise({ type: 'lowpass', freq: rnd(500, 1100), Q: 5, peak: rnd(.08, .16), dec: .06, delay: rnd(.15, .6), pan: rnd(-.6, .6) });
  }
  if(d.snd === 'tv'){
    J.sfx.tone({ f: 70, f2: 40, peak: .4, dec: .3 });
    J.sfx.tone({ type: 'sawtooth', f: 118, f2: 60, peak: .07, dec: .9, att: .02 });
    J.sfx.tone({ type: 'square', f: 15600 / 2, peak: .015, dec: .5 });
    J.sfx.noise({ type: 'highpass', freq: 6000, peak: .14, dec: 1, att: .05 });
    for(let i = 0; i < 6; i++) J.sfx.noise({ type: 'bandpass', freq: rnd(3000, 7000), Q: 4, peak: rnd(.08, .18), dec: .012, delay: rnd(.05, 1) });
  }
}
function clink(s, sp){
  const now = performance.now();
  if(S.clinks > 2 || now - S.lastClink < 18) return;
  S.clinks++; S.lastClink = now;
  const d = s.d, g = Math.min(1, sp / (L.R * 9)), sz = Math.sqrt(s.m), pan = (s.x / W - .5) * 1.2;
  if(d.snd === 'glass') J.sfx.tone({ f: rnd(4200, 7600) / (.7 + sz), peak: .08 * g + .02, dec: rnd(.05, .12), wet: .4, pan });
  else if(d.snd === 'melon') J.sfx.noise({ type: 'lowpass', freq: rnd(400, 800), Q: 3, peak: .14 * g + .03, dec: .05, pan });
  else if(d.snd === 'tv' && Math.random() < .5) J.sfx.noise({ type: 'bandpass', freq: rnd(1200, 2200), Q: 2, peak: .1 * g + .03, dec: .025, pan });
  else { J.sfx.tone({ f: rnd(2600, 4600) * d.pitch / (.7 + sz), peak: .06 * g + .02, dec: rnd(.03, .07), wet: .2, pan }); J.sfx.noise({ type: 'bandpass', freq: 3000, Q: 2, peak: .06 * g, dec: .012, pan }); }
}
function swishSound(n){
  J.sfx.noise({ type: 'bandpass', freq: 500, freq2: 2600, Q: .9, peak: .32, dec: .75, att: .22 });
  J.sfx.noise({ type: 'highpass', freq: 3500, peak: .1, dec: .6, att: .3 });
  const m = Math.min(10, 2 + n / 25 | 0);
  for(let i = 0; i < m; i++) J.sfx.tone({ f: rnd(2500, 5200), peak: rnd(.02, .05), dec: .05, delay: rnd(.2, .9), pan: rnd(-.2, .9) });
}

/* ---------- physics ---------- */
function stepShards(dt){
  const g = L.R * 22, R = L.R, sw = S.sweep;
  let active = false;
  for(const s of S.shards){
    if(s.fading){ s.fade -= dt * 1.6; active = true; }
    if(s.sleep) continue;
    active = true;
    s.vy += g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.w * dt;
    s.z += s.vz * dt; if(s.z < 2){ s.z = 2; s.vz = Math.abs(s.vz) * .3; } else if(s.z > L.D - 3){ s.z = L.D - 3; s.vz = -Math.abs(s.vz) * .3; }
    const fy = L.fy + s.z;
    // deepest vertex
    const c = Math.cos(s.a), sn = Math.sin(s.a), pts = s.pts, sc = R;
    let my = -1e9, mrx = 0, mry = 0, minx = 1e9, maxx = -1e9;
    for(let i = 0; i < pts.length; i += 2){
      const lx = (pts[i] - s.ox) * sc, ly = (pts[i + 1] - s.oy) * sc, rx = c * lx - sn * ly, ry = (sn * lx + c * ly) * s.lie;
      if(ry > my){ my = ry; mrx = rx; mry = ry; }
      if(rx < minx) minx = rx; if(rx > maxx) maxx = rx;
    }
    let contact = false;
    if(s.y + my > fy){
      contact = true;
      s.y = fy - my;
      const vcx = s.vx - s.w * mry, vcy = s.vy + s.w * mrx;
      if(vcy > 0){
        const im = 1 / s.m, ii = 1 / s.I;
        const e = vcy > R * 2.5 ? s.d.e : 0;
        const jn = (1 + e) * vcy / (im + mrx * mrx * ii);
        s.vy -= jn * im; s.w -= jn * mrx * ii;
        let jt = -vcx / (im + mry * mry * ii); const mu = .55 * jn;
        if(jt > mu) jt = mu; else if(jt < -mu) jt = -mu;
        s.vx += jt * im; s.w -= mry * jt * ii;
        s.vz *= .85;
        if(vcy > R * 3 && performance.now() - s.hit > 120){ s.hit = performance.now(); clink(s, vcy); }
      }
      const slow = Math.abs(s.vx) + Math.abs(s.vy) < R * 2;
      s.w *= slow ? Math.exp(-dt * 7) : .985;
      if(slow) s.vx *= Math.exp(-dt * 4);
    }
    if(!sw){
      if(s.x + minx < 0){ s.x = -minx; s.vx = Math.abs(s.vx) * .4; }
      else if(s.x + maxx > W){ s.x = W - maxx; s.vx = -Math.abs(s.vx) * .4; }
    }
    if(contact && Math.abs(s.vx) + Math.abs(s.vy) < R * 1.2 && s.lie > s.lieT){ s.lie = Math.max(s.lieT, s.lie - dt * 1.8); }
    const age = (performance.now() - s.born) / 1000;
    if(contact && s.lie <= s.lieT && (Math.abs(s.vx) + Math.abs(s.w) * s.rr * R < R * .5 || age > 5)){
      s.rest += dt;
      if(s.rest > .25 && !s.fading && !sw){ s.sleep = true; s.vx = s.vy = s.w = s.vz = 0; s.baked = true; bakeOne(s); }
    } else s.rest = 0;
  }
  return active;
}
function stepSweep(now, dt){
  const sw = S.sweep; if(!sw) return false;
  const k = (now - sw.t0) / sw.dur;
  const e = k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
  const span = W + L.R * 4;
  sw.x = -L.R * 1.4 + span * e;
  const kk = Math.min(1, Math.max(0, k)), vx = span * 6 * kk * (1 - kk) / (sw.dur / 1000);
  for(const s of S.shards){
    const front = sw.x + L.R * .5 + (s.z / L.D - .5) * L.R * .4;
    if(s.x < front){
      if(s.baked){ s.baked = false; sw.rebake = true; }
      s.sleep = false; s.rest = 0; s.x = front + rnd(0, 3);
      const want = vx * rnd(1, 1.25);
      if(s.vx < want) s.vx = want;
      if(s.vy > -30 && Math.random() < .25) s.vy = -rnd(30, 160) * (L.R / 80);
      s.w += rnd(-2, 2);
      if(Math.random() < .02 && S.clinks < 2){ S.clinks++; J.sfx.tone({ f: rnd(2600, 5200), peak: .03, dec: .04, pan: .5 }); }
    }
  }
  for(const p of splats) if(p.x < sw.x + L.R * .5) p.a -= dt * 4;
  for(let i = splats.length - 1; i >= 0; i--) if(splats[i].a <= 0) splats.splice(i, 1);
  for(let i = S.shards.length - 1; i >= 0; i--) if(S.shards[i].x - S.shards[i].rr * L.R > W + 4) S.shards.splice(i, 1);
  if(sw.rebake){ sw.rebake = false; bake(); }
  if(k >= 1){
    S.sweep = null;
    for(let i = S.shards.length - 1; i >= 0; i--) if(S.shards[i].x > W - L.R * .8){ S.shards.splice(i, 1); }
    splats.length = 0;
    bake();
  }
  return true;
}
function stepParts(dt){
  const g = L.R * 20; let any = false;
  for(const q of parts){
    if(!q.on) continue;
    q.life -= dt; if(q.life <= 0){ q.on = false; continue; }
    any = true; q.px = q.x; q.py = q.y;
    if(q.k === 0){ q.vx *= Math.exp(-dt * 5); q.vy *= Math.exp(-dt * 5); q.x += q.vx * dt; q.y += q.vy * dt; }
    else if(q.k === 1){ q.vx *= Math.exp(-dt * 4); q.vy = q.vy * Math.exp(-dt * 4) - 20 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.s += dt * 14; }
    else {
      q.vy += g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if(q.y > q.fy){
        if(q.k === 2){ splat(q.x, q.fy, q.s * rnd(1.2, 2.4), q.col.charAt(0) === '#' ? 'rgba(205,35,55,' : 'rgba(220,140,50,'); q.on = false; }
        else { q.y = q.fy; q.vy *= -.35; q.vx *= .6; }
      }
    }
  }
  return any;
}

/* ---------- drawing ---------- */
function shardXf(c, s, k, dy){
  const R = L.R, co = Math.cos(s.a) * R * k, si = Math.sin(s.a) * R * k, l = s.lie;
  c.setTransform(co, si * l, -si, co * l, k * s.x - (co * s.ox - si * s.oy), k * (s.y + dy) - (si * s.ox + co * s.oy) * l);
}
function drawShard(c, s, k){
  const d = s.d, R = L.R, pts = s.pts;
  // shadow
  const fy = L.fy + s.z, ht = Math.max(0, fy - s.y - s.rr * R * .5);
  const sa = Math.max(0, .55 - ht / (R * 3));
  if(sa > .02){
    const w = s.rr * R * 2.4 * (1 + ht / (R * 4));
    c.setTransform(k, 0, 0, k, 0, 0); c.globalAlpha = sa * s.fade;
    c.drawImage(blob, s.x - w / 2, fy - w * .14, w, w * .28);
  }
  c.globalAlpha = s.fade;
  if(d.thick){
    shardXf(c, s, k, d.thick * Math.min(1, R / 90) + .5);
    polyPath(c, pts); c.fillStyle = d.body; c.fill();
  }
  shardXf(c, s, k, 0);
  polyPath(c, pts); c.fillStyle = d.inSpr.pat; c.fill();
  const n = s.n, fl = s.fl;
  if(d.rind){
    c.save(); c.clip();
    c.beginPath(); let any = false;
    for(let i = 0; i < n; i++) if(fl[i]){ const j = i + 1 === n ? 0 : i + 1; c.moveTo(pts[2 * i], pts[2 * i + 1]); c.lineTo(pts[2 * j], pts[2 * j + 1]); any = true; }
    if(any){
      c.lineCap = 'round';
      c.lineWidth = .34; c.strokeStyle = '#f3eccb'; c.stroke();
      c.lineWidth = .2; c.strokeStyle = '#3e7f2c'; c.stroke();
      c.lineWidth = .08; c.strokeStyle = '#1d4a17'; c.stroke();
    }
    c.restore();
  } else if(d.edge){
    c.beginPath(); let any = false;
    for(let i = 0; i < n; i++) if(d.allEdges || !fl[i]){ const j = i + 1 === n ? 0 : i + 1; c.moveTo(pts[2 * i], pts[2 * i + 1]); c.lineTo(pts[2 * j], pts[2 * j + 1]); any = true; }
    if(any){ c.lineWidth = d.edgeW / R; c.lineJoin = 'round'; c.strokeStyle = d.edge; c.stroke(); }
  }
  c.globalAlpha = 1;
}
function bakeOne(s){ drawShard(lx, s, K); }
function bake(){
  lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, lay.width, lay.height);
  const list = S.shards.filter(s => s.baked).sort((a, b) => a.z - b.z);
  for(const s of list) drawShard(lx, s, K);
}
function drawObj(c, o, now){
  const d = o.d, R = L.R, x = L.cx, y = L.base + o.y;
  // contact shadow
  const ht = Math.max(0, -o.y), w = (d.bb.x1 - d.bb.x0) * R * 1.15 * (1 + ht / (R * 6));
  c.setTransform(K, 0, 0, K, 0, 0);
  c.globalAlpha = Math.max(.1, .75 - ht / (R * 5));
  c.drawImage(blob, x - w / 2, L.base - w * .07, w, w * .14);
  c.globalAlpha = 1;
  const sx = 1 + o.sq, sy = 1 - o.sq;
  c.setTransform(K * R * sx, 0, 0, K * R * sy, K * x, K * y);
  polyPath(c, d.out); c.fillStyle = d.spr.pat; c.fill();
}
function drawStand(c, x, a){
  const R = L.R, y = L.base;
  c.setTransform(K, 0, 0, K, 0, 0); c.globalAlpha = a;
  c.fillStyle = '#4a2e18';
  c.beginPath(); c.moveTo(x - R * .55, y); c.lineTo(x - R * .2, y - R * .7); c.lineTo(x - R * .12, y - R * .66); c.lineTo(x - R * .4, y); c.fill();
  c.beginPath(); c.moveTo(x + R * .55, y); c.lineTo(x + R * .2, y - R * .7); c.lineTo(x + R * .12, y - R * .66); c.lineTo(x + R * .4, y); c.fill();
  c.globalAlpha = 1;
}
function drawStandFront(c, x){
  const R = L.R, y = L.base;
  c.setTransform(K, 0, 0, K, 0, 0);
  const g = c.createLinearGradient(0, y - R * .22, 0, y);
  g.addColorStop(0, '#9a6538'); g.addColorStop(1, '#5e3a1d');
  c.fillStyle = g; rrPath(c, x - R * .7, y - R * .2, R * 1.4, R * .2, R * .05); c.fill();
  c.fillStyle = 'rgba(255,220,170,.25)'; c.fillRect(x - R * .66, y - R * .2, R * 1.32, 1.5);
  c.fillStyle = 'rgba(40,20,5,.5)'; c.fillRect(x - R * .6, y - R * .12, R * 1.2, 2);
}
function drawBroom(c, x){
  const R = L.R, fy = L.fy + L.D * .85, top = L.fy - R * 2.2;
  c.setTransform(K, 0, 0, K, 0, 0);
  c.strokeStyle = '#a77b4c'; c.lineWidth = Math.max(4, R * .07); c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - R * .9, top); c.lineTo(x - R * .05, fy - R * .5); c.stroke();
  c.strokeStyle = 'rgba(255,230,190,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - R * .9, top); c.lineTo(x - R * .05, fy - R * .5); c.stroke();
  c.fillStyle = '#7a3b2a'; c.fillRect(x - R * .25, fy - R * .58, R * .45, R * .16);
  c.fillStyle = '#d8b56a';
  c.beginPath(); c.moveTo(x - R * .25, fy - R * .44); c.lineTo(x + R * .2, fy - R * .44); c.lineTo(x + R * .62, fy); c.lineTo(x - R * .3, fy); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(120,85,30,.6)'; c.lineWidth = 1;
  c.beginPath(); for(let i = 0; i <= 8; i++){ const t = i / 8; c.moveTo(x - R * .22 + t * R * .4, fy - R * .42); c.lineTo(x - R * .28 + t * R * .88, fy); } c.stroke();
}
function drawShelf(c){
  const R = L.R, sc = .34, y = L.sy;
  const span = L.sx1 - L.sx0 - 30;
  c.setTransform(K, 0, 0, K, 0, 0);
  for(let k = 3; k >= 1; k--){
    const d = DEFS[(S.idx + k) % DEFS.length], spr = d.spr.cvs, b = d.bb;
    const w = (b.x1 - b.x0) * R * sc, h = (b.y1 - b.y0) * R * sc;
    const cx = L.sx1 - 15 - span * (k - .5) / 3;
    c.globalAlpha = k === 1 ? 1 : .85;
    c.drawImage(blob, cx - w * .6, y - 3, w * 1.2, 6);
    c.drawImage(spr, cx + b.x0 * R * sc, y + b.y0 * R * sc + 1, w, h);
  }
  c.globalAlpha = 1;
}
function draw(now){
  const c = ctx, R = L.R;
  let ox = 0, oy = 0;
  if(S.shake){
    const t = (now - S.shakeT) / 260;
    if(t >= 1) S.shake = 0;
    else { const a = S.shake * (1 - t) * (1 - t); ox = Math.sin(now * .09) * a; oy = Math.cos(now * .11) * a * .7; }
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = J.C.panel; c.fillRect(0, 0, cv.cv.width, cv.cv.height);
  c.drawImage(bg, ox * K, oy * K);
  Kx = ox; Ky = oy;
  withShake(c, () => {
    drawShelf(c);
    for(const p of splats){
      c.setTransform(K, 0, 0, K, 0, 0); c.globalAlpha = p.a * .8; c.fillStyle = p.col + '.75)';
      c.beginPath(); c.ellipse(p.x, p.y, p.s, p.s * p.sq, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,200,200,.18)'; c.beginPath(); c.ellipse(p.x - p.s * .25, p.y - p.s * p.sq * .3, p.s * .35, p.s * p.sq * .25, 0, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(lay, 0, 0);
    const act = [];
    for(const s of S.shards) if(!s.baked) act.push(s);
    act.sort((a, b) => a.z - b.z);
    let i = 0;
    for(; i < act.length && act[i].z < L.zObj; i++) drawShard(c, act[i], K);
    if(S.stand > 0) drawStand(c, L.cx, S.stand);
    if(S.obj) drawObj(c, S.obj, now);
    for(; i < act.length; i++) drawShard(c, act[i], K);
    if(S.stand > 0){ c.globalAlpha = S.stand; drawStandFront(c, L.cx); c.globalAlpha = 1; }
    // particles
    c.setTransform(K, 0, 0, K, 0, 0);
    for(const q of parts){
      if(!q.on) continue;
      const a = Math.min(1, q.life / (q.max * .5));
      if(q.k === 1){ c.globalAlpha = a * .35; c.fillStyle = q.col + '.5)'; c.beginPath(); c.arc(q.x, q.y, q.s, 0, TAU); c.fill(); }
      else if(q.k === 2){ c.globalAlpha = 1; c.fillStyle = q.col; c.beginPath(); c.arc(q.x, q.y, q.s * .6, 0, TAU); c.fill(); }
    }
    c.globalCompositeOperation = 'lighter';
    for(const q of parts){
      if(!q.on) continue;
      const a = Math.min(1, q.life / (q.max * .5));
      if(q.k === 0){
        const r = q.s * (.5 + a * .5); c.globalAlpha = a; c.strokeStyle = 'rgba(255,248,230,.95)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(q.x - r, q.y); c.lineTo(q.x + r, q.y); c.moveTo(q.x, q.y - r); c.lineTo(q.x, q.y + r); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(q.x - 1, q.y - 1, 2, 2);
      } else if(q.k === 3){
        c.globalAlpha = a; c.strokeStyle = q.col; c.lineWidth = q.s; c.lineCap = 'round';
        c.beginPath(); c.moveTo(q.px - q.vx * .018, q.py - q.vy * .018); c.lineTo(q.x, q.y); c.stroke();
      }
    }
    if(S.flash){
      const t = (now - S.flash.t) / 320;
      if(t >= 1) S.flash = null;
      else {
        const f = S.flash, r = f.r * (.3 + t * .9);
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255,250,235,${.7 * (1 - t)})`); g.addColorStop(.4, `rgba(255,220,170,${.25 * (1 - t)})`); g.addColorStop(1, 'rgba(255,220,170,0)');
        c.globalAlpha = 1; c.fillStyle = g; c.fillRect(f.x - r, f.y - r, r * 2, r * 2);
        if(f.tv && t < .5){ c.fillStyle = `rgba(190,255,245,${.35 * (1 - t * 2)})`; c.fillRect(0, 0, W, H); }
      }
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    if(S.sweep) drawBroom(c, S.sweep.x);
  });
}
let Kx = 0, Ky = 0;
function withShake(c, fn){
  if(!Kx && !Ky){ fn(); return; }
  // screen shake: offset every transform set while drawing this frame
  const st = c.setTransform.bind(c);
  c.setTransform = (a, b, cc, d, e, f) => st(a, b, cc, d, e + Kx * K, f + Ky * K);
  try{ fn(); } finally { c.setTransform = st; }
}

/* ---------- input ---------- */
function onDown(e){
  e.preventDefault(); J.ac();
  const [x, y] = J.local(e, cv.cv);
  const o = S.obj;
  if(o && o.state !== 'leave'){
    const d = o.d, R = L.R, ix = (x - L.cx) / R, iy = (y - L.base - o.y) / R, b = d.bb, pad = .45;
    if(ix > b.x0 - pad && ix < b.x1 + pad && iy > b.y0 - pad && iy < b.y1 + pad){ smash(x, y); return; }
  }
  poke(x, y);
}
function poke(x, y){
  const R = L.R; let n = 0, rebake = false;
  for(const s of S.shards){
    const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
    if(d > R * 1.1) continue;
    const f = 1 - d / (R * 1.1);
    if(s.baked){ s.baked = false; rebake = true; }
    s.sleep = false; s.rest = 0;
    s.vx += (dx / (d + 1)) * R * 3 * f + rnd(-1, 1) * R; s.vy -= R * (4 + 5 * f) * rnd(.6, 1); s.w += rnd(-12, 12) * f;
    n++;
  }
  if(rebake) bake();
  if(n){
    for(let k = 0; k < Math.min(4, n); k++) J.sfx.tone({ f: rnd(2600, 5000), peak: .05, dec: .06, delay: k * .03, wet: .2 });
    J.sfx.noise({ type: 'bandpass', freq: 2200, Q: 1, peak: .12, dec: .05 });
    J.buzz(8); S.dirty = true;
  }
}

J.register({
  id: 'smash', name: '砸盘子', hint: '点一下，砸碎它',
  create(root){
    cv = J.canvas(root, { dprMax: 2 }); ctx = cv.ctx;
    bg = document.createElement('canvas'); bgx = bg.getContext('2d');
    lay = document.createElement('canvas'); lx = lay.getContext('2d');
    blob = document.createElement('canvas');
    cv.cv.style.cursor = 'pointer';
    cv.cv.addEventListener('pointerdown', onDown);
  },
  resize(w, h){
    const oW = W, oH = H, oR = L.R, ofy = L.fy;
    cv.fit(w, h); W = w; H = h; K = cv.k;
    layout(); renderBg(); buildSprites();
    lay.width = Math.ceil(W * K); lay.height = Math.ceil(H * K);
    if(oW){
      const sx = W / oW;
      for(const s of S.shards){ s.x *= sx; s.y = L.fy + (s.y - ofy) * L.R / oR; s.z = Math.min(L.D - 3, s.z * L.R / oR); s.I *= (L.R / oR) * (L.R / oR); }
      for(const p of splats){ p.x *= sx; p.y = L.fy + (p.y - ofy) * L.R / oR; p.s *= L.R / oR; }
    }
    if(!S.obj && !S.nextAt) newObj(false);
    bake(); S.dirty = true;
  },
  enter(){ S.dirty = true; },
  tick(now, dt){
    if(!W) return;
    const t = dt / 1000;
    S.clinks = 0;
    let busy = false;
    if(S.nextAt && now >= S.nextAt){ S.nextAt = 0; newObj(true); }
    if(S.nextAt) busy = true;
    const o = S.obj;
    if(o){
      if(o.state === 'drop'){
        busy = true;
        o.vy += L.R * 24 * t; o.y += o.vy * t;
        if(o.y >= 0){
          o.y = 0;
          if(!o.landed){ o.landed = true; landSound(o.d); J.buzz(6); }
          o.sqv += o.vy / L.R * .06;
          if(o.vy > L.R * 3){ o.vy = -o.vy * .26; }
          else { o.vy = 0; o.state = 'rest'; }
        }
      } else if(o.state === 'leave'){
        busy = true;
        o.vy -= L.R * 30 * t; o.y += o.vy * t;
        if(o.y < -(L.base + 3 * L.R)){ S.obj = null; S.nextAt = now + 60; }
      }
      if(o.sq || o.sqv){
        o.sqv += (-320 * o.sq - 14 * o.sqv) * t; o.sq += o.sqv * t; busy = true;
        if(Math.abs(o.sq) < 1e-4 && Math.abs(o.sqv) < 1e-3){ o.sq = o.sqv = 0; }
      }
    }
    const stT = S.obj && S.obj.d.id === 'plate' && S.obj.state !== 'leave' ? 1 : 0;
    if(S.stand !== stT){ S.stand += Math.sign(stT - S.stand) * Math.min(Math.abs(stT - S.stand), t * 3); busy = true; }
    if(S.sparkT > 0){ S.sparkT -= t; busy = true; if(Math.random() < .35) spark(1 + (Math.random() * 3 | 0)); if(Math.random() < .08) J.sfx.noise({ type: 'bandpass', freq: rnd(3000, 7000), Q: 4, peak: .08, dec: .012 }); }
    let n = Math.ceil(t / (1 / 120)); const h = t / Math.max(1, n);
    for(let i = 0; i < n; i++) if(stepShards(h)) busy = true;
    if(stepSweep(now, t)) busy = true;
    for(let i = S.shards.length - 1; i >= 0; i--) if(S.shards[i].fade <= 0) S.shards.splice(i, 1);
    if(stepParts(t)) busy = true;
    if(S.flash || S.shake) busy = true;
    if(busy || S.dirty){ draw(now); S.dirty = false; }
  },
  key(e){ if(e.code === 'Space'){ if(S.obj && S.obj.state !== 'leave'){ const o = S.obj, d = o.d; smash(L.cx + rnd(-.2, .2) * L.R, L.base + o.y + (d.cyc + rnd(-.2, .2)) * L.R); } return true; } },
  actions: [
    { label: '扫干净', run(){
      if(S.sweep || (!S.shards.length && !splats.length)) return;
      S.sweep = { t0: performance.now(), dur: 1300, x: -L.R * 1.4, rebake: false };
      swishSound(S.shards.length); J.buzz(10);
    } },
    { label: '换一个', run(){
      const o = S.obj;
      if(o && o.state !== 'leave'){ o.state = 'leave'; o.vy = -L.R * 4; advance(); J.sfx.noise({ type: 'bandpass', freq: 900, freq2: 2400, Q: 1, peak: .12, dec: .2, att: .05 }); }
      else if(!o && S.nextAt){ S.nextAt = performance.now(); }
    } }
  ],
  stat: () => `砸了 <b>${J.fmt(S.total)}</b> 个`
});
})();

