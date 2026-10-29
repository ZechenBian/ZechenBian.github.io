// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* ===== fractal ===== */
/* 分形漂流 — an infinitely zoomable Mandelbrot set to stare at.
   WebGL2: perturbation theory (reference orbit in JS doubles at the view centre, float32 deltas on the GPU,
   rebasing whenever |z| < |delta| or the reference runs out), so zooms stay clean down to ~1e-12.
   Pass 1 writes the smooth iteration count, packed into RGBA8, at an adaptive resolution; pass 2 colours it every frame
   (so the palette can drift slowly without re-iterating) and cross-fades between an old and a new view.
   No WebGL2 → a low-res Canvas2D renderer in doubles. */
(() => {
const TAU = Math.PI * 2;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* curated dive targets: minibrot nuclei and well-known deep points (verified offline in double precision) */
const TARGETS = [
  { name: '海马谷',     x: -0.743643887037158704752, y: 0.131825904205311970493, s: 1.2e-11, note: 0 },
  { name: '三重螺旋',   x: -0.088824997108248857,    y: 0.65492497777859593,     s: 1.6e-11, note: 3 },
  { name: '象谷',       x: 0.28693264389504514,      y: 0.014286543904085089,    s: 4e-10,   note: 4 },
  { name: '雪花枝',     x: -0.10109636381544912,     y: 0.95628651073436577,     s: 3e-12,   note: 2 },
  { name: '四臂旋涡',   x: 0.25498704406825312,      y: -0.00056797051011024452, s: 3e-12,   note: 1 },
  { name: '星漩',       x: 0.001643721971153,        y: -0.822467633298876,      s: 1.2e-10, note: 5 },
  { name: '海马小岛',   x: -0.74364230165788592,     y: 0.13182651981259472,     s: 5e-6,    note: 3 },
  { name: '双螺旋',     x: -0.7746806106269039,      y: -0.1374168856037867,     s: 1.2e-11, note: 0 },
  { name: '费根鲍姆点', x: -1.4011138049397756,      y: 0,                       s: 1.6e-4,  note: 4 },
  { name: '涡旋',       x: -0.77639850850650016,     y: 0.13657439120337653,     s: 6e-7,    note: 2 }
];
const SCALE = [0, 2, 4, 7, 9, 12];   // pentatonic-ish semitone steps
/* palette: deep indigo → teal → pale amber → copper → plum → back. Calm, lamp-lit. */
const STOPS = [[11, 16, 38], [27, 58, 92], [44, 124, 132], [232, 198, 140], [196, 108, 48], [70, 30, 52]];

const F = {
  auto: true, gl: null, lost: false, two: false,
  x: -0.62, y: 0, s: 1.3, r: 0,                       // view: centre, half-height, rotation
  home: { x: -0.62, y: 0, s: 1.3, r: 0 },
  W: 0, H: 0, base: 1, q: .7, ema: 16, dirty: true, lastMove: 0, fullDone: false, rendered: null,
  sMin: 1.5e-12, maxItCap: 3200,
  anim: null, vel: null, wheel: null, dive: null, fade: null, ti: -1, order: [],
  pal: .47, time: 0, lastPresent: 0, toastT: 0, deepWarn: false, lastTap: null, pad: null
};
let root, cv, toast, label;
const pointers = new Map();

/* ---------- maths helpers ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function maxIt(s){ return Math.round(clamp(230 + 64 * Math.log2(1.5 / s), 230, F.maxItCap)); }
function toC(sx, sy, v = F){         // screen px → complex
  const k = 2 * v.s / F.H, px = (sx - F.W / 2) * k, py = -(sy - F.H / 2) * k;
  const c = Math.cos(v.r), sn = Math.sin(v.r);
  return [v.x + px * c - py * sn, v.y + px * sn + py * c];
}
function screenDelta(dx, dy){        // screen delta → complex delta
  const k = 2 * F.s / F.H, px = dx * k, py = -dy * k, c = Math.cos(F.r), sn = Math.sin(F.r);
  return [px * c - py * sn, px * sn + py * c];
}
function zoomAt(sx, sy, f){          // scale by f keeping screen point fixed
  const [ax, ay] = toC(sx, sy);
  F.s *= f; F.x = ax + (F.x - ax) * f; F.y = ay + (F.y - ay) * f;
}
function magnification(){ return F.home.s / F.s; }
function fmtMag(m){
  if(m < 10) return m.toFixed(1);
  if(m < 1000) return String(Math.round(m));
  const e = Math.floor(Math.log10(m)), man = m / Math.pow(10, e);
  const sup = String(e).split('').map(d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('');
  return man.toFixed(1) + '×10' + sup;
}
function setHome(){
  const asp = F.W / Math.max(1, F.H);
  if(asp < .85){ F.home = { x: -0.7, y: 0, s: Math.max(1.45, 1.36 / asp), r: -Math.PI / 2 }; }
  else F.home = { x: -0.66, y: 0, s: Math.max(1.22, 1.5 / asp), r: 0 };
}

/* ---------- palette (shared by GL and 2D) ---------- */
const GLSL_STOPS = STOPS.map(c => `vec3(${(c[0] / 255).toFixed(4)},${(c[1] / 255).toFixed(4)},${(c[2] / 255).toFixed(4)})`);
const LUT = new Uint8Array(1024 * 3);
for(let i = 0; i < 1024; i++){
  const t = i / 1024 * STOPS.length, a = Math.floor(t), f = t - a, b = (a + 1) % STOPS.length, u = f * f * (3 - 2 * f);
  for(let c = 0; c < 3; c++) LUT[i * 3 + c] = STOPS[a][c] + (STOPS[b][c] - STOPS[a][c]) * u;
}

/* ---------- reference orbit ---------- */
const REFW = 1024;
let refBuf = new Float32Array(REFW * 4 * 2), refLen = 0;
function computeRef(cx, cy, n){
  const rows = Math.ceil((n + 2) / REFW);
  if(refBuf.length < rows * REFW * 2) refBuf = new Float32Array(rows * REFW * 2);
  let zx = 0, zy = 0, i = 0;
  refBuf[0] = 0; refBuf[1] = 0;
  for(i = 1; i <= n; i++){
    const t = zx * zx - zy * zy + cx; zy = 2 * zx * zy + cy; zx = t;
    refBuf[i * 2] = zx; refBuf[i * 2 + 1] = zy;
    if(zx * zx + zy * zy > 1e8){ break; }
  }
  refLen = Math.min(i, n);
  return rows;
}

/* ================= WebGL2 renderer ================= */
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FS_ITER = `#version 300 es
precision highp float; precision highp int;
uniform highp sampler2D uRef; uniform int uRefLen, uMax; uniform vec2 uRes, uRot; uniform float uScale;
out vec4 o;
vec2 ref(int m){ return texelFetch(uRef, ivec2(m & 1023, m >> 10), 0).xy; }
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) * (2.0 * uScale / uRes.y);
  vec2 dc = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 d = vec2(0.0), Z = vec2(0.0); int m = 0; float mu = -100.0;
  for(int i = 0; i < 6000; i++){
    if(i >= uMax) break;
    vec2 a = 2.0 * Z + d;
    d = vec2(a.x * d.x - a.y * d.y, a.x * d.y + a.y * d.x) + dc;
    m++; Z = ref(m);
    vec2 z = Z + d;
    float r2 = dot(z, z);
    if(r2 > 1e8){ mu = float(i) + 2.0 - log2(0.5 * log2(r2)); break; }
    if(r2 < dot(d, d) || m >= uRefLen){ d = z; m = 0; Z = vec2(0.0); }
  }
  if(mu < -50.0){ o = vec4(0.0); return; }
  float v = floor(clamp(mu + 8.0, 0.002, 16383.0) * 1024.0 + 0.5);
  float r = floor(v / 65536.0); v -= r * 65536.0;
  float g = floor(v / 256.0); float b = v - g * 256.0;
  o = vec4(r, g, b, 255.0) / 255.0;
}`;
const FS_SHOW = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uCur, uOld; uniform vec2 uCurSz, uOldSz, uRes, uB; uniform vec4 uA; uniform float uFade, uOldZoom, uOff, uBright, uDens;
out vec4 o;
const vec3 S0 = ${GLSL_STOPS[0]}, S1 = ${GLSL_STOPS[1]}, S2 = ${GLSL_STOPS[2]}, S3 = ${GLSL_STOPS[3]}, S4 = ${GLSL_STOPS[4]}, S5 = ${GLSL_STOPS[5]};
const vec3 INSIDE = vec3(0.028, 0.032, 0.066);
vec3 pal(float t){
  t = fract(t) * 6.0; float f = fract(t); f = f * f * (3.0 - 2.0 * f);
  if(t < 1.0) return mix(S0, S1, f); if(t < 2.0) return mix(S1, S2, f); if(t < 3.0) return mix(S2, S3, f);
  if(t < 4.0) return mix(S3, S4, f); if(t < 5.0) return mix(S4, S5, f); return mix(S5, S0, f);
}
float dec(vec4 c){ if(c.a < 0.5) return -1.0; vec3 b = floor(c.rgb * 255.0 + 0.5); return (b.r * 65536.0 + b.g * 256.0 + b.b) / 1024.0 - 8.0; }
vec3 colMu(float mu){ return mu < -0.5 ? INSIDE : pal(sqrt(max(mu, 0.0) + 1.0) * uDens + uOff); }
vec3 look(sampler2D t, vec2 sz, vec2 uv){
  vec2 q = uv * sz - 0.5; vec2 i0 = floor(q); vec2 f = q - i0; ivec2 b = ivec2(i0); ivec2 mx = ivec2(sz) - 1;
  float a = dec(texelFetch(t, clamp(b, ivec2(0), mx), 0));
  float c = dec(texelFetch(t, clamp(b + ivec2(1, 0), ivec2(0), mx), 0));
  float d = dec(texelFetch(t, clamp(b + ivec2(0, 1), ivec2(0), mx), 0));
  float e = dec(texelFetch(t, clamp(b + ivec2(1, 1), ivec2(0), mx), 0));
  if(min(min(a, c), min(d, e)) > -0.5) return colMu(mix(mix(a, c, f.x), mix(d, e, f.x), f.y));
  return mix(mix(colMu(a), colMu(c), f.x), mix(colMu(d), colMu(e), f.x), f.y);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  // reproject: the stored image was iterated for a slightly different view; map this pixel into it
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0) * 2.0;
  vec2 q = vec2(uA.x * p.x + uA.y * p.y, uA.z * p.x + uA.w * p.y) + uB;
  vec2 cu = 0.5 + q * vec2(1.0 / asp, 1.0) * 0.5;
  vec3 col = look(uCur, uCurSz, cu);
  if(uFade < 0.999){ vec2 ou = 0.5 + (uv - 0.5) * uOldZoom; col = mix(look(uOld, uOldSz, ou), col, uFade); }
  vec2 vq = uv - 0.5; float vig = 1.0 - 0.38 * dot(vq, vq) * 2.0;
  col *= vig * uBright;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

const G = { prog: null, show: null, vbo: null, refTex: null, slots: [null, null], hi: null, cur: 0, hiRow: -1, hiReady: false, rows: 32 };
function compile(gl, vs, fs){
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for(let i = 0; i < n; i++){ const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
function initGL(){
  const gl = F.gl;
  G.prog = compile(gl, VS, FS_ITER); G.show = compile(gl, VS, FS_SHOW);
  G.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  G.refTex = gl.createTexture();
  G.slots = [mkSlot(), mkSlot()]; G.hi = mkSlot(); G.hiReady = false; G.hiRow = -1;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
}
function mkSlot(){
  const gl = F.gl, t = gl.createTexture(), fb = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { t, fb, w: 1, h: 1, ok: false, v: { x: 0, y: 0, s: 1, r: 0 } };
}
function slotSize(sl, w, h){
  if(sl.w === w && sl.h === h) return;
  const gl = F.gl; sl.w = w; sl.h = h;
  gl.bindTexture(gl.TEXTURE_2D, sl.t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
}
function glRef(){
  const gl = F.gl, n = maxIt(F.s), rows = computeRef(F.x, F.y, n);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.refTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, REFW, rows, 0, gl.RG, gl.FLOAT, refBuf.subarray(0, rows * REFW * 2));
  return n;
}
function glPass(sl, n, y0, y1){
  const gl = F.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, sl.fb);
  gl.viewport(0, 0, sl.w, sl.h);
  if(y0 !== undefined){ gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, sl.w, y1 - y0); }
  gl.useProgram(G.prog.p); const u = G.prog.u;
  gl.uniform1i(u.uRef, 2); gl.uniform1i(u.uRefLen, refLen); gl.uniform1i(u.uMax, n);
  gl.uniform2f(u.uRes, sl.w, sl.h); gl.uniform2f(u.uRot, Math.cos(F.r), Math.sin(F.r)); gl.uniform1f(u.uScale, F.s);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
/* live pass: whole view at a reduced resolution */
function glIterate(q){
  const sl = G.slots[G.cur];
  slotSize(sl, Math.max(8, Math.round(F.W * F.base * q)), Math.max(8, Math.round(F.H * F.base * q)));
  glPass(sl, glRef());
  sl.ok = true; setV(sl); G.hiReady = false; G.hiRow = -1;
}
/* refinement: full resolution, a few rows per frame so no single draw call is huge (GPU watchdogs, phones) */
function glRefine(){
  const hi = G.hi, w = Math.max(8, Math.round(F.W * F.base)), h = Math.max(8, Math.round(F.H * F.base));
  if(G.hiRow < 0){ slotSize(hi, w, h); G.hiRow = 0; G.hiN = glRef(); setV(hi); }
  // adapt the strip height to the frame time we are getting
  if(F.ema > 22) G.rows = Math.max(8, G.rows * .7 | 0); else if(F.ema < 17.5) G.rows = Math.min(h, (G.rows * 1.3 | 0) + 4);
  const y1 = Math.min(h, G.hiRow + G.rows);
  glPass(hi, G.hiN, G.hiRow, y1);
  G.hiRow = y1;
  if(G.hiRow >= h){ G.hiReady = true; hi.ok = true; return true; }
  return false;
}
function setV(sl){ sl.v.x = F.x; sl.v.y = F.y; sl.v.s = F.s; sl.v.r = F.r; }
/* affine map from current-view coords (units of F.s) to a slot's coords (units of its s), computed in doubles */
const AB = [1, 0, 0, 1, 0, 0];
function viewMap(v){
  const k = F.s / v.s, dr = F.r - v.r, c = Math.cos(dr) * k, sn = Math.sin(dr) * k;
  const dx = F.x - v.x, dy = F.y - v.y, cr = Math.cos(-v.r), sr = Math.sin(-v.r);
  AB[0] = c; AB[1] = -sn; AB[2] = sn; AB[3] = c;
  AB[4] = (dx * cr - dy * sr) / v.s; AB[5] = (dx * sr + dy * cr) / v.s;
  return AB;
}
function glShow(fadeW, oldZoom, bright){
  const gl = F.gl, cur = G.hiReady ? G.hi : G.slots[G.cur], old = G.slots[1 - G.cur];
  gl.viewport(0, 0, cv.width, cv.height);
  gl.useProgram(G.show.p); const u = G.show.u;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.t);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, old.t);
  gl.uniform1i(u.uCur, 0); gl.uniform1i(u.uOld, 1);
  gl.uniform2f(u.uCurSz, cur.w, cur.h); gl.uniform2f(u.uOldSz, old.w, old.h); gl.uniform2f(u.uRes, cv.width, cv.height);
  gl.uniform1f(u.uFade, old.ok ? fadeW : 1); gl.uniform1f(u.uOldZoom, oldZoom); gl.uniform1f(u.uOff, F.pal);
  gl.uniform1f(u.uBright, bright); gl.uniform1f(u.uDens, .34);
  const m = viewMap(cur.v); gl.uniform4f(u.uA, m[0], m[1], m[2], m[3]); gl.uniform2f(u.uB, m[4], m[5]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ================= Canvas2D fallback =================
   Plain doubles (good to ~1e-13). Work is spread over frames with a time budget; whatever buffer is ready is drawn
   reprojected onto the current view, so drifting and panning stay smooth even while new pixels are being computed. */
const C2 = { ctx: null, pool: [], show: null, under: null, old: null, job: null, cpp: .004 };
function c2Buf(w, h){
  let b = C2.pool.find(b => b.w === w && b.h === h && b !== C2.show && b !== C2.old && b !== C2.under);
  if(!b){
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    b = { c, x, img: x.createImageData(w, h), mu: new Float32Array(w * h), w, h, v: { x: 0, y: 0, s: 1, r: 0 } };
    C2.pool.push(b);
    if(C2.pool.length > 6) C2.pool.splice(C2.pool.findIndex(q => q !== b && q !== C2.show && q !== C2.old && q !== C2.under), 1);
  }
  return b;
}
function c2Start(hi){
  // moving: pick a resolution that finishes in roughly ten frames at the measured cost per pixel
  const div = hi ? 2 : clamp(Math.sqrt(F.W * F.H * C2.cpp / 110), 2, 7);
  const w = Math.max(32, Math.round(F.W / div)), h = Math.max(32, Math.round(F.H / div));
  const b = c2Buf(w, h); b.v.x = F.x; b.v.y = F.y; b.v.s = F.s; b.v.r = F.r; b.hi = hi;
  C2.job = { b, row: 0, n: maxIt(F.s), hi, ms: 0 };
}
function c2Run(budget){
  const J2 = C2.job, b = J2.b, w = b.w, h = b.h, M = b.mu, n = J2.n, v = b.v;
  const k = 2 * v.s / h, co = Math.cos(v.r), si = Math.sin(v.r), t0 = performance.now();
  while(J2.row < h){
    const j = J2.row++, py = -(j + .5 - h / 2) * k;
    for(let i = 0; i < w; i++){
      const px = (i + .5 - w / 2) * k, cx = v.x + px * co - py * si, cy = v.y + px * si + py * co;
      const xq = cx - .25, qq = xq * xq + cy * cy;
      if(qq * (qq + xq) <= .25 * cy * cy || (cx + 1) * (cx + 1) + cy * cy <= .0625){ M[j * w + i] = -1; continue; }
      let zx = 0, zy = 0, it = 0, r2 = 0;
      for(; it < n; it++){ const t = zx * zx - zy * zy + cx; zy = 2 * zx * zy + cy; zx = t; r2 = zx * zx + zy * zy; if(r2 > 1e8) break; }
      M[j * w + i] = it >= n ? -1 : it + 2 - Math.log2(.5 * Math.log2(r2));
    }
    if(performance.now() - t0 > budget) break;
  }
  J2.ms += performance.now() - t0;
  if(J2.row >= h){ C2.cpp = C2.cpp * .6 + .4 * J2.ms / (w * h); c2Color(b); if(C2.show && C2.show !== b) C2.under = C2.show; C2.show = b; C2.job = null; return true; }
  return false;
}
function c2Color(b){
  const d = b.img.data, M = b.mu;
  for(let p = 0, o = 0; p < M.length; p++, o += 4){
    const mu = M[p];
    if(mu < 0){ d[o] = 7; d[o + 1] = 8; d[o + 2] = 17; }
    else { const li = ((((Math.sqrt(mu + 1) * .34 + F.pal) % 1) * 1024) | 0) * 3; d[o] = LUT[li]; d[o + 1] = LUT[li + 1]; d[o + 2] = LUT[li + 2]; }
    d[o + 3] = 255;
  }
  b.x.putImageData(b.img, 0, 0);
}
function c2Draw(x, b, W, H){
  // map buffer pixels (of view b.v) onto the current view
  const v = b.v, h = H / 2, s = 2 / b.h, kk = v.s / F.s, dr = v.r - F.r;
  const a = kk * Math.cos(dr), bb = kk * Math.sin(dr);
  const ex = v.x - F.x, ey = v.y - F.y, cr = Math.cos(-F.r), sr = Math.sin(-F.r);
  const dx = (ex * cr - ey * sr) / F.s, dy = (ex * sr + ey * cr) / F.s;
  const ox = -b.w / b.h, oy = 1;
  const qx = a * ox - bb * oy + dx, qy = bb * ox + a * oy + dy;
  x.setTransform(h * a * s, -h * bb * s, h * bb * s, h * a * s, W / 2 + h * qx, H / 2 - h * qy);
  x.drawImage(b.c, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
}
function c2Show(fadeW, oldZoom, bright){
  const x = C2.ctx, W = cv.width, H = cv.height, cur = C2.show, old = C2.old;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1; x.fillStyle = '#07080f'; x.fillRect(0, 0, W, H);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  if(old && fadeW < .999){
    const z = 1 / oldZoom; x.drawImage(old.c, W / 2 - W * z / 2, H / 2 - H * z / 2, W * z, H * z);
    x.globalAlpha = fadeW;
  } else C2.old = null;
  if(cur){ if(C2.under && fadeW >= .999) c2Draw(x, C2.under, W, H); c2Draw(x, cur, W, H); }
  x.globalAlpha = 1;
  const g = C2.vig || (C2.vig = (() => { const r = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.hypot(W, H) * .55);
    r.addColorStop(0, 'rgba(7,8,15,0)'); r.addColorStop(1, 'rgba(7,8,15,.42)'); return r; })());
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}
function c2Tick(now){
  const moved = F.needIter;
  if(moved){ F.needIter = false; F.fullDone = false; if(C2.job && C2.job.hi && (F.vel || pointers.size || F.wheel)) C2.job = null; }
  if(!C2.job && !F.fullDone){
    const v = C2.show && C2.show.v;
    const stale = !v || v.x !== F.x || v.y !== F.y || v.s !== F.s || v.r !== F.r;
    if(stale) c2Start(now - F.lastMove > 160);
    else if(C2.show.hi) F.fullDone = true;
    else c2Start(true);
  }
  if(C2.job && c2Run(11)) F.shown = false;
}

/* ---------- rendering control ---------- */
function iterate(q){ if(F.gl){ if(!F.lost) glIterate(q); } else { c2Start(false); while(C2.job) c2Run(1e9); } }
function present(){
  let fadeW = 1, oldZoom = 1, bright = 1;
  if(F.fade){ const u = clamp(F.fade.t / F.fade.dur, 0, 1); fadeW = smooth(0, 1, u); oldZoom = Math.exp(-F.fade.t * F.fade.rate); }
  if(F.gl){ if(!F.lost) glShow(fadeW, oldZoom, bright); } else c2Show(fadeW, oldZoom, bright);
}
function swapSlots(){
  if(F.gl){
    // whatever is on screen now becomes the "old" image of the cross-fade
    if(G.hiReady){ const t = G.slots[G.cur]; G.slots[G.cur] = G.hi; G.hi = t; G.hiReady = false; }
    G.cur = 1 - G.cur; G.hiRow = -1;
  }
  else { C2.old = C2.show; C2.show = null; C2.under = null; C2.job = null; }
}
function startFade(rate, dur = 1.8){
  swapSlots();
  F.fade = { t: 0, dur, rate: reduce ? 0 : rate };
  F.dirty = true; F.fullDone = false;
}

/* ---------- auto drift ---------- */
function shuffleOrder(){
  const a = TARGETS.map((_, i) => i);
  for(let i = a.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  if(a[0] === F.ti && a.length > 1) [a[0], a[1]] = [a[1], a[0]];
  F.order = a;
}
function nextTarget(){ if(!F.order.length) shuffleOrder(); return F.order.shift(); }
function startDive(fromHere){
  const ti = nextTarget(); F.ti = ti;
  const T = TARGETS[ti], sEnd = Math.max(T.s, F.sMin * 3);
  if(!fromHere){
    const s0 = Math.exp(Math.log(.006) + Math.random() * Math.log(.06 / .006));
    const a = Math.random() * TAU, off = s0 * (.25 + Math.random() * .35);
    startFade(F.dive ? F.dive.v : .2);
    F.x = T.x + Math.cos(a) * off; F.y = T.y + Math.sin(a) * off; F.s = s0;
  }
  F.dive = { T, s0: F.s, x0: F.x, y0: F.y, sEnd, t: 0, hold: 0, v: 0, vmax: reduce ? .14 : .3 + Math.random() * .08,
    spin: reduce ? 0 : (Math.random() < .5 ? -1 : 1) * (.018 + Math.random() * .02), wait: fromHere === 'first' ? 2.2 : .4 };
  showLabel(T.name);
  padNote(T.note);
}
function driftTick(dt){
  const D = F.dive; if(!D) return;
  D.t += dt;
  if(D.wait > 0){ D.wait -= dt; return; }
  const L0 = Math.log(D.s0), L1 = Math.log(D.sEnd), L = Math.log(F.s);
  const u = clamp((L0 - L) / (L0 - L1), 0, 1);
  if(u >= 1){
    D.hold += dt;
    F.r += D.spin * dt * .5; F.dirty = true;
    if(D.hold > 4.5) startDive(false);
    return;
  }
  const target = D.vmax * (.12 + .88 * smooth(0, .1, 1 - u));
  D.v += (target - D.v) * Math.min(1, dt * .8);
  const Ln = Math.max(L1, L - D.v * dt);
  F.s = Math.exp(Ln);
  const k = Math.pow(F.s / D.s0, 1.22);
  F.x = D.T.x + (D.x0 - D.T.x) * k; F.y = D.T.y + (D.y0 - D.T.y) * k;
  F.r += D.spin * dt;
  F.dirty = true;
  J.stat();
}
function setAuto(on){
  if(F.auto === on) return;
  F.auto = on;
  if(on){ F.anim = null; F.vel = null; F.wheel = null; startDive(false); }
  else { F.dive = null; hideLabel(); }
  J.acts(); J.stat();
}
function userTakesOver(){ if(F.auto) setAuto(false); F.dive = null; }

/* ---------- UI bits ---------- */
function showToast(t){ toast.textContent = t; toast.classList.add('on'); F.toastT = 2.2; }
function showLabel(t){ label.textContent = '漂向 · ' + t; label.classList.add('on'); }
function hideLabel(){ label.classList.remove('on'); }

/* ---------- sound ---------- */
let padRoot = 110;
function padNote(n){
  padRoot = 98 * Math.pow(2, SCALE[n % SCALE.length] / 12);
  const P = F.pad; if(!P) return;
  const a = P.a, t = a.currentTime;
  P.o1.frequency.setTargetAtTime(padRoot, t, 2); P.o2.frequency.setTargetAtTime(padRoot * 1.004, t, 2.2);
  P.o3.frequency.setTargetAtTime(padRoot * 1.4983, t, 2.4);
}
function padStart(){
  if(F.pad || J.muted) return;
  const a = J.ac(); if(!a) return;
  const t = a.currentTime;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(.05, t, 1.4);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 1.6;
  const lfo = a.createOscillator(); lfo.frequency.value = .045;
  const lg = a.createGain(); lg.gain.value = 330; lfo.connect(lg).connect(lp.frequency);
  const o1 = a.createOscillator(); o1.type = 'sine'; o1.frequency.value = padRoot;
  const o2 = a.createOscillator(); o2.type = 'triangle'; o2.frequency.value = padRoot * 1.004;
  const o3 = a.createOscillator(); o3.type = 'sine'; o3.frequency.value = padRoot * 1.4983;
  const g2 = a.createGain(); g2.gain.value = .55; const g3 = a.createGain(); g3.gain.value = .22;
  o1.connect(lp); o2.connect(g2).connect(lp); o3.connect(g3).connect(lp);
  lp.connect(g); g.connect(J.master);
  const r = J.reverb(); if(r){ const s = a.createGain(); s.gain.value = .5; g.connect(s).connect(r); }
  [o1, o2, o3, lfo].forEach(o => o.start(t));
  F.pad = { a, g, nodes: [o1, o2, o3, lfo], o1, o2, o3 };
}
function padStop(){
  const P = F.pad; if(!P) return; F.pad = null;
  const t = P.a.currentTime;
  P.g.gain.cancelScheduledValues(t); P.g.gain.setValueAtTime(Math.max(.0001, P.g.gain.value), t);
  P.g.gain.setTargetAtTime(.0001, t, .35);
  P.nodes.forEach(o => { try{ o.stop(t + 2); }catch(e){} });
}
function padSync(){
  const activated = navigator.userActivation ? navigator.userActivation.hasBeenActive : F.touched;
  const want = F.auto && !J.muted && activated && J.isActive('fractal') && !document.hidden;
  if(want && !F.pad) padStart(); else if(!want && F.pad) padStop();
}
function tapTone(out){
  const n = SCALE[(Math.random() * SCALE.length) | 0] + (out ? 0 : 12), f = 220 * Math.pow(2, n / 12);
  J.sfx.tone({ f, f2: out ? f * .94 : f * 1.01, peak: .07, dec: .9, att: .02, wet: .55 });
  J.sfx.tone({ f: f * 2, peak: .02, dec: .5, att: .02, wet: .6, delay: .03 });
}

/* ---------- interaction ---------- */
function animTo(x, y, s, r, dur){
  F.anim = { t: 0, dur, x0: F.x, y0: F.y, s0: F.s, r0: F.r, x1: x, y1: y, s1: s, r1: r === undefined ? F.r : r };
}
function tapZoom(sx, sy){
  const [cx, cy] = toC(sx, sy);
  const base = F.anim ? F.anim.s1 : F.s;
  F.lastTap = { t: performance.now(), sx, sy, s: base, x: F.anim ? F.anim.x1 : F.x, y: F.anim ? F.anim.y1 : F.y };
  animTo(cx, cy, base / 2.5, undefined, .95);
  tapTone(false); J.buzz(6);
}
function zoomOut(){
  const lt = F.lastTap && performance.now() - F.lastTap.t < 400 ? F.lastTap : null;
  const s0 = lt ? lt.s : (F.anim ? F.anim.s1 : F.s);
  animTo(lt ? lt.x : F.x, lt ? lt.y : F.y, Math.min(F.home.s * 3, s0 * 2.5), undefined, .9);
  F.lastTap = null;
  tapTone(true); J.buzz(6);
}
function goHome(){
  F.dive = null; F.anim = null; F.vel = null; F.wheel = null;
  startFade(0, 1.4);
  Object.assign(F, { x: F.home.x, y: F.home.y, s: F.home.s, r: F.home.r });
  if(F.auto){ F.dive = null; startDive('first'); F.dive.s0 = F.s; F.dive.x0 = F.x; F.dive.y0 = F.y; }
  J.stat();
}
function onDown(e){
  e.preventDefault(); J.ac(); F.touched = true;
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
  const [x, y] = J.local(e, cv);
  pointers.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now(), lt: performance.now(), moved: 0 });
  F.vel = null;
  if(pointers.size === 2){ for(const p of pointers.values()) p.moved = 99; }
}
function onMove(e){
  const p = pointers.get(e.pointerId); if(!p) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  const last = evs && evs.length ? evs[evs.length - 1] : e;
  const [x, y] = J.local(last, cv);
  const now = performance.now();
  if(pointers.size === 1){
    const dx = x - p.x, dy = y - p.y;
    p.moved = Math.max(p.moved, Math.hypot(x - p.x0, y - p.y0));
    if(p.moved > 7){
      if(F.auto || F.dive || F.anim){ userTakesOver(); F.anim = null; }
      const [ddx, ddy] = screenDelta(dx, dy);
      F.x -= ddx; F.y -= ddy; F.dirty = true;
      const dtp = Math.max(4, now - p.lt) / 1000;
      const vx = -ddx / dtp, vy = -ddy / dtp;
      p.vx = p.vx === undefined ? vx : p.vx * .6 + vx * .4; p.vy = p.vy === undefined ? vy : p.vy * .6 + vy * .4;
    }
  } else if(pointers.size === 2){
    userTakesOver(); F.anim = null;
    const [a, b] = [...pointers.values()];
    const ocx = (a.x + b.x) / 2, ocy = (a.y + b.y) / 2, od = Math.hypot(a.x - b.x, a.y - b.y);
    p.x = x; p.y = y;
    const ncx = (a.x + b.x) / 2, ncy = (a.y + b.y) / 2, nd = Math.hypot(a.x - b.x, a.y - b.y);
    const [ddx, ddy] = screenDelta(ncx - ocx, ncy - ocy);
    F.x -= ddx; F.y -= ddy;
    if(od > 10 && nd > 10) zoomAt(ncx, ncy, clamp(od / nd, .5, 2));
    clampScale(); F.dirty = true;
  }
  p.x = x; p.y = y; p.lt = now;
}
function onUp(e){
  const p = pointers.get(e.pointerId); if(!p) return;
  pointers.delete(e.pointerId);
  const now = performance.now();
  if(e.type === 'pointerup' && p.moved <= 7 && now - p.t0 < 350 && pointers.size === 0){
    const lt = F.lastTap;
    if(lt && now - lt.t < 330 && Math.hypot(p.x - lt.sx, p.y - lt.sy) < 40){ userTakesOver(); zoomOut(); }
    else { userTakesOver(); tapZoom(p.x, p.y); }
    return;
  }
  if(p.vx !== undefined && pointers.size === 0 && now - p.lt < 80){
    const sp = Math.hypot(p.vx, p.vy);
    if(sp > F.s * .05) F.vel = { x: p.vx, y: p.vy };
  }
}
function onWheel(e){
  e.preventDefault(); J.ac(); F.touched = true;
  userTakesOver(); F.anim = null;
  const [x, y] = J.local(e, cv);
  const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  const w = F.wheel || (F.wheel = { z: 0, x, y });
  w.z += clamp(dy, -240, 240) * .0022; w.x = x; w.y = y;
}
function clampScale(){
  if(F.s > F.home.s * 3){ const f = F.home.s * 3 / F.s; zoomAt(F.W / 2, F.H / 2, f); }
}

/* ---------- per frame ---------- */
function tick(now, dt){
  const sdt = dt / 1000;
  F.time += sdt;
  // palette breathes slowly around a calm phase (far exterior stays indigo, filaments go teal → amber)
  F.pal = .47 + (reduce ? .03 : .085) * Math.sin(F.time * .045) + .03 * Math.sin(F.time * .017 + 1);
  F.ema = F.ema * .9 + dt * .1;
  padSync();

  const before = F.x + ',' + F.y + ',' + F.s + ',' + F.r;
  if(F.auto && F.dive && !pointers.size) driftTick(sdt);
  if(F.anim){
    const A = F.anim; A.t += sdt; const u = clamp(A.t / A.dur, 0, 1), e = ease(u);
    F.s = Math.exp(Math.log(A.s0) + (Math.log(A.s1) - Math.log(A.s0)) * e);
    F.x = A.x0 + (A.x1 - A.x0) * e; F.y = A.y0 + (A.y1 - A.y0) * e; F.r = A.r0 + (A.r1 - A.r0) * e;
    if(u >= 1) F.anim = null;
    J.stat();
  }
  if(F.wheel){
    const w = F.wheel, take = w.z * (1 - Math.exp(-sdt / .07));
    w.z -= take; zoomAt(w.x, w.y, Math.exp(take));
    if(Math.abs(w.z) < 1e-4) F.wheel = null;
    clampScale(); J.stat();
  }
  if(F.vel){
    F.x += F.vel.x * sdt; F.y += F.vel.y * sdt;
    const k = Math.exp(-sdt * 3.4); F.vel.x *= k; F.vel.y *= k;
    if(Math.hypot(F.vel.x, F.vel.y) < F.s * .01) F.vel = null;
  }
  // depth limit: float precision runs out — fade and set sail again
  if(F.s < F.sMin){
    F.anim = null; F.wheel = null; F.vel = null;
    showToast('到底了，重新起航');
    if(F.auto) startDive(false);
    else { startFade(.1, 1.8); Object.assign(F, { x: F.home.x, y: F.home.y, s: F.home.s, r: F.home.r }); }
    J.stat();
  }
  if(F.fade){ F.fade.t += sdt; if(F.fade.t >= F.fade.dur) F.fade = null; }
  if(F.toastT > 0){ F.toastT -= sdt; if(F.toastT <= 0) toast.classList.remove('on'); }

  const after = F.x + ',' + F.y + ',' + F.s + ',' + F.r;
  if(after !== before || F.dirty){ F.lastMove = now; F.dirty = false; F.needIter = true; F.fullDone = false; }

  F.skip = (F.skip || 0) + 1;
  const slow = F.q <= .22 && F.ema > 30;
  if(!F.gl){ c2Tick(now); }
  else if(F.needIter && (!slow || F.skip >= 2)){
    // adapt the moving-resolution to the measured frame time
    if(F.ema > 24) F.q = Math.max(.22, F.q * .93); else if(F.ema < 18.5) F.q = Math.min(1, F.q * 1.03);
    iterate(Math.round(F.q * 20) / 20);
    F.needIter = false; F.shown = false; F.skip = 0;
  } else if(F.needIter){ F.shown = false;
  } else if(!F.fullDone && now - F.lastMove > 160){
    if(!F.lost && glRefine()){ F.fullDone = true; F.shown = false; }
  }
  // the 2D fallback bakes colours in; recolour (cheap, no iteration) now and then so the palette drift shows there too
  if(!F.gl && !C2.job && ((F.time * 2) | 0) !== F.c2tick){ F.c2tick = (F.time * 2) | 0; if(C2.show){ c2Color(C2.show); F.shown = false; } }
  if(!F.gl && (F.needIter || F.anim || F.vel || F.wheel || F.dive)) F.shown = false;
  // only redraw when something changed; when idle, a slow refresh is enough for the palette drift
  if(!F.shown || F.fade || now - F.lastPresent > 180){ present(); F.lastPresent = now; F.shown = true; }
}

J.css(`
.fractal-toast{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--display);font-size:22px;letter-spacing:.2em;color:var(--ink);
  background:rgba(18,20,28,.55);padding:10px 22px;border-radius:999px;pointer-events:none;opacity:0;transition:opacity .7s;z-index:5;white-space:nowrap}
.fractal-toast.on{opacity:1}
.fractal-label{position:absolute;left:16px;bottom:14px;color:rgba(236,230,214,.72);font-size:12px;letter-spacing:.22em;pointer-events:none;opacity:0;transition:opacity 1.6s;z-index:5;
  text-shadow:0 1px 6px rgba(0,0,0,.7)}
.fractal-label.on{opacity:1}
`);

J.register({
  id: 'fractal', name: '分形漂流', hint: '点哪里就往哪里放大，或者打开自动漂流',
  create(r){
    root = r;
    cv = document.createElement('canvas'); root.appendChild(cv);
    cv.style.cursor = 'zoom-in';
    let gl = null;
    try{ gl = cv.getContext('webgl2', { failIfMajorPerformanceCaveat: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); }catch(e){ gl = null; }
    if(gl){
      F.gl = gl;
      try{ initGL(); }catch(err){ console.warn('[fractal] WebGL2 shader failed, falling back', err); F.gl = null; }
      // software rasterisers (no GPU) get a much smaller internal resolution
      try{
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
        if(/swiftshader|llvmpipe|software|basic render/i.test(name)){ F.soft = true; F.maxItCap = 1600; }
      }catch(err){}
    }
    if(!F.gl){
      // a WebGL context may have been taken already; start over with a fresh canvas for 2D
      if(gl){ const c2 = document.createElement('canvas'); root.replaceChild(c2, cv); cv = c2; cv.style.cursor = 'zoom-in'; }
      C2.ctx = cv.getContext('2d'); F.sMin = 4e-10; F.maxItCap = 1400;
    }
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); F.lost = true; });
    cv.addEventListener('webglcontextrestored', () => {
      try{ initGL(); F.lost = false; F.dirty = true; F.fullDone = false; }catch(err){ console.warn('[fractal] restore failed', err); }
    });
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); userTakesOver(); zoomOut(); });
    toast = document.createElement('div'); toast.className = 'fractal-toast'; root.appendChild(toast);
    label = document.createElement('div'); label.className = 'fractal-label'; root.appendChild(label);
  },
  resize(W, H){
    const first = !F.W;
    F.W = W; F.H = H;
    F.base = F.soft ? .5 : Math.min(window.devicePixelRatio || 1, F.gl ? 1.5 : 1);
    C2.vig = null;
    cv.width = Math.max(1, Math.round(W * F.base)); cv.height = Math.max(1, Math.round(H * F.base));
    const oldHome = F.home.s;
    setHome();
    if(first){
      Object.assign(F, { x: F.home.x, y: F.home.y, s: F.home.s, r: F.home.r });
      if(F.auto) startDive('first');
      if(F.dive){ F.dive.s0 = F.s; F.dive.x0 = F.x; F.dive.y0 = F.y; }
    } else if(!F.auto && Math.abs(F.s - oldHome) < 1e-9){ Object.assign(F, { x: F.home.x, y: F.home.y, s: F.home.s, r: F.home.r }); }
    F.dirty = true; F.fullDone = false;
    if(F.gl ? !F.lost : true){ iterate(F.q); present(); }
  },
  enter(){ F.dirty = true; F.fullDone = false; F.shown = false; F.ema = 16; },
  leave(){ padStop(); pointers.clear(); },
  tick,
  key(e){
    if(e.code === 'Space'){ setAuto(!F.auto); return true; }
    if(e.key === '-' || e.key === '_'){ userTakesOver(); zoomOut(); return true; }
    if(e.key === '+' || e.key === '='){ userTakesOver(); tapZoom(F.W / 2, F.H / 2); return true; }
  },
  actions: [
    { label: () => F.auto ? '自动漂流：开' : '自动漂流：关', on: () => F.auto, run(){ F.touched = true; setAuto(!F.auto); } },
    { label: '回到起点', run(){ F.touched = true; goHome(); } }
  ],
  stat: () => `放大 <b>${fmtMag(magnification())}</b> 倍`
});
})();

