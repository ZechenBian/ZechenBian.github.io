// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== peel ===== */
/* 剥漆 — an old painted wall; drag to tear strips of paint off, roll on new coats to build up layers. */
(() => {
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const shade = (c, f) => f > 0 ? mix(c, [255, 251, 242], f) : mix(c, [22, 15, 10], -f);
const rgb = (c, a) => a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function mk(w, h){ const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

/* faded, lamp-lit wall paints */
const PALETTE = [
  [156, 198, 178], // 薄荷
  [212, 160, 152], // 藕粉
  [212, 176, 104], // 芥黄
  [142, 171, 198], // 雾蓝
  [168, 178, 136], // 灰绿
  [190, 122, 96],  // 砖红
  [228, 216, 188], // 奶白
  [94, 150, 148],  // 青
  [176, 160, 196], // 丁香
  [222, 140, 112]  // 杏橙
];
const PLASTER = [214, 202, 180];
const MAXC = 6, GS = 6;

let main, ctx, W = 0, H = 0, k = 1, u = 1, S = 1, PW = 1, PH = 1, gw = 1, gh = 1;
let base = null, comp = null, cctx = null, lightCv = null, scrA = null, scrB = null;
let coats = [], merged = 0, lastCols = [];
let dirty = null, needDraw = true, rect = null;
let noiseTile = null;
let w0 = 11;

/* ---------- textures ---------- */
function getNoise(){
  if(noiseTile) return noiseTile;
  const n = mk(128, 128), x = n.getContext('2d'), id = x.createImageData(128, 128);
  for(let i = 0; i < 128 * 128; i++){
    const v = Math.random() < .5 ? 0 : 255;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
    id.data[i * 4 + 3] = (Math.random() * Math.random() * 120) | 0;
  }
  x.putImageData(id, 0, 0);
  return noiseTile = n;
}
function blob(x, px, py, r, col, a){
  const g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, rgb(col, a)); g.addColorStop(1, rgb(col, 0));
  x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
}
function genCracks(n, cluster){
  const out = [];
  function walk(x, y, a, len, depth){
    const pts = [x, y]; let L = 0;
    while(L < len){
      const st = rnd(2.5, 8) * u; a += rnd(-.55, .55);
      x += Math.cos(a) * st; y += Math.sin(a) * st; L += st; pts.push(x, y);
      if(depth < 3 && Math.random() < .13) walk(x, y, a + (Math.random() < .5 ? 1 : -1) * rnd(.7, 1.4), len * rnd(.25, .55), depth + 1);
    }
    out.push({ pts, w: 1 - depth * .22 });
  }
  for(let i = 0; i < n; i++) walk(rnd(-20, W + 20), rnd(-20, H + 20), rnd(TAU), rnd(50, 190) * u, 0);
  for(let c = 0; c < cluster; c++){
    const cx = rnd(W), cy = rnd(H), rr = rnd(40, 110) * u;
    for(let i = 0; i < 18; i++){
      const a = rnd(TAU), d = Math.sqrt(Math.random()) * rr;
      walk(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rnd(TAU), rnd(8, 26) * u, 2);
    }
  }
  return out;
}
function drawCracks(x, cracks, col, alpha){
  x.lineJoin = 'round'; x.lineCap = 'round';
  for(const cr of cracks){
    const p = cr.pts;
    x.beginPath(); x.moveTo(p[0], p[1]);
    for(let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
    x.save(); x.translate(.7, .9);
    x.strokeStyle = `rgba(255,250,236,${alpha * .45})`; x.lineWidth = 1.3 * cr.w; x.stroke();
    x.restore();
    x.strokeStyle = rgb(shade(col, -.5), alpha); x.lineWidth = .95 * cr.w; x.stroke();
  }
}
function drawBlister(x, b, col){
  const { x: bx, y: by, r } = b;
  blob(x, bx + r * .3, by + r * .38, r * 1.25, [40, 26, 12], .22);
  const g = x.createLinearGradient(bx - r, by - r, bx + r, by + r);
  g.addColorStop(0, rgb(shade(col, .14))); g.addColorStop(.5, rgb(col)); g.addColorStop(1, rgb(shade(col, -.16)));
  x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill();
  blob(x, bx - r * .3, by - r * .35, r * .7, [255, 253, 245], .2);
  x.strokeStyle = rgb(shade(col, -.3), .35); x.lineWidth = .8;
  x.beginPath(); x.arc(bx, by, r * .98, -.3, 2.2); x.stroke();
  if(Math.random() < .5){
    x.strokeStyle = rgb(shade(col, -.45), .45); x.lineWidth = .7;
    x.beginPath(); const a = rnd(TAU);
    x.moveTo(bx + Math.cos(a) * r * .7, by + Math.sin(a) * r * .7);
    x.quadraticCurveTo(bx + rnd(-2, 2), by + rnd(-2, 2), bx - Math.cos(a + .4) * r * .6, by - Math.sin(a + .4) * r * .6);
    x.stroke();
  }
}
function genPlaster(x){
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#cdbfa5'); g.addColorStop(1, '#b8a88c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for(let i = 0; i < 60; i++) blob(x, rnd(W), rnd(H), rnd(30, 170) * u, Math.random() < .5 ? [140, 124, 100] : [232, 222, 202], rnd(.06, .18));
  x.lineCap = 'round';
  for(let i = 0; i < 80; i++){
    const cx = rnd(W), cy = rnd(H), r = rnd(40, 140) * u, a = rnd(TAU);
    x.strokeStyle = Math.random() < .5 ? 'rgba(250,244,230,.07)' : 'rgba(120,104,80,.06)';
    x.lineWidth = rnd(6, 24) * u;
    x.beginPath(); x.arc(cx, cy, r, a, a + rnd(.4, 1.1)); x.stroke();
  }
  x.globalAlpha = .55; x.fillStyle = x.createPattern(getNoise(), 'repeat'); x.fillRect(0, 0, W, H); x.globalAlpha = 1;
  x.fillStyle = 'rgba(92,76,56,.3)';
  for(let i = 0; i < W * H / 900; i++){ x.beginPath(); x.arc(rnd(W), rnd(H), rnd(.4, 1.5), 0, TAU); x.fill(); }
  drawCracks(x, genCracks(4, 0), [150, 135, 110], .3);
  const s = x.createLinearGradient(0, H * .7, 0, H);
  s.addColorStop(0, 'rgba(90,70,45,0)'); s.addColorStop(1, 'rgba(90,70,45,.16)');
  x.fillStyle = s; x.fillRect(0, 0, W, H);
}
/* paint a full coat onto ctx x (CSS-px transform). Returns {blisters, cracks} */
function paintCoat(x, col, o){
  x.fillStyle = rgb(col); x.fillRect(0, 0, W, H);
  for(let i = 0; i < 48; i++) blob(x, rnd(W), rnd(H), rnd(40, 230) * u, shade(col, rnd(-.13, .13)), rnd(.1, .3));
  x.lineCap = 'round';
  if(o.fresh){
    const bw = rnd(120, 170) * u;
    for(let bx = -rnd(bw); bx < W; bx += bw * rnd(.85, 1.1)){
      x.fillStyle = rgb(shade(col, rnd(-.05, .05)), .5); x.fillRect(bx, 0, bw * rnd(.6, .95), H);
    }
  } else {
    for(let i = 0; i < 160; i++){
      const y = rnd(H), x0 = rnd(-50, W), len = rnd(60, 260) * u, sag = rnd(-6, 6);
      x.strokeStyle = rgb(shade(col, rnd(-.1, .1)), rnd(.05, .11)); x.lineWidth = rnd(2, 7) * u;
      x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo(x0 + len / 2, y + sag, x0 + len, y + rnd(-3, 3)); x.stroke();
    }
  }
  x.globalAlpha = o.fresh ? .28 : .45; x.fillStyle = x.createPattern(getNoise(), 'repeat');
  x.save(); x.translate(rnd(128), rnd(128)); x.fillRect(-128, -128, W + 256, H + 256); x.restore();
  x.globalAlpha = 1;
  if(o.age > 0){
    const g = x.createLinearGradient(0, H * .4, 0, H);
    g.addColorStop(0, 'rgba(80,58,34,0)'); g.addColorStop(1, `rgba(80,58,34,${.14 * o.age})`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for(let i = 0; i < 5; i++) blob(x, rnd(W), rnd(H), rnd(60, 180) * u, [110, 86, 52], .07 * o.age);
  }
  if(o.ghost){
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(o.ghost[1], 0, 0); x.drawImage(o.ghost[0], 0, 0);
    x.restore();
  }
  const cracks = o.age > 0 ? genCracks(Math.round(6 * o.age * (W * H / 3e5 + .4)), W * H > 5e5 ? 3 : 2) : [];
  drawCracks(x, cracks, col, .42 * (o.age || 0));
  const blisters = [];
  const nb = Math.round((o.fresh ? rnd(2, 4) : rnd(4, 7)) * clamp(W * H / 4e5, .6, 1.8));
  for(let i = 0; i < nb; i++){
    const b = { x: rnd(30, W - 30), y: rnd(50, H - 30), r: rnd(o.fresh ? 5 : 6, o.fresh ? 10 : 15) * u, alive: true };
    blisters.push(b); drawBlister(x, b, col);
  }
  return { blisters, cracks };
}
function newCoat(col){
  const cv = mk(PW, PH), x = cv.getContext('2d');
  x.setTransform(S, 0, 0, S, 0, 0);
  return { cv, ctx: x, col, grid: new Uint8Array(gw * gh).fill(1), cnt: gw * gh, blisters: [], cracks: [] };
}
/* light/dark bands along the edges of everything currently painted -> old edges show through new paint */
function ghostBands(){
  if(!coats.length) return null;
  const U = scrA, ux = U.getContext('2d');
  ux.setTransform(1, 0, 0, 1, 0, 0); ux.globalCompositeOperation = 'source-over'; ux.clearRect(0, 0, PW, PH);
  for(const c of coats) ux.drawImage(c.cv, 0, 0);
  const d = Math.max(1, 1.4 * S);
  const band = (dx, dy, color) => {
    const t = mk(PW, PH), tx = t.getContext('2d');
    tx.drawImage(U, 0, 0);
    tx.globalCompositeOperation = 'destination-out'; tx.drawImage(U, dx, dy);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = color; tx.fillRect(0, 0, PW, PH);
    return t;
  };
  return [band(d, d, 'rgba(255,250,236,.26)'), band(-d, -d, 'rgba(40,24,10,.24)')];
}

/* ---------- erasing ---------- */
function rimCol(c){ return rgb(shade(c.col, .42), .95); }
/* build path on ctx from items: quads [8 nums] or circles [x,y,r] or polys */
function pathItems(x, items){
  x.beginPath();
  for(const it of items){
    if(it.length === 3){ x.moveTo(it[0] + it[2], it[1]); x.arc(it[0], it[1], it[2], 0, TAU); }
    else { x.moveTo(it[0], it[1]); for(let i = 2; i < it.length; i += 2) x.lineTo(it[i], it[i + 1]); x.closePath(); }
  }
}
function erase(from, items, rim = 1){
  if(!items.length) return;
  for(let i = Math.max(0, from); i < coats.length; i++){
    const c = coats[i], x = c.ctx;
    pathItems(x, items);
    x.globalCompositeOperation = 'source-atop';
    x.lineJoin = 'round';
    x.save(); x.translate(-.6, -.6); x.strokeStyle = rgb(shade(c.col, -.35), .55); x.lineWidth = rim * 2; x.stroke(); x.restore();
    x.save(); x.translate(.55, .55); x.strokeStyle = rimCol(c); x.lineWidth = rim * 2; x.stroke(); x.restore();
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = '#000'; x.fill();
    x.globalCompositeOperation = 'source-over';
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for(const it of items){
    if(it.length === 3){ x0 = Math.min(x0, it[0] - it[2]); x1 = Math.max(x1, it[0] + it[2]); y0 = Math.min(y0, it[1] - it[2]); y1 = Math.max(y1, it[1] + it[2]); }
    else for(let i = 0; i < it.length; i += 2){ x0 = Math.min(x0, it[i]); x1 = Math.max(x1, it[i]); y0 = Math.min(y0, it[i + 1]); y1 = Math.max(y1, it[i + 1]); }
  }
  markDirty(x0 - 4, y0 - 4, x1 + 4, y1 + 4);
}
function jagPoly(x, y, r, n = 9, jag = .35){
  const p = [], a0 = rnd(TAU);
  for(let i = 0; i < n; i++){
    const a = a0 + i / n * TAU + rnd(-.25, .25) / n * TAU;
    const rr = r * (1 - jag + Math.random() * jag * 1.4);
    p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * rnd(.75, 1));
  }
  return p;
}
function markCells(from, x, y, r){
  const i0 = Math.max(0, Math.floor((x - r) / GS)), i1 = Math.min(gw - 1, Math.floor((x + r) / GS));
  const j0 = Math.max(0, Math.floor((y - r) / GS)), j1 = Math.min(gh - 1, Math.floor((y + r) / GS));
  const r2 = (r + GS * .35) * (r + GS * .35);
  for(let j = j0; j <= j1; j++) for(let i = i0; i <= i1; i++){
    const dx = (i + .5) * GS - x, dy = (j + .5) * GS - y;
    if(dx * dx + dy * dy > r2) continue;
    const gi = j * gw + i;
    for(let c = Math.max(0, from); c < coats.length; c++){ const co = coats[c]; if(co.grid[gi]){ co.grid[gi] = 0; co.cnt--; } }
  }
}
function topAt(x, y){
  const i = clamp(Math.floor(x / GS), 0, gw - 1), j = clamp(Math.floor(y / GS), 0, gh - 1), gi = j * gw + i;
  for(let c = coats.length - 1; c >= 0; c--) if(coats[c].grid[gi]) return c;
  return -1;
}
function resync(){
  if(!coats.length || roll) return;
  const t = mk(gw, gh * coats.length), x = t.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true;
  coats.forEach((c, n) => x.drawImage(c.cv, 0, n * gh, gw, gh));
  const d = x.getImageData(0, 0, gw, gh * coats.length).data;
  coats.forEach((c, n) => {
    let cnt = 0; const off = n * gw * gh;
    for(let i = 0; i < gw * gh; i++){ const v = d[(off + i) * 4 + 3] > 90 ? 1 : 0; c.grid[i] = v; cnt += v; }
    c.cnt = cnt;
  });
  let removed = false;
  for(let i = coats.length - 1; i >= 0; i--) if(coats[i].cnt === 0){ coats.splice(i, 1); removed = true; }
  if(removed) markDirty(-10, -10, W + 10, H + 10);
}
/* drop coats whose coarse grid says nothing is left (cheap; no pixel readback) */
function prune(){
  if(roll) return;
  let removed = false;
  for(let i = coats.length - 1; i >= 0; i--) if(coats[i].cnt <= 0){ coats.splice(i, 1); removed = true; }
  if(removed) markDirty(-10, -10, W + 10, H + 10);
}
function markDirty(x0, y0, x1, y1){
  if(!dirty) dirty = [x0, y0, x1, y1];
  else { dirty[0] = Math.min(dirty[0], x0); dirty[1] = Math.min(dirty[1], y0); dirty[2] = Math.max(dirty[2], x1); dirty[3] = Math.max(dirty[3], y1); }
  needDraw = true;
}
function compUpdate(){
  if(!dirty) return;
  let x0 = Math.max(0, Math.floor(dirty[0] * S)), y0 = Math.max(0, Math.floor(dirty[1] * S));
  let x1 = Math.min(PW, Math.ceil(dirty[2] * S)), y1 = Math.min(PH, Math.ceil(dirty[3] * S));
  dirty = null;
  if(x1 <= x0 || y1 <= y0) return;
  const m = Math.ceil(7 * S);
  const ex0 = Math.max(0, x0 - m), ey0 = Math.max(0, y0 - m), ex1 = Math.min(PW, x1 + m), ey1 = Math.min(PH, y1 + m);
  const ew = ex1 - ex0, eh = ey1 - ey0;
  cctx.save(); cctx.setTransform(1, 0, 0, 1, 0, 0);
  cctx.beginPath(); cctx.rect(x0, y0, x1 - x0, y1 - y0); cctx.clip();
  cctx.drawImage(base.cv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  cctx.shadowColor = 'rgba(30,17,6,.5)'; cctx.shadowOffsetX = 1.1 * S; cctx.shadowOffsetY = 1.7 * S; cctx.shadowBlur = 2.4 * S;
  for(const c of coats) cctx.drawImage(c.cv, ex0, ey0, ew, eh, ex0, ey0, ew, eh);
  cctx.restore();
}

/* ---------- building ---------- */
function nextCol(){
  const top = coats.length ? coats[coats.length - 1].col : null;
  let c, tries = 0;
  do { c = PALETTE[(Math.random() * PALETTE.length) | 0]; tries++; }
  while(tries < 30 && (lastCols.includes(c) || (top && Math.abs(c[0] - top[0]) + Math.abs(c[1] - top[1]) + Math.abs(c[2] - top[2]) < 60)));
  lastCols.push(c); if(lastCols.length > 3) lastCols.shift();
  return c;
}
function chipsAlongCracks(coatIdx, n, rmin, rmax, deeper){
  const c = coats[coatIdx]; if(!c || !c.cracks.length) return;
  for(let i = 0; i < n; i++){
    const cr = c.cracks[(Math.random() * c.cracks.length) | 0], p = cr.pts, j = ((Math.random() * p.length / 2) | 0) * 2;
    const x = p[j], y = p[j + 1]; if(y < 40 || x < 0 || x > W || y > H) continue;
    const r = rnd(rmin, rmax) * u;
    erase(coatIdx, [jagPoly(x, y, r, 11, .4), jagPoly(x + rnd(-r, r) * .5, y + rnd(-r, r) * .5, r * .7, 9, .45)], 1);
    markCells(coatIdx, x, y, r * .8);
    if(deeper && coatIdx > 0 && Math.random() < .5){
      const rr = r * rnd(.35, .6), dx = x + rnd(-r, r) * .25, dy = y + rnd(-r, r) * .25;
      erase(coatIdx - 1, [jagPoly(dx, dy, rr, 9, .4)], 1);
      markCells(coatIdx - 1, dx, dy, rr * .8);
    }
  }
}
function buildWall(){
  base = { cv: mk(PW, PH) }; base.ctx = base.cv.getContext('2d'); base.ctx.setTransform(S, 0, 0, S, 0, 0);
  genPlaster(base.ctx);
  coats = []; merged = 0; lastCols = [];
  const c0 = newCoat(mix(PALETTE[1], [196, 184, 162], .25)); lastCols.push(PALETTE[1]);
  Object.assign(c0, paintCoat(c0.ctx, c0.col, { age: 1 })); coats.push(c0);
  const c1 = newCoat(mix(PALETTE[0], [196, 186, 166], .2)); lastCols.push(PALETTE[0]);
  Object.assign(c1, paintCoat(c1.ctx, c1.col, { age: 1, ghost: null })); coats.push(c1);
  chipsAlongCracks(0, Math.round(6 * clamp(W * H / 4e5, .6, 2)), 6, 18, false);
  chipsAlongCracks(1, Math.round(9 * clamp(W * H / 4e5, .6, 2)), 6, 24, true);
  dirty = null;
}
function buildLight(){
  lightCv = mk(Math.ceil(W / 2), Math.ceil(H / 2));
  const x = lightCv.getContext('2d'); x.scale(.5, .5);
  const g = x.createRadialGradient(W * .32, -H * .1, 0, W * .32, -H * .1, Math.hypot(W, H) * .95);
  g.addColorStop(0, 'rgba(255,214,160,.16)'); g.addColorStop(.45, 'rgba(255,200,140,.03)');
  g.addColorStop(.75, 'rgba(14,12,22,.16)'); g.addColorStop(1, 'rgba(8,8,16,.4)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const v = x.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(10,10,18,.18)'); v.addColorStop(.12, 'rgba(10,10,18,0)'); v.addColorStop(.88, 'rgba(10,10,18,0)'); v.addColorStop(1, 'rgba(10,10,18,.2)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}
function fullComp(){ markDirty(-20, -20, W + 20, H + 20); compUpdate(); }

/* ---------- falling pieces & flakes ---------- */
const pieces = [];
function addPiece(p){ pieces.push(p); if(pieces.length > 26) pieces.shift(); needDraw = true; }
function flake(x, y, col, r, vx, vy){
  const pts = []; const n = 5 + ((Math.random() * 3) | 0);
  for(let i = 0; i < n; i++){ const a = i / n * TAU + rnd(-.3, .3), rr = r * rnd(.55, 1.1); pts.push(Math.cos(a) * rr, Math.sin(a) * rr); }
  addPiece({ pts, x, y, vx, vy, rot: rnd(TAU), vr: rnd(-.012, .012), flip: rnd(TAU), vf: rnd(.006, .016), t: 0, life: rnd(700, 1100),
    c1: rgb(col), c2: rgb(mix(col, PLASTER, .55)), rim: rgb(shade(col, .4), .8), sc: 1 });
}
function drawPieces(){
  for(const p of pieces){
    const a = 1 - smooth((p.t - p.life * .55) / (p.life * .45));
    if(a <= 0) continue;
    const f = Math.cos(p.flip), af = Math.max(.12, Math.abs(f));
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(p.x + 5 * p.sc, p.y + 8 * p.sc); ctx.rotate(p.rot); ctx.scale(p.sc, p.sc * af);
    ctx.fillStyle = 'rgba(20,12,4,.22)'; polyPath(p.pts); ctx.fill();
    ctx.restore(); ctx.save(); ctx.globalAlpha = a;
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.sc, p.sc * af);
    polyPath(p.pts);
    ctx.fillStyle = f > 0 ? p.c2 : p.c1; ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${(1 - af) * .35})`; ctx.fill();
    ctx.strokeStyle = p.rim; ctx.lineWidth = 1 / p.sc; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
  }
}
function polyPath(pts){
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for(let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/* ---------- strip / ribbon ---------- */
const DS = 2.5;
const P = { down: false, id: -1, lx: 0, ly: 0, lt: 0, v: 0, vx: 0, vy: 0, w: 11, ex: 0, ey: 0, dx: 1, dy: 0, s: 0,
  moved: 0, t0: 0, sx: 0, sy: 0, miss: 0, buzzAcc: 0, statT: 0, crackAcc: 0 };
let strip = null;   // {L, pts:[], s0, back, pend:[], lastQuad}
const n1p = rnd(TAU), n2p = rnd(TAU), n3p = rnd(TAU), n4p = rnd(TAU);
const edgeNoise = (s, a, b) => .6 * Math.sin(s * .045 + a) + .4 * Math.sin(s * .13 + b);

function startStrip(L){
  const c = coats[L];
  strip = { L, pts: [], s0: P.s, back: mix(c.col, PLASTER, .5), pend: [], lastQuad: null, cache: null };
  strip.pts.push({ x: P.ex, y: P.ey, nx: -P.dy, ny: P.dx, lw: .5, rw: .5, s: P.s, face: c.col });
}
function emit(x, y){
  P.s += DS;
  const ah = P.w * .5 + GS;
  const top = topAt(x + P.dx * ah, y + P.dy * ah);
  if(strip){
    if(top < strip.L){
      P.miss++;
      if(P.miss > (P.w + 14) / DS){ breakStrip(); if(top >= 0){ P.ex = x; P.ey = y; startStrip(top); } }
    } else P.miss = 0;
  } else if(top >= 0){ P.ex = x; P.ey = y; startStrip(top); P.miss = 0; return; }
  if(!strip){ P.ex = x; P.ey = y; return; }
  const nx = -P.dy, ny = P.dx;
  const along = P.s - strip.s0;
  const taper = Math.min(1, .25 + along / (P.w * 1.6));
  const half = P.w * .5 * taper;
  let lw = half * (1 + .2 * edgeNoise(P.s, n1p, n2p)) + rnd(-.75, .75);
  let rw = half * (1 + .2 * edgeNoise(P.s, n3p, n4p)) + rnd(-.75, .75);
  if(Math.random() < .03) lw *= .62; else if(Math.random() < .03) rw *= .62;
  lw = Math.max(.8, lw); rw = Math.max(.8, rw);
  const prev = strip.pts[strip.pts.length - 1];
  const pt = { x, y, nx, ny, lw, rw, s: P.s, face: coats[Math.max(top, strip.L)].col };
  strip.pts.push(pt);
  const q = [prev.x + prev.nx * prev.lw, prev.y + prev.ny * prev.lw, x + nx * lw, y + ny * lw, x - nx * rw, y - ny * rw, prev.x - prev.nx * prev.rw, prev.y - prev.ny * prev.rw];
  let ar = 0; for(let i = 0; i < 8; i += 2){ const j = (i + 2) % 8; ar += q[i] * q[j + 1] - q[j] * q[i + 1]; }
  if(ar < 0){ for(let i = 0; i < 4; i += 2){ const a0 = q[i], a1 = q[i + 1]; q[i] = q[6 - i]; q[i + 1] = q[7 - i]; q[6 - i] = a0; q[7 - i] = a1; } }
  strip.pend.push(q);
  const mr = Math.min(lw, rw) * .85;
  if(mr > 1.2) strip.pend.push([x, y, mr]);
  markCells(strip.L, x, y, Math.max(lw, rw) * .7);
  for(let c = strip.L; c < coats.length; c++){
    for(const b of coats[c].blisters){
      if(!b.alive) continue;
      const dx = b.x - x, dy = b.y - y, rr = b.r + half * .5;
      if(dx * dx + dy * dy < rr * rr && topAt(b.x, b.y) === c) pop(c, b);
    }
  }
  P.buzzAcc += DS;
  if(P.buzzAcc > 34){ P.buzzAcc = 0; J.buzz(3); }
}
function flushStrip(){
  if(!strip || !strip.pend.length) return;
  const items = strip.lastQuad ? [strip.lastQuad].concat(strip.pend) : strip.pend;
  erase(strip.L, items, 1);
  for(let i = strip.pend.length - 1; i >= 0; i--) if(strip.pend[i].length === 8){ strip.lastQuad = strip.pend[i]; break; }
  strip.pend = [];
}
/* projected ribbon geometry */
let GL = new Float32Array(1024), GR = new Float32Array(1024), GS_ = new Float32Array(1024), GZ = new Float32Array(1024);
function geom(st, frontS){
  const pts = st.pts, n = pts.length;
  if(GL.length < n * 2){ GL = new Float32Array(n * 4); GR = new Float32Array(n * 4); GS_ = new Float32Array(n * 4); GZ = new Float32Array(n * 2); }
  const ZM = 15 * u, D1 = 34 * u;
  for(let j = 0; j < n; j++){
    const p = pts[j], d = frontS - p.s;
    const z = ZM * (1 - Math.exp(-d / D1));
    const wf = 1 - .3 * z / ZM;
    const cx = p.x - .2 * z, cy = p.y - .38 * z;
    GL[j * 2] = cx + p.nx * p.lw * wf; GL[j * 2 + 1] = cy + p.ny * p.lw * wf;
    GR[j * 2] = cx - p.nx * p.rw * wf; GR[j * 2 + 1] = cy - p.ny * p.rw * wf;
    GS_[j * 2] = .6 * z + .5; GS_[j * 2 + 1] = .9 * z + .8;
    GZ[j] = d;
  }
  return n;
}
function outline(n, step = 1){
  const pts = [];
  for(let j = 0; j < n; j += step) pts.push(GL[j * 2], GL[j * 2 + 1]);
  pts.push(GL[(n - 1) * 2], GL[(n - 1) * 2 + 1]);
  pts.push(GR[(n - 1) * 2], GR[(n - 1) * 2 + 1]);
  for(let j = Math.floor((n - 1) / step) * step; j >= 0; j -= step) pts.push(GR[j * 2], GR[j * 2 + 1]);
  return pts;
}
function toPiece(pts, back, face, frontColBias){
  let cx = 0, cy = 0; const m = pts.length / 2;
  for(let i = 0; i < pts.length; i += 2){ cx += pts[i]; cy += pts[i + 1]; }
  cx /= m; cy /= m;
  for(let i = 0; i < pts.length; i += 2){ pts[i] -= cx; pts[i + 1] -= cy; }
  addPiece({ pts, x: cx, y: cy, vx: P.vx * .15 + rnd(-.03, .03), vy: rnd(-.06, 0), rot: 0, vr: rnd(-.0016, .0016),
    flip: 0, vf: rnd(.0025, .006) * (Math.random() < .5 ? -1 : 1), t: 0, life: rnd(1000, 1400),
    c1: rgb(frontColBias), c2: rgb(shade(back, .08)), rim: rgb(shade(face, .45), .75), sc: 1, grow: .00012 });
}
function breakStrip(quiet){
  if(!strip) return;
  flushStrip();
  const st = strip; strip = null;
  if(st.pts.length > 2){
    const n = geom(st, st.pts[st.pts.length - 1].s);
    toPiece(outline(n, 2), st.back, st.pts[st.pts.length - 1].face, st.pts[st.pts.length - 1].face);
    if(!quiet) snapSound(.6);
  }
}
function trimStrip(){
  if(!strip) return;
  const pts = strip.pts, n = pts.length; if(n < 4) return;
  const front = pts[n - 1].s, Lmax = 230 * u;
  if(front - pts[0].s < Lmax + 70 * u) return;
  let cut = 0; while(cut < n - 2 && front - pts[cut].s > Lmax) cut++;
  const nn = geom(strip, front);
  const sub = [];
  for(let j = 0; j <= cut; j += 2) sub.push(GL[j * 2], GL[j * 2 + 1]);
  sub.push(GL[cut * 2], GL[cut * 2 + 1], GR[cut * 2], GR[cut * 2 + 1]);
  for(let j = cut - (cut % 2 === 0 ? 2 : 1); j >= 0; j -= 2) sub.push(GR[j * 2], GR[j * 2 + 1]);
  toPiece(sub, strip.back, pts[cut].face, mix(strip.back, [255, 255, 255], .05));
  strip.pts.splice(0, cut);
  snapSound(.35);
  void nn;
}
function drawRibbon(){
  const st = strip; if(!st || st.pts.length < 2) return;
  const n = geom(st, st.pts[st.pts.length - 1].s);
  // shadow
  ctx.beginPath();
  for(let j = 0; j < n; j++){ const x = GL[j * 2] + GS_[j * 2], y = GL[j * 2 + 1] + GS_[j * 2 + 1]; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for(let j = n - 1; j >= 0; j--) ctx.lineTo(GR[j * 2] + GS_[j * 2], GR[j * 2 + 1] + GS_[j * 2 + 1]);
  ctx.closePath(); ctx.fillStyle = 'rgba(24,14,5,.26)'; ctx.fill();
  ctx.save(); ctx.translate(2.5 * u, 3.5 * u); ctx.fillStyle = 'rgba(24,14,5,.1)'; ctx.fill(); ctx.restore();
  // outline
  const o = outline(n, 1);
  polyPath(o); ctx.strokeStyle = 'rgba(40,24,10,.35)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
  // body quads
  if(!st.cache){
    st.cache = { back: [], face: [] };
    for(let i = 0; i < 12; i++){ st.cache.back.push(rgb(shade(st.back, -.2 + i * .035))); }
  }
  const bend = 5 * u, D1 = 34 * u;
  for(let j = 1; j < n; j++){
    const d = GZ[j];
    let col;
    if(d < bend){ col = rgb(shade(st.pts[j].face, .08 + .22 * (d / bend))); }
    else { const lv = smooth((d - bend) / (D1 * 1.6)); col = st.cache.back[Math.min(11, (lv * 11.99) | 0)]; }
    const jn = Math.min(n - 1, j + 1);
    ctx.beginPath();
    ctx.moveTo(GL[(j - 1) * 2], GL[(j - 1) * 2 + 1]); ctx.lineTo(GL[jn * 2], GL[jn * 2 + 1]);
    ctx.lineTo(GR[jn * 2], GR[jn * 2 + 1]); ctx.lineTo(GR[(j - 1) * 2], GR[(j - 1) * 2 + 1]);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  // broken-edge thickness
  ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(255,250,238,.55)';
  ctx.beginPath(); for(let j = 0; j < n; j++){ j ? ctx.lineTo(GL[j * 2], GL[j * 2 + 1]) : ctx.moveTo(GL[0], GL[1]); } ctx.stroke();
  ctx.beginPath(); for(let j = 0; j < n; j++){ j ? ctx.lineTo(GR[j * 2], GR[j * 2 + 1]) : ctx.moveTo(GR[0], GR[1]); } ctx.stroke();
  // the bend lip at the tear front
  const f = n - 1, fb = Math.max(0, n - 3);
  ctx.strokeStyle = rgb(shade(st.pts[f].face, .5), .9); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(GL[fb * 2], GL[fb * 2 + 1]); ctx.lineTo(GR[fb * 2], GR[fb * 2 + 1]); ctx.stroke();
}

/* ---------- sound ---------- */
let tear = null;
function tearStart(){
  if(J.muted || tear) return;
  const a = J.ac(); if(!a) return;
  const src = a.createBufferSource(); src.buffer = J.noiseBuf; src.loop = true;
  const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 260;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = .85;
  const lo = a.createBiquadFilter(); lo.type = 'bandpass'; lo.frequency.value = 520; lo.Q.value = 1.1;
  const gHi = a.createGain(); gHi.gain.value = .9;
  const gLo = a.createGain(); gLo.gain.value = .3;
  const cr = a.createGain(); cr.gain.value = .6;
  const g = a.createGain(); g.gain.value = .0001;
  src.connect(hp); hp.connect(bp).connect(gHi).connect(cr); hp.connect(lo).connect(gLo).connect(cr);
  cr.connect(g).connect(J.master);
  src.start(0, Math.random() * 1.5);
  tear = { a, src, bp, lo, gLo, cr, g };
}
function tearStop(){
  if(!tear) return;
  const t = tear.a.currentTime;
  tear.g.gain.cancelScheduledValues(t); tear.g.gain.setTargetAtTime(0, t, .05);
  try{ tear.src.stop(t + .4); }catch(e){}
  tear = null;
}
function tearUpdate(dt){
  if(!tear) return;
  const t = tear.a.currentTime;
  const vn = clamp(P.v / .9, 0, 1), wide = clamp((P.w - w0) / (2 * w0), 0, 1);
  const on = strip && !J.muted && P.v > .02;
  const target = on ? Math.pow(vn, .7) * (.32 + .22 * wide) + .02 : 0;
  tear.g.gain.setTargetAtTime(Math.max(.0001, target), t, .035);
  tear.bp.frequency.setTargetAtTime(1500 + 1700 * vn - 500 * wide, t, .05);
  tear.gLo.gain.setTargetAtTime(.25 + .9 * wide, t, .08);
  tear.cr.gain.setTargetAtTime(Math.random() < .12 ? rnd(.9, 1.3) : rnd(.35, .8), t, .006);
  if(on){
    P.crackAcc += dt * (.004 + vn * .03);
    if(P.crackAcc > 1){
      P.crackAcc = 0;
      J.sfx.noise({ type: 'highpass', freq: rnd(2500, 5200), Q: .7, peak: rnd(.03, .08) * (.5 + vn), dec: rnd(.006, .016), pan: (P.lx / W - .5) * .6 });
    }
  }
}
function snapSound(v){
  J.sfx.noise({ type: 'bandpass', freq: rnd(1500, 2300), Q: 2, peak: .16 * v, dec: .035, pan: (P.lx / W - .5) * .6 });
  J.sfx.tone({ f: rnd(160, 210), f2: 80, type: 'triangle', peak: .06 * v, dec: .05 });
}
function popSound(x){
  const p = (x / W - .5) * .7, f = rnd(380, 560);
  J.sfx.tone({ f, f2: f * .35, peak: .2, dec: .07, pan: p });
  J.sfx.noise({ type: 'bandpass', freq: rnd(2600, 3600), Q: 1.4, peak: .2, dec: .028, pan: p });
}
let roll = null, rsnd = null;
function rollSoundStart(){
  if(J.muted) return;
  const a = J.ac(); if(!a) return;
  const src = a.createBufferSource(); src.buffer = J.noiseBuf; src.loop = true;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const bp = a.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 1400; bp.Q.value = 1.2; bp.gain.value = 6;
  const m = a.createGain(); m.gain.value = .7;
  const g = a.createGain(); g.gain.value = .0001;
  src.connect(lp).connect(bp).connect(m).connect(g).connect(J.master);
  src.start(0, Math.random());
  rsnd = { a, src, m, g };
}
function rollSoundStop(){
  if(!rsnd) return;
  const t = rsnd.a.currentTime;
  rsnd.g.gain.setTargetAtTime(0, t, .06); try{ rsnd.src.stop(t + .4); }catch(e){}
  rsnd = null;
}

/* ---------- actions ---------- */
function pop(ci, b){
  b.alive = false;
  const c = coats[ci];
  erase(ci, [jagPoly(b.x, b.y, b.r * 1.15, 11, .35)], 1);
  markCells(ci, b.x, b.y, b.r);
  const nf = 3 + ((Math.random() * 3) | 0);
  for(let i = 0; i < nf; i++){
    const a = rnd(TAU), sp = rnd(.04, .14);
    flake(b.x + Math.cos(a) * b.r * .4, b.y + Math.sin(a) * b.r * .4, c.col, b.r * rnd(.3, .55), Math.cos(a) * sp, Math.sin(a) * sp - .08);
  }
  popSound(b.x); J.buzz(12);
}
function chip(x, y){
  const top = topAt(x, y);
  if(top < 0){ J.sfx.noise({ type: 'bandpass', freq: 1800, Q: 1, peak: .05, dec: .03 }); return; }
  const c = coats[top];
  for(const b of c.blisters){
    if(b.alive && Math.hypot(b.x - x, b.y - y) < b.r + 6){ pop(top, b); return; }
  }
  const r = rnd(5, 9) * u;
  erase(top, [jagPoly(x, y, r, 9, .45)], 1);
  markCells(top, x, y, r * .8);
  flake(x, y, c.col, r * .8, rnd(-.05, .05), -.07);
  if(Math.random() < .6) flake(x + rnd(-3, 3), y + rnd(-3, 3), c.col, r * .45, rnd(-.08, .08), -.1);
  J.sfx.noise({ type: 'bandpass', freq: rnd(3000, 4200), Q: 2.5, peak: .15, dec: .022, pan: (x / W - .5) * .6 });
  J.sfx.tone({ f: rnd(800, 1000), f2: 500, peak: .04, dec: .03 });
  J.buzz(6);
}
function mergeOldest(){
  const c = coats.shift();
  const x = base.ctx; x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  x.shadowColor = 'rgba(30,17,6,.5)'; x.shadowOffsetX = 1.1 * S; x.shadowOffsetY = 1.7 * S; x.shadowBlur = 2.4 * S;
  x.drawImage(c.cv, 0, 0); x.restore();
  merged++;
}
function startRoll(){
  if(roll) return;
  if(P.down){ breakStrip(true); tearStop(); }
  if(coats.length >= MAXC) mergeOldest();
  const col = nextCol();
  const ghost = ghostBands();
  const src = mk(PW, PH), sx = src.getContext('2d'); sx.setTransform(S, 0, 0, S, 0, 0);
  const info = paintCoat(sx, col, { age: 0, fresh: true, ghost });
  const coat = newCoat(col); coat.blisters = info.blisters;
  coats.push(coat);
  const n = Math.max(2, Math.ceil(W / (190 * u)));
  const step = W / n, ovl = 16 * u;
  roll = { t: 0, src, coat, col, n, step, ovl, colW: step + ovl, pd: clamp(1600 / n, 170, 420), pass: -1, py: 0, y: 0, x0: 0, dir: 1, rh: 26 * u };
  rollSoundStart();
  J.sfx.noise({ type: 'lowpass', freq: 500, peak: .12, dec: .2, att: .02 });
  J.stat();
}
function rollStep(dt){
  const R = roll; R.t += dt;
  const pass = Math.floor(R.t / R.pd);
  if(pass >= R.n){
    const x = R.coat.ctx; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(R.src, 0, 0); x.restore();
    // keep the overlap ridges that were drawn
    markDirty(-10, -10, W + 10, H + 10);
    roll = null; rollSoundStop();
    J.sfx.tone({ f: 96, f2: 70, type: 'sine', peak: .14, dec: .14 });
    J.stat(); return;
  }
  const down = pass % 2 === 0, f = (R.t % R.pd) / R.pd;
  const e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  const y0 = -R.rh, y1 = H + R.rh;
  const y = down ? lerp(y0, y1, e) : lerp(y1, y0, e);
  if(pass !== R.pass){
    R.pass = pass; R.py = down ? y0 : y1; R.dir = down ? 1 : -1;
    R.x0 = pass * R.step - R.ovl / 2;
    if(pass > 0) J.sfx.tone({ f: rnd(85, 105), f2: 60, peak: .1, dec: .09 });
    J.buzz(5);
  }
  const ya = Math.max(0, Math.min(R.py, y)), yb = Math.min(H, Math.max(R.py, y));
  if(yb > ya){
    const x = R.coat.ctx;
    const sx0 = Math.max(0, Math.floor(R.x0 * S)), sx1 = Math.min(PW, Math.ceil((R.x0 + R.colW) * S));
    const sy0 = Math.max(0, Math.floor(ya * S)), sy1 = Math.min(PH, Math.ceil(yb * S));
    if(sx1 > sx0 && sy1 > sy0){
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(R.src, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
      x.restore();
      x.fillStyle = rgb(shade(R.col, -.18), .3);
      if(R.x0 > 0) x.fillRect(R.x0 + 1 + rnd(-.4, .4), ya, 1.4, yb - ya);
      x.fillStyle = rgb(shade(R.col, .2), .25);
      if(R.x0 > 0) x.fillRect(R.x0 + 2.6, ya, 1, yb - ya);
      markDirty(R.x0 - 4, ya - 4, R.x0 + R.colW + 4, yb + 4);
    }
  }
  const vel = Math.abs(y - R.py) / Math.max(1, dt);
  R.py = y; R.y = y;
  if(rsnd){
    const t = rsnd.a.currentTime;
    rsnd.g.gain.setTargetAtTime(J.muted ? 0 : clamp(vel / 2.5, 0, 1) * .3 + .02, t, .03);
    rsnd.m.gain.setTargetAtTime(rnd(.55, 1), t, .01);
  }
  needDraw = true;
}
function drawRoller(){
  const R = roll; if(!R || R.pass < 0) return;
  const x0 = R.x0 + 3 * u, w = R.colW - 6 * u, y = R.y, rh = R.rh, x1 = x0 + w, cx = x0 + w / 2;
  // wet band behind the roller
  const behind = -R.dir;
  const g = ctx.createLinearGradient(0, y, 0, y + behind * 70 * u);
  g.addColorStop(0, 'rgba(20,10,0,.16)'); g.addColorStop(.25, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(R.x0, Math.min(y, y + behind * 70 * u), R.colW, 70 * u);
  // shadow
  ctx.fillStyle = 'rgba(16,10,4,.3)';
  ctx.beginPath(); ctx.roundRect(x0 + 7 * u, y - rh / 2 + 9 * u, w, rh, rh * .45); ctx.fill();
  // handle (comes from the bottom-right, towards the painter)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(16,10,4,.25)'; ctx.lineWidth = 4 * u;
  ctx.beginPath(); ctx.moveTo(x1 + 6 * u, y + 8 * u); ctx.lineTo(x1 + 18 * u, y + 8 * u); ctx.lineTo(x1 + 18 * u, y + 44 * u); ctx.lineTo(cx + 34 * u, y + 84 * u); ctx.stroke();
  ctx.strokeStyle = '#bdb6a8'; ctx.lineWidth = 3 * u;
  ctx.beginPath(); ctx.moveTo(x1 - 2 * u, y); ctx.lineTo(x1 + 12 * u, y); ctx.lineTo(x1 + 12 * u, y + 36 * u); ctx.lineTo(cx + 26 * u, y + 76 * u); ctx.stroke();
  ctx.strokeStyle = '#6b4a30'; ctx.lineWidth = 10 * u;
  ctx.beginPath(); ctx.moveTo(cx + 26 * u, y + 76 * u); ctx.lineTo(cx + 18 * u, y + 150 * u); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,180,.25)'; ctx.lineWidth = 2.5 * u;
  ctx.beginPath(); ctx.moveTo(cx + 23 * u, y + 82 * u); ctx.lineTo(cx + 16 * u, y + 146 * u); ctx.stroke();
  // cylinder
  const cg = ctx.createLinearGradient(0, y - rh / 2, 0, y + rh / 2);
  const c = R.col;
  cg.addColorStop(0, rgb(shade(c, -.38))); cg.addColorStop(.3, rgb(shade(c, .18))); cg.addColorStop(.55, rgb(c)); cg.addColorStop(1, rgb(shade(c, -.45)));
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.roundRect(x0, y - rh / 2, w, rh, 7 * u); ctx.fill();
  // nap texture rolling
  const ph = y / (rh * .5);
  ctx.lineWidth = 1;
  for(let i = 0; i < 7; i++){
    const th = ph * R.dir + i / 7 * TAU, cs = Math.cos(th);
    if(cs <= 0) continue;
    const yy = y + Math.sin(th) * rh * .46;
    ctx.strokeStyle = rgb(shade(c, -.25), .35 * cs);
    ctx.beginPath(); ctx.moveTo(x0 + 3, yy); ctx.lineTo(x1 - 3, yy); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(40,30,20,.55)';
  ctx.fillRect(x0 - 2 * u, y - rh * .4, 4 * u, rh * .8); ctx.fillRect(x1 - 2 * u, y - rh * .4, 4 * u, rh * .8);
}

/* ---------- pointer ---------- */
function handle(x, y, t){
  const dxr = x - P.lx, dyr = y - P.ly, dist = Math.hypot(dxr, dyr);
  const dte = t - P.lt;
  if(dte > 0){
    const inst = dist / dte;
    const kk = Math.min(1, dte / 60);
    P.v += (inst - P.v) * kk; P.vx += (dxr / dte - P.vx) * kk; P.vy += (dyr / dte - P.vy) * kk;
  }
  P.lt = t; P.lx = x; P.ly = y; P.moved += dist;
  if(roll) return;
  let ddx = x - P.ex, ddy = y - P.ey, dd = Math.hypot(ddx, ddy);
  while(dd >= DS){
    const ux = ddx / dd, uy = ddy / dd;
    let ndx = P.dx * .55 + ux * .45, ndy = P.dy * .55 + uy * .45; const nl = Math.hypot(ndx, ndy) || 1;
    P.dx = ndx / nl; P.dy = ndy / nl;
    const nx = P.ex + ux * DS, ny = P.ey + uy * DS;
    P.ex = nx; P.ey = ny;
    emit(nx, ny);
    ddx = x - P.ex; ddy = y - P.ey; dd = Math.hypot(ddx, ddy);
  }
}
function onDown(e){
  if(P.down) return;
  J.ac(); e.preventDefault();
  try{ main.cv.setPointerCapture(e.pointerId); }catch(err){}
  rect = main.cv.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  Object.assign(P, { down: true, id: e.pointerId, lx: x, ly: y, lt: e.timeStamp, v: 0, vx: 0, vy: 0, w: w0, ex: x, ey: y, moved: 0, t0: performance.now(), sx: x, sy: y, miss: 0, buzzAcc: 0 });
  strip = null;
  if(!roll) tearStart();
}
function onMove(e){
  if(!P.down || e.pointerId !== P.id) return;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  const evs = list && list.length ? list : [e];
  for(const ev of evs) handle(ev.clientX - rect.left, ev.clientY - rect.top, ev.timeStamp);
  flushStrip(); trimStrip();
  needDraw = true;
}
function onUp(e){
  if(!P.down || e.pointerId !== P.id) return;
  P.down = false;
  const wasTap = P.moved < 7 && performance.now() - P.t0 < 400;
  if(strip){
    breakStrip(true);
    J.sfx.noise({ type: 'bandpass', freq: 1000, freq2: 420, Q: .8, peak: .07, dec: .22, att: .02 });
  }
  tearStop();
  if(wasTap && !roll && e.type === 'pointerup') chip(P.sx, P.sy);
  prune(); J.stat();
}

J.register({
  id: 'peel', name: '剥漆', hint: '按住慢慢拖，把旧漆撕下来',
  create(root){
    main = J.canvas(root); ctx = main.ctx;
    main.cv.style.cursor = 'grab';
    main.cv.addEventListener('pointerdown', onDown);
    main.cv.addEventListener('pointermove', onMove);
    main.cv.addEventListener('pointerup', onUp);
    main.cv.addEventListener('pointercancel', onUp);
  },
  resize(w, h){
    const oW = W, oH = H;
    main.fit(w, h); W = w; H = h; k = main.k;
    u = clamp(Math.min(W, H) / 420, .85, 1.4); w0 = 13 * u;
    const nS = Math.min(k, 2, Math.sqrt(1.8e6 / (w * h)));
    const nPW = Math.max(1, Math.round(w * nS)), nPH = Math.max(1, Math.round(h * nS));
    gw = Math.ceil(w / GS); gh = Math.ceil(h / GS);
    if(!base){
      S = nS; PW = nPW; PH = nPH;
      scrA = mk(PW, PH);
      buildWall();
    } else {
      if(roll){ roll.t = 1e9; rollStep(0); }
      if(strip){ strip = null; }
      const sx = w / oW, sy = h / oH;
      const restretch = o => { const c = mk(nPW, nPH), x = c.getContext('2d'); x.drawImage(o.cv, 0, 0, nPW, nPH); o.cv = c; o.ctx = x; x.setTransform(nS, 0, 0, nS, 0, 0); };
      restretch(base);
      for(const c of coats){ restretch(c); c.grid = new Uint8Array(gw * gh); for(const b of c.blisters){ b.x *= sx; b.y *= sy; } for(const cr of c.cracks){ for(let i = 0; i < cr.pts.length; i += 2){ cr.pts[i] *= sx; cr.pts[i + 1] *= sy; } } }
      S = nS; PW = nPW; PH = nPH; scrA = mk(PW, PH);
    }
    comp = mk(PW, PH); cctx = comp.getContext('2d');
    resync();
    fullComp(); buildLight();
    needDraw = true; J.stat();
  },
  leave(){ if(P.down){ P.down = false; breakStrip(true); tearStop(); } },
  key(e){
    if(e.code === 'Space'){
      const cand = [];
      coats.forEach((c, i) => c.blisters.forEach(b => { if(b.alive && topAt(b.x, b.y) === i) cand.push([i, b]); }));
      if(cand.length){ const [i, b] = cand[(Math.random() * cand.length) | 0]; pop(i, b); }
      else { for(let t = 0; t < 30; t++){ const x = rnd(20, W - 20), y = rnd(50, H - 20); if(topAt(x, y) >= 0){ chip(x, y); break; } } }
      prune(); J.stat();
      return true;
    }
  },
  tick(now, dt){
    if(P.down){
      if(now - P.lt > 40) P.v *= Math.exp(-dt / 70);
      const v = P.v;
      let f;
      if(v < .12) f = 3.2; else if(v < .45) f = lerp(3.2, 1.2, (v - .12) / .33);
      else if(v < 1) f = lerp(1.2, .5, (v - .45) / .55); else f = .5;
      const target = w0 * f, tau = target > P.w ? 650 : 140;
      P.w += (target - P.w) * (1 - Math.exp(-dt / tau));
      if(strip && now - P.statT > 220){ P.statT = now; J.stat(); }
    }
    tearUpdate(dt);
    if(roll) rollStep(dt);
    for(let i = pieces.length - 1; i >= 0; i--){
      const p = pieces[i];
      p.t += dt; p.vy += .0011 * dt; p.vx *= Math.exp(-dt / 900);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.flip += p.vf * dt;
      if(p.grow) p.sc = 1 + Math.min(.18, p.t * p.grow);
      if(p.t > p.life || p.y > H + 80) pieces.splice(i, 1);
    }
    compUpdate();
    if(!(needDraw || pieces.length || strip || roll)) return;
    needDraw = false;
    ctx.drawImage(comp, 0, 0, W, H);
    drawRibbon();
    drawPieces();
    drawRoller();
    ctx.drawImage(lightCv, 0, 0, W, H);
  },
  actions: [
    { label: '刷一层新漆', run(){ startRoll(); } }
  ],
  stat(){
    const n = coats.length + merged;
    if(roll) return `正在刷第 <b>${n}</b> 层漆…`;
    if(!coats.length) return `漆全剥光了 · 露出 <b>灰泥墙</b>`;
    const top = coats[coats.length - 1];
    const pct = Math.round((1 - top.cnt / (gw * gh)) * 100);
    return `这一层剥掉 <b>${clamp(pct, 0, 100)}%</b> · 墙上 <b>${n}</b> 层漆`;
  }
});
})();

