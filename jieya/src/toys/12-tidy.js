// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== tidy ===== */
/* 整理癖 — a messy desk on a cutting mat; drag things square, or knoll everything in one go. */
(() => {
const TAU = Math.PI * 2, HP = Math.PI / 2;
const RM = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

let cv, ctx, k = 1, W = 0, H = 0, cobj;
let bgc = null, u = 10;
let mat = { x: 0, y: 0, w: 1, h: 1 }, play = { x0: 0, y0: 0, x1: 1, y1: 1 }, gx0 = 0, gy0 = 0;
let items = [];
let dirty = true, now = 0, knolled = false, busy = 0, statT = 0, endChord = 0;
let lastSnd = 0;
let drag = null;
let rnd = mulberry(7);

const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const easeIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOut = x => 1 - Math.pow(1 - x, 3);
const easeOutBack = x => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function mulberry(seed){ let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wrapA = a => { a = (a + Math.PI) % TAU; if(a < 0) a += TAU; return a - Math.PI; };

/* ---------- catalogue (sizes in u) ---------- */
const PENCIL = [['#c8463d', '#9e2f28'], ['#e07b39', '#b45a22'], ['#e8b84a', '#3a3a3a'], ['#7aa95c', '#4f7d38'], ['#3f9a8f', '#2a7066'], ['#3f6fb5', '#2a4f8a'], ['#7559a8', '#56407f'], ['#c45d8c', '#99426a']];
const PLEN = [17, 16, 15, 14, 13, 12, 11, 10];
const COINS = [['cu', 1.2], ['cu', 1.2], ['cu', 1.2], ['ag', 1.4], ['ag', 1.4], ['au', 1.62], ['au', 1.62]];
const ERASERS = ['blue', 'pink', 'green', 'two'];
const CLIPS = ['#c9ccd3', '#d2524a', '#e2b347', '#5fa36a', '#4f86c6', '#9a6cc0'];
const BLOCKS = [['深', '#d9b07a'], ['夜', '#5d7fb0'], ['解', '#d9b07a'], ['压', '#c6584d'], ['铺', '#d9b07a']];
const NOTES = ['#f2a3a3', '#f3d36b', '#a9d78f', '#8fc7e8'];
const DICE = [[5, 0], [1, 1], [6, 0], [3, 0]];
const GROUPS = ['pencil', 'note', 'block', 'coin', 'clip', 'eraser', 'die'];

function makeItems(){
  const out = [];
  const add = (type, w, h, extra, order) => out.push(Object.assign({ type, w, h, order, x: 0, y: 0, a: 0, z: 0, anim: null, lift: 0, spr: null, fx: .5, fy: .5 }, extra));
  PENCIL.forEach((c, i) => add('pencil', PLEN[i], 1.3, { col: c[0], tip: c[1] }, i));
  COINS.forEach((c, i) => add('coin', c[1] * 2, c[1] * 2, { metal: c[0], val: c[0] === 'cu' ? '1' : c[0] === 'ag' ? '5' : '10' }, i));
  ERASERS.forEach((c, i) => add('eraser', 4.4, 2.2, { kind: c }, i));
  CLIPS.forEach((c, i) => add('clip', 4.6, 1.5, { col: c }, i));
  BLOCKS.forEach((c, i) => add('block', 2.7, 2.7, { ch: c[0], col: c[1] }, i));
  NOTES.forEach((c, i) => add('note', 5, 5, { col: c }, i));
  DICE.forEach((c, i) => add('die', 2.4, 2.4, { val: c[0], red: c[1] }, i));
  out.sort((a, b) => a.order * 7 - b.order * 7 + (GROUPS.indexOf(a.type) - GROUPS.indexOf(b.type)));
  // z-order: notes at bottom, then the rest shuffled
  out.forEach((it, i) => { it.z = it.type === 'note' ? -10 + i * .01 : rnd(); });
  out.sort((a, b) => a.z - b.z);
  return out;
}

/* ---------- drawing items (local coords, long axis along x, centred) ---------- */
function rr(g, x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function shade(hex, f){
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  if(f < 0){ r *= 1 + f; gg *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; }
  return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')';
}
function bandGrad(g, y0, y1, col, stops){
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for(const s of stops) gr.addColorStop(s[0], shade(col, s[1]));
  return gr;
}
const DRAW = {
  pencil(g, it){
    const L = it.w * u, d = it.h * u, x0 = -L / 2, y0 = -d / 2;
    const er = d * .85, fe = d * .95, cone = d * 1.9, xb = x0 + er + fe, xc = L / 2 - cone;
    // eraser cap
    g.fillStyle = bandGrad(g, y0, -y0, '#e79a96', [[0, -.25], [.35, .15], [.6, 0], [1, -.3]]);
    rr(g, x0, y0 + d * .04, er + d * .3, d * .92, d * .28); g.fill();
    // ferrule
    g.fillStyle = bandGrad(g, y0, -y0, '#c9c3b4', [[0, -.4], [.3, .55], [.55, .05], [1, -.45]]);
    g.fillRect(x0 + er, y0, fe, d);
    g.fillStyle = 'rgba(70,60,40,.35)';
    for(let i = 1; i <= 3; i++) g.fillRect(x0 + er + fe * i / 4 - .4, y0, .8, d);
    // body: three facets
    g.fillStyle = bandGrad(g, y0, -y0, it.col, [[0, -.35], [.32, -.08], [.34, .22], [.62, .1], [.66, -.12], [1, -.38]]);
    g.fillRect(xb, y0, xc - xb + 1, d);
    // cone (shaved wood) with scalloped edge
    g.save();
    g.beginPath(); g.moveTo(xc, y0); g.lineTo(L / 2, 0); g.lineTo(xc, -y0); g.closePath(); g.clip();
    g.fillStyle = bandGrad(g, y0, -y0, '#e9c99a', [[0, -.25], [.4, .15], [1, -.3]]);
    g.fillRect(xc - 2, y0, cone + 4, d);
    g.fillStyle = bandGrad(g, y0, -y0, it.tip, [[0, -.2], [.4, .15], [1, -.3]]);
    g.fillRect(L / 2 - cone * .36, y0, cone, d);
    g.restore();
    g.fillStyle = bandGrad(g, y0, -y0, it.col, [[0, -.35], [.34, .22], [.66, -.12], [1, -.38]]);
    g.beginPath(); g.moveTo(xc, y0);
    for(let i = 0; i < 3; i++){ const ya = y0 + d * i / 3, yb = y0 + d * (i + 1) / 3; g.quadraticCurveTo(xc + d * .42, (ya + yb) / 2, xc, yb); }
    g.closePath(); g.fill();
    // gold stamp
    g.fillStyle = 'rgba(255,230,160,.4)'; g.fillRect(xb + d * 1.6, -d * .06, d * 2.2, d * .12);
  },
  coin(g, it){
    const r = it.w * u / 2;
    const M = { cu: ['#c27a4c', '#7c4224', '#f0b48a'], ag: ['#c8cbd2', '#7c808a', '#ffffff'], au: ['#d8b35a', '#8d6a22', '#fff0b8'] }[it.metal];
    let gr = g.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r * 1.05);
    gr.addColorStop(0, M[2]); gr.addColorStop(.45, M[0]); gr.addColorStop(1, M[1]);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = Math.max(.6, r * .05);
    g.beginPath(); g.arc(0, 0, r * .8, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = Math.max(.5, r * .03);
    g.beginPath(); g.arc(0, 0, r * .84, Math.PI * .9, Math.PI * 1.6); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.18)';
    for(let i = 0; i < 18; i++){ const a = i / 18 * TAU; g.beginPath(); g.arc(Math.cos(a) * r * .9, Math.sin(a) * r * .9, Math.max(.35, r * .028), 0, TAU); g.fill(); }
    g.font = '600 ' + (r * (it.val.length > 1 ? .78 : .95)).toFixed(1) + 'px Georgia,serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText(it.val, -r * .03, -r * .02);
    g.fillStyle = 'rgba(0,0,0,.32)'; g.fillText(it.val, r * .03, r * .05);
  },
  eraser(g, it){
    const w = it.w * u, h = it.h * u, x0 = -w / 2, y0 = -h / 2;
    const body = it.kind === 'pink' ? '#eb9aa4' : it.kind === 'two' ? '#d8605a' : '#eeebe3';
    g.fillStyle = bandGrad(g, y0, -y0, body, [[0, .1], [.15, .18], [.8, -.02], [1, -.2]]);
    rr(g, x0, y0, w, h, h * .2); g.fill();
    if(it.kind === 'pink'){
      g.fillStyle = 'rgba(255,255,255,.22)'; rr(g, x0 + h * .18, y0 + h * .16, w - h * .36, h * .2, h * .1); g.fill();
      g.strokeStyle = 'rgba(120,40,50,.25)'; g.lineWidth = 1; rr(g, x0 + h * .12, y0 + h * .12, w - h * .24, h - h * .24, h * .14); g.stroke();
    } else if(it.kind === 'two'){
      g.fillStyle = bandGrad(g, y0, -y0, '#4b6fa8', [[0, .1], [.15, .18], [.8, -.02], [1, -.2]]);
      g.save(); rr(g, x0, y0, w, h, h * .2); g.clip(); g.fillRect(0, y0, w / 2, h); g.restore();
      g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x0 + h * .2, y0 + h * .15, w - h * .4, h * .12);
    } else {
      const sl = it.kind === 'blue' ? '#3c69ad' : '#3f8a5c';
      const sx = x0 + w * .34;
      g.fillStyle = bandGrad(g, y0, -y0, sl, [[0, .12], [.2, .2], [.8, -.05], [1, -.25]]);
      g.fillRect(sx, y0 - .5, w * .52, h + 1);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(sx + w * .05, y0 + h * .44, w * .42, h * .12);
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.fillRect(sx + w * .05, y0 + h * .25, w * .2, h * .08);
      g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(sx, y0 - .5, 1, h + 1); g.fillRect(sx + w * .52 - 1, y0 - .5, 1, h + 1);
    }
  },
  clip(g, it){
    const L = it.w * u, Wd = it.h * u, lw = Math.max(1.2, u * .2);
    const r1 = Wd / 2 - lw / 2, r2 = r1 * .8, r3 = r1 * .48;
    const cR = L / 2 - lw / 2 - r1, cL = -L / 2 + lw / 2 + r2;
    const yM = -r1 + 2 * r2, cI = cR - L * .2;
    const path = () => {
      g.beginPath();
      g.moveTo(-L * .2, r1); g.lineTo(cR, r1);
      g.arc(cR, 0, r1, HP, -HP, true);
      g.lineTo(cL, -r1);
      g.arc(cL, -r1 + r2, r2, -HP, HP, true);
      g.lineTo(cI, yM);
      g.arc(cI, yM - r3, r3, HP, -HP, true);
      g.lineTo(cL + L * .22, yM - 2 * r3);
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    path(); g.strokeStyle = shade(it.col, -.42); g.lineWidth = lw; g.stroke();
    path(); g.strokeStyle = it.col; g.lineWidth = lw * .62; g.stroke();
    g.save(); g.translate(-lw * .12, -lw * .14); path(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = lw * .2; g.stroke(); g.restore();
  },
  block(g, it){
    const s = it.w * u, x0 = -s / 2, b = s * .1;
    g.fillStyle = shade(it.col, -.3); rr(g, x0, x0, s, s, s * .1); g.fill();
    g.fillStyle = shade(it.col, .2); rr(g, x0, x0, s - b * .6, s - b * .6, s * .1); g.fill();
    const gr = g.createLinearGradient(x0, x0, -x0, -x0);
    gr.addColorStop(0, shade(it.col, .12)); gr.addColorStop(1, shade(it.col, -.1));
    g.fillStyle = gr; rr(g, x0 + b * .55, x0 + b * .55, s - b * 1.3, s - b * 1.3, s * .06); g.fill();
    if(it.col === '#d9b07a'){
      g.strokeStyle = 'rgba(120,70,30,.18)'; g.lineWidth = .8;
      for(let i = 0; i < 5; i++){ const yy = x0 + s * (.2 + i * .15); g.beginPath(); g.moveTo(x0 + b, yy); g.bezierCurveTo(x0 + s * .4, yy - s * .05, x0 + s * .6, yy + s * .05, -x0 - b, yy); g.stroke(); }
    }
    g.font = (s * .6).toFixed(1) + 'px "ZCOOL XiaoWei","Songti SC","Noto Serif SC",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const ink = it.col === '#d9b07a' ? '#7a3b22' : '#fbf1de';
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillText(it.ch, s * .02, s * .06);
    g.fillStyle = ink; g.fillText(it.ch, 0, s * .03);
  },
  note(g, it){
    const s = it.w * u, x0 = -s / 2;
    for(let i = 3; i >= 1; i--){
      g.fillStyle = shade(it.col, -.08 - i * .07);
      g.fillRect(x0 + i * .9, x0 + i * .9, s - i * .9, s - i * .9);
    }
    const t = s - 2.4;
    const gr = g.createLinearGradient(x0, x0, x0 + t, x0 + t);
    gr.addColorStop(0, shade(it.col, .1)); gr.addColorStop(.7, it.col); gr.addColorStop(1, shade(it.col, -.06));
    g.fillStyle = gr;
    const c = s * .16;
    g.beginPath(); g.moveTo(x0, x0); g.lineTo(x0 + t, x0); g.lineTo(x0 + t, x0 + t - c); g.lineTo(x0 + t - c, x0 + t); g.lineTo(x0, x0 + t); g.closePath(); g.fill();
    g.fillStyle = shade(it.col, -.12); g.fillRect(x0, x0, t, s * .1);
    // curl
    g.fillStyle = shade(it.col, .28);
    g.beginPath(); g.moveTo(x0 + t, x0 + t - c); g.quadraticCurveTo(x0 + t - c * .55, x0 + t - c * .55, x0 + t - c, x0 + t); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; g.stroke();
  },
  die(g, it){
    const s = it.w * u, x0 = -s / 2;
    const body = it.red ? '#c7473f' : '#efe8da', pip = it.red ? '#fbf1e2' : '#2b2a33';
    g.fillStyle = shade(body, -.25); rr(g, x0, x0, s, s, s * .22); g.fill();
    const gr = g.createRadialGradient(x0 + s * .3, x0 + s * .3, s * .05, 0, 0, s * .75);
    gr.addColorStop(0, shade(body, .25)); gr.addColorStop(1, body);
    g.fillStyle = gr; rr(g, x0 + s * .05, x0 + s * .05, s * .88, s * .88, s * .2); g.fill();
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[it.val];
    const q = s * .26, pr = it.val === 1 ? s * .13 : s * .085;
    for(const p of P){
      g.fillStyle = it.val === 1 && !it.red ? '#b8322c' : pip;
      g.beginPath(); g.arc(p[0] * q - s * .02, p[1] * q - s * .02, pr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.beginPath(); g.arc(p[0] * q - s * .02 + pr * .3, p[1] * q - s * .02 + pr * .35, pr * .45, 0, TAU); g.fill();
    }
  }
};

/* ---------- sprites ---------- */
function sprite(it){
  const w = it.w * u, h = it.h * u, pad = Math.ceil(u * 1.3 + 4);
  const sw = w + pad * 2, sh = h + pad * 2;
  const mk = () => { const c = document.createElement('canvas'); c.width = Math.ceil(sw * k); c.height = Math.ceil(sh * k); return c; };
  const body = mk(), g = body.getContext('2d');
  g.setTransform(k, 0, 0, k, sw / 2 * k, sh / 2 * k);
  DRAW[it.type](g, it);
  const shadow = (blur) => {
    const c = mk(), s = c.getContext('2d');
    const off = sw * 2;
    s.shadowColor = '#000'; s.shadowBlur = blur * k; s.shadowOffsetX = off * k;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.drawImage(body, -off * k, 0);
    return c;
  };
  it.spr = { body, soft: shadow(u * .9), hard: shadow(Math.max(1, u * .14)), sw, sh };
}
function buildSprites(){ for(const it of items) sprite(it); dirty = true; }

/* ---------- geometry ---------- */
function dims(it, a){ const odd = Math.abs(Math.round(a / HP)) % 2 === 1; return odd ? [it.h * u, it.w * u] : [it.w * u, it.h * u]; }
function aabb(it, x, y, a){
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), w = it.w * u, h = it.h * u;
  const hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2;
  return [x - hw, y - hh, x + hw, y + hh];
}
function obbOverlap(A, ax, ay, aa, B, bx, by, ba, tol){
  const axes = [aa, aa + HP, ba, ba + HP];
  for(const t of axes){
    const cx = Math.cos(t), cy = Math.sin(t);
    const pa = Math.abs(A.w * u / 2 * Math.cos(aa - t)) + Math.abs(A.h * u / 2 * Math.sin(aa - t));
    const pb = Math.abs(B.w * u / 2 * Math.cos(ba - t)) + Math.abs(B.h * u / 2 * Math.sin(ba - t));
    const dd = Math.abs((bx - ax) * cx + (by - ay) * cy);
    if(dd >= pa + pb - tol) return false;
  }
  return true;
}
function rest(it){ const a = it.anim; return a ? [a.x1, a.y1, a.a1] : [it.x, it.y, it.a]; }
const isAligned = a => { const r = a / HP; return Math.abs(r - Math.round(r)) < .006; };

/* ---------- layout (knolling) ---------- */
function groupsOf(){
  const G = {};
  for(const it of items) (G[it.type] || (G[it.type] = [])).push(it);
  G.pencil.sort((a, b) => b.w - a.w);
  G.coin.sort((a, b) => a.w - b.w || a.order - b.order);
  for(const t of ['eraser', 'clip', 'block', 'note']) G[t].sort((a, b) => a.order - b.order);
  G.die.sort((a, b) => a.val - b.val);
  return G;
}
const ROT = { pencil: -HP, clip: HP, coin: 0, eraser: 0, block: 0, note: 0, die: 0 };
const GAP = { pencil: .75, coin: .8, eraser: 1, clip: .8, block: .9, note: 1.1, die: .9 };
const VARS = { pencil: [8, 4], note: [4, 2, 1], block: [5, 3], coin: [7, -1], clip: [6, 3], eraser: [4, 2, 1], die: [4, 2] };
/* place a group (in unit coords, u=1) with given columns; returns {w, h, cells:[[it, cx, cy]]} */
function groupBlock(type, list, cols){
  const gap = GAP[type], rows = [];
  if(cols < 0){ const by = {}; for(const it of list) (by[it.metal || it.type] || (by[it.metal || it.type] = [])).push(it); for(const key in by) rows.push(by[key]); }
  else for(let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols));
  const fw = it => ROT[it.type] ? it.h : it.w, fh = it => ROT[it.type] ? it.w : it.h;
  let y = 0, wMax = 0; const cells = [];
  const colW = Math.max(...list.map(fw));
  const uniform = type !== 'coin';
  rows.forEach(row => {
    const rh = Math.max(...row.map(fh));
    let x = 0;
    row.forEach(it => {
      const w = uniform ? colW : fw(it);
      const cy = type === 'pencil' ? y + rh - fh(it) / 2 : y + rh / 2;
      cells.push([it, x + w / 2, cy]);
      x += w + gap;
    });
    wMax = Math.max(wMax, x - gap);
    y += rh + gap;
  });
  return { type, w: wMax, h: y - gap, cells };
}
function pack(blocks, Wu, Hu, gg){
  const rows = []; let row = [], rw = 0;
  for(const b of blocks){
    if(b.w > Wu) return null;
    if(row.length && rw + gg + b.w > Wu){ rows.push(row); row = []; rw = 0; }
    rw += (row.length ? gg : 0) + b.w; row.push(b);
  }
  if(row.length) rows.push(row);
  let hTot = 0; for(const r of rows) hTot += Math.max(...r.map(b => b.h));
  hTot += gg * (rows.length - 1);
  if(hTot > Hu) return null;
  return { rows, hTot };
}
const ORDERS = [['pencil', 'note', 'block', 'coin', 'clip', 'eraser', 'die'], ['pencil', 'clip', 'note', 'eraser', 'coin', 'block', 'die'], ['note', 'pencil', 'eraser', 'block', 'die', 'coin', 'clip']];
let layoutChoice = null;
function chooseLayout(Wa, Ha){
  const G = groupsOf();
  let best = null;
  const keys = Object.keys(VARS), combos = [];
  const rec = (i, cur) => { if(i === keys.length){ combos.push(Object.assign({}, cur)); return; } for(const c of VARS[keys[i]]){ cur[keys[i]] = c; rec(i + 1, cur); } };
  rec(0, {});
  for(const cmb of combos){
    for(const ord of ORDERS){
      const blocks = ord.map(t => groupBlock(t, G[t], cmb[t]));
      let lo = 2, hi = 40;
      if(!pack(blocks, Wa / lo, Ha / lo, 2.4)) continue;
      if(best && !pack(blocks, Wa / best.u, Ha / best.u, 2.4)) continue;
      for(let i = 0; i < 14; i++){ const m = (lo + hi) / 2; if(pack(blocks, Wa / m, Ha / m, 2.4)) lo = m; else hi = m; }
      // prefer fewer rows slightly when equal
      if(!best || lo > best.u * 1.005) best = { u: lo, cmb, ord };
    }
  }
  return best;
}
function knollTargets(){
  const Wa = play.x1 - play.x0, Ha = play.y1 - play.y0;
  const G = groupsOf(), ch = layoutChoice;
  const blocks = ch.ord.map(t => groupBlock(t, G[t], ch.cmb[t]));
  const Wu = Wa / u, Hu = Ha / u;
  let gg = 2.4, P = pack(blocks, Wu, Hu, gg);
  if(!P){ gg = 1.6; P = pack(blocks, Wu, Hu, gg) || { rows: [blocks], hTot: Hu }; }
  const nR = P.rows.length;
  const vgap = Math.min(gg * 2.2, gg + (Hu - P.hTot) / Math.max(1, nR + 1));
  const hTot = P.hTot + (vgap - gg) * (nR - 1);
  let y = (Hu - hTot) / 2;
  const T = new Map();
  for(const row of P.rows){
    const rh = Math.max(...row.map(b => b.h));
    const used = row.reduce((s, b) => s + b.w, 0);
    const hg = row.length > 1 ? Math.min(gg * 2.6, (Wu - used) / (row.length + 1), Math.max(gg, (Wu - used) / (row.length - 1) * .5)) : 0;
    const hgap = row.length > 1 ? Math.max(gg, hg) : 0;
    const rowW = used + hgap * (row.length - 1);
    let x = (Wu - rowW) / 2;
    for(const b of row){
      const bx = play.x0 + x * u, by = play.y0 + (y + (rh - b.h) / 2) * u;
      const sx = gx0 + Math.round((bx - gx0) / u) * u, sy = gy0 + Math.round((by - gy0) / u) * u;
      for(const [it, cx, cy] of b.cells) T.set(it, [sx + cx * u, sy + cy * u, ROT[it.type]]);
      x += b.w + hgap;
    }
    y += rh + vgap;
  }
  return T;
}

/* ---------- sound ---------- */
const PENT = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const pent = i => PENT[i % 5] * Math.pow(2, Math.floor(i / 5));
const pan = x => clamp((x / Math.max(1, W) - .5) * 1.2, -.9, .9);
function sLand(it, m, soft){
  const p = pan(it.x), v = soft ? .6 : 1;
  switch(it.type){
    case 'pencil':
      J.sfx.tone({ f: 760 * m, f2: 700 * m, type: 'triangle', peak: .14 * v, dec: .05, pan: p });
      J.sfx.noise({ freq: 2600, Q: 2, peak: .1 * v, dec: .014, pan: p }); break;
    case 'coin':
      J.sfx.tone({ f: 1760 * m, peak: .07 * v, dec: .22, pan: p, wet: .15 });
      J.sfx.tone({ f: 2640 * m * 1.01, peak: .035 * v, dec: .14, pan: p });
      J.sfx.noise({ type: 'highpass', freq: 5000, peak: .06 * v, dec: .01, pan: p }); break;
    case 'eraser':
      J.sfx.tone({ f: 300 * m, f2: 240 * m, peak: .16 * v, dec: .07, pan: p });
      J.sfx.noise({ type: 'lowpass', freq: 900, peak: .12 * v, dec: .03, pan: p }); break;
    case 'clip':
      J.sfx.tone({ f: 2200 * m, f2: 2050 * m, peak: .05 * v, dec: .05, pan: p });
      J.sfx.noise({ type: 'highpass', freq: 6000, peak: .07 * v, dec: .012, pan: p }); break;
    case 'block':
      J.sfx.tone({ f: 520 * m, f2: 480 * m, type: 'triangle', peak: .17 * v, dec: .09, pan: p });
      J.sfx.tone({ f: 1040 * m, peak: .05 * v, dec: .035, pan: p }); break;
    case 'note':
      J.sfx.noise({ freq: 1400, Q: .7, peak: .14 * v, dec: .05, pan: p });
      J.sfx.tone({ f: 440 * m, f2: 400 * m, peak: .06 * v, dec: .05, pan: p }); break;
    case 'die':
      J.sfx.noise({ freq: 3200, Q: 3, peak: .14 * v, dec: .02, pan: p });
      J.sfx.tone({ f: 1320 * m, f2: 1200 * m, type: 'triangle', peak: .07 * v, dec: .035, pan: p }); break;
  }
}
function sLift(it){ J.sfx.tone({ f: 520, f2: 640, peak: .05, dec: .06, pan: pan(it.x) }); J.sfx.noise({ type: 'lowpass', freq: 1200, peak: .04, dec: .03 }); }
function sNudge(x){ if(now - lastSnd < 35) return; lastSnd = now; J.sfx.noise({ freq: 900, freq2: 1800, Q: .8, peak: .05, dec: .08, att: .02, pan: pan(x) }); }
function sWhoosh(){
  J.sfx.noise({ freq: 300, freq2: 2600, Q: .7, peak: .22, dec: .42, att: .07 });
  J.sfx.noise({ type: 'lowpass', freq: 600, peak: .12, dec: .3, att: .05 });
  for(let i = 0; i < 9; i++) J.sfx.noise({ freq: 1800 + Math.random() * 2600, Q: 2, peak: .05, dec: .015, delay: .25 + Math.random() * .4, pan: Math.random() * 1.6 - .8 });
}
function sChord(){
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => J.sfx.tone({ f, peak: .05, dec: 1.2, att: .01, delay: i * .06, wet: .6 }));
  J.buzz(18);
}

/* ---------- motion ---------- */
function animTo(it, x, y, a, delay, dur, kind){
  const [sx, sy, sa] = [it.x, it.y, it.a];
  let a1 = a; while(a1 - sa > Math.PI) a1 -= TAU; while(a1 - sa < -Math.PI) a1 += TAU;
  it.anim = { x0: sx, y0: sy, a0: sa, x1: x, y1: y, a1, t0: now + delay, dur, kind, idx: 0 };
  busy++;
  return it.anim;
}
function knoll(){
  if(drag) return;
  const T = knollTargets();
  let order = [];
  const G = groupsOf();
  for(const t of layoutChoice.ord) for(const it of G[t]) order.push(it);
  // already neat? do a little hop wave instead
  let moved = 0;
  for(const it of order){ const tg = T.get(it); const r = rest(it); if(Math.hypot(r[0] - tg[0], r[1] - tg[1]) > 1 || Math.abs(wrapA(r[2] - tg[2])) > .01) moved++; }
  const gap = RM ? 18 : Math.min(48, 1700 / order.length), dur = RM ? 260 : 520;
  order.forEach((it, i) => {
    const tg = T.get(it);
    if(it.anim) busy--;
    const an = animTo(it, tg[0], tg[1], tg[2], i * gap, moved ? dur : 300, moved ? 'knoll' : 'hop');
    an.idx = i; an.n = order.length;
  });
  // land order: raise z so later items sit on top consistently
  items.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  knolled = true; endChord = now + (order.length - 1) * gap + (moved ? dur : 300) + 40;
  J.buzz(6);
}
function scatter(first){
  if(drag) return;
  const placed = [];
  const order = items.slice().sort(() => rnd() - .5);
  const notes = order.filter(i => i.type === 'note'), rest_ = order.filter(i => i.type !== 'note');
  const seq = notes.concat(rest_);
  for(const it of seq){
    let bx = 0, by = 0, ba = 0, bs = -Infinity;
    for(let tr = 0; tr < 40; tr++){
      const a = (rnd() * 2 - 1) * Math.PI;
      const ab = aabb(it, 0, 0, a), hw = ab[2], hh = ab[3];
      const x = play.x0 + hw + rnd() * Math.max(1, play.x1 - play.x0 - 2 * hw);
      const y = play.y0 + hh + rnd() * Math.max(1, play.y1 - play.y0 - 2 * hh);
      let score = 1e9;
      for(const p of placed){
        const d = Math.hypot(p[0] - x, p[1] - y) - (p[2] + Math.min(hw, hh) + Math.max(hw, hh)) * .5;
        if(d < score) score = d;
      }
      if(isAligned(a)) score -= 50;
      if(score > bs){ bs = score; bx = x; by = y; ba = a; }
      if(score > u * 1.2) break;
    }
    const ab = aabb(it, 0, 0, ba);
    placed.push([bx, by, Math.max(ab[2], ab[3])]);
    if(first){ it.x = bx; it.y = by; it.a = ba; it.anim = null; }
    else {
      if(it.anim) busy--;
      animTo(it, bx, by, ba, rnd() * 140, RM ? 260 : 560 + rnd() * 160, 'scatter');
    }
  }
  items = seq;
  knolled = false;
  if(!first){ sWhoosh(); J.buzz(14); }
  dirty = true;
}
function snapDrop(it){
  const a = Math.round(it.a / HP) * HP;
  const [bw, bh] = dims(it, a);
  let x = gx0 + Math.round((it.x - bw / 2 - gx0) / u) * u + bw / 2;
  let y = gy0 + Math.round((it.y - bh / 2 - gy0) / u) * u + bh / 2;
  x = clampX(x, bw); y = clampY(y, bh);
  animTo(it, x, y, a, 0, RM ? 120 : 230, 'snap');
  nudgeFrom(it);
}
function clampX(x, bw){
  const lo = play.x0 + bw / 2, hi = play.x1 - bw / 2;
  if(lo > hi) return (play.x0 + play.x1) / 2;
  let c = clamp(x, lo, hi);
  if(c !== x){ const s = c > x ? Math.ceil : Math.floor; c = gx0 + s((c - bw / 2 - gx0) / u) * u + bw / 2; }
  return c;
}
function clampY(y, bh){
  const lo = play.y0 + bh / 2, hi = play.y1 - bh / 2;
  if(lo > hi) return (play.y0 + play.y1) / 2;
  let c = clamp(y, lo, hi);
  if(c !== y){ const s = c > y ? Math.ceil : Math.floor; c = gy0 + s((c - bh / 2 - gy0) / u) * u + bh / 2; }
  return c;
}
function nudgeFrom(src){
  const queue = [[src, 0]], moved = new Set([src]);
  let ops = 0;
  while(queue.length && ops < 80){
    const [P, depth] = queue.shift();
    const [px, py, pa] = rest(P);
    const pb = aabb(P, px, py, pa), m = u * .5;
    for(const Q of items){
      if(Q === P || moved.has(Q) && Q === src) continue;
      const [qx, qy, qa] = rest(Q);
      if(!obbOverlap(P, px, py, pa, Q, qx, qy, qa, -m * .5)) continue;
      ops++;
      const qb = aabb(Q, qx, qy, qa);
      const opts = [[pb[2] + m - qb[0], 0], [pb[0] - m - qb[2], 0], [0, pb[3] + m - qb[1]], [0, pb[1] - m - qb[3]]];
      // prefer the direction pointing away from P's centre, weighted by distance
      let best = null, bs = 1e9;
      for(const o of opts){
        const d = Math.abs(o[0]) + Math.abs(o[1]);
        const away = (o[0] * (qx - px) + o[1] * (qy - py)) >= 0 ? 1 : 1.6;
        const nx = qx + o[0], ny = qy + o[1];
        const qq = aabb(Q, nx, ny, qa);
        const out = (qq[0] < play.x0 || qq[2] > play.x1 || qq[1] < play.y0 || qq[3] > play.y1) ? 3 : 1;
        const sc = d * away * out;
        if(sc < bs){ bs = sc; best = o; }
      }
      let nx = qx + best[0], ny = qy + best[1];
      if(isAligned(qa)){
        const [bw, bh] = [qb[2] - qb[0], qb[3] - qb[1]];
        const fx = (nx - bw / 2 - gx0) / u, fy = (ny - bh / 2 - gy0) / u;
        nx = gx0 + (best[0] > 0 ? Math.ceil(fx - 1e-6) : best[0] < 0 ? Math.floor(fx + 1e-6) : Math.round(fx)) * u + bw / 2;
        ny = gy0 + (best[1] > 0 ? Math.ceil(fy - 1e-6) : best[1] < 0 ? Math.floor(fy + 1e-6) : Math.round(fy)) * u + bh / 2;
      }
      const qq = aabb(Q, nx, ny, qa);
      nx += Math.max(0, play.x0 - qq[0]) - Math.max(0, qq[2] - play.x1);
      ny += Math.max(0, play.y0 - qq[1]) - Math.max(0, qq[3] - play.y1);
      if(Q.anim) busy--;
      const an = animTo(Q, nx, ny, qa, 40 + depth * 50, RM ? 140 : 260, 'nudge');
      an.quiet = true;
      sNudge(nx);
      if(depth < 3 && !moved.has(Q)){ moved.add(Q); queue.push([Q, depth + 1]); }
    }
  }
}

/* ---------- neatness ---------- */
function neatness(){
  let ok = 0;
  for(const A of items){
    if(!isAligned(A.a)) continue;
    let clear = true;
    for(const B of items){ if(B !== A && obbOverlap(A, A.x, A.y, A.a, B, B.x, B.y, B.a, .5)){ clear = false; break; } }
    if(clear) ok++;
  }
  return items.length ? Math.round(ok / items.length * 100) : 0;
}
let neat = 0;

/* ---------- background ---------- */
function drawBg(){
  bgc = document.createElement('canvas');
  bgc.width = Math.max(1, Math.round(W * k)); bgc.height = Math.max(1, Math.round(H * k));
  const g = bgc.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
  // walnut desk
  g.fillStyle = '#3a2618'; g.fillRect(0, 0, W, H);
  const r = mulberry(99);
  for(let i = 0; i < 60; i++){
    const y = r() * H, amp = 2 + r() * 6, ph = r() * 9;
    g.strokeStyle = r() < .6 ? 'rgba(20,10,4,' + (.08 + r() * .14).toFixed(3) + ')' : 'rgba(255,210,160,' + (.02 + r() * .04).toFixed(3) + ')';
    g.lineWidth = .6 + r() * 1.4; g.beginPath();
    for(let x = -10; x <= W + 20; x += 20){ const yy = y + Math.sin(x * .006 + ph) * amp; if(x < 0) g.moveTo(x, yy); else g.lineTo(x, yy); }
    g.stroke();
  }
  // mat
  const m = mat, rad = Math.min(18, u * 1.4);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
  g.fillStyle = '#1f4a45'; rr(g, m.x, m.y, m.w, m.h, rad); g.fill();
  g.restore();
  g.save(); rr(g, m.x, m.y, m.w, m.h, rad); g.clip();
  const mg = g.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h);
  mg.addColorStop(0, '#24554e'); mg.addColorStop(1, '#1a3f3b');
  g.fillStyle = mg; g.fillRect(m.x, m.y, m.w, m.h);
  // speckle
  for(let i = 0; i < m.w * m.h / 260; i++){ g.fillStyle = r() < .5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.035)'; g.fillRect(m.x + r() * m.w, m.y + r() * m.h, 1, 1); }
  // grid
  const gx = (x, strong) => { g.fillStyle = strong ? 'rgba(220,240,226,.17)' : 'rgba(220,240,226,.075)'; g.fillRect(x - .5, m.y, 1, m.h); };
  const gy = (y, strong) => { g.fillStyle = strong ? 'rgba(220,240,226,.17)' : 'rgba(220,240,226,.075)'; g.fillRect(m.x, y - .5, m.w, 1); };
  let i0 = Math.ceil((m.x - gx0) / u);
  for(let i = i0; gx0 + i * u < m.x + m.w; i++) gx(gx0 + i * u, ((i % 5) + 5) % 5 === 0);
  i0 = Math.ceil((m.y - gy0) / u);
  for(let i = i0; gy0 + i * u < m.y + m.h; i++) gy(gy0 + i * u, ((i % 5) + 5) % 5 === 0);
  // diagonal guide lines in corners, like a cutting mat
  g.strokeStyle = 'rgba(220,240,226,.06)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(m.x, m.y + m.h); g.lineTo(m.x + Math.min(m.w, m.h) * .5, m.y + m.h - Math.min(m.w, m.h) * .5); g.stroke();
  // edge ticks
  g.fillStyle = 'rgba(240,220,170,.35)';
  for(let i = Math.ceil((m.x - gx0) / u); gx0 + i * u < m.x + m.w; i++){ const L = ((i % 5) + 5) % 5 === 0 ? 7 : 3.5; g.fillRect(gx0 + i * u - .5, m.y + m.h - L, 1, L); }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; rr(g, m.x + .5, m.y + .5, m.w - 1, m.h - 1, rad); g.stroke();
  // lamp pool + vignette
  const px = W * .38, py = H * .2, R = Math.max(W, H) * .95;
  let lg = g.createRadialGradient(px, py, 0, px, py, R);
  lg.addColorStop(0, 'rgba(255,200,130,.17)'); lg.addColorStop(.4, 'rgba(255,170,100,.06)'); lg.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  lg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .62);
  lg.addColorStop(0, 'rgba(5,4,3,0)'); lg.addColorStop(1, 'rgba(5,4,3,.5)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
}

/* ---------- render ---------- */
function drawItem(it){
  const S = it.spr; if(!S) return;
  const lift = it.lift;
  const sc = 1 + lift * .07;
  const ox = u * (.18 + lift * .9), oy = u * (.3 + lift * 1.4);
  const c = Math.cos(it.a) * sc, s = Math.sin(it.a) * sc;
  ctx.setTransform(k * c, k * s, -k * s, k * c, k * (it.x + ox), k * (it.y + oy));
  ctx.globalAlpha = .34 - lift * .1;
  ctx.drawImage(S.soft, -S.sw / 2, -S.sh / 2, S.sw, S.sh);
  ctx.setTransform(k * c, k * s, -k * s, k * c, k * (it.x + u * .06), k * (it.y + u * .1));
  ctx.globalAlpha = .4 * (1 - lift * 1.2 < 0 ? 0 : 1 - lift * 1.2);
  if(ctx.globalAlpha > .01) ctx.drawImage(S.hard, -S.sw / 2, -S.sh / 2, S.sw, S.sh);
  ctx.globalAlpha = 1;
  ctx.setTransform(k * c, k * s, -k * s, k * c, k * it.x, k * it.y);
  ctx.drawImage(S.body, -S.sw / 2, -S.sh / 2, S.sw, S.sh);
}
function render(){
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if(bgc) ctx.drawImage(bgc, 0, 0);
  for(const it of items) drawItem(it);
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

/* ---------- tick ---------- */
function step(t){
  let anyAnim = false;
  for(const it of items){
    const A = it.anim;
    if(!A){ it.lift += ((drag && drag.it === it ? 1 : 0) - it.lift) * .3; if(Math.abs(it.lift) < .002) it.lift = drag && drag.it === it ? it.lift : 0; continue; }
    anyAnim = true;
    let p = (t - A.t0) / A.dur;
    if(p < 0){ continue; }
    if(p > 1) p = 1;
    let e, lift = 0;
    if(A.kind === 'knoll'){ e = easeIO(p); lift = Math.sin(Math.PI * Math.min(1, p * 1.05)) * .55; }
    else if(A.kind === 'hop'){ e = 1; lift = Math.sin(Math.PI * p) * .5; }
    else if(A.kind === 'scatter'){ e = easeOut(p); lift = Math.sin(Math.PI * p) * .35; }
    else if(A.kind === 'snap'){ e = easeOutBack(p); lift = (1 - p) * .6; }
    else { e = easeOut(p); }
    it.x = A.x0 + (A.x1 - A.x0) * e; it.y = A.y0 + (A.y1 - A.y0) * e; it.a = A.a0 + (A.a1 - A.a0) * e;
    it.lift = lift;
    if(p >= 1){
      it.x = A.x1; it.y = A.y1; it.a = wrapA(A.a1); it.lift = 0;
      if(Math.abs(it.a - Math.round(it.a / HP) * HP) < 1e-6) it.a = Math.round(it.a / HP) * HP;
      it.anim = null; busy--;
      if(A.kind === 'knoll' || A.kind === 'hop'){
        const m = step_(A.idx, A.n);
        sLand(it, m, A.kind === 'hop'); J.buzz(3);
      } else if(A.kind === 'snap'){ sLand(it, .9 + Math.random() * .2, false); J.buzz(7); }
      else if(A.kind === 'scatter'){ if(t - lastSnd > 30 && Math.random() < .5){ lastSnd = t; sLand(it, .8 + Math.random() * .4, true); } }
      saveFrac(it);
      statT = t + 60;
    }
  }
  if(endChord && t >= endChord){ endChord = 0; if(knolled) sChord(); }
  return anyAnim;
}
const step_ = (i, n) => pent(Math.round(i / Math.max(1, n - 1) * 9)) * .9;
function saveFrac(it){ it.fx = (it.x - mat.x) / mat.w; it.fy = (it.y - mat.y) / mat.h; }

/* ---------- input ---------- */
function hit(x, y){
  for(let i = items.length - 1; i >= 0; i--){
    const it = items[i];
    const dx = x - it.x, dy = y - it.y, c = Math.cos(it.a), s = Math.sin(it.a);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const hw = it.w * u / 2 + u * .3, hh = Math.max(it.h * u / 2, u * .9) + u * .3;
    if(Math.abs(lx) <= hw && Math.abs(ly) <= hh) return it;
  }
  return null;
}

J.register({
  id: 'tidy', name: '整理癖', hint: '拖一拖，或者一键整理',
  create(root){
    cobj = J.canvas(root); cv = cobj.cv; ctx = cobj.ctx;
    items = makeItems();
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); J.ac();
      if(drag) return;
      const [x, y] = J.local(e, cv);
      const it = hit(x, y);
      if(!it) return;
      try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      if(it.anim){ busy--; it.anim = null; }
      items.splice(items.indexOf(it), 1); items.push(it);
      drag = { id: e.pointerId, it, dx: it.x - x, dy: it.y - y, sx: x, sy: y };
      knolled = false;
      sLift(it); J.buzz(3);
      dirty = true;
    });
    cv.addEventListener('pointermove', e => {
      if(!drag || e.pointerId !== drag.id) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const ev = evs && evs.length ? evs[evs.length - 1] : e;
      const [x, y] = J.local(ev, cv);
      const it = drag.it;
      const ab = aabb(it, 0, 0, it.a);
      it.x = clamp(x + drag.dx, play.x0 + ab[2] * .3, play.x1 - ab[2] * .3);
      it.y = clamp(y + drag.dy, play.y0 + ab[3] * .3, play.y1 - ab[3] * .3);
      dirty = true;
    });
    const up = e => {
      if(!drag || e.pointerId !== drag.id) return;
      const it = drag.it; drag = null;
      snapDrop(it);
      dirty = true;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    try{ document.fonts && document.fonts.ready.then(() => { if(W) buildSprites(); }); }catch(e){}
  },
  resize(W2, H2){
    const first = !W;
    W = W2; H = H2;
    cobj.fit(W, H); k = cobj.k;
    const pad = W < 520 ? 8 : 12;
    mat = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
    const inset = W < 520 ? 10 : 18;
    play = { x0: mat.x + inset, y0: Math.max(mat.y + inset, 40), x1: mat.x + mat.w - inset, y1: mat.y + mat.h - inset };
    layoutChoice = chooseLayout(play.x1 - play.x0, play.y1 - play.y0);
    const cap = Math.sqrt(W * H) / 46;
    u = Math.max(4, Math.min(layoutChoice.u * .93, cap));
    gx0 = mat.x + ((mat.w - Math.floor(mat.w / u) * u) / 2);
    gy0 = mat.y + ((mat.h - Math.floor(mat.h / u) * u) / 2);
    drawBg(); buildSprites();
    if(first){ scatter(true); }
    else if(knolled){
      const T = knollTargets();
      for(const it of items){ if(it.anim){ it.anim = null; } const t = T.get(it); it.x = t[0]; it.y = t[1]; it.a = t[2]; it.lift = 0; }
      busy = 0;
    } else {
      for(const it of items){
        if(it.anim){ it.x = it.anim.x1; it.y = it.anim.y1; it.a = it.anim.a1; it.anim = null; }
        const ab = aabb(it, 0, 0, it.a);
        it.x = clamp(mat.x + it.fx * mat.w, play.x0 + ab[2], play.x1 - ab[2]);
        it.y = clamp(mat.y + it.fy * mat.h, play.y0 + ab[3], play.y1 - ab[3]);
        it.lift = 0;
      }
      busy = 0;
    }
    for(const it of items) saveFrac(it);
    neat = neatness(); J.stat();
    dirty = true;
  },
  enter(){ dirty = true; },
  tick(t){
    now = t;
    const anim = step(t);
    let lifting = false;
    for(const it of items) if(it.lift > 0) { lifting = true; break; }
    if(statT && t >= statT && !anim && !drag){ statT = 0; neat = neatness(); J.stat(); }
    if(dirty || anim || drag || lifting){ render(); dirty = false; }
  },
  key(e){ if(e.code === 'Space'){ knoll(); return true; } },
  actions: [
    { label: '一键整理', run(){ knoll(); } },
    { label: '弄乱', run(){ scatter(false); } }
  ],
  stat(){ return '整齐度 <b>' + neat + '%</b>'; }
});
})();

