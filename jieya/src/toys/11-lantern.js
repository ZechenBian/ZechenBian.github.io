// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== lantern ===== */
/* 点灯笼 — release sky lanterns over a still lake; each one becomes a star, every seven stars a constellation. */
(() => {
const TAU = Math.PI * 2;
const RM = (() => { try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const FONT = '"ZCOOL XiaoWei", serif';
const HZ = 0.64;            // horizon (fraction of H)
const CAP = 294;            // star cap (multiple of 7)
const NAMES = ['夜猫座', '好梦座', '不加班座', '热可可座', '月亮邮差座', '小被子座', '晚风座', '软枕头座', '慢慢来座',
  '煮茶座', '早睡座', '小台灯座', '睡懒觉座', '打呵欠座', '软拖鞋座', '晚安座', '旧毛毯座', '猫打盹座', '没心事座',
  '星期六座', '雨后座', '桂花座', '一碗面座', '发呆座', '小确幸座', '远方来信座', '萤火座', '半个月亮座', '温牛奶座',
  '小板凳座', '明天再说座', '围巾座', '烤红薯座', '晒被子座', '小声说座', '摇椅座'];

/* ---------- persisted state ---------- */
let stars = J.store.getJSON('lantern-stars', []);      // [xn, yn, size, seed]
let cons = J.store.getJSON('lantern-cons', []);        // names, one per full group of 7
let released = +J.store.get('lantern-count', 0) || 0;
if(!Array.isArray(stars)) stars = [];
if(!Array.isArray(cons)) cons = [];
stars = stars.filter(s => Array.isArray(s) && s.length >= 4 && isFinite(s[0]) && isFinite(s[1]));
while(cons.length < Math.floor(stars.length / 7)) cons.push(NAMES[cons.length % NAMES.length]);
cons.length = Math.floor(stars.length / 7);
const saveStars = () => { J.store.setJSON('lantern-stars', stars); J.store.setJSON('lantern-cons', cons); };

/* ---------- runtime ---------- */
let view, cv, ctx, W = 0, H = 0, hz = 0, k = 1;
let bg, bgR;                       // sky+mountains, pre-flipped reflection
let clock = 0;
const lanterns = [];
const queue = [];                  // staggered releases {at, xn}
const shoots = [];
const born = [];                   // star birth time (runtime only), parallel to stars
const consAnim = [];               // per constellation: age when it started drawing (or -1 = drawn)
let edgesCache = [];               // per constellation: [[i, j], ...] in growth order
let twinkleBg = [];                // a few background stars that twinkle
let shimmer = [];
let shootT = 0, shootNext = 6000, ambT = 0, ambNext = 9000;
let confirmUntil = 0, seeded = false;
const SPR = {};

/* ---------- sprites ---------- */
function mk(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function radial(size, stops){
  const [c, x] = mk(size, size), r = size / 2;
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  for(const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return c;
}
function buildSprites(){
  // lantern body: 3:4, drawn at 120×160
  const w = 120, h = 160;
  const [c, x] = mk(w, h);
  const P = () => {
    x.beginPath();
    x.moveTo(w * 0.2, h * 0.9);
    x.lineTo(w * 0.06, h * 0.24);
    x.bezierCurveTo(w * 0.03, h * 0.08, w * 0.24, h * 0.03, w * 0.5, h * 0.03);
    x.bezierCurveTo(w * 0.76, h * 0.03, w * 0.97, h * 0.08, w * 0.94, h * 0.24);
    x.lineTo(w * 0.8, h * 0.9);
    x.quadraticCurveTo(w * 0.5, h * 0.95, w * 0.2, h * 0.9);
    x.closePath();
  };
  P();
  const g = x.createRadialGradient(w * 0.5, h * 0.86, 2, w * 0.5, h * 0.6, h * 0.72);
  g.addColorStop(0, '#fff6d6'); g.addColorStop(0.2, '#ffd07a'); g.addColorStop(0.48, '#f39a45');
  g.addColorStop(0.78, '#c95a2e'); g.addColorStop(1, '#8a3222');
  x.fillStyle = g; x.fill();
  x.save(); P(); x.clip();
  // paper ribs
  x.strokeStyle = 'rgba(130,48,24,.28)'; x.lineWidth = 2;
  for(const f of [0.3, 0.5, 0.7]){
    x.beginPath(); x.moveTo(w * (0.5 + (f - 0.5) * 1.75), h * 0.06); x.lineTo(w * (0.5 + (f - 0.5) * 1.25), h * 0.92); x.stroke();
  }
  // horizontal seam + top sheen
  x.strokeStyle = 'rgba(130,48,24,.18)'; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(0, h * 0.24); x.quadraticCurveTo(w * 0.5, h * 0.28, w, h * 0.24); x.stroke();
  const sh = x.createLinearGradient(0, 0, w, 0);
  sh.addColorStop(0, 'rgba(90,25,15,.45)'); sh.addColorStop(0.22, 'rgba(90,25,15,0)');
  sh.addColorStop(0.78, 'rgba(90,25,15,0)'); sh.addColorStop(1, 'rgba(90,25,15,.45)');
  x.fillStyle = sh; x.fillRect(0, 0, w, h);
  const top = x.createLinearGradient(0, 0, 0, h * 0.3);
  top.addColorStop(0, 'rgba(90,30,18,.35)'); top.addColorStop(1, 'rgba(90,30,18,0)');
  x.fillStyle = top; x.fillRect(0, 0, w, h * 0.3);
  x.restore();
  // rim
  x.strokeStyle = 'rgba(70,26,14,.9)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(w * 0.21, h * 0.905); x.quadraticCurveTo(w * 0.5, h * 0.955, w * 0.79, h * 0.905); x.stroke();
  // wire to the fuel cake
  x.strokeStyle = 'rgba(70,26,14,.5)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(w * 0.24, h * 0.91); x.lineTo(w * 0.5, h * 0.97); x.lineTo(w * 0.76, h * 0.91); x.stroke();
  SPR.body = c;
  SPR.halo = radial(128, [[0, 'rgba(255,196,120,.62)'], [0.22, 'rgba(255,160,80,.28)'], [0.55, 'rgba(240,120,60,.08)'], [1, 'rgba(240,110,50,0)']]);
  SPR.flame = radial(48, [[0, 'rgba(255,253,235,1)'], [0.25, 'rgba(255,224,150,.85)'], [0.6, 'rgba(255,170,80,.25)'], [1, 'rgba(255,140,60,0)']]);
  SPR.star = radial(48, [[0, 'rgba(255,252,242,1)'], [0.12, 'rgba(255,240,215,.75)'], [0.35, 'rgba(255,214,170,.16)'], [1, 'rgba(255,200,150,0)']]);
  SPR.cool = radial(48, [[0, 'rgba(240,246,255,1)'], [0.14, 'rgba(210,225,255,.5)'], [0.4, 'rgba(170,190,255,.08)'], [1, 'rgba(170,190,255,0)']]);
}

/* ---------- background ---------- */
function rnd(seed){ let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function ridge(r, n, rough){
  // midpoint displacement, n = 2^m + 1 points in 0..1
  const a = new Float32Array(n);
  a[0] = r(); a[n - 1] = r();
  for(let step = n - 1, amp = 1; step > 1; step >>= 1, amp *= rough){
    for(let i = step >> 1; i < n; i += step) a[i] = (a[i - (step >> 1)] + a[i + (step >> 1)]) / 2 + (r() - 0.5) * amp;
  }
  let lo = 1e9, hi = -1e9; for(const v of a){ lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for(let i = 0; i < n; i++) a[i] = (a[i] - lo) / (hi - lo || 1);
  return a;
}
function buildBg(){
  const r = rnd(20261017);
  [bg] = mk(Math.round(W * k), Math.round(hz * k));
  const x = bg.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0);
  // sky
  const g = x.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#05070f'); g.addColorStop(0.35, '#0a1026'); g.addColorStop(0.7, '#17203f');
  g.addColorStop(0.9, '#2b2c4c'); g.addColorStop(1, '#3d3450');
  x.fillStyle = g; x.fillRect(0, 0, W, hz);
  // milky-way haze: a soft diagonal band
  x.globalCompositeOperation = 'lighter';
  for(let i = 0; i < 14; i++){
    const t = i / 13, cx = lerp(-0.1, 1.1, t) * W, cy = lerp(0.62, 0.05, t) * hz + Math.sin(t * 5) * hz * 0.04;
    const rad = Math.max(W, hz) * (0.12 + 0.06 * r());
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, `rgba(${110 + 40 * r() | 0},${110 + 30 * r() | 0},170,.05)`); rg.addColorStop(1, 'rgba(100,100,160,0)');
    x.fillStyle = rg; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  // stars
  const n = Math.min(520, Math.round(W * hz / 1400));
  twinkleBg = [];
  for(let i = 0; i < n; i++){
    let sx = r() * W, sy = Math.pow(r(), 1.35) * hz * 0.96;
    // denser along the band
    if(i % 3 === 0){ const t = r(); sx = lerp(-0.1, 1.1, t) * W + (r() - 0.5) * W * 0.12; sy = (lerp(0.62, 0.05, t) + (r() - 0.5) * 0.12) * hz; }
    const fade = clamp(1 - sy / hz, 0, 1) ** 0.6;
    const m = r(), size = m > 0.97 ? 1.5 : m > 0.85 ? 1.05 : 0.7;
    const a = (0.18 + 0.6 * r() * r()) * fade;
    if(m > 0.93 && twinkleBg.length < 46 && sy > 40){ twinkleBg.push([sx / W, sy / H, size, r() * TAU, 0.6 + r() * 1.6, a]); continue; }
    const tint = r();
    x.fillStyle = tint < 0.2 ? `rgba(255,220,190,${a})` : tint < 0.45 ? `rgba(200,215,255,${a})` : `rgba(240,240,250,${a})`;
    x.beginPath(); x.arc(sx, sy, size * 0.6, 0, TAU); x.fill();
  }
  // low warm haze along the horizon
  const hg = x.createLinearGradient(0, hz * 0.72, 0, hz);
  hg.addColorStop(0, 'rgba(120,80,90,0)'); hg.addColorStop(1, 'rgba(150,100,100,.16)');
  x.fillStyle = hg; x.fillRect(0, hz * 0.72, W, hz * 0.28);
  // crescent moon
  const mx = W * 0.86, my = Math.max(70, hz * 0.2), mr = clamp(Math.min(W, H) * 0.022, 8, 15);
  const mg = x.createRadialGradient(mx, my, 0, mx, my, mr * 9);
  mg.addColorStop(0, 'rgba(255,236,200,.16)'); mg.addColorStop(1, 'rgba(255,236,200,0)');
  x.fillStyle = mg; x.fillRect(mx - mr * 9, my - mr * 9, mr * 18, mr * 18);
  x.globalCompositeOperation = 'source-over';
  {
    const ms = Math.ceil(mr * 2 + 4), [mc, m] = mk(ms * 2, ms * 2);
    m.scale(2, 2);
    m.beginPath(); m.arc(ms / 2, ms / 2, mr, 0, TAU); m.fillStyle = '#f6e7c4'; m.fill();
    m.globalCompositeOperation = 'destination-out';
    m.beginPath(); m.arc(ms / 2 - mr * 0.42, ms / 2 - mr * 0.3, mr * 0.9, 0, TAU); m.fill();
    x.drawImage(mc, mx - ms / 2, my - ms / 2, ms, ms);
  }
  // mountains, far → near
  const layers = [
    { top: 0.2, h: 0.17, col: ['#2b2d4b', '#30304e'], rough: 0.55, n: 129 },
    { top: 0.11, h: 0.13, col: ['#1b1d35', '#201f38'], rough: 0.5, n: 129 },
    { top: 0.05, h: 0.08, col: ['#0f1122', '#121224'], rough: 0.58, n: 257 }
  ];
  for(const L of layers){
    const a = ridge(r, L.n, L.rough);
    const base = hz, peakY = hz - hz * L.top;
    x.beginPath(); x.moveTo(0, base);
    for(let i = 0; i < L.n; i++){
      const xx = i / (L.n - 1) * W;
      x.lineTo(xx, peakY + (1 - a[i]) * hz * L.h + hz * (L.top - L.h) * 0);
    }
    x.lineTo(W, base); x.closePath();
    const mgrad = x.createLinearGradient(0, peakY, 0, base);
    mgrad.addColorStop(0, L.col[0]); mgrad.addColorStop(1, L.col[1]);
    x.fillStyle = mgrad; x.fill();
  }
  // mist band just above the water
  const fog = x.createLinearGradient(0, hz - hz * 0.06, 0, hz);
  fog.addColorStop(0, 'rgba(70,72,105,0)'); fog.addColorStop(1, 'rgba(70,72,105,.35)');
  x.fillStyle = fog; x.fillRect(0, hz - hz * 0.06, W, hz * 0.06);

  // reflection: flipped sky, dimmed and tinted
  const lh = H - hz;
  [bgR] = mk(Math.round(W * k), Math.max(1, Math.round(lh * k)));
  const y = bgR.getContext('2d');
  y.setTransform(k, 0, 0, -k, 0, hz * k);
  y.drawImage(bg, 0, 0, W, hz);
  y.setTransform(k, 0, 0, k, 0, 0);
  const dg = y.createLinearGradient(0, 0, 0, lh);
  dg.addColorStop(0, 'rgba(10,14,30,.38)'); dg.addColorStop(0.5, 'rgba(7,10,24,.6)'); dg.addColorStop(1, 'rgba(4,6,15,.82)');
  y.fillStyle = dg; y.fillRect(0, 0, W, lh);

  shimmer = [];
  const ns = RM ? 14 : 34;
  for(let i = 0; i < ns; i++) shimmer.push([r(), Math.pow(r(), 1.6), r() * TAU, 0.4 + r() * 0.8]);
}

/* ---------- constellations ---------- */
function mstEdges(g){
  const pts = [];
  for(let i = 0; i < 7; i++){ const s = stars[g * 7 + i]; pts.push([s[0] * W, s[1] * H]); }
  const inT = [true, false, false, false, false, false, false], edges = [];
  for(let n = 1; n < 7; n++){
    let best = 1e18, bi = -1, bj = -1;
    for(let i = 0; i < 7; i++) if(inT[i]) for(let j = 0; j < 7; j++) if(!inT[j]){
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if(d < best){ best = d; bi = i; bj = j; }
    }
    inT[bj] = true; edges.push([g * 7 + bi, g * 7 + bj]);
  }
  return edges;
}
function rebuildEdges(){ edgesCache = []; for(let g = 0; g < cons.length; g++) edgesCache.push(mstEdges(g)); }
function pickName(){
  const used = new Set(cons);
  const free = NAMES.filter(n => !used.has(n));
  const list = free.length ? free : NAMES;
  return list[Math.floor(Math.random() * list.length)];
}

/* ---------- sound ---------- */
const PENTA = [196, 220, 246.94, 293.66, 329.63, 392, 440, 493.88, 587.33];
function chime(xn){
  const i = clamp(Math.round(xn * (PENTA.length - 1) + (Math.random() - 0.5) * 1.2), 0, PENTA.length - 1);
  const f = PENTA[i] * 2 * (1 + (Math.random() - 0.5) * 0.006), pan = (xn - 0.5) * 0.8;
  J.sfx.tone({ f, peak: 0.1, dec: 2.2, att: 0.012, wet: 0.65, pan });
  J.sfx.tone({ f: f * 2.002, peak: 0.028, dec: 0.9, att: 0.006, wet: 0.6, pan });
  J.sfx.tone({ f: f * 3.01, peak: 0.012, dec: 0.4, att: 0.004, wet: 0.5, pan });
  J.sfx.tone({ f: f / 2, peak: 0.04, dec: 1.4, att: 0.03, wet: 0.4, pan });
  J.sfx.noise({ type: 'lowpass', freq: 900, freq2: 200, peak: 0.035, dec: 0.4, att: 0.02, pan }); // flame catching
}
function twinkleSound(xn){
  const f = PENTA[Math.floor(Math.random() * PENTA.length)] * 8, pan = (xn - 0.5) * 0.9;
  J.sfx.tone({ f, peak: 0.022, dec: 1.3, att: 0.004, wet: 0.95, pan });
  J.sfx.tone({ f: f * 1.5, peak: 0.01, dec: 0.9, att: 0.004, delay: 0.09, wet: 0.95, pan });
}
function chord(d0 = 0){
  const ch = [146.83, 220, 293.66, 369.99, 440, 659.25, 880];
  ch.forEach((f, i) => J.sfx.tone({ f, peak: i < 2 ? 0.05 : 0.04, dec: 3.6, att: 0.06, delay: d0 + i * 0.11, wet: 0.75, pan: (i / 6 - 0.5) * 0.7 }));
  J.sfx.tone({ f: 1760, peak: 0.012, dec: 2, att: 0.01, delay: d0 + 0.8, wet: 1 });
}

/* ---------- lanterns ---------- */
function spawn(xn, yTap, opts = {}){
  if(lanterns.length >= 48) return;
  const lakeTop = hz / H;
  let y0n = yTap != null && yTap / H > lakeTop + 0.04 ? clamp(yTap / H, lakeTop + 0.06, 0.95) : lerp(lakeTop, 1, 0.55 + Math.random() * 0.25);
  if(opts.ambient) y0n = lakeTop + 0.004 + Math.random() * 0.01;
  const depth = (y0n - lakeTop) / (1 - lakeTop);       // 0 far … 1 near
  const xsn = clamp(xn + (Math.random() - 0.5) * 0.06, 0.04, 0.96);
  const topMin = 46 / H;
  const ysn = opts.ambient ? lakeTop - 0.25 - Math.random() * 0.2 : topMin + Math.random() * (0.45 - topMin);
  lanterns.push({
    x0: xn, y0: y0n, xs: xsn, ys: ysn, depth,
    age: opts.age || 0, T: (opts.ambient ? 22000 : 15000) + Math.random() * 4000,
    ph: Math.random() * TAU, sw: 0.5 + Math.random() * 0.5, fl: Math.random() * 100,
    ambient: !!opts.ambient, size: opts.ambient ? 0.18 : 0.75 + 0.45 * depth
  });
}
function release(xn, yTap){
  spawn(xn, yTap);
  released++; J.store.set('lantern-count', released);
  chime(xn); J.buzz(8); J.stat();
}
function land(L){
  if(L.ambient || L.seed) return;
  if(stars.length >= CAP){
    stars.splice(0, 7); born.splice(0, 7); cons.shift(); consAnim.shift();
  }
  const seed = Math.random();
  stars.push([L.xs, L.ys, 0.8 + 0.5 * Math.random(), seed]);
  born.push(clock);
  twinkleSound(L.xs);
  if(stars.length % 7 === 0){
    cons.push(pickName()); consAnim.push(clock + 700);
    rebuildEdges();
    chord(0.6);
    J.buzz(14);
  }
  saveStars(); J.stat();
}

/* lantern state at time u — position of its bottom-center, scale, brightness */
function lanternState(L){
  const u = clamp(L.age / L.T, 0, 1);
  const lift = smooth(clamp(L.age / 2600, 0, 1));                    // slow lift-off
  const p = 0.5 - 0.5 * Math.cos(Math.PI * Math.pow(u, 0.92));
  const yy = lerp(L.y0, L.ys, p) * H - (1 - lift) * 0;
  const sway = Math.sin(L.age * 0.0009 * L.sw + L.ph) * (1 - u) * (RM ? 0.3 : 1);
  const xx = lerp(L.x0, L.xs, smooth(u)) * W + sway * W * 0.018 * L.size;
  const shrink = Math.pow(1 - u, 1.25);
  const base = clamp(Math.min(W, H) * 0.075, 24, 54) * L.size;
  const sz = base * (0.05 + 0.95 * shrink) * (0.92 + 0.08 * lift);
  return { u, x: xx, y: yy, sz, shrink, rot: sway * 0.07, lift };
}

/* ---------- toy ---------- */
function onDown(e){
  e.preventDefault();
  J.ac();
  const [x, y] = J.local(e, cv);
  release(clamp(x / W, 0.03, 0.97), y);
}

J.register({
  id: 'lantern', name: '点灯笼', hint: '点一下，放一盏灯',
  create(root){
    view = J.canvas(root, { dprMax: 2 });
    cv = view.cv; ctx = view.ctx;
    cv.style.cursor = 'pointer';
    buildSprites();
    cv.addEventListener('pointerdown', onDown);
    for(let i = 0; i < stars.length; i++) born.push(-1e9);
    for(let i = 0; i < cons.length; i++) consAnim.push(-1e9);
  },
  resize(w, h){
    W = w; H = h; hz = Math.round(H * HZ);
    view.fit(w, h); k = view.k;
    buildBg(); rebuildEdges();
    if(!seeded){
      seeded = true;
    // a few lanterns already drifting so the first frame tells the story (they don't become stars)
      for(const [xn, age, sz] of [[0.22, 8200, 0.8], [0.58, 2600, 0.95], [0.8, 12000, 0.7]]){
        spawn(xn, null, {}); const L = lanterns[lanterns.length - 1];
        L.age = age; L.seed = true; L.size = sz; L.y0 = HZ + 0.12; L.T = 17000;
      }
    }
  },
  actions: [
    { label: '放十盏', run(){
      const xs = []; for(let i = 0; i < 10; i++) xs.push((i + 0.5) / 10);
      for(let i = xs.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
      let t = clock;
      for(const xn of xs){ queue.push({ at: t, xn: clamp(xn + (Math.random() - 0.5) * 0.05, 0.04, 0.96) }); t += 380 + Math.random() * 420; }
    } },
    { label: () => clock < confirmUntil ? '再点一次确认' : '清空夜空', on: () => clock < confirmUntil, run(){
      if(clock < confirmUntil){
        stars = []; cons = []; born.length = 0; consAnim.length = 0; edgesCache = [];
        saveStars(); confirmUntil = 0;
        J.sfx.noise({ type: 'lowpass', freq: 1400, freq2: 300, peak: 0.05, dec: 1.2, att: 0.2, wet: 0.6 });
      } else confirmUntil = clock + 3000;
    } }
  ],
  key(e){ if(e.code === 'Space'){ release(0.06 + Math.random() * 0.88, null); return true; } },
  tick(now, dt){
    const prevClock = clock;
    clock += dt;
    if(confirmUntil && prevClock < confirmUntil && clock >= confirmUntil){ confirmUntil = 0; J.acts(); }
    for(let i = queue.length - 1; i >= 0; i--) if(queue[i].at <= clock){ release(queue[i].xn, null); queue.splice(i, 1); }

    // ambient: shooting stars, faraway lanterns
    shootT += dt;
    if(shootT > shootNext){
      shootT = 0; shootNext = (RM ? 40000 : 9000) + Math.random() * (RM ? 30000 : 14000);
      if(!RM || Math.random() < 0.5){
        const sx = W * (0.15 + Math.random() * 0.7), sy = H * (0.06 + Math.random() * 0.22);
        const ang = Math.PI * (0.12 + Math.random() * 0.16) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : 0);
        const sp = Math.min(W, H) * 0.0009 * (0.8 + Math.random() * 0.5);
        const dir = Math.random() < 0.5 ? 1 : -1;
        shoots.push({ x: sx, y: sy, vx: Math.cos(ang) * sp * dir, vy: Math.abs(Math.sin(ang)) * sp, age: 0, life: 900 + Math.random() * 500 });
      }
    }
    ambT += dt;
    if(ambT > ambNext){ ambT = 0; ambNext = (RM ? 30000 : 14000) + Math.random() * 16000; spawn(0.08 + Math.random() * 0.84, null, { ambient: true }); }

    for(let i = lanterns.length - 1; i >= 0; i--){
      const L = lanterns[i]; L.age += dt;
      if(L.age >= L.T){ lanterns.splice(i, 1); land(L); }
    }

    /* ---- draw ---- */
    const c = ctx, t = clock;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.drawImage(bg, 0, 0, W, hz);
    // lake reflection with gentle wave distortion
    const lh = H - hz, amp = RM ? 0.5 : 1;
    for(let y = 0; y < lh; y += 2){
      const d = y / lh;
      const off = (Math.sin(Math.pow(y + 4, 0.75) * 1.3 - t * 0.0016) * (0.6 + 3.2 * d) + Math.sin(y * 0.37 + t * 0.0011) * 0.5 * d) * amp;
      c.drawImage(bgR, 0, y * k, bgR.width, 2 * k, off - 4, hz + y, W + 8, 2.6);
    }
    // horizon line + soft lake vignette
    c.fillStyle = 'rgba(160,150,190,.10)'; c.fillRect(0, hz, W, 1);

    c.globalCompositeOperation = 'lighter';
    // twinkling background stars
    for(const s of twinkleBg){
      const a = s[5] * (0.55 + 0.45 * Math.sin(t * 0.001 * s[4] + s[3]));
      if(a < 0.02) continue;
      const r = 3 + s[2] * 3;
      c.globalAlpha = a; c.drawImage(SPR.cool, s[0] * W - r, s[1] * H - r, r * 2, r * 2);
    }
    // constellation lines
    c.lineCap = 'round';
    for(let g = 0; g < edgesCache.length; g++){
      const E = edgesCache[g], start = consAnim[g];
      const prog = (clock - start) / 650;            // edges drawn one by one
      if(prog <= 0) continue;
      c.lineWidth = 1;
      let lx = 0, ly = 0, maxY = 0, n = 0;
      for(let e = 0; e < E.length; e++){
        const f = clamp(prog - e, 0, 1);
        if(f <= 0) break;
        const a = stars[E[e][0]], b = stars[E[e][1]];
        if(!a || !b) break;
        const ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H;
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, gap = Math.min(6, len * 0.3);
        const sx = ax + dx / len * gap, sy = ay + dy / len * gap;
        const ex = sx + (dx - dx / len * gap * 2) * smooth(f), ey = sy + (dy - dy / len * gap * 2) * smooth(f);
        c.globalAlpha = clamp(1.25 - len / (Math.max(W, H) * 0.55), 0.35, 1);
        c.strokeStyle = 'rgba(255,226,180,.22)';
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      }
      for(let i = 0; i < 7; i++){ const s = stars[g * 7 + i]; if(s){ lx += s[0] * W; ly += s[1] * H; maxY = Math.max(maxY, s[1] * H); n++; } }
      const la = clamp((prog - E.length) / 1.6, 0, 1);
      if(la > 0 && n){
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = la * 0.62;
        c.font = `${W < 520 ? 12 : 14}px ${FONT}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#e8d6b4';
        const tx = clamp(lx / n, 40, W - 40), ty = clamp(ly / n + 4, 48, hz - 30);
        c.fillText(cons[g], tx, ty);
        c.globalCompositeOperation = 'lighter';
      }
    }
    // user stars
    for(let i = 0; i < stars.length; i++){
      const s = stars[i], age = clock - born[i];
      const tw = 0.72 + 0.2 * Math.sin(t * 0.0013 * (0.6 + s[3]) + s[3] * 40) + 0.08 * Math.sin(t * 0.0047 + i);
      let a = tw, r = 4.2 * s[2];
      if(age < 2200){ const f = 1 - age / 2200; a += f * f * 1.4; r *= 1 + f * f * 2.2; }
      c.globalAlpha = clamp(a, 0, 1);
      c.drawImage(SPR.star, s[0] * W - r * 2, s[1] * H - r * 2, r * 4, r * 4);
    }
    // shooting stars
    for(let i = shoots.length - 1; i >= 0; i--){
      const S = shoots[i]; S.age += dt;
      if(S.age > S.life){ shoots.splice(i, 1); continue; }
      const f = S.age / S.life, a = Math.sin(Math.PI * f) * 0.85;
      const hx = S.x + S.vx * S.age, hy = S.y + S.vy * S.age, tl = 90 + 60 * f;
      const sp = Math.hypot(S.vx, S.vy), tx = hx - S.vx / sp * tl, ty = hy - S.vy / sp * tl;
      const gr = c.createLinearGradient(tx, ty, hx, hy);
      gr.addColorStop(0, 'rgba(220,230,255,0)'); gr.addColorStop(1, `rgba(245,248,255,${a.toFixed(3)})`);
      c.globalAlpha = 1; c.strokeStyle = gr; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(hx, hy); c.stroke();
      c.globalAlpha = a; c.drawImage(SPR.cool, hx - 5, hy - 5, 10, 10);
    }

    // water shimmer
    for(const s of shimmer){
      const yy = hz + 3 + s[1] * (lh - 8);
      const a = (0.5 + 0.5 * Math.sin(t * 0.0012 * s[3] + s[2])) * (0.05 + 0.08 * (1 - s[1]));
      if(a < 0.01) continue;
      const len = 6 + 22 * s[1], xx = ((s[0] * W + t * 0.004 * (s[3] - 0.7) * W * 0.02) % W + W) % W;
      c.globalAlpha = a; c.fillStyle = '#b9c4ee';
      c.fillRect(xx - len / 2, yy, len, 1);
    }

    // lanterns: reflections first (in the lake), then the lanterns themselves
    const st = lanterns.map(lanternState);
    c.save();
    c.beginPath(); c.rect(0, hz, W, lh); c.clip();
    for(let i = 0; i < lanterns.length; i++){
      const L = lanterns[i], S = st[i];
      const yf = hz + (L.y0 * H - hz) * S.shrink;          // where it would touch the water
      const above = yf - S.y;
      const yr = yf + above;
      if(yr - S.sz * 2 > H) continue;
      const fl = 0.85 + 0.15 * Math.sin(clock * 0.023 + L.fl) * Math.sin(clock * 0.011 + L.fl * 2);
      const bright = (1 - 0.55 * S.u) * fl * (L.ambient ? 0.7 : 1);
      const wob = Math.sin(yr * 0.08 - clock * 0.003) * S.sz * 0.08;
      const near = clamp(1 - above / (lh * 1.4), 0, 1);
      // light path on water
      c.globalAlpha = 0.45 * bright * (0.35 + 0.65 * near);
      const gw = S.sz * 2.6, gh = S.sz * (3 + 4 * near);
      c.drawImage(SPR.halo, S.x - gw / 2 + wob, yr - gh * 0.42, gw, gh);
      // mirrored body
      if(S.sz > 4){
        c.save();
        c.translate(S.x + wob, yr + S.sz * 0.66);
        c.scale(1, -0.8); c.rotate(-S.rot);
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.3 * bright * clamp((S.shrink - 0.12) / 0.2, 0, 1) * (0.4 + 0.6 * near);
        c.drawImage(SPR.body, -S.sz / 2, -S.sz * 0.66, S.sz, S.sz * 1.333);
        c.globalAlpha = 0.35 * bright * (0.4 + 0.6 * near);
        c.drawImage(SPR.flame, -S.sz * 0.45, -S.sz * 0.55, S.sz * 0.9, S.sz * 0.9);
        c.restore();
      }
    }
    c.restore();
    c.globalCompositeOperation = 'lighter';
    const order = st.map((s, i) => i).sort((a, b) => st[a].sz - st[b].sz);
    for(const i of order){
      const L = lanterns[i], S = st[i];
      const fl = 0.84 + 0.16 * Math.sin(clock * 0.021 + L.fl) * Math.sin(clock * 0.0137 + L.fl * 3);
      const bright = (1 - 0.5 * S.u) * fl * (L.ambient ? 0.75 : 1);
      const bodyA = clamp((S.shrink - 0.1) / 0.18, 0, 1);
      const cx = S.x, cy = S.y - S.sz * 0.66;
      // halo
      const hs = S.sz * (3.4 + 0.3 * fl);
      c.globalAlpha = 0.55 * bright;
      c.drawImage(SPR.halo, cx - hs / 2, cy - hs / 2, hs, hs);
      // body
      if(bodyA > 0 && S.sz > 2.5){
        c.save();
        c.globalCompositeOperation = 'source-over';
        c.translate(cx, S.y); c.rotate(S.rot);
        c.globalAlpha = bodyA * (L.ambient && L.size < 0.3 ? 0.8 : 1);
        c.drawImage(SPR.body, -S.sz / 2, -S.sz * 1.333 + S.sz * 0.03, S.sz, S.sz * 1.333);
        // inner glow, flickering
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = bodyA * (0.35 + 0.35 * (fl - 0.84) / 0.16) * bright;
        c.drawImage(SPR.flame, -S.sz * 0.42, -S.sz * 0.9, S.sz * 0.84, S.sz * 0.84);
        c.globalAlpha = bodyA * 0.9 * fl;
        const fs = S.sz * 0.34;
        c.drawImage(SPR.flame, -fs / 2, -fs * 0.55, fs, fs);
        c.restore();
      }
      // receding warm point that becomes the star
      const pa = 1 - bodyA * 0.85;
      if(pa > 0.05){
        const ps = 6 + S.sz * 1.2;
        c.globalAlpha = pa * (L.ambient ? 0.5 * (1 - S.u) : 0.75 + 0.25 * fl);
        c.drawImage(L.ambient ? SPR.flame : SPR.star, cx - ps / 2, cy - ps / 2, ps, ps);
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },
  stat: () => `放了 <b>${J.fmt(released)}</b> 盏 · 连成 <b>${cons.length}</b> 个星座`
});
})();

