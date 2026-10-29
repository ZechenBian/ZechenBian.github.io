// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== snow ===== */
/* 扫雪 — a thick soft layer of snow (or zen sand) over a stone path; push it aside to find what's written underneath. */
(() => {
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rgb = (c, a) => a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function mk(w, h){ const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
const reduce = (() => { try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();

const MAT = {
  snow: { lit: [250, 244, 236], shade: [124, 146, 196], deep: [78, 96, 146], thin: [196, 204, 220], HS: 2.6, T: .55, top: .9, spark: true },
  sand: { lit: [236, 211, 168], shade: [158, 121, 86], deep: [118, 86, 60], thin: [190, 158, 118], HS: 3.0, T: .34, top: .5, spark: false }
};
let mode = J.store.get('snow-mat', 'snow') === 'sand' ? 'sand' : 'snow';

/* value noise */
const LAT = 64, lat = new Float32Array(LAT * LAT).map(() => Math.random());
function vn(x, y){
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = xi & 63, b = (xi + 1) & 63, c = (yi & 63) * LAT, d = ((yi + 1) & 63) * LAT;
  return lerp(lerp(lat[c + a], lat[c + b], sx), lerp(lat[d + a], lat[d + b], sx), sy);
}

let main, ctx, W = 0, H = 0, k = 1, u = 1, R = 28, CS = 5, gw = 1, gh = 1;
let h = null, fresh = null, lit = null, grain = null;
let midCv = null, mctx = null, ground = null, snowCv = null, sctx = null, img = null, lightCv = null, dotCv = null;
let dirty = true, cleared = 0, statT = 0, snap = null, snapA = 0;

/* ---------- heightfield ---------- */
function freshAt(i, j){
  const x = (i + .5) * CS, y = (j + .5) * CS;
  if(mode === 'snow'){
    const rx = x * .8 + y * .6, ry = -x * .6 + y * .8;
    return 1.05 + .4 * (vn(x / 190, y / 150) - .5) + .2 * (vn(rx / 70 + 17, ry / 26 + 3) - .5) + .07 * (vn(x / 16, y / 16 + 40) - .5);
  }
  const per = Math.max(2.6 * CS, 13);
  const yy = y + 9 * Math.sin(x / 140) + 5 * Math.sin(x / 47 + 1);
  return 1 + .17 * Math.sin(yy / per * TAU) + .05 * (vn(x / 90, y / 90) - .5);
}
function makeFresh(){
  fresh = new Float32Array(gw * gh);
  for(let j = 0; j < gh; j++) for(let i = 0; i < gw; i++) fresh[j * gw + i] = freshAt(i, j);
}
function alloc(){
  const nw = Math.ceil(W / CS) + 1, nh = Math.ceil(H / CS) + 1;
  const old = h, ow = gw, oh = gh;
  gw = nw; gh = nh;
  h = new Float32Array(gw * gh); lit = new Float32Array(gw * gh); grain = new Float32Array(gw * gh);
  for(let i = 0; i < grain.length; i++) grain[i] = Math.random();
  makeFresh();
  if(old){
    for(let j = 0; j < gh; j++) for(let i = 0; i < gw; i++)
      h[j * gw + i] = old[Math.min(oh - 1, Math.floor(j * oh / gh)) * ow + Math.min(ow - 1, Math.floor(i * ow / gw))];
  } else h.set(fresh);
  snowCv = mk(gw, gh); sctx = snowCv.getContext('2d'); img = sctx.createImageData(gw, gh);
  midCv = mk(gw * 2, gh * 2); mctx = midCv.getContext('2d'); mctx.imageSmoothingEnabled = true;
  dirty = true;
}
/* one plow stamp: scoop snow under the disc and pile it just outside, ahead and to the sides */
let box = [1e9, 1e9, -1e9, -1e9];
function stamp(x, y, dx, dy, r, strength, keep, radial){
  const ring = Math.max(2.2 * CS, r * .55), ro = r + ring;
  const i0 = Math.max(0, Math.floor((x - ro) / CS)), i1 = Math.min(gw - 1, Math.ceil((x + ro) / CS));
  const j0 = Math.max(0, Math.floor((y - ro) / CS)), j1 = Math.min(gh - 1, Math.ceil((y + ro) / CS));
  if(i1 < i0 || j1 < j0) return 0;
  let M = 0, sw = 0;
  const r2 = r * r;
  for(let j = j0; j <= j1; j++){
    const cy = (j + .5) * CS - y;
    for(let i = i0; i <= i1; i++){
      const cx = (i + .5) * CS - x, d2 = cx * cx + cy * cy;
      if(d2 >= r2) continue;
      const q = d2 / r2, f = 1 - q * q;
      const id = j * gw + i, take = h[id] * Math.min(1, strength * f);
      h[id] -= take; M += take;
    }
  }
  if(M < 1e-4) return 0;
  const dep = M * keep;
  // two passes over the ring: weights then deposit
  for(let pass = 0; pass < 2; pass++){
    for(let j = j0; j <= j1; j++){
      const cy = (j + .5) * CS - y;
      for(let i = i0; i <= i1; i++){
        const cx = (i + .5) * CS - x, d = Math.sqrt(cx * cx + cy * cy);
        if(d < r || d > ro) continue;
        let w;
        if(radial) w = 1;
        else {
          const dt = (cx * dx + cy * dy) / d;
          w = (dt > 0 ? Math.pow(dt, 1.4) : 0) * 1.0 + (1 - Math.abs(dt)) * .75 + .03;
        }
        w *= 1 - (d - r) / ring;
        if(pass === 0) sw += w;
        else h[j * gw + i] += dep * w / sw;
      }
    }
    if(sw <= 0) break;
  }
  if(i0 * CS < box[0]) box[0] = i0 * CS; if(j0 * CS < box[1]) box[1] = j0 * CS;
  if(i1 * CS > box[2]) box[2] = i1 * CS; if(j1 * CS > box[3]) box[3] = j1 * CS;
  dirty = true;
  return M;
}
function relax(x0, y0, x1, y1, iters, T){
  const i0 = Math.max(0, Math.floor(x0 / CS)), i1 = Math.min(gw - 2, Math.ceil(x1 / CS));
  const j0 = Math.max(0, Math.floor(y0 / CS)), j1 = Math.min(gh - 2, Math.ceil(y1 / CS));
  for(let it = 0; it < iters; it++){
    for(let j = j0; j <= j1; j++){
      let id = j * gw + i0;
      for(let i = i0; i <= i1; i++, id++){
        const a = h[id];
        let b = h[id + 1], df = a - b;
        if(df > T){ const m = (df - T) * .22; h[id] -= m; h[id + 1] += m; }
        else if(df < -T){ const m = (-df - T) * .22; h[id] += m; h[id + 1] -= m; }
        const a2 = h[id]; b = h[id + gw]; df = a2 - b;
        if(df > T){ const m = (df - T) * .22; h[id] -= m; h[id + gw] += m; }
        else if(df < -T){ const m = (-df - T) * .22; h[id] += m; h[id + gw] -= m; }
      }
    }
  }
}
function pushSeg(x0, y0, x1, y1, r, keep, sprayK){
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if(len < .3) return 0;
  const ux = dx / len, uy = dy / len, step = r * .2;
  let moved = 0;
  box[0] = box[1] = 1e9; box[2] = box[3] = -1e9;
  let s = P.carry;
  for(; s <= len; s += step){
    const x = x0 + ux * s, y = y0 + uy * s;
    const m = stamp(x, y, ux, uy, r, .92, keep, false);
    moved += m;
    if(sprayK && m > .3 && Math.random() < Math.min(.9, m * .02 * sprayK)) spray(x + ux * r * 1.05, y + uy * r * 1.05, ux, uy, sprayK);
  }
  P.carry = s - len;
  if(box[2] > box[0]) relax(box[0] - CS, box[1] - CS, box[2] + CS, box[3] + CS, 2, MAT[mode].T);
  return moved;
}

/* ---------- rendering ---------- */
const LX = -.42, LY = -.62, LZ = .66;
function render(){
  const m = MAT[mode], d = img.data, HS = m.HS;
  const [lr, lg, lb] = m.lit, [sr, sg, sb] = m.shade, [dr, dg, db] = m.deep, [tr, tg, tb] = m.thin;
  const isSnow = mode === 'snow';
  let clr = 0, tot = 0;
  for(let j = 0; j < gh; j++){
    const ju = j > 0 ? -gw : 0, jd = j < gh - 1 ? gw : 0;
    for(let i = 0; i < gw; i++){
      const id = j * gw + i, v = h[id];
      const hl = h[id - (i > 0 ? 1 : 0)], hr = h[id + (i < gw - 1 ? 1 : 0)];
      const hu = h[id + ju], hd = h[id + jd];
      const nx = -(hr - hl) * .5 * HS, ny = -(hd - hu) * .5 * HS;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      let L = (nx * LX + ny * LY + LZ) * inv;
      L = clamp((L - .1) * 1.42, 0, 1.15);
      lit[id] = L;
      let r, g, b;
      if(L < .35){ const t = L / .35; r = lerp(dr, sr, t); g = lerp(dg, sg, t); b = lerp(db, sb, t); }
      else { const t = Math.min(1, (L - .35) / .65); r = lerp(sr, lr, t); g = lerp(sg, lg, t); b = lerp(sb, lb, t); }
      if(L > 1){ const t = (L - 1) * 2; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
      // a little grain so the surface isn't plastic
      const gr = (grain[id] - .5) * (isSnow ? 7 : 16);
      r += gr; g += gr; b += gr * (isSnow ? 1 : .8);
      // thin layers turn translucent / packed
      if(v < .45){ const t = 1 - v / .45; r = lerp(r, tr, t * .7); g = lerp(g, tg, t * .7); b = lerp(b, tb, t * .7); }
      // big piles catch a bit more light
      if(v > 1.3){ const t = Math.min(.25, (v - 1.3) * .12); r += (255 - r) * t * (isSnow ? 1 : .4); g += (255 - g) * t * (isSnow ? 1 : .4); b += (255 - b) * t * (isSnow ? 1 : .3); }
      let a = sstep(.03, .2, v);
      // cast shadow from piles up-left of here onto the ground / low snow
      let sh = 0;
      if(i > 1 && j > 1){
        const p1 = h[id - gw - 1] - v - .12, p2 = (h[id - 2 * gw - 2] - v) * .8 - .3;
        sh = clamp(Math.max(p1, p2) * .55, 0, .5);
      }
      if(sh > 0){
        const sA = sh * (1 - a), oA = a + sA;
        const s0 = isSnow ? [30, 40, 70] : [40, 26, 14];
        if(a > 0){ r = (r * a + s0[0] * sA) / oA; g = (g * a + s0[1] * sA) / oA; b = (b * a + s0[2] * sA) / oA; }
        else { r = s0[0]; g = s0[1]; b = s0[2]; }
        a = oA;
      }
      const o = id * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a * 255;
      if(i < gw - 1 && j < gh - 1 && (j + 1) * CS > 34){ tot++; if(v < .12) clr++; }
    }
  }
  sctx.putImageData(img, 0, 0);
  mctx.clearRect(0, 0, gw * 2, gh * 2); mctx.drawImage(snowCv, 0, 0, gw * 2, gh * 2);
  cleared = tot ? clr / tot : 0;
  dirty = false;
}

/* ---------- ground (the hidden thing) ---------- */
function noiseTile(){
  const n = mk(128, 128), x = n.getContext('2d'), id = x.createImageData(128, 128);
  for(let i = 0; i < 128 * 128; i++){
    const v = Math.random() < .5 ? 0 : 255;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = (Math.random() * Math.random() * 110) | 0;
  }
  x.putImageData(id, 0, 0); return n;
}
let NT = null;
const FONT = '"ZCOOL XiaoWei","Noto Serif CJK SC","Songti SC","STSong",serif';
function rrect(x, px, py, w, hh, r){ x.beginPath(); x.roundRect(px, py, w, hh, r); }
function buildGround(){
  NT = NT || noiseTile();
  ground = mk(Math.round(W * k), Math.round(H * k));
  const x = ground.getContext('2d'); x.scale(k, k);
  const sandMode = mode === 'sand';
  const grout = sandMode ? '#23252c' : '#3a2a20';
  x.fillStyle = grout; x.fillRect(0, 0, W, H);
  const stones = sandMode
    ? [[66, 70, 80], [58, 62, 72], [74, 76, 84], [62, 64, 70], [70, 72, 78]]
    : [[176, 136, 102], [160, 120, 90], [190, 150, 114], [150, 112, 86], [168, 132, 106], [184, 146, 118]];
  const th = (sandMode ? 120 : 66) * u, gap = (sandMode ? 3 : 4) * u;
  let row = 0;
  for(let y = -rnd(th * .5); y < H; y += th, row++){
    let xx = -rnd(th) - (row % 2) * th * .5;
    while(xx < W){
      const tw = th * (sandMode ? rnd(1.4, 2.4) : rnd(.9, 1.6));
      const c = stones[(Math.random() * stones.length) | 0], j = rnd(-8, 8);
      const col = [c[0] + j, c[1] + j * .9, c[2] + j * .8];
      const px = xx + gap / 2, py = y + gap / 2, w = tw - gap, hh = th - gap, rr = (sandMode ? 3 : 7) * u;
      rrect(x, px, py, w, hh, rr);
      const g = x.createLinearGradient(px, py, px + w * .4, py + hh);
      g.addColorStop(0, rgb(col.map(v => v + 12))); g.addColorStop(1, rgb(col.map(v => v - 14)));
      x.fillStyle = g; x.fill();
      x.save(); x.clip();
      for(let n = 0; n < 3; n++){
        const bx = px + rnd(w), by = py + rnd(hh), br = rnd(.2, .6) * th;
        const bg = x.createRadialGradient(bx, by, 0, bx, by, br);
        const dark = Math.random() < .5;
        bg.addColorStop(0, dark ? 'rgba(40,24,12,.14)' : 'rgba(255,240,220,.1)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = bg; x.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      x.lineWidth = 2 * u;
      x.strokeStyle = 'rgba(255,240,215,.16)'; x.beginPath(); x.moveTo(px + rr, py + 1); x.lineTo(px + w - rr, py + 1); x.moveTo(px + 1, py + rr); x.lineTo(px + 1, py + hh - rr); x.stroke();
      x.strokeStyle = 'rgba(20,10,4,.25)'; x.beginPath(); x.moveTo(px + rr, py + hh - 1); x.lineTo(px + w - rr, py + hh - 1); x.moveTo(px + w - 1, py + rr); x.lineTo(px + w - 1, py + hh - rr); x.stroke();
      x.restore();
      xx += tw;
    }
  }
  x.globalAlpha = sandMode ? .35 : .5; x.fillStyle = x.createPattern(NT, 'repeat'); x.fillRect(0, 0, W, H); x.globalAlpha = 1;
  // message layer
  const msg = mk(Math.round(W * k), Math.round(H * k)), m = msg.getContext('2d'); m.scale(k, k);
  const cx = W / 2, cy = H * .54;
  if(!sandMode){
    const paint = '#fff0d6';
    const fs = Math.min(W * .3, H * .28, 230);
    m.font = `${fs}px ${FONT}`; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillStyle = paint; m.fillText('晚安', cx, cy);
    // moon + stars (upper left of text), cat (lower right)
    const s = fs / 140;
    const mx = cx - Math.min(W * .3, fs * 1.25), my = cy - fs * .85;
    m.fillStyle = '#ffd98e';
    m.beginPath(); m.arc(mx, my, 30 * s, 0, TAU); m.arc(mx + 13 * s, my - 9 * s, 26 * s, 0, TAU, true); m.fill('evenodd');
    m.fillStyle = paint;
    const star = (sx, sy, r) => { m.beginPath(); for(let i = 0; i < 8; i++){ const a = i / 8 * TAU - Math.PI / 2, rr = i % 2 ? r * .38 : r; m.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } m.closePath(); m.fill(); };
    star(mx + 52 * s, my - 18 * s, 9 * s); star(mx + 30 * s, my + 40 * s, 6 * s); star(mx - 34 * s, my + 30 * s, 5 * s);
    star(cx + fs * .95, cy - fs * .8, 7 * s);
    const kx = cx + Math.min(W * .27, fs * 1.05), ky = cy + fs * .7;
    m.save(); m.translate(kx, ky); m.scale(s, s);
    m.strokeStyle = paint; m.lineWidth = 5.5; m.lineCap = 'round'; m.lineJoin = 'round';
    m.beginPath(); m.ellipse(0, 0, 44, 26, 0, Math.PI * .9, Math.PI * 2.08); m.stroke();     // back
    m.beginPath(); m.moveTo(-40, 10); m.quadraticCurveTo(-10, 30, 40, 12); m.stroke();       // belly
    m.beginPath(); m.moveTo(42, 8); m.bezierCurveTo(66, 20, 52, 40, 18, 32); m.stroke();     // tail curling round
    m.beginPath(); m.arc(-40, -2, 19, 0, TAU); m.stroke();                                   // head
    m.beginPath(); m.moveTo(-55, -11); m.lineTo(-58, -30); m.lineTo(-45, -19); m.moveTo(-36, -20); m.lineTo(-27, -34); m.lineTo(-24, -14); m.stroke();
    m.lineWidth = 3;
    m.beginPath(); m.arc(-47, -2, 4, .2, Math.PI - .2); m.moveTo(-29, -2); m.arc(-33, -2, 4, .2, Math.PI - .2); m.stroke(); // closed eyes
    m.fillStyle = '#ffb69a'; m.beginPath(); m.arc(-40, 5, 2.4, 0, TAU); m.fill();
    m.restore();
    m.fillStyle = 'rgba(255,240,214,.8)';
    m.font = `${Math.max(12, fs * .11)}px ${FONT}`;
    m.fillText('今天也辛苦了', cx, cy + fs * .72 + (W < 520 ? fs * .45 : 0));
  } else {
    const fs = Math.min(W * .17, H * .16, 120);
    const er = Math.min(fs * 2.1, W * .44, H * .38);
    // ensō
    m.lineCap = 'round';
    const a0 = rnd(TAU), span = TAU * .9, N = 140;
    for(let i = 0; i < N; i++){
      const t = i / N, a = a0 + span * t, a2 = a0 + span * (i + 1.4) / N;
      const w = er * (.12 * Math.sin(Math.min(1, t * 3) * Math.PI / 2) * (1 - .75 * t * t) + .015);
      const rr = er * (1 + .02 * Math.sin(t * 9));
      m.strokeStyle = `rgba(226,196,136,${.85 - .35 * t})`; m.lineWidth = w;
      m.beginPath(); m.arc(cx, cy, rr, a, a2); m.stroke();
    }
    m.font = `${fs}px ${FONT}`; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillStyle = '#f1d9a4';
    m.fillText('慢慢来', cx, cy);
    m.font = `${Math.max(12, fs * .2)}px ${FONT}`; m.fillStyle = 'rgba(241,217,164,.7)';
    m.fillText('不 急', cx, cy + fs * .9);
  }
  // wear the paint
  m.globalCompositeOperation = 'destination-out';
  m.globalAlpha = .55; m.fillStyle = m.createPattern(NT, 'repeat'); m.fillRect(0, 0, W, H);
  m.save(); m.translate(37, 61); m.fillRect(-64, -64, W + 128, H + 128); m.restore();
  m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  x.shadowColor = 'rgba(20,10,0,.45)'; x.shadowBlur = 2 * k; x.shadowOffsetY = 1 * k;
  x.globalAlpha = .9; x.drawImage(msg, 0, 0);
  x.restore();
  // a few scattered petals / leaves
  for(let i = 0; i < (sandMode ? 0 : 7); i++){
    const px = rnd(W), py = rnd(50, H), a = rnd(TAU), s = rnd(4, 7) * u;
    x.save(); x.translate(px, py); x.rotate(a);
    x.fillStyle = Math.random() < .5 ? '#b5473e' : '#c9603f';
    x.beginPath(); x.ellipse(0, 0, s, s * .55, 0, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,220,200,.25)'; x.beginPath(); x.ellipse(-s * .25, -s * .15, s * .45, s * .2, 0, 0, TAU); x.fill();
    x.restore();
  }
}
function buildLight(){
  lightCv = mk(Math.ceil(W / 2), Math.ceil(H / 2));
  const x = lightCv.getContext('2d'); x.scale(.5, .5);
  const g = x.createRadialGradient(W * .3, -H * .08, 0, W * .3, -H * .08, Math.hypot(W, H) * .95);
  g.addColorStop(0, 'rgba(255,206,150,.14)'); g.addColorStop(.4, 'rgba(255,196,130,.03)');
  g.addColorStop(.75, 'rgba(10,14,30,.2)'); g.addColorStop(1, 'rgba(6,8,20,.48)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  dotCv = mk(32, 32);
  const d = dotCv.getContext('2d'), dg = d.createRadialGradient(16, 16, 0, 16, 16, 16);
  dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(.35, 'rgba(255,255,255,.75)'); dg.addColorStop(1, 'rgba(255,255,255,0)');
  d.fillStyle = dg; d.fillRect(0, 0, 32, 32);
}

/* ---------- particles: falling flakes, spray, sparkles ---------- */
const FMAX = 420;
const fl = { x: new Float32Array(FMAX), y: new Float32Array(FMAX), z: new Float32Array(FMAX), ph: new Float32Array(FMAX), n: 0, heavy: 0 };
function baseFlakes(){ return mode === 'snow' ? Math.round(clamp(W * H / 7000, 30, 140) * (reduce ? .3 : 1)) : 0; }
function seedFlake(i, top){
  fl.x[i] = rnd(-20, W + 20); fl.y[i] = top ? rnd(-40, -5) : rnd(-10, H); fl.z[i] = Math.pow(Math.random(), 1.6); fl.ph[i] = rnd(TAU);
}
const SPMAX = 160;
const sp = { x: new Float32Array(SPMAX), y: new Float32Array(SPMAX), z: new Float32Array(SPMAX), vx: new Float32Array(SPMAX), vy: new Float32Array(SPMAX), vz: new Float32Array(SPMAX), t: new Float32Array(SPMAX), s: new Float32Array(SPMAX), n: 0 };
function spray(x, y, ux, uy, kk){
  const cnt = 1 + ((Math.random() * 2.5 * Math.min(1.5, kk)) | 0);
  for(let c = 0; c < cnt; c++){
    let i = sp.n < SPMAX ? sp.n++ : (Math.random() * SPMAX) | 0;
    const a = Math.atan2(uy, ux) + rnd(-.9, .9), v = rnd(.05, .16) * Math.min(1.6, kk);
    sp.x[i] = x + rnd(-4, 4); sp.y[i] = y + rnd(-4, 4); sp.z[i] = rnd(2, 6);
    sp.vx[i] = Math.cos(a) * v; sp.vy[i] = Math.sin(a) * v; sp.vz[i] = rnd(.05, .14);
    sp.t[i] = 0; sp.s[i] = rnd(1, 2.6) * u;
  }
}
let sparks = [];
function seedSparks(){
  const n = Math.round(clamp(W * H / 3600, 50, 220));
  sparks = [];
  for(let i = 0; i < n; i++) sparks.push({ x: rnd(W), y: rnd(36, H), ph: rnd(TAU), sp: rnd(.6, 1.6) });
}

/* ---------- sound ---------- */
let loop = null;
function loopStart(){
  if(J.muted || loop) return;
  const a = J.ac(); if(!a) return;
  const src = a.createBufferSource(); src.buffer = J.noiseBuf; src.loop = true;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass';
  const lp = a.createBiquadFilter(); lp.type = 'lowpass';
  if(mode === 'snow'){ bp.frequency.value = 900; bp.Q.value = .55; lp.frequency.value = 2600; }
  else { bp.frequency.value = 3600; bp.Q.value = .45; lp.frequency.value = 7000; }
  const mod = a.createGain(); mod.gain.value = .7;
  const g = a.createGain(); g.gain.value = .0001;
  src.connect(bp).connect(lp).connect(mod).connect(g).connect(J.master);
  src.start(0, Math.random() * 1.5);
  loop = { a, src, bp, mod, g };
}
function loopStop(){
  if(!loop) return;
  const t = loop.a.currentTime;
  loop.g.gain.cancelScheduledValues(t); loop.g.gain.setTargetAtTime(0, t, .07);
  try{ loop.src.stop(t + .5); }catch(e){}
  loop = null;
}
function loopUpdate(dt, speed, mass){
  if(!loop) return;
  const t = loop.a.currentTime, vn = clamp(speed / 1.1, 0, 1), load = clamp(mass / 40, 0, 1);
  const tgt = J.muted ? 0 : (P.down || G ? Math.pow(vn, .8) * (.12 + .2 * load) + (P.down ? .004 : 0) : 0);
  loop.g.gain.setTargetAtTime(Math.max(.0001, tgt), t, .04);
  if(mode === 'snow'){
    loop.bp.frequency.setTargetAtTime(700 + 900 * vn - 250 * load, t, .06);
    loop.mod.gain.setTargetAtTime(rnd(.45, 1), t, .012);
    P.grain += dt * vn * (.012 + .02 * load);
    if(P.grain > 1){
      P.grain = 0;
      J.sfx.noise({ type: 'bandpass', freq: rnd(500, 1500), Q: rnd(2, 4), peak: rnd(.04, .09) * (.4 + vn), dec: rnd(.015, .04), pan: (P.x / W - .5) * .6 });
    }
  } else {
    loop.bp.frequency.setTargetAtTime(2800 + 1600 * vn, t, .06);
    loop.mod.gain.setTargetAtTime(rnd(.75, 1), t, .03);
    P.grain += dt * vn * .006;
    if(P.grain > 1){ P.grain = 0; J.sfx.noise({ type: 'highpass', freq: rnd(4000, 6500), Q: .7, peak: .03, dec: .02, pan: (P.x / W - .5) * .6 }); }
  }
}

/* ---------- interaction ---------- */
const P = { down: false, id: -1, x: 0, y: 0, lt: 0, v: 0, mass: 0, moved: 0, t0: 0, carry: 0, grain: 0, buzz: 0 };
let rect = null;
function onDown(e){
  if(P.down) return;
  J.ac(); e.preventDefault();
  try{ main.cv.setPointerCapture(e.pointerId); }catch(err){}
  rect = main.cv.getBoundingClientRect();
  Object.assign(P, { down: true, id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top, lt: e.timeStamp, v: 0, mass: 0, moved: 0, t0: performance.now(), carry: 0, buzz: 0 });
  loopStart();
}
function onMove(e){
  if(!P.down || e.pointerId !== P.id) return;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  const evs = list && list.length ? list : [e];
  let moved = 0;
  for(const ev of evs){
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const d = Math.hypot(x - P.x, y - P.y), dt = ev.timeStamp - P.lt;
    if(d < .5) continue;
    if(dt > 0){ const kk = Math.min(1, dt / 60); P.v += (d / dt - P.v) * kk; }
    moved += pushSeg(P.x, P.y, x, y, R, 1, mode === 'snow' ? clamp(P.v * 1.4, .3, 1.6) : clamp(P.v, .2, 1));
    P.x = x; P.y = y; P.lt = ev.timeStamp; P.moved += d; P.buzz += d;
  }
  P.mass += (moved - P.mass) * .3;
  if(P.buzz > 46 * u){ P.buzz = 0; if(P.mass > 1) J.buzz(3); }
  if(performance.now() - statT > 200){ statT = performance.now(); J.stat(); }
}
function onUp(e){
  if(!P.down || e.pointerId !== P.id) return;
  P.down = false;
  if(P.moved < 6 && performance.now() - P.t0 < 450 && e.type === 'pointerup') poke(P.x, P.y);
  loopStop(); J.stat();
}
function poke(x, y){
  box[0] = box[1] = 1e9; box[2] = box[3] = -1e9;
  const m = stamp(x, y, 0, 0, R * .55, .55, 1, true);
  relax(box[0], box[1], box[2], box[3], 2, MAT[mode].T);
  if(m > .5){
    for(let i = 0; i < 4; i++){ const a = rnd(TAU); spray(x + Math.cos(a) * R * .5, y + Math.sin(a) * R * .5, Math.cos(a), Math.sin(a), .5); }
    if(mode === 'snow'){
      J.sfx.noise({ type: 'lowpass', freq: 1400, freq2: 500, Q: .7, peak: .16, dec: .09, att: .006, pan: (x / W - .5) * .6 });
      J.sfx.noise({ type: 'bandpass', freq: rnd(800, 1100), Q: 3, peak: .06, dec: .03, delay: .02 });
    } else J.sfx.noise({ type: 'bandpass', freq: 3800, Q: .6, peak: .07, dec: .08, pan: (x / W - .5) * .6 });
    J.buzz(6);
  } else J.sfx.tone({ f: rnd(300, 340), f2: 220, type: 'triangle', peak: .08, dec: .06 }); // stone tap
}
let G = null, F = null, RK = null;
function gust(){
  if(G) return;
  const ang = rnd(-.45, .45) + (Math.random() < .5 ? 0 : Math.PI);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const cy = rnd(H * .25, H * .85), cx = W / 2 + rnd(-W, W) * .15;
  const L = Math.hypot(W, H);
  G = { t: 0, dur: 750, x0: cx - ux * L * .6, y0: cy - uy * L * .6, x1: cx + ux * L * .6, y1: cy + uy * L * .6, px: 0, py: 0, ux, uy, r: R * 1.5 };
  G.px = G.x0; G.py = G.y0; P.carry = 0;
  const pan = ux > 0 ? -.5 : .5;
  J.sfx.noise({ type: 'lowpass', freq: 250, freq2: 1300, Q: .8, peak: .22, dec: .65, att: .22, pan: pan });
  J.sfx.noise({ type: 'bandpass', freq: 600, freq2: 2400, Q: 1.2, peak: .08, dec: .5, att: .3, pan: -pan, wet: .3 });
  J.buzz(10);
  loopStart();
}
function refill(){
  if(F || RK) return;
  if(mode === 'snow'){
    F = { t: 0, dur: 2200 };
    J.sfx.noise({ type: 'lowpass', freq: 500, freq2: 900, Q: .5, peak: .07, dec: 1.9, att: .5, wet: .4 });
    J.sfx.tone({ f: 523, peak: .03, dec: 1.2, att: .2, wet: .6 }); J.sfx.tone({ f: 784, peak: .025, dec: 1.4, att: .3, delay: .25, wet: .6 });
  } else {
    RK = { t: 0, dur: 1900, row: 0 };
    rakeSnd();
  }
}
function rakeSnd(){
  if(J.muted) return;
  const a = J.ac(); if(!a) return;
  const src = a.createBufferSource(); src.buffer = J.noiseBuf;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = .5;
  const g = a.createGain(), t = a.currentTime;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + .3);
  g.gain.setValueAtTime(.09, t + 1.5); g.gain.exponentialRampToValueAtTime(.0001, t + 2);
  src.connect(bp).connect(g).connect(J.master); src.start(t, rnd(0, .5)); src.stop(t + 2.05);
}
function toggle(){
  snap = mk(main.cv.width, main.cv.height); snap.getContext('2d').drawImage(main.cv, 0, 0); snapA = 1;
  mode = mode === 'snow' ? 'sand' : 'snow';
  J.store.set('snow-mat', mode);
  F = null; RK = null; G = null; fl.heavy = 0;
  makeFresh(); h.set(fresh);
  buildGround();
  fl.n = baseFlakes(); for(let i = 0; i < fl.n; i++) seedFlake(i, false);
  sp.n = 0; dirty = true;
  if(mode === 'snow') J.sfx.noise({ type: 'lowpass', freq: 700, Q: .5, peak: .08, dec: .6, att: .1, wet: .4 });
  else J.sfx.noise({ type: 'bandpass', freq: 3000, Q: .5, peak: .07, dec: .5, att: .08 });
  J.sfx.tone({ f: mode === 'snow' ? 660 : 440, peak: .04, dec: .5, wet: .5 });
}

/* ---------- draw ---------- */
function drawRake(y){
  const ty = y;
  ctx.fillStyle = 'rgba(20,12,6,.22)'; ctx.fillRect(0, ty + 6 * u, W, 7 * u);
  const g = ctx.createLinearGradient(0, ty - 5 * u, 0, ty + 6 * u);
  g.addColorStop(0, '#9a7650'); g.addColorStop(.5, '#7a5634'); g.addColorStop(1, '#4e341e');
  ctx.fillStyle = g; ctx.fillRect(0, ty - 5 * u, W, 11 * u);
  ctx.fillStyle = 'rgba(255,225,180,.25)'; ctx.fillRect(0, ty - 4 * u, W, 2 * u);
}

J.register({
  id: 'snow', name: '扫雪', hint: '按住推开雪，看看下面藏着什么',
  create(root){
    main = J.canvas(root); ctx = main.ctx;
    main.cv.style.cursor = 'grab';
    main.cv.addEventListener('pointerdown', onDown);
    main.cv.addEventListener('pointermove', onMove);
    main.cv.addEventListener('pointerup', onUp);
    main.cv.addEventListener('pointercancel', onUp);
    try{ document.fonts && document.fonts.ready.then(() => { if(W) buildGround(); }); }catch(e){}
  },
  resize(w, hh){
    main.fit(w, hh); W = w; H = hh; k = main.k;
    u = clamp(Math.min(W, H) / 380, .9, 1.5);
    R = 28 * u;
    const ncs = W * H > 4e5 ? 6 : 5;
    if(ncs !== CS && h){ /* keep cell size stable once allocated */ } else CS = ncs;
    alloc(); buildGround(); buildLight(); seedSparks();
    fl.n = Math.max(fl.n, baseFlakes());
    for(let i = 0; i < fl.n; i++) seedFlake(i, false);
    J.stat();
  },
  leave(){ if(P.down){ P.down = false; } loopStop(); },
  key(e){ if(e.code === 'Space'){ gust(); return true; } },
  tick(now, dt){
    // gust
    if(G){
      G.t += dt;
      const f = Math.min(1, G.t / G.dur), e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      const nx = lerp(G.x0, G.x1, e), ny = lerp(G.y0, G.y1, e);
      const seg = Math.hypot(nx - G.px, ny - G.py);
      const save = P.x; P.x = nx;
      const m = pushSeg(G.px, G.py, nx, ny, G.r, mode === 'snow' ? .45 : .6, 1.6);
      P.x = save;
      G.px = nx; G.py = ny;
      if(mode === 'snow') for(let i = 0; i < 3; i++) spray(nx + rnd(-G.r, G.r), ny + rnd(-G.r, G.r), G.ux, G.uy, 1.6);
      loopUpdate(dt, seg / Math.max(1, dt), m);
      if(f >= 1){ G = null; if(!P.down) loopStop(); J.stat(); }
    } else loopUpdate(dt, P.down ? P.v : 0, P.mass);
    if(P.down && now - P.lt > 50){ P.v *= Math.exp(-dt / 80); P.mass *= Math.exp(-dt / 80); }
    // snowfall refill
    if(F){
      F.t += dt;
      const f = F.t / F.dur, rate = 2.6 * sstep(0, .2, f) * dt / F.dur;
      for(let i = 0; i < h.length; i++){
        const v = h[i], tg = fresh[i];
        // fill the hollows faster than the piles settle, so old paths fade to soft ghosts
        h[i] = v + (tg - v) * Math.min(1, rate * (v < tg ? 1.25 : .8));
      }
      dirty = true;
      const want = Math.round(clamp(W * H / 1800, 120, FMAX) * (reduce ? .4 : 1) * sstep(0, .25, f) * (1 - sstep(.75, 1, f)));
      fl.heavy = want;
      if(F.t >= F.dur){ F = null; fl.heavy = 0; J.stat(); }
      if(now - statT > 200){ statT = now; J.stat(); }
    }
    // sand rake
    if(RK){
      RK.t += dt;
      const f = Math.min(1, RK.t / RK.dur), e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      RK.y = lerp(-12, H + 12, e);
      const rowTo = Math.min(gh, Math.floor(RK.y / CS));
      for(; RK.row < rowTo; RK.row++) for(let i = 0; i < gw; i++){ const id = RK.row * gw + i; h[id] = fresh[id]; }
      dirty = true;
      if(f >= 1){ for(; RK.row < gh; RK.row++) for(let i = 0; i < gw; i++){ const id = RK.row * gw + i; h[id] = fresh[id]; } RK = null; J.stat(); }
    }
    if(dirty) render();

    // draw
    ctx.drawImage(ground, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(midCv, -CS * .25, -CS * .25, gw * CS, gh * CS);
    // sparkles
    if(MAT[mode].spark){
      const t = now * .001;
      ctx.fillStyle = '#fff';
      for(const s of sparks){
        const gi = Math.min(gh - 1, (s.y / CS) | 0) * gw + Math.min(gw - 1, (s.x / CS) | 0);
        if(h[gi] < .45 || lit[gi] < .8) continue;
        let a = Math.sin(t * s.sp * 2.2 + s.ph); if(a <= .55) continue;
        a = (a - .55) / .45; a *= a;
        const r = (1 + 2.2 * a) * u * .9;
        ctx.globalAlpha = a * .9;
        if(a > .3){ ctx.fillRect(s.x - r, s.y - .45, r * 2, .9); ctx.fillRect(s.x - .45, s.y - r, .9, r * 2); }
        ctx.drawImage(dotCv, s.x - 2.2, s.y - 2.2, 4.4, 4.4);
      }
      ctx.globalAlpha = 1;
    } else {
      // sand: a faint glint of mica
      const t = now * .001;
      ctx.fillStyle = '#fff6dc';
      for(let i = 0; i < sparks.length; i += 3){
        const s = sparks[i], gi = Math.min(gh - 1, (s.y / CS) | 0) * gw + Math.min(gw - 1, (s.x / CS) | 0);
        if(h[gi] < .4 || lit[gi] < .85) continue;
        const a = Math.sin(t * s.sp * 1.5 + s.ph); if(a < .8) continue;
        ctx.globalAlpha = (a - .8) * 2.5; ctx.fillRect(s.x - .6, s.y - .6, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
    }
    // spray
    const sc = mode === 'snow' ? [255, 252, 248] : [226, 198, 152];
    for(let i = sp.n - 1; i >= 0; i--){
      sp.t[i] += dt; sp.vz[i] -= .0006 * dt;
      sp.x[i] += sp.vx[i] * dt; sp.y[i] += sp.vy[i] * dt; sp.z[i] += sp.vz[i] * dt;
      sp.vx[i] *= Math.exp(-dt / 400); sp.vy[i] *= Math.exp(-dt / 400);
      if(sp.z[i] <= 0 || sp.t[i] > 900){
        sp.n--;
        sp.x[i] = sp.x[sp.n]; sp.y[i] = sp.y[sp.n]; sp.z[i] = sp.z[sp.n]; sp.vx[i] = sp.vx[sp.n]; sp.vy[i] = sp.vy[sp.n]; sp.vz[i] = sp.vz[sp.n]; sp.t[i] = sp.t[sp.n]; sp.s[i] = sp.s[sp.n];
        continue;
      }
    }
    ctx.fillStyle = mode === 'snow' ? 'rgba(40,60,110,.18)' : 'rgba(60,36,16,.2)';
    for(let i = 0; i < sp.n; i++){ ctx.beginPath(); ctx.arc(sp.x[i] + sp.z[i] * .3, sp.y[i] + sp.z[i] * .2, sp.s[i], 0, TAU); ctx.fill(); }
    ctx.fillStyle = rgb(sc);
    for(let i = 0; i < sp.n; i++){ ctx.beginPath(); ctx.arc(sp.x[i], sp.y[i] - sp.z[i], sp.s[i], 0, TAU); ctx.fill(); }
    if(RK) drawRake(RK.y);
    // lamp light
    ctx.drawImage(lightCv, 0, 0, W, H);
    // flakes (in front, catching lamp light)
    const want = Math.min(FMAX, Math.max(baseFlakes(), fl.heavy));
    while(fl.n < want){ seedFlake(fl.n, true); fl.n++; }
    const tt = now * .001, wind = G ? G.ux * .25 : 0;
    for(let i = fl.n - 1; i >= 0; i--){
      const z = fl.z[i], heavy = fl.heavy > 0 ? 1.7 : 1;
      fl.y[i] += (.012 + .05 * z) * dt * heavy;
      fl.x[i] += (Math.sin(tt * (.6 + z) + fl.ph[i]) * .012 * (1 + z) + wind * (.3 + z)) * dt;
      if(fl.y[i] > H + 10 || fl.x[i] < -40 || fl.x[i] > W + 40){
        if(i >= want){ fl.n--; fl.x[i] = fl.x[fl.n]; fl.y[i] = fl.y[fl.n]; fl.z[i] = fl.z[fl.n]; fl.ph[i] = fl.ph[fl.n]; continue; }
        seedFlake(i, true);
      }
      const s = (1.6 + 4.2 * z) * u;
      ctx.globalAlpha = .35 + .55 * z;
      ctx.drawImage(dotCv, fl.x[i] - s, fl.y[i] - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    if(snap){
      snapA -= dt / 550;
      if(snapA <= 0) snap = null;
      else { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = sstep(0, 1, snapA); ctx.drawImage(snap, 0, 0); ctx.restore(); ctx.setTransform(k, 0, 0, k, 0, 0); }
    }
  },
  actions: [
    { label: () => mode === 'snow' ? '再下一场雪' : '重新耙平', run(){ refill(); } },
    { label: () => mode === 'snow' ? '换成沙' : '换成雪', run(){ toggle(); J.acts(); } }
  ],
  stat(){
    if(F) return '下雪中…';
    if(RK) return '耙沙中…';
    return `清出 <b>${Math.round(cleared * 100)}%</b>`;
  }
});
})();

