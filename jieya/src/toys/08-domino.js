// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== domino ===== */
/* 多米诺 — draw lines of dominoes on a lamp-lit walnut table, push the first one, watch the chain run. */
(() => {
const TAU = Math.PI * 2;
const RM = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
const MAX = 800;
const G = 165, DAMP = 0.45, CAP = 1.5, OM_MIN = 2.6, XFER = 0.85, PUSH_OM = 3.6, SUB = 1 / 240;
const SH = 0.5; // shadow buffer scale

let cv, ctx, k = 1, W = 0, H = 0;
let bgc = null, shc = null, shx = null;
let h = 28, w = 14, th = 5, sp = 17;
let LX = 0, LY = 0, LH = 1;
let D = [], fallOrder = [], active = [];
let start = null;            // { d, sign }
let pristine = false;        // demo layout untouched since laid
let fallen = 0;
let chainHits = 0, chainLast = null, runOn = false, tockDone = false;
let animUntil = 0, dirty = true, now = 0;
let rewind = null, clearing = null, pendingPush = 0;
let popPending = 0, lastPopSnd = 0, lastLandSnd = 0;
let lineSeed = 0.3;
let capWarned = false;
const rings = [];

/* ---------- utils ---------- */
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const easeOutBack = x => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function rng(seed){ let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* warm tile colors, interpolated along each line */
const STOPS = [[246, 232, 206], [244, 202, 146], [240, 166, 124], [230, 144, 148], [242, 212, 150], [246, 226, 190]];
function colorAt(seed, i){
  const t = seed * STOPS.length + i / 22;
  const a = Math.floor(t), f = t - a, s = f * f * (3 - 2 * f);
  const c0 = STOPS[((a % STOPS.length) + STOPS.length) % STOPS.length], c1 = STOPS[(((a + 1) % STOPS.length) + STOPS.length) % STOPS.length];
  return [c0[0] + (c1[0] - c0[0]) * s, c0[1] + (c1[1] - c0[1]) * s, c0[2] + (c1[2] - c0[2]) * s];
}
const PL = 16;
function palette(c){
  const p = new Array(PL);
  for(let i = 0; i < PL; i++){
    const b = 0.38 + i / (PL - 1) * 0.84; // .38 .. 1.22
    let r, g, bl;
    if(b <= 1){ const m = (1 - b) / .62 * .55; r = c[0] + (120 - c[0]) * m; g = c[1] + (72 - c[1]) * m; bl = c[2] + (48 - c[2]) * m; }
    else { const m = (b - 1) / .22 * .55; r = c[0] + (255 - c[0]) * m; g = c[1] + (255 - c[1]) * m; bl = c[2] + (255 - c[2]) * m; }
    p[i] = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')';
  }
  return p;
}
const lvl = b => { const i = Math.round((b - 0.38) / 0.84 * (PL - 1)); return i < 0 ? 0 : i >= PL ? PL - 1 : i; };

/* ---------- spatial hash ---------- */
let cs = 28;
const hash = new Map();
const hkey = (cx, cy) => (cx + 4096) * 8192 + (cy + 4096);
function hAdd(d){ const key = hkey(Math.floor(d.x / cs), Math.floor(d.y / cs)); d.hk = key; let a = hash.get(key); if(!a){ a = []; hash.set(key, a); } a.push(d); }
const qOut = [];
function query(x, y, r){
  qOut.length = 0;
  const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs), y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs);
  for(let cx = x0; cx <= x1; cx++) for(let cy = y0; cy <= y1; cy++){
    const a = hash.get(hkey(cx, cy));
    if(a) for(let i = 0; i < a.length; i++) if(!a[i].gone && !a[i].leaving) qOut.push(a[i]);
  }
  return qOut;
}

/* ---------- dominoes ---------- */
function mk(x, y, ux, uy, col, born){
  const dx = LX - x, dy = LY - y, dz = LH, dl = Math.hypot(dx, dy, dz);
  const d = {
    x, y, ux, uy, fs: 0, th: 0, om: 0, pth: 0, st: 0, still: 0, cl: false, landed: false,
    cand: null, gone: false, leaving: false, ldel: 0, lvx: 0, lvy: 0, lspin: 0,
    born, popped: born <= now, col, pal: palette(col),
    pv0: (Math.random() * 7) | 0, pv1: (Math.random() * 7) | 0,
    lx: dx / dl, ly: dy / dl, lz: dz / dl, svx: (x - LX) / LH, svy: (y - LY) / LH,
    rw0: 0, rwd: 0, links: null
  };
  if(!d.popped) popPending++;
  D.push(d); hAdd(d);
  return d;
}
function liveCount(){ let n = 0; for(const d of D) if(!d.leaving) n++; return n; }

function computeCand(A){
  const dx = A.fs * A.ux, dy = A.fs * A.uy;
  const px = A.x + dx * th * .5, py = A.y + dy * th * .5;
  const list = query(A.x + dx * h * .5, A.y + dy * h * .5, h * .62 + w);
  const out = [];
  for(let i = 0; i < list.length; i++){
    const B = list[i]; if(B === A) continue;
    const rx = B.x - px, ry = B.y - py;
    const s = rx * dx + ry * dy;
    if(s <= th * .2 || s > h + th) continue;
    const lat = Math.abs(-rx * dy + ry * dx);
    const c = B.ux * dx + B.uy * dy;
    const ext = Math.abs(-B.ux * dy + B.uy * dx) * th * .5 + Math.abs(c) * w * .5;
    if(lat > w * .5 + ext + th * .25) continue;
    out.push(B);
  }
  A.cand = out;
}
function refreshCands(){ for(const A of active) computeCand(A); }

/* ---------- sound ---------- */
const pan = x => clamp((x / Math.max(1, W) - .5) * 1.1, -.9, .9);
function sHit(d, n){
  const pf = Math.pow(2, Math.min(n, 70) / 70 * .55) * (.97 + Math.random() * .06), p = pan(d.x);
  J.sfx.noise({ type: 'bandpass', freq: 2900 * pf, Q: 1.5, peak: .2, dec: .02, pan: p });
  J.sfx.tone({ f: 1480 * pf, f2: 1240 * pf, type: 'triangle', peak: .06, dec: .035, pan: p });
  J.sfx.tone({ f: 540 * pf, f2: 480 * pf, peak: .07, dec: .06, pan: p });
}
function sPlace(x, i){
  const v = .94 + Math.random() * .12, p = pan(x), up = 1 + Math.min(i, 30) * .006;
  J.sfx.tone({ f: 2300 * v * up, f2: 1900 * v * up, peak: .04, dec: .028, pan: p });
  J.sfx.noise({ type: 'bandpass', freq: 5200 * v, Q: 2.4, peak: .055, dec: .012, pan: p });
  J.sfx.tone({ f: 820 * v, f2: 700 * v, peak: .03, dec: .035, pan: p });
}
function sPush(x){
  J.sfx.noise({ type: 'lowpass', freq: 1400, peak: .12, dec: .035, pan: pan(x) });
  J.sfx.tone({ f: 420, f2: 360, peak: .06, dec: .06, pan: pan(x) });
}
function sLand(x){
  if(now - lastLandSnd < 40) return; lastLandSnd = now;
  J.sfx.noise({ type: 'lowpass', freq: 900, peak: .06, dec: .035, pan: pan(x) });
}
function sTock(x){
  J.sfx.tone({ f: 150, f2: 104, peak: .5, dec: .5, wet: .22, pan: pan(x) * .5 });
  J.sfx.tone({ f: 310, f2: 255, type: 'triangle', peak: .12, dec: .16 });
  J.sfx.noise({ type: 'lowpass', freq: 700, peak: .22, dec: .06 });
  J.sfx.tone({ f: 659, peak: .035, dec: .9, att: .01, delay: .04, wet: .7 });
  J.sfx.tone({ f: 988, peak: .02, dec: .9, att: .01, delay: .09, wet: .7 });
  J.buzz(28);
}
function sWhoosh(){
  J.sfx.noise({ type: 'bandpass', freq: 380, freq2: 2400, Q: .8, peak: .2, dec: .45, att: .08 });
  for(let i = 0; i < 7; i++) J.sfx.tone({ f: 1500 + Math.random() * 900, f2: 1200, type: 'triangle', peak: .025, dec: .03, delay: .05 + Math.random() * .35, pan: Math.random() * 1.4 - .7 });
}

/* ---------- physics ---------- */
function trigger(B, sign, om){
  B.st = 1; B.fs = sign; B.om = Math.max(OM_MIN, om); B.th = 0.0002; B.pth = 0; B.still = 0; B.landed = false; B.cl = false;
  fallOrder.push(B); active.push(B); computeCand(B);
  fallen++; chainLast = B;
  sHit(B, chainHits++); J.buzz(4);
  J.stat();
}
function push(d, sign){
  if(!d || d.st !== 0 || d.leaving) return false;
  if(!runOn){ runOn = true; tockDone = false; chainHits = 0; }
  sPush(d.x);
  d.st = 1; d.fs = sign; d.om = PUSH_OM; d.th = 0.0002; d.pth = 0; d.still = 0; d.landed = false;
  fallOrder.push(d); active.push(d); computeCand(d);
  fallen++; chainLast = d; pristine = false;
  rings.push({ x: d.x, y: d.y, t0: now, dur: 520, r0: w * .4, r1: h * 1.1, a: .35 });
  J.buzz(8); J.stat();
  return true;
}
function constrain(A){
  const dx = A.fs * A.ux, dy = A.fs * A.uy;
  const px = A.x + dx * th * .5, py = A.y + dy * th * .5;
  const cand = A.cand;
  for(let i = 0; i < cand.length; i++){
    const B = cand[i];
    if(B.gone || B.leaving) continue;
    const s = (B.x - px) * dx + (B.y - py) * dy;
    const c = B.ux * dx + B.uy * dy;
    let lim;
    if(B.st === 0 || B.fs * c > -0.2){
      const tb = B.st === 0 ? 0 : B.th;
      const sB = s - th * .5 * Math.max(Math.abs(c), .35);
      const m = ((sB + th) * Math.cos(tb) - th) / h;
      if(m >= 1) continue;
      lim = tb + Math.asin(m < -1 ? -1 : m);
      if(A.th > lim){
        if(B.st === 0) trigger(B, c >= 0 ? 1 : -1, A.om * XFER);
        A.th = Math.max(0, lim); if(A.om > 0) A.om = 0; A.cl = true;
      }
    } else {
      const m = (s - h * Math.sin(B.th) * Math.abs(c)) / h;
      if(m >= 1) continue;
      lim = Math.asin(m < 0 ? 0 : m);
      if(A.th > lim){ A.th = lim; if(A.om > 0) A.om = 0; A.cl = true; }
    }
  }
}
function linkCheck(A){
  const dx = A.fs * A.ux, dy = A.fs * A.uy, reach = h * Math.sin(A.th) + th;
  for(let i = 0; i < A.links.length; i++){
    const B = A.links[i];
    if(B.st !== 0 || B.gone || B.leaving) continue;
    const rx = B.x - A.x, ry = B.y - A.y, s = rx * dx + ry * dy;
    if(s <= 0 || reach < Math.hypot(rx, ry) * .82) continue;
    trigger(B, (B.ux * rx + B.uy * ry) >= 0 ? 1 : -1, A.om * XFER);
  }
}
function link(a, b){ (a.links || (a.links = [])).push(b); (b.links || (b.links = [])).push(a); }
function land(A){
  A.th = CAP;
  if(!A.landed){
    A.landed = true;
    const dx = A.fs * A.ux, dy = A.fs * A.uy;
    const tx = A.x + dx * h * .9, ty = A.y + dy * h * .9;
    let free = 0;
    for(const B of active) if(B !== A && !B.landed && !B.cl) free++;
    if(free === 0 && !tockDone){
      tockDone = true; sTock(tx);
      rings.push({ x: tx, y: ty, t0: now, dur: 900, r0: w * .5, r1: h * 2.6, a: .45 });
      rings.push({ x: tx, y: ty, t0: now + 120, dur: 1100, r0: w * .5, r1: h * 4, a: .22 });
    } else {
      sLand(tx);
      if(rings.length < 40) rings.push({ x: tx, y: ty, t0: now, dur: 360, r0: w * .3, r1: w * 1.1, a: .16 });
    }
  }
  A.om = A.om > 1.2 ? -A.om * .16 : 0;
}
function physics(dt){
  const steps = Math.max(1, Math.round(dt / 1000 / SUB)), hs = dt / 1000 / steps;
  for(let s = 0; s < steps; s++){
    for(let i = 0; i < active.length; i++){
      const A = active[i];
      A.om += (G * Math.sin(A.th) - DAMP * A.om) * hs;
      A.th += A.om * hs;
      if(A.th < 0){ A.th = 0; A.om = Math.abs(A.om) * .3 + .4; }
      A.cl = false;
      constrain(A);
      if(A.links) linkCheck(A);
      if(A.th >= CAP) land(A);
    }
  }
  for(let i = active.length - 1; i >= 0; i--){
    const A = active[i];
    const dth = Math.abs(A.th - A.pth); A.pth = A.th;
    if(dth < 0.0007 && (A.landed || A.cl) && Math.abs(A.om) < .4){
      A.still += dt;
      if(A.still > 220){ A.st = 2; active.splice(i, 1); }
    } else A.still = 0;
  }
  if(!active.length && runOn){
    runOn = false;
    if(!tockDone && chainLast){
      tockDone = true;
      const d = chainLast, tx = d.x + d.fs * d.ux * h * .7, ty = d.y + d.fs * d.uy * h * .7;
      sTock(tx); rings.push({ x: tx, y: ty, t0: now, dur: 900, r0: w * .5, r1: h * 2.6, a: .4 });
    }
    J.stat();
  }
}

/* ---------- actions ---------- */
function pushStart(){
  if(active.length || rewind || clearing) return;
  if(!liveCount()){ layDemo(true); return; }
  let s = start;
  if(!s || s.d.gone || s.d.leaving){
    s = null;
    for(const d of D) if(!d.leaving && d.st === 0){ s = { d, sign: 1 }; break; }
  }
  if(s && s.d.st === 0){ push(s.d, s.sign); return; }
  startRewind(true);
}
function startRewind(pushAfter){
  if(clearing) return;
  active.length = 0; runOn = false;
  const list = fallOrder.slice();
  if(!list.length){ if(pushAfter) pendingPush = now + 60; return; }
  const n = list.length, dur = RM ? 160 : 240, span = Math.min(RM ? 400 : 1000, 260 + n * 3.2);
  for(let i = 0; i < n; i++){ const d = list[i]; d.rw0 = d.th; d.rwd = (n > 1 ? (n - 1 - i) / (n - 1) : 0) * (span - dur); d.rwDone = false; }
  rewind = { t0: now, list, dur, end: span + 30, pushAfter, ticks: 0 };
  J.sfx.noise({ type: 'bandpass', freq: 2400, freq2: 500, Q: .9, peak: .08, dec: span / 1000, att: .05 });
}
function stepRewind(t){
  const R = rewind, e = t - R.t0;
  for(let i = 0; i < R.list.length; i++){
    const d = R.list[i];
    const p = clamp((e - d.rwd) / R.dur, 0, 1);
    d.th = d.rw0 * (1 - easeInOut(p));
    if(p >= 1 && !d.rwDone){
      d.rwDone = true;
      if(R.ticks++ % 3 === 0 && t - lastPopSnd > 26){
        lastPopSnd = t;
        const q = R.ticks / R.list.length;
        J.sfx.tone({ f: 1500 + q * 900, f2: 1300 + q * 800, type: 'triangle', peak: .03, dec: .025, pan: pan(d.x) });
      }
    }
  }
  if(e >= R.end){
    for(const d of R.list){ d.st = 0; d.fs = 0; d.th = 0; d.om = 0; d.landed = false; d.still = 0; d.cl = false; }
    fallOrder.length = 0; fallen = 0; rewind = null;
    if(R.pushAfter) pendingPush = t + 140;
    J.stat();
  }
}
function clearAll(){
  if(clearing || !D.length) return;
  rewind = null; pendingPush = 0; active.length = 0; runOn = false;
  sWhoosh(); J.buzz(12);
  const sweep = Math.min(320, 120 + D.length);
  for(const d of D){
    d.leaving = true;
    d.ldel = clamp(d.x / Math.max(1, W), 0, 1) * sweep + Math.random() * 40;
    const a = .18 + (Math.random() - .5) * .5;
    d.lvx = Math.cos(a); d.lvy = Math.sin(a);
    d.lspin = (Math.random() - .5) * 1.6;
  }
  clearing = { t0: now, end: sweep + 40 + 460 };
  start = null; pristine = false;
  J.stat();
}
function stepClear(t){
  if(t - clearing.t0 >= clearing.end){
    D = []; hash.clear(); fallOrder.length = 0; active.length = 0; fallen = 0; popPending = 0;
    clearing = null; dirty = true; J.stat();
  }
}

/* ---------- layout ---------- */
function bez(p0, p1, p2, p3, out, n){
  for(let i = 1; i <= n; i++){
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
              u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
}
/* place along a dense polyline at even arc-length spacing ≈ sp */
function resample(poly, skipFirst, trimEnd){
  const cum = [0];
  for(let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = cum[cum.length - 1] - trimEnd;
  const n = Math.max(1, Math.round(L / sp)), step = L / n;
  const at = s => {
    s = clamp(s, 0, cum[cum.length - 1]);
    let lo = 0, hi = cum.length - 1;
    while(hi - lo > 1){ const m = (lo + hi) >> 1; if(cum[m] <= s) lo = m; else hi = m; }
    const f = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return [poly[lo][0] + (poly[hi][0] - poly[lo][0]) * f, poly[lo][1] + (poly[hi][1] - poly[lo][1]) * f];
  };
  const out = [];
  for(let i = skipFirst ? 1 : 0; i <= n; i++){
    const s = i * step, p = at(s), a = at(s - 2), b = at(s + 2);
    let ux = b[0] - a[0], uy = b[1] - a[1]; const l = Math.hypot(ux, uy) || 1;
    out.push([p[0], p[1], ux / l, uy / l]);
  }
  return out;
}
function layDemo(animated){
  D = []; hash.clear(); fallOrder.length = 0; active.length = 0; fallen = 0; popPending = 0; runOn = false;
  const top = 52, M = 20;
  const desk = W > H * 1.15;
  const r0 = 1.75 * h, pitch = 1.34 * h;
  let C, R, V, a, main = [];
  if(desk){
    const Ha = H - top - M;
    a = Math.min((Ha - 2.8 * sp) / 1.56, W * .19);
    V = [W * .68, top + 1.56 * a + (Ha - 2.8 * sp - 1.56 * a) * .5];
    R = Math.min(Ha * .4, W * .19);
    C = [W * .26, top + Ha * .5 - R * .05];
    const turns = (R - r0) / pitch, fe = Math.PI / 2;
    const N = Math.ceil(turns * 140);
    for(let i = 0; i <= N; i++){ const s = i / N, f = fe + (1 - s) * turns * TAU, r = r0 + s * (R - r0); main.push([C[0] + r * Math.cos(f), C[1] + r * Math.sin(f)]); }
    const P0 = main[main.length - 1];
    const L2 = Math.max(2.4 * sp, (P0[1] - V[1]) + 2 * sp);
    bez(P0, [P0[0] + (V[0] - P0[0]) * .55, P0[1]], [V[0], V[1] + L2], V, main, 160);
  } else {
    const Ha = H - top - M, gap = 3.4 * sp;
    R = Math.min((W - 2 * M) * .44, (Ha - gap) * .3);
    a = Math.min((W - 2 * M) / 1.71 * .8, (Ha - gap - 2 * R) / 1.56);
    const slack = Math.max(0, Ha - gap - 2 * R - 1.56 * a);
    V = [W * .5, top + slack * .35 + 1.56 * a];
    C = [W * .5 + R * .06, V[1] + gap + R + slack * .3];
    const turns = (R - r0) / pitch, fe = Math.PI;
    const N = Math.ceil(turns * 140);
    for(let i = 0; i <= N; i++){ const s = i / N, f = fe - (1 - s) * turns * TAU, r = r0 + s * (R - r0); main.push([C[0] + r * Math.cos(f), C[1] + r * Math.sin(f)]); }
    const P0 = main[main.length - 1];
    bez(P0, [P0[0] - R * .05, P0[1] - (P0[1] - V[1]) * .62], [V[0], V[1] + gap * .62], V, main, 160);
  }
  const s2 = Math.SQRT1_2;
  const Tv = [V[0], V[1] - a * Math.SQRT2];
  const half = side => {
    const poly = [V.slice()];
    const Ev = [V[0] + side * a * s2, V[1] - a * s2];
    for(let i = 1; i <= 40; i++) poly.push([V[0] + (Ev[0] - V[0]) * i / 40, V[1] + (Ev[1] - V[1]) * i / 40]);
    const Mc = [(Ev[0] + Tv[0]) / 2, (Ev[1] + Tv[1]) / 2];
    const f0 = side > 0 ? Math.PI / 4 : 3 * Math.PI / 4;
    for(let i = 1; i <= 120; i++){ const f = f0 - side * Math.PI * i / 120; poly.push([Mc[0] + a / 2 * Math.cos(f), Mc[1] + a / 2 * Math.sin(f)]); }
    return resample(poly, true, sp);
  };
  const born0 = animated ? now + 60 : -1e9;
  const pts = resample(main, false, 0), right = half(1), left = half(-1);
  const total = pts.length + right.length + left.length + 1;
  const gapT = animated ? Math.min(5, 1100 / total) : 0;
  const seed = 0.12;
  let idx = 0;
  const first = mk(pts[0][0], pts[0][1], pts[0][2], pts[0][3], colorAt(seed, 0), born0);
  for(let i = 1; i < pts.length; i++){ idx = i; mk(pts[i][0], pts[i][1], pts[i][2], pts[i][3], colorAt(seed, i), born0 + i * gapT); }
  const base = pts.length;
  for(let j = 0; j < right.length; j++){
    mk(right[j][0], right[j][1], right[j][2], right[j][3], colorAt(seed, base + j), born0 + (base + j) * gapT);
    mk(left[j][0], left[j][1], left[j][2], left[j][3], colorAt(seed, base + j), born0 + (base + j) * gapT);
  }
  mk(Tv[0], Tv[1], 0, 1, colorAt(seed, base + right.length), born0 + (base + right.length) * gapT);
  start = { d: first, sign: 1 };
  pristine = !animated;
  lineSeed = seed + .37;
  if(animated){ animUntil = born0 + total * gapT + 400; J.sfx.noise({ type: 'lowpass', freq: 900, peak: .05, dec: .2 }); }
  dirty = true; J.stat();
}

/* ---------- table ---------- */
function drawTable(){
  bgc = document.createElement('canvas');
  bgc.width = Math.max(1, Math.round(W * k)); bgc.height = Math.max(1, Math.round(H * k));
  const g = bgc.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
  const r = rng(20261017);
  g.fillStyle = '#4b301f'; g.fillRect(0, 0, W, H);
  const ph = clamp(H / 4.6, 74, 140);
  for(let y0 = -r() * ph * .6, row = 0; y0 < H; y0 += ph, row++){
    // a plank row may be split into two boards
    const cut = W * (.25 + r() * .6);
    for(let part = 0; part < 2; part++){
      const xa = part ? cut : 0, xb = part ? W : cut;
      const L = 24 + r() * 7, sat = 36 + r() * 8;
      g.fillStyle = 'hsl(' + (20 + r() * 6).toFixed(1) + ',' + sat.toFixed(0) + '%,' + L.toFixed(1) + '%)';
      g.fillRect(xa, y0, xb - xa, ph);
      g.save(); g.beginPath(); g.rect(xa, y0, xb - xa, ph); g.clip();
      const phase = r() * 100, fr = .004 + r() * .004;
      for(let i = 0; i < 34; i++){
        const yy = y0 + r() * ph, amp = 1.5 + r() * 5, lw = .5 + r() * 1.6, dark = r() < .65;
        g.strokeStyle = dark ? 'rgba(30,14,6,' + (.05 + r() * .12).toFixed(3) + ')' : 'rgba(255,214,170,' + (.025 + r() * .05).toFixed(3) + ')';
        g.lineWidth = lw; g.beginPath();
        for(let x = xa - 10; x <= xb + 20; x += 18){
          const yv = yy + Math.sin(x * fr + phase + i * .37) * amp + Math.sin(x * fr * 3.1 + i) * amp * .25;
          if(x === xa - 10) g.moveTo(x, yv); else g.lineTo(x, yv);
        }
        g.stroke();
      }
      if(r() < .5){
        const kx = xa + (xb - xa) * (.2 + r() * .6), ky = y0 + ph * (.3 + r() * .4), kr = 4 + r() * 6;
        for(let j = 5; j >= 1; j--){
          g.strokeStyle = 'rgba(28,12,5,' + (.06 + j * .03).toFixed(3) + ')'; g.lineWidth = 1;
          g.beginPath(); g.ellipse(kx, ky, kr * j * .9 + 6, kr * j * .32 + 1.5, 0, 0, TAU); g.stroke();
        }
        g.fillStyle = 'rgba(30,12,4,.45)'; g.beginPath(); g.ellipse(kx, ky, kr, kr * .42, 0, 0, TAU); g.fill();
      }
      g.restore();
      if(part){ g.fillStyle = 'rgba(10,4,1,.55)'; g.fillRect(cut - .6, y0, 1.4, ph); g.fillStyle = 'rgba(255,220,180,.05)'; g.fillRect(cut + .8, y0, 1, ph); }
    }
    g.fillStyle = 'rgba(8,3,1,.6)'; g.fillRect(0, y0 - .7, W, 1.6);
    g.fillStyle = 'rgba(255,220,180,.06)'; g.fillRect(0, y0 + .9, W, 1);
  }
  // lamp pool
  const px = W * .32, py = H * .28, R = Math.max(W, H) * .95;
  let lg = g.createRadialGradient(px, py, 0, px, py, R);
  lg.addColorStop(0, 'rgba(255,196,128,.24)'); lg.addColorStop(.35, 'rgba(255,170,100,.1)'); lg.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  lg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.hypot(W, H) * .62);
  lg.addColorStop(0, 'rgba(6,3,2,0)'); lg.addColorStop(1, 'rgba(6,3,2,.62)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
}

/* ---------- render ---------- */
function quad(c, x1, y1, x2, y2, x3, y3, x4, y4){
  const ar = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  if(ar >= 0){ c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4); }
  else { c.moveTo(x4, y4); c.lineTo(x3, y3); c.lineTo(x2, y2); c.lineTo(x1, y1); }
  c.closePath();
}
function popS(d, t){
  if(t >= d.born + 240) return 1;
  if(t < d.born) return 0;
  return easeOutBack((t - d.born) / 240);
}
const PIPS = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]]];
let LO = { ox: 0, oy: 0, al: 1, rot: 0 };
function leaveT(d, t){
  LO.ox = 0; LO.oy = 0; LO.al = 1; LO.rot = 0;
  if(!d.leaving) return 0;
  const q = clamp((t - clearing.t0 - d.ldel) / 460, 0, 1);
  const e = q * q, dist = Math.max(W, H) * .32 * e;
  LO.ox = d.lvx * dist; LO.oy = d.lvy * dist; LO.al = 1 - q; LO.rot = d.lspin * e;
  return q;
}
function dirOf(d){
  let ux = d.ux, uy = d.uy;
  if(LO.rot){ const c = Math.cos(LO.rot), s = Math.sin(LO.rot); const nx = ux * c - uy * s; uy = ux * s + uy * c; ux = nx; }
  return [ux, uy];
}
function shadowOf(d, t){
  const s = popS(d, t); if(s <= 0) return;
  const q = leaveT(d, t); if(q > .02) return;
  const [ux, uy] = dirOf(d);
  const sg = d.st === 0 ? 1 : d.fs;
  const dx = ux * sg, dy = uy * sg, vx = -dy, vy = dx;
  const hh = h * s, ww = w * s * .5, tt = th * s;
  const x = d.x + LO.ox, y = d.y + LO.oy;
  const sn = Math.sin(d.th), cn = Math.cos(d.th);
  const px = x + dx * tt * .5, py = y + dy * tt * .5;
  const along = hh * sn - tt * .5 * cn, z = hh * cn + tt * .5 * sn;
  const c1x = px + dx * along + d.svx * z, c1y = py + dy * along + d.svy * z;
  const ax = vx * ww, ay = vy * ww;
  quad(shx, x + ax, y + ay, x - ax, y - ay, c1x - ax, c1y - ay, c1x + ax, c1y + ay);
  const bx = dx * tt * .5, by = dy * tt * .5;
  quad(shx, x - bx + ax, y - by + ay, x - bx - ax, y - by - ay, x + bx + dx * hh * sn - ax, y + by + dy * hh * sn - ay, x + bx + dx * hh * sn + ax, y + by + dy * hh * sn + ay);
}
function drawStanding(d, t){
  const s = popS(d, t); if(s <= 0) return;
  leaveT(d, t);
  const [ux, uy] = dirOf(d);
  const vx = -uy, vy = ux;
  const x = d.x + LO.ox, y = d.y + LO.oy, ax = vx * w * .5 * s, ay = vy * w * .5 * s, bx = ux * th * .5 * s, by = uy * th * .5 * s;
  if(LO.al < 1) ctx.globalAlpha = LO.al;
  ctx.beginPath();
  ctx.moveTo(x - bx - ax, y - by - ay); ctx.lineTo(x + bx - ax, y + by - ay); ctx.lineTo(x + bx + ax, y + by + ay); ctx.lineTo(x - bx + ax, y - by + ay); ctx.closePath();
  ctx.fillStyle = d.pal[lvl(.42 + .72 * d.lz)];
  ctx.fill(); ctx.stroke();
  // lit edge facing the lamp
  const side = (bx * d.lx + by * d.ly) < 0 ? -1 : 1;
  ctx.beginPath(); ctx.moveTo(x + side * bx * .55 - ax * .82, y + side * by * .55 - ay * .82); ctx.lineTo(x + side * bx * .55 + ax * .82, y + side * by * .55 + ay * .82);
  ctx.strokeStyle = 'rgba(255,250,236,.55)'; ctx.lineWidth = Math.max(.6, th * .22); ctx.stroke();
  ctx.strokeStyle = 'rgba(46,24,12,.55)'; ctx.lineWidth = .7;
  if(LO.al < 1) ctx.globalAlpha = 1;
}
function drawFalling(d, t){
  leaveT(d, t);
  const [ux, uy] = dirOf(d);
  const dx = ux * d.fs, dy = uy * d.fs, vx = -dy, vy = dx;
  const x = d.x + LO.ox, y = d.y + LO.oy;
  const sn = Math.sin(d.th), cn = Math.cos(d.th);
  const ax = vx * w * .5, ay = vy * w * .5;
  const px = x + dx * th * .5, py = y + dy * th * .5;
  const b0x = px - dx * th * cn, b0y = py - dy * th * cn;
  const t0x = px + dx * (h * sn - th * cn), t0y = py + dy * (h * sn - th * cn);
  const t1x = px + dx * h * sn, t1y = py + dy * h * sn;
  const dl = dx * d.lx + dy * d.ly;
  if(LO.al < 1) ctx.globalAlpha = LO.al;
  if(sn > .02){
    ctx.beginPath();
    ctx.moveTo(b0x - ax, b0y - ay); ctx.lineTo(b0x + ax, b0y + ay); ctx.lineTo(t0x + ax, t0y + ay); ctx.lineTo(t0x - ax, t0y - ay); ctx.closePath();
    ctx.fillStyle = d.pal[lvl(.42 + .72 * Math.max(0, -cn * dl + sn * d.lz))];
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(t0x - ax, t0y - ay); ctx.lineTo(t0x + ax, t0y + ay); ctx.lineTo(t1x + ax, t1y + ay); ctx.lineTo(t1x - ax, t1y - ay); ctx.closePath();
  ctx.fillStyle = d.pal[lvl(.42 + .72 * Math.max(0, sn * dl + cn * d.lz))];
  ctx.fill();
  if(sn > .3){
    const L = h * sn, al = clamp((sn - .3) / .45, 0, 1);
    ctx.globalAlpha = al * LO.al;
    // divider + spinner
    const mx = b0x + dx * L * .5, my = b0y + dy * L * .5;
    ctx.beginPath(); ctx.moveTo(mx - ax * .78, my - ay * .78); ctx.lineTo(mx + ax * .78, my + ay * .78);
    ctx.strokeStyle = 'rgba(70,44,30,.5)'; ctx.lineWidth = Math.max(.6, w * .06); ctx.stroke();
    ctx.fillStyle = 'rgba(58,36,24,.88)';
    ctx.beginPath();
    const ang = Math.atan2(dy, dx), rv = w * .075, ru = rv * sn;
    for(let half = 0; half < 2; half++){
      const pv = PIPS[half ? d.pv1 : d.pv0];
      const cx = b0x + dx * L * (half ? .75 : .25), cy = b0y + dy * L * (half ? .75 : .25);
      for(let j = 0; j < pv.length; j++){
        const qa = pv[j][0] * L * .5 * .27, qb = pv[j][1] * w * .27;
        const ex = cx + dx * qa + vx * qb, ey = cy + dy * qa + vy * qb;
        ctx.moveTo(ex + dx * ru, ey + dy * ru);
        ctx.ellipse(ex, ey, ru, rv, ang, 0, TAU);
      }
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(214,170,96,.9)';
    ctx.beginPath(); ctx.moveTo(mx + dx * rv * .8 * sn, my + dy * rv * .8 * sn); ctx.ellipse(mx, my, rv * .8 * sn, rv * .8, ang, 0, TAU); ctx.fill();
    ctx.globalAlpha = LO.al;
    ctx.strokeStyle = 'rgba(46,24,12,.55)'; ctx.lineWidth = .7;
  }
  ctx.beginPath();
  ctx.moveTo(b0x - ax, b0y - ay); ctx.lineTo(b0x + ax, b0y + ay); ctx.lineTo(t1x + ax, t1y + ay); ctx.lineTo(t1x - ax, t1y - ay); ctx.closePath();
  ctx.stroke();
  if(LO.al < 1) ctx.globalAlpha = 1;
}
function render(t){
  ctx.globalAlpha = 1;
  if(bgc) ctx.drawImage(bgc, 0, 0, W, H);
  shx.setTransform(1, 0, 0, 1, 0, 0); shx.clearRect(0, 0, shc.width, shc.height);
  shx.setTransform(k * SH, 0, 0, k * SH, 0, 0);
  shx.beginPath();
  for(let i = 0; i < D.length; i++) shadowOf(D[i], t);
  shx.fillStyle = '#000'; shx.fill();
  ctx.globalAlpha = .4; ctx.drawImage(shc, 0, 0, W, H); ctx.globalAlpha = 1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(46,24,12,.55)'; ctx.lineWidth = .7;
  for(let i = 0; i < D.length; i++) if(D[i].st === 0) drawStanding(D[i], t);
  ctx.strokeStyle = 'rgba(46,24,12,.55)'; ctx.lineWidth = .7;
  for(let i = fallOrder.length - 1; i >= 0; i--) drawFalling(fallOrder[i], t);
  for(let i = rings.length - 1; i >= 0; i--){
    const g = rings[i], q = (t - g.t0) / g.dur;
    if(q >= 1){ rings.splice(i, 1); continue; }
    if(q < 0) continue;
    const e = 1 - Math.pow(1 - q, 3);
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r0 + (g.r1 - g.r0) * e, 0, TAU);
    ctx.strokeStyle = 'rgba(255,214,150,' + (g.a * (1 - q)).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

/* ---------- input ---------- */
let drag = null;
function hitDomino(x, y){
  const list = query(x, y, sp);
  let best = null, bd = Math.max(w * .7, 11);
  for(const d of list){ const dd = Math.hypot(d.x - x, d.y - y); if(dd < bd){ bd = dd; best = d; } }
  return best;
}
function isFree(x, y){
  if(x < 6 || y < 6 || x > W - 6 || y > H - 6) return false;
  const list = query(x, y, sp);
  for(const d of list) if(Math.hypot(d.x - x, d.y - y) < sp * .72) return false;
  return true;
}
function placeAt(g, x, y, ux, uy){
  if(liveCount() >= MAX){
    if(!capWarned){ capWarned = true; J.sfx.tone({ f: 220, f2: 180, peak: .08, dec: .12 }); }
    return null;
  }
  const d = mk(x, y, ux, uy, colorAt(g.seed, g.n), now);
  d.popped = true; popPending = Math.max(0, popPending);
  sPlace(x, g.n); if(g.n % 2 === 0) J.buzz(2);
  g.n++; animUntil = Math.max(animUntil, now + 300);
  if(active.length) refreshCands();
  pristine = false;
  J.stat();
  return d;
}
function stepDraw(g, x, y){
  let dx = x - g.ax, dy = y - g.ay, L = Math.hypot(dx, dy);
  let guard = 0;
  while(L >= sp && guard++ < 60){
    const qx = g.ax + dx / L * sp, qy = g.ay + dy / L * sp;
    const ux = dx / L, uy = dy / L;
    if(isFree(qx, qy)){
      const d = placeAt(g, qx, qy, ux, uy);
      if(d){
        if(g.prev){
          if(g.pp){ let ex = qx - g.pp[0], ey = qy - g.pp[1]; const l = Math.hypot(ex, ey) || 1; g.prev.ux = ex / l; g.prev.uy = ey / l; }
          else if(g.prevLone){ g.prev.ux = ux; g.prev.uy = uy; }
        }
        g.pp = g.prev ? [g.prev.x, g.prev.y] : [g.ax, g.ay];
        g.prev = d; g.prevLone = false;
        if(!g.first){ g.first = d; if(g.nb && Math.hypot(g.nb.x - d.x, g.nb.y - d.y) < sp * 2.4) link(g.nb, d); }
        g.count++;
      }
    } else { g.prev = null; g.pp = null; }
    g.ax = qx; g.ay = qy;
    dx = x - g.ax; dy = y - g.ay; L = Math.hypot(dx, dy);
  }
}

J.register({
  id: 'domino', name: '多米诺', hint: '画一条线摆骨牌，点第一块推倒',
  create(root){
    const c = J.canvas(root);
    cv = c.cv; ctx = c.ctx; this._c = c;
    shc = document.createElement('canvas'); shx = shc.getContext('2d');
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); J.ac();
      if(drag) return;
      try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      const [x, y] = J.local(e, cv);
      if(clearing || rewind) return;
      const hit = hitDomino(x, y);
      let nb = hit;
      if(!nb){ const list = query(x, y, sp * 1.6); let bd = sp * 1.6; for(const d of list){ const dd = Math.hypot(d.x - x, d.y - y); if(dd < bd){ bd = dd; nb = d; } } }
      drag = { nb, id: e.pointerId, sx: x, sy: y, ax: hit ? hit.x : x, ay: hit ? hit.y : y, moved: false, hit,
               seed: lineSeed, n: 0, count: 0, prev: null, pp: null, prevLone: false, first: null };
      lineSeed = (lineSeed + .23 + Math.random() * .1) % 1;
      if(!hit && isFree(x, y)){
        const d = placeAt(drag, x, y, 1, 0);
        if(d){ drag.prev = d; drag.prevLone = true; drag.first = d; drag.count = 1; }
      }
      dirty = true;
    });
    const mv = e => {
      if(!drag || e.pointerId !== drag.id) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const list = evs && evs.length ? evs : [e];
      for(const ev of list){
        const [x, y] = J.local(ev, cv);
        if(!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 7) drag.moved = true;
        if(drag.moved || !drag.hit) stepDraw(drag, x, y);
      }
      dirty = true;
    };
    cv.addEventListener('pointermove', mv);
    const up = e => {
      if(!drag || e.pointerId !== drag.id) return;
      const g = drag; drag = null;
      if(!g.moved && g.hit && g.hit.st === 0 && !g.hit.leaving){
        const d = g.hit, dd = (g.sx - d.x) * d.ux + (g.sy - d.y) * d.uy;
        push(d, Math.abs(dd) > th * .5 ? (dd > 0 ? -1 : 1) : 1);
      } else if(g.count >= 2 && g.first && !g.first.leaving){
        start = { d: g.first, sign: 1 };
      }
      dirty = true; J.stat();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  },
  resize(W2, H2){
    const oldW = W, oldH = H;
    W = W2; H = H2;
    this._c.fit(W, H); k = this._c.k;
    shc.width = Math.max(1, Math.ceil(W * k * SH)); shc.height = Math.max(1, Math.ceil(H * k * SH));
    LX = W * .3; LY = -H * .25; LH = (W + H) * 1.25;
    drawTable();
    const firstTime = !oldW;
    if(firstTime || pristine || !D.length){
      h = clamp(Math.min(W, H) * .048, 20, 32); w = h * .5; th = h * .18; sp = h * .6; cs = h;
      if(firstTime || pristine) layDemo(false);
    } else {
      for(const d of D){ const dx = LX - d.x, dy = LY - d.y, dl = Math.hypot(dx, dy, LH); d.lx = dx / dl; d.ly = dy / dl; d.lz = LH / dl; d.svx = (d.x - LX) / LH; d.svy = (d.y - LY) / LH; }
    }
    dirty = true;
  },
  enter(){ dirty = true; },
  tick(t, dt){
    now = t;
    if(pendingPush && t >= pendingPush){ pendingPush = 0; pushStart(); }
    if(rewind) stepRewind(t);
    if(active.length) physics(dt);
    if(popPending > 0){
      for(const d of D) if(!d.popped && d.born <= t){
        d.popped = true; popPending--;
        if(t - lastPopSnd > 30){ lastPopSnd = t; sPlace(d.x, 8); }
      }
    }
    if(clearing) stepClear(t);
    if(dirty || active.length || rewind || clearing || t < animUntil || rings.length || drag){ render(t); dirty = false; }
  },
  key(e){ if(e.code === 'Space'){ pushStart(); return true; } },
  actions: [
    { label: '推倒', run(){ pushStart(); } },
    { label: '清空重摆', run(){ clearAll(); } }
  ],
  stat(){ return '摆了 <b>' + J.fmt(liveCount()) + '</b> 块 · 倒了 <b>' + J.fmt(clearing ? 0 : fallen) + '</b> 块'; }
});
})();

