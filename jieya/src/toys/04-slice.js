// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== slice ===== */
/* 切切乐 — drag a blade through soft things sitting on a cutting board */
(() => {
const TAU = J.TAU;
const MAXP = 250, MAXV = 120, NPART = 340, NPUD = 36;
const FONT = '"ZCOOL XiaoWei","Songti SC","Noto Serif SC",serif';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const rnd = (a, b) => a + Math.random() * (b - a);
function rng(seed){ let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/* ---------- shapes (object space, unit = L.R px, positive orientation in y-down coords) ---------- */
function rrPoly(w, h, r, seg){
  const p = [], cs = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
  for(const [cx, cy, a0] of cs) for(let i = 0; i <= seg; i++){ const a = a0 + Math.PI / 2 * i / seg; p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return p;
}
function circPoly(r, n){ const p = []; for(let i = 0; i < n; i++){ const a = -Math.PI / 2 + i / n * TAU; p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; }
function rrPath(c, x, y, w, h, r){
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function polyPath(c, p){ c.beginPath(); c.moveTo(p[0], p[1]); for(let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); }

/* ---------- material textures (painted once in object space) ---------- */
function fillAll(c, b, st){ c.fillStyle = st; c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
function gloss(c, x, y, rx, ry, rot, a){
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.55, `rgba(255,255,255,${a * .35})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore();
}
function paintJelly(c, b){
  const g = c.createRadialGradient(-.38, -.42, .05, -.05, 0, 1.45);
  g.addColorStop(0, '#ff9fab'); g.addColorStop(.45, '#e6435d'); g.addColorStop(1, '#a1143a');
  fillAll(c, b, g);
  const r = rng(11);
  for(let i = 0; i < 10; i++){
    const x = (r() - .5) * 1.4, y = (r() - .5) * 1.15, a = r() * TAU;
    c.save(); c.translate(x, y); c.rotate(a);
    if(i % 3 === 2){
      c.fillStyle = '#3d2c63'; c.beginPath(); c.arc(0, 0, .078, 0, TAU); c.fill();
      c.fillStyle = 'rgba(175,155,225,.6)'; c.beginPath(); c.arc(-.026, -.026, .022, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#ffae42'; c.beginPath(); c.ellipse(0, 0, .2, .088, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,224,160,.75)'; c.beginPath(); c.ellipse(0, -.022, .155, .042, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(225,130,35,.55)'; c.lineWidth = .009; c.beginPath();
      for(let k = -2; k <= 2; k++){ c.moveTo(k * .05, -.065); c.lineTo(k * .065, .07); }
      c.stroke();
    }
    c.restore();
  }
  fillAll(c, b, 'rgba(222,46,78,.36)');
  for(let i = 0; i < 34; i++){
    const x = (r() - .5) * 1.7, y = (r() - .5) * 1.45, s = .006 + r() * .02;
    c.fillStyle = 'rgba(255,225,232,.5)'; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - s * .3, y - s * .3, s * .35, 0, TAU); c.fill();
  }
  const v = c.createRadialGradient(0, 0, .5, 0, 0, 1.3);
  v.addColorStop(0, 'rgba(120,0,30,0)'); v.addColorStop(1, 'rgba(110,0,30,.35)'); fillAll(c, b, v);
  gloss(c, -.46, -.5, .55, .16, -.45, .8);
  gloss(c, .55, .42, .3, .08, -.45, .25);
}
function paintCake(c, b){
  const g = c.createRadialGradient(-.2, -.25, .05, 0, 0, 1.05);
  g.addColorStop(0, '#dfa25a'); g.addColorStop(.7, '#c7863f'); g.addColorStop(1, '#a8682b');
  fillAll(c, b, g);
  const r = rng(5);
  for(let i = 0; i < 90; i++){
    const a = r() * TAU, d = Math.sqrt(r()) * .95, s = .02 + r() * .1;
    c.fillStyle = `rgba(${r() < .5 ? '120,62,18' : '245,205,140'},${.06 + r() * .14})`;
    c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, s, s * (.5 + r() * .5), r() * 3, 0, TAU); c.fill();
  }
  c.fillStyle = 'rgba(255,250,240,.7)';
  for(let i = 0; i < 1300; i++){
    const a = r() * TAU, d = .5 + Math.pow(r(), .6) * .5;
    if(r() < .5 && d < .7) continue;
    c.fillRect(Math.cos(a) * d, Math.sin(a) * d, .007 + r() * .007, .007 + r() * .007);
  }
  for(let i = 0; i < 9; i++){
    const a = i / 9 * TAU + .2, x = Math.cos(a) * .7, y = Math.sin(a) * .7;
    const rg = c.createRadialGradient(x - .03, y - .04, .01, x, y, .11);
    rg.addColorStop(0, '#e9536c'); rg.addColorStop(1, '#8e1530');
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, .1, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,170,185,.55)';
    for(let k = 0; k < 7; k++){ const aa = k / 7 * TAU, dd = k ? .055 : 0; c.beginPath(); c.arc(x + Math.cos(aa) * dd - .01, y + Math.sin(aa) * dd - .012, .013, 0, TAU); c.fill(); }
    c.fillStyle = '#4f8a3f'; c.beginPath(); c.ellipse(x + Math.cos(a) * .1, y + Math.sin(a) * .1, .05, .022, a, 0, TAU); c.fill();
  }
  const cg = c.createRadialGradient(-.05, -.06, .01, 0, 0, .25);
  cg.addColorStop(0, '#fffdf6'); cg.addColorStop(.75, '#f6e7cb'); cg.addColorStop(1, '#d8bb8c');
  c.fillStyle = cg; c.beginPath(); c.arc(0, 0, .23, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(190,150,100,.45)'; c.lineWidth = .012; c.beginPath();
  for(let t = 0; t < 1; t += .01){ const a = t * 16, d = .2 * (1 - t); t ? c.lineTo(Math.cos(a) * d, Math.sin(a) * d) : c.moveTo(.2, 0); }
  c.stroke();
  c.fillStyle = '#5b9a48'; c.beginPath(); c.ellipse(.12, -.15, .09, .035, -.7, 0, TAU); c.fill();
  c.fillStyle = '#7bb862'; c.beginPath(); c.ellipse(.17, -.07, .07, .028, .3, 0, TAU); c.fill();
  const v = c.createRadialGradient(0, 0, .75, 0, 0, 1.02);
  v.addColorStop(0, 'rgba(90,40,10,0)'); v.addColorStop(1, 'rgba(90,40,10,.35)'); fillAll(c, b, v);
}
function paintSoap(c, b){
  const g = c.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
  g.addColorStop(0, '#e6d8f6'); g.addColorStop(1, '#bea7dd');
  fillAll(c, b, g);
  const r = rng(3);
  c.lineCap = 'round';
  for(let i = 0; i < 11; i++){
    const y = (r() - .5) * 1.4;
    c.strokeStyle = `rgba(255,255,255,${.12 + r() * .28})`; c.lineWidth = .01 + r() * .05;
    c.beginPath(); c.moveTo(-1.1, y);
    c.bezierCurveTo(-.4, y + (r() - .5) * .9, .3, y + (r() - .5) * .9, 1.1, y + (r() - .5) * .5); c.stroke();
  }
  for(let i = 0; i < 5; i++){
    const y = (r() - .5) * 1.2;
    c.strokeStyle = 'rgba(150,115,200,.16)'; c.lineWidth = .02 + r() * .03;
    c.beginPath(); c.moveTo(-1.1, y); c.bezierCurveTo(-.3, y + (r() - .5), .4, y + (r() - .5), 1.1, y); c.stroke();
  }
  rrPath(c, -.8, -.44, 1.6, .88, .34);
  c.lineWidth = .022; c.strokeStyle = 'rgba(255,255,255,.45)'; c.save(); c.translate(.012, .014); c.stroke(); c.restore();
  c.strokeStyle = 'rgba(105,75,150,.3)'; c.stroke();
  c.save(); c.scale(.01, .01); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `44px ${FONT}`;
  c.fillStyle = 'rgba(255,255,255,.6)'; c.fillText('解 压', 1.6, 3.6);
  c.fillStyle = 'rgba(96,66,140,.42)'; c.fillText('解 压', 0, 2);
  c.fillStyle = 'rgba(205,186,232,.9)'; c.fillText('解 压', .7, 2.8);
  c.restore();
  gloss(c, -.5, -.42, .6, .14, -.25, .55);
}
function paintTofu(c, b){
  fillAll(c, b, '#f5efe1');
  const r = rng(9);
  c.strokeStyle = 'rgba(170,150,110,.11)'; c.lineWidth = .007; c.beginPath();
  for(let x = -1; x <= 1; x += .045){ c.moveTo(x, -1); c.lineTo(x + .02, 1); }
  for(let y = -1; y <= 1; y += .045){ c.moveTo(-1, y); c.lineTo(1, y + .015); }
  c.stroke();
  for(let i = 0; i < 650; i++){
    c.fillStyle = `rgba(185,165,125,${.08 + r() * .16})`;
    c.beginPath(); c.arc((r() - .5) * 1.8, (r() - .5) * 1.8, .003 + r() * .009, 0, TAU); c.fill();
  }
  const v = c.createRadialGradient(-.1, -.1, .3, 0, 0, 1.25);
  v.addColorStop(0, 'rgba(255,253,245,.5)'); v.addColorStop(.6, 'rgba(255,250,235,0)'); v.addColorStop(1, 'rgba(205,180,125,.32)');
  fillAll(c, b, v);
  gloss(c, -.35, -.4, .55, .22, -.5, .4);
}

/* ---------- sounds ---------- */
const SND = {
  jelly(v, g){
    J.sfx.noise({ type: 'lowpass', freq: 1100 * v, freq2: 210, Q: 6, peak: .42 * g, dec: .17, att: .012 });
    J.sfx.tone({ f: 240 * v, f2: 92, peak: .26 * g, dec: .16, att: .01 });
    J.sfx.tone({ f: 620 * v, f2: 1150 * v, peak: .05 * g, dec: .07, delay: .05 });
  },
  cake(v, g){
    J.sfx.noise({ type: 'bandpass', freq: 950 * v, freq2: 480, Q: .9, peak: .26 * g, dec: .14, att: .02 });
    for(let i = 0; i < 4; i++) J.sfx.noise({ type: 'bandpass', freq: rnd(2200, 4800), Q: 4, peak: rnd(.05, .1) * g, dec: .012, delay: .03 + Math.random() * .14 });
    J.sfx.tone({ f: 130 * v, f2: 90, peak: .12 * g, dec: .08 });
  },
  soap(v, g){
    J.sfx.noise({ type: 'highpass', freq: 4800 * v, Q: .8, peak: .3 * g, dec: .016 });
    J.sfx.tone({ f: 2350 * v, f2: 2150 * v, peak: .1 * g, dec: .04 });
    J.sfx.noise({ type: 'bandpass', freq: 1500 * v, Q: 2, peak: .1 * g, dec: .06, delay: .008 });
  },
  tofu(v, g){
    J.sfx.noise({ type: 'lowpass', freq: 700 * v, freq2: 240, Q: 3, peak: .32 * g, dec: .11, att: .01 });
    J.sfx.tone({ f: 170 * v, f2: 120, peak: .14 * g, dec: .1 });
    J.sfx.tone({ f: 1050 * v, f2: 1650 * v, peak: .06 * g, dec: .045, delay: .13 + Math.random() * .1, wet: .35 });
  }
};
function sndSwish(){ J.sfx.noise({ type: 'bandpass', freq: rnd(2400, 3000), freq2: 900, Q: 1.2, peak: .08, dec: .16, att: .04 }); }
function sndLand(m, g){
  J.sfx.tone({ f: m.id === 'jelly' ? 190 : 140, f2: 70, peak: .3 * g, dec: .15 });
  J.sfx.noise({ type: 'lowpass', freq: 520, Q: 1, peak: .22 * g, dec: .07 });
  if(m.id === 'jelly') J.sfx.tone({ f: 330, f2: 210, peak: .08 * g, dec: .12, delay: .06 });
}
function sndPoke(m){
  const v = rnd(.9, 1.12);
  if(m.id === 'jelly'){ J.sfx.tone({ f: 320 * v, f2: 190, peak: .2, dec: .12, att: .01 }); J.sfx.noise({ type: 'lowpass', freq: 600, Q: 4, peak: .14, dec: .08 }); }
  else { J.sfx.noise({ type: 'lowpass', freq: 900 * v, Q: 1, peak: .18, dec: .03 }); J.sfx.tone({ f: 250 * v, f2: 200, peak: .08, dec: .04 }); }
}

/* ---------- materials ---------- */
const MATS = [
  { id: 'jelly', name: '果冻', shape: () => rrPoly(1.9, 1.62, .5, 7), h: .25, paint: paintJelly,
    side: '#b51d42', sideA: .82, alpha: .93, rim: .6, cutRim: 0,
    bands: [{ col: 'rgba(255,150,170,.35)', r: [[0, .2]] }, { col: 'rgba(90,0,25,.25)', r: [[.72, 1]] }],
    k: 240, c: 5, kick: 2.4, bkick: 1.2, hop: 1.1, push: .55, spin: 1.1, buzz: 12 },
  { id: 'cake', name: '千层蛋糕', shape: () => circPoly(1, 44), h: .3, paint: paintCake,
    side: '#fbefd6', sideA: 1, alpha: 1, rim: .25, cutRim: 0,
    bands: [{ col: '#d99b55', r: [[0, .085], [.165, .225], [.305, .365], [.445, .505], [.585, .645], [.725, .785], [.865, .925]] },
            { col: 'rgba(150,85,30,.35)', r: [[0, .04]] }, { col: 'rgba(0,0,0,.12)', r: [[.9, 1]] }],
    k: 520, c: 26, kick: .9, bkick: .4, hop: 0, push: .42, spin: .7, buzz: 8 },
  { id: 'soap', name: '香皂', shape: () => rrPoly(2.05, 1.32, .55, 8), h: .21, paint: paintSoap,
    side: '#b8a0db', sideA: 1, alpha: 1, rim: .55, cutRim: .55,
    bands: [{ col: 'rgba(255,255,255,.28)', r: [[0, .16]] }, { col: 'rgba(60,30,100,.18)', r: [[.75, 1]] }],
    k: 900, c: 46, kick: .5, bkick: .2, hop: 0, push: .5, spin: .6, buzz: 5 },
  { id: 'tofu', name: '豆腐', shape: () => rrPoly(1.72, 1.72, .12, 3), h: .35, paint: paintTofu,
    side: '#ece3cd', sideA: 1, alpha: 1, rim: .5, cutRim: .25,
    bands: [{ col: 'rgba(255,255,255,.4)', r: [[0, .14]] }, { col: 'rgba(120,95,50,.16)', r: [[.7, 1]] }],
    k: 360, c: 13, kick: 1.5, bkick: .7, hop: .5, push: .45, spin: .8, buzz: 9 }
];

/* ---------- state ---------- */
let cv, ctx, W = 0, H = 0, K = 1;
let bg, bgx, sh, shx, tex, tx, PAT = null, shadowBlur = false;
const L = { cx: 0, cy: 0, R: 100, bw: 0, bh: 0, bx: 0, by: 0, bxN: 1, byN: 1 };
const S = { mat: (+J.store.get('slice-mat', 0) || 0) % MATS.length, pieces: [], cuts: 0, sid: 0, stroke: null, auto: null,
  dirty: true, lastSnd: 0, lastDraw: 0, minA: .004, flashes: [] };
const PX = new Float32Array(MAXV + 8), PY = new Float32Array(MAXV + 8), SS = new Float64Array(MAXV + 8);
const parts = []; for(let i = 0; i < NPART; i++) parts.push({ on: false, k: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0, col: '' });
const puds = [];
const TR = 48, trX = new Float32Array(TR), trY = new Float32Array(TR), trT = new Float64Array(TR); let trN = 0, trI = 0;
let CT0 = 0, CT1 = 1;
const mat = () => MATS[S.mat];

/* ---------- geometry ---------- */
function mkPiece(pts, cut){
  const n = pts.length / 2;
  let a = 0, cx = 0, cy = 0;
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1, xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
    const cr = xi * yj - xj * yi; a += cr; cx += (xi + xj) * cr; cy += (yi + yj) * cr;
  }
  a *= .5; cx /= 6 * a; cy /= 6 * a;
  let r = 0; for(let i = 0; i < n; i++){ const d = Math.hypot(pts[2 * i] - cx, pts[2 * i + 1] - cy); if(d > r) r = d; }
  return { pts, cut, n, area: a, cx, cy, r, x: cx, y: cy, vx: 0, vy: 0, th: 0, w: 0, z: 0, vz: 0,
    a: 0, av: 0, b: 0, bv: 0, phi: 0, wk: 0, es: -1, ex: 0, ey: 0, ps: -1, sleep: false,
    m00: 1, m01: 0, m10: 0, m11: 1, wv: new Float32Array(2 * n) };
}
function splitPoly(pts, cut, px, py, dx, dy){
  const n = pts.length / 2; let pos = 0, neg = 0;
  for(let i = 0; i < n; i++){
    let s = dx * (pts[2 * i + 1] - py) - dy * (pts[2 * i] - px);
    if(Math.abs(s) < 1e-9) s = 1e-9;
    SS[i] = s; s > 0 ? pos++ : neg++;
  }
  if(!pos || !neg) return null;
  const A = [], Ac = [], B = [], Bc = [];
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1, xi = pts[2 * i], yi = pts[2 * i + 1], si = SS[i], sj = SS[j];
    if(si > 0){ A.push(xi, yi); Ac.push(cut[i]); } else { B.push(xi, yi); Bc.push(cut[i]); }
    if((si > 0) !== (sj > 0)){
      const t = si / (si - sj), ix = xi + (pts[2 * j] - xi) * t, iy = yi + (pts[2 * j + 1] - yi) * t;
      if(si > 0){ A.push(ix, iy); Ac.push(1); B.push(ix, iy); Bc.push(cut[i]); }
      else { B.push(ix, iy); Bc.push(1); A.push(ix, iy); Ac.push(cut[i]); }
    }
  }
  return [A, Ac, B, Bc];
}
function updWV(p){
  const ct = Math.cos(p.th), st = Math.sin(p.th);
  let m00 = ct, m01 = -st, m10 = st, m11 = ct;
  const a = p.a, b = p.b;
  if(a || b){
    const cp = Math.cos(p.phi), sp = Math.sin(p.phi), P = 1 + a, Q = 1 - .6 * a, cc = cp * cp, ss = sp * sp, cs = cp * sp, f = 1 + b;
    const s00 = (P * cc + Q * ss) * f, s01 = (P - Q) * cs * f, s11 = (P * ss + Q * cc) * f;
    const n00 = s00 * m00 + s01 * m10, n01 = s00 * m01 + s01 * m11, n10 = s01 * m00 + s11 * m10, n11 = s01 * m01 + s11 * m11;
    m00 = n00; m01 = n01; m10 = n10; m11 = n11;
  }
  p.m00 = m00; p.m01 = m01; p.m10 = m10; p.m11 = m11;
  const pts = p.pts, wv = p.wv;
  for(let i = 0, n = p.n; i < n; i++){
    const dx = pts[2 * i] - p.cx, dy = pts[2 * i + 1] - p.cy;
    wv[2 * i] = p.x + m00 * dx + m01 * dy; wv[2 * i + 1] = p.y + m10 * dx + m11 * dy;
  }
}
function shiftWV(p, dx, dy){ const wv = p.wv; for(let i = 0; i < wv.length; i += 2){ wv[i] += dx; wv[i + 1] += dy; } }
function clipSeg(p, ax, ay, bx, by){
  const pts = p.pts, n = p.n, dx = bx - ax, dy = by - ay; let t0 = 0, t1 = 1;
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1, vx = pts[2 * i], vy = pts[2 * i + 1];
    const nx = pts[2 * j + 1] - vy, ny = vx - pts[2 * j];
    const N = nx * (ax - vx) + ny * (ay - vy), D = nx * dx + ny * dy;
    if(Math.abs(D) < 1e-12){ if(N > 0) return false; continue; }
    const t = -N / D;
    if(D < 0){ if(t > t0) t0 = t; } else if(t < t1) t1 = t;
    if(t0 > t1) return false;
  }
  CT0 = t0; CT1 = t1; return true;
}
function toObj(p, wx, wy, out){
  const c = Math.cos(p.th), s = Math.sin(p.th), rx = wx - p.x, ry = wy - p.y;
  out[0] = p.cx + c * rx + s * ry; out[1] = p.cy - s * rx + c * ry;
}
function toWorld(p, ox, oy, out){
  const c = Math.cos(p.th), s = Math.sin(p.th), dx = ox - p.cx, dy = oy - p.cy;
  out[0] = p.x + c * dx - s * dy; out[1] = p.y + s * dx + c * dy;
}
const O1 = [0, 0], O2 = [0, 0];

/* ---------- particles ---------- */
function part(k, x, y, z, vx, vy, vz, life, s, col){
  let q = null;
  for(let i = 0; i < NPART; i++) if(!parts[i].on){ q = parts[i]; break; }
  if(!q){ let m = 1e9; for(const p of parts) if(p.life < m){ m = p.life; q = p; } }
  q.on = true; q.popped = false; q.k = k; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = q.max = life; q.s = s; q.col = col;
}
function puddle(x, y){
  if(puds.length >= NPUD) puds.shift();
  puds.push({ x, y, r: rnd(.03, .07), life: 7, max: 7 });
}
const FX = {
  jelly(x0, y0, x1, y1, nx, ny){
    for(let i = 0; i < 6; i++){
      const t = Math.random(), sg = Math.random() < .5 ? 1 : -1, sp = rnd(.2, .9);
      part(2, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, .05, nx * sp * sg, ny * sp * sg, rnd(1, 2.4), rnd(1.6, 3), rnd(.012, .026), 'rgba(232,58,88,.9)');
    }
    for(let i = 0; i < 3; i++){ const t = Math.random(); part(3, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, .1, 0, 0, .6, .35, .05, ''); }
  },
  cake(x0, y0, x1, y1, nx, ny){
    const cols = ['#d99b55', '#f8ead0', '#b8742f', '#fff6e4', '#c77e3c'];
    const n = 14 + (Math.random() * 8 | 0);
    for(let i = 0; i < n; i++){
      const t = Math.random(), sg = Math.random() < .5 ? 1 : -1, sp = rnd(.15, 1.1), tw = rnd(-.4, .4);
      part(0, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, .15, (nx * sg + -ny * tw) * sp, (ny * sg + nx * tw) * sp, rnd(.8, 2.6), rnd(5, 9), rnd(.012, .03), cols[i % cols.length]);
    }
  },
  soap(x0, y0, x1, y1){
    const n = 7 + (Math.random() * 6 | 0);
    for(let i = 0; i < n; i++){ const t = Math.random(); part(1, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, .05, rnd(-.12, .12), rnd(-.12, .12), rnd(.25, .7), rnd(1, 2.4), rnd(.012, .035), ''); }
    for(let i = 0; i < 3; i++){ const t = Math.random(); part(3, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, .05, 0, 0, .4, .3, .045, ''); }
  },
  tofu(x0, y0, x1, y1, nx, ny){
    for(let i = 0; i < 7; i++){
      const t = Math.random(), sg = Math.random() < .5 ? 1 : -1, sp = rnd(.15, .7);
      part(2, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, .1, nx * sp * sg, ny * sp * sg, rnd(.6, 1.8), 3, rnd(.012, .022), 'rgba(205,228,245,.85)');
    }
  }
};

/* ---------- layout + static layers ---------- */
function layout(){
  const top = 44, bot = 28, availH = Math.max(140, H - top - bot), portrait = H > W * 1.15;
  L.bw = Math.min(W - 28, 880);
  L.bh = Math.min(availH, L.bw * (portrait ? 1.22 : .7));
  if(!portrait) L.bw = Math.min(L.bw, L.bh / .6);
  L.cx = W / 2; L.cy = top + availH / 2 - 4;
  L.bx = L.cx - L.bw / 2; L.by = L.cy - L.bh / 2;
  L.R = Math.max(30, Math.min(L.bw * .29, L.bh * .27, 165));
  L.bxN = (L.bw / 2 - 18) / L.R; L.byN = (L.bh / 2 - 16) / L.R;
}
function renderBg(){
  bg.width = Math.ceil(W * K); bg.height = Math.ceil(H * K);
  const c = bgx; c.setTransform(K, 0, 0, K, 0, 0);
  c.fillStyle = J.C.panel; c.fillRect(0, 0, W, H);
  const lg = c.createRadialGradient(L.cx, L.cy - L.bh * .3, 10, L.cx, L.cy, Math.max(W, H) * .75);
  lg.addColorStop(0, 'rgba(242,181,107,.17)'); lg.addColorStop(.5, 'rgba(242,181,107,.05)'); lg.addColorStop(1, 'rgba(242,181,107,0)');
  c.fillStyle = lg; c.fillRect(0, 0, W, H);
  const { bx, by, bw, bh } = L, rad = Math.min(26, bw * .05), th = Math.max(7, Math.min(12, bh * .02));
  c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 36; c.shadowOffsetY = 18;
  rrPath(c, bx, by + th, bw, bh, rad); c.fillStyle = '#3b2412'; c.fill(); c.restore();
  const eg = c.createLinearGradient(0, by + bh - rad, 0, by + bh + th);
  eg.addColorStop(0, '#7a4c27'); eg.addColorStop(1, '#4a2c15');
  rrPath(c, bx, by + th, bw, bh, rad); c.fillStyle = eg; c.fill();
  const wg = c.createLinearGradient(bx, by, bx + bw * .3, by + bh);
  wg.addColorStop(0, '#be8650'); wg.addColorStop(1, '#9c6538');
  rrPath(c, bx, by, bw, bh, rad); c.fillStyle = wg; c.fill();
  c.save(); rrPath(c, bx, by, bw, bh, rad); c.clip();
  const r = rng(21);
  for(let i = 0; i < 70; i++){
    const y0 = by + r() * bh, amp = 2 + r() * 6, f = .004 + r() * .01, ph = r() * TAU;
    c.strokeStyle = `rgba(${r() < .7 ? '92,52,22' : '235,190,140'},${.05 + r() * .1})`; c.lineWidth = .6 + r() * 1.8;
    c.beginPath();
    for(let x = bx - 10; x <= bx + bw + 10; x += 14){ const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * .3; x === bx - 10 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
  }
  for(let i = 0; i < 2; i++){
    const kx = bx + bw * (.15 + r() * .7), ky = by + bh * (.15 + r() * .7);
    for(let k = 5; k > 0; k--){ c.strokeStyle = `rgba(85,45,18,${.05 + k * .02})`; c.lineWidth = 1; c.beginPath(); c.ellipse(kx, ky, k * 5, k * 2, .05, 0, TAU); c.stroke(); }
  }
  c.strokeStyle = 'rgba(255,230,195,.07)'; c.lineWidth = .8;
  for(let i = 0; i < 26; i++){
    const x = bx + r() * bw, y = by + r() * bh, a = r() * TAU, l = 14 + r() * 60;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  const sp = c.createRadialGradient(L.cx - bw * .12, by + bh * .25, 10, L.cx, L.cy, bw * .75);
  sp.addColorStop(0, 'rgba(255,214,160,.16)'); sp.addColorStop(1, 'rgba(255,214,160,0)');
  c.fillStyle = sp; c.fillRect(bx, by, bw, bh);
  c.restore();
  const gi = Math.min(16, bw * .04);
  rrPath(c, bx + gi, by + gi, bw - gi * 2, bh - gi * 2, Math.max(6, rad - gi * .6));
  c.lineWidth = 3.2; c.strokeStyle = 'rgba(70,38,14,.3)'; c.stroke();
  c.save(); c.translate(0, 1.6); c.lineWidth = 1; c.strokeStyle = 'rgba(255,225,185,.14)'; c.stroke(); c.restore();
  rrPath(c, bx + .5, by + .5, bw - 1, bh - 1, rad); c.lineWidth = 1; c.strokeStyle = 'rgba(255,220,170,.22)'; c.stroke();
  c.font = `${Math.round(Math.max(12, Math.min(15, bw * .022)))}px ${FONT}`; c.textBaseline = 'alphabetic'; c.textAlign = 'right';
  const lx = bx + bw - gi - 10, ly = by + bh - gi - 9;
  c.fillStyle = 'rgba(255,225,185,.16)'; c.fillText(mat().name, lx, ly + 1);
  c.fillStyle = 'rgba(70,36,12,.5)'; c.fillText(mat().name, lx, ly);
}
function buildTex(){
  const m = mat(), pts = m.shapePts;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for(let i = 0; i < pts.length; i += 2){ x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  x0 -= .04; y0 -= .04; x1 += .04; y1 += .04;
  const sc = L.R * K;
  tex.width = Math.max(2, Math.ceil((x1 - x0) * sc)); tex.height = Math.max(2, Math.ceil((y1 - y0) * sc));
  tx.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc);
  tx.clearRect(x0, y0, x1 - x0, y1 - y0);
  m.paint(tx, { x0, y0, x1, y1 });
  PAT = ctx.createPattern(tex, 'no-repeat');
  try{ PAT.setTransform(new DOMMatrix([1 / sc, 0, 0, 1 / sc, x0, y0])); }catch(e){}
}
function fresh(drop){
  const m = mat();
  if(!m.shapePts) m.shapePts = m.shape();
  const cut = new Array(m.shapePts.length / 2).fill(0);
  const p = mkPiece(m.shapePts.slice(), cut);
  p.x = p.cx; p.y = p.cy - m.h * .45;
  p.wk = .5;
  if(drop){ p.z = 1.5; p.vz = 0; p.b = -.04; p.wk = 1.5; }
  updWV(p);
  S.auto = null; S.sid++; if(S.stroke) S.stroke.cut = false;
  S.pieces = [p]; S.cuts = 0; S.flashes.length = 0; puds.length = 0;
  for(const q of parts) q.on = false;
  S.minA = Math.max(.0035, mkPiece(m.shapePts, cut).area / 700);
  S.dirty = true; J.stat();
}

/* ---------- cutting ---------- */
function cutPiece(idx, ox, oy, dx, dy, now){
  const p = S.pieces[idx], m = mat();
  if(S.pieces.length >= MAXP || p.area < S.minA * 2) return false;
  const r = splitPoly(p.pts, p.cut, ox, oy, dx, dy);
  if(!r || r[0].length / 2 > MAXV || r[2].length / 2 > MAXV) return false;
  const A = mkPiece(r[0], r[1]), B = mkPiece(r[2], r[3]);
  if(!(A.area >= S.minA) || !(B.area >= S.minA)) return false;
  const c = Math.cos(p.th), s = Math.sin(p.th), l = Math.hypot(dx, dy), onx = -dy / l, ony = dx / l;
  const wnx = c * onx - s * ony, wny = s * onx + c * ony;
  const kid = (Q, sg) => {
    const ddx = Q.cx - p.cx, ddy = Q.cy - p.cy;
    Q.x = p.x + c * ddx - s * ddy; Q.y = p.y + s * ddx + c * ddy; Q.th = p.th; Q.z = p.z; Q.vz = p.vz;
    const push = m.push * rnd(.85, 1.15);
    Q.vx = p.vx + wnx * push * sg; Q.vy = p.vy + wny * push * sg;
    Q.w = p.w + rnd(-.5, .5) * m.spin * (.6 + .25 / Math.max(.15, Math.sqrt(Q.area)));
    Q.phi = Math.atan2(wny, wnx); Q.a = p.a * .5; Q.av = m.kick * rnd(.8, 1.2);
    Q.b = p.b; Q.bv = p.bv + m.bkick * rnd(.7, 1.1);
    if(m.hop) Q.vz = Math.max(Q.vz, m.hop * rnd(.5, 1) * Math.min(1, .35 / Math.sqrt(Q.area)));
    Q.ps = S.sid; Q.es = -1; Q.wk = 1.2;
    updWV(Q);
  };
  kid(A, 1); kid(B, -1);
  S.pieces[idx] = A; S.pieces.push(B);
  toWorld(p, ox, oy, O1); toWorld(p, ox + dx, oy + dy, O2);
  const sid = S.sid;
  for(const q of S.pieces){
    if(q === A || q === B || q.ps === sid) continue;
    const d = (q.x - O1[0]) * wnx + (q.y - O1[1]) * wny, ad = Math.abs(d);
    if(ad > 1.1) continue;
    const f = m.push * .45 * (1 - ad / 1.1) * (d > 0 ? 1 : -1);
    q.vx += wnx * f; q.vy += wny * f; q.ps = sid; q.sleep = false; q.wk = Math.max(q.wk, .9);
    if(m.id === 'jelly'){ q.bv += .5 * (1 - ad / 1.1); }
  }
  S.flashes.push({ x0: O1[0], y0: O1[1], x1: O2[0], y1: O2[1], t: now });
  if(S.flashes.length > 24) S.flashes.shift();
  FX[m.id](O1[0], O1[1], O2[0], O2[1], wnx, wny);
  if(now - S.lastSnd > 45){
    S.lastSnd = now;
    SND[m.id](rnd(.9, 1.12) * (1 + Math.max(0, .3 - Math.sqrt(p.area)) * .8), .75 + Math.min(.25, Math.sqrt(p.area) * .2));
    J.buzz(m.buzz);
  }
  S.dirty = true; S.stroke && (S.stroke.cut = true); S.auto && (S.auto.cut = true);
  J.stat();
  return true;
}
function bladeSeg(ax, ay, bx, by, now){
  const sid = S.sid, cnt = S.pieces.length, sdx = bx - ax, sdy = by - ay, sl2 = sdx * sdx + sdy * sdy + 1e-12;
  for(let i = 0; i < cnt; i++){
    const p = S.pieces[i];
    let t = ((p.x - ax) * sdx + (p.y - ay) * sdy) / sl2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + sdx * t - p.x, qy = ay + sdy * t - p.y, rr = p.r * 1.25 + .02;
    if(qx * qx + qy * qy > rr * rr && p.es !== sid) continue;
    toObj(p, ax, ay, O1); toObj(p, bx, by, O2);
    if(!clipSeg(p, O1[0], O1[1], O2[0], O2[1])) continue;
    const ddx = O2[0] - O1[0], ddy = O2[1] - O1[1];
    if(p.es !== sid){ p.es = sid; p.ex = O1[0] + ddx * CT0; p.ey = O1[1] + ddy * CT0; }
    if(CT1 < 1){
      const ex = O1[0] + ddx * CT1, ey = O1[1] + ddy * CT1, cx = ex - p.ex, cy = ey - p.ey;
      p.es = -1;
      if(cx * cx + cy * cy > p.r * p.r * .09) cutPiece(i, p.ex, p.ey, cx, cy, now);
    }
  }
}
function bladeEnd(wx, wy, now){
  const sid = S.sid, cnt = S.pieces.length;
  for(let i = 0; i < cnt; i++){
    const p = S.pieces[i];
    if(p.es !== sid) continue;
    p.es = -1;
    toObj(p, wx, wy, O1);
    const cx = O1[0] - p.ex, cy = O1[1] - p.ey;
    if(cx * cx + cy * cy > p.r * p.r * .3) cutPiece(i, p.ex, p.ey, cx, cy, now);
  }
}
function trail(x, y, now){ trX[trI] = x; trY[trI] = y; trT[trI] = now; trI = (trI + 1) % TR; if(trN < TR) trN++; }
const nx = x => (x - L.cx) / L.R, ny = y => (y - L.cy) / L.R;

function randomCut(now){
  let sx = 0, sy = 0, sa = 0;
  for(const p of S.pieces){ sx += p.x * p.area; sy += p.y * p.area; sa += p.area; }
  sx /= sa || 1; sy /= sa || 1;
  const a = Math.random() * Math.PI, ox = sx + rnd(-.25, .25), oy = sy + rnd(-.25, .25), ex = Math.cos(a), ey = Math.sin(a), d = L.bxN + L.byN;
  const s = Math.random() < .5 ? 1 : -1;
  if(S.stroke) return;
  if(S.auto){ S.auto.t0 = -1e9; runAuto(now); }
  S.sid++;
  S.auto = { x0: ox - ex * d * s, y0: oy - ey * d * s, x1: ox + ex * d * s, y1: oy + ey * d * s, t0: now, last: 0, cut: false };
  sndSwish();
}
function runAuto(now){
  const A = S.auto, k = Math.min(1, (now - A.t0) / 170);
  const steps = 4;
  for(let s = 1; s <= steps; s++){
    const k0 = A.last + (k - A.last) * (s - 1) / steps, k1 = A.last + (k - A.last) * s / steps;
    const ax = A.x0 + (A.x1 - A.x0) * k0, ay = A.y0 + (A.y1 - A.y0) * k0, bx = A.x0 + (A.x1 - A.x0) * k1, by = A.y0 + (A.y1 - A.y0) * k1;
    bladeSeg(ax, ay, bx, by, now);
    trail(L.cx + bx * L.R, L.cy + by * L.R, now);
  }
  A.last = k;
  if(k >= 1){ bladeEnd(A.x1, A.y1, now); if(A.cut){ S.cuts++; J.stat(); } S.auto = null; }
  S.dirty = true;
}

/* ---------- physics ---------- */
let satD = 0, satX = 0, satY = 0;
function satAxes(A, B){
  const a = A.wv, b = B.wv, n = A.n, m = B.n;
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1;
    let nx = a[2 * j + 1] - a[2 * i + 1], ny = a[2 * i] - a[2 * j];
    const l = Math.hypot(nx, ny); if(l < 1e-9) continue; nx /= l; ny /= l;
    const amax = nx * a[2 * i] + ny * a[2 * i + 1];
    let amin = 1e9; for(let k = 0; k < n; k++){ const d = nx * a[2 * k] + ny * a[2 * k + 1]; if(d < amin) amin = d; }
    let bmin = 1e9, bmax = -1e9; for(let k = 0; k < m; k++){ const d = nx * b[2 * k] + ny * b[2 * k + 1]; if(d < bmin) bmin = d; if(d > bmax) bmax = d; }
    const o = Math.min(amax - bmin, bmax - amin);
    if(o <= 0) return false;
    if(o < satD){ satD = o; satX = nx; satY = ny; }
  }
  return true;
}
function step(dt, now){
  const m = mat(), ps = S.pieces;
  let moving = false;
  const fr = Math.exp(-dt * 5), fw = Math.exp(-dt * 4.5);
  for(const p of ps){
    if(p.sleep) continue;
    if(p.z > 0 || p.vz > 0){
      p.vz -= 14 * dt; p.z += p.vz * dt;
      if(p.z <= 0){
        p.z = 0;
        if(p.vz < -1.2){ const sp = -p.vz; p.bv += sp * .55 * (m.id === 'jelly' ? 1 : .45); if(sp > 2.5 && now - S.lastSnd > 60){ S.lastSnd = now; sndLand(m, Math.min(1, sp / 5)); J.buzz(6); } p.vz = sp * (m.id === 'jelly' ? .28 : .14); if(p.vz < .4) p.vz = 0; }
        else p.vz = 0;
      }
    }
    p.vx *= fr; p.vy *= fr; p.w *= fw;
    p.x += p.vx * dt; p.y += p.vy * dt; p.th += p.w * dt;
    p.av += (-m.k * p.a - m.c * p.av) * dt; p.a += p.av * dt;
    p.bv += (-m.k * p.b - m.c * p.bv) * dt; p.b += p.bv * dt;
    const act = Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(p.w) * .3 + Math.abs(p.a) * 3 + Math.abs(p.av) * .05 + Math.abs(p.b) * 3 + Math.abs(p.bv) * .05 + p.z + Math.abs(p.vz);
    p.wk -= dt;
    if(act < 2.5e-3 && p.wk <= 0){ p.vx = p.vy = p.w = p.a = p.av = p.b = p.bv = p.vz = 0; p.z = 0; p.sleep = true; }
    updWV(p); moving = true;
  }
  {
    const n = ps.length;
    for(let i = 0; i < n; i++){
      const A = ps[i];
      for(let j = i + 1; j < n; j++){
        const B = ps[j];
        if(A.sleep && B.sleep) continue;
        const dx = B.x - A.x, dy = B.y - A.y, rr = A.r + B.r;
        if(dx * dx + dy * dy > rr * rr) continue;
        satD = 1e9;
        if(!satAxes(A, B) || !satAxes(B, A)) continue;
        if(satD < .004) continue;
        if(satX * dx + satY * dy < 0){ satX = -satX; satY = -satY; }
        const tot = A.area + B.area, ka = B.area / tot, kb = A.area / tot, c = Math.min(satD, .05) * .35;
        A.x -= satX * c * ka; A.y -= satY * c * ka; shiftWV(A, -satX * c * ka, -satY * c * ka);
        B.x += satX * c * kb; B.y += satY * c * kb; shiftWV(B, satX * c * kb, satY * c * kb);
        A.vx *= .97; A.vy *= .97; B.vx *= .97; B.vy *= .97;
        if(A.sleep || B.sleep){ A.sleep = B.sleep = false; A.wk = Math.max(A.wk, .25); B.wk = Math.max(B.wk, .25); }
      }
    }
  }
  const bxN = L.bxN, byN = L.byN, hb = m.h;
  for(const p of ps){
    if(p.sleep) continue;
    const wv = p.wv; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for(let i = 0; i < wv.length; i += 2){ const x = wv[i], y = wv[i + 1]; if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
    let dx = 0, dy = 0;
    if(x0 < -bxN) dx = -bxN - x0; else if(x1 > bxN) dx = bxN - x1;
    if(y0 < -byN) dy = -byN - y0; else if(y1 + hb > byN) dy = byN - y1 - hb;
    if(dx || dy){
      const k = .3; p.x += dx * k; p.y += dy * k; shiftWV(p, dx * k, dy * k);
      if(dx * p.vx < 0) p.vx *= -.2; if(dy * p.vy < 0) p.vy *= -.2;
      moving = true;
    }
  }
  // particles
  let pa = false, slow = false;
  for(const q of parts){
    if(!q.on) continue;
    q.life -= dt;
    if(q.life <= 0){ q.on = false; continue; }
    if(q.k === 0 || q.k === 2){
      if(q.z > 0 || q.vz > 0){
        q.vz -= 12 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; pa = true;
        if(q.z <= 0){
          q.z = 0;
          if(q.k === 2){ if(m.id === 'tofu'){ puddle(q.x, q.y); q.on = false; } else { q.k = 4; q.life = Math.min(q.life, 2.5); q.max = 2.5; } }
          else { q.vz = -q.vz * .3; q.vx *= .45; q.vy *= .45; if(q.vz < .25) q.vz = 0; }
        }
      } else if(Math.abs(q.vx) + Math.abs(q.vy) > 1e-3){ const f = Math.exp(-dt * 9); q.vx *= f; q.vy *= f; q.x += q.vx * dt; q.y += q.vy * dt; pa = true; }
      else slow = true;
    } else if(q.k === 1){ q.z += q.vz * dt; q.vz *= Math.exp(-dt * .6); q.x += q.vx * dt; q.y += q.vy * dt; q.vx += Math.sin(q.life * 7 + q.s * 300) * dt * .2; pa = true;
      if(q.life < .06 && !q.popped){ q.popped = true; if(Math.random() < .35) J.sfx.tone({ f: rnd(1800, 2800), f2: rnd(2800, 3600), peak: .03, dec: .02 }); }
    } else if(q.k === 3) pa = true;
    else slow = true;
    if(q.life < 1) slow = true;
  }
  for(let i = puds.length - 1; i >= 0; i--){ puds[i].life -= dt; if(puds[i].life <= 0) puds.splice(i, 1); else slow = true; }
  return { fast: moving || pa || slow, slow };
}

/* ---------- drawing ---------- */
function quad(c, ax, ay, bx, by, h, t0, t1){
  const y0 = t0 * h - (t0 === 0 ? .7 : 0), y1 = t1 * h;
  c.moveTo(ax, ay + y0); c.lineTo(bx, by + y0); c.lineTo(bx, by + y1); c.lineTo(ax, ay + y1); c.closePath();
}
function drawPiece(p, m){
  const n = p.n, wv = p.wv, R = L.R, cx = L.cx, cy = L.cy, zo = p.z;
  for(let i = 0; i < n; i++){ PX[i] = cx + R * wv[2 * i]; PY[i] = cy + R * (wv[2 * i + 1] - zo); }
  const hp = Math.max(1, m.h * R * (1 - 2.2 * p.b));
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.beginPath();
  for(let i = 0; i < n; i++){ const j = i + 1 === n ? 0 : i + 1; if(PX[j] - PX[i] < -1e-4) quad(ctx, PX[i], PY[i], PX[j], PY[j], hp, 0, 1); }
  ctx.globalAlpha = m.sideA; ctx.fillStyle = m.side; ctx.fill();
  for(const g of m.bands){
    ctx.beginPath();
    for(let i = 0; i < n; i++){
      const j = i + 1 === n ? 0 : i + 1;
      if(PX[j] - PX[i] < -1e-4) for(const r of g.r) quad(ctx, PX[i], PY[i], PX[j], PY[j], hp, r[0], r[1]);
    }
    ctx.fillStyle = g.col; ctx.fill();
  }
  ctx.beginPath(); let any = false;
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1, ex = PX[j] - PX[i], ey = PY[j] - PY[i];
    if(ex < -1e-4 && ey > .3 * Math.hypot(ex, ey)){ quad(ctx, PX[i], PY[i], PX[j], PY[j], hp, 0, 1); any = true; }
  }
  if(any){ ctx.fillStyle = 'rgba(30,10,0,.2)'; ctx.fill(); }
  ctx.globalAlpha = m.alpha;
  const a = K * R;
  ctx.setTransform(a * p.m00, a * p.m10, a * p.m01, a * p.m11,
    K * (cx + R * (p.x - p.m00 * p.cx - p.m01 * p.cy)), K * (cy + R * (p.y - zo - p.m10 * p.cx - p.m11 * p.cy)));
  const pts = p.pts;
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for(let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath();
  ctx.fillStyle = PAT || '#ccc'; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.beginPath(); any = false;
  for(let i = 0; i < n; i++){
    const j = i + 1 === n ? 0 : i + 1, ex = PX[j] - PX[i], ey = PY[j] - PY[i], l = Math.hypot(ex, ey) + 1e-9;
    if(ex / l > .25 || -ey / l > .7){ ctx.moveTo(PX[i], PY[i]); ctx.lineTo(PX[j], PY[j]); any = true; }
  }
  if(any){ ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(255,248,235,${m.rim})`; ctx.stroke(); }
  if(m.cutRim){
    ctx.beginPath(); any = false;
    for(let i = 0; i < n; i++) if(p.cut[i]){ const j = i + 1 === n ? 0 : i + 1; ctx.moveTo(PX[i], PY[i]); ctx.lineTo(PX[j], PY[j]); any = true; }
    if(any){ ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${m.cutRim})`; ctx.stroke(); }
  }
}
function drawParts(ground){
  const R = L.R, cx = L.cx, cy = L.cy;
  for(const q of parts){
    if(!q.on) continue;
    const g = q.z <= 0 && (q.k === 0 || q.k === 4);
    if(g !== ground) continue;
    const al = Math.min(1, q.life / Math.min(.6, q.max * .3)), x = cx + R * q.x, y = cy + R * (q.y - q.z), s = Math.max(1, q.s * R);
    ctx.globalAlpha = al;
    if(q.k === 0){ ctx.fillStyle = q.col; ctx.fillRect(x - s / 2, y - s / 2, s, s * .8); }
    else if(q.k === 2 || q.k === 4){
      ctx.fillStyle = q.col; ctx.beginPath();
      if(q.k === 4) ctx.ellipse(x, y, s * 1.2, s * .75, 0, 0, TAU); else ctx.arc(x, y, s * .6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(x - s * .2, y - s * .22, s * .2, 0, TAU); ctx.fill();
    } else if(q.k === 1){
      const pop = q.life < .08, rr = s * (pop ? 1.6 : 1);
      ctx.globalAlpha = pop ? q.life / .08 : Math.min(1, (q.max - q.life) * 6) * .9;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU);
      ctx.fillStyle = 'rgba(240,230,255,.12)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - rr * .35, y - rr * .35, rr * .22, 0, TAU); ctx.fill();
    } else if(q.k === 3){
      const k = q.life / q.max, r = s * (1.3 - k * .5);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
      ctx.strokeStyle = 'rgba(255,240,220,.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
}
function draw(now){
  const m = mat(), R = L.R, cx = L.cx, cy = L.cy;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  ctx.setTransform(K, 0, 0, K, 0, 0);
  for(const u of puds){
    const k = Math.min(1, u.life / 2), g = Math.min(1, (u.max - u.life) * 4), x = cx + R * u.x, y = cy + R * u.y, r = R * u.r * (.6 + .4 * g);
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(70,40,20,.22)'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,220,.22)'; ctx.beginPath(); ctx.ellipse(x - r * .4, y - r * .3, r * .5, r * .22, -.3, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawParts(true);
  const ps = S.pieces;
  for(let i = 1; i < ps.length; i++){ const p = ps[i]; let j = i - 1; while(j >= 0 && ps[j].y > p.y){ ps[j + 1] = ps[j]; j--; } ps[j + 1] = p; }
  // soft shadows
  shx.setTransform(1, 0, 0, 1, 0, 0); shx.clearRect(0, 0, sh.width, sh.height);
  const q = sh.width / W; shx.setTransform(q, 0, 0, q, 0, 0);
  const hp = m.h * R, ox = hp * .22 + 3, oy = hp + 2;
  shx.beginPath();
  for(const p of ps){
    const wv = p.wv, ex = 1 + p.b;
    for(let i = 0; i < p.n; i++){
      const x = cx + R * (p.x + (wv[2 * i] - p.x) * 1.04 * ex) + ox, y = cy + R * (p.y + (wv[2 * i + 1] - p.y) * 1.04 * ex) + oy;
      i ? shx.lineTo(x, y) : shx.moveTo(x, y);
    }
    shx.closePath();
  }
  shx.fillStyle = 'rgba(25,8,0,1)'; shx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = .42;
  ctx.drawImage(sh, 0, 0, sh.width, sh.height, 0, 0, W * K, H * K);
  ctx.globalAlpha = 1;
  for(const p of ps) drawPiece(p, m);
  ctx.setTransform(K, 0, 0, K, 0, 0);
  drawParts(false);
  // cut flashes
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for(let i = S.flashes.length - 1; i >= 0; i--){
    const f = S.flashes[i], k = 1 - (now - f.t) / 260;
    if(k <= 0){ S.flashes.splice(i, 1); continue; }
    ctx.strokeStyle = `rgba(255,236,200,${k * .9})`; ctx.lineWidth = 1 + 3 * k;
    ctx.beginPath(); ctx.moveTo(cx + R * f.x0, cy + R * f.y0); ctx.lineTo(cx + R * f.x1, cy + R * f.y1); ctx.stroke();
  }
  // blade trail
  if(trN > 1){
    const life = 170;
    for(let pass = 0; pass < 2; pass++){
      for(let s = 1; s < trN; s++){
        const i1 = (trI - s + TR) % TR, i0 = (trI - s - 1 + TR) % TR;
        const age = now - trT[i1]; if(age > life) break;
        if(trT[i1] - trT[i0] > 80) continue;
        const k = 1 - age / life;
        ctx.beginPath(); ctx.moveTo(trX[i0], trY[i0]); ctx.lineTo(trX[i1], trY[i1]);
        if(pass === 0){ ctx.strokeStyle = `rgba(242,181,107,${k * .22})`; ctx.lineWidth = 3 + 11 * k; }
        else { ctx.strokeStyle = `rgba(255,250,240,${k * .95})`; ctx.lineWidth = .8 + 2.6 * k; }
        ctx.stroke();
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- input ---------- */
function down(e){
  if(S.stroke) return;
  e.preventDefault(); J.ac();
  try{ cv.cv.setPointerCapture(e.pointerId); }catch(err){}
  const [x, y] = J.local(e, cv.cv), now = performance.now();
  S.sid++;
  S.stroke = { id: e.pointerId, lx: x, ly: y, sx: x, sy: y, t0: now, lt: now, travel: 0, swish: false, cut: false };
  trail(x, y, now); S.dirty = true;
}
function move(e){
  const st = S.stroke; if(!st || e.pointerId !== st.id) return;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null, now = performance.now();
  const evs = list && list.length ? list : [e];
  for(const ev of evs){
    const [x, y] = J.local(ev, cv.cv), d = Math.hypot(x - st.lx, y - st.ly);
    if(d < .5) continue;
    const dtm = Math.max(1, now - st.lt);
    if(!st.swish && st.travel > 30 && d / dtm > .9){ st.swish = true; sndSwish(); }
    bladeSeg(nx(st.lx), ny(st.ly), nx(x), ny(y), now);
    st.travel += d; st.lx = x; st.ly = y;
    trail(x, y, now);
  }
  st.lt = now; S.dirty = true;
}
function up(e){
  const st = S.stroke; if(!st || e.pointerId !== st.id) return;
  const now = performance.now();
  bladeEnd(nx(st.lx), ny(st.ly), now);
  if(st.travel < 8 && now - st.t0 < 400) poke(nx(st.sx), ny(st.sy));
  if(st.cut){ S.cuts++; J.stat(); }
  S.stroke = null; S.dirty = true;
}
function poke(wx, wy){
  const m = mat();
  for(let i = S.pieces.length - 1; i >= 0; i--){
    const p = S.pieces[i];
    toObj(p, wx, wy, O1);
    if(!clipSeg(p, O1[0], O1[1], O1[0] + 1e-6, O1[1])) continue;
    p.bv += m.bkick * 1.6 + .6; p.phi = Math.random() * Math.PI; p.av += m.kick * .6;
    if(m.hop) p.vz = Math.max(p.vz, m.hop * .5);
    p.sleep = false; sndPoke(m); J.buzz(5); S.dirty = true;
    p.wk = Math.max(p.wk, .4);
    if(m.id === 'jelly') for(const q of S.pieces){ if(q !== p){ q.bv += .35; q.sleep = false; } }
    return;
  }
}

J.register({
  id: 'slice', name: '切切乐', hint: '按住划一刀，把它切开',
  create(root){
    cv = J.canvas(root, { dprMax: 2 }); ctx = cv.ctx;
    bg = document.createElement('canvas'); bgx = bg.getContext('2d');
    sh = document.createElement('canvas'); shx = sh.getContext('2d');
    tex = document.createElement('canvas'); tx = tex.getContext('2d');
    shadowBlur = 'filter' in shx;
    const el = cv.cv;
    el.style.cursor = 'crosshair';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    MATS.forEach(m => { m.shapePts = m.shape(); });
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if(W){ buildTex(); renderBg(); S.dirty = true; } });
  },
  resize(w, h){
    cv.fit(w, h); W = w; H = h; K = cv.k;
    layout(); renderBg(); buildTex();
    sh.width = Math.max(2, Math.ceil(W / 3)); sh.height = Math.max(2, Math.ceil(H / 3));
    if(shadowBlur) shx.filter = 'blur(2px)';
    if(!S.pieces.length) fresh(false);
    for(const p of S.pieces){ p.sleep = false; p.wk = Math.max(p.wk, .3); updWV(p); }
    S.dirty = true;
  },
  enter(){ S.dirty = true; },
  tick(now, dt){
    if(!W) return;
    if(S.auto) runAuto(now);
    let left = dt / 1000;
    let r = { fast: false, slow: false };
    while(left > 1e-6){ const d = Math.min(left, 1 / 60); const q = step(d, now); r.fast = r.fast || q.fast; r.slow = r.slow || q.slow; left -= d; }
    const busy = r.fast || S.flashes.length || (trN && now - trT[(trI - 1 + TR) % TR] < 200);
    if(busy || S.dirty || (r.slow && now - S.lastDraw > 90)){ draw(now); S.dirty = false; S.lastDraw = now; }
  },
  key(e){
    if(e.code === 'Space'){ if(!e.repeat || !S.auto) randomCut(performance.now()); return true; }
  },
  actions: [
    { label: '换一块', run(){ S.mat = (S.mat + 1) % MATS.length; J.store.set('slice-mat', S.mat); if(W){ renderBg(); buildTex(); } fresh(true); } }
  ],
  stat: () => `切了 <b>${S.cuts}</b> 刀 · 现在 <b>${S.pieces.length}</b> 块`
});
})();

