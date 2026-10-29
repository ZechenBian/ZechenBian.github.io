// Copyright (c) 2026 Zechen Bian. All rights reserved. 版权所有，保留所有权利。
// Not open source. See LICENSE at the repository root. 非开源，详见仓库根目录 LICENSE。
/* 深夜解压铺 — shared core. Every toy registers itself with J.register({...}). See README.md for the contract. */
window.J = (() => {
const $ = s => document.querySelector(s);
const TAU = Math.PI * 2;
const C = { bg: '#12141c', panel: '#1a1e2a', line: '#2b3042', ink: '#ece6d6', muted: '#8e91a5', accent: '#f2b56b', accentInk: '#2a1906' };

const store = {
  get(k, d){ try{ const v = localStorage.getItem('jieya:' + k); return v == null ? d : v; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('jieya:' + k, String(v)); }catch(e){} },
  getJSON(k, d){ try{ const v = localStorage.getItem('jieya:' + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  setJSON(k, v){ try{ localStorage.setItem('jieya:' + k, JSON.stringify(v)); }catch(e){} }
};
const buzz = ms => { try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} };

/* ---------- audio ---------- */
let A = null, master = null, noiseBuf = null, rev = null, voices = 0;
let muted = store.get('muted', '0') === '1';
function ac(){
  if(!A){
    try{
      A = new (window.AudioContext || window.webkitAudioContext)();
      const comp = A.createDynamicsCompressor();
      master = A.createGain(); master.gain.value = .8;
      master.connect(comp).connect(A.destination);
      noiseBuf = A.createBuffer(1, A.sampleRate * 2, A.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }catch(e){ A = null; }
  }
  if(A && A.state === 'suspended') A.resume();
  return A;
}
function env(g, t, peak, dec, att = 0.003){
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
}
function reverb(){
  const a = ac(); if(!a) return null;
  if(!rev){
    const len = a.sampleRate * 2.8, ir = a.createBuffer(2, len, a.sampleRate);
    for(let ch = 0; ch < 2; ch++){
      const d = ir.getChannelData(ch);
      for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    rev = a.createConvolver(); rev.buffer = ir;
    const wet = a.createGain(); wet.gain.value = .55;
    rev.connect(wet).connect(master);
  }
  return rev;
}
function canPlay(){
  if(muted || voices > 14) return null;
  const a = ac(); if(!a) return null;
  voices++; return a;
}
const sfx = {
  /* oscillator blip: f (Hz), f2 (end Hz, optional), type, peak (0..1), dec (s), att (s), delay (s), wet (0..1 reverb send), pan (-1..1) */
  tone({ f = 440, f2, type = 'sine', peak = .3, dec = .2, att = .003, delay = 0, wet = 0, pan = 0 } = {}){
    const a = canPlay(); if(!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if(f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + att + dec);
    const g = a.createGain(); env(g, t, peak, dec, att);
    let out = g;
    if(pan && a.createStereoPanner){ const p = a.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
    o.connect(g); out.connect(master);
    if(wet){ const r = reverb(); if(r){ const s = a.createGain(); s.gain.value = wet; out.connect(s).connect(r); } }
    o.start(t); o.stop(t + att + dec + .05);
  },
  /* filtered noise burst: type ('bandpass'|'lowpass'|'highpass'), freq, freq2 (end, optional), Q, peak, dec, att, delay, wet, pan */
  noise({ type = 'bandpass', freq = 1000, freq2, Q = 1, peak = .3, dec = .1, att = .003, delay = 0, wet = 0, pan = 0 } = {}){
    const a = canPlay(); if(!a) return;
    const t = a.currentTime + delay;
    const n = a.createBufferSource(); n.buffer = noiseBuf;
    const fl = a.createBiquadFilter(); fl.type = type; fl.Q.value = Q;
    fl.frequency.setValueAtTime(freq, t);
    if(freq2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + att + dec);
    const g = a.createGain(); env(g, t, peak, dec, att);
    let out = g;
    if(pan && a.createStereoPanner){ const p = a.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
    n.connect(fl).connect(g); out.connect(master);
    if(wet){ const r = reverb(); if(r){ const s = a.createGain(); s.gain.value = wet; out.connect(s).connect(r); } }
    n.start(t, Math.random() * 1.5); n.stop(t + att + dec + .05);
  }
};

/* ---------- helpers ---------- */
function canvas(root, { dprMax = 2, cls = '' } = {}){
  const cv = document.createElement('canvas');
  if(cls) cv.className = cls;
  root.appendChild(cv);
  const ctx = cv.getContext('2d');
  const o = { cv, ctx, W: 0, H: 0, k: 1,
    fit(W, H){
      const k = Math.min(dprMax, window.devicePixelRatio || 1);
      o.W = W; o.H = H; o.k = k;
      cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k));
      ctx.setTransform(k, 0, 0, k, 0, 0);
    } };
  return o;
}
function local(e, el){ const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function css(text){ const s = document.createElement('style'); s.textContent = text; document.head.appendChild(s); }

/* ---------- registry + shell ---------- */
const toys = [], byId = {};
let cur = null, W = 0, H = 0, statDirty = false;
const stage = $('#stage'), hint = $('#hint');
function register(t){ toys.push(t); byId[t.id] = t; }
function stat(){ statDirty = true; }
function acts(){ renderActs(); }
function renderActs(){
  const box = $('#acts'), snd = $('#snd');
  box.querySelectorAll('.act').forEach(b => b.remove());
  const list = cur && cur.actions ? cur.actions : [];
  for(const a of list){
    const b = document.createElement('button');
    b.className = 'btn act';
    b.textContent = typeof a.label === 'function' ? a.label() : a.label;
    if(a.on && a.on()) b.classList.add('on');
    b.addEventListener('click', () => { ac(); a.run(); renderActs(); stat(); });
    box.insertBefore(b, snd);
  }
}
function measure(){
  const r = stage.getBoundingClientRect();
  W = Math.round(r.width); H = Math.round(r.height);
}
function sizeCur(){
  if(!cur) return;
  if(cur._W !== W || cur._H !== H){ cur._W = W; cur._H = H; cur.resize && cur.resize(W, H); }
}
function enter(id){
  const t = byId[id] || toys[0];
  if(cur === t) return;
  if(cur){ cur.leave && cur.leave(); cur._root.hidden = true; }
  if(!t._root){
    const root = document.createElement('div');
    root.className = 'toy'; root.dataset.toy = t.id;
    stage.appendChild(root);
    t._root = root; t._W = t._H = -1;
    t.create(root);
  }
  t._root.hidden = false;
  cur = t;
  measure(); sizeCur();
  t.enter && t.enter();
  hint.textContent = t.hint || ''; hint.classList.remove('gone');
  document.querySelectorAll('.chip').forEach(c => {
    const on = c.dataset.toy === t.id;
    c.setAttribute('aria-selected', on ? 'true' : 'false');
    if(on) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  store.set('mode', t.id);
  renderActs(); statDirty = true;
}
function start(){
  const shelf = $('#shelf');
  for(const t of toys){
    const c = document.createElement('button');
    c.className = 'chip'; c.setAttribute('role', 'tab'); c.dataset.toy = t.id; c.textContent = t.name;
    c.addEventListener('click', () => enter(t.id));
    shelf.appendChild(c);
  }
  const snd = $('#snd');
  const paintSnd = () => { snd.textContent = muted ? '声音 关' : '声音 开'; snd.classList.toggle('on', !muted); snd.setAttribute('aria-pressed', String(!muted)); };
  paintSnd();
  snd.addEventListener('click', () => { muted = !muted; store.set('muted', muted ? '1' : '0'); paintSnd(); if(!muted) ac(); });
  stage.addEventListener('pointerdown', () => { hint.classList.add('gone'); }, true);
  window.addEventListener('keydown', e => {
    if(e.target && e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
    if(cur && cur.key){ ac(); if(cur.key(e) === true) e.preventDefault(); }
  });
  new ResizeObserver(() => { measure(); sizeCur(); }).observe(stage);
  measure();
  let fromHash = (location.hash || '').slice(1);
  enter(byId[fromHash] ? fromHash : store.get('mode', toys[0].id));
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(50, now - last); last = now;
    voices = 0;
    if(cur && cur.tick){
      try{ cur.tick(now, dt); }catch(err){ console.error('[' + cur.id + ']', err); }
    }
    if(statDirty){ statDirty = false; $('#stat').innerHTML = cur && cur.stat ? cur.stat() : ''; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
const isActive = t => cur === t || cur === byId[t];
const fmt = n => Math.round(n).toLocaleString('zh-CN');

return { TAU, C, store, buzz, ac, sfx, reverb, env, canvas, local, css, register, start, stat, acts, isActive, fmt,
  get muted(){ return muted; }, get master(){ ac(); return master; }, get noiseBuf(){ ac(); return noiseBuf; },
  get stage(){ return stage; }, get W(){ return W; }, get H(){ return H; }, _enter: enter };
})();

