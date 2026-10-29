// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== slime ===== */
/* 捏史莱姆 — a glossy soft-body slime.
   Physics: ring of perimeter particles, edge + bending springs, an area-pressure term that keeps the volume,
   and a weak, well-damped shape-matching pull toward the rest shape (the lazy rebound). Semi-implicit Euler, 5 substeps.
   Glitter, bubbles and dimples live in "fan" coordinates (segment i, t along it, s from the centre), so they ride the deformation. */
(() => {
const TAU = Math.PI * 2, N = 60, SUB = 5;
const LX = -0.6, LY = -0.8;                       // light comes from the upper left
const PAL = [
  { name: '薄荷', light: [200, 248, 228], base: [78, 194, 160], deep: [30, 116, 100], rim: [10, 56, 52], glow: [178, 255, 226] },
  { name: '葡萄', light: [222, 202, 255], base: [140, 100, 210], deep: [72, 44, 140], rim: [34, 18, 78], glow: [222, 196, 255] },
  { name: '桃子', light: [255, 226, 208], base: [247, 156, 130], deep: [192, 88, 80], rim: [104, 38, 44], glow: [255, 214, 184] },
  { name: '柠檬', light: [255, 248, 200], base: [240, 208, 96], deep: [178, 138, 36], rim: [98, 70, 14], glow: [255, 242, 176] },
  { name: '银河', light: [126, 98, 206], base: [50, 30, 98], deep: [22, 11, 52], rim: [8, 4, 22], glow: [150, 168, 255], galaxy: 1 }
];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = {
  n: +J.store.get('slime-n', 0),
  ci: Math.min(PAL.length - 1, Math.max(0, +J.store.get('slime-color', 0) || 0)),
  pi: 0, mix: 1,            // previous colour index + cross-fade progress
  time: 0, lastCreak: 0, lastPop: 0, energy: 0, energyPrev: 0
};
S.pi = S.ci;

let cv, ctx, W = 0, H = 0, k = 1, R = 100, hx = 0, hy = 0, inited = false;
let layer, lctx, bgc, bgx, spW, spK, spStar;
const px = new Float64Array(N), py = new Float64Array(N), vx = new Float64Array(N), vy = new Float64Array(N);
const ax = new Float64Array(N), ay = new Float64Array(N), qx = new Float64Array(N), qy = new Float64Array(N);
const L0 = new Float64Array(N), B0 = new Float64Array(N), LPx = new Float64Array(N), LPy = new Float64Array(N);
const thick = new Float64Array(N), opp = new Int16Array(N), nx = new Float64Array(N), ny = new Float64Array(N);
let A0 = 1, edge0 = 1;
const grabs = new Map();
const dimples = [];
const glitter = [], bubbles = [];
let cx = 0, cy = 0, hubX = 0, hubY = 0;

/* ---------- helpers ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + clamp(a, 0, 1).toFixed(3) + ')';
function sprite(r, g, b, soft){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  const col = a => `rgba(${r},${g},${b},${a})`;
  if(soft){ gr.addColorStop(0, col(1)); gr.addColorStop(.35, col(.75)); gr.addColorStop(.7, col(.25)); gr.addColorStop(1, col(0)); }
  else { gr.addColorStop(0, col(1)); gr.addColorStop(.55, col(.9)); gr.addColorStop(.8, col(.35)); gr.addColorStop(1, col(0)); }
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return c;
}
function starSprite(){
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,250,235,.85)'); g.addColorStop(.45, 'rgba(255,240,220,.15)'); g.addColorStop(1, 'rgba(255,240,220,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.fillRect(15, 3, 2, 26); x.fillRect(3, 15, 26, 2);
  return c;
}

/* rest shape: a slightly irregular, slightly squat blob */
function restShape(){
  for(let i = 0; i < N; i++){
    const a = i / N * TAU;
    const r = R * (1 + .035 * Math.sin(2 * a + .6) + .025 * Math.sin(3 * a + 1.9) + .012 * Math.sin(5 * a + .3));
    qx[i] = Math.cos(a) * r * 1.07; qy[i] = Math.sin(a) * r * .94;
  }
  let mx = 0, my = 0;
  for(let i = 0; i < N; i++){ mx += qx[i]; my += qy[i]; }
  mx /= N; my /= N;
  for(let i = 0; i < N; i++){ qx[i] -= mx; qy[i] -= my; }
  A0 = 0;
  for(let i = 0; i < N; i++){
    const j = (i + 1) % N, j2 = (i + 2) % N;
    A0 += qx[i] * qy[j] - qx[j] * qy[i];
    L0[i] = Math.hypot(qx[j] - qx[i], qy[j] - qy[i]);
    B0[i] = Math.hypot(qx[j2] - qx[i], qy[j2] - qy[i]);
  }
  A0 *= .5;
  for(let i = 0; i < N; i++){ const a = (i + N - 1) % N, b = (i + 1) % N; LPx[i] = (qx[a] + qx[b]) * .5 - qx[i]; LPy[i] = (qy[a] + qy[b]) * .5 - qy[i]; }
  edge0 = TAU * R / N;
}
function placeAtRest(squash){
  for(let i = 0; i < N; i++){
    px[i] = hx + qx[i] * (squash ? 1.1 : 1); py[i] = hy + qy[i] * (squash ? .86 : 1);
    vx[i] = 0; vy[i] = squash ? -qy[i] * .9 : 0;
  }
}
function seedDecor(){
  glitter.length = 0;
  for(let n = 0; n < 130; n++){
    glitter.push({ i: (Math.random() * N) | 0, t: Math.random(), s: Math.sqrt(Math.random()) * .93,
      z: .5 + Math.random() * 1.2, ph: Math.random() * TAU, sp: .6 + Math.random() * 1.6,
      c: Math.random() < .07 ? 1 : Math.random() < .45 ? 2 : 0 });
  }
  bubbles.length = 0;
  for(let n = 0; n < 6; n++) bubbles.push(newBubble(true));
}
function newBubble(now){
  return { i: (Math.random() * N) | 0, t: Math.random(), s: .25 + Math.random() * .6, r: .025 + Math.random() * .035,
    life: now ? 1 : 0, pop: -1, wait: 0, dr: (Math.random() - .5) * .4 };
}

/* fan coordinates: point = c + s * (lerp(p_i, p_i+1, t) - c) */
function fanPos(i, t, s, out){
  const j = (i + 1) % N;
  const ex = px[i] + (px[j] - px[i]) * t, ey = py[i] + (py[j] - py[i]) * t;
  out[0] = cx + (ex - cx) * s; out[1] = cy + (ey - cy) * s;
}
function toFan(x, y){
  for(let i = 0; i < N; i++){
    const j = (i + 1) % N;
    const ux = px[i] - cx, uy = py[i] - cy, wx = px[j] - cx, wy = py[j] - cy, X = x - cx, Y = y - cy;
    const det = ux * wy - uy * wx; if(Math.abs(det) < 1e-9) continue;
    const a = (X * wy - Y * wx) / det, b = (ux * Y - uy * X) / det;     // X = a u + b w
    if(a >= -1e-6 && b >= -1e-6){ const s = a + b; return { i, t: s > 1e-9 ? b / s : 0, s: Math.min(s, 1.05) }; }
  }
  let bi = 0, bd = Infinity;
  for(let i = 0; i < N; i++){ const d = (px[i] - x) ** 2 + (py[i] - y) ** 2; if(d < bd){ bd = d; bi = i; } }
  return { i: bi, t: 0, s: Math.min(1, Math.hypot(x - cx, y - cy) / Math.max(1, Math.hypot(px[bi] - cx, py[bi] - cy))) };
}
function inside(x, y){
  let c = false;
  for(let i = 0, j = N - 1; i < N; j = i++){
    if(((py[i] > y) !== (py[j] > y)) && (x < (px[j] - px[i]) * (y - py[i]) / (py[j] - py[i]) + px[i])) c = !c;
  }
  return c;
}
function edgeDist(x, y){
  let best = Infinity;
  for(let i = 0; i < N; i++){
    const j = (i + 1) % N, ex = px[j] - px[i], ey = py[j] - py[i];
    const l2 = ex * ex + ey * ey || 1;
    const t = clamp(((x - px[i]) * ex + (y - py[i]) * ey) / l2, 0, 1);
    const d = (px[i] + ex * t - x) ** 2 + (py[i] + ey * t - y) ** 2;
    if(d < best) best = d;
  }
  return Math.sqrt(best);
}

/* ---------- physics ---------- */
const P = { ks: 19, cd: 3.2, cf: 1.1, kh: 7, ch: 4.5, anchor: .8, kl: 140, keS: 60, keC: 300, kb: 60, kpF: 300, kg: 650, cg: 30 };
function step(h, sub){
  let mx = 0, my = 0, mvx = 0, mvy = 0;
  for(let i = 0; i < N; i++){ mx += px[i]; my += py[i]; mvx += vx[i]; mvy += vy[i]; }
  mx /= N; my /= N; mvx /= N; mvy /= N;
  let num = 0, den = 0, A = 0;
  for(let i = 0; i < N; i++){
    const dx = px[i] - mx, dy = py[i] - my;
    num += qx[i] * dy - qy[i] * dx; den += qx[i] * dx + qy[i] * dy;
    const j = i + 1 === N ? 0 : i + 1;
    A += px[i] * py[j] - px[j] * py[i];
  }
  A *= .5;
  const th = Math.atan2(num, den) * .6, co = Math.cos(th), si = Math.sin(th);
  const br = reduce ? 1 : 1 + .011 * Math.sin(S.time * 1.15) + .006 * Math.sin(S.time * 2.7 + 1);
  const brx = br, bry = reduce ? 1 : 2 - br;
  const hfx = P.kh * (hx - mx) - P.ch * mvx, hfy = P.kh * (hy - my) - P.ch * mvy;
  // shape-matching centre is partly anchored to home: the slime sits on the table, so a pinch stretches it into a neck
  const ox = mx + (hx - mx) * P.anchor, oy = my + (hy - my) * P.anchor;
  for(let i = 0; i < N; i++){
    const rqx = qx[i] * brx, rqy = qy[i] * bry;
    const gx = ox + co * rqx - si * rqy, gy = oy + si * rqx + co * rqy;
    ax[i] = P.ks * (gx - px[i]) - P.cd * (vx[i] - mvx) - P.cf * vx[i] + hfx;
    ay[i] = P.ks * (gy - py[i]) - P.cd * (vy[i] - mvy) - P.cf * vy[i] + hfy;
  }
  // curvature smoothing toward the rest-shape Laplacian: keeps the outline from crumpling under compression
  for(let i = 0; i < N; i++){
    const a = i === 0 ? N - 1 : i - 1, b = i + 1 === N ? 0 : i + 1;
    const lx = (px[a] + px[b]) * .5 - px[i] - (co * LPx[i] - si * LPy[i]), ly = (py[a] + py[b]) * .5 - py[i] - (si * LPx[i] + co * LPy[i]);
    const fx = P.kl * lx, fy = P.kl * ly;
    ax[i] += fx; ay[i] += fy; ax[a] -= fx * .5; ay[a] -= fy * .5; ax[b] -= fx * .5; ay[b] -= fy * .5;
  }
  // edge + bending springs
  for(let i = 0; i < N; i++){
    const j = i + 1 === N ? 0 : i + 1;
    let dx = px[j] - px[i], dy = py[j] - py[i], len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    let ext = len - L0[i], f = (ext > 0 ? P.keS : P.keC) * ext / len;
    ax[i] += f * dx; ay[i] += f * dy; ax[j] -= f * dx; ay[j] -= f * dy;
    const j2 = j + 1 === N ? 0 : j + 1;
    dx = px[j2] - px[i]; dy = py[j2] - py[i]; len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    ext = len - B0[i]; f = P.kb * (ext > 0 ? .35 : 1) * ext / len;
    ax[i] += f * dx; ay[i] += f * dy; ax[j2] -= f * dx; ay[j2] -= f * dy;
  }
  // pressure (area preservation): push along dA/dx_i
  const pr = P.kpF * R * (A0 - A) / A0 / edge0;
  for(let i = 0; i < N; i++){
    const a = i === 0 ? N - 1 : i - 1, b = i + 1 === N ? 0 : i + 1;
    ax[i] += pr * .5 * (py[b] - py[a]); ay[i] += pr * .5 * (px[a] - px[b]);
  }
  // grabs (pointer pinches)
  const u = (sub + 1) / SUB;
  for(const g of grabs.values()){
    const gx = g.fx + (g.x - g.fx) * u, gy = g.fy + (g.y - g.fy) * u;
    if(g.type === 'grab'){
      const kk = g.drag ? P.kg : P.kg * .25;
      for(let n = 0; n < g.ids.length; n++){
        const i = g.ids[n], w = g.w[n];
        ax[i] += w * (kk * (gx + g.ox[n] - px[i]) + P.cg * (g.vx - vx[i]));
        ay[i] += w * (kk * (gy + g.oy[n] - py[i]) + P.cg * (g.vy - vy[i]));
      }
    }
  }
  for(let i = 0; i < N; i++){
    vx[i] += ax[i] * h; vy[i] += ay[i] * h;
    px[i] += vx[i] * h; py[i] += vy[i] * h;
  }
  // pushers (pointer pressing from the outside): circular collider
  for(const g of grabs.values()){
    if(g.type !== 'push') continue;
    const gx = g.fx + (g.x - g.fx) * u, gy = g.fy + (g.y - g.fy) * u, r = g.r;
    let hit = false;
    for(let i = 0; i < N; i++){
      const dx = px[i] - gx, dy = py[i] - gy, d2 = dx * dx + dy * dy;
      if(d2 < r * r){
        const d = Math.sqrt(d2) || 1e-6, nX = dx / d, nY = dy / d;
        px[i] = gx + nX * r; py[i] = gy + nY * r;
        const vn = vx[i] * nX + vy[i] * nY, pn = g.vx * nX + g.vy * nY;
        if(vn < pn){ vx[i] += (pn - vn) * nX; vy[i] += (pn - vn) * nY; }
        hit = true;
      }
    }
    if(hit && !g.touched){ g.touched = true; g.contact = true; }
    if(!hit) g.touched = false;
  }
  // keep the two sides of a thin strand from passing through each other
  const dmin = .075 * R, dmin2 = dmin * dmin;
  for(let i = 0; i < N; i++){
    for(let j = i + 4; j < N; j++){
      if(j - i > N - 4) break;
      const dx = px[j] - px[i], dy = py[j] - py[i], d2 = dx * dx + dy * dy;
      if(d2 < dmin2){
        const d = Math.sqrt(d2) || 1e-6, o = (dmin - d) * .5 / d;
        px[i] -= dx * o; py[i] -= dy * o; px[j] += dx * o; py[j] += dy * o;
      }
    }
  }
  // stage walls
  const m = 6, top = 40;
  for(let i = 0; i < N; i++){
    if(px[i] < m){ px[i] = m; if(vx[i] < 0) vx[i] *= -.25; }
    else if(px[i] > W - m){ px[i] = W - m; if(vx[i] > 0) vx[i] *= -.25; }
    if(py[i] < top){ py[i] = top; if(vy[i] < 0) vy[i] *= -.25; }
    else if(py[i] > H - m){ py[i] = H - m; if(vy[i] > 0) vy[i] *= -.25; }
  }
}

/* ---------- sound ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
function squelch(v = 1){
  const p = rnd(.85, 1.15);
  J.sfx.noise({ type: 'lowpass', freq: 1700 * p, freq2: 240 * p, Q: 7, peak: .2 * v, dec: .2, att: .012 });
  J.sfx.tone({ f: 250 * p, f2: 92 * p, peak: .1 * v, dec: .17, att: .01 });
  J.sfx.noise({ type: 'bandpass', freq: 520 * p, freq2: 300 * p, Q: 3, peak: .06 * v, dec: .12, att: .02, delay: .03 });
}
function plop(v = 1){
  const p = rnd(.88, 1.14);
  J.sfx.tone({ f: 470 * p, f2: 150 * p, peak: .17 * Math.min(1.3, v), dec: .12, att: .004 });
  J.sfx.tone({ f: 760 * p, f2: 320 * p, peak: .05, dec: .07, delay: .045 });
  J.sfx.noise({ type: 'lowpass', freq: 1000 * p, freq2: 220, Q: 2, peak: .07 * v, dec: .08 });
}
function popSound(){
  const f = rnd(1300, 2300);
  J.sfx.tone({ f, f2: f * 1.7, peak: .045, dec: .035, att: .002, wet: .15, pan: rnd(-.4, .4) });
  J.sfx.noise({ type: 'highpass', freq: 3000, Q: .7, peak: .025, dec: .018 });
}
function creak(v){
  const f = rnd(380, 720);
  J.sfx.noise({ type: 'bandpass', freq: f, freq2: f * rnd(.75, 1.2), Q: 14, peak: .03 + .03 * v, dec: .055, att: .012 });
}

/* ---------- actions ---------- */
function count(){ S.n++; J.store.set('slime-n', S.n); J.stat(); }
function addDimple(x, y, r, depth, held){
  const f = toFan(x, y);
  const d = { i: f.i, t: f.t, s: f.s, r, d: held ? 0 : depth, target: depth, held, age: 0 };
  dimples.push(d);
  if(dimples.length > 10) dimples.shift();
  return d;
}
function poke(x, y, strength){
  addDimple(x, y, (.24 + .12 * strength) * R, Math.min(1.25, .85 * strength), false);
  for(let i = 0; i < N; i++){
    const dx = px[i] - x, dy = py[i] - y, f = Math.exp(-(dx * dx + dy * dy) / (.2 * R * R)) * strength;
    let ix = cx - px[i], iy = cy - py[i]; const il = Math.hypot(ix, iy) || 1; ix /= il; iy /= il;
    px[i] += ix * f * .1 * R; py[i] += iy * f * .1 * R;
    vx[i] += ix * f * 1.4 * R - ix * .35 * R * strength; vy[i] += iy * f * 1.4 * R - iy * .35 * R * strength;
  }
  const p = rnd(.88, 1.12);
  J.sfx.tone({ f: 330 * p * (strength > 1.2 ? .7 : 1), f2: 120 * p, peak: .16 + .04 * strength, dec: .15, att: .006 });
  J.sfx.noise({ type: 'lowpass', freq: 1300 * p, freq2: 260, Q: 5, peak: .12, dec: .11 });
  J.sfx.tone({ f: 620 * p, f2: 900 * p, peak: .035, dec: .06, delay: .07, wet: .2 });
  J.buzz(strength > 1.2 ? 18 : 9);
  if(Math.random() < .35) S.lastPop = -1;   // invite a bubble pop soon
}
function bigPoke(){ J.ac(); count(); poke(cx, cy, 1.8); }

/* ---------- pointer ---------- */
/* pick the particles a pinch at (sx, sy) holds, relative to the pointer at (x, y). Falloff is measured from the nearest
   particle, so a grab deep inside still catches the closest stretch of rim. */
function setGrab(g, sx, sy, x, y){
  let dmin = Infinity;
  for(let i = 0; i < N; i++) dmin = Math.min(dmin, Math.hypot(px[i] - sx, py[i] - sy));
  const span = .6 * R;
  g.ids = []; g.w = []; g.ox = []; g.oy = [];
  for(let i = 0; i < N; i++){
    const d = Math.hypot(px[i] - sx, py[i] - sy) - dmin;
    if(d < span){ const u = 1 - d / span; g.ids.push(i); g.w.push(u * u * u * (u * (u * 6 - 15) + 10)); g.ox.push(px[i] - x); g.oy.push(py[i] - y); }
  }
  g.deep = dmin > .45 * R;
}
function onDown(e){
  e.preventDefault(); J.ac();
  const [x, y] = J.local(e, cv);
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  const tol = Math.max(16, .1 * R);
  const g = { id: e.pointerId, x, y, fx: x, fy: y, x0: x, y0: y, vx: 0, vy: 0, t0: performance.now(), drag: false, lastX: x, lastY: y, lastT: performance.now() };
  if(inside(x, y) || edgeDist(x, y) < tol){
    g.type = 'grab';
    setGrab(g, x, y, x, y);
    g.dimple = inside(x, y) ? addDimple(x, y, .2 * R, .55, true) : null;
    count();
    squelch(.9);
    J.buzz(8);
  } else {
    g.type = 'push'; g.r = Math.max(15, .17 * R);
  }
  grabs.set(e.pointerId, g);
}
function onMove(e){
  const g = grabs.get(e.pointerId); if(!g) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  const last = evs && evs.length ? evs[evs.length - 1] : e;
  const [x, y] = J.local(last, cv);
  g.x = x; g.y = y;
  if(!g.drag && Math.hypot(x - g.x0, y - g.y0) > 8){
    g.drag = true;
    if(g.dimple){ g.dimple.held = false; g.dimple = null; }
    // pinched deep inside: grab the rim on the side we are pulling toward, so it stretches out that way
    if(g.type === 'grab' && g.deep){
      const dx = x - g.x0, dy = y - g.y0, dl = Math.hypot(dx, dy) || 1;
      const t = rayDist(g.x0, g.y0, dx / dl, dy / dl) * .8;
      setGrab(g, g.x0 + dx / dl * t, g.y0 + dy / dl * t, x, y);
    }
  }
}
function onUp(e){
  const g = grabs.get(e.pointerId); if(!g) return;
  grabs.delete(e.pointerId);
  const dur = performance.now() - g.t0;
  if(g.type === 'grab'){
    if(!g.drag && dur < 260){
      if(g.dimple){ g.dimple.held = false; g.dimple.target = 0; }
      poke(g.x, g.y, 1);
    } else {
      if(g.dimple){ g.dimple.held = false; }
      plop(.6 + Math.min(1, S.energy * 6));
      J.buzz(6);
    }
  } else if(g.contact){
    plop(.45);
  }
}

/* ---------- rendering ---------- */
function makeBg(){
  bgc = document.createElement('canvas');
  bgc.width = Math.max(1, Math.round(W * k)); bgc.height = Math.max(1, Math.round(H * k));
  bgx = bgc.getContext('2d'); bgx.setTransform(k, 0, 0, k, 0, 0);
  bgx.fillStyle = J.C.panel; bgx.fillRect(0, 0, W, H);
  let g = bgx.createRadialGradient(hx - R * .4, hy - R * .8, 0, hx, hy, Math.max(W, H) * .75);
  g.addColorStop(0, 'rgba(242,181,107,.10)'); g.addColorStop(.35, 'rgba(242,181,107,.04)'); g.addColorStop(1, 'rgba(242,181,107,0)');
  bgx.fillStyle = g; bgx.fillRect(0, 0, W, H);
  // a soft pool of lamp light on the table under the slime
  bgx.save(); bgx.translate(hx, hy + R * .25); bgx.scale(1, .62);
  g = bgx.createRadialGradient(0, 0, 0, 0, 0, R * 2.3);
  g.addColorStop(0, 'rgba(255,226,180,.07)'); g.addColorStop(.6, 'rgba(255,226,180,.03)'); g.addColorStop(1, 'rgba(255,226,180,0)');
  bgx.fillStyle = g; bgx.beginPath(); bgx.arc(0, 0, R * 2.3, 0, TAU); bgx.fill(); bgx.restore();
  g = bgx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .8);
  g.addColorStop(0, 'rgba(8,9,14,0)'); g.addColorStop(1, 'rgba(8,9,14,.45)');
  bgx.fillStyle = g; bgx.fillRect(0, 0, W, H);
}
function trace(c, dx = 0, dy = 0, keep){
  if(!keep) c.beginPath();
  for(let i = 0; i < N; i++){
    const a = i === 0 ? N - 1 : i - 1, b = (i + 1) % N, b2 = (i + 2) % N;
    if(i === 0) c.moveTo(px[i] + dx, py[i] + dy);
    c.bezierCurveTo(px[i] + (px[b] - px[a]) / 6 + dx, py[i] + (py[b] - py[a]) / 6 + dy,
      px[b] - (px[b2] - px[i]) / 6 + dx, py[b] - (py[b2] - py[i]) / 6 + dy, px[b] + dx, py[b] + dy);
  }
  c.closePath();
}
function rayDist(ox, oy, dx, dy){
  let best = Infinity;
  for(let i = 0; i < N; i++){
    const j = (i + 1) % N, ex = px[j] - px[i], ey = py[j] - py[i];
    const den = dx * ey - dy * ex; if(Math.abs(den) < 1e-9) continue;
    const wx = px[i] - ox, wy = py[i] - oy;
    const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
    if(t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best === Infinity ? R : best;
}
const tmp = [0, 0];
function measure(){
  cx = 0; cy = 0;
  for(let i = 0; i < N; i++){ cx += px[i]; cy += py[i]; }
  cx /= N; cy /= N;
  const skip = (N / 6) | 0;
  for(let i = 0; i < N; i++){
    let best = Infinity, bj = i;
    for(let j = 0; j < N; j++){
      let d = Math.abs(i - j); d = Math.min(d, N - d);
      if(d <= skip) continue;
      const d2 = (px[j] - px[i]) ** 2 + (py[j] - py[i]) ** 2;
      if(d2 < best){ best = d2; bj = j; }
    }
    thick[i] = Math.sqrt(best); opp[i] = bj;
    const a = i === 0 ? N - 1 : i - 1, b = (i + 1) % N;
    let gx = py[b] - py[a], gy = px[a] - px[b]; const gl = Math.hypot(gx, gy) || 1;
    nx[i] = gx / gl; ny[i] = gy / gl;
  }
  // hub: centre biased toward the thick part of the body (so highlights stay on the bulk, not on a strand)
  let sw = 0; hubX = 0; hubY = 0;
  for(let i = 0; i < N; i++){ const w = thick[i] * thick[i] * thick[i]; sw += w; hubX += px[i] * w; hubY += py[i] * w; }
  hubX /= sw; hubY /= sw;
  // pull toward the midpoint of the thickest chord (≈ centre of the largest inscribed circle), smoothed over time
  let ti = 0; for(let i = 1; i < N; i++) if(thick[i] > thick[ti]) ti = i;
  const tx = lerp(hubX, (px[ti] + px[opp[ti]]) * .5, .6), ty = lerp(hubY, (py[ti] + py[opp[ti]]) * .5, .6);
  if(!S.hubInit){ S.hubInit = 1; S.hx = tx; S.hy = ty; }
  S.hx += (tx - S.hx) * .2; S.hy += (ty - S.hy) * .2;
  hubX = S.hx; hubY = S.hy;
  // deformation energy (for creaks and bubble pops)
  let e = 0, mxx = 0;
  for(let i = 0; i < N; i++){
    const j = (i + 1) % N, l = Math.hypot(px[j] - px[i], py[j] - py[i]);
    e += (l / L0[i] - 1) ** 2; mxx += l;
  }
  S.energy = e / N;
}

function render(){
  const c = ctx, l = lctx;
  const A = PAL[S.pi], B = PAL[S.ci], mt = S.mix;
  const light = mixc(A.light, B.light, mt), base = mixc(A.base, B.base, mt), deep = mixc(A.deep, B.deep, mt),
    rim = mixc(A.rim, B.rim, mt), glow = mixc(A.glow, B.glow, mt);
  const gal = (A.galaxy ? 1 - mt : 0) + (B.galaxy ? mt : 0);

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(bgc, 0, 0);
  c.setTransform(k, 0, 0, k, 0, 0);

  // contact shadow: a wide soft one and a tight dark one, cast by the outline itself
  c.save();
  c.translate(-6000, 0);
  trace(c);
  c.fillStyle = '#000';
  c.shadowColor = 'rgba(4,5,10,.5)'; c.shadowBlur = R * .32 * k;
  c.shadowOffsetX = (6000 + R * .06) * k; c.shadowOffsetY = R * .16 * k;
  c.fill();
  c.shadowColor = 'rgba(2,3,6,.55)'; c.shadowBlur = R * .07 * k;
  c.shadowOffsetX = (6000 + R * .02) * k; c.shadowOffsetY = R * .05 * k;
  c.fill();
  c.restore();

  // ---- body on its own layer ----
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, layer.width, layer.height);
  l.setTransform(k, 0, 0, k, 0, 0);

  const rL = rayDist(hubX, hubY, LX, LY), rD = rayDist(hubX, hubY, -LX, -LY);
  const rr = Math.max(R * .3, (rL + rD) * .5);
  // base: a gentle top-left → bottom-right gradient over the whole body (strands keep their colour)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for(let i = 0; i < N; i++){ if(px[i] < x0) x0 = px[i]; if(px[i] > x1) x1 = px[i]; if(py[i] < y0) y0 = py[i]; if(py[i] > y1) y1 = py[i]; }
  const lg = l.createLinearGradient(hubX + LX * rr, hubY + LY * rr, hubX - LX * rr, hubY - LY * rr);
  lg.addColorStop(0, rgba(mixc(base, light, .12), 1)); lg.addColorStop(.5, rgba(base, 1)); lg.addColorStop(1, rgba(mixc(base, deep, .8), 1));
  trace(l); l.fillStyle = lg; l.fill();

  l.save();
  trace(l); l.clip();
  // lit dome over the bulk of the body
  const gcx = hubX + LX * rL * .4, gcy = hubY + LY * rL * .4;
  const g = l.createRadialGradient(gcx, gcy, 0, gcx, gcy, rr * .95);
  const dome = 1 - .4 * gal;
  g.addColorStop(0, rgba(light, .9 * dome)); g.addColorStop(.4, rgba(light, .26 * dome)); g.addColorStop(1, rgba(light, 0));
  l.fillStyle = g; l.fillRect(gcx - rr * 1.1, gcy - rr * 1.1, rr * 2.2, rr * 2.2);
  // galaxy nebula + glitter, riding the mesh
  if(gal > .01){
    l.globalCompositeOperation = 'lighter';
    fanPos(7, .5, .55, tmp);
    let ng = l.createRadialGradient(tmp[0], tmp[1], 0, tmp[0], tmp[1], rr * .75);
    ng.addColorStop(0, 'rgba(190,70,160,' + (.22 * gal).toFixed(3) + ')'); ng.addColorStop(1, 'rgba(190,70,160,0)');
    l.fillStyle = ng; l.fillRect(tmp[0] - rr, tmp[1] - rr, rr * 2, rr * 2);
    fanPos(38, .5, .6, tmp);
    ng = l.createRadialGradient(tmp[0], tmp[1], 0, tmp[0], tmp[1], rr * .8);
    ng.addColorStop(0, 'rgba(60,150,190,' + (.2 * gal).toFixed(3) + ')'); ng.addColorStop(1, 'rgba(60,150,190,0)');
    l.fillStyle = ng; l.fillRect(tmp[0] - rr, tmp[1] - rr, rr * 2, rr * 2);
    const tw = reduce ? .3 : 1;
    for(const s of glitter){
      fanPos(s.i, s.t, s.s, tmp);
      const a = gal * (.35 + .65 * (.5 + .5 * Math.sin(S.time * s.sp * 2.2 * tw + s.ph)) ** 3);
      const sz = s.z * Math.max(1.3, R * .014) * (s.c === 1 ? 2.4 : 1);
      l.globalAlpha = a;
      if(s.c === 1) l.drawImage(spStar, tmp[0] - sz * 2, tmp[1] - sz * 2, sz * 4, sz * 4);
      else { l.fillStyle = s.c === 2 ? '#ffe6b8' : '#f4f0ff'; l.beginPath(); l.arc(tmp[0], tmp[1], sz * .5, 0, TAU); l.fill(); }
    }
    l.globalAlpha = 1;
    l.globalCompositeOperation = 'source-over';
  }

  // inner edge shading follows the deformed outline (so stretched strands read as rounded tubes)
  l.beginPath(); l.rect(-W, -H, W * 3, H * 3);
  trace(l, 0, 0, true);
  l.fillStyle = '#000';
  l.shadowColor = rgba(deep, .9); l.shadowBlur = R * .26 * k;
  l.shadowOffsetX = -LX * R * .05 * k; l.shadowOffsetY = -LY * R * .05 * k;
  l.fill('evenodd');
  l.shadowColor = rgba(rim, .8); l.shadowBlur = R * .07 * k;
  l.shadowOffsetX = -LX * R * .02 * k; l.shadowOffsetY = -LY * R * .02 * k;
  l.fill('evenodd');
  l.shadowColor = 'rgba(0,0,0,0)'; l.shadowBlur = 0; l.shadowOffsetX = l.shadowOffsetY = 0;

  // caustic glow: light that went through the body, gathered near the lower right
  l.globalCompositeOperation = 'screen';
  const qx2 = hubX - LX * rD * .5, qy2 = hubY - LY * rD * .5;
  const cg = l.createRadialGradient(qx2, qy2, 0, qx2, qy2, rr * .62);
  cg.addColorStop(0, rgba(glow, gal > .5 ? .22 : .38)); cg.addColorStop(1, rgba(glow, 0));
  l.fillStyle = cg; l.fillRect(qx2 - rr, qy2 - rr, rr * 2, rr * 2);
  l.globalCompositeOperation = 'source-over';

  // bubbles suspended inside
  for(const b of bubbles){
    if(b.life <= 0 && b.pop < 0) continue;
    fanPos(b.i, b.t, b.s, tmp);
    const br = b.r * R;
    if(b.pop >= 0){
      const u = b.pop;
      l.strokeStyle = rgba(light, .5 * (1 - u)); l.lineWidth = Math.max(.8, br * .25 * (1 - u));
      l.beginPath(); l.arc(tmp[0], tmp[1], br * (1 + u * 1.6), 0, TAU); l.stroke();
      continue;
    }
    const a = b.life;
    l.fillStyle = rgba(deep, .25 * a); l.beginPath(); l.arc(tmp[0], tmp[1], br, 0, TAU); l.fill();
    l.strokeStyle = rgba(light, .45 * a); l.lineWidth = Math.max(.7, br * .16);
    l.beginPath(); l.arc(tmp[0], tmp[1], br * .9, Math.PI * .1, Math.PI * 1.1); l.stroke();
    l.fillStyle = 'rgba(255,255,255,' + (.75 * a).toFixed(3) + ')';
    l.beginPath(); l.arc(tmp[0] + LX * br * .4, tmp[1] + LY * br * .4, br * .22, 0, TAU); l.fill();
  }

  // dimples: a concave dent — the wall nearer the light is in shade, the far wall catches light
  for(const d of dimples){
    if(Math.abs(d.d) < .01) continue;
    fanPos(d.i, d.t, d.s, tmp);
    const r = d.r * (1 + .25 * Math.max(0, -d.d)), dd = clamp(d.d, -1.3, 1.3), sg = dd > 0 ? 1 : -1, m = Math.abs(dd);
    const sx = tmp[0] + LX * r * .2 * sg, sy = tmp[1] + LY * r * .2 * sg;
    let gg = l.createRadialGradient(sx, sy, 0, sx, sy, r);
    gg.addColorStop(0, rgba(rim, .5 * m)); gg.addColorStop(.5, rgba(deep, .28 * m)); gg.addColorStop(1, rgba(deep, 0));
    l.fillStyle = gg; l.fillRect(sx - r, sy - r, r * 2, r * 2);
    const wx = tmp[0] - LX * r * .42 * sg, wy = tmp[1] - LY * r * .42 * sg, r2 = r * .5;
    gg = l.createRadialGradient(wx, wy, 0, wx, wy, r2);
    gg.addColorStop(0, rgba(light, .7 * m)); gg.addColorStop(1, rgba(light, 0));
    l.fillStyle = gg; l.fillRect(wx - r2, wy - r2, r2 * 2, r2 * 2);
  }

  // wet rim light: the outline inset a little, stroked with a gradient that is bright only on the side facing the lamp
  const ins = R * .075, wid = Math.max(1.2, R * .032);
  l.beginPath();
  for(let i = 0; i <= N; i++){ const m = i % N, x = px[m] - nx[m] * ins, y = py[m] - ny[m] * ins; i ? l.lineTo(x, y) : l.moveTo(x, y); }
  const ext = Math.max(x1 - x0, y1 - y0) * .5 + R * .2, mcx = (x0 + x1) / 2, mcy = (y0 + y1) / 2;
  let rg = l.createLinearGradient(mcx + LX * ext, mcy + LY * ext, mcx - LX * ext, mcy - LY * ext);
  rg.addColorStop(0, 'rgba(255,255,255,.5)'); rg.addColorStop(.3, 'rgba(255,255,255,.12)'); rg.addColorStop(.5, 'rgba(255,255,255,0)');
  rg.addColorStop(.78, rgba(light, 0)); rg.addColorStop(1, rgba(light, .3));
  l.strokeStyle = rg; l.lineWidth = wid; l.lineJoin = 'round'; l.stroke();

  // specular highlights, placed by the body's own extent toward the light
  const hx1 = hubX + LX * rL * .5, hy1 = hubY + LY * rL * .5, ang = Math.atan2(LY, LX) + Math.PI / 2;
  l.save(); l.translate(hx1, hy1); l.rotate(ang); l.scale(1, .55);
  l.globalAlpha = .26; l.drawImage(spW, -rL * .48, -rL * .48, rL * .96, rL * .96);
  l.restore();
  const hx2 = hubX + LX * rL * .64, hy2 = hubY + LY * rL * .64;
  l.save(); l.translate(hx2, hy2); l.rotate(ang - .12);
  l.fillStyle = 'rgba(255,255,255,.82)';
  l.beginPath(); l.ellipse(0, 0, rL * .17, rL * .062, 0, 0, TAU); l.fill();
  l.restore();
  const c3 = Math.cos(.55), s3 = Math.sin(.55);
  const dx3 = LX * c3 - LY * s3, dy3 = LX * s3 + LY * c3, r3 = rayDist(hubX, hubY, dx3, dy3);
  l.fillStyle = 'rgba(255,255,255,.75)';
  l.beginPath(); l.arc(hubX + dx3 * r3 * .74, hubY + dy3 * r3 * .74, Math.max(1.2, r3 * .035), 0, TAU); l.fill();
  l.restore(); // clip

  l.globalAlpha = 1;
  trace(l); l.strokeStyle = rgba(rim, .6); l.lineWidth = Math.max(1, R * .012); l.stroke();

  // thin strands: let a little light through
  l.globalCompositeOperation = 'destination-out';
  const tThin = .8 * R;
  for(let i = 0; i < N; i += 2){
    const t = thick[i]; if(t >= tThin) continue;
    const j = opp[i], mx = (px[i] + px[j]) * .5, my = (py[i] + py[j]) * .5, r = t * .7 + 2;
    l.globalAlpha = Math.min(.42, .5 * (1 - t / tThin));
    l.drawImage(spW, mx - r, my - r, r * 2, r * 2);
  }
  l.globalAlpha = 1;
  l.globalCompositeOperation = 'source-over';

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(layer, 0, 0);
  c.setTransform(k, 0, 0, k, 0, 0);

  // fingertip rings for pointers pressing from outside
  for(const g of grabs.values()){
    if(g.type !== 'push') continue;
    c.strokeStyle = 'rgba(236,230,214,.18)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.stroke();
  }
}

/* ---------- per-frame ---------- */
function tick(now, dt){
  if(!inited) return;
  const sdt = Math.min(dt, 34) / 1000;
  S.time += sdt;
  if(S.mix < 1) S.mix = Math.min(1, S.mix + sdt / .45);
  // pointer velocities + creaks
  for(const g of grabs.values()){
    const gdt = Math.max(1e-3, sdt);
    const nvx = (g.x - g.fx) / gdt, nvy = (g.y - g.fy) / gdt;
    g.vx = lerp(g.vx, nvx, .5); g.vy = lerp(g.vy, nvy, .5);
  }
  const h = sdt / SUB;
  for(let s = 0; s < SUB; s++) step(h, s);
  for(const g of grabs.values()){
    g.fx = g.x; g.fy = g.y;
    if(g.contact){ g.contact = false; squelch(.5); J.buzz(5); count(); }
  }
  measure();

  // creak while stretching fast
  const de = S.energy - S.energyPrev; S.energyPrev = S.energy;
  let pulling = false;
  for(const g of grabs.values()) if(g.drag && Math.hypot(g.vx, g.vy) > 350) pulling = true;
  if(pulling && de > 0 && S.energy > .01 && now - S.lastCreak > 70 + Math.random() * 90){
    S.lastCreak = now; creak(Math.min(1, S.energy * 4));
  }

  // dimples fill back slowly, with a little overshoot
  for(let n = dimples.length - 1; n >= 0; n--){
    const d = dimples[n];
    if(d.held){ d.d += (d.target - d.d) * Math.min(1, sdt * 6); d.age = 0; d.d0 = d.d; continue; }
    if(d.d0 === undefined){ d.d0 = d.d || d.target; }
    d.age += sdt;
    const t = d.age;
    d.d = d.d0 * Math.exp(-t * 1.5) * Math.cos(t * 1.75);
    if(t > 4) dimples.splice(n, 1);
  }

  // bubbles: drift slowly, pop now and then (more when squeezed)
  const rate = .02 + Math.min(2.5, S.energy * 30) + (S.lastPop < 0 ? 1.5 : 0);
  for(const b of bubbles){
    if(b.pop >= 0){ b.pop += sdt / .16; if(b.pop >= 1){ b.pop = -1; b.life = 0; b.wait = 1 + Math.random() * 4; } continue; }
    if(b.life < 1 && b.wait <= 0){ b.life = Math.min(1, b.life + sdt / 1.2); }
    if(b.wait > 0){ b.wait -= sdt; if(b.wait <= 0){ Object.assign(b, newBubble(false)); } continue; }
    if(!reduce){ b.t += b.dr * sdt * .15; if(b.t > 1){ b.t -= 1; b.i = (b.i + 1) % N; } else if(b.t < 0){ b.t += 1; b.i = (b.i + N - 1) % N; } }
    if(b.life >= 1 && Math.random() < rate * sdt / bubbles.length && now - S.lastPop > 250){
      b.pop = 0; S.lastPop = now; popSound();
    }
  }
  if(S.lastPop < 0 && Math.random() < sdt) S.lastPop = 0;

  render();
}

J.register({
  id: 'slime', name: '捏史莱姆', hint: '按、拉、戳，松手它会慢慢弹回来',
  create(root){
    const o = J.canvas(root, { dprMax: 2 });
    cv = o.cv; ctx = o.ctx;
    this._o = o;
    layer = document.createElement('canvas'); lctx = layer.getContext('2d');
    spW = sprite(255, 255, 255, true); spK = sprite(0, 0, 0, true); spStar = starSprite();
    cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('lostpointercapture', onUp);
  },
  resize(w, h){
    const o = this._o; o.fit(w, h);
    const oldR = R, ohx = hx, ohy = hy;
    W = w; H = h; k = o.k;
    R = Math.max(40, Math.min(W * .3, (H - 40) * .3, 185));
    hx = W / 2; hy = 40 + (H - 40) * .52;
    layer.width = cv.width; layer.height = cv.height;
    restShape();
    if(!inited){ placeAtRest(true); seedDecor(); inited = true; measure(); }
    else {
      const f = R / oldR;
      for(let i = 0; i < N; i++){ px[i] = hx + (px[i] - ohx) * f; py[i] = hy + (py[i] - ohy) * f; vx[i] *= f; vy[i] *= f; }
      measure();
    }
    makeBg();
    render();
  },
  enter(){ S.energyPrev = S.energy; },
  leave(){ grabs.clear(); for(const d of dimples) d.held = false; },
  tick,
  key(e){ if(e.code === 'Space'){ bigPoke(); return true; } },
  actions: [
    { label: '换颜色', run(){
      S.pi = S.ci; S.ci = (S.ci + 1) % PAL.length; S.mix = 0; J.store.set('slime-color', S.ci);
      const p = rnd(.9, 1.1);
      J.sfx.tone({ f: 520 * p, f2: 780 * p, peak: .08, dec: .18, wet: .3 });
      J.sfx.tone({ f: 780 * p, f2: 1040 * p, peak: .04, dec: .2, delay: .06, wet: .3 });
      // a soft wobble so the change feels physical
      for(let i = 0; i < N; i++){ vx[i] += (px[i] - cx) * .9; vy[i] += (py[i] - cy) * .9; }
      J.buzz(6);
    } }
  ],
  stat: () => `捏了 <b>${J.fmt(S.n)}</b> 下 · ${PAL[S.ci].name}`
});
})();

