// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== ripple ===== */
/* 水波琴 — a dark pool you play like a kalimba. Damped 2D wave equation, software-shaded at low res and scaled up. */
(() => {
const TAU = Math.PI * 2;
const RM = (() => { try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();

/* ---------- music ---------- */
const SCALES = [
  { label: '五声', st: [0, 2, 4, 7, 9] },        // D major pentatonic
  { label: '日式', st: [0, 1, 5, 7, 8] },        // In (Miyako-bushi)
  { label: '大调', st: [0, 2, 4, 5, 7, 9, 11] }  // D major
];
const ROOT = 293.66; // D4
let mood = (+J.store.get('ripple-mood', 0) || 0) % SCALES.length;
let notes = [];
function buildNotes(){
  notes = [];
  const st = SCALES[mood].st;
  for(let o = 0; o < 2; o++) for(const s of st) notes.push(ROOT * Math.pow(2, o + s / 12));
  notes.push(ROOT * 4);
}
buildNotes();

/* pitch → light colour: teal (low) → periwinkle → lilac → rose → amber (high) */
const PAL = [[110, 225, 214], [140, 186, 255], [196, 160, 255], [255, 162, 196], [255, 200, 128]];
function pitchCol(t){
  t = Math.max(0, Math.min(1, t)) * (PAL.length - 1);
  const i = Math.min(PAL.length - 2, Math.floor(t)), f = t - i, a = PAL[i], b = PAL[i + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

/* soft bell / kalimba voice */
const voiceEnds = [];
function bell(f, bright, warm, pan, vel, delay = 0){
  if(J.muted) return;
  const a = J.ac(); if(!a) return;
  const t = a.currentTime + 0.005 + delay;
  for(let i = voiceEnds.length - 1; i >= 0; i--) if(voiceEnds[i] < t) voiceEnds.splice(i, 1);
  if(voiceEnds.length >= 18) return;
  vel *= 1 / Math.sqrt(1 + voiceEnds.length * 0.22);
  const out = a.createGain(); out.gain.value = vel;
  let node = out;
  if(a.createStereoPanner){ const p = a.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); node = p; }
  node.connect(J.master);
  const r = J.reverb();
  if(r){ const s = a.createGain(); s.gain.value = 0.5; node.connect(s).connect(r); }
  const dec0 = 3.2 * Math.pow(ROOT / f, 0.35);
  const parts = [
    [1, 1, dec0, 0.006],
    [1.0035, 0.28, dec0 * 0.8, 0.008],           // slow beating shimmer
    [2, 0.16 + 0.1 * bright, 0.9, 0.003],
    [2.76, 0.10 * bright, 0.38, 0.002],
    [5.4, 0.045 * bright, 0.13, 0.0015]
  ];
  if(warm > 0.05) parts.push([0.5, 0.22 * warm, dec0 * 0.9, 0.012]);
  let end = 0;
  for(const [ratio, amp, dec, att] of parts){
    const fr = f * ratio;
    if(fr > 7500 || amp < 0.004) continue;
    const o = a.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(fr, t);
    const g = a.createGain(); J.env(g, t, amp, dec, att);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + att + dec + 0.08);
    end = Math.max(end, t + att + dec);
  }
  voiceEnds.push(end);
}

/* ---------- state ---------- */
let cv, ctx, view, W = 0, H = 0;
let gw = 0, gh = 0, cellX = 7, cellY = 7;
let A, B, D, GX, GY, LP;                 // height now / previous, damping, gradient + laplacian
let rw = 0, rh = 0, off, octx, img, px;  // render buffer (2× grid)
let FR, FG, FB, ER, EG, EB;              // floor texture and lamp-reflection map (render res)
let bx0, bx1, bwx, by0, by1, bwy;        // bilinear lookup tables
let simAcc = 0;
let total = +J.store.get('ripple-notes', 0) || 0;
let auto = false, autoT = 0, autoNext = 600, walk = 4;
let idleT = 0, idleNext = 4000;
const rings = [];
const glowCache = {};
let lastDragCell = -1, lastDragNote = 0;
const ptr = { id: null, x: 0, y: 0 };

function hash(i, j, k){
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- build grid + textures ---------- */
function build(){
  gw = clamp(Math.round(W / 7), 24, 160);
  gh = clamp(Math.round(H / 7), 24, 100);
  cellX = W / gw; cellY = H / gh;
  const n = gw * gh;
  A = new Float32Array(n); B = new Float32Array(n); D = new Float32Array(n);
  GX = new Float32Array(n); GY = new Float32Array(n); LP = new Float32Array(n);
  for(let y = 0; y < gh; y++) for(let x = 0; x < gw; x++){
    const e = Math.min(x, y, gw - 1 - x, gh - 1 - y);
    D[y * gw + x] = e < 5 ? 0.986 - (5 - e) * 0.018 : 0.988;
  }
  rw = gw * 2; rh = gh * 2;
  off.width = rw; off.height = rh;
  img = octx.createImageData(rw, rh); px = img.data;
  for(let i = 3; i < px.length; i += 4) px[i] = 255;
  bx0 = new Int32Array(rw); bx1 = new Int32Array(rw); bwx = new Float32Array(rw);
  by0 = new Int32Array(rh); by1 = new Int32Array(rh); bwy = new Float32Array(rh);
  for(let x = 0; x < rw; x++){ const u = clamp((x + 0.5) / 2 - 0.5, 0, gw - 1); bx0[x] = Math.floor(u); bx1[x] = Math.min(gw - 1, bx0[x] + 1); bwx[x] = u - bx0[x]; }
  for(let y = 0; y < rh; y++){ const v = clamp((y + 0.5) / 2 - 0.5, 0, gh - 1); by0[y] = Math.floor(v) * gw; by1[y] = Math.min(gh - 1, Math.floor(v) + 1) * gw; bwy[y] = v - Math.floor(v); }
  buildFloor();
}

function buildFloor(){
  const n = rw * rh;
  FR = new Float32Array(n); FG = new Float32Array(n); FB = new Float32Array(n);
  ER = new Float32Array(n); EG = new Float32Array(n); EB = new Float32Array(n);
  const sp = Math.max(6.5, rw / 26);                                       // pebble spacing (render px)
  const nx = Math.ceil(rw / sp) + 3, ny = Math.ceil(rh / sp) + 3;
  const PX = new Float32Array(nx * ny), PY = new Float32Array(nx * ny);
  for(let j = 0; j < ny; j++) for(let i = 0; i < nx; i++){
    PX[j * nx + i] = (i - 1 + 0.12 + 0.76 * hash(i, j, 1)) * sp;
    PY[j * nx + i] = (j - 1 + 0.12 + 0.76 * hash(i, j, 2)) * sp;
  }
  const lx = 0.74 * rw, ly = 0.2 * rh, diag = Math.hypot(rw, rh);
  for(let y = 0; y < rh; y++){
    const cj = Math.floor(y / sp) + 1;
    for(let x = 0; x < rw; x++){
      const ci = Math.floor(x / sp) + 1;
      let d1 = 1e9, d2 = 1e9, id = 0;
      for(let j = cj - 1; j <= cj + 1; j++){
        if(j < 0 || j >= ny) continue;
        for(let i = ci - 1; i <= ci + 1; i++){
          if(i < 0 || i >= nx) continue;
          const k = j * nx + i, dx = x - PX[k], dy = (y - PY[k]) * 1.15, d = dx * dx + dy * dy;
          if(d < d1){ d2 = d1; d1 = d; id = k; } else if(d < d2) d2 = d;
        }
      }
      d1 = Math.sqrt(d1); d2 = Math.sqrt(d2);
      const edge = d2 - d1;
      const seam = clamp(edge / 2.2, 0, 1);
      const seamS = seam * seam * (3 - 2 * seam);
      const r1 = hash(id, 7, 3), r2 = hash(id, 9, 4);
      const dome = 1 - 0.3 * clamp(d1 / (sp * 0.8), 0, 1) ** 2;
      const lum = (0.8 + 0.2 * r1) * dome * (0.74 + 0.26 * seamS);
      // stone hue: indigo ↔ teal, the odd warm sandy one
      let sr = 30 + 6 * r2, sg = 54 + 18 * r2, sb = 86 - 4 * r2;
      if(r1 > 0.94){ sr = 50; sg = 56; sb = 70; }
      // lamp pool on the floor + vignette
      const dxl = (x - lx) / rw, dyl = (y - ly) / rh;
      const pool = Math.exp(-(dxl * dxl * 3.2 + dyl * dyl * 2.4) * 2.2);
      const cx = (x - rw / 2) / (rw / 2), cy = (y - rh / 2) / (rh / 2);
      const vig = clamp(1 - 0.38 * (cx * cx + cy * cy), 0.2, 1);
      const lit = (0.38 + 0.7 * pool) * vig;
      const i = y * rw + x;
      FR[i] = 6 + sr * lum * lit * (0.85 + 0.45 * pool);
      FG[i] = 12 + sg * lum * lit * (0.95 + 0.12 * pool);
      FB[i] = 26 + sb * lum * lit * (1.0 - 0.12 * pool);
      // lamp reflection on the surface (sampled with distortion)
      const ex = (x - lx) / rw, ey = (y - ly) / rh;
      const blob = Math.exp(-(ex * ex / 0.010 + ey * ey / 0.0042));
      const core = Math.exp(-(ex * ex / 0.0016 + ey * ey / 0.0007));
      const sheen = Math.pow(1 - y / rh, 3) * (0.6 + 0.4 * Math.exp(-ex * ex * 6));
      ER[i] = 120 * blob + 95 * core + 9 * sheen;
      EG[i] = 74 * blob + 70 * core + 14 * sheen;
      EB[i] = 30 * blob + 40 * core + 26 * sheen;
      void diag;
    }
  }
}

/* ---------- simulation ---------- */
function drop(cx, cy, amp, rad){
  const gx = cx / cellX, gy = cy / cellY, r = Math.max(1.2, rad);
  const x0 = Math.max(1, Math.floor(gx - r)), x1 = Math.min(gw - 2, Math.ceil(gx + r));
  const y0 = Math.max(1, Math.floor(gy - r)), y1 = Math.min(gh - 2, Math.ceil(gy + r));
  for(let y = y0; y <= y1; y++) for(let x = x0; x <= x1; x++){
    const d = Math.hypot(x - gx, y - gy);
    if(d < r) A[y * gw + x] -= amp * 0.5 * (1 + Math.cos(Math.PI * d / r));
  }
}
const drips = [];
function drip(cx, cy, amp){
  if(drips.length > 24) drips.shift();
  drips.push({ gx: cx / cellX, gy: cy / cellY, amp, ph: 0, n: 0 });
}
function step(){
  const w = gw;
  for(let k = drips.length - 1; k >= 0; k--){
    const d = drips[k];
    d.n++; d.ph += 1.0;
    const env = Math.exp(-d.n / 6);
    const xi = Math.round(d.gx), yi = Math.round(d.gy);
    if(xi > 1 && yi > 1 && xi < gw - 2 && yi < gh - 2){
      const v = Math.sin(d.ph) * d.amp * env * 0.55, i = yi * w + xi;
      A[i] += v; A[i - 1] += v * 0.5; A[i + 1] += v * 0.5; A[i - w] += v * 0.5; A[i + w] += v * 0.5;
    }
    if(d.n > 26) drips.splice(k, 1);
  }
  for(let y = 1; y < gh - 1; y++){
    let i = y * w + 1;
    for(let x = 1; x < w - 1; x++, i++){
      const v = (A[i - 1] + A[i + 1] + A[i - w] + A[i + w]) * 0.5 - B[i];
      B[i] = v * D[i];
    }
  }
  const t = A; A = B; B = t;
}

/* ---------- render ---------- */
function render(){
  const w = gw;
  for(let y = 1; y < gh - 1; y++){
    let i = y * w + 1;
    for(let x = 1; x < w - 1; x++, i++){
      const l = A[i - 1], r = A[i + 1], u = A[i - w], d = A[i + w];
      GX[i] = r - l; GY[i] = d - u; LP[i] = l + r + u + d - 4 * A[i];
    }
  }
  const REF = 9, ENV = 26, LX = -0.62, LY = -0.78;
  let p = 0;
  for(let y = 0; y < rh; y++){
    const r0 = by0[y], r1 = by1[y], wy = bwy[y], iwy = 1 - wy;
    for(let x = 0; x < rw; x++, p += 4){
      const c0 = bx0[x], c1 = bx1[x], wx = bwx[x], iwx = 1 - wx;
      const a = r0 + c0, b = r0 + c1, c = r1 + c0, e = r1 + c1;
      const gx = (GX[a] * iwx + GX[b] * wx) * iwy + (GX[c] * iwx + GX[e] * wx) * wy;
      const gy = (GY[a] * iwx + GY[b] * wx) * iwy + (GY[c] * iwx + GY[e] * wx) * wy;
      const lp = (LP[a] * iwx + LP[b] * wx) * iwy + (LP[c] * iwx + LP[e] * wx) * wy;
      // refraction of the floor
      let sx = (x + gx * REF) | 0, sy = (y + gy * REF) | 0;
      sx = sx < 0 ? 0 : sx >= rw ? rw - 1 : sx; sy = sy < 0 ? 0 : sy >= rh ? rh - 1 : sy;
      const fi = sy * rw + sx;
      const tilt = gx * LX + gy * LY;
      let caus = 1 - lp * 2.4 + tilt * 1.2;
      caus = caus < 0.55 ? 0.55 : caus > 1.9 ? 1.9 : caus;
      // reflection of the lamp
      let ex = (x - gx * ENV) | 0, ey = (y - gy * ENV) | 0;
      ex = ex < 0 ? 0 : ex >= rw ? rw - 1 : ex; ey = ey < 0 ? 0 : ey >= rh ? rh - 1 : ey;
      const ei = ey * rw + ex;
      // warm glint where the slope faces the lamp
      let s = tilt - 0.03;
      s = s > 0 ? s * s * 1300 : 0;
      if(s > 140) s = 140;
      // cool sheen / shade from the slope (reads the ripple shape)
      let sh = tilt * 260 - gx * 40;
      sh = sh > 60 ? 60 : sh < -26 ? -26 : sh;
      px[p] = FR[fi] * caus + ER[ei] + s * 1.0 + sh * 0.45;
      px[p + 1] = FG[fi] * caus + EG[ei] + s * 0.72 + sh * 0.8;
      px[p + 2] = FB[fi] * caus + EB[ei] + s * 0.42 + sh * 1.0;
    }
  }
  octx.putImageData(img, 0, 0);
}

function glowSprite(ci){
  if(glowCache[ci]) return glowCache[ci];
  const [r, g, b] = pitchCol(ci / 100);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(255,250,240,.9)`);
  gr.addColorStop(0.18, `rgba(${r},${g},${b},.55)`);
  gr.addColorStop(0.5, `rgba(${r},${g},${b},.14)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (glowCache[ci] = c);
}

/* ---------- playing ---------- */
const cellOf = x => clamp(Math.floor(x / W * notes.length), 0, notes.length - 1);
function play(x, y, vel, now){
  const idx = cellOf(x);
  const fy = clamp(y / H, 0, 1);
  const f = notes[idx] * (1 + (Math.random() - 0.5) * 0.004);
  bell(f, 1.25 - 0.95 * fy, clamp((fy - 0.6) / 0.4, 0, 1), (x / W - 0.5) * 0.8, 0.2 * vel);
  const t = notes.length > 1 ? idx / (notes.length - 1) : 0.5;
  if(rings.length > 48) rings.shift();
  const col = pitchCol(t);
  rings.push({ x, y, t0: now, vel, r: col[0], g: col[1], b: col[2], ci: Math.round(t * 100) });
  total++;
  if(total % 5 === 0) J.store.set('ripple-notes', total);
  J.stat();
}
function tapAt(x, y, vel = 1, now = performance.now()){
  drop(x, y, 0.8 * vel, 2.2);
  drip(x, y, 0.9 * vel);
  play(x, y, vel, now);
}

/* ---------- pointer ---------- */
function onDown(e){
  e.preventDefault();
  J.ac();
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  const [x, y] = J.local(e, cv);
  ptr.id = e.pointerId; ptr.x = x; ptr.y = y;
  tapAt(x, y, 1);
  J.buzz(6);
  lastDragCell = cellOf(x); lastDragNote = performance.now();
}
function onMove(e){
  if(ptr.id !== e.pointerId) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  const list = evs && evs.length ? evs : [e];
  const now = performance.now();
  for(const ev of list){
    const [x, y] = J.local(ev, cv);
    const dx = x - ptr.x, dy = y - ptr.y, dist = Math.hypot(dx, dy);
    const stepPx = Math.max(cellX, cellY) * 1.3;
    if(dist < stepPx) continue;
    const n = Math.min(12, Math.floor(dist / stepPx));
    for(let k = 1; k <= n; k++) drop(ptr.x + dx * k / n, ptr.y + dy * k / n, 0.32, 1.7);
    ptr.x = x; ptr.y = y;
    const c = cellOf(x);
    if(c !== lastDragCell && now - lastDragNote > 95){
      lastDragCell = c; lastDragNote = now;
      drop(x, y, 0.4, 2); drip(x, y, 0.45);
      play(x, y, 0.75, now);
    }
  }
}
function onUp(e){ if(ptr.id === e.pointerId) ptr.id = null; }

function randomDrop(vel = 1){
  const x = W * (0.08 + Math.random() * 0.84), y = H * (0.14 + Math.random() * 0.78);
  tapAt(x, y, vel);
}
function rainDrop(now){
  const n = notes.length;
  const r = Math.random();
  walk += r < 0.3 ? -1 : r < 0.6 ? 1 : r < 0.72 ? -2 : r < 0.84 ? 2 : r < 0.92 ? 0 : (Math.random() < 0.5 ? -3 : 3);
  if(walk < 0) walk = 1; if(walk > n - 1) walk = n - 2;
  const x = (walk + 0.2 + Math.random() * 0.6) / n * W;
  const y = H * (0.14 + Math.random() * 0.8);
  drop(x, y, 0.6, 2.1); drip(x, y, 0.7);
  play(x, y, 0.62, now);
  if(Math.random() < 0.16){
    const h = clamp(walk + (Math.random() < 0.5 ? 2 : -2), 0, n - 1);
    const x2 = (h + 0.5) / n * W, y2 = H * (0.14 + Math.random() * 0.8);
    drop(x2, y2, 0.6, 2);
    play(x2, y2, 0.42, now);
  }
}

/* ---------- toy ---------- */
J.register({
  id: 'ripple', name: '水波琴', hint: '点一点水面，怎么点都好听',
  create(root){
    view = J.canvas(root, { dprMax: 2 });
    cv = view.cv; ctx = view.ctx;
    cv.style.cursor = 'pointer';
    off = document.createElement('canvas');
    octx = off.getContext('2d');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
  },
  resize(w, h){
    W = w; H = h;
    view.fit(w, h);
    build();
    // a few ripples already spreading so the first frame reads as water
    drop(W * 0.3, H * 0.62, 1.1, 2.6);
    for(let i = 0; i < 34; i++) step();
    drop(W * 0.66, H * 0.4, 1.0, 2.6);
    for(let i = 0; i < 16; i++) step();
    drop(W * 0.48, H * 0.78, 0.8, 2.4);
    for(let i = 0; i < 5; i++) step();
    render();
  },
  actions: [
    { label: () => auto ? '自动雨滴：开' : '自动雨滴：关', on: () => auto, run(){ auto = !auto; autoT = 0; autoNext = 250; } },
    { label: () => '音阶：' + SCALES[mood].label, run(){
      mood = (mood + 1) % SCALES.length; J.store.set('ripple-mood', mood); buildNotes();
      walk = Math.min(walk, notes.length - 1);
      const now = performance.now(), n = notes.length;
      for(let i = 0; i < 4; i++){
        const x = (i * 2 + 0.5) / n * W + W * 0.02, y = H * (0.75 - i * 0.12);
        drop(x, y, 0.7, 2.2);
        rings.push({ x, y, t0: now + i * 40, vel: 0.6, ...(c => ({ r: c[0], g: c[1], b: c[2] }))(pitchCol(i * 2 / (n - 1))), ci: Math.round(i * 2 / (n - 1) * 100) });
      }
      const a = J.ac();
      if(a && !J.muted){
        // tiny arpeggio preview of the new scale
        const order = [0, 2, 4, Math.min(n - 1, 5)];
        order.forEach((k, j) => bell(notes[k], 0.5, 0, (k / n - 0.5) * 0.8, 0.12, j * 0.12));
      }
    } }
  ],
  key(e){ if(e.code === 'Space'){ randomDrop(1); return true; } },
  tick(now, dt){
    simAcc += dt;
    let n = 0;
    while(simAcc >= 16.67 && n < 3){ step(); simAcc -= 16.67; n++; }
    if(n === 3) simAcc = 0;
    if(auto){
      autoT += dt;
      if(autoT > autoNext){
        autoT = 0;
        autoNext = (Math.random() < 0.2 ? 900 : 380) + Math.random() * 700;
        rainDrop(now);
      } else if(Math.random() < dt / 1400){
        drop(Math.random() * W, Math.random() * H, 0.22, 1.4); // silent drizzle
      }
    } else if(!RM){
      idleT += dt;
      if(idleT > idleNext){ idleT = 0; idleNext = 3500 + Math.random() * 5000; drop(W * (0.1 + Math.random() * 0.8), H * (0.15 + Math.random() * 0.75), 0.28, 1.6); }
    }
    render();
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, W, H);
    // light rings riding the ripples
    ctx.globalCompositeOperation = 'lighter';
    const speed = Math.SQRT1_2 * 60 * (cellX + cellY) * 0.5 / 1000; // px per ms (matches wave front)
    for(let i = rings.length - 1; i >= 0; i--){
      const R = rings[i], age = now - R.t0;
      if(age < 0) continue;
      const life = 1900;
      if(age > life){ rings.splice(i, 1); continue; }
      const k = 1 - age / life, a = k * k * 0.5 * R.vel;
      const rad = 6 + age * speed;
      ctx.beginPath(); ctx.arc(R.x, R.y, rad, 0, TAU);
      ctx.lineWidth = 9; ctx.strokeStyle = `rgba(${R.r},${R.g},${R.b},${(a * 0.16).toFixed(3)})`; ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(${R.r},${R.g},${R.b},${a.toFixed(3)})`; ctx.stroke();
      if(age < 900){
        const g = 1 - age / 900, s = (26 + 30 * (1 - g)) * (0.7 + 0.3 * R.vel);
        ctx.globalAlpha = g * g * 0.85 * R.vel;
        ctx.drawImage(glowSprite(R.ci), R.x - s, R.y - s, s * 2, s * 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  stat: () => `弹了 <b>${J.fmt(total)}</b> 个音`,
  leave(){ J.store.set('ripple-notes', total); }
});
})();

